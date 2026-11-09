// ============================================================================
// TELEMETRY, LIVE DASHBOARD, SANKEY ENERGY FLOW & PERFORMANCE ENGINE (V8.5)
// Liquid-Glass UI, Mobile-First 2-Level Drill-Down, Interactive Sankey Diagram,
// Configurable HA Strings & Consumers, Domain/Reverse-Proxy Diagnostics
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
    mode: 'demo', // 'demo' | 'poll' | 'webhook'
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
        batterySoc: 'sensor.battery_soc',
        pvEnergyToday: 'sensor.pv_energy_today',
        pvEnergyMonth: 'sensor.pv_energy_monthly',
        pvEnergyTotal: 'sensor.pv_energy_total',
        gridImportMonth: 'sensor.grid_import_monthly',
        gridExportMonth: 'sensor.grid_export_monthly',
        batteryChargeMonth: 'sensor.battery_charge_monthly',
        batteryDischargeMonth: 'sensor.battery_discharge_monthly'
    },
    customStrings: JSON.parse(JSON.stringify(DEFAULT_CUSTOM_STRINGS)),
    customConsumers: JSON.parse(JSON.stringify(DEFAULT_CUSTOM_CONSUMERS)),
    stringEntities: {},
    inverterEntities: {}
};

let discoveredHaSensors = [];
let liveTelemetryTimer = null;
let intradayHistoryTimer = null;

