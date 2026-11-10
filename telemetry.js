// ============================================================================
// TELEMETRY, LIVE DASHBOARD, SANKEY ENERGY FLOW & PERFORMANCE ENGINE (V9.1)
// Zweizeilige Wert-zuerst Kacheln, 2 separate Batterie-Sensoren (Lade/Entlade),
// 1-Wort-Überschriften & Einheitensichere Tages-kWh ohne Zurückspringen auf Total
// ============================================================================

const DEFAULT_CUSTOM_STRINGS = [
    { id: 'str_fronius_1', name: 'Fronius · String 1 DC', powerEntity: 'sensor.fronius_string_1_power', energyEntity: 'sensor.fronius_string_1_energy_today', color: '#14b8a6' },
    { id: 'str_fronius_2', name: 'Fronius · String 2 DC', powerEntity: 'sensor.fronius_string_2_power', energyEntity: 'sensor.fronius_string_2_energy_today', color: '#f59e0b' },
    { id: 'str_hoymiles', name: 'Hoymiles · gesamt DC', powerEntity: 'sensor.hoymiles_power_dc', energyEntity: '', color: '#22c55e' }
];

const DEFAULT_CUSTOM_CONSUMERS = [
    { id: 'cons_1', name: 'Trockner', powerEntity: 'sensor.trockner_power' },
    { id: 'cons_2', name: 'TV-Verstärker', powerEntity: 'sensor.tv_verstaerker_power' },
    { id: 'cons_3', name: 'Esszimmer Licht', powerEntity: 'sensor.esszimmer_licht_power' },
    { id: 'cons_4', name: 'Küche Licht', powerEntity: 'sensor.kueche_licht_power' }
];

let haConfigState = {
    mode: 'poll', // 'poll' | 'webhook'
    baseUrl: 'https://home.mb10.org',
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
        batteryChargePower: '',
        batteryDischargePower: '',
        batteryPower: 'sensor.battery_power',
        batterySoc: 'sensor.battery_soc',
        pvEnergyToday: '',
        pvEnergyMonth: 'sensor.pv_energy_monthly',
        pvEnergyTotal: 'sensor.pv_energy_total',
        gridImportMonth: 'sensor.grid_import_monthly',
        gridExportMonth: 'sensor.grid_export_monthly',
        batteryChargeMonth: 'sensor.battery_charge_monthly',
        batteryDischargeMonth: 'sensor.battery_discharge_monthly'
    },
    pvEnergyExtraEntities: [],
    customStrings: JSON.parse(JSON.stringify(DEFAULT_CUSTOM_STRINGS)),
    customConsumers: JSON.parse(JSON.stringify(DEFAULT_CUSTOM_CONSUMERS)),
    stringEntities: {},
    inverterEntities: {}
};

let discoveredHaSensors = [];
let lastKnownHaUnitMap = new Map(); // entity_id -> unit_of_measurement (populated from /api/states)
let lastKnownHaStateClassMap = new Map(); // entity_id -> state_class
let liveTelemetryTimer = null;
let intradayHistoryTimer = null;

// Baseline cache for computing Today & Month deltas from total_increasing kWh counters without HA helpers
let energyCounterBaselines = {
    schemaVersion: '9.1',
    dayKey: '',
    monthKey: '',
    dayStartByEntity: {},
    monthStartByEntity: {},
    lastHistorySyncMs: 0
};

let currentLiveTelemetry = {
    updatedAt: null,
    pvPowerW: 682,
    loadPowerW: 2100,
    gridPowerW: 1480, // >0 import from grid, <0 export to grid
    batteryPowerW: 0, // >0 charging, <0 discharging
    batterySocPct: 8.4,
    pvEnergyTodayKwh: 1.325,
    gridImportTodayKwh: null,
    gridExportTodayKwh: null,
    batteryChargeTodayKwh: null,
    batteryDischargeTodayKwh: null,
    pvEnergyMonthKwh: 0,
    gridImportMonthKwh: 0,
    gridExportMonthKwh: 0,
    batteryChargeMonthKwh: 0,
    batteryDischargeMonthKwh: 0,
    stringTelemetry: {},
    customStringsTelemetry: [],
    consumersTelemetry: [],
    unavailableConsumersCount: 1,
    connectionOk: true,
    lastError: null
};

// Intraday chart state & active curve toggles
let chartIntraday = null;
let chartIntradayFullscreen = null;
let isIntradayFsRotated = false;
let currentFocusedCurveMode = false;
let currentFocusedCurveTitle = 'Tagesverlauf · Telemetrie';
let showAllDashboardConsumers = false;
let isIntradayHovering = false;
let intradaySeriesState = {
    startOfDayIso: null,
    nowIso: null,
    labels: [],
    bucketTimes: [],
    series: {}, // key -> array of values
    integratedKwh: {}, // key -> kWh number
    peakValues: {} // key -> max value today
};

let activeCurveKeys = new Set(['str_fronius_1', 'str_fronius_2', 'str_hoymiles', 'pv_total', 'battery_soc']);

let demoSimHour = 11.27;
let activeAnalysisSubTab = 'soll-ist'; // 'soll-ist' | 'autarkie-bat' | 'amortisation' | 'logbuch'
let currentSankeyHorizon = 'year'; // 'today' | 'month' | 'year'
let selectedAnalysisYear = new Date().getFullYear();
let performanceRecordsByProject = {};

// Chart instances for Performance Analysis
let chartSollIst = null;
let chartRealAutarky = null;
let chartRealAmort = null;

const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTH_LABELS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// ============================================================================
// 1. INITIALIZATION & PERSISTENCE (SERVER + LOCALSTORAGE)
// ============================================================================

function getActiveAnalysisProjectId() {
    if (typeof getActiveProjectId === 'function') {
        return getActiveProjectId() || 'default_project';
    }
    return localStorage.getItem('pvpro_active_project_id') || 'default_project';
}

function createEmptyYearMonths() {
    return Array.from({ length: 12 }, (_, idx) => ({
        month: idx,
        pvYieldKwh: null,
        gridExportKwh: null,
        gridImportKwh: null,
        batteryChargedKwh: null,
        batteryDischargedKwh: null,
        source: 'empty'
    }));
}

async function initTelemetryAndAnalysis() {
    // Load active curve selection from localStorage
    try {
        const savedCurves = localStorage.getItem('pvpro_active_curves');
        if (savedCurves) {
            const parsedC = JSON.parse(savedCurves);
            if (Array.isArray(parsedC) && parsedC.length > 0) {
                activeCurveKeys = new Set(parsedC);
            }
        }
    } catch (e) {}

    // Load cached kWh total counter baselines for Today / Month delta calculation
    loadEnergyCounterBaselines();

    // 1. Load local cached HA config & performance records
    try {
        const localHa = localStorage.getItem('pvpro_ha_config');
        if (localHa) {
            const parsed = JSON.parse(localHa);
            haConfigState = {
                ...haConfigState,
                ...parsed,
                entities: { ...haConfigState.entities, ...(parsed.entities || {}) },
                pvEnergyExtraEntities: Array.isArray(parsed.pvEnergyExtraEntities) ? parsed.pvEnergyExtraEntities : (haConfigState.pvEnergyExtraEntities || []),
                customStrings: Array.isArray(parsed.customStrings) && parsed.customStrings.length > 0 ? parsed.customStrings : haConfigState.customStrings,
                customConsumers: Array.isArray(parsed.customConsumers) ? parsed.customConsumers : haConfigState.customConsumers,
                stringEntities: { ...haConfigState.stringEntities, ...(parsed.stringEntities || {}) }
            };
        }
    } catch (e) {}

    try {
        const localRec = localStorage.getItem('pvpro_performance_records');
        if (localRec) {
            performanceRecordsByProject = JSON.parse(localRec) || {};
        }
    } catch (e) {}

    // 2. Sync with backend server asynchronously (safe on GitHub Pages / static hosts)
    try {
        const [haRes, recRes] = await Promise.all([
            safeFetchBackendJson('/api/ha/config'),
            safeFetchBackendJson('/api/performance/records')
        ]);

        if (haRes.ok && haRes.data && haRes.data.success && haRes.data.config) {
            haConfigState = {
                ...haConfigState,
                ...haRes.data.config,
                entities: { ...haConfigState.entities, ...(haRes.data.config.entities || {}) },
                pvEnergyExtraEntities: Array.isArray(haRes.data.config.pvEnergyExtraEntities) ? haRes.data.config.pvEnergyExtraEntities : (haConfigState.pvEnergyExtraEntities || []),
                customStrings: Array.isArray(haRes.data.config.customStrings) && haRes.data.config.customStrings.length > 0 ? haRes.data.config.customStrings : haConfigState.customStrings,
                customConsumers: Array.isArray(haRes.data.config.customConsumers) ? haRes.data.config.customConsumers : haConfigState.customConsumers,
                stringEntities: { ...haConfigState.stringEntities, ...(haRes.data.config.stringEntities || {}) }
            };
            localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
        }

        if (recRes.ok && recRes.data && recRes.data.success && recRes.data.records && Object.keys(recRes.data.records).length > 0) {
            performanceRecordsByProject = { ...performanceRecordsByProject, ...recRes.data.records };
            localStorage.setItem('pvpro_performance_records', JSON.stringify(performanceRecordsByProject));
        }
    } catch (e) {}

    // Migrate legacy 'demo' mode to 'poll'
    if (!haConfigState.mode || haConfigState.mode === 'demo') {
        haConfigState.mode = 'poll';
    }

    // Ensure all customStrings have active curve keys on first load if none match
    if (Array.isArray(haConfigState.customStrings)) {
        const hasAnyCustomActive = haConfigState.customStrings.some(cs => activeCurveKeys.has(cs.id));
        if (!hasAnyCustomActive && haConfigState.customStrings.length > 0) {
            haConfigState.customStrings.forEach(cs => activeCurveKeys.add(cs.id));
        }
    }

    ensureProjectYearInitialized(selectedAnalysisYear);

    // Start live dashboard immediately if dashboard tab is active
    const liveTab = document.getElementById('tab-live');
    if (liveTab && liveTab.classList.contains('active')) {
        startLiveTelemetryLoop();
    }
}

function ensureProjectYearInitialized(year) {
    const projId = getActiveAnalysisProjectId();
    if (!performanceRecordsByProject[projId]) {
        performanceRecordsByProject[projId] = {};
    }
    if (!performanceRecordsByProject[projId][String(year)] || !Array.isArray(performanceRecordsByProject[projId][String(year)].months)) {
        performanceRecordsByProject[projId][String(year)] = {
            months: generateRealisticSampleMonths(year, 10),
            updatedAt: new Date().toISOString(),
            isSampleSeed: true
        };
        savePerformanceRecordsLocalAndServer();
    }
}

function getCurrentYearMonthsData(year = selectedAnalysisYear) {
    ensureProjectYearInitialized(year);
    const projId = getActiveAnalysisProjectId();
    return performanceRecordsByProject[projId][String(year)].months;
}

async function savePerformanceRecordsLocalAndServer() {
    const projId = getActiveAnalysisProjectId();
    const yearStr = String(selectedAnalysisYear);
    const months = performanceRecordsByProject[projId]?.[yearStr]?.months || createEmptyYearMonths();

    try {
        localStorage.setItem('pvpro_performance_records', JSON.stringify(performanceRecordsByProject));
    } catch (e) {}

    try {
        await fetch('/api/performance/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: projId,
                year: selectedAnalysisYear,
                months
            })
        });
    } catch (e) {}
}

// ============================================================================
// 2. SINGLE SOURCE OF TRUTH: PLANNED SYSTEM & PVGIS SOLL-PROGNOSE
// ============================================================================

function getPlannedSystemBaseline() {
    let totalKwp = 0;
    const stringSummaries = [];
    const monthlySollTotal = new Array(12).fill(0);

    const safeLat = parseFloat(typeof LocationData !== 'undefined' ? LocationData?.lat : 48.06) || 48.06;
    const hasYieldCache = typeof YieldDataCache !== 'undefined' && Array.isArray(YieldDataCache) && YieldDataCache.length > 0;

    (typeof strings !== 'undefined' ? strings : []).forEach((str, idx) => {
        let strKwp = 0;
        let strSollMo = new Array(12).fill(0);
        let shadingFactor = 1 - ((str.shading || 0) / 100);

        (str.fields || []).forEach(f => {
            const p = (typeof flatPanels !== 'undefined' ? flatPanels : []).find(x => x.id === parseInt(f.panelId));
            const count = parseInt(f.count) || 0;
            if (p && count > 0) {
                const fKwp = (p.pmax * count) / 1000;
                strKwp += fKwp;

                if (!hasYieldCache && typeof generateSyntheticPVGISData === 'function') {
                    const synthHourly = generateSyntheticPVGISData(safeLat, f.tilt || 30, str.azimuth || 180, fKwp);
                    const mStart = [0, 744, 1416, 2160, 2880, 3624, 4344, 5088, 5832, 6552, 7296, 8016];
                    for (let m = 0; m < 12; m++) {
                        let mSumWh = 0;
                        const endH = m === 11 ? 8760 : mStart[m + 1];
                        for (let h = mStart[m]; h < endH; h++) {
                            mSumWh += (synthHourly[h]?.P || 0) * shadingFactor * 0.95;
                        }
                        strSollMo[m] += mSumWh / 1000;
                    }
                }
            }
        });

        totalKwp += strKwp;

        if (hasYieldCache) {
            const gName = str.group || str.name;
            const cachedGroup = YieldDataCache.find(g => g.name === gName);
            if (cachedGroup && Array.isArray(cachedGroup.mo)) {
                const groupRatio = cachedGroup.kwp > 0 ? (strKwp / cachedGroup.kwp) : 1;
                strSollMo = cachedGroup.mo.map(v => v * groupRatio);
            }
        }

        for (let m = 0; m < 12; m++) {
            monthlySollTotal[m] += strSollMo[m];
        }

        const inv = (typeof flatInverters !== 'undefined' ? flatInverters : []).find(i => i.id === parseInt(str.inverterId));
        stringSummaries.push({
            id: str.id,
            name: str.name || `String ${idx + 1}`,
            color: str.color || '#14b8a6',
            kwp: strKwp,
            azimuth: str.azimuth || 180,
            inverterName: inv ? inv.name : 'Wechselrichter',
            sollYearKwh: strSollMo.reduce((a, b) => a + b, 0),
            sollMonthlyKwh: strSollMo
        });
    });

    // Battery capacity & name from active configuration
    let totalBatteryKwh = 0;
    let totalBatteryPowerW = 0;
    let detectedBatteryName = haConfigState.batteryName || 'BYD HVS+';

    const activeInvIds = [...new Set((typeof strings !== 'undefined' ? strings : []).map(s => parseInt(s.inverterId)))];
    activeInvIds.forEach(invId => {
        const inv = (typeof flatInverters !== 'undefined' ? flatInverters : []).find(i => i.id === invId);
        if (inv && inv.batteryId && inv.batteryId > 1) {
            const bat = (typeof flatBatteries !== 'undefined' ? flatBatteries : []).find(b => b.id == inv.batteryId);
            if (bat) {
                totalBatteryKwh += parseFloat(bat.cap || bat.capacity || 0);
                totalBatteryPowerW += parseFloat(bat.power || 4000);
                if (!haConfigState.batteryName && bat.name) detectedBatteryName = bat.name;
            }
        }
    });
    if (totalBatteryKwh === 0 && typeof activeHardwareBatteryId !== 'undefined' && activeHardwareBatteryId > 1) {
        const bat = (typeof flatBatteries !== 'undefined' ? flatBatteries : []).find(b => b.id == activeHardwareBatteryId);
        if (bat) {
            totalBatteryKwh = parseFloat(bat.cap || bat.capacity || 0);
            totalBatteryPowerW = parseFloat(bat.power || 4000);
            if (!haConfigState.batteryName && bat.name) detectedBatteryName = bat.name;
        }
    }

    const gridPriceEur = parseFloat(document.getElementById('fin_grid_price')?.value) || 0.32;
    const sysCostEur = parseFloat(document.getElementById('fin_sys_cost')?.value) || 15000;
    const eegRateCt = typeof updateEEGPreview === 'function' ? updateEEGPreview() : 7.8;
    const eegRateEur = eegRateCt / 100;

    let plannedConsKwh = 4500;
    if (typeof FlowCache !== 'undefined' && FlowCache) {
        plannedConsKwh = Math.round(FlowCache.direct + FlowCache.fromBat + FlowCache.fromGrid);
    } else if (typeof getConsumptionConfig === 'function') {
        const c = getConsumptionConfig();
        plannedConsKwh = Math.round((c.baseKwh || 3500) + ((c.it || 0) * 8.76) + (c.ac || 0) + (c.wp || 0) + (c.bw || 0) + (c.ev || 0));
    }

    const totalSollYearKwh = monthlySollTotal.reduce((a, b) => a + b, 0);

    return {
        totalKwp: Math.max(0.1, totalKwp),
        totalBatteryKwh,
        totalBatteryPowerW,
        detectedBatteryName,
        stringSummaries,
        monthlySollTotal,
        totalSollYearKwh,
        gridPriceEur,
        eegRateCt,
        eegRateEur,
        sysCostEur,
        plannedConsKwh,
        hasYieldCache
    };
}

function generateRealisticSampleMonths(year, filledMonthsCount = 10) {
    const baseline = getPlannedSystemBaseline();
    const monthlyConsShares = [0.105, 0.095, 0.088, 0.078, 0.070, 0.065, 0.065, 0.068, 0.075, 0.086, 0.098, 0.107];
    const weatherFactors = [0.94, 1.08, 1.05, 0.97, 1.11, 1.06, 1.09, 1.03, 0.96, 1.04, 0.92, 0.98];

    const hasBattery = baseline.totalBatteryKwh > 0;

    return Array.from({ length: 12 }, (_, m) => {
        if (m >= filledMonthsCount) {
            return {
                month: m,
                pvYieldKwh: null,
                gridExportKwh: null,
                gridImportKwh: null,
                batteryChargedKwh: null,
                batteryDischargedKwh: null,
                source: 'empty'
            };
        }

        const sollPv = baseline.monthlySollTotal[m] || (baseline.totalKwp * 80);
        const actualPv = Math.round(sollPv * weatherFactors[m]);
        const monthHouseCons = Math.round(baseline.plannedConsKwh * monthlyConsShares[m]);

        const directRatio = m >= 3 && m <= 8 ? 0.36 : 0.48;
        const directUsed = Math.min(monthHouseCons * 0.55, actualPv * directRatio);

        let batCharged = 0;
        let batDischarged = 0;
        if (hasBattery) {
            const excessPv = Math.max(0, actualPv - directUsed);
            const remainingLoad = Math.max(0, monthHouseCons - directUsed);
            const maxMonthlyBatCap = baseline.totalBatteryKwh * 24;
            batDischarged = Math.round(Math.min(remainingLoad * 0.78, excessPv * 0.85, maxMonthlyBatCap));
            batCharged = Math.round(batDischarged / 0.91);
        }

        const totalSelfUsed = Math.min(actualPv, Math.round(directUsed + batCharged));
        const gridExport = Math.max(0, Math.round(actualPv - totalSelfUsed));
        const coveredHouseLoad = Math.min(monthHouseCons, Math.round(directUsed + batDischarged));
        const gridImport = Math.max(0, Math.round(monthHouseCons - coveredHouseLoad));

        return {
            month: m,
            pvYieldKwh: actualPv,
            gridExportKwh: gridExport,
            gridImportKwh: gridImport,
            batteryChargedKwh: batCharged,
            batteryDischargedKwh: batDischarged,
            source: 'sample'
        };
    });
}

// ============================================================================
// 3. LIVE TELEMETRY & INTRADAY HISTORY ENGINE
// ============================================================================

function startLiveTelemetryLoop() {
    stopLiveTelemetryLoop();
    refreshIntradayHistoryAndLive();

    const intervalMs = Math.max(3, parseInt(haConfigState.pollIntervalSec) || 10) * 1000;
    liveTelemetryTimer = setInterval(() => {
        const liveTab = document.getElementById('tab-live');
        if (liveTab && liveTab.classList.contains('active')) {
            refreshLiveTelemetryNow();
        }
    }, intervalMs);

    // Refresh full intraday history every 60 seconds when on live tab
    intradayHistoryTimer = setInterval(() => {
        const liveTab = document.getElementById('tab-live');
        if (liveTab && liveTab.classList.contains('active') && haConfigState.mode !== 'demo') {
            fetchAndRenderIntradayHistory();
        }
    }, 60000);
}

function stopLiveTelemetryLoop() {
    if (liveTelemetryTimer) {
        clearInterval(liveTelemetryTimer);
        liveTelemetryTimer = null;
    }
    if (intradayHistoryTimer) {
        clearInterval(intradayHistoryTimer);
        intradayHistoryTimer = null;
    }
}

async function refreshIntradayHistoryAndLive() {
    await refreshLiveTelemetryNow();
    await fetchAndRenderIntradayHistory();
}

// ============================================================================
// 3B. BROWSER-FIRST HOME ASSISTANT CLIENT (GITHUB PAGES & REVERSE PROXY READY)
// ============================================================================

function normalizeHaUrlClient(rawUrl) {
    let url = String(rawUrl || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
        const isLocal = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|homeassistant\.local)/i.test(url);
        url = (isLocal ? 'http://' : 'https://') + url;
    }
    url = url
        .replace(/\/lovelace(\/.*)?$/i, '')
        .replace(/\/api\/states(\/.*)?$/i, '')
        .replace(/\/api\/?$/i, '')
        .replace(/\/+$/, '');
    return url;
}

function cleanHaTokenClient(rawToken) {
    return String(rawToken || '')
        .trim()
        .replace(/^Bearer\s+/i, '')
        .replace(/[\r\n\t\s]+/g, '');
}

async function safeFetchBackendJson(url, options = {}) {
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        const trimmed = (text || '').trim();
        if (!trimmed || trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
            return { ok: false, isHtml: true, status: res.status, data: null };
        }
        const data = JSON.parse(trimmed);
        return { ok: res.ok, isHtml: false, status: res.status, data };
    } catch (err) {
        return { ok: false, isHtml: false, status: 0, data: null, error: err.message };
    }
}

function getTodayAndMonthKeys() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return {
        dayKey: `${y}-${m}-${d}`,
        monthKey: `${y}-${m}`,
        startOfDayIso: new Date(y, now.getMonth(), now.getDate(), 0, 0, 0).toISOString(),
        startOfMonthIso: new Date(y, now.getMonth(), 1, 0, 0, 0).toISOString()
    };
}

function loadEnergyCounterBaselines() {
    const keys = getTodayAndMonthKeys();
    try {
        const raw = localStorage.getItem('pvpro_energy_counter_baselines');
        if (raw) {
            const parsed = JSON.parse(raw);
            // Only reuse cached baselines if schemaVersion is '9.1' (clears any unscaled Wh baselines from v9.0)
            if (parsed && typeof parsed === 'object' && parsed.schemaVersion === '9.1') {
                energyCounterBaselines = {
                    schemaVersion: '9.1',
                    dayKey: keys.dayKey,
                    monthKey: keys.monthKey,
                    dayStartByEntity: parsed.dayKey === keys.dayKey ? (parsed.dayStartByEntity || {}) : {},
                    monthStartByEntity: parsed.monthKey === keys.monthKey ? (parsed.monthStartByEntity || {}) : {},
                    lastHistorySyncMs: parsed.dayKey === keys.dayKey ? (parsed.lastHistorySyncMs || 0) : 0
                };
                return;
            }
        }
    } catch (e) {}
    energyCounterBaselines = {
        schemaVersion: '9.1',
        dayKey: keys.dayKey,
        monthKey: keys.monthKey,
        dayStartByEntity: {},
        monthStartByEntity: {},
        lastHistorySyncMs: 0
    };
    saveEnergyCounterBaselines();
}

function saveEnergyCounterBaselines() {
    try {
        energyCounterBaselines.schemaVersion = '9.1';
        localStorage.setItem('pvpro_energy_counter_baselines', JSON.stringify(energyCounterBaselines));
    } catch (e) {}
}

function isEntityCumulativeTotal(entityId, statesMap = null, forceCumulative = false) {
    if (forceCumulative) return true;
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return false;
    const st = statesMap ? statesMap.get(cleanId) : null;
    const friendly = String(st?.attributes?.friendly_name || '').toLowerCase();
    const idLower = cleanId.toLowerCase();
    const stateClass = String(st?.attributes?.state_class || lastKnownHaStateClassMap.get(cleanId) || '').toLowerCase();

    // If sensor explicitly says "today", "heute", "daily", "tag", "tagesertrag", it resets daily
    const isExplicitDaily = /\b(today|heute|daily|tag|tages|tagesertrag|day)\b/i.test(`${idLower} ${friendly}`);
    if (isExplicitDaily && !/\b(total|gesamt|lifetime)\b/i.test(`${idLower} ${friendly}`)) {
        return false;
    }

    if (stateClass === 'total_increasing' || stateClass === 'total') {
        return true;
    }
    if (/\b(total|gesamt|sum|lifetime|month|monat|year|jahr|import|export|charged|discharged)\b/i.test(`${idLower} ${friendly}`)) {
        return true;
    }
    return false;
}

function resolveEnergyCounterDelta(entityId, currentValKwh, baselineMap, options = {}) {
    if (currentValKwh === null || currentValKwh === undefined || isNaN(currentValKwh)) return null;
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return currentValKwh;

    const { isCumulative = false, maxPlausibleKwh = null } = options;
    let baseVal = baselineMap?.[cleanId];

    // Auto-heal if a legacy baseline was stored in Wh while currentValKwh is in kWh
    if (baseVal !== undefined && baseVal !== null && !isNaN(baseVal) && currentValKwh > 0 && baseVal > currentValKwh * 150) {
        baseVal = +(baseVal / 1000).toFixed(3);
        baselineMap[cleanId] = baseVal;
        saveEnergyCounterBaselines();
    }

    if (baseVal === undefined || baseVal === null || isNaN(baseVal)) {
        // If no 00:00 history baseline is available yet:
        // Never return the raw total of a cumulative counter! Anchor it now and return null so power-integration is shown until history arrives.
        if (isCumulative || (maxPlausibleKwh !== null && currentValKwh > maxPlausibleKwh) || currentValKwh > 60) {
            baselineMap[cleanId] = +currentValKwh.toFixed(3);
            saveEnergyCounterBaselines();
            return null;
        }
        return +Math.max(0, currentValKwh).toFixed(3);
    }

    // If sensor is cumulative (total_increasing / total) or has a non-zero start-of-period reading
    if (isCumulative || baseVal > 0.05) {
        if (currentValKwh >= baseVal) {
            const delta = +Math.max(0, currentValKwh - baseVal).toFixed(3);
            if (maxPlausibleKwh !== null && delta > maxPlausibleKwh) {
                // Guard against uninitialized baseline (e.g. baseline was 0 on a lifetime counter)
                baselineMap[cleanId] = +currentValKwh.toFixed(3);
                saveEnergyCounterBaselines();
                return null;
            }
            return delta;
        } else {
            // Current value is smaller than baseline (e.g. counter reset at midnight or unit change)
            if (!isCumulative && currentValKwh < 15) {
                baselineMap[cleanId] = 0;
                saveEnergyCounterBaselines();
                return +Math.max(0, currentValKwh).toFixed(3);
            }
            baselineMap[cleanId] = +currentValKwh.toFixed(3);
            saveEnergyCounterBaselines();
            return 0;
        }
    }

    // For a daily-resetting sensor (baseVal ~ 0):
    if (maxPlausibleKwh !== null && currentValKwh > maxPlausibleKwh) {
        baselineMap[cleanId] = +currentValKwh.toFixed(3);
        saveEnergyCounterBaselines();
        return null;
    }
    return +Math.max(0, currentValKwh).toFixed(3);
}

function getEnergyScaleForEntity(entityId, statesMap = null) {
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return 1;
    let unit = '';
    if (statesMap && statesMap.has(cleanId)) {
        unit = String(statesMap.get(cleanId)?.attributes?.unit_of_measurement || '').trim().toLowerCase();
    }
    if (!unit && lastKnownHaUnitMap.has(cleanId)) {
        unit = String(lastKnownHaUnitMap.get(cleanId) || '').trim().toLowerCase();
    }
    if (!unit) {
        const found = discoveredHaSensors.find(s => s.entity_id === cleanId);
        if (found) unit = String(found.unit || '').trim().toLowerCase();
    }
    if (unit === 'wh') return 0.001;
    if (unit === 'mwh') return 1000;
    return 1;
}

