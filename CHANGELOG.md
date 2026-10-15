# Changelog – Maszynista

Historia zmian odtworzona z rozmów o projekcie (10–13 października 2026). Wersje 0.x; numer bieżącej wersji
jest w `package.json` i na ekranie menu. Zmiany sprzed pierwszego commita (12.10) są pogrupowane według dni.
W grze skrót tej listy jest w menu głównym → **Co nowego** (`js/news.js`).

## 0.27.0 – 15 października 2026

Poprawki po etapie 11 (śnieg, liście, budynki wg rodzaju).

### Śnieg i liście
- `gHash` (common.js): siatka skrótu zawinięta co 2048 oczek – przy współrzędnych świata rzędu 1e4–1e5 m sinus w skrócie
  tracił precyzję i szum rozpadał się w kwadratowe płaty; szerszy próg płatów śniegu.
- Liście (`buildLitter`): na odcinkach „liście na torze” – jak dawniej; poza nimi tor 3 %, perony ok. 10 %, ulice ok. 17 %,
  reszta na trawie z gęstością wg zadrzewienia (`envTreeP`, pomiar koron); spadające (`weather.js`) – tylko pojedyncze.

### Budynki wg rodzaju (`envBuildingDecor`)
- Sieci rozpoznawane po nazwie z mapy (`BRANDS` – barwy szyldu i pasa, bez logotypów; sieci paliwowe tylko dla stacji
  paliw); witryny parteru (sklepy, markety, restauracje, banki, apteki, poczty), pas sieci nad witryną sklepu w parterze,
  zadaszenie wejścia marketu.
- Stacje paliw (`envFuelCanopy`): wiata 14 × 9 m przed ścianą frontową, gdy miejsce wolne (budynki, jezdnie, tory),
  dystrybutory, pylon cenowy; policja – pas, apteka – krzyż prostopadły do ściany, urzędy i szkoły – schody i daszek.

### Drobne poprawki
- ET22: okna boczne kabiny (`cabPanes`); EN57: pług `ploughW` 1,7 m; Zacns: bryły `cylHi` / `sphereHi`.
- Wody z rastra (`buildEnvWater`): granice serii na styku wierszy uśrednione (trapezy), końce zaokrąglone.
- `TrainHorizonData.forRoute` – horyzont dla gotowej trasy (stacje z OSM, wysokości z Open-Meteo); przycisk w Generatorze.
- Swobodna kamera: limit budowy kawałków 20 ms na klatkę.
- Nagrania dźwięku (D1, w przygotowaniu): `js/audio-samples.js`, folder `sounds/` (manifest `sounds.json`, lista
  `NAGRANIA.md`) – bez plików gra brzmi jak dotąd.

## 0.26.0 – 15 października 2026

Etap 11, krok G5 – część 3 (ludzie i budynki).

### Ludzie i budynki (etap 11, G5 – część 3)
- Ludzie (`personMat` w world.js): wzrost i tusza z numeru egzemplarza (ciało i głowa – ten sam), dodatki w bryle
  (`aKeep` 4 – plecak z szelkami, 5 – torba na ramię z paskiem), widoczne u ok. 28 % / 22 % osób, kolory z palety
  w shaderze; w pozach zapieczonych (pasażerowie, maszynista) bez dodatków; paleta ubrań `PEOPLE` – stonowane barwy.
- Dachy (`real-env.js`): osobna siatka `rf` z materiałem `roof` (common.js `ROOF_GLSL`) – dachówki (wygładzanie wg
  gęstości rzędów na ekranie), papa na dachach płaskich, tynk na ścianach szczytowych; paleta `ROOFS` bez
  niebieskawych szarości.
- Korony sosen: karty spłaszczone najwyżej do 0,8 (wcześniej 0,45 – „naleśniki”).

## 0.25.0 – 15 października 2026

Etap 11, krok G5 – część 2 (samochody).

### Samochody (etap 11, G5 – część 2)
- `props.carGeo(kind)` zwraca trzy bryły: `paint` (lakier – kolor materiału albo egzemplarza), `glass` i `trim`
  (własne kolory wierzchołków; wspólne materiały `carFixedMats` – szyby z połyskiem i odbiciami); `carModel` i auta
  na parkingach z mapy (`real-env.js`, instancje – kolor egzemplarza tylko dla lakieru).
- Nadwozie z fazowaniem 0,13 m (4 kroki), reflektory, światła tylne i zderzaki zaokrąglone (`rbox`), detale
  przesunięte za obrys.

## 0.24.0 – 15 października 2026

Etap 11, krok G5 – część 1 (drzewa).

### Drzewa (etap 11, G5 – część 1)
- Korony z kart z faktury (`props.foliageAtlas` – atlas 1024 × 512 rysowany w kodzie: kępki liści, drobne liście
  brzozy, gałązka świerku, pęczki igieł sosny, gęste liście i igły na rdzeń; zimą w polach liściastych nagie gałązki):
  `leafyCards` – karty na kępach (jak dawne bryły), zwrócone na zewnątrz korony, normalne jak elipsoida, ciemny rdzeń
  i konary; `spruceCards` – piętra opadających gałązek (dwie skrzyżowane karty), rdzeń, wierzchołek. Wersje z daleka
  z mniejszą liczbą kart.
- Materiały koron (`veg(…, fol)`): faktura, `alphaTest` (także w mapie cieni), obie strony; jasność ×2,5 (szarości
  faktury); `LEAF_GLSL` przy fakturze tylko duże plamy odcienia. Zimą faktura nagich gałązek dla liściastych.

## 0.23.0 – 15 października 2026

Etap 11, krok G4 – część 5 (rozjazdy) – koniec G4.

### Rozjazdy (etap 11, G4 – część 5)
- `buildEnvSwitches`: napęd elektryczny – podstawa, obudowa i pokrywa (materiał grafitowy), skrzynka kablowa, drążek
  nastawczy i drążki kontrolne, szafka ogrzewania rozjazdu (`switchCab`); zwrotnik ręczny – dźwignia z kulą
  przeciwwagi (`GEO.sphere`), latarnia zwrotnicowa z białymi tarczami i daszkiem; podrozjazdnice drewniane
  (`switchWood`) przy rozjazdach ręcznych.

## 0.22.0 – 15 października 2026

