# Biblioteki zewnętrzne

| Plik | Biblioteka | Wersja | Źródło | Licencja |
|---|---|---|---|---|
| `three/three.core.js`, `three/three.module.js` | Three.js (WebGLRenderer) | 0.186.1 | `node_modules/three/build` (npm `three`, devDependency) | MIT – `three/LICENSE` |
| `three/three.webgpu.js`, `three/three.tsl.js`, `three/addons/tsl/` | Three.js (WebGPURenderer, TSL) | 0.186.1 | jw. – pod przejście na WebGPU, jeszcze nieużywane | MIT |

| `ez-tree/` | EZ-Tree – generator drzew (Daniel Greenheck) | 1.1.0 | npm `@dgreenheck/ez-tree`, `src/lib` (kopia ręczna) | MIT – `ez-tree/LICENSE` |

`ez-tree/` – tylko geometria: `tree.js` zmieniony (importy `.js`, bez faktur, materiałów, presetów i kratki, poziom gałęzi
w `geometry.userData.level`), presety JSON w `presets.js`. Kora z pakietu (CC0 – Poly Haven, TextureCan) przeniesiona
do `textures/bark/` (tools/textures.py), liście – `textures/foliage/` (ambientCG CC0, tools/foliage.py).

Three.js kopiuje `npm run vendor` (`tools/vendor.js`); wersja w `three/VERSION`. Gra ładuje Three.js przez import map
(`index.html`: `"three"` → `./vendor/three/three.module.js`) jako moduł ES, więc potrzebny jest serwer (`npm start`)
albo protokół `app://` aplikacji desktopowej – ze strony otwartej z dysku (`file://`) moduły się nie wczytają.
Zmiana wersji: `three` w `package.json`, potem `npm install && npm run vendor`.

Przy publicznej dystrybucji gry należy dołączyć tekst licencji MIT Three.js (`three/LICENSE`).
