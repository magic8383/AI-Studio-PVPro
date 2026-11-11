# Changelog – PV-Auslegungs- & Simulations-App (PV Pro Studio)

Alle relevanten Änderungen, Neuerungen und Korrekturen werden in dieser Datei chronologisch dokumentiert. **Neueste Einträge stehen stets ganz oben.**

---

## [Version 9.9] – 2026-11-11

### 🚀 Home Assistant Langzeit-Statistiken (`recorder/statistics_during_period`), GitHub-Persistenz der Monats-Bilanzen, Vereinigte Single-Source-Sektion 2 (Watt + kWh) & Kompakte Verbraucher-Karten

#### 1. Home Assistant Langzeit-Statistiken via WebSocket (`fetchHaLongTermStatisticsWs` & `syncLongTermStatisticsFromHa`)
* **Lückenlose Monats- & Jahreswerte auch nach Wochen ohne App-Start:**
  - Während die normale Home-Assistant-Historie (`/api/history/period`) standardmäßig nach 10 Tagen bereinigt wird, speichert Home Assistant für alle Sensoren mit `state_class: total_increasing` / `total` unbegrenzt komprimierte Langzeit-Statistiken in der Tabelle `statistics`.
  - `telemetry.js` zapft diese Langzeit-Datenbank nun direkt vom Browser aus per WebSocket (`/api/websocket` -> `recorder/statistics_during_period` mit `period: "month"`) an.
  - **Exakter Monats-Startwert (`monthStartByEntity`):** Selbst wenn die App mitten im Monat nach mehreren Wochen Pause geöffnet wird, rekonstruiert `syncLongTermStatisticsFromHa()` aus `state - change` (bzw. dem Endstand des Vormonats) den exakten Zählerstand vom **1. des Monats um 00:00 Uhr**.
  - **Automatische Jahres-Synchronisation:** Alle vergangenen und laufenden Monate des Jahres (`Januar .. aktueller Monat`) werden automatisch für PV-Erzeugung, Netzeinspeisung, Netzbezug, Batterie-Ladung und Batterie-Entladung in das Monats-Logbuch (`performanceRecordsByProject`) übernommen.

#### 2. GitHub- & Projekt-Persistenz der Monats-Bilanzen (`database.js` & `app.js`)
* **Dauerhafte Sicherung ohne Live-Datenmüll & ohne Token-Leak:**
  - Monats-Ertragsbilanzen (`performanceRecords`) und Zähler-Startwerte (`energyBaselines`) werden beim Speichern eines Systemplans (`submitSaveSystemPlanToServer`), beim JSON-Export (`exportFullConfiguration`) sowie beim Speichern von Monatswerten (`POST /api/performance/records`) automatisch in `CodePersistedPlans` (`database.js`) synchronisiert.
  - Sekündliche Live-Watt-Werte und das persönliche Home-Assistant-Token (`accessToken`) werden niemals in GitHub/Code-Dateien geschrieben.

#### 3. Vereinigte Single Source of Truth in Sektion 2 & Platzsparende Sensor-Zeilen (`index.html` & `telemetry.js`)
* **Zusammenlegung von Sektion 2 (Watt) & Sektion 5 (kWh Total):**
  - Die bisherigen Sektionen 2 und 5 im Home-Assistant-Konfigurator (`#modal-ha-config`) wurden zu einer einzigen Sektion **`2. Haupt-Sensoren · Single Source of Truth (Live-W & kWh-Zähler)`** zusammengelegt. Für jeden Kanal (**PV-Erzeugung**, **Hausverbrauch**, **Stromnetz Bezug/Einspeisung**, **Batteriespeicher**) stehen Live-Leistung (`W`) und Gesamtzähler (`kWh Total`) direkt paarweise zusammen.
* **Kompakte Verbraucher- & String-Karten + Nur-Icon-Auswahlbutton:**
  - Bei den Einzelverbrauchern (`renderHaCustomConsumersEditor`) und PV-Strings (`renderHaCustomStringsEditor`) sitzt das rote Papierkorb-Symbol (`delete`) nun direkt oben rechts neben dem Gerätenamen, wodurch die bisherige leere Fußzeile komplett entfällt.
  - Alle Sensor-Auswahlbuttons verwenden ab sofort ein kompaktes Nur-Icon-Symbol (`w-8 h-8`, `list_alt` ohne „Wählen“-Text), sodass lange Home-Assistant-Entitätsnamen (`sensor.shelly_pm_mini_gen3_...`, `sensor.opendtu_...`) maximale sichtbare Textfeldbreite erhalten.

---

## [Version 9.8] – 2026-11-10

### 🛡️ Dev-Server & Service-Worker Warmup-Härtung (`X-PVPro-Server`), Network-First Strategie & Schutz vor Nginx `warmup.html` Cache-Poisoning

#### 1. Ursache des Warmup-Lockouts behoben (`sw.js` + Nginx `error_page 502 = /warmup.html`)
* **Kein Caching von Nginx-Warmup-Seiten mehr (`isValidCacheableResponse`):**
  - Während eines Container-Kaltstarts liefert der vorgeschaltete Nginx-Proxy `warmup.html` („Starting Server...“) mit dem Statuscode `HTTP 200 OK` aus (`error_page 502 503 504 = /warmup.html;`). Der bisherige Service Worker (`sw.js`) prüfte lediglich auf `status === 200` und speicherte dadurch `warmup.html` im Browser-Cache (`Cache Storage`) unter `/` bzw. `index.html` und den JS-Pfaden ab.
  - Ab Version 9.8 versieht `server.js` jede echte Antwort mit dem Signatur-Header `X-PVPro-Server: 9.8`. `sw.js` akzeptiert für lokale Dateien ausschließlich Antworten mit gültigem `X-PVPro-Server`-Header, ohne `Cache-Control: no-store` und mit passendem `Content-Type` (`javascript` für `.js`, `json` für `.json`).
* **Network-First für App-Shell & Module + Sofortige Cache-Selbstheilung:**
  - Lokale App-Dateien (`index.html`, `app.js`, `telemetry.js`, `wiring.js`, `dossier.js`, `database.js`, `content.js`) werden über `sw.js` ab sofort **Network-First** geladen (mit verifiziertem Offline-Fallback), sodass Reloads niemals in einem veralteten Cache hängen bleiben.
  - Ein Inline-Initialisierungsskript im `<head>` von `index.html` bereinigt beim Laden automatisch ältere Caches (`!== 'pvpro-cache-v9.8'`), setzt eventuelle `warmup_start_time`-Flags in `sessionStorage` zurück und erzwingt via `updateViaCache: 'none'` ein sofortiges Service-Worker-Update.

#### 2. Schutz der Proxy-APIs vor Nginx `proxy_intercept_errors` (`server.js`)
* **Kein Ersetzen von JSON-Diagnosen durch HTML-Fehlerseiten:**
  - Da Nginx in der Cloud-Run-Umgebung mit `proxy_intercept_errors on` alle Upstream-Antworten mit Status `403`, `502`, `503` und `504` durch statische HTML-Seiten (`forbidden.html` / `warmup.html`) ersetzt, geben `/api/ha/test`, `/api/ha/states` und `/api/pvgis/seriescalc` bei Nichterreichbarkeit externer Gegenstellen nun strukturierte JSON-Antworten mit Nginx-sicheren HTTP-Statuscodes (`200` mit `success: false` bzw. `500`) zurück.

---

## [Version 9.7] – 2026-11-10

### ✨ Single Source of Truth Energie-Ledger (Watt + kWh), Monotonie-Garantie (`Jahr ≥ Monat ≥ Heute`), 100 % Full-Width Sankey-Diagramm ohne Scrollen & Batterie-Grafik-Fix

#### 1. Zentrale Single Source of Truth (`getUnifiedEnergyLedger`) & Behebung von `Netzbezug Heute > Monat`
* **Ursache behoben (Home Assistant 10-Tage-Recorder-Purge):**
  - Da die Standard-Datenbank (`recorder`) in Home Assistant Verlaufsdaten älter als 10 Tage löscht, lieferte die bisherige Abfrage für den 1. des Monats (`end_time = Monatsanfang + 24h`) ab dem 11. Tag des Monats ein leeres Array `[]`. Dadurch fiel der Monats-Startzähler auf den aktuellen Zeitpunkt zurück (`Netzbezug Monat = 1,8 kWh`), während der Tages-Startzähler um `00:00` Uhr korrekt vorlag (`Netzbezug Heute = 5,38 kWh`).
* **Selbstheilende Baseline-Klammer (`monthStart ≤ dayStart`) & Monotonie-Garantie (`Gesamtjahr ≥ Monat ≥ Heute`):**
  - `syncEnergyCounterBaselinesFromHaHistory()` fragt den Monatsverlauf nun ohne künstliches 24h-Abbruchfenster ab, findet den ältesten verfügbaren Zählerstand im laufenden Monat und erzwingt über `healMonthBaselinesAgainstDayBaselines()` sowie `upperBoundMap` in `resolveEnergyCounterDelta()`, dass der Monats-Startzähler niemals höher als der Tages-Startzähler um 00:00 Uhr sein kann.
* **Kombination aus Live-Watt-Sensoren & kWh-Gesamtzählern für alle 6 Kanäle:**
  - `getUnifiedEnergyLedger(baseline)` vereint die konfigurierten `kWh`-Zählerstände und die Trapez-Integration der Live-`Watt`-Sensoren (`getDayIntegratedKwh()` / `getMonthIntegratedKwh()`) für **PV-Erzeugung**, **Hausverbrauch**, **Netzbezug**, **Netzeinspeisung**, **Batterie-Ladung** und **Batterie-Entladung**.
  - Dadurch verschwindet die Batterie-Entladung (`BYD HVS+`) in der Monats- und Jahresansicht nicht mehr auf `0,0 kWh`, und ein Wechsel des Diagramm-Zeitraums (`Tag` / `Woche` / `Monat`) überschreibt niemals mehr die Tageswerte (`Heute`).
* **Erweiterte Sensor-Einstellungen (`#modal-ha-config`):**
  - Sektion 5 zeigt ab sofort eine Live-Statusmatrix (`#haUnifiedSensorMatrixContainer`) aller 6 Kanäle (inkl. `Heute`- und `Monat`-kWh) sowie ein zusätzliches Feld für `Hausverbrauch Gesamt (kWh Total, optional)`.

#### 2. Komplettes Redesign des Sankey-Energieflussdiagramms & Grafikfehler-Behebungen
* **100 % Bildschirmbreite ohne horizontales Scrollen (`viewBox="0 0 540 314"`):**
  - Das bisherige `min-w-[600px]` und `overflow-x-auto` im Sankey-Container, durch das auf dem Smartphone die rechte Hälfte (`Hausverbrauch` und `Netzeinspeisung`) abgeschnitten war, wurde entfernt. Alle 3 Spalten (Quellen links, Direkt/Speicher mittig, Hausverbrauch/Einspeisung rechts) passen nun vollständig auf die Smartphone-Bildschirmbreite.
* **Behebung des Batterie-Grafikfehlers (`...TTERY_ANDROID`):**
  - Der fehlerhafte Material-Symbols-Iconname `battery_android` (der in der Detailkarte als riesiger überlappender Text `...TTERY_` plus Android-Roboter-Symbol gerendert wurde) wurde durch das valide Icon `battery_charging_full` mit sauberem `overflow-hidden` ersetzt.
* **Keine überlappenden Beschriftungen mehr & sauberes 2×2 / 4-Spalten-Raster:**
  - Der Einspeisepfad (`pv_exp`) und sein Info-Badge verlaufen nun kreuzungsfrei unterhalb der Batterie-Kachel (`y = 286`), statt mitten im Text von `BYD HVS+` zu liegen.
  - Die 4 KPI-Karten unter dem Sankey (`Zeitraum`, `Autarkiequote`, `Eigenverbrauch`, `Selbst gedeckt`) nutzen nun `grid-cols-2 sm:grid-cols-4` statt `grid-cols-3`, und der Roh-LaTeX-String `($\Delta$kWh)` wurde in `(ΔkWh)` korrigiert.

---

## [Version 9.6] – 2026-11-10

### ✨ In-Place Full-Bleed Diagramm-Vergrößerung ohne seitliche Achsenskalen (+20 % Platz), Verdeckungsfreie Fadenkreuz-Anzeige, Light/Dark-Mode-Konsistenz & Sofort-Umschalter für Tag/Woche/Monat

#### 1. In-Place Full-Bleed Vergrößerung bis zum Bildschirmrand ohne linke/rechte Achsenskala
* **Tap auf das Diagramm vergrößert direkt an Ort und Stelle (`toggleIntradayInlineExpand`):**
  - Ein Antippen/Anklicken der Diagrammfläche (oder des neuen Buttons **„Randlos“** in der Kopfleiste) öffnet nicht mehr das Hochkant-Fullscreen-Popup, sondern dehnt den Diagrammkasten **in-place bis ganz an den linken und rechten Bildschirmrand (`-mx-3 sm:-mx-5`)** aus und erhöht die Diagrammhöhe (`h-60 sm:h-80 md:h-96`).
  - Gleichzeitig werden die **linke (`W`) und rechte (`%`) Y-Achsen-Skala komplett ausgeblendet** (`yPower.display = false`, `ySoc.display = false`). Dadurch gewinnt die Verlaufskurve sofort über **20 % mehr nutzbare Breite**.
  - Der gewählte Vergrößerungsmodus bleibt auch beim Wechsel zwischen `Tag`, `Woche` und `Monat` sowie bei Live-Aktualisierungen stabil erhalten (`pvpro_intraday_expanded`).
  - Das separate Vollbild-/90°-Querformat-Overlay bleibt gezielt über die oberen Buttons **`Vollbild`** und **`90°`** erreichbar.

#### 2. Kein verdeckendes Tooltip-Popup mehr – Präzise Fadenkreuz-Linie + Kopfleisten-Readout
* **Deaktivierung des schwebenden Chart.js-Popups (`tooltip.enabled = false`):**
  - Das große dunkle Popup-Rechteck, das beim Berühren der Grafik die Kurven verdeckte, wurde vollständig abgeschaltet.
* **Custom Crosshair-Plugin (`intradayCrosshairPlugin`):**
  - Beim Berühren oder Ziehen mit dem Finger/Mauszeiger zeichnet das Diagramm eine feine vertikale Fadenkreuz-Linie samt Punkt-Markierungen auf den aktiven Kurven, während Uhrzeit/Datum und alle exakten Messwerte unverdeckt in der Leiste direkt über dem Diagramm (`#dash_curve_hover_readout`) stehen.

#### 3. Durchgängige Light- & Dark-Mode-Treue (auch in der Vergrößerung & im Vollbild)
* **Beseitigung des erzwungenen Dark-Modes im Vollbild (`#modal-intraday-fullscreen`):**
  - Das Vollbild-Overlay und die Kurven-Chips besaßen zuvor hartcodierte dunkle Hintergrundklassen (`bg-slate-950/95`, `bg-[#0b151a]/90`, `text-white`). Sie folgen nun wie die In-Place-Vergrößerung strikt dem aktiven Light- oder Dark-Mode der App.

#### 4. Verzögerungsfreier Tag / Woche / Monat-Umschalter (`intradayHistoryCache` & Preloading)
* **Sofortiges Button-Feedback (0 ms) & In-Memory-Cache:**
  - `setIntradayTimeframe()` schaltet den aktiven Button (`Tag` / `Woche` / `Monat`) sofort beim Antippen um.
  - Einmal geladene Zeiträume werden im Arbeitsspeicher (`intradayHistoryCache`) gehalten und bei erneutem Wechsel in **< 10 ms** sofort dargestellt (Stale-While-Revalidate mit `AbortController` für laufende Abfragen).
  - Nach dem ersten Laden der Tageskurve werden `Woche` und `Monat` automatisch im Hintergrund vorgeladen (`prewarmOtherTimeframesInBackground()`).

---

## [Version 9.5] – 2026-11-10

### ✨ Monatliche Ertrags-Zusammenfassung auf der Analyse-Hauptseite mit automatischem PVGIS-Soll-Ist-Abgleich, taggenauem Pro-Rata-Soll & prozentualer Abweichungsanzeige

#### 1. Neue Übersichtskarte „Monatliche Ertragsleistung“ direkt auf der Analyse-Hauptseite (`#analyse-hub-view`)
* **Fokus-Banner für den aktuellen / zuletzt aktiven Monat (`#monthlyYieldCurrentFocusBanner`):**
  - Zeigt auf einen Blick den **Ist-Ertrag (`kWh`)**, das **taggenaue anteilige PVGIS-Soll bis heute (`Pro-Rata kWh`)**, das **volle PVGIS-Monats-Gesamtsoll (`kWh`)** sowie die **prozentuale Abweichung (`+X,X %` / `-X,X %`)** und die absolute Differenz in `kWh`.
  - Ein kombinierter Fortschrittsbalken stellt den bisherigen Monatsertrag im Verhältnis zum Gesamtmonat dar und markiert mit einer vertikalen Soll-Marke exakt den heutigen Kalendertag (`▲ Heute Soll: X,X kWh`), sodass sofort erkennbar ist, ob die Anlage dem Zeitplan voraus ist oder zurückliegt.
* **Kompakte Monats-Vergleichsliste mit Filter-Umschalter (`#monthlyYieldSummaryList`):**
  - Über den Umschalter **„Aktuell & Erfasst“** vs. **„Alle 12 Monate“** lassen sich entweder kompakt die bisherigen Monate inkl. laufendem Monat oder alle 12 Kalendermonate des Jahres einblenden.
  - Jede Monatskachel zeigt die Datenquelle (`Live HA` bei automatischer Zähler-Differenz bzw. `Logbuch` bei manuellem Eintrag), einen semantisch eingefärbten Fortschrittsbalken, `Ist / Soll kWh` sowie die prozentuale (`+/- %`) und absolute (`+/- kWh`) Abweichung.

