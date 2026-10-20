# Changelog – Maszynista

Historia zmian odtworzona z rozmów o projekcie (10–13 października 2026). Wersje 0.x; numer bieżącej wersji
jest w `package.json` i na ekranie menu. Zmiany sprzed pierwszego commita (12.10) są pogrupowane według dni.
W grze skrót tej listy jest w menu głównym → **Co nowego** (`js/news.js`).

## 0.54.15 – 20 października 2026

### Poprawka – świat rysowany z kamery cienia albo odbicia (`js/3d/scene.js` gpuInit, draw)
- Zgłoszenie: po zmianie pory roku w pauzie peron „podąża” za ruchem kamery; wcześniej pomniejszona sieć trakcyjna
  z peronem i wózkami, losowe glicze z elementami świata. Złapane na żywo w grze gracza (Orzesze Jaśkowice – Mikołów,
  wiosna): bufory instancji, uniformy obiektów, shadery i potoki zgodne – glicz znikał dopiero po nagraniu paczek
  (BundleGroup) od nowa. Sonda paczek (zasoby nagrane w koderze paczki a bieżące powiązania obiektów) w ustawieniach
  gracza znalazła trzy błędy Three:
  - `Renderer._renderObjectDirect` dopisuje rysowany obiekt do nagrywanej paczki (`_currentRenderBundle`), a zagnieżdżony
    `render()` jej nie zeruje – mapa cieni albo odbicie wody wywołane w czasie nagrywania dokładały do paczki swoje
    obiekty. Każde odtworzenie paczki odświeżało je kamerą cienia / odbicia do wspólnego bufora kamery głównego
    przebiegu: część świata z kamery cienia (miniatura) albo odbicia (obiekt jadący za widokiem). Poprawka:
    `render()` opakowany – zagnieżdżony bez nagrywanej paczki.
  - obiekty rysowania (RenderObject) są wspólne dla kamer w tym samym kontekście (format bufora – np. kaskady cieni);
    pobranie ustawia im kamerę, a odtworzenie paczki odświeża je bez pobrania. Poprawka: przed odtworzeniem paczki jej
    obiekty dostają kamerę tej paczki.
  - obiekt paczki bez gotowego potoku (kompilacja w tle) nie trafia do nagrania i brakowało go do następnej zmiany
    paczki. Poprawka: paczka nagrywana od nowa, gdy potoki jej pominiętych obiektów są gotowe (najdalej po ok. 10 s).
- Po poprawce sonda: 0 obcych obiektów w paczkach; niezgodność zasobów tylko w jednej klatce przy zamknięciu okienka
  (stary, poprawny potok przed ponownym nagraniem).

### Poprawka – znikające na stałe obiekty po błędzie karty (`js/3d/scene.js` gpuInit)
- Three otwiera zakres błędów karty przy asynchronicznym tworzeniu potoku i zamyka go po jego gotowości; błąd wysłania
  klatki w tym czasie („Destroyed texture ShadowDepthTexture used in a submit” – zmiana rozmiaru map cieni przy
  doborze jakości na starcie) trafiał do zakresu potoku i Three uznawał poprawny potok za błędny – obiektów z nim nie
  rysował już nigdy. `queue.submit` i `GPUCommandEncoder.finish` we własnych zakresach błędów (błąd zgłaszany
  w konsoli jako „WebGPU: …”).

## 0.54.14 – 20 października 2026

### Poprawka – paczki po zmianie jakości i po kompilacji (`js/3d/scene.js`)
- Zgłoszenie: zniekształcone cienie („miniatura” sieci trakcyjnej, peronu i wózków na ziemi) po zmianie warunków w pauzie
  (pora roku albo pogoda) i ruchu kamery. Śledzenie w świeżym profilu: automatyczny dobór jakości zmienia rozmiar map
  cieni – ShadowNode niszczy tekstury głębi i tworzy nowe; raz błąd walidacji „Destroyed texture ShadowDepthTexture used
  in a submit”. Paczki (BundleGroup) trzymają nagrane polecenia z powiązaniami z chwili nagrania – po takiej zmianie
  (i po kompilacji, w której paczki są na chwilę zwykłymi grupami) mogły rysować z nieaktualną albo zniszczoną mapą.
- `rebundle(n)`: wszystkie paczki nagrywane od nowa przez n klatek – po zmianie jakości (6 klatek, także wszystkie
  kaskady cieni od nowa) i po każdej kompilacji (`precompile`, 3 klatki – start, wczytywanie jazdy, zmiany w menu
  i w pauzie).
- Samego zniekształcenia według przepisu nie udało się odtworzyć skryptem (WebGPU, trasy Gliwice – Zabrze i Orzesze
  Jaśkowice – Mikołów, zmiana pogody i pory roku, obrót oddalonej kamery).

## 0.54.13 – 20 października 2026

### Poprawka – przesunięte i pomniejszone cienie w WebGPU (`js/3d/scene.js` aimSun)
- Zgłoszenie: na ziemi „pomniejszona sieć trakcyjna z peronem i podwoziem pociągu” (Orzesze Jaśkowice – Mikołów, kamera
  oddalona), wcześniej losowe glicze. Po stronie procesora w tym miejscu tylko droga i ziemia – rysunek pochodził
  z cieni: dalsze kaskady odświeżają mapę co 2–4 klatki, ale ich światło (położenie, cel, zasięg) przesuwało się co
  klatkę, a w WebGPU macierz cienia liczona jest co klatkę z bieżącego położenia (nodes.js setupCascades, ShadowNode –
  `shadow.matrix`). Mapa z poprzedniego położenia i zasięgu próbkowana nową macierzą – cienie przesunięte i pomniejszone
  (przy zmianie zasięgu kaskady, np. po oddaleniu kamery). W WebGL macierz zmieniała się tylko przy rysowaniu mapy.
- Teraz kaskada bez odświeżenia w danej klatce zostaje tam, gdzie była przy rysowaniu swojej mapy.
- `?nobundle` w adresie – świat bez paczek WebGPU (porównania przy błędach obrazu; World.opt.bundle).

## 0.54.12 – 20 października 2026

### Poprawka – przezroczyste obiekty w WebGPU (`js/3d/scene.js`)
- Znacznik drogi hamowania (tablica H4 i pasek na torze) i inne obiekty przezroczyste bez zapisu głębi nie były
  widoczne w trybie WebGPU. Przyczyna: paczki (BundleGroup – statyczny świat, world.js bundleStatic) WebGPUBackend
  wykonuje dopiero na końcu przebiegu (`finishRender` → `executeBundles`), po wszystkich zwykłych rysowaniach – ziemia,
  tory i perony z paczek zamalowywały wcześniej narysowane obiekty przezroczyste (bez głębi w buforze nic ich nie
  chroniło). Teraz `addBundle` wykonuje paczkę od razu (Three rysuje paczki przed obiektami nieprzezroczystymi
  i przezroczystymi), po niej podręczny stan przebiegu od nowa (executeBundles zeruje potok i powiązania).
- Diagnoza: obiekt rysowany w każdej klatce, z gotowym potokiem i aktualnymi uniformami, a niewidoczny; nowy
  nieprzezroczysty obiekt w tym samym miejscu widoczny, przezroczysty – nie; przy paczkach wyłączonych – widoczny.

## 0.54.11 – 20 października 2026

### Ekran wczytywania trasy (`js/screens.js`, `js/main.js`, `js/3d/scene.js`)
- Etap z main.js (`loading().status(tekst)` zamiast stałych etapów wg postępu): „Przygotowanie trasy i składu…”,
  „Budowa świata… N z M kawałków” (8–85%), „Kompilacja shaderów… N z M” (obiekty sceny, 85–92%), „Kompilacja odbić
  w wodzie… N z M” (92–97%), „Kompilacja potoków karty graficznej… N z M” (97–99%), „Rozgrzewanie karty
  graficznej…” (99%), „Gotowe”. Wcześniej przez całą kompilację (ok. 20 s) pasek stał na 90% z napisem
  „Wjazd na peron…”. WebGL – bez liczników (90%).
- `compileInfo()`: przebieg (`pass`: scena, odbicie, rozgrzanie) i liczniki obiektów osobno dla przebiegu.
- `precompile`: przed rozgrzaniem jedna klatka z etapem „rozgrzanie” (etykieta widoczna podczas synchronicznego
  rysowania).
- Tło ekranów (tło z workera): zapas – gradient CSS w kolorach sceny wg pory, zanim worker narysuje pierwszą klatkę
  (zgłoszone czarne tło na początku wczytywania).

## 0.54.10 – 20 października 2026

### Zmiana jakości grafiki (`js/main.js`, `js/3d/scene.js`)
- Ustawienia → Grafika → Jakość: okienko przeładowania („Zmiana jakości · ustawienia grafiki”) – w menu jak przy
  zmianie składu, z budową świata bez rysowania i kompilacją widocznych obiektów z licznikami (`menuBusy(…, settle)`;
  wstrzymanie rysowania już przed zmianą); w pauzie jak przy zmianie warunków (`pauseBusy` – przebudowa świata, pełna
  kompilacja). Wcześniej bez okienka: obraz stawał (jakość niska – ok. 26 s z klatką 12 s, wysoka – po zamknięciu
  ok. 7 s zawieszenia).
- Pauza: kompilacja w okienku z licznikami (`compileCounted` – wspólne dla menu i pauzy; też zmiana pogody i pory roku).
- WebGPU: `setQuality` bez oznaczania wszystkich materiałów do przebudowy (tone mapping wkompilowany w shadery dotyczy
  WebGL; w WebGPU zmiana efektów zmienia bufor docelowy, nowe shadery powstają same).
- Pomiar (`menuops.js`, profil tymczasowy; liczby zaszumione – gra w drugim oknie): jakość wysoka ok. 14–16 s, niska
  ok. 16–25 s, w pauzie ok. 21 s; zostaje w okienku pojedyncza klatka kilku sekund (budowa przebudowanego świata).
- `menuops.js`: zmiany jakości, `MENU_PROF=jakosc`, etap okienka przy klatkach ponad 1 s.

## 0.54.9 – 20 października 2026

Okienko wyboru trasy w menu (WebGPU). Pomiar `tools/render-check/menuops.js` (profil tymczasowy): inna trasa 60,8 s →
ok. 24–28 s (najdłuższa klatka 28,2 → ok. 5 s), powrót do trasy 44,0 → ok. 7,5–10,7 s (16,5 → ok. 3–5 s); zmiana
składu i pogody bez zmian w kodzie (ok. 2 s).

### Przyczyna
- Rysowanie podglądu w trakcie budowy świata nowej trasy (nowe materiały): brakujące shadery budowane w zwykłych
  klatkach (ok. 12 s) i potoki tworzone synchronicznie, jeden po drugim (ok. 38 s czekania na kartę), odbicie w wodzie
  ok. 5 s – okienko stało po kilkanaście sekund.

### Zmiany (`js/main.js` selectRoute, menuSettle)
- Świat nowej trasy buduje się bez rysowania sceny (`renderer.hold`), potem kompilacja tego, co widzi kamera podglądu
  (`precompile({ all: false, reflect: false, hidden: false, warm: false })` – potoki równolegle), z licznikami w okienku:
  „Kompilacja shaderów… (N z M)”, „Kompilacja potoków karty graficznej… (N z M)”. Reszta (obiekty ukryte, poza kadrem,
  odbicie) – przed jazdą na ekranie wczytywania.
- Najpierw koniec kompilacji w tle (po starcie menu): dwie naraz przy budowie nowego świata przeliczały bufory odbicia
  w wodzie (compileAsync wywołuje updateBefore obiektów) – zniszczona tekstura 640×360 w poleceniach karty (błąd
  walidacji WebGPU). Okienko pokazuje wtedy „Kończenie przygotowania shaderów…”.
- Zmiana składu i warunków – bez tego (świat podglądu buduje się od nowa i pełna kompilacja kilkuset shaderów trwała
  ok. 20 s zamiast ok. 2–5 s).
- `precompile`: opcja `hidden` (także obiekty ukryte, domyślnie tak).

### Narzędzia
- `menuops.js`: profil przeglądarki tymczasowy (wybory menu nie zostają w profilu skryptów), zmiana składu, klatki po
  zamknięciu okienka, `MENU_PROF=tabor` / `pogoda`, licznik budów shaderów w profilu.

## 0.54.8 – 20 października 2026

### Ekran startowy (`index.html`, `js/screens.js`, `js/main.js`, `style.css`)
- Pod paskiem postępu etap wczytywania (`.scr-step`): „Wczytywanie plików gry…” (do wczytania main.js), „Uruchamianie
  karty graficznej (WebGPU)…”, „Wczytywanie tras…”, „Budowa świata podglądu… N z M” (kawałki świata w menu),
  „Kompilacja shaderów… N z M” (obiekty sceny przejrzane przez compileAsync – `onProgress`), „Kompilacja potoków karty
  graficznej… N z M” (potoki, na które czekamy – licznik w `asyncPipelines`; `renderer.compileInfo()`), „Gotowe”.
  main.js podaje etap funkcją `status()` w `boot()`, ekran odczytuje ją co klatkę (requestAnimationFrame) i co
  ok. 120 ms. Po gotowości napis gaśnie, w jego miejscu zachęta – bez przesunięcia układu.
- Kompilacja (`precompile`, WebGPU) co ok. 40 ms czeka na klatkę przeglądarki: `compileAsync` Three oddaje sterowanie
  przez `scheduler.yield`, którego kontynuacje mają pierwszeństwo – przez całą kompilację nie było żadnej klatki
  (etap stał, zadania z `setTimeout` czekały). Na ten czas `scheduler.yield` podmieniony (requestAnimationFrame,
  najwyżej 100 ms – karta w tle); czas kompilacji bez zmian (ok. 11–12 s przed menu).
- Napis zmienia się tylko, gdy wątek główny ma chwilę (przy długich krokach budowy stoi – pasek i tło idą dalej).

## 0.54.7 – 20 października 2026

Dwie przerwy przy starcie w trybie WebGPU, które zostały po 0.54.6. Nowe narzędzie
`tools/render-check/bootprof.js`: profil procesora najdłuższych zawieszeń (albo całej kompilacji – `BP_COMPILE=1`)
i licznik potoków karty: synchronicznych (`createRenderPipeline`, z materiałem i miejscem wywołania)
i asynchronicznych.

### Start karty – przerwa ok. 2,7 s (`js/3d/scene.js` asyncPipelines, `js/3d/nodes.js`)
- Przyczyna: pierwsza klatka po starcie karty (jeszcze bez rysowania sceny) liczy LUT-y atmosfery, niebo, chmury,
  mgłę i PMREM otoczenia – 11 potoków tworzonych synchronicznie. Synchroniczny potok kompiluje się w procesie karty
  i wstrzymuje go całego, więc stało też tło ekranu startowego w workerze.
