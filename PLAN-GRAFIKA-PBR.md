# Plan: grafika PBR – etap 1 (gałąź `grafika-pbr`)

Cel: wyraźny skok jakości obrazu w stronę Trainz/SimRail bez zmiany sposobu budowy świata z danych (OSM, BDOT, NMT).
Etap 1 obejmuje cztery rzeczy: materiały PBR budynków, tekstury terenu i nawierzchni, detal toru, TAA.
Priorytet: wersja Electron (zasoby z dysku); przeglądarka dostaje te same zasoby w mniejszej rozdzielczości.
Tekstury: skany CC0 z ambientCG i Poly Haven (bez wymogu przypisania, wolno je dołączyć do gry).

## Stan wyjściowy (z kodu)

- **Żadnych plików graficznych.** Wszystkie tekstury powstają w kodzie (`CanvasTexture`, `DataTexture`): fasada z
  oknami (canvas 512², `real-env.js` 167–299), atlas liści (`props.js`), szyldy, normalne wody. Nie ma
  `TextureLoader`, KTX2 ani folderu z teksturami.
- **Budynki** (`real-env.js` `buildEnvBuildings` 5819–6178): na kawałek trzy scalone siatki – `facade` (z UV: metry/12),
  `plain` (cokół, gzymsy, balkony, kominy – UV zerowe), `roof` (UV zerowe, wzór dachówki/papy w shaderze `ROOF_GLSL`).
  Kolory ścian i dachów w kolorach wierzchołków z tabel `WALLS`/`ROOFS`/`USE_WALL`. Rodzaj budynku (dom, blok, hala,
  usługi, kościół, garaż, dworzec, stadion), wysokość i kształt dachu są w danych trasy (`env.b`).
- **Teren** (`world.js` `ribbonRows`, wiersze co 4 m, kawałki 200 m): bez UV; wagi materiałów `aMat` (trawa, piasek,
  ziemia) i `aRow` (rzędy pola); wzór proceduralny `groundPattern` (WebGPU) / `GROUND_GLSL` (WebGL). Klasy
  zagospodarowania z rastra (13: las liściasty/iglasty, park, łąka, pole, zabudowa, przemysł/kolej, handel, cmentarz,
  woda, boisko…) – dziś sprowadzane do 3 materiałów.
- **Drogi i perony**: osobne materiały (`'road'`, `'platform'`, `'concrete'`) z rodzajem nawierzchni w danych
  (asfalt, kostka, płyty betonowe, gruntowa; płyty peronu z pasem dotykowym).
- **Tor jest już geometrią**: szyna z profilem (stopka, szyjka, główka), podkłady jako `InstancedMesh` co 0,6 m,
  przytwierdzenia ×4 na podkład; tory z mapy – uproszczona szyna i podkłady co 0,65 m (drewniane na bocznicach).
  Brakuje tekstur (beton podkładu, tłuczeń, rdza boku szyny) i detalu z bliska, nie samej geometrii.
- **Obraz** (`post-gpu.js`): scena → AO → bloom → promienie → wykończenie → FXAA → wyostrzanie. Bez bufora ruchu,
  historii klatek i drgania kamery. W `vendor/three/addons/tsl/display` są już `TRAANode.js` i
  `TemporalReprojectNode.js`, ale pakowanie (`package.json` build.files, `tools/web.js`) przepuszcza z addons tylko
  `FXAANode.js`.

## 1. Infrastruktura zasobów (pierwszy krok, bez zmian w wyglądzie)

- Folder `textures/` z podfolderami wg rodzaju (`wall/`, `roof/`, `ground/`, `road/`, `track/`).
- Format: **KTX2** (Basis Universal) – kolor w ETC1S, normalne i mapy ORM (AO, chropowatość, metaliczność w kanałach
  R/G/B) w UASTC. Karta dostaje skompresowane BC7 (Windows) – ok. 4× mniej pamięci niż PNG. Konwersja skryptem
  `tools/textures.js` (narzędzie `basisu`/`toktx` – do instalacji lokalnie, nie w grze).
- Loader: `KTX2Loader` z three (addons + transkoder `basis_transcoder.wasm` w `vendor/`), cache tekstur we wspólnym
  module (`js/3d/textures.js`), anizotropia 16, mipmapy z pliku.
