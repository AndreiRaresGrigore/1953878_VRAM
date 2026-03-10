// ==========================================
// 1. VARIABILI E MAPPE
// ==========================================
const statusBtn = document.getElementById('connection-status');
const lastUpdatedTimes = {};

const ACTUATORS_API_URL = 'http://localhost:8080/api/actuators';
const ENGINE_API_URL = 'http://localhost:8081/api/rules';

const timeElementMap = {
    "greenhouse_temperature": "temp-time", "corridor_pressure": "press-time", "water_tank_level": "water-time",
    "co2_hall": "co2-time", "entrance_humidity": "hum-time", "air_quality_pm25": "pm-time", "air_quality_voc": "voc-time",
    "hydroponic_ph": "ph-time", "mars/telemetry/solar_array": "solar-time", "mars/telemetry/power_bus": "bus-time",
    "mars/telemetry/power_consumption": "cons-time", "mars/telemetry/thermal_loop": "thermal-time", "mars/telemetry/radiation": "rad-time",
    "mars/telemetry/life_support": "life-time", "mars/telemetry/airlock": "airlock-time", "cooling_fan": "fan-time",
    "entrance_humidifier": "humidifier-time", "hall_ventilation": "vent-time", "habitat_heater": "heater-time"
};

const sensorMetricsMap = {
    "greenhouse_temperature": ["temperature_c"], "entrance_humidity": ["humidity_pct"], "co2_hall": ["co2_ppm"],
    "corridor_pressure": ["pressure_kpa"], "water_tank_level": ["fill_percentage", "level_liters"],
    "air_quality_pm25": ["pm1", "pm25", "pm10"], "air_quality_voc": ["voc_ppb", "co2e_ppm"], "hydroponic_ph": ["ph"],
    "mars/telemetry/solar_array": ["power_kw", "voltage_v", "current_a", "cumulative_kwh"],
    "mars/telemetry/power_bus": ["power_kw", "voltage_v", "current_a", "cumulative_kwh"],
    "mars/telemetry/power_consumption": ["power_kw", "voltage_v", "current_a", "cumulative_kwh"],
    "mars/telemetry/radiation": ["radiation_uSv_h"], "mars/telemetry/life_support": ["oxygen_percent"],
    "mars/telemetry/thermal_loop": ["temperature_c", "flow_l_min"], "mars/telemetry/airlock": ["cycles_per_hour"]
};

const metricLabelsMap = {
    "temperature_c": "Temperature",
    "humidity_pct": "Humidity",
    "co2_ppm": "CO2 Level",
    "pressure_kpa": "Pressure",
    "fill_percentage": "Capacity",
    "level_liters": "Volume",
    "pm1": "PM 1.0",
    "pm25": "PM 2.5",
    "pm10": "PM 10",
    "voc_ppb": "VOC Index",
    "co2e_ppm": "CO2e",
    "ph": "pH",
    "power_kw": "Power",
    "voltage_v": "Voltage",
    "current_a": "Current",
    "cumulative_kwh": "Total",
    "radiation_uSv_h": "Radiation",
    "oxygen_percent": "Oxygen",
    "flow_l_min": "Flow Rate",
    "cycles_per_hour": "Cycles"
};

// ==========================================
// 1b. HISTORY BUFFERS (per popup grafico)
// ==========================================
const MAX_HISTORY = 50;
const sensorHistory = {};
for (const [sid, metrics] of Object.entries(sensorMetricsMap)) {
    sensorHistory[sid] = {
        labels:  Array(MAX_HISTORY).fill(''),
        metrics: Object.fromEntries(metrics.map(m => [m, Array(MAX_HISTORY).fill(null)]))
    };
}

// ==========================================
// 2. FUNZIONI HELPER
// ==========================================
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((new Date() - timestamp) / 1000);
    if (seconds === 0) return "just now";
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes === 1) return `1 min ago`;
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
}

function updateTimeDisplay(timeId) {
    const el = document.getElementById(timeId);
    if (el && lastUpdatedTimes[timeId]) el.innerText = `Updated: ${formatTimeAgo(lastUpdatedTimes[timeId])}`;
}

