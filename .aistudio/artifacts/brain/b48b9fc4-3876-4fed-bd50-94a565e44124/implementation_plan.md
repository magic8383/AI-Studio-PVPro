# PV-Planung Pro – Version 8.7: Komfort-Sensor-Picker, Tagesverlauf-Feinschliff & Vollbild-Diagramm

Dieses Update ersetzt das manuelle Kopieren von Home-Assistant-Entitäten durch einen zweistufigen Komfort-Sensor-Picker (gruppiert nach Geräten und Helfern), entfernt den Demo-Modus zugunsten der echten Live-Anbindung und optimiert den Bereich „Tagesverlauf & Kurven“ inklusive Vollbild-Ansicht.

## User Review & Critical Decisions

> [!IMPORTANT]
> Alle offenen Design- und Funktionsfragen wurden geklärt und sind in diesem Plan berücksichtigt:

- **Sensor-Auswahl über Geräte & Helfer**: Komfort-Picker-Modal mit Gruppierung nach Home-Assistant-Geräten sowie Helfern/Zählern, inklusive Echtzeit-Suche und Anzeige der aktuellen Live-Messwerte.
- **Tagesdiagramm-Vergrößerung**: Tap direkt auf das Diagramm öffnet ein Vollbild-Overlay mit Querformat-Unterstützung und interaktiven Kurven-Buttons.
- **Entfernung des Demo-Modus**: Vollständiger Wegfall der Demo-Zeitleiste und Demo-Umschalter; direkter Start im Home-Assistant-Live-Modus.

## 1. Overview & Core Concept

- **Was wird umgesetzt**:
  1. **Komfort-Sensor-Picker (Geräte & Helfer)**: Jedes Sensor-Feld im Home-Assistant-Dialog (System-Sensoren, PV-Strings und Einzelverbraucher) erhält einen direkten Auswahl-Button, der alle gefundenen Entitäten nach Geräten und Helfern strukturiert anzeigt.
  2. **Tagesverlauf & Kurven im Referenz-Design**: Einzeiliges Datumsformat ohne Zeilenumbruch, kompakter Refresh-Button, platzsparende Messwert-Kacheln mit unübersehbarem Aktiv-/Inaktiv-Kontrast und Entfall sämtlicher Demo-Bedienelemente.
  3. **Interaktives Vollbild-Diagramm**: Vergrößerbare Vollbild- und Querformat-Ansicht des Tagesverlaufs mit direkter Kurven-Umschaltung und Touch-Zeitachsen-Ablesung.
- **Mehrwert**: Schnellere Einrichtung ohne Tipparbeit in Home Assistant sowie optimale Ablesbarkeit von Live-Kurven und aktiven Messwert-Kacheln auf dem Smartphone.

## 2. User Experience & Visual Design

- **Komfort-Sensor-Picker Flow**:
  - Ein Tap auf **„Sensor wählen“** neben einem beliebigen Eingabefeld öffnet den Sensor-Picker, vorab gefiltert auf die passende Einheit (z. B. `W / kW` für Leistung, `kWh` für Energie, `%` für Batterie-SoC).
  - **Stufe 1 (Gerät oder Helfer wählen)**: Auswahl aus automatisch erkannten Home-Assistant-Geräten (z. B. Wechselrichter, Speicher, Smart Plugs) oder der Kategorie **„Helfer & Berechnete Zähler“** (Template-Sensoren, Riemann-Integrale, Verbrauchszähler).
  - **Stufe 2 (Entität antippen & Live-Suche)**: Zeigt den Klartextnamen, die technische `entity_id` und den **aktuellen Messwert inkl. Einheit** (z. B. `429 W`, `8,4 %`, `1,32 kWh`). Ein Tap übernimmt den Sensor sofort.
