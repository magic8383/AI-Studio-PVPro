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
  
  const share = sharesMap.get(normalizedCode) || sharesMap.get(rawCode);
  if (!share) {
    return res.status(404).json({ success: false, error: 'Konfiguration nicht gefunden oder abgelaufen.' });
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

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT} (v7.1.0)`);
});
