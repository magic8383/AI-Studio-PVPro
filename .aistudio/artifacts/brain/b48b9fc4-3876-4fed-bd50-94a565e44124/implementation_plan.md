# PV-Planung Pro 8.3 – Live-Performance, Home Assistant Telemetrie & Soll-Ist-Analyse

Erweiterung der Applikation von einem reinen Auslegungs- und Planungswerkzeug zu einer vollwertigen **Live-Monitoring- und Performance-Analyse-Plattform** mit frei konfigurierbarer **Home-Assistant-Anbindung**, **Soll-Ist-Ertragsabgleich gegen die PVGIS-Prognose** und **realer Amortisations-Verfolgung** – kombiniert mit einem ausfallsicheren, mehrstufigen **EU-JRC-PVGIS-Server-Proxy**.

## User Review & Critical Decisions

> [!IMPORTANT]
> Basierend auf deinen Antworten haben wir die Architektur auf zwei nahtlos verbundene Zeitebenen ausgerichtet: **Echtzeit-Blick in die laufende Anlage (Live-Werte via Home Assistant)** sowie **Monats- und Jahres-Performance-Analyse (Soll vs. Ist, Autarkie, Batterie & Amortisation)**.

- **Bestätigte Entscheidung 1 (Home Assistant & Freie Entitäts-Zuordnung)**: Vorbereitung einer flexiblen Home-Assistant-Schnittstelle, in der Verbindungsdaten sowie sämtliche Sensor-Entitäten (`sensor.*`) für Gesamtleistung, einzelne Strings/Wechselrichter, Hausverbrauch, Batterie (Leistung, SoC, Ladung/Entladung) und Stromzähler (Netzbezug/Einspeisung) frei im UI eingetragen, getestet und dauerhaft gespeichert werden können.
- **Bestätigte Entscheidung 2 (Drei Analyse-Schwerpunkte)**:
  1. **Soll-Ist-Vergleich**: Realer Ertrag im direkten Vergleich zur standort- und strangspezifischen PVGIS-Prognose.
  2. **Autarkie, Eigenverbrauch & Batterie-Effizienz**: Reale Energiebilanz inkl. Speicher-Wirkungsgrad und Vollzyklen.
  3. **Reale Amortisations- & Euro-Ersparnis-Rechnung**: Tatsächlich eingesparte Stromkosten + Einspeiseerlöse im Vergleich zum geplanten Break-Even-Pfad.
- **Bestätigte Entscheidung 3 (Live + Monatsabschluss)**: Sofort sichtbares Live-Cockpit beim Öffnen des Analyse-Bereichs, ergänzt um ein Monats-/Jahres-Logbuch, das sich automatisch aus den Home-Assistant-Zählern speist oder am Monatsende per Schnelleingabe ergänzt/korrigiert werden kann.
- **Technische Behebung (PVGIS-Erreichbarkeit)**: Ablösung des rein clientseitigen Aufrufs über den externen Drittanbieter-Proxy durch einen direkten, gecachten Server-Proxy zur offiziellen EU-JRC-PVGIS-Schnittstelle (v5.3 & v5.2) mit mehrstufiger Fallback-Kaskade.

---

## 1. Overview & Core Concept

