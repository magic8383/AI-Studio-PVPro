import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';
const APP_VERSION = '9.4';

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

function sanitizePlanListTokens(plans) {
  if (!Array.isArray(plans)) return [];
  return plans.map(p => {
    const copy = JSON.parse(JSON.stringify(p));
    if (copy.data && copy.data.haConfigSanitized) {
      copy.data.haConfigSanitized.accessToken = '';
    }
    if (copy.data && copy.data.haConfig) {
      copy.data.haConfig.accessToken = '';
    }
    return copy;
  });
}

function syncSystemPlansToCode(plans) {
  try {
    if (!fs.existsSync(DATABASE_JS_FILE)) return;
    const cleanPlans = sanitizePlanListTokens(plans);
    let content = fs.readFileSync(DATABASE_JS_FILE, 'utf-8');
    const regex = /const CodePersistedPlans = \[[\s\S]*?\];/;
    const replacement = `const CodePersistedPlans = ${JSON.stringify(cleanPlans, null, 4)};`;
    if (regex.test(content)) {
      content = content.replace(regex, replacement);
      fs.writeFileSync(DATABASE_JS_FILE, content, 'utf-8');
    }
  } catch (err) {
    console.error('Error syncing system plans to database.js:', err);
  }
}

function saveSystemPlans(plans) {
  try {
    const cleanPlans = sanitizePlanListTokens(plans);
    fs.writeFileSync(SYSTEM_PLANS_FILE, JSON.stringify(cleanPlans, null, 2), 'utf-8');
    syncSystemPlansToCode(cleanPlans);
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
            'User-Agent': `PV-Planung-Pro/${APP_VERSION} (Photovoltaic Engineering Engine)`
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
// API: HOME ASSISTANT TELEMETRY, HISTORY & PERFORMANCE RECORDS (V8.4)
// ==========================================

let latestWebhookTelemetry = {
  updatedAt: null,
  values: {},
  strings: {},
  consumers: []
};

// In-memory intraday history ring-buffer (for webhook & poll fallback)
let intradaySnapshots = [];

function recordIntradaySnapshot(point) {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  // Keep only today's snapshots
  intradaySnapshots = intradaySnapshots.filter(p => p.dayKey === dayKey);
  // Avoid recording more often than every 20 seconds
  const last = intradaySnapshots[intradaySnapshots.length - 1];
  if (last && (now.getTime() - last.ts) < 20000) {
    intradaySnapshots[intradaySnapshots.length - 1] = { ...point, ts: now.getTime(), iso: now.toISOString(), dayKey };
  } else {
    intradaySnapshots.push({ ...point, ts: now.getTime(), iso: now.toISOString(), dayKey });
  }
}

function getDefaultCustomStrings() {
  return [
    { id: 'str_fronius_1', name: 'Fronius · String 1 DC', powerEntity: 'sensor.fronius_string_1_power', energyEntity: 'sensor.fronius_string_1_energy_today', color: '#14b8a6' },
    { id: 'str_fronius_2', name: 'Fronius · String 2 DC', powerEntity: 'sensor.fronius_string_2_power', energyEntity: 'sensor.fronius_string_2_energy_today', color: '#f59e0b' },
    { id: 'str_hoymiles', name: 'Hoymiles · gesamt DC', powerEntity: 'sensor.hoymiles_power_dc', energyEntity: '', color: '#22c55e' }
  ];
}

function getDefaultCustomConsumers() {
  return [
    { id: 'cons_1', name: 'Trockner', powerEntity: 'sensor.trockner_power' },
    { id: 'cons_2', name: 'TV-Verstärker', powerEntity: 'sensor.tv_verstaerker_power' },
    { id: 'cons_3', name: 'Esszimmer Licht', powerEntity: 'sensor.esszimmer_licht_power' },
    { id: 'cons_4', name: 'Küche Licht', powerEntity: 'sensor.kueche_licht_power' }
  ];
}

function createDefaultHaConfig() {
  return {
    mode: 'poll', // 'poll' | 'webhook'
    baseUrl: 'http://homeassistant.local:8123',
    accessToken: '',
    pollIntervalSec: 10,
    autoSyncMonthly: true,
    batteryName: 'BYD HVS+',
    entities: {
      pvPower: 'sensor.pv_power_total',
      loadPower: 'sensor.house_consumption_power',
      gridPower: 'sensor.grid_power',
      gridImportPower: '',
      gridExportPower: '',
      batteryPower: 'sensor.battery_power',
      batteryChargePower: '',
      batteryDischargePower: '',
      batterySoc: 'sensor.battery_soc',
      pvEnergyToday: 'sensor.pv_energy_today',
      pvEnergyMonth: 'sensor.pv_energy_monthly',
      pvEnergyTotal: 'sensor.pv_energy_total',
      gridImportMonth: 'sensor.grid_import_monthly',
      gridExportMonth: 'sensor.grid_export_monthly',
      batteryChargeMonth: 'sensor.battery_charge_monthly',
      batteryDischargeMonth: 'sensor.battery_discharge_monthly'
    },
    pvEnergyExtraEntities: [],
    customStrings: getDefaultCustomStrings(),
    customConsumers: getDefaultCustomConsumers()
  };
}

function loadHaConfig() {
  const defaults = createDefaultHaConfig();
  try {
    if (fs.existsSync(HA_CONFIG_FILE)) {
      const raw = fs.readFileSync(HA_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...defaults,
        mode: parsed.mode === 'webhook' ? 'webhook' : 'poll',
        baseUrl: parsed.baseUrl || defaults.baseUrl,
        accessToken: parsed.accessToken || '',
        pollIntervalSec: parsed.pollIntervalSec || defaults.pollIntervalSec,
        autoSyncMonthly: parsed.autoSyncMonthly !== false,
        batteryName: parsed.batteryName || defaults.batteryName,
        entities: {
          ...defaults.entities,
          ...(parsed.entities || {})
        },
        pvEnergyExtraEntities: Array.isArray(parsed.pvEnergyExtraEntities) ? parsed.pvEnergyExtraEntities : [],
        customStrings: Array.isArray(parsed.customStrings) && parsed.customStrings.length > 0 ? parsed.customStrings : defaults.customStrings,
        customConsumers: Array.isArray(parsed.customConsumers) ? parsed.customConsumers : defaults.customConsumers
      };
    }
  } catch (err) {
    console.warn('Could not load HA config:', err.message);
  }
  return defaults;
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

// ==========================================
// REVERSE-PROXY & DOMAIN NORMALIZATION HELPERS (V8.5)
// ==========================================

function normalizeHaBaseUrl(rawUrl) {
  let u = String(rawUrl || '').trim();
  if (!u) return '';
  // Remove surrounding quotes or whitespace
  u = u.replace(/^["']+|["']+$/g, '').trim();
  // Add protocol if user only typed domain (e.g. "ha.meinedomain.de")
  if (!/^https?:\/\//i.test(u)) {
    const isLocal = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|[^/]+\.local\b)/i.test(u);
    u = (isLocal ? 'http://' : 'https://') + u;
  }
  try {
    const parsed = new URL(u);
    // Strip common UI suffixes if user copied URL from browser address bar
    let cleanPath = parsed.pathname
      .replace(/\/(lovelace|dashboard-[^/]+|config|developer-tools|history|logbook|map|media-browser|profile|energy|api)(\/.*)?$/i, '')
      .replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${cleanPath}`;
  } catch (e) {
    return u.replace(/\/+$/, '');
  }
}

function cleanHaToken(rawToken) {
  let t = String(rawToken || '').trim();
  // Remove accidental "Bearer " prefix, quotes, spaces, or newlines pasted from mobile clipboard
  t = t.replace(/^["']+|["']+$/g, '').trim();
  t = t.replace(/^Bearer\s+/i, '').replace(/[\r\n\s]+/g, '');
  return t;
}

/**
 * Low-level HTTP/HTTPS client for Home Assistant behind Reverse Proxies (Nginx, Synology, Cloudflare, Traefik).
 * - Preserves Authorization header across 301/302/307/308 redirects (standard fetch strips Authorization on redirect)
 * - Accepts self-signed / intermediate reverse-proxy certificates (rejectUnauthorized: false)
 * - Detects HTML login / proxy walls vs. JSON responses
 */
function requestHomeAssistant(baseUrl, token, apiPath, timeoutMs = 8500, maxRedirects = 5) {
  const normalizedBase = normalizeHaBaseUrl(baseUrl);
  const cleanedToken = cleanHaToken(token);
  const fullUrl = `${normalizedBase}${apiPath.startsWith('/') ? apiPath : '/' + apiPath}`;

  return new Promise((resolve, reject) => {
    const performRequest = (targetUrl, redirectsLeft) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(targetUrl);
      } catch (err) {
        return reject(new Error(`Ungültige URL: ${targetUrl}`));
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;
      const agent = isHttps ? new https.Agent({ rejectUnauthorized: false, keepAlive: true }) : new http.Agent({ keepAlive: true });

      const reqOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        agent,
        headers: {
          'Authorization': `Bearer ${cleanedToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': `PV-Planung-Pro/${APP_VERSION} (HomeAssistant-Connector)`,
          'X-Requested-With': 'XMLHttpRequest'
        }
      };

      const req = lib.request(reqOptions, (res) => {
        const status = res.statusCode || 0;
        const location = res.headers['location'];

        // Follow redirects while keeping Authorization header intact
        if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
          res.resume();
          const nextUrl = new URL(location, targetUrl).toString();
          return performRequest(nextUrl, redirectsLeft - 1);
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          const contentType = String(res.headers['content-type'] || '').toLowerCase();
          let json = null;
          try {
            json = JSON.parse(rawBody);
          } catch (e) {
            json = null;
          }
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: res.headers,
            contentType,
            rawBody,
            json,
            finalUrl: targetUrl,
            normalizedBase
          });
        });
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)}s (Timeout)`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    };

    performRequest(fullUrl, maxRedirects);
  });
}

// POST /api/ha/config: Save Home Assistant configuration & entity mapping
app.post('/api/ha/config', (req, res) => {
  try {
    const incoming = req.body.config || req.body;
    const current = loadHaConfig();
    if (incoming.baseUrl) incoming.baseUrl = normalizeHaBaseUrl(incoming.baseUrl);
    if (incoming.accessToken) incoming.accessToken = cleanHaToken(incoming.accessToken);
    const merged = {
      ...current,
      ...incoming,
      entities: { ...(current.entities || {}), ...(incoming.entities || {}) },
      pvEnergyExtraEntities: Array.isArray(incoming.pvEnergyExtraEntities) ? incoming.pvEnergyExtraEntities : (current.pvEnergyExtraEntities || []),
      customStrings: Array.isArray(incoming.customStrings) ? incoming.customStrings : (current.customStrings || getDefaultCustomStrings()),
      customConsumers: Array.isArray(incoming.customConsumers) ? incoming.customConsumers : (current.customConsumers || getDefaultCustomConsumers()),
      updatedAt: new Date().toISOString()
    };
    saveHaConfig(merged);
    res.json({ success: true, config: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ha/test: Test Home Assistant connection & discover available sensor.* entities with Reverse-Proxy diagnostics
app.post('/api/ha/test', async (req, res) => {
  const stored = loadHaConfig();
  const baseUrl = normalizeHaBaseUrl(req.body.baseUrl || stored.baseUrl || '');
  const token = cleanHaToken(req.body.accessToken || stored.accessToken || '');

  if (!baseUrl) {
    return res.status(400).json({
      success: false,
      error: 'Bitte deine Home-Assistant-Domain oder URL eintragen (z. B. https://ha.deinedomain.de).',
      diagnostics: { step: 'url', hint: 'URL darf nicht leer sein.' }
    });
  }
  if (!token || token.length < 20) {
    return res.status(400).json({
      success: false,
      error: 'Bitte ein gültiges Long-Lived Access Token (Langlebiges Zugriffstoken) aus deinem Home-Assistant-Profil eintragen.',
      diagnostics: { step: 'token', hint: 'Ein Home Assistant Token ist ein langer JWT-String (beginnt meist mit eyJ...).' }
    });
  }

  const isPrivateLan = /^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|[^/]+\.local\b)/i.test(baseUrl);
  if (isPrivateLan) {
    return res.status(400).json({
      success: false,
      normalizedBaseUrl: baseUrl,
      error: `Die eingegebene Adresse (${baseUrl}) ist eine lokale Heimnetz-Adresse. Da diese App in der Cloud läuft, nutze bitte deine externe Reverse-Proxy-Domain (https://...) oder den Webhook-Push-Modus.`,
      diagnostics: {
        step: 'network-local',
        normalizedBaseUrl: baseUrl,
        hint: 'Trage deine externe Domain ein (z. B. https://ha.meinedomain.de) oder nutze im lokalen WLAN den Direkt-Browser-Modus / Webhook-Push.'
      }
    });
  }

  try {
    const result = await requestHomeAssistant(baseUrl, token, '/api/states', 9000);

    if (!result.ok) {
      let detailedHint = 'Bitte prüfe URL und Long-Lived Access Token.';
      if (result.status === 401) {
        detailedHint = 'HTTP 401 (Unauthorized): Entweder ist das Token abgelaufen/falsch kopiert, ODER dein Reverse Proxy (Nginx / Synology / Apache) leitet den Header "Authorization" nicht an Home Assistant weiter. Lösung im Reverse Proxy: Custom Header "Authorization: $http_authorization" bzw. "proxy_pass_header Authorization;" aktivieren.';
      } else if (result.status === 403) {
        const isCloudflare = String(result.rawBody || '').toLowerCase().includes('cloudflare') || String(result.headers['server'] || '').toLowerCase().includes('cloudflare');
        detailedHint = isCloudflare
          ? 'HTTP 403 (Cloudflare Block): Cloudflare Bot Fight Mode oder WAF blockiert den API-Zugriff auf /api/*. Erstelle in Cloudflare eine WAF-Regel: Wenn URI-Pfad mit "/api/" beginnt -> Skip Bot Fight Mode / Security.'
          : 'HTTP 403 (Forbidden): Home Assistant blockiert die Anfrage vom Reverse Proxy. Prüfe in deiner configuration.yaml unter "http:" die Einträge "use_x_forwarded_for: true" und "trusted_proxies:" (IP deines Reverse Proxys) sowie eventuelle "ip_bans.yaml".';
      } else if (result.status === 404) {
        detailedHint = `HTTP 404 (Not Found): Unter ${result.normalizedBase}/api/states wurde keine Home-Assistant-API gefunden. Prüfe, ob die Domain ohne Unterpfad (wie /lovelace) direkt auf Port 8123 zeigt.`;
      } else if (result.status === 502 || result.status === 504) {
        detailedHint = `HTTP ${result.status} (Bad Gateway / Gateway Timeout): Dein Reverse Proxy ist erreichbar, kann aber intern Home Assistant (Port 8123) nicht erreichen.`;
      }

      return res.status(result.status || 502).json({
        success: false,
        normalizedBaseUrl: result.normalizedBase,
        status: result.status,
        error: `Verbindung zu ${result.normalizedBase} fehlgeschlagen (HTTP ${result.status}). ${detailedHint}`,
        diagnostics: {
          step: 'http-status',
          status: result.status,
          normalizedBaseUrl: result.normalizedBase,
          hint: detailedHint
        }
      });
    }

    // Check if Reverse Proxy returned an HTML Login Page (e.g. Authelia, Authentik, Synology Portal, Cloudflare Access) instead of HA JSON
    if (!Array.isArray(result.json)) {
      const looksLikeHtml = result.contentType.includes('text/html') || String(result.rawBody || '').trim().startsWith('<');
      const htmlHint = looksLikeHtml
        ? 'Dein Reverse Proxy hat eine HTML-Login-Seite (z. B. vorgeschaltete Authentifizierung wie Authelia/Cloudflare Access oder falsche Weiterleitung) statt der Home-Assistant-JSON-API zurückgegeben. Bitte schalte den Pfad "/api/*" im Reverse Proxy von externen Login-Portalen frei.'
        : 'Unerwartetes Antwortformat von /api/states (kein JSON-Array).';
      return res.status(502).json({
        success: false,
        normalizedBaseUrl: result.normalizedBase,
        error: htmlHint,
        diagnostics: {
          step: 'content-type',
          contentType: result.contentType,
          normalizedBaseUrl: result.normalizedBase,
          hint: htmlHint
        }
      });
    }

    const allStates = result.json;
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
      normalizedBaseUrl: result.normalizedBase,
      totalEntities: allStates.length,
      sensorCount: sensors.length,
      sensors
    });
  } catch (err) {
    const errMsg = String(err.message || '');
    let netHint = 'Prüfe, ob deine Domain öffentlich erreichbar ist und Port 443 im Router/Reverse-Proxy geöffnet ist.';
    if (errMsg.includes('ENOTFOUND')) {
      netHint = `DNS-Fehler (ENOTFOUND): Die Domain "${baseUrl}" konnte im öffentlichen DNS nicht aufgelöst werden. Prüfe auf Tippfehler in der Domain.`;
    } else if (errMsg.includes('ECONNREFUSED')) {
      netHint = 'Verbindung abgelehnt (ECONNREFUSED): Der Server unter dieser Domain weist Verbindungen auf diesem Port ab.';
    } else if (errMsg.includes('Timeout') || errMsg.includes('ETIMEDOUT')) {
      netHint = 'Zeitüberschreitung (Timeout): Dein Reverse Proxy antwortet nicht auf externe Anfragen (Portweiterleitung 443 am Router oder Geo-IP-Firewall prüfen). Alternativ kannst du den Webhook-Push-Modus nutzen!';
    }
    res.status(502).json({
      success: false,
      normalizedBaseUrl: baseUrl,
      error: `Home Assistant über "${baseUrl}" nicht erreichbar (${errMsg}). ${netHint}`,
      diagnostics: {
        step: 'network-error',
        code: err.code || 'ERR',
        normalizedBaseUrl: baseUrl,
        hint: netHint
      }
    });
  }
});

