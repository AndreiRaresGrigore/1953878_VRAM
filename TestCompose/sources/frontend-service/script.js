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
        console.log(`[Live Data] ${topic}:`, payload);

        // 1. GESTIONE DEL TEMPO (Usando captured_at se disponibile)
        const timeId = timeElementMap[payload.sensor_id];
        if (timeId) {
            lastUpdatedTimes[timeId] = payload.captured_at ? new Date(payload.captured_at) : new Date();
            updateTimeDisplay(timeId); 
        }

        // Helper per cercare un parametro specifico nell'array measurements
        const getMeasure = (paramName) => payload.measurements.find(m => m.parameter === paramName);

        // 2. LOGICA DI AGGIORNAMENTO UI
        switch(payload.sensor_id) {
            case "greenhouse_temperature": {
                const m = getMeasure("temperature");
                if (m) document.getElementById('temp-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('temp-led', 'temp-badge', payload.status);
                break;
            }
            case "corridor_pressure": {
                const m = getMeasure("pressure");
                if (m) document.getElementById('press-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('press-led', 'press-badge', payload.status);
                break;
            }
            case "water_tank_level": {
                const perc = getMeasure("fill_percentage");
                const liters = getMeasure("level_liters");
                if (perc) document.getElementById('water-perc-val').innerText = `${perc.value} ${perc.unit}`;
                if (liters) document.getElementById('water-liters-val').innerText = `${liters.value} ${liters.unit}`;
                updateStatusDisplay('water-led', 'water-badge', payload.status);
                break;
            }
            case "co2_hall": {
                const m = getMeasure("co2_level");
                if (m) document.getElementById('co2-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('co2-led', 'co2-badge', payload.status);
                break;
            }
            case "entrance_humidity": {
                const m = getMeasure("humidity");
                if (m) document.getElementById('hum-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('hum-led', 'hum-badge', payload.status);
                break;
            }
            case "air_quality_pm25": {
                const pm1 = getMeasure("pm1.0");
                const pm25 = getMeasure("pm2.5");
                const pm10 = getMeasure("pm10");
                if (pm1) document.getElementById('pm1-val').innerText = `${pm1.value} ${pm1.unit}`;
                if (pm25) document.getElementById('pm25-val').innerText = `${pm25.value} ${pm25.unit}`;
                if (pm10) document.getElementById('pm10-val').innerText = `${pm10.value} ${pm10.unit}`;
                updateStatusDisplay('pm-led', 'pm-badge', payload.status);
                break;
            }
            case "air_quality_voc": {
                const m = getMeasure("voc_index");
                if (m) document.getElementById('voc-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('voc-led', 'voc-badge', payload.status);
                break;
            }
            case "hydroponic_ph": {
                const m = getMeasure("ph");
                if (m) document.getElementById('ph-val').innerText = `${m.value}${m.unit ? ' ' + m.unit : ''}`;
                updateStatusDisplay('ph-led', 'ph-badge', payload.status);
                break;
            }
            // Telemetria (Esempi basati sui parametri comuni)
            case "mars/telemetry/solar_array":
            case "mars/telemetry/power_bus":
            case "mars/telemetry/power_consumption":
            case "mars/telemetry/thermal_loop":
            case "mars/telemetry/radiation":
            case "mars/telemetry/airlock": {
                const m = payload.measurements[0]; // Spesso hanno un solo valore primario
                const targetId = timeId.replace('-time', '-val');
                if (m && document.getElementById(targetId)) {
                    document.getElementById(targetId).innerText = `${m.value} ${m.unit}`;
                }
                const ledId = timeId.replace('-time', '-led');
                const badgeId = timeId.replace('-time', '-badge');
                updateStatusDisplay(ledId, badgeId, payload.status);
                break;
            }
            case "mars/telemetry/life_support": {
                const oxy = getMeasure("oxygen_percent");
                if (oxy) document.getElementById('life-val').innerText = `O2: ${oxy.value} ${oxy.unit}`;
                updateStatusDisplay('life-led', 'life-badge', payload.status);
                break;
            }
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