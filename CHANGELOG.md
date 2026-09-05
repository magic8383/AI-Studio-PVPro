# Changelog — PV-Planung Pro

Alle wichtigen Änderungen, Neuerungen und physikalischen Modulerweiterungen von **PV-Planung Pro** in chronologisch absteigender Reihenfolge (neueste Versionen immer ganz oben).

---

## [v6.18.0] - 2026-09-05

### Neu: Modulfelder, Dachaufbau & Kabelwege-Kalkulator im Reiter Verkabelung
* **Modulfelder & Zerstückelte Dächer im Verkabelungs-Tab**:
  * Direkte Bearbeitung aller zum String gehörenden Modulfelder (z. B. Hauptdach, Gaubenflächen, Fensterumrandungen, Zwerchgiebel).
  * Konfiguration von Spalten (Breite), Reihen (Höhe), Modulanzahl, Neigung (Tilt) und Modulmodell direkt in der Feldkarte des Verkabelungs-Tabs.
  * Dynamisches Hinzufügen weiterer Teilfelder (`addFieldInWiring`) sowie Entfernen nicht mehr benötigter Flächen.
* **Zwischenfeld-Brücken (Inter-Field Cable Bridges)**:
  * Automatische Erkennung und Visualisierung von Verbindungsbrücken zwischen aufeinanderfolgenden Teilfeldern eines Strings.
  * Individuelle Konfiguration der Brückenlänge in Metern (z. B. Überbrückung von Gaubenkehlen, Dachfirsten, Brandwänden oder Fassadenrücksprüngen).
  * Nahtlose Einbettung der Brücken in die Gesamtlängenberechnung und den Schaltplan.
* **Transparente 4-Wege-Kabelkalkulation**:
  * Aufschlüsselung der Leitungslängen in vier getrennte, nachvollziehbare Abschnitte:
    1. **Weg A (Hinweg)**: DC+ Solarkabel vom Wechselrichter zum Pluspol des 1. Modulfelds.
    2. **Feld-Brücken**: Summe aller Zwischenfeld-Verbindungskabel über getrennte Dachflächen.
    3. **Modulkabel-Pauschale**: Reale Modul-Anschlussleitungen (2,0 m Pauschalkabel je PV-Modul).
    4. **Weg B (Rückweg)**: DC- Solarkabel vom letzten Modul zurück zum Wechselrichter.
  * Formel-Summenleiste mit ungerundeter Roh-Länge sowie normgerechter **+10 % Verlegereserve** nach DIN VDE 0100-712.
* **Erweiterter Dachhindernis-Editor**:
  * Dachfenster, Gauben, Kamine und Freiflächen können nun gezielt einem bestimmten Teilfeld (`fieldIdx`) zugewiesen werden.
  * Anzeige des zugeordneten Feldes in der Liste platzierter Elemente und im Schaltplan.
* **Multi-Feld-Verdrahtungslogik & Manuelle Zuweisung**:
  * Nahtlose Unterstützung von Reißverschluss (Leap-Frog) und Schleifenarmer Verlegung über mehrere Teilfelder hinweg.
  * Interaktive Zuweisung per Klick durchnummeriert nun mit präziser Feld- und Modulbezeichnung (z. B. `F1-1`, `F1-2`, `F2-1`).
  * Manuelle Reihenfolgenverschiebung (◀ / ▶) und Invertierung der Polarität (+/-) für den gesamten Mehrebenen-String.
* **Normgerechte DC-Kabelverlust- und Querschnittsberechnung**:
  * Berechnung von Schleifenwiderstand $R = \frac{2 \cdot L}{\kappa \cdot A}$ mit Leitfähigkeit $\kappa_{Cu} = 56\,\frac{\text{m}}{\Omega \cdot \text{mm}^2}$.
  * Spannungsabfall $\Delta U$ in Volt und Prozent sowie thermische Verlustleistung $P_{\text{loss}} = I^2 \cdot R$ bei $I_{\text{mpp}}$.
  * Automatischer Querschnittsvergleich für 4 mm², 6 mm² und 10 mm² mit VDE-Ampel (< 1,0 % optimal, 1,0–1,5 % zulässig, > 1,5 % kritisch).