function getPowerScaleForEntity(entityId, statesMap = null) {
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return 1;
    let unit = '';
    if (statesMap && statesMap.has(cleanId)) {
        unit = String(statesMap.get(cleanId)?.attributes?.unit_of_measurement || '').trim().toLowerCase();
    }
    if (!unit && lastKnownHaUnitMap.has(cleanId)) {
        unit = String(lastKnownHaUnitMap.get(cleanId) || '').trim().toLowerCase();
    }
    if (!unit) {
        const found = discoveredHaSensors.find(s => s.entity_id === cleanId);
        if (found) unit = String(found.unit || '').trim().toLowerCase();
    }
    if (unit === 'kw') return 1000;
    if (unit === 'mw') return 1000000;
    return 1;
}

function getConfiguredPvEnergyEntities(cfg) {
    const e = cfg?.entities || {};
    const extras = Array.isArray(cfg?.pvEnergyExtraEntities) ? cfg.pvEnergyExtraEntities : [];
    const rawList = [
        e.pvEnergyMonth,
        e.pvEnergyToday,
        ...extras
    ].map(x => String(x || '').trim()).filter(Boolean);
    const unique = [...new Set(rawList)];
    if (unique.length === 0 && e.pvEnergyTotal) {
        const tot = String(e.pvEnergyTotal).trim();
        if (tot) unique.push(tot);
    }
    return unique;
}

async function syncEnergyCounterBaselinesFromHaHistory(cfg, statesMap = null) {
    const keys = getTodayAndMonthKeys();
    if (energyCounterBaselines.dayKey !== keys.dayKey) {
        energyCounterBaselines.dayKey = keys.dayKey;
        energyCounterBaselines.dayStartByEntity = {};
        energyCounterBaselines.lastHistorySyncMs = 0;
    }
    if (energyCounterBaselines.monthKey !== keys.monthKey) {
        energyCounterBaselines.monthKey = keys.monthKey;
        energyCounterBaselines.monthStartByEntity = {};
        energyCounterBaselines.lastHistorySyncMs = 0;
    }

    const e = cfg.entities || {};
    const counterEntities = [
        ...getConfiguredPvEnergyEntities(cfg),
        e.gridImportMonth,
        e.gridExportMonth,
        e.batteryChargeMonth,
        e.batteryDischargeMonth,
        ...(cfg.customStrings || []).map(cs => cs?.energyEntity)
    ].map(x => String(x || '').trim()).filter(Boolean);

    const uniqueEntities = [...new Set(counterEntities)];
    if (uniqueEntities.length === 0) return;

    const allHaveBaselines = uniqueEntities.every(
        id => energyCounterBaselines.dayStartByEntity[id] !== undefined && energyCounterBaselines.monthStartByEntity[id] !== undefined
    );
    if (allHaveBaselines && (Date.now() - (energyCounterBaselines.lastHistorySyncMs || 0) < 10 * 60 * 1000)) {
        return;
    }

    const extractPeriodStartReading = (entityHistoryArr, periodStartMs) => {
        if (!Array.isArray(entityHistoryArr) || entityHistoryArr.length === 0) return null;
        const entId = entityHistoryArr[0]?.entity_id;
        const scale = getEnergyScaleForEntity(entId, statesMap);
        const windowEndMs = periodStartMs + 90 * 60 * 1000;
        let minEarlyVal = null;
        let firstPositiveVal = null;
        let firstValidVal = null;

        for (let i = 0; i < entityHistoryArr.length; i++) {
            const pt = entityHistoryArr[i];
            const rawNum = parseFloat(String(pt.state).replace(',', '.'));
            if (isNaN(rawNum) || rawNum < 0) continue;
            const val = rawNum * scale;
            if (firstValidVal === null) firstValidVal = val;
            if (val > 0 && firstPositiveVal === null) firstPositiveVal = val;
            const ts = new Date(pt.last_changed || pt.last_updated || periodStartMs).getTime();
            if (ts <= windowEndMs) {
                if (minEarlyVal === null || val < minEarlyVal) minEarlyVal = val;
            }
        }
        if (minEarlyVal !== null && minEarlyVal > 0) return minEarlyVal;
        if (firstPositiveVal !== null) return firstPositiveVal;
        return firstValidVal;
    };

    try {
        const filterParam = encodeURIComponent(uniqueEntities.join(','));
        const nowIso = new Date().toISOString();
        const monthEndIso = new Date(Math.min(Date.now(), new Date(keys.startOfMonthIso).getTime() + 24 * 3600000)).toISOString();

        const [dayHistRes, monthHistRes] = await Promise.all([
            fetchHaDirectFromBrowser(
                cfg.baseUrl,
                cfg.accessToken,
                `/api/history/period/${encodeURIComponent(keys.startOfDayIso)}?end_time=${encodeURIComponent(nowIso)}&filter_entity_id=${filterParam}&minimal_response&no_attributes`
            ),
            fetchHaDirectFromBrowser(
                cfg.baseUrl,
                cfg.accessToken,
                `/api/history/period/${encodeURIComponent(keys.startOfMonthIso)}?end_time=${encodeURIComponent(monthEndIso)}&filter_entity_id=${filterParam}&minimal_response&no_attributes`
            )
        ]);

        const dayStartMs = new Date(keys.startOfDayIso).getTime();
        if (dayHistRes.ok && Array.isArray(dayHistRes.data)) {
            dayHistRes.data.forEach(arr => {
                const entId = arr?.[0]?.entity_id;
                const val = extractPeriodStartReading(arr, dayStartMs);
                if (entId && val !== null) {
                    const existing = energyCounterBaselines.dayStartByEntity[entId];
                    // Always prefer the earliest/lowest start-of-day reading over a later mid-day anchor
                    if (existing === undefined || existing === null || val <= existing) {
                        energyCounterBaselines.dayStartByEntity[entId] = +val.toFixed(3);
                    }
                }
            });
        }

        const monthStartMs = new Date(keys.startOfMonthIso).getTime();
        if (monthHistRes.ok && Array.isArray(monthHistRes.data)) {
            monthHistRes.data.forEach(arr => {
                const entId = arr?.[0]?.entity_id;
                const val = extractPeriodStartReading(arr, monthStartMs);
                if (entId && val !== null) {
                    const existing = energyCounterBaselines.monthStartByEntity[entId];
                    if (existing === undefined || existing === null || val <= existing) {
                        energyCounterBaselines.monthStartByEntity[entId] = +val.toFixed(3);
                    }
                }
            });
        }

        energyCounterBaselines.lastHistorySyncMs = Date.now();
        saveEnergyCounterBaselines();
    } catch (err) {}
}

function extractHaNumericClient(statesMap, entityId, targetUnitType = null) {
    if (!entityId || typeof entityId !== 'string') return null;
    const cleanId = entityId.trim();
    if (!cleanId) return null;
    const st = statesMap.get(cleanId);
    if (!st || st.state === 'unavailable' || st.state === 'unknown' || st.state === null || st.state === undefined) return null;
    const val = parseFloat(String(st.state).replace(',', '.'));
    if (isNaN(val)) return null;
    const unit = String(st.attributes?.unit_of_measurement || '').trim().toLowerCase();
    if (unit) lastKnownHaUnitMap.set(cleanId, unit);
    if (st.attributes?.state_class) lastKnownHaStateClassMap.set(cleanId, st.attributes.state_class);

    if (targetUnitType === 'W') {
        if (unit === 'kw') return val * 1000;
        if (unit === 'mw') return val * 1000000;
    } else if (targetUnitType === 'kWh') {
        if (unit === 'wh') return val / 1000;
        if (unit === 'mwh') return val * 1000;
    }
    return val;
}

function pickExistingHaEntityId(statesMap, candidates = []) {
    for (const cand of candidates) {
        const id = String(cand.id || '').trim();
        if (!id) continue;
        const val = extractHaNumericClient(statesMap, id, 'kWh');
        if (val !== null) {
            return { id, val, forceCumulative: Boolean(cand.forceCumulative) };
        }
    }
    return { id: '', val: null, forceCumulative: false };
}

function parseHaStatesInBrowser(statesArray, cfg, prebuiltStatesMap = null) {
    const statesMap = prebuiltStatesMap || new Map();
    if (!prebuiltStatesMap) {
        statesArray.forEach(s => {
            if (s && s.entity_id) {
                statesMap.set(s.entity_id, s);
                const u = String(s.attributes?.unit_of_measurement || '').trim().toLowerCase();
                if (u) lastKnownHaUnitMap.set(s.entity_id, u);
                if (s.attributes?.state_class) lastKnownHaStateClassMap.set(s.entity_id, s.attributes.state_class);
            }
        });
    }

    const baseline = getPlannedSystemBaseline();
    const maxPlausibleDailyPvKwh = Math.max(80, (baseline.totalKwp || 15) * 9.5);

    const e = cfg.entities || {};
    const pvPowerW = extractHaNumericClient(statesMap, e.pvPower, 'W');
    const loadPowerW = extractHaNumericClient(statesMap, e.loadPower, 'W');
    let gridPowerW = extractHaNumericClient(statesMap, e.gridPower, 'W');
    const gridImpW = extractHaNumericClient(statesMap, e.gridImportPower, 'W');
    const gridExpW = extractHaNumericClient(statesMap, e.gridExportPower, 'W');
    if (gridPowerW === null && (gridImpW !== null || gridExpW !== null)) {
        gridPowerW = (gridImpW || 0) - (gridExpW || 0);
    }

    // Support 2 separate battery power sensors (Ladeleistung W & Entladeleistung W) + optional combined sensor
    const batChgPowerW = extractHaNumericClient(statesMap, e.batteryChargePower, 'W');
    const batDisPowerW = extractHaNumericClient(statesMap, e.batteryDischargePower, 'W');
    const batCombinedPowerW = extractHaNumericClient(statesMap, e.batteryPower, 'W');
    let batteryPowerW = null;
    if (batChgPowerW !== null || batDisPowerW !== null) {
        batteryPowerW = Math.max(0, batChgPowerW || 0) - Math.max(0, batDisPowerW || 0);
    } else if (batCombinedPowerW !== null) {
        batteryPowerW = batCombinedPowerW;
    }

    const batterySocPct = extractHaNumericClient(statesMap, e.batterySoc, '%');

    const rawGridImpReading = extractHaNumericClient(statesMap, e.gridImportMonth, 'kWh');
    const rawGridExpReading = extractHaNumericClient(statesMap, e.gridExportMonth, 'kWh');
    const rawBatChgReading = extractHaNumericClient(statesMap, e.batteryChargeMonth, 'kWh');
    const rawBatDisReading = extractHaNumericClient(statesMap, e.batteryDischargeMonth, 'kWh');

    const gridImportTodayKwh = resolveEnergyCounterDelta(
        e.gridImportMonth,
        rawGridImpReading,
        energyCounterBaselines.dayStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.gridImportMonth, statesMap, true), maxPlausibleKwh: 180 }
    );
    const gridExportTodayKwh = resolveEnergyCounterDelta(
        e.gridExportMonth,
        rawGridExpReading,
        energyCounterBaselines.dayStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.gridExportMonth, statesMap, true), maxPlausibleKwh: maxPlausibleDailyPvKwh }
    );
    const batteryChargeTodayKwh = resolveEnergyCounterDelta(
        e.batteryChargeMonth,
        rawBatChgReading,
        energyCounterBaselines.dayStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.batteryChargeMonth, statesMap, true), maxPlausibleKwh: 120 }
    );
    const batteryDischargeTodayKwh = resolveEnergyCounterDelta(
        e.batteryDischargeMonth,
        rawBatDisReading,
        energyCounterBaselines.dayStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.batteryDischargeMonth, statesMap, true), maxPlausibleKwh: 120 }
    );

    const gridImportMonthKwh = resolveEnergyCounterDelta(
        e.gridImportMonth,
        rawGridImpReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.gridImportMonth, statesMap, true) }
    );
    const gridExportMonthKwh = resolveEnergyCounterDelta(
        e.gridExportMonth,
        rawGridExpReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.gridExportMonth, statesMap, true) }
    );
    const batteryChargeMonthKwh = resolveEnergyCounterDelta(
        e.batteryChargeMonth,
        rawBatChgReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.batteryChargeMonth, statesMap, true) }
    );
    const batteryDischargeMonthKwh = resolveEnergyCounterDelta(
        e.batteryDischargeMonth,
        rawBatDisReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.batteryDischargeMonth, statesMap, true) }
    );

    const stringTelemetry = {};
    const customStringsTelemetry = [];
    let stringTodayKwhSum = 0;
    let stringTodayKwhCount = 0;
    let stringMonthKwhSum = 0;
    let stringMonthKwhCount = 0;

    if (Array.isArray(cfg.customStrings)) {
        cfg.customStrings.forEach(cs => {
            if (!cs || !cs.id) return;
            const pW = extractHaNumericClient(statesMap, cs.powerEntity, 'W');
            const rawStrKwh = extractHaNumericClient(statesMap, cs.energyEntity, 'kWh');
            const isCumStr = isEntityCumulativeTotal(cs.energyEntity, statesMap, false);
            const eKwh = resolveEnergyCounterDelta(
                cs.energyEntity,
                rawStrKwh,
                energyCounterBaselines.dayStartByEntity,
                {
                    isCumulative: isCumStr,
                    maxPlausibleKwh: maxPlausibleDailyPvKwh
                }
            );
            const eMonthKwh = resolveEnergyCounterDelta(
                cs.energyEntity,
                rawStrKwh,
                energyCounterBaselines.monthStartByEntity,
                { isCumulative: isCumStr }
            );
            if (eKwh !== null && !isNaN(eKwh)) {
                stringTodayKwhSum += eKwh;
                stringTodayKwhCount++;
            }
            if (eMonthKwh !== null && !isNaN(eMonthKwh)) {
                stringMonthKwhSum += eMonthKwh;
                stringMonthKwhCount++;
            }
            stringTelemetry[cs.id] = {
                powerW: pW !== null ? pW : 0,
                energyKwh: eKwh,
                available: pW !== null
            };
            customStringsTelemetry.push({
                id: cs.id,
                name: cs.name || cs.id,
                color: cs.color || '#14b8a6',
                powerEntity: cs.powerEntity || '',
                energyEntity: cs.energyEntity || '',
                powerW: pW !== null ? pW : 0,
                energyKwh: eKwh,
                available: pW !== null
            });
        });
    }

    // Multi-Inverter PV Energy Calculation:
    // Sum all configured inverter PV energy counters (WR 1 + WR 2 + WR 3...).
    // If no inverter counters are configured in Section 5, automatically fall back to the sum of String kWh counters from Section 3!
    const pvCounterIds = getConfiguredPvEnergyEntities(cfg);
    let pvTodaySum = 0;
    let pvTodayValidCount = 0;
    let pvMonthSum = 0;
    let pvMonthValidCount = 0;

    pvCounterIds.forEach(entId => {
        const rawVal = extractHaNumericClient(statesMap, entId, 'kWh');
        if (rawVal === null) return;
        const isCum = isEntityCumulativeTotal(entId, statesMap, false);
        const dToday = resolveEnergyCounterDelta(
            entId,
            rawVal,
            energyCounterBaselines.dayStartByEntity,
            { isCumulative: isCum, maxPlausibleKwh: maxPlausibleDailyPvKwh }
        );
        if (dToday !== null && !isNaN(dToday)) {
            pvTodaySum += dToday;
            pvTodayValidCount++;
        }
        const dMonth = resolveEnergyCounterDelta(
            entId,
            rawVal,
            energyCounterBaselines.monthStartByEntity,
            { isCumulative: isCum }
        );
        if (dMonth !== null && !isNaN(dMonth)) {
            pvMonthSum += dMonth;
            pvMonthValidCount++;
        }
    });

    const pvEnergyTodayKwh = pvTodayValidCount > 0
        ? +pvTodaySum.toFixed(3)
        : (stringTodayKwhCount > 0 ? +stringTodayKwhSum.toFixed(3) : null);

    const pvEnergyMonthKwh = pvMonthValidCount > 0
        ? +pvMonthSum.toFixed(3)
        : (stringMonthKwhCount > 0 ? +stringMonthKwhSum.toFixed(3) : null);

    const consumersTelemetry = [];
    let unavailableConsumersCount = 0;
    if (Array.isArray(cfg.customConsumers)) {
        cfg.customConsumers.forEach(cc => {
            if (!cc || !cc.name) return;
            const pW = extractHaNumericClient(statesMap, cc.powerEntity, 'W');
            if (pW === null) {
                unavailableConsumersCount++;
                consumersTelemetry.push({
                    id: cc.id,
                    name: cc.name,
                    powerEntity: cc.powerEntity,
                    powerW: 0,
                    available: false
                });
            } else {
                consumersTelemetry.push({
                    id: cc.id,
                    name: cc.name,
                    powerEntity: cc.powerEntity,
                    powerW: Math.max(0, pW),
                    available: true
                });
            }
        });
    }

    let finalPvPowerW = pvPowerW;
    if (finalPvPowerW === null && customStringsTelemetry.length > 0) {
        const sumStrings = customStringsTelemetry.reduce((acc, s) => acc + (s.powerW || 0), 0);
        if (sumStrings > 0) finalPvPowerW = sumStrings;
    }

    return {
        updatedAt: new Date().toISOString(),
        pvPowerW: Math.round(finalPvPowerW || 0),
        loadPowerW: Math.round(loadPowerW || 0),
        gridPowerW: Math.round(gridPowerW || 0),
        batteryPowerW: Math.round(batteryPowerW || 0),
        batteryChargePowerW: Math.round(batChgPowerW !== null ? Math.max(0, batChgPowerW) : Math.max(0, batteryPowerW || 0)),
        batteryDischargePowerW: Math.round(batDisPowerW !== null ? Math.max(0, batDisPowerW) : Math.max(0, -(batteryPowerW || 0))),
        batterySocPct,
        pvEnergyTodayKwh,
        gridImportTodayKwh,
        gridExportTodayKwh,
        batteryChargeTodayKwh,
        batteryDischargeTodayKwh,
        pvEnergyMonthKwh,
        gridImportMonthKwh,
        gridExportMonthKwh,
        batteryChargeMonthKwh,
        batteryDischargeMonthKwh,
        stringTelemetry,
        customStringsTelemetry,
        consumersTelemetry,
        unavailableConsumersCount
    };
}

