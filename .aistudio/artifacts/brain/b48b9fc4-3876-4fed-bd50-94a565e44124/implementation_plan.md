# Implementierungsplan: Komplettes Dashboard-First Redesign & Live-Analyse (Version 8.4)

## 1. Zielsetzung & UX-Neuausrichtung („Dashboard First“)

Die App wird von einer komplexen Planungs-Oberfläche zu einer **schnellen, aufgeräumten und mobil-optimierten Energie- & Analyse-App** umgebaut, die sich optisch eng an deinen beiden Referenz-Screenshots orientiert (weiche Pastell-Oberflächen mit feinen Farb-Tints im Light-Mode, tiefes Petrol-Schiefergrau mit leuchtenden Akzenträndern im Dark-Mode):

1. **Sofortiger Start auf dem Live-Dashboard (`Solar & Netz · live`)**:
   - Beim Öffnen der App landet man direkt auf dem **Start-Dashboard**, um in Sekundenbruchteilen den aktuellen Anlagenstatus zu prüfen.
   - Keine überladenen Formulare oder Planungs-Tabellen auf der Startseite – alles Weitere ist logisch in tiefere Ebenen gegliedert (**Dashboard → Analyse → Planung & Konfiguration → Einstellungen**).

2. **Schwebende, handytaugliche Bottom-Navigation (Floating Pill Bar)**:
   - Eine kompakte, schwebende Pill-Leiste am unteren Bildschirmrand (perfekt erreichbar mit dem Daumen auf jedem Smartphone ab 360px Breite):
     - **Live-Dashboard** (Blitz-/Energie-Icon, Startansicht mit Live-Status & Tageskurven)
     - **Analyse & Soll-Ist** (Diagramm-/Performance-Icon für Monatsvergleich vs. PVGIS, Autarkie & Amortisation)
     - **Menü / Weitere Ebenen** (Kompaktes Drawer-/Sheet-Menü für **PV-Planung & Strings**, **Hardware-Datenbank**, **Handbuch**, **PDF-Dossier** und **Home-Assistant-Einstellungen**)
     - **Theme-Schalter** (Mond/Sonne-Icon für direkten Wechsel zwischen dem hellen Mint-Pastell-Look und dem dunklen Petrol-Dashboard-Look)

---

## 2. Design & Aufbau des neuen Start-Dashboards

### A. Sektion 1: „Energie · jetzt“ (2x2 Live-Status-Kacheln)
Große, abgerundete Hauptkarte (`rounded-3xl`) mit den vier wichtigsten Echtzeit-Metriken im **2x2 Raster** – jeweils mit eigenem Pastell-/Glow-Farbton, klarer Typografie, Status-Untertitel und dynamischem Fortschrittsbalken am unteren Kachelrand:
1. **PV gesamt · DC** (Mint/Türkis): Aktuelle Gesamtleistung (`W` / `kW`), Status (z. B. *„Erzeugung läuft“* oder *„Nacht / Standby“*) und Auslastungsbalken relativ zur Anlagen-kWp.
2. **Hausverbrauch · AC** (Warm-Amber/Orange): Aktueller Hausverbrauch (`W` / `kW`), Status (*„Aktueller Hausverbrauch“*) und Lastbalken.
3. **Batteriespeicher** (Lavendel/Violett, Name frei anpassbar z. B. *„BYD HVS+“*): Ladezustand in `%`, Status (*„Lädt mit … W“*, *„Entlädt“* oder *„Ruhe / Standby“*) und SoC-Fortschrittsbalken.
4. **Netz · Bezug / Einspeisung** (Blau/Cyan): Aktueller Netzfluss (`W` / `kW`), automatischer Statuswechsel zwischen *„Bezug aus dem Netz“* und *„Einspeisung ins Netz“* samt Richtungsbalken.

### B. Sektion 2: „Aktive Verbraucher“ (Frei konfigurierbare Einzelverbraucher)
Direkt unter dem 2x2-Grid werden die **größten aktiven Einzelverbraucher** in schlanken, abgerundeten Zeilenkarten (`rounded-2xl`) absteigend nach aktueller Leistung (`W`) aufgelistet (z. B. *Trockner 429 W*, *Wärmepumpe*, *Wallbox*, *TV-Verstärker 76 W*, *Küche Licht 36 W*):
- **Frei konfigurierbar**: Du kannst beliebig viele eigene Home-Assistant-Sensoren (`sensor.*` in W oder kW) mit eigenem Anzeigenamen hinzufügen, bearbeiten oder löschen.
- Inaktive Verbraucher (`0 W`) können wahlweise ausgeblendet oder dezent am Ende gruppiert werden; fehlende Sensoren werden sauber im Fußtext vermerkt (*„Größte aktive Einzelverbraucher · X Messwert(e) nicht verfügbar“*).

### C. Sektion 3: Interaktives Tagesdiagramm & „Kurven auswählen · aktuelle Messwerte“
Inspiriert von deinem zweiten Screenshot erhält das Dashboard eine interaktive **Tagesverlauf-Karte (00:00 Uhr bis jetzt)**:
- **Automatischer Home-Assistant-Verlauf (`/api/ha/history`)**: Das Backend lädt automatisch die echte Tageshistorie (`00:00` bis aktuelle Uhrzeit) deiner konfigurierten Leistungs- und Batterie-Entitäten aus Home Assistant (und zeichnet Live-Werte zusätzlich lokal mit).
- **Dual-Achsen-Kurvendiagramm**:
  - Linke Achse: Leistung in `W` (für Strings, Wechselrichter, PV gesamt, Hausverbrauch, Netz).
  - Rechte Achse: Ladezustand in `%` (für die Batterie-Kurve).
  - Oben farbige Legenden-Chips + Refresh-Button (`↻`) + Hover-/Touch-Zeitpunkt-Inspektor.
