import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.database.connection import get_db
from app.main import app


class FakeCursor(list):
    def sort(self, key, direction):
        return FakeCursor(
            sorted(
                self,
                key=lambda document: document.get(key) or datetime.min.replace(
                    tzinfo=timezone.utc
                ),
                reverse=direction < 0,
            )
        )


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = list(documents or [])

    @classmethod
    def matches(cls, document, query):
        for key, expected in query.items():
            if key == "$or":
                if not any(cls.matches(document, option) for option in expected):
                    return False
                continue
            actual = document.get(key)
            if isinstance(expected, dict):
                if "$in" in expected and actual not in expected["$in"]:
                    return False
                if "$ne" in expected and actual == expected["$ne"]:
                    return False
                if "$lt" in expected and (actual is None or actual >= expected["$lt"]):
                    return False
                if "$gt" in expected and (actual is None or actual <= expected["$gt"]):
                    return False
            elif actual != expected:
                return False
        return True

    def find_one(self, query, projection=None):
        return next(
            (document for document in self.documents if self.matches(document, query)),
            None,
        )

    def find(self, query=None, projection=None):
        query = query or {}
        return FakeCursor(
            [
                document
                for document in self.documents
                if self.matches(document, query)
            ]
        )

    def insert_one(self, document):
        self.documents.append(document)
        return SimpleNamespace(inserted_id=document["_id"])

    def update_one(self, query, update):
        document = self.find_one(query)
        if document is None:
            return SimpleNamespace(matched_count=0, modified_count=0)
        document.update(update.get("$set", {}))
        for key, value in update.get("$push", {}).items():
            document.setdefault(key, []).append(value)
        for key in update.get("$unset", {}):
            document.pop(key, None)
        return SimpleNamespace(matched_count=1, modified_count=1)


