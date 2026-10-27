import json
import unittest
from urllib.error import HTTPError, URLError
from io import BytesIO
from unittest.mock import MagicMock
from unittest.mock import patch

from fastapi import HTTPException

from app.api.chatbot import ChatRequest, chat
from app.chatbot.service import call_llm, retrieve_knowledge


class ChatbotTests(unittest.TestCase):
    def test_network_errors_are_retried_before_success(self) -> None:
        provider_response = MagicMock()
        provider_response.__enter__.return_value.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "Jawaban uji."}}]}
        ).encode()

        with (
            patch(
                "app.chatbot.service.urlopen",
                side_effect=[
                    URLError("temporary network issue"),
                    provider_response,
                ],
            ) as open_url,
            patch("app.chatbot.service.time.sleep"),
            patch.dict(
                "os.environ",
                {
                    "LLM_BASE_URL": "https://example.test/v1",
                    "LLM_API_KEY": "test-key",
                    "LLM_MODEL": "test-model",
                },
            ),
        ):
            answer = call_llm([{"role": "user", "content": "test"}])

        self.assertEqual(answer, "Jawaban uji.")
        self.assertEqual(open_url.call_count, 2)

    def test_completion_limit_is_set_and_length_truncation_is_continued(self) -> None:
        first_response = MagicMock()
        first_response.__enter__.return_value.read.return_value = json.dumps(
            {
                "choices": [
                    {
                        "message": {"content": "Ringkasan report M-16"},
                        "finish_reason": "length",
                    }
                ]
            }
        ).encode()
        continuation_response = MagicMock()
        continuation_response.__enter__.return_value.read.return_value = json.dumps(
            {
                "choices": [
                    {
                        "message": {"content": "menunjukkan status WARNING."},
                        "finish_reason": "stop",
                    }
                ]
            }
        ).encode()

        with (
            patch(
                "app.chatbot.service.urlopen",
                side_effect=[first_response, continuation_response],
            ) as open_url,
            patch.dict(
                "os.environ",
                {
                    "LLM_BASE_URL": "https://example.test/v1",
                    "LLM_API_KEY": "test-key",
                    "LLM_MODEL": "test-model",
                },
            ),
        ):
            answer = call_llm([{"role": "user", "content": "Jabarkan report M-16"}])

        self.assertEqual(
            answer,
            "Ringkasan report M-16\nmenunjukkan status WARNING.",
        )
        self.assertEqual(open_url.call_count, 2)
        first_payload = json.loads(open_url.call_args_list[0].args[0].data)
        second_payload = json.loads(open_url.call_args_list[1].args[0].data)
        self.assertEqual(first_payload["max_tokens"], 2048)
        self.assertEqual(second_payload["max_tokens"], 2048)
        self.assertEqual(
            second_payload["messages"][-1]["content"],
            "Jawaban sebelumnya terhenti karena batas panjang. "
            "Lanjutkan tepat dari bagian terakhir tanpa mengulang "
            "bagian yang sudah dijawab.",
        )

    def test_connection_error_includes_safe_network_reason(self) -> None:
        with (
            patch(
                "app.chatbot.service.urlopen",
                side_effect=URLError("network is unreachable"),
            ),
            patch("app.chatbot.service.time.sleep"),
            patch.dict(
                "os.environ",
                {
                    "LLM_BASE_URL": "https://example.test/v1",
                    "LLM_API_KEY": "test-key",
                    "LLM_MODEL": "test-model",
                },
            ),
            self.assertRaises(ConnectionError) as raised,
        ):
            call_llm([{"role": "user", "content": "test"}])

        self.assertIn("4 attempts", str(raised.exception))
        self.assertIn("network is unreachable", str(raised.exception))

    def test_gemini_503_is_retried_and_modern_temperature_is_omitted(self) -> None:
        provider_response = MagicMock()
        provider_response.__enter__.return_value.read.return_value = json.dumps(
            {"choices": [{"message": {"content": "Jawaban uji."}}]}
        ).encode()
        service_unavailable = HTTPError(
            url="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            code=503,
            msg="Service Unavailable",
            hdrs=None,
            fp=BytesIO(b'{"error":{"status":"UNAVAILABLE"}}'),
        )

        with (
            patch(
                "app.chatbot.service.urlopen",
                side_effect=[
                    service_unavailable,
                    service_unavailable,
                    provider_response,
                ],
            ) as open_url,
            patch("app.chatbot.service.time.sleep") as sleep,
            patch.dict(
                "os.environ",
                {
                    "LLM_BASE_URL": "https://generativelanguage.googleapis.com/v1beta/openai",
                    "LLM_API_KEY": "test-key",
                    "LLM_MODEL": "gemini-3.8-flash",
                },
            ),
        ):
            answer = call_llm([{"role": "user", "content": "test"}])

        self.assertEqual(answer, "Jawaban uji.")
        self.assertEqual(open_url.call_count, 3)
        self.assertEqual(sleep.call_count, 2)
        request_body = json.loads(open_url.call_args.args[0].data)
        self.assertNotIn("temperature", request_body)
        self.assertEqual(request_body["reasoning_effort"], "low")

    def test_gemini_503_error_reports_final_provider_status(self) -> None:
        last_error = HTTPError(
            url="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            code=503,
            msg="Service Unavailable",
            hdrs=None,
            fp=BytesIO(
                b'{"error":{"status":"UNAVAILABLE","message":"Model overloaded"}}'
            ),
        )

        with (
            patch("app.chatbot.service.urlopen", side_effect=last_error),
            patch("app.chatbot.service.time.sleep"),
            patch.dict(
                "os.environ",
                {
                    "LLM_BASE_URL": "https://generativelanguage.googleapis.com/v1beta/openai",
                    "LLM_API_KEY": "test-key",
                    "LLM_MODEL": "gemini-3.8-flash",
                },
            ),
            self.assertRaises(RuntimeError) as raised,
        ):
            call_llm([{"role": "user", "content": "test"}])

        self.assertIn("HTTP 503", str(raised.exception))
        self.assertIn("UNAVAILABLE", str(raised.exception))
        self.assertIn("Model overloaded", str(raised.exception))

    def test_provider_http_error_explains_auth_failure_without_leaking_key(self) -> None:
        error = HTTPError(
            url="https://api.openai.com/v1/chat/completions",
            code=401,
            msg="Unauthorized",
            hdrs=None,
            fp=BytesIO(
                b'{"error":{"message":"Invalid key sk-abcdefgh12345678"}}'
            ),
        )

        with (
            patch("app.chatbot.service.urlopen", side_effect=error),
            patch.dict(
                "os.environ",
                {
                    "LLM_BASE_URL": "https://api.openai.com/v1",
                    "LLM_API_KEY": "test-key",
                    "LLM_MODEL": "gpt-4.1-mini",
                },
            ),
            self.assertRaises(RuntimeError) as raised,
        ):
            call_llm([{"role": "user", "content": "test"}])

        self.assertIn("HTTP 401", str(raised.exception))
        self.assertIn("Periksa API key", str(raised.exception))
        self.assertNotIn("sk-abcdefgh12345678", str(raised.exception))
        self.assertIn("[redacted API key]", str(raised.exception))

    def test_chatbot_endpoint_is_registered(self) -> None:
        from app.main import app

        self.assertIn("/api/chatbot/chat", app.openapi()["paths"])

    def test_chat_history_accepts_long_assistant_response_within_total_limit(self) -> None:
        request = ChatRequest(
            message="Jelaskan laporan prediksi mesin M-16",
            history=[
                {
                    "role": "assistant",
                    "content": "Ringkasan laporan. " * 180,
                }
            ],
        )

        with (
            patch("app.api.chatbot.retrieve_knowledge", return_value=[]),
            patch("app.api.chatbot.call_llm", return_value="Penjelasan lanjutan."),
        ):
            response = chat(request, object())

        self.assertEqual(response.answer, "Penjelasan lanjutan.")

    def test_chat_history_still_rejects_total_context_over_limit(self) -> None:
        request = ChatRequest(
            message="Jelaskan prediksi mesin M-16",
            history=[
                {"role": "assistant", "content": "x" * 2000},
                {"role": "user", "content": "y" * 2000},
                {"role": "assistant", "content": "z" * 2000},
                {"role": "user", "content": "w" * 1000},
            ],
        )

        with self.assertRaises(HTTPException) as raised:
            chat(request, object())

        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("Percakapan terlalu panjang", raised.exception.detail)

    def test_knowledge_search_returns_a_relevant_project_source(self) -> None:
        sources = retrieve_knowledge("Confidence model bukan kepastian kondisi mesin")

        self.assertTrue(sources)
        self.assertEqual(sources[0]["source"], "maestro-chatbot-guide.md")
        self.assertIn("Batas kemampuan prediksi", sources[0]["title"])

    def test_knowledge_search_finds_maestro_creator(self) -> None:
        sources = retrieve_knowledge("Siapa pencipta MAESTRO ini?")

        self.assertTrue(sources)
        self.assertEqual(sources[0]["source"], "cmms-maintenance-basics.md")
        self.assertIn("Identitas proyek MAESTRO", sources[0]["title"])
        self.assertIn("TIm Restu Mamah Papah", sources[0]["content"])

    def test_chat_uses_retrieved_sources_and_returns_citations(self) -> None:
        database = object()
        source = {
            "title": "Batas kemampuan prediksi kondisi",
            "source": "maestro-chatbot-guide.md",
            "content": "Model hanya mengklasifikasikan pembacaan sensor.",
        }

        with (
            patch("app.api.chatbot.retrieve_knowledge", return_value=[source]),
            patch(
                "app.api.chatbot.call_llm",
                return_value="Model belum bisa memastikan root cause. [1]",
            ) as call_llm,
        ):
            response = chat(
                ChatRequest(message="Apakah model prediksi MAESTRO menemukan root cause?"),
                database,
            )

        self.assertIn("[1]", response.answer)
        self.assertEqual(response.sources[0].source, "maestro-chatbot-guide.md")
        self.assertIn(
            "hanya mengklasifikasikan",
            call_llm.call_args.args[0][0]["content"],
        )

    def test_code_generation_request_is_refused_without_calling_llm(self) -> None:
        with patch("app.api.chatbot.call_llm") as call_llm:
            response = chat(
                ChatRequest(message="Bisa kah kamu membuat code?"),
                object(),
            )

        self.assertIn("Saya tidak membuat atau menuliskan kode", response.answer)
        self.assertEqual(response.sources, [])
        call_llm.assert_not_called()

    def test_unrelated_question_is_refused_without_calling_llm(self) -> None:
        with patch("app.api.chatbot.call_llm") as call_llm:
            response = chat(
                ChatRequest(message="Siapa presiden Indonesia?"),
                object(),
            )

        self.assertIn("hanya membantu topik MAESTRO dan CMMS", response.answer)
        self.assertEqual(response.sources, [])
        call_llm.assert_not_called()

    def test_cmms_question_remains_in_scope(self) -> None:
        with (
            patch("app.api.chatbot.retrieve_knowledge", return_value=[]),
            patch("app.api.chatbot.call_llm", return_value="Work order adalah catatan kerja."),
        ):
            response = chat(
                ChatRequest(message="Apa fungsi work order di CMMS?"),
                object(),
            )

        self.assertEqual(response.answer, "Work order adalah catatan kerja.")

    def test_latest_sensor_question_returns_database_value_without_llm(self) -> None:
        machine_context = {
            "machine": {"_id": "M-16", "name": "CONVEYOR-01"},
            "latest_sensor_reading": {
                "temperature": 12.0,
                "current": 12.0,
                "rpm": 12.0,
                "vibration": 12.0,
                "timestamp": "2026-10-26T14:35:07.857000Z",
                "source": "MANUAL",
            },
        }

        with (
            patch(
                "app.api.chatbot.retrieve_machine_context",
                return_value=machine_context,
            ),
            patch("app.api.chatbot.call_llm") as call_llm,
        ):
            response = chat(
                ChatRequest(
                    message="Berapa pembacaan suhu terakhir mesin M-16?",
                    machine_id="M-16",
                ),
                object(),
            )

        self.assertEqual(
            response.answer,
            "Pembacaan sensor terakhir mesin M-16 — CONVEYOR-01 pada "
            "2026-10-26 21:35:07 WIB: Suhu: 12.0 °C. Sumber data: MANUAL.",
        )
        self.assertEqual(response.sources[0].source, "MongoDB · sensor_readings")
        call_llm.assert_not_called()

    def test_latest_sensor_question_requires_machine_selection(self) -> None:
        with patch("app.api.chatbot.call_llm") as call_llm:
            response = chat(
                ChatRequest(message="Berapa suhu terakhir mesin M-16?"),
                object(),
            )

        self.assertIn("Pilih mesin", response.answer)
        call_llm.assert_not_called()

    def test_latest_sensor_question_uses_all_machines_context(self) -> None:
        fleet_context = {
            "scope": "all_machines",
            "machine_count": 2,
            "machines": [
                {
                    "machine": {"_id": "M-16", "name": "CONVEYOR-01"},
                    "latest_sensor_reading": {
                        "temperature": 12.0,
                        "current": 0.45,
                        "rpm": 37.0,
                        "vibration": 9.0,
                        "timestamp": "2026-10-26T14:35:07Z",
                        "source": "MANUAL",
                    },
                },
                {
                    "machine": {"_id": "M-17", "name": "MOTOR-02"},
                    "latest_sensor_reading": {
                        "temperature": 30.0,
                        "current": 0.5,
                        "rpm": 40.0,
                        "vibration": 2.0,
                        "timestamp": "2026-10-26T14:36:07Z",
                        "source": "MQTT",
                    },
                },
            ],
        }

        with (
            patch("app.api.chatbot.retrieve_fleet_context", return_value=fleet_context),
            patch("app.api.chatbot.call_llm") as call_llm,
        ):
            response = chat(
                ChatRequest(
                    message="Berapa suhu terakhir mesin M-16?",
                    all_machines=True,
                ),
                object(),
            )

        self.assertIn("mesin M-16", response.answer)
        self.assertIn("Suhu: 12.0 °C", response.answer)
        self.assertNotIn("mesin M-17", response.answer)
        call_llm.assert_not_called()

    def test_chat_in_all_machines_mode_sends_fleet_context_to_llm(self) -> None:
        fleet_context = {
            "scope": "all_machines",
            "machine_count": 1,
            "machines": [{"machine": {"_id": "M-16", "name": "CONVEYOR-01"}}],
        }
        with patch(
            "app.api.chatbot.retrieve_fleet_context",
            return_value=fleet_context,
        ), patch("app.api.chatbot.retrieve_knowledge", return_value=[]), patch(
            "app.api.chatbot.call_llm",
            return_value="Ringkasan kondisi fleet.",
        ) as call_llm:
            response = chat(
                ChatRequest(
                    message="Jelaskan kondisi mesin di MAESTRO",
                    all_machines=True,
                ),
                object(),
            )

        self.assertEqual(response.answer, "Ringkasan kondisi fleet.")
        prompt = call_llm.call_args.args[0][0]["content"]
        self.assertIn("CONVEYOR-01", prompt)
        self.assertIn("all_machines", prompt)

    def test_machine_count_question_returns_live_database_count_without_llm(self) -> None:
        class Machines:
            def count_documents(self, query):
                self.query = query
                return 16

        class Database:
            machines = Machines()

        database = Database()
        with patch("app.api.chatbot.call_llm") as call_llm:
            response = chat(
                ChatRequest(message="Berapa mesin yang ada di dalam MAESTRO ini?"),
                database,
            )

        self.assertEqual(
            response.answer,
            "Saat ini terdapat 16 mesin terdaftar di MAESTRO.",
        )
        self.assertEqual(database.machines.query, {})
        self.assertEqual(response.sources[0].source, "MongoDB · machines")
        call_llm.assert_not_called()

    def test_chat_returns_explicit_error_when_local_llm_is_unavailable(self) -> None:
        with (
            patch("app.api.chatbot.retrieve_knowledge", return_value=[]),
            patch(
                "app.api.chatbot.call_llm",
                side_effect=ConnectionError("unavailable"),
            ),
            self.assertRaises(HTTPException) as raised,
        ):
            chat(ChatRequest(message="Bagaimana cara konsultasi?"), object())

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("Provider LLM tidak dapat dijangkau", raised.exception.detail)

    def test_chat_rejects_unknown_machine(self) -> None:
        class EmptyMachines:
            def find_one(self, _query):
                return None

        class Database:
            machines = EmptyMachines()

        with self.assertRaises(HTTPException) as raised:
            chat(ChatRequest(message="Cek mesin ini", machine_id="M-99"), Database())

        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
