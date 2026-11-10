# Implementierungsplan – Version 9.3: Getrennte Netz-Leistungen, Sticky-Chart mit Tag/Woche/Monat, reale HA-Ertragsanalyse & Dark-Mode-Menü

> **Status: ERFOLGREICH UMGESETZT & VERIFIZIERT (Version 9.3)**

## 1. Problemstellung & Nutzerfeedback
1. **Netzbezug & Netzeinspeisung in Sektion 2:** Bisher gab es unter den Haupt-Leistungssensoren (W) nur ein einziges Kombi-Feld `ha_ent_grid_power` (+ Bezug / - Einspeisung). Der Nutzer hat jedoch in Home Assistant zwei separate Watt-Sensoren (`sensor.keller_solarnet_leistung_netzbezug` und `sensor.keller_solarnet_leistung_netzeinspeisung`).
2. **Realer Ist-Ertrag & Sankey:** Auf der Analyse-Seite stimmte der „Reale Ist-Ertrag“ nicht, da die Seite bisher auf synthetische Demo-Monatswerte (`generateRealisticSampleMonths`) zurückgriff, anstatt die echten konfigurierten HA-Zähler (`pv_total`, `pv_today`, `pvEnergyExtraEntities`) abzufragen. Zudem soll das Sankey-Diagramm interaktiver werden.
3. **Sticky-Chart auf Ebene 2 (Tagesverlauf):** Das Diagramm soll oben fixiert bleiben, während die Messkanal-Kacheln darunter durchgescrollt werden. So sieht der Nutzer sofort den Effekt, wenn er eine Kurve ein-/ausschaltet oder fokussiert, und mobil bleiben mindestens 2 Kachelreihen sichtbar.
4. **Zeithorizont Tag / Woche / Monat:** Über dem Diagramm soll ein Umschalter für `Tag` (24h / 00:00-jetzt), `Woche` (7 Tage) und `Monat` (30 Tage) platziert werden. Der bisherige gefährliche Button zu den Sensoren wird entfernt.
5. **Menü im Dark Mode:** Das Menü (`#modal-bottom-menu`) ist optisch noch nicht vollständig an das M3-Design und den Dark Mode angepasst.

---

## 2. Technische Architektur & Änderungen

### A. HA-Sensor-Setup: Getrennte Watt-Felder für Netzbezug & Netzeinspeisung
- **`index.html` (Sektion 2):**
  - Aufteilung in:
    1. `ha_ent_grid_imp_power`: **Netzbezug · Leistung (W)** mit Komfort-Picker (`unitFilter: 'power'`)
    2. `ha_ent_grid_exp_power`: **Netzeinspeisung · Leistung (W)** mit Komfort-Picker (`unitFilter: 'power'`)
    3. `ha_ent_grid_power`: Als optionales Kombi-Feld (+/- W) für Nutzer mit Einzel-Zweirichtungs-Sensor belassen.
- **`telemetry.js` & `server.js`:**
  - Erweiterung von `haConfigState.entities` um `grid_power_import` und `grid_power_export`.
  - In `parseHaStatesInBrowser()`:
    - Wenn getrennte Sensoren belegt sind: `gridPower = (importW - exportW)`.
    - Ist nur `grid_power_import` belegt: `gridPower = importW`.
    - Ist nur `grid_power_export` belegt: `gridPower = -exportW`.
    - Fallback auf `ha_ent_grid_power`, falls vorhanden.

### B. Ebene 2: Sticky-Diagramm & scrollbare Kacheln
- **Layout & CSS in `index.html`:**
  - Ebene 2 erhält eine zweigeteilte Struktur:
    1. **Sticky Top Container:** `sticky top-0 z-30 pt-2 pb-2 backdrop-blur-md bg-white/85 dark:bg-slate-950/85 border-b border-slate-200/60 dark:border-white/10 rounded-b-[24px]` mit kompakter Chart-Höhe (mobil ~190-210px, Desktop ~280px).
    2. **Scrollbarer Kachel-Bereich:** Bleibt frei scrollbar, sodass mindestens 2 Kachel-Reihen auf Smartphones stets darunter sichtbar und bedienbar sind.
  - Sofortige visuelle Rückmeldung: Tappen auf eine Kachel (Kurve ein/aus oder Fokus) aktualisiert das oben fixierte Chart ohne Page-Scroll.

