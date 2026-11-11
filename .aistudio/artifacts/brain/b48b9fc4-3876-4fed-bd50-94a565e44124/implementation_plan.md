# Langzeit-Statistik (HA Long-Term Statistics), GitHub-Backup & Vereinte Single-Source Sensor-Konfiguration (Version 9.9)

Dieses Update stellt sicher, dass alle Monats- und Jahreswerte auch nach wochenlanger Pause lückenlos aus Home Assistants unbegrenzter Langzeit-Statistik geladen sowie im GitHub-Projektstand gesichert werden, und vereint die Sensor-Einstellungen zu einer einzigen, platzsparenden Oberfläche mit maximaler Lesbarkeit für lange Sensornamen.

## User Review & Critical Decisions

> [!IMPORTANT]
> Alle Rückfragen wurden vorab geklärt und sind in diesem Plan verbindlich berücksichtigt:

- **Sektion 2 & Sektion 5 zusammenlegen (Bestätigt)**: Die bisher getrennten Bereiche „2. Haupt-Leistungssensoren (W)“ und „5. Single Source of Truth · Energiezähler (kWh)“ werden zu einer einzigen Sektion **„2. Haupt-Sensoren · Single Source of Truth (Live-W & kWh-Zähler)“** verschmolzen. Für jeden Energiekanal (PV, Hausverbrauch, Netzbezug, Netzeinspeisung, Batterie-Ladung, Batterie-Entladung) stehen der Live-`W`-Sensor und der `kWh Total`-Zähler direkt zusammen.
- **Kompakter Nur-Icon-Picker-Button (Bestätigt)**: Alle „Wählen“-Buttons neben den Sensor-Eingabefeldern werden durch einen kompakten, quadratischen Nur-Icon-Button (`list_alt` ohne Textlabel) ersetzt, damit besonders lange Home-Assistant-Entitätsnamen auf dem Smartphone nicht abgeschnitten werden.
- **Platzsparende Verbraucher- & String-Karten (Bestätigt)**: Bei den Einzelverbrauchern (und PV-Strings) wandert das rote Papierkorb-Symbol (`delete`) nach oben direkt rechts neben das Namensfeld, wodurch die bisherige leere Fußzeile komplett entfällt.

---

## 1. Overview & Core Concept

- **Was umgesetzt wird**:
  1. **Home Assistant Langzeit-Statistik (`recorder/statistics_during_period`)**: Direkte Abfrage der unbegrenzt gespeicherten Langzeit-Statistik-Datenbank von Home Assistant über `/api/websocket` (direkt im Browser für GitHub Pages sowie als Server-Fallback). Selbst wenn die App wochen- oder monatelang nicht geöffnet wurde, holt sie sich daraus rückwirkend die exakten Monats-kWh (`change`) für alle Monate des Jahres sowie den exakten Zählerstand vom 1. des Monats (`monthStart`).
  2. **Dauerhafte Speicherung im GitHub-Projektstand (`database.js`)**: Beim zentralen Speichern eines Projekts (und beim GitHub-JSON-Export) werden das komplette Monats-Logbuch (`performanceRecords`) und die Zähler-Startwerte (`energyBaselines`) automatisch mit in `database.js` (`CodePersistedPlans`) geschrieben (stets ohne dein geheimes Access-Token und ohne Sekunden-Livewerte).
  3. **Vereinte Sensor-Konfiguration ohne Dopplung**: Zusammenlegung von Sektion 2 und Sektion 5, sodass jeder Kanal nur noch einmal existiert und dort direkt seinen `W`-Sensor und `kWh`-Zähler bündelt.
  4. **Kompaktes Layout für lange Sensornamen**: Nur-Icon-Auswahlbuttons (`list_alt`) und integriertes Papierkorb-Icon in der Kopfzeile jedes Einzelverbrauchers und PV-Strings.
- **Zielgruppe & Mehrwert**: Nutzer auf dem Smartphone erhalten sofortige Übersicht über lange `sensor.*`-Namen, sparen sich doppeltes Scrollen in den Einstellungen und können sich darauf verlassen, dass Monats- und Jahresbilanzen auch nach dem 10-Tage-Recorder-Purge von Home Assistant jederzeit exakt stimmen.

---

## 2. User Experience & Visual Design

- **Vereinte Sektion 2 („Haupt-Sensoren · Single Source of Truth“)**:
  - Oben zeigt die kompakte 6-Kanal-Statusmatrix auf einen Blick die berechneten `Heute`- und `Monat`-kWh.
  - Darunter ist jeder Kanal klar gruppiert:
    - **PV-Erzeugung**: `PV gesamt · Leistung (W)` + `Wechselrichter 1 & 2 (kWh Total)` + Button `+ WR-Zähler`.
    - **Hausverbrauch**: `Hauslast · Leistung (W)` + `Hausverbrauch · Zähler (kWh Total, optional)`.
    - **Netzbezug**: `Netzbezug · Leistung (W)` + `Netzbezug · Zähler (kWh Total)`.
    - **Netzeinspeisung**: `Netzeinspeisung · Leistung (W)` + `Netzeinspeisung · Zähler (kWh Total)`.
    - **Batteriespeicher**: `Batterie SoC (%)`, `Ladeleistung (W)` + `Lade-Zähler (kWh Total)`, `Entladeleistung (W)` + `Entlade-Zähler (kWh Total)` (sowie optionale Kombi-Felder eingeklappt/kompakt).
  - Die bisherige separate Sektion 5 entfällt komplett, sodass die Nummerierung sauber auf **1. Verbindung**, **2. Haupt-Sensoren (W & kWh)**, **3. PV-Strings**, **4. Einzelverbraucher**, **5. Webhook-Alternative** strafft wird.