async function fetchHaDirectFromBrowser(rawBaseUrl, rawToken, endpointPath = '/api/states') {
    const cleanUrl = normalizeHaUrlClient(rawBaseUrl);
    const cleanTok = cleanHaTokenClient(rawToken);
    if (!cleanUrl || !cleanTok) {
        return { ok: false, error: 'Bitte Home Assistant URL und Long-Lived Access Token eintragen.', diagnostics: [] };
    }

    const candidateUrls = [cleanUrl];
    // Automatic fallback if user entered https://domain:8123 behind a Reverse Proxy on port 443
    if (/^https:\/\/[^/]+:8123$/i.test(cleanUrl)) {
        candidateUrls.push(cleanUrl.replace(/:8123$/i, ''));
    }

    const diagnostics = [];

    for (const candidateBase of candidateUrls) {
        const fullUrl = `${candidateBase}${endpointPath}`;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 9000);
            const res = await fetch(fullUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${cleanTok}`,
                    'Accept': 'application/json'
                },
                mode: 'cors',
                credentials: 'omit',
                signal: controller.signal
            });
            clearTimeout(timer);

            const text = await res.text();
            const trimmed = (text || '').trim();

            if (!res.ok) {
                diagnostics.push(`HTTP ${res.status} von ${candidateBase}`);
                if (res.status === 401) {
                    return {
                        ok: false,
                        status: 401,
                        usedBaseUrl: candidateBase,
                        error: 'HTTP 401 Unauthorized: Dein Reverse Proxy ist erreichbar, aber das Long-Lived Access Token wurde abgelehnt oder der Authorization-Header vom Proxy gefiltert.',
                        diagnostics
                    };
                }
                if (res.status === 403) {
                    return {
                        ok: false,
                        status: 403,
                        usedBaseUrl: candidateBase,
                        error: 'HTTP 403 Forbidden: Bitte prüfe trusted_proxies und ip_ban_enabled in deiner Home Assistant configuration.yaml.',
                        diagnostics
                    };
                }
                continue;
            }

            if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
                diagnostics.push(`${candidateBase} lieferte eine HTML-Seite statt JSON (z. B. vorgeschalteter Proxy-Login).`);
                continue;
            }

            const json = JSON.parse(trimmed);
            return {
                ok: true,
                status: res.status,
                usedBaseUrl: candidateBase,
                data: json,
                diagnostics: [`Direkte Browser-Verbindung zu ${candidateBase} erfolgreich (HTTP 200 JSON).`]
            };
        } catch (err) {
            diagnostics.push(`Abruf ${candidateBase}: ${err.name === 'AbortError' ? 'Timeout (9s)' : err.message}`);
        }
    }

    const currentOrigin = window.location.origin;
    return {
        ok: false,
        status: 0,
        usedBaseUrl: candidateUrls[candidateUrls.length - 1],
        isCorsOrNetworkError: true,
        error: `Direkter Browser-Zugriff auf ${candidateUrls[candidateUrls.length - 1]}/api/states wurde vom Browser blockiert (CORS-Richtlinie oder Port).`,
        diagnostics: [
            ...diagnostics,
            `WICHTIG für GitHub Pages (${currentOrigin}): Home Assistant verlangt in der configuration.yaml unter http: -> cors_allowed_origins exakt die Domain "${currentOrigin}" (ohne Schrägstrich am Ende, "*" allein wird von Home Assistant ignoriert!).`,
            `Nach Änderung der configuration.yaml muss Home Assistant komplett neu gestartet werden (Entwicklerwerkzeuge → YAML → Home Assistant neu starten).`
        ]
    };
}

async function fetchHaHistoryInBrowser(cfg) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startIso = startOfDay.toISOString();
    const now = new Date();

    const e = cfg.entities || {};
    const entitySet = new Set();
    if (e.pvPower) entitySet.add(e.pvPower.trim());
    if (e.loadPower) entitySet.add(e.loadPower.trim());
    if (e.gridPower) entitySet.add(e.gridPower.trim());
    if (e.gridImportPower) entitySet.add(e.gridImportPower.trim());
    if (e.gridExportPower) entitySet.add(e.gridExportPower.trim());
    if (e.batteryChargePower) entitySet.add(e.batteryChargePower.trim());
    if (e.batteryDischargePower) entitySet.add(e.batteryDischargePower.trim());
    if (e.batteryPower) entitySet.add(e.batteryPower.trim());
    if (e.batterySoc) entitySet.add(e.batterySoc.trim());
    (cfg.customStrings || []).forEach(cs => {
        if (cs && cs.powerEntity) entitySet.add(cs.powerEntity.trim());
    });
    (cfg.customConsumers || []).forEach(cc => {
        if (cc && cc.powerEntity) entitySet.add(cc.powerEntity.trim());
    });

    const entityList = [...entitySet].filter(Boolean);
    if (entityList.length === 0) return null;

    const endpoint = `/api/history/period/${encodeURIComponent(startIso)}?filter_entity_id=${encodeURIComponent(entityList.join(','))}&minimal_response&no_attributes`;
    const histRes = await fetchHaDirectFromBrowser(cfg.baseUrl, cfg.accessToken, endpoint);
    if (!histRes.ok || !Array.isArray(histRes.data)) return null;

    const stepMs = 5 * 60 * 1000;
    const bucketTimes = [];
    for (let t = startOfDay.getTime(); t <= now.getTime(); t += stepMs) {
        bucketTimes.push(t);
    }
    if (bucketTimes.length === 0 || bucketTimes[bucketTimes.length - 1] < now.getTime()) {
        bucketTimes.push(now.getTime());
    }

    const rawSeriesByEntity = new Map();
    histRes.data.forEach(entityHistoryArr => {
        if (!Array.isArray(entityHistoryArr) || entityHistoryArr.length === 0) return;
        const entId = entityHistoryArr[0]?.entity_id;
        if (!entId) return;
        const scale = getPowerScaleForEntity(entId, null);
        const points = [];
        entityHistoryArr.forEach(pt => {
            const val = parseFloat(String(pt.state).replace(',', '.'));
            const ts = new Date(pt.last_changed || pt.last_updated || startIso).getTime();
            if (!isNaN(val) && !isNaN(ts)) points.push({ ts, val: val * scale });
        });
        points.sort((a, b) => a.ts - b.ts);
        rawSeriesByEntity.set(entId, points);
    });

    const sampleEntity = (entityId, scale = 1) => {
        const pts = rawSeriesByEntity.get((entityId || '').trim()) || [];
        if (pts.length === 0) return bucketTimes.map(() => 0);
        let pIdx = 0;
        let lastVal = pts[0].ts <= bucketTimes[0] ? pts[0].val : 0;
        return bucketTimes.map(bTs => {
            while (pIdx < pts.length && pts[pIdx].ts <= bTs) {
                lastVal = pts[pIdx].val;
                pIdx++;
            }
            return +(lastVal * scale).toFixed(2);
        });
    };

    const integrateKwh = (powerArr) => {
        let wh = 0;
        for (let i = 1; i < powerArr.length; i++) {
            const dtH = (bucketTimes[i] - bucketTimes[i - 1]) / 3600000;
            const avgW = Math.max(0, (powerArr[i] + powerArr[i - 1]) / 2);
            wh += avgW * dtH;
        }
        return +(wh / 1000).toFixed(3);
    };

    const series = {};
    const integratedKwh = {};
    const peakValues = {};

    (cfg.customStrings || []).forEach(cs => {
        if (!cs || !cs.id) return;
        const arr = sampleEntity(cs.powerEntity, 1);
        series[cs.id] = arr;
        integratedKwh[cs.id] = integrateKwh(arr);
    });

    if (e.pvPower && rawSeriesByEntity.has(e.pvPower.trim())) {
        series.pv_total = sampleEntity(e.pvPower, 1);
    } else {
        series.pv_total = bucketTimes.map((_, idx) => {
            let sum = 0;
            (cfg.customStrings || []).forEach(cs => {
                if (cs && series[cs.id]) sum += series[cs.id][idx] || 0;
            });
            return +sum.toFixed(1);
        });
    }
    integratedKwh.pv_total = integrateKwh(series.pv_total);

    series.house_load = sampleEntity(e.loadPower, 1);
    integratedKwh.house_load = integrateKwh(series.house_load);

    const gridRaw = sampleEntity(e.gridPower || e.gridImportPower, 1);
    const gridExpExplicit = (e.gridExportPower && rawSeriesByEntity.has(e.gridExportPower.trim()))
        ? sampleEntity(e.gridExportPower, 1)
        : null;

    series.grid_power = gridRaw.map(v => Math.max(0, v));
    series.grid_feedin = bucketTimes.map((_, i) => gridExpExplicit ? Math.max(0, gridExpExplicit[i]) : Math.max(0, -(gridRaw[i] || 0)));
    integratedKwh.grid_power = integrateKwh(series.grid_power);
    integratedKwh.grid_feedin = integrateKwh(series.grid_feedin);

    // Dual Battery Power Sensors (Ladeleistung & Entladeleistung) or single signed batteryPower sensor
    const hasSeparateBatChg = Boolean(e.batteryChargePower && rawSeriesByEntity.has(e.batteryChargePower.trim()));
    const hasSeparateBatDis = Boolean(e.batteryDischargePower && rawSeriesByEntity.has(e.batteryDischargePower.trim()));

    if (hasSeparateBatChg || hasSeparateBatDis) {
        const chgArr = hasSeparateBatChg ? sampleEntity(e.batteryChargePower, 1).map(v => Math.max(0, v)) : bucketTimes.map(() => 0);
        const disArr = hasSeparateBatDis ? sampleEntity(e.batteryDischargePower, 1).map(v => Math.max(0, v)) : bucketTimes.map(() => 0);
        series.battery_power = bucketTimes.map((_, i) => +((chgArr[i] || 0) - (disArr[i] || 0)).toFixed(2));
        integratedKwh.battery_charge = integrateKwh(chgArr);
        integratedKwh.battery_discharge = integrateKwh(disArr);
        integratedKwh.battery_power = +(integratedKwh.battery_charge + integratedKwh.battery_discharge).toFixed(3);
    } else {
        const batRaw = sampleEntity(e.batteryPower, 1);
        series.battery_power = batRaw;
        const batChgArr = batRaw.map(v => Math.max(0, v));
        const batDisArr = batRaw.map(v => Math.max(0, -v));
        integratedKwh.battery_charge = integrateKwh(batChgArr);
        integratedKwh.battery_discharge = integrateKwh(batDisArr);
        integratedKwh.battery_power = +(integratedKwh.battery_charge + integratedKwh.battery_discharge).toFixed(3);
    }

    series.battery_soc = sampleEntity(e.batterySoc, 1);

    (cfg.customConsumers || []).forEach(cc => {
        if (!cc || !cc.id) return;
        const cKey = `consumer_${cc.id}`;
        const arr = sampleEntity(cc.powerEntity, 1).map(v => Math.max(0, v));
        series[cKey] = arr;
        integratedKwh[cKey] = integrateKwh(arr);
    });

    Object.keys(series).forEach(k => {
        const arr = series[k] || [];
        peakValues[k] = arr.reduce((m, v) => Math.max(m, Math.abs(v || 0)), 0);
    });

    return {
        startOfDay: startIso,
        now: now.toISOString(),
        bucketTimes,
        series,
        integratedKwh,
        peakValues
    };
}

async function refreshLiveTelemetryNow() {
    const baseline = getPlannedSystemBaseline();

    // If no Home Assistant token is configured yet, display initial fallback values without demo slider
    if (!haConfigState.accessToken && haConfigState.mode !== 'webhook') {
        computeDemoLiveTelemetry(baseline);
        buildDemoIntradaySeries(baseline);
        currentLiveTelemetry.connectionOk = false;
        currentLiveTelemetry.lastError = 'Bitte Token & Sensoren unter „HA & Sensoren“ wählen.';
        renderLiveCockpitUI(baseline);
        renderIntradayCurveSection(baseline);
        return;
    }

    // 1. Try Browser-Direct Home Assistant API first (works on GitHub Pages & local LAN/VPN)
    const directRes = await fetchHaDirectFromBrowser(haConfigState.baseUrl, haConfigState.accessToken, '/api/states');
    if (directRes.ok && Array.isArray(directRes.data)) {
        if (directRes.usedBaseUrl && directRes.usedBaseUrl !== haConfigState.baseUrl) {
            haConfigState.baseUrl = directRes.usedBaseUrl;
            localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
        }

        // Build statesMap first so unit scaling (Wh/kWh/MWh) & state_class are known before syncing 00:00 history baselines!
        const statesMap = new Map();
        directRes.data.forEach(s => {
            if (s && s.entity_id) {
                statesMap.set(s.entity_id, s);
                const u = String(s.attributes?.unit_of_measurement || '').trim().toLowerCase();
                if (u) lastKnownHaUnitMap.set(s.entity_id, u);
                if (s.attributes?.state_class) lastKnownHaStateClassMap.set(s.entity_id, s.attributes.state_class);
            }
        });

        await syncEnergyCounterBaselinesFromHaHistory(haConfigState, statesMap);

        const parsed = parseHaStatesInBrowser(directRes.data, haConfigState, statesMap);
        currentLiveTelemetry = {
            ...currentLiveTelemetry,
            ...parsed,
            batterySocPct: parsed.batterySocPct !== null && parsed.batterySocPct !== undefined
                ? +(Number(parsed.batterySocPct).toFixed(1))
                : (baseline.totalBatteryKwh > 0 ? 50 : null),
            connectionOk: true,
            lastError: null
        };
        if (haConfigState.autoSyncMonthly && parsed.pvEnergyMonthKwh !== null && parsed.pvEnergyMonthKwh !== undefined && parsed.pvEnergyMonthKwh > 0) {
            syncCurrentMonthFromLiveTelemetry(false);
        }
        renderLiveCockpitUI(baseline);
        renderIntradayCurveSection(baseline);
        return;
    }

    // Ensure today & month start counter baselines are loaded for fallback backend path
    await syncEnergyCounterBaselinesFromHaHistory(haConfigState, null);

    // 2. Fallback to backend /api/ha/states (when running with Node.js server.js)
    const backendRes = await safeFetchBackendJson('/api/ha/states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: haConfigState })
    });

    if (backendRes.ok && backendRes.data && backendRes.data.success && backendRes.data.telemetry) {
        const data = backendRes.data;
        const t = data.telemetry;
        const e = haConfigState.entities || {};
        const primaryPvCounterId = (e.pvEnergyMonth || e.pvEnergyTotal || e.pvEnergyToday || '').trim();
        const todayPvCounterId = (e.pvEnergyToday || e.pvEnergyMonth || e.pvEnergyTotal || '').trim();
        const maxPlausibleDailyPvKwh = Math.max(80, (baseline.totalKwp || 15) * 9.5);

        currentLiveTelemetry = {
            updatedAt: data.updatedAt || new Date().toISOString(),
            pvPowerW: Math.round(t.pvPowerW || 0),
            loadPowerW: Math.round(t.loadPowerW || 0),
            gridPowerW: Math.round(t.gridPowerW || 0),
            batteryPowerW: Math.round(t.batteryPowerW || 0),
            batterySocPct: t.batterySocPct !== null && t.batterySocPct !== undefined ? +(Number(t.batterySocPct).toFixed(1)) : (baseline.totalBatteryKwh > 0 ? 50 : null),
            pvEnergyTodayKwh: resolveEnergyCounterDelta(todayPvCounterId, t.pvEnergyTodayKwh ?? t.pvEnergyMonthKwh, energyCounterBaselines.dayStartByEntity, {
                isCumulative: !e.pvEnergyToday || isEntityCumulativeTotal(todayPvCounterId, null, false),
                maxPlausibleKwh: maxPlausibleDailyPvKwh
            }),
            gridImportTodayKwh: resolveEnergyCounterDelta(e.gridImportMonth, t.gridImportMonthKwh, energyCounterBaselines.dayStartByEntity, { isCumulative: true, maxPlausibleKwh: 180 }),
            gridExportTodayKwh: resolveEnergyCounterDelta(e.gridExportMonth, t.gridExportMonthKwh, energyCounterBaselines.dayStartByEntity, { isCumulative: true, maxPlausibleKwh: maxPlausibleDailyPvKwh }),
            batteryChargeTodayKwh: resolveEnergyCounterDelta(e.batteryChargeMonth, t.batteryChargeMonthKwh, energyCounterBaselines.dayStartByEntity, { isCumulative: true, maxPlausibleKwh: 120 }),
            batteryDischargeTodayKwh: resolveEnergyCounterDelta(e.batteryDischargeMonth, t.batteryDischargeMonthKwh, energyCounterBaselines.dayStartByEntity, { isCumulative: true, maxPlausibleKwh: 120 }),
            pvEnergyMonthKwh: resolveEnergyCounterDelta(primaryPvCounterId, t.pvEnergyMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true }),
            gridImportMonthKwh: resolveEnergyCounterDelta(e.gridImportMonth, t.gridImportMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true }),
            gridExportMonthKwh: resolveEnergyCounterDelta(e.gridExportMonth, t.gridExportMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true }),
            batteryChargeMonthKwh: resolveEnergyCounterDelta(e.batteryChargeMonth, t.batteryChargeMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true }),
            batteryDischargeMonthKwh: resolveEnergyCounterDelta(e.batteryDischargeMonth, t.batteryDischargeMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true }),
            stringTelemetry: data.stringTelemetry || {},
            customStringsTelemetry: Array.isArray(data.customStringsTelemetry) ? data.customStringsTelemetry : [],
            consumersTelemetry: Array.isArray(data.consumersTelemetry) ? data.consumersTelemetry : [],
            unavailableConsumersCount: t.unavailableConsumersCount ?? 0,
            connectionOk: true,
            lastError: null
        };

        if (haConfigState.autoSyncMonthly && currentLiveTelemetry.pvEnergyMonthKwh !== null && currentLiveTelemetry.pvEnergyMonthKwh > 0) {
            syncCurrentMonthFromLiveTelemetry(false);
        }
    } else {
        currentLiveTelemetry.connectionOk = false;
        currentLiveTelemetry.lastError = directRes.error || backendRes.data?.error || 'Home Assistant nicht erreichbar (CORS / Token prüfen).';
    }

    renderLiveCockpitUI(baseline);
    renderIntradayCurveSection(baseline);
}

function computeDemoLiveTelemetry(baseline) {
    const hour = parseFloat(demoSimHour) || 11.27;
    let sunFactor = 0;
    if (hour > 6 && hour < 20.5) {
        sunFactor = Math.pow(Math.sin(((hour - 6) / 14.5) * Math.PI), 1.35);
    }
    const jitter = 0.992 + (Math.sin(Date.now() / 5000) * 0.008);

    const customStrings = Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.length > 0
        ? haConfigState.customStrings
        : DEFAULT_CUSTOM_STRINGS;

    const baseWeights = [0.43, 0.41, 0.16, 0.25, 0.25];
    let totalPvW = 0;
    const strTele = {};
    const customStringsTele = [];

    const dayProgress = Math.max(0.02, Math.min(1, (hour - 6.2) / 13.5));

    customStrings.forEach((cs, idx) => {
        const w = baseWeights[idx % baseWeights.length];
        const refPeak = 920;
        const pW = Math.max(0, Math.round(refPeak * w * (sunFactor / 0.778) * jitter));
        totalPvW += pW;

        const eKwh = +(pW * dayProgress * 1.85 / 1000).toFixed(3);
        strTele[cs.id] = { powerW: pW, energyKwh: eKwh };
        customStringsTele.push({
            id: cs.id,
            name: cs.name,
            color: cs.color || '#14b8a6',
            powerEntity: cs.powerEntity || '',
            energyEntity: cs.energyEntity || '',
            powerW: pW,
            energyKwh: cs.energyEntity ? eKwh : null,
            available: true
        });
    });

    baseline.stringSummaries.forEach((s) => {
        const pW = Math.round(totalPvW / Math.max(1, baseline.stringSummaries.length));
        strTele[s.id] = { powerW: pW, energyKwh: +(pW * dayProgress * 1.8 / 1000).toFixed(2) };
    });

    const customConsumers = Array.isArray(haConfigState.customConsumers) ? haConfigState.customConsumers : DEFAULT_CUSTOM_CONSUMERS;
    const demoConsumerWattPresets = [429, 76, 36, 36, 120, 48, 18];
    const consumersTele = customConsumers.map((cc, idx) => {
        let baseW = demoConsumerWattPresets[idx % demoConsumerWattPresets.length];
        if (hour < 7 || hour > 22) {
            baseW = idx === 1 ? 76 : (idx === 3 ? 36 : 0);
        }
        return {
            id: cc.id,
            name: cc.name,
            powerEntity: cc.powerEntity,
            powerW: Math.round(baseW * jitter),
            available: true
        };
    });

    const sumConsumersW = consumersTele.reduce((acc, c) => acc + c.powerW, 0);
    const loadW = Math.round(Math.max(sumConsumersW + 350, (hour >= 10 && hour <= 14 ? 2100 : 1250) * jitter));

    let soc = 8.4;
    let batW = 0;
    if (hour <= 8.75) {
        soc = +(48.5 - (hour / 8.75) * (48.5 - 8.4)).toFixed(1);
        batW = -180;
    } else if (totalPvW > loadW + 150) {
        batW = Math.round(totalPvW - loadW);
        soc = +(Math.min(98, 8.4 + ((hour - 8.75) * 6.5))).toFixed(1);
    } else {
        soc = 8.4;
        batW = 0;
    }

    const gridW = Math.round(loadW + batW - totalPvW);
    const pvTodayKwh = +(customStringsTele.reduce((a, b) => a + (b.powerW * dayProgress * 1.9 / 1000), 0)).toFixed(3);

    const curMonth = new Date().getMonth();
    const curDay = new Date().getDate();
    const monthFrac = Math.min(1, curDay / 30);
    const sollThisMonth = baseline.monthlySollTotal[curMonth] || (baseline.totalKwp * 85);

    currentLiveTelemetry = {
        updatedAt: new Date().toISOString(),
        pvPowerW: totalPvW,
        loadPowerW: loadW,
        gridPowerW: gridW,
        batteryPowerW: batW,
        batterySocPct: soc,
        pvEnergyTodayKwh: pvTodayKwh,
        gridImportTodayKwh: null,
        gridExportTodayKwh: null,
        batteryChargeTodayKwh: null,
        batteryDischargeTodayKwh: null,
        pvEnergyMonthKwh: +(sollThisMonth * monthFrac * 1.04).toFixed(1),
        gridImportMonthKwh: +(baseline.plannedConsKwh / 12 * monthFrac * 0.24).toFixed(1),
        gridExportMonthKwh: +(sollThisMonth * monthFrac * 0.58).toFixed(1),
        batteryChargeMonthKwh: baseline.totalBatteryKwh > 0 ? +(baseline.totalBatteryKwh * 18 * monthFrac).toFixed(1) : 0,
        batteryDischargeMonthKwh: baseline.totalBatteryKwh > 0 ? +(baseline.totalBatteryKwh * 16.4 * monthFrac).toFixed(1) : 0,
        stringTelemetry: strTele,
        customStringsTelemetry: customStringsTele,
        consumersTelemetry: consumersTele,
        unavailableConsumersCount: 1,
        connectionOk: true,
        lastError: null
    };
}

function buildDemoIntradaySeries(baseline) {
    const now = new Date();
    const endHour = parseFloat(demoSimHour) || 11.27;
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const customStrings = Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.length > 0
        ? haConfigState.customStrings
        : DEFAULT_CUSTOM_STRINGS;
    const customConsumers = Array.isArray(haConfigState.customConsumers) ? haConfigState.customConsumers : DEFAULT_CUSTOM_CONSUMERS;

    // 10-minute steps from 00:00 up to demoSimHour
    const stepHours = 10 / 60;
    const bucketTimes = [];
    const labels = [];
    const series = {
        pv_total: [],
        house_load: [],
        grid_power: [],
        grid_feedin: [],
        battery_power: [],
        battery_soc: []
    };
    customStrings.forEach(cs => { series[cs.id] = []; });
    customConsumers.forEach(cc => { if (cc && cc.id) series[`consumer_${cc.id}`] = []; });

    const baseWeights = [0.43, 0.41, 0.16, 0.25, 0.25];
    const demoConsumerPresets = [429, 76, 36, 36, 120, 48, 18];

    for (let h = 0; h <= endHour + 0.001; h += stepHours) {
        const clampedH = Math.min(endHour, h);
        const ts = startOfDay.getTime() + Math.round(clampedH * 3600000);
        bucketTimes.push(ts);

        const hrs = Math.floor(clampedH);
        const mins = Math.round((clampedH - hrs) * 60);
        labels.push(`${String(hrs).padStart(2, '0')}:${String(mins === 60 ? 59 : mins).padStart(2, '0')}`);

        let sun = 0;
        if (clampedH > 7.4 && clampedH < 20.0) {
            const rawSun = Math.pow(Math.sin(((clampedH - 7.4) / 11.5) * Math.PI), 1.45);
            const cloudWave = 0.68 + 0.35 * Math.sin(clampedH * 14.2) * Math.cos(clampedH * 6.7) + 0.22 * Math.sin(clampedH * 29.0);
            sun = Math.max(0.02, rawSun * Math.max(0.25, cloudWave));
        }

        let stepPvSum = 0;
        customStrings.forEach((cs, idx) => {
            const w = baseWeights[idx % baseWeights.length];
            const strMod = 0.92 + 0.16 * Math.sin(clampedH * 9 + idx * 1.7);
            const valW = clampedH <= 7.4 ? (idx === 0 ? 0.6 : (idx === 1 ? 0.3 : 0)) : Math.round(960 * w * sun * strMod);
            series[cs.id].push(valW);
            stepPvSum += valW;
        });

        series.pv_total.push(Math.round(stepPvSum * 10) / 10);

        let socVal = 8.4;
        let batW = 0;
        if (clampedH < 5.5) {
            socVal = 48.5 - (clampedH / 5.5) * (48.5 - 32.0);
            batW = -210;
        } else if (clampedH < 8.65) {
            socVal = 32.0 - ((clampedH - 5.5) / 3.15) * (32.0 - 8.4);
            batW = -340;
        } else if (stepPvSum > 1800) {
            socVal = Math.min(95, 8.4 + (clampedH - 8.65) * 4.5);
            batW = Math.round(stepPvSum - 1200);
        }
        series.battery_soc.push(+(socVal.toFixed(1)));
        series.battery_power.push(batW);

        // Individual consumers
        customConsumers.forEach((cc, idx) => {
            if (!cc || !cc.id) return;
            const cKey = `consumer_${cc.id}`;
            const presetW = demoConsumerPresets[idx % demoConsumerPresets.length];
            let cVal = 0;
            if (idx === 0) {
                cVal = (clampedH >= 9.6 && clampedH <= 12.2) ? Math.round(presetW * (0.85 + 0.2 * Math.sin(clampedH * 8))) : 0;
            } else if (idx === 1) {
                cVal = clampedH >= 7.5 ? presetW : 12;
            } else {
                cVal = (clampedH >= 6.5 && clampedH <= 9.0) || clampedH >= 10.5 ? presetW : 0;
            }
            series[cKey].push(cVal);
        });

        // House load, Grid import & Grid export
        const loadVal = Math.round(420 + (clampedH >= 7 && clampedH <= 9 ? 950 : 0) + (clampedH >= 10.2 ? 1680 : 180) + 120 * Math.sin(clampedH * 5));
        series.house_load.push(loadVal);
        const netGrid = Math.round(loadVal + batW - stepPvSum);
        series.grid_power.push(Math.max(0, netGrid));
        series.grid_feedin.push(Math.max(0, -netGrid));
    }

    // Force final point to match currentLiveTelemetry
    const lastIdx = bucketTimes.length - 1;
    if (lastIdx >= 0) {
        series.pv_total[lastIdx] = currentLiveTelemetry.pvPowerW;
        series.house_load[lastIdx] = currentLiveTelemetry.loadPowerW;
        series.grid_power[lastIdx] = Math.max(0, currentLiveTelemetry.gridPowerW);
        series.grid_feedin[lastIdx] = Math.max(0, -(currentLiveTelemetry.gridPowerW || 0));
        series.battery_power[lastIdx] = currentLiveTelemetry.batteryPowerW || 0;
        series.battery_soc[lastIdx] = currentLiveTelemetry.batterySocPct ?? 8.4;
        (currentLiveTelemetry.customStringsTelemetry || []).forEach(cs => {
            if (series[cs.id]) series[cs.id][lastIdx] = cs.powerW;
        });
        (currentLiveTelemetry.consumersTelemetry || []).forEach(cc => {
            const cKey = `consumer_${cc.id}`;
            if (series[cKey]) series[cKey][lastIdx] = cc.powerW || 0;
        });
    }

    const integratePositive = (arr) => {
        let wh = 0;
        for (let i = 1; i < arr.length; i++) {
            const dtH = (bucketTimes[i] - bucketTimes[i - 1]) / 3600000;
            wh += Math.max(0, (arr[i] + arr[i - 1]) / 2) * dtH;
        }
        return +(wh / 1000).toFixed(3);
    };

    const integratedKwh = {};
    const peakValues = {};
    Object.keys(series).forEach(key => {
        const arr = series[key] || [];
        peakValues[key] = arr.reduce((m, v) => Math.max(m, Math.abs(v || 0)), 0);
        if (key === 'battery_soc') return;
        if (key === 'battery_power') {
            integratedKwh.battery_charge = integratePositive(arr.map(v => Math.max(0, v)));
            integratedKwh.battery_discharge = integratePositive(arr.map(v => Math.max(0, -v)));
            integratedKwh.battery_power = +(integratedKwh.battery_charge + integratedKwh.battery_discharge).toFixed(3);
            return;
        }
        integratedKwh[key] = integratePositive(arr);
    });

    intradaySeriesState = {
        startOfDayIso: startOfDay.toISOString(),
        nowIso: new Date(startOfDay.getTime() + Math.round(endHour * 3600000)).toISOString(),
        labels,
        bucketTimes,
        series,
        integratedKwh,
        peakValues
    };
}

async function fetchAndRenderIntradayHistory() {
    const baseline = getPlannedSystemBaseline();
    if (!haConfigState.accessToken && haConfigState.mode !== 'webhook') {
        buildDemoIntradaySeries(baseline);
        renderIntradayCurveSection(baseline);
        return;
    }

    // 1. Try Browser-Direct Home Assistant History API first (GitHub Pages compatible)
    try {
        const directHist = await fetchHaHistoryInBrowser(haConfigState);
        if (directHist && Array.isArray(directHist.bucketTimes) && directHist.bucketTimes.length > 0) {
            const labels = directHist.bucketTimes.map(ts => {
                const d = new Date(ts);
                return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            });
            intradaySeriesState = {
                startOfDayIso: directHist.startOfDay,
                nowIso: directHist.now,
                labels,
                bucketTimes: directHist.bucketTimes,
                series: directHist.series,
                integratedKwh: directHist.integratedKwh || {},
                peakValues: directHist.peakValues || {}
            };
            renderIntradayCurveSection(baseline);
            return;
        }
    } catch (e) {}

    // 2. Fallback to backend /api/ha/history (safe JSON check)
    try {
        const backendRes = await safeFetchBackendJson('/api/ha/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: haConfigState })
        });
        const data = backendRes.data;

        if (backendRes.ok && data && data.success) {
            if (Array.isArray(data.bucketTimes) && data.bucketTimes.length > 0 && data.series) {
                const labels = data.bucketTimes.map(ts => {
                    const d = new Date(ts);
                    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                });
                const peakValues = {};
                Object.keys(data.series).forEach(k => {
                    peakValues[k] = (data.series[k] || []).reduce((m, v) => Math.max(m, Math.abs(v || 0)), 0);
                });
                intradaySeriesState = {
                    startOfDayIso: data.startOfDay,
                    nowIso: data.now,
                    labels,
                    bucketTimes: data.bucketTimes,
                    series: data.series,
                    integratedKwh: data.integratedKwh || {},
                    peakValues
                };
            } else if (!intradaySeriesState.labels || intradaySeriesState.labels.length === 0) {
                buildDemoIntradaySeries(baseline);
            }
        } else if (!intradaySeriesState.labels || intradaySeriesState.labels.length === 0) {
            buildDemoIntradaySeries(baseline);
        }
    } catch (e) {
        if (!intradaySeriesState.labels || intradaySeriesState.labels.length === 0) {
            buildDemoIntradaySeries(baseline);
        }
    }

    renderIntradayCurveSection(baseline);
}

function setLiveTelemetryMode(newMode) {
    haConfigState.mode = newMode;
    localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
    fetch('/api/ha/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: haConfigState })
    }).catch(() => {});

    refreshIntradayHistoryAndLive();
}

function onDemoHourSliderChange(val) {
    demoSimHour = parseFloat(val) || 11.27;
    const hrs = Math.floor(demoSimHour);
    const mins = Math.round((demoSimHour - hrs) * 60);
    const lbl = document.getElementById('demoTimeLabel');
    if (lbl) lbl.innerText = `${String(hrs).padStart(2, '0')}:${String(mins === 60 ? 59 : mins).padStart(2, '0')} Uhr`;
    const baseline = getPlannedSystemBaseline();
    computeDemoLiveTelemetry(baseline);
    buildDemoIntradaySeries(baseline);
    renderLiveCockpitUI(baseline);
    renderIntradayCurveSection(baseline);
}

function formatPowerDe(watts, forceUnitW = false) {
    const w = Number(watts) || 0;
    const absW = Math.abs(w);
    if (!forceUnitW && absW >= 1000) {
        const kw = absW / 1000;
        const decimals = kw >= 10 ? 1 : (Math.round(kw * 100) % 10 === 0 ? 1 : 2);
        return `${kw.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: decimals })} kW`;
    }
    return `${Math.round(absW).toLocaleString('de-DE')} W`;
}

function formatKwhDe(kwhVal, decimals = 3) {
    const v = Number(kwhVal) || 0;
    return `${v.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} kWh`;
}

// ============================================================================
// 4. RENDERING: START-DASHBOARD ("SOLAR & NETZ · LIVE")
// ============================================================================

function renderLiveTab() {
    const baseline = getPlannedSystemBaseline();
    refreshIntradayHistoryAndLive();
}

function renderAnalyseTab() {
    const baseline = getPlannedSystemBaseline();
    renderAnalysisSection(baseline);
}

function renderLiveCockpitUI(baseline) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const t = currentLiveTelemetry;
    const intKwh = intradaySeriesState.integratedKwh || {};

    // 1. Update Connection Status Pill
    const statusText = document.getElementById('liveConnectionStatusText');
    if (statusText) {
        if (t.connectionOk) {
            const timeStr = t.updatedAt ? new Date(t.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'jetzt';
            statusText.className = "text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 truncate";
            statusText.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1"></span><span>HA Live · ${timeStr}</span>`;
        } else {
            statusText.className = "text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 truncate";
            statusText.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1"></span><span>${typeof escapeHtml === 'function' ? escapeHtml(t.lastError || 'HA verbinden') : (t.lastError || 'HA verbinden')}</span>`;
        }
    }

    // 2. Render "Energie · jetzt" 2x2 Interactive Status Tiles (Value-First 2-Line Subblock -> Never Truncated!)
    const maxPvRefW = Math.max(1500, baseline.totalKwp * 1000);
    const pvBarPct = Math.min(100, Math.max(t.pvPowerW > 0 ? 4 : 0, Math.round((t.pvPowerW / maxPvRefW) * 100)));
    setElText('dash_pv_power', formatPowerDe(t.pvPowerW, t.pvPowerW < 1000));
    const pvTodayVal = (t.pvEnergyTodayKwh !== null && t.pvEnergyTodayKwh !== undefined)
        ? t.pvEnergyTodayKwh
        : (intKwh.pv_total ?? 0);
    const pvLine1 = `${formatKwhDe(pvTodayVal, 2)} heute`;
    const pvLine2 = t.pvPowerW > 15 ? 'Erzeugung aktiv' : 'Standby · DC';
    setElText('dash_pv_status', pvLine1);
    setElText('dash_pv_sub2', pvLine2);
    setElText('dash_pv_sub', `${pvLine1} · ${pvLine2}`);
    const pvBar = document.getElementById('dash_pv_bar');
    if (pvBar) pvBar.style.width = `${pvBarPct}%`;

    const loadBarPct = Math.min(100, Math.max(6, Math.round((t.loadPowerW / 5000) * 100)));
    setElText('dash_load_power', formatPowerDe(t.loadPowerW));
    const loadTodayVal = intKwh.house_load ?? 0;
    const loadLine1 = `${formatKwhDe(loadTodayVal, 2)} heute`;
    const loadLine2 = 'Hausverbrauch · AC';
    setElText('dash_load_status', loadLine1);
    setElText('dash_load_sub2', loadLine2);
    setElText('dash_load_sub', `${loadLine1} · ${loadLine2}`);
    const loadBar = document.getElementById('dash_load_bar');
    if (loadBar) loadBar.style.width = `${loadBarPct}%`;

    const batTitle = haConfigState.batteryName || baseline.detectedBatteryName || 'BYD HVS+';
    setElText('dash_bat_title', batTitle);
    const socNum = t.batterySocPct !== null && t.batterySocPct !== undefined ? Number(t.batterySocPct) : 0;
    const socFormatted = t.batterySocPct !== null && t.batterySocPct !== undefined
        ? `${socNum.toLocaleString('de-DE', { minimumFractionDigits: socNum % 1 !== 0 ? 1 : 0, maximumFractionDigits: 1 })} %`
        : '—';
    setElText('dash_bat_soc', socFormatted);

    let batLine1 = '0 W · Standby';
    if (t.batteryPowerW > 15) batLine1 = `+${formatPowerDe(t.batteryPowerW, true)} · Lädt`;
    else if (t.batteryPowerW < -15) batLine1 = `−${formatPowerDe(Math.abs(t.batteryPowerW), true)} · Entlädt`;
    const batChgToday = (t.batteryChargeTodayKwh !== null && t.batteryChargeTodayKwh !== undefined)
        ? t.batteryChargeTodayKwh
        : (intKwh.battery_charge ?? 0);
    const batDisToday = (t.batteryDischargeTodayKwh !== null && t.batteryDischargeTodayKwh !== undefined)
        ? t.batteryDischargeTodayKwh
        : (intKwh.battery_discharge ?? 0);
    const batLine2 = `↑ ${batChgToday.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · ↓ ${batDisToday.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`;
    setElText('dash_bat_status', batLine1);
    setElText('dash_bat_sub2', batLine2);
    setElText('dash_bat_sub', `${batLine1} · ${batLine2}`);
    const batBar = document.getElementById('dash_bat_bar');
    if (batBar) batBar.style.width = `${Math.min(100, Math.max(4, socNum))}%`;

    const absGridW = Math.abs(t.gridPowerW || 0);
    const gridBarPct = Math.min(100, Math.max(absGridW > 10 ? 5 : 0, Math.round((absGridW / 5000) * 100)));
    setElText('dash_grid_power', formatPowerDe(absGridW));
    const gridImpToday = (t.gridImportTodayKwh !== null && t.gridImportTodayKwh !== undefined)
        ? t.gridImportTodayKwh
        : (intKwh.grid_power ?? 0);
    const gridExpToday = (t.gridExportTodayKwh !== null && t.gridExportTodayKwh !== undefined)
        ? t.gridExportTodayKwh
        : (intKwh.grid_feedin ?? 0);

    let gridLine1 = `${formatKwhDe(gridImpToday, 2)} Bezug`;
    let gridLine2 = `↑ ${formatKwhDe(gridExpToday, 2)} Einsp.`;
    if (t.gridPowerW < -15) {
        gridLine1 = `${formatKwhDe(gridExpToday, 2)} Einsp.`;
        gridLine2 = `↓ ${formatKwhDe(gridImpToday, 2)} Bezug`;
    } else if (t.gridPowerW > 15) {
        gridLine1 = `${formatKwhDe(gridImpToday, 2)} Bezug`;
        gridLine2 = `Netzbezug aktiv`;
    }
    setElText('dash_grid_status', gridLine1);
    setElText('dash_grid_sub2', gridLine2);
    setElText('dash_grid_sub', `${gridLine1} · ${gridLine2}`);
    const gridBar = document.getElementById('dash_grid_bar');
    if (gridBar) gridBar.style.width = `${gridBarPct}%`;

    // 2B. Token-Missing Banner when a shared/GitHub project was loaded with sensor entities but no local token
    const tokenBannerEl = document.getElementById('liveMissingTokenBanner');
    if (tokenBannerEl) {
        const hasEntitiesConfigured = Boolean(
            haConfigState.baseUrl &&
            ((haConfigState.customStrings && haConfigState.customStrings.length > 0) ||
             (haConfigState.entities && Object.values(haConfigState.entities).some(Boolean)))
        );
        if (!haConfigState.accessToken && hasEntitiesConfigured) {
            tokenBannerEl.classList.remove('hidden');
        } else {
            tokenBannerEl.classList.add('hidden');
        }
    }

    // 3. Render Interactive "Aktive Verbraucher" List (Top 5 with Expand/Collapse + Tap -> Jump to Telemetry Curve Focus)
    const consContainer = document.getElementById('dash_active_consumers_list');
    if (consContainer) {
        const consumers = Array.isArray(t.consumersTelemetry) && t.consumersTelemetry.length > 0
            ? [...t.consumersTelemetry]
            : (haConfigState.customConsumers || []).map(c => ({ id: c.id, name: c.name, powerW: 0, available: false }));

        consumers.sort((a, b) => (b.powerW || 0) - (a.powerW || 0));

        if (consumers.length === 0) {
            consContainer.innerHTML = `
                <div class="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Noch keine Einzelverbraucher-Sensoren hinterlegt.</span>
                    <button onclick="openHaConfigModal('consumers')" class="text-teal-600 dark:text-teal-400 font-bold hover:underline cursor-pointer">+ Anlegen</button>
                </div>`;
        } else {
            const TOP_LIMIT = 5;
            const visibleConsumers = showAllDashboardConsumers ? consumers : consumers.slice(0, TOP_LIMIT);
            const hiddenCount = Math.max(0, consumers.length - TOP_LIMIT);

            const rowsHtml = visibleConsumers.map(c => {
                const safeName = typeof escapeHtml === 'function' ? escapeHtml(c.name) : c.name;
                const valStr = `${Math.round(c.powerW || 0).toLocaleString('de-DE')} W`;
                const consKwh = intKwh[`consumer_${c.id}`] ?? 0;
                const sharePct = t.loadPowerW > 20 ? Math.min(100, Math.round(((c.powerW || 0) / t.loadPowerW) * 100)) : 0;
                const metaText = consKwh > 0.005
                    ? `${formatKwhDe(consKwh, 2)}${sharePct > 0 ? ` · ${sharePct}%` : ''}`
                    : (sharePct > 0 ? `${sharePct}% Hauslast` : 'Kurve');
                const safeIdJs = String(c.id || '').replace(/'/g, "\\'");

                return `
                <div onclick="openLiveCurveFocus('consumer:${safeIdJs}')"
                    role="button" tabindex="0" title="Tippen für Verlaufskurve (${safeName})"
                    class="rounded-2xl bg-white/90 dark:bg-[#162329] border border-slate-200/90 dark:border-slate-700/70 hover:border-teal-500/50 px-4 py-2.5 flex items-center justify-between shadow-2xs transition-all cursor-pointer group active:scale-[0.99]">
                    <div class="flex items-center gap-2.5 min-w-0 pr-3">
                        <span class="material-symbols-rounded text-base text-slate-400 group-hover:text-teal-500 dark:group-hover:text-teal-400 transition-colors shrink-0">show_chart</span>
                        <span class="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-300 truncate">${safeName}</span>
                    </div>
                    <div class="flex items-baseline gap-2.5 shrink-0 font-mono tabular-nums">
                        <span class="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">${metaText}</span>
                        <span class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">${valStr}</span>
                    </div>
                </div>`;
            }).join('');

            const expandBtnHtml = consumers.length > TOP_LIMIT ? `
                <button type="button" onclick="toggleShowAllDashboardConsumers()"
                    class="w-full mt-1.5 py-2 px-3 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer">
                    <span class="material-symbols-rounded text-base text-teal-600 dark:text-teal-400">${showAllDashboardConsumers ? 'expand_less' : 'expand_more'}</span>
                    <span>${showAllDashboardConsumers ? 'Auf Top 5 Verbraucher reduzieren' : `Alle ${consumers.length} Verbraucher anzeigen (+${hiddenCount} weitere)`}</span>
                </button>` : '';

            consContainer.innerHTML = rowsHtml + expandBtnHtml;
        }

        const fnEl = document.getElementById('dash_consumers_footnote');
        if (fnEl) {
            const unavail = t.unavailableConsumersCount || 0;
            const unavailText = unavail > 0 ? ` · ${unavail} Messwert(e) inaktiv.` : '';
            fnEl.innerText = `Top 5 nach aktueller Leistung · Tipp auf einen Verbraucher öffnet die 24h-Kurve${unavailText}`;
        }
    }

    // 4. Update Level 1 Drill-Down Card Summary for Intraday Curve
    const intradaySumEl = document.getElementById('live_hub_intraday_summary');
    if (intradaySumEl) {
        const customStrNames = (haConfigState.customStrings || []).slice(0, 2).map(s => s.name).join(', ');
        const todayPv = t.pvEnergyTodayKwh ?? intKwh.pv_total ?? 1.325;
        intradaySumEl.innerText = `${customStrNames || 'Strings'}, Haus & Batterie · Heute ${formatKwhDe(todayPv, 2)} (${activeCurveKeys.size} Kanäle aktiv)`;
    }
}

