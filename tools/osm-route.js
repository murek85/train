#!/usr/bin/env node
/* Generuje trasę z prawdziwych danych (OpenStreetMap + NMT GUGiK / Copernicus DEM) i zapisuje ją jako plik dołączany do gry.
   Użycie: node tools/osm-route.js "Gliwice" "Katowice" --line 137 --id gliwice-katowice --out routes/gliwice-katowice.js
   Opcje meta: --name "Osobowy S1" --desc "…" --train ezt|ic --clock 07:05
   --save plik.json – zapisz pobrane dane korytarza; --data plik.json – zbuduj trasę z zapisanych danych
   --grades-from routes/plik.js – pochylenia z istniejącej trasy (z --data)
   --save-env plik.json / --env-data plik.json – to samo dla otoczenia (budynki, drogi, lasy, wody); --no-env – bez otoczenia
   --save-dem plik.json / --dem-data plik.json – siatka wysokości terenu wokół trasy (pobranie trwa kilka minut – limity
   Open-Meteo); --no-dem – bez ukształtowania terenu (teren na poziomie toru)
   Wysokości: NMT GUGiK (skaning laserowy, cała Polska) – niweleta, ukształtowanie terenu, wysokości torów z mapy;
   --lidar-cache plik.json – pobrane punkty NMT (ponowne generowanie bez pobierania); --no-lidar – po staremu (Open-Meteo)
   NMPT GUGiK (model powierzchni): wysokości budynków, korony drzew, pomosty wiaduktów; --nmpt-cache plik.json – pobrane
   kafelki (serwer wolny – pierwsze pobranie kilka minut); --no-nmpt – bez tego
   Oficjalne źródła: BDOT10k (GUGiK – budynki, jezdnie, tereny, lasy, wody zamiast OSM) i PKP PLK (Regulamin sieci –
   prędkości, kilometraż, perony); --data-cache katalog – pobrane paczki i arkusze; --no-bdot, --no-plk – bez nich
   --fixes plik.json | routes/plik.js – poprawki (sekcja fixes) nakładane w grze; z pliku trasy – jego sekcja fixes
   (ponowne generowanie zachowuje poprawki). Na końcu wypisywane są uwagi generatora (miejsca do sprawdzenia). */
'use strict';
const fs = require('fs');
const path = require('path');
const OSM = require('../js/osm-route.js');

function args(argv) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[++i];
		else out._.push(argv[i]);
	}
	return out;
}

