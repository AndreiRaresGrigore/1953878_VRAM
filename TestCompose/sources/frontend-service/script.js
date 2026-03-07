// Referenze agli elementi HTML principali
const statusBtn = document.getElementById('connection-status');

// ==========================================
// CONFIGURAZIONE MQTT
// ==========================================
const brokerUrl = 'ws://mars_admin:mars_admin@localhost:15675/ws'; // Usa la tua password reale

const client = mqtt.connect(brokerUrl, {
    reconnectPeriod: 5000,
    clientId: 'mars_dashboard_' + Math.random().toString(16).substr(2, 8),
});

// Funzione helper per aggiornare i LED
function updateLedStatus(ledId, status) {
    const led = document.getElementById(ledId);
    if (!led) return;
    
    // Rimuove le classi precedenti
    led.classList.remove('led-green', 'led-red');
    
    // Se lo status non c'è, o se è "ok" (ignorando maiuscole/minuscole), LED Verde.
    // Altrimenti, per stati come "warning", "IDLE", o "DEPRESSURIZING", LED Rosso.
    if (!status || status.toString().toLowerCase() === 'ok') {
        led.classList.add('led-green');
    } else {
        led.classList.add('led-red');
    }
}

// ==========================================
// GESTIONE CONNESSIONE E ISCRIZIONE
// ==========================================
client.on('connect', () => {
    console.log("Connesso a RabbitMQ via WebSockets!");
    statusBtn.innerText = "Connesso (Live)";
    statusBtn.style.backgroundColor = "var(--color-green)";

    client.subscribe('#', (err) => {
        if (err) console.error("Errore di iscrizione:", err);
        else console.log("In ascolto dei dati in tempo reale...");
    });
});

// ==========================================
// GESTIONE RICEZIONE MESSAGGI E AGGIORNAMENTO UI
// ==========================================
client.on('message', (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        // console.log(`[Nuovo Dato] ${topic}:`, payload); // Commentato per non intasare la console

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
                updateLedStatus('temp-led', payload.status);
                break;
            case "corridor_pressure":
                document.getElementById('press-val').innerText = `${value} ${payload.unit}`;
                updateLedStatus('press-led', payload.status);
                break;
            case "water_tank_level":
                const waterValue = value !== undefined ? value : 0;
                if (metric === "fill_percentage") document.getElementById('water-perc-val').innerText = `${waterValue} ${payload.unit}`;
                else if (metric === "level_liters") document.getElementById('water-liters-val').innerText = `${waterValue} ${payload.unit}`;
                updateLedStatus('water-led', payload.status);
                break;
            case "co2_hall":
                document.getElementById('co2-val').innerText = `${value} ${payload.unit}`;
                updateLedStatus('co2-led', payload.status);
                break;
            case "entrance_humidity":
                document.getElementById('hum-val').innerText = `${value} ${payload.unit}`;
                updateLedStatus('hum-led', payload.status);
                break;
            case "air_quality_pm25":
                const pmValue = value !== undefined ? value : 0;
                if (metric.includes("pm1") && !metric.includes("pm10")) document.getElementById('pm1-val').innerText = `${pmValue} ${payload.unit}`;
                else if (metric.includes("pm25")) document.getElementById('pm25-val').innerText = `${pmValue} ${payload.unit}`;
                else if (metric.includes("pm10")) document.getElementById('pm10-val').innerText = `${pmValue} ${payload.unit}`;
                updateLedStatus('pm-led', payload.status);
                break;
            case "air_quality_voc":
                document.getElementById('voc-val').innerText = `${value} ${payload.unit}`;
                updateLedStatus('voc-led', payload.status);
                break;
            case "hydroponic_ph":
                const unit = payload.unit ? ` ${payload.unit}` : '';
                document.getElementById('ph-val').innerText = `${value}${unit}`;
                updateLedStatus('ph-led', payload.status);
                break;
                
            // --- STREAM TELEMETRICI ---
            case "mars/telemetry/solar_array":
                document.getElementById('solar-val').innerText = `${value} ${payload.unit}`;
                updateLedStatus('solar-led', payload.status);
                break;
            case "mars/telemetry/power_bus":
                document.getElementById('bus-val').innerText = `${value} ${payload.unit}`;
                updateLedStatus('bus-led', payload.status);
                break;
            case "mars/telemetry/power_consumption":
                document.getElementById('cons-val').innerText = `${value} ${payload.unit}`;
                updateLedStatus('cons-led', payload.status);
                break;
            case "mars/telemetry/thermal_loop":
                document.getElementById('thermal-val').innerText = `${value} ${payload.unit}`;
                updateLedStatus('thermal-led', payload.status);
                break;
            case "mars/telemetry/radiation":
                document.getElementById('rad-val').innerText = `${metric}: ${value} ${payload.unit}`;
                updateLedStatus('rad-led', payload.status);
                break;
            case "mars/telemetry/life_support":
                document.getElementById('life-val').innerText = `${metric}: ${value} ${payload.unit}`;
                updateLedStatus('life-led', payload.status);
                break;
            case "mars/telemetry/airlock":
                document.getElementById('airlock-val').innerText = `${value} ${payload.unit}`;
                document.getElementById('airlock-status').innerText = payload.status;
                updateLedStatus('airlock-led', payload.status);
                break;    

            default:
                break;
        }
    } catch (e) {
        console.error("Errore nel parsing del messaggio MQTT:", e);
    }
});

// ==========================================
// GESTIONE ERRORI
// ==========================================
client.on('error', (err) => {
    console.error("Errore MQTT:", err);
    statusBtn.innerText = "Errore Connessione";
    statusBtn.style.backgroundColor = "lightcoral";
});

client.on('close', () => {
    statusBtn.innerText = "Disconnesso";
    statusBtn.style.backgroundColor = "var(--bg-color)";
    const leds = document.querySelectorAll('.status-led');
    leds.forEach(led => led.classList.remove('led-green', 'led-red'));
});