let currentLiveTelemetry = {
    updatedAt: null,
    pvPowerW: 682,
    loadPowerW: 2100,
    gridPowerW: 1480, // >0 import from grid, <0 export to grid
    batteryPowerW: 0, // >0 charging, <0 discharging
    batterySocPct: 8.4,
    pvEnergyTodayKwh: 1.325,
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
let intradaySeriesState = {
    startOfDayIso: null,
    nowIso: null,
    labels: [],
    bucketTimes: [],
    series: {}, // key -> array of values
    integratedKwh: {} // key -> kWh number
};

let activeCurveKeys = new Set(['str_fronius_1', 'str_fronius_2', 'str_hoymiles', 'pv_total', 'battery_soc']);

let demoSimHour = 11.27; // 11:16 Uhr wie im Referenz-Screenshot als sofortiger Hingucker
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

    // 1. Load local cached HA config & performance records
    try {
        const localHa = localStorage.getItem('pvpro_ha_config');
        if (localHa) {
            const parsed = JSON.parse(localHa);
            haConfigState = {
                ...haConfigState,
                ...parsed,
                entities: { ...haConfigState.entities, ...(parsed.entities || {}) },
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

    // 2. Sync with backend server asynchronously
    try {
        const [haRes, recRes] = await Promise.all([
            fetch('/api/ha/config').catch(() => null),
            fetch('/api/performance/records').catch(() => null)
        ]);

        if (haRes && haRes.ok) {
            const haData = await haRes.json();
            if (haData && haData.success && haData.config) {
                haConfigState = {
                    ...haConfigState,
                    ...haData.config,
                    entities: { ...haConfigState.entities, ...(haData.config.entities || {}) },
                    customStrings: Array.isArray(haData.config.customStrings) && haData.config.customStrings.length > 0 ? haData.config.customStrings : haConfigState.customStrings,
                    customConsumers: Array.isArray(haData.config.customConsumers) ? haData.config.customConsumers : haConfigState.customConsumers,
                    stringEntities: { ...haConfigState.stringEntities, ...(haData.config.stringEntities || {}) }
                };
                localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
            }
        }

        if (recRes && recRes.ok) {
            const recData = await recRes.json();
            if (recData && recData.success && recData.records && Object.keys(recData.records).length > 0) {
                performanceRecordsByProject = { ...performanceRecordsByProject, ...recData.records };
                localStorage.setItem('pvpro_performance_records', JSON.stringify(performanceRecordsByProject));
            }
        }
    } catch (e) {}

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

async function refreshLiveTelemetryNow() {
    const baseline = getPlannedSystemBaseline();

    if (haConfigState.mode === 'demo') {
        computeDemoLiveTelemetry(baseline);
        buildDemoIntradaySeries(baseline);
        renderLiveCockpitUI(baseline);
        renderIntradayCurveSection(baseline);
        return;
    }

    // Mode 'poll' or 'webhook' -> query backend /api/ha/states
    try {
        const res = await fetch('/api/ha/states', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: haConfigState })
        });
        const data = await res.json();

        if (res.ok && data && data.success && data.telemetry) {
            const t = data.telemetry;
            currentLiveTelemetry = {
                updatedAt: data.updatedAt || new Date().toISOString(),
                pvPowerW: Math.round(t.pvPowerW || 0),
                loadPowerW: Math.round(t.loadPowerW || 0),
                gridPowerW: Math.round(t.gridPowerW || 0),
                batteryPowerW: Math.round(t.batteryPowerW || 0),
                batterySocPct: t.batterySocPct !== null && t.batterySocPct !== undefined ? +(Number(t.batterySocPct).toFixed(1)) : (baseline.totalBatteryKwh > 0 ? 50 : null),
                pvEnergyTodayKwh: t.pvEnergyTodayKwh,
                pvEnergyMonthKwh: t.pvEnergyMonthKwh,
                gridImportMonthKwh: t.gridImportMonthKwh,
                gridExportMonthKwh: t.gridExportMonthKwh,
                batteryChargeMonthKwh: t.batteryChargeMonthKwh,
                batteryDischargeMonthKwh: t.batteryDischargeMonthKwh,
                stringTelemetry: data.stringTelemetry || {},
                customStringsTelemetry: Array.isArray(data.customStringsTelemetry) ? data.customStringsTelemetry : [],
                consumersTelemetry: Array.isArray(data.consumersTelemetry) ? data.consumersTelemetry : [],
                unavailableConsumersCount: t.unavailableConsumersCount ?? 0,
                connectionOk: true,
                lastError: null
            };

            if (haConfigState.autoSyncMonthly && t.pvEnergyMonthKwh !== null && t.pvEnergyMonthKwh !== undefined && t.pvEnergyMonthKwh > 0) {
                syncCurrentMonthFromLiveTelemetry(false);
            }
        } else {
            currentLiveTelemetry.connectionOk = false;
            currentLiveTelemetry.lastError = data?.error || 'Keine Antwort von Home Assistant.';
        }
    } catch (err) {
        currentLiveTelemetry.connectionOk = false;
        currentLiveTelemetry.lastError = err.message;
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

    // Distribute realistic string powers matching screenshot 2 around 11:16 (291 W, 275 W, 105 W -> ~682 W total)
    const baseWeights = [0.43, 0.41, 0.16, 0.25, 0.25];
    let totalPvW = 0;
    const strTele = {};
    const customStringsTele = [];

    const dayProgress = Math.max(0.02, Math.min(1, (hour - 6.2) / 13.5));

    customStrings.forEach((cs, idx) => {
        const w = baseWeights[idx % baseWeights.length];
        // At hour=11.27, sunFactor is ~0.78 -> scale so totalPvW is ~682 W (or scaled to kWp if user changed slider)
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

    // Also populate legacy stringSummaries telemetry
    baseline.stringSummaries.forEach((s, idx) => {
        const pW = Math.round(totalPvW / Math.max(1, baseline.stringSummaries.length));
        strTele[s.id] = { powerW: pW, energyKwh: +(pW * dayProgress * 1.8 / 1000).toFixed(2) };
    });

    // Individual active consumers (matching Screenshot 1: Trockner 429 W, TV-Verstärker 76 W, Esszimmer Licht 36 W, Küche Licht 36 W)
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

    // Total house load (~2,1 kW at 11:16 as in Screenshot 1)
    const sumConsumersW = consumersTele.reduce((acc, c) => acc + c.powerW, 0);
    const loadW = Math.round(Math.max(sumConsumersW + 350, (hour >= 10 && hour <= 14 ? 2100 : 1250) * jitter));

    // Battery SoC curve: discharging overnight from 48.5% at 00:00 down to 8.4% at 08:45, then standby or charging if surplus
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

    // Grid Power: >0 = Bezug aus dem Netz (e.g. 1.48 kW), <0 = Einspeisung
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

    // 10-minute steps from 00:00 up to demoSimHour
    const stepHours = 10 / 60;
    const bucketTimes = [];
    const labels = [];
    const series = {
        pv_total: [],
        house_load: [],
        grid_power: [],
        battery_soc: []
    };
    customStrings.forEach(cs => { series[cs.id] = []; });

    const baseWeights = [0.43, 0.41, 0.16, 0.25, 0.25];

    for (let h = 0; h <= endHour + 0.001; h += stepHours) {
        const clampedH = Math.min(endHour, h);
        const ts = startOfDay.getTime() + Math.round(clampedH * 3600000);
        bucketTimes.push(ts);

        const hrs = Math.floor(clampedH);
        const mins = Math.round((clampedH - hrs) * 60);
        labels.push(`${String(hrs).padStart(2, '0')}:${String(mins === 60 ? 59 : mins).padStart(2, '0')}`);

        // Realistic morning ramp & cloud fluctuations like Screenshot 2
        let sun = 0;
        if (clampedH > 7.4 && clampedH < 20.0) {
            const rawSun = Math.pow(Math.sin(((clampedH - 7.4) / 11.5) * Math.PI), 1.45);
            // Dynamic cloud spikes like in Screenshot 2 between 08:00 and 11:16
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

        // Battery SoC curve matching Screenshot 2 (48.5% at 00:00 -> linear/smooth drop to 8.4% at 08:40 -> flat 8.4%)
        let socVal = 8.4;
        if (clampedH < 5.5) {
            socVal = 48.5 - (clampedH / 5.5) * (48.5 - 32.0);
        } else if (clampedH < 8.65) {
            socVal = 32.0 - ((clampedH - 5.5) / 3.15) * (32.0 - 8.4);
        } else if (stepPvSum > 1800) {
            socVal = Math.min(95, 8.4 + (clampedH - 8.65) * 4.5);
        }
        series.battery_soc.push(+(socVal.toFixed(1)));

        // House load & Grid import
        const loadVal = Math.round(420 + (clampedH >= 7 && clampedH <= 9 ? 950 : 0) + (clampedH >= 10.2 ? 1680 : 180) + 120 * Math.sin(clampedH * 5));
        series.house_load.push(loadVal);
        series.grid_power.push(Math.max(0, Math.round(loadVal - stepPvSum)));
    }

    // Force final point to match currentLiveTelemetry exactly
    const lastIdx = bucketTimes.length - 1;
    if (lastIdx >= 0) {
        series.pv_total[lastIdx] = currentLiveTelemetry.pvPowerW;
        series.house_load[lastIdx] = currentLiveTelemetry.loadPowerW;
        series.grid_power[lastIdx] = Math.max(0, currentLiveTelemetry.gridPowerW);
        series.battery_soc[lastIdx] = currentLiveTelemetry.batterySocPct ?? 8.4;
        (currentLiveTelemetry.customStringsTelemetry || []).forEach(cs => {
            if (series[cs.id]) series[cs.id][lastIdx] = cs.powerW;
        });
    }

    // Integrate kWh for each power series
    const integratedKwh = {};
    Object.keys(series).forEach(key => {
        if (key === 'battery_soc') return;
        const arr = series[key];
        let wh = 0;
        for (let i = 1; i < arr.length; i++) {
            const dtH = (bucketTimes[i] - bucketTimes[i - 1]) / 3600000;
            wh += Math.max(0, (arr[i] + arr[i - 1]) / 2) * dtH;
        }
        integratedKwh[key] = +(wh / 1000).toFixed(3);
    });

    intradaySeriesState = {
        startOfDayIso: startOfDay.toISOString(),
        nowIso: new Date(startOfDay.getTime() + Math.round(endHour * 3600000)).toISOString(),
        labels,
        bucketTimes,
        series,
        integratedKwh
    };
}

async function fetchAndRenderIntradayHistory() {
    const baseline = getPlannedSystemBaseline();
    if (haConfigState.mode === 'demo') {
        buildDemoIntradaySeries(baseline);
        renderIntradayCurveSection(baseline);
        return;
    }

    try {
        const res = await fetch('/api/ha/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: haConfigState })
        });
        const data = await res.json();

        if (res.ok && data && data.success) {
            if (Array.isArray(data.bucketTimes) && data.bucketTimes.length > 0 && data.series) {
                const labels = data.bucketTimes.map(ts => {
                    const d = new Date(ts);
                    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                });
                intradaySeriesState = {
                    startOfDayIso: data.startOfDay,
                    nowIso: data.now,
                    labels,
                    bucketTimes: data.bucketTimes,
                    series: data.series,
                    integratedKwh: data.integratedKwh || {}
                };
            } else if (Array.isArray(data.snapshots) && data.snapshots.length > 0) {
                // Build from buffered snapshots
                const snaps = data.snapshots;
                const bucketTimes = snaps.map(s => s.ts);
                const labels = snaps.map(s => new Date(s.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
                const series = {
                    pv_total: snaps.map(s => s.pvPowerW || 0),
                    house_load: snaps.map(s => s.loadPowerW || 0),
                    grid_power: snaps.map(s => s.gridImportW || 0),
                    battery_soc: snaps.map(s => s.batterySocPct || 0)
                };
                (haConfigState.customStrings || []).forEach(cs => {
                    series[cs.id] = snaps.map(s => (s.strings && s.strings[cs.id]) ? s.strings[cs.id] : 0);
                });
                const integratedKwh = {};
                Object.keys(series).forEach(k => {
                    if (k === 'battery_soc') return;
                    const arr = series[k];
                    let wh = 0;
                    for (let i = 1; i < arr.length; i++) {
                        const dtH = (bucketTimes[i] - bucketTimes[i - 1]) / 3600000;
                        wh += Math.max(0, (arr[i] + arr[i - 1]) / 2) * dtH;
                    }
                    integratedKwh[k] = +(wh / 1000).toFixed(3);
                });
                intradaySeriesState = {
                    startOfDayIso: data.startOfDay || new Date().toISOString(),
                    nowIso: data.now || new Date().toISOString(),
                    labels,
                    bucketTimes,
                    series,
                    integratedKwh
                };
            } else {
                buildDemoIntradaySeries(baseline);
            }
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

    // 1. Update Mode Pill Buttons & Status Subtitle
    ['demo', 'poll', 'webhook'].forEach(m => {
        const btn = document.getElementById(`btn-ha-mode-${m}`);
        if (btn) {
            if (haConfigState.mode === m) {
                btn.className = "px-2.5 py-1 rounded-full bg-teal-600 text-white text-[11px] font-bold shadow-xs transition-all cursor-pointer whitespace-nowrap";
            } else {
                btn.className = "px-2.5 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap";
            }
        }
    });

    const demoBar = document.getElementById('liveDemoTimeBar');
    if (demoBar) {
        if (haConfigState.mode === 'demo') demoBar.classList.remove('hidden');
        else demoBar.classList.add('hidden');
    }

    const statusText = document.getElementById('liveConnectionStatusText');
    if (statusText) {
        if (haConfigState.mode === 'demo') {
            statusText.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-teal-500 mr-1"></span><span class="font-semibold text-teal-700 dark:text-teal-300">Live-Vorschau</span> · Sensoren frei anpassbar`;
        } else if (t.connectionOk) {
            const timeStr = t.updatedAt ? new Date(t.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'jetzt';
            statusText.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1"></span><span class="font-semibold text-emerald-700 dark:text-emerald-300">Home Assistant live</span> · ${timeStr}`;
        } else {
            statusText.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1"></span><span class="font-semibold text-rose-600 dark:text-rose-400">HA Hinweis:</span> ${typeof escapeHtml === 'function' ? escapeHtml(t.lastError || 'Nicht erreichbar') : (t.lastError || 'Nicht erreichbar')}`;
        }
    }

    // 2. Render "Energie · jetzt" 2x2 Status Tiles (Matching Screenshot 1)
    const maxPvRefW = Math.max(1500, baseline.totalKwp * 1000);
    const pvBarPct = Math.min(100, Math.max(t.pvPowerW > 0 ? 4 : 0, Math.round((t.pvPowerW / maxPvRefW) * 100)));
    setElText('dash_pv_power', formatPowerDe(t.pvPowerW, t.pvPowerW < 1000));
    setElText('dash_pv_sub', t.pvPowerW > 15 ? 'Erzeugung läuft' : 'Standby / Nacht');
    const pvBar = document.getElementById('dash_pv_bar');
    if (pvBar) pvBar.style.width = `${pvBarPct}%`;

    const loadBarPct = Math.min(100, Math.max(6, Math.round((t.loadPowerW / 5000) * 100)));
    setElText('dash_load_power', formatPowerDe(t.loadPowerW));
    setElText('dash_load_sub', 'Aktueller Hausverbrauch');
    const loadBar = document.getElementById('dash_load_bar');
    if (loadBar) loadBar.style.width = `${loadBarPct}%`;

    const batTitle = haConfigState.batteryName || baseline.detectedBatteryName || 'BYD HVS+';
    setElText('dash_bat_title', batTitle);
    const socNum = t.batterySocPct !== null && t.batterySocPct !== undefined ? Number(t.batterySocPct) : 0;
    const socFormatted = t.batterySocPct !== null && t.batterySocPct !== undefined
        ? `${socNum.toLocaleString('de-DE', { minimumFractionDigits: socNum % 1 !== 0 ? 1 : 0, maximumFractionDigits: 1 })} %`
        : '—';
    setElText('dash_bat_soc', socFormatted);

    let batSub = 'Ruhe / Standby';
    if (t.batteryPowerW > 25) batSub = `Lädt · +${formatPowerDe(t.batteryPowerW)}`;
    else if (t.batteryPowerW < -25) batSub = `Entlädt · ${formatPowerDe(Math.abs(t.batteryPowerW))}`;
    setElText('dash_bat_sub', batSub);
    const batBar = document.getElementById('dash_bat_bar');
    if (batBar) batBar.style.width = `${Math.min(100, Math.max(4, socNum))}%`;

    const absGridW = Math.abs(t.gridPowerW || 0);
    const gridBarPct = Math.min(100, Math.max(absGridW > 10 ? 5 : 0, Math.round((absGridW / 5000) * 100)));
    setElText('dash_grid_power', formatPowerDe(absGridW));
    if (t.gridPowerW > 15) {
        setElText('dash_grid_sub', 'Bezug aus dem Netz');
    } else if (t.gridPowerW < -15) {
        setElText('dash_grid_sub', 'Einspeisung ins Netz');
    } else {
        setElText('dash_grid_sub', 'Netz ausgeglichen');
    }
    const gridBar = document.getElementById('dash_grid_bar');
    if (gridBar) gridBar.style.width = `${gridBarPct}%`;

    // 3. Render "Aktive Verbraucher" List (Matching Screenshot 1)
    const consContainer = document.getElementById('dash_active_consumers_list');
    if (consContainer) {
        const consumers = Array.isArray(t.consumersTelemetry) && t.consumersTelemetry.length > 0
            ? [...t.consumersTelemetry]
            : (haConfigState.customConsumers || []).map(c => ({ id: c.id, name: c.name, powerW: 0, available: false }));

        // Sort descending by live powerW
        consumers.sort((a, b) => (b.powerW || 0) - (a.powerW || 0));

        if (consumers.length === 0) {
            consContainer.innerHTML = `
                <div class="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Noch keine Einzelverbraucher-Sensoren hinterlegt.</span>
                    <button onclick="openHaConfigModal('consumers')" class="text-teal-600 dark:text-teal-400 font-bold hover:underline cursor-pointer">+ Anlegen</button>
                </div>`;
        } else {
            consContainer.innerHTML = consumers.map(c => {
                const safeName = typeof escapeHtml === 'function' ? escapeHtml(c.name) : c.name;
                const valStr = `${Math.round(c.powerW || 0).toLocaleString('de-DE')} W`;
                return `
                <div class="rounded-2xl bg-white dark:bg-[#162329] border border-slate-200/90 dark:border-slate-700/70 px-4 py-3.5 flex items-center justify-between shadow-2xs transition-all">
                    <span class="text-sm font-medium text-slate-800 dark:text-slate-100 truncate pr-3">${safeName}</span>
                    <span class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white font-mono tabular-nums shrink-0">${valStr}</span>
                </div>`;
            }).join('');
        }

        const fnEl = document.getElementById('dash_consumers_footnote');
        if (fnEl) {
            const unavail = t.unavailableConsumersCount || 0;
            const unavailText = unavail > 0 ? ` ${unavail} Messwert(e) nicht verfügbar.` : '';
            fnEl.innerText = `Größte aktive Einzelverbraucher.${unavailText}`;
        }
    }

    // 4. Update Level 1 Drill-Down Card Summary for Intraday Curve
    const intradaySumEl = document.getElementById('live_hub_intraday_summary');
    if (intradaySumEl) {
        const customStrNames = (haConfigState.customStrings || []).slice(0, 2).map(s => s.name).join(', ');
        const todayPv = t.pvEnergyTodayKwh ?? intradaySeriesState.integratedKwh?.pv_total ?? 1.325;
        intradaySumEl.innerText = `${customStrNames || 'Strings'}, Haus & Batterie · Heute ≈ ${formatKwhDe(todayPv, 2)} (${activeCurveKeys.size} aktive Kurven)`;
    }
}

// ============================================================================
// 5. RENDERING: INTRADAY CURVE & SELECTABLE SENSOR TILES (SCREENSHOT 2)
// ============================================================================

function getAvailableCurveDefinitions() {
    const t = currentLiveTelemetry;
    const intKwh = intradaySeriesState.integratedKwh || {};
    const customStrings = Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.length > 0
        ? haConfigState.customStrings
        : DEFAULT_CUSTOM_STRINGS;

    const defs = [];

    // 1. Custom PV Strings / Inverters (e.g., Fronius String 1 DC, Fronius String 2 DC, Hoymiles gesamt DC)
    customStrings.forEach((cs, idx) => {
        const teleItem = (t.customStringsTelemetry || []).find(x => x.id === cs.id);
        const liveW = teleItem ? teleItem.powerW : (t.stringTelemetry?.[cs.id]?.powerW || 0);
        const explicitKwh = teleItem?.energyKwh ?? t.stringTelemetry?.[cs.id]?.energyKwh ?? null;
        const calcKwh = intKwh[cs.id] ?? 0;
        const hasExplicitEnergy = explicitKwh !== null && explicitKwh !== undefined;

        defs.push({
            key: cs.id,
            name: cs.name || `String ${idx + 1}`,
            color: cs.color || '#14b8a6',
            axis: 'yPower',
            unit: 'W',
            liveDisplay: formatPowerDe(liveW, true),
            subDisplay: hasExplicitEnergy
                ? `${formatKwhDe(explicitKwh, 3)} · erfasster Zeitraum`
                : `≈ ${formatKwhDe(calcKwh, 3)} · aus Leistung`
        });
    });

    // 2. PV gesamt · DC
    const pvTotalExplicit = t.pvEnergyTodayKwh;
    const pvTotalCalc = intKwh.pv_total ?? 0;
    defs.push({
        key: 'pv_total',
        name: 'PV gesamt · DC',
        color: '#38bdf8',
        axis: 'yPower',
        unit: 'W',
        liveDisplay: formatPowerDe(t.pvPowerW, t.pvPowerW < 1000),
        subDisplay: (pvTotalExplicit !== null && pvTotalExplicit !== undefined && haConfigState.entities?.pvEnergyToday)
            ? `≈ ${formatKwhDe(pvTotalExplicit, 3)} · aus Leistung`
            : `≈ ${formatKwhDe(pvTotalCalc, 3)} · aus Leistung`
    });

    // 3. Hausverbrauch · AC
    defs.push({
        key: 'house_load',
        name: 'Hausverbrauch · AC',
        color: '#f472b6',
        axis: 'yPower',
        unit: 'W',
        liveDisplay: formatPowerDe(t.loadPowerW),
        subDisplay: `≈ ${formatKwhDe(intKwh.house_load ?? 0, 3)} · aus Leistung`
    });

    // 4. Netzbezug
    const gridImportLive = Math.max(0, t.gridPowerW || 0);
    defs.push({
        key: 'grid_power',
        name: 'Netzbezug',
        color: '#60a5fa',
        axis: 'yPower',
        unit: 'W',
        liveDisplay: formatPowerDe(gridImportLive),
        subDisplay: `${formatKwhDe(intKwh.grid_power ?? 0, 3)} · erfasster Zeitraum`
    });

    // 5. Batterie · Ladezustand
    const socVal = t.batterySocPct !== null && t.batterySocPct !== undefined ? Number(t.batterySocPct) : 0;
    defs.push({
        key: 'battery_soc',
        name: 'Batterie · Ladezustand',
        color: '#d8b4fe',
        axis: 'ySoc',
        unit: '%',
        liveDisplay: `${socVal.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`,
        subDisplay: `${haConfigState.batteryName || 'Batterie'} · SoC-Verlauf (rechte Achse)`
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
    try {
        localStorage.setItem('pvpro_active_curves', JSON.stringify([...activeCurveKeys]));
    } catch (e) {}
    renderIntradayCurveSection();
}

function renderIntradayCurveSection(baseline) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const defs = getAvailableCurveDefinitions();

    // 1. Update Timestamp Range Header
    const rangeEl = document.getElementById('dash_curve_timerange');
    if (rangeEl) {
        const now = intradaySeriesState.nowIso ? new Date(intradaySeriesState.nowIso) : new Date();
        const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        rangeEl.innerText = `${dateStr}, 00:00 – ${dateStr}, ${timeStr} · Kachelwerte: jetzt`;
    }

    // 2. Render Top Interactive Legend Chips (with colored left accent bar like Screenshot 2)
    const chipsEl = document.getElementById('dash_curve_legend_chips');
    if (chipsEl) {
        chipsEl.innerHTML = defs.map(d => {
            const isActive = activeCurveKeys.has(d.key);
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;
            return `
            <button type="button" onclick="toggleIntradayCurve('${d.key}')"
                class="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                    isActive
                        ? 'bg-slate-800/90 text-white dark:bg-[#1c2c33] dark:text-slate-100 shadow-2xs'
                        : 'bg-slate-200/60 text-slate-400 dark:bg-slate-800/40 dark:text-slate-500 opacity-60'
                }"
                style="border-left: 3.5px solid ${isActive ? d.color : '#64748b'}">
                <span>${safeName}</span>
            </button>`;
        }).join('');
    }

    // 3. Render Selectable Measurement Tiles ("Kurven auswählen · aktuelle Messwerte")
    const tilesGrid = document.getElementById('dash_curve_tiles_grid');
    if (tilesGrid) {
        tilesGrid.innerHTML = defs.map(d => {
            const isActive = activeCurveKeys.has(d.key);
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(d.name) : d.name;
            const borderStyle = isActive
                ? `border: 2px solid ${d.color}; box-shadow: 0 0 18px -4px ${d.color}33;`
                : `border: 1.5px solid rgba(100, 116, 139, 0.25);`;

            return `
            <div onclick="toggleIntradayCurve('${d.key}')"
                style="${borderStyle}"
                class="rounded-2xl p-3.5 sm:p-4 cursor-pointer select-none transition-all duration-200 ${
                    isActive
                        ? 'bg-teal-950/20 dark:bg-[#13292d]/90'
                        : 'bg-slate-100/60 dark:bg-[#131e24]/60 opacity-65 hover:opacity-90'
                }">
                <p class="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 truncate">${safeName}</p>
                <p class="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums mt-1">${d.liveDisplay}</p>
                <p class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-1 leading-snug">${d.subDisplay}</p>
            </div>`;
        }).join('');
    }

    // 4. Update Default Readout Line Below Chart
    updateIntradayHoverReadout(intradaySeriesState.labels.length - 1, defs);

    // 5. Render Dual-Axis Chart.js Line Chart
    const canvas = document.getElementById('intradayTelemetryChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const activeDefs = defs.filter(d => activeCurveKeys.has(d.key));
    const datasets = activeDefs.map(d => {
        const dataArr = intradaySeriesState.series[d.key] || [];
        return {
            label: d.name,
            data: dataArr,
            borderColor: d.color,
            backgroundColor: d.color + '18',
            yAxisID: d.axis,
            borderWidth: 2.2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: false
        };
    });

    // Compute max W for clean left axis ticks like Screenshot 2
    let maxPowerW = 500;
    activeDefs.filter(d => d.axis === 'yPower').forEach(d => {
        const arr = intradaySeriesState.series[d.key] || [];
        arr.forEach(v => { if (v > maxPowerW) maxPowerW = v; });
    });

    if (chartIntraday) {
        chartIntraday.destroy();
    }

    chartIntraday = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: intradaySeriesState.labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 220 },
            interaction: {
                mode: 'index',
                intersect: false
            },
            onHover: (event, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    updateIntradayHoverReadout(idx, defs);
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 25, 30, 0.94)',
                    titleColor: '#e2e8f0',
                    bodyColor: '#f8fafc',
                    borderColor: 'rgba(45, 212, 191, 0.3)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            const isSoc = ctx.dataset.yAxisID === 'ySoc';
                            return ` ${ctx.dataset.label}: ${val.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${isSoc ? '%' : 'W'}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(148, 163, 184, 0.08)', drawBorder: false },
                    ticks: {
                        color: '#94a3b8',
                        maxTicksLimit: 6,
                        font: { size: 11 }
                    }
                },
                yPower: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    suggestedMax: Math.ceil(maxPowerW * 1.05),
                    grid: { color: 'rgba(148, 163, 184, 0.12)', drawBorder: false },
                    ticks: {
                        color: '#94a3b8',
                        count: 5,
                        font: { size: 11 },
                        callback: (val) => val.toLocaleString('de-DE', { maximumFractionDigits: 1 })
                    },
                    title: {
                        display: true,
                        text: 'W',
                        align: 'end',
                        color: '#94a3b8',
                        font: { size: 11, weight: '600' }
                    }
                },
                ySoc: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: '#94a3b8',
                        stepSize: 25,
                        font: { size: 11 }
                    },
                    title: {
                        display: true,
                        text: '%',
                        align: 'end',
                        color: '#94a3b8',
                        font: { size: 11, weight: '600' }
                    }
                }
            }
        }
    });
}

function updateIntradayHoverReadout(index, defs) {
    const readoutEl = document.getElementById('dash_curve_hover_readout');
    if (!readoutEl) return;
    if (!defs) defs = getAvailableCurveDefinitions();

    const idx = Math.max(0, Math.min(index, (intradaySeriesState.labels.length || 1) - 1));
    const ts = intradaySeriesState.bucketTimes?.[idx] || Date.now();
    const dObj = new Date(ts);
    const datePart = dObj.toLocaleDateString('de-DE');
    const timePart = dObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const activeDefs = defs.filter(d => activeCurveKeys.has(d.key));
    const parts = activeDefs.map(d => {
        const arr = intradaySeriesState.series[d.key] || [];
        const val = arr[idx] !== undefined ? arr[idx] : 0;
        const unit = d.axis === 'ySoc' ? '%' : 'W';
        return `${d.name}: ${Number(val).toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${unit}`;
    });

    readoutEl.innerText = `${datePart}, ${timePart} · ${parts.join(' · ')}`;
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

    const hasBattery = baseline.totalBatteryKwh > 0;
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
        decimals = 1;
        const t = currentLiveTelemetry || {};
        const intKwh = intradaySeriesState.integratedKwh || {};
        pvTotal = Math.max(0.2, Number(t.pvEnergyTodayKwh ?? intKwh.pv_total ?? 4.8));
        const rawHouse = Math.max(0.5, Number(intKwh.house_load ?? 7.4));

        if (hasBattery) {
            batChg = +(Math.min(pvTotal * 0.42, baseline.totalBatteryKwh * 0.65)).toFixed(2);
            batDis = +(batChg * 0.91).toFixed(2);
            batLoss = +(Math.max(0, batChg - batDis)).toFixed(2);
        }

        pvDirect = +(Math.min(rawHouse * 0.55, Math.max(0.1, pvTotal - batChg) * 0.72)).toFixed(2);
        gridExp = +(Math.max(0, pvTotal - pvDirect - batChg)).toFixed(2);
        const covered = pvDirect + batDis;
        gridImp = +(Math.max(0.1, Number(intKwh.grid_power ?? Math.max(0.4, rawHouse - covered)))).toFixed(2);
        houseTotal = +(covered + gridImp).toFixed(2);
        periodLabel = 'Heute (Tagesbilanz bis jetzt)';
    } else if (horizon === 'month') {
        decimals = 0;
        const curMonthIdx = new Date().getMonth();
        // Find current month if recorded, or latest recorded month
        let mRec = metrics.monthlyComparison[curMonthIdx];
        if (!mRec || !mRec.hasReal) {
            const recordedList = metrics.monthlyComparison.filter(m => m.hasReal);
            if (recordedList.length > 0) {
                mRec = recordedList[recordedList.length - 1];
            }
        }

        if (mRec && mRec.hasReal && mRec.realPv > 0) {
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
            periodLabel = `Monat: ${MONTH_LABELS_LONG[curMonthIdx]} (Prognose)`;
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
    const btnCfg = document.getElementById('btn-ha-modal-tab-config');
    const btnGuide = document.getElementById('btn-ha-modal-tab-guide');

    if (tab === 'guide') {
        if (panelCfg) panelCfg.classList.add('hidden');
        if (panelGuide) panelGuide.classList.remove('hidden');
        if (btnGuide) btnGuide.className = "px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-extrabold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
        if (btnCfg) btnCfg.className = "px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
    } else {
        if (panelCfg) panelCfg.classList.remove('hidden');
        if (panelGuide) panelGuide.classList.add('hidden');
        if (btnCfg) btnCfg.className = "px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-extrabold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
        if (btnGuide) btnGuide.className = "px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
    }
}

function copyHaReverseProxyYaml() {
    const codeEl = document.getElementById('haReverseProxyYamlCode');
    if (!codeEl) return;
    navigator.clipboard.writeText(codeEl.value).then(() => {
        if (typeof showToastNotification === 'function') {
            showToastNotification('http / cors configuration.yaml Vorlage in die Zwischenablage kopiert!', 'success');
        }
    });
}

function openHaConfigModal(focusSection = null) {
    const modal = document.getElementById('modal-ha-config');
    if (!modal) return;

    setElVal('ha_cfg_mode', haConfigState.mode || 'demo');
    setElVal('ha_cfg_url', haConfigState.baseUrl || 'http://homeassistant.local:8123');
    setElVal('ha_cfg_token', haConfigState.accessToken || '');
    setElVal('ha_cfg_interval', haConfigState.pollIntervalSec || 10);
    setElVal('ha_cfg_bat_name', haConfigState.batteryName || 'BYD HVS+');

    const ent = haConfigState.entities || {};
    setElVal('ha_ent_pv_power', ent.pvPower || '');
    setElVal('ha_ent_load_power', ent.loadPower || '');
    setElVal('ha_ent_grid_power', ent.gridPower || '');
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
    updateHaWebhookYamlSnippet();

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
    }
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
            <div class="sm:col-span-4 flex items-center gap-2">
                <input type="color" value="${safeColor}" onchange="updateHaCustomStringField(${idx}, 'color', this.value)" class="w-7 h-7 rounded-full shrink-0 cursor-pointer border-0">
                <div class="flex-1 min-w-0">
                    <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Bezeichnung (Kachel & Kurve)</label>
                    <input type="text" value="${safeName}" oninput="updateHaCustomStringField(${idx}, 'name', this.value)"
                        placeholder="z.B. Fronius · String 1 DC"
                        class="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                </div>
            </div>
            <div class="sm:col-span-4">
                <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Leistungs-Entität (W / kW)</label>
                <input type="text" list="haEntitiesDatalist" value="${safePower}" oninput="updateHaCustomStringField(${idx}, 'powerEntity', this.value)"
                    placeholder="sensor.fronius_string_1_power"
                    class="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
            </div>
            <div class="sm:col-span-3">
                <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Tagesenergie (kWh, optional)</label>
                <input type="text" list="haEntitiesDatalist" value="${safeEnergy}" oninput="updateHaCustomStringField(${idx}, 'energyEntity', this.value)"
                    placeholder="Leer = aus W berechnet"
                    class="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
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
        powerEntity: `sensor.pv_string_${nextNum}_power`,
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
        <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
            <div class="sm:col-span-5">
                <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Gerätename (z.B. Trockner, Wärmepumpe)</label>
                <input type="text" value="${safeName}" oninput="updateHaCustomConsumerField(${idx}, 'name', this.value)"
                    placeholder="Trockner"
                    class="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
            </div>
            <div class="sm:col-span-6">
                <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Home Assistant Leistungs-Entität (W oder kW)</label>
                <input type="text" list="haEntitiesDatalist" value="${safeEnt}" oninput="updateHaCustomConsumerField(${idx}, 'powerEntity', this.value)"
                    placeholder="sensor.trockner_power"
                    class="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
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
        powerEntity: `sensor.verbraucher_${nextNum}_power`
    });
    renderHaCustomConsumersEditor();
}

function removeHaCustomConsumer(idx) {
    if (!Array.isArray(haConfigState.customConsumers)) return;
    haConfigState.customConsumers.splice(idx, 1);
    renderHaCustomConsumersEditor();
}

function readHaModalIntoState() {
    haConfigState.mode = document.getElementById('ha_cfg_mode')?.value || 'demo';
    haConfigState.baseUrl = (document.getElementById('ha_cfg_url')?.value || 'http://homeassistant.local:8123').trim();
    haConfigState.accessToken = (document.getElementById('ha_cfg_token')?.value || '').trim();
    haConfigState.pollIntervalSec = Math.max(3, parseInt(document.getElementById('ha_cfg_interval')?.value) || 10);
    haConfigState.batteryName = (document.getElementById('ha_cfg_bat_name')?.value || 'BYD HVS+').trim();

    haConfigState.entities = {
        pvPower: (document.getElementById('ha_ent_pv_power')?.value || '').trim(),
        loadPower: (document.getElementById('ha_ent_load_power')?.value || '').trim(),
        gridPower: (document.getElementById('ha_ent_grid_power')?.value || '').trim(),
        batteryPower: (document.getElementById('ha_ent_bat_power')?.value || '').trim(),
        batterySoc: (document.getElementById('ha_ent_bat_soc')?.value || '').trim(),
        pvEnergyToday: (document.getElementById('ha_ent_pv_today')?.value || '').trim(),
        pvEnergyMonth: (document.getElementById('ha_ent_pv_month')?.value || '').trim(),
        gridImportMonth: (document.getElementById('ha_ent_grid_imp_month')?.value || '').trim(),
        gridExportMonth: (document.getElementById('ha_ent_grid_exp_month')?.value || '').trim(),
        batteryChargeMonth: (document.getElementById('ha_ent_bat_chg_month')?.value || '').trim(),
        batteryDischargeMonth: (document.getElementById('ha_ent_bat_dis_month')?.value || '').trim()
    };
}

async function testHaConnectionAndLoadSensors() {
    readHaModalIntoState();
    const statusBox = document.getElementById('haTestFeedbackBox');
    if (statusBox) {
        statusBox.classList.remove('hidden');
        statusBox.className = "p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-medium";
        statusBox.innerHTML = `<div class="flex items-center gap-2"><span class="material-symbols-rounded text-base animate-spin text-teal-500">progress_activity</span><span>Prüfe Domain, Reverse-Proxy Weiterleitungen & Long-Lived Token...</span></div>`;
    }

    try {
        const res = await fetch('/api/ha/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseUrl: haConfigState.baseUrl,
                accessToken: haConfigState.accessToken
            })
        });
        const data = await res.json();

        if (data?.normalizedBaseUrl) {
            haConfigState.baseUrl = data.normalizedBaseUrl;
            setElVal('ha_cfg_url', data.normalizedBaseUrl);
        }

        const diagHtml = Array.isArray(data?.diagnostics) && data.diagnostics.length > 0
            ? `<div class="mt-2.5 pt-2 border-t border-slate-300/50 dark:border-slate-700/60 space-y-1 font-mono text-[11px] opacity-90">${data.diagnostics.map(d => `<div>• ${typeof escapeHtml === 'function' ? escapeHtml(d) : d}</div>`).join('')}</div>`
            : '';

        if (res.ok && data && data.success) {
            discoveredHaSensors = data.sensors || [];
            const dl = document.getElementById('haEntitiesDatalist');
            if (dl) {
                dl.innerHTML = discoveredHaSensors.map(s =>
                    `<option value="${s.entity_id}">${s.name} (${s.state} ${s.unit})</option>`
                ).join('');
            }
            if (statusBox) {
                statusBox.className = "p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200";
                statusBox.innerHTML = `
                    <div class="font-extrabold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                        <span class="material-symbols-rounded text-base">check_circle</span>
                        <span>Verbindung über Reverse Proxy erfolgreich! (${data.sensorCount} Sensoren geladen)</span>
                    </div>
                    ${diagHtml}
                `;
            }
            return;
        }

        // If server proxy failed (e.g., private Split-DNS domain or Geo-IP block), try direct browser fetch as fallback
        try {
            const cleanUrl = (data?.normalizedBaseUrl || haConfigState.baseUrl || '').replace(/\/+$/, '');
            const cleanTok = (haConfigState.accessToken || '').replace(/^Bearer\s+/i, '').replace(/[\r\n\s]+/g, '');
            if (cleanUrl && cleanTok) {
                const directRes = await fetch(`${cleanUrl}/api/states`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${cleanTok}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (directRes.ok) {
                    const statesArr = await directRes.json();
                    if (Array.isArray(statesArr)) {
                        discoveredHaSensors = statesArr
                            .filter(s => s && typeof s.entity_id === 'string' && s.entity_id.startsWith('sensor.'))
                            .map(s => ({
                                entity_id: s.entity_id,
                                name: s.attributes?.friendly_name || s.entity_id,
                                state: s.state,
                                unit: s.attributes?.unit_of_measurement || ''
                            }));
                        const dl = document.getElementById('haEntitiesDatalist');
                        if (dl) {
                            dl.innerHTML = discoveredHaSensors.map(s =>
                                `<option value="${s.entity_id}">${s.name} (${s.state} ${s.unit})</option>`
                            ).join('');
                        }
                        if (statusBox) {
                            statusBox.className = "p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200";
                            statusBox.innerHTML = `
                                <div class="font-extrabold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                                    <span class="material-symbols-rounded text-base">check_circle</span>
                                    <span>Direkt-Verbindung über deinen Browser erfolgreich! (${discoveredHaSensors.length} Sensoren geladen)</span>
                                </div>
                                <p class="mt-1 text-[11px]">Deine Domain ist aus deinem lokalen Netz/Browser direkt erreichbar (CORS aktiv).</p>
                            `;
                        }
                        return;
                    }
                }
            }
        } catch (directErr) {
            // Ignore direct fallback error and show detailed server diagnostics
        }

        if (statusBox) {
            const safeErr = typeof escapeHtml === 'function' ? escapeHtml(data?.error || 'Verbindung fehlgeschlagen.') : (data?.error || 'Verbindung fehlgeschlagen.');
            statusBox.className = "p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-800 dark:text-rose-200";
            statusBox.innerHTML = `
                <div class="font-extrabold flex items-start gap-1.5 text-rose-600 dark:text-rose-300">
                    <span class="material-symbols-rounded text-base shrink-0">error</span>
                    <span>${safeErr}</span>
                </div>
                ${diagHtml}
                <div class="mt-3 pt-2.5 border-t border-rose-500/20 flex flex-wrap items-center justify-between gap-2">
                    <span class="text-[11px] text-rose-700 dark:text-rose-300 font-semibold">Nutzt du Nginx, Traefik, Cloudflare oder Synology Reverse Proxy?</span>
                    <button type="button" onclick="switchHaModalTab('guide')" class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold transition-colors cursor-pointer">
                        Zur Reverse-Proxy Anleitung & Lösung →
                    </button>
                </div>
            `;
        }
    } catch (err) {
        if (statusBox) {
            statusBox.className = "p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 font-semibold";
            statusBox.innerText = 'Netzwerkfehler: ' + err.message;
        }
    }
}

async function saveHaConfigFromModal() {
    readHaModalIntoState();
    localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));

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

// Auto-initialize once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        initTelemetryAndAnalysis();
    }, 120);
});
