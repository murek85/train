/* Okno strony na aplikację desktopową: window.desktop – pełny ekran, wyjście i pobieranie NMPT przez proces główny
   (usługa bez nagłówków CORS; generator tras – js/osm-route.js). Nic więcej z Electrona ani Node nie trafia do strony. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
	app: true,
	isFullScreen: () => ipcRenderer.invoke('desktop:fullscreen:get'),
	setFullScreen: (on) => ipcRenderer.invoke('desktop:fullscreen:set', !!on),
	onFullScreen: (listener) => ipcRenderer.on('desktop:fullscreen', (_, on) => listener(!!on)),
	quit: () => ipcRenderer.invoke('desktop:quit'),
	// tekst odpowiedzi usługi NMPT (tylko adresy z listy w electron/proxy.js) albo null
	fetchText: (url) => ipcRenderer.invoke('desktop:fetchText', String(url)),
});
