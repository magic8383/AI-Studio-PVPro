# Implementierungsplan – PV-Planung Pro (Version 9.1)

## Zielsetzung
Optimierung der mobilen Darstellung und Home-Assistant-Sensorlogik anhand deiner beiden Smartphone-Screenshots und Rückmeldungen:
1. **Keine abgeschnittenen Zweitwerte in den Kacheln (Wert zuerst & Zweizeiler)**
2. **Zwei getrennte Batterie-Leistungssensoren (`Ladeleistung` & `Entladeleistung`)**
3. **Kurze 1-Wort-Überschriften (`Live`, `Analyse`, `Planung`) für garantierte Einzeiligkeit**
4. **Stabile Tageswerte (`Heute kWh`) ohne Zurückspringen auf den `Total`-Gesamtzähler**

---

## 1. Kachel-Layout: Wert zuerst & Zweizeiler (Ebene 1 & Ebene 2)
* **Problem (Screenshot 1)**: In den 2×2 Status-Kacheln (`PV gesamt`, `Hausverbrauch`, `BYD HVS+`, `Netz`) steht bisher das Statuswort vor dem Zahlenwert (`Erzeugung · Heute 0,...`, `Hauslast · Heute 4,25 ...`, `Ausgeglichen · 3,56 k...`). Auf schmalen Smartphone-Displays wird dadurch genau der wichtige `kWh`-Wert am Zeilenende abgeschnitten. Auch die Kacheltitel oben (`PV gesamt · ...`, `Hausv...`, `Netz · Bezug ...`) werden unnötig gekürzt.
* **Lösung**:
  * **Kompakte Kacheltitel ohne Abschneiden**: `PV gesamt`, `Hauslast`, `BYD HVS+`, `Stromnetz`.
  * **Zweizeiliger Unterblock mit Zahlenwert zuerst**:
    * **Zeile 1 (Hervorgehoben, ungekürzt)**: Der Tages- bzw. Leistungswert steht immer ganz links an erster Stelle, z. B. **`0,80 kWh heute`** (PV), **`4,25 kWh heute`** (Hauslast), **`+0 W · 0,0 / 2,2 kWh`** (Batterie) bzw. **`3,56 kWh Bezug`** (Netz).
    * **Zeile 2 (Kompakter Status)**: Status-Info darunter in einer eigenen kompakten Zeile (`Erzeugung aktiv`, `Direktverbrauch`, `Ruhe / Standby`, `0,00 kWh Einspeisung`).
  * **Ebene 2 (Messkanäle unter dem Tagesdiagramm)**: Auch in den Kanal-Kacheln werden Tagesertrag (`15,32 kWh heute`) und Spitzenwert (`Max 231 W`) sauber zweizeilig mit dem Zahlenwert zuerst dargestellt.

---

## 2. Batterie mit 2 Sensoren: Ladeleistung & Entladeleistung
* **Anforderung**: Unterstützung für Wechselrichter/Speicher (z. B. BYD / Fronius / Modbus), die **Ladeleistung (W)** und **Entladeleistung (W)** über zwei getrennte positive Sensoren bereitstellen.
* **Umsetzung**:
  * **HA-Konfiguration & Komfort-Sensor-Picker**:
    * Zwei neue Sensor-Felder im Bereich **2. Speicher & Stromnetz**:
      1. **Batterie Ladeleistung (W)** (`batteryChargePower`) + `Wählen`-Button
      2. **Batterie Entladeleistung (W)** (`batteryDischargePower`) + `Wählen`-Button
    * Das bisherige Feld `batteryPower` bleibt als optionaler Kombi-Sensor (+/- W) erhalten, falls nur ein einzelner Vorzeichen-Sensor genutzt wird.
  * **Live-Auswertung & Verlaufsdiagramm**:
    * Sobald `batteryChargePower` und/oder `batteryDischargePower` gesetzt sind, wird die Netto-Batterieleistung automatisch als `Ladeleistung (W) - Entladeleistung (W)` berechnet (`+W` = Laden, `-W` = Entladen).
    * In der 24h-Historie (`00:00 – jetzt`) werden beide Sensoren abgefragt, zur gemeinsamen Batterie-Kurve verrechnet und getrennt in **Tages-Ladung (`↑ kWh`)** sowie **Tages-Entladung (`↓ kWh`)** integriert.

---

## 3. Kurze 1-Wort-Überschriften (Immer 1 Zeile)
* **Problem (Screenshot 2)**: Lange Überschriften wie `PV-Planung & Auslegung (6-Schritte-Assistent)` oder `Sankey & Performance-Analyse` brechen auf dem Smartphone mehrzeilig um.
* **Lösung**:
  * Hauptüberschriften im Header (`#main-section-title`) und in den Hauptkarten der Tabs werden auf **1 prägnantes Wort** (`whitespace-nowrap`) gekürzt:
    * Tab 1: **`Live`**
    * Tab 2: **`Analyse`** (bzw. **`Performance`** in der Analyse-Karte)
    * Tab 3: **`Planung`**
  * Zusatzinformationen stehen ausschließlich in der dezenten Unterzeile darunter.

---

## 4. Fix: Tageserzeugung (`Heute kWh`) springt nicht mehr auf `Total` zurück
* **Ursache**:
  1. Beim Abruf der 00:00-Uhr-Startwerte über `/api/history/period` mit `&no_attributes` fehlte ohne geöffneten Sensor-Picker die Einheiten-Skalierung (`Wh` vs. `kWh`) aus den Live-Attributen (`statesMap`).
  2. Wenn ein `total_increasing`-Zähler nachts zwischen `00:00` und `02:00` keinen neuen Datenpunkt geschrieben hat oder ein einzelner History-Abruf leer zurückkam, fiel `resolveEnergyCounterDelta()` bei Zählerständen oder fehlendem Startwert auf den **Gesamtzählerstand (`Total`)** zurück.
* **Lösung**:
  * **Einheitensichere 00:00-Referenz**: `syncEnergyCounterBaselinesFromHaHistory()` nutzt direkt die Einheiten (`Wh`, `kWh`, `MWh`) und `state_class` (`total_increasing`, `total`) aus den aktuellen Live-States (`statesMap`) und sucht den ersten gültigen Tageswert ab `00:00 Uhr` über den gesamten bisherigen Tag.
  * **Persistente Tages-Baseline (`localStorage`)**: Ein einmal ermittelter 00:00-Startwert des aktuellen Kalendertages wird niemals durch einen fehlgeschlagenen Folge-Request gelöscht.
  * **Kein Fallback auf den Roh-Gesamtzähler**: Wenn für einen Gesamtzähler (`total` / `total_increasing`) im allerersten Moment noch kein 00:00-Startwert vorliegt, wird sofort der aktuelle Zählerstand als Referenz verankert und bis zum Eintreffen der History das **Leistungs-Integral (aus der Watt-Kurve seit 00:00 Uhr)** angezeigt – niemals der ungekürzte `Total`-Zählerstand.
