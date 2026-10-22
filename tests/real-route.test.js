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
		// trasy górskie (różnica wysokości ponad 200 m – np. Kraków – Zakopane, do 29‰, Czechowice – Wisła Głębce, do 28,6‰) do 30‰, pozostałe do 15‰
		let hh = 0, hMin = 0, hMax = 0;
		def.grades.forEach(([s, g], i) => { hh += (g / 1000) * ((def.grades[i + 1] || [s + 50])[0] - s); hMin = Math.min(hMin, hh); hMax = Math.max(hMax, hh); });
		const gMax = hMax - hMin > 200 ? 30 : 15;
		assert.ok(def.grades.every(([, g]) => Math.abs(g) <= gMax), 'pochylenia (pomiar NMT, odcinki co 50 m)');
		const route = R.prepare(def, { train: 'ezt', cars: 1 });
		const sim = new Sim(route, { czuwak: true, timetable: buildTimetable(route) });
		drive(sim);
		assert.equal(sim.status, 'ended', sim.failReason);
		for (const r of sim.records.filter((x) => !x.through)) assert.ok(r.delay <= 30, `${r.station}: opóźnienie ${r.delay}`);
	});
}

/* Linia średnicowa w mieście (jak Warszawa Wschodnia – Zachodnia): tunel z przystankiem pod ziemią, obok stacja metra
   i stacja innej linii (tory równoległe z innym numerem), ulica nad tunelem; w pomiarze NMT wykop (teren po bokach
   wyżej) i dolina pod torem (most) */
function cityLine() {
	const els = [];
	let id = 1;
	const lat0 = 52.0, lon0 = 21.0, m = 111320, mlon = 111320 * Math.cos((lat0 * Math.PI) / 180);
	const ll = (east, north) => ({ lat: lat0 + north / m, lon: lon0 + east / mlon });
	const nodeIds = [];
	for (let x = 0; x <= 6000; x += 100) nodeIds.push(id++);
	const way = (x0, x1, tags) => {
		const i0 = x0 / 100, i1 = x1 / 100, nodes = nodeIds.slice(i0, i1 + 1);
		els.push({ type: 'way', id: id++, nodes, geometry: nodes.map((_, k) => ll((i0 + k) * 100, 0)), tags: Object.assign({ railway: 'rail', ref: '448', maxspeed: '80' }, tags) });
	};
	way(0, 2700, {});
	way(2700, 3600, { tunnel: 'yes', layer: '-1' });
	way(3600, 6000, {});
	// równoległe tory innej linii (60 m na południe), bez połączenia z naszymi
	const other = [];
	for (let x = 3700; x <= 4700; x += 100) other.push(id++);
	els.push({ type: 'way', id: id++, nodes: other, geometry: other.map((_, k) => ll(3700 + k * 100, -60)), tags: { railway: 'rail', ref: '2' } });
	const st = (east, north, name, tags) => els.push({ type: 'node', id: id++, lat: ll(east, north).lat, lon: ll(east, north).lon, tags: Object.assign({ railway: 'station', name }, tags) });
	st(300, 15, 'Alfa');
	st(2850, 12, 'Gamma', { railway: 'halt' }); // przystanek w tunelu, tuż za portalem (jak Śródmieście / Powiśle)
	st(3050, 25, 'Metro', { station: 'subway', subway: 'yes' }); // stacja metra tuż obok
	st(4200, -55, 'Delta'); // stacja przy torach innej linii
	st(5700, 15, 'Beta');
	return { data: { elements: els }, ll, m, mlon, lat0, lon0 };
}

