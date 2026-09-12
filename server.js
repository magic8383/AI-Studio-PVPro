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
const DATABASE_JS_FILE = path.join(__dirname, 'database.js');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT} (v7.1.0)`);
});
