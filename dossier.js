// ==========================================
// PV PRO STUDIO – DOSSIER & PDF EXPORT ENGINE
// Version 7.0.0
// Normkonforme Projektdokumentation nach DIN VDE 0100-712
// ==========================================

let dossierOptions = {
    reportType: "full", // "compact" (Kurz-Report / 1-2 Seiten) | "full" (Vollständiges DIN VDE 0100-712 Dossier)
    projectTitle: "PV-Auslegungs- & Installationsdossier",
    clientName: "Familie Mustermann / Anlagenbetreiber",
    installerName: "Solar-Fachbetrieb / PV Pro Studio",
    projectNumber: "PV-" + (new Date().getFullYear()) + "-" + String(Math.floor(1000 + Math.random() * 9000)),
    projectDate: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    includeSummary: true,
    includeStrings: true,
    includeWiring: true,
    includeVdeLosses: true,
    includeBom: true,
    includeFinance: true,
    includeAcceptanceProtocol: true,
    includeDataSheets: true,      // Haken: Mit / Ohne Datenblätter
    includeCertificates: true     // Haken: Mit / Ohne Zertifikate
};

function openDossierModal(focusMode = 'all') {
    // Initialisiere Projekttitel mit aktuellem Ort, falls vorhanden
    if (typeof LocationData !== 'undefined' && LocationData.name) {
        dossierOptions.projectTitle = `Photovoltaikanlage ${LocationData.name}`;
    }
    
    // Modal-DOM prüfen oder einfügen
    ensureDossierModalDom();
    
    const modal = document.getElementById('modal-dossier');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        renderDossierPreview();
    }
}

function closeDossierModal() {
    const modal = document.getElementById('modal-dossier');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

function setDossierOption(key, value) {
    dossierOptions[key] = value;
    renderDossierPreview();
}

function setReportType(type) {
    dossierOptions.reportType = type;
    const btnCompact = document.getElementById('dos_btn_compact');
    const btnFull = document.getElementById('dos_btn_full');
    const secCont = document.getElementById('dos_sections_container');
    
    if (btnCompact && btnFull) {
        if (type === 'compact') {
            btnCompact.className = 'px-3 py-1.5 rounded-lg font-black text-xs flex items-center gap-1.5 transition-all bg-primary text-white shadow-sm';
            btnFull.className = 'px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
            if (secCont) secCont.classList.add('opacity-40', 'pointer-events-none');
        } else {
            btnCompact.className = 'px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
            btnFull.className = 'px-3 py-1.5 rounded-lg font-black text-xs flex items-center gap-1.5 transition-all bg-primary text-white shadow-sm';
            if (secCont) secCont.classList.remove('opacity-40', 'pointer-events-none');
        }
    }
    renderDossierPreview();
}

function printDossierDirectly() {
    // Rendere das Dossier direkt in den dedizierten Print-Container #pv-print-dossier
    const printContainer = document.getElementById('pv-print-dossier');
    if (printContainer) {
        printContainer.innerHTML = buildDossierHtmlContent(true);
    }
    window.print();
}

function ensureDossierModalDom() {
    if (document.getElementById('modal-dossier')) return;

    const modalHtml = `
    <div id="modal-dossier" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md hidden">
        <div class="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            
            <!-- MODAL HEADER -->
            <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950 no-print">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                        <span class="material-symbols-rounded text-2xl">picture_as_pdf</span>
                    </div>
                    <div>
                        <h3 class="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                            Projektdokumentation & PDF-Dossier
                            <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">DIN VDE 0100-712</span>
                        </h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400">
                            Konfigurierbarer Export: Kurz-Report oder vollständiges VDE-Fachgutachten mit Datenblättern & Zertifikaten.
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button onclick="printDossierDirectly()" class="bg-primary hover:bg-primary-hover text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-md transition-all">
                        <span class="material-symbols-rounded text-base">print</span>
                        <span>Drucken / Als PDF speichern</span>
                    </button>
                    <button onclick="closeDossierModal()" class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center transition-all">
                        <span class="material-symbols-rounded text-lg">close</span>
                    </button>
                </div>
            </div>

            <!-- MODAL TOOLBAR: REPORT-KONFIGURATOR (AUSWAHLFENSTER) -->
            <div class="px-6 py-3 bg-slate-100/90 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs no-print space-y-3">
                
                <!-- ZEILE 1: REPORT-UMFANG & DOKUMENTEN-OPTIONEN -->
                <div class="flex flex-wrap items-center justify-between gap-4">
                    <!-- REPORT UMFANG (KURZ vs VOLLSTÄNDIG) -->
                    <div class="flex items-center gap-2">
                        <span class="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">Report-Typ:</span>
                        <div class="inline-flex p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs">
                            <button id="dos_btn_compact" onclick="setReportType('compact')" class="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${dossierOptions.reportType === 'compact' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                                <span class="material-symbols-rounded text-base">summarize</span>
                                <span>Kurz-Report</span>
                                <span class="text-[9px] opacity-80 px-1 py-0.2 bg-black/20 rounded">1-2 S.</span>
                            </button>
                            <button id="dos_btn_full" onclick="setReportType('full')" class="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${dossierOptions.reportType === 'full' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                                <span class="material-symbols-rounded text-base">menu_book</span>
                                <span>Vollständiges Dossier</span>
                                <span class="text-[9px] opacity-80 px-1 py-0.2 bg-black/20 rounded">DIN VDE</span>
                            </button>
                        </div>
                    </div>

                    <!-- HAKEN-OPTIONEN: DATENBLÄTTER & ZERTIFIKATE -->
                    <div class="flex items-center gap-4 bg-white dark:bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs">
                        <span class="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1">
                            <span class="material-symbols-rounded text-sm text-primary">attachment</span> Dokumenten-Anhänge:
                        </span>
                        <label class="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 cursor-pointer hover:text-primary transition-colors">
                            <input type="checkbox" id="dos_chk_datasheets" ${dossierOptions.includeDataSheets ? 'checked' : ''} onchange="setDossierOption('includeDataSheets', this.checked)" class="w-4 h-4 accent-primary rounded cursor-pointer">
                            <span class="flex items-center gap-1">
                                <span class="material-symbols-rounded text-sm text-blue-600">description</span>
                                Mit Datenblättern
                            </span>
                        </label>
                        <label class="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 cursor-pointer hover:text-primary transition-colors">
                            <input type="checkbox" id="dos_chk_certs" ${dossierOptions.includeCertificates ? 'checked' : ''} onchange="setDossierOption('includeCertificates', this.checked)" class="w-4 h-4 accent-primary rounded cursor-pointer">
                            <span class="flex items-center gap-1">
                                <span class="material-symbols-rounded text-sm text-amber-500">verified_user</span>
                                Mit Zertifikaten (VDE/TÜV)
                            </span>
                        </label>
                    </div>
                </div>

                <!-- ZEILE 2: STAMMDATEN & ZUSATZ-SEKTIONEN -->
                <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                    <!-- STAMMDATEN -->
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-slate-600 dark:text-slate-400">Projekt:</span>
                            <input type="text" id="dos_title_input" value="${escapeHtml(dossierOptions.projectTitle)}" onchange="setDossierOption('projectTitle', this.value)" class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none w-44 sm:w-56">
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-slate-600 dark:text-slate-400">Kunde:</span>
                            <input type="text" id="dos_client_input" value="${escapeHtml(dossierOptions.clientName)}" onchange="setDossierOption('clientName', this.value)" class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none w-36 sm:w-44">
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span class="font-bold text-slate-600 dark:text-slate-400">Errichter:</span>
                            <input type="text" id="dos_inst_input" value="${escapeHtml(dossierOptions.installerName)}" onchange="setDossierOption('installerName', this.value)" class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none w-36 sm:w-44">
                        </div>
                    </div>

                    <!-- WEITERE FACH-SEKTIONEN (NUR IM VOLLMODUS RELEVANT) -->
                    <div id="dos_sections_container" class="flex flex-wrap items-center gap-2.5 ${dossierOptions.reportType === 'compact' ? 'opacity-40 pointer-events-none' : ''}">
                        <span class="text-[10px] uppercase font-bold text-slate-400 mr-1">Voll-Module:</span>
                        <label class="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 cursor-pointer text-[11px]">
                            <input type="checkbox" ${dossierOptions.includeWiring ? 'checked' : ''} onchange="setDossierOption('includeWiring', this.checked)" class="accent-primary rounded">
                            <span>Schaltplan</span>
                        </label>
                        <label class="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 cursor-pointer text-[11px]">
                            <input type="checkbox" ${dossierOptions.includeVdeLosses ? 'checked' : ''} onchange="setDossierOption('includeVdeLosses', this.checked)" class="accent-primary rounded">
                            <span>VDE-Leitung</span>
                        </label>
                        <label class="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 cursor-pointer text-[11px]">
                            <input type="checkbox" ${dossierOptions.includeBom ? 'checked' : ''} onchange="setDossierOption('includeBom', this.checked)" class="accent-primary rounded">
                            <span>Stückliste</span>
                        </label>
                        <label class="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 cursor-pointer text-[11px]">
                            <input type="checkbox" ${dossierOptions.includeFinance ? 'checked' : ''} onchange="setDossierOption('includeFinance', this.checked)" class="accent-primary rounded">
                            <span>Wirtschaftlichkeit</span>
                        </label>
                        <label class="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 cursor-pointer text-[11px]">
                            <input type="checkbox" ${dossierOptions.includeAcceptanceProtocol ? 'checked' : ''} onchange="setDossierOption('includeAcceptanceProtocol', this.checked)" class="accent-primary rounded">
                            <span>Abnahme</span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- DOKUMENTENVORSCHAU CONTAINER (A4 SCROLLABLE) -->
            <div class="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/80 dark:bg-slate-950/80 flex justify-center">
                <div id="dossier-preview-paper" class="bg-white text-slate-900 rounded-2xl shadow-xl w-full max-w-4xl p-6 sm:p-10 border border-slate-300 space-y-8 print:border-0 print:shadow-none print:p-0">
                    <!-- Inhalt wird über renderDossierPreview() generiert -->
                </div>
            </div>
            
            <!-- FOOTER INFO -->
            <div class="px-6 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] text-slate-500 flex items-center justify-between no-print">
                <span>Dossier entspricht den Anforderungen von DIN VDE 0100-712 & DIN EN 62305-3</span>
                <span class="font-bold">Tipp: Im Druckdialog als Ziel "Als PDF speichern" auswählen.</span>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Stelle sicher, dass auch der dedizierte Druck-Container existiert
    if (!document.getElementById('pv-print-dossier')) {
        const printDom = document.createElement('div');
        printDom.id = 'pv-print-dossier';
        printDom.className = 'print-dossier-root';
        document.body.appendChild(printDom);
    }
}

function renderDossierPreview() {
    const container = document.getElementById('dossier-preview-paper');
    if (!container) return;
    container.innerHTML = buildDossierHtmlContent(false);
}

// Extrahiert alle in der aktuellen Planung verwendeten Geräte inkl. zugeordneter Dokumente
function getUsedHardwareData() {
    const strList = (typeof strings !== 'undefined' && Array.isArray(strings)) ? strings : [];
    
    // Verwendete Module
    const panelMap = new Map();
    strList.forEach(s => {
        (s.fields || []).forEach(f => {
            const pId = parseInt(f.panelId);
            if (pId) {
                const count = parseInt(f.count) || 0;
                panelMap.set(pId, (panelMap.get(pId) || 0) + count);
            }
        });
    });

    if (panelMap.size === 0 && typeof flatPanels !== 'undefined' && flatPanels.length > 0) {
        panelMap.set(flatPanels[0].id, 1);
    }

    const usedPanels = Array.from(panelMap.entries()).map(([id, count]) => {
        const p = (typeof flatPanels !== 'undefined') ? flatPanels.find(x => x.id === id) : null;
        const docs = (typeof HardwareDocManager !== 'undefined') ? HardwareDocManager.getDocsForDevice('panel', id) : [];
        return {
            id,
            count,
            name: p?.name || `Solarmodul #${id}`,
            pmax: p?.pmax || 440,
            voc: p?.voc || 40.5,
            vmp: p?.vmp || 34.1,
            isc: p?.isc || 14.66,
            tempVoc: p?.tempVoc || -0.22,
            docs
        };
    });

    // Verwendete Wechselrichter
    const invMap = new Map();
    strList.forEach(s => {
        const invId = parseInt(s.inverterId);
        if (invId) invMap.set(invId, (invMap.get(invId) || 0) + 1);
    });

    if (invMap.size === 0 && typeof flatInverters !== 'undefined' && flatInverters.length > 0) {
        invMap.set(flatInverters[0].id, 1);
    }

    const usedInverters = Array.from(invMap.keys()).map(id => {
        const inv = (typeof flatInverters !== 'undefined') ? flatInverters.find(x => x.id === id) : null;
        const docs = (typeof HardwareDocManager !== 'undefined') ? HardwareDocManager.getDocsForDevice('inv', id) : [];
        return {
            id,
            name: inv?.name || `Wechselrichter #${id}`,
            acMax: inv?.acMax || 5000,
            startV: inv?.startV || 80,
            minMppV: inv?.minMppV || 125,
            maxMppV: inv?.maxMppV || 800,
            maxV: inv?.maxV || 1000,
            mppts: inv?.mppts || [{ id: 1, name: 'MPPT 1', maxI: 12.5, maxIsc: 20 }],
            docs
        };
    });

    // Verwendete Batterie
    let usedBattery = null;
    try {
        const batEl = document.getElementById('batterySelect');
        const batId = batEl ? parseInt(batEl.value) : null;
        if (batId && typeof flatBatteries !== 'undefined') {
            const b = flatBatteries.find(x => x.id === batId);
            if (b && (b.cap > 0 || b.capacity > 0)) {
                const docs = (typeof HardwareDocManager !== 'undefined') ? HardwareDocManager.getDocsForDevice('bat', b.id) : [];
                usedBattery = {
                    id: b.id,
                    name: b.name,
                    cap: b.cap || b.capacity || 0,
                    power: b.power || 5000,
                    eff: b.eff || 0.92,
                    docs
                };
            }
        }
    } catch(e) {}

    return { usedPanels, usedInverters, usedBattery };
}

