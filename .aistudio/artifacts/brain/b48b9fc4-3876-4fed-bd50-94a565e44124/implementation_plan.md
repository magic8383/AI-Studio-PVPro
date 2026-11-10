# PV-Planung Pro – Version 8.9: Interaktive Dashboard-Kacheln, Technisches Randlos-Tagesdiagramm mit 3-Spalten-Telemetriekacheln & Sankey-Berechnung über Gesamt-kWh-Zähler

Dieses Update macht die Kacheln auf dem Start-Dashboard direkt interaktiv (1-Tap-Sprung in die fokussierte Verlaufskurve), gestaltet die Tagesverlauf-Seite (Ebene 2) als modernes, technisches Vollbreiten-Telemetrie-Cockpit mit kompakten 3-Spalten-Kacheln neu und stellt das Sankey-Diagramm sowie die Monatsauswertung auf **lebenslange Gesamt-kWh-Zähler (`total_increasing`) mit automatischer Differenzberechnung ($\Delta\text{kWh}$) und Watt-Integrations-Fallback** um – ganz ohne separate Tages- oder Monats-Helfer in Home Assistant.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Bestätigte Entscheidungen aus deinen Antworten:**
> - **1-Tap Kurven-Fokus vom Start-Dashboard:** Ein Tipp auf eine der vier Hauptkacheln (`PV gesamt`, `Hausverbrauch`, `Batteriespeicher`, `Netz`) oder auf einen `Aktiven Verbraucher` (z. B. Trockner, TV-Verstärker) öffnet direkt das große Tagesdiagramm auf Ebene 2 und stellt die gewählte Kurve automatisch in den Fokus (inkl. Umschalt-Chip auf „Alle Standard-Kurven“).
> - **Neues technisches Layout auf Ebene 2 (Tagesverlauf):** Oben ein minimalistisches, randloses Technik-Diagramm über die volle Kartenbreite mit Fadenkreuz-HUD (Uhrzeit, Momentanleistung, Tages-kWh, Tages-Peak); darunter ein **kompaktes 3-Spalten-Raster** (`3 Spalten` auf Smartphones im Querformat/Tablet/Desktop, `2–3 Spalten` adaptiv auf schmalen Displays) mit technischen Mini-Kacheln (Aktuelle Leistung `W`/`%`, Tageswert `kWh` und Peak `Wmax`).
> - **Sankey- & Monatswerte ohne HA-Helfer:** Statt eigener Tages-/Monats-Helfer nutzt die App die normalen **Gesamt-Zählerstände (`kWh total` / `total_increasing`)** deiner Wechselrichter und deines Smart Meters. Über die Home-Assistant-Historie (Zählerstand heute `00:00` bzw. Monatsanfang `01. 00:00`) bildet die App automatisch die Differenz $\Delta\text{kWh} = \text{Stand}_{\text{jetzt}} - \text{Stand}_{\text{Start}}$. Fehlt ein kWh-Zähler komplett, berechnet die App den Tageswert automatisch per Trapez-Integration ($\int P(t)\,dt$) direkt aus den Leistungs-Sensoren (`Watt`).

---

## 1. Overview & Core Concept

