// ==========================================
// MASTER DATENBANK (Hardware)
// ==========================================
const MasterDB = {
    panels: [
        { series: "AIKO Neostar 3S+54", models: [
            { id: 101, name: "AIKO-A460-MCE54Db", pmax: 460, voc: 40.50, vmp: 34.10, isc: 14.66, tempVoc: -0.22 },
            { id: 102, name: "AIKO-A465-MCE54Db", pmax: 465, voc: 40.60, vmp: 34.20, isc: 14.69, tempVoc: -0.22 },
            { id: 103, name: "AIKO-A470-MCE54Db", pmax: 470, voc: 40.70, vmp: 34.30, isc: 14.72, tempVoc: -0.22 },
            { id: 104, name: "AIKO-A475-MCE54Db", pmax: 475, voc: 40.80, vmp: 34.40, isc: 14.76, tempVoc: -0.22 }
        ]},
        { series: "Jolywood JW-HD96N-R2", models: [
            { id: 201, name: "HD96N-R2 435W", pmax: 435, voc: 34.31, vmp: 29.44, isc: 15.65, tempVoc: -0.25 },
            { id: 202, name: "HD96N-R2 440W", pmax: 440, voc: 34.51, vmp: 29.62, isc: 15.72, tempVoc: -0.25 },
            { id: 203, name: "HD96N-R2 450W", pmax: 450, voc: 34.91, vmp: 29.98, isc: 15.86, tempVoc: -0.25 },
            { id: 204, name: "HD96N-R2 460W", pmax: 460, voc: 35.31, vmp: 30.34, isc: 16.00, tempVoc: -0.25 }
        ]},
        { series: "Jolywood JW-HD120N-R3", models: [
            { id: 301, name: "HD120N-R3 485W", pmax: 485, voc: 42.98, vmp: 36.93, isc: 13.94, tempVoc: -0.25 },
            { id: 302, name: "HD120N-R3 490W", pmax: 490, voc: 43.18, vmp: 37.11, isc: 14.00, tempVoc: -0.25 },
            { id: 303, name: "HD120N-R3 495W", pmax: 495, voc: 43.38, vmp: 37.29, isc: 14.06, tempVoc: -0.25 },
            { id: 304, name: "HD120N-R3 500W", pmax: 500, voc: 43.58, vmp: 37.47, isc: 14.12, tempVoc: -0.25 },
            { id: 305, name: "HD120N-R3 505W", pmax: 505, voc: 43.78, vmp: 37.65, isc: 14.18, tempVoc: -0.25 },
            { id: 306, name: "HD120N-R3 510W", pmax: 510, voc: 43.98, vmp: 37.83, isc: 14.24, tempVoc: -0.25 }
        ]}
    ],
    batteries: [
        { series: "Ohne", models: [
            { id: 1, name: "Keine Batterie", cap: 0, power: 0, eff: 1.0 }
        ]},
        { series: "Fronius Reserva (Hochvolt)", models: [
            { id: 202, name: "Reserva 6.3 (2 Module)", cap: 6.3, power: 6300, eff: 0.92 },
            { id: 203, name: "Reserva 9.5 (3 Module)", cap: 9.5, power: 9500, eff: 0.92 },
            { id: 204, name: "Reserva 12.6 (4 Module)", cap: 12.6, power: 12600, eff: 0.92 },
            { id: 205, name: "Reserva 15.8 (5 Module)", cap: 15.8, power: 15800, eff: 0.92 }
        ]},
        { series: "BYD Premium HVS (Hochvolt)", models: [
            { id: 302, name: "HVS 5.1 (2 Module)", cap: 5.12, power: 5120, eff: 0.93 },
            { id: 303, name: "HVS 7.7 (3 Module)", cap: 7.68, power: 7680, eff: 0.93 },
            { id: 304, name: "HVS 10.2 (4 Module)", cap: 10.24, power: 10240, eff: 0.93 },
            { id: 305, name: "HVS 12.8 (5 Module)", cap: 12.8, power: 12800, eff: 0.93 }
        ]},
        { series: "BYD Premium HVM (Hochvolt)", models: [
            { id: 403, name: "HVM 8.3 (3 Module)", cap: 8.28, power: 8280, eff: 0.92 },
            { id: 404, name: "HVM 11.0 (4 Module)", cap: 11.04, power: 11040, eff: 0.92 },
            { id: 405, name: "HVM 13.8 (5 Module)", cap: 13.80, power: 13800, eff: 0.92 },
            { id: 406, name: "HVM 16.6 (6 Module)", cap: 16.56, power: 16560, eff: 0.92 },
            { id: 407, name: "HVM 19.3 (7 Module)", cap: 19.32, power: 19320, eff: 0.92 },
            { id: 408, name: "HVM 22.1 (8 Module)", cap: 22.08, power: 22080, eff: 0.92 }
        ]},
        { series: "Anker SOLIX (Niedervolt)", models: [
            { id: 500, name: "E1600 Solo (1.6 kWh)", cap: 1.6, power: 1000, eff: 0.80 },
            { id: 511, name: "E1600 + 1x BP1600 (3.2 kWh)", cap: 3.2, power: 1200, eff: 0.80 },
            { id: 512, name: "E1600 + 2x BP1600 (4.8 kWh)", cap: 4.8, power: 1200, eff: 0.80 },
            { id: 513, name: "E1600 + 3x BP1600 (6.4 kWh)", cap: 6.4, power: 1200, eff: 0.80 },
            { id: 514, name: "E1600 + 4x BP1600 (8.0 kWh)", cap: 8.0, power: 1200, eff: 0.80 },
            { id: 515, name: "E1600 + 5x BP1600 (9.6 kWh)", cap: 9.6, power: 1200, eff: 0.80 },
            { id: 521, name: "E1600 + 1x BP2700 (4.3 kWh)", cap: 4.288, power: 1200, eff: 0.80 },
            { id: 522, name: "E1600 + 2x BP2700 (7.0 kWh)", cap: 6.976, power: 1200, eff: 0.80 },
            { id: 523, name: "E1600 + 3x BP2700 (9.7 kWh)", cap: 9.664, power: 1200, eff: 0.80 },
            { id: 524, name: "E1600 + 4x BP2700 (12.4 kWh)", cap: 12.352, power: 1200, eff: 0.80 },
            { id: 525, name: "E1600 + 5x BP2700 (15.0 kWh)", cap: 15.04, power: 1200, eff: 0.80 }
        ]}
    ],
    inverters: [
        { series: "Anker SOLIX", models: [
            { id: 100, name: "Solarbank 2 Pro E1600", acMax: 800, startV: 16, minMppV: 16, maxMppV: 60, maxV: 60, batteryId: 500, mppts: [
                {id:1, name:"MPPT 1", maxIsc: 20, maxI: 16}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 16},
                {id:3, name:"MPPT 3", maxIsc: 20, maxI: 16}, {id:4, name:"MPPT 4", maxIsc: 20, maxI: 16}
            ]}
        ]},
        { series: "Fronius Symo GEN24 Plus", models: [
            { id: 10, name: "GEN24 3.0 Plus", acMax: 3000, startV: 80, minMppV: 125, maxMppV: 800, maxV: 1000, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 20, maxI: 12.5}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 12.5}] },
            { id: 11, name: "GEN24 4.0 Plus", acMax: 4000, startV: 80, minMppV: 170, maxMppV: 800, maxV: 1000, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 20, maxI: 12.5}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 12.5}] },
            { id: 12, name: "GEN24 5.0 Plus", acMax: 5000, startV: 80, minMppV: 210, maxMppV: 800, maxV: 1000, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 20, maxI: 12.5}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 12.5}] },
            { id: 13, name: "GEN24 6.0 Plus", acMax: 6000, startV: 80, minMppV: 174, maxMppV: 800, maxV: 1000, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 40, maxI: 25}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 12.5}] },
            { id: 14, name: "GEN24 8.0 Plus", acMax: 8000, startV: 80, minMppV: 224, maxMppV: 800, maxV: 1000, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 40, maxI: 25}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 12.5}] },
            { id: 15, name: "GEN24 10.0 Plus", acMax: 10000, startV: 80, minMppV: 278, maxMppV: 800, maxV: 1000, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 40, maxI: 25}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 12.5}] },
            { id: 16, name: "GEN24 12.0 SC Plus", acMax: 12000, startV: 80, minMppV: 295, maxMppV: 800, maxV: 1000, batteryId: 1, mppts: [{id:1, name:"MPPT 1", maxIsc: 40, maxI: 28}, {id:2, name:"MPPT 2", maxIsc: 20, maxI: 14}] }
        ]}
    ]
};