function toggleShowAllDashboardConsumers() {
    showAllDashboardConsumers = !showAllDashboardConsumers;
    renderLiveCockpitUI();
}

// ============================================================================
// 5. INTERACTIVE CURVE FOCUS & LEVEL-2 TECHNICAL TELEMETRY STAGE
// ============================================================================

function getDefaultActiveCurveSet() {
    const customStrings = Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.length > 0
        ? haConfigState.customStrings
        : DEFAULT_CUSTOM_STRINGS;
    const keys = customStrings.map(cs => cs.id);
    keys.push('pv_total', 'house_load', 'battery_soc');
    return new Set(keys);
}

function openLiveCurveFocus(target = 'all') {
    if (typeof openLiveDrillDown === 'function') {
        openLiveDrillDown('intraday');
    }

    const customStrings = Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.length > 0
        ? haConfigState.customStrings
        : DEFAULT_CUSTOM_STRINGS;

    if (!target || target === 'all') {
        resetIntradayCurveFocus();
        return;
    }

    currentFocusedCurveMode = true;

    if (target === 'pv') {
        activeCurveKeys = new Set(['pv_total', ...customStrings.map(cs => cs.id)]);
        currentFocusedCurveTitle = 'Fokus: PV-Erzeugung & Strings · DC';
    } else if (target === 'load') {
        activeCurveKeys = new Set(['house_load']);
        currentFocusedCurveTitle = 'Fokus: Hausverbrauch · AC';
    } else if (target === 'battery') {
        activeCurveKeys = new Set(['battery_soc', 'battery_power']);
        currentFocusedCurveTitle = `Fokus: ${haConfigState.batteryName || 'Batterie'} · SoC & Leistung`;
    } else if (target === 'grid') {
        activeCurveKeys = new Set(['grid_power', 'grid_feedin']);
        currentFocusedCurveTitle = 'Fokus: Netzbezug & Einspeisung';
    } else if (String(target).startsWith('consumer:')) {
        const consId = String(target).slice('consumer:'.length);
        const consObj = (haConfigState.customConsumers || []).find(c => String(c.id) === consId);
        const cKey = `consumer_${consId}`;
        activeCurveKeys = new Set([cKey]);
        currentFocusedCurveTitle = `Fokus: ${consObj ? consObj.name : 'Verbraucher'}`;
    } else {
        activeCurveKeys = new Set([target]);
        currentFocusedCurveTitle = 'Fokus: Einzelkurve';
    }

    try {
        localStorage.setItem('pvpro_active_curves', JSON.stringify([...activeCurveKeys]));
    } catch (e) {}

    setTimeout(() => {
        renderIntradayCurveSection();
    }, 30);
}

function focusSingleIntradayCurve(curveKey, event = null) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    const defs = getAvailableCurveDefinitions();
    const found = defs.find(d => d.key === curveKey);

    // If already solo-focused on this exact curve, restore all default curves
    if (currentFocusedCurveMode && activeCurveKeys.size === 1 && activeCurveKeys.has(curveKey)) {
        resetIntradayCurveFocus();
        return;
    }

    currentFocusedCurveMode = true;
    activeCurveKeys = new Set([curveKey]);
    currentFocusedCurveTitle = found ? `Fokus: ${found.name}` : 'Fokus: Einzelkanal';

    try {
        localStorage.setItem('pvpro_active_curves', JSON.stringify([...activeCurveKeys]));
    } catch (e) {}

    renderIntradayCurveSection();
}

function resetIntradayCurveFocus() {
    currentFocusedCurveMode = false;
    currentFocusedCurveTitle = 'Tagesverlauf · Telemetrie';
    activeCurveKeys = getDefaultActiveCurveSet();
    try {
        localStorage.setItem('pvpro_active_curves', JSON.stringify([...activeCurveKeys]));
    } catch (e) {}
    renderIntradayCurveSection();
}

function getAvailableCurveDefinitions() {
    const t = currentLiveTelemetry;
    const intKwh = intradaySeriesState.integratedKwh || {};
    const peaks = intradaySeriesState.peakValues || {};
    const customStrings = Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.length > 0
        ? haConfigState.customStrings
        : DEFAULT_CUSTOM_STRINGS;
    const customConsumers = Array.isArray(haConfigState.customConsumers) ? haConfigState.customConsumers : [];

    const defs = [];

    // 1. Custom PV Strings / Inverters
    customStrings.forEach((cs, idx) => {
        const teleItem = (t.customStringsTelemetry || []).find(x => x.id === cs.id);
        const liveW = teleItem ? teleItem.powerW : (t.stringTelemetry?.[cs.id]?.powerW || 0);
        const explicitKwh = teleItem?.energyKwh ?? t.stringTelemetry?.[cs.id]?.energyKwh ?? null;
        const calcKwh = intKwh[cs.id] ?? 0;
        const kwhVal = (explicitKwh !== null && explicitKwh !== undefined) ? explicitKwh : calcKwh;
        const peakW = Math.max(liveW, peaks[cs.id] || 0);

        defs.push({
            key: cs.id,
            name: cs.name || `String ${idx + 1}`,
            color: cs.color || '#14b8a6',
            axis: 'yPower',
            unit: 'W',
            category: 'pv',
            liveDisplay: formatPowerDe(liveW, true),
            subLine1: `${formatKwhDe(kwhVal, 2)} heute`,
            subLine2: `${formatPowerDe(peakW, true)} Max`,
            subDisplay: `${formatKwhDe(kwhVal, 2)} · Max ${formatPowerDe(peakW, true)}`
        });
    });

    // 2. PV gesamt · DC
    const pvTotalKwh = (t.pvEnergyTodayKwh !== null && t.pvEnergyTodayKwh !== undefined)
        ? t.pvEnergyTodayKwh
        : (intKwh.pv_total ?? 0);
    const pvPeakW = Math.max(t.pvPowerW || 0, peaks.pv_total || 0);
    defs.push({
        key: 'pv_total',
        name: 'PV gesamt · DC',
        color: '#38bdf8',
        axis: 'yPower',
        unit: 'W',
        category: 'pv',
        liveDisplay: formatPowerDe(t.pvPowerW, t.pvPowerW < 1000),
        subLine1: `${formatKwhDe(pvTotalKwh, 2)} heute`,
        subLine2: `${formatPowerDe(pvPeakW, true)} Max`,
        subDisplay: `${formatKwhDe(pvTotalKwh, 2)} · Max ${formatPowerDe(pvPeakW, true)}`
    });

    // 3. Hausverbrauch · AC
    const loadKwh = intKwh.house_load ?? 0;
    const loadPeakW = Math.max(t.loadPowerW || 0, peaks.house_load || 0);
    defs.push({
        key: 'house_load',
        name: 'Hauslast · AC',
        color: '#f472b6',
        axis: 'yPower',
        unit: 'W',
        category: 'load',
        liveDisplay: formatPowerDe(t.loadPowerW),
        subLine1: `${formatKwhDe(loadKwh, 2)} heute`,
        subLine2: `${formatPowerDe(loadPeakW, true)} Max`,
        subDisplay: `${formatKwhDe(loadKwh, 2)} · Max ${formatPowerDe(loadPeakW, true)}`
    });

    // 4. Netzbezug
    const gridImportLive = Math.max(0, t.gridPowerW || 0);
    const gridImportKwh = (t.gridImportTodayKwh !== null && t.gridImportTodayKwh !== undefined)
        ? t.gridImportTodayKwh
        : (intKwh.grid_power ?? 0);
    const gridImpPeakW = Math.max(gridImportLive, peaks.grid_power || 0);
    defs.push({
        key: 'grid_power',
        name: 'Netzbezug',
        color: '#60a5fa',
        axis: 'yPower',
        unit: 'W',
        category: 'grid',
        liveDisplay: formatPowerDe(gridImportLive),
        subLine1: `${formatKwhDe(gridImportKwh, 2)} heute`,
        subLine2: `${formatPowerDe(gridImpPeakW, true)} Max`,
        subDisplay: `${formatKwhDe(gridImportKwh, 2)} · Max ${formatPowerDe(gridImpPeakW, true)}`
    });

    // 5. Netzeinspeisung
    const gridExportLive = Math.max(0, -(t.gridPowerW || 0));
    const gridExportKwh = (t.gridExportTodayKwh !== null && t.gridExportTodayKwh !== undefined)
        ? t.gridExportTodayKwh
        : (intKwh.grid_feedin ?? 0);
    const gridExpPeakW = Math.max(gridExportLive, peaks.grid_feedin || 0);
    defs.push({
        key: 'grid_feedin',
        name: 'Netzeinspeisung',
        color: '#22d3ee',
        axis: 'yPower',
        unit: 'W',
        category: 'grid',
        liveDisplay: formatPowerDe(gridExportLive),
        subLine1: `${formatKwhDe(gridExportKwh, 2)} heute`,
        subLine2: `${formatPowerDe(gridExpPeakW, true)} Max`,
        subDisplay: `${formatKwhDe(gridExportKwh, 2)} · Max ${formatPowerDe(gridExpPeakW, true)}`
    });

    // 6. Batterie · Leistung (W)
    const batName = haConfigState.batteryName || 'Batterie';
    const batLiveW = t.batteryPowerW || 0;
    const batChgKwh = (t.batteryChargeTodayKwh !== null && t.batteryChargeTodayKwh !== undefined)
        ? t.batteryChargeTodayKwh
        : (intKwh.battery_charge ?? 0);
    const batDisKwh = (t.batteryDischargeTodayKwh !== null && t.batteryDischargeTodayKwh !== undefined)
        ? t.batteryDischargeTodayKwh
        : (intKwh.battery_discharge ?? 0);
    const batLiveSign = batLiveW > 15 ? '+' : (batLiveW < -15 ? '−' : '');
    defs.push({
        key: 'battery_power',
        name: `${batName} · Leistung`,
        color: '#a855f7',
        axis: 'yPower',
        unit: 'W',
        category: 'battery',
        liveDisplay: `${batLiveSign}${formatPowerDe(Math.abs(batLiveW), true)}`,
        subLine1: `↑ ${formatKwhDe(batChgKwh, 2)} Ladung`,
        subLine2: `↓ ${formatKwhDe(batDisKwh, 2)} Entl.`,
        subDisplay: `↑${formatKwhDe(batChgKwh, 1)} · ↓${formatKwhDe(batDisKwh, 1)}`
    });

    // 7. Batterie · Ladezustand (%)
    const socVal = t.batterySocPct !== null && t.batterySocPct !== undefined ? Number(t.batterySocPct) : 0;
    const socSeries = intradaySeriesState.series.battery_soc || [];
    const minSoc = socSeries.length > 0 ? Math.min(...socSeries) : socVal;
    const maxSoc = socSeries.length > 0 ? Math.max(...socSeries) : socVal;
    defs.push({
        key: 'battery_soc',
        name: `${batName} · SoC`,
        color: '#d8b4fe',
        axis: 'ySoc',
        unit: '%',
        category: 'battery',
        liveDisplay: `${socVal.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`,
        subLine1: `${minSoc.toFixed(0)} % Minimum`,
        subLine2: `${maxSoc.toFixed(0)} % Maximum`,
        subDisplay: `Min ${minSoc.toFixed(0)}% · Max ${maxSoc.toFixed(0)}%`
    });

    // 8. Einzelverbraucher (Consumers)
    const consumerPalette = ['#fb923c', '#facc15', '#818cf8', '#34d399', '#f87171', '#a3e635'];
    customConsumers.forEach((cc, idx) => {
        if (!cc || !cc.id) return;
        const cKey = `consumer_${cc.id}`;
        const teleCons = (t.consumersTelemetry || []).find(x => x.id === cc.id);
        const liveW = teleCons ? (teleCons.powerW || 0) : 0;
        const cKwh = intKwh[cKey] ?? 0;
        const cPeakW = Math.max(liveW, peaks[cKey] || 0);

        defs.push({
            key: cKey,
            name: cc.name || `Verbraucher ${idx + 1}`,
            color: consumerPalette[idx % consumerPalette.length],
            axis: 'yPower',
            unit: 'W',
            category: 'consumer',
            liveDisplay: formatPowerDe(liveW, true),
            subLine1: `${formatKwhDe(cKwh, 2)} heute`,
            subLine2: `${formatPowerDe(cPeakW, true)} Max`,
            subDisplay: `${formatKwhDe(cKwh, 2)} · Max ${formatPowerDe(cPeakW, true)}`
        });
    });

    return defs;
}

function toggleIntradayCurve(curveKey) {
    if (activeCurveKeys.has(curveKey)) {
        if (activeCurveKeys.size > 1) {
            activeCurveKeys.delete(curveKey);
        }
    } else {
        activeCurveKeys.add(curveKey);
    }
    currentFocusedCurveMode = false;
    currentFocusedCurveTitle = 'Tagesverlauf · Telemetrie';
    try {
        localStorage.setItem('pvpro_active_curves', JSON.stringify([...activeCurveKeys]));
    } catch (e) {}
    renderIntradayCurveSection();
}

function renderIntradayCurveSection(baseline) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const defs = getAvailableCurveDefinitions();

    // 1. Update View Title & Reset-Focus Button
    const titleEl = document.getElementById('intraday_view_title');
    if (titleEl) {
        titleEl.innerText = currentFocusedCurveMode ? currentFocusedCurveTitle : 'Tagesverlauf · Telemetrie';
    }
    const resetBtn = document.getElementById('btnResetCurveFocus');
    if (resetBtn) {
        if (currentFocusedCurveMode) resetBtn.classList.remove('hidden');
        else resetBtn.classList.add('hidden');
    }

    // 2. Update Single-Line Timestamp Range Header
    const now = intradaySeriesState.nowIso ? new Date(intradaySeriesState.nowIso) : new Date();
    const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const rangeString = `${dateStr} · 00:00 – ${timeStr} Uhr`;

    const rangeEl = document.getElementById('dash_curve_timerange');
    if (rangeEl) rangeEl.innerText = rangeString;
    const fsRangeEl = document.getElementById('fs_curve_timerange');
    if (fsRangeEl) fsRangeEl.innerText = rangeString;

    const activeCountBadge = document.getElementById('dash_active_curves_badge');
    if (activeCountBadge) {
        const activeCount = defs.filter(d => activeCurveKeys.has(d.key)).length;
        activeCountBadge.innerText = `${activeCount} / ${defs.length} Kanäle aktiv`;
    }

    // 3. Render Fullscreen Overlay Chips
    const buildChipsHtml = () => defs.map(d => {
        const isActive = activeCurveKeys.has(d.key);
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;
        return `
        <button type="button" onclick="toggleIntradayCurve('${d.key}')"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
                isActive
                    ? 'bg-slate-800/95 text-white dark:bg-[#192c34] dark:text-white shadow-2xs ring-1 ring-white/15'
                    : 'bg-slate-200/50 text-slate-400 dark:bg-slate-900/40 dark:text-slate-500 opacity-45 hover:opacity-75'
            }"
            style="border-left: 3px solid ${isActive ? d.color : '#475569'}">
            <span>${safeName}</span>
        </button>`;
    }).join('');

    const chipsEl = document.getElementById('dash_curve_legend_chips');
    if (chipsEl) chipsEl.innerHTML = buildChipsHtml();
    const fsChipsEl = document.getElementById('fs_curve_legend_chips');
    if (fsChipsEl) fsChipsEl.innerHTML = buildChipsHtml();

    // 4. Render Compact 3-Column Technical Channel Cards Below Chart (Theme-Aware for Light & Dark Mode)
    const isDark = document.documentElement.classList.contains('dark');
    const tilesGrid = document.getElementById('dash_curve_tiles_grid');
    if (tilesGrid) {
        tilesGrid.innerHTML = defs.map(d => {
            const isActive = activeCurveKeys.has(d.key);
            const isSoloFocused = currentFocusedCurveMode && activeCurveKeys.size === 1 && isActive;
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;
            const safeKeyJs = String(d.key).replace(/'/g, "\\'");

            let cardStyle = '';
            if (isDark) {
                cardStyle = isActive
                    ? `border-left: 3.5px solid ${d.color}; border-top: 1px solid ${hexToRgba(d.color, 0.42)}; border-right: 1px solid rgba(148,163,184,0.18); border-bottom: 1px solid rgba(148,163,184,0.18); background: linear-gradient(135deg, ${hexToRgba(d.color, 0.20)} 0%, rgba(15, 28, 35, 0.94) 100%);`
                    : `border-left: 3.5px solid rgba(100,116,139,0.45); border-top: 1px solid rgba(148,163,184,0.16); border-right: 1px solid rgba(148,163,184,0.16); border-bottom: 1px solid rgba(148,163,184,0.16); background: rgba(15, 25, 32, 0.65); opacity: 0.68;`;
            } else {
                cardStyle = isActive
                    ? `border-left: 3.5px solid ${d.color}; border-top: 1px solid ${hexToRgba(d.color, 0.45)}; border-right: 1px solid ${hexToRgba(d.color, 0.30)}; border-bottom: 1px solid ${hexToRgba(d.color, 0.30)}; background: linear-gradient(135deg, ${hexToRgba(d.color, 0.14)} 0%, rgba(255, 255, 255, 0.96) 65%); box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);`
                    : `border-left: 3.5px solid #cbd5e1; border-top: 1px solid rgba(203, 213, 225, 0.85); border-right: 1px solid rgba(203, 213, 225, 0.85); border-bottom: 1px solid rgba(203, 213, 225, 0.85); background: rgba(248, 250, 252, 0.88); opacity: 0.74;`;
            }

            return `
            <div onclick="toggleIntradayCurve('${safeKeyJs}')"
                style="${cardStyle}"
                class="rounded-xl px-2.5 py-2 cursor-pointer select-none transition-all duration-150 hover:opacity-100 group">
                <div class="flex items-center justify-between gap-1">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${isActive ? d.color : '#94a3b8'}"></span>
                        <p class="text-[11px] ${isActive ? 'font-bold text-slate-900 dark:text-slate-100' : 'font-semibold text-slate-600 dark:text-slate-400'} truncate">${safeName}</p>
                    </div>
                    <button type="button"
                        onclick="focusSingleIntradayCurve('${safeKeyJs}', event)"
                        title="${isSoloFocused ? 'Alle Kurven einblenden' : 'Nur diese Kurve fokussieren (Solo)'}"
                        class="w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                            isSoloFocused
                                ? 'bg-teal-600 text-white dark:bg-teal-400 dark:text-slate-950 font-black'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10'
                        }">
                        <span class="material-symbols-rounded text-[13px]">center_focus_strong</span>
                    </button>
                </div>
                <div class="mt-1 flex items-baseline justify-between gap-1 font-mono tabular-nums">
                    <p class="text-sm sm:text-base font-black ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'} leading-tight">${d.liveDisplay}</p>
                    <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${isActive ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300' : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}">${isActive ? 'AN' : 'AUS'}</span>
                </div>
                <div class="mt-1 space-y-0.5 font-mono tabular-nums">
                    <p class="text-[11px] font-bold ${isActive ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'} leading-tight">${d.subLine1 || d.subDisplay}</p>
                    <p class="text-[10px] ${isActive ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'} leading-tight">${d.subLine2 || ''}</p>
                </div>
            </div>`;
        }).join('');
    }

    // 5. Update Crosshair Readout Ribbon (only if user is not actively scrubbing)
    if (!isIntradayHovering) {
        updateIntradayHoverReadout((intradaySeriesState.labels.length || 1) - 1, defs);
    }

    // 6. Render Dual-Axis Chart.js Line Chart (Zero-Flicker In-Place Update)
    renderIntradayCanvasInstance('intradayTelemetryChart', defs, false);

    const fsModal = document.getElementById('modal-intraday-fullscreen');
    if (fsModal && !fsModal.classList.contains('hidden')) {
        renderIntradayCanvasInstance('intradayFullscreenChart', defs, true);
    }
}