Etap 11, krok G4 – część 4 (tarcze i sieć trakcyjna).

### Sygnalizacja i sieć (etap 11, G4 – część 4)
- Tarcze ostrzegawcze świetlne (`World.warnDiscs` / `buildWarnDisc`, wg Ie-1 i zdjęcia tarczy w Ustroniu): przed
  semaforem wjazdowym, gdy poprzedni sygnał nie jest semaforem SBL, 1000 m przed nim (co najmniej 150 m za
  poprzednim sygnałem); szary maszt, głowica z komorą zieloną (górną) i pomarańczową, tabliczka „To…”, wskaźnik W 1.
  Sygnał z kodu semafora wjazdowego: Os1 – stój / sygnał zastępczy, Os2 – wolna droga, Os3 – 100 km/h (zielone
  migające), Os4 – 40/60 km/h (pomarańczowe migające). Geometrie głowic wspólne z semaforami (`signalGeos`).
- Sieć trakcyjna z mapy (`buildEnvCatenary`): kotwienie z naprężaczem na słupach przy jednym i dwóch torach (co 24.
  słup) – dwa stosy ciężarków, prowadnice, krążki, odciągi wzdłuż toru do fundamentów.

## 0.21.0 – 15 października 2026

Etap 11, krok G4 – część 3 (perony i wiaty).

### Perony i wiaty (etap 11, G4 – część 3)
- Nowy wariant nawierzchni `platform` (common.js `PLATFORM_GLSL`): wzór we współrzędnych toru z atrybutu `aPl`
  (kilometraż względem wielokrotności 100 m, odsunięcie) – płyty 0,5 × 0,5 m, `PL_EDGE` – krawężnik (płyty 1 m),
  `PL_TACT` – pas ostrzegawczy z kopułkami co 6 cm; materiały `World.platformMats()` (bez zamiany na materiał z kolorem
  w wierzchołkach).
- Peron z gry (`buildStation`): płyta wierzchnia 0,22 m (`platformSlab` – dzielona co 3 m, wygina się po łuku)
  z nawisem 0,18 m nad cofniętą ścianą (peron wyspowy – z obu stron); krawężnik 0,5 m i pas ostrzegawczy 0,55–0,95 m
  od krawędzi; na przystankach bez osobnego jasnego pasa dotykowego.
- Perony z mapy (`buildEnvPlatforms`): wierzch, pochylnie, krawężnik i pas z atrybutem `aPl`; listwa krawędzi
  (nawis 7 cm – czoło i spód).
- Wiaty: płatwie i rury spustowe (`shelter`), stopy słupów, rura spustowa i gablota (`haltShelter`).

## 0.20.0 – 15 października 2026

Etap 11, krok G4 – część 2 (wagony).

### Tabor (etap 11, G4 – część 2: wagony)
- Wagony towarowe (`freightParts` – także wagony na bocznicach, instancje w `real-env.js`): obrót części jako kąty
  Eulera `[rx, ry, rz]`; Eaos – skrzydła drzwi, drążki zamknięć, zawiasy, słupki poza drzwiami, tablice; Falns – burta
  pośrodku wyżej, pod nią skośne ściany lejów, zsypy z klapami; Zacns – kołyski, obejmy, pomosty z poręczami, zawór
  spustowy; Sgns – naroża kontenerów i tabliczki CSC; Habbiins – uchwyty i zamki ścian; tablice danych UIC.
- Sygnał końca pociągu: wagony towarowe – tarcze (biały kwadrat z czerwonymi trójkątami, `endPlate`), wagony
  pasażerskie – latarnie toczone na ścianach czołowych (świecą na końcu ostatniego wagonu).
- Szyby boczne: krycie 0,42 (było 0,3), mocniejsze odbicia otoczenia.

## 0.19.0 – 15 października 2026

Etap 11, krok G4 – część 1 (lokomotywy).

### Tabor (etap 11, G4 – część 1: lokomotywy)
- Naprawa kloszy reflektorów i świateł końcowych: profil bryły obrotowej klosza był odwrócony (ściany do środka –
  niewidoczne); teraz klosze są widoczne we wszystkich pojazdach.
- Górny reflektor na dachu (styl `roofLamp`: EU07, ET22, EN57/EN71/ED72): toczona obudowa na podstawie dopasowanej
  do wysokości dachu (promień w dół na bryłę pudła), chromowana obręcz, klosz; w lokomotywach po bokach syreny
  (`HORN_GEO` – trąbka z czarą), pozostałe lokomotywy – syreny jako trąbki zamiast walców.
- Lampy dwukomorowe (`twinLamp`: EU07, ET22): białe i czerwone światło w jednej obręczy z odbłyśnikiem; wysokość lamp
  i tabliczki z numerem ze stylu (`headY`, `headR`, `plateY`).
- Zgarniacze pod zderzakami (`plough: 'pair'`) zamiast pługa w kształcie V (EU07, ET22); wycieraczki EU07 zawieszone
  u góry szyb (`wiperTop`).
- Burta ET22 (`side: 'et22'`, wg zdjęć ET22-886 i ET22-128): okienko i kratka w górnym rzędzie, siedem żaluzji filtrów,
  pas żaluzji pod dachem; numer i napis PKP w górnym rzędzie (na jasnym lakierze ciemne).

## 0.18.0 – 15 października 2026

Etap 11, krok G3.

### Niebo
- Chmury wolumetryczne zamiast płaskiej warstwy szumu: marsz promienia przez warstwę ok. 1,1–2,6 km (przy pełnym
  zachmurzeniu niższą i zwartą), gęstość z tej samej mapy zachmurzenia co cienie chmur na ziemi (cień pod chmurą),
  kształt – płaska podstawa, kłęby zwężające się ku górze, brzegi z trzech oktaw szumu 3D; światło z dwóch próbek
  w stronę słońca (prawo Beera, „puder” na brzegach), rozproszone światło nieba, o zachodzie podświetlenie od spodu,
  w oddali kolor horyzontu. Liczone co ok. 0,4 s do panoramy 1024 × 512 (64 kroki) z rozmyciem – w kopule nieba tylko
  odczyt (gładko, bez ziarna); zachmurzenie wg pogody (pogodnie – pojedyncze kłęby, deszcz – bez prześwitów).

