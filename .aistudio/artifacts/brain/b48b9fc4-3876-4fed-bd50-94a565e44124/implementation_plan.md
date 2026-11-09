# PV-Planung Pro (Version 8.5) — Sankey-Energiefluss, Liquid-Glass-Design, Einheitliches Mobile-First Drill-Down & Home-Assistant Reverse-Proxy-Assistent

Dieses Update (Version **8.5**) erweitert den Analyse-Bereich um ein interaktives **Sankey-Energieflussdiagramm** (umschaltbar zwischen Heute, Monat und Gesamtjahr), verfeinert das **Liquid-Glass-Design** (insbesondere im Dark Mode mit echter Tiefen-Lichtbrechung), vereinheitlicht die gesamte App-Bedienung auf ein aufgeräumtes **2-Ebenen-Drill-Down-Konzept (Mobile-First)** mit zweizeiliger, jederzeit lesbarer Kopfzeile und löst das **Home-Assistant-Verbindungsproblem über Domain/Reverse-Proxy** inklusive interaktiver Schritt-für-Schritt-Diagnose und Anleitung.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Bestätigte Entscheidungen aus deinen Antworten:**
> - **Confirmed Decision 1 (Sankey-Diagramm Zeitraum):** Das neue Sankey-Diagramm im Analyse-Bereich ist direkt per Auswahl-Pills umschaltbar zwischen **Heute (Tag)**, **Monat (wählbarer Monat)** und **Gesamtjahr (Bilanz)**. Es visualisiert maßstabsgetreu alle Energieflüsse von `PV-Erzeugung` und `Netzbezug` über `Direktverbrauch` und `Batteriespeicher (Ladung / Entladung / Verluste)` bis hin zu `Hausverbrauch` und `Netzeinspeisung`.
> - **Confirmed Decision 2 (Einheitliches Mobile-First Drill-Down auf allen Tabs):** Sowohl im Bereich **Analyse** als auch im Bereich **PV-Planung** gibt es keine überladenen Endlos-Seiten oder uneinheitlichen oberen Tab-Leisten mehr. Stattdessen zeigt **Ebene 1** jeweils eine aufgeräumte **Übersicht (Kompakt-KPIs + Themen-Kacheln)**, und ein Tipp auf eine Kachel öffnet **Ebene 2 (Fokussierte Detail-Ansicht)** mit einem klaren **„← Zurück zur Übersicht“-Button** im Header.
> - **Confirmed Decision 3 (Home Assistant über Domain & Reverse Proxy + Anleitung):** Da du über eine **eigene Domain mit Reverse Proxy** auf Home Assistant zugreifst, erweitern wir die Verbindungs-Engine um automatische URL-Bereinigung (Trailing-Slashes, Protokoll-Ergänzung, WebSocket-/Proxy-Header-Toleranz, SSL/TLS-Prüfung, Dual-Fetch über Server-Proxy + direktem Browser-CORS-Fallback) sowie einen integrierten **Schritt-für-Schritt-Einrichtungs- & Diagnose-Assistenten** speziell für Reverse-Proxy-Setups (Nginx Proxy Manager, Traefik, Cloudflare, Synology Reverse Proxy).
> - **Confirmed Decision 4 (Zweizeiliger Header & 4er Floating Pill Bar):** Die obere Kopfzeile wird zweizeilig aufgebaut, sodass der Bereichsname auf dem Smartphone nie wieder abgeschnitten wird. Der Dark-Mode-Button wandert aus der unteren schwebenden Pill-Leiste in das Einstellungs-/Mehr-Menü, sodass unten 4 perfekt erreichbare Haupt-Buttons verbleiben (`Live`, `Analyse`, `Planung`, `Menü`).

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Interaktives Sankey-Energiefluss-Diagramm**: Zeigt anschaulich mit geschwungenen, breitenproportionalen Liquid-Glass-Strömen, wie viele kWh (oder W) von der PV-Anlage direkt ins Haus, in die Batterie und ins öffentliche Netz fließen – und wie hoch der Anteil aus Batterieentladung und Netzbezug am Hausverbrauch ist.
  2. **Echtes Liquid-Glass-Design in Hell & Dunkel**: Im Dark Mode sorgen mehrschichtige, transluzente Glas-Oberflächen (`backdrop-blur-2xl`), feine spekulare Lichtkanten (`inset 0 1px 0 rgba(255,255,255,0.14)`) und sanfte hintergründige Farb-Auren (Teal/Cyan & Indigo Ambient Glows) für einen echten „Liquid Glass“-Tiefeneffekt.
  3. **Einheitliches 2-Ebenen-Drill-Down (Ebene 1 = Hub, Ebene 2 = Fokus-Ansicht)**: Kein Scroll-Marathon und keine unterschiedlichen Sub-Navigationsleisten mehr. Jede Hauptkategorie (`Live`, `Analyse`, `Planung`) startet auf Ebene 1 mit den wichtigsten Eckdaten und klar strukturierten Navigationskacheln in die Tiefe (Ebene 2).
  4. **Home Assistant Reverse-Proxy Fix & Geführte Einrichtung**: Behebt typische Reverse-Proxy-Stolpersteine (401/403 Token-Header-Filterung, Trailing-Slash-Redirects, IP-Ban/Rate-Limit, Mixed-Content, Synology/Nginx `Authorization`-Weitergabe) und zeigt beim Verbindungstest exakt an, an welchem Schritt (DNS &rarr; SSL/Reverse Proxy &rarr; API-Pfad `/api/` &rarr; Bearer-Token-Authentifizierung) ein Problem liegt – inklusive kopierbarer Konfigurations-Tipps.
