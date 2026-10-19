/* Zmiany w menu (Electron, okno poza ekranem): wybór innej trasy, pogoda, powrót do pierwszej trasy – dla każdej czas
   do zamknięcia okienka, etapy okienka, najdłuższa klatka i klatki ponad 100 ms (zacięcia okienka).
     node_modules/electron/dist/electron.exe tools/render-check/menuops.js <port> <zapytanie | -> */
const { app, BrowserWindow } = require('electron');
const [port, query] = process.argv.slice(-2);
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
		// MENU_PROF=1 – profil procesora pierwszej zmiany (wybór innej trasy): najdroższe funkcje łącznie
		await w.webContents.executeJavaScript(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const m = window.maszynista, r = m.renderer; for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size && !r.hold); i++) await wait(25); document.querySelector('.scr-boot')?.remove(); await wait(8000); })()`);
		const dbg = w.webContents.debugger;
		dbg.attach('1.3');
		await dbg.sendCommand('Profiler.enable');
		await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 1000 });
		await dbg.sendCommand('Profiler.start');
		await w.webContents.executeJavaScript(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const box = document.getElementById('route-loading'); const routes = [...document.querySelectorAll('#route-list button.route')]; const first = routes.findIndex((b) => b.classList.contains('sel')); routes[routes.findIndex((b, i) => i !== first)].click(); await wait(200); for (let i = 0; i < 4800 && !box.classList.contains('hidden'); i++) await wait(25); })()`);
		const { profile } = await dbg.sendCommand('Profiler.stop');
		const byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
		for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
		const key = (n) => { const f = n.callFrame; return (f.functionName || '(anon)') + ' ' + f.url.split('/').pop() + ':' + f.lineNumber; };
		const incl = new Map();
		profile.samples.forEach((id, i) => { const d = profile.timeDeltas[i] || 0; const seen = new Set(); for (let q = id; q !== undefined; q = parent.get(q)) { const k = key(byId.get(q)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + d); } } });
		console.log([...incl].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, v]) => (v / 1000).toFixed(0).padStart(7) + ' ms ' + k).join('\n'));
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
			const op = async (name, act) => {
				const F = [], steps = [];
				let last = performance.now(), run = true;
				const tick = () => { const t = performance.now(); F.push(t - last); last = t; const st = box.classList.contains('hidden') ? '' : document.getElementById('rl-step').textContent.replace(/ \\(.*\\)/, ''); if (st && steps[steps.length - 1] !== st) steps.push(st); if (run) requestAnimationFrame(tick); };
				requestAnimationFrame(tick);
				const t0 = performance.now();
				act();
				await wait(200);
				for (let i = 0; i < 2400 && !box.classList.contains('hidden'); i++) await wait(25);
				const ms = Math.round(performance.now() - t0);
				await wait(3000); // po zamknięciu okienka
				run = false;
				return { name, ms, steps, maxFrame: Math.round(Math.max(...F)), over100: F.filter((x) => x > 100).length };
			};
			const routes = [...document.querySelectorAll('#route-list button.route')];
			const first = routes.findIndex((b) => b.classList.contains('sel'));
			const other = routes.findIndex((b, i) => i !== first);
			const out = [];
			out.push(await op('trasa', () => routes[other].click()));
			out.push(await op('pogoda', () => { const s = document.getElementById('opt-weather'); s.value = 'rain'; s.dispatchEvent(new Event('change')); }));
			out.push(await op('trasa z powrotem', () => document.querySelectorAll('#route-list button.route')[first].click()));
			return out;
		})()`);
	} catch (e) { res = { error: String(e) }; }
	console.log(JSON.stringify({ res, errs: [...new Set(errs)] }, null, 1));
	app.exit(0);
});