function updateStatusDisplay(ledId, badgeId, status) {
    const led = document.getElementById(ledId); const badge = document.getElementById(badgeId);
    if (!led) return;
    led.classList.remove('led-green', 'led-red');
    if (badge) { badge.style.display = 'none'; badge.innerText = ''; }
    if (!status) { led.classList.add('led-green'); return; }

    const s = status.toString().toUpperCase();
    if (s === 'WARNING' || s === 'ERROR') {
        led.classList.add('led-red');
        if (badge) { badge.innerText = s; badge.style.display = 'inline-block'; badge.style.backgroundColor = 'var(--color-yellow)'; }
    } else {
        led.classList.add('led-green');
        if (s !== 'OK' && badge) { badge.innerText = s; badge.style.display = 'inline-block'; badge.style.backgroundColor = 'var(--color-blue)'; }
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
// 2b. RECORD HISTORY + MODAL POPUP
// ==========================================
function recordSensorData(sensorId, measurements) {
    const h = sensorHistory[sensorId];
    if (!h || !Array.isArray(measurements) || measurements.length === 0) return;

    const label = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    h.labels.shift(); h.labels.push(label);

    for (const m of measurements) {
        const pName = m.parameter || m.metric; // Supporta vecchi e nuovi formati
        if (pName && h.metrics[pName] !== undefined) {
            h.metrics[pName].shift();
            h.metrics[pName].push(parseFloat(m.value));
        }
    }
    if (modalSensorId === sensorId && modalCharts.length > 0) refreshModalChart();
}

const METRIC_COLORS = [
    { border: '#FBBF24', bg: 'rgba(251,191,36,0.15)' }, { border: '#F87171', bg: 'rgba(248,113,113,0.15)' },
    { border: '#60A5FA', bg: 'rgba(96,165,250,0.15)' }, { border: '#34D399', bg: 'rgba(52,211,153,0.15)' },
    { border: '#A78BFA', bg: 'rgba(167,139,250,0.15)' }, { border: '#FB923C', bg: 'rgba(251,146,60,0.15)' }
];

let modalCharts = []; // Ora è un array per supportare grafici multipli
let modalSensorId = null;

window.openSensorModal = function(sensorId, title) {
    modalSensorId = sensorId;
    document.getElementById('modal-title').innerText = title;
    document.getElementById('sensor-modal').style.display = 'flex';

    const container = document.getElementById('modal-charts-container');

    // Distruggi vecchi grafici e svuota il contenitore
    modalCharts.forEach(obj => obj.chart.destroy());
    modalCharts = [];
    container.innerHTML = '';

    const h = sensorHistory[sensorId] || { labels: [], metrics: {} };
    const metrics = Object.keys(h.metrics);

    const hasData = Object.values(h.metrics).some(arr => arr.some(v => v !== null));
    if (!hasData) {
        container.style.display = 'none';
        document.getElementById('modal-no-data').style.display = 'block';
        return;
    }

    container.style.display = 'flex';
    document.getElementById('modal-no-data').style.display = 'none';

    // Definiamo i sensori che DEVONO raggruppare i dati su un singolo grafico
    const keepSingleChart = [
        'air_quality_pm25',
        'mars/telemetry/solar_array',
        'mars/telemetry/power_bus',
        'mars/telemetry/power_consumption'
    ].includes(sensorId);

    const isSingleChartMode = metrics.length <= 1 || keepSingleChart;

    if (isSingleChartMode) {
        // == MODALITÀ SINGOLO GRAFICO ==
        const wrapper = document.createElement('div');
        wrapper.style.position = "relative";
        wrapper.style.height = "350px";
        wrapper.style.flexShrink = "0";

        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [...h.labels],
                datasets: metrics.map((metric, i) => ({
                    // -> MODIFICA APPLICATA QUI:
                    label: metricLabelsMap[metric] || metric,
                    data: [...h.metrics[metric]],
                    borderColor: METRIC_COLORS[i % METRIC_COLORS.length].border,
                    backgroundColor: METRIC_COLORS[i % METRIC_COLORS.length].bg,
                    borderWidth: 2.5, pointRadius: 2, tension: 0.35, spanGaps: false, fill: metrics.length === 1
                }))
            },
            // ... (options rimangono invariate) ...
            options: {
                responsive: true, maintainAspectRatio: false, animation: { duration: 200 }, interaction: { mode: 'index', intersect: false },
                scales: { x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { maxTicksLimit: 8, font: { family: 'Space Grotesk', size: 11 } } }, y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { family: 'Space Grotesk', size: 11 } } } },
                plugins: { legend: { labels: { font: { family: 'Space Grotesk', size: 12 }, usePointStyle: true } } }
            }
        });
        modalCharts.push({ chart, metrics });
    } else {
        // == MODALITÀ GRAFICI SEPARATI ==
        metrics.forEach((metric, i) => {
            const wrapper = document.createElement('div');
            wrapper.style.position = "relative";
            wrapper.style.height = "250px";
            wrapper.style.flexShrink = "0";

            const canvas = document.createElement('canvas');
            wrapper.appendChild(canvas);
            container.appendChild(wrapper);

            const chart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: [...h.labels],
                    datasets: [{
                        // -> MODIFICA APPLICATA QUI:
                        label: metricLabelsMap[metric] || metric,
                        data: [...h.metrics[metric]],
                        borderColor: METRIC_COLORS[i % METRIC_COLORS.length].border,
                        backgroundColor: METRIC_COLORS[i % METRIC_COLORS.length].bg,
                        borderWidth: 2.5, pointRadius: 2, tension: 0.35, spanGaps: false, fill: true
                    }]
                },
                // ... (options rimangono invariate) ...
                options: {
                    responsive: true, maintainAspectRatio: false, animation: { duration: 200 }, interaction: { mode: 'index', intersect: false },
                    scales: { x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { maxTicksLimit: 8, font: { family: 'Space Grotesk', size: 11 } } }, y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { family: 'Space Grotesk', size: 11 } } } },
                    plugins: { legend: { labels: { font: { family: 'Space Grotesk', size: 12 }, usePointStyle: true } } }
                }
            });
            modalCharts.push({ chart, metrics: [metric] });
        });
    }
};

