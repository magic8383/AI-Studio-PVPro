# Implementierungsplan – Version 10.0

## 1. Aktive Verbraucher auf der Live-Seite: Hintergrund-Balken, Prio-Sortierung & optionale kWh-Sensoren

### A. Vollflächiger Hintergrund-Balken (Tagesverbrauch) mit Aktiv-/Inaktiv-Farblogik
- **Zeilen-Design als Fortschrittsbalken:** Jede Verbraucher-Zeile auf dem Live-Dashboard erhält im Hintergrund einen von links nach rechts laufenden Balken, dessen Breite den **Tagesverbrauch (`kWh heute`)** im Verhältnis zum stärksten Tagesverbraucher widerspiegelt:
  - **Aktiv (`> 5 W` Live-Leistung):** Sanfter Pastell-Rahmen (`border-teal-500/45 dark:border-teal-400/40`) und ein heller Pastell-Fortschrittsbalken im Hintergrund (passend zu den oberen Hauptkacheln) sowie ein pulsierender Aktiv-Indikator.
  - **Inaktiv (`0 W`, aber heute bereits gelaufen):** Dezenter Rahmen (`border-slate-200/80 dark:border-slate-800`) und ein **grauer Hintergrund-Balken** (`bg-slate-200/70 dark:bg-slate-700/40`), sodass man sofort sieht, wie viel das Gerät heute schon verbraucht hat, obwohl es gerade ausgeschaltet ist.
- **Klare Anzeige auf dem Smartphone:**
  - Links: Gerätename + direkt darunter bzw. daneben klein der **Tagesverbrauch (`z. B. 1,85 kWh heute · 28 %`)** – auch auf dem Smartphone immer sichtbar.
  - Rechts: Große **Live-Wattzahl (`W` / `kW`)**.

### B. Interaktiver Sortier-Umschalter statt „Verbraucher verwalten“-Button
- Der Button **„Verbraucher verwalten“** auf der Live-Seite entfällt.
- Stattdessen erscheint oben rechts neben „Aktive Verbraucher“ ein interaktiver **Sortier-Umschalter**:
  1. **`Prio: Live → kWh` (Standard):** Aktive Verbraucher (`> 5 W`) stehen ganz oben (sortiert nach `W`); direkt darunter rutschen ausgeschaltete Geräte, die heute bereits Strom verbraucht haben (`kWh > 0`), automatisch nach oben (sortiert nach Tages-`kWh`).
  2. **`Prio: Heute kWh`:** Sortiert alle Verbraucher rein nach ihrem heutigen Tagesverbrauch (`kWh`), unabhängig davon, ob sie in dieser Sekunde eingeschaltet sind.

### C. Optionale `kWh`-Sensoren für jeden Einzelverbraucher
- In den Home-Assistant-Einstellungen (**Sektion 4: Einzelverbraucher**) erhält jedes Gerät neben dem `W`-Sensor ein zweites kompaktes Feld **„Energiezähler (kWh, optional)“** mit Nur-Icon-Auswahlbutton (`list_alt`).
- Ist dort ein `kWh`-Zähler (z. B. von einem Shelly `energy` / `total_increasing` oder Tageszähler) hinterlegt, wird der Tagesverbrauch exakt über die `00:00`-Uhr-Differenz berechnet; bleibt das Feld leer, berechnet die App den Tagesverbrauch weiterhin automatisch per Trapez-Integration aus dem Watt-Sensor.

---

## 2. Globales Mess-Startdatum (z. B. 01.11.2026) & Behebung der überhöhten November-kWh (~213,5 statt ~125 kWh)

### A. Globales Mess-Startdatum (`trackingStartDate`) + Logbuch-Korrektur
- **Neues Feld „Mess-Startdatum (Zählbeginn)“** (Standard z. B. `2026-11-01`), einstellbar sowohl in den Sensor-Einstellungen (Sektion 2) als auch direkt oben in der Performance-Analyse / im Monats-Logbuch.
- **Wirkung des Startdatums:**
  - Monate **vor** dem gewählten Startdatum werden nicht mit alten Zählerständen befüllt.
  - Für den Monat des Startdatums (z. B. November 2026) wird die Zähler-Historie und Langzeit-Statistik exakt **ab dem Startdatum (`00:00` Uhr)** ausgewertet.
  - **Manuelle Logbuch-Priorität:** Wenn du im Monats-Logbuch einen Monatswert (z. B. November = `125 kWh`) manuell einträgst oder korrigierst, hat dieser korrigierte Wert Vorrang in der Jahres- und Monats-Bilanz (inkl. Sankey) und wird nicht mehr durch alte Zähler-Rohwerte überschrieben. Zusätzlich gibt es im Logbuch einen Button **„Aktuellen Stand als neuen Startpunkt setzen“** bzw. direkte Korrekturfelder.

### B. Technische Korrekturen an der Zähler-Differenzbildung
- **Erkennung von `yieldtotal` / `_total` ohne Wortgrenze:** Sensoren wie `sensor.opendtu_4d5150_yieldtotal` wurden bisher durch die RegEx `\btotal\b` (wegen des fehlenden Leerzeichens vor `total`) teilweise nicht als `total_increasing`-Gesamtzähler erkannt. Die Erkennung prüft nun zuverlässig auch zusammengesetzte Namen (`yieldtotal`, `energytotal`, `_total`), während `yieldday` / `today` sauber als Tageszähler erkannt werden.
- **Filterung nächtlicher `0`-Werte bei schlafenden Wechselrichtern:** Wenn ein Mikro-Wechselrichter (z. B. Hoymiles/OpenDTU) nachts um `00:00` Uhr `0` liefert, wird niemals `0` als Monats-Startwert für einen Gesamtzähler übernommen, sondern der erste echte positive Zählerstand (`> 0`) bzw. das `sum`/`change`-Delta aus der Home-Assistant-Langzeitstatistik (`recorder/statistics_during_period`).

---

## 3. Versionierung & Dokumentation
- Inkrementierung der App-Version um `0.1` auf **Version 10.0** synchron über alle Projektdateien (`package.json`, `index.html`, `app.js`, `server.js`, `telemetry.js`, `dossier.js`, `sw.js`, `manifest.json`, `DEVELOPMENT_GUIDELINES.md`, `content.js` und `CHANGELOG.md`).
