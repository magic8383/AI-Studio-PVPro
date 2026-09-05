# Entwicklungs-, Architektur- & Release-Leitfaden (PV-Planung Pro)

> ⚠️ **WICHTIGE ANWEISUNG FÜR ALLE ENTWICKLER & KI-AGENTEN:**  
> **DIESE GUIDELINES MÜSSEN BEI JEDER AUFGABE UND VOR JEDER CODE-MODIFIKATION ZUERST VOLLSTÄNDIG GELESEN WERDEN.**  
> Sie definieren die verbindliche Projekt-Governance, Modularisierung, Code-Standards und den Release-Prozess.

**Aktuelle Version:** 7.5.0 (Vollbild-Schaltplan Zentrierung & Hardware-Bereinigung)  
**Repository:** `https://github.com/magic8383/PVPro.git`  
**Standard-Branch:** `main` (Production) | `New` (Feature / Refactor Staging)

---

## 1. Arbeits-, Versions- & Dokumentations-Prinzipien

1. **Primat der Guidelines (Read First):**  
   Bevor irgendeine Code-Datei angefasst wird, MUSS dieser Leitfaden konsultiert werden.
2. **Versionierungs-Pflicht nach JEDER Änderung:**  
   Nach **jeder** funktionalen oder architektonischen Anpassung **MUSS zwingend eine neue Version angelegt werden** (Semantic Versioning: `MAJOR.MINOR.PATCH`). Ein Stillstand der Versionsnummer bei Code-Änderungen ist untersagt.
   * **Kopfzeilen-Synchronisation:** Die in der App-Kopfzeile sichtbare Versionsnummer (`#app-header-version` in `index.html` sowie im Starter in `app.js`) **MUSS** bei jedem Versionswechsel zwingend synchron mitgeführt und aktualisiert werden.
3. **Changelog-Synchronisationspflicht:**  
   Zu jeder neuen Version **MUSS** parallel der `CHANGELOG.md` aktualisiert werden.  
   **Strikte Regel:** Die neuesten Versionen stehen **IMMER ganz oben** (chronologisch absteigend).  
   Ebenso wird die Kurzfassung im Tab 'Glossar & Handbuch' (`content.js`) synchronisiert.
4. **Keine Insellösungen (Weder bei Logik noch bei Layout):**
   * **Zentrale Berechnungslogik (Single Source of Truth):** Keine redundanten Ad-hoc-Formeln in UI-Komponenten oder Exportmodulen. Berechnungen (Spannungen, Mismatch, Leitungsverluste nach VDE 0100-712, Amortisation) werden in den Kernmodulen definiert und von allen Konsumenten (UI, Charts, Dossier) geteilt.
   * **Konsistentes Designsystem:** Alle visuellen Elemente folgen strikt dem *Material Design 3 Expressive*-Standard. Symbole werden ausnahmslos als Google Material Symbols Rounded (`.material-symbols-rounded`) gerendert. Keine Emoji-Buttons, keine uneinheitlichen Farbwelten.
5. **Kompakt & Technisch Exakt:** Erklärungen und Commit-Beschreibungen bleiben präzise, faktenbasiert und frei von werblichem Fülltext.

---

## 2. Modul-Architektur (Separation of Concerns)

Um unkontrolliertes Anwachsen von Monolithen zu verhindern, ist die Codebasis modular nach Best-Practice aufgeteilt:

| Datei / Modul | Primäre Verantwortung |
|---|---|
| `index.html` | Semantisches DOM-Gerüst, App-Shell, M3 Header (inkl. dynamischer Version `#app-header-version`), adaptive Navigation, Vollbild-Modal & globale CSS-Klassen. |
| `qrcode.client.js` | Autarke Client-seitige Vektor-QR-Code-Engine (Zero-Dependency SVG-Rendering für Offline- & Mobil-Sync). |
| `app.js` | Kern-Orchestrierung, reaktiver State, Physik- & MPP-Prüfung, 8.760h PVGIS-Simulation, Finanzen, Cross-Device Sync & QR-Transfer. |
| `wiring.js` | **DC-Verkabelungs-Engine:** Interaktiver Schaltplan, Reißverschluss-Verfahren (Leap-Frog nach DIN EN 62305-3), Dachhindernisse (Gauben/Fenster), Mehrfeld-Dächer, VDE 0100-712 Leitungsrechnung & Vollbild-Viewer mit Zoom/Pan/Rotation. |
| `dossier.js` | **Druck- & PDF-Dossier-Engine:** Vollständige, normgerechte Dokumentation (Anlagenpass, String-Verifikation, SVG-Schaltplan, Kabelberechnung, Stückliste, 20-Jahres-ROI & DIN VDE 0100-712 Inbetriebnahmeprotokoll). |
| `server.js` | Express Server, persistente Share-API (`/api/share`), QR-Code Generierung (`qrcode`) & statische Auslieferung. |
| `database.js` | Master-Hardwarekatalog (Solarmodule, Wechselrichter, Speicher, MPPT-Spezifikationen) & Custom-DB. |
| `content.js` | Integriertes Handbuch, Hilfetexte, Glossar und In-App-Changelog. |
| `sw.js` | Service Worker für Offline-Fähigkeit, PWA-Caching und Stale-While-Revalidate. |
| `DEVELOPMENT_GUIDELINES.md` | Dieser Governance- & Architektur-Leitfaden. |
| `CHANGELOG.md` | Vollständige Versionshistorie (neueste Einträge stets oben). |
| `HANDBUCH.md` | Ausführliche Dokumentation der Berechnungsverfahren und Normen. |

