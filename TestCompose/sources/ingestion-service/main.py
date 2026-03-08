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
  "required": ["device_id", "device_type", "timestamp"],
  "properties": {
    "device_id": {"type": "string"},
    "device_type": {"type": "string", "enum": ["sensor", "telemetry", "actuator"]},
    "timestamp": { "type": "string", "format": "date-time"},
    "status": {"type": "string", "enum": ["ok", "warning"]},
    "actuator_state": {"type": "string","enum": ["ON", "OFF"]},
    "airlock_state": {"type": "string","enum": ["IDLE", "PRESSURIZING", "DEPRESSURIZING"]},
    "metadata": {
      "type": "object",
      "additionalProperties": {"type": "string"},
      "description": "Contiene campi extra come subsystem, loop, system, segment"
    },
    "measurements": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["metric", "value", "unit"],
        "properties": {
          "metric": {"type": "string"},
          "value": {"type": "number"},
          "unit": {"type": "string"}
        }
      }
    },
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "device_type": {"const": "sensor"}
        }
      },
      "then": {"required": ["measurements", "status"]}
    },
    {
      "if": {
        "properties": {
          "device_type": {"const": "telemetry"},
          "device_id": {"pattern": "^mars/telemetry/airlock$"}
        }
      },
      "then": {"required": ["airlock_state"]}
    },
    {
      "if": {
        "properties": {
          "device_type": {"const": "actuator"}
        }
      },
      "then": {"required": ["actuator_state"]}
    }
  ]
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

def pubblica_evento(device_id, evento):
    # 1. Validazione preventiva (rispetto allo schema fornito)
    is_valido, errore = valida_evento(evento)
    if not is_valido:
        print(f"[ERRORE VALIDAZIONE] Evento scartato per {device_id}: {errore}")
        return

    # 2. Pubblicazione su MQTT
    topic = f"sensor/{device_id}"
    mqtt_client.publish(topic, json.dumps(evento), qos=1)
    
    # 3. Log migliorato per gestire l'array di misurazioni
    m_list = evento.get("measurements", [])
    # Estrae le misurazioni come stringa
    misurazioni = ", ".join([f"{m.get('metric')}={m.get('value')}{m.get('unit')}" for m in evento.get("measurements", [])])
    
    # Cerca dinamicamente quale campo di "stato" è presente nel payload
    stato_operativo = (
        evento.get("status") or 
        evento.get("airlock_state") or 
        evento.get("actuator_state") or 
        "N/D" # N/D (Non Disponibile) se l'evento non prevede uno stato (es. power_bus)
    )
    
    # Stampa un log pulito
    if misurazioni:
        print(f"[PUB] {evento.get('device_id')} | {misurazioni} | state: {stato_operativo}")
    else:
        print(f"[PUB] {evento.get('device_id')} | state: {stato_operativo}")

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

def leggi_sensore(device_id, schema):
    try:
        url = f"{BASE_URL}/api/sensors/{device_id}"
        dati_grezzi = requests.get(url, timeout=5).json()
        for evento in to_list(normalizza_rest(device_id, schema, dati_grezzi)):
            pubblica_evento(device_id, evento)
    except Exception as e:
        print(f"[ERRORE REST] {device_id}: {e}")

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