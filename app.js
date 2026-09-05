// ==========================================
// GLOBALE STATE VARIABLEN
// ==========================================
let flatPanels = [], flatInverters = [], flatBatteries = [];
const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#84cc16'];
let LocationData = { lat: 48.06, lon: 8.46, name: "Villingen-Schwenningen" };
let YieldDataCache = null, ConsumptionCache = null, FlowCache = null, activeGroupIndex = null;
let strings = [], currentDetailMonth = null;
let chartYield = null, chartAutarkyCons = null, chartAutarkyGen = null, detailConsChart = null, detailGenChart = null;

const DEFAULT_THEME = { primary: '#3b82f6', accent: '#10b981', dark: false };

function readJsonStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const value = JSON.parse(raw);
        return value ?? fallback;
    } catch (error) {
        console.warn(`Ungültige LocalStorage-Daten für ${key}; Standardwert wird verwendet.`, error);
        return fallback;
    }
}

function isHexColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function getThemeSettings() {
    const stored = readJsonStorage('pvpro_theme', {});
    return {
        primary: isHexColor(stored.primary) ? stored.primary : DEFAULT_THEME.primary,
        accent: isHexColor(stored.accent) ? stored.accent : DEFAULT_THEME.accent,
        dark: stored.dark === true
    };
}

// ==========================================
// 1. INITIALISIERUNG
// ==========================================
function initDatabase() {
    try {
        // Theme laden
        loadThemeSettings();
        
        DB = { panels: [], batteries: [], inverters: [] };
        DB.panels = [...MasterDB.panels]; 
        DB.batteries = [...MasterDB.batteries]; 
        DB.inverters = [...MasterDB.inverters];
        
        try {
            const userDB = readJsonStorage('pvpro_user_db', { panels: [], batteries: [], inverters: [] });
            if (userDB && userDB.panels && userDB.panels.length > 0) DB.panels.push({ series: "Eigene Module", models: userDB.panels });
            if (userDB && userDB.inverters && userDB.inverters.length > 0) DB.inverters.push({ series: "Eigene WR", models: userDB.inverters });
            if (userDB && userDB.batteries && userDB.batteries.length > 0) DB.batteries.push({ series: "Eigene Batterien", models: userDB.batteries });
        } catch(e) {
            console.warn("User DB im LocalStorage ist korrupt, Zurücksetzen auf Standard.", e);
        }

        flatPanels = DB.panels.flatMap(s => s.models || []); 
        flatInverters = DB.inverters.flatMap(s => s.models || []); 
        flatBatteries = DB.batteries.flatMap(s => s.models || []);

        let batMap = readJsonStorage('pvpro_batmap', {});
        flatInverters.forEach(inv => { if(batMap[inv.id] !== undefined) inv.batteryId = parseInt(batMap[inv.id]); });

        if(localStorage.getItem('pvpro_strings')) {
            try {
                let loaded = readJsonStorage('pvpro_strings', []);
                if (Array.isArray(loaded)) {
                    strings = loaded.map(s => { 
                        if(!s.fields) s.fields = [{ id: Date.now()+Math.random(), name: 'Hauptdach', panelId: flatPanels[0]?.id||1, count: s.panels||1, tilt: 30, cols: Math.min(s.panels||1, 4)||4, rows: Math.ceil((s.panels||1)/(Math.min(s.panels||1, 4)||1)) }]; 
                        s.fields.forEach((f, fIdx) => {
                            if (!f.name) f.name = fIdx === 0 ? 'Hauptdach' : (fIdx === 1 ? 'Gaube' : `Feld ${fIdx + 1}`);
                            if (!f.cols) f.cols = Math.min(f.count || 4, 4) || 4;
                            if (!f.rows) f.rows = Math.ceil((f.count || 1) / (f.cols || 1));
                        });
                        return s; 
                    });
                } else {
                    strings = [];
                }
            } catch(e) { 
                strings = []; 
                console.warn("String-Daten im LocalStorage korrupt.", e);
            }
        }
        
        const storedLocation = readJsonStorage('pvpro_loc', null);
        if (storedLocation && Number.isFinite(Number(storedLocation.lat)) && Number.isFinite(Number(storedLocation.lon))) {
            LocationData = {
                lat: Number(storedLocation.lat),
                lon: Number(storedLocation.lon),
                name: typeof storedLocation.name === 'string' && storedLocation.name.trim() ? storedLocation.name : LocationData.name
            };
        }
        
        let locInp = document.getElementById('locSearchInput'); if(locInp) locInp.value = LocationData.name;
        let locTxt = document.getElementById('locNameText'); if(locTxt) locTxt.innerText = LocationData.name;
        
        const verEl = document.getElementById('app-header-version');
        if (verEl) verEl.innerText = 'Pro 7.5.1';

        if (!strings || strings.length === 0) {
            addString();
        }
        
        let faqTab = document.getElementById('tab-faq');
        if(faqTab && typeof HandbuchHTML !== 'undefined') faqTab.innerHTML = HandbuchHTML;

        loadConsumptionSettings(); 
        loadFinanceSettings();
        loadInvestSettings();
        loadWiringSettings();
        updatePhysicsOnly();
        checkUrlShareImport();
    } catch(e) { console.error("Init Error:", e); }
}

function clearLocalStorage() {
    if(confirm("Willst du wirklich alle gespeicherten Strings und Einstellungen löschen?")) {
        localStorage.clear();
        location.reload();
    }
}

function saveConfiguration() { 
    localStorage.setItem('pvpro_strings', JSON.stringify(strings)); 
    localStorage.setItem('pvpro_loc', JSON.stringify(LocationData)); 
    saveConsumptionSettings();
    saveWiringSettings();
    
    let btn = document.getElementById('btnHeaderSave');
    if(btn) {
        btn.classList.remove('bg-amber-500', 'animate-pulse');
        btn.classList.add('bg-primary');
    }
    showToastNotification('✅ Planung erfolgreich lokal im Browserspeicher gesichert!', 'success');
}

// ==========================================
// 1.1 CROSS-DEVICE TRANSFER & SHARING (V7.1.0)
// ==========================================

function showToastNotification(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-6 right-4 sm:right-6 z-[110] flex flex-col gap-2 pointer-events-none max-w-sm w-full';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const bgCol = type === 'success' ? 'bg-emerald-600 text-white' : (type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white border border-slate-700');
    toast.className = `${bgCol} px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold transition-all duration-300 transform translate-y-4 opacity-0 pointer-events-auto`;
    toast.innerHTML = `
        <span class="material-symbols-rounded text-lg">${type === 'success' ? 'check_circle' : (type === 'error' ? 'error' : 'info')}</span>
        <span class="flex-1">${message}</span>
        <button onclick="this.parentElement.remove()" class="text-white/70 hover:text-white"><span class="material-symbols-rounded text-sm">close</span></button>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
    });
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function exportFullConfiguration() {
    return {
        version: '7.4.0',
        exportedAt: new Date().toISOString(),
        appName: 'PV-Planung Pro',
        strings: strings || [],
        LocationData: LocationData || {},
        consumption: (typeof getConsumptionSettingsPayload === 'function' ? getConsumptionSettingsPayload() : JSON.parse(localStorage.getItem('pvpro_cons') || '{}')),
        invest: JSON.parse(localStorage.getItem('pvpro_invest') || '{}'),
        finance: JSON.parse(localStorage.getItem('pvpro_finance') || '{}'),
        wiring: (typeof wiringSettings !== 'undefined' ? wiringSettings : JSON.parse(localStorage.getItem('pvpro_wiring') || '{}')),
        userDB: (typeof userDB !== 'undefined' ? userDB : JSON.parse(localStorage.getItem('pvpro_user_db') || '{}')),
        batMap: (typeof batMap !== 'undefined' ? batMap : JSON.parse(localStorage.getItem('pvpro_batmap') || '{}'))
    };
}

function getShareableConfig(fullConfig) {
    const clean = JSON.parse(JSON.stringify(fullConfig));
    // If userDB contains document attachments (base64 PDFs/images), strip large binary payloads for URL/QR transfer
    if (clean.userDB && typeof clean.userDB === 'object') {
        ['panels', 'inverters', 'batteries'].forEach(cat => {
            if (Array.isArray(clean.userDB[cat])) {
                clean.userDB[cat].forEach(item => {
                    if (Array.isArray(item.documents)) {
                        item.documents = item.documents.map(d => ({
                            id: d.id,
                            name: d.name,
                            type: d.type,
                            size: d.size,
                            mimeType: d.mimeType
                        }));
                    }
                });
            }
        });
    }
    return clean;
}

function importFullConfiguration(config, sourceLabel = 'Geteilte Konfiguration') {
    if (!config || typeof config !== 'object') {
        showToastNotification('Ungültiges Konfigurations-Format.', 'error');
        return false;
    }
    
    try {
        if (Array.isArray(config.strings)) {
            strings = config.strings;
            localStorage.setItem('pvpro_strings', JSON.stringify(strings));
        }
        if (config.LocationData && typeof config.LocationData === 'object') {
            LocationData = Object.assign(LocationData, config.LocationData);
            localStorage.setItem('pvpro_loc', JSON.stringify(LocationData));
            const locInp = document.getElementById('locSearchInput'); if (locInp) locInp.value = LocationData.name || '';
            const locTxt = document.getElementById('locNameText'); if (locTxt) locTxt.innerText = LocationData.name || '';
        }
        if (config.consumption && typeof config.consumption === 'object') {
            localStorage.setItem('pvpro_cons', JSON.stringify(config.consumption));
            if (typeof loadConsumptionSettings === 'function') loadConsumptionSettings();
        }
        if (config.invest && typeof config.invest === 'object') {
            localStorage.setItem('pvpro_invest', JSON.stringify(config.invest));
            if (typeof loadInvestSettings === 'function') loadInvestSettings();
        }
        if (config.finance && typeof config.finance === 'object') {
            localStorage.setItem('pvpro_finance', JSON.stringify(config.finance));
            if (typeof loadFinanceSettings === 'function') loadFinanceSettings();
        }
        if (config.wiring && typeof config.wiring === 'object') {
            if (typeof wiringSettings !== 'undefined') {
                Object.assign(wiringSettings, config.wiring);
            }
            localStorage.setItem('pvpro_wiring', JSON.stringify(config.wiring));
        }
        if (config.userDB && typeof config.userDB === 'object') {
            if (typeof userDB !== 'undefined') Object.assign(userDB, config.userDB);
            localStorage.setItem('pvpro_user_db', JSON.stringify(config.userDB));
        }
        if (config.batMap && typeof config.batMap === 'object') {
            if (typeof batMap !== 'undefined') Object.assign(batMap, config.batMap);
            localStorage.setItem('pvpro_batmap', JSON.stringify(config.batMap));
        }

        // Re-run physics and render
        updatePhysicsOnly();
        if (typeof renderWiringTab === 'function') renderWiringTab();
        
        showToastNotification(`✅ Konfiguration (${sourceLabel}) erfolgreich übernommen!`, 'success');
        return true;
    } catch (err) {
        console.error("Import Error:", err);
        showToastNotification('Fehler beim Laden: ' + err.message, 'error');
        return false;
    }
}

async function checkUrlShareImport() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        let shareCode = urlParams.get('share');
        if (!shareCode && window.location.hash) {
            const hashMatch = window.location.hash.match(/share=([A-Za-z0-9_-]+)/);
            if (hashMatch) shareCode = hashMatch[1];
        }
        
        // Offline link fallback: #config=<base64>
        if (!shareCode && window.location.hash && window.location.hash.startsWith('#config=')) {
            try {
                const rawBase64 = window.location.hash.slice(8);
                const decodedJson = decodeURIComponent(escape(atob(rawBase64)));
                const cfg = JSON.parse(decodedJson);
                importFullConfiguration(cfg, 'Offline-Link');
                history.replaceState(null, '', window.location.pathname + window.location.search);
                return;
            } catch (e) {
                console.warn("Could not parse #config hash:", e);
            }
        }

        if (shareCode) {
            showToastNotification('Lade geteilte Konfiguration vom Server...', 'info');
            const res = await fetch(`/api/share/${encodeURIComponent(shareCode)}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.config) {
                    importFullConfiguration(data.config, `Code ${data.code || shareCode}`);
                    // Clean URL query parameter cleanly without page reload
                    const cleanUrl = window.location.pathname + window.location.hash;
                    history.replaceState(null, '', cleanUrl);
                }
            } else {
                showToastNotification('Geteilte Konfiguration konnte nicht gefunden werden (abgelaufen oder falscher Code).', 'error');
            }
        }
    } catch (err) {
        console.error("Share Fetch Error:", err);
    }
}

function ensureShareModalDom() {
    if (document.getElementById('modal-share-device')) return;

    const modalHtml = `
    <div id="modal-share-device" class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md hidden no-print">
        <div class="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[96vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <!-- Header -->
            <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
                        <span class="material-symbols-rounded text-2xl">devices</span>
                    </div>
                    <div>
                        <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight flex items-center gap-2">
                            Auf Smartphone übertragen & Teilen
                        </h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400">Desktop-Planung sofort am Handy öffnen oder Datei sichern</p>
                    </div>
                </div>
                <button onclick="closeShareModal()" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors">
                    <span class="material-symbols-rounded text-xl">close</span>
                </button>
            </div>
            
            <!-- Body (scrollable) -->
            <div id="share-modal-body" class="p-5 sm:p-6 overflow-y-auto space-y-6">
                <!-- Dynamic Content -->
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function openShareModal() {
    ensureShareModalDom();
    const modal = document.getElementById('modal-share-device');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    const body = document.getElementById('share-modal-body');
    body.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-center">
            <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p class="text-sm font-bold text-slate-700 dark:text-slate-200">Übertragungs-Code & Vektor-QR-Code werden generiert...</p>
            <p class="text-xs text-slate-400 mt-1">Sichere Bereitstellung für dein Smartphone</p>
        </div>
    `;

    const rawConfig = exportFullConfiguration();
    const config = getShareableConfig(rawConfig);
    const locName = LocationData?.name || 'PV-Planung';
    const clientOrigin = window.location.origin;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, name: locName, origin: clientOrigin }),
        signal: controller.signal
    })
    .then(r => {
        clearTimeout(timeoutId);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    })
    .then(data => {
        if (data && data.success) {
            renderShareModalContent(data);
        } else {
            renderShareModalOfflineFallback(config);
        }
    })
    .catch(err => {
        clearTimeout(timeoutId);
        console.warn("Share API unreachable, falling back to autonomous client-side transfer:", err);
        renderShareModalOfflineFallback(config);
    });
}

