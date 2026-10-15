/* Modele składów generowane w kodzie.
   Pudło wagonu to przekrój poprzeczny (zaokrąglony dach, zwężający się dół) wyciągnięty wzdłuż wagonu,
   z czołem wymodelowanym przez kolejne przekroje (skos szyby, zaokrąglone narożniki). Malowanie – pasy,
   pas okienny, dach, szyby czołowe – to grupy ścian tej samej bryły. Do tego: okna z widocznym wnętrzem
   (nocą oświetlonym), drzwi z uszczelkami, wyświetlacze kierunkowe, wózki z maźnicami i obracającymi się
   kołami, osłony i skrzynie podwozia, sprzęgi, pługi, trzy reflektory, wycieraczki, pantografy jednoramienne
   z iskrzeniem nocą, żaluzje lokomotywy. Jakość: patyna, spoiny i nity w shaderze taboru (common.js, wariant 'train'),
   okluzja wypiekana w wierzchołkach (bakeWear), fazowane krawędzie i bryły toczone w modelu szczegółowym (detail),
   drobne detale tylko z bliska (fine / THREE.LOD). */
(function () {
	'use strict';
	const T = window.THREE;
	const R = window.TrainRoutes;
	const NS = window.Train3D;
	const { mat: utilMat, matS: utilMatS, patch, box: boxU, sprite, glowTexture, disposeTree, canvasTexture, hash, GEO } = NS.util;
	/* Materiały taboru: wariant 'train' (patyna, okluzja – common.js TRAIN_GLSL); { train: g } – zabrudzenie bazowe
	   części ruchomych (koła – mocno, reszta – lekko; części stałe brudzą się wg wysokości nad szyną). */
	const mat = (color, extra) => utilMat(color, Object.assign({ train: 0.12 }, extra));
	const matS = (color, extra) => utilMatS(color, Object.assign({ train: 0.12 }, extra));

	// kolory malowania; nose – długość czoła (m), yb – dolna krawędź szyby czołowej, round – zaokrąglenie narożników czoła,
	// split – płaskie czoło z dwiema szybami rozdzielonymi słupkiem (EN57, EU07); bez split – szyba „opływowa” na boki
	/* Malowania wg zdjęć (Wikimedia Commons: EN57-935 Katowice Ligota 1993, EU07-195 Poznań 2019, 112A PKP) i palet RAL
	   (malowanie lokomotyw PKP epoki IV–Va: RAL 6027 / 6005, dach RAL 7031, czołownica RAL 2004; PKP Cargo: RAL 5010,
	   pas zielony, dach RAL 7042). */
	const STYLES = {
		// EN57 (jak EN57-038 w barwach retro): dół granatowy z przetłoczeniami, pas okienny i drzwi żółte, dach
		// jasnoszary, czarny fartuch czoła, czerwone ramy pantografów; trzy szyby czołowe, zderzak centralny
		ezt: { paint: '#16357a', stripe: '#f4cb10', band: '#f4cb10', roof: '#b4b9c0', door: '#f4cb10', apron: '#121618', panto: '#b02832', nose: 0.3, yb: 3.3, round: 0.24, split: true, panes: 3, central: true, vfront: true, headY: 1.8, tailY: 1.55, roofLamp: true, headR: 0.18, ploughW: 1.7,
			/* czoło pionowe (jak EN57-038): od dołu czarny fartuch (pas nakładany), granat z reflektorami do 2,5 m, żółty pas
			   z trzema szybami (2,62–3,28 m; szyba środkowa węższa), nad nim jasnoszary dach z wyświetlaczem */
			face: (x, y) => {
				const ax = Math.abs(x);
				// granice jak na burtach: granat do 2,15 m, szyby 2,3–3,3 m (jak okna boczne), szary dach od 3,45 m
				if (y > 3.45) return 3;
				if (y < 2.15) return 0;
				// szyba środkowa wąska (tej samej wysokości co boczne), boczne szerokie
				return y > 2.3 && y < 3.3 && (ax < 0.2 || (ax > 0.34 && ax < 1.18)) ? 4 : 1;
			}, seat: '#6e3b24' },
		// EU07 (jak EU07-333, malowanie PKP z lat 90.): górna połowa burt jasna miętowa zieleń (ciemne kratki i okna), dolna
		// ciemnozielona z poziomymi przetłoczeniami, czoło żółte pod jasnozielonym pasem szyb (trzy szyby), dach
		// brązowoszary, wyposażenie dachu i pantografy rdzawobrązowe, duży biały numer i napis PKP na burtach
		// (wg zdjęć EU07-195 i EP07-338: reflektor w obudowie na dachu między syrenami, lampy czołowe z białym i czerwonym
		// światłem w jednej obręczy na wysokości tabliczki, osobne zgarniacze pod zderzakami, wycieraczki zawieszone u góry szyb)
		loco: { paint: '#9cc4ab', stripe: '#1f2124', band: '#3f5a3e', roof: '#6b5a50', door: '#9cc4ab', head: '#1d1d1d', front: '#e8b830', frame: '#9cc4ab', panto: '#7a3a30', splitY: 2.3, ribs: true, panes: 3, nose: 0.9, yb: 2.5, round: 0.25, split: true, seat: '#444',
			roofLamp: true, twinLamp: true, headY: 1.74, headR: 0.17, plateY: 1.74, plough: 'pair', wiperTop: true },
		// wagon 111A (malowanie PKP z lat 90.): zielony pas okienny aż do dachu, kremowy pas pod oknami, wąski zielony pas
		// u dołu, kremowe drzwi, zielone ściany czołowe, dach beżowoszary
		coach: { paint: '#4f9a6c', stripe: '#ddd2bd', band: '#4f9a6c', roof: '#b9b2a6', door: '#ddd2bd', text: '#2f6b48', nose: 0, yb: 0, seat: '#7a3328' },
		// SM42 (jak na zdjęciu): kabina i maski zielone, kremowy pas wzdłuż masek i pod oknami kabiny, kremowe szewrony na
		// czołach masek, czarna ostojnica, pomarańczowe czołownice; kabina – osobna bryła (prosta burta do 3,85 m)
		sm42: {
			paint: '#2e8a6a', stripe: '#e6d19a', band: '#2e8a6a', roof: '#2e8a6a', door: '#2e8a6a', head: '#d9822b', nose: 0.05, yb: 4.1, round: 0.04, sideTop: 4.0, sideYs: [2.45, 2.62, 3.3, 4.0], seat: '#444',
			/* czoło kabiny (jak na zdjęciach SM42): dwie wysokie szyby nad maską (3,3–4,0 m) z zaokrąglonymi narożnikami,
			   wąski słupek pośrodku, kremowy pas na wysokości pasa masek */
			face: (x, y) => {
				if (y > 4.1) return 3;
				const ax = Math.abs(x), r = 0.11, x0 = 0.12, x1 = 1.2, y0 = 3.3, y1 = 4.0;
				if (ax > x0 && ax < x1 && y > y0 && y < y1) {
					const cx2 = Math.min(Math.max(ax, x0 + r), x1 - r), cy2 = Math.min(Math.max(y, y0 + r), y1 - r);
					if (Math.hypot(ax - cx2, y - cy2) <= r) return 4;
				}
				return y >= 2.45 && y < 2.62 ? 1 : 0;
			},
		},
		// Bdhpumn (jak na zdjęciu): niebieski, żółty pas między pokładami (i na końcach – w pasie okien), jasnoszary dach
		// burta prosta tylko do górnej krawędzi żółtego pasa (2,95 m) – wyżej łuk dachu, górne okna na zaokrągleniu
		dd: { paint: '#2f6fb2', stripe: '#f2c418', band: '#f2c418', roof: '#c3c8cd', door: '#2f6fb2', nose: 0, yb: 0, sideTop: 2.95, sideYs: [1.5, 2.15, 2.2, 2.3, 2.9], roofYs: [3.2, 3.62, 4.12], roofShape: [0.9, 0.75], seat: '#3a4a6a' },
		/* Serie z katalogu taboru (routes.js STOCK) – bryła bazowa (base) z parametrami: wózki (bogieOff – oś wózka od
		   końca, wb – rozstaw osi, wR – promień koła, axles – 3 dla Co'Co'), boki (side: 'eu07' – okienka na przemian
		   z kratkami, 'grilles' – kratki z żaluzjami pionowymi, 'ports' – okienka co trzecie pole; panels – liczba pól),
		   belt – pas na burcie [od, do] w kolorze stripe, splitY – granica dołu (band) i góry (paint), diesel – dach
		   z wentylatorami (bez pantografów), single – pantografy jednoramienne, prefix – seria na numerach.
		   Kolory domyślne – malowanie podstawowe; warianty nadpisują je z katalogu (przybliżone wg zdjęć). */
		// EP09: pomarańczowo-brązowa z kremowym pasem pod oknami kabin, czoło mocniej pochylone, kratki na całym boku
		ep09: { base: 'loco', paint: '#b5502a', stripe: '#e8d27a', band: '#b5502a', roof: '#8c8f91', door: '#b5502a', head: '#1d1d1d', frame: '#b5502a', panto: '#8c8f91', splitY: 2.0, belt: [2.1, 2.27], panes: 2, nose: 1.15, yb: 2.45, round: 0.3, split: true, side: 'grilles', panels: 5, prefix: 'EP09', bogieOff: 4.0, wb: 3.0, wR: 0.6, pantoZ: 0.25, single: true, headX: 1.08, headY: 1.5, noDoorWin: true, seat: '#444' },
		// ET22 („Byk”): długa, sześcioosiowa; PKP Cargo – jasnoszara z granatowym dołem i czerwonym paskiem
		et22: { base: 'loco', paint: '#c9cccb', stripe: '#c8102e', band: '#1f3a70', roof: '#80878c', door: '#c9cccb', head: '#f2c200', frame: '#c9cccb', panto: '#8c8f91', splitY: 1.62, belt: [1.62, 1.74], panes: 2, nose: 0.85, yb: 2.5, round: 0.22, split: true, side: 'et22', panels: 9, numZ: -1.6, numY: 2.95, cabPanes: [[0.12, 0.62], [0.82, 1.38]], prefix: 'ET22', bogieOff: 4.3, wb: 3.4, wR: 0.6, axles: 3, pantoZ: 0.3, seat: '#444',
			roofLamp: true, twinLamp: true, headY: 1.72, headR: 0.17, plateY: 1.72, plough: 'pair' },
		// ST44 („Gagarin”): zielona z żółtym pasem, zaokrąglone czoło, wentylatory na dachu, wózki trzyosiowe
		st44: { base: 'loco', paint: '#3b6b40', stripe: '#e8c860', band: '#3b6b40', roof: '#6d7175', door: '#3b6b40', head: '#a52019', frame: '#3b6b40', splitY: 2.0, belt: [2.05, 2.2], panes: 2, nose: 1.3, yb: 2.45, round: 0.6, split: true, side: 'ports', panels: 8, prefix: 'ST44', bogieOff: 4.2, wb: 3.6, wR: 0.55, axles: 3, diesel: true, bigLamp: true, glassT: 0.8, roofShape: [0.85, 0.7], seat: '#444' },
		// SU46: czerwono-brązowa z kremowym pasem na wysokości okien kabin, kanciasta, żaluzje pionowe
		su46: { base: 'loco', paint: '#8e3a2c', stripe: '#e8d9a8', band: '#8e3a2c', roof: '#5a5d60', door: '#8e3a2c', head: '#a52019', frame: '#8e3a2c', splitY: 2.0, belt: [2.12, 2.3], panes: 2, nose: 0.7, yb: 2.5, round: 0.25, split: true, side: 'grilles', panels: 6, prefix: 'SU46', bogieOff: 4.4, wb: 3.5, wR: 0.55, axles: 3, diesel: true, seat: '#444' },
		// 120A: bezprzedziałowy – jak 111A, więcej węższych okien
		c120: { base: 'coach', paint: '#4f9a6c', stripe: '#ddd2bd', band: '#4f9a6c', roof: '#b9b2a6', door: '#ddd2bd', text: '#2f6b48', nose: 0, yb: 0, seat: '#7a3328', comp: 12, winW: 1.1 },
		// wagony typu Z1 (26,4 m): A9 – 1. klasa, 9 przedziałów; B10 – 2. klasa, 10 przedziałów; PKP Intercity – białe,
		// granatowy dół do 1/3 wysokości, szary pas okien
		a9: { base: 'coach', paint: '#f0f0ee', stripe: '#5a5e63', band: '#1c2f5e', roof: '#8c8f91', door: '#f0f0ee', text: '#1c2f5e', nose: 0, yb: 0, seat: '#7a3328', comp: 9, winW: 1.35, cls: 1, zones: [[0, 1.75, 2], [2.2, 3.35, 1]], fixedWin: true, ac: true, bogieOff: 3.7, wb: 2.56 },
		b10: { base: 'coach', paint: '#f0f0ee', stripe: '#5a5e63', band: '#1c2f5e', roof: '#8c8f91', door: '#f0f0ee', text: '#1c2f5e', nose: 0, yb: 0, seat: '#7a3328', comp: 10, winW: 1.25, zones: [[0, 1.75, 2], [2.2, 3.35, 1]], fixedWin: true, ac: true, bogieOff: 3.7, wb: 2.56 },
	};
	// EN71 – jak EN57 (cztery wagony); ED72 – czerwono-kremowy, czoło z dwiema dużymi szybami, sprzęg Scharfenberga
	STYLES.en71 = Object.assign({}, STYLES.ezt, { base: 'ezt', prefix: 'EN71' });
	STYLES.ed72 = Object.assign({}, STYLES.ezt, {
		base: 'ezt', prefix: 'ED72', paint: '#a8262b', stripe: '#e9c46a', band: '#e9c46a', door: '#e9c46a', central: false, scharfenberg: true,
		face: (x, y) => {
			const ax = Math.abs(x);
			if (y > 3.45) return 3;
			if (y < 2.15) return 0;
			return y > 2.3 && y < 3.3 && ax > 0.07 && ax < 1.2 ? 4 : 1;
		},
	});
	/* Nowoczesne EZT (bryła ezt z parametrami): modern – czoło opływowe (skos z dużą szybą, bez płaskiej ściany),
	   bez przetłoczeń, okna stałe, klimatyzatory zamiast grzybków, sprzęg Scharfenberga, pantografy jednoramienne;
	   zones – pasy malowania [od, do, grupa] (0 paint, 1 stripe, 2 band, 7 trim); doors(len, noseF, noseR) – położenia
	   drzwi, doorW / doorLeaves – szerokość i liczba skrzydeł; winW / pitch – okna; seats4 – fotele 2+2;
	   wózki Jakobsa – z katalogu (spec.art). Malowanie domyślne: Elf – Koleje Śląskie, ED250 – PKP Intercity. */
	const MODERN = {
		base: 'ezt', modern: true, vfront: false, split: false, face: undefined, central: false, scharfenberg: true, single: true, ac: true, roofLamp: false, headR: undefined,
		fixedWin: true, seats4: true, panes: 1, endGroup: 1, wR: 0.42, wb: 2.6, bogieOff: 2.9, pantoZ: 0.22, headX: 0.8, headY: 1.92, tailY: 1.64, apron: '#24292e',
	};
	// Pesa Elf: krótkie, mocno pochylone czoło z dużą szybą, szerokie drzwi dwuskrzydłowe (jedne na człon), duże okna
	STYLES.elf = Object.assign({}, STYLES.ezt, MODERN, {
		prefix: 'EN76', paint: '#ffcc00', stripe: '#24292e', band: '#f2f2f2', trim: '#e30613', roof: '#a7acb1', door: '#ffcc00', seat: '#3a4a6a',
		nose: 2.3, yb: 2.08, round: 0.5, glassT: 0.28,
		zones: [[0, 1.75, 0], [1.75, 1.86, 7], [1.86, 2.2, 2], [2.2, 3.38, 1], [3.38, 9, 2]],
		doorW: 1.4, doorLeaves: 2, winW: 1.55, pitch: 1.95,
		doors: (len, noseF, noseR) => [noseF && !noseR ? -len * 0.06 : noseR && !noseF ? len * 0.06 : 0],
	});
	// Elf 2: dłuższe, łagodniej zaokrąglone czoło
	STYLES.elf2 = Object.assign({}, STYLES.elf, { prefix: '48WE', nose: 2.7, yb: 1.98, round: 0.68, glassT: 0.24 });
	// ED250 (Pendolino): długie, smukłe czoło, drzwi jednoskrzydłowe przy końcach wagonów, zwykłe wózki pod każdym wagonem
	STYLES.ed250 = Object.assign({}, STYLES.ezt, MODERN, {
		prefix: 'ED250', paint: '#3b4046', stripe: '#2a2e33', band: '#eceeef', trim: '#3b4046', roof: '#c9cdd1', door: '#eceeef', seat: '#33415e',
		nose: 4.0, yb: 1.95, round: 0.8, glassT: 0.42, wR: 0.45, wb: 2.7, bogieOff: 3.4, pantoZ: 0.25, headX: 0.72, headY: 1.75, tailY: 1.5,
		zones: [[0, 1.75, 0], [1.75, 1.83, 7], [1.83, 2.2, 2], [2.2, 3.38, 1], [3.38, 9, 2]],
		doorW: 0.95, doorLeaves: 1, winW: 1.3, pitch: 1.6,
		doors: (len, noseF, noseR) => [noseF ? null : -(len / 2 - 1.6), noseR ? null : len / 2 - 1.6].filter((z) => z !== null),
	});
	// lokomotywa składów towarowych mijanych i na bocznicach – ET22 (zamiast ogólnej bryły)
	STYLES.cargo = STYLES.et22;

	/* Wagony towarowe – prawdziwe typy (długość ze zderzakami, kolory wg zdjęć PKP Cargo i przewoźników):
	   Eaos – węglarka, Falns – samowyładowcza do węgla (typowa na Śląsku), Zacns – cysterna, Sgns – platforma
	   kontenerowa, Habbiins – kryty z przesuwnymi ścianami. */
	const FREIGHT_TYPES = [
		{ id: 'Eaos', len: 14.04, colors: ['#2e5378', '#2a4a6e', '#5b3a2c', '#6b4031', '#5e6266'] },
		{ id: 'Falns', len: 15.74, colors: ['#5b3a2c', '#6e4532', '#2e5378', '#45484b'] },
		{ id: 'Zacns', len: 16.2, colors: ['#222324', '#2f3134', '#6c6f72', '#b5b8ba'] },
		{ id: 'Sgns', len: 19.64, colors: ['#2e5378', '#3c3f42', '#7a2e22'] },
		{ id: 'Habbiins', len: 23.0, colors: ['#aeb3b7', '#a2a8ad'], frame: '#2e5378' },
	];
	// kontenery: Maersk, MSC, Hapag-Lloyd, CMA CGM, Evergreen, ONE, szare, rdzawe, białe
	const CONTAINER_COLORS = ['#42a5d5', '#d9a33a', '#e05a1c', '#1c4c8c', '#2f6b3f', '#c4157a', '#9aa0a5', '#8b2a22', '#e2e0d8'];
	const darker = (hex, f) => { const c = new T.Color(hex).multiplyScalar(f); return '#' + c.getHexString(); };
	/* Części wagonu towarowego typu ti (indeks FREIGHT_TYPES) jako lista prostych brył: [bryła (GEO), materiał, x, y, z,
	   sx, sy, sz, kolor, obrót] – obrót 'x' (walec wzdłuż wagonu), 'z' (walec w poprzek), liczba (pochylenie wokół x),
	   [rx, ry, rz] – dowolny (kąty Eulera).
	   Materiały: body (kolor), dark (ostojnica), steel, coal, wheel, roof. bogies – z prostymi wózkami (bocznice). */
	function freightParts(ti, len, seed, color, bogies) {
		const P = [], hl = len / 2, c = color, h = (k) => hash(seed * 7.13 + k * 3.7);
		const add = (...a) => P.push(a);
		// ostojnica, czołownice, zderzaki
		add('box', 'dark', 0, 1.12, 0, 2.6, 0.28, len - 0.7);
		for (const e of [-1, 1]) {
			add('box', 'dark', 0, 1.12, e * (hl - 0.35), 2.9, 0.3, 0.12);
			for (const x of [-0.88, 0.88]) {
				add('cyl', 'steel', x, 1.06, e * (hl - 0.12), 0.32, 0.3, 0.32, null, 'x');
				add('cyl', 'steel', x, 1.06, e * (hl + 0.04), 0.44, 0.05, 0.44, null, 'x');
			}
		}
		if (bogies) for (const e of [-1, 1]) {
			const bz = e * (hl - 2.6);
			for (const x of [-1, 1]) {
				add('box', 'dark', x * 1.0, 0.62, bz, 0.14, 0.42, 2.3);
				add('cyl', 'steel', x * 1.0, 0.86, bz, 0.26, 0.22, 0.26);
				for (const dz of [-0.9, 0.9]) {
					add('cyl', 'wheel', x * 0.75, 0.46, bz + dz, 0.92, 0.13, 0.92, null, 'z');
					add('box', 'dark', x * 1.08, 0.46, bz + dz, 0.2, 0.24, 0.28);
				}
			}
			add('box', 'dark', 0, 0.78, bz, 1.9, 0.22, 0.4);
		}
		const id = FREIGHT_TYPES[ti].id;
		if (id === 'Eaos') {
			const cd = darker(c, 0.82);
			add('box', 'dark', 0, 1.3, 0, 2.8, 0.1, len - 0.5);
			for (const x of [-1.42, 1.42]) add('box', 'body', x, 2.33, 0, 0.06, 2.06, len - 0.5, c);
			for (const e of [-1, 1]) add('box', 'body', 0, 2.33, e * (hl - 0.28), 2.9, 2.06, 0.06, c);
			const doors = [-len * 0.24, len * 0.24];
			for (const x of [-1, 1]) {
				// słupki (poza drzwiami), pas górny i dolny
				for (let k = 0; k <= 8; k++) {
					const z = -(hl - 0.6) + (k * (len - 1.2)) / 8;
					if (doors.some((d) => Math.abs(z - d) < 1.0)) continue;
					add('box', 'body', x * 1.47, 2.33, z, 0.08, 2.06, 0.12, cd);
				}
				add('box', 'body', x * 1.46, 3.34, 0, 0.12, 0.1, len - 0.4, cd);
				add('box', 'dark', x * 1.46, 1.32, 0, 0.1, 0.1, len - 0.4);
				/* drzwi dwuskrzydłowe (wg zdjęć Eaos PKP Cargo): skrzydła z blachy wystające z burty, szczeliny, drążki
				   zamknięć z uchwytami, zawiasy */
				for (const dz of doors) {
					for (const o of [-0.45, 0.45]) add('box', 'body', x * 1.475, 2.28, dz + o, 0.05, 1.86, 0.86, cd);
					for (const o of [-0.9, 0, 0.9]) add('box', 'dark', x * 1.5, 2.28, dz + o, 0.03, 1.86, 0.04);
					for (const o of [-0.16, 0.16]) { add('box', 'steel', x * 1.52, 2.28, dz + o, 0.04, 2.0, 0.045); add('box', 'steel', x * 1.55, 1.55, dz + o, 0.06, 0.05, 0.16); }
					for (const y of [1.55, 2.28, 3.0]) for (const o of [-0.86, 0.86]) add('box', 'dark', x * 1.51, y, dz + o, 0.05, 0.09, 0.16);
				}
				// tablice: dane UIC (lewy dół) i oznaczenie przewoźnika
				add('box', 'body', x * 1.5, 1.72, -x * (hl - 1.5), 0.02, 0.42, 0.95, '#d9d9d3');
				add('box', 'body', x * 1.5, 2.95, x * (hl - 1.25), 0.02, 0.32, 0.6, '#d9d9d3');
			}
			if (h(1) < 0.7) { add('box', 'coal', 0, 3.0, 0, 2.75, 0.5, len - 0.8); add('box', 'coal', 0, 3.3, 0, 2.1, 0.3, len - 2.4); }
		} else if (id === 'Falns') {
			const cd = darker(c, 0.82);
			/* burty (wg zdjęć Falns): nad wózkami od ramy do górnej krawędzi (1,55–3,85 m), pośrodku wyżej – pod nią skośne
			   ściany lejów zbiegające się ku zsypom; ściany czołowe */
			const mid = len * 0.42, Le = hl - 0.3 - mid / 2;
			for (const x of [-1, 1]) {
				for (const e of [-1, 1]) add('box', 'body', x * 1.45, 2.7, e * (mid / 2 + Le / 2), 0.06, 2.3, Le, c);
				add('box', 'body', x * 1.45, 3.08, 0, 0.06, 1.55, mid, c);
				add('box', 'body', x * 1.27, 1.97, 0, 0.06, 0.84, mid + 0.1, c, [0, 0, -x * 0.46]);
				for (const e of [-1, 1]) add('box', 'body', x * 1.36, 1.42, e * (mid / 2 + Le / 2), 0.06, 0.3, Le - 0.7, cd); // fartuchy nad wózkami
				// tablica danych UIC
				add('box', 'body', x * 1.53, 1.9, -x * (hl - 1.4), 0.02, 0.42, 0.95, '#d9d9d3');
			}
			// zsypy pośrodku: lej (spód ścian skośnych) i klapy
			for (const e of [-1, 1]) { add('box', 'dark', 0, 1.5, e * mid * 0.22, 1.4, 0.5, mid * 0.36); add('box', 'steel', 0, 1.22, e * mid * 0.22, 1.1, 0.06, mid * 0.3); }
			for (const e of [-1, 1]) {
				add('box', 'body', 0, 2.7, e * (hl - 0.32), 2.95, 2.3, 0.06, c);
				// skośne dna lejów – wewnątrz pudła (węższe od niego)
				add('box', 'body', 0, 2.2, e * len * 0.24, 2.7, 0.06, 2.6, cd, e * 0.6);
				// zsypy z klapami pod lejami
				add('box', 'dark', 0, 1.2, e * 1.5, 2.3, 0.32, 1.0);
				for (const x of [-0.6, 0.6]) add('box', 'steel', x, 1.02, e * 1.5, 0.5, 0.05, 0.9);
				// drabinka i pomost hamulcowy przy czole
				for (let k = 0; k < 6; k++) add('box', 'steel', 1.2, 1.7 + k * 0.36, e * (hl - 0.27), 0.5, 0.04, 0.04);
				for (const x of [0.96, 1.44]) add('box', 'steel', x, 2.6, e * (hl - 0.27), 0.04, 2.0, 0.04);
			}
			for (const x of [-1, 1]) {
				for (let k = 0; k <= 10; k++) {
					const z = -(hl - 0.5) + (k * (len - 1.0)) / 10, inMid = Math.abs(z) < mid / 2 - 0.05;
					add('box', 'body', x * 1.5, inMid ? 3.08 : 2.7, z, 0.08, inMid ? 1.55 : 2.3, 0.1, cd);
				}
				add('box', 'body', x * 1.49, 3.88, 0, 0.12, 0.1, len - 0.5, cd);
				for (const e of [-1, 1]) add('box', 'body', x * 1.49, 1.57, e * (mid / 2 + Le / 2), 0.1, 0.08, Le, cd);
				add('box', 'body', x * 1.49, 2.3, 0, 0.1, 0.08, mid, cd);
			}
			if (h(2) < 0.75) { add('box', 'coal', 0, 3.75, 0, 2.8, 0.25, len - 0.9); add('box', 'coal', 0, 4.0, 0, 2.2, 0.3, len - 2.6); }
		} else if (id === 'Zacns') {
			add('cylHi', 'body', 0, 2.7, 0, 2.9, len - 2.0, 2.9, c, 'x');
			for (const e of [-1, 1]) add('sphereHi', 'body', 0, 2.7, e * (hl - 1.0), 2.9, 2.9, 1.1, c);
			for (const z of [-len * 0.3, 0, len * 0.3]) add('cyl', 'dark', 0, 2.7, z, 2.96, 0.07, 2.96, null, 'x');
			add('cyl', 'body', 0, 4.2, 0, 0.9, 0.35, 0.9, c);
			add('cyl', 'steel', 0, 4.4, 0, 0.6, 0.08, 0.6);
			add('box', 'steel', 0, 4.18, 0, 1.0, 0.05, 2.6);
			for (const x of [-0.5, 0.5]) { add('box', 'steel', x, 4.65, 0, 0.04, 0.04, 2.6); for (const z of [-1.2, 0, 1.2]) add('box', 'steel', x, 4.42, z, 0.04, 0.48, 0.04); }
			for (const x of [-1.5, 1.5]) { add('box', 'steel', x, 2.6, 0, 0.05, 2.3, 0.04); add('box', 'steel', x, 2.6, 0.4, 0.05, 2.3, 0.04); for (let y = 1.6; y < 3.7; y += 0.35) add('box', 'steel', x, y, 0.2, 0.04, 0.03, 0.4); }
			for (const e of [-1, 1]) add('box', 'dark', 0, 1.5, e * len * 0.3, 2.4, 0.5, 0.6);
			/* (wg zdjęć Zacns): kołyski pod zbiornikiem z obejmami, zawór spustowy pośrodku, pomosty na końcach
			   z barierkami, tablica danych na zbiorniku */
			for (const e of [-1, 1]) {
				const z = e * len * 0.3;
				for (const x of [-1, 1]) add('box', 'dark', x * 1.0, 1.72, z, 0.12, 0.55, 0.6, null, [0, 0, x * 0.5]);
				add('cyl', 'dark', 0, 2.7, z, 2.98, 0.12, 2.98, null, 'x');
				// pomost: krata, słupki i poręcze
				const zp = e * (hl - 0.95);
				add('box', 'steel', 0, 1.32, zp, 2.7, 0.05, 1.1);
				for (const x of [-1.3, 1.3]) {
					for (const dz of [-0.5, 0.5]) add('box', 'steel', x, 1.85, zp + dz, 0.04, 1.0, 0.04);
					add('box', 'steel', x, 2.35, zp, 0.04, 0.04, 1.04);
					add('box', 'steel', x, 1.9, zp, 0.03, 0.03, 1.0);
				}
			}
			add('cyl', 'dark', 0, 1.15, 0, 0.32, 0.45, 0.32);
			add('box', 'steel', 0, 1.0, 0, 0.9, 0.1, 0.16);
			for (const x of [-1.445, 1.445]) add('box', 'body', x, 2.5, -Math.sign(x) * (hl - 3.6), 0.02, 0.5, 1.2, '#d9d9d3');
			// tablica ostrzegawcza (pomarańczowa) na burtach
			for (const x of [-1.47, 1.47]) add('box', 'body', x, 1.75, hl - 1.9, 0.02, 0.3, 0.4, '#e37b1c');
		} else if (id === 'Sgns') {
			const cd = darker(c, 0.85);
			for (const x of [-1.2, 1.2]) add('box', 'body', x, 1.2, 0, 0.22, 0.5, len - 0.5, c);
			for (let z = -(hl - 0.8); z <= hl - 0.8; z += 1.6) add('box', 'dark', 0, 1.32, z, 2.5, 0.1, 0.15);
			add('box', 'body', 0, 1.45, 0, 2.5, 0.04, len - 0.6, cd);
			// kontenery: 40' + 20', 3 × 20', sam 40' albo pusta platforma
			const r = h(3), slots = r < 0.45 ? [[-3.0, 12.19], [6.35, 6.06]] : r < 0.75 ? [[-6.3, 6.06], [0, 6.06], [6.3, 6.06]] : r < 0.93 ? [[0, 12.19]] : [];
			slots.forEach(([z, l], k) => {
				const cc = CONTAINER_COLORS[Math.floor(h(10 + k) * CONTAINER_COLORS.length)], ccd = darker(cc, 0.8);
				add('box', 'body', 0, 2.77, z, 2.44, 2.59, l, cc);
				for (let zz = -l / 2 + 0.35; zz < l / 2 - 0.2; zz += 0.5) for (const x of [-1.235, 1.235]) add('box', 'body', x, 2.77, z + zz, 0.03, 2.4, 0.14, ccd);
				for (const x of [-1.22, 1.22]) for (const y of [1.53, 4.0]) add('box', 'dark', x, y, z, 0.07, 0.1, l);
				for (const x of [-0.75, -0.25, 0.25, 0.75]) add('box', 'steel', x, 2.77, z + l / 2 + 0.02, 0.04, 2.4, 0.04);
				// naroża (odlewy z otworami) i tabliczka CSC
				for (const x of [-1.16, 1.16]) for (const y of [1.56, 3.98]) for (const e of [-1, 1]) add('box', 'dark', x, y, z + e * (l / 2 - 0.09), 0.18, 0.13, 0.18);
				for (const x of [-1.23, 1.23]) add('box', 'body', x, 3.55, z - l / 2 + 0.8, 0.02, 0.3, 0.5, '#d9d9d3');
			});
		} else {
			const fr = FREIGHT_TYPES[ti].frame, cd = darker(c, 0.85);
			add('box', 'body', 0, 2.65, 0, 2.9, 2.7, len - 0.6, c);
			for (const x of [-1, 1]) {
				for (let z = -(hl - 0.6); z <= hl - 0.6; z += 0.7) add('box', 'body', x * 1.47, 2.65, z, 0.05, 2.6, 0.08, cd);
				for (const y of [1.33, 3.98]) add('box', 'body', x * 1.47, y, 0, 0.08, 0.12, len - 0.6, fr);
				for (const z of [-hl / 2, 0, hl / 2]) add('box', 'dark', x * 1.48, 2.65, z, 0.04, 2.6, 0.06);
				// uchwyty i zamki ścian przesuwnych, tablica danych
				for (const z of [-hl * 0.75, -hl * 0.25, hl * 0.25, hl * 0.75]) { add('box', 'steel', x * 1.5, 1.75, z, 0.05, 0.5, 0.06); add('box', 'steel', x * 1.5, 1.5, z, 0.06, 0.06, 0.25); }
				add('box', 'body', x * 1.5, 1.85, -x * (hl - 1.3), 0.02, 0.42, 0.95, '#d9d9d3');
			}
			add('cyl', 'roof', 0, 3.95, 0, 2.9, len - 0.6, 0.5, null, 'x');
			for (const e of [-1, 1]) add('box', 'body', 0, 2.65, e * (hl - 0.3), 2.95, 2.7, 0.06, fr);
		}
		return P;
	}
	function freightTrain(seed) {
		// skład całopociągowy (węgiel – Falns albo Eaos, cysterny, kontenery) albo mieszany
		const r = hash(seed * 1.7), n = 10 + Math.floor(hash(seed * 2.3) * 8);
		const pick = r < 0.3 ? [1] : r < 0.45 ? [0] : r < 0.6 ? [2] : r < 0.72 ? [3] : [0, 1, 2, 3, 4, 0, 1];
		const types = [];
		for (let k = 0; k < n; k++) types.push(pick[Math.floor(hash(seed * 3.1 + k * 1.37) * pick.length)]);
		// lokomotywa: ET22 w losowym malowaniu z katalogu taboru
		const L = R && R.STOCK && R.STOCK.ET22, lv = L ? L.variants[Math.floor(hash(seed * 5.9) * L.variants.length)] : null;
		const specs = [{ id: 'ET22', model: 'et22', v: lv && lv.id, c: (lv && lv.c) || null, num: lv && lv.num, H: 4.1 }].concat(types.map((t) => ({ model: 'freight', ft: t, H: 4.1 })));
		return { style: 'freight', cars: [19.24].concat(types.map((t) => FREIGHT_TYPES[t].len)), types: [-1].concat(types), specs, gap: 1, height: 4.1, electric: true, pantograph: 0, seed };
	}

	// Składy, które jeżdżą obok (pociągi z przeciwka, wagony na bocznicach) – tylko wygląd.
	const OTHER_TRAINS = {
		freight: freightTrain(1),
		wagons: { style: 'wagons', cars: [14.04, 15.74, 14.04, 19.64], types: [0, 1, 0, 3], gap: 1, height: 4.0, electric: false },
	};
	const BOTTOM = 1.05;
	const WIDTH = 2.9;
	const HALF = WIDTH / 2;
	const WHEEL_R = 0.46;
	const WIRE = 5.6;
	const NOSE_STEPS = 12;

	/* Koło z profilem (bryła obrotowa wokół y): piasta, tarcza, obręcz z powierzchnią toczną i obrzeżem po stronie +y.
	   Promień w jednostkach (skala x, z = promień koła w m), szerokość w metrach. */
	const WHEEL_GEO = (() => {
		const pr = [[0, -0.07], [0.22, -0.07], [0.26, -0.1], [0.32, -0.1], [0.36, -0.05], [0.84, -0.035], [0.88, -0.07], [1, -0.07], [1, 0.045], [1.075, 0.065], [1.075, 0.085], [1.02, 0.095], [0.88, 0.07], [0.84, 0.035], [0.36, 0.05], [0.32, 0.1], [0.26, 0.1], [0.22, 0.07], [0, 0.07]];
		const g = new T.LatheGeometry(pr.map(([r, y]) => new T.Vector2(r, y)), 24);
		g.userData.shared = true;
		return g;
	})();
	// powierzchnia toczna koła: otwarty walec (sam pierścień)
	const TREAD_GEO = new T.CylinderGeometry(0.5, 0.5, 1, 24, 1, true);
	TREAD_GEO.userData.shared = true;
	// sprężyna śrubowa: wysokość 1, średnica 1 (skalowana), 5 zwojów
	const SPRING_GEO = (() => {
		class Helix extends T.Curve {
			getPoint(t, out = new T.Vector3()) { const a = t * Math.PI * 2 * 5; return out.set(0.42 * Math.cos(a), t - 0.5, 0.42 * Math.sin(a)); }
		}
		const g = new T.TubeGeometry(new Helix(), 60, 0.08, 5, false);
		g.userData.shared = true;
		return g;
	})();
	// rama boczna wózka (sylwetka w płaszczyźnie z–y, wytłoczona w x): nad maźnicami wyżej, pośrodku obniżona
	const frameGeos = new Map();
	function bogieFrameGeo(wb, R, kind) {
		const key = `${wb}|${R}|${kind}`;
		if (frameGeos.has(key)) return frameGeos.get(key);
		const h = wb / 2, sh = new T.Shape();
		const yTop = R + 0.32, yMid = R + 0.12, yBot = R - 0.05, ext = h + 0.55;
		// górny pas: końce, wzniesienie nad maźnicami, obniżenie pośrodku (belka „rybi brzuch” w wagonach)
		sh.moveTo(-ext, yTop - 0.1);
		sh.lineTo(-h - 0.25, yTop);
		sh.lineTo(-h + 0.35, yTop);
		sh.lineTo(-h + 0.75, yMid + 0.2);
		sh.lineTo(h - 0.75, yMid + 0.2);
		sh.lineTo(h - 0.35, yTop);
		sh.lineTo(h + 0.25, yTop);
		sh.lineTo(ext, yTop - 0.1);
		sh.lineTo(ext, yTop - 0.3);
		sh.lineTo(h + 0.35, yTop - 0.3);
		// wycięcie nad maźnicą (prowadnice)
		sh.lineTo(h + 0.25, R + 0.12);
		sh.lineTo(h - 0.25, R + 0.12);
		sh.lineTo(h - 0.35, yTop - 0.3);
		sh.lineTo(h - 0.8, kind === 'coach' ? yBot - 0.12 : yBot);
		sh.lineTo(-h + 0.8, kind === 'coach' ? yBot - 0.12 : yBot);
		sh.lineTo(-h + 0.35, yTop - 0.3);
		sh.lineTo(-h + 0.25, R + 0.12);
		sh.lineTo(-h - 0.25, R + 0.12);
		sh.lineTo(-h - 0.35, yTop - 0.3);
		sh.lineTo(-ext, yTop - 0.3);
		sh.closePath();
		const g = new T.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
		g.translate(0, 0, -0.07);
		g.rotateY(Math.PI / 2); // sylwetka w (z, y): oś x kształtu → z wagonu
		g.userData.shared = true;
		frameGeos.set(key, g);
		return g;
	}

	/* Bryła do promieni wycieraczek (addWiper): z całego pudła (kilkanaście tysięcy trójkątów, ok. 250 promieni na
	   wycieraczkę – ponad 1 s na skład) tylko trójkąty, które promień z przodu może trafić: do WIPER_ZONE m od czoła
	   i z rzutem (x, y) w pobliżu szyb czołowych (materiał 4) tego czoła. Promienie (wzdłuż z) biegną tylko po szybie
	   i tuż za jej krawędzią, więc wynik jest ten sam co na całym pudle. Współrzędne – świata (jak promienie). */
	const WIPER_ZONE = 8, WIPER_MARGIN = 0.6, WIPER_CELL = 0.15;
	const wiperProxies = new WeakMap();
	function wiperProxy(body, sgn, hl) {
		let per = wiperProxies.get(body);
		if (!per) wiperProxies.set(body, (per = {}));
		const key = sgn + ':' + hl.toFixed(3);
		if (key in per) return per[key];
		const g = body.geometry, pos = g.attributes.position, idx = g.index;
		const groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
		const m = body.matrixWorld, a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
		const vid = (k) => (idx ? idx.getX(k) : k);
		const tris = []; // [materialIndex, 9 współrzędnych]
		for (const gr of groups) {
			const end = Math.min(gr.start + gr.count, idx ? idx.count : pos.count);
			for (let k = gr.start; k + 2 < end; k += 3) {
				a.fromBufferAttribute(pos, vid(k)).applyMatrix4(m);
				b.fromBufferAttribute(pos, vid(k + 1)).applyMatrix4(m);
				c.fromBufferAttribute(pos, vid(k + 2)).applyMatrix4(m);
				if (Math.max(sgn * a.z, sgn * b.z, sgn * c.z) < hl - WIPER_ZONE) continue;
				tris.push([gr.materialIndex, a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z]);
			}
		}
		// obszar szyb czołowych w rzucie (x, y) z zapasem
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
		for (const t of tris) {
			if (t[0] !== 4) continue;
			x0 = Math.min(x0, t[1], t[4], t[7]); x1 = Math.max(x1, t[1], t[4], t[7]);
			y0 = Math.min(y0, t[2], t[5], t[8]); y1 = Math.max(y1, t[2], t[5], t[8]);
		}
		if (x0 > x1) return (per[key] = null); // bez szyby czołowej – brak wycieraczek
		x0 -= WIPER_MARGIN; x1 += WIPER_MARGIN; y0 -= WIPER_MARGIN; y1 += WIPER_MARGIN;
		/* siatka w rzucie (x, y), oczka WIPER_CELL m: trójkąt w każdym oczku, na które zachodzi jego prostokąt otaczający;
		   promień (x, y) sprawdza tylko trójkąty swojego oczka – siatka (Mesh) oczka budowana przy pierwszym promieniu */
		const cellOf = (v, v0) => Math.floor((v - v0) / WIPER_CELL);
		const nx = cellOf(x1, x0) + 1, ny = cellOf(y1, y0) + 1;
		const cells = new Map();
		tris.forEach((t, i) => {
			const tx0 = Math.min(t[1], t[4], t[7]), tx1 = Math.max(t[1], t[4], t[7]), ty0 = Math.min(t[2], t[5], t[8]), ty1 = Math.max(t[2], t[5], t[8]);
			if (tx1 < x0 || tx0 > x1 || ty1 < y0 || ty0 > y1) return;
			for (let ix = Math.max(0, cellOf(tx0, x0)); ix <= Math.min(nx - 1, cellOf(tx1, x0)); ix++) {
				for (let iy = Math.max(0, cellOf(ty0, y0)); iy <= Math.min(ny - 1, cellOf(ty1, y0)); iy++) {
					const k = ix * ny + iy;
					if (!cells.has(k)) cells.set(k, []);
					cells.get(k).push(i);
				}
			}
		});
		const meshes = new Map();
		const at = (x, y) => {
			const ix = cellOf(x, x0), iy = cellOf(y, y0);
			if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return null; // poza szybami – tam promienie nie biegną
			const k = ix * ny + iy;
			if (meshes.has(k)) return meshes.get(k);
			const list = (cells.get(k) || []).map((i) => tris[i]).sort((p, q) => p[0] - q[0]);
			let msh = null;
			if (list.length) {
				const arr = new Float32Array(list.length * 9), pg = new T.BufferGeometry();
				list.forEach((t, i) => { arr.set(t.slice(1), i * 9); if (!i || t[0] !== list[i - 1][0]) pg.addGroup(i * 3, 0, t[0]); pg.groups[pg.groups.length - 1].count += 3; });
				pg.setAttribute('position', new T.BufferAttribute(arr, 3));
				pg.computeBoundingSphere();
				msh = new T.Mesh(pg, body.material); // te same materiały (strona ścian, numery materiałów)
			}
			meshes.set(k, msh);
			return msh;
		};
		return (per[key] = { at });
	}

	/* Scalanie nieruchomych części wagonu (bezpośrednie dzieci grupy, jeden materiał bez tekstury) w jedną siatkę na
	   materiał – mniej wywołań rysowania, więc można dodać więcej detali. Pomijane: bryła pudła, zestawy kołowe,
	   skrzydła drzwi, światła, sprite'y. */
	function mergeStatic(group, keep) {
		const buckets = new Map();
		const list = group.children.slice();
		for (const o of list) {
			if (!o.isMesh || o.isInstancedMesh || keep.has(o) || Array.isArray(o.material) || o.material.map || !o.geometry.attributes.normal) continue;
			const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.userData.fine ? 'f' : '');
			if (!buckets.has(key)) buckets.set(key, { mat: o.material, shadow: o.castShadow, fine: !!o.userData.fine, items: [] });
			buckets.get(key).items.push(o);
		}
		for (const b of buckets.values()) {
			if (b.items.length < 2) continue;
			let n = 0;
			const geos = b.items.map((o) => {
				o.updateMatrix();
				const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
				g.applyMatrix4(o.matrix);
				// odbicie lustrzane (ujemna skala) – odwrócenie kolejności wierzchołków
				if (o.matrix.determinant() < 0) {
					const pa = g.attributes.position.array, na = g.attributes.normal.array;
					for (let i = 0; i < pa.length; i += 9) for (let c = 0; c < 3; c++) { const t1 = pa[i + 3 + c]; pa[i + 3 + c] = pa[i + 6 + c]; pa[i + 6 + c] = t1; const t2 = na[i + 3 + c]; na[i + 3 + c] = na[i + 6 + c]; na[i + 6 + c] = t2; }
				}
				n += g.attributes.position.count;
				return g;
			});
			const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
			let off = 0;
			for (const g of geos) {
				pos.set(g.attributes.position.array, off * 3);
				nor.set(g.attributes.normal.array, off * 3);
				off += g.attributes.position.count;
				g.dispose();
			}
			const mg = new T.BufferGeometry();
			mg.setAttribute('position', new T.BufferAttribute(pos, 3));
			mg.setAttribute('normal', new T.BufferAttribute(nor, 3));
			mg.computeBoundingSphere();
			const m = new T.Mesh(mg, b.mat);
			m.castShadow = b.shadow;
			m.receiveShadow = true;
			m.userData.ownGeometry = true;
			m.userData.fine = b.fine;
			for (const o of b.items) {
				group.remove(o);
				if (o.userData.ownGeometry) o.geometry.dispose();
			}
			group.add(m);
		}
	}

	const ploughGeos = new Map();
	// lakier z bezbarwną powłoką (połysk i odbicia nieba)
	const paints = new Map();
	function paint(color) {
		if (!paints.has(color)) {
			// lakier eksploatowany: powłoka mniej lustrzana niż fabryczna (patyna matowi ją dalej), spoiny i nity
			paints.set(color, patch(new T.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.08, clearcoat: 0.55, clearcoatRoughness: 0.24 }), 'train', { grime: 0.06, panels: true }));
		}
		return paints.get(color);
	}

	// Przekrój pudła (prawa burta od dołu, łuk dachu, lewa burta w dół). Poziomy 1.3 / 1.75 / 2.3 / 3.3 to granice pasów malowania.
	// top – górna krawędź prostej burty (wagon piętrowy wyżej), ys – dodatkowe krawędzie na burcie (granice pasów, okien)
	// roofYs – dodatkowe krawędzie na łuku dachu (np. granice okien górnego pokładu wagonu piętrowego)
	// shape – wykładniki łuku dachu [x, y]: domyślnie stromy przy burtach, większe – łagodniej zaokrąglony (wagon piętrowy)
	function crossSection(H, top = 3.3, ys = [], roofYs = [], shape = [0.55, 0.42]) {
		const [ex, ey] = shape;
		const mid = [...new Set([2.15, 2.3].concat(ys))].filter((y) => y > 1.75 && y < top).sort((a, b) => a - b); // 2.15 – granica pasów tuż pod oknami
		const side = [[1.3, BOTTOM], [1.38, 1.3], [1.44, 1.55], [HALF, 1.75]].concat(mid.map((y) => [HALF, y]), [[HALF, top], [1.43, top + 0.14]]);
		const pts = side.map(([x, y]) => [x, y]);
		const yR = top + 0.2, n = 36; // gęsty łuk – słupki szyb czołowych malowane na bryle (równo z szybą)
		const angs = [];
		for (let j = 1; j < n; j++) angs.push((j / n) * Math.PI);
		// przy osi łuk jest bardzo płaski (x ∝ |cos|^ex) – pierwszy punkt dopiero ok. 0,37 m od środka; dodatkowe
		// punkty, żeby wąska szyba środkowa i jej słupki (|x| ≈ 0,2–0,36) miały krawędzie
		for (const x of [0.08, 0.16, 0.22, 0.25, 0.3, 0.35, 0.39]) {
			const c = Math.pow(x / 1.42, 1 / ex);
			if (c < 1) angs.push(Math.acos(c), Math.PI - Math.acos(c));
		}
		for (const y of roofYs) {
			if (y <= yR || y >= H) continue;
			const a = Math.asin(Math.pow((y - yR) / (H - yR), 1 / ey));
			angs.push(a, Math.PI - a);
		}
		angs.sort((a, b) => a - b);
		for (const a of angs) {
			const c = Math.cos(a);
			pts.push([1.42 * Math.sign(c) * Math.pow(Math.abs(c), ex), yR + (H - yR) * Math.pow(Math.sin(a), ey)]);
		}
		for (let k = side.length - 1; k >= 0; k--) pts.push([-side[k][0], side[k][1]]);
		return pts;
	}

	/* Bryła pudła z przekrojów. frontNose / rearNose – czy na tym końcu jest kabina.
	   Zwraca BufferGeometry z grupami materiałów: 0 lakier, 1 pas, 2 pas okienny, 3 dach, 4 szyba czołowa,
	   5 szyby boczne (przezroczyste – widać wnętrze), 6 otwory drzwiowe (niewidoczne – zasłaniają je skrzydła drzwi). */
	// cuts – dodatkowe przekroje pudła (granice okien bocznych kabin), żeby ściany miały na nich krawędź
	function loftBody(len, H, frontNose, rearNose, st, livery, capGroup, cuts) {
		const prof = crossSection(H, st.sideTop, st.sideYs, st.roofYs, st.roofShape);
		const np = prof.length;
		const hl = len / 2, nl = st.nose;
		const kTop = 1 - 0.28 / Math.max(0.5, H - st.yb);
		const sections = []; // { z, t, dir }: t – postęp wzdłuż czoła (1 = sam przód), dir – w którą stronę cofają się narożniki
		if (rearNose) for (let k = NOSE_STEPS; k >= 1; k--) { const t = k / NOSE_STEPS; sections.push({ z: hl - nl * (1 - t), t: Math.pow(t, 0.9), dir: -1 }); }
		else sections.push({ z: hl, t: 0, dir: 0 }, { z: hl - 0.25, t: 0, dir: 0 });
		const zr = rearNose ? hl - nl : hl - 0.25, zf = frontNose ? -hl + nl : -hl + 0.25;
		const zs = [];
		for (let k = 0; k <= 6; k++) zs.push(zr + ((zf - zr) * k) / 6);
		for (const z of cuts || []) if (z < zr - 0.01 && z > zf + 0.01) zs.push(z);
		zs.sort((a, b) => b - a);
		for (const z of zs) sections.push({ z, t: 0, dir: 0 });
		if (frontNose) for (let k = 1; k <= NOSE_STEPS; k++) { const t = k / NOSE_STEPS; sections.push({ z: -hl + nl * (1 - t), t: Math.pow(t, 0.9), dir: 1 }); }
		else sections.push({ z: -hl, t: 0, dir: 0 });

		const pos = [];
		const orig = []; // wierzchołki przed deformacją czoła – do wyboru malowania
		for (const sc of sections) {
			const t = sc.t;
			const top = 1 - kTop * Math.pow(t, 1.25);
			for (const [x, y] of prof) {
				const xs = x * (1 - 0.1 * t * t);
				const ys = y <= st.yb ? y : st.yb + (y - st.yb) * top;
				const recede = sc.dir * Math.pow(Math.abs(x) / HALF, 2.4) * (st.round ?? 0.85) * Math.pow(t, 1.4);
				pos.push(xs, ys, sc.z + recede);
				orig.push(x, y, t, sc.z);
			}
		}
		const groups = [[], [], [], [], [], [], [], []]; // 7 – cienki pas (trim, nowoczesne EZT)
		const nsec = sections.length;
		for (let i = 0; i < nsec - 1; i++) {
			for (let j = 0; j < np; j++) {
				const j2 = (j + 1) % np;
				const a = i * np + j, b = i * np + j2, c = (i + 1) * np + j, d = (i + 1) * np + j2;
				const xo = (orig[a * 4] + orig[b * 4]) / 2, yo = (orig[a * 4 + 1] + orig[b * 4 + 1]) / 2;
				const to = (orig[a * 4 + 2] + orig[c * 4 + 2]) / 2, zo = (orig[a * 4 + 3] + orig[c * 4 + 3]) / 2;
				const g = j2 === 0 ? 0 : livery(xo, yo, to, zo);
				groups[g].push(a, c, b, b, c, d);
			}
		}
		// zaślepki końców (wachlarz od środka)
		const cap = (i, flip, g) => {
			const base = pos.length / 3;
			let cx = 0, cy = 0, cz = 0;
			for (let j = 0; j < np; j++) { cx += pos[(i * np + j) * 3]; cy += pos[(i * np + j) * 3 + 1]; cz += pos[(i * np + j) * 3 + 2]; }
			pos.push(cx / np, cy / np, cz / np);
			for (let j = 0; j < np; j++) pos.push(pos[(i * np + j) * 3], pos[(i * np + j) * 3 + 1], pos[(i * np + j) * 3 + 2]);
			for (let j = 0; j < np; j++) {
				const p1 = base + 1 + j, p2 = base + 1 + ((j + 1) % np);
				if (flip) groups[g].push(base, p2, p1);
				else groups[g].push(base, p1, p2);
			}
		};
		/* czoło pionowe (st.face): siatka 4 cm na płaszczyźnie ostatniego przekroju, każdy kwadrat w grupie wg mapy kolorów
		   (szyby to grupa 4 – z kabiny widać przez nie świat) */
		const faceGrid = (i, outward) => {
			const sc = sections[i];
			const poly = [];
			for (let j = 0; j < np; j++) poly.push([pos[(i * np + j) * 3], pos[(i * np + j) * 3 + 1]]);
			const zAt = (x) => sc.z + sc.dir * Math.pow(Math.min(1, Math.abs(x) / 0.9 / HALF), 2.4) * (st.round ?? 0.85) * Math.pow(sc.t, 1.4);
			let ymax = 0;
			for (const [, y] of poly) ymax = Math.max(ymax, y);
			// wiersze co 4 cm: zakres x obrysu na wysokości środka wiersza, kwadraty docięte do obrysu (bez szczelin)
			const S = 0.04;
			for (let y0 = BOTTOM; y0 < ymax - 0.005; y0 += S) {
				const y1 = Math.min(ymax, y0 + S), yc = (y0 + y1) / 2, xs = [];
				for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
					const [xa, ya] = poly[a], [xb, yb] = poly[b];
					if ((ya > yc) !== (yb > yc)) xs.push(xa + ((xb - xa) * (yc - ya)) / (yb - ya));
				}
				if (xs.length < 2) continue;
				const xl = Math.min(...xs), xr = Math.max(...xs);
				for (let x0 = xl; x0 < xr - 1e-6; x0 += S) {
					const x1 = Math.min(xr, x0 + S), g = st.face((x0 + x1) / 2, yc), base = pos.length / 3;
					for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) pos.push(x, y, zAt(x));
					if (outward < 0) groups[g].push(base, base + 2, base + 1, base, base + 3, base + 2);
					else groups[g].push(base, base + 1, base + 2, base, base + 2, base + 3);
				}
			}
		};
		// endGroup – grupa ścian czołowych bez kabiny (nowoczesne EZT – ciemna, jak pas okien)
		if (rearNose && st.face) faceGrid(0, 1);
		else cap(0, false, rearNose ? capGroup : st.endGroup || 0);
		if (frontNose && st.face) faceGrid(nsec - 1, -1);
		else cap(nsec - 1, true, frontNose ? capGroup : st.endGroup || 0);
		const geo = new T.BufferGeometry();
		geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
		const index = [];
		let start = 0;
		groups.forEach((g, m) => {
			for (const v of g) index.push(v);
			geo.addGroup(start, g.length, m);
			start += g.length;
		});
		geo.setIndex(index);
		geo.computeVertexNormals();
		return geo;
	}

	// przekrój zdeformowany tak samo jak w loftBody – do ustawiania detali na czole
	function nosePoint(st, H, t, x, y) {
		const kTop = 1 - 0.28 / Math.max(0.5, H - st.yb);
		const top = 1 - kTop * Math.pow(t, 1.25);
		return { x: x * (1 - 0.1 * t * t), y: y <= st.yb ? y : st.yb + (y - st.yb) * top };
	}

	/* Mokra i ośnieżona szyba (szyby kabin pociągu gracza – z zewnątrz i od środka kabiny). Krople i śnieg
	   osiadają w czasie opadu (ilość wody/śniegu: uWG/uSG – szyba, uWA/uSA – 12 wycinków przecieranych przez
	   każdą z dwóch wycieraczek); wycieraczka zeruje wycinki, które przetarła. Wzór kropel w układzie szyby
	   (oś pierwszej wycieraczki) – porusza się razem z pociągiem. */
	const WET_GLSL = `
		uniform vec3 uWP[2]; uniform vec3 uWU[2]; uniform vec3 uWV[2]; uniform float uWS[2];
		uniform float uWL; uniform float uWD; uniform float uA0[2]; uniform float uSweep[2]; uniform float uWA[24]; uniform float uSA[24]; uniform float uWG; uniform float uSG;
		uniform float uWR; uniform float uSR;
		uniform vec3 uFwd; uniform vec3 uOrg; uniform vec2 uFlow; uniform float uStretch;
		varying vec3 vWN;
		varying vec3 vWG;
		float wgH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
		float wgN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
			return mix(mix(wgH(i), wgH(i + vec2(1.0, 0.0)), f.x), mix(wgH(i + vec2(0.0, 1.0)), wgH(i + vec2(1.0, 1.0)), f.x), f.y); }
		/* kropla w komórce siatki g (pokrycie cov): x – kropla, y – ciemny brzeg (załamanie światła na krawędzi),
		   zw – nachylenie powierzchni kropli (soczewka – zgina odbicia nieba) */
		vec4 wgDrop(vec2 g, float cov) {
			vec2 id = floor(g), f = fract(g);
			if (wgH(id) > cov * 0.6) return vec4(0.0);
			vec2 c = vec2(0.3 + 0.4 * wgH(id + 7.3), 0.3 + 0.4 * wgH(id + 3.1));
			float rad = 0.1 + 0.26 * wgH(id + 1.7) * wgH(id + 5.9);
			vec2 dv = (f - c) / rad; dv.y *= 0.8;
			float d = length(dv), drop = 1.0 - smoothstep(0.75, 1.0, d);
			return vec4(drop, smoothstep(0.6, 1.0, d) * drop, dv * drop);
		}`;
	/* Krople jak małe soczewki: wnętrze lekko ciemniejsze i przejrzyste (wcześniej mleczne – białe plamy), cienki
	   ciemny brzeg, jasny refleks u góry, powierzchnia kropli zgina odbicia (normalna – WET_NORMAL). Trzy wielkości:
	   rzadkie duże (do 2 cm), średnie i mgiełka drobnych. */
	const WET_FRAG = `
		float wgK = 0.0; vec2 wgDn = vec2(0.0);
		{
			/* szyba boczna (normalna w poprzek kierunku jazdy): bez wycieraczek, krople spływają – w czasie jazdy do
			   tyłu (pęd powietrza, rozciągnięte w smugi), na postoju w dół; wzór w płaszczyźnie boku (wzdłuż jazdy, w pionie) */
			vec3 wn = normalize(vWN);
			float sideK = (1.0 - smoothstep(0.35, 0.6, abs(dot(wn, uFwd)))) * (1.0 - smoothstep(0.55, 0.8, abs(wn.y)));
			bool sideG = sideK > 0.5;
			float wa = sideG ? uWG * 0.85 : uWG, sa = uSG, wgE = 0.0;
			for (int i = 0; i < 2; i++) {
				if (sideG) break;
				vec3 dd = vWG - uWP[i];
				vec2 q = vec2(dot(dd, uWU[i]) * uWS[i], dot(dd, uWV[i]));
				// pióro biegnie równolegle do promienia z osi, przesunięte o uWD – punkt w odległości r przeciera
				// wycieraczka obrócona o kąt punktu minus asin(uWD / r)
				float r = length(q), an = atan(q.y, q.x) - asin(clamp(uWD / max(r, 1e-3), 0.0, 1.0));
				float tf = (an - uA0[i]) / uSweep[i];
				if (r < uWL && r > uWD + 0.02 && tf > -0.04 && tf < 1.04) {
					int b = int(clamp(tf, 0.0, 0.999) * 12.0);
					wa = min(wa, uWA[i * 12 + b]);
					sa = min(sa, uSA[i * 12 + b]);
				}
				/* ślad na obrysie przetartego pola: woda (śnieg) zgarnięta przez pióro – wąski wał tuż za łukiem końca pióra
				   i za oboma skrajnymi położeniami (zaokrąglony brzeg, grubszy w połowie łuku) */
				if (uWL > 0.0) {
					float wob = 0.006 * sin(an * 37.0 + float(i) * 2.1) + 0.004 * sin(r * 61.0);
					if (tf > -0.03 && tf < 1.03 && r > uWD) {
						float mid = 1.0 - abs(clamp(tf, 0.0, 1.0) - 0.5) * 0.8;
						wgE = max(wgE, (1.0 - smoothstep(0.0, 0.016 + 0.01 * mid, abs(r - uWL - 0.014 - wob))) * smoothstep(-0.03, 0.03, tf) * (1.0 - smoothstep(0.97, 1.03, tf)));
					}
					if (r > uWD + 0.02 && r < uWL + 0.02) {
						float ds = tf < 0.5 ? -tf * uSweep[i] * r : (tf - 1.0) * uSweep[i] * r; // odległość za skrajnym położeniem (m)
						wgE = max(wgE, (1.0 - smoothstep(0.0, 0.014, abs(ds - 0.012 - wob))) * smoothstep(uWD, uWD + 0.08, r));
					}
				}
			}
			wa = max(wa, uWR * wgE);
			sa = max(sa, uSR * wgE);
			vec3 d0 = vWG - uWP[0];
			vec2 q0 = vec2(dot(d0, uWU[0]), dot(d0, uWV[0]));
			vec2 qS = q0; // śnieg przymarza – bez spływania
			if (sideG) {
				qS = vec2(dot(vWG - uOrg, uFwd), vWG.y - uOrg.y); // w układzie pociągu (wzór jedzie z szybą)
				q0 = vec2((qS.x + uFlow.x) * uStretch, qS.y + uFlow.y);
			}
			float cov = 1.0 - exp(-wa);
			vec4 a1 = wgDrop(q0 * 18.0, cov * 0.7), a2 = wgDrop(q0 * 42.0 + 0.5, cov), a3 = wgDrop(q0 * 95.0 + 0.3, cov * 1.2);
			float drop = max(max(a1.x, a2.x * 0.85), a3.x * 0.6), rim = max(max(a1.y, a2.y * 0.85), a3.y * 0.5);
			wgK = drop;
			wgDn = a1.x > a2.x ? a1.zw : a2.x > a3.x ? a2.zw : a3.zw;
			// refleks: jasny punkt u góry kropli (odbicie nieba)
			vec2 hv = a1.x > a2.x ? a1.zw : a2.zw;
			float hl = smoothstep(0.32, 0.0, length(hv - vec2(-0.25, 0.35) * max(a1.x, a2.x))) * max(a1.x, a2.x);
			diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7 + vec3(0.04, 0.05, 0.06), drop * 0.5);
			diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), rim * 0.45);
			diffuseColor.rgb += vec3(0.75, 0.8, 0.85) * hl * 0.55;
			// mgiełka drobnych kropelek przy dużym zmoczeniu – szyba lekko matowa
			diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.6, 0.66), cov * 0.06);
			// wał wody na obrysie: zlana smuga (ciemniejsza z jasnym brzegiem)
			float film = wgE * clamp(uWR / 2.5, 0.0, 1.0);
			diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55 + vec3(0.12, 0.14, 0.16), film * 0.75);
			diffuseColor.rgb += vec3(0.5, 0.55, 0.6) * film * smoothstep(0.5, 1.0, wgE) * 0.25; // jasny grzbiet wału (odbicie nieba)
			diffuseColor.a = clamp(diffuseColor.a + film * 0.4, 0.0, 1.0);
			diffuseColor.a = clamp(diffuseColor.a + drop * 0.12 + rim * 0.25 + hl * 0.35 + cov * 0.05, 0.0, 1.0);
			float sCov = 1.0 - exp(-sa);
			float sn = wgN(qS * 7.0) * 0.6 + wgN(qS * 21.0) * 0.4;
			float snow = smoothstep(1.0 - sCov, 1.0 - sCov + 0.18, sn) * step(0.01, sa);
			diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.98), snow);
			diffuseColor.a = max(diffuseColor.a, snow * 0.93);
		}`;
	function wetGlass(material, U) {
		const prev = material.onBeforeCompile;
		const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
		material.onBeforeCompile = (sh, r) => {
			if (prev) prev(sh, r);
			Object.assign(sh.uniforms, U);
			sh.vertexShader = sh.vertexShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vWG; varying vec3 vWN;')
				.replace('#include <project_vertex>', '#include <project_vertex>\nvWG = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = mat3(modelMatrix) * normal;');
			sh.fragmentShader = sh.fragmentShader
				.replace('#include <common>', '#include <common>\n' + WET_GLSL)
				.replace('#include <color_fragment>', '#include <color_fragment>\n' + WET_FRAG)
				// powierzchnia kropli zgina normalną szyby (osie szyby – oś pierwszej wycieraczki, w układzie widoku)
				.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
				if (wgK > 0.01) {
					vec3 tU = normalize((viewMatrix * vec4(uWU[0], 0.0)).xyz), tV = normalize((viewMatrix * vec4(uWV[0], 0.0)).xyz);
					normal = normalize(normal + (tU * wgDn.x + tV * wgDn.y) * 0.9);
				}`);
		};
		material.customProgramCacheKey = () => key + '-wet';
		material.needsUpdate = true;
		return material;
	}
	NS.wetGlass = wetGlass;

	// środek skosu czoła (oś pojazdu) w postępie tt (0 – początek skosu, 1 – sam przód): jak przekroje loftBody
	function noseCenter(st, H, hl, sgn, tt) {
		const kTop = 1 - 0.28 / Math.max(0.5, H - st.yb), t = Math.pow(tt, 0.9);
		return { y: st.yb + (H - st.yb) * (1 - kTop * Math.pow(t, 1.25)), z: sgn * (hl - st.nose * (1 - tt)) };
	}

	// belka między dwoma punktami w płaszczyźnie (y, z) grupy
	function beam(y1, z1, y2, z2, x, t, material) {
		const dz = z2 - z1, dy = y2 - y1;
		const b = box(t, Math.hypot(dz, dy), t, material, x, (y1 + y2) / 2, (z1 + z2) / 2);
		b.rotation.x = Math.atan2(dz, dy);
		return b;
	}

	/* ---- Jakość brył (model szczegółowy: pociąg gracza i podgląd składu) ----
	   CYL – walec gładszy niż wspólny GEO.cyl (24 ściany zamiast 10 – okrągłe reflektory, zderzaki, osie). */
	const CYL = new T.CylinderGeometry(0.5, 0.5, 1, 24);
	CYL.userData.shared = true;
	// bryła obrotowa wokół osi y z profilu [promień, wysokość]
	function lathe(points, seg = 24) {
		const g = new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), seg);
		g.userData.shared = true;
		return g;
	}
	// zderzak (oś y od płyty mocującej, m): kołnierz, tuleja zwężająca się ku przodowi, trzon, talerz; twarz talerza – BUFFER_FACE
	const BUFFER_GEO = lathe([[0, 0], [0.2, 0], [0.2, 0.03], [0.17, 0.04], [0.16, 0.3], [0.178, 0.305], [0.178, 0.325], [0.11, 0.33], [0.11, 0.485], [0.215, 0.49], [0.232, 0.505], [0.232, 0.528], [0, 0.528]]);
	const BUFFER_FACE = lathe([[0, 0.014], [0.1, 0.011], [0.19, 0.003], [0.215, 0]]);
	// obudowa reflektora (promień 1, głębokość 1 – skalowana): wypukły tył, kołnierz, wnętrze czaszy; klosz wypukły; obręcz
	const LAMP_GEO = lathe([[0, 0], [0.55, 0.03], [0.88, 0.2], [1, 0.5], [1, 0.92], [1.1, 0.96], [1.1, 1], [0.9, 1], [0.86, 0.8], [0.5, 0.55], [0, 0.5]]);
	const LENS_GEO = lathe([[1, 0], [0.85, 0.05], [0.5, 0.11], [0, 0.14]]);
	// syrena (trąbka; promień czary 1, długość 1 – skalowana): króciec, stożek rozszerzający się ku przodowi, czara z wnętrzem
	const HORN_GEO = lathe([[0, 0], [0.3, 0], [0.3, 0.28], [0.36, 0.55], [0.55, 0.82], [1, 1], [0.9, 1], [0.5, 0.9], [0, 0.86]], 16);
	const RING_GEO = new T.TorusGeometry(1, 0.06, 6, 32).rotateX(Math.PI / 2);
	let END_PLATE_GEO = null; // tarcza końca pociągu – czerwone trójkąty (endPlate)
	RING_GEO.userData.shared = true;
	// izolator dachowy (wysokość 1, promień 1 – skalowany): podstawa, trzy klosze, okucie u góry
	const INSUL_GEO = lathe([[0, 0], [0.5, 0], [0.5, 0.1], [0.32, 0.13], [0.32, 0.22], [0.8, 0.28], [0.32, 0.36], [0.32, 0.44], [0.8, 0.5], [0.32, 0.58], [0.32, 0.66], [0.8, 0.72], [0.32, 0.8], [0.32, 0.88], [0.45, 0.9], [0.45, 1], [0, 1]], 14);
	// wywietrznik dachowy „grzybek” (promień 1, wysokość 1 – skalowany): kołnierz, szyjka, kapelusz z okapem
	const VENT_GEO = lathe([[0, 0], [0.85, 0], [0.85, 0.08], [0.5, 0.14], [0.5, 0.5], [0.95, 0.56], [1.05, 0.66], [0.85, 0.86], [0.45, 0.98], [0, 1]], 18);
	// bryła obrotowa ustawiona osią wzdłuż z (sgn – zwrot: +1 do +z, −1 do −z), skala: promień r, długość l
	function turned(geo, material, x, y, z, r, l, sgn) {
		const m = new T.Mesh(geo, material);
		m.scale.set(r, l, r);
		m.rotation.x = sgn * Math.PI / 2;
		m.position.set(x, y, z);
		return m;
	}

	/* Fazowane krawędzie: prostopadłościan z zaokrągleniem krawędzi (jak RoundedBoxGeometry z dodatków Three.js –
	   siatka 3×3 na ścianę, wierzchołki skrajne przesunięte na łuk). Krawędzie łapią światło – koniec wyglądu „z klocków”.
	   box() fazuje tylko w modelu szczegółowym (BEVEL) i tylko bryły nie cieńsze niż 5 cm i nie krótsze niż 25 cm
	   (listwy, żaluzje i kratki zostają proste – fazka byłaby mniejsza niż piksel). */
	let BEVEL = false;
	const bevelGeos = new Map();
	function bevelGeo(w, h, d) {
		const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
		let g = bevelGeos.get(key);
		if (g) return g;
		const r = Math.min(0.03, Math.min(w, h, d) * 0.18), hs = 0.5 / 3;
		g = new T.BoxGeometry(1, 1, 1, 3, 3, 3).toNonIndexed();
		const p = g.attributes.position, nr = g.attributes.normal, v = new T.Vector3(), q = new T.Vector3();
		const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
		for (let k = 0; k < p.count; k++) {
			v.fromBufferAttribute(p, k);
			const sx = Math.sign(v.x), sy = Math.sign(v.y), sz = Math.sign(v.z);
			q.set(v.x - sx * hs, v.y - sy * hs, v.z - sz * hs).normalize();
			p.setXYZ(k, hx * sx + q.x * r, hy * sy + q.y * r, hz * sz + q.z * r);
			nr.setXYZ(k, q.x, q.y, q.z);
		}
		g.computeBoundingSphere();
		g.userData.shared = true;
		bevelGeos.set(key, g);
		return g;
	}
	function box(w, h, d, material, x, y, z) {
		if (!BEVEL || !material.isMeshStandardMaterial || material.transparent || Math.min(w, h, d) < 0.05 || Math.max(w, h, d) < 0.25) return boxU(w, h, d, material, x, y, z);
		const m = new T.Mesh(bevelGeo(w, h, d), material);
		m.position.set(x || 0, y || 0, z || 0);
		return m;
	}

	/* Drobne detale (nity, cięgła, piasecznice, przewody, kratki) – userData.fine: scalane osobno i pokazywane tylko
	   z bliska (THREE.LOD – przełącza renderer wg odległości kamery od wagonu). */
	const FINE_DIST = 140;
	function fine(o) {
		o.userData.fine = true;
		return o;
	}
	function fineLod(group) {
		const list = group.children.filter((o) => o.userData.fine);
		if (!list.length) return;
		const near = new T.Group();
		near.userData.lodLevel = true;
		for (const o of list) near.add(o);
		const lod = new T.LOD();
		lod.addLevel(near, 0);
		lod.addLevel(new T.Group(), FINE_DIST);
		group.add(lod);
	}

	/* Okluzja otoczenia wypiekana w wierzchołkach (aWear.x – common.js TRAIN_GLSL): wszystkie bryły wagonu (bez
	   szyb i wnętrz) zapisane w siatce wokseli (oczko AO_CELL), z każdego wierzchołka siatek scalonych i pudła
	   AO_DIRS promieni w półkuli wokół normalnej (gęściej blisko normalnej) – trafienie bliżej przyciemnia mocniej.
	   Zagłębienia, styki części, przestrzeń pod pudłem i między wózkami ciemnieją także w świetle otoczenia, którego
	   nie łapią cienie słońca. aWear.y = 1: współrzędne siatki są współrzędnymi wagonu (patyna wg wysokości). ao =
	   false – tylko aWear.y (pociągi mijane: bez kosztu wypiekania). */
	const AO_CELL = 0.07, AO_STEPS = 10, AO_START = AO_CELL * 1.8;
	const AO_DIRS = (() => {
		const out = [], n = 12;
		for (let k = 0; k < n; k++) {
			const u = (k + 0.5) / n, ph = k * 2.39996, r = Math.sqrt(u);
			out.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u)]);
		}
		return out;
	})();
	// wyniki wypiekania wg skrótu geometrii wagonu (ten sam wagon w kolejnym podglądzie / składzie – bez liczenia)
	const aoCache = new Map();
	function bakeWear(group, ao) {
		group.updateMatrixWorld(true);
		const inv = new T.Matrix4().copy(group.matrixWorld).invert(), M = new T.Matrix4();
		const recv = [];
		let tris = new Float32Array(1 << 16), nt = 0;
		// przesłaniają bryły nieprzezroczyste z zewnątrz pojazdu (wnętrza – za ścianami pudła – pominięte)
		const solid = (m) => m && m.visible !== false && !m.transparent && m.isMeshStandardMaterial && !/indoor/.test(m.customProgramCacheKey ? m.customProgramCacheKey() : '');
		group.traverse((o) => {
			if (!o.isMesh || o.isInstancedMesh || !o.geometry.attributes.position) return;
			const e = M.multiplyMatrices(inv, o.matrixWorld).elements;
			// odbiorniki: własna geometria w układzie wagonu (bez obrotu i skali; przesunięcie wzdłuż wagonu dozwolone)
			if (o.userData.ownGeometry && Math.abs(e[0] - 1) + Math.abs(e[5] - 1) + Math.abs(e[10] - 1) + Math.abs(e[1]) + Math.abs(e[2]) + Math.abs(e[4]) + Math.abs(e[6]) + Math.abs(e[8]) + Math.abs(e[9]) + Math.abs(e[12]) + Math.abs(e[13]) < 1e-4) recv.push({ o, dz: e[14] });
			if (!ao) return;
			const g = o.geometry, pa = g.attributes.position.array, idx = g.index;
			const cnt = idx ? idx.count : g.attributes.position.count;
			const groups = g.groups.length ? g.groups : [{ start: 0, count: cnt, materialIndex: 0 }];
			for (const gr of groups) {
				if (!solid(Array.isArray(o.material) ? o.material[gr.materialIndex] : o.material)) continue;
				const end = Math.min(cnt, gr.start + gr.count);
				if (nt + (end - gr.start) * 3 > tris.length) { const t2 = new Float32Array(Math.max(tris.length * 2, nt + (end - gr.start) * 3)); t2.set(tris); tris = t2; }
				for (let k = gr.start; k < end; k++) {
					const j = (idx ? idx.getX(k) : k) * 3, x = pa[j], y = pa[j + 1], z = pa[j + 2];
					tris[nt++] = e[0] * x + e[4] * y + e[8] * z + e[12];
					tris[nt++] = e[1] * x + e[5] * y + e[9] * z + e[13];
					tris[nt++] = e[2] * x + e[6] * y + e[10] * z + e[14];
				}
			}
		});
		const put = (o, a) => o.geometry.setAttribute('aWear', new T.BufferAttribute(a, 2));
		if (!ao || !nt) {
			for (const { o } of recv) {
				const n = o.geometry.attributes.position.count, a = new Float32Array(n * 2);
				for (let k = 0; k < n; k++) a[k * 2 + 1] = 1;
				put(o, a);
			}
			return;
		}
		// skrót: wszystkie trójkąty przesłaniające i liczby wierzchołków odbiorników
		let h = nt | 0;
		const hv = new Int32Array(tris.buffer, 0, nt);
		for (let k = 0; k < nt; k++) h = (Math.imul(h, 31) + hv[k]) | 0;
		for (const { o } of recv) h = (Math.imul(h, 31) + o.geometry.attributes.position.count) | 0;
		const hit = aoCache.get(h);
		if (hit && hit.length === recv.length && hit.every((a, k) => a.length === recv[k].o.geometry.attributes.position.count * 2)) {
			recv.forEach(({ o }, k) => put(o, hit[k].slice()));
			return;
		}
		// siatka wokseli wokół wszystkich trójkątów
		let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
		for (let k = 0; k < nt; k += 3) {
			const x = tris[k], y = tris[k + 1], z = tris[k + 2];
			if (x < x0) x0 = x; if (x > x1) x1 = x;
			if (y < y0) y0 = y; if (y > y1) y1 = y;
			if (z < z0) z0 = z; if (z > z1) z1 = z;
		}
		const C = AO_CELL, iC = 1 / C, pad = C * 2;
		x0 -= pad; y0 -= pad; z0 -= pad;
		const nx = Math.ceil((x1 - x0 + pad) * iC) + 1, ny = Math.ceil((y1 - y0 + pad) * iC) + 1, nz = Math.ceil((z1 - z0 + pad) * iC) + 1, nxy = nx * ny;
		const grid = new Uint8Array(nx * ny * nz);
		// trójkąt: punkty co ok. oczko siatki (małe trójkąty – same wierzchołki)
		for (let k = 0; k < nt; k += 9) {
			const ax = (tris[k] - x0) * iC, ay = (tris[k + 1] - y0) * iC, az = (tris[k + 2] - z0) * iC;
			const ux = (tris[k + 3] - x0) * iC - ax, uy = (tris[k + 4] - y0) * iC - ay, uz = (tris[k + 5] - z0) * iC - az;
			const wx = (tris[k + 6] - x0) * iC - ax, wy = (tris[k + 7] - y0) * iC - ay, wz = (tris[k + 8] - z0) * iC - az;
			const L = Math.max(Math.abs(ux) + Math.abs(uy) + Math.abs(uz), Math.abs(wx) + Math.abs(wy) + Math.abs(wz), Math.abs(ux - wx) + Math.abs(uy - wy) + Math.abs(uz - wz));
			const n = Math.min(300, Math.max(1, Math.ceil(L * 0.75)));
			for (let i = 0; i <= n; i++) {
				const a = i / n, bx = ax + ux * a, by = ay + uy * a, bz = az + uz * a;
				for (let j = 0; i + j <= n; j++) {
					const b = j / n;
					grid[((bz + wz * b) | 0) * nxy + ((by + wy * b) | 0) * nx + ((bx + wx * b) | 0)] = 1;
				}
			}
		}
		const step = C * 0.9;
		const occl = (px, py, pz, qx, qy, qz) => {
			// baza styczna wokół normalnej
			let tx, ty, tz;
			if (Math.abs(qy) < 0.9) { tx = qz; ty = 0; tz = -qx; } else { tx = 0; ty = -qz; tz = qy; }
			const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
			const bx = qy * tz - qz * ty, by = qz * tx - qx * tz, bz = qx * ty - qy * tx;
			const sx = (px + qx * AO_START - x0) * iC, sy = (py + qy * AO_START - y0) * iC, sz = (pz + qz * AO_START - z0) * iC;
			let s = 0;
			for (const [dx, dy, dn] of AO_DIRS) {
				const rx = (tx * dx + bx * dy + qx * dn) * step * iC, ry = (ty * dx + by * dy + qy * dn) * step * iC, rz = (tz * dx + bz * dy + qz * dn) * step * iC;
				for (let st = 0; st < AO_STEPS; st++) {
					const ix = Math.floor(sx + rx * st), iy = Math.floor(sy + ry * st), iz = Math.floor(sz + rz * st);
					if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) break;
					if (grid[iz * nxy + iy * nx + ix]) { s += 1 - (0.6 * st) / AO_STEPS; break; }
				}
			}
			return Math.min(0.92, (s / AO_DIRS.length) * 1.15);
		};
		const out = [];
		for (const { o, dz } of recv) {
			const g = o.geometry;
			if (!g.attributes.normal) g.computeVertexNormals();
			const pa = g.attributes.position.array, na = g.attributes.normal.array, n = g.attributes.position.count, a = new Float32Array(n * 2);
			const seen = new Map();
			for (let k = 0; k < n; k++) {
				const px = pa[k * 3], py = pa[k * 3 + 1], pz = pa[k * 3 + 2] + dz, qx = na[k * 3], qy = na[k * 3 + 1], qz = na[k * 3 + 2];
				// ten sam punkt i normalna (wierzchołki powtórzone w siatkach scalonych) – liczony raz
				const key = (Math.round(px * 400) * 73856093) ^ (Math.round(py * 400) * 19349663) ^ (Math.round(pz * 400) * 83492791) ^ (Math.round(qx * 20 + 20) * 2654435761) ^ (Math.round(qy * 20 + 20) * 40503) ^ (Math.round(qz * 20 + 20) * 977);
				let v = seen.get(key);
				if (v === undefined) { v = occl(px, py, pz, qx, qy, qz); seen.set(key, v); }
				a[k * 2] = v;
				a[k * 2 + 1] = 1;
			}
			put(o, a);
			out.push(a.slice());
		}
		aoCache.set(h, out);
		if (aoCache.size > 48) aoCache.delete(aoCache.keys().next().value);
	}

	// wyświetlacz kierunkowy (pomarańczowe diody na czarnym tle)
	function displayTexture(text) {
		return canvasTexture(`display|${text}`, 256, 48, (g, w, h) => {
			g.fillStyle = '#0b0b0b';
			g.fillRect(0, 0, w, h);
			g.fillStyle = '#ffa31a';
			g.font = '700 30px ui-monospace, Consolas, monospace';
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			let size = 30;
			while (g.measureText(text).width > w - 16 && size > 14) {
				size -= 2;
				g.font = `700 ${size}px ui-monospace, Consolas, monospace`;
			}
			g.fillText(text, w / 2, h / 2 + 1);
			g.fillStyle = 'rgba(0,0,0,0.35)';
			for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
		});
	}

	// tabliczka z numerem pojazdu (EU07-123, EN57-1234)
	function plateTexture(text, bg, fg) {
		return canvasTexture(`plate|${text}|${bg}`, 256, 64, (g, w, h) => {
			g.fillStyle = bg;
			g.fillRect(0, 0, w, h);
			g.strokeStyle = fg;
			g.lineWidth = 4;
			g.strokeRect(4, 4, w - 8, h - 8);
			g.fillStyle = fg;
			g.font = '700 38px system-ui, sans-serif';
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText(text, w / 2, h / 2 + 2);
		});
	}

	// napisy na burtach: numer UIC wagonu, numer EN57 – biały / kremowy tekst na tle lakieru (bez ramki)
	function sideTextTexture(text, bg, fg, w = 512, h = 64, size = 34) {
		return canvasTexture(`side|${text}|${bg}|${fg}`, w, h, (g, W, H) => {
			g.clearRect(0, 0, W, H); // przezroczyste tło – napis na lakierze
			g.fillStyle = fg;
			g.font = `600 ${size}px system-ui, sans-serif`;
			g.textBaseline = 'middle';
			g.fillText(text, 8, H / 2 + 1);
		});
	}
	// napis „PKP” z numerem wagonu pod spodem (środek burty 111A)
	function pkpTexture(num, fg = '#ecebe4') {
		return canvasTexture(`pkp|${num}|${fg}`, 512, 160, (g, W, H) => {
			g.clearRect(0, 0, W, H);
			g.fillStyle = fg;
			g.textAlign = 'center';
			g.font = '700 70px system-ui, sans-serif';
			g.textBaseline = 'alphabetic';
			g.fillText('PKP', W / 2, 78);
			g.font = '600 34px system-ui, sans-serif';
			g.fillText(num, W / 2, 132);
		});
	}
	// oznaczenie klasy: duża cyfra na żółtym pasku (111A, EN57)
	function classTexture(n, bg) {
		return canvasTexture(`class|${n}|${bg}`, 64, 96, (g, W, H) => {
			g.clearRect(0, 0, W, H);
			g.fillStyle = '#f2efe4';
			g.font = '700 72px system-ui, sans-serif';
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText(String(n), W / 2, H / 2 + 8);
		});
	}

	class TrainModel {
		// train: opis składu (routes.TRAINS albo OTHER_TRAINS); opts.player – pociąg gracza (reflektor, iskry)
		constructor(scene, train, opts = {}) {
			this.scene = scene;
			this.train = train;
			this.player = opts.player !== false;
			this.seed = opts.seed || 1;
			this.shadows = opts.shadows !== false;
			// model szczegółowy (pociąg gracza, podgląd): fazowane krawędzie, wypiekana okluzja; mijane – lżejsze
			this.detail = opts.detail ?? this.player;
			this.destination = opts.destination || '';
			this.ownMats = [];
			this.doorAnim = 0; // 0 – drzwi zamknięte, 1 – otwarte (animacja)
			this.doorSets = [];
			// wnętrza wagonów: materiały wspólne dla całego składu (oświetlenie zależne od pory dnia)
			// świecenie własne mnożone przez kolor (także kolor instancji) – oświetlone wnętrze zachowuje barwy
			const own = (m) => {
				this.ownMats.push(m);
				if (m.isMeshLambertMaterial) {
					m.onBeforeCompile = (sh) => {
						sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
							totalEmissiveRadiance *= diffuseColor.rgb;`);
					};
					m.customProgramCacheKey = () => 'interior';
				}
				return m;
			};
			this.inMats = {
				wall: own(new T.MeshLambertMaterial({ color: train.style === 'ezt' ? '#cfd3c0' : '#b8946a', emissive: '#ffffff', emissiveIntensity: 0.12 })),
				floor: own(new T.MeshLambertMaterial({ color: '#4b5056', emissive: '#ffffff', emissiveIntensity: 0.05 })),
				ceil: own(new T.MeshLambertMaterial({ color: '#f1f0ea', emissive: '#ffffff', emissiveIntensity: 0.15 })),
				seat: own(new T.MeshLambertMaterial({ color: train.style === 'ezt' ? '#6e3b24' : '#7a3328', emissive: '#ffffff', emissiveIntensity: 0.06 })),
				seatFrame: own(new T.MeshLambertMaterial({ color: '#8d9399', emissive: '#ffffff', emissiveIntensity: 0.06 })),
				people: own(new T.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.06 })),
				skin: own(new T.MeshLambertMaterial({ color: '#e2b48f', emissive: '#ffffff', emissiveIntensity: 0.06 })),
				pole: own(new T.MeshLambertMaterial({ color: '#f2c230', emissive: '#f2c230', emissiveIntensity: 0.15 })),
				lamp: own(new T.MeshBasicMaterial({ color: '#f4f1e6' })),
				// pasażerowie (model z props.js – spodnie, buty, włosy w kolorach wierzchołków)
				peopleV: own(new T.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.06 })),
				skinV: own(new T.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.06 })),
				wallLow: own(new T.MeshLambertMaterial({ color: train.style === 'ezt' ? '#9fa58f' : '#8e6f4f', emissive: '#ffffff', emissiveIntensity: 0.1 })),
				carpet: own(new T.MeshLambertMaterial({ color: train.style === 'ezt' ? '#3c4046' : '#5a2f2a', emissive: '#ffffff', emissiveIntensity: 0.05 })),
				curtain: own(new T.MeshLambertMaterial({ color: '#d9cdb0', emissive: '#ffffff', emissiveIntensity: 0.1 })),
			};
			// pasażerowie: spodnie, buty, włosy nie biorą koloru ubrania/skóry (aKeep – jak ludzie na peronach)
			for (const m of [this.inMats.peopleV, this.inMats.skinV]) {
				const prev = m.onBeforeCompile;
				m.onBeforeCompile = (sh, r) => {
					prev(sh, r);
					sh.vertexShader = sh.vertexShader
						.replace('#include <common>', '#include <common>' + String.fromCharCode(10) + 'attribute float aKeep;')
						.replace('#include <color_vertex>', `#include <color_vertex>
						if (aKeep > 0.5) {
							float ph = fract(sin(float(gl_InstanceID) * 12.9898 + aKeep * 3.1) * 43758.5453);
							vColor.rgb = aKeep < 1.5
								? (ph < 0.4 ? vec3(0.12, 0.16, 0.3) : ph < 0.6 ? vec3(0.07) : ph < 0.8 ? vec3(0.24, 0.24, 0.23) : vec3(0.42, 0.36, 0.26))
								: aKeep > 2.5 ? (ph < 0.35 ? vec3(0.1, 0.08, 0.06) : ph < 0.65 ? vec3(0.3, 0.2, 0.12) : ph < 0.85 ? vec3(0.62, 0.5, 0.3) : vec3(0.55)) : color.rgb;
						}`);
				};
				m.customProgramCacheKey = () => 'interior-person';
			}
			// szyby boczne przyciemniane (jak w wagonach i EZT na zdjęciach – z zewnątrz wnętrze w półmroku, odbicia nieba)
			this.sideGlass = own(patch(new T.MeshStandardMaterial({ color: '#22303a', transparent: true, opacity: 0.42, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.25, depthWrite: false, side: T.DoubleSide }), 'clean'));
			this.sideGlass.userData.shared = false;
			this.hiddenMat = own(new T.MeshBasicMaterial({ visible: false }));
			// szyby kabin: przyciemnione, przezroczyste – z zewnątrz widać wnętrze kabiny i maszynistę
			this.cabGlass = own(patch(new T.MeshStandardMaterial({ color: '#1e2b34', transparent: true, opacity: 0.38, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.2, depthWrite: false }), 'clean'));
			this.cabGlass.userData.shared = false;
			// wycieraczki (zestawy z cabEnd / addWiper) i mokra szyba pociągu gracza
			this.wiperSets = [];
			this.pantoSets = [];
			this.wiperMode = 0; // 0 wyłączone, 1 przerywane, 2 normalne, 3 szybkie
			this.wPh = 0;
			this.wWait = 0;
			this.wAng = 0;
			if (this.player) {
				const V3 = () => new T.Vector3();
				this.glassU = {
					uWP: { value: [V3(), V3()] }, uWU: { value: [V3(), V3()] }, uWV: { value: [V3(), V3()] }, uWS: { value: [1, 1] },
					uWL: { value: 0 }, uWD: { value: 0 }, uA0: { value: [0, 0] }, uSweep: { value: [2.5, 2.5] }, uWA: { value: new Float32Array(24) }, uSA: { value: new Float32Array(24) },
					uWG: { value: 0 }, uSG: { value: 0 }, uWR: { value: 0 }, uSR: { value: 0 },
					uFwd: { value: new T.Vector3(0, 0, -1) }, uOrg: { value: new T.Vector3() }, uFlow: { value: new T.Vector2() }, uStretch: { value: 1 },
				};
				wetGlass(this.cabGlass, this.glassU);
				wetGlass(this.sideGlass, this.glassU); // szyby boczne pociągu gracza – krople spływają w czasie jazdy
			}
			this.wheelsets = [];
			this.headMat = new T.MeshBasicMaterial({ color: 0xfff6c8 });
			this.tailMat = new T.MeshBasicMaterial({ color: 0xff2a1f });
			this.displayMat = null;
			this.ownMats.push(this.headMat, this.tailMat);
			if (this.destination) {
				this.displayMat = new T.MeshBasicMaterial({ map: displayTexture(this.destination.toUpperCase()) });
				this.ownMats.push(this.displayMat);
			}
			// skład z katalogu (routes.makeConsist): bryła i malowanie każdego pojazdu ze specs; składy mijane – wg stylu
			const specs = this.train.specs;
			const freight = this.train.style === 'freight' || this.train.style === 'wagons';
			const dd = this.train.style === 'dd';
			const modelOf = (i) => (specs ? specs[i].model : freight && (i > 0 || this.train.style === 'wagons') ? 'freight' : dd ? (i === 0 ? 'sm42' : 'dd') : null);
			BEVEL = this.detail;
			try {
				this.cars = this.train.cars.map((len, i) => {
					const m = modelOf(i);
					return m === 'freight' ? this.buildFreightCar(i, len) : m === 'sm42' ? this.buildSM42(i, len) : m === 'dd' ? this.buildDD(i, len) : this.buildCar(i, len);
				});
			} finally {
				BEVEL = false;
			}
			for (const c of this.cars) scene.add(c.group);
			this.pA = {};
			this.pB = {};
			this.sparkT = 0;
			if (!this.player) return;
			const lead = this.cars[0];
			this.headlight = new T.SpotLight(0xfff2cc, 0, 190, 0.46, 0.8, 1.0);
			this.headlight.position.set(0, 1.8, -lead.len / 2);
			this.headlight.target.position.set(0, -2, -lead.len / 2 - 60);
			lead.group.add(this.headlight, this.headlight.target);
			this.headGlows = [-0.9, 0.9].map((x) => {
				const g = sprite(glowTexture(), 2.0, 2.0, { additive: true, color: 0xfff2cc, fog: false });
				g.position.set(x, 1.55, -lead.len / 2 - 0.35);
				g.material.opacity = 0;
				lead.group.add(g);
				return g;
			});
		}

		// koniec budowy wagonu: scalenie części, drobne detale w LOD, okluzja i znacznik układu wagonu (aWear)
		finish(group, keep) {
			mergeStatic(group, keep);
			fineLod(group);
			bakeWear(group, this.detail);
		}

		// styl bryły base z malowaniem pojazdu i (wariant z katalogu taboru – nadpisane kolory)
		styleOf(i, base) {
			const sp = this.train.specs && this.train.specs[i];
			return sp && sp.c ? Object.assign({}, STYLES[base], sp.c) : STYLES[base];
		}

		/* Podwozie wagonu pasażerskiego między wózkami: przewód główny wzdłuż wagonu, dwa zbiorniki powietrza
		   (poziome walce z obejmami), cylinder hamulcowy z cięgłem do wózków, skrzynia akumulatorów z żaluzjami,
		   przetwornica (prądnica) i skrzynka rozdzielcza – zamiast jednolitych skrzyń. */
		coachUnderframe(add, span, i) {
			const dk = mat('#26292c'), mid = mat('#34383c'), slat = mat('#1b1d20');
			const steel = matS('#4a4e53', { metalness: 0.5, roughness: 0.5 }), band = mat('#1a1a1a');
			const cylZ = (r, l, x, y, z, m) => turned(CYL, m, x, y, z, r * 2, l, 1);
			const h = span / 2;
			// przewód główny i przewód zasilający wzdłuż całego podwozia
			add(cylZ(0.045, span + 3.6, 1.3, 0.95, 0, steel));
			add(cylZ(0.035, span + 3.6, -1.3, 0.95, 0, mat('#3a3e42')));
			// zbiorniki powietrza z obejmami
			for (const [x, z, l] of [[0.55, -h * 0.55, 2.4], [-0.15, -h * 0.55, 1.8]]) {
				add(cylZ(0.28, l, x, 0.48, z, mid));
				for (const dz of [-l / 2 + 0.25, l / 2 - 0.25]) add(cylZ(0.29, 0.06, x, 0.48, z + dz, band));
				add(box(0.1, 0.2, 0.08, dk, x, 0.8, z));
			}
			// cylinder hamulcowy z cięgłem (dźwignie hamulca ręcznego/powietrznego do obu wózków)
			add(cylZ(0.2, 0.55, -0.55, 0.5, h * 0.05, dk));
			add(box(0.05, 0.05, span + 1.8, steel, -0.55, 0.42, 0));
			add(box(0.06, 0.3, 0.06, steel, -0.55, 0.55, h * 0.05 + 0.4));
			// skrzynia akumulatorów z żaluzjami
			const bz = h * 0.45;
			add(box(1.5, 0.6, 2.2, mid, 0.25, 0.42, bz));
			for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) add(box(0.02, 0.04, 1.9, slat, 0.25 + sx * 0.76, 0.22 + k * 0.065, bz));
			for (const dz of [-0.75, 0, 0.75]) add(box(1.54, 0.04, 0.04, dk, 0.25, 0.74, bz + dz));
			// przetwornica (prądnica) i skrzynka rozdzielcza
			add(box(1.1, 0.5, 1.4, dk, -0.35, 0.47, -h * 0.05 - 1.0));
			add(box(0.6, 0.45, 0.7, mid, 0.75, 0.48, h * 0.05));
			// prądnica osiowa przy pierwszym wózku i pasek do osi (w osłonie)
			const gz = -h - 0.4;
			add(box(0.46, 0.4, 0.6, dk, 0.4, 0.55, gz));
			add(fine(beam(0.5, gz + 0.3, 0.46, gz + 0.7, 0.4, 0.09, band)));
			// przewody elektryczne w rurach osłonowych wzdłuż podwozia, obejmy na poprzecznicach
			for (const sx of [-1, 1]) add(fine(cylZ(0.03, span + 3.0, sx * 1.15, 0.86, 0, mat('#1e2022'))));
			for (let z = -h; z <= h + 1e-6; z += span / 4) add(fine(box(2.4, 0.05, 0.06, dk, 0, 0.9, z)));
		}

		/* Podwozie EZT między wózkami: skrzynie aparatury różnej długości z żebrami usztywniającymi i żaluzjami,
		   zbiorniki powietrza z obejmami, przewody w rurach osłonowych; nowoczesne EZT – fartuchy w kolorze dołu. */
		emuUnderframe(add, span, st) {
			const h = span / 2, dk = mat('#26292c'), mid = mat('#33373b'), slat = mat('#1b1d20'), band = mat('#1a1a1a');
			const segs = [[-h, -h + span * 0.3, 2.1, 0.55, mid], [-h + span * 0.36, -h + span * 0.62, 1.5, 0.5, dk], [-h + span * 0.68, h, 2.2, 0.6, mid]];
			segs.forEach(([a, b, w, ht, m], k) => {
				const zc = (a + b) / 2, l = b - a, y = 0.95 - ht / 2;
				add(box(w, ht, l, m, 0, y, zc));
				for (const sx of [-1, 1]) {
					for (let z = a + 0.3; z < b - 0.15; z += 0.5) add(fine(box(0.03, ht - 0.08, 0.035, dk, sx * (w / 2 + 0.012), y, z)));
					if (k !== 1) for (let yy = y - ht / 2 + 0.1; yy < y + ht / 2 - 0.08; yy += 0.07) add(fine(box(0.02, 0.025, Math.min(1.2, l * 0.4), slat, sx * (w / 2 + 0.016), yy, zc)));
				}
			});
			// zbiorniki powietrza obok środkowej skrzyni
			const za = -h + span * 0.36, zb = -h + span * 0.62, lr = (zb - za) * 0.85;
			for (const sx of [-1, 1]) {
				add(turned(CYL, mid, sx * 1.05, 0.62, (za + zb) / 2, 0.42, lr, 1));
				for (const dz of [-lr / 2 + 0.2, lr / 2 - 0.2]) add(fine(turned(CYL, band, sx * 1.05, 0.62, (za + zb) / 2 + dz, 0.44, 0.06, 1)));
				add(fine(turned(CYL, mat('#1e2022'), sx * 1.22, 0.9, 0, 0.06, span + 2.5, 1)));
				if (st.modern) add(box(0.05, 0.5, span + 1.2, mat(st.apron || '#24292e'), sx * 1.38, 0.78, 0));
			}
		}

		/* Koniec wagonu (pasażerskiego, towarowego): stopnie manewrowe pod narożnikami czołownicy, uchwyty na ścianie
		   czołowej (handle = false – wagon bez ściany czołowej na tej wysokości). zt – płaszczyzna końca, e – zwrot. */
		endDetails(add, zt, e, handle = true) {
			const rail = matS('#c9ccd0', { metalness: 0.85, roughness: 0.3 }), steel = matS('#3a3d41', { metalness: 0.5, roughness: 0.5 });
			for (const sx of [-1, 1]) {
				add(fine(box(0.42, 0.035, 0.24, steel, sx * 1.18, 0.66, zt)));
				for (const dx of [-0.19, 0.19]) add(fine(box(0.03, 0.42, 0.03, steel, sx * 1.18 + dx, 0.86, zt)));
				if (!handle) continue;
				const hr = new T.Mesh(CYL, rail);
				hr.scale.set(0.035, 0.75, 0.035);
				hr.position.set(sx * 1.3, 1.75, zt + e * 0.07);
				add(fine(hr));
				for (const yy of [1.4, 2.1]) add(fine(box(0.03, 0.03, 0.09, rail, sx * 1.3, yy, zt + e * 0.03)));
			}
		}

		/* Wózek: ramy boczne z sylwetką (nad maźnicami wyżej), belka poprzeczna, maźnice z pokrywami, sprężyny
		   śrubowe (osiowe i – w wagonach – kołyskowe), tłumiki, cylindry i klocki hamulcowe, dwa zestawy kołowe z kołami
		   o profilu (obręcz z obrzeżem) – obracają się. R – promień koła (EU07 0,55 m, EN57 0,47 m, 111A 0,45 m – w skali pudeł gry). */
		bogie(group, add, bz, wheelBase, R = WHEEL_R, kind = 'coach', axles = 2) {
			const frame = matS('#3a3d41', { roughness: 0.55, metalness: 0.35 }), dark = matS('#45484c', { roughness: 0.5, metalness: 0.45 });
			const springM = matS('#4c5056', { metalness: 0.6, roughness: 0.45 }), rust = matS('#5b4434', { roughness: 0.85 });
			const wheelMat = matS('#3b3a38', { metalness: 0.65, roughness: 0.5, train: 0.55 }), tread = matS('#b7bbbf', { metalness: 0.9, roughness: 0.28, train: 0 });
			const shadows = this.shadows;
			const half = wheelBase / 2, FX = 1.08;
			// osie: dwie na końcach rozstawu, przy trzech (Co'Co') także środkowa
			const AX = axles === 3 ? [-half, 0, half] : [-half, half];
			const fg = bogieFrameGeo(wheelBase, R, kind);
			for (const sx of [-1, 1]) {
				const fr = new T.Mesh(fg, frame);
				fr.position.set(sx * FX, 0, bz);
				add(fr);
				for (const dz of AX) {
					// maźnica z pokrywą i sprężyna osiowa nad nią
					add(box(0.24, 0.3, 0.36, dark, sx * (FX + 0.02), R, bz + dz));
					const cap = new T.Mesh(CYL, dark);
					cap.scale.set(0.26, 0.08, 0.26);
					cap.rotation.z = Math.PI / 2;
					cap.position.set(sx * (FX + 0.17), R, bz + dz);
					add(cap);
					for (const ddz of kind === 'loco' ? [-0.2, 0.2] : [0]) {
						const sp = new T.Mesh(SPRING_GEO, springM);
						sp.scale.set(0.22, 0.24, 0.22);
						sp.position.set(sx * (FX + 0.02), R + 0.3, bz + dz + ddz);
						add(sp);
					}
					// klocek hamulcowy przy kole i wieszak
					const sd = dz === 0 ? 1 : Math.sign(dz);
					add(box(0.12, 0.34, 0.1, rust, sx * 0.78, R, bz + dz - sd * (R + 0.06)));
					add(beam(R + 0.15, bz + dz - sd * (R + 0.06), R + 0.42, bz + dz - sd * (R - 0.05), sx * 0.78, 0.04, dark));
				}
				if (kind === 'loco') {
					for (const e of [-1, 1]) {
						// piasecznica za skrajnym kołem i rura piaskowa do styku koła z szyną
						const zs = bz + e * (half + R + 0.12);
						add(box(0.3, 0.36, 0.22, dark, sx * (FX - 0.05), R + 0.15, zs));
						add(fine(beam(R - 0.03, zs - e * 0.02, 0.14, bz + e * (half + R * 0.62), sx * 0.86, 0.035, springM)));
						// tłumik pionowy przy skrajnej maźnicy (cylinder i tłoczysko)
						const zd = bz + e * (half - 0.32);
						const dmp = new T.Mesh(CYL, dark);
						dmp.scale.set(0.11, 0.24, 0.11);
						dmp.position.set(sx * (FX + 0.17), R + 0.2, zd);
						add(fine(dmp));
						const rod = new T.Mesh(CYL, springM);
						rod.scale.set(0.045, 0.16, 0.045);
						rod.position.set(sx * (FX + 0.17), R + 0.38, zd);
						add(fine(rod));
					}
				} else {
					// tłumiki pionowe obok sprężyn kołyskowych
					for (const e of [-1, 1]) {
						const dmp = new T.Mesh(CYL, dark);
						dmp.scale.set(0.1, 0.3, 0.1);
						dmp.position.set(sx * (FX - 0.12), R + 0.3, bz + e * 0.6);
						add(fine(dmp));
					}
				}
				// cięgło hamulcowe łączące klocki wzdłuż wózka
				add(fine(box(0.04, 0.04, wheelBase + 2 * R, springM, sx * 0.78, R - 0.12, bz)));
				// sprężyny kołyskowe (wagony, EZT) albo tłumik i cylinder hamulcowy (lokomotywa)
				if (kind === 'loco') {
					const cyl = new T.Mesh(CYL, dark);
					cyl.scale.set(0.24, 0.3, 0.24);
					cyl.rotation.x = Math.PI / 2;
					cyl.position.set(sx * (FX - 0.25), R + 0.2, bz);
					add(cyl);
				} else for (const dz of [-0.28, 0.28]) {
					const sp = new T.Mesh(SPRING_GEO, springM);
					sp.scale.set(0.3, 0.32, 0.3);
					sp.position.set(sx * (FX - 0.08), R + 0.28, bz + dz);
					add(sp);
				}
				add(beam(R + 0.05, bz - 0.55, R + 0.38, bz + 0.25, sx * (FX + 0.13), 0.06, springM));
			}
			// belka poprzeczna (z czopem skrętu) i poprzecznice przy osiach
			add(box(2.1, 0.26, 0.5, frame, 0, R + 0.24, bz));
			for (const dz of [-half + R + 0.25, half - R - 0.25]) add(box(2.0, 0.1, 0.12, frame, 0, R + 0.14, bz + dz));
			if (kind === 'loco') for (const dz of axles === 3 ? [-half + 0.55, 0.55, half - 0.55] : [-half + 0.55, half - 0.55]) add(box(1.1, 0.5, 0.55, dark, 0, R + 0.02, bz + dz)); // silniki trakcyjne
			for (const dz of AX) {
				const ws = new T.Group();
				ws.position.set(0, R, bz + dz);
				ws.userData.r = R;
				const axle = new T.Mesh(CYL, wheelMat);
				axle.scale.set(0.17, 1.9, 0.17);
				axle.rotation.z = Math.PI / 2;
				ws.add(axle);
				for (const x of [-0.75, 0.75]) {
					const w = new T.Mesh(WHEEL_GEO, wheelMat);
					// obrzeże (+y bryły) po wewnętrznej stronie toru
					w.scale.set(R, x > 0 ? 1 : -1, R);
					w.rotation.z = Math.PI / 2;
					w.position.x = x;
					ws.add(w);
					// jasna powierzchnia toczna (wytarta)
					const t2 = new T.Mesh(TREAD_GEO, tread);
					t2.scale.set(R * 2 + 0.005, 0.1, R * 2 + 0.005);
					t2.rotation.z = Math.PI / 2;
					t2.position.x = x - Math.sign(x) * 0.012;
					ws.add(t2);
					// znacznik obrotu na tarczy
					ws.add(box(0.03, 0.08, R * 0.9, mat('#8d9196'), x + Math.sign(x) * 0.075, 0, 0));
				}
				ws.traverse((o) => { o.castShadow = shadows; });
				group.add(ws);
				this.wheelsets.push(ws);
			}
		}

		/* Pantograf jednoramienny (oś z wzdłuż wagonu, pz – środek podstawy). Ramię dolne i górne liczone
		   z kinematyki tak, by ślizgacze dotykały przewodu jezdnego (raised) albo leżały na podporach (złożony).
		   Rama podstawy na izolatorach z kloszami, miech pneumatyczny, drążek prowadzący, tłumik, głowica
		   z dwiema nakładkami węglowymi na sprężynach i wygiętymi rogami. Zwraca miejsce styku z siecią. */
		pantograph(group, H, pz, raised) {
			const steel = matS('#3a3d41', { metalness: 0.75, roughness: 0.35 });
			const tubeM = matS('#c4c8cc', { metalness: 0.85, roughness: 0.28 });
			const dark = matS('#1c1c1c', { metalness: 0.3, roughness: 0.6 });
			const carbon = matS('#2a2a2c', { metalness: 0.2, roughness: 0.75 });
			const insul = matS('#d8cfbf', { roughness: 0.35, metalness: 0 });
			const copper = matS('#b87333', { metalness: 0.85, roughness: 0.35 });
			const parts = [];
			const add = (o) => { parts.push(o); group.add(o); return o; };
			const up = new T.Vector3(0, 1, 0), va = new T.Vector3(), vb = new T.Vector3();
			// rura między punktami (x, y, z) o promieniu r
			const tube = (x1, y1, z1, x2, y2, z2, r, m) => {
				va.set(x1, y1, z1);
				vb.set(x2, y2, z2);
				const len = va.distanceTo(vb);
				const t = new T.Mesh(CYL, m);
				t.scale.set(r * 2, len, r * 2);
				t.position.copy(va).add(vb).multiplyScalar(0.5);
				t.quaternion.setFromUnitVectors(up, vb.sub(va).normalize());
				return add(t);
			};
			const joint = (x, y, z, r, len, m) => {
				const j = new T.Mesh(CYL, m || steel);
				j.scale.set(r * 2, len, r * 2);
				j.rotation.z = Math.PI / 2;
				j.position.set(x, y, z);
				return add(j);
			};

			// izolatory wsporcze z kloszami
			const yb = H + 0.05;
			for (const [x, z] of [[-0.62, -0.75], [0.62, -0.75], [-0.62, 0.75], [0.62, 0.75]]) {
				add(box(0.16, 0.06, 0.16, steel, x, yb, pz + z));
				const core = new T.Mesh(CYL, insul);
				core.scale.set(0.09, 0.34, 0.09);
				core.position.set(x, yb + 0.2, pz + z);
				add(core);
				for (let k = 0; k < 3; k++) {
					const shed = new T.Mesh(CYL, insul);
					shed.scale.set(0.2, 0.025, 0.2);
					shed.position.set(x, yb + 0.1 + k * 0.1, pz + z);
					add(shed);
				}
			}
			// rama podstawy z kształtowników
			const yf = yb + 0.4;
			for (const x of [-0.62, 0.62]) add(box(0.09, 0.09, 1.75, steel, x, yf, pz));
			for (const z of [-0.75, 0.75]) add(box(1.33, 0.09, 0.09, steel, 0, yf, pz + z));
			add(box(1.2, 0.07, 0.09, steel, 0, yf, pz + 0.25));
			// podpory ślizgacza w pozycji złożonej (pod głowicą)
			for (const x of [-0.45, 0.45]) {
				tube(x, yf, pz - 0.48, x, yf + 0.11, pz - 0.48, 0.03, steel);
				add(box(0.16, 0.04, 0.12, dark, x, yf + 0.13, pz - 0.48));
			}

			// kinematyka: zawias ramienia dolnego A, głowica C, kolano B (odchylone w stronę +z)
			// zawias na jednym końcu ramy, głowica prawie nad nim – kolano wychodzi poziomo nad ramę
			const A = { y: yf + 0.12, z: pz - 0.62 };
			// raised: true/false albo położenie 0…1 (animacja podnoszenia – zob. setPanto)
			const hR = raised === true ? 1 : raised === false ? 0 : raised;
			const topY = yf + 0.36 + (WIRE - 0.035 - yf - 0.36) * hR;
			/* głowica: podniesiona – prawie nad zawiasem; opuszczona – wysunięta za zawias o różnicę długości ramion
			   (ramiona leżą wtedy płasko jedno na drugim, kolano nad ramą); pośrednio – płynnie między nimi.
			   Głowica stale nad zawiasem przy niskim położeniu wymuszałaby kolano pod zawiasem – w dachu */
			const L1 = 1.62, L2 = 1.78;
			const C = { y: topY - 0.16, z: A.z + 0.12 * hR - (L2 - L1 + 0.005) * (1 - hR) };
			const dy = C.y - A.y, dz = C.z - A.z, d = Math.min(L1 + L2 - 0.01, Math.max(L2 - L1 + 0.003, Math.hypot(dy, dz)));
			const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
			const ux = dz / d, uy = dy / d; // jednostkowy A→C w płaszczyźnie (z, y)
			const mz = A.z + ux * a, my = A.y + uy * a;
			// kolano po stronie dalszej od głowicy (prostopadła skierowana w +z)
			let Bz = mz - uy * h, By = my + ux * h;
			if (Bz < mz) { Bz = mz + uy * h; By = my - ux * h; }

			// zawias dolny i ramię dolne (dwie rury zbiegające się w kolanie)
			joint(0, A.y, A.z, 0.07, 0.62, steel);
			for (const x of [-0.24, 0.24]) tube(x, A.y, A.z, x * 0.25, By, Bz, 0.042, tubeM);
			tube(-0.24, A.y + 0.02, A.z - 0.05, 0.24, A.y + 0.02, A.z - 0.05, 0.02, tubeM);
			joint(0, By, Bz, 0.055, 0.22, steel);
			// ramię górne: dwie cienkie rury rozchodzące się do głowicy
			for (const x of [-0.06, 0.06]) tube(x, By, Bz, x * 4.2, C.y, C.z, 0.026, tubeM);
			// drążek prowadzący: od ramy do górnego ramienia tuż za kolanem
			const kz = Bz + (C.z - Bz) * 0.12, ky = By + (C.y - By) * 0.12;
			tube(0.18, yf + 0.05, A.z + 0.25, 0.12, ky - 0.04, kz, 0.016, steel);
			// miech pneumatyczny (napęd) i tłumik
			const bell = new T.Mesh(CYL, dark);
			bell.scale.set(0.22, 0.32, 0.22);
			bell.rotation.x = Math.PI / 2;
			bell.position.set(0, yf + 0.1, pz + 0.15);
			add(bell);
			const lz = A.z + (Bz - A.z) * 0.3, ly = A.y + (By - A.y) * 0.3;
			tube(0, yf + 0.1, pz - 0.02, 0, ly, lz, 0.022, steel);
			tube(-0.12, yf + 0.06, A.z + 0.45, -0.08, ly - 0.02, lz, 0.03, dark);

			// głowica: wahliwa belka, sprężyny, dwie nakładki węglowe, rogi
			const hy = topY, hz = C.z;
			add(box(0.62, 0.05, 0.08, steel, 0, C.y, hz));
			for (const s of [-1, 1]) {
				const sx = s * 0.26;
				tube(sx, C.y, hz, sx, hy - 0.06, hz - 0.15, 0.018, steel);
				tube(sx, C.y, hz, sx, hy - 0.06, hz + 0.15, 0.018, steel);
			}
			for (const sz of [-0.16, 0.16]) {
				add(box(1.5, 0.05, 0.06, tubeM, 0, hy - 0.04, hz + sz));
				add(box(1.3, 0.035, 0.05, carbon, 0, hy, hz + sz));
				// rogi: łuk w dół na obu końcach
				for (const s of [-1, 1]) {
					const pts = [[0.75, 0], [0.88, -0.03], [0.97, -0.1], [1.02, -0.2]];
					for (let k = 0; k < pts.length - 1; k++) {
						tube(s * pts[k][0], hy - 0.04 + pts[k][1], hz + sz, s * pts[k + 1][0], hy - 0.04 + pts[k + 1][1], hz + sz, 0.016, tubeM);
					}
				}
			}
			// przewód wysokiego napięcia od podstawy do aparatury dachowej
			tube(0.55, yf - 0.02, pz + 0.75, 0.55, H + 0.15, pz + 1.3, 0.025, copper);
			for (const o of parts) o.castShadow = this.shadows;
			return { y: hy, z: hz };
		}

		/* Pantograf nożycowy (EN57, EU07): podstawa na izolatorach, dwie ramy w kształcie rombu (ramiona dolne
		   z zawiasów na ramie, kolana na zewnątrz, ramiona górne zbiegające się pod głowicą), sprężyny podnoszące,
		   głowica z dwiema listwami ślizgowymi i rogami. Kolana liczone z długości ramion – po podniesieniu
		   ślizgacze dotykają przewodu, po opuszczeniu romb jest płaski. Zwraca miejsce styku z siecią. */
		pantographDiamond(group, H, pz, raised, color) {
			const steel = matS('#3a3d41', { metalness: 0.75, roughness: 0.35 });
			const tubeM = color ? matS(color, { metalness: 0.3, roughness: 0.4 }) : matS('#9aa0a6', { metalness: 0.8, roughness: 0.32 });
			const carbon = matS('#2a2a2c', { metalness: 0.2, roughness: 0.75 });
			const insul = matS('#d8cfbf', { roughness: 0.35, metalness: 0 });
			const copper = matS('#b87333', { metalness: 0.85, roughness: 0.35 });
			const parts = [];
			const add = (o) => { parts.push(o); group.add(o); return o; };
			const up = new T.Vector3(0, 1, 0), va = new T.Vector3(), vb = new T.Vector3();
			const tube = (x1, y1, z1, x2, y2, z2, r, m) => {
				va.set(x1, y1, z1);
				vb.set(x2, y2, z2);
				const t = new T.Mesh(CYL, m);
				t.scale.set(r * 2, va.distanceTo(vb), r * 2);
				t.position.copy(va).add(vb).multiplyScalar(0.5);
				t.quaternion.setFromUnitVectors(up, vb.sub(va).normalize());
				return add(t);
			};
			const yb = H + 0.05;
			for (const [x, z] of [[-0.6, -0.7], [0.6, -0.7], [-0.6, 0.7], [0.6, 0.7]]) {
				add(box(0.16, 0.06, 0.16, steel, x, yb, pz + z));
				const core = new T.Mesh(CYL, insul);
				core.scale.set(0.09, 0.3, 0.09);
				core.position.set(x, yb + 0.18, pz + z);
				add(core);
				for (let k = 0; k < 3; k++) {
					const shed = new T.Mesh(CYL, insul);
					shed.scale.set(0.2, 0.025, 0.2);
					shed.position.set(x, yb + 0.09 + k * 0.09, pz + z);
					add(shed);
				}
			}
			const yf = yb + 0.36;
			for (const x of [-0.6, 0.6]) add(box(0.09, 0.09, 1.6, steel, x, yf, pz));
			for (const z of [-0.7, 0.7]) add(box(1.29, 0.09, 0.09, steel, 0, yf, pz + z));
			const hR = raised === true ? 1 : raised === false ? 0 : raised;
			const topY = yf + 0.4 + (WIRE - 0.035 - yf - 0.4) * hR;
			const yA = yf + 0.08, yC = topY - 0.2, L = 0.95;
			const knees = [];
			for (const sd of [-1, 1]) {
				// zawias dolny po przeciwnej stronie środka (ramiona dolne krzyżują się jak nożyce), głowica nad środkiem
				// głowica ramienia pionowo nad zawiasem – przy każdej wysokości kolano wychodzi poziomo na zewnątrz
				// (opuszczony romb leży płasko nad ramą, nie wchodzi w dach)
				const Az = pz - sd * 0.15, Cz = Az;
				const dz = Cz - Az, dy = yC - yA, d = Math.min(2 * L - 0.01, Math.hypot(dz, dy));
				const a = d / 2, h = Math.sqrt(Math.max(0, L * L - a * a));
				const mz = Az + (dz / d) * a, my = yA + (dy / d) * a;
				// prostopadła do A→C; kolano po stronie zewnętrznej (dalej od środka pantografu)
				let Bz = mz - (dy / d) * h, By = my + (dz / d) * h;
				if (sd * (Bz - pz) < sd * (mz - pz)) { Bz = mz + (dy / d) * h; By = my - (dz / d) * h; }
				knees.push({ Az, Bz, By, Cz });
				for (const x of [-0.32, 0.32]) {
					tube(x, yA, Az, x, By, Bz, 0.034, tubeM);
					tube(x, By, Bz, x * 0.8, yC, Cz, 0.026, tubeM);
				}
				// zawias na ramie, oś kolana, sprężyna podnosząca
				const hinge = new T.Mesh(CYL, steel);
				hinge.scale.set(0.1, 0.8, 0.1);
				hinge.rotation.z = Math.PI / 2;
				hinge.position.set(0, yA, Az);
				add(hinge);
				tube(-0.32, By, Bz, 0.32, By, Bz, 0.022, steel);
				tube(sd * 0.0 + 0.45, yf, pz + sd * 0.15, 0.32, yA + (By - yA) * 0.35, Az + (Bz - Az) * 0.35, 0.02, steel);
				tube(-0.45, yf, pz + sd * 0.15, -0.32, yA + (By - yA) * 0.35, Az + (Bz - Az) * 0.35, 0.02, steel);
			}
			// głowica: belka poprzeczna na szczycie rombu, dwie listwy ślizgowe z rogami
			add(box(0.72, 0.05, 0.3, steel, 0, yC + 0.02, pz));
			for (const sd of [-1, 1]) tube(-0.26, yC + 0.02, pz, 0, topY - 0.06, pz + sd * 0.14, 0.015, steel);
			for (const sd of [-1, 1]) tube(0.26, yC + 0.02, pz, 0, topY - 0.06, pz + sd * 0.14, 0.015, steel);
			for (const sz of [-0.14, 0.14]) {
				add(box(1.45, 0.05, 0.06, tubeM, 0, topY - 0.04, pz + sz));
				add(box(1.2, 0.035, 0.05, carbon, 0, topY, pz + sz));
				for (const sd of [-1, 1]) {
					const pts = [[0.72, 0], [0.86, -0.04], [0.95, -0.12], [0.99, -0.22]];
					for (let k = 0; k < pts.length - 1; k++) tube(sd * pts[k][0], topY - 0.04 + pts[k][1], pz + sz, sd * pts[k + 1][0], topY - 0.04 + pts[k + 1][1], pz + sz, 0.015, tubeM);
				}
			}
			tube(0.6, yf - 0.02, pz + 0.7, 0.6, H + 0.15, pz + 1.2, 0.025, copper);
			for (const o of parts) o.castShadow = this.shadows;
			return { y: topY, z: pz };
		}

		/* Czołownica z zderzakami (płyta, tuleja, tłok, talerz), hakiem i sprzęgiem śrubowym (ogniwa, napinacz z rączką)
		   i przewodami hamulcowymi (rura, wąż, głowica) – lokomotywa, EZT i wagony. zt – płaszczyzna czoła. */
		buffers(add, zt, sgn, beamColor, central) {
			const metal = matS('#4f5358', { metalness: 0.75, roughness: 0.35 }), polish = matS('#8c9196', { metalness: 0.9, roughness: 0.22 });
			const black = mat('#1a1a1a'), hose = mat('#121212');
			add(box(2.75, 0.34, 0.12, mat(beamColor && beamColor[0] === '#' ? beamColor : '#1d1d1d'), 0, 1.15, zt + sgn * 0.05));
			if (central) {
				// zderzak centralny (EN57): skrzynia z prowadnicą, prostokątna płyta czołowa nad hakiem
				add(box(0.62, 0.5, 0.34, black, 0, 1.2, zt + sgn * 0.24));
				add(box(0.36, 0.3, 0.22, metal, 0, 1.2, zt + sgn * 0.5));
				add(box(0.7, 0.42, 0.06, black, 0, 1.2, zt + sgn * 0.63));
			}
			for (const x of central ? [] : [-0.88, 0.88]) {
				add(box(0.44, 0.44, 0.05, black, x, 1.15, zt + sgn * 0.12));
				// zderzak toczony: tuleja zwężająca się ku przodowi, trzon i talerz z wypukłą, wytartą twarzą
				add(turned(BUFFER_GEO, metal, x, 1.15, zt + sgn * 0.13, 1, 1, sgn));
				add(turned(BUFFER_FACE, polish, x, 1.15, zt + sgn * 0.658, 1, 1, sgn));
				// śruby płyty mocującej
				for (const bx of [-0.16, 0.16]) for (const by of [-0.16, 0.16]) add(fine(turned(CYL, metal, x + bx, 1.15 + by, zt + sgn * 0.155, 0.045, 0.03, sgn)));
			}
			// hak cięgłowy i sprzęg śrubowy (ogniwa zwisają, napinacz z rączką)
			add(box(0.14, 0.24, 0.42, metal, 0, central ? 0.9 : 1.12, zt + sgn * 0.3));
			add(box(0.1, 0.1, 0.14, metal, 0, central ? 1.0 : 1.22, zt + sgn * 0.52));
			for (const x of [-0.07, 0.07]) add(fine(beam(1.12, zt + sgn * 0.48, 0.92, zt + sgn * 0.62, x, 0.035, metal)));
			const tb = new T.Mesh(CYL, metal);
			tb.scale.set(0.09, 0.32, 0.09);
			tb.rotation.x = Math.PI / 2 - sgn * 0.4;
			tb.position.set(0, 0.9, zt + sgn * 0.7);
			add(fine(tb));
			add(fine(box(0.36, 0.03, 0.03, polish, 0, 0.9, zt + sgn * 0.72)));
			// przewody hamulcowe: rura z czołownicy, wąż w łuku, głowica (czerwony kurek – przewód główny, żółty – zasilający)
			for (const [x, col] of [[-0.42, '#b3261e'], [0.42, '#d9a514'], [-0.62, '#b3261e'], [0.62, '#d9a514']]) {
				if (Math.abs(x) > 0.5 && beamColor === 'coach') continue;
				add(fine(beam(1.0, zt + sgn * 0.08, 0.82, zt + sgn * 0.22, x, 0.05, metal)));
				add(fine(beam(0.82, zt + sgn * 0.22, 0.68, zt + sgn * 0.4, x, 0.06, hose)));
				add(fine(beam(0.68, zt + sgn * 0.4, 0.74, zt + sgn * 0.56, x, 0.06, hose)));
				add(fine(box(0.1, 0.08, 0.12, metal, x, 0.75, zt + sgn * 0.6)));
				add(fine(box(0.03, 0.03, 0.1, mat(col), x + 0.05, 0.8, zt + sgn * 0.56)));
			}
		}

		// pług: blacha w kształcie V w rzucie z góry (ostrze na osi), lekko pochylona, z płaskownikiem u dołu
		plough(add, zt, sgn, width, y) {
			const steel = matS('#26282b', { roughness: 0.6, metalness: 0.4 });
			const key = `plough|${width}`;
			let g = ploughGeos.get(key);
			if (!g) {
				const sh = new T.Shape(), hw = width / 2;
				// rzut z góry (x, z): tył prosty, przód w szpic
				sh.moveTo(-hw, 0);
				sh.lineTo(hw, 0);
				sh.lineTo(hw, 0.12);
				sh.lineTo(0, 0.42);
				sh.lineTo(-hw, 0.12);
				sh.closePath();
				g = new T.ExtrudeGeometry(sh, { depth: 0.46, bevelEnabled: false });
				g.rotateX(Math.PI / 2); // wytłoczenie w dół (y), kształt w (x, z)
				g.translate(0, 0.23, 0);
				g.userData.shared = true;
				ploughGeos.set(key, g);
			}
			const m = new T.Mesh(g, steel);
			m.scale.set(1, 1, sgn);
			m.position.set(0, y, zt + sgn * 0.02);
			m.rotation.x = -sgn * 0.12;
			add(m);
			add(box(width * 0.7, 0.06, 0.08, steel, 0, y - 0.2, zt + sgn * 0.3));
		}

		/* Burta ET22 (wg zdjęć ET22-886, ET22-128): w górnym rzędzie (na wysokości okien kabiny) tylko okienko i kratka
		   z żaluzjami pionowymi, niżej równy rząd siedmiu ciemnych żaluzji filtrów powietrza, pod dachem pas żaluzji
		   wzdłuż przedziału maszynowego. Układ na drugiej burcie – odwrócony (jak obrót lokomotywy). */
		sideET22(add, za, zb, st, glass, frameA) {
			const span = zb - za, grille = mat('#20262b'), slat = mat('#11161a'), roofM = matS(st.roof, { roughness: 0.55, metalness: 0.3 });
			for (const sx of [-1, 1]) {
				const x = sx * (HALF + 0.012), u = (f) => sx * (za + span * f);
				// rząd żaluzji filtrów
				const n = 7, w = 0.8, h = 0.76, y0 = 2.18;
				for (let k = 0; k < n; k++) {
					const z = sx * (za + 0.5 + ((span - 1.0) * (k + 0.5)) / n);
					add(box(0.03, h, w, grille, x, y0, z));
					for (let y = y0 - h / 2 + 0.06; y < y0 + h / 2 - 0.03; y += 0.075) add(fine(box(0.045, 0.03, w - 0.06, slat, x + sx * 0.008, y, z)));
					for (const dy of [-h / 2, h / 2]) add(box(0.05, 0.035, w + 0.05, frameA, x + sx * 0.01, y0 + dy, z));
					for (const dz of [-w / 2, w / 2]) add(box(0.05, h + 0.035, 0.035, frameA, x + sx * 0.01, y0, z + dz));
				}
				// okienko i kratka w górnym rzędzie
				const zw = u(0.16), zg = u(0.7);
				add(box(0.04, 0.5, 0.62, glass, x + sx * 0.01, 2.92, zw));
				add(box(0.035, 0.6, 0.72, mat('#1a1a1a'), x, 2.92, zw));
				add(box(0.03, 0.78, 1.0, grille, x, 2.88, zg));
				for (let z = zg - 0.44; z < zg + 0.45; z += 0.09) add(fine(box(0.045, 0.72, 0.03, slat, x + sx * 0.008, 2.88, z)));
				for (const dy of [-0.39, 0.39]) add(box(0.05, 0.035, 1.05, frameA, x + sx * 0.01, 2.88 + dy, zg));
				for (const dz of [-0.5, 0.5]) add(box(0.05, 0.81, 0.035, frameA, x + sx * 0.01, 2.88, zg + dz));
				// pas żaluzji pod dachem (na łuku dachu, prawie pionowo)
				const L = span + 0.6, bx = sx * 1.43, by = 3.62;
				const band = box(0.03, 0.22, L, grille, bx, by, 0);
				band.rotation.z = -sx * 0.12;
				add(band);
				for (let z = -L / 2 + 0.05; z < L / 2; z += 0.1) {
					const sl = fine(box(0.05, 0.2, 0.03, roofM, bx + sx * 0.01, by, z));
					sl.rotation.set(0, sx * 0.5, -sx * 0.12);
					add(sl);
				}
			}
		}

		/* tarcza końca pociągu (wagony towarowe): biały kwadrat podzielony przekątnymi – trójkąty górny i dolny czerwone
		   (odblaskowe – w nocy świecą w świetle reflektorów), na uchwycie */
		endPlate(group, x, y, z) {
			if (!END_PLATE_GEO) {
				const g = new T.BufferGeometry(), a = 0.16;
				g.setAttribute('position', new T.Float32BufferAttribute([-a, a, 0, 0, 0, 0, a, a, 0, -a, -a, 0, a, -a, 0, 0, 0, 0], 3));
				g.computeVertexNormals();
				g.userData.shared = true;
				END_PLATE_GEO = g;
			}
			group.add(box(0.33, 0.33, 0.03, mat('#e8e8e4'), x, y, z));
			const red = new T.Mesh(END_PLATE_GEO, this.tailMat);
			red.position.set(x, y, z + 0.02);
			group.add(red);
			group.add(box(0.05, 0.25, 0.05, mat('#232426'), x, y - 0.25, z - 0.02));
		}

		/* zgarniacze pod zderzakami (EU07, ET22): dwie blachy pochylone dołem do przodu i odchylone na zewnątrz, na
		   wspornikach z czołownicy, u dołu listwa */
		ploughPair(add, zt, sgn) {
			const steel = matS('#26282b', { roughness: 0.6, metalness: 0.4 });
			for (const sx of [-1, 1]) {
				const x = sx * 0.86, z = zt + sgn * 0.42;
				const pl = box(0.74, 0.5, 0.05, steel, x, 0.5, z);
				pl.rotation.set(-sgn * 0.28, sgn * sx * 0.32, 0);
				add(pl);
				add(box(0.7, 0.06, 0.09, steel, x - sx * 0.02, 0.27, z + sgn * 0.07));
				for (const dx of [-0.22, 0.22]) add(box(0.06, 0.42, 0.06, steel, x + dx, 0.85, zt + sgn * 0.3));
			}
		}

		/* Wnętrze kabiny widoczne z zewnątrz przez szyby: podłoga, ściany, sufit z lampą, ściana tylna z drzwiami, pulpit
		   z ekranami, fotel maszynisty po lewej stronie (w kierunku jazdy), a w kabinie prowadzącej maszynista
		   (granatowy mundur, czapka). Grupa – w widoku z kabiny gracza ukrywana (tam jest pełne wnętrze z cab.js). */
		cabRoom(group, kind, st, H, hl, sgn, driver) {
			const M = this.inMats, room = new T.Group();
			const depth = st.nose * 0.45 + 2.45, zb = sgn * (hl - depth);
			// ściany i sufit do początku skosu czoła (przy pochylonym czole nie wystają przez szybę)
			const zf = sgn * (hl - st.nose - 0.05), zc = (zf + zb) / 2, d2 = Math.abs(zf - zb);
			const FL = 1.35, TOP = 3.45;
			const part = (w, h, d, m, x, y, z) => { room.add(box(w, h, d, m, x, y, z)); };
			const wallM = this.cabWallM || (this.cabWallM = (() => { const m = new T.MeshLambertMaterial({ color: '#5d646b', emissive: '#ffffff', emissiveIntensity: 0.04 }); this.ownMats.push(m); return m; })());
			part(2.6, 0.05, depth - 0.3, M.floor, 0, FL, sgn * (hl - (depth + 0.3) / 2));
			part(2.6, 0.05, d2, wallM, 0, TOP, zc);
			for (const sx of [-1, 1]) part(0.05, TOP - FL, d2, wallM, sx * 1.33, (FL + TOP) / 2, zc);
			part(2.6, TOP - FL, 0.06, wallM, 0, (FL + TOP) / 2, zb);
			part(0.8, 2.0, 0.07, M.seatFrame, 0.55 * -sgn, FL + 1.0, zb - sgn * 0.01);
			part(1.4, 0.03, 0.25, M.lamp, 0, TOP - 0.03, zc);
			// pulpit pod szybami: korpus, skośny blat z ekranami, nastawnik
			const zd = sgn * (hl - st.nose * 0.45 - 0.45);
			const dark = mat('#3c4248', { indoor: true }), scr = mat('#1b3a4a', { emissive: '#2c6b86', indoor: true });
			part(2.5, 0.85, 0.6, dark, 0, FL + 0.43, zd);
			const top = box(2.5, 0.05, 0.62, dark, 0, FL + 0.9, zd + sgn * 0.05);
			top.rotation.x = sgn * 0.35;
			room.add(top);
			for (const x of [-0.75, -0.3]) part(0.38, 0.24, 0.03, scr, sgn * x, FL + 1.02, zd - sgn * 0.14);
			part(0.1, 0.18, 0.1, mat('#222', { indoor: true }), sgn * 0.15, FL + 1.0, zd - sgn * 0.05);
			// fotel maszynisty (po lewej w kierunku jazdy)
			const xs = sgn * 0.5, zs = zd - sgn * 0.85;
			// fotel jak w wagonach (powiększony), kolumna fotela
			const SG = NS.props.seatGeos(), yaw = sgn > 0 ? Math.PI : 0;
			for (const [g2, m2] of [[SG.soft, M.seat], [SG.hard, M.seatFrame]]) {
				const sm = new T.Mesh(g2, m2);
				sm.scale.setScalar(1.2);
				sm.rotation.y = yaw;
				sm.position.set(xs, FL + 0.6, zs);
				room.add(sm);
			}
			part(0.1, 0.5, 0.1, M.seatFrame, xs, FL + 0.27, zs);
			if (driver) {
				// maszynista: model człowieka w pozie siedzącej z rękami na pulpicie, granatowy mundur, czapka z daszkiem
				const DP = NS.props.driverPeople(), dg = new T.Group();
				dg.rotation.y = yaw;
				dg.position.set(xs, FL + 0.6 - 0.48, zs - sgn * 0.06);
				dg.add(new T.Mesh(DP.body, this.driverUni || (this.driverUni = (() => { const m = new T.MeshLambertMaterial({ color: '#25365c', vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.05 }); this.ownMats.push(m); return m; })())));
				dg.add(new T.Mesh(DP.head, this.driverSkin || (this.driverSkin = (() => { const m = new T.MeshLambertMaterial({ color: '#e2b48f', vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.05 }); this.ownMats.push(m); return m; })())));
				const capM = mat('#1a2440', { indoor: true });
				const crown = new T.Mesh(CYL, capM);
				crown.scale.set(0.23, 0.08, 0.25);
				crown.position.set(0, 1.79 - 0.35 + 0.02, 0.01);
				dg.add(crown);
				const peak = box(0.18, 0.015, 0.08, mat('#0d0d0d', { indoor: true }), 0, 1.79 - 0.35 - 0.02, -0.12);
				dg.add(peak);
				room.add(dg);
			}
			room.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
			group.add(room);
			return room;
		}

		/* Wycieraczka dopasowana do szyby (promienie na bryłę pudła this.curBody, materiał 4 – szyba): od punktu
		   (px, yGuess) mierzony zasięg szyby w pionie i poziomie – oś na środku szyby, tuż za jej krawędzią
		   (dolną albo – top – górną), na pudle; promień końca pióra jak największy (do przeciwległej krawędzi,
		   maxR – limit, np. SM42 z szybą zasłoniętą maską), kąt pracy ograniczony tak, by koniec pióra nie
		   wychodził za boczne krawędzie szyby. Płaszczyzna (u, v, n – n na zewnątrz) z punktów pudła; grupa G na
		   niej, R obraca się wokół n: kąt 0 – pióro poziomo w stronę środka czoła, praca od a0 do a1.
		   Części: oś z kołpakiem i podstawą, ramię, pióro (ramka i guma), zacisk, jarzma. */
		addWiper(group, sgn, hl, px, yGuess, top, maxR = Infinity) {
			const body = this.curBody;
			if (!body) return;
			body.updateMatrixWorld(true);
			const proxy = wiperProxy(body, sgn, hl);
			if (!proxy) return;
			const rc = new T.Raycaster(), dir = new T.Vector3(0, 0, -sgn);
			const cast = (x, y) => {
				const msh = proxy.at(x, y);
				if (!msh) return undefined;
				rc.set(new T.Vector3(x, y, sgn * (hl + 40)), dir);
				return rc.intersectObject(msh, false)[0];
			};
			const hitAt = (x, y) => { const h = cast(x, y); return h ? h.point.clone() : null; };
			const glassAt = (x, y) => { const h = cast(x, y); return !!h && h.face && h.face.materialIndex === 4; };
			if (!glassAt(px, yGuess)) return;
			const st = 0.012;
			const run = (x0, y0, dx, dy0) => { let k = 0; while (k < 250 && glassAt(x0 + dx * (k + 1), y0 + dy0 * (k + 1))) k++; return k; };
			let yB = yGuess - run(px, yGuess, 0, -st) * st, yT = yGuess + run(px, yGuess, 0, st) * st;
			const ymid = (yB + yT) / 2;
			const xl = px - run(px, ymid, -st, 0) * st, xr = px + run(px, ymid, st, 0) * st;
			const cx = (xl + xr) / 2;
			yB = ymid - run(cx, ymid, 0, -st) * st;
			yT = ymid + run(cx, ymid, 0, st) * st;
			// oś przy zewnętrznym narożniku szyby (przy krawędzi kabiny), 12 cm od bocznej krawędzi
			// (narożnik po stronie żądanej wycieraczki – na wspólnej szerokiej szybie dawniej obie trafiały w ten sam róg, np. 48WE, ST44)
			const xo = Math.abs(cx) < 0.3 ? (px < 0 ? xl : xr) : Math.abs(xl) > Math.abs(xr) ? xl : xr, ox = xo - Math.sign(xo) * 0.12;
			// oś 8 cm za krawędzią szyby (na pudle), linia pióra 4 cm w głąb szyby
			const sg = top ? -1 : 1, edge = top ? yT : yB, far = top ? yB : yT;
			const P0 = hitAt(ox, edge - sg * 0.08), E = hitAt(ox, edge + sg * 0.04), A = hitAt(cx, far - sg * 0.03);
			const B = hitAt(ox - Math.sign(xo) * 0.3, edge - sg * 0.08);
			if (!P0 || !E || !A || !B) return;
			const v = A.clone().sub(P0);
			v.x = 0;
			v.normalize();
			const w0 = B.clone().sub(P0);
			w0.addScaledVector(v, -w0.dot(v)).normalize();
			const n = new T.Vector3().crossVectors(v, w0).normalize();
			if (n.z * sgn < 0) n.negate();
			const u = new T.Vector3().crossVectors(v, n).normalize();
			const s = Math.sign(-ox * u.x) || 1; // kierunek do środka czoła w osi u
			const dy = Math.max(0.06, E.clone().sub(P0).dot(v)); // pióro przesunięte od osi na szybę
			// koniec pióra: w spoczynku leży poziomo wzdłuż krawędzi szyby (do przeciwległego boku), w pracy dochodzi
			// do pionu – jak najdalej, ile pozwala wysokość szyby; bez wyjścia za zewnętrzny bok szyby
			const wAvail = xr - xl - 0.16, hAvail = A.clone().sub(P0).dot(v);
			// (szyba węższa niż jej wysokość – pióro sięga przeciwległej krawędzi, a w spoczynku jest pochylone)
			const r = Math.max(dy + 0.15, Math.min(hAvail, maxR));
			const L = Math.sqrt(Math.max(0.01, r * r - dy * dy)) / 0.9;
			const tipOff = Math.atan2(dy, 0.9 * L);
			const a0 = Math.max(0, Math.acos(Math.min(1, Math.hypot(wAvail, dy) / r)) - tipOff);
			const a1 = Math.max(a0 + 0.5, Math.acos(Math.max(-1, Math.min(1, -0.08 / r))) - tipOff);
			const G = new T.Group();
			G.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(u, v, n));
			G.position.copy(P0).addScaledVector(n, 0.012);
			const R = new T.Group();
			G.add(R);
			const blk = mat('#121314', { roughness: 0.6 }), rub = mat('#0a0a0a', { roughness: 0.9 }), frm = matS('#2b2d30', { metalness: 0.6, roughness: 0.4 });
			// oś z podstawą na pudle
			const cap = new T.Mesh(CYL, blk);
			cap.scale.set(0.06, 0.05, 0.06);
			cap.rotation.x = Math.PI / 2;
			cap.position.z = 0.025;
			R.add(cap);
			const base = new T.Mesh(CYL, frm);
			base.scale.set(0.09, 0.02, 0.09);
			base.rotation.x = Math.PI / 2;
			base.position.z = 0.004;
			G.add(base);
			// ramię: ukośnie od osi do końca pióra na szybie
			const ax = s * L * 0.9, al = Math.hypot(ax, dy);
			const armM = box(al, 0.022, 0.016, blk, ax / 2, dy / 2, 0.05);
			armM.rotation.z = Math.atan2(dy, ax);
			R.add(armM);
			R.add(box(0.035, 0.03, 0.04, blk, ax, dy, 0.036)); // zacisk
			R.add(box(L * 0.84, 0.016, 0.014, frm, s * L * 0.5, dy, 0.026)); // ramka pióra
			R.add(box(L * 0.86, 0.008, 0.016, rub, s * L * 0.5, dy, 0.01)); // guma
			for (const x of [0.17, 0.5, 0.83]) R.add(box(0.012, 0.016, 0.03, frm, s * L * x, dy, 0.034)); // jarzma
			R.traverse((o) => { if (o.isMesh) o.castShadow = true; });
			group.add(G);
			R.rotation.z = s * a0; // położenie spoczynkowe
			const W = { car: this.curCarIdx, sgn, G, R, s, L, dy, r, a0, a1 };
			/* druga wycieraczka tego samego czoła, której pióro w spoczynku przecina pióro pierwszej (długie pióra na
			   wspólnej szybie, np. Elf, ED250): ta leży wyżej – kąt spoczynku podniesiony o tyle, by pióra się nie
			   przecinały (z odstępem 5 cm); pierwsza – dolna (rusza później, wraca wcześniej – updateWipers) */
			const other = this.wiperSets.find((o) => o.car === W.car && o.sgn === W.sgn && o.G.position.distanceTo(G.position) > 0.05);
			if (other) {
				const seg = (w, a) => {
					const D = new T.Vector3(w.s * Math.cos(a), Math.sin(a), 0), N = new T.Vector3(w.s * Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2), 0);
					return [0.1, w.r].map((t) => new T.Vector3().addScaledVector(D, t).addScaledVector(N, w.dy).applyQuaternion(w.G.quaternion).add(w.G.position));
				};
				const near = (a, b) => {
					// odległość odcinków (w płaszczyźnie czoła x–y; szyba prawie pionowa)
					const d2 = (p, q1, q2) => { const ux = q2.x - q1.x, uy = q2.y - q1.y, L2 = ux * ux + uy * uy || 1e-9, t = Math.max(0, Math.min(1, ((p.x - q1.x) * ux + (p.y - q1.y) * uy) / L2)); return Math.hypot(p.x - q1.x - ux * t, p.y - q1.y - uy * t); };
					const cr = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
					if (cr(b[0], b[1], a[0]) * cr(b[0], b[1], a[1]) < 0 && cr(a[0], a[1], b[0]) * cr(a[0], a[1], b[1]) < 0) return 0;
					return Math.min(d2(a[0], b[0], b[1]), d2(a[1], b[0], b[1]), d2(b[0], a[0], a[1]), d2(b[1], a[0], a[1]));
				};
				if (near(seg(W, W.a0), seg(other, other.a0)) < 0.05) {
					let a = W.a0;
					while (a < W.a0 + 0.6 && near(seg(W, a), seg(other, other.a0)) < 0.05) a += 0.01;
					W.a0 = a;
					W.a1 = Math.max(W.a1, a + 0.5);
					R.rotation.z = s * W.a0;
					other.lower = true;
				}
			}
			this.wiperSets.push(W);
		}

		// czoło kabiny: reflektory, światła końcowe, sprzęg, pług, wycieraczki; sgn −1 = przód (−z), +1 = tył
		// role: 'front' – czoło pociągu (białe światła), 'rear' – koniec składu (czerwone), 'none' – zgaszone
		cabEnd(group, add, kind, st, H, hl, sgn, role) {
			const zt = sgn * hl;
			const dark = mat('#1e1e1e'), metal = matS('#5a5e63', { metalness: 0.7, roughness: 0.35 });
			const lens = matS('#c9ccd0', { roughness: 0.1, metalness: 0.5 }), redLens = mat('#4a1210');
			const head = role === 'front' ? this.headMat : lens, tail = role === 'rear' ? this.tailMat : redLens;
			if (st.split) this.flatFront(group, add, kind, st, H, hl, sgn);
			const chrome = matS('#c9ccd0', { metalness: 0.95, roughness: 0.18 });
			const hx = st.headX || 0.9;
			// czoło opływowe: narożniki cofnięte (jak w loftBody) – światła osadzone na powierzchni czoła
			const rec = (x) => (st.modern ? (st.round ?? 0.85) * Math.pow(Math.min(1, Math.abs(x) / 0.9 / HALF), 2.4) : 0);
			for (const x of [-hx, hx]) {
				if (st.twinLamp) {
					/* lampa dwukomorowa (EU07): obudowa z chromowaną obręczą, wewnątrz jasna czasza odbłyśnika, klosz światła
					   białego (wyżej, bliżej osi) i mały czerwony (niżej, na zewnątrz) */
					const r0 = st.headR || 0.17, ly = st.headY || 1.7, z0 = zt - sgn * rec(x), sx = Math.sign(x);
					add(turned(LAMP_GEO, dark, x, ly, z0 - sgn * 0.03, r0 + 0.05, 0.12, sgn));
					add(turned(RING_GEO, chrome, x, ly, z0 + sgn * 0.092, r0 + 0.025, r0 + 0.03, sgn));
					add(turned(CYL, matS('#b9bdc2', { metalness: 0.9, roughness: 0.3 }), x, ly, z0 + sgn * 0.07, 2 * r0, 0.01, sgn));
					group.add(turned(LENS_GEO, head, x - sx * 0.045, ly + 0.045, z0 + sgn * 0.074, 0.105, 0.2, sgn));
					group.add(turned(LENS_GEO, tail, x + sx * 0.085, ly - 0.085, z0 + sgn * 0.074, 0.055, 0.2, sgn));
					continue;
				}
				// reflektor: obudowa, chromowana obręcz, klosz (świeci); obok światło końcowe w mniejszej obudowie
				for (const [lx, ly, r0, m] of [[x, st.headY || 1.62, st.headR || 0.15, head], [x * 1.13, st.tailY || 1.32, 0.1, tail]]) {
					// obudowa toczona (wypukły tył, kołnierz), chromowana obręcz, wypukły klosz
					const z0 = zt - sgn * rec(lx);
					add(turned(LAMP_GEO, dark, lx, ly, z0 - sgn * 0.03, r0 + 0.05, 0.1, sgn));
					add(turned(RING_GEO, chrome, lx, ly, z0 + sgn * 0.072, r0 + 0.025, r0 + 0.025, sgn));
					group.add(turned(LENS_GEO, m, lx, ly, z0 + sgn * 0.066, r0, r0, sgn));
					}
					}
					if (st.modern) {
						// pas LED (ciemna listwa) między reflektorami
						add(box(2 * hx - 0.5, 0.07, 0.03, mat('#15181b'), 0, st.headY || 1.9, zt - sgn * rec(hx * 0.5) + sgn * 0.015));
					}
			// poręcze przy narożnikach czoła i stopnie pod nimi
			const rail = matS('#c9ccd0', { metalness: 0.85, roughness: 0.3 });
			for (const x of st.modern ? [] : [-1.25, 1.25]) {
				const hr = new T.Mesh(CYL, rail);
				hr.scale.set(0.04, 0.75, 0.04);
				hr.position.set(x, 1.85, zt + sgn * 0.05);
				add(hr);
				for (const yy of [1.48, 2.22]) add(box(0.04, 0.04, 0.1, rail, x, yy, zt + sgn * 0.02));
				add(box(0.42, 0.04, 0.24, matS('#3a3d41', { metalness: 0.5, roughness: 0.5 }), x * 0.98, 0.78, zt + sgn * 0.14));
			}
			// górny reflektor nad szybą
			// duży reflektor (ST44): na czole tuż nad szybami, w obudowie wystającej przed czoło
			const tL = st.bigLamp ? ((st.glassT || 0.74) + 0.4) / 2 : 0.12, yL = H;
			const pTop = nosePoint(st, H, tL, 0, yL);
			const zL = sgn * (hl - st.nose * (1 - tL) + (st.bigLamp ? 0.1 : 0));
			const tilt = st.bigLamp ? 0.25 : 0.6;
			if (st.roofLamp) {
				/* reflektor na dachu nad czołem (EU07, ET22, EN57): toczona obudowa na podstawie, chromowana obręcz, klosz;
				   po bokach syreny (lokomotywy) – trąbki skierowane do przodu */
				const r0 = 0.17, D = 0.3, zc = sgn * (hl - st.nose * 0.88) + sgn * (st.vfront ? 0.02 : 0.06);
				// wysokość dachu pod reflektorem – promień w dół na bryłę pudła (czoło zaokrąglone, dach niżej niż H)
				let yr = H - 0.1;
				if (this.curBody) {
					this.curBody.updateMatrixWorld(true);
					const hit = new T.Raycaster(new T.Vector3(0, H + 2, zc - sgn * 0.05), new T.Vector3(0, -1, 0)).intersectObject(this.curBody, false)[0];
					if (hit) yr = hit.point.y;
				}
				const yc = yr + r0 + 0.04;
				add(box(0.3, yc - yr, 0.34, dark, 0, (yr + yc) / 2 - 0.02, zc - sgn * 0.05));
				add(turned(LAMP_GEO, dark, 0, yc, zc - sgn * D / 2, r0 + 0.05, D, sgn));
				add(turned(RING_GEO, chrome, 0, yc, zc + sgn * (D / 2 + 0.002), r0 + 0.03, r0 + 0.03, sgn));
				group.add(turned(LENS_GEO, head, 0, yc, zc + sgn * (D / 2 - 0.008), r0, 0.35, sgn));
				if (kind === 'loco' || kind === 'cargo') {
					const hornM = matS('#55595e', { metalness: 0.75, roughness: 0.35 });
					for (const sx of [-1, 1]) {
						add(box(0.08, 0.16, 0.08, dark, sx * 0.4, yr + 0.06, zc - sgn * 0.15));
						add(turned(HORN_GEO, hornM, sx * 0.4, yr + 0.15, zc - sgn * 0.4, 0.075, 0.42, sgn));
					}
				}
			} else {
			const top = new T.Mesh(CYL, head);
			top.scale.set(st.bigLamp ? 0.4 : 0.22, 0.08, st.bigLamp ? 0.4 : 0.22);
			if (st.bigLamp) {
				const hous = new T.Mesh(CYL, dark);
				hous.scale.set(0.52, 0.3, 0.52);
				hous.rotation.x = Math.PI / 2 - sgn * tilt;
				hous.position.set(0, pTop.y - 0.05, zL - sgn * 0.12);
				add(hous);
			}
			top.rotation.x = Math.PI / 2 - sgn * tilt;
			top.position.set(0, pTop.y - 0.05, zL + sgn * (st.bigLamp ? 0.04 : 0));
			group.add(top);
			}
			// wycieraczki: oś u dołu szyby, ramię i pióro (rama + guma) na płaszczyźnie dopasowanej do szyby
			if (st.vfront) {
				// EN57/EN71 starszego typu – wycieraczki zawieszone u góry szyb, zmodernizowane i ED72 – u dołu
				for (const x of [-0.76, 0.76]) this.addWiper(group, sgn, hl, x, 2.8, !!st.wiperTop);
			} else {
				const yLow = noseCenter(st, H, hl, sgn, 0.96).y + 0.04, yHigh = noseCenter(st, H, hl, sgn, Math.min(0.9, (st.glassT || 0.55) + 0.12)).y;
				const px = st.panes === 3 ? 0.8 : 0.6;
				for (const x of [-px, px]) this.addWiper(group, sgn, hl, x, (yLow + yHigh) / 2, !!st.wiperTop);
			}
			if (st.modern) {
				/* nowoczesne EZT: sprzęg Scharfenberga wysunięty z wnęki w czole, pod nim owiewka (zgarniacz) w kolorze
				   fartucha – zwęża się ku narożnikom jak czoło */
				const ap = mat(st.apron || '#24292e');
				add(box(0.9, 0.5, 0.2, mat('#121314'), 0, 1.05, zt + sgn * 0.02));
				const c = new T.Mesh(CYL, metal);
				c.scale.set(0.22, 0.6, 0.22);
				c.rotation.x = Math.PI / 2;
				c.position.set(0, 1.0, zt + sgn * 0.3);
				add(c);
				add(box(0.42, 0.36, 0.22, metal, 0, 1.0, zt + sgn * 0.64));
				add(box(0.3, 0.2, 0.04, mat('#121314'), 0, 1.0, zt + sgn * 0.76));
				// owiewka tuż pod czołem (cofnięta jak narożniki), dolna część lekko pochylona do przodu, zgarniacz u dołu
				add(box(2.4, 0.36, 0.2, ap, 0, 0.88, zt - sgn * (rec(1.0) + 0.1)));
				const sk = box(2.0, 0.34, 0.14, ap, 0, 0.56, zt - sgn * (rec(0.8) + 0.02));
				sk.rotation.x = -sgn * 0.25;
				add(sk);
				add(box(1.7, 0.05, 0.12, matS('#26282b', { roughness: 0.6, metalness: 0.4 }), 0, 0.4, zt + sgn * 0.02));
			} else if (st.scharfenberg) {
				// sprzęg samoczynny Scharfenberga w osłonie i owiewka z pługiem
				const c = new T.Mesh(CYL, metal);
				c.scale.set(0.32, 0.8, 0.32);
				c.rotation.x = Math.PI / 2;
				c.position.set(0, 1.0, zt + sgn * 0.35);
				add(c);
				add(box(0.5, 0.4, 0.3, metal, 0, 1.0, zt + sgn * 0.75));
				const plough = box(2.7, 0.55, 0.35, mat('#2a2a2a'), 0, 0.5, zt + sgn * 0.05);
				plough.rotation.x = -sgn * 0.35;
				add(plough);
			} else {
				// zderzaki, sprzęg śrubowy, przewody hamulcowe, pług
				this.buffers(add, zt - sgn * 0.2, sgn, st.head || '#1d1d1d', st.central); // talerze 0,46 m przed czołem – stykają się z wagonem
				if (st.plough === 'pair') this.ploughPair(add, zt, sgn);
				else this.plough(add, zt, sgn, st.ploughW || 2.5, st.ploughW ? 0.36 : 0.42); // EN57 – węższy i niższy
			}
		}

		/* Płaskie czoło (EN57, EU07): słupek dzielący szybę na dwie, rama szyby, pas pod szybą w kolorze górnej
		   części pudła (EN57), tabliczka z numerem, osłona sprzęgu. Pas jest wygięty jak czoło (narożniki cofnięte). */
		flatFront(group, add, kind, st, H, hl, sgn) {
			const nl = st.nose, round = st.round ?? 0.85;
			const kTop = 1 - 0.28 / Math.max(0.5, H - st.yb);
			const frame = mat('#1a1a1a');
			const at = (tt) => {
				const t = Math.pow(tt, 0.9);
				return { y: st.yb + (H - st.yb) * (1 - kTop * Math.pow(t, 1.25)), z: sgn * (hl - nl * (1 - tt)) };
			};
			// słupek środkowy wzdłuż skośnej szyby
			const a = at(1), b = at(Math.max(0.6, st.glassT || 0));
			// słupek środkowy (dwie szyby); przy trzech szybach ramy i słupki są malowane na bryle pudła (równo z szybą)
			/* słupek między dwiema szybami: krótkie odcinki wzdłuż krzywizny czoła, tuż nad powierzchnią (prosta belka
			   między końcami odstawała od wygiętego czoła); przy trzech szybach słupki są malowane na bryle */
			if (st.panes !== 3) {
				const mm = paint(kind === 'ezt' ? st.stripe : st.paint), N = 10, t0 = Math.max(0.6, st.glassT || 0);
				let p0 = at(t0);
				for (let k = 1; k <= N; k++) {
					const p1 = at(t0 + ((1 - t0) * k) / N);
					const y1 = p0.y + 0.012, z1 = p0.z + sgn * 0.012, y2 = p1.y + 0.012, z2 = p1.z + sgn * 0.012;
					const seg = box(0.11, Math.hypot(z2 - z1, y2 - y1) + 0.01, 0.025, mm, 0, (y1 + y2) / 2, (z1 + z2) / 2); // płaski pasek
					seg.rotation.x = Math.atan2(z2 - z1, y2 - y1);
					group.add(seg);
					p0 = p1;
				}
			}
			// pas wygięty jak czoło: wierzchołki na powierzchni przekroju czołowego (x ściśnięte o 10%, narożniki cofnięte)
			const strip = (y0, y1, material, xMax) => {
				const pos = [], idx = [], N = 16;
				for (let k = 0; k <= N; k++) {
					const xf = -xMax + (2 * xMax * k) / N;
					const xo = Math.abs(xf) / 0.9;
					const z = sgn * (hl - round * Math.pow(Math.min(1, xo / HALF), 2.4) + 0.012);
					pos.push(xf, y0, z, xf, y1, z);
				}
				for (let k = 0; k < N; k++) {
					const a0 = k * 2, b0 = k * 2 + 2;
					if (sgn > 0) idx.push(a0, b0, b0 + 1, a0, b0 + 1, a0 + 1);
					else idx.push(a0, b0 + 1, b0, a0, a0 + 1, b0 + 1);
				}
				const g = new T.BufferGeometry();
				g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
				g.setIndex(idx);
				g.computeVertexNormals();
				const m = new T.Mesh(g, material);
				m.userData.ownGeometry = true;
				return add(m);
			};
			if (kind === 'ezt') {
				// EN57: czarny fartuch u dołu czoła; wyświetlacz kierunkowy (pomarańczowe diody) na szarym pasie nad szybami
				strip(BOTTOM + 0.01, 1.45, paint(st.apron), 0.9 * HALF - 0.02);
				const dm = this.displayMat || (this.displayMat = new T.MeshBasicMaterial({ map: displayTexture((this.destination || 'OSOBOWY').toUpperCase()) }));
				if (!this.ownMats.includes(dm)) this.ownMats.push(dm);
				const disp = new T.Mesh(new T.PlaneGeometry(1.0, 0.16), dm);
				disp.userData.ownGeometry = true;
				disp.position.set(0, 3.5, sgn * (hl + 0.025));
				if (sgn < 0) disp.rotation.y = Math.PI;
				group.add(disp);
				group.add(box(1.1, 0.24, 0.04, frame, 0, 3.5, sgn * (hl + 0.0)));
			} else {
				strip(st.yb + 0.0, st.yb + 0.08, frame, 0.9 * 1.37);
				// EU07: czoło żółte od dołu do pasa szyb, nad nim jasnozielony pas
				if (st.front) {
					strip(BOTTOM + 0.01, st.yb - 0.16, paint(st.front), 0.9 * HALF - 0.02);
					strip(st.yb - 0.16, st.yb + 0.0, paint(st.paint), 0.9 * HALF - 0.02);
				}
				// pas z burt przechodzi przez czoło (EP09, ET22, ST44, SU46)
				if (st.belt && st.belt[1] < st.yb) strip(st.belt[0], st.belt[1], paint(st.stripe), 0.9 * HALF - 0.02);
			}
			if (kind === 'ezt') {
				// EN57: białe numery na granacie (numer UIC nad lewym reflektorem, oznaczenie pojazdu u dołu)
				const nr = 1000 + Math.floor(hash(this.seed * 3.3) * 999);
				const vn = this.curNum ? this.curNum : `${st.prefix || 'EN57'}-${nr}`;
				for (const [txt, y, w] of [[`2 120 ${100 + (nr % 900)}-${nr % 10}`, 2.0, 1.0], [`${vn}${sgn < 0 ? 'ra' : 'rb'}`, 1.6, 0.9]]) {
					const m = new T.MeshStandardMaterial({ map: sideTextTexture(txt, st.paint, '#f2f2f2', 256, 64, 40), roughness: 0.5, transparent: true, alphaTest: 0.3 });
					m.userData.shared = false;
					this.ownMats.push(m);
					const pl = new T.Mesh(new T.PlaneGeometry(w, w / 4), m);
					pl.userData.ownGeometry = true;
					pl.position.set(-sgn * 0.12, y, sgn * (hl + 0.02)); // między reflektorami
					if (sgn < 0) pl.rotation.y = Math.PI;
					group.add(pl);
				}
				return;
			}
			// tabliczka z numerem pod szybą
			const num = this.curNum || (kind === 'ezt' ? `${st.prefix || 'EN57'}-${1000 + Math.floor(hash(this.seed * 3.3) * 999)}` : `${st.prefix || 'EU07'}-${100 + Math.floor(hash(this.seed * 5.1) * 400)}`);
			// EU07: czarna tabliczka z białym numerem między reflektorami
			const plate = new T.Mesh(new T.PlaneGeometry(0.72, 0.18), new T.MeshStandardMaterial({ map: plateTexture(num, '#151515', '#f2f2f2'), roughness: 0.5 }));
			plate.material.userData.shared = false;
			plate.userData.ownMaterial = plate.userData.ownGeometry = true;
			this.ownMats.push(plate.material);
			plate.position.set(0, st.plateY || 1.58, sgn * (hl + 0.02));
			if (sgn < 0) plate.rotation.y = Math.PI;
			group.add(plate);
		}

		/* SM42: lokomotywa spalinowa maskowa. Ostojnica z pomostami i poręczami, długa maska z przodu (−z), kabina (bryła
		   z przekrojów: szyby czołowe nad maskami, okna boczne, kremowy pas), krótka maska z tyłu; na czołach masek
		   kremowe szewrony i reflektory, zderzaki i pomarańczowe czołownice, wózki z kołami 1 m. Kabina gracza
		   (cab.js) osadzona w tej kabinie (cabSpec). */
		buildSM42(i, len) {
			const group = new T.Group(), shadows = this.shadows, st = this.styleOf(i, 'sm42'), hl = len / 2;
			const add = (o) => { o.castShadow = shadows; o.receiveShadow = true; group.add(o); return o; };
			const green = paint(st.paint), cream = paint(st.stripe), black = mat('#1c1c1c'), dark = mat('#2a2d30');
			const rail = matS('#e8d58a', { metalness: 0.3, roughness: 0.45 }), lou = mat('#24614b'), lou2 = mat('#1a4a39');
			const zEnd = hl - 0.66; // czoło ostojnicy (zderzaki 0,66 m dalej)
			// ostojnica, pomost, zbiornik paliwa, wózki
			add(box(3.0, 0.34, 2 * zEnd, black, 0, 1.23, 0));
			add(box(3.02, 0.04, 2 * zEnd - 0.1, mat('#3a3d40'), 0, 1.42, 0));
			add(box(2.3, 0.62, 3.0, dark, 0, 0.82, 0));
			// wymiary SM42 (6D): rozstaw skrajnych osi 10,1 m, koła 1,1 m; rozstaw osi w wózku przyjęty 2,4 m
			// (danych nie znaleziono) – czopy skrętu co 7,7 m
			for (const bz of [-3.85, 3.85]) this.bogie(group, add, bz, 2.4, 0.55, 'loco');
			for (const sgn of [-1, 1]) {
				this.buffers(add, sgn * zEnd, sgn, st.head);
				this.plough(add, sgn * zEnd, sgn, 2.5, 0.42);
				// stopnie i poręcze przy narożnikach pomostu
				for (const sx of [-1, 1]) {
					for (const yy of [0.62, 0.95]) add(box(0.5, 0.04, 0.25, dark, sx * 1.22, yy, sgn * (zEnd - 0.2)));
					for (const dx of [-0.25, 0.25]) add(box(0.04, 0.9, 0.04, rail, sx * 1.22 + dx, 0.95, sgn * (zEnd - 0.08)));
				}
			}
			// maski: zaokrąglony prostopadłościan wytłoczony wzdłuż lokomotywy
			// plain – sama bryła (nadbudówka), bez pasa, żaluzji i poręczy
			const hood = (z0, z1, h, w, plain) => {
				const sh = new T.Shape(), r = plain ? 0.18 : 0.32, x0 = -w / 2, x1 = w / 2, y0 = 1.44;
				sh.moveTo(x0, y0);
				sh.lineTo(x1, y0);
				sh.lineTo(x1, h - r);
				sh.quadraticCurveTo(x1, h, x1 - r, h);
				sh.lineTo(x0 + r, h);
				sh.quadraticCurveTo(x0, h, x0, h - r);
				sh.closePath();
				const g = new T.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 6 });
				g.translate(0, 0, z0);
				const m = new T.Mesh(g, green);
				m.userData.ownGeometry = true;
				add(m);
				if (plain) return { z0, z1, h, w };
				// kremowy pas wzdłuż maski, kratki żaluzjowe i drzwiczki rewizyjne
				for (const sx of [-1, 1]) {
					add(box(0.03, 0.17, z1 - z0, cream, sx * (w / 2 + 0.012), 2.535, (z0 + z1) / 2));
					for (let z = z0 + 0.45; z < z1 - 0.5; z += 0.95) {
						add(box(0.03, 0.42, 0.72, lou, sx * (w / 2 + 0.01), 2.9, z + 0.36));
						for (let y = 2.73; y < 3.08; y += 0.08) add(box(0.04, 0.025, 0.66, lou2, sx * (w / 2 + 0.015), y, z + 0.36));
						add(box(0.03, 0.95, 0.025, black, sx * (w / 2 + 0.012), 2.0, z));
					}
					// poręcze wzdłuż pomostu
					for (let z = z0 + 0.2; z <= z1 - 0.1; z += 1.25) add(box(0.04, 0.95, 0.04, rail, sx * 1.42, 1.9, z));
					add(box(0.045, 0.045, z1 - z0, rail, sx * 1.42, 2.36, (z0 + z1) / 2));
				}
				return { z0, z1, h, w };
			};
			/* proporcje jak na rysunku SM42: kabina nie na środku – długa maska ok. 60 % długości (przy kabinie wyższa
			   nadbudówka chłodnicy), kabina ok. 2,6 m, krótka maska ok. 2,8 m; maski niższe od kabiny (wierzch ok.
			   3,2 m – tuż pod szybami kabiny) i węższe od niej */
			const zA = -zEnd + 0.35, zB = zEnd - 0.35, CL = 2.6, SHORT = Math.min(2.8, (zB - zA) * 0.23);
			// przód (−z) – krótka maska (z kabiny widać tor nad nią), z tyłu długa maska z nadbudówką przy kabinie
			const zc0 = zA + SHORT, zc1 = zc0 + CL;
			const shortH = hood(zA, zc0, 3.2, 2.4);
			const longH = hood(zc1, zB, 3.2, 2.4);
			// nadbudówka na długiej masce przy kabinie (wyższa od maski, niższa od kabiny), z kratką na boku
			const raised = Math.min(1.9, (zB - zc1) * 0.28);
			hood(zc1, zc1 + raised, 4.15, 2.2, true);
			for (const sx of [-1, 1]) {
				add(box(0.03, 0.55, raised - 0.4, lou, sx * 1.11, 3.6, zc1 + raised / 2));
				for (let y = 3.38; y < 3.85; y += 0.08) add(box(0.04, 0.025, raised - 0.46, lou2, sx * 1.115, y, zc1 + raised / 2));
			}
			// czoła masek: szewrony, reflektory (górny i dwa dolne), poręcz czołowa
			const front = (H0, sgn, role) => {
				const zf = sgn < 0 ? H0.z0 : H0.z1, h = H0.h, w = H0.w;
				for (const yb of [1.72, 2.3]) for (const sx of [-1, 1]) {
					const arm = box(1.45, 0.2, 0.02, cream, sx * 0.6, yb + 0.35, zf + sgn * 0.012);
					arm.rotation.z = sx * 0.5;
					add(arm);
				}
				const chrome = matS('#c9ccd0', { metalness: 0.95, roughness: 0.18 });
				for (const [x, y, r0, m] of [[0, h - 0.22, 0.2, role === 'front' ? this.headMat : mat('#c9ccd0')], [-0.85, 1.72, 0.14, role === 'front' ? this.headMat : mat('#c9ccd0')], [0.85, 1.72, 0.14, role === 'front' ? this.headMat : mat('#c9ccd0')], [-0.85, 1.98, 0.08, role === 'rear' ? this.tailMat : mat('#4a1210')], [0.85, 1.98, 0.08, role === 'rear' ? this.tailMat : mat('#4a1210')]]) {
					add(turned(LAMP_GEO, black, x, y, zf - sgn * 0.02, r0 + 0.05, 0.16, sgn));
					add(turned(RING_GEO, chrome, x, y, zf + sgn * 0.142, r0 + 0.025, r0 + 0.025, sgn));
					group.add(turned(LENS_GEO, m, x, y, zf + sgn * 0.136, r0, r0, sgn));
				}
				// poręcz przed czołem maski
				for (const x of [-1.42, -0.55, 0.55, 1.42]) add(box(0.04, 0.95, 0.04, rail, x, 1.9, zf + sgn * 0.35));
				add(box(2.88, 0.045, 0.045, rail, 0, 2.36, zf + sgn * 0.35));
			};
			front(shortH, -1, i === 0 ? 'front' : 'none');
			front(longH, 1, i === this.train.cars.length - 1 ? 'rear' : 'none');
			// dach długiej maski: wentylator chłodnicy, tłumik wydechu
			const fan = new T.Mesh(CYL, dark);
			fan.scale.set(1.3, 0.12, 1.3);
			fan.position.set(0, 3.24, zEnd - 1.6);
			add(fan);
			add(box(1.0, 0.05, 1.0, lou2, 0, 3.31, zEnd - 1.6));
			const ex = new T.Mesh(CYL, dark);
			ex.scale.set(0.28, 0.35, 0.28);
			ex.position.set(0, 3.38, zB - 3.4);
			add(ex);
			// kabina: bryła z przekrojów (szyby czołowe nad maskami – mapa st.face, okna boczne, kremowy pas pod oknami)
			const cl = zc1 - zc0, cz = (zc0 + zc1) / 2, H = 4.29, FLY = 0.75; // wysokość SM42: 4285 mm // podłoga kabiny 0,75 m wyżej niż w EU07
			// drzwi z oknem od strony krótkiej maski, okno boczne od strony długiej (jak na rysunku)
			const wins = [[-0.9, -0.12], [0.3, 1.15]];
			const livery = (xo, yo, to, zo) => {
				if (to > 0.01) return yo > 4.1 ? 3 : yo >= 2.45 && yo < 2.62 ? 1 : 0;
				if (yo > 4.1) return 3;
				if (Math.abs(xo) > 1.3 && yo > 3.3 && yo < 4.0 && wins.some(([a, b]) => zo > a && zo < b)) return 4;
				return yo >= 2.45 && yo < 2.62 ? 1 : 0;
			};
			const bodyGeo = loftBody(cl, H, true, true, st, livery, 0, wins.flat());
			const body = add(new T.Mesh(bodyGeo, [green, cream, cream, matS(st.roof, { roughness: 0.55, metalness: 0.3, panels: true }), this.cabGlass, this.sideGlass, this.hiddenMat]));
			body.position.z = cz;
			body.userData.ownGeometry = true;
			// wycieraczki na szybach czołowych kabiny (nad maskami)
			this.curBody = body;
			this.curCarIdx = i;
			// SM42: wycieraczki zawieszone u góry okien – oś nad szybą, pióro w dół
			for (const sg of [-1, 1]) for (const x of [-0.66, 0.66]) this.addWiper(group, sg, Math.abs(cz) + cl / 2, x, 3.65, true);
			// daszek nad szybami czołowymi (dach kabiny wystaje nad czoło)
			for (const sg of [-1, 1]) {
				const vz = cz + sg * (cl / 2 + 0.1);
				add(box(2.9, 0.05, 0.24, green, 0, 4.06, vz));
				add(box(2.9, 0.025, 0.02, black, 0, 4.03, vz + sg * 0.11));
			}
			// drzwi kabiny (obie burty, za oknem), stopnie
			for (const sx of [-1, 1]) {
				add(box(0.04, 0.03, 0.96, black, sx * (HALF + 0.01), 4.02, cz - 0.51));
				for (const z of [cz - 0.99, cz - 0.03]) add(box(0.04, 2.6, 0.03, black, sx * (HALF + 0.01), 2.72, z));
			}
			// wnętrze kabiny widoczne przez szyby (maszynista) – w widoku z kabiny gracza ukryte
			const rg = new T.Group();
			rg.position.set(0, FLY, cz);
			group.add(rg);
			const room = this.cabRoom(rg, 'loco', { nose: 0 }, H, cl / 2, -1, i === 0);
			this.finish(group, new Set([body]));
			return { group, len, doorZ: [], kind: 'loco', st, H, bodyGeo, cab: true, room, cabSpec: { geo: bodyGeo, hl: cl / 2, nose: 0, H: H - FLY, y: FLY, z: cz } };
		}

		/* Bdhpumn: wagon piętrowy – środek między wózkami obniżony (pokład dolny i górny), końce nad wózkami
		   jednopoziomowe; dwoje drzwi dwuskrzydłowych na burtę przy końcach części piętrowej; przejścia UIC z drzwiami
		   na ścianach czołowych; wnętrze: dwa pokłady z fotelami i pasażerami (ściany od środka – ta sama bryła). */
		buildDD(i, len) {
			const t = this.train, n = t.cars.length, group = new T.Group(), shadows = this.shadows, st = this.styleOf(i, 'dd'), hl = len / 2, H = 4.6;
			const add = (o) => { o.castShadow = shadows; o.receiveShadow = true; group.add(o); return o; };
			const blue = paint(st.paint), yellow = paint(st.stripe), black = mat('#1c1c1c'), dark = mat('#2a2d30');
			const DOOR_W = 1.3, dz0 = hl - 5.0, doorZ = [-dz0, dz0];
			const zLow = hl - 5.75, zUp = hl - 5.0, zEndW = hl - 4.3;
			const wins = [];
			// dolny pokład (między drzwiami), górny pokład (dłuższy), okna końcówek (w żółtym pasie)
			for (let z = -zLow + 0.9; z < zLow - 0.8; z += 1.95) wins.push([z - 0.55, z + 0.55, 1.5, 2.15]);
			for (let z = -zUp + 0.8; z < zUp - 0.7; z += 1.62) wins.push([z - 0.5, z + 0.5, 3.2, 3.62]); // na łuku dachu
			for (const e of [-1, 1]) wins.push([e > 0 ? zEndW + 0.5 : -hl + 1.3, e > 0 ? hl - 1.3 : -zEndW - 0.5, 2.3, 2.9]);
			const cuts = [];
			for (const [a, b] of wins) cuts.push(a, b);
			for (const d of doorZ) cuts.push(d - DOOR_W / 2, d + DOOR_W / 2);
			const livery = (xo, yo, to, zo) => {
				if (yo > 4.12) return 3;
				const ax = Math.abs(xo);
				if (ax > 1.0) {
					if (yo > 1.1 && yo < 2.95 && doorZ.some((d) => Math.abs(zo - d) < DOOR_W / 2)) return 6;
					if (wins.some(([a, b, y0, y1]) => zo > a && zo < b && yo > y0 && yo < y1)) return 5;
				}
				return yo >= 2.2 && yo < 2.95 ? 1 : 0;
			};
			const bodyGeo = loftBody(len, H, false, false, st, livery, 0, cuts);
			const body = add(new T.Mesh(bodyGeo, [blue, yellow, yellow, matS(st.roof, { roughness: 0.55, metalness: 0.3, panels: true }), this.cabGlass, this.sideGlass, this.hiddenMat]));
			body.userData.ownGeometry = true;
			// ściany od środka (ta sama bryła, widziana od wewnątrz; okna i drzwi otwarte)
			if (!this.ddIn) {
				const mk = (c, e) => { const m = new T.MeshLambertMaterial({ color: c, emissive: '#ffffff', emissiveIntensity: e, side: T.BackSide }); this.ownMats.push(m); return m; };
				this.ddIn = { wall: mk('#d5d8d2', 0.18), ceil: mk('#eeeeea', 0.22) };
			}
			group.add(new T.Mesh(bodyGeo, [this.ddIn.wall, this.ddIn.wall, this.ddIn.wall, this.ddIn.ceil, this.hiddenMat, this.hiddenMat, this.hiddenMat]));
			// część obniżona między wózkami (dolny pokład) – fartuch pod pudłem
			add(box(2.86, 0.55, 2 * zLow + 1.4, blue, 0, 0.8, 0));
			add(box(2.7, 0.08, 2 * zLow + 1.2, black, 0, 0.52, 0));
			for (const bz of [-(hl - 2.7), hl - 2.7]) this.bogie(group, add, bz, 2.5, 0.46, 'coach');
			// uszczelki okien
			const seal = mat('#141414');
			for (const [a, b, y0, y1] of wins) for (const sx of [-1, 1]) {
				if (y1 > 2.95) continue; // górne okna na łuku dachu – szyby równo z poszyciem
				const x = sx * (HALF + 0.005);
				add(box(0.04, 0.05, b - a + 0.06, seal, x, y1, (a + b) / 2));
				add(box(0.04, 0.05, b - a + 0.06, seal, x, y0, (a + b) / 2));
				for (const z of [a, b]) add(box(0.04, y1 - y0 + 0.05, 0.05, seal, x, (y0 + y1) / 2, z));
			}
			// drzwi dwuskrzydłowe (odsuwane), uszczelki, stopnie; otwierają się po stronie peronu
			for (const z of doorZ) for (const side of [1, -1]) {
				const lw = DOOR_W / 2, leaves = [];
				for (let k = 0; k < 2; k++) {
					const leaf = new T.Group();
					// skrzydło (1,85 m) z oknem: panel dolny, pas górny, słupki po bokach okna, szyba w otworze i uszczelka
					const ww = lw * 0.6, sw = (lw - 0.02 - ww) / 2, wy0 = -0.025, wy1 = 0.725, wc = (wy0 + wy1) / 2, wh = wy1 - wy0;
					leaf.add(box(0.06, wy0 + 0.925, lw - 0.02, blue, 0, (wy0 - 0.925) / 2, 0));
					leaf.add(box(0.06, 0.925 - wy1, lw - 0.02, blue, 0, (wy1 + 0.925) / 2, 0));
					for (const sz of [-1, 1]) leaf.add(box(0.06, wh, sw, blue, 0, wc, sz * (ww / 2 + sw / 2)));
					leaf.add(box(0.03, wh, ww, this.sideGlass, 0, wc, 0));
					for (const y of [wy0 + 0.012, wy1 - 0.012]) leaf.add(boxU(0.064, 0.024, ww, seal, 0, y, 0));
					for (const sz of [-1, 1]) leaf.add(boxU(0.064, wh, 0.024, seal, 0, wc, sz * (ww / 2 - 0.012)));
					leaf.add(boxU(0.03, 0.22, 0.03, matS('#c9ccd0', { metalness: 0.85, roughness: 0.3 }), side * 0.045, -0.3, (k === 0 ? 1 : -1) * (lw / 2 - 0.1)));
					const z0 = z + (k === 0 ? -lw / 2 : lw / 2);
					leaf.position.set(side * (HALF + 0.035), 2.0, z0);
					leaf.traverse((o) => { o.castShadow = shadows; o.receiveShadow = true; });
					group.add(leaf);
					leaves.push({ leaf, z0, dir: k === 0 ? -1 : 1, x0: side * (HALF + 0.035) });
				}
				this.doorSets.push({ leaves, lw, side });
				for (const dzz of [-DOOR_W / 2 - 0.02, DOOR_W / 2 + 0.02]) add(box(0.06, 1.95, 0.05, seal, side * (HALF + 0.04), 2.0, z + dzz));
				add(box(0.3, 0.06, 1.4, mat('#555a5f'), side * (HALF + 0.1), 1.0, z));
			}
			// oznaczenie klasy przy drzwiach
			const cm = new T.MeshStandardMaterial({ map: classTexture(st.cls || 2, st.paint), roughness: 0.5, transparent: true, alphaTest: 0.3 });
			cm.userData.shared = false;
			this.ownMats.push(cm);
			for (const sx of [-1, 1]) for (const z of doorZ) {
				const cl = new T.Mesh(new T.PlaneGeometry(0.3, 0.45), cm);
				cl.userData.ownGeometry = true;
				cl.rotation.y = sx * Math.PI / 2;
				cl.position.set(sx * (HALF + 0.012), 2.55, z - Math.sign(z) * (DOOR_W / 2 + 0.4));
				group.add(cl);
			}
			// przejścia UIC z drzwiami na ścianach czołowych, miech między wagonami, zderzaki
			const rub = mat('#141414'), doorC = paint('#d9d6cc'), metal = matS('#8d9196', { metalness: 0.8, roughness: 0.3 });
			for (const e of [-1, 1]) {
				const z0 = e * hl;
				for (const x of [-0.56, 0.56]) add(box(0.16, 2.35, 0.28, rub, x, 2.5, z0 + e * 0.13));
				add(box(1.28, 0.18, 0.28, rub, 0, 3.66, z0 + e * 0.13));
				add(box(0.96, 2.15, 0.04, doorC, 0, 2.45, z0 + e * 0.02));
				add(box(0.5, 0.6, 0.02, matS('#26323b', { roughness: 0.08, metalness: 0.3 }), 0, 2.95, z0 + e * 0.045));
				this.buffers(add, e * (hl - 0.22), e, 'coach');
				this.endDetails(add, z0, e);
			}
			if (i < n - 1) {
				add(box(1.05, 2.3, t.gap + 0.5, mat('#161616'), 0, 2.5, hl + t.gap / 2));
				for (let k = 0; k < 5; k++) add(box(1.19, 2.42, 0.06, mat('#262626'), 0, 2.5, hl - 0.2 + (k + 0.5) * ((t.gap + 0.4) / 5)));
			} else for (const x of [-0.9, 0.9]) group.add(box(0.3, 0.3, 0.05, this.tailMat, x, 1.6, hl + 0.03));
			// dach: wywietrzniki
			const roofMat = matS(st.roof, { roughness: 0.55, metalness: 0.3, panels: true });
			for (let z = -hl + 2; z < hl - 1.5; z += 3) {
				const v = new T.Mesh(VENT_GEO, roofMat);
				v.scale.set(0.25, 0.28, 0.25);
				v.position.set(0, H - 0.06, z);
				add(v);
			}
			this.interiorDD(group, len, zLow, zUp, zEndW, doorZ, DOOR_W, i);
			this.finish(group, new Set([body]));
			return { group, len, doorZ, kind: 'dd', st, H, bodyGeo, cab: false, room: null };
		}

		// wnętrze wagonu piętrowego: podłogi i sufity obu pokładów, fotele 2+2 w zestawach, pasażerowie (instancje)
		interiorDD(group, len, zLow, zUp, zEndW, doorZ, DOOR_W, ci) {
			const M = this.inMats, hl = len / 2;
			const parts = (list, material, geo) => {
				if (!list.length) return;
				const m = new T.InstancedMesh(geo || GEO.box, material, list.length);
				const m4 = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), sc = new T.Vector3();
				list.forEach(([w, h, d, x, y, z, c], k) => {
					m.setMatrixAt(k, m4.compose(p.set(x, y, z), q, sc.set(w, h, d)));
					if (c) m.setColorAt(k, c);
				});
				if (m.instanceColor) m.instanceColor.needsUpdate = true;
				m.receiveShadow = true;
				group.add(m);
			};
			const floors = [[2.8, 0.05, 2 * zLow, 0, 1.05, 0], [2.8, 0.05, 2 * zUp, 0, 2.45, 0], [2.8, 0.05, hl - zEndW - 0.3, 0, 1.75, zEndW + (hl - zEndW) / 2], [2.8, 0.05, hl - zEndW - 0.3, 0, 1.75, -zEndW - (hl - zEndW) / 2]];
			parts(floors, M.floor);
			const seatL = [], pax = [];
			const PEOPLE = ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d35400', '#34495e', '#e67e22', '#16a085'];
			const SKIN = ['#e2b48f', '#c58c66', '#8d5a3b', '#f1c9a5'];
			const row = (z, y, f, key) => {
				for (const x of [-1.0, -0.55, 0.55, 1.0]) {
					seatL.push({ x, y: y + 0.5, z, f });
					const hsh = hash(this.seed * 5.3 + ci * 17 + key * 3.1 + x * 7);
					if (hsh < 0.4) pax.push({ x, y: y + 0.5, z, f, cloth: new T.Color(PEOPLE[Math.floor(hash(hsh * 97) * PEOPLE.length)]), skin: new T.Color(SKIN[Math.floor(hash(hsh * 53) * 4)]) });
				}
			};
			let k = 0;
			for (let z = -zLow + 0.6; z < zLow - 0.5; z += 0.9, k++) row(z, 1.07, k % 2 ? -1 : 1, k);
			for (let z = -zUp + 0.6; z < zUp - 0.5; z += 0.9, k++) row(z, 2.47, k % 2 ? -1 : 1, k);
			for (const e of [-1, 1]) for (let q = 0; q < 3; q++, k++) row(e * (zEndW + 0.9 + q * 0.9), 1.77, q % 2 ? -1 : 1, k);
			this.seatsAndPeople(group, seatL, pax);
			parts([[0.2, 0.03, 2 * zUp - 1, -0.8, 3.98, 0], [0.2, 0.03, 2 * zUp - 1, 0.8, 3.98, 0], [0.2, 0.03, 2 * zLow - 1, 0, 2.4, 0]], M.lamp);
		}

		buildCar(i, len) {
			const t = this.train;
			const n = t.cars.length;
			const spec = t.specs && t.specs[i];
			const model = spec ? spec.model : t.style === 'ezt' ? 'ezt' : i === 0 ? (t.style === 'freight' ? 'cargo' : 'loco') : 'coach';
			let st = this.styleOf(i, model);
			// pas na burcie: krawędzie przekroju pudła na jego granicach (malowanie ścian wg wysokości)
			if (st.belt) st = Object.assign({}, st, { sideYs: (st.sideYs || []).concat(st.belt) });
			// pasy malowania (nowoczesne EZT): krawędzie przekroju na granicach pasów
			if (st.zones) st = Object.assign({}, st, { sideYs: (st.sideYs || []).concat(st.zones.map((z) => z[0])) });
			// bryła bazowa (loco, coach, ezt, cargo) – serie różnią się parametrami stylu (wózki, okna, boki, czoło)
			const kind = st.base || model;
			const ezt = kind === 'ezt';
			const H = (spec && spec.H) || t.height;
			// EN57: kabiny na zewnętrznych końcach każdego zespołu (wagony ra i rb)
			const uc = t.unitCars || n;
			const noseF = (ezt && i % uc === 0) || kind === 'loco' || kind === 'cargo';
			const noseR = (ezt && i % uc === uc - 1) || kind === 'loco' || kind === 'cargo';
			const hl = len / 2;
			const group = new T.Group();
			const shadows = this.shadows;
			const add = (o) => { o.castShadow = shadows; o.receiveShadow = true; group.add(o); return o; };

			// malowanie: wybór materiału dla ściany wg wysokości (yo), położenia w poprzek (xo) i czoła (to)
			// okna boczne kabin lokomotywy: 1,5 m za skosem czoła, na wysokości 2,3–3,3 m (część bryły – widać przez nie z kabiny)
			const cabWin = kind === 'loco' || kind === 'cargo' ? 1.5 : kind === 'ezt' ? 1.0 : 0;
			// wagony pasażerskie: drzwi, okna boczne i zakres wnętrza (współrzędna z, przód = −z)
			const passenger = kind === 'ezt' || kind === 'coach';
			const DOOR_W = st.doorW || (kind === 'coach' ? 0.9 : 1.3);
			const cabDepth = st.nose * 0.45 + 2.45; // ściana tylna kabiny – jak w cab.js
			const zIn0 = noseF ? -hl + cabDepth + 0.08 : -hl + 0.35;
			const zIn1 = noseR ? hl - cabDepth - 0.08 : hl - 0.35;
			// EN57: dwoje drzwi dwuskrzydłowych na burtę; 111A: drzwi w przedsionkach na obu końcach
			const doorZ = st.doors ? st.doors(len, noseF, noseR) : kind === 'ezt' ? [len * 0.26, -len * 0.26] : kind === 'coach' ? [hl - 1.0, -(hl - 1.0)] : [];
			const winW = (kind === 'ezt' && st.winW) || (kind === 'ezt' ? 1.05 : 1.3), pitch = st.pitch || (kind === 'ezt' ? 1.45 : 2.2);
			const wins = [];
			if (kind === 'coach') {
				// 111A: dziesięć przedziałów – okno na środku każdego
				const nc = st.comp || 10, ww = (st.winW || 1.3) / 2, cA = -hl + 2.45, cp = (len - 4.9) / nc;
				for (let k = 0; k < nc; k++) wins.push([cA + cp * (k + 0.5) - ww, cA + cp * (k + 0.5) + ww]);
			} else if (passenger) {
				for (let z = zIn0 + 0.45 + winW / 2; z < zIn1 - 0.45 - winW / 2 + 1e-6; z += pitch) {
					if (doorZ.some((d) => Math.abs(z - d) < DOOR_W / 2 + winW / 2 + 0.3)) continue;
					wins.push([z - winW / 2, z + winW / 2]);
				}
			}
			const cuts = cabWin ? [-hl + st.nose + cabWin, hl - st.nose - cabWin] : [];
			// okna boczne kabiny podzielone (cabPanes: [od, do] w m od końca czoła – ET22: okno stałe i okno w drzwiach)
			if (cabWin && st.cabPanes) for (const [a, b] of st.cabPanes) cuts.push(-hl + st.nose + a, -hl + st.nose + b, hl - st.nose - a, hl - st.nose - b);
			for (const [a, b] of wins) cuts.push(a, b);
			for (const d of doorZ) cuts.push(d - DOOR_W / 2, d + DOOR_W / 2);
			const livery = (xo, yo, to, zo) => {
				const ax = Math.abs(xo);
				if (passenger && ax > 1.3 && to < 0.01) {
					if (yo > 1.1 && yo < 3.3 && doorZ.some((d) => Math.abs(zo - d) < DOOR_W / 2)) return 6;
					if (yo > 2.3 && yo < 3.3 && wins.some(([a, b]) => zo > a && zo < b)) return 5;
				}
				// okna boczne kabiny (przy płaskim czole – tylko na prostej burcie, za narożnikami)
				if (cabWin && ax > 1.3 && yo > 2.3 && yo < 3.3 && (!st.split || to < 0.01) && ((noseF && zo < -hl + st.nose + cabWin) || (noseR && zo > hl - st.nose - cabWin))) {
					if (!st.cabPanes) return 4;
					const u = zo < 0 ? zo - (-hl + st.nose) : hl - st.nose - zo;
					if (st.cabPanes.some(([a, b]) => u > a && u < b)) return 4;
					return 0;
				}
				// szyba czołowa: ściśnięty łuk dachu na skosie czoła (+ przy czole opływowym boczne okna kabiny)
				// górna część skosu (to < 0.35) zostaje dachem kabiny – od środka widać sufit, nie niebo
				// przy płaskim czole szyba niższa (wyżej jest dach kabiny – z fotela widać sufit, a nie niebo)
				// czoło pionowe (EN57): na kopule i narożnikach czoła tylko pasy malowania (szyby są na ścianie czoła)
				if (st.vfront && to > 0.01) return yo > 3.45 ? 3 : yo >= 2.15 ? 1 : 0;
				// dwie szyby (EP09, ET22, ST44, SU46): rama dookoła w kolorze pudła, równo z szybą (słupek pośrodku –
				// pasek po krzywiźnie czoła, flatFront)
				const g0 = st.glassT || 0.55;
				if (st.split && st.panes === 2 && yo > st.yb + 0.05 && to > g0 && ax < 1.37) {
					if (to < g0 + 0.08 || ax > 1.27 || yo < st.yb + 0.1) return 0;
					return 4;
				}
				// trzy szyby (EN57, EU07): ramy i słupki są częścią pudła (kolor ramy), szyby wpuszczone równo z nimi
				if (st.panes === 3 && yo > st.yb + 0.05 && to > 0.55 && ax < 1.37) {
					const fr = kind === 'ezt' ? 1 : 0;
					// szyba środkowa wąska (słupki przy |x| ≈ 0,3), tej samej wysokości co boczne
					if (to < 0.64 || ax > 1.27 || Math.abs(ax - 0.3) < 0.065 || yo < st.yb + 0.1) return fr;
					return 4;
				}
				// glassT – początek szyby na skosie czoła (ST44 – niższa szyba, nad nią pas pudła z dużym reflektorem)
				if (yo > st.yb + 0.05 && to > (st.glassT || (st.split ? 0.55 : 0.35)) && ax < 1.37) return 4;
				if (st.glassT && to > 0.35 && to <= st.glassT && yo > st.yb + 0.05) return 0;
				if (!st.split && yo > st.yb + 0.05 && yo > 2.3 && yo < 3.3 && to > 0.25) return 4;
				// 111A: szary dach schodzi po łuku aż nad okna i drzwi (rynna tuż nad nimi)
				// 111A i EN57: szary dach od ok. 0,15 m nad oknami (pas okienny sięga trochę nad okna)
				if ((kind === 'coach' || kind === 'ezt' || kind === 'loco') && to < 0.01 && yo > 3.45) return 3;
				if (yo > 3.52 && ax < 1.3) return 3;
				const side = ax > 1.3;
				if (kind === 'ezt') {
					// nowoczesne EZT: pasy malowania wg wysokości (zones)
					if (st.zones) { for (const [a0, a1, g] of st.zones) if (yo >= a0 && yo < a1) return g; return 0; }
					return yo >= 2.15 ? 1 : 0; // EN57: kremowa góra, niebieski dół
				}
				if (kind === 'coach') {
					if (st.zones) { for (const [a0, a1, g] of st.zones) if (yo >= a0 && yo < a1) return g; return 0; }
					return yo >= 1.3 && yo < 2.15 ? 1 : 0; // 111A: kremowy pas między zielonymi (zielony od 0,15 m pod oknami)
				}
				if (kind === 'loco') {
					if (st.belt) return yo >= st.belt[0] && yo < st.belt[1] ? 1 : yo < st.splitY ? 2 : 0; // pas (np. kremowy pod oknami)
					return yo < 1.15 ? 1 : yo < st.splitY ? 2 : 0; // EU07: ostojnica, ciemnozielony dół, jasna góra
				}
				return yo > 1.28 && yo < 1.76 ? 1 : 0; // towarowa
			};
			const glass = matS('#0a0f14', { roughness: 0.12, metalness: 0.05, envMapIntensity: 0.55 });
			const bodyMats = [paint(st.paint), paint(st.stripe), paint(st.band), matS(st.roof, { roughness: 0.55, metalness: 0.3, panels: true }), this.cabGlass, this.sideGlass, this.hiddenMat, paint(st.trim || st.stripe)];
			const bodyGeo = loftBody(len, H, noseF, noseR, st, livery, 0, cuts);
			const body = add(new T.Mesh(bodyGeo, bodyMats));
			body.userData.ownGeometry = true;

			// podwozie: rama, skrzynie aparatury, osłony (EZT)
			const under = mat('#2a2a2a');
			const bogieOff = st.bogieOff ?? (kind === 'loco' ? 3.8 : kind === 'cargo' ? 4.4 : kind === 'coach' ? 3.65 : 3.0);
			const wb = st.wb ?? (kind === 'loco' ? 2.9 : kind === 'cargo' ? 2.8 : 2.5);
			// rama podwozia między wózkami (nad wózkami zostaje miejsce – widać ramy wózków) i ostojnica pod pudłem
			add(box(2.5, 0.35, Math.max(1, len - 2 * bogieOff - wb - 1.4), under, 0, 0.88, 0));
			add(box(2.7, 0.12, len - 0.6, under, 0, BOTTOM - 0.02, 0));
			const wR = st.wR ?? (kind === 'loco' ? 0.55 : kind === 'ezt' ? 0.47 : kind === 'cargo' ? 0.53 : 0.45);
			/* wózki Jakobsa (człony przegubowe, spec.art): wózek pod czołem z kabiną i wspólny pod przegubem – na tylnym
			   końcu członu, w połowie odstępu do następnego (przedni koniec członu opiera się na wózku poprzedniego) */
			const bzs = spec && spec.art ? [noseF ? -hl + bogieOff : null, noseR ? hl - bogieOff : hl + t.gap / 2].filter((z) => z !== null) : [-hl + bogieOff, hl - bogieOff];
			for (const bz of bzs) this.bogie(group, add, bz, wb, wR, kind === 'loco' || kind === 'cargo' ? 'loco' : kind === 'ezt' ? 'ezt' : 'coach', st.axles || 2);
			const span = len - 2 * bogieOff - 4.5;
			if (span > 2 && kind === 'coach') this.coachUnderframe(add, span, i);
			else if (span > 2 && kind === 'ezt') this.emuUnderframe(add, span, st);
			else if (span > 2) {
				for (let k = 0; k < 4; k++) {
					const z = -span / 2 + ((k + 0.5) * span) / 4;
					const w = 1.6 + hash(this.seed + i * 3 + k) * 0.6;
					add(box(w, 0.55, span / 4 - 0.5, mat(k % 2 ? '#34383c' : '#2c3034'), 0, 0.62, z));
				}
			}
			if (kind === 'loco' && span > 2) {
				// gniazda podnośników pod ostojnicą przy końcach i przewody w rurach osłonowych między wózkami
				for (const sx of [-1, 1]) {
					for (const e of [-1, 1]) add(box(0.32, 0.14, 0.32, under, sx * 1.15, BOTTOM - 0.14, e * (hl - 1.0)));
					add(fine(turned(CYL, mat('#1e2022'), sx * 1.2, 0.84, 0, 0.06, span, 1)));
				}
			}

			// drzwi: skrzydła z oknem (EZT – dwa skrzydła odsuwane na boki; wagony – jedno), uszczelki, stopień
			const doorMat = paint(st.door);
			const doorLow = doorMat; // drzwi w jednym kolorze (EN57 – żółte)
			const seal = mat('#141414');
			for (const z of doorZ) {
				for (const side of [1, -1]) {
					const nL = st.doorLeaves || (kind === 'ezt' ? 2 : 1), lw = DOOR_W / nL;
					const leaves = [];
					for (let k = 0; k < nL; k++) {
						const leaf = new T.Group();
						const ww = lw * (kind === 'ezt' ? 0.6 : 0.62), st2 = (lw - ww) / 2;
						// panel dolny, górny pas, słupki wokół okna, szyba
						leaf.add(box(0.06, 1.05, lw - 0.02, doorLow, 0, -0.575, 0));
						leaf.add(box(0.06, 0.3, lw - 0.02, doorMat, 0, 0.1, 0));
						leaf.add(box(0.06, 0.15, lw - 0.02, doorMat, 0, 1.025, 0));
						for (const sz of [-1, 1]) leaf.add(box(0.06, 0.7, st2 - 0.01, doorMat, 0, 0.6, sz * (lw / 2 - st2 / 2)));
						leaf.add(box(0.03, 0.7, ww, this.sideGlass, 0, 0.6, 0));
						// klamka przy krawędzi zamykającej
						const hz = nL === 2 ? (k === 0 ? 1 : -1) * (lw / 2 - 0.1) : (z > 0 ? 1 : -1) * (lw / 2 - 0.12);
						leaf.add(boxU(0.03, 0.22, 0.03, matS('#c9ccd0', { metalness: 0.85, roughness: 0.3 }), side * 0.045, -0.15, hz));
						const z0 = z + (nL === 2 ? (k === 0 ? -lw / 2 : lw / 2) : 0);
						leaf.position.set(side * (HALF + 0.035), 2.2, z0);
						leaf.traverse((o) => { o.castShadow = shadows; o.receiveShadow = true; });
						group.add(leaf);
						// kierunek odsuwania: EZT – na zewnątrz od środka otworu; wagon – w stronę środka wagonu
						leaves.push({ leaf, z0, dir: nL === 2 ? (k === 0 ? -1 : 1) : z > 0 ? -1 : 1, x0: side * (HALF + 0.035) });
					}
					// otwierają się tylko drzwi po stronie peronu (prawej)
					this.doorSets.push({ leaves, lw, side });
					for (const dz of [-DOOR_W / 2 - 0.02, DOOR_W / 2 + 0.02]) add(box(0.06, 2.24, 0.05, seal, side * (HALF + 0.04), 2.2, z + dz));
					add(box(0.06, 0.05, DOOR_W + 0.08, seal, side * (HALF + 0.04), 3.32, z));
					// stopnie (wagon 111A – dwa, wysoko nad główką szyny) i poręcze po obu stronach drzwi
					const stepM = matS('#4a4e53', { metalness: 0.5, roughness: 0.5 });
					if (kind === 'coach') {
						for (const [yy, ox] of [[0.98, 0.06], [0.66, 0.12]]) add(box(0.32, 0.05, DOOR_W, stepM, side * (HALF - 0.1 + ox), yy, z));
						for (const dz of [-1, 1]) add(box(0.04, 0.42, 0.04, stepM, side * (HALF + 0.03), 0.82, z + dz * (DOOR_W / 2 - 0.02)));
					} else add(box(0.3, 0.06, 1.3, mat('#555a5f'), side * (HALF + 0.1), 1.02, z));
					const railM = matS('#c9ccd0', { metalness: 0.85, roughness: 0.3 });
					for (const dz of [-1, 1]) {
						const hr = new T.Mesh(CYL, railM);
						hr.scale.set(0.035, 1.25, 0.035);
						hr.position.set(side * (HALF + 0.09), 2.05, z + dz * (DOOR_W / 2 + 0.1));
						add(hr);
						for (const yy of [1.45, 2.65]) add(box(0.08, 0.03, 0.03, railM, side * (HALF + 0.05), yy, z + dz * (DOOR_W / 2 + 0.1)));
					}
				}
			}

			// okna: szyby są w bryle (grupa 5); z zewnątrz uszczelki wokół okien
			if (kind === 'loco' || kind === 'cargo') {
				// drzwi kabin (okna boczne są częścią bryły), poręcze, stopnie, żaluzje przedziału maszynowego
				const rail = matS('#c9ccd0', { metalness: 0.8, roughness: 0.3 });
				for (const x of [-hl + st.nose + 0.9, hl - st.nose - 0.9]) {
					const dzc = -x + Math.sign(x) * 1.0;
					// drzwi kabiny i ramki okien bocznych – osobno na każdej burcie (nic nie przechodzi przez wnętrze kabiny)
					for (const sx of [-1, 1]) {
						add(box(0.06, 1.9, 0.7, paint(st.door), sx * (HALF - 0.01), 2.2, dzc));
						if (!st.noDoorWin) add(box(0.064, 0.5, 0.4, glass, sx * (HALF - 0.01), 2.75, dzc)); // równo z drzwiami
						for (const dy of [2.28, 3.32]) add(box(0.04, 0.05, cabWin + 0.1, mat('#1a1a1a'), sx * (HALF + 0.005), dy, -x - Math.sign(x) * (0.9 - cabWin / 2)));
					}
					for (const sx of [-1, 1]) {
						for (const dz of [-0.45, 0.45]) {
							const h = new T.Mesh(CYL, rail);
							h.scale.set(0.05, 1.5, 0.05);
							h.position.set(sx * (HALF + 0.1), 2.2, dzc + dz);
							group.add(h);
						}
						for (const [sy, sd] of [[0.82, 0.12], [0.45, 0.2]]) add(box(0.22, 0.05, 0.6, mat('#3a3a3a'), sx * (HALF + sd), sy, dzc));
					}
				}
				// lusterka przy szybie czołowej, syreny na dachu
				for (const [sgn, on] of [[-1, noseF], [1, noseR]]) {
					if (!on) continue;
					for (const sx of [-1, 1]) add(box(0.06, 0.25, 0.18, mat('#1e1e1e'), sx * (HALF + 0.08), 3.05, sgn * (hl - st.nose - 0.15)));
					for (const sx of st.roofLamp ? [] : [-0.35, 0.35]) group.add(turned(HORN_GEO, rail, sx, H + 0.12, sgn * (hl - st.nose - 0.85), 0.075, 0.42, sgn));
				}
				if (kind === 'loco') {
					// EU07: na przemian kratki żaluzjowe i okienka przedziału maszynowego
					const za = -hl + st.nose + cabWin + 1.5, zb = hl - st.nose - cabWin - 1.5;
					const nP = st.panels || 7, pw = (zb - za) / nP;
					const sideKind = st.side || 'eu07';
					const grille = mat('#2c3a2e'), slat = mat('#1a221c');
					// przetłoczenia (poziome żebra) na dolnej, ciemnozielonej części burt
					if (st.ribs) for (const sx of [-1, 1]) for (const y of [1.42, 1.64, 1.86]) {
						const xr = y < 1.55 ? 1.38 + (0.06 * (y - 1.3)) / 0.25 : y < 1.75 ? 1.44 + (0.01 * (y - 1.55)) / 0.2 : HALF;
						add(box(0.035, 0.05, 2 * (hl - st.nose - 2.32), paint(st.band), sx * (xr + 0.012), y, 0)); // między drzwiami kabin
					}
					const frameA = paint(darker(st.paint, 0.88));
					if (sideKind === 'et22') this.sideET22(add, za, zb, st, glass, frameA);
					for (let k = 0; sideKind !== 'et22' && k < nP; k++) {
						const zc = za + pw * (k + 0.5);
						if (st.sideDoors && st.sideDoors.includes(k)) {
							// drzwi do przedziału maszynowego: skrzydło z okienkiem, zawiasy, uchwyt, uszczelka
							for (const sx of [-1, 1]) {
								const dw = Math.min(0.75, pw - 0.3);
								add(box(0.05, 2.0, dw, paint(st.door), sx * (HALF + 0.015), 2.3, zc));
								add(box(0.055, 2.06, dw + 0.06, mat('#1a1a1a'), sx * (HALF + 0.008), 2.3, zc));
								add(box(0.06, 0.42, 0.34, glass, sx * (HALF + 0.03), 2.85, zc));
								add(box(0.04, 0.18, 0.05, matS('#c9ccd0', { metalness: 0.8, roughness: 0.3 }), sx * (HALF + 0.05), 2.2, zc + dw / 2 - 0.1));
							}
							continue;
						}
						// rodzaj pola: okienko (EU07 – co drugie, ET22 / ST44 – co trzecie), inaczej kratka żaluzji
						const win = sideKind === 'eu07' ? k % 2 === 1 : sideKind === 'ports' ? k % 3 === 1 : false;
						const fw = win ? 0.85 : pw - 0.35, fh = win ? 0.72 : sideKind === 'grilles' ? 0.9 : 0.7;
						if (win) {
							add(box(WIDTH + 0.05, 0.62, 0.75, glass, 0, 2.85, zc));
							add(box(WIDTH + 0.04, 0.72, 0.85, mat('#1a1a1a'), 0, 2.85, zc));
						} else {
							add(box(WIDTH + 0.04, fh, pw - 0.35, grille, 0, 2.85, zc));
							if (sideKind === 'grilles') for (let z = zc - pw / 2 + 0.3; z < zc + pw / 2 - 0.25; z += 0.12) add(box(WIDTH + 0.06, fh - 0.08, 0.035, slat, 0, 2.85, z)); // żaluzje pionowe
							else for (let y = 2.56; y < 3.16; y += 0.1) add(box(WIDTH + 0.06, 0.035, pw - 0.4, slat, 0, y, zc));
						}
						// ramka (kątownik) wokół okna i kratki
						for (const dy of [-fh / 2, fh / 2]) add(box(WIDTH + 0.08, 0.035, fw + 0.06, frameA, 0, 2.85 + dy, zc));
						for (const dz of [-fw / 2, fw / 2]) add(box(WIDTH + 0.08, fh + 0.04, 0.035, frameA, 0, 2.85, zc + dz));
					}
					// dach: elektrowóz – szyna wysokiego napięcia między pantografami na izolatorach, pomost; spalinowóz –
					// wentylatory chłodnic (okrągłe kratki) i tłumik wydechu
					const ins = matS('#d8cfbf', { roughness: 0.35 }), cu = matS('#b87333', { metalness: 0.85, roughness: 0.35 });
					if (st.diesel) {
						const fanM = mat('#26292c'), rimM = matS('#55595e', { metalness: 0.6, roughness: 0.4 });
						for (const z of [-len * 0.18, len * 0.02, len * 0.2]) {
							const fan = new T.Mesh(CYL, rimM);
							fan.scale.set(1.25, 0.16, 1.25);
							fan.position.set(0, H + 0.04, z);
							add(fan);
							const g2 = new T.Mesh(CYL, fanM);
							g2.scale.set(1.1, 0.04, 1.1);
							g2.position.set(0, H + 0.13, z);
							add(g2);
							// krata nad wirnikiem (pręty docięte do okręgu)
							for (let k = -4; k <= 4; k++) add(fine(box(0.025, 0.025, 1.15 * Math.sqrt(1 - (k / 4.6) ** 2), rimM, k * 0.12, H + 0.17, z)));
						}
						add(box(0.5, 0.45, 0.7, mat('#2b2d30'), 0.35, H + 0.2, -len * 0.08));
					}
					for (let z = -len * 0.22; !st.diesel && z <= len * 0.22 + 1e-6; z += len * 0.11) {
						const c3 = new T.Mesh(INSUL_GEO, ins);
						c3.scale.set(0.075, 0.24, 0.075);
						c3.position.set(0.62, H - 0.02, z);
						add(c3);
						add(fine(box(0.09, 0.05, 0.12, matS('#8d9196', { metalness: 0.7, roughness: 0.4 }), 0.62, H + 0.235, z))); // okucie z zaciskiem szyny
					}
					if (!st.diesel) {
						add(turned(CYL, cu, 0.62, H + 0.25, 0, 0.055, len * 0.46, 1));
						// pomost dachowy z poprzecznym ryflowaniem – między skrzynią oporników a pantografami
						const walk = mat('#3a3d41'), wl = len * 0.22 - 2.6;
						for (const e of [-1, 1]) {
							if (wl < 0.5) break;
							const wz = e * (2.3 + wl / 2);
							add(box(0.6, 0.04, wl, walk, -0.3, H + 0.02, wz));
							for (let z = wz - wl / 2 + 0.05; z < wz + wl / 2; z += 0.1) add(fine(box(0.56, 0.018, 0.022, walk, -0.3, H + 0.048, z)));
						}
					}
					// duży biały numer na burtach (na ciemnym dole, pod jasną górą) i napis PKP przy końcu
					const num = (spec && spec.num) || `${st.prefix || 'EU07'}-${100 + Math.floor(hash(this.seed * 5.1) * 400)}`;
					// napisy w górnym rzędzie (numY) – na kolorze górnej części pudła: na jasnym ciemne, na ciemnym białe
					const tBg = st.numY ? st.paint : st.band, tFg = st.numY && new T.Color(st.paint).getHSL({}).l > 0.55 ? '#23272b' : '#f2f2f2';
					const pm = new T.MeshStandardMaterial({ map: sideTextTexture(num, tBg, tFg, 512, 96, 72), roughness: 0.5, transparent: true, alphaTest: 0.3 });
					const km = new T.MeshStandardMaterial({ map: sideTextTexture('PKP', tBg, tFg, 256, 96, 64), roughness: 0.5, transparent: true, alphaTest: 0.3 });
					for (const m of [pm, km]) { m.userData.shared = false; this.ownMats.push(m); }
					for (const sx of [-1, 1]) {
						const pl = new T.Mesh(new T.PlaneGeometry(2.6, 0.48), pm);
						pl.userData.ownGeometry = true;
						pl.rotation.y = sx * Math.PI / 2;
						pl.position.set(sx * (HALF + 0.02), st.numY || 1.86, sx * (st.numZ ?? 1.6)); // ET22 – w górnym rzędzie, między okienkiem a kratką
						group.add(pl);
						const pk = new T.Mesh(new T.PlaneGeometry(0.9, 0.34), km);
						pk.userData.ownGeometry = true;
						pk.rotation.y = sx * Math.PI / 2;
						pk.position.set(sx * (HALF + 0.02), st.numY || 1.86, st.numY ? sx * (st.numZ + 1.9) : -sx * (hl - st.nose - 2.6));
						group.add(pk);
					}
				} else {
					const louvre = mat(darker(st.paint, 0.55));
					for (let x = -hl + st.nose + 3; x <= hl - st.nose - 3; x += 0.42) add(box(WIDTH + 0.04, 0.85, 0.08, louvre, 0, 2.85, -x));
					add(box(WIDTH + 0.03, 0.06, len - 2 * st.nose - 5.5, mat('#2a2a2a'), 0, 3.32, 0));
					add(box(WIDTH + 0.03, 0.06, len - 2 * st.nose - 5.5, mat('#2a2a2a'), 0, 2.38, 0));
					add(box(WIDTH + 0.03, 0.22, 2.2, mat('#f2f2f2'), 0, 1.5, 0));
				}
			} else {
				const alu = matS('#aeb3b8', { metalness: 0.85, roughness: 0.3 });
				for (const [a, b] of wins) {
					for (const sx of [-1, 1]) {
						const x = sx * (HALF + 0.005);
						// uszczelka dookoła okna
						add(box(0.04, 0.06, b - a + 0.08, seal, x, 3.3, (a + b) / 2));
						add(box(0.04, 0.06, b - a + 0.08, seal, x, 2.3, (a + b) / 2));
						for (const z of [a, b]) add(box(0.04, 1.06, 0.06, seal, x, 2.8, z));
						// okna stałe (wagony Z1, klimatyzowane) – sama uszczelka
						if (st.fixedWin) continue;
						// rama okna opuszczanego: górna część (ok. 1/3) oddzielona poprzeczką, aluminiowe ramki
						const yd = kind === 'coach' ? 2.98 : 2.95;
						add(box(0.05, 0.05, b - a - 0.04, alu, sx * (HALF + 0.012), yd, (a + b) / 2));
						add(box(0.035, 0.03, b - a - 0.04, alu, sx * (HALF + 0.01), 3.25, (a + b) / 2));
						for (const z of [a + 0.04, b - 0.04]) add(box(0.035, 0.32, 0.03, alu, sx * (HALF + 0.01), 3.12, z));
						// zatrzaski okna
						for (const z of [a + 0.2, b - 0.2]) add(box(0.04, 0.03, 0.06, alu, sx * (HALF + 0.03), yd + 0.05, z));
					}
				}
				// wyświetlacze kierunkowe nad drzwiami
				this.curSt = st;
				this.interior(group, kind, len, zIn0, zIn1, doorZ, wins, DOOR_W, i);
			}

			// dach: rynny nad burtami
			const roofMat = matS(st.roof, { roughness: 0.55, metalness: 0.3, panels: true });
			const gutterLen = len - (noseF ? st.nose + 0.4 : 0.3) - (noseR ? st.nose + 0.4 : 0.3);
			const gutterZ = ((noseF ? st.nose + 0.4 : 0.3) - (noseR ? st.nose + 0.4 : 0.3)) / 2;
			for (const sx of [-1, 1]) add(box(0.06, 0.05, gutterLen, kind !== 'cargo' ? roofMat : paint(st.paint), sx * (kind !== 'cargo' ? 1.44 : 1.455), kind !== 'cargo' ? 3.46 : 3.4, gutterZ)); // w kolorze górnej części pudła (111A – dachu)
			if (kind === 'coach' || (kind === 'ezt' && (!noseF || !noseR))) {
				// 111A i EN57: szary dach zachodzi też na ściany czołowe (łuk dachu nad drzwiami przejściowymi)
				const prof = crossSection(H).filter(([, y]) => y >= 3.44);
				const shape = new T.Shape();
				prof.forEach(([x, y], k) => (k ? shape.lineTo(x, y) : shape.moveTo(x, y)));
				const capG = new T.ShapeGeometry(shape);
				for (const e of [-1, 1]) {
					if ((e < 0 && noseF) || (e > 0 && noseR)) continue; // koniec z kabiną – czoło
					const m = new T.Mesh(e > 0 ? capG : capG.clone(), roofMat);
					m.userData.ownGeometry = true;
					m.position.z = e * (hl + 0.006);
					if (e < 0) m.rotation.y = Math.PI;
					add(m);
				}
			}
			if (kind === 'coach') {
				// Z1 (A9, B10): klimatyzatory nad przedsionkami – płaska obudowa z kratkami i wentylatorem
				if (st.ac) for (const e of [-1, 1]) {
					const zc = e * (hl - 3.2);
					add(box(1.9, 0.32, 3.0, roofMat, 0, H - 0.02, zc));
					add(box(1.7, 0.04, 2.8, mat('#30353a'), 0, H + 0.15, zc));
					const fan = new T.Mesh(CYL, mat('#202326'));
					fan.scale.set(0.8, 0.06, 0.8);
					fan.position.set(0, H + 0.17, zc + e * 0.6);
					add(fan);
				}
				// 111A: wywietrzniki „torpedowe” w dwóch rzędach
				for (let z = -hl + 1.6; !st.ac && z < hl - 1.4; z += 2.35) {
					for (const sx of [-0.52, 0.52]) {
						const v = new T.Mesh(CYL, roofMat);
						v.scale.set(0.22, 0.62, 0.22);
						v.rotation.x = Math.PI / 2;
						v.position.set(sx, H - 0.04, z + (sx > 0 ? 1.1 : 0));
						add(v);
						for (const e of [-1, 1]) {
							const c2 = new T.Mesh(GEO.cone, roofMat);
							c2.scale.set(0.22, 0.18, 0.22);
							c2.rotation.x = e * Math.PI / 2;
							c2.position.set(sx, H - 0.04, z + (sx > 0 ? 1.1 : 0) + e * 0.4);
							add(c2);
						}
					}
				}
				// numer UIC i oznaczenie klasy przy drzwiach (obie burty)
				const uic = `51 51 20-${70 + Math.floor(hash(this.seed + i) * 20)} ${100 + Math.floor(hash(this.seed * 2.1 + i) * 899)}-${Math.floor(hash(this.seed * 4.3 + i) * 9)}`;
				const um = new T.MeshStandardMaterial({ map: pkpTexture(uic, st.text), roughness: 0.5, transparent: true, alphaTest: 0.3 });
				const cm = new T.MeshStandardMaterial({ map: classTexture(st.cls || 2, st.paint), roughness: 0.5, transparent: true, alphaTest: 0.3 });
				for (const m of [um, cm]) { m.userData.shared = false; this.ownMats.push(m); }
				for (const sx of [-1, 1]) {
					const pl = new T.Mesh(new T.PlaneGeometry(1.1, 0.34), um); // mały napis na kremowym pasie
					pl.userData.ownGeometry = true;
					pl.rotation.y = sx * Math.PI / 2;
					pl.position.set(sx * (HALF + 0.012), 1.8, 0);
					group.add(pl);
					for (const dz of [-1, 1]) {
						const cl = new T.Mesh(new T.PlaneGeometry(0.34, 0.5), cm);
						cl.userData.ownGeometry = true;
						cl.rotation.y = sx * Math.PI / 2;
						cl.position.set(sx * (HALF + 0.012), 2.75, dz * (hl - 1.0 - DOOR_W / 2 - 0.35));
						group.add(cl);
					}
				}
			} else if (kind === 'ezt') {
				// EN57: numer pojazdu na burtach przy kabinie (wagony ra/rb) albo pośrodku (s)
				const num = `${(spec && spec.num) || `${st.prefix || 'EN57'}-${1000 + Math.floor(hash(this.seed * 3.3) * 999)}`}${st.modern ? '' : noseF || noseR ? (noseF ? 'ra' : 'rb') : 's'}`;
				// nowoczesne EZT: ciemny numer na jasnym pudle, nad pasem pod oknami
				const nm = new T.MeshStandardMaterial({ map: sideTextTexture(num, st.paint, st.modern ? '#24292e' : '#f2f2f2', 256, 64, 36), roughness: 0.5, transparent: true, alphaTest: 0.3 });
				nm.userData.shared = false;
				this.ownMats.push(nm);
				for (const sx of [-1, 1]) {
					const pl = new T.Mesh(new T.PlaneGeometry(1.3, 0.32), nm);
					pl.userData.ownGeometry = true;
					pl.rotation.y = sx * Math.PI / 2;
					pl.position.set(sx * (HALF + 0.012), st.modern ? 1.98 : 1.75, noseF ? -hl + st.nose + 2.2 : noseR ? hl - st.nose - 2.2 : st.modern ? hl - 2.0 : 0);
					group.add(pl);
				}
				// przetłoczenia (poziome żebra) na dolnej, granatowej części burt – poza drzwiami
				const xAt = (y) => (y < 1.3 ? 1.3 + (0.08 * (y - BOTTOM)) / 0.25 : y < 1.55 ? 1.38 + (0.06 * (y - 1.3)) / 0.25 : y < 1.75 ? 1.44 + (0.01 * (y - 1.55)) / 0.2 : HALF);
				const za = noseF ? -hl + st.nose + 0.15 : -hl + 0.3, zb = noseR ? hl - st.nose - 0.15 : hl - 0.3;
				const segs = [];
				let cur = za;
				for (const dz of doorZ.slice().sort((x, y) => x - y)) { if (dz - DOOR_W / 2 - 0.12 > cur) segs.push([cur, dz - DOOR_W / 2 - 0.12]); cur = dz + DOOR_W / 2 + 0.12; }
				if (zb > cur) segs.push([cur, zb]);
				if (!st.modern) for (const sx of [-1, 1]) for (const y of [1.42, 1.66, 1.9]) for (const [a, b] of segs) add(box(0.035, 0.05, b - a, paint(st.paint), sx * (xAt(y) + 0.012), y, (a + b) / 2));
			}
			const grille = mat('#30353a');
			if (kind === 'ezt' || kind === 'coach') {
				// wywietrzniki dachowe (grzybki) w osi dachu
				const panto = t.pantographs ? t.pantographs.includes(i) : false;
				for (let z = -hl + (noseF ? st.nose + 2.5 : 2.5); !st.ac && z < hl - (noseR ? st.nose + 2 : 2); z += kind === 'ezt' ? 3.2 : 4) { // Z1 (klimatyzowane) – bez grzybków
					if (panto && Math.abs(z) > len * 0.12) continue;
					const v = new T.Mesh(VENT_GEO, roofMat);
					v.scale.set(0.25, 0.3, 0.25);
					v.position.set(0, H - 0.04, z);
					add(v);
				}
				if (kind === 'ezt' && st.modern) {
					// nowoczesne EZT: klimatyzator (płaska obudowa z kratką i wentylatorem) na członach bez pantografu – na
					// członach z pantografem osłona aparatury dachowej
					const zc = panto ? 0 : noseF ? -hl + st.nose + 3.2 : noseR ? hl - st.nose - 3.2 : 0;
					add(box(1.9, 0.34, panto ? 2.2 : 3.2, roofMat, 0, H - 0.02, zc));
					add(box(1.7, 0.04, panto ? 2.0 : 3.0, grille, 0, H + 0.16, zc));
					for (let z = zc - (panto ? 0.95 : 1.45); z <= zc + (panto ? 0.95 : 1.45) + 1e-6; z += 0.12) add(fine(box(1.62, 0.02, 0.025, roofMat, 0, H + 0.185, z)));
					const fan = new T.Mesh(CYL, mat('#202326'));
					fan.scale.set(0.8, 0.06, 0.8);
					fan.position.set(0, H + 0.18, zc + 0.6);
					add(fan);
				} else if (panto) {
					// EN57: skrzynie oporników i przewody między pantografami
					for (const s of [-1, 1]) {
						add(box(0.9, 0.32, 2.4, mat('#3b3f44'), s * 0.6, H + 0.1, 0));
						add(box(0.85, 0.04, 2.3, grille, s * 0.6, H + 0.28, 0));
						for (let z = -1.1; z <= 1.1 + 1e-6; z += 0.14) add(fine(box(0.8, 0.02, 0.025, mat('#3b3f44'), s * 0.6, H + 0.305, z)));
					}
					// szyna WN na izolatorach między pantografami
					add(turned(CYL, mat('#b87333'), 0, H + 0.31, 0, 0.06, len * 0.62, 1));
					const insM = matS('#d8cfbf', { roughness: 0.35 });
					for (let z = -len * 0.28; z <= len * 0.28 + 1e-6; z += len * 0.14) {
						const c3 = new T.Mesh(INSUL_GEO, insM);
						c3.scale.set(0.06, 0.27, 0.06);
						c3.position.set(0, H + 0.02, z);
						add(c3);
					}
				}
			} else if (!st.diesel) {
				// skrzynia oporników rozruchowych (elektrowozy; spalinowozy mają w tym miejscu wentylatory): żaluzje wzdłuż
				// boków, na wierzchu krata nad ciemnym wnętrzem; skrzynia przesunięta, obok szyna WN na izolatorach
				const bw = kind === 'loco' && !st.diesel ? 1.3 : 1.7, bx = kind === 'loco' && !st.diesel ? -0.3 : 0;
				add(box(bw, 0.35, 4.2, roofMat, bx, H + 0.12, 0));
				add(box(bw - 0.2, 0.04, 3.8, grille, bx, H + 0.3, 0));
				for (const sx of [-1, 1]) for (const y of [0.03, 0.11, 0.19]) add(fine(box(0.025, 0.03, 3.9, grille, bx + sx * (bw / 2 + 0.01), H + y, 0)));
				for (let z = -1.85; z <= 1.85 + 1e-6; z += 0.15) add(fine(box(bw - 0.2, 0.02, 0.025, roofMat, bx, H + 0.33, z)));
				for (const x of [-0.33, 0, 0.33]) add(fine(box(0.025, 0.02, 3.8, roofMat, bx + x * (bw - 0.2), H + 0.335, 0)));
				if (kind !== 'loco') add(turned(CYL, mat('#b87333'), 0.9, H + 0.28, 0, 0.06, len * 0.6, 1)); // przewód WN
			}

			// przejście międzywagonowe (miech)
			// (lokomotywa ma czoło z kabiną – z wagonem łączą ją tylko zderzaki i sprzęg, bez miecha)
			if (i < n - 1 && kind !== 'loco' && kind !== 'cargo' && !noseR) {
				const bel = mat('#161616'), fold = mat('#262626');
				// 111A: wąskie przejście UIC (jak rama przejścia na ścianie czołowej); EN57 – szeroki miech
				const bw = kind === 'coach' ? 1.05 : 2.1, bh = kind === 'coach' ? 2.3 : 2.5, by = kind === 'coach' ? 2.5 : 2.4;
				add(box(bw, bh, t.gap + 0.5, bel, 0, by, hl + t.gap / 2));
				for (let k = 0; k < 5; k++) add(box(bw + 0.14, bh + 0.12, 0.06, fold, 0, by, hl - 0.2 + (k + 0.5) * ((t.gap + 0.4) / 5)));
			}
			if (kind === 'coach') {
				/* 111A: na obu ścianach czołowych przejście – czarna gumowa rama UIC (słupki, nadproże, próg) wystająca ze ściany,
				   w niej jasne drzwi przejściowe z oknem i klamką */
				const rub = mat('#141414'), doorC = paint('#d9d6cc'), metal = matS('#8d9196', { metalness: 0.8, roughness: 0.3 });
				for (const e of [-1, 1]) {
					const z0 = e * hl;
					for (const x of [-0.56, 0.56]) add(box(0.16, 2.35, 0.28, rub, x, 2.5, z0 + e * 0.13));
					add(box(1.28, 0.18, 0.28, rub, 0, 3.66, z0 + e * 0.13));
					add(box(1.28, 0.1, 0.3, rub, 0, 1.36, z0 + e * 0.13));
					add(box(0.96, 2.15, 0.04, doorC, 0, 2.45, z0 + e * 0.02));
					add(box(0.5, 0.6, 0.02, matS('#26323b', { roughness: 0.08, metalness: 0.3 }), 0, 2.95, z0 + e * 0.045)); // szyba (ciemna – za nią przejście)
					for (const y of [2.64, 3.26]) add(box(0.56, 0.04, 0.03, metal, 0, y, z0 + e * 0.05));
					add(box(0.04, 0.2, 0.05, metal, 0.36, 2.35, z0 + e * 0.06));
					this.endDetails(add, z0, e);
					/* latarnie sygnałowe na ścianie czołowej (jak na 111A): toczona obudowa, obręcz, czerwony klosz – na końcu
					   ostatniego wagonu świecą (sygnał końca pociągu) */
					const lit = i === n - 1 && e > 0;
					for (const x of [-0.98, 0.98]) {
						add(turned(LAMP_GEO, mat('#1e1e1e'), x, 1.62, z0 + e * 0.01, 0.12, 0.09, e));
						add(turned(RING_GEO, matS('#c9ccd0', { metalness: 0.95, roughness: 0.18 }), x, 1.62, z0 + e * 0.1, 0.1, 0.1, e));
						group.add(turned(LENS_GEO, lit ? this.tailMat : mat('#4a1210'), x, 1.62, z0 + e * 0.095, 0.085, 0.2, e));
					}
				}
			}
			// zderzaki między wagonami klasycznymi
			if (kind === 'coach') for (const sgn of [-1, 1]) this.buffers(add, sgn * (hl - 0.22), sgn, 'coach');

			// wnętrza kabin widoczne przez szyby (w kabinie prowadzącej maszynista)
			let room = null;
			if (noseF) room = this.cabRoom(group, kind, st, H, hl, -1, i === 0);
			if (noseR) this.cabRoom(group, kind, st, H, hl, 1, false);
			// czoła z kabinami
			this.curNum = (spec && spec.num) || null; // numer z wariantu – tabliczki na czole
			this.curBody = body; // wycieraczki dopasowywane do szyby promieniami na bryłę pudła
			this.curCarIdx = i;
			if (noseF) this.cabEnd(group, add, kind, st, H, hl, -1, i === 0 ? 'front' : 'none');
			if (noseR) this.cabEnd(group, add, kind, st, H, hl, 1, i === n - 1 ? 'rear' : 'none');
			else if (i === n - 1 && kind !== 'coach') for (const x of [-0.9, 0.9]) group.add(box(0.3, 0.3, 0.05, this.tailMat, x, 1.6, hl + 0.03));

			// pantografy
			if (t.electric && (t.pantographs ? t.pantographs.includes(i) : i === t.pantograph)) {
				const pz = st.pantoZ ? len * st.pantoZ : kind === 'loco' ? len * 0.27 : kind === 'cargo' ? len * 0.22 : len * 0.3;
				// dwa pantografy: podniesiony tylny (+z), przedni opuszczony; jednoramienne (single) albo nożycowe
				const one = kind === 'cargo' || st.single;
				// podniesiony pantograf we własnej grupie – przebudowywany przy podnoszeniu i opuszczaniu (setPanto)
				const pg = new T.Group();
				group.add(pg);
				const build = (h) => (one ? this.pantograph(pg, H, pz, h) : this.pantographDiamond(pg, H, pz, h, st.panto));
				const contact = build(1);
				this.pantoSets.push({ pg, build, h: 1 });
				if (one) this.pantograph(group, H, -pz, false);
				else this.pantographDiamond(group, H, -pz, false, st.panto);
				if (this.player && !this.spark) {
					/* łuk elektryczny na styku ślizgacza z przewodem: jasny rdzeń, błękitna poświata, odpryski (rozżarzone
					   drobiny miedzi) lecące do tyłu i opadające, krótkie mocne światło */
					const core = sprite(glowTexture(), 0.5, 0.5, { additive: true, color: 0xe8f0ff, fog: false });
					const halo = sprite(glowTexture(), 1.2, 1.2, { additive: true, color: 0x7f8cff, fog: false });
					for (const s2 of [core, halo]) {
						s2.position.set(0, contact.y + 0.02, contact.z);
						s2.material.opacity = 0;
						group.add(s2);
					}
					const N = 64, geo = new T.BufferGeometry();
					geo.setAttribute('position', new T.BufferAttribute(new Float32Array(N * 3), 3));
					geo.setAttribute('color', new T.BufferAttribute(new Float32Array(N * 3), 3));
					const pm = new T.PointsMaterial({ size: 0.11, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false });
					this.ownMats.push(pm);
					const pts = new T.Points(geo, pm);
					pts.frustumCulled = false;
					pts.userData.ownGeometry = true;
					group.add(pts);
					// mały zasięg – błysk oświetla pantograf i dach, a nie wnętrze kabiny
					const light = new T.PointLight(0x9fc8ff, 0, 10, 2);
					light.position.set(0, contact.y - 0.2, contact.z);
					group.add(light);
					this.spark = { core, halo, pts, light, y: contact.y, z: contact.z, parts: Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })), burst: 0 };
				}
			}

			this.finish(group, new Set([body]));
			return { group, len, doorZ, kind, st, H, bodyGeo, cab: noseF, room };
		}

		/* Wnętrze wagonu pasażerskiego: podłoga, ściany (z otworami okien i drzwi), sufit z pasami lamp, półki
		   bagażowe, ściany czołowe z drzwiami przejściowymi, przedsionki (przegrody, poręcze), fotele 2+2 w zestawach
		   naprzeciw siebie, siedzący pasażerowie. Powtarzalne bryły jako instancje – kilka wywołań rysowania na wagon. */
		interior(group, kind, len, z0, z1, doorZ, wins, DOOR_W, ci) {
			const M = this.inMats;
			const L = z1 - z0, zc = (z0 + z1) / 2;
			const FLOOR = 1.33, CEIL = 3.5, WX = 1.37;
			const parts = (list, material, geo) => {
				const m = new T.InstancedMesh(geo || GEO.box, material, Math.max(1, list.length));
				const m4 = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), sc = new T.Vector3();
				list.forEach(([w, h, d, x, y, z, col], k) => {
					m.setMatrixAt(k, m4.compose(p.set(x, y, z), q, sc.set(w, h, d)));
					if (col) m.setColorAt(k, col);
				});
				m.count = list.length;
				m.receiveShadow = true;
				if (m.instanceColor) m.instanceColor.needsUpdate = true;
				group.add(m);
				return m;
			};
			// odcinki [a, b] bez przedziałów „cut” (drzwi lub okna)
			const minus = (a, b, holes) => {
				const out = [];
				let cur = a;
				for (const [ha, hb] of holes.slice().sort((x, y) => x[0] - y[0])) {
					if (hb <= cur || ha >= b) continue;
					if (ha > cur) out.push([cur, ha]);
					cur = Math.max(cur, hb);
				}
				if (cur < b) out.push([cur, b]);
				return out;
			};
			const doors = doorZ.map((d) => [d - DOOR_W / 2, d + DOOR_W / 2]);
			const walls = [];
			// podłoga, sufit
			walls.push([2.86, 0.04, L, 0, FLOOR, zc]);
			const lowW = [], sills = [], curtains = [];
			for (const sx of [-1, 1]) {
				// dolna część ścian w ciemniejszym kolorze (dwukolorowe wnętrze), parapety pod oknami
				for (const [a, b] of minus(z0, z1, doors)) lowW.push([0.05, 0.97, b - a, sx * WX, FLOOR + 0.485, (a + b) / 2]);
				for (const [a, b] of minus(z0, z1, doors.concat(wins))) walls.push([0.05, 1.0, b - a, sx * WX, 2.8, (a + b) / 2]);
				walls.push([0.05, 0.22, L, sx * WX, 3.4, zc]);
				for (const [a, b] of wins) {
					if (b < z0 || a > z1) continue;
					sills.push([0.12, 0.03, b - a, sx * (WX - 0.06), 2.31, (a + b) / 2]);
					// zasłonki przy oknach przedziałów 111A (po stronie przedziałów)
					if (kind === 'coach' && sx > 0) for (const e of [a + 0.13, b - 0.13]) curtains.push([0.04, 0.95, 0.24, WX - 0.06, 2.78, e]);
				}
			}
			// ściany czołowe z drzwiami przejściowymi
			for (const zz of [z0, z1]) {
				walls.push([0.95, 2.2, 0.05, -0.95, 2.43, zz], [0.95, 2.2, 0.05, 0.95, 2.43, zz], [0.95, 0.2, 0.05, 0, 3.4, zz]);
			}
			// przegrody między przedsionkiem a przedziałem (przejście w środku); w 111A przedziały mają własne ściany
			if (kind !== 'coach') for (const d of doorZ) for (const sz of [-1, 1]) {
				const zz = d + sz * (DOOR_W / 2 + 0.55);
				if (zz <= z0 + 0.1 || zz >= z1 - 0.1) continue;
				walls.push([0.85, 2.0, 0.05, -0.95, 2.33, zz], [0.85, 2.0, 0.05, 0.95, 2.33, zz]);
			}
			parts(walls.slice(0, 1), M.floor);
			parts(walls.slice(1), M.wall);
			parts(lowW, M.wallLow);
			if (sills.length) parts(sills, M.seatFrame);
			if (curtains.length) parts(curtains, M.curtain);
			// chodnik w przejściu (EZT – między ławą 2- i 3-osobową, 111A – w korytarzu)
			const s4 = !!(this.curSt && this.curSt.seats4); // nowoczesne EZT: fotele 2 + 2, przejście w osi
			const ax = kind === 'ezt' && !s4 ? -0.11 : kind === 'coach' ? -0.96 : 0;
			parts([[kind === 'coach' ? 0.7 : 0.55, 0.01, L - 0.3, ax, FLOOR + 0.025, zc]], M.carpet);
			parts([[2.8, 0.04, L, 0, CEIL, zc]], M.ceil);
			parts([[0.22, 0.03, L - 0.4, -0.62, CEIL - 0.03, zc], [0.22, 0.03, L - 0.4, 0.62, CEIL - 0.03, zc]], M.lamp);
			// półki bagażowe nad oknami, drzwi przejściowe, poręcze w przedsionkach
			const frames = [];
			if (kind !== 'coach') for (const sx of [-1, 1]) for (const [a, b] of minus(z0 + 0.3, z1 - 0.3, doors.map(([a2, b2]) => [a2 - 0.6, b2 + 0.6]))) frames.push([0.42, 0.03, b - a, sx * 1.12, 3.27, (a + b) / 2]);
			for (const zz of [z0, z1]) frames.push([0.95, 2.0, 0.06, 0, 2.33, zz]);
			if (kind !== 'coach') parts(frames, M.seatFrame);
			const seatL = [], pax = [];
			const PEOPLE = ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d35400', '#34495e', '#e67e22', '#16a085', '#7f8c8d', '#2c3e50'];
			const SKIN = ['#e2b48f', '#c58c66', '#8d5a3b', '#f1c9a5'];
			// fotel w (x, z), wierzch siedziska na y, przodem do f; pasażer – gdy los mniejszy niż prawdopodobieństwo
			const seat = (x, y, z, f, hsh, pr) => {
				seatL.push({ x, y, z, f });
				if (hsh < pr) pax.push({ x, y, z, f, cloth: new T.Color(PEOPLE[Math.floor(hash(hsh * 97) * PEOPLE.length)]), skin: new T.Color(SKIN[Math.floor(hash(hsh * 53) * 4)]) });
			};
			if (kind === 'coach') {
				// 111A: korytarz wzdłuż lewej burty, dziesięć przedziałów po osiem miejsc (dwie ławy naprzeciw siebie)
				const hl = len / 2, cA = -hl + 2.45, cp = (len - 4.9) / 10, XW = -0.55;
				const pw = [];
				for (let k = 0; k <= 10; k++) pw.push([1.92, 2.05, 0.05, (XW + WX) / 2, FLOOR + 1.03, cA + k * cp]);
				for (let k = 0; k < 10; k++) {
					const cz = cA + cp * (k + 0.5);
					// ściana od korytarza z otworem drzwi (przesuwne drzwi odsunięte) i nadprożem
					pw.push([0.05, 2.05, (cp - 0.75) / 2, XW, FLOOR + 1.03, cz - cp / 2 + (cp - 0.75) / 4]);
					pw.push([0.05, 2.05, (cp - 0.75) / 2, XW, FLOOR + 1.03, cz + cp / 2 - (cp - 0.75) / 4]);
					pw.push([0.05, 0.12, 0.75, XW, CEIL - 0.1, cz]);
					for (const f of [-1, 1]) {
						// cztery miejsca z zagłówkami na każdej ławie, oparcie przy ścianie przedziału (przodem do środka)
						frames.push([1.6, 0.03, 0.34, (XW + WX) / 2, 3.12, cz + f * 0.78]);
						for (let s2 = 0; s2 < 4; s2++) {
							const hsh = hash(this.seed * 7.7 + ci * 31 + k * 4.1 + f * 1.7 + s2 * 0.37);
							seat(-0.27 + s2 * 0.44, 1.87, cz + f * 0.64, -f, hsh, 0.38);
						}
					}
					frames.push([0.3, 0.04, 0.5, WX - 0.18, 2.1, cz]); // stolik pod oknem
				}
				parts(pw, M.wall);
				parts(frames, M.seatFrame);
			}
			// fotele w zestawach naprzeciw siebie (EN57: ławy 2 + 3), pasażerowie
			const zones = kind === 'coach' ? [] : minus(z0 + 0.15, z1 - 0.15, doors.map(([a, b]) => [a - 0.6, b + 0.6]));
			const seatX = kind === 'ezt' && !s4 ? [-1.04, -0.6, 0.38, 0.78, 1.16] : [-0.98, -0.5, 0.5, 0.98];
			let r = 0;
			for (const [a, b] of zones) {
				const rows = Math.floor((b - a) / 0.95);
				const off = (b - a - rows * 0.95) / 2;
				for (let k = 0; k < rows; k++, r++) {
					const z = a + off + 0.475 + k * 0.95;
					const f = k % 2 === 0 ? 1 : -1; // kierunek patrzenia siedzącego
					for (const x of seatX) seat(x, 1.88, z + f * 0.02, f, hash(this.seed * 7.7 + ci * 31 + r * 4.1 + x), 0.42);
				}
			}
			this.seatsAndPeople(group, seatL, pax);
		}

		/* Fotele i siedzący pasażerowie (instancje). seats: { x, y – wierzch siedziska, z, f – kierunek patrzenia (+1 → +z) };
		   people: { x, y, z, f, cloth, skin } – w miejscu fotela (pasażer nieco ku oparciu). */
		seatsAndPeople(group, seats, people) {
			const M = this.inMats, SG = NS.props.seatGeos(), PG = NS.props.seatedPeople();
			const q = new T.Quaternion(), m4 = new T.Matrix4(), p = new T.Vector3(), one = new T.Vector3(1, 1, 1), up = new T.Vector3(0, 1, 0), o = new T.Vector3();
			const inst = (list, geo, material, off, colorKey) => {
				if (!list.length) return;
				const m = new T.InstancedMesh(geo, material, list.length);
				list.forEach((it, k) => {
					q.setFromAxisAngle(up, it.f > 0 ? Math.PI : 0);
					o.copy(off).applyQuaternion(q);
					m.setMatrixAt(k, m4.compose(p.set(it.x + o.x, it.y + o.y, it.z + o.z), q, one));
					if (colorKey) m.setColorAt(k, it[colorKey]);
				});
				if (m.instanceColor) m.instanceColor.needsUpdate = true;
				m.receiveShadow = true;
				group.add(m);
			};
			const zero = new T.Vector3();
			inst(seats, SG.soft, M.seat, zero);
			inst(seats, SG.hard, M.seatFrame, zero);
			const po = new T.Vector3(0, -0.48, 0.08);
			inst(people, PG.body, M.peopleV, po, 'cloth');
			inst(people, PG.head, M.skinV, po, 'skin');
		}

		// oświetlenie wnętrz: za dnia przygaszone (wnętrze w cieniu pudła), nocą lampy świecą (bloom, okna z zewnątrz)
		setInteriorLight(dark) {
			const night = dark > 0.1 ? Math.min(1, dark * 1.3) : 0;
			const M = this.inMats;
			M.wall.emissiveIntensity = 0.25 + 0.45 * night;
			M.ceil.emissiveIntensity = 0.3 + 0.6 * night;
			M.floor.emissiveIntensity = 0.2 + 0.4 * night;
			for (const k of ['seat', 'seatFrame', 'people', 'skin', 'peopleV', 'skinV', 'wallLow', 'carpet', 'curtain']) M[k].emissiveIntensity = 0.22 + 0.45 * night;
			M.lamp.color.setRGB(1, 0.98, 0.92).multiplyScalar(night ? 3.2 : 1.1);
			if (this.ddIn) { this.ddIn.wall.emissiveIntensity = 0.25 + 0.45 * night; this.ddIn.ceil.emissiveIntensity = 0.3 + 0.6 * night; }
		}

		// animacja drzwi: o – 0 zamknięte … 1 otwarte (najpierw odskok na zewnątrz, potem przesuw)
		setDoors(o) {
			const out = Math.min(1, o * 4);
			const slide = Math.max(0, Math.min(1, (o - 0.15) / 0.85));
			const sm = slide * slide * (3 - 2 * slide);
			for (const set of this.doorSets) {
				if (set.side !== (this.doorSide || 1)) continue; // otwierają się drzwi po stronie peronu
				for (const L of set.leaves) {
					L.leaf.position.x = L.x0 + Math.sign(L.x0) * 0.07 * out;
					L.leaf.position.z = L.z0 + L.dir * (set.lw + 0.02) * sm;
				}
			}
		}

		// wózki, koła i zderzaki wspólne dla wagonów towarowych
		chassis(group, len, add) {
			const hl = len / 2;
			add(box(2.7, 0.35, len - 0.6, mat('#262626'), 0, 1.05, 0));
			for (const bz of [-hl + 2.6, hl - 2.6]) this.bogie(group, add, bz, 1.8, WHEEL_R, 'coach');
			const bufMat = matS('#2a2a2a', { metalness: 0.6, roughness: 0.4 });
			for (const sgn of [-1, 1]) for (const x of [-0.88, 0.88]) {
				const b = new T.Mesh(CYL, bufMat);
				b.scale.set(0.28, 0.5, 0.28);
				b.rotation.x = Math.PI / 2;
				b.position.set(x, 1.15, sgn * (hl + 0.2));
				add(b);
			}
		}

		// wagony towarowe – prawdziwe typy (freightParts) na wózkach z obracającymi się kołami
		buildFreightCar(i, len) {
			const group = new T.Group();
			const shadows = this.shadows;
			const add = (o) => { o.castShadow = shadows; o.receiveShadow = true; group.add(o); return o; };
			const hl = len / 2;
			for (const bz of [-hl + 2.6, hl - 2.6]) this.bogie(group, add, bz, 1.8, 0.46, 'coach');
			const sp = this.train.specs && this.train.specs[i];
			let ti = sp && sp.ft !== undefined ? sp.ft : this.train.types ? this.train.types[i] : -1;
			if (!(ti >= 0)) ti = Math.max(0, FREIGHT_TYPES.findIndex((q) => Math.abs(q.len - len) < 0.3));
			const ft = FREIGHT_TYPES[ti];
			const seed = this.seed * 13.7 + i * 3.1;
			const color = ft.colors[Math.floor(hash(this.seed + (hash(this.seed) < 0.6 ? 0 : i) * 7.3) * ft.colors.length)];
			const M = {
				dark: mat('#232426'), steel: matS('#55595e', { metalness: 0.6, roughness: 0.45 }), coal: mat('#1b1b1c', { roughness: 0.95 }),
				wheel: matS('#3b3a38', { metalness: 0.6, roughness: 0.5 }), roof: matS('#8a8f93', { roughness: 0.6, metalness: 0.2 }),
			};
			for (const [geo, mk, x, y, z, sx, sy, sz, col, rot] of freightParts(ti, len, seed, color, false)) {
				// zderzaki z listy części (proste walce) – w modelu szczegółowym zastąpione pełnymi (buffers)
				if (this.detail && geo === 'cyl' && mk === 'steel' && rot === 'x' && Math.abs(Math.abs(x) - 0.88) < 1e-6) continue;
				const m = new T.Mesh(GEO[geo], mk === 'body' ? matS(col, { roughness: 0.75, metalness: 0.15 }) : M[mk]);
				m.scale.set(sx, sy, sz);
				if (rot === 'x') m.rotation.x = Math.PI / 2;
				else if (rot === 'z') m.rotation.z = Math.PI / 2;
				else if (typeof rot === 'number') m.rotation.x = rot;
				else if (Array.isArray(rot)) m.rotation.set(rot[0], rot[1], rot[2]);
				m.position.set(x, y, z);
				add(m);
			}
			/* model szczegółowy (skład gracza): zderzaki toczone, sprzęg śrubowy, przewody hamulcowe, stopnie manewrowe
			   i uchwyty na końcach, hamulec zespolony i ręczny; składy mijane – proste zderzaki z listy części (szybka
			   budowa w czasie jazdy) */
			if (this.detail) {
				const wall = ft.id !== 'Sgns';
				for (const e of [-1, 1]) {
					this.buffers(add, e * (hl - 0.6), e, 'coach');
					this.endDetails(add, e * (hl - 0.3), e, wall);
				}
				/* hamulec zespolony pod ostojnicą: cylinder hamulcowy, zbiornik pomocniczy z obejmami, zawór rozrządczy,
				   cięgła do wózków; hamulec ręczny – koło z boku ostojnicy przy jednym końcu */
				const band = mat('#1a1a1a');
				add(turned(CYL, M.dark, -0.45, 0.76, -0.6, 0.36, 0.55, 1));
				add(turned(CYL, M.dark, 0.45, 0.72, 0.5, 0.5, 0.9, 1));
				for (const dz of [0.15, 0.85]) add(fine(turned(CYL, band, 0.45, 0.72, dz, 0.52, 0.05, 1)));
				add(box(0.3, 0.3, 0.25, M.dark, 0, 0.82, -1.3));
				add(fine(box(0.04, 0.04, 2 * (hl - 2.6) - 2.2, M.steel, -0.45, 0.6, 0)));
				const hw = new T.Group();
				hw.position.set(-1.5, 1.05, hl - 1.1);
				hw.rotation.z = Math.PI / 2;
				const ring = new T.Mesh(RING_GEO, M.steel);
				ring.scale.setScalar(0.22);
				hw.add(ring);
				for (const a of [0, Math.PI / 3, -Math.PI / 3]) { const sp = boxU(0.42, 0.025, 0.025, M.steel, 0, 0, 0); sp.rotation.y = a; hw.add(sp); }
				hw.traverse((o) => { o.castShadow = shadows; o.receiveShadow = true; });
				group.add(fine(hw));
				add(fine(box(0.12, 0.04, 0.04, M.steel, -1.44, 1.05, hl - 1.1)));
			}
			// tarcze końca pociągu na ostatnim wagonie
			if (i === this.train.cars.length - 1) for (const x of [-0.9, 0.9]) this.endPlate(group, x, 1.6, len / 2 + 0.02);
			this.finish(group, new Set());
			return { group, len, doorZ: [] };
		}

		// Ustawia skład na torze: czoło na kilometrażu frontS, kierunek dir (+1 – jak pociąg gracza, −1 – z przeciwka),
		// odsunięcie toru d (0 – tor główny, −4.6 – drugi tor).
		// d – odsunięcie od osi toru: liczba albo funkcja kilometrażu (pociąg na torze z mapy)
		place(route, frontS, dir, d, yOff) {
			const t = this.train;
			const dAt = typeof d === 'function' ? d : () => d;
			let off = 0;
			const pA = this.pA, pB = this.pB;
			this.cars.forEach((car) => {
				const fx = frontS - dir * off;
				off += car.len + t.gap;
				const b = Math.min(3.5, car.len * 0.15);
				R.sidePoint(route, fx - dir * b, dAt(fx - dir * b), pA);
				R.sidePoint(route, fx - dir * (car.len - b), dAt(fx - dir * (car.len - b)), pB);
				if (yOff) { pA.y += yOff(fx - dir * b); pB.y += yOff(fx - dir * (car.len - b)); }
				const vx = pA.x - pB.x, vz = pA.z - pB.z;
				car.group.position.set((pA.x + pB.x) / 2, (pA.y + pB.y) / 2, (pA.z + pB.z) / 2);
				car.group.rotation.set(Math.atan2(pA.y - pB.y, Math.hypot(vx, vz)), Math.atan2(-vx, -vz), 0, 'YXZ');
			});
			for (const ws of this.wheelsets) ws.rotation.x = (-dir * frontS) / (ws.userData.r || WHEEL_R);
		}

		/* Pociąg tła / wagony na bocznicy: scalenie części każdego wagonu (bez animacji drzwi, pantografów, wycieraczek) –
		   osobno zostają zestawy kołowe (obracają się – scalone wewnątrz) i poziomy szczegółów (LOD – scalone wewnątrz
		   każdego poziomu). Tylko dla pociągów innych niż pociąg gracza. */
		compact() {
			if (this.player || this.compacted) return 0;
			this.compacted = true;
			const wheels = new Set(this.wheelsets);
			let n = 0;
			for (const car of this.cars) {
				n += NS.util.mergeMeshes(car.group, (o) => wheels.has(o) || o.isLOD);
				// wnętrza poziomów szczegółów (przełączane całe) – osobno
				car.group.traverse((o) => { if (o.isLOD) for (const l of o.levels) n += NS.util.mergeMeshes(l.object); });
			}
			// zestawy kołowe obracają się w całości – części każdego scalone
			for (const ws of this.wheelsets) n += NS.util.mergeMeshes(ws);
			return n;
		}

		// pociąg obok: tylko położenie i światła
		updateOther(route, frontS, dir, d, dark, yOff) {
			this.place(route, frontS, dir, d, yOff);
			const night = dark > 0.1;
			this.headMat.color.setRGB(1, 0.96, 0.78).multiplyScalar(night ? 2.6 : 1.4);
			this.tailMat.color.setRGB(1, 0.16, 0.12).multiplyScalar(night ? 4 : 1.4);
			this.setInteriorLight(dark);
		}

		// położenie drzwi (po stronie peronu, w świecie) – do animacji wsiadających pasażerów
		doorPoints() {
			const out = [];
			for (const car of this.cars) {
				for (const z of car.doorZ) out.push(car.group.localToWorld(new T.Vector3(1.6 * (this.doorSide || 1), 1.0, z)));
			}
			return out;
		}

		/* Wycieraczki czoła pociągu gracza: cykl tam i z powrotem (normalne ok. 40/min, szybkie ok. 60/min,
		   przerywane – co 5 s jeden cykl), po wyłączeniu dokańczają ruch do położenia spoczynkowego. Woda
		   i śnieg osiadają na szybie w czasie opadu, schną/topnieją bez niego; przetarte wycinki – od zera. */
		cycleWipers() {
			this.wiperMode = (this.wiperMode + 1) % 4;
			if (this.wiperMode === 1) this.wWait = 0;
			return this.wiperMode;
		}
		updateWipers(dt, v = 0) {
			const U = this.glassU;
			if (!U) return;
			/* krople na szybach bocznych: kierunek jazdy (oś −z pierwszego wagonu w świecie), przesunięcie wzoru –
			   do tyłu z prędkością zależną od pędu powietrza (od ok. 15 km/h), w dół grawitacyjnie (wolno, szybciej na
			   postoju); przy prędkości krople rozciągnięte w smugi */
			const g0 = this.cars[0] && this.cars[0].group;
			if (g0) {
				g0.updateWorldMatrix(true, false);
				const e = g0.matrixWorld.elements;
				U.uFwd.value.set(-e[8], -e[9], -e[10]).normalize();
				U.uOrg.value.set(e[12], e[13], e[14]);
			}
			const sp = Math.abs(v), air = Math.max(0, sp - 4);
			U.uFlow.value.x = (U.uFlow.value.x + Math.min(0.6, air * 0.012) * dt) % 1000;
			U.uFlow.value.y = (U.uFlow.value.y + (sp < 4 ? 0.02 : 0.008) * dt) % 1000;
			U.uStretch.value = 1 / (1 + Math.min(2, air * 0.06));
			const sets = this.wiperSets.filter((w) => w.car === 0 && w.sgn === -1).slice(0, 2);
			const W = this.weather || {}, rain = W.rain || 0, snow = W.snow || 0;
			const dW = rain * 0.22 * dt - (rain < 0.02 ? 0.015 * dt : 0), dS = snow * 0.05 * dt - (snow < 0.02 ? 0.006 * dt : 0);
			const clamp = (x, m) => Math.max(0, Math.min(m, x));
			U.uWG.value = clamp(U.uWG.value + dW, 4);
			U.uSG.value = clamp(U.uSG.value + dS, 3);
			// ślad na obrysie przetartego pola: rośnie, gdy wycieraczki zgarniają wodę albo śnieg (każdy ruch pióra),
			// schnie / topnieje powoli, gdy opad ustaje
			const sweeping = this.wiperMode > 0 || this.wPh > 0;
			U.uWR.value = clamp(U.uWR.value + (sweeping && rain > 0.02 ? (0.6 + rain) * 0.5 * dt : rain < 0.02 ? -0.01 * dt : 0), 3.2);
			U.uSR.value = clamp(U.uSR.value + (sweeping && snow > 0.02 ? (0.4 + snow) * 0.35 * dt : snow < 0.02 ? -0.004 * dt : 0), 3);
			for (let k = 0; k < 24; k++) { U.uWA.value[k] = clamp(U.uWA.value[k] + dW, 4); U.uSA.value[k] = clamp(U.uSA.value[k] + dS, 3); }
			// ruch: f – położenie w cyklu (0 spoczynek … 1 drugi koniec), kąt każdej wycieraczki od a0 do a1
			const period = [1.5, 1.5, 1.5, 0.95][this.wiperMode];
			const prev = this.wAng;
			if (this.wiperMode > 0 || this.wPh > 0) {
				if (this.wWait > 0) this.wWait -= dt;
				else {
					this.wPh += dt / period;
					if (this.wPh >= 1) { this.wPh = this.wiperMode > 0 ? this.wPh - 1 : 0; if (this.wiperMode === 1) { this.wPh = 0; this.wWait = 5; } }
				}
			}
			this.wAng = 0.5 * (1 - Math.cos(2 * Math.PI * this.wPh));
			this.wSpeed = (Math.abs(this.wAng - prev) / Math.max(1e-3, dt)) * 0.9;
			/* długie pióra, które w spoczynku leżą jedno na drugim i w ruchu by się przecinały: dolna wycieraczka (wLag.i)
			   rusza z opóźnieniem i wraca wcześniej – jej ruch w części cyklu [d, 1 − d] górnej (zawsze pod nią, jak w
			   prawdziwych układach z zachodzącymi piórami); także przy pracy przerywanej i dokańczaniu ruchu */
			if (this.wLag === undefined && sets.length === 2 && this.wInit) this.wLag = this.wiperLag(sets);
			this.wInit = true;
			const lagD = this.wLag ? this.wLag.d : 0;
			const phLag = lagD > 0 ? Math.max(0, Math.min(1, (this.wPh - lagD) / (1 - 2 * lagD))) : this.wPh;
			if (!this.wAngs) this.wAngs = [0, 0];
			const prevs = this.wAngs.slice();
			const lagI = this.wLag ? this.wLag.i : -1;
			this.wAngs = [0, 1].map((i) => (i === lagI ? 0.5 * (1 - Math.cos(2 * Math.PI * phLag)) : this.wAng));
			if (lagI >= 0 && phLag > 0) this.wSpeed = Math.max(this.wSpeed, (Math.abs(this.wAngs[lagI] - prevs[lagI]) / Math.max(1e-3, dt)) * 0.9);
			const w0 = sets[0];
			U.uWL.value = w0 ? w0.r + 0.03 : 0;
			U.uWD.value = w0 ? w0.dy : 0;
			// kąt spoczynku i zakres pracy każdej wycieraczki osobno (górna z dwóch zachodzących piór – wyżej)
			for (let i = 0; i < 2; i++) { const w = sets[i] || w0; U.uA0.value[i] = w ? w.a0 : 0; U.uSweep.value[i] = w ? w.a1 - w.a0 : 1; }
			sets.forEach((w, i) => {
				const ang = this.wAngs[i], lo = Math.min(prevs[i], ang), hi = Math.max(prevs[i], ang);
				w.R.rotation.z = w.s * (w.a0 + (w.a1 - w.a0) * ang);
				w.G.updateWorldMatrix(true, false);
				const e = w.G.matrixWorld.elements;
				U.uWP.value[i].set(e[12], e[13], e[14]);
				U.uWU.value[i].set(e[0], e[1], e[2]).normalize();
				U.uWV.value[i].set(e[4], e[5], e[6]).normalize();
				U.uWS.value[i] = w.s;
				if (hi - lo > 1e-4) for (let b = 0; b < 12; b++) {
					const f0 = b / 12, f1 = (b + 1) / 12;
					if (f1 >= lo && f0 <= hi) { U.uWA.value[i * 12 + b] = 0; U.uSA.value[i * 12 + b] *= 0.05; }
				}
			});
			if (sets.length === 1) { U.uWP.value[1].copy(U.uWP.value[0]); U.uWU.value[1].copy(U.uWU.value[0]); U.uWV.value[1].copy(U.uWV.value[0]); U.uWS.value[1] = U.uWS.value[0]; }
		}

		/* czy pióra dwóch wycieraczek przecinają się przy ruchu w tej samej fazie (rzut na płaszczyznę szyby pierwszej):
		   pióro – odcinek od 0,1 m do r od osi, przesunięty o dy w bok (jak w cieniowaniu mokrej szyby); pióra leżące
		   w spoczynku jedno na drugim się nie liczą. Wynik: null – bez kolizji, inaczej { i – dolna wycieraczka, d –
		   jej opóźnienie przy ruszaniu i wyprzedzenie przy powrocie (ułamek cyklu) }: najmniejsze bez kolizji. */
		wiperLag(sets) {
			const fr = sets.map((w) => {
				w.G.updateWorldMatrix(true, false);
				const e = w.G.matrixWorld.elements;
				return { P: new T.Vector3(e[12], e[13], e[14]), U: new T.Vector3(e[0], e[1], e[2]).normalize(), V: new T.Vector3(e[4], e[5], e[6]).normalize(), w };
			});
			const U0 = fr[0].U, V0 = fr[0].V, P0 = fr[0].P;
			const seg = (k, f) => {
				const { P, U, V, w } = fr[k], a = w.a0 + (w.a1 - w.a0) * f;
				const D = U.clone().multiplyScalar(w.s * Math.cos(a)).add(V.clone().multiplyScalar(Math.sin(a)));
				const N = U.clone().multiplyScalar(w.s * Math.cos(a + Math.PI / 2)).add(V.clone().multiplyScalar(Math.sin(a + Math.PI / 2)));
				return [0.1, w.r].map((t) => { const p = P.clone().addScaledVector(D, t).addScaledVector(N, w.dy).sub(P0); return [p.dot(U0), p.dot(V0)]; });
			};
			const hit = (A, B) => {
				const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
				const d1 = cr(B[0], B[1], A[0]), d2 = cr(B[0], B[1], A[1]), d3 = cr(A[0], A[1], B[0]), d4 = cr(A[0], A[1], B[1]);
				if (d1 * d2 < 0 && d3 * d4 < 0) return true;
				// odstęp końców poniżej 4 cm – też kolizja (grubość pióra)
				const dist = (p, a, b) => { const ux = b[0] - a[0], uy = b[1] - a[1], L2 = ux * ux + uy * uy || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / L2)); return Math.hypot(p[0] - a[0] - ux * t, p[1] - a[1] - uy * t); };
				return Math.min(dist(A[0], B[0], B[1]), dist(A[1], B[0], B[1]), dist(B[0], A[0], A[1]), dist(B[1], A[0], A[1])) < 0.04;
			};
			const ang = (ph) => 0.5 * (1 - Math.cos(2 * Math.PI * Math.max(0, ph)));
			if (fr[0].P.distanceTo(fr[1].P) < 0.05) return null; // ta sama oś (jedna wycieraczka liczona dwa razy)
			const collides = (i, d) => {
				for (let q = 1; q < 200; q++) {
					const ph = q / 200, pl = d > 0 ? Math.max(0, Math.min(1, (ph - d) / (1 - 2 * d))) : ph;
					const f0 = i === 0 ? ang(pl) : ang(ph), f1 = i === 1 ? ang(pl) : ang(ph);
					if (f0 < 0.03 && f1 < 0.03) continue; // obie w spoczynku – leżą jedna na drugiej
					if (hit(seg(0, f0), seg(1, f1))) return true;
				}
				return false;
			};
			if (!collides(-1, 0)) return null;
			// najpierw dolna (w spoczynku pod drugą – addWiper)
			const order = sets[0].lower ? [0, 1] : sets[1].lower ? [1, 0] : [1, 0];
			for (let d = 0.04; d <= 0.3; d += 0.02) for (const i of order) if (!collides(i, d)) return { i, d };
			return { i: order[0], d: 0.2 };
		}

		// położenie ramion podniesionych pantografów (0 – opuszczony, 1 – przy przewodzie)
		setPanto(h) {
			for (const P of this.pantoSets) {
				if (Math.abs(P.h - h) < 0.004) continue;
				P.pg.clear();
				P.build(h);
				P.h = h;
			}
		}
		// łuk przy opuszczeniu pantografu pod obciążeniem: seria jasnych wyładowań
		arcBurst() {
			if (!this.spark) return;
			this.spark.series = 4;
			this.spark.burst = 16;
			this.sparkT = 0.25;
		}

		update(sim, dark, dt) {
			this.place(sim.route, sim.st.pos, 1, 0);
			if (this.player && sim.panto) this.setPanto(sim.panto.h);
			if (this.player) this.updateWipers(dt, sim.st.v);
			// drzwi: otwieranie ok. 1,3 s, zamykanie ok. 1,6 s
			const target = sim.doorsOpen ? 1 : 0;
			// strona peronu najbliższej stacji (zmiana tylko przy zamkniętych drzwiach)
			if (this.doorAnim === 0) {
				const st = sim.route.stations[sim.service !== null && sim.service !== undefined ? sim.service : sim.next];
				this.doorSide = st && st.platform ? st.platform.side : 1;
			}
			if (this.doorAnim !== target) {
				this.doorAnim = target > this.doorAnim ? Math.min(1, this.doorAnim + dt / 1.3) : Math.max(0, this.doorAnim - dt / 1.6);
				this.setDoors(this.doorAnim);
			}
			const night = dark > 0.1;
			this.setInteriorLight(dark);
			this.headMat.color.setRGB(1, 0.96, 0.78).multiplyScalar(night ? 2.6 : 1.4);
			this.tailMat.color.setRGB(1, 0.16, 0.12).multiplyScalar(night ? 4 : 1.4);
			if (this.displayMat) this.displayMat.color.setScalar(night ? 1.8 : 1.1);
			this.headlight.intensity = night ? 170 * dark : 0;
			for (const g of this.headGlows) g.material.opacity = night ? Math.min(0.6, dark) : 0;
			// iskry z pantografu: łuki przy jeździe – częściej przy większej prędkości oraz w deszczu i śniegu (oblodzony,
			// mokry przewód), w seriach; nocą jasne i oświetlają dach, w dzień słabsze
			if (this.spark) {
				const S = this.spark, v = sim.st.v, W = this.weather || {};
				const wet = (W.rain || 0) + (W.snow || 0) * 1.3;
				const touching = !sim.panto || sim.panto.h >= 1;
				const rate = v > 3 && touching ? (0.12 + v / 50) * (1 + 3 * wet) : 0;
				this.sparkT -= dt;
				if (this.sparkT <= 0) {
					if (S.series > 0 && Math.random() < dt * 14) { S.series--; this.sparkT = 0.02 + Math.random() * 0.06; S.burst = 2 + Math.floor(Math.random() * 5); }
					else if (Math.random() < dt * rate) { this.sparkT = 0.03 + Math.random() * 0.12; S.burst = 4 + Math.floor(Math.random() * 10); S.series = Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 3) : 0; }
				}
				const on = this.sparkT > 0, night = dark > 0.15, vis = night ? 1 : 0.35;
				const f = on ? 0.5 + Math.random() * 0.5 : 0;
				S.core.material.opacity = f * vis;
				S.core.material.color.setRGB(2.2, 2.5, 3.2);
				S.core.scale.setScalar(0.3 + Math.random() * 0.45);
				S.halo.material.opacity = f * vis * 0.4;
				S.halo.material.color.setRGB(0.9, 1.0, 2.6);
				S.halo.scale.setScalar(0.8 + Math.random() * 1.0);
				S.light.intensity = on ? (night ? 45 : 8) * f : 0;
				// odpryski: wyrzucane z łuku (wzdłuż ślizgacza), do tyłu względem pociągu (+z), opadają i stygną
				if (on && S.burst > 0) {
					let k = Math.min(S.burst, 4);
					S.burst -= k;
					for (const q of S.parts) {
						if (k <= 0) break;
						if (q.life > 0) continue;
						k--;
						q.max = q.life = 0.25 + Math.random() * 0.5;
						q.x = (Math.random() - 0.5) * 1.1;
						q.y = S.y;
						q.z = S.z;
						q.vx = (Math.random() - 0.5) * 3;
						q.vy = Math.random() * 2.8 - 0.4;
						q.vz = 1.2 + v * 0.1 + Math.random() * 2.5;
					}
				}
				const pa = S.pts.geometry.attributes.position.array, ca = S.pts.geometry.attributes.color.array;
				S.parts.forEach((q, k) => {
					if (q.life > 0) {
						q.life -= dt;
						q.vy -= 9.8 * dt;
						q.x += q.vx * dt;
						q.y += q.vy * dt;
						q.z += q.vz * dt;
					}
					const a = Math.max(0, q.life / q.max);
					pa[k * 3] = q.x;
					pa[k * 3 + 1] = q.y;
					pa[k * 3 + 2] = q.z;
					// stygnięcie: biało-żółte → pomarańczowe → ciemne
					ca[k * 3] = a > 0 ? (2.2 + a) * vis : 0;
					ca[k * 3 + 1] = a > 0 ? (0.7 + 1.6 * a * a) * vis : 0;
					ca[k * 3 + 2] = a > 0 ? 0.6 * a * a * a * vis : 0;
				});
				S.pts.geometry.attributes.position.needsUpdate = true;
				S.pts.geometry.attributes.color.needsUpdate = true;
			}
		}

		dispose() {
			if (this.disposed) return;
			this.disposed = true;
			for (const c of this.cars) {
				this.scene.remove(c.group);
				c.group.traverse((o) => {
					if (o.userData.ownGeometry) o.geometry.dispose();
				});
				disposeTree(c.group);
			}
			for (const m of this.ownMats) m.dispose();
		}
	}

	TrainModel.OTHER = OTHER_TRAINS;
	TrainModel.freightTrain = freightTrain;
	NS.FREIGHT_TYPES = FREIGHT_TYPES;
	NS.freightParts = freightParts;
	NS.TrainModel = TrainModel;
})();
