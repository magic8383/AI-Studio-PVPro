# Zentrale Energie-Bilanz (Single Source of Truth) & Vollbreites Sankey-Diagramm (Version 9.7)

Dieses Update behebt die rechnerischen Widersprüche zwischen Tages-, Monats- und Jahreswerten (`Heute > Monat`), beseitigt die Grafikfehler (`battery_android`-Icon-Bug, überlappende Texte im Speicher-Knoten, Rohtext `$\Delta$kWh`) und gestaltet das Sankey-Energiefluss-Diagramm so um, dass es auf dem Smartphone komplett ohne horizontales Scrollen und ohne abgeschnittene Kanten dargestellt wird.

## User Review & Critical Decisions

> [!IMPORTANT]
> Alle Entscheidungen basieren direkt auf deinen Rückmeldungen und den analysierten Screenshots:

- **Bestätigte Entscheidung 1 (Sankey komplett auf Bildschirmbreite ohne horizontales Scrollen):** Das Sankey-Diagramm verliert den erzwungenen Mindestbreiten-Überlauf (`min-w-[600px]`), durch den auf dem Smartphone die rechte Hälfte abgeschnitten war. Alle Knoten und Energieflüsse passen zu 100 % in die verfügbare Bildschirmbreite.
- **Bestätigte Entscheidung 2 (Zentrale Single Source of Truth aus Live-Watt- & kWh-Sensoren):** Alle Energieflüsse (`PV-Erzeugung`, `Hausverbrauch`, `Netzbezug`, `Netzeinspeisung`, `Batterie-Ladung`, `Batterie-Entladung`) werden über eine einzige zentrale Engine aus den in den Sensor-Einstellungen hinterlegten Live-Watt-Sensoren (`W`/`kW`) und Energiezählern (`kWh`) berechnet und für `Heute`, `Monat` und `Gesamtjahr` konsistent zusammengeführt.
- **Mathematische Konsistenz (`Gesamtjahr ≥ Monat ≥ Heute`):** Ein Monatswert kann physikalisch niemals kleiner sein als der heutige Tageswert (z. B. Netzbezug Heute `5,38 kWh` vs. Monat `1,8 kWh` oder Batterie Heute `3,13 kWh` vs. Monat `0,0 kWh`). Die zentrale Bilanz-Engine korrigiert veraltete Monats-Startwerte automatisch anhand der Tages-Startwerte (`Monatsstart-Zähler ≤ Tagesstart-Zähler`) und kombiniert Zähler-Differenzen nahtlos mit dem Trapez-Integral der Live-Watt-Sensoren.

---

## 1. Overview & Core Concept

