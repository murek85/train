// Trasy rzeczywiste: trasa w formacie z generatora (dane testowe) i budowa trasy z danych w generatorze.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/routes.js');
const OSM = require('../js/osm-route.js');
const { Sim, autopilot, buildTimetable } = require('../js/sim.js');
const MINI = require('./fixtures/real-mini.js')();

function drive(sim, maxSteps = 400000) {
	for (let i = 0; sim.status === 'running' && i < maxSteps; i++) {
		autopilot(sim);
		sim.update(0.05);
	}
}

test('trasa rzeczywista (dane testowe): stacje, semafory z nazwami, krzywizna', () => {
	const r = R.prepare(MINI, { train: 'ezt', cars: 1 });
	assert.deepEqual(r.stations.map((s) => s.name), ['Alfa', 'Beta', 'Gamma']);
	assert.ok(r.signals.some((s) => s.label === '103'), 'nazwy semaforów');
	// tor wygięty: kierunek zmienia się wzdłuż trasy
	const hs = [];
	for (let s = 0; s < r.length; s += 200) hs.push(R.trackPoint(r, s).heading);
	assert.ok(Math.max(...hs) - Math.min(...hs) > 0.5, 'łuki na trasie');
});

for (const cfg of [{ train: 'ezt', cars: 1 }, { train: 'ic', cars: 5 }, { train: 'dd', cars: 3 }]) {
	test(`automat: trasa rzeczywista (dane testowe), skład ${cfg.train} × ${cfg.cars}`, () => {
		const route = R.prepare(MINI, cfg);
		const sim = new Sim(route, { czuwak: true, timetable: buildTimetable(route) });
		drive(sim);
		assert.equal(sim.status, 'ended', sim.failReason);
		for (const r of sim.records.filter((x) => !x.through)) assert.ok(r.delay <= 30, `${r.station}: opóźnienie ${r.delay}`);
	});
}

// mała sieć z danych w formacie Overpass: dwutorowa linia z łukiem, dwie stacje, semafor i most nad rzeką
function synthetic() {
	const els = [];
	let id = 1;
	const lat0 = 50.0, lon0 = 19.0;
	const line = (pts, tags) => {
		const nodes = pts.map(() => id++);
		els.push({ type: 'way', id: id++, nodes, geometry: pts.map(([la, lo]) => ({ lat: la, lon: lo })), tags: Object.assign({ railway: 'rail', ref: '1', maxspeed: '100' }, tags) });
		return nodes;
	};
	// tor: 6 km na wschód, potem łuk na północny wschód
	const pts = [];
	for (let k = 0; k <= 60; k++) pts.push([lat0, lon0 + k * 0.0014]);
	// łagodny łuk w lewo (kierunek zmienia się stopniowo o 45°), odcinki ~100 m
	let la = lat0, lo = lon0 + 60 * 0.0014;
	for (let k = 1; k <= 30; k++) {
		const a = (Math.min(k, 15) / 15) * (Math.PI / 4);
		la += (Math.sin(a) * 100) / 111320;
		lo += (Math.cos(a) * 100) / (111320 * Math.cos((lat0 * Math.PI) / 180));
		pts.push([la, lo]);
	}
	const nodes = line(pts.slice(0, 31), {});
	const bridge = line(pts.slice(30, 33), { bridge: 'yes' });
	const rest = line(pts.slice(32), { maxspeed: '80' });
	// spójność grafu: wspólne węzły na styku dróg
	els[1].nodes[0] = nodes[nodes.length - 1];
	els[2].nodes[0] = els[1].nodes[els[1].nodes.length - 1];
	els.push({ type: 'way', id: id++, tags: { waterway: 'river' }, geometry: [{ lat: lat0 - 0.01, lon: lon0 + 31 * 0.0014 }, { lat: lat0 + 0.01, lon: lon0 + 31 * 0.0014 }] });
	els.push({ type: 'node', id: id++, lat: lat0 + 0.0002, lon: lon0 + 6 * 0.0014, tags: { railway: 'station', name: 'Alfa' } });
	els.push({ type: 'node', id: id++, lat: pts[85][0] + 0.0002, lon: pts[85][1], tags: { railway: 'station', name: 'Beta' } });
	els.push({ type: 'node', id: nodes[20], lat: pts[20][0], lon: pts[20][1], tags: { railway: 'signal', ref: 'K7', 'railway:signal:direction': 'forward', 'railway:signal:combined': 'PL-PKP:s', 'railway:signal:combined:function': 'block' } });
	return { elements: els };
}

