from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Sequence

import joblib

from .training import CLASS_NAMES, FEATURE_NAMES, MODEL_PATH


class ModelArtifactNotFoundError(FileNotFoundError):
    """Raised when model training has not produced an artifact yet."""


@dataclass(frozen=True)
class ConditionPrediction:
    status: str
    confidence: float
    probabilities: dict[str, float]
    model_name: str


CONDITION_SEVERITY = {"NORMAL": 0, "WARNING": 1, "CRITICAL": 2}


def apply_machine_screening(
    machine_id: str,
    model_status: str,
    sensor_values: dict[str, float],
) -> tuple[str, list[str]]:
    if machine_id != "M-16":
        return model_status, []

    screening_status = "NORMAL"
    notes = [
        "Penyaringan M-16 adalah aturan prototipe dari rentang dataset dan "
        "spesifikasi arus yang diberikan; bukan batas keselamatan atau batas "
        "resmi pabrikan."
    ]

    temperature = sensor_values["temperature"]
    if temperature >= 38.9:
        screening_status = "CRITICAL"
        notes.append(
            f"Suhu {temperature:g} °C berada pada rentang CRITICAL dataset "
            "(≥38,9 °C)."
        )
    elif temperature >= 36.0:
        screening_status = "WARNING"
        notes.append(
            f"Suhu {temperature:g} °C berada pada rentang WARNING dataset "
            "(36,0–38,8 °C)."
        )

    current = sensor_values["current"]
    if current >= 0.8:
        screening_status = "CRITICAL"
        notes.append(
            f"Arus {current:g} A mencapai ambang CRITICAL M-16 yang diberikan "
            "(≥0,8 A)."
        )
    elif current > 0.6:
        if CONDITION_SEVERITY[screening_status] < CONDITION_SEVERITY["WARNING"]:
            screening_status = "WARNING"
        notes.append(
            f"Arus {current:g} A melebihi rentang kerja normal yang diberikan "
            "(0,4–0,6 A); perlu diverifikasi."
        )
    elif current < 0.4:
        notes.append(
            f"Arus {current:g} A di bawah rentang kerja normal yang diberikan. "
            "Ini dapat terjadi saat tanpa beban atau motor tidak berjalan; "
            "status tidak diturunkan otomatis."
        )

    final_status = max(
        (model_status, screening_status),
        key=CONDITION_SEVERITY.__getitem__,
    )
    if final_status == model_status:
        notes.append(
            f"Classifier empat sensor menghasilkan {model_status}; penyaringan "
            "suhu/arus tidak menaikkan tingkat risiko."
        )
    else:
        notes.append(
            f"Status akhir dinaikkan dari {model_status} menjadi {final_status} "
            "oleh penyaringan suhu/arus M-16."
        )
    return final_status, notes


@lru_cache(maxsize=4)
def load_model(model_path: Path = MODEL_PATH) -> dict[str, Any]:
    if not model_path.is_file():
        raise ModelArtifactNotFoundError(
            f"Trained model not found at {model_path}; run "
            "'python -m app.ai.training' from the backend directory."
        )

    artifact = joblib.load(model_path)
    if not isinstance(artifact, dict) or not all(
        key in artifact
        for key in ("model", "model_name", "feature_names", "class_names")
    ):
        raise ValueError(
            f"Invalid model artifact at {model_path}; retrain the model."
        )

    if tuple(artifact["feature_names"]) != FEATURE_NAMES:
        raise ValueError(
            f"Model feature order does not match {FEATURE_NAMES}; retrain the model."
        )

    return artifact


def predict_condition(
    sensor_values: Sequence[float],
    model_path: Path = MODEL_PATH,
) -> ConditionPrediction:
    if len(sensor_values) != len(FEATURE_NAMES):
        raise ValueError(
            f"Expected {len(FEATURE_NAMES)} sensor values in this order: "
            f"{', '.join(FEATURE_NAMES)}."
        )

    artifact = load_model(model_path)
    model = artifact["model"]
    prediction = int(model.predict([list(sensor_values)])[0])
    class_probabilities = model.predict_proba([list(sensor_values)])[0]
    probabilities = {
        CLASS_NAMES[int(class_id)]: float(probability)
        for class_id, probability in zip(model.classes_, class_probabilities)
    }

    if prediction not in CLASS_NAMES:
        raise ValueError(f"Model returned unsupported condition class {prediction}.")

    return ConditionPrediction(
        status=CLASS_NAMES[prediction],
        confidence=probabilities[CLASS_NAMES[prediction]],
        probabilities=probabilities,
        model_name=artifact["model_name"],
    )
