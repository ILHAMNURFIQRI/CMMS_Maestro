# ESP32 MQTT Integration Example for M-16 (CONVEYOR-01)

This is an example C++ sketch for Arduino IDE to integrate an ESP32 with MANDOR.

## Prerequisites
- PubSubClient library by Nick O'Leary
- WiFi library

## Code

```cpp
#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "192.168.1.X"; // IP of the machine running Mosquitto

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0;
float current_rpm = 500.0;

void setup_wifi() {
  delay(10);
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("WiFi connected");
}

void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  Serial.println(message);

  // Basic parsing for SET_RPM command (assuming {"target_rpm": 200})
  if (message.indexOf("SET_RPM") > 0) {
    int rpmIndex = message.indexOf("target_rpm\":") + 12;
    int target = message.substring(rpmIndex, message.indexOf(',', rpmIndex)).toInt();
    
    Serial.print("Adjusting RPM to: ");
    Serial.println(target);
    
    // Simulate motor deceleration
    current_rpm = target;

    // Send Feedback
    String feedback = "{\"machine_id\": \"M-16\", \"target_rpm\": " + String(target) + ", \"actual_rpm\": " + String(current_rpm) + ", \"verified\": true}";
    client.publish("mandor/m16/feedback", feedback.c_str());
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("M-16_ESP32")) {
      Serial.println("connected");
      client.subscribe("mandor/m16/command");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  setup_wifi();
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > 2000) {
    lastMsg = now;
    
    // Simulate some sensor variations
    float temp = 48.0 + (random(-10, 10) / 10.0);
    float vib = 1.2 + (random(-2, 2) / 10.0);
    float curr = 1.8 + (random(-1, 1) / 10.0);
    float pwr = curr * 12.0;
    
    // Send Telemetry
    String payload = "{";
    payload += "\"machine_id\": \"M-16\",";
    payload += "\"temperature\": " + String(temp) + ",";
    payload += "\"vibration\": " + String(vib) + ",";
    payload += "\"current\": " + String(curr) + ",";
    payload += "\"rpm\": " + String(current_rpm) + ",";
    payload += "\"power\": " + String(pwr);
    payload += "}";

    client.publish("mandor/m16/telemetry", payload.c_str());
  }
}
```