- **Tagesverlauf & Kurven (Liquid Glass Dark UI)**:
  - **Zeitstempel ohne Zeilenumbruch**: Oben links steht der runde Refresh-Button (`↻`), darunter in einer einzigen Zeile (`whitespace-nowrap tabular-nums`) der Zeitraum `09.11.2026, 00:00 — 09.11.2026, 11:16 · Kachelwerte: jetzt`.
  - **Kompakte Kurven-Kacheln mit klarem Aktiv-Status**:
    - **Aktiv**: Kräftiger `2px`-Rahmen in der jeweiligen Kurvenfarbe (`#14b8a6`, `#f59e0b`, `#22c55e`, `#38bdf8`, `#f472b6`, `#60a5fa`, `#d8b4fe`), leuchtender Statuspunkt mit `Aktiv`-Kennzeichnung oben rechts, farbig getönter Liquid-Glass-Hintergrund und helle weiße Schrift.
    - **Inaktiv**: Deutlich abgedunkelte Kachel (`opacity-45`) mit gedämpfter Typografie und dezentem Rahmen, sodass aktive Kurven sofort ins Auge fallen.
- **Vollbild-Diagramm-Overlay**:
  - Ein Tap auf den Graphen öffnet das Vollbild-Overlay mit maximaler Zeichenfläche, optionalem `90° Querformat`-Drehmodus für Smartphones im Hochformat, Kurven-Umschalt-Chips im Kopfbereich und präzisem Touch-Scrubbing.

## 3. Key Product Decisions & Trade-Offs

- **Entscheidung 1: Browser-Direktauflösung von Geräte- und Helfer-Namen**
  - *Gewählter Ansatz*: Abfrage der Home-Assistant-Zustände kombiniert mit einer leichtgewichtigen Template-Abfrage (`device_attr` / `area_name`) direkt aus dem Browser sowie intelligentem Präfix- und Attribut-Fallback.
  - *Warum*: Funktioniert zu 100 % auf statischem Hosting (GitHub Pages) ohne Backend-Server und gruppiert sowohl echte Hardware-Geräte als auch Home-Assistant-Helfer zuverlässig.
- **Entscheidung 2: Kompletter Wegfall des Demo-Modus**
  - *Gewählter Ansatz*: Entfernung der Demo-Zeitleiste und des Demo-Modus-Schalters aus Dashboard und Einstellungen; Standardmodus ist `Live-Poll`.
  - *Warum*: Spart wertvollen vertikalen Platz auf dem Smartphone und verhindert Verwechslungen zwischen simulierten und echten Home-Assistant-Werten.

## 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Home Assistant Browser-Client                        │
│  ┌─────────────────────────┐          ┌───────────────────────────────┐  │
│  │ GET /api/states         │          │ POST /api/template            │  │
│  │ (Entitäten, Attribute,  │─────────▶│ (Gerätename, Bereich/Raum &   │  │
│  │  Live-Messwert, Einheit)│          │  Helfer-Klassifizierung)      │  │
│  └────────────┬────────────┘          └───────────────┬───────────────┘  │
└───────────────┼───────────────────────────────────────┼──────────────────┘
                └───────────────────┬───────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                Komfort-Sensor-Picker Modal (2-Stufen-UI)                 │
│  [Suche & Einheiten-Filter: Passend | W/kW | kWh | % | Alle]             │
│  ├─ Stufe 1: Geräte-Gruppen & Helfer/Zähler-Gruppen                      │
│  └─ Stufe 2: Entitätsliste mit Live-Wert ──▶ Übernahme in Sensor-Feld    │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Tagesverlauf & Kurven (Live-Tab)                     │
│  ├─ Kopfzeile: [↻ Refresh] + Einzeiliges Datum + [Vollbild-Button]       │
│  ├─ Interaktiver Graph (Tap öffnet Vollbild- & Querformat-Overlay)       │
│  └─ Kompaktes 2-Spalten Kachel-Grid (2px Farb-Rahmen Aktiv vs. Gedimmt)  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **State & Synchronisation**:
  - Das toggling einer Kurven-Kachel aktualisiert synchron das Hauptdiagramm, die Legenden-Chips sowie – falls geöffnet – das Vollbild-Diagramm.
  - Versions-Synchronisation auf **Version 8.7** über alle Systemdateien und das Changelog.
