/* Budowy shaderów (NodeBuilder) w czasie wczytywania jazdy – ile, jak długo, dla jakich materiałów (WebGPU):
     node_modules/electron/dist/electron.exe tools/render-check/builds.js <port> <zapytanie> [menu]
   „menu” – licz także start gry (do gotowego menu). Wypisuje JSON. */
const { app, BrowserWindow } = require('electron');
const args = process.argv.slice(2).filter((a) => !a.startsWith('-') || a === '-');
const withMenu = args[args.length - 1] === 'menu';
const [port, query] = withMenu ? args.slice(-3, -1) : args.slice(-2);
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const HOOK = `(() => {
	const r = window.maszynista.renderer, B = window.__builds = [];
	r.gl.debug.onNodeBuilderCreated = (nb, ro) => {
		const b = nb.build.bind(nb);
		nb.build = (...a) => {
			const t = performance.now(), out = b(...a), m = ro.material, o = ro.object;
			B.push({ ms: performance.now() - t, key: (m.patchVariant ? m.patchVariant : m.type) + (m.patchHooks && m.patchHooks.tag ? '/' + m.patchHooks.tag : '') + (ro.camera.isOrthographicCamera ? ' [cień]' : '') + ' ' + o.type + (o.isInstancedMesh ? '·inst' : '') + (o.isBatchedMesh ? '·batch' : ''), mat: m.uuid, name: m.name || o.name || '' });
			return out;
		};
	};
})()`;
const REPORT = `(() => {
	const B = window.__builds, by = new Map(), r = window.maszynista.renderer;
	for (const b of B) { const e = by.get(b.key) || { n: 0, ms: 0, mats: new Set() }; e.n++; e.ms += b.ms; e.mats.add(b.mat); by.set(b.key, e); }
	const tot = B.reduce((s, b) => s + b.ms, 0);
	const mats = new Set(); r.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.uuid)); });
	return { builds: B.length, ms: Math.round(tot), avg: +(tot / Math.max(1, B.length)).toFixed(1), sceneMaterials: mats.size, nodeCache: r.gl._nodes.nodeBuilderCache.size, vsPrograms: r.gl._pipelines.programs.vertex.size, fsPrograms: r.gl._pipelines.programs.fragment.size, pipelines: r.gl._pipelines.caches.size,
		top: [...by].sort((a, b) => b[1].ms - a[1].ms).slice(0, 30).map(([k, e]) => Math.round(e.ms) + ' ms · ' + e.n + '× · ' + e.mats.size + ' mat · ' + k) };
})()`;
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	if (withMenu) w.webContents.on('dom-ready', () => w.webContents.executeJavaScript(`(async () => { for (let i = 0; i < 400 && !(window.maszynista && window.maszynista.renderer); i++) await new Promise((r) => setTimeout(r, 5)); ${HOOK}; })()`));
	await w.loadURL('http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query));
	const out = {};
	await w.webContents.executeJavaScript(`(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const m = window.maszynista, r = m.renderer;
		for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size); i++) await wait(25);
		await wait(1500);
		document.querySelector('.scr-boot')?.remove();
	})()`);
	if (withMenu) out.menu = await w.webContents.executeJavaScript(REPORT);
	await w.webContents.executeJavaScript(HOOK);
	await w.webContents.executeJavaScript(`(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		document.getElementById('btn-start').click();
		for (let i = 0; i < 4800; i++) { await wait(25); if (i > 8 && !document.querySelector('.scr-load')) break; }
	})()`);
	out.ride = await w.webContents.executeJavaScript(REPORT);
	console.log(JSON.stringify(out, null, 1));
	app.exit(0);
});
