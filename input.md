# Mars Habitat Automation Platform

## System Overview
Distributed automation platform for monitoring and controlling
a Mars habitat. The system ingests heterogeneous sensor data,
normalizes it into a unified internal format, evaluates
automation rules, and provides a real-time dashboard.

## Standard Internal Event Schema

Every event published to the broker follows this exact format,
regardless of the original source (REST or telemetry stream):
```json
{
    "sensor_id":  "string  — unique identifier of the sensor or topic",
    "source":     "string  — 'rest' or 'telemetry'",
    "mesurements":{

    },
    "unit":       "string  — unit of measurement (e.g. C, %, kW)",
    "status":     "string  — 'ok' or 'warning'",
    "timestamp":  "string  — ISO 8601 datetime"
}
```
      "number  — the measured value"
    "metric":     "string  — what is being measured (e.g. temperature_c)",

### Example events

REST sensor:
```json
{
    "sensor_id": "greenhouse_temperature",
    "source":    "rest",
    "metric":    "temperature_c",
    "value":     23.55,
    "unit":      "C",
    "status":    "ok",
    "timestamp": "2036-03-06T14:02:17Z"
}
```

Telemetry stream:
```json
{
    "sensor_id": "mars/telemetry/solar_array",
    "source":    "telemetry",
    "metric":    "power_kw",
    "value":     12.4,
    "unit":      "kW",
    "status":    "ok",
    "timestamp": "2036-03-06T14:02:17Z"
}
```

## Rule Model

Rules follow this syntax:
IF <sensor_id> <operator> <value> [unit]
THEN set <actuator_name> to ON | OFF

Supported operators: <, <=, =, >, >=

### Examples
- IF greenhouse_temperature > 28 THEN set cooling_fan to ON
- IF co2_hall > 2000 THEN set hall_ventilation to ON
- IF water_tank_level < 20 THEN set habitat_heater to OFF