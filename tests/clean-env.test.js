// Poprawki danych otoczenia z mapy (js/routes.js cleanEnv – gra i generator): przerwy w torach przy portalach tunelu,
// „wiadukty kolejowe” biegnące obok linii zamieniane na tory.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/routes.js');

test('cleanEnv: przerwa w torze przy portalu tunelu połączona', () => {
	// tor przed portalem kończy się 6 m przed początkiem swojego odcinka w tunelu
	const def = { tunnels: [{ from: 100, to: 400 }], env: { t: [[8, 0, -5, 50, -5, 94, -5], [24, 100, -5, 150, -5, 200, -5]], th: [[10, 10, 10], [10, 10, 10]] } };
	R.cleanEnv(def);
	const a = def.env.t[0];
	assert.equal(a[a.length - 2], 100, 'koniec toru przed portalem dochodzi do początku odcinka w tunelu');
	assert.equal(def.env.th[0].length, (a.length - 1) / 2, 'wysokości dopisane razem z punktem');
	R.cleanEnv(def); // drugi raz – bez zmian
	assert.equal(def.env.t[0].length, a.length);
});

test('cleanEnv: przerwa przy rozjeździe (koniec przy innym torze) nie jest łączona', () => {
	const def = { tunnels: [{ from: 100, to: 400 }], env: { t: [[8, 0, -5, 94, -5], [8, 94.5, -5.5, 120, -9], [24, 100, -5, 150, -5]] } };
	R.cleanEnv(def);
	assert.equal(def.env.t[0].length, 5);
});

test('cleanEnv: „wiadukt” obok linii → tor z mapy (bit 64), przecinający – podzielony', () => {
	const beside = [0, 0, -10, 60, -11, 120, -12];
	// przechodzi nad linią (z +30 na −20 m), dalej 200 m obok niej
	const cross = [0, 0, 30, 20, 10, 40, -10, 60, -20];
	for (let s = 80; s <= 300; s += 20) cross.push(s, -20);
	const def = { tunnels: [], env: { t: [], th: [], ro: [beside, cross] } };
	R.cleanEnv(def);
	assert.equal(def.env.ro.length, 1, 'zostaje tylko obiekt przechodzący nad linią');
	const ro = def.env.ro[0];
	assert.ok(ro.length < cross.length, 'wiadukt przycięty do przejścia nad linią');
	assert.ok(def.env.t.length >= 2, 'tor obok linii i odcinek równoległy – tory z mapy');
	for (const row of def.env.t) assert.ok(row[0] & 64, 'oznaczenie: tor odzyskany z wiaduktu');
	assert.ok(def.env.t.some((row) => row[0] & 2), 'tor obok linii zachowuje znacznik mostu');
});
