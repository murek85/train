/* Zmiany w menu (Electron, okno poza ekranem): wybór innej trasy, zmiana składu, pogoda, jakość grafiki (wysoka, niska), powrót do pierwszej trasy – dla
   każdej czas do zamknięcia okienka, etapy okienka, najdłuższa klatka i klatki ponad 100 ms w czasie okienka i przez 3 s
   po nim. Profil przeglądarki tymczasowy (świeży, usuwany po teście) – wybory menu nie zostają w profilu skryptów.
     node_modules/electron/dist/electron.exe tools/render-check/menuops.js <port> <zapytanie | -> */
const { app, BrowserWindow } = require('electron');
const os = require('os'), fsx = require('fs'), pathx = require('path');
const [port, query] = process.argv.slice(-2);
const tmpProfile = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'maszynista-menuops-'));
app.setPath('userData', tmpProfile);
app.on('quit', () => { try { fsx.rmSync(tmpProfile, { recursive: true, force: true }); } catch {} });
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	const errs = [];
	w.webContents.on('console-message', (e) => { if (e.level === 'error') errs.push(e.message.slice(0, 300)); });
	await w.loadURL('http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query));
	let res;
	const prof = process.env.MENU_PROF;
	if (prof) {
		// MENU_PROF=1 – profil procesora zmiany trasy (MENU_PROF=tabor / pogoda / jakosc – zmiany składu / pogody / jakości na wysoką): najdroższe funkcje łącznie
		await w.webContents.executeJavaScript(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const m = window.maszynista, r = m.renderer; for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size && !r.hold); i++) await wait(25); document.querySelector('.scr-boot')?.remove(); await wait(8000); const box = document.getElementById('route-loading'); for (let i = 0; i < 2400 && (!box.classList.contains('hidden') || (r.pipes && r.pipes.n) || r.world.pending); i++) await wait(25); await wait(2000); })()`);
		// budowy shaderów w czasie profilowanej zmiany: materiał, obiekt i przodkowie (co budowało)
		await w.webContents.executeJavaScript(`(() => { const r = window.maszynista.renderer, W = (window.__who = new Map()); const path = (o) => { const p = []; for (let q = o; q && p.length < 4; q = q.parent) p.push(q.name || q.type); return p.join(' < '); }; r.gl.debug.onNodeBuilderCreated = (nb, ro) => { const b = nb.build.bind(nb), ba = nb.buildAsync && nb.buildAsync.bind(nb); const rec = () => { const k = (ro.material.patchVariant || ro.material.type) + (ro.camera.isOrthographicCamera ? ' [cień]' : '') + (ro.bundle ? ' [paczka]' : '') + ' · ' + path(ro.object); W.set(k, (W.get(k) || 0) + 1); }; nb.build = (...a) => { rec(); return b(...a); }; if (ba) nb.buildAsync = (...a) => { rec(); return ba(...a); }; }; })()`);
		const dbg = w.webContents.debugger;
		dbg.attach('1.3');
		await dbg.sendCommand('Profiler.enable');
		await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 1000 });
		await dbg.sendCommand('Profiler.start');
		await w.webContents.executeJavaScript(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const box = document.getElementById('route-loading'); const routes = [...document.querySelectorAll('#route-list button.route')]; const first = routes.findIndex((b) => b.classList.contains('sel')); (${JSON.stringify(process.env.MENU_PROF)} === 'jakosc' ? (() => { const s = document.getElementById('opt-quality'); s.value = 'high'; s.dispatchEvent(new Event('change')); })() : ${JSON.stringify(process.env.MENU_PROF)} === 'tabor' ? window.maszynista.setTrain(window.TrainRoutes.defaultConfig({ train: 'ic' })) : ${JSON.stringify(process.env.MENU_PROF)} === 'pogoda' ? (() => { const s = document.getElementById('opt-weather'); s.value = 'rain'; s.dispatchEvent(new Event('change')); })() : routes[routes.findIndex((b, i) => i !== first)].click()); await wait(200); for (let i = 0; i < 4800 && !box.classList.contains('hidden'); i++) await wait(25); })()`);
		const { profile } = await dbg.sendCommand('Profiler.stop');
		const byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
		for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
		const key = (n) => { const f = n.callFrame; return (f.functionName || '(anon)') + ' ' + f.url.split('/').pop() + ':' + f.lineNumber; };
		const incl = new Map();
		profile.samples.forEach((id, i) => { const d = profile.timeDeltas[i] || 0; const seen = new Set(); for (let q = id; q !== undefined; q = parent.get(q)) { const k = key(byId.get(q)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + d); } } });
		console.log([...incl].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, v]) => (v / 1000).toFixed(0).padStart(7) + ' ms ' + k).join('\n'));
		const who = await w.webContents.executeJavaScript(`(() => { const W = window.__who; let n = 0; for (const v of W.values()) n += v; return [n].concat([...W].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => v + '× ' + k)); })()`);
		console.log('--- budowy shaderów: ' + who[0] + String.fromCharCode(10) + who.slice(1).join(String.fromCharCode(10)));
		app.exit(0);
		return;
	}
	try {
		res = await w.webContents.executeJavaScript(`(async () => {
			const wait = (ms) => new Promise((r) => setTimeout(r, ms));
			const m = window.maszynista, r = m.renderer;
			for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size && !r.hold); i++) await wait(25);
			document.querySelector('.scr-boot')?.remove();
			await wait(8000); // dokompilowanie w tle po starcie
			const box = document.getElementById('route-loading');
			// koniec okienka wczytywania i kompilacji w tle (pomiar bez resztek startu)
			for (let i = 0; i < 2400 && (!box.classList.contains('hidden') || (r.pipes && r.pipes.n) || r.world.pending); i++) await wait(25);
			await wait(2000);
			const op = async (name, act) => {
				const F = [], steps = [], long = [];
				let last = performance.now(), run = true;
				const tick = () => { const t = performance.now(); const dt0 = t - last; F.push(dt0); last = t; if (dt0 > 1000) long.push(Math.round(dt0) + ' ms po: ' + (steps[steps.length - 1] || '-')); const st = box.classList.contains('hidden') ? '' : document.getElementById('rl-step').textContent.replace(/ \\(.*\\)/, ''); if (st && steps[steps.length - 1] !== st) steps.push(st); if (run) requestAnimationFrame(tick); };
				requestAnimationFrame(tick);
				const t0 = performance.now();
				act();
				await wait(200);
				for (let i = 0; i < 2400 && !box.classList.contains('hidden'); i++) await wait(25);
				const ms = Math.round(performance.now() - t0), nIn = F.length;
				await wait(3000); // po zamknięciu okienka
				run = false;
				const A = F.slice(nIn);
				return { name, ms, steps, maxFrame: Math.round(Math.max(...F.slice(0, nIn))), over100: F.slice(0, nIn).filter((x) => x > 100).length, after: { maxFrame: Math.round(Math.max(0, ...A)), over100: A.filter((x) => x > 100).length }, long };
			};
			const routes = [...document.querySelectorAll('#route-list button.route')];
			const first = routes.findIndex((b) => b.classList.contains('sel'));
			const other = routes.findIndex((b, i) => i !== first);
			const out = [];
			if (${JSON.stringify(process.env.MENU_OPS || '')} === 'tabor') { // MENU_OPS=tabor – tylko zmiany składu (IC ↔ domyślny, trzy razy)
				for (let i = 0; i < 3; i++) {
					out.push(await op('tabor ic', () => window.maszynista.setTrain(window.TrainRoutes.defaultConfig({ train: 'ic' }))));
					out.push(await op('tabor domyślny', () => window.maszynista.setTrain(window.TrainRoutes.defaultConfig({}))));
				}
				return out;
			}
			out.push(await op('trasa', () => routes[other].click()));
			out.push(await op('tabor', () => window.maszynista.setTrain(window.TrainRoutes.defaultConfig({ train: 'ic' }))));
			out.push(await op('pogoda', () => { const s = document.getElementById('opt-weather'); s.value = 'rain'; s.dispatchEvent(new Event('change')); }));
			const q = (v) => () => { const s = document.getElementById('opt-quality'); s.value = v; s.dispatchEvent(new Event('change')); };
			out.push(await op('jakość wysoka', q('high')));
			out.push(await op('jakość niska', q('low')));
			out.push(await op('trasa z powrotem', () => document.querySelectorAll('#route-list button.route')[first].click()));
			return out;
		})()`);
	} catch (e) { res = { error: String(e) }; }
	console.log(JSON.stringify({ res, errs: [...new Set(errs)] }, null, 1));
	app.exit(0);
});