- **Was die Erweiterung leistet**:
  - **Ausfallsichere PVGIS-Wetter- & Ertragssimulation**: Der eigene App-Server ruft die offizielle EU-Wissenschaftsschnittstelle (JRC PVGIS) direkt serverseitig ab (ohne Browser-CORS-Blockaden) und speichert abgerufene 8.760-Stunden-Zeitreihen im lokalen Server-Cache. Fällt ein Endpunkt aus, wechselt das System automatisch über drei Stufen und informiert dezent per Toast-Benachrichtigung statt blockierender Browser-Alerts.
  - **Neuer Hauptbereich „Live & Analyse"**: Verbindet die geplante PV-Anlage (Strings, Wechselrichter, Speicher, Investitionskosten, Stromtarife) direkt mit den realen Betriebsdaten aus Home Assistant.
  - **Live-Energiefluss & String-Monitoring**: Zeigt in Echtzeit, wie viel Watt aktuell vom Dach (und den einzelnen geplanten Strings/Wechselrichtern) kommen, wie viel ins Haus, in die Batterie oder ins öffentliche Netz fließt, inklusive aktuellem Batterie-Ladestand (SoC) und Live-Autarkiegrad.
  - **Monatlicher Soll-Ist-Abgleich & Finanz-Tracking**: Stellt für jeden Monat und das Gesamtjahr den prognostizierten PVGIS-Ertrag dem tatsächlichen Ertrag gegenüber und berechnet daraus die reale Euro-Ersparnis sowie den tatsächlichen Amortisationsfortschritt.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Schnell-Blick im Live-Cockpit**: Beim Wechsel in den neuen Tab **„Live & Analyse"** (über die Desktop-Leiste oder die mobile Bottom-Navigation) sieht der Nutzer sofort das animierte Echtzeit-Energiefluss-Diagramm (PV $\rightarrow$ Wechselrichter $\rightarrow$ Haus / Speicher / Netz), die aktuellen Tages-KPIs (Erzeugung heute, Eigenverbrauch, Autarkie, Tages-Ersparnis in €) sowie die Live-Auslastung der einzelnen Strings.
  2. **Home Assistant Entitäten-Konfigurator**: Über den Button **„Home Assistant & Sensoren konfigurieren"** öffnet sich ein strukturiertes Konfigurations-Modal. Dort trägt der Nutzer seine Home-Assistant-URL und ein Long-Lived Access Token ein (oder nutzt den integrierten Webhook-Endpunkt für Push-Automationen aus Home Assistant) und ordnet den Anlagenteilen seine individuellen `sensor.*`-Entitäten zu – inklusive **„Verbindung & Entitäten testen"**-Funktion mit sofortiger Live-Wert-Vorschau. Solange noch keine echten Sensoren eingetragen sind, kann ein **„Live-Simulationsmodus (Demo)"** aktiviert werden, um alle Diagramme und Energieflüsse realistisch in Aktion zu erleben.
  3. **Monats- & Jahres-Analyse (Soll vs. Ist)**: Unterhalb des Live-Cockpits wechselt der Nutzer zwischen drei Analyse-Ansichten:
     - **Ertrag & PVGIS Soll-Ist**: Gruppiertes Monats-Balkendiagramm (PVGIS-Soll in Schieferblau vs. Ist-Ertrag in Smaragdgrün/Amber), prozentuale Zielerreichung (Performance-Index in %) und spezifischer Ertrag ($\text{kWh}/\text{kWp}$).
     - **Autarkie, Eigenverbrauch & Speicher-Bilanz**: Aufschlüsselung des realen Stromverbrauchs (Direktverbrauch, Batterieentladung, Netzbezug) sowie Berechnung des realen Batterie-Systemwirkungsgrads ($\eta_{\text{Bat}} = E_{\text{Entladung}} / E_{\text{Ladung}}$) und der absolvierten Vollzyklen.
     - **Reale Amortisation & Euro-Rendite**: Gegenüberstellung der kumulierten Ist-Ersparnis (vermiedener Netzbezug $\times$ Arbeitspreis + Einspeisung $\times$ EEG-Vergütung) gegen die reale Gesamtinvestition aus dem Tab „Investition", inklusive Prognose des tatsächlichen Break-Even-Datums.
  4. **Monatswerte-Manager**: Eine übersichtliche 12-Monats-Tabelle (mit Jahreswahl), in der die aus Home Assistant übernommenen Monatswerte eingesehen oder jederzeit manuell eingetragen bzw. übersteuert werden können (inkl. CSV/JSON-Import & -Export).

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Technisch präzises Engineering-Dashboard nach **Material Design 3 Expressive**, nahtlos abgestimmt auf das bestehende Erscheinungsbild von PV-Planung Pro (`Version 8.3`).
  - *Color Palette & Mood*:
    - **Neutral Canvas (60%)**: `bg-slate-50` (Light) / `dark:bg-slate-950` (Dark) mit klaren Oberflächen `bg-white dark:bg-slate-900` und feinen `1px`-Rahmen (`border-slate-200 dark:border-slate-800`).
    - **Semantic Energy Colors (30% / 10%)**:
      - **Solar / PV-Erzeugung**: Amber / Gold (`text-amber-500`, `#f59e0b`)
      - **Eigenverbrauch & Ziel übertroffen (Soll $\ge 100\%$ )**: Smaragdgrün (`text-emerald-500`, `#10b981`)
      - **Batteriespeicher**: Indigo / Violett (`text-indigo-500`, `#6366f1`)
      - **Netzbezug / Unterdeckung**: Rose / Koralle (`text-rose-500`, `#f43f5e`)
      - **PVGIS-Prognose (Soll-Referenz)**: Kühles Cyan / Slate (`text-sky-500`, `#0ea5e9`)
  - *Typography & Tabular Discipline*: `Plus Jakarta Sans` für Überschriften und Navigation; sämtliche Live-Leistungswerte ($\text{W}$, $\text{kW}$), Zählerstände ($\text{kWh}$), Prozentwerte und Euro-Beträge nutzen strikt `tabular-nums` (`font-mono`), damit sich ändernde Live-Zahlen niemals zu Layout-Springen führen.
  - *Mobile-First Ergonomie*: Alle Charts, das SVG-Energiefluss-Schema und die Monats-Tabellen sind ab `360px` Smartphone-Breite ohne horizontalen Seiten-Overflow bedienbar; sämtliche Modals nutzen `max-h-[90vh] overflow-y-auto`.