- Teraz na starcie (do dwóch pełnych klatek bez nowych potoków) brakujące potoki powstają asynchronicznie, a Three
  pomija obiekt, dopóki jego potok nie jest gotowy. Jednorazowe rysowania (LUT przepuszczalności, PMREM otoczenia)
  powtarzają się, gdy potoki są gotowe. Nie dotyczy paczek (BundleGroup) – pominięty obiekt zostałby w nagranej
  paczce na stałe.

### Koniec kompilacji – przerwa ok. 3,7 s (`js/3d/scene.js` precompile)
- Przyczyna: `compileAsync` Three pomija paczki (BundleGroup – statyczne części świata, world.js bundleStatic), więc
  pierwsza pełna klatka po kompilacji budowała ok. 100 shaderów i potoków synchronicznie (ok. 3 s samej budowy
  węzłów w wątku głównym).
- Na czas kompilacji paczki są zwykłymi grupami – ich obiekty kompilują się razem z resztą (ten sam stan shadera
  przy późniejszym rysowaniu w paczce). Dotyczy też kompilacji przed jazdą.
- Kompilacja przed menu trwa przez to dłużej (budowa shaderów z oddawaniem sterowania, ok. 11 s zamiast ok. 4,5 s
  + 4 s zawieszenia).
- Poprawka: obiekt skompilowany poza paczką miał przy rysowaniu w paczce stan z kompilacji – na niektórych trasach część
  świata w złym miejscu (wiszący kawałek peronu, Toruń – Chełmża). Obiekty utworzone przy kompilacji dostają przy
  pierwszym rysowaniu w paczce pełne odświeżenie (geometria, uniformy obiektu, powiązania). `?nobc` w adresie – paczki
  bez kompilacji (porównania).

### Pomiar (`bootframes.js`, WebGPU)
- Przed: tło w workerze – najdłuższa klatka 2,6–2,9 s; wątek główny – 2 klatki ponad 500 ms (2,4–2,9 s po starcie
  karty i 3,8–4,0 s na końcu kompilacji); menu po 16,7–19,7 s (przerwa bywała już po oznaczeniu gotowości).
- Po: tło w workerze – najdłuższa klatka ok. 0,42 s; wątek główny – żadnej klatki ponad 500 ms (najdłuższa
  0,25–0,35 s); menu po 22,4–24,6 s.
- `bootframes.js` oznacza też koniec budowy shaderów kompilacji (`shadery gotowe`).
- `loadtime.js`, nowy profil (trasa domyślna Gliwice – Zabrze), 2 przebiegi: przed – menu po 49–53 s, w jeździe
  pierwsza klatka po ekranie wczytywania 19,6–23,5 s (paczki budowane synchronicznie) i rozgrzanie 3,3 s, koniec
  wczytywania po 33,5–39,2 s; po – menu po 19,6–22,6 s, najdłuższa klatka wczytywania jazdy 0,34 s (poza 1,9–2,3 s
  na samym początku, jak dotąd), koniec po 30,3–32,4 s.

## 0.54.6 – 19 października 2026

Płynność ekranu startowego i ekranu wczytywania. Pomiar `tools/render-check/bootframes.js` (WebGPU): wątek główny
przy starcie ok. 470 klatek w 20 s, w tym przerwy 4,5 s (koniec kompilacji), 2,7 s (start karty) i dziesiątki po
150 ms (budowa shaderów) – tło ekranu startowego stawało razem z nim.

### Ekrany (`js/screens.js`, `js/rail-scene.js` – nowy)
- Tło (jazda po torze, rysunek 2D) rysuje Web Worker na OffscreenCanvas – własna pętla klatek, niezależna od wątku
  głównego (ok. 1950 klatek w tym samym czasie, 10 ponad 50 ms). `rail-scene.js` – ten sam plik na stronie (zapas bez
  OffscreenCanvas – rysowanie w wątku głównym jak dawniej) i jako skrypt workera. Ekran wczytywania przekazuje
  workerowi prędkość jazdy (pociąg zwalnia z postępem), logika etapów i zamykania – w wątku głównym.
- Zostaje jedna przerwa ok. 2,7 s tuż po starcie karty WebGPU – stoi wtedy proces karty (także worker).

### Start gry (`js/main.js`)
- Kompilacja przed menu bez rozgrzania (rysowanie wszystkich obiektów, także spoza kadru). Przerwa wątku głównego na
  końcu kompilacji zmalała tylko z ok. 4,5 do 3,7 s – jej główna przyczyna jest gdzie indziej (do zbadania); tła już
  nie zatrzymuje.

## 0.54.5 – 19 października 2026

### Poprawki – WebGPU, wspólne shadery instancji (`js/3d/scene.js` shareInstancing, od 0.54.1)
- Na niektórych trasach (np. Orzesze Jaśkowice – Mikołów) części świata rysowały się w złym miejscu – wiszący
  w powietrzu peron, rozciągnięte cysterny, krzywa sieć trakcyjna. Podmiana buforów instancji na bufory obiektu
  obejmowała tylko kolumny macierzy (vec4); inne widoki na bufor macierzy – pozycja instancji do kołysania roślin
  (`nodes.js` instanceOrigin, vec3 z przesunięciem 12) – zostawały przy buforze obiektu, dla którego zbudowano
  shader (cudze dane, przy większej liczbie egzemplarzy – odczyt poza buforem). Teraz podmieniany każdy widok
  (stride 16) na bufor danego obiektu.
- Bufory obiektu w `WeakMap`, nie w `userData` (klonowanie obiektu kopiuje `userData` przez JSON).
- `?noshare` w adresie – bez wspólnych shaderów instancji (porównania).

### Narzędzia (`tools/render-check`)
- `stutter.js` – także błędy konsoli; `yardview.js` – widok na bocznice i sieć z kamery swobodnej.

## 0.54.4 – 19 października 2026

### Poprawki
- WebGL: wczytywanie jazdy stawało na 90% (od 0.54.3) – `precompile` sięgał do `_renderContexts`, którego
  `WebGLRenderer` nie ma (wyjątek przed końcem kompilacji); teraz tylko w WebGPU.
- WebGPU: nocą czerwono-pomarańczowa poświata na drzewach i horyzoncie w oddali. Mgła brała kolor z atmosfery (nocą
  prawie czarnej) i łuny miasta ×1,15 – teraz jak mgła WebGL: łuna ×0,6 i ciemne, chłodne tło z palety nieba
  w pełnej nocy (`fogNight`, `sky-gpu.js`); o zmierzchu bez zmian (atmosfera). Kopuła nieba bez zmian.

### Narzędzia (`tools/render-check`)
- `shot.js`: start dopiero po gotowym menu (kompilacja na ekranie startowym), czekanie na koniec wczytywania i ruszenie
  symulacji (ekran wczytywania pojawia się dopiero po chwili – zrzuty łapały go zamiast jazdy).
- `nightview.js`: widok na oddal z kamery swobodnej.

## 0.54.3 – 19 października 2026

Przycięcia w czasie jazdy (WebGPU). Pomiar `tools/render-check/stutter.js` (Gliwice – Zabrze, 4 min jazdy automatem,
ok. 3,5 km): najdłuższa klatka 17 s → 0,45 s, klatek ponad 100 ms 14 → 6, mediana 19 → 15 ms.

### Wątki – stan
- W osobnych wątkach (Web Worker): generator tras (`gen-worker.js`) i głos Piper (`tts-worker.js`). Reszta – budowa
  kawałków świata, modele pociągów, rozkład jazdy, budowa shaderów – w wątku głównym; świat budowany porcjami
  w limicie czasu na klatkę (3 / 8 / 40 ms), kompilacja potoków WebGPU w procesie karty (równolegle, 0.54.1).

### Przyczyna największego przycięcia
- Odbicie w wodzie (`reflector`) rysuje scenę do własnego bufora, w zagnieżdżonym rysowaniu (inny kontekst w kluczu
  shadera) – przy pierwszym akwenie w kadrze ok. 100 shaderów (3,5 s JS) i 80 potoków w jednej klatce, potem
  kilkanaście sekund czekania na kartę.

### Zmiany (`js/3d/scene.js`, `main.js`)
- `precompile`: także dla bufora odbicia z kamerą odbitą i kontekstem poziomu 1 (jak przy rysowaniu odbicia), oraz dla
  obiektów poza kadrem (bez tego obrót kamery budował nowe shadery). Opcje `all`, `reflect`, `warm`.
- Ekran startowy: kompilacja tylko tego, co w kadrze (start do menu ok. 22 s → ok. 20 s), reszta w tle po otwarciu menu.
- Zbieranie obietnic potoków odporne na kilka kompilacji naraz (dokompilowanie w tle i start jazdy).

### Zostaje
- Kroki budowy świata do ok. 130 ms (drogi i teren tras rzeczywistych, `real-env.js`) – w wątku głównym.
- Shadery cieni obiektów wchodzących w kaskady (ok. 40 małych w 4 min) – kompilacja przebiegu cieni wymagałaby
  wewnętrznego materiału `ShadowNode`.

## 0.54.2 – 19 października 2026

### Pauza – zmiana warunków (`js/main.js`)
- Zmiana pogody i pory roku w pauzie („Warunki na trasie”) pokazuje okienko przeładowania jak w menu („Zmiana warunków ·
  komunikat meteo”), nad pauzą i blokujące ją do końca: najpierw okienko, potem zmiana; przy porze roku – postęp
  przebudowy świata (kawałki), na końcu kompilacja shaderów nowych efektów (`precompile`; w WebGPU bez rysowania
  sceny do jej końca). Kolejna zmiana przerywa poprzednią (`pauseBusy`). Pora dnia – bez okienka (zmiana od razu).

## 0.54.1 – 19 października 2026

Krótsze wczytywanie w trybie WebGPU. Pomiar (Gliwice – Zabrze, RX 6800 XT, Electron): start gry do menu 64 s → ok. 22 s,
„Start” do jazdy 77 s → ok. 17–27 s (WebGL: 14 s i 4 s).

### Przyczyny (`tools/render-check/loadtime.js`, `loadprof.js`, `builds.js`)
- Three buduje shader osobno dla każdego `InstancedMesh` (uuid obiektu w kluczu), a do 1024 egzemplarzy macierze idą
  w buforze `array<mat4, N>` – inny kod WGSL dla każdej liczby egzemplarzy: przy wejściu do jazdy ok. 810 budów
  w JS (19 s) i 955 programów wierzchołków do skompilowania przez kartę.
- Podczas wczytywania scena rysowała się co klatkę – brakujące potoki powstawały synchronicznie, jeden po drugim
  (pojedyncze klatki po 25–30 s), a `compileAsync` (Three 0.186) czeka na każdy potok osobno.

### Zmiany (`js/3d/scene.js`, `main.js`)
- `shareInstancing`: macierze egzemplarzy zawsze jako atrybuty (kod niezależny od liczby), klucz shadera bez uuid
  (z rozróżnieniem koloru egzemplarzy), bufory instancji podmieniane na bufory obiektu (wersja jak `instanceMatrix`).
  Budowy: 810 → 150, programy wierzchołków: 955 → 110.
- `renderer.hold`: na ekranie startowym i ekranie wczytywania w WebGPU świat się buduje, ale scena nie rysuje, dopóki
  `precompile` nie skompiluje potoków; ekran startowy czeka na kompilację. Chmury rysują się także wtedy (ich bufory
  muszą powstać przed kompilacją materiałów – inaczej błąd „Destroyed texture”).
- `precompile`: obietnice potoków zbierane poza pętlą `compileAsync` – wszystkie potoki kompilują się naraz.
- Bez zmian: pamięć podręczna potoków Dawn nie skraca kolejnych uruchomień, choć kod WGSL jest powtarzalny
  (`wgsldump.js`) – reszta czasu to kompilacja ok. 110–170 dużych potoków (średnio ok. 35 KB WGSL) przez kartę.

## 0.54.0 – 19 października 2026

WebGPU domyślnym rendererem (etap 6); WebGL zostaje jako tryb zgodności.

### Wybór renderera (`js/3d/common.js`, `scene.js`, `main.js`, `index.html`)
- Ustawienia → Grafika → Renderer: *automatycznie* (domyślnie – WebGPU, gdy przeglądarka ma `navigator.gpu`), *WebGPU*,
  *WebGL* (zgodność ze starszymi kartami); zmiana po ponownym uruchomieniu (przycisk „Uruchom ponownie”), pod spodem
  bieżący renderer i karta. `localStorage['maszynista.renderer']`: `auto`, `webgpu`, `webgl` (i testowy `webgpu-gl`).
- Zapas: gdy WebGPU w trybie automatycznym nie wystartuje – Three przeszedł na zaplecze WebGL 2 (brak karty WebGPU),
  błąd `init()` albo utrata urządzenia – `gpuFallback` zapisuje `maszynista.gpuFail` i przeładowuje grę na WebGL
  (ustawienia mówią dlaczego; wybór WebGPU kasuje wpis). Przy WebGPU wybranym ręcznie – tylko wpis w konsoli.
- `?webgpu=0` w adresie – WebGL; `?webgpu`, `?webgpu=gl` jak dotąd.
- Opcja wygładzania krawędzi: w WebGPU z efektami to FXAA (opis w ustawieniach).

### Aplikacja desktopowa (`electron/main.js`)
- `force_high_performance_gpu` – na laptopach z dwiema kartami wydajniejsza (WebGPU w Chromium nie zawsze słucha
  `powerPreference`).
- Samosprawdzenie: `MASZYNISTA_RENDERER=webgl|webgpu|gl`, raport podaje renderer i kartę. Sprawdzone: WebGPU, WebGL,
  zaplecze WebGL 2 i zapas (`--disable-gpu` → przeładowanie na WebGL) bez błędów.

### Poprawki
- Chmury WebGPU na zapleczu WebGL 2: `select` zagnieżdżony w gałęzi `select` psuł budowę GLSL (błąd TSL `addToStack`,
  chmury z pustym materiałem) – waga historii akumulacji jako zmienna.

### Wydajność
- WebGPU nadal bardziej obciąża procesor niż WebGL (ok. 15–18 ms na klatkę przy pogodzie, ok. 21 ms w deszczu, wobec
  8–11 ms) – na słabszych procesorach lepszy tryb WebGL.

## 0.53.0 – 19 października 2026

Opady w trybie WebGPU (etap 5) – tryb WebGPU ma już wszystkie efekty trybu WebGL.

