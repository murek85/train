const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/physics.js');
const R = require('../js/routes.js');
const ROUTES = require('./fixtures/test-routes.js'); // fikcyjne trasy testowe
const { Sim, autopilot, buildTimetable, SIGNALS, signalSpeed, signalText } = require('../js/sim.js');

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

test('zapis gry: jazda odtworzona z zapisu biegnie tak samo jak oryginał', () => {
	const route = routes[0];
	const tt = buildTimetable(route);
	const a = new Sim(route, { timetable: tt });
	for (let i = 0; i < 6000 && a.status === 'running'; i++) { autopilot(a); a.update(0.05); }
	assert.equal(a.status, 'running');
	assert.ok(a.next > 0 || a.st.pos > route.stations[0].pos + 100, 'pociąg ruszył');
	const snap = JSON.parse(JSON.stringify(a.snapshot())); // jak przez localStorage
	const b = Sim.restore(route, { timetable: tt }, snap);
	assert.deepEqual(b.snapshot(), a.snapshot());
	for (let i = 0; i < 4000; i++) {
		autopilot(a); a.update(0.05);
		autopilot(b); b.update(0.05);
	}
	assert.deepEqual(b.snapshot(), a.snapshot());
	assert.equal(b.score(), a.score());
});

test('zapis gry: zapis z innej trasy jest odrzucany', () => {
	const a = new Sim(routes[0], { timetable: buildTimetable(routes[0]) });
	const other = routes.find((r) => r.signals.length !== routes[0].signals.length || r.stations.length !== routes[0].stations.length);
	assert.ok(other, 'potrzebna trasa o innym układzie');
	assert.throws(() => Sim.restore(other, { timetable: buildTimetable(other) }, a.snapshot()), /nie pasuje/);
	assert.throws(() => Sim.restore(routes[0], {}, Object.assign(a.snapshot(), { v: 99 })), /wersja/);
});

test('zapis gry: odjazd ze stacji zgłasza zdarzenie „departed” (autozapis)', () => {
	const route = routes[0];
	const sim = new Sim(route, { timetable: buildTimetable(route) });
	const departed = [];
	for (let i = 0; i < 300000 && sim.status === 'running'; i++) {
		autopilot(sim); sim.update(0.05);
		for (const e of sim.events) if (e.type === 'departed') departed.push(e.index);
		sim.events.length = 0;
	}
	const stops = route.stations.map((s, i) => i).filter((i) => route.stations[i].stop && !route.stations[i].terminus); // także stacja początkowa
	assert.deepEqual(departed, stops);
});

test('sygnały Ie-1: tabela S1–S13a', () => {
	assert.deepEqual(SIGNALS.S2, { top: 'green', flash: false, low: false, pas: null, own: null, next: 'free' });
	assert.deepEqual(SIGNALS.S3, { top: 'green', flash: true, low: false, pas: null, own: null, next: 100 });
	assert.deepEqual(SIGNALS.S4, { top: 'yellow', flash: true, low: false, pas: null, own: null, next: 'low' });
	assert.deepEqual(SIGNALS.S5, { top: 'yellow', flash: false, low: false, pas: null, own: null, next: 'stop' });
	assert.deepEqual(SIGNALS.S6, { top: 'green', flash: false, low: true, pas: 'green', own: 100, next: 'free' });
	assert.deepEqual(SIGNALS.S9, { top: 'yellow', flash: false, low: true, pas: 'green', own: 100, next: 'stop' });
	assert.deepEqual(SIGNALS.S10, { top: 'green', flash: false, low: true, pas: null, own: 40, next: 'free' });
	assert.deepEqual(SIGNALS.S12a, { top: 'yellow', flash: true, low: true, pas: 'yellow', own: 60, next: 'low' });
	assert.deepEqual(SIGNALS.S13, { top: 'yellow', flash: false, low: true, pas: null, own: 40, next: 'stop' });
	assert.equal(signalText('S1').title, 'STÓJ');
	assert.equal(signalText('S11a').title, '60 km/h');
	assert.equal(signalText('S11a').next, 'następny: do 100 km/h');
});

