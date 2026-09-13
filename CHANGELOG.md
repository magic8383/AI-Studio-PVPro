# Changelog – PV-Auslegungs- & Simulations-App (PV Pro Studio)

Alle relevanten Änderungen, Neuerungen und Korrekturen werden in dieser Datei chronologisch dokumentiert. **Neueste Einträge stehen stets ganz oben.**

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