#### 2. Taggenaue Pro-Rata-Soll-Berechnung im laufenden Monat (Single Source of Truth)
* **Unverzerrter Soll-Ist-Abgleich mitten im Monat (`computeAggregatedPerformanceMetrics`):**
  - Für den aktuell laufenden Kalendermonat wird das PVGIS-Monatssoll anteilig auf den heutigen Kalendertag umgerechnet ($\text{Soll}_{\text{Pro-Rata}} = \text{Soll}_{\text{Monat}} \times \frac{\text{Tag}}{\text{Tage im Monat}}$).
  - Sowohl die prozentuale Monats-Abweichung (`deviationPct`) als auch der kumulierte Jahres-Erfüllungsgrad (`overallPerfIndexPct` in den oberen Jahres-KPIs) nutzen für den laufenden Monat dieses taggenaue Pro-Rata-Soll, damit ein noch nicht abgeschlossener Monat den Erfüllungsgrad nicht künstlich nach unten zieht.
  - Auch die 12 Monatskarten in der Detailansicht (`renderSollIstPanel`) zeigen nun einheitlich die prozentuale Abweichung (`+/- %`), das Pro-Rata-Soll für den laufenden Monat und die Datenquelle (`Live HA` / `Logbuch`).

---

## [Version 9.4] – 2026-11-10

### ✨ Umfassendes Code-Audit, Zentrale Single Source of Truth (`APP_VERSION` & System-Baseline), Bereinigung aller Demo-Altlasten, Zeitraum-Konsistenz & 1:1 Client/Server-Parität

#### 1. Zentrale Single Source of Truth (`APP_VERSION` & `getSystemHardwareAndConsSummary`)
* **Zentrale Versionskonstante (`APP_VERSION = '9.4'`):**
  - Beseitigung aller verstreuten und veralteten Versionsstrings in Projekt-Initialisierungen (`version: "7.9.0"` in `app.js`), JSON-Exporten, Server-User-Agents (`PV-Planung-Pro/8.3` in `server.js`) sowie in den Fußzeilen des VDE-Dossiers (`PV Pro Studio v8.1` und `v7.0.0` in `dossier.js`).
  - Alle Module referenzieren ab sofort zentral `APP_VERSION`.
* **Gemeinsame System-Baseline-Engine (`getSystemHardwareAndConsSummary` in `app.js`):**
  - Bündelt die Berechnung von Gesamtleistung (`totalKwp`), Modul- und String-Anzahl, Batteriespeicher-Kapazität, maximaler Lade-/Entladeleistung, Batterienamen, geplantem Jahresverbrauch (inkl. EV & Wärmepumpe) und Finanzparametern an einer einzigen zentralen Stelle.
  - Sowohl `calculateProjectSummary` in `app.js` als auch `getPlannedSystemBaseline` in `telemetry.js` greifen auf diese gemeinsame Funktion zu – keine redundanten Schleifen oder abweichenden Fallbacks mehr.

#### 2. Vollständige Bereinigung alter Demo-Generatoren, Fake-Startwerte & toter Code-Pfade
* **Entfernung künstlicher Demo-Generatoren & Fake-Zahlen:**
  - Die historischen Sinus-Simulationsfunktionen (`computeDemoLiveTelemetry`, `buildDemoIntradaySeries`, `demoSimHour`, `onDemoHourSliderChange`) wurden vollständig entfernt und durch saubere Null-Initialisierer (`resetToZeroLiveTelemetry`, `resetToEmptyIntradaySeries`) ersetzt.
  - Alle hartcodierten Fake-Startwerte (`682 W`, `2100 W`, `8,4 %`, `1.325 kWh`, `1,33 kWh`) in `telemetry.js` und in den HTML-Statuskacheln (`index.html`) wurden auf ehrliche `0 W` / `0,00 kWh` bereinigt.
  - Auch die automatische Erzeugung künstlicher 10-Monats-Beispieldaten (`createSampleActualMonths` beim Jahreswechsel) ist abgeschaltet; das Monats-Logbuch startet immer sauber (`createEmptyYearMonths`) und übernimmt reale Home-Assistant-Zählerstände.
* **Entfernung ungenutzter Altlasten (Dead Code Elimination):**
  - Entfernt: `toggleHeaderSubmenu` und `closeHeaderSubmenu` in `app.js` (ersetzt durch `#m3MoreSheet`).
  - Entfernt: veraltete String-Tabellen-Helfer `addHaCustomStringRow` und `addHaCustomConsumerRow` in `telemetry.js` (ersetzt durch den modernen kachel- und picker-basierten Editor).
  - Entfernt: ungenutzte Legacy-Arrays `stringEntities` und `inverterEntities` in `telemetry.js` und `server.js`.
  - Korrigiert: `escapeHtml(str)` in `dossier.js` prüft nun explizit auf `str === null || str === undefined`, sodass der numerische Wert `0` nicht mehr verschluckt wird.

#### 3. Zeitraum-Konsistenz (`Tag` / `Woche` / `Monat`) in Diagramm & Messkanal-Kacheln
* **Keine Überschreibung der Unterüberschrift bei Zeitwechsel:**
  - `renderIntradayCurveSection` überschreibt `#dash_curve_timerange` nicht mehr bei jedem 10-Sekunden-Intervall mit `"00:00 Uhr bis jetzt"`, sondern erhält die zum gewählten Zeitraum (`Tag`, `Woche (7 Tage)`, `Monat (30 Tage)`) passende Unterüberschrift.
* **Zeitraum-abhängige Kachel-Summen & Einheiten:**
  - Die Messkanal-Kacheln unter dem Sticky-Diagramm zeigen in Zeile 1 (`subLine1`) nun passend zum gewählten Zeitraum die integrierte Energiemenge der gesamten Kurve mit dem korrekten Suffix (`kWh · heute`, `kWh · 7 Tage` bzw. `kWh · 30 Tage`).
* **Präzise Hover-/Touch-Zeitanzeige für Woche & Monat:**
  - Beim Darüberfahren über das 7-Tage- oder 30-Tage-Diagramm zeigt die Statusleiste neben der Uhrzeit auch das zugehörige Datum (`TT.MM. HH:MM Uhr`) an.

#### 4. 1:1-Parität zwischen `telemetry.js` (Browser-First) und `server.js` (Backend-Fallback)
* **Deduplizierung & Tippfehler-Bereinigung in `server.js`:**
  - Die doppelt vorhandene Funktion `loadHaConfig()` in `server.js` wurde zu einer einzigen sauberen Implementierung mit `createDefaultHaConfig()` konsolidiert und der Tippfehler `sensor.gridExport_monthly` -> `sensor.grid_export_monthly` behoben.
* **Identische Priorisierung getrennter Netz-Leistungssensoren:**
  - `/api/ha/states` in `server.js` priorisiert nun exakt wie `telemetry.js` die getrennten Watt-Sensoren (`gridImportPower` & `gridExportPower`) vor dem kombinierten Fallback (`gridPower`).
* **Einzelverbraucher & Spitzenwerte in `/api/ha/history`:**
  - Der Server-History-Endpunkt berücksichtigt nun ebenfalls alle konfigurierten `customConsumers` (`consumer_<id>`) und liefert `peakValues` je Kanal zurück.

---

## [Version 9.3] – 2026-11-10

### ✨ Getrennte Netzbezugs- & Einspeisungs-Leistungssensoren (W), Sticky Kompakt-Diagramm mit Scroll-Kacheln, Zeitauswahl Tag/Woche/Monat, automatische Ist-Ertrags-Berechnung aus Live-Zählern & Interaktiver Sankey-Detail-Inspektor

#### 1. Getrennte Netzbezugs- und Netzeinspeisungs-Leistungssensoren in Watt (Sektion 2 & Server)
* **Zwei separate Leistungsfelder in Home Assistant Setup Sektion 2 (`#ha_ent_grid_imp_power` & `#ha_ent_grid_exp_power`):**
  - Statt nur eines einzelnen kombinierten Felds stehen nun zwei dedizierte Eingabefelder mit Komfort-Sensor-Picker zur Verfügung:
    - **Netzbezug · Leistung (W / kW):** z. B. `sensor.keller_solarnet_leistung_netzbezug`
    - **Netzeinspeisung · Leistung (W / kW):** z. B. `sensor.keller_solarnet_leistung_netzeinspeisung`
  - Dies eliminiert Vorzeichen-Konflikte (wie bei Fronius Modbus üblich, wo beide Werte als positive Watt-Zahlen gemeldet werden). Die Berechnungs-Engine bildet automatisch `gridPower = import - export` und führt beide Kanäle auch in der Historie und im Sankey-Diagramm getrennt.
  - Das bisherige kombinierte Feld `Netzbezug / Einspeisung (kombiniert +/-)` bleibt als aufklappbare Fallback-Option für Smart-Meter mit vorzeichenbehaftetem Gesamtwert erhalten.

#### 2. Oben fixiertes Diagramm (Sticky Top) mit durchscrollbarem Kachel-Raster auf Ebene 2
* **Kompakte Sticky-Kopfkarte (`#live-detail-intraday`):**
  - Der Diagramm-Container ist als `sticky top-0 z-30` mit leicht transparentem Glas-Hintergrund und Randbegrenzung ausgeführt.
  - Die Höhe auf Smartphones wurde auf `h-44 sm:h-64 md:h-72` optimiert, sodass darunter auf jedem Smartphone-Display mindestens 2 vollständige Reihen der Messkanal-Kacheln sichtbar bleiben.
  - Beim Scrollen durch die Kacheln bleibt die Verlaufskurve oben stets im Blick. Ein Tap auf eine Kachel blendet die jeweilige Kurve sofort im fixierten Diagramm ein/aus, ohne dass die Seite nach oben gescrollt werden muss.

#### 3. Zeitauswahl direkt über dem Diagramm & Entfernung des Einstellungsbuttons
* **Segmentierte Zeitauswahl-Pills (`#btn-timerange-day`, `#btn-timerange-week`, `#btn-timerange-month`):**
  - Direkt über dem fixierten Diagramm befindet sich eine intuitive Zeitauswahl:
    - **Tag:** Heute ab 00:00 Uhr in 5-Minuten-Auflösung
    - **Woche:** Letzte 7 Tage in 1-Stunden-Schritten
    - **Monat:** Letzte 30 Tage in 3-Stunden-Schritten
  - Das Backend (`/api/ha/history`) und der Browser-First History-Client unterstützen den `range`-Parameter nahtlos für alle Systemkanäle, PV-Strings und Einzelverbraucher.
* **Entfernung des gefährlichen Zahnrad-/Einstellungs-Buttons:**
  - Der irreführende Button, der direkt in die Sensorkonfiguration führte, wurde am Diagramm entfernt, um versehentliche Fehlkonfigurationen im laufenden Betrieb zu verhindern.

#### 4. Bereinigung der Ist-Ertrags-Berechnung & automatische Übernahme aus Live-HA-Zählern
* **Beseitigung der künstlichen Dummy-Monate:**
  - `ensureProjectYearInitialized` erzeugt keine zufälligen 10-Monats-Musterdaten (`isSampleSeed`) mehr, sobald Home Assistant eingerichtet ist. Vorhandene Dummy-Monate werden automatisch bereinigt.
* **Automatische Ist-Ertrags-Übernahme für den laufenden Monat:**
  - `computeAggregatedPerformanceMetrics` übernimmt für den aktuellen Kalendermonat automatisch die echten Zählerwerte (`pvEnergyMonthKwh`, `gridExportMonthKwh`, `gridImportMonthKwh`, Speicher) aus Home Assistant, falls noch kein manueller Eintrag im Logbuch existiert.
  - Im Monats-Logbuch wird dieser Monat klar mit dem Badge **`Live HA`** gekennzeichnet. Die KPI-Karten zeigen den exakten realen Ertrag und die Soll-Erfüllung.

#### 5. Interaktives Sankey-Diagramm mit Detail-Inspektor & Klick-Hervorhebung
* **Klickbare Energie-Pfade und Knoten (`selectSankeyFlow(flowId)`):**
  - Jeder Fluss (PV-Direkt, Akku-Ladung, Akku-Entladung, Netzeinspeisung, Netzbezug) und jeder Knoten (PV-Generator, Haus, Speicher, Netz) kann angetippt werden.
  - Ausgewählte Flüsse werden hervorgehoben und erhalten einen leuchtenden Glow-Effekt, während nicht beteiligte Flüsse dezent abgedunkelt werden.
* **Detail-Auswertungskarte unter dem Sankey-Diagramm:**
  - Zeigt bei Klick die exakte kWh-Menge, den prozentualen Anteil an Erzeugung/Verbrauch und den finanziellen Nutzen (z. B. eingesparter Netzstrom zum konfigurierten Strompreis oder EEG-Einspeisevergütung) sowie einen Button zum Zurücksetzen aller Flüsse.

#### 6. Material Design 3 Dark-Mode-Harmonisierung des Hauptmenüs
* **Theme-treues M3 More Sheet (`#m3MoreSheet`):**
  - Entfernung von statisch weißen Texten und dunkelgrünen Containern. Das Menü passt sich nun im Light Mode (strahlendes Weiß, zarte Slate-Rahmen) und Dark Mode (Deep Dark Slate `#0c1820`, Teal-Akzente) nahtlos an die gewählte Systemeinstellung an.

---

## [Version 9.2] – 2026-11-10

### ✨ Multi-Wechselrichter PV-Erzeugung (`+ Wechselrichter-Zähler` & String-Summierung) & Neues Liquid-Glass Türkis/Smaragd App-Icon

#### 1. Multi-Wechselrichter PV-Erzeugung (`kWh` mit `+` Button & automatischer String-Summierung)
* **Mehrere Wechselrichter-Zähler per `+ Wechselrichter-Zähler` (`#haCountersSectionBox` / `telemetry.js`):**
  - Für Anlagen mit zwei oder mehr Wechselrichtern (z. B. Fronius + Hoymiles) bietet Sektion 5 (*Gesamt-Energiezähler*) nun direkte Felder für **Wechselrichter 1** und **Wechselrichter 2** sowie den Button **`+ Wechselrichter-Zähler`** (`addHaPvEnergyExtra()`), über den beliebig viele weitere Wechselrichter-Energiezähler (`pvEnergyExtraEntities[]`) mit eigenem **`Wählen`**-Sensor-Picker hinzugefügt werden können.
  - Jeder eingetragene Wechselrichter-Zähler erhält in `syncEnergyCounterBaselinesFromHaHistory` seine eigene `00:00`-Uhr- und Monatsstart-Baseline (inkl. individueller Einheiten-Skalierung `Wh` / `kWh` / `MWh` und `total_increasing`-Erkennung). Die daraus berechneten Tages- und Monats-Differenzen ($\Delta\text{kWh}$) werden automatisch zur gesamten PV-Erzeugung addiert.
* **Automatische Summierung aus den PV-Strings (`W` & `kWh`):**
  - Bleibt das Feld `PV gesamt · DC (Aktuell)` leer, summiert die App sowohl die Live-Leistung (`W`) als auch die 24h-Kurve (`series.pv_total`) automatisch aus allen konfigurierten PV-Strings.
  - Werden die `kWh`-Zähler direkt bei den PV-Strings (Sektion 3) eingetragen und in Sektion 5 leer gelassen, bildet die App automatisch die Summe der Tages- und Monats-kWh aller Strings.

#### 2. Neues modernes App-Icon im Stil „Liquid-Glass Türkis/Smaragd“
* **Neues Vektor- & PWA-Icon-Set (`icon.svg`, `icon-512.png`, `icon-192.png`, `apple-touch-icon.png`, `favicon-32.png`):**
  - Komplett neu gestaltetes App-Icon passend zum Liquid-Glass-Design: Tiefes Smaragd-/Türkis-Glas-Squircle mit glänzendem Lichtkanten-Reflex, perspektivischem 3×3-Solar-Panel, leuchtender Tagesverlauf-Energiewelle und markantem Energie-Blitz im Zentrum.
  - Direkt eingebunden im App-Header neben dem Versions-Badge **`Pro 9.2`** sowie mit Cache-Buster `?v=9.2` für Android- und iOS-Homescreens.

---

## [Version 9.1] – 2026-11-10

### ✨ Zweizeilige Wert-zuerst-Kacheln ohne abgeschnittene Zahlen, 2 Batterie-Leistungssensoren (Laden/Entladen), Kurze 1-Wort-Überschriften & Stabile Tages-kWh ohne Rücksprung auf Total

#### 1. Wert-zuerst & Zweizeiler-Layout auf allen Status- und Kurven-Kacheln (Kein Abschneiden des zweiten Werts)
* **2×2 Live-Dashboard-Kacheln (`#live-hub-view` / `renderLiveCockpitUI`):**
  - Die Sekundärzeile unter dem Haupt-Watt-/SoC-Wert ist nun **zweizeilig** aufgebaut, wobei der **Zahlenwert immer an erster Stelle** steht:
    - **PV gesamt:** Zeile 1 `0,80 kWh · Heute` | Zeile 2 `Erzeugung · 2 Strings aktiv`
    - **Hauslast:** Zeile 1 `4,25 kWh · Heute` | Zeile 2 `Grund- & Direktlast`
    - **BYD HVS+:** Zeile 1 `Laden · 1.240 W` / `Entladen · 420 W` / `Standby · 0 W` | Zeile 2 `↑ 3,4 kWh · ↓ 2,1 kWh`
    - **Stromnetz:** Zeile 1 `7 W Bezug` / `450 W Einspeisung` | Zeile 2 `↓ 3,56 kWh · ↑ 1,20 kWh`
  - Zusätzlich wurde das `home_bolt`-Icon auf der Hauslast-Kachel durch das universelle `home`-Symbol ersetzt, damit die Schriftart auf Smartphones niemals zwei getrennte Icons (`home` + `_` + `bolt`) rendert und den Titel verdrängt.
