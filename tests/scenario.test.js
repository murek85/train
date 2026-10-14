// Scenariusze i zdarzenia (js/scenario.js, js/scenarios.js): przejazd automatem, ograniczenia doraźne, zanik napięcia,
// wydłużony postój, komunikaty dyżurnego, zdarzenia losowe, zapis gry.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const R = require('../js/routes.js');
const { Sim, autopilot, buildTimetable } = require('../js/sim.js');
const SC = require('../js/scenario.js');
const LIST = require('../js/scenarios.js');
const ROUTES = require('./fixtures/test-routes.js');

function routeOf(sc) {
	const def = require(path.join('..', 'routes', sc.route + '.js'));
	return R.prepare(def, R.normConfig(def, sc.train));
}
function drive(sim, each, maxSteps = 400000) {
	for (let i = 0; sim.status === 'running' && i < maxSteps; i++) {
		autopilot(sim);
		sim.update(0.05);
		if (each) each(sim);
		sim.events.length = 0;
	}
}

test('scenariusze: każdy przejeżdża automat, zdarzenia się wyzwalają, wynik z gwiazdkami', () => {
	const ids = new Set();
	for (const sc of LIST) {
		assert.ok(!ids.has(sc.id), 'unikalne id ' + sc.id);
		ids.add(sc.id);
		const route = routeOf(sc);
		const run = SC.runner(sc, route);
		const sim = new Sim(route, { czuwak: false, timetable: buildTimetable(route), scenario: run });
		let radios = 0;
		drive(sim, (s) => { radios += s.events.filter((e) => e.type === 'radio').length; });
		assert.equal(sim.status, 'ended', `${sc.id}: ${sim.failReason}`);
		assert.ok(run.state.fired.every(Boolean), `${sc.id}: wszystkie zdarzenia wyzwolone`);
		if ((sc.events || []).length) assert.ok(radios > 0, `${sc.id}: komunikaty dyżurnego`);
		const res = run.result(sim);
		assert.ok(res.ok && res.stars >= 1 && res.stars <= 3, sc.id);
		assert.equal(res.goals.length, (sc.goals || []).length);
		// ostatni krok („koniec jazdy”) zostaje na ekranie do podsumowania
		if (sc.tutorial) assert.equal(run.state.step, sc.tutorial.length - 1, `${sc.id}: samouczek do końca`);
	}
});

test('ograniczenie doraźne: obowiązuje na odcinku, automat zwalnia, HUD widzi zmianę', () => {
	const sc = LIST.find((x) => x.id === 'roboty-na-szlaku');
	const route = routeOf(sc);
	const sim = new Sim(route, { czuwak: false, timetable: buildTimetable(route), scenario: SC.runner(sc, route) });
	let vmax = 0, seen = false;
	drive(sim, (s) => {
		const t = s.tempLimits[0];
		if (!t) return;
		if (!seen) {
			// kolejne zmiany prędkości przed pociągiem: wśród nich początek ograniczenia doraźnego
			let x = s.st.pos, nl, hit = false;
			while ((nl = s.nextLimitChange(x)) && nl.pos <= t.from + 1) { if (nl.speed === 30 && Math.abs(nl.pos - t.from) < 1) hit = true; x = nl.pos; }
			assert.ok(hit, 'zmiana prędkości na początku ograniczenia doraźnego');
			seen = true;
		}
		if (s.st.pos - s.L > t.from && s.st.pos < t.to) { vmax = Math.max(vmax, s.st.v * 3.6); assert.equal(s.limit, 30); }
	});
	assert.ok(seen && vmax > 0 && vmax <= 33, 'prędkość na odcinku: ' + vmax.toFixed(1));
	assert.ok(sim.penalties.overspeed < 1);
});

test('zanik napięcia: brak siły pociągowej na odcinku, potem wyłącznik szybki załącza się ponownie', () => {
	const sc = LIST.find((x) => x.id === 'bez-pradu');
	const route = routeOf(sc);
	const sim = new Sim(route, { czuwak: false, timetable: buildTimetable(route), scenario: SC.runner(sc, route) });
	let off = 0, onAfter = false;
	drive(sim, (s) => {
		const o = s.outages[0];
		if (!o) return;
		if (s.outageOn) { off++; assert.equal(s.power, false); }
		else if (off && s.power) onAfter = true;
	});
	assert.ok(off > 0, 'pociąg przejechał odcinek bez napięcia');
	assert.ok(onAfter, 'napięcie wróciło');
	assert.equal(sim.status, 'ended');
});

