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
            "metric":    dati_grezzi["metric"],
            "value":     dati_grezzi["value"],
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
                "metric":    m["metric"],
                "value":     m["value"],
                "unit":      m["unit"],
                "status":    dati_grezzi["status"],
                "timestamp": dati_grezzi["captured_at"],
            }
            for m in dati_grezzi["measurements"]
        ]

    elif schema == "rest.level.v1":
        return {
            "sensor_id": sensor_id,
            "source":    "rest",
            "metric":    "level_pct",
            "value":     dati_grezzi["level_pct"],
            "unit":      "%",
            "status":    dati_grezzi["status"],
            "timestamp": dati_grezzi["captured_at"],
        }

    elif schema == "rest.particulate.v1":
        # un evento per ogni tipo di particolato
        return [
            {
                "sensor_id": sensor_id,
                "source":    "rest",
                "metric":    "pm1",
                "value":     dati_grezzi["pm1_ug_m3"],
                "unit":      "ug/m3",
                "status":    dati_grezzi["status"],
                "timestamp": dati_grezzi["captured_at"],
            },
            {
                "sensor_id": sensor_id,
                "source":    "rest",
                "metric":    "pm25",
                "value":     dati_grezzi["pm25_ug_m3"],
                "unit":      "ug/m3",
                "status":    dati_grezzi["status"],
                "timestamp": dati_grezzi["captured_at"],
            },
            {
                "sensor_id": sensor_id,
                "source":    "rest",
                "metric":    "pm10",
                "value":     dati_grezzi["pm10_ug_m3"],
                "unit":      "ug/m3",
                "status":    dati_grezzi["status"],
                "timestamp": dati_grezzi["captured_at"],
            },
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
            "metric":    "power_kw",
            "value":     dati_grezzi["power_kw"],
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
                "metric":    m["metric"],
                "value":     m["value"],
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
            "metric":    "temperature_c",
            "value":     dati_grezzi["temperature_c"],
            "unit":      "C",
            "status":    dati_grezzi.get("status", "ok"),
            "timestamp": dati_grezzi["event_time"],
        }

    elif schema == "topic.airlock.v1":
        return {
            "sensor_id": topic,
            "source":    "telemetry",
            "metric":    "cycles_per_hour",
            "value":     dati_grezzi["cycles_per_hour"],
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