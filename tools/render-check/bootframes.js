/* Płynność ekranu startowego (Electron, okno poza ekranem): odstępy klatek wątku głównego od wczytania strony do
   gotowego menu, najdłuższe klatki z etapem startu (skrypty, init karty, budowa świata podglądu, kompilacja,
   rozgrzanie) oraz klatki tła rysowanego w workerze (tloWorker – to widzi gracz).
     node_modules/electron/dist/electron.exe tools/render-check/bootframes.js <port> <zapytanie | -> */
const { app, BrowserWindow } = require('electron');
const [port, query] = process.argv.slice(-2);
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const INJ = `(() => {
	const F = (window.__bf = { frames: [], marks: [] });
	let last = performance.now();
	const tick = () => { const t = performance.now(); F.frames.push([t, t - last]); last = t; if (!F.stop) requestAnimationFrame(tick); };
	requestAnimationFrame(tick);
	const mark = (k) => F.marks.push([performance.now(), k]);
	const poll = setInterval(() => {
		const m = window.maszynista, r = m && m.renderer;
		if (!r) return;
		if (!F.hooked) {
			F.hooked = true; mark('renderer');
			if (r.gpuInit) r.gpuInit.then(() => mark('init karty'));
			const pc = r.precompile.bind(r), wu = r.warmUp.bind(r);
			r.precompile = (o) => { mark('kompilacja'); return pc(o); };
			r.warmUp = () => { mark('rozgrzanie'); const x = wu(); mark('po rozgrzaniu'); return x; };
			// koniec budowy shaderów kompilacji (compileAsync Three) – dalej tylko czekanie na potoki karty
			const ca = r.gl.compileAsync.bind(r.gl);
			r.gl.compileAsync = (...a) => { const p = ca(...a); p.then(() => mark('shadery gotowe')); return p; };
		}
		if (!F.world && r.world && r.world.chunks.size) { F.world = true; mark('pierwszy kawałek'); }
		if (!F.built && r.world && r.world.chunks.size && r.world.pending === 0) { F.built = true; mark('świat zbudowany'); }
		if (F.built && !r.hold && !F.ready) {
			F.ready = true; mark('menu gotowe'); F.stop = true; clearInterval(poll);
			// płynność tła ekranu startowego w workerze (screens.js – OffscreenCanvas)
			const wk = document.getElementById('boot') && document.getElementById('boot').bgWorker;
			if (wk) { wk.addEventListener('message', (e) => { if (e.data.type === 'stats') F.bg = e.data.stats; }); wk.postMessage({ type: 'stats' }); } else F.bg = 'brak workera';
		}
	}, 20);
})()`;
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	w.webContents.on('dom-ready', () => w.webContents.executeJavaScript(INJ).catch((e) => console.log('INJ', String(e))));
	await w.loadURL('http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query));
	const res = await w.webContents.executeJavaScript(`(async () => {
		for (let i = 0; i < 6000 && !(window.__bf && window.__bf.ready && window.__bf.bg); i++) await new Promise((r) => setTimeout(r, 25));
		const F = window.__bf, ms = (x) => Math.round(x);
		const phase = (t) => { let p = 'skrypty'; for (const [mt, k] of F.marks) if (mt <= t) p = k; return p; };
		const fr = F.frames.slice(1), dts = fr.map((f) => f[1]).sort((a, b) => a - b);
		const byPhase = {};
		for (const [t, dt] of fr) if (dt > 50) { const p = phase(t - dt); byPhase[p] = (byPhase[p] || 0) + ms(dt); }
		const bg = typeof F.bg === 'object' ? { klatki: F.bg.frames, ponad50: F.bg.over50, najdluzsza: ms(F.bg.max) } : F.bg;
		return { tloWorker: bg, czasDoMenu: ms(F.marks.find((m) => m[1] === 'menu gotowe')[0]), klatki: fr.length, mediana: +dts[dts.length >> 1].toFixed(1), ponad50: fr.filter((f) => f[1] > 50).length, ponad100: fr.filter((f) => f[1] > 100).length, ponad500: fr.filter((f) => f[1] > 500).length, zawieszonychMs: byPhase,
			najdluzsze: fr.slice().sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, dt]) => ms(t - dt) + ' ms: ' + ms(dt) + ' ms (' + phase(t - dt) + ')'), etapy: F.marks.map(([t, k]) => ms(t) + ' ' + k) };
	})()`);
	console.log(JSON.stringify(res, null, 1));
	app.exit(0);
});