class MaintenanceWorkOrderTests(unittest.TestCase):
    def setUp(self):
        self.operator = {
            "_id": "operator-1",
            "id": "operator-1",
            "email": "operator@example.test",
            "name": "Operator One",
            "role": "operator",
            "active": True,
        }
        self.manager = {
            "id": "manager-1",
            "email": "manager@example.test",
            "name": "Manager One",
            "role": "manager",
        }
        self.user = dict(self.operator)
        self.database = SimpleNamespace(
            machines=FakeCollection(
                [{"_id": "M-16", "name": "CONVEYOR-01"}]
            ),
            users=FakeCollection([self.operator]),
            maintenance_work_orders=FakeCollection(),
        )
        app.dependency_overrides[get_db] = lambda: self.database
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def use_manager(self):
        self.user.clear()
        self.user.update(self.manager)

    def use_operator(self):
        self.user.clear()
        self.user.update(self.operator)

    def create_order(self, **overrides):
        payload = {
            "machine_id": "M-16",
            "work_type": "CORRECTIVE",
            "title": "Conveyor roller vibration",
            "description": "Unusual vibration detected during operation.",
            "priority": "HIGH",
            "source_alert_id": "ALT-001",
        }
        payload.update(overrides)
        return self.client.post("/api/maintenance-work-orders", json=payload)

    def triage_and_schedule(self, order_id, start=None):
        self.use_manager()
        triaged = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/review",
            json={
                "decision": "approve",
                "priority": "URGENT",
                "note": "Check bearing and alignment.",
            },
        )
        self.assertEqual(triaged.status_code, 200)
        start = start or datetime.now(timezone.utc) + timedelta(hours=1)
        scheduled = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/schedule",
            json={
                "assigned_to_id": "operator-1",
                "scheduled_start": start.isoformat(),
                "scheduled_end": (start + timedelta(hours=2)).isoformat(),
            },
        )
        return scheduled

    def test_operator_manager_lifecycle_and_role_scoped_lists(self):
        created = self.create_order()
        self.assertEqual(created.status_code, 201)
        order_id = created.json()["id"]
        self.assertEqual(created.json()["status"], "SUBMITTED")

        self.use_manager()
        manager_list = self.client.get("/api/maintenance-work-orders")
        self.assertEqual(len(manager_list.json()), 1)

        scheduled = self.triage_and_schedule(order_id)
        self.assertEqual(scheduled.status_code, 200)
        self.assertEqual(scheduled.json()["status"], "SCHEDULED")
        self.assertEqual(scheduled.json()["assigned_to_id"], "operator-1")

        self.use_operator()
        operator_list = self.client.get("/api/maintenance-work-orders")
        self.assertEqual(len(operator_list.json()), 1)
        started = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/execution",
            json={"action": "start"},
        )
        self.assertEqual(started.json()["status"], "IN_PROGRESS")
        completed = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/execution",
            json={
                "action": "complete",
                "work_performed": "Bearing inspected and lubricated.",
                "parts_used": "Grease cartridge",
                "downtime_minutes": 30,
            },
        )
        self.assertEqual(completed.json()["status"], "PENDING_VERIFICATION")

        self.use_manager()
        closed = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/verify",
            json={"decision": "close", "note": "Inspection passed."},
        )
        self.assertEqual(closed.json()["status"], "CLOSED")
        self.assertEqual(len(closed.json()["history"]), 6)

    def test_manager_can_request_information_and_operator_can_reply(self):
        created = self.create_order()
        order_id = created.json()["id"]
        self.use_manager()
        needs_info = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/review",
            json={
                "decision": "request_info",
                "priority": "HIGH",
                "note": "Tambahkan kapan getaran mulai muncul.",
            },
        )
        self.assertEqual(needs_info.json()["status"], "NEEDS_INFO")

        self.use_operator()
        replied = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/information",
            json={"note": "Gejala dimulai pada shift pagi."},
        )
        self.assertEqual(replied.json()["status"], "SUBMITTED")
        self.assertEqual(
            replied.json()["requester_response"],
            "Gejala dimulai pada shift pagi.",
        )

    def test_unassigned_operator_cannot_read_or_execute_an_order(self):
        created = self.create_order()
        order_id = created.json()["id"]
        self.triage_and_schedule(order_id)

        self.user.clear()
        self.user.update(
            {
                "id": "operator-2",
                "email": "other@example.test",
                "name": "Other Operator",
                "role": "operator",
            }
        )
        self.assertEqual(self.client.get("/api/maintenance-work-orders").json(), [])
        execution = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/execution",
            json={"action": "start"},
        )
        self.assertEqual(execution.status_code, 404)

    def test_machine_schedule_collision_and_cancel(self):
        first = self.create_order()
        second = self.create_order(title="Conveyor alignment")
        first_id = first.json()["id"]
        second_id = second.json()["id"]
        start = datetime.now(timezone.utc) + timedelta(hours=2)
        self.assertEqual(self.triage_and_schedule(first_id, start).status_code, 200)

        self.use_manager()
        approved = self.client.patch(
            f"/api/maintenance-work-orders/{second_id}/review",
            json={"decision": "approve", "priority": "NORMAL"},
        )
        self.assertEqual(approved.status_code, 200)
        collision = self.client.patch(
            f"/api/maintenance-work-orders/{second_id}/schedule",
            json={
                "assigned_to_id": "operator-1",
                "scheduled_start": (start + timedelta(minutes=30)).isoformat(),
                "scheduled_end": (start + timedelta(hours=1)).isoformat(),
            },
        )
        self.assertEqual(collision.status_code, 409)

        cancelled = self.client.patch(
            f"/api/maintenance-work-orders/{second_id}/cancel",
            json={"note": "Duplicate request."},
        )
        self.assertEqual(cancelled.json()["status"], "CANCELLED")

    def test_operator_hold_resume_and_manager_reopen(self):
        created = self.create_order()
        order_id = created.json()["id"]
        scheduled = self.triage_and_schedule(order_id)
        self.assertEqual(scheduled.status_code, 200)

        self.use_operator()
        started = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/execution",
            json={"action": "start"},
        )
        self.assertEqual(started.json()["status"], "IN_PROGRESS")
        held = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/execution",
            json={"action": "hold", "note": "Menunggu suku cadang."},
        )
        self.assertEqual(held.json()["status"], "ON_HOLD")
        resumed = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/execution",
            json={"action": "resume"},
        )
        self.assertEqual(resumed.json()["status"], "IN_PROGRESS")
        completed = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/execution",
            json={
                "action": "complete",
                "work_performed": "Bearing replaced.",
            },
        )
        self.assertEqual(completed.json()["status"], "PENDING_VERIFICATION")

        self.use_manager()
        reopened = self.client.patch(
            f"/api/maintenance-work-orders/{order_id}/verify",
            json={"decision": "reopen", "note": "Mohon cek ulang putaran."},
        )
        self.assertEqual(reopened.json()["status"], "TRIAGED")
        self.assertIsNone(reopened.json()["assigned_to_id"])

    def test_invalid_machine_and_customer_role_are_rejected(self):
        invalid_machine = self.create_order(machine_id="UNKNOWN")
        self.assertEqual(invalid_machine.status_code, 404)
        blank_title = self.create_order(title="   ")
        self.assertEqual(blank_title.status_code, 422)
        short_title = self.create_order(title="  aa ")
        self.assertEqual(short_title.status_code, 422)

        self.user.update({"role": "customer"})
        response = self.create_order()
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
