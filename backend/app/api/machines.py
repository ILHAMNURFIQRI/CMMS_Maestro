from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from pymongo import DESCENDING
from pymongo.database import Database

from ..database.connection import get_db, serialize_document
from ..mqtt.client import ESP_MACHINE_ID, mqtt_client

router = APIRouter()


class MachineResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(validation_alias="_id")
    name: str
    type: str
    line: str
    area: str
    status: str
    health_score: int
    data_source: str
    mqtt_status: str


class InterventionRequest(BaseModel):
    target_rpm: float = Field(ge=0)
    reason: str = Field(min_length=1, max_length=100)


def _machine_response(machine: dict, db: Database) -> dict:
    result = serialize_document(machine)
    if result is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    if result["_id"] == ESP_MACHINE_ID:
        latest = db.sensor_readings.find_one(
            {"machine_id": result["_id"]},
            sort=[("timestamp", DESCENDING)],
        )
        if latest:
            result["status"] = mqtt_client.get_machine_status(
                None,
                latest.get("temperature", 0.0),
                latest.get("vibration", 0.0),
                latest.get("current", 0.0),
                latest.get("rpm", 0.0),
            )
            result["data_source"] = latest.get("source", "MQTT")
            result["mqtt_status"] = "CONNECTED"
            result["health_score"] = mqtt_client.calculate_health_score(
                latest.get("temperature", 0.0),
                latest.get("vibration", 0.0),
                latest.get("current", 0.0),
                latest.get("rpm", 0.0),
            )
    return result


@router.get("/machines", response_model=list[MachineResponse])
def get_machines(db: Database = Depends(get_db)) -> list[dict]:
    return [_machine_response(machine, db) for machine in db.machines.find()]


@router.get("/machines/{machine_id}", response_model=MachineResponse)
def get_machine(machine_id: str, db: Database = Depends(get_db)) -> dict:
    machine = db.machines.find_one({"_id": machine_id})
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")
    return _machine_response(machine, db)


@router.get("/machines/{machine_id}/telemetry")
def get_telemetry(
    machine_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    db: Database = Depends(get_db),
) -> list[dict]:
    readings = (
        db.sensor_readings.find({"machine_id": machine_id})
        .sort("timestamp", DESCENDING)
        .limit(limit)
    )
    return [serialize_document(reading) for reading in reversed(list(readings))]


@router.get("/alerts")
def get_alerts(
    limit: int = Query(default=100, ge=1, le=1000),
    db: Database = Depends(get_db),
) -> list[dict]:
    alerts = db.alerts.find().sort("timestamp", DESCENDING).limit(limit)
    return [
        {**serialize_document(alert), "id": str(alert["_id"])}
        for alert in alerts
    ]


@router.get("/machines/{machine_id}/work-orders")
def get_work_orders(
    machine_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    db: Database = Depends(get_db),
) -> list[dict]:
    work_orders = (
        db.maintenance_work_orders.find({"machine_id": machine_id})
        .sort("timestamp", DESCENDING)
        .limit(limit)
    )
    return [
        {**serialize_document(work_order), "id": str(work_order["_id"])}
        for work_order in work_orders
    ]


@router.post("/machines/{machine_id}/intervention")
def trigger_intervention(
    machine_id: str,
    request: InterventionRequest,
    db: Database = Depends(get_db),
) -> dict[str, str]:
    if db.machines.find_one({"_id": machine_id}) is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    work_order_id = f"INT-{uuid4().hex[:12].upper()}"
    timestamp = datetime.now(timezone.utc)
    db.maintenance_work_orders.insert_one(
        {
            "_id": work_order_id,
            "machine_id": machine_id,
            "timestamp": timestamp,
            "action": request.reason,
            "target_value": request.target_rpm,
            "actual_value": None,
            "verified": False,
            "status": "PENDING",
        }
    )
    if machine_id == ESP_MACHINE_ID:
        mqtt_client.publish_command(
            machine_id,
            request.target_rpm,
            request.reason,
        )
    return {"status": "success", "intervention_id": work_order_id}
