# PV-Planung Pro – Version 9.2: Multi-Wechselrichter PV-Zähler (`+` Button & String-Summe) & Neues Liquid-Glass App-Icon

Dieses Update erweitert die PV-Gesamterfassung für Anlagen mit zwei oder mehr Wechselrichtern (z. B. Fronius + Hoymiles) um beliebig viele per **`+` Button** hinzufügbare `kWh`-Zähler (inkl. automatischer Summierung aus den String-Sensoren) und stattet die App mit einem neuen, modernen **Liquid-Glass Türkis/Smaragd App-Icon** für Homescreen, Browser-Tab und Header aus.

## User Review & Critical Decisions

> [!IMPORTANT]
> Alle Rückfragen aus Phase 1 sind geklärt und fließen direkt in den Umsetzungsplan für **Version 9.2** ein:

- **Confirmed Decision 1 – Multi-Wechselrichter PV-Erzeugung (`kWh` mit `+` Button & String-Summierung)**:
  - **Leistung (`W`) automatisch aus den Strings:** Wenn das Feld `PV gesamt · DC (Aktuell)` leer gelassen wird, bildet die App sowohl für den Live-Wert auf dem Dashboard als auch für die `PV gesamt · DC`-Kurve im 24h-Tagesdiagramm automatisch die exakte Summe aller eingetragenen Strings / Wechselrichter-Kanäle.
  - **Echte `kWh`-Zähler für mehrere Wechselrichter per `+` Button:** Im Bereich *„5. Gesamt-Energiezähler (kWh Total)“* erhält `PV-Erzeugung Gesamt (kWh Total)` einen **`+ Wechselrichter-Zähler`**-Button. Damit lassen sich beliebig viele weitere Wechselrichter-Energiezähler (z. B. *WR 1 Fronius kWh Total* + *WR 2 Hoymiles kWh Total*) mit dem Komfort-Sensor-Picker (`Wählen`) hinzufügen.
  - **Automatische $\Delta\text{kWh}$-Summierung & String-Fallback:** Für jeden eingetragenen Wechselrichter-Zähler wird einzeln der Tages- ($\Delta\text{kWh}$ seit `00:00` Uhr) und Monatswert ($\Delta\text{kWh}$ seit Monatsbeginn) berechnet und anschließend zur gesamten PV-Erzeugung (`Heute`, `Monat`, `Jahr` im Dashboard & Sankey) addiert. Sind oben gar keine globalen PV-Zähler eingetragen, summiert die App automatisch die bei den einzelnen PV-Strings hinterlegten `kWh`-Sensoren.
- **Confirmed Decision 2 – Neues App-Icon im Stil „Liquid-Glass Türkis/Smaragd“**:
  - Neues, modernes App-Icon im **Liquid-Glass Türkis/Smaragd**-Design: Ein abgerundetes Tiefsee-/Smaragd-Glas-Squircle mit feinem Lichtkanten-Reflex, stilisiertem monokristallinem Solar-Panel, leuchtender türkis-smaragdgrüner Energiewelle (Tagesverlauf-Kurve) und markantem Energie-Blitz im Zentrum.
  - Wird als hochauflösendes Vektor-Icon sowie als maskierbare PWA-Icons (`192×192`, `512×512`, `180×180` Apple-Touch-Icon, `32×32` Favicon) und direkt in der App-Kopfzeile ausgerollt.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. Erlaubt das direkte Eintragen und Summieren von zwei oder mehr echten Wechselrichter-Energiezählern (`kWh Total` oder `Tages-kWh`) über eine dynamische `+`-Liste im Home-Assistant-Setup sowie das automatische Summieren der String-Leistungen (`W`) und String-Energiezähler (`kWh`).
  2. Ersetzt das bisherige dunkle App-Icon durch ein auf das neue **Liquid-Glass Türkis/Smaragd**-Interface abgestimmtes Icon-Set für Smartphones (Android & iOS Homescreen), Desktop-Browser und den App-Header.