### Opady – WebGPU (`js/3d/weather-gpu.js`, nowy; `weather.js`)
- Odpowiedniki shaderów GLSL opadów w TSL, z tymi samymi uniformami (`Weather.update` bez zmian): deszcz – odcinki
  (dwa wierzchołki na kroplę, smuga pochylona z wiatrem), śnieg z wirowaniem płatków, liście (obracany owal w jesiennych
  kolorach), rozbryzgi na ziemi, śnieg wzbijany przez pociąg (pozycje z procesora – te same tablice); bez opadu
  w wagonach najbliżej kamery.
- Punkty większe niż piksel (śnieg, liście, rozbryzgi, śnieg spod pociągu): WebGPU nie ma rozmiaru punktu – instancje
  kwadratu (`Sprite.count` + `PointsNodeMaterial`, atrybuty cząstek jako `InstancedBufferAttribute` na tych samych
  tablicach). Najmniejszy płatek 2 px, mały – prawie pełny kwadrat (punkt GLSL 1,2 px rysuje się jak ostry piksel,
  kwadrat z miękkim krążkiem tej wielkości był niewidoczny).
- Wydajność w deszczu (Gliwice – Zabrze, jakość średnia): procesor ok. 21 ms na klatkę (WebGL ok. 11 ms).
- `tools/render-check/perfweather.js` – czas klatki przy wybranej pogodzie.

## 0.52.0 – 19 października 2026

Chmury wolumetryczne w trybie WebGPU (etap 4) – z projektu Lot nad Polską.

### Chmury – WebGPU (`js/3d/clouds-gpu.js`, nowy)
- Chmury z lot (`lot/src/clouds/clouds.js`, `noise3d.js`; przepis z „Horizon Zero Dawn”): warstwa cumulusów między
  dwiema sferami nad Ziemią, gęstość z mapy pogody i szumów 3D (kształt Perlin–Worley 64³, detal Worley 32³, liczone raz
  na procesorze), marsz promienia do 110 kroków (krok rośnie z odległością), 5 próbek ku słońcu, trzy oktawy
  rozpraszania wielokrotnego i „powder”, światło nieba, mgiełka atmosfery przed chmurą; połowa rozdzielczości, drganie
  kroku i akumulacja czasowa (reprojekcja z poprzedniej klatki), wygładzenie namiotem 4 × 4.
- Bez głębi sceny: chmury (od 1–1,5 km) zawsze są za geometrią train (świat do 2,6 km) – składane w kopule nieba
  (niebo × przepuszczalność + światło chmur), więc działają też bez efektów po renderowaniu (jakość niska).
- Pogoda → warstwa: zasięg = zachmurzenie; w opadzie niższa podstawa (1000 m), grubsza (2200 m) i gęstsza warstwa,
  w burzy wypiętrzona (do 3900 m); błyskawica rozświetla chmury. Nocą chmury oświetla księżyc (natężenie wg fazy).
- Cień chmur na ziemi z tych samych chmur (zamiast szumu): tekstura 256² wokół kamery (6 km, co 4 klatki, środek
  przesuwany skokowo), w kolorze światła słońca – w materiałach tylko próbka.
- Atmosfera (`sky-gpu.js`): dodane `sunLight`, `aerial` (perspektywa powietrzna – marsz po atmosferze) i światło
  księżyca dla chmur; mgła i odbicia biorą zachmurzenie jako barwę horyzontu z szarością pogody (nie widzą kopuły).
- Wydajność: procesor ok. 18 ms na klatkę (+1 ms), karta ok. 3 ms (Gliwice – Zabrze, jakość średnia).
- Znane ograniczenia: w odbiciu na wodzie chmury z kopuły są w złym miejscu (bufor chmur liczony dla kamery gracza);
  w odbiciach materiałów (mapa otoczenia) chmur nie ma.

## 0.51.0 – 19 października 2026

Niebo i atmosfera w trybie WebGPU (etap 3): fizyczna atmosfera z projektu Lot nad Polską.

### Niebo – WebGPU (`js/3d/sky-gpu.js`, nowy)
- Atmosfera z lot (`lot/src/atmosphere/gpu.js`, `model.js`; Hillaire 2020) bez zmian w obliczeniach: tablice
  przepuszczalności i rozpraszania wielokrotnego (przeliczane przy zmianie zamglenia), widok nieba dla słońca i księżyca,
  natężenie światła nieba; uniformy w grupie `renderGroup`.
- Kopuła nieba zamiast `sky.js`: radiancja atmosfery (`skyK` 0,55 – do jasności sceny train), tarcza słońca, niebo
  nocne z lot – gwiazdy w dwóch warstwach (jak punkt jednego piksela, migotanie przy horyzoncie), Droga Mleczna
  z pyłami, księżyc z fazą i morzami (`nightK` 2,5); sfera niebieska obracana wg czasu gwiazdowego (szerokość ok.
  50,3° N, dzień roku wg pory roku). Zamglenie z pogody → aerozole atmosfery (`haze` 6–40). Do czasu chmur (etap 4)
  zachmurzenie od średniego przechodzi w barwę horyzontu z szarością pogody, nocą łuna miasta nad horyzontem.
- Mgła (`scene.fogNode`): kolor nieba tuż nad horyzontem w kierunku punktu (ku słońcu jaśniejsza i cieplejsza – bez szwu
  z niebem), z zamgleniem pogody; kolory horyzontu wg azymutu liczone raz na klatkę do paska 128 × 1 – w materiałach
  tylko próbka tekstury (uniformy atmosfery w każdym shaderze kosztowały ok. 6 ms procesora na klatkę). Pierścienie
  horyzontu w tym samym kolorze.
- Odbicia nieba (`createEnvironment`): kolor nieba z atmosfery zamiast gradientu z palety.
- Światła (słońce, półkula, ekspozycja) nadal z palety train. Zmierzch i świt fizyczne: ciemnoniebieski zenit i ciepła
  łuna przy słońcu (w WebGL – stylizowana pomarańcz całego nieba).
- `tools/render-check`: `view.js` (widok kamery i pogoda dla zrzutu), `lum.js` – jasność pasa wierszy.

## 0.50.0 – 19 października 2026

Efekty po renderowaniu w trybie WebGPU (etap 2): okluzja, bloom, promienie słońca, mgła wysokościowa, ACES i gradacja.

### Efekty po renderowaniu – WebGPU (`js/3d/post-gpu.js`, nowy)
- Odpowiednik `post.js` w TSL z tymi samymi przebiegami, wzorami i ustawieniami (`render(scene, camera, settings)`):
  scena do bufora HDR z teksturą głębi; okluzja z głębi w połowie rozdzielczości (16 próbek) z rozmyciem wg głębi;
  bloom (jasne → 5 poziomów w dół i w górę z dodawaniem); promienie słońca (maska nieba wokół słońca, rozmycie
  promieniste 40 próbek); wykończenie – okluzja, mgła wysokościowa, promienie, bloom, ekspozycja, ACES (dopasowanie
  Hilla), nasycenie i odcień cieni / świateł, sRGB, kontrast, winieta, szum. Przebiegi `QuadMesh` + `NodeMaterial`.
- Wygładzanie: FXAA (`addons/tsl/display/FXAANode.js` – dołączony do paczki i wersji przeglądarkowej) zamiast MSAA –
  WebGPU nie scala głębi wielu próbek, a z głębi biorą okluzja, mgła i promienie.
- Renderer z efektami: bez własnego tone mappingu i konwersji barw (`outputColorSpace` liniowa – płótno bez bufora
  pośredniego), wykończenie zapisuje gotowe sRGB; bez efektów (jakość niska) – ACES i sRGB renderera jak dotąd.
- Paczki kawałków (`BundleGroup`) przy rysowaniu do bufora odtwarzały się bez odświeżenia wspólnych uniformów
  (obraz z nieaktualnej kamery): co najmniej odświeżenie współdzielone (`scene.js`, nakładka na `needsRefresh`).
- Zgodność z WebGL: jakość średnia – średnia różnica pikseli 5,7/255 (krawędzie – FXAA zamiast MSAA, obraz ok. 3/255
  ciemniejszy), wysoka – 3,1/255. Wydajność (procesor, Gliwice – Zabrze): średnia ok. 15 ms, wysoka ok. 18 ms na klatkę
  (WebGL ok. 8 i 11 ms).
- `tools/render-check/shot.js`: `SHOT_LS` – `localStorage` przed startem gry; czekanie na pełną przebudowę świata po
  zmianie jakości do 300 s.

## 0.49.1 – 19 października 2026

Tryb WebGPU szybszy: procesor ok. 15 ms na klatkę zamiast 34 ms (Gliwice – Zabrze, jakość średnia; WebGL ok. 8 ms).

### WebGPU – wydajność (`nodes.js`, `world.js`, `scene.js`)
- Materiały: węzły (`normalNode`, `emissiveNode`, `roughnessNode`, `metalnessNode`, powłoka) podstawiane tylko na czas
  budowy shadera (`Patched.build`, `setupObserver`). Materiał z węzłem we właściwości WebGPURenderer odświeżał co klatkę
  w całości (`NodeMaterialObserver.hasNode` – wszystkie uniformy obiektu) – każdy obiekt w każdej klatce.
- Kawałki świata: nieruchome siatki w paczce (`BundleGroup`, `World.bundleStatic`) – polecenia rysowania nagrane raz,
  bez przeglądania sceny i przygotowania obiektu co klatkę; bez odcinania pojedynczych brył (paczka nagrywa widoczne
  w chwili nagrania; karta ma zapas – ok. 4 ms); nowe nagranie przy zmianie poziomów szczegółów i cieni (`updateLod`);
  poddrzewo bez przeliczania macierzy (`matrixWorldAutoUpdate`). Poza paczką: to, czego dotyka dyn, siatki lamp, woda.
- Cień nieruchomych brył kawałka jedną scaloną bryłą (`World.shadowMerge`, jak cień składu): w mapach cieni WebGPURenderer
  odświeża każdy obiekt w całości (materiał cienia ma `colorNode`) – pełne odświeżenia w cieniach 355 → 189 na klatkę.
- `World.opt` (localStorage `maszynista.perfOpt`): `bundle`, `shadowMerge` – wyłączenie do porównań.
- Zgodność z WebGL bez zmian (jakość niska, w dzień i w nocy średnia różnica pikseli 1,8–1,9/255, ta sama jasność).
- `tools/render-check`: `draws.js` (wywołania wg kategorii), `updates.js` (aktualizacje obiektów: pełne / współdzielone),
  `shadowcost.js` (koszt map cieni), `observers.js`.

## 0.49.0 – 19 października 2026

Tryb WebGPU (etap 1 przejścia, w budowie): `?webgpu` – WebGPURenderer z materiałami węzłowymi (TSL). Domyślnie WebGL.

### Renderer (`common.js`, `scene.js`, `preview.js`)
- `NS.gpu`: `?webgpu` w adresie albo `localStorage['maszynista.renderer'] = 'webgpu'`; `?webgpu=gl` – WebGPURenderer
  z zapleczem WebGL 2. Rysowanie po `init()`; `precompile` czeka na niego. Import map: `three/webgpu`, `three/tsl`,
  `three/addons/`.
- W trybie WebGPU wyłączone (jeszcze GLSL – `ShaderMaterial`): efekty po renderowaniu (`post.js`), kopuła nieba
  i panorama chmur (`sky.js` – tło w kolorze mgły), opady (`weather.js`), promienie słońca; bez kompilacji z góry.
- Nakładka F3: czas karty ze znaczników czasu (`?gputime`), nazwa karty z `adapterInfo`; `bench()` – tylko czas procesora.
- Macierze świata raz na klatkę (WebGPURenderer liczył je przy każdym `render()`, także dla każdej mapy cieni).
- `setQuality` nie niszczy map cieni (WebGPU: `ShadowNode` trzyma mapę i sam zmienia jej rozmiar – zniszczona psuła
  wszystkie materiały z cieniami).

### Materiały węzłowe (`js/3d/nodes.js`, nowy)
- `patch()` w trybie WebGPU tworzy materiał węzłowy (Standard / Physical / Lambert / Basic) z klasą pochodną: wszystkie
  warianty (`lit`, `wind`, `grass`, `ground`, `gravel`, `road`, `concrete`, `platform`, `roof`, `dirt`, `train`, `clean`,
  `indoor`) z tymi samymi wzorami i kolejnością co GLSL – wzór i wysokość mikrorzeźby, normalna zgięta przez nią, pogoda
  (mokro, strużki, krople, śnieg), kałuże z kręgami, światło latarni z mapy nocnej i odbicia opraw; tabor – patyna,
  spoiny, nity, żebra dachu, okluzja z wierzchołków także w świetle bezpośrednim, powłoka; kołysanie roślin (pozycja
  instancji z kolumny macierzy), otwory portali tuneli. Szumy jako funkcje shadera (`setLayout`).
- Haki zamiast dalszych łatek `onBeforeCompile`: ludzie (animacja chodu i siedzenia, wzrost, plecaki i torby, palety
  ubrań), zaspy, wnętrza wagonów (świecenie × kolor) i pasażerowie, materiały taboru z `aRM` (chropowatość, metaliczność,
  zabrudzenie w wierzchołkach), mokra / ośnieżona / oszroniona szyba z wycieraczkami, woda (fale, Fresnel, odbicie przez
  `reflector` – `WaterReflectionGPU` w `water.js`), pierścienie horyzontu, odbicia nieba (PMREM, ten sam bufor docelowy).
- Kaskady cieni i cienie chmur w węzłach świateł (`setupCascades`: `shadow.shadowNode` – pierwsza mapa obejmująca piksel,
  `colorNode` – chmury, dalsze kaskady bez cieni dla obiektów bez cieni).
- Klucz zbudowanego shadera z wariantem, opcjami i `#define` (Three skraca obiekty materiału do „{}” – płyty peronu
  i warianty taboru dzieliłyby jeden shader).
- Wydajność: wspólne uniformy w grupie `renderGroup`, przepisywane raz na klatkę (`NS.nodes.sync`) – `reference()`
  aktualizował się dla każdego obiektu; mapa nocna jako jedna stała tekstura, próbki bez aktualizacji odwrócenia osi Y
  dla każdego obiektu (9 próbek w materiale); razem z 34 do 24 ms procesora na klatkę. Nadal wolniej niż WebGL (ok. 9 ms):
  narzut WebGPURenderer na obiekt (~800 obiektów w scenie i mapach cieni), karta ok. 4 ms.