test('generator: tunel ze stacją, stacje innych linii, ulica nad tunelem, wykop a most (NMT)', async () => {
	const C = cityLine();
	// NMT: płasko 100 m; wykop km 4,8–5,0 (oś 5 m niżej, boki bez zmian); dolina km 1,5–1,6 (oś i boki niżej)
	const lidar = async (pts) => pts.map((p) => {
		const east = (p.lon - C.lon0) * C.mlon, north = (p.lat - C.lat0) * C.m;
		if (east > 1500 && east < 1600) return 95;
		if (east > 4800 && east < 5000 && Math.abs(north) < 4) return 95;
		return 100;
	});
	const env = { elements: [{ type: 'way', id: 9001, tags: { highway: 'secondary', layer: '0' }, geometry: [C.ll(3300, -200), C.ll(3300, 200)] }] };
	const def = await OSM.buildRoute(C.data, { from: 'Alfa', to: 'Beta', line: '448', lidar, environment: async () => env });
	const names = def.stations.map((s) => s.name);
	assert.deepEqual(names, ['Alfa', 'Gamma', 'Beta'], 'stacje: ' + names.join(', '));
	assert.ok(def.issues.some((i) => i.k === 'station-other' && /Metro/.test(i.m)), 'metro pominięte z uwagą');
	assert.ok(def.issues.some((i) => i.k === 'station-other' && /Delta/.test(i.m) && /linii 2/.test(i.m)), 'stacja innej linii pominięta');
	// tunel zachowany, choć przystanek jest w środku (dawniej odrzucany przy końcu w strefie stacji)
	const gamma = def.stations.find((s) => s.name === 'Gamma');
	assert.equal(def.tunnels.length, 1);
	assert.ok(def.tunnels[0].from < gamma.pos && def.tunnels[0].to > gamma.pos, 'przystanek w tunelu');
	// ulica nad tunelem: zwykła droga przez oś toru, bez wiaduktu nad torem
	const t0 = def.tunnels[0];
	assert.ok(!def.env.o.some((row) => row.some((v, i) => i % 2 === 1 && v > t0.from && v < t0.to)), 'bez wiaduktu drogowego nad tunelem');
	assert.ok(def.env.r.some((row) => { const d = row.filter((_, i) => i > 0 && i % 2 === 0); return d.some((v) => v < 0) && d.some((v) => v > 0); }), 'ulica przechodzi nad osią toru');
	// NMT: dolina – most, wykop – bez mostu, z uwagą
	const shift = def.stations[0].pos - 300 - 80; // przesunięcie kilometrażu (przybliżone – stacja 80 m za węzłem)
	const at = (x) => x + shift;
	assert.ok(def.bridges.some((b) => b.from < at(1600) && b.to > at(1500)), 'most nad doliną');
	assert.ok(!def.bridges.some((b) => b.from < at(5000) && b.to > at(4800)), 'wykop bez mostu');
	assert.ok(def.issues.some((i) => i.k === 'cut-nmt'), 'uwaga o wykopie');
	// w tunelu tor pod terenem (NMT nad tunelem 100 m): przystanek co najmniej ok. 7 m niżej, przy portalach – poziom terenu
	const r = R.prepare(def, { train: 'ezt', cars: 1 });
	const hG = R.heightAt(r, gamma.pos), hA = R.heightAt(r, def.stations[0].pos);
	assert.ok(hA - hG > 6.5, `przystanek w tunelu ${(hA - hG).toFixed(1)} m pod poziomem Alfy`);
	const sim = new Sim(r, { czuwak: false, timetable: buildTimetable(r) });
	drive(sim);
	assert.equal(sim.status, 'ended', sim.failReason);
});

