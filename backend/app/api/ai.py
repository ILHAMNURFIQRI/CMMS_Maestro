from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo.database import Database

from ..auth import require_roles
from ..ai.predictor import (
    ModelArtifactNotFoundError,
    apply_machine_screening,
    predict_condition,
)
from ..ai.training import FEATURE_NAMES
from ..database.connection import get_db

router = APIRouter(
    dependencies=[Depends(require_roles("manager", "operator"))]
)


class SensorReading(BaseModel):
    machine_id: str = Field(default="M-16", min_length=1, max_length=10)
    current: float = Field(ge=0, allow_inf_nan=False)
    temperature: float = Field(ge=0, allow_inf_nan=False)
    rpm: float = Field(ge=0, allow_inf_nan=False)
    vibration: float = Field(ge=0, allow_inf_nan=False)


class ConditionPredictionResponse(BaseModel):
    status: Literal["NORMAL", "WARNING", "CRITICAL"]
    classifier_status: Literal["NORMAL", "WARNING", "CRITICAL"]
    confidence: float = Field(ge=0, le=1)
    probabilities: dict[str, float]
    features: dict[str, float]
    model: str
    decision_method: str
    decision_notes: list[str]
    evaluated_at: datetime
    sensor_reading_id: str
    prediction_id: str


@router.post("/predict", response_model=ConditionPredictionResponse)
def predict_machine_condition(
    reading: SensorReading,
    db: Database = Depends(get_db),
) -> ConditionPredictionResponse:
    if db.machines.find_one({"_id": reading.machine_id}) is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    features = {
        "current": reading.current,
        "temperature": reading.temperature,
        "rpm": reading.rpm,
        "vibration": reading.vibration,
    }

    try:
        prediction = predict_condition(
            [features[name] for name in FEATURE_NAMES]
        )
    except ModelArtifactNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    status, decision_notes = apply_machine_screening(
        reading.machine_id,
        prediction.status,
        features,
    )
    evaluated_at = datetime.now(timezone.utc)
    sensor_reading = {
        "machine_id": reading.machine_id,
        "timestamp": evaluated_at,
        "source": "MANUAL",
        "power": reading.current * 12.0,
        **features,
    }
    sensor_reading_id = str(db.sensor_readings.insert_one(sensor_reading).inserted_id)
    prediction_id = str(uuid4())
    db.predictions.insert_one(
        {
            "_id": prediction_id,
            "machine_id": reading.machine_id,
            "sensor_reading_id": sensor_reading_id,
            "model": prediction.model_name,
            "status": status,
            "classifier_status": prediction.status,
            "confidence": prediction.confidence,
            "probabilities": prediction.probabilities,
            "features": features,
            "decision_method": (
                "RandomForestClassifier + M-16 screening"
                if reading.machine_id == "M-16"
                else prediction.model_name
            ),
            "decision_notes": decision_notes,
            "evaluated_at": evaluated_at,
        }
    )
    if status in {"WARNING", "CRITICAL"}:
        db.alerts.insert_one(
            {
                "_id": f"ALT-{uuid4().hex[:12].upper()}",
                "machine_id": reading.machine_id,
                "timestamp": evaluated_at,
                "type": status,
                "severity": {"WARNING": 60, "CRITICAL": 90}[status],
                "message": (
                    f"Prediction result: {status}. Raw classifier confidence: "
                    f"{prediction.confidence:.1%}."
                ),
                "root_cause": None,
                "confidence": round(prediction.confidence * 100),
                "acknowledged": False,
                "prediction_id": prediction_id,
            }
        )

    return ConditionPredictionResponse(
        status=status,
        classifier_status=prediction.status,
        confidence=prediction.confidence,
        probabilities=prediction.probabilities,
        features=features,
        model=prediction.model_name,
        decision_method=(
            "RandomForestClassifier + M-16 screening"
            if reading.machine_id == "M-16"
            else prediction.model_name
        ),
        decision_notes=decision_notes,
        evaluated_at=evaluated_at,
        sensor_reading_id=sensor_reading_id,
        prediction_id=prediction_id,
    )


@router.get("/machines/{machine_id}/predictions")
def get_machine_predictions(
    machine_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    db: Database = Depends(get_db),
) -> list[dict]:
    predictions = (
        db.predictions.find({"machine_id": machine_id})
        .sort("evaluated_at", -1)
        .limit(limit)
    )
    return [
        {**prediction, "_id": str(prediction["_id"])}
        for prediction in predictions
    ]