test('sygnały Ie-1: ograniczenie przy semaforze ze spadku prędkości za nim', () => {
	const route = { limits: [{ pos: 0, speed: 120 }, { pos: 1200, speed: 40 }, { pos: 1600, speed: 120 }, { pos: 3000, speed: 90 }, { pos: 5000, speed: 60 }] };
	assert.equal(signalSpeed(route, 1000), 40, 'spadek do 40 km/h 200 m za semaforem');
	assert.equal(signalSpeed(route, 800), null, 'spadek dalej niż 300 m – tablice, nie semafor');
	assert.equal(signalSpeed(route, 2900), 100, '90 km/h – sygnał „do 100”');
	assert.equal(signalSpeed(route, 4900), 60);
	assert.equal(signalSpeed(route, 2000), null, 'bez zmiany prędkości');
});

test('sygnały Ie-1: zapowiedź zgodna z następnym semaforem przez cały przejazd', () => {
	for (const route of routes) {
		const sim = new Sim(route, { czuwak: false });
		let checks = 0;
		for (let i = 0; sim.status === 'running' && i < 300000; i++) {
			autopilot(sim);
			sim.update(0.05);
			if (i % 200) continue;
			sim.signals.forEach((sig, k) => {
				const S = SIGNALS[sig.code], nx = sim.signals[k + 1];
				if (sig.red) return assert.equal(sig.code, 'S1');
				const want = !nx || nx.red ? 'stop' : nx.speed === 100 ? 100 : nx.speed ? 'low' : 'free';
				assert.equal(S.next, want, `${route.id}: ${sig.code} przy następnym ${nx ? nx.code : 'końcu'}`);
				assert.equal(S.own, sig.speed);
				checks++;
			});
		}
		assert.ok(checks > 0);
	}
});

test('hamulec zespolony: automat przejeżdża trasy testowe, zatrzymania przy W4, bez kar', () => {
	for (const route of routes) {
		const sim = new Sim(route, { czuwak: true, shp: true, brake: 'air', timetable: buildTimetable(route) });
		drive(sim);
		assert.equal(sim.status, 'ended', `${route.id}: ${sim.failReason}`);
		for (const r of sim.records.filter((x) => !x.through)) assert.ok(!r.missed && Math.abs(r.error) < 6, `${route.id} ${r.station}: ${r.error}`);
		const pen = Object.values(sim.penalties).reduce((a, b) => a + b, 0);
		assert.ok(pen < 1, `${route.id}: kary ${JSON.stringify(sim.penalties)}`);
	}
});

test('hamulec zespolony: fala hamowania wzdłuż składu, nastawa G wolniejsza od P, luzowanie', () => {
	const mk = (cfg) => R.prepare(ROUTES[0], cfg).train;
	const run = (train) => {
		const a = P.createAir(train);
		a.valve = 'brake';
		const t = { first: null, last: null };
		for (let k = 0; k < 400; k++) {
			P.stepAir(a, 0.05);
			if (k === 40) a.valve = 'lap'; // 2 s hamowania – obniżenie ok. 0,7 bar
			if (t.first === null && a.cyl[0] > 0.5) t.first = k * 0.05;
			if (t.last === null && a.cyl[a.cyl.length - 1] > 0.5) t.last = k * 0.05;
		}
		return { t, a };
	};
	const fr = run(mk({ loco: 'ET22', cars: Array.from({ length: 20 }, () => ({ t: 'Eaos' })) }));
	const ps = run(mk({ loco: 'EU07', cars: Array.from({ length: 6 }, () => ({ t: '111A' })) }));
	assert.ok(fr.a.G && !ps.a.G);
	assert.ok(fr.t.last > fr.t.first, 'ostatni wagon hamuje później niż pierwszy');
	assert.ok(fr.t.first > ps.t.first, 'G napełnia cylindry wolniej niż P');
	assert.ok(Math.abs(fr.a.pg - 4.3) < 0.1 && fr.a.cyl[0] > 1.5, 'odcięcie trzyma ciśnienie: ' + fr.a.pg);
	// luzowanie: jazda – ciśnienie wraca do 5 bar, cylindry puste
	ps.a.valve = 'run';
	for (let k = 0; k < 1200; k++) P.stepAir(ps.a, 0.05);
	assert.ok(ps.a.pg > 4.95 && ps.a.cyl.every((c) => c < 0.05));
});

