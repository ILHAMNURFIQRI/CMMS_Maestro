import math
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator
from pymongo import DESCENDING
from pymongo.database import Database

from ..auth import require_roles
from ..database.connection import get_db

router = APIRouter()

INITIAL_PRODUCTS = [
    {
        "_id": "PRD-001",
        "name": "Conveyor Roller",
        "category": "Conveyor Parts",
        "unit": "pcs",
        "finished_goods_on_hand": 240,
        "production_rate_per_hour": 40,
        "active": True,
    },
    {
        "_id": "PRD-002",
        "name": "Mounting Bracket",
        "category": "Metal Components",
        "unit": "pcs",
        "finished_goods_on_hand": 520,
        "production_rate_per_hour": 80,
        "active": True,
    },
    {
        "_id": "PRD-003",
        "name": "Drive Pulley",
        "category": "Conveyor Parts",
        "unit": "pcs",
        "finished_goods_on_hand": 90,
        "production_rate_per_hour": 20,
        "active": True,
    },
]

OrderStatus = Literal[
    "DRAFT",
    "SUBMITTED",
    "REVISION_REQUESTED",
    "REJECTED",
    "APPROVED",
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETED",
]


class OrderLineInput(BaseModel):
    product_id: str = Field(min_length=1, max_length=30)
    quantity: int = Field(ge=1, le=100_000)


class OrderDetailsInput(BaseModel):
    items: list[OrderLineInput] = Field(min_length=1, max_length=20)
    target_at: datetime
    notes: str = Field(default="", max_length=1000)

    @field_validator("target_at")
    @classmethod
    def target_must_be_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Target date and time must include a timezone")
        if value <= datetime.now(timezone.utc):
            raise ValueError("Target date and time must be in the future")
        return value

    @field_validator("notes")
    @classmethod
    def trim_notes(cls, value: str) -> str:
        return value.strip()


class ReviewRequest(BaseModel):
    decision: Literal["approve", "reject", "request_revision"]
    note: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def require_explanation_for_negative_decisions(self):
        if self.decision != "approve" and not self.note.strip():
            raise ValueError("A note is required for rejection or revision requests")
        return self


class ScheduleRequest(BaseModel):
    machine_id: Literal["M-16"]
    scheduled_start: datetime
    scheduled_end: datetime
    note: str = Field(default="", max_length=1000)

    @field_validator("scheduled_start", "scheduled_end")
    @classmethod
    def schedule_must_be_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Scheduled times must include a timezone")
        return value

    @model_validator(mode="after")
    def validate_schedule_window(self):
        now = datetime.now(timezone.utc)
        if self.scheduled_start.astimezone(timezone.utc) < now:
            raise ValueError("Schedule start must be in the future")
        if self.scheduled_end <= self.scheduled_start:
            raise ValueError("Schedule end must be after schedule start")
        if self.scheduled_end - self.scheduled_start > timedelta(days=7):
            raise ValueError("A schedule cannot exceed seven days")
        return self


class ExecutionRequest(BaseModel):
    action: Literal["start", "update", "complete"]
    machine_id: str | None = Field(default=None, min_length=1, max_length=30)
    produced_quantity: int | None = Field(default=None, ge=0, le=100_000)
    note: str = Field(default="", max_length=1000)


def seed_products(database: Database) -> None:
    for product in INITIAL_PRODUCTS:
        database.products.update_one(
            {"_id": product["_id"]},
            {"$setOnInsert": product},
            upsert=True,
        )
        stored = database.products.find_one({"_id": product["_id"]})
        if stored is not None and "finished_goods_on_hand" not in stored:
            database.products.update_one(
                {"_id": product["_id"]},
                {
                    "$set": {
                        "finished_goods_on_hand": stored.get(
                            "stock_available",
                            product["finished_goods_on_hand"],
                        )
                    },
                    "$unset": {"stock_available": ""},
                },
            )


def _serialize_product(product: dict) -> dict:
    return {
        "id": str(product["_id"]),
        "name": product["name"],
        "category": product["category"],
        "unit": product["unit"],
        "finished_goods_on_hand": product["finished_goods_on_hand"],
        "production_rate_per_hour": product["production_rate_per_hour"],
    }


