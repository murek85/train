/* Paczki statycznego świata w WebGPU (Electron, okno poza ekranem, profil tymczasowy): start jazdy z ustawieniami jak
   w zgłoszeniu (Orzesze Jaśkowice – Mikołów, ET22 + 3× Bdhpumn, jakość wysoka, lato), obrót kamery, pauza → pora roku
   (SEASON, domyślnie wiosna), obrót kamery. Przy każdym odtworzeniu paczki (BundleGroup) porównuje zasoby nagrane
   w koderze paczki (powiązania, bufory wierzchołków i indeksów, potok) z bieżącymi zasobami jej obiektów i liczy
   obiekty z inną kamerą niż paczka (obce – z zagnieżdżonego renderu albo wspólne z innym przebiegiem).
     node_modules/electron/dist/electron.exe tools/render-check/bundles.js <port> <zapytanie | ->   (ROUTE=… SEASON=…) */
const { app, BrowserWindow } = require('electron');
const os = require('os'), fsx = require('fs'), pathx = require('path');
const [port, query] = process.argv.slice(-2);
const tmpProfile = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'maszynista-bundles-'));
app.setPath('userData', tmpProfile);
app.on('quit', () => { try { fsx.rmSync(tmpProfile, { recursive: true, force: true }); } catch {} });
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const LS = { 'maszynista.opt.quality': '"high"', 'maszynista.opt.autoDetail': 'false', 'maszynista.opt.render': '{"scale":1,"aa":true,"shadows":true}', 'maszynista.route': '"' + (process.env.ROUTE || 'orzesze-mikolow') + '"', 'maszynista.trainCfg': '{"loco":"ET22","lv":"cargo","cars":[{"t":"Bdhpumn","v":"pkp"},{"t":"Bdhpumn","v":"pkp"},{"t":"Bdhpumn","v":"pkp"}]}', 'maszynista.opt.season': '"summer"', 'maszynista.opt.weather': '"clear"', 'maszynista.opt.time': '"08:00"' };
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 960, height: 914, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	const errs = new Map();
	w.webContents.on('console-message', (e) => { if (e.level === 'error') { const k = e.message.slice(0, 200); errs.set(k, (errs.get(k) || 0) + 1); } });
	const url = 'http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query);
	await w.loadURL(url);
	await w.webContents.executeJavaScript(`(() => { const L = ${JSON.stringify(LS)}; for (const k in L) localStorage.setItem(k, L[k]); })()`);
	await w.loadURL(url);
	let res;
	try {
		res = await w.webContents.executeJavaScript(`(async () => {
			const wait = (ms) => new Promise((r) => setTimeout(r, ms));
			const raf = () => new Promise((q) => requestAnimationFrame(q));
			const m = window.maszynista, r = m.renderer, gl = r.gl, B = gl.backend;
			for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size && !r.hold); i++) await wait(25);
			await wait(1000);
			document.querySelector('.scr-boot')?.remove();
			document.getElementById('btn-start').click();
			for (let i = 0; i < 4800; i++) { await wait(25); if (i > 8 && !document.querySelector('.scr-load')) break; }
			await wait(3000);
			const Bi = gl._bindings, P = gl._pipelines;
			const F = { n: 0, foreign: 0 }, bad = new Map(), stale = new Set(), foreign = new Map();
			// zasoby ustawione w koderze paczki
			const recs = new WeakMap(), byBundle = new WeakMap();
			const E = GPURenderBundleEncoder.prototype;
			const note = (enc, x) => { let s = recs.get(enc); if (!s) recs.set(enc, (s = new Set())); s.add(x); };
			const sbg = E.setBindGroup; E.setBindGroup = function (i, g, ...a) { note(this, g); return sbg.call(this, i, g, ...a); };
			const svb = E.setVertexBuffer; E.setVertexBuffer = function (i, b, ...a) { note(this, b); return svb.call(this, i, b, ...a); };
			const sib = E.setIndexBuffer; E.setIndexBuffer = function (b, ...a) { note(this, b); return sib.call(this, b, ...a); };
			const sp = E.setPipeline; E.setPipeline = function (p) { note(this, p); return sp.call(this, p); };
			const fb = B.finishBundle.bind(B);
			B.finishBundle = (ctx, bundle) => { const enc = B.get(ctx).currentPass; const x = fb(ctx, bundle); byBundle.set(bundle, { set: recs.get(enc) || new Set(), frame: F.n }); return x; };
			const path = (o) => { const p = []; for (let q = o; q && p.length < 4; q = q.parent) p.push((q.name || q.type) + (q.isInstancedMesh ? '[I' + q.count + ']' : '')); return p.join(' < '); };
			const camName = (c) => (c === r.camera ? 'główna' : c.isOrthographicCamera ? 'cień' : 'inna');
			const mat = (ro) => ro.material.patchVariant || ro.material.type;
			const rb = gl._renderBundle.bind(gl);
			gl._renderBundle = (bundle, s, l) => {
				const x = rb(bundle, s, l);
				const rbo = gl._bundles.get(bundle.bundleGroup, bundle.camera, gl._currentRenderContext), d = B.get(rbo), R = byBundle.get(rbo);
				if (!R) return x;
				for (const ro of d.renderObjects || []) {
					if (ro.camera !== bundle.camera) { F.foreign++; const k = camName(bundle.camera) + ' > ' + camName(ro.camera) + ' · ' + mat(ro); foreign.set(k, (foreign.get(k) || 0) + 1); continue; }
					const miss = [];
					Bi.getForRender(ro).forEach((g, i) => { const gg = B.get(g).group; if (gg && !R.set.has(gg)) miss.push('grupa ' + i + ' (' + g.bindings.map((b) => (b.groupNode && b.groupNode.name) || b.name || b.constructor.name).join('/') + ')'); });
					for (const vb of ro.getVertexBuffers()) { const gb = B.get(vb).buffer; if (gb && !R.set.has(gb)) miss.push('bufor wierzchołków' + (vb.isInstancedInterleavedBuffer ? ' instancji' : '')); }
					const ix = ro.getIndex(); if (ix) { const gb = B.get(ix).buffer; if (gb && !R.set.has(gb)) miss.push('indeksy'); }
					const pp = P.get(ro), gp = pp && pp.pipeline && B.get(pp.pipeline).pipeline; if (gp && !R.set.has(gp)) miss.push('potok');
					if (miss.length) { stale.add(F.n); const k = camName(bundle.camera) + ' · ' + miss.join(', ') + ' · ' + mat(ro) + ' · ' + path(ro.object); const e = bad.get(k) || { n: 0, first: F.n, rec: R.frame }; e.n++; bad.set(k, e); }
				}
				return x;
			};
			const spin = async (sec) => { const t0 = performance.now(); while (performance.now() - t0 < sec * 1000) { r.yaw += 0.02; await raf(); F.n++; } };
			const dump = () => { const o = [...bad].sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([k, e]) => e.n + '× (od klatki ' + e.first + ', nagrana w ' + e.rec + ') ' + k); bad.clear(); return o; };
			await spin(3);
			const before = dump();
			document.getElementById('btn-pause').click();
			await wait(800);
			const s = document.getElementById('pause-season'); s.value = ${JSON.stringify(process.env.SEASON || 'spring')}; s.dispatchEvent(new Event('change'));
			const box = document.getElementById('route-loading');
			await wait(300);
			const tChange = F.n;
			for (let i = 0; i < 4800 && !box.classList.contains('hidden'); i++) { await raf(); F.n++; }
			const tClosed = F.n;
			await spin(6);
			return { renderer: r.gpuName(), frames: F.n, zmiana: tChange, zamkniete: tClosed, klatkiZNieaktualnymi: stale.size, obce: F.foreign, obceRodzaje: [...foreign].slice(0, 20).map(([k, v]) => v + '× ' + k), przedZmiana: before, poZmianie: dump() };
		})()`);
	} catch (e) { res = { error: String(e) }; }
	console.log(JSON.stringify({ res, errs: [...errs].map(([k, n]) => n + '× ' + k) }, null, 1));
	app.exit(0);
});