### Woda
- Materiał wody (`js/3d/water.js`): fale z czterech kierunków wg wiatru (dłuższe niż kilka pikseli – bez mory
  w oddali), kolor głębi, efekt Fresnela, połysk słońca.
- Odbicie lustrzane: przed klatką scena z kamery odbitej względem lustra akwenu, na który się patrzy (mediana
  wysokości), z ukośną płaszczyzną przycięcia (bez rekompilacji shaderów), w połowie rozdzielczości (niska jakość –
  35 %, wysoka – 60 %), co drugą klatkę; bez opadów, flary i wnętrza kabiny; zniekształcone falami. Koszt tylko blisko
  wody (średnia jakość: ok. 2–3 ms na klatkę).

## 0.17.0 – 15 października 2026

Etap 11, krok G2.

### Horyzont z prawdziwego terenu
- Dawniej: dwa pierścienie sinusoidalnych gór (do ok. 8° nad horyzontem) na każdej trasie – także tam, gdzie gór
  nie ma. Teraz daleki pierścień ma wysokość R · tg(kąt wzniesienia terenu) w danym kierunku, z profilu dla bieżącego
  miejsca trasy (co ok. 3 km, 180 kierunków, teren 2,5–60 km z krzywizną Ziemi i refrakcją) – `js/horizon-data.js`.
- Trasy wbudowane: `node tools/horizon.js` – stacje z OSM dopasowane do położeń w grze (obrót, odbicie osi,
  przesunięcie; błąd średni 50–65 m), wysokości z kafli terenu AWS Terrain Tiles (przybliżenie 10), wynik
  w `routes/horizon/<id>.js`. Najwyżej: Rybnik – Katowice 1,4°, Gliwice – Katowice 1,2°, Gliwice – Zabrze 0,7°,
  Toruń – Chełmża 0,5°.
- Generator: powiązanie układu gry z mapą zapisane w trasie (`geo`) i horyzont (`horizon`) z siatki wysokości co
  4 km (Open-Meteo) – trasy wygenerowane wcześniej mają łagodne pagórki (wygeneruj ponownie, by dostać horyzont).
- Bliski pierścień: niska linia lasów i zabudowy zamiast drugiego pasma wzgórz.

## 0.16.0 – 15 października 2026

Etap 11, krok G1.

### Pory roku i pogoda
- Pora roku w grafice (dotąd tylko w przyczepności): jesień – korony dębów i lip rdzawe, złote i brązowe (część zielona),
  brzozy i topole żółte, krzewy czerwonawe, trawa i łąki płowe, pola po żniwach; opadłe liście na torze (na odcinkach
  „liście na torze” ok. 25 na m², gdzie indziej rzadko) i w trawie; spadające liście przy kamerze, niesione wiatrem.
  Zima – bezlistne, rzadsze korony, zgaszona trawa, zaorane pola i lekka pokrywa śnieżna także bez opadu (nie
  w deszczu). Wiosna – jaśniejsza zieleń. Zmiana pory roku przebudowuje świat.
- Pogoda „burza”: ulewa, wiatr, ciemne niebo; co 5–21 s błyskawica 0,4–5,5 km od kamery – rozbłysk nieba i sceny,
  rozgałęziony kanał (bliżej niż 3,5 km), grzmot z opóźnieniem odległość / 343 m/s (trzask przy bliskich, dudnienie –
  im dalej, tym niżej i dłużej). Przyczepność jak w deszczu.

### Kabina i ekran wczytywania
- Kabina: światło wypełniające słabsze i niżej (w dzień natężenie do 3,5 zamiast 15,5 tuż pod sufitem – sufit
  i ściany były przepalone na biało); reflektory i światła końca pierwszego pojazdu (model zewnętrzny) schowane
  w widoku z kabiny – były widoczne jako jasna okrągła tarcza na suficie; rozbłysk słońca zasłaniany przez dach
  i ściany kabiny.
- Ekran wczytywania: pasek i procent pokazują rzeczywisty postęp (budowa świata, kompilacja shaderów) – dawniej pasek
  szedł animacją „na czas”, a procent stał, gdy strona budowała świat.

## 0.15.0 – 14 października 2026

### Głos zapowiedzi
- Silnik mowy do wyboru (Ustawienia → Dźwięk → Zapowiedzi): głosy systemu albo **Piper** – naturalne głosy polskie
  (Gosia, Darkman, MC Speech; modele VITS ONNX) liczone w osobnym wątku. Przy pierwszym użyciu pobierane i zapamiętywane
  w pamięci przeglądarki: silnik ONNX Runtime Web i fonemizer eSpeak NG (ok. 30 MB, jednorazowo) oraz model głosu
  (ok. 63 MB), z postępem w ustawieniach; potem bez internetu. Mowa odtwarzana przez silnik dźwięku gry (suwak „Głos
  zapowiedzi”) – przeglądarka jej nie przerywa. Do czasu wczytania głosu czyta głos systemu.
- Głosy systemu: wybór głosu (polskie, opcjonalnie wszystkie), odsłuch ▶, tempo 0,7–1,3 i wysokość 0,5–1,5;
  zapowiedź przerwana przez przeglądarkę (Brave – przy kliknięciu) dokańczana od przerwanego słowa.

### Jazda
- Start z zahamowanym składem: hamulec prosty – nastawnik na H1, zespolony – zawór maszynisty na odcięciu (przewód
  główny 4,6 bar); komunikat na starcie i samouczek mówią, jak ruszyć.
- Kabina: dźwignia nastawnika przesuwa się w szczelinie – podstawa przy znaku bieżącej pozycji (dawniej obracała się
  na osi w środku podziałki i z fotela maszynisty przy „0” wyglądała na „H1”).

## 0.14.4 – 14 października 2026

### Poprawki
- Perony z mapy: wierzch dzielony na pasy co 4 m wzdłuż toru, boki zagęszczone – na łuku peron idzie za torem.
  Dawniej długi bok obrysu (np. 170 m) był w świecie cięciwą łuku i płyta peronu przechodziła przez tor na drugą
  stronę (Łaziska Górne na linii Rybnik – Katowice). To samo dla zadaszeń peronów z mapy.
- Plakietka „Rozkazy: N”: po najechaniu myszą zostaje jasna (ogólny styl przycisków dawał ciemne tło i znikał napis).

