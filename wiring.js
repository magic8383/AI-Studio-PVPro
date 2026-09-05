// ==========================================
// 4. DC-VERKABELUNG & STRING-VISUALISIERUNG
// Module: wiring.js (Version 7.0.0)
// DIN VDE 0100-712, DIN EN 62305 (VDE 0185-305)
// ==========================================

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
    if (typeof openDossierModal === 'function') {
        openDossierModal('wiring');
    } else {
        window.print();
    }
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
    const sId = Number(strId);
    if (!wiringSettings.customRoofLayouts) wiringSettings.customRoofLayouts = {};
    if (!wiringSettings.customRoofLayouts[sId]) {
        wiringSettings.customRoofLayouts[sId] = { obstacles: [] };
    }
    const obList = wiringSettings.customRoofLayouts[sId].obstacles || [];
    const r = Math.max(0, parseInt(row) || 0);
    const c = Math.max(0, parseInt(col) || 0);
    const fIdx = Math.max(0, parseInt(fieldIdx) || 0);
    
    // Vorhandenes an gleicher Stelle überschreiben
    const existIdx = obList.findIndex(o => (o.fieldIdx === undefined ? 0 : Number(o.fieldIdx)) === fIdx && Number(o.row) === r && Number(o.col) === c);
    const item = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        fieldIdx: fIdx,
        row: r,
        col: c,
        type: type || 'window',
        label: (label && label.trim().length > 0) ? label.trim() : (type === 'window' ? 'Dachfenster' : (type === 'dormer' ? 'Gaube' : (type === 'chimney' ? 'Kamin' : 'Leerfläche')))
    };
    if (existIdx >= 0) {
        obList[existIdx] = item;
    } else {
        obList.push(item);
    }
    wiringSettings.customRoofLayouts[sId].obstacles = obList;
    wiringSettings.customRoofLayouts[String(sId)] = wiringSettings.customRoofLayouts[sId];
    saveWiringSettings();
    renderWiringTab();
}

function removeRoofObstacle(strId, obId) {
    const sId = Number(strId);
    [sId, String(sId)].forEach(k => {
        if (wiringSettings.customRoofLayouts && wiringSettings.customRoofLayouts[k]?.obstacles) {
            wiringSettings.customRoofLayouts[k].obstacles = wiringSettings.customRoofLayouts[k].obstacles.filter(o => Number(o.id) !== Number(obId));
        }
    });
    saveWiringSettings();
    renderWiringTab();
}

function clearAllRoofObstacles(strId) {
    const sId = Number(strId);
    [sId, String(sId)].forEach(k => {
        if (wiringSettings.customRoofLayouts && wiringSettings.customRoofLayouts[k]) {
            wiringSettings.customRoofLayouts[k].obstacles = [];
        }
    });
    saveWiringSettings();
    renderWiringTab();
}