function closeShareModal() {
    const modal = document.getElementById('modal-share-device');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

function renderShareModalContent(data) {
    const body = document.getElementById('share-modal-body');
    if (!body) return;

    body.innerHTML = `
    <div class="space-y-6">
        <!-- QR Code Hero Card -->
        <div class="bg-gradient-to-b from-indigo-500/10 to-transparent dark:from-indigo-950/30 rounded-2xl p-5 border border-indigo-200 dark:border-indigo-800/60 flex flex-col sm:flex-row items-center gap-6">
            <div class="bg-white p-3 rounded-2xl shadow-md border border-slate-200 shrink-0 w-48 h-48 sm:w-52 sm:h-52 flex items-center justify-center overflow-hidden">
                <div class="w-full h-full [&>svg]:w-full [&>svg]:h-full">${data.qrSvg}</div>
            </div>
            <div class="flex-1 text-center sm:text-left space-y-3">
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                    <span class="material-symbols-rounded text-sm">qr_code_scanner</span>
                    Smartphone-Kamera vorhalten
                </div>
                <h4 class="text-lg font-black text-slate-900 dark:text-white leading-snug">
                    Sofort am Handy weitermachen
                </h4>
                <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Öffne einfach die Standard-Kamera deines Smartphones (iPhone / Android) und scanne diesen QR-Code. Sämtliche Strings, Dächer, Ertragsberechnungen und Kabelwege werden sofort geladen!
                </p>
                
                <!-- Code Badge -->
                <div class="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <div class="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3.5 py-1.5 rounded-xl font-mono text-base font-black text-indigo-600 dark:text-indigo-400 tracking-wider">
                        ${data.code}
                    </div>
                    <button onclick="copyShareCode('${data.code}')" class="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1">
                        <span class="material-symbols-rounded text-sm">content_copy</span> Code kopieren
                    </button>
                </div>
            </div>
        </div>

        <!-- Direct URL Box -->
        <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
            <label class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span class="material-symbols-rounded text-base text-primary">link</span>
                Direkt-Link zur Planung:
            </label>
            <div class="flex items-center gap-2">
                <input type="text" readonly value="${data.url}" id="share-direct-url-input" class="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs rounded-xl px-3 py-2 font-mono text-slate-700 dark:text-slate-300 select-all truncate" />
                <button onclick="copyShareLink('${data.url}')" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1">
                    <span class="material-symbols-rounded text-sm">content_copy</span>
                    Kopieren
                </button>
                ${navigator.share ? `
                <button onclick="shareViaWebShare('${data.url}', '${data.code}')" class="bg-primary hover:bg-primary-hover text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1">
                    <span class="material-symbols-rounded text-sm">share</span>
                    Teilen
                </button>` : ''}
            </div>
        </div>

        <!-- Two columns: Code Import on this device & File Backup -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Load by Code on this Device -->
            <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                <div>
                    <h5 class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                        <span class="material-symbols-rounded text-base text-emerald-500">download</span>
                        Anderen Transfer-Code laden
                    </h5>
                    <p class="text-[11px] text-slate-500 dark:text-slate-400">
                        Hast du einen Code von einem anderen PC oder Kollegen?
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <input type="text" id="input-manual-share-code" placeholder="z.B. PV-7492" class="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs uppercase font-mono rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200" />
                    <button onclick="loadConfigurationByCode(document.getElementById('input-manual-share-code').value)" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0">
                        Laden
                    </button>
                </div>
            </div>

            <!-- Local JSON File Backup & Restore -->
            <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                <div>
                    <h5 class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                        <span class="material-symbols-rounded text-base text-amber-500">folder_zip</span>
                        Offline-Datei (.json)
                    </h5>
                    <p class="text-[11px] text-slate-500 dark:text-slate-400">
                        Planung als Datei auf dem PC sichern oder Datei einspielen.
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="downloadConfigurationFile()" class="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition-colors flex items-center justify-center gap-1">
                        <span class="material-symbols-rounded text-sm">download</span> JSON-Export
                    </button>
                    <button onclick="triggerConfigurationFileInput()" class="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition-colors flex items-center justify-center gap-1">
                        <span class="material-symbols-rounded text-sm">upload_file</span> Import
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}

function getMinimalFallbackQrSvg(code) {
    return `<svg viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
        <rect width="200" height="200" fill="#ffffff" rx="16"/>
        <rect x="20" y="20" width="50" height="50" fill="#0f172a" rx="8"/>
        <rect x="30" y="30" width="30" height="30" fill="#ffffff" rx="4"/>
        <rect x="38" y="38" width="14" height="14" fill="#0f172a"/>
        <rect x="130" y="20" width="50" height="50" fill="#0f172a" rx="8"/>
        <rect x="140" y="30" width="30" height="30" fill="#ffffff" rx="4"/>
        <rect x="148" y="38" width="14" height="14" fill="#0f172a"/>
        <rect x="20" y="130" width="50" height="50" fill="#0f172a" rx="8"/>
        <rect x="30" y="140" width="30" height="30" fill="#ffffff" rx="4"/>
        <rect x="38" y="148" width="14" height="14" fill="#0f172a"/>
        <rect x="90" y="30" width="18" height="18" fill="#0f172a"/>
        <rect x="130" y="90" width="18" height="18" fill="#0f172a"/>
        <rect x="90" y="140" width="24" height="24" fill="#0f172a"/>
        <rect x="130" y="130" width="40" height="40" fill="#0f172a" rx="6"/>
        <rect x="140" y="140" width="20" height="20" fill="#ffffff"/>
        <rect x="85" y="85" width="30" height="30" fill="#3b82f6" rx="6"/>
        <text x="100" y="105" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="900" text-anchor="middle">PV</text>
    </svg>`;
}

function renderShareModalOfflineFallback(config) {
    const body = document.getElementById('share-modal-body');
    if (!body) return;

    let hashUrl = '';
    let shortCode = 'PV-OFFL';
    try {
        const jsonStr = JSON.stringify(config);
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
        hashUrl = `${window.location.origin}${window.location.pathname}#config=${b64}`;
        let hashVal = 0;
        for (let i = 0; i < jsonStr.length; i++) {
            hashVal = ((hashVal << 5) - hashVal) + jsonStr.charCodeAt(i);
            hashVal |= 0;
        }
        shortCode = 'PV-' + Math.abs(hashVal).toString(36).toUpperCase().padStart(4, '0').slice(-4);
    } catch(e) {
        hashUrl = window.location.href;
    }

    const renderWithSvg = (svgHtml) => {
        body.innerHTML = `
        <div class="space-y-6">
            <!-- Offline Notice Badge -->
            <div class="bg-amber-500/10 dark:bg-amber-950/40 px-4 py-2.5 rounded-2xl border border-amber-300/40 dark:border-amber-800/60 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
                <div class="flex items-center gap-2 font-bold">
                    <span class="material-symbols-rounded text-base text-amber-500">wifi_off</span>
                    <span>Autarker Offline-Direkttransfer</span>
                </div>
                <span class="text-[11px] font-medium opacity-80">100% autark ohne Server</span>
            </div>

            <!-- QR Code Hero Card -->
            <div class="bg-gradient-to-b from-amber-500/10 to-transparent dark:from-amber-950/30 rounded-2xl p-5 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row items-center gap-6">
                <div class="bg-white p-3 rounded-2xl shadow-md border border-slate-200 shrink-0 w-48 h-48 sm:w-52 sm:h-52 flex items-center justify-center overflow-hidden">
                    <div class="w-full h-full [&>svg]:w-full [&>svg]:h-full">${svgHtml}</div>
                </div>
                <div class="flex-1 text-center sm:text-left space-y-3">
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-xs font-bold">
                        <span class="material-symbols-rounded text-sm">qr_code_scanner</span>
                        Smartphone-Kamera vorhalten
                    </div>
                    <h4 class="text-lg font-black text-slate-900 dark:text-white leading-snug">
                        Sofort am Handy weitermachen
                    </h4>
                    <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        Scanne den QR-Code mit der Standard-Kamera deines Handys. Deine Planung wird autark und ohne Netzwerkverzögerung direkt auf dem Smartphone geladen!
                    </p>
                    
                    <!-- Code Badge -->
                    <div class="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <div class="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3.5 py-1.5 rounded-xl font-mono text-base font-black text-amber-600 dark:text-amber-400 tracking-wider">
                            ${shortCode}
                        </div>
                        <button onclick="copyShareCode('${shortCode}')" class="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1">
                            <span class="material-symbols-rounded text-sm">content_copy</span> Code kopieren
                        </button>
                    </div>
                </div>
            </div>

            <!-- Direct URL Box -->
            <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <label class="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span class="material-symbols-rounded text-base text-primary">link</span>
                    Direkt-Link zur Planung (Offline-URL):
                </label>
                <div class="flex items-center gap-2">
                    <input type="text" readonly value="${hashUrl}" id="share-direct-url-input" class="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs rounded-xl px-3 py-2 font-mono text-slate-700 dark:text-slate-300 select-all truncate" />
                    <button onclick="copyShareLink('${hashUrl}')" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1">
                        <span class="material-symbols-rounded text-sm">content_copy</span>
                        Kopieren
                    </button>
                    ${navigator.share ? `
                    <button onclick="shareViaWebShare('${hashUrl}', '${shortCode}')" class="bg-primary hover:bg-primary-hover text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1">
                        <span class="material-symbols-rounded text-sm">share</span>
                        Teilen
                    </button>` : ''}
                </div>
            </div>

            <!-- Two columns: Code Import on this device & File Backup -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Load by Code on this Device -->
                <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                    <div>
                        <h5 class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                            <span class="material-symbols-rounded text-base text-emerald-500">download</span>
                            Anderen Transfer-Code laden
                        </h5>
                        <p class="text-[11px] text-slate-500 dark:text-slate-400">
                            Hast du einen Code von einem anderen PC oder Kollegen?
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="text" id="input-manual-share-code" placeholder="z.B. PV-7492" class="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs uppercase font-mono rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200" />
                        <button onclick="loadConfigurationByCode(document.getElementById('input-manual-share-code').value)" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0">
                            Laden
                        </button>
                    </div>
                </div>

                <!-- Local JSON File Backup & Restore -->
                <div class="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                    <div>
                        <h5 class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                            <span class="material-symbols-rounded text-base text-amber-500">folder_zip</span>
                            Offline-Datei (.json)
                        </h5>
                        <p class="text-[11px] text-slate-500 dark:text-slate-400">
                            Planung als Datei auf dem PC sichern oder Datei einspielen.
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="downloadConfigurationFile()" class="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition-colors flex items-center justify-center gap-1">
                            <span class="material-symbols-rounded text-sm">download</span> JSON-Export
                        </button>
                        <button onclick="triggerConfigurationFileInput()" class="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition-colors flex items-center justify-center gap-1">
                            <span class="material-symbols-rounded text-sm">upload_file</span> Import
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    };

    if (typeof QRCodeBrowser !== 'undefined' && typeof QRCodeBrowser.toString === 'function') {
        QRCodeBrowser.toString(hashUrl, { type: 'svg', margin: 1, width: 280, color: { dark: '#0f172a', light: '#ffffff' } }, (err, svg) => {
            if (!err && svg) {
                renderWithSvg(svg);
            } else {
                renderWithSvg(getMinimalFallbackQrSvg(shortCode));
            }
        });
    } else {
        renderWithSvg(getMinimalFallbackQrSvg(shortCode));
    }
}

function copyShareLink(url) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showToastNotification('📋 Link in die Zwischenablage kopiert!', 'success');
        });
    } else {
        const inp = document.getElementById('share-direct-url-input');
        if (inp) {
            inp.select();
            document.execCommand('copy');
            showToastNotification('📋 Link in die Zwischenablage kopiert!', 'success');
        }
    }
}

function copyShareCode(code) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
            showToastNotification(`📋 Code ${code} kopiert!`, 'success');
        });
    }
}

function shareViaWebShare(url, code) {
    if (navigator.share) {
        navigator.share({
            title: 'PV-Planung Pro – Anlagenkonfiguration',
            text: `Hier ist die PV-Planung (${code}) für die Auslegung:`,
            url: url
        }).catch(() => {});
    }
}

function downloadConfigurationFile() {
    const config = exportFullConfiguration();
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `PV-Planung_${(LocationData?.name || 'Anlage').replace(/[^a-zA-Z0-9_-]/g, '_')}_${dateStr}.json`;
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToastNotification('📄 Konfigurations-Datei wurde heruntergeladen!', 'success');
}

function triggerConfigurationFileInput() {
    let inp = document.getElementById('file-config-upload');
    if (!inp) {
        inp = document.createElement('input');
        inp.id = 'file-config-upload';
        inp.type = 'file';
        inp.accept = '.json,application/json';
        inp.style.display = 'none';
        inp.onchange = (e) => handleConfigurationFileUpload(e);
        document.body.appendChild(inp);
    }
    inp.value = '';
    inp.click();
}

function handleConfigurationFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const cfg = JSON.parse(event.target.result);
            if (cfg && typeof cfg === 'object') {
                importFullConfiguration(cfg, file.name);
                closeShareModal();
            } else {
                alert('Ungültiges Format der JSON-Datei.');
            }
        } catch (err) {
            alert('Fehler beim Lesen der JSON-Datei: ' + err.message);
        }
    };
    reader.readAsText(file);
}

async function loadConfigurationByCode(code) {
    if (!code || !code.trim()) {
        showToastNotification('Bitte gib einen gültigen Transfer-Code ein.', 'error');
        return;
    }
    const cleanCode = code.trim().toUpperCase();
    try {
        showToastNotification(`Suche Code ${cleanCode}...`, 'info');
        const res = await fetch(`/api/share/${encodeURIComponent(cleanCode)}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.config) {
                importFullConfiguration(data.config, `Code ${cleanCode}`);
                closeShareModal();
            }
        } else {
            showToastNotification(`Code ${cleanCode} nicht gefunden oder abgelaufen.`, 'error');
        }
    } catch (err) {
        showToastNotification('Verbindungsfehler beim Laden des Codes.', 'error');
    }
}

// ==========================================
// 2. UI TAB ROUTING & SWIPE GESTURES
// ==========================================
const tabOrder = ['system', 'verkabelung', 'verbrauch', 'invest', 'finance', 'uebersicht', 'auswertung', 'database', 'faq'];
let touchStartX = 0, touchStartY = 0;

document.addEventListener('touchstart', e => { 
    touchStartX = e.touches[0].clientX; 
    touchStartY = e.touches[0].clientY; 
}, {passive:true});

document.addEventListener('touchend', e => {
    let t = e.target.nodeType === 3 ? e.target.parentNode : e.target;
    if (t.closest('input') || t.closest('select') || t.closest('button') || t.closest('canvas') || t.closest('.overflow-x-auto') || t.closest('a')) return;
    
    let touchEndX = e.changedTouches[0].clientX;
    let touchEndY = e.changedTouches[0].clientY;
    let diffX = touchEndX - touchStartX;
    let diffY = touchEndY - touchStartY;
    
    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.8) {
        let current = document.querySelector('.tab-content.active');
        if(!current) return;
        let cIdx = tabOrder.indexOf(current.id.replace('tab-', ''));
        if(cIdx !== -1) {
            if(diffX < 0 && cIdx < tabOrder.length-1) switchTab(tabOrder[cIdx+1]); 
            else if(diffX > 0 && cIdx > 0) switchTab(tabOrder[cIdx-1]);
        }
    }
}, {passive:true});

