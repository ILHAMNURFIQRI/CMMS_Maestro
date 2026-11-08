import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.production_orders import INITIAL_PRODUCTS
from app.auth import get_current_user
from app.database.connection import get_db
from app.main import app


class FakeCursor(list):
    def sort(self, key, direction):
        return FakeCursor(
            sorted(
                self,
                key=lambda document: document.get(key, ""),
                reverse=direction < 0,
            )
        )


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = list(documents or [])

    @staticmethod
    def _matches(document, query):
        for key, expected in query.items():
            actual = document.get(key)
            if isinstance(expected, dict):
                for operator, value in expected.items():
                    if operator == "$in" and actual not in value:
                        return False
                    if operator == "$ne" and actual == value:
                        return False
                    if operator == "$lt" and (actual is None or actual >= value):
                        return False
                    if operator == "$gt" and (actual is None or actual <= value):
                        return False
            elif actual != expected:
                return False
        return True

    def find_one(self, query):
        for document in self.documents:
            if self._matches(document, query):
                return document
        return None

    def find(self, query=None):
        query = query or {}
        return FakeCursor(
            [
                document
                for document in self.documents
                if self._matches(document, query)
            ]
        )

    def insert_one(self, document):
        self.documents.append(document)
        return SimpleNamespace(inserted_id=document["_id"])

    def update_one(self, query, update, upsert=False):
        document = self.find_one(query)
        if document is None:
            if upsert:
                seeded = dict(update.get("$setOnInsert", {}))
                self.documents.append(seeded)
                return SimpleNamespace(matched_count=0, modified_count=1)
            return SimpleNamespace(matched_count=0, modified_count=0)

        changes = update.get("$set", {})
        changed = any(document.get(key) != value for key, value in changes.items())
        document.update(changes)
        for key, value in update.get("$push", {}).items():
            document.setdefault(key, []).append(value)
            changed = True
        return SimpleNamespace(matched_count=1, modified_count=1 if changed else 0)


class ProductionOrderWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.user = {
            "id": "customer-1",
            "email": "customer@example.test",
            "name": "Customer One",
            "role": "customer",
        }
        self.database = SimpleNamespace(
            products=FakeCollection([dict(product) for product in INITIAL_PRODUCTS]),
            production_orders=FakeCollection(),
        )
        app.dependency_overrides[get_db] = lambda: self.database
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def test_customer_manager_operator_order_lifecycle(self):
        target_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        created = self.client.post(
            "/api/production-orders",
            json={
                "items": [{"product_id": "PRD-001", "quantity": 20}],
                "target_at": target_at,
                "notes": "Prioritas normal",
            },
        )
        self.assertEqual(created.status_code, 201)
        order_id = created.json()["id"]
        self.assertEqual(created.json()["status"], "SUBMITTED")
        self.assertTrue(created.json()["estimate_is_feasible"])
        self.assertNotIn("customer_email", created.json())
        self.assertNotIn("by", created.json()["history"][0])

        own_orders = self.client.get("/api/production-orders")
        self.assertEqual(len(own_orders.json()), 1)

        self.user.update(
            {
                "id": "manager-1",
                "email": "manager@example.test",
                "name": "Manager",
                "role": "manager",
            }
        )
        revision = self.client.patch(
            f"/api/production-orders/{order_id}/review",
            json={"decision": "request_revision", "note": "Mohon ubah jumlah."},
        )
        self.assertEqual(revision.status_code, 200)
        self.assertEqual(revision.json()["status"], "REVISION_REQUESTED")

        self.user.update(
            {
                "id": "customer-1",
                "email": "customer@example.test",
                "name": "Customer One",
                "role": "customer",
            }
        )
        resubmitted = self.client.patch(
            f"/api/production-orders/{order_id}/resubmit",
            json={
                "items": [{"product_id": "PRD-001", "quantity": 10}],
                "target_at": target_at,
                "notes": "Jumlah disesuaikan",
            },
        )
        self.assertEqual(resubmitted.status_code, 200)
        self.assertEqual(resubmitted.json()["status"], "SUBMITTED")

        self.user.update(
            {
                "id": "manager-1",
                "email": "manager@example.test",
                "name": "Manager",
                "role": "manager",
            }
        )
        approved = self.client.patch(
            f"/api/production-orders/{order_id}/review",
            json={"decision": "approve", "note": "Disetujui."},
        )
        self.assertEqual(approved.json()["status"], "APPROVED")
        scheduled_start = datetime.now(timezone.utc) + timedelta(minutes=5)
        scheduled_end = scheduled_start + timedelta(hours=2)
        scheduled = self.client.patch(
            f"/api/production-orders/{order_id}/schedule",
            json={
                "machine_id": "M-16",
                "scheduled_start": scheduled_start.isoformat(),
                "scheduled_end": scheduled_end.isoformat(),
                "note": "Jadwal shift pagi.",
            },
        )
        self.assertEqual(scheduled.status_code, 200)
        self.assertEqual(scheduled.json()["status"], "SCHEDULED")
        self.assertEqual(scheduled.json()["machine_id"], "M-16")

        self.user.update(
            {
                "id": "operator-1",
                "email": "operator@example.test",
                "name": "Operator",
                "role": "operator",
            }
        )
        operator_orders = self.client.get("/api/production-orders").json()
        self.assertEqual(len(operator_orders), 1)
        self.assertEqual(operator_orders[0]["id"], order_id)
        self.assertNotIn("customer_email", operator_orders[0])
        self.assertNotIn("customer_name", operator_orders[0])
        self.assertNotIn("by", operator_orders[0]["history"][0])
        started = self.client.patch(
            f"/api/production-orders/{order_id}/execution",
            json={"action": "start", "machine_id": "M-16"},
        )
        self.assertEqual(started.json()["status"], "IN_PROGRESS")

        completed = self.client.patch(
            f"/api/production-orders/{order_id}/execution",
            json={
                "action": "complete",
                "produced_quantity": 10,
                "note": "Produksi selesai.",
            },
        )
        self.assertEqual(completed.json()["status"], "COMPLETED")

    def test_customer_cannot_review_and_unknown_product_is_rejected(self):
        response = self.client.post(
            "/api/production-orders",
            json={
                "items": [{"product_id": "NOT-A-PRODUCT", "quantity": 1}],
                "target_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            },
        )
        self.assertEqual(response.status_code, 422)

        review = self.client.patch(
            "/api/production-orders/PO-not-found/review",
            json={"decision": "approve"},
        )
        self.assertEqual(review.status_code, 403)

    def test_review_requires_note_to_reject_or_request_revision(self):
        created = self.client.post(
            "/api/production-orders",
            json={
                "items": [{"product_id": "PRD-002", "quantity": 5}],
                "target_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            },
        )
        self.assertEqual(created.status_code, 201)
        self.user.update(
            {
                "id": "manager-1",
                "email": "manager@example.test",
                "name": "Manager",
                "role": "manager",
            }
        )
        response = self.client.patch(
            f"/api/production-orders/{created.json()['id']}/review",
            json={"decision": "reject"},
        )
        self.assertEqual(response.status_code, 422)

    def test_operator_cannot_start_before_manager_schedules_order(self):
        created = self.client.post(
            "/api/production-orders",
            json={
                "items": [{"product_id": "PRD-001", "quantity": 2}],
                "target_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            },
        )
        order_id = created.json()["id"]
        self.user.update({"role": "manager"})
        self.client.patch(
            f"/api/production-orders/{order_id}/review",
            json={"decision": "approve"},
        )
        self.user.update({"role": "operator"})
        response = self.client.patch(
            f"/api/production-orders/{order_id}/execution",
            json={"action": "start", "machine_id": "M-01"},
        )
        self.assertEqual(response.status_code, 409)

    def test_customer_can_save_edit_and_submit_a_draft(self):
        target_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        created = self.client.post(
            "/api/production-orders/drafts",
            json={
                "items": [{"product_id": "PRD-001", "quantity": 3}],
                "target_at": target_at,
                "notes": "Draft awal",
            },
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["status"], "DRAFT")
        self.assertEqual(
            created.json()["items"][0]["raw_material_availability"],
            "NOT_ASSESSED",
        )

        order_id = created.json()["id"]
        self.assertEqual(
            self.client.get("/api/production-orders").json()[0]["status"],
            "DRAFT",
        )
        self.user.update(
            {
                "id": "manager-1",
                "email": "manager@example.test",
                "name": "Manager",
                "role": "manager",
            }
        )
        self.assertEqual(self.client.get("/api/production-orders").json(), [])
        self.user.update(
            {
                "id": "customer-1",
                "email": "customer@example.test",
                "name": "Customer One",
                "role": "customer",
            }
        )
        updated = self.client.patch(
            f"/api/production-orders/{order_id}/draft",
            json={
                "items": [{"product_id": "PRD-001", "quantity": 5}],
                "target_at": target_at,
                "notes": "Jumlah diperbarui",
            },
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["total_quantity"], 5)

        submitted = self.client.post(f"/api/production-orders/{order_id}/submit")
        self.assertEqual(submitted.status_code, 200)
        self.assertEqual(submitted.json()["status"], "SUBMITTED")

        duplicate_submission = self.client.post(
            f"/api/production-orders/{order_id}/submit"
        )
        self.assertEqual(duplicate_submission.status_code, 409)

    def test_legacy_stock_snapshot_is_exposed_as_finished_goods_only(self):
        created = self.client.post(
            "/api/production-orders",
            json={
                "items": [{"product_id": "PRD-001", "quantity": 2}],
                "target_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            },
        )
        stored_order = self.database.production_orders.find_one(
            {"_id": created.json()["id"]}
        )
        item = stored_order["items"][0]
        item["stock_available_at_request"] = item.pop(
            "finished_goods_on_hand_at_request"
        )
        item.pop("raw_material_availability")

        response = self.client.get("/api/production-orders")
        serialized_item = response.json()[0]["items"][0]
        self.assertEqual(serialized_item["finished_goods_on_hand_at_request"], 240)
        self.assertEqual(serialized_item["raw_material_availability"], "NOT_ASSESSED")
        self.assertNotIn("stock_available_at_request", serialized_item)

    def test_manager_cannot_schedule_overlapping_m16_orders(self):
        order_ids = []
        target_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        for _ in range(2):
            created = self.client.post(
                "/api/production-orders",
                json={
                    "items": [{"product_id": "PRD-001", "quantity": 5}],
                    "target_at": target_at,
                },
            )
            order_ids.append(created.json()["id"])

        self.user.update({"role": "manager", "email": "manager@example.test"})
        for order_id in order_ids:
            response = self.client.patch(
                f"/api/production-orders/{order_id}/review",
                json={"decision": "approve"},
            )
            self.assertEqual(response.json()["status"], "APPROVED")

        scheduled_start = datetime.now(timezone.utc) + timedelta(minutes=10)
        schedule = {
            "machine_id": "M-16",
            "scheduled_start": scheduled_start.isoformat(),
            "scheduled_end": (scheduled_start + timedelta(hours=1)).isoformat(),
        }
        first = self.client.patch(
            f"/api/production-orders/{order_ids[0]}/schedule",
            json=schedule,
        )
        self.assertEqual(first.status_code, 200)

        overlap = self.client.patch(
            f"/api/production-orders/{order_ids[1]}/schedule",
            json=schedule,
        )
        self.assertEqual(overlap.status_code, 409)


if __name__ == "__main__":
    unittest.main()