- Zgodność z WebGL (jakość niska, Gliwice – Zabrze): w dzień średnia różnica pikseli 1,8–2,3/255 (krawędzie), noc ta sama
  jasność (45,1 / 45,0), śnieg i kabina w deszczu bez różnic poza brakującymi jeszcze opadami i niebem. Wyłapane przy tym:
  mapa otoczenia w WebGPU przechodziła przez tone mapping (nocą kilkanaście razy jaśniejsza), cienie składu (bryły cienia
  ukrywane w `onBeforeRender` – WebGPU woła go także w mapach cieni; teraz wg kamery).

### Narzędzia
- `tools/render-check/` – zrzuty z jazdy w obu trybach (Electron, okno poza ekranem), różnice obrazów, wycinki, jasność,
  profil procesora, sceny (deszcz nocą, śnieg, kabina).

## 0.48.6 – 18 października 2026

Three.js 0.186 jako moduły ES (etap 0 przejścia na WebGPU; nadal WebGLRenderer, wygląd bez zmian).

### Three.js (`vendor/three/`, `tools/vendor.js`)
- Three.js 0.170 → 0.186.1: npm `three` (devDependency) kopiowany przez `npm run vendor` do `vendor/three/` –
  `three.module.js` + `three.core.js` (WebGLRenderer), `three.webgpu.js`, `three.tsl.js` i `addons/tsl/` pod WebGPU
  (jeszcze nieużywane; poza paczką aplikacji i wersją przeglądarkową). Usunięte `vendor/three.global.js` i
  `tools/build-three.js` (`npm run build:three`).
- `index.html`: import map (`three` → `./vendor/three/three.module.js`); `js/3d/*`, `hud.js`, `news.js`, `tts-piper.js`,
  `main.js` jako `<script type="module">` (po zwykłych skryptach, w tej samej kolejności); pliki 3D:
  `import * as THREE from 'three'` zamiast `window.THREE`. Logika (`physics.js`, `sim.js`, trasy…) bez zmian – zwykłe
  skrypty (testy w Node, wątki). Strona otwarta z dysku (`file://`) już nie działa – `npm start` albo aplikacja.
- Cienie: `PCFSoftShadowMap` usunięty w r180 → `PCFShadowMap` (5 próbek z dyskiem Vogela, `shadow.radius` w tekselach);
  podgląd składu `radius` 3 → 1,5 (przy 3 – ziarno). Podmiany fragmentów shaderów (`onBeforeCompile`, kaskady cieni
  w `lights_fragment_begin`) – wszystkie 41 miejsc zaczepienia bez zmian w 0.186.
- Sprawdzone zrzutami z jazdy (Gliwice – Zabrze, 12:00 i 21:30): średnia różnica pikseli wobec 0.170 poniżej 1/255.

## 0.48.5 – 18 października 2026

Ruch uliczny nad tunelem po ulicy, nie w tunelu.

### Ruch uliczny (`street-life.js`)
- `streetY`: `roadY` tylko do 25 m od przejazdu w poziomie (`nearLevelCrossing`), dotąd – przy torze poza mostem, więc
  także nad tunelem (Warszawa Wschodnia – Zachodnia: 1020 z 1056 punktów ulic nad tunelem 6–10 m pod jezdnią;
  trzy przystanki autobusowe nad osią tunelu).

## 0.48.4 – 18 października 2026

Ruch uliczny pod mostami po jezdni, nie na poziomie toru.

### Ruch uliczny (`street-life.js`)
- `streetY(s, d, ch)`: wysokość jak rysowana jezdnia – `surfY` + 0,1 m; `roadY` (poziom torowiska) tylko przy torze poza
  mostem (przejazd w poziomie); `roadBridged` – `rowZAt` drogi źródłowej odcinka ciągu (`nearSeg`). `pathAt` podaje
  ciąg (`out.ch`) – auta, światła, piesi na jezdni. Na trasie Rybnik – Katowice 239 z 280 punktów ulic pod mostami
  było dotąd ponad 0,5 m nad jezdnią (do 6,2 m).

## 0.48.3 – 18 października 2026

Raport jazdy w pauzie jak tablica odjazdów.

### Postój (`main.js`, `style.css`)
- `buildReport()` – widok raportu jako `.rep-board` (`.mb-head`, `.mb-cols`, `.mb-dest`, `.mb-note`, `.mb-dl` z tablicy
  odjazdów; `setFlap`); `setFlap` animuje też przy widocznej pauzie.

## 0.48.2 – 18 października 2026

Krótsze menu postoju.

### Postój (`index.html`, `main.js`)
- Usunięte `#btn-tt` i `#btn-free` z `#pause-main` oraz ich obsługa.

## 0.48.1 – 18 października 2026

Zakładki ustawień mieszczą nazwy w całości.

### Ustawienia (`style.css`)
- `#settings .panel` – 780 px; `#set-tabs button` – jedna kolumna, numer `i` w prawym górnym rogu.

## 0.48.0 – 18 października 2026

Sterowanie i zasady jako zakładki Ustawień.

### Ustawienia (`index.html`, `main.js`, `style.css`)
- `#set-tab-keys` (dawna lista klawiszy z `#tab-help`) i `#set-tab-rules` (zasady); `showSetTab` – pięć zakładek,
  `#set-tabs` – 5 kolumn (3 poniżej 760 px).
- Pauza: usunięte `#btn-keys`, `#pause-keys` i kopiowanie pomocy w `main.js`.

## 0.47.8 – 18 października 2026

Rozkaz pisemny jak druk kolejowy, z pieczątką stacji.

### Rozkaz pisemny (`index.html`, `style.css`, `hud.js`)
- `.order-f`: `.order-sig` (nadawca, linia podpisu, podpis „podpis dyżurnego ruchu”); `Hud.order()` ustawia
  `data-stamp` (nazwa stacji) – pieczątka `.order.done::after`. Sekcja „rozkaz pisemny: druk kolejowy” w `style.css`.

## 0.47.7 – 18 października 2026

Karta postoju: wysokość wg treści, górna krawędź w stałym miejscu.

### Postój (`style.css`)
- `#pause .mf-report`: `max-height` 480 px zamiast stałej wysokości, przypięta górą (`top: max(80px, 50vh − 240px)`, bez
  `translateY`), własna animacja wejścia `mf-card-top`.

## 0.47.6 – 18 października 2026

Karta postoju o stałej wysokości z przewijaniem.

### Postój (`style.css`)
- `#pause .mf-report`: stała wysokość `min(470px, 100vh − 160px)`; `#rep-body` przewijane, pasek `::-webkit-scrollbar`
  (Firefox – `scrollbar-color`).

## 0.47.5 – 18 października 2026

Godziny w zapowiedziach głosowych czytane słownie.

### Zapowiedzi (`sim.js`, `main.js`)
- `spokenTimes(text)` (eksport `TrainSim`): „o HH:MM[:SS]” → „o godzinie” + godzina porządkowa w miejscowniku i minuty
  słownie (1–9 – „zero …”, pełna godzina – bez minut); godzina bez „o” – w mianowniku. `announce()` podaje syntezie
  (Piper i głos systemu) tekst po zamianie; test w `sim.test.js`.

## 0.47.4 – 18 października 2026

Odstęp komunikatów od okienka dyżurnego ruchu.

### Radiotelefon (`hud.js`, `style.css`)
- `ResizeObserver` na `#radio` ustawia zmienną CSS `--radio-h`; `body.radio-on #toasts` – `top: 12px + --radio-h + 14px`.

## 0.47.3 – 18 października 2026

Okienko dyżurnego ruchu w stylu pulpitu.

### Radiotelefon (`style.css`)
- `.radio` jak komunikaty pulpitu: zmienna `--k` (zielony, przy `.ack` – pomarańczowy), nagłówek mono z prefiksem
  „RADIOTELEFON ·” (`.radio-h::before`), lampa `.radio-ico` miga, `.radio-ack` kwadratowy.

## 0.47.2 – 18 października 2026

Komunikaty w dwóch rzędach: rodzaj, a pod nim treść.

### Komunikaty (`style.css`)
- `.toast` jako siatka: lampa i kategoria w pierwszym rzędzie, treść (`span`) na całą szerokość w drugim.

## 0.47.1 – 18 października 2026

Swobodna kamera w stylu nowego menu.

### Swobodna kamera (`index.html`, `style.css`, `main.js`)
- `#free`: nagłówek `.ph-t` z nadtytułem, `#free-close.free-back` z `kbd`; `#free-info` jako `<dl>` (`updateFreePanel`
  – HTML podmieniany tylko przy zmianie), `fillRanges($('free'))` dla suwaka kilometrażu.
- Lista stacji: `<em>` z kilometrem i nazwa z opisem w `<small>`; sekcja „swobodna kamera w stylu nowego menu” w `style.css`.

## 0.47.0 – 18 października 2026

Pulpit w czasie jazdy w stylu nowego menu: przyrządy, sterowanie w grupach, pasek komunikatów.

### Pulpit jazdy (`index.html`, `style.css`, `hud.js`)
- Sekcja „pulpit jazdy (HUD) w stylu nowego menu” w `style.css`: `#hud .hud-panel` (szkło, narożniki z tła), etykiety
  mono z ▸, zegar, `#i-delay` z lampką, oś czasu, głowica semafora z masztem (`.sig-head::after`), kontrolki `.ind`,
  przyciski `.controls` z `kbd`, `.toast` jako pasek, `#prompt`, `#btn-pause`.
- `.hud-controls`: nagłówki grup `.cg-h`, przyciski `<span>` + `<kbd>`; panel 336 px (300 px poniżej 1100 px).
- `Hud.toast()`: lampa, kategoria (`TOAST_CAT` – wg klucza komunikatu, inaczej wg wagi) i treść; powtórki rozpoznawane
  po `dataset.text`.
- `Hud.drawSpeedo()`: strefy dozwolona / ponad ograniczeniem, znacznik ograniczenia, łuk do wskazówki, odczyt cyfrowy.

## 0.46.1 – 18 października 2026

Równa wysokość przycisku „Zakończ jazdę”.

### Akcja drugorzędna (`style.css`)
- `button.mf-act.subtle`: bez mniejszej czcionki i odstępów – tylko tło i kolor napisu.

## 0.46.0 – 18 października 2026

Menu w czasie jazdy: postój z rozkładem, rozkazami i stłumionym dźwiękiem.

### Postój (`index.html`, `style.css`, `main.js`, `audio.js`)
- `#pause`: `#pause-main` (`.mf-home` z akcjami `mf-act`), `#pause-cond` (dawne sekcje pogody, pory dnia i roku),
  `#pause-keys` (kopia klawiszy i zasad z pomocy karty drogowej), stopka; `pauseScreen()`, Esc – z podekranów do postoju.
- Karta `#pause-report`: przełącznik `.rep-tabs`, `buildReport()` – raport, rozkład (`sim.records`, `plannedArr/Dep`),
  rozkazy (`sim.orders`).
- `btn-quit`: potwierdzenie w przycisku (3 s). Pauza nie wycisza – `audio.setMuffle()` (filtr dolnoprzepustowy 520 Hz
  na szynach pociągu, otoczenia i sygnałów; głos i menu bez filtra), włączane w `showOverlay` w pauzie (także ustawienia
  i zapisy otwarte z pauzy).

## 0.45.4 – 18 października 2026

Bez migającego paska przewijania w menu.

### Pasek przewijania w menu (`style.css`)
- Nakładka menu ma `backdrop-filter`, więc jej elementy `position: fixed` liczą się do jej przewijania: `.mf-hud` przycina
  pas światła (`overflow: hidden`), `#menu` bez przewijania w poziomie (wsuwana tablica odjazdów).
- Linia światła okna (`.panel::after`): element na całe okno, przesuwa się tło (`background-position`), nie element.
- Pomiar: zawartość menu większa niż widok w 6 na 100 próbek przed poprawką, 0 po.

## 0.45.3 – 18 października 2026

Okna menu bez mignięcia przy otwarciu.

### Otwieranie okien (`style.css`)
- `mf-win`: tylko przezroczystość (0,2 s) – skalowanie 0,985 → 1 i przesunięcie wyglądały jak chwilowa zmiana szerokości.
- `.panel`: `scrollbar-gutter: stable`.

## 0.45.2 – 18 października 2026

Czytelne podpisy na bursztynowych przyciskach.

### Kontrast podpisów (`style.css`)
- `small` w `button.primary` (podmenu generatora i okna menu): `rgba(28, 20, 4, 0.75)` zamiast półprzezroczystej bieli.

## 0.45.1 – 18 października 2026

Małe okienka wczytywania w stylu nowego menu.

### Małe wczytywanie (`index.html`, `style.css`, `main.js`)
- `#route-loading .rl-box`: karta jak okna nowego menu (szkło, narożniki, bursztynowy pasek z lewej), `.mf-eyebrow`
  z lampą zamiast kręciołka, `#rl-pct`, odblask na pasku; klasa `done` (100%) – zieleń.
- `routeLoading`: nadtytuły `RL_HEAD` wg rodzaju wczytywania, procent; nazwy etapów.

## 0.45.0 – 18 października 2026

Nowe menu: okna, karta drogowa, pauza z raportem, dźwięki, ujęcia w tle.

### Nowe menu – etapy 2–5 (`index.html`, `style.css`, `main.js`, `audio.js`, `scene.js`)
- Okna `.panel` w menu, ustawieniach, zapisach, pauzie i na końcu jazdy: tło `--m-glass` z narożnikami w gradientach
  (zostają przy przewijaniu), `mf-win`/`mf-winscan`, nagłówki `.ph-t` (nadtytuł z `.lamp`, tytuł z kropką i kreską),
  `.panel.danger` (zdarzenie). Kafelki z numerami (liczniki CSS), zakładki z numerem 01–04, wiersze tras, suwaki
  z `--fill` (`fillRanges`).
- Pauza: `#pause-report` – `buildReport()` (dane jak w HUD-zie). Koniec jazdy: `#end-eyebrow`, lampa zielona / czerwona.
- `audio.ui(name)` (szyna `uiBus`): hover, click, select, back, toggle, done; podpięte delegacją zdarzeń w oknach menu;
  opcje `opt.uiSound`, `opt.reduceMotion` (`body.reduced-motion`).
- `scene.js menuShot()`: ujęcia w tle menu (`renderer.menuCam` w menu, `cinemaShot` przy stacji).

## 0.44.0 – 18 października 2026

Nowe menu: ekran główny „Gotowy do odjazdu.” z tablicą odjazdów.

### Nowe menu – etap 1 (`index.html`, `style.css`, `main.js`)
- Wzór: menu gry LOT, w kolejowej otoczce (bursztyn + zieleń semafora, czerwień – zdarzenia). Tokeny `--m-*`, rama
  `.mf-hud` (narożniki z gradientów, pas światła), `.mf-brand`, `.mf-foot`.
