/* Profil procesora startu gry (od wczytania strony do gotowego menu): dla najdłuższych zawieszeń wątku głównego
   (ciągłe próbki bez bezczynności) najdroższe funkcje – czas własny i łączny – oraz potoki karty utworzone w tym czasie
   (createRenderPipeline – synchronicznie, blokuje proces karty; createRenderPipelineAsync – równolegle).
   BP_COMPILE=1 – najpierw cały odcinek pierwszej kompilacji (precompile); BP_RUNS – ile zawieszeń, BP_INCL – ile funkcji.
     node_modules/electron/dist/electron.exe tools/render-check/bootprof.js <port> <zapytanie | -> */
const { app, BrowserWindow } = require('electron');
const [port, query] = process.argv.slice(-2);
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// licznik potoków (po wczytaniu DOM – renderer powstaje później)
const PRE = `(() => {
	const P = (window.__pipes = []);
	if (!window.GPUDevice) return;
	const D = GPUDevice.prototype, s = D.createRenderPipeline, a = D.createRenderPipelineAsync, cs = D.createComputePipeline;
	// etykieta potoku (Three: materiał) i pierwsze ramki stosu spoza Three
	const lab = (d) => { const e = new Error().stack.split('\\n').slice(2).map((l) => l.trim().replace(/^at /, '').replace(/https?:\\/\\/[^/]+\\//, '').replace(/\\?[^:)]*/, '')).filter((l) => !/three\\.webgpu|<anonymous>/.test(l)).slice(0, 3); return ((d && d.label) || '') + ' @ ' + e.join(' < '); };
	D.createRenderPipeline = function (d) { const t = performance.now(); const r = s.call(this, d); P.push([t, 'sync', performance.now() - t, lab(d)]); return r; };
	D.createRenderPipelineAsync = function (d) { P.push([performance.now(), 'async', 0, '']); return a.call(this, d); };
	D.createComputePipeline = function (d) { const t = performance.now(); const r = cs.call(this, d); P.push([t, 'compute', performance.now() - t, lab(d)]); return r; };
	// pierwsza kompilacja (precompile ekranu startowego): początek i koniec – BP_COMPILE=1 analizuje ten odcinek
	const poll = setInterval(() => {
		const r = window.maszynista && window.maszynista.renderer;
		if (!r) return;
		clearInterval(poll);
		const pc = r.precompile.bind(r);
		r.precompile = (o) => { const t = performance.now(), p = pc(o); if (!window.__bpc) { window.__bpc = [t, 0]; p.then(() => { window.__bpc[1] = performance.now(); }); } return p; };
	}, 10);
})()`;
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	if (process.env.BP_LOG) w.webContents.on('console-message', (e, l, msg) => console.log('[strona] ' + msg));
	w.webContents.on('dom-ready', () => w.webContents.executeJavaScript(PRE).catch((e) => console.log('PRE', String(e))));
	// najpierw strona z tego samego źródła – profil zostaje w tym samym procesie przy przejściu do gry
	await w.loadURL('http://localhost:' + port + '/package.json').catch(() => {});
	const dbg = w.webContents.debugger;
	dbg.attach('1.3');
	await dbg.sendCommand('Profiler.enable');
	await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 500 });
	await dbg.sendCommand('Profiler.start');
	await w.loadURL('http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query));
	const info = await w.webContents.executeJavaScript(`(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		let m;
		for (let i = 0; i < 4500; i++) { m = window.maszynista; if (m && m.renderer && m.renderer.world && m.renderer.world.chunks.size && m.renderer.world.pending === 0 && !m.renderer.hold) break; await wait(20); }
		await wait(300);
		return { now: performance.now(), pipes: window.__pipes, compile: window.__bpc };
	})()`);
	const { profile } = await dbg.sendCommand('Profiler.stop');
	// zegar profilu (µs) → performance.now() strony: koniec profilu ≈ chwila odczytu
	const byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
	for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
	const key = (n) => { const f = n.callFrame; return (f.functionName || '(anon)') + ' ' + f.url.split('/').pop().split('?')[0] + ':' + f.lineNumber; };
	const ts = [];
	let t = profile.startTime;
	profile.samples.forEach((id, i) => { t += profile.timeDeltas[i] || 0; ts.push(t); });
	const off = info.now - profile.endTime / 1000;
	const idle = (id) => { const f = byId.get(id).callFrame.functionName; return f === '(idle)'; };
	// ciągłe odcinki bez bezczynności
	const runs = [];
	let s0 = -1;
	for (let i = 0; i <= ts.length; i++) {
		const busy = i < ts.length && !idle(profile.samples[i]);
		if (busy && s0 < 0) s0 = i;
		if (!busy && s0 >= 0) { runs.push([s0, i - 1, (ts[i - 1] - ts[s0]) / 1000]); s0 = -1; }
	}
	runs.sort((a, b) => b[2] - a[2]);
	if (process.env.BP_COMPILE && info.compile && info.compile[1]) {
		const [c0, c1] = info.compile.map((x) => (x - off) * 1000);
		const a = ts.findIndex((x) => x >= c0), b = ts.findIndex((x) => x >= c1);
		const busy = profile.samples.slice(a, b).filter((id) => !idle(id)).length / Math.max(1, b - a);
		console.log('kompilacja ' + Math.round(info.compile[0]) + '–' + Math.round(info.compile[1]) + ' ms, zajętość wątku ' + Math.round(busy * 100) + '%');
		runs.unshift([a, b - 1, (c1 - c0) / 1000]);
	}
	const fmt = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => (v / 1000).toFixed(0).padStart(7) + ' ms ' + k);
	for (const [a, b, len] of runs.slice(0, +(process.env.BP_RUNS || 3))) {
		const self = new Map(), incl = new Map();
		for (let i = a; i <= b; i++) {
			const id = profile.samples[i], d = profile.timeDeltas[i + 1] || 0;
			const k = key(byId.get(id));
			self.set(k, (self.get(k) || 0) + d);
			const seen = new Set();
			for (let q = id; q !== undefined; q = parent.get(q)) { const kk = key(byId.get(q)); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + d); } }
		}
		const t0 = ts[a] / 1000 + off, t1 = ts[b] / 1000 + off;
		const pipes = info.pipes.filter((p) => p[0] >= t0 && p[0] <= t1);
		const sync = pipes.filter((p) => p[1] !== 'async');
		console.log('\n=== zawieszenie ' + Math.round(t0) + '–' + Math.round(t1) + ' ms (' + Math.round(len) + ' ms); potoki: sync ' + sync.length + ' (' + Math.round(sync.reduce((x, p) => x + p[2], 0)) + ' ms), async ' + (pipes.length - sync.length));
		for (const p of sync.slice(0, 12)) console.log('  ' + Math.round(p[0]) + ' ' + p[1] + ' ' + p[2].toFixed(1) + ' ms ' + p[3]);
		console.log('--- czas własny');
		console.log(fmt(self, 25).join('\n'));
		console.log('--- łącznie');
		console.log(fmt(incl, +(process.env.BP_INCL || 50)).join('\n'));
	}
	const all = info.pipes, ns = all.filter((p) => p[1] !== 'async');
	console.log('\npotoki razem: sync ' + ns.length + ', async ' + (all.length - ns.length) + '; sync wg czasu:');
	for (const p of ns) console.log('  ' + Math.round(p[0]) + ' ' + p[1] + ' ' + p[2].toFixed(1) + ' ms ' + p[3]);
	app.exit(0);
});
