# ============================================================
# NORMALIZER — converte tutti i payload grezzi nel formato
# interno unificato dell'evento
# ============================================================

def normalizza_rest(sensor_id, schema, dati_grezzi):
    """
    Converte un payload REST grezzo nel formato interno unificato.
    """
    if schema == "rest.scalar.v1":
        return {
            "sensor_id": sensor_id,
            "sensor_type": "rest",
            "captured_at": dati_grezzi["captured_at"],
            "measurements": [{
                "parameter": dati_grezzi["metric"],
                "value": dati_grezzi["value"],
                "unit": dati_grezzi["unit"]
            }],
            "status": dati_grezzi["status"]
        }

    elif schema == "rest.chemistry.v1":
        return {
            "sensor_id": sensor_id,
            "sensor_type": "rest",
            "captured_at": dati_grezzi["captured_at"],
            "measurements": [{
                "parameter": m["metric"],
                "value": m["value"],
                "unit": m["unit"]
            } for m in dati_grezzi["measurements"]],
            "status": dati_grezzi["status"]
        }

    elif schema == "rest.level.v1":
        return {
            "sensor_id": sensor_id,
            "sensor_type": "rest",
            "captured_at": dati_grezzi.get("captured_at"),
            "measurements": [
                {
                    "parameter": "fill_percentage",
                    "value": dati_grezzi.get("level_pct", dati_grezzi.get("fill_percentage", dati_grezzi.get("percentage", dati_grezzi.get("level", 0)))),
                    "unit": "%"
                },
                {
                    "parameter": "level_liters",
                    "value": dati_grezzi.get("level_liters", dati_grezzi.get("liters", 0)),
                    "unit": "L"
                }
            ],
            "status": dati_grezzi.get("status", "ok")
        }

    elif schema == "rest.particulate.v1":
        return {
            "sensor_id": sensor_id,
            "sensor_type": "rest",
            "captured_at": dati_grezzi.get("captured_at"),
            "measurements": [
                {
                    "parameter": "pm1",
                    "value":  dati_grezzi.get("pm1", dati_grezzi.get("pm1.0", dati_grezzi.get("pm1_ug_m3", 0))),
                    "unit": "ug/m3"
                },
                {
                    "parameter": "pm25",
                    # Aggiunta la chiave "pm2.5" che è molto comune nei payload JSON
                    "value":  dati_grezzi.get("pm2.5", dati_grezzi.get("pm25", dati_grezzi.get("pm25_ug_m3", 0))),
                    "unit": "ug/m3"
                },
                {
                    "parameter": "pm10",
                    "value":  dati_grezzi.get("pm10", dati_grezzi.get("pm10_ug_m3", 0)),
                    "unit": "ug/m3"
                }
            ],
            "status": dati_grezzi.get("status", "ok")
        }

    else:
        raise ValueError(f"Schema REST sconosciuto: {schema}")


def normalizza_telemetria(topic, schema, dati_grezzi):
    """
    Converte un payload telemetria grezzo nel formato interno unificato.
    """
    if schema == "topic.power.v1":
        metrics_map = {
            "power_kw": "kW",
            "voltage_v": "V",
            "current_a": "A",
            "cumulative_kwh": "kWh"
        }
        return {
            "sensor_id": topic,
            "sensor_type": "telemetry",
            "captured_at": dati_grezzi["event_time"],
            "measurements": [
                {"parameter": k, "value": dati_grezzi[k], "unit": v}
                for k, v in metrics_map.items() if k in dati_grezzi
            ],
            "status": "ok"
        }

    elif schema == "topic.environment.v1":
        return {
            "sensor_id": topic,
            "sensor_type": "telemetry",
            "captured_at": dati_grezzi["event_time"],
            "measurements": [
                {
                    "parameter": m["metric"],
                    "value": m["value"],
                    "unit": m["unit"]
                }
                for m in dati_grezzi["measurements"]
            ],
            "status": dati_grezzi.get("status", "ok")
        }

    elif schema == "topic.thermal_loop.v1":
            # Inizializziamo la lista delle misurazioni
            measurements = []
            
            # Aggiungiamo la temperatura se presente
            if "temperature_c" in dati_grezzi:
                measurements.append({
                    "parameter": "temperature_c",
                    "value": dati_grezzi["temperature_c"],
                    "unit": "C"
                })
                
            # Aggiungiamo il flusso (flow_l_min) se presente
            if "flow_l_min" in dati_grezzi:
                measurements.append({
                    "parameter": "flow_l_min",
                    "value": dati_grezzi["flow_l_min"],
                    "unit": "L/min"
                })

            return {
                "sensor_id": topic,
                "sensor_type": "telemetry",
                "captured_at": dati_grezzi["event_time"],
                "measurements": measurements,
                "status": dati_grezzi.get("status", "ok")
            }

    elif schema == "topic.airlock.v1":
        return {
            "sensor_id": topic,
            "sensor_type": "telemetry",
            "captured_at": dati_grezzi["event_time"],
            "measurements": [{
                "parameter": "cycles_per_hour",
                "value": dati_grezzi["cycles_per_hour"],
                "unit": "cycles/h"
            }],
            "status": dati_grezzi["last_state"]
        }

    else:
        raise ValueError(f"Schema telemetria sconosciuto: {schema}")


def to_list(risultato):
    """
    Utility — garantisce che il risultato sia sempre una lista.
    """
    return risultato if isinstance(risultato, list) else [risultato]