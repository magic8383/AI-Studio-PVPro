// ============================================================================
// TELEMETRY, LIVE DASHBOARD, SANKEY ENERGY FLOW & PERFORMANCE ENGINE (V9.9)
// Zentrale Single Source of Truth (Live-Watt + kWh-Zähler), HA Long-Term
// Statistics WebSocket-Sync & 100% vollbreites Sankey ohne Scrollen
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
        loadEnergyMonth: '',
        gridImportMonth: 'sensor.grid_import_monthly',
        gridExportMonth: 'sensor.grid_export_monthly',
        batteryChargeMonth: 'sensor.battery_charge_monthly',
        batteryDischargeMonth: 'sensor.battery_discharge_monthly'
    },
    pvEnergyExtraEntities: [],
    customStrings: JSON.parse(JSON.stringify(DEFAULT_CUSTOM_STRINGS)),
    customConsumers: JSON.parse(JSON.stringify(DEFAULT_CUSTOM_CONSUMERS))
};

let discoveredHaSensors = [];
let lastKnownHaUnitMap = new Map(); // entity_id -> unit_of_measurement (populated from /api/states)
let lastKnownHaStateClassMap = new Map(); // entity_id -> state_class
let liveTelemetryTimer = null;
let intradayHistoryTimer = null;

// Baseline cache for computing Today & Month deltas from total_increasing kWh counters without HA helpers
let energyCounterBaselines = {
    schemaVersion: '9.9',
    dayKey: '',
    monthKey: '',
    dayStartByEntity: {},
    monthStartByEntity: {},
    lastHistorySyncMs: 0,
    lastLongTermSyncMs: 0
};

let currentLiveTelemetry = {
    updatedAt: null,
    pvPowerW: 0,
    loadPowerW: 0,
    gridPowerW: 0, // >0 import from grid, <0 export to grid
    batteryPowerW: 0, // >0 charging, <0 discharging
    batterySocPct: null,
    pvEnergyTodayKwh: 0,
    loadEnergyTodayKwh: null,
    gridImportTodayKwh: null,
    gridExportTodayKwh: null,
    batteryChargeTodayKwh: null,
    batteryDischargeTodayKwh: null,
    pvEnergyMonthKwh: 0,
    loadEnergyMonthKwh: null,
    gridImportMonthKwh: 0,
    gridExportMonthKwh: 0,
    batteryChargeMonthKwh: 0,
    batteryDischargeMonthKwh: 0,
    stringTelemetry: {},
    customStringsTelemetry: [],
    consumersTelemetry: [],
    unavailableConsumersCount: 0,
    connectionOk: false,
    lastError: 'Bitte Token & Sensoren unter „HA & Sensoren“ wählen.'
};

// Intraday chart state & active curve toggles
let chartIntraday = null;
let chartIntradayFullscreen = null;
let isIntradayFsRotated = false;
let isIntradayChartExpanded = false; // In-Place Full-Bleed mode (edge-to-edge, no left/right scales)
let activeCrosshairIndex = null;
let intradayPointerStart = null;
let intradayHistoryCache = { day: null, week: null, month: null };
let intradayFetchAbortController = null;
let hasPrewarmedHistoryTimeframes = false;
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
let currentCurveTimeframe = 'day'; // 'day' | 'week' | 'month'
let selectedSankeyFlow = null; // null | 'pv_direct' | 'pv_bat' | 'pv_exp' | 'bat_house' | 'grid_house'

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
    // Load active curve selection & inline expand preference from localStorage
    try {
        const savedCurves = localStorage.getItem('pvpro_active_curves');
        if (savedCurves) {
            const parsedC = JSON.parse(savedCurves);
            if (Array.isArray(parsedC) && parsedC.length > 0) {
                activeCurveKeys = new Set(parsedC);
            }
        }
        const savedExpand = localStorage.getItem('pvpro_intraday_expanded');
        if (savedExpand === '1') {
            isIntradayChartExpanded = true;
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
                customConsumers: Array.isArray(parsed.customConsumers) ? parsed.customConsumers : haConfigState.customConsumers
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
                customConsumers: Array.isArray(haRes.data.config.customConsumers) ? haRes.data.config.customConsumers : haConfigState.customConsumers
            };
            localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
        }

        if (recRes.ok && recRes.data && recRes.data.success && recRes.data.records && Object.keys(recRes.data.records).length > 0) {
            performanceRecordsByProject = { ...performanceRecordsByProject, ...recRes.data.records };
            localStorage.setItem('pvpro_performance_records', JSON.stringify(performanceRecordsByProject));
        }
    } catch (e) {}

    // 2B. Fallback to GitHub-persisted CodePersistedPlans (database.js) if local/server records are empty
    try {
        if (typeof CodePersistedPlans !== 'undefined' && Array.isArray(CodePersistedPlans) && CodePersistedPlans.length > 0) {
            const latestPlan = CodePersistedPlans[0]?.data;
            if (latestPlan) {
                if (latestPlan.performanceRecords && typeof latestPlan.performanceRecords === 'object') {
                    Object.keys(latestPlan.performanceRecords).forEach(projKey => {
                        if (!performanceRecordsByProject[projKey]) {
                            performanceRecordsByProject[projKey] = latestPlan.performanceRecords[projKey];
                        }
                    });
                    localStorage.setItem('pvpro_performance_records', JSON.stringify(performanceRecordsByProject));
                }
                if (latestPlan.energyBaselines && typeof latestPlan.energyBaselines === 'object') {
                    applyEnergyBaselinesFromProject(latestPlan.energyBaselines);
                }
            }
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
    const existingYearRec = performanceRecordsByProject[projId][String(year)];
    if (!existingYearRec || !Array.isArray(existingYearRec.months) || existingYearRec.isSampleSeed) {
        performanceRecordsByProject[projId][String(year)] = {
            months: createEmptyYearMonths(),
            updatedAt: new Date().toISOString(),
            isSampleSeed: false
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

    // Zentrale Hardware- & Verbrauchs-Zusammenfassung aus app.js (Single Source of Truth)
    const sysSummary = typeof getSystemHardwareAndConsSummary === 'function'
        ? getSystemHardwareAndConsSummary()
        : null;

    const totalBatteryKwh = sysSummary ? sysSummary.batteryKwh : 0;
    const totalBatteryPowerW = sysSummary ? sysSummary.batteryPowerW : 0;
    const detectedBatteryName = haConfigState.batteryName || (sysSummary && sysSummary.batteryName !== 'Ohne Akku' ? sysSummary.batteryName : 'BYD HVS+');
    const gridPriceEur = sysSummary ? sysSummary.gridPriceEur : (parseFloat(document.getElementById('fin_grid_price')?.value) || 0.32);
    const sysCostEur = sysSummary ? sysSummary.sysCostEur : (parseFloat(document.getElementById('fin_sys_cost')?.value) || 15000);
    const eegRateCt = sysSummary ? sysSummary.eegRateCt : (typeof updateEEGPreview === 'function' ? updateEEGPreview() : 7.8);
    const eegRateEur = sysSummary ? sysSummary.eegRateEur : (eegRateCt / 100);
    const plannedConsKwh = sysSummary ? sysSummary.plannedConsKwh : 4500;
    const finalTotalKwp = sysSummary && sysSummary.kwp > 0 ? sysSummary.kwp : totalKwp;

    const totalSollYearKwh = monthlySollTotal.reduce((a, b) => a + b, 0);

    return {
        totalKwp: Math.max(0.1, finalTotalKwp),
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

function healMonthBaselinesAgainstDayBaselines() {
    if (!energyCounterBaselines || !energyCounterBaselines.dayStartByEntity) return;
    if (!energyCounterBaselines.monthStartByEntity) energyCounterBaselines.monthStartByEntity = {};
    Object.keys(energyCounterBaselines.dayStartByEntity).forEach(entId => {
        const dVal = energyCounterBaselines.dayStartByEntity[entId];
        const mVal = energyCounterBaselines.monthStartByEntity[entId];
        if (dVal !== undefined && dVal !== null && !isNaN(dVal)) {
            // Mathematical invariant for cumulative counters: start of month <= start of today
            if (mVal === undefined || mVal === null || isNaN(mVal) || mVal > dVal) {
                energyCounterBaselines.monthStartByEntity[entId] = dVal;
            }
        }
    });
}

function loadEnergyCounterBaselines() {
    const keys = getTodayAndMonthKeys();
    try {
        const raw = localStorage.getItem('pvpro_energy_counter_baselines');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && (parsed.schemaVersion === '9.9' || parsed.schemaVersion === '9.7' || parsed.schemaVersion === '9.1')) {
                energyCounterBaselines = {
                    schemaVersion: '9.9',
                    dayKey: keys.dayKey,
                    monthKey: keys.monthKey,
                    dayStartByEntity: parsed.dayKey === keys.dayKey ? (parsed.dayStartByEntity || {}) : {},
                    monthStartByEntity: parsed.monthKey === keys.monthKey ? (parsed.monthStartByEntity || {}) : {},
                    lastHistorySyncMs: parsed.dayKey === keys.dayKey ? (parsed.lastHistorySyncMs || 0) : 0,
                    lastLongTermSyncMs: parsed.monthKey === keys.monthKey ? (parsed.lastLongTermSyncMs || 0) : 0
                };
                healMonthBaselinesAgainstDayBaselines();
                saveEnergyCounterBaselines();
                return;
            }
        }
    } catch (e) {}
    energyCounterBaselines = {
        schemaVersion: '9.9',
        dayKey: keys.dayKey,
        monthKey: keys.monthKey,
        dayStartByEntity: {},
        monthStartByEntity: {},
        lastHistorySyncMs: 0,
        lastLongTermSyncMs: 0
    };
    saveEnergyCounterBaselines();
}

function saveEnergyCounterBaselines() {
    try {
        energyCounterBaselines.schemaVersion = '9.9';
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

    const { isCumulative = false, maxPlausibleKwh = null, upperBoundMap = null } = options;
    let baseVal = baselineMap?.[cleanId];

    // If an upperBoundMap (e.g. dayStartByEntity for monthStartByEntity) exists, month baseline can never exceed day baseline
    const upperBoundVal = upperBoundMap?.[cleanId];
    if (upperBoundVal !== undefined && upperBoundVal !== null && !isNaN(upperBoundVal)) {
        if (baseVal === undefined || baseVal === null || isNaN(baseVal) || baseVal > upperBoundVal) {
            baseVal = upperBoundVal;
            baselineMap[cleanId] = baseVal;
            saveEnergyCounterBaselines();
        }
    }

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
        e.loadEnergyMonth,
        e.gridImportMonth,
        e.gridExportMonth,
        e.batteryChargeMonth,
        e.batteryDischargeMonth,
        ...(cfg.customStrings || []).map(cs => cs?.energyEntity)
    ].map(x => String(x || '').trim()).filter(Boolean);

    const uniqueEntities = [...new Set(counterEntities)];
    if (uniqueEntities.length === 0) return;

    healMonthBaselinesAgainstDayBaselines();

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
        let minPositiveVal = null;
        let firstValidVal = null;

        for (let i = 0; i < entityHistoryArr.length; i++) {
            const pt = entityHistoryArr[i];
            const rawNum = parseFloat(String(pt.state).replace(',', '.'));
            if (isNaN(rawNum) || rawNum < 0) continue;
            const val = rawNum * scale;
            if (firstValidVal === null) firstValidVal = val;
            if (val > 0 && (minPositiveVal === null || val < minPositiveVal)) minPositiveVal = val;
            const ts = new Date(pt.last_changed || pt.last_updated || periodStartMs).getTime();
            if (ts <= windowEndMs) {
                if (minEarlyVal === null || val < minEarlyVal) minEarlyVal = val;
            }
        }
        if (minEarlyVal !== null && minEarlyVal > 0) return minEarlyVal;
        if (minPositiveVal !== null) return minPositiveVal;
        return firstValidVal;
    };

    try {
        const filterParam = encodeURIComponent(uniqueEntities.join(','));
        const nowIso = new Date().toISOString();

        // Query up to nowIso for monthHistRes as well so if HA recorder purged data older than 10 days,
        // we still receive the earliest available counter state in the current month instead of an empty array []!
        const [dayHistRes, monthHistRes] = await Promise.all([
            fetchHaDirectFromBrowser(
                cfg.baseUrl,
                cfg.accessToken,
                `/api/history/period/${encodeURIComponent(keys.startOfDayIso)}?end_time=${encodeURIComponent(nowIso)}&filter_entity_id=${filterParam}&minimal_response&no_attributes`
            ),
            fetchHaDirectFromBrowser(
                cfg.baseUrl,
                cfg.accessToken,
                `/api/history/period/${encodeURIComponent(keys.startOfMonthIso)}?end_time=${encodeURIComponent(nowIso)}&filter_entity_id=${filterParam}&minimal_response&no_attributes`
            )
        ]);

        const dayStartMs = new Date(keys.startOfDayIso).getTime();
        if (dayHistRes.ok && Array.isArray(dayHistRes.data)) {
            dayHistRes.data.forEach(arr => {
                const entId = arr?.[0]?.entity_id;
                const val = extractPeriodStartReading(arr, dayStartMs);
                if (entId && val !== null) {
                    const existing = energyCounterBaselines.dayStartByEntity[entId];
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

        // Enforce monthStart <= dayStart for every counter entity
        healMonthBaselinesAgainstDayBaselines();
        energyCounterBaselines.lastHistorySyncMs = Date.now();
        saveEnergyCounterBaselines();

        // Also sync Home Assistant Long-Term Statistics (recorder/statistics_during_period) via WebSocket
        // so 1st-of-month baselines and all past months of the year are exact even after >10 days offline!
        if (Date.now() - (energyCounterBaselines.lastLongTermSyncMs || 0) > 15 * 60 * 1000) {
            syncLongTermStatisticsFromHa(cfg, statesMap, false);
        }
    } catch (err) {}
}

function fetchHaLongTermStatisticsWs(rawBaseUrl, rawToken, statisticIds, startTimeIso, endTimeIso, period = 'month') {
    return new Promise((resolve) => {
        const cleanUrl = normalizeHaUrlClient(rawBaseUrl);
        const cleanTok = cleanHaTokenClient(rawToken);
        if (!cleanUrl || !cleanTok || !Array.isArray(statisticIds) || statisticIds.length === 0) {
            resolve({ ok: false, error: 'URL, Token oder Zähler-Sensoren fehlen.' });
            return;
        }

        const wsBase = cleanUrl.replace(/^http/i, 'ws');
        const wsUrl = `${wsBase}/api/websocket`;
        let settled = false;
        let ws = null;

        const finish = (resultObj) => {
            if (settled) return;
            settled = true;
            try {
                if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                    ws.close();
                }
            } catch (e) {}
            resolve(resultObj);
        };

        const timeoutId = setTimeout(() => {
            finish({ ok: false, error: 'WebSocket Timeout bei Abruf der HA Langzeit-Statistiken.' });
        }, 9000);

        try {
            ws = new WebSocket(wsUrl);
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'auth_required') {
                        ws.send(JSON.stringify({
                            type: 'auth',
                            access_token: cleanTok
                        }));
                    } else if (msg.type === 'auth_invalid') {
                        clearTimeout(timeoutId);
                        finish({ ok: false, error: 'Home Assistant Token für WebSocket abgelehnt.' });
                    } else if (msg.type === 'auth_ok') {
                        ws.send(JSON.stringify({
                            id: 101,
                            type: 'recorder/statistics_during_period',
                            start_time: startTimeIso,
                            end_time: endTimeIso,
                            statistic_ids: statisticIds,
                            period: period,
                            types: ['change', 'state', 'sum']
                        }));
                    } else if (msg.type === 'result' && msg.id === 101) {
                        clearTimeout(timeoutId);
                        if (msg.success && msg.result && typeof msg.result === 'object') {
                            finish({ ok: true, data: msg.result });
                        } else {
                            finish({ ok: false, error: msg.error?.message || 'Keine Langzeit-Statistiken verfügbar.' });
                        }
                    }
                } catch (parseErr) {}
            };
            ws.onerror = () => {
                clearTimeout(timeoutId);
                finish({ ok: false, error: 'WebSocket-Verbindung zu Home Assistant fehlgeschlagen.' });
            };
            ws.onclose = () => {
                clearTimeout(timeoutId);
                finish({ ok: false, error: 'WebSocket geschlossen.' });
            };
        } catch (err) {
            clearTimeout(timeoutId);
            finish({ ok: false, error: err.message });
        }
    });
}

async function syncLongTermStatisticsFromHa(cfg = haConfigState, statesMap = null, showToast = false) {
    if (!cfg || !cfg.baseUrl || !cfg.accessToken) {
        if (showToast && typeof showToastNotification === 'function') {
            showToastNotification('Bitte zuerst Home Assistant URL und Access Token eintragen.', 'warning');
        }
        return false;
    }

    const e = cfg.entities || {};
    const pvCounterIds = getConfiguredPvEnergyEntities(cfg);
    const stringEnergyIds = (cfg.customStrings || []).map(cs => String(cs?.energyEntity || '').trim()).filter(Boolean);
    const effectivePvIds = pvCounterIds.length > 0 ? pvCounterIds : stringEnergyIds;

    const allStatIds = [...new Set([
        ...effectivePvIds,
        e.loadEnergyMonth,
        e.gridImportMonth,
        e.gridExportMonth,
        e.batteryChargeMonth,
        e.batteryDischargeMonth
    ].map(x => String(x || '').trim()).filter(Boolean))];

    if (allStatIds.length === 0) {
        if (showToast && typeof showToastNotification === 'function') {
            showToastNotification('Bitte mindestens einen kWh-Gesamtzähler in Sektion 2 hinterlegen.', 'warning');
        }
        return false;
    }

    const now = new Date();
    const targetYear = selectedAnalysisYear || now.getFullYear();
    const startOfYearIso = new Date(targetYear, 0, 1, 0, 0, 0).toISOString();
    const endOfPeriodIso = targetYear === now.getFullYear()
        ? now.toISOString()
        : new Date(targetYear, 11, 31, 23, 59, 59).toISOString();

    const wsRes = await fetchHaLongTermStatisticsWs(cfg.baseUrl, cfg.accessToken, allStatIds, startOfYearIso, endOfPeriodIso, 'month');
    if (!wsRes.ok || !wsRes.data) {
        if (showToast && typeof showToastNotification === 'function') {
            showToastNotification(wsRes.error || 'HA Langzeit-Statistik konnte nicht abgerufen werden.', 'warning');
        }
        return false;
    }

    const statsByEntity = wsRes.data;
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    // 1. Reconstruct exact 1st-of-month 00:00 counter baseline (monthStartByEntity) for current month
    // Even if the user hasn't opened the app for >10 days and HA's short-term history purged the 1st of the month!
    if (targetYear === curYear) {
        allStatIds.forEach(entId => {
            const buckets = statsByEntity[entId];
            if (!Array.isArray(buckets) || buckets.length === 0) return;
            const scale = getEnergyScaleForEntity(entId, statesMap);

            let reconstructedMonthStart = null;
            for (let i = 0; i < buckets.length; i++) {
                const b = buckets[i];
                const bDate = new Date(typeof b.start === 'number' ? b.start : b.start);
                if (bDate.getFullYear() === curYear && bDate.getMonth() === curMonth) {
                    if (typeof b.state === 'number' && typeof b.change === 'number' && b.state >= b.change) {
                        reconstructedMonthStart = +((b.state - b.change) * scale).toFixed(3);
                    } else if (i > 0 && typeof buckets[i - 1].state === 'number') {
                        reconstructedMonthStart = +(buckets[i - 1].state * scale).toFixed(3);
                    }
                    break;
                }
            }

            if (reconstructedMonthStart !== null && reconstructedMonthStart > 0) {
                energyCounterBaselines.monthStartByEntity[entId] = reconstructedMonthStart;
            }
        });

        healMonthBaselinesAgainstDayBaselines();
        energyCounterBaselines.lastLongTermSyncMs = Date.now();
        saveEnergyCounterBaselines();
    }

    // 2. Populate monthly logbook (performanceRecordsByProject) for all months in targetYear
    const extractEntityMonthlyChange = (entId, monthIdx) => {
        const cleanId = String(entId || '').trim();
        if (!cleanId || !Array.isArray(statsByEntity[cleanId])) return null;
        const scale = getEnergyScaleForEntity(cleanId, statesMap);
        for (const b of statsByEntity[cleanId]) {
            const bDate = new Date(typeof b.start === 'number' ? b.start : b.start);
            if (bDate.getFullYear() === targetYear && bDate.getMonth() === monthIdx) {
                if (typeof b.change === 'number' && !isNaN(b.change)) {
                    return Math.max(0, +(b.change * scale).toFixed(1));
                }
            }
        }
        return null;
    };

    const months = getCurrentYearMonthsData(targetYear);
    let updatedMonthsCount = 0;
    const maxMonthIdx = targetYear === curYear ? curMonth : 11;

    for (let m = 0; m <= maxMonthIdx; m++) {
        if (!months[m] || months[m].source === 'manual') continue;

        let pvMonthSum = 0;
        let pvMonthFound = false;
        effectivePvIds.forEach(id => {
            const c = extractEntityMonthlyChange(id, m);
            if (c !== null) {
                pvMonthSum += c;
                pvMonthFound = true;
            }
        });

        const expVal = extractEntityMonthlyChange(e.gridExportMonth, m);
        const impVal = extractEntityMonthlyChange(e.gridImportMonth, m);
        const bChgVal = extractEntityMonthlyChange(e.batteryChargeMonth, m);
        const bDisVal = extractEntityMonthlyChange(e.batteryDischargeMonth, m);

        if (pvMonthFound || expVal !== null || impVal !== null || bChgVal !== null || bDisVal !== null) {
            if (pvMonthFound) months[m].pvYieldKwh = +pvMonthSum.toFixed(1);
            if (expVal !== null) months[m].gridExportKwh = expVal;
            if (impVal !== null) months[m].gridImportKwh = impVal;
            if (bChgVal !== null) months[m].batteryChargedKwh = bChgVal;
            if (bDisVal !== null) months[m].batteryDischargedKwh = bDisVal;
            months[m].source = 'ha';
            updatedMonthsCount++;
        }
    }

    if (updatedMonthsCount > 0) {
        await savePerformanceRecordsLocalAndServer();
        renderAnalysisSection();
        renderHaUnifiedSensorMatrix();
    }

    if (showToast && typeof showToastNotification === 'function') {
        if (updatedMonthsCount > 0) {
            showToastNotification(`HA Langzeit-Statistik: ${updatedMonthsCount} Monate für ${targetYear} & Monats-Startwerte synchronisiert!`, 'success');
        } else {
            showToastNotification('HA Langzeit-Statistik geprüft (Zähler-Baselines aktualisiert).', 'info');
        }
    }
    return updatedMonthsCount > 0;
}

async function triggerManualLongTermStatsSync() {
    readHaModalIntoState();
    await syncLongTermStatisticsFromHa(haConfigState, null, true);
}

window.syncLongTermStatisticsFromHa = syncLongTermStatisticsFromHa;
window.triggerManualLongTermStatsSync = triggerManualLongTermStatsSync;

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
    const gridImpW = extractHaNumericClient(statesMap, e.gridImportPower, 'W');
    const gridExpW = extractHaNumericClient(statesMap, e.gridExportPower, 'W');
    let gridPowerW = null;
    if (gridImpW !== null || gridExpW !== null) {
        gridPowerW = (gridImpW || 0) - (gridExpW || 0);
    } else {
        gridPowerW = extractHaNumericClient(statesMap, e.gridPower, 'W');
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

    const rawLoadEnergyReading = extractHaNumericClient(statesMap, e.loadEnergyMonth, 'kWh');
    const rawGridImpReading = extractHaNumericClient(statesMap, e.gridImportMonth, 'kWh');
    const rawGridExpReading = extractHaNumericClient(statesMap, e.gridExportMonth, 'kWh');
    const rawBatChgReading = extractHaNumericClient(statesMap, e.batteryChargeMonth, 'kWh');
    const rawBatDisReading = extractHaNumericClient(statesMap, e.batteryDischargeMonth, 'kWh');

    const loadEnergyTodayKwh = resolveEnergyCounterDelta(
        e.loadEnergyMonth,
        rawLoadEnergyReading,
        energyCounterBaselines.dayStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.loadEnergyMonth, statesMap, true), maxPlausibleKwh: 180 }
    );
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

    const rawLoadEnergyMonthKwh = resolveEnergyCounterDelta(
        e.loadEnergyMonth,
        rawLoadEnergyReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.loadEnergyMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity }
    );
    const rawGridImportMonthKwh = resolveEnergyCounterDelta(
        e.gridImportMonth,
        rawGridImpReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.gridImportMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity }
    );
    const rawGridExportMonthKwh = resolveEnergyCounterDelta(
        e.gridExportMonth,
        rawGridExpReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.gridExportMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity }
    );
    const rawBatteryChargeMonthKwh = resolveEnergyCounterDelta(
        e.batteryChargeMonth,
        rawBatChgReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.batteryChargeMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity }
    );
    const rawBatteryDischargeMonthKwh = resolveEnergyCounterDelta(
        e.batteryDischargeMonth,
        rawBatDisReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.batteryDischargeMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity }
    );

    // Enforce physical monotonicity: Month delta >= Today delta
    const ensureMonthAtLeastToday = (mVal, dVal) => {
        if (mVal === null && dVal === null) return null;
        return +Math.max(Number(mVal) || 0, Number(dVal) || 0).toFixed(3);
    };

    const loadEnergyMonthKwh = ensureMonthAtLeastToday(rawLoadEnergyMonthKwh, loadEnergyTodayKwh);
    const gridImportMonthKwh = ensureMonthAtLeastToday(rawGridImportMonthKwh, gridImportTodayKwh);
    const gridExportMonthKwh = ensureMonthAtLeastToday(rawGridExportMonthKwh, gridExportTodayKwh);
    const batteryChargeMonthKwh = ensureMonthAtLeastToday(rawBatteryChargeMonthKwh, batteryChargeTodayKwh);
    const batteryDischargeMonthKwh = ensureMonthAtLeastToday(rawBatteryDischargeMonthKwh, batteryDischargeTodayKwh);

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
            const eMonthRaw = resolveEnergyCounterDelta(
                cs.energyEntity,
                rawStrKwh,
                energyCounterBaselines.monthStartByEntity,
                { isCumulative: isCumStr, upperBoundMap: energyCounterBaselines.dayStartByEntity }
            );
            const eMonthKwh = ensureMonthAtLeastToday(eMonthRaw, eKwh);
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
        const dMonthRaw = resolveEnergyCounterDelta(
            entId,
            rawVal,
            energyCounterBaselines.monthStartByEntity,
            { isCumulative: isCum, upperBoundMap: energyCounterBaselines.dayStartByEntity }
        );
        const dMonth = ensureMonthAtLeastToday(dMonthRaw, dToday);
        if (dMonth !== null && !isNaN(dMonth)) {
            pvMonthSum += dMonth;
            pvMonthValidCount++;
        }
    });

    const pvEnergyTodayKwh = pvTodayValidCount > 0
        ? +pvTodaySum.toFixed(3)
        : (stringTodayKwhCount > 0 ? +stringTodayKwhSum.toFixed(3) : null);

    const rawPvEnergyMonthKwh = pvMonthValidCount > 0
        ? +pvMonthSum.toFixed(3)
        : (stringMonthKwhCount > 0 ? +stringMonthKwhSum.toFixed(3) : null);
    const pvEnergyMonthKwh = ensureMonthAtLeastToday(rawPvEnergyMonthKwh, pvEnergyTodayKwh);

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
        loadEnergyTodayKwh,
        gridImportTodayKwh,
        gridExportTodayKwh,
        batteryChargeTodayKwh,
        batteryDischargeTodayKwh,
        pvEnergyMonthKwh,
        loadEnergyMonthKwh,
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

