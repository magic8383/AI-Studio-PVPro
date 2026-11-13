// ============================================================================
// TELEMETRY, LIVE DASHBOARD, SANKEY ENERGY FLOW & PERFORMANCE ENGINE (V11.3)
// Zentrale Single Source of Truth (IndexedDB Persistent Device Storage,
// Non-Blocking Baseline Sync, Netzbezug/TV-Wand 7-Tage-Fix & 24h-Klima-Kurven)
// ============================================================================

const DEFAULT_CUSTOM_STRINGS = [
    { id: 'str_fronius_1', name: 'Fronius · String 1 DC', powerEntity: 'sensor.fronius_string_1_power', energyEntity: 'sensor.fronius_string_1_energy_today', color: '#14b8a6' },
    { id: 'str_fronius_2', name: 'Fronius · String 2 DC', powerEntity: 'sensor.fronius_string_2_power', energyEntity: 'sensor.fronius_string_2_energy_today', color: '#f59e0b' },
    { id: 'str_hoymiles', name: 'Hoymiles · gesamt DC', powerEntity: 'sensor.hoymiles_power_dc', energyEntity: '', color: '#22c55e' }
];

const DEFAULT_CUSTOM_CONSUMERS = [
    { id: 'cons_1', name: 'Trockner', powerEntity: 'sensor.trockner_power', energyEntity: '' },
    { id: 'cons_2', name: 'TV-Verstärker', powerEntity: 'sensor.tv_verstaerker_power', energyEntity: '' },
    { id: 'cons_3', name: 'Esszimmer Licht', powerEntity: 'sensor.esszimmer_licht_power', energyEntity: '' },
    { id: 'cons_4', name: 'Küche Licht', powerEntity: 'sensor.kueche_licht_power', energyEntity: '' }
];

let haConfigState = {
    mode: 'poll', // 'poll' | 'webhook'
    baseUrl: 'https://home.mb10.org',
    accessToken: '',
    pollIntervalSec: 10,
    autoSyncMonthly: true,
    trackingStartDate: '2026-11-01',
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
    weatherEntity: '',
    outdoorTempEntity: '',
    customWeatherSensors: [],
    customStrings: JSON.parse(JSON.stringify(DEFAULT_CUSTOM_STRINGS)),
    customConsumers: JSON.parse(JSON.stringify(DEFAULT_CUSTOM_CONSUMERS))
};

let discoveredHaSensors = [];
let lastKnownHaUnitMap = new Map(); // entity_id -> unit_of_measurement (populated from /api/states)
let lastKnownHaStateClassMap = new Map(); // entity_id -> state_class
let lastKnownHaReadingMap = new Map(); // entity_id -> latest numeric reading (scaled to kWh or W)
let lastKnownHaAvailabilityMap = new Map(); // entity_id -> boolean (true if numeric state available)
let sensorDiagnosticsByEntity = {}; // entity_id -> { status, reason, filteredSpikeKwh, spikeDateStr, cleanDeltaKwh, rawDeltaKwh, updatedAt }
if (typeof window !== 'undefined') {
    window.sensorDiagnosticsByEntity = sensorDiagnosticsByEntity;
}
let liveTelemetryTimer = null;
let intradayHistoryTimer = null;

