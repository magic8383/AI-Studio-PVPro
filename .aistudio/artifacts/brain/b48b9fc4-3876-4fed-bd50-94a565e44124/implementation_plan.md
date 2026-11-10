# Tiefen-Audit, Zentralisierung & Code-Bereinigung (Version 9.4)

Umfassende Code-Prüfung und Architektur-Konsolidierung über alle Module hinweg: Einführung einer zentralen Versions- und System-Basissteuerung (Single Source of Truth), vollständige Entfernung alter Demo-Generatoren und toter Code-Schnipsel sowie Angleichung aller Berechnungs- und Zeitraum-Logiken zwischen Browser-Engine und Backend.

## User Review & Critical Decisions

> [!IMPORTANT]
> Die folgenden Architekturentscheidungen wurden im Vorfeld bestätigt und bilden die verbindliche Grundlage für Version 9.4:

- **Bestätigte Entscheidung 1 (Saubere 0-Werte ohne Demo-Generator)**: Solange kein Home Assistant Token hinterlegt oder erreichbar ist, zeigt das Live-Dashboard saubere `0 W` / `0,00 kWh`-Werte und einen klaren Verbindungs-Hinweis statt synthetischer Demo-Kurven (`computeDemoLiveTelemetry`, `buildDemoIntradaySeries` und `demoSimHour` werden restlos entfernt).
- **Bestätigte Entscheidung 2 (Zentrale `APP_VERSION` & gemeinsame Berechnungs-Helfer)**: Eine zentrale `APP_VERSION = '9.4'` sowie gemeinsame Berechnungs-Helfer für Anlagenleistung (kWp), Speicherkapazität (kWh) und Jahresverbrauch versorgen alle Module (UI, Export, Dossier, Analyse) aus einer einzigen Quelle.

---

## 1. Overview & Core Concept

- **What It Does**: Beseitigt sämtliche historisch gewachsenen Code-Duplikate, veraltete Versions-Strings (`v7.0.0`, `v7.9.0`, `v8.1`, `v8.3`, `v8.5`, `v9.1`), tote Event-Handler und Logik-Abweichungen zwischen direktem Browser-Abruf und Node.js-Proxy.
- **Target Audience / Persona**: Anlagenplaner, Installateure und Betreiber, die sich in Echtzeit-Monitoring, Ertragsanalyse und VDE-Dokumentation auf 100 % konsistente, echte Messwerte ohne Geister- oder Demo-Daten verlassen müssen.
- **Key Value**: Maximale Wartbarkeit, strikte Einhaltung des Prinzips „Keine Insellösungen“, identische Ergebnisse auf allen Endgeräten (Cloud, Lokal, GitHub Pages) und fehlerfreie Zeitraum-Umschaltung (`Tag` / `Woche` / `Monat`).

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Zero-State ohne Token**: Ist noch kein Home Assistant Token eingetragen, zeigen alle Kacheln und das Diagramm ehrliche `0 W` / `0,00 kWh` mit direktem Konfigurations-Hinweis statt erfundener Sonnenkurven.
  2. **Nahtlose Zeitraum-Umschaltung (`Tag` / `Woche` / `Monat`)**: Beim Wechsel über dem fixierten Diagramm bleiben der gewählte Zeitraum-Untertitel (`Heute, 00:00 – HH:MM Uhr`, `Letzte 7 Tage · 1h-Auflösung`, `Letzte 30 Tage · 3h-Auflösung`), die aktiven Button-Stile, die Kachel-Summen (`heute` vs. `7 Tage` vs. `30 Tage`) und die Fadenkreuz-Zeitstempel (inkl. Datum bei Woche/Monat) auch bei laufenden Live-Refreshes dauerhaft synchron.
  3. **Konsistente Versions- & Dossier-Ausgabe**: Header-Badge, Menü-Fußzeile, Projekt-Exporte und die Fußzeilen des DIN VDE 0100-712 Druck-Dossiers zeigen automatisch dieselbe zentrale Version (`9.4`).
- **Visual Identity & Theme**:
  - Unverändertes *Material Design 3 Expressive* mit Liquid-Glass-Oberflächen und Google Material Symbols Rounded (`.material-symbols-rounded`).
  - Einheitliche Farb- und Kontraststeuerung in Light- und Dark-Mode ohne konkurrierende Inline-Overrides.

---

## 3. Key Product Decisions & Trade-Offs

- **Entscheidung 1: Restlose Entfernung synthetischer Live-Demo-Generatoren**
  - *Gewählter Ansatz*: Ersatz von `computeDemoLiveTelemetry()`, `buildDemoIntradaySeries()` und `onDemoHourSliderChange()` durch eine schlanke Null-Initialisierung (`createCleanZeroTelemetryState()` / `createEmptyIntradaySeries()`). Auch beim Initialisieren eines neuen Analysejahres werden immer leere Monate (`createEmptyYearMonths()`) statt Zufallswerte angelegt.
  - *Warum*: Verhindert, dass bei kurzen Verbindungsabbrüchen oder fehlendem Token plötzlich fiktive Watt- und kWh-Zahlen (wie `682 W` oder `1,33 kWh`) angezeigt werden und den Nutzer verwirren.
