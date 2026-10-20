/* Wydajność jazdy w ustawieniach gracza (Electron, okno poza ekranem, profil tymczasowy): Orzesze Jaśkowice – Mikołów,
   ET22 + 3× Bdhpumn, jakość FPS_Q (domyślnie wysoka), okno FPS_W×FPS_H (domyślnie 1920×1080), automatyczny maszynista.
   Po rozgrzaniu FPS_SEC s (domyślnie 10) odczytów nakładki F3: FPS, czas procesora z podziałem, czas karty (zapytanie
   z gputime), wywołania, trójkąty. FPS_JS – plik z kodem wykonanym przed pomiarem (np. wyłączenie efektu).
     node_modules/electron/dist/electron.exe tools/render-check/fps.js <port> <zapytanie | ->   (np. webgpu&gputime, webgpu=0) */
const { app, BrowserWindow } = require('electron');
const os = require('os'), fsx = require('fs'), pathx = require('path');
const [port, query] = process.argv.slice(-2);
const W = Number(process.env.FPS_W) || 1920, H = Number(process.env.FPS_H) || 1080, SEC = Number(process.env.FPS_SEC) || 10;
const tmpProfile = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'maszynista-fps-'));
app.setPath('userData', tmpProfile);
app.on('quit', () => { try { fsx.rmSync(tmpProfile, { recursive: true, force: true }); } catch {} });
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
if (process.env.FPS_NOVSYNC) { app.commandLine.appendSwitch('disable-gpu-vsync'); app.commandLine.appendSwitch('disable-frame-rate-limit'); }
const LS = { 'maszynista.opt.quality': JSON.stringify(process.env.FPS_Q || 'high'), 'maszynista.opt.autoDetail': 'false', 'maszynista.opt.render': '{"scale":1,"aa":true,"shadows":true}', 'maszynista.route': JSON.stringify(process.env.ROUTE || 'orzesze-mikolow'), 'maszynista.trainCfg': '{"loco":"ET22","lv":"cargo","cars":[{"t":"Bdhpumn","v":"pkp"},{"t":"Bdhpumn","v":"pkp"},{"t":"Bdhpumn","v":"pkp"}]}', 'maszynista.opt.season': '"summer"', 'maszynista.opt.weather': JSON.stringify(process.env.FPS_WEATHER || 'clear'), 'maszynista.opt.time': JSON.stringify(process.env.FPS_TIME || '08:00') };
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: W, height: H, useContentSize: true, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	const errs = new Map();
	w.webContents.on('console-message', (e) => { if (e.level === 'error') { const k = e.message.slice(0, 200); errs.set(k, (errs.get(k) || 0) + 1); } });
	const url = 'http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query);
	await w.loadURL(url);
	await w.webContents.executeJavaScript(`(() => { const L = ${JSON.stringify(LS)}; for (const k in L) localStorage.setItem(k, L[k]); })()`);
	await w.loadURL(url);
	if (process.env.FPS_JS) await w.webContents.executeJavaScript('window.FPS_JS = ' + JSON.stringify(fsx.readFileSync(process.env.FPS_JS, 'utf8')));
	// FPS_REFL=1 – wyjątki rysowania odbicia wody (ReflectorNode updateBefore) w window.__reflErr
	if (process.env.FPS_REFL) await w.webContents.executeJavaScript(`(async () => { for (let i = 0; i < 400 && !(window.maszynista && window.maszynista.renderer && window.maszynista.renderer.waterRefl && window.maszynista.renderer.gl._textures); i++) await new Promise((q) => setTimeout(q, 25)); const RB = window.maszynista.renderer.waterRefl.refl.reflector, ub = RB.updateBefore.bind(RB); window.__reflErr = []; RB.updateBefore = (f) => { try { return ub(f); } catch (e) { if (window.__reflErr.length < 3) window.__reflErr.push(String(e && e.stack || e).slice(0, 900)); throw e; } }; const Tx = window.maszynista.renderer.gl._textures; const us = Tx.updateSampler.bind(Tx); Tx.updateSampler = (b) => { if (!b.texture && window.__reflErr.length < 6) { const ro = window.__curRO; window.__reflErr.push('sampler bez tekstury: ' + b.name + ' węzeł ' + (b.textureNode && (b.textureNode.constructor.name + ' ' + (b.textureNode.name || '') + ' id' + b.textureNode.id + ' cmp ' + !!b.textureNode.compareNode + ' depth ' + !!b.textureNode.depthNode + ' upd ' + b.textureNode.updateType + ' ' + Object.keys(b.textureNode).filter((k) => b.textureNode[k] && typeof b.textureNode[k] === 'object').join('/') + ' ref ' + (b.textureNode.referenceNode ? b.textureNode.referenceNode.constructor.name : '-'))) + ' · materiał ' + (ro ? (ro.material.patchVariant || ro.material.type) + ' kamera ' + (ro.camera === window.maszynista.renderer.camera ? 'główna' : ro.camera.type) : '?')); } return us(b); }; const Bi = window.maszynista.renderer.gl._bindings, gfr = Bi.getForRender.bind(Bi); Bi.getForRender = (ro) => { window.__curRO = ro; return gfr(ro); }; })()`);
	// FPS_TD=1 – miejsca niszczenia tekstur (GPUTexture.destroy) w window.__td
	if (process.env.FPS_TD) await w.webContents.executeJavaScript(`(() => { window.__td = []; const D = GPUTexture.prototype.destroy; GPUTexture.prototype.destroy = function () { if (window.__td.length < 8) window.__td.push(Math.round(performance.now()) + ' ' + this.width + 'x' + this.height + ' ' + this.format + ' ' + (this.label || '') + ' | ' + new Error().stack.split(String.fromCharCode(10)).slice(2, 12).map((x) => x.trim().split('/').pop()).join(' < ')); return D.call(this); }; })()`);
	let res;
	// FPS_PROF=1 – profil procesora 5 s w czasie pomiaru: najdroższe funkcje (czas własny i łączny)
	if (process.env.FPS_PROF) {
		w.webContents.on('console-message', async (e) => {
			if (e.message !== '__prof__') return;
			const dbg = w.webContents.debugger;
			dbg.attach('1.3');
			await dbg.sendCommand('Profiler.enable');
			await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 });
			await dbg.sendCommand('Profiler.start');
			await new Promise((q) => setTimeout(q, 5000));
			const { profile } = await dbg.sendCommand('Profiler.stop');
			const byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
			for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
			const key = (n) => { const f = n.callFrame; return (f.functionName || '(anon)') + ' ' + f.url.split('/').pop() + ':' + f.lineNumber; };
			const self = new Map(), incl = new Map();
			let total = 0;
			profile.samples.forEach((id, i) => {
				const d = profile.timeDeltas[i] || 0;
				total += d;
				const k0 = key(byId.get(id));
				self.set(k0, (self.get(k0) || 0) + d);
				const seen = new Set();
				for (let q = id; q !== undefined; q = parent.get(q)) { const k = key(byId.get(q)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + d); } }
			});
			const pct = (v) => ((v / total) * 100).toFixed(1).padStart(5) + '%';
			console.log('--- czas własny\n' + [...self].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => pct(v) + ' ' + k).join('\n'));
			console.log('--- czas łączny\n' + [...incl].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => pct(v) + ' ' + k).join('\n'));
		});
	}
	try {
		res = await w.webContents.executeJavaScript(`(async () => {
			const wait = (ms) => new Promise((r) => setTimeout(r, ms));
			const m = window.maszynista, r = m.renderer;
			for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size && !r.hold); i++) await wait(25);
			await wait(1000);
			document.querySelector('.scr-boot')?.remove();
			document.getElementById('btn-start').click();
			for (let i = 0; i < 4800; i++) { await wait(25); if (i > 8 && !document.querySelector('.scr-load')) break; }
			let run = true;
			const tick = () => { if (!${!!process.env.FPS_STILL} && m.sim && m.sim.status === 'running') window.TrainSim.autopilot(m.sim); if (run) requestAnimationFrame(tick); };
			requestAnimationFrame(tick);
			await wait(6000);
			const extra = window.FPS_JS ? await (async () => eval('(async () => {' + window.FPS_JS + '})()'))() : null;
			await wait(1000);
			r.togglePerf();
			console.log('__prof__');
			const rows = [];
			for (let i = 0; i < ${SEC} * 2; i++) { await wait(500); rows.push(r.perf.el.textContent.split('\\n')); }
			run = false;
			// średnie wartości liczbowe z odczytów (pomijając pierwszy)
			const acc = {};
			for (const rw of rows.slice(2)) for (const line of rw) { const mm = line.match(/^(.{11})\\s*([-\\d.]+)/); if (mm) { const k = mm[1].trim(); (acc[k] = acc[k] || []).push(+mm[2]); } }
			const avg = {};
			for (const k in acc) avg[k] = +(acc[k].reduce((a, b) => a + b, 0) / acc[k].length).toFixed(2);
			const cv = r.gl.domElement;
			return { renderer: r.gpuName(), canvas: cv.width + '×' + cv.height, quality: r.quality && r.quality.name, usePost: r.usePost, avg, extra };
		})()`);
	} catch (e) { res = { error: String(e) }; }
	// FPS_SHOT=<plik.png> – zrzut okna po pomiarze
	if (process.env.FPS_SHOT) fsx.writeFileSync(process.env.FPS_SHOT, (await w.webContents.capturePage()).toPNG());
	console.log(JSON.stringify({ res, errs: [...errs].map(([k, n]) => n + '× ' + k) }, null, 1));
	app.exit(0);
});