## 0.14.3 – 14 października 2026

### Panel jazdy
- Panel z rozkładem jazdy tej samej szerokości co panel z nastawnikiem (dopasowuje się, gdy ten zmienia szerokość –
  napęd wg serii, hamulec zespolony, mniejszy ekran).
- Rozkazy pisemne: po potwierdzeniu plakietka „Rozkazy: N” na końcu wiersza kilometrażu w panelu rozkładu (kliknięcie
  albo `O` – ostatni rozkaz) zamiast przycisku nad panelem, który nachodził na zegar i punkty.

## 0.14.2 – 14 października 2026

### Menu
- Okna Gra jednoosobowa, Scenariusze, Generator tras, Historia jazd, Co nowego, Ustawienia, Wczytaj grę, pauza
  i ekran końca jazdy wyrównane do lewej (jak menu główne), z tym samym tłem.

### Drobne zmiany
- Głośność głosu zapowiedzi domyślnie 60% (gdy suwaki dźwięku nie były jeszcze zmieniane).
- Kilometraż w panelu jazdy z jednym miejscem po przecinku (km 12,3).

## 0.14.1 – 14 października 2026

### Dźwięk
- Głośność grup dźwięków w Ustawieniach (względem ogólnej): pociąg (silniki, toczenie, hamulce), syreny, otoczenie
  (wiatr, deszcz, ptaki, miasto, inne pociągi, przejazdy), sygnały (gong, radiotelefon, czuwak, SHP, drzwi), głos
  zapowiedzi; suwaki jednakowej szerokości, opisy zawijane.
- Druga syrena – wysokotonowa (`J`, przycisk „Syrena 2”): jeden ton ok. 1,6 × wyższego tonu syreny (najwyżej
  880 Hz), węższa tuba; zalicza sygnał „Baczność” przed przejazdem i cel „syrena” w scenariuszach.

### Panel jazdy
- Kilometraż pod zegarem: km czoła pociągu od początku trasy, ile zostało do stacji końcowej i długość trasy.
- Komunikaty: cienka ramka dookoła w kolorze rodzaju komunikatu zamiast paska z lewej.

## 0.14.0 – 14 października 2026

Etap 10e planu rozwoju (C3). Etap 10 zakończony (10d – prawdziwy rozkład jazdy – pominięty).

### Linie jednotorowe – krzyżowania
- Odcinki jednotorowe wyznaczane z danych mapy (brak toru obok, mijanki krótsze niż 300 m i odcinki krótsze niż
  500 m pomijane): Toruń Główny – Chełmża (mijanki w Łysomicach i Ostaszewie), Rybnik – Katowice (9 odcinków);
  linie gliwickie – dwutorowe.
- Pociąg z przeciwka wjeżdża na odcinek jednotorowy tylko wtedy, gdy nie ma na nim pociągu w Twoim kierunku,
  mijanka za odcinkiem jest wolna i zdąży go zwolnić przed przyjazdem Twojego pociągu (wg rozkładu i największej
  prędkości) oraz pociągów tła za Tobą – inaczej czeka na mijance na torze bocznym. Zawsze ustępuje pociąg tła.
- Twój pociąg jedzie torem głównym; gdy odcinek zajmuje pociąg z przeciwka, semafor przed nim wskazuje „stój”
  (komunikat dyżurnego o krzyżowaniu); dyżurny informuje też (opcja „Rutynowe komunikaty”), że pociąg z przeciwka
  czeka na Ciebie.
- Pociągi z przeciwka jadą jeden za drugim z odstępem, na liniach jednotorowych rzadziej (co 60 / 40 / 30 min).
- Rysowanie: na odcinku jednotorowym po torze gracza, na mijance po torze bocznym, przejście przy rozjeździe.
- Sygnalizacja przejazdu: pociąg tła stojący przed przejazdem nie zamyka rogatek.
- Testy: brak spotkań na jednym torze i zakleszczeń (punktualny i spóźniony gracz, różne poziomy ruchu).

## 0.13.0 – 14 października 2026

Etap 10c planu rozwoju (C5).

### Pasażerowie
- Popyt na stacjach wg pory dnia (szczyt 6–9 i 14–18, noc) i rodzaju stacji (dworzec / przystanek) oraz czasu od
  ostatniego pociągu osobowego w tym kierunku – osobowe pociągi tła zabierają czekających.
- Obciążenie składu (pojemność z długości wagonów pasażerskich, ok. 4,5 osoby na metr), 75 kg na osobę w masie
  składu; przy pełnym składzie część podróżnych zostaje na peronie (komunikat).
- Czas postoju z wymiany: ok. 10 s + wsiadający i wysiadający przy ok. 1,2 osoby/s na wagon (od 60 % do
  dwukrotności postoju rozkładowego); w panelu jazdy – wsiada, wysiada, w pociągu.

### Zapowiedzi
- Gong i tekst: na peronie (Twój pociąg przy peronie z godziną odjazdu, pociąg osobowy z przeciwka, przejazd bez
  zatrzymania po torze drugim, zakończenie biegu) i w pociągu („Następna stacja…”).
- Ustawienia → Dźwięk → „Zapowiedzi”: gong i tekst / z głosem (synteza mowy przeglądarki) / wyłączone.

### Tablice odjazdów
- Elektroniczna tablica na peronie każdego dworca: najbliższe odjazdy (Twój pociąg i osobowe pociągi tła, tor,
  przewidywane opóźnienie), odświeżana, gdy pociąg jest w pobliżu.

## 0.12.0 – 14 października 2026

Etap 10b planu rozwoju (B5).

### Zadanie dnia
- Zadanie dnia (ekran „Scenariusze”, na górze): z daty losowane są trasa (spośród wbudowanych), skład pasujący do
  linii, godzina odjazdu, pogoda, pora roku (wg miesiąca), zdarzenia na trasie i dwa cele – u wszystkich takie same.
- Najlepszy wynik dnia (gwiazdki) i seria dni z rzędu z ukończonym zadaniem; zapis gry z zadaniem dnia wczytuje
  zadanie z tej samej daty.

## 0.11.0 – 14 października 2026

Etap 10a planu rozwoju (A6).

