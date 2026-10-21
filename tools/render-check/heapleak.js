/* Pamięć JS przy zmianach trasy w menu (Electron, okno poza ekranem): sterta po gc po każdej zmianie (na przemian inna trasa
   i pierwsza) i spis obiektów sterty (Runtime.queryObjects) – liczba obiektów według konstruktora i bajty buforów
   (ArrayBuffer) – po rozgrzaniu i po ostatniej zmianie; na końcu to, czego przybyło najwięcej. Profil tymczasowy.
     node_modules/electron/dist/electron.exe tools/render-check/heapleak.js <port> <zapytanie | ->
   HEAP_N – liczba zmian trasy (domyślnie 6), HEAP_CENSUS=0 – bez spisu (sama sterta), HEAP_ROUTE – indeks innej trasy */
const { app, BrowserWindow } = require('electron');
const fsx = require('fs');
const [port, query] = process.argv.slice(-2);
const quit = require('./tmpprofile.js')(app, 'heapleak');   // profil przeglądarki tymczasowy, usuwany po wyjściu
process.on('unhandledRejection', (e) => { console.log('błąd:', e && e.stack || e); quit(); });
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('js-flags', '--expose-gc');
const N = +(process.env.HEAP_N || 6);
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	const errs = [];
	w.webContents.on('console-message', (e) => { if (e.level === 'error') errs.push(e.message.slice(0, 300)); });
	await w.loadURL('http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query));
	const js = (s) => w.webContents.executeJavaScript(s);
	const dbg = w.webContents.debugger;
	dbg.attach('1.3');
	await dbg.sendCommand('Runtime.enable');
	const heap = async () => { await js('(async () => { for (let i = 0; i < 3; i++) { window.gc(); await new Promise((r) => setTimeout(r, 300)); } })()'); return js('Math.round(performance.memory.usedJSHeapSize / 1048576)'); };
	// spis: wszystkie obiekty z Object.prototype w łańcuchu według konstruktora (+ bajty ArrayBuffer według konstruktora widoku nie da się – osobno suma)
	const census = async () => {
		await heap();
		const out = {};
		for (const [label, expr] of [['obj', 'Object.prototype'], ['ab', 'ArrayBuffer.prototype']]) {
			const { result: proto } = await dbg.sendCommand('Runtime.evaluate', { expression: expr });
			const { objects } = await dbg.sendCommand('Runtime.queryObjects', { prototypeObjectId: proto.objectId });
			const fn = label === 'ab'
				? 'function () { let n = 0, b = 0; for (const a of this) { n++; b += a.byteLength; } return JSON.stringify({ n, b }); }'
				: 'function () { const m = {}; for (const o of this) { let k; try { const c = Object.getPrototypeOf(o); k = c && Object.prototype.hasOwnProperty.call(c, "constructor") && typeof c.constructor === "function" ? c.constructor.name || "(anon)" : c === null ? "(null)" : "(" + ((c.constructor && c.constructor.name) || "?") + ")"; } catch { k = "?"; } m[k] = (m[k] || 0) + 1; } return JSON.stringify(m); }';
			const { result } = await dbg.sendCommand('Runtime.callFunctionOn', { objectId: objects.objectId, functionDeclaration: fn, returnByValue: true });
			out[label] = JSON.parse(result.value);
			await dbg.sendCommand('Runtime.releaseObject', { objectId: objects.objectId });
			await dbg.sendCommand('Runtime.releaseObject', { objectId: proto.objectId });
		}
		return out;
	};
	// rozgrzanie: koniec wczytywania i kompilacji w tle po starcie (jak menuops.js)
	await js(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const m = window.maszynista, r = m.renderer; for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size && !r.hold); i++) await wait(25); document.querySelector('.scr-boot')?.remove(); await wait(8000); const box = document.getElementById('route-loading'); for (let i = 0; i < 2400 && (!box.classList.contains('hidden') || (r.pipes && r.pipes.n) || r.world.pending); i++) await wait(25); await wait(2000); })()`);
	const routeOp = (other) => js(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const r = window.maszynista.renderer; const box = document.getElementById('route-loading'); const routes = [...document.querySelectorAll('#route-list button.route')]; if (!window.__first) window.__first = routes.findIndex((b) => b.classList.contains('sel')) + 1; const first = window.__first - 1; const other = ${JSON.stringify(process.env.HEAP_ROUTE || '')} !== '' ? +${JSON.stringify(process.env.HEAP_ROUTE || '0')} : routes.findIndex((b, i) => i !== first); (${other} ? routes[other] : routes[first]).click(); await wait(200); for (let i = 0; i < 4800 && !box.classList.contains('hidden'); i++) await wait(25); for (let i = 0; i < 2400 && ((r.pipes && r.pipes.n) || r.world.pending); i++) await wait(25); await wait(3000); return routes.findIndex((b) => b.classList.contains('sel')); })()`);
	if (process.env.HEAP_SNAP) {
		/* HEAP_SNAP=<plik> – migawka sterty (HeapProfiler) po trzech zmianach trasy; obiekty sceny sprzed zmian (grupa – płaski napis; klasa znacznika bez domknięcia – nie trzyma zmiennych skryptu)
		   oznaczone właściwością __stary (obiekt klasy StaryObiekt) – ścieżki trzymania: heappath.js <plik> */
		await js(`(() => { const r = window.maszynista.renderer, chunks = new Set([...r.world.chunks.values()].map((c) => c.group)); const StaryObiekt = new Function('return class StaryObiekt {}')(); let n = 0; r.scene.traverse((o) => { let t = o; while (t.parent && t.parent !== r.scene) t = t.parent; const k = new StaryObiekt(); k.grupa = JSON.parse(JSON.stringify((chunks.has(t) ? 'kawałek' : t.name || t.type) + ' / ' + (o.isBundleGroup ? 'paczka' : o.type))); o.__stary = k; n++; }); return n; })()`);
		await routeOp(true); await routeOp(false); await routeOp(true);
		await heap();
		await dbg.sendCommand('HeapProfiler.enable');
		const fd = fsx.openSync(process.env.HEAP_SNAP, 'w');
		let bytes = 0;
		dbg.on('message', (e, method, p) => { if (method === 'HeapProfiler.addHeapSnapshotChunk') { fsx.writeSync(fd, p.chunk); bytes += p.chunk.length; } });
		await dbg.sendCommand('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
		fsx.closeSync(fd);
		console.log('migawka: ' + Math.round(bytes / 1048576) + ' MB → ' + process.env.HEAP_SNAP);
		quit();
		return;
	}
	if (process.env.HEAP_PATH) {
		/* HEAP_PATH=1 – kto trzyma stare obiekty: WeakRef do siatek sceny (grupa: najwyższy przodek pod sceną) przed dwiema
		   zmianami trasy, potem które żyją po gc i ścieżka od nich wstecz (skan właściwości obiektów, wpisów Map/Set i tablic –
		   bez domknięć i WeakMap) do korzenia (renderer gry, window) */
		await js(`(() => { const r = window.maszynista.renderer, chunks = new Set([...r.world.chunks.values()].map((c) => c.group)); window.__wr = []; r.scene.traverse((o) => { if (!o.isMesh && !o.isBundleGroup) return; let t = o; while (t.parent && t.parent !== r.scene) t = t.parent; window.__wr.push([new WeakRef(o), (chunks.has(t) ? 'kawałek' : t.name || t.type) + (o.isBundleGroup ? ' [paczka]' : '')]); }); return window.__wr.length; })()`);
		await routeOp(true); await routeOp(false); await routeOp(true);
		await heap();
		const alive = await js(`(() => { const m = {}, all = {}; for (const [w, k] of window.__wr) { all[k] = (all[k] || 0) + 1; if (w.deref()) m[k] = (m[k] || 0) + 1; } return { alive: m, all }; })()`);
		console.log('żyje po zmianach (grupa: żywe / wszystkie):', JSON.stringify(alive));
		const { result: proto } = await dbg.sendCommand('Runtime.evaluate', { expression: 'Object.prototype' });
		const { objects } = await dbg.sendCommand('Runtime.queryObjects', { prototypeObjectId: proto.objectId });
		await dbg.sendCommand('Runtime.callFunctionOn', { objectId: objects.objectId, functionDeclaration: 'function () { window.__all = this; }' });
		await dbg.sendCommand('Runtime.releaseObject', { objectId: objects.objectId });
		const paths = await js(`(() => {
			const all = window.__all; delete window.__all;
			const r = window.maszynista.renderer, roots = new Map([[r, 'renderer'], [window.maszynista, 'maszynista'], [window, 'window'], [r.gl, 'gl'], [r.scene, 'scene']]);
			const name = (o) => { try { const c = Object.getPrototypeOf(o); return (c && c.constructor && c.constructor.name) || '?'; } catch { return '?'; } };
			const skip = new Set([all, window.__wr]);
			const out = [];
			const picks = [], seenK = new Set();
			for (const [w, k] of window.__wr) { const o = w.deref(); if (o && !seenK.has(k)) { seenK.add(k); picks.push([o, k]); } }
			for (const [target, k] of picks.slice(0, 6)) {
				// wstecz: rodzic każdego obiektu z bieżącej granicy (pierwszy znaleziony), aż do korzenia
				const par = new Map([[target, null]]);
				let frontier = new Set([target]), last = frontier, hit = null;
				for (let depth = 0; depth < 30 && frontier.size && !hit; depth++) {
					const next = new Set();
					const see = (o, v, key) => { if (v && (typeof v === 'object' || typeof v === 'function') && frontier.has(v) && !par.has(o) && !skip.has(o)) { par.set(o, [v, key]); next.add(o); if (roots.has(o)) hit = o; } };
					for (const o of all) {
						if (skip.has(o) || par.has(o)) continue;
						try {
							if (o instanceof Map) { for (const [a, b] of o) { see(o, a, 'klucz Map'); see(o, b, 'wartość Map'); } }
							else if (o instanceof Set) { for (const a of o) see(o, a, 'Set'); }
							if (Array.isArray(o)) { for (let i = 0; i < o.length && !par.has(o); i++) see(o, o[i], '[' + i + ']'); }
							else for (const key of Object.getOwnPropertyNames(o)) { if (par.has(o)) break; const d = Object.getOwnPropertyDescriptor(o, key); if (d && 'value' in d) see(o, d.value, key); }
						} catch {}
						if (hit) break;
					}
					if (next.size) last = next; frontier = next;
				}
				const chain = [];
				for (let q = hit; q; q = par.get(q) && par.get(q)[0]) { const p = par.get(q); chain.push((roots.get(q) || name(q)) + (p ? ' .' + p[1] : '')); if (chain.length > 40) break; }
				out.push(k + ': ' + (hit ? chain.join(' → ') : 'brak ścieżki przez właściwości (domknięcie / WeakMap?) – granica: ' + [...last].slice(0, 8).map((o) => { const p = par.get(o); return name(o) + (p ? ' .' + p[1] : ''); }).join(', ')));
			}
			return out;
		})()`);
		console.log(paths.join('\n'));
		quit();
		return;
	}
	const doCensus = process.env.HEAP_CENSUS !== '0';
	const H = [['start', await heap()]];
	const c0 = doCensus ? await census() : null;
	for (let i = 0; i < N; i++) {
		const sel = await routeOp(i % 2 === 0);
		H.push([(i % 2 === 0 ? 'inna' : 'pierwsza') + ' #' + sel, await heap()]);
		console.log(H[H.length - 1].join(' '), 'MB');
	}
	if (doCensus) {
		const c1 = await census();
		const d = Object.keys({ ...c0.obj, ...c1.obj }).map((k) => [k, (c1.obj[k] || 0) - (c0.obj[k] || 0), c1.obj[k] || 0]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]);
		console.log('--- przybyło obiektów (konstruktor, różnica, teraz):');
		console.log(d.slice(0, 60).map((x) => String(x[1]).padStart(9) + ' ' + String(x[2]).padStart(9) + ' ' + x[0]).join('\n'));
		console.log('--- ArrayBuffer: ' + c0.ab.n + ' / ' + Math.round(c0.ab.b / 1048576) + ' MB → ' + c1.ab.n + ' / ' + Math.round(c1.ab.b / 1048576) + ' MB');
	}
	console.log(JSON.stringify({ heap: H, errs: [...new Set(errs)] }));
	quit();
});
