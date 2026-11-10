# Implementierungsplan – Version 9.0: Geführter Planungs-Assistent mit animierter Navigations-Pill, Token-sicherer GitHub-Sync, Flackerfreie Charts & Konsistentes Liquid-Glass-Design

## 1. Visuelle & Interaktive Korrekturen im Live-Dashboard & Tagesverlauf

### 1.1 Korrektur der Kanal-Kacheln im Hell- & Dunkelmodus (`renderIntradayCurveSection`)
* **Ursache des Fehlers im Screenshot:** Die kompakten 3-Spalten-Kanal-Kacheln unter dem Tagesdiagramm nutzten einen hartcodierten dunklen Verlauf (`rgba(15, 23, 42, 0.88)`), der im Hell-Modus als dunkler Schattenfleck unter schwarzer Schrift erschien. Zudem waren abgewählte Kacheln mit `opacity: 0.38` im Hell-Modus kaum noch lesbar.
* **Lösung:**
  - **Hell-Modus (`!isDark`):** Helle, kristallklare Liquid-Glass-Kacheln (`rgba(255, 255, 255, 0.88)` mit feiner Farbtönung der jeweiligen Kurvenfarbe bei aktiven Kanälen und sauberem Kontrast `text-slate-900`).
  - **Dunkel-Modus (`isDark`):** Tiefes transluzentes Slate-Glas mit farbigem Leuchtrand bei aktiven Kanälen.
  - **Inaktive Kacheln:** Dezent gedämpft (`opacity: 0.72` statt `0.38`) mit klar lesbarer Schrift, damit man ausgeschaltete Kanäle jederzeit mühelos erkennt und wieder aktivieren kann.

### 1.2 Flackerfreie Diagramm-Aktualisierung (`update('none')` statt `destroy()`)
* **Ursache des Flackerns:** Bei jedem 10-Sekunden-Live-Poll wurde `intradayChartInstance.destroy()` aufgerufen und das Canvas komplett neu initialisiert.
* **Lösung:**
  - Ist die Chart.js-Instanz (`intradayChartInstance` bzw. `intradayFullscreenChartInstance`) bereits auf dem Canvas aktiv, werden `chart.data.labels`, `chart.data.datasets` sowie die Achsen-Skalierung **in-place aktualisiert** und mit `chart.update('none')` ohne Neuaufbau und ohne Animations-Flackern gerendert.
  - Ebenso werden die Kanal-Kacheln unter dem Diagramm bei laufendem Touch-/Maus-Scrubbing nicht neu aufgebaut.

### 1.3 Top-5 Aktive Verbraucher mit Aufklapp-Funktion (`#dash_active_consumers_list`)
* Im Start-Dashboard werden alle Einzelverbraucher absteigend nach ihrer aktuellen Leistung (`W`) sortiert und standardmäßig **nur die Top 5** angezeigt.
* Sind mehr als 5 Verbraucher konfiguriert, erscheint direkt darunter ein kompakter Umschalter **`Alle X Verbraucher anzeigen ▾`** / **`Auf Top 5 reduzieren ▴`**.

### 1.4 Smartphone Zurück-Wischgeste von Ebene 2 auf Ebene 1 (`History API`)
* Beim Öffnen jeder Detailansicht auf **Ebene 2** (`openSectionDetail`, `openLiveCurveFocus`, `openAnalyseDrillDown`, `openPlanungDrillDown`) sowie beim Öffnen des Vollbild-Diagramms wird ein Browser-History-Eintrag (`history.pushState({ pvproLevel: 2, tab, detail }, '')`) gesetzt.
* Ein globaler `popstate`-Listener fängt die **Zurück-Wischgeste** am Smartphone (Android / iOS) ab und navigiert sauber zurück auf **Ebene 1** des jeweiligen Bereichs, statt die App zu verlassen.

---

## 2. Token-sicheres Zentrales Speichern (GitHub / `database.js`) & Persistenter PVGIS-Cache

