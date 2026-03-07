// ==========================================
// 1. VARIABILI E MAPPE
// ==========================================
const statusBtn = document.getElementById('connection-status');
const lastUpdatedTimes = {};

// URL delle API del Simulatore per il polling degli attuatori
const ACTUATORS_API_URL = 'http://localhost:8080/api/actuators';

const timeElementMap = {
    // Sensori
    "greenhouse_temperature": "temp-time",
    "corridor_pressure": "press-time",
    "water_tank_level": "water-time",
    "co2_hall": "co2-time",
    "entrance_humidity": "hum-time",
    "air_quality_pm25": "pm-time",
    "air_quality_voc": "voc-time",
    "hydroponic_ph": "ph-time",
    "mars/telemetry/solar_array": "solar-time",
    "mars/telemetry/power_bus": "bus-time",
    "mars/telemetry/power_consumption": "cons-time",
    "mars/telemetry/thermal_loop": "thermal-time",
    "mars/telemetry/radiation": "rad-time",
    "mars/telemetry/life_support": "life-time",
    "mars/telemetry/airlock": "airlock-time",
    
    // Attuatori
    "cooling_fan": "fan-time",
    "entrance_humidifier": "humidifier-time",
    "hall_ventilation": "vent-time",
    "habitat_heater": "heater-time"
};

const sensorMetricsMap = {
    "greenhouse_temperature": ["temperature_c"],
    "entrance_humidity": ["humidity_pct"],
    "co2_hall": ["co2_ppm"],
    "corridor_pressure": ["pressure_kpa"],
    "water_tank_level": ["fill_percentage", "level_liters"],
    "air_quality_pm25": ["pm1", "pm25", "pm10"],
    "hydroponic_ph": ["ph"],
    "mars/telemetry/solar_array": ["power_kw"],
    "mars/telemetry/radiation": ["radiation_usv_h"],
    "mars/telemetry/life_support": ["oxygen_percent"],
    "mars/telemetry/thermal_loop": ["temperature_c"]
};

// ==========================================
// 2. FUNZIONI HELPER
// ==========================================

function formatTimeAgo(timestamp) {
    const seconds = Math.floor((new Date() - timestamp) / 1000);
    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes === 1) return `1 min ago`;
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
}

function updateTimeDisplay(timeId) {
    const el = document.getElementById(timeId);
    if (el && lastUpdatedTimes[timeId]) {
        el.innerText = `Updated: ${formatTimeAgo(lastUpdatedTimes[timeId])}`;
    }
}

// Stile per i Sensori
function updateStatusDisplay(ledId, badgeId, status) {
    const led = document.getElementById(ledId);
    const badge = document.getElementById(badgeId);
    if (!led) return;
    
    led.classList.remove('led-green', 'led-red');
    if (badge) {
        badge.style.display = 'none';
        badge.innerText = '';
    }
    
    if (!status) {
        led.classList.add('led-green');
        return;
    }

    const s = status.toString().toUpperCase();

    if (s === 'WARNING' || s === 'ERROR') {
        led.classList.add('led-red');
        if (badge) {
            badge.innerText = s;
            badge.style.display = 'inline-block';
            badge.style.backgroundColor = 'var(--color-yellow)';
        }
    } else {
        led.classList.add('led-green');
        if (s !== 'OK' && badge) {
            badge.innerText = s;
            badge.style.display = 'inline-block';
            badge.style.backgroundColor = 'var(--color-blue)';
        }
    }
}

function updateMetricOptions() {
    const sensorSelect = document.getElementById('rule-sensor');
    const metricSelect = document.getElementById('rule-metric');
    const selectedSensor = sensorSelect.value;
    
    metricSelect.innerHTML = ''; // Svuota opzioni precedenti
    
    if (sensorMetricsMap[selectedSensor]) {
        sensorMetricsMap[selectedSensor].forEach(metric => {
            const opt = document.createElement('option');
            opt.value = metric;
            opt.innerText = metric;
            metricSelect.appendChild(opt);
        });
    } else {
        const opt = document.createElement('option');
        opt.value = "";
        opt.innerText = "No metrics found";
        metricSelect.appendChild(opt);
    }
}

// Stile semplificato per gli Attuatori (ON = Verde, OFF = Rosso)
function updateActuatorDisplay(ledId, state) {
    const led = document.getElementById(ledId);
    if (!led) return;
    
    led.classList.remove('led-green', 'led-red');
    if (state === 'ON') {
        led.classList.add('led-green');
    } else if (state === 'OFF') {
        led.classList.add('led-red'); 
    }
}