* **Messkanal-Kacheln unter dem Tagesdiagramm (`#dash_curve_tiles_grid` / `renderIntradayCurveSection`):**
  - Auch auf Ebene 2 zeigen alle Kacheln unter dem Hauptwert ein zweizeiliges Wert-zuerst-Layout: Zeile 1 prominent `15,32 kWh · Heute` (bzw. `↑ 3,4 · ↓ 2,1 kWh` bei Batterie), Zeile 2 `Max 231 W` (bzw. `Min 10 % · Max 88 %` beim SoC).

#### 2. Zwei separate Batterie-Sensoren für Ladeleistung & Entladeleistung
* **Getrennte Entitätsfelder im Home-Assistant-Setup (`#modal-ha-config`):**
  - Neben dem optionalen Kombi-Sensor gibt es nun zwei dedizierte Felder mit **`Wählen`**-Sensor-Picker:
    - **`Batterie · Ladeleistung (W / kW)`** (`ha_ent_bat_chg_power` / `entities.batteryChargePower`)
    - **`Batterie · Entladeleistung (W / kW)`** (`ha_ent_bat_dis_power` / `entities.batteryDischargePower`)
* **Automatische Netto-Berechnung & 24h-Kurven-Integration (`telemetry.js` & `server.js`):**
  - Aus beiden Sensoren wird sowohl im Live-Dashboard als auch im 24h-Tagesverlauf die vorzeichenrichtige Batterieleistung (`+Laden` / `-Entladen`) sowie die integrierte Tages-Lade- und Entlade-Energie (`↑ kWh` / `↓ kWh`) berechnet.

#### 3. Kurze, einzeilige 1-Wort-Überschriften auf Smartphones
* **Kompakte Header- & Hub-Titel (`index.html` & `app.js`):**
  - Alle Bereichs- und Kartenüberschriften wurden auf prägnante **1-Wort-Titel** mit `whitespace-nowrap` gekürzt, damit sie auf keinem Smartphone-Display mehr zweizeilig umbrechen:
    - Top-Header (`#headerViewTitle`): **`Live`**, **`Analyse`**, **`Planung`**, **`Tagesverlauf`**, **`Soll-Ist`**, **`Effizienz`**, **`Amortisation`**, **`Logbuch`** sowie **`1/6 · Hardware`** bis **`6/6 · Ergebnis`**.
    - Hub-Karten: **`Performance`** (statt *Performance & Analyse*), **`Energiefluss`** (statt *Energiefluss · Sankey*) und **`Planung`** (statt *PV-Planung · 6-Schritte-Assistent*).

#### 4. Stabile Tages-Erzeugung (`Heute kWh`) ohne Rücksprung auf `Total`
* **Einheiten-sichere 00:00-Uhr-Baseline & Sonnenaufgangs-Erkennung (`syncEnergyCounterBaselinesFromHaHistory` / `resolveEnergyCounterDelta`):**
  - Behebung der Ursache, durch die `total_increasing`-Gesamtzähler nach dem History-Sync oder bei einem Sensor in `Wh` auf den `Total`-Zählerstand zurücksprangen:
    1. Vor der Auswertung von `/api/history/period` (welches bei `no_attributes` keine Einheiten liefert) wird die exakte Einheit (`Wh`, `kWh`, `MWh`) und `state_class` jedes Zählers aus der Live-`statesMap` (`/api/states`) bestimmt.
    2. Die History-Abfrage sucht ab `00:00` Uhr den **ersten gültigen numerischen Messwert des Tages** – auch dann, wenn ein Wechselrichter nachts im Standby (`unavailable`) war und erst bei Sonnenaufgang den ersten Zählerstand meldet.
    3. Ein automatisches Schema-Upgrade (`schemaVersion: '9.1'`) bereinigt alte, unskalierte Baselines im Browser-Speicher.
    4. Solange für einen kumulativen Gesamtzähler noch keine gültige 00:00-Baseline vorliegt oder eine Differenz unplausibel groß ist (`> 250 kWh/Tag`), gibt `resolveEnergyCounterDelta` niemals den `Total`-Wert zurück, sondern fällt sauber auf die **Trapez-Integration der heutigen Watt-Kurve** (`intradaySeriesState.integratedKwh`) zurück.

---

## [Version 9.0] – 2026-11-10

### ✨ Theme-gerechte Kurven-Kacheln, Flackerfreie Charts, Top-5 Verbraucher, Smartphone Zurück-Wischen, Token-freier GitHub-Sync, Persistenter PVGIS-Cache & 6-Schritte-Planungsassistent mit Morphing-Pill

#### 1. Theme-gerechte Messkanal-Kacheln (Light/Dark Mode) & Flackerfreie Echtzeit-Diagramme
* **Korrekte Hell-/Dunkel-Oberflächen unter dem Tagesdiagramm (`renderIntradayCurveSection`):**
  - Behebung des Fehlers, bei dem die 3-Spalten-Messkanalkacheln unter dem Tagesdiagramm im Light-Mode einen fest codierten dunklen Hintergrund (`rgba(13, 24, 30, 0.95)`) hatten und inaktive Kacheln kaum lesbar waren.
  - **Light-Mode:** Helle, kristallklare Liquid-Glass-Kacheln (`rgba(255, 255, 255, 0.96)`) mit sanftem Farbschimmer der jeweiligen Kurvenfarbe und tiefdunkler Typografie (`#0f172a`).
  - **Dark-Mode:** Edles dunkles Slate-Glas mit farbigem Akzent-Rand; abgewählte Kacheln bleiben mit `opacity: 0.74` klar ablesbar.
* **Kein Diagramm-Flackern mehr bei Live-Aktualisierungen (`renderIntradayCanvasInstance`):**
  - Das Tagesverlauf-Diagramm und die Vollbild-Ansicht zerstören die Chart.js-Instanz bei 10-Sekunden-Polls oder beim Umschalten einzelner Kurven nicht mehr (`destroy()`), sondern mutieren `labels` und `datasets` direkt in-place via `chart.update('none')` (`animation: false`). Dadurch bleibt das Diagramm vollkommen ruhig und flackerfrei.

#### 2. Top-5 Aktive Verbraucher mit Aufklapp-Funktion & Smartphone Zurück-Wischen (History API)
* **Top 5 Verbraucher auf dem Start-Dashboard (`renderLiveCockpitUI`):**
  - Die Liste „Aktive Verbraucher“ sortiert alle konfigurierten Einzelverbraucher absteigend nach ihrer aktuellen Live-Leistung (`W`) und zeigt standardmäßig maximal die **Top 5** an.
  - Sind mehr als 5 Verbraucher vorhanden, blendet ein kompakter Button **„Alle X Verbraucher anzeigen“ / „Auf Top 5 reduzieren“** die übrigen Zeilen bei Bedarf auf oder zu.
* **Smartphone Zurück-Wischen von Ebene 2 auf Ebene 1 (`pushAppNavHistoryState` / `popstate`):**
  - Jeder Wechsel auf Ebene 2 (Tagesverlauf-Chart, Analyse-Unterseiten, Planungs-Schritte) sowie das Öffnen des Vollbild-Diagramms legt einen Browser-History-Zustand an (`history.pushState`).
  - Eine **Zurück-Wischgeste** am Smartphone (Android / iOS) bringt den Nutzer zuverlässig zurück auf **Ebene 1** (bzw. schließt zuerst das Vollbild-Chart), statt die Web-App zu verlassen.

#### 3. Zentrales, Token-freies Speichern über GitHub / Server & Dauerhafter PVGIS-Cache
* **100 % sichere Geräte-Synchronisation ohne Token-Übertragung (`haConfigSanitized`):**
  - Beim zentralen Speichern einer Planung werden neben allen Strings, Modulen, Wechselrichtern, Speichern und Kosten auch **sämtliche Home-Assistant-Einstellungen und Sensor-Entitäten** (`baseUrl`, System-Sensoren, `kWh Total`-Zähler, PV-Strings und Einzelverbraucher) mitgespeichert – **der persönliche Long-Lived Access Token (`accessToken: ""`) wird jedoch vor dem Speichern und Exportieren strikt entfernt**.
  - Auf dem Server wird die Planung synchron in `data/system_plans.json` sowie in `CodePersistedPlans` (`database.js`) abgelegt; zusätzlich liest die App im Browser direkt `./data/system_plans.json` aus, sodass auf **GitHub Pages** gespeicherte Projekte von jedem Zweitgerät sofort geladen werden können.
  - Lädt ein anderes Gerät die Planung, sind alle Sensoren sofort fertig eingerichtet; ein dezentes Hinweis-Banner (`#liveMissingTokenBanner`) lädt dazu ein, lokal den eigenen Long-Lived Token einzutragen, woraufhin sofort alle Live-Daten fließen.
* **Dauerhafter PVGIS-Cache & CORS-freier Open-Meteo Fallback (`calculateYieldAPI`):**
  - Einmal abgerufene 8.760h Strahlungs- und Ertragsdaten werden pro Modulfeld dauerhaft im Browser (`pvpro_pvgis_field_cache_v1`) sowie im Projekt (`cachedSimulation`) gespeichert und beim Start sofort wiederhergestellt. Zusätzlich steht für statische GitHub-Pages-Umgebungen ein direkter, CORS-freier **Open-Meteo ERA5 Solar-Strahlungs-Fallback (GTI)** bereit.

#### 4. Geführter 6-Schritte-Planungsassistent mit animierter Bottom-Pill-Navigation & 4-Punkte-Menü
* **Logischer 6-Schritte-Workflow mit Klick-Steuerung von Anfang bis Ende:**
  1. **Standort & Hardware-Pool** (GPS-Standortsuche + Wechselrichter, Module & Speicher an einem Ort)
  2. **Dach-Strings & MPPT** (Strings, Neigung, Azimut & Verschattung)
  3. **DC-Verkabelung & VDE 0100-712** (Teilfelder, Leap-Frog & Kabelverluste)
  4. **Verbrauch, Wärmepumpe & E-Auto** (Haushaltslast & Smart-Charging)
  5. **Investition, Stromtarif & EEG** (Angebotskosten & Tarife gebündelt auf einer Seite)
  6. **8.760h Prognose, Rendite & VDE-Dossier** (Ertrags-Dashboard, Monats-/Tagescharts & PDF-Dossier gebündelt)
* **Animierte untere Navigations-Pill (`#floatingBottomNav.wizard-nav-active`):**
  - Sobald man in den Planungsassistenten (Ebene 2) einsteigt, rücken die 4 Haupt-Icons (`Live`, `Analyse`, `Planung`, `Menü`) in der Mitte sanft zusammen und links sowie rechts fahren animiert die äußeren Steuer-Buttons **„← Zurück“** und **„Weiter → (Schritt X/6)“** aus.
* **Entschlacktes 4-Punkte-Menü & konsistentes Liquid-Glass-Design:**
  - Das untere Menü (`#m3MoreSheet`) ist auf 4 zentrale Punkte fokussiert: **1. Design & Darstellung**, **2. Home Assistant & Sensoren**, **3. Projekte & GitHub-Sync**, **4. VDE-Dossier & Handbuch**. Alle älteren Planungs-Karten nutzen nun durchgängig das neue Liquid-Glass-Design in Light- und Dark-Mode.

---

## [Version 8.9] – 2026-11-09

### 📈 Interaktive Dashboard-Kacheln (Kurven-Fokus), Out-of-the-Box Vollbreiten-Technik-Chart & Helferfreie Sankey-Berechnung aus `kWh Total`-Zählern

#### 1. Interaktive Dashboard-Kacheln & Verbraucher-Zeilen mit Direkt-Sprung zum Kurven-Fokus (Ebene 1 → Ebene 2)
* **Tap auf Kachel = Verlaufskurve im Fokus (`openLiveCurveFocus`):**
  - Alle 4 Status-Kacheln auf dem Start-Dashboard (**`PV gesamt · DC`**, **`Hausverbrauch · AC`**, **`BYD HVS+`**, **`Netz · Bezug / Einspeisung`**) sowie jede Zeile in **„Aktive Verbraucher“** sind nun direkt anklickbar und mit einem dezenten Kurven-Indikator versehen.
  - Ein Tap wechselt unmittelbar in das große Tagesverlauf-Diagramm (Ebene 2) und **isoliert automatisch die gewählte Kurve** (z. B. PV + aktive Strings, Hauslast, Batterie-Leistung + SoC %, Netzbezug + Einspeisung oder den konkreten Einzelverbraucher wie *Wäschetrockner* / *Wärmepumpe*).
  - Über den eingeblendeten Button **„Alle Kurven“** oben rechts oder einen erneuten Tap auf den **`◎` Solo-Fokus** kehrt man jederzeit zur kombinierten Gesamtansicht zurück.

#### 2. Out-of-the-Box Technisches Redesign der Tagesverlauf-Seite (`#live-detail-intraday`)
* **Randloses Vollbreiten-Technik-Diagramm oben:**
  - Das Diagramm spannt sich im oberen Bereich über die gesamte Breite – ohne verschachtelte Kartenränder, mit feiner technischer Rasterung (`W` links, `SoC %` rechts), weichem vertikalem Flächen-Gradienten und einer **Oszilloskop-Fadenkreuz-Messleiste** (`#dash_curve_hover_readout`) für zeitgenaues Touch- und Maus-Scrubbing.
* **Kompaktes 3-Spalten Telemetrie-Grid darunter (`#dash_curve_tiles_grid`):**
  - Unterhalb des Charts sitzt ein modernes, platzsparendes 3-Spalten-Raster (`grid-cols-2 sm:grid-cols-3`) für alle Kanäle inkl. **`Netzeinspeisung`**, **`Batterie · Leistung`** und sämtlicher **Einzelverbraucher**.
  - Jede kompakte Technik-Kachel zeigt auf einen Blick:
    1. Farb-Dot + Kanalname + **`◎` Solo-Fokus-Button**
    2. Aktuellen Live-Messwert in großer Monospace-Typografie (`tabular-nums`, z. B. `682 W` / `84 %`) + `AN`/`AUS`-Indikator
    3. Integrierte **Tages-Energie (`kWh`)** + **Tages-Spitzenwert (`Max W`)** in einer klaren, ungerahmten Fußzeile.

#### 3. Sankey-Energiefluss direkt aus `kWh Total`-Gesamtzählern ohne Home-Assistant-Helfer
* **Kein Erstellen von Tages- oder Monats-Utility-Metern in Home Assistant mehr nötig:**
  - In den Home-Assistant-Einstellungen (Sektion 5 sowie direkt über den neuen Button **„Zähler (kWh total)“** im Sankey-Kopf) werden einfach die vorhandenen **Gesamt-Energiezähler (`kWh Total` / `total_increasing`)** ausgewählt (`PV-Erzeugung Gesamt`, `Netzbezug Gesamt`, `Netzeinspeisung Gesamt`, `Batterie-Ladung Gesamt`, `Batterie-Entladung Gesamt`).
  - Die App ermittelt über die Home-Assistant-Historie (`/api/history/period`) automatisch den Zählerstand um **`00:00` Uhr heute** sowie am **1. des Monats um `00:00` Uhr** (mit lokalem Baseline-Cache) und berechnet daraus präzise die Differenz $\Delta\text{kWh} = \text{Zählerstand}_{\text{jetzt}} - \text{Zählerstand}_{\text{Start}}$.
  - **Intelligenter Watt-Integrations-Fallback:** Ist für einen Zweig noch kein `kWh`-Zähler hinterlegt, berechnet das Sankey-Diagramm die Tages-kWh automatisch per direktionaler Trapez-Integration ($\int P(t)\,\mathrm{d}t$) aus den Watt-Sensoren.

---

## [Version 8.8] – 2026-11-09

### ⚡ Sofortiger Dev-Server-Boot & Bereinigung nativer Build-Abhängigkeiten

* **Beseitigung der `bun install` Start-Blockade:**
  - Das nur einmalig zur statischen Icon-Generierung genutzte native Paket `sharp` (mit 25 plattformspezifischen `@img/sharp-libvips-*` Binär-Tarballs in `bun.lock`) führte beim Container-Start dazu, dass `bun install` beim Download der Binärpakete hing und der Express-Server (`node server.js` auf Port `3000`) nicht rechtzeitig gestartet wurde.
  - Durch die Beschränkung der Laufzeit-Dependencies in `package.json` auf die tatsächlich benötigten Pakete (`express` und `qrcode`) sowie Bereinigung des Lockfiles startet der Dev-Server ab sofort verzögerungsfrei in unter einer Sekunde.

---

## [Version 8.7] – 2026-11-09

### 🎛️ Komfort-Sensor-Picker mit Geräte- & Helfer-Gruppen, Vollbild-/Querformat-Tagesdiagramm, High-Contrast Kurven-Kacheln & Demo-Bereinigung

#### 1. 2-Stufiges Komfort-Sensor-Picker Modal (`#modal-ha-entity-picker`)
* **Kein manuelles Kopieren von `sensor.*` IDs mehr nötig:**
  - Jedes Home-Assistant-Entitätsfeld in den Einstellungen (System-Sensoren, frei konfigurierbare PV-Strings und Einzelverbraucher) besitzt ab sofort einen direkten **„Wählen“**-Button.
  - **Stufe 1 (Geräte & Helfer/Zähler):** Gruppiert alle gefundenen Sensoren automatisch in **Geräte** (echte Home-Assistant-Geräte- & Raum-Zuordnung über `POST /api/template` mit intelligentem Präfix-Fallback wie *Fronius*, *BYD*, *Shelly*, *Hoymiles*) sowie **Helfer & Zähler** (Integralsensoren/Riemann-Summe, Verbrauchszähler/Utility Meter, Gruppen- und Template-Sensoren).
  - **Stufe 2 (Entitäten-Liste mit Live-Werten & Suche):** Zeigt zu jeder Entität den freundlichen Klarnamen, das zugehörige Gerät/Raum-Badge, die technische `entity_id` und den **aktuellen Live-Messwert inkl. Einheit** (z. B. `429 W`, `84 %`, `12,4 kWh`).
  - **Echtzeit-Suche & Einheiten-Schnellfilter:** Filtert verzögerungsfrei nach Gerätenamen, Helfern oder Entitäts-IDs und bietet passende Einheiten-Filter (`Leistung W/kW`, `Energie kWh/Wh`, `Batterie %`, `Alle Einheiten`). Bei String- und Einzelverbraucher-Zeilen wird der Klarname auf Wunsch automatisch als Anzeigename übernommen.

