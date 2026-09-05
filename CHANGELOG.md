# Changelog – PV-Auslegungs- & Simulations-App (PV Pro Studio)

Alle relevanten Änderungen, Neuerungen und Korrekturen werden in dieser Datei chronologisch dokumentiert. **Neueste Einträge stehen stets ganz oben.**

---

## [Version 7.5.1] – 2026-09-05

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
