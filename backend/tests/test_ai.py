import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from app.ai.predictor import (
    ConditionPrediction,
    ModelArtifactNotFoundError,
    apply_machine_screening,
    predict_condition,
)
from app.ai.training import DATASET_DIR, train_model
from app.api.ai import SensorReading, predict_machine_condition
from app.main import app


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = list(documents or [])

    def find_one(self, query):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                return document
        return None

    def insert_one(self, document):
        inserted_id = document.get("_id", f"fake-{len(self.documents) + 1}")
        self.documents.append({**document, "_id": inserted_id})
        return type("InsertResult", (), {"inserted_id": inserted_id})()

    def update_one(self, query, update):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                document.update(update.get("$set", {}))
                return

    def find(self, query=None):
        query = query or {}
        return [
            document
            for document in self.documents
            if all(document.get(key) == value for key, value in query.items())
        ]


class FakeDatabase:
    def __init__(self):
        self.machines = FakeCollection([{"_id": "M-16", "name": "CONVEYOR-01"}])
        self.sensor_readings = FakeCollection()
        self.predictions = FakeCollection()
        self.alerts = FakeCollection()
        self.maintenance_work_orders = FakeCollection()


class MachineConditionModelTests(unittest.TestCase):
    def test_m16_temperature_and_current_screening_only_raise_severity(self) -> None:
        status, notes = apply_machine_screening(
            "M-16",
            "NORMAL",
            {
                "current": 0.45,
                "temperature": 39.0,
                "rpm": 37.0,
                "vibration": 9.0,
            },
        )

        self.assertEqual(status, "CRITICAL")
        self.assertTrue(any("38,9 °C" in note for note in notes))
        self.assertTrue(any("bukan batas keselamatan" in note for note in notes))

    def test_m16_high_current_raises_status_and_low_current_does_not_lower_it(self) -> None:
        critical_status, _ = apply_machine_screening(
            "M-16",
            "NORMAL",
            {"current": 0.8, "temperature": 32.0, "rpm": 37.0, "vibration": 9.0},
        )
        warning_status, notes = apply_machine_screening(
            "M-16",
            "WARNING",
            {"current": 0.1, "temperature": 32.0, "rpm": 37.0, "vibration": 9.0},
        )

        self.assertEqual(critical_status, "CRITICAL")
        self.assertEqual(warning_status, "WARNING")
        self.assertTrue(any("tanpa beban" in note for note in notes))

    def test_m16_screening_boundaries_follow_dataset_and_user_ranges(self) -> None:
        cases = [
            (0.6, 35.9, "NORMAL"),
            (0.61, 35.9, "WARNING"),
            (0.4, 36.0, "WARNING"),
            (0.4, 38.8, "WARNING"),
            (0.4, 38.9, "CRITICAL"),
        ]
        for current, temperature, expected in cases:
            with self.subTest(current=current, temperature=temperature):
                status, _ = apply_machine_screening(
                    "M-16",
                    "NORMAL",
                    {
                        "current": current,
                        "temperature": temperature,
                        "rpm": 37.0,
                        "vibration": 9.0,
                    },
                )
                self.assertEqual(status, expected)

    def test_other_machines_keep_classifier_status(self) -> None:
        status, notes = apply_machine_screening(
            "M-17",
            "NORMAL",
            {"current": 1.0, "temperature": 50.0, "rpm": 0.0, "vibration": 0.0},
        )

        self.assertEqual(status, "NORMAL")
        self.assertEqual(notes, [])

    def test_training_and_prediction_use_four_sensor_features(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            model_path = Path(temporary_directory) / "condition_model.joblib"
            report = train_model(model_path=model_path)

            self.assertTrue(model_path.is_file())
            self.assertGreater(report["sample_count"], 0)
            self.assertEqual(
                set(report["class_counts"]),
                {"NORMAL", "WARNING", "CRITICAL"},
            )
            self.assertGreaterEqual(report["metrics"]["accuracy"], 0.0)
            self.assertLessEqual(report["metrics"]["accuracy"], 1.0)

            prediction = predict_condition(
                [0.45, 32.2, 40.0, 10.0],
                model_path=model_path,
            )

            self.assertIn(prediction.status, {"NORMAL", "WARNING", "CRITICAL"})
            self.assertGreaterEqual(prediction.confidence, 0.0)
            self.assertLessEqual(prediction.confidence, 1.0)
            self.assertAlmostEqual(sum(prediction.probabilities.values()), 1.0)

    def test_missing_model_returns_explicit_error(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            missing_model = Path(temporary_directory) / "missing.joblib"

            with self.assertRaises(ModelArtifactNotFoundError):
                predict_condition(
                    [0.45, 32.2, 40.0, 10.0],
                    model_path=missing_model,
                )

    def test_dataset_files_exist(self) -> None:
        for filename in ("Data_Normal.csv", "Data_Warning.csv", "Data_Kritis.csv"):
            with self.subTest(filename=filename):
                self.assertTrue((DATASET_DIR / filename).is_file())

    def test_prediction_api_returns_status_and_sensor_values(self) -> None:
        prediction = ConditionPrediction(
            status="WARNING",
            confidence=0.8,
            probabilities={"NORMAL": 0.1, "WARNING": 0.8, "CRITICAL": 0.1},
            model_name="RandomForestClassifier",
        )
        reading = SensorReading(
            current=0.45,
            temperature=36.2,
            rpm=40.0,
            vibration=10.0,
        )
        db = FakeDatabase()

        with patch("app.api.ai.predict_condition", return_value=prediction):
            response = predict_machine_condition(reading, db)

        self.assertEqual(response.status, "WARNING")
        self.assertEqual(response.classifier_status, "WARNING")
        self.assertEqual(response.features["temperature"], 36.2)
        self.assertEqual(response.model, "RandomForestClassifier")
        self.assertEqual(
            response.decision_method,
            "RandomForestClassifier + M-16 screening",
        )
        self.assertEqual(len(db.sensor_readings.documents), 1)
        self.assertEqual(db.sensor_readings.documents[0]["power"], 5.4)
        self.assertEqual(len(db.predictions.documents), 1)
        self.assertEqual(len(db.alerts.documents), 1)
        self.assertIn("/api/ai/predict", app.openapi()["paths"])

    def test_prediction_api_records_screened_status_and_model_confidence_separately(self) -> None:
        prediction = ConditionPrediction(
            status="NORMAL",
            confidence=0.3,
            probabilities={"NORMAL": 0.3, "WARNING": 0.4, "CRITICAL": 0.3},
            model_name="RandomForestClassifier",
        )
        reading = SensorReading(
            machine_id="M-16",
            current=0.8,
            temperature=32.0,
            rpm=40.0,
            vibration=10.0,
        )
        db = FakeDatabase()

        with patch("app.api.ai.predict_condition", return_value=prediction):
            response = predict_machine_condition(reading, db)

        alert = db.alerts.documents[0]
        self.assertEqual(response.status, "CRITICAL")
        self.assertEqual(response.classifier_status, "NORMAL")
        self.assertEqual(response.confidence, 0.3)
        self.assertEqual(alert["type"], "CRITICAL")
        self.assertEqual(alert["severity"], 90)
        self.assertEqual(alert["confidence"], 30)

    def test_prediction_api_explains_when_model_has_not_been_trained(self) -> None:
        reading = SensorReading(
            current=0.45,
            temperature=36.2,
            rpm=40.0,
            vibration=10.0,
        )
        db = FakeDatabase()

        with (
            patch(
                "app.api.ai.predict_condition",
                side_effect=ModelArtifactNotFoundError("model missing"),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            predict_machine_condition(reading, db)

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(db.sensor_readings.documents, [])

    def test_mqtt_telemetry_is_saved_to_sensor_readings(self) -> None:
        from app.mqtt.client import MqttClientManager

        db = FakeDatabase()
        manager = MqttClientManager()
        payload = {
            "current": 1.2,
            "temperature": 32.0,
            "vibration": 2.1,
            "rpm": 250,
            "power": 14.4,
        }

        with patch("app.mqtt.client.get_database", return_value=db):
            result = manager.store_esp_telemetry(payload)

        self.assertEqual(result["machine_id"], "M-16")
        self.assertEqual(len(db.sensor_readings.documents), 1)
        self.assertEqual(db.sensor_readings.documents[0]["source"], "MQTT")
        self.assertEqual(db.machines.documents[0]["data_source"], "MQTT")


if __name__ == "__main__":
    unittest.main()