// Baseline cache for computing Today & Month deltas from total_increasing kWh counters without HA helpers
let energyCounterBaselines = {
    schemaVersion: '11.1',
    dayKey: '',
    monthKey: '',
    dayStartByEntity: {},
    monthStartByEntity: {},
    ltsMonthChangeByEntity: {},
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
let consumerSortMode = 'live_first'; // 'live_first' (Prio 1 Live W, Prio 2 Heute kWh) | 'kwh_first' (Prio 1 Heute kWh)
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
let intradayDayZoomMode = 'auto'; // 'auto' (Ab Aktivität + 1h Zukunft) | 'full' (00:00 – +1h)
let intradayDayPanOffsetBuckets = 0; // 5-Minuten-Buckets Verschiebung nach links (<0) oder rechts (>0)
let intradayVisibleStartIdx = 0; // Start-Index des sichtbaren Fensters im Tagesdiagramm
let intradayRealBucketsCount = 0; // Anzahl echter Messpunkte ohne +1h Zukunfts-Padding
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
// 1. INITIALIZATION & PERSISTENCE (INDEXEDDB + SERVER + LOCALSTORAGE)
// ============================================================================

const PVProPersistentDB = (function () {
    const DB_NAME = 'pvpro_persistent_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'app_store';
    let dbPromise = null;

    function openDb() {
        if (dbPromise) return dbPromise;
        if (typeof indexedDB === 'undefined') return Promise.resolve(null);
        dbPromise = new Promise((resolve) => {
            try {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (ev) => {
                    const db = ev.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                req.onsuccess = (ev) => resolve(ev.target.result);
                req.onerror = () => resolve(null);
                req.onblocked = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
        return dbPromise;
    }

    async function get(key) {
        const db = await openDb();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function set(key, value) {
        const db = await openDb();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const req = store.put(value, key);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }

    async function ensurePersistentStorage() {
        try {
            if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
                const persisted = await navigator.storage.persist();
                if (typeof window !== 'undefined') {
                    window.pvproStoragePersisted = Boolean(persisted);
                }
                return Boolean(persisted);
            }
        } catch (e) {}
        return false;
    }

    return { get, set, ensurePersistentStorage };
})();

if (typeof window !== 'undefined') {
    window.PVProPersistentDB = PVProPersistentDB;
}

let climateHistoryCacheByRoom = {}; // roomKey -> { savedAtMs, tempPoints, humPoints }

function persistIntradayHistoryCacheToIdb() {
    try {
        PVProPersistentDB.set('intraday_history_cache', {
            schemaVersion: '11.3',
            savedAtMs: Date.now(),
            dayKey: getTodayAndMonthKeys().dayKey,
            cache: intradayHistoryCache
        });
    } catch (e) {}
}

function persistBarExplorerCacheToIdb() {
    try {
        if (typeof analyseBarExplorerState !== 'undefined' && analyseBarExplorerState.cacheByPeriodKey) {
            PVProPersistentDB.set('bar_explorer_cache', {
                schemaVersion: '11.3',
                savedAtMs: Date.now(),
                cacheByPeriodKey: analyseBarExplorerState.cacheByPeriodKey
            });
        }
    } catch (e) {}
}

async function hydrateFromPersistentIndexedDB() {
    try {
        PVProPersistentDB.ensurePersistentStorage();
        const [
            idbHaCfg,
            idbBaselines,
            idbRecords,
            idbBootSnap,
            idbIntraday,
            idbBarExplorer,
            idbClimateCurves
        ] = await Promise.all([
            PVProPersistentDB.get('ha_config_backup'),
            PVProPersistentDB.get('energy_counter_baselines'),
            PVProPersistentDB.get('performance_records_backup'),
            PVProPersistentDB.get('boot_snapshot'),
            PVProPersistentDB.get('intraday_history_cache'),
            PVProPersistentDB.get('bar_explorer_cache'),
            PVProPersistentDB.get('climate_history_cache')
        ]);

        let needsUiRefresh = false;

        // 1. Self-heal haConfigState if localStorage was evicted by Android OS
        if (idbHaCfg && typeof idbHaCfg === 'object') {
            const hadTokenBefore = Boolean(haConfigState.accessToken);
            if (!hadTokenBefore && idbHaCfg.accessToken) {
                haConfigState = {
                    ...haConfigState,
                    ...idbHaCfg,
                    entities: { ...haConfigState.entities, ...(idbHaCfg.entities || {}) },
                    customWeatherSensors: Array.isArray(idbHaCfg.customWeatherSensors) && idbHaCfg.customWeatherSensors.length > 0
                        ? idbHaCfg.customWeatherSensors
                        : (haConfigState.customWeatherSensors || []),
                    customStrings: Array.isArray(idbHaCfg.customStrings) && idbHaCfg.customStrings.length > 0
                        ? idbHaCfg.customStrings
                        : haConfigState.customStrings,
                    customConsumers: Array.isArray(idbHaCfg.customConsumers)
                        ? idbHaCfg.customConsumers
                        : haConfigState.customConsumers
                };
                try { localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState)); } catch (e) {}
                needsUiRefresh = true;
                startLiveTelemetryLoop();
            } else if ((!Array.isArray(haConfigState.customWeatherSensors) || haConfigState.customWeatherSensors.length === 0) && Array.isArray(idbHaCfg.customWeatherSensors) && idbHaCfg.customWeatherSensors.length > 0) {
                haConfigState.customWeatherSensors = idbHaCfg.customWeatherSensors;
                try { localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState)); } catch (e) {}
                needsUiRefresh = true;
            }
        } else if (haConfigState.accessToken) {
            PVProPersistentDB.set('ha_config_backup', haConfigState);
        }

        // 2. Self-heal energyCounterBaselines from IndexedDB if localStorage had empty baselines
        const keys = getTodayAndMonthKeys();
        if (idbBaselines && typeof idbBaselines === 'object' && idbBaselines.schemaVersion === '11.3') {
            const hasLocalDay = Object.keys(energyCounterBaselines.dayStartByEntity || {}).length > 0;
            const hasLocalMonth = Object.keys(energyCounterBaselines.monthStartByEntity || {}).length > 0;
            if (!hasLocalDay && idbBaselines.dayKey === keys.dayKey && idbBaselines.dayStartByEntity) {
                energyCounterBaselines.dayStartByEntity = { ...idbBaselines.dayStartByEntity };
                needsUiRefresh = true;
            }
            if (!hasLocalMonth && idbBaselines.monthKey === keys.monthKey && idbBaselines.monthStartByEntity) {
                energyCounterBaselines.monthStartByEntity = { ...idbBaselines.monthStartByEntity };
                energyCounterBaselines.ltsMonthChangeByEntity = { ...(idbBaselines.ltsMonthChangeByEntity || {}) };
                needsUiRefresh = true;
            }
            if (needsUiRefresh) {
                healMonthBaselinesAgainstDayBaselines();
                try { localStorage.setItem('pvpro_energy_counter_baselines', JSON.stringify(energyCounterBaselines)); } catch (e) {}
            }
        }

        // 3. Self-heal performanceRecordsByProject from IndexedDB
        if (idbRecords && typeof idbRecords === 'object' && Object.keys(idbRecords).length > 0) {
            if (Object.keys(performanceRecordsByProject).length === 0) {
                performanceRecordsByProject = idbRecords;
                try { localStorage.setItem('pvpro_performance_records', JSON.stringify(performanceRecordsByProject)); } catch (e) {}
                needsUiRefresh = true;
            }
        }

        // 4. Self-heal boot_snapshot if currentLiveTelemetry has not yet received live data
        if (idbBootSnap && typeof idbBootSnap === 'object') {
            if (idbBootSnap.lastValidClimate && typeof idbBootSnap.lastValidClimate === 'object') {
                homeLastValidClimateValues = { ...idbBootSnap.lastValidClimate, ...homeLastValidClimateValues };
            }
            if (!currentLiveTelemetry.updatedAt && idbBootSnap.telemetry) {
                currentLiveTelemetry = {
                    ...currentLiveTelemetry,
                    ...idbBootSnap.telemetry,
                    lastError: null
                };
                needsUiRefresh = true;
            }
            if ((!homeWeatherCache.days || homeWeatherCache.days.length === 0) && idbBootSnap.weatherCache && Array.isArray(idbBootSnap.weatherCache.days)) {
                homeWeatherCache = { ...homeWeatherCache, ...idbBootSnap.weatherCache };
                needsUiRefresh = true;
            }
        }

        // 5. Hydrate intradayHistoryCache (day, week, month) for instant <20ms chart rendering
        if (idbIntraday && idbIntraday.schemaVersion === '11.3' && idbIntraday.cache && typeof idbIntraday.cache === 'object') {
            const isSameDay = idbIntraday.dayKey === keys.dayKey;
            ['day', 'week', 'month'].forEach(tf => {
                if (tf === 'day' && !isSameDay) return;
                const ds = idbIntraday.cache[tf];
                if (!intradayHistoryCache[tf] && ds && Array.isArray(ds.bucketTimes) && ds.bucketTimes.length > 0) {
                    intradayHistoryCache[tf] = ds;
                    if (currentCurveTimeframe === tf && (!intradaySeriesState.bucketTimes || intradaySeriesState.bucketTimes.length === 0)) {
                        intradaySeriesState = {
                            startOfDayIso: ds.startOfDayIso,
                            nowIso: ds.nowIso,
                            labels: ds.labels,
                            bucketTimes: ds.bucketTimes,
                            series: ds.series,
                            integratedKwh: ds.integratedKwh,
                            peakValues: ds.peakValues
                        };
                        needsUiRefresh = true;
                    }
                }
            });
        }

        // 6. Hydrate Bar Explorer cache for instant bar chart rendering
        if (idbBarExplorer && idbBarExplorer.schemaVersion === '11.3' && idbBarExplorer.cacheByPeriodKey && typeof idbBarExplorer.cacheByPeriodKey === 'object') {
            if (typeof analyseBarExplorerState !== 'undefined') {
                analyseBarExplorerState.cacheByPeriodKey = {
                    ...idbBarExplorer.cacheByPeriodKey,
                    ...(analyseBarExplorerState.cacheByPeriodKey || {})
                };
            }
        }

        // 7. Hydrate 24h Room Climate curve cache
        if (idbClimateCurves && typeof idbClimateCurves === 'object') {
            climateHistoryCacheByRoom = { ...idbClimateCurves, ...climateHistoryCacheByRoom };
        }

        if (needsUiRefresh) {
            try {
                renderHomeTab();
                renderLiveCockpitUI();
            } catch (e) {}
        }
    } catch (e) {}
}

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
        const savedSort = localStorage.getItem('pvpro_consumer_sort_mode');
        if (savedSort === 'kwh_first' || savedSort === 'live_first') {
            consumerSortMode = savedSort;
        }
        const savedDayZoom = localStorage.getItem('pvpro_intraday_day_zoom');
        if (savedDayZoom === 'full' || savedDayZoom === 'auto') {
            intradayDayZoomMode = savedDayZoom;
        }
    } catch (e) {}

    // Load cached kWh total counter baselines for Today / Month delta calculation
    loadEnergyCounterBaselines();

    // 1. Load local cached HA config & performance records synchronously (0 ms)
    try {
        const localHa = localStorage.getItem('pvpro_ha_config');
        if (localHa) {
            const parsed = JSON.parse(localHa);
            haConfigState = {
                ...haConfigState,
                ...parsed,
                entities: { ...haConfigState.entities, ...(parsed.entities || {}) },
                pvEnergyExtraEntities: Array.isArray(parsed.pvEnergyExtraEntities) ? parsed.pvEnergyExtraEntities : (haConfigState.pvEnergyExtraEntities || []),
                weatherEntity: typeof parsed.weatherEntity === 'string' ? parsed.weatherEntity : (haConfigState.weatherEntity || ''),
                outdoorTempEntity: typeof parsed.outdoorTempEntity === 'string' ? parsed.outdoorTempEntity : (haConfigState.outdoorTempEntity || ''),
                customWeatherSensors: Array.isArray(parsed.customWeatherSensors) && parsed.customWeatherSensors.length > 0
                    ? parsed.customWeatherSensors
                    : (haConfigState.customWeatherSensors || []),
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

    // 1B. INSTANT 0ms BOOT SNAPSHOT: Immediately restore last known live values, weather & room climate before any network await!
    restoreInstantBootSnapshot();
    try {
        renderHomeTab();
        renderLiveCockpitUI();
    } catch (e) {}

    // 1B-2. Hydrate persistent IndexedDB storage BEFORE starting live loop (~10ms local read)
    // so cached charts (Tag/Woche/Monat), baselines & HA config are immediately in memory!
    await hydrateFromPersistentIndexedDB();

    // 1C. Fire immediate live states poll right away (without waiting for /api/ha/config or 24h history)
    if (haConfigState.baseUrl && haConfigState.accessToken) {
        startLiveTelemetryLoop();
    }

    // 2. Sync with backend server asynchronously in background (safe on GitHub Pages / static hosts)
    try {
        const [haRes, recRes] = await Promise.all([
            safeFetchBackendJson('/api/ha/config'),
            safeFetchBackendJson('/api/performance/records')
        ]);

        if (haRes.ok && haRes.data && haRes.data.success && haRes.data.config) {
            const srvCfg = haRes.data.config;
            haConfigState = {
                ...haConfigState,
                ...srvCfg,
                accessToken: srvCfg.accessToken || haConfigState.accessToken || '',
                entities: { ...haConfigState.entities, ...(srvCfg.entities || {}) },
                pvEnergyExtraEntities: Array.isArray(srvCfg.pvEnergyExtraEntities) && srvCfg.pvEnergyExtraEntities.length > 0
                    ? srvCfg.pvEnergyExtraEntities
                    : (haConfigState.pvEnergyExtraEntities || []),
                weatherEntity: (typeof srvCfg.weatherEntity === 'string' && srvCfg.weatherEntity) ? srvCfg.weatherEntity : (haConfigState.weatherEntity || ''),
                outdoorTempEntity: (typeof srvCfg.outdoorTempEntity === 'string' && srvCfg.outdoorTempEntity) ? srvCfg.outdoorTempEntity : (haConfigState.outdoorTempEntity || ''),
                customWeatherSensors: Array.isArray(srvCfg.customWeatherSensors) && srvCfg.customWeatherSensors.length > 0
                    ? srvCfg.customWeatherSensors
                    : (haConfigState.customWeatherSensors || []),
                customStrings: Array.isArray(srvCfg.customStrings) && srvCfg.customStrings.length > 0 ? srvCfg.customStrings : haConfigState.customStrings,
                customConsumers: Array.isArray(srvCfg.customConsumers) && srvCfg.customConsumers.length > 0 ? srvCfg.customConsumers : haConfigState.customConsumers
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

    // Start live telemetry loop if Home or Live tab is active
    const homeTab = document.getElementById('tab-home');
    const liveTab = document.getElementById('tab-live');
    if ((homeTab && homeTab.classList.contains('active')) || (liveTab && liveTab.classList.contains('active'))) {
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
        return;
    }
    // One-time reset of any v10.2 filtered month cache so v10.3 immediately shows 1:1 unfiltered HA values
    if (existingYearRec.schemaHealed === '10.2') {
        const now = new Date();
        if (Number(year) === now.getFullYear()) {
            const curM = now.getMonth();
            const mObj = existingYearRec.months[curM];
            if (mObj && mObj.source === 'ha') {
                mObj.pvYieldKwh = null;
            }
        }
        existingYearRec.schemaHealed = '10.3';
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
        PVProPersistentDB.set('performance_records_backup', performanceRecordsByProject);
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
            if (parsed && typeof parsed === 'object' && parsed.schemaVersion === '11.3') {
                energyCounterBaselines = {
                    schemaVersion: '11.3',
                    dayKey: keys.dayKey,
                    monthKey: keys.monthKey,
                    dayStartByEntity: parsed.dayKey === keys.dayKey ? (parsed.dayStartByEntity || {}) : {},
                    monthStartByEntity: parsed.monthKey === keys.monthKey ? (parsed.monthStartByEntity || {}) : {},
                    ltsMonthChangeByEntity: parsed.monthKey === keys.monthKey ? (parsed.ltsMonthChangeByEntity || {}) : {},
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
        schemaVersion: '11.3',
        dayKey: keys.dayKey,
        monthKey: keys.monthKey,
        dayStartByEntity: {},
        monthStartByEntity: {},
        ltsMonthChangeByEntity: {},
        lastHistorySyncMs: 0,
        lastLongTermSyncMs: 0
    };
    saveEnergyCounterBaselines();
}

function saveEnergyCounterBaselines() {
    try {
        energyCounterBaselines.schemaVersion = '11.3';
        localStorage.setItem('pvpro_energy_counter_baselines', JSON.stringify(energyCounterBaselines));
        PVProPersistentDB.set('energy_counter_baselines', energyCounterBaselines);
    } catch (e) {}
}

function setSensorDiagnostic(entityId, diagObj) {
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return;
    const prev = sensorDiagnosticsByEntity[cleanId] || {};
    sensorDiagnosticsByEntity[cleanId] = {
        ...prev,
        ...diagObj,
        // Preserve any detected jumpInfo notice while status/readings update
        jumpInfo: diagObj.jumpInfo !== undefined ? diagObj.jumpInfo : prev.jumpInfo,
        jumpKwh: diagObj.jumpKwh !== undefined ? diagObj.jumpKwh : prev.jumpKwh,
        entityId: cleanId,
        updatedAt: Date.now()
    };
}

function getSensorDiagnostic(entityId) {
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return null;
    return sensorDiagnosticsByEntity[cleanId] || null;
}

function renderEntityDiagnosticSubline(entityId) {
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return '';
    const d = getSensorDiagnostic(cleanId);
    if (!d) return '';
    const safeReason = typeof escapeHtml === 'function' ? escapeHtml(d.reason || '') : (d.reason || '');
    const fmtNum = (v, dec = 2) => (v !== undefined && v !== null && !isNaN(v))
        ? Number(v).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : '–';

    if (d.status === 'unavailable' || d.status === 'wrong_unit' || d.status === 'fallback_watt') {
        return `<div class="mt-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] font-semibold text-amber-700 dark:text-amber-300 flex items-start gap-1 break-words max-w-full overflow-hidden">
            <span class="material-symbols-rounded text-xs shrink-0 mt-0.5">info</span>
            <span class="break-words min-w-0">${safeReason || 'Sensor liefert aktuell keinen kWh-Wert → Berechnung aus Live-Watt'}</span>
        </div>`;
    }

    let html = '';
    if (d.currentKwh !== undefined && d.currentKwh !== null) {
        const parts = [`Aktuell: ${fmtNum(d.currentKwh, 2)} kWh`];
        if (d.deltaTodayKwh !== undefined && d.deltaTodayKwh !== null) {
            const bDay = d.baseTodayKwh !== undefined && d.baseTodayKwh !== null ? ` (00:00: ${fmtNum(d.baseTodayKwh, 2)})` : '';
            parts.push(`Heute: +${fmtNum(d.deltaTodayKwh, 2)} kWh${bDay}`);
        }
        if (d.deltaMonthKwh !== undefined && d.deltaMonthKwh !== null) {
            const bMo = d.baseMonthKwh !== undefined && d.baseMonthKwh !== null ? ` (Start: ${fmtNum(d.baseMonthKwh, 1)})` : '';
            parts.push(`Monat: +${fmtNum(d.deltaMonthKwh, 1)} kWh${bMo}`);
        }
        html += `<div class="mt-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-800 dark:text-emerald-300 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 break-words max-w-full overflow-hidden">
            <span class="font-bold">✓ 1:1 kWh-Zähler aktiv</span>
            <span class="break-words min-w-0">${parts.join(' · ')}</span>
        </div>`;
    }

    if (d.jumpInfo) {
        const safeJump = typeof escapeHtml === 'function' ? escapeHtml(d.jumpInfo) : d.jumpInfo;
        html += `<div class="mt-1 px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-[10px] font-semibold text-sky-800 dark:text-sky-300 flex items-start gap-1 break-words max-w-full overflow-hidden">
            <span class="material-symbols-rounded text-xs shrink-0 mt-0.5">info</span>
            <span class="break-words min-w-0">${safeJump} (wird 1:1 ungefiltert mitgezählt)</span>
        </div>`;
    }
    return html;
}

function getEffectiveTrackingStartDate(cfg = haConfigState) {
    const rawStr = String(cfg?.trackingStartDate || haConfigState?.trackingStartDate || '2026-11-01').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawStr);
    if (!m) return new Date(2026, 10, 1, 0, 0, 0);
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(y, mo, d, 0, 0, 0);
    return isNaN(dt.getTime()) ? new Date(2026, 10, 1, 0, 0, 0) : dt;
}

function isConsumerEnergyEntity(entityId, cfg = haConfigState) {
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return false;
    const consumers = cfg?.customConsumers || haConfigState?.customConsumers || [];
    return consumers.some(cc => String(cc?.energyEntity || '').trim() === cleanId);
}

function isEntityCumulativeTotal(entityId, statesMap = null, forceCumulative = false) {
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return false;
    const st = statesMap ? statesMap.get(cleanId) : null;
    const friendly = String(st?.attributes?.friendly_name || '').toLowerCase();
    const idLower = cleanId.toLowerCase();
    const combined = `${idLower} ${friendly}`;

    // 1. Check if sensor explicitly resets daily (including compound names like yieldday, energy_day, today, heute)
    const isExplicitDaily = /(?:^|[\s_.\-])(today|heute|daily|tag|tages|tagesertrag|day)(?:$|[\s_.\-])/i.test(combined)
        || /(yieldday|energyday|tagesertrag|heute_kwh)/i.test(combined);
    const hasExplicitTotalWord = /(total|gesamt|lifetime|yieldtotal|energytotal|gesamtertrag|zählerstand|zaehlerstand)/i.test(combined);
    if (isExplicitDaily && !hasExplicitTotalWord) {
        return false;
    }

    if (forceCumulative) return true;

    // Default all other kWh/Wh counters (such as Shelly/Tasmota/Smart-Plug energy sensors like sensor.tv_wand_energy)
    // to cumulative (true) so their lifetime counter reading is never mistaken for a single-day delta before baselines load!
    return true;
}

function resolveEnergyCounterDelta(entityId, currentValKwh, baselineMap, options = {}) {
    const cleanId = String(entityId || '').trim();
    if (!cleanId) return currentValKwh;

    if (currentValKwh === null || currentValKwh === undefined || isNaN(currentValKwh)) {
        const availState = lastKnownHaAvailabilityMap.get(cleanId);
        if (availState && availState !== 'ok') {
            setSensorDiagnostic(cleanId, {
                status: availState === 'wrong_unit' ? 'wrong_unit' : 'unavailable',
                reason: availState === 'wrong_unit'
                    ? `Falsche Einheit (${lastKnownHaUnitMap.get(cleanId) || 'W'} statt kWh) → aus W berechnet`
                    : `Sensor liefert '${availState}' in HA → aus Live-W berechnet`
            });
        }
        return null;
    }

    const { isCumulative = false, upperBoundMap = null, ltsOverrideMap = null } = options;
    const isMonthPeriod = Boolean(ltsOverrideMap || upperBoundMap);

    // 1. If Home Assistant Long-Term Statistics provided the monthly change for this entity, return it 1:1 unfiltered!
    const ltsChangeVal = ltsOverrideMap?.[cleanId];
    if (ltsChangeVal !== undefined && ltsChangeVal !== null && !isNaN(ltsChangeVal) && ltsChangeVal >= 0) {
        const ltsDerivedBase = +Math.max(0, currentValKwh - ltsChangeVal).toFixed(3);
        if (baselineMap) {
            baselineMap[cleanId] = ltsDerivedBase;
        }
        setSensorDiagnostic(cleanId, {
            status: 'ok',
            currentKwh: +currentValKwh.toFixed(2),
            baseMonthKwh: +ltsDerivedBase.toFixed(2),
            deltaMonthKwh: +ltsChangeVal.toFixed(2)
        });
        return +ltsChangeVal.toFixed(3);
    }

    let baseVal = baselineMap?.[cleanId];

    // 2. Enforce mathematical invariant: monthStart <= dayStart
    const upperBoundVal = upperBoundMap?.[cleanId];
    if (upperBoundVal !== undefined && upperBoundVal !== null && !isNaN(upperBoundVal)) {
        if (baseVal === undefined || baseVal === null || isNaN(baseVal) || baseVal > upperBoundVal) {
            baseVal = upperBoundVal;
            if (baselineMap) baselineMap[cleanId] = baseVal;
            saveEnergyCounterBaselines();
        }
    }

    // 3. Auto-heal if a legacy baseline was stored in Wh while currentValKwh is in kWh
    if (baseVal !== undefined && baseVal !== null && !isNaN(baseVal) && currentValKwh > 0 && baseVal > currentValKwh * 150) {
        baseVal = +(baseVal / 1000).toFixed(3);
        if (baselineMap) baselineMap[cleanId] = baseVal;
        saveEnergyCounterBaselines();
    }

    // 4. If baseline is not yet loaded from HA history:
    // For daily-resetting sensors (!isCumulative), currentValKwh IS the period value.
    // For cumulative sensors, wait for syncEnergyCounterBaselinesFromHaHistory / syncLongTermStatisticsFromHa without overwriting baselineMap!
    if (baseVal === undefined || baseVal === null || isNaN(baseVal)) {
        if (!isCumulative) {
            const val = +Math.max(0, currentValKwh).toFixed(3);
            setSensorDiagnostic(cleanId, {
                status: 'ok',
                currentKwh: +currentValKwh.toFixed(2),
                ...(isMonthPeriod ? { baseMonthKwh: 0, deltaMonthKwh: val } : { baseTodayKwh: 0, deltaTodayKwh: val })
            });
            return val;
        }
        setSensorDiagnostic(cleanId, {
            status: 'ok',
            currentKwh: +currentValKwh.toFixed(2)
        });
        return null;
    }

    // 5. Compute 1:1 unfiltered delta (currentValKwh - baseVal)
    if (currentValKwh >= baseVal) {
        const delta = +Math.max(0, currentValKwh - baseVal).toFixed(3);
        setSensorDiagnostic(cleanId, {
            status: 'ok',
            currentKwh: +currentValKwh.toFixed(2),
            ...(isMonthPeriod
                ? { baseMonthKwh: +baseVal.toFixed(2), deltaMonthKwh: +delta.toFixed(2) }
                : { baseTodayKwh: +baseVal.toFixed(2), deltaTodayKwh: +delta.toFixed(2) })
        });
        return delta;
    } else {
        // Sensor reset to a lower value (e.g. daily counter reset at midnight)
        if (!isCumulative) {
            if (baselineMap) baselineMap[cleanId] = 0;
            saveEnergyCounterBaselines();
            const val = +Math.max(0, currentValKwh).toFixed(3);
            setSensorDiagnostic(cleanId, {
                status: 'ok',
                currentKwh: +currentValKwh.toFixed(2),
                ...(isMonthPeriod ? { baseMonthKwh: 0, deltaMonthKwh: val } : { baseTodayKwh: 0, deltaTodayKwh: val })
            });
            return val;
        }
        if (baselineMap) baselineMap[cleanId] = +currentValKwh.toFixed(3);
        saveEnergyCounterBaselines();
        return 0;
    }
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

let isBaselineSyncInFlight = false;

async function syncEnergyCounterBaselinesFromHaHistory(cfg, statesMap = null) {
    if (isBaselineSyncInFlight) return;
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
        ...(cfg.customStrings || []).map(cs => cs?.energyEntity),
        ...(cfg.customConsumers || []).map(cc => cc?.energyEntity)
    ].map(x => String(x || '').trim()).filter(Boolean);

    // Filter out unconfigured default placeholder entity IDs that do not exist in Home Assistant!
    // Previously, non-existent placeholders kept allHaveBaselines === false forever, forcing heavy history downloads every 10s.
    const uniqueEntities = [...new Set(counterEntities)].filter(entId => {
        if (statesMap) {
            return extractHaNumericClient(statesMap, entId, 'kWh') !== null;
        }
        return lastKnownHaAvailabilityMap.get(entId) === 'ok' || lastKnownHaReadingMap.has(entId);
    });
    if (uniqueEntities.length === 0) return;

    healMonthBaselinesAgainstDayBaselines();

    const entitiesMissingDayBaseline = uniqueEntities.filter(
        id => energyCounterBaselines.dayStartByEntity[id] === undefined || energyCounterBaselines.dayStartByEntity[id] === null
    );
    const needsLtsMonthSync = uniqueEntities.some(
        id => energyCounterBaselines.monthStartByEntity[id] === undefined || energyCounterBaselines.monthStartByEntity[id] === null
    ) || (Date.now() - (energyCounterBaselines.lastLongTermSyncMs || 0) > 10 * 60 * 1000);

    if (entitiesMissingDayBaseline.length === 0 && (Date.now() - (energyCounterBaselines.lastHistorySyncMs || 0) < 10 * 60 * 1000)) {
        if (needsLtsMonthSync) {
            syncLongTermStatisticsFromHa(cfg, statesMap, false);
        }
        return;
    }

    const extractPeriodStartReading = (entityHistoryArr, periodStartMs) => {
        if (!Array.isArray(entityHistoryArr) || entityHistoryArr.length === 0) return null;
        const entId = entityHistoryArr[0]?.entity_id;
        const scale = getEnergyScaleForEntity(entId, statesMap);
        const isCum = isEntityCumulativeTotal(entId, statesMap, false);
        const isConsumer = isConsumerEnergyEntity(entId, cfg);
        const maxSingleStepKwh = isConsumer ? 4.0 : 25.0;
        const initJumpThresholdKwh = isConsumer ? 4.0 : 15.0;

        let prevPtVal = null;
        let validDeltaSum = 0;
        let hadOffsetJump = false;
        let latestVal = null;
        let firstValidVal = null;
        let minPositiveVal = null;
        let earliestTs = Infinity;

        for (let i = 0; i < entityHistoryArr.length; i++) {
            const pt = entityHistoryArr[i];
            const rawNum = parseFloat(String(pt.state).replace(',', '.'));
            if (isNaN(rawNum) || rawNum < 0) continue;
            const v = rawNum * scale;
            const ts = new Date(pt.last_changed || pt.last_updated || periodStartMs).getTime();
            if (!isNaN(ts) && ts < earliestTs) earliestTs = ts;
            if (firstValidVal === null) firstValidVal = v;
            if (v > 0 && (minPositiveVal === null || v < minPositiveVal)) minPositiveVal = v;
            latestVal = v;

            if (prevPtVal !== null) {
                const diff = v >= prevPtVal
                    ? (v - prevPtVal)
                    : ((v < 0.5 && prevPtVal > 2.0) ? v : 0);
                const isJump = isCum && (
                    ((prevPtVal <= 2.0) && diff >= initJumpThresholdKwh) ||
                    diff >= maxSingleStepKwh
                );
                if (isJump) {
                    hadOffsetJump = true;
                    const jumpVal = +diff.toFixed(1);
                    const dt = new Date(pt.last_changed || pt.last_updated || periodStartMs);
                    const dateStr = !isNaN(dt.getTime())
                        ? dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
                        : '';
                    setSensorDiagnostic(entId, {
                        status: 'ok',
                        jumpKwh: jumpVal,
                        jumpInfo: `Zähler-Sprung von ${prevPtVal.toFixed(1).replace('.', ',')} → ${v.toFixed(1).replace('.', ',')} kWh (+${jumpVal.toFixed(1).replace('.', ',')} kWh${dateStr ? ' am ' + dateStr : ''}) automatisch herausgerechnet`
                    });
                } else if (diff > 0) {
                    validDeltaSum += diff;
                }
            }
            prevPtVal = v;
        }

        const curLiveVal = statesMap ? extractHaNumericClient(statesMap, entId, 'kWh') : (lastKnownHaReadingMap.get(entId) ?? latestVal);
        const refEndVal = (curLiveVal !== null && !isNaN(curLiveVal) && (latestVal === null || curLiveVal >= latestVal))
            ? curLiveVal
            : latestVal;

        if (hadOffsetJump && refEndVal !== null) {
            return {
                val: +Math.max(0, refEndVal - validDeltaSum).toFixed(3),
                coversStart: true
            };
        }

        const chosenVal = minPositiveVal !== null ? minPositiveVal : firstValidVal;
        return chosenVal !== null ? { val: chosenVal, coversStart: earliestTs <= (periodStartMs + 6 * 3600 * 1000) } : null;
    };

    isBaselineSyncInFlight = true;
    try {
        const queryEntities = entitiesMissingDayBaseline.length > 0 ? entitiesMissingDayBaseline : uniqueEntities;
        const filterParam = encodeURIComponent(queryEntities.join(','));
        const nowIso = new Date().toISOString();

        // Fast Today-only REST query (without significant_changes_only=0 so payload is minimal and fast!)
        const dayHistRes = await fetchHaDirectFromBrowser(
            cfg.baseUrl,
            cfg.accessToken,
            `/api/history/period/${encodeURIComponent(keys.startOfDayIso)}?end_time=${encodeURIComponent(nowIso)}&filter_entity_id=${filterParam}&minimal_response&no_attributes`
        );

        const dayStartMs = new Date(keys.startOfDayIso).getTime();
        if (dayHistRes.ok && Array.isArray(dayHistRes.data)) {
            dayHistRes.data.forEach(arr => {
                const entId = arr?.[0]?.entity_id;
                const res = extractPeriodStartReading(arr, dayStartMs);
                if (entId && res && res.val !== null) {
                    const existing = energyCounterBaselines.dayStartByEntity[entId];
                    if (existing === undefined || existing === null || res.coversStart || res.val <= existing) {
                        energyCounterBaselines.dayStartByEntity[entId] = +res.val.toFixed(3);
                    }
                }
            });
            uniqueEntities.forEach(entId => {
                if (energyCounterBaselines.dayStartByEntity[entId] === undefined || energyCounterBaselines.dayStartByEntity[entId] === null) {
                    const curReading = statesMap ? extractHaNumericClient(statesMap, entId, 'kWh') : (lastKnownHaReadingMap.get(entId) ?? null);
                    if (curReading !== null && !isNaN(curReading) && curReading >= 0) {
                        energyCounterBaselines.dayStartByEntity[entId] = +curReading.toFixed(3);
                    }
                }
            });
        }

        // Seed any still-missing month baseline with dayStart until WebSocket LTS completes (~60ms)
        uniqueEntities.forEach(entId => {
            if (energyCounterBaselines.monthStartByEntity[entId] === undefined || energyCounterBaselines.monthStartByEntity[entId] === null) {
                const fallbackVal = energyCounterBaselines.dayStartByEntity[entId]
                    ?? (statesMap ? extractHaNumericClient(statesMap, entId, 'kWh') : (lastKnownHaReadingMap.get(entId) ?? null));
                if (fallbackVal !== null && fallbackVal !== undefined && !isNaN(fallbackVal) && fallbackVal >= 0) {
                    energyCounterBaselines.monthStartByEntity[entId] = +Number(fallbackVal).toFixed(3);
                }
            }
        });

        healMonthBaselinesAgainstDayBaselines();
        energyCounterBaselines.lastHistorySyncMs = Date.now();
        saveEnergyCounterBaselines();

        // Sync 1st-of-month baselines and monthly logbook via fast WebSocket Long-Term Statistics (~60ms instead of 13d raw history!)
        if (needsLtsMonthSync) {
            await syncLongTermStatisticsFromHa(cfg, statesMap, false);
        }
    } catch (err) {
    } finally {
        isBaselineSyncInFlight = false;
    }
}

function parseHaStatTimestampMs(rawTs) {
    if (typeof rawTs === 'number') {
        return rawTs < 1e11 ? rawTs * 1000 : rawTs;
    }
    if (typeof rawTs === 'string') {
        const trimmed = rawTs.trim();
        if (!trimmed) return NaN;
        const num = Number(trimmed);
        if (!isNaN(num)) {
            return num < 1e11 ? num * 1000 : num;
        }
        return new Date(trimmed).getTime();
    }
    return NaN;
}

function getEffectiveTimeframeWindow(cfg = haConfigState, timeframe = currentCurveTimeframe) {
    const now = new Date();
    const startOfDayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
    const trackDate = getEffectiveTrackingStartDate(cfg);
    const trackMs = trackDate.getTime();

    if (timeframe === 'month') {
        const rawStartMs = now.getTime() - 30 * 24 * 3600 * 1000;
        const boundedByTrackingStart = (trackMs <= now.getTime() && trackMs > rawStartMs);
        const effStartMs = Math.min(startOfDayMs, boundedByTrackingStart ? trackMs : rawStartMs);
        const startTime = new Date(effStartMs);
        const spanDays = Math.max(1, (now.getTime() - effStartMs) / (24 * 3600 * 1000));
        const stepMs = spanDays <= 14 ? (60 * 60 * 1000) : (3 * 3600 * 1000);
        return {
            now,
            startTime,
            stepMs,
            boundedByTrackingStart,
            trackDate,
            spanDays
        };
    }

    if (timeframe === 'week') {
        const rawStartMs = now.getTime() - 7 * 24 * 3600 * 1000;
        const boundedByTrackingStart = (trackMs <= now.getTime() && trackMs > rawStartMs);
        const effStartMs = Math.min(startOfDayMs, boundedByTrackingStart ? trackMs : rawStartMs);
        const startTime = new Date(effStartMs);
        const spanDays = Math.max(1, (now.getTime() - effStartMs) / (24 * 3600 * 1000));
        const stepMs = 60 * 60 * 1000; // 1-Stunden-Schritte für 7 Tage
        return {
            now,
            startTime,
            stepMs,
            boundedByTrackingStart,
            trackDate,
            spanDays
        };
    }

    return {
        now,
        startTime: new Date(startOfDayMs),
        stepMs: 5 * 60 * 1000, // 5-Minuten-Schritte für heute
        boundedByTrackingStart: false,
        trackDate,
        spanDays: 1
    };
}

function fetchHaLongTermStatisticsWs(rawBaseUrl, rawToken, statisticIds, startTimeIso, endTimeIso, period = 'month', customTypes = null) {
    return new Promise((resolve) => {
        const cleanUrl = normalizeHaUrlClient(rawBaseUrl);
        const cleanTok = cleanHaTokenClient(rawToken);
        if (!cleanUrl || !cleanTok || !Array.isArray(statisticIds) || statisticIds.length === 0) {
            resolve({ ok: false, error: 'URL, Token oder Zähler-Sensoren fehlen.' });
            return;
        }

        const wsBase = cleanUrl.replace(/^http/i, 'ws');
        const wsUrl = `${wsBase}/api/websocket`;
        const reqTypes = Array.isArray(customTypes) && customTypes.length > 0
            ? customTypes
            : ['change', 'state', 'sum'];
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
                            types: reqTypes
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
    const consumerEnergyIds = (cfg.customConsumers || []).map(cc => String(cc?.energyEntity || '').trim()).filter(Boolean);
    const effectivePvIds = pvCounterIds.length > 0 ? pvCounterIds : stringEnergyIds;

    const allStatIds = [...new Set([
        ...effectivePvIds,
        ...stringEnergyIds,
        ...consumerEnergyIds,
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
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const targetYear = selectedAnalysisYear || curYear;

    const trackDate = getEffectiveTrackingStartDate(cfg);
    const trackMs = trackDate.getTime();
    const startOfYearMs = new Date(targetYear, 0, 1, 0, 0, 0).getTime();
    const queryStartMs = Math.max(startOfYearMs, trackMs <= now.getTime() ? trackMs : startOfYearMs);
    const queryStartIso = new Date(queryStartMs).toISOString();
    const endOfPeriodIso = targetYear === curYear
        ? now.toISOString()
        : new Date(targetYear, 11, 31, 23, 59, 59).toISOString();

    // Query daily statistics from max(startOfYear, trackingStartDate) so we can aggregate exact post-trackingStartDate monthly totals
    // and also get exact current-month change even when total_increasing sensors have state === null in HA!
    const wsRes = await fetchHaLongTermStatisticsWs(
        cfg.baseUrl,
        cfg.accessToken,
        allStatIds,
        queryStartIso,
        endOfPeriodIso,
        'day',
        ['change', 'state', 'sum', 'max', 'mean']
    );
    if (!wsRes.ok || !wsRes.data) {
        if (showToast && typeof showToastNotification === 'function') {
            showToastNotification(wsRes.error || 'HA Langzeit-Statistik konnte nicht abgerufen werden.', 'warning');
        }
        return false;
    }

    const statsByEntity = wsRes.data;

    // Aggregate daily buckets per month (with protection against initial counter offset jumps)
    const monthlyAggByEntity = {};
    allStatIds.forEach(entId => {
        const buckets = statsByEntity[entId];
        if (!Array.isArray(buckets) || buckets.length === 0) return;
        const scale = getEnergyScaleForEntity(entId, statesMap);
        const isConsumer = isConsumerEnergyEntity(entId, cfg);
        const maxDailyStepKwh = isConsumer ? 15.0 : 180.0;
        const initJumpMinKwh = isConsumer ? 4.0 : 40.0;
        const byMonth = {};
        let prevBucketState = null;

        buckets.forEach(b => {
            const bStartMs = parseHaStatTimestampMs(b.start);
            const rawNum = typeof b.state === 'number'
                ? b.state
                : (typeof b.sum === 'number'
                    ? b.sum
                    : (typeof b.max === 'number' ? b.max : (typeof b.mean === 'number' ? b.mean : null)));
            const rawStVal = rawNum !== null && !isNaN(rawNum) ? (rawNum * scale) : null;
            if (isNaN(bStartMs) || bStartMs < (trackMs - 12 * 3600 * 1000)) {
                if (rawStVal !== null && !isNaN(rawStVal) && rawStVal > 0) prevBucketState = rawStVal;
                return;
            }
            const bDate = new Date(bStartMs);
            if (bDate.getFullYear() !== targetYear) return;
            const mIdx = bDate.getMonth();
            if (!byMonth[mIdx]) {
                byMonth[mIdx] = { changeSum: 0, hasChange: false, firstState: null, lastState: null, jumpOffsetSum: 0 };
            }
            if (typeof b.change === 'number' && !isNaN(b.change)) {
                const dKwh = Math.max(0, b.change * scale);
                const isInitialOffsetJump = ((prevBucketState === null || prevBucketState <= 5.0) && dKwh >= initJumpMinKwh)
                    || dKwh >= maxDailyStepKwh;
                if (!isInitialOffsetJump) {
                    byMonth[mIdx].changeSum += dKwh;
                    byMonth[mIdx].hasChange = true;
                } else {
                    byMonth[mIdx].jumpOffsetSum += dKwh;
                    const dateStr = bDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                    setSensorDiagnostic(entId, {
                        status: 'ok',
                        jumpKwh: +dKwh.toFixed(1),
                        jumpInfo: `Start-Zählerstand ${dKwh.toFixed(1).replace('.', ',')} kWh am ${dateStr} als Basis kalibriert`
                    });
                }
            } else if (rawStVal !== null && prevBucketState !== null && prevBucketState > 0.5) {
                const stepDiff = rawStVal >= prevBucketState ? (rawStVal - prevBucketState) : 0;
                const isStepJump = ((prevBucketState <= 5.0) && stepDiff >= initJumpMinKwh) || stepDiff >= maxDailyStepKwh;
                if (stepDiff >= 0 && !isStepJump) {
                    byMonth[mIdx].changeSum += stepDiff;
                    byMonth[mIdx].hasChange = true;
                } else if (isStepJump) {
                    byMonth[mIdx].jumpOffsetSum += stepDiff;
                }
            }
            if (rawStVal !== null && !isNaN(rawStVal) && rawStVal > 0.1) {
                if (byMonth[mIdx].firstState === null) byMonth[mIdx].firstState = rawStVal;
                byMonth[mIdx].lastState = rawStVal;
                prevBucketState = rawStVal;
            }
        });
        monthlyAggByEntity[entId] = byMonth;
    });

    // 1. Update current month's exact LTS change & reconstruct 1st-of-month baseline
    if (targetYear === curYear) {
        if (!energyCounterBaselines.ltsMonthChangeByEntity) {
            energyCounterBaselines.ltsMonthChangeByEntity = {};
        }
        allStatIds.forEach(entId => {
            const mInfo = monthlyAggByEntity[entId]?.[curMonth];
            if (!mInfo) return;
            const curLiveReading = statesMap ? extractHaNumericClient(statesMap, entId, 'kWh') : (lastKnownHaReadingMap.get(entId) ?? null);
            const effEndReading = (curLiveReading !== null && (mInfo.lastState === null || curLiveReading >= mInfo.lastState))
                ? curLiveReading
                : mInfo.lastState;
            const rawSpanFromState = (mInfo.firstState !== null && mInfo.firstState > 0.1 && effEndReading !== null && effEndReading >= mInfo.firstState)
                ? Math.max(0, effEndReading - mInfo.firstState)
                : 0;
            const cleanSpanFromState = Math.max(0, rawSpanFromState - (mInfo.jumpOffsetSum || 0));
            const liveTailDelta = (curLiveReading !== null && mInfo.lastState !== null && curLiveReading > mInfo.lastState && (curLiveReading - mInfo.lastState) < 25)
                ? (curLiveReading - mInfo.lastState)
                : 0;
            const totalChangeWithTail = mInfo.changeSum + liveTailDelta;
            if (!mInfo.hasChange && cleanSpanFromState <= 0) return;

            // Never let rawSpanFromState overwrite a jump-filtered changeSum!
            const monthChangeKwh = mInfo.hasChange
                ? +((cleanSpanFromState > 0 && totalChangeWithTail > cleanSpanFromState * 1.15 + 8) ? cleanSpanFromState : totalChangeWithTail).toFixed(3)
                : +cleanSpanFromState.toFixed(3);
            energyCounterBaselines.ltsMonthChangeByEntity[entId] = monthChangeKwh;

            if (curLiveReading !== null && curLiveReading >= monthChangeKwh) {
                energyCounterBaselines.monthStartByEntity[entId] = +Math.max(0, curLiveReading - monthChangeKwh).toFixed(3);
            } else if (mInfo.lastState !== null && mInfo.lastState >= monthChangeKwh) {
                energyCounterBaselines.monthStartByEntity[entId] = +Math.max(0, mInfo.lastState - monthChangeKwh).toFixed(3);
            }
        });

        healMonthBaselinesAgainstDayBaselines();
        energyCounterBaselines.lastLongTermSyncMs = Date.now();
        saveEnergyCounterBaselines();
    }

    // 2. Populate monthly logbook (performanceRecordsByProject) for months >= trackingStartDate
    const extractEntityMonthlyChange = (entId, monthIdx) => {
        const cleanId = String(entId || '').trim();
        if (!cleanId) return null;
        const mInfo = monthlyAggByEntity[cleanId]?.[monthIdx];
        if (mInfo && mInfo.hasChange) {
            return +Math.max(0, mInfo.changeSum).toFixed(1);
        }
        return null;
    };

    const months = getCurrentYearMonthsData(targetYear);
    let updatedMonthsCount = 0;
    const maxMonthIdx = targetYear === curYear ? curMonth : 11;

    for (let m = 0; m <= 11; m++) {
        if (!months[m]) continue;
        const monthEndMs = new Date(targetYear, m + 1, 0, 23, 59, 59).getTime();

        // Clear any old auto-synced HA data from months prior to trackingStartDate (unless manually entered by user)
        if (monthEndMs < trackMs) {
            if (months[m].source === 'ha') {
                months[m].pvYieldKwh = null;
                months[m].gridExportKwh = null;
                months[m].gridImportKwh = null;
                months[m].batteryChargedKwh = null;
                months[m].batteryDischargedKwh = null;
                months[m].source = 'empty';
                updatedMonthsCount++;
            }
            continue;
        }

        if (m > maxMonthIdx || months[m].source === 'manual') continue;

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
        const startStr = trackDate.toLocaleDateString('de-DE');
        if (updatedMonthsCount > 0) {
            showToastNotification(`HA Langzeit-Statistik ab ${startStr} synchronisiert (${updatedMonthsCount} Monats-Bilanzen aktualisiert)!`, 'success');
        } else {
            showToastNotification(`HA Langzeit-Statistik ab ${startStr} geprüft (Zähler-Baselines kalibriert).`, 'info');
        }
    }
    return updatedMonthsCount > 0;
}

async function triggerManualLongTermStatsSync() {
    readHaModalIntoState();
    await syncLongTermStatisticsFromHa(haConfigState, null, true);
}

function onChangeTrackingStartDate(newDateVal) {
    const cleanVal = String(newDateVal || '2026-11-01').trim() || '2026-11-01';
    haConfigState.trackingStartDate = cleanVal;
    setElVal('ha_cfg_tracking_start_date', cleanVal);
    setElVal('logbuchTrackingStartDate', cleanVal);
    intradayHistoryCache = { day: null, week: null, month: null };
    hasPrewarmedHistoryTimeframes = false;
    try {
        localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
    } catch (e) {}
}

async function applyTrackingStartDateAndResync() {
    const inpModal = document.getElementById('ha_cfg_tracking_start_date');
    const inpLog = document.getElementById('logbuchTrackingStartDate');
    const chosenDate = (inpLog && inpLog.offsetParent !== null ? inpLog.value : (inpModal?.value || haConfigState.trackingStartDate || '2026-11-01')).trim();
    onChangeTrackingStartDate(chosenDate);

    // Reset cached month baselines & timeframe caches so they are freshly computed from chosenDate onwards
    energyCounterBaselines.monthStartByEntity = {};
    energyCounterBaselines.ltsMonthChangeByEntity = {};
    energyCounterBaselines.lastHistorySyncMs = 0;
    energyCounterBaselines.lastLongTermSyncMs = 0;
    intradayHistoryCache = { day: null, week: null, month: null };
    hasPrewarmedHistoryTimeframes = false;
    saveEnergyCounterBaselines();

    // Also clear any pre-trackingStartDate 'ha' entries in the current year's logbook
    const trackDate = getEffectiveTrackingStartDate(haConfigState);
    const trackMs = trackDate.getTime();
    const months = getCurrentYearMonthsData(selectedAnalysisYear);
    months.forEach((mObj, idx) => {
        const mEndMs = new Date(selectedAnalysisYear, idx + 1, 0, 23, 59, 59).getTime();
        if (mEndMs < trackMs && mObj.source === 'ha') {
            mObj.pvYieldKwh = null;
            mObj.gridExportKwh = null;
            mObj.gridImportKwh = null;
            mObj.batteryChargedKwh = null;
            mObj.batteryDischargedKwh = null;
            mObj.source = 'empty';
        }
    });
    await savePerformanceRecordsLocalAndServer();

    await refreshIntradayHistoryAndLive();
    await syncLongTermStatisticsFromHa(haConfigState, null, true);
    renderAnalysisSection();
}

window.syncLongTermStatisticsFromHa = syncLongTermStatisticsFromHa;
window.triggerManualLongTermStatsSync = triggerManualLongTermStatsSync;
window.onChangeTrackingStartDate = onChangeTrackingStartDate;
window.applyTrackingStartDateAndResync = applyTrackingStartDateAndResync;

function extractHaNumericClient(statesMap, entityId, targetUnitType = null) {
    if (!entityId || typeof entityId !== 'string') return null;
    const cleanId = entityId.trim();
    if (!cleanId) return null;
    const st = statesMap.get(cleanId);
    if (!st) {
        lastKnownHaAvailabilityMap.set(cleanId, 'nicht gefunden');
        return null;
    }
    if (st.state === 'unavailable' || st.state === 'unknown' || st.state === null || st.state === undefined) {
        lastKnownHaAvailabilityMap.set(cleanId, String(st.state || 'unavailable'));
        return null;
    }
    const val = parseFloat(String(st.state).replace(',', '.'));
    if (isNaN(val)) {
        lastKnownHaAvailabilityMap.set(cleanId, 'ungültig');
        return null;
    }
    const unit = String(st.attributes?.unit_of_measurement || '').trim().toLowerCase();
    if (unit) lastKnownHaUnitMap.set(cleanId, unit);
    if (st.attributes?.state_class) lastKnownHaStateClassMap.set(cleanId, st.attributes.state_class);

    // Guard against configuring a Watt power sensor inside a kWh energy counter field
    if (targetUnitType === 'kWh' && (unit === 'w' || unit === 'kw' || unit === 'mw')) {
        lastKnownHaAvailabilityMap.set(cleanId, 'wrong_unit');
        setSensorDiagnostic(cleanId, {
            status: 'wrong_unit',
            reason: `Sensor hat Einheit '${st.attributes?.unit_of_measurement || unit}' statt kWh → wird ignoriert (aus W berechnet)`
        });
        return null;
    }

    lastKnownHaAvailabilityMap.set(cleanId, 'ok');
    let scaled = val;
    if (targetUnitType === 'W') {
        if (unit === 'kw') scaled = val * 1000;
        else if (unit === 'mw') scaled = val * 1000000;
    } else if (targetUnitType === 'kWh') {
        if (unit === 'wh') scaled = val / 1000;
        else if (unit === 'mwh') scaled = val * 1000;
        lastKnownHaReadingMap.set(cleanId, scaled);
    }
    return scaled;
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
        { isCumulative: isEntityCumulativeTotal(e.loadEnergyMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity, ltsOverrideMap: energyCounterBaselines.ltsMonthChangeByEntity }
    );
    const rawGridImportMonthKwh = resolveEnergyCounterDelta(
        e.gridImportMonth,
        rawGridImpReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.gridImportMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity, ltsOverrideMap: energyCounterBaselines.ltsMonthChangeByEntity }
    );
    const rawGridExportMonthKwh = resolveEnergyCounterDelta(
        e.gridExportMonth,
        rawGridExpReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.gridExportMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity, ltsOverrideMap: energyCounterBaselines.ltsMonthChangeByEntity }
    );
    const rawBatteryChargeMonthKwh = resolveEnergyCounterDelta(
        e.batteryChargeMonth,
        rawBatChgReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.batteryChargeMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity, ltsOverrideMap: energyCounterBaselines.ltsMonthChangeByEntity }
    );
    const rawBatteryDischargeMonthKwh = resolveEnergyCounterDelta(
        e.batteryDischargeMonth,
        rawBatDisReading,
        energyCounterBaselines.monthStartByEntity,
        { isCumulative: isEntityCumulativeTotal(e.batteryDischargeMonth, statesMap, true), upperBoundMap: energyCounterBaselines.dayStartByEntity, ltsOverrideMap: energyCounterBaselines.ltsMonthChangeByEntity }
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
                { isCumulative: isCumStr, upperBoundMap: energyCounterBaselines.dayStartByEntity, ltsOverrideMap: energyCounterBaselines.ltsMonthChangeByEntity }
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
                energyTodayKwh: eKwh,
                energyMonthKwh: eMonthKwh,
                available: pW !== null || rawStrKwh !== null
            };
            customStringsTelemetry.push({
                id: cs.id,
                name: cs.name || cs.id,
                color: cs.color || '#14b8a6',
                powerEntity: cs.powerEntity || '',
                energyEntity: cs.energyEntity || '',
                powerW: pW !== null ? pW : 0,
                energyKwh: eKwh,
                energyTodayKwh: eKwh,
                energyMonthKwh: eMonthKwh,
                available: pW !== null || rawStrKwh !== null
            });
        });
    }

    // Multi-Inverter PV Energy Calculation:
    // Sum all configured inverter PV energy counters (WR 1 + WR 2 + WR 3...).
    // If no inverter counters are configured in Section 2, automatically fall back to the sum of String kWh counters from Section 3!
    const pvCounterIds = getConfiguredPvEnergyEntities(cfg);
    let pvTodaySum = 0;
    let pvTodayValidCount = 0;
    let pvMonthSum = 0;
    let pvMonthValidCount = 0;

    pvCounterIds.forEach(entId => {
        const rawVal = extractHaNumericClient(statesMap, entId, 'kWh');
        if (rawVal === null) return;
        const isCum = isEntityCumulativeTotal(entId, statesMap, true);
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
            { isCumulative: isCum, upperBoundMap: energyCounterBaselines.dayStartByEntity, ltsOverrideMap: energyCounterBaselines.ltsMonthChangeByEntity }
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
            const rawConsKwh = extractHaNumericClient(statesMap, cc.energyEntity, 'kWh');
            const cleanEnergyId = String(cc.energyEntity || '').trim();
            const hasNonZeroBase = cleanEnergyId && (
                (energyCounterBaselines.dayStartByEntity[cleanEnergyId] || 0) > 0.1 ||
                (energyCounterBaselines.monthStartByEntity[cleanEnergyId] || 0) > 0.1
            );
            const isCumCons = isEntityCumulativeTotal(cc.energyEntity, statesMap, Boolean(hasNonZeroBase));
            const consEnergyKwh = rawConsKwh !== null
                ? resolveEnergyCounterDelta(
                    cc.energyEntity,
                    rawConsKwh,
                    energyCounterBaselines.dayStartByEntity,
                    { isCumulative: isCumCons, maxPlausibleKwh: 120 }
                )
                : null;
            const consMonthRawKwh = rawConsKwh !== null
                ? resolveEnergyCounterDelta(
                    cc.energyEntity,
                    rawConsKwh,
                    energyCounterBaselines.monthStartByEntity,
                    {
                        isCumulative: isCumCons,
                        upperBoundMap: energyCounterBaselines.dayStartByEntity,
                        ltsOverrideMap: energyCounterBaselines.ltsMonthChangeByEntity
                    }
                )
                : null;
            const consEnergyMonthKwh = ensureMonthAtLeastToday(consMonthRawKwh, consEnergyKwh);

            if (pW === null && rawConsKwh === null) {
                unavailableConsumersCount++;
                consumersTelemetry.push({
                    id: cc.id,
                    name: cc.name,
                    powerEntity: cc.powerEntity,
                    energyEntity: cc.energyEntity || '',
                    powerW: 0,
                    energyKwh: null,
                    energyTodayKwh: null,
                    energyMonthKwh: null,
                    available: false
                });
            } else {
                consumersTelemetry.push({
                    id: cc.id,
                    name: cc.name,
                    powerEntity: cc.powerEntity,
                    energyEntity: cc.energyEntity || '',
                    powerW: pW !== null ? Math.max(0, pW) : 0,
                    energyKwh: consEnergyKwh,
                    energyTodayKwh: consEnergyKwh,
                    energyMonthKwh: consEnergyMonthKwh,
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
    const win = getEffectiveTimeframeWindow(cfg, timeframe);
    const { now, startTime, stepMs } = win;
    const startIso = startTime.toISOString();
    const nowIso = now.toISOString();

    const e = cfg.entities || {};
    const socEntityId = (e.batterySoc || '').trim();

    // 1. Collect all Power (W) & SoC (%) entities
    const powerEntitySet = new Set();
    if (e.pvPower) powerEntitySet.add(e.pvPower.trim());
    if (e.loadPower) powerEntitySet.add(e.loadPower.trim());
    if (e.gridPower) powerEntitySet.add(e.gridPower.trim());
    if (e.gridImportPower) powerEntitySet.add(e.gridImportPower.trim());
    if (e.gridExportPower) powerEntitySet.add(e.gridExportPower.trim());
    if (e.batteryChargePower) powerEntitySet.add(e.batteryChargePower.trim());
    if (e.batteryDischargePower) powerEntitySet.add(e.batteryDischargePower.trim());
    if (e.batteryPower) powerEntitySet.add(e.batteryPower.trim());
    if (socEntityId) powerEntitySet.add(socEntityId);
    (cfg.customStrings || []).forEach(cs => {
        if (cs && cs.powerEntity) powerEntitySet.add(cs.powerEntity.trim());
    });
    (cfg.customConsumers || []).forEach(cc => {
        if (cc && cc.powerEntity) powerEntitySet.add(cc.powerEntity.trim());
    });

    // 2. Collect all Energy (kWh) counter entities for Single Source of Truth kWh totals & hourly curve fallback
    const energyEntitySet = new Set();
    getConfiguredPvEnergyEntities(cfg).forEach(id => {
        if (id) energyEntitySet.add(id.trim());
    });
    if (e.loadEnergyMonth) energyEntitySet.add(e.loadEnergyMonth.trim());
    if (e.gridImportMonth) energyEntitySet.add(e.gridImportMonth.trim());
    if (e.gridExportMonth) energyEntitySet.add(e.gridExportMonth.trim());
    if (e.batteryChargeMonth) energyEntitySet.add(e.batteryChargeMonth.trim());
    if (e.batteryDischargeMonth) energyEntitySet.add(e.batteryDischargeMonth.trim());
    (cfg.customStrings || []).forEach(cs => {
        if (cs && cs.energyEntity) energyEntitySet.add(cs.energyEntity.trim());
    });
    (cfg.customConsumers || []).forEach(cc => {
        if (cc && cc.energyEntity) energyEntitySet.add(cc.energyEntity.trim());
    });

    const powerEntityList = [...powerEntitySet].filter(Boolean);
    const energyEntityList = [...energyEntitySet].filter(Boolean);
    if (powerEntityList.length === 0 && energyEntityList.length === 0) return null;

    const bucketTimes = [];
    for (let t = startTime.getTime(); t <= now.getTime(); t += stepMs) {
        bucketTimes.push(t);
    }
    if (bucketTimes.length === 0 || bucketTimes[bucketTimes.length - 1] < now.getTime()) {
        bucketTimes.push(now.getTime());
    }

    const ltsSeriesByEntity = new Map();
    const ltsPeakByEntity = new Map();
    const ltsPosPeakByEntity = new Map();
    const ltsNegPeakByEntity = new Map();
    const ltsKwhByEntity = new Map();
    const restKwhByEntity = new Map();
    const ltsDerivedPowerFromKwhByEntity = new Map();
    const rawSeriesByEntity = new Map();

    const isMultiDay = (timeframe === 'week' || timeframe === 'month');
    let ltsWsSucceeded = false;

    // 3A. For Week & Month: Primary Single Source of Truth via WebSocket Long-Term Statistics (recorder/statistics_during_period)
    if (isMultiDay) {
        const allStatIds = [...new Set([...powerEntityList, ...energyEntityList])];
        const wsRes = await fetchHaLongTermStatisticsWs(
            cfg.baseUrl,
            cfg.accessToken,
            allStatIds,
            startIso,
            nowIso,
            'hour',
            ['mean', 'max', 'min', 'change', 'state', 'sum']
        );
        if (externalSignal && externalSignal.aborted) return null;

        if (wsRes.ok && wsRes.data && typeof wsRes.data === 'object') {
            ltsWsSucceeded = true;
            allStatIds.forEach(entId => {
                const buckets = wsRes.data[entId];
                if (!Array.isArray(buckets) || buckets.length === 0) return;

                const isSoc = (entId === socEntityId);
                const pScale = isSoc ? 1 : getPowerScaleForEntity(entId, null);
                const eScale = getEnergyScaleForEntity(entId, null);
                const isEnergyCounter = energyEntitySet.has(entId) && !powerEntitySet.has(entId);
                const isConsumer = isConsumerEnergyEntity(entId, cfg);
                const maxHourlyStepKwh = isConsumer ? 4.0 : 22.0;
                const initJumpMinKwh = isConsumer ? 4.0 : 14.0;

                const meanPts = [];
                const derivedPowerPts = [];
                let maxPeakW = 0;
                let maxPosPeakW = 0;
                let maxNegPeakW = 0;
                let kwhChangeSum = 0;
                let jumpOffsetSum = 0;
                let hasKwhChange = false;
                let firstStateKwh = null;
                let lastStateKwh = null;
                let prevStValKwh = null;
                const liveValKwh = lastKnownHaReadingMap.get(entId) ?? null;

                buckets.forEach(b => {
                    const bStartMs = parseHaStatTimestampMs(b.start);
                    const bEndMs = parseHaStatTimestampMs(b.end);
                    if (isNaN(bStartMs)) return;
                    const effEndMs = !isNaN(bEndMs) && bEndMs > bStartMs ? bEndMs : (bStartMs + 3600 * 1000);
                    const midMs = (bStartMs + effEndMs) / 2;
                    const dtHours = Math.max(0.25, (effEndMs - bStartMs) / 3600000);

                    // 1) Power / SoC measurement statistics (mean / max / min with separate + / - peaks for signed grid/battery sensors)
                    if (!isEnergyCounter && (typeof b.mean === 'number' || typeof b.state === 'number')) {
                        const rawMean = typeof b.mean === 'number' ? b.mean : b.state;
                        const rawMax = typeof b.max === 'number' ? b.max : rawMean;
                        const rawMin = typeof b.min === 'number' ? b.min : rawMean;
                        if (!isNaN(rawMean)) {
                            const scaledVal = rawMean * pScale;
                            const posPeak = Math.max(0, rawMax * pScale, scaledVal);
                            const negPeak = Math.max(0, -(rawMin * pScale), -scaledVal);
                            const scaledMax = Math.max(posPeak, negPeak);
                            meanPts.push({ startMs: bStartMs, endMs: effEndMs, midMs, val: scaledVal, maxVal: scaledMax });
                            if (scaledMax > maxPeakW) maxPeakW = scaledMax;
                            if (posPeak > maxPosPeakW) maxPosPeakW = posPeak;
                            if (negPeak > maxNegPeakW) maxNegPeakW = negPeak;
                        }
                    }

                    // 2) Energy counter statistics (change / state / sum / max / mean) — with protection against counter offset jumps
                    if (energyEntitySet.has(entId)) {
                        const rawBucketNum = typeof b.sum === 'number'
                            ? b.sum
                            : (typeof b.state === 'number'
                                ? b.state
                                : (typeof b.max === 'number' ? b.max : (typeof b.mean === 'number' ? b.mean : null)));
                        const stVal = rawBucketNum !== null && !isNaN(rawBucketNum) ? (rawBucketNum * eScale) : null;
                        if (effEndMs >= startTime.getTime()) {
                            if (typeof b.change === 'number' && !isNaN(b.change)) {
                                const dKwh = Math.max(0, b.change * eScale);
                                const isJump = ((prevStValKwh === null || prevStValKwh <= 2.0) && dKwh >= initJumpMinKwh)
                                    || dKwh >= maxHourlyStepKwh;
                                if (!isJump) {
                                    kwhChangeSum += dKwh;
                                    hasKwhChange = true;
                                    const derivedW = (dKwh * 1000) / dtHours;
                                    derivedPowerPts.push({ startMs: bStartMs, endMs: effEndMs, midMs, val: derivedW, maxVal: derivedW });
                                } else {
                                    jumpOffsetSum += dKwh;
                                }
                            } else if (stVal !== null && prevStValKwh !== null && prevStValKwh > 0.5) {
                                const stepDiff = stVal >= prevStValKwh ? (stVal - prevStValKwh) : 0;
                                const isStepJump = ((prevStValKwh <= 2.0) && stepDiff >= initJumpMinKwh)
                                    || stepDiff >= maxHourlyStepKwh;
                                if (stepDiff >= 0 && !isStepJump) {
                                    kwhChangeSum += stepDiff;
                                    hasKwhChange = true;
                                    const derivedW = (stepDiff * 1000) / dtHours;
                                    derivedPowerPts.push({ startMs: bStartMs, endMs: effEndMs, midMs, val: derivedW, maxVal: derivedW });
                                } else if (isStepJump) {
                                    jumpOffsetSum += stepDiff;
                                }
                            }
                            if (stVal !== null && !isNaN(stVal) && stVal > 0.1) {
                                if (firstStateKwh === null) firstStateKwh = stVal;
                                lastStateKwh = stVal;
                            }
                        }
                        if (stVal !== null && !isNaN(stVal) && stVal > 0.1) {
                            prevStValKwh = stVal;
                        }
                    }
                });

                if (meanPts.length > 0) {
                    meanPts.sort((a, b) => a.startMs - b.startMs);
                    ltsSeriesByEntity.set(entId, meanPts);
                    ltsPeakByEntity.set(entId, maxPeakW);
                    ltsPosPeakByEntity.set(entId, maxPosPeakW);
                    ltsNegPeakByEntity.set(entId, maxNegPeakW);
                }

                const effEndStateKwh = (liveValKwh !== null && !isNaN(liveValKwh) && (lastStateKwh === null || liveValKwh >= lastStateKwh))
                    ? liveValKwh
                    : lastStateKwh;
                const rawStateSpanKwh = (firstStateKwh !== null && firstStateKwh > 0.1 && effEndStateKwh !== null && effEndStateKwh >= firstStateKwh)
                    ? Math.max(0, effEndStateKwh - firstStateKwh)
                    : 0;
                const cleanStateSpanKwh = Math.max(0, rawStateSpanKwh - jumpOffsetSum);
                const liveTailKwh = (liveValKwh !== null && lastStateKwh !== null && liveValKwh > lastStateKwh && (liveValKwh - lastStateKwh) < maxHourlyStepKwh)
                    ? (liveValKwh - lastStateKwh)
                    : 0;
                const totalKwhChange = kwhChangeSum + liveTailKwh;

                // Never let raw stateSpanKwh overwrite a jump-cleaned kwhChangeSum (which caused 652,32 kWh on Netzbezug)!
                if (hasKwhChange || cleanStateSpanKwh > 0) {
                    const bestLtsKwh = hasKwhChange
                        ? +((cleanStateSpanKwh > 0 && totalKwhChange > cleanStateSpanKwh * 1.15 + 5) ? cleanStateSpanKwh : totalKwhChange).toFixed(3)
                        : +cleanStateSpanKwh.toFixed(3);
                    ltsKwhByEntity.set(entId, bestLtsKwh);
                }

                if (derivedPowerPts.length > 0) {
                    derivedPowerPts.sort((a, b) => a.startMs - b.startMs);
                    ltsDerivedPowerFromKwhByEntity.set(entId, derivedPowerPts);
                }
            });
        }
    }

    // 3B. Short-Term REST History (/api/history/period)
    // When multi-day WebSocket LTS succeeded, only query REST History for existing power sensors missing from LTS (without significant_changes_only=0!)
    // so switching between Tag / Woche / Monat is fast and never downloads megabytes of 10-day raw state history!
    const existingEntityFilter = (id) => lastKnownHaAvailabilityMap.get(id) === 'ok' || lastKnownHaReadingMap.has(id) || !lastKnownHaAvailabilityMap.has(id);
    const powerMissingFromLts = isMultiDay
        ? powerEntityList.filter(id => !ltsSeriesByEntity.has(id) && existingEntityFilter(id))
        : powerEntityList.filter(existingEntityFilter);
    const energyMissingFromLts = isMultiDay
        ? (ltsWsSucceeded ? [] : energyEntityList.filter(id => !ltsKwhByEntity.has(id) && existingEntityFilter(id)))
        : energyEntityList.filter(existingEntityFilter);
    const entitiesNeedingRestHistory = [...new Set([...powerMissingFromLts, ...energyMissingFromLts])];

    if (entitiesNeedingRestHistory.length > 0) {
        const restStartMs = isMultiDay
            ? Math.max(startTime.getTime(), now.getTime() - 7 * 24 * 3600 * 1000)
            : startTime.getTime();
        const restStartIso = new Date(restStartMs).toISOString();
        const sigParam = isMultiDay ? '' : '&significant_changes_only=0';
        const endpoint = `/api/history/period/${encodeURIComponent(restStartIso)}?filter_entity_id=${encodeURIComponent(entitiesNeedingRestHistory.join(','))}&end_time=${encodeURIComponent(nowIso)}${sigParam}&minimal_response&no_attributes`;
        const histRes = await fetchHaDirectFromBrowser(cfg.baseUrl, cfg.accessToken, endpoint, externalSignal);
        if (externalSignal && externalSignal.aborted) return null;

        if (histRes.ok && Array.isArray(histRes.data)) {
            histRes.data.forEach(entityHistoryArr => {
                if (!Array.isArray(entityHistoryArr) || entityHistoryArr.length === 0) return;
                const entId = entityHistoryArr[0]?.entity_id;
                if (!entId) return;

                if (powerEntitySet.has(entId)) {
                    const scale = (entId === socEntityId) ? 1 : getPowerScaleForEntity(entId, null);
                    const points = [];
                    entityHistoryArr.forEach(pt => {
                        const val = parseFloat(String(pt.state).replace(',', '.'));
                        const ts = new Date(pt.last_changed || pt.last_updated || restStartIso).getTime();
                        if (!isNaN(val) && !isNaN(ts)) points.push({ ts, val: val * scale });
                    });
                    if (points.length > 0) {
                        points.sort((a, b) => a.ts - b.ts);
                        rawSeriesByEntity.set(entId, points);
                    }
                }

                if (energyEntitySet.has(entId)) {
                    const eScale = getEnergyScaleForEntity(entId, null);
                    const isConsumer = isConsumerEnergyEntity(entId, cfg);
                    const maxSingleStepKwh = isConsumer ? 4.0 : 22.0;
                    const initJumpMinKwh = isConsumer ? 4.0 : 14.0;
                    const ePts = [];
                    entityHistoryArr.forEach(pt => {
                        const val = parseFloat(String(pt.state).replace(',', '.'));
                        const ts = new Date(pt.last_changed || pt.last_updated || restStartIso).getTime();
                        if (!isNaN(val) && val >= 0 && !isNaN(ts)) {
                            ePts.push({ ts, val: val * eScale });
                        }
                    });
                    if (ePts.length > 0) {
                        ePts.sort((a, b) => a.ts - b.ts);
                        let posDeltaSum = 0;
                        let jumpOffsetSum = 0;
                        const derivedPts = [];
                        for (let i = 1; i < ePts.length; i++) {
                            const prev = ePts[i - 1];
                            const cur = ePts[i];
                            const diff = cur.val >= prev.val
                                ? (cur.val - prev.val)
                                : ((cur.val < 0.5 && prev.val > 2.0) ? cur.val : 0);
                            const isJump = ((prev.val <= 2.0) && diff >= initJumpMinKwh) || diff >= maxSingleStepKwh;
                            if (diff > 0 && !isJump) {
                                posDeltaSum += diff;
                                const dtH = Math.max(0.0833, (cur.ts - prev.ts) / 3600000);
                                const dW = Math.min(25000, (diff * 1000) / dtH);
                                derivedPts.push({ startMs: prev.ts, endMs: cur.ts, midMs: (prev.ts + cur.ts) / 2, val: dW, maxVal: dW });
                            } else if (isJump) {
                                jumpOffsetSum += diff;
                            }
                        }
                        const liveVal = lastKnownHaReadingMap.get(entId) ?? null;
                        const lastHistVal = ePts[ePts.length - 1].val;
                        if (liveVal !== null && !isNaN(liveVal) && liveVal > lastHistVal && (liveVal - lastHistVal) < maxSingleStepKwh) {
                            posDeltaSum += (liveVal - lastHistVal);
                        }
                        const firstHistVal = ePts[0].val;
                        const rawSpanDiff = (liveVal !== null && liveVal >= firstHistVal)
                            ? (liveVal - firstHistVal)
                            : Math.max(0, lastHistVal - firstHistVal);
                        const cleanSpanDiff = Math.max(0, rawSpanDiff - jumpOffsetSum);
                        const bestRestKwh = +(cleanSpanDiff > 0 && posDeltaSum > cleanSpanDiff * 1.12 ? cleanSpanDiff : posDeltaSum).toFixed(3);
                        restKwhByEntity.set(entId, bestRestKwh);
                        if (derivedPts.length > 0 && !ltsDerivedPowerFromKwhByEntity.has(entId)) {
                            ltsDerivedPowerFromKwhByEntity.set(entId, derivedPts);
                        }
                    }
                }
            });
        }
    }

    // If neither LTS nor REST History returned any data at all, return null so backend fallback can try
    if (ltsSeriesByEntity.size === 0 && rawSeriesByEntity.size === 0 && ltsKwhByEntity.size === 0 && restKwhByEntity.size === 0) {
        return null;
    }

    // Helper to sample LTS hourly buckets onto bucketTimes
    const sampleLtsBuckets = (ltsPts, isSoc = false) => {
        if (!Array.isArray(ltsPts) || ltsPts.length === 0) return null;
        const halfWin = Math.max(3600 * 1000 * 0.65, stepMs * 0.6);
        let lastKnownSoc = ltsPts[0].val;
        return bucketTimes.map(bTs => {
            let sum = 0;
            let count = 0;
            for (let i = 0; i < ltsPts.length; i++) {
                const pt = ltsPts[i];
                if (pt.endMs < bTs - halfWin) continue;
                if (pt.startMs > bTs + halfWin) break;
                sum += pt.val;
                count++;
            }
            if (count > 0) {
                const avg = sum / count;
                if (isSoc) lastKnownSoc = avg;
                return +avg.toFixed(2);
            }
            return isSoc ? +lastKnownSoc.toFixed(2) : 0;
        });
    };

    // Unified Entity Sampler (Priority 1: LTS mean series -> Priority 2: REST History -> Priority 3: Derived W from kWh LTS change)
    const sampleEntity = (entityId, scale = 1, fallbackEnergyEntityId = null) => {
        const cleanId = (entityId || '').trim();
        const isSoc = (cleanId && cleanId === socEntityId);

        // Priority 1: Hourly LTS mean series
        if (cleanId && ltsSeriesByEntity.has(cleanId)) {
            const arr = sampleLtsBuckets(ltsSeriesByEntity.get(cleanId), isSoc);
            if (arr) return arr.map(v => +(v * scale).toFixed(2));
        }

        // Priority 2: Short-Term REST History
        const pts = cleanId ? (rawSeriesByEntity.get(cleanId) || []) : [];
        if (pts.length > 0) {
            if (!isMultiDay) {
                // High-resolution 5-min step-hold for intraday ('day')
                let pIdx = 0;
                let lastVal = pts[0].ts <= bucketTimes[0] ? pts[0].val : 0;
                return bucketTimes.map(bTs => {
                    while (pIdx < pts.length && pts[pIdx].ts <= bTs) {
                        lastVal = pts[pIdx].val;
                        pIdx++;
                    }
                    return +(lastVal * scale).toFixed(2);
                });
            } else {
                // Bucket-averaged step-hold for 'week' / 'month'
                let pIdx = 0;
                let lastVal = pts[0].ts <= bucketTimes[0] ? pts[0].val : 0;
                const firstTs = pts[0].ts;
                return bucketTimes.map((bTs, idx) => {
                    const prevTs = idx > 0 ? bucketTimes[idx - 1] : (bTs - stepMs);
                    let sumInBucket = 0;
                    let cntInBucket = 0;
                    while (pIdx < pts.length && pts[pIdx].ts <= bTs) {
                        lastVal = pts[pIdx].val;
                        if (pts[pIdx].ts >= prevTs) {
                            sumInBucket += pts[pIdx].val;
                            cntInBucket++;
                        }
                        pIdx++;
                    }
                    if (bTs < firstTs - stepMs && !isSoc) return 0;
                    const effVal = cntInBucket > 0 ? (sumInBucket / cntInBucket) : lastVal;
                    return +(effVal * scale).toFixed(2);
                });
            }
        }

        // Priority 3: Derive hourly average power (W) from paired kWh counter's LTS hourly change (1 kWh/h = 1000 W)
        const cleanEnergyId = (fallbackEnergyEntityId || '').trim();
        if (cleanEnergyId && ltsDerivedPowerFromKwhByEntity.has(cleanEnergyId)) {
            const arr = sampleLtsBuckets(ltsDerivedPowerFromKwhByEntity.get(cleanEnergyId), false);
            if (arr) return arr.map(v => +(v * scale).toFixed(2));
        }

        return bucketTimes.map(() => 0);
    };

    // If 'day' cache exists and isMultiDay, overlay today's curve onto the today tail for any channel that was 0
    const overlayTodayTailIfZero = (targetArr, curveKey) => {
        if (!isMultiDay || !Array.isArray(targetArr)) return targetArr;
        const dayDs = intradayHistoryCache.day;
        if (!dayDs || !Array.isArray(dayDs.bucketTimes) || !dayDs.series || !Array.isArray(dayDs.series[curveKey])) {
            return targetArr;
        }
        const dayTimes = dayDs.bucketTimes;
        const dayVals = dayDs.series[curveKey];
        if (dayTimes.length === 0) return targetArr;
        const dayStartMs = dayTimes[0];

        // Check if targetArr has non-zero values during today
        let hasTodaySignal = false;
        for (let i = 0; i < bucketTimes.length; i++) {
            if (bucketTimes[i] >= dayStartMs && Math.abs(targetArr[i] || 0) > 1) {
                hasTodaySignal = true;
                break;
            }
        }
        if (hasTodaySignal) return targetArr;

        return targetArr.map((v, idx) => {
            const bTs = bucketTimes[idx];
            if (bTs < dayStartMs) return v;
            const winHalf = stepMs * 0.55;
            let sum = 0;
            let cnt = 0;
            for (let j = 0; j < dayTimes.length; j++) {
                if (Math.abs(dayTimes[j] - bTs) <= winHalf) {
                    sum += (dayVals[j] || 0);
                    cnt++;
                }
            }
            return cnt > 0 ? +(sum / cnt).toFixed(2) : v;
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

    // Helper to resolve Single Source of Truth kWh for a channel:
    // Priority 1: LTS / REST kWh counter change in window (sanity-checked against physical power curve when present)
    // Priority 2: Curve Watt integral -> Bounded below by Today/Period fallback
    const resolveChannelKwh = (energyEntityIds, curveKwh, todayKwhFallback = 0, isConsumerChannel = false) => {
        const ids = (Array.isArray(energyEntityIds) ? energyEntityIds : [energyEntityIds])
            .map(x => String(x || '').trim())
            .filter(Boolean);
        const cleanCurveKwh = Number(curveKwh) || 0;
        const cleanFallbackKwh = Number(todayKwhFallback) || 0;

        if (ids.length > 0) {
            let counterSum = 0;
            let foundCounter = false;
            ids.forEach(id => {
                const ltsVal = ltsKwhByEntity.has(id) ? (ltsKwhByEntity.get(id) || 0) : null;
                const restVal = restKwhByEntity.has(id) ? (restKwhByEntity.get(id) || 0) : null;
                if (ltsVal !== null || restVal !== null) {
                    counterSum += (ltsVal !== null && ltsVal > 0) ? ltsVal : (restVal || 0);
                    foundCounter = true;
                }
            });
            if (foundCounter && counterSum > 0) {
                // Cross-check against measured power curve integral when a real power curve exists
                const hasRealCurve = isConsumerChannel ? (cleanCurveKwh > 0.02) : (cleanCurveKwh > 0.5);
                const maxPlausibleVsCurve = isConsumerChannel
                    ? Math.max(cleanCurveKwh * 3.0, cleanCurveKwh + 3.0)
                    : Math.max(cleanCurveKwh * 2.8, cleanCurveKwh + 25.0);
                if (hasRealCurve && counterSum > maxPlausibleVsCurve) {
                    return +Math.max(cleanCurveKwh, cleanFallbackKwh).toFixed(3);
                }
                return +Math.max(counterSum, cleanFallbackKwh).toFixed(3);
            }
        }
        return +Math.max(cleanCurveKwh, cleanFallbackKwh).toFixed(3);
    };

    const series = {};
    const integratedKwh = {};
    const peakValues = {};
    const dayIntCache = intradayHistoryCache.day?.integratedKwh || {};
    const dayPeakCache = intradayHistoryCache.day?.peakValues || {};
    const tLive = currentLiveTelemetry || {};

    // 1. Custom PV Strings
    (cfg.customStrings || []).forEach(cs => {
        if (!cs || !cs.id) return;
        let arr = sampleEntity(cs.powerEntity, 1, cs.energyEntity);
        arr = overlayTodayTailIfZero(arr, cs.id);
        series[cs.id] = arr;
        const teleStr = (tLive.customStringsTelemetry || []).find(x => x.id === cs.id);
        const todayStrKwh = teleStr?.energyTodayKwh ?? teleStr?.energyKwh ?? dayIntCache[cs.id] ?? 0;
        const periodStrFallback = timeframe === 'month'
            ? Math.max(todayStrKwh, teleStr?.energyMonthKwh ?? 0)
            : todayStrKwh;
        integratedKwh[cs.id] = resolveChannelKwh(cs.energyEntity, integrateKwh(arr), periodStrFallback, false);
    });

    // 2. PV Total (DC)
    const pvCounterIds = getConfiguredPvEnergyEntities(cfg);
    const primaryPvEnergyId = pvCounterIds[0] || '';
    const sampledPvTotal = e.pvPower ? sampleEntity(e.pvPower, 1, primaryPvEnergyId) : bucketTimes.map(() => 0);
    let pvTotalArr = bucketTimes.map((_, idx) => {
        let strSum = 0;
        (cfg.customStrings || []).forEach(cs => {
            if (cs && series[cs.id]) strSum += (series[cs.id][idx] || 0);
        });
        return +Math.max(sampledPvTotal[idx] || 0, strSum).toFixed(1);
    });
    pvTotalArr = overlayTodayTailIfZero(pvTotalArr, 'pv_total');
    series.pv_total = pvTotalArr;

    const sumStringsPeriodKwh = (cfg.customStrings || []).reduce((acc, cs) => acc + (integratedKwh[cs?.id] || 0), 0);
    const todayPvFallback = tLive.pvEnergyTodayKwh ?? dayIntCache.pv_total ?? 0;
    const pvTotalFromLtsOrCurve = resolveChannelKwh(pvCounterIds, integrateKwh(pvTotalArr), todayPvFallback);
    integratedKwh.pv_total = +Math.max(pvTotalFromLtsOrCurve, sumStringsPeriodKwh).toFixed(3);

    // 3. Grid Import & Grid Export
    const hasSeparateGridImp = Boolean(
        e.gridImportPower && (
            ltsSeriesByEntity.has(e.gridImportPower.trim()) ||
            rawSeriesByEntity.has(e.gridImportPower.trim()) ||
            (e.gridImportMonth && ltsDerivedPowerFromKwhByEntity.has(e.gridImportMonth.trim()))
        )
    );
    const hasSeparateGridExp = Boolean(
        e.gridExportPower && (
            ltsSeriesByEntity.has(e.gridExportPower.trim()) ||
            rawSeriesByEntity.has(e.gridExportPower.trim()) ||
            (e.gridExportMonth && ltsDerivedPowerFromKwhByEntity.has(e.gridExportMonth.trim()))
        )
    );

    if (hasSeparateGridImp || hasSeparateGridExp) {
        let impArr = hasSeparateGridImp
            ? sampleEntity(e.gridImportPower, 1, e.gridImportMonth).map(v => Math.max(0, v))
            : sampleEntity('', 1, e.gridImportMonth).map(v => Math.max(0, v));
        let expArr = hasSeparateGridExp
            ? sampleEntity(e.gridExportPower, 1, e.gridExportMonth).map(v => Math.max(0, v))
            : sampleEntity('', 1, e.gridExportMonth).map(v => Math.max(0, v));
        impArr = overlayTodayTailIfZero(impArr, 'grid_power');
        expArr = overlayTodayTailIfZero(expArr, 'grid_feedin');
        series.grid_power = impArr;
        series.grid_feedin = expArr;
    } else {
        const gridRaw = sampleEntity(e.gridPower, 1);
        let impArr = gridRaw.map(v => Math.max(0, v));
        let expArr = gridRaw.map(v => Math.max(0, -v));
        // If signed gridPower had no LTS/history, fall back to hourly derived power from kWh counters
        if (impArr.every(v => v === 0) && e.gridImportMonth && ltsDerivedPowerFromKwhByEntity.has(e.gridImportMonth.trim())) {
            impArr = sampleEntity('', 1, e.gridImportMonth).map(v => Math.max(0, v));
        }
        if (expArr.every(v => v === 0) && e.gridExportMonth && ltsDerivedPowerFromKwhByEntity.has(e.gridExportMonth.trim())) {
            expArr = sampleEntity('', 1, e.gridExportMonth).map(v => Math.max(0, v));
        }
        impArr = overlayTodayTailIfZero(impArr, 'grid_power');
        expArr = overlayTodayTailIfZero(expArr, 'grid_feedin');
        series.grid_power = impArr;
        series.grid_feedin = expArr;
    }
    integratedKwh.grid_power = resolveChannelKwh(e.gridImportMonth, integrateKwh(series.grid_power), tLive.gridImportTodayKwh ?? dayIntCache.grid_power ?? 0);
    integratedKwh.grid_feedin = resolveChannelKwh(e.gridExportMonth, integrateKwh(series.grid_feedin), tLive.gridExportTodayKwh ?? dayIntCache.grid_feedin ?? 0);

    // 4. Battery Power (Charge / Discharge) & SoC
    const hasSeparateBatChg = Boolean(
        e.batteryChargePower && (
            ltsSeriesByEntity.has(e.batteryChargePower.trim()) ||
            rawSeriesByEntity.has(e.batteryChargePower.trim()) ||
            (e.batteryChargeMonth && ltsDerivedPowerFromKwhByEntity.has(e.batteryChargeMonth.trim()))
        )
    );
    const hasSeparateBatDis = Boolean(
        e.batteryDischargePower && (
            ltsSeriesByEntity.has(e.batteryDischargePower.trim()) ||
            rawSeriesByEntity.has(e.batteryDischargePower.trim()) ||
            (e.batteryDischargeMonth && ltsDerivedPowerFromKwhByEntity.has(e.batteryDischargeMonth.trim()))
        )
    );

    if (hasSeparateBatChg || hasSeparateBatDis) {
        const chgArr = hasSeparateBatChg
            ? sampleEntity(e.batteryChargePower, 1, e.batteryChargeMonth).map(v => Math.max(0, v))
            : sampleEntity('', 1, e.batteryChargeMonth).map(v => Math.max(0, v));
        const disArr = hasSeparateBatDis
            ? sampleEntity(e.batteryDischargePower, 1, e.batteryDischargeMonth).map(v => Math.max(0, v))
            : sampleEntity('', 1, e.batteryDischargeMonth).map(v => Math.max(0, v));
        let batNetArr = bucketTimes.map((_, i) => +((chgArr[i] || 0) - (disArr[i] || 0)).toFixed(2));
        batNetArr = overlayTodayTailIfZero(batNetArr, 'battery_power');
        series.battery_power = batNetArr;
        integratedKwh.battery_charge = resolveChannelKwh(e.batteryChargeMonth, integrateKwh(chgArr), tLive.batteryChargeTodayKwh ?? dayIntCache.battery_charge ?? 0);
        integratedKwh.battery_discharge = resolveChannelKwh(e.batteryDischargeMonth, integrateKwh(disArr), tLive.batteryDischargeTodayKwh ?? dayIntCache.battery_discharge ?? 0);
        integratedKwh.battery_power = +(integratedKwh.battery_charge + integratedKwh.battery_discharge).toFixed(3);
    } else {
        let batRaw = sampleEntity(e.batteryPower, 1);
        batRaw = overlayTodayTailIfZero(batRaw, 'battery_power');
        series.battery_power = batRaw;
        const batChgArr = batRaw.map(v => Math.max(0, v));
        const batDisArr = batRaw.map(v => Math.max(0, -v));
        integratedKwh.battery_charge = resolveChannelKwh(e.batteryChargeMonth, integrateKwh(batChgArr), tLive.batteryChargeTodayKwh ?? dayIntCache.battery_charge ?? 0);
        integratedKwh.battery_discharge = resolveChannelKwh(e.batteryDischargeMonth, integrateKwh(batDisArr), tLive.batteryDischargeTodayKwh ?? dayIntCache.battery_discharge ?? 0);
        integratedKwh.battery_power = +(integratedKwh.battery_charge + integratedKwh.battery_discharge).toFixed(3);
    }

    let socArr = sampleEntity(e.batterySoc, 1);
    socArr = overlayTodayTailIfZero(socArr, 'battery_soc');
    series.battery_soc = socArr;

    // 5. House Load (AC): Direct sensor + physical energy/power balance fallback when load sensor lacks LTS
    let houseLoadArr = sampleEntity(e.loadPower, 1, e.loadEnergyMonth);
    houseLoadArr = overlayTodayTailIfZero(houseLoadArr, 'house_load');
    if (isMultiDay) {
        houseLoadArr = houseLoadArr.map((val, idx) => {
            if (val > 5) return val;
            const pvW = series.pv_total?.[idx] || 0;
            const impW = series.grid_power?.[idx] || 0;
            const expW = series.grid_feedin?.[idx] || 0;
            const batNetW = series.battery_power?.[idx] || 0; // +charge, -discharge
            const derivedLoadW = pvW + impW - expW - batNetW;
            return derivedLoadW > 5 ? +derivedLoadW.toFixed(1) : val;
        });
    }
    series.house_load = houseLoadArr;

    const loadCurveKwh = integrateKwh(series.house_load);
    const physicalBalanceLoadKwh = isMultiDay
        ? Math.max(0, (integratedKwh.pv_total || 0) - (integratedKwh.grid_feedin || 0) - (integratedKwh.battery_charge || 0) + (integratedKwh.battery_discharge || 0) + (integratedKwh.grid_power || 0))
        : 0;
    const todayLoadFallback = tLive.loadEnergyTodayKwh ?? dayIntCache.house_load ?? 0;
    integratedKwh.house_load = resolveChannelKwh(
        e.loadEnergyMonth,
        Math.max(loadCurveKwh, +physicalBalanceLoadKwh.toFixed(3)),
        todayLoadFallback
    );

    // 6. Custom Consumers
    (cfg.customConsumers || []).forEach(cc => {
        if (!cc || !cc.id) return;
        const cKey = `consumer_${cc.id}`;
        let arr = sampleEntity(cc.powerEntity, 1, cc.energyEntity).map(v => Math.max(0, v));
        arr = overlayTodayTailIfZero(arr, cKey);
        series[cKey] = arr;
        const teleCons = (tLive.consumersTelemetry || []).find(x => x.id === cc.id);
        const todayConsKwh = teleCons?.energyTodayKwh ?? teleCons?.energyKwh ?? dayIntCache[cKey] ?? 0;
        const periodConsFallback = timeframe === 'month'
            ? Math.max(todayConsKwh, teleCons?.energyMonthKwh ?? 0)
            : todayConsKwh;
        integratedKwh[cKey] = resolveChannelKwh(cc.energyEntity, integrateKwh(arr), periodConsFallback, true);
    });

    // 7. Compute Peak Values (combining Curve Max + LTS Hourly Instantaneous Peak + Today Peak)
    // For signed net grid sensors (e.gridPower), use positive peak for grid_power (Netzbezug) and negative peak for grid_feedin (Netzeinspeisung)!
    const entityForKey = {
        pv_total: (e.pvPower || '').trim(),
        house_load: (e.loadPower || '').trim(),
        grid_power: (e.gridImportPower || e.gridPower || '').trim(),
        grid_feedin: (e.gridExportPower || e.gridPower || '').trim(),
        battery_power: (e.batteryChargePower || e.batteryDischargePower || e.batteryPower || '').trim(),
        battery_soc: socEntityId
    };
    (cfg.customStrings || []).forEach(cs => {
        if (cs && cs.id) entityForKey[cs.id] = (cs.powerEntity || '').trim();
    });
    (cfg.customConsumers || []).forEach(cc => {
        if (cc && cc.id) entityForKey[`consumer_${cc.id}`] = (cc.powerEntity || '').trim();
    });

    const signedGridId = (e.gridPower || '').trim();
    Object.keys(series).forEach(k => {
        const arr = series[k] || [];
        const curvePeak = arr.reduce((m, v) => Math.max(m, Math.abs(v || 0)), 0);
        const entId = entityForKey[k] || '';
        let ltsPeak = 0;
        if (entId) {
            if (k === 'grid_power' && !(e.gridImportPower || '').trim() && entId === signedGridId) {
                ltsPeak = ltsPosPeakByEntity.get(entId) || 0;
            } else if (k === 'grid_feedin' && !(e.gridExportPower || '').trim() && entId === signedGridId) {
                ltsPeak = ltsNegPeakByEntity.get(entId) || 0;
            } else {
                ltsPeak = ltsPeakByEntity.get(entId) || 0;
            }
        }
        const todayPeak = isMultiDay ? (dayPeakCache[k] || 0) : 0;
        peakValues[k] = Math.round(Math.max(curvePeak, ltsPeak, todayPeak));
    });

    return {
        startOfDay: startIso,
        now: nowIso,
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

        // Build statesMap first so unit scaling (Wh/kWh/MWh) & state_class are known
        const statesMap = new Map();
        directRes.data.forEach(s => {
            if (s && s.entity_id) {
                statesMap.set(s.entity_id, s);
                const u = String(s.attributes?.unit_of_measurement || '').trim().toLowerCase();
                if (u) lastKnownHaUnitMap.set(s.entity_id, u);
                if (s.attributes?.state_class) lastKnownHaStateClassMap.set(s.entity_id, s.attributes.state_class);
            }
        });

        // FAST-FIRST RENDER (v11.3): Parse & display live W, SoC %, Weather & Room Climate IMMEDIATELY (~120ms)
        // and do NOT block the foreground UI or chart loading on background baseline calibration!
        const fastParsed = parseHaStatesInBrowser(directRes.data, haConfigState, statesMap);
        currentLiveTelemetry = {
            ...currentLiveTelemetry,
            ...fastParsed,
            batterySocPct: fastParsed.batterySocPct !== null && fastParsed.batterySocPct !== undefined
                ? +(Number(fastParsed.batterySocPct).toFixed(1))
                : (baseline.totalBatteryKwh > 0 ? 50 : null),
            connectionOk: true,
            lastError: null
        };
        try { updateHomeStatesFromHaArray(directRes.data); } catch (e) {}
        renderLiveCockpitUI(baseline);
        renderIntradayCurveSection(baseline);
        saveInstantBootSnapshot();

        // Sync 00:00 & month-start counter baselines asynchronously in the background without blocking!
        syncEnergyCounterBaselinesFromHaHistory(haConfigState, statesMap).then(() => {
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
            saveInstantBootSnapshot();
        }).catch(() => {});
        return;
    }

    // Trigger today & month start counter baselines in background for fallback backend path
    syncEnergyCounterBaselinesFromHaHistory(haConfigState, null).catch(() => {});

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
    const win = getEffectiveTimeframeWindow(haConfigState, currentCurveTimeframe);
    const { now, startTime, stepMs } = win;

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
                    persistIntradayHistoryCacheToIdb();
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

    const startsInCurrentMonth = bTimes[0] >= (startOfMonthMs - 12 * 3600 * 1000);
    const mInt = startsInCurrentMonth ? (monthDs.integratedKwh || {}) : {};

    return {
        pv_total: Math.max(Number(dayInt.pv_total) || 0, pvMonthInt, Number(mInt.pv_total) || 0),
        house_load: Math.max(Number(dayInt.house_load) || 0, loadMonthInt, Number(mInt.house_load) || 0),
        grid_power: Math.max(Number(dayInt.grid_power) || 0, gridImpMonthInt, Number(mInt.grid_power) || 0),
        grid_feedin: Math.max(Number(dayInt.grid_feedin) || 0, gridExpMonthInt, Number(mInt.grid_feedin) || 0),
        battery_charge: Math.max(Number(dayInt.battery_charge) || 0, batChgMonthInt, Number(mInt.battery_charge) || 0),
        battery_discharge: Math.max(Number(dayInt.battery_discharge) || 0, batDisMonthInt, Number(mInt.battery_discharge) || 0)
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
    // If the user manually calibrated/corrected the current month in the Monats-Logbuch (source === 'manual'),
    // respect that manual calibration directly so old pre-tracking counter offsets never override the user's manual correction!
    const now = new Date();
    const curYearMonths = getCurrentYearMonthsData(now.getFullYear());
    const curMonthLogObj = curYearMonths?.[now.getMonth()];
    const hasManualMonthOverride = Boolean(curMonthLogObj && curMonthLogObj.source === 'manual');

    const pvMonthCandidates = (hasManualMonthOverride && curMonthLogObj.pvYieldKwh !== null && curMonthLogObj.pvYieldKwh !== '')
        ? [Math.max(pvToday, Number(curMonthLogObj.pvYieldKwh) || 0)]
        : [pvToday, Number(t.pvEnergyMonthKwh) || 0, Number(monthInt.pv_total) || 0];

    const gridImpMonthCandidates = (hasManualMonthOverride && curMonthLogObj.gridImportKwh !== null && curMonthLogObj.gridImportKwh !== '')
        ? [Math.max(gridImpToday, Number(curMonthLogObj.gridImportKwh) || 0)]
        : [gridImpToday, Number(t.gridImportMonthKwh) || 0, Number(monthInt.grid_power) || 0];

    const gridExpMonthCandidates = (hasManualMonthOverride && curMonthLogObj.gridExportKwh !== null && curMonthLogObj.gridExportKwh !== '')
        ? [Math.max(gridExpToday, Number(curMonthLogObj.gridExportKwh) || 0)]
        : [gridExpToday, Number(t.gridExportMonthKwh) || 0, Number(monthInt.grid_feedin) || 0];

    const batChgMonthCandidates = hasBattery
        ? ((hasManualMonthOverride && curMonthLogObj.batteryChargedKwh !== null && curMonthLogObj.batteryChargedKwh !== '')
            ? [Math.max(batChgToday, Number(curMonthLogObj.batteryChargedKwh) || 0)]
            : [batChgToday, Number(t.batteryChargeMonthKwh) || 0, Number(monthInt.battery_charge) || 0])
        : [0];

    const batDisMonthCandidates = hasBattery
        ? ((hasManualMonthOverride && curMonthLogObj.batteryDischargedKwh !== null && curMonthLogObj.batteryDischargedKwh !== '')
            ? [Math.max(batDisToday, Number(curMonthLogObj.batteryDischargedKwh) || 0)]
            : [batDisToday, Number(t.batteryDischargeMonthKwh) || 0, Number(monthInt.battery_discharge) || 0])
        : [0];

    const loadMonthCandidates = [houseTotalToday, Number(t.loadEnergyMonthKwh) || 0, Number(monthInt.house_load) || 0];

    let pvMonth = +Math.max(...pvMonthCandidates).toFixed(2);
    let batChgMonth = +Math.min(pvMonth, Math.max(...batChgMonthCandidates)).toFixed(2);
    let batDisMonth = +Math.max(...batDisMonthCandidates).toFixed(2);
    let batLossMonth = +Math.max(0, batChgMonth - batDisMonth).toFixed(2);

    let gridImpMonth = +Math.max(...gridImpMonthCandidates).toFixed(2);
    const rawLoadMonth = Math.max(...loadMonthCandidates);
    const rawExpMonth = Math.max(...gridExpMonthCandidates);
    let gridExpMonth = +Math.min(Math.max(0, pvMonth - batChgMonth), Math.max(gridExpToday, rawExpMonth)).toFixed(2);

    // Reconcile PV Direct consumption using both PV-side balance (PV - BatChg - GridExp)
    // and Load-side balance (Measured House Load - GridImp - BatDis) so multi-inverter setups never compress direct PV to ~2 kWh
    const directFromPvSide = Math.max(0, pvMonth - batChgMonth - gridExpMonth);
    const directFromLoadSide = rawLoadMonth > 0
        ? Math.min(Math.max(0, pvMonth - batChgMonth), Math.max(0, rawLoadMonth - gridImpMonth - batDisMonth))
        : 0;
    let pvDirectMonth = +Math.max(pvDirectToday, directFromPvSide, directFromLoadSide).toFixed(2);

    // Ensure strict energy conservation on PV side: PV = Direkt + Akku-Ladung + Einspeisung
    if (pvDirectMonth + batChgMonth + gridExpMonth > pvMonth) {
        gridExpMonth = +Math.max(0, pvMonth - batChgMonth - pvDirectMonth).toFixed(2);
        if (pvDirectMonth + batChgMonth + gridExpMonth > pvMonth) {
            pvMonth = +(pvDirectMonth + batChgMonth + gridExpMonth).toFixed(2);
        }
    }

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
            hasLiveData: hasAnyRealData,
            isManualOverride: hasManualMonthOverride,
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
        persistIntradayHistoryCacheToIdb();
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
    const pvLine2 = t.pvPowerW > 15 ? 'PV-Erzeugung aktiv' : 'Keine PV-Erzeugung';
    setElText('dash_pv_status', pvLine1);
    setElText('dash_pv_sub2', pvLine2);
    setElText('dash_pv_sub', `${pvLine1} · ${pvLine2}`);
    const pvBar = document.getElementById('dash_pv_bar');
    if (pvBar) pvBar.style.width = `${pvBarPct}%`;

    const loadBarPct = Math.min(100, Math.max(6, Math.round((t.loadPowerW / 5000) * 100)));
    setElText('dash_load_power', formatPowerDe(t.loadPowerW));
    const loadTodayVal = td.houseTotal;
    const loadLine1 = `${formatKwhDe(loadTodayVal, 2)} heute`;
    const loadLine2 = 'Aktueller Hausverbrauch';
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

    let batLine1 = 'Ruhe / Standby';
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
    let gridLine2 = 'Bezug aus dem Netz';
    if (t.gridPowerW < -15) {
        gridLine1 = `${formatKwhDe(gridExpToday, 2)} Einspeisung`;
        gridLine2 = 'Einspeisung ins Netz';
    } else if (t.gridPowerW > 15) {
        gridLine1 = `${formatKwhDe(gridImpToday, 2)} Bezug`;
        gridLine2 = 'Bezug aus dem Netz';
    } else if (gridExpToday > 0.05) {
        gridLine2 = `↑ ${formatKwhDe(gridExpToday, 2)} Einspeisung`;
    }
    setElText('dash_grid_status', gridLine1);
    setElText('dash_grid_sub2', gridLine2);
    setElText('dash_grid_sub', `${gridLine1} · ${gridLine2}`);
    const gridBar = document.getElementById('dash_grid_bar');
    if (gridBar) gridBar.style.width = `${gridBarPct}%`;

    // 2A. Synchronize Ebene 0 (Startseite / Home) Energy Overview Card
    try { updateHomeEnergyOverview(baseline); } catch (e) {}

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

    // 3. Render Interactive "Aktive Verbraucher" List (Calm Reference White/Glass Cards with Clear Sans-Serif Typography)
    const sortLblEl = document.getElementById('lblConsumerSortMode');
    if (sortLblEl) {
        sortLblEl.innerText = consumerSortMode === 'kwh_first' ? 'Prio: Heute kWh' : 'Prio: Live → kWh';
    }

    const consContainer = document.getElementById('dash_active_consumers_list');
    if (consContainer) {
        const rawConsumers = Array.isArray(t.consumersTelemetry) && t.consumersTelemetry.length > 0
            ? [...t.consumersTelemetry]
            : (haConfigState.customConsumers || []).map(c => ({ id: c.id, name: c.name, powerW: 0, energyKwh: null, available: false }));

        const consumers = rawConsumers.map(c => {
            const pW = Math.max(0, Number(c.powerW) || 0);
            const fromCounterKwh = (c.energyKwh !== null && c.energyKwh !== undefined && !isNaN(c.energyKwh)) ? Number(c.energyKwh) : null;
            const fromIntegralKwh = Number(dayInt[`consumer_${c.id}`] || 0);
            const consKwh = fromCounterKwh !== null ? Math.max(fromCounterKwh, fromIntegralKwh) : fromIntegralKwh;
            return {
                ...c,
                powerW: pW,
                consKwh: +Math.max(0, consKwh).toFixed(3),
                isActive: pW > 5
            };
        });

        consumers.sort((a, b) => {
            if (consumerSortMode === 'kwh_first') {
                if (Math.abs(b.consKwh - a.consKwh) > 0.005) return b.consKwh - a.consKwh;
                return b.powerW - a.powerW;
            }
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            if (a.isActive) {
                if (Math.abs(b.powerW - a.powerW) > 1) return b.powerW - a.powerW;
                return b.consKwh - a.consKwh;
            }
            if (Math.abs(b.consKwh - a.consKwh) > 0.003) return b.consKwh - a.consKwh;
            return b.powerW - a.powerW;
        });

        if (consumers.length === 0) {
            consContainer.innerHTML = `
                <div class="rounded-[18px] border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Noch keine Einzelverbraucher-Sensoren hinterlegt.</span>
                    <button onclick="openHaConfigModal('consumers')" class="text-teal-600 dark:text-teal-400 font-semibold hover:underline cursor-pointer">+ Anlegen</button>
                </div>`;
        } else {
            const TOP_LIMIT = 5;
            const visibleConsumers = showAllDashboardConsumers ? consumers : consumers.slice(0, TOP_LIMIT);
            const hiddenCount = Math.max(0, consumers.length - TOP_LIMIT);
            const maxConsKwhToday = Math.max(0.05, ...consumers.map(x => x.consKwh || 0));

            const rowsHtml = visibleConsumers.map(c => {
                const safeName = typeof escapeHtml === 'function' ? escapeHtml(c.name) : c.name;
                const valStr = formatPowerDe(c.powerW, c.powerW < 1000);
                const consKwh = c.consKwh || 0;
                const isActive = c.isActive;
                const liveSharePct = (isActive && t.loadPowerW > 20) ? Math.min(100, Math.round((c.powerW / t.loadPowerW) * 100)) : 0;

                // Subtle background progress bar width representing daily kWh consumption
                let barWidthPct = 0;
                if (consKwh > 0.002) {
                    barWidthPct = Math.min(100, Math.max(5, Math.round((consKwh / maxConsKwhToday) * 100)));
                } else if (isActive) {
                    barWidthPct = Math.min(28, Math.max(6, Math.round((c.powerW / Math.max(600, t.loadPowerW || 1000)) * 32)));
                }

                const kwhText = consKwh > 0.001
                    ? `${formatKwhDe(consKwh, 2)} heute${isActive && liveSharePct > 0 ? ` · ${liveSharePct}% Hauslast` : ''}`
                    : (isActive && liveSharePct > 0 ? `${liveSharePct}% der aktuellen Hauslast` : '');

                const safeIdJs = String(c.id || '').replace(/'/g, "\\'");

                // Calm white/glass card design matching reference screenshot (no pulsing dot, clean sans-serif)
                const cardClasses = isActive
                    ? 'border-slate-200/90 dark:border-slate-700/80 bg-white/92 dark:bg-slate-900/85 hover:border-teal-500/50 shadow-2xs'
                    : 'border-slate-200/75 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/55 hover:border-slate-300 dark:hover:border-slate-700';

                const fillBarClasses = isActive
                    ? 'consumer-progress-fill-active'
                    : (consKwh > 0.002 ? 'consumer-progress-fill-idle' : 'bg-slate-200/55 dark:bg-slate-800/45');

                const nameClasses = isActive
                    ? 'text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-slate-300 font-normal';

                const powerClasses = isActive
                    ? 'text-slate-900 dark:text-white font-bold'
                    : 'text-slate-500 dark:text-slate-400 font-semibold';

                return `
                <div onclick="openLiveCurveFocus('consumer:${safeIdJs}')"
                    role="button" tabindex="0" title="Tippen für Verlaufskurve (${safeName})"
                    class="relative overflow-hidden rounded-[18px] border ${cardClasses} px-4 py-3 flex items-center justify-between transition-all cursor-pointer group active:scale-[0.99]">
                    <!-- Subtle Full-Row Horizontal Background Progress Bar (indicates daily kWh consumption) -->
                    <div aria-hidden="true" class="absolute inset-y-0 left-0 pointer-events-none transition-all duration-700 ease-out rounded-r-xl ${fillBarClasses}" style="width: ${barWidthPct}%"></div>

                    <!-- Foreground Content (Calm, Finely Detailed Reference Style) -->
                    <div class="relative z-10 min-w-0 pr-3">
                        <div class="text-[14px] ${nameClasses} group-hover:text-teal-700 dark:group-hover:text-teal-300 truncate leading-snug">${safeName}</div>
                        ${kwhText ? `<div class="text-[12.5px] font-normal text-slate-500 dark:text-slate-400 tabular-nums truncate leading-snug mt-0.5">${kwhText}</div>` : ''}
                    </div>
                    <div class="relative z-10 flex items-baseline gap-1 shrink-0 tabular-nums pl-2">
                        <span class="text-[14px] sm:text-[15px] ${powerClasses}">${valStr}</span>
                    </div>
                </div>`;
            }).join('');

            const expandBtnHtml = consumers.length > TOP_LIMIT ? `
                <button type="button" onclick="toggleShowAllDashboardConsumers()"
                    class="w-full mt-1.5 py-2.5 px-3 rounded-[18px] bg-white/80 hover:bg-white dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200/85 dark:border-slate-700/60 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer">
                    <span class="material-symbols-rounded text-base text-teal-600 dark:text-teal-400">${showAllDashboardConsumers ? 'expand_less' : 'expand_more'}</span>
                    <span>${showAllDashboardConsumers ? 'Auf Top 5 Verbraucher reduzieren' : `Alle ${consumers.length} Verbraucher anzeigen (+${hiddenCount} weitere)`}</span>
                </button>` : '';

            consContainer.innerHTML = rowsHtml + expandBtnHtml;
        }

        const fnEl = document.getElementById('dash_consumers_footnote');
        if (fnEl) {
            const unavail = t.unavailableConsumersCount || 0;
            const unavailText = unavail > 0 ? ` · ${unavail} Sensor(en) inaktiv.` : '';
            const modeDesc = consumerSortMode === 'kwh_first'
                ? 'Sortiert nach Tagesverbrauch (kWh heute)'
                : 'Prio 1: Aktive Verbraucher (W) · Prio 2: Tagesverbrauch (kWh)';
            fnEl.innerText = `${modeDesc} · Hintergrundbalken zeigt kWh heute · Tipp öffnet 24h-Kurve${unavailText}`;
        }
    }

    // 4. Update Level 1 Drill-Down Card Summary for Intraday Curve
    const intradaySumEl = document.getElementById('live_hub_intraday_summary');
    if (intradaySumEl) {
        const customStrNames = (haConfigState.customStrings || []).slice(0, 2).map(s => s.name).join(', ');
        const todayPv = td.pvTotal ?? 0;
        intradaySumEl.innerText = `${customStrNames || 'Strings'}, Haus & Batterie · Heute ${formatKwhDe(todayPv, 2)} (${activeCurveKeys.size} Kanäle aktiv)`;
    }

    // In Tablet/Desktop Landscape Two-Column Cockpit Mode, keep the right-hand telemetry chart live in sync!
    if (isWideCockpitViewport()) {
        renderIntradayCurveSection(baseline);
    }
}

function isWideCockpitViewport() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 1024px), (min-width: 700px) and (orientation: landscape)').matches;
}
if (typeof window !== 'undefined') {
    window.isWideCockpitViewport = isWideCockpitViewport;
}

function toggleShowAllDashboardConsumers() {
    showAllDashboardConsumers = !showAllDashboardConsumers;
    renderLiveCockpitUI();
}

function toggleConsumerSortMode() {
    consumerSortMode = consumerSortMode === 'live_first' ? 'kwh_first' : 'live_first';
    try {
        localStorage.setItem('pvpro_consumer_sort_mode', consumerSortMode);
    } catch (e) {}
    renderLiveCockpitUI();
}
window.toggleConsumerSortMode = toggleConsumerSortMode;

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
    // On mobile portrait, navigate into Level 2 detail view; in Two-Column Landscape/Desktop Cockpit, keep both columns visible!
    if (!isWideCockpitViewport() && typeof openLiveDrillDown === 'function') {
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

function getChannelEnergyDiagnosticBadge(energyEntities, explicitKwhUsed, calcWattKwh) {
    const ids = (Array.isArray(energyEntities) ? energyEntities : [energyEntities])
        .map(x => String(x || '').trim())
        .filter(Boolean);
    if (ids.length === 0) {
        return {
            tone: 'watt',
            text: '∫ Aus Live-W integriert'
        };
    }

    // 1. Check if any configured kWh entity is unavailable or has wrong unit
    for (const id of ids) {
        const d = getSensorDiagnostic(id);
        if (d && (d.status === 'unavailable' || d.status === 'wrong_unit')) {
            if (calcWattKwh > 0.01) {
                return {
                    tone: 'watt',
                    text: d.status === 'wrong_unit' ? '∫ Einheit ≠ kWh → aus W integriert' : '∫ kWh-Sensor inaktiv → aus W integriert'
                };
            }
            return {
                tone: 'error',
                text: d.status === 'wrong_unit' ? '! Einheit ≠ kWh & keine W-Kurve' : '! Sensor inaktiv / nicht erreichbar'
            };
        }
    }

    // 2. Check if configured kWh sensor delivered 0 while Watt integral is positive (>0.08 kWh)
    if ((!explicitKwhUsed || explicitKwhUsed <= 0.001) && calcWattKwh > 0.08) {
        return {
            tone: 'watt',
            text: '∫ kWh=0 → aus W integriert'
        };
    }

    // 3. Check if any configured kWh entity has an informational jump notice (e.g. +85 kWh Shelly transfer)
    for (const id of ids) {
        const d = getSensorDiagnostic(id);
        if (d && d.jumpKwh >= 15) {
            const sp = Number(d.jumpKwh).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            return {
                tone: 'ok',
                text: `✓ Hardware kWh-Zähler aktiv (inkl. +${sp} kWh Übertrag)`
            };
        }
    }

    return {
        tone: 'ok',
        text: '✓ Hardware kWh-Zähler aktiv'
    };
}

function renderInlineDiagSymbol(diagTone, diagText) {
    if (!diagTone) return '';
    const safeTip = typeof escapeHtml === 'function' ? escapeHtml(diagText || '') : (diagText || '');
    if (diagTone === 'ok') {
        return `<span class="inline-flex items-center justify-center ml-1 text-[12.5px] font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0" title="${safeTip}">✓</span>`;
    }
    if (diagTone === 'error') {
        return `<span class="inline-flex items-center justify-center ml-1 text-[12.5px] font-extrabold text-rose-500 dark:text-rose-400 shrink-0" title="${safeTip}">!</span>`;
    }
    return `<span class="inline-flex items-center justify-center ml-1 text-[12.5px] font-extrabold text-amber-500 dark:text-amber-400 shrink-0" title="${safeTip}">∫</span>`;
}

function getAvailableCurveDefinitions() {
    const t = currentLiveTelemetry;
    const intKwh = intradaySeriesState.integratedKwh || {};
    const peaks = intradaySeriesState.peakValues || {};
    const dayIntCache = intradayHistoryCache.day?.integratedKwh || {};
    const dayPeakCache = intradayHistoryCache.day?.peakValues || {};
    const ledger = typeof getUnifiedEnergyLedger === 'function' ? getUnifiedEnergyLedger() : null;
    const customStrings = Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.length > 0
        ? haConfigState.customStrings
        : DEFAULT_CUSTOM_STRINGS;
    const customConsumers = Array.isArray(haConfigState.customConsumers) ? haConfigState.customConsumers : [];
    const e = haConfigState.entities || {};

    const isDay = currentCurveTimeframe === 'day';
    const isMonth = currentCurveTimeframe === 'month';
    const win = getEffectiveTimeframeWindow(haConfigState, currentCurveTimeframe);
    const trackShortStr = win.trackDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const periodSuffix = currentCurveTimeframe === 'week'
        ? (win.boundedByTrackingStart ? `ab ${trackShortStr}` : '7 Tage')
        : (isMonth ? (win.boundedByTrackingStart ? `ab ${trackShortStr}` : '30 Tage') : 'heute');

    const defs = [];

    // 1. Custom PV Strings / Inverters
    customStrings.forEach((cs, idx) => {
        const teleItem = (t.customStringsTelemetry || []).find(x => x.id === cs.id);
        const liveW = teleItem ? teleItem.powerW : (t.stringTelemetry?.[cs.id]?.powerW || 0);
        const rawExplicitKwh = teleItem?.energyKwh ?? t.stringTelemetry?.[cs.id]?.energyKwh ?? null;
        const rawMonthExplicitKwh = teleItem?.energyMonthKwh ?? t.stringTelemetry?.[cs.id]?.energyMonthKwh ?? null;
        const explicitTodayKwh = rawExplicitKwh ?? dayIntCache[cs.id] ?? 0;
        const calcKwh = intKwh[cs.id] ?? 0;
        const kwhVal = isDay
            ? (explicitTodayKwh > 0 ? explicitTodayKwh : calcKwh)
            : (isMonth
                ? ((calcKwh > 0) ? Math.max(calcKwh, explicitTodayKwh) : Math.max(rawMonthExplicitKwh ?? 0, explicitTodayKwh))
                : Math.max(calcKwh, explicitTodayKwh || 0));
        const peakW = Math.max(liveW, peaks[cs.id] || 0, isDay ? 0 : (dayPeakCache[cs.id] || 0));
        const diagRefKwh = isDay ? rawExplicitKwh : Math.max(rawExplicitKwh ?? 0, rawMonthExplicitKwh ?? 0, kwhVal);
        const diag = getChannelEnergyDiagnosticBadge(cs.energyEntity, diagRefKwh, calcKwh);

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
            subDisplay: `${formatKwhDe(kwhVal, 2)} · Max ${formatPowerDe(peakW, true)}`,
            diagTone: diag.tone,
            diagText: diag.text
        });
    });

    // 2. PV gesamt · DC
    const pvCounterIds = getConfiguredPvEnergyEntities(haConfigState);
    const todayPvKwh = ledger?.today?.pvTotal ?? t.pvEnergyTodayKwh ?? dayIntCache.pv_total ?? 0;
    const monthPvKwh = ledger?.month?.pvTotal ?? t.pvEnergyMonthKwh ?? 0;
    const pvTotalKwh = isDay
        ? (todayPvKwh > 0 ? todayPvKwh : (intKwh.pv_total ?? 0))
        : (isMonth
            ? ((intKwh.pv_total && intKwh.pv_total > 0) ? Math.max(intKwh.pv_total, todayPvKwh) : Math.max(monthPvKwh, todayPvKwh))
            : Math.max(intKwh.pv_total ?? 0, todayPvKwh));
    const pvPeakW = Math.max(t.pvPowerW || 0, peaks.pv_total || 0, isDay ? 0 : (dayPeakCache.pv_total || 0));
    const pvDiag = getChannelEnergyDiagnosticBadge(pvCounterIds, t.pvEnergyTodayKwh, intKwh.pv_total ?? 0);
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
        subDisplay: `${formatKwhDe(pvTotalKwh, 2)} · Max ${formatPowerDe(pvPeakW, true)}`,
        diagTone: pvDiag.tone,
        diagText: pvDiag.text
    });

    // 3. Hausverbrauch · AC (Single Source of Truth: always prioritize ledger.today.houseTotal on 'day' just like grid_power & grid_feedin!)
    const todayLoadKwh = ledger?.today?.houseTotal ?? t.loadEnergyTodayKwh ?? dayIntCache.house_load ?? 0;
    const monthLoadKwh = ledger?.month?.houseTotal ?? t.loadEnergyMonthKwh ?? 0;
    const loadKwh = isDay
        ? (todayLoadKwh > 0 ? todayLoadKwh : (intKwh.house_load ?? 0))
        : (isMonth
            ? ((intKwh.house_load && intKwh.house_load > 0) ? Math.max(intKwh.house_load, todayLoadKwh) : Math.max(monthLoadKwh, todayLoadKwh))
            : Math.max(intKwh.house_load ?? 0, todayLoadKwh));
    const loadPeakW = Math.max(t.loadPowerW || 0, peaks.house_load || 0, isDay ? 0 : (dayPeakCache.house_load || 0));
    const loadDiag = getChannelEnergyDiagnosticBadge(e.loadEnergyMonth, t.loadEnergyTodayKwh, intKwh.house_load ?? 0);
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
        subDisplay: `${formatKwhDe(loadKwh, 2)} · Max ${formatPowerDe(loadPeakW, true)}`,
        diagTone: loadDiag.tone,
        diagText: loadDiag.text
    });

    // 4. Netzbezug
    const gridImportLive = Math.max(0, t.gridPowerW || 0);
    const todayGridImpKwh = ledger?.today?.gridImp ?? t.gridImportTodayKwh ?? dayIntCache.grid_power ?? 0;
    const monthGridImpKwh = ledger?.month?.gridImp ?? t.gridImportMonthKwh ?? 0;
    const gridImportKwh = isDay
        ? (todayGridImpKwh > 0 ? todayGridImpKwh : (intKwh.grid_power ?? 0))
        : (isMonth
            ? ((intKwh.grid_power && intKwh.grid_power > 0) ? Math.max(intKwh.grid_power, todayGridImpKwh) : Math.max(monthGridImpKwh, todayGridImpKwh))
            : Math.max(intKwh.grid_power ?? 0, todayGridImpKwh));
    const gridImpPeakW = Math.max(gridImportLive, peaks.grid_power || 0, isDay ? 0 : (dayPeakCache.grid_power || 0));
    const gridImpDiag = getChannelEnergyDiagnosticBadge(e.gridImportMonth, t.gridImportTodayKwh, intKwh.grid_power ?? 0);
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
        subDisplay: `${formatKwhDe(gridImportKwh, 2)} · Max ${formatPowerDe(gridImpPeakW, true)}`,
        diagTone: gridImpDiag.tone,
        diagText: gridImpDiag.text
    });

    // 5. Netzeinspeisung
    const gridExportLive = Math.max(0, -(t.gridPowerW || 0));
    const todayGridExpKwh = ledger?.today?.gridExp ?? t.gridExportTodayKwh ?? dayIntCache.grid_feedin ?? 0;
    const monthGridExpKwh = ledger?.month?.gridExp ?? t.gridExportMonthKwh ?? 0;
    const gridExportKwh = isDay
        ? (todayGridExpKwh > 0 ? todayGridExpKwh : (intKwh.grid_feedin ?? 0))
        : (isMonth
            ? ((intKwh.grid_feedin && intKwh.grid_feedin > 0) ? Math.max(intKwh.grid_feedin, todayGridExpKwh) : Math.max(monthGridExpKwh, todayGridExpKwh))
            : Math.max(intKwh.grid_feedin ?? 0, todayGridExpKwh));
    const gridExpPeakW = Math.max(gridExportLive, peaks.grid_feedin || 0, isDay ? 0 : (dayPeakCache.grid_feedin || 0));
    const gridExpDiag = getChannelEnergyDiagnosticBadge(e.gridExportMonth, t.gridExportTodayKwh, intKwh.grid_feedin ?? 0);
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
        subDisplay: `${formatKwhDe(gridExportKwh, 2)} · Max ${formatPowerDe(gridExpPeakW, true)}`,
        diagTone: gridExpDiag.tone,
        diagText: gridExpDiag.text
    });

    // 6. Batterie · Leistung (W)
    const batName = haConfigState.batteryName || 'Batterie';
    const batLiveW = t.batteryPowerW || 0;
    const todayBatChg = ledger?.today?.batChg ?? t.batteryChargeTodayKwh ?? dayIntCache.battery_charge ?? 0;
    const todayBatDis = ledger?.today?.batDis ?? t.batteryDischargeTodayKwh ?? dayIntCache.battery_discharge ?? 0;
    const monthBatChg = ledger?.month?.batChg ?? t.batteryChargeMonthKwh ?? 0;
    const monthBatDis = ledger?.month?.batDis ?? t.batteryDischargeMonthKwh ?? 0;
    const batChgKwh = isDay
        ? (todayBatChg > 0 ? todayBatChg : (intKwh.battery_charge ?? 0))
        : (isMonth
            ? ((intKwh.battery_charge && intKwh.battery_charge > 0) ? Math.max(intKwh.battery_charge, todayBatChg) : Math.max(monthBatChg, todayBatChg))
            : Math.max(intKwh.battery_charge ?? 0, todayBatChg));
    const batDisKwh = isDay
        ? (todayBatDis > 0 ? todayBatDis : (intKwh.battery_discharge ?? 0))
        : (isMonth
            ? ((intKwh.battery_discharge && intKwh.battery_discharge > 0) ? Math.max(intKwh.battery_discharge, todayBatDis) : Math.max(monthBatDis, todayBatDis))
            : Math.max(intKwh.battery_discharge ?? 0, todayBatDis));
    const batLiveSign = batLiveW > 15 ? '+' : (batLiveW < -15 ? '−' : '');
    const batDiag = getChannelEnergyDiagnosticBadge(
        [e.batteryChargeMonth, e.batteryDischargeMonth],
        (t.batteryChargeTodayKwh ?? 0) + (t.batteryDischargeTodayKwh ?? 0),
        (intKwh.battery_charge ?? 0) + (intKwh.battery_discharge ?? 0)
    );
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
        subDisplay: `↑${formatKwhDe(batChgKwh, 1)} · ↓${formatKwhDe(batDisKwh, 1)}`,
        diagTone: batDiag.tone,
        diagText: batDiag.text
    });

    // 7. Batterie · Ladezustand (%)
    const socVal = t.batterySocPct !== null && t.batterySocPct !== undefined ? Number(t.batterySocPct) : 0;
    const socSeries = (intradaySeriesState.series.battery_soc || []).filter(v => v > 0);
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
        const rawConsExplicit = teleCons?.energyTodayKwh ?? teleCons?.energyKwh ?? null;
        const rawConsMonthExplicit = teleCons?.energyMonthKwh ?? null;
        const todayConsKwh = rawConsExplicit ?? dayIntCache[cKey] ?? 0;
        const calcKwh = intKwh[cKey] ?? 0;
        const cKwh = isDay
            ? (todayConsKwh > 0 ? todayConsKwh : calcKwh)
            : (isMonth
                ? ((calcKwh > 0) ? Math.max(calcKwh, todayConsKwh) : Math.max(rawConsMonthExplicit ?? 0, todayConsKwh))
                : Math.max(calcKwh, todayConsKwh || 0));
        const cPeakW = Math.max(liveW, peaks[cKey] || 0, isDay ? 0 : (dayPeakCache[cKey] || 0));
        const diagRefKwh = isDay ? rawConsExplicit : Math.max(rawConsExplicit ?? 0, rawConsMonthExplicit ?? 0, cKwh);
        const consDiag = getChannelEnergyDiagnosticBadge(cc.energyEntity, diagRefKwh, calcKwh);

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
            subDisplay: `${formatKwhDe(cKwh, 2)} · Max ${formatPowerDe(cPeakW, true)}`,
            diagTone: consDiag.tone,
            diagText: consDiag.text
        });
    });

    return defs;
}