- **Tablice tekstur** (`DataArrayTexture`/KTX2 array) zamiast wielu osobnych: jedna tablica kolorów i jedna ORM+normal
  na rodzinę (ściany, dachy, grunt, nawierzchnie). Materiał wybiera warstwę atrybutem wierzchołka – mało próbników
  (dziś na materiał przypada już mapa nocna, cień chmur i 3 kaskady cieni).
- Serwowanie: MIME `.ktx2`/`.wasm` w `server.js` i `electron/assets.js`; `textures/` w `tools/web.js` (DIRS) i w
  `package.json` build.files; addons: `KTX2Loader`, `TRAANode`, `TemporalReprojectNode` w wyjątkach pakowania.
- Ustawienie **„Tekstury: niskie / średnie / wysokie”** (1k / 2k / 2k + detal z bliska) – wzorem `set-water`:
  tabela `TEXQ` w `scene.js`, `over.tex` w `setQuality`, wybór pliku o danej rozdzielczości przy wczytaniu.
- Bez tekstur (brak plików, błąd wczytania, jakość niska w przeglądarce) – obecne wzory proceduralne jako zapas.

## 2. Budynki

- Warstwy ścian (tablica): tynk gładki, tynk szorstki/baranek, cegła czerwona, cegła klinkier/żółta, wielka płyta
  (bloki), beton, blacha falista (hale), drewno (szopy, altany). Wybór: rodzaj budynku + funkcja (`env.bu`) + hash
  (jak dziś kolor). Kolor z tabel `WALLS` zostaje jako zabarwienie tekstury – różnorodność bez nowych plików.
- Okna: obecny canvas okien zostaje jako maska (szyby, ramy, firanki, światło nocą) nakładana na teksturę ściany;
  ramy i szyby dostają osobne PBR (szkło gładkie z odbiciem nieba, rama matowa).
- Dachy: dachówka ceramiczna, blachodachówka, papa, blacha trapezowa, eternit (stare domy). UV dachu z rzutu na
  płaszczyznę połaci (dziś zerowe), wzór `ROOF_GLSL` zastąpiony teksturą (mech i zabrudzenie – nadal w shaderze).
- Cokół, gzymsy, attyki, kominy (`plain`): UV z pozycji (rzut wg osi ściany), tekstury jak ściany w ciemniejszym
  odcieniu; cokół – beton/kamień.
- Zmiana generatora tylko w `buildEnvBuildings` (UV i atrybut warstwy) – dane tras bez zmian, trasy nie wymagają
  ponownego generowania.

## 3. Teren i nawierzchnie

- UV terenu z pozycji świata (xz) – bez zmiany siatki. Tablica gruntów: trawa (2 odmiany: łąka i krótka), ściółka
  leśna, ziemia/pole orane, żwir/tłuczeń (tereny kolejowe, przemysł), piasek (brzegi), błoto/klepisko (polne drogi).
- Mapowanie klas rastra: łąka, park, boisko, cmentarz → trawa; pole, działki → ziemia z rzędami (dzisiejsze `aRow`
  zostaje jako modulacja); lasy → ściółka; przemysł/kolej → żwir; zabudowa/handel → krótka trawa z wydeptaniem;
  woda (brzeg) → piasek. Atrybut z 2 indeksami warstw + waga (zamiast dzisiejszych 3 wag) – płynne granice klas.
- Przeciw powtarzaniu: próbka w dwóch skalach z obrotem, zmienność makro z istniejącego szumu (`gFbm`), z daleka
  przejście do koloru z danych (jak dziś) – bez „kafelków” widocznych z wysokiej kamery.
- Drogi: asfalt (świeży/spękany), kostka granitowa, płyty betonowe (trylinka), gruntowa – wg `SURF_C`; oznakowanie
  poziome zostaje w shaderze. Perony: płyty chodnikowe 50×50, beton, pas dotykowy (żółte płytki z wypustkami).
- Wilgoć i kałuże z obecnego shadera działają na nowych materiałach (chropowatość z mapy ORM × mokrość).

## 4. Tor (detal i tekstury – geometria już jest)