test('generator: tory i perony pod ziemią (tunel wspólny, WKD bez tunnel=yes, wykop), metro', async () => {
	const C = cityLine();
	const line = (x0, x1, north, tags, id) => ({ type: 'way', id, tags, geometry: [C.ll(x0, north), C.ll((x0 + x1) / 2, north), C.ll(x1, north)] });
	// NMT: płasko 100 m; tor w wykopie (layer=-1) na 30 m na południe km 0,8–1,4 – oś 6 m niżej
	const lidar = async (pts) => pts.map((p) => {
		const east = (p.lon - C.lon0) * C.mlon, north = (p.lat - C.lat0) * C.m;
		if (east > 800 && east < 1400 && Math.abs(north + 30) < 3) return 94;
		if (east > 4000 && east < 5000 && Math.abs(north - 22) < 1.5) return 104; // pomiar na torze obok trafia w przykrycie
		if (east > 4000 && east < 5000 && Math.abs(north - 26) < 1.5) return 96; // pomiar na następnym trafia w ulicę pod wiaduktem
		return 100;
	});
	const env = {
		elements: [
			line(2750, 3550, 14, { railway: 'rail', ref: '2', tunnel: 'yes', layer: '-2' }, 9101), // tunel wspólny – obok naszego
			line(3000, 3100, 7, { railway: 'rail', service: 'crossover', layer: '-1' }, 9102), // łącznica w tunelu bez tunnel=yes
			line(4000, 5000, -30, { railway: 'rail', ref: '47', layer: '-1' }, 9103), // WKD pod ulicą – przykryta, poza naszym tunelem
			line(4000, 5000, 18, { railway: 'rail', ref: '448', layer: '-1' }, 9109), // przykryty tor tuż obok naszego (wspólny wykop)
			line(4000, 5000, 22, { railway: 'rail', ref: '47' }, 9110), // tor 4 m obok niego – pomiar NMT 4 m wyżej (przykrycie)
			line(4000, 5000, 26, { railway: 'rail', ref: '47' }, 9117), // i następny – pomiar 4 m niżej (ulica pod wiaduktem)
			{ type: 'way', id: 9111, tags: { waterway: 'canal', tunnel: 'culvert', layer: '-1', name: 'Kolektor' }, geometry: [C.ll(2000, -300), C.ll(2000, 300)] }, // kanał pod torem
			// obszar wody wzdłuż kolektora (jak w BDOT10k) i staw obok
			{ type: 'way', id: 9112, tags: { natural: 'water' }, geometry: [C.ll(1985, -300), C.ll(2015, -300), C.ll(2015, 300), C.ll(1985, 300), C.ll(1985, -300)] },
			// stadion: obszar leisure=stadium (cały kompleks), budynek (ośmiokąt ok. 20 000 m²) i boisko
			{ type: 'way', id: 9114, tags: { leisure: 'stadium', name: 'Stadion Testowy' }, geometry: [C.ll(1600, -150), C.ll(2000, -150), C.ll(2000, -450), C.ll(1600, -450), C.ll(1600, -150)] },
			{ type: 'way', id: 9115, tags: { building: 'yes' }, geometry: [[-80, 0], [-56, 56], [0, 80], [56, 56], [80, 0], [56, -56], [0, -80], [-56, -56], [-80, 0]].map(([x, y]) => C.ll(1800 + x, -300 + y * 0.8)) },
			{ type: 'way', id: 9116, tags: { leisure: 'pitch', sport: 'soccer' }, geometry: [C.ll(1750, -270), C.ll(1850, -270), C.ll(1850, -330), C.ll(1750, -330), C.ll(1750, -270)] },
			{ type: 'way', id: 9113, tags: { natural: 'water' }, geometry: [C.ll(2200, 100), C.ll(2260, 100), C.ll(2260, 160), C.ll(2200, 160), C.ll(2200, 100)] },
			line(800, 1400, -30, { railway: 'rail', ref: '47', layer: '-1' }, 9104), // tor w wykopie (layer=-1)
			{ type: 'way', id: 9105, tags: { railway: 'platform', public_transport: 'platform', subway: 'yes', network: 'Warsaw Metro', name: 'Metro' }, geometry: [C.ll(3000, 30), C.ll(3100, 30)] },
			{ type: 'way', id: 9106, tags: { railway: 'platform', layer: '-2', name: 'peron 1' }, geometry: [C.ll(3150, 20), C.ll(3350, 20)] }, // peron innej linii w tunelu
			line(3200, 3240, 26, { railway: 'rail', service: 'siding', layer: '-2' }, 9107), // krótka bocznica w tunelu (40 m)
			line(3200, 3240, 52, { railway: 'rail', service: 'siding', layer: '-1' }, 9108), // tor osobnego tunelu obok (52 m od osi)
		],
	};
	const dem = async (pts) => pts.map(() => 100); // siatka terenu (z nią generator mierzy wysokości torów z mapy w NMT)
	const def = await OSM.buildRoute(C.data, { from: 'Alfa', to: 'Beta', line: '448', lidar, dem, environment: async () => env });
	const t0 = def.tunnels[0], E = def.env;
	const rows = E.t.map((row) => { const pts = []; for (let k = 1; k + 1 < row.length; k += 2) pts.push([row[k], row[k + 1]]); return { f: row[0], pts }; });
	const near = (d0) => rows.filter((q) => q.pts.some(([, d]) => Math.abs(d - d0) < 2.5));
	// tory w tunelu naszej linii – w obudowie (bit 16), na jej poziomie
	assert.ok(near(-14).length && near(-14).every((q) => q.f & 16), 'tor sąsiedni w tunelu z flagą 16');
	assert.ok(near(-7).some((q) => q.f & 16 && q.pts.every(([s]) => s > t0.from && s < t0.to)), 'łącznica w tunelu z flagą 16');
	// WKD przykryta poza naszym tunelem – pominięta; tor w wykopie – zostaje, bez flagi
	const wkd = rows.filter((q) => q.pts.some(([s, d]) => Math.abs(d - 30) < 3 && s > t0.to + 300));
	assert.equal(wkd.length, 0, 'przykryty tor innej linii pominięty');
	// przykryty tor tuż obok naszego (do 25 m) poza tunelem – zostaje (na poziomie naszej linii), bez flagi tunelu
	const beside = rows.filter((q) => q.pts.some(([s, d]) => Math.abs(d + 18) < 2 && s > t0.to + 300));
	assert.ok(beside.length && beside.every((q) => !(q.f & 16)), 'przykryty tor obok naszego zostaje');
	// tor 4 m obok niego, z pomiarem 4 m wyżej – obniżony do jego poziomu (bez „nasypu” przyklejonego do toru)
	const zAt = (d0) => { const i = rows.findIndex((q) => q.pts.some(([s, d]) => Math.abs(d - d0) < 1.5 && s > t0.to + 300)); return i >= 0 ? E.th[i][Math.floor(E.th[i].length / 2)] : null; };
	assert.ok(zAt(-22) !== null && Math.abs(zAt(-22) - zAt(-18)) <= 2, `tor obok obniżony: ${zAt(-22)} / ${zAt(-18)}`);
	assert.ok(zAt(-26) !== null && Math.abs(zAt(-26) - zAt(-18)) <= 2, `tor obok podniesiony: ${zAt(-26)} / ${zAt(-18)}`);
	const cut = rows.filter((q) => q.pts.some(([s, d]) => Math.abs(d - 30) < 3 && s < t0.from - 500));
	assert.ok(cut.length && cut.every((q) => !(q.f & 16)), 'tor w wykopie zostaje na powierzchni');
	assert.ok(rows.every((q) => !(q.f & 32)), 'bez roboczej flagi 32');
	// krótki tor pod ziemią w obrębie naszego tunelu: do 45 m od osi – w obudowie, dalej – pominięty (osobny tunel)
	const inT = (q) => q.pts.some(([s]) => s > t0.from && s < t0.to);
	assert.ok(near(-26).filter(inT).length && near(-26).filter(inT).every((q) => q.f & 16), 'krótka bocznica w tunelu z flagą 16');
	assert.equal(near(-52).length, 0, 'tor osobnego tunelu pominięty');
	// woda nad kolektorem (przepust pod ziemią) – bez wody na powierzchni; staw obok zostaje
	const water = (s0, d0) => { const g = E.g, r = g.rows[Math.round((s0 - g.s0) / g.step)]; let c = 0; const col = Math.round((d0 - g.d0) / g.step); for (const m of r.matchAll(/([A-Z])(\d+)/g)) { c += +m[2]; if (c > col) return m[1].charCodeAt(0) - 65 === 9; } return false; };
	const sOf = (x) => def.stations[0].pos + x - 300 - 80; // kilometraż w miejscu x (przybliżony, jak w teście tunelu)
	assert.ok(![-1, 0, 1].some((k) => [-100, -50, 50, 100].some((d) => water(sOf(2000) + k * 10, d))), 'bez wody nad kolektorem');
	assert.ok([-130, 130].some((d) => water(sOf(2230), d)), 'staw obok zostaje');
	// stadion: największy budynek w obszarze stadionu – rodzaj 7 z nazwą obszaru; boisko z mapy (100 × 60 m, wzdłuż s)
	const iS = E.b.findIndex((row) => row[0] === 7);
	assert.ok(iS >= 0, 'budynek stadionu rozpoznany');
	const nm = []; for (let k = 0; k < E.bn.length; k += 2) if (E.bn[k] === iS) nm.push(E.bn[k + 1]);
	assert.deepEqual(nm, ['Stadion Testowy']);
	assert.equal(E.sp[0], iS, 'boisko stadionu');
	// wymiary z mapy (nie domyślne 105 × 68 m), dłuższy bok wzdłuż toru
	assert.ok(E.sp[5] > 450 && E.sp[5] < 580 && E.sp[6] > 270 && E.sp[6] < 400 && E.sp[6] !== 340 && Math.abs(E.sp[3]) > 950, `boisko: ${E.sp.join(',')}`);
	// perony: metro pominięte, peron innej linii w tunelu – bez pomiaru (poziom torów w grze)
	const pc = E.p.map((row) => { const m = (row.length - 1) / 2; let s0 = 0, d0 = 0; for (let k = 0; k < m; k++) { s0 += row[1 + k * 2] / m; d0 += row[2 + k * 2] / m; } return [s0, d0]; });
	assert.ok(!pc.some(([, d]) => Math.abs(d + 30) < 3), 'peron metra pominięty');
	const iT = pc.findIndex(([s, d]) => Math.abs(d + 20) < 4 && s > t0.from && s < t0.to);
	assert.ok(iT >= 0, 'peron w tunelu zachowany');
	assert.equal(E.ph[iT], -1, 'peron w tunelu bez pomiaru NMT');
	// stacje innych linii (nazwy peronów z mapy)
	assert.ok((E.os || []).some(([, n]) => n === 'Delta'), 'Delta w env.os');
	assert.ok(!(E.os || []).some(([, n]) => n === 'Metro'), 'metro nie w env.os');
});

