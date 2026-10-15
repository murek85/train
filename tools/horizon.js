#!/usr/bin/env node
/* Horyzont z prawdziwego terenu dla tras wbudowanych (routes/*.js) → routes/horizon/<id>.js.
   Powiązanie z mapą: stacje trasy z OpenStreetMap (współrzędne) ↔ położenia stacji w grze (js/horizon-data.js fitGeo).
   Wysokości: kafle terenu AWS „Terrain Tiles” (format Terrarium, przybliżenie 10 – ok. 100 m na piksel; źródła danych:
   SRTM, GMTED, ETOPO1 i inne – © Mapzen i dostawcy, https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
   Użycie: node tools/horizon.js [id …] – bez argumentów wszystkie trasy rzeczywiste. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const R = require('../js/routes.js');
const HD = require('../js/horizon-data.js');
const OSM = require('../js/osm-route.js');

const ROOT = path.join(__dirname, '..');
const Z = 10;

// PNG (8 bitów, RGB albo RGBA, bez przeplotu) → { w, h, ch, px }
function decodePng(buf) {
	let p = 8, w = 0, h = 0, ch = 3;
	const idat = [];
	while (p < buf.length) {
		const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
		if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ch = data[9] === 6 ? 4 : 3; if (data[8] !== 8 || data[12]) throw new Error('nieobsługiwany PNG'); }
		else if (type === 'IDAT') idat.push(data);
		else if (type === 'IEND') break;
		p += 12 + len;
	}
	const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, px = Buffer.alloc(h * stride);
	for (let y = 0; y < h; y++) {
		const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		for (let x = 0; x < stride; x++) {
			const a = x >= ch ? px[y * stride + x - ch] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0;
			let v = src[x];
			if (f === 1) v += a;
			else if (f === 2) v += b;
			else if (f === 3) v += (a + b) >> 1;
			else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
			px[y * stride + x] = v & 255;
		}
	}
	return { w, h, ch, px };
}

const tiles = new Map();
async function tile(x, y) {
	const k = x + '/' + y;
	if (!tiles.has(k)) {
		const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
		if (!res.ok) throw new Error(`kafel ${k}: HTTP ${res.status}`);
		tiles.set(k, decodePng(Buffer.from(await res.arrayBuffer())));
	}
	return tiles.get(k);
}
const n = 2 ** Z;
const tx = (lon) => ((lon + 180) / 360) * n;
const ty = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n; };

// wszystkie kafle w prostokącie (pobrane z góry) → elevAt(lat, lon), dwuliniowo
async function sampler(b) {
	const x0 = Math.floor(tx(b.lonMin)), x1 = Math.floor(tx(b.lonMax)), y0 = Math.floor(ty(b.latMax)), y1 = Math.floor(ty(b.latMin));
	const jobs = [];
	for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push([x, y]);
	console.log(`  kafle terenu: ${jobs.length}`);
	for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(([x, y]) => tile(x, y)));
	const px = (X, Y) => {
		const T = tiles.get(Math.floor(X / 256) + '/' + Math.floor(Y / 256));
		if (!T) return NaN;
		const o = ((Y % 256) * T.w + (X % 256)) * T.ch;
		return T.px[o] * 256 + T.px[o + 1] + T.px[o + 2] / 256 - 32768;
	};
	return (lat, lon) => {
		const X = tx(lon) * 256 - 0.5, Y = ty(lat) * 256 - 0.5, i = Math.floor(X), j = Math.floor(Y), u = X - i, v = Y - j;
		return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - v) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * v;
	};
}

(async () => {
	const want = process.argv.slice(2);
	const files = fs.readdirSync(path.join(ROOT, 'routes')).filter((f) => f.endsWith('.js'));
	fs.mkdirSync(path.join(ROOT, 'routes', 'horizon'), { recursive: true });
	for (const f of files) {
		const def = require(path.join(ROOT, 'routes', f));
		if (!def.real || (want.length && !want.includes(def.id))) continue;
		console.log(`${def.id}:`);
		const route = R.prepare(def);
		// stacje z OSM; przy kilku węzłach o tej samej nazwie – najbliższy dopasowaniu z pozostałych
		const found = await OSM.findStations(route.stations.map((s) => s.name), (m) => console.log('  ' + m));
		const tp = {};
		const game = route.stations.map((s) => { R.trackPoint(route, s.pos, tp); return [tp.x, tp.z]; });
		const cand = route.stations.map((s) => found.filter((x) => x.name === s.name));
		const uniq = cand.map((c, i) => (c.length === 1 ? [game[i], [c[0].lat, c[0].lon]] : null)).filter(Boolean);
		if (uniq.length < 2) { console.log('  za mało jednoznacznych stacji – pomijam'); continue; }
		let geo = HD.fitGeo(uniq);
		const pairs = [];
		cand.forEach((c, i) => {
			if (!c.length) return;
			let best = null;
			for (const x of c) {
				const p = HD.toLatLon(geo, game[i][0], game[i][1]);
				const d = Math.hypot((p.lat - x.lat) * 110574, (p.lon - x.lon) * 111320 * Math.cos((x.lat * Math.PI) / 180));
				if (!best || d < best.d) best = { d, x };
			}
			if (best.d < 1500) pairs.push([game[i], [best.x.lat, best.x.lon]]);
		});
		geo = HD.fitGeo(pairs);
		console.log(`  dopasowanie do mapy: ${pairs.length} stacji, błąd średni ${Math.round(geo.rms)} m`);
		const elevAt = await sampler(HD.bounds(route, geo));
		const h = HD.compute(route, geo, elevAt);
		const max = Math.max(...h.anchors.flatMap((a) => a.slice(1))) / 100;
		console.log(`  profile: ${h.anchors.length}, najwyższy horyzont ${max.toFixed(2)}°`);
		const out = { id: def.id, step: h.step, anchors: h.anchors };
		const body = `/* Horyzont trasy ${def.title || def.id} – sylwetka dalekiego terenu (2,5–60 km) co ok. 3 km trasy, 180 kierunków,
   kąty w setnych stopnia. Wygenerowano: ${new Date().toISOString().slice(0, 10)} (node tools/horizon.js).
   Dane: kafle terenu AWS Terrain Tiles (SRTM, GMTED i inne – © Mapzen i dostawcy), stacje – © współtwórcy OpenStreetMap. */
(function (h) {
	if (typeof module === 'object' && module.exports) module.exports = h;
	else (window.TrainHorizons = window.TrainHorizons || {})[h.id] = h;
})(${JSON.stringify(out)});
`;
		fs.writeFileSync(path.join(ROOT, 'routes', 'horizon', def.id + '.js'), body);
		console.log(`  zapisano routes/horizon/${def.id}.js (${(body.length / 1024).toFixed(0)} KiB)`);
	}
})().catch((e) => { console.error(e); process.exit(1); });
