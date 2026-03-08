// ==========================================
// 1. VARIABILI E MAPPE
// ==========================================
const statusBtn = document.getElementById('connection-status');
const lastUpdatedTimes = {};

const ACTUATORS_API_URL = 'http://localhost:8080/api/actuators';
const ENGINE_API_URL = 'http://localhost:8081/api/rules';

const timeElementMap = {
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
    "air_quality_voc": ["voc_ppb", "co2e_ppm"],
    "hydroponic_ph": ["ph"],
    "mars/telemetry/solar_array": ["power_kw", "voltage_v", "current_a", "cumulative_kwh"],
    "mars/telemetry/power_bus": ["power_kw", "voltage_v", "current_a", "cumulative_kwh"],
    "mars/telemetry/power_consumption": ["power_kw", "voltage_v", "current_a", "cumulative_kwh"],
    "mars/telemetry/radiation": ["radiation_uSv_h"],
    "mars/telemetry/life_support": ["oxygen_percent"],
    "mars/telemetry/thermal_loop": ["temperature_c", "flow_l_min"],
    "mars/telemetry/airlock": ["cycles_per_hour"]
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

function updateStatusDisplay(ledId, badgeId, status) {
    const led = document.getElementById(ledId);
    const badge = document.getElementById(badgeId);
    if (!led) return;
    led.classList.remove('led-green', 'led-red');
    if (badge) { badge.style.display = 'none'; badge.innerText = ''; }
    if (!status) { led.classList.add('led-green'); return; }

    const s = status.toString().toUpperCase();
    if (s === 'WARNING' || s === 'ERROR') {
        led.classList.add('led-red');
        if (badge) {
            badge.innerText = s; badge.style.display = 'inline-block'; badge.style.backgroundColor = 'var(--color-yellow)';
        }
    } else {
        led.classList.add('led-green');
        if (s !== 'OK' && badge) {
            badge.innerText = s; badge.style.display = 'inline-block'; badge.style.backgroundColor = 'var(--color-blue)';
        }
    }
}

function updateActuatorDisplay(ledId, state) {
    const led = document.getElementById(ledId);
    if (!led) return;
    led.classList.remove('led-green', 'led-red');
    if (state === 'ON') led.classList.add('led-green');
    else if (state === 'OFF') led.classList.add('led-red'); 
}

// ==========================================
// 3. POLLING ATTUATORI VIA REST
// ==========================================
async function fetchActuators() {
    try {
        const response = await fetch(ACTUATORS_API_URL);
        if (!response.ok) return;
        const data = await response.json();
        for (const [actuatorName, state] of Object.entries(data.actuators)) {
            const timeId = timeElementMap[actuatorName];
            if (timeId) { lastUpdatedTimes[timeId] = new Date(); updateTimeDisplay(timeId); }
            switch(actuatorName) {
                case "cooling_fan": document.getElementById('fan-val').innerText = state; updateActuatorDisplay('fan-led', state); break;
                case "entrance_humidifier": document.getElementById('humidifier-val').innerText = state; updateActuatorDisplay('humidifier-led', state); break;
                case "hall_ventilation": document.getElementById('vent-val').innerText = state; updateActuatorDisplay('vent-led', state); break;
                case "habitat_heater": document.getElementById('heater-val').innerText = state; updateActuatorDisplay('heater-led', state); break;
            }
        }
    } catch (error) {}
}
fetchActuators(); setInterval(fetchActuators, 5000);

// ==========================================
// 4. CONFIGURAZIONE E RICEZIONE MQTT
// ==========================================
const client = mqtt.connect('ws://mars_admin:mars_admin@localhost:15675/ws', {
    reconnectPeriod: 5000, clientId: 'mars_dashboard_' + Math.random().toString(16).substr(2, 8), keepalive: 15, clean: true
});

client.on('connect', () => {
    statusBtn.innerText = "Connected (Live)"; statusBtn.style.backgroundColor = "var(--color-green)";
    client.subscribe('#');
});

client.on('message', (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        console.log(`[Live Data] ${topic}:`, payload);
        
        // Timer update
        const timeId = timeElementMap[payload.sensor_id];
        if (timeId) {
            lastUpdatedTimes[timeId] = payload.captured_at ? new Date(payload.captured_at) : new Date();
            updateTimeDisplay(timeId); 
        }

        // Helpers per estrarre valori
        const getMeasure = (pName) => payload.measurements ? payload.measurements.find(m => m.parameter === pName) : null;

        // Smistamento Switch con iniezione esclusiva di Valore + Unità (Zero etichette testuali)
        switch(payload.sensor_id) {
            
            // -- REST SENSORS --
            case "greenhouse_temperature": {
                const temp = getMeasure("temperature_c");
                if (temp) document.getElementById('temp-val').innerText = `${temp.value} ${temp.unit}`;
                updateStatusDisplay('temp-led', 'temp-badge', payload.status); break;
            }
            case "corridor_pressure": {
                const m = getMeasure("pressure_kpa");
                if (m) document.getElementById('press-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('press-led', 'press-badge', payload.status); break;
            }
            case "water_tank_level": {
                const perc = getMeasure("fill_percentage"); const lit = getMeasure("level_liters");
                if (perc) {
                    document.getElementById('water-perc-val').innerText = `${perc.value} ${perc.unit}`;
                    
                    // --- NUOVO: Aggiorna il livello dell'onda! ---
                    const waveBg = document.getElementById('water-level-bg');
                    if (waveBg) {
                        // Assicuriamoci che il valore resti tra 0 e 100
                        let heightVal = Math.max(0, Math.min(100, parseFloat(perc.value)));
                        // Aggiungiamo un +5% visivo altrimenti al 10% l'onda è troppo bassa
                        waveBg.style.height = `${heightVal}%`;
                    }
                }
                if (lit) document.getElementById('water-liters-val').innerText = `${lit.value} ${lit.unit}`;
                updateStatusDisplay('water-led', 'water-badge', payload.status); 
                break;
            }
            case "co2_hall": {
                const m = getMeasure("co2_ppm");
                if (m) document.getElementById('co2-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('co2-led', 'co2-badge', payload.status); break;
            }
            case "entrance_humidity": {
                const m = getMeasure("humidity_pct");
                if (m) document.getElementById('hum-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('hum-led', 'hum-badge', payload.status); break;
            }
            case "air_quality_pm25": {
                const pm1 = getMeasure("pm1"); const pm25 = getMeasure("pm25"); const pm10 = getMeasure("pm10");
                if (pm1) document.getElementById('pm1-val').innerText = `${pm1.value} ${pm1.unit}`;
                if (pm25) document.getElementById('pm25-val').innerText = `${pm25.value} ${pm25.unit}`;
                if (pm10) document.getElementById('pm10-val').innerText = `${pm10.value} ${pm10.unit}`;
                updateStatusDisplay('pm-led', 'pm-badge', payload.status); break;
            }
            case "air_quality_voc": {
                const m = getMeasure("voc_ppb"); const n = getMeasure("co2e_ppm");
                if (m) document.getElementById('voc-val').innerText = `${m.value} ${m.unit || ''}`;
                if (n) document.getElementById('co2e-val').innerText = `${n.value} ${n.unit || ''}`;
                updateStatusDisplay('voc-led', 'voc-badge', payload.status); 
                break;
            }
            case "hydroponic_ph": {
                const m = getMeasure("ph");
                if (m) document.getElementById('ph-val').innerText = `${m.value}${m.unit ? ' '+m.unit : ''}`;
                updateStatusDisplay('ph-led', 'ph-badge', payload.status); break;
            }

            // -- TELEMETRY SENSORS --
            case "mars/telemetry/solar_array": {
                const p = getMeasure("power_kw"); const v = getMeasure("voltage_v"); const a = getMeasure("current_a"); const c = getMeasure("cumulative_kwh");
                if (p) document.getElementById('solar-p-val').innerText = `${p.value} ${p.unit}`;
                if (v) document.getElementById('solar-v-val').innerText = `${v.value} ${v.unit}`;
                if (a) document.getElementById('solar-a-val').innerText = `${a.value} ${a.unit}`;
                if (c) document.getElementById('solar-c-val').innerText = `${c.value} ${c.unit}`;
                updateStatusDisplay('solar-led', 'solar-badge', payload.status); break;
            }
            case "mars/telemetry/power_bus": {
                const p = getMeasure("power_kw"); const v = getMeasure("voltage_v"); const a = getMeasure("current_a"); const c = getMeasure("cumulative_kwh");
                if (p) document.getElementById('bus-p-val').innerText = `${p.value} ${p.unit}`;
                if (v) document.getElementById('bus-v-val').innerText = `${v.value} ${v.unit}`;
                if (a) document.getElementById('bus-a-val').innerText = `${a.value} ${a.unit}`;
                if (c) document.getElementById('bus-c-val').innerText = `${c.value} ${c.unit}`;
                updateStatusDisplay('bus-led', 'bus-badge', payload.status); break;
            }
            case "mars/telemetry/power_consumption": {
                const p = getMeasure("power_kw"); const v = getMeasure("voltage_v"); const a = getMeasure("current_a"); const c = getMeasure("cumulative_kwh");
                if (p) document.getElementById('cons-p-val').innerText = `${p.value} ${p.unit}`;
                if (v) document.getElementById('cons-v-val').innerText = `${v.value} ${v.unit}`;
                if (a) document.getElementById('cons-a-val').innerText = `${a.value} ${a.unit}`;
                if (c) document.getElementById('cons-c-val').innerText = `${c.value} ${c.unit}`;
                updateStatusDisplay('cons-led', 'cons-badge', payload.status); break;
            }
            case "mars/telemetry/thermal_loop": {
                const t = getMeasure("temperature_c"); const f = getMeasure("flow_l_min");
                if (t) document.getElementById('thermal-t-val').innerText = `${t.value} ${t.unit}`;
                if (f) document.getElementById('thermal-f-val').innerText = `${f.value} ${f.unit}`;
                updateStatusDisplay('thermal-led', 'thermal-badge', payload.status); break;
            }
            case "mars/telemetry/radiation": {
                const m = getMeasure("radiation_uSv_h");
                if (m) document.getElementById('rad-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('rad-led', 'rad-badge', payload.status); break;
            }
            case "mars/telemetry/life_support": {
                const m = getMeasure("oxygen_percent");
                if (m) document.getElementById('life-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('life-led', 'life-badge', payload.status); break;
            }
            case "mars/telemetry/airlock": {
                const m = getMeasure("cycles_per_hour");
                if (m) document.getElementById('airlock-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('airlock-led', 'airlock-badge', payload.status); break;
            }
        }
        
    } catch (e) {
        console.error("Error parsing MQTT message:", e);
    }
});

setInterval(() => {
    for (const timeId of Object.values(timeElementMap)) updateTimeDisplay(timeId);
}, 10000);

client.on('error', () => { statusBtn.innerText = "Connection Error"; statusBtn.style.backgroundColor = "lightcoral"; });
client.on('close', () => { statusBtn.innerText = "Disconnected"; statusBtn.style.backgroundColor = "var(--bg-color)"; });


// ==========================================
// 5. GESTIONE REGOLE AUTOMAZIONE (TABS E API)
// ==========================================
function switchTab(tabName) {
    // IMPORTANTE: Ora utilizziamo 'flex' invece di 'block' per mantenere la struttura intatta
    document.getElementById('view-dashboard').style.display = tabName === 'dashboard' ? 'flex' : 'none';
    document.getElementById('view-rules').style.display = tabName === 'rules' ? 'flex' : 'none';
    
    document.getElementById('tab-dashboard').classList.toggle('active', tabName === 'dashboard');
    document.getElementById('tab-rules').classList.toggle('active', tabName === 'rules');
    
    if (tabName === 'rules') fetchRules();
}

// Inizializzazione corretta all'avvio
document.getElementById('view-dashboard').style.display = 'flex';
document.getElementById('view-rules').style.display = 'none';

function updateMetricOptions() {
    const sensorSelect = document.getElementById('rule-sensor');
    const metricSelect = document.getElementById('rule-metric');
    const selectedSensor = sensorSelect.value;
    
    metricSelect.innerHTML = ''; 
    if (sensorMetricsMap[selectedSensor]) {
        sensorMetricsMap[selectedSensor].forEach(metric => {
            const opt = document.createElement('option');
            opt.value = metric; opt.innerText = metric;
            metricSelect.appendChild(opt);
        });
    } else {
        metricSelect.innerHTML = '<option value="">No metrics found</option>';
    }
}

// Memorizza temporaneamente le regole caricate per la modalità edit
let currentRules = [];

async function fetchRules() {
    const listContainer = document.getElementById('rules-list');
    try {
        const response = await fetch(ENGINE_API_URL);
        if (!response.ok) throw new Error("Errore nel caricamento delle regole");
        
        currentRules = await response.json();
        
        // RIMOSSO IL VECCHIO ORDINAMENTO currentRules.sort(...)
        // Ora l'array arriva dal backend già ordinato per Priority (position ASC)
        
        listContainer.innerHTML = ''; 
        
        if (currentRules.length === 0) {
            listContainer.innerHTML = '<p style="color: #666;">No active rules found. Create one above.</p>';
            return;
        }
        
        currentRules.forEach((rule, index) => {
            const ruleElement = document.createElement('div');
            ruleElement.className = 'rule-card';
            ruleElement.id = `rule-card-${rule.id}`;
            const metricDisplay = rule.metric ? `.<span class="highlight">${rule.metric}</span>` : '';
            
            // Verifica se è il primo o l'ultimo elemento per disabilitare i tasti
            const isFirst = index === 0;
            const isLast = index === currentRules.length - 1;
            
            // Modalità visualizzazione standard con Indicatore di Priorità e Frecce
            ruleElement.innerHTML = `
                <div style="margin-right: 1rem; text-align: center; min-width: 45px;">
                    <div style="font-size: 0.65rem; color: #666; font-weight: bold;">Priority</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--color-purple);">#${rule.position}</div>
                </div>
                <div class="rule-logic" id="rule-logic-${rule.id}" style="flex: 1;">
                    IF <span class="highlight">${rule.sensor_id}</span>${metricDisplay} 
                    ${rule.operator} <span class="highlight">${rule.threshold}</span> 
                    THEN SET <span class="highlight">${rule.actuator_name}</span> 
                    TO <span class="highlight">${rule.actuator_state}</span>
                </div>
                <div class="rule-actions" id="rule-actions-${rule.id}">
                    <button class="btn-move" onclick="moveRule(${rule.id}, 'up')" ${isFirst ? 'disabled' : ''} title="Move Up">⬆️</button>
                    <button class="btn-move" onclick="moveRule(${rule.id}, 'down')" ${isLast ? 'disabled' : ''} title="Move Down">⬇️</button>
                    <button class="btn-blue-outline" onclick="enableEditMode(${rule.id})">✏️ Edit</button>
                    <button class="btn-red" onclick="deleteRule(${rule.id})">🗑️ Delete</button>
                </div>
            `;
            listContainer.appendChild(ruleElement);
        });
    } catch (error) { 
        listContainer.innerHTML = '<p style="color: red;">⚠️ Cannot connect to Automation Engine API.</p>'; 
    }
}

// NUOVA FUNZIONE: Contatta la POST /api/rules/<id>/move
async function moveRule(ruleId, direction) {
    try {
        const response = await fetch(`${ENGINE_API_URL}/${ruleId}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: direction })
        });
        
        if (response.ok) {
            // L'API risponde con le regole aggiornate, ricarichiamo la UI
            fetchRules();
        } else {
            const err = await response.json();
            alert(`Errore durante lo spostamento: ${err.error}`);
        }
    } catch (error) {
        console.error("Move error:", error);
        alert("Impossibile raggiungere il server per spostare la regola.");
    }
}

// Invia le modifiche all'API tramite PUT
async function saveRuleChanges(ruleId) {
    const updatedRule = {
        operator: document.getElementById(`edit-op-${ruleId}`).value,
        threshold: parseFloat(document.getElementById(`edit-thresh-${ruleId}`).value),
        actuator_state: document.getElementById(`edit-state-${ruleId}`).value
    };

    try {
        const response = await fetch(`${ENGINE_API_URL}/${ruleId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedRule)
        });

        if (response.ok) {
            fetchRules(); // Ricarica la lista per mostrare la regola aggiornata
        } else {
            alert('Error updating rule.');
        }
    } catch (error) {
        console.error("Errore aggiornamento:", error);
        alert('Cannot reach the Automation Engine.');
    }
}

// ==========================================
// CREAZIONE / SOVRASCRITTURA NUOVA REGOLA
// ==========================================
document.getElementById('add-rule-form').addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita il ricaricamento della pagina

    const newRule = {
        sensor_id: document.getElementById('rule-sensor').value,
        metric: document.getElementById('rule-metric').value,
        operator: document.getElementById('rule-operator').value,
        threshold: parseFloat(document.getElementById('rule-threshold').value),
        actuator_name: document.getElementById('rule-actuator').value,
        actuator_state: document.getElementById('rule-state').value,
        description: 'Created from Frontend'
    };

    // 1. Controllo Collisioni (Match esatto di tutto tranne la soglia)
    const conflictingRule = currentRules.find(r => 
        r.sensor_id === newRule.sensor_id &&
        r.metric === newRule.metric &&
        r.operator === newRule.operator &&
        r.actuator_name === newRule.actuator_name &&
        r.actuator_state === newRule.actuator_state
    );

    // 2. Se troviamo un conflitto, avviamo il flow di sovrascrittura
    if (conflictingRule) {
        const confirmOverwrite = confirm(
            `⚠️ Attenzione: Esiste già una regola identica nel database (Soglia attuale: ${conflictingRule.threshold}).\n\nVuoi sovrascriverla inserendo la nuova regola con soglia ${newRule.threshold}?`
        );

        if (!confirmOverwrite) {
            return; // Se l'utente clicca 'Annulla', blocchiamo il processo
        }

        // 3. Se l'utente accetta, eliminiamo la regola esistente tramite DELETE
        try {
            const deleteResponse = await fetch(`${ENGINE_API_URL}/${conflictingRule.id}`, { 
                method: 'DELETE' 
            });
            if (!deleteResponse.ok) {
                alert("Errore di comunicazione: Impossibile eliminare la vecchia regola.");
                return; // Interrompiamo se non riusciamo ad eliminare
            }
            console.log(`[Regola ${conflictingRule.id} eliminata per sovrascrittura]`);
        } catch (error) {
            console.error("Errore durante l'eliminazione:", error);
            alert('Impossibile raggiungere il server.');
            return;
        }
    }

    // 4. Se non c'erano conflitti (oppure la vecchia è stata eliminata), aggiungiamo la nuova tramite POST
    try {
        const response = await fetch(ENGINE_API_URL, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(newRule)
        });
        
        if (response.ok) { 
            // Reset dell'input e ricaricamento regole
            document.getElementById('rule-threshold').value = ''; 
            fetchRules(); 
        } else {
            const errorData = await response.json();
            alert(`Error adding rule: ${errorData.error}`);
        }
    } catch (error) { 
        console.error(error);
        alert('Cannot reach the Automation Engine per aggiungere la regola.'); 
    }
});