#!/usr/bin/env node
/* Kontrola tras (js/route-check.js) z wiersza poleceń:
     node tools/route-check.js                 – wszystkie trasy z routes/
     node tools/route-check.js rybnik-katowice – trasa z routes/ po id
     node tools/route-check.js plik.trasa      – plik eksportu z Generatora tras (.trasa – gzip, .json, .js)
   Kod wyjścia 1, gdy którakolwiek trasa ma błąd (uwagi informacyjne nie przerywają). */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const R = require('../js/routes.js');
const RC = require('../js/route-check.js');

function load(arg) {
	const local = path.join(__dirname, '..', 'routes', arg.replace(/\.js$/, '') + '.js');
	if (fs.existsSync(local)) return [require(local)];
	let bytes = fs.readFileSync(arg);
	if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = zlib.gunzipSync(bytes);
	const text = bytes.toString('utf8').replace(/^﻿/, '').trim();
	if (text.startsWith('{') || text.startsWith('[')) {
		const obj = JSON.parse(text);
		return Array.isArray(obj) ? obj : obj.routes || [obj];
	}
	const a = text.indexOf('})({'), b = text.lastIndexOf('});');
	return [JSON.parse(text.slice(a + 3, b + 1))];
}

const args = process.argv.slice(2);
const list = args.length ? args : fs.readdirSync(path.join(__dirname, '..', 'routes')).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));
let bad = 0;
for (const arg of list) {
	for (const def of load(arg)) {
		const route = R.prepare(def, R.normConfig(def, null));
		const out = RC.check(route);
		const w = out.filter((x) => x.lvl === 'warn');
		if (w.length) bad++;
		console.log(`${def.id} (${def.title}): ${w.length} błędów, ${out.length - w.length} uwag`);
		for (const x of out) console.log(`  ${x.lvl === 'warn' ? '⚠' : '·'} km ${(x.pos / 1000).toFixed(2)} ${x.m}\n      → ${x.fix}`);
	}
}
process.exit(bad ? 1 : 0);