function refreshModalChart() {
    if (modalCharts.length === 0 || !modalSensorId) return;
    const h = sensorHistory[modalSensorId];
    if (!h) return;

    // Aggiorna dinamicamente tutti i grafici aperti
    modalCharts.forEach(obj => {
        obj.chart.data.labels = [...h.labels];
        obj.metrics.forEach((metric, idx) => {
            if (obj.chart.data.datasets[idx]) obj.chart.data.datasets[idx].data = [...h.metrics[metric]];
        });
        obj.chart.update('none');
    });
}

window.closeSensorModal = function(e) { if (e && e.target !== document.getElementById('sensor-modal')) return; _doCloseSensorModal(); };
window.closeSensorModalBtn = function() { _doCloseSensorModal(); };
function _doCloseSensorModal() {
    document.getElementById('sensor-modal').style.display = 'none';
    modalCharts.forEach(obj => obj.chart.destroy()); // Distrugge pulitamente tutti i canvas in RAM
    modalCharts = [];
    modalSensorId = null;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') _doCloseSensorModal(); });

// ==========================================
// 3. POLLING ATTUATORI VIA REST E OVERRIDE MANUALE
// ==========================================

const actuatorPrefixMap = {
    "cooling_fan": "fan",
    "entrance_humidifier": "humidifier",
    "hall_ventilation": "vent",
    "habitat_heater": "heater"
};

// Polling aggiornato per supportare lo stato JSON arricchito { state: "ON", mode: "auto" }
async function fetchActuators() {
    try {
        // Chiamiamo il nostro Engine, non più direttamente il simulatore!
        // (Sostituisci /rules con /actuators in modo dinamico)
        const overrideUrl = ENGINE_API_URL.replace('/rules', '/actuators');
        const response = await fetch(overrideUrl);
        if (!response.ok) return;

        const data = await response.json();

        for (const [actuatorName, info] of Object.entries(data.actuators)) {
            const timeId = timeElementMap[actuatorName];
            if (timeId) { lastUpdatedTimes[timeId] = new Date(); updateTimeDisplay(timeId); }

            const prefix = actuatorPrefixMap[actuatorName];
            const led = document.getElementById(`${prefix}-led`);
            const modeBtn = document.getElementById(`${prefix}-mode`);
            const stateBtn = document.getElementById(`${prefix}-state`);

            if (!led || !modeBtn || !stateBtn) continue;

            // Aggiorna il LED
            led.classList.remove('led-green', 'led-red');
            if (info.state === 'ON') led.classList.add('led-green');
            else if (info.state === 'OFF') led.classList.add('led-red');

            // Detect state changes for chart annotations
            _checkActuatorStateChange(actuatorName, info.state);

            // Aggiorna Pulsante MODE (Auto/Manual)
            modeBtn.innerText = info.mode.toUpperCase();
            modeBtn.className = `btn-ctrl btn-mode ${info.mode}`;

            // Aggiorna Pulsante STATO (ON/OFF)
            stateBtn.innerText = info.state;
            stateBtn.className = `btn-ctrl btn-state ${info.state.toLowerCase()}`;

            // Disabilita il pulsante di stato se l'engine è in controllo (AUTO)
            stateBtn.disabled = (info.mode === 'auto');
        }
    } catch (error) {}
}
fetchActuators();
setInterval(fetchActuators, 5000);

// Cambia da AUTO a MANUAL e viceversa
window.toggleMode = async function(actuatorName) {
    const prefix = actuatorPrefixMap[actuatorName];
    const modeBtn = document.getElementById(`${prefix}-mode`);
    const stateBtn = document.getElementById(`${prefix}-state`);

    const newMode = modeBtn.innerText === 'AUTO' ? 'manual' : 'auto';
    const currentState = stateBtn.innerText; // Preserva lo stato attuale quando si passa in manuale

    const payload = { mode: newMode };
    if (newMode === 'manual') payload.state = currentState;

    try {
        await fetch(`${ENGINE_API_URL.replace('/rules', '/actuators')}/${actuatorName}/override`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        fetchActuators(); // Refresh UI immediato
    } catch(e) { console.error(e); }
};

// Accende e spegne manualmente (solo se in modalità MANUAL)
window.toggleState = async function(actuatorName) {
    const prefix = actuatorPrefixMap[actuatorName];
    const stateBtn = document.getElementById(`${prefix}-state`);
    const newState = stateBtn.innerText === 'ON' ? 'OFF' : 'ON';

    try {
        await fetch(`${ENGINE_API_URL.replace('/rules', '/actuators')}/${actuatorName}/override`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'manual', state: newState })
        });
        fetchActuators(); // Refresh UI immediato
    } catch(e) { console.error(e); }
};

// ==========================================
// 4. CONFIGURAZIONE E RICEZIONE MQTT
// ==========================================
const client = mqtt.connect('ws://mars_admin:mars_admin@localhost:15675/ws', {
    reconnectPeriod: 5000, clientId: 'mars_dashboard_' + Math.random().toString(16).substr(2, 8), keepalive: 15, clean: true
});

client.on('connect', () => { statusBtn.innerText = "Connected (Live)"; statusBtn.style.backgroundColor = "var(--color-green)"; statusBtn.style.borderColor = "var(--color-green-accent)";statusBtn.style.color = "var(--color-green-accent)"; client.subscribe('#'); });

