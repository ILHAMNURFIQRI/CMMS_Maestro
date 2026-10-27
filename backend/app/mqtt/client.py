import asyncio
import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

from ..database.connection import get_database

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

MQTT_BROKER = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
ESP_TOPIC = os.getenv("MQTT_ESP_TOPIC", "mesin/monitoring/data")
CONTROL_TOPIC = os.getenv("MQTT_CONTROL_TOPIC", "mesin/kontrol/perintah")
ESP_MACHINE_ID = os.getenv("MQTT_ESP_MACHINE_ID", "M-16")
TELEMETRY_TOPICS = {ESP_TOPIC}


class MqttClientManager:
    def __init__(self) -> None:
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="MAESTRO_BACKEND",
            protocol=mqtt.MQTTv311,
        )
        if MQTT_USERNAME:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.telemetry_listeners: list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = []
        self._listeners_lock = threading.Lock()

    def on_connect(
        self,
        client: mqtt.Client,
        userdata: Any,
        flags: dict[str, Any],
        reason_code: Any,
        properties: Any,
    ) -> None:
        del userdata, flags, properties
        if reason_code == 0:
            logger.info("Connected to MQTT broker at %s:%s", MQTT_BROKER, MQTT_PORT)
            for topic in TELEMETRY_TOPICS:
                client.subscribe(topic)
            logger.info("Subscribed to MQTT telemetry topics: %s", TELEMETRY_TOPICS)
        else:
            logger.error("MQTT connection failed with reason code %s", reason_code)

    def on_message(
        self,
        client: mqtt.Client,
        userdata: Any,
        message: mqtt.MQTTMessage,
    ) -> None:
        del client, userdata
        try:
            payload = json.loads(message.payload.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("MQTT telemetry payload must be a JSON object")
            if message.topic not in TELEMETRY_TOPICS:
                return
            telemetry = self.store_esp_telemetry(payload)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            logger.exception("Invalid MQTT telemetry payload on topic %s", message.topic)
            return
        except Exception:
            logger.exception("Failed to store MQTT telemetry from topic %s", message.topic)
            return

        if telemetry is not None:
            with self._listeners_lock:
                listeners = list(self.telemetry_listeners)
            for loop, queue in listeners:
                loop.call_soon_threadsafe(queue.put_nowait, telemetry)

    @staticmethod
    def _number(payload: dict[str, Any], *keys: str, default: float = 0.0) -> float:
        for key in keys:
            value = payload.get(key)
            if value is not None:
                try:
                    return float(value)
                except (TypeError, ValueError):
                    logger.warning("Ignoring non-numeric MQTT sensor value for %s", key)
        return default

    def store_esp_telemetry(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        current = self._number(payload, "current", "arus")
        temperature = self._number(payload, "temperature", "suhu_objek")
        vibration = self._number(payload, "vibration", "getaran")
        rpm = self._number(payload, "rpm", "kecepatan")
        power = self._number(payload, "power", default=current * 12.0)
        status = self.get_machine_status(
            payload.get("status"),
            temperature,
            vibration,
            current,
            rpm,
        )
        timestamp = datetime.now(timezone.utc)
        database = get_database()
        if database.machines.find_one({"_id": ESP_MACHINE_ID}) is None:
            logger.error("MQTT machine %s is missing from MongoDB", ESP_MACHINE_ID)
            return None

        database.sensor_readings.insert_one(
            {
                "machine_id": ESP_MACHINE_ID,
                "timestamp": timestamp,
                "source": "MQTT",
                "temperature": temperature,
                "vibration": vibration,
                "current": current,
                "rpm": rpm,
                "power": power,
                "status": status,
            }
        )
        database.machines.update_one(
            {"_id": ESP_MACHINE_ID},
            {
                "$set": {
                    "data_source": "MQTT",
                    "mqtt_status": "CONNECTED",
                    "status": status,
                    "health_score": self.calculate_health_score(
                        temperature,
                        vibration,
                        current,
                        rpm,
                    ),
                    "last_seen": timestamp,
                }
            },
        )
        return {
            "machine_id": ESP_MACHINE_ID,
            "timestamp": timestamp.isoformat(),
            "temperature": temperature,
            "vibration": vibration,
            "current": current,
            "rpm": rpm,
            "power": power,
            "status": status,
        }

    def add_telemetry_listener(
        self,
        loop: asyncio.AbstractEventLoop,
        queue: asyncio.Queue,
    ) -> None:
        with self._listeners_lock:
            self.telemetry_listeners.append((loop, queue))

    def remove_telemetry_listener(
        self,
        loop: asyncio.AbstractEventLoop,
        queue: asyncio.Queue,
    ) -> None:
        with self._listeners_lock:
            listener = (loop, queue)
            if listener in self.telemetry_listeners:
                self.telemetry_listeners.remove(listener)

    @staticmethod
    def get_machine_status(
        source_status: Any,
        temperature: float,
        vibration: float,
        current: float,
        rpm: float,
    ) -> str:
        if str(source_status).upper() in {"CRITICAL", "DANGER"}:
            return "CRITICAL"
        if temperature > 75 or vibration > 100 or current > 12 or rpm < 100:
            return "CRITICAL"
        if temperature > 65 or vibration > 50 or current > 9:
            return "WARNING"
        return "NORMAL"

    @staticmethod
    def calculate_health_score(
        temperature: float,
        vibration: float,
        current: float,
        rpm: float,
    ) -> int:
        status = MqttClientManager.get_machine_status(
            None,
            temperature,
            vibration,
            current,
            rpm,
        )
        return {"NORMAL": 100, "WARNING": 60, "CRITICAL": 30}[status]

    def publish_command(self, machine_id: str, target_rpm: float, reason: str) -> None:
        pwm = round(max(0, min(255, (target_rpm / 600.0) * 255)))
        status = "KRITIS" if pwm == 0 else "WARNING" if pwm < 200 else "NORMAL"
        payload = json.dumps({"status": status, "pwm": pwm})
        result = self.client.publish(CONTROL_TOPIC, payload)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            logger.error("Failed to publish MQTT command for %s: %s", machine_id, result.rc)
            return
        logger.info("Published MQTT command for %s (%s): %s", machine_id, reason, payload)

    def start(self) -> None:
        try:
            self.client.connect(MQTT_BROKER, MQTT_PORT, 60)
            self.client.loop_start()
        except OSError:
            logger.exception("Failed to connect to MQTT broker at %s:%s", MQTT_BROKER, MQTT_PORT)

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()


mqtt_client = MqttClientManager()
