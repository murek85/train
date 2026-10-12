/* Zamienia vendor/three.module.js (moduł ES) na zwykły skrypt vendor/three.global.js z window.THREE,
   bo moduły ES nie wczytują się ze strony otwartej z dysku (file://).
   Uruchom po podmianie three.module.js:  npm run build:three */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'vendor', 'three.module.js');
const OUT = path.join(__dirname, '..', 'vendor', 'three.global.js');

const source = fs.readFileSync(SRC, 'utf8');
const at = source.lastIndexOf('\nexport {') + 1;
const statements = source.match(/^(export|import)\s/gm) || [];
if (at <= 0 || statements.length !== 1) throw Error('three.module.js: oczekiwano jednej listy export na końcu i braku import');
const list = source.slice(at + 'export {'.length, source.indexOf('}', at));
const entries = list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
	const [local, exported = local] = s.split(/\s+as\s+/);
	return `${exported}: ${local}`;
});
const body = source.slice(0, at);
fs.writeFileSync(OUT, `/* Three.js – wersja skryptowa wygenerowana przez tools/build-three.js. Nie edytuj. */\n(function () {\n${body}\nwindow.THREE = Object.freeze({ ${entries.join(', ')} });\n})();\n`);
console.log('Zapisano', path.relative(process.cwd(), OUT), (fs.statSync(OUT).size / 1024).toFixed(0) + ' KiB');
