/* Profil procesora wczytywania jazdy (od „Start” do zniknięcia ekranu wczytywania):
     node_modules/electron/dist/electron.exe tools/render-check/loadprof.js <port> <zapytanie | ->
   Wypisuje najdroższe funkcje – czas własny i łączny (z wywołanymi), ms. */
const { app, BrowserWindow } = require('electron');
const [port, query] = process.argv.slice(-2);
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	await w.loadURL('http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query));
	await w.webContents.executeJavaScript(`(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const m = window.maszynista, r = m.renderer;
		for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size); i++) await wait(25);
		await wait(1500);
		document.querySelector('.scr-boot')?.remove();
	})()`);
	const dbg = w.webContents.debugger;
	dbg.attach('1.3');
	await dbg.sendCommand('Profiler.enable');
	await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 500 });
	await dbg.sendCommand('Profiler.start');
	const t0 = Date.now();
	await w.webContents.executeJavaScript(`(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		document.getElementById('btn-start').click();
		for (let i = 0; i < 4800; i++) { await wait(25); if (i > 8 && !document.querySelector('.scr-load')) break; }
	})()`);
	const wall = Date.now() - t0;
	const { profile } = await dbg.sendCommand('Profiler.stop');
	const byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
	for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
	const key = (n) => { const f = n.callFrame; return (f.functionName || '(anon)') + ' ' + f.url.split('/').pop() + ':' + f.lineNumber; };
	const self = new Map(), incl = new Map();
	const dt = profile.timeDeltas;
	let total = 0;
	profile.samples.forEach((id, i) => {
		const d = dt[i] || 0;
		total += d;
		const k = key(byId.get(id));
		self.set(k, (self.get(k) || 0) + d);
		const seen = new Set();
		for (let q = id; q !== undefined; q = parent.get(q)) { const kk = key(byId.get(q)); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + d); } }
	});
	const fmt = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => (v / 1000).toFixed(0).padStart(7) + ' ms ' + k);
	console.log('ściana ' + wall + ' ms, próbki ' + (total / 1000).toFixed(0) + ' ms\n--- czas własny');
	console.log(fmt(self, 30).join('\n'));
	console.log('--- łącznie');
	console.log(fmt(incl, 45).join('\n'));
	app.exit(0);
});
