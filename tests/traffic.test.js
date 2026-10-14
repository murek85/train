// Ruch na linii (js/traffic.js): pociągi tła, blokada liniowa, zatrzymanie pociągu za spóźnionym graczem, zapis.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const R = require('../js/routes.js');
const P = require('../js/physics.js');
const { Sim, autopilot, buildTimetable } = require('../js/sim.js');
const { Traffic } = require('../js/traffic.js');

function real(id, cfg) {
	const def = require(path.join('..', 'routes', id + '.js'));
	return R.prepare(def, R.normConfig(def, cfg));
}
// przejazd automatem; min – najmniejszy odstęp między pociągiem gracza a pociągami tła na jego torze
function drive(sim, maxSteps = 400000) {
	let min = Infinity;
	for (let i = 0; sim.status === 'running' && i < maxSteps; i++) {
		autopilot(sim);
		sim.update(0.05);
		sim.events.length = 0;
		for (const t of sim.traffic.active()) {
			if (t.dir < 0) continue;
			const p = sim.st.pos;
			min = Math.min(min, t.s > p ? t.s - t.len - p : p - sim.L - t.s);
		}
	}
	return min;
}

test('ruch na linii: punktualny gracz – bez konfliktów, pociągi tła nie najeżdżają na siebie', () => {
	const route = real('gliwice-katowice', { emu: 'EN76', n: 1 });
	const tt = buildTimetable(route);
	for (const level of [1, 2, 3]) {
		const traffic = new Traffic(route, { level, seed: 11, timetable: tt });
		const sim = new Sim(route, { czuwak: false, timetable: tt, traffic });
		const gap = drive(sim);
		assert.equal(sim.status, 'ended', `poziom ${level}: ${sim.failReason}`);
		assert.ok(gap > 50, `odstęp ${gap}`);
		assert.equal(sim.stats.blocked, 0);
		const last = sim.records.find((r) => r.index === route.stations.length - 1);
		assert.ok(last.delay <= 30, 'punktualnie: ' + last.delay);
		// pociągi tła w tym samym kierunku nie zachodzą na siebie
		const same = traffic.trains.filter((t) => t.dir > 0 && t.active);
		for (const a of same) for (const b of same) if (a !== b && a.s > b.s) assert.ok(a.s - a.len > b.s, 'pociągi tła rozdzielone');
	}
});

test('ruch na linii: spóźniony gracz zatrzymuje pociąg za sobą – zdarzenie, kara tylko z opcją', () => {
	const route = real('gliwice-katowice', { emu: 'EN76', n: 1 });
	const tt = buildTimetable(route);
	for (const pen of [false, true]) {
		const traffic = new Traffic(route, { level: 2, seed: 11, timetable: tt });
		const sim = new Sim(route, { czuwak: false, timetable: tt, traffic, trafficPenalty: pen });
		sim.ss[0].extra = 600; // odjazd 10 min po czasie
		const gap = drive(sim);
		assert.equal(sim.status, 'ended');
		assert.ok(gap > 50);
		assert.ok(sim.stats.blocked >= 1, 'pociąg za graczem zatrzymany');
		assert.equal(sim.penalties.traffic, pen ? 10 * sim.stats.blocked : 0);
	}
});

test('blokada liniowa: semafor „stój” przed zajętym odstępem, pociąg gracza staje przed nim', () => {
	// towarowy gracza (bez postojów) dogania osobowy przed sobą
	const route = real('rybnik-katowice', { loco: 'ET22', cars: Array.from({ length: 14 }, () => ({ t: 'Eaos' })) });
	const tt = buildTimetable(route);
	const traffic = new Traffic(route, { level: 1, seed: 3, timetable: tt });
	const sim = new Sim(route, { czuwak: false, timetable: tt, traffic });
	let byTraffic = 0;
	for (let i = 0; sim.status === 'running' && i < 400000; i++) {
		autopilot(sim);
		sim.update(0.05);
		sim.events.length = 0;
		const sigs = sim.signals;
		sigs.forEach((s, k) => {
			if (s.passed || s.type === 'starter') return;
			const e = k + 1 < sigs.length ? sigs[k + 1].pos : route.length;
			if (s.red && traffic.occupied(s.pos, e)) byTraffic++;
		});
	}
	assert.equal(sim.status, 'ended', sim.failReason);
	assert.ok(byTraffic > 0, 'semafory zajęte przez pociąg tła');
});

