// ==========================================
// MASTER DATENBANK (Hardware)
// Aktualisiert auf Basis verifizierter Hersteller-Datenblätter
// Exklusiv: AIKO Neostar 3S+54, Fronius Symo GEN24 Plus SC, BYD Battery-Box HVS+
// ==========================================
const MasterDB = {
    panels: [
        { series: "AIKO Neostar 3S+54", models: [
            { id: 101, name: "AIKO-A460-MCE54Db", pmax: 460, voc: 40.50, vmp: 34.10, isc: 14.66, imp: 13.50, tempVoc: -0.22, tempPmax: -0.26, tempIsc: 0.05, weight: 24.2, width: 1134, length: 1762, thickness: 30, glass: "2.0+2.0 mm Doppelglas", tech: "N-Typ ABC", cells: 108, eff: 0.230 },
            { id: 102, name: "AIKO-A465-MCE54Db", pmax: 465, voc: 40.60, vmp: 34.20, isc: 14.69, imp: 13.60, tempVoc: -0.22, tempPmax: -0.26, tempIsc: 0.05, weight: 24.2, width: 1134, length: 1762, thickness: 30, glass: "2.0+2.0 mm Doppelglas", tech: "N-Typ ABC", cells: 108, eff: 0.233 },
            { id: 103, name: "AIKO-A470-MCE54Db", pmax: 470, voc: 40.70, vmp: 34.30, isc: 14.72, imp: 13.71, tempVoc: -0.22, tempPmax: -0.26, tempIsc: 0.05, weight: 24.2, width: 1134, length: 1762, thickness: 30, glass: "2.0+2.0 mm Doppelglas", tech: "N-Typ ABC", cells: 108, eff: 0.235 },
            { id: 104, name: "AIKO-A475-MCE54Db", pmax: 475, voc: 40.80, vmp: 34.40, isc: 14.76, imp: 13.81, tempVoc: -0.22, tempPmax: -0.26, tempIsc: 0.05, weight: 24.2, width: 1134, length: 1762, thickness: 30, glass: "2.0+2.0 mm Doppelglas", tech: "N-Typ ABC", cells: 108, eff: 0.238 }
        ]}
    ],
    batteries: [
        { series: "Ohne", models: [
            { id: 1, name: "Keine Batterie", cap: 0, power: 0, eff: 1.0 }
        ]},
        { series: "BYD Battery-Box HVS+ (Hochvolt)", models: [
            { id: 302, name: "HVS+ 5.1 (2 Module)", cap: 5.12, modules: 2, nomV: 204.8, minV: 160.0, maxV: 230.4, maxI: 25.0, peakI: 55.0, power: 5120, eff: 0.95, weight: 91.1, dim: "747 x 610 x 282 mm", ip: "IP55", tech: "LiFePO4" },
            { id: 303, name: "HVS+ 7.7 (3 Module)", cap: 7.68, modules: 3, nomV: 307.2, minV: 240.0, maxV: 345.6, maxI: 25.0, peakI: 55.0, power: 7680, eff: 0.95, weight: 129.6, dim: "987 x 610 x 282 mm", ip: "IP55", tech: "LiFePO4" },
            { id: 304, name: "HVS+ 10.2 (4 Module)", cap: 10.24, modules: 4, nomV: 409.6, minV: 320.0, maxV: 460.8, maxI: 25.0, peakI: 55.0, power: 10240, eff: 0.95, weight: 168.1, dim: "1227 x 610 x 282 mm", ip: "IP55", tech: "LiFePO4" },
            { id: 305, name: "HVS+ 12.8 (5 Module)", cap: 12.80, modules: 5, nomV: 512.0, minV: 400.0, maxV: 576.0, maxI: 25.0, peakI: 55.0, power: 12800, eff: 0.95, weight: 206.6, dim: "1467 x 610 x 282 mm", ip: "IP55", tech: "LiFePO4" }
        ]}
    ],
    inverters: [
        { series: "Fronius Symo GEN24 Plus SC", models: [
            { id: 10, name: "GEN24 3.0 Plus SC", acMax: 3000, startV: 80, minMppV: 115, maxMppV: 800, maxV: 1000, maxDcWp: 4500, maxChargePower: 3300, weight: 15.3, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 20, maxI: 14}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 14}] },
            { id: 11, name: "GEN24 4.0 Plus SC", acMax: 4000, startV: 80, minMppV: 150, maxMppV: 800, maxV: 1000, maxDcWp: 6000, maxChargePower: 4300, weight: 15.3, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 20, maxI: 14}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 14}] },
            { id: 12, name: "GEN24 5.0 Plus SC", acMax: 5000, startV: 80, minMppV: 190, maxMppV: 800, maxV: 1000, maxDcWp: 7500, maxChargePower: 5300, weight: 15.3, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 20, maxI: 14}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 14}] },
            { id: 13, name: "GEN24 6.0 Plus SC", acMax: 6000, startV: 80, minMppV: 148, maxMppV: 800, maxV: 1000, maxDcWp: 9000, maxChargePower: 6220, weight: 22.8, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 40, maxI: 28}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 14}] },
            { id: 14, name: "GEN24 8.0 Plus SC", acMax: 8000, startV: 80, minMppV: 197, maxMppV: 800, maxV: 1000, maxDcWp: 12000, maxChargePower: 8260, weight: 22.8, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 40, maxI: 28}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 14}] },
            { id: 15, name: "GEN24 10.0 Plus SC", acMax: 10000, startV: 80, minMppV: 246, maxMppV: 800, maxV: 1000, maxDcWp: 15000, maxChargePower: 10300, weight: 22.8, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 40, maxI: 28}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 14}] },
            { id: 16, name: "GEN24 12.0 Plus SC", acMax: 12000, startV: 80, minMppV: 295, maxMppV: 800, maxV: 1000, maxDcWp: 18000, maxChargePower: 11682, weight: 22.8, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 40, maxI: 28}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 14}] }
        ]},
        { series: "Hoymiles Mikrowechselrichter", models: [
            { id: 198, name: "Hoymiles HMS-1600-4T", acMax: 1600, startV: 22, minMppV: 16, maxMppV: 60, maxV: 65, maxDcWp: 2160, maxChargePower: 0, weight: 4.7, batteryId: 1, type: "micro", dim: "331 × 218 × 36.6 mm", ip: "IP67", mppts: [
                {id: 1, name: "MPPT 1 (Eingang 1)", maxIsc: 25, maxI: 14},
                {id: 2, name: "MPPT 2 (Eingang 2)", maxIsc: 25, maxI: 14},
                {id: 3, name: "MPPT 3 (Eingang 3)", maxIsc: 25, maxI: 14},
                {id: 4, name: "MPPT 4 (Eingang 4)", maxIsc: 25, maxI: 14}
            ]},
            { id: 199, name: "Hoymiles HMS-1800-4T", acMax: 1800, startV: 22, minMppV: 16, maxMppV: 60, maxV: 65, maxDcWp: 2400, maxChargePower: 0, weight: 4.7, batteryId: 1, type: "micro", dim: "331 × 218 × 36.6 mm", ip: "IP67", mppts: [
                {id: 1, name: "MPPT 1 (Eingang 1)", maxIsc: 25, maxI: 15},
                {id: 2, name: "MPPT 2 (Eingang 2)", maxIsc: 25, maxI: 15},
                {id: 3, name: "MPPT 3 (Eingang 3)", maxIsc: 25, maxI: 15},
                {id: 4, name: "MPPT 4 (Eingang 4)", maxIsc: 25, maxI: 15}
            ]},
            { id: 200, name: "Hoymiles HMS-2000T-4T", acMax: 2000, startV: 22, minMppV: 16, maxMppV: 60, maxV: 65, maxDcWp: 2680, maxChargePower: 0, weight: 4.7, batteryId: 1, type: "micro", dim: "331 × 218 × 36.6 mm", ip: "IP67", mppts: [
                {id: 1, name: "MPPT 1 (Eingang 1)", maxIsc: 25, maxI: 16},
                {id: 2, name: "MPPT 2 (Eingang 2)", maxIsc: 25, maxI: 16},
                {id: 3, name: "MPPT 3 (Eingang 3)", maxIsc: 25, maxI: 16},
                {id: 4, name: "MPPT 4 (Eingang 4)", maxIsc: 25, maxI: 16}
            ]}
        ]}
    ]
};

