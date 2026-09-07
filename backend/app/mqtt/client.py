import paho.mqtt.client as mqtt
import os
import json
import threading
import datetime
import asyncio
from dotenv import load_dotenv
from ..database.connection import SessionLocal
from ..models.machine import Machine, Telemetry

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")))

MQTT_BROKER = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
ESP_TOPIC = os.getenv("MQTT_ESP_TOPIC", "mesin/monitoring/data")
CONTROL_TOPIC = os.getenv("MQTT_CONTROL_TOPIC", "mesin/kontrol/perintah")
ESP_MACHINE_ID = os.getenv("MQTT_ESP_MACHINE_ID", "M-16")
TELEMETRY_TOPICS = {ESP_TOPIC}

TEMPERATURE_WARNING_MIN = 36.0
TEMPERATURE_CRITICAL_MIN = 40.0
VIBRATION_WARNING_MIN = 4.0
VIBRATION_WARNING_TEMPERATURE = 37.5
VIBRATION_CRITICAL_MIN = 3.5
CURRENT_WARNING_MIN = 0.05
CURRENT_WARNING_TEMPERATURE = 37.5
CURRENT_WARNING_VIBRATION = 9.0

class MqttClientManager:
    def __init__(self):
        self.client = mqtt.Client(client_id="MANDOR_BACKEND", protocol=mqtt.MQTTv311)
        if MQTT_USERNAME:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.thread = None
        self.telemetry_listeners = []

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print(f"Connected to MQTT Broker at {MQTT_BROKER}")
            for topic in TELEMETRY_TOPICS:
                client.subscribe(topic)
            print(f"Subscribed to ESP32 topics: {', '.join(sorted(TELEMETRY_TOPICS))}")
        else:
            print(f"Failed to connect, return code {rc}")

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
            print(f"MQTT RX [{msg.topic}]: {payload}")
            if msg.topic in TELEMETRY_TOPICS:
                telemetry = self.normalize_esp_telemetry(payload)
                if telemetry is None:
                    return

                # Stream valid MQTT data immediately. Database persistence must
                # not block the live dashboard when MySQL is unavailable.
                for loop, queue in list(self.telemetry_listeners):
                    loop.call_soon_threadsafe(queue.put_nowait, telemetry)

                try:
                    self.store_esp_telemetry(payload, telemetry)
                except Exception as error:
                    print(f"MQTT database warning: {error}")
        except Exception as e:
            print(f"MQTT Error parsing message: {e}")

    @staticmethod
    def normalize_esp_telemetry(payload):
        """Convert the ESP32 field names to the API telemetry contract."""
        def number(*keys, default=0.0):
            for key in keys:
                value = payload.get(key)
                if value is not None:
                    try:
                        return float(value)
                    except (TypeError, ValueError):
                        pass
            return default

        current = number("current", "arus")
        temperature = number("temperature", "suhu_objek")
        vibration = number("vibration", "getaran")
        rpm = number("rpm", "kecepatan")
        power = number("power", default=current * 12.0)
        status, status_reason = MqttClientManager.evaluate_machine_status(
            payload.get("status"), temperature, vibration, current, rpm
        )

        return {
            "machine_id": ESP_MACHINE_ID,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "temperature": temperature,
            "vibration": vibration,
            "current": current,
            "rpm": rpm,
            "power": power,
            "status": status,
            "status_reason": status_reason,
        }

    def store_esp_telemetry(self, payload, telemetry=None):
        """Persist normalized ESP32 telemetry without affecting live streaming."""
        telemetry = telemetry or self.normalize_esp_telemetry(payload)
        if telemetry is None:
            return None

        db = SessionLocal()
        try:
            machine = db.query(Machine).filter(Machine.id == ESP_MACHINE_ID).one_or_none()
            if machine is None:
                print(f"MQTT Warning: machine {ESP_MACHINE_ID} is missing from the database")
                return None

            timestamp = datetime.datetime.fromisoformat(telemetry["timestamp"])
            db.add(Telemetry(
                machine_id=ESP_MACHINE_ID,
                timestamp=timestamp,
                temperature=telemetry["temperature"],
                vibration=telemetry["vibration"],
                current=telemetry["current"],
                rpm=telemetry["rpm"],
                power=telemetry["power"],
            ))
            machine.data_source = "MQTT"
            machine.mqtt_status = "CONNECTED"
            machine.status = telemetry["status"]
            machine.health_score = self.calculate_health_score(
                telemetry["temperature"],
                telemetry["vibration"],
                telemetry["current"],
                telemetry["rpm"],
            )
            db.commit()
            return telemetry
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def add_telemetry_listener(self, loop, queue):
        self.telemetry_listeners.append((loop, queue))

    def remove_telemetry_listener(self, loop, queue):
        listener = (loop, queue)
        if listener in self.telemetry_listeners:
            self.telemetry_listeners.remove(listener)

    @staticmethod
    def get_machine_status(source_status, temperature, vibration, current, rpm):
        return MqttClientManager.evaluate_machine_status(
            source_status, temperature, vibration, current, rpm
        )[0]

    @staticmethod
    def evaluate_machine_status(source_status, temperature, vibration, current, rpm):
        # The ESP32 `status` field describes motor direction (for example
        # MAJU), so health status must always come from live sensor values.
        if temperature >= TEMPERATURE_CRITICAL_MIN:
            return "CRITICAL", f"Suhu dominan mencapai {temperature:.1f} C (>= 40.0 C)."
        if temperature >= TEMPERATURE_WARNING_MIN:
            return "WARNING", f"Suhu dominan mencapai {temperature:.1f} C (36.0-39.9 C)."
        if temperature >= VIBRATION_WARNING_TEMPERATURE and vibration >= VIBRATION_WARNING_MIN:
            return "WARNING", "Kombinasi suhu dan getaran memicu warning."
        if (
            temperature >= CURRENT_WARNING_TEMPERATURE
            and vibration >= CURRENT_WARNING_VIBRATION
            and current >= CURRENT_WARNING_MIN
        ):
            return "WARNING", "Kombinasi suhu, getaran, dan arus memicu warning."
        return "NORMAL", "Semua parameter berada pada kondisi normal."

    @staticmethod
    def calculate_health_score(temperature, vibration, current, rpm):
        status, _ = MqttClientManager.evaluate_machine_status(
            None, temperature, vibration, current, rpm
        )
        if status == "NORMAL":
            vibration_penalty = max(0.0, 3.0 - vibration) * 2
            current_penalty = max(0.0, current - 2.5) * 4
            return round(max(80.0, min(100.0, 100.0 - vibration_penalty - current_penalty)))
        if status == "WARNING":
            if temperature >= 36.0:
                progress = min(1.0, max(0.0, (temperature - 36.0) / 3.9))
                return round(79.0 - progress * 39.0)
            return 70
        critical_progress = min(1.0, max(0.0, (temperature - 40.0) / 20.0))
        return round(39.0 - critical_progress * 39.0)

    def publish_command(self, machine_id, target_rpm, reason):
        pwm = round(max(0, min(255, (target_rpm / 600.0) * 255)))
        if pwm == 0:
            status = "KRITIS"
        elif pwm < 200:
            status = "WARNING"
        else:
            status = "NORMAL"
        payload = json.dumps({
            "status": status,
            "pwm": pwm,
        })
        self.client.publish(CONTROL_TOPIC, payload)
        print(f"MQTT TX [{CONTROL_TOPIC}]: {payload} ({machine_id}: {reason})")

    def start(self):
        try:
            self.client.reconnect_delay_set(min_delay=1, max_delay=30)
            self.client.connect_async(MQTT_BROKER, MQTT_PORT, 60)
            self.client.loop_start()
            print(f"MQTT client starting for {MQTT_BROKER}:{MQTT_PORT}")
        except Exception as e:
            print(f"Failed to start MQTT client: {e}")

    def stop(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()

mqtt_client = MqttClientManager()
