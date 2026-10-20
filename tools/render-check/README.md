# Porównania WebGL / WebGPU

Skrypty Electron do sprawdzania trybu WebGPU (`?webgpu`) wobec WebGL. Gra musi działać z serwera (`npm start`).

| Plik | Do czego |
|---|---|
| `shot.js` | zrzut z jazdy (start trasy, godzina, jakość, scena) + JSON z trybem i błędami konsoli |
| `view.js` | widok kamery i pogoda (`SHOT_CASE` np. `trackside-clear`, `side-rain`) – zrzuty nieba |
| `case.js` | scena dla `SHOT_JS` / `SHOT_CASE`: `rain`, `snow`, `cab` (łączone, np. `cab-rain`) |
| `lights.js` | wyłączanie składników światła (`noenv`, `nolamp`, `nonight`, `nohemi`, `nosun`) – szukanie różnic jasności |
| `perfweather.js` | czas klatki przy pogodzie z `SHOT_CASE` (rain, snow) |
| `perf.js` | odczyt nakładki F3 po rozgrzaniu (FPS, czas procesora, czas karty z `?gputime`) |
| `cpuprof.js` | profil procesora (najdroższe funkcje, czas własny) |
| `draws.js` | wywołania rysowania na klatkę wg kategorii (obraz / cienie; bez poleceń z paczek) |
| `updates.js` | aktualizacje obiektów na klatkę: pełne / współdzielone, w paczkach i poza nimi |
| `shadowcost.js` | czas klatki z mapami cieni i z zamrożonymi |
| `observers.js` | stany budowania shaderów i ile z nich odświeża się w całości (hasNode) |
| `diff.js` | różnica dwóch zrzutów: średnia, odsetek pikseli > 24, obraz różnicy |
| `crop.js` | dwa wycinki obok siebie (powiększenie) |
| `lum.js` | średnia jasność zrzutów |
| `loadtime.js` | czasy wczytywania: start gry do menu, „Start” do jazdy (budowa świata, kompilacja, rozgrzanie, najdłuższe klatki); `LT_SWITCH` – przełączniki Chromium |
| `loadprof.js` | profil procesora wczytywania jazdy (czas własny i łączny) |
| `builds.js` | budowy shaderów przy wczytywaniu: ile, jak długo, dla jakich materiałów; programy i potoki (`menu` – także start gry) |
| `nightview.js` | dla `SHOT_JS`: kamera swobodna 25 m nad torem `SHOT_S` m przed pociągiem (domyślnie 2500), wzdłuż trasy – oddal, mgła, łuna nocą |
| `yardview.js` | dla `SHOT_JS`: kamera swobodna 40 m nad stacją, w poprzek torów (bocznice z wagonami, sieć) – porównania instancji, np. z `?noshare` |
| `bootframes.js` | płynność ekranu startowego: klatki wątku głównego z etapem startu i klatki tła w workerze (`tloWorker`) |
| `bootprof.js` | profil procesora startu gry: najdłuższe zawieszenia wątku głównego (`BP_COMPILE=1` – cała kompilacja przed menu) i potoki karty – synchroniczne (z materiałem i miejscem wywołania) i asynchroniczne |
| `stutter.js` | przycięcia w jeździe (automatyczny maszynista, `SHOT_SEC` s): klatki ponad 33/50/100 ms z rozbiciem (świat, shadery, potoki), co budowało shadery i błędy konsoli (walidacja WebGPU) |
| `menuops.js` | zmiany w menu (inna trasa, skład, pogoda, powrót): czas okienka, etapy, najdłuższa klatka w okienku i po nim; `MENU_PROF=1` / `tabor` / `pogoda` – profil zmiany i budowy shaderów. Profil przeglądarki tymczasowy (usuwany po teście) |
| `bundles.js` | paczki statycznego świata (WebGPU): ustawienia ze zgłoszenia, pauza → pora roku (`SEASON`), obrót kamery; przy każdym odtworzeniu paczki zasoby nagrane w koderze a bieżące (powiązania, bufory, potok) oraz obce obiekty (inna kamera niż paczka). Profil tymczasowy |
| `fps.js` | wydajność jazdy w ustawieniach gracza (jakość wysoka, Orzesze – Mikołów): FPS, czas procesora z podziałem, czas karty (`gputime`); `FPS_STILL=1` – pociąg stoi (powtarzalnie), `FPS_TIME`, `FPS_WEATHER`, `ROUTE`, `FPS_W`/`FPS_H`, `FPS_NOVSYNC`, `FPS_PROF=1` – profil procesora, `FPS_JS` – kod przed pomiarem, `FPS_SHOT` – zrzut. Profil tymczasowy |
| `wgsldump.js` | kod WGSL wszystkich programów – porównanie dwóch uruchomień (powtarzalność) |

Przykład (jakość niska – bez efektów po renderowaniu, więc porównuje same materiały):

```
set E=node_modules\electron\dist\electron.exe
set SHOT_Q=low
%E% tools/render-check/shot.js 4180 out/gl 12 -
%E% tools/render-check/shot.js 4180 out/gpu 12 webgpu
%E% tools/render-check/diff.js out/gl.png out/gpu.png out/diff.png
```