async function fetchHaDirectFromBrowser(rawBaseUrl, rawToken, endpointPath = '/api/states', externalSignal = null) {
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
        if (externalSignal && externalSignal.aborted) {
            return { ok: false, aborted: true, error: 'Abgebrochen', diagnostics };
        }
        const fullUrl = `${candidateBase}${endpointPath}`;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 14000);
            if (externalSignal) {
                externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
            }
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
            if (externalSignal && externalSignal.aborted) {
                return { ok: false, aborted: true, error: 'Abgebrochen', diagnostics };
            }
            diagnostics.push(`Abruf ${candidateBase}: ${err.name === 'AbortError' ? 'Timeout (14s)' : err.message}`);
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

async function fetchHaHistoryInBrowser(cfg, timeframe = currentCurveTimeframe, externalSignal = null) {
    const now = new Date();
    let startTime;
    let stepMs;
    if (timeframe === 'month') {
        startTime = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
        stepMs = 3 * 3600 * 1000; // 3-Stunden-Schritte für 30 Tage
    } else if (timeframe === 'week') {
        startTime = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
        stepMs = 60 * 60 * 1000; // 1-Stunden-Schritte für 7 Tage
    } else {
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        stepMs = 5 * 60 * 1000; // 5-Minuten-Schritte für heute
    }
    const startIso = startTime.toISOString();

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
    const histRes = await fetchHaDirectFromBrowser(cfg.baseUrl, cfg.accessToken, endpoint, externalSignal);
    if (!histRes.ok || !Array.isArray(histRes.data)) return null;

    const bucketTimes = [];
    for (let t = startTime.getTime(); t <= now.getTime(); t += stepMs) {
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

    const hasSeparateGridImp = Boolean(e.gridImportPower && rawSeriesByEntity.has(e.gridImportPower.trim()));
    const hasSeparateGridExp = Boolean(e.gridExportPower && rawSeriesByEntity.has(e.gridExportPower.trim()));

    if (hasSeparateGridImp || hasSeparateGridExp) {
        const impArr = hasSeparateGridImp ? sampleEntity(e.gridImportPower, 1).map(v => Math.max(0, v)) : bucketTimes.map(() => 0);
        const expArr = hasSeparateGridExp ? sampleEntity(e.gridExportPower, 1).map(v => Math.max(0, v)) : bucketTimes.map(() => 0);
        series.grid_power = impArr;
        series.grid_feedin = expArr;
        integratedKwh.grid_power = integrateKwh(impArr);
        integratedKwh.grid_feedin = integrateKwh(expArr);
    } else {
        const gridRaw = sampleEntity(e.gridPower, 1);
        series.grid_power = gridRaw.map(v => Math.max(0, v));
        series.grid_feedin = gridRaw.map(v => Math.max(0, -v));
        integratedKwh.grid_power = integrateKwh(series.grid_power);
        integratedKwh.grid_feedin = integrateKwh(series.grid_feedin);
    }

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

    // If no Home Assistant token is configured yet, display clean 0 values and connection hint
    if (!haConfigState.accessToken && haConfigState.mode !== 'webhook') {
        resetToZeroLiveTelemetry();
        resetToEmptyIntradaySeries();
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

        const dLoadToday = resolveEnergyCounterDelta(e.loadEnergyMonth, t.loadEnergyMonthKwh, energyCounterBaselines.dayStartByEntity, { isCumulative: true, maxPlausibleKwh: 180 });
        const dGridImpToday = resolveEnergyCounterDelta(e.gridImportMonth, t.gridImportMonthKwh, energyCounterBaselines.dayStartByEntity, { isCumulative: true, maxPlausibleKwh: 180 });
        const dGridExpToday = resolveEnergyCounterDelta(e.gridExportMonth, t.gridExportMonthKwh, energyCounterBaselines.dayStartByEntity, { isCumulative: true, maxPlausibleKwh: maxPlausibleDailyPvKwh });
        const dBatChgToday = resolveEnergyCounterDelta(e.batteryChargeMonth, t.batteryChargeMonthKwh, energyCounterBaselines.dayStartByEntity, { isCumulative: true, maxPlausibleKwh: 120 });
        const dBatDisToday = resolveEnergyCounterDelta(e.batteryDischargeMonth, t.batteryDischargeMonthKwh, energyCounterBaselines.dayStartByEntity, { isCumulative: true, maxPlausibleKwh: 120 });
        const dPvToday = resolveEnergyCounterDelta(todayPvCounterId, t.pvEnergyTodayKwh ?? t.pvEnergyMonthKwh, energyCounterBaselines.dayStartByEntity, {
            isCumulative: !e.pvEnergyToday || isEntityCumulativeTotal(todayPvCounterId, null, false),
            maxPlausibleKwh: maxPlausibleDailyPvKwh
        });

        const dPvMonthRaw = resolveEnergyCounterDelta(primaryPvCounterId, t.pvEnergyMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true, upperBoundMap: energyCounterBaselines.dayStartByEntity });
        const dLoadMonthRaw = resolveEnergyCounterDelta(e.loadEnergyMonth, t.loadEnergyMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true, upperBoundMap: energyCounterBaselines.dayStartByEntity });
        const dGridImpMonthRaw = resolveEnergyCounterDelta(e.gridImportMonth, t.gridImportMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true, upperBoundMap: energyCounterBaselines.dayStartByEntity });
        const dGridExpMonthRaw = resolveEnergyCounterDelta(e.gridExportMonth, t.gridExportMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true, upperBoundMap: energyCounterBaselines.dayStartByEntity });
        const dBatChgMonthRaw = resolveEnergyCounterDelta(e.batteryChargeMonth, t.batteryChargeMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true, upperBoundMap: energyCounterBaselines.dayStartByEntity });
        const dBatDisMonthRaw = resolveEnergyCounterDelta(e.batteryDischargeMonth, t.batteryDischargeMonthKwh, energyCounterBaselines.monthStartByEntity, { isCumulative: true, upperBoundMap: energyCounterBaselines.dayStartByEntity });

        const maxMonthToday = (mV, dV) => (mV === null && dV === null) ? null : +Math.max(Number(mV) || 0, Number(dV) || 0).toFixed(3);

        currentLiveTelemetry = {
            updatedAt: data.updatedAt || new Date().toISOString(),
            pvPowerW: Math.round(t.pvPowerW || 0),
            loadPowerW: Math.round(t.loadPowerW || 0),
            gridPowerW: Math.round(t.gridPowerW || 0),
            batteryPowerW: Math.round(t.batteryPowerW || 0),
            batterySocPct: t.batterySocPct !== null && t.batterySocPct !== undefined ? +(Number(t.batterySocPct).toFixed(1)) : (baseline.totalBatteryKwh > 0 ? 50 : null),
            pvEnergyTodayKwh: dPvToday,
            loadEnergyTodayKwh: dLoadToday,
            gridImportTodayKwh: dGridImpToday,
            gridExportTodayKwh: dGridExpToday,
            batteryChargeTodayKwh: dBatChgToday,
            batteryDischargeTodayKwh: dBatDisToday,
            pvEnergyMonthKwh: maxMonthToday(dPvMonthRaw, dPvToday),
            loadEnergyMonthKwh: maxMonthToday(dLoadMonthRaw, dLoadToday),
            gridImportMonthKwh: maxMonthToday(dGridImpMonthRaw, dGridImpToday),
            gridExportMonthKwh: maxMonthToday(dGridExpMonthRaw, dGridExpToday),
            batteryChargeMonthKwh: maxMonthToday(dBatChgMonthRaw, dBatChgToday),
            batteryDischargeMonthKwh: maxMonthToday(dBatDisMonthRaw, dBatDisToday),
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

function resetToZeroLiveTelemetry() {
    const customStrings = Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.length > 0
        ? haConfigState.customStrings
        : DEFAULT_CUSTOM_STRINGS;
    const customConsumers = Array.isArray(haConfigState.customConsumers) ? haConfigState.customConsumers : DEFAULT_CUSTOM_CONSUMERS;

    const strTele = {};
    const customStringsTele = customStrings.map(cs => {
        strTele[cs.id] = { powerW: 0, energyKwh: 0, available: false };
        return {
            id: cs.id,
            name: cs.name,
            color: cs.color || '#14b8a6',
            powerEntity: cs.powerEntity || '',
            energyEntity: cs.energyEntity || '',
            powerW: 0,
            energyKwh: 0,
            available: false
        };
    });

    const consumersTele = customConsumers.map(cc => ({
        id: cc.id,
        name: cc.name,
        powerEntity: cc.powerEntity || '',
        powerW: 0,
        available: false
    }));

    currentLiveTelemetry = {
        updatedAt: null,
        pvPowerW: 0,
        loadPowerW: 0,
        gridPowerW: 0,
        batteryPowerW: 0,
        batterySocPct: null,
        pvEnergyTodayKwh: 0,
        loadEnergyTodayKwh: 0,
        gridImportTodayKwh: 0,
        gridExportTodayKwh: 0,
        batteryChargeTodayKwh: 0,
        batteryDischargeTodayKwh: 0,
        pvEnergyMonthKwh: 0,
        loadEnergyMonthKwh: 0,
        gridImportMonthKwh: 0,
        gridExportMonthKwh: 0,
        batteryChargeMonthKwh: 0,
        batteryDischargeMonthKwh: 0,
        stringTelemetry: strTele,
        customStringsTelemetry: customStringsTele,
        consumersTelemetry: consumersTele,
        unavailableConsumersCount: 0,
        connectionOk: false,
        lastError: 'Bitte Token & Sensoren unter „HA & Sensoren“ wählen.'
    };
}

function resetToEmptyIntradaySeries() {
    const now = new Date();
    let startTime;
    let stepMs;
    if (currentCurveTimeframe === 'month') {
        startTime = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
        stepMs = 6 * 3600 * 1000;
    } else if (currentCurveTimeframe === 'week') {
        startTime = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
        stepMs = 2 * 3600 * 1000;
    } else {
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        stepMs = 15 * 60 * 1000;
    }

    const bucketTimes = [];
    for (let t = startTime.getTime(); t <= now.getTime(); t += stepMs) {
        bucketTimes.push(t);
    }
    if (bucketTimes.length < 2) {
        bucketTimes.push(startTime.getTime(), now.getTime());
    }

    const labels = bucketTimes.map(ts => formatHistoryBucketLabel(ts, currentCurveTimeframe));
    const zeroes = new Array(bucketTimes.length).fill(0);

    const customStrings = Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.length > 0
        ? haConfigState.customStrings
        : DEFAULT_CUSTOM_STRINGS;
    const customConsumers = Array.isArray(haConfigState.customConsumers) ? haConfigState.customConsumers : DEFAULT_CUSTOM_CONSUMERS;

    const series = {
        pv_total: [...zeroes],
        house_load: [...zeroes],
        grid_power: [...zeroes],
        grid_feedin: [...zeroes],
        battery_power: [...zeroes],
        battery_soc: [...zeroes]
    };
    const integratedKwh = {
        pv_total: 0,
        house_load: 0,
        grid_power: 0,
        grid_feedin: 0,
        battery_charge: 0,
        battery_discharge: 0,
        battery_power: 0
    };
    const peakValues = {
        pv_total: 0,
        house_load: 0,
        grid_power: 0,
        grid_feedin: 0,
        battery_power: 0,
        battery_soc: 0
    };

    customStrings.forEach(cs => {
        if (!cs || !cs.id) return;
        series[cs.id] = [...zeroes];
        integratedKwh[cs.id] = 0;
        peakValues[cs.id] = 0;
    });
    customConsumers.forEach(cc => {
        if (!cc || !cc.id) return;
        const cKey = `consumer_${cc.id}`;
        series[cKey] = [...zeroes];
        integratedKwh[cKey] = 0;
        peakValues[cKey] = 0;
    });

    intradaySeriesState = {
        startOfDayIso: startTime.toISOString(),
        nowIso: now.toISOString(),
        labels,
        bucketTimes,
        series,
        integratedKwh,
        peakValues
    };
}

function updateTimeframeButtonsUI(tf = currentCurveTimeframe, isLoading = false) {
    ['day', 'week', 'month'].forEach(t => {
        const btn = document.getElementById(`btn-timerange-${t}`);
        if (btn) {
            if (t === tf) {
                btn.className = "px-2.5 py-1 rounded-lg bg-teal-600 text-white shadow-xs transition-all cursor-pointer font-bold";
            } else {
                btn.className = "px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer font-bold";
            }
        }
    });
    if (isLoading) {
        const rangeEl = document.getElementById('dash_curve_timerange');
        if (rangeEl) {
            const labelMap = { day: 'Tagesverlauf', week: '7-Tage-Verlauf', month: '30-Tage-Verlauf' };
            rangeEl.innerText = `Lade ${labelMap[tf] || 'Verlauf'} aus Home Assistant …`;
        }
    }
}

async function fetchTimeframeDataset(tf, signal = null) {
    // 1. Try Browser-Direct Home Assistant History API first
    try {
        const directHist = await fetchHaHistoryInBrowser(haConfigState, tf, signal);
        if (signal && signal.aborted) return null;
        if (directHist && Array.isArray(directHist.bucketTimes) && directHist.bucketTimes.length > 0) {
            const labels = directHist.bucketTimes.map(ts => formatHistoryBucketLabel(ts, tf));
            return {
                timeframe: tf,
                fetchedAtMs: Date.now(),
                startOfDayIso: directHist.startOfDay || new Date().toISOString(),
                nowIso: directHist.now || new Date().toISOString(),
                labels,
                bucketTimes: directHist.bucketTimes,
                series: directHist.series,
                integratedKwh: directHist.integratedKwh || {},
                peakValues: directHist.peakValues || {}
            };
        }
    } catch (e) {}

    if (signal && signal.aborted) return null;

    // 2. Fallback to backend /api/ha/history
    try {
        const backendRes = await safeFetchBackendJson('/api/ha/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: haConfigState, range: tf }),
            signal
        });
        if (signal && signal.aborted) return null;
        const data = backendRes.data;
        if (backendRes.ok && data && data.success && Array.isArray(data.bucketTimes) && data.bucketTimes.length > 0 && data.series) {
            const labels = data.bucketTimes.map(ts => formatHistoryBucketLabel(ts, tf));
            const peakValues = data.peakValues || {};
            if (Object.keys(peakValues).length === 0) {
                Object.keys(data.series).forEach(k => {
                    peakValues[k] = (data.series[k] || []).reduce((m, v) => Math.max(m, Math.abs(v || 0)), 0);
                });
            }
            return {
                timeframe: tf,
                fetchedAtMs: Date.now(),
                startOfDayIso: data.startOfDay,
                nowIso: data.now,
                labels,
                bucketTimes: data.bucketTimes,
                series: data.series,
                integratedKwh: data.integratedKwh || {},
                peakValues
            };
        }
    } catch (e) {}

    return null;
}

