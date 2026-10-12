// Uwagi generatora i poprawki tras (sekcja fixes): nakładanie poprawek przed przygotowaniem trasy.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/routes.js');
const { Sim, autopilot, buildTimetable } = require('../js/sim.js');
const GK = require('./fixtures/real-mini.js')();

test('trasy rzeczywiste: uwagi generatora z miejscem, poziomem i podpowiedzią poprawki', () => {
	for (const def of [GK]) {
		assert.ok(Array.isArray(def.issues), def.id + ': lista uwag');
		for (const x of def.issues) {
			assert.ok(x.id && x.k && typeof x.pos === 'number' && x.m && x.fix, def.id + ': pełna uwaga ' + JSON.stringify(x));
			assert.ok(x.lvl === 'warn' || x.lvl === 'info');
		}
		// mosty i wiadukty: rozpoznane, nad czym prowadzą
		assert.ok(def.bridges.every((b) => b.from < b.to && ['water', 'viaduct'].includes(b.kind)));
	}
	assert.ok(GK.bridges.length >= 3, 'mosty i wiadukty: ' + GK.bridges.length);
	assert.ok((GK.env.ro || []).length >= 1, 'wiadukty kolejowe nad torem');
});

test('poprawki: peron, mosty, semafory, ograniczenia, przejazdy, stacje', () => {
	const br = GK.bridges.find((b) => b.kind === 'viaduct');
	const sig = GK.signals[3];
	const zabrze = GK.stations.find((s) => s.name === 'Beta');
	const def = Object.assign({}, GK, {
		fixes: {
			stations: {
				Beta: { platform: { side: 1, edge: 1.8, width: 6 } },
				add: [{ name: 'Testowy Przystanek', pos: zabrze.pos + 1500 }],
			},
			bridges: [{ at: (br.from + br.to) / 2, remove: true }, { from: 2900, to: 2920, kind: 'water' }],
			signals: [{ at: sig.pos + 10, d: -3.5 }, { at: GK.signals[4].pos, gantry: true }, { pos: 5000, name: 'X1' }],
			limits: [[6000, 60]],
			crossings: { add: [7000] },
			ignore: [GK.issues[0].id],
		},
	});
	const r = R.prepare(def, { train: 'ezt', cars: 1 });
	const z = r.stations.find((s) => s.name === 'Beta');
	assert.equal(z.platform.side, 1);
	assert.equal(z.platform.width, 6);
	assert.equal(z.platform.s0, zabrze.platform.s0, 'zakres peronu zachowany');
	assert.ok(r.stations.some((s) => s.name === 'Testowy Przystanek' && s.type === 'halt'));
	assert.ok(!r.bridges.some((b) => b.from === br.from), 'most usunięty');
	assert.ok(r.bridges.some((b) => b.from === 2900 && b.kind === 'water'), 'most dodany');
	const s3 = r.signals.find((s) => Math.abs(s.pos - sig.pos) < 1);
	assert.equal(s3.d, -3.5);
	assert.ok(r.signals.find((s) => Math.abs(s.pos - GK.signals[4].pos) < 1).gantry);
	assert.ok(r.signals.some((s) => s.pos === 5000 && s.label === 'X1'));
	assert.ok(r.limits.some((l) => l.pos === 6000 && l.speed === 60));
	assert.ok(r.crossings.some((c) => c.pos === 7000));
	assert.equal(R.issueStatus(def, GK.issues[0]), 'ignored');
	// trasa z poprawkami da się przejechać
	const sim = new Sim(r, { czuwak: false, timetable: buildTimetable(r) });
	for (let i = 0; sim.status === 'running' && i < 400000; i++) { autopilot(sim); sim.update(0.05); }
	assert.equal(sim.status, 'ended', sim.failReason);
});

test('poprawki: status uwag – poprawione w miejscu uwagi', () => {
	const x = GK.issues.find((q) => q.k === 'bridge-add' || q.k === 'cross');
	assert.ok(x);
	assert.equal(R.issueStatus(GK, x), null);
	assert.equal(R.issueStatus({ fixes: { bridges: [{ at: x.pos, remove: true }] } }, x), 'fixed');
});

test('poprawki: typ rozjazdu krzyżowego, opis trasy bez zmian', () => {
	const OK = GK;
	const x = OK.env.sw.find((q) => q[5] >= 2);
	assert.ok(x, 'rozjazd krzyżowy lub skrzyżowanie na trasie');
	const before = x[5];
	const def = Object.assign({}, OK, { fixes: { switches: [{ at: x[0], d: x[1], type: 'single', end: -1 }] } });
	const r = R.prepare(def, { train: 'ezt', cars: 1 });
	const y = r.env.sw.find((q) => q[0] === x[0] && q[1] === x[1]);
	assert.equal(y[5], 3);
	assert.equal(y[10], -1);
	assert.equal(x[5], before, 'opis trasy niezmieniony');
	const slip = OK.issues.find((q) => q.k === 'slip');
	if (slip) assert.equal(R.issueStatus({ fixes: { switches: [{ at: slip.pos, type: 'double' }] } }, slip), 'fixed');
});