test('hamulec zespolony: nagłe opróżnia przewód, blokada jazdy, zapis i odczyt stanu', () => {
	const route = routes[0];
	const sim = new Sim(route, { czuwak: false, brake: 'air', timetable: buildTimetable(route) });
	for (let i = 0; i < 4000 && sim.st.v < 15; i++) { autopilot(sim); sim.update(0.05); }
	sim.emergency();
	assert.equal(sim.air.valve, 'emerg');
	assert.equal(sim.penalties.emergency, 15);
	sim.setLever(5);
	for (let i = 0; i < 40; i++) sim.update(0.05);
	assert.ok(sim.air.pg < 1 && sim.tractionBlock && sim.st.traction < 0.05, 'bez siły pociągowej przy pustym przewodzie');
	const snap = JSON.parse(JSON.stringify(sim.snapshot()));
	const back = Sim.restore(route, { czuwak: false, brake: 'air', timetable: sim.timetable }, snap);
	assert.deepEqual(back.air, sim.air);
	assert.equal(sim.brakeValve(-1), 'lap');
	assert.equal(sim.brakeValve(-1), 'run');
});

test('SHP: bez potwierdzenia hamowanie nagłe, przycisk czuwania potwierdza, nastawnik – nie', () => {
	const route = routes[0];
	const passMagnet = (ack) => {
		const sim = new Sim(route, { czuwak: false, shp: true, timetable: buildTimetable(route) });
		// bez potwierdzenia: automat kasuje tylko czuwak (jak zmiana nastawnika), przycisk czuwania nie jest naciskany
		if (!ack) sim.ackButton = () => sim.ackCzuwak();
		let alarm = false;
		for (let i = 0; sim.status === 'running' && i < 200000 && !sim.penalties.shp; i++) {
			autopilot(sim);
			sim.update(0.05);
			if (sim.shp.alarm) alarm = true;
			sim.events.length = 0;
			if (ack && sim.records.length > 1) break;
		}
		return { sim, alarm };
	};
	const ok = passMagnet(true), bad = passMagnet(false);
	assert.ok(ok.alarm && bad.alarm, 'SHP zadziałało przed semaforem');
	assert.equal(ok.sim.penalties.shp, 0);
	assert.equal(bad.sim.penalties.shp, 40);
	assert.ok(bad.sim.stats.emergencies > 0);
});

test('napęd wg serii – oporowy: za szybkie przechodzenie pozycji wyłącza wyłącznik szybki, przegrzanie oporników', () => {
	const route = R.prepare(ROUTES[0], { loco: 'EU07', cars: [{ t: '111A' }, { t: '111A' }] });
	const d = P.createDrive(route.train);
	assert.equal(d.kind, 'resistor');
	let trip = false;
	for (let t = 0; t < 2 && !trip; t += 0.05) { P.driveStep(d, route.train, 8, 0, 0.05, true); trip = d.events.includes('trip'); }
	assert.ok(trip, 'S8 od razu z postoju – przekaźnik nadmiarowy');
	const d2 = P.createDrive(route.train);
	let heat = false;
	for (let t = 0; t < 400 && !heat; t += 0.05) { P.driveStep(d2, route.train, 3, 0.5, 0.05, true); heat = d2.events.includes('heat'); }
	assert.ok(heat, 'długo na pozycji oporowej – przegrzanie');
	const d3 = P.createDrive(route.train);
	for (let t = 0; t < 400; t += 0.05) P.driveStep(d3, route.train, 12, 0.5, 0.05, true);
	assert.ok(d3.heat === 0 && P.driveEcon(d3, 12) && P.driveLabel(d3, 25) === 'B1');
	// sim: automat w trybie wg serii – bez wyłączeń i przegrzań
	const sim = new Sim(route, { czuwak: false, drive: 'series', timetable: buildTimetable(route) });
	drive(sim);
	assert.equal(sim.status, 'ended');
	assert.equal(sim.penalties.drive, 0);
});