function confirmRemoveObstaclePrompt(strId, obId, label) {
    if (confirm(`Hindernis "${label}" von der Dachfläche entfernen? Die PV-Module schließen diese Lücke automatisch.`)) {
        removeRoofObstacle(strId, obId);
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

    const strLayout = settings.customRoofLayouts[str.id] || settings.customRoofLayouts[String(str.id)] || { obstacles: [] };
    const obstacles = strLayout.obstacles || [];

    fields.forEach((f, fIdx) => {
        const fCount = parseInt(f.count) || 1;
        const fName = f.name || `Feld ${fIdx + 1}`;
        const fModel = flatPanels.find(p => p.id === parseInt(f.panelId)) || flatPanels[0] || { pmax: 440, vmp: 32.5, imp: 13.5 };

        // Hindernisse für dieses Feld
        const fieldObs = obstacles.filter(ob => (ob.fieldIdx === undefined ? fIdx === 0 : Number(ob.fieldIdx) === fIdx));
        const maxObCol = fieldObs.length > 0 ? Math.max(...fieldObs.map(o => parseInt(o.col) || 0)) : -1;
        const maxObRow = fieldObs.length > 0 ? Math.max(...fieldObs.map(o => parseInt(o.row) || 0)) : -1;

        let fCols = Math.max(1, parseInt(f.cols) || Math.min(fCount, 4) || 4);
        if (maxObCol >= fCols) fCols = maxObCol + 1;

        const totalSpots = fCount + fieldObs.length;
        let fRows = Math.max(1, parseInt(f.rows) || Math.ceil(totalSpots / fCols));
        if (maxObRow >= fRows) fRows = maxObRow + 1;
        if (fRows * fCols < totalSpots) {
            fRows = Math.ceil(totalSpots / fCols);
        }

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

        // Hindernisse in obMap eintragen und Koordinaten berechnen
        const obMap = new Map();
        fieldObs.forEach(ob => {
            const r = Math.max(0, parseInt(ob.row) || 0);
            const c = Math.max(0, parseInt(ob.col) || 0);
            obMap.set(`${r}_${c}`, ob);

            const obX = boxX + padX + c * (pw + gapX);
            const obY = boxY + headerH + r * (ph + gapY);
            obstaclesPos.push({
                ...ob,
                fieldIdx: fIdx,
                row: r,
                col: c,
                x: obX,
                y: obY,
                w: pw,
                h: ph
            });
        });

        // Module in freien Rasterzellen platzieren (Hindernisse freilassen)
        let placedCount = 0;
        let r = 0, c = 0;
        while (placedCount < fCount) {
            if (obMap.has(`${r}_${c}`)) {
                // Zelle durch Hindernis belegt -> überspringen
            } else {
                const x = boxX + padX + c * (pw + gapX);
                const y = boxY + headerH + r * (ph + gapY);

                positions.push({
                    idx: globalPanelIdx,
                    fieldIdx: fIdx,
                    fieldId: f.id,
                    fieldName: fName,
                    fieldShort: `F${fIdx + 1}`,
                    localIdx: placedCount,
                    labelNum: globalPanelIdx + 1,
                    localLabel: `F${fIdx + 1}-${placedCount + 1}`,
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
                placedCount++;
            }

            c++;
            if (c >= fCols) {
                c = 0;
                r++;
            }
        }

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

        <!-- HINDERNISSE-EBENE (FENSTER, GAUBEN, KAMINE, LEERFLÄCHEN) -->
        <g id="obstacles-layer">
            ${obstaclesPos.map(ob => {
                const escLabel = (ob.label || '').replace(/'/g, "\\'");
                if (ob.type === 'window') {
                    return `
                    <g id="obstacle-${ob.id}" transform="translate(${ob.x}, ${ob.y})" class="cursor-pointer" onclick="confirmRemoveObstaclePrompt(${str.id}, ${ob.id}, '${escLabel}')">
                        <title>${ob.label || 'Dachfenster'} (Klicken zum Entfernen)</title>
                        <rect width="${ob.w}" height="${ob.h}" rx="6" fill="#03203c" stroke="#38bdf8" stroke-width="2.2" />
                        <rect x="6" y="6" width="${ob.w - 12}" height="${ob.h - 12}" rx="4" fill="#0284c7" fill-opacity="0.25" stroke="#38bdf8" stroke-width="1.2" />
                        <line x1="${ob.w / 2}" y1="6" x2="${ob.w / 2}" y2="${ob.h - 6}" stroke="#7dd3fc" stroke-width="2" />
                        <line x1="6" y1="${ob.h * 0.45}" x2="${ob.w - 6}" y2="${ob.h * 0.45}" stroke="#7dd3fc" stroke-width="2" />
                        <polygon points="10,${ob.h - 10} 10,${ob.h - 26} ${ob.w - 26},10 ${ob.w - 10},10" fill="#ffffff" fill-opacity="0.12" />
                        <rect x="${ob.w * 0.08}" y="${ob.h - 24}" width="${ob.w * 0.84}" height="18" rx="4" fill="#0f172a" fill-opacity="0.95" stroke="#0284c7" stroke-width="1" />
                        <text x="${ob.w / 2}" y="${ob.h - 12}" fill="#38bdf8" font-size="8.5" font-weight="800" text-anchor="middle">🪟 ${ob.label || 'Dachfenster'}</text>
                        <circle cx="${ob.w - 10}" cy="10" r="7" fill="#ef4444" stroke="#991b1b" stroke-width="1" opacity="0.85" />
                        <text x="${ob.w - 10}" y="13" fill="#fff" font-size="8.5" font-weight="900" text-anchor="middle">×</text>
                    </g>
                    `;
                } else if (ob.type === 'dormer') {
                    return `
                    <g id="obstacle-${ob.id}" transform="translate(${ob.x}, ${ob.y})" class="cursor-pointer" onclick="confirmRemoveObstaclePrompt(${str.id}, ${ob.id}, '${escLabel}')">
                        <title>${ob.label || 'Gaube'} (Klicken zum Entfernen)</title>
                        <rect width="${ob.w}" height="${ob.h}" rx="6" fill="#1e293b" stroke="#f59e0b" stroke-width="2.2" />
                        <polygon points="10,${ob.h - 16} ${ob.w / 2},12 ${ob.w - 10},${ob.h - 16}" fill="#334155" stroke="#f59e0b" stroke-width="1.5" />
                        <rect x="${ob.w * 0.35}" y="${ob.h * 0.5}" width="${ob.w * 0.3}" height="${ob.h * 0.28}" rx="2" fill="#0284c7" fill-opacity="0.4" stroke="#38bdf8" stroke-width="1" />
                        <rect x="${ob.w * 0.08}" y="${ob.h - 24}" width="${ob.w * 0.84}" height="18" rx="4" fill="#0f172a" fill-opacity="0.95" stroke="#f59e0b" stroke-width="1" />
                        <text x="${ob.w / 2}" y="${ob.h - 12}" fill="#fbbf24" font-size="8.5" font-weight="800" text-anchor="middle">🏠 ${ob.label || 'Gaube'}</text>
                        <circle cx="${ob.w - 10}" cy="10" r="7" fill="#ef4444" stroke="#991b1b" stroke-width="1" opacity="0.85" />
                        <text x="${ob.w - 10}" y="13" fill="#fff" font-size="8.5" font-weight="900" text-anchor="middle">×</text>
                    </g>
                    `;
                } else if (ob.type === 'chimney') {
                    return `
                    <g id="obstacle-${ob.id}" transform="translate(${ob.x}, ${ob.y})" class="cursor-pointer" onclick="confirmRemoveObstaclePrompt(${str.id}, ${ob.id}, '${escLabel}')">
                        <title>${ob.label || 'Kamin'} (Klicken zum Entfernen)</title>
                        <rect width="${ob.w}" height="${ob.h}" rx="6" fill="#1c1917" stroke="#dc2626" stroke-width="2.2" />
                        <rect x="10" y="10" width="${ob.w - 20}" height="${ob.h - 20}" rx="4" fill="#7f1d1d" stroke="#b91c1c" stroke-width="1.2" />
                        <ellipse cx="${ob.w / 2}" cy="${ob.h / 2 - 4}" rx="12" ry="8" fill="#0c0a09" stroke="#991b1b" stroke-width="1.5" />
                        <rect x="${ob.w * 0.08}" y="${ob.h - 24}" width="${ob.w * 0.84}" height="18" rx="4" fill="#0f172a" fill-opacity="0.95" stroke="#dc2626" stroke-width="1" />
                        <text x="${ob.w / 2}" y="${ob.h - 12}" fill="#fca5a5" font-size="8.5" font-weight="800" text-anchor="middle">🧱 ${ob.label || 'Kamin'}</text>
                        <circle cx="${ob.w - 10}" cy="10" r="7" fill="#ef4444" stroke="#991b1b" stroke-width="1" opacity="0.85" />
                        <text x="${ob.w - 10}" y="13" fill="#fff" font-size="8.5" font-weight="900" text-anchor="middle">×</text>
                    </g>
                    `;
                } else {
                    return `
                    <g id="obstacle-${ob.id}" transform="translate(${ob.x}, ${ob.y})" class="cursor-pointer" onclick="confirmRemoveObstaclePrompt(${str.id}, ${ob.id}, '${escLabel}')">
                        <title>${ob.label || 'Leerfläche'} (Klicken zum Entfernen)</title>
                        <rect width="${ob.w}" height="${ob.h}" rx="6" fill="#0f172a" fill-opacity="0.88" stroke="#64748b" stroke-width="1.8" stroke-dasharray="6,4" />
                        <line x1="8" y1="8" x2="${ob.w - 8}" y2="${ob.h - 8}" stroke="#334155" stroke-width="1.5" opacity="0.5" />
                        <line x1="${ob.w - 8}" y1="8" x2="8" y2="${ob.h - 8}" stroke="#334155" stroke-width="1.5" opacity="0.5" />
                        <rect x="${ob.w * 0.08}" y="${ob.h - 24}" width="${ob.w * 0.84}" height="18" rx="4" fill="#0f172a" stroke="#475569" stroke-width="1" />
                        <text x="${ob.w / 2}" y="${ob.h - 12}" fill="#94a3b8" font-size="8.5" font-weight="800" text-anchor="middle">🚫 ${ob.label || 'Leerfläche'}</text>
                        <circle cx="${ob.w - 10}" cy="10" r="7" fill="#ef4444" stroke="#991b1b" stroke-width="1" opacity="0.85" />
                        <text x="${ob.w - 10}" y="13" fill="#fff" font-size="8.5" font-weight="900" text-anchor="middle">×</text>
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
                ${((wiringSettings.customRoofLayouts[primaryStr.id]?.obstacles || wiringSettings.customRoofLayouts[String(primaryStr.id)]?.obstacles || []).length > 0) ? `
                <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/40 dark:border-amber-800/30">
                    <span class="font-bold text-slate-500">Platzierte Elemente:</span>
                    ${(wiringSettings.customRoofLayouts[primaryStr.id]?.obstacles || wiringSettings.customRoofLayouts[String(primaryStr.id)]?.obstacles || []).map(ob => {
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