function hexToRgba(hex, alpha) {
    const clean = String(hex || '#14b8a6').replace('#', '');
    if (clean.length !== 6) return `rgba(20, 184, 166, ${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16) || 20;
    const g = parseInt(clean.slice(2, 4), 16) || 184;
    const b = parseInt(clean.slice(4, 6), 16) || 166;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderIntradayCanvasInstance(canvasId, defs, isFullscreen = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (!defs) defs = getAvailableCurveDefinitions();

    const isDark = document.documentElement.classList.contains('dark');
    const ctx = canvas.getContext('2d');
    const chartHeight = canvas.parentElement?.clientHeight || (isFullscreen ? 420 : 280);
    const activeDefs = defs.filter(d => activeCurveKeys.has(d.key));
    const powerCurvesCount = activeDefs.filter(d => d.axis === 'yPower').length;

    const datasets = activeDefs.map((d) => {
        const dataArr = intradaySeriesState.series[d.key] || [];
        const isPrimaryFocus = powerCurvesCount <= 2 && d.axis === 'yPower';
        const grad = ctx.createLinearGradient(0, 0, 0, chartHeight);
        grad.addColorStop(0, hexToRgba(d.color, isPrimaryFocus ? (isDark ? 0.34 : 0.26) : (isDark ? 0.14 : 0.10)));
        grad.addColorStop(1, hexToRgba(d.color, 0.0));

        return {
            label: d.name,
            data: dataArr,
            borderColor: d.color,
            backgroundColor: grad,
            yAxisID: d.axis,
            borderWidth: isFullscreen ? 2.5 : (isPrimaryFocus ? 2.4 : 2.0),
            borderDash: d.axis === 'ySoc' ? [4, 3] : [],
            pointRadius: 0,
            pointHoverRadius: isFullscreen ? 5 : 4,
            pointHoverBackgroundColor: d.color,
            pointHoverBorderColor: isDark ? '#081116' : '#ffffff',
            pointHoverBorderWidth: 2,
            tension: 0.28,
            fill: d.axis === 'yPower' && (powerCurvesCount <= 3 || d.key === 'pv_total')
        };
    });

    let maxPowerW = 300;
    let minPowerW = 0;
    activeDefs.filter(d => d.axis === 'yPower').forEach(d => {
        const arr = intradaySeriesState.series[d.key] || [];
        arr.forEach(v => {
            if (v > maxPowerW) maxPowerW = v;
            if (v < minPowerW) minPowerW = v;
        });
    });

    const hasSocCurve = activeDefs.some(d => d.axis === 'ySoc');
    const gridColorX = isDark ? 'rgba(148, 163, 184, 0.06)' : 'rgba(100, 116, 139, 0.10)';
    const gridColorY = isDark ? 'rgba(148, 163, 184, 0.09)' : 'rgba(100, 116, 139, 0.13)';
    const tickColorPower = isDark ? '#94a3b8' : '#475569';
    const tickColorX = isDark ? '#64748b' : '#475569';
    const tickColorSoc = isDark ? '#d8b4fe' : '#9333ea';

    const existingChart = isFullscreen ? chartIntradayFullscreen : chartIntraday;

    // ZERO-FLICKER IN-PLACE UPDATE: If chart already exists on this exact canvas, mutate data and update('none')
    if (existingChart && existingChart.canvas === canvas) {
        existingChart.data.labels = intradaySeriesState.labels;
        existingChart.data.datasets = datasets;
        if (existingChart.options && existingChart.options.scales) {
            const sx = existingChart.options.scales.x;
            const sy = existingChart.options.scales.yPower;
            const ss = existingChart.options.scales.ySoc;
            if (sx) {
                sx.grid.color = gridColorX;
                sx.ticks.color = tickColorX;
            }
            if (sy) {
                sy.beginAtZero = minPowerW >= 0;
                sy.suggestedMin = minPowerW < 0 ? Math.floor(minPowerW * 1.05) : 0;
                sy.suggestedMax = Math.ceil(maxPowerW * 1.06);
                sy.grid.color = gridColorY;
                sy.ticks.color = tickColorPower;
            }
            if (ss) {
                ss.display = hasSocCurve;
                ss.ticks.color = tickColorSoc;
            }
        }
        existingChart.update('none');
        return;
    }

    if (existingChart) {
        try { existingChart.destroy(); } catch (e) {}
    }

    const chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: intradaySeriesState.labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            onHover: (event, elements) => {
                if (elements && elements.length > 0) {
                    isIntradayHovering = true;
                    const idx = elements[0].index;
                    updateIntradayHoverReadout(idx, defs);
                } else {
                    isIntradayHovering = false;
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(8, 17, 22, 0.94)' : 'rgba(15, 23, 42, 0.94)',
                    titleColor: '#94a3b8',
                    bodyColor: '#f8fafc',
                    titleFont: { family: 'JetBrains Mono, monospace', size: 11, weight: 'bold' },
                    bodyFont: { family: 'JetBrains Mono, monospace', size: 11 },
                    borderColor: 'rgba(45, 212, 191, 0.35)',
                    borderWidth: 1,
                    padding: 9,
                    callbacks: {
                        label: (c) => {
                            const val = c.parsed.y;
                            const isSoc = c.dataset.yAxisID === 'ySoc';
                            return ` ${c.dataset.label}: ${val.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${isSoc ? '%' : 'W'}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColorX, drawBorder: false },
                    ticks: {
                        color: tickColorX,
                        maxTicksLimit: isFullscreen ? 12 : 7,
                        font: { family: 'JetBrains Mono, monospace', size: isFullscreen ? 11 : 10 }
                    }
                },
                yPower: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: minPowerW >= 0,
                    suggestedMin: minPowerW < 0 ? Math.floor(minPowerW * 1.05) : 0,
                    suggestedMax: Math.ceil(maxPowerW * 1.06),
                    grid: { color: gridColorY, drawBorder: false },
                    ticks: {
                        color: tickColorPower,
                        count: isFullscreen ? 6 : 5,
                        font: { family: 'JetBrains Mono, monospace', size: isFullscreen ? 11 : 10 },
                        callback: (val) => `${val.toLocaleString('de-DE', { maximumFractionDigits: 0 })} W`
                    }
                },
                ySoc: {
                    type: 'linear',
                    position: 'right',
                    display: hasSocCurve,
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: tickColorSoc,
                        stepSize: 25,
                        font: { family: 'JetBrains Mono, monospace', size: isFullscreen ? 11 : 10 },
                        callback: (val) => `${val}%`
                    }
                }
            }
        }
    });

    if (isFullscreen) {
        chartIntradayFullscreen = chartInstance;
    } else {
        chartIntraday = chartInstance;
    }
}

function updateIntradayHoverReadout(index, defs) {
    if (!defs) defs = getAvailableCurveDefinitions();
    const isDark = document.documentElement.classList.contains('dark');

    const idx = Math.max(0, Math.min(index, (intradaySeriesState.labels.length || 1) - 1));
    const ts = intradaySeriesState.bucketTimes?.[idx] || Date.now();
    const dObj = new Date(ts);
    const timePart = dObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const activeDefs = defs.filter(d => activeCurveKeys.has(d.key));
    const htmlItems = activeDefs.map(d => {
        const arr = intradaySeriesState.series[d.key] || [];
        const val = arr[idx] !== undefined ? arr[idx] : 0;
        const unit = d.axis === 'ySoc' ? '%' : 'W';
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;
        const fmtVal = Number(val).toLocaleString('de-DE', { maximumFractionDigits: d.axis === 'ySoc' ? 1 : 0 });
        return `<span class="inline-flex items-center gap-1 whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full" style="background:${d.color}"></span><span class="${isDark ? 'text-slate-400' : 'text-slate-500'}">${safeName}:</span><strong class="${isDark ? 'text-white' : 'text-slate-900'}">${fmtVal} ${unit}</strong></span>`;
    });

    const fullHtml = `<span class="text-teal-600 dark:text-teal-400 font-bold whitespace-nowrap">${timePart} Uhr</span><span class="text-slate-400 dark:text-slate-600">·</span>${htmlItems.join('<span class="text-slate-300 dark:text-slate-700 mx-0.5">·</span>')}`;

    const readoutEl = document.getElementById('dash_curve_hover_readout');
    if (readoutEl) readoutEl.innerHTML = fullHtml;
    const fsReadoutEl = document.getElementById('fs_curve_hover_readout');
    if (fsReadoutEl) fsReadoutEl.innerHTML = fullHtml;
}

// ============================================================================
// 5B. FULLSCREEN & 90° LANDSCAPE OVERLAY FOR INTRADAY CHART
// ============================================================================

function openIntradayFullscreenModal() {
    const modal = document.getElementById('modal-intraday-fullscreen');
    if (!modal) return;
    modal.classList.remove('hidden');
    applyIntradayFullscreenRotationStyle();
    setTimeout(() => {
        renderIntradayCurveSection();
    }, 40);
}

function closeIntradayFullscreenModal() {
    const modal = document.getElementById('modal-intraday-fullscreen');
    if (!modal) return;
    modal.classList.add('hidden');
    if (isIntradayFsRotated) {
        isIntradayFsRotated = false;
        applyIntradayFullscreenRotationStyle();
    }
}

function toggleIntradayFullscreenRotate() {
    isIntradayFsRotated = !isIntradayFsRotated;
    applyIntradayFullscreenRotationStyle();
    setTimeout(() => {
        const defs = getAvailableCurveDefinitions();
        renderIntradayCanvasInstance('intradayFullscreenChart', defs, true);
    }, 120);
}

function applyIntradayFullscreenRotationStyle() {
    const inner = document.getElementById('intradayFullscreenInner');
    const lbl = document.getElementById('btnIntradayFsRotateLabel');
    if (!inner) return;

    if (isIntradayFsRotated) {
        inner.style.position = 'fixed';
        inner.style.top = '50%';
        inner.style.left = '50%';
        inner.style.width = '100dvh';
        inner.style.height = '100dvw';
        inner.style.transform = 'translate(-50%, -50%) rotate(90deg)';
        if (lbl) lbl.innerText = 'Normalansicht';
    } else {
        inner.style.position = '';
        inner.style.top = '';
        inner.style.left = '';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.transform = '';
        if (lbl) lbl.innerText = '90° Querformat';
    }
}

// ============================================================================
// 6. PERFORMANCE ANALYSIS CALCULATIONS (SOLL-IST, AUTARKY/BATTERY, AMORTIZATION)
// ============================================================================

function switchAnalysisSubTab(subTab) {
    activeAnalysisSubTab = subTab;
    ['soll-ist', 'autarkie-bat', 'amortisation', 'logbuch'].forEach(id => {
        const panel = document.getElementById(`analysis-panel-${id}`);
        const btn = document.getElementById(`btn-analysis-sub-${id}`);
        if (panel) {
            if (id === subTab) panel.classList.remove('hidden');
            else panel.classList.add('hidden');
        }
        if (btn) {
            if (id === subTab) {
                btn.className = "px-3.5 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
            } else {
                btn.className = "px-3.5 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
            }
        }
    });
    renderAnalysisSection();
}

function changeAnalysisYear(yearVal) {
    selectedAnalysisYear = parseInt(yearVal) || new Date().getFullYear();
    ensureProjectYearInitialized(selectedAnalysisYear);
    renderAnalysisSection();
}

function computeAggregatedPerformanceMetrics(baseline) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const months = getCurrentYearMonthsData(selectedAnalysisYear);

    let realPvSum = 0;
    let sollPvForRecordedMonths = 0;
    let recordedMonthsCount = 0;
    let gridExportSum = 0;
    let gridImportSum = 0;
    let batChargedSum = 0;
    let batDischargedSum = 0;

    const monthlyComparison = months.map((mObj, idx) => {
        const sollKwh = baseline.monthlySollTotal[idx] || 0;
        const hasReal = mObj.pvYieldKwh !== null && mObj.pvYieldKwh !== undefined && mObj.pvYieldKwh !== '';
        const realPv = hasReal ? Math.max(0, parseFloat(mObj.pvYieldKwh) || 0) : null;
        const expKwh = hasReal ? Math.max(0, parseFloat(mObj.gridExportKwh) || 0) : 0;
        const impKwh = hasReal ? Math.max(0, parseFloat(mObj.gridImportKwh) || 0) : 0;
        const bChg = hasReal ? Math.max(0, parseFloat(mObj.batteryChargedKwh) || 0) : 0;
        const bDis = hasReal ? Math.max(0, parseFloat(mObj.batteryDischargedKwh) || 0) : 0;

        const directKwh = hasReal ? Math.max(0, realPv - expKwh - bChg) : 0;
        const totalSelfUsedKwh = hasReal ? Math.max(0, realPv - expKwh) : 0;
        const houseConsKwh = hasReal ? (directKwh + bDis + impKwh) : 0;

        const selfSavedEur = (directKwh + bDis) * baseline.gridPriceEur;
        const feedInRevEur = expKwh * baseline.eegRateEur;
        const totalBenefitEur = selfSavedEur + feedInRevEur;

        const sollSelfShare = baseline.totalBatteryKwh > 0 ? 0.58 : 0.34;
        const sollMonthEur = (sollKwh * sollSelfShare * baseline.gridPriceEur) + (sollKwh * (1 - sollSelfShare) * baseline.eegRateEur);

        if (hasReal) {
            realPvSum += realPv;
            sollPvForRecordedMonths += sollKwh;
            recordedMonthsCount++;
            gridExportSum += expKwh;
            gridImportSum += impKwh;
            batChargedSum += bChg;
            batDischargedSum += bDis;
        }

        const perfIndexPct = (hasReal && sollKwh > 0) ? ((realPv / sollKwh) * 100) : null;

        return {
            month: idx,
            labelShort: MONTH_LABELS_SHORT[idx],
            labelLong: MONTH_LABELS_LONG[idx],
            hasReal,
            sollKwh,
            realPv,
            expKwh,
            impKwh,
            bChg,
            bDis,
            directKwh,
            totalSelfUsedKwh,
            houseConsKwh,
            perfIndexPct,
            totalBenefitEur,
            sollMonthEur
        };
    });

    const overallPerfIndexPct = sollPvForRecordedMonths > 0 ? ((realPvSum / sollPvForRecordedMonths) * 100) : 100;
    const directTotalKwh = Math.max(0, realPvSum - gridExportSum - batChargedSum);
    const selfConsumedTotalKwh = directTotalKwh + batDischargedSum;
    const totalHouseConsKwh = selfConsumedTotalKwh + gridImportSum;

    const realAutarkyPct = totalHouseConsKwh > 0 ? ((selfConsumedTotalKwh / totalHouseConsKwh) * 100) : 0;
    const realEigenQuotaPct = realPvSum > 0 ? (((realPvSum - gridExportSum) / realPvSum) * 100) : 0;

    const batEfficiencyPct = batChargedSum > 0 ? Math.min(100, (batDischargedSum / batChargedSum) * 100) : (baseline.totalBatteryKwh > 0 ? 91.0 : 0);
    const batLossKwh = Math.max(0, batChargedSum - batDischargedSum);
    const batFullCycles = baseline.totalBatteryKwh > 0 ? (batDischargedSum / baseline.totalBatteryKwh) : 0;

    const recordedSelfSavingsEur = selfConsumedTotalKwh * baseline.gridPriceEur;
    const recordedFeedInEur = gridExportSum * baseline.eegRateEur;
    const recordedTotalEur = recordedSelfSavingsEur + recordedFeedInEur;

    const projectedAnnualRealEur = monthlyComparison.reduce((acc, m) => {
        if (m.hasReal) return acc + m.totalBenefitEur;
        return acc + (m.sollMonthEur * (overallPerfIndexPct / 100));
    }, 0);

    const plannedAnnualEur = monthlyComparison.reduce((acc, m) => acc + m.sollMonthEur, 0);
    const realAmortYears = projectedAnnualRealEur > 0 ? (baseline.sysCostEur / projectedAnnualRealEur) : 99;
    const plannedAmortYears = plannedAnnualEur > 0 ? (baseline.sysCostEur / plannedAnnualEur) : 99;

    return {
        monthlyComparison,
        recordedMonthsCount,
        realPvSum,
        sollPvForRecordedMonths,
        totalSollYearKwh: baseline.totalSollYearKwh,
        overallPerfIndexPct,
        specificRealYield: baseline.totalKwp > 0 ? (realPvSum / baseline.totalKwp) : 0,
        specificSollYield: baseline.totalKwp > 0 ? (baseline.totalSollYearKwh / baseline.totalKwp) : 0,
        gridExportSum,
        gridImportSum,
        batChargedSum,
        batDischargedSum,
        directTotalKwh,
        selfConsumedTotalKwh,
        totalHouseConsKwh,
        realAutarkyPct,
        realEigenQuotaPct,
        batEfficiencyPct,
        batLossKwh,
        batFullCycles,
        recordedSelfSavingsEur,
        recordedFeedInEur,
        recordedTotalEur,
        projectedAnnualRealEur,
        plannedAnnualEur,
        realAmortYears,
        plannedAmortYears
    };
}

function renderAnalysisSection(baseline) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const metrics = computeAggregatedPerformanceMetrics(baseline);

    const yearSel = document.getElementById('analysisYearSelect');
    if (yearSel && String(yearSel.value) !== String(selectedAnalysisYear)) {
        yearSel.value = String(selectedAnalysisYear);
    }

    setElText('ana_kpi_soll_year', `${Math.round(metrics.totalSollYearKwh).toLocaleString('de-DE')} kWh`);
    setElText('ana_kpi_soll_sub', `Spezifisch: ${Math.round(metrics.specificSollYield)} kWh/kWp · ${metrics.recordedMonthsCount}/12 Monate erfasst`);

    setElText('ana_kpi_ist_sum', `${Math.round(metrics.realPvSum).toLocaleString('de-DE')} kWh`);
    setElText('ana_kpi_ist_sub', `Soll im Zeitraum: ${Math.round(metrics.sollPvForRecordedMonths).toLocaleString('de-DE')} kWh (${Math.round(metrics.specificRealYield)} kWh/kWp)`);

    const perfSign = metrics.overallPerfIndexPct >= 100 ? '+' : '';
    const perfDelta = (metrics.overallPerfIndexPct - 100).toFixed(1);
    setElText('ana_kpi_perf_idx', `${metrics.overallPerfIndexPct.toFixed(1)} %`);
    setElText('ana_kpi_perf_sub', `${perfSign}${perfDelta} % ggü. PVGIS-Prognose`);

    const perfEl = document.getElementById('ana_kpi_perf_idx');
    if (perfEl) {
        perfEl.className = `text-xl sm:text-3xl font-black font-mono tabular-nums ${metrics.overallPerfIndexPct >= 98 ? 'text-emerald-600 dark:text-emerald-400' : (metrics.overallPerfIndexPct >= 88 ? 'text-amber-500' : 'text-rose-500')}`;
    }

    setElText('ana_kpi_euro_real', `${Math.round(metrics.recordedTotalEur).toLocaleString('de-DE')} €`);
    setElText('ana_kpi_euro_sub', `Hochrechnung Jahr: ${Math.round(metrics.projectedAnnualRealEur).toLocaleString('de-DE')} €/a · ROI: ${metrics.realAmortYears.toFixed(1)} J.`);

    // Update Level 1 Drill-Down Hub Card Subtitles
    setElText('hub_card_soll_ist_sub', `${metrics.overallPerfIndexPct.toFixed(1)} % Soll-Erfüllung · ${Math.round(metrics.realPvSum).toLocaleString('de-DE')} / ${Math.round(metrics.sollPvForRecordedMonths).toLocaleString('de-DE')} kWh`);
    setElText('hub_card_autarkie_sub', `${metrics.realAutarkyPct.toFixed(1)} % Autarkie · ${metrics.realEigenQuotaPct.toFixed(1)} % Eigenverbrauch · ${baseline.totalBatteryKwh > 0 ? metrics.batFullCycles.toFixed(0) + ' Zyklen' : 'Ohne Speicher'}`);
    setElText('hub_card_amort_sub', `${Math.round(metrics.recordedTotalEur).toLocaleString('de-DE')} € gespart · ROI ${metrics.realAmortYears.toFixed(1)} J. (Plan: ${metrics.plannedAmortYears.toFixed(1)} J.)`);
    setElText('hub_card_logbuch_sub', `${metrics.recordedMonthsCount} von 12 Monaten für ${selectedAnalysisYear} erfasst · HA-Sync & CSV`);

    // Render Interactive Sankey Energy Flow Diagram on Level 1
    renderSankeyDiagram(currentSankeyHorizon, baseline, metrics);

    renderSollIstPanel(baseline, metrics);
    renderAutarkyBatteryPanel(baseline, metrics);
    renderRealAmortizationPanel(baseline, metrics);
    renderMonthlyLogbookTable(baseline, metrics);
}

// ============================================================================
// 6B. INTERACTIVE SANKEY ENERGY FLOW DIAGRAM (HEUTE / MONAT / GESAMTJAHR)
// ============================================================================

function setSankeyHorizon(horizon) {
    if (!['today', 'month', 'year'].includes(horizon)) horizon = 'year';
    currentSankeyHorizon = horizon;
    const baseline = getPlannedSystemBaseline();
    const metrics = computeAggregatedPerformanceMetrics(baseline);
    renderSankeyDiagram(currentSankeyHorizon, baseline, metrics);
}

function computeSankeyFlowData(horizon, baseline, metrics) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    if (!metrics) metrics = computeAggregatedPerformanceMetrics(baseline);

    const hasBattery = baseline.totalBatteryKwh > 0 || Boolean(haConfigState.entities?.batterySoc || haConfigState.entities?.batteryPower);
    let pvTotal = 0;
    let gridImp = 0;
    let gridExp = 0;
    let batChg = 0;
    let batDis = 0;
    let pvDirect = 0;
    let batLoss = 0;
    let houseTotal = 0;
    let periodLabel = '';
    let decimals = 0;

    if (horizon === 'today') {
        decimals = 2;
        const t = currentLiveTelemetry || {};
        const intKwh = intradaySeriesState.integratedKwh || {};

        // 1. Primary: Today's delta from total_increasing kWh counters; 2. Fallback: Directional Watt integration
        const pvFromCounter = (t.pvEnergyTodayKwh !== null && t.pvEnergyTodayKwh !== undefined && t.pvEnergyTodayKwh > 0) ? Number(t.pvEnergyTodayKwh) : null;
        const strSumKwh = (t.customStringsTelemetry || []).reduce((acc, s) => acc + (Number(s.energyKwh) || 0), 0);
        pvTotal = +(pvFromCounter ?? (intKwh.pv_total > 0 ? intKwh.pv_total : (strSumKwh > 0 ? strSumKwh : 1.33))).toFixed(2);

        const rawHouseLoad = Number(intKwh.house_load ?? 0);
        const rawGridImp = Number(t.gridImportTodayKwh ?? intKwh.grid_power ?? 0);
        const rawGridExp = Number(t.gridExportTodayKwh ?? intKwh.grid_feedin ?? 0);
        const rawBatChg = hasBattery ? Number(t.batteryChargeTodayKwh ?? intKwh.battery_charge ?? 0) : 0;
        const rawBatDis = hasBattery ? Number(t.batteryDischargeTodayKwh ?? intKwh.battery_discharge ?? 0) : 0;

        batChg = +Math.min(pvTotal, Math.max(0, rawBatChg)).toFixed(2);
        batDis = +Math.max(0, rawBatDis).toFixed(2);
        batLoss = +Math.max(0, batChg - batDis).toFixed(2);

        if (rawGridExp > 0 || t.gridExportTodayKwh !== null) {
            gridExp = +Math.min(Math.max(0, pvTotal - batChg), Math.max(0, rawGridExp)).toFixed(2);
            pvDirect = +Math.max(0, pvTotal - batChg - gridExp).toFixed(2);
        } else {
            const estSelf = rawHouseLoad > 0 ? Math.min(rawHouseLoad, Math.max(0, pvTotal - batChg)) : Math.max(0, pvTotal - batChg);
            pvDirect = +estSelf.toFixed(2);
            gridExp = +Math.max(0, pvTotal - batChg - pvDirect).toFixed(2);
        }

        const coveredByPvAndBat = pvDirect + batDis;
        if (rawGridImp > 0 || t.gridImportTodayKwh !== null) {
            gridImp = +Math.max(0, rawGridImp).toFixed(2);
        } else {
            gridImp = +Math.max(0, rawHouseLoad - coveredByPvAndBat).toFixed(2);
        }

        houseTotal = +Math.max(0.05, coveredByPvAndBat + gridImp, rawHouseLoad).toFixed(2);
        periodLabel = 'Heute · Zähler-Differenz & Watt-Integral (ohne Helfer)';
    } else if (horizon === 'month') {
        decimals = 1;
        const curMonthIdx = new Date().getMonth();
        const t = currentLiveTelemetry || {};

        // If live total_increasing counter month deltas are available, prefer them or synced month record
        let mRec = metrics.monthlyComparison[curMonthIdx];
        if (!mRec || !mRec.hasReal) {
            const recordedList = metrics.monthlyComparison.filter(m => m.hasReal);
            if (recordedList.length > 0) {
                mRec = recordedList[recordedList.length - 1];
            }
        }

        const hasLiveMonthCounter = t.pvEnergyMonthKwh !== null && t.pvEnergyMonthKwh !== undefined && t.pvEnergyMonthKwh > 0;
        if (hasLiveMonthCounter) {
            pvTotal = +Math.max(0.5, Number(t.pvEnergyMonthKwh)).toFixed(1);
            gridExp = +Math.max(0, Number(t.gridExportMonthKwh ?? mRec?.expKwh ?? 0)).toFixed(1);
            gridImp = +Math.max(0, Number(t.gridImportMonthKwh ?? mRec?.impKwh ?? 0)).toFixed(1);
            batChg = +Math.max(0, Number(t.batteryChargeMonthKwh ?? mRec?.bChg ?? 0)).toFixed(1);
            batDis = +Math.max(0, Number(t.batteryDischargeMonthKwh ?? mRec?.bDis ?? 0)).toFixed(1);
            pvDirect = +Math.max(0, pvTotal - gridExp - batChg).toFixed(1);
            batLoss = +Math.max(0, batChg - batDis).toFixed(1);
            houseTotal = +Math.max(0.5, pvDirect + batDis + gridImp).toFixed(1);
            periodLabel = `Monat: ${MONTH_LABELS_LONG[curMonthIdx]} ${selectedAnalysisYear} (aus Gesamt-Zählern)`;
        } else if (mRec && mRec.hasReal && mRec.realPv > 0) {
            pvTotal = Math.max(1, mRec.realPv);
            gridExp = Math.max(0, mRec.expKwh);
            gridImp = Math.max(0, mRec.impKwh);
            batChg = Math.max(0, mRec.bChg);
            batDis = Math.max(0, mRec.bDis);
            pvDirect = Math.max(0, pvTotal - gridExp - batChg);
            batLoss = Math.max(0, batChg - batDis);
            houseTotal = Math.max(1, pvDirect + batDis + gridImp);
            periodLabel = `Monat: ${mRec.labelLong} ${selectedAnalysisYear}`;
        } else {
            const sollM = Math.max(10, baseline.monthlySollTotal[curMonthIdx] || 650);
            pvTotal = Math.round(sollM);
            batChg = hasBattery ? Math.round(pvTotal * 0.28) : 0;
            batDis = hasBattery ? Math.round(batChg * 0.91) : 0;
            batLoss = Math.max(0, batChg - batDis);
            pvDirect = Math.round(pvTotal * 0.34);
            gridExp = Math.max(0, pvTotal - pvDirect - batChg);
            gridImp = Math.round((baseline.plannedConsKwh / 12) * 0.28);
            houseTotal = pvDirect + batDis + gridImp;
            periodLabel = `Monat: ${MONTH_LABELS_LONG[curMonthIdx]} (PVGIS-Prognose)`;
        }
    } else {
        decimals = 0;
        if (metrics.realPvSum > 0) {
            pvTotal = Math.max(1, metrics.realPvSum);
            gridExp = Math.max(0, metrics.gridExportSum);
            gridImp = Math.max(0, metrics.gridImportSum);
            batChg = Math.max(0, metrics.batChargedSum);
            batDis = Math.max(0, metrics.batDischargedSum);
            pvDirect = Math.max(0, metrics.directTotalKwh);
            batLoss = Math.max(0, metrics.batLossKwh);
            houseTotal = Math.max(1, metrics.totalHouseConsKwh);
            periodLabel = `Gesamtjahr ${selectedAnalysisYear} (${metrics.recordedMonthsCount}/12 Mon. erfasst)`;
        } else {
            pvTotal = Math.max(100, Math.round(baseline.totalSollYearKwh));
            batChg = hasBattery ? Math.round(pvTotal * 0.27) : 0;
            batDis = hasBattery ? Math.round(batChg * 0.91) : 0;
            batLoss = Math.max(0, batChg - batDis);
            pvDirect = Math.round(pvTotal * 0.32);
            gridExp = Math.max(0, pvTotal - pvDirect - batChg);
            gridImp = Math.round(baseline.plannedConsKwh * 0.26);
            houseTotal = pvDirect + batDis + gridImp;
            periodLabel = `Gesamtjahr ${selectedAnalysisYear} (PVGIS-Simulation)`;
        }
    }

    const autarkyPct = houseTotal > 0 ? Math.min(100, ((pvDirect + batDis) / houseTotal) * 100) : 0;
    const eigenQuotaPct = pvTotal > 0 ? Math.min(100, ((pvDirect + batChg) / pvTotal) * 100) : 0;
    const batEffPct = batChg > 0 ? Math.min(100, (batDis / batChg) * 100) : (hasBattery ? 91.0 : 0);

    return {
        horizon,
        decimals,
        periodLabel,
        hasBattery,
        pvTotal,
        gridImp,
        gridExp,
        batChg,
        batDis,
        pvDirect,
        batLoss,
        houseTotal,
        autarkyPct,
        eigenQuotaPct,
        batEffPct
    };
}