---

## 3. Key Product Decisions & Trade-Offs

- **Entscheidung 1: Mehrstufiger Server-Proxy für PVGIS mit lokalem Disk-Cache**
  - *Gewählter Ansatz*: Der Node/Express-Server stellt den Endpunkt `/api/pvgis/seriescalc` bereit. Dieser fragt zuerst die offizielle EU-JRC-API (`re.jrc.ec.europa.eu/api/v5_3/seriescalc` und `v5_2/seriescalc`) direkt vom Server aus ab, nutzt bei Bedarf den bisherigen Mirror als Fallback und speichert erfolgreiche 8.760h-Antworten persistent im Server-Datenverzeichnis zwischen.
  - *Warum*: Browser scheitern bei direkten Aufrufen an die EU-JRC-Server an fehlenden CORS-Headern; externe Drittanbieter-Proxys fallen häufig aus. Durch den eigenen Server-Proxy mit Disk-Cache funktionieren Abfragen dauerhaft zuverlässig und bereits berechnete Dachflächen laden in unter $20\,\text{ms}$.
- **Entscheidung 2: Hybride Home-Assistant-Architektur (Server-Proxy Poll + Push-Webhook)**
  - *Gewählter Ansatz*: Die App unterstützt sowohl das aktive Abrufen der Entitäten über den eigenen Backend-Proxy (`/api/ha/states`) als auch das Empfangen von Werten über einen Webhook (`/api/ha/webhook`).
  - *Warum*: Wenn Home Assistant über Nabu Casa, Cloudflare Tunnel, VPN oder im selben Netzwerk erreichbar ist, holt der Server-Proxy die Live-Werte alle paar Sekunden ab (ohne CORS-Probleme im Browser). Liegt Home Assistant hinter einer strikten Heimnetz-Firewall ohne eingehenden Port, kann eine einfache Home-Assistant-Automation die Sensorwerte per HTTP-POST an die App senden.
- **Entscheidung 3: Dynamisches Mapping auf geplante Strings & Wechselrichter**
  - *Gewählter Ansatz*: Der Entitäts-Konfigurator liest automatisch alle in der aktiven Planung angelegten Strings (z. B. „Süddach Gaube", „Ost-Fassade") und Wechselrichter (z. B. „Fronius Symo GEN24", „Hoymiles HMS-2000") aus und bietet für jeden Strang/Wechselrichter ein eigenes optionales Sensor-Feld (`sensor.*`).
  - *Warum*: Keine Insellösung – Planung und Live-Überwachung greifen auf exakt dieselbe Anlagenstruktur zu, sodass man sofort erkennt, ob ein einzelner String in der Realität hinter seiner spezifischen Prognose zurückbleibt.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        PV-PLANUNG PRO 8.3 (CLIENT UI)                        │