function prewarmOtherTimeframesInBackground() {
    if (hasPrewarmedHistoryTimeframes) return;
    if (!haConfigState.accessToken && haConfigState.mode !== 'webhook') return;
    hasPrewarmedHistoryTimeframes = true;
    setTimeout(async () => {
        for (const tf of ['day', 'week', 'month']) {
            if (!intradayHistoryCache[tf]) {
                const ds = await fetchTimeframeDataset(tf, null);
                if (ds) {
                    intradayHistoryCache[tf] = ds;
                    if (tf === 'month' || tf === 'day') {
                        const analyseTab = document.getElementById('tab-analyse');
                        if (analyseTab && analyseTab.classList.contains('active') && typeof renderAnalysisSection === 'function') {
                            renderAnalysisSection();
                        }
                    }
                }
            }
        }
    }, 600);
}

// ============================================================================
// 3C. ZENTRALE SINGLE SOURCE OF TRUTH: UNIFIED ENERGY LEDGER (WATT + KWH)
// ============================================================================

function getDayIntegratedKwh() {
    if (intradayHistoryCache.day && intradayHistoryCache.day.integratedKwh) {
        return intradayHistoryCache.day.integratedKwh;
    }
    if (currentCurveTimeframe === 'day' && intradaySeriesState && intradaySeriesState.integratedKwh) {
        return intradaySeriesState.integratedKwh;
    }
    return {};
}

function getMonthIntegratedKwh() {
    const dayInt = getDayIntegratedKwh();
    const monthDs = intradayHistoryCache.month || (currentCurveTimeframe === 'month' ? intradaySeriesState : null);
    if (!monthDs || !Array.isArray(monthDs.bucketTimes) || monthDs.bucketTimes.length < 2 || !monthDs.series) {
        return { ...dayInt };
    }

    const now = new Date();
    const startOfMonthMs = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).getTime();
    const bTimes = monthDs.bucketTimes;
    const s = monthDs.series;

    const integrateCalendarMonth = (arr, transformFn = null) => {
        if (!Array.isArray(arr) || arr.length < 2) return 0;
        let wh = 0;
        for (let i = 1; i < arr.length; i++) {
            if (bTimes[i] < startOfMonthMs) continue;
            const t0 = Math.max(startOfMonthMs, bTimes[i - 1]);
            const dtH = Math.max(0, (bTimes[i] - t0) / 3600000);
            const v0 = transformFn ? transformFn(arr[i - 1] || 0) : Math.max(0, arr[i - 1] || 0);
            const v1 = transformFn ? transformFn(arr[i] || 0) : Math.max(0, arr[i] || 0);
            wh += ((v0 + v1) / 2) * dtH;
        }
        return +(wh / 1000).toFixed(3);
    };

    const pvMonthInt = integrateCalendarMonth(s.pv_total);
    const loadMonthInt = integrateCalendarMonth(s.house_load);
    const gridImpMonthInt = integrateCalendarMonth(s.grid_power);
    const gridExpMonthInt = integrateCalendarMonth(s.grid_feedin);
    const batChgMonthInt = integrateCalendarMonth(s.battery_power, v => Math.max(0, v));
    const batDisMonthInt = integrateCalendarMonth(s.battery_power, v => Math.max(0, -v));

    return {
        pv_total: Math.max(Number(dayInt.pv_total) || 0, pvMonthInt),
        house_load: Math.max(Number(dayInt.house_load) || 0, loadMonthInt),
        grid_power: Math.max(Number(dayInt.grid_power) || 0, gridImpMonthInt),
        grid_feedin: Math.max(Number(dayInt.grid_feedin) || 0, gridExpMonthInt),
        battery_charge: Math.max(Number(dayInt.battery_charge) || 0, batChgMonthInt),
        battery_discharge: Math.max(Number(dayInt.battery_discharge) || 0, batDisMonthInt)
    };
}

function getUnifiedEnergyLedger(baseline = null) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const t = currentLiveTelemetry || {};
    const e = haConfigState.entities || {};
    const dayInt = getDayIntegratedKwh();
    const monthInt = getMonthIntegratedKwh();
    const hasBattery = baseline.totalBatteryKwh > 0 || Boolean(e.batterySoc || e.batteryPower || e.batteryChargePower || e.batteryDischargePower || e.batteryChargeMonth || e.batteryDischargeMonth);

    // --- 1. TODAY (HEUTE): Combine kWh Counter Deltas + Today's Watt Integral ---
    const strSumTodayKwh = (t.customStringsTelemetry || []).reduce((acc, s) => acc + (Number(s.energyKwh) || 0), 0);
    const pvTodayFromCounter = (t.pvEnergyTodayKwh !== null && t.pvEnergyTodayKwh !== undefined && t.pvEnergyTodayKwh > 0) ? Number(t.pvEnergyTodayKwh) : null;
    const pvTodayRaw = pvTodayFromCounter ?? (Number(dayInt.pv_total) > 0 ? Number(dayInt.pv_total) : (strSumTodayKwh > 0 ? strSumTodayKwh : 0));

    const loadTodayFromCounter = (t.loadEnergyTodayKwh !== null && t.loadEnergyTodayKwh !== undefined && t.loadEnergyTodayKwh > 0) ? Number(t.loadEnergyTodayKwh) : null;
    const rawLoadToday = loadTodayFromCounter ?? Number(dayInt.house_load || 0);

    const gridImpTodayFromCounter = (t.gridImportTodayKwh !== null && t.gridImportTodayKwh !== undefined && t.gridImportTodayKwh > 0) ? Number(t.gridImportTodayKwh) : null;
    const rawGridImpToday = gridImpTodayFromCounter ?? Number(dayInt.grid_power || 0);

    const gridExpTodayFromCounter = (t.gridExportTodayKwh !== null && t.gridExportTodayKwh !== undefined && t.gridExportTodayKwh > 0) ? Number(t.gridExportTodayKwh) : null;
    const rawGridExpToday = gridExpTodayFromCounter ?? Number(dayInt.grid_feedin || 0);

    const batChgTodayFromCounter = hasBattery && (t.batteryChargeTodayKwh !== null && t.batteryChargeTodayKwh !== undefined && t.batteryChargeTodayKwh > 0) ? Number(t.batteryChargeTodayKwh) : null;
    const rawBatChgToday = hasBattery ? (batChgTodayFromCounter ?? Number(dayInt.battery_charge || 0)) : 0;

    const batDisTodayFromCounter = hasBattery && (t.batteryDischargeTodayKwh !== null && t.batteryDischargeTodayKwh !== undefined && t.batteryDischargeTodayKwh > 0) ? Number(t.batteryDischargeTodayKwh) : null;
    const rawBatDisToday = hasBattery ? (batDisTodayFromCounter ?? Number(dayInt.battery_discharge || 0)) : 0;

    const pvToday = +Math.max(0, pvTodayRaw).toFixed(2);
    const batChgToday = +Math.min(pvToday, Math.max(0, rawBatChgToday)).toFixed(2);
    const batDisToday = +Math.max(0, rawBatDisToday).toFixed(2);
    const batLossToday = +Math.max(0, batChgToday - batDisToday).toFixed(2);

    let gridExpToday = 0;
    let pvDirectToday = 0;
    if (rawGridExpToday > 0 || gridExpTodayFromCounter !== null) {
        gridExpToday = +Math.min(Math.max(0, pvToday - batChgToday), Math.max(0, rawGridExpToday)).toFixed(2);
        pvDirectToday = +Math.max(0, pvToday - batChgToday - gridExpToday).toFixed(2);
    } else {
        const estSelf = rawLoadToday > 0 ? Math.min(rawLoadToday, Math.max(0, pvToday - batChgToday)) : Math.max(0, pvToday - batChgToday);
        pvDirectToday = +estSelf.toFixed(2);
        gridExpToday = +Math.max(0, pvToday - batChgToday - pvDirectToday).toFixed(2);
    }

    const coveredToday = pvDirectToday + batDisToday;
    const gridImpToday = (rawGridImpToday > 0 || gridImpTodayFromCounter !== null)
        ? +Math.max(0, rawGridImpToday).toFixed(2)
        : +Math.max(0, rawLoadToday - coveredToday).toFixed(2);

    const houseTotalToday = +Math.max(0, coveredToday + gridImpToday, rawLoadToday).toFixed(2);

    // --- 2. CURRENT RUNNING MONTH (MONAT): Fuse Month Counter + 30d Month Watt Integral + Today (Monat >= Heute!) ---
    const pvMonthCandidates = [pvToday, Number(t.pvEnergyMonthKwh) || 0, Number(monthInt.pv_total) || 0];
    const gridImpMonthCandidates = [gridImpToday, Number(t.gridImportMonthKwh) || 0, Number(monthInt.grid_power) || 0];
    const gridExpMonthCandidates = [gridExpToday, Number(t.gridExportMonthKwh) || 0, Number(monthInt.grid_feedin) || 0];
    const batChgMonthCandidates = hasBattery ? [batChgToday, Number(t.batteryChargeMonthKwh) || 0, Number(monthInt.battery_charge) || 0] : [0];
    const batDisMonthCandidates = hasBattery ? [batDisToday, Number(t.batteryDischargeMonthKwh) || 0, Number(monthInt.battery_discharge) || 0] : [0];
    const loadMonthCandidates = [houseTotalToday, Number(t.loadEnergyMonthKwh) || 0, Number(monthInt.house_load) || 0];

    let pvMonth = +Math.max(...pvMonthCandidates).toFixed(2);
    let batChgMonth = +Math.min(pvMonth, Math.max(...batChgMonthCandidates)).toFixed(2);
    let batDisMonth = +Math.max(...batDisMonthCandidates).toFixed(2);
    let batLossMonth = +Math.max(0, batChgMonth - batDisMonth).toFixed(2);

    const rawExpMonth = Math.max(...gridExpMonthCandidates);
    let gridExpMonth = +Math.min(Math.max(0, pvMonth - batChgMonth), Math.max(gridExpToday, rawExpMonth)).toFixed(2);
    let pvDirectMonth = +Math.max(pvDirectToday, pvMonth - batChgMonth - gridExpMonth).toFixed(2);

    // Ensure strict energy conservation on PV side: PV = Direkt + Akku-Ladung + Einspeisung
    if (pvDirectMonth + batChgMonth + gridExpMonth > pvMonth) {
        pvMonth = +(pvDirectMonth + batChgMonth + gridExpMonth).toFixed(2);
    }

    let gridImpMonth = +Math.max(...gridImpMonthCandidates).toFixed(2);
    const rawLoadMonth = Math.max(...loadMonthCandidates);
    let houseTotalMonth = +Math.max(houseTotalToday, pvDirectMonth + batDisMonth + gridImpMonth, rawLoadMonth).toFixed(2);

    const hasAnyRealData = (pvMonth > 0 || gridImpMonth > 0 || batChgMonth > 0 || batDisMonth > 0);

    return {
        hasBattery,
        hasAnyRealData,
        today: {
            pvTotal: pvToday,
            gridImp: gridImpToday,
            gridExp: gridExpToday,
            batChg: batChgToday,
            batDis: batDisToday,
            pvDirect: pvDirectToday,
            batLoss: batLossToday,
            houseTotal: houseTotalToday,
            sources: {
                pv: pvTodayFromCounter !== null ? 'kWh-Zähler' : 'W-Integral',
                load: loadTodayFromCounter !== null ? 'kWh-Zähler' : 'W-Integral',
                gridImp: gridImpTodayFromCounter !== null ? 'kWh-Zähler' : 'W-Integral',
                gridExp: gridExpTodayFromCounter !== null ? 'kWh-Zähler' : 'W-Integral',
                batChg: batChgTodayFromCounter !== null ? 'kWh-Zähler' : 'W-Integral',
                batDis: batDisTodayFromCounter !== null ? 'kWh-Zähler' : 'W-Integral'
            }
        },
        month: {
            pvTotal: pvMonth,
            gridImp: gridImpMonth,
            gridExp: gridExpMonth,
            batChg: batChgMonth,
            batDis: batDisMonth,
            pvDirect: pvDirectMonth,
            batLoss: batLossMonth,
            houseTotal: houseTotalMonth
        }
    };
}
if (typeof window !== 'undefined') {
    window.getUnifiedEnergyLedger = getUnifiedEnergyLedger;
}

async function fetchAndRenderIntradayHistory(forceRefresh = false) {
    const baseline = getPlannedSystemBaseline();
    const targetTf = currentCurveTimeframe;

    if (!haConfigState.accessToken && haConfigState.mode !== 'webhook') {
        resetToEmptyIntradaySeries();
        renderIntradayCurveSection(baseline);
        return;
    }

    // Instant render from memory cache if available (Stale-While-Revalidate)
    const cached = intradayHistoryCache[targetTf];
    if (cached && Array.isArray(cached.bucketTimes) && cached.bucketTimes.length > 0) {
        intradaySeriesState = {
            startOfDayIso: cached.startOfDayIso,
            nowIso: cached.nowIso,
            labels: cached.labels,
            bucketTimes: cached.bucketTimes,
            series: cached.series,
            integratedKwh: cached.integratedKwh,
            peakValues: cached.peakValues
        };
        renderIntradayCurveSection(baseline);
        const maxAgeMs = targetTf === 'day' ? 25000 : 90000;
        if (!forceRefresh && (Date.now() - (cached.fetchedAtMs || 0)) < maxAgeMs) {
            return;
        }
    } else {
        updateTimeframeButtonsUI(targetTf, true);
    }

    if (intradayFetchAbortController) {
        try { intradayFetchAbortController.abort(); } catch (e) {}
    }
    const controller = new AbortController();
    intradayFetchAbortController = controller;

    const freshDataset = await fetchTimeframeDataset(targetTf, controller.signal);
    if (controller.signal.aborted) return;

    if (freshDataset) {
        intradayHistoryCache[targetTf] = freshDataset;
        if (currentCurveTimeframe === targetTf) {
            intradaySeriesState = {
                startOfDayIso: freshDataset.startOfDayIso,
                nowIso: freshDataset.nowIso,
                labels: freshDataset.labels,
                bucketTimes: freshDataset.bucketTimes,
                series: freshDataset.series,
                integratedKwh: freshDataset.integratedKwh,
                peakValues: freshDataset.peakValues
            };
            renderIntradayCurveSection(baseline);
        }
        if (targetTf === 'day') {
            renderLiveCockpitUI(baseline);
            prewarmOtherTimeframesInBackground();
        }
    } else if (!intradaySeriesState.labels || intradaySeriesState.labels.length === 0) {
        resetToEmptyIntradaySeries();
        renderIntradayCurveSection(baseline);
    }
}