function toggleIntradayDayZoomMode(event = null) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (intradayDayPanOffsetBuckets !== 0) {
        intradayDayPanOffsetBuckets = 0;
        intradayDayZoomMode = 'auto';
    } else {
        intradayDayZoomMode = intradayDayZoomMode === 'auto' ? 'full' : 'auto';
    }
    try {
        localStorage.setItem('pvpro_intraday_day_zoom', intradayDayZoomMode);
    } catch (e) {}
    renderIntradayCurveSection();
}

function panIntradayDayWindow(deltaBuckets = -12, event = null) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (currentCurveTimeframe !== 'day') return;
    intradayDayPanOffsetBuckets = (intradayDayPanOffsetBuckets || 0) + Number(deltaBuckets || 0);
    // Clamp pan offset within reasonable day bounds (-144 to +144 buckets)
    intradayDayPanOffsetBuckets = Math.max(-180, Math.min(180, intradayDayPanOffsetBuckets));
    renderIntradayCurveSection();
}

if (typeof window !== 'undefined') {
    window.toggleIntradayDayZoomMode = toggleIntradayDayZoomMode;
    window.panIntradayDayWindow = panIntradayDayWindow;
}

function computeIntradayDayAutoStartIndex(defs) {
    const labels = intradaySeriesState.labels || [];
    const nReal = labels.length;
    if (nReal <= 16) return 0;

    const activeDefs = (defs || getAvailableCurveDefinitions()).filter(d => activeCurveKeys.has(d.key) && d.axis === 'yPower');
    if (activeDefs.length === 0) return 0;

    // Prefer PV / generation curves if any are active so night flatlines (00:00-07:30) are cleanly trimmed
    const pvLikeKeys = new Set(['pv_total', 'grid_exp', 'bat_chg']);
    const pvActiveDefs = activeDefs.filter(d => pvLikeKeys.has(d.key) || String(d.key).startsWith('str_'));
    const scanDefs = pvActiveDefs.length > 0 ? pvActiveDefs : activeDefs;
    const thresholdW = pvActiveDefs.length > 0 ? 15 : 40;

    let firstActiveIdx = -1;
    for (let i = 0; i < nReal; i++) {
        const hasActivity = scanDefs.some(d => {
            const arr = intradaySeriesState.series[d.key] || [];
            return Math.abs(Number(arr[i] || 0)) >= thresholdW;
        });
        if (hasActivity) {
            firstActiveIdx = i;
            break;
        }
    }

    if (firstActiveIdx <= 0) {
        // If no activity yet today (e.g. early morning), show the last 3 hours up to now + 1h future
        return Math.max(0, nReal - 36);
    }

    // Start 6 buckets (30 minutes) before first activity so the morning ramp-up has clean breathing room
    const paddedStart = Math.max(0, firstActiveIdx - 6);
    return Math.min(paddedStart, Math.max(0, nReal - 18));
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

    // 1. Update View Title, Reset-Focus Button, Day Window Controls & Timeframe Pills
    const titleEl = document.getElementById('intraday_view_title');
    if (titleEl) {
        const defaultTitle = currentCurveTimeframe === 'week'
            ? '7-Tage-Verlauf · Telemetrie'
            : (currentCurveTimeframe === 'month' ? 'Monats- & 30-Tage-Verlauf · Telemetrie' : 'Tagesverlauf · Telemetrie');
        titleEl.innerText = currentFocusedCurveMode ? currentFocusedCurveTitle : defaultTitle;
    }
    const resetBtn = document.getElementById('btnResetCurveFocus');
    if (resetBtn) {
        if (currentFocusedCurveMode) resetBtn.classList.remove('hidden');
        else resetBtn.classList.add('hidden');
    }

    const dayWinCtrl = document.getElementById('intradayDayWindowControls');
    if (dayWinCtrl) {
        if (currentCurveTimeframe === 'day') dayWinCtrl.classList.remove('hidden');
        else dayWinCtrl.classList.add('hidden');
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

    // 2. Update Single-Line Timestamp Range Header (Timeframe- & TrackingStartDate-Aware!)
    const now = intradaySeriesState.nowIso ? new Date(intradaySeriesState.nowIso) : new Date();
    const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const win = getEffectiveTimeframeWindow(haConfigState, currentCurveTimeframe);
    const startStr = win.startTime.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const stepHours = Math.max(1, Math.round(win.stepMs / 3600000));

    let rangeString = `${dateStr} · 00:00 – ${timeStr} Uhr (+1h Vorschau)`;
    if (currentCurveTimeframe === 'week') {
        rangeString = win.boundedByTrackingStart
            ? `Ab Mess-Start ${startStr} · 1h-Auflösung (bis ${dateStr}, ${timeStr} Uhr)`
            : `Letzte 7 Tage · 1h-Auflösung (bis ${dateStr}, ${timeStr} Uhr)`;
    } else if (currentCurveTimeframe === 'month') {
        rangeString = win.boundedByTrackingStart
            ? `Ab Mess-Start ${startStr} · ${stepHours}h-Auflösung (bis ${dateStr})`
            : `Letzte 30 Tage · ${stepHours}h-Auflösung (bis ${dateStr})`;
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

    // 4. Render Compact Technical Channel Cards Below Chart (Theme-Aware for Light & Dark Mode)
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
                class="rounded-2xl px-3 py-2.5 cursor-pointer select-none transition-all duration-150 hover:opacity-100 group">
                <div class="flex items-center justify-between gap-1">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${isActive ? d.color : '#94a3b8'}"></span>
                        <p class="text-[12.5px] ${isActive ? 'font-medium text-slate-900 dark:text-slate-100' : 'font-normal text-slate-600 dark:text-slate-400'} truncate">${safeName}</p>
                    </div>
                    <button type="button"
                        onclick="focusSingleIntradayCurve('${safeKeyJs}', event)"
                        title="${isSoloFocused ? 'Alle Kurven einblenden' : 'Nur diese Kurve fokussieren (Solo)'}"
                        class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                            isSoloFocused
                                ? 'bg-teal-600 text-white dark:bg-teal-400 dark:text-slate-950 font-semibold'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10'
                        }">
                        <span class="material-symbols-rounded text-[14px]">center_focus_strong</span>
                    </button>
                </div>
                <div class="mt-1.5 flex items-baseline justify-between gap-1 tabular-nums">
                    <p class="text-[16px] sm:text-[17px] font-bold ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'} leading-tight">${d.liveDisplay}</p>
                    <span class="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${isActive ? 'bg-teal-500/15 text-teal-800 dark:text-teal-300' : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}">${isActive ? 'AN' : 'AUS'}</span>
                </div>
                <div class="mt-1 space-y-0.5 tabular-nums">
                    <p class="text-[12.5px] font-medium ${isActive ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'} leading-snug flex items-center gap-0.5 truncate">
                        <span class="truncate">${d.subLine1 || d.subDisplay}</span>${renderInlineDiagSymbol(d.diagTone, d.diagText)}
                    </p>
                    <p class="text-[12px] ${isActive ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'} leading-snug truncate">${d.subLine2 || ''}</p>
                </div>
            </div>`;
        }).join('');
    }

    // 5. Render Dual-Axis Chart.js Line Chart first so intradayVisibleStartIdx is up to date
    renderIntradayCanvasInstance('intradayTelemetryChart', defs, false);

    // 6. Update Crosshair Readout Ribbon (only if user is not actively scrubbing)
    if (!isIntradayHovering) {
        const lastLocalIdx = Math.max(0, ((intradaySeriesState.labels.length || 1) - 1) - (currentCurveTimeframe === 'day' ? intradayVisibleStartIdx : 0));
        updateIntradayHoverReadout(lastLocalIdx, defs);
    }

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

// Custom Chart.js Crosshair Line & "Jetzt" Live Marker Plugin
const intradayCrosshairPlugin = {
    id: 'intradayCrosshairLine',
    afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const isDark = document.documentElement.classList.contains('dark');
        const { top, bottom, left, right } = chart.chartArea || {};
        if (top === undefined || bottom === undefined) return;

        // Draw subtle vertical "Jetzt" marker line at the live point when in 'day' view with +1h future buffer
        if (currentCurveTimeframe === 'day' && intradayRealBucketsCount > 0) {
            const liveLocalIdx = (intradayRealBucketsCount - 1) - intradayVisibleStartIdx;
            const meta0 = chart.getDatasetMeta(0);
            const livePt = meta0?.data?.[liveLocalIdx];
            if (livePt && livePt.x >= left && livePt.x <= right) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(livePt.x, top);
                ctx.lineTo(livePt.x, bottom);
                ctx.lineWidth = 1;
                ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(100, 116, 139, 0.22)';
                ctx.setLineDash([2, 3]);
                ctx.stroke();
                ctx.restore();
            }
        }

        const idx = activeCrosshairIndex;
        if (idx === null || idx === undefined || idx < 0) return;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data[idx]) return;

        const pt = meta.data[idx];
        const x = pt.x;
        if (x < left || x > right) return;

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
            if (!el || isNaN(el.y) || ds.data?.[idx] === null || ds.data?.[idx] === undefined) return;
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

    // Build visible window & +1h future padding for 'day' view
    const rawLabels = intradaySeriesState.labels || [];
    const nReal = rawLabels.length;
    intradayRealBucketsCount = nReal;

    let futureLabels = [];
    let visStartIdx = 0;

    if (currentCurveTimeframe === 'day' && nReal > 0) {
        const lastBucketMs = intradaySeriesState.bucketTimes?.[nReal - 1] || Date.now();
        const endOfDay = new Date(lastBucketMs);
        endOfDay.setHours(23, 59, 59, 999);
        const endOfDayMs = endOfDay.getTime();

        // Add +1 hour (12 x 5-min buckets) into the future so live position is clearly visible with breathing room on the right
        for (let k = 1; k <= 12; k++) {
            const futMs = lastBucketMs + k * 300000;
            if (futMs > endOfDayMs + 60000) break;
            const futDate = new Date(futMs);
            futureLabels.push(futDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
        }

        const autoStart = computeIntradayDayAutoStartIndex(defs);
        const baseStart = intradayDayZoomMode === 'full' ? 0 : autoStart;
        visStartIdx = Math.max(0, Math.min(Math.max(0, nReal - 8), baseStart + (intradayDayPanOffsetBuckets || 0)));
        intradayVisibleStartIdx = visStartIdx;

        // Update Zoom/Window button badge in header
        const zoomBtn = document.getElementById('btnIntradayDayZoomMode');
        if (zoomBtn) {
            const startLbl = rawLabels[visStartIdx] || '00:00';
            if (intradayDayZoomMode === 'full' && intradayDayPanOffsetBuckets === 0) {
                zoomBtn.innerText = '0–24h +1h';
            } else if (intradayDayPanOffsetBuckets !== 0) {
                zoomBtn.innerText = `Ab ${startLbl} +1h`;
            } else {
                zoomBtn.innerText = visStartIdx > 0 ? `Aktiv (${startLbl}) +1h` : 'Aktiv +1h';
            }
        }
    } else {
        intradayVisibleStartIdx = 0;
    }

    const paddedLabels = [...rawLabels, ...futureLabels];
    const visibleLabels = paddedLabels.slice(visStartIdx);
    const liveLocalIdx = Math.max(0, (nReal - 1) - visStartIdx);

    const datasets = activeDefs.map((d) => {
        const rawArr = intradaySeriesState.series[d.key] || [];
        const paddedArr = currentCurveTimeframe === 'day'
            ? [...rawArr, ...futureLabels.map(() => null)]
            : rawArr;
        const dataArr = paddedArr.slice(visStartIdx);

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
            // Highlight the live "Jetzt" endpoint in 'day' view with a crisp dot
            pointRadius: currentCurveTimeframe === 'day'
                ? (ctxPt) => (ctxPt.dataIndex === liveLocalIdx ? 3.2 : 0)
                : 0,
            pointBackgroundColor: d.color,
            pointBorderColor: isDark ? '#081116' : '#ffffff',
            pointBorderWidth: 1.5,
            pointHoverRadius: 0,
            spanGaps: false,
            tension: 0.28,
            fill: d.axis === 'yPower' && (powerCurvesCount <= 3 || d.key === 'pv_total')
        };
    });

    let maxPowerW = 300;
    let minPowerW = 0;
    activeDefs.filter(d => d.axis === 'yPower').forEach(d => {
        const arr = (intradaySeriesState.series[d.key] || []).slice(visStartIdx);
        arr.forEach(v => {
            if (v !== null && v !== undefined) {
                if (v > maxPowerW) maxPowerW = v;
                if (v < minPowerW) minPowerW = v;
            }
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
        existingChart.data.labels = visibleLabels;
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
        const totalVisPts = (chart.data.labels || []).length;
        if (totalVisPts <= 0 || right <= left) return;
        const ratio = Math.max(0, Math.min(1, (relX - left) / (right - left)));
        const rawLocalIdx = Math.round(ratio * (totalVisPts - 1));
        const maxRealLocalIdx = currentCurveTimeframe === 'day'
            ? Math.max(0, (intradayRealBucketsCount - 1) - intradayVisibleStartIdx)
            : (totalVisPts - 1);
        const clampedLocalIdx = Math.max(0, Math.min(rawLocalIdx, maxRealLocalIdx));
        isIntradayHovering = true;
        activeCrosshairIndex = clampedLocalIdx;
        updateIntradayHoverReadout(clampedLocalIdx, getAvailableCurveDefinitions());
        chart.draw();
    };

    const chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: visibleLabels,
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
                    const maxRealLocalIdx = currentCurveTimeframe === 'day'
                        ? Math.max(0, (intradayRealBucketsCount - 1) - intradayVisibleStartIdx)
                        : ((chart.data.labels || []).length - 1);
                    const idx = Math.min(elements[0].index, maxRealLocalIdx);
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

function updateIntradayHoverReadout(localIndex, defs) {
    if (!defs) defs = getAvailableCurveDefinitions();
    const isDark = document.documentElement.classList.contains('dark');

    const globalIdx = Number(localIndex || 0) + (currentCurveTimeframe === 'day' ? (intradayVisibleStartIdx || 0) : 0);
    const idx = Math.max(0, Math.min(globalIdx, (intradaySeriesState.labels.length || 1) - 1));
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
    ['balken-explorer', 'soll-ist', 'autarkie-bat', 'amortisation', 'logbuch'].forEach(id => {
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

    const trackDate = getEffectiveTrackingStartDate(haConfigState);
    const trackMs = trackDate.getTime();

    const monthlyComparison = months.map((mObj, idx) => {
        const sollKwh = baseline.monthlySollTotal[idx] || 0;
        const isCurrentRunningMonth = (selectedAnalysisYear === curYear && idx === curMonthIdx);
        const daysInMonth = new Date(selectedAnalysisYear, idx + 1, 0).getDate() || 30;
        const daysElapsed = isCurrentRunningMonth ? Math.max(1, Math.min(daysInMonth, curDayOfMonth)) : daysInMonth;
        const proRataRatio = isCurrentRunningMonth ? (daysElapsed / daysInMonth) : 1;
        const proRataSollKwh = sollKwh * proRataRatio;

        const monthEndMs = new Date(selectedAnalysisYear, idx + 1, 0, 23, 59, 59).getTime();
        const isBeforeTrackingStart = monthEndMs < trackMs && mObj.source !== 'manual';

        let hasReal = !isBeforeTrackingStart && mObj.pvYieldKwh !== null && mObj.pvYieldKwh !== undefined && mObj.pvYieldKwh !== '';
        let isLiveCurrentMonth = false;

        let realPv = hasReal ? Math.max(0, parseFloat(mObj.pvYieldKwh) || 0) : null;
        let expKwh = hasReal ? Math.max(0, parseFloat(mObj.gridExportKwh) || 0) : 0;
        let impKwh = hasReal ? Math.max(0, parseFloat(mObj.gridImportKwh) || 0) : 0;
        let bChg = hasReal ? Math.max(0, parseFloat(mObj.batteryChargedKwh) || 0) : 0;
        let bDis = hasReal ? Math.max(0, parseFloat(mObj.batteryDischargedKwh) || 0) : 0;

        // Auto-feed or heal the running calendar month from the Unified Energy Ledger (Single Source of Truth)
        let ledgerDirectOverride = null;
        let ledgerHouseOverride = null;
        if (isCurrentRunningMonth && !isBeforeTrackingStart && ledger.month.hasLiveData) {
            if (!hasReal || mObj.source === 'ha') {
                hasReal = true;
                isLiveCurrentMonth = true;
                realPv = ledger.month.pvTotal;
                expKwh = ledger.month.gridExp;
                impKwh = ledger.month.gridImp;
                bChg = ledger.month.batChg;
                bDis = ledger.month.batDis;
                ledgerDirectOverride = ledger.month.pvDirect;
                ledgerHouseOverride = ledger.month.houseTotal;
            } else {
                // Manual override in Logbuch is respected (with today's live telemetry as physical floor)
                realPv = Math.max(realPv || 0, ledger.today.pvTotal);
                expKwh = Math.max(expKwh || 0, ledger.today.gridExp);
                impKwh = Math.max(impKwh || 0, ledger.today.gridImp);
                bChg = Math.max(bChg || 0, ledger.today.batChg);
                bDis = Math.max(bDis || 0, ledger.today.batDis);
            }
        }

        // For the running calendar month, compare against pro-rata target up to today unless manually closed
        const effectiveSollKwh = isCurrentRunningMonth ? Math.max(0.1, proRataSollKwh) : sollKwh;

        const directKwh = hasReal
            ? (ledgerDirectOverride !== null ? ledgerDirectOverride : Math.max(0, (realPv || 0) - expKwh - bChg))
            : 0;
        const totalSelfUsedKwh = hasReal ? Math.max(directKwh + bChg, (realPv || 0) - expKwh) : 0;
        const houseConsKwh = hasReal
            ? (ledgerHouseOverride !== null ? ledgerHouseOverride : (directKwh + bDis + impKwh))
            : 0;

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
    const l2Visible = !document.getElementById('analyse-level-2')?.classList.contains('hidden');
    const barPanelVisible = !document.getElementById('analysis-panel-balken-explorer')?.classList.contains('hidden');
    if (l2Visible && (activeAnalysisSubTab === 'balken-explorer' || barPanelVisible)) {
        renderAnalyseBarExplorer(baseline, metrics);
    }
}

// ============================================================================
// 6A. INTERACTIVE BAR CHART EXPLORER ON ANALYSE LEVEL 2 (TAG | WOCHE | MONAT | JAHR)
//     V10.8: 1 BAR PER BUCKET + MEANINGFUL SMART-STACKS FOR HAUSVERBRAUCH, PV & STRINGS
// ============================================================================
let analyseBarExplorerState = {
    horizon: 'day', // 'day' | 'week' | 'month' | 'year'
    periodOffset: 0,
    stacked: true, // When true, 'houseTotal' and 'pvTotal' show their meaningful 3-part stacked breakdown; when false, 1 solid bar
    isExpanded: false,
    activeCategory: 'bilanz', // 'bilanz' (houseTotal stack) | 'solar' (pvTotal stack) | 'haus_bat' (pvStrings stack) | 'netz' | 'finanz'
    selectedChannel: 'houseTotal', // Always renders 1 bar per bucket (either single channel or smart stack)
    activeChannels: ['houseTotal'],
    soloChannel: 'houseTotal',
    cacheByPeriodKey: {},
    isFetching: false,
    chartInstance: null
};

function openAnalyseBarExplorer(initialHorizon = null, presetChannels = null) {
    if (initialHorizon && ['day', 'week', 'month', 'year'].includes(initialHorizon)) {
        analyseBarExplorerState.horizon = initialHorizon;
        analyseBarExplorerState.periodOffset = 0;
    }
    if (Array.isArray(presetChannels) && presetChannels.length > 0) {
        const firstCh = presetChannels[0];
        analyseBarExplorerState.selectedChannel = firstCh;
        analyseBarExplorerState.activeChannels = [firstCh];
        analyseBarExplorerState.soloChannel = firstCh;
        if (firstCh === 'pvTotal') analyseBarExplorerState.activeCategory = 'solar';
        else if (firstCh === 'houseTotal') analyseBarExplorerState.activeCategory = 'bilanz';
        else if (firstCh === 'gridImp' || firstCh === 'gridExp') analyseBarExplorerState.activeCategory = 'netz';
        else if (firstCh === 'autarkyPct' || firstCh === 'savingsEur') analyseBarExplorerState.activeCategory = 'finanz';
    }
    if (typeof openAnalyseDrillDown === 'function') {
        openAnalyseDrillDown('balken-explorer');
    } else {
        switchAnalysisSubTab('balken-explorer');
    }
}

function setAnalyseBarExplorerHorizon(horizon) {
    if (!['day', 'week', 'month', 'year'].includes(horizon)) return;
    analyseBarExplorerState.horizon = horizon;
    analyseBarExplorerState.periodOffset = 0;
    renderAnalyseBarExplorer();
}

function shiftAnalyseBarExplorerPeriod(delta) {
    if (delta === 0) {
        analyseBarExplorerState.periodOffset = 0;
    } else {
        analyseBarExplorerState.periodOffset = Math.min(0, analyseBarExplorerState.periodOffset + delta);
    }
    if (analyseBarExplorerState.horizon === 'year') {
        const targetYear = new Date().getFullYear() + analyseBarExplorerState.periodOffset;
        selectedAnalysisYear = targetYear;
        ensureProjectYearInitialized(selectedAnalysisYear);
    }
    renderAnalyseBarExplorer();
}

function toggleAnalyseBarExplorerStacked() {
    analyseBarExplorerState.stacked = !analyseBarExplorerState.stacked;
    const lbl = document.getElementById('btnBarExpStackedLabel');
    if (lbl) lbl.innerText = analyseBarExplorerState.stacked ? 'Aufteilung' : 'Einzeln';
    renderAnalyseBarExplorer();
}

function toggleAnalyseBarInlineExpand(ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
    analyseBarExplorerState.isExpanded = !analyseBarExplorerState.isExpanded;
    applyAnalyseBarInlineExpandUi();
    const win = getAnalyseBarExplorerPeriodWindow();
    const cached = analyseBarExplorerState.cacheByPeriodKey[win.key];
    if (cached) {
        drawAnalyseBarExplorerView(cached, getPlannedSystemBaseline(), null);
    } else {
        renderAnalyseBarExplorer();
    }
}

function onAnalyseBarStageClick(ev) {
    if (ev && ev.target && ev.target.closest('button')) return;
    // Do not toggle expand on single bar tap so user can tap bars comfortably to inspect values
}

function applyAnalyseBarInlineExpandUi() {
    const exp = !!analyseBarExplorerState.isExpanded;
    const container = document.getElementById('barExplorerCanvasContainer');
    if (container) {
        container.className = exp
            ? "relative h-72 sm:h-96 w-full transition-all duration-200"
            : "relative h-56 sm:h-68 md:h-76 w-full transition-all duration-200";
    }
}

function selectAnalyseBarCategory(cat) {
    analyseBarExplorerState.activeCategory = cat;
    if (cat === 'bilanz') {
        analyseBarExplorerState.selectedChannel = 'houseTotal';
        analyseBarExplorerState.stacked = true;
    } else if (cat === 'solar') {
        analyseBarExplorerState.selectedChannel = 'pvTotal';
        analyseBarExplorerState.stacked = true;
    } else if (cat === 'haus_bat') {
        analyseBarExplorerState.selectedChannel = 'pvStrings';
        analyseBarExplorerState.stacked = true;
    } else if (cat === 'netz') {
        analyseBarExplorerState.selectedChannel = 'gridImp';
    } else if (cat === 'finanz') {
        analyseBarExplorerState.selectedChannel = 'autarkyPct';
    }
    analyseBarExplorerState.activeChannels = [analyseBarExplorerState.selectedChannel];
    analyseBarExplorerState.soloChannel = analyseBarExplorerState.selectedChannel;
    renderAnalyseBarExplorer();
}

function toggleAnalyseBarChannel(channelId) {
    // 1 Tile = 1 clean bar (or smart stack for houseTotal / pvTotal / pvStrings) — never side-by-side multi-bar clutter!
    analyseBarExplorerState.selectedChannel = channelId;
    analyseBarExplorerState.activeChannels = [channelId];
    analyseBarExplorerState.soloChannel = channelId;
    if (channelId === 'houseTotal') analyseBarExplorerState.activeCategory = 'bilanz';
    else if (channelId === 'pvTotal') analyseBarExplorerState.activeCategory = 'solar';
    else if (channelId === 'pvStrings') analyseBarExplorerState.activeCategory = 'haus_bat';
    else if (channelId === 'gridImp' || channelId === 'gridExp') analyseBarExplorerState.activeCategory = 'netz';
    else if (channelId === 'autarkyPct' || channelId === 'eigenPct' || channelId === 'savingsEur') analyseBarExplorerState.activeCategory = 'finanz';
    else analyseBarExplorerState.activeCategory = '';
    renderAnalyseBarExplorer();
}

function focusSingleAnalyseBarChannel(channelId, ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
    toggleAnalyseBarChannel(channelId);
}

function selectAnalyseBarPreset(preset) {
    if (typeof preset === 'string' && ['bilanz', 'solar', 'haus_bat', 'netz', 'finanz'].includes(preset)) {
        selectAnalyseBarCategory(preset);
        return;
    }
    if (Array.isArray(preset) && preset.length > 0) {
        toggleAnalyseBarChannel(preset[0]);
    } else if (preset === 'strings') {
        selectAnalyseBarCategory('haus_bat');
    }
}

function reloadAnalyseBarExplorerData() {
    analyseBarExplorerState.cacheByPeriodKey = {};
    renderAnalyseBarExplorer(null, null, true);
}

function getAnalyseBarExplorerChannelCatalog() {
    const channels = [
        { id: 'houseTotal', label: 'Hausverbrauch (Aufteilung)', shortLabel: 'Hausverbrauch', unit: 'kWh', color: '#f59e0b', group: 'core', category: 'bilanz', icon: 'home', hasSmartStack: true },
        { id: 'pvTotal', label: 'PV-Erzeugung · AC (Aufteilung)', shortLabel: 'PV-Erzeugung (AC)', unit: 'kWh', color: '#14b8a6', group: 'core', category: 'solar', icon: 'wb_sunny', hasSmartStack: true },
        { id: 'gridImp', label: 'Netzbezug (Import)', shortLabel: 'Netzbezug', unit: 'kWh', color: '#3b82f6', group: 'core', category: 'netz', icon: 'download' },
        { id: 'gridExp', label: 'Netzeinspeisung (Export)', shortLabel: 'Einspeisung', unit: 'kWh', color: '#06b6d4', group: 'core', category: 'netz', icon: 'upload' },
        { id: 'batChg', label: 'Batterie Ladung', shortLabel: 'Akku Ladung', unit: 'kWh', color: '#a855f7', group: 'core', category: 'haus_bat', icon: 'battery_charging_full' },
        { id: 'batDis', label: 'Batterie Entladung', shortLabel: 'Akku Entladung', unit: 'kWh', color: '#c084fc', group: 'core', category: 'haus_bat', icon: 'battery_5_bar' },
        { id: 'pvgisSoll', label: 'PVGIS-Prognose (Soll)', shortLabel: 'PVGIS-Soll', unit: 'kWh', color: '#38bdf8', group: 'core', category: 'solar', icon: 'cloud_queue' },
        { id: 'autarkyPct', label: 'Autarkiegrad (%)', shortLabel: 'Autarkie %', unit: '%', color: '#10b981', group: 'ratio', category: 'finanz', icon: 'shield', yAxisID: 'yPct' },
        { id: 'eigenPct', label: 'Eigenverbrauchsquote (%)', shortLabel: 'Eigenquote %', unit: '%', color: '#0ea5e9', group: 'ratio', category: 'finanz', icon: 'donut_large', yAxisID: 'yPct' },
        { id: 'savingsEur', label: 'Finanz-Ersparnis (€)', shortLabel: 'Ersparnis €', unit: '€', color: '#22c55e', group: 'finance', category: 'finanz', icon: 'savings' }
    ];

    const stringPalette = ['#14b8a6', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#84cc16'];
    const validStrings = [];
    (haConfigState.customStrings || []).forEach((cs, idx) => {
        if (!cs || (!cs.energyEntity && !cs.powerEntity)) return;
        const name = cs.name || `PV-String ${idx + 1}`;
        validStrings.push({
            id: `str_${idx}`,
            label: name,
            shortLabel: name,
            unit: 'kWh',
            color: cs.color || stringPalette[idx % stringPalette.length],
            group: 'string',
            category: 'solar',
            icon: 'solar_power',
            energyEntity: cs.energyEntity || '',
            powerEntity: cs.powerEntity || ''
        });
    });

    if (validStrings.length > 1) {
        channels.splice(2, 0, {
            id: 'pvStrings',
            label: 'Alle Strings · DC (Gestapelt)',
            shortLabel: 'Alle Strings (DC)',
            unit: 'kWh',
            color: '#0d9488',
            group: 'core',
            category: 'haus_bat',
            icon: 'solar_power',
            hasSmartStack: true
        });
    }

    channels.push(...validStrings);
    return channels;
}

function getAnalyseBarExplorerPeriodWindow() {
    const now = new Date();
    const h = analyseBarExplorerState.horizon;
    const off = analyseBarExplorerState.periodOffset || 0;

    if (h === 'day') {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off, 0, 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        const label = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
        const key = `day_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { start: d, end, label, key, wsPeriod: 'hour', bucketCount: 24, isToday: off === 0 };
    }
    if (h === 'week') {
        const endDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (off * 7), 23, 59, 59, 999);
        const startDay = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - 6, 0, 0, 0, 0);
        const fmt = (dt) => dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        const label = `${fmt(startDay)} – ${fmt(endDay)}.${endDay.getFullYear()}`;
        const key = `week_${startDay.toISOString().slice(0, 10)}_${endDay.toISOString().slice(0, 10)}`;
        return { start: startDay, end: endDay, label, key, wsPeriod: 'day', bucketCount: 7, isCurrent: off === 0 };
    }
    if (h === 'month') {
        const mDate = new Date(now.getFullYear(), now.getMonth() + off, 1, 0, 0, 0, 0);
        const daysInMonth = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0).getDate();
        const end = new Date(mDate.getFullYear(), mDate.getMonth(), daysInMonth, 23, 59, 59, 999);
        const label = `${MONTH_LABELS_LONG[mDate.getMonth()]} ${mDate.getFullYear()}`;
        const key = `month_${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}`;
        return { start: mDate, end, label, key, wsPeriod: 'day', bucketCount: daysInMonth, monthIndex: mDate.getMonth(), year: mDate.getFullYear(), isCurrent: off === 0 };
    }
    // 'year'
    const yr = selectedAnalysisYear || (now.getFullYear() + off);
    const start = new Date(yr, 0, 1, 0, 0, 0, 0);
    const end = new Date(yr, 11, 31, 23, 59, 59, 999);
    const label = `Gesamtjahr ${yr}`;
    const key = `year_${yr}`;
    return { start, end, label, key, wsPeriod: 'month', bucketCount: 12, year: yr, isCurrent: yr === now.getFullYear() };
}