- Podkład strunobetonowy: tekstura z zabrudzeniem i obiciem krawędzi; drewniany (bocznice) – drewno z pęknięciami.
- Tłuczeń: skan żwiru/tłucznia z mapą normalnych i wysokości zamiast wzoru `'gravel'`; ciemniejszy pas między
  szynami (olej, rdza) z obecnego `ballastTint` jako zabarwienie.
- Szyna: bok i stopka – rdza (tekstura), główka – wypolerowany metal (już jest; zostaje min. 1 piksel szerokości).
- Tory z mapy w zasięgu ~150 m: szyna z profilem jak tor gracza (dziś 4 kolumny); dalej jak dziś.
- Poza etapem 1: rozjazdy jako modele (iglice, krzyżownice), kable, opornice.

## 5. TAA (tylko WebGPU)

- Drganie kamery co klatkę (ciąg Haltona, przesunięcie o ułamek piksela – `camera.setViewOffset`/macierz rzutowania),
  bufor ruchu (MRT `velocity` z TSL) w przebiegu sceny, historia poprzedniej klatki z ograniczeniem kolorem sąsiadów
  (`TRAANode` z three jako podstawa, dopasowany do naszego łańcucha: AO i mgła liczone na obrazie po rekonstrukcji).
- Zastępuje FXAA przy włączonym wygładzaniu; po TAA nadal wyostrzanie (TAA lekko rozmywa).
- Ryzyka: smugi za szybko ruchomymi obiektami (pociąg, auta) i przezroczystościami (deszcz, śnieg, woda) – obiekty
  przezroczyste rysowane po TAA albo z maską reaktywności; paczki rysowania (BundleGroup) muszą zapisywać prędkość
  (macierze z poprzedniej klatki) – do sprawdzenia w pierwszej kolejności, bo od tego zależy wykonalność.
- Ustawienie „Wygładzanie: wyłączone / FXAA / TAA”.

## Budżet

| | niskie | średnie | wysokie |
|---|---|---|---|
| Rozdzielczość tekstur | 1k | 2k | 2k + detal z bliska |
| Pliki na dysku (ok. 30 materiałów) | ~25 MB | ~90 MB | ~110 MB |
| Pamięć karty (BC7, z mipmapami) | ~60 MB | ~230 MB | ~260 MB |
| Koszt klatki (cel) | ≤ +5% | ≤ +10% | ≤ +15% (z TAA) |

Liczby z wyliczenia na ok. 30 materiałów × 3 mapy; do potwierdzenia po konwersji pierwszych plików.

## Próba i ocena

- Miejsca: **Poznań Główny** (dworzec, perony, kamienice, bloki, tory stacyjne) i **szlak za Mosiną** (pola, las, łąki,
  tor szlakowy). Te same ujęcia (zapis gry + stała kamera) przed i po – zrzuty obok siebie.
- Pomiar FPS w przeglądarce na jakości średniej i wysokiej, przed i po (bez Electrona).
- Akceptacja przez Ciebie po każdym kroku, zanim przejdę do następnego.

## Postęp

- **WebGL nie jest rozwijany** (decyzja 2026-10-26): grafika tylko w WebGPU; tryb WebGL zostaje taki, jaki jest
  (wzory proceduralne, bez tekstur z plików, bez TAA).

- **Krok 1 – gotowy** (bez zmiany wyglądu): `js/3d/textures.js` (spis, KTX2 i WebP/JPG/PNG, jakość, zapas
  proceduralny), ustawienie „Tekstury – jakość”, `tools/textures.py` (zestawy ambientCG/Poly Haven → WebP 1k/2k,
  ORM), loader KTX2 i transkoder w `vendor/`, MIME i pakowanie. Zestawy próbne (CC0, ambientCG): `ground/grass`
  (Grass005, kafel 2,5 m), `ground/gravel` (Gravel040, 2 m), `paving/concrete-slabs` (Concrete008, płyty 50 cm) –
  15 MB w WebP (ok. 5 MB na zestaw – więcej niż szacunek; KTX2 po instalacji KTX-Software zmniejszy i pliki, i pamięć
  karty). Wczytywanie sprawdzone w przeglądarce (1k i 2k); ścieżka KTX2 – jeszcze bez pliku do próby.