├───────────────────────┬──────────────────────────┬───────────────────────────┤
│   Planungs-Engine     │   Live-Telemetrie Hub    │  Performance-Analyse UI   │
│  ┌─────────────────┐  │  ┌────────────────────┐  │  ┌─────────────────────┐  │
│  │ Strings & WR    │  │  │ SVG Energiefluss   │  │  │ Soll vs Ist Chart   │  │
│  │ Invest & Tarife │──┼─▶│ (PV/Bat/Haus/Netz) │  │  │ (Monat / Jahr / PR) │  │
│  │ 8760h Prognose  │  │  ├────────────────────┤  │  ├─────────────────────┤  │
│  └────────┬────────┘  │  │ String-Live-Balken │  │  │ Autarkie & Batterie │  │
│           │           │  ├────────────────────┤  │  │ Wirkungsgrad-Analyse│  │
│           │           │  │ HA Entitäts-Editor │  │  ├─────────────────────┤  │
│           │           │  │ & Verbindungs-Test │  │  │ Reale Amortisation  │  │
│           │           │  └─────────┬──────────┘  │  │ & Cashflow-Tracker  │  │
│           ▼           │            │             │  └──────────┬──────────┘  │
└───────────┼───────────┴────────────┼─────────────┴─────────────┼─────────────┘
            │                        │                           │
            ▼                        ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       NODE.JS / EXPRESS BACKEND SERVER                       │
├───────────────────────┬──────────────────────────┬───────────────────────────┤
│  /api/pvgis/seriescalc│  /api/ha/states & /test  │ /api/performance/records  │
│  ┌─────────────────┐  │  ┌────────────────────┐  │ ┌───────────────────────┐ │
│  │ 1. Disk Cache   │  │  │ REST Proxy zu HA   │  │ │ Persistente Speicherung│ │
│  │ 2. EU JRC v5.3  │  │  │ (Bearer Token Auth)│  │ │ von HA-Mapping,       │ │
│  │ 3. EU JRC v5.2  │  │  ├────────────────────┤  │ │ Monats-Ist-Werten &   │ │
│  │ 4. Mirror / Syn │  │  │ /api/ha/webhook    │  │ │ Historie im Server    │ │
│  └─────────────────┘  │  └────────────────────┘  │ └───────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

1. **Home Assistant Konfigurations-Profil (`haConfig`)**:
   - **Verbindung**: `baseUrl` (z. B. `http://homeassistant.local:8123` oder externe URL), `accessToken` (Long-Lived Token, sicher serverseitig gespeichert), `pollIntervalSec` (Standard: `10`), `mode` (`'poll' | 'webhook' | 'demo'`).
   - **Kern-Entitäten (Leistung in W / kW & Status)**:
     - `pvPowerEntity`: Aktuelle Gesamterzeugung PV (z. B. `sensor.pv_power_total`)
     - `loadPowerEntity`: Aktueller Hausverbrauch (z. B. `sensor.house_consumption_power`)
     - `gridPowerEntity`: Netzleistung (positiv = Bezug, negativ = Einspeisung, oder getrennt `gridImportPowerEntity` / `gridExportPowerEntity`)
     - `batteryPowerEntity`: Batterieleistung (positiv = Ladung, negativ = Entladung)
     - `batterySocEntity`: Batterie-Ladestand in % (z. B. `sensor.byd_battery_soc`)
   - **Energie-Zähler-Entitäten (kWh für Tag / Monat / Gesamt)**:
     - `pvEnergyTodayEntity`, `pvEnergyMonthEntity`, `pvEnergyTotalEntity`
     - `gridImportMonthEntity`, `gridExportMonthEntity`
     - `batteryChargeMonthEntity`, `batteryDischargeMonthEntity`
   - **Dynamische String- & Wechselrichter-Entitäten (`stringEntities` / `inverterEntities`)**:
     - Zuordnung `{ [stringId]: { powerEntity: 'sensor.string_1_power', energyEntity: 'sensor.string_1_energy' } }` für detaillierten String-Soll-Ist-Abgleich.

