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

MQTT_HOST     = config["rabbitmq_host"]
MQTT_PORT     = config.get("mqtt_port", 1883)
MQTT_USER     = config["rabbitmq_user"]
MQTT_PASS     = config["rabbitmq_pass"]
SIMULATOR_URL = config["simulator_url"]

# ============================================================
# IN-MEMORY STATE CACHES
# ============================================================
sensor_state:   dict = {}
actuator_state: dict = {}
state_lock = threading.Lock()

# ============================================================
# MQTT CLIENT
# ============================================================

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("[MQTT] Connected to broker")
        client.subscribe("sensor/#")
        print("[MQTT] Subscribed to sensor/#")
        # Sync actuator states to broker once connected
        threading.Thread(target=sync_actuator_states, daemon=True).start()
    else:
        print(f"[MQTT] Connection failed with code {rc}")

def on_message(client, userdata, msg):
    try:
        event = json.loads(msg.payload.decode("utf-8"))
        sensor_id = event.get("sensor_id")
        if not sensor_id:
            return

        # Update in-memory sensor cache
        with state_lock:
            sensor_state[sensor_id] = event

        # Evaluate rules
        rules = get_rules()
        triggered = evaluate_rules(event, rules)
        for rule in triggered:
            fire_actuator(rule)

    except Exception as e:
        print(f"[ENGINE] Error processing message: {e}")

# ============================================================
# ACTUATOR CONTROL + PUBLISHING
# ============================================================

def publish_actuator_state(actuator: str, state: str):
    """Publish actuator state to MQTT so the frontend updates in real time.
    retain=True means new subscribers immediately receive the last known state."""
    payload = json.dumps({
        "actuator_id": actuator,
        "state":       state,
        "timestamp":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    mqtt_client.publish(f"actuator/{actuator}", payload, qos=1, retain=True)
    print(f"[MQTT] Published actuator/{actuator} = {state}")

def fire_actuator(rule: dict):
    """Send actuator command to simulator, then publish new state to broker."""
    actuator = rule["actuator_name"]
    state    = rule["actuator_state"]
    url      = f"{SIMULATOR_URL}/api/actuators/{actuator}"
    try:
        resp = requests.post(url, json={"state": state}, timeout=5)
        print(f"[ACTUATOR] {actuator} -> {state} (HTTP {resp.status_code})")
        if resp.status_code in (200, 201):
            with state_lock:
                actuator_state[actuator] = state
            publish_actuator_state(actuator, state)
    except Exception as e:
        print(f"[ACTUATOR] Failed to set {actuator}: {e}")

def set_actuator_manual(actuator: str, state: str) -> bool:
    """Used by the API to manually set an actuator from the frontend."""
    url = f"{SIMULATOR_URL}/api/actuators/{actuator}"
    try:
        resp = requests.post(url, json={"state": state}, timeout=5)
        if resp.status_code in (200, 201):
            with state_lock:
                actuator_state[actuator] = state
            publish_actuator_state(actuator, state)
            return True
        return False
    except Exception as e:
        print(f"[ACTUATOR] Manual set failed for {actuator}: {e}")
        return False

def sync_actuator_states():
    """On startup, read all actuator states from the simulator and publish them
    so the frontend gets current state immediately on connect."""
    time.sleep(2)  # small delay to ensure MQTT loop is ready
    try:
        resp = requests.get(f"{SIMULATOR_URL}/api/actuators", timeout=5)
        actuators = resp.json()
        for a in actuators:
            with state_lock:
                actuator_state[a["id"]] = a["state"]
            publish_actuator_state(a["id"], a["state"])
        print(f"[STARTUP] Synced {len(actuators)} actuator states to broker")
    except Exception as e:
        print(f"[STARTUP] Could not sync actuator states: {e}")

# ============================================================
# MQTT CONNECT
# ============================================================

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

# Start REST API — passes shared state and manual actuator setter
app = create_app(sensor_state, actuator_state, state_lock, set_actuator_manual)
app.run(host="0.0.0.0", port=8081)