### 2.1 Warum das Speichern auf anderen Geräten bisher fehlschlug & Neues Sicherheitskonzept
* **Ja, dein Konzept macht zu 100 % Sinn – sowohl technisch als auch für die Sicherheit!**
* **So funktioniert die neue zentrale Projekt- & Sensor-Persistenz:**
  1. **Was im Projekt (`SYSTEM_PLANS` in `database.js` / GitHub) gespeichert wird:**
     - Alle Planungsdaten (Standort, Hardware-Pool, Strings, Verkabelung, Verbrauch, Investitionskosten, Finanzparameter).
     - **Alle Home-Assistant-Einstellungen & Sensor-Entitäten (`haConfigSanitized`):** Domain-URL (`https://home.mb10.org`), Poll-Intervall, Speichername, alle System-Sensoren, alle angelegten PV-Strings (`entity_id` + Name), alle Einzelverbraucher (`entity_id` + Name) und alle `kWh Total`-Zähler.
     - **Strikter Token-Schutz (`haToken: ""`):** Der persönliche *Long-Lived Access Token* wird **niemals** in `database.js`, in GitHub oder in geteilten Projektdateien gespeichert.
     - **Gespeicherte 8.760h PVGIS-Ergebnisse (`cachedSimulation`):** Die berechneten Monats- und Jahreserträge werden direkt im Projekt mitgespeichert.
  2. **Was beim Abrufen auf einem zweiten Gerät passiert:**
     - Das zweite Gerät lädt über GitHub Pages automatisch die in `database.js` gespeicherten Projekte inkl. aller Sensor-Entitäten und PVGIS-Erträge.
     - Da auf dem neuen Gerät noch kein eigener Token im lokalen Browser-Tresor (`localStorage`) liegt, zeigt das Live-Dashboard einen klaren Hinweis-Banner: **„Sensoren & Konfiguration geladen – bitte eigenen Long-Lived Token für dieses Gerät hinterlegen“** mit 1-Klick-Button ins Token-Feld. Sobald der Token eingegeben ist, laufen sofort alle Sensoren, Strings, Verbraucher und das Sankey-Diagramm!
  3. **Ein einziges zentrales Modal „Projekte & GitHub-Sync“ (`#modal-project-manager`):**
     - Fasst die bisherigen 3 verstreuten Speicher-Dialoge an **einem zentralen Ort** zusammen (erreichbar oben über den Projekt-Button in der Kopfzeile und im Menü):
       - **Projekt wechseln / Neue Variante anlegen / Vergleichen**
       - **Fest für GitHub speichern (`server.js` schreibt direkt in `database.js` + 1-Klick `database.js`-Download für manuelles GitHub-Commit auf statischen Seiten)**
       - **Backup-Datei (JSON) & QR-Transfer**

### 2.2 PVGIS-Daten dauerhaft speichern & CORS-Fallback für GitHub Pages
* **Einmal geladen = dauerhaft gespeichert:**
  - Sobald für einen Standort und eine Dachneigung/Ausrichtung 8.760h-Strahlungsdaten geladen wurden, werden diese dauerhaft im Browser (`pvpro_pvgis_hourly_cache_v1`) sowie als fertiges Simulationsergebnis direkt im Projekt gespeichert.
  - Solange sich Standort, Neigung oder Modulanzahl nicht ändern, ist **kein erneuter PVGIS-Abruf nötig**; ein Badge zeigt `PVGIS gespeichert ✓` (mit optionalem Button `Neu abrufen`).
* **Browser-Direkt-Abruf für GitHub Pages:**
  - Wenn auf GitHub Pages kein lokaler Node-Proxy (`/api/pvgis/seriescalc`) läuft, nutzt die App automatisch eine mehrstufige CORS-Kaskade inkl. historischer Strahlungsdaten (`archive-api.open-meteo.com`) und kalibriertem 8.760h-Strahlungsmodell, sodass die Berechnung immer verzögerungsfrei durchläuft.

---

## 3. Geführter 6-Schritte-Planungs-Assistent & Animierte Navigations-Pill

### 3.1 Neue logische Reihenfolge im Tab „Planung“ (Schritt 1 bis 6)
Damit man bei einer Anlagenplanung logisch von Anfang bis Ende vorgeht, wird die Reihenfolge neu geordnet (zuerst Standort & Geräte-Pool wählen, dann Strings verschalten):

