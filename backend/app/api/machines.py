from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database.connection import get_db
from ..models.machine import Machine, Telemetry, Alert, RcaResult, Intervention
from ..mqtt.client import mqtt_client, ESP_MACHINE_ID
from pydantic import BaseModel
from typing import List, Optional
import datetime

router = APIRouter()

class MachineResponse(BaseModel):
    id: str
    name: str
    type: str
    line: str
    area: str
    status: str
    health_score: int
    data_source: str
    mqtt_status: str

    class Config:
        from_attributes = True

@router.get("/machines", response_model=List[MachineResponse])
def get_machines(db: Session = Depends(get_db)):
    machines = db.query(Machine).all()
    for machine in machines:
        latest = (
            db.query(Telemetry)
            .filter(Telemetry.machine_id == machine.id)
            .order_by(Telemetry.timestamp.desc())
            .first()
        )
        if latest and machine.id == ESP_MACHINE_ID:
            machine.status = mqtt_client.get_machine_status(
                None,
                latest.temperature or 0.0,
                latest.vibration or 0.0,
                latest.current or 0.0,
                latest.rpm or 0.0,
            )
            machine.data_source = "MQTT"
            machine.mqtt_status = "CONNECTED"
            machine.health_score = mqtt_client.calculate_health_score(
                latest.temperature or 0.0,
                latest.vibration or 0.0,
                latest.current or 0.0,
                latest.rpm or 0.0,
            )
    return machines

@router.get("/machines/{machine_id}", response_model=MachineResponse)
def get_machine(machine_id: str, db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    if machine.id == ESP_MACHINE_ID:
        latest = (
            db.query(Telemetry)
            .filter(Telemetry.machine_id == machine.id)
            .order_by(Telemetry.timestamp.desc())
            .first()
        )
        if latest:
            machine.status = mqtt_client.get_machine_status(
                None,
                latest.temperature or 0.0,
                latest.vibration or 0.0,
                latest.current or 0.0,
                latest.rpm or 0.0,
            )
            machine.health_score = mqtt_client.calculate_health_score(
                latest.temperature or 0.0,
                latest.vibration or 0.0,
                latest.current or 0.0,
                latest.rpm or 0.0,
            )
    return machine

@router.get("/machines/{machine_id}/telemetry")
def get_telemetry(machine_id: str, limit: int = 100, db: Session = Depends(get_db)):
    tel = db.query(Telemetry).filter(Telemetry.machine_id == machine_id).order_by(Telemetry.timestamp.desc()).limit(limit).all()
    # Reverse to send chronological order
    return tel[::-1]

class InterventionRequest(BaseModel):
    target_rpm: float
    reason: str

@router.post("/machines/{machine_id}/intervention")
def trigger_intervention(machine_id: str, req: InterventionRequest, db: Session = Depends(get_db)):
    intervention = Intervention(
        id=f"INT-{int(datetime.datetime.utcnow().timestamp())}",
        machine_id=machine_id,
        action=req.reason,
        target_value=req.target_rpm,
        status="PENDING"
    )
    db.add(intervention)
    db.commit()
    db.refresh(intervention)
    if machine_id == ESP_MACHINE_ID:
        mqtt_client.publish_command(machine_id, req.target_rpm, req.reason)
    return {"status": "success", "intervention_id": intervention.id}