function switchTab(tabId) {
    const current = document.querySelector('.tab-content.active');
    if(current) current.classList.remove('active');
    
    const target = document.getElementById('tab-' + tabId);
    if(target) target.classList.add('active');
    
    // Desktop Segmented Bar Buttons aktualisieren
    tabOrder.forEach(id => {
        let btn = document.getElementById('btn-' + id);
        if(btn) {
            if(id === tabId) {
                btn.className = "m3-segment-btn active snap-start shrink-0 px-3.5 py-1.5 text-xs md:text-sm font-bold rounded-xl bg-primary text-white shadow-sm flex items-center gap-1.5 transition-all";
                let icon = btn.querySelector('.material-symbols-rounded');
                if(icon) icon.classList.add('fill-1');
            } else {
                btn.className = "m3-segment-btn snap-start shrink-0 px-3.5 py-1.5 text-xs md:text-sm font-medium rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 flex items-center gap-1.5 transition-all";
                if(id === 'auswertung') btn.classList.add('text-accent');
                let icon = btn.querySelector('.material-symbols-rounded');
                if(icon) icon.classList.remove('fill-1');
            }
        }
    });

    // Mobile Bottom Navigation Bar Buttons aktualisieren
    const bottomNavIds = ['system', 'verbrauch', 'finance', 'auswertung'];
    bottomNavIds.forEach(id => {
        let bBtn = document.getElementById('bnav-' + id);
        if(bBtn) {
            let pill = bBtn.querySelector('.m3-bnav-pill');
            let icon = bBtn.querySelector('.material-symbols-rounded');
            let label = bBtn.querySelector('.m3-bnav-label');
            if(id === tabId) {
                if(pill) pill.className = "m3-bnav-pill px-4 py-1 rounded-full bg-primary/20 text-primary dark:bg-primary/30 dark:text-primary transition-all flex items-center justify-center";
                if(icon) { icon.classList.add('fill-1'); icon.className = "material-symbols-rounded text-xl text-primary font-bold fill-1"; }
                if(label) label.className = "m3-bnav-label text-[10px] font-bold text-primary mt-0.5 tracking-tight";
            } else {
                if(pill) pill.className = "m3-bnav-pill px-4 py-1 rounded-full bg-transparent text-slate-400 transition-all flex items-center justify-center";
                if(icon) { icon.classList.remove('fill-1'); icon.className = "material-symbols-rounded text-xl text-slate-400"; }
                if(label) label.className = "m3-bnav-label text-[10px] font-medium text-slate-400 mt-0.5 tracking-tight";
            }
        }
    });

    // Falls ein Tab aus dem "Mehr"-Sheet aktiv ist, den "Mehr"-Button hervorheben
    let moreBtn = document.getElementById('bnav-more');
    if(moreBtn) {
        let isMoreChild = ['verkabelung', 'invest', 'uebersicht', 'database', 'faq'].includes(tabId);
        let pill = moreBtn.querySelector('.m3-bnav-pill');
        let icon = moreBtn.querySelector('.material-symbols-rounded');
        let label = moreBtn.querySelector('.m3-bnav-label');
        if(isMoreChild) {
            if(pill) pill.className = "m3-bnav-pill px-4 py-1 rounded-full bg-primary/20 text-primary dark:bg-primary/30 dark:text-primary transition-all flex items-center justify-center";
            if(icon) { icon.classList.add('fill-1'); icon.className = "material-symbols-rounded text-xl text-primary font-bold fill-1"; }
            if(label) label.className = "m3-bnav-label text-[10px] font-bold text-primary mt-0.5 tracking-tight";
        } else {
            if(pill) pill.className = "m3-bnav-pill px-4 py-1 rounded-full bg-transparent text-slate-400 transition-all flex items-center justify-center";
            if(icon) { icon.classList.remove('fill-1'); icon.className = "material-symbols-rounded text-xl text-slate-400"; }
            if(label) label.className = "m3-bnav-label text-[10px] font-medium text-slate-400 mt-0.5 tracking-tight";
        }
    }
    
    // Nach Auswahl Bottom Sheet schließen (falls mobil offen)
    closeMoreSheet();

    let btn = document.getElementById('btn-'+tabId);
    let scroller = document.getElementById('navScroller');
    if(btn && scroller) {
        try { scroller.scrollTo({left: btn.offsetLeft - window.innerWidth/2 + 50, behavior:'smooth'}); } 
        catch(e) { scroller.scrollLeft = btn.offsetLeft - window.innerWidth/2 + 50; }
    }
    if(tabId === 'auswertung' && currentDetailMonth !== null) updateDetailCharts(currentDetailMonth);
    if(tabId === 'verkabelung') renderWiringTab();
}

function openMoreSheet() {
    const sheet = document.getElementById('m3MoreSheet');
    const backdrop = document.getElementById('m3SheetBackdrop');
    if(sheet && backdrop) {
        backdrop.classList.remove('hidden');
        sheet.classList.remove('translate-y-full');
    }
}

function closeMoreSheet() {
    const sheet = document.getElementById('m3MoreSheet');
    const backdrop = document.getElementById('m3SheetBackdrop');
    if(sheet && backdrop) {
        sheet.classList.add('translate-y-full');
        setTimeout(() => backdrop.classList.add('hidden'), 250);
    }
}

function toggleAcc(id) { 
    const el = document.getElementById(id); 
    if(el.classList.contains('open')) el.classList.remove('open'); 
    else { document.querySelectorAll('.acc-content').forEach(e=>e.classList.remove('open')); el.classList.add('open'); }
}

// ==========================================
// 3. STRINGS, PHYSIK & UI
// ==========================================
function getCompassDirection(deg) {
    let d = Math.round(((Number(deg) % 360) + 360) % 360);
    const sectors = [
        { name: 'Nord (0°)', short: 'N', min: 348.75, max: 11.25, dev: 180, devLabel: '180° Nord (Vollverschattet/Norddach)' },
        { name: 'Nord-Nordost (22°)', short: 'NNO', min: 11.25, max: 33.75, dev: 158, devLabel: '158° Nord-Ost' },
        { name: 'Nordost (45°)', short: 'NO', min: 33.75, max: 56.25, dev: 135, devLabel: '135° Nord-Ost' },
        { name: 'Ost-Nordost (68°)', short: 'ONO', min: 56.25, max: 78.75, dev: 112, devLabel: '112° Ost-Nord' },
        { name: 'Ost (90°)', short: 'O', min: 78.75, max: 101.25, dev: 90, devLabel: '90° Ost (Vormittagssonne)' },
        { name: 'Ost-Südost (112°)', short: 'OSO', min: 101.25, max: 123.75, dev: 68, devLabel: '68° Ost' },
        { name: 'Südost (135°)', short: 'SO', min: 123.75, max: 146.25, dev: 45, devLabel: '45° Ost' },
        { name: 'Süd-Südost (158°)', short: 'SSO', min: 146.25, max: 168.75, dev: 22, devLabel: '22° Ost' },
        { name: 'Süd (180°)', short: 'S', min: 168.75, max: 191.25, dev: 0, devLabel: 'Optimal Süd (0° Abweichung)' },
        { name: 'Süd-Südwest (202°)', short: 'SSW', min: 191.25, max: 213.75, dev: 22, devLabel: '22° West' },
        { name: 'Südwest (225°)', short: 'SW', min: 213.75, max: 236.25, dev: 45, devLabel: '45° West' },
        { name: 'West-Südwest (248°)', short: 'WSW', min: 236.25, max: 258.75, dev: 68, devLabel: '68° West' },
        { name: 'West (270°)', short: 'W', min: 258.75, max: 281.25, dev: 90, devLabel: '90° West (Nachmittagssonne)' },
        { name: 'West-Nordwest (292°)', short: 'WNW', min: 281.25, max: 303.75, dev: 112, devLabel: '112° West-Nord' },
        { name: 'Nordwest (315°)', short: 'NW', min: 303.75, max: 326.25, dev: 135, devLabel: '135° Nord-West' },
        { name: 'Nord-Nordwest (338°)', short: 'NNW', min: 326.25, max: 348.75, dev: 158, devLabel: '158° Nord-West' }
    ];
    for (const s of sectors) {
        if (s.min > s.max) {
            if (d >= s.min || d < s.max) return { ...s, angle: d };
        } else {
            if (d >= s.min && d < s.max) return { ...s, angle: d };
        }
    }
    return { name: 'Süd (180°)', short: 'S', angle: d, dev: 0, devLabel: 'Optimal Süd' };
}

function updateAzimuthLive(strId, val) {
    const num = Math.min(360, Math.max(0, parseFloat(val) || 0));
    const lbl = document.getElementById(`azimuth-label-${strId}`);
    if (lbl) {
        const info = getCompassDirection(num);
        lbl.innerHTML = `<span>${info.name}</span> <span class="text-primary font-bold">${info.devLabel}</span>`;
    }
    const slider = document.getElementById(`azimuth-slider-${strId}`);
    if (slider && Number(slider.value) !== num) slider.value = num;
    const numInput = document.getElementById(`azimuth-num-${strId}`);
    if (numInput && Number(numInput.value) !== num) numInput.value = num;
}

function addString() { 
    strings.push({ 
        id: Date.now(), 
        name: "Neuer String", 
        group: "", 
        shading: 0, 
        azimuth: 180, 
        inverterId: flatInverters[0]?.id || 1, 
        mpptId: 1, 
        color: colors[strings.length % colors.length], 
        fields: [{ 
            id: Date.now()+1, 
            name: "Hauptdach", 
            panelId: flatPanels[0]?.id || 1, 
            count: 6, 
            tilt: 30, 
            cols: 3, 
            rows: 2 
        }] 
    }); 
    updatePhysicsOnly(); 
}
function removeString(id) { strings = strings.filter(s => s.id !== id); updatePhysicsOnly(); }
function addField(id) { 
    const str = strings.find(s => s.id === id);
    if (str) {
        const nextIdx = (str.fields || []).length + 1;
        str.fields.push({ 
            id: Date.now() + Math.floor(Math.random() * 1000), 
            name: nextIdx === 2 ? "Gaube" : `Feld ${nextIdx}`, 
            panelId: str.fields[0]?.panelId || flatPanels[0]?.id || 1, 
            count: 4, 
            tilt: 30, 
            cols: 4, 
            rows: 1 
        }); 
        updatePhysicsOnly(); 
    }
}
function removeField(sId, fId) { const str = strings.find(s => s.id === sId); if(str) str.fields = str.fields.filter(f => f.id !== fId); updatePhysicsOnly(); }

function toggleEditMode(strId) {
    const el = document.getElementById('edit-' + strId);
    if(el) el.classList.toggle('hidden');
}

function updateStringData(id, key, val) { 
    const str = strings.find(s => s.id === id); 
    if(str) { 
        if (['name', 'group', 'color'].includes(key)) str[key] = val; else str[key] = Number(val);
        if(key === 'inverterId') str.mpptId = 1; 
        updatePhysicsOnly(); 
        const editEl = document.getElementById('edit-' + id);
        if (editEl) editEl.classList.remove('hidden');
        if (document.getElementById('tab-verkabelung') && !document.getElementById('tab-verkabelung').classList.contains('hidden')) {
            renderWiringTab();
        }
    } 
}

function updateFieldData(sId, fId, key, val) { 
    const str = strings.find(s => s.id === sId); 
    if(str) { 
        const f = str.fields.find(f => f.id === fId); if(f) f[key] = Number(val); 
        updatePhysicsOnly(); 
        document.getElementById('edit-' + sId).classList.remove('hidden');
    } 
}

function updatePhysicsOnly() {
    strings.forEach(str => {
        let vocStc = 0, vmpStc = 0, isc = 0, tk = -0.25;
        if(str.fields && str.fields.length > 0) { const p = flatPanels.find(p => p.id === parseInt(str.fields[0].panelId)); if(p) tk = p.tempVoc; }
        
        (str.fields || []).forEach(f => {
            const p = flatPanels.find(x => x.id === parseInt(f.panelId));
            if(p) { vocStc += (p.voc * f.count); vmpStc += (p.vmp * f.count); isc = Math.max(isc, p.isc); }
        });

        const inv = flatInverters.find(i => i.id === parseInt(str.inverterId));
        let existingMismatch = (str._phys && str._phys.mismatchPct) ? str._phys.mismatchPct : 0;
        
        str._phys = { 
            vocCold: vocStc * (1 + (-45) * (tk / 100)), 
            vmpHot: vmpStc * (1 + (45) * (tk / 100)), 
            isc: isc, 
            limitMaxV: inv?.maxV || 1000, 
            limitMaxI: inv?.mppts?.find(m => m.id == str.mpptId)?.maxIsc || 20, 
            minMppV: inv?.minMppV || 0, 
            maxMppV: inv?.maxMppV || 0, 
            invStartV: inv?.startV || 0,
            mismatchPct: existingMismatch
        };
        str._phys.isVocSafe = str._phys.vocCold <= str._phys.limitMaxV; 
        str._phys.isIscSafe = isc <= str._phys.limitMaxI;
    });
    let btn = document.getElementById('btnHeaderSave');
    if(btn) { btn.classList.remove('bg-blue-600'); btn.classList.add('animate-pulse', 'bg-amber-500'); }
    renderStringsUI(); 
    renderDatabaseUI();
    if(document.getElementById('tab-verkabelung')?.classList.contains('active')) {
        renderWiringTab();
    }
}

