# SYSTEM DESCRIPTION:
Our system exposes a dashboard to see the device sensors and a
Automation Rules section to change and set rules
```
............/---------{.Frontend..}
............/...........|...........\
............|...........|............\
............|...{Automation.Engine}...{Actuators}
............|...../...........\
............|..../.............\
........[Broker].........[Database]
............|............
............|................
....{Ingestion.Service}
......../..............\
......../................\
(REST.Sensors).....(Telemetry.Streams)
```
# USER STORIES:
**USER STORIES**
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
# CONTAINERS:
Frontend, Automation Engine, Ingestion Service, RabbitMQ, Simulator.
## Dashboard-FE
### USER STORIES:Dashboard
1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13 -20
### PORTS: 
80 (Standard Web Port, or dynamically assigned by the hosting static server)
### DESCRIPTION: 
Serves the main user interface for the Mars IoT Simulator, providing a responsive dashboard for real-time ingested data monitoring and automation rule management.
### PERSISTANCE EVALUATION
The Dashboard-FE container does not include a database. All configurations and rules are fetched from the backend APIs, and real-time state is kept temporarily in memory within the client's browser.
### EXTERNAL SERVICES CONNECTIONS
The Dashboard-FE container connects to external services through the following endpoints:
- **RabbitMQ MQTT Broker**: Connects via WebSockets (`ws://localhost:15675/ws`) for real-time telemetry and rule trigger alerts.
- **Automation Engine API**: Connects via HTTP (`http://localhost:8081/api/rules`) for rules CRUD operations and priority reordering.
- **Simulator Actuators API**: Connects via HTTP (`http://localhost:8080/api/actuators`) to poll actuator states and send manual toggle commands.

### MICROSERVICES:
#### MICROSERVICE: dashboard-fe
- TYPE: frontend
- DESCRIPTION: This microservice serves the main user interface for monitoring and automation management. The Dashboard-FE container is a Single Page Application built with Vanilla JavaScript, HTML5, and custom CSS. It is responsible for establishing a WebSocket connection to the RabbitMQ MQTT broker to receive real-time ingestion data and event alerts. 
It updates the UI dynamically, featuring advanced CSS-driven animations. 
Furthermore, it interacts with the Automation Engine's REST API to manage priority-based automation rules and polls the simulator for manual actuator overrides.
- PORTS: 80
- TECHNOLOGICAL SPECIFICATION:
  The microservice is built strictly with raw web technologies to maintain a lightweight footprint:
  - **HTML5:** Provides the semantic layout, including a split-pane structure for the Live Dashboard and a hidden container for Automation Rules.
  - **CSS3:** Implements a custom Post-Brutalist design system (thick borders, solid drop shadows, stark contrast). It utilizes CSS Grid (`grid-auto-flow: dense`) for dynamic, screen-filling widget placement that avoids vertical scrolling on 1080p screens.
  - **Vanilla JavaScript (ES6+):** Handles DOM manipulation, asynchronous REST API requests (`fetch()`), and real-time payload mapping without heavy frameworks.
  - **MQTT.js:** Loaded via CDN to seamlessly manage the WebSocket connection and subscriptions to the MQTT broker.
- SERVICE ARCHITECTURE:
  The service operates as a Single Page Application divided into key sections managed by JavaScript:
  - **Live Dashboard (`#view-dashboard`)**: Divided into a 3-column `pane-rest` and a 5-column `pane-telemetry` to logically separate standard sensors from complex systems.
  - **Rules Management (`#view-rules`)**: A horizontal form for rule creation and an auto-scrolling list container for active rules, displaying priority indexing and editing actions.
  - **Toast Notifications**: An absolute-positioned container (`#toast-container`) that handles sliding popup messages triggered by specific MQTT automation events.
- PAGES:
	| Name | Description | Related Microservice | User Stories |
	| ---- | ----------- | -------------------- | ------------ |
	| index.html | Main and only page. Dynamically toggles between Live Dashboard and Automation Rules views. | dashboard-fe | TO-DO |