2. **Monatliche & Jährliche Performance-Datensätze (`performanceRecords`)**:
   - Gespeichert je Projekt und Jahr (`year: 2026`, `months: Array(12)`):
     - `pvYieldKwh` (Realer PV-Ertrag)
     - `gridImportKwh` (Netzbezug)
     - `gridExportKwh` (Netzeinspeisung)
     - `batteryChargedKwh` / `batteryDischargedKwh` (Speicher-Durchsatz)
     - `source`: `'ha'` (automatisch aus Home Assistant übernommen) oder `'manual'` (manuell eingetragen/fixiert).
   - Abgeleitete Kennzahlen (Single Source of Truth):
     - **Direkt- & Eigenverbrauch**: $E_{\text{Eigen}} = E_{\text{PV}} - E_{\text{Einspeisung}}$
     - **Realer Hausverbrauch**: $E_{\text{Haus}} = E_{\text{Eigen}} + E_{\text{Netzbezug}}$
     - **Reale Autarkiequote**: $\text{Autarkie} = \frac{E_{\text{Eigen}}}{E_{\text{Haus}}} \times 100\,\%$
     - **Eigenverbrauchsquote**: $\text{EV-Quote} = \frac{E_{\text{Eigen}}}{E_{\text{PV}}} \times 100\,\%$
     - **Batterie-Wirkungsgrad**: $\eta_{\text{Bat}} = \frac{E_{\text{Bat,Entladung}}}{E_{\text{Bat,Ladung}}} \times 100\,\%$
     - **Soll-Ist-Erfüllungsgrad**: $\text{Performance-Index} = \frac{E_{\text{PV,Ist}}}{E_{\text{PV,PVGIS-Soll}}} \times 100\,\%$
     - **Monatliche & Kumulierte Euro-Ersparnis**: $\text{Ertrag}_{€} = (E_{\text{Eigen}} \times P_{\text{Strom}}) + (E_{\text{Einspeisung}} \times P_{\text{EEG}})$

### Interactive Component & State Mapping

- **PVGIS Server-Proxy & Cache-Handler**:
  - `calculateYieldAPI()` ruft `/api/pvgis/seriescalc` auf. Der Server prüft den lokalen Cache, fragt bei Cache-Miss die offizielle EU-JRC-API mit sauberem Timeout ab und liefert die 8.760 Stundenwerte zurück. Ein dezentes Badge im Standort-Header zeigt den Datenquellen-Status (`EU-JRC Live`, `Server-Cache` oder `Synthetisches Modell`).
- **Home Assistant Verbindungs- & Entitäts-Modal**:
  - Bietet Eingabefelder mit Autovervollständigungs-Vorschlägen (falls Verbindung zu HA besteht, lädt ein Klick auf „Verfügbare Sensoren aus HA abrufen" alle `sensor.*`-Entitäten von Home Assistant zur bequemen Auswahl per Suchfeld!).
  - Einzel-Test-Button je Entität zeigt sofort den aktuellen Live-Wert und die Einheit (`W`, `kW`, `kWh`, `%`) an und rechnet Einheiten (`W` vs. `kW`) automatisch um.
- **Live-Cockpit & Polling-Loop**:
  - Solange der Tab „Live & Analyse" geöffnet ist, aktualisiert der Polling-Service im eingestellten Intervall (z. B. alle 5–10 Sekunden) die Live-Werte, animiert die Energiefluss-Pfeile proportional zur Leistung und aktualisiert auf Wunsch den laufenden Monatseintrag.
- **Dossier-Integration**:
  - Wenn reale Performance-Daten vorliegen, kann im Druck-/PDF-Dossier optional eine zusätzliche Sektion **„Betriebsanalyse & Soll-Ist-Ertragsbilanz"** mit ausgedruckt werden.
