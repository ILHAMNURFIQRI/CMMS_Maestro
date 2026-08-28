from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database.connection import get_db
from ..models.machine import Machine, Telemetry, Alert, RcaResult, Intervention
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
    return db.query(Machine).all()

@router.get("/machines/{machine_id}", response_model=MachineResponse)
def get_machine(machine_id: str, db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
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
    # This would publish an MQTT command to M-16 or simulate for dummy machines.
    # For now, just save to DB. Real implementation will hook into mqtt_client.
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
    return {"status": "success", "intervention_id": intervention.id}