test('napęd wg serii – falownik i spalinowy: siła narasta płynnie, obroty z opóźnieniem', () => {
	const elf = R.makeConsist({ emu: 'EN76', n: 1 }), sm = R.makeConsist({ loco: 'SM42', cars: [{ t: 'Bdhpumn' }] });
	const a = P.createDrive(elf), b = P.createDrive(sm);
	assert.equal(a.kind, 'inverter');
	assert.equal(b.kind, 'diesel');
	const fa = P.driveStep(a, elf, 10, 0, 0.5, true), fb = P.driveStep(b, sm, 8, 0, 0.5, true);
	assert.ok(fa < elf.maxForce * 0.2 && fb < sm.maxForce * 0.2, 'po 0,5 s jeszcze mała siła');
	for (let t = 0; t < 8; t += 0.05) { P.driveStep(a, elf, 10, 0, 0.05, true); P.driveStep(b, sm, 8, 0, 0.05, true); }
	assert.ok(a.F > elf.maxForce * 0.95 && b.rpm > 0.95);
});

test('przyczepność: pogoda, pora roku, liście, piasecznica; poślizg i płaskie miejsca (wg serii)', () => {
	assert.equal(P.adhesion('clear', 'summer', false, false), 0.3);
	assert.ok(P.adhesion('rain', 'summer', false, false) < 0.25);
	assert.ok(P.adhesion('snow', 'winter', false, false) < P.adhesion('snow', 'summer', false, false));
	assert.ok(P.adhesion('rain', 'autumn', true, false) <= 0.05);
	assert.ok(P.adhesion('rain', 'summer', false, true) > P.adhesion('rain', 'summer', false, false));
	const route = R.prepare(ROUTES[0], { loco: 'EU07', cars: [{ t: '111A' }, { t: '111A' }, { t: '111A' }] });
	const autumn = new Sim(route, { season: 'autumn' });
	assert.ok(autumn.leaves.length > 0, 'jesień – liście na trasie');
	// poślizg: EU07 w śniegu, wysoka pozycja od razu
	const sim = new Sim(route, { czuwak: false, drive: 'series', weather: 'snow', season: 'winter' });
	sim.ss[0].boardEnd = 0;
	for (let i = 0; i < 2000 && sim.doorsOpen; i++) sim.update(0.05);
	for (let i = 0; i < 40; i++) { sim.setLever(Math.min(10, sim.lever + 1)); sim.update(0.05); }
	let slip = false;
	for (let i = 0; i < 100; i++) { sim.update(0.05); if (sim.slip) slip = true; }
	assert.ok(slip || sim.drive.events.includes('trip') || !sim.panto.ws, 'poślizg albo wyłączenie przy za mocnym rozruchu');
	assert.ok(sim.sandOn() && sim.sand.t > 0);
	// płaskie miejsca: hamowanie nagłe na liściach (bez układu przeciwpoślizgowego)
	const s2 = new Sim(route, { czuwak: false, drive: 'series', weather: 'rain', season: 'autumn' });
	s2.leaves = [[0, route.length]];
	s2.st.v = 25;
	s2.doorsOpen = false;
	s2.emergency();
	for (let i = 0; i < 80; i++) s2.update(0.05);
	assert.equal(s2.penalties.flat, 10);
});