- Ekran główny `#scr-main.mf-home`: `.mf-eyebrow` z `.lamp`, `h1.mf-title`, `.mf-lead`, akcje `button.mf-act`
  (pasek akcentu, odblask, `.prominent` z pulsującą poświatą, podpowiedź `em`). `buildHome()` – dane z wybranej trasy
  (od stacji początkowej), numer pociągu `trainNo()` (stały dla trasy i godziny), autozapis.
- `#dep-board`: tablica klapkowa (`setFlap` – zmienione znaki przeskakują przez losowe litery), „przez” przewijane tylko
  przy długiej liście, zegar dworcowy; tylko na ekranie głównym, ukryta poniżej 1000 px.
- Enter na ekranie głównym – odjazd (gdy fokus nie stoi na przycisku); po wejściu na ekran – fokus na pierwszej akcji.

## 0.43.3 – 17 października 2026

Pasek generowania w tym samym miejscu w menu i w grze.

### Pasek generowania (`style.css`, `main.js`)
- `#gen-bg`: jedno położenie (prawy górny róg, 58 px od góry, do 340 px szerokości) w menu i w jeździe; bez klasy
  `in-game`.

## 0.43.2 – 17 października 2026

Przycisk „Pokaż przebieg” na pasku generowania.

### Pasek generowania (`main.js`)
- Przycisk `open` („Pokaż przebieg”) tylko w menu (z jazdy nie ma przejścia do ekranu generatora), także po zakończeniu
  generowania.

## 0.43.1 – 17 października 2026

Podmenu generatora: Nowa trasa i Moje trasy.

### Podmenu generatora (`index.html`, `main.js`, `style.css`)
- Ekrany: `scr-genmenu` (podmenu), `scr-gen` (nowa trasa: formularz, karta postępu, przebieg generowania),
  `scr-routes` (moje trasy). Pasek generowania w tle ukryty tylko na ekranie nowej trasy.
- Przeciągnięte pliki tras – ekran „Moje trasy”; Esc z ekranów generatora – podmenu.

## 0.43.0 – 17 października 2026

Generator tras w tle z paskiem postępu, jeden ekran generatora i tras.

### Generator w tle (`js/gen-worker.js`, `main.js`, `index.html`, `style.css`, `osm-route.js`, `gen/sources.js`)
- Nowy wątek `gen-worker.js` (Web Worker): `routes.js`, `physics.js`, `sim.js`, `horizon-data.js`, `gen/sources.js`,
  `osm-route.js`, `route-check.js`; generowanie (także trasa w drugą stronę), próba `prepare`, kontrola trasy;
  pamięć podręczna plików źródeł i kafelków NMPT w tej samej bazie IndexedDB. Adresy względne (pośrednik serwera gry)
  rozwiązywane względem strony gry; w aplikacji desktopowej NMPT przez grę (`desktopProxy` → `window.desktop.fetchText`).
- `osm-route.js`, `gen/sources.js`: rozpoznanie Node bez wątku przeglądarki (`importScripts`); dane RINF w wątku –
  `importScripts`.
- `main.js`: zadanie dla wątku, postęp z komunikatów generatora (`GEN_STEPS`), karta `#gen-status` i pasek `#gen-bg`
  (poza ekranem generatora; w jeździe – prawy górny róg), „Anuluj” (zakończenie wątku), zapis gotowej trasy na liście
  i w bazie, komunikat w czasie jazdy. Ekrany `scr-gen` i `scr-routes` połączone.
- `pairOf`: para kierunków tylko z tego samego źródła (wbudowane / z generatora).

## 0.42.6 – 17 października 2026

Okienko wczytywania przy zmianie stacji początkowej.

### Wczytywanie przy zmianie stacji początkowej (`main.js`)
- Zmiana `opt-start` w menu – `selectRoute` (etapy z `routeLoading`, doczytanie świata podglądu) zamiast samego
  `buildMenu` i `startDemo`; tytuł w okienku – przebieg od wybranej stacji.

## 0.42.5 – 17 października 2026

Schemat linii zamiast kafelków stacji początkowej.

### Schemat linii stacji początkowej (`style.css`, `index.html`, `main.js`)
- `#start-tiles.run-line`: siatka o `--n` kolumnach (równe odstępy), linia i odcinek jazdy (`--a` – numer stacji
  początkowej) jako pseudoelementy; nazwy na przemian nad i pod linią (do dwóch kolumn szerokości), skrajne wyrównane do
  brzegów; kilometr w podpowiedzi. `#run-info` – podsumowanie przebiegu.

## 0.42.4 – 17 października 2026

Przyciski i kafelki przebiegu, jednolity wygląd list w menu.

### Pola w menu (`style.css`, `index.html`, `main.js`)
- `select`: własny wygląd (`appearance: none`), strzałka z SVG, stany najechania, fokus (bursztynowa ramka), wyłączenia;
  ciemne opcje listy.
- Przebieg: `#dir-seg` (przyciski jak `.seg`) i `#start-tiles` (kafelki jak pogoda); wybór przez ukryte listy `opt-dir`
  i `opt-start` (te same zdarzenia `change` co dotąd).
- `.row-opt.sel-opt`: etykieta i lista w kolumnach (Napęd, Hamulec).

## 0.42.3 – 17 października 2026

Poświata świateł aut nocą, wszystkie przystanki przy ulicach.

### Światła i przystanki (`street-life.js`, `real-env.js`)
- `drawStreetGlows`: przy każdym aucie cztery kwadraty z teksturą poświaty (reflektory i światła tylne) zwrócone do
  kamery; siła wg kąta między kierunkiem światła a kamerą, wielkość rośnie z odległością (do 900 m).
- `envBusStops`: kandydaci do 22 m od przystanku (od najbliższego) – pierwszy ciąg z miejscem poza skrzyżowaniem
  (dawniej tylko najbliższy do 15 m; na zbyt krótkim przystanek przepadał).

## 0.42.2 – 17 października 2026

Światła aut nocą, więcej przystanków, poprawki skrętów i mijania.

### Ruch uliczny – poprawki (`street-life.js`, `real-env.js`, `world.js`)
- Światła nocą: instancje płaskich plam (tekstura owalu z miękkim brzegiem, mieszanie addytywne) na jezdni – przed autem
  (14 m, od maski) i za nim (czerwona); siła wg zmroku (`dark` przekazywany do `updateStreetLife`).
- `envBusStops`: także drogi dojazdowe (z dopłatą 3 m do odległości – ulica ma pierwszeństwo), krótki ciąg – przystanek
  w jego środku. Autobusy wjeżdżają na drogi dojazdowe z przystankami i pojawiają się także na nich.
- `streetConflict`: ten sam pas wlotu – bez kolizji (odstęp jak za autem); sąsiednie pasy tego samego wlotu – kolizja
  wg zbliżenia torów przejazdu.
- Wąska jezdnia dwukierunkowa (do 5,5 m): do 15 km/h, gdy auto z naprzeciwka jest bliżej niż 30 m.

## 0.42.1 – 17 października 2026

Poprawka: gra nie wczytywała się po zmianie stacji początkowej.

### Świat przy innej stacji początkowej (`scene.js`, `world.js`)
- Semafory i stacje świata odwołują się do list trasy po numerach. Trasa przycięta do stacji początkowej (`route.from`) ma
  mniej semaforów odjazdowych i inne numery stacji, a świat nie był przebudowywany, bo identyfikator trasy był ten sam.
  Klucz świata to teraz `id@from`.
- `updateDyn`: semafor spoza listy trasy jazdy jest pomijany (zabezpieczenie).

## 0.42.0 – 17 października 2026

Ruch uliczny (auta, ciężarówki, autobusy) i ruch pieszy na trasach z mapy.

### Ruch uliczny i pieszy (`js/3d/street-life.js`, `real-env.js`, `world.js`, `main.js`, `osm-route.js`)
- Nowy moduł `street-life.js`. Sieć: ciągi i skrzyżowania z `envStreets` (eksport `World.streetUtil`), pasy wg kierunku
  (`one`, `flip`) i liczby pasów, łączniki przez skrzyżowania (krzywe Béziera, prędkość z promienia łuku), łączniki przez
  przejazdy kolejowe (końce ulicy z `envCrossingPath`, linia zatrzymania 2,6 m przed sygnalizatorem).
- Auta: kolejka odcinków (pas → łącznik → pas), wybór wylotu (na wprost częściej, ciężarówki i autobusy – drogi wyższych
  klas), odstęp od auta przed sobą, zgoda na wjazd (`streetMayEnter`: sygnalizacja `tlState`, A-7, prawa ręka, lewoskręt
  ustępuje, kolizyjne tory przejazdu, miejsce za skrzyżowaniem; po 8 s czekania na nadjeżdżających – jedzie). Zebry –
  także na następnym odcinku. Ślepy koniec: daleko od kamery – znika, blisko – zawraca.
- Piesi: chodniki (`ch.sw`), łuki chodników na narożnikach (`c.cv`), przejścia (zajętość `z.busy`), przejazdy, przystanki
  (czekający, wsiadanie, wysiadanie).
- Rysowanie instancjami (osobno lakier, szyby, reszta; ciężarówka i autobus – nowe bryły), postacie z `peopleMeshes`.
  Koszt ok. 0,3–0,4 ms na klatkę.
- `world.js`: aktualizacja w `update`, czyszczenie przy zmianie trasy; własne auta przejazdu ukryte, gdy przez przejazd
  jeździ ruch uliczny. Błąd w ruchu ulicznym wyłącza tylko ten ruch.
- Generator: przystanki `env.bs` (`highway=bus_stop`, `public_transport=platform` + `bus=yes`), dopobieranie do zapisanych
  danych (`fetchBusStops`, flaga `_bus`). `envBusStops` przypisuje przystanki do ciągów; znak D-15 w atlasie znaków
  i wiata.
- Generator w grze: opcja „Także trasa w drugą stronę” (`genOne` dwa razy, stacje krańcowe zamienione).
- Przebudowane trasy wbudowane (z przystankami; także zmiany generatora od poprzedniej przebudowy).

## 0.41.0 – 17 października 2026

Wybór stacji początkowej i kierunku jazdy (Zabrze → Gliwice).

### Stacja początkowa i kierunek (`routes.js`, `main.js`, `index.html`, `routes/zabrze-gliwice.js`)
- `R.prepare(def, cfg, from)` pomija stacje przed `from` (po poprawkach trasy, najdalej przedostatnia). Kilometraż,
  geometria i otoczenie zostają bez zmian. Tytuł i nazwa pociągu są od nowej stacji, a `route.from` przechowuje numer.
- `main.js`: stacja początkowa zapamiętana dla każdej trasy (`startSt`). Klucze przygotowanej trasy, rozkładu i rekordu
  (`best.<id>@<from>`) uwzględniają stację początkową. Zapis gry przechowuje `from`, a scenariusz zawsze startuje od
  stacji 0.
- Para kierunków: `def.reverse` albo trasa rzeczywista z zamienionymi stacjami krańcowymi. Na liście map jest pierwsza
  z pary, a przełącznik „Kierunek” jest w sekcji „Przebieg”.
- Trasa z generatora bez pary: przycisk „W drugą stronę” uruchamia generator z zamienionymi stacjami, z tą samą linią.
- Nowa trasa wbudowana Zabrze – Gliwice (generator z danych Gliwice – Zabrze, linia 137) z horyzontem.

## 0.40.15 – 17 października 2026

Zapowiedzi głosowe na peronach Warszawy Śródmieście.

### Zapowiedzi na peronach stacji innej linii (`life.js`, `main.js`, `audio.js`, `real-env.js`, `scene.js`)
- `Life.localAnnounce`: zapowiedź przyjazdu ok. 350 m przed zatrzymaniem i odjazdu ok. 12 s przed odjazdem. Głośność
  zależy od odległości kamery (`life.listener`) od środka peronu: pełna do 40 m, zanika do 260 m. Zdarzenia trafiają do
  `life.events`.
- `main.js` `announce(text, gain, station)`: gong i głos mają głośność `gain`. Tekst z nazwą stacji pokazuje się tylko
  z bliska (gain ≥ 0,5). Zapowiedź na peronie czyta głos także w trybie kamery swobodnej.
- `audio.chime(gain)`, `audio.playVoice(..., gain)`: głośność gongu i głosu Piper. Głos systemu ma głośność × gain.
- `envLocalTracks`: nazwa stacji z `env.os` (do 400 m od środka peronu).

## 0.40.14 – 17 października 2026

Wszystkie tory i perony Warszawy Śródmieście.

### Pełne Śródmieście (`osm-route.js`, trasa Warszawa Wschodnia – Warszawa Zachodnia)
- Tory w długim tunelu (bit 16) brane są do 60 m od osi naszej linii. Wcześniej limit wynosił 40 m i tor 4 linii 448,
  leżący ok. 49 m od osi, był pomijany.
- Perony podziemne w tunelu naszej linii brane są do 70 m od osi (obrys, linia, relacja). Wcześniej limit wynosił
  45/60 m i peron 3 był pomijany.
- Peron podziemny daleko od osi zostaje tylko wtedy, gdy w ¼, ½ i ¾ jego długości biegnie przy krawędzi (do 4 m) tor
  w tunelu z danych. Bez takiego toru to stacja w osobnym tunelu, np. WKD Śródmieście obok Centralnej.
- Przebudowana trasa Warszawa Wschodnia – Warszawa Zachodnia z zapisanych danych. Obudowa tunelu poszerza się do toru 4
  i peronu 3, a pociągi podmiejskie (`envLocalTracks`) jeżdżą po obu torach.

## 0.40.13 – 17 października 2026

Pociągi podmiejskie zatrzymujące się na Warszawie Śródmieście.

### Pociągi podmiejskie na peronach w tunelu (`real-env.js`, `life.js`, `scene.js`)
- `envLocalTracks`: wybiera tory z mapy przy peronach w tunelu innej linii. Peron musi mieć od 80 m i leżeć poza
  peronami stacji trasy. Tor biegnie wzdłuż krawędzi peronu, do 3,5 m od niej, i nie jest torem naszej linii ani torem
  pociągów z przeciwka. Zwraca odsunięcie i wysokość toru (`envRowY`) w miejscu s.
- `Life.updateLocals`: działa, gdy peron jest do 1,5 km od pociągu gracza. Pociąg (EN57/EN76 KM, 27WE SKM, EN71) wjeżdża
  z 800 m, hamuje (0,65 m/s²) i staje środkiem przy środku peronu. Stoi 25–45 s, potem odjeżdża (0,6 m/s², do 65 km/h).
  Wagony poza końcem toru z mapy są ukryte. Model buduje się raz na tor.