function renderStringsUI() {
    const container = document.getElementById('stringsList');
    let emptyMsg = document.getElementById('emptyStringMessage');
    
    if(strings.length === 0) {
        container.innerHTML = '';
        if(emptyMsg) emptyMsg.classList.remove('hidden');
        return;
    }
    if(emptyMsg) emptyMsg.classList.add('hidden');

    let panelOptions = DB.panels.map(s => `<optgroup label="${s.series}">${(s.models||[]).map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</optgroup>`).join('');
    let invOptions = DB.inverters.map(s => `<optgroup label="${s.series}">${(s.models||[]).map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</optgroup>`).join('');

    container.innerHTML = strings.map(str => {
        const p = str._phys || { isVocSafe: true, isIscSafe: true, vocCold: 0, vmpHot: 0, isc: 0, limitMaxV: 1000, limitMaxI: 20, minMppV: 0, maxMppV: 0, invStartV: 0, mismatchPct: 0 };
        const inv = flatInverters.find(i => i.id === parseInt(str.inverterId)) || {name: 'Kein WR', mppts: []};
        let wOpt = invOptions.replace(`value="${str.inverterId}"`, `value="${str.inverterId}" selected`);
        let mOpt = (inv.mppts || []).map(m => `<option value="${m.id}" ${str.mpptId == m.id ? 'selected':''}>${m.name}</option>`).join('');
        
        const safe = p.isVocSafe && p.isIscSafe;

        // M3 Vector Status Badges
        let vmpBadgeIcon = 'check_circle', vmpBadgeColor = 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40';
        if (p.vmpHot < p.invStartV) {
            vmpBadgeIcon = 'cancel';
            vmpBadgeColor = 'text-rose-400 bg-rose-950/60 border-rose-800/40 animate-pulse';
        } else if (p.vmpHot < p.minMppV || p.vmpHot > p.maxMppV) {
            vmpBadgeIcon = 'warning';
            vmpBadgeColor = 'text-amber-400 bg-amber-950/60 border-amber-800/40';
        }

        let uocBadge = p.isVocSafe 
            ? `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full"><span class="material-symbols-rounded text-sm text-emerald-400 fill-1">check_circle</span> Uoc: ${p.vocCold.toFixed(0)}V</span>`
            : `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded-full animate-pulse"><span class="material-symbols-rounded text-sm text-rose-400 fill-1">error</span> Uoc: ${p.vocCold.toFixed(0)}V</span>`;

        let vmpBadge = `<span class="inline-flex items-center gap-1 text-[11px] font-semibold ${vmpBadgeColor} border px-2 py-0.5 rounded-full"><span class="material-symbols-rounded text-sm fill-1">${vmpBadgeIcon}</span> Umpp: ${p.vmpHot.toFixed(0)}V</span>`;

        let iscBadge = p.isIscSafe 
            ? `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full"><span class="material-symbols-rounded text-sm text-emerald-400 fill-1">check_circle</span> Isc: ${p.isc.toFixed(1)}A</span>`
            : `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded-full animate-pulse"><span class="material-symbols-rounded text-sm text-rose-400 fill-1">error</span> Isc: ${p.isc.toFixed(1)}A</span>`;

        let mismatchInfo = (p.mismatchPct > 0) 
            ? `<span class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded-full"><span class="material-symbols-rounded text-sm text-rose-400">alt_route</span> -${p.mismatchPct.toFixed(1)}% Mismatch</span>` 
            : '';

        let modTotal = (str.fields || []).reduce((sum, f) => sum + Number(f.count), 0);
        let mpptName = (inv.mppts || []).find(m=>m.id==str.mpptId)?.name || 'MPPT';

        return `
        <div class="m3-card bg-white dark:bg-slate-900 border ${safe ? 'border-slate-200 dark:border-slate-800' : 'border-rose-500/80 ring-2 ring-rose-500/20'} rounded-2xl shadow-sm mb-4 transition-all overflow-hidden">
            <div class="p-4">
                <div class="flex justify-between items-center mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-2.5 h-9 rounded-full shrink-0 shadow-sm" style="background-color: ${str.color}"></div>
                        <div class="flex flex-col">
                            <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5 leading-none">
                                ${str.name} 
                                <span class="font-normal text-xs text-slate-400">| ${modTotal}x Modul an ${inv.name} • <strong class="text-amber-500 font-bold">${str.azimuth ?? 180}° (${getCompassDirection(str.azimuth ?? 180).short})</strong></span>
                            </h4>
                        </div>
                    </div>
                    <button onclick="toggleEditMode(${str.id})" class="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shrink-0">
                        <span class="material-symbols-rounded text-base">tune</span>
                        <span class="hidden md:inline">Konfigurieren</span>
                    </button>
                </div>
                
                <div class="bg-slate-900/90 text-slate-300 rounded-xl p-2.5 flex flex-wrap items-center gap-2 border border-slate-800 shadow-inner">
                    ${uocBadge}
                    ${vmpBadge}
                    ${iscBadge}
                    ${mismatchInfo}
                </div>
            </div>

            <div id="edit-${str.id}" class="hidden p-5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Name</label>
                        <input type="text" value="${str.name}" onchange="updateStringData(${str.id}, 'name', this.value)" class="w-full border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-3 py-1.5 text-xs font-medium outline-none focus:border-primary">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Gruppe / Dach</label>
                        <input type="text" value="${str.group || ''}" placeholder="Z.B. Süd-Dach" onchange="updateStringData(${str.id}, 'group', this.value)" class="w-full border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-3 py-1.5 text-xs font-medium outline-none focus:border-primary">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Wechselrichter</label>
                        <select onchange="updateStringData(${str.id}, 'inverterId', this.value)" class="w-full border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-3 py-1.5 text-xs font-medium outline-none focus:border-primary">${wOpt}</select>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Tracker</label>
                        <select onchange="updateStringData(${str.id}, 'mpptId', this.value)" class="w-full border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-3 py-1.5 text-xs font-medium outline-none focus:border-primary">${mOpt}</select>
                    </div>
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Azimut (Grad 0-360°)</label>
                            <span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-primary/10 text-primary">${getCompassDirection(str.azimuth ?? 180).short}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <div class="relative flex-1">
                                <input type="number" id="azimuth-num-${str.id}" min="0" max="360" step="1" value="${str.azimuth ?? 180}" 
                                       oninput="updateAzimuthLive(${str.id}, this.value)"
                                       onchange="updateStringData(${str.id}, 'azimuth', this.value)" 
                                       class="w-full border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl pl-2.5 pr-6 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-primary"
                                       title="Gradgenaue manuelle Ausrichtung (z. B. 165°)">
                                <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">°</span>
                            </div>
                            <select onchange="updateStringData(${str.id}, 'azimuth', this.value)" 
                                    class="border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-1.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none focus:border-primary shrink-0 cursor-pointer max-w-[90px]">
                                <option value="" disabled selected>Preset</option>
                                <option value="180">Süd (180°)</option>
                                <option value="158">SSO (158°)</option>
                                <option value="135">SO (135°)</option>
                                <option value="90">Ost (90°)</option>
                                <option value="202">SSW (202°)</option>
                                <option value="225">SW (225°)</option>
                                <option value="270">West (270°)</option>
                                <option value="0">Nord (0°)</option>
                                <option value="45">NO (45°)</option>
                                <option value="315">NW (315°)</option>
                            </select>
                        </div>
                        <input type="range" id="azimuth-slider-${str.id}" min="0" max="360" step="1" value="${str.azimuth ?? 180}"
                               oninput="updateAzimuthLive(${str.id}, this.value)"
                               onchange="updateStringData(${str.id}, 'azimuth', this.value)"
                               class="w-full mt-1.5 accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer">
                        <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex justify-between items-center" id="azimuth-label-${str.id}">
                            <span>${getCompassDirection(str.azimuth ?? 180).name}</span>
                            <span class="text-primary font-bold">${getCompassDirection(str.azimuth ?? 180).devLabel}</span>
                        </div>
                    </div>
                </div>

                <div>
                    <div class="flex justify-between items-center mb-1">
                        <label class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pauschale Verschattung</label>
                        <span class="text-xs font-black text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full">${str.shading || 0}%</span>
                    </div>
                    <input type="range" min="0" max="80" step="1" value="${str.shading || 0}" onchange="updateStringData(${str.id}, 'shading', this.value)" oninput="this.previousElementSibling.querySelector('span').innerText = this.value + '%'" class="w-full">
                </div>

                <div class="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                    <div class="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                        <span class="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <span class="material-symbols-rounded text-sm text-primary">grid_view</span> Modulfelder
                        </span>
                        <button onclick="addField(${str.id})" class="text-primary bg-primary/10 hover:bg-primary/20 font-bold text-xs px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1">
                            <span class="material-symbols-rounded text-sm">add</span> Feld
                        </button>
                    </div>
                    <div class="p-3 space-y-2">
                        ${(str.fields || []).map(f => {
                            let currPOpt = panelOptions.replace(`value="${f.panelId}"`, `value="${f.panelId}" selected`);
                            return `
                            <div class="flex flex-col md:flex-row items-center gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                                <select onchange="updateFieldData(${str.id}, ${f.id}, 'panelId', this.value)" class="w-full md:flex-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2.5 py-1.5 outline-none text-xs font-medium">${currPOpt}</select>
                                <div class="flex w-full md:w-auto justify-between items-center gap-2">
                                    <div class="flex items-center"><input type="number" value="${f.count}" onchange="updateFieldData(${str.id}, ${f.id}, 'count', this.value)" class="w-14 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-lg px-1.5 py-1 outline-none font-bold text-center text-xs"><span class="text-[9px] font-bold text-slate-500 uppercase ml-1">Stk</span></div>
                                    <div class="flex items-center"><input type="number" value="${f.tilt}" onchange="updateFieldData(${str.id}, ${f.id}, 'tilt', this.value)" class="w-14 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-lg px-1.5 py-1 outline-none font-bold text-center text-xs"><span class="text-[9px] font-bold text-slate-500 uppercase ml-1">° Neig</span></div>
                                    <button onclick="removeField(${str.id}, ${f.id})" class="text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 p-1.5 rounded-lg transition-colors"><span class="material-symbols-rounded text-base">delete</span></button>
                                </div>
                            </div>`
                        }).join('')}
                    </div>
                </div>
                
                <div class="flex items-center justify-between pt-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-slate-500 dark:text-slate-400">Farbe:</span>
                        <input type="color" value="${str.color}" onchange="updateStringData(${str.id}, 'color', this.value)" class="shrink-0 border-none cursor-pointer">
                    </div>
                    <button onclick="removeString(${str.id})" class="text-xs font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1">
                        <span class="material-symbols-rounded text-sm">delete_forever</span> String Löschen
                    </button>
                </div>

                <div class="text-center pt-4 border-t border-slate-200 dark:border-slate-800 mt-2">
                    <button onclick="toggleEditMode(${str.id})" class="bg-primary hover:bg-primary-hover text-white font-bold px-6 py-2.5 rounded-xl shadow-md w-full md:w-auto text-xs flex items-center justify-center gap-1.5 mx-auto transition-all">
                        <span class="material-symbols-rounded text-base">done</span> Schließen & Übernehmen
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ==========================================
// 4. DC-VERKABELUNG & STRING-VISUALISIERUNG
// (Ausgelagert in wiring.js - siehe Modul-Architektur V7.0)
// ==========================================

// ==========================================
// 5. VERBRAUCHS-LOGIK
// ==========================================
function updateHouseHint() {
    let val = parseInt(document.getElementById('cons_base_kwh').value) || 0;
    let hint = "1-Person";
    if (val >= 2000) hint = "2-Personen";
    if (val >= 3000) hint = "3-Personen";
    if (val >= 4000) hint = "4-Personen";
    if (val >= 5000) hint = "5+ Personen";
    let hEl = document.getElementById('cons_house_hint');
    if(hEl) hEl.innerText = hint + "-Haushalt";
}

function getConsumptionConfig() {
    let baseInp = parseInt(document.getElementById('cons_base_kwh').value) || 3500;
    let h = parseInt(document.getElementById('cons_house').value) || 0;
    return {
        baseKwh: baseInp + h,
        it: document.getElementById('cons_it_active').checked ? (parseFloat(document.getElementById('cons_it_w').value) || 0) : 0,
        ac: document.getElementById('cons_ac_active').checked ? (parseFloat(document.getElementById('cons_ac_kwh').value) || 0) : 0,
        wp: document.getElementById('cons_wp_active').checked ? (parseFloat(document.getElementById('cons_wp_kwh').value) || 0) : 0,
        bw: document.getElementById('cons_bw_active').checked ? (parseFloat(document.getElementById('cons_bw_kwh').value) || 0) : 0,
        bwSmart: document.getElementById('cons_bw_smart').checked,
        ev: document.getElementById('cons_ev_active').checked ? ((parseFloat(document.getElementById('cons_ev_km').value)||0)/100) * (parseFloat(document.getElementById('cons_ev_kwh100').value)||0) : 0,
        evSmart: document.getElementById('cons_ev_smart').checked
    };
}

function toggleConsGroup(id) { document.getElementById(`grp_${id}`).classList.toggle('hidden', !document.getElementById(`cons_${id}_active`).checked); updateConsumptionEstimate(); }

function updateConsumptionEstimate() { 
    let c=getConsumptionConfig(); 
    let el = document.getElementById('lbl_total_kwh_est');
    if(el) el.innerText = Math.round(c.baseKwh+(c.it*8.76)+c.ac+c.wp+c.bw+c.ev).toLocaleString(); 
}

function saveConsumptionSettings() { 
    let c=getConsumptionConfig(); 
    c.baseInp = document.getElementById('cons_base_kwh').value; 
    c.house = document.getElementById('cons_house').value; 
    localStorage.setItem('pvpro_cons', JSON.stringify(c)); 
}

function loadConsumptionSettings() {
    let c = readJsonStorage('pvpro_cons', null); if(!c || typeof c !== 'object') return;
    let bInp = document.getElementById('cons_base_kwh'); if(bInp) bInp.value = c.baseInp || 3500; 
    updateHouseHint();
    let hInp = document.getElementById('cons_house'); if(hInp) hInp.value = c.house || 0;
    
    if(c.it>0) { let cb = document.getElementById('cons_it_active'); if(cb){cb.checked=true; document.getElementById('cons_it_w').value=c.it; toggleConsGroup('it');} }
    if(c.ac>0) { let cb = document.getElementById('cons_ac_active'); if(cb){cb.checked=true; document.getElementById('cons_ac_kwh').value=c.ac; toggleConsGroup('ac');} }
    if(c.wp>0) { let cb = document.getElementById('cons_wp_active'); if(cb){cb.checked=true; document.getElementById('cons_wp_kwh').value=c.wp; toggleConsGroup('wp');} }
    if(c.bw>0) { let cb = document.getElementById('cons_bw_active'); if(cb){cb.checked=true; document.getElementById('cons_bw_kwh').value=c.bw; document.getElementById('cons_bw_smart').checked=c.bwSmart; toggleConsGroup('bw');} }
    if(c.ev>0) { let cb = document.getElementById('cons_ev_active'); if(cb){cb.checked=true; document.getElementById('cons_ev_km').value=(c.ev/18)*100; document.getElementById('cons_ev_smart').checked=c.evSmart; toggleConsGroup('ev');} }
    updateConsumptionEstimate();
}

function build8760ConsumptionArray(pvProfile = null) {
    let c = getConsumptionConfig(); let out = { total: new Float32Array(8760), base: new Float32Array(8760), it: new Float32Array(8760), ac: new Float32Array(8760), wp: new Float32Array(8760), bw: new Float32Array(8760), ev: new Float32Array(8760) };
    let smartEvHours = new Set(), smartBwHours = new Set();
    if(pvProfile) {
        if(c.ev>0 && c.evSmart) { for(let w=0; w<52; w++) { let hrs=[]; for(let h=w*168; h<w*168+168; h++) { if(h%24>=8 && h%24<=18) hrs.push({h, pv:pvProfile[h]}); } hrs.sort((a,b)=>b.pv-a.pv).slice(0,14).forEach(x=>smartEvHours.add(x.h)); } }
        if(c.bw>0 && c.bwSmart) { for(let d=0; d<365; d++) { let hrs=[]; for(let h=d*24; h<d*24+24; h++) { if(h%24>=9 && h%24<=16) hrs.push({h, pv:pvProfile[h]}); } hrs.sort((a,b)=>b.pv-a.pv).slice(0,4).forEach(x=>smartBwHours.add(x.h)); } }
    }
    for(let h=0; h<8760; h++) {
        let d=Math.floor(h/24), hr=h%24;
        out.base[h] = (c.baseKwh*1000/8760)*(1+0.3*Math.cos((d-15)*2*Math.PI/365))*(hr>=18&&hr<=22 ? 1.5 : (hr>=10&&hr<=17 ? 0.8 : 1.0));
        out.it[h] = c.it;
        if(c.ac>0 && d>=120 && d<=270 && hr>=12 && hr<=18) out.ac[h] = (c.ac*1000)/(150*7);
        if(c.wp>0 && (d<120 || d>270)) out.wp[h] = (c.wp*1000/(215*24))*(1+0.5*Math.cos((d-15)*2*Math.PI/365));
        if(c.bw>0) { if(c.bwSmart && pvProfile) { if(smartBwHours.has(h)) out.bw[h]=(c.bw*1000/365)/4; } else if(hr>=18&&hr<=21) out.bw[h]=(c.bw*1000/365)/4; }
        if(c.ev>0) { if(c.evSmart && pvProfile) { if(smartEvHours.has(h)) out.ev[h]=(c.ev*1000/52)/14; } else if(hr>=18&&hr<=23) out.ev[h]=(c.ev*1000/365)/6; }
        out.total[h] = out.base[h]+out.it[h]+out.ac[h]+out.wp[h]+out.bw[h]+out.ev[h];
    }
    
    ConsumptionCache = out; 
    return out;
}

// ==========================================
// 6. FINANZEN & BERECHNUNG (ROI)
// ==========================================
// ==========================================
// 5. INVESTITIONSKOSTEN-LOGIK
// ==========================================
function parseCost(val) {
    if (!val) return 0;
    let n = parseFloat(String(val).replace(',', '.'));
    return isNaN(n) ? 0 : n;
}

function getInvestConfig() {
    return {
        panels: parseCost(document.getElementById('inv_cost_panels')?.value),
        mounting: parseCost(document.getElementById('inv_cost_mounting')?.value),
        inverter: parseCost(document.getElementById('inv_cost_inverter')?.value),
        battery: parseCost(document.getElementById('inv_cost_battery')?.value),
        smartmeter: parseCost(document.getElementById('inv_cost_smartmeter')?.value),
        cables: parseCost(document.getElementById('inv_cost_cables')?.value),
        gak: parseCost(document.getElementById('inv_cost_gak')?.value),
        acmat: parseCost(document.getElementById('inv_cost_acmat')?.value),
        scaffold: parseCost(document.getElementById('inv_cost_scaffold')?.value),
        electrician: parseCost(document.getElementById('inv_cost_electrician')?.value),
        misc: parseCost(document.getElementById('inv_cost_misc')?.value)
    };
}

function calcInvestTotal() {
    let inv = getInvestConfig();
    let cat1 = inv.panels + inv.mounting;
    let cat2 = inv.inverter + inv.battery + inv.smartmeter;
    let cat3 = inv.cables + inv.gak + inv.acmat;
    let cat4 = inv.scaffold + inv.electrician + inv.misc;
    let total = cat1 + cat2 + cat3 + cat4;

    let c1El = document.getElementById('sub_invest_cat1'); if(c1El) c1El.innerText = Math.round(cat1).toLocaleString('de-DE') + " €";
    let c2El = document.getElementById('sub_invest_cat2'); if(c2El) c2El.innerText = Math.round(cat2).toLocaleString('de-DE') + " €";
    let c3El = document.getElementById('sub_invest_cat3'); if(c3El) c3El.innerText = Math.round(cat3).toLocaleString('de-DE') + " €";
    let c4El = document.getElementById('sub_invest_cat4'); if(c4El) c4El.innerText = Math.round(cat4).toLocaleString('de-DE') + " €";
    let totEl = document.getElementById('lbl_invest_total'); if(totEl) totEl.innerText = Math.round(total).toLocaleString('de-DE');

    if (total > 0) {
        let sysCostEl = document.getElementById('fin_sys_cost');
        if(sysCostEl) sysCostEl.value = Math.round(total);
    }
    localStorage.setItem('pvpro_invest', JSON.stringify(inv));
}

function loadInvestSettings() {
    let inv = JSON.parse(localStorage.getItem('pvpro_invest') || '{}');
    ['panels', 'mounting', 'inverter', 'battery', 'smartmeter', 'cables', 'gak', 'acmat', 'scaffold', 'electrician', 'misc'].forEach(k => {
        let el = document.getElementById(`inv_cost_${k}`);
        if(el && inv[k] !== undefined) el.value = inv[k];
    });
    calcInvestTotal();
}

function loadFinanceSettings() {
    let s = readJsonStorage('pvpro_finance', {});
    let gP = document.getElementById('fin_grid_price'); if(gP) gP.value = s.grid || 0.32;
    let sC = document.getElementById('fin_sys_cost'); if(sC) sC.value = s.cost || 15000;
    let eD = document.getElementById('fin_eeg_date'); if(eD) eD.value = s.date || "2024-05";
    let gaP = document.getElementById('fin_gas_price'); if(gaP) gaP.value = s.gas || 1.10;
    let wJ = document.getElementById('fin_wp_jaz'); if(wJ) wJ.value = s.jaz || 3.5;
    let pP = document.getElementById('fin_petrol_price'); if(pP) pP.value = s.petrol || 1.75;
    let iC = document.getElementById('fin_ice_cons'); if(iC) iC.value = s.ice || 7.0;
    updateEEGPreview();
}

function updateEEGPreview() {
    let totalKwp = YieldDataCache ? YieldDataCache.reduce((a,b)=>a+b.kwp, 0) : 0;
    if(totalKwp === 0) totalKwp = 1; 
    
    let dateEl = document.getElementById('fin_eeg_date');
    if(!dateEl) return 0;
    let dateStr = dateEl.value; 
    let year = parseInt(dateStr.split('-')[0]), month = parseInt(dateStr.split('-')[1]);
    
    let finalEeg = 0;
    let preEl = document.getElementById('lbl_eeg_rate_pre');
    
    if (year >= 2027) {
        if(preEl) preEl.innerText = "0.00";
    } else {
        let monthsSinceFeb24 = (year - 2024) * 12 + (month - 2);
        let periods = monthsSinceFeb24 > 0 ? Math.floor(monthsSinceFeb24 / 6) : 0;
        let degression = Math.pow(0.99, periods);
        let baseEeg = totalKwp <= 10 ? 8.20 : ((10 * 8.20) + ((totalKwp - 10) * 7.10)) / totalKwp;
        finalEeg = baseEeg * degression;
        if(preEl) preEl.innerText = finalEeg.toFixed(2);
    }
    return finalEeg;
}

function calculateFinances() {
    let gridP = parseFloat(document.getElementById('fin_grid_price').value) || 0.32;
    let gasP = parseFloat(document.getElementById('fin_gas_price').value) || 1.10; 
    let petrolP = parseFloat(document.getElementById('fin_petrol_price').value) || 1.75;
    let iceCons = parseFloat(document.getElementById('fin_ice_cons').value) || 7.0;
    let jaz = parseFloat(document.getElementById('fin_wp_jaz').value) || 3.5;
    let sysCost = parseFloat(document.getElementById('fin_sys_cost').value) || 15000;

    localStorage.setItem('pvpro_finance', JSON.stringify({
        grid: gridP, cost: sysCost, date: document.getElementById('fin_eeg_date').value, 
        gas: gasP, jaz: jaz, petrol: petrolP, ice: iceCons
    }));

    let finalEeg = updateEEGPreview();
    let eegUi = document.getElementById('rep_b_eeg_rate');
    if(eegUi) eegUi.innerText = finalEeg.toFixed(2);

    if(!FlowCache) return;

    let c = getConsumptionConfig();
    
    let costA_grid = (c.baseKwh + (c.it * 8.76) + c.ac) * gridP;
    let costA_heat = (((c.wp + c.bw) * jaz) / 10) * gasP;
    let costA_car = (c.ev > 0) ? ((parseFloat(document.getElementById('cons_ev_km').value) || 0) / 100) * iceCons * petrolP : 0;
    let costA_total = costA_grid + costA_heat + costA_car;

    let costB_grid = FlowCache.fromGrid * gridP;
    let costB_rev = FlowCache.toGrid * (finalEeg / 100);
    let costB_total = costB_grid - costB_rev;

    let savings = costA_total - costB_total;
    let amort = savings > 0 ? (sysCost / savings).toFixed(1) : "∞";

    let rAGrid = document.getElementById('rep_a_grid'); if(rAGrid) rAGrid.innerText = "+ " + costA_grid.toFixed(2) + " €";
    let rACar = document.getElementById('rep_a_car'); if(rACar) rACar.innerText = "+ " + costA_car.toFixed(2) + " €";
    let rAHeat = document.getElementById('rep_a_heat'); if(rAHeat) rAHeat.innerText = "+ " + costA_heat.toFixed(2) + " €";
    let rATotal = document.getElementById('rep_a_total'); if(rATotal) rATotal.innerText = costA_total.toFixed(2) + " €";

    let rBGrid = document.getElementById('rep_b_grid'); if(rBGrid) rBGrid.innerText = "+ " + costB_grid.toFixed(2) + " €";
    let rBRev = document.getElementById('rep_b_rev'); if(rBRev) rBRev.innerText = "- " + costB_rev.toFixed(2) + " €";
    let rBTotal = document.getElementById('rep_b_total'); if(rBTotal) rBTotal.innerText = costB_total.toFixed(2) + " €";

    let rDiff = document.getElementById('rep_diff'); if(rDiff) rDiff.innerText = Math.round(savings).toLocaleString() + " €";
    let kpiSav = document.getElementById('kpi_savings'); if(kpiSav) kpiSav.innerText = Math.round(savings).toLocaleString() + " €";
    let kpiRoi = document.getElementById('kpi_roi'); if(kpiRoi) kpiRoi.innerText = amort;
}

// ==========================================
// 7. PVGIS API & ENGINE (5.2 RESTORE)
// ==========================================
async function searchLocation() { 
    const q = document.getElementById('locSearchInput').value; if(!q) return;
    try { const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`); const data = await res.json();
        if(data.length>0) { 
            LocationData = {lat:parseFloat(data[0].lat).toFixed(2), lon:parseFloat(data[0].lon).toFixed(2), name:data[0].display_name.split(',')[0]}; 
            let locTxt = document.getElementById('locNameText'); if(locTxt) locTxt.innerText=LocationData.name; 
            let editBox = document.getElementById('locEditBox'); if(editBox) editBox.classList.add('hidden');
        }
    } catch(e) {}
}

