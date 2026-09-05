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
        
        let faqTab = document.getElementById('tab-faq');
        if(faqTab && typeof HandbuchHTML !== 'undefined') faqTab.innerHTML = HandbuchHTML;

        loadConsumptionSettings(); 
        loadFinanceSettings();
        loadInvestSettings();
        loadWiringSettings();
        updatePhysicsOnly();
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
    alert("Erfolgreich gespeichert!"); 
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
        document.getElementById('edit-' + id).classList.remove('hidden');
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
                                <span class="font-normal text-xs text-slate-400">| ${modTotal}x Modul an ${inv.name}</span>
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
                        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Azimut (Grad)</label>
                        <select onchange="updateStringData(${str.id}, 'azimuth', this.value)" class="w-full border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl px-3 py-1.5 text-xs font-medium outline-none focus:border-primary">
                            <option value="180" ${str.azimuth==180?'selected':''}>Süd (180°)</option>
                            <option value="90" ${str.azimuth==90?'selected':''}>Ost (90°)</option>
                            <option value="270" ${str.azimuth==270?'selected':''}>West (270°)</option>
                            <option value="0" ${str.azimuth==0?'selected':''}>Nord (0°)</option>
                            <option value="135" ${str.azimuth==135?'selected':''}>Südost (135°)</option>
                            <option value="225" ${str.azimuth==225?'selected':''}>Südwest (225°)</option>
                        </select>
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
// 4. VERKABELUNG & STRING-VISUALISIERUNG
// ==========================================

let wiringSettings = {
    selectedStringId: 'all',
    layoutMode: 'leapfrog',      // 'leapfrog', 'loop_reduced', 'simple', 'manual'
    orientation: 'portrait',     // 'portrait', 'landscape'
    columns: 'auto',             // 'auto', 1, 2, 3, 4, 5, 6, 8, 10
    cableLengthWr: 15,           // Meter einfacher Weg zum WR
    cableCrossSection: 6,        // mm² (4, 6, 10)
    cableTemp: 50,               // °C Betriebstemperatur
    showCurrentAnimation: true,
    showWireNumbers: true,
    showPolarity: true,
    highlightPanelIdx: null,

    // Manuelle Zuweisung je String: { [strId]: [panelIdx0, panelIdx1, ...] }
    customSequences: {},

    // Interaktiver Klick-Absteckmodus
    interactiveActive: false,
    interactiveTargetStringId: null,
    interactiveQueue: [],

    // Dachhindernisse & Geometrie je String:
    // { [strId]: { obstacles: [ { id, row, col, type, label } ] } }
    customRoofLayouts: {},
    showObstacleEditor: false,

    // Exakte Kabelwege Weg A, Weg B und Feldbrücken je String
    cableWegA: {},               // { [strId]: number (Meter) }
    cableWegB: {},               // { [strId]: number (Meter) }
    fieldBridges: {},            // { [strId]: { [bridgeIdx]: number (Meter) } }
    panelCableRate: 2.0          // Pauschal 2,0 m Kabel pro PV-Modul
};

function loadWiringSettings() {
    let s = readJsonStorage('pvpro_wiring', null);
    if(s && typeof s === 'object') {
        wiringSettings = Object.assign(wiringSettings, s);
    }
    if (!wiringSettings.customSequences) wiringSettings.customSequences = {};
    if (!wiringSettings.customRoofLayouts) wiringSettings.customRoofLayouts = {};
    if (!wiringSettings.interactiveQueue) wiringSettings.interactiveQueue = [];
    if (!wiringSettings.cableWegA) wiringSettings.cableWegA = {};
    if (!wiringSettings.cableWegB) wiringSettings.cableWegB = {};
    if (!wiringSettings.fieldBridges) wiringSettings.fieldBridges = {};
    if (!wiringSettings.panelCableRate) wiringSettings.panelCableRate = 2.0;
}

function getWiringWegA(strId) {
    if (wiringSettings.cableWegA && wiringSettings.cableWegA[strId] !== undefined) {
        return Math.max(1, parseFloat(wiringSettings.cableWegA[strId]) || 15);
    }
    return Math.max(1, parseFloat(wiringSettings.cableLengthWr) || 15);
}

function setWiringWegA(strId, val) {
    if (!wiringSettings.cableWegA) wiringSettings.cableWegA = {};
    wiringSettings.cableWegA[strId] = Math.max(1, Math.min(250, parseFloat(val) || 15));
    saveWiringSettings();
    renderWiringTab();
}

function getWiringWegB(strId) {
    if (wiringSettings.cableWegB && wiringSettings.cableWegB[strId] !== undefined) {
        return Math.max(1, parseFloat(wiringSettings.cableWegB[strId]) || 15);
    }
    return Math.max(1, parseFloat(wiringSettings.cableLengthWr) || 15);
}

function setWiringWegB(strId, val) {
    if (!wiringSettings.cableWegB) wiringSettings.cableWegB = {};
    wiringSettings.cableWegB[strId] = Math.max(1, Math.min(250, parseFloat(val) || 15));
    saveWiringSettings();
    renderWiringTab();
}

function getWiringBridgeLength(strId, bridgeIdx) {
    if (wiringSettings.fieldBridges && wiringSettings.fieldBridges[strId] && wiringSettings.fieldBridges[strId][bridgeIdx] !== undefined) {
        return Math.max(0.5, parseFloat(wiringSettings.fieldBridges[strId][bridgeIdx]) || 4.0);
    }
    return 4.0;
}

function setWiringBridgeLength(strId, bridgeIdx, val) {
    if (!wiringSettings.fieldBridges) wiringSettings.fieldBridges = {};
    if (!wiringSettings.fieldBridges[strId]) wiringSettings.fieldBridges[strId] = {};
    wiringSettings.fieldBridges[strId][bridgeIdx] = Math.max(0.5, Math.min(100, parseFloat(val) || 4.0));
    saveWiringSettings();
    renderWiringTab();
}

function promptEditBridgeLength(strId, bridgeIdx, currentLen) {
    const val = prompt(`Länge der Feld-Brücke in Metern (aktuell: ${currentLen} m):`, currentLen);
    if (val !== null && !isNaN(parseFloat(val))) {
        setWiringBridgeLength(strId, bridgeIdx, parseFloat(val));
    }
}

// Bearbeitung von Feldern direkt aus dem Verkabelungs-Tab
function updateFieldInWiring(strId, fieldId, key, val) {
    const str = strings.find(s => s.id === strId);
    if (!str) return;
    const f = (str.fields || []).find(field => field.id === fieldId);
    if (!f) return;

    if (key === 'name') {
        f.name = val;
    } else if (key === 'count') {
        f.count = Math.max(1, Math.min(100, parseInt(val) || 1));
        f.rows = Math.ceil(f.count / (f.cols || 1));
    } else if (key === 'cols') {
        f.cols = Math.max(1, Math.min(12, parseInt(val) || 1));
        f.rows = Math.ceil((f.count || 1) / f.cols);
    } else if (key === 'rows') {
        f.rows = Math.max(1, Math.min(12, parseInt(val) || 1));
        f.cols = Math.ceil((f.count || 1) / f.rows);
    } else if (key === 'tilt') {
        f.tilt = Math.max(0, Math.min(90, parseInt(val) || 30));
    } else if (key === 'panelId') {
        f.panelId = parseInt(val);
    }

    const totalMod = (str.fields || []).reduce((a, x) => a + (parseInt(x.count) || 0), 0);
    if (wiringSettings.customSequences[strId]?.length !== totalMod) {
        delete wiringSettings.customSequences[strId];
    }

    updatePhysicsOnly();
    localStorage.setItem('pvpro_strings', JSON.stringify(strings));
    saveWiringSettings();
    renderWiringTab();
}

function addFieldInWiring(strId) {
    const str = strings.find(s => s.id === strId);
    if (!str) return;
    if (!str.fields) str.fields = [];
    const nextIdx = str.fields.length + 1;
    const defaultName = nextIdx === 2 ? 'Gaube' : `Feld ${nextIdx}`;
    str.fields.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: defaultName,
        panelId: str.fields[0]?.panelId || flatPanels[0]?.id || 1,
        count: 4,
        tilt: 30,
        cols: 4,
        rows: 1
    });

    if (!wiringSettings.fieldBridges) wiringSettings.fieldBridges = {};
    if (!wiringSettings.fieldBridges[strId]) wiringSettings.fieldBridges[strId] = {};
    wiringSettings.fieldBridges[strId][nextIdx - 2] = 4.0;

    delete wiringSettings.customSequences[strId];
    updatePhysicsOnly();
    localStorage.setItem('pvpro_strings', JSON.stringify(strings));
    saveWiringSettings();
    renderWiringTab();
}

function removeFieldInWiring(strId, fieldId) {
    const str = strings.find(s => s.id === strId);
    if (!str || !str.fields || str.fields.length <= 1) return;
    str.fields = str.fields.filter(f => f.id !== fieldId);
    delete wiringSettings.customSequences[strId];
    updatePhysicsOnly();
    localStorage.setItem('pvpro_strings', JSON.stringify(strings));
    saveWiringSettings();
    renderWiringTab();
}

function getMultiFieldSequence(str, mode) {
    const fields = str.fields || [];
    const totalMod = fields.reduce((a, f) => a + (parseInt(f.count) || 0), 0);
    if (totalMod === 0) return [];

    if (mode === 'leapfrog') {
        const seq = [];
        let offset = 0;
        fields.forEach(f => {
            const cnt = parseInt(f.count) || 0;
            const sub = getLeapfrogOrder(cnt).map(i => i + offset);
            seq.push(...sub);
            offset += cnt;
        });
        return seq;
    }
    return Array.from({ length: totalMod }, (_, i) => i);
}

function saveWiringSettings() {
    localStorage.setItem('pvpro_wiring', JSON.stringify(wiringSettings));
}

function setWiringString(strId) {
    wiringSettings.selectedStringId = strId === 'all' ? 'all' : Number(strId);
    saveWiringSettings();
    renderWiringTab();
}

function setWiringLayout(mode) {
    wiringSettings.layoutMode = mode;
    saveWiringSettings();
    renderWiringTab();
}

function setWiringOrientation(orient) {
    wiringSettings.orientation = orient;
    saveWiringSettings();
    renderWiringTab();
}

function setWiringColumns(cols) {
    wiringSettings.columns = cols;
    saveWiringSettings();
    renderWiringTab();
}

function setWiringCrossSection(cs) {
    wiringSettings.cableCrossSection = Number(cs);
    saveWiringSettings();
    renderWiringTab();
}

function setWiringCableLength(len) {
    const val = Math.max(1, Math.min(150, Number(len) || 15));
    wiringSettings.cableLengthWr = val;
    if (wiringSettings.selectedStringId && wiringSettings.selectedStringId !== 'all') {
        if (!wiringSettings.cableWegA) wiringSettings.cableWegA = {};
        if (!wiringSettings.cableWegB) wiringSettings.cableWegB = {};
        wiringSettings.cableWegA[wiringSettings.selectedStringId] = val;
        wiringSettings.cableWegB[wiringSettings.selectedStringId] = val;
    }
    saveWiringSettings();
    renderWiringTab();
}

function setWiringTemp(temp) {
    wiringSettings.cableTemp = Number(temp);
    saveWiringSettings();
    renderWiringTab();
}

function toggleWiringAnimation() {
    wiringSettings.showCurrentAnimation = !wiringSettings.showCurrentAnimation;
    saveWiringSettings();
    renderWiringTab();
}

function toggleWiringNumbers() {
    wiringSettings.showWireNumbers = !wiringSettings.showWireNumbers;
    saveWiringSettings();
    renderWiringTab();
}

function toggleWiringPolarity() {
    wiringSettings.showPolarity = !wiringSettings.showPolarity;
    saveWiringSettings();
    renderWiringTab();
}

function highlightWiringPanel(idx) {
    wiringSettings.highlightPanelIdx = (wiringSettings.highlightPanelIdx === idx) ? null : idx;
    renderWiringTab();
}

function addDemoStringIfEmpty() {
    if (strings.length === 0) {
        addString();
    }
    switchTab('system');
}

function printWiringPlan() {
    window.print();
}

// Ordnungsmuster für Reißverschluss (Leap-Frog)
function getLeapfrogOrder(n) {
    if (n <= 1) return [0];
    const forward = [];
    const backward = [];
    for (let i = 0; i < n; i += 2) {
        forward.push(i);
    }
    const lastEvenOrOdd = (n % 2 === 0 ? n - 1 : n - 2);
    for (let i = lastEvenOrOdd; i > 0; i -= 2) {
        backward.push(i);
    }
    return [...forward, ...backward];
}