1. **Schritt 1 · Standort & Hardware-Pool:** Projekt-Standort (PVGIS) festlegen + Wechselrichter, Solarmodule und Batteriespeicher in den Projekt-Pool aufnehmen.
2. **Schritt 2 · Dach-Strings & MPPT-Belegung:** Dachflächen, Ausrichtung, Neigung und Modulanzahl je String definieren und Wechselrichter zuordnen.
3. **Schritt 3 · DC-Verkabelung & VDE 0100-712:** Grafische Modulfeld-Anordnung, Leap-Frog-Verlegung, Kabellängen und Spannungsfall prüfen.
4. **Schritt 4 · Verbrauch, Wärmepumpe & E-Auto:** Haushalts-Grundlast, Wärmepumpe, Brauchwasser-WP, Klimaanlage und Wallbox konfigurieren.
5. **Schritt 5 · Investition, Stromtarife & EEG:** Anschaffungskosten (inkl. Zusatzpositionen), Strombezugspreis und EEG-Vergütung an einem Ort pflegen.
6. **Schritt 6 · 8.760h Simulation, Ergebnis & VDE-Dossier:** Komplette Jahres-Auswertung (Autarkie, Cashflow, Monats-Charts, Steuer/§14a EnWG) und Druck des offiziellen DIN VDE 0100-712 PDF-Dossiers.

### 3.2 Animierte Bottom-Navigation-Pill mit äußeren Vor-/Zurück-Buttons
* Sobald man im Tab **Planung** in den geführten Assistenten (Ebene 2, Schritte 1–6) einsteigt, **morpht die untere schwebende Navigations-Pill (`#floatingBottomNavPill`)**:
  - Die 4 Haupt-Buttons (`Live`, `Analyse`, `Planung`, `Menü`) rücken sanft in der Mitte zusammen (`transition-all duration-300 ease-out`).
  - **Ganz außen links** fährt animiert der runde Button **`←` (Schritt zurück)** aus.
  - **Ganz außen rechts** fährt animiert der hervorgehobene Button **`Weiter →` (inkl. Schritt-Anzeige z. B. `2/6`)** aus.
* Zusätzlich zeigt eine kompakte **6-Schritte-Fortschrittsleiste** am oberen Rand des Planungs-Assistenten den aktuellen Schritt und erlaubt auch den direkten Sprung zu jedem Schritt.

---

## 4. Entschlacktes 4-Punkte-Menü & Durchgängiges Liquid-Glass-Design

### 4.1 Aufgeräumtes Menü (`#m3MoreSheet`) mit genau 4 zentralen Kacheln
Alle doppelten Sprungmarken im unteren Menü werden entfernt. Es bleiben exakt **4 klare Hauptkacheln**:
1. **Design & Erscheinungsbild:** Umschalter für Liquid-Glass Hell- und Dunkel-Modus.
2. **Home Assistant & Sensoren:** Verbindung, Token, Komfort-Sensor-Picker & Reverse-Proxy-Anleitung.
3. **Projekte & GitHub-Sync:** Zentrales Speichern/Laden (inkl. Sensor-Entitäten ohne Token), Varianten-Vergleich & Backup.
4. **VDE-Projektdossier (PDF) & Handbuch:** Direktzugriff auf den DIN VDE 0100-712 PDF-Generator sowie Formeln, Normen & Changelog.

### 4.2 Konsistentes Liquid-Glass-Design in allen Planungs- & Analyse-Ansichten
* Alle älteren Karten in den Bereichen **Hardware-Pool**, **Strings**, **Verbrauch**, **Investition**, **Finanzen**, **Übersicht** und **Auswertung** erhalten das einheitliche `dash-main-card` Liquid-Glass-Styling mit stimmigen Kontrasten in Light- und Dark-Mode.

---

## 5. Versionierung & Dokumentation (Version 9.0)
* Inkrementierung der Versionsnummer um `0.1` von **`8.9` auf `9.0`** synchron in `package.json`, `index.html`, `app.js`, `telemetry.js`, `sw.js`, `DEVELOPMENT_GUIDELINES.md`, `content.js` und `CHANGELOG.md` (neuester Eintrag ganz oben).
