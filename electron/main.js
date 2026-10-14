/* Aplikacja desktopowa: gra w oknie Electron, bez serwera.
   - Pliki gry podaje protokół app:// (electron/assets.js) zamiast file://: stałe źródło dla zapisów (localStorage,
     IndexedDB z trasami z generatora) i pobierania jak z serwera gry. Pliki czytane przez fs – działają też
     z app.asar spakowanej aplikacji.
   - Pośrednicy generatora tras (usługi bez CORS: NMPT, BDOT10k, PLK) – te same ścieżki co w server.js, obsłużone
     w protokole app:// (net.fetch procesu głównego), reguły w electron/proxy.js; NMPT także przez
     window.desktop.fetchText.
   - Okno bez paska menu; F11 albo Alt+Enter – pełny ekran; rozmiar, położenie, maksymalizacja i pełny ekran
     zapamiętane (userData/window.json). Jedna kopia naraz.
   - Zabezpieczenia: izolacja kontekstu, piaskownica, bez Node w stronie; nawigacja tylko w obrębie app://game, linki
     zewnętrzne w przeglądarce systemu, bez nowych okien. Strona dostaje małe API (electron/preload.js →
     window.desktop).
   - Narzędzia deweloperskie (Ctrl+Shift+I) tylko w wersji niespakowanej. */
'use strict';
const { app, BrowserWindow, protocol, shell, ipcMain, Menu, screen, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { resolveAsset, mimeOf } = require('./assets');
const { UA, proxyTarget, allowedDirect } = require('./proxy');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'app://game';
const STATE_FILE = () => path.join(app.getPath('userData'), 'window.json');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
Menu.setApplicationMenu(null);

if (!app.requestSingleInstanceLock()) app.quit();

function loadState() {
	try {
		const s = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
		return s && typeof s === 'object' ? s : {};
	} catch {
		return {};
	}
}
function saveState(win) {
	if (!win || win.isDestroyed()) return;
	const bounds = win.getNormalBounds();
	try {
		fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...bounds, maximized: win.isMaximized(), fullscreen: win.isFullScreen() }));
	} catch {}
}
// zapamiętane położenie tylko wtedy, gdy nadal leży na którymś ekranie
function onScreen(s) {
	if (![s.x, s.y, s.width, s.height].every(Number.isFinite)) return false;
	return screen.getAllDisplays().some(({ workArea: a }) => s.x + 80 > a.x && s.y + 40 > a.y && s.x < a.x + a.width - 80 && s.y < a.y + a.height - 40);
}

// pobranie z usługi (proces główny – bez ograniczeń CORS), z limitem czasu
async function fetchService(url, ms = 300000) {
	const ctrl = new AbortController();
	const kill = setTimeout(() => ctrl.abort(), ms);
	try {
		return await net.fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
	} finally {
		clearTimeout(kill);
	}
}

let win = null;
function createWindow() {
	const state = loadState();
	const placed = onScreen(state);
	win = new BrowserWindow({
		width: Math.max(1024, state.width || 1600),
		height: Math.max(640, state.height || 900),
		...(placed ? { x: state.x, y: state.y } : {}),
		minWidth: 1024,
		minHeight: 640,
		show: false,
		backgroundColor: '#0d1118',
		title: 'Maszynista',
		icon: path.join(ROOT, process.platform === 'win32' ? 'favicon.ico' : 'icons/icon-256.png'), // build/ nie trafia do paczki
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			spellcheck: false,
			backgroundThrottling: false,
		},
	});
	if (state.maximized) win.maximize();
	if (state.fullscreen) win.setFullScreen(true);
	win.once('ready-to-show', () => win.show());

	const wc = win.webContents;
	wc.on('will-navigate', (e, url) => {
		if (url.startsWith(ORIGIN + '/')) return;
		e.preventDefault();
		if (/^https?:\/\//.test(url)) shell.openExternal(url);
	});
	wc.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url)) shell.openExternal(url);
		return { action: 'deny' };
	});
	wc.on('before-input-event', (e, input) => {
		if (input.type !== 'keyDown') return;
		if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
			win.setFullScreen(!win.isFullScreen());
			e.preventDefault();
		} else if (!app.isPackaged && input.control && input.shift && input.key.toLowerCase() === 'i') {
			wc.toggleDevTools();
			e.preventDefault();
		}
	});
	for (const event of ['enter-full-screen', 'leave-full-screen']) win.on(event, () => wc.send('desktop:fullscreen', win.isFullScreen()));
	win.on('close', () => saveState(win));
	win.on('closed', () => (win = null));
	if (process.env.MASZYNISTA_CHECK) selfCheck(win);
	win.loadURL(ORIGIN + '/index.html');
}

