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
   (ponowne generowanie zachowuje poprawki). RINF (ERA, js/gen/rinf-pl.js): pochylenia w tunelach i na mostach,
   brakujące tunele; --no-rinf – bez nich. --no-horizon – bez horyzontu. --construction – tory w przebudowie (railway=construction, np. linia
   w remoncie) jak zwykłe. Na końcu wypisywane są uwagi generatora (miejsca do sprawdzenia).
   --trees-only routes/plik.js – do istniejącego pliku trasy tylko drzewa z mapy (env.vt: natural=tree, tree_row) z tego
   generowania, reszta pliku bez zmian (stacje muszą mieć te same odstępy; stałe przesunięcie kilometrażu – przeliczane). */
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
	// tory w przebudowie (railway=construction) jak zwykłe – linia w remoncie bywa w OSM bez zwykłych torów
	if (flags.includes('--construction')) opts.construction = true;
	// bez sylwetki gór na horyzoncie (Open-Meteo – ok. godziny dla trasy górskiej; horyzont osobno: tools/horizon.js)
	if (flags.includes('--no-horizon')) opts.horizon = false;
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
		// przystanki autobusowe – dopobranie do starszych danych
		if (!d._bus) {
			d.elements.push(...(await OSM.fetchBusStops(poly, l)));
			d._bus = 1;
			fs.writeFileSync(a['env-data'], JSON.stringify(d));
		}
		// ekrany akustyczne, płoty, latarnie, ławki, kosze, hydranty – dopobranie do starszych danych
		if (!d._obj) {
			const have = new Set(d.elements.map((e) => e.type + e.id));
			d.elements.push(...(await OSM.fetchObjects(poly, l)).filter((e) => !have.has(e.type + e.id)));
			d._obj = 1;
			fs.writeFileSync(a['env-data'], JSON.stringify(d));
		}
		// drzewa i szpalery – dopobranie do starszych danych (szpalery mogą już być – powtórki po id pomijane)
		if (!d._trees) {
			const have = new Set(d.elements.map((e) => e.type + e.id));
			d.elements.push(...(await OSM.fetchTrees(poly, l)).filter((e) => !have.has(e.type + e.id)));
			d._trees = 1;
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
		// zapytanie otoczenia obejmuje już maszty, przejścia, parkingi i punkty usług – zapisane dane bez dopobierania
		if (a['save-env']) fs.writeFileSync(a['save-env'], JSON.stringify(Object.assign({ _masts: 1, _streets: 1, _pois: 1, _bus: 1, _trees: 1, _obj: 1 }, d)));
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
	// RINF (ERA): pochylenia linii i tunele z wyciągu js/gen/rinf-pl.js (tools/rinf.js); --no-rinf – bez nich
	if (!flags.includes('--no-plk') && !flags.includes('--no-rinf')) opts.rinf = () => SRC.rinfData();
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
	/* --trees-only routes/plik.js: do istniejącego pliku trasy tylko drzewa z mapy (env.vt) z tego generowania – reszta
	   pliku (ręczne poprawki, niweleta) bez zmian; stacje muszą się zgadzać (te same odstępy, do 2 m – stałe przesunięcie
	   kilometrażu dozwolone), inaczej przerwanie */
	if (a['objects-only']) a['trees-only'] = a['objects-only'];
	if (a['trees-only']) {
		const fp = path.resolve(a['trees-only']);
		const old = require(fp);
		// (stałe przesunięcie kilometrażu – np. inny początek trasy po zmianach generatora – odejmowane od s drzew)
		// (stacje skrajne pomijane – generator dosuwa je do końców trasy, ich położenie bywa inne o kilka metrów)
		const inner = (A) => (A.length > 3 ? A.slice(1, -1) : A);
		const dd = old.stations.length === def.stations.length ? inner(def.stations.map((s, i) => s.pos - old.stations[i].pos)).sort((x, y) => x - y) : [];
		const shiftS = dd.length ? dd[dd.length >> 1] : 0;
		/* zgodność: co najmniej 80% stacji (bez skrajnych) w ±3 m od mediany – pojedyncze stacje przesunięte w danych (inne
		   położenie peronu, zmiana w OSM) nie przekreślają trasy; wypisane do sprawdzenia */
		const odd = dd.filter((x) => Math.abs(x - shiftS) > 3);
		let bad = !dd.length || odd.length > dd.length * 0.2;
		/* bez stałego przesunięcia (inna liczba stacji, przebieg wygładzony inaczej): stacje dopasowane po nazwie (co
		   najmniej 3 i 70% stacji pliku), kilometraż przeliczany odcinkami między nimi (liniowo; poza skrajnymi – przesunięcie
		   skrajnej) */
		let mapS = (x) => x - shiftS;
		if (bad) {
			const byName = new Map(def.stations.map((s) => [s.name, s.pos]));
			const K = old.stations.filter((s) => byName.has(s.name)).map((s) => [byName.get(s.name), s.pos]).sort((x, y) => x[0] - y[0]);
			const mono = K.every((k, i) => !i || (k[0] > K[i - 1][0] && k[1] > K[i - 1][1]));
			if (K.length >= 3 && K.length >= old.stations.length * 0.7 && mono) {
				bad = false;
				mapS = (x) => {
					let i = 1;
					while (i < K.length - 1 && x > K[i][0]) i++;
					const [a0, b0] = K[i - 1], [a1, b1] = K[i];
					if (x <= a0 && i === 1) return x - a0 + b0;
					if (x >= a1) return x - a1 + b1;
					return b0 + ((x - a0) / (a1 - a0)) * (b1 - b0);
				};
				console.log(`Stacje dopasowane po nazwie (${K.length} z ${old.stations.length}) – kilometraż przeliczany odcinkami: ` + K.map(([a, b]) => `${Math.round(a - b)}`).join(' / ') + ' m.');
			}
		}
		if (!bad && odd.length && dd.length) console.log(`Stacje odstające od przesunięcia ${shiftS} m (${odd.length}): ` + def.stations.filter((s, i) => Math.abs(s.pos - old.stations[i].pos - shiftS) > 3).map((s) => s.name).join(', '));
		if (bad) {
			console.error('Stacje nie zgadzają się z istniejącym plikiem – drzewa nie dopisane:');
			console.error('  plik:  ', old.stations.map((s) => s.name + ' ' + s.pos).join(' | '));
			console.error('  teraz: ', def.stations.map((s) => s.name + ' ' + s.pos).join(' | '));
			process.exit(2);
		}
		const vt = ((def.env && def.env.vt) || []).slice();
		for (let i = 0; i < vt.length; i += 4) vt[i] = Math.round(mapS(vt[i]) * 2) / 2;
		if (shiftS) console.log(`Kilometraż przesunięty o ${shiftS} m względem pliku – drzewa przeliczone.`);
		const src = fs.readFileSync(fp, 'utf8');
		const tail = src.lastIndexOf('})(');
		const json = src.slice(tail + 3, src.lastIndexOf(');'));
		const o = JSON.parse(json);
		if (!o.env) { console.error('Plik trasy bez otoczenia (env).'); process.exit(2); }
		o.env.vt = vt;
		// --objects-only: także bariery (ba) i obiekty punktowe (pt), s przesunięte jak drzewa
		if (a['objects-only']) {
			const sh = (x) => Math.round(mapS(x) * 2) / 2;
			o.env.ba = ((def.env && def.env.ba) || []).map((row) => row.map((v, i) => (i >= 2 && i % 2 === 0 ? sh(v) : v)));
			o.env.pt = ((def.env && def.env.pt) || []).map((v, i) => (i % 3 === 0 ? sh(v) : v));
			console.log(`Obiekty z mapy: bariery ${o.env.ba.length}, punkty ${o.env.pt.length / 3}.`);
		}
		const out2 = JSON.stringify(o).replace(/,"(?=[a-z]+":)/g, ',\n"');
		fs.writeFileSync(fp, src.slice(0, tail + 3) + out2 + ');\n', 'utf8');
		console.log(`Dopisano drzewa z mapy do ${a['trees-only']}: ${vt.length / 4}.`);
		return;
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
