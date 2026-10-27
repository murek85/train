# Plan: grafika – etap 2 (gałąź `grafika-pbr`)

Zakres (decyzje 2026-10-26): roślinność z modeli, oświetlenie i obraz, biblioteka obiektów. Tylko WebGPU (WebGL nie
jest rozwijany). Modele: CC0 (Poly Haven, Kenney), CC-BY (Sketchfab – z listą autorów w grze) i budowane w kodzie.
Budżet: do −15% FPS na jakości wysokiej; nowe efekty wyłączalne, średnia i niska prawie bez zmian.

## Stan wyjściowy (przegląd kodu)

- **Roślinność** (`props.js`, `world.js` buildTrees): korony z kart liści na atlasie rysowanym w kodzie (dąb, brzoza,
  topola, sosna, świerk, krzew), wersje hi / lo wg odległości (170 m × zasięg), instancje w kawałkach 200 m,
  na trasach z mapy rozmieszczenie i wysokość z NMPT (korony). Z daleka „masy lasu” – powiększone bryły lo (150–520 m),
  bez cienia; brak impostorów. Trawa: kępki 10 źdźbeł (11 000 × gęstość na kawałek, do 54 m). Pory roku – kolory,
  atlas zimowy, liście jesienią. Pojedyncze drzewa i szpalery z OSM nie są pobierane.
- **Oświetlenie** (`scene.js`, `nodes.js`): słońce z 3 kaskadami cieni, HemisphereLight, mapa otoczenia (PMREM) – sam
  gradient nieba, ciemniejszy grunt i plama słońca, bez chmur i świata, odświeżana co 2 s przy zmianie koloru.
  AO: SSAO w połowie rozdzielczości (16 próbek, normalne z pochodnych głębi) mnożone przez **cały** obraz (także
  światło słońca – przyciemnia oświetlone ściany i ziemię). Odbicia: woda (reflector), mokre nawierzchnie – sama mapa
  otoczenia i światła latarń z mapy nocnej; brak odbić ekranowych. Noc: latarnie świecące + 8 świateł punktowych
  przy kamerze + plamy światła na mapie nocnej.
- **Obiekty**: wszystkie w kodzie (wiaty, ławki, latarnie, semafory, przejazdy, tablice, znaki, przystanki). Na trasach
  z mapy brak płotów i ekranów akustycznych; nastawnia = zwykły budynek. Nie ma GLTFLoadera ani modeli. OSM nie
  dostarcza dziś latarń (highway=street_lamp), barier (barrier=*), ławek i wiat jako punktów, drzew i szpalerów,
  kozłów oporowych.

## Kroki (każdy osobno, z akceptacją)

1. **Światło otoczenia (IBL).** ✅ (scene.js) Niebo mapy otoczenia szarzeje z zachmurzeniem (dawniej tylko
   z zamgleniem – pod pełnym zachmurzeniem odbicia i światło rozproszone były niebieskie), dolna półkula i grunt
   HemisphereLight w kolorze terenu wokół kamery (`envGround`: 25 punktów world.terrainColor, oświetlone słońcem
   i niebem), odświeżanie co 0,5 s o świcie i zmierzchu (co 2 s w dzień i w nocy). Koszt: pomijalny.
   Kopuła z chmurami w PMREM – odłożone (chmury w odbiciach mało widoczne, koszt renderu do sześcianu).
2. **AO tylko na świetle rozproszonym + lepsza okluzja (GTAO).** ✅ (post-gpu.js, scene.js) AO w materiałach
   (renderer.contextNode – builtinAOContext) jako okluzja światła rozproszonego zamiast mnożenia całego obrazu –
   słońce na ścianach i ziemi bez szarego nalotu. Bez przebiegu wstępnego głębi: okluzja z poprzedniej klatki
   z reprojekcją (macierz tamtej klatki, zgodność odległości; obiekty jadące z kamerą – to samo miejsce ekranu;
   odbicie wody – bez okluzji). GTAO: 3 przekroje × 2 strony × 6 kroków w połowie rozdzielczości, normalna z głębi
   po stronie ciągłej (bez aureol). Przy okazji: światło odbite od ziemi z natężenia słońca i nieba (envGround) –
   spody wiat, wagonów i trawy w cieniu nie są już czarne. Koszt: ok. −4% FPS względem wyłączonego AO.
