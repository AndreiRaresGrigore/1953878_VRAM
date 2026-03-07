// Referenze agli elementi HTML principali
const statusBtn = document.getElementById('connection-status');

// ==========================================
// CONFIGURAZIONE MQTT
// Inserisci le tue credenziali funzionanti qui (es. mars_admin:password)
// ==========================================
const brokerUrl = 'ws://mars_admin:mars_admin@localhost:15675/ws';

const client = mqtt.connect(brokerUrl, {
    reconnectPeriod: 5000,
    clientId: 'mars_dashboard_' + Math.random().toString(16).substr(2, 8)
});

// ==========================================
// GESTIONE CONNESSIONE E ISCRIZIONE
// ==========================================
client.on('connect', () => {
    console.log("Connesso a RabbitMQ via WebSockets!");
    statusBtn.innerText = "Connesso (Live)";
    statusBtn.style.backgroundColor = "var(--color-green)";

    // Ascoltiamo tutti i messaggi che iniziano con "sensor/" o "mars/telemetry/"
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

        // Controlliamo l'ID del sensore e aggiorniamo il riquadro HTML corrispondente
        switch(payload.sensor_id) {
            case "greenhouse_temperature":
                document.getElementById('temp-val').innerText = `${payload.value} ${payload.unit}`;
                break;
                
            case "corridor_pressure":
                document.getElementById('press-val').innerText = `${payload.value} ${payload.unit}`;
                break;
                
            case "water_tank_level":
                document.getElementById('water-val').innerText = `${payload.value} ${payload.unit}`;
                break;
                
            case "co2_hall":
                document.getElementById('co2-val').innerText = `${payload.value} ${payload.unit}`;
                break;
                
            case "entrance_humidity":
                document.getElementById('hum-val').innerText = `${payload.value} ${payload.unit}`;
                break;
                
            case "air_quality_pm25":
                // Questo sensore (come si vede nello screenshot) non usa .value ma .pm25
                document.getElementById('pm25-val').innerText = `${payload.pm25} ${payload.unit}`;
                break;
                
            // Se arrivano dati di telemetria (es. solar_array) per cui non abbiamo riquadri, 
            // il codice semplicemente li ignora senza generare errori!
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
});