test('ruch na linii: powtarzalny z ziarna, zapis i odczyt, linia bez sieci – składy spalinowe', () => {
	const route = real('torun-chelmza', { loco: 'SM42', cars: [{ t: 'Bdhpumn' }, { t: 'Bdhpumn' }] });
	const tt = buildTimetable(route);
	const a = new Traffic(route, { level: 3, seed: 5, timetable: tt }), b = new Traffic(route, { level: 3, seed: 5, timetable: tt });
	assert.deepEqual(a.snapshot(), b.snapshot());
	for (const t of a.trains) assert.equal(R.makeConsist(t.cfg).electric, false, 'spalinowy: ' + JSON.stringify(t.cfg));
	const sim = new Sim(route, { czuwak: false, timetable: tt, traffic: a });
	for (let i = 0; i < 12000; i++) { autopilot(sim); sim.update(0.05); sim.events.length = 0; }
	const snap = JSON.parse(JSON.stringify(sim.snapshot()));
	const back = Sim.restore(route, { czuwak: false, timetable: tt, traffic: new Traffic(route, { level: 3, seed: 5, timetable: tt }) }, snap);
	assert.deepEqual(back.traffic.snapshot(), sim.traffic.snapshot());
	drive(back);
	assert.equal(back.status, 'ended');
	assert.ok(P.LEVER_MAX > 0);
});

test('pasażerowie: popyt wg pory dnia, obciążenie i masa, postój z wymiany, pociągi tła zabierają podróżnych, tablica odjazdów', () => {
	const route = real('rybnik-katowice', { emu: 'EN57', n: 1 });
	const tt = buildTimetable(route);
	const traffic = new Traffic(route, { level: 3, seed: 7, timetable: tt });
	const sim = new Sim(route, { czuwak: false, timetable: tt, traffic });
	assert.ok(sim.pax.cap > 200 && sim.pax.load > 0, `pojemność ${sim.pax.cap}, start ${sim.pax.load}`);
	assert.equal(sim.train.mass, route.train.mass + sim.pax.load * 75); // kopia składu – trasa bez zmian
	const board = sim.departures(3);
	assert.ok(board.some((x) => x.player) && board.some((x) => x.track === 2), JSON.stringify(board));
	const ann = [], dwell = [];
	let maxLoad = 0, sv = null;
	for (let i = 0; sim.status === 'running' && i < 400000; i++) {
		autopilot(sim);
		sim.update(0.05);
		for (const e of sim.events) if (e.type === 'announce') ann.push(e.text);
		sim.events.length = 0;
		maxLoad = Math.max(maxLoad, sim.pax.load);
		if (sim.service !== sv && sim.service > 0) { const q = sim.ss[sim.service]; dwell.push([q.alight + q.board, q.boardEnd - q.boardStart]); }
		sv = sim.service;
	}
	assert.equal(sim.status, 'ended', sim.failReason);
	assert.equal(sim.pax.load, 0); // na stacji końcowej wysiedli wszyscy
	assert.ok(maxLoad > 80, 'najwięcej w pociągu ' + maxLoad);
	// więcej wymieniających się – dłuższy postój
	const sorted = dwell.slice(0, -1).sort((a, b) => a[0] - b[0]);
	assert.ok(sorted[sorted.length - 1][1] > sorted[0][1], JSON.stringify(sorted));
	assert.ok(ann.some((t) => t.startsWith('Następna stacja')) && ann.some((t) => /tor(ze)? drugi/.test(t)) && ann.some((t) => t.includes('zakończył bieg')));
	// pociąg tła przed graczem zabrał podróżnych – mniej wsiadających niż bez ruchu
	const solo = new Sim(route, { czuwak: false, timetable: tt });
	const k = Number(Object.keys(traffic.lastStopAt)[1]);
	assert.ok(sim.paxDemand(k, tt[k].arr) <= solo.paxDemand(k, tt[k].arr));
	// szczyt poranny – więcej podróżnych niż w nocy
	const night = R.prepare(Object.assign({}, require('../routes/rybnik-katowice.js'), { startClock: 2 * 3600 }), R.normConfig(require('../routes/rybnik-katowice.js'), { emu: 'EN57', n: 1 }));
	const sn = new Sim(night, { czuwak: false, timetable: tt });
	assert.ok(sn.paxDemand(5, tt[5].arr) < solo.paxDemand(5, tt[5].arr));
	// skład towarowy – bez pasażerów
	const fr = new Sim(real('rybnik-katowice', { loco: 'ET22', cars: [{ t: 'Eaos' }, { t: 'Eaos' }] }), { czuwak: false });
	assert.equal(fr.pax.cap, 0);
	// zapis i odczyt
	const r2 = Sim.restore(route, { czuwak: false, timetable: tt, traffic: new Traffic(route, { level: 3, seed: 7, timetable: tt }) }, sim.snapshot());
	assert.equal(r2.pax.load, sim.pax.load);
});