test('wydłużony postój i opóźnienie odjazdu', () => {
	const sc = LIST.find((x) => x.id === 'roboty-na-szlaku');
	const route = routeOf(sc);
	const tt = buildTimetable(route);
	const i = route.stations.findIndex((s) => s.name === 'Chorzów Batory');
	const sim = new Sim(route, { czuwak: false, timetable: tt, scenario: SC.runner(sc, route) });
	drive(sim);
	assert.ok(sim.ss[i].departAt >= tt[i].dep + 120 - 3, 'odjazd po wydłużonym postoju');
	const d = { id: 't', events: [{ when: { start: true }, type: 'delay', extra: 200 }] };
	const sim2 = new Sim(route, { czuwak: false, timetable: tt, scenario: SC.runner(d, route) });
	drive(sim2);
	assert.ok(sim2.ss[0].departAt >= tt[0].dep + 200 - 3);
});

test('komunikat dyżurnego: bez potwierdzenia kara, Enter potwierdza', () => {
	const route = R.prepare(ROUTES[0]);
	const d = { id: 't', events: [{ when: { time: 1 }, type: 'radio', text: 'test', ack: 5 }] };
	const sim = new Sim(route, { czuwak: false, scenario: SC.runner(d, route) });
	for (let t = 0; t < 10; t += 0.05) sim.update(0.05);
	assert.equal(sim.penalties.radio, 10);
	const sim2 = new Sim(route, { czuwak: false, scenario: SC.runner(d, route) });
	for (let t = 0; t < 2; t += 0.05) sim2.update(0.05);
	assert.ok(sim2.ackRadio());
	for (let t = 0; t < 10; t += 0.05) sim2.update(0.05);
	assert.equal(sim2.penalties.radio, 0);
});

test('zdarzenia losowe: powtarzalne z ziarna, każda trasa testowa do przejechania', () => {
	for (const def of ROUTES) {
		const route = R.prepare(def);
		const a = SC.randomEvents(route, 1234, 'clear'), b = SC.randomEvents(route, 1234, 'clear');
		assert.deepEqual(a, b);
		assert.ok(a.events.length >= 2 && a.events.length <= 5);
		for (const seed of [1, 2, 3]) {
			const ev = SC.randomEvents(route, seed, 'clear');
			const sim = new Sim(route, { czuwak: false, timetable: buildTimetable(route), scenario: SC.runner(ev, route) });
			drive(sim);
			assert.equal(sim.status, 'ended', `${route.id} ziarno ${seed}: ${sim.failReason}`);
		}
	}
});

test('zapis gry ze scenariuszem: stan zdarzeń i samouczka wraca po wczytaniu', () => {
	const sc = LIST[0];
	const route = routeOf(sc);
	const tt = buildTimetable(route);
	const sim = new Sim(route, { czuwak: false, timetable: tt, scenario: SC.runner(sc, route) });
	for (let i = 0; i < 6000; i++) { autopilot(sim); sim.update(0.05); sim.events.length = 0; }
	const snap = JSON.parse(JSON.stringify(sim.snapshot()));
	const back = Sim.restore(route, { czuwak: false, timetable: tt, scenario: SC.runner(sc, route) }, snap);
	assert.deepEqual(back.scenario.state, sim.scenario.state);
	assert.deepEqual(back.stats, sim.stats);
	assert.deepEqual(back.tempLimits, sim.tempLimits);
	drive(back);
	assert.equal(back.status, 'ended');
});

test('rozkaz „O”: wręczony na stacji, odjazd dopiero po potwierdzeniu', () => {
	const sc = LIST.find((x) => x.id === 'roboty-na-szlaku');
	const route = routeOf(sc);
	const tt = buildTimetable(route);
	const i = route.stations.findIndex((s) => s.name === 'Zabrze');
	const sim = new Sim(route, { czuwak: false, timetable: tt, scenario: SC.runner(sc, route) });
	// bez potwierdzenia: pociąg stoi na stacji (semafor wyjazdowy „stój”)
	sim.ackOrder = () => false;
	for (let k = 0; k < 40000 && !sim.orders.length; k++) { autopilot(sim); sim.update(0.05); sim.events.length = 0; }
	const o = sim.orders[0];
	assert.ok(o && o.type === 'O' && o.station === 'Zabrze' && /30 km\/h/.test(o.text), JSON.stringify(o));
	for (let k = 0; k < 6000; k++) { autopilot(sim); sim.update(0.05); sim.events.length = 0; }
	assert.ok(!sim.ss[i].cleared && sim.st.v === 0 && /rozkazu/.test(sim.prompt), 'czeka na potwierdzenie');
	delete sim.ackOrder;
	assert.ok(sim.ackOrder());
	drive(sim);
	assert.equal(sim.status, 'ended');
	assert.equal(sim.penalties.order, 0);
});

