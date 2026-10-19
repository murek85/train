/* Kod WGSL wszystkich programów po wczytaniu menu (do porównania dwóch uruchomień – czy kod jest powtarzalny,
   inaczej pamięć podręczna potoków Dawn nie trafia):
     node_modules/electron/dist/electron.exe tools/render-check/wgsldump.js <port> <zapytanie> <plik.json> */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const [port, query, out] = process.argv.slice(-3);
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.whenReady().then(async () => {
	const w = new BrowserWindow({ width: 1280, height: 720, show: true, x: -4000, y: 0, focusable: false, skipTaskbar: true, frame: false, webPreferences: { backgroundThrottling: false } });
	await w.loadURL('http://localhost:' + port + '/?' + query);
	const res = await w.webContents.executeJavaScript(`(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const m = window.maszynista, r = m.renderer;
		for (let i = 0; i < 4800 && !(m.sim && r.world && r.world.pending === 0 && r.world.chunks.size && !r.hold); i++) await wait(25);
		const P = r.gl._pipelines.programs;
		return { vertex: [...P.vertex.keys()], fragment: [...P.fragment.keys()] };
	})()`);
	fs.writeFileSync(out, JSON.stringify(res));
	app.exit(0);
});