## 0.40.12 – 17 października 2026

Pasażerowie na peronach Warszawy Śródmieście.

### Pasażerowie na peronach w tunelu (`real-env.js`, `world.js`)
- `envCrowd`: na peronach z mapy w tunelu (od 80 m) ok. 14 osób czeka przy krawędziach, połowa ławek jest zajęta,
  a 5 osób spaceruje. Używa modeli ludzi z `World.peopleMeshes`, z kolorami `World.PEOPLE` i `World.SKIN`.
- `updateCrowd` (dyn `crowd`): spacerowicze idą wzdłuż peronu, omijają schody i robią przerwy. Animacja ma tryby: chód,
  siedzenie, stanie.

## 0.40.11 – 17 października 2026

Wspólny pomost torów stacji na wiadukcie, schody i wejścia na Śródmieściu.

### Wspólny pomost torów, schody na Śródmieściu (`real-env.js`)
- `buildEnvTracks`: gdy tor na pomoście ma obok, 3–7 m dalej, drugi taki tor na tej samej wysokości (±0,6 m), płyta po
  tej stronie biegnie do połowy odstępu, bez gzymsu.
- `envRowY`: zasada „tor ukośny pod naszym mostem – nie wyżej niż dno obniżenia” nie dotyczy torów z mostem w danych.
  Tory stacji na wiadukcie, ukośne na rozjazdach, były wcześniej sprowadzane do ulicy pod spodem.
- Perony z mapy w tunelu (od 80 m): schody do stropu hali na ok. 1/5 i 4/5 peronu (bieg w osi peronu, ściany,
  poręcze) i pawilon wejściowy na powierzchni (teren z pomiaru) z nazwą stacji. Ławki omijają schody.

## 0.40.10 – 17 października 2026

Tunel średnicowy: jaśniejszy, perony bez latarni ulicznych, ławki na Śródmieściu.

### Tunel średnicowy i Śródmieście (`real-env.js`, `world.js`)
- Perony z mapy w tunelu (`envTunnelK` > 0,5): zamiast latarni na słupie jest światło pod stropem (`always`, pula
  świateł). Między światłami co 30 m stoją ławki parami (plecami do siebie) i kosz.
