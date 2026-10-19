#!/usr/bin/env node
/* npm run web: wersja przeglądarkowa do wgrania na serwer – folder web/maszynista/ z plikami gry i archiwum
   web/maszynista-<wersja>.zip (te same pliki). Tylko to, czego potrzebuje strona: index.html, style.css, favicon.ico, js/, vendor/three/ (three.core.js i three.module.js – WebGLRenderer),
   routes/ (trasy wbudowane i horyzonty), icons/, sounds/ (bez opisów .md). Bez serwera Node (server.js) Generator tras
   nie pobierze trzech źródeł bez nagłówków CORS (NMPT GUGiK, BDOT10k, Regulamin sieci PKP PLK) – reszta gry działa.
   ZIP składany w Node (zlib, bez dodatkowych pakietów). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web'), OUT = path.join(WEB, 'maszynista');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// pliki i foldery gry (ścieżki względem katalogu projektu)
const FILES = ['index.html', 'style.css', 'favicon.ico', 'vendor/three/three.core.js', 'vendor/three/three.module.js', 'vendor/three/three.webgpu.js', 'vendor/three/three.tsl.js', 'vendor/three/addons/tsl/display/FXAANode.js', 'vendor/three/LICENSE'];
const DIRS = ['js', 'routes', 'icons', 'sounds'];
const skip = (rel) => /\.md$/i.test(rel) || /(^|\/)\./.test(rel); // opisy i pliki ukryte

const list = [...FILES];
const walk = (dir) => {
	for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
		const rel = dir + '/' + e.name;
		if (skip(rel)) continue;
		if (e.isDirectory()) walk(rel);
		else list.push(rel);
	}
};
for (const d of DIRS) if (fs.existsSync(path.join(ROOT, d))) walk(d);

// folder web/ od nowa
fs.rmSync(WEB, { recursive: true, force: true });
for (const rel of list) {
	const dst = path.join(OUT, rel);
	fs.mkdirSync(path.dirname(dst), { recursive: true });
	fs.copyFileSync(path.join(ROOT, rel), dst);
}

// ZIP (deflate, sumy CRC-32, katalog centralny; nazwy UTF-8)
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
const parts = [], central = [];
let offset = 0;
for (const rel of list) {
	const data = fs.readFileSync(path.join(ROOT, rel));
	const packed = zlib.deflateRawSync(data, { level: 9 });
	const store = packed.length >= data.length;
	const body = store ? data : packed;
	const name = Buffer.from(rel, 'utf8'), crc = crc32(data);
	const head = Buffer.alloc(30);
	head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(store ? 0 : 8, 8);
	head.writeUInt16LE(dosTime, 10); head.writeUInt16LE(dosDate, 12); head.writeUInt32LE(crc, 14);
	head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
	parts.push(head, name, body);
	const cd = Buffer.alloc(46);
	cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(store ? 0 : 8, 10);
	cd.writeUInt16LE(dosTime, 12); cd.writeUInt16LE(dosDate, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20);
	cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
	central.push(cd, name);
	offset += 30 + name.length + body.length;
}
const cdSize = central.reduce((a, b) => a + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(list.length, 8); end.writeUInt16LE(list.length, 10);
end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
const zipName = `maszynista-${version}.zip`;
fs.writeFileSync(path.join(WEB, zipName), Buffer.concat([...parts, ...central, end]));

const size = list.reduce((a, rel) => a + fs.statSync(path.join(ROOT, rel)).size, 0);
const zsize = fs.statSync(path.join(WEB, zipName)).size;
const mb = (n) => (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
console.log(`Wersja przeglądarkowa ${version}: ${list.length} plików, ${mb(size)}`);
console.log(`  folder:   web/maszynista/  (zawartość wgraj do katalogu strony, np. public_html)`);
console.log(`  archiwum: web/${zipName}  (${mb(zsize)} – to samo w jednym pliku)`);
console.log('Bez serwera Node (server.js) Generator tras nie pobierze NMPT GUGiK, BDOT10k i Regulaminu sieci PKP PLK.');