async function calculateYieldAPI() {
    const btn = document.getElementById('btnCalculateMain'); 
    const origTxt = btn ? btn.innerHTML : '';
    if(btn) { btn.innerHTML = '<svg class="w-6 h-6 spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="4" stroke-dasharray="30 30"></circle></svg><span>API Simulation läuft...</span>'; btn.disabled = true; }
    
    try {
        let proms = [];
        let safeLat = parseFloat(LocationData?.lat) || 48.06;
        let safeLon = parseFloat(LocationData?.lon) || 8.46;

        strings.forEach(str => {
            let shadingFactor = 1 - ((str.shading || 0) / 100);

            (str.fields || []).forEach(f => {
                const p = flatPanels.find(x=>x.id===parseInt(f.panelId));
                if(p && f.count>0) {
                    let asp = str.azimuth - 180; if (asp>180) asp-=360; if (asp<-180) asp+=360;
                    let peakKw = ((p.pmax * f.count) / 1000).toFixed(3);
                    let peakPower = (p.pmax * f.count) / 1000;
                    const pvgisUrl = `https://pvgis.mb10.org/api/v5_2/seriescalc?lat=${safeLat}&lon=${safeLon}&pvcalculation=1&peakpower=${peakKw}&loss=14&angle=${f.tilt}&aspect=${asp}&startyear=2019&endyear=2019&outputformat=json`;

                    const fetchWithFallback = async () => {
                        // 1. Reale 8.760h Stundenwerte über Synology PVGIS Proxy
                        try {
                            const r1 = await fetch(pvgisUrl);
                            if (r1.ok) {
                                const json = await r1.json();
                                if (json && json.outputs && Array.isArray(json.outputs.hourly) && json.outputs.hourly.length === 8760) {
                                    return json;
                                }
                            }
                        } catch(e) {}

                        // Fallback auf synthetische Berechnung falls offline
                        let synthetic = generateSyntheticPVGISData(safeLat, f.tilt, str.azimuth, peakPower);
                        return { outputs: { hourly: synthetic }, offline: true };
                    };

                    proms.push(
                        fetchWithFallback()
                        .then(d => ({ sId: str.id, fId: f.id, d: d.outputs.hourly, sF: shadingFactor, panel: p, count: f.count, offline: !!d.offline }))
                    );
                }
            });
        });

        if (proms.length === 0) {
            throw new Error("Keine gültigen Strings oder Module definiert.");
        }

        const res = await Promise.all(proms);
        let hasOfflineData = res.some(r => r.offline);
        if (hasOfflineData) {
            alert("⚠️ Hinweis: Die Ertragsdaten wurden synthetisch berechnet, da die PVGIS-Schnittstelle nicht erreichbar war.");
        }

        let invH = {}; 
        let activeInvIds = [...new Set(strings.map(s => parseInt(s.inverterId)))];
        let activeInvs = flatInverters.filter(i => activeInvIds.includes(i.id));
        activeInvs.forEach(i => invH[i.id] = new Float32Array(8760));

        let sRes = strings.map(s => ({ id: s.id, name: s.name, color: s.color, kwp: 0, yield: 0, clip: 0, batYield: 0, mo: new Array(12).fill(0), hr: new Float32Array(8760) }));
        const mStart = [0, 744, 1416, 2160, 2880, 3624, 4344, 5088, 5832, 6552, 7296, 8016];

        let pvProfileRaw = new Float32Array(8760);

        let stringGroups = {};
        res.forEach(r => {
            if(!stringGroups[r.sId]) stringGroups[r.sId] = [];
            stringGroups[r.sId].push(r);
        });

        for(let sId in stringGroups) {
            let fields = stringGroups[sId];
            let str = strings.find(s=>s.id === parseInt(sId));
            let sr = sRes.find(s=>s.id === parseInt(sId));
            if(!str || !sr) continue;

            let idealYear = 0;
            let realYear = 0;

            for(let h=0; h<8760; h++) {
                let minCurrent = Infinity;
                let totalVmp = 0;
                let idealPower = 0;

                fields.forEach(f => {
                    let pDc = f.d[h].P * f.sF; 
                    idealPower += pDc;
                    let vmpField = f.panel.vmp * f.count;
                    totalVmp += vmpField;
                    let current = vmpField > 0 ? (pDc / vmpField) : 0;
                    if(current > f.panel.isc) current = f.panel.isc; 
                    if(current < minCurrent) minCurrent = current;
                });

                if(minCurrent === Infinity) minCurrent = 0;
                let realPower = minCurrent * totalVmp;
                
                idealYear += idealPower;
                realYear += realPower;

                sr.hr[h] += realPower;
                if(invH[str.inverterId]) { 
                    invH[str.inverterId][h] += realPower; 
                    pvProfileRaw[h] += realPower; 
                }
            }

            let mismatchPct = idealYear > 0 ? ((idealYear - realYear) / idealYear) * 100 : 0;
            if(!str._phys) str._phys = {};
            str._phys.mismatchPct = mismatchPct;
        }

        let consH = build8760ConsumptionArray(pvProfileRaw);
        const systemLossFactor = 0.95; 
        
        let flow = { 
            direct: 0, toBat: 0, fromBat: 0, toGrid: 0, fromGrid: 0, clip: 0, batLoss: 0,
            moCons: new Array(12).fill(0), moGen: new Array(12).fill(0), moBat: new Array(12).fill(0),
            hr: { pvTotal: new Float32Array(8760), direct: new Float32Array(8760), fromBat: new Float32Array(8760), toGrid: new Float32Array(8760), toBat: new Float32Array(8760), fromGrid: new Float32Array(8760), clip: new Float32Array(8760), batLoss: new Float32Array(8760) }
        };
        let batCharges = {}; activeInvs.forEach(inv => batCharges[inv.id] = 0);

        for(let h=0; h<8760; h++) {
            let sysAcAvailableW = 0, sysBatChargeW = 0, sysClipW = 0, loadW = consH.total[h] || 0, remainingLoad = loadW;

            activeInvs.forEach(inv => {
                let totalDcW = invH[inv.id][h] * systemLossFactor;
                let acLimit = inv.acMax || 0;
                let bat = flatBatteries.find(b => b.id == inv.batteryId);
                let batCapWh = bat ? (bat.cap * 1000) : 0;
                let batPowerW = bat ? bat.power : 0;
                
                let targetAcW = Math.min(acLimit, remainingLoad, totalDcW);
                remainingLoad -= targetAcW; sysAcAvailableW += targetAcW;
                let excessDc = totalDcW - targetAcW;
                
                if (excessDc > 0 && batCapWh > 0) {
                    let actualCharge = Math.min(excessDc, batPowerW, batCapWh - batCharges[inv.id]);
                    batCharges[inv.id] += actualCharge; excessDc -= actualCharge; sysBatChargeW += actualCharge;
                    if (actualCharge > 0) { sRes.filter(sr => strings.find(s=>s.id===sr.id)?.inverterId == inv.id).forEach(sr => { if(invH[inv.id][h]>0) sr.batYield += (actualCharge * (sr.hr[h]/invH[inv.id][h])) / 1000; }); }
                }
                
                if (excessDc > 0) { let feedInW = Math.min(excessDc, acLimit - targetAcW); sysAcAvailableW += feedInW; excessDc -= feedInW; }
                if (excessDc > 0) { sysClipW += excessDc; sRes.filter(sr => strings.find(s=>s.id===sr.id)?.inverterId == inv.id).forEach(sr => { if(invH[inv.id][h]>0) sr.clip += (excessDc * (sr.hr[h]/invH[inv.id][h])) / 1000; }); }
            });

            let m = 0; for(let i=11; i>=0; i--) { if(h >= mStart[i]) { m = i; break; } }
            flow.moCons[m] += loadW / 1000; flow.moGen[m] += sysAcAvailableW / 1000;
            flow.hr.pvTotal[h] = sysAcAvailableW; flow.hr.toBat[h] = sysBatChargeW; flow.hr.clip[h] = sysClipW;

            if (sysAcAvailableW >= loadW) {
                flow.direct += loadW; flow.toGrid += (sysAcAvailableW - loadW); flow.hr.direct[h] = loadW; flow.hr.toGrid[h] = sysAcAvailableW - loadW;
            } else {
                let deficit = loadW - sysAcAvailableW; flow.direct += sysAcAvailableW; flow.hr.direct[h] = sysAcAvailableW;
                let dischargedEffW = 0, actualDischargeLossW = 0;
                activeInvs.forEach(inv => {
                    if (deficit <= 0) return; let bat = flatBatteries.find(b => b.id == inv.batteryId);
                    if(!bat || bat.cap === 0) return; let availableCharge = batCharges[inv.id];
                    if (availableCharge > 0) {
                        let drawW = Math.min(deficit, bat.power, availableCharge);
                        batCharges[inv.id] -= drawW; deficit -= drawW;
                        dischargedEffW += (drawW * (bat.eff || 0.90)); actualDischargeLossW += (drawW * (1 - (bat.eff || 0.90)));
                    }
                });
                flow.fromBat += dischargedEffW; flow.batLoss += actualDischargeLossW; flow.hr.batLoss[h] = actualDischargeLossW; flow.moBat[m] += dischargedEffW / 1000; flow.hr.fromBat[h] = dischargedEffW;
                flow.fromGrid += deficit; flow.hr.fromGrid[h] = deficit;
            }
            flow.toBat += sysBatChargeW;
        }

        sRes.forEach(sr => {
            sr.yield = (sr.hr.reduce((a,b)=>a+b,0)/1000) * systemLossFactor - sr.clip; 
            for(let m=0; m<12; m++){ let mSum=0; for(let h=mStart[m]; h<(m===11?8760:mStart[m+1]); h++) mSum+=sr.hr[h]; sr.mo[m]=(mSum/1000)*systemLossFactor; }
            (strings.find(s=>s.id===sr.id)?.fields || []).forEach(f=>{ const p=flatPanels.find(x=>x.id===parseInt(f.panelId)); if(p) sr.kwp += (p.pmax*f.count)/1000; });
        });

        let groupedResults = [];
        sRes.forEach(sr => {
            const strObj = strings.find(x => x.id === sr.id); const gName = strObj.group || sr.name;
            let g = groupedResults.find(x => x.name === gName);
            if(!g) { g = { name: gName, color: sr.color, kwp: 0, yield: 0, clip: 0, batYield: 0, mo: new Array(12).fill(0), panels: 0, inverters: [] }; groupedResults.push(g); }
            g.kwp += sr.kwp; g.yield += sr.yield; g.clip += sr.clip; g.batYield += sr.batYield;
            g.panels += (strObj.fields || []).reduce((sum, f) => sum + Number(f.count), 0);
            const inv = flatInverters.find(i=>i.id===parseInt(strObj.inverterId));
            if(inv && !g.inverters.includes(inv.name)) g.inverters.push(inv.name);
            for(let m=0; m<12; m++) g.mo[m] += sr.mo[m];
        });

        ['direct','fromBat','toGrid','fromGrid','toBat','clip','batLoss'].forEach(k => flow[k]/=1000);
        
        YieldDataCache = groupedResults; FlowCache = flow; activeGroupIndex = null; 
        renderStringsUI(); 
        renderDashboard();
        switchTab('uebersicht'); 
    } catch(e) { console.error(e); alert("Berechnungsfehler: " + e.message); }
    if(btn) { btn.innerHTML = origTxt; btn.disabled = false; }
}

