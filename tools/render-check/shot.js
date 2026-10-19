/* Zrzut z jazdy do porównań WebGL / WebGPU (Electron, okno poza ekranem – bez dławienia klatek):
     node_modules/electron/dist/electron.exe tools/render-check/shot.js <port> <plik bez .png> <godzina> <zapytanie | ->
   gra z serwera (npm start) na porcie <port>; zapytanie np. webgpu, webgpu=gl, webgpu&gputime; - – bez (WebGL).
   Zmienne: SHOT_Q – jakość (low – bez efektów po renderowaniu, do porównań materiałów), SHOT_CASE – scena (case.js:
   rain, snow, cab…), SHOT_JS – plik z kodem wykonanym przed zrzutem (wynik w polu extra; np. case.js, perf.js, lights.js).
   Wypisuje JSON: tryb, wywołania, kawałki świata, obiekty GLSL bez odpowiednika (shader) i błędy konsoli. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const [port, out, hour, query] = process.argv.slice(-4);
const url = 'http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query);
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	const errs = [];
	w.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') errs.push(e.level + ': ' + e.message.slice(0, 400)); });
	await w.loadURL(url);
	if (process.env.SHOT_JS) await w.webContents.executeJavaScript('window.SHOT_JS = ' + JSON.stringify(require('fs').readFileSync(process.env.SHOT_JS, 'utf8')));
	if (process.env.SHOT_CASE) await w.webContents.executeJavaScript('window.SHOT_CASE = ' + JSON.stringify(process.env.SHOT_CASE));
	if (process.env.SHOT_Q) await w.webContents.executeJavaScript('window.SHOT_Q = ' + JSON.stringify(process.env.SHOT_Q));
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	await wait(2500);
	let res;
	try {
		res = await w.webContents.executeJavaScript(`(async () => {
			const wait = (ms) => new Promise((r) => setTimeout(r, ms));
			document.querySelector('.scr-boot')?.remove();
			await wait(1200);
			document.getElementById('btn-start').click();
			for (let i = 0; i < 1200 && document.querySelector('.scr-load'); i++) await wait(250);
			const s = window.maszynista.sim;
			s.route.startClock = ${hour} * 3600 - s.time;
			if (window.SHOT_Q) { window.maszynista.renderer.setQuality(window.SHOT_Q); await wait(500); for (let i = 0; i < (window.SHOT_JS ? 40 : 400) && window.maszynista.renderer.world.pending; i++) await wait(250); }
			await wait(5000);
			const r = window.maszynista.renderer;
			const extra = window.SHOT_JS ? await (0, eval)('(async () => {' + window.SHOT_JS + '})()') : null;
			return { extra, time: s.time, gpu: !!window.Train3D.gpu, backend: r.gl.backend ? (r.gl.backend.isWebGPUBackend ? 'webgpu' : 'webgl2') : 'webgl', calls: r.gl.info.render.calls, gpuName: r.gpuName(), pending: r.world.pending, chunks: r.world.chunks.size, tris: r.gl.info.render.triangles, meshes: (() => { let n = 0, v = 0; r.scene.traverse((o) => { if (o.isMesh) { n++; let vis = true; for (let q = o; q; q = q.parent) vis = vis && q.visible; if (vis) v++; } }); return n + '/' + v; })(), worldVis: r.world.group ? r.world.group.visible : '?', shader: (() => { const out = []; r.scene.traverse((o) => { if (o.material && !Array.isArray(o.material) && !o.material.isNodeMaterial && o.material.type === 'ShaderMaterial') { let v = true; for (let q = o; q; q = q.parent) v = v && q.visible; out.push((o.name || o.type) + ':' + (o.parent && o.parent.type) + ':' + v + ':' + o.material.vertexShader.slice(0, 50)); } }); return out; })() };
		})()`);
	} catch (e) { res = { error: String(e) }; }
	fs.writeFileSync(out + '.png', (await w.webContents.capturePage()).toPNG());
	console.log(JSON.stringify({ res, errs: [...new Set(errs)].filter((e) => !e.includes('Security Warning')) }, null, 1));
	app.exit(0);
});