// ==========================================
// VOM NUTZER FEST IM CODE GESPEICHERTE HARDWARE
// Wird serverseitig in database.js aktualisiert
// ==========================================
const CodePersistedHardware = {
    panels: [],
    inverters: [],
    batteries: []
};

// Zusammenführen der im Code gespeicherten Hardware in MasterDB
function mergeCodePersistedHardware() {
    const persisted = (typeof window !== 'undefined' && window.CodePersistedHardware) 
        ? window.CodePersistedHardware 
        : (typeof CodePersistedHardware !== 'undefined' ? CodePersistedHardware : null);
    if (!persisted) return;

    MasterDB.panels = MasterDB.panels.filter(s => s.series !== "Code-gespeicherte Module");
    MasterDB.inverters = MasterDB.inverters.filter(s => s.series !== "Code-gespeicherte WR");
    MasterDB.batteries = MasterDB.batteries.filter(s => s.series !== "Code-gespeicherte Batterien");

    if (persisted.panels && persisted.panels.length > 0) {
        MasterDB.panels.push({ series: "Code-gespeicherte Module", models: persisted.panels });
    }
    if (persisted.inverters && persisted.inverters.length > 0) {
        MasterDB.inverters.push({ series: "Code-gespeicherte WR", models: persisted.inverters });
    }
    if (persisted.batteries && persisted.batteries.length > 0) {
        MasterDB.batteries.push({ series: "Code-gespeicherte Batterien", models: persisted.batteries });
    }
}
mergeCodePersistedHardware();

