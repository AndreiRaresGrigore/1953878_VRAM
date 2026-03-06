import requests
import time
import threading

import pika
import json

# Carica la configurazione dal file
with open("config.json", "r") as f:
    config = json.load(f)

BASE_URL      = config["simulator_url"]
RABBITMQ_HOST = config["rabbitmq_host"]
QUEUE_NAME    = config["queue_name"]
POLL_INTERVAL = config["polling_interval"]
RABBITMQ_USER = config["rabbitmq_user"]
RABBITMQ_PASS = config["rabbitmq_pass"]
RABBITMQ_EXCHANGE = config["queue_name"]

credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
connection = pika.BlockingConnection(
    pika.ConnectionParameters(host=RABBITMQ_HOST, credentials=credentials)
)
channel = connection.channel()

def pubblica_evento(sensor_id, evento):
    routing_key = f"sensor.{sensor_id}"

    channel.basic_publish(
        exchange=RABBITMQ_EXCHANGE,
        routing_key=routing_key,
        body=json.dumps(evento),
        properties=pika.BasicProperties(
            content_type="application/json",
            delivery_mode=2
        )
    )

# topic exchange (already declared in definitions.json but safe to declare)
channel.exchange_declare(
    exchange=RABBITMQ_EXCHANGE,
    exchange_type="topic",
    durable=True
)

# URL base del simulatore

# ============================================================
# SENSORI REST — polling ogni 5 secondi
# ============================================================

# Lista di tutti i sensori REST con il loro schema
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
    """
    Converte qualsiasi risposta del simulatore
    nel formato interno unificato.
    """

    # Schema semplice: un solo valore
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

    # Schema chimico: contiene un array di misurazioni
    elif schema == "rest.chemistry.v1":
        return {
            "sensor_id":    sensor_id,
            "type":         "rest",
            "metric":       "chemistry",
            "measurements": dati_grezzi["measurements"],
            "status":       dati_grezzi["status"],
            "timestamp":    dati_grezzi["captured_at"],
        }

    # Schema livello acqua
    elif schema == "rest.level.v1":
        return {
            "sensor_id":    sensor_id,
            "type":         "rest",
            "metric":       "level",
            "value":        dati_grezzi["level_pct"],
            "unit":         "%",
            "value_liters": dati_grezzi["level_liters"],
            "status":       dati_grezzi["status"],
            "timestamp":    dati_grezzi["captured_at"],
        }

    # Schema particolato (PM2.5)
    elif schema == "rest.particulate.v1":
        return {
            "sensor_id": sensor_id,
            "type":      "rest",
            "metric":    "particulate",
            "pm1":       dati_grezzi["pm1_ug_m3"],
            "pm25":      dati_grezzi["pm25_ug_m3"],
            "pm10":      dati_grezzi["pm10_ug_m3"],
            "unit":      "ug/m3",
            "status":    dati_grezzi["status"],
            "timestamp": dati_grezzi["captured_at"],
        }

def leggi_sensore(sensor_id, schema):
    """Chiede il valore attuale di un sensore REST"""
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
    """Legge tutti i sensori REST ogni 5 secondi in loop"""
    print("[REST] Polling avviato...")
    while True:
        for sensore in SENSORI_REST:
            leggi_sensore(sensore["id"], sensore["schema"])
        time.sleep(5)

# ============================================================
# TELEMETRIA — stream SSE, i dati arrivano da soli
# ============================================================

TOPIC_TELEMETRIA = [
    "mars/telemetry/solar_array",
    "mars/telemetry/radiation",
    #"mars/telemetry/life_support",
    #"mars/telemetry/thermal_loop",
    #"mars/telemetry/power_bus",
    #"mars/telemetry/power_consumption",
    #"mars/telemetry/airlock",
]

def ascolta_topic(topic):
    """Si connette a un topic SSE e rimane in ascolto"""
    import json
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
                            "type":      "telemetry",
                            "data":      dati_grezzi,
                            "timestamp": dati_grezzi.get("event_time", ""),
                        }
                        print(f"[SSE] {evento}")
                        pubblica_evento(topic.replace("/", "."), evento)
    except Exception as e:
        print(f"[ERRORE] Topic {topic}: {e}")

def avvia_telemetria():
    """Avvia un thread separato per ogni topic"""
    for topic in TOPIC_TELEMETRIA:
        t = threading.Thread(target=ascolta_topic, args=(topic,), daemon=True)
        t.start()

# ============================================================
# AVVIO
# ============================================================

print("=" * 50)
print("  Ingestion Service avviato!")
print("=" * 50)

# Avvia tutti gli stream di telemetria in background
avvia_telemetria()

# Avvia il polling REST (blocca il programma principale)
polling_loop()