// ==========================================
// 8. DASHBOARDS & CHARTS (AUSWERTUNG)
// ==========================================
function setFocus(idx) { activeGroupIndex = activeGroupIndex === idx ? null : idx; renderDashboard(); }

function renderDashboard() {
    if(!YieldDataCache || !FlowCache) return;
    let grpRes = YieldDataCache; let dK = 0, dY = 0;
    grpRes.forEach(g => { dK+=g.kwp; dY+=g.yield; });

    let kGen = document.getElementById('kpi_gen'); if(kGen) kGen.innerText = Math.round(dY).toLocaleString() + " kWh";
    let kSpec = document.getElementById('kpi_spec'); if(kSpec) kSpec.innerText = (dK>0 ? Math.round(dY/dK) : 0) + " kWh/kWp";
    let kCons = document.getElementById('kpi_cons'); if(kCons) kCons.innerText = Math.round(FlowCache.direct + FlowCache.fromBat + FlowCache.fromGrid).toLocaleString() + " kWh";
    
    let sysY = grpRes.reduce((sum, g) => sum + g.yield, 0);
    let sBD = document.getElementById('stringBreakdown');
    if(sBD) {
        sBD.innerHTML = grpRes.map((g, idx) => {
            const pct = sysY>0 ? ((g.yield / sysY)*100).toFixed(1) : 0;
            return `
            <div class="p-4 rounded-2xl border flex justify-between cursor-pointer ${activeGroupIndex===idx?'bg-blue-50 ring-2 ring-blue-400 shadow-md scale-[1.02]':'bg-white shadow-sm'}" onclick="setFocus(${idx})">
                <div class="flex items-center gap-3"><div class="w-4 h-4 rounded-full" style="background-color: ${g.color}"></div><div><p class="text-sm font-bold">${g.name}</p><p class="text-[10px] text-slate-500">${g.panels} Module (${g.kwp.toFixed(2)} kWp)</p></div></div>
                <div class="text-right"><p class="text-base font-black">${pct}%</p></div>
            </div>`;
        }).join('');
    }

    let yCtx = document.getElementById('yieldChart');
    if(yCtx) {
        if(chartYield) { chartYield.data.datasets = grpRes.map((g, idx) => ({ label: g.name, data: g.mo.map(v => Math.round(v)), backgroundColor: (activeGroupIndex !== null && activeGroupIndex !== idx) ? g.color+'20' : g.color, borderRadius: 3 })); chartYield.update(); } 
        else { chartYield = new Chart(yCtx.getContext('2d'), { type: 'bar', data: { labels: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"], datasets: grpRes.map(g => ({ label: g.name, data: g.mo.map(v => Math.round(v)), backgroundColor: g.color })) }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, min: 0 } }, plugins: { legend: { position: 'bottom' } } } }); }
    }

    let totalCons = FlowCache.direct + FlowCache.fromBat + FlowCache.fromGrid;
    let d2Dir = document.getElementById('d2-direct'); if(d2Dir) d2Dir.innerText = Math.round(FlowCache.direct).toLocaleString() + " kWh";
    let d2Bat = document.getElementById('d2-frombat'); if(d2Bat) d2Bat.innerText = Math.round(FlowCache.fromBat).toLocaleString() + " kWh";
    let d2GridI = document.getElementById('d2-grid-in'); if(d2GridI) d2GridI.innerText = Math.round(FlowCache.fromGrid).toLocaleString() + " kWh";
    let d2GridO = document.getElementById('d2-grid-out'); if(d2GridO) d2GridO.innerText = Math.round(FlowCache.toGrid).toLocaleString() + " kWh";
    
    let autarkyPct = Math.round(totalCons > 0 ? ((FlowCache.direct + FlowCache.fromBat) / totalCons) * 100 : 0);
    let eigenPct = Math.round(sysY > 0 ? (1 - (FlowCache.toGrid / sysY)) * 100 : 0);
    let d2ValA = document.getElementById('d2-val-autarky'); if(d2ValA) d2ValA.innerText = autarkyPct + "%";
    let d2ValE = document.getElementById('d2-val-eigen'); if(d2ValE) d2ValE.innerText = eigenPct + "%";
    let ga = document.getElementById('gauge-autarky'); if(ga) ga.setAttribute('stroke-dasharray', `${autarkyPct} 100`);
    let ge = document.getElementById('gauge-eigen'); if(ge) ge.setAttribute('stroke-dasharray', `${eigenPct} 100`);

    let moBreakdown = { base: [], it: [], ac: [], wp: [], bw: [], ev: [], toGrid: [], pvTotal: [], clip: [], toBat: [] };
    const mStart = [0, 744, 1416, 2160, 2880, 3624, 4344, 5088, 5832, 6552, 7296, 8016];
    for(let m=0; m<12; m++) {
        let sumB=0, sumI=0, sumA=0, sumW=0, sumBw=0, sumE=0, sumTG=0, sumPV=0, sumC=0, sumTB=0;
        for(let h=mStart[m]; h<(m===11?8760:mStart[m+1]); h++) { sumB+=ConsumptionCache.base[h]; sumI+=ConsumptionCache.it[h]; sumA+=ConsumptionCache.ac[h]; sumW+=ConsumptionCache.wp[h]; sumBw+=ConsumptionCache.bw[h]; sumE+=ConsumptionCache.ev[h]; sumTG+=FlowCache.hr.toGrid[h]; sumPV+=FlowCache.hr.pvTotal[h]; sumC+=FlowCache.hr.clip[h]; sumTB+=FlowCache.hr.toBat[h]; }
        moBreakdown.base.push(sumB/1000); moBreakdown.it.push(sumI/1000); moBreakdown.ac.push(sumA/1000); moBreakdown.wp.push(sumW/1000); moBreakdown.bw.push(sumBw/1000); moBreakdown.ev.push(sumE/1000); moBreakdown.toGrid.push(sumTG/1000); moBreakdown.pvTotal.push(sumPV/1000); moBreakdown.clip.push(sumC/1000); moBreakdown.toBat.push(sumTB/1000);
    }

    const cOpts = { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0 } }, plugins: { legend: { position: 'bottom', labels: {color: '#cbd5e1', usePointStyle: true, boxWidth: 6} } } };
    let aCCtx = document.getElementById('autarkyConsChart');
    if(aCCtx) {
        if(chartAutarkyCons) chartAutarkyCons.destroy();
        chartAutarkyCons = new Chart(aCCtx.getContext('2d'), { type: 'bar', data: { labels: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"], datasets: [ { label: 'Einspeisung', data: moBreakdown.toGrid, backgroundColor: '#f59e0b', stack: '0' }, { label: 'Bat-Ladung', data: moBreakdown.toBat, backgroundColor: '#10b981', stack: '0' }, { label: 'E-Auto', data: moBreakdown.ev, backgroundColor: '#84cc16', stack: '0' }, { label: 'Klima', data: moBreakdown.ac, backgroundColor: '#0ea5e9', stack: '0' }, { label: 'Wärmepumpe', data: moBreakdown.wp, backgroundColor: '#ef4444', stack: '0' }, { label: 'BWWP', data: moBreakdown.bw, backgroundColor: '#f43f5e', stack: '0' }, { label: 'IT/Server', data: moBreakdown.it, backgroundColor: '#3b82f6', stack: '0' }, { label: 'Grundlast', data: moBreakdown.base, backgroundColor: '#94a3b8', stack: '0' } ]}, options: cOpts });
    }

    let aGCtx = document.getElementById('autarkyGenChart');
    if(aGCtx) {
        if(chartAutarkyGen) chartAutarkyGen.destroy();
        chartAutarkyGen = new Chart(aGCtx.getContext('2d'), { type: 'bar', data: { labels: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"], datasets: [ { label: 'PV Erzeugung', data: moBreakdown.pvTotal, borderColor: '#3b82f6', backgroundColor: 'transparent', type: 'line', borderWidth: 2, pointRadius: 2, tension: 0.3 }, { label: 'PV Direkt', data: FlowCache.moGen, backgroundColor: '#3b82f6', stack: '0' }, { label: 'Aus Batterie', data: FlowCache.moBat, backgroundColor: '#a855f7', stack: '0' }, { label: 'Netzbezug', data: moBreakdown.base.map((_,i) => FlowCache.moCons[i] - FlowCache.moGen[i] + moBreakdown.toGrid[i] - FlowCache.moBat[i]), backgroundColor: '#f43f5e', stack: '0' } ]}, options: cOpts });
    }

    calculateFinances();
    if(currentDetailMonth !== null) updateDetailCharts(currentDetailMonth);
}

// ==========================================
// 9. EINZELTAGE (DETAIL)
// ==========================================
function changeDetailMonth(dir) { let newMonth = currentDetailMonth + dir; if(newMonth < 0) newMonth = 11; if(newMonth > 11) newMonth = 0; updateDetailCharts(newMonth); }

function updateDetailCharts(monthIdx) {
    currentDetailMonth = monthIdx;
    if(!FlowCache || !ConsumptionCache) return;
    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    let mNameUI = document.getElementById('detailMonthName'); if(mNameUI) mNameUI.innerText = monthNames[monthIdx];
    
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let startDay = 0; for(let i=0; i<monthIdx; i++) startDay += daysInMonth[i];
    let dailyLabels = [], dailyBase = [], dailyItLoad = [], dailyAc = [], dailyWp = [], dailyBw = [], dailyEv = [], dailyToGrid = [], dailyToBat = [], dailyPvTotal = [], dailyDirect = [], dailyFromBat = [], dailyFromGrid = [];

    for(let d=0; d<daysInMonth[monthIdx]; d++) {
        dailyLabels.push((d+1)+".");
        let sB=0, sI=0, sA=0, sW=0, sBw=0, sE=0, sTG=0, sTB=0, sPV=0, sDir=0, sFB=0, sFG=0;
        for(let h=0; h<24; h++) { 
            let absH = (startDay + d)*24 + h; 
            sB+=ConsumptionCache.base[absH]; sI+=ConsumptionCache.it[absH]; sA+=ConsumptionCache.ac[absH]; sW+=ConsumptionCache.wp[absH]; sBw+=ConsumptionCache.bw[absH]; sE+=ConsumptionCache.ev[absH]; sTG+=FlowCache.hr.toGrid[absH]; sTB+=FlowCache.hr.toBat[absH]; sPV+=FlowCache.hr.pvTotal[absH]; sDir+=FlowCache.hr.direct[absH]; sFB+=FlowCache.hr.fromBat[absH]; sFG+=FlowCache.hr.fromGrid[absH]; 
        }
        dailyBase.push(sB/1000); dailyItLoad.push(sI/1000); dailyAc.push(sA/1000); dailyWp.push(sW/1000); dailyBw.push(sBw/1000); dailyEv.push(sE/1000); dailyToGrid.push(sTG/1000); dailyToBat.push(sTB/1000); dailyPvTotal.push(sPV/1000); dailyDirect.push(sDir/1000); dailyFromBat.push(sFB/1000); dailyFromGrid.push(sFG/1000);
    }

    const cOpts = { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, min: 0 } }, plugins: { legend: { position: 'bottom', labels: {usePointStyle: true, boxWidth: 8} } } };
    
    let dCCtx = document.getElementById('detailConsChart');
    if(dCCtx) {
        if(detailConsChart) detailConsChart.destroy();
        detailConsChart = new Chart(dCCtx.getContext('2d'), { 
            type: 'bar', 
            data: { 
                labels: dailyLabels, 
                datasets: [ 
                    { label: 'Einspeisung', data: dailyToGrid, backgroundColor: '#f59e0b', stack: '0' }, 
                    { label: 'Bat-Ladung', data: dailyToBat, backgroundColor: '#10b981', stack: '0' }, 
                    { label: 'E-Auto', data: dailyEv, backgroundColor: '#84cc16', stack: '0' }, 
                    { label: 'Klima', data: dailyAc, backgroundColor: '#0ea5e9', stack: '0' }, 
                    { label: 'WP', data: dailyWp, backgroundColor: '#ef4444', stack: '0' }, 
                    { label: 'BWWP', data: dailyBw, backgroundColor: '#f43f5e', stack: '0' }, 
                    { label: 'IT', data: dailyItLoad, backgroundColor: '#3b82f6', stack: '0' }, 
                    { label: 'Grundlast', data: dailyBase, backgroundColor: '#94a3b8', stack: '0' } 
                ]
            }, 
            options: cOpts 
        });
    }
    
    let dGCtx = document.getElementById('detailGenChart');
    if(dGCtx) {
        if(detailGenChart) detailGenChart.destroy();
        detailGenChart = new Chart(dGCtx.getContext('2d'), { 
            type: 'bar', 
            data: { 
                labels: dailyLabels, 
                datasets: [ 
                    { label: 'PV Erzeugung', data: dailyPvTotal, borderColor: '#3b82f6', backgroundColor: 'transparent', type: 'line', borderWidth: 2, pointRadius: 1, tension: 0.2 }, 
                    { label: 'PV Direkt', data: dailyDirect, backgroundColor: '#3b82f6', stack: '0' }, 
                    { label: 'Aus Batterie', data: dailyFromBat, backgroundColor: '#a855f7', stack: '0' }, 
                    { label: 'Netzbezug', data: dailyFromGrid, backgroundColor: '#f43f5e', stack: '0' } 
                ]
            }, 
            options: cOpts 
        });
    }
}

// ==========================================
// 10. EIGENE HARDWARE (CUSTOM DB)
// ==========================================
function toggleCustomDbForm() { 
    let f = document.getElementById('customDbForm'); 
    if(f) f.classList.toggle('hidden'); 
}
function updateCustomDbFields() {
    let t = document.getElementById('cdb_type').value;
    ['panel', 'inv', 'bat'].forEach(x => { let el = document.getElementById(`cdb_fields_${x}`); if(el) el.classList.add('hidden'); });
    let tEl = document.getElementById(`cdb_fields_${t}`); if(tEl) tEl.classList.remove('hidden');
}
function saveCustomDevice() {
    let t = document.getElementById('cdb_type').value;
    let name = document.getElementById('cdb_name')?.value?.trim();
    if(!name) return alert("Bitte Gerätenamen eingeben.");
    
    let userDB = JSON.parse(localStorage.getItem('pvpro_user_db')) || { panels: [], batteries: [], inverters: [] };
    let newId = Date.now() % 100000;

    if(t==='panel') {
        userDB.panels.push({ 
            id: newId, 
            name, 
            pmax: parseFloat(document.getElementById('cdb_pmax').value)||440, 
            voc: parseFloat(document.getElementById('cdb_voc').value)||40.5, 
            vmp: parseFloat(document.getElementById('cdb_vmp').value)||34.0, 
            isc: parseFloat(document.getElementById('cdb_isc').value)||14.5, 
            tempVoc: -0.25,
            isCustom: true
        });
    }
    if(t==='inv') {
        let mppts = []; let count = parseInt(document.getElementById('cdb_mppts').value)||2;
        for(let i=1; i<=count; i++) mppts.push({id:i, name:`MPPT ${i}`, maxIsc:25, maxI:15});
        userDB.inverters.push({ 
            id: newId, 
            name, 
            acMax: parseFloat(document.getElementById('cdb_acmax').value)||5000, 
            startV: parseFloat(document.getElementById('cdb_startv').value)||80, 
            maxV: parseFloat(document.getElementById('cdb_maxv').value)||1000, 
            minMppV: (parseFloat(document.getElementById('cdb_startv').value)||80) + 40, 
            maxMppV: 800, 
            mppts,
            isCustom: true
        });
    }
    if(t==='bat') {
        userDB.batteries.push({ 
            id: newId, 
            name, 
            cap: parseFloat(document.getElementById('cdb_cap').value)||5.0, 
            power: parseFloat(document.getElementById('cdb_power').value)||5000, 
            eff: 0.95,
            isCustom: true
        });
    }

    localStorage.setItem('pvpro_user_db', JSON.stringify(userDB));

    // Optional: Erstes Dokument / Zertifikat direkt mitspeichern
    const docTitle = document.getElementById('cdb_doc_title')?.value?.trim();
    const docCat = document.getElementById('cdb_doc_cat')?.value || 'datenblatt';
    const docStandard = document.getElementById('cdb_doc_standard')?.value?.trim() || '';
    const docUrl = document.getElementById('cdb_doc_url')?.value?.trim() || '';
    const docFileInput = document.getElementById('cdb_doc_file');
    const docFile = docFileInput && docFileInput.files ? docFileInput.files[0] : null;

    const finishSave = () => {
        toggleCustomDbForm();
        if (typeof showToastNotification === 'function') {
            showToastNotification(`Gerät "${name}" erfolgreich angelegt!`, 'success');
        } else {
            alert(`Gerät "${name}" gespeichert!`);
        }
        location.reload();
    };

    if (docTitle && typeof HardwareDocManager !== 'undefined') {
        if (docFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    HardwareDocManager.addDoc({
                        deviceType: t,
                        deviceId: newId,
                        deviceName: name,
                        category: docCat,
                        title: docTitle,
                        standard: docStandard,
                        fileName: docFile.name,
                        fileType: docFile.type,
                        fileSize: docFile.size,
                        url: e.target.result
                    });
                } catch(err) {
                    console.warn("Dokument konnte nicht lokal gesichert werden:", err);
                }
                finishSave();
            };
            reader.readAsDataURL(docFile);
            return;
        } else if (docUrl) {
            try {
                HardwareDocManager.addDoc({
                    deviceType: t,
                    deviceId: newId,
                    deviceName: name,
                    category: docCat,
                    title: docTitle,
                    standard: docStandard,
                    url: docUrl
                });
            } catch(err) {
                console.warn("Dokument-URL Fehler:", err);
            }
        }
    }

    finishSave();
}

function deleteCustomDevice(type, id) {
    if (!confirm("Möchten Sie dieses eigene Gerät wirklich aus der Datenbank entfernen?")) return;

    let userDB = JSON.parse(localStorage.getItem('pvpro_user_db')) || { panels: [], batteries: [], inverters: [] };
    const idNum = parseInt(id);

    if (type === 'panel') userDB.panels = (userDB.panels || []).filter(p => p.id !== idNum);
    if (type === 'inv') userDB.inverters = (userDB.inverters || []).filter(i => i.id !== idNum);
    if (type === 'bat') userDB.batteries = (userDB.batteries || []).filter(b => b.id !== idNum);

    localStorage.setItem('pvpro_user_db', JSON.stringify(userDB));

    // Zugehörige Benutzerdokumente ebenfalls aufräumen
    if (typeof HardwareDocManager !== 'undefined') {
        let allDocs = HardwareDocManager.getAllUserDocs();
        allDocs = allDocs.filter(d => !(d.deviceType === type && String(d.deviceId) === String(id)));
        localStorage.setItem(HardwareDocManager.STORAGE_KEY, JSON.stringify(allDocs));
    }

    if (typeof showToastNotification === 'function') {
        showToastNotification("Gerät gelöscht.", 'info');
    }
    location.reload();
}

function updateInverterBattery(invId, batId) {
    const inv = flatInverters.find(x => x.id === parseInt(invId));
    if(inv) {
        inv.batteryId = parseInt(batId);
        let batMap = JSON.parse(localStorage.getItem('pvpro_batmap') || '{}');
        batMap[invId] = parseInt(batId);
        localStorage.setItem('pvpro_batmap', JSON.stringify(batMap));
        updatePhysicsOnly();
    }
}

function renderDatabaseUI() {
    let batOptions = MasterDB.batteries.map(s => `<optgroup label="${s.series}">${(s.models||[]).map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</optgroup>`).join('');
    
    let wrCard = document.getElementById('wrCardGrid');
    if(wrCard) {
        wrCard.innerHTML = flatInverters.map(w => {
            let currentBatOpt = batOptions.replace(`value="${w.batteryId}"`, `value="${w.batteryId}" selected`);
            const isCustom = !!w.isCustom;
            
            return `
            <div class="m3-card bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-rounded text-primary text-xl">settings_input_component</span>
                            <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm">${escapeHtml(w.name)}</h4>
                        </div>
                        ${isCustom ? `
                            <button onclick="deleteCustomDevice('inv', ${w.id})" class="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer" title="Gerät löschen">
                                <span class="material-symbols-rounded text-base">delete</span>
                            </button>` : ''}
                    </div>
                    <div class="flex flex-wrap gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 mt-1 mb-4">
                        <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">AC Max: ${w.acMax}W</span>
                        <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">Start: ${w.startV}V</span>
                        <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">${(w.mppts||[]).length} MPPTs</span>
                    </div>
                </div>

                <div>
                    <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Zugewiesene Batterie</label>
                    <select onchange="updateInverterBattery(${w.id}, this.value)" class="w-full text-xs font-medium border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-950 rounded-xl px-3 py-2 cursor-pointer outline-none focus:border-primary">${currentBatOpt}</select>
                </div>
            </div>`;
        }).join('');
    }

    let pCard = document.getElementById('panelCardGrid');
    if(pCard) {
        pCard.innerHTML = flatPanels.map(p => {
            const isCustom = !!p.isCustom;
            const vmpFormatted = typeof p.vmp === 'number' ? p.vmp.toFixed(1) : (parseFloat(p.vmp) || 0).toFixed(1);

            return `
            <div class="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-sm gap-2">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <span class="material-symbols-rounded text-sm text-primary">solar_power</span> ${escapeHtml(p.name)}
                        </h4>
                        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Voc: ${p.voc}V | Vmp: ${vmpFormatted}V | Isc: ${p.isc}A</p>
                    </div>
                    <div class="text-right flex items-center gap-1.5">
                        <span class="text-xs font-black text-primary">${p.pmax} W</span>
                        ${isCustom ? `
                            <button onclick="deleteCustomDevice('panel', ${p.id})" class="text-rose-500 hover:text-rose-700 p-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer" title="Modul löschen">
                                <span class="material-symbols-rounded text-sm">delete</span>
                            </button>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
    }
    
    let bCard = document.getElementById('batCardGrid');
    if(bCard) {
        bCard.innerHTML = flatBatteries.map(b => {
            const isCustom = !!b.isCustom;
            const capFormatted = typeof b.cap === 'number' ? b.cap.toFixed(2) : (parseFloat(b.cap) || 0).toFixed(2);

            return `
            <div class="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-sm gap-2">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <span class="material-symbols-rounded text-sm text-accent">battery_charging_full</span> ${escapeHtml(b.name)}
                        </h4>
                        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Max. P: ${b.power}W | Eff: ${Math.round((b.eff || 1) * 100)}%</p>
                    </div>
                    <div class="text-right flex items-center gap-1.5">
                        <span class="text-xs font-black text-accent">${capFormatted} kWh</span>
                        ${isCustom ? `
                            <button onclick="deleteCustomDevice('bat', ${b.id})" class="text-rose-500 hover:text-rose-700 p-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer" title="Batterie löschen">
                                <span class="material-symbols-rounded text-sm">delete</span>
                            </button>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
    }
}

// ==========================================
// INTERAKTIVER DOKUMENTEN-MANAGER MODAL
// ==========================================
function openHardwareDocModal(deviceType, deviceId, deviceName) {
    let modal = document.getElementById('modal-hardware-docs');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-hardware-docs';
        modal.className = 'fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md hidden';
        document.body.appendChild(modal);
    }

    const typeLabels = { panel: 'Solarmodul', inv: 'Wechselrichter', bat: 'Batteriespeicher' };
    const typeLabel = typeLabels[deviceType] || 'Hardware';
    const docs = typeof HardwareDocManager !== 'undefined' ? HardwareDocManager.getDocsForDevice(deviceType, deviceId) : [];

    modal.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <!-- HEADER -->
        <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <span class="material-symbols-rounded text-2xl">folder_special</span>
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">${typeLabel}</span>
                        <h3 class="text-base font-black text-slate-900 dark:text-white">${escapeHtml(deviceName)}</h3>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Hinterlegte Datenblätter, Zertifikate (VDE-AR-N 4105) & Prüfberichte</p>
                </div>
            </div>
            <button onclick="closeHardwareDocModal()" class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center transition-all">
                <span class="material-symbols-rounded text-lg">close</span>
            </button>
        </div>

        <!-- CONTENT SCROLLABLE -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
            
            <!-- VORHANDENE DOKUMENTE -->
            <div>
                <h4 class="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span class="material-symbols-rounded text-primary text-base">verified</span>
                    Hinterlegte Dokumente & Zertifikate (${docs.length})
                </h4>
                
                ${docs.length === 0 ? `
                    <div class="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-center">
                        <span class="material-symbols-rounded text-3xl text-slate-300 dark:text-slate-700 mb-1">description</span>
                        <p class="text-xs text-slate-500">Noch keine Dokumente für dieses Gerät hinterlegt.</p>
                        <p class="text-[11px] text-slate-400 mt-1">Nutzen Sie das Formular unten, um Datenblätter oder Zertifikate hinzuzufügen.</p>
                    </div>
                ` : `
                    <div class="space-y-2.5">
                        ${docs.map(doc => {
                            const isMaster = !!doc.isMaster;
                            const isCert = doc.category === 'zertifikat';
                            const badgeColor = isCert ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
                            const catName = isCert ? 'Zertifikat' : (doc.category === 'garantie' ? 'Garantie' : 'Datenblatt');
                            
                            return `
                            <div class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shadow-2xs">
                                <div class="flex items-start gap-3 min-w-0">
                                    <div class="w-8 h-8 rounded-xl ${isCert ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'} flex items-center justify-center shrink-0 mt-0.5">
                                        <span class="material-symbols-rounded text-lg">${isCert ? 'verified_user' : 'description'}</span>
                                    </div>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="text-[10px] font-black px-2 py-0.5 rounded-md border ${badgeColor}">${catName}</span>
                                            <span class="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">${escapeHtml(doc.title)}</span>
                                        </div>
                                        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                            ${doc.standard ? `Norm: <strong class="text-slate-700 dark:text-slate-300">${escapeHtml(doc.standard)}</strong> • ` : ''}
                                            ${doc.issuer ? `Aussteller: ${escapeHtml(doc.issuer)} • ` : ''}
                                            ${doc.certNo ? `Zertifikat-Nr.: ${escapeHtml(doc.certNo)}` : ''}
                                            ${doc.notes ? `<span class="italic block text-[10px] text-slate-400">${escapeHtml(doc.notes)}</span>` : ''}
                                        </p>
                                    </div>
                                </div>

                                <div class="flex items-center gap-1.5 shrink-0">
                                    ${doc.url ? `
                                        <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-primary hover:text-white text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1 transition-all" title="Dokument öffnen / anzeigen">
                                            <span class="material-symbols-rounded text-sm">open_in_new</span>
                                            <span class="hidden sm:inline">Öffnen</span>
                                        </a>` : ''}
                                    ${!isMaster ? `
                                        <button onclick="deleteHardwareDocFromModal('${doc.id}', '${deviceType}', ${deviceId}, '${escapeHtml(deviceName)}')" class="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/60 flex items-center justify-center transition-all" title="Dokument löschen">
                                            <span class="material-symbols-rounded text-sm">delete</span>
                                        </button>` : ''}
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                `}
            </div>

            <!-- NEUES DOKUMENT ANHÄNGEN FORMULAR -->
            <div class="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border-2 border-dashed border-slate-300 dark:border-slate-800">
                <h4 class="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <span class="material-symbols-rounded text-primary text-base">add_circle</span>
                    Neues Dokument / Zertifikat anfügen
                </h4>

                <div class="space-y-3 text-xs">
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Kategorie</label>
                            <select id="mdl_doc_cat" class="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-2.5 py-2 font-medium outline-none focus:border-primary">
                                <option value="datenblatt">Technisches Datenblatt</option>
                                <option value="zertifikat">Einheitenzertifikat (VDE-AR-N 4105)</option>
                                <option value="zertifikat">TÜV / IEC Sicherheitszertifikat</option>
                                <option value="garantie">Garantie & Handbuch</option>
                                <option value="sonstiges">Sonstiger Nachweis</option>
                            </select>
                        </div>
                        <div class="sm:col-span-2">
                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dokument-Titel *</label>
                            <input type="text" id="mdl_doc_title" placeholder="z.B. Offizielles Datenblatt 2026 oder VDE-AR-N 4105 Nachweis" class="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-2.5 py-2 outline-none focus:border-primary">
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Norm / Prüfgrundlage (optional)</label>
                            <input type="text" id="mdl_doc_standard" placeholder="z.B. VDE-AR-N 4105:2018-11, IEC 61215" class="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-2.5 py-2 outline-none focus:border-primary">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Prüfstelle / Zertifikats-Nr. (optional)</label>
                            <input type="text" id="mdl_doc_certNo" placeholder="z.B. TÜV Rheinland AK 50456123" class="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-2.5 py-2 outline-none focus:border-primary">
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Web-Link / Download-URL</label>
                            <input type="url" id="mdl_doc_url" placeholder="https://..." class="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-2.5 py-2 outline-none focus:border-primary">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Oder Datei hochladen (PDF, PNG, JPG)</label>
                            <input type="file" id="mdl_doc_file" accept=".pdf,image/*" class="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-2 py-1.5 outline-none focus:border-primary file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20">
                        </div>
                    </div>

                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Notizen / Spezifikation (optional)</label>
                        <input type="text" id="mdl_doc_notes" placeholder="z.B. Wirkungsgrad 23.6%, IP68, 25 Jahre Produktgarantie" class="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-2.5 py-2 outline-none focus:border-primary">
                    </div>

                    <div class="pt-2 flex justify-end">
                        <button onclick="addHardwareDocFromModal('${deviceType}', ${deviceId}, '${escapeHtml(deviceName)}')" class="bg-primary hover:bg-primary-hover text-white font-extrabold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md transition-all">
                            <span class="material-symbols-rounded text-base">save</span>
                            <span>Dokument speichern</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- FOOTER -->
        <div class="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center text-xs">
            <span class="text-slate-500">Wird bei aktivierter Option im Dossier / PDF beigelegt</span>
            <button onclick="closeHardwareDocModal()" class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold transition-all">
                Schließen
            </button>
        </div>
    </div>
    `;

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeHardwareDocModal() {
    const modal = document.getElementById('modal-hardware-docs');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

function addHardwareDocFromModal(deviceType, deviceId, deviceName) {
    const title = document.getElementById('mdl_doc_title')?.value?.trim();
    if (!title) return alert("Bitte einen Dokument-Titel eingeben.");

    const category = document.getElementById('mdl_doc_cat')?.value || 'datenblatt';
    const standard = document.getElementById('mdl_doc_standard')?.value?.trim() || '';
    const certNo = document.getElementById('mdl_doc_certNo')?.value?.trim() || '';
    const url = document.getElementById('mdl_doc_url')?.value?.trim() || '';
    const notes = document.getElementById('mdl_doc_notes')?.value?.trim() || '';
    const fileInput = document.getElementById('mdl_doc_file');
    const file = fileInput && fileInput.files ? fileInput.files[0] : null;

    const saveAndRefresh = (docUrl, fileName, fileType, fileSize) => {
        try {
            HardwareDocManager.addDoc({
                deviceType,
                deviceId,
                deviceName,
                category,
                title,
                standard,
                certNo,
                url: docUrl,
                fileName,
                fileType,
                fileSize,
                notes
            });
            if (typeof showToastNotification === 'function') {
                showToastNotification("Dokument erfolgreich angefügt!", 'success');
            }
            renderDatabaseUI();
            openHardwareDocModal(deviceType, deviceId, deviceName);
        } catch(e) {
            alert(e.message || "Fehler beim Speichern des Dokuments.");
        }
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            saveAndRefresh(e.target.result, file.name, file.type, file.size);
        };
        reader.readAsDataURL(file);
    } else {
        saveAndRefresh(url, '', '', 0);
    }
}

function deleteHardwareDocFromModal(docId, deviceType, deviceId, deviceName) {
    if (!confirm("Dokument wirklich löschen?")) return;
    HardwareDocManager.deleteDoc(docId);
    if (typeof showToastNotification === 'function') {
        showToastNotification("Dokument entfernt.", 'info');
    }
    renderDatabaseUI();
    openHardwareDocModal(deviceType, deviceId, deviceName);
}

window.openHardwareDocModal = openHardwareDocModal;
window.closeHardwareDocModal = closeHardwareDocModal;
window.addHardwareDocFromModal = addHardwareDocFromModal;
window.deleteHardwareDocFromModal = deleteHardwareDocFromModal;
window.deleteCustomDevice = deleteCustomDevice;


// ==========================================
// SYNTHETISCHER OFFLINE FALLBACK GENERATOR
// ==========================================
function generateSyntheticPVGISData(lat, tilt, azimuth, peakPower) {
    let hourly = [];
    const monthlyPeakW = [15, 30, 60, 95, 120, 130, 125, 105, 75, 45, 20, 10]; 
    
    let aspect = azimuth - 180;
    let azLoss = 1 - (Math.abs(aspect) / 180) * 0.25; 
    let tiltLoss = 1 - (Math.abs(tilt - 35) / 90) * 0.15; 
    
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let monthIdx = 0;
    
    for(let h=0; h<8760; h++) {
        let d = Math.floor(h/24);
        let hr = h%24;
        
        let accum = 0;
        for(let m=0; m<12; m++) {
            accum += daysInMonth[m];
            if(d < accum) {
                monthIdx = m;
                break;
            }
        }
        
        let sunPower = 0;
        if(hr >= 6 && hr <= 18) {
            let sine = Math.sin((hr - 6) * Math.PI / 12);
            let noise = 0.6 + 0.4 * Math.sin(d * 13.5) * Math.cos(d * 5.2);
            noise = Math.max(0.1, Math.min(1.0, noise));
            sunPower = (peakPower * 1000) * (monthlyPeakW[monthIdx] / 150) * sine * azLoss * tiltLoss * noise;
        }
        hourly.push({ P: sunPower });
    }
    return hourly;
}

// ==========================================
// THEME & DESIGN MANAGEMENT
// ==========================================
function loadThemeSettings() {
    const theme = getThemeSettings();
    let pInput = document.getElementById('themePrimaryColor');
    let aInput = document.getElementById('themeAccentColor');
    if(pInput) pInput.value = theme.primary;
    if(aInput) aInput.value = theme.accent;
    applyTheme(theme.primary, theme.accent, theme.dark);
}

function toggleThemePanel() {
    let p = document.getElementById('themeSettingsPanel');
    if(p) p.classList.toggle('hidden');
}

function applyTheme(primary, accent, dark) {
    if(primary) {
        document.documentElement.style.setProperty('--color-primary', primary);
        let hover = adjustColorBrightness(primary, -15);
        document.documentElement.style.setProperty('--color-primary-hover', hover);
    }
    if(accent) {
        document.documentElement.style.setProperty('--color-accent', accent);
        let hover = adjustColorBrightness(accent, -15);
        document.documentElement.style.setProperty('--color-accent-hover', hover);
    }
    
    let html = document.documentElement;
    let btn = document.getElementById('btnThemeDarkMode');
    if(dark) {
        html.classList.add('dark');
        if(btn) btn.innerText = "Ausschalten";
    } else {
        html.classList.remove('dark');
        if(btn) btn.innerText = "Aktivieren";
    }
    
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = dark ? '#cbd5e1' : '#475569';
        Chart.defaults.borderColor = dark ? '#334155' : '#e2e8f0';
        if (chartYield) chartYield.update();
        if (chartAutarkyCons) chartAutarkyCons.update();
        if (chartAutarkyGen) chartAutarkyGen.update();
        if (detailConsChart) detailConsChart.update();
        if (detailGenChart) detailGenChart.update();
    }
}

function updateThemeColors(primary, accent) {
    let theme = getThemeSettings();
    if(isHexColor(primary)) theme.primary = primary;
    if(isHexColor(accent)) theme.accent = accent;
    localStorage.setItem('pvpro_theme', JSON.stringify(theme));
    applyTheme(theme.primary, theme.accent, theme.dark);
}

function toggleDarkMode() {
    let theme = getThemeSettings();
    theme.dark = !theme.dark;
    localStorage.setItem('pvpro_theme', JSON.stringify(theme));
    applyTheme(theme.primary, theme.accent, theme.dark);
}

function adjustColorBrightness(hex, percent) {
    let R = parseInt(hex.substring(1,3),16);
    let G = parseInt(hex.substring(3,5),16);
    let B = parseInt(hex.substring(5,7),16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R<255)?R:255;  G = (G<255)?G:255;  B = (B<255)?B:255;  
    R = (R>0)?R:0;      G = (G>0)?G:0;      B = (B>0)?B:0;  

    let rHex = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
    let gHex = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
    let bHex = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));

    return "#"+rHex+gHex+bHex;
}

// ==========================================
// PWA SERVICE WORKER & INSTALL PROMPT
// ==========================================
let deferredPrompt = null;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('PVPro Service Worker registriert:', reg.scope);
            })
            .catch(err => {
                console.warn('PVPro Service Worker Registrierung fehlgeschlagen:', err);
            });
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('btnPwaInstall');
    if (btn) btn.classList.remove('hidden');
});

function installPwaApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('PWA Installation akzeptiert');
        }
        deferredPrompt = null;
        const btn = document.getElementById('btnPwaInstall');
        if (btn) btn.classList.add('hidden');
    });
}

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const btn = document.getElementById('btnPwaInstall');
    if (btn) btn.classList.add('hidden');
    console.log('PVPro erfolgreich installiert.');
});

