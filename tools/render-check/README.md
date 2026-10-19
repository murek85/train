# Porównania WebGL / WebGPU

Skrypty Electron do sprawdzania trybu WebGPU (`?webgpu`) wobec WebGL. Gra musi działać z serwera (`npm start`).

| Plik | Do czego |
|---|---|
| `shot.js` | zrzut z jazdy (start trasy, godzina, jakość, scena) + JSON z trybem i błędami konsoli |
| `case.js` | scena dla `SHOT_JS` / `SHOT_CASE`: `rain`, `snow`, `cab` (łączone, np. `cab-rain`) |
| `lights.js` | wyłączanie składników światła (`noenv`, `nolamp`, `nonight`, `nohemi`, `nosun`) – szukanie różnic jasności |
| `perf.js` | odczyt nakładki F3 po rozgrzaniu (FPS, czas procesora, czas karty z `?gputime`) |
| `cpuprof.js` | profil procesora (najdroższe funkcje, czas własny) |
| `draws.js` | wywołania rysowania na klatkę wg kategorii (obraz / cienie; bez poleceń z paczek) |
| `updates.js` | aktualizacje obiektów na klatkę: pełne / współdzielone, w paczkach i poza nimi |
| `shadowcost.js` | czas klatki z mapami cieni i z zamrożonymi |
| `observers.js` | stany budowania shaderów i ile z nich odświeża się w całości (hasNode) |
| `diff.js` | różnica dwóch zrzutów: średnia, odsetek pikseli > 24, obraz różnicy |
| `crop.js` | dwa wycinki obok siebie (powiększenie) |
| `lum.js` | średnia jasność zrzutów |

Przykład (jakość niska – bez efektów po renderowaniu, więc porównuje same materiały):

```
set E=node_modules\electron\dist\electron.exe
set SHOT_Q=low
%E% tools/render-check/shot.js 4180 out/gl 12 -
%E% tools/render-check/shot.js 4180 out/gpu 12 webgpu
%E% tools/render-check/diff.js out/gl.png out/gpu.png out/diff.png
```