#### 2. Vollbild- & 90°-Querformat-Tagesdiagramm (`#modal-intraday-fullscreen`)
* **Antippen des Diagramms öffnet die große Detail-Ansicht:**
  - Ein Tap direkt auf das Tagesverlauf-Diagramm oder auf den Button **„Vollbild“** öffnet das neue Vollbild-Overlay (`#modal-intraday-fullscreen`).
  - **90°-Querformat-Modus für Smartphones:** Über den Button **„90° Querformat“** lässt sich das Diagramm auf dem Handy im Hochformat um 90 Grad auf die volle Displayhöhe aufspannen.
  - **Interaktive Kurven-Chips & Touch-Scrubbing im Vollbild:** Direkt oberhalb des Vollbild-Diagramms können alle Kurven (`PV gesamt`, `String 1..n`, `Hausverbrauch`, `Batterie-Ladung`, `SOC %`, `Netz`) per Tap ein-/ausgeblendet und zeitgenau abgefahren werden.

#### 3. Kompakte High-Contrast Kurven-Kacheln, Einzeiliges Datum & Demo-Bereinigung
* **Unverwechselbarer Aktiv/Inaktiv-Status der Kurven-Kacheln (`#dash_curve_tiles_grid`):**
  - Kompaktes 2-Spalten-Raster mit reduziertem Padding: **Aktive Kurven** leuchten mit farbigem `2px`-Rahmen in der jeweiligen Kurvenfarbe, farbig getöntem Glas-Hintergrund und **`Aktiv`**-Badge; **abgewählte Kurven** werden deutlich abgedunkelt (`opacity: 0.42`, **`Aus`**-Badge), sodass sofort erkennbar ist, welche Kurven im Diagramm aktiv sind.
* **Einzeilige Datums- & Zeitspanne ohne Zeilenumbruch (`#dash_curve_timerange`):**
  - Die Toolbar über dem Tagesdiagramm ist klar gegliedert (`↻ Refresh` links, `Strings` + `Vollbild` rechts); das Datum (`09.11.2026 · 00:00 – jetzt`) steht darunter einzeilig mit `whitespace-nowrap tabular-nums` ohne unschöne Umbrüche.
* **Vollständige Entfernung des Demo-Modus:**
  - Der Demo-Zeitschieberegler (`#liveDemoTimeBar`), die Demo-Umschaltbuttons und die Auswahloption „Simulations-Demo“ wurden entfernt; die App arbeitet standardmäßig im echten Home-Assistant-Live-Modus (`poll`).

---

## [Version 8.6] – 2026-11-09

### 🌐 GitHub Pages & Browser-First Home Assistant Engine (Beseitigung des `Unexpected token '<'` HTML-Fehlers)

#### 1. Browser-First Home Assistant Client (`fetchHaDirectFromBrowser`, `parseHaStatesInBrowser`, `fetchHaHistoryInBrowser`)
* **100 % lauffähig auf GitHub Pages & statischen Webservern ohne Node.js-Backend:**
  - Auf statischen Hosts wie GitHub Pages existiert kein lokales `/api/ha/*`-Backend, sodass Aufrufe an `/api/ha/test`, `/api/ha/states` oder `/api/ha/history` eine statische HTML-404/405-Seite (`<html><head>...`) zurücklieferten und bei `res.json()` den Fehler `Unexpected token '<', "<html> <he"... is not valid JSON` auslösten.
  - Ab Version 8.6 kommuniziert `telemetry.js` **primär direkt aus dem Browser** mit der Home-Assistant-REST-API (`${baseUrl}/api/states` und `${baseUrl}/api/history/period/...`) inklusive kompletter Einheiten-Normalisierung (`W`/`kW`, `Wh`/`kWh`), String- & Einzelverbraucher-Auswertung sowie 5-Minuten-Tagesverlauf-Integration direkt im Browser.

#### 2. Defensive JSON/HTML-Prüfung (`safeFetchBackendJson`) & Automatischer `:8123` Reverse-Proxy-Fallback
* **Kein Absturz bei HTML-Fehlerseiten:**
  - Alle verbleibenden Backend-Fallbacks prüfen zuerst den Antworttext auf `<` / `<!doctype`, sodass HTML-Seiten niemals ungeprüft an `JSON.parse` übergeben werden.
* **Automatische Port-Korrektur für HTTPS-Domains:**
  - Falls bei einer HTTPS-Reverse-Proxy-Domain versehentlich `:8123` eingetragen wurde (z. B. `https://home.mb10.org:8123`), testet die App automatisch auch die Standard-Port-443-URL (`https://home.mb10.org`) und übernimmt die funktionierende Adresse direkt in die Konfiguration.
* **Dynamische GitHub-Pages `cors_allowed_origins`-Vorlage:**
  - Da Home Assistant in `cors_allowed_origins` exakte Origin-URLs verlangt, fügt das Modal automatisch die aktuelle Browser-Origin (z. B. `https://magic8383.github.io`) in die kopierbare `configuration.yaml`-Vorlage ein.

---

## [Version 8.5] – 2026-11-09

### 🌊 Interaktives Sankey-Energiefluss-Diagramm, Echtes „Liquid Glass“-Design, Einheitliche 2-Ebenen Mobile-First Drill-Down-Navigation & Home Assistant Reverse-Proxy Fix

#### 1. Interaktives Sankey-Energiefluss-Diagramm im Analyse-Tab (`Heute` | `Monat` | `Gesamtjahr`)
* **Proportionale Energiefluss-Bänder (Cubic Bézier SVG):**
  - Neues interaktives **Sankey-Diagramm** auf Ebene 1 des Analyse-Bereichs (`#sankeyDiagramContainer`), umschaltbar zwischen **`Heute`**, **`Monat`** und **`Gesamtjahr`**.
  - Visualisiert proportional die Energieströme (`kWh` und `%`) von den Quellen (`PV-Erzeugung`, `Netzbezug`) über `PV-Direktverbrauch` und `Batteriespeicher` (Ladung, Entladung, Wirkungsgrad $\eta$ & Wandlungsverluste) zu den Senken (`Hausverbrauch` und `Netzeinspeisung`).
  - Darunterliegendes 4-Kachel-Summary-Ribbon (`#sankeySummaryRibbon`) für Zeitraumbilanz, Autarkiequote, Eigenverbrauchsquote und selbst gedeckte Energiemenge.

#### 2. Echtes „Liquid Glass“-Design (Insbesondere im Dark Mode)
* **Transluzente Tiefenwirkung & Specular Highlights:**
  - Mehrschichtige Glas-Oberflächen (`backdrop-filter: blur(28px) saturate(190%)`) mit feinen Lichtkanten (`inset 0 1px 0 rgba(255,255,255,0.22)`) und sanften Ambient-Hintergrund-Orbs (`#liquidGlassAmbientBg` in Mint/Teal, Cyan und Violett), sodass die Karten im Dark Mode einen echten räumlichen Glas-Look erhalten.

#### 3. Einheitliche Mobile-First 2-Ebenen Drill-Down-Navigation & Aufgeräumte Seiten
* **Durchgängiges Ebene-1 / Ebene-2 Prinzip ohne Informationsverlust:**
  - **Live-Bereich (`#tab-live`):** Ebene 1 zeigt kompakt `Energie · jetzt` (2x2 Statuskacheln), `Aktive Verbraucher` und eine Drill-Down-Kachel für den Tagesverlauf. Ein Tap öffnet Ebene 2 (`#live-detail-intraday`) mit dem großen 24h-Kurvendiagramm und den auswählbaren Sensor-Kacheln.
  - **Analyse-Bereich (`#tab-analyse`):** Ebene 1 zeigt die 4 Jahres-KPIs, das neue Sankey-Energiefluss-Diagramm und 4 übersichtliche Drill-Down-Kacheln (`Soll-Ist-Vergleich`, `Autarkie & Batterie-Effizienz`, `Reale Amortisation & €-Ersparnis`, `Monats-Logbuch & HA-Zähler`). Ein Tap öffnet die jeweilige Detailauswertung auf Ebene 2 mit prominentem Zurück-Button.
  - **PV-Planung (`#tab-planung-hub`):** Neues Ebene-1 Planungs-Hub mit 2x2 Anlagen-KPIs (`kWp`, `PVGIS-Ertrag`, `Geplante Autarkie`, `Geplante Amortisation`) und 9 aufgeräumten Engineering-Kacheln, die per Tap in die jeweilige Detailansicht (Ebene 2) verzweigen.

#### 4. Zweizeiliger Mobile-Header & Verschlankte 4-Icon Pill-Bar
* **Immer vollständig lesbarer Bereichsname (`#headerViewTitle`):**
  - Zeile 1 enthält links das App-Badge (`Pro 8.5`) bzw. auf Ebene 2 den prominenten Button **`← Zurück zur Übersicht`** (`#btnHeaderBack`) und rechts die Schnellaktionen (`Projekt`, `HA & Sensoren`, `Speichern`).
  - Zeile 2 widmet die gesamte Bildschirmbreite dem aktuellen Bereichstitel, Untertitel und Ebenen-Badge – selbst auf 360 px schmalen Smartphones wird nichts mehr abgeschnitten.
* **4-Icon Floating Bottom Bar:**
  - Der Dark-/Light-Mode-Schalter wurde aus der unteren Pill-Leiste an den oberen Rand des `Menü`-Bottom-Sheets (`#m3MoreSheet`) verschoben.

#### 5. Home Assistant Domain- & Reverse-Proxy-Fix + Schritt-für-Schritt-Anleitung
* **Robuste Reverse-Proxy-Engine in `server.js` & Diagnose:**
  - Automatische URL-Bereinigung (entfernt versehentliche `/lovelace`-Pfade), Token-Bereinigung, Beibehaltung des `Authorization: Bearer <Token>`-Headers über HTTP `301/302/307/308` Weiterleitungen hinweg sowie Unterstützung selbstsignierter/intermediärer TLS-Zertifikate.
  - Erkennung vorgeschalteter Proxy-Logins (Authelia, Authentik, Cloudflare Access, Synology Portal) und fehlender `trusted_proxies`-Einträge inkl. direktem Browser-CORS-Fallback.
* **Integrierter Anleitungs-Tab im HA-Modal (`switchHaModalTab('guide')`):**
  - Ausführliche 4-Schritte-Anleitung für **Domain + Reverse Proxy** mit kopierfertiger `configuration.yaml` (`http: use_x_forwarded_for`, `trusted_proxies`, `cors_allowed_origins`), Proxy-Checkliste (`Authorization`-Header, WebSockets) und Webhook-Push-Alternative.

---

## [Version 8.4] – 2026-11-09

### ⚡ Komplettes Dashboard-First Redesign („Solar & Netz · live“), Interaktiver Tagesverlauf & Frei Konfigurierbare Home Assistant Verbraucher/Strings

#### 1. Neues Start-Dashboard „Solar & Netz · live“ (Progressive Disclosure)
* **Sofortiger Überblick beim Öffnen der App (`#tab-live`):**
  - Die App startet direkt auf dem aufgeräumten **Live-Dashboard** im zweistufigen Farbdesign (sanfter Mint-Pastell-Verlauf im Hellmodus, edles Deep-Teal/Slate im Dunkelmodus).
  - **Sektion „Energie · jetzt“ (2x2 Status-Kacheln):** Zeigt auf einen Blick `PV gesamt · DC` (Mint/Teal), `Hausverbrauch · AC` (Amber/Orange), `Batteriespeicher / BYD HVS+` (Lavendel/Violett mit SoC-% und Status) sowie `Netz · Bezug / Einspeisung` (Blau) inklusive dynamischer Fortschrittsbalken.
  - **Sektion „Aktive Verbraucher“:** Listet alle aktiven Einzelverbraucher (z. B. `Trockner`, `TV-Verstärker`, `Esszimmer Licht`, `Küche Licht`) absteigend nach aktueller Leistung (`W`/`kW`) in klaren Pill-Zeilen auf und zeigt automatisch an, falls ein Sensorwert aktuell nicht verfügbar ist.

#### 2. Interaktives Tagesdiagramm & Auswählbare Messwert-Kacheln (`/api/ha/history`)
* **Automatischer Home Assistant Tagesverlauf (`00:00` bis jetzt):**
  - Neuer Backend-Endpunkt `/api/ha/history` in `server.js` ruft die Tageshistorie aller zugeordneten Leistungs-, String- und Batterie-Sensoren direkt aus Home Assistant (`/api/history/period`) ab, tastet sie auf ein einheitliches 5-Minuten-Zeitraster ab und berechnet per Trapez-Integration die erzeugte bzw. verbrauchte Tagesenergie (`≈ kWh · aus Leistung`).
  - **Dual-Achsen-Diagramm (`W` links, `%` rechts):** Rendert beliebig viele String- und Systemkurven gleichzeitig mit interaktiven Legenden-Chips und präzisem Zeitstempel-Readout unter dem Graphen.
  - **Interaktive Kurven-Auswahlkacheln (`Kurven auswählen · aktuelle Messwerte`):** 2-spaltiges Kachel-Grid für alle Strings und Hauptsensoren. Ein Tap auf eine Kachel schaltet die zugehörige Kurve im Diagramm sofort ein oder aus (mit farbigem Rahmen-Highlight) und zeigt live die aktuelle Leistung (`W`) sowie die Tages-kWh (`erfasster Zeitraum` bzw. `≈ kWh · aus Leistung`).

#### 3. Frei Konfigurierbare Einzelverbraucher & PV-Strings in Home Assistant (`#modal-ha-config`)
* **Dynamischer Editor für Verbraucher & Strings:**
  - Beliebig viele Einzelverbraucher (`Name` + `sensor.*`) und PV-Strings/Wechselrichter (`Name`, Farb-Akzent, Leistungs-Entität `W` + optionale Tagesertrags-Entität `kWh`) können frei angelegt, bearbeitet oder gelöscht werden.
  - **1-Klick „Aus Planung übernehmen“:** Überträgt die in der PV-Planung angelegten Stränge automatisch in die Home-Assistant-Stringliste.

#### 4. Schwebende, Handyoptimierte Pill-Navigationsleiste & Entkoppelte Ebenen
* **Kompakte Floating Bottom Bar (`#floatingBottomNav`, ab 360 px Bildschirmbreite):**
  - Schneller Wechsel mit einem Daumen-Tap zwischen **Dashboard (`bolt`)**, **Soll-Ist- & Tiefen-Analyse (`monitoring`)**, **PV-Planung (`solar_power`)**, **Menü (`menu`)** und **Hell-/Dunkelmodus (`dark_mode`/`light_mode`)**.
  - Die detaillierte 9-stufige Planungs-Subnavigation (`#navScroller`) erscheint kontextsensitiv nur noch innerhalb der PV-Planungsebene, sodass das Start-Dashboard maximal ruhig und übersichtlich bleibt.

---

## [Version 8.3] – 2026-11-08

### 📊 Live-Telemetrie, Home Assistant Integration, Soll-Ist-Performance-Analyse & EU-JRC PVGIS Server-Proxy

#### 1. Ausfallsicherer Multi-Tier PVGIS Server-Proxy mit Disk- & Memory-Cache (`/api/pvgis/seriescalc`)
* **Direkte Server-Abfrage der offiziellen EU-JRC-Wissenschaftsschnittstelle:**
  - Behebung von Verbindungsabbrüchen und CORS-Blockaden externer Drittanbieter-Proxys durch einen dedizierten Backend-Endpunkt in `server.js`.
  - Mehrstufige Kaskade: `1. Lokaler Server-Memory-/Disk-Cache` &rarr; `2. Offizielle EU-JRC PVGIS v5.3 API` &rarr; `3. Offizielle EU-JRC PVGIS v5.2 API` &rarr; `4. PVGIS Mirror` &rarr; `5. Kalibriertes 8.760h Synthetik-Modell`.
  - Dezente Statusanzeige im Standort-Header (`#pvgisStatusBadge`) und nicht-blockierende Toast-Benachrichtigungen anstelle störender Browser-Alerts.

#### 2. Neuer Hauptbereich „Live & Analyse“ (`telemetry.js`) mit Echtzeit-Energiefluss & String-Monitoring
* **Animiertes Echtzeit-Energiefluss-Cockpit (SVG):**
  - Visualisiert live die Leistungsflüsse zwischen PV-Generator (Dach & Strings), Wechselrichter-Hub, Hausverbrauch, Batteriespeicher (inkl. SoC-%-Füllstandsanzeige) und öffentlichem Stromnetz (Einspeisung vs. Netzbezug).
  - Strangspezifischer Live-Monitor: Zeigt für jeden in der Planung angelegten String die aktuelle Leistung (`W`/`kW`), die prozentuale Auslastung bezogen auf die geplante String-Nennleistung (`kWp`) und die zugeordnete Sensor-Entität.
  - Integrierter **Live-Simulationsmodus (Demo)** mit interaktivem Tageszeit-Schieberegler (06:00–21:00 Uhr), der exakt auf die geplante Anlagengröße (`kWp`), String-Ausrichtungen (`Azimut`/`Neigung`) und Speichergröße abgestimmt ist.

#### 3. Flexibler Home Assistant Konfigurator & Sensor-Entitäten-Manager (`#modal-ha-config`)
* **Freie Zuordnung aller `sensor.*`-Entitäten:**
  - Konfigurations-Modal für Home Assistant URL, Long-Lived Access Token, Abfrage-Intervall und Daten-Modus (`Live-Poll`, `Webhook-Push`, `Live-Demo`).
  - **1-Klick Verbindungstest & Sensor-Discovery (`/api/ha/test`):** Prüft die Verbindung zu Home Assistant und lädt alle vorhandenen `sensor.*`-Entitäten automatisch in die Such- und Autovervollständigungsliste (`<datalist>`).
  - Automatische Einheiten-Normalisierung (`W` vs. `kW`, `Wh` vs. `kWh`) für Leistungs- und Energiezähler sowie dynamische Zuordnung einzelner Strings (`sensor.string_1_power`, etc.).
  - Integrierter YAML-Generator für **Webhook-Push (`/api/ha/webhook`)**, falls Home Assistant ohne Portfreigabe aus dem lokalen Heimnetz pushen soll.

