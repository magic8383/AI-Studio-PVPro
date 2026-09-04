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