- **Was behoben und verbessert wird:**
  1. **Behebung „Netzbezug Heute höher als im ganzen Monat“ & „Batterie im Monat 0,0 kWh“:**
     - **Ursache:** Home Assistant speichert die `history/period`-Rohdaten standardmäßig nur 10 Tage lang. Dadurch lieferte die Abfrage für den 1. des Monats (`startOfMonth + 24h`) oft ein leeres Ergebnis, sodass der Monats-Startzähler erst mitten am heutigen Tag verankert wurde (`1,8 kWh` Differenz seit App-Start), während der Tageszähler ab `00:00 Uhr` (`5,38 kWh`) bzw. das Watt-Integral (`3,13 kWh` Batterie) lief. Zudem überschrieb der Zeitraum-Wechsel im Live-Diagramm das Tages-Integral.
     - **Lösung:** Eine zentrale **Single Source of Truth Engine** verwaltet für alle 6 Energiekanäle sowohl die `kWh`-Zählerstände als auch die integrierten `Watt`-Verläufe getrennt nach Zeitraum (`Tag` / `Monat` / `Jahr`), stellt sicher, dass der Monats-Startzähler niemals über dem Tages-Startzähler liegt, und garantiert mathematisch `Jahr ≥ Monat ≥ Heute`.
  2. **Behebung aller Grafik- & Textfehler:**
     - **Batterie-Grafikfehler (`...TTERY_ANDROID`):** Das ungültige Material-Symbol `battery_android` (das von der Schriftart als riesiger Text `BATTERY_` plus Android-Roboter-Icon gerendert wurde) wird durch das korrekte Material-Symbol `battery_charging_full` ersetzt.
     - **Überlappender Text im `BYD HVS+`-Knoten:** Das schwebende Einspeise-Label (`0,04 kWh (1%)`), das bei Koordinate `(385, 224)` mitten im lila Batterie-Kasten lag und durchschimmerte, wird sauber an den Einspeisefluss gebunden, sodass keinerlei Text-Kollisionen mehr auftreten.
     - **LaTeX-Rohtext im Untertitel:** Der fehlerhafte String `($\Delta$kWh)` wird durch sauberes `(ΔkWh)` ersetzt.
     - **Abgeschnittene 4. Karte in 3er-Reihe:** Die Bilanz-Leiste unter dem Sankey (`Zeitraum`, `Autarkiequote`, `Eigenverbrauch`, `Selbst gedeckt`) hatte 4 Elemente in einem `grid-cols-3`-Raster, wodurch die 4. Karte einsam umbrach. Sie erhält ein symmetrisches `grid-cols-2 sm:grid-cols-4`-Raster.
  3. **Komplett neues, randlos passendes Sankey-Diagramm:**
     - Übersichtliche 3-Spalten-Flussarchitektur (`Quellen: PV & Netz` → `Zwischenspeicher & Direktpfad` → `Senken: Haus & Einspeisung`), die ohne horizontales Scrollen vollständig auf jedes Smartphone-Display passt und sowohl im Light-Mode als auch im Dark-Mode gestochen scharf lesbar ist.

---

## 2. User Experience & Visual Design

- **Vollbreites Sankey ohne Scrollbalken (Mobile-First):**
  - Keine abgeschnittenen Boxen am rechten Rand und kein horizontaler Scrollbalken mehr.
  - Klare vertikale Farb-Stromschienen (Sankey-Bars) mit proportionalen Bézier-Flussbändern, deren Dicke exakt dem jeweiligen Energieanteil entspricht.
  - Direkt lesbare Prozent- und `kWh`-Werte mit `tabular-nums` ohne Überlagerung von Knoten und Linien.
- **Interaktive Fluss-Auswahl (Tap / Klick):**
  - Ein Tippen auf einen beliebigen Knoten (`PV-Erzeugung`, `Netzbezug`, `PV-Direkt`, `BYD HVS+`, `Hausverbrauch`, `Netzeinspeisung`) oder ein Flussband hebt diesen Pfad optisch hervor und zeigt darunter eine kompakte, fehlerfreie Detail-Karte mit Euro-Ersparnis bzw. Kosten und Wirkungsgrad.
- **Transparente Sensor-Zuordnung (Single Source of Truth in den Einstellungen):**
  - In den Home Assistant Einstellungen werden die 6 Energie-Kanäle (`PV`, `Hauslast`, `Netzbezug`, `Netzeinspeisung`, `Batterie-Ladung`, `Batterie-Entladung`) klar mit ihren beiden Quellen (**Live-Watt-Sensor** + **kWh-Zähler**) verknüpft und zeigen direkt an, ob der jeweilige Wert aktuell aus dem kWh-Zähler oder aus der Live-Watt-Integration stammt.

---

## 3. Key Product Decisions & Trade-Offs

- **Entscheidung 1: Einheitliche Energie-Bilanz aus Live-Watt + kWh-Zählern**
  - *Gewählter Ansatz:* Jede Kennzahl (`PV`, `Haus`, `Netzbezug`, `Einspeisung`, `Batterie-Ladung`, `Batterie-Entladung`) wird über eine zentrale Bilanz-Funktion aufgelöst, die automatisch den konfigurierten `kWh`-Zähler und das Trapez-Integral des zugehörigen `Watt`-Sensors kombiniert und `Gesamtjahr ≥ Monat ≥ Heute` erzwingt.
  - *Warum:* Selbst wenn in Home Assistant für einzelne Pfade (z. B. Batterie oder Hausverbrauch) nur ein Watt-Sensor oder nur ein Tages-/Gesamtzähler existiert oder die HA-Historie älter als 10 Tage bereinigt wurde, bleiben alle Zahlen über `Heute`, `Monat` und `Gesamtjahr` hinweg physikalisch schlüssig.