function renderSankeyDiagram(horizon = currentSankeyHorizon, baseline = null, metrics = null) {
    // 1. Update Horizon Buttons
    ['today', 'month', 'year'].forEach(h => {
        const btn = document.getElementById(`btn-sankey-${h}`);
        if (btn) {
            if (h === horizon) {
                btn.className = "px-3 py-1 rounded-full bg-teal-600 text-white text-[11px] font-bold shadow-xs transition-all cursor-pointer";
            } else {
                btn.className = "px-3 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-[11px] font-semibold transition-all cursor-pointer";
            }
        }
    });

    const container = document.getElementById('sankeyDiagramContainer');
    if (!container) return;

    const d = computeSankeyFlowData(horizon, baseline, metrics);
    const fmt = (v) => Number(v || 0).toLocaleString('de-DE', {
        minimumFractionDigits: d.decimals,
        maximumFractionDigits: d.decimals
    });

    const totalEnergyThroughput = Math.max(1, d.pvTotal + d.gridImp);

    // Proportional ribbon stroke widths (clamped between 6px and 56px for crisp mobile + desktop readability)
    const calcStroke = (val) => {
        if (val <= 0.01) return 2;
        return Math.max(7, Math.min(54, Math.round((val / totalEnergyThroughput) * 120)));
    };

    const swPvToDirect = calcStroke(d.pvDirect);
    const swPvToBat = calcStroke(d.batChg);
    const swPvToGridExp = calcStroke(d.gridExp);
    const swDirectToHouse = calcStroke(d.pvDirect);
    const swBatToHouse = calcStroke(d.batDis);
    const swGridToHouse = calcStroke(d.gridImp);

    const pvShareDirectPct = d.pvTotal > 0 ? Math.round((d.pvDirect / d.pvTotal) * 100) : 0;
    const pvShareBatPct = d.pvTotal > 0 ? Math.round((d.batChg / d.pvTotal) * 100) : 0;
    const pvShareExpPct = d.pvTotal > 0 ? Math.max(0, 100 - pvShareDirectPct - pvShareBatPct) : 0;

    const houseShareDirectPct = d.houseTotal > 0 ? Math.round((d.pvDirect / d.houseTotal) * 100) : 0;
    const houseShareBatPct = d.houseTotal > 0 ? Math.round((d.batDis / d.houseTotal) * 100) : 0;
    const houseShareGridPct = d.houseTotal > 0 ? Math.max(0, 100 - houseShareDirectPct - houseShareBatPct) : 0;

    // SVG Layout (780 x 330 viewBox, responsive)
    // Left Column (Sources): x = 14..184
    //   Node 1: PV-Erzeugung (y = 22..168)
    //   Node 2: Netzbezug    (y = 198..308)
    // Middle Column (Routing & Storage): x = 295..475
    //   Node 3: PV-Direkt    (y = 22..118)
    //   Node 4: Batterie     (y = 138..246)
    // Right Column (Sinks): x = 586..766
    //   Node 5: Hausverbrauch   (y = 22..192)
    //   Node 6: Netzeinspeisung (y = 212..308)

    const batName = typeof escapeHtml === 'function'
        ? escapeHtml(haConfigState.batteryName || 'Batteriespeicher')
        : (haConfigState.batteryName || 'Batteriespeicher');

    container.innerHTML = `
    <svg viewBox="0 0 780 332" class="w-full h-auto min-w-[600px] select-none overflow-visible" role="img" aria-label="Sankey Energiefluss-Diagramm">
        <defs>
            <linearGradient id="sankeyGradPvDirect" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.72" />
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.72" />
            </linearGradient>
            <linearGradient id="sankeyGradPvBat" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.68" />
                <stop offset="100%" stop-color="#a855f7" stop-opacity="0.72" />
            </linearGradient>
            <linearGradient id="sankeyGradPvExport" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.55" />
                <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.68" />
            </linearGradient>
            <linearGradient id="sankeyGradDirectHouse" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.72" />
                <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.75" />
            </linearGradient>
            <linearGradient id="sankeyGradBatHouse" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#a855f7" stop-opacity="0.72" />
                <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.75" />
            </linearGradient>
            <linearGradient id="sankeyGradGridHouse" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.65" />
                <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.72" />
            </linearGradient>
        </defs>

        <!-- FLOW RIBBONS (Cubic Bézier Paths) -->
        <!-- 1. PV -> PV-Direkt -->
        <path d="M 184 56 C 240 56, 240 66, 295 66"
            fill="none" stroke="url(#sankeyGradPvDirect)" stroke-width="${swPvToDirect}" stroke-linecap="butt"
            class="transition-all duration-500 hover:opacity-95" />

        <!-- 2. PV -> Batteriespeicher (Ladung) -->
        ${d.batChg > 0 ? `
        <path d="M 184 96 C 242 96, 242 184, 295 184"
            fill="none" stroke="url(#sankeyGradPvBat)" stroke-width="${swPvToBat}" stroke-linecap="butt"
            class="transition-all duration-500 hover:opacity-95" />
        ` : ''}

        <!-- 3. PV -> Netzeinspeisung -->
        ${d.gridExp > 0 ? `
        <path d="M 184 138 C 360 138, 410 262, 586 262"
            fill="none" stroke="url(#sankeyGradPvExport)" stroke-width="${swPvToGridExp}" stroke-linecap="butt"
            class="transition-all duration-500 hover:opacity-95" />
        ` : ''}

        <!-- 4. PV-Direkt -> Hausverbrauch -->
        <path d="M 475 66 C 530 66, 530 64, 586 64"
            fill="none" stroke="url(#sankeyGradDirectHouse)" stroke-width="${swDirectToHouse}" stroke-linecap="butt"
            class="transition-all duration-500 hover:opacity-95" />

        <!-- 5. Batteriespeicher (Entladung) -> Hausverbrauch -->
        ${d.batDis > 0 ? `
        <path d="M 475 184 C 532 184, 532 114, 586 114"
            fill="none" stroke="url(#sankeyGradBatHouse)" stroke-width="${swBatToHouse}" stroke-linecap="butt"
            class="transition-all duration-500 hover:opacity-95" />
        ` : ''}

        <!-- 6. Netzbezug -> Hausverbrauch -->
        ${d.gridImp > 0 ? `
        <path d="M 184 252 C 390 252, 460 160, 586 160"
            fill="none" stroke="url(#sankeyGradGridHouse)" stroke-width="${swGridToHouse}" stroke-linecap="butt"
            class="transition-all duration-500 hover:opacity-95" />
        ` : ''}

        <!-- FLOW VALUE PILLS ON RIBBONS -->
        <g transform="translate(239, 46)">
            <rect x="-34" y="-10" width="68" height="19" rx="9" fill="#0f1b21" fill-opacity="0.82" stroke="#14b8a6" stroke-opacity="0.45" />
            <text x="0" y="3" text-anchor="middle" fill="#5eead4" font-size="10" font-weight="700" font-family="JetBrains Mono, monospace">${pvShareDirectPct}% Direkt</text>
        </g>
        ${d.batChg > 0 ? `
        <g transform="translate(240, 142)">
            <rect x="-34" y="-10" width="68" height="19" rx="9" fill="#0f1b21" fill-opacity="0.82" stroke="#a855f7" stroke-opacity="0.45" />
            <text x="0" y="3" text-anchor="middle" fill="#d8b4fe" font-size="10" font-weight="700" font-family="JetBrains Mono, monospace">${pvShareBatPct}% Akku</text>
        </g>` : ''}
        ${d.gridExp > 0 ? `
        <g transform="translate(385, 224)">
            <rect x="-46" y="-10" width="92" height="19" rx="9" fill="#0f1b21" fill-opacity="0.82" stroke="#06b6d4" stroke-opacity="0.45" />
            <text x="0" y="3" text-anchor="middle" fill="#67e8f9" font-size="10" font-weight="700" font-family="JetBrains Mono, monospace">${fmt(d.gridExp)} kWh (${pvShareExpPct}%)</text>
        </g>` : ''}

        <!-- LEFT COLUMN NODES (SOURCES) -->
        <!-- Node 1: PV-Erzeugung -->
        <g transform="translate(14, 20)">
            <rect width="170" height="148" rx="18" fill="#11242b" fill-opacity="0.92" stroke="#14b8a6" stroke-width="1.8" />
            <rect x="0" y="0" width="6" height="148" rx="3" fill="#14b8a6" />
            <text x="16" y="26" fill="#5eead4" font-size="11" font-weight="800" letter-spacing="0.04em">PV-ERZEUGUNG</text>
            <text x="16" y="54" fill="#ffffff" font-size="21" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.pvTotal)} kWh</text>
            <text x="16" y="74" fill="#94a3b8" font-size="10.5" font-weight="600">Eigenverbrauch: ${d.eigenQuotaPct.toFixed(1)} %</text>
            <line x1="16" y1="86" x2="154" y2="86" stroke="#334155" stroke-opacity="0.6" />
            <text x="16" y="104" fill="#cbd5e1" font-size="10" font-family="JetBrains Mono, monospace">→ Direkt: ${fmt(d.pvDirect)} kWh</text>
            <text x="16" y="120" fill="#cbd5e1" font-size="10" font-family="JetBrains Mono, monospace">→ Speicher: ${fmt(d.batChg)} kWh</text>
            <text x="16" y="136" fill="#cbd5e1" font-size="10" font-family="JetBrains Mono, monospace">→ Netz-Exp: ${fmt(d.gridExp)} kWh</text>
        </g>

        <!-- Node 2: Netzbezug -->
        <g transform="translate(14, 194)">
            <rect width="170" height="114" rx="18" fill="#112233" fill-opacity="0.92" stroke="#3b82f6" stroke-width="1.8" />
            <rect x="0" y="0" width="6" height="114" rx="3" fill="#3b82f6" />
            <text x="16" y="26" fill="#93c5fd" font-size="11" font-weight="800" letter-spacing="0.04em">NETZBEZUG</text>
            <text x="16" y="54" fill="#ffffff" font-size="20" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.gridImp)} kWh</text>
            <text x="16" y="75" fill="#94a3b8" font-size="10.5" font-weight="600">${houseShareGridPct} % des Hausverbrauchs</text>
            <text x="16" y="96" fill="#60a5fa" font-size="10" font-family="JetBrains Mono, monospace">Restbedarf aus Stromnetz</text>
        </g>

        <!-- MIDDLE COLUMN NODES (DIRECT & BATTERY) -->
        <!-- Node 3: PV-Direktverbrauch -->
        <g transform="translate(295, 20)">
            <rect width="180" height="96" rx="18" fill="#102924" fill-opacity="0.92" stroke="#10b981" stroke-width="1.8" />
            <rect x="0" y="0" width="6" height="96" rx="3" fill="#10b981" />
            <text x="16" y="25" fill="#6ee7b7" font-size="11" font-weight="800" letter-spacing="0.04em">PV-DIREKTVERBRAUCH</text>
            <text x="16" y="52" fill="#ffffff" font-size="20" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.pvDirect)} kWh</text>
            <text x="16" y="74" fill="#a7f3d0" font-size="10.5" font-weight="600">Deckt ${houseShareDirectPct} % im Haus direkt</text>
        </g>

        <!-- Node 4: Batteriespeicher -->
        <g transform="translate(295, 132)">
            <rect width="180" height="118" rx="18" fill="#211730" fill-opacity="0.92" stroke="#a855f7" stroke-width="1.8" />
            <rect x="0" y="0" width="6" height="118" rx="3" fill="#a855f7" />
            <text x="16" y="24" fill="#d8b4fe" font-size="11" font-weight="800" letter-spacing="0.04em">${batName.toUpperCase()}</text>
            <text x="16" y="50" fill="#ffffff" font-size="19" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.batDis)} kWh</text>
            <text x="16" y="68" fill="#cbd5e1" font-size="10" font-family="JetBrains Mono, monospace">Ladung: ${fmt(d.batChg)} kWh</text>
            <text x="16" y="84" fill="#c084fc" font-size="10" font-weight="600">Deckt ${houseShareBatPct} % im Haus</text>
            <text x="16" y="102" fill="#94a3b8" font-size="9.5" font-family="JetBrains Mono, monospace">η ≈ ${d.batEffPct.toFixed(0)}% (Verlust: ${fmt(d.batLoss)} kWh)</text>
        </g>

        <!-- RIGHT COLUMN NODES (SINKS) -->
        <!-- Node 5: Hausverbrauch Gesamt -->
        <g transform="translate(586, 20)">
            <rect width="180" height="168" rx="18" fill="#291f12" fill-opacity="0.92" stroke="#f59e0b" stroke-width="1.8" />
            <rect x="174" y="0" width="6" height="168" rx="3" fill="#f59e0b" />
            <text x="16" y="26" fill="#fcd34d" font-size="11" font-weight="800" letter-spacing="0.04em">HAUSVERBRAUCH</text>
            <text x="16" y="54" fill="#ffffff" font-size="21" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.houseTotal)} kWh</text>
            <text x="16" y="74" fill="#fde68a" font-size="10.5" font-weight="700">Autarkie: ${d.autarkyPct.toFixed(1)} %</text>
            <line x1="16" y1="86" x2="160" y2="86" stroke="#475569" stroke-opacity="0.5" />
            <text x="16" y="105" fill="#6ee7b7" font-size="10" font-family="JetBrains Mono, monospace">● PV-Direkt: ${houseShareDirectPct}% (${fmt(d.pvDirect)})</text>
            <text x="16" y="123" fill="#d8b4fe" font-size="10" font-family="JetBrains Mono, monospace">● Speicher:  ${houseShareBatPct}% (${fmt(d.batDis)})</text>
            <text x="16" y="141" fill="#93c5fd" font-size="10" font-family="JetBrains Mono, monospace">● Netzbezug: ${houseShareGridPct}% (${fmt(d.gridImp)})</text>
        </g>

        <!-- Node 6: Netzeinspeisung -->
        <g transform="translate(586, 204)">
            <rect width="180" height="104" rx="18" fill="#0f252e" fill-opacity="0.92" stroke="#06b6d4" stroke-width="1.8" />
            <rect x="174" y="0" width="6" height="104" rx="3" fill="#06b6d4" />
            <text x="16" y="26" fill="#67e8f9" font-size="11" font-weight="800" letter-spacing="0.04em">NETZEINSPEISUNG</text>
            <text x="16" y="54" fill="#ffffff" font-size="20" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.gridExp)} kWh</text>
            <text x="16" y="75" fill="#94a3b8" font-size="10.5" font-weight="600">${pvShareExpPct} % der PV-Erzeugung</text>
            <text x="16" y="93" fill="#22d3ee" font-size="10" font-family="JetBrains Mono, monospace">EEG-Überschuss ins Netz</text>
        </g>
    </svg>`;

    // 2. Render Summary Ribbon Below Sankey
    const ribbon = document.getElementById('sankeySummaryRibbon');
    if (ribbon) {
        ribbon.innerHTML = `
            <div class="p-2.5 rounded-xl bg-white/75 dark:bg-[#13232b]/80 border border-slate-200/80 dark:border-teal-500/20">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Zeitraum</span>
                <span class="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate block mt-0.5">${d.periodLabel}</span>
            </div>
            <div class="p-2.5 rounded-xl bg-white/75 dark:bg-[#13232b]/80 border border-slate-200/80 dark:border-teal-500/20">
                <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">Autarkiequote</span>
                <span class="text-sm font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 block mt-0.5">${d.autarkyPct.toFixed(1)} %</span>
            </div>
            <div class="p-2.5 rounded-xl bg-white/75 dark:bg-[#13232b]/80 border border-slate-200/80 dark:border-teal-500/20">
                <span class="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 block">Eigenverbrauch</span>
                <span class="text-sm font-black font-mono tabular-nums text-teal-600 dark:text-teal-400 block mt-0.5">${d.eigenQuotaPct.toFixed(1)} %</span>
            </div>
            <div class="p-2.5 rounded-xl bg-white/75 dark:bg-[#13232b]/80 border border-slate-200/80 dark:border-teal-500/20">
                <span class="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 block">Selbst gedeckt</span>
                <span class="text-sm font-black font-mono tabular-nums text-purple-600 dark:text-purple-300 block mt-0.5">${fmt(d.pvDirect + d.batDis)} kWh</span>
            </div>
        `;
    }
}