3. **Odbicia ekranowe (SSR) – jakość wysoka.** ✅ (post-gpu.js, nodes.js) Maska odbicia (gładkość × Fresnel)
   z materiałów PBR w kanale alfa obrazu sceny (renderer.contextNode – getOutput; bez MRT), marsz promienia po
   głębi w połowie rozdzielczości (24 kroki + 4 połowienia), wygaszanie przy brzegach kadru, z odległością i ku
   kamerze; wykończenie zastępuje część koloru kolorem odbitym. Szyby okien elewacji gładkie (chropowatość 0,06).
   Na suchych matowych nawierzchniach bez zmian. Koszt: ok. −5% FPS (tylko jakość wysoka).
4. **Drzewa z modeli.** Częściowo ✅ (trees.js, vendor/ez-tree, world.js; tylko WebGPU – WebGL dawne korony):
   - ✅ EZ-Tree (MIT): 6 gatunków (dąb, brzoza, topola, świerk, sosna, krzew) × 2 warianty, wersja bliska ok. 2–4 tys.
     trójkątów, z daleka 0,7–1,5 tys. (bez najcieńszych gałązek); kora textures/bark (CC0), karty gałązek z atlasu
     textures/foliage (tools/foliage.py – liście ambientCG CC0 złożone w gałązki, zima – nagie gałązki).
   - ✅ Impostory dalekich lasów: gatunki wypalone z 3 stron przy starcie (w tle), 3 skrzyżowane płaszczyzny; każda
     dawna „masa lasu” to kępa 5 drzew (iglasty / liściasty / mieszany wg zagospodarowania).
   - Przy okazji: chmury (clouds-gpu.js) – NaN w historii akumulacji zostawał na zawsze (czarna plama nieba).
   - ✅ Drzewa i szpalery z OSM (natural=tree, tree_row): generator – env.vt (s, d, gatunek, wysokość), tryb
     `--trees-only` (dopisanie do istniejących tras bez zmiany reszty pliku, stałe przesunięcie kilometrażu
     przeliczane); gra – drzewa w swoim miejscu, losowe nie bliżej niż 5 m.
   - Przy okazji: paczki rysowania od nowa po przebudowie buforów efektów (tekstura AO w materiałach – „zniszczona
     tekstura” po zmianie rozmiaru okna).
   - ✅ Trawa z kart (WebGPU): atlas kęp ze zdjęć źdźbeł (tools/grass.py – ambientCG Foliage001 / 003 / 008, CC0),
     3 skrzyżowane karty, dwie odmiany; jaśniejsze liście drzew i impostorów (mnożnik koloru 2,6).
5. **Biblioteka obiektów – infrastruktura.** ✅ GLTFLoader + DRACOLoader (wasm) + dekoder meshopt w vendor/three
   (tools/vendor.js), js/3d/models.js – spis models/index.json (plik, wersja z daleka, autor, licencja, źródło,
   warianty z jednego pliku), siatki scalane wg materiału, materiały przez patch (pogoda), egzemplarze InstancedMesh
   z LOD (World.updateLod), wczytywanie od startu gry; ekran „Autorzy” w menu (biblioteki, tekstury, modele, dane).
   tools/models.js – uproszczenie i kompresja gltfpack (devDependency), faktury 512 / 256 px.