(async () => {
	const a = args(process.argv.slice(2));
	const [from, to] = a._;
	if (!from || !to) {
		console.error('Użycie: node tools/osm-route.js "Stacja A" "Stacja B" [--line 137] [--id …] [--out routes/….js]');
		process.exit(1);
	}
	const meta = {};
	if (a.name) meta.name = a.name;
	if (a.desc) meta.desc = a.desc;
	if (a.train) meta.train = a.train;
	if (a.difficulty) meta.difficulty = a.difficulty;
	if (a.clock) { const [h, m] = a.clock.split(':').map(Number); meta.startClock = h * 3600 + m * 60; }
	const opts = { from, to, line: a.line || null, id: a.id, meta, debug: !!a.debug, log: (m) => console.log(m) };
	if (a.fixes) {
		const fp = path.resolve(a.fixes);
		const src = fp.endsWith('.js') ? require(fp) : JSON.parse(fs.readFileSync(fp, 'utf8'));
		opts.fixes = fp.endsWith('.js') ? src.fixes || null : src.fixes || src;
		if (opts.fixes) console.log(`Poprawki z ${a.fixes}: ${Object.keys(opts.fixes).join(', ')}`);
	}
	const flags = process.argv.slice(2);
	if (flags.includes('--no-env')) opts.environment = false;
	else if (a['env-data']) opts.environment = async (poly, l) => {
		const d = JSON.parse(fs.readFileSync(a['env-data'], 'utf8'));
		// dane zapisane przed dodaniem masztów do zapytania – dopobranie i zapis
		if (!d._masts) {
			d.elements.push(...(await OSM.fetchMasts(poly, l)));
			d._masts = 1;
			fs.writeFileSync(a['env-data'], JSON.stringify(d));
		}
		// przejścia dla pieszych, parkingi, place – dopobranie do starszych danych
		if (!d._streets) {
			d.elements.push(...(await OSM.fetchStreetExtras(poly, l)));
			d._streets = 1;
			fs.writeFileSync(a['env-data'], JSON.stringify(d));
		}
		// punkty usług (rodzaj budynków) – dopobranie do starszych danych
		if (!d._pois) {
			d.elements.push(...(await OSM.fetchPois(poly, l)));
			d._pois = 1;
			fs.writeFileSync(a['env-data'], JSON.stringify(d));
		}
		return d;
	};
	else opts.environment = async (poly, l) => {
		const d = await OSM.fetchEnvironment(poly, l);
		if (a['save-env']) fs.writeFileSync(a['save-env'], JSON.stringify(d));
		return d;
	};
	// ukształtowanie terenu wokół trasy: zapisane dane (--dem-data) albo pobranie (z zapisem --save-dem)
	if (flags.includes('--no-dem') || flags.includes('--no-env')) opts.dem = false;
	else if (a['dem-data']) opts.dem = async () => JSON.parse(fs.readFileSync(a['dem-data'], 'utf8'));
	else opts.dem = async (pts, l) => {
		const h = await OSM.elevations(pts, l);
		if (a['save-dem']) fs.writeFileSync(a['save-dem'], JSON.stringify(h));
		return h;
	};
	// NMT GUGiK z pamięcią pobranych punktów
	if (flags.includes('--no-lidar')) opts.lidar = false;
	else {
		const cache = new Map(a['lidar-cache'] && fs.existsSync(a['lidar-cache']) ? JSON.parse(fs.readFileSync(a['lidar-cache'], 'utf8')) : []);
		opts.lidar = async (pts, l) => {
			const h = await OSM.nmtHeights(pts, l, cache);
			if (a['lidar-cache']) fs.writeFileSync(a['lidar-cache'], JSON.stringify([...cache]));
			return h;
		};
	}
	// oficjalne źródła: BDOT10k (otoczenie) i PKP PLK (prędkości, kilometraż, perony); --data-cache katalog – pobrane pliki
	const SRC = require('../js/gen/sources.js');
	const dc = a['data-cache'] ? path.resolve(a['data-cache']) : null;
	const fileCache = dc ? {
		get: async (url) => { const f = path.join(dc, url.replace(/[^a-z0-9._-]+/gi, '_')); return fs.existsSync(f) ? new Uint8Array(fs.readFileSync(f)) : null; },
		put: async (url, bytes) => { fs.mkdirSync(dc, { recursive: true }); fs.writeFileSync(path.join(dc, url.replace(/[^a-z0-9._-]+/gi, '_')), bytes); },
	} : null;
	if (!flags.includes('--no-bdot')) opts.bdot = (pts, l) => SRC.bdotForRoute(pts, { log: l, cache: fileCache });
	if (!flags.includes('--no-plk')) opts.plk = (l) => SRC.plkData({ log: l, cache: fileCache });
	// NMPT GUGiK z pamięcią pobranych kafelków
	if (!flags.includes('--no-nmpt') && opts.lidar !== false) {
		const tiles = new Map(a['nmpt-cache'] && fs.existsSync(a['nmpt-cache']) ? JSON.parse(fs.readFileSync(a['nmpt-cache'], 'utf8')) : []);
		// zapis pobranych kafelków na bieżąco (co 5) – przerwane pobieranie nie przepada
		let saved = tiles.size;
		const save = (t) => { if (a['nmpt-cache'] && t.size >= saved + 5) { fs.writeFileSync(a['nmpt-cache'], JSON.stringify([...t])); saved = t.size; } };
		opts.surface = async (pts, l) => {
			try {
				return await OSM.nmptSampler(pts, l, tiles, save);
			} finally {
				if (a['nmpt-cache'] && tiles.size > saved) fs.writeFileSync(a['nmpt-cache'], JSON.stringify([...tiles]));
			}
		};
	}
	let def;
	if (a.data) {
		// dane korytarza zapisane wcześniej (--save) – bez ponownego odpytywania serwerów OSM
		const data = JSON.parse(fs.readFileSync(a.data, 'utf8'));
		// --grades-from plik.js: pochylenia z istniejącego pliku trasy (bez pobierania wysokości – limit Open-Meteo)
		const gradesFrom = a['grades-from'] ? require(path.resolve(a['grades-from'])).grades : null;
		def = await OSM.buildRoute(data, Object.assign(opts, { elevation: gradesFrom ? null : (pts, l) => OSM.elevations(pts, l), environment: opts.environment || null }));
		if (gradesFrom && !def.h0) def.grades = gradesFrom;
	} else {
		if (a.save) opts.onData = (data) => fs.writeFileSync(a.save, JSON.stringify(data));
		def = await OSM.generate(Object.assign({}, opts, { environment: opts.environment === false ? false : undefined, envFetch: opts.environment }));
	}
	const out = a.out || `routes/${def.id}.js`;
	const json = JSON.stringify(def).replace(/,"(?=[a-z]+":)/g, ',\n"');
	const body = `/* Trasa wygenerowana z prawdziwych danych: ${def.title}${def.line ? ', linia ' + def.line : ''}.\n   ${OSM.SOURCE}.\n   Wygenerowano: ${new Date().toISOString().slice(0, 10)} (node tools/osm-route.js). */\n(function (def) {\n\tif (typeof module === 'object' && module.exports) module.exports = def;\n\telse (window.TrainRouteDefs = window.TrainRouteDefs || []).push(def);\n})(${json});\n`;
	fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
	fs.writeFileSync(out, body, 'utf8');
	console.log(`Zapisano ${out} (${(body.length / 1024).toFixed(1)} KB)`);
	console.log('Stacje:', def.stations.map((s) => `${s.name} ${(s.pos / 1000).toFixed(2)} km${s.exit ? ' [' + s.exit + ']' : ''}`).join(' | '));
	console.log('Ograniczenia:', def.limits.map(([s, v]) => `${(s / 1000).toFixed(2)}:${v}`).join(' '));
	console.log('Pochylenia:', def.grades.map(([s, g]) => `${(s / 1000).toFixed(1)}:${g}‰`).join(' '));
	console.log('Semafory:', def.signals.map((q) => `${(q.pos / 1000).toFixed(2)} ${q.name}`).join(' | '));
	console.log('Mosty:', def.bridges.map((b) => `${(b.from / 1000).toFixed(2)}–${(b.to / 1000).toFixed(2)} ${b.kind}${b.over ? '/' + b.over : ''}${b.auto ? '+' : ''}`).join(' | '), '· tunele:', def.tunnels.length, '· przejazdy:', def.crossings.length, '· dwutorowa:', def.double);
	// uwagi generatora: miejsca do sprawdzenia i co można zrobić (poprawki w sekcji fixes)
	const R = require('../js/routes.js');
	const issues = def.issues || [];
	if (issues.length) {
		console.log(`\nUwagi generatora (${issues.length}, do sprawdzenia: ${issues.filter((x) => x.lvl === 'warn').length}):`);
		for (const x of issues) {
			const st = R.issueStatus(def, x);
			console.log(`  ${x.lvl === 'warn' ? '!' : '·'} km ${(x.pos / 1000).toFixed(2)} [${x.id}]${st ? ' (' + (st === 'fixed' ? 'poprawione' : 'pominięte') + ')' : ''} ${x.m}`);
			if (!st) console.log(`      → ${x.fix}`);
		}
	}
})().catch((e) => {
	console.error('Błąd:', e.message);
	process.exit(1);
});
