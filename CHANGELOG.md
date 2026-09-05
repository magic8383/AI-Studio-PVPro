# Changelog – PV-Auslegungs- & Simulations-App (PV Pro Studio)

Alle relevanten Änderungen, Neuerungen und Korrekturen werden in dieser Datei chronologisch dokumentiert. **Neueste Einträge stehen stets ganz oben.**

---

## [Version 7.3.0] – 2026-09-05

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
