# Monatliche Ertrags-Zusammenfassung & PVGIS-Soll-Ist-Abgleich (Version 9.5)

Direkt auf der **Analyse-Hauptseite** (`#analyse-hub-view`) wird eine eigenständige, übersichtliche **Monats-Übersichtskarte („Monatliche Ertragsleistung · Ist vs. PVGIS-Soll“)** ergänzt, die den tatsächlichen Monatsertrag (aus Live-Home-Assistant-Zählern oder dem Monats-Logbuch) vollautomatisch mit dem standortgenauen PVGIS-Soll abgleicht, für den laufenden Monat ein taggenaues **Pro-Rata-Soll bis heute** berechnet und die prozentuale Abweichung (`+/- %`) samt Fortschrittsbalken darstellt.

---

## User Review & Bestätigte Entscheidungen

> [!IMPORTANT]
> Die folgenden Punkte wurden auf Basis deiner Antworten festgelegt:

- **Platzierung direkt auf der Analyse-Hauptseite**: Eigene Hauptkarte im Analyse-Hub zwischen den Jahres-KPIs / dem Sankey-Energiefluss und den Detail-Kacheln, sodass du sofort beim Öffnen von „Analyse“ den aktuellen Monatsstand und alle Monate im Blick hast.
- **Taggenaues anteiliges Monats-Soll (Pro-Rata bis heute) + Monats-Gesamtsoll**: Für den aktuell laufenden Kalendermonat wird das PVGIS-Monatssoll zusätzlich anteilig auf den heutigen Kalendertag umgerechnet ($\text{Soll}_{\text{bis heute}} = \text{Soll}_{\text{Monat}} \times \frac{\text{Tag}}{\text{Tage im Monat}}$). Damit zeigt die prozentuale Abweichung (`+/- %`) auch mitten im Monat ein faires, realistisches Ergebnis statt eines künstlichen Minuswerts.
- **Fortschrittsbalken, `+/- %` Abweichung & Datenquellen-Kennzeichnung**: Jeder Monat zeigt Ist-kWh vs. Soll-kWh, einen visuellen Erfüllungsbalken, die prozentuale Abweichung (`+12,4 %` / `-4,2 %`) sowie die Datenquelle (`Live HA` bei automatischer Zählerübernahme bzw. `Logbuch` bei manueller Eintragung).

---

## 1. Überblick & Kernkonzept

- **Was die Funktion leistet**:
  1. **Fokus-Banner für den aktuellen / zuletzt erfassten Monat**: Hebt oben in der neuen Karte den laufenden Monat prominent hervor – inklusive Ist-Ertrag (`kWh`), taggenauem PVGIS-Soll bis heute (`Pro-Rata kWh`), vollem PVGIS-Monatssoll (`kWh`), prozentualer Abweichung (`+/- %` ggü. Pro-Rata-Soll sowie Erfüllungsgrad des Gesamtmonats) und Herkunftskennzeichnung (`Live HA · Zähler-Differenz` oder `Manuell · Logbuch`).
  2. **Kompakte 12-Monats-Übersichtsmatrix / Vergleichsliste**: Zeigt darunter alle Monate des gewählten Betriebsjahres mit Fortschrittsbalken, Ist- vs. Soll-kWh, prozentualer Abweichung (`+/- %`) und Status-Indikator. Ein Filter-Umschalter erlaubt den Wechsel zwischen **„Erfasste & aktueller Monat“** (kompakt für Mobilgeräte) und **„Alle 12 Monate“**.
  3. **Konsistenter Jahres-PR mit Pro-Rata-Gewichtung**: Auch in der oberen Jahres-KPI-Karte (`Erfüllungsgrad (PR)` und `Soll im Zeitraum`) wird für den laufenden Monat das taggenaue Pro-Rata-Soll berücksichtigt, damit ein erst zur Hälfte vergangener Monat den Jahres-Erfüllungsgrad nicht künstlich nach unten zieht.
- **Mehrwert**: Du siehst auf einen Blick und ohne Klick in Untermenüs, ob deine PV-Anlage im aktuellen Monat und in den bisherigen Monaten über oder unter der standortgenauen PVGIS-Ertragsprognose liegt.

---

## 2. User Experience & Visuelles Design

- **Darstellung & Hierarchie**:
  - **Ästhetik**: Liquid-Glass / Material Design 3 Expressive passend zum bestehenden Analyse-Cockpit, vollständig harmonisiert für Light- und Dark-Mode.
  - **Typografie & Zahlen-Disziplin**: Alle Ertrags-, Soll- und Prozentwerte nutzen `font-mono tabular-nums`, damit kWh-Zahlen und Prozentwerte vertikal exakt fluchten.
  - **Semantische Farbgebung für Abweichungen**:
    - **Über Soll ($\ge 0\,\%$ Abweichung)**: Smaragdgrün (`text-emerald-600 dark:text-emerald-400`, Balken `bg-emerald-500`) mit `+X,X %`
    - **Leicht unter Soll ($-10\,\%$ bis $< 0\,\%$)**: Amber (`text-amber-600 dark:text-amber-400`, Balken `bg-amber-500`) mit `-X,X %`
    - **Deutlich unter Soll ($< -10\,\%$)**: Rose/Rot (`text-rose-600 dark:text-rose-400`, Balken `bg-rose-500`) mit `-X,X %`
    - **Zukünftige / noch offene Monate**: Ruhiges Slate-Grau mit ausgewiesenem PVGIS-Sollwert als Ausblick.
