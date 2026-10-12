/* Zmyślona mała trasa w formacie trasy rzeczywistej (jak z generatora): krzywizna co 10 m, perony z danych,
   mosty, semafory z nazwami, uwagi generatora, rozjazd krzyżowy i wiadukt kolejowy w otoczeniu (bez budynków,
   dróg i terenu). Dane do testów poprawek tras i przejazdu automatem. */
module.exports = function realMini() {
	const k = [];
	for (let i = 0; i < 840; i++) {
		const s = i * 10;
		k.push(s >= 2000 && s < 2600 ? 125 : s >= 6000 && s < 6400 ? -100 : 0); // łuki R 800 m w prawo i R 1000 m w lewo
	}
	return {
		id: 'mini-real',
		name: 'Osobowy testowy',
		title: 'Alfa – Gamma',
		desc: 'Zmyślona trasa testowa w formacie trasy rzeczywistej.',
		difficulty: 'łatwy',
		train: 'ezt',
		startClock: 7 * 3600,
		originWait: 45,
		dwell: 30,
		platformLength: 220,
		real: true,
		line: '1',
		source: 'Dane testowe',
		stations: [
			{ name: 'Alfa', pos: 460, platform: { side: -1, edge: 1.72, width: 7, s0: 255, s1: 475, island: true, h: 0.76, measured: 1 } },
			{ name: 'Beta', pos: 4200, type: 'halt', platform: { side: 1, edge: 1.72, width: 4.5, s0: 3995, s1: 4215, inferred: true } },
			{ name: 'Gamma', pos: 8000, platform: { side: 1, edge: 1.72, width: 6.5, s0: 7795, s1: 8015, inferred: true } },
		],
		limits: [[0, 40], [650, 100], [7500, 60], [7700, 40]],
		grades: [[0, 0], [1000, 3], [3000, -2.5], [6000, 0]],
		signals: [
			{ pos: 1500, name: '101', kind: 'block' },
			{ pos: 2700, name: '103', kind: 'block' },
			{ pos: 3600, name: 'C', kind: 'entry' },
			{ pos: 5200, name: '105', kind: 'block' },
			{ pos: 6500, name: '107', kind: 'block' },
			{ pos: 7300, name: 'F', kind: 'entry' },
		],
		crossings: [2300],
		bridges: [
			{ from: 1800, to: 1830, kind: 'viaduct', over: 'road' },
			{ from: 3300, to: 3340, kind: 'water', over: 'water' },
			{ from: 5000, to: 5016, kind: 'viaduct', over: 'rail', auto: true },
		],
		tunnels: [],
		curvature: { step: 10, scale: 1e5, k },
		double: true,
		issues: [
			{ id: 'bridge@3320', k: 'bridge', pos: 3320, lvl: 'info', m: 'Most bez rozpoznanego obiektu pod spodem.', fix: 'Obejrzyj miejsce.' },
			{ id: 'cross@5008', k: 'cross', pos: 5008, lvl: 'info', m: 'Inny tor przecina tor bez połączenia i bez mostu w danych – dodano wiadukt.', fix: 'Jeśli dobrze: "ignore": ["cross@5008"].' },
			{ id: 'slip@7900', k: 'slip', pos: 7900, lvl: 'warn', m: 'Rozjazd krzyżowy bez typu w danych.', fix: '"switches": [{ "at": 7900, "type": "double" }].' },
		],
		env: {
			v: 8, b: [], r: [], w: [], t: [], p: [], o: [], ob: [], k: [],
			ro: [[0, 6100, -60, 6100, 60]],
			sw: [[7900, -2.25, 0.1, 1, 190, 4, 0.11, 0, 0, 0, 0]],
			g: { step: 10, s0: 0, d0: -380, cols: 77, rows: [] },
		},
	};
};