6. **Obiekty z modeli i danych.** ✅ (częściowo)
   - Modele Poly Haven (CC0, 4 MB): latarnie, ławki, kosze, płot, bariera betonowa, hydrant, paproć, pokrzywa, krzew.
   - Rośliny przyziemne w kawałkach (buildPlants): paprocie w lesie, pokrzywy i krzewinki przy torze; pory roku.
   - Generator: bariery (barrier=noise_barrier / wall / fence – env.ba) i punkty (latarnie, ławki, kosze, hydranty –
     env.pt), tryb `--objects-only` (drzewa, bariery, punkty do istniejących tras; odporna kontrola stacji).
   - Gra (buildMapObjects): ekrany z płyt między słupami (przy torze na poziomie toru – estakady), mury, płoty
     z siatki; punkty z modeli. Ławka peronowa zostaje z kodu (wzór PKP, siedzący pasażerowie).
   - ✅ Latarnie z OSM jako latarnie uliczne z kodu (światło nocą, plama światła, wysięgnik ku najbliższej jezdni);
     dawne latarnie co 35 m nie bliżej niż 25 m od nich. Modele latarni Poly Haven – na razie nieużywane.
   - Generator `--trees-only` / `--objects-only`: bez stałego przesunięcia kilometrażu (inna liczba stacji, przebieg
     wygładzony inaczej) – stacje dopasowane po nazwie, kilometraż przeliczany odcinkami (Toruń – Chełmża).
   - Do zrobienia: wiaty z OSM pominięte; Gliwice – Zabrze bez obiektów z mapy (2 stacje, inna odległość);
     Szklarska – Jakuszyce, Warszawa Wschodnia – Zachodnia, Zabrze – Gliwice – do powtórzenia (serwery Overpass
     niedostępne 27.10).
7. **Pomiar i strojenie.** ✅ Przełączniki w ustawieniach (zakładka Jakość): odbicia ekranowe, okluzja,
   drzewa (jak jakość / modele / uproszczone / proste korony), rośliny i obiekty z mapy. Domyślnie (jak jakość):
   wysoka – pełne modele i rośliny, średnia – modele uproszczone bez roślin, niska – proste korony bez roślin.
   - Pierwszy czysty pomiar: wysoka 33,6 FPS wobec 47 „jak przed etapem 2” (−28%). Przyczyna – narzut procesora na
     obiekt w WebGPURenderer (ok. 10 µs na siatkę w każdym przebiegu, także w paczkach rysowania): ok. 200 siatek drzew
     (para na gatunek i wariant w każdym kawałku) × obraz i 3 kaskady cieni; sama geometria prawie bez kosztu
     (1 egzemplarz w każdej siatce – ten sam FPS). BatchedMesh odrzucone – Three na WebGPU rysuje każdy egzemplarz
     osobnym wywołaniem (ok. 30 tys. wywołań, 1 FPS).
   - Poprawka (world.js): pule drzew świata (updateTreePool) – egzemplarze wszystkich kawałków w siatkach na gatunek |
     wariant | część | poziom (blisko / dalej / poza cieniami), jedna paczka rysowania przebudowywana przy zmianie
     kawałków; ok. 80 siatek zamiast ok. 230. Rośliny przyziemne tylko w kawałkach bliskich (do 170 m).
   - Pomiar Mosina (kamera nieruchoma 32 m nad stacją, rano, pogodnie, bez obciążenia w tle), FPS:
     wysoka: domyślnie 42,8 · bez roślin i obiektów z mapy 47,8 · jak przed etapem 2 50,2 (−14,7% – w budżecie);
     średnia: domyślnie 51,2 · jak przed etapem 2 52,8 (−3%); niska: 59.

## Ryzyka

- BundleGroup (paczki rysowania) – zmiany w materiałach wymagają przebudowy paczek (jak przy teksturach).
- Wiele tekstur w shaderach – limit 16 samplerów na etap (tablice tekstur).
- Modele CC-BY – lista autorów w grze i w README; sprawdzanie licencji każdego modelu.
- Impostory – pamięć tekstur i spójność oświetlenia z modelami 3D.