- **Target Audience / Persona**: Anlagenbetreiber und Planer auf dem Smartphone (ab 360 px Breite) sowie am Desktop, die auf dem Startbildschirm sofort ihren Live-Status sehen und sich bei Bedarf gezielt per Tap in einzelne Analyse- oder Planungsmodule vertiefen möchten.
- **Key Value**: Maximale Übersichtlichkeit ohne Informationsverlust; einheitliche mobile Daumen-Bedienung überall in der App; funktionierende Home-Assistant-Kopplung über Reverse-Proxy-Domains.

---

## 2. User Experience & Visual Design

### A. Zweizeiliger Mobile-First Header (Volle Lesbarkeit des Bereichsnamens)
- **Zeile 1 (Kompakte Status- & Aktionszeile)**:
  - Links: Falls man sich in einer Unterebene (Ebene 2) befindet, erscheint ein prominenter **„← Zurück“-Button** (`Zurück zur Übersicht`); auf Ebene 1 steht dort das App-Badge (`PV Pro 8.5`) samt aktivem Projektnamen.
  - Rechts: Kompakte Direkt-Icons für `Projekt wechseln`, `Home Assistant Status/Setup` und `Speichern` (kontextsensitiv).
- **Zeile 2 (Großer, ungekürzter Bereichstitel & Untertitel)**:
  - Volle Bildschirmbreite für den aktuellen Bereichsnamen (z. B. `Solar & Netz · live`, `Performance & Energiefluss`, oder in Ebene 2 `Sankey-Energiefluss · Analyse` bzw. `Kabelplan & VDE · Planung`), sodass auf dem Smartphone kein Text mehr abgeschnitten wird.

### B. Echtes „Liquid Glass“-Design (Light & Dark Mode)
- **Ambient Background Canvas**:
  - **Light Mode**: Sanfter Mint-Eukalyptus-Verlauf (`#dff3ee` &rarr; `#eff6f8` &rarr; `#f8fafc`) mit hochtransluzenten Milchglas-Karten (`rgba(255, 255, 255, 0.76)`), `backdrop-filter: blur(24px) saturate(180%)` und glänzender 1px-Weißkante.
  - **Dark Mode (Liquid Glass Upgrade)**: Tiefes Obsidian-Teal (`#091114` &rarr; `#0d181c`) mit dezenten, weichgezeichneten Ambient-Lichtquellen im Hintergrund (Teal-Glow oben links, Smaragd/Violett-Schimmer unten rechts), über denen die Karten als **echtes dunkles Rauchglas** (`linear-gradient(145deg, rgba(26, 43, 49, 0.62), rgba(16, 27, 32, 0.48))`) mit `backdrop-filter: blur(28px) saturate(190%)`, oberer Glanzkante (`inset 0 1px 0 0 rgba(255, 255, 255, 0.16)`) und feiner äußerer Lichtbrechung schweben.