// Helper to normalize HA sensor numeric state and unit (converts kW -> W for power, Wh -> kWh for energy)
function parseHaNumericState(stateObj, targetType = 'power') {
  if (!stateObj || stateObj.state === undefined || stateObj.state === null) return null;
  const sStr = String(stateObj.state).trim().toLowerCase();
  if (sStr === 'unavailable' || sStr === 'unknown' || sStr === '') return null;
  const rawVal = parseFloat(sStr.replace(',', '.'));
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
        stringTelemetry: latestWebhookTelemetry.strings,
        consumersTelemetry: latestWebhookTelemetry.consumers || []
      });
    }

    const baseUrlRaw = normalizeHaBaseUrl(cfg.baseUrl || '');
    const token = cleanHaToken(cfg.accessToken || '');

    if (!baseUrlRaw || !token) {
      return res.status(400).json({
        success: false,
        error: 'Home Assistant URL oder Access Token noch nicht konfiguriert.'
      });
    }

    const response = await requestHomeAssistant(baseUrlRaw, token, '/api/states', 7500);

    if (!response.ok || !Array.isArray(response.json)) {
      return res.status(response.status || 502).json({
        success: false,
        error: `Home Assistant HTTP ${response.status || 502}`
      });
    }

    const allStates = response.json;
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
    const gridImportP = getPower(ent.gridImportPower);
    const gridExportP = getPower(ent.gridExportPower);
    let gridPower = null;
    if (gridImportP !== null || gridExportP !== null) {
      gridPower = (gridImportP || 0) - (gridExportP || 0);
    } else {
      gridPower = getPower(ent.gridPower);
    }
    const batChgP = getPower(ent.batteryChargePower);
    const batDisP = getPower(ent.batteryDischargePower);
    let batteryPower = null;
    if (batChgP !== null || batDisP !== null) {
      batteryPower = Math.max(0, batChgP || 0) - Math.max(0, batDisP || 0);
    } else {
      batteryPower = getPower(ent.batteryPower);
    }
    let batterySoc = getRaw(ent.batterySoc);

    // Map per-string entities (customStrings)
    const stringTelemetry = {};
    const customStringsList = Array.isArray(cfg.customStrings) ? cfg.customStrings : [];
    const customStringsTelemetry = customStringsList.map(cs => {
      const pVal = getPower(cs.powerEntity);
      const eVal = getEnergy(cs.energyEntity);
      const available = cs.powerEntity ? (stateMap.has(cs.powerEntity) && pVal !== null) : false;
      if (cs.id) {
        stringTelemetry[cs.id] = {
          powerW: pVal,
          energyKwh: eVal
        };
      }
      return {
        id: cs.id,
        name: cs.name || cs.powerEntity || 'PV-String',
        color: cs.color || '#14b8a6',
        powerEntity: cs.powerEntity || '',
        energyEntity: cs.energyEntity || '',
        powerW: pVal !== null ? Math.max(0, pVal) : 0,
        energyKwh: eVal,
        available
      };
    });

    // Map custom individual consumers (Aktive Verbraucher)
    const customConsumersList = Array.isArray(cfg.customConsumers) ? cfg.customConsumers : [];
    let unavailableConsumersCount = 0;
    const consumersTelemetry = customConsumersList.map(cc => {
      const pVal = getPower(cc.powerEntity);
      const isAvail = cc.powerEntity && stateMap.has(cc.powerEntity) && pVal !== null;
      if (cc.powerEntity && !isAvail) unavailableConsumersCount++;
      return {
        id: cc.id,
        name: cc.name || cc.powerEntity || 'Verbraucher',
        powerEntity: cc.powerEntity || '',
        powerW: isAvail ? Math.max(0, Math.round(pVal)) : 0,
        available: Boolean(isAvail)
      };
    });

    // If total pvPower wasn't provided directly, sum from mapped strings if available
    if (pvPower === null) {
      const customPowers = customStringsTelemetry.filter(x => x.available).map(x => x.powerW);
      if (customPowers.length > 0) {
        pvPower = customPowers.reduce((a, b) => a + b, 0);
      } else {
        const strPowers = Object.values(stringTelemetry).map(x => x.powerW).filter(v => typeof v === 'number');
        if (strPowers.length > 0) {
          pvPower = strPowers.reduce((a, b) => a + b, 0);
        }
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
      batteryDischargeMonthKwh: getEnergy(ent.batteryDischargeMonth),
      unavailableConsumersCount
    };

    // Record snapshot into in-memory intraday buffer
    const snapStrings = {};
    customStringsTelemetry.forEach(cs => { snapStrings[cs.id] = cs.powerW; });
    recordIntradaySnapshot({
      pvPowerW: telemetry.pvPowerW,
      loadPowerW: telemetry.loadPowerW,
      gridImportW: Math.max(0, telemetry.gridPowerW),
      batterySocPct: telemetry.batterySocPct ?? 0,
      strings: snapStrings
    });

    res.json({
      success: true,
      mode: 'poll',
      updatedAt: new Date().toISOString(),
      telemetry,
      stringTelemetry,
      customStringsTelemetry,
      consumersTelemetry
    });
  } catch (err) {
    res.status(502).json({
      success: false,
      error: `Fehler beim Abruf von Home Assistant: ${err.message}`
    });
  }
});

