import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const APP_VERSION = '12.8';

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

// CORS & Server Signature Headers for flexible access and Service Worker validation
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('X-PVPro-Server', APP_VERSION);
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Always serve Service Worker without browser HTTP caching and with strict JS MIME headers
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'sw.js'));
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

    const existingIdx = plans.findIndex(p =>
      String(p.id) === String(planId) ||
      (p.name && p.name.trim().toLowerCase() === name.trim().toLowerCase())
    );
    if (existingIdx >= 0) {
      planObj.id = plans[existingIdx].id || planId;
      planObj.createdAt = plans[existingIdx].createdAt || now;
      plans[existingIdx] = planObj;
    } else {
      plans.push(planObj);
    }

    saveSystemPlans(plans);

    res.json({
      success: true,
      message: `Gesamtpaket "${name}" fest im System/Code gespeichert`,
      plan: planObj,
      plans
    });
  } catch (err) {
    console.error('Error persisting system plan:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/plans/persistent/:id: Remove a persistent system plan by id or name
app.delete('/api/plans/persistent/:id', (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id || '');
    const targetName = String(req.query.name || '').trim().toLowerCase();
    let plans = loadSystemPlans();
    plans = plans.filter(p => {
      if (String(p.id) === id) return false;
      if (targetName && (p.name || '').trim().toLowerCase() === targetName) return false;
      return true;
    });
    saveSystemPlans(plans);
    res.json({ success: true, message: 'Gesamtpaket gelöscht', plans });
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

    // Return 500 instead of 503 so Nginx proxy_intercept_errors does not replace JSON with warmup.html
    return res.status(500).json({
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
    customConsumers: getDefaultCustomConsumers(),
    customWeatherSensors: [],
    monitoredDevices: [],
    homeCameras: []
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
        weatherEntity: parsed.weatherEntity || '',
        outdoorTempEntity: parsed.outdoorTempEntity || '',
        entities: {
          ...defaults.entities,
          ...(parsed.entities || {})
        },
        pvEnergyExtraEntities: Array.isArray(parsed.pvEnergyExtraEntities) ? parsed.pvEnergyExtraEntities : [],
        customStrings: Array.isArray(parsed.customStrings) && parsed.customStrings.length > 0 ? parsed.customStrings : defaults.customStrings,
        customConsumers: Array.isArray(parsed.customConsumers) ? parsed.customConsumers : defaults.customConsumers,
        customWeatherSensors: Array.isArray(parsed.customWeatherSensors) ? parsed.customWeatherSensors : [],
        monitoredDevices: Array.isArray(parsed.monitoredDevices) ? parsed.monitoredDevices : [],
        homeCameras: Array.isArray(parsed.homeCameras) ? parsed.homeCameras : []
      };
    }
  } catch (err) {
    console.warn('Could not load HA config:', err.message);
  }
  return defaults;
}

function saveHaConfig(cfg) {
  try {
    // Security rule: Never persist accessToken or local AI keys on server disk (keep tokens strictly on the user's device & local backup file)
    const sanitized = { ...(cfg || {}), accessToken: '' };
    delete sanitized.localDeviceSecrets;
    fs.writeFileSync(HA_CONFIG_FILE, JSON.stringify(sanitized, null, 2), 'utf-8');
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
      monitoredDevices: Array.isArray(incoming.monitoredDevices) ? incoming.monitoredDevices : (current.monitoredDevices || []),
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

      // Avoid 403/502/503/504 on outer response so Nginx proxy_intercept_errors does not replace JSON with warmup.html/forbidden.html
      return res.status(200).json({
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
      return res.status(200).json({
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
    res.status(200).json({
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
  // Power Outage / Stale Guard (15 min silence -> 0 W for power sensors)
  if (targetType === 'power') {
    const tsStr = stateObj.last_updated || stateObj.last_changed;
    if (tsStr) {
      const ageMs = Date.now() - new Date(tsStr).getTime();
      if (Number.isFinite(ageMs) && ageMs > 15 * 60 * 1000) {
        return 0;
      }
    }
  }
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
      return res.status(200).json({
        success: false,
        upstreamStatus: response.status || 502,
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

    // Map custom individual consumers (Aktive Verbraucher & Wallbox)
    const customConsumersList = Array.isArray(cfg.customConsumers) ? cfg.customConsumers : [];
    let unavailableConsumersCount = 0;
    const consumersTelemetry = customConsumersList.map(cc => {
      const pVal = getPower(cc.powerEntity);
      const eVal = getEnergy(cc.energyEntity);
      const isAvail = (cc.powerEntity && stateMap.has(cc.powerEntity) && pVal !== null) || (cc.energyEntity && stateMap.has(cc.energyEntity) && eVal !== null);
      if ((cc.powerEntity || cc.energyEntity) && !isAvail) unavailableConsumersCount++;
      return {
        id: cc.id,
        name: cc.name || cc.powerEntity || 'Verbraucher',
        group: cc.group || '',
        type: cc.type || '',
        powerEntity: cc.powerEntity || '',
        energyEntity: cc.energyEntity || '',
        powerW: pVal !== null ? Math.max(0, Math.round(pVal)) : 0,
        rawCounterKwh: eVal !== null ? +eVal.toFixed(3) : null,
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
    res.status(200).json({
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

    const trackRaw = String(cfg.trackingStartDate || '2026-11-01').trim();
    const trackMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trackRaw);
    const trackMs = trackMatch
      ? new Date(Number(trackMatch[1]), Number(trackMatch[2]) - 1, Number(trackMatch[3]), 0, 0, 0).getTime()
      : new Date(2026, 10, 1, 0, 0, 0).getTime();

    let startTime;
    let stepMs;
    if (range === 'month') {
      const rawStart = now.getTime() - 30 * 24 * 3600 * 1000;
      const effStart = Math.min(startOfDay.getTime(), (trackMs <= now.getTime() && trackMs > rawStart) ? trackMs : rawStart);
      startTime = new Date(effStart);
      stepMs = (now.getTime() - effStart <= 14 * 24 * 3600 * 1000) ? 3600 * 1000 : 3 * 3600 * 1000;
    } else if (range === 'week') {
      const rawStart = now.getTime() - 7 * 24 * 3600 * 1000;
      const effStart = Math.min(startOfDay.getTime(), (trackMs <= now.getTime() && trackMs > rawStart) ? trackMs : rawStart);
      startTime = new Date(effStart);
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

    // Parse each entity's timeline (Power Outage Guard: unavailable/unknown = 0 W for power sensors!)
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
          const tsStr = item.last_changed || item.last_updated;
          const ts = tsStr ? new Date(tsStr).getTime() : NaN;
          if (isNaN(ts)) return;
          const sLower = String(item.state ?? '').trim().toLowerCase();
          if (targetType === 'power' && (sLower === 'unavailable' || sLower === 'unknown' || sLower === '')) {
            pts.push({ ts, val: 0, isOutage: true });
            return;
          }
          const val = parseHaNumericState({ ...item, last_updated: null, last_changed: null }, targetType);
          if (val !== null) {
            pts.push({ ts, val, isOutage: false });
          }
        });
        pts.sort((a, b) => a.ts - b.ts);
        historyByEntity.set(firstId, pts);
      });
    }

    // Sample onto bucketTimes (with 15-min silence/outage drop to 0 W for power sensors) and integrate kWh
    const series = {};
    const integratedKwh = {};
    const silenceMaxMs = range === 'day' ? 15 * 60 * 1000 : stepMs * 2;

    entityKeyMap.forEach(({ key, entityId, type }) => {
      const pts = historyByEntity.get(entityId) || [];
      const sampled = new Array(bucketTimes.length).fill(0);
      if (pts.length > 0) {
        let pIdx = 0;
        let lastVal = pts[0].val;
        let lastTs = pts[0].ts;
        let lastWasOutage = Boolean(pts[0].isOutage);
        for (let i = 0; i < bucketTimes.length; i++) {
          const bt = bucketTimes[i];
          if (bt < pts[0].ts) {
            sampled[i] = type === 'power' ? 0 : Math.round(pts[0].val * 10) / 10;
            continue;
          }
          while (pIdx < pts.length && pts[pIdx].ts <= bt) {
            lastVal = pts[pIdx].val;
            lastTs = pts[pIdx].ts;
            lastWasOutage = Boolean(pts[pIdx].isOutage);
            pIdx++;
          }
          if (type === 'power') {
            const nextPt = pIdx < pts.length ? pts[pIdx] : null;
            const gapToNextMs = nextPt ? (nextPt.ts - lastTs) : (now.getTime() - lastTs);
            if (lastWasOutage || ((bt - lastTs) > silenceMaxMs && gapToNextMs > silenceMaxMs)) {
              sampled[i] = 0;
            } else {
              sampled[i] = Math.round(lastVal * 10) / 10;
            }
          } else {
            sampled[i] = Math.round(lastVal * 10) / 10;
          }
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

    // Also mirror performanceRecords into the active persisted system plan in database.js (for GitHub backup)
    try {
      const plans = loadSystemPlans();
      if (Array.isArray(plans) && plans.length > 0 && plans[0].data) {
        plans[0].data.performanceRecords = allRecords;
        saveSystemPlans(plans);
      }
    } catch (syncErr) {}

    res.json({ success: true, records: allRecords });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// API: IN-APP KI-ASSISTENT, SENSOR-KONFIGURATOR & TELEMETRIE-DEBUGGER (V12.0)
// ==========================================
const AI_ROLE_LABELS = {
  general: 'Allround-Assistent & Konfigurator',
  sensor_finder: 'HA-Sensor-Finder & Zuweiser',
  telemetry_debugger: 'Telemetrie- & Zähler-Debugger',
  wallbox_optimizer: 'Wallbox- & PV-Lade-Optimierer',
  architecture_inspector: 'AGENTS.md Regel- & Code-Inspektor'
};

app.get('/api/ai/status', (req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && String(process.env.GEMINI_API_KEY).trim());
  res.json({
    success: true,
    appVersion: APP_VERSION,
    hasApiKey: hasKey,
    activeEngine: hasKey ? 'gemini-4-hydrogen' : 'local-inspector',
    engineLabel: hasKey ? 'Google Gemini 4 (gemini-4-hydrogen)' : 'Lokale Diagnose-Engine (System-Inspektor)',
    statusLabel: hasKey ? 'Gemini 4 Cloud-KI aktiv (Server-Secret)' : 'Lokale Diagnose aktiv (Kein GEMINI_API_KEY in Secrets)'
  });
});

function buildLocalDiagnosticFallback(promptText, contextObj = {}, aiSettings = {}) {
  const rawPrompt = String(promptText || '').trim();
  const q = rawPrompt.toLowerCase();
  const roleFocus = String(aiSettings.roleFocus || 'general');
  const thinkingLevel = String(aiSettings.thinkingLevel || 'HIGH').toUpperCase();
  const roleLabel = AI_ROLE_LABELS[roleFocus] || AI_ROLE_LABELS.general;

  const entities = Array.isArray(contextObj.availableEntities) ? contextObj.availableEntities : [];
  const diagnostics = Array.isArray(contextObj.sensorDiagnostics) ? contextObj.sensorDiagnostics : [];
  const tele = contextObj.liveTelemetry || {};
  const cfg = contextObj.haConfigSummary || {};
  const wb = contextObj.wallboxSummary || {};
  const suggestedActions = [];
  const lines = [];

  const isGreeting = /^(hallo|hi|hey|guten tag|moin|servus|wer bist du|wer steckt dahinter|was kannst du)\b/i.test(q);

  lines.push(`### 🤖 ${roleLabel} · System-Status (v${APP_VERSION})`);
  lines.push(`- **Aktive Engine:** \`Lokale Diagnose-Engine\` *(Fokus: ${roleLabel} · Denkmodus: ${thinkingLevel})*`);
  lines.push(`- **Wer steckt dahinter?** Im Server-Backend (\`server.js\`) ist **Google Gemini 4 (\`gemini-4-hydrogen\`)** über das offizielle \`@google/genai\` SDK integriert. Sobald in AI Studio unter **Settings > Secrets** ein \`GEMINI_API_KEY\` hinterlegt ist, antwortet Gemini 4 live. Ist noch kein Schlüssel hinterlegt, übernimmt nahtlos dieser regelkonforme **lokale Telemetrie- & Sensor-Inspektor**.`);
  lines.push(`- **Übergebener Echtzeit-Kontext:** \`${entities.length}\` HA-Sensoren · \`${(cfg.customConsumers || []).length}\` Einzelverbraucher · \`${(cfg.monitoredDevices || []).length}\` Geräte · Live: PV \`${tele.pvPowerW || 0} W\`, Hauslast \`${tele.loadPowerW || 0} W\`, Netz \`${tele.gridPowerW || 0} W\`, Speicher \`${tele.batterySocPct ?? '—'} %\`.`);

  if (isGreeting) {
    lines.push(`\n#### 👋 Hallo! Wie kann ich dir helfen?`);
    lines.push(`- **Sensoren suchen & zuweisen:** Tippe z. B. *„Suche nach Fronius“*, *„Suche Wallbox Sensoren“* oder *„Zeige alle kWh Sensoren“*.`);
    lines.push(`- **Wallbox & PV-Anteil prüfen:** Deine Wallbox (${wb.primaryWallboxName || 'Wallbox'}) ist hinter dem Smart Meter im Hausverbrauch eingebunden (Heute: \`${Number(wb.wallboxTodayKwh || 0).toFixed(2)} kWh\`, PV-Anteil: \`${wb.wallboxPvSharePct || 0} %\`).`);
    lines.push(`- **Einstellungen oben anpassen:** Über den Button **„KI-Einstellungen“** oben im Header kannst du jederzeit die **Analyse-Tiefe (Schnell / Ausgewogen / Tiefen-Diagnose)** und meine **Fokus-Rolle** umschalten.`);
  }

  // Keyword search across discovered HA entities if user typed a specific search term
  const stopWords = new Set(['suche', 'finde', 'zeige', 'mir', 'meine', 'meinen', 'sensor', 'sensoren', 'in', 'home', 'assistant', 'nach', 'bitte', 'alle', 'wie', 'wo', 'ist', 'sind', 'und', 'oder', 'der', 'die', 'das', 'für', 'von', 'mit', 'prüfe', 'pruefe', 'analysiere', 'hallo']);
  const searchTokens = q
    .replace(/[^a-z0-9äöüß_.-]+/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  if (searchTokens.length > 0 && entities.length > 0) {
    const matchedEntities = entities.filter(e => {
      const hay = `${e.entity_id} ${e.name} ${e.unit}`.toLowerCase();
      return searchTokens.some(tok => hay.includes(tok));
    }).slice(0, 8);

    if (matchedEntities.length > 0) {
      lines.push(`\n#### 🔎 Gefundene Home-Assistant-Sensoren zur Anfrage (${matchedEntities.length} Treffer):`);
      matchedEntities.forEach(e => {
        lines.push(`- \`${e.entity_id}\` — **${e.name || e.entity_id}**: \`${e.state} ${e.unit || ''}\``);
      });
    }
  }

  if (entities.length === 0) {
    lines.push(`\n#### 📡 Hinweis zur Home-Assistant-Sensorliste:`);
    lines.push(`- Aktuell sind noch \`0\` entdeckte Sensoren im Browser-Zwischenspeicher geladen. Klicke unten auf **„HA-Sensoren jetzt scannen“**, um alle Entitäten aus Home Assistant zu laden.`);
    suggestedActions.push({
      id: 'act_scan_ha_entities',
      actionType: 'scan_ha_sensors',
      title: 'HA-Sensoren jetzt live scannen',
      description: 'Lädt alle verfügbaren sensor.* Entitäten aus deiner Home-Assistant-Instanz in den KI-Kontext.',
      payloadJson: JSON.stringify({})
    });
  }

  // 1. Check for Wallbox / EV sensors
  const wallboxCandidates = entities.filter(e => /wallbox|evcc|go_e|goe|wattpilot|keba|easee|openwb|charger|auto_laden|car_charge/i.test(`${e.entity_id} ${e.name}`));
  const wbPower = wallboxCandidates.find(e => /^(w|kw)$/i.test(String(e.unit || '')));
  const wbEnergy = wallboxCandidates.find(e => /^(wh|kwh|mwh)$/i.test(String(e.unit || '')));

  if (wbPower || wbEnergy) {
    suggestedActions.push({
      id: 'act_wallbox_setup',
      actionType: 'add_or_update_wallbox',
      title: `Wallbox konfigurieren (${wbPower ? wbPower.name || wbPower.entity_id : wbEnergy.name || wbEnergy.entity_id})`,
      description: `Setzt Typ „Wallbox (E-Auto)“ mit Live-Watt (${wbPower?.entity_id || '—'}) und kWh-Zähler (${wbEnergy?.entity_id || '—'}) für PV-Ladeanteil & Session-Tracking.`,
      payloadJson: JSON.stringify({
        name: 'Wallbox',
        type: 'wallbox',
        powerEntity: wbPower?.entity_id || '',
        energyEntity: wbEnergy?.entity_id || ''
      })
    });
  }

  // 2. Check for unconfigured main PV / Grid / Load / Battery sensors
  const findBestSensor = (regex, unitRegex) => entities.find(e => regex.test(`${e.entity_id} ${e.name}`) && unitRegex.test(String(e.unit || '')));
  if (!cfg.entities?.pvPower) {
    const pvP = findBestSensor(/pv_power|solar_power|power_photovoltaics|ac_power|dc_power|wechselrichter.*power/i, /^(w|kw)$/i);
    if (pvP) {
      suggestedActions.push({
        id: 'act_pv_power',
        actionType: 'assign_main_sensor',
        title: `PV-Leistung zuweisen: ${pvP.entity_id}`,
        description: `Trägt ${pvP.name || pvP.entity_id} (${pvP.state} ${pvP.unit}) als Haupt-PV-Leistungssensor ein.`,
        payloadJson: JSON.stringify({ field: 'pvPower', entityId: pvP.entity_id })
      });
    }
  }
  if (!cfg.entities?.loadPower) {
    const loadP = findBestSensor(/power_load|house_load|hausverbrauch|consumption_power|home_power/i, /^(w|kw)$/i);
    if (loadP) {
      suggestedActions.push({
        id: 'act_load_power',
        actionType: 'assign_main_sensor',
        title: `Hausverbrauch (W) zuweisen: ${loadP.entity_id}`,
        description: `Trägt ${loadP.name || loadP.entity_id} (${loadP.state} ${loadP.unit}) als Hausverbrauch-Sensor ein.`,
        payloadJson: JSON.stringify({ field: 'loadPower', entityId: loadP.entity_id })
      });
    }
  }

  // 3. Role-specific sections
  if (roleFocus === 'telemetry_debugger' || q.includes('zähler') || q.includes('debug') || q.includes('telemetrie')) {
    if (diagnostics.length > 0) {
      lines.push(`\n#### ⚠️ Erkannte Sensor-Hinweise & Zähler-Sprünge (${diagnostics.length}):`);
      diagnostics.slice(0, 6).forEach(d => {
        lines.push(`- **\`${d.entityId}\`** (${d.status}): ${d.jumpInfo || d.reason || 'Prüfung empfohlen'}`);
      });
      suggestedActions.push({
        id: 'act_open_counters',
        actionType: 'open_modal_tab',
        title: 'Zähler-Kalibrierung & Sensoren öffnen',
        description: 'Öffnet den Home Assistant Sensor-Konfigurator zur Überprüfung der kWh-Gesamtzähler.',
        payloadJson: JSON.stringify({ tab: 'config' })
      });
    } else {
      lines.push(`\n#### ✅ Telemetrie- & Zähler-Integrität:`);
      lines.push(`- Keine fehlerhaften Einheiten oder unkalibrierten Zähler-Sprünge erkannt. Single Source of Truth (\`getUnifiedEnergyLedger\`) ist synchron.`);
    }
  }

  if (roleFocus === 'wallbox_optimizer' || q.includes('wallbox') || q.includes('auto') || q.includes('laden')) {
    lines.push(`\n#### 🚗 Wallbox & E-Mobility Status:`);
    lines.push(`- **Integration im Hausverbrauch:** Deine Wallbox (${wb.primaryWallboxName || 'Wallbox'}) ist hinter dem Smart Meter angeschlossen und im Hausverbrauch, Sankey-Diagramm und der Autarkie-Analyse voll berücksichtigt.`);
    lines.push(`- **Messwerte:** Heute \`${Number(wb.wallboxTodayKwh || 0).toFixed(2)} kWh\` geladen · Monat \`${Number(wb.wallboxMonthKwh || 0).toFixed(2)} kWh\` · PV-Ladeanteil \`${wb.wallboxPvSharePct || 0} %\`.`);
    suggestedActions.push({
      id: 'act_reset_wb_session',
      actionType: 'reset_wallbox_session',
      title: 'Wallbox Lade-Session jetzt nullen (Session Reset)',
      description: 'Setzt den kWh-Ankerpunkt der aktuellen Wallbox-Ladesession auf den jetzigen Zählerstand zurück.',
      payloadJson: JSON.stringify({})
    });
  }

  if (roleFocus === 'architecture_inspector' || q.includes('regel') || q.includes('guideline') || q.includes('code') || q.includes('architektur')) {
    lines.push(`\n#### 📐 Architektur- & Guideline-Check (\`AGENTS.md\` & \`DEVELOPMENT_GUIDELINES.md\`):`);
    lines.push(`- **Versionierung:** Aktuelle Systemversion **v${APP_VERSION}** synchron über alle Module (\`package.json\`, \`index.html\`, \`sw.js\`, \`content.js\`, \`server.js\`).`);
    lines.push(`- **Keine Insellösungen:** Live-Kacheln, Wallbox-Status-Kachel, Sankey-Diagramm und Analyse beziehen ihre Werte aus \`getUnifiedEnergyLedger()\`.`);
  }

  if (suggestedActions.length === 0) {
    suggestedActions.push({
      id: 'act_open_consumers',
      actionType: 'open_modal_tab',
      title: 'Verbraucher & Wallbox verwalten',
      description: 'Öffnet Tab „2. Verbraucher“ im Home Assistant Setup.',
      payloadJson: JSON.stringify({ tab: 'consumers' })
    });
    suggestedActions.push({
      id: 'act_open_devices',
      actionType: 'open_modal_tab',
      title: 'Geräte & Hardware-Diagnose öffnen',
      description: 'Öffnet Tab „4. Geräte“ zur Auswahl von Wechselrichter, Speicher und Smart Meter.',
      payloadJson: JSON.stringify({ tab: 'devices' })
    });
  }

  return {
    answerMarkdown: lines.join('\n'),
    suggestedActions
  };
}

app.post('/api/ai/assistant', async (req, res) => {
  try {
    const { prompt, context, aiSettings, localSecrets } = req.body || {};
    const userPrompt = String(prompt || 'Prüfe meine aktuelle Telemetrie, Wallbox-Einbindung und Sensoren.').trim();
    const safeContext = context && typeof context === 'object' ? context : {};
    const safeSettings = aiSettings && typeof aiSettings === 'object' ? aiSettings : {};
    const safeSecrets = localSecrets && typeof localSecrets === 'object' ? localSecrets : {};
    const roleFocus = String(safeSettings.roleFocus || 'general');
    const roleLabel = AI_ROLE_LABELS[roleFocus] || AI_ROLE_LABELS.general;
    const rawThinking = String(safeSettings.thinkingLevel || 'HIGH').toUpperCase();
    const thinkingLevelKey = ['LOW', 'HIGH', 'XHIGH'].includes(rawThinking) ? rawThinking : 'HIGH';

    const contextStats = {
      entityCount: Array.isArray(safeContext.availableEntities) ? safeContext.availableEntities.length : 0,
      consumerCount: Array.isArray(safeContext.haConfigSummary?.customConsumers) ? safeContext.haConfigSummary.customConsumers.length : 0,
      deviceCount: Array.isArray(safeContext.haConfigSummary?.monitoredDevices) ? safeContext.haConfigSummary.monitoredDevices.length : 0,
      diagnosticCount: Array.isArray(safeContext.sensorDiagnostics) ? safeContext.sensorDiagnostics.length : 0,
      hasWallbox: Boolean(safeContext.wallboxSummary?.hasWallbox)
    };

    const roleSpecificDirective = {
      general: 'Beantworte alle Fragen zu PV-Auslegung, Home-Assistant-Sensoren, Wallbox-Ladung und System-Einstellungen.',
      sensor_finder: 'Fokussiere dich besonders auf das Durchsuchen von availableEntitiesSample, schlage passende Entitäten für PV, Hausverbrauch, Netz, Speicher und Wallbox vor und liefere 1-Klick-Zuweisungen in suggestedActions.',
      telemetry_debugger: 'Fokussiere dich auf Zähler-Kalibrierung, kWh-Deltas (Heute/Monat), Zähler-Sprünge in sensorDiagnostics, Offline-Sensoren (15-Minuten-0W-Guard) und die Konsistenz von getUnifiedEnergyLedger().',
      wallbox_optimizer: 'Fokussiere dich auf die hinter dem Smart Meter angeschlossene Wallbox, den Hybrid-Session-Tracker (kWh-Zähleranker + Live-Watt-Integral), den PV-Ladeanteil in % und die Euro-Ersparnis.',
      architecture_inspector: 'Prüfe strikt die Einhaltung von AGENTS.md und DEVELOPMENT_GUIDELINES.md (Single Source of Truth, 0.1-Versionierung, Modul-Trennung, DIN VDE 0100-712).'
    }[roleFocus] || '';

    const systemInstruction = `Du bist der integrierte KI-Systemassistent, Home-Assistant-Konfigurator und Telemetrie-Debugger von "PV-Planung Pro (v${APP_VERSION})".
Aktive Fokus-Rolle: ${roleLabel} (${roleSpecificDirective})
Gewählter Denkmodus (ThinkingLevel): ${thinkingLevelKey}.
Du arbeitest strikt regelkonform nach AGENTS.md und DEVELOPMENT_GUIDELINES.md:
1. Single Source of Truth (Keine Insellösungen): Alle Energiewerte (Heute, Monat, Jahr, Sankey, Autarkie, Wallbox) stammen konsistent aus getUnifiedEnergyLedger().
2. Wallbox hinter Smart Meter: Die Wallbox ist regulär hinter dem Smart Meter angeschlossen und Teil des Hausverbrauchs. Die dedizierte Wallbox-Status-Kachel auf dem Live-Dashboard nutzt den Hybrid-Session-Tracker (exakter kWh-Zähleranker bei Ladebeginn + verzögerungsfreies Watt-Integral zwischen Zähler-Updates) und berechnet den Live- & Session-PV-Ladeanteil (%).
3. Modulare Architektur: index.html (DOM & Liquid Glass UI), app.js (PVGIS & Physik), telemetry.js (HA Live-Telemetrie, Wallbox-Tracker, Sankey, Analyse), wiring.js (DC-Verkabelung), dossier.js (DIN VDE 0100-712 Print/PDF).
4. Antworte immer auf Deutsch, präzise, technisch fundiert und übersichtlich formatiert (mit kurzen Absätzen oder Aufzählungen).
5. Liefere in "suggestedActions" passende, direkt ausführbare 1-Klick-Aktionen mit gültigem JSON-String in "payloadJson".
Erlaubte Werte für actionType in suggestedActions:
- "assign_main_sensor": payloadJson = {"field": "pvPower|loadPower|gridPower|batteryPower|batterySoc|pvEnergyTotal|gridImportMonth|gridExportMonth|loadEnergyMonth|batteryChargeMonth|batteryDischargeMonth", "entityId": "sensor.xyz"}
- "add_or_update_wallbox": payloadJson = {"name": "Wallbox", "type": "wallbox", "powerEntity": "sensor.wallbox_power", "energyEntity": "sensor.wallbox_energy", "group": ""}
- "assign_consumer_group": payloadJson = {"consumerName": "Name", "group": "Gruppenname"}
- "add_monitored_device": payloadJson = {"groupName": "Fronius Symo GEN24"}
- "open_modal_tab": payloadJson = {"tab": "config|consumers|climate|devices|guide"}
- "reset_wallbox_session": payloadJson = {}
- "scan_ha_sensors": payloadJson = {}`;

    const compactContext = {
      appVersion: APP_VERSION,
      roleFocus,
      thinkingLevel: thinkingLevelKey,
      liveTelemetry: safeContext.liveTelemetry || {},
      wallboxSummary: safeContext.wallboxSummary || {},
      haConfigSummary: safeContext.haConfigSummary || {},
      sensorDiagnostics: (safeContext.sensorDiagnostics || []).slice(0, 25),
      availableEntitiesSample: (safeContext.availableEntities || []).slice(0, 150)
    };

    // Check local backup keys (OpenRouter or Gemini) passed from device storage
    const rawOrKey = String(safeSecrets.openRouterApiKey || '').trim();
    const rawGemKey = String(safeSecrets.geminiApiKey || '').trim();
    const prefProvider = String(safeSecrets.aiProvider || 'auto').toLowerCase();
    const selectedModelId = String(safeSecrets.openRouterModel || safeSettings.openRouterModel || 'google/gemini-2.5-flash').trim() || 'google/gemini-2.5-flash';
    const isGoogleDirectModel = selectedModelId.startsWith('google-direct/');

    // Auto-detect if user pasted an OpenRouter key (sk-or-...) into either field
    const effectiveOpenRouterKey = rawOrKey || (rawGemKey.startsWith('sk-or-') ? rawGemKey : '');
    const effectiveGeminiKey = (!rawGemKey.startsWith('sk-or-') && rawGemKey) ? rawGemKey : String(process.env.GEMINI_API_KEY || '').trim();

    const shouldUseOpenRouter = Boolean(
      effectiveOpenRouterKey &&
      !isGoogleDirectModel &&
      (prefProvider === 'openrouter' || prefProvider === 'auto' || !effectiveGeminiKey)
    );

    if (shouldUseOpenRouter) {
      const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveOpenRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/magic8383/PVPro',
          'X-Title': `PV-Planung Pro v${APP_VERSION}`
        },
        body: JSON.stringify({
          model: selectedModelId,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${systemInstruction}\n\nAntworte AUSSCHLIESSLICH als valides JSON-Objekt im Format: {"answerMarkdown": "...", "suggestedActions": [{"id": "...", "actionType": "...", "title": "...", "description": "...", "payloadJson": "..."}]}`
            },
            {
              role: 'user',
              content: `Nutzer-Anfrage: ${userPrompt}\n\nAktueller App- & Telemetrie-Kontext (JSON):\n${JSON.stringify(compactContext)}`
            }
          ]
        })
      });

      if (!orRes.ok) {
        const errText = await orRes.text();
        throw new Error(`OpenRouter HTTP ${orRes.status}: ${errText.slice(0, 180)}`);
      }
      const orData = await orRes.json();
      const rawContent = String(orData?.choices?.[0]?.message?.content || '').trim();
      const cleanedJson = rawContent.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      let parsedOr = null;
      try {
        parsedOr = JSON.parse(cleanedJson);
      } catch (e) {
        parsedOr = { answerMarkdown: rawContent || 'Antwort von OpenRouter erhalten.', suggestedActions: [] };
      }

      const orUsage = orData?.usage || {};
      const promptTokens = Number(orUsage.prompt_tokens) || 0;
      const completionTokens = Number(orUsage.completion_tokens) || 0;
      const reasoningTokens = Number(orUsage.completion_tokens_details?.reasoning_tokens) || 0;
      const totalTokens = Number(orUsage.total_tokens) || (promptTokens + completionTokens);
      const nativeCostUsd = (typeof orUsage.cost === 'number' && isFinite(orUsage.cost)) ? orUsage.cost : null;

      return res.json({
        success: true,
        mode: 'openrouter',
        modelId: selectedModelId,
        engineLabel: `OpenRouter (${selectedModelId})`,
        thinkingLevel: thinkingLevelKey,
        roleFocus,
        contextStats,
        usage: {
          promptTokens,
          completionTokens,
          reasoningTokens,
          totalTokens,
          nativeCostUsd
        },
        answerMarkdown: parsedOr.answerMarkdown || rawContent || 'Diagnose abgeschlossen.',
        suggestedActions: Array.isArray(parsedOr.suggestedActions) ? parsedOr.suggestedActions : []
      });
    }

    if (!effectiveGeminiKey) {
      const fallback = buildLocalDiagnosticFallback(userPrompt, safeContext, { roleFocus, thinkingLevel: thinkingLevelKey });
      return res.json({
        success: true,
        mode: 'local-inspector',
        engineLabel: 'Lokale Diagnose-Engine (System-Inspektor)',
        thinkingLevel: thinkingLevelKey,
        roleFocus,
        contextStats,
        ...fallback
      });
    }

    const ai = new GoogleGenAI({
      apiKey: effectiveGeminiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const mappedThinkingLevel = thinkingLevelKey === 'LOW'
      ? ThinkingLevel.LOW
      : (thinkingLevelKey === 'XHIGH' ? ThinkingLevel.XHIGH : ThinkingLevel.HIGH);

    const allowedDirectGemini = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-argon', 'gemini-4-carbon'];
    const rawDirectName = isGoogleDirectModel ? selectedModelId.replace('google-direct/', '') : 'gemini-4-hydrogen';
    const targetGeminiModel = allowedDirectGemini.includes(rawDirectName) ? rawDirectName : 'gemini-4-hydrogen';

    const response = await ai.models.generateContent({
      model: targetGeminiModel,
      contents: `Nutzer-Anfrage: ${userPrompt}\n\nAktueller App- & Telemetrie-Kontext (JSON):\n${JSON.stringify(compactContext)}`,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: mappedThinkingLevel },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answerMarkdown: {
              type: Type.STRING,
              description: 'Antwort, Diagnose oder Anleitung in übersichtlichem Markdown auf Deutsch.'
            },
            suggestedActions: {
              type: Type.ARRAY,
              description: 'Direkt per Klick ausführbare Konfigurations- oder Debugging-Aktionen.',
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  actionType: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  payloadJson: { type: Type.STRING }
                },
                required: ['id', 'actionType', 'title', 'description', 'payloadJson']
              }
            }
          },
          required: ['answerMarkdown', 'suggestedActions']
        }
      }
    });

    let parsed = null;
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch (parseErr) {
      parsed = {
        answerMarkdown: response.text || 'Diagnose abgeschlossen.',
        suggestedActions: []
      };
    }

    const gemMeta = response?.usageMetadata || {};
    const promptTokens = Number(gemMeta.promptTokenCount) || 0;
    const candidatesTokens = Number(gemMeta.candidatesTokenCount) || 0;
    const thoughtsTokens = Number(gemMeta.thoughtsTokenCount) || 0;
    const completionTokens = candidatesTokens + thoughtsTokens;
    const totalTokens = Number(gemMeta.totalTokenCount) || (promptTokens + completionTokens);

    return res.json({
      success: true,
      mode: targetGeminiModel,
      modelId: `google-direct/${targetGeminiModel}`,
      engineLabel: `Google (${targetGeminiModel} · ${thinkingLevelKey})`,
      thinkingLevel: thinkingLevelKey,
      roleFocus,
      contextStats,
      usage: {
        promptTokens,
        completionTokens,
        reasoningTokens: thoughtsTokens,
        totalTokens,
        nativeCostUsd: 0
      },
      answerMarkdown: parsed.answerMarkdown || 'Diagnose abgeschlossen.',
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : []
    });
  } catch (err) {
    const safeSettings = req.body?.aiSettings || {};
    const fallback = buildLocalDiagnosticFallback(req.body?.prompt || '', req.body?.context || {}, safeSettings);
    return res.json({
      success: true,
      mode: 'local-inspector-fallback',
      engineLabel: 'Lokale Diagnose-Engine (Fallback)',
      thinkingLevel: String(safeSettings.thinkingLevel || 'HIGH').toUpperCase(),
      roleFocus: String(safeSettings.roleFocus || 'general'),
      ...fallback
    });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT} (v${APP_VERSION})`);
});



