// Referenze agli elementi HTML principali
const statusBtn = document.getElementById('connection-status');

// ==========================================
// CONFIGURAZIONE MQTT
// ==========================================
const brokerUrl = 'ws://mars_admin:mars_admin@localhost:15675/ws'; // Usa la tua password reale

const client = mqtt.connect(brokerUrl, {
    reconnectPeriod: 5000,
    clientId: 'mars_dashboard_' + Math.random().toString(16).substr(2, 8),
    keepalive: 15,
    clean: true
});

// ==========================================
// GESTIONE CONNESSIONE E ISCRIZIONE
// ==========================================
client.on('connect', () => {
    console.log("Connected to RabbitMQ via WebSockets!");
    statusBtn.innerText = "Connected (Live)";
    statusBtn.style.backgroundColor = "var(--color-green)";

    client.subscribe('#', (err) => {
        if (err) console.error("Subscription error:", err);
        else console.log("Listening for real-time data...");
    });
});

// ==========================================
// GESTIONE RICEZIONE MESSAGGI E AGGIORNAMENTO UI
// ==========================================
client.on('message', (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());

        // Estrazione sicura dal nuovo formato del Normalizer
        const value = payload.measurements && payload.measurements.value !== undefined 
            ? payload.measurements.value 
            : payload.value;
            
        const metric = payload.measurements && payload.measurements.metric !== undefined 
            ? payload.measurements.metric 
            : payload.metric;

        // Smistamento ai vari riquadri
        switch(payload.sensor_id) {
            
            // --- SENSORI REST ---
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
                
            // --- STREAM TELEMETRICI ---
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
                // Eliminato il print del prefisso "radiation_uSv_h", mostra solo il numero ed l'unità
                document.getElementById('rad-val').innerText = `${value} ${payload.unit}`;
                updateStatusDisplay('rad-led', 'rad-badge', payload.status);
                break;
                
            case "mars/telemetry/life_support":
                // Sostituisce la key JSON per l'ossigeno in un testo leggibile e in inglese
                let displayMetric = metric;
                if (metric === "oxygen_percent") {
                    displayMetric = "oxygen percent";
                }
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

// Funzione helper intelligente per gestire LED e Badge di testo
function updateStatusDisplay(ledId, badgeId, status) {
    const led = document.getElementById(ledId);
    const badge = document.getElementById(badgeId);
    if (!led) return;
    
    // Reset iniziale
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

    // Gestione degli errori / warning
    if (s === 'WARNING' || s === 'ERROR') {
        led.classList.add('led-red');
        if (badge) {
            badge.innerText = s;
            badge.style.display = 'inline-block';
            badge.style.backgroundColor = 'var(--color-yellow)';
        }
    } 
    // Gestione stati operativi (Ok, Idle, Pressurizing...)
    else {
        led.classList.add('led-green');
        
        // Se è verde ma non è "OK", è uno stato speciale (es. Airlock)
        if (s !== 'OK' && badge) {
            badge.innerText = s;
            badge.style.display = 'inline-block';
            badge.style.backgroundColor = 'var(--color-blue)';
        }
    }
}

// ==========================================
// GESTIONE ERRORI
// ==========================================
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