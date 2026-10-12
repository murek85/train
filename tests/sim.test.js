const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/physics.js');
const R = require('../js/routes.js');
const ROUTES = require('./fixtures/test-routes.js'); // fikcyjne trasy testowe
const { Sim, autopilot, buildTimetable } = require('../js/sim.js');

const routes = ROUTES.map(R.prepare);

function drive(sim, maxSteps = 300000) {
	for (let i = 0; sim.status === 'running' && i < maxSteps; i++) {
		autopilot(sim);
		sim.update(0.05);
	}
}

test('nastawnik: moc, hamulec i hamowanie nagłe', () => {
	assert.deepEqual(P.leverCommand(5), { power: 1, brake: 0, emergency: false });
	assert.equal(P.leverCommand(-2).brake, 0.5);
	assert.equal(P.leverCommand(P.LEVER_MIN).emergency, true);
	assert.equal(P.leverLabel(-3), 'H3');
});

test('pociąg rozpędza się i hamuje do zera', () => {
	const train = R.TRAINS.ezt;
	const s = P.createState(0);
	for (let t = 0; t < 30; t += 0.05) P.step(s, train, P.leverCommand(5), 0, 0.05);
	assert.ok(s.v > 10 && s.v < train.vmax, 'prędkość po 30 s: ' + s.v); // EN57: ok. 50 km/h po 30 s
	const startPos = s.pos;
	const v0 = s.v;
	for (let t = 0; t < 120 && s.v > 0; t += 0.05) P.step(s, train, P.leverCommand(-4), 0, 0.05);
	assert.equal(s.v, 0);
	const dist = s.pos - startPos;
	assert.ok(dist < P.brakingEstimate(v0, train.serviceDecel) * 1.15, 'droga hamowania ' + dist);
});

test('pociąg stojący na płaskim bez napędu nie rusza', () => {
	const s = P.createState(0);
	for (let t = 0; t < 5; t += 0.05) P.step(s, R.TRAINS.ic, P.leverCommand(0), 0, 0.05);
	assert.equal(s.v, 0);
	assert.equal(s.pos, 0);
});

test('ograniczenia prędkości i profil wysokości', () => {
	const r = routes[0];
	assert.equal(R.limitAt(r, 100), 40);
	assert.equal(R.limitOver(r, 4000, 4200), 70);
	assert.equal(R.heightAt(r, 800), 0);
	assert.ok(Math.abs(R.heightAt(r, 1800) - 5) < 1e-9);
});

for (const route of routes) {
	test(`automat przejeżdża trasę „${route.id}” bez błędów`, () => {
		const sim = new Sim(route, { czuwak: true });
		drive(sim);
		assert.equal(sim.status, 'ended', sim.failReason);
		assert.equal(sim.penalties.overrun, 0);
		assert.ok(sim.penalties.overspeed < 5, 'kara za prędkość ' + sim.penalties.overspeed);
		for (const r of sim.records.filter((x) => !x.through)) assert.ok(Math.abs(r.error) < 3, `${r.station}: błąd zatrzymania ${r.error}`);
	});

	test(`rozkład trasy „${route.id}” jest wykonalny`, () => {
		const tt = buildTimetable(route);
		assert.equal(tt.length, route.stations.length);
		const sim = new Sim(route, { czuwak: true, timetable: tt });
		drive(sim);
		assert.equal(sim.status, 'ended', sim.failReason);
		for (const r of sim.records.filter((x) => !x.through)) assert.ok(r.delay <= 30, `${r.station}: opóźnienie ${r.delay}`);
		assert.ok(sim.score() > sim.maxScore() * 0.8, `wynik ${sim.score()} / ${sim.maxScore()}`);
	});
}

for (const route of routes) {
	test(`geometria toru „${route.id}”: ciągła, łuki poza peronami`, () => {
		let prev = R.trackPoint(route, -100);
		for (let s = -98; s < route.length; s += 2) {
			const p = R.trackPoint(route, s);
			const d = Math.hypot(p.x - prev.x, p.z - prev.z);
			assert.ok(Math.abs(d - 2) < 0.01, `skok geometrii przy ${s}: ${d}`);
			prev = p;
		}
		for (const st of route.stations) {
			for (let s = st.platformStart - 20; s <= st.platformEnd + 20; s += 5) {
				assert.equal(R.curvatureAt(route, s), 0, `łuk na peronie ${st.name} (${s} m)`);
			}
		}
		const c = route.curves[0];
		const turn = R.trackPoint(route, c.to + 10).heading - R.trackPoint(route, c.from - 10).heading;
		const ramp = Math.min(80, (c.to - c.from) / 3);
		assert.ok(Math.abs(turn - (c.to - c.from - ramp) / c.r) < 0.01, 'kąt skrętu łuku ' + turn);
	});
}

test('skład z menu: długość, masa i limit peronu', () => {
	const def = ROUTES[0];
	const t2 = R.makeTrain('ezt', 2);
	assert.equal(t2.cars.length, 6); // dwa zespoły EN57 po trzy wagony
	assert.deepEqual(t2.pantographs, [1, 4]);
	assert.ok(t2.mass > R.makeTrain('ezt', 1).mass);
	assert.ok(R.trainLengthOf(R.makeTrain('ezt', R.maxCars(def, 'ezt'))) <= def.platformLength - 10);
	const r = R.prepare(def, { train: 'ic', cars: 99 });
	assert.ok(r.trainLength <= def.platformLength - 10, 'skład przycięty do peronu');
});

for (const [routeIdx, cfg] of [[0, { train: 'ic', cars: 4 }], [0, { train: 'ezt', cars: 2 }], [1, { train: 'ezt', cars: 6 }], [1, { train: 'ic', cars: 9 }]]) {
	test(`automat: trasa ${ROUTES[routeIdx].id}, skład ${cfg.train} × ${cfg.cars}`, () => {
		const route = R.prepare(ROUTES[routeIdx], cfg);
		const tt = buildTimetable(route);
		const sim = new Sim(route, { czuwak: true, timetable: tt });
		drive(sim);
		assert.equal(sim.status, 'ended', sim.failReason);
		for (const r of sim.records.filter((x) => !x.through)) assert.ok(r.delay <= 30, `${r.station}: opóźnienie ${r.delay}`);
	});
}
