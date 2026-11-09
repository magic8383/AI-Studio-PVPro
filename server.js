import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Ensure data directory exists for persistent shares
const DATA_DIR = path.join(__dirname, 'data');
const SHARES_FILE = path.join(DATA_DIR, 'shares.json');
const PERSISTENT_HARDWARE_FILE = path.join(DATA_DIR, 'persistent_hardware.json');
const SYSTEM_PLANS_FILE = path.join(DATA_DIR, 'system_plans.json');
const HA_CONFIG_FILE = path.join(DATA_DIR, 'ha_config.json');
const PERFORMANCE_RECORDS_FILE = path.join(DATA_DIR, 'performance_records.json');
const PVGIS_CACHE_DIR = path.join(DATA_DIR, 'pvgis_cache');
const DATABASE_JS_FILE = path.join(__dirname, 'database.js');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(PVGIS_CACHE_DIR)) {
  fs.mkdirSync(PVGIS_CACHE_DIR, { recursive: true });
}

// In-Memory Share Store with File Persistence
const sharesMap = new Map();

function loadSharesFromFile() {
  try {
    if (fs.existsSync(SHARES_FILE)) {
      const raw = fs.readFileSync(SHARES_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (typeof data === 'object' && data !== null) {
        for (const [key, val] of Object.entries(data)) {
          sharesMap.set(key, val);
        }
      }
    }
  } catch (err) {
    console.warn('Could not load shares from file:', err);
  }
}

function persistSharesToFile() {
  try {
    const obj = Object.fromEntries(sharesMap);
    fs.writeFileSync(SHARES_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist shares to file:', err);
  }
}

// Persistent Hardware Store & Code Synchronization
function loadPersistentHardware() {
  try {
    if (fs.existsSync(PERSISTENT_HARDWARE_FILE)) {
      const raw = fs.readFileSync(PERSISTENT_HARDWARE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return {
        panels: Array.isArray(data.panels) ? data.panels : [],
        inverters: Array.isArray(data.inverters) ? data.inverters : [],
        batteries: Array.isArray(data.batteries) ? data.batteries : []
      };
    }
  } catch (err) {
    console.warn('Could not load persistent hardware:', err);
  }
  return { panels: [], inverters: [], batteries: [] };
}

function savePersistentHardware(hardware) {
  try {
    fs.writeFileSync(PERSISTENT_HARDWARE_FILE, JSON.stringify(hardware, null, 2), 'utf-8');
    syncPersistentHardwareToCode(hardware);
  } catch (err) {
    console.warn('Could not save persistent hardware:', err);
  }
}

function syncPersistentHardwareToCode(hardware) {
  try {
    if (!fs.existsSync(DATABASE_JS_FILE)) return;
    let content = fs.readFileSync(DATABASE_JS_FILE, 'utf-8');
    const regex = /const CodePersistedHardware = \{[\s\S]*?\};/;
    const replacement = `const CodePersistedHardware = ${JSON.stringify(hardware, null, 4)};`;
    if (regex.test(content)) {
      content = content.replace(regex, replacement);
      fs.writeFileSync(DATABASE_JS_FILE, content, 'utf-8');
    }
  } catch (err) {
    console.error('Error syncing hardware to database.js:', err);
  }
}

// Persistent System Plans Store
function loadSystemPlans() {
  try {
    if (fs.existsSync(SYSTEM_PLANS_FILE)) {
      const raw = fs.readFileSync(SYSTEM_PLANS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn('Could not load system plans:', err);
  }
  return [];
}

function saveSystemPlans(plans) {
  try {
    fs.writeFileSync(SYSTEM_PLANS_FILE, JSON.stringify(plans, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save system plans:', err);
  }
}

loadSharesFromFile();

// Middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// CORS Headers for flexible access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static assets from project root
app.use(express.static(__dirname));

// ==========================================
// API: CROSS-DEVICE CONFIGURATION SHARING
// ==========================================

// Helper: Generate a short, human-friendly 6-character code (e.g. PV-7482)
function generateShareCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'PV-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// POST /api/share: Save config and return short code + QR Code
app.post('/api/share', async (req, res) => {
  try {
    const { config, name, origin } = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ success: false, error: 'Keine gültige Konfiguration übergeben' });
    }

    let code = generateShareCode();
    while (sharesMap.has(code)) {
      code = generateShareCode();
    }

    let shareUrl;
    if (origin && typeof origin === 'string' && origin.startsWith('http')) {
      shareUrl = `${origin.replace(/\/+$/, '')}/?share=${code}`;
    } else {
      const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      shareUrl = `${protocol}://${host}/?share=${code}`;
    }

    // Generate crisp QR-Code SVG
    const qrSvg = await QRCode.toString(shareUrl, {
      type: 'svg',
      margin: 1,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    const shareData = {
      code,
      name: name || (config.title || 'PV-Planung'),
      config,
      createdAt: new Date().toISOString()
    };

    sharesMap.set(code, shareData);
    persistSharesToFile();

    res.json({
      success: true,
      code,
      url: shareUrl,
      qrSvg
    });
  } catch (err) {
    console.error('Error generating share:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/share/:code: Retrieve shared configuration
app.get('/api/share/:code', (req, res) => {
  const rawCode = (req.params.code || '').trim().toUpperCase();
  const normalizedCode = rawCode.startsWith('PV-') ? rawCode : `PV-${rawCode}`;
  
  let share = sharesMap.get(normalizedCode) || sharesMap.get(rawCode);
  if (!share) {
    loadSharesFromFile(); // Re-check disk persistence
    share = sharesMap.get(normalizedCode) || sharesMap.get(rawCode);
  }
  if (!share) {
    return res.status(404).json({ 
      success: false, 
      error: `Konfiguration für Code "${rawCode}" nicht gefunden oder abgelaufen.` 
    });
  }

  res.json({
    success: true,
    code: share.code,
    name: share.name,
    config: share.config,
    createdAt: share.createdAt
  });
});

// GET /api/qr: Dynamic QR-Code SVG Generator
app.get('/api/qr', async (req, res) => {
  try {
    const text = req.query.text || req.query.url || '';
    if (!text) {
      return res.status(400).send('Missing text query parameter');
    }

    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 1,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ==========================================
// API: PERSISTENT HARDWARE (IN-CODE & SERVER STORE)
// ==========================================

// GET /api/hardware/persistent: Retrieve all hardware saved in code / server
app.get('/api/hardware/persistent', (req, res) => {
  try {
    const hw = loadPersistentHardware();
    res.json({ success: true, hardware: hw });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/hardware/persist: Add new hardware directly into code and server store
app.post('/api/hardware/persist', (req, res) => {
  try {
    const { type } = req.body;
    const item = req.body.item || req.body.hardware;
    if (!type || !item || !item.name) {
      return res.status(400).json({ success: false, error: 'Ungültige Hardwaredaten' });
    }

    const hw = loadPersistentHardware();
    const key = type === 'panel' ? 'panels' : (type === 'inv' ? 'inverters' : 'batteries');
    
    if (!Array.isArray(hw[key])) hw[key] = [];

    // Ensure item has a unique ID and marks as code-persisted
    if (!item.id) item.id = Date.now() % 100000;
    item.isCodePersisted = true;
    item.savedAt = new Date().toISOString();

    // Check if item already exists (by ID) -> replace or add
    const existingIdx = hw[key].findIndex(x => String(x.id) === String(item.id));
    if (existingIdx >= 0) {
      hw[key][existingIdx] = { ...hw[key][existingIdx], ...item };
    } else {
      hw[key].push(item);
    }

    savePersistentHardware(hw);

    res.json({
      success: true,
      message: `Gerät "${item.name}" fest im Code und Server gespeichert`,
      item,
      hardware: hw
    });
  } catch (err) {
    console.error('Error persisting hardware:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/hardware/update: Update existing hardware
app.put('/api/hardware/update', (req, res) => {
  try {
    const { type } = req.body;
    const item = req.body.item || req.body.hardware;
    const id = req.body.id || item?.id;
    if (!type || !id || !item) {
      return res.status(400).json({ success: false, error: 'Typ, ID und Daten erforderlich' });
    }

    const hw = loadPersistentHardware();
    const key = type === 'panel' ? 'panels' : (type === 'inv' ? 'inverters' : 'batteries');
    
    if (!Array.isArray(hw[key])) hw[key] = [];

    const idx = hw[key].findIndex(x => String(x.id) === String(id));
    if (idx >= 0) {
      hw[key][idx] = { ...hw[key][idx], ...item, id: parseInt(id) || id, updatedAt: new Date().toISOString() };
      savePersistentHardware(hw);
      res.json({ success: true, message: 'Hardware im Code aktualisiert', item: hw[key][idx], hardware: hw });
    } else {
      // If not in persistent hardware yet, add it as persistent!
      item.id = parseInt(id) || id;
      item.isCodePersisted = true;
      item.updatedAt = new Date().toISOString();
      hw[key].push(item);
      savePersistentHardware(hw);
      res.json({ success: true, message: 'Hardware fest im Code hinterlegt', item, hardware: hw });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/hardware/:type/:id: Remove persistent hardware
app.delete('/api/hardware/:type/:id', (req, res) => {
  try {
    const { type, id } = req.params;
    const hw = loadPersistentHardware();
    const key = type === 'panel' ? 'panels' : (type === 'inv' ? 'inverters' : 'batteries');

    if (Array.isArray(hw[key])) {
      hw[key] = hw[key].filter(x => String(x.id) !== String(id));
      savePersistentHardware(hw);
    }

    res.json({ success: true, message: 'Gerät aus Code-Speicher entfernt', hardware: hw });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// API: PERSISTENT SYSTEM PLANS (FESTE PLANUNGEN)
// ==========================================

// GET /api/plans/persistent: List all plans permanently stored on server
app.get('/api/plans/persistent', (req, res) => {
  try {
    const plans = loadSystemPlans();
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/plans/persist: Save/update a master system plan
app.post('/api/plans/persist', (req, res) => {
  try {
    const { id, name, data, summary } = req.body;
    if (!name || !data) {
      return res.status(400).json({ success: false, error: 'Name und Planungsdaten erforderlich' });
    }

    const plans = loadSystemPlans();
    const planId = id || `plan_sys_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();

    const planObj = {
      id: planId,
      name: name.trim(),
      data,
      summary: summary || null,
      isSystemPlan: true,
      updatedAt: now,
      createdAt: now
    };

    const existingIdx = plans.findIndex(p => p.id === planId);
    if (existingIdx >= 0) {
      planObj.createdAt = plans[existingIdx].createdAt || now;
      plans[existingIdx] = planObj;
    } else {
      plans.push(planObj);
    }

    saveSystemPlans(plans);

    res.json({
      success: true,
      message: `Planung "${name}" fest im System/Code gespeichert`,
      plan: planObj,
      plans
    });
  } catch (err) {
    console.error('Error persisting system plan:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/plans/persistent/:id: Remove a persistent system plan
app.delete('/api/plans/persistent/:id', (req, res) => {
  try {
    const { id } = req.params;
    let plans = loadSystemPlans();
    plans = plans.filter(p => p.id !== id);
    saveSystemPlans(plans);
    res.json({ success: true, message: 'Planung gelöscht', plans });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// API: RESILIENT MULTI-TIER PVGIS PROXY & CACHE (V8.3)
// ==========================================

const pvgisMemoryCache = new Map();

function getPvgisCacheKey(params) {
  const lat = parseFloat(params.lat || 48.06).toFixed(3);
  const lon = parseFloat(params.lon || 8.46).toFixed(3);
  const peakpower = parseFloat(params.peakpower || 1).toFixed(3);
  const loss = parseFloat(params.loss || 14).toFixed(1);
  const angle = parseFloat(params.angle || 30).toFixed(1);
  const aspect = parseFloat(params.aspect || 0).toFixed(1);
  return `pvgis_${lat}_${lon}_${peakpower}_${loss}_${angle}_${aspect}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

app.get('/api/pvgis/seriescalc', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 48.06;
    const lon = parseFloat(req.query.lon) || 8.46;
    const peakpower = parseFloat(req.query.peakpower) || 1.0;
    const loss = parseFloat(req.query.loss) || 14;
    const angle = parseFloat(req.query.angle) || 30;
    const aspect = parseFloat(req.query.aspect) || 0;
    const startyear = parseInt(req.query.startyear) || 2019;
    const endyear = parseInt(req.query.endyear) || 2019;

    const cacheKey = getPvgisCacheKey({ lat, lon, peakpower, loss, angle, aspect });

    // 1. Check in-memory cache
    if (pvgisMemoryCache.has(cacheKey)) {
      return res.json({
        success: true,
        source: 'server-cache',
        outputs: pvgisMemoryCache.get(cacheKey)
      });
    }

    // 2. Check persistent disk cache
    const cacheFilePath = path.join(PVGIS_CACHE_DIR, `${cacheKey}.json`);
    if (fs.existsSync(cacheFilePath)) {
      try {
        const raw = fs.readFileSync(cacheFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.hourly) && parsed.hourly.length === 8760) {
          pvgisMemoryCache.set(cacheKey, parsed);
          return res.json({
            success: true,
            source: 'disk-cache',
            outputs: parsed
          });
        }
      } catch (e) {
        console.warn('Corrupt PVGIS cache file ignored:', e.message);
      }
    }

    // 3. Query multi-tier PVGIS endpoints from server (no browser CORS limits)
    const queryStr = `lat=${lat}&lon=${lon}&pvcalculation=1&peakpower=${peakpower}&loss=${loss}&angle=${angle}&aspect=${aspect}&startyear=${startyear}&endyear=${endyear}&outputformat=json`;
    const endpoints = [
      { name: 'eu-jrc-v5_3', url: `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?${queryStr}` },
      { name: 'eu-jrc-v5_2', url: `https://re.jrc.ec.europa.eu/api/v5_2/seriescalc?${queryStr}` },
      { name: 'pvgis-mirror', url: `https://pvgis.mb10.org/api/v5_2/seriescalc?${queryStr}` }
    ];

    for (const ep of endpoints) {
      try {
        const response = await fetchWithTimeout(ep.url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'PV-Planung-Pro/8.3 (Photovoltaic Engineering Engine)'
          }
        }, 8500);

        if (response.ok) {
          const json = await response.json();
          if (json && json.outputs && Array.isArray(json.outputs.hourly) && json.outputs.hourly.length >= 8760) {
            // Compact hourly array to only needed { P } values to keep disk cache lightweight and fast
            const compactHourly = json.outputs.hourly.slice(0, 8760).map(h => ({
              P: typeof h.P === 'number' ? Math.round(h.P * 100) / 100 : 0
            }));
            const compactOutputs = { hourly: compactHourly };

            pvgisMemoryCache.set(cacheKey, compactOutputs);
            try {
              fs.writeFileSync(cacheFilePath, JSON.stringify(compactOutputs), 'utf-8');
            } catch (writeErr) {
              console.warn('Could not write PVGIS disk cache:', writeErr.message);
            }

            return res.json({
              success: true,
              source: ep.name,
              outputs: compactOutputs
            });
          }
        }
      } catch (epErr) {
        // Proceed to next endpoint in cascade
      }
    }

    return res.status(503).json({
      success: false,
      error: 'Alle externen PVGIS-Endpunkte antworteten nicht rechtzeitig.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// API: HOME ASSISTANT TELEMETRY & PERFORMANCE RECORDS (V8.3)
// ==========================================

let latestWebhookTelemetry = {
  updatedAt: null,
  values: {},
  strings: {}
};

function loadHaConfig() {
  try {
    if (fs.existsSync(HA_CONFIG_FILE)) {
      const raw = fs.readFileSync(HA_CONFIG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Could not load HA config:', err.message);
  }
  return {
    mode: 'demo', // 'poll' | 'webhook' | 'demo'
    baseUrl: 'http://homeassistant.local:8123',
    accessToken: '',
    pollIntervalSec: 10,
    autoSyncMonthly: true,
    entities: {
      pvPower: 'sensor.pv_power_total',
      loadPower: 'sensor.house_consumption_power',
      gridPower: 'sensor.grid_power',
      gridImportPower: '',
      gridExportPower: '',
      batteryPower: 'sensor.battery_power',
      batterySoc: 'sensor.battery_soc',
      pvEnergyToday: 'sensor.pv_energy_today',
      pvEnergyMonth: 'sensor.pv_energy_monthly',
      pvEnergyTotal: 'sensor.pv_energy_total',
      gridImportMonth: 'sensor.grid_import_monthly',
      gridExportMonth: 'sensor.grid_export_monthly',
      batteryChargeMonth: 'sensor.battery_charge_monthly',
      batteryDischargeMonth: 'sensor.battery_discharge_monthly'
    },
    stringEntities: {},
    inverterEntities: {}
  };
}

function saveHaConfig(cfg) {
  try {
    fs.writeFileSync(HA_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save HA config:', err.message);
  }
}

function loadPerformanceRecords() {
  try {
    if (fs.existsSync(PERFORMANCE_RECORDS_FILE)) {
      const raw = fs.readFileSync(PERFORMANCE_RECORDS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    }
  } catch (err) {
    console.warn('Could not load performance records:', err.message);
  }
  return {};
}

function savePerformanceRecords(records) {
  try {
    fs.writeFileSync(PERFORMANCE_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save performance records:', err.message);
  }
}

// GET /api/ha/config: Retrieve stored Home Assistant configuration
app.get('/api/ha/config', (req, res) => {
  try {
    const cfg = loadHaConfig();
    res.json({ success: true, config: cfg });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ha/config: Save Home Assistant configuration & entity mapping
app.post('/api/ha/config', (req, res) => {
  try {
    const incoming = req.body.config || req.body;
    const current = loadHaConfig();
    const merged = {
      ...current,
      ...incoming,
      entities: { ...(current.entities || {}), ...(incoming.entities || {}) },
      stringEntities: { ...(current.stringEntities || {}), ...(incoming.stringEntities || {}) },
      inverterEntities: { ...(current.inverterEntities || {}), ...(incoming.inverterEntities || {}) },
      updatedAt: new Date().toISOString()
    };
    saveHaConfig(merged);
    res.json({ success: true, config: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ha/test: Test Home Assistant connection & discover available sensor.* entities
app.post('/api/ha/test', async (req, res) => {
  try {
    const stored = loadHaConfig();
    const baseUrlRaw = (req.body.baseUrl || stored.baseUrl || '').trim().replace(/\/+$/, '');
    const token = (req.body.accessToken || stored.accessToken || '').trim();

    if (!baseUrlRaw || !baseUrlRaw.startsWith('http')) {
      return res.status(400).json({
        success: false,
        error: 'Bitte eine gültige Home-Assistant-URL (z. B. http://homeassistant.local:8123 oder https://...) angeben.'
      });
    }
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Bitte ein Long-Lived Access Token aus deinem Home-Assistant-Profil eintragen.'
      });
    }

    const response = await fetchWithTimeout(`${baseUrlRaw}/api/states`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, 7000);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Home Assistant antwortete mit HTTP ${response.status}. Bitte URL und Token prüfen.`
      });
    }

    const allStates = await response.json();
    if (!Array.isArray(allStates)) {
      return res.status(500).json({
        success: false,
        error: 'Unerwartetes Antwortformat von Home Assistant (/api/states).'
      });
    }

    // Filter relevant sensor & number entities for PV / energy / power / battery
    const sensors = allStates
      .filter(s => s && typeof s.entity_id === 'string' && (s.entity_id.startsWith('sensor.') || s.entity_id.startsWith('number.') || s.entity_id.startsWith('input_number.')))
      .map(s => ({
        entity_id: s.entity_id,
        name: s.attributes?.friendly_name || s.entity_id,
        state: s.state,
        unit: s.attributes?.unit_of_measurement || '',
        device_class: s.attributes?.device_class || ''
      }));

    res.json({
      success: true,
      totalEntities: allStates.length,
      sensorCount: sensors.length,
      sensors
    });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: `Home Assistant unter dieser Adresse vom Server aus nicht erreichbar (${err.message}). Tipp: Nutze eine erreichbare URL (z. B. Nabu Casa / Reverse Proxy / lokale IP) oder den Webhook-Push-Modus.`
    });
  }
});

// Helper to normalize HA sensor numeric state and unit (converts kW -> W for power, Wh -> kWh for energy)
function parseHaNumericState(stateObj, targetType = 'power') {
  if (!stateObj || stateObj.state === undefined || stateObj.state === null) return null;
  const rawVal = parseFloat(String(stateObj.state).replace(',', '.'));
  if (isNaN(rawVal)) return null;
  const unit = String(stateObj.attributes?.unit_of_measurement || stateObj.unit || '').trim().toLowerCase();

  if (targetType === 'power') {
    if (unit === 'kw') return rawVal * 1000;
    if (unit === 'mw') return rawVal * 1000000;
    return rawVal; // default W
  }
  if (targetType === 'energy') {
    if (unit === 'wh') return rawVal / 1000;
    if (unit === 'mwh') return rawVal * 1000;
    return rawVal; // default kWh
  }
  return rawVal; // percent or raw
}

// POST or GET /api/ha/states: Poll live entity states from Home Assistant or return latest Webhook data
app.all('/api/ha/states', async (req, res) => {
  try {
    const stored = loadHaConfig();
    const cfg = req.body && req.body.config ? { ...stored, ...req.body.config } : stored;

    if (cfg.mode === 'webhook') {
      return res.json({
        success: true,
        mode: 'webhook',
        updatedAt: latestWebhookTelemetry.updatedAt,
        telemetry: latestWebhookTelemetry.values,
        stringTelemetry: latestWebhookTelemetry.strings
      });
    }

    const baseUrlRaw = (cfg.baseUrl || '').trim().replace(/\/+$/, '');
    const token = (cfg.accessToken || '').trim();

    if (!baseUrlRaw || !token) {
      return res.status(400).json({
        success: false,
        error: 'Home Assistant URL oder Access Token noch nicht konfiguriert.'
      });
    }

    const response = await fetchWithTimeout(`${baseUrlRaw}/api/states`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, 6500);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Home Assistant HTTP ${response.status}`
      });
    }

    const allStates = await response.json();
    const stateMap = new Map();
    if (Array.isArray(allStates)) {
      allStates.forEach(s => {
        if (s && s.entity_id) stateMap.set(s.entity_id, s);
      });
    }

    const ent = cfg.entities || {};
    const getPower = (id) => id && stateMap.has(id) ? parseHaNumericState(stateMap.get(id), 'power') : null;
    const getEnergy = (id) => id && stateMap.has(id) ? parseHaNumericState(stateMap.get(id), 'energy') : null;
    const getRaw = (id) => id && stateMap.has(id) ? parseHaNumericState(stateMap.get(id), 'raw') : null;

    let pvPower = getPower(ent.pvPower);
    let loadPower = getPower(ent.loadPower);
    let gridPower = getPower(ent.gridPower);
    const gridImportP = getPower(ent.gridImportPower);
    const gridExportP = getPower(ent.gridExportPower);
    if (gridPower === null && (gridImportP !== null || gridExportP !== null)) {
      gridPower = (gridImportP || 0) - (gridExportP || 0);
    }
    let batteryPower = getPower(ent.batteryPower);
    let batterySoc = getRaw(ent.batterySoc);

    // Map per-string entities
    const stringTelemetry = {};
    const strEnts = cfg.stringEntities || {};
    for (const [sId, sCfg] of Object.entries(strEnts)) {
      if (!sCfg) continue;
      stringTelemetry[sId] = {
        powerW: getPower(sCfg.powerEntity),
        energyKwh: getEnergy(sCfg.energyEntity),
        voltageV: getRaw(sCfg.voltageEntity),
        currentA: getRaw(sCfg.currentEntity)
      };
    }

    // If total pvPower wasn't provided directly, sum from mapped strings if available
    if (pvPower === null) {
      const strPowers = Object.values(stringTelemetry).map(x => x.powerW).filter(v => typeof v === 'number');
      if (strPowers.length > 0) {
        pvPower = strPowers.reduce((a, b) => a + b, 0);
      }
    }

    const telemetry = {
      pvPowerW: pvPower !== null ? Math.max(0, pvPower) : 0,
      loadPowerW: loadPower !== null ? Math.max(0, loadPower) : 0,
      gridPowerW: gridPower !== null ? gridPower : 0, // >0 = Netzbezug, <0 = Einspeisung
      batteryPowerW: batteryPower !== null ? batteryPower : 0, // >0 = Laden, <0 = Entladen
      batterySocPct: batterySoc !== null ? Math.min(100, Math.max(0, batterySoc)) : null,
      pvEnergyTodayKwh: getEnergy(ent.pvEnergyToday),
      pvEnergyMonthKwh: getEnergy(ent.pvEnergyMonth),
      pvEnergyTotalKwh: getEnergy(ent.pvEnergyTotal),
      gridImportMonthKwh: getEnergy(ent.gridImportMonth),
      gridExportMonthKwh: getEnergy(ent.gridExportMonth),
      batteryChargeMonthKwh: getEnergy(ent.batteryChargeMonth),
      batteryDischargeMonthKwh: getEnergy(ent.batteryDischargeMonth)
    };

    // Provide raw entity states for any explicitly requested entityIds in test/preview mode
    const rawRequested = {};
    if (Array.isArray(req.body?.entityIds)) {
      req.body.entityIds.forEach(id => {
        if (id && stateMap.has(id)) {
          const st = stateMap.get(id);
          rawRequested[id] = {
            state: st.state,
            unit: st.attributes?.unit_of_measurement || '',
            name: st.attributes?.friendly_name || id
          };
        }
      });
    }

    res.json({
      success: true,
      mode: 'poll',
      updatedAt: new Date().toISOString(),
      telemetry,
      stringTelemetry,
      rawRequested
    });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: `Fehler beim Abruf von Home Assistant: ${err.message}`
    });
  }
});

// POST /api/ha/webhook: Receive pushed live sensor values directly from a Home Assistant automation
app.post('/api/ha/webhook', (req, res) => {
  try {
    const body = req.body || {};
    latestWebhookTelemetry = {
      updatedAt: new Date().toISOString(),
      values: {
        pvPowerW: parseFloat(body.pvPowerW ?? body.pv_power ?? 0) || 0,
        loadPowerW: parseFloat(body.loadPowerW ?? body.load_power ?? 0) || 0,
        gridPowerW: parseFloat(body.gridPowerW ?? body.grid_power ?? 0) || 0,
        batteryPowerW: parseFloat(body.batteryPowerW ?? body.battery_power ?? 0) || 0,
        batterySocPct: body.batterySocPct !== undefined ? parseFloat(body.batterySocPct) : (body.battery_soc !== undefined ? parseFloat(body.battery_soc) : null),
        pvEnergyTodayKwh: body.pvEnergyTodayKwh !== undefined ? parseFloat(body.pvEnergyTodayKwh) : (body.pv_energy_today !== undefined ? parseFloat(body.pv_energy_today) : null),
        pvEnergyMonthKwh: body.pvEnergyMonthKwh !== undefined ? parseFloat(body.pvEnergyMonthKwh) : (body.pv_energy_month !== undefined ? parseFloat(body.pv_energy_month) : null),
        gridImportMonthKwh: body.gridImportMonthKwh !== undefined ? parseFloat(body.gridImportMonthKwh) : null,
        gridExportMonthKwh: body.gridExportMonthKwh !== undefined ? parseFloat(body.gridExportMonthKwh) : null,
        batteryChargeMonthKwh: body.batteryChargeMonthKwh !== undefined ? parseFloat(body.batteryChargeMonthKwh) : null,
        batteryDischargeMonthKwh: body.batteryDischargeMonthKwh !== undefined ? parseFloat(body.batteryDischargeMonthKwh) : null
      },
      strings: body.strings || {}
    };
    res.json({
      success: true,
      updatedAt: latestWebhookTelemetry.updatedAt
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/performance/records: Get stored monthly/yearly real performance data
app.get('/api/performance/records', (req, res) => {
  try {
    const records = loadPerformanceRecords();
    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/performance/records: Save monthly/yearly real performance data
app.post('/api/performance/records', (req, res) => {
  try {
    const { projectId, year, months } = req.body;
    const allRecords = loadPerformanceRecords();
    if (projectId && year && Array.isArray(months)) {
      if (!allRecords[projectId]) allRecords[projectId] = {};
      allRecords[projectId][String(year)] = {
        months,
        updatedAt: new Date().toISOString()
      };
    } else if (req.body.records && typeof req.body.records === 'object') {
      Object.assign(allRecords, req.body.records);
    }
    savePerformanceRecords(allRecords);
    res.json({ success: true, records: allRecords });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT} (v8.3)`);
});