### Ocena jazdy
- Ocena po jeździe w gwiazdkach 1–5 obok punktów: punktualność (średnie spóźnienie), zatrzymania przy W4,
  płynność (szarpnięcia – zmiana przyspieszenia ponad 0,8 m/s³), komfort (przyspieszenie poprzeczne w łukach ponad
  1 m/s² po wyrównaniu przechyłką, hamowanie ponad 1,2 m/s²), energia (wobec przejazdu automatu), bezpieczeństwo;
  ocena ogólna – średnia.
- Wykres przejazdu na ekranie końca: prędkość, dozwolona prędkość (z ograniczeniami doraźnymi), stacje, hamowania
  nagłe.
- „Historia jazd” w menu – ostatnie 30 jazd z ocenami i najlepszą oceną dla trasy i składu.

## 0.10.0 – 14 października 2026

Etap 9 planu rozwoju (D2 + D4 + D5) z odłożonymi optymalizacjami z etapu 1.

### Wydajność
- Wspólne materiały w świecie: elementy o tym samym rodzaju powierzchni, różniące się kolorem, rysowane razem
  (kolor w wierzchołkach) – w kabinie ok. 12 ms zamiast ok. 20 ms na klatkę (Rybnik, deszcz, jakość średnia).
- Modele pociągów tła i wagonów na bocznicach scalone (o połowę mniej elementów); modele pociągów tła przygotowane
  na ekranie wczytywania i używane ponownie – bez przycięć przy pojawianiu się pociągu.
- Cienie: najdalsza kaskada odświeżana co cztery klatki; kawałki świata dalej niż ok. 450 m i drobiazgi (podkłady,
  trawa) bez cienia.
- Zasięg szczegółów zależny od jakości (niska – ok. 80 %, wysoka – 115 %) z mgłą dopasowaną do zasięgu; automatyczny
  dobór jakości przy pierwszym uruchomieniu (przycisk w Ustawieniach); dopasowanie zasięgu w czasie jazdy, gdy FPS
  długo spada poniżej 28 (opcja, domyślnie włączona).

### Generator tras
- Kontrola trasy (`js/route-check.js`, `tools/route-check.js`, testy): pochylenia ponad 30 ‰, skoki wysokości, ciasne
  łuki, W4 poza peronem, nakładające się perony, przejazd na peronie, semafory blisko siebie lub przejazdu, prędkości,
  przejazd automatem; raport po wygenerowaniu trasy i przycisk „Kontrola” przy trasie.

## 0.9.0 – 14 października 2026

Etap 8 planu rozwoju (ROADMAP: A4 + A5).

### Napędy wg serii i przyczepność
- Opcja „Napęd wg serii”: rozruch oporowy (EU07, ET22, EN57… – pozycje szeregowe, równoległe, bocznikowanie;
  przekaźnik nadmiarowy przy za szybkim rozruchu, przegrzewanie oporników), falownik (Elfy, ED250), spalinowy
  (SM42, ST44, SU46 – obroty silnika); prąd silników w HUD i na amperomierzu.
- Przyczepność zależna od pogody i pory roku (nowy wybór w „Warunkach”; jesień – liście na torach, zima – słabiej);
  poślizg kół, blokowanie kół i płaskie miejsca, piasecznica (X).
- Hamulec dodatkowy lokomotywy (Shift+A / Shift+Q) przy hamulcu zespolonym.

## 0.8.0 – 14 października 2026

Etap 6 (C4).

### Dyżurny ruchu i rozkazy pisemne
- Rozkaz pisemny „O” (ograniczenie prędkości) na stacji przed odjazdem – karta w kabinie, odjazd po potwierdzeniu
  (Enter); klawisz O – ostatni rozkaz.
- Uszkodzone semafory: przed odstępowym – rozkaz „S” przez radiotelefon (jazda ostrożna do 20 km/h), przed wjazdowym
  i wyjazdowym – sygnał zastępczy Sz (białe migające, 40 km/h); ruszenie bez potwierdzenia rozkazu – hamowanie i kara.
- Rutynowe komunikaty dyżurnego (odjazd, pociąg na odstępie przed Tobą, przyjęcie na stację) – opcja w „Pomocy”.
- Nowy scenariusz „Awaria sterowania”; „Roboty na szlaku” z rozkazem „O”; usterki semaforów w zdarzeniach losowych.

## 0.7.0 – 14 października 2026

Etap 5 (C1 + C2).

### Ruch na linii
- Pociągi tła według rozkładu: przed Tobą i za Tobą na Twoim torze, z przeciwka na drugim torze; suwak „Ruch na
  linii” w „Warunkach” (brak / mały / średni / duży).
- Blokada liniowa: semafor „stój”, gdy odcinek za nim zajmuje inny pociąg – zamiast losowego „trzymania”.
- Spóźnienie zatrzymuje pociąg jadący za Tobą: komunikat dyżurnego, liczba w podsumowaniu, opcjonalnie kara.
- Przejazdy kolejowe reagują na wszystkie pociągi; na liniach bez sieci – składy spalinowe.
- Ustawienia: limit pociągów tła rysowanych naraz, opcja „z maszynistą i pasażerami w oknach”.

## 0.6.0 – 14 października 2026

Etap 4 (A2 + A3).

### Hamulec zespolony i SHP
- Opcja „Hamulec zespolony”: zawór maszynisty (A / Q: napełnianie, jazda, odcięcie, hamowanie, nagłe), ciśnienie
  w przewodzie głównym, fala hamowania wzdłuż składu, nastawa P i G (długi towarowy hamuje i luzuje wolno),
  hamulec elektropneumatyczny w EZT, blokada jazdy poniżej 4 bar, odzysk energii w nowoczesnych EZT.
- Zawór, ciśnienia w przewodzie i cylindrze w HUD, na manometrze i ekranie w kabinie; asystent hamowania
  uwzględnia zwłokę hamulca.
- SHP: elektromagnes 200 m przed semaforem – lampka i brzęczyk, potwierdzenie spacją w 3,5 s.
- Tryb prosty (nastawnik z H1…H4) zostaje domyślny.

## 0.5.0 – 14 października 2026

Etap 3 (B1 + B2, zdarzenia losowe z B5).