function isPowerSensorEntityId(entityId) {
    if (!entityId) return false;
    const cleanId = String(entityId).trim();
    const u = String(lastKnownHaUnitMap.get(cleanId) || '').trim().toLowerCase();
    if (u === 'w' || u === 'kw' || u === 'mw') return true;
    if (u.includes('wh')) return false;
    const found = discoveredHaSensors.find(s => s.entity_id === cleanId);
    if (found && found.unit) {
        const fu = String(found.unit).toLowerCase();
        if (fu === 'w' || fu === 'kw') return true;
        if (fu.includes('wh')) return false;
    }
    return /(_power|_leistung|_watt|_w$)/i.test(cleanId) && !/(energy|yield|kwh|total)/i.test(cleanId);
}

function extractStatBucketDeltaKwh(statRow, entityId, hoursInBucket = 1, prevStateKwh = null) {
    if (!statRow || typeof statRow !== 'object') return { deltaKwh: 0, currentStateKwh: prevStateKwh };
    const isPower = isPowerSensorEntityId(entityId);
    if (isPower) {
        const pScale = getPowerScaleForEntity(entityId, null);
        const rawMean = typeof statRow.mean === 'number' ? statRow.mean : (typeof statRow.state === 'number' ? statRow.state : null);
        if (rawMean !== null && Number.isFinite(rawMean)) {
            const w = rawMean * pScale;
            return { deltaKwh: Math.max(0, (w * hoursInBucket) / 1000), currentStateKwh: prevStateKwh };
        }
        return { deltaKwh: 0, currentStateKwh: prevStateKwh };
    }

    const eScale = getEnergyScaleForEntity(entityId, null);
    const isConsumer = isConsumerEnergyEntity(entityId, haConfigState);
    const maxStepKwh = isConsumer ? Math.max(4.0, hoursInBucket * 2.5) : Math.max(22.0, hoursInBucket * 12.0);
    const initJumpMinKwh = isConsumer ? 4.0 : 25.0;
    const rawNum = typeof statRow.state === 'number'
        ? statRow.state
        : (typeof statRow.sum === 'number'
            ? statRow.sum
            : (typeof statRow.max === 'number' ? statRow.max : null));
    const curStateKwh = (rawNum !== null && Number.isFinite(rawNum)) ? (rawNum * eScale) : null;

    if (typeof statRow.change === 'number' && Number.isFinite(statRow.change)) {
        const dKwh = Math.max(0, statRow.change * eScale);
        const isInitJump = ((prevStateKwh === null || prevStateKwh <= 2.0) && dKwh >= initJumpMinKwh)
            || dKwh >= maxStepKwh;
        if (isInitJump) {
            return { deltaKwh: 0, currentStateKwh: curStateKwh !== null ? curStateKwh : prevStateKwh };
        }
        return { deltaKwh: dKwh, currentStateKwh: curStateKwh !== null ? curStateKwh : prevStateKwh };
    }

    if (curStateKwh !== null && prevStateKwh !== null && prevStateKwh > 0.5) {
        const stepDiff = curStateKwh >= prevStateKwh
            ? (curStateKwh - prevStateKwh)
            : ((curStateKwh < 0.5 && prevStateKwh > 2.0) ? curStateKwh : 0);
        const isStepJump = ((prevStateKwh <= 2.0) && stepDiff >= initJumpMinKwh) || stepDiff >= maxStepKwh;
        return { deltaKwh: (!isStepJump && stepDiff >= 0) ? stepDiff : 0, currentStateKwh: curStateKwh };
    }

    return { deltaKwh: 0, currentStateKwh: curStateKwh !== null ? curStateKwh : prevStateKwh };
}

