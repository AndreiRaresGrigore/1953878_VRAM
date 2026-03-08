# Mars Habitat Automation Platform

## User Stories
**Role: Mars Operations Engineer (Focus: Configuration, automation, and technical data)**
1. As a Mars Operations Engineer, I want to create new automation rules through a graphical form so that I can control the base climate without having to write code.
2. As a Mars Operations Engineer, I want to quickly modify the parameters (operator, threshold, state) of an already active rule through an “Edit” button, so that I can calibrate triggers without deleting and recreating the rule.
3. As a Mars Operations Engineer, I want to delete automation rules that are no longer needed so that conflicts in actuator control can be avoided.
4. As a Mars Operations Engineer, I want the system to dynamically evaluate conditions every time an MQTT event arrives so that automation can react with zero latency to environmental changes.
5. As a Mars Operations Engineer, I want to activate and deactivate actuators through an “On/Off” toggle system so that I can control the switching of actuators with priority over the rules. 
6. As a Mars Operations Engineer, I want to combine multiple automation rules together so that actuators can be managed in a more detailed way.
7. As a Mars Operations Engineer, I want to assign higher priority to some automation rules compared to others, with the possibility to change their order using Up and Down side buttons.
8. As a user, I want the system to automatically activate actuators (e.g., fan ON) as soon as a sensor exceeds the threshold defined in a rule.
9. As an Engineer, I want to click on a sensor and see a line chart with the values of the current session so that I can analyze the trend of a parameter over time. 
10. As a Mars Operations Engineer, I want to be notified with a message when a conflict occurs with an already existing rule, and I want the option to choose whether to overwrite the existing rule with the new one or cancel the operation.
11. As a Mars Operations Engineer, when I press the “Edit” button to modify an existing rule, I want to be notified with a message if a conflict occurs with another existing rule, and I want the option to overwrite the existing rule with the new one or cancel the operation.
12. As an Engineer, I want to temporarily disable a rule without deleting it so that I can suspend it during maintenance operations and reactivate it later without having to recreate it from scratch. *(TO DO)*
**Role: Special Team Performance Supervisor (Focus: Safety, overview, and crew health)**
13. As a Supervisor, I want to see a line chart that compares solar production and energy consumption in real time so that I can immediately understand whether the habitat is in energy surplus or deficit. *(TO DO)*
14. As the Special Team Supervisor, I want a single live dashboard that collects all REST and telemetry sensors so that I can have a complete overview of the base in one screen.
15. As the Special Team Supervisor, I want to easily navigate between the sensor view, chart view, and automation rules view through a tab system so that I do not lose operational context.
16. As the Special Team Supervisor, I want to see a LED (green/red) and a badge on each sensor so that I can instantly notice any “Warning” states in the habitat.
17. As the Special Team Supervisor, I want to read the text “Updated: X time ago” under each sensor so that I can quickly understand if a device has disconnected or is not sending recent data.
18. As the Special Team Supervisor, I want to consult the list of active rules so that I can ensure that the automations set by the team do not put the mission at risk.
19. As the Special Team Supervisor, I want a button at the top right that indicates whether the dashboard is connected (“Connected (Live)”) or disconnected so that I can understand if the displayed data is reliable.
20. As a Supervisor, I want to receive a visible toast notification when a rule triggers and changes the state of an actuator so that I can distinguish automatic actions from manual ones.
**Role: System Administrator (Focus: Infrastructure, backend, and architecture)**
21. As a System Administrator, I want to start all microservices (broker, database, backend, frontend) with a single `docker-compose` command so that immediate reproducibility on any server is guaranteed.
22. As a System Administrator, I want automation rules to be stored in a persistent SQLite database on a Docker volume so that configurations survive container restarts.
23. As a System Administrator, I want heterogeneous data coming from sensors (REST or Stream) to be captured and normalized into a universal internal JSON format so that the automation engine workflow is standardized.
24. As a System Administrator, I want the backend to keep the latest state of each sensor in memory (RAM) so that these data can be quickly provided through REST endpoints without querying a historical database.
25. As a System Administrator, I want to configure CORS policies on the Python APIs so that the frontend can safely perform PUT, POST, and DELETE calls to the engine even if it runs on different ports.
26. As a System Administrator, I want the Automation Engine to validate the rule syntax (valid operators, numeric values) before saving it in the database so that invalid rules are not stored in the DB.

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
  "device_id": "greenhouse_temp_sensor_01",
  "device_type": "sensor",
  "timestamp": "2026-03-08T12:10:15Z",
  "status": "ok",
  "metadata": {
    "subsystem": "greenhouse",
    "segment": "north"
  },
  "measurements": [
    {
      "metric": "temperature",
      "value": 24.7,
      "unit": "C"
    },
    {
      "metric": "humidity",
      "value": 48.2,
      "unit": "%"
    }
  ]
}
```

## Rule Model

Rules follow this syntax:
IF <sensor_id> <operator> <value> [unit]
THEN set <actuator_name> to ON | OFF

Supported operators: <, <=, =, >, >=

Rules are saved in the table:

**_Rule_** : | **_id_** | position | sensor_id | metric | operator | threshold | actuator_name | actuator_state | description |
```
Rule schema:
  id            INTEGER PRIMARY KEY AUTOINCREMENT
  position      INTEGER UNIQUE  — priority order (1 = highest priority)
  sensor_id     TEXT    — e.g. "greenhouse_temperature"
  metric        TEXT    — e.g. "temperature_c"  (optional filter; if empty, matches any metric for that sensor)
  operator      TEXT    — one of: <  <=  =  >=  >
  threshold     REAL    — numeric threshold
  actuator_name TEXT    — e.g. "cooling_fan"
  actuator_state TEXT   — "ON" or "OFF"
  description   TEXT    — human-readable label (optional)
```

### Examples
- IF greenhouse_temperature > 28 THEN set cooling_fan to ON
- IF co2_hall > 2000 THEN set hall_ventilation to ON
- IF water_tank_level < 20 THEN set habitat_heater to OFF