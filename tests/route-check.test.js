// Kontrola tras (js/route-check.js): wbudowane trasy bez błędów, popsute dane – wykryte.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/routes.js');
const RC = require('../js/route-check.js');

test('kontrola tras: wbudowane trasy bez błędów', () => {
	for (const f of fs.readdirSync(path.join(__dirname, '..', 'routes')).filter((x) => x.endsWith('.js'))) {
		const def = require(path.join('..', 'routes', f));
		const out = RC.check(R.prepare(def, R.normConfig(def, null)));
		assert.deepEqual(out.filter((x) => x.lvl === 'warn').map((x) => x.m), [], def.id);
	}
});

test('kontrola tras: popsute dane – W4 poza peronem, przejazd na peronie, skok wysokości, zbyt niska prędkość', () => {
	const def = require(path.join('..', 'routes', 'gliwice-zabrze.js'));
	const route = R.prepare(def, R.normConfig(def, null));
	const st = route.stations[1];
	st.pos = st.platformStart - 50;
	route.crossings.push({ pos: (st.platformStart + st.platformEnd) / 2, hornFrom: st.platformStart - 400 });
	route.limits.push({ pos: 5000, speed: 10 });
	route.limits.sort((a, b) => a.pos - b.pos);
	const g = route.grades.findIndex((x) => x.pos > 3000);
	route.grades[g].h += 6;
	const k = RC.check(route, { drive: false }).filter((x) => x.lvl === 'warn').map((x) => x.k);
	for (const want of ['w4', 'crossing', 'speed', 'height']) assert.ok(k.includes(want), want + ' w ' + k.join(','));
});
