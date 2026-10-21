/* Tymczasowy profil przeglądarki dla skryptów Electron: katalog %TEMP%/maszynista-<nazwa>-*, usuwany po wyjściu.
   Przy zdarzeniu „quit” Chromium jeszcze trzyma katalog (EPERM), a app.exit go w ogóle nie wywołuje – usuwa go odłączony
   proces pomocniczy (Electron jako node), który czeka na koniec procesu skryptu. Profile z przerwanych uruchomień
   (starsze niż 10 min) usuwane przy następnym starcie skryptu.
     const quit = require('./tmpprofile.js')(app, 'menuops');   …   quit();   // app.quit, zapasowo app.exit po 5 s */
const os = require('os'), fsx = require('fs'), pathx = require('path'), { spawn } = require('child_process');
module.exports = (app, name) => {
	const prefix = 'maszynista-' + name + '-';
	for (const d of fsx.readdirSync(os.tmpdir())) if (d.startsWith(prefix)) try { const p = pathx.join(os.tmpdir(), d); if (Date.now() - fsx.statSync(p).mtimeMs > 600000) fsx.rmSync(p, { recursive: true, force: true }); } catch {}
	const dir = fsx.mkdtempSync(pathx.join(os.tmpdir(), prefix));
	app.setPath('userData', dir);
	let cleaner = false;
	const clean = () => {
		if (cleaner) return;
		cleaner = true;
		const code = `const fs = require('fs'), [pid, dir] = process.argv.slice(-2), t0 = Date.now();
			const alive = () => { try { process.kill(+pid, 0); return true; } catch { return false; } };
			const tick = () => { if (alive() && Date.now() - t0 < 60000) return setTimeout(tick, 200); try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch {} };
			tick();`;
		try { spawn(process.execPath, ['-e', code, String(process.pid), dir], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch {}
	};
	app.on('will-quit', clean);
	process.on('exit', clean);
	return () => { clean(); app.quit(); setTimeout(() => app.exit(0), 5000); };
};