### C. Einheitliche 2-Ebenen-Drill-Down-Architektur (Keine überladenen Seiten mehr)
- **Bereich 1: `Live` (Start-Dashboard)**:
  - **Ebene 1**: Karte `Energie · jetzt` (2x2 Status-Kacheln + die Top-4 aktiven Einzelverbraucher) sowie eine kompakte Vorschau des Tagesverlaufs und Drill-Down-Kacheln (`Tagesverlauf & Kurven im Detail`, `Alle Einzelverbraucher`, `Home Assistant Setup`).
  - **Ebene 2 (per Tap erreichbar)**: Vollständiges interaktives Tagesdiagramm mit allen Kurven-Auswahlkacheln oder der Home-Assistant-Konfigurator.
- **Bereich 2: `Analyse` (Performance & Ist-Daten)**:
  - **Ebene 1 (Analyse-Hub)**:
    1. **Kompakte Jahres-KPI-Karte** (4 Kennzahlen im 2x2-Grid: `PVGIS-Soll`, `Realer Ist-Ertrag`, `Erfüllungsgrad %`, `Real-Ersparnis €` + Jahres-Auswahl).
    2. **Interaktives Sankey-Energiefluss-Diagramm** direkt als visueller Hauptanker (umschaltbar: `Heute` | `Monat` | `Gesamtjahr`), das sofort zeigt, wohin der erzeugte PV-Strom geflossen ist und wie sich der Hausverbrauch zusammensetzt.
    3. **4 Aufgeräumte Drill-Down-Kacheln für Ebene 2**:
       - `1. Soll-Ist-Vergleich (PVGIS vs. Real)` (Monats-Balkendiagramm & 12 Monatskarten)
       - `2. Autarkie & Batterie-Effizienz` (Wirkungsgrad $\eta$, Vollzyklen, Verluste & Monatsbilanz)
       - `3. Reale Amortisation & Cashflow` (20-Jahres-Break-Even Ist vs. Plan & Euro-Aufschlüsselung)
       - `4. Monatswerte-Logbuch & CSV` (Zählertabelle, 1-Klick-HA-Sync & CSV-Import/Export)
- **Bereich 3: `PV-Planung` (Auslegung & Technik)**:
  - **Ebene 1 (Planungs-Hub)**:
    1. **Kompakte Anlagen-Zusammenfassung** (`Gesamtleistung kWp`, `Geplante Module & Strings`, `Speicher kWh`, `Prognose-Autarkie %` + Standort-Schnellwahl).
    2. **Übersichtliche Drill-Down-Kacheln für alle 9 Planungs-Module (Ebene 2)**:
       - `1. Strings & Dachbelegung` (MPPT-Prüfung, Temperatur-Spannungen & Dachfelder)
       - `2. Kabelplan & VDE 0100-712` (Interaktiver Schaltplan, Leap-Frog & Leitungsverluste)
       - `3. Verbrauchsprofil & Sektoren` (Haushalt, Wärmepumpe, E-Auto & Lastkurven)
       - `4. Investition & Positionen` (4 Kostenkategorien & Zusatzpositionen)
       - `5. Tarife, EEG & Finanzierung` (Strompreis, Mischvergütung & Kredit)
       - `6. Wirtschaftlichkeits-Übersicht` (Steuer, Cashflow & 20-Jahres-Rendite)
       - `7. 8.760h Jahres- & Tages-Prognose` (PVGIS-Simulation & Tagesscharfe Charts)
       - `8. Hardware-Datenbank & Gerätepool` (Wechselrichter, Module, Speicher & Datenblätter)
       - `9. Handbuch, Formeln & Hilfe` (Dokumentation & Einrichtungs-Guides)
  - **Ebene 2 (Detail-Ansicht)**: Öffnet ausschließlich das gewählte Planungsmodul mit einem klaren `← Zurück zur Planungs-Übersicht`-Button oben links und schnellen Vor/Zurück-Pfeilen zwischen den Modulen. Keine verwirrende horizontale 10-Button-Scrollleiste mehr!