- **What It Does:**
  1. **Interaktives Start-Dashboard (Ebene 1):** Jede Statuskachel (`PV gesamt · DC`, `Hausverbrauch · AC`, `BYD HVS+`, `Netz · Bezug / Einspeisung`) sowie jede Zeile unter `Aktive Verbraucher` erhält einen klaren Tap-Interaktionsindikator (Dezentes Kurven-Icon + Hover/Active-Feedback). Ein Tipp springt direkt in den Tagesverlauf und hebt genau diese Kurve hervor (bzw. blendet beim Tipp auf `PV gesamt` die PV-Gesamtkurve + Strings ein). Auch Einzelverbraucher werden automatisch in der 24h-Historie abgetastet und als eigene Kurve darstellbar gemacht.
  2. **Out-of-the-Box Technisches Telemetrie-Chart (Ebene 2):**
     - **Minimalistischer Full-Bleed Canvas oben:** Das Diagramm nutzt die gesamte Breite ohne verschachtelte Boxen. Eine schlanke technische Telemetrie-Kopfzeile zeigt links den `↻ Refresh`-Trigger und das einzeilige Datum, rechts den Schnell-Umschalter `Fokus / Alle Kurven`, `Strings` und `Vollbild`.
     - **Präzisions-HUD (Oszilloskop-Readout):** Direkt im oberen Bereich des Diagramms sitzt eine kompakte, einzeilige Monospace-Messzeile, die beim Darüberstreichen (Touch-Scrubbing) verzögerungsfrei den exakten Zeitpunkt und die Messwerte anzeigt. Wenn eine einzelne Kurve fokussiert ist, erhält sie unterhalb der Linie einen feinen technischen Farbverlauf (`LinearGradient`) und zeigt ihren heutigen Spitzenwert (`Peak W`).
     - **Kompakte 3-Spalten-Kacheln darunter:** Unter dem Diagramm liegen die Messkanäle in einem präzisen **3-Spalten-Grid** (`grid-cols-2 sm:grid-cols-3`). Jede Kachel ist bewusst kompakt und technisch gestaltet: Farb-Indikator + Kanalname + Solo-Fokus-Button (`◎`) oben, großer Monospace-Livewert (`682 W`) in der Mitte und ungerahmte Metadaten (`1,33 kWh · Max 940 W`) unten.
  3. **Sankey-Energiefluss & Logbuch aus `kWh Total`-Zählern + Watt-Fallback:**
     - Im Home-Assistant-Konfigurator (Sektion 5) wählst du über den Komfort-Picker einfach deine vorhandenen **Gesamtzähler (`kWh total`)** aus: `PV-Erzeugung Gesamt (kWh)`, `Netzbezug Gesamt (kWh)`, `Netzeinspeisung Gesamt (kWh)`, `Batterie-Ladung Gesamt (kWh)` und `Batterie-Entladung Gesamt (kWh)`.
     - Die App ermittelt beim Abruf automatisch den Zählerstand zu Tagesbeginn (`00:00 Uhr`) und Monatsbeginn (`1. des Monats, 00:00 Uhr`) über die Home-Assistant-History-API (mit lokalem Snapshot-Cache) und berechnet daraus exakt die `Heute`-, `Monat`- und `Gesamtjahr`-Ströme für das Sankey-Diagramm.
     - Ist für einen Pfad gar kein `kWh`-Zähler hinterlegt, springt automatisch die **Watt-Integration** aus der Leistungskurve ein (z. B. Trennung der Netzleistung `gridPower` in positiven Netzbezug $\int P_{\text{grid}>0}\,dt$ und negative Netzeinspeisung $\int P_{\text{grid}<0}\,dt$ sowie der Batterieleistung `batteryPower` in Ladung $\int P_{\text{bat}>0}\,dt$ und Entladung $\int P_{\text{bat}<0}\,dt$).

---

## 2. User Experience & Visual Design

- **Key User Flows:**
  1. **Vom Dashboard direkt in die Kurve (`Tap-to-Focus`):**
     - Du siehst auf dem Start-Dashboard z. B. `Hausverbrauch · AC: 2,1 kW` oder unter *Aktive Verbraucher* `Trockner: 429 W`.
     - Du tippst direkt auf die Kachel `Hausverbrauch · AC` (oder `Trockner`).
     - Die Ansicht wechselt sofort auf Ebene 2 (`Tagesverlauf`), fokussiert die Kurve `Hausverbrauch · AC` (bzw. `Trockner`) mit feinem Flächen-Gradienten im Vollbreiten-Diagramm und markiert die zugehörige Kachel unten im 3-Spalten-Grid. Über den Button **„Alle Standard-Kurven“** oben rechts kannst du jederzeit mit einem Tipp wieder alle Kurven gemeinsam einblenden.
  2. **Technische Analyse im neuen Ebene-2-Cockpit:**
     - Oben erstreckt sich das randlose Dual-Achsen-Diagramm (`W` links, `%` rechts) über die volle Breite.
     - Darunter siehst du im **3-Spalten-Raster** auf einen Blick alle Kanäle (Strings, PV gesamt, Hausverbrauch, Netzbezug, Netzeinspeisung, Batterie-Leistung, Batterie-SoC % sowie aktive Verbraucher) mit **aktuellem Live-Wert**, **heutiger Energiemenge (`kWh`)** und **Tages-Spitzenwert (`Max W`)**.
     - Ein Tipp auf eine Kachel schaltet die Kurve im Diagramm ein oder aus; ein Tipp auf das kleine Fokus-Symbol (`◎`) rechts oben in einer Kachel isoliert genau diese Kurve („Solo-Modus“).
  3. **Sankey-Energiefluss ohne Helfer-Aufwand:**
     - Im Tab **Analyse** schaltest du das Sankey-Diagramm zwischen `Heute`, `Monat` und `Gesamtjahr` um.
     - Die Werte (`PV-Erzeugung`, `PV-Direktverbrauch`, `Batterie-Ladung/Entladung`, `Hausverbrauch`, `Netzeinspeisung`, `Netzbezug`) speisen sich direkt aus der Differenz deiner `kWh total`-Zählerstände bzw. der Trapez-Integration deiner Watt-Sensoren. Ein kleines Info-Label unter dem Sankey-Header zeigt transparent die Datenquelle an (z. B. `Quelle: HA Gesamtzähler-Differenz (ΔkWh) + Leistungs-Integration`).

