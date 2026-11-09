// ============================================================================
// TELEMETRY & PERFORMANCE ANALYSIS ENGINE (V8.3)
// Live Home Assistant Integration, Energy Flow Cockpit, Soll-Ist PVGIS Analysis,
// Battery Efficiency & Real Amortization Tracking
// ============================================================================

let haConfigState = {
    mode: 'demo', // 'demo' | 'poll' | 'webhook'
    baseUrl: 'http://homeassistant.local:8123',
    accessToken: '',
    pollIntervalSec: 10,
    autoSyncMonthly: true,
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
    stringEntities: {},
    inverterEntities: {}
};

let discoveredHaSensors = [];
let liveTelemetryTimer = null;
let currentLiveTelemetry = {
    updatedAt: null,
    pvPowerW: 0,
    loadPowerW: 0,
    gridPowerW: 0, // >0 import from grid, <0 export to grid
    batteryPowerW: 0, // >0 charging, <0 discharging
    batterySocPct: 68,
    pvEnergyTodayKwh: 0,
    pvEnergyMonthKwh: 0,
    gridImportMonthKwh: 0,
    gridExportMonthKwh: 0,
    batteryChargeMonthKwh: 0,
    batteryDischargeMonthKwh: 0,
    stringTelemetry: {},
    connectionOk: true,
    lastError: null
};