---

## 3. Druck- & PDF-Export-Standard (DIN VDE 0100-712)

Die Erstellung von Druckdokumenten und PDF-Exporten darf **niemals ein einfaches Bildschirm-Abbild der App** (`window.print()` auf Dark-Mode-UI) sein. Stattdessen gilt:

* **Strukturierte Fachdokumentation:** Ein professionelles PV-Auslegungs- & Installationsdossier muss mindestens folgende Sektionen umfassen:
  1. **Anlagenpass & Executive Summary:** Generatorleistung (kWp), Modulanzahl, PVGIS-Jahresertrag, Wechselrichter, Speicher, Leiterschleifenschutz-Status, CO₂-Vermeidung.
  2. **String-Konfiguration & Physikalische Grenzprüfung:** String-Zuweisungen, Neigungen, Azimut (gradgenau mit Himmelsrichtung), Kälte-Leerlaufspannung ($U_{oc,-10^\circ\text{C}}$), Hitze-MPP ($U_{mp,+70^\circ\text{C}}$), Kurzschlussströme ($I_{sc}$) im Vergleich zu WR-Grenzwerten.
  3. **DC-Schaltplan & Leitungsführung:** Scharfer, hochauflösender SVG-Vektor-Schaltplan mit Polaritätskennzeichnung (+/-), Modulnummerierung, Hindernissen und Leap-Frog Leitungsführung.
  4. **VDE 0100-712 Leitungsverlust-Analyse:** Transparente Kabelwege (Weg A + Brücken + Modulkabel + Weg B zzgl. 10% VDE-Reserve), Querschnitt, Schleifenwiderstand, Spannungsabfall in Volt und %, Verlustleistung in Watt und kWh/Jahr.
  5. **Material-Stückliste (BOM):** Alle Haupt- und Installationskomponenten mit exakten Mengenangaben.
  6. **Wirtschaftlichkeits- & Ertragsprognose:** 20-Jahres-Cashflow, Amortisationszeit, LCOE-Stromgestehungskosten, Eigenverbrauchsquote.
  7. **DIN VDE 0100-712 Prüf- & Inbetriebnahmeprotokoll:** Normierte Checkliste (Sichtprüfung, Potentialausgleich, Polarität, $U_{oc}$, $I_{sc}$, $R_{iso}$, SPD-Schutz) mit handschriftlichem Errichter- und Betreiber-Unterschriftenblock.
* **Dedizierter Print-DOM:** Beim Drucken (`@media print`) werden Navigationsleisten, Header, Scrollbars und Screen-Buttons ausgeblendet. Der Druck gerät auf reinweißem Hintergrund mit perfektem typografischem Kontrast und definierten Seitenumbrüchen (`page-break-after: always`).

---

## 4. Design System: Material Design 3 Expressive (2026)

* **Vektor-Iconografie:** Alle Icons stammen aus **Google Material Symbols Rounded** (`material-symbols-rounded`).
* **Tonal Surfaces:** Saubere Trennung von Oberflächenebenen mit weichen Radien (`rounded-2xl` bis `rounded-3xl`).
* **Adaptive Navigation:**
  * **Mobil (< 768px):** M3 Bottom Navigation Bar mit Pill-Indikatoren + M3 Bottom Sheet für Zusatzfunktionen.
  * **Desktop (≥ 768px):** M3 Segmented Rail mit Schnellzugriff auf alle Kernbereiche.
* **Barrierefreier Kontrast:** Mindestens WCAG AA für alle Text- und Statuselemente.

---

## 5. Git- & Release-Workflow

1. Lokale Verifikation via `compile_applet` und `node -c` auf allen JavaScript-Modulen.
2. Hochzählen der Versionsnummer in `package.json`, `index.html`, `sw.js` (Cache-Name) und `content.js`.
3. Eintrag der neuen Version an oberster Stelle in `CHANGELOG.md`.
4. Git Commit mit semantischer Botschaft: `Release vX.Y.Z: <Zusammenfassung>`.