## Automation Engine:
### DESCRIPTION:
The automation engine's role is to receive the events and check the rules
### USER STORIES:
1-8, 10-12, 22
### PORTS:
`8081: Rest Interface`
### PERSISTENCE EVALUATION
The automation engine uses a persistent SQLite database, 
mounted as a docker volume.
### EXTERNAL SERVICES CONNECTIONS
The automation engine connects to the RabbitMQ service, in order to send
the events queues.
### MICROSERVICES:
#### MICROSERVICE: Automation Engine
- TYPE: backend
- DESCRIPTION: The automation engine's role is to receive the events and check the rules
- PORTS: `8081: Rest Interface`
- TECHNOLOGICAL SPECIFICATION:  Rules are stored in a SQLite database, are queried by the automation-engine to be applied based on the correct priority. The rule evaluation is event based for each event that is retrieved on the MQTT queue.
- SERVICE ARCHITECTURE: The automation-engine reads messages on the RabbitMQ service, and makes REST calls to the actuators.
- ENDPOINTS:
```
| HTTP METHOD | URL                          | Description                        | User Stories |
| GET         | /api/rules                   | list all rules                     | ------------ |
| POST        | /api/rules                   | create a rule                      | ------------ |
| GET         | /api/rules/<id>              | get one rule                       | ------------ |
| PUT         | /api/rules/<id>              | update a rule                      | ------------ |
| DELETE      | /api/rules/<id>              | delete a rule                      | ------------ |
| POST        | /api/rules/<id>/move         | swap with adjacent rule            | ------------ |
| GET         | /api/state                   | get all latest sensor values       | ------------ |
| GET         | /api/state/<sensor_id>       | get latest value for one sensor    | ------------ |
| GET         | /api/actuators               | list all actuators + current state | ------------ |
| GET         | /api/actuators/<name>        | get one actuator state             | ------------ |
| POST        | /api/actuators/<name>        | set actuator state (ON/OFF)        | ------------ |
| GET         | /health                      | health check                       | ------------ |
```
- DB STRUCTURE: 
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






## Ingestion Service:
### DESCRIPTION:
The ingestion service receives events from the sensors and maps them to a common schema, then
writes them to the RabbiMQ common queue
### USER STORIES:
13-17, 19,20, 23, 24
### DESCRIPTION:
The container acts as a **data ingestion and transformation layer**.  
It gathers data from both REST sensors and telemetry streams, converts them into a standardized internal representation, and publishes them to a shared messaging queue in RabbitMQ.
### PERSISTENCE EVALUATION
The Ingestion Service does not persist data.
### EXTERNAL SERVICES CONNECTIONS
- RabbitMQ
- Simulator


### MICROSERVICES:

#### MICROSERVICE: ingestion-service
- TYPE: backend
- DESCRIPTION: This microservice is responsible for acquiring data from heterogeneous sensor sources and transforming it into a standardized format used internally by the automation system. It polls REST endpoints and listens to telemetry streams, maps the data to a common schema, and publishes the normalized events to the RabbitMQ broker.
- TECHNOLOGICAL SPECIFICATION:
- **Flask / FastAPI (REST interface)** for managing REST-based ingestion endpoints
- **Paho-MQTT client** for publishing messages to RabbitMQ
- **Requests library** for polling REST sensors
- **Async processing / scheduled polling** for periodically retrieving sensor updates

- SERVICE ARCHITECTURE:
- **REST Sensor Polling**
    - Periodically sends HTTP requests to simulator endpoints.
    - Parses JSON responses.
    - Converts them into the internal sensor event schema.
- **Telemetry Stream Listener**
    - Subscribes to simulator telemetry streams.
    - Processes incoming messages in real time.
    - Maps them to the normalized event format.



## RabbitMQ:

### DESCRIPTION:
RabbitMQ acts as the messaging broker, distributing sensor events between services.
### USER STORIES:
`1883` (MQTT), `15672` (Management UI), `15675` (MQTT WebSocket)
### DESCRIPTION:
The container acts as a **data ingestion and transformation layer**.  
It gathers data from both REST sensors and telemetry streams, converts them into a standardized internal representation, and publishes them to a shared messaging queue in RabbitMQ.
### PERSISTENCE EVALUATION
Events are transient and used only for real-time messaging.
### EXTERNAL SERVICES CONNECTIONS
Receives events from **Ingestion Service** and delivers them to **Automation Engine** and **Dashboard-FE**.
### MICROSERVICE: rabbitmq
- **TYPE:** messaging broker
- **DESCRIPTION:** Handles asynchronous communication via MQTT topics.
- **PORTS:** `1883`, `15672`, `15675`
- **TECHNOLOGICAL SPECIFICATION:** RabbitMQ with MQTT plugin enabled.
- **SERVICE ARCHITECTURE:** Publishes and distributes normalized sensor events to subscribed services.