test('generator: trasa z danych OSM', async () => {
	const def = await OSM.buildRoute(synthetic(), { from: 'Alfa', to: 'Beta', line: '1', elevation: async (p) => p.map((_, i) => 200 + i * 0.5) });
	assert.deepEqual(def.stations.map((s) => s.name), ['Alfa', 'Beta']);
	assert.ok(def.signals.some((s) => s.name === 'K7'), 'semafor z nazwą');
	assert.ok(def.bridges.some((b) => b.kind === 'water'), 'most nad rzeką');
	assert.ok(def.limits.some(([, v]) => v === 80), 'ograniczenie z maxspeed');
	assert.ok(def.grades.some(([, g]) => g > 0), 'profil wznoszący');
	assert.ok(def.curvature.k.some((k) => k < 0), 'łuk w lewo');
	const r = R.prepare(def, { train: 'ezt', cars: 1 });
	const sim = new Sim(r, { czuwak: false, timetable: buildTimetable(r) });
	drive(sim);
	assert.equal(sim.status, 'ended', sim.failReason);
});

test('generator: otoczenie (budynki, drogi, raster zagospodarowania)', async () => {
	// otoczenie przy prostym odcinku toru (wzdłuż równoleżnika 50°, na wschód): budynek 60 m na północ (po lewej),
	// droga przecinająca tor, las na południu (po prawej)
	const lat0 = 50.0, lon0 = 19.0, m = 111320, mlon = 111320 * Math.cos((lat0 * Math.PI) / 180);
	const ll = (east, north) => ({ lat: lat0 + north / m, lon: lon0 + east / mlon });
	const env = { elements: [
		{ type: 'way', tags: { building: 'apartments', 'building:levels': '4' }, geometry: [ll(2000, 60), ll(2030, 60), ll(2030, 72), ll(2000, 72), ll(2000, 60)] },
		{ type: 'way', tags: { highway: 'secondary' }, geometry: [ll(3000, -150), ll(3000, 150)] },
		{ type: 'way', tags: { landuse: 'forest' }, geometry: [ll(1500, -40), ll(4000, -40), ll(4000, -300), ll(1500, -300), ll(1500, -40)] },
	] };
	const def = await OSM.buildRoute(synthetic(), { from: 'Alfa', to: 'Beta', line: '1', elevation: async (p) => p.map(() => 200), environment: async () => env });
	assert.ok(def.env, 'otoczenie w trasie');
	assert.equal(def.env.b.length, 1);
	const [kind, h10] = def.env.b[0];
	assert.equal(kind, 1);
	assert.equal(h10, 130); // 4 kondygnacje × 3 m + 1 m
	// budynek po lewej stronie toru (d < 0), ok. 60–72 m od osi
	const ds = def.env.b[0].slice(3).filter((_, i) => i % 2 === 1);
	assert.ok(ds.every((d) => d < -55 && d > -77), 'odsunięcia ' + ds.join(','));
	// droga przecięta przy torze: dwa kawałki, żaden nie wchodzi na torowisko
	assert.equal(def.env.r.length, 2);
	for (const row of def.env.r) for (let i = 2; i < row.length; i += 2) assert.ok(Math.abs(row[i]) >= 7.5);
	// raster: las po prawej (d > 0), nic po lewej
	const R0 = require('../js/routes.js');
	const route = R0.prepare(def, { train: 'ezt', cars: 1 });
	const g = route.env.g, row = g.rows[Math.round((2500 + def.stations[0].pos - 6 * 0.0014 * 0 - g.s0) / g.step)] || '';
	assert.ok(/B\d+/.test(g.rows.join('')), 'komórki lasu w rastrze');
	assert.ok(row.length > 0);
});

// wszystkie trasy dołączone do gry (routes/*.js): poprawne dane i przejazd automatem bez kar za opóźnienie
const fs = require('fs');
const path = require('path');
for (const f of fs.readdirSync(path.join(__dirname, '..', 'routes')).filter((x) => x.endsWith('.js'))) {
	test(`trasa dołączona: ${f}`, () => {
		const def = require(path.join(__dirname, '..', 'routes', f));
		assert.ok(def.real && def.env, 'trasa rzeczywista z otoczeniem');
		for (let i = 1; i < def.stations.length; i++) assert.ok(def.stations[i].pos - def.stations[i - 1].pos >= 900, 'odstęp stacji');
		assert.ok(def.grades.every(([, g]) => Math.abs(g) <= 15), 'pochylenia (pomiar NMT, odcinki co 50 m)');
		const route = R.prepare(def, { train: 'ezt', cars: 1 });
		const sim = new Sim(route, { czuwak: true, timetable: buildTimetable(route) });
		drive(sim);
		assert.equal(sim.status, 'ended', sim.failReason);
		for (const r of sim.records.filter((x) => !x.through)) assert.ok(r.delay <= 30, `${r.station}: opóźnienie ${r.delay}`);
	});
}