window.onload = initDatabase;

function generateHourlyFromPVGISMonthly(monthlyKWh, lat, tilt, azimuth, peakPower) {
    let hourly = [];
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let aspect = azimuth - 180;
    let azLoss = Math.max(0.2, 1 - (Math.abs(aspect) / 180) * 0.35);
    let tiltLoss = Math.max(0.5, 1 - (Math.abs(tilt - 35) / 90) * 0.25);

    for (let m = 0; m < 12; m++) {
        let days = daysInMonth[m];
        let targetWhMonth = (monthlyKWh[m] || 0) * 1000;
        let monthRawCurve = [];
        let monthRawSum = 0;

        for (let d = 0; d < days; d++) {
            for (let hr = 0; hr < 24; hr++) {
                let sunPower = 0;
                let sunrise = 7 - 2 * Math.cos(m * Math.PI / 6);
                let sunset = 17 + 3 * Math.cos(m * Math.PI / 6);
                if (hr >= sunrise && hr <= sunset) {
                    let dayFraction = (hr - sunrise) / (sunset - sunrise);
                    let sine = Math.sin(dayFraction * Math.PI);
                    sunPower = Math.max(0, sine * azLoss * tiltLoss);
                }
                monthRawCurve.push(sunPower);
                monthRawSum += sunPower;
            }
        }

        let scale = monthRawSum > 0 ? (targetWhMonth / monthRawSum) : 0;
        for (let i = 0; i < monthRawCurve.length; i++) {
            hourly.push({ P: monthRawCurve[i] * scale });
        }
    }
    return hourly;
}