def _build_order_details(details: OrderDetailsInput, database: Database) -> dict:
    lines: list[dict] = []
    estimated_hours = 0.0
    for item in details.items:
        product = database.products.find_one(
            {"_id": item.product_id, "active": True}
        )
        if product is None:
            raise HTTPException(
                status_code=422,
                detail=f"Product {item.product_id} is unavailable",
            )
        rate = product["production_rate_per_hour"]
        estimated_hours += item.quantity / rate
        lines.append(
            {
                "product_id": str(product["_id"]),
                "product_name": product["name"],
                "category": product["category"],
                "unit": product["unit"],
                "quantity": item.quantity,
                "finished_goods_on_hand_at_request": product[
                    "finished_goods_on_hand"
                ],
                "raw_material_availability": "NOT_ASSESSED",
            }
        )

    hours = max(1, math.ceil(estimated_hours))
    now = datetime.now(timezone.utc)
    estimated_completion_at = now + timedelta(hours=hours)
    target_delta = details.target_at.astimezone(timezone.utc) - now
    feasible = estimated_completion_at <= details.target_at.astimezone(timezone.utc)
    total_quantity = sum(item.quantity for item in details.items)

    return {
        "items": lines,
        "total_quantity": total_quantity,
        "target_at": details.target_at.astimezone(timezone.utc),
        "estimated_hours": hours,
        "estimated_completion_at": estimated_completion_at,
        "estimate_is_feasible": feasible,
        "estimate_summary": (
            "Target waktu terlihat cukup berdasarkan estimasi kapasitas demo."
            if feasible
            else (
                "Target waktu berisiko: kapasitas demo memperkirakan "
                f"sekitar {hours} jam, sementara waktu yang tersedia "
                f"{max(0, target_delta.total_seconds() / 3600):.1f} jam."
            )
        ),
        "notes": details.notes,
    }


def _public_order(order: dict, role: str | None = None) -> dict:
    result = dict(order)
    result["id"] = str(result.pop("_id"))
    result.pop("customer_email", None)
    result.pop("customer_id", None)
    result.pop("approved_by", None)
    result.pop("scheduled_by", None)
    if role == "operator":
        result.pop("customer_name", None)
    result["items"] = [dict(item) for item in result.get("items") or []]
    for item in result["items"]:
        if "finished_goods_on_hand_at_request" not in item:
            item["finished_goods_on_hand_at_request"] = item.pop(
                "stock_available_at_request",
                None,
            )
        else:
            item.pop("stock_available_at_request", None)
        item.setdefault("raw_material_availability", "NOT_ASSESSED")
    result["history"] = [
        {key: value for key, value in entry.items() if key != "by"}
        for entry in result.get("history") or []
    ]
    return result


def _create_order(
    details: OrderDetailsInput,
    user: dict,
    database: Database,
    initial_status: Literal["DRAFT", "SUBMITTED"],
) -> dict:
    now = datetime.now(timezone.utc)
    order_id = f"PO-{uuid4().hex[:12].upper()}"
    order = {
        "_id": order_id,
        **_build_order_details(details, database),
        "customer_id": user["id"],
        "customer_email": user["email"],
        "customer_name": user["name"],
        "status": initial_status,
        "created_at": now,
        "updated_at": now,
        "manager_note": None,
        "machine_id": None,
        "scheduled_start": None,
        "scheduled_end": None,
        "scheduled_by": None,
        "produced_quantity": 0,
        "operator_note": "",
        "history": [
            {
                "status": initial_status,
                "at": now,
                "by": user["email"],
                "note": (
                    "Permintaan disimpan sebagai draft."
                    if initial_status == "DRAFT"
                    else "Permintaan produksi dikirim."
                ),
            }
        ],
    }
    database.production_orders.insert_one(order)
    return order


def _owned_order(order_id: str, user: dict, database: Database) -> dict:
    order = database.production_orders.find_one({"_id": order_id})
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    if user["role"] == "customer" and order["customer_email"] != user["email"]:
        raise HTTPException(status_code=404, detail="Production order not found")
    return order


def _save_revision(
    order: dict,
    details: OrderDetailsInput,
    database: Database,
) -> dict:
    result = database.production_orders.update_one(
        {"_id": order["_id"], "status": "REVISION_REQUESTED"},
        {
            "$set": {
                **_build_order_details(details, database),
                "status": "SUBMITTED",
                "updated_at": datetime.now(timezone.utc),
                "manager_note": None,
            },
            "$push": {
                "history": {
                    "status": "SUBMITTED",
                    "at": datetime.now(timezone.utc),
                    "by": order["customer_email"],
                    "note": "Customer mengirim revisi.",
                }
            },
        },
    )
    if result.modified_count != 1:
        raise HTTPException(
            status_code=409,
            detail="Production order was already updated",
        )
    updated = database.production_orders.find_one({"_id": order["_id"]})
    if updated is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    return updated


@router.get("/products")
def list_products(
    _: Annotated[dict, Depends(require_roles("customer", "manager", "operator"))],
    database: Annotated[Database, Depends(get_db)],
) -> list[dict]:
    return [
        _serialize_product(product)
        for product in database.products.find({"active": True}).sort("name", 1)
    ]