#### 4. Drei-Säulen Langzeit- & Monats-Performance-Analyse + 12-Monats-Logbuch
* **1. Soll-Ist-Vergleich (Realer Ertrag vs. PVGIS-Prognose):**
  - Gruppiertes 12-Monats-Diagramm (`PVGIS-Soll` vs. `Realer Ist-Ertrag`), Berechnung des Performance-Index (`%` Zielerreichung), des spezifischen Ist-Ertrags (`kWh/kWp`) sowie detaillierte Monats-Abweichungskarten.
* **2. Autarkie, Eigenverbrauch & Batterie-Effizienz:**
  - Auswertung der realen Autarkie- und Eigenverbrauchsquote sowie Berechnung des realen **Batterie-Systemwirkungsgrads ($\eta_{\text{Bat}} = E_{\text{Entladung}} / E_{\text{Ladung}}$)**, der Speicher-Wandlungsverluste und der absolvierten Vollzyklen.
* **3. Reale Amortisations- & Euro-Ersparnis-Rechnung:**
  - Verknüpft die realen Eigenverbrauchs- und Einspeisemengen direkt mit dem geplanten Strompreis, dem EEG-Vergütungssatz und der Gesamtinvestitionssumme aus dem Tab „Investition“.
  - Zeigt die erwirtschaftete Euro-Ersparnis, das jährliche Cashflow-Delta (`Ist vs. Plan`) und die 20-Jahres-Break-Even-Kurve.
* **4. Monatswerte-Logbuch & CSV-Schnittstelle:**
  - Editierbare 12-Monats-Tabelle mit 1-Klick-Übernahme der laufenden Monatszähler aus Home Assistant, Referenz-Jahresbefüllung sowie CSV-Import und CSV-Export.

---

## [Version 8.2] – 2026-09-13

### 💾 Vollendung der Server- & Systemplan-Persistenz, lückenloser State-Transfer & Header-Synchronisation

#### 1. Lückenloser Konfigurations- & State-Transfer für fest im Server/Code gespeicherte Planungen
* **Vollständige Serialisierung aller System-Parameter:**
  - Beim festen Speichern einer Planung auf dem Server (`/api/plans/persist` via `submitSaveSystemPlanToServer`) werden nun ausnahmslos alle System-Parameter vollständig erfasst: Stränge (`strings` mit Fallback-Prüfung gegen leere Arrays), Standort (`LocationData`), Wechselrichter- & Modul-Zuweisungspools (`projectInverterIds`, `projectPanelIds`), Batteriezuordnung (`batMap`, `activeHardwareBatteryId`), Kabel- & Leitungsdimensionierung nach DIN VDE 0100-712 (`cableParams`, `wiring`), alle Investitionskosten inkl. dynamischer Zusatzaufwände (`invest`), detaillierte Anlagenkosten (`costs`), Finanzierungsparameter (`finance`) sowie Verbrauchsdaten (`consumption`).
* **Lückenlose Rekonstruktion & Re-Rendering beim Laden:**
  - Beim Aktivieren einer Server-Planung (`loadPersistentPlanFromServer`) werden alle Module, Stränge, Leitungsquerschnitte und Hardware-Zuweisungen reaktiv in die Benutzeroberfläche und die physikalische Simulation eingespielt.
  - Der Tab Verkabelung (`renderWiringTab`), der Hardware-Katalog (`renderDatabaseUI`, `renderActiveHardwareUI`), die String-Übersicht (`updateStringsUI`) und die Physikengine (`updatePhysicsOnly`) werden unmittelbar synchron aktualisiert.
* **Synchronisation mit dem Projekt-Manager & Header:**
  - Die geladene Server-Planung aktualisiert direkt die aktive Projektinstanz (`projects`) und synchronisiert den sichtbaren Plannamen in der Kopfzeile (`#headerProjectName`).
* **Resiliente Offline-Pufferung:**
  - Planungsdaten werden im lokalen Cache (`pvpro_server_plans_cache`) gespiegelt, sodass auch bei temporären Netzwerkunterbrechungen oder Offline-Nutzung kein Datenverlust auftritt.

#### 2. Synchronisation der Release-Version 8.2
* **0.1-Schritt-Governance:**
  - Exakte Inkrementierung von 8.1 &rarr; 8.2 gemäß Projekt-Governance in `AGENTS.md` und `DEVELOPMENT_GUIDELINES.md`.
  - Vollständige Aktualisierung in `package.json`, `index.html` (Header `#app-header-version`, Title, Meta-Tags, Script-Tags mit `?v=8.2`), `sw.js` (`pvpro-cache-v8.2`), `app.js` und `content.js`.

---

## [Version 8.1] – 2026-09-13

### 💰 Dynamische Zusatzpositionen in Investitionskosten, Dossier-Synchronisation & 0.1-Versionsstandard

#### 1. Dynamische Zusatzpositionen für alle Investitions-Unterkategorien
* **Individuell hinzufügbare Positionen per „+ Position hinzufügen“-Schaltfläche:**
  - Jede der 4 Haupt-Unterkategorien (Module & Unterkonstruktion, Wechselrichter & Speicher, DC/AC Installation & Schutz, Gerüst, Elektriker & Formalitäten) verfügt nun über eine intuitive Schaltfläche zum Hinzufügen flexibler benutzerdefinierter Positionen.
  - Jede neue Zeile bietet ein Textfeld für die Bezeichnung (z.B. „Zählerkasten-Umbau“, „Dachhaken Sonderanfertigung“, „Kabelkanal-Trasse“) und ein Euro-Eingabefeld für den Betrag.
  - Positionen können mit einem Klick auf das Papierkorb-Symbol wieder entfernt werden.
* **Echtzeit-Kalkulation & Gesamtsumme:**
  - `calcInvestTotal()` kalkuliert in Echtzeit alle Standard- und benutzerdefinierten Zusatzpositionen in die Zwischensummen der Kategorien und die Gesamtsumme der Investition ein.
  - Vollständige Synchronisation mit der Wirtschaftlichkeits- und Amortisationsrechnung.
* **Permanente Speicherung & Projekt-Management:**
  - Alle Zusatzpositionen werden in `localStorage` (`pvpro_invest`) sowie in fest auf dem Server gespeicherten Planungen (`submitSaveSystemPlanToServer` / `loadPersistentPlanFromServer`) vollständig serialisiert und wiederhergestellt.

#### 2. Vollständige Integration in den PDF- und Druck-Dossiergenerator
* **Dossier & Kompaktbericht Synchronisation (`dossier.js`):**
  - Die Gesamtsumme der Investition (`totalInvestSum`) wird im Druckdossier nicht mehr auf generische Schätzwerte zurückgesetzt, sondern exakt aus den benutzerdefinierten Eingaben berechnet.
  - Auf Seite 7 (Wirtschaftlichkeit & Amortisation) wird eine detaillierte, strukturierte Aufstellung aller 4 Kategorien samt sämtlicher erfasster Zusatzaufwände gerendert.

#### 3. Standardisierung der Versionsführung (0.1-Schritte)
* **Verbindliche Dokumentationsrichtlinie:**
  - Festlegung des Versionsschemas auf exakte 0.1-Inkremente (z.B. 8.0 &rarr; 8.1 &rarr; 8.2) in `AGENTS.md` und `DEVELOPMENT_GUIDELINES.md`.
  - Vollständige Synchronisation über `package.json`, `index.html`, `sw.js` (`pvpro-cache-v8.1`), `app.js`, `wiring.js` und `dossier.js`.

---

## [Version 8.0.3] – 2026-09-12

### 🛡️ Globale HTML-Escaping-Sicherheit & Robuste SVG-Schaltplan-Resilienz

#### 1. Globale HTML-Escaping-Sicherheitsfunktion (`escapeHtml`)
* **Beseitigung von Referenzfehlern (`ReferenceError: escapeHtml is not defined`):**
  - Definition einer globalen, defensiven `escapeHtml()`-Implementierung am Kopf von `app.js` sowie Bereitstellung im globalen Kontext (`window.escapeHtml`), um jegliche Laufzeitfehler in dynamisch gerenderten Modalen, Datenblatt-Ansichten und Tabellen zuverlässig abzufangen.
  - Sichere Behandlung von `null`, `undefined` und String-Sonderzeichen (`&`, `<`, `>`, `"`, `'`).

#### 2. Robuste SVG-Schaltplan-Resilienz in `wiring.js`
* **Defensive Wechselrichter- und String-Werte:**
  - Absicherung der Wechselrichter-Namensauflösung im interaktiven SVG-Schaltplan (`generateStringWiringSvg`) gegen unvollständige oder asynchron geladene Datenmodelle mit sicherem Fallback auf `flatInverters[0]` und XML-konformer Textbereinigung.
  - Saubere String-Spannungsanzeige ($U_{mpp,hot}$) im Wechselrichter-Display des Schaltplans auch bei initialen oder editierten Strang-Zuständen.

#### 3. Konsistente Versionierung & PWA-Cache-Erneuerung
* **PWA-Cache `pvpro-cache-v8.0.3`:**
  - Cache-Busting für alle modularen Skripte (`database.js`, `app.js`, `wiring.js`, `dossier.js`, `content.js`) und Icons zur sofortigen fehlerfreien Aktualisierung auf allen Endgeräten.

---

## [Version 8.0.2] – 2026-09-12

### 🔍 AIKO Neostar 3S+ Korrektur, Vollwertiger Datenblatt-Viewer & Robuste String-Physik (Spannung & Strom)

#### 1. Korrektur der Modulbezeichnung: AIKO Neostar 3S+
* **Datenblatt-Konforme Benennung:**
  - Sämtliche Einträge der AIKO Hochleistungsmodulserie im Hardware-Katalog (`MasterDB`) wurden von „2S+“ auf die korrekte offizielle Bezeichnung **„AIKO Neostar 3S+“** (460 Wp bis 475 Wp N-Type ABC Glas-Glas) umbenannt.
  - Auch in `MasterHardwareDocs` und allen Bezeichnern wurde die Nomenklatur an das offizielle Herstellerdatenblatt angepasst.

#### 2. Vollwertiger Technischer Datenblatt-Viewer (`showDeviceDatasheet`)
* **Direktes Anzeigen von Datenblättern ohne externe Blockaden:**
  - Neu implementierter Vollbild-Modal-Viewer `showDeviceDatasheet(deviceType, deviceId)` mit vollständiger Aufbereitung aller elektrotechnischen Kenndaten direkt in der App.
  - **Photovoltaik-Module:** Anzeige von Nennleistung STC (Wp), Umpp, Uoc, Impp, Isc, Modulwirkungsgrad (%), Temperaturkoeffizienten (Pmax, Voc, Isc), Zellaufbau (N-Typ ABC Halbzellen), NMOT, Glasaufbau (2,0 + 2,0 mm Doppelglas), mechanischen Abmessungen (1762 × 1134 × 30 mm), Gewicht und Garantien.
  - **Wechselrichter:** Anzeige von AC-Nennleistung, maximaler DC-Spannung, Startspannung, nutzbarem MPP-Spannungsbereich, Strömen je Tracker (Imax, Isc), MPPT-Anzahl, Schutzart (IP66/IP67), Kühlkonzept, VDE-AR-N 4105 Konformität und Wirkungsgrad.
  - **Batteriespeicher:** Anzeige von nutzbarer Kapazität (kWh), Modulanzahl, Nennspannung, Lade-/Entladeleistung, LiFePO4-Zellchemie und VDE 2510-50 / UN 38.3 Sicherheitsnormen.
  - **Aktionsschaltflächen:** Integrierte „Datenblatt“-Buttons auf allen Gerätekarten (aktive Wechselrichter-, Modul- und Batteriekarten sowie im gesamten Hardware-Katalog) und Querverweise zum Dokumenten-Manager und zu offiziellen Herstellerseiten/PDFs.

#### 3. String-Physik: Verlässliche Berechnung von Spannung und Strom
* **Robuste Auto-Healing-Logik in `updatePhysicsOnly()` und `initDatabase()`:**
  - Behebung von stillen Ausfällen bei der Anzeige von Spannung und Strom: Wenn in gespeicherten Strängen Hardware-Referenzen oder IDs veraltet oder nicht mehr im aktuellen Katalog vorhanden waren, wurden physikalische Werte nicht gerendert.
  - Bei fehlenden oder inkonsistenten IDs greift das System automatisch auf valide Standardkomponenten zurück (Auto-Healing), berechnet Leerlaufspannung bei -10°C ($U_{oc,-10^\circ C}$), MPP-Spannung bei +70°C ($U_{mpp,70^\circ C}$) sowie Kurzschlussstrom ($I_{sc}$) und aktualisiert die Status-Badges.
  - Beibehaltung des Akkordeon-Zustands beim Bearbeiten von Strings, sodass die Oberfläche während der Eingabe nicht unerwartet einklappt.

---

## [Version 8.0.1] – 2026-09-12

### 🛠️ Hardware-Katalog Initialisierung, Ausstattungs-Pool Handlers & PWA-Icon Cache-Invalidierung

#### 1. Unmittelbare Vorinitialisierung & Ausfallsicherheit des Hardware-Katalogs
* **Sofortige Datenverfügbarkeit ohne Verzögerung:**
  - `DB`, `flatPanels`, `flatInverters` und `flatBatteries` werden in `app.js` sofort bei Modulladezeit mit den Stammdaten aus `MasterDB` befüllt und an `window` exponiert.
  - Doppelte defensive Absicherung: Sowohl `renderDatabaseUI()` als auch `renderHardwareCatalogUI()` prüfen beim Aufruf auf gefüllte Arrays und greifen im Bedarfsfall automatisch und transparent auf `MasterDB` zurück.
  - Einbettung aller Teilschritte in `initDatabase()` (Themes, Strings, Geo-Standort, FAQ, Verbrauchs- und Finanzprofile) in separate `try/catch`-Blöcke, damit kein Teilausfall das Laden der Hardware-Listen behindern kann.
  - Etablierung eines robusten Mehrstufen-DOM-Ready-Triggers (`document.readyState`, `DOMContentLoaded` und `load`), der die Initialisierung zuverlässig auch bei aggressivem Browser-Script-Caching anstößt.

#### 2. Ausstattungs-Pool Handler & Global Scope Export
* **Vollständige Funktionsverknüpfung:**
  - Bereitstellung und Export der Handler `onSelectActivePanel(id)`, `onSelectActiveInverter(id)`, `addPanelToProject`, `removePanelFromProject`, `addInverterToProject` und `removeInverterFromProject` im globalen `window`-Scope.
  - Dadurch funktionieren alle Klick-Aktionen im Ausstattungs-Pool und Hardware-Katalog ohne unauffällige Konsolenfehler.

#### 3. PWA-Icon Cache-Invalidierung & Update-Verhalten
* **Aktualisierung von PWA-Icons auf Endgeräten:**
  - Cache-Buster `?v=8.0.1` für `manifest.json`, `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` und `favicon-32.png` im HTML-Header eingepflegt.
  - Service Worker Cache auf `pvpro-cache-v8.0.1` hochgestuft; alter Cache wird automatisch bei `activate` bereinigt.
  - **Hinweis zum Betriebssystem-PWA-Icon:** Bereits auf dem Homescreen/Desktop installierte PWAs speichern das Icon im OS-Anwendungs-Cache (Android/Windows/iOS). Um das neue High-Tech Engineering Icon sofort zu sehen, reicht meist ein Leeren des Browser-Caches (oder Abrufen via `Strg + F5`). Wurde die PWA bereits als native Verknüpfung installiert, aktualisiert das Betriebssystem das Icon entweder beim nächsten Hintergrund-Sync oder sofort durch kurzes Löschen und Neu-Hinzufügen der App zum Startbildschirm.

---

## [Version 8.0.0] – 2026-09-12

### 🚀 Master-Hardware-Katalog (AIKO, Fronius, Hoymiles), Beseitigung falscher Offline-Meldungen & Robuste Server-Synchronisation

#### 1. Fester Startpunkt des Hardware-Katalogs (Master-Hardware)
* **Vollständige Standard-Bibliothek ab Werk vorbefüllt:**
  - **AIKO Neostar 2S+ Solarmodule:** Vollständige N-Type ABC Hochleistungs-Modulserie (460 Wp, 465 Wp, 470 Wp, 475 Wp) mit 23,8 % Modulwirkungsgrad, Glas-Glas-Konstruktion und 30 Jahren Leistungsgarantie fest im Master-Katalog integriert.
  - **Fronius Symo GEN24 Plus SC Hybrid-Wechselrichter:** Alle Leistungsstufen (3.0, 4.0, 5.0, 6.0, 8.0, 10.0 und 12.0 kW) mit 2 MPPTs, dynamischem Peak-Manager und integrierter Notstromfunktion fest im Master-Katalog.
  - **Hoymiles Mikrowechselrichter-Serie:** Volles Spektrum an 4-Kanal-Mikrowechselrichtern: **HMS-1600-4T** (1600 VA), **HMS-1800-4T** (1800 VA) und **HMS-2000T-4T** (2000 VA) mit jeweils 4 unabhängigen MPPT-Trackern für anspruchsvolle Gauben-, Balkon- oder Fassadendächer.
  - **BYD Battery-Box Premium HVS+ Speicher:** Hochvolt-Lithium-Eisenphosphat (LiFePO4) Speicher (5.1, 7.7, 10.2 und 12.8 kWh) mit 95 % Wirkungsgrad.