test('krzyżowania na liniach jednotorowych: odcinki z mapy, bez spotkań na jednym torze, bez zakleszczeń, komunikaty', () => {
	assert.equal(real('gliwice-katowice', { emu: 'EN76', n: 1 }).single, null); // linia dwutorowa
	const runs = [['torun-chelmza', { loco: 'SM42', cars: [{ t: 'Bdhpumn' }, { t: 'Bdhpumn' }] }, 3, 0, 7], ['torun-chelmza', { loco: 'SM42', cars: [{ t: 'Bdhpumn' }] }, 2, 600, 3], ['rybnik-katowice', { emu: 'EN57', n: 1 }, 3, 0, 7], ['rybnik-katowice', { emu: 'EN57', n: 1 }, 3, 720, 5]];
	let crossings = 0, held = 0;
	for (const [id, cfg, level, late, seed] of runs) {
		const route = real(id, cfg);
		assert.ok(route.single && route.single.length >= 3, id);
		const tt = buildTimetable(route);
		const traffic = new Traffic(route, { level, seed, timetable: tt });
		const sim = new Sim(route, { czuwak: false, timetable: tt, traffic, dispatch: true });
		const radio = [];
		for (let i = 0; sim.status === 'running' && i < 400000; i++) {
			// spóźniony odjazd z początku trasy
			if (sim.time < late) { sim.ss[0].boardEnd = late; sim.update(0.05); } else { autopilot(sim); sim.update(0.05); }
			for (const e of sim.events) if (e.type === 'radio') radio.push(e.text);
			sim.events.length = 0;
			if (i % 20) continue;
			const act = traffic.active();
			for (const [a, b] of route.single) {
				const fwd = act.some((t) => t.dir > 0 && t.s > a && t.s - t.len < b) || (sim.st.pos > a && sim.st.pos - sim.L < b);
				const opp = act.some((t) => t.dir < 0 && t.s < b && t.s + t.len > a);
				assert.ok(!(fwd && opp), `${id}: spotkanie na odcinku ${a}–${b} w chwili ${Math.round(sim.time)}`);
			}
			const opp = act.filter((t) => t.dir < 0).sort((x, y) => x.s - y.s);
			for (let k = 1; k < opp.length; k++) assert.ok(opp[k].s > opp[k - 1].s + opp[k - 1].len, `${id}: pociągi z przeciwka najechały na siebie`);
		}
		assert.equal(sim.status, 'ended', `${id} poziom ${level}: ${sim.failReason || 'nie dojechał (zakleszczenie?)'}`);
		crossings += sim.stats.crossings || 0;
		held += traffic.heldCount;
		if (sim.stats.crossings) assert.ok(radio.some((t) => t.includes('krzyżowanie')));
		if (traffic.heldCount) assert.ok(radio.some((t) => t.includes('czeka')));
	}
	assert.ok(crossings > 0 && held > 0, `krzyżowania ${crossings}, oczekiwania pociągów z przeciwka ${held}`);
});