client.on('message', (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());

        if (topic === 'mars/automation/alerts') {
            if (payload.type === 'RULE_TRIGGER') showToast(`AUTOMATION: ${payload.text}`);
            return;
        }

        // AGGIORNAMENTO: Supporto sia per il vecchio formato che per il nuovo formato normalizzato
        const deviceId = payload.device_id || payload.sensor_id;
        const eventTime = payload.timestamp || payload.captured_at;

        const timeId = timeElementMap[deviceId];
        if (timeId) {
            lastUpdatedTimes[timeId] = eventTime ? new Date(eventTime) : new Date();
            updateTimeDisplay(timeId);
        }

        const getMeasure = (pName) => payload.measurements ? payload.measurements.find(m => m.parameter === pName || m.metric === pName) : null;

        // Salva cronologia per il grafico
        recordSensorData(deviceId, payload.measurements || []);

        // Usa deviceId invece di payload.sensor_id
        switch(deviceId) {
            case "greenhouse_temperature": {
                const temp = getMeasure("temperature_c"); if (temp) { document.getElementById('temp-val').innerText = `${temp.value} ${temp.unit}`; latestTemp = parseFloat(temp.value); }
                updateStatusDisplay('temp-led', 'temp-badge', payload.status); break;
            }
            case "corridor_pressure": {
                const m = getMeasure("pressure_kpa"); if (m) { document.getElementById('press-val').innerText = `${m.value} ${m.unit}`; latestPressure = parseFloat(m.value); }
                updateStatusDisplay('press-led', 'press-badge', payload.status); break;
            }
            case "water_tank_level": {
                const perc = getMeasure("fill_percentage"); const lit = getMeasure("level_liters");
                if (perc) {
                    document.getElementById('water-perc-val').innerText = `${perc.value} ${perc.unit}`;
                    const waveBg = document.getElementById('water-level-bg');
                    if (waveBg) waveBg.style.height = `${Math.max(0, Math.min(100, parseFloat(perc.value)))}%`;
                }
                if (lit) document.getElementById('water-liters-val').innerText = `${lit.value} ${lit.unit}`;
                updateStatusDisplay('water-led', 'water-badge', payload.status); break;
            }
            case "co2_hall": {
                const m = getMeasure("co2_ppm"); if (m) { document.getElementById('co2-val').innerText = `${m.value} ${m.unit}`; latestCO2 = parseFloat(m.value); }
                updateStatusDisplay('co2-led', 'co2-badge', payload.status); break;
            }
            case "entrance_humidity": {
                const m = getMeasure("humidity_pct"); if (m) { document.getElementById('hum-val').innerText = `${m.value} ${m.unit}`; latestHum = parseFloat(m.value); }
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
                updateStatusDisplay('voc-led', 'voc-badge', payload.status); break;
            }
            case "hydroponic_ph": {
                const m = getMeasure("ph"); if (m) document.getElementById('ph-val').innerText = `${m.value}${m.unit ? ' '+m.unit : ''}`;
                updateStatusDisplay('ph-led', 'ph-badge', payload.status); break;
            }
            case "mars/telemetry/solar_array": {
                const p = getMeasure("power_kw"); const v = getMeasure("voltage_v"); const a = getMeasure("current_a"); const c = getMeasure("cumulative_kwh");
                if (p) document.getElementById('solar-p-val').innerText = `${p.value} ${p.unit}`;
                if (v) document.getElementById('solar-v-val').innerText = `${v.value} ${v.unit}`;
                if (a) document.getElementById('solar-a-val').innerText = `${a.value} ${a.unit}`;
                if (c) document.getElementById('solar-c-val').innerText = `${c.value} ${c.unit}`;
                if (p) { latestSolarPower = parseFloat(p.value); _pushEnergyPoint(); }
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
                if (p) { latestConsumptionPower = parseFloat(p.value); _pushEnergyPoint(); }
                updateStatusDisplay('cons-led', 'cons-badge', payload.status); break;
            }
            case "mars/telemetry/thermal_loop": {
                const t = getMeasure("temperature_c"); const f = getMeasure("flow_l_min");
                if (t) { document.getElementById('thermal-t-val').innerText = `${t.value} ${t.unit}`; latestThermalTemp = parseFloat(t.value); }
                if (f) { document.getElementById('thermal-f-val').innerText = `${f.value} ${f.unit}`; latestThermalFlow = parseFloat(f.value); }
                updateStatusDisplay('thermal-led', 'thermal-badge', payload.status); break;
            }
            case "mars/telemetry/radiation": {
                const m = getMeasure("radiation_uSv_h"); if (m) { document.getElementById('rad-val').innerText = `${m.value} ${m.unit}`; latestRadiation = parseFloat(m.value); }
                updateStatusDisplay('rad-led', 'rad-badge', payload.status); break;
            }
            case "mars/telemetry/life_support": {
                const m = getMeasure("oxygen_percent"); if (m) document.getElementById('life-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('life-led', 'life-badge', payload.status); break;
            }
            case "mars/telemetry/airlock": {
                const m = getMeasure("cycles_per_hour"); if (m) document.getElementById('airlock-val').innerText = `${m.value} ${m.unit}`;
                updateStatusDisplay('airlock-led', 'airlock-badge', payload.status || payload.airlock_state); break;
            }
        }
    } catch (e) { console.error("Error parsing MQTT message:", e); }
});