* **Keine leeren Katalogzustände mehr:**
  - Bereinigung und Entflechtung der `mergeCodePersistedHardware()`-Logik: Benutzerdefinierte und Server-Hardware werden idempotent und sauber zusammengeführt, ohne den Master-Katalog zu überschreiben oder zu leeren.
  - Der Hardware-Katalog öffnet sich aufgeräumt und standardmäßig aktiv; die Gerätekarten werden zuverlässig initialisiert und gerendert.

#### 2. Behebung des persistenten „Offline-Modus“
* **Service Worker API-Bypass:**
  - `sw.js` leitet alle Anfragen an `/api/` konsequent am Service Worker Cache vorbei direkt an das Netzwerk. Dynamische Planungs- und Hardware-Abrufe werden dadurch niemals mehr mit veralteten oder leeren Cache-Antworten blockiert.
* **Resiliente Server-Planungsverwaltung:**
  - Beseitigung der irreführenden gelben Warnmeldung „Offline-Modus“, wenn lediglich noch keine zusätzlichen Server-Planungen gespeichert wurden.
  - Informative Bereit-Statuskarte mit Hinweisen zum Sichern von Planungen.
  - Lokaler Offline-Puffer (`localStorage`-Spiegelung) sowie manueller Aktualisierungs-Button (`renderServerPlansList`) für maximale Stabilität auch bei kurzzeitigen Verbindungspausen.
  - CORS-Middleware im Node.js Server um `PUT` und `DELETE` erweitert für uneingeschränkte REST-Funktionalität.

---

## [Version 7.12.0] – 2026-09-11

### ⚡ Multi-Wechselrichter & Multi-Modul-Ausstattungspool, Einklappbarer Katalog, Code-Persistenz & High-Tech App-Icon

#### 1. Multi-Hardware-Ausstattungspool (Mehrere Wechselrichter & Modultypen)
* **Projekt-Pool für Hardware-Kombinationen:**
  - Im Tab „Geräte & Zuweisung“ können nun mehrere Wechselrichter (z. B. Hoymiles Mikrowechselrichter kombiniert mit Hybrid-Wechselrichtern) und mehrere Modultypen parallel ausgewählt und als aktiver Ausstattungs-Pool vorgehalten werden.
  - Übersichtliche 2-Spalten-Struktur für Wechselrichter-Pool und PV-Modul-Pool mit Schnellauswahl-Dropdowns, Entfernen-Buttons und Kennzahlen (kWp, Zelltechnologie, AC-Leistung, MPPT-Anzahl).
  - Dynamische Statusanzeige mit Verknüpfung zu den zugewiesenen Strängen (`Strang 1`, `Strang 2` usw.) und direktem Sprung zu den Datenblättern.
* **Finale Zuweisung in den Strings:**
  - Die endgültige Zuordnung erfolgt strangspezifisch im Tab „Strings“.
  - Die Dropdown-Auswahl priorisiert optisch hervorgehoben die im Projekt-Pool hinterlegten Geräte (`(Im Projekt-Pool)`), erlaubt jedoch auch den Zugriff auf die gesamte Datenbank.
  - Beim Auswählen einer neuen Komponente an einem Strang wird diese automatisch in den Projekt-Pool aufgenommen.

#### 2. Einklappbarer Hardware-Katalog
* **Aufgeräumter Workflow:**
  - Der gesamte untere Bereich „Hardware-Katalog & Stammdatenbank“ ist standardmäßig zugeklappt (`<details>`), sodass der Fokus unmittelbar auf der Projektplanung und dem Gerätepool liegt.
  - Mit einem Klick öffnet sich die vollständige Katalogverwaltung mit Suchfeld, Typenfiltern (Module, Wechselrichter, Speicher), Detailkarten, Neuanlage und Bearbeitung.

#### 3. Echte Code- & Server-Persistenz („Fest im Server / Code speichern“)
* **Hardware- & Datenblatt-Persistenz:**
  - Beim Hinzufügen oder Bearbeiten von Hardware (z. B. Datenblätter, Zertifikate, elektrische Parameter) steht die Option „Fest im Server / Code speichern“ bereit.
  - Die Daten werden dauerhaft in `database.js` und `persistent_hardware.json` geschrieben und sind sofort für alle Sitzungen und Geräte verfügbar.
  - Beim Öffnen des Bearbeiten-Modals werden hinterlegte Datenblatt-URLs, Normen und Kategorien vorbefüllt.
* **Planungs-Persistenz im Code:**
  - Komplette Planungen können über den Button „Planung fest speichern“ dauerhaft als synchronisierbare Vorlage im Quellcode und Server hinterlegt werden (`/api/plans/persist`).
  - Beim Laden einer Server-Planung werden alle Stränge, Hardware-Pools (`projectInverterIds`, `projectPanelIds`), Speicherzuweisungen und Kabeldimensionierungen wiederhergestellt.

#### 4. High-End Engineering App-Icon
* **Professionelles deutsches Solar-Engineering App-Icon:**
  - Ersetzung des vorherigen Standard-Icons durch ein maßgeschneidertes, hochmodernes Icon-Set.
  - Dunkler Obsidian- und Saphir-Squircle mit feiner metallischer Fase, isometrischer monokristalliner Silizium-Wafer-Matrix (9BB Silber-Busbars), goldenen Leiterbahnen, dynamischem Hochspannungs-Energieblitz-Impuls und Doppelglas-Lichtreflexion.
  - Automatische Generierung und Einbindung für PWA (192×192, 512×512), Apple Touch (180×180), Favicon (32×32) und Vektorgrafik (`icon.svg`).

---

## [Version 7.10.0] – 2026-09-11

### ⚡ Gerätezuweisung, Hardware-Katalog, Code-Persistenz & Hoymiles HMS-2000T Integration

#### 1. Neugestaltung des Tabs „Geräte & Zuweisung“
* **Zweigeteilter Workflow:**
  - **Oberer Bereich („Aktive System-Hardware & Zuweisung“):** Schnellauswahl der im Projekt verwendeten Primär-Hardware (Modultyp, Wechselrichter, Speicher) mit Echtzeit-KPIs (kWp-Gesamtleistung, AC-Max-Leistung, DC/AC-Verhältnis, MPP-Tracking-Fenster).
  - Komfortable 1-Klick-Übernahme: „Auf alle Strings anwenden“ aktualisiert alle Stränge im Projekt simultan auf die neu gewählte Hardware.
  - Zuweisung von Batteriespeichern direkt an kompatible Hybrid-Wechselrichter.
  - **Unterer Bereich („Hardware-Katalog & Stammdatenbank“):** Durchsuchbare und filterbare Übersicht aller Solarmodule, Wechselrichter und Speicher mit elektrischen Spezifikationen und Herkunftskennzeichnung (Standard, Lokal, Fest im Server/Code).
  - Schnelle Aktionen pro Gerät: Als Aktiv setzen, Bearbeiten / Duplizieren, Datenblätter/Zertifikate verwalten sowie Löschen.

#### 2. Echte Code- & Server-Persistenz („Fest speichern“)
* **Dauerhafte Speicherung ohne externe SQL-Datenbank:**
  - Neue Hardware kann wahlweise **„Fest im Server / Code speichern“** oder **„Nur lokal im Browser speichern“** hinterlegt werden.
  - Beim festen Speichern schreibt der Server die Hardware direkt in `database.js` bzw. `persistent_hardware.json`, sodass sie sofort für alle Geräte und Browser-Sitzungen dauerhaft verfügbar ist.
  - Ebenso können komplette Planungen als eigenständige, feste Konfigurationen im Server/Code hinterlegt (`/api/plans/persist`) und geräteübergreifend synchronisiert geladen werden.

#### 3. Integration des Hoymiles HMS-2000T-4T Mikrowechselrichters
* **Vollständige elektrische Spezifikationen ab Werk hinterlegt:**
  - Empfohlene Modulleistung: 400 bis 670+ W je Eingang.
  - 4 unabhängige MPPTs mit jeweils 2 Moduleingängen (4T) bei extrem niedriger Startspannung von 22 V und weitem MPPT-Spannungsbereich (16–60 V).
  - Maximale Eingangsspannung 65 V, maximaler Eingangsstrom 4 × 16 A, Isc 4 × 25 A.
  - Maximale AC-Scheinleistung 2000 VA, CEC-Wirkungsgrad 96,5 %, integriertes Sub-1G-WLAN.

---

## [Version 7.9.0] – 2026-09-09

### 📱 Mobile Header-Bereinigung & M3 Bottom-Sheet Konsolidierung

#### 1. Beseitigung des störenden schwebenden Dropdown-Menüs
* **Fehlerbehebung:** Auf mobilen Displays (z. B. Smartphones im Hochformat) führte das vorherige Header-Submenu-Dropdown (`#headerSubmenu`) zu Überlappungen und Kollisionen mit dem Darstellungsbereich der Strings und Modulkarten (wie im Nutzerscreenshot ersichtlich).
* **Konsolidierung mit M3 Bottom Sheet:**
  - Das überflüssige, schwebende Dropdown wurde vollständig entfernt.
  - Der mobile Menü-Button (`#btnHeaderMenuToggle`) öffnet nun nahtlos und ergonomisch das bestehende native Material Design 3 Bottom Sheet (`openMoreSheet()`).
  - Alle Aktionen (Planungs-Manager, Projektdossier & PDF, Teilen/Handy-Übertragung, Vollbild-Schaltplan, Themes/Farben, Handbuch und Werkseinstellungen) sind darin zentral, großflächig und optimal mit dem Daumen erreichbar.

#### 2. Synchronisation der Versionsstände
* Vollständige Angleichung aller Projektdateien (`package.json`, `index.html`, `app.js`, `sw.js`, `DEVELOPMENT_GUIDELINES.md`, `content.js`, `CHANGELOG.md`) auf Release **7.9.0**.

---

## [Version 7.8.0] – 2026-09-08

### 📱 Header-Aufräumung & App-weite Mobile-First-Optimierung

#### 1. Schlanker, aufgeräumter Mobile-Header & Neues Untermenü (`index.html`, `app.js`)
* **Entfernung überflüssiger Branding-Texte:**
  - Das nicht mehr benötigte Label „Material Expressive“ wurde vollständig aus der Kopfleiste entfernt.
* **Ergonomische Trennung von Desktop- und Mobil-Aktionen:**
  - Auf Smartphones (unter 768 px) zeigt der Header jetzt nur noch die essenziellen Steuerelemente: Projektwechsel (`#btnHeaderProject`), Speichern (`#btnHeaderSaveMobile`) und ein neues mobiles Menü-Icon (`#btnHeaderMenuToggle`).
  - **Neues Header-Untermenü (`#headerSubmenu` & `#headerSubmenuBackdrop`):** Sekundäre Funktionen (Theme-/Design-Panel, PWA-Install, Handbuch, Reset auf Standard) öffnen sich in einem leichten, eleganten Dropdown-Menü direkt unter dem Header.
  - Desktop-Ansicht (ab 768 px) behält alle direkten Schnellzugriffs-Buttons vollständig bei.

#### 2. App-weites Responsiveness-Audit & Behebung von Layout-Overflows
* **Tab 'Strings' (`index.html`, `app.js`):**
  - Standortkarte: Auf Mobilgeräten kompakteres Icon und Kürzung von Langtexten (`truncate`), Button-Text „Ändern“ wird auf kleinen Displays platzsparend auf das Icon reduziert.
  - String-Karten: Dynamische Titelzeile nutzt `flex-wrap` und `min-w-0`, sodass lange Modul- oder Wechselrichternamen den „Konfigurieren“-Button nicht mehr aus dem Viewport drängen.
* **Tab 'Verkabelung' (`wiring.js`):**
  - Toolbar mit horizontalem Scrollen (`overflow-x-auto`, `scrollbar-none`, `shrink-0` für alle Aktionsbuttons) ausgestattet, um selbst auf schmalen 360 px Displays (z. B. auf der Baustelle) flüssig bedienbar zu bleiben.
  - String-Metrikzeile und Brücken-Statusboxen mit `flex-wrap` umbruchsicher gestaltet.
* **Tab 'Auswertung' (`index.html`):**
  - Sektion „Tagesgenaue Auflösung“: Titel und Monatswechsler `[ < Monat > ]` brechen auf Mobilgeräten nun sauber per `flex-col sm:flex-row` um, statt horizontal zu kollidieren.
* **M3 More Bottom Sheet (`#m3MoreSheet` in `index.html`):**
  - Schnelleinstellungen für Design & Farbschemata (`toggleThemePanel()`) sowie Werkseinstellungen/Reset (`clearLocalStorage()`) direkt im Bottom-Sheet ergänzt.
  - Mit `max-h-[88vh]` und `overflow-y-auto` abgesichert, sodass auch auf kleinsten Bildschirmen (z. B. iPhone SE) alle Einträge sauber erreichbar sind.

#### 3. Richtlinien-Erweiterung (`DEVELOPMENT_GUIDELINES.md`)
* Neuer verbindlicher Grundsatz **5. Mobile-First & Responsiveness-Standard** zur permanenten Sicherstellung von Overflow-Freiheit, Touch-Targets (mind. 40–44 px) und mobiler Scrollbarkeit bei allen künftigen Features.

---

## [Version 7.7.0] – 2026-09-08

### 🚀 Multi-Planungs- & Variantenverwaltung (Nahtloses Wechseln ohne Datenverlust)

#### 1. Multi-Projekt-Engine & Persistenz (`app.js`)
* **Parallele Planungsspeicherung im lokalen Browserspeicher (`pvpro_projects` & `pvpro_active_project_id`):**
  - Ermöglicht das Erstellen, Verwalten, Duplizieren und Löschen beliebig vieler unabhängiger PV-Planungen auf demselben Gerät.
  - Automatischer Schutz bestehender Planungsdaten: Vor jedem Wechsel zu einer anderen Planung wird der aktuelle Stand im Hintergrund verlustfrei gesichert (`saveCurrentProjectData(false)`).
  - Volle Abwärtskompatibilität: Beim ersten Start mit v7.7.0 wird der bestehende LocalStorage-Zustand automatisch als „Planung 1 (Standard)“ bzw. mit dem Standortnamen als erstes Projekt initialisiert (`initProjectManager()`).
* **Erweiterte Projekt-Aktionen:**
  - **Neue Planung anlegen (`createNewProject`):** Erstellt auf Wunsch eine frische Standardkonfiguration am aktuellen Standort oder ein komplett leeres Setup.
  - **Variante duplizieren (`duplicateProjectById` / `duplicateCurrentProject`):** Erzeugt eine 1:1 Kopie der aktuellen Planung für Was-wäre-wenn-Analysen (z.B. Vergleich von 10 kWp ohne Speicher vs. 15 kWp mit 10 kWh Speicher).
  - **Projekt umbenennen (`renameProject`):** Individuelle Namensvergabe (z.B. „Hausdach Süd“, „Variante Ost-West mit Gaube“, „Kunde Müller – Angebot A“).
  - **Projekt löschen (`deleteProject`):** Sicherheitsabfrage vor dem Löschen; Schutz der letzten verbleibenden Planung vor versehentlichem Entfernen.

#### 2. Material Design 3 Benutzeroberfläche & Schnell-Umschalter (`index.html`, `app.js`)
* **Header-Projektanzeige & Direktzugriff (`btnHeaderProject`):**
  - Integriertes Steuerelement in der App-Kopfleiste direkt neben dem App-Titel.
  - Zeigt den aktuellen Projektnamen (`#headerProjectName`) sowie ein Ordner-Icon und Dropdown-Symbol.
  - Klick öffnet unmittelbar das Verwaltungs-Modal.
* **M3 Bottom Sheet Schnellzugriff:**
  - Neue Schaltfläche „Planungen & Varianten verwalten (Multi-Projekt)“ im mobilen Aktionsmenü (`m3MoreSheet`).
* **Interaktives Verwaltungs-Modal (`#modal-project-manager`):**
  - **Tab 1: „Alle Planungen“ (Kartenansicht):**
    - Hervorhebung der aktiven Planung mit grünem Indikator-Badge und pulsierendem Aktiv-Punkt.
    - Schnelle Kennzahlen je Planung: Generatorleistung (kWp), Modulanzahl & String-Anzahl, Speicherkapazität (kWh), Standort und Zeitstempel der letzten Änderung.
    - Direkte Aktionsbuttons für Öffnen/Wechseln, Duplizieren, Umbenennen und Löschen.
  - **Tab 2: „Varianten-Vergleich“ (Side-by-Side Tabelle):**
    - Kompakte Matrix zum direkten Gegenüberstellen aller technischen Eckdaten unterschiedlicher Varianten.
    - Ein Klick auf „Öffnen“ lädt die gewünschte Variante sekundenschnell ohne Neuladen der Seite.

---

## [Version 7.6.0] – 2026-09-07

### 🎯 Dossier-Optimierung, Querformat-Visualisierung & Freie Modulfeldanordnung

#### 1. VDE-Dossier-Optimierung & Detaillierte Komponentenspezifikation (`dossier.js`, `index.html`)
* **Neue Fach-Sektion 2: „Verbaute Systemkomponenten & Technische Spezifikationen“:**
  - Normgerechte Dokumentation aller sicherheits- und leistungskritischen Kenngrößen nach **DIN EN 62446-1** und **DIN VDE 0100-712**:
    - **Solarmodule:** N-Type ABC Dual-Glass, 2.0 mm Doppelglas (Brandschutzklasse A), Wirkungsgrad $\ge 23,1\,\%$, Temperaturkoeffizient Pmax ($-0,26\,\%/^\circ\text{C}$), Umpp / Impp STC, mechanische Belastbarkeit (5400 Pa Schnee / 2400 Pa Wind), 25/30 Jahre Leistungsgarantie.
    - **Hybrid-Wechselrichter:** 3-phasig trafolos, MPP-Spannungsbereich (174 V – 800 V), max. DC-Eingangsspannung 1.000 V DC, Europ. Wirkungsgrad $\ge 97,9\,\%$, integrierter PV Point / Full Backup Notstrom, aktive Drehzahlkühlung, Schutzart IP66, WLAN/LAN/Modbus.
    - **Hochvolt-Batteriespeicher:** Lithium-Eisenphosphat (LiFePO4, kobaltfrei), 100 % nutzbare Entladetiefe (DoD), modulare Erweiterbarkeit, $\ge 6.000$ Zyklen, VDE-AR-E 2510-50 zertifiziert.
    - **DC-Leitungstechnik & Schutz:** Doppelt isolierte H1Z2Z2-K 6 mm² Solarkabel (DIN EN 50618), Stäubli MC4-Evo2 Steckverbinder (1500 V DC, IP68), 16 mm² Cu Potentialausgleich und geometrische Leiterschleifenminimierung via Leapfrog-Verfahren.
  - Optionale Steuerung in der Dossier-Kopfleiste über die neue Checkbox `[x] Komponenten`.
  - Kompakte Komponentenübersicht im 1-Seiten-Kurzreport zur schnellen Kunden- und Bauherrenvorlage.
