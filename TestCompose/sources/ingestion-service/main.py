import requests
import time
import threading
import yaml
import json
import paho.mqtt.client as mqtt
import json
from jsonschema import validate, ValidationError
from normalizer import normalizza_rest, normalizza_telemetria, to_list

# ============================================================
# CONFIGURAZIONE
# ============================================================

with open("config.yaml", "r") as f:
    config = yaml.safe_load(f)

BASE_URL  = config["simulator_url"]
MQTT_HOST = config["rabbitmq_host"]
MQTT_PORT = config.get("mqtt_port", 1883)
MQTT_USER = config["rabbitmq_user"]
MQTT_PASS = config["rabbitmq_pass"]
POLL_INTERVAL = config.get("polling_interval", 5)

# ============================================================
# CONNESSIONE MQTT
# ============================================================

def connect_mqtt():
    client = mqtt.Client()
    client.username_pw_set(MQTT_USER, MQTT_PASS)
    while True:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, 60)
            print(f"[MQTT] Connesso a {MQTT_HOST}:{MQTT_PORT}")
            return client
        except Exception:
            print("[MQTT] Connessione fallita, retry tra 5s...")
            time.sleep(5)

mqtt_client = connect_mqtt()
mqtt_client.loop_start()

# ============================================================
# PUBBLICAZIONE
# ============================================================

EVENT_SCHEMA = {
    "type": "object",
    "required": ["sensor_id", "captured_at", "measurements", "sensor_type", "status"],
    "properties": {
        "sensor_id": {"type": "string"},
        "sensor_type": {"type": "string", "enum": ["rest", "telemetry"]},
        "captured_at": {"type": "string", "format": "date-time"},
        "measurements": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["parameter", "value", "unit"],
                "properties": {
                    "parameter": {"type": "string"},
                    "value": {"type": "number"},
                    "unit": {"type": "string"}
                }
            }
        },
        "status": {"type": "string", "enum": ["ok", "warning", "IDLE", "PRESSURIZING", "DEPRESSURIZING", "--"]}
    }
}

def valida_evento(evento):
    """
    Verifica se l'evento rispetta lo schema JSON definito.
    Ritorna (True, None) se valido, (False, errore) se non valido.
    """
    try:
        validate(instance=evento, schema=EVENT_SCHEMA)
        return True, None
    except ValidationError as e:
        return False, e.message

def pubblica_evento(sensor_id, evento):
    # 1. Validazione preventiva (rispetto allo schema fornito)
    is_valido, errore = valida_evento(evento)
    if not is_valido:
        print(f"[ERRORE VALIDAZIONE] Evento scartato per {sensor_id}: {errore}")
        return

    # 2. Pubblicazione su MQTT
    topic = f"sensor/{sensor_id}"
    mqtt_client.publish(topic, json.dumps(evento), qos=1)
    
    # 3. Log migliorato per gestire l'array di misurazioni
    m_list = evento.get("measurements", [])
    # Creiamo una stringa leggibile con tutte le misurazioni presenti nell'evento
    log_measurements = ", ".join([f"{m['parameter']}={m['value']}{m['unit']}" for m in m_list])
    
    print(f"[PUB] {evento.get('sensor_id')} | {log_measurements} | status: {evento.get('status')}")

# ============================================================
# SENSORI REST
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

def leggi_sensore(sensor_id, schema):
    try:
        url = f"{BASE_URL}/api/sensors/{sensor_id}"
        dati_grezzi = requests.get(url, timeout=5).json()
        for evento in to_list(normalizza_rest(sensor_id, schema, dati_grezzi)):
            pubblica_evento(sensor_id, evento)
    except Exception as e:
        print(f"[ERRORE REST] {sensor_id}: {e}")

def polling_loop():
    print("[REST] Polling avviato...")
    while True:
        for sensore in SENSORI_REST:
            leggi_sensore(sensore["id"], sensore["schema"])
        time.sleep(POLL_INTERVAL)

# ============================================================
# TELEMETRIA SSE
# ============================================================

TOPIC_TELEMETRIA = [
    {"id": "mars/telemetry/solar_array",      "schema": "topic.power.v1"},
    {"id": "mars/telemetry/radiation",         "schema": "topic.environment.v1"},
    {"id": "mars/telemetry/life_support",      "schema": "topic.environment.v1"},
    {"id": "mars/telemetry/thermal_loop",      "schema": "topic.thermal_loop.v1"},
    {"id": "mars/telemetry/power_bus",         "schema": "topic.power.v1"},
    {"id": "mars/telemetry/power_consumption", "schema": "topic.power.v1"},
    {"id": "mars/telemetry/airlock",           "schema": "topic.airlock.v1"},
]

def ascolta_topic(topic, schema):
    url = f"{BASE_URL}/api/telemetry/stream/{topic}"
    print(f"[SSE] Connesso a {topic}")
    try:
        with requests.get(url, stream=True, timeout=None) as response:
            for line in response.iter_lines():
                if line:
                    line = line.decode("utf-8")
                    if line.startswith("data:"):
                        dati_grezzi = json.loads(line[5:].strip())
                        for evento in to_list(normalizza_telemetria(topic, schema, dati_grezzi)):
                            pubblica_evento(topic, evento)
    except Exception as e:
        print(f"[ERRORE SSE] {topic}: {e}")

def avvia_telemetria():
    for t in TOPIC_TELEMETRIA:
        thread = threading.Thread(
            target=ascolta_topic,
            args=(t["id"], t["schema"]),
            daemon=True
        )
        thread.start()

# ============================================================
# AVVIO
# ============================================================

print("=" * 50)
print("  Ingestion Service avviato!")
print("=" * 50)

avvia_telemetria()
polling_loop()