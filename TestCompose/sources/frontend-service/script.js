// Referenze agli elementi HTML principali
const statusBtn = document.getElementById('connection-status');

// ==========================================
// CONFIGURAZIONE MQTT
// ==========================================
const brokerUrl = 'ws://mars_admin:mars_admin@localhost:15675/ws';

const client = mqtt.connect(brokerUrl, {
    reconnectPeriod: 5000,
    clientId: 'mars_dashboard_' + Math.random().toString(16).substr(2, 8),
    keepalive: 15,   // <-- Aggiungi questo: invia un ping ogni 15 secondi
    clean: true      // <-- Opzionale, ma consigliato per le dashboard
});

// Funzione helper per aggiornare i LED
function updateLedStatus(ledId, status) {
    const led = document.getElementById(ledId);
    if (!led) return;
    
    // Rimuove le classi precedenti
    led.classList.remove('led-green', 'led-red');
    
    // Assumiamo che "ok" o uno status mancante indichi che va tutto bene
    if (!status || status.toLowerCase() === 'ok') {
        led.classList.add('led-green');
    } else {
        // Qualsiasi altro stato (es. "error", "warning") accende il LED rosso
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
        console.log(`[Nuovo Dato] ${topic}:`, payload);

        // --- ADATTAMENTO AL NUOVO FORMATO INGESTION SERVICE ---
        // Estraiamo 'value' e 'metric' dall'oggetto 'measurements' se esiste, 
        // altrimenti fallback sui valori nella root
        const value = payload.measurements && payload.measurements.value !== undefined 
            ? payload.measurements.value 
            : payload.value;
            
        const metric = payload.measurements && payload.measurements.metric !== undefined 
            ? payload.measurements.metric 
            : payload.metric;

        // Controlliamo l'ID del sensore e aggiorniamo il riquadro + LED HTML corrispondente
        switch(payload.sensor_id) {
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
                
                if (metric === "fill_percentage") {
                    document.getElementById('water-perc-val').innerText = `${waterValue} ${payload.unit}`;
                } else if (metric === "level_liters") {
                    document.getElementById('water-liters-val').innerText = `${waterValue} ${payload.unit}`;
                }
                
                // Aggiorniamo il LED di stato
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
                
                // Usa includes() così funziona sia se arriva "pm1" sia se arriva "pm1_ug_m3"
                if (metric.includes("pm1") && !metric.includes("pm10")) {
                    document.getElementById('pm1-val').innerText = `${pmValue} ${payload.unit}`;
                } else if (metric.includes("pm25")) {
                    document.getElementById('pm25-val').innerText = `${pmValue} ${payload.unit}`;
                } else if (metric.includes("pm10")) {
                    document.getElementById('pm10-val').innerText = `${pmValue} ${payload.unit}`;
                }
                
                updateLedStatus('pm-led', payload.status);
                break;

            case "air_quality_voc":
                document.getElementById('voc-val').innerText = `${value} ${payload.unit}`;
                updateLedStatus('voc-led', payload.status);
                break;
                
            case "hydroponic_ph":
                // Mostra il valore e l'unità di misura se presente
                const unit = payload.unit ? ` ${payload.unit}` : '';
                document.getElementById('ph-val').innerText = `${value}${unit}`;
                updateLedStatus('ph-led', payload.status);
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
    
    // Opzionale: rimette tutti i LED grigi se si disconnette
    const leds = document.querySelectorAll('.status-led');
    leds.forEach(led => {
        led.classList.remove('led-green', 'led-red');
    });
});