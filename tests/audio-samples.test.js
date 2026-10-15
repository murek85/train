'use strict';
// Przygotowanie nagrań (js/audio-samples.js): wycinek, pętla z przenikaniem, normalizacja RMS
const test = require('node:test');
const assert = require('node:assert');
global.window = global.window || {};
require('../js/audio-samples.js');
const Bank = global.window.TrainSampleBank;

// udawany kontekst WebAudio: bufor = tablice kanałów
const ctx = {
	createBuffer: (ch, n, sr) => {
		const data = Array.from({ length: ch }, () => new Float32Array(n));
		return { numberOfChannels: ch, length: n, sampleRate: sr, duration: n / sr, getChannelData: (c) => data[c] };
	},
};
const raw = (sec, sr, f) => { const b = ctx.createBuffer(1, Math.round(sec * sr), sr); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = f(i / sr); return b; };

test('pętla: wycinek, przenikanie końca w początek, RMS ok. 0,1', () => {
	const B = new Bank(ctx);
	const src = raw(4, 1000, (t) => 0.5 * Math.sin(2 * Math.PI * 5 * t));
	const out = B.prepare(src, { loop: true, from: 1, len: 2, xf: 0.4 });
	assert.strictEqual(out.length, 1600); // 2 s − 0,4 s przenikania
	const d = out.getChannelData(0);
	let s = 0;
	for (const v of d) s += v * v;
	assert.ok(Math.abs(Math.sqrt(s / d.length) - 0.1) < 0.01);
	// koniec pętli przechodzi w początek bez skoku (sinus 5 Hz – ciągły co 0,2 s)
	assert.ok(Math.abs(d[d.length - 1] - d[0]) < 0.05);
});

test('pojedyncze: bez przenikania, wygaszone na końcu, głośność z gain', () => {
	const B = new Bank(ctx);
	const src = raw(0.5, 1000, () => 0.3);
	const out = B.prepare(src, { gain: 2 });
	assert.strictEqual(out.length, 500);
	const d = out.getChannelData(0);
	assert.ok(Math.abs(d[100] - 0.2) < 1e-3);
	assert.ok(Math.abs(d[d.length - 1]) < 1e-3);
});