test('hamulec dodatkowy lokomotywy: tylko lokomotywa, przy hamulcu zespolonym', () => {
	const route = R.prepare(ROUTES[0], { loco: 'EU07', cars: [{ t: '111A' }, { t: '111A' }] });
	const sim = new Sim(route, { czuwak: false, brake: 'air' });
	// start z zahamowanym składem (zawór na odcięciu) – najpierw odhamowanie
	assert.equal(sim.air.valve, 'lap');
	assert.ok(sim.air.cyl[1] > 0.5);
	sim.air.valve = 'run';
	for (let i = 0; i < 600; i++) P.stepAir(sim.air, 0.05);
	assert.ok(sim.air.cyl[1] < 0.01);
	assert.equal(sim.locoBrake(1), 0.95);
	sim.locoBrake(1);
	for (let i = 0; i < 100; i++) P.stepAir(sim.air, 0.05);
	assert.ok(sim.air.loco > 1.8 && sim.air.cyl[1] < 0.01, 'cylinder lokomotywy, wagony bez hamowania');
	assert.equal(sim.locoBrake(-1), 0.95);
	const emu = new Sim(R.prepare(ROUTES[0], { emu: 'EN57', n: 1 }), { brake: 'air' });
	assert.equal(emu.locoBrake(1), null);
	assert.equal(new Sim(route, {}).locoBrake(1), null);
});

test('ocena jazdy: automat – wysoko, szarpana jazda – niska płynność, próbki do wykresu', () => {
	const route = routes[0];
	const tt = buildTimetable(route);
	assert.ok(tt.energy > 0, 'energia przejazdu automatu w rozkładzie');
	const sim = new Sim(route, { czuwak: false, timetable: tt });
	drive(sim);
	const r = sim.rating();
	assert.ok(r.overall >= 4, 'automat: ' + JSON.stringify(r.cats.map((c) => c.stars)));
	assert.ok(r.cats.find((c) => c.key === 'smooth').stars >= 4);
	assert.ok(sim.rate.samples.length > 50);
	// szarpana jazda: po odjeździe co 8 s – 5 s J5, potem 3 s H4
	const s2 = new Sim(route, { czuwak: false, timetable: tt });
	s2.ss[0].boardEnd = 0;
	for (let i = 0; i < 4000 && !s2.ss[0].cleared; i++) s2.update(0.05);
	for (let k = 0; k < 3600 && s2.status === 'running'; k++) { s2.setLever(s2.time % 8 < 5 ? 5 : -4); s2.update(0.05); }
	const r2 = s2.rating();
	assert.ok(r2.cats.find((c) => c.key === 'smooth').stars <= 3, 'szarpana: ' + r2.cats.find((c) => c.key === 'smooth').detail);
	// przerwana jazda – ocena ogólna 1
	const s3 = new Sim(route, { czuwak: false, timetable: tt });
	s3.fail('test');
	assert.equal(s3.rating().overall, 1);
});

test('start jazdy z zahamowanym składem: nastawnik na H1 (hamulec prosty), automat rusza i dojeżdża', () => {
	const sim = new Sim(routes[0], { czuwak: false });
	assert.equal(sim.lever, -1);
	assert.ok(sim.st.brake > 0.2);
	for (let i = 0; i < 200; i++) sim.update(0.05);
	assert.equal(sim.st.v, 0); // stoi zahamowany
	drive(sim);
	assert.equal(sim.status, 'ended', sim.failReason);
});

test('pora roku w trakcie jazdy: przyczepność i odcinki „liście na torze” tylko jesienią', () => {
	const sim = new Sim(routes[0], { czuwak: false, season: 'summer', weather: 'clear' });
	assert.equal(sim.leaves.length, 0);
	const summer = sim.adhesionAt(0, 100);
	assert.equal(sim.setSeason('summer'), false); // bez zmiany
	assert.equal(sim.setSeason('winter'), true);
	assert.equal(sim.opts.season, 'winter');
	assert.ok(sim.adhesionAt(0, 100) < summer);
	assert.equal(sim.leaves.length, 0);
	sim.setSeason('autumn');
	assert.ok(Array.isArray(sim.leaves));
	sim.setSeason('spring');
	assert.equal(sim.leaves.length, 0);
});