let demoSimHour = 13.5; // 13:30 Uhr sonniger Tag als Standard für Live-Demo
let activeAnalysisSubTab = 'soll-ist'; // 'soll-ist' | 'autarkie-bat' | 'amortisation' | 'logbuch'
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
    // 1. Load local cached HA config & performance records
    try {
        const localHa = localStorage.getItem('pvpro_ha_config');
        if (localHa) {
            const parsed = JSON.parse(localHa);
            haConfigState = {
                ...haConfigState,
                ...parsed,
                entities: { ...haConfigState.entities, ...(parsed.entities || {}) },
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

    // Ensure current project/year has initial realistic benchmark data if completely empty
    ensureProjectYearInitialized(selectedAnalysisYear);
}

function ensureProjectYearInitialized(year) {
    const projId = getActiveAnalysisProjectId();
    if (!performanceRecordsByProject[projId]) {
        performanceRecordsByProject[projId] = {};
    }
    if (!performanceRecordsByProject[projId][String(year)] || !Array.isArray(performanceRecordsByProject[projId][String(year)].months)) {
        // Pre-seed the first 10 months of the year with realistic actual values based on system size so charts are immediately informative
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
    // Compute total kWp and per-string kWp from active `strings`
    let totalKwp = 0;
    const stringSummaries = [];
    const monthlySollTotal = new Array(12).fill(0);

    const safeLat = parseFloat(typeof LocationData !== 'undefined' ? LocationData?.lat : 48.06) || 48.06;

    // Check if YieldDataCache from calculateYieldAPI() is available and matches current strings
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
            color: str.color || '#f59e0b',
            kwp: strKwp,
            azimuth: str.azimuth || 180,
            inverterName: inv ? inv.name : 'Wechselrichter',
            sollYearKwh: strSollMo.reduce((a, b) => a + b, 0),
            sollMonthlyKwh: strSollMo
        });
    });

    // Battery capacity from active configuration
    let totalBatteryKwh = 0;
    let totalBatteryPowerW = 0;
    const activeInvIds = [...new Set((typeof strings !== 'undefined' ? strings : []).map(s => parseInt(s.inverterId)))];
    activeInvIds.forEach(invId => {
        const inv = (typeof flatInverters !== 'undefined' ? flatInverters : []).find(i => i.id === invId);
        if (inv && inv.batteryId && inv.batteryId > 1) {
            const bat = (typeof flatBatteries !== 'undefined' ? flatBatteries : []).find(b => b.id == inv.batteryId);
            if (bat) {
                totalBatteryKwh += parseFloat(bat.cap || bat.capacity || 0);
                totalBatteryPowerW += parseFloat(bat.power || 4000);
            }
        }
    });
    if (totalBatteryKwh === 0 && typeof activeHardwareBatteryId !== 'undefined' && activeHardwareBatteryId > 1) {
        const bat = (typeof flatBatteries !== 'undefined' ? flatBatteries : []).find(b => b.id == activeHardwareBatteryId);
        if (bat) {
            totalBatteryKwh = parseFloat(bat.cap || bat.capacity || 0);
            totalBatteryPowerW = parseFloat(bat.power || 4000);
        }
    }

    // Financial parameters from Single Source of Truth
    const gridPriceEur = parseFloat(document.getElementById('fin_grid_price')?.value) || 0.32;
    const sysCostEur = parseFloat(document.getElementById('fin_sys_cost')?.value) || 15000;
    const eegRateCt = typeof updateEEGPreview === 'function' ? updateEEGPreview() : 7.8;
    const eegRateEur = eegRateCt / 100;

    // Planned annual consumption
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
    // Weather variance factors per month (realistic sunnier/cloudier months)
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

        // Direct + battery coverage model
        const directRatio = m >= 3 && m <= 8 ? 0.36 : 0.48;
        const directUsed = Math.min(monthHouseCons * 0.55, actualPv * directRatio);

        let batCharged = 0;
        let batDischarged = 0;
        if (hasBattery) {
            const excessPv = Math.max(0, actualPv - directUsed);
            const remainingLoad = Math.max(0, monthHouseCons - directUsed);
            const maxMonthlyBatCap = baseline.totalBatteryKwh * 24; // ~24 cycles max per month
            batDischarged = Math.round(Math.min(remainingLoad * 0.78, excessPv * 0.85, maxMonthlyBatCap));
            batCharged = Math.round(batDischarged / 0.91); // ~91% roundtrip efficiency
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
// 3. LIVE TELEMETRY ENGINE (DEMO SIMULATION + HOME ASSISTANT POLL / WEBHOOK)
// ============================================================================

function startLiveTelemetryLoop() {
    stopLiveTelemetryLoop();
    refreshLiveTelemetryNow();

    const intervalMs = Math.max(3, parseInt(haConfigState.pollIntervalSec) || 10) * 1000;
    liveTelemetryTimer = setInterval(() => {
        const liveTab = document.getElementById('tab-live');
        if (liveTab && liveTab.classList.contains('active')) {
            refreshLiveTelemetryNow();
        }
    }, intervalMs);
}

function stopLiveTelemetryLoop() {
    if (liveTelemetryTimer) {
        clearInterval(liveTelemetryTimer);
        liveTelemetryTimer = null;
    }
}

async function refreshLiveTelemetryNow() {
    const baseline = getPlannedSystemBaseline();

    if (haConfigState.mode === 'demo') {
        computeDemoLiveTelemetry(baseline);
        renderLiveCockpitUI(baseline);
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
                batterySocPct: t.batterySocPct !== null && t.batterySocPct !== undefined ? Math.round(t.batterySocPct) : (baseline.totalBatteryKwh > 0 ? 50 : null),
                pvEnergyTodayKwh: t.pvEnergyTodayKwh,
                pvEnergyMonthKwh: t.pvEnergyMonthKwh,
                gridImportMonthKwh: t.gridImportMonthKwh,
                gridExportMonthKwh: t.gridExportMonthKwh,
                batteryChargeMonthKwh: t.batteryChargeMonthKwh,
                batteryDischargeMonthKwh: t.batteryDischargeMonthKwh,
                stringTelemetry: data.stringTelemetry || {},
                connectionOk: true,
                lastError: null
            };

            // Optional auto-sync of current month's counters into the monthly logbook
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
}

function computeDemoLiveTelemetry(baseline) {
    // Calculate realistic sun elevation factor for demoSimHour (0..24)
    const hour = parseFloat(demoSimHour) || 13.5;
    let sunFactor = 0;
    if (hour > 6 && hour < 20.5) {
        sunFactor = Math.pow(Math.sin(((hour - 6) / 14.5) * Math.PI), 1.35);
    }
    // Small natural micro-fluctuation (+/- 1.5%) for live instrument feel
    const jitter = 0.985 + (Math.sin(Date.now() / 4000) * 0.015);

    let totalPvW = 0;
    const strTele = {};

    baseline.stringSummaries.forEach((s, idx) => {
        // Azimuth modifier (East peaks morning, West peaks afternoon, South peaks midday)
        const azDiff = ((s.azimuth || 180) - 180) / 90; // -1 = East, 0 = South, +1 = West
        const hourShift = hour - (13.2 + azDiff * 2.1);
        const orientFactor = Math.max(0.15, Math.cos((hourShift / 8.5) * (Math.PI / 2)));
        const strPowerW = Math.round(s.kwp * 1000 * 0.84 * sunFactor * orientFactor * jitter);
        totalPvW += strPowerW;

        // Cumulative day energy up to `hour`
        const dayProgress = Math.max(0, Math.min(1, (hour - 6) / 14));
        const estDayKwh = +(s.kwp * 4.6 * dayProgress).toFixed(1);

        strTele[s.id] = {
            powerW: strPowerW,
            energyKwh: estDayKwh
        };
    });

    // House load profile
    const baseLoadW = Math.round((baseline.plannedConsKwh / 8760) * 1000 * 0.85);
    const peakBoost = (hour >= 7 && hour <= 9) || (hour >= 17.5 && hour <= 21) ? 750 : 220;
    const loadW = Math.round((baseLoadW + peakBoost) * (2 - jitter));

    // Battery & Grid balance
    let batW = 0;
    let soc = 25;
    if (baseline.totalBatteryKwh > 0) {
        soc = Math.round(Math.min(98, Math.max(15, 22 + Math.max(0, (hour - 8) * 8.5) - Math.max(0, (hour - 18) * 11))));
        const netSurplus = totalPvW - loadW;
        const maxBatP = baseline.totalBatteryPowerW || 4500;
        if (netSurplus > 0 && soc < 98) {
            batW = Math.round(Math.min(netSurplus, maxBatP)); // Charging (>0)
        } else if (netSurplus < 0 && soc > 15) {
            batW = -Math.round(Math.min(Math.abs(netSurplus), maxBatP)); // Discharging (<0)
        }
    }

    // Grid Power: >0 = Netzbezug, <0 = Einspeisung
    // Energy conservation: PV + GridImport + BatDischarge = Load + GridExport + BatCharge
    // => GridPower = Load + BatW - PV
    const gridW = Math.round(loadW + batW - totalPvW);

    const dayProgress = Math.max(0.05, Math.min(1, (hour - 5.5) / 15));
    const pvTodayKwh = +(baseline.totalKwp * 4.5 * dayProgress).toFixed(1);

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
        batterySocPct: baseline.totalBatteryKwh > 0 ? soc : null,
        pvEnergyTodayKwh: pvTodayKwh,
        pvEnergyMonthKwh: +(sollThisMonth * monthFrac * 1.04).toFixed(1),
        gridImportMonthKwh: +(baseline.plannedConsKwh / 12 * monthFrac * 0.24).toFixed(1),
        gridExportMonthKwh: +(sollThisMonth * monthFrac * 0.58).toFixed(1),
        batteryChargeMonthKwh: baseline.totalBatteryKwh > 0 ? +(baseline.totalBatteryKwh * 18 * monthFrac).toFixed(1) : 0,
        batteryDischargeMonthKwh: baseline.totalBatteryKwh > 0 ? +(baseline.totalBatteryKwh * 16.4 * monthFrac).toFixed(1) : 0,
        stringTelemetry: strTele,
        connectionOk: true,
        lastError: null
    };
}