- **Interaktive Bedienelemente**:
  - Segmentierter Umschalter im Kartenkopf: **„Aktuell & Erfasst“** vs. **„Alle 12 Monate“**.
  - Direkt-Links zum Öffnen des detaillierten 12-Monats-Balkendiagramms (`Soll-Ist-Vergleich`) oder des `Monatswerte-Logbuchs`.

---

## 3. Produktentscheidungen & Berechnungslogik

- **Entscheidung 1: Pro-Rata-Berechnung im laufenden Monat**
  - *Gewählter Ansatz*: Für den aktuellen Monat im aktuellen Kalenderjahr wird anhand des Kalendertages $d$ und der Gesamtanzahl der Tage im Monat $D_{\text{Monat}}$ das anteilige Soll berechnet:
    $$\text{Soll}_{\text{Pro-Rata}} = \text{Soll}_{\text{PVGIS, Monat}} \times \frac{d}{D_{\text{Monat}}}$$
    Die prozentuale Abweichung im laufenden Monat bemisst sich gegen $\text{Soll}_{\text{Pro-Rata}}$:
    $$\Delta \% = \left(\frac{\text{Ist}_{\text{Monat}} - \text{Soll}_{\text{Pro-Rata}}}{\text{Soll}_{\text{Pro-Rata}}}\right) \times 100$$
    Zusätzlich wird weiterhin das volle Monats-Gesamtsoll ($\text{Soll}_{\text{PVGIS, Monat}}$) und dessen bisheriger Erreichungsgrad ausgewiesen.
  - *Warum*: Ohne Pro-Rata-Abgleich hätte jede Anlage am 10. eines Monats scheinbar `-66 %` Minderertrag, obwohl sie exakt auf Kurs liegt.
- **Entscheidung 2: Zentrale Berechnung in `computeAggregatedPerformanceMetrics`**
  - *Gewählter Ansatz*: Alle Pro-Rata-Werte, prozentualen Abweichungen (`deviationPct`, `proRataSollKwh`, `daysElapsed`, `daysInMonth`, `dataSourceLabel`) werden zentral in `computeAggregatedPerformanceMetrics()` berechnet und sowohl von der neuen Analyse-Hauptkarte als auch von den Detail-Ansichten genutzt (Single Source of Truth).

---

## 4. Technische Architektur & Datenfluss

```
┌───────────────────────────────────────────────────────────────────────────┐
│              Zentrale Datenquellen (Single Source of Truth)               │
│  • PVGIS-Monatsprognose: getPlannedSystemBaseline().monthlySollTotal[0..11]│
│  • Live HA Monatszähler: currentLiveTelemetry.pvEnergyMonthKwh            │
│  • Manuelles Logbuch:    getCurrentYearMonthsData(selectedAnalysisYear)   │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                 computeAggregatedPerformanceMetrics()                     │
│  Je Monat m (0..11):                                                      │
│  1. Ist-Ertrag bestimmen (Manuell im Logbuch ODER automatisch Live HA)    │
│  2. Prüfen ob laufender Monat (selectedAnalysisYear == curYear & m == cur)│
│  3. Pro-Rata-Soll berechnen: sollKwh * (curDay / daysInMonth)             │
│  4. Effektives Vergleichs-Soll: isCurrentMonth ? proRataSoll : sollKwh    │
│  5. Abweichung (%) = ((realPv - effectiveSoll) / effectiveSoll) * 100     │
└──────────────────┬───────────────────────────────────┬────────────────────┘
                   │                                   │
                   ▼                                   ▼
┌──────────────────────────────────────┐ ┌──────────────────────────────────┐
│   Analyse-Hauptseite (Hub View)      │ │   Analyse Ebene 2 (Drill-Down)   │
│  • Jahres-KPIs (mit Pro-Rata-Soll)   │ │  • 12-Monats-Balkendiagramm      │
│  • NEU: Monats-Ertrags-Zusammenf.    │ │  • Detailkarten mit +/- %        │
│    - Fokus-Block Aktueller Monat     │ │  • Monatswerte-Logbuch           │
│    - Monats-Liste mit Fortschritt    │ │    (Live HA / Manuell)           │
│      & Filter (Erfasst / Alle 12)    │ └──────────────────────────────────┘
└──────────────────────────────────────┘
```

### Interaktive Komponenten & State-Mapping
- **`monthlyYieldFilterMode` (`'recorded'` | `'all'`)**: Steuert, ob in der Zusammenfassungskarte auf der Analyse-Hauptseite kompakt die bereits erfassten Monate inkl. aktuellem Monat oder alle 12 Kalendermonate angezeigt werden.
- **`setMonthlyYieldSummaryFilter(mode)`**: Wechselt den Ansichtsfilter und rendert die Monats-Zusammenfassung sofort neu.
- **`renderMonthlyYieldSummaryCard(baseline, metrics)`**: Aktualisiert das Fokus-Banner des aktuellen Monats (Ist, Pro-Rata-Soll, Gesamt-Soll, `+/- %` Abweichung, `Live HA`-Kennzeichnung) sowie die darunterliegende Monatsliste.