// --- MANUELLE REIHENFOLGE & INTERAKTIVES ABSTECKEN ---
function startInteractiveWiring(strId) {
    wiringSettings.layoutMode = 'manual';
    wiringSettings.interactiveActive = true;
    wiringSettings.interactiveTargetStringId = strId;
    wiringSettings.interactiveQueue = [];
    saveWiringSettings();
    renderWiringTab();
}

function handlePanelWiringClick(strId, panelIdx) {
    if (wiringSettings.interactiveActive && wiringSettings.interactiveTargetStringId === strId) {
        const str = strings.find(s => s.id === strId);
        const total = (str?.fields || []).reduce((a, f) => a + (parseInt(f.count) || 0), 0);
        
        const q = wiringSettings.interactiveQueue;
        const existsIdx = q.indexOf(panelIdx);
        if (existsIdx >= 0) {
            // Wenn das zuletzt geklickte Modul angeklickt wird: Undo
            if (existsIdx === q.length - 1) {
                q.pop();
            }
        } else {
            q.push(panelIdx);
            if (q.length === total) {
                // Alle Module verbunden
                wiringSettings.customSequences[strId] = [...q];
                wiringSettings.interactiveActive = false;
            }
        }
        saveWiringSettings();
        renderWiringTab();
        return;
    }
    highlightWiringPanel(panelIdx);
}

function undoInteractiveStep() {
    if (wiringSettings.interactiveQueue && wiringSettings.interactiveQueue.length > 0) {
        wiringSettings.interactiveQueue.pop();
        saveWiringSettings();
        renderWiringTab();
    }
}

function finishInteractiveWiring(strId, totalPanels) {
    const q = wiringSettings.interactiveQueue || [];
    for (let i = 0; i < totalPanels; i++) {
        if (!q.includes(i)) q.push(i);
    }
    wiringSettings.customSequences[strId] = [...q];
    wiringSettings.interactiveActive = false;
    wiringSettings.interactiveQueue = [];
    saveWiringSettings();
    renderWiringTab();
}

function cancelInteractiveWiring() {
    wiringSettings.interactiveActive = false;
    wiringSettings.interactiveQueue = [];
    saveWiringSettings();
    renderWiringTab();
}

function invertWiringSequence(strId, totalPanels) {
    let seq = wiringSettings.customSequences[strId];
    if (!Array.isArray(seq) || seq.length !== totalPanels) {
        seq = Array.from({ length: totalPanels }, (_, i) => i);
    }
    seq.reverse();
    wiringSettings.customSequences[strId] = seq;
    wiringSettings.layoutMode = 'manual';
    saveWiringSettings();
    renderWiringTab();
}

function resetWiringToLeapfrog(strId, totalPanels) {
    const str = strings.find(s => s.id === strId);
    if (str && str.fields && str.fields.length > 0) {
        wiringSettings.customSequences[strId] = getMultiFieldSequence(str, 'leapfrog');
    } else {
        wiringSettings.customSequences[strId] = getLeapfrogOrder(totalPanels);
    }
    wiringSettings.layoutMode = 'manual';
    saveWiringSettings();
    renderWiringTab();
}

function resetWiringToLinear(strId, totalPanels) {
    const str = strings.find(s => s.id === strId);
    if (str && str.fields && str.fields.length > 0) {
        wiringSettings.customSequences[strId] = getMultiFieldSequence(str, 'simple');
    } else {
        wiringSettings.customSequences[strId] = Array.from({ length: totalPanels }, (_, i) => i);
    }
    wiringSettings.layoutMode = 'manual';
    saveWiringSettings();
    renderWiringTab();
}

function shiftWiringSequenceItem(strId, seqIdx, dir) {
    const seq = wiringSettings.customSequences[strId];
    if (!seq || !seq.length) return;
    const targetIdx = seqIdx + dir;
    if (targetIdx < 0 || targetIdx >= seq.length) return;
    const temp = seq[seqIdx];
    seq[seqIdx] = seq[targetIdx];
    seq[targetIdx] = temp;
    wiringSettings.layoutMode = 'manual';
    saveWiringSettings();
    renderWiringTab();
}

// --- HINDERNIS-LOGIK (FENSTER, GAUBEN, KAMINE, LEERFLÄCHEN) ---
function toggleObstacleEditor() {
    wiringSettings.showObstacleEditor = !wiringSettings.showObstacleEditor;
    saveWiringSettings();
    renderWiringTab();
}

function addRoofObstacle(strId, type, row, col, label, fieldIdx = 0) {
    if (!wiringSettings.customRoofLayouts[strId]) {
        wiringSettings.customRoofLayouts[strId] = { obstacles: [] };
    }
    const obList = wiringSettings.customRoofLayouts[strId].obstacles || [];
    const r = Math.max(0, parseInt(row) || 0);
    const c = Math.max(0, parseInt(col) || 0);
    const fIdx = Math.max(0, parseInt(fieldIdx) || 0);
    
    // Vorhandenes an gleicher Stelle überschreiben
    const existIdx = obList.findIndex(o => (o.fieldIdx === undefined ? 0 : o.fieldIdx) === fIdx && o.row === r && o.col === c);
    const item = {
        id: Date.now(),
        fieldIdx: fIdx,
        row: r,
        col: c,
        type: type || 'window',
        label: label || (type === 'window' ? 'Dachfenster' : (type === 'dormer' ? 'Gaube' : (type === 'chimney' ? 'Kamin' : 'Leerfeld')))
    };
    if (existIdx >= 0) {
        obList[existIdx] = item;
    } else {
        obList.push(item);
    }
    wiringSettings.customRoofLayouts[strId].obstacles = obList;
    saveWiringSettings();
    renderWiringTab();
}

function removeRoofObstacle(strId, obId) {
    if (wiringSettings.customRoofLayouts[strId]?.obstacles) {
        wiringSettings.customRoofLayouts[strId].obstacles = wiringSettings.customRoofLayouts[strId].obstacles.filter(o => o.id !== obId);
        saveWiringSettings();
        renderWiringTab();
    }
}

function clearAllRoofObstacles(strId) {
    if (wiringSettings.customRoofLayouts[strId]) {
        wiringSettings.customRoofLayouts[strId].obstacles = [];
        saveWiringSettings();
        renderWiringTab();
    }
}

// Exakte Berechnung der VDE-Leitungsparameter
// Physikalische Berechnungen für DC-Leitung, Spannungsabfall und VDE-Norm
function calculateCablePhysics(str, settings, positions = null, sequence = null) {
    const fields = (str && str.fields && str.fields.length > 0) ? str.fields : [{ id: 1, name: 'Hauptdach', count: 6, cols: 3, rows: 2, tilt: 30 }];
    const totalPanels = fields.reduce((acc, f) => acc + (parseInt(f.count) || 0), 0);
    const pModel = (fields[0]) ? (flatPanels.find(x => x.id === parseInt(fields[0].panelId)) || { vmp: 32.5, imp: 13.5, pmax: 440 }) : { vmp: 32.5, imp: 13.5, pmax: 440 };
    
    const vmpTotal = fields.reduce((acc, f) => {
        const p = flatPanels.find(x => x.id === parseInt(f.panelId)) || pModel;
        return acc + (p.vmp * (parseInt(f.count) || 0));
    }, 0) || (totalPanels * 32.5);
    
    const imp = pModel.imp || 13.5;
    const pTotalWp = fields.reduce((acc, f) => {
        const p = flatPanels.find(x => x.id === parseInt(f.panelId)) || pModel;
        return acc + (p.pmax * (parseInt(f.count) || 0));
    }, 0) || (totalPanels * 440);

    // 1. Weg A: WR zu Feld 1
    const wegA = getWiringWegA(str.id);

    // 2. Weg B: Feld X zu WR
    const wegB = getWiringWegB(str.id);

    // 3. Brücken zwischen den Feldern
    const numBridges = Math.max(0, fields.length - 1);
    const bridgeDetails = [];
    let sumFieldBridges = 0;
    for (let b = 0; b < numBridges; b++) {
        const bLen = getWiringBridgeLength(str.id, b);
        const fromName = fields[b]?.name || `Feld ${b + 1}`;
        const toName = fields[b + 1]?.name || `Feld ${b + 2}`;
        bridgeDetails.push({
            idx: b,
            from: fromName,
            to: toName,
            length: bLen
        });
        sumFieldBridges += bLen;
    }

    // 4. Pauschal 2m Kabel pro Panel
    const panelCablePerUnit = parseFloat(settings.panelCableRate) || 2.0;
    const panelCableTotal = totalPanels * panelCablePerUnit;

    // Gesamtlänge des Kabels im String (exakt nach Kundenformel: Weg A + Weg B + Brücken + 2m * Module)
    const rawCableLength = wegA + sumFieldBridges + panelCableTotal + wegB;
    const totalCableLength = Math.ceil(rawCableLength * 1.1); // 10% Reserve

    const crossSection = parseFloat(settings.cableCrossSection) || 6;
    const temp = parseFloat(settings.cableTemp) || 50;

    // Spezifischer Widerstand rho von Kupfer bei Temperatur
    const rho = 0.01786 * (1 + 0.00393 * (temp - 20));
    const loopResistance = (rho * rawCableLength) / crossSection;

    const deltaU = imp * loopResistance;
    const deltaUPct = vmpTotal > 0 ? (deltaU / vmpTotal) * 100 : 0;
    const powerLossW = Math.pow(imp, 2) * loopResistance;
    const annualLossKWh = (powerLossW * 950) / 1000;

    let loopAreaM2 = 0;
    let loopSafety = 'optimal';
    if (settings.layoutMode === 'simple') {
        loopAreaM2 = Math.round(totalPanels * 1.85);
        loopSafety = 'warning';
    } else if (settings.layoutMode === 'loop_reduced') {
        loopAreaM2 = Math.round(totalPanels * 0.15 * 10) / 10;
        loopSafety = 'acceptable';
    } else if (settings.layoutMode === 'manual') {
        loopAreaM2 = Math.round(totalPanels * 0.35 * 10) / 10;
        loopSafety = loopAreaM2 > 5 ? 'warning' : 'acceptable';
    } else {
        loopAreaM2 = 0.1;
        loopSafety = 'optimal';
    }

    let vdeStatus = 'green';
    let vdeText = 'Optimal (< 1,0 % nach DIN VDE 0100-712)';
    let vdeBadgeClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    if (deltaUPct > 1.5) {
        vdeStatus = 'red';
        vdeText = 'Unzulässig hoch (> 1,5 % VDE-Grenzwert)! Querschnitt vergrößern.';
        vdeBadgeClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
    } else if (deltaUPct > 1.0) {
        vdeStatus = 'yellow';
        vdeText = 'Zulässig (1,0 - 1,5 %), Querschnittserhöhung empfohlen.';
        vdeBadgeClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
    }

    const mc4Pairs = Math.max(2, totalPanels + 1 + numBridges);
    const zipTies = Math.ceil(totalPanels * 4 + (wegA + wegB) * 2);

    return {
        totalPanels,
        vmpTotal,
        imp,
        pTotalWp,
        lengthWrOneWay: wegA,
        wegA,
        wegB,
        numBridges,
        sumFieldBridges,
        bridgeDetails,
        panelCablePerUnit,
        panelCableTotal,
        rawCableLength,
        totalCableLength,
        crossSection,
        temp,
        loopResistance,
        deltaU,
        deltaUPct,
        powerLossW,
        annualLossKWh,
        loopAreaM2,
        loopSafety,
        vdeStatus,
        vdeText,
        vdeBadgeClass,
        mc4Pairs,
        zipTies
    };
}