function formatHistoryBucketLabel(ts, tf = currentCurveTimeframe) {
    const d = new Date(ts);
    if (tf === 'month') {
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (tf === 'week') {
        const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
        return `${dayNames[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:00`;
    }
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function setIntradayTimeframe(tf) {
    if (!['day', 'week', 'month'].includes(tf)) tf = 'day';
    currentCurveTimeframe = tf;
    activeCrosshairIndex = null;
    // Immediate 0ms visual feedback on buttons
    updateTimeframeButtonsUI(tf, !intradayHistoryCache[tf]);
    fetchAndRenderIntradayHistory(true);
}

function setLiveTelemetryMode(newMode) {
    haConfigState.mode = newMode === 'webhook' ? 'webhook' : 'poll';
    localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
    fetch('/api/ha/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: haConfigState })
    }).catch(() => {});

    refreshIntradayHistoryAndLive();
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
    if (!intradayHistoryCache.day || !intradayHistoryCache.month) {
        prewarmOtherTimeframesInBackground();
    }
    renderAnalysisSection(baseline);
}

function renderLiveCockpitUI(baseline) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const t = currentLiveTelemetry;
    const dayInt = getDayIntegratedKwh();
    const ledger = getUnifiedEnergyLedger(baseline);
    const td = ledger.today;

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

    // 2. Render "Energie · jetzt" 2x2 Interactive Status Tiles (Always using Today's Unified Ledger!)
    const maxPvRefW = Math.max(1500, baseline.totalKwp * 1000);
    const pvBarPct = Math.min(100, Math.max(t.pvPowerW > 0 ? 4 : 0, Math.round((t.pvPowerW / maxPvRefW) * 100)));
    setElText('dash_pv_power', formatPowerDe(t.pvPowerW, t.pvPowerW < 1000));
    const pvTodayVal = td.pvTotal;
    const pvLine1 = `${formatKwhDe(pvTodayVal, 2)} heute`;
    const pvLine2 = t.pvPowerW > 15 ? 'Erzeugung aktiv' : 'Standby · DC';
    setElText('dash_pv_status', pvLine1);
    setElText('dash_pv_sub2', pvLine2);
    setElText('dash_pv_sub', `${pvLine1} · ${pvLine2}`);
    const pvBar = document.getElementById('dash_pv_bar');
    if (pvBar) pvBar.style.width = `${pvBarPct}%`;

    const loadBarPct = Math.min(100, Math.max(6, Math.round((t.loadPowerW / 5000) * 100)));
    setElText('dash_load_power', formatPowerDe(t.loadPowerW));
    const loadTodayVal = td.houseTotal;
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
    const batChgToday = td.batChg;
    const batDisToday = td.batDis;
    const batLine2 = `↑ ${batChgToday.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · ↓ ${batDisToday.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`;
    setElText('dash_bat_status', batLine1);
    setElText('dash_bat_sub2', batLine2);
    setElText('dash_bat_sub', `${batLine1} · ${batLine2}`);
    const batBar = document.getElementById('dash_bat_bar');
    if (batBar) batBar.style.width = `${Math.min(100, Math.max(4, socNum))}%`;

    const absGridW = Math.abs(t.gridPowerW || 0);
    const gridBarPct = Math.min(100, Math.max(absGridW > 10 ? 5 : 0, Math.round((absGridW / 5000) * 100)));
    setElText('dash_grid_power', formatPowerDe(absGridW));
    const gridImpToday = td.gridImp;
    const gridExpToday = td.gridExp;

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
                const consKwh = dayInt[`consumer_${c.id}`] ?? 0;
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
        const todayPv = t.pvEnergyTodayKwh ?? intKwh.pv_total ?? 0;
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

    const isDay = currentCurveTimeframe === 'day';
    const isMonth = currentCurveTimeframe === 'month';
    const periodSuffix = currentCurveTimeframe === 'week' ? '7 Tage' : (isMonth ? '30 Tage' : 'heute');

    const defs = [];

    // 1. Custom PV Strings / Inverters
    customStrings.forEach((cs, idx) => {
        const teleItem = (t.customStringsTelemetry || []).find(x => x.id === cs.id);
        const liveW = teleItem ? teleItem.powerW : (t.stringTelemetry?.[cs.id]?.powerW || 0);
        const explicitKwh = teleItem?.energyKwh ?? t.stringTelemetry?.[cs.id]?.energyKwh ?? null;
        const calcKwh = intKwh[cs.id] ?? 0;
        const kwhVal = isDay && explicitKwh !== null && explicitKwh !== undefined ? explicitKwh : calcKwh;
        const peakW = Math.max(liveW, peaks[cs.id] || 0);

        defs.push({
            key: cs.id,
            name: cs.name || `String ${idx + 1}`,
            color: cs.color || '#14b8a6',
            axis: 'yPower',
            unit: 'W',
            category: 'pv',
            liveDisplay: formatPowerDe(liveW, true),
            subLine1: `${formatKwhDe(kwhVal, 2)} ${periodSuffix}`,
            subLine2: `${formatPowerDe(peakW, true)} Max`,
            subDisplay: `${formatKwhDe(kwhVal, 2)} · Max ${formatPowerDe(peakW, true)}`
        });
    });

    // 2. PV gesamt · DC
    const pvTotalKwh = isDay
        ? ((t.pvEnergyTodayKwh !== null && t.pvEnergyTodayKwh !== undefined) ? t.pvEnergyTodayKwh : (intKwh.pv_total ?? 0))
        : (isMonth && (!intKwh.pv_total || intKwh.pv_total === 0) && t.pvEnergyMonthKwh ? t.pvEnergyMonthKwh : (intKwh.pv_total ?? 0));
    const pvPeakW = Math.max(t.pvPowerW || 0, peaks.pv_total || 0);
    defs.push({
        key: 'pv_total',
        name: 'PV gesamt · DC',
        color: '#38bdf8',
        axis: 'yPower',
        unit: 'W',
        category: 'pv',
        liveDisplay: formatPowerDe(t.pvPowerW, t.pvPowerW < 1000),
        subLine1: `${formatKwhDe(pvTotalKwh, 2)} ${periodSuffix}`,
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
        subLine1: `${formatKwhDe(loadKwh, 2)} ${periodSuffix}`,
        subLine2: `${formatPowerDe(loadPeakW, true)} Max`,
        subDisplay: `${formatKwhDe(loadKwh, 2)} · Max ${formatPowerDe(loadPeakW, true)}`
    });

    // 4. Netzbezug
    const gridImportLive = Math.max(0, t.gridPowerW || 0);
    const gridImportKwh = isDay
        ? ((t.gridImportTodayKwh !== null && t.gridImportTodayKwh !== undefined) ? t.gridImportTodayKwh : (intKwh.grid_power ?? 0))
        : (isMonth && (!intKwh.grid_power || intKwh.grid_power === 0) && t.gridImportMonthKwh ? t.gridImportMonthKwh : (intKwh.grid_power ?? 0));
    const gridImpPeakW = Math.max(gridImportLive, peaks.grid_power || 0);
    defs.push({
        key: 'grid_power',
        name: 'Netzbezug',
        color: '#60a5fa',
        axis: 'yPower',
        unit: 'W',
        category: 'grid',
        liveDisplay: formatPowerDe(gridImportLive),
        subLine1: `${formatKwhDe(gridImportKwh, 2)} ${periodSuffix}`,
        subLine2: `${formatPowerDe(gridImpPeakW, true)} Max`,
        subDisplay: `${formatKwhDe(gridImportKwh, 2)} · Max ${formatPowerDe(gridImpPeakW, true)}`
    });

    // 5. Netzeinspeisung
    const gridExportLive = Math.max(0, -(t.gridPowerW || 0));
    const gridExportKwh = isDay
        ? ((t.gridExportTodayKwh !== null && t.gridExportTodayKwh !== undefined) ? t.gridExportTodayKwh : (intKwh.grid_feedin ?? 0))
        : (isMonth && (!intKwh.grid_feedin || intKwh.grid_feedin === 0) && t.gridExportMonthKwh ? t.gridExportMonthKwh : (intKwh.grid_feedin ?? 0));
    const gridExpPeakW = Math.max(gridExportLive, peaks.grid_feedin || 0);
    defs.push({
        key: 'grid_feedin',
        name: 'Netzeinspeisung',
        color: '#22d3ee',
        axis: 'yPower',
        unit: 'W',
        category: 'grid',
        liveDisplay: formatPowerDe(gridExportLive),
        subLine1: `${formatKwhDe(gridExportKwh, 2)} ${periodSuffix}`,
        subLine2: `${formatPowerDe(gridExpPeakW, true)} Max`,
        subDisplay: `${formatKwhDe(gridExportKwh, 2)} · Max ${formatPowerDe(gridExpPeakW, true)}`
    });

    // 6. Batterie · Leistung (W)
    const batName = haConfigState.batteryName || 'Batterie';
    const batLiveW = t.batteryPowerW || 0;
    const batChgKwh = isDay
        ? ((t.batteryChargeTodayKwh !== null && t.batteryChargeTodayKwh !== undefined) ? t.batteryChargeTodayKwh : (intKwh.battery_charge ?? 0))
        : (isMonth && (!intKwh.battery_charge || intKwh.battery_charge === 0) && t.batteryChargeMonthKwh ? t.batteryChargeMonthKwh : (intKwh.battery_charge ?? 0));
    const batDisKwh = isDay
        ? ((t.batteryDischargeTodayKwh !== null && t.batteryDischargeTodayKwh !== undefined) ? t.batteryDischargeTodayKwh : (intKwh.battery_discharge ?? 0))
        : (isMonth && (!intKwh.battery_discharge || intKwh.battery_discharge === 0) && t.batteryDischargeMonthKwh ? t.batteryDischargeMonthKwh : (intKwh.battery_discharge ?? 0));
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
            subLine1: `${formatKwhDe(cKwh, 2)} ${periodSuffix}`,
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

    // 1. Update View Title, Reset-Focus Button & Timeframe Pills
    const titleEl = document.getElementById('intraday_view_title');
    if (titleEl) {
        const defaultTitle = currentCurveTimeframe === 'week'
            ? '7-Tage-Verlauf · Telemetrie'
            : (currentCurveTimeframe === 'month' ? '30-Tage-Verlauf · Telemetrie' : 'Tagesverlauf · Telemetrie');
        titleEl.innerText = currentFocusedCurveMode ? currentFocusedCurveTitle : defaultTitle;
    }
    const resetBtn = document.getElementById('btnResetCurveFocus');
    if (resetBtn) {
        if (currentFocusedCurveMode) resetBtn.classList.remove('hidden');
        else resetBtn.classList.add('hidden');
    }

    ['day', 'week', 'month'].forEach(t => {
        const btn = document.getElementById(`btn-timerange-${t}`);
        if (btn) {
            if (t === currentCurveTimeframe) {
                btn.className = "px-2.5 py-1 rounded-lg bg-teal-600 text-white shadow-xs transition-all cursor-pointer font-bold";
            } else {
                btn.className = "px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer font-bold";
            }
        }
    });

    // 2. Update Single-Line Timestamp Range Header (Timeframe-Aware!)
    const now = intradaySeriesState.nowIso ? new Date(intradaySeriesState.nowIso) : new Date();
    const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    let rangeString = `${dateStr} · 00:00 – ${timeStr} Uhr`;
    if (currentCurveTimeframe === 'week') {
        rangeString = `Letzte 7 Tage · 1h-Auflösung (bis ${dateStr}, ${timeStr} Uhr)`;
    } else if (currentCurveTimeframe === 'month') {
        rangeString = `Letzte 30 Tage · 3h-Auflösung (bis ${dateStr})`;
    }

    const rangeEl = document.getElementById('dash_curve_timerange');
    if (rangeEl) rangeEl.innerText = rangeString;
    const fsRangeEl = document.getElementById('fs_curve_timerange');
    if (fsRangeEl) fsRangeEl.innerText = rangeString;

    const activeCountBadge = document.getElementById('dash_active_curves_badge');
    if (activeCountBadge) {
        const activeCount = defs.filter(d => activeCurveKeys.has(d.key)).length;
        activeCountBadge.innerText = `${activeCount} / ${defs.length} Kanäle aktiv`;
    }

    // 3. Render Fullscreen Overlay Chips (Theme-Aware for Light & Dark Mode)
    const buildChipsHtml = () => defs.map(d => {
        const isActive = activeCurveKeys.has(d.key);
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;
        return `
        <button type="button" onclick="toggleIntradayCurve('${d.key}')"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
                isActive
                    ? 'bg-slate-900 text-white dark:bg-[#192c34] dark:text-white shadow-2xs ring-1 ring-slate-900/10 dark:ring-white/15'
                    : 'bg-slate-200/80 text-slate-500 dark:bg-slate-900/40 dark:text-slate-500 opacity-55 hover:opacity-85'
            }"
            style="border-left: 3px solid ${isActive ? d.color : '#64748b'}">
            <span>${safeName}</span>
        </button>`;
    }).join('');

    const chipsEl = document.getElementById('dash_curve_legend_chips');
    if (chipsEl) chipsEl.innerHTML = buildChipsHtml();
    const fsChipsEl = document.getElementById('fs_curve_legend_chips');
    if (fsChipsEl) fsChipsEl.innerHTML = buildChipsHtml();

    // 3B. Apply In-Place Full-Bleed Expansion State to DOM
    applyIntradayInlineExpandDOM();

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

// Custom Chart.js Crosshair Line Plugin (Replaces blocking floating tooltip)
const intradayCrosshairPlugin = {
    id: 'intradayCrosshairLine',
    afterDatasetsDraw(chart) {
        const idx = activeCrosshairIndex;
        if (idx === null || idx === undefined || idx < 0) return;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data[idx]) return;

        const pt = meta.data[idx];
        const x = pt.x;
        const { top, bottom } = chart.chartArea;
        if (x < chart.chartArea.left || x > chart.chartArea.right) return;

        const ctx = chart.ctx;
        const isDark = document.documentElement.classList.contains('dark');

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = isDark ? 'rgba(45, 212, 191, 0.75)' : 'rgba(13, 148, 136, 0.75)';
        ctx.setLineDash([4, 3]);
        ctx.stroke();

        // Draw small highlight dots on each visible dataset at idx
        chart.data.datasets.forEach((ds, dsIdx) => {
            const dsMeta = chart.getDatasetMeta(dsIdx);
            const el = dsMeta?.data?.[idx];
            if (!el || isNaN(el.y)) return;
            ctx.beginPath();
            ctx.arc(el.x, el.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = ds.borderColor || '#14b8a6';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.strokeStyle = isDark ? '#081116' : '#ffffff';
            ctx.stroke();
        });
        ctx.restore();
    }
};

function renderIntradayCanvasInstance(canvasId, defs, isFullscreen = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    if (!defs) defs = getAvailableCurveDefinitions();

    const isDark = document.documentElement.classList.contains('dark');
    const ctx = canvas.getContext('2d');
    const chartHeight = canvas.parentElement?.clientHeight || (isFullscreen ? 420 : (isIntradayChartExpanded ? 320 : 240));
    const activeDefs = defs.filter(d => activeCurveKeys.has(d.key));
    const powerCurvesCount = activeDefs.filter(d => d.axis === 'yPower').length;

    // Hide left & right Y-scales when in-place expanded OR in fullscreen mode to gain +20% full-bleed width
    const hideSideScales = isFullscreen || isIntradayChartExpanded;

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
            borderWidth: (isFullscreen || isIntradayChartExpanded) ? 2.4 : (isPrimaryFocus ? 2.3 : 1.9),
            borderDash: d.axis === 'ySoc' ? [4, 3] : [],
            pointRadius: 0,
            pointHoverRadius: 0,
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
        if (existingChart.options) {
            existingChart.options.layout = {
                padding: hideSideScales
                    ? { left: 0, right: 0, top: 4, bottom: 0 }
                    : { left: 2, right: 2, top: 2, bottom: 0 }
            };
        }
        if (existingChart.options && existingChart.options.scales) {
            const sx = existingChart.options.scales.x;
            const sy = existingChart.options.scales.yPower;
            const ss = existingChart.options.scales.ySoc;
            if (sx) {
                sx.grid.color = gridColorX;
                sx.ticks.color = tickColorX;
                sx.ticks.maxTicksLimit = (isFullscreen || isIntradayChartExpanded) ? 10 : 7;
            }
            if (sy) {
                sy.display = !hideSideScales;
                sy.beginAtZero = minPowerW >= 0;
                sy.suggestedMin = minPowerW < 0 ? Math.floor(minPowerW * 1.05) : 0;
                sy.suggestedMax = Math.ceil(maxPowerW * 1.06);
                sy.grid.color = gridColorY;
                sy.ticks.color = tickColorPower;
            }
            if (ss) {
                ss.display = !hideSideScales && hasSocCurve;
                ss.ticks.color = tickColorSoc;
            }
        }
        existingChart.update('none');
        return;
    }

    if (existingChart) {
        try { existingChart.destroy(); } catch (e) {}
    }

    const handleScrubEvent = (event, chart) => {
        const nativeEvt = event?.native || event;
        if (!nativeEvt || !chart?.chartArea) return;
        const rect = canvas.getBoundingClientRect();
        let clientX = nativeEvt.clientX;
        if (clientX === undefined && nativeEvt.touches && nativeEvt.touches.length > 0) {
            clientX = nativeEvt.touches[0].clientX;
        }
        if (clientX === undefined) return;
        const relX = clientX - rect.left;
        const { left, right } = chart.chartArea;
        const totalPts = (intradaySeriesState.labels || []).length;
        if (totalPts <= 0 || right <= left) return;
        const ratio = Math.max(0, Math.min(1, (relX - left) / (right - left)));
        const idx = Math.round(ratio * (totalPts - 1));
        isIntradayHovering = true;
        activeCrosshairIndex = idx;
        updateIntradayHoverReadout(idx, getAvailableCurveDefinitions());
        chart.draw();
    };

    const chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: intradaySeriesState.labels,
            datasets
        },
        plugins: [intradayCrosshairPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            layout: {
                padding: hideSideScales
                    ? { left: 0, right: 0, top: 4, bottom: 0 }
                    : { left: 2, right: 2, top: 2, bottom: 0 }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            onHover: (event, elements, chart) => {
                if (elements && elements.length > 0) {
                    isIntradayHovering = true;
                    const idx = elements[0].index;
                    activeCrosshairIndex = idx;
                    updateIntradayHoverReadout(idx, getAvailableCurveDefinitions());
                    chart.draw();
                } else {
                    handleScrubEvent(event, chart);
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false // Disabled so floating popup never blocks the curves; values show in top readout bar!
                }
            },
            scales: {
                x: {
                    grid: { color: gridColorX, drawBorder: false },
                    ticks: {
                        color: tickColorX,
                        maxTicksLimit: (isFullscreen || isIntradayChartExpanded) ? 10 : 7,
                        font: { family: 'JetBrains Mono, monospace', size: isFullscreen ? 11 : 10 }
                    }
                },
                yPower: {
                    type: 'linear',
                    position: 'left',
                    display: !hideSideScales,
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
                    display: !hideSideScales && hasSocCurve,
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
    const datePrefix = currentCurveTimeframe !== 'day'
        ? `${dObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · `
        : '';

    const activeDefs = defs.filter(d => activeCurveKeys.has(d.key));
    const htmlItems = activeDefs.map(d => {
        const arr = intradaySeriesState.series[d.key] || [];
        const val = arr[idx] !== undefined ? arr[idx] : 0;
        const unit = d.axis === 'ySoc' ? '%' : 'W';
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;
        const fmtVal = Number(val).toLocaleString('de-DE', { maximumFractionDigits: d.axis === 'ySoc' ? 1 : 0 });
        return `<span class="inline-flex items-center gap-1 whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full" style="background:${d.color}"></span><span class="${isDark ? 'text-slate-400' : 'text-slate-500'}">${safeName}:</span><strong class="${isDark ? 'text-white' : 'text-slate-900'}">${fmtVal} ${unit}</strong></span>`;
    });

    const fullHtml = `<span class="text-teal-600 dark:text-teal-400 font-bold whitespace-nowrap">${datePrefix}${timePart} Uhr</span><span class="text-slate-400 dark:text-slate-600">·</span>${htmlItems.join('<span class="text-slate-300 dark:text-slate-700 mx-0.5">·</span>')}`;

    const readoutEl = document.getElementById('dash_curve_hover_readout');
    if (readoutEl) readoutEl.innerHTML = fullHtml;
    const fsReadoutEl = document.getElementById('fs_curve_hover_readout');
    if (fsReadoutEl) fsReadoutEl.innerHTML = fullHtml;
}

// ============================================================================
// 5B. IN-PLACE FULL-BLEED EXPANSION & FULLSCREEN / 90° LANDSCAPE OVERLAY
// ============================================================================

function applyIntradayInlineExpandDOM() {
    const stickyOuter = document.getElementById('intradayStickyOuter');
    const stickyCard = document.getElementById('intradayStickyCard');
    const stageWrap = document.getElementById('intradayChartStageWrapper');
    const axisHeaderRow = document.getElementById('intradayAxisHeaderRow');
    const canvasContainer = document.getElementById('intradayCanvasContainer');
    const expandBtnIcon = document.getElementById('intradayInlineExpandIcon');
    const expandBtnLabel = document.getElementById('intradayInlineExpandLabel');

    if (stickyOuter) {
        if (isIntradayChartExpanded) {
            stickyOuter.className = "sticky top-0 z-30 pt-0.5 pb-1 backdrop-blur-md bg-white/95 dark:bg-slate-950/95 -mx-3 sm:-mx-5 shadow-md transition-all duration-200";
        } else {
            stickyOuter.className = "sticky top-0 z-30 pt-1 pb-1.5 backdrop-blur-md bg-white/90 dark:bg-slate-950/90 rounded-b-[24px] shadow-sm transition-all duration-200";
        }
    }
    if (stickyCard) {
        if (isIntradayChartExpanded) {
            stickyCard.className = "dash-main-card rounded-none overflow-hidden border-y border-x-0 border-slate-200/80 dark:border-teal-500/25 shadow-sm";
        } else {
            stickyCard.className = "dash-main-card rounded-[24px] overflow-hidden border border-slate-200/80 dark:border-teal-500/25 shadow-sm";
        }
    }
    if (stageWrap) {
        if (isIntradayChartExpanded) {
            stageWrap.className = "px-0 pt-0.5 pb-0.5 bg-white/60 dark:bg-[#081015]/80 cursor-pointer relative group select-none";
        } else {
            stageWrap.className = "px-1 sm:px-2 pt-1 pb-1 bg-white/40 dark:bg-[#081015]/70 cursor-pointer relative group select-none";
        }
    }
    if (axisHeaderRow) {
        if (isIntradayChartExpanded) axisHeaderRow.classList.add('hidden');
        else axisHeaderRow.classList.remove('hidden');
    }
    if (canvasContainer) {
        if (isIntradayChartExpanded) {
            canvasContainer.className = "relative h-60 sm:h-80 md:h-96 w-full transition-all duration-200";
        } else {
            canvasContainer.className = "relative h-44 sm:h-64 md:h-72 w-full transition-all duration-200";
        }
    }
    if (expandBtnIcon) {
        expandBtnIcon.innerText = isIntradayChartExpanded ? 'collapse_content' : 'expand_content';
    }
    if (expandBtnLabel) {
        expandBtnLabel.innerText = isIntradayChartExpanded ? 'Kompakt' : 'Randlos';
    }
}

function toggleIntradayInlineExpand(event = null) {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    isIntradayChartExpanded = !isIntradayChartExpanded;
    try {
        localStorage.setItem('pvpro_intraday_expanded', isIntradayChartExpanded ? '1' : '0');
    } catch (e) {}
    applyIntradayInlineExpandDOM();
    const defs = getAvailableCurveDefinitions();
    renderIntradayCanvasInstance('intradayTelemetryChart', defs, false);
    if (chartIntraday) {
        try { chartIntraday.resize(); } catch (e) {}
    }
}

function onIntradayStagePointerDown(e) {
    const pt = e.touches && e.touches[0] ? e.touches[0] : e;
    intradayPointerStart = { x: pt.clientX, y: pt.clientY, time: Date.now() };
}

function onIntradayStageClick(e) {
    // Only toggle inline full-bleed expansion on a clean tap/click (not when scrubbing/dragging across the curve)
    if (intradayPointerStart) {
        const dx = Math.abs((e.clientX || 0) - intradayPointerStart.x);
        const dy = Math.abs((e.clientY || 0) - intradayPointerStart.y);
        if (dx > 10 || dy > 10) {
            return;
        }
    }
    toggleIntradayInlineExpand(e);
}

if (typeof window !== 'undefined') {
    window.toggleIntradayInlineExpand = toggleIntradayInlineExpand;
    window.onIntradayStagePointerDown = onIntradayStagePointerDown;
    window.onIntradayStageClick = onIntradayStageClick;
}

function openIntradayFullscreenModal(startRotated = false) {
    const modal = document.getElementById('modal-intraday-fullscreen');
    if (!modal) return;
    if (startRotated === true) {
        isIntradayFsRotated = true;
    }
    modal.classList.remove('hidden');
    applyIntradayFullscreenRotationStyle();
    setTimeout(() => {
        renderIntradayCurveSection();
        if (chartIntradayFullscreen) {
            try { chartIntradayFullscreen.resize(); } catch (e) {}
        }
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
        if (chartIntradayFullscreen) {
            try { chartIntradayFullscreen.resize(); } catch (e) {}
        }
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

let monthlyYieldSummaryFilter = 'recorded'; // 'recorded' | 'all'

function setMonthlyYieldSummaryFilter(mode) {
    monthlyYieldSummaryFilter = mode === 'all' ? 'all' : 'recorded';
    const baseline = getPlannedSystemBaseline();
    const metrics = computeAggregatedPerformanceMetrics(baseline);
    renderMonthlyYieldSummaryCard(baseline, metrics);
}
if (typeof window !== 'undefined') {
    window.setMonthlyYieldSummaryFilter = setMonthlyYieldSummaryFilter;
}

function computeAggregatedPerformanceMetrics(baseline) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const months = getCurrentYearMonthsData(selectedAnalysisYear);
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonthIdx = now.getMonth();
    const curDayOfMonth = now.getDate();
    const ledger = getUnifiedEnergyLedger(baseline);

    let realPvSum = 0;
    let sollPvForRecordedMonths = 0;
    let fullSollPvForRecordedMonths = 0;
    let recordedMonthsCount = 0;
    let gridExportSum = 0;
    let gridImportSum = 0;
    let batChargedSum = 0;
    let batDischargedSum = 0;

    const monthlyComparison = months.map((mObj, idx) => {
        const sollKwh = baseline.monthlySollTotal[idx] || 0;
        const isCurrentRunningMonth = (selectedAnalysisYear === curYear && idx === curMonthIdx);
        const daysInMonth = new Date(selectedAnalysisYear, idx + 1, 0).getDate() || 30;
        const daysElapsed = isCurrentRunningMonth ? Math.max(1, Math.min(daysInMonth, curDayOfMonth)) : daysInMonth;
        const proRataRatio = isCurrentRunningMonth ? (daysElapsed / daysInMonth) : 1;
        const proRataSollKwh = sollKwh * proRataRatio;

        let hasReal = mObj.pvYieldKwh !== null && mObj.pvYieldKwh !== undefined && mObj.pvYieldKwh !== '';
        let isLiveCurrentMonth = false;

        let realPv = hasReal ? Math.max(0, parseFloat(mObj.pvYieldKwh) || 0) : null;
        let expKwh = hasReal ? Math.max(0, parseFloat(mObj.gridExportKwh) || 0) : 0;
        let impKwh = hasReal ? Math.max(0, parseFloat(mObj.gridImportKwh) || 0) : 0;
        let bChg = hasReal ? Math.max(0, parseFloat(mObj.batteryChargedKwh) || 0) : 0;
        let bDis = hasReal ? Math.max(0, parseFloat(mObj.batteryDischargedKwh) || 0) : 0;

        // Auto-feed or heal the running calendar month from the Unified Energy Ledger (Single Source of Truth)
        if (isCurrentRunningMonth && ledger.month.hasLiveData) {
            if (!hasReal || mObj.source === 'ha') {
                hasReal = true;
                isLiveCurrentMonth = true;
                realPv = Math.max(realPv || 0, ledger.month.pvTotal);
                expKwh = Math.max(expKwh || 0, ledger.month.gridExp);
                impKwh = Math.max(impKwh || 0, ledger.month.gridImp);
                bChg = Math.max(bChg || 0, ledger.month.batChg);
                bDis = Math.max(bDis || 0, ledger.month.batDis);
            } else {
                // Even if manually edited, never allow running month channels to drop below today's live telemetry
                realPv = Math.max(realPv || 0, ledger.today.pvTotal);
                expKwh = Math.max(expKwh || 0, ledger.today.gridExp);
                impKwh = Math.max(impKwh || 0, ledger.today.gridImp);
                bChg = Math.max(bChg || 0, ledger.today.batChg);
                bDis = Math.max(bDis || 0, ledger.today.batDis);
            }
        }

        // For the running calendar month, compare against pro-rata target up to today unless manually closed
        const effectiveSollKwh = isCurrentRunningMonth ? Math.max(0.1, proRataSollKwh) : sollKwh;

        const directKwh = hasReal ? Math.max(0, (realPv || 0) - expKwh - bChg) : 0;
        const totalSelfUsedKwh = hasReal ? Math.max(0, (realPv || 0) - expKwh) : 0;
        const houseConsKwh = hasReal ? (directKwh + bDis + impKwh) : 0;

        const selfSavedEur = (directKwh + bDis) * baseline.gridPriceEur;
        const feedInRevEur = expKwh * baseline.eegRateEur;
        const totalBenefitEur = selfSavedEur + feedInRevEur;

        const sollSelfShare = baseline.totalBatteryKwh > 0 ? 0.58 : 0.34;
        const sollMonthEur = (sollKwh * sollSelfShare * baseline.gridPriceEur) + (sollKwh * (1 - sollSelfShare) * baseline.eegRateEur);

        if (hasReal && realPv !== null) {
            realPvSum += realPv;
            sollPvForRecordedMonths += effectiveSollKwh;
            fullSollPvForRecordedMonths += sollKwh;
            recordedMonthsCount++;
            gridExportSum += expKwh;
            gridImportSum += impKwh;
            batChargedSum += bChg;
            batDischargedSum += bDis;
        }

        const perfIndexPct = (hasReal && effectiveSollKwh > 0 && realPv !== null) ? ((realPv / effectiveSollKwh) * 100) : null;
        const deviationPct = perfIndexPct !== null ? (perfIndexPct - 100) : null;
        const fullMonthCompletionPct = (hasReal && sollKwh > 0 && realPv !== null) ? ((realPv / sollKwh) * 100) : null;
        const diffEffectiveKwh = (hasReal && realPv !== null) ? (realPv - effectiveSollKwh) : null;
        const diffFullMonthKwh = (hasReal && realPv !== null) ? (realPv - sollKwh) : null;
        const dataSource = !hasReal ? 'open' : (isLiveCurrentMonth ? 'live_ha' : 'logbook');
        const dataSourceLabel = !hasReal ? 'PVGIS-Prognose' : (isLiveCurrentMonth ? 'Live HA · Zähler + Watt' : 'Manuell · Logbuch');

        return {
            month: idx,
            labelShort: MONTH_LABELS_SHORT[idx],
            labelLong: MONTH_LABELS_LONG[idx],
            hasReal,
            isLiveCurrentMonth,
            isCurrentRunningMonth,
            daysElapsed,
            daysInMonth,
            proRataRatio,
            proRataSollKwh,
            effectiveSollKwh,
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
            deviationPct,
            fullMonthCompletionPct,
            diffEffectiveKwh,
            diffFullMonthKwh,
            dataSource,
            dataSourceLabel,
            totalBenefitEur,
            sollMonthEur
        };
    });

    const overallPerfIndexPct = sollPvForRecordedMonths > 0 ? ((realPvSum / sollPvForRecordedMonths) * 100) : 100;
    const overallDeviationPct = overallPerfIndexPct - 100;
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
        if (m.hasReal && !m.isCurrentRunningMonth) return acc + m.totalBenefitEur;
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
        fullSollPvForRecordedMonths,
        totalSollYearKwh: baseline.totalSollYearKwh,
        overallPerfIndexPct,
        overallDeviationPct,
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

function renderMonthlyYieldSummaryCard(baseline, metrics) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    if (!metrics) metrics = computeAggregatedPerformanceMetrics(baseline);

    // 1. Update segmented filter buttons
    const btnRec = document.getElementById('btn-monthly-filter-recorded');
    const btnAll = document.getElementById('btn-monthly-filter-all');
    if (btnRec && btnAll) {
        const activeCls = "px-3 py-1.5 rounded-xl bg-teal-600 text-white shadow-xs transition-all cursor-pointer whitespace-nowrap";
        const idleCls = "px-3 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer whitespace-nowrap";
        btnRec.className = monthlyYieldSummaryFilter === 'recorded' ? activeCls : idleCls;
        btnAll.className = monthlyYieldSummaryFilter === 'all' ? activeCls : idleCls;
    }

    const now = new Date();
    const curMonthIdx = now.getMonth();

    // Determine spotlight month: current running month (if viewing current year) or latest recorded month
    let spotlightMonth = metrics.monthlyComparison.find(m => m.isCurrentRunningMonth);
    if (!spotlightMonth) {
        const recorded = metrics.monthlyComparison.filter(m => m.hasReal);
        spotlightMonth = recorded.length > 0 ? recorded[recorded.length - 1] : metrics.monthlyComparison[curMonthIdx] || metrics.monthlyComparison[0];
    }

    const subEl = document.getElementById('monthly_yield_summary_subtitle');
    if (subEl) {
        const recCount = metrics.recordedMonthsCount;
        subEl.innerText = recCount > 0
            ? `Automatischer Soll-Ist-Abgleich (${recCount}/12 Monate erfasst · Pro-Rata bis Tag ${now.getDate()})`
            : `Standortgenaue PVGIS-Monatsprognose · Taggenaues Pro-Rata-Soll für ${MONTH_LABELS_LONG[curMonthIdx]}`;
    }

    // 2. Render Spotlight Banner for Current / Active Month
    const bannerEl = document.getElementById('monthlyYieldCurrentFocusBanner');
    if (bannerEl && spotlightMonth) {
        const m = spotlightMonth;
        const realVal = m.hasReal && m.realPv !== null ? m.realPv : 0;
        const proRataSoll = m.effectiveSollKwh || m.sollKwh || 0;
        const fullSoll = m.sollKwh || 0;

        // Calculate deviation against pro-rata target (if running month) or full month target
        const devPct = m.hasReal && m.deviationPct !== null
            ? m.deviationPct
            : (proRataSoll > 0 && realVal > 0 ? (((realVal - proRataSoll) / proRataSoll) * 100) : 0);
        const devSign = devPct >= 0 ? '+' : '';
        const diffKwh = realVal - proRataSoll;
        const diffKwhSign = diffKwh >= 0 ? '+' : '';

        const fullReachPct = fullSoll > 0 ? Math.min(100, (realVal / fullSoll) * 100) : 0;
        const proRataMarkerPct = m.isCurrentRunningMonth && fullSoll > 0
            ? Math.min(100, Math.max(2, (m.daysElapsed / m.daysInMonth) * 100))
            : 100;

        let toneText = 'text-slate-600 dark:text-slate-300';
        let barColor = 'bg-teal-500';
        let statusLabel = 'Noch keine Zählerdaten';
        if (m.hasReal) {
            if (devPct >= -2) {
                toneText = 'text-emerald-600 dark:text-emerald-400';
                barColor = 'bg-emerald-500';
                statusLabel = devPct >= 2 ? 'Über PVGIS-Soll' : 'Exakt auf PVGIS-Kurs';
            } else if (devPct >= -12) {
                toneText = 'text-amber-600 dark:text-amber-400';
                barColor = 'bg-amber-500';
                statusLabel = 'Leicht unter PVGIS-Soll';
            } else {
                toneText = 'text-rose-600 dark:text-rose-400';
                barColor = 'bg-rose-500';
                statusLabel = 'Unter PVGIS-Soll';
            }
        }

        const fmt1 = (v) => Number(v || 0).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const fmt0 = (v) => Math.round(Number(v || 0)).toLocaleString('de-DE');

        const sourceText = m.hasReal
            ? (m.isLiveCurrentMonth ? 'Live HA · Automatische Zähler-Differenz' : 'Manuell · Monats-Logbuch')
            : 'Warte auf Live-HA-Zähler oder Logbuch-Eintrag';

        const proRataInfoText = m.isCurrentRunningMonth
            ? `Tag ${m.daysElapsed} von ${m.daysInMonth} (${Math.round(m.proRataRatio * 100)} % des Monats)`
            : `Abgeschlossener Kalendermonat`;

        bannerEl.innerHTML = `
            <div class="rounded-2xl bg-slate-100/85 dark:bg-[#13232b]/90 border border-slate-200/90 dark:border-teal-500/25 p-4 space-y-3">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span class="font-bold text-teal-700 dark:text-teal-300">${m.isCurrentRunningMonth ? 'Aktueller Monat' : 'Fokus-Monat'}</span>
                            <span aria-hidden="true">·</span>
                            <span>${proRataInfoText}</span>
                            <span aria-hidden="true">·</span>
                            <span class="font-medium text-slate-600 dark:text-slate-300">${sourceText}</span>
                        </div>
                        <h4 class="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5">
                            ${m.labelLong} ${selectedAnalysisYear}
                        </h4>
                    </div>

                    <div class="flex items-baseline gap-2 sm:text-right font-mono tabular-nums">
                        <div>
                            <span class="text-xl sm:text-2xl font-black ${toneText}">
                                ${m.hasReal ? `${devSign}${devPct.toFixed(1).replace('.', ',')} %` : '0,0 %'}
                            </span>
                            <span class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                ${statusLabel} (${m.hasReal ? `${diffKwhSign}${fmt1(diffKwh)} kWh` : `Soll bis heute: ${fmt1(proRataSoll)} kWh`})
                            </span>
                        </div>
                    </div>
                </div>

                <!-- 3-Column Metric Strip: Ist-Ertrag | Anteiliges Soll bis heute | Monats-Gesamtsoll -->
                <div class="grid grid-cols-3 gap-2.5 pt-1 font-mono tabular-nums">
                    <div class="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-white/10">
                        <span class="text-[10px] font-sans font-semibold text-slate-500 dark:text-slate-400 block">Ist-Ertrag (${m.hasReal ? (m.isLiveCurrentMonth ? 'Live HA' : 'Logbuch') : 'Aktuell'})</span>
                        <span class="text-sm sm:text-base font-black text-slate-900 dark:text-white mt-0.5 block">${fmt1(realVal)} kWh</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-white/10">
                        <span class="text-[10px] font-sans font-semibold text-slate-500 dark:text-slate-400 block">${m.isCurrentRunningMonth ? `PVGIS-Soll bis heute (Tag ${m.daysElapsed})` : 'PVGIS-Vergleichssoll'}</span>
                        <span class="text-sm sm:text-base font-black text-sky-700 dark:text-sky-300 mt-0.5 block">${fmt1(proRataSoll)} kWh</span>
                    </div>
                    <div class="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-white/10">
                        <span class="text-[10px] font-sans font-semibold text-slate-500 dark:text-slate-400 block">PVGIS Monats-Gesamtsoll</span>
                        <span class="text-sm sm:text-base font-black text-slate-700 dark:text-slate-200 mt-0.5 block">${fmt0(fullSoll)} kWh <span class="text-[11px] font-normal text-slate-400">(${fullReachPct.toFixed(0)}%)</span></span>
                    </div>
                </div>

                <!-- Progress Bar with Pro-Rata Marker -->
                <div class="space-y-1 pt-0.5">
                    <div class="relative w-full h-2.5 rounded-full bg-slate-200/90 dark:bg-slate-800 overflow-hidden">
                        <div class="h-full rounded-full ${barColor} transition-all duration-500" style="width: ${Math.min(100, Math.max(realVal > 0 ? 2 : 0, fullReachPct)).toFixed(1)}%"></div>
                        ${m.isCurrentRunningMonth ? `
                        <div class="absolute top-0 bottom-0 w-0.5 bg-sky-500 dark:bg-sky-300 z-10" style="left: ${proRataMarkerPct.toFixed(1)}%" title="Anteiliges PVGIS-Soll bis heute (${fmt1(proRataSoll)} kWh)"></div>
                        ` : ''}
                    </div>
                    <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        <span>0 kWh</span>
                        ${m.isCurrentRunningMonth ? `<span class="text-sky-600 dark:text-sky-300 font-semibold">▲ Heute Soll: ${fmt1(proRataSoll)} kWh</span>` : `<span>Erfüllungsgrad: ${m.perfIndexPct !== null ? m.perfIndexPct.toFixed(1).replace('.', ',') : '0,0'} %</span>`}
                        <span>Monatssoll: ${fmt0(fullSoll)} kWh</span>
                    </div>
                </div>
            </div>
        `;
    }

    // 3. Render Monthly Comparison Rows / Grid
    const listEl = document.getElementById('monthlyYieldSummaryList');
    if (listEl) {
        let monthsToRender = metrics.monthlyComparison;
        if (monthlyYieldSummaryFilter === 'recorded') {
            monthsToRender = metrics.monthlyComparison.filter(m => m.hasReal || m.isCurrentRunningMonth);
            if (monthsToRender.length === 0) {
                monthsToRender = metrics.monthlyComparison.slice(Math.max(0, curMonthIdx - 1), Math.min(12, curMonthIdx + 2));
            }
        }

        listEl.innerHTML = monthsToRender.map(m => {
            const hasReal = m.hasReal && m.realPv !== null;
            const realVal = hasReal ? m.realPv : 0;
            const compareSoll = m.effectiveSollKwh || m.sollKwh || 0;
            const fullSoll = m.sollKwh || 0;
            const devPct = hasReal && m.deviationPct !== null ? m.deviationPct : null;
            const devSign = devPct !== null && devPct >= 0 ? '+' : '';
            const diffKwh = hasReal && m.diffEffectiveKwh !== null ? m.diffEffectiveKwh : null;
            const diffSign = diffKwh !== null && diffKwh >= 0 ? '+' : '';

            // Bar width relative to effective target (capped at 100% visually)
            const barPct = hasReal && compareSoll > 0
                ? Math.min(100, Math.max(3, (realVal / compareSoll) * 100))
                : 0;

            let statusColor = 'text-slate-400 dark:text-slate-500';
            let barClass = 'bg-slate-300 dark:bg-slate-700';
            if (hasReal && devPct !== null) {
                if (devPct >= -2) {
                    statusColor = 'text-emerald-600 dark:text-emerald-400';
                    barClass = 'bg-emerald-500';
                } else if (devPct >= -12) {
                    statusColor = 'text-amber-600 dark:text-amber-400';
                    barClass = 'bg-amber-500';
                } else {
                    statusColor = 'text-rose-600 dark:text-rose-400';
                    barClass = 'bg-rose-500';
                }
            }

            const sourceTag = hasReal
                ? (m.isLiveCurrentMonth ? 'Live HA' : 'Logbuch')
                : (m.isCurrentRunningMonth ? `Tag ${m.daysElapsed}/${m.daysInMonth}` : 'Prognose');

            const sollDisplay = m.isCurrentRunningMonth
                ? `${Math.round(compareSoll).toLocaleString('de-DE')} kWh Soll bis heute (${Math.round(fullSoll).toLocaleString('de-DE')} Mon.)`
                : `${Math.round(fullSoll).toLocaleString('de-DE')} kWh PVGIS-Soll`;

            return `
            <div onclick="openAnalyseDrillDown('soll-ist')" role="button" tabindex="0"
                title="Tippen für detaillierten 12-Monats-Vergleich (${m.labelLong})"
                class="p-3.5 rounded-2xl bg-white/85 dark:bg-[#152228]/90 border ${m.isCurrentRunningMonth ? 'border-teal-500/45 dark:border-teal-400/40' : 'border-slate-200/80 dark:border-slate-700/60'} hover:border-teal-500/60 transition-all cursor-pointer flex flex-col justify-between gap-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">${m.labelLong}</span>
                        <span class="text-[11px] text-slate-400 dark:text-slate-400 shrink-0">· ${sourceTag}</span>
                    </div>
                    <span class="text-xs sm:text-sm font-mono tabular-nums font-black ${statusColor} shrink-0">
                        ${devPct !== null ? `${devSign}${devPct.toFixed(1).replace('.', ',')} %` : 'Offen'}
                    </span>
                </div>

                <div class="w-full h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                    <div class="h-full rounded-full ${barClass} transition-all duration-500" style="width: ${barPct.toFixed(1)}%"></div>
                </div>

                <div class="flex items-baseline justify-between gap-2 text-[11px] font-mono tabular-nums">
                    <div class="truncate">
                        <span class="font-extrabold text-slate-900 dark:text-white">${hasReal ? `${Math.round(realVal).toLocaleString('de-DE')} kWh` : '— kWh'}</span>
                        <span class="text-slate-500 dark:text-slate-400"> / ${sollDisplay}</span>
                    </div>
                    <span class="font-bold ${statusColor} shrink-0">
                        ${diffKwh !== null ? `${diffSign}${Math.round(diffKwh).toLocaleString('de-DE')} kWh` : ''}
                    </span>
                </div>
            </div>`;
        }).join('');
    }
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
    setElText('hub_card_soll_ist_sub', `${perfSign}${perfDelta} % Abweichung (${metrics.overallPerfIndexPct.toFixed(1)} % PR) · ${Math.round(metrics.realPvSum).toLocaleString('de-DE')} / ${Math.round(metrics.sollPvForRecordedMonths).toLocaleString('de-DE')} kWh`);
    setElText('hub_card_autarkie_sub', `${metrics.realAutarkyPct.toFixed(1)} % Autarkie · ${metrics.realEigenQuotaPct.toFixed(1)} % Eigenverbrauch · ${baseline.totalBatteryKwh > 0 ? metrics.batFullCycles.toFixed(0) + ' Zyklen' : 'Ohne Speicher'}`);
    setElText('hub_card_amort_sub', `${Math.round(metrics.recordedTotalEur).toLocaleString('de-DE')} € gespart · ROI ${metrics.realAmortYears.toFixed(1)} J. (Plan: ${metrics.plannedAmortYears.toFixed(1)} J.)`);
    setElText('hub_card_logbuch_sub', `${metrics.recordedMonthsCount} von 12 Monaten für ${selectedAnalysisYear} erfasst · HA-Sync & CSV`);

    // Render Monthly Yield Summary Card directly on Level 1 Hub
    renderMonthlyYieldSummaryCard(baseline, metrics);

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

function selectSankeyFlow(flowId) {
    if (selectedSankeyFlow === flowId) {
        selectedSankeyFlow = null;
    } else {
        selectedSankeyFlow = flowId;
    }
    const baseline = getPlannedSystemBaseline();
    const metrics = computeAggregatedPerformanceMetrics(baseline);
    renderSankeyDiagram(currentSankeyHorizon, baseline, metrics);
}
if (typeof window !== 'undefined') {
    window.selectSankeyFlow = selectSankeyFlow;
}

function computeSankeyFlowData(horizon, baseline, metrics) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    if (!metrics) metrics = computeAggregatedPerformanceMetrics(baseline);

    const ledger = getUnifiedEnergyLedger(baseline);
    const hasBattery = ledger.hasBattery;
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
        pvTotal = ledger.today.pvTotal;
        gridImp = ledger.today.gridImp;
        gridExp = ledger.today.gridExp;
        batChg = ledger.today.batChg;
        batDis = ledger.today.batDis;
        pvDirect = ledger.today.pvDirect;
        batLoss = ledger.today.batLoss;
        houseTotal = ledger.today.houseTotal;
        periodLabel = 'Heute · Live-Zähler & Watt-Integral (Single Source)';
    } else if (horizon === 'month') {
        decimals = 1;
        const curMonthIdx = new Date().getMonth();
        const curYear = new Date().getFullYear();
        const isCurrentYear = (selectedAnalysisYear === curYear);

        let mRec = metrics.monthlyComparison[curMonthIdx];
        if (!mRec || !mRec.hasReal) {
            const recordedList = metrics.monthlyComparison.filter(m => m.hasReal);
            if (recordedList.length > 0) {
                mRec = recordedList[recordedList.length - 1];
            }
        }

        if (isCurrentYear && ledger.month.hasLiveData) {
            // Single Source of Truth: fuse Live Month Ledger + Logbook + Today floor
            pvTotal = +Math.max(ledger.month.pvTotal, mRec?.hasReal ? (mRec.realPv || 0) : 0, ledger.today.pvTotal).toFixed(1);
            gridExp = +Math.max(ledger.month.gridExp, mRec?.hasReal ? (mRec.expKwh || 0) : 0, ledger.today.gridExp).toFixed(1);
            gridImp = +Math.max(ledger.month.gridImp, mRec?.hasReal ? (mRec.impKwh || 0) : 0, ledger.today.gridImp).toFixed(1);
            batChg = hasBattery ? +Math.min(pvTotal, Math.max(ledger.month.batChg, mRec?.hasReal ? (mRec.bChg || 0) : 0, ledger.today.batChg)).toFixed(1) : 0;
            batDis = hasBattery ? +Math.max(ledger.month.batDis, mRec?.hasReal ? (mRec.bDis || 0) : 0, ledger.today.batDis).toFixed(1) : 0;
            gridExp = +Math.min(Math.max(0, pvTotal - batChg), gridExp).toFixed(1);
            pvDirect = +Math.max(0, pvTotal - gridExp - batChg).toFixed(1);
            batLoss = +Math.max(0, batChg - batDis).toFixed(1);
            houseTotal = +Math.max(0.1, pvDirect + batDis + gridImp, ledger.today.houseTotal).toFixed(1);
            periodLabel = `Monat: ${MONTH_LABELS_LONG[curMonthIdx]} ${selectedAnalysisYear} (Live HA & Logbuch)`;
        } else if (mRec && mRec.hasReal && mRec.realPv > 0) {
            pvTotal = +Math.max(0.5, mRec.realPv).toFixed(1);
            gridExp = +Math.max(0, mRec.expKwh).toFixed(1);
            gridImp = +Math.max(0, mRec.impKwh).toFixed(1);
            batChg = +Math.max(0, mRec.bChg).toFixed(1);
            batDis = +Math.max(0, mRec.bDis).toFixed(1);
            pvDirect = +Math.max(0, pvTotal - gridExp - batChg).toFixed(1);
            batLoss = +Math.max(0, batChg - batDis).toFixed(1);
            houseTotal = +Math.max(0.5, pvDirect + batDis + gridImp).toFixed(1);
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
        if (metrics.realPvSum > 0 || ledger.month.hasLiveData) {
            pvTotal = Math.round(Math.max(1, metrics.realPvSum, ledger.month.pvTotal, ledger.today.pvTotal));
            gridExp = Math.round(Math.max(0, metrics.gridExportSum, ledger.month.gridExp, ledger.today.gridExp));
            gridImp = Math.round(Math.max(0, metrics.gridImportSum, ledger.month.gridImp, ledger.today.gridImp));
            batChg = hasBattery ? Math.round(Math.min(pvTotal, Math.max(0, metrics.batChargedSum, ledger.month.batChg, ledger.today.batChg))) : 0;
            batDis = hasBattery ? Math.round(Math.max(0, metrics.batDischargedSum, ledger.month.batDis, ledger.today.batDis)) : 0;
            gridExp = Math.min(Math.max(0, pvTotal - batChg), gridExp);
            pvDirect = Math.max(0, pvTotal - gridExp - batChg);
            batLoss = Math.max(0, batChg - batDis);
            houseTotal = Math.max(1, pvDirect + batDis + gridImp);
            periodLabel = `Gesamtjahr ${selectedAnalysisYear} (${Math.max(1, metrics.recordedMonthsCount)}/12 Mon. erfasst)`;
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
        batEffPct,
        gridPriceEur: baseline.gridPriceEur,
        eegRateEur: baseline.eegRateEur
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

    const isDark = document.documentElement.classList.contains('dark');
    const totalEnergyThroughput = Math.max(0.1, d.pvTotal + d.gridImp);

    // Proportional ribbon stroke widths (clamped between 4px and 28px for clean full-width layout)
    const calcStroke = (val) => {
        if (val <= 0.005) return 2;
        return Math.max(4, Math.min(28, Math.round((val / totalEnergyThroughput) * 56)));
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

    const rawBatName = (haConfigState.batteryName || 'Speicher').trim();
    const shortBatName = rawBatName.length > 14 ? rawBatName.slice(0, 13) + '…' : rawBatName;
    const batName = typeof escapeHtml === 'function' ? escapeHtml(shortBatName) : shortBatName;

    // Selection opacity helpers: if a flow/node is selected, dim others
    const sel = selectedSankeyFlow;
    const isFlowActive = (flowKey) => {
        if (!sel) return true;
        if (sel === flowKey) return true;
        if (sel === 'node_pv' && (flowKey === 'pv_direct' || flowKey === 'pv_bat' || flowKey === 'pv_exp')) return true;
        if (sel === 'node_grid_imp' && flowKey === 'grid_house') return true;
        if (sel === 'node_direct' && (flowKey === 'pv_direct' || flowKey === 'direct_house')) return true;
        if (sel === 'node_bat' && (flowKey === 'pv_bat' || flowKey === 'bat_house')) return true;
        if (sel === 'node_house' && (flowKey === 'direct_house' || flowKey === 'bat_house' || flowKey === 'grid_house')) return true;
        if (sel === 'node_grid_exp' && flowKey === 'pv_exp') return true;
        return false;
    };

    const getFlowOpacity = (flowKey) => isFlowActive(flowKey) ? 0.92 : 0.14;
    const getFlowFilter = (flowKey) => (sel && isFlowActive(flowKey)) ? 'filter="url(#glowFilter)"' : '';

    // Theme-aware node surface & typography palette
    const pal = isDark ? {
        pvBg: '#0f252c', pvTitle: '#5eead4',
        gridBg: '#102136', gridTitle: '#93c5fd', gridSub: '#60a5fa',
        dirBg: '#0f2822', dirTitle: '#6ee7b7', dirSub: '#a7f3d0',
        batBg: '#201630', batTitle: '#d8b4fe', batSub: '#c084fc',
        houseBg: '#281e11', houseTitle: '#fcd34d', houseSub: '#fde68a',
        expBg: '#0e242d', expTitle: '#67e8f9', expSub: '#22d3ee',
        valText: '#ffffff', mutedText: '#94a3b8', detailText: '#cbd5e1',
        divider: '#334155', pillBg: '#0b151a'
    } : {
        pvBg: '#f0fdfa', pvTitle: '#0f766e',
        gridBg: '#eff6ff', gridTitle: '#1d4ed8', gridSub: '#2563eb',
        dirBg: '#ecfdf5', dirTitle: '#047857', dirSub: '#059669',
        batBg: '#faf5ff', batTitle: '#7e22ce', batSub: '#9333ea',
        houseBg: '#fffbeb', houseTitle: '#b45309', houseSub: '#d97706',
        expBg: '#ecfeff', expTitle: '#0e7490', expSub: '#0891b2',
        valText: '#0f172a', mutedText: '#64748b', detailText: '#334155',
        divider: '#cbd5e1', pillBg: '#ffffff'
    };

    // Full-width 3-column Sankey layout (viewBox 0 0 540 314) - fits 100% on mobile without horizontal scrolling
    // Col 1: x=6..148 (w=142) | Gap 1: x=148..198 (50px) | Col 2: x=198..342 (w=144) | Gap 2: x=342..392 (50px) | Col 3: x=392..534 (w=142)
    container.innerHTML = `
    <svg viewBox="0 0 540 314" class="w-full h-auto block select-none" role="img" aria-label="Interaktives Sankey Energiefluss-Diagramm">
        <defs>
            <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="sankeyGradPvDirect" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.78" />
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.85" />
            </linearGradient>
            <linearGradient id="sankeyGradPvBat" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.75" />
                <stop offset="100%" stop-color="#a855f7" stop-opacity="0.82" />
            </linearGradient>
            <linearGradient id="sankeyGradPvExport" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.68" />
                <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.82" />
            </linearGradient>
            <linearGradient id="sankeyGradDirectHouse" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.85" />
                <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.85" />
            </linearGradient>
            <linearGradient id="sankeyGradBatHouse" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#a855f7" stop-opacity="0.82" />
                <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.85" />
            </linearGradient>
            <linearGradient id="sankeyGradGridHouse" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.78" />
                <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.82" />
            </linearGradient>
        </defs>

        <!-- FLOW RIBBONS (Rendered underneath nodes so paths never obscure card text) -->
        <!-- 1. PV -> PV-Direkt -->
        <path d="M 148 48 C 173 48, 173 56, 198 56"
            fill="none" stroke="url(#sankeyGradPvDirect)" stroke-width="${swPvToDirect}" stroke-linecap="butt"
            opacity="${getFlowOpacity('pv_direct')}" ${getFlowFilter('pv_direct')}
            class="transition-all duration-300 cursor-pointer hover:opacity-100"
            onclick="selectSankeyFlow('pv_direct')">
            <title>PV-Direktfluss: ${fmt(d.pvDirect)} kWh (${pvShareDirectPct}%)</title>
        </path>

        <!-- 2. PV -> Batteriespeicher (Ladung) -->
        ${d.batChg > 0 ? `
        <path d="M 148 92 C 174 92, 174 172, 198 172"
            fill="none" stroke="url(#sankeyGradPvBat)" stroke-width="${swPvToBat}" stroke-linecap="butt"
            opacity="${getFlowOpacity('pv_bat')}" ${getFlowFilter('pv_bat')}
            class="transition-all duration-300 cursor-pointer hover:opacity-100"
            onclick="selectSankeyFlow('pv_bat')">
            <title>Batterie-Ladung: ${fmt(d.batChg)} kWh (${pvShareBatPct}%)</title>
        </path>
        ` : ''}

        <!-- 3. PV -> Netzeinspeisung (routed cleanly beneath the middle battery card at y=282) -->
        ${d.gridExp > 0 ? `
        <path d="M 148 134 C 185 282, 345 282, 392 256"
            fill="none" stroke="url(#sankeyGradPvExport)" stroke-width="${swPvToGridExp}" stroke-linecap="butt"
            opacity="${getFlowOpacity('pv_exp')}" ${getFlowFilter('pv_exp')}
            class="transition-all duration-300 cursor-pointer hover:opacity-100"
            onclick="selectSankeyFlow('pv_exp')">
            <title>Netzeinspeisung: ${fmt(d.gridExp)} kWh (${pvShareExpPct}%)</title>
        </path>
        ` : ''}

        <!-- 4. PV-Direkt -> Hausverbrauch -->
        <path d="M 342 56 C 367 56, 367 52, 392 52"
            fill="none" stroke="url(#sankeyGradDirectHouse)" stroke-width="${swDirectToHouse}" stroke-linecap="butt"
            opacity="${getFlowOpacity('direct_house')}" ${getFlowFilter('direct_house')}
            class="transition-all duration-300 cursor-pointer hover:opacity-100"
            onclick="selectSankeyFlow('direct_house')">
            <title>Direktverbrauch im Haus: ${fmt(d.pvDirect)} kWh (${houseShareDirectPct}%)</title>
        </path>

        <!-- 5. Batteriespeicher (Entladung) -> Hausverbrauch -->
        ${d.batDis > 0 ? `
        <path d="M 342 172 C 368 172, 368 102, 392 102"
            fill="none" stroke="url(#sankeyGradBatHouse)" stroke-width="${swBatToHouse}" stroke-linecap="butt"
            opacity="${getFlowOpacity('bat_house')}" ${getFlowFilter('bat_house')}
            class="transition-all duration-300 cursor-pointer hover:opacity-100"
            onclick="selectSankeyFlow('bat_house')">
            <title>Speicherentladung ins Haus: ${fmt(d.batDis)} kWh (${houseShareBatPct}%)</title>
        </path>
        ` : ''}

        <!-- 6. Netzbezug -> Hausverbrauch (routed cleanly below middle column then up to House card) -->
        ${d.gridImp > 0 ? `
        <path d="M 148 242 C 250 264, 355 248, 392 148"
            fill="none" stroke="url(#sankeyGradGridHouse)" stroke-width="${swGridToHouse}" stroke-linecap="butt"
            opacity="${getFlowOpacity('grid_house')}" ${getFlowFilter('grid_house')}
            class="transition-all duration-300 cursor-pointer hover:opacity-100"
            onclick="selectSankeyFlow('grid_house')">
            <title>Netzbezug für Restlast: ${fmt(d.gridImp)} kWh (${houseShareGridPct}%)</title>
        </path>
        ` : ''}

        <!-- LEFT COLUMN NODES (SOURCES: x=6, width=142) -->
        <!-- Node 1: PV-Erzeugung -->
        <g transform="translate(6, 12)" class="cursor-pointer" onclick="selectSankeyFlow('node_pv')">
            <rect width="142" height="148" rx="14" fill="${pal.pvBg}" stroke="#14b8a6" stroke-width="${sel === 'node_pv' ? 2.5 : 1.5}" />
            <rect x="0" y="0" width="5" height="148" rx="2.5" fill="#14b8a6" />
            <text x="12" y="22" fill="${pal.pvTitle}" font-size="9.5" font-weight="800" letter-spacing="0.04em">PV-ERZEUGUNG</text>
            <text x="12" y="47" fill="${pal.valText}" font-size="17" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.pvTotal)} kWh</text>
            <text x="12" y="65" fill="${pal.mutedText}" font-size="9.5" font-weight="600">Eigenquote: ${d.eigenQuotaPct.toFixed(1)} %</text>
            <line x1="12" y1="76" x2="132" y2="76" stroke="${pal.divider}" stroke-opacity="0.6" />
            <text x="12" y="94" fill="${pal.detailText}" font-size="9" font-family="JetBrains Mono, monospace">→ Direkt: ${fmt(d.pvDirect)} kWh</text>
            <text x="12" y="111" fill="${pal.detailText}" font-size="9" font-family="JetBrains Mono, monospace">→ Akku:   ${fmt(d.batChg)} kWh</text>
            <text x="12" y="128" fill="${pal.detailText}" font-size="9" font-family="JetBrains Mono, monospace">→ Export: ${fmt(d.gridExp)} kWh</text>
        </g>

        <!-- Node 2: Netzbezug -->
        <g transform="translate(6, 178)" class="cursor-pointer" onclick="selectSankeyFlow('node_grid_imp')">
            <rect width="142" height="112" rx="14" fill="${pal.gridBg}" stroke="#3b82f6" stroke-width="${sel === 'node_grid_imp' ? 2.5 : 1.5}" />
            <rect x="0" y="0" width="5" height="112" rx="2.5" fill="#3b82f6" />
            <text x="12" y="22" fill="${pal.gridTitle}" font-size="9.5" font-weight="800" letter-spacing="0.04em">NETZBEZUG</text>
            <text x="12" y="47" fill="${pal.valText}" font-size="17" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.gridImp)} kWh</text>
            <text x="12" y="67" fill="${pal.mutedText}" font-size="9.5" font-weight="600">${houseShareGridPct} % des Hausbedarfs</text>
            <text x="12" y="88" fill="${pal.gridSub}" font-size="9" font-family="JetBrains Mono, monospace">Restbedarf Stromnetz</text>
        </g>

        <!-- MIDDLE COLUMN NODES (DIRECT & BATTERY: x=198, width=144) -->
        <!-- Node 3: PV-Direktverbrauch -->
        <g transform="translate(198, 12)" class="cursor-pointer" onclick="selectSankeyFlow('node_direct')">
            <rect width="144" height="94" rx="14" fill="${pal.dirBg}" stroke="#10b981" stroke-width="${sel === 'node_direct' ? 2.5 : 1.5}" />
            <rect x="0" y="0" width="5" height="94" rx="2.5" fill="#10b981" />
            <text x="12" y="22" fill="${pal.dirTitle}" font-size="9.5" font-weight="800" letter-spacing="0.04em">PV-DIREKT</text>
            <text x="12" y="47" fill="${pal.valText}" font-size="17" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.pvDirect)} kWh</text>
            <text x="12" y="66" fill="${pal.dirSub}" font-size="9.5" font-weight="600">${pvShareDirectPct}% PV · ${houseShareDirectPct}% im Haus</text>
            <text x="12" y="82" fill="${pal.mutedText}" font-size="8.5" font-family="JetBrains Mono, monospace">Sofort-Eigenverbrauch</text>
        </g>

        <!-- Node 4: Batteriespeicher -->
        <g transform="translate(198, 120)" class="cursor-pointer" onclick="selectSankeyFlow('node_bat')">
            <rect width="144" height="118" rx="14" fill="${pal.batBg}" stroke="#a855f7" stroke-width="${sel === 'node_bat' ? 2.5 : 1.5}" />
            <rect x="0" y="0" width="5" height="118" rx="2.5" fill="#a855f7" />
            <text x="12" y="22" fill="${pal.batTitle}" font-size="9.5" font-weight="800" letter-spacing="0.04em">${batName.toUpperCase()}</text>
            <text x="12" y="46" fill="${pal.valText}" font-size="17" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.batDis)} kWh</text>
            <text x="12" y="64" fill="${pal.detailText}" font-size="9" font-family="JetBrains Mono, monospace">Ladung: ${fmt(d.batChg)} kWh</text>
            <text x="12" y="81" fill="${pal.batSub}" font-size="9.5" font-weight="600">Deckt ${houseShareBatPct} % im Haus</text>
            <text x="12" y="99" fill="${pal.mutedText}" font-size="8.5" font-family="JetBrains Mono, monospace">η ≈ ${d.batEffPct.toFixed(0)}% (Verlust: ${fmt(d.batLoss)})</text>
        </g>

        <!-- RIGHT COLUMN NODES (SINKS: x=392, width=142) -->
        <!-- Node 5: Hausverbrauch Gesamt -->
        <g transform="translate(392, 12)" class="cursor-pointer" onclick="selectSankeyFlow('node_house')">
            <rect width="142" height="162" rx="14" fill="${pal.houseBg}" stroke="#f59e0b" stroke-width="${sel === 'node_house' ? 2.5 : 1.5}" />
            <rect x="137" y="0" width="5" height="162" rx="2.5" fill="#f59e0b" />
            <text x="12" y="22" fill="${pal.houseTitle}" font-size="9.5" font-weight="800" letter-spacing="0.04em">HAUSVERBRAUCH</text>
            <text x="12" y="47" fill="${pal.valText}" font-size="17" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.houseTotal)} kWh</text>
            <text x="12" y="65" fill="${pal.houseSub}" font-size="9.5" font-weight="700">Autarkie: ${d.autarkyPct.toFixed(1)} %</text>
            <line x1="12" y1="76" x2="128" y2="76" stroke="${pal.divider}" stroke-opacity="0.6" />
            <text x="12" y="95" fill="${pal.dirTitle}" font-size="9" font-family="JetBrains Mono, monospace">● Direkt: ${houseShareDirectPct}% (${fmt(d.pvDirect)})</text>
            <text x="12" y="113" fill="${pal.batTitle}" font-size="9" font-family="JetBrains Mono, monospace">● Akku:   ${houseShareBatPct}% (${fmt(d.batDis)})</text>
            <text x="12" y="131" fill="${pal.gridTitle}" font-size="9" font-family="JetBrains Mono, monospace">● Netz:   ${houseShareGridPct}% (${fmt(d.gridImp)})</text>
        </g>

        <!-- Node 6: Netzeinspeisung -->
        <g transform="translate(392, 190)" class="cursor-pointer" onclick="selectSankeyFlow('node_grid_exp')">
            <rect width="142" height="100" rx="14" fill="${pal.expBg}" stroke="#06b6d4" stroke-width="${sel === 'node_grid_exp' ? 2.5 : 1.5}" />
            <rect x="137" y="0" width="5" height="100" rx="2.5" fill="#06b6d4" />
            <text x="12" y="22" fill="${pal.expTitle}" font-size="9.5" font-weight="800" letter-spacing="0.04em">EINSPEISUNG</text>
            <text x="12" y="47" fill="${pal.valText}" font-size="17" font-weight="900" font-family="JetBrains Mono, monospace">${fmt(d.gridExp)} kWh</text>
            <text x="12" y="67" fill="${pal.mutedText}" font-size="9.5" font-weight="600">${pvShareExpPct} % der PV-Erzeugung</text>
            <text x="12" y="85" fill="${pal.expSub}" font-size="9" font-family="JetBrains Mono, monospace">EEG-Überschuss Netz</text>
        </g>

        <!-- NON-OVERLAPPING BOTTOM EXPORT BADGE (Placed in clear bottom lane y=286 below Battery card) -->
        ${d.gridExp > 0 ? `
        <g transform="translate(270, 286)" class="cursor-pointer" onclick="selectSankeyFlow('pv_exp')">
            <rect x="-54" y="-10" width="108" height="18" rx="9" fill="${pal.pillBg}" fill-opacity="0.92" stroke="#06b6d4" stroke-opacity="${isFlowActive('pv_exp') ? 0.9 : 0.35}" />
            <text x="0" y="2.5" text-anchor="middle" fill="${pal.expTitle}" font-size="8.5" font-weight="700" font-family="JetBrains Mono, monospace">Export: ${fmt(d.gridExp)} kWh (${pvShareExpPct}%)</text>
        </g>` : ''}
    </svg>`;

    // 2. Render Interactive Detail Callout Card or Quick-Filter Pills
    let flowDetailHtml = '';
    if (sel) {
        let title = '';
        let icon = '';
        let kwhVal = 0;
        let subText = '';
        let eurText = '';
        let badgeColor = '';

        if (sel === 'pv_direct' || sel === 'direct_house' || sel === 'node_direct') {
            title = 'PV-Direktverbrauch im Haus';
            icon = 'wb_sunny';
            kwhVal = d.pvDirect;
            const savedEur = (kwhVal * d.gridPriceEur).toFixed(2);
            subText = `${pvShareDirectPct} % der PV-Erzeugung · Deckt ${houseShareDirectPct} % des Hausverbrauchs sofort`;
            eurText = `+${savedEur} € vermiedener Netzstrom-Zukauf (bei ${d.gridPriceEur.toFixed(2)} €/kWh)`;
            badgeColor = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        } else if (sel === 'pv_bat') {
            title = 'Solar-Ladung in den Batteriespeicher';
            icon = 'battery_charging_full';
            kwhVal = d.batChg;
            subText = `${pvShareBatPct} % der PV-Erzeugung zwischengespeichert für Nacht & Dämmerung`;
            eurText = `Zwischengespeichert: ${fmt(d.batDis)} kWh nutzbar nach Wirkungsgrad (ca. ${d.batEffPct.toFixed(0)}%)`;
            badgeColor = 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300';
        } else if (sel === 'bat_house' || sel === 'node_bat') {
            title = 'Batterie-Entladung ins Hausnetz';
            icon = 'battery_charging_full';
            kwhVal = d.batDis;
            const savedEur = (kwhVal * d.gridPriceEur).toFixed(2);
            subText = `Deckt ${houseShareBatPct} % des gesamten Hausverbrauchs aus Speicher`;
            eurText = `+${savedEur} € gespart durch Nacht-Eigenstrom`;
            badgeColor = 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300';
        } else if (sel === 'pv_exp' || sel === 'node_grid_exp') {
            title = 'Netzeinspeisung (EEG-Überschuss)';
            icon = 'upload';
            kwhVal = d.gridExp;
            const revEur = (kwhVal * d.eegRateEur).toFixed(2);
            subText = `${pvShareExpPct} % der PV-Erzeugung über den Eigenbedarf hinaus eingespeist`;
            eurText = `+${revEur} € EEG-Einspeisevergütung (bei ${(d.eegRateEur * 100).toFixed(1)} ct/kWh)`;
            badgeColor = 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
        } else if (sel === 'grid_house' || sel === 'node_grid_imp') {
            title = 'Netzbezug für ungedeckte Resthauslast';
            icon = 'power';
            kwhVal = d.gridImp;
            const costEur = (kwhVal * d.gridPriceEur).toFixed(2);
            subText = `${houseShareGridPct} % des Hausbedarfs mussten konventionell zugekauft werden`;
            eurText = `Stromkosten: ${costEur} € (bei ${d.gridPriceEur.toFixed(2)} €/kWh)`;
            badgeColor = 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300';
        } else if (sel === 'node_pv') {
            title = 'PV-Generator Gesamt';
            icon = 'solar_power';
            kwhVal = d.pvTotal;
            subText = `Eigenverbrauchsquote: ${d.eigenQuotaPct.toFixed(1)} % (${fmt(d.pvDirect + d.batChg)} kWh vor Ort genutzt)`;
            eurText = `Direkt: ${fmt(d.pvDirect)} kWh · Akku: ${fmt(d.batChg)} kWh · Einspeisung: ${fmt(d.gridExp)} kWh`;
            badgeColor = 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300';
        } else if (sel === 'node_house') {
            title = 'Hausverbrauch Gesamt';
            icon = 'home';
            kwhVal = d.houseTotal;
            subText = `Autarkiegrad: ${d.autarkyPct.toFixed(1)} % durch PV + Batterie`;
            eurText = `PV: ${houseShareDirectPct}% · Akku: ${houseShareBatPct}% · Netz: ${houseShareGridPct}%`;
            badgeColor = 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        }

        flowDetailHtml = `
            <div class="col-span-full p-3.5 rounded-2xl border ${badgeColor} backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn overflow-hidden">
                <div class="flex items-start sm:items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-xl bg-current/10 flex items-center justify-center shrink-0">
                        <span class="material-symbols-rounded text-xl leading-none select-none" aria-hidden="true">${icon}</span>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xs font-black uppercase tracking-wider">${title}</span>
                            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-current/15 font-bold whitespace-nowrap">${fmt(kwhVal)} kWh</span>
                        </div>
                        <p class="text-[11px] opacity-90 mt-0.5 leading-snug">${subText}</p>
                        <p class="text-[11px] font-semibold mt-0.5 leading-snug">${eurText}</p>
                    </div>
                </div>
                <button type="button" onclick="selectSankeyFlow(null)" class="px-3 py-1.5 rounded-xl bg-current/15 hover:bg-current/25 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-center shrink-0">
                    <span class="material-symbols-rounded text-sm leading-none" aria-hidden="true">filter_alt_off</span>
                    <span>Alle Flüsse anzeigen</span>
                </button>
            </div>
        `;
    }

    // 3. Render Summary Ribbon Below Sankey (4 cards in a clean 2x2 mobile / 4-col desktop grid)
    const ribbon = document.getElementById('sankeySummaryRibbon');
    if (ribbon) {
        ribbon.innerHTML = `
            ${flowDetailHtml}
            <div class="p-2.5 rounded-xl bg-white/80 dark:bg-[#13232b]/85 border border-slate-200/80 dark:border-teal-500/20">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Zeitraum</span>
                <span class="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate block mt-0.5" title="${d.periodLabel}">${d.periodLabel}</span>
            </div>
            <div class="p-2.5 rounded-xl bg-white/80 dark:bg-[#13232b]/85 border border-slate-200/80 dark:border-teal-500/20 cursor-pointer hover:border-emerald-500/40 transition-all" onclick="selectSankeyFlow('node_house')">
                <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">Autarkiequote</span>
                <span class="text-sm font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 block mt-0.5">${d.autarkyPct.toFixed(1)} %</span>
            </div>
            <div class="p-2.5 rounded-xl bg-white/80 dark:bg-[#13232b]/85 border border-slate-200/80 dark:border-teal-500/20 cursor-pointer hover:border-teal-500/40 transition-all" onclick="selectSankeyFlow('node_pv')">
                <span class="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 block">Eigenverbrauch</span>
                <span class="text-sm font-black font-mono tabular-nums text-teal-600 dark:text-teal-400 block mt-0.5">${d.eigenQuotaPct.toFixed(1)} %</span>
            </div>
            <div class="p-2.5 rounded-xl bg-white/80 dark:bg-[#13232b]/85 border border-slate-200/80 dark:border-teal-500/20 cursor-pointer hover:border-purple-500/40 transition-all" onclick="selectSankeyFlow('pv_direct')">
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
            const compareSoll = m.effectiveSollKwh || m.sollKwh || 0;
            const diffKwh = m.hasReal ? Math.round(m.realPv - compareSoll) : null;
            const diffSign = diffKwh !== null && diffKwh >= 0 ? '+' : '';
            const devPct = m.hasReal && m.deviationPct !== null ? m.deviationPct : null;
            const devSign = devPct !== null && devPct >= 0 ? '+' : '';
            const statusColor = !m.hasReal
                ? 'text-slate-400'
                : (devPct >= -2 ? 'text-emerald-600 dark:text-emerald-400' : (devPct >= -12 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'));

            const sourceHint = m.hasReal ? (m.isLiveCurrentMonth ? ' · Live HA' : ' · Logbuch') : '';

            return `
            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-[#152228] border ${m.isCurrentRunningMonth ? 'border-teal-500/40' : 'border-slate-200/80 dark:border-slate-700/60'} flex flex-col justify-between">
                <div class="flex items-center justify-between text-xs">
                    <span class="font-bold text-slate-700 dark:text-slate-200 truncate">${m.labelLong}${sourceHint}</span>
                    <span class="font-mono tabular-nums font-bold ${statusColor} shrink-0">${devPct !== null ? `${devSign}${devPct.toFixed(1).replace('.', ',')} %` : 'Offen'}</span>
                </div>
                <div class="mt-2 flex items-baseline justify-between font-mono tabular-nums">
                    <div>
                        <span class="text-[10px] text-slate-400 block">${m.isCurrentRunningMonth ? `Ist / Soll (Tag ${m.daysElapsed})` : 'Ist / Soll'}</span>
                        <span class="text-xs font-extrabold text-slate-900 dark:text-white">${m.hasReal ? Math.round(m.realPv) : '—'}</span>
                        <span class="text-[11px] text-slate-400"> / ${Math.round(compareSoll)} kWh</span>
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
        const isLive = m.isLiveCurrentMonth;
        const pvVal = raw.pvYieldKwh !== null && raw.pvYieldKwh !== undefined ? raw.pvYieldKwh : (isLive ? Math.round(m.realPv || 0) : '');
        const expVal = raw.gridExportKwh !== null && raw.gridExportKwh !== undefined ? raw.gridExportKwh : (isLive ? Math.round(m.expKwh || 0) : '');
        const impVal = raw.gridImportKwh !== null && raw.gridImportKwh !== undefined ? raw.gridImportKwh : (isLive ? Math.round(m.impKwh || 0) : '');
        const bChgVal = raw.batteryChargedKwh !== null && raw.batteryChargedKwh !== undefined ? raw.batteryChargedKwh : (isLive ? Math.round(m.bChg || 0) : '');
        const bDisVal = raw.batteryDischargedKwh !== null && raw.batteryDischargedKwh !== undefined ? raw.batteryDischargedKwh : (isLive ? Math.round(m.bDis || 0) : '');

        const perfStr = m.hasReal && m.perfIndexPct !== null ? `${m.perfIndexPct.toFixed(0)} %` : '—';
        const perfCls = !m.hasReal ? 'text-slate-400' : (m.perfIndexPct >= 100 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold');

        return `
        <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
            <td class="py-2.5 px-3 font-bold text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                ${m.labelLong}
                ${isLive ? '<span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-teal-500/15 text-teal-600 dark:text-teal-400 font-bold">Live HA</span>' : ''}
            </td>
            <td class="py-2.5 px-3 font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 text-right">${Math.round(m.sollKwh)} kWh</td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${pvVal}" placeholder="${isLive ? 'Live HA' : 'kWh'}"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'pvYieldKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border ${isLive ? 'border-teal-500/50 bg-teal-500/5' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950'} text-slate-900 dark:text-white focus:border-teal-500 outline-none">
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

async function syncCurrentMonthFromLiveTelemetry(showToast = true) {
    const curMonth = new Date().getMonth();
    const months = getCurrentYearMonthsData(selectedAnalysisYear);
    if (!months[curMonth]) return;

    // First pull Long-Term Statistics from HA via WebSocket so past months & 1st-of-month baselines are complete
    await syncLongTermStatisticsFromHa(haConfigState, null, false);

    const baseline = getPlannedSystemBaseline();
    const ledger = getUnifiedEnergyLedger(baseline);

    if (ledger.month.hasLiveData) {
        months[curMonth].pvYieldKwh = +ledger.month.pvTotal.toFixed(1);
        months[curMonth].gridExportKwh = +ledger.month.gridExp.toFixed(1);
        months[curMonth].gridImportKwh = +ledger.month.gridImp.toFixed(1);
        months[curMonth].batteryChargedKwh = +ledger.month.batChg.toFixed(1);
        months[curMonth].batteryDischargedKwh = +ledger.month.batDis.toFixed(1);
        months[curMonth].source = 'ha';
    }

    savePerformanceRecordsLocalAndServer();
    renderAnalysisSection();
    if (showToast && typeof showToastNotification === 'function') {
        showToastNotification(`Monats- & Jahreswerte aus HA Langzeit-Statistik & Single-Source-Zählern synchronisiert!`, 'success');
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

function renderHaUnifiedSensorMatrix() {
    const box = document.getElementById('haUnifiedSensorMatrixContainer');
    if (!box) return;

    const ent = haConfigState.entities || {};
    const ledger = getUnifiedEnergyLedger();
    const fmt = (v, d = 2) => Number(v || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

    const channels = [
        {
            name: 'PV-Erzeugung',
            wattEnt: ent.pvPower || (Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.some(s => s.powerEntity) ? 'PV-Strings (DC)' : ''),
            kwhEnt: ent.pvEnergyToday || ent.pvEnergyMonth || '',
            todayVal: ledger.today.pvTotal,
            monthVal: ledger.month.pvTotal
        },
        {
            name: 'Hausverbrauch',
            wattEnt: ent.loadPower || '',
            kwhEnt: ent.loadEnergyMonth || '',
            todayVal: ledger.today.houseTotal,
            monthVal: ledger.month.houseTotal
        },
        {
            name: 'Netzbezug (Import)',
            wattEnt: ent.gridImportPower || ent.gridPower || '',
            kwhEnt: ent.gridImportMonth || '',
            todayVal: ledger.today.gridImp,
            monthVal: ledger.month.gridImp
        },
        {
            name: 'Netzeinspeisung',
            wattEnt: ent.gridExportPower || ent.gridPower || '',
            kwhEnt: ent.gridExportMonth || '',
            todayVal: ledger.today.gridExp,
            monthVal: ledger.month.gridExp
        },
        {
            name: 'Batterie Ladung',
            wattEnt: ent.batteryChargePower || ent.batteryPower || '',
            kwhEnt: ent.batteryChargeMonth || '',
            todayVal: ledger.today.batChg,
            monthVal: ledger.month.batChg
        },
        {
            name: 'Batterie Entladung',
            wattEnt: ent.batteryDischargePower || ent.batteryPower || '',
            kwhEnt: ent.batteryDischargeMonth || '',
            todayVal: ledger.today.batDis,
            monthVal: ledger.month.batDis
        }
    ];

    box.innerHTML = channels.map(ch => {
        const hasWatt = Boolean(ch.wattEnt);
        const hasKwh = Boolean(ch.kwhEnt);
        const statusColor = (hasWatt && hasKwh)
            ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5'
            : ((hasWatt || hasKwh)
                ? 'text-teal-600 dark:text-teal-400 border-teal-500/30 bg-teal-500/5'
                : 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5');
        const modeText = (hasWatt && hasKwh)
            ? 'Watt + kWh aktiv'
            : (hasKwh ? 'kWh-Zähler aktiv' : (hasWatt ? 'Watt-Integral aktiv' : 'Bilanz / Offen'));

        return `
        <div class="p-2.5 rounded-xl border ${statusColor} flex flex-col justify-between gap-1">
            <div class="flex items-center justify-between gap-1.5">
                <span class="text-[11px] font-extrabold text-slate-800 dark:text-slate-100 truncate">${ch.name}</span>
                <span class="text-[10px] font-bold shrink-0">${modeText}</span>
            </div>
            <div class="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300 mt-0.5">
                <span>Heute: <strong>${fmt(ch.todayVal, 2)} kWh</strong></span>
                <span>Monat: <strong>${fmt(ch.monthVal, 1)} kWh</strong></span>
            </div>
        </div>`;
    }).join('');
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
    setElVal('ha_ent_grid_imp_power', ent.gridImportPower || '');
    setElVal('ha_ent_grid_exp_power', ent.gridExportPower || '');
    setElVal('ha_ent_grid_power', ent.gridPower || '');
    setElVal('ha_ent_bat_chg_power', ent.batteryChargePower || '');
    setElVal('ha_ent_bat_dis_power', ent.batteryDischargePower || '');
    setElVal('ha_ent_bat_power', ent.batteryPower || '');
    setElVal('ha_ent_bat_soc', ent.batterySoc || '');
    setElVal('ha_ent_pv_today', ent.pvEnergyToday || '');
    setElVal('ha_ent_pv_month', ent.pvEnergyMonth || '');
    setElVal('ha_ent_load_month', ent.loadEnergyMonth || '');
    setElVal('ha_ent_grid_imp_month', ent.gridImportMonth || '');
    setElVal('ha_ent_grid_exp_month', ent.gridExportMonth || '');
    setElVal('ha_ent_bat_chg_month', ent.batteryChargeMonth || '');
    setElVal('ha_ent_bat_dis_month', ent.batteryDischargeMonth || '');

    renderHaCustomStringsEditor();
    renderHaCustomConsumersEditor();
    renderHaPvEnergyExtraList();
    renderHaUnifiedSensorMatrix();
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
        <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div class="flex items-center gap-2">
                <input type="color" value="${safeColor}" onchange="updateHaCustomStringField(${idx}, 'color', this.value)" class="w-6 h-6 rounded-full shrink-0 cursor-pointer border-0" title="Kurvenfarbe">
                <input type="text" id="ha_str_name_${idx}" value="${safeName}" oninput="updateHaCustomStringField(${idx}, 'name', this.value)"
                    placeholder="z.B. Fronius · String 1 DC"
                    class="flex-1 min-w-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                <button type="button" onclick="removeHaCustomString(${idx})" class="w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors shrink-0 cursor-pointer" title="String entfernen">
                    <span class="material-symbols-rounded text-base">delete</span>
                </button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                    <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Leistung (W / kW)</label>
                    <div class="flex items-center gap-1">
                        <input type="text" id="ha_str_pwr_${idx}" list="haEntitiesDatalist" value="${safePower}" oninput="updateHaCustomStringField(${idx}, 'powerEntity', this.value)"
                            placeholder="sensor.fronius_string_1_power"
                            class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                        <button type="button" onclick="openHaEntityPicker({ customType: 'stringPower', index: ${idx}, unitFilter: 'power', title: 'PV-String ${idx + 1} · Leistung (W/kW)' })" class="w-8 h-8 rounded-lg bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/35 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 cursor-pointer" title="Sensor aus Liste wählen" aria-label="Sensor wählen">
                            <span class="material-symbols-rounded text-base">list_alt</span>
                        </button>
                    </div>
                </div>
                <div>
                    <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Energiezähler (kWh, optional)</label>
                    <div class="flex items-center gap-1">
                        <input type="text" id="ha_str_nrg_${idx}" list="haEntitiesDatalist" value="${safeEnergy}" oninput="updateHaCustomStringField(${idx}, 'energyEntity', this.value)"
                            placeholder="Leer = aus W berechnet"
                            class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                        <button type="button" onclick="openHaEntityPicker({ customType: 'stringEnergy', index: ${idx}, unitFilter: 'energy', title: 'PV-String ${idx + 1} · Energie (kWh)' })" class="w-8 h-8 rounded-lg bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/35 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 cursor-pointer" title="Energiezähler aus Liste wählen" aria-label="Sensor wählen">
                            <span class="material-symbols-rounded text-base">list_alt</span>
                        </button>
                    </div>
                </div>
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
        <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div class="flex items-center gap-1.5">
                <input type="text" id="ha_cons_name_${idx}" value="${safeName}" oninput="updateHaCustomConsumerField(${idx}, 'name', this.value)"
                    placeholder="Gerätename (z.B. Trockner)"
                    class="flex-1 min-w-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                <button type="button" onclick="removeHaCustomConsumer(${idx})" class="w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors shrink-0 cursor-pointer" title="Verbraucher entfernen" aria-label="Verbraucher entfernen">
                    <span class="material-symbols-rounded text-base">delete</span>
                </button>
            </div>
            <div class="flex items-center gap-1">
                <input type="text" id="ha_cons_pwr_${idx}" list="haEntitiesDatalist" value="${safeEnt}" oninput="updateHaCustomConsumerField(${idx}, 'powerEntity', this.value)"
                    placeholder="sensor.shelly_pm_mini_..."
                    class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                <button type="button" onclick="openHaEntityPicker({ customType: 'consumerPower', index: ${idx}, unitFilter: 'power', title: 'Einzelverbraucher ${idx + 1} · Leistung (W/kW)' })" class="w-8 h-8 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/35 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 cursor-pointer" title="Sensor aus Liste wählen" aria-label="Sensor wählen">
                    <span class="material-symbols-rounded text-base">list_alt</span>
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
        <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-teal-500/30 flex flex-col sm:flex-row sm:items-center gap-1.5">
            <label class="text-[10px] font-semibold text-teal-700 dark:text-teal-300 sm:w-52 shrink-0">Wechselrichter ${wrNum} · kWh Total</label>
            <div class="flex items-center gap-1 flex-1 min-w-0">
                <input type="text" id="ha_ent_pv_extra_${idx}" list="haEntitiesDatalist" value="${safeEnt}"
                    oninput="updateHaPvEnergyExtraField(${idx}, this.value)"
                    placeholder="sensor.wechselrichter_${wrNum}_energy_total"
                    class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                <button type="button" onclick="openHaEntityPicker({ customType: 'pvEnergyExtra', index: ${idx}, unitFilter: 'energy', title: 'PV-Erzeugung · Wechselrichter ${wrNum} (kWh)' })"
                    class="w-8 h-8 rounded-lg bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/35 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 cursor-pointer" title="Sensor wählen" aria-label="Sensor wählen">
                    <span class="material-symbols-rounded text-base">list_alt</span>
                </button>
                <button type="button" onclick="removeHaPvEnergyExtra(${idx})" class="w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer shrink-0" title="Wechselrichter-Zähler entfernen" aria-label="Wechselrichter-Zähler entfernen">
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
        gridImportPower: (document.getElementById('ha_ent_grid_imp_power')?.value || '').trim(),
        gridExportPower: (document.getElementById('ha_ent_grid_exp_power')?.value || '').trim(),
        gridPower: (document.getElementById('ha_ent_grid_power')?.value || '').trim(),
        batteryChargePower: (document.getElementById('ha_ent_bat_chg_power')?.value || '').trim(),
        batteryDischargePower: (document.getElementById('ha_ent_bat_dis_power')?.value || '').trim(),
        batteryPower: (document.getElementById('ha_ent_bat_power')?.value || '').trim(),
        batterySoc: (document.getElementById('ha_ent_bat_soc')?.value || '').trim(),
        pvEnergyToday: (document.getElementById('ha_ent_pv_today')?.value || '').trim(),
        pvEnergyMonth: (document.getElementById('ha_ent_pv_month')?.value || '').trim(),
        loadEnergyMonth: (document.getElementById('ha_ent_load_month')?.value || '').trim(),
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

function getEnergyBaselinesForProject() {
    return JSON.parse(JSON.stringify(energyCounterBaselines || {}));
}

function applyEnergyBaselinesFromProject(baselines) {
    if (!baselines || typeof baselines !== 'object') return;
    const keys = getTodayAndMonthKeys();
    if (baselines.monthKey === keys.monthKey && baselines.monthStartByEntity) {
        energyCounterBaselines.monthStartByEntity = {
            ...baselines.monthStartByEntity,
            ...energyCounterBaselines.monthStartByEntity
        };
    }
    if (baselines.dayKey === keys.dayKey && baselines.dayStartByEntity) {
        energyCounterBaselines.dayStartByEntity = {
            ...baselines.dayStartByEntity,
            ...energyCounterBaselines.dayStartByEntity
        };
    }
    healMonthBaselinesAgainstDayBaselines();
    saveEnergyCounterBaselines();
}

window.toggleShowAllDashboardConsumers = toggleShowAllDashboardConsumers;
window.getSanitizedHaConfigForProject = getSanitizedHaConfigForProject;
window.applySanitizedHaConfigFromProject = applySanitizedHaConfigFromProject;
window.getPerformanceRecordsForProject = getPerformanceRecordsForProject;
window.applyPerformanceRecordsFromProject = applyPerformanceRecordsFromProject;
window.getEnergyBaselinesForProject = getEnergyBaselinesForProject;
window.applyEnergyBaselinesFromProject = applyEnergyBaselinesFromProject;

// Auto-initialize once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initTelemetryAndAnalysis();
    }, 120);
});