### Scenariusze
- Nowy ekran „Scenariusze”: jazdy z celem, z gwiazdkami za ukończenie i spełnione cele (najlepszy wynik zapamiętany).
- Samouczek „Pierwsza jazda” z instruktorem prowadzącym krok po kroku (ruszanie, prędkość, jazda z rozpędu,
  syrena, czuwak, hamowanie do W4, drzwi).
- Sześć scenariuszy: Poranny szczyt, Roboty na szlaku, Bez prądu, Mgła pod Toruniem, Towarowy w śniegu,
  Oszczędna jazda.
- Zdarzenia na trasie: ograniczenia doraźne z tablicami w świecie, wydłużone postoje, opóźniony odjazd, zanik
  napięcia w sieci, zmiana pogody.
- Radiotelefon: komunikaty dyżurnego ruchu z sygnałem wywołania, potwierdzane klawiszem Enter.
- Zdarzenia losowe w jeździe swobodnej (zakładka „Warunki”) – na każdej trasie, także wygenerowanej.
- Licznik energii pobranej na jazdę i hamowań nagłych (cele scenariuszy).

## 0.4.0 – 14 października 2026

Etap 2 (A1).

### Sygnalizacja
- Semafory podają sygnały jak na PKP (instrukcja Ie-1, S1–S13a): górne światło zielone albo pomarańczowe, ciągłe
  albo migające, zapowiada następny semafor (wolna droga, do 100 km/h, do 40 lub 60 km/h, „stój”); dolne
  pomarańczowe i pas świetlny – ograniczenie przy semaforze przez rozjazdy (40, 60 albo 100 km/h).
- Model semafora z pasem świetlnym pod głowicą i drugą poświatą; światła migają.
- Panel semafora w HUD: głowica z tymi samymi światłami, prędkość przy semaforze, oznaczenie sygnału i zapowiedź
  następnego; oznaczenie sygnału na ekranie w kabinie. Opis sygnałów w zakładce „Pomoc”.

### Ikona
- Favicon na karcie przeglądarki: `favicon.ico` (16–256 px), wektorowy `icons/favicon.svg` i ikona dla ekranu
  głównego (`icons/apple-touch-icon.png`) – ten sam rysunek co ikona aplikacji, generowane przez `npm run icon`.
- Okno aplikacji desktopowej bierze ikonę z `favicon.ico` – wcześniej wskazywało `build/icon.png`, którego nie ma
  w spakowanej aplikacji.

## 0.3.0 – 13–14 października 2026

Etap 1 (D0 + D1 + D3) oraz zmiany grafiki taboru, otoczenia i kabiny.

### Wydajność
- Nieruchome części świata scalane w kawałku według materiału (także obiekty z kilku egzemplarzy – latarnie,
  słupki, znaki): ok. 40% mniej wywołań rysowania (Rybnik, kabina: 2443 → 1203), klatka ok. 20% krótsza.
- Drzewa dalej niż ok. 170 m od kamery z lżejszej bryły (ok. 100 zamiast ok. 1000 trójkątów), zwarte masy lasu
  zawsze; podkłady, przytwierdzenia, trawa, kwiaty i trzciny dalej niż ok. 230 m nie są rysowane.
- Brak przycięć przy pierwszym wejściu do kabiny i zmianie widoku: shadery kompilowane, a tekstury i bryły
  wysyłane do karty graficznej na ekranie wczytywania.
- Nakładka diagnostyczna `F3` (FPS, czas klatki z podziałem, czas karty graficznej, wywołania, trójkąty, siatki)
  i test wydajności z konsoli (`maszynista.bench()`).

### Grafika taboru
- Patyna eksploatacyjna na pojazdach (kurz od wózków, zacieki, sadza na dachu), falowanie blach, spoiny i nity
  na burtach – w shaderze, bez tekstur.
- Okluzja otoczenia wypiekana w wierzchołkach modelu (zagłębienia, styki części, przestrzeń pod pudłem).
- Fazowane krawędzie skrzyń i belek, gładsze walce, toczone zderzaki i reflektory z chromowaną obręczą
  i wypukłym kloszem, izolatory z kloszami.
- Więcej detali: skrzynia oporników z żaluzjami i kratą, szyna WN na izolatorach obok niej, pomost dachowy,
  kraty wentylatorów spalinowozów, piasecznice, tłumiki i cięgła hamulcowe w wózkach lokomotyw.
- Detale EZT (aparatura pod podłogą, zbiorniki, fartuchy nowoczesnych EZT, szyna WN EN57, toczone grzybki),
  wagonów pasażerskich (prądnica osiowa, stopnie manewrowe, uchwyty, klamki) i towarowych (zderzaki toczone ze
  sprzęgiem, hamulec zespolony i ręczny, stopnie); tłumiki i cięgła hamulcowe w wózkach; żebra blach na dachach.
- Drobne detale rysowane tylko z bliska (LOD); pociągi mijane bez kosztownych etapów budowy.
- Podgląd składu w menu z cieniami słońca i bogatszymi odbiciami nieba.

### Pogoda i otoczenie
- Śnieg i krople na dachach pociągów i na samochodach nie przesuwają się już w czasie jazdy.
- W kabinie nie pada do środka, w tunelu (widok z kabiny) opad gaśnie; krople na szybie przejrzyste jak soczewki.
- Podsypka z drobnego tłucznia zamiast „bruku”, przytwierdzenia szyn z łapkami sprężystymi, różne odcienie
  podkładów, ciemniejsza rdza na szynach, żywsze korony drzew.
- Drogi: koleiny w pasach ruchu i osad przy krawężnikach (w deszczu woda w koleinach), studzienki i kratki ściekowe.
- Korony drzew o naturalniejszym kształcie: kępy na różnych wysokościach, rozbita sylwetka, spłaszczony spód.
- Szybsza kompilacja shaderów: krople deszczu na powierzchniach bez kosztownej pętli w każdym materiale.
- Wiaty peronowe bez szklanych ścian bocznych (wyglądały jak wolno stojące puste ramy).
- Cieniowanie nie słabnie już po obniżeniu kamery: okluzja otoczenia (AO) działa przy każdej wysokości kamery
  (wcześniej wyłączała się poniżej 12 m nad pociągiem); fałszywe przyciemnienie płaszczyzn przy płaskim spojrzeniu
  wygaszane w shaderze AO.