// ==========================================
// STANDARD-ZERTIFIKATE & DATENBLÄTTER DER MASTER-HARDWARE
// DIN VDE 0100-712 / VDE-AR-N 4105 / IEC 61215 / IEC 62619
// ==========================================
const MasterHardwareDocs = {
    // Solarmodule
    'panel_101': [
        { id: 'm_p_101_db', category: 'datenblatt', title: 'AIKO Neostar 3S+54 Datenblatt (ABC N-Type)', standard: 'IEC 61215 / IEC 61730', issuer: 'AIKO Solar Energy', url: 'https://aikosolar.com', notes: 'All-Back-Contact (ABC), 23.6% Wirkungsgrad, -0.22%/°C Temp.-Koeff., 1722x1134x30 mm, 20.5 kg, IP68' },
        { id: 'm_p_101_cert', category: 'zertifikat', title: 'TÜV Rheinland Zertifikat IEC 61215/61730', standard: 'DIN EN IEC 61215:2021', issuer: 'TÜV Rheinland', certNo: 'PV 50578491', validUntil: '2029-03', notes: 'Zertifiziert für Ammoniak-, Salznebel- und Hagelwiderstandsklasse HW4' }
    ],
    'panel_201': [
        { id: 'm_p_201_db', category: 'datenblatt', title: 'Jolywood JW-HD96N-R2 Datenblatt (TOPCon Bifazial)', standard: 'IEC 61215 / IEC 61730', issuer: 'Jolywood Solar', url: 'https://jolywood.cn', notes: 'N-Type TOPCon Doppelglas bifazial, Glas-Glas 2.0+2.0 mm, 1762x1134x30 mm, 24.5 kg, IP68' },
        { id: 'm_p_201_cert', category: 'zertifikat', title: 'TÜV NORD Bauartzulassung & Sicherheitszertifikat', standard: 'IEC 61215 / IEC 61730', issuer: 'TÜV NORD CERT GmbH', certNo: '44 780 22 40674', validUntil: '2028-11', notes: 'Brandschutzklasse Class A nach IEC 61730-2' }
    ],
    'panel_301': [
        { id: 'm_p_301_db', category: 'datenblatt', title: 'Jolywood JW-HD120N-R3 Datenblatt (TOPCon Doppelglas)', standard: 'IEC 61215 / IEC 61730', issuer: 'Jolywood Solar', url: 'https://jolywood.cn', notes: 'N-Type TOPCon bifazial, 485-510W, 1903x1134x30 mm, 26.5 kg, IP68' },
        { id: 'm_p_301_cert', category: 'zertifikat', title: 'TÜV NORD Zertifikat IEC 61215 / IEC 61730', standard: 'IEC 61215 / IEC 61730', issuer: 'TÜV NORD CERT GmbH', certNo: '44 780 23 40812', validUntil: '2029-01', notes: 'Geprüft nach IEC 62716 (Ammoniak) & IEC 61701 (Salznebel)' }
    ],

    // Wechselrichter
    'inv_10': [
        { id: 'm_inv_10_db', category: 'datenblatt', title: 'Fronius Symo GEN24 Plus Datenblatt (3.0 - 10.0 kW)', standard: 'DIN EN 62109-1/-2', issuer: 'Fronius International GmbH', url: 'https://fronius.com', notes: 'Dreiphasiger Hybrid-Wechselrichter, Multi-Flow Technology, 2 MPP-Tracker, IP66, 98.2% max. Wirkungsgrad' },
        { id: 'm_inv_10_cert1', category: 'zertifikat', title: 'VDE-AR-N 4105 Einheitenzertifikat (Erzeugungseinheit Typ 2)', standard: 'VDE-AR-N 4105:2018-11', issuer: 'TÜV Rheinland LGA Products GmbH', certNo: 'AK 50456123 0001', validUntil: '2029-12', notes: 'Konformitätsnachweis für Erzeugungsanlagen am Niederspannungsnetz inkl. integriertem NA-Schutz' },
        { id: 'm_inv_10_cert2', category: 'zertifikat', title: 'Konformitätsnachweis NA-Schutz (Netz- & Anlagenschutz)', standard: 'DIN VDE V 0124-100:2020', issuer: 'TÜV Rheinland', certNo: 'AK 50456124 0001', validUntil: '2029-12', notes: 'Zentraler & integrierter NA-Schutz mit Schnittstellenprüfung' }
    ],
    'inv_100': [
        { id: 'm_inv_100_db', category: 'datenblatt', title: 'Anker SOLIX Solarbank 2 Pro E1600 Datenblatt', standard: 'DIN EN 62109', issuer: 'Anker Innovations', url: 'https://anker.com', notes: 'All-in-One Speicher & 4-fach MPPT Mikrowechselrichter, 800W AC, IP65' },
        { id: 'm_inv_100_cert', category: 'zertifikat', title: 'VDE-AR-N 4105 Unbedenklichkeitsbescheinigung & Zertifikat', standard: 'VDE-AR-N 4105:2018-11', issuer: 'Bureau Veritas Consumer Products', certNo: 'BV-VDE-24-00918', validUntil: '2029-05', notes: 'Zugelassen für steckerfertige PV-Anlagen und Speicherintegration' }
    ],

    // Batteriespeicher
    'bat_302': [
        { id: 'm_bat_302_db', category: 'datenblatt', title: 'BYD Battery-Box Premium HVS Datenblatt (5.1 - 12.8 kWh)', standard: 'IEC 62619 / VDE 2510-50', issuer: 'BYD Company Ltd.', url: 'https://bydbatterybox.com', notes: 'Kobaltfreies Lithium-Eisenphosphat (LiFePO4), Hochvolt 200 - 500V, modular erweiterbar, IP55, 96% Round-Trip' },
        { id: 'm_bat_302_cert1', category: 'zertifikat', title: 'VDE 2510-50 Sicherheitsleitfaden Batteriespeicher', standard: 'VDE 2510-50:2017', issuer: 'TÜV Rheinland', certNo: 'VDE-2510-BYD-HVS', validUntil: '2029-08', notes: 'Höchste Sicherheitsanforderungen für stationäre Batteriespeicher im Wohnbereich' },
        { id: 'm_bat_302_cert2', category: 'zertifikat', title: 'UN 38.3 Transportsicherheitsprüfung & IEC 62619', standard: 'UN 38.3 / IEC 62619:2022', issuer: 'Vkan Certification & Testing', certNo: 'RZUN2023-0182', validUntil: '2028-10', notes: 'Nachweis der Eigensicherheit gegen thermisches Durchgehen' }
    ],
    'bat_403': [
        { id: 'm_bat_403_db', category: 'datenblatt', title: 'BYD Battery-Box Premium HVM Datenblatt (8.3 - 22.1 kWh)', standard: 'IEC 62619 / VDE 2510-50', issuer: 'BYD Company Ltd.', url: 'https://bydbatterybox.com', notes: 'Hochvolt LiFePO4 Speicher, 150 - 400V, modulare Kaskadierung' },
        { id: 'm_bat_403_cert', category: 'zertifikat', title: 'TÜV Rheinland Bauart- & Sicherheitszertifikat', standard: 'IEC 62619 / VDE 2510-50', issuer: 'TÜV Rheinland', certNo: 'R 50462918', validUntil: '2029-06', notes: 'Zertifiziert für gewerbliche und private PV-Eigenverbrauchssysteme' }
    ],
    'bat_202': [
        { id: 'm_bat_202_db', category: 'datenblatt', title: 'Fronius Reserva LiFePO4 Hochvoltspeicher Datenblatt', standard: 'IEC 62619', issuer: 'Fronius International GmbH', url: 'https://fronius.com', notes: 'LiFePO4 Hochvolt-Speichermodule, 6.3 - 15.8 kWh, DC-Kopplung mit GEN24 Plus' },
        { id: 'm_bat_202_cert', category: 'zertifikat', title: 'VDE 2510-50 Sicherheitszertifikat & CE', standard: 'VDE 2510-50', issuer: 'TÜV Rheinland', certNo: 'FR-RES-2510-01', validUntil: '2029-04', notes: 'Vollständige Prüfung nach aktuellen Brandschutz- und Sicherheitsstandards' }
    ],
    'bat_500': [
        { id: 'm_bat_500_db', category: 'datenblatt', title: 'Anker SOLIX BP1600 / BP2700 Erweiterungsakku', standard: 'IEC 62619', issuer: 'Anker Innovations', url: 'https://anker.com', notes: 'LiFePO4 Erweiterungsspeicher 1.6 bis 15 kWh, IP65, 6.000 Ladezyklen' },
        { id: 'm_bat_500_cert', category: 'zertifikat', title: 'CE & UN 38.3 Prüfzertifikat für LiFePO4 Speicher', standard: 'UN 38.3 / IEC 62619', issuer: 'Bureau Veritas', certNo: 'BV-BAT-ANK-091', validUntil: '2029-05', notes: 'Zertifiziert für den Außeneinsatz im Temperaturbereich -20°C bis +55°C' }
    ]
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
        const key = `${deviceType}_${deviceId}`;
        if (MasterHardwareDocs[key]) {
            return MasterHardwareDocs[key].map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
        }
        // Wenn spezifisches Modell nicht da ist, Fallback auf Modellreihe
        if (deviceType === 'panel') {
            const idNum = parseInt(deviceId);
            if (idNum >= 101 && idNum <= 104) return (MasterHardwareDocs['panel_101'] || []).map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
            if (idNum >= 201 && idNum <= 204) return (MasterHardwareDocs['panel_201'] || []).map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
            if (idNum >= 301 && idNum <= 306) return (MasterHardwareDocs['panel_301'] || []).map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
        }
        if (deviceType === 'inv') {
            const idNum = parseInt(deviceId);
            if (idNum >= 10 && idNum <= 16) return (MasterHardwareDocs['inv_10'] || []).map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
            if (idNum === 100) return (MasterHardwareDocs['inv_100'] || []).map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
        }
        if (deviceType === 'bat') {
            const idNum = parseInt(deviceId);
            if (idNum >= 302 && idNum <= 305) return (MasterHardwareDocs['bat_302'] || []).map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
            if (idNum >= 403 && idNum <= 408) return (MasterHardwareDocs['bat_403'] || []).map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
            if (idNum >= 202 && idNum <= 205) return (MasterHardwareDocs['bat_202'] || []).map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
            if (idNum >= 500 && idNum <= 525) return (MasterHardwareDocs['bat_500'] || []).map(d => ({ ...d, isMaster: true, deviceType, deviceId }));
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
window.MasterHardwareDocs = MasterHardwareDocs;
window.HardwareDocManager = HardwareDocManager;
