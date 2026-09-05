# Handbuch — PV-Planung Pro

Umfassende Dokumentation zur Bedienung, physikalischen Modellierung, elektrotechnischen Normen und kaufmännischen Berechnungsgrundlagen der Anwendung **PV-Planung Pro**.

---

## Inhaltsverzeichnis
1. [Systemübersicht & Architektur](#1-systemübersicht--architektur)
2. [Bedienungsanleitung: Modul für Modul](#2-bedienungsanleitung-modul-für-modul)
   - [Tab 1: Strings & Standort](#tab-1-strings--standort)
   - [Tab 2: Verkabelung & String-Schaltplan](#tab-2-verkabelung--string-schaltplan)
   - [Tab 3: Verbrauch & Lastprofile](#tab-3-verbrauch--lastprofile)
   - [Tab 4: Investition & Gewerke](#tab-4-investition--gewerke)
   - [Tab 5: Kosten & Sektorenkopplung](#tab-5-kosten--sektorenkopplung)
   - [Tab 6: Auswertung & 8.760h-Matrix](#tab-6-auswertung--8760h-matrix)
   - [Tab 7: Komponenten-Datenbank](#tab-7-komponenten-datenbank)
3. [Physikalische & Mathematische Grundlagen](#3-physikalische--mathematische-grundlagen)
   - [Temperaturabhängige Kennlinien & VDE-Spannungsprüfung](#temperaturabhängige-kennlinien--vde-spannungsprüfung)
   - [Stundengenaue Mismatch-Berechnung](#stundengenaue-mismatch-berechnung)
   - [Die 8.760-Stunden-Simulationsmatrix](#die-8760-stunden-simulationsmatrix)
   - [DC-Leitungswiderstand, Spannungsabfall & Verlustleistung](#dc-leitungswiderstand-spannungsabfall--verlustleistung)
   - [Leiterschleifenminimierung nach DIN EN 62305 / VDE 0185-305](#leiterschleifenminimierung-nach-din-en-62305--vde-0185-305)
4. [Kaufmännische & Regulatorische Logiken](#4-kaufmännische--regulatorische-logiken)
   - [EEG 2023 / 2024 Mischvergütung & Degression](#eeg-2023--2024-mischvergütung--degression)
   - [Fossil-Substitution nach Brennwert](#fossil-substitution-nach-brennwert)
   - [Wirtschaftlichkeit & Stromgestehungskosten (LCOE)](#wirtschaftlichkeit--stromgestehungskosten-lcoe)
5. [Praxisleitfaden für Solarteure & Planer](#5-praxisleitfaden-für-solarteure--planer)

---

## 1. Systemübersicht & Architektur

**PV-Planung Pro** ist ein vollwertiges Planungs- und Simulationswerkzeug für Photovoltaik-Anlagen im Privat- und Gewerbebereich. Die Anwendung kombiniert:
* **Präzise Geodaten & Klimamodelle**: Reale stundengenaue Einstrahlungsdaten der europäischen Wetterdatenbank PVGIS (`seriescalc`) über einen dedizierten Hochleistungs-Proxy (`pvgis.mb10.org`) inklusive deterministischer Offline-Fallback-Engine.
* **Elektrotechnische Auslegung**: Grenzprüfungen nach VDE, Wechselrichter-MPPT-Tracking, stundengenaue Mismatch-Berechnung von Reihenschaltungen und Leiterschleifenminimierung nach DIN EN 62305.
* **Zerstückelte Dächer & Multi-Feld-Verkabelung**: Flexible Konfiguration von Hauptdächern, Gauben, Zwerchgiebeln und Firstseiten mit Zwischenbrücken und interaktiver Leitungsverlegung.
* **Sektorenkopplung & Smart-Home**: Synthetische Lastprofile nach VDI 4655, dynamische Wärmepumpen-Profile mit Jahresarbeitszahl (JAZ) und wettergeführtes Überschussladen für E-Autos.
* **Offline-Fähigkeit (PWA)**: Die Anwendung speichert alle Eingaben sicher im Browser-LocalStorage und kann als eigenständige App auf Mobilgeräten und Desktops installiert werden.

---

## 2. Bedienungsanleitung: Modul für Modul

### Tab 1: Strings & Standort
1. **Standortauswahl**:
   * Klicke auf `Ändern` und gib den Ortsnamen (z. B. *Berlin*, *München*, *Freiburg*) ein.
   * Das System ermittelt die geografischen Koordinaten (Breiten- und Längengrad) für den PVGIS-Wetterdatenabruf.
2. **Strings anlegen & Wechselrichter zuweisen**:
   * Ein *String* fasst PV-Module zusammen, die elektrisch in Reihe an einen MPPT-Tracker des Wechselrichters angeschlossen sind.
   * Wähle den gewünschten Wechselrichter aus der Datenbank. Die App zeigt sofort dessen Grenzwerte (Maximalspannung $U_{\text{max}}$, MPPT-Spannungsbereich, Startspannung, Maximalstrom) an.
3. **Modulfelder innerhalb eines Strings**:
   * Jeder String kann aus einem oder mehreren *Modulfeldern* bestehen (z. B. Feld 1: 12 Module auf dem Hauptdach mit 35° Neigung; Feld 2: 4 Module auf einer Dachgaube mit 15° Neigung).
   * Die App berechnet für jedes Feld die exakte Ausrichtung (Azimut: Süd = 0°, West = 90°, Ost = -90°) und Neigung.
4. **Verschattungs-Slider**:
   * Simuliert lineare Mindererträge durch Bäume, Kamine oder Nachbargebäude. Ein Wert von 10 % zieht 10 % der Einstrahlung vom betroffenen String ab.

---

### Tab 2: Verkabelung & String-Schaltplan
Das Verkabelungs-Modul dient der präzisen Auslegung der DC-Verkabelung, der Vermeidung gefährlicher Induktionsschleifen und der Ermittlung exakter Leitungslängen für die Baustelle.

#### A. Modulfelder & Zerstückelter Dachaufbau
* **Teilfelder verwalten**: Jedes Modulfeld des ausgewählten Strings kann direkt im Verkabelungs-Tab bearbeitet werden:
  * **Modulanzahl**: Anzahl der Solarmodule im jeweiligen Feld.
  * **Spalten (Breite) & Reihen (Höhe)**: Bestimmt die geometrische Anordnung auf der Dachfläche.
  * **Neigung (Tilt) & Modultyp**: Individuelle physikalische Ausrichtung jedes Teilfelds.
* **Weiteres Feld anlegen**: Über `Weiteres Feld anlegen (z.B. Gaube)` können zusätzliche Teilflächen zu einem String hinzugefügt werden.
* **Zwischenfeld-Brücken (Inter-Field Bridges)**:
  * Befinden sich mehrere Teilfelder in einem String, zeigt das System zwischen den Feldern automatisch eine Brücken-Verbindungskachel an.
  * Hier wird die Kabellänge in Metern eingetragen, die zur Überbrückung des Abstands zwischen den Feldern benötigt wird (z. B. 4,5 m über eine Gaubenkehle oder Brandwand).

#### B. Transparenter Kabelwege-Kalkulator (Formel)
Die Gesamtlänge der Solarkabel im String setzt sich aus vier exakt definierten Komponenten zusammen:
$$\text{Gesamtlänge}_{\text{roh}} = \text{Weg A} + \sum \text{Brücken} + \text{Modulkabel} + \text{Weg B}$$

1. **Weg A (Hinweg)**: Solarkabel vom Wechselrichter zum Pluspol des 1. Modulfelds.
2. **Feld-Brücken**: Summe aller konfigurierten Verbindungskabel zwischen den getrennten Feldern.
3. **Modulkabel-Pauschale**: Reale Modulanschlusskabel ($N_{\text{Module}} \times 2{,}0\,\text{m}$).
4. **Weg B (Rückweg)**: Solarkabel vom Minuspol des letzten Moduls zurück zum Wechselrichter.
* **Normgerechte Verlegereserve**: Zum Roh-Ergebnis wird eine Sicherheits- und Verlegereserve von **+10 %** hinzugerechnet, um Verschnitt, Schachtführungen und Biegeradien nach DIN VDE 0100-712 zu berücksichtigen.

#### C. Verlegemethoden (Leiterschleifenminimierung)
* **Reißverschluss (Leap-Frog)**:
  * Verbindet auf dem Hinweg jedes zweite Modul (1 ➔ 3 ➔ 5...) und auf dem Rückweg die geraden Module (6 ➔ 4 ➔ 2).
  * **Vorteil**: Die geometrisch aufgespannte Schleifenfläche ist nahezu null ($A_{\text{Schleife}} \approx 0\,\text{m}^2$). Dadurch können Naheinschläge von Blitzen keine zerstörerischen Überspannungen induzieren. Es wird kein separates Rückleiterkabel benötigt.
* **Schleifenarme Verlegung (paralleler Rückleiter)**:
  * Verbindet Module fortlaufend (1 ➔ 2 ➔ 3...). Der Minus-Rückleiter wird unmittelbar parallel an den Modulkabeln und Montageschienen zurückgeführt.
* **Standard Daisy-Chain**:
  * Konventionelle Reihenschaltung ohne parallele Rückleiterführung. Nur für Kleinstanlagen zulässig; erhöht das Induktionsrisiko bei Blitzeinschlägen.

#### D. Manuelle Zuweisung & Polaritäts-Invertierung
* **Interaktiv abstecken**: Durch Klick auf die Module im Schaltplan kann eine völlig freie Steckreihenfolge festgelegt werden. Die Module werden feldübergreifend mit Präfix gekennzeichnet (z. B. `F1-1`, `F1-2`, `F2-1`).
* **Feinjustierung**: Mit den Tasten `◀` und `▶` können Module in der Sequenz verschoben werden.
* **Polarität umkehren (+/-)**: Dreht die Flussrichtung der DC-Verkabelung mit einem Klick um (hilfreich, wenn der Wechselrichter näher am letzten Modul positioniert ist).

#### E. Dachhindernis-Manager
* Ermöglicht die Platzierung von Dachfenstern, Gauben, Kaminen und Freiflächen.
* Jedes Hindernis kann gezielt einem bestimmten Modulfeld zugeordnet werden und wird im Schaltplan visualisiert.

#### F. DC-Kabelverlust & Querschnitts-Empfehlung
* Berechnet den Spannungsabfall $\Delta U$, den prozentualen Verlust $\Delta U_{\%}$ sowie die thermische Verlustleistung $P_{\text{loss}}$ bei Nennstrom $I_{\text{mpp}}$.
* Bietet einen normativen Vergleich für **4 mm²**, **6 mm²** und **10 mm²** mit Ampel-Bewertung nach DIN VDE 0100-712 (< 1,0 % optimal, 1,0–1,5 % akzeptabel, > 1,5 % Querschnitt vergrößern).

---

### Tab 3: Verbrauch & Lastprofile
1. **Haushalts-Grundlast (VDI 4655)**:
   * Eingabe des Jahresstrombedarfs in kWh.
   * Die App verwendet das standardisierte VDI 4655 Lastprofil für Einfamilienhäuser mit dynamischen Tages- und Jahreszeitenverläufen (höherer Verbrauch an dunklen Winterabenden, niedrigerer Verbrauch an Sommertagen).
2. **Dauerlast (IT / Server / Standby)**:
   * Kontinuierliche elektrische Last in Watt, die 24 Stunden am Tag und 365 Tage im Jahr anliegt (z. B. Router, Überwachungskameras, NAS-Server).
3. **Wärmepumpe & Klimatisierung**:
   * **Heizungswärmepumpe**: Saisonal gewichteter Strombedarf mit starker Konzentration auf die Heizperiode (November bis März). Verknüpft mit der Jahresarbeitszahl (JAZ).
   * **Klimaanlage**: Saisonaler Verbrauch, der sich rein auf warme Sommertage konzentriert und optimal mit der PV-Erzeugung korreliert.
4. **E-Mobilität & Smart-Charging (Wetter-KI)**:
   * Eingabe der jährlichen Fahrleistung (km) und des Durchschnittsverbrauchs (kWh/100 km).
   * **Wetter-KI (Smart Charging)**: Ist dieser Schalter aktiviert, simuliert die App eine intelligente Überschussladesteuerung, die Ladezyklen bevorzugt in sonnenreiche Mittagsstunden legt.

---

### Tab 4: Investition & Gewerke
Ermöglicht eine transparente Kostenkalkulation nach realen Handwerks-Gewerken:
1. **PV-Hardware**: Module, Wechselrichter, Modulhalterungen, DC-Kabel.
2. **Batteriespeicher**: Speichermodule, BMS, Sockel.
3. **Montage & Gerüst**: Dachdeckerleistungen, Schienenmontage, Gerüstbau und Absturzsicherung.
4. **Elektroinstallation & AC**: Zählerschrankumbau, SLS-Schalter, Überspannungsschutz AC, Abnahme und Netzanmeldung.
* **Steuerbefreiung nach § 12 Abs. 3 UStG**: Bietet eine Umschaltung zwischen Netto- und Bruttopreisen (0 % Mehrwertsteuer für private PV-Anlagen in Deutschland). Die Summe fließt direkt in die Amortisationsberechnung ein.

---

### Tab 5: Kosten & Sektorenkopplung
1. **Stromtarife & Einspeisung**:
   * Aktueller Strombezugspreis (ct/kWh) und angenommene jährliche Strompreissteigerung (z. B. 2 %).
   * Inbetriebnahmedatum zur exakten Festlegung der gesetzlichen EEG-Einspeisevergütung.
2. **Fossil-Vergleich & Substitution**:
   * **Heizöl / Erdgas**: Angabe des Preises pro Liter Heizöl bzw. pro m³ Gas.
   * **Benzin / Diesel**: Angabe des Treibstoffpreises pro Liter und des Verbrauchs des bisherigen Verbrenner-Pkw.
   * Die App ermittelt die monetären Einsparungen, die durch den Betrieb von Wärmepumpe und E-Auto mittels PV-Eigenstrom erzielt werden.
3. **Berechnung anstoßen**:
   * Ruft die 8.760h-Wetterdaten ab und führt die vollständige Jahressimulation durch.

---

### Tab 6: Auswertung & 8.760h-Matrix
* **Autarkiegrad**: Anteil des Gesamtstrombedarfs, der durch PV-Direktverbrauch und Batteriespeicher gedeckt wurde.
* **Eigenverbrauchsanteil**: Anteil des erzeugten PV-Stroms, der im eigenen Haus verbraucht oder gespeichert wurde.
* **8.760h-Energiebilanz**: Stündliche Aufschlüsselung von Erzeugung, Last, Batterieladung, Batterieentladung, Netzeinspeisung, Netzbezug und AC-Clipping (Abregelung bei Überschreiten der AC-Maximalleistung des Wechselrichters).
* **Wirtschaftlichkeitskennzahlen**: Amortisationszeitpunkt, kumulierter Cashflow über 20 Jahre und Stromgestehungskosten (LCOE).

---

### Tab 7: Komponenten-Datenbank
* **Master-Datenbank**: Enthält praxisbewährte PV-Module (Trina, Jinko, LONGi, Meyer Burger), Hybrid-Wechselrichter (Fronius, SMA, Huawei, Sungrow) und Batteriespeicher (BYD, Kostal, RCT).
* **Eigene Komponenten anlegen**: Ermöglicht das Hinzufügen beliebiger Markengeräte mit Pmax, Voc, Vmp, Isc, MPPT-Grenzen und Speicherkapazitäten. Diese werden dauerhaft im lokalen Browserprofil gesichert.

---

## 3. Physikalische & Mathematische Grundlagen

### Temperaturabhängige Kennlinien & VDE-Spannungsprüfung
Die Leerlaufspannung $U_{\text{oc}}$ und die MPP-Spannung $U_{\text{mpp}}$ von Silizium-Solarzellen sind stark temperaturabhängig. Bei Kälte steigt die Spannung an; bei Hitze sinkt sie ab.

Die App berechnet die Extremwerte nach folgenden thermodynamischen Formeln:

$$U_{\text{oc}}(-10\,^\circ\text{C}) = U_{\text{oc,STC}} \cdot \left(1 + \frac{\beta_{U_{\text{oc}}}}{100} \cdot (-10 - 25)\right) \cdot N_{\text{Module}}$$

$$U_{\text{mpp}}(+70\,^\circ\text{C}) = U_{\text{mpp,STC}} \cdot \left(1 + \frac{\gamma_{U_{\text{mpp}}}}{100} \cdot (70 - 25)\right) \cdot N_{\text{Module}}$$

Hierbei gilt:
* $\beta_{U_{\text{oc}}}$: Temperaturkoeffizient der Leerlaufspannung (typisch ca. $-0{,}26\,\%/^\circ\text{C}$ bis $-0{,}29\,\%/^\circ\text{C}$).
* $\gamma_{U_{\text{mpp}}}$: Temperaturkoeffizient der Leistung/Spannung (typisch ca. $-0{,}30\,\%/^\circ\text{C}$ bis $-0{,}35\,\%/^\circ\text{C}$).
* $N_{\text{Module}}$: Anzahl der in Reihe geschalteten Module.

#### VDE-Sicherheitsbewertung:
1. **Winterprüfung ($U_{\text{oc}}$ bei $-10\,^\circ\text{C}$)**:
   * Darf unter keinen Umständen die maximale Eingangsspannung des Wechselrichters ($U_{\text{max,WR}}$, z. B. 1.000 V oder 1.100 V) überschreiten.
   * Bei Überschreitung warnt die App mit rotem Status (**Zerstörungsgefahr der Eingangskondensatoren!**).
2. **Sommerprüfung ($U_{\text{mpp}}$ bei $+70\,^\circ\text{C}$)**:
   * Muss oberhalb der minimalen MPPT-Regelspannung des Wechselrichters liegen.
   * Fällt die Spannung darunter, kann der MPP-Tracker die Maximalleistung nicht mehr einstellen (**Minderertrag / Suboptimal**).
3. **Startspannungs-Prüfung**:
   * Die Modulspannung muss am Morgen die Startspannung des Wechselrichters übersteigen, damit dieser aufwacht.

---

### Stundengenaue Mismatch-Berechnung
Werden Solarmodule mit unterschiedlichen Ausrichtungen (z. B. 8 Module Ost und 8 Module West) oder unterschiedlichen Neigungen (Hauptdach 35° und Gaube 15°) in einem gemeinsamen String in Reihe geschaltet, fließt durch alle Module physikalisch derselbe elektrische Strom:

$$I_{\text{string}}(t) = \min_{i=1 \dots M} \left( I_{i}(t) \right)$$

Das am schwächsten beschienene Modul wirkt als elektrischer Flaschenhals und limitiert den Strom aller anderen Module des Strings:

$$P_{\text{real}}(t) = I_{\text{string}}(t) \cdot \sum_{i=1}^{M} U_{\text{mpp}, i}(t)$$

$$P_{\text{theoretisch}}(t) = \sum_{i=1}^{M} \left( I_{\text{mpp}, i}(t) \cdot U_{\text{mpp}, i}(t) \right)$$

$$\Delta P_{\text{Mismatch}}(t) = P_{\text{theoretisch}}(t) - P_{\text{real}}(t)$$

Die App summiert diese Differenz über alle 8.760 Stunden des Jahres auf und weist den genauen Mismatch-Verlust in Kilowattstunden (kWh) und Prozent aus.

---

### Die 8.760-Stunden-Simulationsmatrix
Für jede einzelne Stunde $t \in [1, 8760]$ des Jahres führt die Berechnungs-Engine folgende sequentielle Energieflussrechnung durch:

1. **PV-Erzeugung ermitteln**:
   $$P_{\text{PV}}(t) = \sum_{\text{Strings}} P_{\text{String}}(t) \cdot \eta_{\text{WR}}$$
   (mit Wechselrichter-Wirkungsgrad $\eta_{\text{WR}} \approx 95 - 98\,\%$)
2. **Gesamthauslast ermitteln**:
   $$P_{\text{Load}}(t) = P_{\text{VDI4655}}(t) + P_{\text{Dauerlast}} + P_{\text{WP}}(t) + P_{\text{Klima}}(t) + P_{\text{EV}}(t)$$
3. **Direktverbrauch decken**:
   $$P_{\text{Direkt}}(t) = \min(P_{\text{PV}}(t), P_{\text{Load}}(t))$$
   $$P_{\text{Surplus}}(t) = P_{\text{PV}}(t) - P_{\text{Direkt}}(t)$$
   $$P_{\text{Deficit}}(t) = P_{\text{Load}}(t) - P_{\text{Direkt}}(t)$$
4. **Batteriespeicher laden / entladen**:
   * Bei Überschuss ($P_{\text{Surplus}} > 0$):
     $$\Delta E_{\text{Bat,in}} = \min(P_{\text{Surplus}}(t) \cdot \eta_{\text{Bat,chg}}, P_{\text{Bat,max}}, E_{\text{Bat,cap}} - E_{\text{Bat}}(t-1))$$
     $$E_{\text{Bat}}(t) = E_{\text{Bat}}(t-1) + \Delta E_{\text{Bat,in}}$$
     $$P_{\text{FeedIn}}(t) = P_{\text{Surplus}}(t) - \frac{\Delta E_{\text{Bat,in}}}{\eta_{\text{Bat,chg}}}$$
   * Bei Defizit ($P_{\text{Deficit}} > 0$):
     $$\Delta E_{\text{Bat,out}} = \min\left(\frac{P_{\text{Deficit}}(t)}{\eta_{\text{Bat,dis}}}, P_{\text{Bat,max}}, E_{\text{Bat}}(t-1) - E_{\text{Bat,min}}\right)$$
     $$E_{\text{Bat}}(t) = E_{\text{Bat}}(t-1) - \Delta E_{\text{Bat,out}}$$
     $$P_{\text{GridBuy}}(t) = P_{\text{Deficit}}(t) - (\Delta E_{\text{Bat,out}} \cdot \eta_{\text{Bat,dis}})$$
5. **AC-Clipping**:
   * Übersteigt $P_{\text{FeedIn}}(t) + P_{\text{Direkt}}(t)$ die maximale AC-Ausgangsleistung des Wechselrichters ($P_{\text{AC,max}}$), wird die Einspeisung hart abgeregelt. Der abgeschnittene Ertrag wird als *AC-Clipping-Verlust* protokolliert.

---

### DC-Leitungswiderstand, Spannungsabfall & Verlustleistung
Jedes Solarkabel besitzt einen material- und querschnittsabhängigen ohmschen Schleifenwiderstand. Bei Gleichstromleitungen (Hin- und Rückleiter, Gesamtlänge $2 \cdot L$) gilt nach DIN VDE 0100-712:

$$R_{\text{Schleife}} = \frac{2 \cdot L}{\kappa_{\text{Cu}} \cdot A}$$

Hierbei bedeuten:
* $L$: Einfache Leitungslänge vom Wechselrichter zum Modulfeld in Metern [m].
* $A$: Leiterquerschnitt in Quadratmillimetern [$\text{mm}^2$] (Standard: 4, 6 oder 10 mm²).
* $\kappa_{\text{Cu}}$: Elektrische Leitfähigkeit von warmem Kupfer bei Betriebstemperatur (ca. $50 - 70\,^\circ\text{C}$):
  $$\kappa_{\text{Cu}} \approx 56\,\frac{\text{m}}{\Omega \cdot \text{mm}^2}$$

#### Spannungsabfall:
$$\Delta U = I_{\text{mpp}} \cdot R_{\text{Schleife}} \quad [\text{V}]$$

$$\Delta U_{\%} = \frac{\Delta U}{U_{\text{string,mpp}}} \cdot 100 \quad [\%]$$

#### Thermische Verlustleistung:
$$P_{\text{Verlust}} = I_{\text{mpp}}^2 \cdot R_{\text{Schleife}} \quad [\text{W}]$$

$$E_{\text{Verlust,Jahr}} = P_{\text{Verlust}} \cdot \text{Vollaststunden} \quad [\text{kWh}]$$

**Normative Vorgaben nach DIN VDE 0100-712:**
* $\Delta U_{\%} < 1{,}0\,\%$ : **Optimal** (Geringste Erwärmung, maximale Anlageneffizienz).
* $1{,}0\,\% \le \Delta U_{\%} \le 1{,}5\,\%$ : **Zulässig** (Grenzbereich).
* $\Delta U_{\%} > 1{,}5\,\%$ : **Unzulässig** (Querschnitt muss von 4 mm² auf 6 mm² oder 10 mm² erhöht werden).

---

### Leiterschleifenminimierung nach DIN EN 62305 / VDE 0185-305
Bei einer atmosphärischen Blitzentladung in der Nähe des Gebäudes entsteht ein extrem steil ansteigendes magnetisches Impulsfeld $\frac{dB}{dt}$. Nach dem Faradayschen Induktionsgesetz induziert dieses Magnetfeld in jeder geschlossenen Leiterschleife eine Stoßspannung:

$$u_{\text{ind}}(t) = - \frac{d\Phi}{dt} = - A_{\text{Schleife}} \cdot \frac{dB(t)}{dt}$$

* **Gefahr**: Ist die aufgespannte Fläche $A_{\text{Schleife}}$ zwischen Hin- und Rückleiter groß (wie bei unbedachter Reihenschaltung), können Induktionsspannungen von mehreren tausend Volt entstehen, die Bypassdioden der Module und die Wechselrichter-Halbleiter schlagartig zerstören.
* **Leap-Frog-Verfahren (Reißverschluss)**:
  * Durch das wechselweise Anschließen jedes zweiten Moduls heben sich die aufgespannten Teilflächen vektoriell auf:
    $$A_{\text{Schleife}} = \sum A_i^+ - \sum A_i^- \approx 0\,\text{m}^2$$
  * Höchste Sicherheit gegen induzierte Überspannungen ohne zusätzliches Rückleiterkabel.

---

## 4. Kaufmännische & Regulatorische Logiken

### EEG 2023 / 2024 Mischvergütung & Degression
Nach dem Erneuerbare-Energien-Gesetz (EEG) erhalten PV-Anlagenbetreiber für eingespeisten Strom eine garantierte Vergütung über 20 Kalenderjahre plus Inbetriebnahmejahr.

#### 1. Leistungsproportionale Mischvergütung
Die Vergütungssätze sind gesetzlich nach Anlagengröße gestaffelt:
* Anlagenteil bis 10 kWp: $8{,}2\,\text{ct/kWh}$ (Basiswert 2023/2024).
* Anlagenteil über 10 kWp bis 40 kWp: $7{,}1\,\text{ct/kWh}$.

Für eine Anlage mit $P_{\text{ges}} = 14\,\text{kWp}$ berechnet die App die gewichtete Mischvergütung:
$$\text{Vergütung} = \frac{10\,\text{kWp} \cdot 8{,}2\,\text{ct} + (14 - 10)\,\text{kWp} \cdot 7{,}1\,\text{ct}}{14\,\text{kWp}} = \frac{82 + 28{,}4}{14} \approx 7{,}89\,\text{ct/kWh}$$

#### 2. Halbjährliche Degression
Ab dem 1. Februar 2024 sinkt der gesetzliche Vergütungssatz alle 6 Monate (jeweils zum 1. Februar und 1. August) um $1\,\%$. Die App ermittelt anhand des vom Nutzer gewählten Inbetriebnahmedatums exakt die Anzahl der Degressionsschritte und passt den Wert automatisch an.

#### 3. Gesetzlicher Cutoff ab 2027
Für Inbetriebnahmen ab dem Jahr 2027 entfällt nach aktuellen Gesetzesentwürfen die garantierte Festvergütung zugunsten dynamischer Börsenpreise. Die App unterstützt dies über einen automatischen 0-Cent-Cutoff.

---

### Fossil-Substitution nach Brennwert
Ersetzt PV-Strom fossile Brennstoffe, spart der Betreiber erhebliche Bezugskosten:

1. **Wärmepumpen-Substitution**:
   * Die App berechnet die thermische Wärmemenge $Q_{\text{th}} = E_{\text{WP,PV}} \cdot \text{JAZ}$.
   * Mit dem physikalischen Standard-Brennwert:
     $$1\,\text{Liter Heizöl} \approx 1\,\text{m}^3\,\text{Erdgas} \approx 10\,\text{kWh}_{\text{thermisch}}$$
   * Das verdrängte Heizöl- oder Gasvolumen wird mit dem eingegebenen Brennstoffpreis multipliziert.
2. **Pkw-Benzin/Diesel-Substitution**:
   * Anhand der mit PV-Strom gefahrenen Kilometer wird die eingesparte Kraftstoffmenge in Litern ermittelt und monetär bewertet.

---

### Wirtschaftlichkeit & Stromgestehungskosten (LCOE)
* **Amortisationszeit**: Das Jahr, in dem die kumulierten Einsparungen (Eigenverbrauch + Einspeisevergütung + Fossil-Substitution) die Anschaffungskosten übersteigen.
* **Stromgestehungskosten (Levelized Cost of Electricity, LCOE)**:
  $$\text{LCOE} = \frac{\text{Investitionskosten} + \sum_{t=1}^{20} \frac{\text{Betriebskosten}_t}{(1 + r)^t}}{\sum_{t=1}^{20} \frac{E_{\text{PV}, t}}{(1 + r)^t}}$$
  Typische Werte für private Dachanlagen liegen zwischen $0{,}06$ und $0{,}11\,\text{€/kWh}$ und liegen damit weit unter dem Netzstrombezugspreis ($0{,}30 - 0{,}40\,\text{€/kWh}$).

---

## 5. Praxisleitfaden für Solarteure & Planer

1. **Schattenanalyse & MPP-Tracker-Zuteilung**:
   * Verschattete Dachteile nie mit unverschatteten Hauptfeldern in einen gemeinsamen String legen, es sei denn, Leistungsoptimierer werden eingesetzt.
   * Unterschiedliche Dachneigungen (z. B. Ost/West) zwingend auf getrennte MPPTs des Wechselrichters legen, um Mismatch-Verluste zu vermeiden.
2. **Kabeldimensionierung**:
   * Bis 15 m Leitungsweg genügt in der Regel ein Querschnitt von 4 mm².
   * Ab 20 m Leitungsweg empfiehlt sich standardmäßig 6 mm² Solarkabel, um Leitungsverluste unter 1,0 % zu halten.
3. **Leiterschleifen auf der Baustelle**:
   * Beim Einlegen der Modulkabel in die Kabelkanäle der Montageschienen das Reißverschlussprinzip (Leap-Frog) anwenden oder den Rückleiter direkt an den Modulkabeln fixieren.
4. **Dokumentation & Übergabe**:
   * Die im Tab *Verkabelung* generierten Werte (Leitungslängen, Polaritäten, Modulzuordnungen F1-1 bis F2-N, Stückliste) können direkt in die Anlagendokumentation nach DIN EN 62446-1 (VDE 0126-23-1) übernommen werden.