function setLiveTelemetryMode(newMode) {
    haConfigState.mode = newMode;
    localStorage.setItem('pvpro_ha_config', JSON.stringify(haConfigState));
    fetch('/api/ha/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: haConfigState })
    }).catch(() => {});

    refreshLiveTelemetryNow();
}

function onDemoHourSliderChange(val) {
    demoSimHour = parseFloat(val) || 13.5;
    const hrs = Math.floor(demoSimHour);
    const mins = Math.round((demoSimHour - hrs) * 60);
    const lbl = document.getElementById('demoTimeLabel');
    if (lbl) lbl.innerText = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')} Uhr`;
    refreshLiveTelemetryNow();
}

function formatPowerDisplay(watts) {
    const absW = Math.abs(watts || 0);
    if (absW >= 1000) {
        return `${(watts / 1000).toFixed(2)} kW`;
    }
    return `${Math.round(watts)} W`;
}

// ============================================================================
// 4. RENDERING: LIVE COCKPIT, SVG ENERGY FLOW & STRING MONITOR
// ============================================================================

function renderLiveTab() {
    const baseline = getPlannedSystemBaseline();
    refreshLiveTelemetryNow();
    renderAnalysisSection(baseline);
}

function renderLiveCockpitUI(baseline) {
    if (!baseline) baseline = getPlannedSystemBaseline();
    const t = currentLiveTelemetry;

    // 1. Update Mode Buttons & Status Banner
    ['demo', 'poll', 'webhook'].forEach(m => {
        const btn = document.getElementById(`btn-ha-mode-${m}`);
        if (btn) {
            if (haConfigState.mode === m) {
                btn.className = "px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold shadow-xs transition-all cursor-pointer whitespace-nowrap";
            } else {
                btn.className = "px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-xs font-medium transition-all cursor-pointer whitespace-nowrap";
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
            statusText.innerHTML = `<span class="text-amber-600 dark:text-amber-400 font-semibold">Live-Simulationsmodus</span> · Berechnet für ${baseline.totalKwp.toFixed(2)} kWp (${baseline.stringSummaries.length} Strings)`;
        } else if (t.connectionOk) {
            const timeStr = t.updatedAt ? new Date(t.updatedAt).toLocaleTimeString('de-DE') : 'Gerade eben';
            statusText.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-semibold">Home Assistant verbunden (${haConfigState.mode === 'webhook' ? 'Webhook-Push' : 'Live-Poll'})</span> · Aktualisiert: ${timeStr}`;
        } else {
            statusText.innerHTML = `<span class="text-rose-600 dark:text-rose-400 font-semibold">Verbindungs-Hinweis:</span> ${typeof escapeHtml === 'function' ? escapeHtml(t.lastError || 'Nicht erreichbar') : (t.lastError || 'Nicht erreichbar')}`;
        }
    }

    // 2. Live KPI Cards
    const pvPct = baseline.totalKwp > 0 ? Math.min(100, Math.round((t.pvPowerW / (baseline.totalKwp * 1000)) * 100)) : 0;
    const gridImportW = Math.max(0, t.gridPowerW);
    const gridExportW = Math.max(0, -t.gridPowerW);
    const batChargeW = Math.max(0, t.batteryPowerW);
    const batDischargeW = Math.max(0, -t.batteryPowerW);

    // Live Autarky: share of house load covered by PV + Battery right now
    const selfCoveredLoadW = Math.max(0, t.loadPowerW - gridImportW);
    const liveAutarkyPct = t.loadPowerW > 0 ? Math.min(100, Math.round((selfCoveredLoadW / t.loadPowerW) * 100)) : 100;

    // Live self-consumption rate
    const pvUsedInHouseAndBatW = Math.max(0, t.pvPowerW - gridExportW);
    const liveEigenPct = t.pvPowerW > 0 ? Math.min(100, Math.round((pvUsedInHouseAndBatW / t.pvPowerW) * 100)) : 0;

    // Today's financial savings estimate
    const todayPvKwh = t.pvEnergyTodayKwh !== null && t.pvEnergyTodayKwh !== undefined ? t.pvEnergyTodayKwh : 0;
    const estTodaySelfKwh = todayPvKwh * 0.45;
    const estTodayExportKwh = todayPvKwh * 0.55;
    const estTodayEuro = (estTodaySelfKwh * baseline.gridPriceEur) + (estTodayExportKwh * baseline.eegRateEur);

    setElText('live_kpi_pv_power', formatPowerDisplay(t.pvPowerW));
    setElText('live_kpi_pv_sub', `${pvPct} % von ${baseline.totalKwp.toFixed(2)} kWp · Heute: ${todayPvKwh.toFixed(1)} kWh`);

    setElText('live_kpi_load_power', formatPowerDisplay(t.loadPowerW));
    setElText('live_kpi_load_sub', `Live-Autarkie: ${liveAutarkyPct} % · Eigenverbrauch: ${liveEigenPct} %`);

    if (baseline.totalBatteryKwh > 0 || t.batterySocPct !== null) {
        const socVal = t.batterySocPct !== null ? `${t.batterySocPct} %` : '—';
        const batStateLabel = batChargeW > 20 ? `Lädt mit +${formatPowerDisplay(batChargeW)}` : (batDischargeW > 20 ? `Entlädt mit ${formatPowerDisplay(batDischargeW)}` : 'Standby (0 W)');
        setElText('live_kpi_bat_soc', socVal);
        setElText('live_kpi_bat_sub', `${batStateLabel} · ${baseline.totalBatteryKwh.toFixed(1)} kWh Speicher`);
    } else {
        setElText('live_kpi_bat_soc', 'Ohne Akku');
        setElText('live_kpi_bat_sub', 'Kein Speicher im Projekt konfiguriert');
    }

    if (gridExportW > 15) {
        setElText('live_kpi_grid_power', `${formatPowerDisplay(gridExportW)}`);
        setElText('live_kpi_grid_sub', `Netzeinspeisung aktiv · +${((todayPvKwh > 0 ? estTodayEuro : 0)).toFixed(2)} € heute`);
        const gridEl = document.getElementById('live_kpi_grid_power');
        if (gridEl) gridEl.className = "text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums";
    } else if (gridImportW > 15) {
        setElText('live_kpi_grid_power', `${formatPowerDisplay(gridImportW)}`);
        setElText('live_kpi_grid_sub', `Netzbezug aktiv · Heute ca. +${estTodayEuro.toFixed(2)} € Ertrag`);
        const gridEl = document.getElementById('live_kpi_grid_power');
        if (gridEl) gridEl.className = "text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums";
    } else {
        setElText('live_kpi_grid_power', '0 W');
        setElText('live_kpi_grid_sub', `Nulleinspeisung / Ausgeglichen · Heute +${estTodayEuro.toFixed(2)} €`);
        const gridEl = document.getElementById('live_kpi_grid_power');
        if (gridEl) gridEl.className = "text-2xl sm:text-3xl font-black text-slate-700 dark:text-slate-200 font-mono tabular-nums";
    }

    // 3. Render SVG Energy Flow Diagram
    const flowContainer = document.getElementById('liveEnergyFlowSvgContainer');
    if (flowContainer) {
        flowContainer.innerHTML = buildEnergyFlowSvg(t, baseline, liveAutarkyPct);
    }

    // 4. Render Live String Performance List
    const strContainer = document.getElementById('liveStringsBreakdownContainer');
    if (strContainer) {
        strContainer.innerHTML = baseline.stringSummaries.map(s => {
            const st = t.stringTelemetry?.[s.id] || {};
            const pW = st.powerW !== null && st.powerW !== undefined ? Math.round(st.powerW) : Math.round(t.pvPowerW * (s.kwp / baseline.totalKwp));
            const loadPct = s.kwp > 0 ? Math.min(100, Math.round((pW / (s.kwp * 1000)) * 100)) : 0;
            const mappedSensor = haConfigState.stringEntities?.[s.id]?.powerEntity || 'Proportional / Berechnet';

            return `
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-3 h-3 rounded-sm shrink-0" style="background-color: ${s.color}"></span>
                        <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${typeof escapeHtml === 'function' ? escapeHtml(s.name) : s.name}</span>
                        <span class="text-[11px] text-slate-400 shrink-0">· ${s.kwp.toFixed(2)} kWp</span>
                    </div>
                    <div class="text-right font-mono tabular-nums shrink-0">
                        <span class="text-sm font-black text-slate-900 dark:text-white">${formatPowerDisplay(pW)}</span>
                        <span class="text-[11px] text-slate-500 dark:text-slate-400 ml-1">(${loadPct} %)</span>
                    </div>
                </div>
                <div class="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-300" style="width: ${loadPct}%; background-color: ${s.color}"></div>
                </div>
                <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span class="truncate">WR: ${typeof escapeHtml === 'function' ? escapeHtml(s.inverterName) : s.inverterName}</span>
                    <span class="truncate">Entität: ${typeof escapeHtml === 'function' ? escapeHtml(mappedSensor) : mappedSensor}</span>
                </div>
            </div>`;
        }).join('');
    }
}

function buildEnergyFlowSvg(t, baseline, liveAutarkyPct) {
    const pvActive = t.pvPowerW > 20;
    const batCharge = t.batteryPowerW > 20;
    const batDischarge = t.batteryPowerW < -20;
    const gridExport = t.gridPowerW < -20;
    const gridImport = t.gridPowerW > 20;
    const soc = t.batterySocPct !== null && t.batterySocPct !== undefined ? t.batterySocPct : 0;

    const pvStroke = pvActive ? '#f59e0b' : '#475569';
    const loadStroke = '#3b82f6';
    const batStroke = (batCharge || batDischarge) ? '#6366f1' : '#475569';
    const gridStroke = gridExport ? '#10b981' : (gridImport ? '#f43f5e' : '#475569');

    return `
    <svg viewBox="0 0 680 280" class="w-full h-auto max-h-[290px] select-none">
        <defs>
            <style>
                @keyframes flowDashForward { to { stroke-dashoffset: -24; } }
                @keyframes flowDashReverse { to { stroke-dashoffset: 24; } }
                .flow-fwd { stroke-dasharray: 6 6; animation: flowDashForward 0.9s linear infinite; }
                .flow-rev { stroke-dasharray: 6 6; animation: flowDashReverse 0.9s linear infinite; }
            </style>
        </defs>

        <!-- Background connection paths -->
        <!-- PV (Top Left: 120, 65) to Central Inverter Hub (340, 140) -->
        <path d="M 190 65 L 270 65 L 310 115" fill="none" stroke="#334155" stroke-width="3" stroke-opacity="0.35" stroke-linecap="round"/>
        ${pvActive ? `<path d="M 190 65 L 270 65 L 310 115" fill="none" stroke="${pvStroke}" stroke-width="3.5" class="flow-fwd" stroke-linecap="round"/>` : ''}

        <!-- Central Hub (340, 140) to House Load (Top Right: 560, 65) -->
        <path d="M 370 115 L 410 65 L 490 65" fill="none" stroke="#334155" stroke-width="3" stroke-opacity="0.35" stroke-linecap="round"/>
        ${t.loadPowerW > 10 ? `<path d="M 370 115 L 410 65 L 490 65" fill="none" stroke="${loadStroke}" stroke-width="3.5" class="flow-fwd" stroke-linecap="round"/>` : ''}

        <!-- Battery (Bottom Left: 120, 215) <-> Central Hub (340, 140) -->
        <path d="M 190 215 L 270 215 L 310 165" fill="none" stroke="#334155" stroke-width="3" stroke-opacity="0.35" stroke-linecap="round"/>
        ${batCharge ? `<path d="M 190 215 L 270 215 L 310 165" fill="none" stroke="${batStroke}" stroke-width="3.5" class="flow-rev" stroke-linecap="round"/>` : ''}
        ${batDischarge ? `<path d="M 190 215 L 270 215 L 310 165" fill="none" stroke="${batStroke}" stroke-width="3.5" class="flow-fwd" stroke-linecap="round"/>` : ''}

        <!-- Central Hub (340, 140) <-> Public Grid (Bottom Right: 560, 215) -->
        <path d="M 370 165 L 410 215 L 490 215" fill="none" stroke="#334155" stroke-width="3" stroke-opacity="0.35" stroke-linecap="round"/>
        ${gridExport ? `<path d="M 370 165 L 410 215 L 490 215" fill="none" stroke="${gridStroke}" stroke-width="3.5" class="flow-fwd" stroke-linecap="round"/>` : ''}
        ${gridImport ? `<path d="M 370 165 L 410 215 L 490 215" fill="none" stroke="${gridStroke}" stroke-width="3.5" class="flow-rev" stroke-linecap="round"/>` : ''}

        <!-- NODE 1: PV GENERATOR (TOP LEFT) -->
        <g transform="translate(20, 22)">
            <rect width="170" height="86" rx="14" fill="#0f172a" stroke="${pvStroke}" stroke-width="1.8"/>
            <text x="16" y="26" fill="#94a3b8" font-size="10" font-weight="700">PV-GENERATOR (${baseline.stringSummaries.length} STR.)</text>
            <text x="16" y="54" fill="#fbbf24" font-size="20" font-weight="800" font-family="monospace">${formatPowerDisplay(t.pvPowerW)}</text>
            <text x="16" y="73" fill="#cbd5e1" font-size="10" font-family="monospace">${baseline.totalKwp.toFixed(2)} kWp · Heute ${(t.pvEnergyTodayKwh || 0).toFixed(1)} kWh</text>
        </g>

        <!-- NODE 2: HOUSE CONSUMPTION (TOP RIGHT) -->
        <g transform="translate(490, 22)">
            <rect width="170" height="86" rx="14" fill="#0f172a" stroke="${loadStroke}" stroke-width="1.8"/>
            <text x="16" y="26" fill="#94a3b8" font-size="10" font-weight="700">HAUSVERBRAUCH</text>
            <text x="16" y="54" fill="#60a5fa" font-size="20" font-weight="800" font-family="monospace">${formatPowerDisplay(t.loadPowerW)}</text>
            <text x="16" y="73" fill="#cbd5e1" font-size="10" font-family="monospace">Live-Autarkie: ${liveAutarkyPct} %</text>
        </g>

        <!-- NODE 3: BATTERY STORAGE (BOTTOM LEFT) -->
        <g transform="translate(20, 172)">
            <rect width="170" height="86" rx="14" fill="#0f172a" stroke="${batStroke}" stroke-width="1.8"/>
            <text x="16" y="26" fill="#94a3b8" font-size="10" font-weight="700">BATTERIESPEICHER</text>
            <text x="16" y="54" fill="#818cf8" font-size="20" font-weight="800" font-family="monospace">${t.batterySocPct !== null ? `${t.batterySocPct} % SoC` : 'Ohne Akku'}</text>
            <text x="16" y="73" fill="#cbd5e1" font-size="10" font-family="monospace">${batCharge ? `Lädt: +${formatPowerDisplay(t.batteryPowerW)}` : (batDischarge ? `Entlädt: ${formatPowerDisplay(Math.abs(t.batteryPowerW))}` : '0 W (Ruhe)')}</text>
            ${t.batterySocPct !== null ? `
            <rect x="138" y="34" width="16" height="38" rx="3" fill="#1e293b" stroke="#64748b" stroke-width="1"/>
            <rect x="140" y="${36 + Math.round((100 - soc) * 0.34)}" width="12" height="${Math.max(2, Math.round(soc * 0.34))}" rx="1.5" fill="#6366f1"/>
            ` : ''}
        </g>

        <!-- NODE 4: PUBLIC GRID (BOTTOM RIGHT) -->
        <g transform="translate(490, 172)">
            <rect width="170" height="86" rx="14" fill="#0f172a" stroke="${gridStroke}" stroke-width="1.8"/>
            <text x="16" y="26" fill="#94a3b8" font-size="10" font-weight="700">${gridExport ? 'NETZEINSPEISUNG' : (gridImport ? 'NETZBEZUG' : 'STROMNETZ')}</text>
            <text x="16" y="54" fill="${gridExport ? '#34d399' : (gridImport ? '#fb7185' : '#cbd5e1')}" font-size="20" font-weight="800" font-family="monospace">${formatPowerDisplay(Math.abs(t.gridPowerW))}</text>
            <text x="16" y="73" fill="#cbd5e1" font-size="10" font-family="monospace">${gridExport ? 'Überschuss ins Netz' : (gridImport ? 'Reststrom aus Netz' : 'Ausgeglichen (0 W)')}</text>
        </g>

        <!-- CENTRAL HUB: INVERTER & EMS (CENTER) -->
        <g transform="translate(275, 96)">
            <rect width="130" height="88" rx="18" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
            <text x="65" y="30" text-anchor="middle" fill="#38bdf8" font-size="10" font-weight="800">WECHSELRICHTER</text>
            <text x="65" y="52" text-anchor="middle" fill="#ffffff" font-size="15" font-weight="800" font-family="monospace">AC / DC HUB</text>
            <text x="65" y="72" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="monospace">η ≈ 97.5 %</text>
        </g>
    </svg>`;
}

// ============================================================================
// 5. PERFORMANCE ANALYSIS CALCULATIONS (SOLL-IST, AUTARKY/BATTERY, AMORTIZATION)
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
                btn.className = "px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap";
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

        // Direct PV consumption = PV - Export - BatteryCharged (clamped >= 0)
        const directKwh = hasReal ? Math.max(0, realPv - expKwh - bChg) : 0;
        const totalSelfUsedKwh = hasReal ? Math.max(0, realPv - expKwh) : 0;
        const houseConsKwh = hasReal ? (directKwh + bDis + impKwh) : 0;

        // Financial return for this month
        const selfSavedEur = (directKwh + bDis) * baseline.gridPriceEur;
        const feedInRevEur = expKwh * baseline.eegRateEur;
        const totalBenefitEur = selfSavedEur + feedInRevEur;

        // Planned financial benefit for this month
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

    // Battery efficiency & full cycles
    const batEfficiencyPct = batChargedSum > 0 ? Math.min(100, (batDischargedSum / batChargedSum) * 100) : (baseline.totalBatteryKwh > 0 ? 91.0 : 0);
    const batLossKwh = Math.max(0, batChargedSum - batDischargedSum);
    const batFullCycles = baseline.totalBatteryKwh > 0 ? (batDischargedSum / baseline.totalBatteryKwh) : 0;

    // Real financial savings & amortization projection
    const recordedSelfSavingsEur = selfConsumedTotalKwh * baseline.gridPriceEur;
    const recordedFeedInEur = gridExportSum * baseline.eegRateEur;
    const recordedTotalEur = recordedSelfSavingsEur + recordedFeedInEur;

    // Extrapolate full annual real savings (using recorded months + Soll * performance index for remaining months)
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

    // Update Year Selector
    const yearSel = document.getElementById('analysisYearSelect');
    if (yearSel && String(yearSel.value) !== String(selectedAnalysisYear)) {
        yearSel.value = String(selectedAnalysisYear);
    }

    // 1. Update Top Summary KPIs in Analysis Area
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
        perfEl.className = `text-2xl sm:text-3xl font-black font-mono tabular-nums ${metrics.overallPerfIndexPct >= 98 ? 'text-emerald-600 dark:text-emerald-400' : (metrics.overallPerfIndexPct >= 88 ? 'text-amber-500' : 'text-rose-500')}`;
    }

    setElText('ana_kpi_euro_real', `${Math.round(metrics.recordedTotalEur).toLocaleString('de-DE')} €`);
    setElText('ana_kpi_euro_sub', `Hochrechnung Jahr: ${Math.round(metrics.projectedAnnualRealEur).toLocaleString('de-DE')} €/a · ROI: ${metrics.realAmortYears.toFixed(1)} J.`);

    // 2. Render Sub-Panel 1: Soll-Ist-Vergleich
    renderSollIstPanel(baseline, metrics);

    // 3. Render Sub-Panel 2: Autarkie, Eigenverbrauch & Batterie-Effizienz
    renderAutarkyBatteryPanel(baseline, metrics);

    // 4. Render Sub-Panel 3: Reale Amortisation & Euro-Ersparnis
    renderRealAmortizationPanel(baseline, metrics);

    // 5. Render Sub-Panel 4: Monatswerte-Logbuch Table
    renderMonthlyLogbookTable(baseline, metrics);
}