### C. Neuer Zeitauswahl-Umschalter (Tag, Woche, Monat) & Entfernen des Sensor-Buttons
- **Diagramm-Header auf Ebene 2:**
  - Entfernung des bisherigen Zahnrad-/Sensor-Buttons oberhalb des Diagramms.
  - Integration eines kompakten M3-Segmented-Buttons:
    - `Tag` (00:00 – jetzt, minütlich)
    - `Woche` (Letzte 7 Tage)
    - `Monat` (Letzte 30 Tage)
- **Backend / Telemetrie-Logik:**
  - Anpassung der Datenabfrage in `/api/ha/history` bzw. Client-Aggregation: Abruf der entsprechenden Historie über Home Assistant REST API (`/api/history/period/...`).

### D. Reale HA-Zählerstände für die Analyse-Seite & Sankey-Interaktivität
- **Realer Ist-Ertrag:**
  - Abschaffung der statischen Demo-Seeds: Wenn ein Home Assistant Zähler (`pv_total`, `Wechselrichter 1`, `Wechselrichter 2`, Extra-Zähler) konfiguriert ist, berechnet die Analyse-Seite den realen Monats- und Jahresertrag direkt aus den tatsächlichen Zähler-Deltas.
  - Zusätzlicher Button **„Aus HA-Zählern aktualisieren“** im Analyse-Header, der alle erfassten Monatswerte auf Knopfdruck mit den realen Zählerwerten abgleicht.
- **Sankey-Interaktivität:**
  - Klickbare Bänder und Knoten: Beim Tippen/Hovern auf einen Pfad (z. B. PV &rarr; Haus, PV &rarr; Batterie, Netz &rarr; Haus) wird dieser visuell hervorgehoben (Glow & vergrößerte Deckkraft), und ein interaktives Detail-Badge blendet den genauen Anteil (in % und kWh) ein.

### E. Menü-Design & Dark Mode Harmonisierung
- **`index.html` (`#modal-bottom-menu`):**
  - Umstellung auf echtes Dynamic-Theming: `bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200/90 dark:border-white/10 text-slate-900 dark:text-white shadow-2xl`.
  - Icons und Schaltflächen erhalten abgestimmte Hover- und Active-States in Primary-Farbe (`hover:bg-primary/10 dark:hover:bg-primary/20 text-slate-700 dark:text-slate-200`).

---

## 3. Schritt-für-Schritt Umsetzungsreihenfolge
1. **HA-Setup erweitern:** `grid_power_import` und `grid_power_export` in `index.html`, `telemetry.js` und `server.js` einbinden.
2. **Ebene 2 Layout überarbeiten:** Chart als `sticky top-0` mit kompakter Höhe gestalten, Sensor-Button entfernen und Umschalter `Tag | Woche | Monat` einsetzen.
3. **Historie & Zeithorizont implementieren:** Umschaltung zwischen Tag, 7-Tage-Woche und 30-Tage-Monat in `telemetry.js` und `server.js` verankern.
4. **Analyse & Sankey:** Reale Zählerberechnung für Monats-/Jahreswerte verknüpfen und interaktive Pfad-Hervorhebung im Sankey-SVG ergänzen.
5. **Menü stylen:** Dark-Mode- und Design-Tokens im `#modal-bottom-menu` perfektionieren.
6. **Versionierung 9.3:** Synchronisation in `package.json`, `index.html`, `sw.js`, `app.js`, `DEVELOPMENT_GUIDELINES.md`, `content.js` und `CHANGELOG.md`.
7. **Verifikation:** Syntaxprüfung mit `node -c`, Dev-Server-Neustart, `compile_applet` und `lint_applet`.