- **Entscheidung 2: Kompakte 100-%-Viewport-Sankey-Geometrie statt 600px-Mindestbreite**
  - *Gewählter Ansatz:* Kompaktes SVG-Koordinatensystem (`viewBox="0 0 540 310"`) mit klaren Sankey-Balken, großen Schriften und kollisionsfreien Pfaden, kombiniert mit einem symmetrischen `2x2` / `1x4` KPI-Raster darunter.
  - *Warum:* Auf Smartphones (360–412 px Breite) bleibt das gesamte Energiefluss-Schaubild auf einen Blick ohne seitliches Wischen erfassbar.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│            HOME ASSISTANT SENSOR SETTINGS (W / kW  +  kWh)               │
│  • Leistung (W):  PV, Hauslast, Netzbezug, Einspeisung, Akku Lade/Entl.  │
│  • Zähler (kWh):  PV (WR 1..n & Strings), Netzbezug, Einspeisung, Akku   │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│          SINGLE SOURCE OF TRUTH: UNIFIED ENERGY LEDGER ENGINE            │
│  1. Zähler-Baseline-Sync: Monatsstart ≤ Tagesstart (Heilung bei >10d HA) │
│  2. Getrennter Cache für Tages-Integral (24h) & Monats-Integral (30d)    │
│  3. Kanal-Fusion je Zeitraum: kWh-Delta ∪ Watt-Trapez-Integral           │
│  4. Physikalische Invariante: Jahr ≥ Monat ≥ Heute für alle 6 Kanäle     │
└───────────┬────────────────────────┬─────────────────────────┬───────────┘
            │                        │                         │
            ▼                        ▼                         ▼
┌───────────────────────┐ ┌──────────────────────┐ ┌───────────────────────┐
│   Vollbreites Sankey  │ │ Monats-Soll/Ist Card │ │  Autarkie, Batterie & │
│ (Heute / Monat / Jahr)│ │  & Jahres-Logbuch    │ │   ROI-Amortisation    │
└───────────────────────┘ └──────────────────────┘ └───────────────────────┘
```

### Interactive Component & State Mapping

1. **Zentrale Kanal-Auflösung (`computeUnifiedEnergyLedger`)**:
   - Liest für jeden der 6 Kanäle (`pv`, `load`, `gridImp`, `gridExp`, `batChg`, `batDis`) sowohl die `kWh`-Zählerdifferenz (`dayStartByEntity` / `monthStartByEntity`) als auch das aus den `Watt`-Sensoren berechnete Trapez-Integral (`intradayHistoryCache.day` / `intradayHistoryCache.month`).
   - Korrigiert `monthStartByEntity[id]` automatisch nach unten, falls `dayStartByEntity[id] < monthStartByEntity[id]` ist.
   - Stellt sicher, dass der Wechsel zwischen `Tag`, `Woche` und `Monat` im Live-Diagramm niemals die Tages-Energiewerte (`day`) überschreibt.
2. **Vollbreites, kollisionsfreies Sankey-Rendering (`renderSankeyDiagram`)**:
   - Entfernt `min-w-[600px]` und horizontales Abschneiden; zeichnet links die Quellen (`PV-Erzeugung`, `Netzbezug`), mittig `PV-Direkt` und `Batteriespeicher` und rechts die Senken (`Hausverbrauch`, `Netzeinspeisung`) mit proportionalen Bézier-Bändern ohne überlappende Text-Pills.
   - Ersetzt das fehlerhafte Icon `battery_android` durch `battery_charging_full` und richtet das 4er-KPI-Band darunter als `grid-cols-2 sm:grid-cols-4` aus.
