# Full-Bleed Diagramm-Vergrößerung, Fadenkreuz-Readout, Light/Dark-Konsistenz & Schneller Zeitraum-Wechsel (Version 9.6)

Das Verlaufsdiagramm („Tagesverlauf · Telemetrie“) wird so optimiert, dass ein Tap in die Grafik das Diagramm **in-place bis an den Bildschirmrand (Full-Bleed)** vergrößert und die **linke sowie rechte Achsenskala ausblendet (+20 % mehr Kurvenbreite)**, das verdeckende Tooltip-Popup durch eine **vertikale Fadenkreuz-Linie mit Kopfleisten-Anzeige** ersetzt wird, alle Vergrößerungs- und Vollbildansichten **strikt im gewählten Light- oder Dark-Mode bleiben** und der **Tag / Woche / Monat-Umschalter verzögerungsfrei** reagiert.

---

## User Review & Bestätigte Entscheidungen

> [!IMPORTANT]
> Die folgenden Punkte wurden auf Basis deiner Antworten festgelegt:

- **In-Place Vergrößerung bis zum Bildschirmrand (Full-Bleed) ohne Achsenskalen**: Ein Tap auf das Diagramm öffnet nicht mehr das Hochkant-Fullscreen-Modal, sondern vergrößert den Diagrammkasten direkt an Ort und Stelle über die gesamte Bildschirmbreite (`Edge-to-Edge`) und blendet die linke (`W`) und rechte (`%`) Y-Achsen-Skala komplett aus. Das echte Vollbild / 90°-Querformat wird ausschließlich gezielt über die oberen Buttons (`Vollbild` / `90°`) geöffnet.
- **Kein verdeckendes Tooltip-Popup mehr**: Das schwebende Chart.js-Popup auf der Grafik wird deaktiviert. Beim Berühren oder Ziehen über die Kurve erscheint eine präzise vertikale Fadenkreuz-Linie, während die Messwerte unverdeckt in der Leiste direkt über dem Diagramm angezeigt werden.
- **Strikte Beibehaltung des gewählten Light- / Dark-Modes**: Sowohl die In-Place-Vergrößerung als auch das Vollbild-Overlay (`#modal-intraday-fullscreen`) übernehmen zu 100 % das aktive Farbschema (Light-Mode bleibt hell, Dark-Mode bleibt dunkel – kein erzwungener Dark-Mode mehr beim Vergrößern).
- **Verzögerungsfreier Tag / Woche / Monat-Umschalter**: Sofortige optische Umschaltung beim Antippen (0 ms) kombiniert mit einem In-Memory-Cache pro Zeitraum (`day`, `week`, `month`), `AbortController` für laufende Abfragen und Hintergrund-Preloading.

---

## 1. Überblick & Kernkonzept

- **Was sich verbessert**:
  1. **Maximale Kurvenbreite auf dem Smartphone (+20 % Platzgewinn)**: Im vergrößerten In-Place-Modus entfällt der äußere Kartenrand (`-mx-3 sm:-mx-5`) sowie der Platzbedarf der linken Watt-Skala und rechten SoC-Skala. Die Kurve nutzt 100 % der Displaybreite von Kante zu Kante.
  2. **Freie Sicht auf die Kurven beim Scannen mit dem Finger**: Kein schwarzer Kasten überdeckt mehr die Spitzenwerte; eine feine vertikale Linie markiert den Zeitpunkt, und die Werte stehen sauber lesbar darüber.
  3. **Konsistentes Theme ohne Modus-Bruch**: Wer im hellen Design arbeitet, bleibt auch in der Vergrößerung und im Vollbild im hellen Design.
  4. **Sofortiges Umschalten zwischen Tag, Woche und Monat**: Kein Warten mehr auf den mehrfachen Megabyte-Download aus Home Assistant bei jedem Wechsel.

---

## 2. User Experience & Visuelles Design

- **Zwei klare Vergrößerungsstufen**:
  - **Stufe 1: In-Place Full-Bleed Zoom (Tap direkt auf das Diagramm)**:
    - Dehnt den Sticky-Diagrammcontainer bis an den linken und rechten Bildschirmrand aus (`-mx-3 sm:-mx-5 rounded-none border-x-0`), erhöht die Diagrammhöhe (`h-60 sm:h-80 md:h-96`) und schaltet `yPower.display = false` sowie `ySoc.display = false` (keine seitlichen Achsenbeschriftungen, 0 px Seitenrand).
    - Ein erneuter Tap (oder Klick auf das kleine „Kompakt“-Badge) schaltet sanft zurück in die Standardgröße.
  - **Stufe 2: Vollbild / 90°-Querformat (nur über die Buttons „Vollbild“ & „90°“ oben)**:
    - Öffnet das Vollbild-Overlay im aktuellen Light- oder Dark-Mode; auch dort sind die seitlichen Achsenbeschriftungen auf Wunsch ausblendbar bzw. randlos optimiert.