async function fetchAnalyseBarExplorerPeriodData(win, baseline, metrics) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    if (!metrics) metrics = computeAggregatedPerformanceMetrics(baseline);

    const catalog = getAnalyseBarExplorerChannelCatalog();
    const labels = [];
    const seriesById = {};
    catalog.forEach(ch => {
        seriesById[ch.id] = new Array(win.bucketCount).fill(0);
    });

    const now = new Date();
    const ent = haConfigState.entities || {};
    const pvEnergyIds = getConfiguredPvEnergyEntities(haConfigState);

    // Build list of all HA entities (Core + PV Strings only)
    const allStatEntities = new Set();
    pvEnergyIds.forEach(id => { if (id) allStatEntities.add(id); });
    if (ent.pvPower) allStatEntities.add(ent.pvPower);
    if (ent.loadEnergyMonth) allStatEntities.add(ent.loadEnergyMonth);
    if (ent.loadPower) allStatEntities.add(ent.loadPower);
    if (ent.gridImportMonth) allStatEntities.add(ent.gridImportMonth);
    if (ent.gridImportPower) allStatEntities.add(ent.gridImportPower);
    if (ent.gridPower) allStatEntities.add(ent.gridPower);
    if (ent.gridExportMonth) allStatEntities.add(ent.gridExportMonth);
    if (ent.gridExportPower) allStatEntities.add(ent.gridExportPower);
    if (ent.batteryChargeMonth) allStatEntities.add(ent.batteryChargeMonth);
    if (ent.batteryChargePower) allStatEntities.add(ent.batteryChargePower);
    if (ent.batteryDischargeMonth) allStatEntities.add(ent.batteryDischargeMonth);
    if (ent.batteryDischargePower) allStatEntities.add(ent.batteryDischargePower);

    (haConfigState.customStrings || []).forEach(cs => {
        if (cs?.energyEntity) allStatEntities.add(cs.energyEntity);
        if (cs?.powerEntity) allStatEntities.add(cs.powerEntity);
    });

    // 1. Query Home Assistant Long-Term Statistics WS with the exact parameter signature:
    // (rawBaseUrl, rawToken, statisticIds, startTimeIso, endTimeIso, period, customTypes)
    let wsStats = null;
    if (haConfigState.baseUrl && haConfigState.accessToken && allStatEntities.size > 0) {
        try {
            const wsRes = await fetchHaLongTermStatisticsWs(
                haConfigState.baseUrl,
                haConfigState.accessToken,
                [...allStatEntities],
                win.start.toISOString(),
                win.end.toISOString(),
                win.wsPeriod,
                ['change', 'state', 'sum', 'max', 'mean']
            );
            if (wsRes && wsRes.ok && wsRes.data) {
                wsStats = wsRes.data;
            }
        } catch (e) {}
    }

    // 2. For 'day' (24h) or recent days, also query Short-Term REST History (/api/history/period)
    // so the currently running day and current hour immediately show values without waiting for the day to end!
    const restHourlyByEntity = new Map();
    if (analyseBarExplorerState.horizon === 'day' && haConfigState.baseUrl && haConfigState.accessToken && allStatEntities.size > 0) {
        try {
            const startIso = win.start.toISOString();
            const endIso = (win.isToday ? now : win.end).toISOString();
            const endpoint = `/api/history/period/${encodeURIComponent(startIso)}?filter_entity_id=${encodeURIComponent([...allStatEntities].join(','))}&end_time=${encodeURIComponent(endIso)}&significant_changes_only=0&minimal_response&no_attributes`;
            const histRes = await fetchHaDirectFromBrowser(haConfigState.baseUrl, haConfigState.accessToken, endpoint);
            if (histRes && histRes.ok && Array.isArray(histRes.data)) {
                histRes.data.forEach(entityHistoryArr => {
                    if (!Array.isArray(entityHistoryArr) || entityHistoryArr.length === 0) return;
                    const entId = entityHistoryArr[0]?.entity_id;
                    if (!entId) return;
                    const hourlyArr = new Array(24).fill(0);
                    let hasData = false;

                    if (isPowerSensorEntityId(entId)) {
                        const pScale = getPowerScaleForEntity(entId, null);
                        const pts = [];
                        entityHistoryArr.forEach(pt => {
                            const val = parseFloat(String(pt.state).replace(',', '.'));
                            const ts = new Date(pt.last_changed || pt.last_updated || startIso).getTime();
                            if (!isNaN(val) && !isNaN(ts)) pts.push({ ts, w: Math.max(0, val * pScale) });
                        });
                        pts.sort((a, b) => a.ts - b.ts);
                        for (let i = 0; i < pts.length; i++) {
                            const cur = pts[i];
                            const nextTs = (i + 1 < pts.length) ? pts[i + 1].ts : Math.min(win.end.getTime(), now.getTime());
                            const dtHours = Math.max(0, Math.min(1.0, (nextTs - cur.ts) / 3600000));
                            const hIdx = new Date(cur.ts).getHours();
                            if (hIdx >= 0 && hIdx < 24 && dtHours > 0) {
                                hourlyArr[hIdx] += (cur.w * dtHours) / 1000;
                                if (cur.w > 0) hasData = true;
                            }
                        }
                    } else {
                        const eScale = getEnergyScaleForEntity(entId, null);
                        const pts = [];
                        entityHistoryArr.forEach(pt => {
                            const val = parseFloat(String(pt.state).replace(',', '.'));
                            const ts = new Date(pt.last_changed || pt.last_updated || startIso).getTime();
                            if (!isNaN(val) && val >= 0 && !isNaN(ts)) pts.push({ ts, kwh: val * eScale });
                        });
                        pts.sort((a, b) => a.ts - b.ts);
                        for (let i = 1; i < pts.length; i++) {
                            const prev = pts[i - 1];
                            const cur = pts[i];
                            const diff = cur.kwh >= prev.kwh
                                ? (cur.kwh - prev.kwh)
                                : ((cur.kwh < 0.5 && prev.kwh > 2.0) ? cur.kwh : 0);
                            if (diff > 0 && diff < 250) {
                                const hIdx = new Date(cur.ts).getHours();
                                if (hIdx >= 0 && hIdx < 24) {
                                    hourlyArr[hIdx] += diff;
                                    hasData = true;
                                }
                            }
                        }
                        // Also include live reading delta since last history point if viewing today
                        if (win.isToday && pts.length > 0 && lastKnownHaReadingMap.has(entId)) {
                            const liveKwh = Number(lastKnownHaReadingMap.get(entId)) * eScale;
                            const lastPt = pts[pts.length - 1];
                            if (Number.isFinite(liveKwh) && liveKwh > lastPt.kwh && (liveKwh - lastPt.kwh) < 100) {
                                const curHour = now.getHours();
                                hourlyArr[curHour] += (liveKwh - lastPt.kwh);
                                hasData = true;
                            }
                        }
                    }

                    if (hasData) {
                        restHourlyByEntity.set(entId, hourlyArr);
                    }
                });
            }
        } catch (e) {}
    }

    // Helper to map a timestamp into bucket index [0 .. bucketCount-1]
    const getBucketIdx = (rawTs) => {
        const tsMs = parseHaStatTimestampMs(rawTs);
        if (!Number.isFinite(tsMs)) return -1;
        const dt = new Date(tsMs);
        if (win.start && tsMs < win.start.getTime() - 1800000) return -1;
        if (win.end && tsMs > win.end.getTime() + 1800000) return -1;
        if (analyseBarExplorerState.horizon === 'day') {
            return dt.getHours();
        }
        if (analyseBarExplorerState.horizon === 'week') {
            const diffDays = Math.floor((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime() - win.start.getTime()) / 86400000);
            return (diffDays >= 0 && diffDays < 7) ? diffDays : -1;
        }
        if (analyseBarExplorerState.horizon === 'month') {
            if (dt.getMonth() !== win.monthIndex || dt.getFullYear() !== win.year) return -1;
            return dt.getDate() - 1;
        }
        if (analyseBarExplorerState.horizon === 'year') {
            if (dt.getFullYear() !== win.year) return -1;
            return dt.getMonth();
        }
        return -1;
    };

    const hoursPerBucket = analyseBarExplorerState.horizon === 'day' ? 1 : (analyseBarExplorerState.horizon === 'year' ? 730 : 24);

    // Build X-axis labels and PVGIS Soll baseline per bucket
    if (analyseBarExplorerState.horizon === 'day') {
        const mIdx = win.start.getMonth();
        const daysInM = new Date(win.start.getFullYear(), mIdx + 1, 0).getDate() || 30;
        const dailySoll = (baseline.monthlySollTotal[mIdx] || 0) / daysInMonthOr30(daysInM);
        for (let h = 0; h < 24; h++) {
            labels.push(`${String(h).padStart(2, '0')}:00`);
            const sunWeight = (h >= 6 && h <= 19) ? Math.sin(((h - 6) / 13) * Math.PI) : 0;
            seriesById.pvgisSoll[h] = +(dailySoll * (sunWeight / 8.28)).toFixed(2);
        }
    } else if (analyseBarExplorerState.horizon === 'week') {
        for (let d = 0; d < 7; d++) {
            const cur = new Date(win.start.getFullYear(), win.start.getMonth(), win.start.getDate() + d);
            labels.push(cur.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }));
            const mIdx = cur.getMonth();
            const daysInM = new Date(cur.getFullYear(), mIdx + 1, 0).getDate() || 30;
            seriesById.pvgisSoll[d] = +((baseline.monthlySollTotal[mIdx] || 0) / daysInM).toFixed(2);
        }
    } else if (analyseBarExplorerState.horizon === 'month') {
        const dailySoll = (baseline.monthlySollTotal[win.monthIndex] || 0) / Math.max(1, win.bucketCount);
        for (let d = 1; d <= win.bucketCount; d++) {
            labels.push(`${String(d).padStart(2, '0')}.${String(win.monthIndex + 1).padStart(2, '0')}.`);
            seriesById.pvgisSoll[d - 1] = +dailySoll.toFixed(2);
        }
    } else {
        for (let m = 0; m < 12; m++) {
            labels.push(MONTH_LABELS_SHORT[m]);
            seriesById.pvgisSoll[m] = +(baseline.monthlySollTotal[m] || 0).toFixed(1);
        }
    }

    // Helper to extract bucket array for an entity (merging WS stats + REST hourly fallback for 'day')
    const getEntityBucketSeries = (energyId, powerId) => {
        const out = new Array(win.bucketCount).fill(0);
        let filled = false;

        if (wsStats && energyId && Array.isArray(wsStats[energyId]) && wsStats[energyId].length > 0) {
            let prevState = null;
            wsStats[energyId].forEach(row => {
                const bIdx = getBucketIdx(row.start);
                const step = extractStatBucketDeltaKwh(row, energyId, hoursPerBucket, prevState);
                prevState = step.currentStateKwh;
                if (bIdx >= 0 && bIdx < win.bucketCount && step.deltaKwh > 0) {
                    out[bIdx] += step.deltaKwh;
                    filled = true;
                }
            });
        }

        // Merge REST hourly history for 'day' mode (especially for the running hour or sensors without LTS)
        if (analyseBarExplorerState.horizon === 'day' && energyId && restHourlyByEntity.has(energyId)) {
            const restArr = restHourlyByEntity.get(energyId);
            for (let h = 0; h < 24; h++) {
                if (restArr[h] > out[h]) {
                    out[h] = restArr[h];
                    filled = true;
                }
            }
        }

        if (!filled && wsStats && powerId && Array.isArray(wsStats[powerId]) && wsStats[powerId].length > 0) {
            let prevState = null;
            wsStats[powerId].forEach(row => {
                const bIdx = getBucketIdx(row.start);
                const step = extractStatBucketDeltaKwh(row, powerId, hoursPerBucket, prevState);
                prevState = step.currentStateKwh;
                if (bIdx >= 0 && bIdx < win.bucketCount && step.deltaKwh > 0) {
                    out[bIdx] += step.deltaKwh;
                    filled = true;
                }
            });
        }

        if (analyseBarExplorerState.horizon === 'day' && powerId && restHourlyByEntity.has(powerId)) {
            const restArr = restHourlyByEntity.get(powerId);
            for (let h = 0; h < 24; h++) {
                if (!filled || restArr[h] > out[h]) {
                    out[h] = Math.max(out[h], restArr[h]);
                    if (out[h] > 0) filled = true;
                }
            }
        }

        return { series: out, filled };
    };

    // 3. Populate PV Strings
    (haConfigState.customStrings || []).forEach((cs, idx) => {
        const chId = `str_${idx}`;
        if (!seriesById[chId]) return;
        const res = getEntityBucketSeries(cs?.energyEntity, cs?.powerEntity);
        seriesById[chId] = res.series.map(v => +v.toFixed(2));
    });

    // 4. Populate Core Channels from WS Stats + REST Day History
    let pvFilled = false;
    pvEnergyIds.forEach(pid => {
        const res = getEntityBucketSeries(pid, null);
        if (res.filled) {
            for (let b = 0; b < win.bucketCount; b++) {
                seriesById.pvTotal[b] += res.series[b];
            }
            pvFilled = true;
        }
    });
    if (!pvFilled) {
        const strRes = getEntityBucketSeries(null, ent.pvPower);
        if (strRes.filled) {
            seriesById.pvTotal = strRes.series;
            pvFilled = true;
        } else {
            (haConfigState.customStrings || []).forEach((cs, idx) => {
                const sArr = seriesById[`str_${idx}`] || [];
                sArr.forEach((v, bIdx) => {
                    if (v > 0) {
                        seriesById.pvTotal[bIdx] += v;
                        pvFilled = true;
                    }
                });
            });
        }
    }

    const gridImpRes = getEntityBucketSeries(ent.gridImportMonth, ent.gridImportPower || ent.gridPower);
    seriesById.gridImp = gridImpRes.series;

    const gridExpRes = getEntityBucketSeries(ent.gridExportMonth, ent.gridExportPower);
    seriesById.gridExp = gridExpRes.series;

    const batChgRes = getEntityBucketSeries(ent.batteryChargeMonth, ent.batteryChargePower);
    seriesById.batChg = batChgRes.series;

    const batDisRes = getEntityBucketSeries(ent.batteryDischargeMonth, ent.batteryDischargePower);
    seriesById.batDis = batDisRes.series;

    const loadRes = getEntityBucketSeries(ent.loadEnergyMonth, ent.loadPower);
    for (let b = 0; b < win.bucketCount; b++) {
        if (loadRes.series[b] > 0) {
            seriesById.houseTotal[b] = loadRes.series[b];
        } else {
            const pvSelf = Math.max(0, seriesById.pvTotal[b] - seriesById.gridExp[b] - seriesById.batChg[b]);
            seriesById.houseTotal[b] = Math.max(0, pvSelf + seriesById.batDis[b] + seriesById.gridImp[b]);
        }
    }

    // 5. Reconcile Today's Live Ledger so 'Tag' (24h), 'Woche', and 'Monat' ALWAYS show immediate live energy even before the day/hour is over!
    const ledger = getUnifiedEnergyLedger(baseline);
    if (analyseBarExplorerState.horizon === 'day' && win.isToday) {
        const curH = now.getHours();
        const reconcileHourly = (arr, targetTodayKwh, distributeSolarCurve = false) => {
            const target = Number(targetTodayKwh || 0);
            if (!(target > 0)) return;
            const currentSum = arr.reduce((a, b) => a + (Number(b) || 0), 0);
            if (currentSum <= 0.01) {
                // If no hourly breakdown arrived yet from HA history, distribute cleanly up to curH (or put in curH)
                if (distributeSolarCurve && curH >= 7) {
                    let wSum = 0;
                    const weights = [];
                    for (let h = 0; h <= curH; h++) {
                        const w = (h >= 6 && h <= 20) ? Math.max(0.15, Math.sin(((h - 6) / 14) * Math.PI)) : 0.05;
                        weights.push(w);
                        wSum += w;
                    }
                    for (let h = 0; h <= curH; h++) {
                        arr[h] = +((target * weights[h]) / Math.max(0.01, wSum)).toFixed(2);
                    }
                } else {
                    arr[curH] = +target.toFixed(2);
                }
            } else if (target > currentSum + 0.02) {
                // Add the live unbucketed delta of the currently running hour directly to curH
                arr[curH] = +(arr[curH] + (target - currentSum)).toFixed(2);
            }
        };

        reconcileHourly(seriesById.pvTotal, ledger.today.pvTotal, true);
        reconcileHourly(seriesById.houseTotal, ledger.today.houseTotal, false);
        reconcileHourly(seriesById.gridImp, ledger.today.gridImp, false);
        reconcileHourly(seriesById.gridExp, ledger.today.gridExp, true);
        reconcileHourly(seriesById.batChg, ledger.today.batChg, true);
        reconcileHourly(seriesById.batDis, ledger.today.batDis, false);

        (haConfigState.customStrings || []).forEach((cs, idx) => {
            const k = `str_${idx}`;
            const teleStr = (currentLiveTelemetry?.customStringsTelemetry || []).find(x => x && x.id === cs?.id);
            const kwh = Number(teleStr?.energyTodayKwh ?? teleStr?.energyKwh ?? 0);
            if (seriesById[k] && kwh > 0) {
                reconcileHourly(seriesById[k], kwh, true);
            }
        });
    }

    // 6. For 'year' horizon, merge with monthlyComparison (Logbuch & Live current month)
    if (analyseBarExplorerState.horizon === 'year' && metrics && Array.isArray(metrics.monthlyComparison)) {
        metrics.monthlyComparison.forEach((mObj, mIdx) => {
            if (!mObj || !mObj.hasReal) return;
            if (mObj.realPv !== null) seriesById.pvTotal[mIdx] = Math.max(seriesById.pvTotal[mIdx], +Number(mObj.realPv || 0).toFixed(1));
            if (mObj.gridImp > 0) seriesById.gridImp[mIdx] = Math.max(seriesById.gridImp[mIdx], +Number(mObj.gridImp || 0).toFixed(1));
            if (mObj.gridExp > 0) seriesById.gridExp[mIdx] = Math.max(seriesById.gridExp[mIdx], +Number(mObj.gridExp || 0).toFixed(1));
            if (mObj.batChg > 0) seriesById.batChg[mIdx] = Math.max(seriesById.batChg[mIdx], +Number(mObj.batChg || 0).toFixed(1));
            if (mObj.batDis > 0) seriesById.batDis[mIdx] = Math.max(seriesById.batDis[mIdx], +Number(mObj.batDis || 0).toFixed(1));
            if (mObj.houseConsKwh > 0) seriesById.houseTotal[mIdx] = Math.max(seriesById.houseTotal[mIdx], +Number(mObj.houseConsKwh || 0).toFixed(1));
        });
    }

    // 7. Ensure today's bucket in 'month' or 'week' reflects at least the live today ledger if viewing the current period
    const todayNoonMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).getTime();
    const todayBIdx = getBucketIdx(todayNoonMs);
    if (todayBIdx >= 0 && todayBIdx < win.bucketCount && (analyseBarExplorerState.horizon === 'week' || analyseBarExplorerState.horizon === 'month')) {
        seriesById.pvTotal[todayBIdx] = Math.max(seriesById.pvTotal[todayBIdx], +(ledger.today.pvTotal || 0).toFixed(2));
        seriesById.houseTotal[todayBIdx] = Math.max(seriesById.houseTotal[todayBIdx], +(ledger.today.houseTotal || 0).toFixed(2));
        seriesById.gridImp[todayBIdx] = Math.max(seriesById.gridImp[todayBIdx], +(ledger.today.gridImp || 0).toFixed(2));
        seriesById.gridExp[todayBIdx] = Math.max(seriesById.gridExp[todayBIdx], +(ledger.today.gridExp || 0).toFixed(2));
        seriesById.batChg[todayBIdx] = Math.max(seriesById.batChg[todayBIdx], +(ledger.today.batChg || 0).toFixed(2));
        seriesById.batDis[todayBIdx] = Math.max(seriesById.batDis[todayBIdx], +(ledger.today.batDis || 0).toFixed(2));

        (haConfigState.customStrings || []).forEach((cs, idx) => {
            const k = `str_${idx}`;
            const teleStr = (currentLiveTelemetry?.customStringsTelemetry || []).find(x => x && x.id === cs?.id);
            const kwh = Number(teleStr?.energyTodayKwh ?? teleStr?.energyKwh ?? 0);
            if (seriesById[k] && kwh > 0) {
                seriesById[k][todayBIdx] = Math.max(seriesById[k][todayBIdx], +kwh.toFixed(2));
            }
        });
    }

    // Compute smart-stack component series per bucket for 'houseTotal' and 'pvTotal' and 'pvStrings'
    seriesById._houseDirectPv = new Array(win.bucketCount).fill(0);
    seriesById._houseFromBat = new Array(win.bucketCount).fill(0);
    seriesById._houseFromGrid = new Array(win.bucketCount).fill(0);

    seriesById._pvDirectUsed = new Array(win.bucketCount).fill(0);
    seriesById._pvToBat = new Array(win.bucketCount).fill(0);
    seriesById._pvToGrid = new Array(win.bucketCount).fill(0);

    if (!seriesById.pvStrings) {
        seriesById.pvStrings = new Array(win.bucketCount).fill(0);
    }

    // 8. Compute derived ratio, financial & smart-stack breakdown channels per bucket
    const gridPrice = baseline.gridPriceEur || 0.32;
    const eegRate = baseline.eegRateEur || 0.08;
    for (let b = 0; b < win.bucketCount; b++) {
        const pv = Math.max(0, seriesById.pvTotal[b] || 0);
        const imp = Math.max(0, seriesById.gridImp[b] || 0);
        const exp = Math.max(0, seriesById.gridExp[b] || 0);
        const bChg = Math.max(0, seriesById.batChg[b] || 0);
        const bDis = Math.max(0, seriesById.batDis[b] || 0);
        const house = Math.max(0, seriesById.houseTotal[b] || Math.max(0, (pv - exp - bChg) + bDis + imp));

        // Smart Stack 1: Hausverbrauch breakdown (Direkt-PV + Aus Speicher + Aus Stromnetz === house)
        const fromGrid = Math.min(house, imp);
        const remAfterGrid = Math.max(0, house - fromGrid);
        const fromBat = Math.min(remAfterGrid, bDis);
        const fromDirectPv = Math.max(0, remAfterGrid - fromBat);
        seriesById._houseDirectPv[b] = +fromDirectPv.toFixed(2);
        seriesById._houseFromBat[b] = +fromBat.toFixed(2);
        seriesById._houseFromGrid[b] = +fromGrid.toFixed(2);

        // Smart Stack 2: PV-Erzeugung breakdown (Direktverbrauch + In Speicher + Einspeisung === pv)
        const toGrid = Math.min(pv, exp);
        const remPvAfterGrid = Math.max(0, pv - toGrid);
        const toBat = Math.min(remPvAfterGrid, bChg);
        const directPv = Math.max(0, remPvAfterGrid - toBat);
        seriesById._pvDirectUsed[b] = +directPv.toFixed(2);
        seriesById._pvToBat[b] = +toBat.toFixed(2);
        seriesById._pvToGrid[b] = +toGrid.toFixed(2);

        // Smart Stack 3: Sum of PV strings
        let strSumB = 0;
        (haConfigState.customStrings || []).forEach((cs, idx) => {
            const sArr = seriesById[`str_${idx}`];
            if (sArr) strSumB += (sArr[b] || 0);
        });
        seriesById.pvStrings[b] = +(strSumB > 0 ? strSumB : pv).toFixed(2);

        const selfCovered = Math.max(0, house - imp);
        seriesById.autarkyPct[b] = house > 0.01 ? +Math.min(100, (selfCovered / house) * 100).toFixed(1) : 0;

        const pvUsedLocally = Math.max(0, pv - exp);
        seriesById.eigenPct[b] = pv > 0.01 ? +Math.min(100, (pvUsedLocally / pv) * 100).toFixed(1) : 0;

        const eur = (selfCovered * gridPrice) + (exp * eegRate);
        seriesById.savingsEur[b] = +eur.toFixed(2);

        // Round core arrays cleanly
        seriesById.pvTotal[b] = +pv.toFixed(2);
        seriesById.houseTotal[b] = +house.toFixed(2);
        seriesById.gridImp[b] = +imp.toFixed(2);
        seriesById.gridExp[b] = +exp.toFixed(2);
        seriesById.batChg[b] = +bChg.toFixed(2);
        seriesById.batDis[b] = +bDis.toFixed(2);
    }

    return { labels, seriesById, win };
}