- **Visual Identity & Theme:**
  - *Aesthetic Direction:* **Precision Solar Telemetry & Liquid Glass** – inspiriert von modernen wissenschaftlichen Telemetrie-Konsolen (dunkles Obsidian-Glas `#0b1519` / `#101e24`, gestochen scharfe `1px`-Haarlinien, kein optischer Ballast, klare technische Typografie).
  - *Typography & Hierarchy:* `Plus Jakarta Sans` für UI-Labels, kombiniert mit `JetBrains Mono` (`font-mono tabular-nums`) für alle Leistungs-, Energie-, Prozent- und Zeitwerte. Metadaten unter den Zahlen werden ohne Pill-Boxen als ruhiger Fließtext mit `·`-Trenner dargestellt (`1,33 kWh · Max 940 W`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Automatische Differenzbildung ($\Delta\text{kWh}$) aus `total_increasing` Zählern + Bidirektionale Watt-Integration**
  - *Chosen Approach:* Ein einziger Satz von `kWh total`-Zählern reicht für `Heute`, `Monat` und `Gesamtjahr`. Zusätzlich integriert die History-Engine im Browser nun auch **vorzeichenbehaftete Leistungs-Sensoren** getrennt nach positiver und negativer Halbwelle:
    - `gridPower > 0` $\rightarrow$ `grid_import_kwh`, `gridPower < 0` $\rightarrow$ `grid_export_kwh`
    - `batteryPower > 0` $\rightarrow$ `battery_charge_kwh`, `batteryPower < 0` $\rightarrow$ `battery_discharge_kwh`
  - *Why:* Selbst wenn ein Nutzer überhaupt keine `kWh`-Sensoren konfiguriert hat und nur die 4 Watt-Sensoren (`PV W`, `Haus W`, `Netz W`, `Batterie W`) besitzt, zeigt das Sankey-Diagramm für `Heute` sofort zu 100 % echte, physikalisch korrekte Energieflüsse aus seinen eigenen Sensoren an! Und mit `kWh total`-Sensoren funktionieren auch `Monat` und `Gesamtjahr` komplett ohne HA Utility-Meter-Helfer.

- **Decision 2: Normaler Tap = Kurve ein/ausblenden, Fokus-Tap / Dashboard-Tap = Fokus-Modus (Solo)**
  - *Chosen Approach:* Wenn man vom Start-Dashboard auf eine Kachel tippt, öffnet sich das Diagramm fokussiert auf genau diesen Bereich (z. B. Tipp auf `PV gesamt` zeigt `PV gesamt` + die PV-Strings; Tipp auf `Hausverbrauch` fokussiert `Hausverbrauch`; Tipp auf `BYD HVS+` fokussiert `Batterie SoC %` + `Batterie-Leistung`; Tipp auf `Netz` fokussiert `Netzbezug & Einspeisung`; Tipp auf einen `Einzelverbraucher` fokussiert genau diesen Verbraucher). Ein prominenter Button `Alle Kurven` blendet sofort die gewohnte Gesamtübersicht wieder ein.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 START-DASHBOARD (EBENE 1: #live-hub-view)                    │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐  │
│  │ 2x2 Status-Kacheln   │  │ Aktive Verbraucher   │  │ Drill-Down Kachel  │  │
│  │ • PV gesamt (Tap)    │  │ • Trockner (Tap)     │  │ • Tagesverlauf &   │  │
│  │ • Hausverbrauch (Tap)│  │ • TV-Verstärker (Tap)│  │   Kurven (Alle)    │  │
│  │ • Speicher (Tap)     │  │ • Licht ... (Tap)    │  └─────────┬──────────┘  │
│  │ • Netz (Tap)         │  └──────────┬───────────┘            │             │
└──┴──────────┬───────────┴─────────────┼────────────────────────┼─────────────┘
              │ openLiveCurveFocus(key) │                        │
              ▼                         ▼                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│       NEUES TECHNIK-COCKPIT (EBENE 2: #live-detail-intraday)                 │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Top Telemetry Bar: [↻] 10.11.2026 · 00:00–jetzt  [Alle] [Strings] [⛶] │  │
│  │ Crosshair HUD:     11:20 Uhr · PV: 682 W · Haus: 2.100 W · SoC: 8,4 %  │  │
│  │ Full-Bleed Canvas: Dual-Axis Chart.js (W / %) + Area Gradient Fill    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐  │
│  │ ● String 1 DC    [◎] │  │ ● String 2 DC    [◎] │  │ ● PV gesamt    [◎] │  │
│  │ 291 W                │  │ 275 W                │  │ 682 W              │  │
│  │ 0,58 kWh · Max 410 W │  │ 0,54 kWh · Max 390 W │  │ 1,33 kWh · Max 940W│  │
│  └──────────────────────┘  └──────────────────────┘  └────────────────────┘  │
│  (3-Spalten-Technik-Grid für Strings, System-Kanäle & Einzelverbraucher)     │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│     ZERO-HELPER SANKEY & ENERGIEDIFFERENZ-ENGINE (computeHaEnergyDeltas)     │
│  1. Prüft konfigurierte kWh-Total-Zähler (PV, Netz-Imp/Exp, Akku-Chg/Dis)    │
│  2. Holt Startwerte (Heute 00:00 & 1. des Monats 00:00) via /api/history     │
│     + speichert lokale Monats-/Tages-Baselines im Browser-Cache              │
│  3. Berechnet ΔkWh_heute & ΔkWh_monat = Zähler_jetzt - Zähler_start          │
│  4. Fallback ohne kWh-Sensor: Trapez-Integration ∫P(t)dt aus Watt-Historie   │
│     (inkl. Vorzeichen-Split für Netzbezug/Einspeisung & Akku-Ladung/Entl.)   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping
1. **`openLiveCurveFocus(focusTarget)`:**
   - Navigiert von `#live-hub-view` nach `#live-detail-intraday` (setzt den Header-Zurück-Button auf Ebene 2).
   - Setzt `activeCurveKeys` gezielt auf die angeforderte Kurve bzw. Kurvengruppe (`'pv'` $\rightarrow$ `pv_total` + alle `customStrings`; `'load'` $\rightarrow$ `house_load`; `'battery'` $\rightarrow$ `battery_soc` + `battery_power`; `'grid'` $\rightarrow$ `grid_power` + `grid_feedin`; `'consumer:<id>'` $\rightarrow$ den jeweiligen Einzelverbraucher + optional `house_load`).
   - Aktiviert `focusedCurveMode = true` und rendert den „Alle Standard-Kurven“-Reset-Button in der Telemetrie-Leiste.
2. **Erweiterte 24h-History-Abtastung (`fetchHaHistoryInBrowser`):**
   - Nimmt neben `customStrings` und den Hauptsensoren auch `batteryPower`, `gridExportPower` sowie alle konfigurierten `customConsumers` in die 5-Minuten-Zeitreihen und die Trapez-Integration (`integratedKwh`) auf.
   - Berechnet für jede Zeitreihe zusätzlich den heutigen Spitzenwert (`peakValues[key] = Math.max(...)`), damit jede der 3-Spalten-Technikkacheln unter dem Chart `kWh heute · Max W` anzeigen kann.
   - Zerlegt bidirektionale Leistungssensoren (`gridPower` und `batteryPower`) automatisch in ihre positiven und negativen Energie-Integrale (`integratedKwh.grid_import`, `integratedKwh.grid_export`, `integratedKwh.battery_charge`, `integratedKwh.battery_discharge`).
3. **Total-kWh-Differenz-Engine (`fetchHaTotalCounterDeltasInBrowser`):**
   - Unterstützt in `#modal-ha-config` (Sektion 5) lebenslange Gesamtzähler (`kWh total` / `Wh total` / `MWh total`) für PV, Netzbezug, Netzeinspeisung, Batterie-Ladung und Batterie-Entladung (plus String-Gesamtzähler).
   - Fragt für die konfigurierten `kWh`-Entitäten über `/api/history/period/<startOfToday>` und `/api/history/period/<startOfMonth>` den ersten gültigen Zählerstand am Periodenbeginn ab, bildet die Differenz $\Delta\text{kWh} = \max(0, \text{Wert}_{\text{jetzt}} - \text{Wert}_{\text{Start}})$ und speist damit sowohl das **Sankey-Diagramm (`Heute`, `Monat`, `Gesamtjahr`)** als auch den automatischen Monats-Eintrag im Logbuch.
4. **Versionierung & Governance (`Version 8.9`):**
   - Synchrones Versions-Upgrade von `8.8` auf `8.9` über `package.json`, `index.html`, `app.js`, `sw.js`, `DEVELOPMENT_GUIDELINES.md`, `content.js` und `CHANGELOG.md`.