// POST or GET /api/ha/history: Fetch intraday time-series from 00:00 today from Home Assistant
app.all('/api/ha/history', async (req, res) => {
  try {
    const stored = loadHaConfig();
    const cfg = req.body && req.body.config ? { ...stored, ...req.body.config } : stored;
    const baseUrlRaw = normalizeHaBaseUrl(cfg.baseUrl || '');
    const token = cleanHaToken(cfg.accessToken || '');

    const now = new Date();
    const range = (req.body?.range || req.query?.range || 'day').toLowerCase();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    let startTime;
    let stepMs;
    if (range === 'month') {
      startTime = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      stepMs = 3 * 3600 * 1000; // 3-hour steps for 30 days
    } else if (range === 'week') {
      startTime = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      stepMs = 60 * 60 * 1000; // 1-hour steps for 7 days
    } else {
      startTime = startOfDay;
      stepMs = 5 * 60 * 1000; // 5-minute steps for today
    }

    // If in webhook mode or missing credentials, return buffered intraday snapshots
    if (cfg.mode !== 'poll' || !baseUrlRaw || !token) {
      return res.json({
        success: true,
        source: 'buffer',
        range,
        startOfDay: startOfDay.toISOString(),
        startTime: startTime.toISOString(),
        now: now.toISOString(),
        snapshots: intradaySnapshots
      });
    }

    const ent = cfg.entities || {};
    const customStrings = Array.isArray(cfg.customStrings) ? cfg.customStrings : [];
    const customConsumers = Array.isArray(cfg.customConsumers) ? cfg.customConsumers : [];

    // Collect all entity IDs we want history for
    const entityKeyMap = [];
    if (ent.pvPower) entityKeyMap.push({ key: 'pv_total', entityId: ent.pvPower, type: 'power' });
    if (ent.loadPower) entityKeyMap.push({ key: 'house_load', entityId: ent.loadPower, type: 'power' });
    if (ent.gridPower) entityKeyMap.push({ key: 'grid_power', entityId: ent.gridPower, type: 'power' });
    if (ent.gridImportPower) entityKeyMap.push({ key: 'grid_power_import', entityId: ent.gridImportPower, type: 'power' });
    if (ent.gridExportPower) entityKeyMap.push({ key: 'grid_power_export', entityId: ent.gridExportPower, type: 'power' });
    if (ent.batteryChargePower) entityKeyMap.push({ key: 'battery_charge_power', entityId: ent.batteryChargePower, type: 'power' });
    if (ent.batteryDischargePower) entityKeyMap.push({ key: 'battery_discharge_power', entityId: ent.batteryDischargePower, type: 'power' });
    if (ent.batteryPower) entityKeyMap.push({ key: 'battery_power', entityId: ent.batteryPower, type: 'power' });
    if (ent.batterySoc) entityKeyMap.push({ key: 'battery_soc', entityId: ent.batterySoc, type: 'raw' });

    customStrings.forEach(cs => {
      if (cs.id && cs.powerEntity) {
        entityKeyMap.push({ key: cs.id, entityId: cs.powerEntity, type: 'power' });
      }
    });

    customConsumers.forEach(cc => {
      if (cc.id && cc.powerEntity) {
        entityKeyMap.push({ key: `consumer_${cc.id}`, entityId: cc.powerEntity, type: 'power' });
      }
    });

    const uniqueEntityIds = [...new Set(entityKeyMap.map(x => x.entityId).filter(Boolean))];
    if (uniqueEntityIds.length === 0) {
      return res.json({
        success: true,
        source: 'empty',
        range,
        startOfDay: startOfDay.toISOString(),
        startTime: startTime.toISOString(),
        now: now.toISOString(),
        snapshots: intradaySnapshots
      });
    }

    const historyApiPath = `/api/history/period/${encodeURIComponent(startTime.toISOString())}?filter_entity_id=${encodeURIComponent(uniqueEntityIds.join(','))}&end_time=${encodeURIComponent(now.toISOString())}&minimal_response`;

    const response = await requestHomeAssistant(baseUrlRaw, token, historyApiPath, 8500);

    if (!response.ok || !Array.isArray(response.json)) {
      return res.json({
        success: true,
        source: 'buffer-fallback',
        range,
        startOfDay: startOfDay.toISOString(),
        startTime: startTime.toISOString(),
        now: now.toISOString(),
        snapshots: intradaySnapshots
      });
    }

    const rawHistoryArrays = response.json;
    // Build time buckets from startTime to now
    const bucketTimes = [];
    for (let t = startTime.getTime(); t <= now.getTime(); t += stepMs) {
      bucketTimes.push(t);
    }
    if (bucketTimes.length === 0 || bucketTimes[bucketTimes.length - 1] < now.getTime()) {
      bucketTimes.push(now.getTime());
    }

    // Parse each entity's timeline
    const historyByEntity = new Map();
    if (Array.isArray(rawHistoryArrays)) {
      rawHistoryArrays.forEach(arr => {
        if (!Array.isArray(arr) || arr.length === 0) return;
        const firstId = arr[0]?.entity_id;
        if (!firstId) return;
        const mInfo = entityKeyMap.find(x => x.entityId === firstId);
        const targetType = mInfo ? mInfo.type : 'power';
        const pts = [];
        arr.forEach(item => {
          const val = parseHaNumericState(item, targetType);
          const tsStr = item.last_changed || item.last_updated;
          const ts = tsStr ? new Date(tsStr).getTime() : NaN;
          if (val !== null && !isNaN(ts)) {
            pts.push({ ts, val });
          }
        });
        pts.sort((a, b) => a.ts - b.ts);
        historyByEntity.set(firstId, pts);
      });
    }

    // Sample onto bucketTimes (step-hold interpolation) and integrate kWh
    const series = {};
    const integratedKwh = {};

    entityKeyMap.forEach(({ key, entityId, type }) => {
      const pts = historyByEntity.get(entityId) || [];
      const sampled = new Array(bucketTimes.length).fill(0);
      if (pts.length > 0) {
        let pIdx = 0;
        let lastVal = pts[0].val;
        for (let i = 0; i < bucketTimes.length; i++) {
          const bt = bucketTimes[i];
          while (pIdx < pts.length && pts[pIdx].ts <= bt) {
            lastVal = pts[pIdx].val;
            pIdx++;
          }
          sampled[i] = Math.round(lastVal * 10) / 10;
        }
      }
      series[key] = sampled;

      // Trapezoidal energy integration in kWh for power curves
      if (type === 'power' && bucketTimes.length > 1) {
        let whSum = 0;
        for (let i = 1; i < bucketTimes.length; i++) {
          const dtHours = (bucketTimes[i] - bucketTimes[i - 1]) / 3600000;
          const avgW = Math.max(0, (sampled[i] + sampled[i - 1]) / 2);
          whSum += avgW * dtHours;
        }
        integratedKwh[key] = +(whSum / 1000).toFixed(3);
      }
    });

    if (!series.pv_total || series.pv_total.every(v => v === 0)) {
      series.pv_total = bucketTimes.map((_, idx) => {
        let sum = 0;
        customStrings.forEach(cs => {
          if (cs && cs.id && Array.isArray(series[cs.id])) {
            sum += series[cs.id][idx] || 0;
          }
        });
        return Math.round(sum * 10) / 10;
      });
      if (bucketTimes.length > 1) {
        let whSum = 0;
        for (let i = 1; i < bucketTimes.length; i++) {
          const dtHours = (bucketTimes[i] - bucketTimes[i - 1]) / 3600000;
          const avgW = Math.max(0, (series.pv_total[i] + series.pv_total[i - 1]) / 2);
          whSum += avgW * dtHours;
        }
        integratedKwh.pv_total = +(whSum / 1000).toFixed(3);
      }
    }

    if (series.grid_power_import || series.grid_power_export) {
      const impArr = series.grid_power_import || new Array(bucketTimes.length).fill(0);
      const expArr = series.grid_power_export || new Array(bucketTimes.length).fill(0);
      series.grid_power = bucketTimes.map((_, i) => Math.max(0, impArr[i] || 0));
      series.grid_feedin = bucketTimes.map((_, i) => Math.max(0, expArr[i] || 0));
      if (bucketTimes.length > 1) {
        let impWh = 0;
        let expWh = 0;
        for (let i = 1; i < bucketTimes.length; i++) {
          const dtH = (bucketTimes[i] - bucketTimes[i - 1]) / 3600000;
          impWh += Math.max(0, (impArr[i] + impArr[i - 1]) / 2) * dtH;
          expWh += Math.max(0, (expArr[i] + expArr[i - 1]) / 2) * dtH;
        }
        integratedKwh.grid_power = +(impWh / 1000).toFixed(3);
        integratedKwh.grid_feedin = +(expWh / 1000).toFixed(3);
      }
    }

    if (series.battery_charge_power || series.battery_discharge_power) {
      const chgArr = series.battery_charge_power || new Array(bucketTimes.length).fill(0);
      const disArr = series.battery_discharge_power || new Array(bucketTimes.length).fill(0);
      series.battery_power = bucketTimes.map((_, i) => Math.max(0, chgArr[i] || 0) - Math.max(0, disArr[i] || 0));
      if (typeof integratedKwh.battery_charge_power === 'number') integratedKwh.battery_charge = integratedKwh.battery_charge_power;
      if (typeof integratedKwh.battery_discharge_power === 'number') integratedKwh.battery_discharge = integratedKwh.battery_discharge_power;
    }

    const peakValues = {};
    Object.keys(series).forEach(k => {
      const arr = series[k] || [];
      peakValues[k] = arr.reduce((m, v) => Math.max(m, Math.abs(v || 0)), 0);
    });

    res.json({
      success: true,
      source: 'ha-history',
      startOfDay: startOfDay.toISOString(),
      now: now.toISOString(),
      bucketTimes,
      series,
      integratedKwh,
      peakValues
    });
  } catch (err) {
    res.json({
      success: true,
      source: 'buffer-error-fallback',
      snapshots: intradaySnapshots,
      error: err.message
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
      strings: body.strings || {},
      consumers: Array.isArray(body.consumers) ? body.consumers : []
    };

    recordIntradaySnapshot({
      pvPowerW: latestWebhookTelemetry.values.pvPowerW,
      loadPowerW: latestWebhookTelemetry.values.loadPowerW,
      gridImportW: Math.max(0, latestWebhookTelemetry.values.gridPowerW),
      batterySocPct: latestWebhookTelemetry.values.batterySocPct ?? 0,
      strings: body.strings || {}
    });

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
  console.log(`Server running at http://${HOST}:${PORT} (v${APP_VERSION})`);
});