function renderSollIstPanel(baseline, metrics) {
    const ctx = document.getElementById('sollIstComparisonChart');
    if (ctx && typeof Chart !== 'undefined') {
        const sollData = metrics.monthlyComparison.map(m => Math.round(m.sollKwh));
        const realData = metrics.monthlyComparison.map(m => m.hasReal ? Math.round(m.realPv) : 0);
        const barColors = metrics.monthlyComparison.map(m => {
            if (!m.hasReal) return 'rgba(148, 163, 184, 0.25)';
            return m.realPv >= m.sollKwh * 0.98 ? '#10b981' : '#f59e0b';
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
                        backgroundColor: 'rgba(14, 165, 233, 0.35)',
                        borderColor: '#0ea5e9',
                        borderWidth: 1.5,
                        borderRadius: 5
                    },
                    {
                        label: `Realer Ist-Ertrag ${selectedAnalysisYear} (kWh)`,
                        data: realData,
                        backgroundColor: barColors,
                        borderRadius: 5
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

    // Monthly deviation grid
    const gridEl = document.getElementById('sollIstMonthlyCardsGrid');
    if (gridEl) {
        gridEl.innerHTML = metrics.monthlyComparison.map(m => {
            const diffKwh = m.hasReal ? Math.round(m.realPv - m.sollKwh) : null;
            const diffSign = diffKwh !== null && diffKwh >= 0 ? '+' : '';
            const statusColor = !m.hasReal
                ? 'text-slate-400'
                : (m.perfIndexPct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : (m.perfIndexPct >= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'));

            return `
            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between">
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
                        backgroundColor: '#10b981',
                        stack: 'cons'
                    },
                    {
                        label: 'Aus Batteriespeicher (kWh)',
                        data: metrics.monthlyComparison.map(m => Math.round(m.bDis)),
                        backgroundColor: '#6366f1',
                        stack: 'cons'
                    },
                    {
                        label: 'Rest-Netzbezug (kWh)',
                        data: metrics.monthlyComparison.map(m => Math.round(m.impKwh)),
                        backgroundColor: '#f43f5e',
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
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        fill: true,
                        borderWidth: 2.5,
                        tension: 0.25,
                        pointRadius: 2
                    },
                    {
                        label: 'Geplanter PVGIS-Amortisationspfad (€)',
                        data: plannedCurve,
                        borderColor: '#0ea5e9',
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
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-primary outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${expVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'gridExportKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-primary outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${impVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'gridImportKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-primary outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${bChgVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'batteryChargedKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-primary outline-none">
            </td>
            <td class="py-2 px-2">
                <input type="number" step="1" min="0" value="${bDisVal}" placeholder="kWh"
                    onchange="onMonthlyRecordFieldChange(${idx}, 'batteryDischargedKwh', this.value)"
                    class="w-24 text-right font-mono tabular-nums text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-primary outline-none">
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
// 6. HOME ASSISTANT ENTITY CONFIGURATOR MODAL
// ============================================================================

function openHaConfigModal() {
    const modal = document.getElementById('modal-ha-config');
    if (!modal) return;

    // Populate fields from haConfigState
    setElVal('ha_cfg_mode', haConfigState.mode || 'demo');
    setElVal('ha_cfg_url', haConfigState.baseUrl || 'http://homeassistant.local:8123');
    setElVal('ha_cfg_token', haConfigState.accessToken || '');
    setElVal('ha_cfg_interval', haConfigState.pollIntervalSec || 10);

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

    // Render dynamic string entity inputs
    renderHaStringMappingInputs();

    // Update Webhook YAML preview
    updateHaWebhookYamlSnippet();

    modal.classList.remove('hidden');
}

function closeHaConfigModal() {
    const modal = document.getElementById('modal-ha-config');
    if (modal) modal.classList.add('hidden');
}

function renderHaStringMappingInputs() {
    const container = document.getElementById('haStringMappingContainer');
    if (!container) return;

    const baseline = getPlannedSystemBaseline();
    container.innerHTML = baseline.stringSummaries.map(s => {
        const curMap = haConfigState.stringEntities?.[s.id] || {};
        return `
        <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
            <div class="flex items-center gap-2 min-w-0">
                <span class="w-3 h-3 rounded-sm shrink-0" style="background-color: ${s.color}"></span>
                <div class="min-w-0">
                    <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${typeof escapeHtml === 'function' ? escapeHtml(s.name) : s.name}</p>
                    <p class="text-[10px] text-slate-400 font-mono">${s.kwp.toFixed(2)} kWp · ${typeof escapeHtml === 'function' ? escapeHtml(s.inverterName) : s.inverterName}</p>
                </div>
            </div>
            <div>
                <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">Live-Leistung (W / kW)</label>
                <input type="text" list="haEntitiesDatalist" id="ha_str_power_${s.id}" value="${curMap.powerEntity || ''}"
                    placeholder="sensor.string_${s.id}_power"
                    class="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-primary">
            </div>
            <div>
                <label class="block text-[10px] font-semibold text-slate-500 mb-0.5">Tages-/Monatsertrag (kWh)</label>
                <input type="text" list="haEntitiesDatalist" id="ha_str_energy_${s.id}" value="${curMap.energyEntity || ''}"
                    placeholder="sensor.string_${s.id}_energy"
                    class="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-primary">
            </div>
        </div>`;
    }).join('');
}

function readHaModalIntoState() {
    haConfigState.mode = document.getElementById('ha_cfg_mode')?.value || 'demo';
    haConfigState.baseUrl = (document.getElementById('ha_cfg_url')?.value || 'http://homeassistant.local:8123').trim();
    haConfigState.accessToken = (document.getElementById('ha_cfg_token')?.value || '').trim();
    haConfigState.pollIntervalSec = Math.max(3, parseInt(document.getElementById('ha_cfg_interval')?.value) || 10);

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

    const baseline = getPlannedSystemBaseline();
    const strMap = {};
    baseline.stringSummaries.forEach(s => {
        const pEnt = (document.getElementById(`ha_str_power_${s.id}`)?.value || '').trim();
        const eEnt = (document.getElementById(`ha_str_energy_${s.id}`)?.value || '').trim();
        if (pEnt || eEnt) {
            strMap[s.id] = { powerEntity: pEnt, energyEntity: eEnt };
        }
    });
    haConfigState.stringEntities = strMap;
}

async function testHaConnectionAndLoadSensors() {
    readHaModalIntoState();
    const statusBox = document.getElementById('haTestFeedbackBox');
    if (statusBox) {
        statusBox.classList.remove('hidden');
        statusBox.className = "p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 font-medium";
        statusBox.innerText = "Verbinde mit Home Assistant und suche verfügbare sensor.* Entitäten...";
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

        if (res.ok && data && data.success) {
            discoveredHaSensors = data.sensors || [];
            const dl = document.getElementById('haEntitiesDatalist');
            if (dl) {
                dl.innerHTML = discoveredHaSensors.map(s =>
                    `<option value="${s.entity_id}">${s.name} (${s.state} ${s.unit})</option>`
                ).join('');
            }
            if (statusBox) {
                statusBox.className = "p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold";
                statusBox.innerText = `Verbindung erfolgreich! ${data.sensorCount} Sensoren gefunden und in die Autovervollständigung geladen.`;
            }
        } else {
            if (statusBox) {
                statusBox.className = "p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 font-semibold";
                statusBox.innerText = data?.error || 'Verbindung fehlgeschlagen.';
            }
        }
    } catch (err) {
        if (statusBox) {
            statusBox.className = "p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 font-semibold";
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
        showToastNotification('Home Assistant & Entitäten-Konfiguration gespeichert!', 'success');
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
    }, 150);
});