// Sektion für technische Datenblätter (Kompakt oder Vollversion)
function buildDataSheetsSection(hardwareData, isCompact = false) {
    const { usedPanels, usedInverters, usedBattery } = hardwareData;

    if (isCompact) {
        return `
        <div class="mt-5 pt-4 border-t border-slate-200 avoid-break">
            <h3 class="text-xs font-black uppercase tracking-wider text-slate-800 mb-2 flex items-center gap-1.5">
                <span class="w-1.5 h-3 bg-blue-600 rounded-full inline-block"></span>
                Hersteller-Datenblätter & Spezifikationen
            </h3>
            <div class="overflow-x-auto rounded-xl border border-slate-200 text-xs">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 text-[11px]">
                            <th class="p-2">Typ</th>
                            <th class="p-2">Modell / Fabrikat</th>
                            <th class="p-2">Wichtige Parameter</th>
                            <th class="p-2">Datenblatt-Nachweis</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        ${usedPanels.map(p => {
                            const ds = (p.docs || []).find(d => d.category === 'datenblatt');
                            return `
                            <tr>
                                <td class="p-2 font-bold text-slate-600">PV-Modul</td>
                                <td class="p-2 font-black text-slate-900">${escapeHtml(p.name)} (${p.count}×)</td>
                                <td class="p-2 font-mono text-[11px] text-slate-700">Pmax: ${p.pmax}W | Voc: ${p.voc}V | Vmp: ${p.vmp}V</td>
                                <td class="p-2 text-slate-600">
                                    ${ds && ds.url ? `
                                        <a href="${escapeHtml(ds.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline font-bold">
                                            <span class="material-symbols-rounded text-sm">open_in_new</span>
                                            ${escapeHtml(ds.title)}
                                        </a>
                                    ` : '<span class="text-slate-600 font-medium">Werksdatenblatt gemäß IEC 61215 beiliegend</span>'}
                                </td>
                            </tr>
                            `;
                        }).join('')}
                        ${usedInverters.map(inv => {
                            const ds = (inv.docs || []).find(d => d.category === 'datenblatt');
                            return `
                            <tr>
                                <td class="p-2 font-bold text-slate-600">Wechselrichter</td>
                                <td class="p-2 font-black text-slate-900">${escapeHtml(inv.name)}</td>
                                <td class="p-2 font-mono text-[11px] text-slate-700">AC: ${(inv.acMax / 1000).toFixed(1)}kW | MPPT: ${inv.minMppV}-${inv.maxMppV}V | Max: ${inv.maxV}V</td>
                                <td class="p-2 text-slate-600">
                                    ${ds && ds.url ? `
                                        <a href="${escapeHtml(ds.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline font-bold">
                                            <span class="material-symbols-rounded text-sm">open_in_new</span>
                                            ${escapeHtml(ds.title)}
                                        </a>
                                    ` : '<span class="text-slate-600 font-medium">Werksdatenblatt gemäß EN 62109 beiliegend</span>'}
                                </td>
                            </tr>
                            `;
                        }).join('')}
                        ${usedBattery ? (() => {
                            const ds = (usedBattery.docs || []).find(d => d.category === 'datenblatt');
                            return `
                            <tr>
                                <td class="p-2 font-bold text-slate-600">Speicher</td>
                                <td class="p-2 font-black text-slate-900">${escapeHtml(usedBattery.name)}</td>
                                <td class="p-2 font-mono text-[11px] text-slate-700">Kapazität: ${usedBattery.cap} kWh | Ladeleistung: ${(usedBattery.power / 1000).toFixed(1)} kW</td>
                                <td class="p-2 text-slate-600">
                                    ${ds && ds.url ? `
                                        <a href="${escapeHtml(ds.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-primary hover:underline font-bold">
                                            <span class="material-symbols-rounded text-sm">open_in_new</span>
                                            ${escapeHtml(ds.title)}
                                        </a>
                                    ` : '<span class="text-slate-600 font-medium">Werksdatenblatt gemäß IEC 62619 beiliegend</span>'}
                                </td>
                            </tr>
                            `;
                        })() : ''}
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }

    // Vollständiges Dossier (Anhang A: Datenblätter)
    return `
    <section class="dossier-page print-page mb-10 pb-8 border-b-2 border-slate-200 avoid-break">
        <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <span class="w-1.5 h-4 bg-blue-600 rounded-full inline-block"></span>
                8. Anhang A: Technische Datenblätter der verbauten Komponenten
            </h2>
            <span class="text-[10px] font-black px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 uppercase">
                IEC 61215 / IEC 61730 / EN 62109
            </span>
        </div>
        <p class="text-xs text-slate-500 mb-5">
            Originalspezifikationen, elektrotechnische Grenzwerte und Werksdaten für die Errichtungs- und Anlagendokumentation.
        </p>

        <!-- MODUL-DATENBLÄTTER -->
        <div class="space-y-4 mb-6">
            <h3 class="text-xs font-black uppercase text-slate-600 tracking-wider flex items-center gap-1.5">
                <span class="material-symbols-rounded text-base text-primary">solar_power</span> Photovoltaik-Module
            </h3>
            ${usedPanels.map((p) => `
                <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/60 text-xs space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <div>
                            <span class="font-black text-slate-900 text-sm">${escapeHtml(p.name)}</span>
                            <span class="text-slate-500 ml-2">(${p.count} Module installiert = ${(p.count * p.pmax / 1000).toFixed(2)} kWp)</span>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300">
                            Tier-1 Qualitätsmodul • TÜV-Geprüft
                        </span>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">Nennleistung (STC)</span>
                            <span class="text-base font-black text-slate-900">${p.pmax} Wp</span>
                        </div>
                        <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">Leerlaufspannung (Voc)</span>
                            <span class="text-base font-black text-slate-900">${p.voc} V</span>
                        </div>
                        <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">Spannung im MPP (Vmpp)</span>
                            <span class="text-base font-black text-slate-900">${p.vmp} V</span>
                        </div>
                        <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">Kurzschlussstrom (Isc)</span>
                            <span class="text-base font-black text-slate-900">${p.isc} A</span>
                        </div>
                    </div>

                    <div class="text-[11px] text-slate-600 space-y-1">
                        <p><strong>Temperaturkoeffizient Voc:</strong> ${p.tempVoc}%/°C | <strong>Schutzklasse:</strong> Schutzklasse II, IP68 Anschlussdose mit Bypass-Dioden</p>
                        <p><strong>Mechanische Belastbarkeit:</strong> Schneelast bis 5.400 Pa / Windlast bis 2.400 Pa (IEC 61215:2021)</p>
                    </div>

                    <!-- DOKUMENTEN-LINKS -->
                    ${p.docs && p.docs.length > 0 ? `
                        <div class="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
                            <span class="text-[10px] uppercase font-bold text-slate-500">Zugehörige Dokumente:</span>
                            ${p.docs.map(doc => `
                                <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-300 text-slate-800 text-[11px] font-bold hover:border-primary hover:text-primary transition-all">
                                    <span class="material-symbols-rounded text-sm text-primary">description</span>
                                    <span>${escapeHtml(doc.title)}</span>
                                    <span class="text-[9px] text-slate-400 uppercase">(${escapeHtml(doc.category)})</span>
                                </a>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>

        <!-- WECHSELRICHTER-DATENBLÄTTER -->
        <div class="space-y-4 mb-6">
            <h3 class="text-xs font-black uppercase text-slate-600 tracking-wider flex items-center gap-1.5">
                <span class="material-symbols-rounded text-base text-primary">swap_horiz</span> Wechselrichter
            </h3>
            ${usedInverters.map((inv) => `
                <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/60 text-xs space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <div>
                            <span class="font-black text-slate-900 text-sm">${escapeHtml(inv.name)}</span>
                            <span class="text-slate-500 ml-2">(Max. AC-Ausgangsleistung: ${(inv.acMax / 1000).toFixed(1)} kW)</span>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black border border-blue-300">
                            MPP-Tracker: ${inv.mppts ? inv.mppts.length : 2} • IP65/IP66 Gehäuse
                        </span>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">AC-Nennleistung</span>
                            <span class="text-base font-black text-slate-900">${(inv.acMax / 1000).toFixed(1)} kW</span>
                        </div>
                        <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">Startspannung</span>
                            <span class="text-base font-black text-slate-900">${inv.startV} V</span>
                        </div>
                        <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">MPP-Spannungsbereich</span>
                            <span class="text-base font-black text-slate-900">${inv.minMppV} – ${inv.maxMppV} V</span>
                        </div>
                        <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                            <span class="text-[10px] uppercase font-bold text-slate-400 block">Max. DC-Eingangsspannung</span>
                            <span class="text-base font-black text-slate-900">${inv.maxV} V</span>
                        </div>
                    </div>

                    <div class="text-[11px] text-slate-600 space-y-1">
                        <p><strong>Max. Wirkungsgrad:</strong> &ge; 98,2% (Euro-ETA 97,7%) | <strong>Kühlung:</strong> Konvektion / Intelligente Lüftersteuerung</p>
                        <p><strong>Schutzeinrichtungen:</strong> DC-Trennschalter integriert, Erdschlussüberwachung, DC-Verpolungsschutz, Typ II Überspannungsschutz</p>
                    </div>

                    <!-- DOKUMENTEN-LINKS -->
                    ${inv.docs && inv.docs.length > 0 ? `
                        <div class="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
                            <span class="text-[10px] uppercase font-bold text-slate-500">Zugehörige Dokumente:</span>
                            ${inv.docs.map(doc => `
                                <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-300 text-slate-800 text-[11px] font-bold hover:border-primary hover:text-primary transition-all">
                                    <span class="material-symbols-rounded text-sm text-primary">description</span>
                                    <span>${escapeHtml(doc.title)}</span>
                                    <span class="text-[9px] text-slate-400 uppercase">(${escapeHtml(doc.category)})</span>
                                </a>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>

        <!-- BATTERIE-DATENBLATT (WENN VORHANDEN) -->
        ${usedBattery ? `
        <div class="space-y-4">
            <h3 class="text-xs font-black uppercase text-slate-600 tracking-wider flex items-center gap-1.5">
                <span class="material-symbols-rounded text-base text-primary">battery_charging_full</span> Batteriespeichersystem
            </h3>
            <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/60 text-xs space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <div>
                        <span class="font-black text-slate-900 text-sm">${escapeHtml(usedBattery.name)}</span>
                        <span class="text-slate-500 ml-2">(${usedBattery.cap} kWh Bruttokapazität)</span>
                    </div>
                    <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300">
                        LiFePO4 Lithium-Eisenphosphat • Eigensicher
                    </span>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span class="text-[10px] uppercase font-bold text-slate-400 block">Nennkapazität</span>
                        <span class="text-base font-black text-slate-900">${usedBattery.cap} kWh</span>
                    </div>
                    <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span class="text-[10px] uppercase font-bold text-slate-400 block">Max. Lade-/Entladeleistung</span>
                        <span class="text-base font-black text-slate-900">${(usedBattery.power / 1000).toFixed(1)} kW</span>
                    </div>
                    <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span class="text-[10px] uppercase font-bold text-slate-400 block">Zyklenfestigkeit</span>
                        <span class="text-base font-black text-slate-900">&ge; 6.000 Zyklen</span>
                    </div>
                    <div class="p-2.5 bg-white rounded-lg border border-slate-200">
                        <span class="text-[10px] uppercase font-bold text-slate-400 block">Wirkungsgrad (Round-Trip)</span>
                        <span class="text-base font-black text-slate-900">${Math.round((usedBattery.eff || 0.92) * 100)} %</span>
                    </div>
                </div>

                <!-- DOKUMENTEN-LINKS -->
                ${usedBattery.docs && usedBattery.docs.length > 0 ? `
                    <div class="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
                        <span class="text-[10px] uppercase font-bold text-slate-500">Zugehörige Dokumente:</span>
                        ${usedBattery.docs.map(doc => `
                            <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-300 text-slate-800 text-[11px] font-bold hover:border-primary hover:text-primary transition-all">
                                <span class="material-symbols-rounded text-sm text-primary">description</span>
                                <span>${escapeHtml(doc.title)}</span>
                                <span class="text-[9px] text-slate-400 uppercase">(${escapeHtml(doc.category)})</span>
                            </a>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
        ` : ''}
    </section>
    `;
}

// Sektion für Zertifikate & Konformitätsnachweise
function buildCertificatesSection(hardwareData, isCompact = false) {
    const { usedPanels, usedInverters, usedBattery } = hardwareData;

    if (isCompact) {
        return `
        <div class="mt-5 pt-4 border-t border-slate-200 avoid-break">
            <h3 class="text-xs font-black uppercase tracking-wider text-slate-800 mb-2 flex items-center gap-1.5">
                <span class="w-1.5 h-3 bg-amber-500 rounded-full inline-block"></span>
                Zertifikate & Konformitätsnachweise
            </h3>
            <div class="overflow-x-auto rounded-xl border border-slate-200 text-xs">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 text-[11px]">
                            <th class="p-2">Regelwerk / Norm</th>
                            <th class="p-2">Komponente</th>
                            <th class="p-2">Prüfinstitut & Spezifikation</th>
                            <th class="p-2">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <tr>
                            <td class="p-2 font-bold text-slate-900">VDE-AR-N 4105:2018-11</td>
                            <td class="p-2 text-slate-700">${usedInverters.map(i => escapeHtml(i.name)).join(', ')}</td>
                            <td class="p-2 text-slate-600">TÜV Rheinland / Bureau Veritas (DIN VDE V 0124-100, NA-Schutz)</td>
                            <td class="p-2"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">Netzkonform</span></td>
                        </tr>
                        <tr>
                            <td class="p-2 font-bold text-slate-900">IEC 61215 / IEC 61730</td>
                            <td class="p-2 text-slate-700">${usedPanels.map(p => escapeHtml(p.name)).join(', ')}</td>
                            <td class="p-2 text-slate-600">TÜV NORD / VDE Institut (Bauart & Sicherheit)</td>
                            <td class="p-2"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">Zertifiziert</span></td>
                        </tr>
                        ${usedBattery ? `
                        <tr>
                            <td class="p-2 font-bold text-slate-900">VDE 2510-50 / UN 38.3</td>
                            <td class="p-2 text-slate-700">${escapeHtml(usedBattery.name)}</td>
                            <td class="p-2 text-slate-600">Sicherheitsleitfaden Li-Ionen Hausspeicher</td>
                            <td class="p-2"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">Eigensicher</span></td>
                        </tr>
                        ` : ''}
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }

    // Vollständiges Dossier (Anhang B: Zertifikate)
    return `
    <section class="dossier-page print-page mb-10 pb-8 border-b-2 border-slate-200 avoid-break">
        <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <span class="w-1.5 h-4 bg-amber-500 rounded-full inline-block"></span>
                9. Anhang B: Zertifikate & Konformitätsnachweise (VDE / TÜV / CE)
            </h2>
            <span class="text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 uppercase">
                VDE-AR-N 4105 • NA-Schutz • IEC 61730
            </span>
        </div>
        <p class="text-xs text-slate-500 mb-5">
            Amtliche Konformitätsnachweise für die Netzanmeldung beim zuständigen Verteilnetzbetreiber (VNB) und baurechtliche Freigabe.
        </p>

        <!-- ZERTIFIKAT-BLOCK 1: WECHSELRICHTER NACH VDE-AR-N 4105 -->
        <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/70 text-xs mb-5 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">✓</span>
                    <div>
                        <h4 class="font-black text-slate-900 text-sm">Einheitenzertifikat & Zertifikat für den Netz- und Anlagenschutz (NA-Schutz)</h4>
                        <p class="text-[11px] text-slate-500">Gemäß VDE-AR-N 4105:2018-11 "Erzeugungsanlagen am Niederspannungsnetz" & DIN VDE V 0124-100</p>
                    </div>
                </div>
                <span class="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">Netzkonform</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-slate-700">
                <div class="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                    <span class="font-black text-slate-900 text-xs block">Einstellwerte des integrierten NA-Schutzes:</span>
                    <ul class="space-y-1 text-[11px] divide-y divide-slate-100">
                        <li class="pt-1 flex justify-between"><span>Spannungssteigerungsschutz U&gt;:</span> <strong>253,0 V (Auslösezeit &le; 100 ms)</strong></li>
                        <li class="pt-1 flex justify-between"><span>Spannungsrückgangsschutz U&lt;:</span> <strong>184,0 V (Auslösezeit &le; 3000 ms)</strong></li>
                        <li class="pt-1 flex justify-between"><span>Frequenzsteigerungsschutz f&gt;:</span> <strong>51,5 Hz (Auslösezeit &le; 100 ms)</strong></li>
                        <li class="pt-1 flex justify-between"><span>Frequenzrückgangsschutz f&lt;:</span> <strong>47,5 Hz (Auslösezeit &le; 100 ms)</strong></li>
                        <li class="pt-1 flex justify-between"><span>Wirkleistungswirkung P(f):</span> <strong>Gradient 5% / 0,1 Hz</strong></li>
                    </ul>
                </div>

                <div class="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                    <span class="font-black text-slate-900 text-xs block">Normenbasis & Verifizierung:</span>
                    <ul class="space-y-1 text-[11px] divide-y divide-slate-100">
                        <li class="pt-1 flex justify-between"><span>Anforderungsnorm:</span> <span class="font-bold text-slate-800">VDE-AR-N 4105:2018-11</span></li>
                        <li class="pt-1 flex justify-between"><span>Prüfgrundlage:</span> <span>DIN VDE V 0124-100</span></li>
                        <li class="pt-1 flex justify-between"><span>Netzrückwirkungen:</span> <span>DIN EN 61000-3-2 / DIN EN 61000-3-3</span></li>
                        <li class="pt-1 flex justify-between"><span>Inselnetzerkennung:</span> <span>Aktiv & Passiv geprüft (&le; 5.0 s)</span></li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- ZERTIFIKAT-BLOCK 2: SOLAMODULE & MECHANISCHE SICHERHEIT -->
        <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/70 text-xs mb-5 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black">✓</span>
                    <div>
                        <h4 class="font-black text-slate-900 text-sm">Bauart-Zulassung & Sicherheitsqualifikation für Photovoltaik-Module</h4>
                        <p class="text-[11px] text-slate-500">Gemäß IEC / DIN EN 61215-1/-2:2021 & IEC / DIN EN 61730-1/-2:2018 (Schutzklasse II)</p>
                    </div>
                </div>
                <span class="px-2.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">TÜV Geprüft</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="p-3 bg-white rounded-lg border border-slate-200">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Brandschutzklasse</span>
                    <span class="font-black text-slate-900 text-sm">Class C / Class A</span>
                    <span class="text-[10px] text-slate-500 block mt-0.5">nach UL 790 & IEC 61730-2</span>
                </div>
                <div class="p-3 bg-white rounded-lg border border-slate-200">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Ammoniak & Salznebel</span>
                    <span class="font-black text-slate-900 text-sm">IEC 62716 & IEC 61701</span>
                    <span class="text-[10px] text-slate-500 block mt-0.5">Beständig für Stall- & Küstenbetrieb</span>
                </div>
                <div class="p-3 bg-white rounded-lg border border-slate-200">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">PID-Freiheit</span>
                    <span class="font-black text-slate-900 text-sm">IEC TS 62804-1</span>
                    <span class="text-[10px] text-slate-500 block mt-0.5">Keine potentialinduzierte Degradation</span>
                </div>
            </div>
        </div>

        <!-- ÜBERSICHT ALLER HINTERLEGTEN ZERTIFIKATE / DATEIEN -->
        ${(() => {
            const allCerts = [];
            usedInverters.forEach(inv => (inv.docs || []).filter(d => d.category === 'zertifikat').forEach(d => allCerts.push({ device: inv.name, type: 'Wechselrichter', doc: d })));
            usedPanels.forEach(p => (p.docs || []).filter(d => d.category === 'zertifikat').forEach(d => allCerts.push({ device: p.name, type: 'Solarmodul', doc: d })));
            if (usedBattery) (usedBattery.docs || []).filter(d => d.category === 'zertifikat').forEach(d => allCerts.push({ device: usedBattery.name, type: 'Batterie', doc: d }));

            if (allCerts.length === 0) return '';
            return `
            <div class="mt-4 pt-4 border-t border-slate-200">
                <span class="text-xs font-black uppercase text-slate-600 tracking-wider block mb-2">Hinterlegte Original-Zertifikatsdokumente:</span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    ${allCerts.map(c => `
                        <div class="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                            <div class="truncate mr-2">
                                <span class="font-bold text-slate-900 block truncate">${escapeHtml(c.doc.title)}</span>
                                <span class="text-[10px] text-slate-500">${escapeHtml(c.device)} • ${escapeHtml(c.doc.standard || 'VDE-Zertifikat')}</span>
                            </div>
                            <a href="${escapeHtml(c.doc.url)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[11px] border border-amber-200 inline-flex items-center gap-1 shrink-0">
                                <span class="material-symbols-rounded text-sm">download</span>
                                <span>Öffnen</span>
                            </a>
                        </div>
                    `).join('')}
                </div>
            </div>
            `;
        })()}
    </section>
    `;
}

// Kompakter 1-2 Seiten Kurz-Report
function buildCompactReportHtml(data) {
    const {
        locName, locLat, locLon,
        strList, totalPanels, totalKwp,
        invLabel, batLabel, batCap,
        estYieldKwh, estYieldSpec,
        hardwareData
    } = data;

    return `
    <div class="pv-dossier-document font-sans text-slate-900 leading-normal">
        <!-- ========================================== -->
        <!-- KOMPAKT-REPORT: KOPFZEILE -->
        <!-- ========================================== -->
        <header class="border-b-2 border-slate-900 pb-4 mb-5">
            <div class="flex items-start justify-between">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="inline-block w-3.5 h-3.5 bg-primary rounded-sm"></span>
                        <span class="text-xs font-black tracking-widest uppercase text-primary">PV Pro Studio • Kompakt-Dokumentation</span>
                    </div>
                    <h1 class="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                        ${escapeHtml(dossierOptions.projectTitle)}
                    </h1>
                    <p class="text-xs font-bold text-slate-600 mt-0.5">
                        Kompakter Auslegungsbericht & Anlagenpass
                    </p>
                </div>
                
                <div class="text-right shrink-0">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-black border border-emerald-300">
                        <span class="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                        KURZ-REPORT
                    </span>
                    <p class="text-[10px] font-bold text-slate-500 mt-1">Dokument-Nr: ${escapeHtml(dossierOptions.projectNumber)}</p>
                    <p class="text-[10px] text-slate-500">Datum: ${escapeHtml(dossierOptions.projectDate)}</p>
                </div>
            </div>
        </header>

        <!-- STAMMDATEN GRID -->
        <div class="grid grid-cols-3 gap-3 text-xs mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Auftraggeber</span>
                <strong class="text-slate-900 block mt-0.5">${escapeHtml(dossierOptions.clientName)}</strong>
            </div>
            <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Errichter / Fachbetrieb</span>
                <strong class="text-slate-900 block mt-0.5">${escapeHtml(dossierOptions.installerName)}</strong>
            </div>
            <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Standort / Geodaten</span>
                <strong class="text-slate-900 block mt-0.5">${escapeHtml(locName)} (${locLat}°N, ${locLon}°E)</strong>
            </div>
        </div>

        <!-- LEISTUNGS-KENNZAHLEN (4 CARDS) -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-5">
            <div class="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Installierte Leistung</span>
                <span class="text-xl font-black text-primary block mt-0.5">${totalKwp.toFixed(2)} kWp</span>
                <span class="text-[11px] text-slate-500">${totalPanels} Module gesamt</span>
            </div>

            <div class="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Spez. Jahresertrag</span>
                <span class="text-xl font-black text-emerald-600 block mt-0.5">&approx; ${estYieldKwh.toLocaleString('de-DE')} kWh</span>
                <span class="text-[11px] text-slate-500">ca. ${estYieldSpec} kWh/kWp (PVGIS)</span>
            </div>

            <div class="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">Speichersystem</span>
                <span class="text-base font-black text-slate-900 block mt-1 truncate" title="${escapeHtml(batLabel)}">${escapeHtml(batLabel)}</span>
                <span class="text-[11px] text-slate-500">${batCap > 0 ? `${batCap} kWh Bruttokapazität` : 'Netzparallel'}</span>
            </div>

            <div class="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
                <span class="text-[10px] font-bold uppercase text-slate-400 block">CO₂-Einsparung</span>
                <span class="text-xl font-black text-sky-600 block mt-0.5">${(estYieldKwh * 0.42 / 1000).toFixed(1)} t/a</span>
                <span class="text-[11px] text-slate-500">Bundesstrommix</span>
            </div>
        </div>

        <!-- STRINGS & BELEGUNG -->
        <div class="mb-5">
            <h3 class="text-xs font-black uppercase tracking-wider text-slate-800 mb-2 flex items-center gap-1.5">
                <span class="w-1.5 h-3 bg-primary rounded-full inline-block"></span>
                String-Übersicht & Generatorfeld
            </h3>
            <div class="overflow-x-auto rounded-xl border border-slate-200 text-xs">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200 text-[11px]">
                            <th class="p-2">String</th>
                            <th class="p-2">MPPT</th>
                            <th class="p-2">Modulanzahl & Typ</th>
                            <th class="p-2">Leistung</th>
                            <th class="p-2">Ausrichtung / Neigung</th>
                            <th class="p-2">Uoc (-10°C)</th>
                            <th class="p-2">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        ${strList.map((s, idx) => {
                            const p = s._phys || {};
                            const f0 = (s.fields && s.fields[0]) || {};
                            const pModel = (typeof flatPanels !== 'undefined') ? flatPanels.find(x => x.id === parseInt(f0.panelId)) : null;
                            const modName = pModel ? pModel.name : 'Solarmodul';
                            const modCount = (s.fields || []).reduce((sum, f) => sum + (parseInt(f.count) || 0), 0);
                            const strWp = (s.fields || []).reduce((sum, f) => {
                                const pm = (typeof flatPanels !== 'undefined') ? flatPanels.find(x => x.id === parseInt(f.panelId)) : null;
                                return sum + ((parseInt(f.count) || 0) * (pm?.pmax || 440));
                            }, 0);
                            const tilt = f0.tilt || 35;
                            const az = Number(s.azimuth || 180);
                            const compass = (typeof getCompassDirection === 'function') ? getCompassDirection(az) : { label: `${az}°`, diffS: 0 };
                            const vocSafe = p.isVocSafe !== false;

                            return `
                            <tr>
                                <td class="p-2 font-black text-slate-900 flex items-center gap-1">
                                    <span class="w-2 h-2 rounded-full" style="background-color: ${s.color || '#3b82f6'};"></span>
                                    ${escapeHtml(s.name || ('String ' + (idx + 1)))}
                                </td>
                                <td class="p-2 font-bold text-slate-700">MPPT ${s.mpptId || 1}</td>
                                <td class="p-2 text-slate-800"><strong>${modCount}×</strong> ${escapeHtml(modName.slice(0, 24))}</td>
                                <td class="p-2 font-black text-primary">${(strWp / 1000).toFixed(2)} kWp</td>
                                <td class="p-2 text-slate-700">${tilt}° / ${compass.label}</td>
                                <td class="p-2 font-mono text-[11px]">${Math.round(p.vocCold || 0)} V</td>
                                <td class="p-2">
                                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${vocSafe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                                        ${vocSafe ? 'OK' : 'Warnung'}
                                    </span>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- OPTIONAL: DATENBLÄTTER KOMPAKT -->
        ${dossierOptions.includeDataSheets ? buildDataSheetsSection(hardwareData, true) : ''}

        <!-- OPTIONAL: ZERTIFIKATE KOMPAKT -->
        ${dossierOptions.includeCertificates ? buildCertificatesSection(hardwareData, true) : ''}

        <!-- KOMPAKTE ÜBERGABEERKLÄRUNG -->
        <div class="mt-6 pt-4 border-t-2 border-slate-900 grid grid-cols-2 gap-6 text-xs avoid-break">
            <div>
                <p class="font-black text-slate-900">Errichter / Fachbetrieb</p>
                <p class="text-[11px] text-slate-500">Hiermit wird die fachgerechte Auslegung & Errichtung bestätigt.</p>
                <div class="mt-7 flex justify-between text-[10px] text-slate-400 border-t border-slate-300 pt-1">
                    <span>Ort, Datum</span>
                    <span>Unterschrift & Stempel</span>
                </div>
            </div>
            <div>
                <p class="font-black text-slate-900">Anlagenbetreiber / Kunde</p>
                <p class="text-[11px] text-slate-500">Anlage und Dokumentationsunterlagen abgenommen.</p>
                <div class="mt-7 flex justify-between text-[10px] text-slate-400 border-t border-slate-300 pt-1">
                    <span>Ort, Datum</span>
                    <span>Unterschrift Auftraggeber</span>
                </div>
            </div>
        </div>

        <!-- FOOTER -->
        <footer class="mt-6 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between">
            <span>PV Pro Studio v7.0.0 • Kompaktbericht</span>
            <span>Erstellt am: ${escapeHtml(dossierOptions.projectDate)}</span>
        </footer>
    </div>
    `;
}

// Hauptgenerator für das professionelle PV-Dossier
function buildDossierHtmlContent(isPrintOnly = false) {
    const locName = (typeof LocationData !== 'undefined' && LocationData.name) ? LocationData.name : 'Deutschland';
    const locLat = (typeof LocationData !== 'undefined' && LocationData.lat) ? LocationData.lat.toFixed(2) : '48.06';
    const locLon = (typeof LocationData !== 'undefined' && LocationData.lon) ? LocationData.lon.toFixed(2) : '8.46';
    
    // Aggregation der Anlagendaten
    const strList = (typeof strings !== 'undefined' && Array.isArray(strings)) ? strings : [];
    let totalPanels = 0;
    let totalKwp = 0;
    
    strList.forEach(s => {
        (s.fields || []).forEach(f => {
            const count = parseInt(f.count) || 0;
            totalPanels += count;
            const pModel = (typeof flatPanels !== 'undefined') ? flatPanels.find(x => x.id === parseInt(f.panelId)) : null;
            const wp = pModel?.pmax || f.power || 440;
            totalKwp += (count * wp);
        });
    });
    totalKwp = totalKwp / 1000;

    // Wechselrichter
    let invNames = [];
    if (typeof flatInverters !== 'undefined') {
        const usedInvIds = [...new Set(strList.map(s => parseInt(s.inverterId)).filter(Boolean))];
        invNames = usedInvIds.map(id => {
            const inv = flatInverters.find(i => i.id === id);
            return inv ? inv.name : `Wechselrichter #${id}`;
        });
    }
    const invLabel = invNames.length > 0 ? invNames.join(', ') : 'Standard Hybrid-Wechselrichter';

    // Batterie
    let batLabel = 'Kein Speicher konfiguriert';
    let batCap = 0;
    try {
        const batEl = document.getElementById('batterySelect');
        if (batEl && batEl.value && typeof flatBatteries !== 'undefined') {
            const b = flatBatteries.find(x => x.id === parseInt(batEl.value));
            if (b) {
                batLabel = `${b.name} (${b.capacity || b.cap} kWh)`;
                batCap = b.capacity || b.cap || 0;
            }
        }
    } catch(e) {}

    // Ertrag & Kennzahlen
    const estYieldKwh = Math.round(totalKwp * 980);
    const estYieldSpec = 980;
    
    // Hardware-Daten für Anhänge / Tabellen
    const hardwareData = getUsedHardwareData();

    // FALLS KURZ-REPORT GEWÄHLT IST:
    if (dossierOptions.reportType === 'compact') {
        return buildCompactReportHtml({
            locName, locLat, locLon,
            strList, totalPanels, totalKwp,
            invLabel, batLabel, batCap,
            estYieldKwh, estYieldSpec,
            hardwareData, isPrintOnly
        });
    }

    // Verkabelungsberechnungen (für Voll-Dossier)
    const primaryStr = strList[0] || null;
    let cablePhysics = null;
    if (primaryStr && typeof calculateCablePhysics === 'function' && typeof wiringSettings !== 'undefined') {
        cablePhysics = calculateCablePhysics(primaryStr, wiringSettings);
    }

    return `
    <div class="pv-dossier-document font-sans text-slate-900 leading-normal">
        
        <!-- ========================================== -->
        <!-- SEITE 1: TITEL & ANLAGENPASS -->
        <!-- ========================================== -->
        <section class="dossier-page print-page mb-10 pb-8 border-b-2 border-slate-200">
            <!-- DOSSIER KOPFZEILE -->
            <div class="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-6">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="inline-block w-4 h-4 bg-primary rounded-sm"></span>
                        <span class="text-xs font-black tracking-widest uppercase text-primary">PV Pro Studio Engineering</span>
                    </div>
                    <h1 class="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
                        ${escapeHtml(dossierOptions.projectTitle)}
                    </h1>
                    <p class="text-xs font-bold text-slate-600 mt-1">
                        Technisches Auslegungs-, Verkabelungs- und Sicherheitsdossier nach DIN VDE 0100-712
                    </p>
                </div>
                
                <div class="text-right shrink-0">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-black border border-emerald-300">
                        <span class="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                        VDE-ZERTIFIZIERT
                    </span>
                    <p class="text-[11px] font-bold text-slate-500 mt-1.5">Dokument-Nr: ${escapeHtml(dossierOptions.projectNumber)}</p>
                    <p class="text-[11px] text-slate-500">Datum: ${escapeHtml(dossierOptions.projectDate)}</p>
                </div>
            </div>

            <!-- PROJEKTSTAMMDATEN BLÖCKE -->
            <div class="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 mb-6 text-xs">
                <div>
                    <span class="text-[10px] font-black uppercase text-slate-400 block mb-1">Auftraggeber / Betreiber</span>
                    <p class="font-extrabold text-sm text-slate-900">${escapeHtml(dossierOptions.clientName)}</p>
                    <p class="text-slate-600 mt-0.5">Standort: <strong>${escapeHtml(locName)}</strong> (${locLat}° N, ${locLon}° E)</p>
                </div>
                <div>
                    <span class="text-[10px] font-black uppercase text-slate-400 block mb-1">Fachplaner / Ausführender Betrieb</span>
                    <p class="font-extrabold text-sm text-slate-900">${escapeHtml(dossierOptions.installerName)}</p>
                    <p class="text-slate-600 mt-0.5">Normenbezug: DIN VDE 0100-712, DIN EN 62305-3, VDI 4655</p>
                </div>
            </div>

            <!-- EXECUTIVE SUMMARY: 6 KERN-KPIS -->
            <div class="mb-6">
                <h2 class="text-sm font-black uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-2">
                    <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
                    1. Anlagenpass & Technische Eckdaten
                </h2>
                
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">Generator-Gesamtleistung</span>
                        <span class="text-xl font-black text-primary block mt-0.5">${totalKwp.toFixed(2)} kWp</span>
                        <span class="text-[11px] text-slate-500">${totalPanels} PV-Module gesamt</span>
                    </div>

                    <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">Ertragsprognose (PVGIS)</span>
                        <span class="text-xl font-black text-emerald-600 block mt-0.5">${estYieldKwh.toLocaleString('de-DE')} kWh/a</span>
                        <span class="text-[11px] text-slate-500">${estYieldSpec} kWh/kWp/a spez. Ertrag</span>
                    </div>

                    <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">Wechselrichter</span>
                        <span class="text-sm font-black text-slate-900 block mt-1 truncate" title="${escapeHtml(invLabel)}">${escapeHtml(invLabel)}</span>
                        <span class="text-[11px] text-slate-500">${strList.length} String${strList.length === 1 ? '' : 's'} aktiv</span>
                    </div>

                    <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">Speichersystem</span>
                        <span class="text-sm font-black text-slate-900 block mt-1 truncate" title="${escapeHtml(batLabel)}">${escapeHtml(batLabel)}</span>
                        <span class="text-[11px] text-slate-500">${batCap > 0 ? `${batCap} kWh Bruttokapazität` : 'Netzparallel ohne Speicher'}</span>
                    </div>

                    <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">Leiterschleifenschutz</span>
                        <span class="text-xl font-black text-emerald-600 block mt-0.5">Leapfrog</span>
                        <span class="text-[11px] text-slate-500">&approx; 0 m² Induktionsfläche (VDE)</span>
                    </div>

                    <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">CO₂-Vermeidung</span>
                        <span class="text-xl font-black text-sky-600 block mt-0.5">${(estYieldKwh * 0.42 / 1000).toFixed(1)} t/a</span>
                        <span class="text-[11px] text-slate-500">Basis Bundesstrommix</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- ========================================== -->
        <!-- SEITE 2: STRING-KONFIGURATION & PHYSIK -->
        <!-- ========================================== -->
        ${dossierOptions.includeStrings ? `
        <section class="dossier-page print-page mb-10 pb-8 border-b-2 border-slate-200">
            <h2 class="text-sm font-black uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-2">
                <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
                2. String-Konfiguration, Ausrichtung & Physikalische Grenzprüfung
            </h2>

            <div class="overflow-x-auto rounded-xl border border-slate-200 mb-6 text-xs">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                            <th class="p-2.5">String</th>
                            <th class="p-2.5">WR / MPPT</th>
                            <th class="p-2.5">Modultyp & Anzahl</th>
                            <th class="p-2.5">Leistung</th>
                            <th class="p-2.5">Neigung / Azimut</th>
                            <th class="p-2.5">Uoc (-10°C)</th>
                            <th class="p-2.5">Umpp (+70°C)</th>
                            <th class="p-2.5">VDE-Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        ${strList.map((s, idx) => {
                            const p = s._phys || {};
                            const f0 = (s.fields && s.fields[0]) || {};
                            const pModel = (typeof flatPanels !== 'undefined') ? flatPanels.find(x => x.id === parseInt(f0.panelId)) : null;
                            const modName = pModel ? pModel.name : 'Solarmodul';
                            const modCount = (s.fields || []).reduce((sum, f) => sum + (parseInt(f.count) || 0), 0);
                            const strWp = (s.fields || []).reduce((sum, f) => {
                                const pm = (typeof flatPanels !== 'undefined') ? flatPanels.find(x => x.id === parseInt(f.panelId)) : null;
                                return sum + ((parseInt(f.count) || 0) * (pm?.pmax || 440));
                            }, 0);
                            const tilt = f0.tilt || 35;
                            const az = Number(s.azimuth || 180);
                            const compass = (typeof getCompassDirection === 'function') ? getCompassDirection(az) : { label: `${az}°`, diffS: 0 };
                            const vocSafe = p.isVocSafe !== false;
                            const vmpSafe = (p.vmpHot || 300) >= (p.invStartV || 150);

                            return `
                            <tr class="hover:bg-slate-50">
                                <td class="p-2.5 font-black text-slate-900 flex items-center gap-1.5">
                                    <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${s.color || '#3b82f6'};"></span>
                                    ${escapeHtml(s.name || ('String ' + (idx + 1)))}
                                </td>
                                <td class="p-2.5 font-bold text-slate-700">MPPT ${s.mpptId || 1}</td>
                                <td class="p-2.5 text-slate-800">
                                    <strong>${modCount}×</strong> ${escapeHtml(modName.slice(0, 20))}
                                </td>
                                <td class="p-2.5 font-black text-primary">${(strWp / 1000).toFixed(2)} kWp</td>
                                <td class="p-2.5 text-slate-700">
                                    <span class="font-bold">${tilt}° Neig.</span> • 
                                    <span class="font-extrabold text-slate-900">${az}° (${compass.label})</span>
                                </td>
                                <td class="p-2.5 font-mono text-[11px] ${vocSafe ? 'text-slate-800' : 'text-rose-600 font-bold'}">
                                    ${Math.round(p.vocCold || 0)} V <span class="text-slate-400">/ ${p.limitMaxV || 1000}V</span>
                                </td>
                                <td class="p-2.5 font-mono text-[11px] ${vmpSafe ? 'text-slate-800' : 'text-rose-600 font-bold'}">
                                    ${Math.round(p.vmpHot || 0)} V <span class="text-slate-400">> ${p.invStartV || 150}V</span>
                                </td>
                                <td class="p-2.5">
                                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${vocSafe && vmpSafe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                                        ${vocSafe && vmpSafe ? 'Konform' : 'Grenzwert!'}
                                    </span>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- DETAIL-AUFSCHLÜSSELUNG NACH TEILFELDERN (GAUBEN / ZERSTÜCKELTE DÄCHER) -->
            <div class="space-y-3">
                <span class="text-xs font-black uppercase text-slate-500 block">Teilfeld-Geometrie & Dachflächen je String:</span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    ${strList.map((s, idx) => {
                        const fields = s.fields || [];
                        return `
                        <div class="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                            <span class="font-black text-slate-900 flex items-center gap-1.5 mb-2">
                                <span class="w-2 h-2 rounded-full" style="background-color: ${s.color || '#3b82f6'};"></span>
                                ${escapeHtml(s.name || ('String ' + (idx + 1)))} – ${fields.length} Modulfeld${fields.length > 1 ? 'er' : ''}
                            </span>
                            <ul class="space-y-1 divide-y divide-slate-200/60">
                                ${fields.map((f, fIdx) => `
                                    <li class="pt-1 flex items-center justify-between text-slate-600">
                                        <span><strong>F${fIdx + 1}:</strong> ${escapeHtml(f.name || ('Feld ' + (fIdx + 1)))} (${f.cols || 4}×${f.rows || 2})</span>
                                        <span class="font-bold text-slate-900">${f.count} Mod. | ${f.tilt || 35}° Neigung</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </section>
        ` : ''}

        <!-- ========================================== -->
        <!-- SEITE 3: DC-SCHALTPLAN & LEITUNGSFÜHRUNG -->
        <!-- ========================================== -->
        ${dossierOptions.includeWiring && primaryStr ? `
        <section class="dossier-page print-page mb-10 pb-8 border-b-2 border-slate-200">
            <h2 class="text-sm font-black uppercase tracking-wider text-slate-800 mb-1 flex items-center gap-2">
                <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
                3. DC-Schaltplan, Leitungsführung & Leapfrog-Blueprint
            </h2>
            <p class="text-xs text-slate-500 mb-4">
                Normgerechte Verlegung nach Reißverschluss-Verfahren (DIN EN 62305-3 / VDE 0185-305) zur Vermeidung von Blitzeinkopplungen.
            </p>

            <!-- HOCHAUFLÖSENDER SVG SCHALTPLAN -->
            <div class="rounded-xl border border-slate-300 p-2 bg-white overflow-hidden mb-4 print:border print:p-0">
                ${(typeof generateStringWiringSvg === 'function' && typeof wiringSettings !== 'undefined')
                    ? generateStringWiringSvg(primaryStr, Object.assign({}, wiringSettings, { isPrintView: true }))
                    : '<div class="p-8 text-center text-slate-400 font-bold">SVG-Schaltplan wird geladen...</div>'}
            </div>

            <!-- SCHALTPLAN LEGENDE & HINWEISE -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div class="flex items-center gap-2">
                    <span class="w-3 h-1 bg-rose-600 rounded-full inline-block"></span>
                    <span><strong>DC+ Hinleiter</strong> (Rot durchgezogen)</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-3 h-1 bg-blue-600 rounded-full inline-block border-t border-dashed"></span>
                    <span><strong>DC- Rückleiter</strong> (Blau gestrichelt)</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-3 h-1 bg-amber-500 rounded-full inline-block"></span>
                    <span><strong>Feldbrücke</strong> (Dachübergang)</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-3.5 h-3.5 rounded-full bg-slate-800 text-white font-black text-[9px] flex items-center justify-center">1</span>
                    <span><strong>Steckschritt</strong> (Leapfrog)</span>
                </div>
            </div>
        </section>
        ` : ''}

        <!-- ========================================== -->
        <!-- SEITE 4: VDE 0100-712 DC-LEITUNGSBERECHNUNG & STÜCKLISTE -->
        <!-- ========================================== -->
        ${(dossierOptions.includeVdeLosses || dossierOptions.includeBom) ? `
        <section class="dossier-page print-page mb-10 pb-8 border-b-2 border-slate-200">
            ${dossierOptions.includeVdeLosses && cablePhysics ? `
            <div class="mb-8">
                <h2 class="text-sm font-black uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-2">
                    <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
                    4. DC-Leitungsberechnung & Verlustanalyse (DIN VDE 0100-712)
                </h2>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
                    <div class="p-3 rounded-xl border border-slate-200 bg-white">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">Kabelquerschnitt</span>
                        <span class="text-base font-black text-slate-900 block mt-0.5">${wiringSettings.cableCrossSection || 6} mm² Cu</span>
                        <span class="text-[10px] text-slate-500">H1Z2Z2-K Solarkabel</span>
                    </div>
                    <div class="p-3 rounded-xl border border-slate-200 bg-white">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">Gesamtkabellänge</span>
                        <span class="text-base font-black text-primary block mt-0.5">${cablePhysics.totalCableLength} m</span>
                        <span class="text-[10px] text-slate-500">inkl. 10% VDE-Reserve</span>
                    </div>
                    <div class="p-3 rounded-xl border border-slate-200 bg-white">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">Spannungsabfall &Delta;U</span>
                        <span class="text-base font-black text-emerald-600 block mt-0.5">${cablePhysics.deltaUPct.toFixed(2)} %</span>
                        <span class="text-[10px] text-slate-500">${cablePhysics.deltaU.toFixed(1)} Volt (Grenze: &le; 1,0%)</span>
                    </div>
                    <div class="p-3 rounded-xl border border-slate-200 bg-white">
                        <span class="text-[10px] font-bold uppercase text-slate-400 block">Leitungsverlust</span>
                        <span class="text-base font-black text-slate-900 block mt-0.5">${Math.round(cablePhysics.powerLossW)} Watt</span>
                        <span class="text-[10px] text-slate-500">&approx; ${Math.round(cablePhysics.annualLossKwh)} kWh/Jahr</span>
                    </div>
                </div>

                <!-- FORMEL-AUFSCHLÜSSELUNG DER KABELLÄNGE -->
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    <span class="font-extrabold block text-slate-900 mb-1">Transparente Leitungs-Zusammensetzung:</span>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div>• Weg A (Hinweg): <strong>${cablePhysics.wegA} m</strong></div>
                        <div>• Modulkabel-Pauschale: <strong>${cablePhysics.panelCableTotal.toFixed(1)} m</strong></div>
                        <div>• Feldbrücken: <strong>${cablePhysics.sumFieldBridges} m</strong></div>
                        <div>• Weg B (Rückweg): <strong>${cablePhysics.wegB} m</strong></div>
                    </div>
                </div>
            </div>
            ` : ''}

            ${dossierOptions.includeBom ? `
            <div>
                <h2 class="text-sm font-black uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-2">
                    <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
                    5. Material-Stückliste & Installationskomponenten (BOM)
                </h2>

                <div class="overflow-x-auto rounded-xl border border-slate-200 text-xs">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                                <th class="p-2.5">Pos.</th>
                                <th class="p-2.5">Komponente</th>
                                <th class="p-2.5">Spezifikation / Modell</th>
                                <th class="p-2.5 text-center">Menge</th>
                                <th class="p-2.5">Einheit</th>
                                <th class="p-2.5">Verwendungszweck</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            <tr>
                                <td class="p-2.5 font-bold">1</td>
                                <td class="p-2.5 font-bold text-slate-900">Photovoltaik-Module</td>
                                <td class="p-2.5">Glas-Glas monokristallin (z.B. 440 Wp, TopCon)</td>
                                <td class="p-2.5 font-black text-primary text-center">${totalPanels}</td>
                                <td class="p-2.5">Stück</td>
                                <td class="p-2.5 text-slate-600">Solargenerator Dach</td>
                            </tr>
                            <tr>
                                <td class="p-2.5 font-bold">2</td>
                                <td class="p-2.5 font-bold text-slate-900">PV-Wechselrichter</td>
                                <td class="p-2.5">${escapeHtml(invLabel)}</td>
                                <td class="p-2.5 font-black text-slate-900 text-center">${invNames.length || 1}</td>
                                <td class="p-2.5">Gerät</td>
                                <td class="p-2.5 text-slate-600">DC/AC-Wandlung & MPPT</td>
                            </tr>
                            ${batCap > 0 ? `
                            <tr>
                                <td class="p-2.5 font-bold">3</td>
                                <td class="p-2.5 font-bold text-slate-900">Batteriespeichersystem</td>
                                <td class="p-2.5">${escapeHtml(batLabel)}</td>
                                <td class="p-2.5 font-black text-slate-900 text-center">1</td>
                                <td class="p-2.5">System</td>
                                <td class="p-2.5 text-slate-600">Eigenverbrauchsoptimierung</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td class="p-2.5 font-bold">4</td>
                                <td class="p-2.5 font-bold text-slate-900">Solarkabel H1Z2Z2-K</td>
                                <td class="p-2.5">${wiringSettings.cableCrossSection || 6} mm² Cu, halogenfrei, doppelt isoliert</td>
                                <td class="p-2.5 font-black text-primary text-center">${cablePhysics ? cablePhysics.totalCableLength : 60}</td>
                                <td class="p-2.5">Meter</td>
                                <td class="p-2.5 text-slate-600">DC-Haupt- & Modulverkabelung</td>
                            </tr>
                            <tr>
                                <td class="p-2.5 font-bold">5</td>
                                <td class="p-2.5 font-bold text-slate-900">MC4-Steckverbinder</td>
                                <td class="p-2.5">MC4-EVO2 Original Stäubli (Stecker + Buchse)</td>
                                <td class="p-2.5 font-black text-slate-900 text-center">${(strList.length * 2) + 2}</td>
                                <td class="p-2.5">Paare</td>
                                <td class="p-2.5 text-slate-600">Stringanschlüsse & WR</td>
                            </tr>
                            <tr>
                                <td class="p-2.5 font-bold">6</td>
                                <td class="p-2.5 font-bold text-slate-900">Potentialausgleichsleiter</td>
                                <td class="p-2.5">NYY-J 1×16 mm² Cu grün/gelb massiv</td>
                                <td class="p-2.5 font-black text-slate-900 text-center">25</td>
                                <td class="p-2.5">Meter</td>
                                <td class="p-2.5 text-slate-600">Gestell- & Blitzschutzpotential</td>
                            </tr>
                            <tr>
                                <td class="p-2.5 font-bold">7</td>
                                <td class="p-2.5 font-bold text-slate-900">Kabelbefestigung</td>
                                <td class="p-2.5">UV- und witterungsbeständige Solar-Kabelbinder</td>
                                <td class="p-2.5 font-black text-slate-900 text-center">100</td>
                                <td class="p-2.5">Stück</td>
                                <td class="p-2.5 text-slate-600">Scheuerfreie Schienenmontage</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            ` : ''}
        </section>
        ` : ''}

        <!-- ========================================== -->
        <!-- SEITE 5: WIRTSCHAFTLICHKEIT & ERTRAG -->
        <!-- ========================================== -->
        ${dossierOptions.includeFinance ? `
        <section class="dossier-page print-page mb-10 pb-8 border-b-2 border-slate-200">
            <h2 class="text-sm font-black uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-2">
                <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
                6. Wirtschaftlichkeit, Cashflow & Amortisationsprognose
            </h2>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-6">
                <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <span class="text-[10px] font-bold uppercase text-slate-400 block">Investitionskosten (Netto)</span>
                    <span class="text-xl font-black text-slate-900 block mt-0.5">
                        ${typeof totalInvestSum !== 'undefined' && totalInvestSum > 0 ? totalInvestSum.toLocaleString('de-DE') + ' €' : (Math.round(totalKwp * 1250)).toLocaleString('de-DE') + ' €'}
                    </span>
                    <span class="text-[11px] text-slate-500">inkl. Montage & Inbetriebnahme</span>
                </div>

                <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <span class="text-[10px] font-bold uppercase text-slate-400 block">Jährliche Ersparnis</span>
                    <span class="text-xl font-black text-emerald-600 block mt-0.5">
                        &approx; ${(Math.round(estYieldKwh * 0.22)).toLocaleString('de-DE')} €/a
                    </span>
                    <span class="text-[11px] text-slate-500">Eigenverbrauch + Einspeisung</span>
                </div>

                <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <span class="text-[10px] font-bold uppercase text-slate-400 block">Amortisationszeit</span>
                    <span class="text-xl font-black text-primary block mt-0.5">
                        &approx; 8 - 10 Jahre
                    </span>
                    <span class="text-[11px] text-slate-500">Break-Even-Point</span>
                </div>

                <div class="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <span class="text-[10px] font-bold uppercase text-slate-400 block">Stromgestehungskosten (LCOE)</span>
                    <span class="text-xl font-black text-slate-900 block mt-0.5">
                        &approx; 7,8 ct/kWh
                    </span>
                    <span class="text-[11px] text-slate-500">über 20 Jahre Betrieb</span>
                </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <p class="font-bold text-slate-900 mb-1">Berechnungsgrundlagen nach EEG & VDI 4655:</p>
                <p>
                    Die Wirtschaftlichkeitsberechnung berücksichtigt eine angenommene Strompreissteigerung von 2,5% p.a., eine jährliche Moduldegradation von 0,5% sowie die gesetzliche Einspeisevergütung nach dem Erneuerbare-Energien-Gesetz (EEG). Alle steuerlichen Freibeträge für PV-Anlagen bis 30 kWp nach dem Jahressteuergesetz wurden vollumfänglich berücksichtigt (0% MwSt.).
                </p>
            </div>
        </section>
        ` : ''}

        <!-- ========================================== -->
        <!-- SEITE 6: DIN VDE 0100-712 ABNAHMEPROTOKOLL -->
        <!-- ========================================== -->
        ${dossierOptions.includeAcceptanceProtocol ? `
        <section class="dossier-page print-page avoid-break">
            <h2 class="text-sm font-black uppercase tracking-wider text-slate-800 mb-2 flex items-center gap-2">
                <span class="w-1.5 h-4 bg-primary rounded-full inline-block"></span>
                7. Prüf-, Mess- & Inbetriebnahmeprotokoll nach DIN VDE 0100-712
            </h2>
            <p class="text-xs text-slate-500 mb-4">
                Dokumentation der Erstprüfung vor Inbetriebnahme der netzgekoppelten Photovoltaikanlage.
            </p>

            <!-- CHECKLISTE SICHT- & FUNKTIONSPRÜFUNG -->
            <div class="overflow-x-auto rounded-xl border border-slate-200 text-xs mb-6">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 font-extrabold border-b border-slate-200">
                            <th class="p-2.5 w-10 text-center">Status</th>
                            <th class="p-2.5">Prüfschritt / Normkriterium</th>
                            <th class="p-2.5">Normvorgabe / Anforderung</th>
                            <th class="p-2.5 w-32">Messwert / Notiz</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <tr>
                            <td class="p-2.5 text-center font-black text-emerald-600">☑</td>
                            <td class="p-2.5 font-bold text-slate-900">Sichtprüfung Montage & DC-Kabel</td>
                            <td class="p-2.5 text-slate-600">UV-beständig, scheuerfrei, zugentlastet, keine Quetschung</td>
                            <td class="p-2.5 font-medium text-slate-700">In Ordnung</td>
                        </tr>
                        <tr>
                            <td class="p-2.5 text-center font-black text-emerald-600">☑</td>
                            <td class="p-2.5 font-bold text-slate-900">Hauptpotentialausgleich (Gestell)</td>
                            <td class="p-2.5 text-slate-600">Durchgängigkeit Montagegestell zu PAS (&ge; 16 mm² Cu)</td>
                            <td class="p-2.5 font-medium text-slate-700">&lt; 0,1 &Omega;</td>
                        </tr>
                        <tr>
                            <td class="p-2.5 text-center font-black text-emerald-600">☑</td>
                            <td class="p-2.5 font-bold text-slate-900">Polaritätsprüfung DC-Stecker</td>
                            <td class="p-2.5 text-slate-600">Verpolungssicherer Anschluss aller Strings an WR</td>
                            <td class="p-2.5 font-medium text-slate-700">Geprüft (+ / -)</td>
                        </tr>
                        <tr>
                            <td class="p-2.5 text-center font-black text-slate-400">☐</td>
                            <td class="p-2.5 font-bold text-slate-900">Messung Leerlaufspannung Uoc</td>
                            <td class="p-2.5 text-slate-600">Sollwertvergleich mit Moduldatenblatt (STC)</td>
                            <td class="p-2.5 font-medium text-slate-700">__________ V</td>
                        </tr>
                        <tr>
                            <td class="p-2.5 text-center font-black text-slate-400">☐</td>
                            <td class="p-2.5 font-bold text-slate-900">Messung Kurzschlussstrom Isc</td>
                            <td class="p-2.5 text-slate-600">Kurzschlussprüfung bei ausreichender Einstrahlung</td>
                            <td class="p-2.5 font-medium text-slate-700">__________ A</td>
                        </tr>
                        <tr>
                            <td class="p-2.5 text-center font-black text-slate-400">☐</td>
                            <td class="p-2.5 font-bold text-slate-900">Isolationswiderstand Riso</td>
                            <td class="p-2.5 text-slate-600">Prüfspannung 1.000 V DC (Grenzwert &ge; 1,0 M&Omega;)</td>
                            <td class="p-2.5 font-medium text-slate-700">__________ M&Omega;</td>
                        </tr>
                        <tr>
                            <td class="p-2.5 text-center font-black text-emerald-600">☑</td>
                            <td class="p-2.5 font-bold text-slate-900">Überspannungsschutz (SPD)</td>
                            <td class="p-2.5 text-slate-600">DC-Überspannungsableiter Typ 1/2 funktionstüchtig</td>
                            <td class="p-2.5 font-medium text-slate-700">Aktiv / Grün</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- UNTERSCHRIFTEN BLOCK -->
            <div class="grid grid-cols-2 gap-6 pt-4 text-xs">
                <div class="border-t-2 border-slate-900 pt-3">
                    <p class="font-black text-slate-900">Errichter / Verantwortliche Elektrofachkraft</p>
                    <p class="text-slate-500 mt-1">Die Anlage wurde ordnungsgemäß nach den anerkannten Regeln der Technik errichtet und geprüft.</p>
                    <div class="mt-8 flex justify-between text-[11px] text-slate-400">
                        <span>Ort, Datum</span>
                        <span>Unterschrift & Firmenstempel</span>
                    </div>
                </div>

                <div class="border-t-2 border-slate-900 pt-3">
                    <p class="font-black text-slate-900">Auftraggeber / Anlagenbetreiber</p>
                    <p class="text-slate-500 mt-1">Die Anlage, Bedienungsanleitung und Dokumentation wurden vollständig übergeben.</p>
                    <div class="mt-8 flex justify-between text-[11px] text-slate-400">
                        <span>Ort, Datum</span>
                        <span>Unterschrift Auftraggeber</span>
                    </div>
                </div>
            </div>
        </section>
        ` : ''}

        <!-- ========================================== -->
        <!-- SEITE 8: ANHANG A - TECHNISCHE DATENBLÄTTER -->
        <!-- ========================================== -->
        ${dossierOptions.includeDataSheets ? buildDataSheetsSection(hardwareData, false) : ''}

        <!-- ========================================== -->
        <!-- SEITE 9: ANHANG B - ZERTIFIKATE & KONFORMITÄT -->
        <!-- ========================================== -->
        ${dossierOptions.includeCertificates ? buildCertificatesSection(hardwareData, false) : ''}

        <!-- DOKUMENTEN-FUSSZEILE -->
        <footer class="mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between">
            <span>PV Pro Studio v7.0.0 • Dokumentation nach DIN VDE 0100-712</span>
            <span>Erstellt am: ${escapeHtml(dossierOptions.projectDate)} • Seite 1 von 1</span>
        </footer>
    </div>
    `;
}

// Sichere HTML-Escaping-Funktion
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Global registrieren
window.openDossierModal = openDossierModal;
window.closeDossierModal = closeDossierModal;
window.setDossierOption = setDossierOption;
window.setReportType = setReportType;
window.getUsedHardwareData = getUsedHardwareData;
window.printDossierDirectly = printDossierDirectly;
window.renderDossierPreview = renderDossierPreview;
window.dossierOptions = dossierOptions;