/* npm run app:check – aplikacja startuje, wczytuje grę, rusza jazdę na pierwszej trasie (świat 3D, symulacja),
   wypisuje raport z błędami strony i kończy się (kod wyjścia 1 przy problemie). MASZYNISTA_SHOT=<plik.png> –
   zrzut okna z jazdy. */
function selfCheck(w) {
	const errors = [];
	w.webContents.on('console-message', (e) => {
		if (e.level === 'error') errors.push(e.message);
	});
	w.webContents.on('did-fail-load', (_, code, text, url) => errors.push(`load ${url}: ${text}`));
	w.webContents.once('did-finish-load', async () => {
		await new Promise((r) => setTimeout(r, 3000));
		let report;
		try {
			report = await w.webContents.executeJavaScript(`(async () => {
				const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Gra jednoosobowa'));
				if (btn) btn.click();
				await new Promise((r) => setTimeout(r, 800));
				document.getElementById('btn-start').click();
				for (let i = 0; i < 40 && !(window.maszynista.sim && window.maszynista.sim.time > 3); i++) await new Promise((r) => setTimeout(r, 500));
				const s = window.maszynista.sim;
				return {
					origin: location.origin,
					desktop: !!(window.desktop && window.desktop.app),
					route: s && s.route.title,
					train: s && s.train.name,
					time: s ? Math.round(s.time) : 0,
					storage: (() => { try { localStorage.setItem('maszynista.check', '1'); localStorage.removeItem('maszynista.check'); return true; } catch { return false; } })(),
				};
			})()`);
		} catch (err) {
			errors.push(String(err));
		}
		if (process.env.MASZYNISTA_SHOT)
			try {
				await new Promise((r) => setTimeout(r, 3000));
				fs.writeFileSync(process.env.MASZYNISTA_SHOT, (await w.webContents.capturePage()).toPNG());
			} catch {}
		const out = JSON.stringify({ report, errors }, null, 1);
		console.log(out);
		// spakowana aplikacja w Windows nie ma konsoli: MASZYNISTA_CHECK=<plik> zapisuje tam raport
		if (process.env.MASZYNISTA_CHECK !== '1')
			try {
				fs.writeFileSync(process.env.MASZYNISTA_CHECK, out);
			} catch {}
		app.exit(errors.length || !report || !report.route || !(report.time > 0) ? 1 : 0);
	});
}

ipcMain.handle('desktop:fullscreen:get', () => !!(win && win.isFullScreen()));
ipcMain.handle('desktop:fullscreen:set', (_, on) => {
	if (win) win.setFullScreen(!!on);
	return !!(win && win.isFullScreen());
});
ipcMain.handle('desktop:quit', () => app.quit());
// NMPT dla generatora tras: tylko adresy z listy (electron/proxy.js)
ipcMain.handle('desktop:fetchText', async (_, url) => {
	if (!allowedDirect(url)) throw new Error('adres spoza listy');
	const res = await fetchService(url, 180000);
	return res.ok ? res.text() : null;
});

app.on('second-instance', () => {
	if (!win) return;
	if (win.isMinimized()) win.restore();
	win.focus();
});

app.whenReady().then(() => {
	protocol.handle('app', async (request) => {
		const url = new URL(request.url);
		if (url.host !== 'game') return new Response('Nie znaleziono', { status: 404 });
		// pośrednicy generatora tras (te same ścieżki co w server.js)
		const target = request.method === 'GET' ? proxyTarget(url.pathname + url.search) : null;
		if (target === false) return new Response('', { status: 403 });
		if (target) {
			try {
				const res = await fetchService(target);
				return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'no-store' } });
			} catch {
				return new Response('', { status: 502 });
			}
		}
		const file = resolveAsset(ROOT, url.pathname);
		if (!file) return new Response('Nie znaleziono', { status: 404 });
		try {
			return new Response(await fs.promises.readFile(file), { headers: { 'content-type': mimeOf(file) } });
		} catch {
			return new Response('Nie znaleziono', { status: 404 });
		}
	});
	createWindow();
	app.on('activate', () => {
		if (!BrowserWindow.getAllWindows().length) createWindow();
	});
});
app.on('window-all-closed', () => app.quit());
