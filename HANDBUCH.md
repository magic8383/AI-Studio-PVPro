# Technisches Handbuch & Berechnungsgrundlagen (PV Pro Studio)

Dieses Handbuch dient als umfassende Referenz für alle Berechnungslogiken, mathematischen Formeln, Normen und Bedienkonzepte der Photovoltaik-Auslegungs- und Simulationsanwendung.

---

## Inhaltsverzeichnis
1. [String-Physik & Wechselrichter-Prüfung](#1-string-physik--wechselrichter-prüfung)
2. [Gradgenaue Ausrichtung & Azimut-Mathematik](#2-gradgenaue-ausrichtung--azimut-mathematik)
3. [Dachgeometrie, Raster & Hindernis-Visualisierung](#3-dachgeometrie-raster--hindernis-visualisierung)
4. [DC-Verkabelung, Leapfrog & Leitungsberechnung (VDE 0100-712)](#4-dc-verkabelung-leapfrog--leitungsberechnung-vde-0100-712)
5. [8760-Stunden Jahressimulation & Lastprofile](#5-8760-stunden-jahressimulation--lastprofile)
6. [Batteriespeicher- & Energiemanagement-Modell](#6-batteriespeicher---energiemanagement-modell)
7. [Wirtschaftlichkeit, Investitionskosten & ROI](#7-wirtschaftlichkeit-investitionskosten--roi)

---

## 1. String-Physik & Wechselrichter-Prüfung

### 1.1 Elektrische Modulkenngrößen (STC & Temperaturverhalten)
PV-Module werden unter Standard-Testbedingungen (STC: Einstrahlung $E = 1000\,\text{W/m}^2$, Zelltemperatur $T_0 = 25^\circ\text{C}$, AM 1.5) spezifiziert:
- $P_{\max}$: Maximale Leistung (Wp)
- $V_{\text{oc}}$: Leerlaufspannung (Open-Circuit Voltage, V)
- $V_{\text{mp}}$: Spannung im maximalen Leistungspunkt (Maximum Power Voltage, V)
- $I_{\text{sc}}$: Kurzschlussstrom (Short-Circuit Current, A)
- $I_{\text{mp}}$: Strom im maximalen Leistungspunkt (Maximum Power Current, A)
- $\gamma_{Voc}$: Temperaturkoeffizient der Leerlaufspannung (typisch: $-0{,}25\,\%/\text{K}$ bis $-0{,}28\,\%/\text{K}$)
- $\gamma_{Vmp}$: Temperaturkoeffizient der MPP-Spannung (typisch: $-0{,}30\,\%/\text{K}$ bis $-0{,}35\,\%/\text{K}$)

### 1.2 Grenzwertprüfungen
Für die elektrische Sicherheit und den Wirkungsgrad des Wechselrichters werden zwei Extremzustände berechnet:

#### A. Maximale Leerlaufspannung bei tiefster Wintertemperatur ($T_{\min} = -10^\circ\text{C}$)
Bei Frost steigt die Leerlaufspannung der Solarzellen signifikant an:
$$\Delta T = T_{\min} - 25^\circ\text{C} = -10^\circ\text{C} - 25^\circ\text{C} = -35\,\text{K}$$
$$V_{\text{oc,-10}} = V_{\text{oc,STC}} \cdot \left(1 + \frac{\gamma_{Voc}}{100} \cdot (-35)\right)$$
Für einen String aus $N$ in Reihe geschalteten Modulen gilt:
$$V_{\text{string,max}} = N \cdot V_{\text{oc,-10}}$$

**Sicherheitskriterium:**
$$V_{\text{string,max}} \le V_{\text{inverter,max}}$$
Wird diese Spannung überschritten, droht eine Zerstörung der DC-Eingangsstufe (MOSFETs/IGBTs) des Wechselrichters!

#### B. Minimale MPP-Spannung bei heißester Sommertemperatur ($T_{\max} = +70^\circ\text{C}$)
Unter direkter Sonneneinstrahlung im Hochsommer erwärmen sich Module typisch auf bis zu $70^\circ\text{C}$. Hierdurch sinkt die Arbeitsspannung:
$$\Delta T = T_{\max} - 25^\circ\text{C} = 70^\circ\text{C} - 25^\circ\text{C} = +45\,\text{K}$$
$$V_{\text{mp,+70}} = V_{\text{mp,STC}} \cdot \left(1 + \frac{\gamma_{Vmp}}{100} \cdot 45\right)$$
$$V_{\text{string,mpp,min}} = N \cdot V_{\text{mp,+70}}$$

**Regelkriterium:**
$$V_{\text{string,mpp,min}} \ge V_{\text{inverter,mpp,min}} \quad \text{bzw.} \quad V_{\text{string,mpp,min}} \ge V_{\text{inverter,start}}$$
Fällt die Spannung unter die Mindestregelgrenze, verlässt der MPP-Tracker seinen optimalen Arbeitspunkt oder der Wechselrichter schaltet ab.

#### C. MPPT-Strom- & Kurzschlussprüfung
- $I_{\text{string,sc}} \le I_{\text{mppt,maxIsc}}$ (Zulässiger maximaler Kurzschlussstrom des Trackers)
- $I_{\text{string,mp}} \le I_{\text{mppt,maxI}}$ (Maximaler Betriebsstrom / Arbeitsbereich des Trackers)

#### D. Mismatch-Verlust bei Multi-Feld-Strings
Werden Module auf unterschiedlichen Dachflächen (z. B. Hauptdach $40^\circ$ und Gaube $20^\circ$) in Serie geschaltet, führt der unterschiedliche Einstrahlungswinkel zu einer Strombegrenzung:
$$\text{Mismatch} \approx \sin(\Delta \beta) \cdot 100\,\% \cdot \frac{N_{\text{minor}}}{N_{\text{total}}}$$

---

## 2. Gradgenaue Ausrichtung & Azimut-Mathematik

### 2.1 Azimut-Winkelkonvention (0° bis 360°)
Die App verwendet die in der modernen Photovoltaik und Geodäsie übliche 360°-Nordreferenz:
- **0° bzw. 360°**: Nord (Vollverschattet / reine Diffusstrahlung)
- **90°**: Ost (Vormittagssonne)
- **135°**: Südost (SO)
- **180°**: Süd (Optimaler Einstrahlungswinkel in Mitteleuropa)
- **225°**: Südwest (SW)
- **270°**: West (Nachmittagssonne)

### 2.2 16-Sektoren-Kompassanalyse (`getCompassDirection`)
Jeder eingegebene Gradwert wird automatisch in eine nautische Windrose und die Abweichung zu Optimal-Süd übersetzt:
$$\Delta\gamma_{\text{Süd}} = |(\alpha_{\text{Azimut}} - 180^\circ)|$$

| Sektor | Winkelbereich | Abkürzung | Einstrahlungscharakteristik |
| :--- | :--- | :--- | :--- |
| **Nord** | 348,75° – 11,25° | N | ~50–60% Ertrag (Diffusstrahlung) |
| **Nord-Nordost** | 11,25° – 33,75° | NNO | Frühsonne |
| **Nordost** | 33,75° – 56,25° | NO | Vormittag flach |
| **Ost-Nordost** | 56,25° – 78,75° | ONO | Vormittag ansteigend |
| **Ost** | 78,75° – 101,25° | O | 80–85% Ertrag (Morgensonne) |
| **Ost-Südost** | 101,25° – 123,75° | OSO | Vormittagspeak |
| **Südost** | 123,75° – 146,25° | SO | 92–96% Ertrag |
| **Süd-Südost** | 146,25° – 168,75° | SSO | 98–99% Ertrag |
| **Süd** | 168,75° – 191,25° | S | **100% Ertrag (Referenz)** |
| **Süd-Südwest** | 191,25° – 213,75° | SSW | 98–99% Ertrag |
| **Südwest** | 213,75° – 236,25° | SW | 92–96% Ertrag |
| **West-Südwest** | 236,25° – 258,75° | WSW | Nachmittagspeak |
| **West** | 258,75° – 281,25° | W | 80–85% Ertrag (Abendsonne) |
| **West-Nordwest** | 281,25° – 303,75° | WNW | Spätnachmittag |
| **Nordwest** | 303,75° – 326,25° | NW | Spätabend |
| **Nord-Nordwest** | 326,25° – 348,75° | NNW | Diffus |

### 2.3 Manuelle Eingabemöglichkeiten
1. **Präzisions-Zahlenfeld:** Direkte Tastatureingabe für exakte Projektpläne (z. B. 162°).
2. **Schieberegler (Slider):** Schnelle, stufenlose optische Anpassung.
3. **Preset-Dropdown:** 1-Klick-Auswahl für Standard-Ausrichtungen.

---

## 3. Dachgeometrie, Raster & Hindernis-Visualisierung

### 3.1 Das Dachraster
Für jedes Modulfeld wird ein 2D-Gitter aus Zeilen ($r$) und Spalten ($c$) aufgespannt:
- Einheitsbreite eines Moduls: $pw = 96\,\text{px}$ (Hochkant) bzw. $144\,\text{px}$ (Querformat)
- Einheitsabstand in X: $gapX = 24\,\text{px}$
- Einheitsabstand in Y: $gapY = 32\,\text{px}$

### 3.2 Platzierung & Rendering von Hindernissen
Hindernisse (Dachfenster, Gauben, Kamine, Leerflächen) blockieren spezifische Zellen $(r, c)$ im Modulfeld:
1. **Kollisionserkennung:** Vor dem Platzieren der Module wird eine Sperr-Matrix (`obMap`) aufgebaut.
2. **Aussparungslogik:** Erreicht der Modulgenerator eine belegte Zelle, wird kein PV-Modul erzeugt, sondern der Platz für das Hindernis freigehalten.
3. **Dynamische Feldvergrößerung:** Reicht die konfigurierte Zeilen-/Spaltenanzahl nicht aus, um alle PV-Module plus die Hindernisse darzustellen, expandiert das Feld automatisch (`fCols = max(fCols, maxObCol + 1)` und `fRows = max(fRows, ceil(totalSpots / fCols))`).
4. **Grafisches SVG-Rendering:**
   - **Dachfenster:** Blauer Alurahmen, Verglasung mit Doppelkreuz-Sprossen und Spiegelreflexion.
   - **Gaube:** Dreieckiges Gaubendach in Schieferoptik mit Gaubenfenster.
   - **Kamin:** Klinkerroter Korpus mit Schornsteinschacht.
   - **Leerfläche:** Gestrichelte Sperrzone mit Diagonal-Kreuzung.
5. **Entfernen per Klick:** Ein Klick auf das Hindernis im SVG öffnet eine Bestätigung zum direkten Entfernen.

---

## 4. DC-Verkabelung, Leapfrog & Leitungsberechnung (VDE 0100-712)

### 4.1 Die Leiterschleife & Induktionsgefahr nach DIN VDE 0100-712
Bei der Reihenschaltung von PV-Modulen entsteht zwischen dem Plus- und Minusleiter eine Leiterschleife. Schlägt in der Nähe ein Blitz ein, induziert das elektromagnetische Pulsfeld ($\frac{dB}{dt}$) eine Stoßspannung:
$$U_{\text{ind}} = -\frac{d\Phi}{dt} = -A_{\text{Schleife}} \cdot \frac{dB}{dt}$$
Je größer die von den Leitungen aufgespannte Fläche $A_{\text{Schleife}}$, desto höher ist die Überspannung, welche Wechselrichter und Modulisolierung zerstören kann.

### 4.2 Leapfrog-Verkabelung (Überspringende Schaltung)
Der Leapfrog-Algorithmus verhindert große Schleifenflächen ohne aufwändige Rückleitungen:
- **Weg A (Hinweg):** Module $0 \to 2 \to 4 \to 6 \dots$ (ungerade Indizes im menschlichen Zählsystem).
- **Weg B (Rückweg):** Nach dem letzten Modul kehrt die Leitung um und verbindet die ausgelassenen Module: $\dots \to 5 \to 3 \to 1$.
- **Vorteil:** Hin- und Rückleiter verlaufen parallel direkt nebeneinander. Die Leiterschleifenfläche sinkt um über **90%**!

### 4.3 Elektrische DC-Leitungsverluste

#### Spezifischer Widerstand von Kupfer
Der spezifische Widerstand von Elektrolytkupfer ist temperaturabhängig:
$$\rho(T) = \rho_{20} \cdot \left[1 + \alpha_{\text{Cu}} \cdot (T - 20^\circ\text{C})\right]$$
mit $\rho_{20} = 0{,}01786\,\frac{\Omega \cdot \text{mm}^2}{\text{m}}$ und $\alpha_{\text{Cu}} = 0{,}00393\,\text{K}^{-1}$.
- Bei $25^\circ\text{C}$: $\rho_{25} \approx 0{,}0182\,\frac{\Omega \cdot \text{mm}^2}{\text{m}}$
- Bei $50^\circ\text{C}$ (Dachbetrieb): $\rho_{50} \approx 0{,}0200\,\frac{\Omega \cdot \text{mm}^2}{\text{m}}$

#### Leitungswiderstand
Für die gesamte Kabellänge $L_{\text{total}} = 2 \cdot L_{\text{WR}} + L_{\text{Module}} + L_{\text{Brücken}}$ und den Querschnitt $A$ ($4\,\text{mm}^2$, $6\,\text{mm}^2$ oder $10\,\text{mm}^2$):
$$R_{\text{Leitung}} = \rho(T) \cdot \frac{L_{\text{total}}}{A}$$

#### Spannungsabfall $\Delta U$
$$\Delta U = R_{\text{Leitung}} \cdot I_{\text{mp}}$$
$$\Delta U_{\%} = \frac{\Delta U}{V_{\text{string,mp}}} \cdot 100\,\%$$

**VDE-Empfehlung:** $\Delta U_{\%} < 1{,}0\,\%$ (Normgerecht, grün). Ab $1{,}5\,\%$ wird ein größerer Leitungsquerschnitt empfohlen.

#### Verlustleistung & Jahresverlust
$$P_{\text{Verlust}} = R_{\text{Leitung}} \cdot I_{\text{mp}}^2 \quad [\text{W}]$$
$$E_{\text{Verlust,Jahr}} \approx P_{\text{Verlust}} \cdot t_{\text{Vollast}} \quad [\text{kWh}]$$
(mit $t_{\text{Vollast}} \approx 950$ bis $1050\,\text{h/Jahr}$).

---

## 5. 8760-Stunden Jahressimulation & Lastprofile

Die Jahressimulation modelliert jede der $8.760$ Stunden eines Jahres ($365 \times 24\,\text{h}$).

### 5.1 Solarstrahlung & Erzeugungsprofil
Für jede Stunde $h \in [0, 8759]$:
1. **Tag im Jahr ($d = \lfloor h / 24 \rfloor$) und Stunde ($hr = h \pmod{24}$):**
2. **Sonnenhöhe & Deklination:**
   $$\delta = 23{,}45^\circ \cdot \sin\left(\frac{360^\circ}{365} \cdot (d - 81)\right)$$
3. **Azimut- & Neigungskorrektur:**
   Die Einstrahlung wird mit dem Kosinus des Einfallswinkels $\theta$ skaliert:
   $$\cos(\theta) = \sin(\alpha_s) \cdot \cos(\beta) + \cos(\alpha_s) \cdot \sin(\beta) \cdot \cos(\gamma_s - \gamma_{\text{Modul}})$$
   wobei $\gamma_{\text{Modul}}$ der gradgenau eingegebene String-Azimut ist.

### 5.2 Synthetische Lastprofile
- **Grundlast:** Jahresgang mit Winterhoch und tageszeitlichem Doppel-Peak (Mittags- und Abendspitze).
- **Wärmepumpe (WP):** Gesteuert nach Gradtagszahlen ($d < 120$ oder $d > 270$).
- **Brauchwasser-Wärmepumpe (BWWP):** Wahlweise Standard-Laufzeit oder PV-Überschuss-gesteuert.
- **E-Auto (EV):** Wahlweise abendliches Laden oder intelligentes PV-Überschussladen (14 sonnenreichste Stunden der Woche).
- **IT-Dauerlast:** Konstante Grundlast.

---

## 6. Batteriespeicher- & Energiemanagement-Modell

In jedem Zeitschritt $h$ wird folgende Bilanzgleichung gelöst:

### 6.1 Überschuss- & Deckungsrechnung
$$\Delta P(h) = P_{\text{PV}}(h) - P_{\text{Last}}(h)$$

1. **Fall 1: Überschuss ($\Delta P > 0$):**
   - Direkte Lastdeckung: $P_{\text{Direkt}} = P_{\text{Last}}$
   - Ladeleistung Batterie: $P_{\text{Lad}} = \min\left(\Delta P \cdot \eta_{\text{Bat}}, P_{\text{Bat,max}}, \frac{\text{Cap} - \text{SoC}(h)}{\Delta t}\right)$
   - Netzeinspeisung: $P_{\text{Netz,Einspeisung}} = \Delta P - \frac{P_{\text{Lad}}}{\eta_{\text{Bat}}}$

2. **Fall 2: Defizit ($\Delta P < 0$):**
   - Direkte PV-Nutzung: $P_{\text{Direkt}} = P_{\text{PV}}$
   - Entladeleistung Batterie: $P_{\text{Entlad}} = \min\left(|\Delta P|, P_{\text{Bat,max}}, \text{SoC}(h) \cdot \eta_{\text{Bat}}\right)$
   - Netzbezug: $P_{\text{Netz,Bezug}} = |\Delta P| - P_{\text{Entlad}}$

### 6.2 Kennzahlen
- **Autarkiegrad:**
  $$\text{Autarkie} = \frac{\sum P_{\text{Direkt}} + \sum P_{\text{AusBat}}}{\sum P_{\text{Last}}} \cdot 100\,\%$$
- **Eigenverbrauchsanteil:**
  $$\text{Eigenverbrauch} = \frac{\sum P_{\text{Direkt}} + \sum P_{\text{InBat}}}{\sum P_{\text{PV}}} \cdot 100\,\%$$

---

## 7. Wirtschaftlichkeit, Investitionskosten & ROI

### 7.1 Gesamte Investitionskosten ($I_0$)
$$I_0 = K_{\text{Module}} + K_{\text{Montage}} + K_{\text{WR}} + K_{\text{Speicher}} + K_{\text{Kabel/GAK}} + K_{\text{Elektriker/Gerüst}} + K_{\text{Sonstiges}}$$

### 7.2 Jährliche Einsparungen & Einnahmen
Für jedes Betriebsjahr $y \in [1, 20]$:
$$\text{Ersparnis}(y) = E_{\text{Eigenverbrauch}}(y) \cdot p_{\text{Strom}}(y) + E_{\text{Einspeisung}}(y) \cdot p_{\text{EEG}}$$
mit Strompreissteigerung (z. B. 2–3% p.a.) und Moduldegradation (0,5% p.a.):
$$p_{\text{Strom}}(y) = p_{\text{Strom,0}} \cdot (1 + infl)^y$$
$$P_{\text{PV}}(y) = P_{\text{PV,0}} \cdot (1 - deg)^y$$

### 7.3 Amortisationszeit (Break-Even)
Das Jahr, in dem der kumulierte Netto-Cashflow die Erstinvestition $I_0$ übersteigt:
$$\sum_{y=1}^{T_{\text{Amortisation}}} \left(\text{Ersparnis}(y) - K_{\text{Wartung}}(y)\right) \ge I_0$$
