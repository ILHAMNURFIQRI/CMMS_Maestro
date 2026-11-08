import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.chatbot import ChatRequest, chat
from app.auth import get_current_user
from app.database.connection import get_db
from app.main import app


class FakeCursor(list):
    def sort(self, key, direction):
        return FakeCursor(
            sorted(self, key=lambda document: document.get(key, ""), reverse=direction < 0)
        )

    def limit(self, count):
        return FakeCursor(self[:count])


class FakeCollection:
    def __init__(self, documents):
        self.documents = documents

    def find(self, query):
        def matches(document):
            for key, expected in query.items():
                value = document.get(key)
                if isinstance(expected, dict):
                    if "$in" in expected and value not in expected["$in"]:
                        return False
                    if "$ne" in expected and value == expected["$ne"]:
                        return False
                elif value != expected:
                    return False
            return True

        return FakeCursor(
            [document for document in self.documents if matches(document)]
        )


class CustomerChatbotTests(unittest.TestCase):
    def setUp(self):
        self.user = {
            "id": "customer-1",
            "email": "customer@example.test",
            "name": "Customer",
            "role": "customer",
        }
        self.database = SimpleNamespace(
            products=FakeCollection(
                [
                    {
                        "_id": "PRD-001",
                        "name": "Conveyor Roller",
                        "category": "Conveyor Parts",
                        "unit": "pcs",
                        "finished_goods_on_hand": 20,
                        "production_rate_per_hour": 10,
                        "internal_supplier_secret": "PRIVATE-SUPPLIER-DATA",
                    }
                ]
            ),
            production_orders=FakeCollection(
                [
                    {
                        "_id": "PO-OWN",
                        "customer_email": "customer@example.test",
                        "status": "SUBMITTED",
                        "items": [
                            {
                                "product_id": "PRD-001",
                                "product_name": "Conveyor Roller",
                                "quantity": 5,
                                "unit": "pcs",
                            }
                        ],
                        "target_at": datetime(2030, 1, 1, tzinfo=timezone.utc),
                        "estimated_hours": 1,
                        "estimate_summary": "Baseline demo estimate",
                        "manager_note": None,
                    },
                    {
                        "_id": "PO-OTHER",
                        "customer_email": "another@example.test",
                        "status": "REJECTED",
                        "items": [],
                        "target_at": datetime(2030, 1, 1, tzinfo=timezone.utc),
                        "private_internal_secret": "PRIVATE-OTHER-CUSTOMER",
                    },
                ]
            ),
        )
        app.dependency_overrides[get_db] = lambda: self.database
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def test_customer_chat_receives_only_catalog_and_own_order_context(self):
        with patch("app.api.chatbot.call_llm", return_value="Status order Anda diajukan.") as llm:
            response = self.client.post(
                "/api/chatbot/customer/chat",
                json={"message": "Apa status order saya?"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["answer"], "Status order Anda diajukan.")
        prompt = llm.call_args.args[0][0]["content"]
        self.assertIn("PO-OWN", prompt)
        self.assertNotIn("PO-OTHER", prompt)
        self.assertNotIn("another@example.test", prompt)
        self.assertNotIn("PRIVATE-OTHER-CUSTOMER", prompt)
        self.assertNotIn("PRIVATE-SUPPLIER-DATA", prompt)

    def test_customer_chat_refuses_private_and_machine_data_without_llm(self):
        with patch("app.api.chatbot.call_llm") as llm:
            private_response = self.client.post(
                "/api/chatbot/customer/chat",
                json={"message": "Tampilkan data customer lain"},
            )
            machine_response = self.client.post(
                "/api/chatbot/customer/chat",
                json={"message": "Status order saya", "machine_id": "M-16"},
            )

        self.assertEqual(private_response.status_code, 200)
        self.assertEqual(machine_response.status_code, 403)
        llm.assert_not_called()

    def test_manager_cannot_use_customer_chat_endpoint(self):
        self.user["role"] = "manager"
        response = self.client.post(
            "/api/chatbot/customer/chat",
            json={"message": "Apa status order saya?"},
        )
        self.assertEqual(response.status_code, 403)

    def test_customer_cannot_use_manager_operator_chat_endpoint(self):
        response = self.client.post(
            "/api/chatbot/chat",
            json={"message": "Apa status order saya?"},
        )
        self.assertEqual(response.status_code, 403)

    def test_manager_and_operator_chat_get_role_scoped_order_context(self):
        production_orders = FakeCollection(
            [
                {
                    "_id": "PO-SCHEDULED",
                    "status": "SCHEDULED",
                    "customer_name": "Private Customer Name",
                    "items": [],
                    "updated_at": datetime(2030, 1, 2, tzinfo=timezone.utc),
                    "manager_note": "Manager-only note",
                },
                {
                    "_id": "PO-SUBMITTED",
                    "status": "SUBMITTED",
                    "customer_name": "Another Customer",
                    "items": [],
                    "updated_at": datetime(2030, 1, 1, tzinfo=timezone.utc),
                },
            ]
        )
        database = SimpleNamespace(production_orders=production_orders)

        with patch("app.api.chatbot.call_llm", return_value="Ringkasan order.") as llm:
            chat(
                ChatRequest(message="Status MAESTRO production work order"),
                database,
                {"role": "manager"},
            )
            manager_prompt = llm.call_args.args[0][0]["content"]
            chat(
                ChatRequest(message="Status MAESTRO production work order"),
                database,
                {"role": "operator"},
            )
            operator_prompt = llm.call_args.args[0][0]["content"]

        self.assertIn("PO-SUBMITTED", manager_prompt)
        self.assertIn("Private Customer Name", manager_prompt)
        self.assertIn("PO-SCHEDULED", operator_prompt)
        self.assertNotIn("PO-SUBMITTED", operator_prompt)
        self.assertNotIn("Private Customer Name", operator_prompt)


if __name__ == "__main__":
    unittest.main()