### D. Schwebende 4-Icon Pill-Navigation unten
- Besteht nur noch aus **4 großzügigen Daumen-Schaltflächen** (`min-h-[48px]`):
  1. **Live (`bolt`)** – Start-Dashboard
  2. **Analyse (`monitoring`)** – Sankey & Performance-Hub
  3. **Planung (`solar_power`)** – PV-Planungs-Hub
  4. **Menü (`menu`)** – Öffnet das Liquid-Glass-Bottom-Sheet (mit Hell-/Dunkelmodus-Umschalter, Farbthemen, Multi-Projekt-Manager, PDF-Dossier, QR-Teilen und Home-Assistant-Assistent).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Maßstabsgetreues SVG-Sankey-Diagramm mit 3 Zeithorizonten (`Heute`, `Monat`, `Jahr`)**
  - *Chosen Approach*: Eigene hochauflösende, responsive Vektor-Sankey-Engine (`renderSankeyDiagram` in `telemetry.js`), die kubische Bézier-Flussbänder mit Liquid-Glass-Farbverläufen zeichnet. Links stehen die **Quellen** (`PV-Erzeugung`, `Netzbezug`), in der Mitte die **Verteilung/Speicherung** (`PV-Direktverbrauch`, `Batterie-Ladung` &rarr; `Batterie-Entladung` + `Speicherverlust`) und rechts die **Senken** (`Hausverbrauch gesamt`, `Netzeinspeisung`).
  - *Why*: Ein Sankey-Diagramm macht Energiebilanzen (inkl. Speicherwirkungsgrad und Eigenverbrauchsanteil) auf einen Blick verständlich, ohne dass der Nutzer 4 verschiedene Tabellen lesen muss.
- **Decision 2: Einheitliches Hub-&-Detail-Pattern (Drill-Down) statt horizontaler Tab-Leisten**
  - *Chosen Approach*: Sowohl `Analyse` als auch `Planung` besitzen ein Hub-Grid (Ebene 1). Erst beim Antippen einer Kachel wird die jeweilige Detailsektion (Ebene 2) eingeblendet, während alle anderen Sektionen ausgeblendet bleiben. Alle bestehenden DOM-IDs (`#tab-system`, `#tab-verkabelung`, etc.) bleiben vollständig erhalten, sodass keine Berechnungs- oder Dossier-Logik bricht.
  - *Why*: Beseitigt das Problem überladener Seiten und vereinheitlicht die Navigation auf dem Smartphone komplett.
- **Decision 3: Home Assistant Reverse-Proxy-Diagnose & Dual-Path-Connector**
  - *Chosen Approach*:
    1. **Automatische URL-Normalisierung**: Entfernt versehentliche Suffixe wie `/lovelace`, `/api` oder schließende `/` aus der eingegebenen Domain, ergänzt fehlendes `https://` und bereinigt unsichtbare Leerzeichen/Zeilenumbrüche im Long-Lived Token.
    2. **Reverse-Proxy-kompatible Request-Header (`server.js`)**: Sendet saubere `Authorization: Bearer <token>`, `Accept: application/json` und `User-Agent`-Header, folgt HTTP-301/302/307/308-Redirects unter Beibehaltung des `Authorization`-Headers (viele Reverse Proxies leiten `http` &rarr; `https` oder Subpfade weiter, wobei Standard-`fetch` den `Authorization`-Header bei Cross-Origin-Redirects sonst verwirft!) und unterstützt optional selbstsignierte Zertifikate.
    3. **Mehrstufiger Diagnose-Check (`/api/ha/test`) & In-App-Einrichtungsassistent**: Zeigt bei Fehlern den genauen Grund (z. B. `401 Unauthorized: Token ungültig oder Reverse Proxy schneidet Authorization-Header ab`, `403 Forbidden / IP-Ban`, `Cloudflare Bot-Challenge`, `DNS/Timeout`) und bietet im Modal einen aufklappbaren **„Anleitung: Home Assistant & Reverse Proxy einrichten“-Guide** (Schritt 1: Token erstellen, Schritt 2: Reverse Proxy `Websockets` & `Authorization`-Header zulassen, Schritt 3: `http: use_x_forwarded_for` in `configuration.yaml`, Schritt 4: Alternative Webhook-Push-Automation).

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                TWO-ROW LIQUID GLASS HEADER (Mobile-First)                 │
│  Row 1: [← Zurück (Level 2) | PV Pro 8.5 · Projekt]   [HA] [Save] [Proj] │
│  Row 2: Large Unclipped View Title + Breadcrumb Subtitle                  │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
┌───────────────────┐    ┌───────────────────────┐    ┌─────────────────────┐
│   1. LIVE TAB     │    │    2. ANALYSE TAB     │    │   3. PLANUNG TAB    │
│  (Start-Cockpit)  │    │  (Level 1: Hub View)  │    │ (Level 1: Hub View) │
├───────────────────┤    ├───────────────────────┤    ├─────────────────────┤
│ • Energie · jetzt │    │ • 2x2 Jahres-KPIs     │    │ • Anlagen-Steckbrief│
│   (2x2 Glass Grid)│    │ • SANKEY-DIAGRAMM     │    │   (kWp, Module, Bat)│
│ • Aktive          │    │   [Heute|Monat|Jahr]  │    │ • 9 Drill-Down-     │
│   Verbraucher     │    │   PV ──► Haus / Bat   │    │   Kacheln mit       │
│ • Drill-Down:     │    │   Netz ─► / Einspeis. │    │   Live-Kurzstatus   │
│   ├─► Tagesverlauf│    │ • 4 Drill-Down-Cards: │    │   ├─► 1. Strings    │
│   │   & Kacheln   │    │   ├─► 1. Soll-Ist     │    │   ├─► 2. Kabelplan  │
│   └─► HA-Setup &  │    │   ├─► 2. Autarkie/Bat │    │   ├─► 3. Verbrauch  │
│       Anleitung   │    │   ├─► 3. Amortisation │    │   ├─► 4. Investition│
└───────────────────┘    │   └─► 4. Logbuch/CSV  │    │   ├─► 5. Tarife/EEG │
                         └───────────────────────┘    │   ├─► 6. Übersicht  │
                                                      │   ├─► 7. 8760h Sim  │
                                                      │   ├─► 8. Hardware-DB│
                                                      │   └─► 9. Handbuch   │
                                                      └─────────────────────┘
                                     │