- **Fadenkreuz-Plugin statt Popup**:
  - Ein leichtgewichtiges Canvas-Plugin zeichnet bei aktivem Touch/Hover eine vertikale Führungslinie (`1px dashed`) über die volle Diagrammhöhe.
- **Theme-Treue (Light & Dark Mode)**:
  - `#modal-intraday-fullscreen` und die Kurven-Chips im Vollbild erhalten vollständige Light/Dark-Klassenpaare (`bg-white/95 dark:bg-slate-950/95`, `text-slate-900 dark:text-white`, `bg-slate-100/90 dark:bg-[#0b151a]/90`).

---

## 3. Produktentscheidungen & Performance-Architektur

- **Entscheidung 1: Warum war der Tag/Woche/Monat-Umschalter bisher träge – und wie lösen wir es?**
  - *Ursache*: Bisher wurden die Buttons erst nach Abschluss des kompletten Home-Assistant-History-Downloads umgefärbt, und jeder Klick auf `Woche` oder `Monat` lud alle Rohdaten ungecacht neu herunter.
  - *Gewählter Ansatz*:
    1. **Sofort-UI-Update (0 ms)**: Button-Status, Titel und Lade-Indikator aktualisieren sich synchron im selben Frame wie der Klick.
    2. **In-Memory Cache (`intradayHistoryCache`)**: Speichert die fertig berechneten Zeitreihen für `day`, `week` und `month` im Arbeitsspeicher. Ist ein Zeitraum bereits im Cache, wird das Diagramm sofort (< 10 ms) gerendert und im Hintergrund still aktualisiert (Stale-While-Revalidate).
    3. **Hintergrund-Preloading**: Sobald die Tageskurve geladen ist, werden `week` und `month` einmalig im Hintergrund vorgeladen, damit schon der allererste Klick auf „Woche“ oder „Monat“ sofort da ist.

---

## 4. Technische Architektur & Interaktionsfluss

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Telemetrie-Diagramm (Ebene 2 Sticky Top)                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Kopfleiste: [Tag | Woche | Monat]  [Alle]  [Vollbild]  [90°]          │  │
│  │ Fadenkreuz-Readout: 14:25 Uhr · PV: 3.420 W · Haus: 610 W · SoC: 78 % │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│        ┌─────────────────────────────┴─────────────────────────────┐        │
│        ▼ (Tap auf Diagrammfläche)                                  ▼        │
│  ┌───────────────────────────────────────┐   ┌───────────────────────────┐  │
│  │ In-Place Full-Bleed Modus             │   │ Button "Vollbild" / "90°" │  │
│  │ • Bis zum Bildschirmrand (-mx-3/-mx-5)│   │ • Öffnet Vollbild-Overlay │  │
│  │ • Linke & rechte Y-Skala ausgeblendet │   │ • Bleibt im aktiven       │  │
│  │ • Höhere Grafik + 20% mehr Breite     │   │   Light- oder Dark-Mode!  │  │
│  │ • Kein Tooltip-Popup, nur Fadenkreuz  │   └───────────────────────────┘  │
│  └───────────────────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Interaktive State-Funktionen
- **`isIntradayChartExpanded` (`boolean`)**: Steuert den In-Place Full-Bleed-Modus (`toggleIntradayInlineExpand()`). Blendet im aktivierten Zustand die seitlichen Y-Achsen (`yPower` & `ySoc`) und das äußere Karten-Padding aus.
- **`intradayHistoryCache` (`{ day, week, month }`)**: Hält die berechneten Zeitreihen pro Zeitraum vor und sorgt in `setIntradayTimeframe(tf)` für sofortiges Umschalten ohne Wartezeit.
- **`intradayCrosshairPlugin`**: Zeichnet die vertikale Fadenkreuz-Linie bei `touchmove` / `mousemove` auf dem Canvas ohne verdeckendes Tooltip-Rechteck.
