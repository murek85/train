// electron cpuprof.js <port> <query>: start jazdy, rozgrzanie 8 s, profil CPU 3 s – najdroższe funkcje (czas własny)
const { app, BrowserWindow } = require('electron');
const [port, query] = process.argv.slice(-2);
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	await w.loadURL('http://localhost:' + port + '/' + (query === '-' ? '' : '?' + query));
	await new Promise((r) => setTimeout(r, 2500));
	await w.webContents.executeJavaScript(`(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		document.querySelector('.scr-boot')?.remove();
		await wait(1200);
		document.getElementById('btn-start').click();
		for (let i = 0; i < 1200 && document.querySelector('.scr-load'); i++) await wait(250);
		await wait(8000);
	})()`);
	const dbg = w.webContents.debugger;
	dbg.attach('1.3');
	await dbg.sendCommand('Profiler.enable');
	await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 });
	await dbg.sendCommand('Profiler.start');
	await new Promise((r) => setTimeout(r, 3000));
	const { profile } = await dbg.sendCommand('Profiler.stop');
	const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
	const dt = profile.timeDeltas; let total = 0;
	profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = (f.functionName || '(anon)') + ' ' + f.url.split('/').pop() + ':' + f.lineNumber; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); total += dt[i] || 0; });
	const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 35).map(([k, v]) => (v / 1000).toFixed(0).padStart(6) + ' ms ' + (100 * v / total).toFixed(1).padStart(5) + '% ' + k);
	console.log(top.join('\n'));
	app.exit(0);
});