function daysInMonthOr30(d) {
    return d > 0 ? d : 30;
}

async function renderAnalyseBarExplorer(baseline = null, metrics = null, forceReload = false) {
    const panel = document.getElementById('analysis-panel-balken-explorer');
    if (!panel) return;
    if (!baseline) baseline = getPlannedSystemBaseline();
    if (!metrics) metrics = computeAggregatedPerformanceMetrics(baseline);

    applyAnalyseBarInlineExpandUi();

    // 1. Update Horizon Buttons
    ['day', 'week', 'month', 'year'].forEach(h => {
        const btn = document.getElementById(`btnBarExpHorizon_${h}`);
        if (!btn) return;
        if (analyseBarExplorerState.horizon === h) {
            btn.className = "px-2.5 sm:px-3 py-1 rounded-lg bg-teal-600 text-white shadow-2xs transition-all cursor-pointer whitespace-nowrap";
        } else {
            btn.className = "px-2.5 sm:px-3 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer whitespace-nowrap";
        }
    });

    // 2. Update Quick Category Buttons
    const selCh = analyseBarExplorerState.selectedChannel || 'houseTotal';
    const catMap = {
        bilanz: selCh === 'houseTotal',
        solar: selCh === 'pvTotal',
        haus_bat: selCh === 'pvStrings',
        netz: selCh === 'gridImp' || selCh === 'gridExp',
        finanz: selCh === 'autarkyPct' || selCh === 'eigenPct' || selCh === 'savingsEur'
    };
    ['bilanz', 'solar', 'haus_bat', 'netz', 'finanz'].forEach(cat => {
        const cBtn = document.getElementById(`btnBarCat_${cat}`);
        if (!cBtn) return;
        if (catMap[cat]) {
            cBtn.className = "px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-600 text-white shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0";
        } else {
            cBtn.className = "px-3 py-1.5 rounded-xl text-xs font-medium bg-white/85 dark:bg-slate-900/75 text-slate-700 dark:text-slate-200 hover:bg-teal-500/15 border border-slate-200/80 dark:border-white/10 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0";
        }
    });

    const win = getAnalyseBarExplorerPeriodWindow();
    setElText('barExplorerPeriodLabel', win.label);

    if (!forceReload && analyseBarExplorerState.cacheByPeriodKey[win.key]) {
        const cachedBarData = analyseBarExplorerState.cacheByPeriodKey[win.key];
        drawAnalyseBarExplorerView(cachedBarData, baseline, metrics);
        // Stale-While-Revalidate: if cached data from IndexedDB is older than 60s, refresh quietly in background
        const ageMs = Date.now() - (cachedBarData.fetchedAtMs || 0);
        if (ageMs > 60000 && haConfigState.accessToken) {
            fetchAnalyseBarExplorerPeriodData(win, baseline, metrics).then(freshData => {
                if (freshData) {
                    freshData.fetchedAtMs = Date.now();
                    analyseBarExplorerState.cacheByPeriodKey[win.key] = freshData;
                    persistBarExplorerCacheToIdb();
                    const curWin = getAnalyseBarExplorerPeriodWindow();
                    if (curWin.key === win.key) {
                        drawAnalyseBarExplorerView(freshData, baseline, metrics);
                    }
                }
            }).catch(() => {});
        }
        return;
    }

    const readoutEl = document.getElementById('barExplorerHoverReadout');
    if (readoutEl) {
        readoutEl.innerHTML = `<span class="text-teal-600 dark:text-teal-300 font-medium">Lade Daten für ${typeof escapeHtml === 'function' ? escapeHtml(win.label) : win.label}...</span>`;
    }

    const data = await fetchAnalyseBarExplorerPeriodData(win, baseline, metrics);
    if (data) data.fetchedAtMs = Date.now();
    analyseBarExplorerState.cacheByPeriodKey[win.key] = data;
    persistBarExplorerCacheToIdb();
    drawAnalyseBarExplorerView(data, baseline, metrics);
}

function drawAnalyseBarExplorerView(data, baseline, metrics) {
    if (!data) return;
    const catalog = getAnalyseBarExplorerChannelCatalog();
    const { labels, seriesById, win } = data;

    // Ensure selectedChannel is valid
    const validIds = new Set(catalog.map(c => c.id));
    if (!analyseBarExplorerState.selectedChannel || !validIds.has(analyseBarExplorerState.selectedChannel)) {
        analyseBarExplorerState.selectedChannel = 'houseTotal';
    }
    const selId = analyseBarExplorerState.selectedChannel;
    const primaryCh = catalog.find(c => c.id === selId) || catalog[0];
    const primaryArr = seriesById[primaryCh.id] || [];

    // Update stacked toggle visibility/label (relevant for houseTotal and pvTotal)
    const stackBtn = document.getElementById('btnBarExpStackedToggle');
    const stackLbl = document.getElementById('btnBarExpStackedLabel');
    if (stackBtn) {
        if (selId === 'houseTotal' || selId === 'pvTotal') {
            stackBtn.classList.remove('hidden');
            if (stackLbl) stackLbl.innerText = analyseBarExplorerState.stacked ? 'Aufteilung' : 'Einzeln';
        } else {
            stackBtn.classList.add('hidden');
        }
    }

    // Compute Summary KPIs for selected channel + overall PV/Autarky in period
    const sumVal = primaryArr.reduce((a, b) => a + (Number(b) || 0), 0);
    const nonZeroBuckets = primaryArr.filter(v => Number(v) > 0).length;
    const avgVal = primaryCh.unit === '%'
        ? (nonZeroBuckets > 0 ? sumVal / nonZeroBuckets : 0)
        : (labels.length > 0 ? sumVal / labels.length : 0);

    let peakVal = 0;
    let peakLabel = '—';
    primaryArr.forEach((v, idx) => {
        if (Number(v) > peakVal) {
            peakVal = Number(v);
            peakLabel = labels[idx] || '';
        }
    });

    const pvSumPeriod = (seriesById.pvTotal || []).reduce((a, b) => a + (Number(b) || 0), 0);
    const houseSumPeriod = (seriesById.houseTotal || []).reduce((a, b) => a + (Number(b) || 0), 0);
    const impSumPeriod = (seriesById.gridImp || []).reduce((a, b) => a + (Number(b) || 0), 0);
    const autarkyPeriod = houseSumPeriod > 0.05 ? Math.min(100, Math.max(0, ((houseSumPeriod - impSumPeriod) / houseSumPeriod) * 100)) : 0;

    const fmtNum = (v, d = 1) => Number(v || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
    const kpiBox = document.getElementById('barExplorerSummaryKpis');
    if (kpiBox) {
        const unitLabel = primaryCh.unit;
        const bucketUnitName = analyseBarExplorerState.horizon === 'day' ? 'Stunde' : (analyseBarExplorerState.horizon === 'year' ? 'Monat' : 'Tag');
        kpiBox.innerHTML = `
            <div class="p-3 rounded-[20px] bg-white/85 dark:bg-slate-900/75 border border-slate-200/80 dark:border-white/10">
                <p class="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">${escapeHtml(primaryCh.shortLabel || primaryCh.label)} · ${primaryCh.unit === '%' ? 'Mittel' : 'Summe'}</p>
                <p class="text-lg sm:text-xl font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                    ${fmtNum(primaryCh.unit === '%' ? avgVal : sumVal, primaryCh.unit === 'kWh' && sumVal < 10 ? 2 : 1)} ${unitLabel}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">${escapeHtml(win.label)}</p>
            </div>
            <div class="p-3 rounded-[20px] bg-white/85 dark:bg-slate-900/75 border border-slate-200/80 dark:border-white/10">
                <p class="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">Ø pro ${bucketUnitName}</p>
                <p class="text-lg sm:text-xl font-bold tabular-nums text-teal-700 dark:text-teal-300 mt-0.5">
                    ${fmtNum(avgVal, avgVal < 10 ? 2 : 1)} ${unitLabel}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">${nonZeroBuckets} aktive Intervalle</p>
            </div>
            <div class="p-3 rounded-[20px] bg-white/85 dark:bg-slate-900/75 border border-slate-200/80 dark:border-white/10">
                <p class="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">Spitzenwert (Peak)</p>
                <p class="text-lg sm:text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
                    ${fmtNum(peakVal, peakVal < 10 ? 2 : 1)} ${unitLabel}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">Zeit: ${escapeHtml(peakLabel)}</p>
            </div>
            <div class="p-3 rounded-[20px] bg-white/85 dark:bg-slate-900/75 border border-slate-200/80 dark:border-white/10">
                <p class="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">Autarkie im Zeitraum</p>
                <p class="text-lg sm:text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ${fmtNum(autarkyPeriod, 1)} %
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">PV: ${fmtNum(pvSumPeriod, 1)} · Haus: ${fmtNum(houseSumPeriod, 1)} kWh</p>
            </div>
        `;
    }

    // 2. Render 3-Column Channel Selector Tiles (Unified Design with Live Intraday Tiles + Inline ✓ / ∫ / ! Symbol)
    const isDark = document.documentElement.classList.contains('dark');
    const gridEl = document.getElementById('analysisExplorerChannelsGrid');
    if (gridEl) {
        const entCfg = haConfigState.entities || {};
        gridEl.innerHTML = catalog.map(ch => {
            const isSelected = ch.id === selId;
            const arr = seriesById[ch.id] || [];
            const total = arr.reduce((a, b) => a + (Number(b) || 0), 0);
            const nz = arr.filter(v => Number(v) > 0).length;
            const displayVal = ch.unit === '%' ? (nz > 0 ? total / nz : 0) : total;
            const maxVal = arr.reduce((m, v) => Math.max(m, Number(v) || 0), 0);
            const valFmt = fmtNum(displayVal, displayVal < 10 && displayVal > 0 ? 2 : 1);
            const maxFmt = fmtNum(maxVal, maxVal < 10 && maxVal > 0 ? 2 : 1);

            let chDiag = null;
            if (ch.id === 'houseTotal') chDiag = getChannelEnergyDiagnosticBadge(entCfg.loadEnergyMonth, total, total);
            else if (ch.id === 'pvTotal') chDiag = getChannelEnergyDiagnosticBadge(getConfiguredPvEnergyEntities(haConfigState), total, total);
            else if (ch.id === 'gridImp') chDiag = getChannelEnergyDiagnosticBadge(entCfg.gridImportMonth, total, total);
            else if (ch.id === 'gridExp') chDiag = getChannelEnergyDiagnosticBadge(entCfg.gridExportMonth, total, total);
            else if (ch.id === 'batChg') chDiag = getChannelEnergyDiagnosticBadge(entCfg.batteryChargeMonth, total, total);
            else if (ch.id === 'batDis') chDiag = getChannelEnergyDiagnosticBadge(entCfg.batteryDischargeMonth, total, total);
            else if (ch.group === 'string') chDiag = getChannelEnergyDiagnosticBadge(ch.energyEntity, total, total);

            let cardStyle = '';
            if (isDark) {
                cardStyle = isSelected
                    ? `border-left: 3.5px solid ${ch.color}; border-top: 1px solid ${hexToRgba(ch.color, 0.45)}; border-right: 1px solid rgba(148,163,184,0.18); border-bottom: 1px solid rgba(148,163,184,0.18); background: linear-gradient(135deg, ${hexToRgba(ch.color, 0.22)} 0%, rgba(15, 28, 35, 0.94) 100%);`
                    : `border-left: 3.5px solid rgba(100,116,139,0.45); border-top: 1px solid rgba(148,163,184,0.16); border-right: 1px solid rgba(148,163,184,0.16); border-bottom: 1px solid rgba(148,163,184,0.16); background: rgba(15, 25, 32, 0.65); opacity: 0.72;`;
            } else {
                cardStyle = isSelected
                    ? `border-left: 3.5px solid ${ch.color}; border-top: 1px solid ${hexToRgba(ch.color, 0.45)}; border-right: 1px solid ${hexToRgba(ch.color, 0.30)}; border-bottom: 1px solid ${hexToRgba(ch.color, 0.30)}; background: linear-gradient(135deg, ${hexToRgba(ch.color, 0.14)} 0%, rgba(255, 255, 255, 0.97) 65%); box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);`
                    : `border-left: 3.5px solid #cbd5e1; border-top: 1px solid rgba(203, 213, 225, 0.85); border-right: 1px solid rgba(203, 213, 225, 0.85); border-bottom: 1px solid rgba(203, 213, 225, 0.85); background: rgba(255, 255, 255, 0.88); opacity: 0.80;`;
            }

            return `
            <div onclick="toggleAnalyseBarChannel('${ch.id}')" role="button" tabindex="0"
                style="${cardStyle}"
                class="rounded-2xl px-3 py-2.5 cursor-pointer select-none transition-all duration-150 hover:opacity-100">
                <div class="flex items-center justify-between gap-1.5">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${isSelected ? ch.color : '#94a3b8'}"></span>
                        <span class="text-[12.5px] ${isSelected ? 'font-medium text-slate-900 dark:text-slate-100' : 'font-normal text-slate-600 dark:text-slate-400'} truncate leading-snug">${escapeHtml(ch.shortLabel || ch.label)}</span>
                    </div>
                    ${ch.hasSmartStack
                        ? `<span class="text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-teal-500/15 text-teal-800 dark:text-teal-200' : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400'} shrink-0">Stapel</span>`
                        : `<span class="text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-teal-500/15 text-teal-800 dark:text-teal-300' : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400'} shrink-0">${isSelected ? 'AN' : 'AUS'}</span>`
                    }
                </div>
                <div class="mt-1.5 flex items-baseline justify-between gap-1 tabular-nums">
                    <span class="text-[16px] sm:text-[17px] font-bold ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'} leading-tight flex items-center gap-0.5">
                        <span>${valFmt} ${ch.unit}</span>${chDiag ? renderInlineDiagSymbol(chDiag.tone, chDiag.text) : ''}
                    </span>
                </div>
                <p class="mt-0.5 text-[12px] ${isSelected ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'} tabular-nums truncate" title="Spitzenwert im Zeitraum">
                    Peak ${maxFmt} ${ch.unit}
                </p>
            </div>`;
        }).join('');
    }

    // 3. Build Datasets: ALWAYS 1 BAR PER TIME BUCKET (either 1 solid bar or 1 meaningful stacked bar!)
    const canvas = document.getElementById('analysisExplorerBarChart');
    if (!canvas || typeof Chart === 'undefined') return;
    let datasets = [];
    let isStackedBar = false;
    let badgeText = '1 Balken / Intervall';

    if (selId === 'houseTotal' && analyseBarExplorerState.stacked) {
        isStackedBar = true;
        badgeText = 'Hauslast-Aufteilung (gestapelt)';
        datasets = [
            {
                label: 'Direkt-PV (kWh)',
                data: seriesById._houseDirectPv || [],
                backgroundColor: '#10b981',
                borderRadius: 2,
                stack: 'single_bar'
            },
            {
                label: 'Aus Speicher (kWh)',
                data: seriesById._houseFromBat || [],
                backgroundColor: '#a855f7',
                borderRadius: 2,
                stack: 'single_bar'
            },
            {
                label: 'Aus Stromnetz (kWh)',
                data: seriesById._houseFromGrid || [],
                backgroundColor: '#3b82f6',
                borderRadius: 3,
                stack: 'single_bar'
            }
        ];
    } else if (selId === 'pvTotal' && analyseBarExplorerState.stacked) {
        isStackedBar = true;
        badgeText = 'PV-Verwendung (gestapelt)';
        datasets = [
            {
                label: 'Direktverbrauch (kWh)',
                data: seriesById._pvDirectUsed || [],
                backgroundColor: '#10b981',
                borderRadius: 2,
                stack: 'single_bar'
            },
            {
                label: 'Batterie-Ladung (kWh)',
                data: seriesById._pvToBat || [],
                backgroundColor: '#a855f7',
                borderRadius: 2,
                stack: 'single_bar'
            },
            {
                label: 'Netzeinspeisung (kWh)',
                data: seriesById._pvToGrid || [],
                backgroundColor: '#06b6d4',
                borderRadius: 3,
                stack: 'single_bar'
            }
        ];
    } else if (selId === 'pvStrings') {
        isStackedBar = true;
        badgeText = 'PV-Strings (gestapelt)';
        const strChannels = catalog.filter(c => c.group === 'string');
        datasets = strChannels.map(sc => ({
            label: `${sc.shortLabel || sc.label} (kWh)`,
            data: seriesById[sc.id] || [],
            backgroundColor: sc.color,
            borderRadius: 2,
            stack: 'single_bar'
        }));
    } else {
        isStackedBar = false;
        badgeText = primaryCh.shortLabel || primaryCh.label;
        datasets = [
            {
                label: `${primaryCh.shortLabel || primaryCh.label} (${primaryCh.unit})`,
                data: primaryArr,
                backgroundColor: primaryCh.color,
                hoverBackgroundColor: primaryCh.color,
                borderRadius: 4,
                stack: 'single_bar'
            }
        ];
    }

    setElText('barExplorerActiveCountBadge', badgeText);

    if (analyseBarExplorerState.chartInstance) {
        analyseBarExplorerState.chartInstance.destroy();
        analyseBarExplorerState.chartInstance = null;
    }

    const readoutEl = document.getElementById('barExplorerHoverReadout');
    if (readoutEl) {
        readoutEl.innerHTML = `<span class="font-semibold text-teal-700 dark:text-teal-300">${escapeHtml(win.label)}</span> · ${escapeHtml(primaryCh.label)} — Tippe auf einen Balken für Details`;
    }

    const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < 640;
    const hideYAxis = isMobileScreen || !!analyseBarExplorerState.isExpanded;

    analyseBarExplorerState.chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { left: 2, right: 2, top: 4, bottom: 0 }
            },
            interaction: { mode: 'index', intersect: false },
            onHover: (event, elements) => {
                if (!elements || elements.length === 0 || !readoutEl) return;
                const idx = elements[0].index;
                const bucketLbl = labels[idx] || '';
                const totalBucketVal = primaryArr[idx] || 0;
                if (isStackedBar && datasets.length > 1) {
                    const parts = datasets.map(ds => {
                        const v = (ds.data || [])[idx] || 0;
                        return `<span style="color:${ds.backgroundColor}" class="font-medium">${escapeHtml(ds.label.replace(' (kWh)', ''))}: ${fmtNum(v, v < 10 && v > 0 ? 2 : 1)}</span>`;
                    });
                    readoutEl.innerHTML = `<strong class="text-slate-900 dark:text-white">${escapeHtml(bucketLbl)} (Gesamt ${fmtNum(totalBucketVal, totalBucketVal < 10 ? 2 : 1)} kWh):</strong> ${parts.join(' · ')}`;
                } else {
                    readoutEl.innerHTML = `<strong class="text-slate-900 dark:text-white">${escapeHtml(bucketLbl)}:</strong> <span style="color:${primaryCh.color}" class="font-semibold">${escapeHtml(primaryCh.shortLabel || primaryCh.label)}: ${fmtNum(totalBucketVal, totalBucketVal < 10 && totalBucketVal > 0 ? 2 : 1)} ${primaryCh.unit}</span>`;
                }
            },
            plugins: {
                legend: {
                    display: isStackedBar && datasets.length > 1,
                    position: 'top',
                    labels: {
                        color: isDark ? '#cbd5e1' : '#334155',
                        boxWidth: 10,
                        usePointStyle: true,
                        font: { size: 11.5, weight: '500' }
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.97)',
                    titleColor: isDark ? '#f8fafc' : '#0f172a',
                    bodyColor: isDark ? '#cbd5e1' : '#334155',
                    borderColor: isDark ? 'rgba(45, 212, 191, 0.35)' : 'rgba(13, 148, 136, 0.35)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: {
                        color: isDark ? '#94a3b8' : '#64748b',
                        font: { size: 11 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: analyseBarExplorerState.horizon === 'day' ? 8 : (analyseBarExplorerState.horizon === 'month' ? 10 : 12)
                    }
                },
                y: {
                    display: !hideYAxis,
                    stacked: true,
                    beginAtZero: true,
                    max: primaryCh.unit === '%' ? 100 : undefined,
                    grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' },
                    ticks: {
                        color: isDark ? '#94a3b8' : '#64748b',
                        font: { size: 11 },
                        callback: (v) => `${v} ${primaryCh.unit}`
                    }
                }
            }
        }
    });
}