- Obudowa tunelu: jaśniejsza posadzka (#6a665f, w hali #958f85; wcześniej #4a4743) i ściany, poświata materiału 1,0
  (wcześniej 0,7).
- Co druga lampa na ścianie (co 30 m) to światło punktowe z puli, zawsze włączone. `buildEnvTunnel` dostaje `dyn`
  kawałka.

## 0.40.9 – 17 października 2026

Filary mostów i wiaduktów naszej linii poza drogami i torami.

### Filary mostów naszej linii (`world.js`)
- `buildViaduct`: filar pośredni nie stoi na drodze pod pomostem (poniżej 2 m pod szyną) ani na torze z mapy
  (do 2,4 m od filara, ponad 3 m niżej; `envRowY`). Przesuwa się wzdłuż mostu do 6 m, a gdy nie ma miejsca, jest
  pomijany. Wcześniej filary stały co 10 m bez sprawdzania, poza środkowymi 7 m.
- `buildBridge`: do sprawdzania dróg pod filarem doszły tory innych linii.
- Audyt obiektów (`envAudit`, Gliwice – Katowice) nie znalazł filarów na torach ani drogach przy wiaduktach nad naszą
  linią. Te sprawdzały już miejsce na filar (`pierFree`).

## 0.40.8 – 17 października 2026

Poprawki Torunia: przejazd, stacja w wykopie, wiadukty, tory na moście.

### Toruń – Chełmża: przejazd, stacja w wykopie, wiadukty, tory na moście (`real-env.js`, `world.js`, `osm-route.js`)
- Drogi przy przejeździe kolejowym: pomijany jest tylko punkt na drodze przez przejazd (`envCrossingPath`, połowa
  szerokości + 1,5 m). Wcześniej znikała każda droga do 12 m od przejazdu i 40 m od osi.
- Spłaszczanie terenu stacji przy pomiarze NMT: do skraju korony po danej stronie (`envShoulder`) + 1 m, zanik na 6 m.
  Wcześniej 24–44 m.
- Wiadukt drogowy (`overpassPlan`): za przedłużeniem nad wykopem pomost dochodzi do ulicy w poziomie pomostu (do 1,2 m),
  jeśli leży ona do 6 m dalej.
- Generator: tory biegnące wzdłuż (|Δd| ≤ 0,35·|Δs|) w obrębie mostu naszej linii (±5 m), do 60 m od osi, różniące się
  od naszej szyny o mniej niż 3 m, dostają jej poziom z przejściem 30 m. Trasa Toruń – Chełmża zbudowana ponownie.

## 0.40.7 – 17 października 2026

Poprawka: drogi nachodzące na siebie.

### Drogi nachodzące na siebie (`real-env.js`)
- `envIndex` (wysokości dróg `roadZ`, przed ograniczeniem pochylenia 12%): punkt drogi, której pas zachodzi na pas
  równoległej drogi wyższej o 0,3–2,5 m, dostaje jej poziom. Warunki: |cos| ≥ 0,9, osie bliżej niż suma połówek
  szerokości + 1 m, rzut z zapasem 3 m za końcami odcinka. Do własnej wysokości droga wraca na 15 m.
- Wcześniej maska dróg brała w pasie wyższą jezdnię, a pas przecinał komórki ukośnie, więc niższa droga przeskakiwała
  między poziomami co 2 m. Toruń – Chełmża: z 29 punktów zostało 6 (4 m przy węźle trzech dróg).
- Przegląd profili tras wbudowanych: tory z mapy 0–3 „wycieczki” na trasę, drogi głównie serwisowe 1,5–3 m. Bez zmian
  filtrów generatora.

## 0.40.6 – 17 października 2026

Wiadukty innych linii: poziomy pomost i rampy torów.

### Wiadukty innych linii nad naszą (`osm-route.js`)
- Dotyczy `env.ro`, gdy pomiar powierzchni nie pokazuje pomostu: `roz` < 0, a profil przy torze (do 6 m) leży
  poniżej 5,5 m nad naszą szyną. Profil `roh` jest wtedy poziomy, 7,6 m nad naszą szyną, jak w grze bez pomiaru.
- Tory dochodzące do końców pomostu (do 4 m) wznoszą się do szyny na pomoście (0,6 m pod wierzchem) rampą 3% wzdłuż
  torów. Tor wyżej z pomiaru zostaje bez zmian. Podniesienie przechodzi na tory połączone dalszym końcem.
- Ponownie zbudowane z zapisanych danych wszystkie trasy wbudowane. Gliwice – Katowice: 2 tory pod naszym mostem
  i 10 odcinków ramp. Rybnik – Katowice: 4 odcinki ramp. Gliwice – Zabrze: 2 tory pod mostem.

## 0.40.5 – 17 października 2026

Poprawka: tory innej linii pod mostem naszej linii.

### Tory z mapy pod naszym mostem (`osm-route.js`)
- Tor przecinający oś naszej linii ukośnie (|Δd| > 0,25·|Δs|) w obrębie jej mostu (±3 m) ma w przecięciu co najmniej
  7 m pod naszą szyną: prześwit 6,2 m i konstrukcja. Rampa 2% w obie strony i dalszy ciąg toru jak przy krzyżowaniach
  torów (`lower`). Znacznik mostu na ukośnych odcinkach dochodzących do osi (do 2 m) pod naszym mostem jest
  usuwany, bo pomost wypadał na naszym poziomie.
- `levelBeside` działa tylko tam, gdzie sam tor biegnie wzdłuż (|Δd| ≤ 0,15·|Δs|). Tor ukośny przy osi był
  wcześniej podnoszony do poziomu torów obok.
- `routes/gliwice-zabrze.js` zbudowana ponownie z zapisanych danych: dwa tory na km 4,24 krzyżują oś na wysokości
  20,1 m, a nie 26,0–26,8 m.

## 0.40.4 – 17 października 2026

Toruń – Chełmża wygenerowana na nowo.

### Trasa wbudowana Toruń – Chełmża (`routes/torun-chelmza.js`, `routes/horizon/torun-chelmza.js`)
- Wygenerowana od nowa (dane z 17.10.2026; skład `dd`, 6:40, poziom średni): 8 stacji i przystanków, 23,1 km,
  271 torów z mapy, w tym 28 dalej niż 110 m. Horyzont dopasowany do 8 stacji (błąd średni 55 m).

## 0.40.3 – 17 października 2026

Poprawka: kierunek sygnalizatorów i znaków drogowych.

### Sygnalizacja uliczna (`real-env.js`)
- `post()` (słupek znaku lub sygnalizatora przy ciągu): kierunek jazdy wyznacza odcinek ta → tb, ułożony już według
  `dir`. Dodatkowe mnożenie przez `dir` odwracało sygnalizatory i znaki na wlotach z `dir = −1` (jazda ku początkowi
  ciągu).

## 0.40.2 – 17 października 2026

Tory z mapy do 250 m od trasy.

### Zasięg torów z mapy (`osm-route.js`, `real-env.js`, `tools/osm-route.js`)
- `RAIL_D = 250` (dawniej 110 m): tory z mapy, rozjazdy i kozły oporowe. Sieć trakcyjna nad innymi torami (słupy
  i przewody) też do 250 m, dawniej 60 m. Bramownica semaforów bez zmian.
- Trasy wbudowane (bez `torun-chelmza`) zbudowane ponownie z zapisanych danych. Przybyło od kilku do ok. 130 torów
  na trasę, a pliki urosły o 1–3%.
- `tools/osm-route.js`: `--save-env` zapisuje znaczniki `_masts`, `_streets`, `_pois`, bo zapytanie otoczenia
  zawiera już maszty, przejścia, parkingi i punkty usług. Przy `--env-data` dane nie są wtedy dopobierane z Overpass,
  co wcześniej dublowało elementy.

## 0.40.1 – 16 października 2026

Kamera zewnętrzna w tunelu (za pociągiem, z boku, przy torze, przy wózku).

### Kamera w tunelu (`scene.js`)
- `tunnelClamp(sim, mode)` działa dla widoków `follow`, `side`, `trackside` i `bogie`, gdy pociąg jest w tunelu
  (czoło lub koniec między portalami, 5 m od nich).
  - Położenie kamery na trasie (s, d) bierze się z rzutu na oś toru: 6 kroków po stycznej.
  - W obrębie tunelu (`freeTunnel`) kamera jest ograniczana do obudowy: d między ścianami (0,4 m od nich), y pod
    stropem; przy torze 1,7 m nad szyną, z boku 1,2–3,2 m. Potem jest kierowana na pociąg.
  - W widoku z boku odległość uciętą przez ścianę kamera przenosi wzdłuż składu, najwyżej 25 m.
- Widok przy wózku: w tunelu podłożem jest poziom toru, a nie teren (ulica nad tunelem).

## 0.40.0 – 16 października 2026

Nowe trasy wbudowane (Warszawa, Trójmiasto, Orzesze – Mikołów) i odświeżone trasy śląskie.

### Trasy wbudowane (`routes/`, `index.html`)
- Wygenerowane od nowa (`tools/osm-route.js`, dane z 16.10.2026):
  - `gliwice-zabrze`, z poprawkami z poprzedniej wersji;
  - `gliwice-katowice`;
  - `rybnik-katowice`.
- Nowe:
  - `orzesze-mikolow` – z danych korytarza Rybnik – Katowice;
  - `warszawa-wschodnia-zachodnia`;
  - `gdynia-gdansk`.

  Wszystkie mają horyzonty (`tools/horizon.js`) i są dopisane do `index.html` i do testu horyzontu.
- Generator: profil RINF w tunelu po obniżeniu pod przykrycie 6,5 m jest najwyżej 14‰. Przykrycie ustępuje
  pochyleniu, bo w Warszawie za wschodnim portalem wychodziło 16–18‰, a w RINF najwyżej 12,4‰.

## 0.39.4 – 16 października 2026

Poprawki: perony Powiśla, wyższe tunele, budynek przy portalu.

### Perony przy przesuniętych torach, wysokość tunelu, budynki przy portalu (`osm-route.js`, `real-env.js`)
- Generator:
  - po każdym `levelBeside` peron, którego najbliższy tor (do 9 m) przesunięto, a leży pod jego szyną albo ponad 1,5 m
    nad nią, dostaje 0,76 m nad szyną;
  - pomiar peronu ponad 1,5 m pod torami (inny poziom stacji) nie dotyczy peronu między torami tego poziomu, po obu
    stronach do 9 m – na Powiślu pomiar wypadł 2 m niżej.
- `envTunnelH`: 6,8 m (hala 7,6 m), przy płytkim przykryciu najniżej 6 m; teren nad stropem jest podnoszony jak dotąd.
- Budynek przy portalu bierze podstawę z terenu nad samą obudową, a nie ze stropu przy wykopie. Wcześniej najniższy
  punkt obrysu nad wykopem zapadał budynek ok. 1 m w teren nad tunelem.

## 0.39.3 – 16 października 2026

Tunele: obudowa od zewnątrz, budynki nad tunelem i przy portalu.

### Tunele: obudowa od zewnątrz, budynki nad tunelem (`real-env.js`)
- `buildEnvTunnel` rysuje też obudowę od zewnątrz: ściany 0,4 m za wnętrzem, od 1,5 m pod główką szyny, i strop
  0,15 m nad wnętrzem (beton, `World.tunnelOutM`). Wnętrze ma ciemny materiał z poświatą i przez dziurę w terenie
  obok płytkiego tunelu widać je było jako czarne pasy.
- `envOverTunnel(s, d, y, ext)` ustawia podstawę budynku w punktach nad obudową (do 2 m za ścianą): nie niżej niż
  strop + 0,5 m. Budynek z częścią nad obudową liczy się do 15 m przed portalem i nie jest „zadaszeniem nad
  torami” (`overTrack`).

## 0.39.2 – 16 października 2026

Poprawka generatora: tory przy Warszawie Powiślu na poziomie sąsiednich.

### Generator: tory obok torów na poziomie linii (`osm-route.js`)
- Reguła `levelBeside` działa w obie strony: tor równoległy do 6 m od toru na poziomie naszej linii (do 1,5 m od niej),
  różniący się o ponad 1 m (dawniej: wyżej o ponad 2 m), jest przesuwany do poziomu sąsiada. Obejmuje też tory na
  mostach (bez tunelu, bit 16). Rampa 60 m działa w obie strony.
- Reguła działa po pomiarze NMT i ponownie po poprawkach z NMPT (pomosty, krzyżowania), przed wyrównaniem styków
  i zapadlisk. Dawniej poprawki z NMPT cofały ją na moście przy Powiślu.
- Test (`real-route.test.js`): tor z pomiarem 4 m niżej (ulica pod wiaduktem) jest podniesiony do poziomu sąsiada.

## 0.39.1 – 16 października 2026

Oświetlenie stadionów nocą.

### Oświetlenie stadionu (`real-env.js`)
- Naświetlacze to pas pod obrzeżem otworu dachu i od strony boiska, osobna siatka z materiałem kloszy latarń (nocą
  jasne).
- Światła (`envLampSink`, pula świateł punktowych i mapa nocna) to siatka 4 × 3 nad boiskiem i punkty co 30 m nad
  przejściem między kondygnacjami trybun. Mają zasięg 0,55 dłuższego wymiaru boiska albo 24 m i barwę zimnobiałą.
- Dach to osobna siatka z materiałem bez mapy nocnej. Plamy świateł liczone są w rzucie z góry, więc wcześniej
  rozjaśniały dach nad trybunami.

## 0.39.0 – 16 października 2026

Stadiony: trybuny, dach z otworem i boisko z liniami (np. PGE Narodowy).

### Stadiony (`osm-route.js`, `real-env.js`)
- Generator: rodzaj budynku 7 to stadion. Warunek: `building=stadium` albo największy budynek (od 5000 m²) ze środkiem
  w obszarze `leisure=stadium` (np. budynek z BDOT10k). Nazwa pochodzi z obszaru, przeznaczenie 23. Domyślna wysokość
  24 m, potem z NMPT.
- `env.sp` opisuje boisko: indeks budynku, s, d, kierunek dłuższego boku ×1000, połowy długości i szerokości (dm).
  Boisko bierze się z największego `leisure=pitch` w obrysie (do połowy pola budynku), z prostokąta wzdłuż osi
  głównych; wymiary są przyjmowane tylko w granicach 60–125 × 35–90 m. Bez boiska: 105 × 68 m wzdłuż osi obrysu.
- Świat (`envStadium`): pierścienie to przeskalowany obrys. Wewnętrzny jest najmniejszy, w którym mieści się boisko
  z obrzeżem; za duże boisko generator pomniejsza. Elementy:
  - bandy, schodkowe trybuny w dwóch kondygnacjach (do 28 stopni) z przejściem i pasem lóż;
  - dach od ściany do otworu (32% szerokości trybun), z obrzeżem;
  - elewacja przeszklona dołem, z żebrami co 7 m;
  - murawa w pasach, linie, bramki z siatką.

  Murawa leży ponad terenem pod boiskiem.
- Test (`real-route.test.js`): budynek w obszarze stadionu ma rodzaj 7 i nazwę, a boisko wymiary z mapy.

## 0.38.3 – 16 października 2026

Poprawka generatora: cieki pod ziemią (Kanał Kamionkowski przy Warszawie Stadion).

### Generator: cieki pod ziemią (`gen/sources.js`, `osm-route.js`)
- BDOT10k: cieki (SWRS, SWKN, SWRM) z `polozenie` „pod powierzchnią” albo `cechaGeometrii` „sztuczny łącznik” dostają
  `tunnel=culvert`, `layer=-1`. Takie cieki nie są rysowane i nie dostają mostu. Sztuczny łącznik to odcinek dorysowany
  dla ciągłości sieci.
- Odcinki cieków BDOT10k do 15 m od cieku OSM pod ziemią (przepust, kolektor) są też pod ziemią; generator dzieli je
  punktami co 5 m. Na rastrze zagospodarowania obszar wody do 25 m od cieku pod ziemią jest pomijany. Przykład: Kanał
  Kamionkowski przy Warszawie Stadion. W BDOT10k jest tam kanałem „na powierzchni” i obszarem wody, a w OSM –
  „Kolektorem Stadionowym” pod torami.
- Test (`real-route.test.js`): obszar wody wzdłuż kolektora pod torem znika, staw obok zostaje.

## 0.38.2 – 16 października 2026

Poprawka generatora: WKD przy Warszawie Ochocie na poziomie torów linii 448.

### Generator: wysokości torów obok naszej linii przy tunelu (`osm-route.js`)
- Tory w tunelu naszej linii (bit 16) mają w `env.th` poziom naszej linii, a nie pomiar NMT ulicy nad tunelem. Dawniej
  wyrównanie styków (wyższy z poziomów) przenosiło ten pomiar przez krótki odcinek przy portalu na tor wychodzący z tunelu.
  Na Ochocie WKD była 6,5 m wyżej i zjeżdżała w dół 3% na 200 m.
- Tor z pomiarem ponad 2 m wyżej niż sąsiedni tor oddalony do 6 m, równoległy, na poziomie naszej linii, obniżany jest do
  poziomu sąsiada. Warunek: odcinek od 40 m albo cały krótki tor. Do własnego pomiaru wraca rampą 60 m. Dwa przebiegi
  (drugi tor pary). Pomiar NMT trafia tu w przykrycie lub skarpę: WKD przy Ochocie, 3,2 m nad torem linii 448.
- Test (`real-route.test.js`): tor 4 m obok przykrytego toru, z pomiarem 4 m wyżej – obniżony.

## 0.38.1 – 16 października 2026

Poprawka generatora: tory w przykrytym wykopie obok naszej linii (Warszawa Ochota).

### Generator: tory w przykrytym wykopie obok naszej linii (`osm-route.js`)
- Tor pod ziemią według danych (layer < 0) przykryty w pomiarze NMT, równoległy do naszej linii i do 25 m od niej, poza
  naszym tunelem – zostaje, na poziomie naszej linii (dawniej pominięty jako tunel innej linii: Ochota – tor linii 448
  przy peronie wyspowym na 120 m).
- Test (`real-route.test.js`): przykryty tor tuż obok naszego poza tunelem zostaje.

## 0.38.0 – 16 października 2026

Generator: dane PKP PLK do rozpoznawania przystanków, RINF (ERA) – pochylenia i tunele.

### Generator: dane PKP PLK i RINF (`osm-route.js`, `gen/sources.js`, `tools/rinf.js`, `gen/rinf-pl.js`)
- Wykaz posterunków PKP PLK wczytywany przed wyborem stacji: przystanek, który w wykazie leży tylko przy liniach, którymi
  przebieg w tym miejscu (±400 m, numery ref torów) nie biegnie – pominięty (uwaga `station-other`); przy naszej linii –
  zostaje; bez wpisu – dotychczasowa reguła odległości od torów.
- `tools/rinf.js`: wyciąg ze zrzutu grafu wiedzy ERA (Zenodo, CC BY 4.0, czytany strumieniowo) – pochylenia linii
  (‰ od km, tor N) i tunele (linia, km, długość) zarządcy PKP PLK → `js/gen/rinf-pl.js` (ok. 660 KB, w przeglądarce
  wczytywany dopiero przy generowaniu – `TrainSources.rinfData`).
- Tunele z RINF (linia przebiegu, kilometraż z PKP PLK): brak w OSM – dodany (uwaga `tunnel-rinf`), inne położenie
  portali (> 60 m) – uwaga.
- Profil RINF: po sprawdzeniu zgodności z pomiarem na otwartych odcinkach (mediana odchyłki do 1,5 m na 500 m) – kształt
  w tunelach i na mostach od 150 m, końce na wysokości z pomiaru (różnica do 2 m albo 0,4% rozłożona liniowo; większa –
  uwaga `rinf-profile`); w tunelu tor co najmniej 6,5 m pod terenem.
- Źródła danych trasy i ekranu generatora: RINF – © ERA (CC BY 4.0); narzędzie CLI: `--no-rinf`.
- Test (`real-route.test.js`): przystanek innej linii wg PKP PLK, tunel z RINF, profil w tunelu.

## 0.37.1 – 16 października 2026

Poprawki tuneli i torów pod ziemią (wlot tunelu, Stadion, tory innych tuneli).

### Tunele i tory na trasach z mapy – poprawki (`common.js`, `real-env.js`, `world.js`, `osm-route.js`)
- Otwory portali (`uPortalA/B`, `envPortalUniforms`): shader terenu odrzuca piksele w otworze portalu (szerokość obudowy,
  od 0,5 m nad główką szyny do stropu, ±0,6 m od ściany czołowej) – siatka wysokości nie ma dziury, a skok terenu z dna
  wykopu nad strop stał w otworze jak ściana.
- Tory na moście: generator – nie niżej niż teren z pomiaru pod torem; świat – pomiar ponad 1,5 m pod terenem pomijany
  (poziom naszej linii), także dla starszych plików.
- Tory przy naszym tunelu: poza obudową i pod terenem z pomiaru – nie rysowane, bez rowu w terenie i kozłów
  (`envBuriedNearTunnel`); tor zaczynający się do 30 m od portalu i tam ponad 3 m nad naszym torem – biegnie dalej we
  własnym tunelu, nie rysowany (`envRowFromTunnel`, bez sieci trakcyjnej).

## 0.37.0 – 16 października 2026

Tunele i tory pod ziemią na trasach z mapy (po przeglądzie tunelu średnicowego w Warszawie).

### Tunele i tory pod ziemią (`real-env.js`, `world.js`, `osm-route.js`)
- Obudowa: szerokość wnętrza 4,5 m od osi (dwa tory – 9,6 m po lewej), tory w tunelu 3,4 m od skrajnego; chodnik
  służbowy 0,9 m, koryta kablowe (1,75 i 2,2 m), lampy co 15 m na zmianę po obu stronach, lampki ewakuacyjne co 50 m;
  poświata obudowy mocniejsza.
- Sieć trakcyjna: strop tunelu jako ograniczenie wysokości przęsła (jak spód wiaduktu) – lina nośna pod stropem, wspornik
  przy nim; przewody także nad torami w tunelu (bit 16).
- Semafory w tunelu: przy prawej ścianie (`envSignalSpot` – `wall`), bez masztu, na wsporniku.
- Portale: przejście terenu nad strop w obrębie obudowy (+2 m) ostre (`envTunnelSharp`), dodatkowe wiersze siatki terenu
  0,5 m przed i za ścianą czołową (`ribbonRows` – lista kilometraży); obok obudowy dalej łagodnie (12 m).
- Hala stacji podziemnej: kolumny w osi peronu (co 12 m, z pominięciem schodów, tablic, ławek i gablot), reklamy na ścianie.
- Generator: tor pod ziemią według danych w obrębie tunelu naszej linii – do 45 m od osi w obudowie, dalej pominięty, bez
  progu długości; tor na moście równoległy do naszego (do 30 m, poziom do 5 m od naszego, nasza linia bez mostu) – na
  naszym poziomie; most bez prześwitu (mediana poniżej 2 m, od 40 m) – zwykły tor z pomiaru.
- Świat: tor na moście kształtuje teren tam, gdzie leży mniej niż 2,5 m nad terenem z pomiaru (maska jezdni/torów).
- Mosty drogowe: profil pomostu z NMPT – obwiednia dolna (6%) – bez garbów od pylonów i lin.
- Test (`real-route.test.js`): krótka bocznica w tunelu (bit 16), tor osobnego tunelu obok (pominięty).

## 0.36.1 – 16 października 2026

Wygenerowane trasy na osobnym ekranie obok Generatora tras.

### Wygenerowane trasy – osobny ekran (`index.html`, `style.css`, `main.js`)
- Ekran `scr-routes` (menu: „Wygenerowane trasy” obok „Generatora tras”): lista tras (przewijana), import, eksport
  zaznaczonych; przejścia „Generator tras →” i z generatora „Wygenerowane trasy →”; upuszczone pliki tras otwierają ten
  ekran. Generator – dwie kolumny (nowa trasa, przebieg z wyższym dziennikiem).
- Wiersz trasy: zaznaczenie, nazwa i długość, przyciski po prawej (Wybierz, Kontrola, Horyzont, Usuń).

## 0.36.0 – 16 października 2026

Semafory dla pociągów z przeciwka na mijankach.

### Ruch na linii: semafory pociągów z przeciwka (`traffic.js`, `world.js`, `real-env.js`, `scene.js`)
- `traffic.js`: miejsce oczekiwania na odcinek jednotorowy – semafor `SIG_GAP` = 60 m od końca odcinka (przed rozjazdem),
  czoło 12 m przed nim (`HOLD_GAP`; dawniej 30 m od odcinka, przy zwrotnicy); osobowy po postoju przy peronie tej mijanki
  (do 500 m przed semaforem) czeka przy peronie; `oppSignal(k)` – „go”, gdy odcinek przydzielono pociągowi przed
  semaforem.
- Świat: semafory (ten sam model, obrócony, tabliczka D1, D2…) przy końcach odcinków jednotorowych, przy torze mijanki
  (`envLaneNear` – wspólne z rysowaniem pociągów z przeciwka), na zewnątrz od toru; światło zielone albo czerwone wg
  `oppSignal`.
- Test (`traffic.test.js`): czekający pociąg z przeciwka – przed semaforem (który pokazuje „stój”), przy peronie albo
  w kolejce za innym.

## 0.35.1 – 16 października 2026

Poprawki po przeglądzie trasy warszawskiej: hala Dworca Centralnego, przystanek Warszawa Ochota.

### Trasy z mapy: poprawki (`real-env.js`, `osm-route.js`)
- Budynki z mapy nad osią toru: w tunelu (`envTunnelK` > 0,5) bez reguły „hala peronowa” (sam dach na słupach) –
  zwykła bryła ze ścianami.
- Stacje innych linii (`otherLine`): także węzeł do 8 m od obcego toru, gdy nasz jest dalej niż 9 m i co najmniej 4 m
  dalej (dawniej tylko przewaga ponad 15 m); uwaga PKP PLK o brakującym przystanku pomijana dla stacji innej linii.

## 0.35.0 – 16 października 2026

Przegląd trasy Warszawa Wschodnia – Warszawa Zachodnia: tunel średnicowy, tory i perony pod ziemią, ulice nad tunelem.

### Trasy z mapy: miasto nad tunelem (`osm-route.js`, `real-env.js`, `scene.js`)
- Tory w tunelach (bit 16 w `env.t`): długi tunel – w tunelu naszej linii do 40 m od osi (poza nim pominięty); tory pod
  ziemią według danych bez długiego tunelu (layer < 0, krótki tunel, location=underground – robocza flaga 32) – pomiar
  NMT na torze i 12 m po bokach: wykop (oś ponad 2,5 m niżej niż wyższa strona) zostaje, przykryte ciągi od 60 m – tunel
  (w naszym tunelu bit 16, poza nim pominięte); każdy tor we wnętrzu naszego tunelu (od 20 m za portalami, do 45 m od
  osi) – bit 16. Bez siatki terenu – tylko reguła wnętrza tunelu.
- Świat: tory z bitem 16 na poziomie naszej linii (bez pomiaru, bez kształtowania terenu, dróg i wiaduktów, bez słupów
  sieci, wagonów i oświetlenia bocznic); `envTrackY` w obrębie obudowy tunelu – poziom naszej linii (perony, wagony,
  kozły, rozjazdy, ruch na innych torach). Obudowa (`envTunnelSides`) obejmuje tory i perony w tunelu; wysokość stropu
  (`envTunnelH`) wg przykrycia: 0,8 m pod terenem, 5,2–6,2 m (hala 7 m), teren nad stropem co najmniej 0,35 m.
- Perony: metro i tramwaj pominięte (także relacje); perony podziemne w tunelu naszej linii (do 45 m) zachowane, bez
  pomiaru NMT – w grze na poziomie torów, z halą (`envTunnelPlatforms`, `envHallK`), nazwą ze stacji innej linii
  (`env.os` – stacje pominięte przez generator); hala – osobny materiał z poświatą (bez posadzki).
- Generator: ulice nad wnętrzem tunelu bez odstępu od osi (`lineRuns` – `tunFree`), budynki nad tunelem dopuszczone;
  obniżenia z pomiaru (mosty) przycinane do portali; stacje w tunelu bez pomiaru NMPT; uwagi PKP PLK zgłaszane po
  utworzeniu listy uwag (dawniej błąd „issue before initialization” i trasa bez danych PLK).
- AO (`scene.js` `camInTunnel`) wyłączone, gdy kamera jest we wnętrzu tunelu.
- Test (`real-route.test.js`): tor w tunelu wspólnym, łącznica bez znacznika tunelu, WKD przykryta poza tunelem, tor
  w wykopie, peron metra, peron innej linii w tunelu, `env.os`.

## 0.34.0 – 16 października 2026

Stacje podziemne na trasach z mapy.

### Stacje podziemne (`world.js`, `real-env.js`, `freecam.js`)
- Rozpoznanie (`envUnderground`): trasa z pomiarem terenu i środek peronu w tunelu (`envTunnelK` > 0,5).
- Obudowa (`buildEnvTunnel`, `envHallK`): w obrębie peronu (± 6–12 m) zamiast sklepienia płaski strop 7 m z małymi fazami,
  kolory hali (płytki, cokół, strop); pasy świetlówek (instancje) nad osią peronu i torami; bez lamp tunelowych w hali.
  Posadzka obudowy (osobny pas 0,55 m pod główką szyny) w całym tunelu. Szerokość wnętrza – `envTunnelSides`.
- Stacja (`buildStation`): bez latarń, wiat i dworca z gry; pas peronu do ściany hali, tablice z nazwą na ścianie co 30 m;
  oprawy pod stropem (`userData.always`) – w puli świateł także w dzień, bez mapy nocnej (`updateLamps`); dwa biegi
  schodów (1/4 i 3/4 peronu, do stropu, bez ławek i gablot na nich; wąski peron wyspowy < 5 m – bez schodów), pawilony
  na terenie z pomiaru nad wyjściem schodów; wyjście pasażerów u stóp schodów.
- Kamera swobodna (`freeTunnel`): w tunelu poniżej stropu – podłoga, strop i ściany zamiast terenu.
- Poprawka: maska jezdni kawałka nie liczy się rekurencyjnie (tor z mapy w strefie stacji podziemnej → teren →
  maska); w trakcie jej budowy teren kawałka bez jezdni (`rmBusy`).

## 0.33.0 – 15 października 2026

Generator tras: tunele, stacje innych linii, wykopy (po analizie trasy Warszawa Wschodnia – Warszawa Zachodnia).

### Generator tras: tunele i stacje (`osm-route.js`)
- Tunele: odrzucany tylko krótki (< 80 m) albo krótki przy stacji (< 300 m z końcem w strefie peronów); wyznaczane
  przed otoczeniem (`tunnelRaw`). Z pomiaru NMT: tor co najmniej 7,5 m pod terenem (wymóg rośnie przez 250 m od
  portalu, tylko gdzie teren nie leży poniżej toru), portale przesunięte tam, gdzie teren jest ≥ 3 m nad torem
  (uwaga `tunnel-nmt`), tunel bez przykrycia – usunięty.
- Stacje (`otherKind`, `otherLine`): pomijane metro, kolej lekka, tramwaj (tagi węzła) i stacje, których najbliższy tor
  nie należy do przebiegu, jest wyraźnie bliżej i ma inny numer linii (`ref`); uwaga `station-other`.
- Wykop a most: przy obniżeniu względem przebiegu toru dodatkowy pomiar NMT 12 i 20 m po obu stronach – teren wyżej
  niż oś (o ponad 1,5 m) to wykop (uwaga `cut-nmt`), bez mostu.
- Obiekty przy tunelu: ulice przecinające oś nad tunelem – zwykłe drogi (bez wiaduktu, bez przerwy przy osi), tory
  przecinające nasz w tunelu pominięte, bez automatycznych wiaduktów w tunelu; tory w długich tunelach tylko do 6,5 m
  od osi, perony podziemne dalej niż 9 m od osi – pomijane.
- Świat (`real-env.js` `buildEnvTunnel`, `envTunnelK`): na trasach z pomiarem terenu obudowa tunelu (ściany,
  sklepienie, lampy co 30 m, poszerzenie przy peronach) budowana w kawałkach świata, portale do terenu; nad tunelem
  teren z pomiaru także przy osi i nad stacją podziemną, ulice nad osią.
- Test (`real-route.test.js`): linia z tunelem i przystankiem w nim, stacja metra, stacja innej linii, ulica nad
  tunelem, wykop i dolina w NMT – poprzednia wersja generatora go nie przechodzi.

## 0.32.0 – 15 października 2026

Etap D – wydajność po etapie 11 (odłożone scalanie modelu pociągu gracza, atlas tablic).

### Wydajność (etap D – po etapie 11)
- Bryły cieni (`train.js` `shadowProxies`, `shadowMerge`): pociąg gracza – jedna scalona bryła na wagon i na pantograf
  (przebudowywana przy ruchu), rysowana tylko w mapach cieni (`onBeforeRender` – zakres 0, `onBeforeShadow` – pełny);
  cienie pociągu 510–780 → 5–8 wywołań na klatkę.
- Scalanie pociągu gracza (`compactPlayer`): ruchome podgrupy (skrzydła drzwi, zestawy kołowe, ramiona wycieraczek,
  pantografy – też w `setPanto`) scalane każda wewnątrz siebie, reszta wagonu poza nimi, wnętrzem (`room`) i LOD.
- Wspólne materiały taboru (`vcConvert`): kolor, chropowatość i metaliczność w wierzchołkach (`color`, `aRM`), jeden
  materiał na wariant łatki – pociąg gracza i pociągi tła (`compact`); wagon tła ok. 58 → 37 siatek.
- Atlasy (`real-env.js`): szyldy budynków (`signCell` – strony 1024 × 1024), znaki A-7/D-1/D-6/B-18 z tyłami
  (`signAtlas`), studzienki i kratki (`roadWearFlush`) – jedna siatka na kawałek (`quadMesh`).
- Pociągi tła (`compact`): bryły cieni na wagon (`shadowProxies` – też dla pociągów tła; tylko najdokładniejszy poziom
  szczegółów, dawniej wszystkie naraz), zabrudzenie bazowe w wierzchołkach (`aRM.z` zamiast stałej w shaderze – części
  zestawu kołowego jedną siatką); EU07 + 4 wagony przy stacji: ok. 410 → ok. 150 wywołań (cienie 256 → 7).
- Wnętrze kabiny (`cab.js`): części o wspólnym materiale scalone (151 → 46 siatek, ok. 150 wywołań rysowania mniej
  w widoku z kabiny), nastawnik i kran hamulca – każdy wewnątrz siebie; porównanie: perfOpt `{"cabMerge":false}`.
- Zasłona słońca w kabinie (`scene.js` `sunOccluder`): nieprzezroczyste trójkąty do 6,5 m od oka w kostkach 1,5 m –
  promień ok. 0,6 ms (dawniej cały wagon, ok. 7 ms co 4. klatkę).
- Pomiar (Gliwice, dzień, średnia): kabina 14,7 → 11,1 ms procesora, 1047 → 874 wywołania; widok zza pociągu
  ok. 13,4 → 9,4 ms, 1761 → 723 wywołania.

### Menu
- Ustawienia w zakładkach (jak w Pograniczu, wygląd jak zakładki gry jednoosobowej): Dźwięk (głośność, grupy
  dźwięków), Zapowiedzi (tryb, głos – silnik, głos, tempo, wysokość, głośność), Grafika (jakość, renderer, pociągi tła);
  pod nazwą podsumowanie, ostatnia zakładka zapamiętana (`setTab`), okno stałej wysokości.

## 0.31.0 – 15 października 2026

Etap 11 – zima w symulacji.

### Zima w symulacji (etap 11)
- Zdarzenie `frozen` (`scenario.js`, `sim.freezeSignal`, `checkFrozen`): semafor „stój” przez `duration` s od zbliżenia
  się pociągu w ruchu na 1,5 km; komunikaty dyżurnego (zamarznięta, rozmrożona); w zapisie gry (pola 5–6 semafora).
  W zdarzeniach losowych zimą (50 %, semafor wjazdowy albo ostatni przed stacją), też w zadaniu dnia.
- Oblodzona sieć (`icePatches`, `updateIce`): zimą, pojazd elektryczny – odcinki 300–1200 m; przerwy w styku
  0,1–0,35 s bez siły pociągowej, zdarzenie `iceArc` (iskry `trainModel.iceArc`, dźwięk `spark`), komunikat raz na odcinek.
- Testy: zamarznięta zwrotnica na trasach testowych, losowanie zimą, odcinki i łuki oblodzonej sieci.

## 0.30.0 – 15 października 2026

Etap 11 – zima w ruchu.

### Zima w ruchu (etap 11)
- Wzbijany śnieg (`weather.js` `updateKick`, `setTrain`): bufor cząstek (2400 × jakość) liczony na procesorze; emisja
  przy wózkach wagonów do 160 m od kamery i przed pługiem czoła, siła wg pokrywy (`snowGround`) i prędkości (10–60 km/h).
- Szron (`train.js` `WET_FRAG`, `uFrost`, `uDefrost`): kryształki z żyłkowanego szumu; na szybie czołowej odmrażanie od
  osi wycieraczek do końca pola wycieraczek (ok. 1 min), boczne – płaty; `frostTarget` z pory roku (scene.js).
- Zaspy (`World.driftMesh`, `driftMat` – wysokość `aDrift` obniżana w shaderze przy małej pokrywie): wały na ramionach
  podsypki (`buildTrackDrifts`, przerwy na stacjach, przejazdach, mostach, przy innych torach, rozjazdach, drogach) i pod
  ścianami budynków od strony wiatru (`buildEnvBuildings`).
- Szadź: kolor przewodów (`World.wireMat`) zimą wg pokrywy, nocą przygaszony.
- Wiosna (`Weather.melting`): pokrywa 0,3 na starcie, topnienie ok. 8 min, mokra nawierzchnia.

## 0.29.0 – 15 października 2026

Etap 11 – noc.

### Noc (etap 11)
- Mapa światła nocnego (`World.updateNightMap`): kanwa 1024 × 512 – plamy wszystkich lamp w promieniu ok. 256 m od
  kamery (lewa połowa) i same oprawy (prawa), co 0,5 s albo po przesunięciu o 16 m; uniformy `uNightTex`, `uNightBox`,
  `uNightK` we wspólnym `U`.
- Shader (`NIGHT_GLSL` po `emissivemap_fragment`): światło z mapy × kolor podłoża (powierzchnie w górę w pełni, ściany
  częściowo); odbicia opraw w mokrym – promień odbity do wysokości 6,5 m, 8 próbek co 1,8 m po ziemi (smuga).
- Barwa i zasięg lampy (`userData.tint`, `reach`); dawne plamy-nalepki wyłączone, światła punktowe słabsze (34).
- Łuna miasta (`sky.js` `cityGlow`): wg liczby latarni w okolicy (`world.urban`), mocniejsza przy zachmurzeniu i mgle;
  pas nad horyzontem, spody chmur, mgła; gwiazdy przyćmione.

## 0.28.0 – 15 października 2026

Etap 11, krok G5 – część 4 (ulice) i drobne zmiany.

### Ulice (etap 11, G5 – część 4)
- Znaki pionowe (`real-env.js` `streetFurnFlush`, tarcze z kanwy `streetSign`): A-7 na wlotach podporządkowanych (przy
  linii warunkowego zatrzymania), D-1 ok. 14 m przed skrzyżowaniem na części wlotów drogi z pierwszeństwem, D-6 przed
  zebrami po prawej stronie obu kierunków; słupek `post()` – na chodniku 1,1 m za krawężnikiem albo 0,55 m od jezdni.
- Sygnalizacja (`junctionLights`, `junctionGroups`, `tlState`): skrzyżowania z co najmniej dwoma wlotami dróg
  wojewódzkich lub ważniejszych i trzema powiatowymi (75 % – stale dla węzła); przejścia z `crossing=traffic_signals`
  z mapy (`zByChunk` – flaga `sig`). Fazy: wloty naprzeciw siebie razem, cykl 60 s z czerwonym+żółtym; soczewki – kolor
  egzemplarza (`updateTLights`, typ `tlights` w `updateDyn`); linia zatrzymania P-14 na wlotach z sygnalizacją.
- Latarnie (`lampGeo`, `envLampMeshes`): bryła scalona (cokół, słup stożkowy, wysięgnik `TubeGeometry` po łuku, oprawa),
  typ `main` (8,6 m, LED) przy drogach do powiatowych i na obiektach, `res` (6,4 m, kopułka) na osiedlowych.

### Pozostałe
- Pora roku w pauzie (`sim.setSeason`, `renderer.reseason`) i kafelki pory roku w zakładce Warunki (`SEASON_SKY`).
- `npm run web` (`tools/web.js`): folder `web/maszynista/` i `web/maszynista-<wersja>.zip`.
- Śnieg (`WEATHER_GLSL`): wzór płatów z szumu gradientowego `gPerlin` (4 skale, obrócone, bez kierunku siatki),
  `gHash` bez sinusa; `patch(…, { noSnow })` – ludzie bez śniegu.

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