// Generierung des interaktiven SVG-Schaltplans mit Modulfeldern, Brücken & Hindernissen
function generateStringWiringSvg(str, settings) {
    const fields = (str.fields && str.fields.length > 0) ? str.fields : [{ id: 1, name: 'Hauptdach', count: 6, cols: 3, rows: 2, tilt: 30 }];
    const totalPanels = fields.reduce((acc, f) => acc + (parseInt(f.count) || 0), 0);
    if (totalPanels === 0) return '';

    const isPortrait = settings.orientation === 'portrait';
    const pw = isPortrait ? 96 : 144;
    const ph = isPortrait ? 144 : 96;
    const gapX = 24;
    const gapY = 32;

    const invWidth = 145;
    const invHeight = 220;
    const invX = 30;
    const invY = 50;

    const fieldBridgeGap = 110;
    let curFieldX = invX + invWidth + 80;
    const fieldContainers = [];
    const positions = [];
    const obstaclesPos = [];
    let globalPanelIdx = 0;

    const strLayout = settings.customRoofLayouts[str.id] || { obstacles: [] };
    const obstacles = strLayout.obstacles || [];

    fields.forEach((f, fIdx) => {
        const fCount = parseInt(f.count) || 1;
        const fCols = Math.max(1, parseInt(f.cols) || Math.min(fCount, 4) || 4);
        const fRows = Math.max(1, parseInt(f.rows) || Math.ceil(fCount / fCols));
        const fName = f.name || `Feld ${fIdx + 1}`;
        const fModel = flatPanels.find(p => p.id === parseInt(f.panelId)) || flatPanels[0] || { pmax: 440, vmp: 32.5, imp: 13.5 };

        const contentW = fCols * pw + (fCols - 1) * gapX;
        const contentH = fRows * ph + (fRows - 1) * gapY;
        const padX = 22;
        const headerH = 46;
        const padB = 20;

        const boxW = Math.max(220, contentW + (padX * 2));
        const boxH = headerH + contentH + padB;
        const boxX = curFieldX;
        const boxY = 40;

        fieldContainers.push({
            fieldIdx: fIdx,
            id: f.id,
            name: fName,
            count: fCount,
            cols: fCols,
            rows: fRows,
            tilt: f.tilt || 30,
            model: fModel,
            x: boxX,
            y: boxY,
            w: boxW,
            h: boxH,
            headerH: headerH,
            padX: padX,
            contentW: contentW,
            contentH: contentH
        });

        // Module in diesem Feld platzieren
        let r = 0, c = 0;
        for (let localIdx = 0; localIdx < fCount; localIdx++) {
            const x = boxX + padX + c * (pw + gapX);
            const y = boxY + headerH + r * (ph + gapY);

            positions.push({
                idx: globalPanelIdx,
                fieldIdx: fIdx,
                fieldId: f.id,
                fieldName: fName,
                fieldShort: `F${fIdx + 1}`,
                localIdx: localIdx,
                labelNum: globalPanelIdx + 1,
                localLabel: `F${fIdx + 1}-${localIdx + 1}`,
                model: fModel,
                tilt: f.tilt || 30,
                x: x,
                y: y,
                w: pw,
                h: ph,
                row: r,
                col: c,
                plusX: x + (pw * 0.32),
                plusY: y + 14,
                minusX: x + (pw * 0.68),
                minusY: y + 14,
                centerX: x + pw / 2,
                centerY: y + ph / 2
            });

            globalPanelIdx++;
            c++;
            if (c >= fCols) {
                c = 0;
                r++;
            }
        }

        // Hindernisse für dieses Feld zuordnen
        obstacles.filter(ob => (ob.fieldIdx === undefined ? fIdx === 0 : ob.fieldIdx === fIdx)).forEach(ob => {
            const obX = boxX + padX + (ob.col || 0) * (pw + gapX);
            const obY = boxY + headerH + (ob.row || 0) * (ph + gapY);
            obstaclesPos.push({
                ...ob,
                x: obX,
                y: obY,
                w: pw,
                h: ph
            });
        });

        curFieldX += boxW + fieldBridgeGap;
    });

    const totalCanvasW = Math.max(920, curFieldX - fieldBridgeGap + 60);
    const maxBoxH = Math.max(...fieldContainers.map(b => b.h), invHeight);
    const totalCanvasH = Math.max(380, maxBoxH + 110);

    const dcPlusTerm = { x: invX + invWidth - 10, y: invY + 70 };
    const dcMinusTerm = { x: invX + invWidth - 10, y: invY + 115 };
    const peTerm = { x: invX + invWidth - 10, y: invY + 160 };

    const isInteractive = settings.interactiveActive && settings.interactiveTargetStringId === str.id;
    let sequence = [];

    if (isInteractive) {
        sequence = [...(settings.interactiveQueue || [])];
    } else if (settings.layoutMode === 'manual') {
        const custom = settings.customSequences[str.id];
        if (Array.isArray(custom) && custom.length === totalPanels) {
            sequence = [...custom];
        } else {
            sequence = getMultiFieldSequence(str, 'simple');
        }
    } else if (settings.layoutMode === 'leapfrog') {
        sequence = getMultiFieldSequence(str, 'leapfrog');
    } else {
        sequence = getMultiFieldSequence(str, 'simple');
    }

    const inverter = flatInverters.find(i => i.id === parseInt(str.inverterId)) || { name: 'Wechselrichter' };
    const stringColor = str.color || '#3b82f6';
    const isAnim = settings.showCurrentAnimation;

    const wegA = getWiringWegA(str.id);
    const wegB = getWiringWegB(str.id);

    // Kabelpfade, Badges und Brückenverbindungen
    const wirePaths = [];
    const stepBadges = [];
    const routeBadges = [];

    if (sequence.length > 0) {
        // 1. Zuleitung Weg A: WR DC+ -> Erstes Modul Plus
        const firstPos = positions[sequence[0]];
        if (firstPos) {
            const dcPlusPath = `M ${dcPlusTerm.x} ${dcPlusTerm.y} C ${dcPlusTerm.x + 40} ${dcPlusTerm.y}, ${firstPos.plusX - 40} ${firstPos.plusY - 20}, ${firstPos.plusX} ${firstPos.plusY}`;
            wirePaths.push({
                d: dcPlusPath,
                type: 'dc-plus',
                color: '#ef4444',
                label: `Weg A: WR → ${firstPos.fieldName} #${firstPos.localIdx + 1} (${wegA} m)`,
                step: 0
            });

            // Weg A Längenbadge
            const badgeAx = (dcPlusTerm.x + firstPos.plusX) / 2;
            const badgeAy = Math.min(dcPlusTerm.y, firstPos.plusY) - 15;
            routeBadges.push({
                x: badgeAx,
                y: badgeAy,
                label: `Weg A: ${wegA} m (DC+)`,
                type: 'wegA',
                color: '#ef4444',
                bgColor: '#1e1b4b',
                textColor: '#fca5a5'
            });
        }

        // 2. Modul-zu-Modul Verbindungen (inklusive Feld-Brücken)
        for (let k = 0; k < sequence.length - 1; k++) {
            const fromPos = positions[sequence[k]];
            const toPos = positions[sequence[k + 1]];
            if (!fromPos || !toPos) continue;

            const x1 = fromPos.minusX;
            const y1 = fromPos.minusY;
            const x2 = toPos.plusX;
            const y2 = toPos.plusY;
            const stepNum = k + 1;

            let d = '';
            let midX = (x1 + x2) / 2;
            let midY = (y1 + y2) / 2;
            const isBridgeTransition = fromPos.fieldIdx !== toPos.fieldIdx;

            if (isBridgeTransition) {
                // Brücke zwischen zwei Feldern!
                const bIdx = Math.min(fromPos.fieldIdx, toPos.fieldIdx);
                const bLen = getWiringBridgeLength(str.id, bIdx);
                const arch = -45;
                d = `M ${x1} ${y1} C ${x1 + 45} ${y1 + arch}, ${x2 - 45} ${y2 + arch}, ${x2} ${y2}`;
                midY = (y1 + y2) / 2 + arch + 10;

                wirePaths.push({
                    d,
                    type: 'field-bridge',
                    color: '#f59e0b',
                    label: `Feld-Brücke: ${fromPos.fieldName} → ${toPos.fieldName} (${bLen} m)`,
                    step: stepNum,
                    from: sequence[k],
                    to: sequence[k + 1]
                });
            } else if (fromPos.row === toPos.row && Math.abs(fromPos.col - toPos.col) <= 1) {
                const arch = -24;
                d = `M ${x1} ${y1} C ${x1 + 10} ${y1 + arch}, ${x2 - 10} ${y2 + arch}, ${x2} ${y2}`;
                midY = y1 + arch + 4;

                wirePaths.push({
                    d,
                    type: 'module-wire',
                    color: stringColor,
                    label: `Steckung #${stepNum}`,
                    step: stepNum,
                    from: sequence[k],
                    to: sequence[k + 1]
                });
            } else {
                const curveOffset = fromPos.col > toPos.col ? -35 : 35;
                d = `M ${x1} ${y1} C ${x1} ${y1 + 40}, ${x2 + curveOffset} ${y2 - 40}, ${x2} ${y2}`;

                wirePaths.push({
                    d,
                    type: 'module-wire',
                    color: stringColor,
                    label: `Steckung #${stepNum}`,
                    step: stepNum,
                    from: sequence[k],
                    to: sequence[k + 1]
                });
            }

            stepBadges.push({
                x: midX,
                y: midY,
                step: stepNum,
                isBridge: isBridgeTransition
            });
        }

        // 3. Rückleitung Weg B: Letztes Modul Minus -> WR DC-
        if (!isInteractive || sequence.length === totalPanels) {
            const lastPos = positions[sequence[sequence.length - 1]];
            if (lastPos) {
                const dcMinusPath = `M ${lastPos.minusX} ${lastPos.minusY} C ${lastPos.minusX - 40} ${lastPos.minusY + 50}, ${dcMinusTerm.x + 50} ${dcMinusTerm.y + 40}, ${dcMinusTerm.x} ${dcMinusTerm.y}`;

                wirePaths.push({
                    d: dcMinusPath,
                    type: 'dc-minus',
                    color: '#3b82f6',
                    label: `Weg B: ${lastPos.fieldName} #${lastPos.localIdx + 1} → WR (${wegB} m)`,
                    step: sequence.length
                });

                // Weg B Längenbadge
                const badgeBx = (lastPos.minusX + dcMinusTerm.x) / 2;
                const badgeBy = Math.max(lastPos.minusY, dcMinusTerm.y) + 30;
                routeBadges.push({
                    x: badgeBx,
                    y: badgeBy,
                    label: `Weg B: ${wegB} m (DC-)`,
                    type: 'wegB',
                    color: '#3b82f6',
                    bgColor: '#0f172a',
                    textColor: '#93c5fd'
                });
            }
        }
    }

    // Status / Zertifikat SVG
    let loopAreaSvg = `
        <g transform="translate(${invX + invWidth + 80}, 16)">
            <rect width="360" height="24" rx="12" fill="#064e3b" stroke="#10b981" stroke-width="1.2" opacity="0.95" />
            <text x="180" y="16" text-anchor="middle" fill="#6ee7b7" font-size="10.5" font-weight="700">
                🛡️ DIN VDE 0100-712 • ${fields.length} Modulfeld${fields.length > 1 ? 'er' : ''} • ${totalPanels} Module
            </text>
        </g>
    `;

    return `
    <svg viewBox="0 0 ${totalCanvasW} ${totalCanvasH}" class="w-full h-auto select-none rounded-2xl bg-slate-900/90 border border-slate-800 shadow-inner" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <pattern id="wiringGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" stroke-width="0.5" opacity="0.25" />
            </pattern>
            <linearGradient id="invGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#1e293b"/>
                <stop offset="100%" stop-color="#0f172a"/>
            </linearGradient>
            <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#0f172a"/>
                <stop offset="50%" stop-color="#1e293b"/>
                <stop offset="100%" stop-color="#0b1329"/>
            </linearGradient>
            <filter id="wireGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.6"/>
            </filter>
            <style>
                @keyframes dcFlow {
                    from { stroke-dashoffset: 40; }
                    to { stroke-dashoffset: 0; }
                }
                .flow-active {
                    animation: dcFlow 1.2s linear infinite;
                }
                @keyframes pulseNext {
                    0%, 100% { stroke-opacity: 1; stroke-width: 2.5; }
                    50% { stroke-opacity: 0.4; stroke-width: 4; }
                }
                .pulse-candidate {
                    animation: pulseNext 1.4s ease-in-out infinite;
                }
            </style>
        </defs>

        <!-- Blueprint Grid Hintergrund -->
        <rect width="100%" height="100%" fill="url(#wiringGrid)" />

        <!-- Status / Zertifikat -->
        ${loopAreaSvg}

        <!-- WECHSELRICHTER (INVERTER) SYMBOL -->
        <g id="inverter-symbol" transform="translate(${invX}, ${invY})">
            <rect width="${invWidth}" height="${invHeight}" rx="14" fill="url(#invGrad)" stroke="#475569" stroke-width="2" filter="url(#wireGlow)" />
            
            <rect x="0" y="0" width="${invWidth}" height="38" rx="14" fill="#334155" />
            <rect x="0" y="24" width="${invWidth}" height="14" fill="#334155" />
            <circle cx="18" cy="19" r="4.5" fill="#10b981" />
            <circle cx="18" cy="19" r="8" fill="#10b981" opacity="0.3" class="animate-ping" />
            <text x="32" y="23" fill="#f8fafc" font-size="11" font-weight="800" letter-spacing="0.5">WECHSELRICHTER</text>

            <rect x="12" y="48" width="${invWidth - 24}" height="76" rx="8" fill="#020617" stroke="#1e293b" stroke-width="1.5" />
            <text x="20" y="66" fill="#38bdf8" font-size="9.5" font-weight="700">${inverter.name.slice(0, 16)}</text>
            <text x="20" y="82" fill="#94a3b8" font-size="9">Eingang: <tspan fill="#f8fafc" font-weight="700">MPPT ${str.mpptId || 1}</tspan></text>
            <text x="20" y="98" fill="#94a3b8" font-size="9">Spannung: <tspan fill="#34d399" font-weight="700">${Math.round(str._phys?.vmpHot || 380)} V</tspan></text>
            <text x="20" y="114" fill="#94a3b8" font-size="8.5">Status: <tspan fill="#38bdf8">TRACKING</tspan></text>

            <!-- DC+ Klemme (Rot) -->
            <g transform="translate(${invWidth - 20}, 70)">
                <circle cx="0" cy="0" r="10" fill="#ef4444" stroke="#991b1b" stroke-width="1.5" />
                <text x="0" y="4" fill="#fff" font-size="12" font-weight="900" text-anchor="middle">+</text>
                <text x="-24" y="3.5" fill="#f87171" font-size="8.5" font-weight="800" text-anchor="end">DC+</text>
            </g>

            <!-- DC- Klemme (Blau) -->
            <g transform="translate(${invWidth - 20}, 115)">
                <circle cx="0" cy="0" r="10" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1.5" />
                <text x="0" y="4" fill="#fff" font-size="13" font-weight="900" text-anchor="middle">-</text>
                <text x="-24" y="3.5" fill="#60a5fa" font-size="8.5" font-weight="800" text-anchor="end">DC-</text>
            </g>

            <!-- PE / Schutzleiter Klemme -->
            <g transform="translate(${invWidth - 20}, 160)">
                <circle cx="0" cy="0" r="8" fill="#eab308" stroke="#854d0e" stroke-width="1.2" />
                <text x="0" y="3" fill="#000" font-size="8" font-weight="800" text-anchor="middle">PE</text>
                <text x="-24" y="3" fill="#facc15" font-size="8" font-weight="700" text-anchor="end">Erde</text>
            </g>

            <text x="${invWidth / 2}" y="${invHeight - 12}" fill="#64748b" font-size="8" text-anchor="middle">VDE 0100-712</text>
        </g>

        <!-- MODULFELDER-KORRIDORE & DACHFLÄCHEN -->
        <g id="field-containers-layer">
            ${fieldContainers.map((b, fIdx) => `
                <g id="field-box-${b.id}">
                    <!-- Feldrahmen / Dachbereich -->
                    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="#070d1e" stroke="#1e293b" stroke-width="1.8" filter="url(#wireGlow)" />
                    
                    <!-- Feld-Kopfzeile -->
                    <rect x="${b.x}" y="${b.y}" width="${b.w}" height="36" rx="14" fill="#1e293b" opacity="0.9" />
                    <rect x="${b.x}" y="${b.y + 22}" width="${b.w}" height="14" fill="#1e293b" opacity="0.9" />
                    <text x="${b.x + 14}" y="${b.y + 22}" fill="#38bdf8" font-size="11" font-weight="900" letter-spacing="0.5">
                        ${b.name.toUpperCase()} (FELD ${fIdx + 1})
                    </text>
                    <text x="${b.x + b.w - 14}" y="${b.y + 22}" fill="#94a3b8" font-size="9" font-weight="700" text-anchor="end">
                        ${b.count} Mod. • ${b.cols}×${b.rows} • ${b.tilt}° • ${(b.count * (b.model.pmax || 440) / 1000).toFixed(2)} kWp
                    </text>

                    <!-- Aluminium-Montageschienen hinter den Modulen -->
                    ${Array.from({ length: b.rows }).map((_, rIdx) => {
                        const railY1 = b.y + b.headerH + rIdx * (ph + gapY) + ph * 0.25;
                        const railY2 = b.y + b.headerH + rIdx * (ph + gapY) + ph * 0.75;
                        return `
                            <line x1="${b.x + 10}" y1="${railY1}" x2="${b.x + b.w - 10}" y2="${railY1}" stroke="#334155" stroke-width="3.5" opacity="0.45" />
                            <line x1="${b.x + 10}" y1="${railY2}" x2="${b.x + b.w - 10}" y2="${railY2}" stroke="#334155" stroke-width="3.5" opacity="0.45" />
                        `;
                    }).join('')}
                </g>
            `).join('')}
        </g>

        <!-- BRÜCKEN ZWISCHEN DEN MODULFELDERN (VISUELLER KABELKANAL / TRASSE) -->
        <g id="field-bridges-layer">
            ${fieldContainers.slice(0, -1).map((bFrom, idx) => {
                const bTo = fieldContainers[idx + 1];
                const bridgeStartX = bFrom.x + bFrom.w;
                const bridgeEndX = bTo.x;
                const bridgeMidX = (bridgeStartX + bridgeEndX) / 2;
                const bridgeY = bFrom.y + 55;
                const bLen = getWiringBridgeLength(str.id, idx);

                return `
                <g id="bridge-${idx}">
                    <!-- Verbindungstrasse gepunktet -->
                    <line x1="${bridgeStartX + 4}" y1="${bridgeY}" x2="${bridgeEndX - 4}" y2="${bridgeY}" stroke="#f59e0b" stroke-width="2.2" stroke-dasharray="6,4" opacity="0.65" />
                    
                    <!-- Brücken-Längenbadge mit Klick-Bearbeitung -->
                    <g class="cursor-pointer" onclick="promptEditBridgeLength(${str.id}, ${idx}, ${bLen})">
                        <rect x="${bridgeMidX - 52}" y="${bridgeY - 14}" width="104" height="28" rx="8" fill="#1e293b" stroke="#f59e0b" stroke-width="1.6" filter="url(#wireGlow)" />
                        <text x="${bridgeMidX}" y="${bridgeY + 4}" fill="#fbbf24" font-size="9.5" font-weight="900" text-anchor="middle">
                            ⚡ Brücke: ${bLen.toFixed(1)} m
                        </text>
                    </g>
                </g>
                `;
            }).join('')}
        </g>

        <!-- HINDERNISSE-EBENE (FENSTER, GAUBEN, KAMINE, LEERFLÄCHEN) -->
        <g id="obstacles-layer">
            ${obstaclesPos.map(ob => {
                if (ob.type === 'window') {
                    return `
                    <g id="obstacle-${ob.id}" transform="translate(${ob.x}, ${ob.y})">
                        <rect width="${ob.w}" height="${ob.h}" rx="6" fill="#0b1329" stroke="#38bdf8" stroke-width="1.5" />
                        <rect x="6" y="6" width="${ob.w - 12}" height="${ob.h - 12}" rx="3" fill="#0284c7" fill-opacity="0.18" stroke="#0284c7" stroke-width="1" />
                        <line x1="${ob.w / 2}" y1="6" x2="${ob.w / 2}" y2="${ob.h - 6}" stroke="#64748b" stroke-width="1.5" />
                        <line x1="6" y1="${ob.h * 0.45}" x2="${ob.w - 6}" y2="${ob.h * 0.45}" stroke="#64748b" stroke-width="1.5" />
                        <rect x="${ob.w * 0.1}" y="${ob.h - 22}" width="${ob.w * 0.8}" height="16" rx="3" fill="#0f172a" fill-opacity="0.9" stroke="#334155" stroke-width="0.8" />
                        <text x="${ob.w / 2}" y="${ob.h - 11}" fill="#38bdf8" font-size="8" font-weight="700" text-anchor="middle">${ob.label || 'Dachfenster'}</text>
                    </g>
                    `;
                } else if (ob.type === 'dormer') {
                    return `
                    <g id="obstacle-${ob.id}" transform="translate(${ob.x}, ${ob.y})">
                        <rect width="${ob.w}" height="${ob.h}" rx="6" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5" />
                        <polygon points="8,${ob.h - 14} ${ob.w / 2},12 ${ob.w - 8},${ob.h - 14}" fill="#334155" stroke="#f59e0b" stroke-width="1" />
                        <rect x="${ob.w * 0.1}" y="${ob.h - 22}" width="${ob.w * 0.8}" height="16" rx="3" fill="#0f172a" fill-opacity="0.9" />
                        <text x="${ob.w / 2}" y="${ob.h - 11}" fill="#fbbf24" font-size="8.5" font-weight="700" text-anchor="middle">${ob.label || 'Gaube'}</text>
                    </g>
                    `;
                } else if (ob.type === 'chimney') {
                    return `
                    <g id="obstacle-${ob.id}" transform="translate(${ob.x}, ${ob.y})">
                        <rect width="${ob.w}" height="${ob.h}" rx="6" fill="#1c1917" stroke="#78716c" stroke-width="1.5" />
                        <rect x="12" y="12" width="${ob.w - 24}" height="${ob.h - 24}" rx="3" fill="#7f1d1d" stroke="#b91c1c" stroke-width="1" />
                        <ellipse cx="${ob.w / 2}" cy="${ob.h / 2}" rx="10" ry="7" fill="#0c0a09" stroke="#991b1b" stroke-width="1" />
                        <rect x="${ob.w * 0.1}" y="${ob.h - 22}" width="${ob.w * 0.8}" height="16" rx="3" fill="#0f172a" fill-opacity="0.9" />
                        <text x="${ob.w / 2}" y="${ob.h - 11}" fill="#fca5a5" font-size="8.5" font-weight="700" text-anchor="middle">${ob.label || 'Kamin'}</text>
                    </g>
                    `;
                } else {
                    return `
                    <g id="obstacle-${ob.id}" transform="translate(${ob.x}, ${ob.y})">
                        <rect width="${ob.w}" height="${ob.h}" rx="6" fill="#0f172a" stroke="#334155" stroke-width="1" stroke-dasharray="4,4" opacity="0.55" />
                        <text x="${ob.w / 2}" y="${ob.h / 2 + 3}" fill="#64748b" font-size="8.5" font-weight="600" text-anchor="middle">${ob.label || 'Leerfeld'}</text>
                    </g>
                    `;
                }
            }).join('')}
        </g>

        <!-- KABELWEGE (WIRES & LEITUNGSFÜHRUNG) -->
        <g id="wires-layer" filter="url(#wireGlow)">
            ${wirePaths.map(w => {
                const isDCMinus = w.type === 'dc-minus';
                const isBridge = w.type === 'field-bridge';
                const strokeDash = isDCMinus ? '8,4' : (isBridge ? 'none' : (isAnim ? '12,6' : 'none'));
                const strokeWidth = isBridge ? 4.5 : (isDCMinus ? 3.5 : 3.8);
                const flowClass = isAnim ? 'flow-active' : '';
                return `
                    <path d="${w.d}" fill="none" stroke="${w.color}" stroke-width="${strokeWidth}" 
                          stroke-linecap="round" stroke-linejoin="round"
                          stroke-dasharray="${strokeDash}" class="${flowClass}">
                        <title>${w.label}</title>
                    </path>
                `;
            }).join('')}
        </g>

        <!-- ROUTEN-BADGES (WEG A & WEG B LÄNGENANZEIGE) -->
        <g id="route-badges-layer">
            ${routeBadges.map(rb => `
                <g transform="translate(${rb.x}, ${rb.y})">
                    <rect x="-65" y="-12" width="130" height="24" rx="6" fill="${rb.bgColor}" stroke="${rb.color}" stroke-width="1.4" filter="url(#wireGlow)" />
                    <text x="0" y="4.5" fill="${rb.textColor}" font-size="9" font-weight="800" text-anchor="middle">${rb.label}</text>
                </g>
            `).join('')}
        </g>

        <!-- STECKREIHENFOLGE-NUMMERN (STEP BADGES AUF KABELN) -->
        ${settings.showWireNumbers ? stepBadges.map(b => `
            <g transform="translate(${b.x}, ${b.y})">
                <circle cx="0" cy="0" r="${b.isBridge ? 11 : 9}" fill="#0f172a" stroke="${b.isBridge ? '#f59e0b' : stringColor}" stroke-width="2" />
                <text x="0" y="3.5" fill="${b.isBridge ? '#fbbf24' : '#f8fafc'}" font-size="${b.isBridge ? '9' : '8.5'}" font-weight="800" text-anchor="middle">${b.step}</text>
            </g>
        `).join('') : ''}

        <!-- SOLAR-MODULE IN DEN FELDERN -->
        <g id="panels-layer">
            ${positions.map(p => {
                const isHigh = settings.highlightPanelIdx === p.idx;
                const seqStepIdx = sequence.indexOf(p.idx);
                const isConnected = seqStepIdx >= 0;

                let strokeCol = '#475569';
                let strokeW = 1.5;
                let extraClass = '';

                if (isInteractive) {
                    if (isConnected) {
                        strokeCol = '#10b981';
                        strokeW = 2.5;
                    } else if (sequence.length === 0 || seqStepIdx === -1) {
                        strokeCol = '#38bdf8';
                        strokeW = 2;
                        extraClass = 'pulse-candidate';
                    }
                } else if (isHigh) {
                    strokeCol = '#38bdf8';
                    strokeW = 3;
                }

                return `
                <g id="panel-${p.idx}" transform="translate(${p.x}, ${p.y})" class="cursor-pointer transition-transform" onclick="handlePanelWiringClick(${str.id}, ${p.idx})">
                    <!-- Modul-Rahmen (Aluminium) -->
                    <rect width="${p.w}" height="${p.h}" rx="6" fill="url(#panelGrad)" stroke="${strokeCol}" stroke-width="${strokeW}" class="${extraClass}" filter="url(#wireGlow)" />
                    
                    <!-- Solarzellen / Sub-Wafer Linien -->
                    <g stroke="#334155" stroke-width="0.6" opacity="0.65">
                        <line x1="${p.w * 0.33}" y1="0" x2="${p.w * 0.33}" y2="${p.h}" />
                        <line x1="${p.w * 0.66}" y1="0" x2="${p.w * 0.66}" y2="${p.h}" />
                        <line x1="0" y1="${p.h * 0.25}" x2="${p.w}" y2="${p.h * 0.25}" />
                        <line x1="0" y1="${p.h * 0.5}" x2="${p.w}" y2="${p.h * 0.5}" />
                        <line x1="0" y1="${p.h * 0.75}" x2="${p.w}" y2="${p.h * 0.75}" />
                    </g>

                    <!-- Feld & Modul-Nummer Badge (Oben Links) -->
                    <rect x="5" y="5" width="34" height="16" rx="4" fill="#0f172a" stroke="#64748b" stroke-width="1" />
                    <text x="22" y="16.5" fill="#38bdf8" font-size="8.5" font-weight="900" text-anchor="middle">${p.localLabel}</text>

                    <!-- Wenn manuell vergeben: Reihenfolge-Badge oben rechts -->
                    ${isConnected ? `
                        <rect x="${p.w - 29}" y="5" width="24" height="16" rx="4" fill="#064e3b" stroke="#10b981" stroke-width="1.2" />
                        <text x="${p.w - 17}" y="16.5" fill="#6ee7b7" font-size="9" font-weight="900" text-anchor="middle">${seqStepIdx + 1}</text>
                    ` : (isInteractive ? `
                        <rect x="${p.w - 29}" y="5" width="24" height="16" rx="4" fill="#1e293b" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2,2" />
                        <text x="${p.w - 17}" y="16.5" fill="#38bdf8" font-size="8.5" font-weight="700" text-anchor="middle">?</text>
                    ` : '')}

                    <!-- Anschlussdose (Junction Box) mit MC4-Klemmen -->
                    <rect x="${p.w * 0.22}" y="6" width="${p.w * 0.56}" height="16" rx="4" fill="#020617" stroke="#334155" stroke-width="1" />

                    <!-- Pluspol (+) Klemme (Rot) -->
                    <circle cx="${p.w * 0.32}" cy="14" r="6" fill="#ef4444" stroke="#991b1b" stroke-width="1" />
                    <text x="${p.w * 0.32}" y="17" fill="#fff" font-size="8.5" font-weight="900" text-anchor="middle">+</text>

                    <!-- Minuspol (-) Klemme (Blau/Schwarz) -->
                    <circle cx="${p.w * 0.68}" cy="14" r="6" fill="#3b82f6" stroke="#1d4ed8" stroke-width="1" />
                    <text x="${p.w * 0.68}" y="17" fill="#fff" font-size="10" font-weight="900" text-anchor="middle">-</text>

                    <!-- Modul-Beschriftung im Zentrum -->
                    <text x="${p.w / 2}" y="${p.h - 18}" fill="#94a3b8" font-size="8" font-weight="700" text-anchor="middle">${p.model.pmax || 440} Wp</text>
                    <text x="${p.w / 2}" y="${p.h - 8}" fill="#64748b" font-size="7.5" text-anchor="middle">${p.model.vmp || 32.5}V | ${p.tilt}°</text>
                </g>
                `;
            }).join('')}
        </g>
    </svg>
    `;
}

