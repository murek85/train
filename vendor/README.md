# Biblioteki zewnętrzne

| Plik | Biblioteka | Wersja | Źródło | Licencja |
|---|---|---|---|---|
| `three.module.js` | Three.js | 0.170.0 | skopiowane z projektu Pogranicze Galaktyki (`strategy/vendor`), pierwotnie https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js | MIT — https://github.com/mrdoob/three.js/blob/dev/LICENSE |
| `three.global.js` | Three.js | 0.170.0 | wygenerowane z `three.module.js` przez `npm run build:three` | MIT |

`three.global.js` to ten sam kod jako zwykły skrypt (definiuje `window.THREE`), bo moduły ES nie wczytują się ze strony otwartej z dysku (`file://`). Po podmianie `three.module.js` uruchom `npm run build:three`.

Przy publicznej dystrybucji gry należy dołączyć tekst licencji MIT Three.js.
