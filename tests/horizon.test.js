// Horyzont z prawdziwego terenu (js/horizon-data.js): dopasowanie układu gry do mapy, profile, dane tras wbudowanych.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const R = require('../js/routes.js');
const HD = require('../js/horizon-data.js');

const real = (id) => R.prepare(require(path.join('..', 'routes', id + '.js')));

test('dopasowanie do mapy: obrót, odbicie osi i przesunięcie odtworzone z punktów', () => {
	const truth = { lat0: 50.1, lon0: 18.8, c: Math.cos(0.7), s: Math.sin(0.7), flip: -1, tx: 1200, ty: -800 };
	const pairs = [[0, 0], [5000, 300], [9000, 4200], [-2000, 7000]].map(([x, z]) => {
		const p = HD.toLatLon(truth, x, z);
		return [[x, z], [p.lat, p.lon]];
	});
	const g = HD.fitGeo(pairs);
	assert.equal(g.flip, -1);
	assert.ok(g.rms < 1, 'błąd ' + g.rms);
	const a = HD.toLatLon(g, 3000, -1500), b = HD.toLatLon(truth, 3000, -1500);
	assert.ok(Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5);
});

test('profile: góra w jednym kierunku podnosi horyzont tylko tam, płasko – lekko poniżej poziomu (krzywizna Ziemi)', () => {
	const route = real('gliwice-zabrze');
	const tp = {};
	const pairs = route.stations.map((s) => { R.trackPoint(route, s.pos, tp); return [[tp.x, tp.z], [50.3 + tp.z / -110574, 18.7 + tp.x / 71000]]; });
	const geo = HD.fitGeo(pairs);
	const peak = HD.toLatLon(geo, 0, -20000); // 20 km w kierunku „północy gry” (−z) od początku
	const elev = (lat, lon) => 250 + 900 * Math.exp(-(((lat - peak.lat) * 110574) ** 2 + ((lon - peak.lon) * 71000) ** 2) / (2 * 3000 ** 2));
	const h = HD.compute(route, geo, elev);
	const a = h.anchors[0];
	const up = a[1] / 100, side = a[1 + 45] / 100; // kierunek 0° (−z) i 90°
	assert.ok(up > 1.5, 'w stronę góry ' + up);
	assert.ok(side < 0 && side > -0.3, 'w bok ' + side);
	const out = new Float32Array(180);
	HD.sample(h, route.stations[0].pos, out);
	assert.ok(Math.abs(out[0] - (up * Math.PI) / 180) < 1e-3);
});

test('trasy wbudowane mają horyzont z danych (routes/horizon), wiarygodne kąty', () => {
	for (const id of ['gliwice-zabrze', 'gliwice-katowice', 'rybnik-katowice', 'torun-chelmza', 'orzesze-mikolow', 'warszawa-wschodnia-zachodnia', 'gdynia-gdansk', 'zabrze-gliwice', 'krakow-zakopane', 'tarnowskie-gory-katowice', 'czechowice-dziedzice-wisla-glebce', 'poznan-wroclaw', 'krakow-wieliczka', 'bielsko-biala-zywiec', 'szklarska-poreba-jakuszyce', 'walbrzych-jedlina-zdroj']) {
		const h = require(path.join('..', 'routes', 'horizon', id + '.js'));
		assert.equal(h.id, id);
		assert.ok(h.anchors.length >= 3 && h.anchors.every((a) => a.length === 181), id);
		const all = h.anchors.flatMap((a) => a.slice(1));
		assert.ok(Math.max(...all) < (id === 'krakow-zakopane' ? 1200 : id === 'czechowice-dziedzice-wisla-glebce' ? 1500 : id === 'bielsko-biala-zywiec' ? 1000 : id === 'szklarska-poreba-jakuszyce' ? 900 : 600) && Math.min(...all) > -100, id); // −1°…6° (Tatry nad Zakopanem – do 12°, Czantoria nad Ustroniem – do 15°, Beskid Śląski i Mały nad Wilkowicami i Łodygowicami – do 10°, Karkonosze nad Szklarską Porębą – do 9°)
	}
});

test('forRoute: dopasowanie ze stacji z OSM i horyzont z siatki wysokości (trasa bez geo)', async () => {
	const R = require('../js/routes.js');
	const HD = require('../js/horizon-data.js');
	const def = require('../routes/torun-chelmza.js');
	const plainDef = Object.assign({}, def, { geo: undefined, horizon: undefined });
	const route = R.prepare(plainDef), tp = {};
	const truth = { lat0: 53.0, lon0: 18.6, c: Math.cos(0.4), s: Math.sin(0.4), flip: 1, tx: 120, ty: -80 };
	const api = {
		findStations: async (names) => names.map((name, i) => { R.trackPoint(route, route.stations[i].pos, tp); const p = HD.toLatLon(truth, tp.x, tp.z); return { name, lat: p.lat, lon: p.lon }; }),
		elevations: async (pts) => pts.map(() => 100),
	};
	const res = await HD.forRoute(plainDef, api);
	assert.ok(res.n >= 2);
	assert.ok(Math.abs(res.geo.c - truth.c) < 1e-3 && Math.abs(res.geo.s - truth.s) < 1e-3);
	assert.ok(res.horizon.anchors.length > 3);
	// płaski teren – horyzont poniżej linii oczu (krzywizna Ziemi)
	assert.ok(res.horizon.anchors.every((a) => a.slice(1).every((x) => x <= 0)));
});
