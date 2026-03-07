# ============================================================
# NORMALIZER — converte tutti i payload grezzi nel formato
# interno unificato dell'evento
# ============================================================

def normalizza_rest(sensor_id, schema, dati_grezzi):
    """
    Converte un payload REST grezzo nel formato interno unificato.
    Può restituire un singolo evento (dict) o una lista di eventi.
    """

    if schema == "rest.scalar.v1":
        return {
            "sensor_id": sensor_id,
            "source":    "rest",
            "measurements": {
                "metric": dati_grezzi["metric"],
                "value":  dati_grezzi["value"]
            },
            "unit":      dati_grezzi["unit"],
            "status":    dati_grezzi["status"],
            "timestamp": dati_grezzi["captured_at"],
        }

    elif schema == "rest.chemistry.v1":
        # un evento per ogni misurazione nell'array
        return [
            {
                "sensor_id": sensor_id,
                "source":    "rest",
                "measurements": {
                    "metric": m["metric"],
                    "value":  m["value"]
                },
                "unit":      m["unit"],
                "status":    dati_grezzi["status"],
                "timestamp": dati_grezzi["captured_at"],
            }
            for m in dati_grezzi["measurements"]
        ]

    elif schema == "rest.level.v1":
        # Stampa il payload grezzo nei log per scoprire la chiave reale
        print(f"[DEBUG water_tank] Payload ricevuto: {dati_grezzi}", flush=True)
        
        return [
            {
                "sensor_id": sensor_id,
                "source":    "rest",
                "measurements": {
                    "metric": "fill_percentage",
                    "value":  dati_grezzi.get("level_pct", dati_grezzi.get("fill_percentage", dati_grezzi.get("percentage", dati_grezzi.get("level", 0))))
                },
                "unit":      "%",
                "status":    dati_grezzi.get("status", "ok"),
                "timestamp": dati_grezzi.get("captured_at"),
            },
            {
                "sensor_id": sensor_id,
                "source":    "rest",
                "measurements": {
                    "metric": "level_liters",
                    "value":  dati_grezzi.get("level_liters", dati_grezzi.get("liters", 0))
                },
                "unit":      "L",
                "status":    dati_grezzi.get("status", "ok"),
                "timestamp": dati_grezzi.get("captured_at"),
            }
        ]

    elif schema == "rest.particulate.v1":
        # un evento per ogni tipo di particolato
        return [
            {
                "sensor_id": sensor_id,
                "source":    "rest",
                "measurements": {
                    "metric": "pm1",
                    "value":  dati_grezzi.get("pm1", dati_grezzi.get("pm1_ug_m3", 0))
                },
                "unit":      "ug/m3",
                "status":    dati_grezzi.get("status", "ok"),
                "timestamp": dati_grezzi.get("captured_at"),
            },
            {
                "sensor_id": sensor_id,
                "source":    "rest",
                "measurements": {
                    "metric": "pm25",
                    "value":  dati_grezzi.get("pm25", dati_grezzi.get("pm25_ug_m3", 0))
                },
                "unit":      "ug/m3",
                "status":    dati_grezzi.get("status", "ok"),
                "timestamp": dati_grezzi.get("captured_at"),
            },
            {
                "sensor_id": sensor_id,
                "source":    "rest",
                "measurements": {
                    "metric": "pm10",
                    "value":  dati_grezzi.get("pm10", dati_grezzi.get("pm10_ug_m3", 0))
                },
                "unit":      "ug/m3",
                "status":    dati_grezzi.get("status", "ok"),
                "timestamp": dati_grezzi.get("captured_at"),
            }
        ]

    else:
        raise ValueError(f"Schema REST sconosciuto: {schema}")


def normalizza_telemetria(topic, schema, dati_grezzi):
    """
    Converte un payload telemetria grezzo nel formato interno unificato.
    Può restituire un singolo evento (dict) o una lista di eventi.
    """

    if schema == "topic.power.v1":
        return {
            "sensor_id": topic,
            "source":    "telemetry",
            "measurements": {
                "metric": "power_kw",
                "value":  dati_grezzi["power_kw"]
            },
            "unit":      "kW",
            "status":    "ok",
            "timestamp": dati_grezzi["event_time"],
        }

    elif schema == "topic.environment.v1":
        # un evento per ogni misurazione nell'array
        return [
            {
                "sensor_id": topic,
                "source":    "telemetry",
                "measurements": {
                    "metric": m["metric"],
                    "value":  m["value"]
                },
                "unit":      m["unit"],
                "status":    dati_grezzi.get("status", "ok"),
                "timestamp": dati_grezzi["event_time"],
            }
            for m in dati_grezzi["measurements"]
        ]

    elif schema == "topic.thermal_loop.v1":
        return {
            "sensor_id": topic,
            "source":    "telemetry",
            "measurements": {
                "metric": "temperature_c",
                "value":  dati_grezzi["temperature_c"]
            },
            "unit":      "C",
            "status":    dati_grezzi.get("status", "ok"),
            "timestamp": dati_grezzi["event_time"],
        }

    elif schema == "topic.airlock.v1":
        return {
            "sensor_id": topic,
            "source":    "telemetry",
            "measurements": {
                "metric": "cycles_per_hour",
                "value":  dati_grezzi["cycles_per_hour"]
            },
            "unit":      "cycles/h",
            "status":    dati_grezzi["last_state"],
            "timestamp": dati_grezzi["event_time"],
        }

    else:
        raise ValueError(f"Schema telemetria sconosciuto: {schema}")


def to_list(risultato):
    """
    Utility — garantisce che il risultato sia sempre una lista,
    sia che normalizza abbia restituito un dict o una lista.
    """
    return risultato if isinstance(risultato, list) else [risultato]