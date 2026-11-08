import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.machines import ESP_MACHINE_ID
from app.auth import get_current_user
from app.database.connection import get_db
from app.main import app


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = list(documents or [])

    def find_one(self, query, projection=None, sort=None):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                return document
        return None

    def insert_one(self, document):
        self.documents.append(document)
        return SimpleNamespace(inserted_id=document["_id"])

    def update_one(self, query, update):
        document = self.find_one(query)
        if document is None:
            return SimpleNamespace(matched_count=0, modified_count=0)
        document.update(update.get("$set", {}))
        return SimpleNamespace(matched_count=1, modified_count=1)


class MachineInterventionTests(unittest.TestCase):
    def setUp(self):
        self.user = {
            "id": "operator-1",
            "email": "operator@example.test",
            "name": "Operator One",
            "role": "operator",
        }
        self.work_orders = FakeCollection()
        self.database = SimpleNamespace(
            machines=FakeCollection(
                [
                    {"_id": ESP_MACHINE_ID, "name": "CONVEYOR-01"},
                    {"_id": "M-01", "name": "CNC LATHE"},
                ]
            ),
            maintenance_work_orders=self.work_orders,
        )
        app.dependency_overrides[get_db] = lambda: self.database
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def test_intervention_is_limited_to_supported_machine_and_records_type(self):
        with patch(
            "app.api.machines.mqtt_client.publish_command",
            return_value=True,
        ):
            response = self.client.post(
                f"/api/machines/{ESP_MACHINE_ID}/intervention",
                json={"target_rpm": 250, "reason": "  Reduce vibration  "},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "queued")
        record = self.work_orders.documents[0]
        self.assertEqual(record["record_type"], "MACHINE_INTERVENTION")
        self.assertEqual(record["action"], "Reduce vibration")
        self.assertEqual(record["status"], "PENDING")

    def test_intervention_does_not_claim_success_when_mqtt_is_unavailable(self):
        with patch(
            "app.api.machines.mqtt_client.publish_command",
            return_value=False,
        ):
            response = self.client.post(
                f"/api/machines/{ESP_MACHINE_ID}/intervention",
                json={"target_rpm": 250, "reason": "Reduce vibration"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.work_orders.documents[0]["status"], "FAILED")

    def test_intervention_rejects_unsupported_machine_and_blank_reason(self):
        unsupported = self.client.post(
            "/api/machines/M-01/intervention",
            json={"target_rpm": 250, "reason": "Maintenance test"},
        )
        blank_reason = self.client.post(
            f"/api/machines/{ESP_MACHINE_ID}/intervention",
            json={"target_rpm": 250, "reason": "   "},
        )

        self.assertEqual(unsupported.status_code, 422)
        self.assertEqual(blank_reason.status_code, 422)
        self.assertEqual(self.work_orders.documents, [])


if __name__ == "__main__":
    unittest.main()