if (typeof window !== 'undefined') {
    window.openAnalyseBarExplorer = openAnalyseBarExplorer;
    window.setAnalyseBarExplorerHorizon = setAnalyseBarExplorerHorizon;
    window.shiftAnalyseBarExplorerPeriod = shiftAnalyseBarExplorerPeriod;
    window.toggleAnalyseBarExplorerStacked = toggleAnalyseBarExplorerStacked;
    window.toggleAnalyseBarInlineExpand = toggleAnalyseBarInlineExpand;
    window.onAnalyseBarStageClick = onAnalyseBarStageClick;
    window.selectAnalyseBarCategory = selectAnalyseBarCategory;
    window.toggleAnalyseBarChannel = toggleAnalyseBarChannel;
    window.focusSingleAnalyseBarChannel = focusSingleAnalyseBarChannel;
    window.selectAnalyseBarPreset = selectAnalyseBarPreset;
    window.reloadAnalyseBarExplorerData = reloadAnalyseBarExplorerData;
    window.renderAnalyseBarExplorer = renderAnalyseBarExplorer;
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
            // Single Source of Truth: ledger.month already respects manual Logbuch calibration or Live HA counters
            pvTotal = +Math.max(ledger.month.pvTotal, ledger.today.pvTotal).toFixed(1);
            gridExp = +Math.max(ledger.month.gridExp, ledger.today.gridExp).toFixed(1);
            gridImp = +Math.max(ledger.month.gridImp, ledger.today.gridImp).toFixed(1);
            batChg = hasBattery ? +Math.min(pvTotal, Math.max(ledger.month.batChg, ledger.today.batChg)).toFixed(1) : 0;
            batDis = hasBattery ? +Math.max(ledger.month.batDis, ledger.today.batDis).toFixed(1) : 0;
            gridExp = +Math.min(Math.max(0, pvTotal - batChg), gridExp).toFixed(1);
            pvDirect = +Math.max(0, pvTotal - gridExp - batChg).toFixed(1);
            batLoss = +Math.max(0, batChg - batDis).toFixed(1);
            houseTotal = +Math.max(0.1, pvDirect + batDis + gridImp, ledger.today.houseTotal).toFixed(1);
            const srcNote = ledger.month.isManualOverride ? 'Manuell kalibriert im Logbuch' : 'Live HA & Logbuch';
            periodLabel = `Monat: ${MONTH_LABELS_LONG[curMonthIdx]} ${selectedAnalysisYear} (${srcNote})`;
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

    // 3. Render Summary Ribbon Below Sankey (including transparent kWh Sensor Diagnostics banner if any sensor is unavailable or has a jump info note)
    const ribbon = document.getElementById('sankeySummaryRibbon');
    if (ribbon) {
        const diagNotices = Object.values(sensorDiagnosticsByEntity || {}).filter(
            x => x && (x.status === 'unavailable' || x.status === 'wrong_unit' || Boolean(x.jumpInfo))
        );
        const diagBannerHtml = diagNotices.length > 0 ? `
            <div class="col-span-full p-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-950 dark:text-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div class="flex items-start gap-2.5 min-w-0">
                    <span class="material-symbols-rounded text-sky-600 dark:text-sky-400 text-lg shrink-0 mt-0.5">info</span>
                    <div class="min-w-0 flex-1 space-y-0.5">
                        <p class="text-[11px] font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-300">kWh-Sensor-Diagnose (${diagNotices.length} Hinweis${diagNotices.length > 1 ? 'e' : ''} · Keine Werte gefiltert)</p>
                        ${diagNotices.map(w => {
                            const msg = w.jumpInfo || w.reason || '';
                            return `
                            <p class="text-[11px] font-mono leading-snug truncate" title="${typeof escapeHtml === 'function' ? escapeHtml(w.entityId + ': ' + msg) : ''}">
                                <strong>${typeof escapeHtml === 'function' ? escapeHtml(w.entityId) : w.entityId}:</strong> ${typeof escapeHtml === 'function' ? escapeHtml(msg) : msg}
                            </p>`;
                        }).join('')}
                    </div>
                </div>
                <button type="button" onclick="openHaConfigModal('counters')" class="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-[11px] font-bold text-sky-900 dark:text-sky-100 shrink-0 cursor-pointer flex items-center gap-1 self-start sm:self-center">
                    <span class="material-symbols-rounded text-sm">tune</span>
                    <span>Sensoren ansehen</span>
                </button>
            </div>
        ` : '';

        ribbon.innerHTML = `
            ${diagBannerHtml}
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
    const startInp = document.getElementById('logbuchTrackingStartDate');
    if (startInp && haConfigState.trackingStartDate) {
        startInp.value = haConfigState.trackingStartDate;
    }

    const tbody = document.getElementById('monthlyLogbookTableBody');
    if (!tbody) return;

    const monthsRaw = getCurrentYearMonthsData(selectedAnalysisYear);

    tbody.innerHTML = metrics.monthlyComparison.map((m, idx) => {
        const raw = monthsRaw[idx] || {};
        const isLive = m.isLiveCurrentMonth;
        const isManual = raw.source === 'manual';
        const pvVal = raw.pvYieldKwh !== null && raw.pvYieldKwh !== undefined ? raw.pvYieldKwh : (isLive ? Math.round(m.realPv || 0) : '');
        const expVal = raw.gridExportKwh !== null && raw.gridExportKwh !== undefined ? raw.gridExportKwh : (isLive ? Math.round(m.expKwh || 0) : '');
        const impVal = raw.gridImportKwh !== null && raw.gridImportKwh !== undefined ? raw.gridImportKwh : (isLive ? Math.round(m.impKwh || 0) : '');
        const bChgVal = raw.batteryChargedKwh !== null && raw.batteryChargedKwh !== undefined ? raw.batteryChargedKwh : (isLive ? Math.round(m.bChg || 0) : '');
        const bDisVal = raw.batteryDischargedKwh !== null && raw.batteryDischargedKwh !== undefined ? raw.batteryDischargedKwh : (isLive ? Math.round(m.bDis || 0) : '');

        const perfStr = m.hasReal && m.perfIndexPct !== null ? `${m.perfIndexPct.toFixed(0)} %` : '—';
        const perfCls = !m.hasReal ? 'text-slate-400' : (m.perfIndexPct >= 100 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold');

        const badgeHtml = isManual
            ? '<span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold">Manuell</span>'
            : (isLive ? '<span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-teal-500/15 text-teal-600 dark:text-teal-400 font-bold">Live HA</span>' : '');

        return `
        <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
            <td class="py-2.5 px-3 font-bold text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                ${m.labelLong}
                ${badgeHtml}
            </td>
            <td class="py-2.5 px-3 font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 text-right">${Math.round(m.sollKwh)} kWh</td>
            <td class="py-2 px-2">
                <input type="number" step="0.1" min="0" value="${pvVal}" placeholder="${isLive ? 'Live HA' : 'kWh'}"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'pvYieldKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border ${isManual ? 'border-amber-500/60 bg-amber-500/5' : (isLive ? 'border-teal-500/50 bg-teal-500/5' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950')} text-slate-900 dark:text-white focus:border-teal-500 outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="0.1" min="0" value="${expVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'gridExportKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-teal-500 outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="0.1" min="0" value="${impVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'gridImportKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-teal-500 outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="0.1" min="0" value="${bChgVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'batteryChargedKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-teal-500 outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="0.1" min="0" value="${bDisVal}" placeholder="kWh"
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
        if (months[monthIdx].pvYieldKwh === null) {
            months[monthIdx].source = 'empty';
        }
    } else {
        const val = parseFloat(String(rawValue).replace(',', '.'));
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

    // Reset manual flag on current month when user explicitly requests a fresh HA sync
    if (months[curMonth].source === 'manual') {
        months[curMonth].source = 'ha';
    }

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
        showToastNotification(`Monats- & Jahreswerte ab ${haConfigState.trackingStartDate || '01.11.2026'} aus HA synchronisiert!`, 'success');
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
    const panelClimate = document.getElementById('ha-modal-panel-climate');
    const panelGuide = document.getElementById('ha-modal-panel-guide');
    const btnCfg = document.getElementById('btn-ha-tab-config') || document.getElementById('btn-ha-modal-tab-config');
    const btnClimate = document.getElementById('btn-ha-tab-climate');
    const btnGuide = document.getElementById('btn-ha-tab-guide') || document.getElementById('btn-ha-modal-tab-guide');
    const scrollBody = document.getElementById('haModalScrollBody');

    const activeCls = "px-2.5 py-2 rounded-xl bg-teal-600 text-white text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs text-center leading-tight";
    const inactiveCls = "px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-center leading-tight";

    if (panelCfg) panelCfg.classList.toggle('hidden', tab !== 'config');
    if (panelClimate) panelClimate.classList.toggle('hidden', tab !== 'climate');
    if (panelGuide) panelGuide.classList.toggle('hidden', tab !== 'guide');

    if (btnCfg) btnCfg.className = tab === 'config' ? activeCls : inactiveCls;
    if (btnClimate) btnClimate.className = tab === 'climate' ? activeCls : inactiveCls;
    if (btnGuide) btnGuide.className = tab === 'guide' ? activeCls : inactiveCls;

    if (scrollBody) {
        scrollBody.scrollTop = 0;
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
    const pvIds = getConfiguredPvEnergyEntities(haConfigState);

    const channels = [
        {
            name: 'PV-Erzeugung',
            wattEnt: ent.pvPower || (Array.isArray(haConfigState.customStrings) && haConfigState.customStrings.some(s => s.powerEntity) ? 'PV-Strings (DC)' : ''),
            kwhEnt: pvIds.join(', '),
            kwhIds: pvIds,
            todayVal: ledger.today.pvTotal,
            monthVal: ledger.month.pvTotal
        },
        {
            name: 'Hausverbrauch',
            wattEnt: ent.loadPower || '',
            kwhEnt: ent.loadEnergyMonth || '',
            kwhIds: ent.loadEnergyMonth ? [ent.loadEnergyMonth] : [],
            todayVal: ledger.today.houseTotal,
            monthVal: ledger.month.houseTotal
        },
        {
            name: 'Netzbezug (Import)',
            wattEnt: ent.gridImportPower || ent.gridPower || '',
            kwhEnt: ent.gridImportMonth || '',
            kwhIds: ent.gridImportMonth ? [ent.gridImportMonth] : [],
            todayVal: ledger.today.gridImp,
            monthVal: ledger.month.gridImp
        },
        {
            name: 'Netzeinspeisung',
            wattEnt: ent.gridExportPower || ent.gridPower || '',
            kwhEnt: ent.gridExportMonth || '',
            kwhIds: ent.gridExportMonth ? [ent.gridExportMonth] : [],
            todayVal: ledger.today.gridExp,
            monthVal: ledger.month.gridExp
        },
        {
            name: 'Batterie Ladung',
            wattEnt: ent.batteryChargePower || ent.batteryPower || '',
            kwhEnt: ent.batteryChargeMonth || '',
            kwhIds: ent.batteryChargeMonth ? [ent.batteryChargeMonth] : [],
            todayVal: ledger.today.batChg,
            monthVal: ledger.month.batChg
        },
        {
            name: 'Batterie Entladung',
            wattEnt: ent.batteryDischargePower || ent.batteryPower || '',
            kwhEnt: ent.batteryDischargeMonth || '',
            kwhIds: ent.batteryDischargeMonth ? [ent.batteryDischargeMonth] : [],
            todayVal: ledger.today.batDis,
            monthVal: ledger.month.batDis
        }
    ];

    box.innerHTML = channels.map(ch => {
        const hasWatt = Boolean(ch.wattEnt);
        const hasKwh = Boolean(ch.kwhEnt);
        const channelWarns = (ch.kwhIds || []).map(id => getSensorDiagnostic(id)).filter(d => d && (d.status !== 'ok' || Boolean(d.jumpInfo)));
        const hasUnavailable = channelWarns.some(w => w.status === 'unavailable' || w.status === 'wrong_unit');

        const statusColor = hasUnavailable
            ? 'text-amber-700 dark:text-amber-300 border-amber-500/45 bg-amber-500/10'
            : ((hasWatt && hasKwh)
                ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5'
                : ((hasWatt || hasKwh)
                    ? 'text-teal-600 dark:text-teal-400 border-teal-500/30 bg-teal-500/5'
                    : 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5'));

        const modeText = hasUnavailable
            ? '⚠ Fallback auf W'
            : ((hasWatt && hasKwh)
                ? '1:1 Watt + kWh aktiv'
                : (hasKwh ? '1:1 kWh-Zähler aktiv' : (hasWatt ? 'Watt-Integral aktiv' : 'Bilanz / Offen')));

        const warnDetailHtml = channelWarns.length > 0
            ? `<div class="mt-1 pt-1 border-t border-slate-300/40 dark:border-slate-700/50 text-[9.5px] font-mono text-slate-700 dark:text-slate-300 leading-snug">
                ${channelWarns.map(w => {
                    const msg = w.jumpInfo || w.reason || '';
                    return `<div>• <strong>${typeof escapeHtml === 'function' ? escapeHtml(w.entityId) : w.entityId}:</strong> ${typeof escapeHtml === 'function' ? escapeHtml(msg) : msg}</div>`;
                }).join('')}
               </div>`
            : '';

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
            ${warnDetailHtml}
        </div>`;
    }).join('');
}

function openHaConfigModal(focusSection = null, scrollTargetId = null) {
    const modal = document.getElementById('modal-ha-config');
    if (!modal) return;

    const cleanMode = (!haConfigState.mode || haConfigState.mode === 'demo') ? 'poll' : haConfigState.mode;
    setElVal('ha_cfg_mode', cleanMode);
    setElVal('ha_cfg_url', haConfigState.baseUrl || 'https://home.mb10.org');
    setElVal('ha_cfg_token', haConfigState.accessToken || '');
    setElVal('ha_cfg_interval', haConfigState.pollIntervalSec || 10);
    setElVal('ha_cfg_bat_name', haConfigState.batteryName || 'BYD HVS+');
    setElVal('ha_cfg_tracking_start_date', haConfigState.trackingStartDate || '2026-11-01');
    setElVal('logbuchTrackingStartDate', haConfigState.trackingStartDate || '2026-11-01');

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
    setElVal('ha_ent_weather_main', haConfigState.weatherEntity || '');
    setElVal('ha_ent_outdoor_temp', haConfigState.outdoorTempEntity || '');

    renderHaCustomStringsEditor();
    renderHaCustomConsumersEditor();
    renderHaWeatherSensorsEditor();
    renderHaPvEnergyExtraList();
    renderHaUnifiedSensorMatrix();
    updateHaWebhookYamlSnippet();
    updateHaReverseProxyYamlDynamic();

    const pvDiagEl = document.getElementById('haMainDiag_pv_month');
    if (pvDiagEl) {
        pvDiagEl.innerHTML = ent.pvEnergyMonth ? renderEntityDiagnosticSubline(ent.pvEnergyMonth) : '';
    }
    const extraDetails = document.getElementById('haPvExtraDetailsBox');
    if (extraDetails) {
        const hasExtra = Boolean(ent.pvEnergyToday) || (Array.isArray(haConfigState.pvEnergyExtraEntities) && haConfigState.pvEnergyExtraEntities.some(Boolean));
        if (hasExtra) extraDetails.setAttribute('open', 'open');
    }

    modal.classList.remove('hidden');

    const scrollBody = document.getElementById('haModalScrollBody');
    if (scrollBody) scrollBody.scrollTop = 0;

    if (focusSection === 'guide') {
        switchHaModalTab('guide');
        return;
    }

    if (focusSection === 'climate' || scrollTargetId === 'haWeatherSectionBox') {
        switchHaModalTab('climate');
        return;
    }

    switchHaModalTab('config');

    if (scrollTargetId) {
        setTimeout(() => {
            document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    } else if (focusSection === 'consumers') {
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
        const diagHtml = renderEntityDiagnosticSubline(cs.energyEntity);

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
                    ${diagHtml}
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
        const safeNrgEnt = typeof escapeHtml === 'function' ? escapeHtml(cc.energyEntity || '') : (cc.energyEntity || '');
        const diagHtml = renderEntityDiagnosticSubline(cc.energyEntity);
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
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div>
                    <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Leistung (W / kW)</label>
                    <div class="flex items-center gap-1">
                        <input type="text" id="ha_cons_pwr_${idx}" list="haEntitiesDatalist" value="${safeEnt}" oninput="updateHaCustomConsumerField(${idx}, 'powerEntity', this.value)"
                            placeholder="sensor.shelly_pm_mini_power"
                            class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                        <button type="button" onclick="openHaEntityPicker({ customType: 'consumerPower', index: ${idx}, unitFilter: 'power', title: 'Einzelverbraucher ${idx + 1} · Leistung (W/kW)' })" class="w-8 h-8 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/35 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 cursor-pointer" title="Leistungs-Sensor (W) wählen" aria-label="Leistungs-Sensor wählen">
                            <span class="material-symbols-rounded text-base">list_alt</span>
                        </button>
                    </div>
                </div>
                <div>
                    <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Energiezähler (kWh, optional für Tagesbalken)</label>
                    <div class="flex items-center gap-1">
                        <input type="text" id="ha_cons_nrg_${idx}" list="haEntitiesDatalist" value="${safeNrgEnt}" oninput="updateHaCustomConsumerField(${idx}, 'energyEntity', this.value)"
                            placeholder="Leer = aus W berechnet"
                            class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                        <button type="button" onclick="openHaEntityPicker({ customType: 'consumerEnergy', index: ${idx}, unitFilter: 'energy', title: 'Einzelverbraucher ${idx + 1} · Energie (kWh)' })" class="w-8 h-8 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/35 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 cursor-pointer" title="Energiezähler (kWh) wählen" aria-label="Energiezähler wählen">
                            <span class="material-symbols-rounded text-base">list_alt</span>
                        </button>
                    </div>
                    ${diagHtml}
                </div>
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
        powerEntity: '',
        energyEntity: ''
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
        const diagHtml = renderEntityDiagnosticSubline(entId);
        return `
        <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-teal-500/30 space-y-1">
            <div class="flex flex-col sm:flex-row sm:items-center gap-1.5">
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
            </div>
            ${diagHtml}
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
    const trackInp = document.getElementById('ha_cfg_tracking_start_date')?.value;
    if (trackInp) {
        haConfigState.trackingStartDate = trackInp.trim();
        setElVal('logbuchTrackingStartDate', haConfigState.trackingStartDate);
    }

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

    haConfigState.weatherEntity = (document.getElementById('ha_ent_weather_main')?.value || haConfigState.weatherEntity || '').trim();
    haConfigState.outdoorTempEntity = (document.getElementById('ha_ent_outdoor_temp')?.value || haConfigState.outdoorTempEntity || '').trim();

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
                s.entity_id.startsWith('weather.') ||
                s.entity_id.startsWith('number.') ||
                s.entity_id.startsWith('input_number.') ||
                s.entity_id.startsWith('counter.')
            );
        })
        .map(s => {
            const isWeather = s.entity_id.startsWith('weather.');
            const unit = isWeather
                ? (s.attributes?.temperature !== undefined ? `${s.attributes.temperature} °C` : 'Wetter')
                : String(s.attributes?.unit_of_measurement || '').trim();
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
                category: isWeather ? 'device' : groupInfo.category, // 'device' | 'helper'
                groupName: isWeather ? 'Wetter & Klima' : groupInfo.groupName,
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

    // Resolve currently assigned entity_id so we can mark & scroll to the active sensor!
    let currentEntityId = '';
    if (options.targetInputId) {
        const inp = document.getElementById(options.targetInputId);
        if (inp && inp.value) currentEntityId = String(inp.value).trim();
    } else if (options.customType === 'stringPower' && options.index !== undefined) {
        currentEntityId = String(haConfigState.customStrings?.[options.index]?.powerEntity || '').trim();
    } else if (options.customType === 'stringEnergy' && options.index !== undefined) {
        currentEntityId = String(haConfigState.customStrings?.[options.index]?.energyEntity || '').trim();
    } else if (options.customType === 'consumerPower' && options.index !== undefined) {
        currentEntityId = String(haConfigState.customConsumers?.[options.index]?.powerEntity || '').trim();
    } else if (options.customType === 'consumerEnergy' && options.index !== undefined) {
        currentEntityId = String(haConfigState.customConsumers?.[options.index]?.energyEntity || '').trim();
    } else if (options.customType === 'pvEnergyExtra' && options.index !== undefined) {
        currentEntityId = String(haConfigState.pvEnergyExtraEntities?.[options.index] || '').trim();
    }

    haPickerState = {
        targetInputId: options.targetInputId || null,
        customType: options.customType || null,
        index: options.index !== undefined ? options.index : null,
        title: options.title || 'Sensor auswählen',
        category: 'all',
        unitFilter: options.unitFilter || 'all',
        selectedGroup: '__ALL__',
        searchQuery: '',
        currentEntityId,
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
        // If currentEntityId belongs to a sensor whose unit doesn't match unitFilter, widen unitFilter to 'all' so the active sensor is visible
        const activeSensor = currentEntityId ? discoveredHaSensors.find(s => s.entity_id === currentEntityId) : null;
        if (activeSensor && haPickerState.unitFilter !== 'all' && activeSensor.unitCategory !== haPickerState.unitFilter) {
            haPickerState.unitFilter = 'all';
            updateHaPickerFilterButtonsUI();
        }
        renderHaEntityPickerUI(true);
    }
}

function closeHaEntityPicker() {
    const modal = document.getElementById('modal-ha-entity-picker');
    if (modal) modal.classList.add('hidden');
}

async function reloadHaPickerSensors() {
    readHaModalIntoState();
    haPickerState.isLoading = true;
    renderHaEntityPickerUI(false);

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
    renderHaEntityPickerUI(true);
}

function setHaPickerCategory(cat) {
    haPickerState.category = cat || 'all';
    haPickerState.selectedGroup = '__ALL__';
    updateHaPickerFilterButtonsUI();
    renderHaEntityPickerUI(false);
}

function setHaPickerUnitFilter(unitFilter) {
    haPickerState.unitFilter = unitFilter || 'all';
    updateHaPickerFilterButtonsUI();
    renderHaEntityPickerUI(false);
}

function selectHaPickerGroup(groupKey) {
    haPickerState.selectedGroup = groupKey || '__ALL__';
    renderHaEntityPickerUI(false);
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
    renderHaEntityPickerUI(false);
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

function renderHaEntityPickerUI(scrollToActive = false) {
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

    const activeEntityId = haPickerState.currentEntityId || '';
    const activeSensorObj = activeEntityId ? discoveredHaSensors.find(s => s.entity_id === activeEntityId) : null;

    // 1. Build Groups (Devices & Helpers) matching Category + Unit + Search
    const baseFiltered = getFilteredPickerSensors(true);
    const groupMap = new Map();
    baseFiltered.forEach(s => {
        const key = s.groupName || 'Sonstige';
        if (!groupMap.has(key)) {
            groupMap.set(key, { name: key, category: s.category, count: 0, hasActive: false });
        }
        const entry = groupMap.get(key);
        entry.count++;
        if (activeEntityId && s.entity_id === activeEntityId) {
            entry.hasActive = true;
        }
    });

    const groupsArr = [...groupMap.values()].sort((a, b) => {
        if (a.hasActive !== b.hasActive) return a.hasActive ? -1 : 1;
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
            <span class="flex items-center gap-2 min-w-0">
                <span class="material-symbols-rounded text-base shrink-0">apps</span>
                <span class="break-words whitespace-normal leading-snug">Alle passenden Sensoren</span>
            </span>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${isAllSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'}">${baseFiltered.length}</span>
        </button>
    `;

    groupsHtml += groupsArr.map(g => {
        const isSel = haPickerState.selectedGroup === g.name;
        const safeGName = typeof escapeHtml === 'function' ? escapeHtml(g.name) : g.name;
        const iconName = g.category === 'helper' ? 'functions' : 'memory';
        const iconColor = isSel ? 'text-white' : (g.hasActive ? 'text-emerald-500' : (g.category === 'helper' ? 'text-amber-400' : 'text-teal-400'));
        const safeJsArg = g.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        return `
        <button type="button" onclick="selectHaPickerGroup('${safeJsArg}')"
            class="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                isSel
                    ? 'bg-teal-600 text-white shadow-xs font-bold'
                    : (g.hasActive
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border-2 border-emerald-500/60 font-bold'
                        : 'bg-white dark:bg-[#13242c] text-slate-700 dark:text-slate-200 hover:bg-teal-500/10 border border-slate-200/80 dark:border-white/10')
            }">
            <span class="flex items-start gap-2 min-w-0 flex-1">
                <span class="material-symbols-rounded text-base shrink-0 mt-0.5 ${iconColor}">${g.hasActive ? 'check_circle' : iconName}</span>
                <span class="break-words whitespace-normal leading-snug">${safeGName}</span>
            </span>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${isSel ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'}">${g.count}</span>
        </button>`;
    }).join('');

    groupsEl.innerHTML = groupsHtml;

    // 2. Build Entities List for Step 2 (Never truncate sensor names or entity_ids!)
    const matchingEntities = getFilteredPickerSensors(false);
    setElText('haPickerEntityCountBadge', `${matchingEntities.length} Sensoren`);
    setElText(
        'haPickerActiveGroupTitle',
        haPickerState.selectedGroup === '__ALL__'
            ? '2. Entität antippen zum Übernehmen (Vollständige Namen)'
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

    // Ensure currently selected sensor appears in the rendered slice (or at top if not in first 300)
    let listToRender = matchingEntities.slice(0, 300);
    if (activeSensorObj && matchingEntities.some(s => s.entity_id === activeEntityId) && !listToRender.some(s => s.entity_id === activeEntityId)) {
        listToRender = [activeSensorObj, ...listToRender];
    }

    entitiesEl.innerHTML = listToRender.map(s => {
        const isCurrentActive = Boolean(activeEntityId && s.entity_id === activeEntityId);
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(s.name) : s.name;
        const safeId = typeof escapeHtml === 'function' ? escapeHtml(s.entity_id) : s.entity_id;
        const safeGroup = typeof escapeHtml === 'function' ? escapeHtml(s.groupName) : s.groupName;
        const safeArea = typeof escapeHtml === 'function' ? escapeHtml(s.areaName) : s.areaName;
        const safeState = typeof escapeHtml === 'function' ? escapeHtml(`${s.state} ${s.unit}`.trim()) : `${s.state} ${s.unit}`.trim();
        const jsEntityId = s.entity_id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        const activeBadge = isCurrentActive
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider shadow-2xs">✓ Aktuell ausgewählt</span>`
            : '';

        const badgeType = s.category === 'helper'
            ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[9.5px] font-bold">Helfer</span>`
            : `<span class="px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-600 dark:text-teal-300 text-[9.5px] font-bold break-words">${safeGroup}</span>`;

        const areaBadge = safeArea
            ? `<span class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-[9.5px] font-semibold">${safeArea}</span>`
            : '';

        return `
        <button type="button" ${isCurrentActive ? 'id="haPickerActiveEntityRow"' : ''} onclick="pickHaEntityFromModal('${jsEntityId}')"
            class="w-full text-left p-3 rounded-xl transition-all flex items-start justify-between gap-3 group cursor-pointer ${
                isCurrentActive
                    ? 'bg-emerald-500/12 dark:bg-emerald-500/20 border-2 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'bg-white dark:bg-[#14252d] hover:bg-teal-500/10 dark:hover:bg-teal-500/15 border border-slate-200/90 dark:border-white/10 hover:border-teal-500/50'
            }">
            <div class="min-w-0 flex-1 space-y-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                    ${activeBadge}
                    ${badgeType}
                    ${areaBadge}
                </div>
                <p class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-300 break-words whitespace-normal leading-snug">
                    ${safeName}
                </p>
                <p class="text-[11px] font-mono text-slate-500 dark:text-slate-300 break-all whitespace-normal leading-snug">
                    ${safeId}
                </p>
            </div>
            <div class="text-right shrink-0 pt-0.5">
                <span class="inline-block px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#0b151a] border border-slate-200 dark:border-teal-500/30 text-xs font-black font-mono tabular-nums text-teal-700 dark:text-teal-300">
                    ${safeState || '—'}
                </span>
            </div>
        </button>`;
    }).join('');

    if (scrollToActive && activeEntityId) {
        setTimeout(() => {
            const activeRow = document.getElementById('haPickerActiveEntityRow');
            if (activeRow && typeof activeRow.scrollIntoView === 'function') {
                activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 60);
    }
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
    } else if (haPickerState.customType === 'consumerEnergy' && haPickerState.index !== null) {
        updateHaCustomConsumerField(haPickerState.index, 'energyEntity', entityId);
        renderHaCustomConsumersEditor();
    } else if (haPickerState.customType === 'pvEnergyExtra' && haPickerState.index !== null) {
        updateHaPvEnergyExtraField(haPickerState.index, entityId);
        renderHaPvEnergyExtraList();
    } else if (haPickerState.customType === 'weatherSensor' && haPickerState.index !== null) {
        updateHaCustomWeatherSensorField(haPickerState.index, 'entityId', entityId);
        const curName = haConfigState.customWeatherSensors?.[haPickerState.index]?.name || '';
        const cleanRoom = sensorObj
            ? String(sensorObj.name || '').replace(/\s+(Temperatur|Temperature|Luftfeuchtigkeit|Humidity|Klima|Sensor).*$/i, '').trim()
            : '';
        if (cleanRoom && (!curName || /^Raum \/ Sensor \d+/i.test(curName))) {
            updateHaCustomWeatherSensorField(haPickerState.index, 'name', cleanRoom);
        }
        renderHaWeatherSensorsEditor();
    } else if (haPickerState.customType === 'weatherSensorHumidity' && haPickerState.index !== null) {
        updateHaCustomWeatherSensorField(haPickerState.index, 'humidityEntity', entityId);
        renderHaWeatherSensorsEditor();
    }

    closeHaEntityPicker();
    if (typeof showToastNotification === 'function') {
        showToastNotification(`Sensor „${sensorObj ? sensorObj.name : entityId}“ übernommen!`, 'success');
    }
}

async function saveHaConfigFromModal() {
    readHaModalIntoState();
    localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
    PVProPersistentDB.set('ha_config_backup', haConfigState);
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
    try { refreshHomeWeatherAndSensors(true); } catch (e) {}
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
        trackingStartDate: sanitizedCfg.trackingStartDate || haConfigState.trackingStartDate || '2026-11-01',
        batteryName: sanitizedCfg.batteryName || haConfigState.batteryName || 'BYD HVS+',
        entities: { ...haConfigState.entities, ...(sanitizedCfg.entities || {}) },
        pvEnergyExtraEntities: Array.isArray(sanitizedCfg.pvEnergyExtraEntities)
            ? JSON.parse(JSON.stringify(sanitizedCfg.pvEnergyExtraEntities))
            : (haConfigState.pvEnergyExtraEntities || []),
        weatherEntity: typeof sanitizedCfg.weatherEntity === 'string' ? sanitizedCfg.weatherEntity : (haConfigState.weatherEntity || ''),
        outdoorTempEntity: typeof sanitizedCfg.outdoorTempEntity === 'string' ? sanitizedCfg.outdoorTempEntity : (haConfigState.outdoorTempEntity || ''),
        customWeatherSensors: Array.isArray(sanitizedCfg.customWeatherSensors) && sanitizedCfg.customWeatherSensors.length > 0
            ? JSON.parse(JSON.stringify(sanitizedCfg.customWeatherSensors))
            : (haConfigState.customWeatherSensors || []),
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
    try { refreshHomeWeatherAndSensors(true); } catch (e) {}
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

function getFullHaConfigWithTokenForBackup() {
    return JSON.parse(JSON.stringify(haConfigState || {}));
}

function applyFullHaConfigWithTokenFromBackup(fullCfg) {
    if (!fullCfg || typeof fullCfg !== 'object') return;
    const incomingToken = String(fullCfg.accessToken || '').trim();
    const effectiveToken = incomingToken || haConfigState.accessToken || '';
    haConfigState = {
        ...haConfigState,
        mode: fullCfg.mode || haConfigState.mode || 'poll',
        baseUrl: fullCfg.baseUrl || haConfigState.baseUrl,
        accessToken: effectiveToken,
        pollIntervalSec: fullCfg.pollIntervalSec || haConfigState.pollIntervalSec || 10,
        autoSyncMonthly: fullCfg.autoSyncMonthly !== undefined ? fullCfg.autoSyncMonthly : true,
        trackingStartDate: fullCfg.trackingStartDate || haConfigState.trackingStartDate || '2026-11-01',
        batteryName: fullCfg.batteryName || haConfigState.batteryName || 'BYD HVS+',
        entities: { ...haConfigState.entities, ...(fullCfg.entities || {}) },
        pvEnergyExtraEntities: Array.isArray(fullCfg.pvEnergyExtraEntities)
            ? JSON.parse(JSON.stringify(fullCfg.pvEnergyExtraEntities))
            : (haConfigState.pvEnergyExtraEntities || []),
        weatherEntity: typeof fullCfg.weatherEntity === 'string' ? fullCfg.weatherEntity : (haConfigState.weatherEntity || ''),
        outdoorTempEntity: typeof fullCfg.outdoorTempEntity === 'string' ? fullCfg.outdoorTempEntity : (haConfigState.outdoorTempEntity || ''),
        customWeatherSensors: Array.isArray(fullCfg.customWeatherSensors) && fullCfg.customWeatherSensors.length > 0
            ? JSON.parse(JSON.stringify(fullCfg.customWeatherSensors))
            : (haConfigState.customWeatherSensors || []),
        customStrings: Array.isArray(fullCfg.customStrings) && fullCfg.customStrings.length > 0
            ? JSON.parse(JSON.stringify(fullCfg.customStrings))
            : haConfigState.customStrings,
        customConsumers: Array.isArray(fullCfg.customConsumers)
            ? JSON.parse(JSON.stringify(fullCfg.customConsumers))
            : haConfigState.customConsumers,
        loadedFromSharedProject: !effectiveToken
    };
    try {
        localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
    } catch (e) {}
    try {
        fetch('/api/ha/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: haConfigState })
        }).catch(() => {});
    } catch (e) {}
    energyCounterBaselines.lastHistorySyncMs = 0;
    startLiveTelemetryLoop();
    refreshIntradayHistoryAndLive();
    try { refreshHomeWeatherAndSensors(true); } catch (e) {}
}

window.toggleShowAllDashboardConsumers = toggleShowAllDashboardConsumers;
window.getSanitizedHaConfigForProject = getSanitizedHaConfigForProject;
window.applySanitizedHaConfigFromProject = applySanitizedHaConfigFromProject;
window.getFullHaConfigWithTokenForBackup = getFullHaConfigWithTokenForBackup;
window.applyFullHaConfigWithTokenFromBackup = applyFullHaConfigWithTokenFromBackup;
window.getPerformanceRecordsForProject = getPerformanceRecordsForProject;
window.applyPerformanceRecordsFromProject = applyPerformanceRecordsFromProject;
window.getEnergyBaselinesForProject = getEnergyBaselinesForProject;
window.applyEnergyBaselinesFromProject = applyEnergyBaselinesFromProject;

// ============================================================================
// 9. EBENE 0 STARTSEITE (HOME DASHBOARD): WETTER-WIDGET, 5-TAGE-FORECAST & RAUM-SENSOREN
// ============================================================================

let homeWeatherCache = {
    fetchedAtMs: 0,
    lat: null,
    lon: null,
    currentTemp: null,
    currentCode: 3,
    conditionLabel: 'Bewölkt',
    locationLabel: 'Home',
    todayMin: null,
    todayMax: null,
    days: [] // [{ dayShort, code, maxTemp, minTemp, sunHours }]
};

let homeHaStatesCache = new Map(); // entity_id -> state object
let homeSensorMinMaxCache = {
    dayKey: '',
    fetchedAtMs: 0,
    byEntity: {} // entity_id -> { min, max }
};
let homeLastValidClimateValues = {}; // entity_id -> { val: number, unit: string, ts: number }
let chartClimateHistoryModal = null;

function saveInstantBootSnapshot() {
    try {
        const snapshot = {
            savedAtMs: Date.now(),
            telemetry: {
                pvPowerW: currentLiveTelemetry.pvPowerW || 0,
                loadPowerW: currentLiveTelemetry.loadPowerW || 0,
                gridPowerW: currentLiveTelemetry.gridPowerW || 0,
                batteryPowerW: currentLiveTelemetry.batteryPowerW || 0,
                batterySocPct: currentLiveTelemetry.batterySocPct,
                pvEnergyTodayKwh: currentLiveTelemetry.pvEnergyTodayKwh || 0,
                loadEnergyTodayKwh: currentLiveTelemetry.loadEnergyTodayKwh,
                gridImportTodayKwh: currentLiveTelemetry.gridImportTodayKwh,
                gridExportTodayKwh: currentLiveTelemetry.gridExportTodayKwh,
                batteryChargeTodayKwh: currentLiveTelemetry.batteryChargeTodayKwh,
                batteryDischargeTodayKwh: currentLiveTelemetry.batteryDischargeTodayKwh,
                customStringsTelemetry: currentLiveTelemetry.customStringsTelemetry || [],
                consumersTelemetry: currentLiveTelemetry.consumersTelemetry || [],
                connectionOk: Boolean(currentLiveTelemetry.connectionOk)
            },
            weatherCache: homeWeatherCache,
            minMaxCache: homeSensorMinMaxCache,
            lastValidClimate: homeLastValidClimateValues
        };
        localStorage.setItem('pvpro_instant_boot_snapshot', JSON.stringify(snapshot));
        PVProPersistentDB.set('boot_snapshot', snapshot);
    } catch (e) {}
}

function restoreInstantBootSnapshot() {
    try {
        const rawClim = localStorage.getItem('pvpro_climate_last_valid');
        if (rawClim) {
            const parsedClim = JSON.parse(rawClim);
            if (parsedClim && typeof parsedClim === 'object') {
                homeLastValidClimateValues = parsedClim;
            }
        }
    } catch (e) {}

    try {
        const raw = localStorage.getItem('pvpro_instant_boot_snapshot');
        if (!raw) return;
        const snap = JSON.parse(raw);
        if (!snap || typeof snap !== 'object') return;

        if (snap.lastValidClimate && typeof snap.lastValidClimate === 'object') {
            homeLastValidClimateValues = { ...snap.lastValidClimate, ...homeLastValidClimateValues };
        }
        if (snap.weatherCache && typeof snap.weatherCache === 'object' && Array.isArray(snap.weatherCache.days)) {
            homeWeatherCache = { ...homeWeatherCache, ...snap.weatherCache };
        }
        if (snap.minMaxCache && typeof snap.minMaxCache === 'object' && snap.minMaxCache.byEntity) {
            const todayKey = new Date().toISOString().slice(0, 10);
            if (snap.minMaxCache.dayKey === todayKey) {
                homeSensorMinMaxCache = { ...homeSensorMinMaxCache, ...snap.minMaxCache };
            }
        }
        if (snap.telemetry && typeof snap.telemetry === 'object') {
            currentLiveTelemetry = {
                ...currentLiveTelemetry,
                ...snap.telemetry,
                lastError: null
            };
        }
    } catch (e) {}
}

function recordValidClimateReading(entityId, val, unit = '°C') {
    if (!entityId || !Number.isFinite(val)) return;
    homeLastValidClimateValues[entityId] = {
        val: Number(val),
        unit: String(unit || '°C'),
        ts: Date.now()
    };
    try {
        localStorage.setItem('pvpro_climate_last_valid', JSON.stringify(homeLastValidClimateValues));
    } catch (e) {}
}

function getClimateReadingWithFallback(entityId, defaultUnit = '°C') {
    if (!entityId) return { val: NaN, unit: defaultUnit, isCached: false };
    const stObj = homeHaStatesCache.get(entityId);
    const liveUnit = stObj?.attributes?.unit_of_measurement || defaultUnit;
    const rawVal = parseFloat(String(stObj?.state ?? '').replace(',', '.'));
    if (Number.isFinite(rawVal)) {
        recordValidClimateReading(entityId, rawVal, liveUnit);
        return { val: rawVal, unit: liveUnit, isCached: false };
    }
    const cached = homeLastValidClimateValues[entityId];
    if (cached && Number.isFinite(Number(cached.val))) {
        return { val: Number(cached.val), unit: cached.unit || defaultUnit, isCached: true };
    }
    return { val: NaN, unit: liveUnit, isCached: false };
}

function resolveRoomHumidityEntity(ws) {
    if (!ws) return '';
    if (ws.humidityEntity && String(ws.humidityEntity).trim()) {
        return String(ws.humidityEntity).trim();
    }
    const tempEntId = String(ws.entityId || '').trim();
    if (!tempEntId) return '';

    // 1. Direct entity_id pattern match (e.g. sensor.wohnzimmer_temperatur -> sensor.wohnzimmer_luftfeuchtigkeit or _humidity)
    const baseStem = tempEntId
        .replace(/^sensor\./i, '')
        .replace(/_?(temperatur|temperature|temp)$/i, '');

    if (baseStem && baseStem !== tempEntId.replace(/^sensor\./i, '')) {
        const candidates = [
            `sensor.${baseStem}_luftfeuchtigkeit`,
            `sensor.${baseStem}_humidity`,
            `sensor.${baseStem}_feuchte`,
            `sensor.${baseStem}_feuchtigkeit`
        ];
        for (const cand of candidates) {
            if (homeHaStatesCache.has(cand) || homeLastValidClimateValues[cand]) {
                return cand;
            }
        }
    }

    // 2. Friendly name / room name match across discovered % humidity sensors in homeHaStatesCache
    const roomName = String(ws.name || '')
        .replace(/\s+(Temperatur|Temperature|Klima|Sensor).*$/i, '')
        .trim()
        .toLowerCase();

    if (roomName && roomName.length >= 3) {
        for (const [entId, sObj] of homeHaStatesCache.entries()) {
            if (!entId.startsWith('sensor.')) continue;
            const u = String(sObj?.attributes?.unit_of_measurement || '').trim();
            const devClass = String(sObj?.attributes?.device_class || '').toLowerCase();
            if (u !== '%' && devClass !== 'humidity') continue;
            const fn = String(sObj?.attributes?.friendly_name || entId).toLowerCase();
            if (fn.includes(roomName) && /(luftfeucht|feucht|humidity|klima|hygro)/i.test(fn)) {
                return entId;
            }
        }
    }
    return '';
}

function getWeatherSvgIcon(codeOrState, sizeClass = 'w-8 h-8') {
    const s = String(codeOrState ?? '').toLowerCase();
    // Map WMO weather code or HA weather state to crisp vector SVGs matching the reference screenshot
    let type = 'cloudy';
    if (s === '0' || s === '1' || s === 'sunny' || s === 'clear' || s === 'clear-night') {
        type = 'sunny';
    } else if (s === '2' || s === 'partlycloudy' || s === 'windy-variant') {
        type = 'partly';
    } else if (['51', '53', '55', '61', '63', '65', '80', '81', '82', 'rainy', 'pouring', 'lightning-rainy'].includes(s)) {
        type = 'rain';
    } else if (['71', '73', '75', '77', '85', '86', 'snowy', 'snowy-rainy', 'hail'].includes(s)) {
        type = 'snow';
    } else {
        type = 'cloudy';
    }

    if (type === 'sunny') {
        return `<svg class="${sizeClass}" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="10.5" fill="#facc15"/>
        </svg>`;
    }
    if (type === 'partly') {
        return `<svg class="${sizeClass}" viewBox="0 0 44 40" fill="none">
            <circle cx="26" cy="14" r="7.5" fill="#facc15"/>
            <path d="M13 31h17a6.5 6.5 0 0 0 0-13 8.8 8.8 0 0 0-16.9-2.4A6 6 0 0 0 13 31z" fill="#cbd5e1"/>
        </svg>`;
    }
    if (type === 'rain') {
        return `<svg class="${sizeClass}" viewBox="0 0 44 42" fill="none">
            <path d="M13 28h17a6.5 6.5 0 0 0 0-13 8.8 8.8 0 0 0-16.9-2.4A6 6 0 0 0 13 28z" fill="#cbd5e1"/>
            <line x1="16" y1="32" x2="14.5" y2="36.5" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"/>
            <line x1="22" y1="33" x2="20.5" y2="37.5" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"/>
            <line x1="28" y1="32" x2="26.5" y2="36.5" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;
    }
    if (type === 'snow') {
        return `<svg class="${sizeClass}" viewBox="0 0 44 42" fill="none">
            <path d="M13 28h17a6.5 6.5 0 0 0 0-13 8.8 8.8 0 0 0-16.9-2.4A6 6 0 0 0 13 28z" fill="#cbd5e1"/>
            <circle cx="16" cy="34" r="1.8" fill="#38bdf8"/>
            <circle cx="22" cy="36" r="1.8" fill="#38bdf8"/>
            <circle cx="28" cy="34" r="1.8" fill="#38bdf8"/>
        </svg>`;
    }
    return `<svg class="${sizeClass}" viewBox="0 0 44 40" fill="none">
        <path d="M13 30h18a6.8 6.8 0 0 0 0-13.5 9.2 9.2 0 0 0-17.6-2.5A6.2 6.2 0 0 0 13 30z" fill="#cbd5e1"/>
    </svg>`;
}

function mapWeatherConditionLabelDe(codeOrState) {
    const s = String(codeOrState ?? '').toLowerCase();
    const map = {
        '0': 'Sonnig',
        '1': 'Überwiegend klar',
        '2': 'Teilweise bewölkt',
        '3': 'Bewölkt',
        '45': 'Nebel',
        '48': 'Nebel',
        '51': 'Leichter Nieselregen',
        '53': 'Nieselregen',
        '55': 'Starker Nieselregen',
        '61': 'Leichter Regen',
        '63': 'Regen',
        '65': 'Starker Regen',
        '71': 'Leichter Schneefall',
        '73': 'Schneefall',
        '75': 'Starker Schneefall',
        '80': 'Regenschauer',
        '81': 'Regenschauer',
        '82': 'Kräftige Schauer',
        '95': 'Gewitter',
        'sunny': 'Sonnig',
        'clear-night': 'Klar',
        'partlycloudy': 'Teilweise bewölkt',
        'cloudy': 'Bewölkt',
        'rainy': 'Regnerisch',
        'pouring': 'Starkregen',
        'snowy': 'Schneefall',
        'fog': 'Neblig',
        'windy': 'Windig',
        'lightning': 'Gewitter',
        'lightning-rainy': 'Gewitterregen'
    };
    return map[s] || 'Bewölkt';
}

function updateHomeGreetingHeader() {
    const hr = new Date().getHours();
    let greeting = 'Guten Tag';
    if (hr >= 5 && hr < 11) greeting = 'Guten Morgen';
    else if (hr >= 11 && hr < 18) greeting = 'Guten Tag';
    else greeting = 'Guten Abend';

    setElText('homeGreetingTitle', greeting);
}

function updateHomeEnergyOverview(baseline) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const t = currentLiveTelemetry || {};

    const pvW = Math.max(0, Number(t.pvPowerW || 0));
    const loadW = Math.max(0, Number(t.loadPowerW || 0));
    const gridW = Number(t.gridPowerW || 0); // >0 Bezug, <0 Einspeisung
    const batW = Number(t.batteryPowerW || 0); // >0 Lädt, <0 Entlädt

    // 1. Live Autarky Percentage & Flow Summary Headline
    const gridImportW = Math.max(0, gridW);
    const liveAutarkyPct = loadW > 10
        ? Math.max(0, Math.min(100, Math.round(((loadW - gridImportW) / loadW) * 100)))
        : (pvW > 10 ? 100 : 0);

    setElText('home_autarky_badge', `${liveAutarkyPct} % Autark`);

    let summaryText = 'Live-Energiebilanz im Haus';
    if (pvW > loadW + 40) {
        if (batW > 30) summaryText = `PV-Überschuss lädt Speicher (${formatPowerDe(batW, true)})`;
        else if (gridW < -30) summaryText = `PV-Überschuss speist ins Netz (${formatPowerDe(Math.abs(gridW), true)})`;
        else summaryText = 'PV deckt den gesamten Hausverbrauch';
    } else if (pvW > 20) {
        summaryText = `PV liefert ${formatPowerDe(pvW, true)} direkt ins Haus`;
    } else if (batW < -20) {
        summaryText = `Speicher versorgt das Haus (${formatPowerDe(Math.abs(batW), true)})`;
    } else if (gridW > 20) {
        summaryText = `Netzbezug aktiv (${formatPowerDe(gridW, true)})`;
    }
    setElText('home_energy_flow_summary', summaryText);

    // 2. 4-Column Compact Horizontal Strip Values
    setElText('home_pv_power', formatPowerDe(pvW, pvW < 1000));
    setElText('home_pv_sub', pvW > 15 ? 'Erzeugung' : '0 W (Ruhe)');

    setElText('home_load_power', formatPowerDe(loadW, loadW < 1000));
    setElText('home_load_sub', 'Hauslast AC');

    const batTitle = haConfigState.batteryName || baseline.detectedBatteryName || 'Speicher';
    setElText('home_bat_title', batTitle);
    const socNum = t.batterySocPct !== null && t.batterySocPct !== undefined ? Number(t.batterySocPct) : 0;
    const socFormatted = t.batterySocPct !== null && t.batterySocPct !== undefined
        ? `${socNum.toLocaleString('de-DE', { minimumFractionDigits: socNum % 1 !== 0 ? 1 : 0, maximumFractionDigits: 1 })} %`
        : '0 %';
    setElText('home_bat_soc', socFormatted);

    let batSub = 'Standby';
    if (batW > 15) batSub = `+${formatPowerDe(batW, true)}`;
    else if (batW < -15) batSub = `-${formatPowerDe(Math.abs(batW), true)}`;
    setElText('home_bat_sub', batSub);

    const absGridW = Math.abs(gridW);
    setElText('home_grid_power', formatPowerDe(absGridW, absGridW < 1000));
    setElText('home_grid_sub', gridW < -15 ? 'Einspeisung' : 'Netzbezug');

    // 3. Multi-segment Horizontal Energy Distribution Bar
    const totalActivityW = Math.max(100, pvW + loadW + Math.abs(batW) + absGridW);
    const pvBarPct = Math.max(pvW > 10 ? 8 : 0, Math.round((pvW / totalActivityW) * 100));
    const loadBarPct = Math.max(loadW > 10 ? 12 : 4, Math.round((loadW / totalActivityW) * 100));
    const batBarPct = Math.max(Math.abs(batW) > 10 ? 8 : 4, Math.round((Math.abs(batW) / totalActivityW) * 100));
    const gridBarPct = Math.max(0, 100 - pvBarPct - loadBarPct - batBarPct);

    const pvBar = document.getElementById('home_pv_bar');
    if (pvBar) pvBar.style.width = `${pvBarPct}%`;
    const loadBar = document.getElementById('home_load_bar');
    if (loadBar) loadBar.style.width = `${loadBarPct}%`;
    const batBar = document.getElementById('home_bat_bar');
    if (batBar) batBar.style.width = `${batBarPct}%`;
    const gridBar = document.getElementById('home_grid_bar');
    if (gridBar) gridBar.style.width = `${gridBarPct}%`;
}

function updateHomeStatesFromHaArray(statesArray) {
    if (!Array.isArray(statesArray)) return;
    homeHaStatesCache.clear();
    statesArray.forEach(s => {
        if (s && s.entity_id) {
            homeHaStatesCache.set(s.entity_id, s);
            const u = String(s.attributes?.unit_of_measurement || '').trim();
            if (u === '°C' || u === '%') {
                const num = parseFloat(String(s.state ?? '').replace(',', '.'));
                if (Number.isFinite(num)) {
                    recordValidClimateReading(s.entity_id, num, u);
                }
            }
        }
    });

    let configChanged = false;

    // Auto-discover weather.* entity if user has not explicitly set one
    if (!haConfigState.weatherEntity) {
        const foundWeather = statesArray.find(s => s && typeof s.entity_id === 'string' && s.entity_id.startsWith('weather.'));
        if (foundWeather) {
            haConfigState.weatherEntity = foundWeather.entity_id;
            configChanged = true;
        }
    }

    // Auto-seed default room temperature sensors (e.g. Wohnzimmer, Esszimmer) if user has none configured yet
    if (!Array.isArray(haConfigState.customWeatherSensors) || haConfigState.customWeatherSensors.length === 0) {
        const roomCandidates = statesArray.filter(s => {
            if (!s || !s.entity_id || !s.entity_id.startsWith('sensor.')) return false;
            const u = String(s.attributes?.unit_of_measurement || '').trim();
            if (u !== '°C') return false;
            const fn = String(s.attributes?.friendly_name || s.entity_id);
            return /(wohnzimmer|esszimmer|schlafzimmer|k[uü]che|bad|b[uü]ro|kinderzimmer|aussen|außen|garten|terrasse)/i.test(fn);
        });
        if (roomCandidates.length > 0) {
            haConfigState.customWeatherSensors = roomCandidates.slice(0, 4).map((s, idx) => {
                const rawName = String(s.attributes?.friendly_name || s.entity_id)
                    .replace(/\s+(Temperatur|Temperature|Klima|Sensor).*$/i, '')
                    .trim();
                const icon = /esszimmer/i.test(rawName) ? 'table_restaurant'
                    : (/schlaf/i.test(rawName) ? 'bed'
                    : (/(aussen|außen|garten|terrasse)/i.test(rawName) ? 'thermostat' : 'weekend'));
                const wsItem = {
                    id: `ws_auto_${idx}`,
                    name: rawName || `Raum ${idx + 1}`,
                    entityId: s.entity_id,
                    humidityEntity: '',
                    icon
                };
                wsItem.humidityEntity = resolveRoomHumidityEntity(wsItem);
                return wsItem;
            });
            configChanged = true;
        }
    } else {
        // Auto-populate humidityEntity if empty and a matching room humidity sensor exists
        haConfigState.customWeatherSensors.forEach(ws => {
            if (ws && !ws.humidityEntity) {
                const matchedHum = resolveRoomHumidityEntity(ws);
                if (matchedHum) {
                    ws.humidityEntity = matchedHum;
                    configChanged = true;
                }
            }
        });
    }

    if (configChanged) {
        try {
            localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
        } catch (e) {}
    }

    renderHomeWeatherWidget();
    renderHomeCustomWeatherSensors();
    syncHomeRoomSensorsMinMaxFromHistory();
}

async function syncHomeRoomSensorsMinMaxFromHistory() {
    if (!haConfigState.baseUrl || !haConfigState.accessToken) return;
    const sensorIds = [];
    (haConfigState.customWeatherSensors || []).forEach(x => {
        if (x?.entityId) sensorIds.push(String(x.entityId).trim());
        const humId = resolveRoomHumidityEntity(x);
        if (humId) sensorIds.push(humId);
    });
    if (haConfigState.outdoorTempEntity) sensorIds.push(haConfigState.outdoorTempEntity.trim());
    const validIds = [...new Set(sensorIds.filter(Boolean))];
    if (validIds.length === 0) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    if (homeSensorMinMaxCache.dayKey === todayKey && (Date.now() - homeSensorMinMaxCache.fetchedAtMs) < 120000) {
        return;
    }

    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
        const endpoint = `/api/history/period/${encodeURIComponent(startOfDay)}?filter_entity_id=${encodeURIComponent(validIds.join(','))}&minimal_response&no_attributes`;
        const res = await fetchHaDirectFromBrowser(haConfigState.baseUrl, haConfigState.accessToken, endpoint);
        if (res && res.ok && Array.isArray(res.data)) {
            res.data.forEach(arr => {
                if (!Array.isArray(arr) || arr.length === 0) return;
                const entId = arr[0]?.entity_id;
                if (!entId) return;
                let minV = Infinity;
                let maxV = -Infinity;
                let lastValidNum = NaN;
                arr.forEach(pt => {
                    const num = parseFloat(String(pt.state).replace(',', '.'));
                    if (Number.isFinite(num)) {
                        if (num < minV) minV = num;
                        if (num > maxV) maxV = num;
                        lastValidNum = num;
                    }
                });
                if (Number.isFinite(minV) && Number.isFinite(maxV)) {
                    homeSensorMinMaxCache.byEntity[entId] = { min: minV, max: maxV };
                }
                // If live sensor state was temporarily unavailable, seed from latest valid history point!
                if (Number.isFinite(lastValidNum) && !homeLastValidClimateValues[entId]) {
                    const defaultUnit = /humidity|feucht/i.test(entId) ? '%' : '°C';
                    recordValidClimateReading(entId, lastValidNum, defaultUnit);
                }
            });
            homeSensorMinMaxCache.dayKey = todayKey;
            homeSensorMinMaxCache.fetchedAtMs = Date.now();
            renderHomeWeatherWidget();
            renderHomeCustomWeatherSensors();
            saveInstantBootSnapshot();
        }
    } catch (e) {}
}

async function fetchOpenMeteoForecastForHome(force = false) {
    const loc = (typeof LocationData !== 'undefined' && LocationData) ? LocationData : { lat: 48.06, lon: 8.46, name: 'Home' };
    const lat = Number(loc.lat) || 48.06;
    const lon = Number(loc.lon) || 8.46;

    if (!force && homeWeatherCache.fetchedAtMs > 0 && (Date.now() - homeWeatherCache.fetchedAtMs) < 900000 && homeWeatherCache.lat === lat && homeWeatherCache.lon === lon) {
        renderHomeWeatherWidget();
        return;
    }

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunshine_duration&timezone=auto&forecast_days=5`;
        const resp = await fetch(url);
        if (resp.ok) {
            const data = await resp.json();
            const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
            const daily = data.daily || {};
            const times = daily.time || [];
            const days = times.slice(0, 5).map((dateStr, idx) => {
                const dt = new Date(dateStr + 'T12:00:00');
                const sunSec = Number(daily.sunshine_duration?.[idx] || 0);
                return {
                    dayShort: dayNames[dt.getDay()] || dateStr.slice(5),
                    code: daily.weather_code?.[idx] ?? 3,
                    maxTemp: daily.temperature_2m_max?.[idx] ?? null,
                    minTemp: daily.temperature_2m_min?.[idx] ?? null,
                    sunHours: +(sunSec / 3600).toFixed(1)
                };
            });

            homeWeatherCache = {
                fetchedAtMs: Date.now(),
                lat,
                lon,
                currentTemp: data.current?.temperature_2m ?? (days[0]?.maxTemp ?? null),
                currentCode: data.current?.weather_code ?? (days[0]?.code ?? 3),
                conditionLabel: mapWeatherConditionLabelDe(data.current?.weather_code ?? 3),
                locationLabel: 'Home',
                todayMin: days[0]?.minTemp ?? null,
                todayMax: days[0]?.maxTemp ?? null,
                days
            };
            renderHomeWeatherWidget();
            saveInstantBootSnapshot();
        }
    } catch (e) {
        renderHomeWeatherWidget();
    }
}

function renderHomeWeatherWidget() {
    const fmtDeg = (v) => (v !== null && v !== undefined && Number.isFinite(Number(v)))
        ? Number(v).toLocaleString('de-DE', { minimumFractionDigits: Number(v) % 1 !== 0 ? 1 : 0, maximumFractionDigits: 1 })
        : '--,-';

    let condCodeOrState = homeWeatherCache.currentCode;
    let condLabel = homeWeatherCache.conditionLabel || 'Bewölkt';
    let locLabel = 'Home';
    let curTemp = homeWeatherCache.currentTemp;
    let todayMin = homeWeatherCache.todayMin;
    let todayMax = homeWeatherCache.todayMax;

    // Override with live Home Assistant weather.* entity or outdoor temperature sensor if available
    if (haConfigState.weatherEntity && homeHaStatesCache.has(haConfigState.weatherEntity)) {
        const wState = homeHaStatesCache.get(haConfigState.weatherEntity);
        if (wState && wState.state && wState.state !== 'unavailable' && wState.state !== 'unknown') {
            condCodeOrState = wState.state;
            condLabel = mapWeatherConditionLabelDe(wState.state);
        }
        if (wState?.attributes?.temperature !== undefined) {
            const haT = parseFloat(wState.attributes.temperature);
            if (Number.isFinite(haT)) curTemp = haT;
        }
        if (wState?.attributes?.friendly_name) {
            locLabel = String(wState.attributes.friendly_name).replace(/^Forecast\s+/i, '').trim() || 'Home';
        }
    }

    if (haConfigState.outdoorTempEntity) {
        const outReading = getClimateReadingWithFallback(haConfigState.outdoorTempEntity, '°C');
        if (Number.isFinite(outReading.val)) {
            curTemp = outReading.val;
            const mm = homeSensorMinMaxCache.byEntity[haConfigState.outdoorTempEntity];
            if (mm) {
                todayMin = mm.min;
                todayMax = mm.max;
            }
        }
    }

    if (curTemp !== null && todayMin !== null && todayMax !== null) {
        todayMin = Math.min(Number(todayMin), Number(curTemp));
        todayMax = Math.max(Number(todayMax), Number(curTemp));
    }

    const iconWrap = document.getElementById('homeWeatherMainIconWrap');
    if (iconWrap) iconWrap.innerHTML = getWeatherSvgIcon(condCodeOrState, 'w-12 h-12');
    setElText('homeWeatherConditionText', condLabel);
    setElText('homeWeatherLocationText', locLabel);
    setElText('homeWeatherCurrentTemp', `${fmtDeg(curTemp)} °C`);
    setElText('homeWeatherMinMaxText', `${fmtDeg(todayMin)} °C / ${fmtDeg(todayMax)} °C`);

    const forecastGrid = document.getElementById('homeWeatherForecastGrid');
    if (forecastGrid) {
        const days = (homeWeatherCache.days && homeWeatherCache.days.length > 0)
            ? homeWeatherCache.days
            : ['Do', 'Fr', 'Sa', 'So', 'Mo'].map(d => ({ dayShort: d, code: 2, maxTemp: null, minTemp: null }));

        forecastGrid.innerHTML = days.map(d => `
            <div class="flex flex-col items-center">
                <span class="text-[13.5px] font-medium text-slate-600 dark:text-slate-300">${escapeHtml(d.dayShort)}</span>
                <div class="my-2 flex items-center justify-center">
                    ${getWeatherSvgIcon(d.code, 'w-8 h-8')}
                </div>
                <span class="text-[15.5px] font-medium text-slate-900 dark:text-white tabular-nums">${fmtDeg(d.maxTemp)}°</span>
                <span class="text-[13.5px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">${fmtDeg(d.minTemp)}°</span>
            </div>
        `).join('');
    }
}

function getRoomClimateIcon(ws) {
    if (ws && ws.icon && ws.icon !== 'auto') return ws.icon;
    const n = String(ws?.name || '').toLowerCase();
    if (/esszimmer|esstisch/.test(n)) return 'table_restaurant';
    if (/schlaf/.test(n)) return 'bed';
    if (/k[uü]che/.test(n)) return 'kitchen';
    if (/bad|dusche|wc/.test(n)) return 'bathtub';
    if (/b[uü]ro|arbeit/.test(n)) return 'computer';
    if (/kind/.test(n)) return 'child_care';
    if (/keller|technik|hwr|garage/.test(n)) return 'foundation';
    if (/aussen|außen|garten|terrasse|balkon/.test(n)) return 'thermostat';
    if (/wohn/.test(n)) return 'weekend';
    return 'device_thermostat';
}

function renderHomeCustomWeatherSensors() {
    const grid = document.getElementById('homeCustomWeatherGrid');
    if (!grid) return;

    const list = Array.isArray(haConfigState.customWeatherSensors) ? haConfigState.customWeatherSensors : [];
    if (list.length === 0) {
        grid.innerHTML = `
            <div onclick="openHaConfigModal('climate')" role="button" tabindex="0"
                class="col-span-2 dash-sub-tile rounded-[20px] p-4 flex items-center justify-between gap-3 cursor-pointer hover:ring-2 hover:ring-teal-400/40 transition-all">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 rounded-2xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                        <span class="material-symbols-rounded text-xl">device_thermostat</span>
                    </div>
                    <div class="min-w-0">
                        <p class="text-[14px] font-semibold text-slate-900 dark:text-white truncate">Eigene Raum- &amp; Klimasensoren einbinden</p>
                        <p class="text-[12.5px] text-slate-500 dark:text-slate-400 truncate">z. B. Wohnzimmer, Esszimmer (°C &amp; % Luftfeuchte) aus Home Assistant</p>
                    </div>
                </div>
                <span class="material-symbols-rounded text-slate-400 shrink-0">add_circle</span>
            </div>`;
        return;
    }

    grid.innerHTML = list.map((ws, idx) => {
        const entId = String(ws.entityId || '').trim();
        const tempReading = getClimateReadingWithFallback(entId, '°C');
        const unit = tempReading.unit || '°C';
        const rawVal = tempReading.val;
        const valText = Number.isFinite(rawVal)
            ? `${rawVal.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`
            : '—';

        // Resolve optional / auto-matched humidity sensor for this room
        const humEntId = resolveRoomHumidityEntity(ws);
        const humReading = humEntId ? getClimateReadingWithFallback(humEntId, '%') : { val: NaN, unit: '%' };
        const hasHumidity = Number.isFinite(humReading.val);
        const humBadgeHtml = hasHumidity
            ? `<div class="pl-2.5 border-l border-slate-200/80 dark:border-white/10 flex items-center shrink-0">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/10 dark:bg-sky-400/15 border border-sky-500/20 text-sky-700 dark:text-sky-300 text-[12.5px] font-semibold tabular-nums" title="Relative Luftfeuchtigkeit (${escapeHtml(humEntId)})">
                    <span class="material-symbols-rounded text-[13.5px]">water_drop</span>
                    <span>${Math.round(humReading.val)} %</span>
                </span>
               </div>`
            : '';

        const mm = entId ? homeSensorMinMaxCache.byEntity[entId] : null;
        let subHtml = `<span class="text-slate-400 dark:text-slate-500">${entId ? 'Tippen für 24h-Kurve' : 'Sensor in Einstellungen wählen'}</span>`;
        if (mm && Number.isFinite(mm.min) && Number.isFinite(mm.max)) {
            const minVal = Number.isFinite(rawVal) ? Math.min(mm.min, rawVal) : mm.min;
            const maxVal = Number.isFinite(rawVal) ? Math.max(mm.max, rawVal) : mm.max;
            const degSuffix = unit === '°C' ? '°' : ` ${unit}`;
            subHtml = `
                <span class="inline-flex items-center gap-1">
                    <span class="text-slate-400 dark:text-slate-500">Min</span>
                    <span class="font-medium text-slate-700 dark:text-slate-300">${minVal.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${degSuffix}</span>
                </span>
                <span class="text-slate-300 dark:text-slate-600">·</span>
                <span class="inline-flex items-center gap-1">
                    <span class="text-slate-400 dark:text-slate-500">Max</span>
                    <span class="font-medium text-slate-700 dark:text-slate-300">${maxVal.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${degSuffix}</span>
                </span>`;
        }

        const iconName = getRoomClimateIcon(ws);

        return `
        <div onclick="openClimateHistoryModal(${idx})" role="button" tabindex="0" title="Tippen für 24h Temperatur- &amp; Feuchte-Verlauf (${escapeHtml(ws.name || `Raum ${idx + 1}`)})"
            class="dash-sub-tile rounded-[20px] p-3.5 sm:p-4 flex flex-col justify-between min-h-[124px] cursor-pointer hover:ring-2 hover:ring-primary/40 active:scale-[0.99] transition-all group">
            <div>
                <div class="flex items-center justify-between gap-1.5">
                    <div class="flex items-center gap-2 text-[14px] font-medium text-slate-700 dark:text-slate-200 min-w-0">
                        <span class="material-symbols-rounded text-primary text-[19px] shrink-0">${escapeHtml(iconName)}</span>
                        <span class="truncate">${escapeHtml(ws.name || `Raum ${idx + 1}`)}</span>
                    </div>
                    <span class="material-symbols-rounded text-[15px] text-slate-400 group-hover:text-primary transition-colors shrink-0">show_chart</span>
                </div>
                <div class="mt-3 flex items-center justify-between gap-2">
                    <p class="text-[23px] sm:text-[25px] font-bold text-slate-900 dark:text-white tabular-nums tracking-tight leading-none">${escapeHtml(valText)}</p>
                    ${humBadgeHtml}
                </div>
            </div>
            <div class="pt-2 mt-2.5 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between gap-1.5 text-[12px] tabular-nums truncate">
                <div class="flex items-center gap-1.5 truncate">${subHtml}</div>
            </div>
        </div>`;
    }).join('');
}

// ============================================================================
// 9B. 24-STUNDEN KLIMA- & TEMPERATUR-VERLAUFSKURVE POPUP MODAL
// ============================================================================

async function openClimateHistoryModal(sensorIndex) {
    const list = Array.isArray(haConfigState.customWeatherSensors) ? haConfigState.customWeatherSensors : [];
    const ws = list[sensorIndex];
    if (!ws) return;

    const modal = document.getElementById('modal-climate-curve');
    if (!modal) return;

    const tempEntId = String(ws.entityId || '').trim();
    const humEntId = resolveRoomHumidityEntity(ws);
    const roomTitle = ws.name || `Raum ${sensorIndex + 1}`;
    const iconName = getRoomClimateIcon(ws);

    setElText('climateModalTitle', roomTitle);
    setElText('climateModalIcon', iconName);
    setElText('climateModalSubtitle', '24-Stunden Verlauf · Temperatur & Luftfeuchtigkeit');

    const tempNow = getClimateReadingWithFallback(tempEntId, '°C');
    const humNow = humEntId ? getClimateReadingWithFallback(humEntId, '%') : { val: NaN, unit: '%' };
    const mm = tempEntId ? homeSensorMinMaxCache.byEntity[tempEntId] : null;

    const fmt1 = (n) => Number.isFinite(n) ? n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '--,-';
    const unitStr = tempNow.unit || '°C';

    // Populate the 4 exact KPI box IDs in #modal-climate-curve immediately from cache
    setElText('climateModalCurrentTemp', Number.isFinite(tempNow.val) ? `${fmt1(tempNow.val)} ${unitStr}` : `--,- ${unitStr}`);
    setElText('climateModalCurrentHum', Number.isFinite(humNow.val) ? `${Math.round(humNow.val)} %` : '— %');
    setElText('climateModalMinTemp', mm && Number.isFinite(mm.min)
        ? `${fmt1(mm.min)} ${unitStr}`
        : (Number.isFinite(tempNow.val) ? `${fmt1(tempNow.val)} ${unitStr}` : `--,- ${unitStr}`));
    setElText('climateModalMaxTemp', mm && Number.isFinite(mm.max)
        ? `${fmt1(mm.max)} ${unitStr}`
        : (Number.isFinite(tempNow.val) ? `${fmt1(tempNow.val)} ${unitStr}` : `--,- ${unitStr}`));

    modal.classList.remove('hidden');

    const filterIds = [tempEntId, humEntId].filter(Boolean);
    const roomCacheKey = `${tempEntId}__${humEntId || ''}`;
    let tempPoints = [];
    let humPoints = [];

    // Immediately render cached 24h curve from IndexedDB if available while fresh data loads
    const cachedRoomCurve = climateHistoryCacheByRoom[roomCacheKey];
    if (cachedRoomCurve && Array.isArray(cachedRoomCurve.tempPoints) && cachedRoomCurve.tempPoints.length > 0) {
        tempPoints = cachedRoomCurve.tempPoints;
        humPoints = Array.isArray(cachedRoomCurve.humPoints) ? cachedRoomCurve.humPoints : [];
        renderClimateHistoryChartCanvas(tempPoints, humPoints, tempNow.val, humNow.val);
    }

    if (haConfigState.baseUrl && haConfigState.accessToken && filterIds.length > 0) {
        try {
            const start24h = new Date(Date.now() - 24 * 3600000).toISOString();
            const endpoint = `/api/history/period/${encodeURIComponent(start24h)}?filter_entity_id=${encodeURIComponent(filterIds.join(','))}&minimal_response&no_attributes`;
            const res = await fetchHaDirectFromBrowser(haConfigState.baseUrl, haConfigState.accessToken, endpoint);
            if (res && res.ok && Array.isArray(res.data)) {
                let freshTempPts = [];
                let freshHumPts = [];
                res.data.forEach(seriesArr => {
                    if (!Array.isArray(seriesArr) || seriesArr.length === 0) return;
                    const eid = seriesArr[0]?.entity_id;
                    const parsedPts = [];
                    seriesArr.forEach(pt => {
                        const val = parseFloat(String(pt.state ?? '').replace(',', '.'));
                        const ts = new Date(pt.last_changed || pt.last_updated || Date.now()).getTime();
                        if (Number.isFinite(val) && Number.isFinite(ts)) {
                            parsedPts.push({ ts, val });
                        }
                    });
                    if (eid === tempEntId) freshTempPts = parsedPts;
                    else if (eid === humEntId) freshHumPts = parsedPts;
                });
                if (freshTempPts.length > 0 || freshHumPts.length > 0) {
                    tempPoints = freshTempPts.length > 0 ? freshTempPts : tempPoints;
                    humPoints = freshHumPts.length > 0 ? freshHumPts : humPoints;
                    climateHistoryCacheByRoom[roomCacheKey] = {
                        savedAtMs: Date.now(),
                        tempPoints,
                        humPoints
                    };
                    PVProPersistentDB.set('climate_history_cache', climateHistoryCacheByRoom);
                }
            }
        } catch (e) {}
    }

    // Update all 4 KPI boxes directly from the fetched 24h curve so they are NEVER empty when the chart has data!
    let effTempNow = tempNow.val;
    let effHumNow = humNow.val;

    if (tempPoints.length > 0) {
        let min24 = Infinity;
        let max24 = -Infinity;
        tempPoints.forEach(p => {
            if (p.val < min24) min24 = p.val;
            if (p.val > max24) max24 = p.val;
        });
        const latestTempPt = tempPoints[tempPoints.length - 1].val;
        if (!Number.isFinite(effTempNow) && Number.isFinite(latestTempPt)) {
            effTempNow = latestTempPt;
            if (tempEntId) recordValidClimateReading(tempEntId, latestTempPt, unitStr);
        }
        if (Number.isFinite(effTempNow)) {
            min24 = Math.min(min24, effTempNow);
            max24 = Math.max(max24, effTempNow);
            setElText('climateModalCurrentTemp', `${fmt1(effTempNow)} ${unitStr}`);
        }
        if (Number.isFinite(min24) && Number.isFinite(max24)) {
            if (tempEntId) homeSensorMinMaxCache.byEntity[tempEntId] = { min: min24, max: max24 };
            setElText('climateModalMinTemp', `${fmt1(min24)} ${unitStr}`);
            setElText('climateModalMaxTemp', `${fmt1(max24)} ${unitStr}`);
        }
    }

    if (humPoints.length > 0) {
        const latestHumPt = humPoints[humPoints.length - 1].val;
        if (!Number.isFinite(effHumNow) && Number.isFinite(latestHumPt)) {
            effHumNow = latestHumPt;
            if (humEntId) recordValidClimateReading(humEntId, latestHumPt, '%');
        }
        if (Number.isFinite(effHumNow)) {
            setElText('climateModalCurrentHum', `${Math.round(effHumNow)} %`);
        }
    }

    renderHomeCustomWeatherSensors();
    renderClimateHistoryChartCanvas(tempPoints, humPoints, effTempNow, effHumNow);
}

function closeClimateHistoryModal() {
    const modal = document.getElementById('modal-climate-curve');
    if (modal) modal.classList.add('hidden');
}

function renderClimateHistoryChartCanvas(tempPoints, humPoints, fallbackTemp, fallbackHum) {
    const canvas = document.getElementById('climateHistoryChartCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    if (chartClimateHistoryModal) {
        try { chartClimateHistoryModal.destroy(); } catch (e) {}
        chartClimateHistoryModal = null;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const ctx = canvas.getContext('2d');

    // Build 15-minute buckets over the last 24 hours (96 buckets)
    const nowMs = Date.now();
    const startMs = nowMs - 24 * 3600000;
    const stepMs = 15 * 60000;
    const bucketCount = 96;

    const labels = [];
    const tempSeries = [];
    const humSeries = [];

    const sampleSeriesAtBuckets = (pts, fallbackVal) => {
        if (!Array.isArray(pts) || pts.length === 0) {
            return Array.from({ length: bucketCount }, () => (Number.isFinite(fallbackVal) ? fallbackVal : null));
        }
        const sorted = [...pts].sort((a, b) => a.ts - b.ts);
        let ptr = 0;
        let lastKnown = sorted[0].val;
        const out = [];
        for (let i = 0; i < bucketCount; i++) {
            const bEnd = startMs + (i + 1) * stepMs;
            let sum = 0;
            let cnt = 0;
            while (ptr < sorted.length && sorted[ptr].ts <= bEnd) {
                lastKnown = sorted[ptr].val;
                sum += sorted[ptr].val;
                cnt++;
                ptr++;
            }
            out.push(cnt > 0 ? +(sum / cnt).toFixed(2) : +(lastKnown).toFixed(2));
        }
        return out;
    };

    for (let i = 0; i < bucketCount; i++) {
        const tMs = startMs + (i + 1) * stepMs;
        const d = new Date(tMs);
        labels.push(d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
    }

    const tArr = sampleSeriesAtBuckets(tempPoints, fallbackTemp);
    const hArr = (humPoints.length > 0 || Number.isFinite(fallbackHum))
        ? sampleSeriesAtBuckets(humPoints, fallbackHum)
        : [];

    tempSeries.push(...tArr);
    humSeries.push(...hArr);

    const tempGrad = ctx.createLinearGradient(0, 0, 0, 240);
    tempGrad.addColorStop(0, isDark ? 'rgba(20, 184, 166, 0.34)' : 'rgba(13, 148, 136, 0.25)');
    tempGrad.addColorStop(1, 'rgba(20, 184, 166, 0.0)');

    const datasets = [
        {
            label: 'Temperatur (°C)',
            data: tempSeries,
            borderColor: '#14b8a6',
            backgroundColor: tempGrad,
            yAxisID: 'yTemp',
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.35,
            fill: true
        }
    ];

    const hasHum = humSeries.some(v => v !== null && Number.isFinite(v));
    if (hasHum) {
        datasets.push({
            label: 'Luftfeuchte (%)',
            data: humSeries,
            borderColor: '#0ea5e9',
            backgroundColor: 'transparent',
            yAxisID: 'yHum',
            borderWidth: 2,
            borderDash: [4, 3],
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.35,
            fill: false
        });
    }

    chartClimateHistoryModal = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)',
                    titleColor: isDark ? '#f8fafc' : '#0f172a',
                    bodyColor: isDark ? '#cbd5e1' : '#334155',
                    borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(203, 213, 225, 0.9)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: (ctxItem) => {
                            const val = ctxItem.parsed.y;
                            if (val === null || val === undefined) return '';
                            const unit = ctxItem.dataset.yAxisID === 'yHum' ? ' %' : ' °C';
                            return `${ctxItem.dataset.label}: ${Number(val).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unit}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: isDark ? 'rgba(148, 163, 184, 0.06)' : 'rgba(100, 116, 139, 0.10)', drawBorder: false },
                    ticks: {
                        color: isDark ? '#94a3b8' : '#64748b',
                        maxTicksLimit: 7,
                        font: { family: 'JetBrains Mono, monospace', size: 10 }
                    }
                },
                yTemp: {
                    type: 'linear',
                    position: 'left',
                    grid: { color: isDark ? 'rgba(148, 163, 184, 0.09)' : 'rgba(100, 116, 139, 0.12)', drawBorder: false },
                    ticks: {
                        color: isDark ? '#5eead4' : '#0f766e',
                        font: { family: 'JetBrains Mono, monospace', size: 10 },
                        callback: (v) => `${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 1 })} °C`
                    }
                },
                yHum: {
                    type: 'linear',
                    position: 'right',
                    display: hasHum,
                    suggestedMin: 25,
                    suggestedMax: 75,
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: isDark ? '#38bdf8' : '#0284c7',
                        font: { family: 'JetBrains Mono, monospace', size: 10 },
                        callback: (v) => `${Math.round(v)} %`
                    }
                }
            }
        }
    });
}

function renderHaWeatherSensorsEditor() {
    const container = document.getElementById('haWeatherSensorsMappingContainer');
    if (!container) return;

    const list = Array.isArray(haConfigState.customWeatherSensors) ? haConfigState.customWeatherSensors : [];
    if (list.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 py-1.5">Noch keine eigenen Raum-/Klimasensoren hinterlegt. Klicke oben rechts auf „+ Raum hinzufügen“.</p>`;
        return;
    }

    const iconOptions = [
        { val: 'auto', label: 'Symbol: Automatisch (aus Raumname)' },
        { val: 'weekend', label: 'Sofa (Wohnzimmer)' },
        { val: 'table_restaurant', label: 'Esstisch (Esszimmer)' },
        { val: 'bed', label: 'Bett (Schlafzimmer)' },
        { val: 'kitchen', label: 'Küche' },
        { val: 'bathtub', label: 'Bad / Dusche' },
        { val: 'computer', label: 'Büro / Arbeitszimmer' },
        { val: 'child_care', label: 'Kinderzimmer' },
        { val: 'foundation', label: 'Keller / Technik' },
        { val: 'thermostat', label: 'Außen / Garten' },
        { val: 'device_thermostat', label: 'Thermometer (Standard)' }
    ];

    container.innerHTML = list.map((ws, idx) => {
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(ws.name || '') : (ws.name || '');
        const safeEnt = typeof escapeHtml === 'function' ? escapeHtml(ws.entityId || '') : (ws.entityId || '');
        const resolvedHum = ws.humidityEntity || resolveRoomHumidityEntity(ws) || '';
        const safeHumEnt = typeof escapeHtml === 'function' ? escapeHtml(resolvedHum) : resolvedHum;
        const curIcon = ws.icon || 'auto';
        const previewIcon = getRoomClimateIcon(ws);

        const iconSelectHtml = iconOptions.map(opt =>
            `<option value="${opt.val}" ${curIcon === opt.val ? 'selected' : ''}>${opt.label}</option>`
        ).join('');

        return `
        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <div class="flex items-center gap-2 flex-1 min-w-[180px]">
                    <span class="w-8 h-8 rounded-lg bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                        <span class="material-symbols-rounded text-lg">${escapeHtml(previewIcon)}</span>
                    </span>
                    <input type="text" value="${safeName}" oninput="updateHaCustomWeatherSensorField(${idx}, 'name', this.value)"
                        placeholder="Raum / Name (z. B. Wohnzimmer)"
                        class="flex-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                </div>
                <div class="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                    <select onchange="updateHaCustomWeatherSensorField(${idx}, 'icon', this.value); renderHaWeatherSensorsEditor();"
                        class="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 outline-none focus:border-teal-500 cursor-pointer">
                        ${iconSelectHtml}
                    </select>
                    <button type="button" onclick="removeHaCustomWeatherSensor(${idx})"
                        class="w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-500/10 flex items-center justify-center shrink-0 cursor-pointer" title="Raum entfernen">
                        <span class="material-symbols-rounded text-base">delete</span>
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div class="flex items-center gap-1.5">
                    <input type="text" list="haEntitiesDatalist" value="${safeEnt}" oninput="updateHaCustomWeatherSensorField(${idx}, 'entityId', this.value)"
                        placeholder="Temperatur (°C): sensor.wohnzimmer_temp"
                        class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                    <button type="button" onclick="openHaEntityPicker({ customType: 'weatherSensor', index: ${idx}, unitFilter: 'all', title: 'Temperatur-Sensor (${safeName || ('Raum ' + (idx + 1))}) wählen' })"
                        class="w-8 h-8 rounded-lg bg-sky-600/15 hover:bg-sky-600/25 border border-sky-500/35 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0 cursor-pointer" title="Temperatur-Sensor aus Liste wählen">
                        <span class="material-symbols-rounded text-base">device_thermostat</span>
                    </button>
                </div>
                <div class="flex items-center gap-1.5">
                    <input type="text" list="haEntitiesDatalist" value="${safeHumEnt}" oninput="updateHaCustomWeatherSensorField(${idx}, 'humidityEntity', this.value)"
                        placeholder="Luftfeuchte (% rF, optional): sensor.wohnzimmer_humidity"
                        class="flex-1 min-w-0 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-teal-500">
                    <button type="button" onclick="openHaEntityPicker({ customType: 'weatherSensorHumidity', index: ${idx}, unitFilter: 'all', title: 'Luftfeuchtigkeit-Sensor (${safeName || ('Raum ' + (idx + 1))}) wählen' })"
                        class="w-8 h-8 rounded-lg bg-sky-600/15 hover:bg-sky-600/25 border border-sky-500/35 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0 cursor-pointer" title="Luftfeuchte-Sensor aus Liste wählen">
                        <span class="material-symbols-rounded text-base">water_drop</span>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function addHaCustomWeatherSensor() {
    readHaModalIntoState();
    if (!Array.isArray(haConfigState.customWeatherSensors)) haConfigState.customWeatherSensors = [];
    const nextNum = haConfigState.customWeatherSensors.length + 1;
    haConfigState.customWeatherSensors.push({
        id: 'ws_' + Date.now(),
        name: nextNum === 1 ? 'Wohnzimmer' : (nextNum === 2 ? 'Esszimmer' : `Raum / Sensor ${nextNum}`),
        entityId: '',
        humidityEntity: '',
        icon: nextNum === 2 ? 'table_restaurant' : 'weekend'
    });
    renderHaWeatherSensorsEditor();
}

function updateHaCustomWeatherSensorField(idx, field, val) {
    if (!Array.isArray(haConfigState.customWeatherSensors) || !haConfigState.customWeatherSensors[idx]) return;
    haConfigState.customWeatherSensors[idx][field] = val;
}

function removeHaCustomWeatherSensor(idx) {
    if (!Array.isArray(haConfigState.customWeatherSensors)) return;
    haConfigState.customWeatherSensors.splice(idx, 1);
    renderHaWeatherSensorsEditor();
}

function refreshHomeWeatherAndSensors(force = false) {
    updateHomeGreetingHeader();
    updateHomeEnergyOverview();
    fetchOpenMeteoForecastForHome(force);
    renderHomeCustomWeatherSensors();
    if (force) {
        refreshLiveTelemetryNow();
    }
}

function renderHomeTab() {
    updateHomeGreetingHeader();
    updateHomeEnergyOverview();
    fetchOpenMeteoForecastForHome(false);
    renderHomeCustomWeatherSensors();
}

window.renderHomeTab = renderHomeTab;
window.refreshHomeWeatherAndSensors = refreshHomeWeatherAndSensors;
window.addHaCustomWeatherSensor = addHaCustomWeatherSensor;
window.updateHaCustomWeatherSensorField = updateHaCustomWeatherSensorField;
window.removeHaCustomWeatherSensor = removeHaCustomWeatherSensor;
window.openClimateHistoryModal = openClimateHistoryModal;
window.closeClimateHistoryModal = closeClimateHistoryModal;

// Auto-initialize immediately once DOM is ready (0ms delay for instant start!)
document.addEventListener('DOMContentLoaded', () => {
    initTelemetryAndAnalysis();
    renderHomeTab();
});
