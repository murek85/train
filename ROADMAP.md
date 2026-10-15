# Maszynista – plan rozwoju

Koncepcje dalszych kierunków (stan na 14 października 2026, wersja 0.9.0) i kolejność prac.
Każdy etap przed rozpoczęciem wymaga potwierdzenia i odpowiedzi na pytania. Stan prac – przy etapach (**Stan**).

## Spis treści

1. [Kolejność prac](#kolejność-prac)
2. [D – Wydajność i jakość świata](#d--wydajność-i-jakość-świata)
3. [A – Głębia jazdy](#a--głębia-jazdy)
4. [B – Scenariusze i kariera](#b--scenariusze-i-kariera)
5. [C – Żywa kolej](#c--żywa-kolej)
6. [Pominięte](#pominięte)
7. [Otwarte pytania](#otwarte-pytania)

---

## Kolejność prac

| # | Etap | Dlaczego w tym miejscu | Wersja (✓ – wydana) |
|---|---|---|---|
| 1 | **D0 + D1 + D3** – pomiar, mniej wywołań rysowania, brak przycięć | Każdy dalszy etap dokłada obiektów do sceny – bez tego płynność by spadała | **0.3.0** ✓ |
| 2 | **A1** – polska sygnalizacja z prędkościami | Największa zmiana w rozgrywce; potrzebują jej B (zdarzenia) i C (blokada) | **0.4.0** ✓ |
| 3 | **B1 + B2** – silnik scenariuszy, samouczek, pierwszy pakiet | Daje graczowi cel; silnik zdarzeń użyje potem dyżurny ruchu (C4) | **0.5.0** ✓ |
| 4 | **A2 + A3** – hamulec zespolony (z trybem prostym), SHP | Realizm prowadzenia, nowe sytuacje w scenariuszach | **0.6.0** ✓ |
| 5 | **C1 + C2** – ruch na linii z blokadą, widoczne pociągi z rozkładu | Wymaga wydajności (1) i sygnałów (2) | **0.7.0** ✓ |
| 6 | **C4** – dyżurny ruchu, radiotelefon, rozkazy pisemne | Łączy silnik zdarzeń (B1) z ruchem (C1) | **0.8.0** ✓ |
| 7 | **B3** – kariera, znajomość szlaku, turnusy | Ma sens, gdy jest dość scenariuszy i mechanik do odblokowania | odłożone |
| 8 | **A4 + A5** – przyczepność, napędy wg serii | Pogłębienie dla zaawansowanych, niezależne od reszty | **0.9.0** ✓ |
| 9 | **D2 + D4 + D5** – cienie, automatyczna jakość, kontrola tras | Drugi przebieg wydajności po dodaniu ruchu i scenariuszy | **0.10.0** ✓ |
| 10 | **B4, B5, C5, C3, A6** – prawdziwy rozkład, zadanie dnia, pasażerowie i zapowiedzi, krzyżowania, ocena jazdy | Rozbudowa na gotowych fundamentach; kolejność wewnątrz do ustalenia | **0.11.0–0.14.0** ✓ (10d pominięty) |
| 11 | **G1–G5, D1** – grafika i dźwięk (szczegóły niżej) | Gra działa – czas na wygląd i brzmienie | 0.16.0+ (w toku) |
| – | **B6, C6** – edytor scenariuszy, manewry | Najdroższe; decyzja na końcu, czy w ogóle | ? |

Zasady:

- najpierw fundamenty (wydajność, sygnały, silnik zdarzeń), potem treść (scenariusze, ruch, kariera);
- każda wersja ma przynieść graczowi coś odczuwalnego;
- po każdym zrobionym etapie – nowa wersja (0.x), wpis w `js/news.js` („Co nowego”) i `CHANGELOG.md`.

---

## Etap 10 – stan

Plan szczegółowy: 10a ocena jazdy (A6), 10b zadanie dnia (B5), 10c pasażerowie, zapowiedzi, tablice odjazdów (C5),
10e krzyżowanie na liniach jednotorowych (C3). **10d – prawdziwy rozkład jazdy (B4) – pominięty** (decyzja
14 października 2026).

- **10a – 0.11.0 ✓**: ocena w gwiazdkach 1–5 obok punktów (punktualność, zatrzymania, płynność, komfort, energia,
  bezpieczeństwo), wykres przejazdu, historia jazd.
- **10b – 0.12.0 ✓**: zadanie dnia (trasa, skład, godzina, pogoda, pora roku, zdarzenia i cele z daty), seria dni.
- **10c – 0.13.0 ✓**: pasażerowie (popyt wg pory dnia i stacji, pociągi tła zabierają czekających, obciążenie
  i masa, postój z wymiany), zapowiedzi z gongiem (głos – opcja), tablice odjazdów na dworcach.
- **10e – 0.14.0 ✓**: krzyżowania na liniach jednotorowych (odcinki z mapy, pociąg tła czeka na mijance na torze
  bocznym, gracz zawsze torem głównym – „stój” przed zajętym odcinkiem), komunikaty dyżurnego, testy zakleszczeń.

---

## Etap 11 – grafika i dźwięk (plan 15 października 2026)

Decyzje: modele dalej budowane w kodzie (wierne wg zdjęć), z teksturami PBR na licencji CC0 (Poly Haven, ambientCG);
dźwięki – krótkie nagrania CC0 (np. Freesound) jako próbki mieszane z syntezą zależną od prędkości i mocy (nagrania
analizowane liczbowo – widmo, obwiednia – Claude nie słyszy dźwięku); wydajność – jakość ponad wszystko (wyższe
wymagania dla wszystkich jakości); kolejność G1 → G2 → G3 → G4 → G5 → D1, każdy z wersją i „Co nowego”.

| Etap | Zakres |
|---|---|
| **G1 – 0.16.0 ✓** | Kabina: ekspozycja dopasowana do wnętrza, słabsze światło wypełniające (w dzień prześwietlona). Pora roku w grafice: jesienne korony, liście na torze, w trawie i spadające; zima – szron, śnieg na ziemi. Błyskawice w burzy: błysk nieba i sceny, grzmot z opóźnieniem wg odległości. |
| **G2 – 0.17.0 ✓** | Horyzont z prawdziwego terenu: dla tras rzeczywistych sylwetka 5–60 km z danych wysokości (np. Copernicus 30 m, pobierane w Generatorze); płasko – bez gór, linia lasu, zabudowy, kominów, hałd w mgiełce; trasy z gry – ustawienie góry / pagórki / płasko. |
| **G3 – 0.18.0 ✓** | Niebo i chmury (warstwy oświetlone słońcem, zachmurzenie wg pogody, świt i zmierzch), deszcz (smugi, mokra nawierzchnia z odbiciami), śnieg (płatki, zalegający śnieg), woda (fale, odbicia, brzegi, nurt rzek), miękkie cienie. |
| **G4 – 0.19.0–0.23.0 ✓** (lokomotywy, wagony, perony i wiaty, tarcze i sieć, rozjazdy) | Modele kolejowe wg zdjęć: lokomotywy i EZT, wagony, perony, wiaty, zadaszenia, semafory, tarcze, sieć trakcyjna, rozjazdy. |
| **G5** (drzewa – 0.24.0 ✓, samochody – 0.25.0 ✓, ludzie i budynki – 0.26.0 ✓) | Modele otoczenia wg zdjęć: drzewa (gatunki, pory roku), samochody, ulice (krawężniki, oznakowanie, latarnie, znaki), ludzie, budynki. |
| **D1** | Dźwięk: pociągi, ludzie na peronach, otoczenie, grzmot, deszcz o dach kabiny – nagrania CC0 + synteza. |

---

## D – Wydajność i jakość świata

### Pomiary (Rybnik – Katowice, deszcz, EN76 na stacji Rybnik, okno 964×644, jakość „średnia”)

| | Kabina | Widok zza pociągu |
|---|---|---|
| Czas klatki | 28 ms (~35 FPS) | 24 ms (~40 FPS) |
| Wywołania rysowania | 4055 | 2935 |
| Trójkąty | 11 mln | 9,5 mln |

Wnioski:

- **Gra jest ograniczona przez procesor, nie przez kartę graficzną.** Rozdzielczość obniżona 4× daje 27 ms zamiast 29 ms. Czas idzie na obsługę obiektów: 3515 siatek i 341 materiałów na klatkę.
- **Logika gry jest tania:** świat, ruch w tle, pociąg i pogoda razem poniżej 0,5 ms. Samo rysowanie zajmuje ~21 ms.
- **Kawałek świata ze stacją Rybnik ma 743 siatki**, z czego 668 to drobiazgi poniżej 200 trójkątów, oraz 96 materiałów. Zwykły kawałek trasy ma 70–300 siatek.
- **Instancje (drzewa, podkłady, trawa) dają 6,4 mln trójkątów**, w tym 1,9 mln dalej niż 600 m. Drzewa mają 900–2200 trójkątów i nie mają uproszczonej wersji na dalszy plan. Wyłączenie instancji oszczędza ~8 ms.
- **Cienie kosztują ~4 ms:** 3 kaskady, 1824 obiekty rzucające cień.
- Jedna klatka trwała **27 s** po powrocie do gry. Prawdopodobnie to kompilacja shaderów (74 programy). Do wyjaśnienia.

### Stan (14 października 2026) – etap 1 z kolejności

Zrobione:
- **D0:** nakładka `F3`, `maszynista.bench()`, przełącznik porównawczy (localStorage `maszynista.perfOpt`).
- **D1:** scalanie nieruchomych siatek i instancji do 64 egzemplarzy w kawałku, lżejsze drzewa z daleka,
  ukrywanie drobnych instancji z daleka.
- **D3:** kompilacja shaderów i wysłanie tekstur oraz brył na ekranie wczytywania.

Wynik (Rybnik, deszcz, EN76, kabina; to samo okno, po przeładowaniu):

| | Klatka | CPU | Wywołania | Trójkąty | Siatki |
|---|---|---|---|---|---|
| przed | 25,5 ms | 22,3 ms | 2443 | 9,2 mln | 2769 |
| po | 20,2 ms | 17,5 ms | 1203 | 5,9 mln | 1513 |

Pierwsze wejście do kabiny: 107–172 ms → bez przycięcia.

Zostało (cel ≤ 10 ms jeszcze nieosiągnięty):
- **Modele pociągów:** 554 siatki gracza (4 człony) i ok. 700 przy mijanym towarowym (12 członów). `train.js`
  scala tylko pierwszy poziom grupy wagonu; wózki i podgrupy zostają osobno.
- **Przełączanie materiałów:** ok. 190 różnych materiałów w kawałkach. Wspólny materiał z kolorem w wierzchołkach
  zamiast wielu różniących się kolorem skróciłby rysowanie o ok. 3 ms (pomiar z podmianą materiałów).
- **Tablice z napisami:** ok. 100 materiałów z własną teksturą – atlas.
- Pomiar na docelowym sprzęcie (pytania niżej).

**Stan etapu 9 (14 października 2026, wersja 0.10.0): zrobione** – D2 (cienie), D4 (zasięg szczegółów wg jakości,
automatyczny dobór jakości, dopasowanie w grze), D5 (kontrola tras: narzędzie, testy, raport w Generatorze) oraz
odłożone optymalizacje: wspólne materiały z kolorem w wierzchołkach, scalanie modeli pociągów tła, pula modeli.
Kabina (Rybnik, deszcz, średnia): 20,2 → ok. 12,4 ms na klatkę (procesor 17,5 → ok. 10,4 ms). Zostaje: scalanie
modelu pociągu gracza (ruchome części: drzwi, pantografy, wycieraczki), trasy dłuższe niż 70 km i linie bez sieci
w generatorze.

### Etapy

**D0. Pomiar**
- Nakładka diagnostyczna (np. `F3`): czas CPU i GPU, wywołania, trójkąty, siatki, koszt podsystemów.
- Powtarzalny test wydajności: stała trasa, kamera i pogoda, wynik w ms. Każda zmiana ma wynik „przed” i „po”.

**D1. Mniej wywołań rysowania (największy zysk)**
1. Wspólne materiały: te same parametry dają jeden obiekt materiału zamiast kopii w każdym kawałku świata (dziś 341).
2. Scalanie drobnych, nieruchomych siatek w kawałku świata według materiału, po jego zbudowaniu. Stacja: z 743 do ok. 80 siatek.
3. Podział instancji na komórki ~100 m, żeby to, co poza kadrem, nie było rysowane.
4. Uproszczone drzewa w oddali (powyżej ~250 m): płaska podobizna albo prosty stożek zamiast 2000 trójkątów.
5. To samo dla modelu pociągu (części wagonu, detale z bliska).

Cel: ≤ 1000 wywołań i ≤ 10 ms na klatkę w kabinie.

**D2. Cienie**
- Daleka kaskada odświeżana co kilka klatek.
- Cień rzucają tylko obiekty z bliska; drobiazgi i daleka roślinność – nie.

**D3. Przycięcia**
- Kompilacja shaderów na ekranie wczytywania (równolegle), bez zamrożeń przy wejściu do kabiny i zmianie pogody.
- Wyjaśnienie klatki 27 s.
- Limit czasu na budowę kawałków świata w czasie jazdy.

**D4. Ustawienia jakości**
- „Niska” naprawdę zmniejsza liczbę obiektów (zasięg, gęstość roślinności, drobne detale), a nie głównie rozdzielczość, która nie jest wąskim gardłem.
- Automatyczny dobór jakości przy pierwszym uruchomieniu.

**D5. Odporność generatora**
- Narzędzie `tools/route-check.js` z raportem błędów trasy, uruchamiane w testach. Sprawdza:
  - skoki wysokości ulic i torów;
  - przesunięte przejazdy;
  - wagony na torze mijanki;
  - wiszące tablice;
  - mury i rampy.
- Potem trasy dłuższe niż 70 km (sklejanie odcinków) i linie niezelektryfikowane.

---

## A – Głębia jazdy

### Dziś

- Jedna dźwignia: jazda i hamowanie razem (J1–J5, 0, H1–H4, NAGŁE).
- Hamulec narasta w stałym tempie, bez ciśnień i bez różnic między taborem.
- Napęd każdej serii liczony tylko z mocy i siły rozruchowej: EU07, Elf i SM42 prowadzi się tak samo.
- Semafory: 3 stany (czerwony, żółty, zielony), bez podawania prędkości. Czerwony to niegotowy peron albo losowe „trzymanie”.
- Ocena: W4, punktualność, przekroczenia prędkości, syrena, czuwak, hamowanie nagłe.
- Dane już są: generator rozróżnia semafory wjazdowe, wyjazdowe i odstępowe, zna rozjazdy i ograniczenia. W kabinie jest manometr, woltomierz i amperomierz.

### Etapy

**Stan A1 (14 października 2026): zrobione** – sygnały S1–S13a wg Ie-1 ([przepisykolejowe.pl](https://www.przepisykolejowe.pl/sygnaly/swietlne/)),
ograniczenie przy semaforze ze spadku prędkości w ciągu 300 m za nim, pas świetlny, miganie, HUD, ekran w kabinie,
„Pomoc”, testy. Sygnał zastępczy (Sz – białe migające, jazda do **40 km/h**, nie 20) – komora jest, użycie razem
ze scenariuszami (B1). Na wbudowanych trasach semafory z ograniczeniem są rzadkie (1–2 na trasę): pociąg jedzie
torem zasadniczym, a ograniczenia z mapy rzadko spadają tuż za semaforem. Gęściej będzie z wjazdami na tory boczne
(rozjazdy w generatorze, C3).

**A1. Polska sygnalizacja z prędkościami**
- Semafory świetlne według instrukcji Ie-1:
  - zielone, zielone migające, pomarańczowe migające i pomarańczowe ciągłe zapowiadają sygnał na następnym semaforze;
  - dolne pomarańczowe z paskiem zielonym albo pomarańczowym oznacza jazdę z ograniczeniem (np. 40/60/100 km/h) po rozjazdach w bok;
  - sygnał zastępczy (białe migające, jazda do 20 km/h mimo „stój”).
- Sygnał wynika z ograniczenia na rozjazdach przy stacji, z danych generatora. Nie trzeba do tego systemu zależności stacyjnych.
- Model 3D: komory, migające światła, podświetlane paski. Ten sam stan na wyświetlaczu w kabinie i w HUD.
- Przekroczenie prędkości z sygnału liczy się jak przekroczenie ograniczenia. Minięcie „stój” nadal kończy jazdę.
- Dokładne oznaczenia i znaczenia sygnałów oraz wskaźników do sprawdzenia z instrukcją przed implementacją.

**Stan A2 + A3 (14 października 2026): zrobione** – hamulec zespolony jako opcja (tryb prosty domyślny), zawór
na klawiszach A / Q (Q – luzowanie, A – hamowanie; nagłe – E), SHP jako opcja; automat jeździ w obu trybach;
testy. Bez hamulca dodatkowego lokomotywy (osobny zawór) – do dodania razem z A5 (napędy wg serii).

**A2. Hamulec zespolony**
- Model ciśnień:
  - zbiornik główny;
  - przewód główny (5 bar, hamowanie przez obniżenie ciśnienia);
  - cylindry hamulcowe w każdym pojeździe.
- Sygnał hamowania biegnie wzdłuż składu z opóźnieniem. Nastawa P (osobowa) daje szybkie napełnianie, G (towarowa) wolne. Odhamowanie trwa dłużej niż hamowanie.
- Osobny zawór maszynisty z pozycjami:
  - napełnianie;
  - jazda;
  - odcięcie;
  - hamowanie (stopniowane);
  - nagłe.
- W lokomotywach dochodzi hamulec dodatkowy, a w nowoczesnych EZT hamulec elektropneumatyczny i elektrodynamiczny z odzyskiem energii.
- Manometry w kabinie i pasek w HUD: przewód główny i cylinder.
- Tryb prosty zostaje: obecna jedna dźwignia. Tryb realistyczny to opcja.

**A3. SHP (samoczynne hamowanie pociągu)**
- Ok. 200 m przed semaforem trzeba potwierdzić sygnał w ciągu kilku sekund, inaczej włącza się hamowanie nagłe.
- Lampka i dźwięk w kabinie; działa obok czuwaka.

**Stan A4 + A5 (14 października 2026): zrobione** – przyczepność (pogoda, pora roku z liśćmi jesienią, piasecznica,
poślizg i blokowanie kół wg serii), napędy wg serii jako opcja (domyślnie prosty), pełny rozruch oporowy
(przekaźnik nadmiarowy, przegrzewanie oporników), falownik, spalinowy, hamulec dodatkowy lokomotywy; testy.
Pora roku zmienia na razie tylko przyczepność (bez wyglądu drzew i liści).

**A4. Przyczepność**
- Zależna od pogody: sucho, deszcz, śnieg, liście jesienią.
- Za szybkie ruszanie daje poślizg kół, za mocne hamowanie blokuje koła (kara za płaskie miejsca na kołach).
- Piasecznica pod klawiszem; w nowoczesnych EZT automatyczna ochrona przed poślizgiem.

**A5. Napędy według serii**
- Rozruch oporowy (EU07, ET22, EN57 itp.): kolejne pozycje nastawnika, jazda na pozycjach ekonomicznych, bocznikowanie. Za szybkie przejście przez pozycje uruchamia zabezpieczenie. Amperomierz pokazuje prąd silników.
- Falownik (Elfy, ED250): zadawanie siły w procentach, hamowanie elektrodynamiczne.
- Spalinowe (SM42, ST44, SU46): obroty silnika i zwłoka narastania mocy.

**A6. Ocena jazdy**
- Płynność (szarpnięcia), komfort pasażerów, zużycie energii (kWh, z odzyskiem), hamowanie przed sygnałem bez nagłego.
- Podsumowanie z wykresem prędkości wobec ograniczeń.

**Uwaga:** automat (rozkład jazdy, pociąg w menu, testy) musi umieć jeździć z nowym hamulcem i sygnałami. Każdy etap obejmuje poprawki automatu i testy.

---

## B – Scenariusze i kariera

### Dziś

- Jedyny tryb to „Gra jednoosobowa”: wolny wybór trasy, składu, pogody i godziny. Rekordy dla trasy i rodzaju składu.
- Rozkład liczony automatem z zapasem. Symulacja przyjmuje już własny rozkład (przyjazd i odjazd dla każdej stacji).
- Zdarzenia na trasie: tylko losowo „trzymające” semafory i pociąg z przeciwka.
- Zapisy gry, autozapis i ekran końca jazdy już działają.

### Etapy

**Stan B1 + B2 + B5 (14 października 2026): zrobione** – silnik scenariuszy (`js/scenario.js`), samouczek
i 6 scenariuszy (`js/scenarios.js`), radiotelefon (tekst + sygnał wywołania, potwierdzenie Enterem), zdarzenia
losowe w jeździe swobodnej na każdej trasie, testy (`tests/scenario.test.js`). Bez zadania dnia (B5) i bez zdarzeń
wymagających A2–A4 (usterka hamulca, poślizg) i C (auto na przejeździe). Decyzje na dalsze etapy: kariera (B3) –
**wszystko dostępne od początku** (kariera jako ścieżka z ocenami); prawdziwy rozkład (B4) – **pobieranie danych
zewnętrznych** (GTFS przewoźników / PKP PLK, po sprawdzeniu licencji).

**B1. Silnik scenariuszy**

Scenariusz to plik `scenarios/*.js`, później także import jak pliki `.trasa`. Zawiera:

- **Punkt startu:** trasa i odcinek (np. tylko Leszczyny → Katowice), skład, godzina, pogoda, stan początkowy (np. 6 min opóźnienia, start w ruchu).
- **Zdarzenia z wyzwalaczem** (miejsce, czas albo warunek). Możliwe od razu:
  - auto stojące na przejeździe;
  - doraźne ograniczenie prędkości z tablicami w świecie;
  - przedłużony postój (oczekiwanie na przesiadkę);
  - dodatkowy albo pominięty postój;
  - zanik napięcia w sieci (wybieg do stacji);
  - usterka pantografu albo zmniejszona moc;
  - nagłe pogorszenie pogody.
- **Zdarzenia wymagające kierunku A:** jazda na sygnał zastępczy, rozkaz z ograniczeniem, poślizg na liściach, usterka hamulca.
- **Cele i gwiazdki (1–3):**
  - punktualność albo nadrobienie opóźnienia;
  - jazda bez hamowania nagłego;
  - limit energii;
  - dokładność przy W4.
- **Komunikaty dyżurnego** w okienku radiotelefonu z dźwiękiem wywołania.
- **Test:** każdy scenariusz musi dać się ukończyć automatem.

**B2. Samouczek i pierwszy pakiet**
- „Pierwsza jazda”: ruszanie, ograniczenia, czuwak, syrena przed W6, zatrzymanie przy W4. Podpowiedzi czekają na wykonanie czynności.
- 6–8 scenariuszy na 4 wbudowanych trasach, np.:
  - „Poranny szczyt” (EN57, opóźnienie do nadgonienia);
  - „Towarowy w śniegu” (ET22, 600 m);
  - „Mgła nad Wisłą” (Toruń);
  - „Roboty na DTŚ” (Gliwice – Katowice);
  - „Bez prądu”.

**B3. Kariera maszynisty**
- Profil gracza: doświadczenie, oceny, historia przejazdów.
- **Znajomość szlaku:** pierwsza jazda nową trasą to jazda zapoznawcza z instruktorem. Dopiero potem samodzielna, z pełnymi punktami.
- **Uprawnienia na serie** odblokowywane ocenami (np. EN57 → Elf → EU07 z wagonami → ET22 z towarowym → ED250).
- **Dzień pracy (turnus):** 2–4 jazdy pod rząd z jednym zegarem, ze zmianą kabiny na stacji końcowej; ocena za cały dzień.
- Jazda swobodna zostaje bez ograniczeń.

**B4. Prawdziwy rozkład**
- „Pociąg z rozkładu”: numer, prawdziwa godzina odjazdu, postoje (także na żądanie), czasy przejazdu.
- Źródło do zbadania: rozkłady przewoźników w formacie GTFS (np. Koleje Śląskie, Polregio) albo dane PKP PLK. Najpierw sprawdzenie licencji i dostępności.
- Ostrzeżenie, gdy wybrany skład nie zdąży (np. SM42 na rozkładzie Elfa).
- Bez danych – obecny rozkład liczony automatem.

**B5. Zadanie dnia i zdarzenia losowe**
- Zadanie dnia: trasa, skład, pogoda i zdarzenie wylosowane z daty, u wszystkich takie samo. Rekordy lokalnie.
- Zdarzenia losowe jako opcja jazdy swobodnej, na dowolnej trasie, także wygenerowanej.

**B6. Edytor scenariuszy (później)**
- Przy Generatorze tras: zdarzenia i cele wstawiane na schemacie linii.
- Zapis i import pliku `.scenariusz`.

### Menu
- **Kariera:** profil, kolejne zadania, turnusy.
- **Scenariusze:** lista z gwiazdkami, opisem i trudnością.
- **Jazda swobodna:** dzisiejszy tryb, z opcją zdarzeń losowych i pociągu z rozkładu.
- **Ekran końca jazdy:** cele ✓/✗, gwiazdki, postęp kariery.

---

## C – Żywa kolej

### Dziś

- Ruch innych pociągów to dekoracja (`js/3d/life.js`): co 35–95 s jeden losowy pociąg z przeciwka, bez wpływu na rozgrywkę. Wagony na stacjach są nieruchome.
- Semafory zmieniają się na czerwony z powodu niegotowego peronu albo losowego „trzymania”, nigdy z powodu zajętego toru.
- Pociąg gracza jedzie po jednej linii (pozycja = km trasy). Inne tory z mapy służą tylko do wyświetlania; nie ma siatki torów stacyjnych.

### Etapy

**Stan C1 + C2 (14 października 2026): zrobione** – `js/traffic.js` (pociągi tła, blokada liniowa), rysowanie
w `js/3d/life.js`, testy (`tests/traffic.test.js`). Decyzje: gęstość – suwak (domyślnie średni); kara za zatrzymanie
pociągu za graczem – opcja; maszynista i pasażerowie – opcja (do porównania wydajności); limit rysowanych pociągów –
ustawienie (domyślnie 3). Rozkład tła z taktu linii – prawdziwy rozkład po B4. Do zrobienia przy optymalizacjach:
budowa modelu pociągu tła (kilkadziesiąt ms) daje przycięcie, gdy pociąg wjeżdża w zasięg.

**C1. Ruch na linii (logika)**
- Moduł `js/traffic.js` bez grafiki, testowalny w Node. Lista pociągów: przed graczem, za nim i z przeciwka; każdy z rodzajem, składem, rozkładem i uproszczonym ruchem.
- Ruch ułożony wokół rozkładu gracza. Przy punktualnej jeździe nie ma konfliktów. Gdy gracz się spóźnia albo jedzie zbyt szybko:
  - dogania wolniejszy towarowy i dostaje żółte, potem czerwone;
  - przez jego opóźnienie pociąg za nim staje przed semaforem.
- **Blokada liniowa:** semafor odstępowy pokazuje „stój”, gdy odcinek za nim jest zajęty. Losowe „trzymanie” znika.
- Rozkład tła z prawdziwego rozkładu (B4), a bez niego z typowego taktu linii.

**C2. Ruch widoczny w świecie**
- Pociągi z przeciwka jadą według rozkładu tła, nie losowo.
- Pociągi w tym samym kierunku są widoczne: stoją na peronie przed graczem, odjeżdżają, czasem widać koniec składu przed semaforem.
- Na stacjach pociągi stoją na torach bocznych i odjeżdżają, a towarowy czeka na wyprzedzenie.
- Modele tylko w zasięgu ok. 1,5 km, wykorzystywane ponownie. Wymaga D1, bo każdy pociąg to ok. 100–700 siatek.

**C3. Linie jednotorowe – krzyżowanie**
- Pociąg gracza czeka na stacji na pociąg z przeciwka albo wjeżdża na tor boczny z ograniczeniem.
- Wymaga A1 i informacji z generatora o odcinkach jednotorowych.

**Stan C4 (14 października 2026): zrobione** – rozkazy „O” i „S” (Ir-1, uproszczone; „N” – razem z C3), sygnał
zastępczy Sz, usterki semaforów (scenariusze i zdarzenia losowe), rutynowe komunikaty (opcja, domyślnie włączona),
scenariusz „Awaria sterowania”, testy. Decyzje: „O” na stacji, „S” przez radiotelefon; kary jak dotąd (przekroczenie
z rozkazu – jak zwykłe, ruszenie bez potwierdzenia – −20 pkt, minięcie „stój” bez zezwolenia – koniec jazdy).

**C4. Dyżurny ruchu i radiotelefon**
- Komunikaty, np.:
  - „Pociąg 40123, zgoda na odjazd”;
  - „Przed Wami towarowy, semafor na stój”;
  - „Jazda ostrożna, osoby na torach od km 14”.
- Potwierdzenie klawiszem („zrozumiałem”); za brak potwierdzenia kara.
- Rozkazy pisemne na kartce w kabinie, np. ograniczenie na odcinku albo zgoda na minięcie semafora „stój”. Formularze i oznaczenia do sprawdzenia w przepisach.
- Korzysta z silnika zdarzeń B1.

**C5. Pasażerowie i stacje**
- Liczba pasażerów zależna od godziny (szczyt) i wielkości stacji; czas wymiany zależny od tłoku.
- Zapowiedzi na peronach.
- Tablice odjazdów z prawdziwymi pociągami z C1 i opóźnieniami.

**C6. Manewry (największy i najbardziej ryzykowny etap)**
- Odczepienie lokomotywy, objazd składu, doczepienie z drugiej strony; łączenie i rozłączanie EZT.
- Wymaga siatki torów stacji zamiast jednej linii. To głęboka zmiana w generatorze, symulacji i świecie.
- Na sam koniec albo wcale.

---

## Pominięte

- **E – społeczność** (dzielenie się trasami i scenariuszami, tablice wyników online, gra wieloosobowa) – świadomie pomijamy.

---

## Otwarte pytania

### Przed etapem 1 (D)
1. Ile FPS pokazuje licznik w pełnym oknie i na jakim komputerze? Czy gra ma działać na laptopie z grafiką zintegrowaną?
2. Uproszczone drzewa w oddali mogą wyglądać płasko. Czy to akceptowalne, czy tylko lżejsza wersja 3D?
3. D5 (kontrola tras) robić razem z wydajnością czy osobno?

### Przed etapem 2 i 4 (A)
1. Zostawić tryb prosty obok realistycznego?
2. Klawisze zaworu hamulca w trybie realistycznym: `[`/`]` czy `A`/`D` (nagłe – `E`)?
3. Przekroczenie prędkości z sygnału liczyć jak zwykłe przekroczenie, czy surowiej?
4. Rozruch oporowy: pełny, z zadziałaniem zabezpieczenia, czy uproszczony (szarpnięcie i kara)?

### Przed etapem 3 (B)
1. Kariera: blokować tabor i trasy, czy wszystko dostępne od początku?
2. Prawdziwy rozkład: zgoda na pobieranie danych GTFS przez generator, czy rozkład „w stylu” prawdziwego?
3. Scenariusze tylko na 4 wbudowanych trasach, czy od razu zdarzenia losowe na wygenerowanych?
4. Komunikaty dyżurnego: tekst z dźwiękiem wywołania, czy też głos?

### Przed etapem 5 (C)
1. Gęstość ruchu: realistyczna, gęstsza niż w rzeczywistości, czy suwak?
2. Czy opóźnienie gracza, przez które staje pociąg za nim, ma obniżać ocenę?
3. Manewry (C6): na końcu czy wcale?
4. Zapowiedzi: synteza mowy przeglądarki czy tekst na tablicach z gongiem?
5. Pociągi tła: wystarczy wygląd zewnętrzny, czy też maszynista w kabinie i pasażerowie w oknach?
