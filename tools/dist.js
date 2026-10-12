/* npm run dist / dist:dir: electron-builder dla Windows (instalator NSIS i wersja przenośna; --dir – tylko
   rozpakowana aplikacja w dist/win-unpacked). Wersje gry bywają dwuczęściowe (0.100), a electron-builder czyta
   package.json z dysku i potrzebuje trzech części (semver): na czas budowania package.json dostaje 0.100.0,
   a oryginał wraca na miejsce po zakończeniu – także po błędzie albo Ctrl+C. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const file = path.join(root, 'package.json');
const original = fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(original);
const version = pkg.version.split('.').length === 2 ? pkg.version + '.0' : pkg.version;
let restored = false;
const restore = () => {
	if (restored) return;
	restored = true;
	fs.writeFileSync(file, original);
};
process.on('exit', restore);
process.on('SIGINT', () => process.exit(130));
if (version !== pkg.version) fs.writeFileSync(file, original.replace(`"version": "${pkg.version}"`, `"version": "${version}"`));
const builder = require('electron-builder');
builder
	.build({ projectDir: root, targets: builder.Platform.WINDOWS.createTarget(process.argv.includes('--dir') ? 'dir' : null) })
	.then((files) => console.log(files.filter((f) => f.endsWith('.exe')).join('\n')))
	.catch((err) => {
		console.error(err.message || err);
		process.exitCode = 1;
	})
	.finally(restore);