* **Ganzseitiges Querformat (A4 Landscape) für den DC-Schaltplan (`wiringLandscape`):**
  - Dedizierte `@page landscape-section { size: A4 landscape; margin: 10mm; }` und Print-Klasse `.dossier-landscape-page`.
  - Schaltet den hochauflösenden SVG-Vektorplan bei Ausdruck und PDF-Export automatisch in ein vollformatiges A4-Querformat, wodurch auch breite Mehrfeld-Anlagen ohne Detailverlust oder Stauchung lesbar bleiben.
  - Interaktiver Umschalter `📐 Querformat Schaltplan` in der Dossier-Werkzeugleiste mit Live-Breitenanpassung der Vorschau (`max-w-6xl`).
* **Seitenumbruch-Optimierung:**
  - Tabellen und Fachsektionen sind mit `avoid-break` (`page-break-inside: avoid; break-inside: avoid;`) gegen störendes Durchtrennen im Druckbild abgesichert.

#### 2. Freie Modulfeldanordnung & Dynamische SVG-Geometrie (`wiring.js`)
* **Flexible Teilfeld-Platzierung:**
  - Zusätzliche Felder (Gauben, Nebendächer, Carports, Traufstreifen) können jetzt wahlweise **Rechts daneben**, **Unterhalb** oder **Frei versetzt** positioniert werden (`customFieldPositions`).
  - Feineinstellung jedes Teilfelds über Nudge-Pfeiltasten (◀ ▶ ▲ ▼) und Reset-Button direkt in der Modulfeld-Konfigurationskarte.
* **Dynamische Bounding-Box & ViewBox-Kalkulation:**
  - Der SVG-Schaltplan errechnet automatisch die minimale und maximale Ausdehnung (`minCanvasX`, `minCanvasY`, `maxCanvasX`, `maxCanvasY`) aller frei platzierten Module.
  - Vollständige Vermeidung von abgeschnittenen Modulrändern; automatische Ausrichtung der String-Einspeisepunkte (Minus- und Plus-Leitungen zum WR).
* **Flüssige Bézier-Kabelbrücken:**
  - Zwischenfeld-Verbindungskabel passen ihren Bézier-Steuerpfad automatisch an die relative Lage der Felder an (horizontale oder vertikale S-Kurvenführung).

#### 3. Erhöhte Zuverlässigkeit bei Cross-Device Sync & Sharing (`app.js`, `server.js`)
* **Prefix-Toleranz bei Transfer-Codes:**
  - Automatische Bereinigung und Normalisierung von Codes (akzeptiert `8RC6`, `pv-8rc6`, `PV-8RC6`).
* **Zweistufiges Caching:**
  - Synchrone Verfügbarkeit geteilter Konfigurationen über LocalStorage und In-Memory-Speicher garantiert sofortigen Abruf ohne Netzwerklatenz.

#### 4. Vollständige Versionssynchronisation
* Synchronisation aller Versionstags auf **7.6.0** in `package.json`, `index.html` (Title, og:title, `#app-header-version`, Script-Tags `?v=7.6.0`), `sw.js` (`pvpro-cache-v7.6.0`), `DEVELOPMENT_GUIDELINES.md`, `content.js` und `CHANGELOG.md`.

---

### 🎯 Vollbild-Schaltplan Fix & Spannungsabfall-Harmonisierung

#### 1. Behebung der Schwarz-Darstellung im Vollbild-Schaltplan (`wiring.js`)
* **Ursachen-Analyse des Fehlers:**
  - Im Vollbild-Renderprozess (`renderWiringFullscreenContent`) wurde beim Aktualisieren der schwebenden Metrikleiste (`#fs-floating-metrics`) auf die Eigenschaft `sCalc.deltaUPercent` zugegriffen: `${sCalc.deltaUPercent.toFixed(2)} %`.
  - Da die physikalische Berechnungsfunktion `calculateCablePhysics` den relativen Spannungsabfall als `deltaUPct` zurückgab, war `sCalc.deltaUPercent` `undefined`.
  - Der Aufruf `undefined.toFixed(2)` führte zu einer unbehandelten JavaScript-Ausnahme (`TypeError: Cannot read properties of undefined (reading 'toFixed')`), wodurch das Skript vor Erreichen der SVG-Injektion (`stage.innerHTML = svgContent`) abbrach.
  - Infolgedessen blieb der SVG-Container `#fs-stage` komplett leer (schwarzer Bildschirm), die schwebende Metrikleiste unvollständig und der Auto-Fit-Zoom auf 100 % eingefroren.
* **Lösung & Absicherung:**
  - **Namens-Harmonisierung in `calculateCablePhysics`:** Rückgabe des Alias `deltaUPercent: deltaUPct`, sodass beide Schreibweisen norm- und abwärtskompatibel zur Verfügung stehen.
  - **Defensiver Zugriff & Fallbacks:** Absicherung aller String- und Leitungsmetriken (`pTotalWp`, `vmpTotal`, `imp`, `totalCableLength`, `deltaUPct`/`deltaUPercent`) gegen `null` oder `undefined`.
  - **Globaler Try/Catch-Schutz:** Kapselung von `renderWiringFullscreenContent` und `fsFitToScreen` in fehlertolerante `try / catch`-Blöcke mit optischer Hinweisbox bei Renderfehlern.
  - **Objektverfügbarkeit:** Sichere Bindung von `wiringSettings` an den `window`-Scope.

#### 2. Synchronisation der Version 7.5.1
* Synchronisation aller Referenzen über `package.json`, `index.html` (Titel, OpenGraph, Kopfzeile `Pro 7.5.1`, Script-Tags `?v=7.5.1`), `sw.js` (Cache-Busting `pvpro-cache-v7.5.1`), `DEVELOPMENT_GUIDELINES.md`, `content.js` und `CHANGELOG.md`.

---

## [Version 7.5.0] – 2026-09-05

### 🎯 Vollbild-Schaltplan Zentrierung & Bereinigung der Hardware-Datenbank

#### 1. Beseitigung der Schwarz-Darstellung im Vollbild-Schaltplan (`wiring.js`)
* **Exakte Zentrierung via `translate(-50%, -50%)`:**
  - Ursache des schwarzen Bildschirms: Der absolute Container `#fs-stage` war ohne Centering-Offset platziert, wodurch die Skalierungstransformation (`scale(0.2x-0.4x)`) den 1200x700px SVG-Plan auf Smartphones weit außerhalb des sichtbaren Viewport-Bereichs verschoben hat.
  - Implementierung von `left: 50%; top: 50%; transform-origin: center center;` und `transform: translate(-50%, -50%) translate(...) scale(...) rotate(...)`.
* **Präzise Viewport-Geometrie (`getBoundingClientRect`):**
  - Umstellung von unzuverlässigen Fallback-Größen auf `viewport.getBoundingClientRect()`, wodurch die verfügbare Zeichenfläche auf mobilen Geräten unter Berücksichtigung von Safe-Areas und Navigationsleisten millimetergenau eingepasst wird.
* **Robuster Leer-Zustand (Empty-State):**
  - Falls ein String noch keine Module enthält, wird anstelle einer leeren schwarzen Fläche eine ansprechende Hinweiskarte angezeigt.
* **Priorisierter Modal-Z-Index:**
  - Das Vollbild-Modal läuft jetzt mit `z-[200]` über allen App-Headern und Navigationselementen.

#### 2. Vollständige Bereinigung der Hardware-Stammdaten (`database.js`, `app.js`, `dossier.js`)
* **Entfernung aller externen Schrott-Links und Muster-Dokumente:**
  - `MasterHardwareDocs` wurde komplett geleert; alle fehlerhaften oder ins Leere laufenden Drittanbieter-URLs wurden restlos entfernt.
  - Entfernung von unzuverlässigen Status-Badges und Modalen aus den Hardware-Karten im Tab „Datenbank“.
* **Fokus auf reale technische Gerätedaten:**
  - Saubere, übersichtliche Darstellung der physikalischen Kenndaten für Module (Voc, Vmp, Isc, Pmax), Wechselrichter (AC-Leistung, Startspannung, MPPT-Anzahl) und Batteriespeicher (Kapazität, Ladeleistung, Wirkungsgrad).
* **Fachgerechte Dossier-Ausgabe:**
  - Die Datenblatt- und Zertifikatsübersichten im Dossier verweisen nun professionell und prüffähig auf die beiliegenden Werksdatenblätter gemäß IEC 61215, EN 62109 und VDE-AR-N 4105.

#### 3. Konsistente Versionsführung in der Kopfzeile (`index.html`, `app.js`, `DEVELOPMENT_GUIDELINES.md`)
* **App-Header aktualisiert:**
  - Kopfzeile führt nun `Pro 7.5` synchron in HTML und Laufzeitinitialisierung (`app.js`).
* **Entwicklungsrichtlinien:**
  - Die Richtlinie zur synchronen Aktualisierung von `app-header-version` ist verbindlich in den Entwicklungs-Guidelines verankert.

---

## [Version 7.4.0] – 2026-09-05

### 🚀 Debugging & Optimierung: Mobile-Sync QR-Code & Vollbild-Schaltplan

#### 1. Behebung des Mobile-Sync Offline-Bugs (`app.js`, `qrcode.client.js`, `index.html`)
* **Autarke Client-seitige QR-Code-Engine:**
  - Bereitstellung und Einbindung von `qrcode.client.js` als Standalone-Client-Bundle.
  - Dadurch funktioniert die Vektor-QR-Code-Generierung nun 100% autark im Browser – selbst im Offline-Modus, bei instabiler Mobilfunkverbindung oder ohne Serverzugriff.
* **Verlässliche QR-Code- & Zahlencode-Anzeige:**
  - Der QR-Code und der 6-stellige Transfercode (z.B. `PV-8RC6` bzw. Prüfsummen-Code im autarken Modus) werden nun in jedem Fall angezeigt und ersetzen den reinen JSON-Fallback.
  - Nahtloser Direkttransfer via URL-Hash (`#config=...`) mit Unicode-sicherer Base64-Kodierung, der beim Scannen mit der nativen Smartphone-Kamera sofort die vollständige Planung lädt.
* **Server-Sync-Robustheit (`server.js`):**
  - Korrektur der URL-Generierung im `/api/share`-Endpunkt zur Berücksichtigung des Client-Origins (`window.location.origin`) und Reverse-Proxy-Headern (`x-forwarded-host`, `x-forwarded-proto`).

#### 2. Behebung der Schwarz-Darstellung im Vollbild-Schaltplan (`wiring.js`)
* **Explizite SVG-Dimensionierung:**
  - `generateStringWiringSvg` weist dem `<svg>` nun explizite `width`- und `height`-Attribute entsprechend der Canvas-Geometrie zu.
  - In `renderWiringFullscreenContent` werden explizite Pixelabmessungen auf dem SVG-Element und dem `#fs-stage`-Container gesetzt, wodurch ein 0x0-Kollabieren innerhalb der absoluten flexiblen Vollbildbühne verhindert wird.
* **Synchroner Bounding-Box-Fit (`fsFitToScreen`):**
  - `fsFitToScreen` berechnet den optimalen Skalierungsfaktor jetzt anhand der tatsächlichen geometrischen Bounding-Box (auch unter 90°-Drehung).
  - Beim Öffnen der Großansicht wird eine Doppel-Pass-Kalkulation (`requestAnimationFrame` + Timeout) ausgeführt, die sicherstellt, dass der Schaltplan sofort scharf, zentriert und vollständig sichtbar gerendert wird.

#### 3. Dynamische Versionsanzeige in der App-Kopfzeile & Guidelines (`index.html`, `app.js`, `DEVELOPMENT_GUIDELINES.md`)
* **Kopfzeilen-Synchronisation:**
  - Die Kopfzeile in `index.html` führt nun das Element `<span id="app-header-version">Pro 7.4</span>`, welches zusätzlich beim Start in `initDatabase()` dynamisch validiert wird.
* **Entwicklungs-Richtlinien:**
  - `DEVELOPMENT_GUIDELINES.md` wurde um eine explizite Anweisung ergänzt, bei jedem Versions-Bump stets auch die Kopfzeile der App (`#app-header-version`) synchron zu aktualisieren.

---

### 📑 Neu: Hardware-Dokumentenverwaltung & Modulare Dossier-Ausgabe

#### 1. Hardware-Dokumentenverwaltung (`database.js` & `app.js`)
* **Dokumenten-Zuordnung für Standard- & Benutzergeräte:**
  - Jedes Solarmodul, jeder Wechselrichter und jeder Batteriespeicher kann nun mit technischen Datenblättern und Zertifikaten (TÜV, VDE, CE, UN 38.3) verknüpft werden.
  - Vorkonfigurierter Master-Katalog (`MasterHardwareDocs`) mit verifizierten Original-Datenblättern und Konformitätserklärungen nach **VDE-AR-N 4105**, **IEC 61215/61730** und **VDE 2510-50**.
  - Lokale Dokumentenverwaltung (`HardwareDocManager` via `localStorage`) für benutzerdefinierte Hardware.
* **Erweitertes Formular für eigene Hardware (`index.html` & `app.js`):**
  - Beim Anlegen von Modulen, Wechselrichtern und Speichern im Tab „Datenbank“ können Dokumente direkt per URL oder lokalem Datei-Upload (PDF/Bild als Data-URL) angehängt werden inklusive Kategoriewahl (*Datenblatt*, *Zertifikat*, *Installationsanleitung*, *Garantiebedingungen*) und Normangabe.
* **Interaktive Dokumentenverwaltung in der Datenbank-Tabelle:**
  - Neue Dokumenten-Schaltfläche mit Badge (`📄`) an jeder Hardware-Zeile.
  - Modal zum Einsehen, Öffnen und Hinzufügen weiterer Dokumente für jedes Gerät.

#### 2. Modulare Dossier-Ausgabe & Konfigurationsfenster (`dossier.js`)
* **Auswahl des Report-Formats:**
  - **Kurz-Report (1–2 Seiten):** Prägnanter Anlagenpass mit Kern-Kennzahlen (kWp, Jahresertrag, Speicher, CO₂), String-Übersichtstabelle und kompakter Übergabeerklärung mit Unterschriftenfeldern für Errichter und Betreiber.
  - **Vollständiges Dossier (7–9 Seiten):** Lückenlose DIN VDE 0100-712 Fachdokumentation inklusive String-Verifikation, SVG-Schaltplan, transparenter Kabelberechnung, Stückliste und Wirtschaftlichkeit.
* **Granulare Haken-Optionen für Anhänge:**
  - **Mit / Ohne Datenblätter (`includeDataSheets`):** Bindet Anhang A mit detaillierten Herstellerspezifikationen, elektrischen Kennwerten (STC, Voc, Vmpp, Isc, Temperaturkoeffizienten) und Dokumenten-Direktlinks für alle in der Planung tatsächlich verwendeten Komponenten ein.
  - **Mit / Ohne Zertifikate (`includeCertificates`):** Bindet Anhang B mit amtlichen Konformitätsnachweisen ein (VDE-AR-N 4105 NA-Schutz-Einstellwerte, IEC 61215/61730 Bauartzulassungen, VDE 2510-50 Sicherheitsnachweise).
* **Live-Vorschau & Direktdruck:**
  - Alle Optionen aktualisieren die Druckvorschau im Dossier-Modal in Echtzeit und werden direkt in das fertige Druck-/PDF-Dokument übernommen.

---

## [Version 7.2.0] – 2026-09-05

### 🔍 Neu: Vollbild-Kabelvisualisierungs-Engine (Großansicht im gesamten Bildschirm)

#### 1. Dedizierte Vollbild-Bühne für Smartphone & Desktop (`wiring.js`)
* **Lösung für kompakte Mobil-Displays:** Die DC-Verkabelung kann nun mit einem einzigen Fingertipp („Großansicht / Vollbild“) über den gesamten Bildschirm (`100vw × 100dvh`) geöffnet werden.
* **Gestensteuerung nach nativer App-Manier:**
  - **Multi-Touch Pinch-to-Zoom:** Stufenloses Hinein- und Herauszoomen (von 15% bis 500%) mit zwei Fingern auf Touchscreens (iOS & Android).
  - **Flüssiges Drag & Pan:** Müheloses Verschieben des Modulfelds mit einem Finger oder mit gedrückter Maustaste.
  - **Mausrad-Zoom & Double-Tap to Fit:** Schnelles Zoomen am Desktop per Mausrad und sofortiges Zurücksetzen der Ansicht per Doppelklick / Doppeltipp.
* **90°-Rotationsmodus (Virtuelles Querformat):**
  - Aufrecht gehaltene Smartphones können breite Dächer oft nur stark verkleinert darstellen. Ein Fingertipp auf den Rotations-Button dreht den gesamten SVG-Plan um 90°, sodass die gesamte vertikale Bildschirmhöhe für das Dach genutzt wird – ohne die Telefonausrichtung oder Bildschirmsperre ändern zu müssen.
* **Auto-Fit-Algorithmus (`fsFitToScreen`):**
  - Berechnet anhand des Viewports und der SVG-ViewBox automatisch die ideale Skalierung für maximalen Zoom ohne Ränder.
