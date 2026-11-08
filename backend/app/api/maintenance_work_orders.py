from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from pymongo import DESCENDING
from pymongo.database import Database

from ..auth import require_roles
from ..database.connection import get_db

router = APIRouter()

WorkOrderStatus = Literal[
    "SUBMITTED",
    "NEEDS_INFO",
    "TRIAGED",
    "SCHEDULED",
    "IN_PROGRESS",
    "ON_HOLD",
    "PENDING_VERIFICATION",
    "CLOSED",
    "REJECTED",
    "CANCELLED",
]
WorkOrderType = Literal["CORRECTIVE", "PREVENTIVE", "INSPECTION"]
WorkOrderPriority = Literal["LOW", "NORMAL", "HIGH", "URGENT"]


class WorkOrderCreate(BaseModel):
    machine_id: str = Field(min_length=1, max_length=30)
    work_type: WorkOrderType
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=5, max_length=3000)
    priority: WorkOrderPriority = "NORMAL"
    source_alert_id: str | None = Field(default=None, max_length=100)

    @field_validator("title")
    @classmethod
    def trim_title(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 3:
            raise ValueError("Title must contain at least three characters")
        return trimmed

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 5:
            raise ValueError("Description must contain at least five characters")
        return trimmed


class WorkOrderReview(BaseModel):
    decision: Literal["approve", "request_info", "reject"]
    priority: WorkOrderPriority = "NORMAL"
    note: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def require_note_when_needed(self):
        if self.decision != "approve" and not self.note.strip():
            raise ValueError("A note is required for this decision")
        return self


class WorkOrderSchedule(BaseModel):
    assigned_to_id: str = Field(min_length=1, max_length=100)
    scheduled_start: datetime
    scheduled_end: datetime
    note: str = Field(default="", max_length=1000)

    @field_validator("scheduled_start", "scheduled_end")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Scheduled times must include a timezone")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def validate_schedule(self):
        now = datetime.now(timezone.utc)
        if self.scheduled_start < now:
            raise ValueError("Schedule start must be in the future")
        if self.scheduled_end <= self.scheduled_start:
            raise ValueError("Schedule end must be after schedule start")
        if self.scheduled_end - self.scheduled_start > timedelta(days=7):
            raise ValueError("A schedule cannot exceed seven days")
        return self


class WorkOrderExecution(BaseModel):
    action: Literal["start", "update", "hold", "resume", "complete"]
    note: str = Field(default="", max_length=1000)
    work_performed: str = Field(default="", max_length=5000)
    parts_used: str = Field(default="", max_length=2000)
    downtime_minutes: int | None = Field(default=None, ge=0, le=100_000)

    @field_validator("note", "work_performed", "parts_used")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def require_action_details(self):
        if self.action == "hold" and not self.note:
            raise ValueError("A reason is required to put work on hold")
        if self.action == "complete" and not self.work_performed:
            raise ValueError("Work performed is required before requesting verification")
        return self


class WorkOrderVerification(BaseModel):
    decision: Literal["close", "reopen"]
    note: str = Field(min_length=3, max_length=1000)

    @field_validator("note")
    @classmethod
    def trim_note(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 3:
            raise ValueError("A note must contain at least three characters")
        return trimmed


class WorkOrderCancel(BaseModel):
    note: str = Field(min_length=3, max_length=1000)

    @field_validator("note")
    @classmethod
    def trim_note(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 3:
            raise ValueError("A note must contain at least three characters")
        return trimmed


def _record_type_filter() -> dict:
    return {"record_type": "MAINTENANCE_WORK_ORDER"}


def _public_work_order(document: dict) -> dict:
    result = dict(document)
    result["id"] = str(result.pop("_id"))
    result.pop("record_type", None)
    return result


def _operator_order_filter(user: dict) -> dict:
    return {
        **_record_type_filter(),
        "$or": [
            {"requested_by_id": user["id"]},
            {"assigned_to_id": user["id"]},
        ],
    }


def _find_operator(database: Database, operator_id: str) -> dict | None:
    query_id: str | ObjectId = operator_id
    if ObjectId.is_valid(operator_id):
        query_id = ObjectId(operator_id)
    operator = database.users.find_one(
        {"_id": query_id, "role": "operator", "active": True}
    )
    if operator is None and query_id != operator_id:
        operator = database.users.find_one(
            {"_id": operator_id, "role": "operator", "active": True}
        )
    return operator


def _get_visible_work_order(order_id: str, user: dict, database: Database) -> dict:
    order = database.maintenance_work_orders.find_one(
        {"_id": order_id, **_record_type_filter()}
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Maintenance Work Order not found")
    if user["role"] == "operator" and user["id"] not in {
        order.get("requested_by_id"),
        order.get("assigned_to_id"),
    }:
        raise HTTPException(status_code=404, detail="Maintenance Work Order not found")
    return order


def _append_history(order: dict, user: dict, status: str, note: str) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "$set": {"status": status, "updated_at": now},
        "$push": {
            "history": {
                "status": status,
                "at": now,
                "by_id": user["id"],
                "by_name": user["name"],
                "note": note.strip(),
            }
        },
    }


def _save_transition(
    order_id: str,
    current_status: str,
    update: dict,
    database: Database,
) -> dict:
    result = database.maintenance_work_orders.update_one(
        {
            "_id": order_id,
            "status": current_status,
            **_record_type_filter(),
        },
        update,
    )
    if result.matched_count != 1:
        raise HTTPException(
            status_code=409,
            detail="Maintenance Work Order has already changed",
        )
    updated = database.maintenance_work_orders.find_one(
        {"_id": order_id, **_record_type_filter()}
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Maintenance Work Order not found")
    return updated


@router.get("/maintenance-work-orders")
def list_maintenance_work_orders(
    user: Annotated[dict, Depends(require_roles("manager", "operator"))],
    database: Annotated[Database, Depends(get_db)],
    machine_id: str | None = None,
) -> list[dict]:
    query = (
        _record_type_filter()
        if user["role"] == "manager"
        else _operator_order_filter(user)
    )
    if machine_id:
        query["machine_id"] = machine_id
    orders = database.maintenance_work_orders.find(query).sort(
        "updated_at",
        DESCENDING,
    )
    return [_public_work_order(order) for order in orders]


@router.get("/maintenance-work-orders/operators")
def list_assignable_operators(
    _: Annotated[dict, Depends(require_roles("manager"))],
    database: Annotated[Database, Depends(get_db)],
) -> list[dict]:
    return [
        {
            "id": str(operator["_id"]),
            "name": operator["name"],
            "email": operator["email"],
        }
        for operator in database.users.find(
            {"role": "operator", "active": True},
            {"_id": 1, "name": 1, "email": 1},
        ).sort("name", 1)
    ]


@router.post("/maintenance-work-orders", status_code=201)
def create_maintenance_work_order(
    request: WorkOrderCreate,
    user: Annotated[dict, Depends(require_roles("manager", "operator"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    machine = database.machines.find_one({"_id": request.machine_id})
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")
    now = datetime.now(timezone.utc)
    order_id = f"MWO-{uuid4().hex[:12].upper()}"
    order = {
        "_id": order_id,
        "record_type": "MAINTENANCE_WORK_ORDER",
        "machine_id": request.machine_id,
        "machine_name": machine.get("name", request.machine_id),
        "work_type": request.work_type,
        "title": request.title,
        "description": request.description,
        "priority": request.priority,
        "source_alert_id": request.source_alert_id,
        "status": "SUBMITTED",
        "requested_by_id": user["id"],
        "requested_by_name": user["name"],
        "requested_by_email": user["email"],
        "assigned_to_id": None,
        "assigned_to_name": None,
        "assigned_to_email": None,
        "scheduled_start": None,
        "scheduled_end": None,
        "manager_note": "",
        "work_performed": "",
        "parts_used": "",
        "downtime_minutes": None,
        "created_at": now,
        "updated_at": now,
        "history": [
            {
                "status": "SUBMITTED",
                "at": now,
                "by_id": user["id"],
                "by_name": user["name"],
                "note": "Maintenance Work Order diajukan.",
            }
        ],
    }
    database.maintenance_work_orders.insert_one(order)
    return _public_work_order(order)


@router.patch("/maintenance-work-orders/{order_id}/review")
def review_maintenance_work_order(
    order_id: str,
    request: WorkOrderReview,
    user: Annotated[dict, Depends(require_roles("manager"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = _get_visible_work_order(order_id, user, database)
    if order["status"] not in {"SUBMITTED", "NEEDS_INFO"}:
        raise HTTPException(
            status_code=409,
            detail="Only submitted or information-requested orders can be reviewed",
        )
    next_status: WorkOrderStatus = {
        "approve": "TRIAGED",
        "request_info": "NEEDS_INFO",
        "reject": "REJECTED",
    }[request.decision]
    note = request.note.strip() or "Triage selesai; siap dijadwalkan."
    update = _append_history(order, user, next_status, note)
    update["$set"].update(
        {"priority": request.priority, "manager_note": request.note.strip()}
    )
    return _public_work_order(
        _save_transition(order_id, order["status"], update, database)
    )


@router.patch("/maintenance-work-orders/{order_id}/information")
def provide_work_order_information(
    order_id: str,
    request: WorkOrderCancel,
    user: Annotated[dict, Depends(require_roles("operator"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = _get_visible_work_order(order_id, user, database)
    if order["requested_by_id"] != user["id"] or order["status"] != "NEEDS_INFO":
        raise HTTPException(
            status_code=409,
            detail="Only the requester can provide information for this order",
        )
    update = _append_history(order, user, "SUBMITTED", request.note)
    update["$set"]["requester_response"] = request.note.strip()
    return _public_work_order(
        _save_transition(order_id, "NEEDS_INFO", update, database)
    )


@router.patch("/maintenance-work-orders/{order_id}/schedule")
def schedule_maintenance_work_order(
    order_id: str,
    request: WorkOrderSchedule,
    user: Annotated[dict, Depends(require_roles("manager"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = _get_visible_work_order(order_id, user, database)
    if order["status"] != "TRIAGED":
        raise HTTPException(status_code=409, detail="Only triaged orders can be scheduled")
    operator = _find_operator(database, request.assigned_to_id)
    if operator is None:
        raise HTTPException(status_code=422, detail="Select an active Operator account")

    collision = database.maintenance_work_orders.find_one(
        {
            "_id": {"$ne": order_id},
            **_record_type_filter(),
            "machine_id": order["machine_id"],
            "status": {"$in": ["SCHEDULED", "IN_PROGRESS", "ON_HOLD"]},
            "scheduled_start": {"$lt": request.scheduled_end},
            "scheduled_end": {"$gt": request.scheduled_start},
        }
    )
    if collision is not None:
        raise HTTPException(
            status_code=409,
            detail="This machine already has a maintenance job in that time window",
        )

    note = request.note.strip() or "Operator ditugaskan dan jadwal ditetapkan."
    update = _append_history(order, user, "SCHEDULED", note)
    update["$set"].update(
        {
            "assigned_to_id": str(operator["_id"]),
            "assigned_to_name": operator["name"],
            "assigned_to_email": operator["email"],
            "scheduled_start": request.scheduled_start,
            "scheduled_end": request.scheduled_end,
            "schedule_note": request.note.strip(),
        }
    )
    return _public_work_order(
        _save_transition(order_id, "TRIAGED", update, database)
    )


@router.patch("/maintenance-work-orders/{order_id}/execution")
def execute_maintenance_work_order(
    order_id: str,
    request: WorkOrderExecution,
    user: Annotated[dict, Depends(require_roles("operator"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = _get_visible_work_order(order_id, user, database)
    if order.get("assigned_to_id") != user["id"]:
        raise HTTPException(status_code=403, detail="This order is not assigned to you")

    transitions: dict[str, tuple[str, str]] = {
        "start": ("SCHEDULED", "IN_PROGRESS"),
        "update": ("IN_PROGRESS", "IN_PROGRESS"),
        "hold": ("IN_PROGRESS", "ON_HOLD"),
        "resume": ("ON_HOLD", "IN_PROGRESS"),
        "complete": ("IN_PROGRESS", "PENDING_VERIFICATION"),
    }
    expected_status, next_status = transitions[request.action]
    if order["status"] != expected_status:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot {request.action} an order in {order['status']} status",
        )

    note = request.note.strip()
    update = _append_history(order, user, next_status, note)
    if request.action in {"update", "complete"}:
        update["$set"].update(
            {
                "work_performed": request.work_performed
                or order.get("work_performed", ""),
                "parts_used": request.parts_used,
                "downtime_minutes": request.downtime_minutes
                if request.downtime_minutes is not None
                else order.get("downtime_minutes"),
            }
        )
    if request.action == "start":
        update["$set"]["started_at"] = datetime.now(timezone.utc)
    if request.action == "complete":
        update["$set"]["completion_requested_at"] = datetime.now(timezone.utc)
    return _public_work_order(
        _save_transition(order_id, expected_status, update, database)
    )


@router.patch("/maintenance-work-orders/{order_id}/verify")
def verify_maintenance_work_order(
    order_id: str,
    request: WorkOrderVerification,
    user: Annotated[dict, Depends(require_roles("manager"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = _get_visible_work_order(order_id, user, database)
    if order["status"] != "PENDING_VERIFICATION":
        raise HTTPException(
            status_code=409,
            detail="Only completed work awaiting verification can be reviewed",
        )
    next_status: WorkOrderStatus = (
        "CLOSED" if request.decision == "close" else "TRIAGED"
    )
    update = _append_history(order, user, next_status, request.note)
    update["$set"]["verification_note"] = request.note
    if request.decision == "reopen":
        update["$set"].update(
            {
                "assigned_to_id": None,
                "assigned_to_name": None,
                "assigned_to_email": None,
                "scheduled_start": None,
                "scheduled_end": None,
                "reopened_at": datetime.now(timezone.utc),
            }
        )
    else:
        update["$set"]["closed_at"] = datetime.now(timezone.utc)
    return _public_work_order(
        _save_transition(order_id, "PENDING_VERIFICATION", update, database)
    )


@router.patch("/maintenance-work-orders/{order_id}/cancel")
def cancel_maintenance_work_order(
    order_id: str,
    request: WorkOrderCancel,
    user: Annotated[dict, Depends(require_roles("manager"))],
    database: Annotated[Database, Depends(get_db)],
) -> dict:
    order = _get_visible_work_order(order_id, user, database)
    if order["status"] not in {
        "SUBMITTED",
        "NEEDS_INFO",
        "TRIAGED",
        "SCHEDULED",
        "ON_HOLD",
    }:
        raise HTTPException(
            status_code=409,
            detail="This work order cannot be cancelled in its current status",
        )
    update = _append_history(order, user, "CANCELLED", request.note)
    update["$set"]["cancelled_at"] = datetime.now(timezone.utc)
    return _public_work_order(
        _save_transition(order_id, order["status"], update, database)
    )