// ==========================================
// SICHERER HTML-ESCAPING-HELPER (GLOBAL)
// ==========================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==========================================
// STANDARD-ZERTIFIKATE & DATENBLÄTTER DER MASTER-HARDWARE
// Vollständige technische Daten nach Original-Herstellerdatenblatt
// ==========================================
const MasterHardwareDocs = {
    panel_aiko: {
        id: 'doc_master_aiko',
        title: 'Original-Datenblatt AIKO Neostar 3S+54 (AIKO-A-MCE54Db)',
        category: 'datenblatt',
        standard: 'IEC 61215:2021 / IEC 61730:2023 / TÜV Rheinland',
        issuer: 'AIKO Energy Germany GmbH',
        fileName: 'AIKO-Neostar-3S+54-MCE54Db-Datasheet.pdf',
        description: 'Hocheffizientes All-Black Doppelglasmodul mit N-Typ ABC-Technologie (Rückkontakt ohne Frontleiterbahnen). 15 Jahre Produkt- & 30 Jahre lineare Leistungsgarantie (mind. 88,85% nach 30 Jahren).',
        specs: {
            cellType: 'N-Typ ABC (All Back Contact), 108 Halbzellen (6×18)',
            dimensions: '1762 × 1134 × 30 mm',
            weight: '24,2 kg',
            glass: 'Doppelglas 2,0 + 2,0 mm hochtransparentes, gehärtetes AR-Glas',
            frame: 'Schwarz eloxiertes Aluminium',
            junctionBox: 'IP68, 3 Bypass-Dioden',
            cable: '4 mm² Cu (1200 mm Länge), MC4-EVO2A kompatibel',
            tempPmax: '-0,26 %/°C',
            tempVoc: '-0,22 %/°C',
            tempIsc: '+0,05 %/°C',
            maxSystemVoltage: 'DC 1500 V',
            fireClass: 'Klasse A (IEC 61730)'
        }
    },
    inv_fronius: {
        id: 'doc_master_fronius',
        title: 'Original-Datenblatt Fronius Symo GEN24 Plus SC (3.0 - 12.0 kW)',
        category: 'datenblatt',
        standard: 'VDE-AR-N 4105:2018-11 / DIN EN 62109-1/-2 / IEC 62116',
        issuer: 'Fronius International GmbH (Wels, Österreich)',
        fileName: 'Fronius-Symo-GEN24-Plus-SC-Datasheet.pdf',
        description: 'Dreiphasiger Hybrid-Wechselrichter mit Multi-Flow-Technology, integrierter Notstromversorgung (PV Point & Full Backup) und active cooling technology.',
        specs: {
            mppRange: '80 - 800 V (Einspeisung Startspannung 80 V)',
            maxDcVoltage: '1000 V',
            mpptCount: '2 unabhängige MPP-Tracker',
            maxEfficiency: '98,2 % (Europäischer Wirkungsgrad &eta; > 97,7 %)',
            batteryInterface: '160 - 700 V (Kompatibel mit BYD Battery-Box HVS+)',
            cooling: 'Geregelte Zwangskühlung (Active Cooling)',
            ipProtection: 'IP66 (für Innen- und ungeschützte Außenmontage)',
            gridCompliance: 'VDE-AR-N 4105:2018-11, TOR Erzeuger Typ A, EN 50549-1'
        }
    },
    bat_byd: {
        id: 'doc_master_byd',
        title: 'Original-Datenblatt BYD Battery-Box Premium HVS+ (5.1 - 12.8 kWh)',
        category: 'datenblatt',
        standard: 'VDE 2510-50 / IEC 62619 / UN 38.3 / CE',
        issuer: 'BYD Company Ltd. / EFT-Systems GmbH',
        fileName: 'BYD-Battery-Box-HVS-Plus-Datasheet.pdf',
        description: 'Modulares Hochvolt-Speichersystem auf Basis kobaltfreier Lithium-Eisen-Phosphat-Technologie (LiFePO4) mit patentiertem kabellosem Steckdesign und VDE-Sicherheitszertifizierung.',
        specs: {
            moduleSize: 'HVS+ Modul: 2,56 kWh nutzbar, 102,4 V, 38,5 kg',
            cellChemistry: 'Lithium-Eisen-Phosphat (LiFePO4) - eigensicher',
            maxCurrent: '25 A Dauerstrom (55 A Spitzenstrom für 15 s)',
            roundTripEff: '&ge; 95,0 % Wirkungsgrad',
            tempRange: '-10 °C bis +50 °C (Betrieb)',
            ipProtection: 'IP55 Schutzart',
            scalability: 'Bis zu 3 identische Türme parallel (max. 38,4 kWh)'
        }
    },
    inv_hoymiles: {
        id: 'doc_master_hoymiles',
        title: 'Original-Datenblatt Hoymiles HMS-1600 / HMS-1800 / HMS-2000-4T',
        category: 'datenblatt',
        standard: 'VDE-AR-N 4105:2018-11 / EN 50549-1:2019 / IEC 62109-1/-2 / IEC 61000-6-1/-2/-3/-4',
        issuer: 'Hoymiles Power Electronics Inc.',
        fileName: 'Hoymiles-HMS-1600-1800-2000-Datasheet.pdf',
        description: 'Leistungsstarker 4-in-1 Modul-Mikrowechselrichter mit bis zu 2000 VA AC-Ausgangsleistung, 4 unabhängigen MPPTs, Sub-1G-Funkverbindung (S-Miles Cloud) und galvanisch getrenntem HF-Transformator.',
        specs: {
            acPower: '2000 VA (8,7 A bei 230 V AC, 50 Hz)',
            mppRange: '16 – 60 V (Einschaltspannung: 22 V)',
            maxDcVoltage: '65 V DC',
            maxDcCurrent: '4 × 16 A (Kurzschlussstrom Isc: 4 × 25 A)',
            mpptCount: '4 unabhängige MPPT-Tracker (1 Eingang pro MPPT)',
            maxEfficiency: '96,5 % CEC Wirkungsgrad (99,8 % nominaler MPPT-Wirkungsgrad)',
            powerFactor: '> 0,99 (einstellbar 0,8 kapazitiv bis 0,8 induktiv)',
            nightConsumption: '< 50 mW',
            cooling: 'Natürliche Konvektion (lüfterlos)',
            dimensions: '331 × 218 × 36,6 mm, Gewicht: 4,7 kg',
            ipProtection: 'IP67 (Outdoor-Einsatz, NEMA 6)',
            gridCompliance: 'VDE-AR-N 4105:2018, EN 50549-1:2019, VFR2019, IEC/EN 62109'
        }
    }
};