setInterval(() => { for (const timeId of Object.values(timeElementMap)) updateTimeDisplay(timeId); }, 1000);
client.on('error', () => { statusBtn.innerText = "Connection Error"; statusBtn.style.backgroundColor = "lightcoral"; });
client.on('close', () => { statusBtn.innerText = "Disconnected"; statusBtn.style.backgroundColor = "var(--bg-color)"; });


// ==========================================
// 5. GESTIONE REGOLE AUTOMAZIONE (TABS E API)
// ==========================================

// Nuova logica Tab: Nasconde tutti i div tranne quello attivo
window.switchTab = function(tabName) {
    document.getElementById('view-dashboard').style.display = tabName === 'dashboard' ? 'flex' : 'none';
    document.getElementById('view-energy').style.display = tabName === 'energy' ? 'flex' : 'none';
    document.getElementById('view-rules').style.display = tabName === 'rules' ? 'flex' : 'none';

    document.getElementById('tab-dashboard').classList.toggle('active', tabName === 'dashboard');
    document.getElementById('tab-energy').classList.toggle('active', tabName === 'energy');
    document.getElementById('tab-rules').classList.toggle('active', tabName === 'rules');

    if (tabName === 'rules') fetchRules();
};

window.updateMetricOptions = function() {
    const sensorSelect = document.getElementById('rule-sensor');
    const metricSelect = document.getElementById('rule-metric');
    const selectedSensor = sensorSelect.value;

    metricSelect.innerHTML = '';
    if (sensorMetricsMap[selectedSensor]) {
        sensorMetricsMap[selectedSensor].forEach(metric => {
            const opt = document.createElement('option'); opt.value = metric; opt.innerText = metric; metricSelect.appendChild(opt);
        });
    } else {
        metricSelect.innerHTML = '<option value="">No metrics found</option>';
    }
};

let currentRules = [];