- **Kompakte Verbraucher-Karten (Sektion 4)**:
  - **Zeile 1**: Eingabefeld `Gerätename (z.B. Trockner)` + direkt rechts daneben das kompakte Papierkorb-Icon (`delete`).
  - **Zeile 2**: Eingabefeld `sensor.shelly_pm_mini_gen3_...` (nutzt fast die gesamte Kartenbreite) + rechts daneben der kompakte quadratische Nur-Icon-Button (`list_alt`).
  - Dadurch wird jede Verbraucherkarte um ca. 35 % flacher und zeigt deutlich mehr Zeichen des Sensornamens an.

---

## 3. Key Product Decisions & Trade-Offs

- **Entscheidung 1: Home Assistant Langzeit-Statistik via WebSocket (`recorder/statistics_during_period`)**
  - *Gewählter Ansatz*: Nutzung der offiziellen Home-Assistant-WebSocket-API (`/api/websocket`) direkt aus dem Browser (sowie optional über den Server-Proxy), um `recorder/statistics_during_period` mit `period: "month"` (für alle Monate seit Jahresbeginn) und `period: "day"`/`"hour"` (für den Monatsanfang) abzufragen.
  - *Warum*: Die normale REST-API (`/api/history/period`) greift nur auf die `states`-Tabelle zu, die Home Assistant nach 10 Tagen löscht. Die Langzeit-Statistik (`statistics`-Tabelle) speichert `kWh`-Zählerstände und Monatsdifferenzen (`change`) unbegrenzt für Jahre und funktioniert durch den direkten Browser-WebSocket auch auf GitHub Pages komplett ohne eigenen App-Server.
- **Entscheidung 2: Monats-Logbuch & Baselines in `database.js` (GitHub-Sync)**
  - *Gewählter Ansatz*: Erweiterung des Projekt-Speicherobjekts (`planData` in `CodePersistedPlans`) um `energyBaselines` und `performanceRecords` mit automatischer Zusammenführung (`Math.max` pro abgeschlossenem Monat).
  - *Warum*: Damit sind die Monats- und Jahreswerte sowohl in Home Assistant als auch direkt in deinem GitHub-Repository gesichert, ohne dass sekündliche Live-Daten das Repository aufblähen.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌───────────────────────────────────────────────────────────────────────────┐
│                   HOME ASSISTANT DATENQUELLEN (HYBRID)                    │
│  1. Live-States (/api/states)         -> Aktuelle W & aktueller kWh-Stand │
│  2. Kurzzeit-History (/api/history)   -> 00:00 Uhr Baseline & 24h-Kurven  │
│  3. Langzeit-Statistik (/api/websocket: recorder/statistics_during_period)│
│     -> Unbegrenzte Monats- & Jahres-kWh (auch > 10 Tage & nach App-Pause) │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│            SINGLE SOURCE OF TRUTH ENERGY LEDGER (telemetry.js)            │
│  • Kombiniert pro Kanal (PV, Haus, Netz-Imp/Exp, Akku-Chg/Dis):           │
│    Live-Watt (W) + Gesamtzähler (kWh) + HA Langzeit-Statistik             │
│  • Garantiert mathematisch: Gesamtjahr >= Monat >= Heute                  │
└─────────────────┬─────────────────────────────────────────┬───────────────┘
                  │                                         │
                  ▼                                         ▼
┌──────────────────────────────────────┐  ┌─────────────────────────────────┐
│     VEREINTE SENSOR-UI (Modal)       │  │  GITHUB & PROJEKT-PERSISTENZ    │
│  • Sektion 2: W + kWh direkt gepaart │  │  • localStorage (Browser)       │
│  • Nur-Icon Picker-Button (list_alt) │  │  • database.js (GitHub-Sync:    │
│  • Kompakte Verbraucher (Müll-Icon   │  │    Monats-Logbuch + Baselines,  │
│    oben rechts neben Gerätename)     │  │    stets ohne Access-Token)     │
└──────────────────────────────────────┘  └─────────────────────────────────┘
```

- **Ablauf der Langzeit-Statistik-Synchronisation (`syncLongTermStatisticsFromHa`)**:
  1. Beim Start sowie nach dem Speichern der Sensor-Einstellungen öffnet die App eine kurze WebSocket-Verbindung zu `wss://<deine-ha-domain>/api/websocket`, authentifiziert sich mit dem gespeicherten Token und sendet `recorder/statistics_during_period` für alle konfigurierten `kWh`-Zähler vom `01.01.` des aktuellen Jahres bis jetzt (`period: "month"`).
  2. Für jeden vergangenen und den laufenden Monat wird die exakte Monats-Differenz (`change` bzw. `state`-Differenz) ausgelesen:
     - Für den **laufenden Monat** wird die Monats-Baseline (`monthStart`) exakt auf `aktueller Zählerstand - change_laufender_Monat` (bzw. den Stand am Monatsanfang) gesetzt – selbst wenn der 1. des Monats länger als 10 Tage zurückliegt.
     - Für **alle bisherigen Monate des Jahres** (Januar bis Vormonat) werden die historischen Monatswerte automatisch in das Monats-Logbuch (`performanceRecords`) übernommen, sodass die Jahresbilanz und die 12-Monats-Übersicht sofort vollständig sind.
- **Versionierung**: Gemäß `DEVELOPMENT_GUIDELINES.md` wird die Version über alle Module hinweg von `9.8` auf `9.9` erhöht und in `CHANGELOG.md` dokumentiert.
