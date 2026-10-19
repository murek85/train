/* Przycięcia w czasie jazdy (Electron, okno poza ekranem): start trasy, automatyczny maszynista, pomiar SHOT_SEC s
   (domyślnie 90). Dla każdej klatki: czas klatki, budowa świata (World.update), budowy shaderów (JS) i potoki tworzone
   synchronicznie (WebGPU); wypisuje liczbę klatek ponad 33/50/100 ms i rozbicie najdłuższych.
     node_modules/electron/dist/electron.exe tools/render-check/stutter.js <port> <zapytanie | -> */
const { app, BrowserWindow } = require('electron');
const [port, query] = process.argv.slice(-2);
const SEC = Number(process.env.SHOT_SEC) || 90;
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	const errs = new Map(); // błędy konsoli (np. walidacja WebGPU) – treść → liczba
	w.webContents.on('console-message', (e) => { if (e.level === 'error') { const k = e.message.slice(0, 200); errs.set(k, (errs.get(k) || 0) + 1); } });
	await w.loadURL('http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query));
	let res;
	try {
		res = await w.webContents.executeJavaScript(`(async () => {
			const wait = (ms) => new Promise((r) => setTimeout(r, ms));
			const m = window.maszynista, r = m.renderer;
			for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size && !r.hold); i++) await wait(25);
			await wait(1000);
			document.querySelector('.scr-boot')?.remove();
			document.getElementById('btn-start').click();
			for (let i = 0; i < 4800; i++) { await wait(25); if (i > 8 && !document.querySelector('.scr-load')) break; }
			await wait(1500);
			// liczniki na klatkę
			const cur = { world: 0, build: 0, builds: 0, pipes: 0, draw: 0 };
			const wu = r.world.update.bind(r.world);
			r.world.update = (...a) => { const t = performance.now(); const x = wu(...a); cur.world += performance.now() - t; return x; };
			const dr = r.draw.bind(r);
			r.draw = (...a) => { const t = performance.now(); const x = dr(...a); cur.draw += performance.now() - t; return x; };
			// co budowało shadery w trakcie jazdy: materiał (wariant), obiekt i jego przodkowie
			const who = new Map();
			const path = (o) => { const p = []; for (let q = o; q && p.length < 4; q = q.parent) p.push(q.name || q.type); return p.join(' < '); };
			if (r.gl.debug) r.gl.debug.onNodeBuilderCreated = (nb, ro) => { const b = nb.build.bind(nb); nb.build = (...a) => { const t = performance.now(); const x = b(...a); cur.build += performance.now() - t; cur.builds++; const k = (ro.material.patchVariant || ro.material.type) + (ro.camera.isOrthographicCamera ? ' [cień]' : '') + ' · ' + path(ro.object); who.set(k, (who.get(k) || 0) + 1); return x; }; };
			const dev = r.gl.backend && r.gl.backend.device;
			if (dev) { const cp = dev.createRenderPipeline.bind(dev); dev.createRenderPipeline = (d) => { cur.pipes++; return cp(d); }; }
			const F = [];
			let last = performance.now(), run = true;
			const tick = () => {
				const t = performance.now();
				F.push({ dt: t - last, world: cur.world, build: cur.build, builds: cur.builds, pipes: cur.pipes, draw: cur.draw });
				cur.world = cur.build = cur.builds = cur.pipes = cur.draw = 0;
				last = t;
				if (m.sim && m.sim.status === 'running') window.TrainSim.autopilot(m.sim);
				if (run) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
			const s0 = m.sim.st.pos;
			await wait(${SEC} * 1000);
			run = false;
			const n = (ms) => F.filter((f) => f.dt > ms).length;
			const r1 = (x) => Math.round(x);
			const top = F.slice().sort((a, b) => b.dt - a.dt).slice(0, 10).map((f) => r1(f.dt) + ' ms (świat ' + r1(f.world) + ', rysowanie ' + r1(f.draw) + ', shadery ' + f.builds + '× ' + r1(f.build) + ' ms, potoki ' + f.pipes + ')');
			const dts = F.map((f) => f.dt).sort((a, b) => a - b);
			return { frames: F.length, km: +((m.sim.st.pos - s0) / 1000).toFixed(2), median: +dts[dts.length >> 1].toFixed(1), p99: +dts[Math.floor(dts.length * 0.99)].toFixed(1), over33: n(33), over50: n(50), over100: n(100), builds: F.reduce((s, f) => s + f.builds, 0), syncPipes: F.reduce((s, f) => s + f.pipes, 0), worldMs: r1(F.reduce((s, f) => s + f.world, 0)), top, who: [...who].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => v + '× ' + k), renderer: r.gpuName() };
		})()`);
	} catch (e) { res = { error: String(e) }; }
	if (res && !res.error) res.errors = [...errs].map(([k, n]) => n + '× ' + k);
	console.log(JSON.stringify(res, null, 1));
	app.exit(0);
});