@router.get("/production-orders")
def list_production_orders(
    user: Annotated[dict, Depends(require_roles("customer", "manager", "operator"))],
    database: Annotated[Database, Depends(get_db)],
) -> list[dict]:
    if user["role"] == "customer":
        query = {"customer_email": user["email"]}
    elif user["role"] == "manager":
        query = {"status": {"$ne": "DRAFT"}}
    else:
        query = {}
    if user["role"] == "operator":
        query = {"status": {"$in": ["SCHEDULED", "IN_PROGRESS", "COMPLETED"]}}
    orders = database.production_orders.find(query).sort("created_at", DESCENDING)
    result = []
    for order in orders:
        result.append(_public_order(order, user["role"]))
    return result


@router.post(
    "/production-orders",
    status_code=status.HTTP_201_CREATED,
)
def create_production_order(
    details: OrderDetailsInput,
    user: Annotated[dict, Depends(require_roles("customer"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    return _public_order(
        _create_order(details, user, database, "SUBMITTED"),
        user["role"],
    )


@router.post(
    "/production-orders/drafts",
    status_code=status.HTTP_201_CREATED,
)
def create_draft(
    details: OrderDetailsInput,
    user: Annotated[dict, Depends(require_roles("customer"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    return _public_order(_create_order(details, user, database, "DRAFT"), user["role"])


@router.patch("/production-orders/{order_id}/draft")
def update_draft(
    order_id: str,
    details: OrderDetailsInput,
    user: Annotated[dict, Depends(require_roles("customer"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = _owned_order(order_id, user, database)
    if order["status"] != "DRAFT":
        raise HTTPException(status_code=409, detail="Only a draft can be edited")
    now = datetime.now(timezone.utc)
    result = database.production_orders.update_one(
        {"_id": order_id, "customer_email": user["email"], "status": "DRAFT"},
        {
            "$set": {
                **_build_order_details(details, database),
                "updated_at": now,
            },
            "$push": {
                "history": {
                    "status": "DRAFT",
                    "at": now,
                    "by": user["email"],
                    "note": "Customer memperbarui draft.",
                }
            },
        },
    )
    if result.matched_count != 1:
        raise HTTPException(status_code=409, detail="Draft was already updated")
    updated = database.production_orders.find_one({"_id": order_id})
    if updated is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    return _public_order(updated, user["role"])


@router.post("/production-orders/{order_id}/submit")
def submit_draft(
    order_id: str,
    user: Annotated[dict, Depends(require_roles("customer"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = _owned_order(order_id, user, database)
    if order["status"] != "DRAFT":
        raise HTTPException(status_code=409, detail="Only a draft can be submitted")
    now = datetime.now(timezone.utc)
    result = database.production_orders.update_one(
        {"_id": order_id, "customer_email": user["email"], "status": "DRAFT"},
        {
            "$set": {"status": "SUBMITTED", "updated_at": now},
            "$push": {
                "history": {
                    "status": "SUBMITTED",
                    "at": now,
                    "by": user["email"],
                    "note": "Draft dikirim untuk validasi Manager.",
                }
            },
        },
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Draft was already submitted")
    return _public_order(
        database.production_orders.find_one({"_id": order_id}),
        user["role"],
    )


@router.patch("/production-orders/{order_id}/resubmit")
def resubmit_order(
    order_id: str,
    details: OrderDetailsInput,
    user: Annotated[dict, Depends(require_roles("customer"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = _owned_order(order_id, user, database)
    if order["status"] != "REVISION_REQUESTED":
        raise HTTPException(
            status_code=409,
            detail="Only orders requesting revision can be resubmitted",
        )
    return _public_order(_save_revision(order, details, database), user["role"])


@router.patch("/production-orders/{order_id}/review")
def review_order(
    order_id: str,
    request: ReviewRequest,
    user: Annotated[dict, Depends(require_roles("manager"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = database.production_orders.find_one({"_id": order_id})
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order["status"] != "SUBMITTED":
        raise HTTPException(
            status_code=409,
            detail="Only submitted orders can be reviewed",
        )

    next_status: OrderStatus = {
        "approve": "APPROVED",
        "reject": "REJECTED",
        "request_revision": "REVISION_REQUESTED",
    }[request.decision]
    now = datetime.now(timezone.utc)
    result = database.production_orders.update_one(
        {"_id": order_id, "status": "SUBMITTED"},
        {
            "$set": {
                "status": next_status,
                "manager_note": request.note.strip(),
                "updated_at": now,
                "approved_by": user["email"] if next_status == "APPROVED" else None,
            },
            "$push": {
                "history": {
                    "status": next_status,
                    "at": now,
                    "by": user["email"],
                    "note": request.note.strip(),
                }
            },
        },
    )
    if result.modified_count != 1:
        raise HTTPException(
            status_code=409,
            detail="Production order was already updated",
        )
    return _public_order(
        database.production_orders.find_one({"_id": order_id}),
        user["role"],
    )


@router.patch("/production-orders/{order_id}/schedule")
def schedule_order(
    order_id: str,
    request: ScheduleRequest,
    user: Annotated[dict, Depends(require_roles("manager"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = database.production_orders.find_one({"_id": order_id})
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order["status"] != "APPROVED":
        raise HTTPException(
            status_code=409,
            detail="Only approved orders can be scheduled",
        )
    scheduled_start = request.scheduled_start.astimezone(timezone.utc)
    scheduled_end = request.scheduled_end.astimezone(timezone.utc)
    if scheduled_end > order["target_at"]:
        raise HTTPException(
            status_code=422,
            detail="Schedule end cannot be after the customer's target",
        )

    collision = database.production_orders.find_one(
        {
            "_id": {"$ne": order_id},
            "machine_id": request.machine_id,
            "status": {"$in": ["SCHEDULED", "IN_PROGRESS"]},
            "scheduled_start": {"$lt": scheduled_end},
            "scheduled_end": {"$gt": scheduled_start},
        }
    )
    if collision is not None:
        raise HTTPException(
            status_code=409,
            detail="M-16 already has a production order in this time window",
        )

    now = datetime.now(timezone.utc)
    result = database.production_orders.update_one(
        {"_id": order_id, "status": "APPROVED"},
        {
            "$set": {
                "status": "SCHEDULED",
                "machine_id": request.machine_id,
                "scheduled_start": scheduled_start,
                "scheduled_end": scheduled_end,
                "scheduled_by": user["email"],
                "manager_note": request.note.strip() or order.get("manager_note"),
                "updated_at": now,
            },
            "$push": {
                "history": {
                    "status": "SCHEDULED",
                    "at": now,
                    "by": user["email"],
                    "note": request.note.strip() or "Jadwal produksi ditetapkan.",
                }
            },
        },
    )
    if result.modified_count != 1:
        raise HTTPException(
            status_code=409,
            detail="Production order was already updated",
        )
    return _public_order(
        database.production_orders.find_one({"_id": order_id}),
        user["role"],
    )


@router.patch("/production-orders/{order_id}/execution")
def update_execution(
    order_id: str,
    request: ExecutionRequest,
    user: Annotated[dict, Depends(require_roles("operator"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = database.production_orders.find_one({"_id": order_id})
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")

    now = datetime.now(timezone.utc)
    update: dict = {"updated_at": now}
    if request.action == "start":
        if order["status"] != "SCHEDULED":
            raise HTTPException(
                status_code=409,
                detail="Only scheduled orders can be started",
            )
        if request.machine_id != order.get("machine_id"):
            raise HTTPException(
                status_code=409,
                detail="The selected machine does not match the manager's schedule",
            )
        update.update(
            {
                "status": "IN_PROGRESS",
                "started_at": now,
                "operator_note": request.note.strip(),
            }
        )
    else:
        if order["status"] != "IN_PROGRESS":
            raise HTTPException(
                status_code=409,
                detail="Only in-progress orders can be updated",
            )
        produced = request.produced_quantity
        if produced is None or produced < order.get("produced_quantity", 0):
            raise HTTPException(
                status_code=422,
                detail="Produced quantity is required and cannot decrease",
            )
        if produced > order["total_quantity"]:
            raise HTTPException(
                status_code=422,
                detail="Produced quantity cannot exceed the order quantity",
            )
        if request.action == "complete" and produced != order["total_quantity"]:
            raise HTTPException(
                status_code=422,
                detail="Complete the full requested quantity before finishing",
            )
        next_status: OrderStatus = (
            "COMPLETED"
            if request.action == "complete"
            else "IN_PROGRESS"
        )
        update.update(
            {
                "status": next_status,
                "produced_quantity": produced,
                "operator_note": request.note.strip(),
            }
        )
        if next_status == "COMPLETED":
            update["completed_at"] = now

    result = database.production_orders.update_one(
        {"_id": order_id, "status": order["status"]},
        {
            "$set": update,
            "$push": {
                "history": {
                    "status": update.get("status", order["status"]),
                    "at": now,
                    "by": user["email"],
                    "note": request.note.strip(),
                }
            },
        },
    )
    if result.modified_count != 1:
        raise HTTPException(
            status_code=409,
            detail="Production order was already updated",
        )
    return _public_order(
        database.production_orders.find_one({"_id": order_id}),
        user["role"],
    )