* **Solarteur-Montage-Stückliste**:
  * Automatische Ermittlung von benötigten MC4-Steckern, Buchsen, Solarkabel-Bundlängen und Klemmen.

---

## [v6.17.0] - 2026-08-20

### Neu: Material Design 3 Expressive (2026) Design-System
* **Google Material Symbols Rounded**:
  * Vollständige Umstellung der gesamten Applikation auf offizielle Material Symbols Rounded Vektor-Iconografie.
  * Beseitigung inkonsistenter Emojis in Buttons, Badges, Tabs und Überschriften.
* **Adaptive Dual-Navigation**:
  * **Mobilgeräte (< 768px)**: Schwebende M3 Bottom Navigation Bar mit Pill-Indikatoren, haptisch optimierten Touch-Zielen (≥ 48px) und sicherem Bottom-Padding für Gesten-Leisten (`env(safe-area-inset-bottom)`).
  * **M3 More Bottom Sheet**: Animiertes modales Bottom Sheet für Nebentabs (Investition, Verkabelung, Datenbank, Handbuch).
  * **Desktop (≥ 768px)**: Ergonomische M3 Segmented Bar mit visuell klar gegliederten Modulblöcken.
* **Tonal Surfaces & Farbharmonisierung**:
  * Einheitliche M3-Oberflächenhierarchie mit weichen Radien (16–24px), hohem Textkontrast (WCAG AAA) und nativer Unterstützung für Dark- und Light-Mode.

---

## [v6.16.0] - 2026-08-05

### Neu: PVGIS Seriescalc & 8.760h-Stundensimulation
* **Reale historische 8.760h-Stundenwerte**:
  * Direkter Abruf historischer Einstrahlungs- und Temperaturdaten über den Synology Reverse Proxy (`https://pvgis.mb10.org/api/v5_2/seriescalc`).
  * Exakte stundengenaue Auswertung mit physikalischer Präzision statt statistischer Monatsdurchschnitte.
* **Deterministischer Offline-Fallback**:
  * Bei Verbindungsausfall oder API-Downtime generiert die Engine automatisch physikalisch konsistente synthetische Einstrahlungsprofile auf Basis geografischer Koordinaten und Sonnenstands-Geometrie.

---

## [v6.15.0] - 2026-07-15

### Verbessert: Dedizierter Synology PVGIS-Proxy
* **Infrastruktur-Upgrade**:
  * Umstellung auf dedizierten Hochleistungs-Reverse-Proxy (`pvgis.mb10.org`) zur Umgehung von CORS-Restriktionen und Drittanbieter-Ratenbegrenzungen.
  * Deutlich verkürzte Ladezeiten und Beseitigung von Third-Party-Proxy-Timeouts.

---

## [v6.14.0] - 2026-06-25

### Verbessert: Schlanker PVcalc-Endpunkt
* **Monats-Kalibrierung**:
  * Direkte Integration des schlanken PVcalc-Endpunkts zur schnellen Vorbilanzierung und Validierung.
  * Nahtloser Übergang zwischen schneller Grobberechnung und vollständiger Jahressimulation.

---

## [v6.13.0] - 2026-06-10

### Verbessert: CORS-Tunneling & Cache-Busting
* **Verbindungsstabilität**:
  * Intelligentes Fallback-Routing bei Proxy-Blockaden.
  * Dynamisches Cache-Busting für mobile Browser zur Vermeidung veralteter API-Antworten.

---

## [v6.12.0] - 2026-05-18