┌────────────────────────────────────┴──────────────────────────────────────┐
│           FLOATING 4-ICON LIQUID GLASS BOTTOM BAR (#floatingBottomNav)    │
│         [ ⚡ Live ]      [ 📈 Analyse ]      [ ☀️ Planung ]      [ ☰ Menü ] │
└───────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping
1. **Navigation & Drill-Down State (`navigationState` in `app.js`)**:
   - `activePrimarySection`: `'live'` | `'analyse'` | `'planung'`
   - `activeSubView`:
     - On `live`: `'hub'` (default) | `'intraday-detail'`
     - On `analyse`: `'hub'` (default, shows KPI summary + Sankey Diagram + 4 Drill-Down Cards) | `'soll-ist'` | `'autarkie-bat'` | `'amortisation'` | `'logbuch'`
     - On `planung`: `'hub'` (default, shows System Summary + 9 Drill-Down Cards with live metrics) | `'system'` | `'verkabelung'` | `'verbrauch'` | `'invest'` | `'finance'` | `'uebersicht'` | `'auswertung'` | `'database'` | `'faq'`
   - Calling `openDrillDown(section, subView)` transitions smoothly to Level 2, scrolls to top, updates the 2-row header title/subtitle, and reveals the `← Zurück zur Übersicht` button (`navigateBackToHub()`).
2. **Sankey Energy Flow Engine (`renderSankeyEnergyFlow(horizon)` in `telemetry.js`)**:
   - Supports `horizon = 'today' | 'month' | 'year'`.
   - Computes physically consistent energy balances:
     - `pvTotal` = `pvDirect` + `batCharge` + `gridExport`
     - `batCharge` = `batDischarge` + `batLoss`
     - `houseTotal` = `pvDirect` + `batDischarge` + `gridImport`
   - Renders an interactive SVG Sankey diagram with proportional node heights, translucent gradient ribbons, kWh & percentage labels on every node and flow path, plus a summary footer pill row (`Eigenverbrauch`, `Autarkiegrad`, `Speicher-Deckung`).
3. **Home Assistant Reverse-Proxy Connector & Setup Guide (`server.js` & `telemetry.js`)**:
   - Normalizes domain URLs (`normalizeHaBaseUrl(rawUrl)`) so inputs like `https://ha.meinedomain.de/`, `ha.meinedomain.de/lovelace/0`, or `https://ha.meinedomain.de:8123/api/` automatically resolve to `https://ha.meinedomain.de`.
   - Preserves `Authorization: Bearer <token>` across HTTP redirects and supports custom TLS/Reverse-Proxy configurations via a custom Node `https.Agent({ rejectUnauthorized: false })` fallback when a user's Reverse Proxy uses an intermediate/self-signed certificate.
   - Adds an interactive **"Schritt-für-Schritt Einrichtungs-Anleitung & Fehlerdiagnose"** tab inside `#modal-ha-config` covering Domain/Reverse-Proxy setup, `configuration.yaml` (`http: use_x_forwarded_for: true`, `trusted_proxies`), Long-Lived Access Token creation, and 1-click connection diagnostics.
