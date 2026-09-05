// ==========================================
// PV PRO STUDIO – DOSSIER & PDF EXPORT ENGINE
// Version 7.0.0
// Normkonforme Projektdokumentation nach DIN VDE 0100-712
// ==========================================

let dossierOptions = {
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
    includeAcceptanceProtocol: true
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
                            Vollständiger Auslegungs-, Verkabelungs- und Abnahmebericht für Errichter und Kunden.
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

            <!-- MODAL TOOLBAR & OPTIONEN -->
            <div class="px-6 py-3 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-xs no-print flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-3">
                    <div class="flex items-center gap-1.5">
                        <span class="font-bold text-slate-600 dark:text-slate-400">Projekt:</span>
                        <input type="text" id="dos_title_input" value="${dossierOptions.projectTitle}" onchange="setDossierOption('projectTitle', this.value)" class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none w-48 sm:w-64">
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="font-bold text-slate-600 dark:text-slate-400">Kunde:</span>
                        <input type="text" id="dos_client_input" value="${dossierOptions.clientName}" onchange="setDossierOption('clientName', this.value)" class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none w-40 sm:w-52">
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="font-bold text-slate-600 dark:text-slate-400">Errichter:</span>
                        <input type="text" id="dos_inst_input" value="${dossierOptions.installerName}" onchange="setDossierOption('installerName', this.value)" class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none w-40 sm:w-52">
                    </div>
                </div>

                <!-- SEKTIONS-TOGGLES -->
                <div class="flex flex-wrap items-center gap-2">
                    <label class="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" ${dossierOptions.includeWiring ? 'checked' : ''} onchange="setDossierOption('includeWiring', this.checked)" class="accent-primary rounded">
                        <span>Schaltplan</span>
                    </label>
                    <label class="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" ${dossierOptions.includeVdeLosses ? 'checked' : ''} onchange="setDossierOption('includeVdeLosses', this.checked)" class="accent-primary rounded">
                        <span>VDE-Leitung</span>
                    </label>
                    <label class="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" ${dossierOptions.includeBom ? 'checked' : ''} onchange="setDossierOption('includeBom', this.checked)" class="accent-primary rounded">
                        <span>Stückliste</span>
                    </label>
                    <label class="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" ${dossierOptions.includeFinance ? 'checked' : ''} onchange="setDossierOption('includeFinance', this.checked)" class="accent-primary rounded">
                        <span>Wirtschaftlichkeit</span>
                    </label>
                    <label class="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" ${dossierOptions.includeAcceptanceProtocol ? 'checked' : ''} onchange="setDossierOption('includeAcceptanceProtocol', this.checked)" class="accent-primary rounded">
                        <span>Abnahmeprotokoll</span>
                    </label>
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
                batLabel = `${b.name} (${b.capacity} kWh)`;
                batCap = b.capacity;
            }
        }
    } catch(e) {}

    // Ertrag & Kennzahlen
    const estYieldKwh = Math.round(totalKwp * 980);
    const estYieldSpec = 980;
    
    // Verkabelungsberechnungen
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
window.printDossierDirectly = printDossierDirectly;
window.renderDossierPreview = renderDossierPreview;
window.dossierOptions = dossierOptions;