- **Target Audience / Persona**: Anlagenbetreiber mit Hybrid- und Multi-Wechselrichter-Systemen (z. B. Haupt-Wechselrichter + Mikrowechselrichter wie Fronius + Hoymiles), die echte Zählerstände ohne künstliche Home-Assistant-Template-Helfer nutzen möchten.
- **Key Value**: 100 % exakte Tages-, Monats- und Jahreserträge über alle Wechselrichter hinweg ohne Basteln von Summen-Helfern in Home Assistant – kombiniert mit einem modernen Markenauftritt auf dem Smartphone-Homescreen.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Mehrere Wechselrichter-Zähler per `+` hinzufügen**:
     - Im Modal *Home Assistant & Sensoren* unter *„5. Gesamt-Energiezähler (kWh Total)“* befindet sich direkt bei `PV-Erzeugung Gesamt (kWh Total)` der Button **`+ Wechselrichter-Zähler`**.
     - Ein Tap fügt ein weiteres Zählerfeld (z. B. `PV-Erzeugung · Wechselrichter 2 (kWh Total / Heute)`) inklusive **`Wählen`**-Button (Komfort-Sensor-Picker mit Geräte-Gruppierung) und Löschen-Button (`×`) hinzu.
     - Alle dort eingetragenen Zähler werden auch beim zentralen, token-freien Speichern für GitHub/Server (`haConfigSanitized`) automatisch mitgesichert.
  2. **Automatische String-Summierung (`W` & `kWh`)**:
     - Wird `PV gesamt · DC (W)` leer gelassen, summiert die App automatisch die Live-Wattwerte aller Strings und bildet im 24h-Tagesdiagramm automatisch die Summenkurve `PV gesamt · DC` aus den String-Verläufen.
     - Werden die `kWh`-Zähler stattdessen direkt bei den Strings (Sektion 3) gepflegt und oben kein globaler PV-Zähler eingetragen, addiert die App automatisch die Tages- und Monats-kWh aller Strings.
  3. **Liquid-Glass Türkis/Smaragd App-Icon**:
     - Tiefes Smaragd-/Obsidian-Glas-Squircle (`#042f2e` → `#0f172a`) mit leuchtendem Türkis-Smaragd-Lichtkranz (`#14b8a6` / `#10b981`), gläserner Solar-Matrix in der unteren Hälfte, dynamischer leuchtender Energiewelle (Sinus-/Tageskurve) und einem kristallklaren Energie-Blitz-Emblem im Zentrum.
     - In der App-Kopfzeile links oben erscheint das neue Icon als edles Mini-Emblem neben dem Versions-Badge **`Pro 9.2`**.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Einzel-Baseline-Berechnung vor der Summierung (statt Rohwert-Addition)**
  - *Chosen Approach*: Jeder eingetragene Wechselrichter-Zähler (`pvEnergyMonth` + `pvEnergyExtraEntities[]`) erhält in `syncEnergyCounterBaselinesFromHaHistory` seine eigene `00:00`-Uhr- und Monatsstart-Baseline (inkl. individueller Einheiten-Skalierung `Wh` / `kWh` / `MWh` und `total_increasing`-Erkennung). Erst die daraus berechneten $\Delta\text{kWh}$-Werte werden zur Gesamterzeugung addiert.
  - *Why*: Oft liefert Wechselrichter 1 (z. B. Fronius) den Zählerstand in `Wh` (`total_increasing`), während Wechselrichter 2 (z. B. Hoymiles / OpenDTU / Shelly) in `kWh` oder als Tageszähler (`YieldDay`) meldet. Durch die getrennte Delta-Berechnung je Sensor lassen sich selbst gemischte Zählertypen und Einheiten fehlerfrei addieren.
- **Decision 2: Vektor-SVG + Vorgerenderte hochauflösende PNG-Icons mit Cache-Buster `?v=9.2`**
  - *Chosen Approach*: Wir aktualisieren sowohl das skalierbare Vektor-Master-Icon (`icon.svg`) als auch alle Raster-Icons (`icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `favicon-32.png`) und versehen Manifest sowie Icon-Links mit `?v=9.2`.
  - *Why*: iOS Safari (`apple-touch-icon`) und Android WebAPKs (`manifest.json`) benötigen zwingend echte PNG-Dateien mit 12–15 % Safe-Zone-Padding, damit das neue Icon sofort auf dem Smartphone-Homescreen erscheint.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 HOME ASSISTANT SENSOR-KONFIGURATION (Modal)                  │
│  • Sektion 3: PV-Strings (powerEntity W + optional energyEntity kWh)         │
│  • Sektion 5: PV-Erzeugung Zähler 1 + [+ WR-Zähler] (pvEnergyExtraEntities)  │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│            MULTI-INVERTER ENERGY & POWER ENGINE (Browser & Server)           │
│                                                                              │
│  1. Live & 24h PV-Leistung (W):                                              │
│     • Wenn pvPower gesetzt -> direkt nutzen                                  │
│     • Wenn pvPower leer    -> Summe aller customStrings (Live W & 24h-Kurve) │
│                                                                              │
│  2. PV-Erzeugung Heute / Monat / Jahr (kWh):                                 │
│     • Liste aller aktiven PV-Zähler = [pvEnergyToday/Month, ...ExtraWRs]     │
│     • Für jeden Zähler i:                                                    │
│       ΔkWh_i = resolveEnergyCounterDelta(id_i, liveKwh_i, baseline_00_00)    │
│     • Summe PV_Heute = Σ ΔkWh_i                                              │
│     • Fallback (falls oben leer): Σ ΔkWh aller String-energyEntities         │
│     • Letzter Fallback: Trapez-Integral der heutigen PV-Watt-Kurve           │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┴─────────────────────────────┐
          ▼                                                           ▼
┌───────────────────────────────────┐               ┌───────────────────────────────────┐
│   LIVE-DASHBOARD & TAGESKURVEN    │               │    SANKEY & PERFORMANCE-ANALYSE   │
│ • Kachel "PV gesamt":             │               │ • Heute / Monat / Jahr PV-Ertrag  │
│   Summe W + "X,XX kWh · Heute"    │               │   aus Summe aller WR-Zähler       │
│ • Kurve "PV gesamt · DC"          │               │ • Automatischer Monats-Sync       │
└───────────────────────────────────┘               └───────────────────────────────────┘
```

### Data Model & State Changes

- **`haConfigState.pvEnergyExtraEntities`**: Array aus Strings (`['sensor.hoymiles_total_energy', ...]`), standardmäßig `[]`. Wird im Browser-Storage (`pvpro_ha_config`), auf dem Server (`data/ha_config.json`) sowie beim token-freien GitHub/Projekt-Export (`haConfigSanitized`) vollständig persistiert.
- **Dynamischer Editor im HA-Modal (`renderHaPvEnergyExtraList()`, `addHaPvEnergyExtra()`, `removeHaPvEnergyExtra(idx)`)**:
  - Rendert zusätzliche Wechselrichter-Energiezähler-Zeilen direkt unter `PV-Erzeugung Gesamt (kWh Total)` mit eigenem `Wählen`-Button (`openHaEntityPicker` mit `unitFilter: 'energy'`).
- **24h-Summenkurve für `pv_total`**:
  - Wenn `entities.pvPower` leer ist, berechnet `fetchHaHistoryInBrowser` (und `/api/ha/history`) die Zeitreihe `series.pv_total` sowie `integratedKwh.pv_total` automatisch durch elementweise Addition der Zeitreihen aller konfigurierten `customStrings`.
