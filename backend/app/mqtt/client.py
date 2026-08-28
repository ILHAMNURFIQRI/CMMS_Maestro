import paho.mqtt.client as mqtt
import os
import json
import threading
from dotenv import load_dotenv

load_dotenv()

MQTT_BROKER = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))

class MqttClientManager:
    def __init__(self):
        self.client = mqtt.Client(client_id="MANDOR_BACKEND", protocol=mqtt.MQTTv311)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.thread = None

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print(f"Connected to MQTT Broker at {MQTT_BROKER}")
            client.subscribe("mandor/m16/telemetry")
            client.subscribe("mandor/m16/feedback")
        else:
            print(f"Failed to connect, return code {rc}")

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
            print(f"MQTT RX [{msg.topic}]: {payload}")
            # Real implementation would push this to Database and WebSocket
        except Exception as e:
            print(f"MQTT Error parsing message: {e}")

    def publish_command(self, machine_id, target_rpm, reason):
        topic = f"mandor/{machine_id.lower().replace('-','')}/command"
        payload = json.dumps({
            "machine_id": machine_id,
            "command": "SET_RPM",
            "target_rpm": target_rpm,
            "reason": reason
        })
        self.client.publish(topic, payload)
        print(f"MQTT TX [{topic}]: {payload}")

    def start(self):
        try:
            self.client.connect(MQTT_BROKER, MQTT_PORT, 60)
            self.thread = threading.Thread(target=self.client.loop_start)
            self.thread.start()
        except Exception as e:
            print(f"Failed to start MQTT client: {e}")

    def stop(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()

mqtt_client = MqttClientManager()
