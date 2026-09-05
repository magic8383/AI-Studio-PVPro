// ==========================================
// TEXTE & HANDBUCH (Content Library)
// ==========================================
const HandbuchHTML = `
    <div class="mb-6">
        <h2 class="text-2xl font-black text-slate-800 dark:text-slate-100">Bedienungsanleitung & Logik</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Wie die App rechnet und wie du sie optimal nutzt.</p>
    </div>
    
    <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 mt-8 mb-2 border-b border-slate-200 dark:border-slate-800 pb-2">Teil A: Bedienungsanleitung (How-To)</h3>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_ht1')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">solar_power</span> Schritt 1: Standort & Strings einrichten</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_ht1" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <p class="mt-4"><strong>Standort:</strong> Klicke im ersten Tab ("Strings") auf "Ändern" und gib deine Stadt ein. Die App zieht sich im Hintergrund automatisch die exakten GPS-Koordinaten. Diese sind zwingend nötig, damit die PVGIS-Sonnendatenbank weiß, welches Wetter bei dir herrscht.</p>
            <p class="mt-2"><strong>Strings & Modulfelder:</strong> Ein "String" repräsentiert einen Kabelstrang, der an einen Wechselrichter angeschlossen ist. Du kannst innerhalb eines Strings mehrere "Modulfelder" anlegen (z.B. 5 Module mit 30° Neigung und 2 Module mit 45° Neigung). Die App berechnet den Ertrag für jedes Feld einzeln und rechnet bei starken Unterschieden automatisch Mismatch-Verluste ein.</p>
            <p class="mt-2"><strong>Verschattung:</strong> Der Prozent-Slider für Verschattung zieht pauschal Leistung von diesem String ab. 10% bedeutet, dass über das Jahr hinweg 10% des Lichts durch Bäume, Kamine oder Nachbarhäuser blockiert werden.</p>
        </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_ht1b')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">cable</span> Schritt 1b: Kabelwege & String-Visualisierung</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_ht1b" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <p class="mt-4"><strong>Interaktiver Schaltplan:</strong> Im Tab "Verkabelung" siehst du die exakte Verlege- und Steckreihenfolge aller Solarmodule deines Strings. Jedes Modul zeigt seine Polarität (+ in Rot, - in Schwarz) sowie die MC4-Kupplungen.</p>
            <p class="mt-2"><strong>Modulfelder & Zerstückelte Dächer:</strong> Du kannst Hauptdächer, Gauben und getrennte Teilflächen direkt im Verkabelungs-Tab verwalten. Für jedes Feld lassen sich Spalten, Reihen und Modultypen anpassen. Zwischen getrennten Feldern werden Verbindungskabel (Brücken) in Metern definiert.</p>
            <p class="mt-2"><strong>4-Wege-Kabelkalkulator:</strong> Die Gesamtlänge wird transparent ermittelt: <em>Weg A (Hinweg) + Summe Brücken + Modulkabel (2 m Pauschale je Modul) + Weg B (Rückweg)</em> zzgl. 10 % Verlegereserve nach DIN VDE 0100-712.</p>
            <p class="mt-2"><strong>Verlegemethoden:</strong> Du kannst zwischen drei bewährten Montageverfahren umschalten:</p>
            <ul class="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Reißverschluss (Leap-Frog):</strong> Springt auf dem Hinweg über jedes zweite Modul (1 -> 3 -> 5...) und verbindet auf dem Rückweg die geraden Module. Minimiert Induktionsschleifen geometrisch auf ca. 0 m² ohne langes Rückleiterkabel.</li>
                <li><strong>Schleifenarme Verlegung:</strong> Verbindet Module fortlaufend (1 -> 2 -> 3...), führt den Rückleiter aber im Tragschienensystem parallel zurück.</li>
                <li><strong>Standard Daisy-Chain:</strong> Einfache Reihenschaltung mit offenem Rückleiter (nur für kleine Sonderanlagen geeignet).</li>
            </ul>
            <p class="mt-2"><strong>Kabelverluste & Querschnitt:</strong> Berechnet ohmsche Leitungsverluste, Spannungsabfall in Volt und Prozent sowie jährliche kWh-Verluste für 4, 6 und 10 mm² Solarkabel nach DIN VDE 0100-712.</p>
        </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_ht2')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">bolt</span> Schritt 2: Verbrauch & Smart-Home</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_ht2" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <p class="mt-4">Wechsele in den Tab "Verbrauch". Hier baust du dein Haus virtuell nach:</p>
            <ul class="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Grundlast:</strong> Gib deinen Jahresbedarf ein. Die App nutzt hierfür die genormte VDI 4655 Kurve, die an Winterabenden mehr Strom zieht als an Sommermittagen.</li>
                <li><strong>Dauerlast (IT/Server):</strong> Läuft 24/7 durch (z.B. Router, NAS).</li>
                <li><strong>Wärmepumpe & Klima:</strong> Diese Profile sind saisonal gewichtet. Die Klimaanlage zieht nur im Sommer Strom, die Heizungs-WP zieht im Winter exponentiell mehr.</li>
                <li><strong>Wetter-KI (Smart Charging):</strong> Wenn du diese Checkbox beim E-Auto oder der BWWP aktivierst, simuliert die App ein Smart-Home-System. Die App sucht sich gezielt die sonnenreichsten Stunden der Woche aus.</li>
            </ul>
        </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_ht3')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">payments</span> Schritt 3: Kosten & Substitution</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_ht3" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <p class="mt-4"><strong>Der Fossil-Vergleich (Substitution):</strong> Im "Kosten"-Tab gibst du ein, was dein Strom kostet. Wenn du ein E-Auto oder eine Wärmepumpe konfiguriert hast, musst du hier eingeben, was die <i>fossilen Alternativen</i> gekostet hätten. Die App berechnet später die Amortisation der Anlage anhand der eingesparten Benzinkosten (Auto) und Gaskosten (WP).</p>
            <p class="mt-2"><strong>Berechnung starten:</strong> Klicke ganz unten im Kosten-Tab auf den Button. Die App ruft nun die Wetterdaten ab und berechnet 8.760 Stunden. Danach springt sie automatisch in den Tab "Übersicht", wo du die finale "Steuererklärung" ablesen kannst.</p>
        </div>
    </div>

    <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 mt-10 mb-2 border-b border-slate-200 dark:border-slate-800 pb-2">Teil B: Physikalische & Kaufmännische Hintergründe</h3>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_bg1')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">tune</span> Logik der Strings & Modul-Physik</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_bg1" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <p class="mt-4">In der String-Übersicht siehst du die Parameter deines Strings als Kennwerte. Die App prüft die Spannungen physikalisch gegen die Limits deines Wechselrichters:</p>
            <ul class="list-disc pl-5 mt-2 space-y-2">
                <li><strong class="text-emerald-500">Grün (Optimal):</strong> Die Vmp (Spannung bei +70°C) liegt im perfekten MPPT-Bereich des WR. Der Isc (Kurzschlussstrom) ist sicher.</li>
                <li><strong class="text-amber-500">Orange (Suboptimal):</strong> Z. B. bei 450V an einem 1000V WR, dessen MPPT aber erst ab 500V beginnt. Die Spannung reicht aus, damit der WR startet, sie liegt aber <i>unterhalb</i> des idealen Tracking-Fensters.</li>
                <li><strong class="text-rose-500">Rot (Gefahr/Fehler):</strong> Die Voc (Leerlaufspannung bei -10°C im Winter) ist höher als die Maximalspannung des WR (Zerstörungsgefahr!), der Strom ist zu hoch, oder die Vmp ist so niedrig, dass der WR nicht anspringt.</li>
            </ul>
        </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_bg_mismatch')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">alt_route</span> Die stundengenaue Mismatch-Berechnung</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_bg_mismatch" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <p class="mt-4">Wenn du in einem String mehrere Felder hast (z.B. Ost und West in Reihe), rechnet die App nicht mit pauschalen Verlustwerten. Die Engine simuliert die Physik exakt:</p>
            <p class="mt-2">Für jede der 8.760 Stunden im Jahr errechnet sie den Ertrag aus PVGIS. Da in einer Reihenschaltung immer <strong>das Modul mit dem geringsten Strom den gesamten String drosselt</strong>, sucht die App stündlich das schwächste Feld (Flaschenhals).</p>
            <p class="mt-2">Die reale Leistung des Strings wird aus diesem Minimum-Strom und der Gesamtspannung errechnet. Die Differenz zur theoretisch perfekten Leistung ohne Drosselung taucht als rotes <strong>Mismatch-Verlust</strong> Label auf.</p>
        </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_bg2')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">schedule</span> Die 8.760-Stunden-Matrix & AC-Clipping</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_bg2" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <p class="mt-4">Die App iteriert durch alle 8.760 Stunden des Jahres. Für <strong>jede einzelne Stunde</strong> führt sie folgende Bilanzierung durch:</p>
            <ol class="list-decimal pl-5 mt-2 space-y-1">
                <li>Was liefert die Sonne in dieser Stunde minus Mismatch minus WR-Wirkungsgrad (95%)? (Erzeugung)</li>
                <li>Was verbraucht das Haus exakt in dieser Stunde? (Last)</li>
                <li>Wird mehr erzeugt als verbraucht? -> Lade die Batterie.</li>
                <li>Ist die Batterie voll und noch Strom übrig? -> Ab ins Netz (Einspeisung / Clipping).</li>
                <li>Wird mehr verbraucht als erzeugt? -> Entlade die Batterie.</li>
                <li>Ist die Batterie leer? -> Kaufe Strom aus dem Netz.</li>
            </ol>
        </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_bg3')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">trending_down</span> Finanzen: EEG-Degression & Öl/Gas Umrechnung</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_bg3" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <p class="mt-4"><strong>EEG-Mischvergütung:</strong><br>
            Die ersten 10 kWp einer Anlage erhalten 8,2 ct, danach 7,1 ct. Die App berechnet den gewichteten Durchschnitt. Ab Februar 2024 sinkt dieser Wert alle 6 Monate um 1 %. Wählst du ein Datum ab 2027, entfällt die Vergütung hart auf 0 ct.</p>
            
            <p class="mt-4"><strong>Öl & Gas Umrechnung:</strong><br>
            Die App nutzt den Standard-Brennwert: <strong>1 Liter Heizöl = 1 m³ Gas = ca. 10 kWh Wärme</strong>. Die App errechnet die Wärmemenge der WP (Strom × JAZ), teilt sie durch 10 und rechnet das Ergebnis auf deinen eingegebenen Liter-Preis hoch.</p>
        </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_bg_wiring')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">cable</span> Leiterschleifenminimierung & DC-Verkabelung (DIN EN 62305 / VDE 0185)</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_bg_wiring" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <p class="mt-4"><strong>Blitz- und Überspannungsschutz:</strong> Wenn PV-Module in Reihe geschaltet werden und die Rückleitung auf anderem Wege zum Wechselrichter geführt wird, entsteht eine große Leiterschleife. Bei nahen Blitzeinschlägen induziert das elektromagnetische Feld extrem hohe Spannungsspitzen, die Wechselrichter und Moduldioden zerstören können.</p>
            <p class="mt-2"><strong>Die Lösung nach VDE:</strong></p>
            <ul class="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Reißverschluss (Leap-Frog):</strong> Durch das wechselweise Anschließen jedes zweiten Moduls hin und der verbleibenden Module zurück hebt sich die aufgespannte Fläche geometrisch auf (Schleifenfläche &approx; 0 m&sup2;). Das spart teures Rückleiterkabel und bietet höchsten Schutz.</li>
                <li><strong>Paralleler Rückleiter:</strong> Alternativ muss das Minus-Kabel unmittelbar an den Modulkabeln und Montageprofilen des Hinwegs zurückgeführt werden.</li>
            </ul>
            <p class="mt-2"><strong>Spannungsabfall nach VDE 0100-712:</strong> DC-Kabelverluste sollten unter 1,0 % (maximal 1,5 %) gehalten werden. Bei längeren Strecken (> 15-20 m) empfiehlt die Norm den Wechsel von 4 mm&sup2; auf 6 mm&sup2; oder 10 mm&sup2; Solarkabel.</p>
        </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <button onclick="toggleAcc('acc_bg4')" class="w-full p-5 text-left font-bold text-slate-800 dark:text-slate-100 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="flex items-center gap-2"><span class="material-symbols-rounded text-primary">history</span> Changelog & Versionen (CHANGELOG.md & HANDBUCH.md)</span>
            <span class="material-symbols-rounded text-slate-400 transform transition-transform acc-icon">expand_more</span>
        </button>
        <div id="acc_bg4" class="acc-content px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
            <div class="p-3 mb-3 mt-4 bg-primary/10 rounded-xl border border-primary/20 text-xs text-slate-700 dark:text-slate-300">
                <span class="font-black text-primary">Vollständige Dokumentation als eigenständige Dateien:</span> Alle Details, mathematischen Formeln und historischen Versionen werden zusätzlich in den Dateien <code>CHANGELOG.md</code> (neueste Versionen immer ganz oben) und <code>HANDBUCH.md</code> im Hauptverzeichnis geführt.
            </div>
            <ul class="space-y-3 mt-2">
                <li><strong>v7.5.0 (Current):</strong> Vollbild-Schaltplan Zentrierung & Hardware-Bereinigung. Beseitigung der Schwarz-Darstellung in der Vollbildansicht durch zentriertes Transform-Origin (<code>translate(-50%, -50%)</code>), explizite Viewport-BoundingClientRect-Berechnung und robusten Empty-State-Schutz. Vollständige Bereinigung der Hardware-Stammdaten: Entfernung aller unzuverlässigen externen Muster-Datenblätter und Links; die Datenbank zeigt nun eine saubere, hochperformante Übersicht der echten elektrischen Kenngrößen (Voc, Vmp, Isc, Pmax, AC-Leistung, MPPT-Fenster). Dossier-Anpassung mit professioneller Werksdatenblatt- und VDE-AR-N 4105 Konformitätsbestätigung.</li>
                <li><strong>v7.4.0:</strong> Mobile-Sync & Vollbild-Schaltplan Debugging. Behebung des Offline-Sync-Bugs auf mobilen Geräten: QR-Code und 6-stelliger Transfer-Code werden nun sowohl online als auch im autarken Offline-Direkttransfer verlässlich angezeigt (Client-seitige Vektor-QR-Engine <code>qrcode.client.js</code> ohne Serverabhängigkeit). Vollbild-Schaltplan-Fix: Beseitigung der Schwarz-Darstellung durch explizite SVG-Dimensionierung und synchrone Fit-to-Screen-Kalkulation. Synchronisation der Versionsnummer in der Kopfzeile der App und Update der Entwicklungs-Guidelines.</li>
                <li><strong>v7.3.0:</strong> Hardware-Dokumentenverwaltung & Modulare Dossierausgabe. Zuordnung von technischen Datenblättern und VDE/TÜV/CE-Zertifikaten zu Modulen, Wechselrichtern und Speichern (auch für benutzerdefinierte Geräte mit Datei-/URL-Upload). Modulare Dossier-Konfiguration mit Auswahl zwischen schnellem Kurz-Report (1-2 Seiten) und vollständigem VDE-Fachgutachten sowie separaten Haken für Datenblätter und Zertifikate.</li>
                <li><strong>v7.2.0:</strong> Vollbild-Kabelvisualisierungs-Engine nach DIN VDE 0100-712 vollendet. Großansicht über den gesamten Bildschirm mit stufenlosem Touch-Pinch-to-Zoom (bis 500%), flüssigem Drag-Pan, Auto-Fit auf jede Bildschirmgröße, 90°-Rotationsmodus (optimale Ausnutzung breiter Dächer auf Smartphones im Hochformat) und schwebender Daumen-Toolbar für die Einhand-Bedienung auf der Baustelle/beim Kunden.</li>
                <li><strong>v7.1.0:</strong> Cross-Device Synchronisation & Sharing. Nahtloser Konfigurations-Transfer zwischen Desktop und Smartphone per Vektor-QR-Code-Scan (sofort mit normaler Smartphone-Kamera scannen und öffnen), 6-stelligem Transfercode (z.B. <code>PV-8RC6</code>) und JSON-Datei-Import/-Export für Offline-Backups.</li>
                <li><strong>v7.0.0:</strong> Vollwertige Projektdokumentations- & PDF-Dossier-Engine nach DIN VDE 0100-712 und DIN EN 62305-3 (kein bloßer App-Screenshot). Strukturierte Auslegung mit Anlagenpass, String-Verifikation, vektoriellem DC-Schaltplan, transparenter VDE-Leitungsberechnung, Stückliste (BOM), 20-Jahres-Wirtschaftlichkeit und offiziellem Inbetriebnahmeprotokoll mit Unterschriftenfeldern. Modulare Entflechtung von <code>app.js</code> in <code>wiring.js</code> (DC-Verkabelung & Hindernisse) und <code>dossier.js</code> (Druck- & PDF-System). Verbindliche Entwicklungs-Governance: Guidelines-First-Pflicht und Versionierungspflicht nach jeder Änderung.</li>
                <li><strong>v6.18:</strong> Multi-Modulfelder und zerstückelte Dächer direkt im Tab 'Verkabelung' bearbeiten (Spalten, Reihen, Neigung je Teilfläche). Konfigurierbare Zwischenfeld-Brücken zur Überbrückung von Gauben und Firsten. Transparenter 4-Wege-Kabelkalkulator: Weg A (Hinweg) + Brücken + Modulkabel (2 m Pauschale) + Weg B (Rückweg) inkl. 10 % Verlegereserve nach DIN VDE 0100-712. Dachhindernisse (Gauben, Fenster, Kamine) mit Teilfeld-Zuweisung. Interaktive manuelle Zuweisung (F1-1, F1-2...), Polaritäts-Invertierung (+/-), Reißverschluss (Leap-Frog zur Leiterschleifenminimierung nach DIN EN 62305 / VDE 0185-305), Schleifenarme Verlegung, DC-Verlustanalyse für 4/6/10 mm² und Montage-Stückliste.</li>
                <li><strong>v6.17:</strong> Material Expressive 3 (2026) Design-System. Google Material Symbols Rounded Vektor-Iconografie in der gesamten App. Adaptive Dual-Navigation (ergonomische M3 Bottom Navigation Bar auf Mobilgeräten + M3 Segmented Rail auf Desktop + animiertes M3 More Bottom Sheet). Konsistente Tonal Surfaces, zentrale Badge-Steuerung und vollständige Dark/Light-Mode Harmonisierung.</li>
                <li><strong>v6.16:</strong> Umstellung auf reale historische 8.760h-Stundenwerte via seriescalc über den Synology Reverse Proxy. Direkte stundengenaue Auswertung mit physikalischer Präzision.</li>
                <li><strong>v6.15:</strong> Umstellung auf dedizierten Synology PVGIS-Proxy (pvgis.mb10.org). Schnellerer & zuverlässiger Abruf ohne Drittanbieter-Timeouts.</li>
                <li><strong>v6.14:</strong> Umstellung auf schlanken PVGIS-PVcalc-Endpunkt. Direkte Monats-Kalibrierung der 8.760h-Jahressimulation, Beseitigung aller Proxy-Timeouts & lückenlose Berechnung.</li>
                <li><strong>v6.13:</strong> Robuster PVGIS-Abruf via CORS-Proxy-Tunneling, nahtloser Offline-Fallback ohne Abbruch und Cache-Buster für mobile Browser.</li>
                <li><strong>v6.12:</strong> Neuer Tab 'Investition' mit 4 Kategorien und Live-Übertrag in die Anlagenkosten. Mismatch-Berechnung und UI-Optimierung.</li>
                <li><strong>v6.10:</strong> Separation of Concerns: Kompletter Code wurde in 4 Dateien ausgelagert (index.html, app.js, database.js, content.js). Stundengenaue Mismatch-Logik inkl. UI-Feedback aktiviert. Gas/Öl wird nun physikalisch korrekt in Volumen (Liter/m³) über die JAZ abgerechnet. 2027 EEG-Cutoff. Verbrauchs-Dropdown auf variables Number-Field mit intelligenten 100er-Schritten umgebaut. Cache Fix eingebaut.</li>
                <li><strong>v6.8:</strong> Revert der API-Schnittstelle auf 100% v5.2 Architektur (direkter corsproxy.io ohne Delay). Erhalt der robusten Wischgesten-Logik.</li>
                <li><strong>v6.0:</strong> Finance Engine (Sektorenkopplung Benzin/Gas), Dynamische EEG-Berechnung (Mischvergütung), Custom-DB Formular.</li>
                <li><strong>v5.2:</strong> Clean Architecture.</li>
            </ul>
        </div>
    </div>
`;
