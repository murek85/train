# Biblioteki zewnętrzne

| Plik | Biblioteka | Wersja | Źródło | Licencja |
|---|---|---|---|---|
| `three/three.core.js`, `three/three.module.js` | Three.js (WebGLRenderer) | 0.186.1 | `node_modules/three/build` (npm `three`, devDependency) | MIT – `three/LICENSE` |
| `three/three.webgpu.js`, `three/three.tsl.js`, `three/addons/tsl/` | Three.js (WebGPURenderer, TSL) | 0.186.1 | jw. – pod przejście na WebGPU, jeszcze nieużywane | MIT |

Kopiuje je `npm run vendor` (`tools/vendor.js`); wersja w `three/VERSION`. Gra ładuje Three.js przez import map
(`index.html`: `"three"` → `./vendor/three/three.module.js`) jako moduł ES, więc potrzebny jest serwer (`npm start`)
albo protokół `app://` aplikacji desktopowej – ze strony otwartej z dysku (`file://`) moduły się nie wczytają.
Zmiana wersji: `three` w `package.json`, potem `npm install && npm run vendor`.

Przy publicznej dystrybucji gry należy dołączyć tekst licencji MIT Three.js (`three/LICENSE`).