- **Interaktive Auswahl-Kacheln („Kurven auswählen · aktuelle Messwerte“)**:
  - Unter dem Diagramm liegt ein 2-spaltiges Grid mit Kacheln für deine **frei definierbaren PV-Strings / Teilanlagen** (z. B. *Fronius · String 1 DC*, *Fronius · String 2 DC*, *Hoymiles · gesamt DC*) sowie *PV gesamt · DC*, *Hausverbrauch · AC*, *Netzbezug* und *Batterie · Ladezustand*.
  - **Klick/Tap auf eine Kachel** schaltet die jeweilige Kurve im Diagramm aktiv/inaktiv (mit farbig leuchtendem Rahmen in der Kurvenfarbe).
  - Jede Kachel zeigt sowohl den **aktuellen Live-Messwert (`W` / `%`)** als auch die **über den erfassten Zeitraum integrierte Tagesenergie (`kWh · erfasster Zeitraum` bzw. `≈ kWh · aus Leistung`)**.

---

## 3. Tiefere Ebenen (Drill-Down-Struktur)

Damit die App übersichtlich bleibt, sind alle weiterführenden Funktionen klar getrennt über die untere Navigationsleiste erreichbar:

1. **Ebene 1: Live-Dashboard (`Solar & Netz · live`)**
   - `Energie · jetzt` (2x2 Hauptkacheln)
   - `Aktive Verbraucher` (Einzelverbraucher-Liste)
   - `Tagesverlauf & Kurven auswählen` (Interaktives Intraday-Chart + String-/Quellen-Kacheln)
2. **Ebene 2: Tiefen-Analyse (`Soll vs. Ist & Finanzen`)**
   - **Soll-Ist-Vergleich**: Monatlicher realer Ertrag vs. PVGIS-8.760h-Prognose (Balken-/Liniendiagramm + Performance-Index in `%`).
   - **Autarkie, Eigenverbrauch & Batterie-Effizienz**: Auswertung von Direktverbrauch, Speicher-Vollzyklen und Speicherwirkungsgrad.
   - **Reale Amortisation & Euro-Ersparnis**: Kumulierte Ersparnis + Einspeisevergütung gegen reale Investitionskosten inkl. Break-Even-Prognose.
   - **Monatswerte-Pflege**: Schnelle Übernahme aus Home Assistant oder manuelle Korrektur.
3. **Ebene 3: Planung & Auslegung (`PV-Konfiguration`)**
   - Kompakte Unter-Tabs für **Anlagen-Setup & Wirtschaftlichkeit**, **Strings & VDE-Verkabelung** sowie **Hardware-Datenbank** – nur sichtbar, wenn man gezielt an der Auslegung arbeitet.
4. **Ebene 4: Einstellungen & Sensoren (`Home Assistant & App-Setup`)**
   - Übersichtlicher Verbindungs- & Entitäten-Konfigurator:
     - **Haupt-Entitäten**: PV Gesamt, Hausverbrauch, Batterie SoC/Leistung, Netzbezug/Einspeisung.
     - **Eigene PV-Strings / Erzeuger**: Beliebig viele Strings oder Mikrowechselrichter mit Name, Entität (`sensor.*`) und Kurvenfarbe anlegen.
     - **Eigene Einzelverbraucher**: Beliebig viele Haushaltsgeräte/Lichtkreise mit Name und Entität (`sensor.*`) anlegen.

---

## 4. Technische Umsetzung & Datei-Architektur (Version 8.4)

- **`server.js`**:
  - Erweiterung der Home-Assistant-Schnittstelle um `GET /api/ha/history`: Abruf von `/api/history/period/<start_of_day>` aus Home Assistant, intelligente Glättung/Downsampling auf saubere Zeitreihen-Punkte und automatische Berechnung der Tagesarbeit (`kWh`) per Trapez-Integration über die Leistungskurve, falls kein separater kWh-Sensor angegeben ist.
  - Speicherung der erweiterten Sensor-Konfiguration (frei definierbare `strings[]` und `consumers[]`) in `/data/ha_config.json`.
- **`telemetry.js`**:
  - Neues Rendering für das **Start-Dashboard (`Solar & Netz · live`)**, die **Einzelverbraucher-Liste**, das **interaktive Dual-Achsen-Tagesdiagramm** mit umschaltbaren Kurven-Kacheln sowie den erweiterten **Sensor-Editor** für eigene Strings und Verbraucher.
  - Getrennte Ansicht für die **Monats- & Langzeitanalyse** (Soll-Ist vs. PVGIS, Autarkie, Amortisation).
- **`index.html` & `app.js`**:
  - Komplettes Redesign der App-Shell im Stil der Referenz-Screenshots (Light-Mode mit sanftem Mint-/Pastell-Hintergrund und weißen `rounded-3xl` Cards; Dark-Mode mit tiefem Petrol-Slate `#0f191e` / `#132026` und farbigen Glow-Rahmen).
  - Neue schwebende **Floating Bottom Pill Navigation** + kompaktes Ebenen-Menü für Smartphone und Desktop.
- **Versionierung (8.3 → 8.4)**:
  - Synchrones Versions-Update auf **8.4** in `package.json`, `index.html`, `app.js`, `sw.js`, `content.js`, `DEVELOPMENT_GUIDELINES.md` und `CHANGELOG.md` (neuester Eintrag ganz oben).
