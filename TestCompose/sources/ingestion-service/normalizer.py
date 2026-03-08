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
            "device_id": sensor_id or dati_grezzi.get("sensor_id"),
            "device_type": "sensor",
            "timestamp": dati_grezzi.get("captured_at"),
            "measurements": [{
                "metric": dati_grezzi.get("metric"),
                "value": dati_grezzi.get("value"),
                "unit": dati_grezzi.get("unit")
            }],
            "status": dati_grezzi.get("status", "ok")
        }

    elif schema == "rest.chemistry.v1":
        return {
            "device_id": sensor_id,
            "device_type": "sensor",
            "timestamp": dati_grezzi.get("captured_at"),
            "measurements": [{
                "metric": m["metric"],
                "value": m["value"],
                "unit": m["unit"]
            } for m in dati_grezzi.get("measurements", [])],
            "status": dati_grezzi.get("status", "ok")
        }

    elif schema == "rest.level.v1":
        return {
            "device_id": sensor_id,
            "device_type": "sensor",
            "timestamp": dati_grezzi.get("captured_at"),
            "measurements": [
                {
                    "metric": "fill_percentage",
                    "value": dati_grezzi.get("level_pct", dati_grezzi.get("fill_percentage", dati_grezzi.get("percentage", dati_grezzi.get("level", 0)))),
                    "unit": "%"
                },
                {
                    "metric": "level_liters",
                    "value": dati_grezzi.get("level_liters", dati_grezzi.get("liters", 0)),
                    "unit": "L"
                }
            ],
            "status": dati_grezzi.get("status", "ok")
        }

    elif schema == "rest.particulate.v1":
        return {
            "device_id": sensor_id,
            "device_type": "sensor",
            "timestamp": dati_grezzi.get("captured_at"),
            "measurements": [
                {
                    "metric": "pm1",
                    "value":  dati_grezzi.get("pm1", dati_grezzi.get("pm1.0", dati_grezzi.get("pm1_ug_m3", 0))),
                    "unit": "ug/m3"
                },
                {
                    "metric": "pm25",
                    "value":  dati_grezzi.get("pm2.5", dati_grezzi.get("pm25", dati_grezzi.get("pm25_ug_m3", 0))),
                    "unit": "ug/m3"
                },
                {
                    "metric": "pm10",
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
        
        metadata = {}
        if "subsystem" in dati_grezzi:
            metadata["subsystem"] = dati_grezzi["subsystem"]
            
        return {
            "device_id": topic,
            "device_type": "telemetry",
            "timestamp": dati_grezzi.get("event_time"),
            "metadata": metadata,
            "measurements": [
                {"metric": k, "value": dati_grezzi[k], "unit": v}
                for k, v in metrics_map.items() if k in dati_grezzi
            ]
        }

    elif schema == "topic.environment.v1":
        metadata = {}
        if "source" in dati_grezzi:
            metadata["system"] = dati_grezzi["source"].get("system", "")
            metadata["segment"] = dati_grezzi["source"].get("segment", "")
            
        return {
            "device_id": topic,
            "device_type": "telemetry",
            "timestamp": dati_grezzi.get("event_time"),
            "metadata": metadata,
            "measurements": [
                {
                    "metric": m["metric"],
                    "value": m["value"],
                    "unit": m["unit"]
                }
                for m in dati_grezzi.get("measurements", [])
            ],
            "status": dati_grezzi.get("status", "ok")
        }

    elif schema == "topic.thermal_loop.v1":
        measurements = []
        
        if "temperature_c" in dati_grezzi:
            measurements.append({
                "metric": "temperature_c",
                "value": dati_grezzi["temperature_c"],
                "unit": "C"
            })
            
        if "flow_l_min" in dati_grezzi:
            measurements.append({
                "metric": "flow_l_min",
                "value": dati_grezzi["flow_l_min"],
                "unit": "L/min"
            })

        metadata = {}
        if "loop" in dati_grezzi:
            metadata["loop"] = dati_grezzi["loop"]

        return {
            "device_id": topic,
            "device_type": "telemetry",
            "timestamp": dati_grezzi.get("event_time"),
            "metadata": metadata,
            "measurements": measurements,
            "status": dati_grezzi.get("status", "ok")
        }

    elif schema == "topic.airlock.v1":
        metadata = {}
        if "airlock_id" in dati_grezzi:
            metadata["airlock_id"] = dati_grezzi["airlock_id"]
            
        return {
            "device_id": topic,
            "device_type": "telemetry",
            "timestamp": dati_grezzi.get("event_time"),
            "metadata": metadata,
            "measurements": [{
                "metric": "cycles_per_hour",
                "value": dati_grezzi.get("cycles_per_hour", 0),
                "unit": "cycles/h"
            }],
            # Mappiamo lo stato specifico dell'airlock come previsto dal nuovo schema
            "airlock_state": dati_grezzi.get("last_state")
        }

    else:
        raise ValueError(f"Schema telemetria sconosciuto: {schema}")


def to_list(risultato):
    """
    Utility — garantisce che il risultato sia sempre una lista.
    """
    return risultato if isinstance(risultato, list) else [risultato]