- Ostrzejsze cienie przy pociągu: druga kaskada cieni węższa (80 m) i w pełnej rozdzielczości jakości (wysoka –
  4096), najostrzejsza wyśrodkowana bliżej pociągu, mniejsze przesunięcie wzdłuż normalnej (cienie nie kurczą się
  i nie odklejają od podstaw). Teksel cienia wagonów za lokomotywą: 11,7 → 7,8 cm (średnia), 3,9 cm (wysoka).

### Przejazdy kolejowe
- Sygnalizatory stoją przed wszystkimi torami przejazdu (także torami z mapy), co najmniej 3,5 m od szyn – wcześniej
  przy kilku torach albo ulicy ukośnej stały między torami lub przy samych szynach.
- Auta nie wjeżdżają na tory przy działającej sygnalizacji: stają przed sygnalizatorem; auto, które nie zdąży
  zahamować, przejeżdża od razu; na krótkich ulicach auto nie pojawia się już tuż przed linią z pełną prędkością.

### Ruch pieszych i aut
- Pasażerowie na peronach omijają ławki, kosze, latarnie, słupy tablic i wiat, gabloty i ściany oraz innych ludzi
  (siatka przeszkód stacji); na starcie nikt nie stoi w ławce ani w innej osobie. Wejścia w przeszkody: z setek–
  prawie 2000 na wymianę pasażerów do 0–37, nakładanie się osób: z 140–760 do 0–16.
- Auta na ulicach miasteczek trzymają odstęp od auta przed sobą (nie przejeżdżają przez wolniejsze), przechodnie
  na chodnikach schodzą sobie z drogi.

### Kabina maszynisty
- Wnętrze kabiny w lepszej jakości: zaokrąglone krawędzie pulpitu, fotela, ramek i obudów; zegary w okrągłych
  obudowach z chromowaną obręczą i szkłem, lampki kopułkowe i przyciski w oprawkach, nastawnik z podświetlaną
  podziałką (J5…0…H4, N) i szczeliną, gałki toczone, kran hamulca na korpusie zaworu.
- Faktury: lakier strukturalny pulpitu, blacha ryflowana podłogi, tapicerka fotela, panele z nitami na ścianie tylnej.
- Nowe detale: osłona kolan z kratką grzejnika, podnóżek z pedałami, gumowa listwa blatu i uszczelka przy szybie,
  koło hamulca ręcznego, zawiasy i klamka drzwi, głośnik i poręcz pod sufitem, fotel na podstawie z ramionami.
- Kabina nie jest już prawie czarna: światło rozproszone dnia wpadające przez szyby (słabnie o zmroku); ekrany
  i zegary rysowane w 1,5 × wyższej rozdzielczości.
- Woltomierz i amperomierz przeniesione na półkę z przyrządami (obok prędkościomierza) – wcześniej leżały pod nim
  i jego obudowa je zasłaniała.
- Okładziny od środka kabiny w kolorze ścian: słupek między dwiema szybami czołowymi (EP09, ET22, ST44, SU46)
  i skrzydła drzwi bocznych lokomotywy (z klamką, okienko odkryte) – wcześniej w kabinie widać było elementy nadwozia
  w kolorze malowania (np. czerwone w SU46).
- Blat pulpitu płaski (wierzch 2,37 m), leży na korpusie; lampki, przyciski, przełączniki, rozkład jazdy, nastawnik
  i kran hamulca stoją na nim (wcześniej blat wznosił się ku maszyniście, a przyrządy częściowo w nim tonęły);
  gumowa listwa na krawędzi blatu.
- Metal w kabinie matowy (stal szczotkowana zamiast lustrzanego chromu), przyciski, gałki i szkło zegarów mniej
  błyszczące, słabsze odbicia nieba we wnętrzu – bez jaskrawych refleksów i poświaty.
- Jasne tabliczki przełączników, rozkład jazdy i opisy przycisków nie przepalają się w dzień do białych plam (bez
  świecenia własnego, ciemniejsze, matowe); światło wypełniające kabiny wyżej, nad fotelem – pulpit oświetlony
  równo, bez gorącej plamy.

## 0.2.0 – 13 października 2026

### Zapis gry i menu
- Zapis i odczyt gry jednoosobowej: 5 miejsc na zapisy oraz autozapis (przy odjeździe ze stacji, wyjściu do menu
  i zamknięciu okna); w pauzie „Zapisz / wczytaj grę”, w menu głównym „Wczytaj grę”.
- Okienko wczytywania (blokujące menu) przy wyborze trasy, przy wyborze trasy z Generatora tras („Wybierz”) oraz
  przy zmianie składu, warunków i pierwszym podglądzie składu.
- Ekran „Co nowego” w menu głównym.

### Tabor
- Nowe zespoły trakcyjne: ED250 „Pendolino” (malowanie EIP – biały z granatem i niebieskim pasem – oraz
  biało-srebrne) i Elfy: EN96, EN62, EN76, 48WE (Elf 2), 27WE – opływowe czoło, sprzęg Scharfenberga, wózki
  Jakobsa, dźwięk napędu z falownikiem; także jako pociągi mijane.
- Wycieraczki zostawiają na obrysie przetartego pola wał zgarniętej wody albo śniegu.
- Długie wycieraczki na wspólnej szybie nie przecinają się: w spoczynku jedna nad drugą, w pracy dolna z opóźnieniem.
- 48WE i ST44: wycieraczki przy przeciwnych narożnikach szyby (wcześniej obie przy jednym).
- Krople na szybach bocznych spływają – w czasie jazdy do tyłu, na postoju w dół.
- Długi skład (np. ED250, dwa EN71) zatrzymuje się w obrębie peronu – wcześniej tył wystawał przed peron i automat
  stał w miejscu („Automat nie ukończył trasy”).

### Wydajność
- Doczytywanie krańców mapy rozłożone na wiele klatek – bez spadków FPS (najgorsza klatka 247 → 47 ms).
- Szybsze budowanie modeli pociągów (dopasowanie wycieraczek: 1,3–1,9 s → 40–110 ms).
- Szybsze wczytywanie tras: najpierw kawałki świata przy pociągu, reszta w tle.

### Generator tras
- Kilometraż przejazdów, semaforów, W4, mostów, ograniczeń i sieci trakcyjnej liczony na osi toru w grze (jak
  otoczenie) – wcześniej przesunięty o kilkanaście metrów względem ulic i peronów z mapy.