// ==========================================
// DOKUMENTENVERWALTUNG-ENGINE (HARDWARE DOCS)
// Persistenz via LocalStorage + Fallbacks
// ==========================================
const HardwareDocManager = {
    STORAGE_KEY: 'pvpro_hardware_docs',

    getAllUserDocs() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        } catch (e) {
            console.error('Fehler beim Laden der Hardware-Dokumente:', e);
            return [];
        }
    },

    getDocsForDevice(deviceType, deviceId) {
        const idStr = String(deviceId);
        const userDocs = this.getAllUserDocs().filter(d => d.deviceType === deviceType && String(d.deviceId) === idStr);
        const masterDocs = this.getMasterDocsForDevice(deviceType, deviceId);
        return [...masterDocs, ...userDocs];
    },

    getMasterDocsForDevice(deviceType, deviceId) {
        if (deviceType === 'panel') {
            return [{
                id: 'master_doc_panel',
                deviceType: 'panel',
                deviceId: String(deviceId),
                category: 'datenblatt',
                title: MasterHardwareDocs.panel_aiko.title,
                standard: MasterHardwareDocs.panel_aiko.standard,
                issuer: MasterHardwareDocs.panel_aiko.issuer,
                fileName: MasterHardwareDocs.panel_aiko.fileName,
                notes: MasterHardwareDocs.panel_aiko.description,
                specs: MasterHardwareDocs.panel_aiko.specs,
                url: '',
                isMaster: true
            }];
        } else if (deviceType === 'inv') {
            const isHoymiles = ['198', '199', '200'].includes(String(deviceId)) || (typeof flatInverters !== 'undefined' && flatInverters.find(i => String(i.id) === String(deviceId))?.name?.toLowerCase().includes('hoymiles'));
            const docInfo = isHoymiles ? MasterHardwareDocs.inv_hoymiles : MasterHardwareDocs.inv_fronius;
            return [{
                id: isHoymiles ? 'master_doc_inv_hoymiles' : 'master_doc_inv_fronius',
                deviceType: 'inv',
                deviceId: String(deviceId),
                category: 'datenblatt',
                title: docInfo.title,
                standard: docInfo.standard,
                issuer: docInfo.issuer,
                fileName: docInfo.fileName,
                notes: docInfo.description,
                specs: docInfo.specs,
                url: '',
                isMaster: true
            }];
        } else if (deviceType === 'bat') {
            if (String(deviceId) === '1') return [];
            return [{
                id: 'master_doc_bat',
                deviceType: 'bat',
                deviceId: String(deviceId),
                category: 'datenblatt',
                title: MasterHardwareDocs.bat_byd.title,
                standard: MasterHardwareDocs.bat_byd.standard,
                issuer: MasterHardwareDocs.bat_byd.issuer,
                fileName: MasterHardwareDocs.bat_byd.fileName,
                notes: MasterHardwareDocs.bat_byd.description,
                specs: MasterHardwareDocs.bat_byd.specs,
                url: '',
                isMaster: true
            }];
        }
        return [];
    },

    addDoc(doc) {
        if (!doc.title || !doc.deviceType || !doc.deviceId) {
            throw new Error('Pflichtfelder für Dokument fehlen (Titel, Gerätetyp, Geräte-ID).');
        }

        const all = this.getAllUserDocs();
        const newDoc = {
            id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            deviceType: doc.deviceType, // 'panel', 'inv', 'bat'
            deviceId: String(doc.deviceId),
            deviceName: doc.deviceName || '',
            category: doc.category || 'datenblatt', // 'datenblatt', 'zertifikat', 'garantie', 'sonstiges'
            title: doc.title.trim(),
            standard: doc.standard ? doc.standard.trim() : '',
            issuer: doc.issuer ? doc.issuer.trim() : '',
            certNo: doc.certNo ? doc.certNo.trim() : '',
            validUntil: doc.validUntil ? doc.validUntil.trim() : '',
            fileName: doc.fileName || '',
            fileType: doc.fileType || 'application/pdf',
            fileSize: doc.fileSize || 0,
            url: doc.url || '', // Entweder Data-URL (Base64) oder Web-URL
            notes: doc.notes ? doc.notes.trim() : '',
            createdAt: new Date().toISOString()
        };

        all.push(newDoc);

        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
            return newDoc;
        } catch (e) {
            console.error('LocalStorage Quota überschritten:', e);
            throw new Error('Der Browserspeicher ist voll. Bitte verwende für große PDF-Dateien einen Web-Link (URL) oder komprimiere die Datei.');
        }
    },

    deleteDoc(docId) {
        let all = this.getAllUserDocs();
        all = all.filter(d => d.id !== docId);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
        return true;
    },

    countDocsForDevice(deviceType, deviceId) {
        return this.getDocsForDevice(deviceType, deviceId).length;
    }
};

// Globale Verfügbarkeit
window.MasterDB = MasterDB;
window.escapeHtml = escapeHtml;
window.MasterHardwareDocs = MasterHardwareDocs;
window.HardwareDocManager = HardwareDocManager;
window.CodePersistedHardware = typeof CodePersistedHardware !== 'undefined' ? CodePersistedHardware : { panels: [], inverters: [], batteries: [] };
window.mergeCodePersistedHardware = mergeCodePersistedHardware;

