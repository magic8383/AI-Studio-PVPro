# Entwicklungs-, Architektur- & Release-Leitfaden (PV-Planung Pro)

**Version:** 6.17 (Material Expressive 3 & Modern Modular Architecture)  
**Repository:** `https://github.com/magic8383/PVPro.git`  
**Standard-Branch:** `main` (Production) | `New` (Feature / Refactor Staging)

---

## 1. Arbeits-, Kommunikations- & Code-Prinzipien

* **Kompakt & Zielführend:** Alle Erklärungen, Commits und Dokumentationen sind präzise, technisch exakt und frei von überflüssigem Fluff.
* **Keine voreiligen Code-Änderungen:** Vor jedem Eingriff erfolgt eine fundierte technische Analyse im bestehenden Codebestand.
* **Review vor Umsetzung:** Geplante Änderungen, Schnittstellen-Anpassungen und Patchnotes werden vorab nachvollziehbar strukturiert.
* **Explizites Freigabe-Prinzip:** Änderungen an Berechnungs-Engines, mathematischen Modellen und API-Endpunkten erfolgen stets konsistent und synchron über alle beteiligten Module.
* **Keine Insellösungen (Single Source of Truth):**
  * **Design & Icons:** Alle Symbole werden ausschließlich über die offizielle Google Material Symbols Font (`.material-symbols-rounded`) gerendert. Keine inkonsistenten Emojis, keine isolierten Einweg-Icons.
  * **Zentral gesteuerte Logik:** Berechnungen (Physik, Finanzen, Verbrauch, Mismatch) residieren zentral in `app.js`. Texte, Changelog und Glossar liegen strikt in `content.js`. Gerätestammdaten liegen in `database.js`.

---

## 2. Modul-Architektur

Die Applikation ist als performante, modular aufgebaute Progressive Web App (PWA) ohne Framework-Overhead konzipiert:

* `index.html`: Semantisches DOM-Gerüst, M3 Top App Bar, M3 Navigation Rail / Bottom Bar und Container-Hierarchie.
* `app.js`: State Management, Physik-Engine, PVGIS-Proxy Seriescalc, Chart-Rendering und PWA-Lifecycle.
* `database.js`: Stammdaten MasterDB (Module, Wechselrichter, Speicher, MPPT-Grenzen) und LocalStorage-User-DB.
* `content.js`: Wissensbasis, Bedienungsanleitung, physikalische Formeln und zentraler Version Changelog.
* `sw.js`: Service Worker für Caching, Stale-While-Revalidate und Offline-Betrieb.
* `manifest.json`: Web App Manifest für Installation, Standalone-Modus und PWA-Metadaten.
* `DEVELOPMENT_GUIDELINES.md`: Projektgovernance, Git-Workflow, Architektur und UI-Standards.


---

## 3. Detail-Architektur & Datenfluss

### PVGIS Seriescalc & Offline-Fallback
* Die Ertragssimulation nutzt reale 8.760h-Historienstundenwerte (`seriescalc`) über den dedizierten Synology Reverse Proxy `https://pvgis.mb10.org/api/v5_2/seriescalc`.
* Sollte der Proxy oder die Internetverbindung ausfallen, greift die deterministische Offline-Fallback-Engine (`generateSyntheticPVGISData`) ein, ohne dass der Rechenprozess abbricht.

### Physik- & Modul-Engine
* Temperaturabhängige Spannungen ($U_{oc}$ bei -10°C, $U_{mpp}$ bei +70°C) werden über den modulspezifischen Koeffizienten $T_k$ simuliert.
* Automatische Grenzprüfung gegen den Wechselrichter ($U_{max}$, $I_{sc,max}$, MPPT-Bereich, Startspannung).
* Stundengenaue Mismatch-Berechnung nach dem physikalischen Flaschenhalsprinzip für gemischte Dachneigungen und Ausrichtungen innerhalb eines Strings.

### Finanz- & Lastprofil-Bilanzierung
* Haushaltslastprofile nach VDI 4655 (dynamische saisonale und tageszeitliche Gewichtung).
* Sektorenkopplung für Wärmepumpe (JAZ-Heizenergiebilanz vs. Gas/Öl-Brennwert) und E-Mobilität (Wetter-KI optimiertes Laden an Ertragsspitzen).
* Dynamische EEG-Mischvergütung basierend auf dem Inbetriebnahme-Datum mit automatischer 6-Monats-Degression und 2027-Cutoff.

---

## 4. Design System: Material Design 3 Expressive (2026)

* **Vektor-Iconografie:** Alle Icons stammen aus **Google Material Symbols Rounded** (`material-symbols-rounded`). Keine Emojis in Buttons, Badges oder Navigationsleisten.
* **Tonal Surfaces:** Weiche Oberflächenebenen (`bg-slate-900/60`, `bg-slate-800/40`, `border-slate-800/60` in Dark Mode, `bg-white`, `bg-slate-100` in Light Mode) mit abgerundeten Ecken (`rounded-2xl` bis `rounded-3xl`).
* **Adaptive Navigation:**
  * **Mobil (< 768px):** Schwebende M3 Bottom Navigation Bar mit Pill-Indikatoren für die 4 Hauptbereiche plus "Mehr"-Button, der ein M3 Bottom Sheet für Zusatzfunktionen öffnet.
  * **Desktop (≥ 768px):** Vollständige M3 Segmented Bar mit visuell gegliederten Modulblöcken.
  * Synchronisation zwischen Touch-Wischgesten (Swipes) und aktiven Navigations-Indikatoren.

---

## 5. Git-Verbindung & Release-Workflow

* **Remote Origin:** `https://github.com/magic8383/PVPro.git`
* **Branches:**
  * `main`: Stabiler Produktionszweig.
  * `origin/New`: Feature- und Staging-Branch.
* **Release-Checkliste:**
  1. Versionsnummer synchronisieren in `index.html`, `content.js` (Changelog) und `DEVELOPMENT_GUIDELINES.md`.
  2. Cache-Name in `sw.js` inkrementieren (z.B. `pvpro-cache-v6.17`), um Service Worker Updates auf Client-Geräten sicherzustellen.
  3. Git Commit mit strukturierter Nachricht und Push auf `origin main`.