* **Schwebende Mobile-HUD Daumen-Toolbar:**
  - Ergonomische Toolbar am unteren Bildschirmrand für bequeme Einhand-Bedienung auf dem Dach oder beim Kundengespräch: Zoom (-), Auto-Fit, 90°-Drehung, Zoom (+).
* **String-Schnellwechsler & Live-Statusanzeige:**
  - Direktes Umschalten zwischen allen Strings im Vollbildmodus.
  - Live-Metriken im Header und als Schwebefeld (Modulanzahl, Gesamtleistung in kWp, $U_{mpp}$, $I_{mpp}$, Gesamtkabellänge und Leitungsverlust).
* **Volle Interaktivität:** Module können auch in der vergrößerten Ansicht angeklickt und inspiziert werden.

---

## [Version 7.1.0] – 2026-09-05

### 🚀 Neu: Cross-Device Synchronisation (Desktop ➔ Smartphone per QR & Code)

#### 1. Cross-Device Transfer & Konfigurations-Sharing (`server.js` & `app.js`)
* **Nahtlose Geräte-Synchronisation:** Eine auf dem Desktop erstellte und gespeicherte Anlagenplanung kann jetzt sekundenschnell auf ein Smartphone oder Tablet übertragen werden – ohne Registrierungszwang oder Drittanbieter-Cloud.
* **Direkt-Transfer per QR-Code:** Ein Klick auf „Auf Handy / Teilen“ erzeugt einen scharfen, hochauflösenden Vektor-QR-Code. Ein einfacher Scan mit der Smartphone-Kamera (iOS/Android) öffnet die App und lädt sämtliche Strings, Dachflächen, Verbrauchsdaten, Speicher, Finanzen und DC-Verkabelungseinstellungen unmittelbar in den mobilen Speicher.
* **Kompakter 6-stelliger Transfer-Code (z.B. `PV-8RC6`):** Ermöglicht die manuelle Übernahme auf jedem beliebigen Gerät über ein Eingabefeld.
* **Vollständiger JSON-Import & Export:** Konfigurationen können lokal als `.json`-Datei gesichert, per E-Mail/Messenger geteilt oder per Drag & Drop wieder in die App eingespielt werden.
* **Offline-Fallback:** Unterstützt neben der Server-Schnittstelle auch komprimierte URL-Hash-Direktlinks (`#config=...`) für autarken Offline-Betrieb.

#### 2. Vollbild-Kabelvisualisierung für Smartphones & Desktops (`wiring.js`)
* **Interaktive Großansicht im Vollbild:** Löst das Problem kleiner Bildschirme auf Mobilgeräten. Ein Klick auf „Großansicht / Vollbild“ öffnet den DC-Schaltplan in einer flüssigen, randlosen Vollbild-Bühne (`100vw × 100vh`).
* **Flüssiges Pan & Pinch-to-Zoom:**
  - **Touchscreens (Smartphones & Tablets):** Intuitive 2-Finger-Pinch-Geste zum stufenlosen Zoomen sowie Ein-Finger-Wischgeste zum Verschieben.
  - **Desktop:** Stufenloser Mausrad-Zoom, Klick-and-Drag zum Verschieben und Tastatur-Shortcuts (Esc zum Schließen).
* **90°-Dreh-Funktion (Virtuelles Querformat):** Ermöglicht es, breite Dächer auf vertikal gehaltenen Smartphones mit einem Fingertipp um 90° zu rotieren und bildschirmfüllend darzustellen, ohne das Telefon physisch drehen oder die Bildschirmsperre lösen zu müssen.
* **Auto-Fit (Einpassen):** Berechnet die optimalen Skalierungsfaktoren für maximale Ausnutzung des Smartphone-Displays.
* **String-Schnellwechsler & Live-Metriken im Vollbild:** Schnelles Umschalten zwischen allen aktiven Strings direkt in der Großansicht inklusive Anzeige von kWp, $U_{mpp}$, $I_{mpp}$ und Leitungslänge.
* **Interaktivität bleibt erhalten:** Auch im Vollbildmodus können PV-Module zur manuellen Zuweisung oder Inspektion direkt angetippt werden.

---

## [Version 7.0.0] – 2026-09-05

### 🏆 Meilenstein-Release: Modulare Architektur, Normgerechtes VDE-Dossier & Best-Practice Refactoring

#### 1. Vollwertige PDF- & Druck-Dossier-Engine (`dossier.js`)
* **Kein simples Bildschirm-Abbild:** Die bisherige `window.print()`-Funktion wurde vollständig abgelöst. Statt eines unstrukturierten Dark-Mode-App-Snapshots wird nun ein normgerechtes, hochauflösendes PV-Auslegungs- & Installationsdossier nach **DIN VDE 0100-712** und **DIN EN 62305-3** erzeugt.
* **Strukturierte Fachdokumentation über 7 Kern-Sektionen:**
  1. **Anlagenpass & Executive Summary:** 6 Kern-KPIs (kWp-Generatorleistung, PVGIS-Jahresertrag in kWh/a & spezifisch, Wechselrichter-Spezifikation, Batteriespeicher, Leapfrog-Schutzstatus & CO₂-Vermeidung).
  2. **String-Konfiguration & Grenzprüfung:** Tabellarische Aufstellung aller Strings mit gradgenauem Azimut, Himmelsrichtung, Neigung, $U_{oc,-10^\circ\text{C}}$ vs. $U_{max}$, $U_{mp,+70^\circ\text{C}}$ vs. $U_{min}$, $I_{sc}$ vs. $I_{max}$ und Teilfeld-Geometrie für zerstückelte Dächer (Gauben/Flächen).
  3. **DC-Schaltplan & Leitungsführung:** Scharfer SVG-Vektor-Schaltplan mit Modulnummerierung, Polaritätskennzeichnung (+/-), Hindernissen (Dachfenster, Gauben, Kamine) und farbcodierter Leitungsführung.
  4. **VDE 0100-712 DC-Leitungs- & Verlustanalyse:** Detaillierte Berechnung aller Leitungsabschnitte (Weg A + Brücken + Modulkabel + Weg B inkl. 10% VDE-Reserve), Querschnitt (4, 6 oder 10 mm²), Schleifenwiderstand, Spannungsabfall $\Delta U$ (Volt & %) sowie Jahres-Verlustleistung in kWh und Euro.
  5. **Material-Stückliste (Bill of Materials):** Präzise Auflistung aller Montage- und Installationskomponenten mit Stück- und Meterangaben (Module, WR, Speicher, Solarkabel H1Z2Z2-K, MC4-EVO2 Stecker, 16 mm² Potentialausgleich, wetterfeste Kabelbinder).
  6. **Wirtschaftlichkeits- & Ertragsprognose:** 20-Jahres-Bilanz nach EEG & VDI 4655 mit Investitionskosten, jährlichen Stromkostenersparnissen, Amortisationszeitraum (Break-Even) und Stromgestehungskosten (LCOE in ct/kWh).
  7. **DIN VDE 0100-712 Prüf- & Inbetriebnahmeprotokoll:** Vollständige Checkliste für Erstprüfung und Übergabe (Sichtprüfung, Gestellpotentialausgleich, Polarität, $U_{oc}$- & $I_{sc}$-Messung, $R_{iso}$-Isolationsprüfung $\ge 1\,\text{M}\Omega$, SPD-Ableiter) inklusive offiziellem Errichter- und Betreiber-Unterschriftenblock.
* **Interaktives Dossier-Modal mit Druckvorschau & Live-Konfiguration:**
  - Konfigurierbare Projekt- und Kundendaten (Projekttitel, Betreibername, Fachbetrieb, Dokumentennummer und Datum).
  - Selektive Sektions-Toggles zur gezielten Zusammenstellung des Dossiers.
  - A4-optimierte Dokumentenvorschau mit druckfertiger Formatierung.
* **Dedizierter `@media print`-DOM:** Automatische Ausblendung sämtlicher App-Navigationen, Header, Scrollbalken und Schaltflächen beim Drucken. Saubere Vektorausgabe auf 100% reinweißem Hintergrund mit exakten Seitenumbrüchen (`page-break-after: always`).

#### 2. Modulare Architektur & Best-Practice Entflechtung
* **Aufteilung von `app.js` (von ~3.500 Zeilen auf 1.482 Zeilen):**
  - **`wiring.js` (2.033 Zeilen):** Vollständige Auslagerung der DC-Verkabelungs-Engine, des Leapfrog-Reißverschluss-Algorithmus, der Hindernis-Vermeidungslogik und der interaktiven Modul-Zuweisung.
  - **`dossier.js` (550 Zeilen):** Vollständige Auslagerung der Dokumenten- und PDF-Export-Engine nach DIN VDE 0100-712.
  - **`app.js` (1.482 Zeilen):** Konzentration auf Kern-Orchestrierung, reaktiven State, Physik-Prüfung, 8.760h PVGIS-Simulation und Finanz-/Lastprofilberechnung.
* **Keine Insellösungen (Single Source of Truth):**
  - `calculateCablePhysics` dient als zentrale Berechnungsfunktion sowohl für den interaktiven Verkabelungs-Tab als auch für das VDE-Dossier.
  - Vollständige Harmonisierung des Material Design 3 Expressive Systems mit Google Material Symbols Rounded (`.material-symbols-rounded`).

#### 3. Governance & Entwicklungs-Richtlinien
* **Primat der Guidelines:** In `DEVELOPMENT_GUIDELINES.md` und `AGENTS.md` ist fest verankert, dass die Entwicklungsrichtlinien vor JEDER Änderung zuerst gelesen werden müssen.
* **Strikte Release- & Versionierungspflicht:** Nach jeder funktionalen oder architektonischen Änderung muss zwingend eine neue Version angelegt und der `CHANGELOG.md` aktualisiert werden (neueste Version stets ganz oben).

---

## [Version 2.4.0] – 2026-09-05

### 🚀 Neu & Erweitert: Gradgenaue Ausrichtung (Azimut) & Hindernis-Visualisierung

#### 1. Gradgenaue manuelle Azimut-Eingabe (0° bis 360°)
- **Gradgenaues Nummernfeld:** Der String-Azimut ist nicht mehr auf grobe Dropdown-Optionen beschränkt. Über ein Präzisions-Eingabefeld (`<input type="number" min="0" max="360" step="1">`) kann jeder beliebige Winkel (z. B. 165° SSO oder 212° SSW) auf das Grad genau eingegeben werden.
- **Interaktiver Schieberegler (Slider):** Schnelle, flüssige Justierung von 0° bis 360° mit direktem Live-Feedback.
- **Winkel-Presets:** Schnellauswahl für die 10 gängigsten Himmelsrichtungen (Süd 180°, SSO 158°, SO 135°, Ost 90°, SSW 202°, SW 225°, West 270°, Nord 0°, NO 45°, NW 315°).
- **16-Sektoren-Kompass-Erkennung (`getCompassDirection`):** Automatische Berechnung und Anzeige der Windrose (z. B. SSO, WNW) sowie der exakten Winkelabweichung zu Optimal-Süd (0°).
- **Karten- und Titel-Synchronisation:** Der String-Kopf zeigt nun stets den exakten Winkel und die Himmelsrichtung an (z. B. `165° (SSO)`).
- **PVGIS- und Ertragssimulation:** Die physikalische Ertragssimulation (`generateSyntheticPVGISData`) nutzt direkt den gradgenauen Azimutwinkel für die trigonometrische Einstrahlungs- und Ertragsberechnung.

#### 2. Vollständige Visualisierung von Dachfenstern & Hindernissen
- **Fehlerbehebung SVG-Rendering:** Hindernisse (Dachfenster, Gauben, Schornsteine, Leerflächen) wurden im SVG-Schaltplan korrigiert und priorisiert dargestellt.
- **Automatische Modulaussparung & Raster-Reskalierung:**
  - PV-Module weichen belegten Hindernis-Zellen automatisch aus.
  - Das Modulfeld vergrößert seine Rasterdimensionen dynamisch, wenn Hindernisse platziert werden, sodass kein Modul verloren geht.
- **Detailgetreue SVG-Grafiken:**
  - 🪟 **Dachfenster (Velux):** Hochwertiger Glasrahmen mit Reflexion, Sprossenkreuz und Typenschild.
  - 🏠 **Gaube:** Schrägdach-Silhouette mit Stirnfenster und Kontrastrahmen.
  - 🧱 **Kamin / Schornstein:** Ziegelroter Korpus mit Schornsteinöffnung und Rußschacht.
  - 🚫 **Leerfläche / Aussparung:** Schattierte Sperrfläche für Lüfterziegel oder Schneefanggitter.
- **Interaktives Entfernen per Klick:** Jedes Hindernis auf dem Dach verfügt über ein integriertes Schnell-Lösch-Symbol mit Bestätigungsdialog.

#### 3. Eigenständige Dokumentationsdateien
- **`CHANGELOG.md`:** Eigenständige Versionshistorie mit den neuesten Änderungen stets zuoberst.
- **`HANDBUCH.md`:** Umfassendes Benutzer- und Technik-Handbuch mit sämtlichen Logiken, Normen (VDE 0100-712), Algorithmen (Leapfrog, Leitungsberechnung) und physikalischen Berechnungsgrundlagen.

---

## [Version 2.3.0] – 2026-09-04

### ⚡ Neu: Professionelle DC-Verkabelung, Leapfrog & VDE-Prüfung
- **Interaktiver Verkabelungsplan:** Grafischer 2D-SVG-Schaltplan mit Modulfeldern, DC-Hauptleitungen (Plus rot durchgezogen, Minus blau gestrichelt), Anschlussdosen und MC4-Steckern.
- **Leapfrog-Algorithmus (Überspringende Verkabelung):**
  - Reduktion der magnetischen Leiterschleife zur Minimierung induzierter Blitz-Überspannungen (VDE 0100-712).
  - Weg A (Hinweg über ungerade Module) und Weg B (Rückweg über gerade Module).
  - Keine separate lange DC-Minus-Rückleitung entlang des Modulfelds mehr erforderlich.
- **Mehrfeld-Topologie & Trassen-Brücken:**
  - Automatische Brückenführung zwischen getrennten Feldern (z. B. Hauptdach und Gaube).
  - Einstellbare Brückenlängen mit Klick-Bearbeitung direkt im SVG.
- **Interaktiver Absteck-Modus:** Manuelle Definition der Steckreihenfolge per Klick auf die Module im Schaltplan.
- **VDE 0100-712 DC-Leitungsrechner:**
  - Spezifischer Widerstand für Elektrolytkupfer unter Berücksichtigung des Temperaturkoeffizienten (25°C vs. 50°C Dachbetrieb).
  - Spannungsabfall $\Delta U$ in Volt und Prozent mit Warnstufen ($<1\%$ grün, $1-1{,}5\%$ gelb, $>1{,}5\%$ rot).
  - Verlustleistung in Watt und jährlicher Energieverlust in kWh.
  - Stückliste für MC4-Steckerpaare und UV-beständige Solar-Kabelbinder.

---

## [Version 2.2.0] – 2026-09-02

### ☀️ Neu: 8760h Jahressimulation & Lastprofile
- **Stundengenaue Jahressimulation (8.760 Zeitschritte):**
  - Integrierte Solarstrahlungs- und Ertragssynthese auf Basis von PVGIS-Modellen.
  - Saisonaler Sonnenstandsverlauf, Azimut- und Neigungswinkelkorrektur.
- **Dynamische Lastprofile:**
  - Haushalts-Grundlast mit jahreszeitlicher und tageszeitlicher Modulation.
  - Wärmepumpe (WP) mit Heizgradtagen-Steuerung und Warmwasserbereitung (BWWP).
  - Elektrofahrzeug (EV) mit PV-Überschussladung oder Standard-Ladezeiten.
  - IT- und Dauerlasten.
- **Batteriespeicher-Simulation:**
  - Stündliche Lade- und Entladebilanz mit Systemwirkungsgrad und Kapazitätsgrenzen.
  - Autarkiegrad- und Eigenverbrauchs-Ermittlung.

---

## [Version 2.1.0] – 2026-08-28

### 📈 Wirtschaftlichkeit & Investitionskostenrechner
- **Detaillierte Investitionskostenerfassung:**
  - Modulpreise, Unterkonstruktion, Wechselrichter, Speicher, Smart Meter.
  - DC- und AC-Montagematerial, Gerüstbau, Elektriker-Abnahme und Nebenkosten.
- **Cashflow- & ROI-Rechner:**
  - Amortisationszeit (Break-Even in Jahren).
  - Kumulierter Nettoertrag über 20 Jahre unter Berücksichtigung von Strompreissteigerung und Moduldegradation.
  - Eigenverbrauchsersparnis vs. Einspeisevergütung nach EEG.

---

## [Version 2.0.0] – 2026-08-20

### 🔬 Physikalische Stringauslegung & Wechselrichter-Prüfung
- **STC- und NOCT-Modulkenndaten:** $P_{\max}$, $V_{\text{oc}}$, $V_{\text{mp}}$, $I_{\text{sc}}$, $I_{\text{mp}}$.
- **Temperaturkorrektur:**
  - Kälte-Spannung bei $-10^\circ\text{C}$ (Prüfung gegen max. DC-Eingangsspannung $V_{\max}$).
  - Hitze-MPP-Spannung bei $+70^\circ\text{C}$ (Prüfung gegen min. MPP-Spannung $V_{\text{mpp,min}}$).
- **Wechselrichter-MPPT-Tracking:**
  - Prüfung von Kurzschlussstrom $I_{\text{sc}}$ und Betriebsstrom $I_{\text{dc,max}}$ je Tracker.
  - Mismatch-Berechnung bei heterogenen String-Feldern mit unterschiedlichen Dachneigungen.

---

## [Version 1.0.0] – 2026-08-10

### 🏁 Initiales Release
- Grundlegende Modul- und Wechselrichterdatenbank.
- Basis-String-Konfigurator mit grafischer Ampelanzeige (Grün/Gelb/Rot).
- Standard-Dachflächen und manuelle Auslegung.
