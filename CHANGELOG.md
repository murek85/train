# Changelog – Maszynista

Historia zmian odtworzona z rozmów o projekcie (10–13 października 2026). Wersje 0.x; numer bieżącej wersji
jest w `package.json` i na ekranie menu. Zmiany sprzed pierwszego commita (12.10) są pogrupowane według dni.
W grze skrót tej listy jest w menu głównym → **Co nowego** (`js/news.js`).

## Niewydane

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
