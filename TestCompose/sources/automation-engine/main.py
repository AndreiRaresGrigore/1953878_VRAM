import json
import time
import threading
import yaml
import requests
import paho.mqtt.client as mqtt
from db import init_db, get_rules, add_rule, delete_rule, get_rule_by_id
from evaluator import evaluate_rules
from api import create_app

# ============================================================
# CONFIGURATION
# ============================================================

with open("config.yaml", "r") as f:
    config = yaml.safe_load(f)

MQTT_HOST    = config["rabbitmq_host"]
MQTT_PORT    = config.get("mqtt_port", 1883)
MQTT_USER    = config["rabbitmq_user"]
MQTT_PASS    = config["rabbitmq_pass"]
SIMULATOR_URL = config["simulator_url"]

# ============================================================
# IN-MEMORY SENSOR STATE CACHE
# { "greenhouse_temperature": { <latest event> } }
# ============================================================
sensor_state: dict = {}
state_lock = threading.Lock()

# ============================================================
# MQTT CLIENT
# ============================================================

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("[MQTT] Connected to broker")
        client.subscribe("sensor/#")
        print("[MQTT] Subscribed to sensor/#")
    else:
        print(f"[MQTT] Connection failed with code {rc}")

def on_message(client, userdata, msg):
    try:
        event = json.loads(msg.payload.decode("utf-8"))
        sensor_id = event.get("sensor_id")
        if not sensor_id:
            return

        # Update in-memory state cache
        with state_lock:
            sensor_state[sensor_id] = event

        # Evaluate rules
        rules = get_rules()
        triggered = evaluate_rules(event, rules)
        for rule in triggered:
            fire_actuator(rule)

    except Exception as e:
        print(f"[ENGINE] Error processing message: {e}")

def fire_actuator(rule: dict):
    actuator = rule["actuator_name"]
    state    = rule["actuator_state"]
    url      = f"{SIMULATOR_URL}/api/actuators/{actuator}"
    try:
        resp = requests.post(url, json={"state": state}, timeout=5)
        print(f"[ACTUATOR] {actuator} → {state} (HTTP {resp.status_code})")
    except Exception as e:
        print(f"[ACTUATOR] Failed to set {actuator}: {e}")

def connect_mqtt() -> mqtt.Client:
    client = mqtt.Client()
    client.username_pw_set(MQTT_USER, MQTT_PASS)
    client.on_connect = on_connect
    client.on_message = on_message
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, 60)
            print(f"[MQTT] Connecting to {MQTT_HOST}:{MQTT_PORT}...")
            return client
        except Exception:
            print("[MQTT] Connection failed, retrying in 5s...")
            time.sleep(5)

# ============================================================
# STARTUP
# ============================================================

print("=" * 50)
print("  Automation Engine starting...")
print("=" * 50)

init_db()

mqtt_client = connect_mqtt()
mqtt_client.loop_start()

# Start REST API (Flask) — passes shared state via closures
app = create_app(sensor_state, state_lock)
app.run(host="0.0.0.0", port=8081)