function renderSollIstPanel(baseline, metrics) {
    const ctx = document.getElementById('sollIstComparisonChart');
    if (ctx && typeof Chart !== 'undefined') {
        const sollData = metrics.monthlyComparison.map(m => Math.round(m.sollKwh));
        const realData = metrics.monthlyComparison.map(m => m.hasReal ? Math.round(m.realPv) : 0);
        const barColors = metrics.monthlyComparison.map(m => {
            if (!m.hasReal) return 'rgba(148, 163, 184, 0.25)';
            return m.realPv >= m.sollKwh * 0.98 ? '#14b8a6' : '#f59e0b';
        });

        if (chartSollIst) chartSollIst.destroy();
        chartSollIst = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: MONTH_LABELS_SHORT,
                datasets: [
                    {
                        label: 'PVGIS Soll-Prognose (kWh)',
                        data: sollData,
                        backgroundColor: 'rgba(56, 189, 248, 0.35)',
                        borderColor: '#38bdf8',
                        borderWidth: 1.5,
                        borderRadius: 6
                    },
                    {
                        label: `Realer Ist-Ertrag ${selectedAnalysisYear} (kWh)`,
                        data: realData,
                        backgroundColor: barColors,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.12)' } }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
                }
            }
        });
    }

    const gridEl = document.getElementById('sollIstMonthlyCardsGrid');
    if (gridEl) {
        gridEl.innerHTML = metrics.monthlyComparison.map(m => {
            const diffKwh = m.hasReal ? Math.round(m.realPv - m.sollKwh) : null;
            const diffSign = diffKwh !== null && diffKwh >= 0 ? '+' : '';
            const statusColor = !m.hasReal
                ? 'text-slate-400'
                : (m.perfIndexPct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : (m.perfIndexPct >= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'));

            return `
            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-[#152228] border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between">
                <div class="flex items-center justify-between text-xs">
                    <span class="font-bold text-slate-700 dark:text-slate-200">${m.labelLong}</span>
                    <span class="font-mono tabular-nums font-bold ${statusColor}">${m.hasReal ? `${m.perfIndexPct.toFixed(0)} %` : 'Offen'}</span>
                </div>
                <div class="mt-2 flex items-baseline justify-between font-mono tabular-nums">
                    <div>
                        <span class="text-[10px] text-slate-400 block">Ist / Soll</span>
                        <span class="text-xs font-extrabold text-slate-900 dark:text-white">${m.hasReal ? Math.round(m.realPv) : '—'}</span>
                        <span class="text-[11px] text-slate-400"> / ${Math.round(m.sollKwh)} kWh</span>
                    </div>
                    <div class="text-right">
                        <span class="text-[11px] font-bold ${statusColor}">${diffKwh !== null ? `${diffSign}${diffKwh} kWh` : ''}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
}

function renderAutarkyBatteryPanel(baseline, metrics) {
    setElText('ana_bat_autarky_pct', `${metrics.realAutarkyPct.toFixed(1)} %`);
    setElText('ana_bat_eigen_pct', `${metrics.realEigenQuotaPct.toFixed(1)} %`);
    setElText('ana_bat_eff_pct', baseline.totalBatteryKwh > 0 ? `${metrics.batEfficiencyPct.toFixed(1)} %` : 'Ohne Akku');
    setElText('ana_bat_cycles', baseline.totalBatteryKwh > 0 ? `${metrics.batFullCycles.toFixed(0)} Zyklen` : '0 Zyklen');

    setElText('ana_bat_detail_direct', `${Math.round(metrics.directTotalKwh).toLocaleString('de-DE')} kWh`);
    setElText('ana_bat_detail_discharged', `${Math.round(metrics.batDischargedSum).toLocaleString('de-DE')} kWh`);
    setElText('ana_bat_detail_grid_in', `${Math.round(metrics.gridImportSum).toLocaleString('de-DE')} kWh`);
    setElText('ana_bat_detail_loss', `${Math.round(metrics.batLossKwh).toLocaleString('de-DE')} kWh`);

    const ctx = document.getElementById('realAutarkyBalanceChart');
    if (ctx && typeof Chart !== 'undefined') {
        if (chartRealAutarky) chartRealAutarky.destroy();
        chartRealAutarky = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: MONTH_LABELS_SHORT,
                datasets: [
                    {
                        label: 'PV Direktverbrauch (kWh)',
                        data: metrics.monthlyComparison.map(m => Math.round(m.directKwh)),
                        backgroundColor: '#14b8a6',
                        stack: 'cons'
                    },
                    {
                        label: 'Aus Batteriespeicher (kWh)',
                        data: metrics.monthlyComparison.map(m => Math.round(m.bDis)),
                        backgroundColor: '#a855f7',
                        stack: 'cons'
                    },
                    {
                        label: 'Rest-Netzbezug (kWh)',
                        data: metrics.monthlyComparison.map(m => Math.round(m.impKwh)),
                        backgroundColor: '#3b82f6',
                        stack: 'cons'
                    },
                    {
                        label: 'Netzeinspeisung (kWh)',
                        data: metrics.monthlyComparison.map(m => Math.round(m.expKwh)),
                        backgroundColor: '#f59e0b',
                        stack: 'export'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.12)' } }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
                }
            }
        });
    }
}

function renderRealAmortizationPanel(baseline, metrics) {
    const deltaAnnualEur = metrics.projectedAnnualRealEur - metrics.plannedAnnualEur;
    const deltaSign = deltaAnnualEur >= 0 ? '+' : '';
    const paybackPct = baseline.sysCostEur > 0 ? Math.min(100, (metrics.recordedTotalEur / baseline.sysCostEur) * 100) : 0;

    setElText('ana_fin_invest_total', `${Math.round(baseline.sysCostEur).toLocaleString('de-DE')} €`);
    setElText('ana_fin_saved_self', `${Math.round(metrics.recordedSelfSavingsEur).toLocaleString('de-DE')} €`);
    setElText('ana_fin_saved_eeg', `${Math.round(metrics.recordedFeedInEur).toLocaleString('de-DE')} €`);
    setElText('ana_fin_delta_plan', `${deltaSign}${Math.round(deltaAnnualEur).toLocaleString('de-DE')} €/Jahr`);
    setElText('ana_fin_amort_compare', `${metrics.realAmortYears.toFixed(1)} J. (Ist) vs. ${metrics.plannedAmortYears.toFixed(1)} J. (Plan)`);
    setElText('ana_fin_progress_label', `${paybackPct.toFixed(1)} % im aktuellen Jahr eingespielt (${Math.round(metrics.recordedTotalEur).toLocaleString('de-DE')} € von ${Math.round(baseline.sysCostEur).toLocaleString('de-DE')} €)`);

    const progBar = document.getElementById('ana_fin_progress_bar');
    if (progBar) progBar.style.width = `${Math.max(2, paybackPct)}%`;

    const ctx = document.getElementById('realAmortizationCurveChart');
    if (ctx && typeof Chart !== 'undefined') {
        const yearsLabels = Array.from({ length: 21 }, (_, y) => `Jahr ${y}`);
        const plannedCurve = yearsLabels.map((_, y) => Math.round(-baseline.sysCostEur + y * metrics.plannedAnnualEur));
        const realCurve = yearsLabels.map((_, y) => Math.round(-baseline.sysCostEur + y * metrics.projectedAnnualRealEur));

        if (chartRealAmort) chartRealAmort.destroy();
        chartRealAmort = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: yearsLabels,
                datasets: [
                    {
                        label: 'Realer Amortisationspfad (€ kumuliert)',
                        data: realCurve,
                        borderColor: '#14b8a6',
                        backgroundColor: 'rgba(20, 184, 166, 0.12)',
                        fill: true,
                        borderWidth: 2.5,
                        tension: 0.25,
                        pointRadius: 2
                    },
                    {
                        label: 'Geplanter PVGIS-Amortisationspfad (€)',
                        data: plannedCurve,
                        borderColor: '#38bdf8',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        fill: false,
                        tension: 0.25,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: { grid: { color: 'rgba(148, 163, 184, 0.12)' } }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
                }
            }
        });
    }
}

function renderMonthlyLogbookTable(baseline, metrics) {
    const tbody = document.getElementById('monthlyLogbookTableBody');
    if (!tbody) return;

    const monthsRaw = getCurrentYearMonthsData(selectedAnalysisYear);

    tbody.innerHTML = metrics.monthlyComparison.map((m, idx) => {
        const raw = monthsRaw[idx] || {};
        const pvVal = raw.pvYieldKwh !== null && raw.pvYieldKwh !== undefined ? raw.pvYieldKwh : '';
        const expVal = raw.gridExportKwh !== null && raw.gridExportKwh !== undefined ? raw.gridExportKwh : '';
        const impVal = raw.gridImportKwh !== null && raw.gridImportKwh !== undefined ? raw.gridImportKwh : '';
        const bChgVal = raw.batteryChargedKwh !== null && raw.batteryChargedKwh !== undefined ? raw.batteryChargedKwh : '';
        const bDisVal = raw.batteryDischargedKwh !== null && raw.batteryDischargedKwh !== undefined ? raw.batteryDischargedKwh : '';

        const perfStr = m.hasReal && m.perfIndexPct !== null ? `${m.perfIndexPct.toFixed(0)} %` : '—';
        const perfCls = !m.hasReal ? 'text-slate-400' : (m.perfIndexPct >= 100 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold');

        return `
        <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
            <td class="py-2.5 px-3 font-bold text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">${m.labelLong}</td>
            <td class="py-2.5 px-3 font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 text-right">${Math.round(m.sollKwh)} kWh</td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${pvVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'pvYieldKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-teal-500 outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${expVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'gridExportKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-teal-500 outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${impVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'gridImportKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-teal-500 outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${bChgVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'batteryChargedKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-teal-500 outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${bDisVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'batteryDischargedKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-teal-500 outline-none">
            </td>
            <td class="py-2.5 px-3 font-mono tabular-nums text-xs text-right ${perfCls}">${perfStr}</td>
            <td class="py-2.5 px-3 font-mono tabular-nums text-xs font-bold text-slate-800 dark:text-slate-200 text-right">${m.hasReal ? `${m.totalBenefitEur.toFixed(0)} €` : '—'}</td>
        </tr>`;
    }).join('');
}

function onMonthlyRecordFieldChange(monthIdx, field, rawValue) {
    const months = getCurrentYearMonthsData(selectedAnalysisYear);
    if (!months[monthIdx]) return;

    if (rawValue === '' || rawValue === null) {
        months[monthIdx][field] = null;
    } else {
        const val = parseFloat(rawValue);
        months[monthIdx][field] = isNaN(val) ? null : Math.max(0, val);
        months[monthIdx].source = 'manual';
    }

    savePerformanceRecordsLocalAndServer();
    renderAnalysisSection();
}

function syncCurrentMonthFromLiveTelemetry(showToast = true) {
    const curMonth = new Date().getMonth();
    const months = getCurrentYearMonthsData(selectedAnalysisYear);
    const t = currentLiveTelemetry;

    if (!months[curMonth]) return;
    if (t.pvEnergyMonthKwh !== null && t.pvEnergyMonthKwh !== undefined) {
        months[curMonth].pvYieldKwh = Math.round(t.pvEnergyMonthKwh);
    }
    if (t.gridExportMonthKwh !== null && t.gridExportMonthKwh !== undefined) {
        months[curMonth].gridExportKwh = Math.round(t.gridExportMonthKwh);
    }
    if (t.gridImportMonthKwh !== null && t.gridImportMonthKwh !== undefined) {
        months[curMonth].gridImportKwh = Math.round(t.gridImportMonthKwh);
    }
    if (t.batteryChargeMonthKwh !== null && t.batteryChargeMonthKwh !== undefined) {
        months[curMonth].batteryChargedKwh = Math.round(t.batteryChargeMonthKwh);
    }
    if (t.batteryDischargeMonthKwh !== null && t.batteryDischargeMonthKwh !== undefined) {
        months[curMonth].batteryDischargedKwh = Math.round(t.batteryDischargeMonthKwh);
    }
    months[curMonth].source = 'ha';

    savePerformanceRecordsLocalAndServer();
    renderAnalysisSection();
    if (showToast && typeof showToastNotification === 'function') {
        showToastNotification(`Monatswerte (${MONTH_LABELS_LONG[curMonth]}) erfolgreich aus Live-Zählern übernommen!`, 'success');
    }
}

function fillSampleYearPerformanceData() {
    const projId = getActiveAnalysisProjectId();
    if (!performanceRecordsByProject[projId]) performanceRecordsByProject[projId] = {};
    performanceRecordsByProject[projId][String(selectedAnalysisYear)] = {
        months: generateRealisticSampleMonths(selectedAnalysisYear, 12),
        updatedAt: new Date().toISOString()
    };
    savePerformanceRecordsLocalAndServer();
    renderAnalysisSection();
    if (typeof showToastNotification === 'function') {
        showToastNotification(`12 Monate Referenz-Betriebsdaten für ${selectedAnalysisYear} geladen.`, 'success');
    }
}

function clearYearPerformanceData() {
    const projId = getActiveAnalysisProjectId();
    if (!performanceRecordsByProject[projId]) performanceRecordsByProject[projId] = {};
    performanceRecordsByProject[projId][String(selectedAnalysisYear)] = {
        months: createEmptyYearMonths(),
        updatedAt: new Date().toISOString()
    };
    savePerformanceRecordsLocalAndServer();
    renderAnalysisSection();
    if (typeof showToastNotification === 'function') {
        showToastNotification(`Monatswerte für ${selectedAnalysisYear} zurückgesetzt.`, 'info');
    }
}

function exportPerformanceCsv() {
    const baseline = getPlannedSystemBaseline();
    const metrics = computeAggregatedPerformanceMetrics(baseline);
    const header = ['Monat', 'PVGIS_Soll_kWh', 'PV_Ist_kWh', 'Einspeisung_kWh', 'Netzbezug_kWh', 'Batterie_Ladung_kWh', 'Batterie_Entladung_kWh', 'Soll_Erfuellung_Prozent', 'Ersparnis_Euro'];
    const rows = metrics.monthlyComparison.map(m => [
        m.labelLong,
        Math.round(m.sollKwh),
        m.hasReal ? Math.round(m.realPv) : '',
        m.hasReal ? Math.round(m.expKwh) : '',
        m.hasReal ? Math.round(m.impKwh) : '',
        m.hasReal ? Math.round(m.bChg) : '',
        m.hasReal ? Math.round(m.bDis) : '',
        m.hasReal && m.perfIndexPct !== null ? m.perfIndexPct.toFixed(1) : '',
        m.hasReal ? m.totalBenefitEur.toFixed(2) : ''
    ]);

    const csvContent = [header.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PV_Performance_${selectedAnalysisYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function triggerImportPerformanceCsv() {
    const inp = document.getElementById('performanceCsvInput');
    if (inp) inp.click();
}

function onImportPerformanceCsvFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = String(e.target.result || '');
            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
            const months = getCurrentYearMonthsData(selectedAnalysisYear);

            lines.slice(1).forEach((line, idx) => {
                if (idx >= 12) return;
                const cols = line.split(/[;,]/);
                if (cols.length >= 3) {
                    const pv = parseFloat(cols[2]);
                    const exp = parseFloat(cols[3]);
                    const imp = parseFloat(cols[4]);
                    const bChg = parseFloat(cols[5]);
                    const bDis = parseFloat(cols[6]);
                    if (!isNaN(pv)) {
                        months[idx].pvYieldKwh = pv;
                        months[idx].gridExportKwh = !isNaN(exp) ? exp : 0;
                        months[idx].gridImportKwh = !isNaN(imp) ? imp : 0;
                        months[idx].batteryChargedKwh = !isNaN(bChg) ? bChg : 0;
                        months[idx].batteryDischargedKwh = !isNaN(bDis) ? bDis : 0;
                        months[idx].source = 'csv';
                    }
                }
            });

            savePerformanceRecordsLocalAndServer();
            renderAnalysisSection();
            if (typeof showToastNotification === 'function') {
                showToastNotification('CSV-Performance-Daten erfolgreich importiert!', 'success');
            }
        } catch (err) {
            if (typeof showToastNotification === 'function') {
                showToastNotification('Fehler beim CSV-Import: ' + err.message, 'error');
            }
        }
    };
    reader.readAsText(file);
}

// ============================================================================
// 7. HOME ASSISTANT & FREELY CONFIGURABLE SENSORS MODAL (STRINGS & CONSUMERS)
// ============================================================================

function switchHaModalTab(tab = 'config') {
    const panelCfg = document.getElementById('ha-modal-panel-config');
    const panelGuide = document.getElementById('ha-modal-panel-guide');
    const btnCfg = document.getElementById('btn-ha-tab-config') || document.getElementById('btn-ha-modal-tab-config');
    const btnGuide = document.getElementById('btn-ha-tab-guide') || document.getElementById('btn-ha-modal-tab-guide');

    if (tab === 'guide') {
        if (panelCfg) panelCfg.classList.add('hidden');
        if (panelGuide) panelGuide.classList.remove('hidden');
        if (btnGuide) btnGuide.className = "px-3.5 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-xs";
        if (btnCfg) btnCfg.className = "px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
    } else {
        if (panelCfg) panelCfg.classList.remove('hidden');
        if (panelGuide) panelGuide.classList.add('hidden');
        if (btnCfg) btnCfg.className = "px-3.5 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-xs";
        if (btnGuide) btnGuide.className = "px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
    }
}

function copyHaReverseProxyYaml() {
    const blockEl = document.getElementById('haReverseProxyYamlBlock') || document.getElementById('haReverseProxyYamlCode');
    if (!blockEl) return;
    const textToCopy = blockEl.value !== undefined ? blockEl.value : blockEl.innerText;
    navigator.clipboard.writeText(textToCopy).then(() => {
        if (typeof showToastNotification === 'function') {
            showToastNotification('http / cors configuration.yaml Vorlage in die Zwischenablage kopiert!', 'success');
        }
    });
}

function openHaConfigModal(focusSection = null) {
    const modal = document.getElementById('modal-ha-config');
    if (!modal) return;

    const cleanMode = (!haConfigState.mode || haConfigState.mode === 'demo') ? 'poll' : haConfigState.mode;
    setElVal('ha_cfg_mode', cleanMode);
    setElVal('ha_cfg_url', haConfigState.baseUrl || 'https://home.mb10.org');
    setElVal('ha_cfg_token', haConfigState.accessToken || '');
    setElVal('ha_cfg_interval', haConfigState.pollIntervalSec || 10);
    setElVal('ha_cfg_bat_name', haConfigState.batteryName || 'BYD HVS+');

    const ent = haConfigState.entities || {};
    setElVal('ha_ent_pv_power', ent.pvPower || '');
    setElVal('ha_ent_load_power', ent.loadPower || '');
    setElVal('ha_ent_grid_power', ent.gridPower || '');
    setElVal('ha_ent_bat_chg_power', ent.batteryChargePower || '');
    setElVal('ha_ent_bat_dis_power', ent.batteryDischargePower || '');
    setElVal('ha_ent_bat_power', ent.batteryPower || '');
    setElVal('ha_ent_bat_soc', ent.batterySoc || '');
    setElVal('ha_ent_pv_today', ent.pvEnergyToday || '');
    setElVal('ha_ent_pv_month', ent.pvEnergyMonth || '');
    setElVal('ha_ent_grid_imp_month', ent.gridImportMonth || '');
    setElVal('ha_ent_grid_exp_month', ent.gridExportMonth || '');
    setElVal('ha_ent_bat_chg_month', ent.batteryChargeMonth || '');
    setElVal('ha_ent_bat_dis_month', ent.batteryDischargeMonth || '');

    renderHaCustomStringsEditor();
    renderHaCustomConsumersEditor();
    renderHaPvEnergyExtraList();
    updateHaWebhookYamlSnippet();
    updateHaReverseProxyYamlDynamic();

    modal.classList.remove('hidden');

    if (focusSection === 'guide') {
        switchHaModalTab('guide');
        return;
    }

    switchHaModalTab('config');

    if (focusSection === 'consumers') {
        setTimeout(() => {
            document.getElementById('haConsumersSectionBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    } else if (focusSection === 'strings') {
        setTimeout(() => {
            document.getElementById('haStringsSectionBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    } else if (focusSection === 'counters') {
        setTimeout(() => {
            document.getElementById('haCountersSectionBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
}

function updateHaReverseProxyYamlDynamic() {
    const currentOrigin = window.location.origin;
    const originsSet = new Set([currentOrigin, 'https://magic8383.github.io', 'https://aistudio.google.com']);
    const originsLines = [...originsSet].map(o => `    - ${o}`).join('\n');
    const yamlText = `http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 127.0.0.1
    - ::1
    - 172.16.0.0/12
    - 192.168.0.0/16
    - 10.0.0.0/8
  cors_allowed_origins:
${originsLines}`;

    const blockEl = document.getElementById('haReverseProxyYamlBlock');
    if (blockEl) blockEl.innerText = yamlText;
    const codeEl = document.getElementById('haReverseProxyYamlCode');
    if (codeEl) codeEl.value = yamlText;
}

function closeHaConfigModal() {
    const modal = document.getElementById('modal-ha-config');
    if (modal) modal.classList.add('hidden');
}

function renderHaCustomStringsEditor() {
    const container = document.getElementById('haStringMappingContainer');
    if (!container) return;

    const list = Array.isArray(haConfigState.customStrings) ? haConfigState.customStrings : [];
    if (list.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 py-2">Noch keine eigenen PV-Strings oder Wechselrichter angelegt.</p>`;
        return;
    }

    container.innerHTML = list.map((cs, idx) => {
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(cs.name || '') : (cs.name || '');
        const safePower = typeof escapeHtml === 'function' ? escapeHtml(cs.powerEntity || '') : (cs.powerEntity || '');
        const safeEnergy = typeof escapeHtml === 'function' ? escapeHtml(cs.energyEntity || '') : (cs.energyEntity || '');
        const safeColor = cs.color || '#14b8a6';

        return `
        <div class="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            <div class="sm:col-span-3 flex items-center gap-2">
                <input type="color" value="${safeColor}" onchange="updateHaCustomStringField(${idx}, 'color', this.value)" class="w-7 h-7 rounded-full shrink-0 cursor-pointer border-0">
                <div class="flex-1 min-w-0">
                    <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Bezeichnung (Kachel & Kurve)</label>
                    <input type="text" id="ha_str_name_${idx}" value="${safeName}" oninput="updateHaCustomStringField(${idx}, 'name', this.value)"
                        placeholder="z.B. Fronius · String 1 DC"
                        class="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                </div>
            </div>
            <div class="sm:col-span-4">
                <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Leistungs-Entität (W / kW)</label>
                <div class="flex items-center gap-1">
                    <input type="text" id="ha_str_pwr_${idx}" list="haEntitiesDatalist" value="${safePower}" oninput="updateHaCustomStringField(${idx}, 'powerEntity', this.value)"
                        placeholder="sensor.fronius_string_1_power"
                        class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                    <button type="button" onclick="openHaEntityPicker({ customType: 'stringPower', index: ${idx}, unitFilter: 'power', title: 'PV-String ${idx + 1} · Leistung (W/kW)' })" class="px-2 py-1.5 rounded-lg bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/35 text-teal-700 dark:text-teal-300 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer" title="Sensor aus Gerät/Helfer wählen">
                        <span class="material-symbols-rounded text-sm">list_alt</span>
                        <span>Wählen</span>
                    </button>
                </div>
            </div>
            <div class="sm:col-span-4">
                <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Tagesenergie (kWh, optional)</label>
                <div class="flex items-center gap-1">
                    <input type="text" id="ha_str_nrg_${idx}" list="haEntitiesDatalist" value="${safeEnergy}" oninput="updateHaCustomStringField(${idx}, 'energyEntity', this.value)"
                        placeholder="Leer = aus W berechnet"
                        class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                    <button type="button" onclick="openHaEntityPicker({ customType: 'stringEnergy', index: ${idx}, unitFilter: 'energy', title: 'PV-String ${idx + 1} · Tagesertrag (kWh)' })" class="px-2 py-1.5 rounded-lg bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/35 text-teal-700 dark:text-teal-300 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer" title="Energiezähler aus Gerät/Helfer wählen">
                        <span class="material-symbols-rounded text-sm">list_alt</span>
                        <span>Wählen</span>
                    </button>
                </div>
            </div>
            <div class="sm:col-span-1 flex justify-end sm:pt-4">
                <button type="button" onclick="removeHaCustomString(${idx})" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer" title="String entfernen">
                    <span class="material-symbols-rounded text-base">delete</span>
                </button>
            </div>
        </div>`;
    }).join('');
}

function updateHaCustomStringField(idx, field, val) {
    if (!Array.isArray(haConfigState.customStrings) || !haConfigState.customStrings[idx]) return;
    haConfigState.customStrings[idx][field] = val;
}

function addHaCustomString() {
    if (!Array.isArray(haConfigState.customStrings)) haConfigState.customStrings = [];
    const palette = ['#14b8a6', '#f59e0b', '#22c55e', '#38bdf8', '#a855f7', '#ec4899'];
    const newId = 'str_custom_' + Date.now();
    const nextNum = haConfigState.customStrings.length + 1;
    haConfigState.customStrings.push({
        id: newId,
        name: `PV-String ${nextNum} · DC`,
        powerEntity: '',
        energyEntity: '',
        color: palette[(nextNum - 1) % palette.length]
    });
    activeCurveKeys.add(newId);
    renderHaCustomStringsEditor();
}
const addHaCustomStringRow = addHaCustomString;

function removeHaCustomString(idx) {
    if (!Array.isArray(haConfigState.customStrings)) return;
    const removed = haConfigState.customStrings.splice(idx, 1)[0];
    if (removed && removed.id) activeCurveKeys.delete(removed.id);
    renderHaCustomStringsEditor();
}

function syncCustomStringsFromPlannedStrings() {
    const baseline = getPlannedSystemBaseline();
    if (!baseline.stringSummaries || baseline.stringSummaries.length === 0) return;

    haConfigState.customStrings = baseline.stringSummaries.map((s, idx) => {
        const id = `str_plan_${s.id}`;
        activeCurveKeys.add(id);
        return {
            id,
            name: `${s.inverterName} · ${s.name} DC`,
            powerEntity: `sensor.string_${idx + 1}_power`,
            energyEntity: `sensor.string_${idx + 1}_energy_today`,
            color: s.color || '#14b8a6'
        };
    });
    renderHaCustomStringsEditor();
    if (typeof showToastNotification === 'function') {
        showToastNotification(`${baseline.stringSummaries.length} Strings aus deiner PV-Planung übernommen!`, 'success');
    }
}

function renderHaCustomConsumersEditor() {
    const container = document.getElementById('haConsumersMappingContainer');
    if (!container) return;

    const list = Array.isArray(haConfigState.customConsumers) ? haConfigState.customConsumers : [];
    if (list.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 py-2">Noch keine Einzelverbraucher angelegt. Klicke auf „+ Verbraucher hinzufügen“.</p>`;
        return;
    }

    container.innerHTML = list.map((cc, idx) => {
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(cc.name || '') : (cc.name || '');
        const safeEnt = typeof escapeHtml === 'function' ? escapeHtml(cc.powerEntity || '') : (cc.powerEntity || '');
        return `
        <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            <div class="sm:col-span-5">
                <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Gerätename (z.B. Trockner, Wärmepumpe)</label>
                <input type="text" id="ha_cons_name_${idx}" value="${safeName}" oninput="updateHaCustomConsumerField(${idx}, 'name', this.value)"
                    placeholder="Trockner"
                    class="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
            </div>
            <div class="sm:col-span-6">
                <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Home Assistant Leistungs-Entität (W oder kW)</label>
                <div class="flex items-center gap-1.5">
                    <input type="text" id="ha_cons_pwr_${idx}" list="haEntitiesDatalist" value="${safeEnt}" oninput="updateHaCustomConsumerField(${idx}, 'powerEntity', this.value)"
                        placeholder="sensor.trockner_power"
                        class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                    <button type="button" onclick="openHaEntityPicker({ customType: 'consumerPower', index: ${idx}, unitFilter: 'power', title: 'Einzelverbraucher ${idx + 1} · Leistung (W/kW)' })" class="px-2.5 py-1.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/35 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer" title="Verbraucher-Sensor aus Gerät oder Helfer wählen">
                        <span class="material-symbols-rounded text-sm">list_alt</span>
                        <span>Wählen</span>
                    </button>
                </div>
            </div>
            <div class="sm:col-span-1 flex justify-end sm:pt-4">
                <button type="button" onclick="removeHaCustomConsumer(${idx})" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer" title="Verbraucher entfernen">
                    <span class="material-symbols-rounded text-base">delete</span>
                </button>
            </div>
        </div>`;
    }).join('');
}

function updateHaCustomConsumerField(idx, field, val) {
    if (!Array.isArray(haConfigState.customConsumers) || !haConfigState.customConsumers[idx]) return;
    haConfigState.customConsumers[idx][field] = val;
}

function addHaCustomConsumer() {
    if (!Array.isArray(haConfigState.customConsumers)) haConfigState.customConsumers = [];
    const nextNum = haConfigState.customConsumers.length + 1;
    haConfigState.customConsumers.push({
        id: 'cons_' + Date.now(),
        name: `Verbraucher ${nextNum}`,
        powerEntity: ''
    });
    renderHaCustomConsumersEditor();
}
const addHaCustomConsumerRow = addHaCustomConsumer;

function removeHaCustomConsumer(idx) {
    if (!Array.isArray(haConfigState.customConsumers)) return;
    haConfigState.customConsumers.splice(idx, 1);
    renderHaCustomConsumersEditor();
}

function renderHaPvEnergyExtraList() {
    const container = document.getElementById('haPvEnergyExtraContainer');
    if (!container) return;
    const list = Array.isArray(haConfigState.pvEnergyExtraEntities) ? haConfigState.pvEnergyExtraEntities : [];
    if (list.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = list.map((entId, idx) => {
        const wrNum = idx + 3;
        const safeEnt = typeof escapeHtml === 'function' ? escapeHtml(entId || '') : (entId || '');
        return `
        <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-teal-500/30 flex flex-col sm:flex-row sm:items-center gap-2">
            <label class="text-[11px] font-semibold text-teal-700 dark:text-teal-300 sm:w-64 shrink-0">PV-Erzeugung · Wechselrichter ${wrNum} (kWh)</label>
            <div class="flex items-center gap-1.5 flex-1 min-w-0">
                <input type="text" id="ha_ent_pv_extra_${idx}" list="haEntitiesDatalist" value="${safeEnt}"
                    oninput="updateHaPvEnergyExtraField(${idx}, this.value)"
                    placeholder="sensor.wechselrichter_${wrNum}_energy_total"
                    class="flex-1 min-w-0 text-xs font-mono px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                <button type="button" onclick="openHaEntityPicker({ customType: 'pvEnergyExtra', index: ${idx}, unitFilter: 'energy', title: 'PV-Erzeugung · Wechselrichter ${wrNum} (kWh)' })"
                    class="px-2.5 py-1.5 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/35 text-teal-700 dark:text-teal-300 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer">
                    <span class="material-symbols-rounded text-sm">list_alt</span>
                    <span>Wählen</span>
                </button>
                <button type="button" onclick="removeHaPvEnergyExtra(${idx})" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0" title="Wechselrichter-Zähler entfernen">
                    <span class="material-symbols-rounded text-base">delete</span>
                </button>
            </div>
        </div>`;
    }).join('');
}

function addHaPvEnergyExtra() {
    readHaModalIntoState();
    if (!Array.isArray(haConfigState.pvEnergyExtraEntities)) {
        haConfigState.pvEnergyExtraEntities = [];
    }
    haConfigState.pvEnergyExtraEntities.push('');
    renderHaPvEnergyExtraList();
    setTimeout(() => {
        const idx = haConfigState.pvEnergyExtraEntities.length - 1;
        document.getElementById(`ha_ent_pv_extra_${idx}`)?.focus();
    }, 40);
}

function updateHaPvEnergyExtraField(idx, val) {
    if (!Array.isArray(haConfigState.pvEnergyExtraEntities)) return;
    haConfigState.pvEnergyExtraEntities[idx] = String(val || '').trim();
}

function removeHaPvEnergyExtra(idx) {
    if (!Array.isArray(haConfigState.pvEnergyExtraEntities)) return;
    haConfigState.pvEnergyExtraEntities.splice(idx, 1);
    renderHaPvEnergyExtraList();
}

window.addHaPvEnergyExtra = addHaPvEnergyExtra;
window.updateHaPvEnergyExtraField = updateHaPvEnergyExtraField;
window.removeHaPvEnergyExtra = removeHaPvEnergyExtra;

function readHaModalIntoState() {
    const rawMode = document.getElementById('ha_cfg_mode')?.value || 'poll';
    haConfigState.mode = rawMode === 'demo' ? 'poll' : rawMode;
    haConfigState.baseUrl = (document.getElementById('ha_cfg_url')?.value || 'https://home.mb10.org').trim();
    haConfigState.accessToken = (document.getElementById('ha_cfg_token')?.value || '').trim();
    haConfigState.pollIntervalSec = Math.max(3, parseInt(document.getElementById('ha_cfg_interval')?.value) || 10);
    haConfigState.batteryName = (document.getElementById('ha_cfg_bat_name')?.value || 'BYD HVS+').trim();

    haConfigState.entities = {
        ...haConfigState.entities,
        pvPower: (document.getElementById('ha_ent_pv_power')?.value || '').trim(),
        loadPower: (document.getElementById('ha_ent_load_power')?.value || '').trim(),
        gridPower: (document.getElementById('ha_ent_grid_power')?.value || '').trim(),
        batteryChargePower: (document.getElementById('ha_ent_bat_chg_power')?.value || '').trim(),
        batteryDischargePower: (document.getElementById('ha_ent_bat_dis_power')?.value || '').trim(),
        batteryPower: (document.getElementById('ha_ent_bat_power')?.value || '').trim(),
        batterySoc: (document.getElementById('ha_ent_bat_soc')?.value || '').trim(),
        pvEnergyToday: (document.getElementById('ha_ent_pv_today')?.value || '').trim(),
        pvEnergyMonth: (document.getElementById('ha_ent_pv_month')?.value || '').trim(),
        gridImportMonth: (document.getElementById('ha_ent_grid_imp_month')?.value || '').trim(),
        gridExportMonth: (document.getElementById('ha_ent_grid_exp_month')?.value || '').trim(),
        batteryChargeMonth: (document.getElementById('ha_ent_bat_chg_month')?.value || '').trim(),
        batteryDischargeMonth: (document.getElementById('ha_ent_bat_dis_month')?.value || '').trim()
    };

    if (Array.isArray(haConfigState.pvEnergyExtraEntities)) {
        haConfigState.pvEnergyExtraEntities = haConfigState.pvEnergyExtraEntities.map((val, idx) => {
            const inp = document.getElementById(`ha_ent_pv_extra_${idx}`);
            return inp ? inp.value.trim() : String(val || '').trim();
        });
    }
}

// ============================================================================
// 8. KOMFORT-SENSOR-PICKER: GERÄTE- & HELFER-GRUPPIERUNG + ECHTZEIT-SUCHE
// ============================================================================

let haPickerState = {
    targetInputId: null,
    customType: null, // 'stringPower' | 'stringEnergy' | 'consumerPower' | 'pvEnergyExtra'
    index: null,
    title: 'Sensor auswählen',
    category: 'all', // 'all' | 'device' | 'helper'
    unitFilter: 'all', // 'power' | 'energy' | 'soc' | 'all'
    selectedGroup: '__ALL__',
    searchQuery: '',
    isLoading: false
};

async function fetchHaTemplateDeviceMapInBrowser(rawBaseUrl, rawToken) {
    const cleanUrl = normalizeHaUrlClient(rawBaseUrl);
    const cleanTok = cleanHaTokenClient(rawToken);
    if (!cleanUrl || !cleanTok) return {};

    // Query Home Assistant /api/template to resolve real Device Names & Area Names for entities
    const jinjaTemplate = [
        "{% set ns = namespace(items=[]) %}",
        "{% for s in states.sensor %}",
        "{% set dev = device_attr(s.entity_id, 'name_by_user') or device_attr(s.entity_id, 'name') or '' %}",
        "{% set area = area_name(s.entity_id) or '' %}",
        "{% if dev or area %}",
        "{% set ns.items = ns.items + [[s.entity_id, dev, area]] %}",
        "{% endif %}",
        "{% endfor %}",
        "{{ ns.items | to_json }}"
    ].join('');

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5500);
        const res = await fetch(`${cleanUrl}/api/template`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${cleanTok}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ template: jinjaTemplate }),
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) return {};
        const text = (await res.text() || '').trim();
        if (!text.startsWith('[')) return {};
        const arr = JSON.parse(text);
        const map = {};
        if (Array.isArray(arr)) {
            arr.forEach(row => {
                if (Array.isArray(row) && row[0]) {
                    map[row[0]] = { deviceName: row[1] || '', areaName: row[2] || '' };
                }
            });
        }
        return map;
    } catch (e) {
        return {};
    }
}

function classifyHaEntityGroup(rawEntityObj, tplDeviceMap) {
    const entityId = String(rawEntityObj.entity_id || '');
    const attrs = rawEntityObj.attributes || {};
    const friendlyName = String(attrs.friendly_name || entityId).trim();
    const tplInfo = tplDeviceMap?.[entityId] || {};
    const areaName = tplInfo.areaName || '';

    // 1. Check if entity is a Home Assistant Helper (Utility Meter, Riemann Integral, Group, Template, Input/Counter)
    if (entityId.startsWith('input_number.') || entityId.startsWith('counter.')) {
        return { category: 'helper', groupName: 'Helfer · Eingabe & Zähler', areaName };
    }
    if (attrs.cron || attrs.meter_period !== undefined || attrs.last_period !== undefined || attrs.tariff !== undefined) {
        return { category: 'helper', groupName: 'Helfer · Verbrauchszähler (Utility Meter)', areaName };
    }
    if (attrs.source && typeof attrs.source === 'string') {
        return { category: 'helper', groupName: 'Helfer · Riemann-Integral (W → kWh)', areaName };
    }
    if (Array.isArray(attrs.entities) && attrs.entities.length > 0) {
        return { category: 'helper', groupName: 'Helfer · Gruppen- & Summensensor', areaName };
    }
    if (!tplInfo.deviceName && /template|helfer|helper|integral|utility_meter|berechnet|summe_pv|pv_gesamt/i.test(`${entityId} ${friendlyName}`)) {
        return { category: 'helper', groupName: 'Helfer · Template & Berechnete Sensoren', areaName };
    }

    // 2. If Home Assistant resolved an explicit Device Name via /api/template, use it directly
    if (tplInfo.deviceName) {
        return { category: 'device', groupName: tplInfo.deviceName, areaName };
    }

    // 3. Smart prefix extraction from friendly_name or entity_id
    const cleanedFriendly = friendlyName
        .replace(/\s+(Leistung|Power|Active Power|Energy|Energie|Tagesertrag|Gesamtertrag|Spannung|Voltage|Strom|Current|State of Charge|Ladezustand|SoC|Status|Temperature|Temperatur|Total|Today|Heute|Daily|Monthly).*$/i, '')
        .trim();

    if (cleanedFriendly && cleanedFriendly.length >= 2 && cleanedFriendly.length <= 36 && cleanedFriendly !== friendlyName) {
        return { category: 'device', groupName: cleanedFriendly, areaName };
    }

    const words = friendlyName.split(/[\s·\-_]+/).filter(Boolean);
    if (words.length >= 2) {
        return { category: 'device', groupName: words.slice(0, 2).join(' '), areaName };
    }

    const slugParts = entityId.replace(/^[a-z_]+\./, '').split('_').filter(Boolean);
    const fallbackGroup = slugParts.length > 0
        ? slugParts[0].charAt(0).toUpperCase() + slugParts[0].slice(1)
        : 'Sonstige Sensoren';
    return { category: 'device', groupName: fallbackGroup, areaName };
}

function buildEnrichedSensorList(statesArray, tplDeviceMap = {}) {
    return statesArray
        .filter(s => {
            if (!s || typeof s.entity_id !== 'string') return false;
            return (
                s.entity_id.startsWith('sensor.') ||
                s.entity_id.startsWith('number.') ||
                s.entity_id.startsWith('input_number.') ||
                s.entity_id.startsWith('counter.')
            );
        })
        .map(s => {
            const unit = String(s.attributes?.unit_of_measurement || '').trim();
            const unitLower = unit.toLowerCase();
            const devClass = String(s.attributes?.device_class || '').toLowerCase();
            const groupInfo = classifyHaEntityGroup(s, tplDeviceMap);

            let unitCategory = 'other';
            if (unitLower === 'w' || unitLower === 'kw' || unitLower === 'mw' || unitLower === 'va' || devClass === 'power') {
                unitCategory = 'power';
            } else if (unitLower === 'kwh' || unitLower === 'wh' || unitLower === 'mwh' || devClass === 'energy') {
                unitCategory = 'energy';
            } else if (unitLower === '%' || devClass === 'battery') {
                unitCategory = 'soc';
            }

            return {
                entity_id: s.entity_id,
                name: s.attributes?.friendly_name || s.entity_id,
                state: s.state,
                unit,
                unitCategory,
                category: groupInfo.category, // 'device' | 'helper'
                groupName: groupInfo.groupName,
                areaName: groupInfo.areaName || ''
            };
        })
        .sort((a, b) => {
            const gCmp = a.groupName.localeCompare(b.groupName, 'de');
            if (gCmp !== 0) return gCmp;
            return a.name.localeCompare(b.name, 'de');
        });
}

function updateHaEntitiesDatalistElement() {
    const dl = document.getElementById('haEntitiesDatalist');
    if (dl) {
        dl.innerHTML = discoveredHaSensors.map(s =>
            `<option value="${s.entity_id}">${s.groupName ? `[${s.groupName}] ` : ''}${s.name} (${s.state} ${s.unit})</option>`
        ).join('');
    }
}

async function testHaConnectionAndLoadSensors() {
    readHaModalIntoState();
    const statusBox = document.getElementById('haTestFeedbackBox');
    if (statusBox) {
        statusBox.classList.remove('hidden');
        statusBox.className = "p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-medium";
        statusBox.innerHTML = `<div class="flex items-center gap-2"><span class="material-symbols-rounded text-base animate-spin text-teal-500">progress_activity</span><span>Verbinde mit Home Assistant &amp; lade Geräte, Helfer und Sensoren (${typeof escapeHtml === 'function' ? escapeHtml(normalizeHaUrlClient(haConfigState.baseUrl)) : normalizeHaUrlClient(haConfigState.baseUrl)})...</span></div>`;
    }

    // 1. Primary path: Direct Browser Fetch (essential for GitHub Pages & static web hosts)
    const directRes = await fetchHaDirectFromBrowser(haConfigState.baseUrl, haConfigState.accessToken, '/api/states');

    if (directRes.usedBaseUrl) {
        haConfigState.baseUrl = directRes.usedBaseUrl;
        setElVal('ha_cfg_url', directRes.usedBaseUrl);
    }

    if (directRes.ok && Array.isArray(directRes.data)) {
        const tplDeviceMap = await fetchHaTemplateDeviceMapInBrowser(haConfigState.baseUrl, haConfigState.accessToken);
        discoveredHaSensors = buildEnrichedSensorList(directRes.data, tplDeviceMap);
        updateHaEntitiesDatalistElement();

        haConfigState.mode = 'poll';
        setElVal('ha_cfg_mode', 'poll');
        localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));

        const deviceGroupsCount = new Set(discoveredHaSensors.filter(s => s.category === 'device').map(s => s.groupName)).size;
        const helperCount = discoveredHaSensors.filter(s => s.category === 'helper').length;

        if (statusBox) {
            statusBox.className = "p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200";
            statusBox.innerHTML = `
                <div class="font-extrabold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <span class="material-symbols-rounded text-base">check_circle</span>
                    <span>Verbunden! ${discoveredHaSensors.length} Sensoren (${deviceGroupsCount} Geräte &amp; ${helperCount} Helfer/Zähler) geladen.</span>
                </div>
                <p class="mt-1 text-[11px]">Du kannst jetzt bei jedem Feld bequem auf <strong>„Wählen“</strong> tippen, um Gerät/Helfer und Entität auszuwählen.</p>
            `;
        }
        return true;
    }

    // 2. Secondary path: Try backend proxy /api/ha/test ONLY if running on a Node.js server
    const backendRes = await safeFetchBackendJson('/api/ha/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            baseUrl: haConfigState.baseUrl,
            accessToken: haConfigState.accessToken
        })
    });

    if (backendRes.ok && backendRes.data && backendRes.data.success) {
        const data = backendRes.data;
        if (data.normalizedBaseUrl) {
            haConfigState.baseUrl = data.normalizedBaseUrl;
            setElVal('ha_cfg_url', data.normalizedBaseUrl);
        }
        discoveredHaSensors = (data.sensors || []).map(s => {
            const fakeRaw = { entity_id: s.entity_id, state: s.state, attributes: { friendly_name: s.name, unit_of_measurement: s.unit } };
            return buildEnrichedSensorList([fakeRaw], {})[0];
        }).filter(Boolean);
        updateHaEntitiesDatalistElement();

        haConfigState.mode = 'poll';
        setElVal('ha_cfg_mode', 'poll');
        localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));

        if (statusBox) {
            statusBox.className = "p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200";
            statusBox.innerHTML = `
                <div class="font-extrabold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <span class="material-symbols-rounded text-base">check_circle</span>
                    <span>Verbindung über Server-Proxy erfolgreich! (${discoveredHaSensors.length} Sensoren geladen)</span>
                </div>
            `;
        }
        return true;
    }

    // 3. Detailed, accurate error reporting
    const allDiagnostics = [
        ...(directRes.diagnostics || []),
        ...((!backendRes.isHtml && Array.isArray(backendRes.data?.diagnostics)) ? backendRes.data.diagnostics : [])
    ];
    const diagHtml = allDiagnostics.length > 0
        ? `<div class="mt-2.5 pt-2 border-t border-rose-500/20 space-y-1 font-mono text-[11px] opacity-95">${allDiagnostics.map(d => `<div>• ${typeof escapeHtml === 'function' ? escapeHtml(d) : d}</div>`).join('')}</div>`
        : '';

    const primaryErr = directRes.error || backendRes.data?.error || 'Verbindung fehlgeschlagen.';
    const safeErr = typeof escapeHtml === 'function' ? escapeHtml(primaryErr) : primaryErr;
    const currentOrigin = window.location.origin;

    if (statusBox) {
        statusBox.className = "p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-800 dark:text-rose-200";
        statusBox.innerHTML = `
            <div class="font-extrabold flex items-start gap-1.5 text-rose-600 dark:text-rose-300">
                <span class="material-symbols-rounded text-base shrink-0">error</span>
                <span>${safeErr}</span>
            </div>
            ${diagHtml}
            <div class="mt-3 p-2.5 rounded-lg bg-slate-900 text-teal-300 font-mono text-[11px]">
                <div class="text-slate-400 font-sans font-bold mb-1">Erforderlicher Eintrag in deiner Home Assistant configuration.yaml für diese Domain:</div>
                <div>http:</div>
                <div>&nbsp;&nbsp;cors_allowed_origins:</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;- "${currentOrigin}"</div>
            </div>
            <div class="mt-3 pt-2.5 border-t border-rose-500/20 flex flex-wrap items-center justify-between gap-2">
                <span class="text-[11px] text-rose-700 dark:text-rose-300 font-semibold">Wichtig: Home Assistant akzeptiert bei cors_allowed_origins kein "*", sondern braucht exakt "${currentOrigin}"!</span>
                <button type="button" onclick="switchHaModalTab('guide')" class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold transition-colors cursor-pointer">
                    Komplette YAML-Vorlage kopieren →
                </button>
            </div>
        `;
    }
    return false;
}