// ==========================================
// 3. POLLING DEGLI ATTUATORI VIA REST
// ==========================================
async function fetchActuators() {
    try {
        const response = await fetch(ACTUATORS_API_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        const actuators = data.actuators;

        for (const [actuatorName, state] of Object.entries(actuators)) {
            // 1. Aggiorna il tracker del tempo
            const timeId = timeElementMap[actuatorName];
            if (timeId) {
                lastUpdatedTimes[timeId] = new Date();
                updateTimeDisplay(timeId);
            }

            // 2. Smista ai riquadri degli attuatori
            switch(actuatorName) {
                case "cooling_fan":
                    document.getElementById('fan-val').innerText = state;
                    updateActuatorDisplay('fan-led', state);
                    break;
                case "entrance_humidifier":
                    document.getElementById('humidifier-val').innerText = state;
                    updateActuatorDisplay('humidifier-led', state);
                    break;
                case "hall_ventilation":
                    document.getElementById('vent-val').innerText = state;
                    updateActuatorDisplay('vent-led', state);
                    break;
                case "habitat_heater":
                    document.getElementById('heater-val').innerText = state;
                    updateActuatorDisplay('heater-led', state);
                    break;
            }
        }
    } catch (error) {
        console.error("Error fetching actuators:", error);
    }
}

// Avvia il polling subito e poi ogni 5 secondi
fetchActuators();
setInterval(fetchActuators, 5000);

// ==========================================
// 4. CONFIGURAZIONE E CONNESSIONE MQTT (Per i Sensori)
// ==========================================
const brokerUrl = 'ws://mars_admin:mars_admin@localhost:15675/ws'; 

const client = mqtt.connect(brokerUrl, {
    reconnectPeriod: 5000,
    clientId: 'mars_dashboard_' + Math.random().toString(16).substr(2, 8),
    keepalive: 15,
    clean: true
});

client.on('connect', () => {
    console.log("Connected to RabbitMQ via WebSockets!");
    statusBtn.innerText = "Connected (Live)";
    statusBtn.style.backgroundColor = "var(--color-green)";
    client.subscribe('#', (err) => {
        if (err) console.error("Subscription error:", err);
    });
});

// ==========================================
// 5. GESTIONE RICEZIONE MESSAGGI (Solo Sensori)
// ==========================================
client.on('message', (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        console.log('[Live Data] ${topic}:', payload);

        // GESTIONE DEL TEMPO
        try {
            const timeId = timeElementMap[payload.sensor_id];
            if (timeId) {
                lastUpdatedTimes[timeId] = new Date();
                updateTimeDisplay(timeId); 
            }
        } catch (timeErr) {}

        const value = payload.measurements && payload.measurements.value !== undefined 
            ? payload.measurements.value 
            : payload.value;
            
        const metric = payload.measurements && payload.measurements.metric !== undefined 
            ? payload.measurements.metric 
            : payload.metric;

        switch(payload.sensor_id) {
            case "greenhouse_temperature":
                document.getElementById('temp-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('temp-led', 'temp-badge', payload.status);
                break;
            case "corridor_pressure":
                document.getElementById('press-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('press-led', 'press-badge', payload.status);
                break;
            case "water_tank_level":
                const waterValue = value !== undefined ? value : 0;
                if (metric === "fill_percentage") document.getElementById('water-perc-val').innerText = `${waterValue} ${payload.unit}`;
                else if (metric === "level_liters") document.getElementById('water-liters-val').innerText = `${waterValue} ${payload.unit}`;
                updateStatusDisplay('water-led', 'water-badge', payload.status);
                break;
            case "co2_hall":
                document.getElementById('co2-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('co2-led', 'co2-badge', payload.status);
                break;
            case "entrance_humidity":
                document.getElementById('hum-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('hum-led', 'hum-badge', payload.status);
                break;
            case "air_quality_pm25":
                const pmValue = value !== undefined ? value : 0;
                if (metric.includes("pm1") && !metric.includes("pm10")) document.getElementById('pm1-val').innerText = `${pmValue} ${payload.unit}`;
                else if (metric.includes("pm25")) document.getElementById('pm25-val').innerText = `${pmValue} ${payload.unit}`;
                else if (metric.includes("pm10")) document.getElementById('pm10-val').innerText = `${pmValue} ${payload.unit}`;
                updateStatusDisplay('pm-led', 'pm-badge', payload.status);
                break;
            case "air_quality_voc":
                document.getElementById('voc-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('voc-led', 'voc-badge', payload.status);
                break;
            case "hydroponic_ph":
                const unit = payload.unit ? ` ${payload.unit}` : '';
                document.getElementById('ph-val').innerText = `${value}${unit}`;
                updateStatusDisplay('ph-led', 'ph-badge', payload.status);
                break;
            case "mars/telemetry/solar_array":
                document.getElementById('solar-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('solar-led', 'solar-badge', payload.status);
                break;
            case "mars/telemetry/power_bus":
                document.getElementById('bus-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('bus-led', 'bus-badge', payload.status);
                break;
            case "mars/telemetry/power_consumption":
                document.getElementById('cons-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('cons-led', 'cons-badge', payload.status);
                break;
            case "mars/telemetry/thermal_loop":
                document.getElementById('thermal-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('thermal-led', 'thermal-badge', payload.status);
                break;
            case "mars/telemetry/radiation":
                document.getElementById('rad-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('rad-led', 'rad-badge', payload.status);
                break;
            case "mars/telemetry/life_support":
                let displayMetric = metric === "oxygen_percent" ? "oxygen percentage" : metric;
                document.getElementById('life-val').innerText = `${displayMetric}: ${value} ${payload.unit}`;
                updateStatusDisplay('life-led', 'life-badge', payload.status);
                break;
            case "mars/telemetry/airlock":
                document.getElementById('airlock-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('airlock-led', 'airlock-badge', payload.status);
                break;    
            default:
                break;
        }
    } catch (e) {
        console.error("Error parsing MQTT message:", e);
    }
});

// ==========================================
// 6. LOOP TEMPORALE E GESTIONE ERRORI
// ==========================================
setInterval(() => {
    for (const timeId of Object.values(timeElementMap)) {
        updateTimeDisplay(timeId);
    }
}, 10000);

client.on('error', (err) => {
    console.error("MQTT Error:", err);
    statusBtn.innerText = "Connection Error";
    statusBtn.style.backgroundColor = "lightcoral";
});

client.on('close', () => {
    statusBtn.innerText = "Disconnected";
    statusBtn.style.backgroundColor = "var(--bg-color)";
    const leds = document.querySelectorAll('.status-led');
    leds.forEach(led => led.classList.remove('led-green', 'led-red'));
});

// ==========================================
// 7. GESTIONE TAB (NAVIGAZIONE)
// ==========================================
function switchTab(tabName) {
    // Gestione visualizzazione div
    document.getElementById('view-dashboard').style.display = tabName === 'dashboard' ? 'block' : 'none';
    document.getElementById('view-rules').style.display = tabName === 'rules' ? 'block' : 'none';
    
    // Gestione stile bottoni
    document.getElementById('tab-dashboard').classList.toggle('active', tabName === 'dashboard');
    document.getElementById('tab-rules').classList.toggle('active', tabName === 'rules');

    // Se apriamo le regole, aggiorniamo la lista dal database
    if (tabName === 'rules') {
        fetchRules();
    }
}

// ==========================================
// 8. AUTOMATION RULES MANAGEMENT (CRUD)
// ==========================================
// NOTA: Assicurati che il tuo automation-engine esponga queste rotte sulla porta 8000
const ENGINE_API_URL = 'http://localhost:8081/api/rules';

// Carica le regole dal Database
async function fetchRules() {
    const listContainer = document.getElementById('rules-list');
    try {
        const response = await fetch(ENGINE_API_URL);
        if (!response.ok) throw new Error("Errore nel caricamento delle regole");
        
        const rules = await response.json();
        listContainer.innerHTML = ''; 
        
        if (rules.length === 0) {
            listContainer.innerHTML = '<p style="color: #666;">No active rules found. Create one above.</p>';
            return;
        }

        rules.forEach(rule => {
            const ruleElement = document.createElement('div');
            ruleElement.className = 'rule-card';
            // Visualizza metrica se presente
            const metricDisplay = rule.metric ? `.<span class="highlight">${rule.metric}</span>` : '';
            ruleElement.innerHTML = `
                <div class="rule-logic">
                    IF <span class="highlight">${rule.sensor_id}</span>${metricDisplay} 
                    ${rule.operator} 
                    <span class="highlight">${rule.threshold}</span> 
                    THEN SET <span class="highlight">${rule.actuator_name}</span> 
                    TO <span class="highlight">${rule.actuator_state}</span>
                </div>
                <button class="btn btn-red" onclick="deleteRule(${rule.id})">🗑️ Delete</button>
            `;
            listContainer.appendChild(ruleElement);
        });
    } catch (error) {
        console.error(error);
        listContainer.innerHTML = '<p style="color: red;">⚠️ Cannot connect to Automation Engine API.</p>';
    }
}

// Invia una nuova regola al Database
document.getElementById('add-rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const newRule = {
        sensor_id: document.getElementById('rule-sensor').value,
        metric: document.getElementById('rule-metric').value, // Prende il valore dal nuovo select
        operator: document.getElementById('rule-operator').value,
        threshold: parseFloat(document.getElementById('rule-threshold').value),
        actuator_name: document.getElementById('rule-actuator').value,
        actuator_state: document.getElementById('rule-state').value,
        description: 'Created from Frontend'
    };

    try {
        const response = await fetch(ENGINE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRule)
        });

        if (response.ok) {
            document.getElementById('rule-threshold').value = ''; 
            fetchRules(); 
        } else {
            alert('Error adding rule. Check the Automation Engine logs.');
        }
    } catch (error) {
        console.error("Errore salvataggio regola:", error);
        alert('Cannot reach the Automation Engine.');
    }
});

// Elimina una regola dal Database
async function deleteRule(ruleId) {
    if (!confirm('Are you sure you want to delete this automation rule?')) return;

    try {
        const response = await fetch(`${ENGINE_API_URL}/${ruleId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            fetchRules(); // Ricarica la lista visiva
        }
    } catch (error) {
        console.error("Errore eliminazione regola:", error);
    }
}