- **Krok 3 – pierwsza część (WebGPU)**: teren – trawa (waga trawy) i żwir (ziemia) z plików, zabarwione kolorem terenu
  z danych (tekstura / średni kolor zestawu), druga próbka w obróconym układzie przeciw powtarzaniu, normalne
  i chropowatość z map, z daleka (90–420 m) częściowo; wierzch peronów – płyty betonowe. Wspólne węzły tekstur
  (`nodes.js` pbrSet, bindTextures) z teksturą zastępczą; po wczytaniu / zmianie jakości przebudowa tylko materiałów
  terenu i peronów (numer generacji tekstur w kluczu shadera – sama podmiana tekstury nie docierała do paczek).
  Sprawdzone: Mosina, start bez tekstur i włączenie w trakcie jazdy, wyłączenie z powrotem; bez spadku FPS (62).
  Druga część: 9 zestawów (ambientCG CC0): asfalt i spękany asfalt, kostka granitowa, polbruk (behaton), płyty
  z fugami, ziemia orna, ściółka, piasek, droga gruntowa – razem 12 zestawów, 56 MB WebP. Teren: atrybut aLand
  (udział lasu, pola, terenu kolejowego – envTerrainMat / terrainMat), pięć warstw gruntu. Drogi: nawierzchnia z koloru
  wierzchołków (asfalt / kostka kamienna / polbruk i płyty / gruntowa), asfalt przeplatany plamami spękanego.
  Tekstury w tablicach rodzin (grunty, drogi, płyty – po 3 tekstury i 3 samplery w shaderze): samplerów WebGPU jest
  sprzętowo 16 na etap, osobne tekstury pięciu zestawów przekraczały limit razem z mapami cieni, nocy i chmur.
  Zostało: perony – wybór płyt (gładkie Concrete008 albo z fugami), tablice z plików KTX2.
- **Krok 4 – budynki (WebGPU)**: 11 zestawów CC0 (ambientCG): ściany – tynk gładki i szorstki, cegła czerwona,
  stara i jasna, beton, blacha falista, deski; dachy – dachówka czerwona i grafitowa, blacha trapezowa (papa – zestaw
  spękanego asfaltu); razem 83 MB WebP. Warstwa ściany per budynek (real-env.js envWallLayer – rodzaj, przeznaczenie,
  wysokość, ceglasty kolor elewacji) w atrybucie aSurf; okna z obecnej fasady (maska w alfie tekstury fasady),
  ściana spod tekstury; dach – rodzaj z koloru i nachylenia; współrzędne na płaszczyźnie ściany / połaci (rzędy
  wzdłuż okapu), cokoły i gzymsy bez UV – rzut na płaszczyznę. Metaliczność z tekstur (gMetal). Tablice tekstur
  w orientacji GL (wcześniej odwrócone w pionie). Narzędzie: kafle 2:1 powtarzane do kwadratu, --rotate 90.
  Sprawdzone: Mosina – dworzec z cegły z oknami, dachówka; bez błędów, FPS bez zmian.
- Wersja na tej gałęzi bez podnoszenia – jeden wpis zbiorczy przy scalaniu do `webgpu`.

## Kolejność prac

1. Infrastruktura: loader KTX2, `textures.js`, MIME, pakowanie, ustawienie „Tekstury”, skrypt konwersji – na 2–3
   próbnych materiałach.
2. Pobranie zestawu tekstur – **lista plików do Twojej akceptacji przed pobraniem** (nazwy z ambientCG/Poly Haven,
   rozmiary, licencja CC0).
3. Teren i nawierzchnie (największa powierzchnia obrazu).
4. Budynki (ściany, dachy, okna).
5. Tor (tłuczeń, podkłady, szyny z mapy).
6. TAA (najpierw próba wykonalności z paczkami rysowania).
7. Zrzuty przed/po, pomiar FPS, poprawki.

## Do decyzji później

- Czy przeglądarka dostaje tekstury od razu (1k), czy na początek zostaje przy wzorach proceduralnych.
- Etap 2: biblioteka modeli glTF (wiaty, nastawnie, latarnie, ogrodzenia, ekrany), roślinność z modeli, IBL z nieba,
  GTAO, odbicia ekranowe, tabor i kabina.
