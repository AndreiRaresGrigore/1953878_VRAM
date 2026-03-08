import json
import time
import threading
import yaml
import requests
import paho.mqtt.client as mqtt
from db import init_db, get_rules
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
# IN-MEMORY SENSOR STATE CACHE
# ============================================================
sensor_state: dict = {}
state_lock = threading.Lock()

manual_overrides = set()
last_actuator_states = {} # Memoria interna per inviare notifiche solo se lo stato CAMBIA

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
        sensor_id = event.get("device_id")  # matches normalizer output
        if not sensor_id:
            return

        with state_lock:
            # 1. Aggiorna la cache globale con l'ultimo valore arrivato
            sensor_state[sensor_id] = event

            # 2. Crea un'istantanea sicura di tutto il sistema da inviare all'evaluator
            current_state = dict(sensor_state)

        rules = get_rules()

        # 3. Passa TUTTO LO STATO al motore di valutazione invece del singolo evento
        triggered = evaluate_rules(current_state, rules)

        for rule in triggered:
            fire_actuator(rule)

    except Exception as e:
        print(f"[ENGINE] Error processing message: {e}")

# ============================================================
# ACTUATOR CONTROL
# ============================================================

def fire_actuator(rule: dict):
    actuator = rule["actuator_name"]

    # SE L'ATTUATORE E' IN MANUALE, IGNORA LA REGOLA!
    if actuator in manual_overrides:
        return

    state = rule["actuator_state"]

    # EDGE TRIGGER: Se l'attuatore è già nello stato desiderato, ignora la regola (zero spam)
    if last_actuator_states.get(actuator) == state:
        return

    url = f"{SIMULATOR_URL}/api/actuators/{actuator}"
    try:
        resp = requests.post(url, json={"state": state}, timeout=5)
        print(f"[ACTUATOR AUTO] {actuator} -> {state} (HTTP {resp.status_code})")

        # Invia la notifica toast SOLO al primo innesco (cambio di stato effettivo)
        if resp.status_code in (200, 201):
            last_actuator_states[actuator] = state # Aggiorna la memoria

            msg = json.dumps({
                "type": "RULE_TRIGGER",
                "actuator": actuator,
                "state": state,
                "rule_id": rule.get("id"),
                "text": f"Rule #{rule.get('id')} triggered: {actuator} set to {state}"
            })
            mqtt_client.publish("mars/automation/alerts", msg)
    except Exception as e:
        print(f"[ACTUATOR] Failed to set {actuator}: {e}")

def set_actuator_manual(actuator: str, state: str) -> bool:
    """Called by the REST API for manual actuator control from the frontend."""
    url = f"{SIMULATOR_URL}/api/actuators/{actuator}"
    try:
        resp = requests.post(url, json={"state": state}, timeout=5)
        return resp.status_code in (200, 201)
    except Exception as e:
        print(f"[ACTUATOR] Manual set failed for {actuator}: {e}")
        return False

def clear_actuator_override(actuator: str):
    manual_overrides.discard(actuator) # Sblocca l'automazione
    last_actuator_states.pop(actuator, None) # Dimentica lo stato: al prossimo giro la regola forzerà l'aggiornamento
    print(f"[ACTUATOR MODE] {actuator} is now AUTO")

def get_actuator_states() -> list:
    """Proxy the simulator's actuator list to the frontend."""
    resp = requests.get(f"{SIMULATOR_URL}/api/actuators", timeout=5)
    return resp.json()

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

app = create_app(sensor_state, state_lock, manual_overrides, SIMULATOR_URL, last_actuator_states)
app.run(host="0.0.0.0", port=8081)