// Haupt-Renderfunktion des neuen Tabs "Verkabelung"
function renderWiringTab() {
    const container = document.getElementById('tab-verkabelung');
    if (!container) return;

    if (strings.length === 0) {
        container.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-800 shadow-sm max-w-xl mx-auto space-y-4">
                <div class="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <span class="material-symbols-rounded text-3xl">cable</span>
                </div>
                <h3 class="text-xl font-extrabold text-slate-800 dark:text-slate-100">Noch keine Strings angelegt</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">
                    Um die Verkabelung, Kabelwege und Leitungsverluste nach VDE visualisieren zu können, lege bitte zuerst mindestens einen PV-String im Tab "Strings" an.
                </p>
                <div class="pt-2">
                    <button onclick="addDemoStringIfEmpty()" class="bg-primary hover:bg-primary-hover text-white font-bold px-6 py-3 rounded-2xl shadow transition-all inline-flex items-center gap-2 text-sm">
                        <span class="material-symbols-rounded text-lg">add_circle</span> Standard-String anlegen (12x 440W)
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // Welcher String soll dargestellt werden?
    let activeStrings = [];
    if (wiringSettings.selectedStringId === 'all') {
        activeStrings = [...strings];
    } else {
        const found = strings.find(s => s.id === wiringSettings.selectedStringId);
        activeStrings = found ? [found] : [strings[0]];
    }

    const primaryStr = activeStrings[0] || strings[0];
    const calc = calculateCablePhysics(primaryStr, wiringSettings);

    container.innerHTML = `
        <!-- HEADER & CONTROL BAR -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <div class="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <span class="material-symbols-rounded text-2xl">cable</span>
                    </div>
                    <div>
                        <h2 class="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                            Kabelwege & String-Visualisierung
                            <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">VDE 0100-712</span>
                        </h2>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Interaktiver DC-Schaltplan, Leiterschleifenminimierung (DIN EN 62305-3) & Leitungsverlust-Analyse
                        </p>
                    </div>
                </div>
                
                <div class="flex items-center gap-2 self-start md:self-auto">
                    <button onclick="printWiringPlan()" class="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-300 dark:border-slate-700">
                        <span class="material-symbols-rounded text-base">print</span>
                        <span>Drucken / PDF</span>
                    </button>
                </div>
            </div>

            <!-- STRING-SELEKTOR & SCHNELL-FILTER -->
            <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span class="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
                    <span class="material-symbols-rounded text-sm">filter_alt</span> String:
                </span>
                <button onclick="setWiringString('all')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${wiringSettings.selectedStringId === 'all' ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}">
                    <span class="material-symbols-rounded text-sm">dashboard</span> Alle Strings (${strings.length})
                </button>
                ${strings.map((s, idx) => `
                    <button onclick="setWiringString(${s.id})" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${wiringSettings.selectedStringId === s.id ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${s.color || '#3b82f6'};"></span>
                        <span>${s.name || ('String ' + (idx + 1))}</span>
                        <span class="text-[10px] opacity-75 font-normal">(${(s.fields || []).reduce((a, f) => a + (parseInt(f.count) || 0), 0)} Mod.)</span>
                    </button>
                `).join('')}
            </div>

            <!-- KONFIGURATIONS-LEISTE FÜR DIE VERKABELUNG -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <!-- 1. Verlegemethode -->
                <div>
                    <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                        <span class="material-symbols-rounded text-sm text-primary">alt_route</span> Verlegemethode (VDE):
                    </label>
                    <select onchange="setWiringLayout(this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-medium text-slate-800 dark:text-slate-200 outline-none">
                        <option value="leapfrog" ${wiringSettings.layoutMode === 'leapfrog' ? 'selected' : ''}>Reißverschluss (Leap-Frog) - Schleifenfrei</option>
                        <option value="loop_reduced" ${wiringSettings.layoutMode === 'loop_reduced' ? 'selected' : ''}>Reihe + Paralleler Rückleiter im Profil</option>
                        <option value="simple" ${wiringSettings.layoutMode === 'simple' ? 'selected' : ''}>Standard Reihenschaltung (Offene Schleife)</option>
                        <option value="manual" ${wiringSettings.layoutMode === 'manual' ? 'selected' : ''}>✏️ Manuelle Zuweisung (Zerstückeltes Dach / Gauben)</option>
                    </select>
                </div>

                <!-- 2. Dach-Matrix & Modulausrichtung -->
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">Ausrichtung:</label>
                        <select onchange="setWiringOrientation(this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-medium text-slate-800 dark:text-slate-200 outline-none">
                            <option value="portrait" ${wiringSettings.orientation === 'portrait' ? 'selected' : ''}>Hochkant</option>
                            <option value="landscape" ${wiringSettings.orientation === 'landscape' ? 'selected' : ''}>Querformat</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">Spalten:</label>
                        <select onchange="setWiringColumns(this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 font-medium text-slate-800 dark:text-slate-200 outline-none">
                            <option value="auto" ${wiringSettings.columns === 'auto' ? 'selected' : ''}>Auto</option>
                            <option value="1" ${wiringSettings.columns === '1' ? 'selected' : ''}>1 Reihe</option>
                            <option value="2" ${wiringSettings.columns === '2' ? 'selected' : ''}>2 Spalten</option>
                            <option value="3" ${wiringSettings.columns === '3' ? 'selected' : ''}>3 Spalten</option>
                            <option value="4" ${wiringSettings.columns === '4' ? 'selected' : ''}>4 Spalten</option>
                            <option value="6" ${wiringSettings.columns === '6' ? 'selected' : ''}>6 Spalten</option>
                            <option value="8" ${wiringSettings.columns === '8' ? 'selected' : ''}>8 Spalten</option>
                            <option value="10" ${wiringSettings.columns === '10' ? 'selected' : ''}>10 Spalten</option>
                        </select>
                    </div>
                </div>

                <!-- 3. Dach-Hindernisse Button (Gauben, Fenster, Kamine) -->
                <div>
                    <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                        <span class="material-symbols-rounded text-sm text-amber-500">roofing</span> Dach-Hindernisse:
                    </label>
                    <button onclick="toggleObstacleEditor()" class="w-full py-2 px-3 rounded-xl font-bold transition-all border flex items-center justify-between ${wiringSettings.showObstacleEditor ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                        <span class="flex items-center gap-1.5">
                            <span class="material-symbols-rounded text-base">window</span>
                            <span>Gauben & Fenster</span>
                        </span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold">
                            ${(wiringSettings.customRoofLayouts[primaryStr.id]?.obstacles || []).length}
                        </span>
                    </button>
                </div>

                <!-- 4. Toggles für Darstellung -->
                <div class="flex items-center justify-between md:justify-end gap-3 pt-4 md:pt-0">
                    <label class="flex items-center gap-1.5 cursor-pointer font-bold text-slate-600 dark:text-slate-300">
                        <input type="checkbox" ${wiringSettings.showCurrentAnimation ? 'checked' : ''} onchange="toggleWiringAnimation()" class="rounded border-slate-300 text-primary focus:ring-primary">
                        <span>Fluss animieren</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer font-bold text-slate-600 dark:text-slate-300">
                        <input type="checkbox" ${wiringSettings.showWireNumbers ? 'checked' : ''} onchange="toggleWiringNumbers()" class="rounded border-slate-300 text-primary focus:ring-primary">
                        <span>Steckreihenfolge</span>
                    </label>
                </div>
            </div>

            <!-- HINDERNIS-VERWALTUNG (GAUBEN, DACHFENSTER, KAMINE, AUSSPARUNGEN) -->
            ${wiringSettings.showObstacleEditor ? `
            <div class="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-3 text-xs">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 dark:border-amber-800/40 pb-2.5">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-rounded text-amber-600 dark:text-amber-400 text-lg">home_repair_service</span>
                        <div>
                            <h4 class="font-extrabold text-slate-900 dark:text-white">Dach-Hindernisse für ${primaryStr.name || 'String 1'}</h4>
                            <p class="text-[11px] text-slate-500 dark:text-slate-400">Positioniere Fenster, Gauben oder Kamine im Dachraster. Die PV-Module weichen diesen Zellen automatisch aus.</p>
                        </div>
                    </div>
                    <button onclick="clearAllRoofObstacles(${primaryStr.id})" class="text-rose-600 dark:text-rose-400 hover:underline font-bold text-[11px] flex items-center gap-1 self-start sm:self-auto">
                        <span class="material-symbols-rounded text-sm">delete_sweep</span> Alle Hindernisse leeren
                    </button>
                </div>

                <!-- Formular zum Hinzufügen eines Hindernisses -->
                <div class="grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-end">
                    <div>
                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Typ:</label>
                        <select id="ob_type_input" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-medium outline-none">
                            <option value="window">Dachfenster (Velux)</option>
                            <option value="dormer">Gaube</option>
                            <option value="chimney">Kamin / Schornstein</option>
                            <option value="empty">Leerfläche / Aussparung</option>
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Modulfeld:</label>
                        <select id="ob_field_input" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-medium outline-none">
                            ${(primaryStr.fields || []).map((f, fIdx) => `
                                <option value="${fIdx}">Feld ${fIdx + 1}: ${f.name || ('Feld ' + (fIdx + 1))}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Reihe (0 = oben):</label>
                        <input type="number" id="ob_row_input" min="0" max="15" value="0" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none">
                    </div>
                    <div>
                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Spalte (0 = links):</label>
                        <input type="number" id="ob_col_input" min="0" max="15" value="1" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none">
                    </div>
                    <div>
                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Bezeichnung:</label>
                        <input type="text" id="ob_label_input" placeholder="z. B. Gaube Ost" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-medium outline-none">
                    </div>
                    <div>
                        <button onclick="addRoofObstacle(${primaryStr.id}, document.getElementById('ob_type_input').value, document.getElementById('ob_row_input').value, document.getElementById('ob_col_input').value, document.getElementById('ob_label_input').value, document.getElementById('ob_field_input')?.value || 0)" class="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-1">
                            <span class="material-symbols-rounded text-base">add</span> Platzieren
                        </button>
                    </div>
                </div>

                <!-- Liste der aktuell platzierten Hindernisse -->
                ${(wiringSettings.customRoofLayouts[primaryStr.id]?.obstacles || []).length > 0 ? `
                <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/40 dark:border-amber-800/30">
                    <span class="font-bold text-slate-500">Platzierte Elemente:</span>
                    ${(wiringSettings.customRoofLayouts[primaryStr.id]?.obstacles || []).map(ob => {
                        const fName = (primaryStr.fields && primaryStr.fields[ob.fieldIdx !== undefined ? ob.fieldIdx : 0]) ? primaryStr.fields[ob.fieldIdx !== undefined ? ob.fieldIdx : 0].name : `Feld ${(ob.fieldIdx !== undefined ? ob.fieldIdx : 0) + 1}`;
                        return `
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 shadow-2xs">
                            <span class="material-symbols-rounded text-xs text-amber-500">${ob.type === 'window' ? 'window' : (ob.type === 'dormer' ? 'roofing' : (ob.type === 'chimney' ? 'fireplace' : 'check_box_outline_blank'))}</span>
                            <span>${ob.label}</span>
                            <span class="text-slate-400 font-normal">[${fName} - R${ob.row} : S${ob.col}]</span>
                            <button onclick="removeRoofObstacle(${primaryStr.id}, ${ob.id})" class="text-slate-400 hover:text-rose-500 transition-colors ml-0.5">
                                <span class="material-symbols-rounded text-sm">close</span>
                            </button>
                        </span>
                        `;
                    }).join('')}
                </div>
                ` : `
                <div class="text-[11px] text-slate-500 dark:text-slate-400 italic">
                    Noch keine Hindernisse platziert. Füge oben ein Dachfenster oder eine Gaube hinzu, um das zerstückelte Dach nachzubilden.
                </div>
                `}
            </div>
            ` : ''}
        </div>

        <!-- SCHALTPLAN / SVG-CONTAINER -->
        ${activeStrings.map((s, sIdx) => {
            const totalMod = (s.fields || []).reduce((a, f) => a + (parseInt(f.count) || 0), 0);
            const inv = flatInverters.find(i => i.id === parseInt(s.inverterId)) || { name: 'Wechselrichter' };
            const svgContent = generateStringWiringSvg(s, wiringSettings);
            const isInteractive = wiringSettings.interactiveActive && wiringSettings.interactiveTargetStringId === s.id;

            // Reihenfolge für diesen String
            let currentSeq = [];
            if (isInteractive) {
                currentSeq = [...(wiringSettings.interactiveQueue || [])];
            } else if (wiringSettings.layoutMode === 'manual') {
                const custom = wiringSettings.customSequences[s.id];
                if (Array.isArray(custom) && custom.length === totalMod) {
                    currentSeq = [...custom];
                } else {
                    currentSeq = getMultiFieldSequence(s, 'simple');
                }
            } else if (wiringSettings.layoutMode === 'leapfrog') {
                currentSeq = getMultiFieldSequence(s, 'leapfrog');
            } else {
                currentSeq = getMultiFieldSequence(s, 'simple');
            }

            const sCalc = calculateCablePhysics(s, wiringSettings, null, currentSeq);

            return `
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                <!-- STRING HEADER -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div class="flex items-center gap-2.5">
                        <span class="w-3.5 h-3.5 rounded-full shrink-0" style="background-color: ${s.color || '#3b82f6'};"></span>
                        <h3 class="text-base md:text-lg font-extrabold text-slate-900 dark:text-white">
                            ${s.name || ('String ' + (sIdx + 1))}
                        </h3>
                        <span class="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            ${totalMod} Module (${(sCalc.pTotalWp / 1000).toFixed(2)} kWp)
                        </span>
                        ${wiringSettings.layoutMode === 'manual' ? `
                            <span class="text-[11px] font-extrabold px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                ✏️ Manuelle Zuweisung
                            </span>
                        ` : ''}
                    </div>

                    <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>WR: <strong class="text-slate-800 dark:text-slate-200">${inv.name.slice(0, 18)}</strong></span>
                        <span>•</span>
                        <span>MPPT: <strong class="text-slate-800 dark:text-slate-200">MPPT ${s.mpptId || 1}</strong></span>
                        <span>•</span>
                        <span>$U_{mpp}$: <strong class="text-emerald-600 dark:text-emerald-400">${Math.round(sCalc.vmpTotal)} V</strong></span>
                        <span>•</span>
                        <span>$I_{mpp}$: <strong class="text-sky-600 dark:text-sky-400">${sCalc.imp.toFixed(1)} A</strong></span>
                    </div>
                </div>

                <!-- 1. MODULFELDER DIESES STRINGS (DIREKT BEARBEITBAR MIT REIHEN/SPALTEN) -->
                <div class="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3.5">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-rounded text-primary text-lg">grid_view</span>
                            <div>
                                <h4 class="font-extrabold text-xs md:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                                    Modulfelder & Dachaufbau (${(s.fields || []).length} Feld${(s.fields || []).length > 1 ? 'er' : ''})
                                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary">Zerstückeltes Dach</span>
                                </h4>
                                <p class="text-[11px] text-slate-500 dark:text-slate-400">
                                    Passe Reihen und Spalten pro Feld an. Brücken verbinden getrennte Dachflächen (Gauben, Fenster, Firste).
                                </p>
                            </div>
                        </div>
                        <button onclick="addFieldInWiring(${s.id})" class="bg-primary hover:bg-primary-hover text-white text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                            <span class="material-symbols-rounded text-base">add_circle</span> Weiteres Feld anlegen (z.B. Gaube)
                        </button>
                    </div>

                    <!-- FELDER-GRID MIT ZWISCHENBRÜCKEN -->
                    <div class="space-y-3">
                        ${(s.fields || []).map((f, fIdx) => {
                            const fCols = parseInt(f.cols) || 4;
                            const fRows = parseInt(f.rows) || Math.ceil((parseInt(f.count) || 1) / fCols);
                            const nextField = s.fields[fIdx + 1];
                            const bridgeLen = getWiringBridgeLength(s.id, fIdx);

                            return `
                            <!-- FELD-KARTE -->
                            <div class="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-700/80 shadow-2xs space-y-3">
                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-2">
                                    <div class="flex items-center gap-2">
                                        <span class="w-6 h-6 rounded-lg bg-primary/10 text-primary font-black text-xs flex items-center justify-center">
                                            F${fIdx + 1}
                                        </span>
                                        <input type="text" value="${f.name || ('Feld ' + (fIdx + 1))}" onchange="updateFieldInWiring(${s.id}, ${f.id}, 'name', this.value)" class="font-extrabold text-xs text-slate-800 dark:text-slate-100 bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-primary focus:border-primary outline-none px-1 py-0.5" title="Feldname bearbeiten">
                                        <span class="text-[11px] text-slate-400 font-medium">(${f.count} Module)</span>
                                    </div>
                                    ${(s.fields || []).length > 1 ? `
                                        <button onclick="removeFieldInWiring(${s.id}, ${f.id})" class="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all self-end sm:self-auto" title="Feld löschen">
                                            <span class="material-symbols-rounded text-sm">delete</span> Feld entfernen
                                        </button>
                                    ` : ''}
                                </div>

                                <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                                    <div>
                                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Modulanzahl:</label>
                                        <input type="number" min="1" max="60" value="${f.count}" onchange="updateFieldInWiring(${s.id}, ${f.id}, 'count', this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-black text-primary outline-none">
                                    </div>
                                    <div>
                                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Spalten (Breite):</label>
                                        <input type="number" min="1" max="16" value="${fCols}" onchange="updateFieldInWiring(${s.id}, ${f.id}, 'cols', this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none">
                                    </div>
                                    <div>
                                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Reihen (Höhe):</label>
                                        <input type="number" min="1" max="16" value="${fRows}" onchange="updateFieldInWiring(${s.id}, ${f.id}, 'rows', this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none">
                                    </div>
                                    <div>
                                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Neigung (°):</label>
                                        <input type="number" min="0" max="90" value="${f.tilt || 30}" onchange="updateFieldInWiring(${s.id}, ${f.id}, 'tilt', this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none">
                                    </div>
                                    <div>
                                        <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">Modul-Modell:</label>
                                        <select onchange="updateFieldInWiring(${s.id}, ${f.id}, 'panelId', this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 font-medium outline-none truncate">
                                            ${flatPanels.map(p => `
                                                <option value="${p.id}" ${parseInt(f.panelId) === p.id ? 'selected' : ''}>${p.pmax}Wp - ${p.name.slice(0, 16)}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- BRÜCKE ZUM NÄCHSTEN FELD (FALLS VORHANDEN) -->
                            ${nextField ? `
                            <div class="flex items-center gap-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
                                <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                    <span class="material-symbols-rounded text-lg">alt_route</span>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex flex-wrap items-center justify-between gap-2">
                                        <span class="font-extrabold text-slate-900 dark:text-slate-100">
                                            Brücke: <strong class="text-amber-600 dark:text-amber-400">${f.name || ('Feld ' + (fIdx + 1))}</strong> ➔ <strong class="text-amber-600 dark:text-amber-400">${nextField.name || ('Feld ' + (fIdx + 2))}</strong>
                                        </span>
                                        <div class="flex items-center gap-1.5">
                                            <span class="font-bold text-slate-600 dark:text-slate-300">Brückenlänge:</span>
                                            <input type="number" min="0.5" max="60" step="0.5" value="${bridgeLen}" onchange="setWiringBridgeLength(${s.id}, ${fIdx}, this.value)" class="w-16 bg-white dark:bg-slate-900 border border-amber-500/40 rounded-lg px-2 py-1 font-black text-amber-600 dark:text-amber-400 text-center outline-none">
                                            <span class="font-bold text-slate-500">m</span>
                                        </div>
                                    </div>
                                    <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        DC-Verbindungskabel über Gaubenkehle, First oder Wandvorsprung zwischen den getrennten Modulfeldern.
                                    </p>
                                </div>
                            </div>
                            ` : ''}
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- 2. KABELWEG-KALKULATOR & TRANSPARENTE FORMEL -->
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-rounded text-emerald-600 dark:text-emerald-400 text-lg">straighten</span>
                            <h4 class="font-extrabold text-xs md:text-sm text-slate-900 dark:text-white">
                                Kabelwege-Kalkulator & Gesamtlänge (String ${sIdx + 1})
                            </h4>
                        </div>
                        <span class="text-[11px] font-bold text-slate-500">
                            Pauschal: 2,0 m Kabel pro PV-Modul
                        </span>
                    </div>

                    <!-- 4 WEGSTRECKEN-KACHELN -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <!-- WEG A -->
                        <div class="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-rose-500 flex items-center gap-1">
                                    <span class="w-2 h-2 rounded-full bg-rose-500"></span> Weg A (Hinweg)
                                </span>
                                <div class="flex items-center gap-1">
                                    <input type="number" min="1" max="150" step="0.5" value="${sCalc.wegA}" onchange="setWiringWegA(${s.id}, this.value)" class="w-14 text-right font-black border border-slate-200 dark:border-slate-700 dark:bg-slate-950 rounded-md px-1.5 py-0.5 text-xs text-rose-500 outline-none">
                                    <span class="font-bold text-slate-400 text-[10px]">m</span>
                                </div>
                            </div>
                            <p class="text-[10px] text-slate-500 dark:text-slate-400">
                                DC+ Hinleiter: WR zu Feld 1 (#1 Plus)
                            </p>
                        </div>

                        <!-- BRÜCKEN -->
                        <div class="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-amber-500 flex items-center gap-1">
                                    <span class="w-2 h-2 rounded-full bg-amber-500"></span> Feld-Brücken
                                </span>
                                <span class="font-black text-xs text-amber-500">
                                    ${sCalc.sumFieldBridges.toFixed(1)} m
                                </span>
                            </div>
                            <p class="text-[10px] text-slate-500 dark:text-slate-400">
                                ${sCalc.numBridges > 0 ? `${sCalc.numBridges} Brücke${sCalc.numBridges === 1 ? '' : 'n'} zwischen Feldern` : 'Keine Brücken (einzelnes Feld)'}
                            </p>
                        </div>

                        <!-- MODULKABEL-PAUSCHALE -->
                        <div class="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-primary flex items-center gap-1">
                                    <span class="w-2 h-2 rounded-full bg-primary"></span> Modulkabel
                                </span>
                                <span class="font-black text-xs text-primary">
                                    ${sCalc.panelCableTotal.toFixed(1)} m
                                </span>
                            </div>
                            <p class="text-[10px] text-slate-500 dark:text-slate-400">
                                ${totalMod} Module × 2,0 m Pauschale
                            </p>
                        </div>

                        <!-- WEG B -->
                        <div class="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-sky-500 flex items-center gap-1">
                                    <span class="w-2 h-2 rounded-full bg-sky-500"></span> Weg B (Rückweg)
                                </span>
                                <div class="flex items-center gap-1">
                                    <input type="number" min="1" max="150" step="0.5" value="${sCalc.wegB}" onchange="setWiringWegB(${s.id}, this.value)" class="w-14 text-right font-black border border-slate-200 dark:border-slate-700 dark:bg-slate-950 rounded-md px-1.5 py-0.5 text-xs text-sky-500 outline-none">
                                    <span class="font-bold text-slate-400 text-[10px]">m</span>
                                </div>
                            </div>
                            <p class="text-[10px] text-slate-500 dark:text-slate-400">
                                DC- Rückleiter: Feld ${(s.fields || []).length} zurück zum WR
                            </p>
                        </div>
                    </div>

                    <!-- FORMEL-SUMMENLEISTE -->
                    <div class="p-3 rounded-xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div class="space-y-0.5">
                            <p class="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                <span class="material-symbols-rounded text-base text-primary">functions</span>
                                Formel: Weg A (${sCalc.wegA} m) + Brücken (${sCalc.sumFieldBridges} m) + Modulkabel (${sCalc.panelCableTotal} m) + Weg B (${sCalc.wegB} m)
                            </p>
                            <p class="text-[11px] text-slate-500 dark:text-slate-400">
                                Exakte Leitungslänge im String: <strong>${sCalc.rawCableLength.toFixed(1)} m</strong> (+ 10% Installationsreserve: <strong>${sCalc.totalCableLength} m</strong>)
                            </p>
                        </div>
                        <div class="text-right self-end sm:self-auto">
                            <span class="text-[10px] font-bold text-slate-500 uppercase block">Gesamtkabel String</span>
                            <span class="text-base md:text-lg font-black text-primary">${sCalc.totalCableLength} m</span>
                        </div>
                    </div>
                </div>

                <!-- MANUELLE ZUWEISUNG / INTERAKTIVE STEUERUNG -->
                <div class="p-3.5 rounded-2xl ${isInteractive ? 'bg-sky-500/10 border-2 border-sky-500' : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800'} space-y-3">
                    ${isInteractive ? `
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div class="flex items-center gap-2">
                                <span class="w-3 h-3 rounded-full bg-sky-500 animate-ping shrink-0"></span>
                                <div>
                                    <p class="font-extrabold text-sky-700 dark:text-sky-300 text-sm">
                                        Schritt ${currentSeq.length + 1} von ${totalMod}: Klicke das nächste Modul an
                                    </p>
                                    <p class="text-[11px] text-slate-500 dark:text-slate-400">
                                        Klicke die PV-Module auf dem Schaltplan in der gewünschten Steckreihenfolge an (${currentSeq.length}/${totalMod} verbunden).
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 self-end sm:self-auto">
                                <button onclick="undoInteractiveStep()" ${currentSeq.length === 0 ? 'disabled' : ''} class="px-3 py-1.5 rounded-xl font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 flex items-center gap-1 transition-all">
                                    <span class="material-symbols-rounded text-sm">undo</span> Rückgängig
                                </button>
                                <button onclick="finishInteractiveWiring(${s.id}, ${totalMod})" class="px-3.5 py-1.5 rounded-xl font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1 transition-all">
                                    <span class="material-symbols-rounded text-sm">check</span> Fertigstellen
                                </button>
                                <button onclick="cancelInteractiveWiring()" class="px-3 py-1.5 rounded-xl font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                                    Abbrechen
                                </button>
                            </div>
                        </div>
                    ` : `
                        <div class="flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-rounded text-base text-primary">route</span>
                                <span class="font-bold text-slate-800 dark:text-slate-200">Reihenfolge der Modulverkabelung:</span>
                                <span class="text-slate-500 font-medium">(${wiringSettings.layoutMode === 'manual' ? 'Benutzerdefiniert' : (wiringSettings.layoutMode === 'leapfrog' ? 'Leap-Frog Automatik' : 'Reihen-Automatik')})</span>
                            </div>

                            <div class="flex flex-wrap items-center gap-2">
                                <button onclick="startInteractiveWiring(${s.id})" class="px-3 py-1.5 rounded-xl font-extrabold bg-primary hover:bg-primary-hover text-white shadow-sm flex items-center gap-1.5 transition-all text-xs">
                                    <span class="material-symbols-rounded text-sm">touch_app</span> Interaktiv per Klick abstecken
                                </button>
                                <button onclick="invertWiringSequence(${s.id}, ${totalMod})" title="Reihenfolge umkehren" class="px-2.5 py-1.5 rounded-xl font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 text-xs">
                                    <span class="material-symbols-rounded text-sm">swap_horiz</span> Umkehren
                                </button>
                                <button onclick="resetWiringToLeapfrog(${s.id}, ${totalMod})" title="Auf Leap-Frog Reißverschluss zurücksetzen" class="px-2.5 py-1.5 rounded-xl font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 text-xs">
                                    <span class="material-symbols-rounded text-sm">shuffle</span> Leap-Frog
                                </button>
                                <button onclick="resetWiringToLinear(${s.id}, ${totalMod})" title="Auf fortlaufende Reihe zurücksetzen" class="px-2.5 py-1.5 rounded-xl font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 text-xs">
                                    <span class="material-symbols-rounded text-sm">linear_scale</span> In Reihe
                                </button>
                            </div>
                        </div>
                    `}

                    <!-- VISUELLER REIHENFOLGE-STRANG MIT FEIN-JUSTIERUNG (PFEILE) -->
                    <div class="pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                        <div class="flex items-center gap-2 overflow-x-auto pb-1 text-[11px]">
                            <span class="font-bold text-slate-500 shrink-0 flex items-center gap-1">
                                <span class="material-symbols-rounded text-sm text-rose-500">arrow_forward</span> DC+ WR
                            </span>
                            ${currentSeq.map((panelIdx, posIdx) => {
                                // Berechne Feld- und Modul-Label für panelIdx
                                let rem = panelIdx;
                                let fNum = 1;
                                let lNum = panelIdx + 1;
                                for (let fi = 0; fi < (s.fields || []).length; fi++) {
                                    const cnt = parseInt(s.fields[fi].count) || 0;
                                    if (rem < cnt) {
                                        fNum = fi + 1;
                                        lNum = rem + 1;
                                        break;
                                    }
                                    rem -= cnt;
                                }
                                return `
                                <div class="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold shrink-0 shadow-2xs">
                                    <span class="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] flex items-center justify-center font-black text-slate-500">${posIdx + 1}</span>
                                    <span>F${fNum}-${lNum}</span>
                                    ${wiringSettings.layoutMode === 'manual' ? `
                                        <button onclick="shiftWiringSequenceItem(${s.id}, ${posIdx}, -1)" ${posIdx === 0 ? 'disabled' : ''} class="text-slate-400 hover:text-primary disabled:opacity-20 px-0.5" title="Nach links verschieben">
                                            ◀
                                        </button>
                                        <button onclick="shiftWiringSequenceItem(${s.id}, ${posIdx}, 1)" ${posIdx === currentSeq.length - 1 ? 'disabled' : ''} class="text-slate-400 hover:text-primary disabled:opacity-20 px-0.5" title="Nach rechts verschieben">
                                            ▶
                                        </button>
                                    ` : ''}
                                </div>
                                ${posIdx < currentSeq.length - 1 ? '<span class="text-slate-400 font-bold">→</span>' : ''}
                                `;
                            }).join('')}
                            <span class="font-bold text-slate-500 shrink-0 flex items-center gap-1">
                                → DC- WR <span class="material-symbols-rounded text-sm text-blue-500">arrow_forward</span>
                            </span>
                        </div>
                    </div>
                </div>

                <!-- SVG SCHALTPLAN -->
                <div class="w-full overflow-x-auto rounded-2xl">
                    ${svgContent}
                </div>

                <!-- LEGENDE & HINWEISE -->
                <div class="flex flex-wrap items-center justify-between gap-3 pt-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    <div class="flex flex-wrap items-center gap-4">
                        <span class="flex items-center gap-1.5 font-bold">
                            <span class="w-3 h-1 bg-rose-500 rounded-full inline-block"></span> DC+ Hinleiter (Rot)
                        </span>
                        <span class="flex items-center gap-1.5 font-bold">
                            <span class="w-3 h-1 bg-blue-500 rounded-full inline-block border-t border-dashed"></span> DC- Rückleiter (Blau/Schwarz)
                        </span>
                        <span class="flex items-center gap-1.5 font-bold">
                            <span class="w-3 h-1 rounded-full inline-block" style="background-color: ${s.color || '#3b82f6'};"></span> Modul-Brücke
                        </span>
                        <span class="flex items-center gap-1.5">
                            <span class="w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[8px] font-black inline-flex items-center justify-center">+</span> Pluspol
                        </span>
                        <span class="flex items-center gap-1.5">
                            <span class="w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[8px] font-black inline-flex items-center justify-center">-</span> Minuspol
                        </span>
                        <span class="flex items-center gap-1.5">
                            <span class="w-3.5 h-3.5 rounded-full bg-amber-500/20 text-amber-500 text-[8px] font-black inline-flex items-center justify-center border border-amber-500/40">G</span> Gauben / Fenster
                        </span>
                    </div>
                    <div class="font-medium text-slate-400">
                        Klicke auf ein Modul oder nutze "Interaktiv abstecken", um die Zuweisung festzulegen.
                    </div>
                </div>
            </div>
            `;
        }).join('')}

        <!-- DC-KABELANALYSE & VDE 0100-712 BERECHNUNG -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- RECHNER & PARAMETER -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-rounded text-primary">electrical_services</span>
                        DC-Leitungsberechnung (VDE 0100-712)
                    </h3>
                    <span class="text-xs font-bold px-2.5 py-0.5 rounded-full border ${calc.vdeBadgeClass}">
                        ${calc.vdeStatus === 'green' ? 'Normgerecht' : (calc.vdeStatus === 'yellow' ? 'Prüfen' : 'Kritisch')}
                    </span>
                </div>

                <!-- Schieberegler Kabelweg -->
                <div class="space-y-2">
                    <div class="flex justify-between items-center text-xs">
                        <span class="font-bold text-slate-700 dark:text-slate-300">Kabelweg einfach zum Wechselrichter:</span>
                        <div class="flex items-center gap-1">
                            <input type="number" min="1" max="150" value="${calc.lengthWrOneWay}" onchange="setWiringCableLength(this.value)" class="w-16 text-right font-black border border-slate-200 dark:border-slate-700 dark:bg-slate-950 rounded-lg px-2 py-1 text-sm outline-none text-primary">
                            <span class="font-bold text-slate-500">m</span>
                        </div>
                    </div>
                    <input type="range" min="2" max="80" step="1" value="${calc.lengthWrOneWay}" oninput="setWiringCableLength(this.value)" class="w-full cursor-pointer accent-primary">
                    <div class="flex justify-between text-[10px] text-slate-400">
                        <span>2 m (Dachzentrale)</span>
                        <span>15 m (Standard Haus)</span>
                        <span>40 m (Keller/Außen)</span>
                    </div>
                </div>

                <!-- Kabelquerschnitt & Temperatur -->
                <div class="grid grid-cols-2 gap-4 pt-1">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Kabelquerschnitt:</label>
                        <div class="grid grid-cols-3 gap-1.5">
                            <button onclick="setWiringCrossSection(4)" class="py-2 text-xs font-black rounded-xl border transition-all ${calc.crossSection === 4 ? 'bg-primary text-white border-primary shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}">4 mm²</button>
                            <button onclick="setWiringCrossSection(6)" class="py-2 text-xs font-black rounded-xl border transition-all ${calc.crossSection === 6 ? 'bg-primary text-white border-primary shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}">6 mm²</button>
                            <button onclick="setWiringCrossSection(10)" class="py-2 text-xs font-black rounded-xl border transition-all ${calc.crossSection === 10 ? 'bg-primary text-white border-primary shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}">10 mm²</button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Betriebstemperatur:</label>
                        <div class="grid grid-cols-2 gap-1.5">
                            <button onclick="setWiringTemp(25)" class="py-2 text-xs font-bold rounded-xl border transition-all ${calc.temp === 25 ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}">25°C (Labor)</button>
                            <button onclick="setWiringTemp(50)" class="py-2 text-xs font-bold rounded-xl border transition-all ${calc.temp === 50 ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}">50°C (Dach)</button>
                        </div>
                    </div>
                </div>

                <!-- KPI-KACHELN FÜR VERLUSTE -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div class="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                        <span class="text-[10px] font-bold text-slate-500 uppercase block">Spannungsabfall</span>
                        <span class="text-base font-black ${calc.vdeStatus === 'green' ? 'text-emerald-600 dark:text-emerald-400' : (calc.vdeStatus === 'yellow' ? 'text-amber-500' : 'text-rose-500')}">
                            ${calc.deltaUPct.toFixed(2)} %
                        </span>
                        <span class="text-[10px] text-slate-400 block">${calc.deltaU.toFixed(1)} Volt</span>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                        <span class="text-[10px] font-bold text-slate-500 uppercase block">Verlustleistung</span>
                        <span class="text-base font-black text-slate-800 dark:text-slate-100">
                            ${Math.round(calc.powerLossW)} W
                        </span>
                        <span class="text-[10px] text-slate-400 block">bei Nennstrom</span>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                        <span class="text-[10px] font-bold text-slate-500 uppercase block">Widerstand R</span>
                        <span class="text-base font-black text-slate-800 dark:text-slate-100">
                            ${calc.loopResistance.toFixed(2)} Ω
                        </span>
                        <span class="text-[10px] text-slate-400 block">Schleife gesamt</span>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                        <span class="text-[10px] font-bold text-slate-500 uppercase block">Jahresverlust</span>
                        <span class="text-base font-black text-slate-800 dark:text-slate-100">
                            ${calc.annualLossKWh.toFixed(1)} kWh
                        </span>
                        <span class="text-[10px] text-slate-400 block">pro Jahr</span>
                    </div>
                </div>

                <div class="p-3.5 rounded-2xl border ${calc.vdeBadgeClass} flex items-start gap-2.5">
                    <span class="material-symbols-rounded text-lg mt-0.5 shrink-0">
                        ${calc.vdeStatus === 'green' ? 'check_circle' : (calc.vdeStatus === 'yellow' ? 'info' : 'warning')}
                    </span>
                    <div class="text-xs">
                        <p class="font-bold">${calc.vdeText}</p>
                        <p class="text-[11px] opacity-80 mt-0.5">DIN VDE 0100-712 empfiehlt einen relativen Spannungsabfall auf der DC-Seite von unter 1,0 %.</p>
                    </div>
                </div>
            </div>

            <!-- MONTAGE-STÜCKLISTE & MATERIALZUG -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-rounded text-primary">checklist</span>
                        Montage-Stückliste & Kabelzug
                    </h3>
                    <span class="text-xs font-bold text-slate-500">Für Installateur</span>
                </div>

                <div class="space-y-3 text-xs">
                    <!-- Kabelbedarf -->
                    <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div class="flex items-center gap-2.5">
                            <span class="material-symbols-rounded text-emerald-500 text-xl">cable</span>
                            <div>
                                <p class="font-bold text-slate-800 dark:text-slate-200">DC-Solarkabel (H1Z2Z2-K, ${calc.crossSection} mm²)</p>
                                <p class="text-[10px] text-slate-400">Inkl. 10 % Verschnitt & Biegungsreserve</p>
                            </div>
                        </div>
                        <span class="text-sm font-black text-slate-900 dark:text-white">${calc.totalCableLength} m</span>
                    </div>

                    <!-- MC4 Stecker -->
                    <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div class="flex items-center gap-2.5">
                            <span class="material-symbols-rounded text-primary text-xl">power</span>
                            <div>
                                <p class="font-bold text-slate-800 dark:text-slate-200">MC4-Steckverbinder-Paare (IP68)</p>
                                <p class="text-[10px] text-slate-400">Stift & Buchse mit Verriegelung</p>
                            </div>
                        </div>
                        <span class="text-sm font-black text-slate-900 dark:text-white">${calc.mc4Pairs} Paare</span>
                    </div>

                    <!-- Kabelclips / Zubehör -->
                    <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div class="flex items-center gap-2.5">
                            <span class="material-symbols-rounded text-amber-500 text-xl">hardware</span>
                            <div>
                                <p class="font-bold text-slate-800 dark:text-slate-200">UV-Kabelbinder / Edelstahl-Kabelclips</p>
                                <p class="text-[10px] text-slate-400">Zur Befestigung an Tragschienen</p>
                            </div>
                        </div>
                        <span class="text-sm font-black text-slate-900 dark:text-white">ca. ${calc.zipTies} Stk</span>
                    </div>

                    <!-- Schutzrohr -->
                    <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div class="flex items-center gap-2.5">
                            <span class="material-symbols-rounded text-sky-500 text-xl">architecture</span>
                            <div>
                                <p class="font-bold text-slate-800 dark:text-slate-200">Empfohlenes UV-Wellrohr</p>
                                <p class="text-[10px] text-slate-400">Für mechanischen Schutz der DC-Leitung</p>
                            </div>
                        </div>
                        <span class="text-sm font-black text-slate-900 dark:text-white">${calc.crossSection >= 6 ? 'M25 / M32' : 'M20 / M25'}</span>
                    </div>
                </div>

                <!-- Leiterschleifen-Check nach VDE 0185 -->
                <div class="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1">
                    <p class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span class="material-symbols-rounded text-base ${calc.loopSafety === 'optimal' ? 'text-emerald-500' : (calc.loopSafety === 'acceptable' ? 'text-amber-500' : 'text-rose-500')}">
                            ${calc.loopSafety === 'optimal' ? 'verified_user' : (calc.loopSafety === 'acceptable' ? 'shield' : 'gpp_bad')}
                        </span>
                        Blitzschutz-Status: Leiterschleifenfläche ${calc.loopAreaM2} m²
                    </p>
                    <p class="text-[11px] text-slate-500 dark:text-slate-400">
                        ${calc.loopSafety === 'optimal' 
                            ? 'Durch die Reißverschluss-Verkabelung ist die aufgespannte Induktionsfläche minimal. Höchster Schutz gegen Blitzeinkopplungen nach DIN EN 62305-3.' 
                            : (calc.loopSafety === 'acceptable' 
                                ? 'Der parallele Rückleiter im Montagekanal reduziert die Induktionsschleife auf ein sicheres Maß.' 
                                : 'Achtung: Große Leiterschleife! Im Schadensfall können bei nahen Blitzeinschlägen Überspannungen Wechselrichter und Module beschädigen.')}
                    </p>
                </div>
            </div>
        </div>
    `;
}

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
    let name = document.getElementById('cdb_name').value;
    if(!name) return alert("Bitte Namen eingeben");
    
    let userDB = JSON.parse(localStorage.getItem('pvpro_user_db')) || { panels: [], batteries: [], inverters: [] };
    let newId = Date.now() % 100000;

    if(t==='panel') userDB.panels.push({ id: newId, name, pmax: parseFloat(document.getElementById('cdb_pmax').value)||400, voc: parseFloat(document.getElementById('cdb_voc').value)||40, vmp: parseFloat(document.getElementById('cdb_vmp').value)||30, isc: parseFloat(document.getElementById('cdb_isc').value)||10, tempVoc: -0.25 });
    if(t==='inv') {
        let mppts = []; let count = parseInt(document.getElementById('cdb_mppts').value)||2;
        for(let i=1; i<=count; i++) mppts.push({id:i, name:`MPPT ${i}`, maxIsc:20, maxI:15});
        userDB.inverters.push({ id: newId, name, acMax: parseFloat(document.getElementById('cdb_acmax').value)||5000, startV: parseFloat(document.getElementById('cdb_startv').value)||80, maxV: parseFloat(document.getElementById('cdb_maxv').value)||1000, minMppV: parseFloat(document.getElementById('cdb_startv').value)+50, maxMppV: 800, mppts });
    }
    if(t==='bat') userDB.batteries.push({ id: newId, name, cap: parseFloat(document.getElementById('cdb_cap').value)||5, power: parseFloat(document.getElementById('cdb_power').value)||5000, eff: 0.95 });

    localStorage.setItem('pvpro_user_db', JSON.stringify(userDB));
    toggleCustomDbForm();
    alert("Gerät gespeichert! App lädt neu.");
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
            return `
            <div class="m3-card bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                    <div class="flex items-center gap-2 mb-2">
                        <span class="material-symbols-rounded text-primary text-xl">settings_input_component</span>
                        <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm">${w.name}</h4>
                    </div>
                    <div class="flex gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-1 mb-4">
                        <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">AC Max: ${w.acMax}W</span>
                        <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">Start: ${w.startV}V</span>
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
        pCard.innerHTML = flatPanels.map(p => `
            <div class="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center shadow-sm">
                <div>
                    <h4 class="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-primary">solar_power</span> ${p.name}</h4>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Voc: ${p.voc}V | Vmp: ${p.vmp?.toFixed(1)}V | Isc: ${p.isc}A</p>
                </div>
                <div class="text-right"><span class="text-xs font-black text-primary">${p.pmax} W</span></div>
            </div>`).join('');
    }
    
    let bCard = document.getElementById('batCardGrid');
    if(bCard) {
        bCard.innerHTML = flatBatteries.map(b => `
            <div class="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center shadow-sm">
                <div>
                    <h4 class="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5"><span class="material-symbols-rounded text-sm text-accent">battery_charging_full</span> ${b.name}</h4>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Max. P: ${b.power}W | Eff: ${Math.round((b.eff || 1) * 100)}%</p>
                </div>
                <div class="text-right"><span class="text-xs font-black text-accent">${b.cap.toFixed(2)} kWh</span></div>
            </div>`).join('');
    }
}

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