### Neu: Investitionskosten-Modul
* **Detaillierte Anschaffungskosten**:
  * Aufteilung der Gesamtkosten in vier Hauptgewerke:
    1. PV-Hardware (Module, Wechselrichter, Halterungen, DC-Kabel).
    2. Batteriespeicher (Speicherblock, BMS, Zubehör).
    3. Montage & Gerüst (Dachdecker, Schienenmontage, Arbeitssicherheit).
    4. Elektroinstallation & AC (Zählerschrankumbau, SLS-Schalter, Abnahme).
  * Live-Synchronisation der Summe in die Wirtschaftlichkeits- und Amortisationsrechnung.
  * Umschaltung zwischen Netto und Brutto (0 % MwSt. gem. § 12 Abs. 3 UStG für private PV-Anlagen in Deutschland).

---

## [v6.10.0] - 2026-04-12

### Neu: Physikalische Stundengenaue Mismatch-Engine & Sektorenkopplung
* **Reihenschaltungs-Mismatch-Berechnung**:
  * Flaschenhals-Simulation für Strings mit unterschiedlichen Dachneigungen oder Ausrichtungen (z. B. Ost/West oder Gaube in Reihe).
  * Stündliche Identifikation des schwächsten Teilfelds ($I_{\text{string}}(t) = \min_i(I_i(t))$) und exakte Bezifferung des kWh-Mismatch-Verlusts.
* **Fossil-Substitution nach Brennwert**:
  * Exakte Umrechnung von Wärmepumpenstrom über die Jahresarbeitszahl (JAZ) in eingesparte Liter Heizöl bzw. Kubikmeter Erdgas ($1\,\text{l Öl} \approx 1\,\text{m}^3\,\text{Gas} \approx 10\,\text{kWh}_{\text{th}}$).
* **EEG-Cutoff 2027**:
  * Berücksichtigung der gesetzlichen EEG-Degression sowie optionaler 0-ct-Cutoff ab dem Jahr 2027.
* **Architektur-Refactoring (Separation of Concerns)**:
  * Aufteilung der Codebasis in modulare Dateien: `index.html`, `app.js`, `database.js`, `content.js`.

---

## [v6.8.0] - 2026-03-01

### Verbessert: Stabilität & Gestensteuerung
* **Wischgesten & mobile Ergonomie**:
  * Intuitive horizontale Wischgesten zum Wechseln zwischen den Reitern auf Touchscreens.
  * Optimierte Viewport-Skalierung und Verhinderung von vertikalem Overscroll (`overscroll-behavior-y: none`).

---

## [v6.0.0] - 2026-01-15

### Neu: Finance Engine & Dynamische EEG-Mischvergütung
* **EEG-Mischvergütungs-Rechner**:
  * Automatische Aufteilung der Einspeisevergütung nach EEG-Staffeln (bis 10 kWp mit 8,2 ct/kWh, 10–40 kWp mit 7,1 ct/kWh).
  * Berücksichtigung des Inbetriebnahmedatums und automatischer 1 %-Degressionsschritte alle 6 Monate.
* **Eigene Komponenten-Datenbank**:
  * Benutzerdefiniertes Erstellen und lokales Speichern eigener PV-Module, Hybrid-Wechselrichter und Batteriespeicher im Browser-LocalStorage.

---

## [v5.2.0] - 2025-11-20

### Basis-Release: Clean Architecture & VDI 4655 Lastprofile
* **VDI 4655 Standardlastprofile**:
  * Synthetisches Haushaltslastprofil mit jahreszeitlicher und tageszeitlicher Gewichtung.
* **Wärmepumpen- und Klimaanlagen-Profile**:
  * Saisonal gewichtete Verbrauchsmodelle für Heizung (Wintermaximum) und Klimatisierung (Sommermaximum).
* **Photovoltaik-Kernberechnung**:
  * Vmp-, Voc-, Isc-Auslegung und MPPT-Spannungsfenster-Prüfung gegen Wechselrichtergrenzen.