test('generator: stacje według wykazu PKP PLK, tunele i pochylenia z RINF', async () => {
	const C = cityLine();
	// Epsilon: węzeł tuż przy naszym torze (reguła odległości by go zostawiła), w wykazie PKP PLK – tylko przy linii 9
	C.data.elements.push({ type: 'node', id: 99901, lat: C.ll(1500, 8).lat, lon: C.ll(1500, 8).lon, tags: { railway: 'halt', name: 'Epsilon' } });
	const plkD = {
		speeds: [], platforms: [], catenary: [],
		posts: [
			{ line: '448', kind: 'ST', name: 'Alfa', km: 0, platform: true },
			{ line: '448', kind: 'PO', name: 'Gamma', km: 2.47, platform: true },
			{ line: '448', kind: 'ST', name: 'Beta', km: 5.4, platform: true },
			{ line: '9', kind: 'PO', name: 'Epsilon', km: 12.3, platform: true },
			{ line: '2', kind: 'ST', name: 'Delta', km: 7.0, platform: true },
		],
	};
	// NMT: płasko 100 m, wzgórze 12 m nad tunelem z RINF (km 4,55–4,85 – ok. 4,9–5,25 km przebiegu)
	const lidar = async (pts) => pts.map((p) => { const east = (p.lon - C.lon0) * C.mlon; return east > 4800 && east < 5350 ? 112 : 100; });
	const rinf = { v: 'test', lines: { 448: [[0, 0], [2.5, -10], [2.9, 10], [3.3, 0]] }, tunnels: [['448', 4.55, 4.85, 300]] };
	const run = (r) => OSM.buildRoute(C.data, { from: 'Alfa', to: 'Beta', line: '448', lidar, plk: async () => plkD, rinf: r ? async () => r : undefined });
	const def = await run(rinf), def0 = await run(null);
	const names = def.stations.map((s) => s.name);
	assert.ok(!names.includes('Epsilon'), 'Epsilon pominięty (PKP PLK: linia 9) – stacje: ' + names.join(', '));
	assert.ok(def.issues.some((i) => i.k === 'station-other' && /Epsilon/.test(i.m) && /PKP PLK/.test(i.m)), 'uwaga o przystanku innej linii wg PKP PLK');
	// tunel z RINF bez odpowiednika w OSM – dodany (z uwagą)
	assert.ok(def.issues.some((i) => i.k === 'tunnel-rinf' && i.lvl === 'warn'), 'uwaga: tunel z RINF dodany');
	assert.equal(def.tunnels.length, def0.tunnels.length + 1, 'dodatkowy tunel z RINF');
	// pochylenia z RINF w tunelu z OSM: profil inny niż bez RINF
	const R1 = R.prepare(def, { train: 'ezt', cars: 1 }), R0 = R.prepare(def0, { train: 'ezt', cars: 1 }), t = def0.tunnels[0];
	let maxD = 0;
	for (let s = t.from; s <= t.to; s += 20) maxD = Math.max(maxD, Math.abs(R.heightAt(R1, s) - R.heightAt(R0, s)));
	assert.ok(maxD > 0.5, `profil w tunelu z RINF (różnica ${maxD.toFixed(2)} m)`);
});