- **Entscheidung 2: Zentrale `APP_VERSION` & Berechnungs-Helfer (Single Source of Truth)**
  - *Gewählter Ansatz*: Definition von `window.APP_VERSION = '9.4'` an zentraler Stelle sowie Bündelung der System-Basisberechnung (Generator-kWp, Batterie-kWh, geplanter Jahresverbrauch), sodass Projekt-Manager, Planungs-Hub, Telemetrie-Baseline und Druck-Dossier exakt dieselben Funktionen aufrufen.
  - *Warum*: Eliminiert vierfach duplizierte Schleifen über `strings`, `flatPanels`, `flatBatteries` und `getConsumptionConfig()`.
- **Entscheidung 3: 1:1-Parität zwischen Browser-Client und Backend-Proxy**
  - *Gewählter Ansatz*: Angleichung der Prioritätslogik für getrennte Netz-Sensoren (`gridImportPower` / `gridExportPower` vor `gridPower`), Einbindung von `pvEnergyExtraEntities` (Wechselrichter 3+) und `customConsumers` im Backend sowie Zusammenführung des doppelt definierten Default-Konfigurations-Objekts (inkl. Korrektur des Tippfehlers `sensor.gridExport_monthly` -> `sensor.grid_export_monthly`).
  - *Warum*: Stellt sicher, dass der Server-Proxy exakt dieselben Werte liefert wie der direkte Browser-Modus.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────────┐
│                 SINGLE SOURCE OF TRUTH (Zentrale Steuerung)              │
│  • APP_VERSION = '9.4' (Header, Export, Dossier-Footer, Server-Logs)     │
│  • DEFAULT_HA_CONFIG (Einmalige Definition ohne Duplikate/Tippfehler)    │
│  • System-Baseline-Helfer (kWp, Batterie-kWh, Jahresverbrauch, Tarife)   │
└───────────────────┬──────────────────────────────────┬───────────────────┘
                    │                                  │
                    ▼                                  ▼
┌──────────────────────────────────────┐  ┌────────────────────────────────┐
│   LIVE & ZEITRAUM-ENGINE (Client)    │  │   BACKEND-PROXY (Server)       │
│  • Echte 0-Werte ohne Token (kein    │  │  • Getrennte Netz-W vor Kombi  │
│    Demo-Generator / kein 1,33 kWh)   │  │  • Multi-WR kWh-Summierung     │
│  • Zeitraum-State (Tag/Woche/Monat)  │  │  • Custom Consumers & Peaks    │
│    steuert Header, Kachel-kWh &      │  │    in /api/ha/history          │
│    Fadenkreuz-Datum konsistent       │  │  • Bereinigung alter Legacy-   │
│  • Bereinigung toter Funktionen      │  │    Felder (stringEntities)     │
└──────────────────────────────────────┘  └────────────────────────────────┘
```

### Geplante Bereinigungen im Detail:
1. **Zentralisierung der Versionsnummer (`9.4`)**:
   - Einführung von `APP_VERSION = '9.4'` und automatische Synchronisation in Header, neuen Projekten (bisher `7.9.0` hartcodiert), Konfigurationsexporten, Dossier-Fußzeilen (bisher `v8.1` und `v7.0.0` hartcodiert) sowie Server-Headern (bisher `8.3` / `8.5`).
2. **Aufräumen alter Code-Schnipsel (Dead Code Removal)**:
   - Entfernung von `demoSimHour`, `onDemoHourSliderChange`, `computeDemoLiveTelemetry`, `buildDemoIntradaySeries`.
   - Entfernung der ungenutzten Alias-Konstanten `addHaCustomStringRow`, `addHaCustomConsumerRow` sowie der veralteten `toggleHeaderSubmenu` / `closeHeaderSubmenu` Wrapper.
   - Entfernung der veralteten `stringEntities`- und `inverterEntities`-Objekte aus v8.3 (vollständig abgelöst durch `customStrings` und `pvEnergyExtraEntities`).
   - Bereinigung der initialen `currentLiveTelemetry`-Startwerte von fiktiven Demo-Zahlen (`pvPowerW: 682`, `loadPowerW: 2100`, `pvEnergyTodayKwh: 1.325`) auf saubere `0`-Werte.
3. **Korrektur der Zeitraum- & Kachel-Logik (`Tag` / `Woche` / `Monat`)**:
   - `renderIntradayCurveSection()` respektiert `currentCurveTimeframe` (`day`, `week`, `month`), aktualisiert die Auswahl-Buttons konsistent und überschreibt den Zeitraum-Text nicht mehr mit `00:00 – HH:MM Uhr`.
   - `getAvailableCurveDefinitions()` zeigt in den Messkanal-Kacheln passend zum gewählten Zeitraum `... kWh heute`, `... kWh (7 Tage)` oder `... kWh (30 Tage)` auf Basis der jeweiligen Zeitreihen-Integration bzw. Monatszähler.
   - `updateIntradayHoverReadout()` zeigt im Fadenkreuz bei `Woche` und `Monat` das Datum samt Uhrzeit (`DD.MM. HH:MM Uhr`).
   - Im Sankey-Diagramm (`computeSankeyFlowData`) wird der letzte verbleibende Fallback `1.33` kWh durch `0` ersetzt.
4. **Parität & Deduplizierung im Server-Backend**:
   - Eine einzige zentrale Funktion `createDefaultHaConfig()` statt doppelter Objekt-Literale; Korrektur von `sensor.gridExport_monthly` zu `sensor.grid_export_monthly`.
   - Vorrang für `gridImportPower` und `gridExportPower` vor `gridPower` analog zum Browser-Client.
   - Einbindung von `customConsumers` (`consumer_<id>`) und `peakValues` in `/api/ha/history`.