window.fetchRules = async function() {
    const listContainer = document.getElementById('rules-list');
    try {
        const response = await fetch(ENGINE_API_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error("Errore");
        currentRules = await response.json();
        currentRules.sort((a, b) => a.position - b.position);

        listContainer.innerHTML = '';
        if (currentRules.length === 0) { listContainer.innerHTML = '<p style="color: #666;">No active rules found. Create one above.</p>'; return; }

        currentRules.forEach((rule, index) => {
            const ruleElement = document.createElement('div');

            // Applica la classe 'suspended' se la regola è disattivata (0)
            const isActive = rule.is_active !== 0;
            ruleElement.className = isActive ? 'rule-card' : 'rule-card suspended';
            ruleElement.id = `rule-card-${rule.id}`;

            const metricDisplay = rule.metric ? `.<span class="highlight">${rule.metric}</span>` : '';
            const isFirst = index === 0; const isLast = index === currentRules.length - 1;

            // Scegli il tasto corretto da mostrare
            const toggleBtnHtml = isActive
                ? `<button class="btn-toggle pause" onclick="toggleRule(${rule.id})" title="Suspend Rule">Suspend</button>`
                : `<button class="btn-toggle play" onclick="toggleRule(${rule.id})" title="Enable Rule">Resume</button>`;

            ruleElement.innerHTML = `
                <div style="margin-right: 1rem; text-align: center; min-width: 45px;">
                    <div style="font-size: 0.65rem; color: #666; font-weight: bold;">Priority</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--color-purple);">#${index + 1}</div>
                </div>
                <div class="rule-logic" id="rule-logic-${rule.id}" style="flex: 1;">
                    IF <span class="highlight">${rule.sensor_id}</span>${metricDisplay}
                    ${rule.operator} <span class="highlight">${rule.threshold}</span>
                    THEN SET <span class="highlight">${rule.actuator_name}</span>
                    TO <span class="highlight">${rule.actuator_state}</span>
                </div>
                <div class="rule-actions" id="rule-actions-${rule.id}">
                    ${toggleBtnHtml}
                    <button class="btn-move" onclick="moveRule(${rule.id}, 'up')" ${isFirst ? 'disabled' : ''} title="Move Up">⬆</button>
                    <button class="btn-move" onclick="moveRule(${rule.id}, 'down')" ${isLast ? 'disabled' : ''} title="Move Down">⬇</button>
                    <button class="btn-blue-outline" onclick="enableEditMode(${rule.id})">Edit</button>
                    <button class="btn-red" onclick="deleteRule(${rule.id})">Delete</button>
                </div>
            `;
            listContainer.appendChild(ruleElement);
        });
    } catch (error) { listContainer.innerHTML = '<p style="color: red;">Cannot connect to Automation Engine API.</p>'; }
};

// Funzione che contatta l'API per sospendere/riattivare
window.toggleRule = async function(ruleId) {
    try {
        const response = await fetch(`${ENGINE_API_URL}/${ruleId}/toggle`, { method: 'POST' });
        if (response.ok) fetchRules(); // Ricarica graficamente l'interfaccia
    } catch (error) { console.error(error); }
};

window.moveRule = async function(ruleId, direction) {
    try {
        const response = await fetch(`${ENGINE_API_URL}/${ruleId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction: direction }) });
        if (response.ok) fetchRules();
    } catch (error) { console.error(error); }
};

window.enableEditMode = function(ruleId) {
    const rule = currentRules.find(r => r.id === ruleId);
    if (!rule) return;
    const logicDiv = document.getElementById(`rule-logic-${ruleId}`); const actionsDiv = document.getElementById(`rule-actions-${ruleId}`);
    const metricDisplay = rule.metric ? `.<span class="highlight">${rule.metric}</span>` : '';
    logicDiv.innerHTML = `
        IF <span class="highlight" style="background-color:#e5e7eb;">${rule.sensor_id}</span>${metricDisplay}
        <select class="edit-select" id="edit-op-${rule.id}">
            <option value=">" ${rule.operator === '>' ? 'selected' : ''}>></option><option value=">=" ${rule.operator === '>=' ? 'selected' : ''}>>=</option>
            <option value="=" ${rule.operator === '=' ? 'selected' : ''}>=</option><option value="<=" ${rule.operator === '<=' ? 'selected' : ''}><=</option>
            <option value="<" ${rule.operator === '<' ? 'selected' : ''}><</option>
        </select>
        <input type="number" step="0.1" class="edit-input" id="edit-thresh-${rule.id}" value="${rule.threshold}">
        THEN SET <span class="highlight" style="background-color:#e5e7eb;">${rule.actuator_name}</span> TO
        <select class="edit-select" id="edit-state-${rule.id}">
            <option value="ON" ${rule.actuator_state === 'ON' ? 'selected' : ''}>ON</option><option value="OFF" ${rule.actuator_state === 'OFF' ? 'selected' : ''}>OFF</option>
        </select>
    `;
    actionsDiv.innerHTML = `
        <button class="btn-move" onclick="saveRuleChanges(${rule.id})" style="background-color: var(--color-green); border-color: var(--border-color); color: black;">Save</button>
        <button class="btn-blue-outline" onclick="fetchRules()">Cancel</button>
    `;
};

window.saveRuleChanges = async function(ruleId) {
    const originalRule = currentRules.find(r => r.id === ruleId); if (!originalRule) return;
    const updatedOperator = document.getElementById(`edit-op-${ruleId}`).value;
    const updatedThreshold = parseFloat(document.getElementById(`edit-thresh-${ruleId}`).value);
    const updatedState = document.getElementById(`edit-state-${ruleId}`).value;

    const conflictingRule = currentRules.find(r => r.id !== ruleId && r.sensor_id === originalRule.sensor_id && r.metric === originalRule.metric && r.operator === updatedOperator && r.actuator_name === originalRule.actuator_name && r.actuator_state === updatedState);
    if (conflictingRule) {
        if (!confirm(`⚠️ Attenzione: Esiste già un'altra regola identica nel database.\nVuoi sovrascriverla?`)) return;
        try { await fetch(`${ENGINE_API_URL}/${conflictingRule.id}`, { method: 'DELETE' }); } catch (error) { return; }
    }

    try {
        const response = await fetch(`${ENGINE_API_URL}/${ruleId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operator: updatedOperator, threshold: updatedThreshold, actuator_state: updatedState })
        });
        if (response.ok) fetchRules();
    } catch (error) { console.error(error); }
};

document.getElementById('add-rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newRule = {
        sensor_id: document.getElementById('rule-sensor').value, metric: document.getElementById('rule-metric').value,
        operator: document.getElementById('rule-operator').value, threshold: parseFloat(document.getElementById('rule-threshold').value),
        actuator_name: document.getElementById('rule-actuator').value, actuator_state: document.getElementById('rule-state').value,
        description: 'Created from Frontend'
    };

    const conflictingRule = currentRules.find(r => r.sensor_id === newRule.sensor_id && r.metric === newRule.metric && r.operator === newRule.operator && r.actuator_name === newRule.actuator_name && r.actuator_state === newRule.actuator_state);
    if (conflictingRule) {
        if (!confirm(`⚠️ Attenzione: Esiste già una regola identica nel database.\nVuoi sovrascriverla?`)) return;
        try { await fetch(`${ENGINE_API_URL}/${conflictingRule.id}`, { method: 'DELETE' }); } catch (error) { return; }
    }

    try {
        const response = await fetch(ENGINE_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newRule) });
        if (response.ok) {
            document.getElementById('rule-sensor').value = '';
            document.getElementById('rule-metric').innerHTML = '<option value="" disabled selected>Select Sensor first</option>';
            document.getElementById('rule-threshold').value = '';
            fetchRules();
        }
    } catch (error) { console.error(error); }
});

window.deleteRule = async function(ruleId) {
    if (!confirm('Are you sure you want to delete this automation rule?')) return;
    try {
        const response = await fetch(`${ENGINE_API_URL}/${ruleId}`, { method: 'DELETE' });
        if (response.ok) fetchRules();
    } catch (error) { console.error(error); }
};

function showToast(message) {
    const container = document.getElementById('toast-container'); if (!container) return;
    const toast = document.createElement('div'); toast.className = 'toast'; toast.innerText = message;
    container.prepend(toast);
    setTimeout(() => { toast.classList.add('fade-out'); toast.addEventListener('animationend', () => toast.remove()); }, 6000);
}

// ==========================================
// 6. MULTI-CHART ENERGY VIEW
// ==========================================
const MAX_CHART_POINTS = 50;
const FONT = 'Oxanium, monospace';

// ---- Theme helpers (read CSS vars live) ----
function cGrid()  { return 'rgba(128,128,128,0.1)'; }
function cText()  { return getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#9a8870'; }

function xAxis() {
    return { grid: { color: cGrid() }, ticks: { maxTicksLimit: 10, color: cText(), font: { family: FONT, size: 10 } } };
}
function yAxis(color, title, pos, drawGrid) {
    return {
        type: 'linear', position: pos || 'left',
        grid: { color: drawGrid === false ? 'transparent' : cGrid(), drawOnChartArea: drawGrid !== false },
        ticks: { color, font: { family: FONT, size: 10 } },
        title: { display: !!title, text: title || '', color, font: { family: FONT, size: 10, weight: 'bold' } },
        grace: '40%'
    };
}
function legend() {
    return { labels: { color: cText(), font: { family: FONT, size: 11 }, usePointStyle: true, padding: 16 } };
}
function baseOpts(scales) {
    return {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales, plugins: { legend: legend() }
    };
}

// ---- Actuator event store ----
// Each event: { timestamp (ms), label, color }
// Charts track their own timestamps and draw lines where timestamps match
const ACT_EVENT_COLORS = {
    'cooling_fan:ON':          '#2dff7a',
    'cooling_fan:OFF':         '#ff5555',
    'habitat_heater:ON':       '#38b6ff',
    'habitat_heater:OFF':      '#ff9933',
    'entrance_humidifier:ON':  '#cc88ff',
    'entrance_humidifier:OFF': '#9944bb',
    'hall_ventilation:ON':     '#ffee44',
    'hall_ventilation:OFF':    '#aa9900',
};
const ACT_SHORT = { cooling_fan: 'Fan', habitat_heater: 'Heat', entrance_humidifier: 'Hum', hall_ventilation: 'Vent' };
const _prevActuatorStates = {};
// Circular buffer of { ts, label, color } events (max 200)
const actuatorEventLog = [];

function _checkActuatorStateChange(name, state) {
    const prev = _prevActuatorStates[name];
    if (prev !== undefined && prev !== state) {
        const key = `${name}:${state}`;
        actuatorEventLog.push({
            ts: Date.now(),
            label: `${ACT_SHORT[name] || name} ${state}`,
            color: ACT_EVENT_COLORS[key] || '#ffffff'
        });
        if (actuatorEventLog.length > 200) actuatorEventLog.shift();
        // Redraw all charts immediately
        [energyChart, climateChart].forEach(c => c && c.update('none'));
    }
    _prevActuatorStates[name] = state;
}

// ---- Custom plugin: vertical actuator event lines ----
// Each chart instance carries a `_tsBuffer` array of timestamps (ms) for its X labels.
const actuatorLinesPlugin = {
    id: 'actuatorLines',
    afterDraw(chart) {
        const tsBuffer = chart._tsBuffer;
        if (!tsBuffer || !actuatorEventLog.length) return;
        const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
        if (!x) return;

        const n = tsBuffer.length;
        ctx.save();
        actuatorEventLog.forEach(ev => {
            // Find the closest index in tsBuffer to this event's timestamp
            let closest = -1, minDist = Infinity;
            for (let i = 0; i < n; i++) {
                if (tsBuffer[i] === null) continue;
                const d = Math.abs(tsBuffer[i] - ev.ts);
                if (d < minDist) { minDist = d; closest = i; }
            }
            // Only draw if event is within 30s of a known point
            if (closest < 0 || minDist > 30000) return;

            const xPos = x.getPixelForValue(closest);
            ctx.beginPath();
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = ev.color;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.8;
            ctx.moveTo(xPos, top);
            ctx.lineTo(xPos, bottom);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.fillStyle = ev.color;
            ctx.font = `bold 8px "Share Tech Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(ev.label, xPos, top + 9);
        });
        ctx.restore();
    }
};
Chart.register(actuatorLinesPlugin);

// ---- Generic buffer helper ----
function makeBuffer(n) { return { labels: Array(n).fill(''), ts: Array(n).fill(null) }; }

// =========================================
// CHART 1: Power Balance
// =========================================
const solarPowerData      = Array(MAX_CHART_POINTS).fill(null);
const consumptionPowerData= Array(MAX_CHART_POINTS).fill(null);
let latestSolarPower = null, latestConsumptionPower = null;
const _energyBuf = makeBuffer(MAX_CHART_POINTS);

const energyChart = new Chart(document.getElementById('energy-chart').getContext('2d'), {
    type: 'line',
    data: {
        labels: _energyBuf.labels,
        datasets: [
            { label: 'Solar Production (kW)', data: solarPowerData, borderColor: '#FBBF24', backgroundColor: 'rgba(251,191,36,0.10)', borderWidth: 2.5, pointRadius: 2, tension: 0.35, spanGaps: false, fill: true },
            { label: 'Power Consumption (kW)', data: consumptionPowerData, borderColor: '#F87171', backgroundColor: 'rgba(248,113,113,0.10)', borderWidth: 2.5, pointRadius: 2, tension: 0.35, spanGaps: false, fill: true }
        ]
    },
    options: {
        ...baseOpts({ x: xAxis(), y: { ...yAxis(cText(), 'kW', 'left'), beginAtZero: true } }),
        plugins: {
            legend: legend(),
            tooltip: {
                callbacks: {
                    afterBody(items) {
                        const i = items[0].dataIndex;
                        const b = (solarPowerData[i] ?? 0) - (consumptionPowerData[i] ?? 0);
                        return [`Balance: ${b >= 0 ? '+' : ''}${b.toFixed(2)} kW (${b >= 0 ? 'SURPLUS' : 'DEFICIT'})`];
                    }
                }
            }
        }
    }
});
energyChart._tsBuffer = _energyBuf.ts;

function _pushEnergyPoint() {
    // Called by the master clock — just updates the badge
    const badge = document.getElementById('energy-status-badge');
    if (latestSolarPower !== null && latestConsumptionPower !== null) {
        const balance = latestSolarPower - latestConsumptionPower;
        badge.classList.remove('energy-surplus', 'energy-deficit', 'energy-waiting');
        if (balance >= 0) { badge.classList.add('energy-surplus'); badge.innerText = `SURPLUS  +${balance.toFixed(2)} kW`; }
        else { badge.classList.add('energy-deficit'); badge.innerText = `DEFICIT  ${balance.toFixed(2)} kW`; }
    }
}

// =========================================
// CHART 2: Climate Correlation
// =========================================
const tempData = Array(MAX_CHART_POINTS).fill(null);
const humData  = Array(MAX_CHART_POINTS).fill(null);
const co2Data  = Array(MAX_CHART_POINTS).fill(null);
let latestTemp = null, latestHum = null, latestCO2 = null;
const _climateBuf = makeBuffer(MAX_CHART_POINTS);

const climateChart = new Chart(document.getElementById('climate-chart').getContext('2d'), {
    type: 'line',
    data: {
        labels: _climateBuf.labels,
        datasets: [
            { label: 'Temperature (°C)', data: tempData, borderColor: '#F87171', borderWidth: 2, pointRadius: 1.5, tension: 0.4, spanGaps: true, fill: false, yAxisID: 'yTemp' },
            { label: 'Humidity (%)',     data: humData,  borderColor: '#60A5FA', borderWidth: 2, pointRadius: 1.5, tension: 0.4, spanGaps: true, fill: false, yAxisID: 'yHum'  },
            { label: 'CO2 (ppm)',        data: co2Data,  borderColor: '#34D399', borderWidth: 2, pointRadius: 1.5, tension: 0.4, spanGaps: true, fill: false, yAxisID: 'yCO2'  }
        ]
    },
    options: baseOpts({
        x:     xAxis(),
        yTemp: yAxis('#F87171', '°C',  'left',  true),
        yHum:  yAxis('#60A5FA', '%',   'right', false),
        yCO2:  yAxis('#34D399', 'ppm', 'right', false)
    })
});
climateChart._tsBuffer = _climateBuf.ts;

// =========================================
// MASTER CLOCK — ticks every 3s, pushes ALL charts in sync
// =========================================
function _masterTick() {
    const now = Date.now();
    const label = new Date(now).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // --- Chart 1: Energy ---
    _energyBuf.labels.shift();      _energyBuf.labels.push(label);
    _energyBuf.ts.shift();          _energyBuf.ts.push(now);
    solarPowerData.shift();         solarPowerData.push(latestSolarPower);
    consumptionPowerData.shift();   consumptionPowerData.push(latestConsumptionPower);
    energyChart.update('none');
    _pushEnergyPoint(); // update badge

    // --- Chart 2: Climate ---
    _climateBuf.labels.shift();     _climateBuf.labels.push(label);
    _climateBuf.ts.shift();         _climateBuf.ts.push(now);
    tempData.shift(); tempData.push(latestTemp);
    humData.shift();  humData.push(latestHum);
    co2Data.shift();  co2Data.push(latestCO2);
    climateChart.update('none');
}
setInterval(_masterTick, 3000);

// ==========================================
// 7. MISSION STATUS CARD
// ==========================================
const MISSION_START = new Date('2026-01-01T00:00:00Z');
const MARS_SOL_MS = 88775244; // 1 sol marziano = 24h 39m 35.244s

function updateMissionStatus() {
    const now = new Date();

    const clockEl = document.getElementById('sys-clock');
    if (clockEl) clockEl.innerText = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const solEl = document.getElementById('sys-sol');
    if (solEl) {
        const elapsed = now - MISSION_START;
        solEl.innerText = `Sol ${Math.max(0, Math.floor(elapsed / MARS_SOL_MS))}`;
    }

    const streamsEl = document.getElementById('sys-streams');
    if (streamsEl) {
        const active = document.querySelectorAll('.sensor-card .status-led.led-green').length;
        const total = document.querySelectorAll('.sensor-card .status-led').length;
        streamsEl.innerText = `${active}/${total}`;
    }
}

setInterval(updateMissionStatus, 1000);
updateMissionStatus();