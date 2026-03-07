import requests
import time
import threading
import yaml
import json
import paho.mqtt.client as mqtt

with open("config.yaml", "r") as f:
    config = yaml.safe_load(f)

BASE_URL      = config["simulator_url"]
MQTT_HOST     = config["rabbitmq_host"]
MQTT_PORT     = config.get("mqtt_port", 1883)
MQTT_USER     = config["rabbitmq_user"]
MQTT_PASS     = config["rabbitmq_pass"]

# ============================================================
# CONNESSIONE MQTT
# ============================================================

def connect_mqtt():
    client = mqtt.Client()
    client.username_pw_set(MQTT_USER, MQTT_PASS)

    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, 60)
            print("[MQTT] Connesso al broker")
            return client
        except Exception:
            print("[MQTT] Connessione fallita, retry tra 5s...")
            time.sleep(5)

mqtt_client = connect_mqtt()
mqtt_client.loop_start()  # thread di background per gestire ping/keepalive

# ============================================================
# PUBBLICAZIONE EVENTI
# ============================================================

def pubblica_evento(sensor_id, evento):
    topic = f"sensor/{sensor_id}"
    payload = json.dumps(evento)
    mqtt_client.publish(topic, payload, qos=1)  # QoS=1 assicura almeno 1 consegna

# ============================================================
# NORMALIZZAZIONE DATI
# ============================================================

SENSORI_REST = [
    {"id": "greenhouse_temperature", "schema": "rest.scalar.v1"},
    {"id": "entrance_humidity",      "schema": "rest.scalar.v1"},
    {"id": "co2_hall",               "schema": "rest.scalar.v1"},
    {"id": "corridor_pressure",      "schema": "rest.scalar.v1"},
    {"id": "hydroponic_ph",          "schema": "rest.chemistry.v1"},
    {"id": "air_quality_voc",        "schema": "rest.chemistry.v1"},
    {"id": "water_tank_level",       "schema": "rest.level.v1"},
    {"id": "air_quality_pm25",       "schema": "rest.particulate.v1"},
]

def normalizza(sensor_id, schema, dati_grezzi):
    if schema == "rest.scalar.v1":
        return {
            "sensor_id":  sensor_id,
            "type":       "rest",
            "metric":     dati_grezzi["metric"],
            "value":      dati_grezzi["value"],
            "unit":       dati_grezzi["unit"],
            "status":     dati_grezzi["status"],
            "timestamp":  dati_grezzi["captured_at"],
        }
    elif schema == "rest.chemistry.v1":
        return {
            "sensor_id": sensor_id,
            "type": "rest",
            "metric": "chemistry",
            "measurements": dati_grezzi["measurements"],
            "status": dati_grezzi["status"],
            "timestamp": dati_grezzi["captured_at"],
        }
    elif schema == "rest.level.v1":
        return {
            "sensor_id": sensor_id,
            "type": "rest",
            "metric": "level",
            "value": dati_grezzi["level_pct"],
            "unit": "%",
            "value_liters": dati_grezzi["level_liters"],
            "status": dati_grezzi["status"],
            "timestamp": dati_grezzi["captured_at"],
        }
    elif schema == "rest.particulate.v1":
        return {
            "sensor_id": sensor_id,
            "type": "rest",
            "metric": "particulate",
            "pm1": dati_grezzi["pm1_ug_m3"],
            "pm25": dati_grezzi["pm25_ug_m3"],
            "pm10": dati_grezzi["pm10_ug_m3"],
            "unit": "ug/m3",
            "status": dati_grezzi["status"],
            "timestamp": dati_grezzi["captured_at"],
        }

# ============================================================
# POLLING REST
# ============================================================

def leggi_sensore(sensor_id, schema):
    try:
        url = f"{BASE_URL}/api/sensors/{sensor_id}"
        response = requests.get(url, timeout=5)
        dati_grezzi = response.json()
        evento = normalizza(sensor_id, schema, dati_grezzi)
        print(f"[REST] {evento}")
        pubblica_evento(sensor_id, evento)
    except Exception as e:
        print(f"[ERRORE] Sensore {sensor_id}: {e}")

def polling_loop():
    print("[REST] Polling avviato...")
    while True:
        for sensore in SENSORI_REST:
            leggi_sensore(sensore["id"], sensore["schema"])
        time.sleep(5)

# ============================================================
# TELEMETRIA SSE
# ============================================================

TOPIC_TELEMETRIA = [
    "mars/telemetry/solar_array",
    "mars/telemetry/radiation",
    "mars/telemetry/life_support",
    "mars/telemetry/thermal_loop",
    "mars/telemetry/power_bus",
    "mars/telemetry/power_consumption",
    "mars/telemetry/airlock",
]

def ascolta_topic(topic):
    url = f"{BASE_URL}/api/telemetry/stream/{topic}"
    print(f"[SSE] Connesso a {topic}")
    try:
        with requests.get(url, stream=True, timeout=None) as response:
            for line in response.iter_lines():
                if line:
                    line = line.decode("utf-8")
                    if line.startswith("data:"):
                        dati_grezzi = json.loads(line[5:].strip())
                        evento = {
                            "sensor_id": topic,
                            "type": "telemetry",
                            "data": dati_grezzi,
                            "timestamp": dati_grezzi.get("event_time", ""),
                        }
                        print(f"[SSE] {evento}")
                        pubblica_evento(topic, evento)
    except Exception as e:
        print(f"[ERRORE] Topic {topic}: {e}")

def avvia_telemetria():
    for topic in TOPIC_TELEMETRIA:
        t = threading.Thread(target=ascolta_topic, args=(topic,), daemon=True)
        t.start()

# ============================================================
# AVVIO
# ============================================================

print("=" * 50)
print("  Ingestion Service avviato!")
print("=" * 50)

avvia_telemetria()
polling_loop()