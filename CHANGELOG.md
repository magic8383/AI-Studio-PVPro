# Changelog – PV-Auslegungs- & Simulations-App (PV Pro Studio)

Alle relevanten Änderungen, Neuerungen und Korrekturen werden in dieser Datei chronologisch dokumentiert. **Neueste Einträge stehen stets ganz oben.**

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