async function openHaEntityPicker(options = {}) {
    readHaModalIntoState();
    haPickerState = {
        targetInputId: options.targetInputId || null,
        customType: options.customType || null,
        index: options.index !== undefined ? options.index : null,
        title: options.title || 'Sensor auswählen',
        category: 'all',
        unitFilter: options.unitFilter || 'all',
        selectedGroup: '__ALL__',
        searchQuery: '',
        isLoading: false
    };

    const modal = document.getElementById('modal-ha-entity-picker');
    if (!modal) return;

    setElText('haPickerModalTitle', `Sensor wählen: ${haPickerState.title}`);
    const searchInp = document.getElementById('haPickerSearchInput');
    if (searchInp) searchInp.value = '';
    const clearBtn = document.getElementById('haPickerClearSearchBtn');
    if (clearBtn) clearBtn.classList.add('hidden');

    modal.classList.remove('hidden');
    updateHaPickerFilterButtonsUI();

    if (discoveredHaSensors.length === 0) {
        await reloadHaPickerSensors();
    } else {
        renderHaEntityPickerUI();
    }
}

function closeHaEntityPicker() {
    const modal = document.getElementById('modal-ha-entity-picker');
    if (modal) modal.classList.add('hidden');
}

async function reloadHaPickerSensors() {
    readHaModalIntoState();
    haPickerState.isLoading = true;
    renderHaEntityPickerUI();

    const directRes = await fetchHaDirectFromBrowser(haConfigState.baseUrl, haConfigState.accessToken, '/api/states');
    if (directRes.ok && Array.isArray(directRes.data)) {
        if (directRes.usedBaseUrl) {
            haConfigState.baseUrl = directRes.usedBaseUrl;
            setElVal('ha_cfg_url', directRes.usedBaseUrl);
        }
        const tplDeviceMap = await fetchHaTemplateDeviceMapInBrowser(haConfigState.baseUrl, haConfigState.accessToken);
        discoveredHaSensors = buildEnrichedSensorList(directRes.data, tplDeviceMap);
        updateHaEntitiesDatalistElement();
    }
    haPickerState.isLoading = false;
    renderHaEntityPickerUI();
}

function setHaPickerCategory(cat) {
    haPickerState.category = cat || 'all';
    haPickerState.selectedGroup = '__ALL__';
    updateHaPickerFilterButtonsUI();
    renderHaEntityPickerUI();
}

function setHaPickerUnitFilter(unitFilter) {
    haPickerState.unitFilter = unitFilter || 'all';
    updateHaPickerFilterButtonsUI();
    renderHaEntityPickerUI();
}

function selectHaPickerGroup(groupKey) {
    haPickerState.selectedGroup = groupKey || '__ALL__';
    renderHaEntityPickerUI();
}

function onHaPickerSearchInput(val) {
    haPickerState.searchQuery = String(val || '').trim();
    const inp = document.getElementById('haPickerSearchInput');
    if (inp && inp.value !== haPickerState.searchQuery && val === '') {
        inp.value = '';
    }
    const clearBtn = document.getElementById('haPickerClearSearchBtn');
    if (clearBtn) {
        if (haPickerState.searchQuery.length > 0) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }
    renderHaEntityPickerUI();
}

function updateHaPickerFilterButtonsUI() {
    ['all', 'device', 'helper'].forEach(cat => {
        const btn = document.getElementById(`haPickerCat_${cat}`);
        if (!btn) return;
        if (haPickerState.category === cat) {
            btn.className = "px-2.5 py-1 rounded-lg bg-teal-600 text-white transition-all cursor-pointer";
        } else {
            btn.className = "px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-white/10 transition-all cursor-pointer";
        }
    });

    ['power', 'energy', 'soc', 'all'].forEach(u => {
        const btn = document.getElementById(`haPickerUnit_${u}`);
        if (!btn) return;
        if (haPickerState.unitFilter === u) {
            btn.className = "px-2.5 py-1 rounded-lg bg-teal-500/20 border border-teal-500/50 text-teal-700 dark:text-teal-200 font-extrabold whitespace-nowrap cursor-pointer";
        } else {
            btn.className = "px-2.5 py-1 rounded-lg border border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300 font-semibold whitespace-nowrap cursor-pointer hover:border-teal-500/40";
        }
    });
}

function getFilteredPickerSensors(ignoreGroupSelection = false) {
    const q = haPickerState.searchQuery.toLowerCase();
    return discoveredHaSensors.filter(s => {
        if (haPickerState.category !== 'all' && s.category !== haPickerState.category) return false;
        if (haPickerState.unitFilter !== 'all' && s.unitCategory !== haPickerState.unitFilter) return false;
        if (!ignoreGroupSelection && haPickerState.selectedGroup !== '__ALL__' && s.groupName !== haPickerState.selectedGroup) {
            return false;
        }
        if (q) {
            const hay = `${s.name} ${s.entity_id} ${s.groupName} ${s.areaName} ${s.unit}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

function renderHaEntityPickerUI() {
    const groupsEl = document.getElementById('haPickerGroupsList');
    const entitiesEl = document.getElementById('haPickerEntitiesList');
    if (!groupsEl || !entitiesEl) return;

    if (haPickerState.isLoading) {
        groupsEl.innerHTML = `<div class="p-4 text-xs text-slate-400 flex items-center gap-2"><span class="material-symbols-rounded animate-spin text-teal-400">progress_activity</span><span>Lade Geräte &amp; Helfer...</span></div>`;
        entitiesEl.innerHTML = `<div class="p-6 text-xs text-slate-400 text-center">Sensoren werden von Home Assistant abgerufen...</div>`;
        return;
    }

    if (discoveredHaSensors.length === 0) {
        groupsEl.innerHTML = `<div class="p-3 text-xs text-slate-400">Keine Verbindung geladen.</div>`;
        entitiesEl.innerHTML = `
            <div class="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-white/15 text-center space-y-2.5">
                <span class="material-symbols-rounded text-3xl text-amber-400">wifi_off</span>
                <p class="text-xs font-bold text-slate-800 dark:text-white">Noch keine Sensoren aus Home Assistant geladen</p>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Prüfe URL &amp; Token im Konfigurator und tippe oben rechts auf „Neu laden“.</p>
                <button type="button" onclick="reloadHaPickerSensors()" class="px-3.5 py-1.5 rounded-xl bg-teal-600 text-white text-xs font-bold cursor-pointer">
                    Jetzt von Home Assistant laden
                </button>
            </div>`;
        return;
    }

    // 1. Build Groups (Devices & Helpers) matching Category + Unit + Search
    const baseFiltered = getFilteredPickerSensors(true);
    const groupMap = new Map();
    baseFiltered.forEach(s => {
        const key = s.groupName || 'Sonstige';
        if (!groupMap.has(key)) {
            groupMap.set(key, { name: key, category: s.category, count: 0 });
        }
        groupMap.get(key).count++;
    });

    const groupsArr = [...groupMap.values()].sort((a, b) => {
        if (a.category !== b.category) return a.category === 'device' ? -1 : 1;
        return a.name.localeCompare(b.name, 'de');
    });

    setElText('haPickerGroupCountBadge', `${groupsArr.length} Gruppen`);

    const isAllSelected = haPickerState.selectedGroup === '__ALL__';
    let groupsHtml = `
        <button type="button" onclick="selectHaPickerGroup('__ALL__')"
            class="w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                isAllSelected
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-white dark:bg-[#13242c] text-slate-700 dark:text-slate-200 hover:bg-teal-500/10 border border-slate-200/80 dark:border-white/10'
            }">
            <span class="flex items-center gap-2 truncate">
                <span class="material-symbols-rounded text-base">apps</span>
                <span class="truncate">Alle passenden Sensoren</span>
            </span>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded-md ${isAllSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'}">${baseFiltered.length}</span>
        </button>
    `;

    groupsHtml += groupsArr.map(g => {
        const isSel = haPickerState.selectedGroup === g.name;
        const safeGName = typeof escapeHtml === 'function' ? escapeHtml(g.name) : g.name;
        const iconName = g.category === 'helper' ? 'functions' : 'memory';
        const iconColor = isSel ? 'text-white' : (g.category === 'helper' ? 'text-amber-400' : 'text-teal-400');
        const safeJsArg = g.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        return `
        <button type="button" onclick="selectHaPickerGroup('${safeJsArg}')"
            class="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                isSel
                    ? 'bg-teal-600 text-white shadow-xs font-bold'
                    : 'bg-white dark:bg-[#13242c] text-slate-700 dark:text-slate-200 hover:bg-teal-500/10 border border-slate-200/80 dark:border-white/10'
            }">
            <span class="flex items-center gap-2 min-w-0">
                <span class="material-symbols-rounded text-base shrink-0 ${iconColor}">${iconName}</span>
                <span class="truncate">${safeGName}</span>
            </span>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${isSel ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'}">${g.count}</span>
        </button>`;
    }).join('');

    groupsEl.innerHTML = groupsHtml;

    // 2. Build Entities List for Step 2
    const matchingEntities = getFilteredPickerSensors(false);
    setElText('haPickerEntityCountBadge', `${matchingEntities.length} Sensoren`);
    setElText(
        'haPickerActiveGroupTitle',
        haPickerState.selectedGroup === '__ALL__'
            ? '2. Entität antippen zum Übernehmen'
            : `2. ${haPickerState.selectedGroup}`
    );

    if (matchingEntities.length === 0) {
        entitiesEl.innerHTML = `
            <div class="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-white/10 text-center space-y-2">
                <p class="text-xs font-bold text-slate-700 dark:text-slate-200">Keine Entitäten mit diesem Filter gefunden</p>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Tippe auf „Alle Einheiten“, um auch Sensoren ohne Standard-Einheit einzublenden.</p>
                <button type="button" onclick="setHaPickerUnitFilter('all'); setHaPickerCategory('all'); selectHaPickerGroup('__ALL__');" class="px-3 py-1.5 rounded-xl bg-teal-600/20 text-teal-700 dark:text-teal-300 text-xs font-bold cursor-pointer">
                    Alle Filter zurücksetzen
                </button>
            </div>`;
        return;
    }

    entitiesEl.innerHTML = matchingEntities.slice(0, 250).map(s => {
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(s.name) : s.name;
        const safeId = typeof escapeHtml === 'function' ? escapeHtml(s.entity_id) : s.entity_id;
        const safeGroup = typeof escapeHtml === 'function' ? escapeHtml(s.groupName) : s.groupName;
        const safeArea = typeof escapeHtml === 'function' ? escapeHtml(s.areaName) : s.areaName;
        const safeState = typeof escapeHtml === 'function' ? escapeHtml(`${s.state} ${s.unit}`.trim()) : `${s.state} ${s.unit}`.trim();
        const jsEntityId = s.entity_id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        const badgeType = s.category === 'helper'
            ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[9px] font-bold">Helfer</span>`
            : `<span class="px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-600 dark:text-teal-300 text-[9px] font-bold">${safeGroup}</span>`;

        const areaBadge = safeArea
            ? `<span class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-[9px] font-semibold">${safeArea}</span>`
            : '';

        return `
        <button type="button" onclick="pickHaEntityFromModal('${jsEntityId}')"
            class="w-full text-left p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#14252d] hover:bg-teal-500/10 dark:hover:bg-teal-500/15 border border-slate-200/90 dark:border-white/10 hover:border-teal-500/50 transition-all flex items-center justify-between gap-2.5 group cursor-pointer">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-300 truncate">${safeName}</span>
                    ${badgeType}
                    ${areaBadge}
                </div>
                <p class="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">${safeId}</p>
            </div>
            <div class="text-right shrink-0">
                <span class="inline-block px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#0b151a] border border-slate-200 dark:border-teal-500/30 text-xs font-black font-mono tabular-nums text-teal-700 dark:text-teal-300">
                    ${safeState || '—'}
                </span>
            </div>
        </button>`;
    }).join('');
}

function pickHaEntityFromModal(entityId) {
    const sensorObj = discoveredHaSensors.find(s => s.entity_id === entityId);
    const cleanFriendly = sensorObj
        ? String(sensorObj.name || '')
            .replace(/\s+(Leistung|Power|Active Power|Energy|Energie|Tagesertrag|Heute|Today|Total).*$/i, '')
            .trim()
        : '';

    if (haPickerState.targetInputId) {
        const inp = document.getElementById(haPickerState.targetInputId);
        if (inp) inp.value = entityId;
    } else if (haPickerState.customType === 'stringPower' && haPickerState.index !== null) {
        updateHaCustomStringField(haPickerState.index, 'powerEntity', entityId);
        const curName = haConfigState.customStrings?.[haPickerState.index]?.name || '';
        if (cleanFriendly && (!curName || /^PV-String \d+/i.test(curName))) {
            updateHaCustomStringField(haPickerState.index, 'name', `${cleanFriendly} · DC`);
        }
        renderHaCustomStringsEditor();
    } else if (haPickerState.customType === 'stringEnergy' && haPickerState.index !== null) {
        updateHaCustomStringField(haPickerState.index, 'energyEntity', entityId);
        renderHaCustomStringsEditor();
    } else if (haPickerState.customType === 'consumerPower' && haPickerState.index !== null) {
        updateHaCustomConsumerField(haPickerState.index, 'powerEntity', entityId);
        const curName = haConfigState.customConsumers?.[haPickerState.index]?.name || '';
        if (cleanFriendly && (!curName || /^Verbraucher \d+/i.test(curName))) {
            updateHaCustomConsumerField(haPickerState.index, 'name', cleanFriendly);
        }
        renderHaCustomConsumersEditor();
    } else if (haPickerState.customType === 'pvEnergyExtra' && haPickerState.index !== null) {
        updateHaPvEnergyExtraField(haPickerState.index, entityId);
        renderHaPvEnergyExtraList();
    }

    closeHaEntityPicker();
    if (typeof showToastNotification === 'function') {
        showToastNotification(`Sensor „${sensorObj ? sensorObj.name : entityId}“ übernommen!`, 'success');
    }
}

async function saveHaConfigFromModal() {
    readHaModalIntoState();
    localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
    energyCounterBaselines.lastHistorySyncMs = 0;

    try {
        await fetch('/api/ha/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: haConfigState })
        });
    } catch (e) {}

    closeHaConfigModal();
    startLiveTelemetryLoop();
    if (typeof showToastNotification === 'function') {
        showToastNotification('Dashboard-Sensoren & Home Assistant Konfiguration gespeichert!', 'success');
    }
}

function updateHaWebhookYamlSnippet() {
    const codeEl = document.getElementById('haWebhookYamlCode');
    if (!codeEl) return;
    const webhookUrl = `${window.location.origin}/api/ha/webhook`;
    const e = haConfigState.entities || {};
    codeEl.value = `# In Home Assistant configuration.yaml eintragen:
rest_command:
  pvpro_push_telemetry:
    url: "${webhookUrl}"
    method: POST
    content_type: "application/json"
    payload: >
      {
        "pvPowerW": "{{ states('${e.pvPower || 'sensor.pv_power_total'}') | float(0) }}",
        "loadPowerW": "{{ states('${e.loadPower || 'sensor.house_consumption_power'}') | float(0) }}",
        "gridPowerW": "{{ states('${e.gridPower || 'sensor.grid_power'}') | float(0) }}",
        "batteryPowerW": "{{ states('${e.batteryPower || 'sensor.battery_power'}') | float(0) }}",
        "batterySocPct": "{{ states('${e.batterySoc || 'sensor.battery_soc'}') | float(0) }}",
        "pvEnergyTodayKwh": "{{ states('${e.pvEnergyToday || 'sensor.pv_energy_today'}') | float(0) }}",
        "pvEnergyMonthKwh": "{{ states('${e.pvEnergyMonth || 'sensor.pv_energy_monthly'}') | float(0) }}"
      }`;
}

function copyHaWebhookYaml() {
    const codeEl = document.getElementById('haWebhookYamlCode');
    if (!codeEl) return;
    navigator.clipboard.writeText(codeEl.value).then(() => {
        if (typeof showToastNotification === 'function') {
            showToastNotification('Home Assistant YAML-Snippet in die Zwischenablage kopiert!', 'success');
        }
    });
}

function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function setElVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

// ============================================================================
// 8. TOKEN-SAFE PROJECT SYNC (GITHUB / CROSS-DEVICE WITHOUT EXPOSING TOKEN)
// ============================================================================

function getSanitizedHaConfigForProject() {
    const copy = JSON.parse(JSON.stringify(haConfigState || {}));
    // Security guarantee: Never export or persist the Long-Lived Access Token in shared/GitHub project files!
    copy.accessToken = '';
    return copy;
}

function applySanitizedHaConfigFromProject(sanitizedCfg) {
    if (!sanitizedCfg || typeof sanitizedCfg !== 'object') return;
    const existingLocalToken = haConfigState.accessToken || '';
    haConfigState = {
        ...haConfigState,
        mode: sanitizedCfg.mode || haConfigState.mode || 'poll',
        baseUrl: sanitizedCfg.baseUrl || haConfigState.baseUrl,
        accessToken: existingLocalToken, // Keep only the local device's own token!
        pollIntervalSec: sanitizedCfg.pollIntervalSec || haConfigState.pollIntervalSec || 10,
        autoSyncMonthly: sanitizedCfg.autoSyncMonthly !== undefined ? sanitizedCfg.autoSyncMonthly : true,
        batteryName: sanitizedCfg.batteryName || haConfigState.batteryName || 'BYD HVS+',
        entities: { ...haConfigState.entities, ...(sanitizedCfg.entities || {}) },
        pvEnergyExtraEntities: Array.isArray(sanitizedCfg.pvEnergyExtraEntities)
            ? JSON.parse(JSON.stringify(sanitizedCfg.pvEnergyExtraEntities))
            : (haConfigState.pvEnergyExtraEntities || []),
        customStrings: Array.isArray(sanitizedCfg.customStrings) && sanitizedCfg.customStrings.length > 0
            ? JSON.parse(JSON.stringify(sanitizedCfg.customStrings))
            : haConfigState.customStrings,
        customConsumers: Array.isArray(sanitizedCfg.customConsumers)
            ? JSON.parse(JSON.stringify(sanitizedCfg.customConsumers))
            : haConfigState.customConsumers,
        stringEntities: { ...haConfigState.stringEntities, ...(sanitizedCfg.stringEntities || {}) },
        inverterEntities: { ...haConfigState.inverterEntities, ...(sanitizedCfg.inverterEntities || {}) },
        loadedFromSharedProject: true
    };
    try {
        localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
    } catch (e) {}
    energyCounterBaselines.lastHistorySyncMs = 0;
    refreshIntradayHistoryAndLive();
}

function getPerformanceRecordsForProject() {
    return JSON.parse(JSON.stringify(performanceRecordsByProject || {}));
}

function applyPerformanceRecordsFromProject(records) {
    if (!records || typeof records !== 'object') return;
    performanceRecordsByProject = { ...performanceRecordsByProject, ...records };
    try {
        localStorage.setItem('pvpro_performance_records', JSON.stringify(performanceRecordsByProject));
    } catch (e) {}
}

window.toggleShowAllDashboardConsumers = toggleShowAllDashboardConsumers;
window.getSanitizedHaConfigForProject = getSanitizedHaConfigForProject;
window.applySanitizedHaConfigFromProject = applySanitizedHaConfigFromProject;
window.getPerformanceRecordsForProject = getPerformanceRecordsForProject;
window.applyPerformanceRecordsFromProject = applyPerformanceRecordsFromProject;

// Auto-initialize once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initTelemetryAndAnalysis();
    }, 120);
});