test('uszkodzony semafor: rozkaz „S” (odstępowy) i sygnał zastępczy (wjazdowy), kara za ruszenie bez potwierdzenia', () => {
	const sc = LIST.find((x) => x.id === 'awaria-sterowania');
	const route = routeOf(sc);
	const tt = buildTimetable(route);
	const sim = new Sim(route, { czuwak: false, timetable: tt, scenario: SC.runner(sc, route) });
	const b = sim.signals.findIndex((s) => s.label === '212'), e = sim.signals.findIndex((s) => s.label === 'Q');
	let sz = false, slow = Infinity;
	drive(sim, (s) => {
		if (s.signals[e].code === 'Sz') sz = true;
		if (s.signals[b].permit === 'S' && s.st.pos > s.signals[b].pos && s.st.pos - s.L < s.signals[b + 1].pos) slow = Math.min(slow, 20 - s.st.v * 3.6);
	});
	assert.equal(sim.status, 'ended', sim.failReason);
	assert.equal(sim.signals[b].permit, 'S');
	assert.equal(sim.signals[e].permit, 'Sz');
	assert.ok(sz, 'sygnał zastępczy na semaforze wjazdowym');
	assert.ok(slow > -3, 'jazda do 20 km/h za semaforem na rozkaz „S”');
	assert.ok(sim.orders.some((o) => o.type === 'S' && o.acked));
	// ruszenie przed potwierdzeniem rozkazu „S”
	const sim2 = new Sim(route, { czuwak: false, timetable: tt, scenario: SC.runner(sc, route) });
	for (let k = 0; k < 40000 && !sim2.pendingOrder(); k++) { autopilot(sim2); sim2.update(0.05); sim2.events.length = 0; }
	assert.equal(sim2.pendingOrder().type, 'S');
	sim2.signals[b].permit = 'S'; // gracz rusza mimo braku potwierdzenia
	sim2.setLever(5);
	for (let k = 0; k < 200; k++) sim2.update(0.05);
	assert.equal(sim2.penalties.order, 20);
	// zapis: usterka, zezwolenie i rozkazy wracają
	const back = Sim.restore(route, { czuwak: false, timetable: tt, scenario: SC.runner(sc, route) }, JSON.parse(JSON.stringify(sim2.snapshot())));
	assert.ok(back.signals[b].fault && back.signals[e].fault);
	assert.deepEqual(back.orders.map((o) => o.type), ['S']);
});

test('rutynowe komunikaty dyżurnego – tylko z opcją', () => {
	const sc = LIST.find((x) => x.id === 'roboty-na-szlaku');
	const route = routeOf(sc);
	const tt = buildTimetable(route);
	for (const dispatch of [true, false]) {
		const sim = new Sim(route, { czuwak: false, timetable: tt, dispatch });
		let n = 0;
		drive(sim, (s) => { n += s.events.filter((x) => x.type === 'radio').length; });
		assert.equal(sim.status, 'ended');
		if (dispatch) assert.ok(n >= 4, 'odjazdy ze stacji i przyjęcie: ' + n);
		else assert.equal(n, 0);
	}
});

test('zadanie dnia: powtarzalne z daty, skład pasuje do linii, automat przejeżdża', () => {
	const fs = require('node:fs');
	const defs = fs.readdirSync(path.join(__dirname, '..', 'routes')).filter((f) => f.endsWith('.js')).map((f) => require(path.join('..', 'routes', f)));
	const a = SC.dailyScenario(new Date(2026, 9, 14), defs), b = SC.dailyScenario(new Date(2026, 9, 14), defs);
	assert.deepEqual(a, b);
	assert.notDeepEqual(SC.dailyScenario(new Date(2026, 9, 15), defs), a);
	assert.equal(a.id, 'daily-2026-10-14');
	for (let k = 0; k < 6; k++) {
		const d = SC.dailyScenario(new Date(2026, 0, 1 + k * 37), defs);
		const def = defs.find((x) => x.id === d.route);
		const route = R.prepare(def, R.normConfig(def, d.train));
		if (def.electrified === false) assert.equal(route.train.electric, false);
		const ev = Object.assign({}, d, { events: SC.randomEvents(route, d.seed, d.weather).events });
		const sim = new Sim(route, { czuwak: false, timetable: buildTimetable(route), scenario: SC.runner(ev, route), weather: d.weather, season: d.season });
		drive(sim);
		assert.equal(sim.status, 'ended', `${d.id} ${d.route}: ${sim.failReason}`);
		assert.equal(SC.runner(ev, route).goals().length, 2);
	}
});