- Dokładniejszy rzut stacji, lepszy dobór obrysu peronu z mapy; wysokości z NMT bez fałszywych dołów (0 m jako
  brak pomiaru), wygładzone krótkie garby niwelety.
- Rzut otoczenia na oś płynny (koniec „zębów” na drogach i budynkach); perony dobierane przekrojem; zadaszenia
  peronów z OSM także przy danych BDOT10k; typy i nazwy budynków (34 rodzaje).
- Sieć trakcyjna tylko tam, gdzie linia jest zelektryfikowana (np. częściowo Toruń – Chełmża).
- Wszystkie cztery trasy wbudowane wygenerowane ponownie: Gliwice – Zabrze, Gliwice – Katowice, Rybnik – Katowice,
  Toruń Główny – Chełmża.

### Drogi i otoczenie
- Wkopy drogowe (DTŚ w Gliwicach i Katowicach): ściany do poziomu ulic, chodnik na koronie, portale tuneli,
  gęstsza siatka terenu przy wkopie – zamiast szerokiej doliny.
- Mury oporowe przy rampach wiaduktów i przy jezdniach biegnących obok niższych; pochylenie jezdni z pomiaru
  ograniczone do 12%; końce pomostów wiaduktów w poziomie dochodzącej ulicy.
- Wygładzone ulice (wysokość i przebieg), place i parkingi bez migotania pod jezdniami, pas zieleni między
  jezdniami dwujezdniowych dróg bez klinów.
- Przejazdy kolejowe na prawdziwych ulicach z mapy; auta stają przed przejazdem; sygnalizatory z krzyżem
  św. Andrzeja przy ulicy, przodem do nadjeżdżających; teren wyrównany tylko przy torze.
- Most na Wiśle w Toruniu: teren pod przęsłem z pomiaru, woda pod mostem, równe lustro wody.
- Drogi pod mostami na właściwej wysokości, filary nie stoją na jezdniach, wiadukty nad wykopami przedłużone.

### Stacje i tory
- Peron nie zaczyna się przed obrysem z mapy (bez wchodzenia na rozjazdy); niskie perony z wyposażeniem na
  właściwej wysokości; peron z torem tuż za tylną krawędzią traktowany jak wyspowy (latarnie w osi, np. Orzesze).
- Zegar i tablica z numerem peronu pod prawdziwym zadaszeniem albo na słupie; tabliczki pod wysięgnikiem latarni
  zawieszone prawidłowo.
- Wysokość torów z mapy bez uskoków na łukach; pociągi z przeciwka nie jeżdżą po torach z odstawionymi wagonami.

## 0.1.0 – 10–12 października 2026

### 12 października
- Ekran gry jednoosobowej: zakładki Mapa, Pociąg, Warunki, Pomoc; budowanie składu z katalogu prawdziwego taboru
  (EU07, EP09, ET22, SM42, ST44, SU46, EN57, EN71, ED72, wagony 111A, 120A, A9, B10, Bdhpumn, towarowe) z wyborem
  malowań; fikcyjne modele usunięte.
- Aplikacja desktopowa (Electron) z instalatorem; ekran startowy z logo, ekran wczytywania, lepsza pauza (pogoda
  i pora dnia).
- Cienie kaskadowe (bez migotania), trzy etapy poprawy grafiki i dźwięków (pociągi, rogatki, otoczenie), dźwięk
  przejazdu przez zwrotnicę.
- Wycieraczki (włączane, deszcz i śnieg na szybie), podnoszenie i opuszczanie pantografów, dokładniejsze modele
  lokomotyw (SM42 z rzeczywistymi wymiarami), wnętrza wagonów, ludzie z animacjami na peronach i przy drzwiach.
- Otoczenie z mapy: poprawione ulice i skrzyżowania, parkingi, drzewa bez kolizji z budynkami i drogami, perony,
  sieć trakcyjna bez „wiszących” przewodów, pochylnie na końcach peronów, wyposażenie w osi peronu, prawdziwe
  zadaszenia peronów i typy budynków.
- Import i eksport tras z generatora (plik `.trasa`, wybór zaznaczonych tras), swobodna kamera (orbita bez
  ograniczeń, nowe widoki, sterowanie klawiaturą), znacznik „⚠ wysokości” przy podejrzanej niwelecie.
- Pierwszy commit repozytorium.

### 11 października
- Generator tras z oficjalnych źródeł: OpenStreetMap, NMT/NMPT GUGiK (wysokości terenu, torów, dróg i obiektów),
  BDOT10k, wykaz peronów PKP PLK; generowanie z menu gry (pobieranie danych w grze).
- Mosty, wiadukty, nasypy i wykopy z pomiaru; tory innych linii na wiaduktach; modele rozjazdów (także
  krzyżowych) z ograniczeniami prędkości; uwagi generatora do ręcznej korekty (poprawki w pliku trasy).
- Trasa Gliwice – Zabrze wbudowana w grę.
- Modele EU07, EN57 i wagonów 111A wg zdjęć (kolory, okna, przejścia czołowe), przezroczyste szyby kabin
  z maszynistą, iskry pantografu, poprawione SM42 i Bdhpumn.

### 10 października
- Początek projektu: symulator pociągu w 3D (Three.js), kamera za pociągiem, modele generowane w kodzie.
- Kabina maszynisty, pogoda (deszcz, śnieg, mgła) i pora dnia, oświetlenie nocne, lampy, semafory, tarcze
  ograniczeń i W4, perony, wiaty, dworce.
- Menu (gra jednoosobowa, ustawienia dźwięku, grafiki i renderera), wybór pociągu, mapy, pogody, czuwak,
  asystent hamowania, długość składu; nowy HUD (prędkość i nastawnik, sterowanie, rozkład jako oś czasu).
- Dźwięki pociągów (stukot kół, mijane pociągi), auta zatrzymujące się na przejazdach.
- Modele EN57, EU07 i wagonów 111A.
- Pierwsze trasy rzeczywiste z OpenStreetMap: generator (etap 1 – trasa, etap 2 – prawdziwe otoczenie),
  stacje i przystanki z mapy; trasy fikcyjne usunięte.
