/* Czasy wczytywania (Electron, okno poza ekranem):
     node_modules/electron/dist/electron.exe tools/render-check/loadtime.js <port> <zapytanie | ->
   1) start gry: od nawigacji do gotowego menu (demo w tle zbudowane – warunek zamknięcia ekranu startowego),
   2) jazda: od „Start” do zniknięcia ekranu wczytywania – z podziałem na budowę świata, kompilację shaderów
      (compileAsync), rozgrzanie (warmUp) i resztę; najdłuższe klatki w czasie wczytywania.
   Wypisuje JSON (ms). */
const { app, BrowserWindow } = require('electron');
const [port, query] = process.argv.slice(-2);
const url = 'http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query);
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// LT_SWITCH="nazwa=wartość;…" – dodatkowe przełączniki Chromium (np. enable-dawn-features=use_dxc)
for (const sw of (process.env.LT_SWITCH || '').split(';').filter(Boolean)) { const [k, v] = sw.split('='); app.commandLine.appendSwitch(k, v); }
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	const errs = [];
	w.webContents.on('console-message', (e) => { if (e.level === 'error') errs.push(e.message.slice(0, 300)); });
	await w.loadURL(url);
	let res;
	try {
		res = await w.webContents.executeJavaScript(`(async () => {
			const wait = (ms) => new Promise((r) => setTimeout(r, ms));
			const T = {}, now = () => Math.round(performance.now());
			const m = window.maszynista, r = m.renderer;
			T.load = now();
			if (r.gpuInit) { await r.gpuInit; T.gpuInit = now(); }
			// menu gotowe: demo zbudowane i (WebGPU) potoki skompilowane – jak ready() ekranu startowego
			for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size && !r.hold); i++) await wait(25);
			T.menuReady = now();
			await wait(1500);
			// jazda: pomiar etapów
			const P = {};
			const pc = r.precompile.bind(r), ca = r.gl.compileAsync.bind(r.gl), wu = r.warmUp.bind(r);
			r.precompile = () => { P.precompile = now(); return pc(); };
			r.gl.compileAsync = (...a) => { P.compile = now(); return ca(...a).then((x) => { P.compileDone = now(); return x; }); };
			r.warmUp = () => { P.warm = now(); const x = wu(); P.warmDone = now(); return x; };
			document.querySelector('.scr-boot')?.remove();
			const frames = [];
			let last = performance.now(), run = true;
			const tick = () => { const t = performance.now(); frames.push([Math.round(t), Math.round(t - last)]); last = t; if (run) requestAnimationFrame(tick); };
			requestAnimationFrame(tick);
			P.start = now();
			document.getElementById('btn-start').click();
			let worldDone = 0;
			for (let i = 0; i < 4800; i++) {
				await wait(25);
				if (!worldDone && document.querySelector('.scr-load') && r.world && r.world.pending === 0 && r.world.chunks.size) worldDone = now();
				if (P.start && !document.querySelector('.scr-load') && i > 8) break;
			}
			P.end = now();
			run = false;
			// compileAsync po limicie (precompile czeka najwyżej 20 s) – kiedy naprawdę się skończyło
			for (let i = 0; i < 2400 && P.compile && !P.compileDone; i++) await wait(25);
			P.worldDone = worldDone;
			const rel = {};
			for (const k in P) rel[k] = P[k] ? P[k] - P.start : 0;
			const during = frames.filter((f) => f[0] >= P.start && f[0] <= P.end);
			const long = during.slice().sort((a, b) => b[1] - a[1]).slice(0, 8).map((f) => (f[0] - P.start) + ':' + f[1]);
			return { boot: T, ride: rel, chunks: r.world.chunks.size, longFrames: long, sumOver50: during.filter((f) => f[1] > 50).reduce((s, f) => s + f[1], 0), backend: r.gpuName() };
		})()`);
	} catch (e) { res = { error: String(e) }; }
	console.log(JSON.stringify({ res, errs: [...new Set(errs)] }, null, 1));
	app.exit(0);
});
