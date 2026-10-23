/* Składy i trasy. Pozycje w metrach od początku linii, prędkości w km/h, pochylenia w ‰. */
(function (root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.TrainRoutes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
	'use strict';

	/* Katalog taboru (prawdziwe serie): lokomotywy, wagony pasażerskie i towarowe, zespoły trakcyjne.
	   len – długość ze zderzakami (m), mass – masa służbowa / wagonu (t; towarowe – ładowne), power – moc (kW),
	   force – siła pociągowa (kN), vmax – km/h, height – wysokość pudła w grze (m). model – bryła w js/3d/train.js,
	   variants – malowania: c – kolory nadpisujące styl bryły (pola jak w STYLES w train.js), num – przykładowy numer. */
	const STOCK = {
		EU07: {
			kind: 'loco', name: 'EU07', full: 'Elektrowóz EU07', model: 'loco', len: 15.9, mass: 80, power: 2000, force: 220, vmax: 125, electric: true, height: 4.05,
			desc: '„Siódemka” – najpopularniejszy elektrowóz PKP (Pafawag, licencja English Electric), 2000 kW. Ciągnie wszystko: od osobowych po pospieszne.',
			variants: [
				{ id: 'pkp', name: 'PKP – dwa odcienie zieleni', num: 'EU07-333', sw: ['#9cc4ab', '#9cc4ab', '#3f5a3e'] },
				{ id: 'pkp70', name: 'PKP – zielona z pomarańczowym czołem (lata 70.)', num: 'EU07-038', sw: ['#2f5d3a', '#e8862a', '#2f5d3a'], c: { paint: '#2f5d3a', band: '#284f32', door: '#2f5d3a', frame: '#2f5d3a', front: '#e8862a', ribs: false } },
				{ id: 'ic', name: 'PKP Intercity – szaro-granatowa', num: 'EP07-1048', sw: ['#a8acaf', '#a8acaf', '#1c2f5e'], c: { paint: '#a8acaf', band: '#1c2f5e', door: '#a8acaf', frame: '#a8acaf', front: '#1c2f5e', splitY: 1.9, ribs: false, roof: '#6d7175' } },
				{ id: 'cargo', name: 'PKP Cargo – szaro-granatowa', num: 'EU07-1601', sw: ['#c9cccb', '#c8102e', '#1f3a70'], c: { paint: '#c9cccb', band: '#1f3a70', door: '#c9cccb', frame: '#c9cccb', front: '#f2c200', splitY: 1.9, ribs: false, roof: '#80878c' } },
			],
		},
		SM42: {
			kind: 'loco', name: 'SM42', full: 'Spalinowóz SM42', model: 'sm42', len: 14.24, mass: 72, power: 588, force: 165, vmax: 90, electric: false, height: 4.29,
			desc: '„Eska” z Fabloku – spalinowa, 588 kW, 90 km/h. Na liniach niezelektryfikowanych ciągnie lekkie składy osobowe.',
			variants: [
				{ id: 'pkp', name: 'PKP – zielono-kremowa', num: 'SM42-1003', sw: ['#2e8a6a', '#e6d19a', '#2e8a6a'] },
				{ id: 'red', name: 'PKP – czerwona z kremowym pasem', num: 'SM42-524', sw: ['#c8462d', '#e8c860', '#c8462d'], c: { paint: '#c8462d', band: '#c8462d', roof: '#c8462d', door: '#c8462d', stripe: '#e8c860' } },
				{ id: 'cargo', name: 'PKP Cargo – szara', num: 'SM42-900', sw: ['#c9cccb', '#c8102e', '#c9cccb'], c: { paint: '#c9cccb', band: '#c9cccb', roof: '#c9cccb', door: '#c9cccb', stripe: '#c8102e', head: '#f2c200' } },
			],
		},
		EP09: {
			kind: 'loco', name: 'EP09', full: 'Elektrowóz pasażerski EP09', model: 'ep09', len: 16.74, mass: 83.5, power: 2920, force: 210, vmax: 160, electric: true, height: 4.05,
			desc: 'Szybki elektrowóz pasażerski z Pafawagu – 2920 kW, 160 km/h. Prowadził ekspresy na CMK.',
			variants: [
				{ id: 'pkp', name: 'PKP – pomarańczowo-brązowa z kremowym pasem', num: 'EP09-030', sw: ['#b5502a', '#e8d27a', '#b5502a'] },
				{ id: 'ic', name: 'PKP Intercity – szaro-granatowa', num: 'EP09-025', sw: ['#a8acaf', '#a8acaf', '#1c2f5e'], c: { paint: '#a8acaf', band: '#1c2f5e', door: '#a8acaf', frame: '#a8acaf', splitY: 1.9, belt: null } },
				{ id: 'cargo', name: 'PKP Cargo – biało-granatowa z czerwonym paskiem', num: 'EP09-029', sw: ['#e6e6e3', '#c8102e', '#1f3a70'], c: { paint: '#e6e6e3', band: '#1f3a70', stripe: '#c8102e', door: '#e6e6e3', frame: '#e6e6e3', splitY: 1.85, belt: [1.85, 1.97] } },
			],
		},
		ET22: {
			kind: 'loco', name: 'ET22', full: 'Elektrowóz towarowy ET22', model: 'et22', len: 19.24, mass: 120, power: 3000, force: 400, vmax: 125, electric: true, height: 4.1,
			desc: '„Byk” – sześcioosiowy elektrowóz towarowy, 3000 kW. Ciężkie składy z węglem i kontenerami.',
			variants: [
				{ id: 'cargo', name: 'PKP Cargo – szara z granatowym dołem', num: 'ET22-1153', sw: ['#c9cccb', '#c8102e', '#1f3a70'] },
				{ id: 'blue', name: 'PKP Cargo – niebieska z zielonym pasem', num: 'ET22-1032', sw: ['#1d5486', '#76b041', '#1d5486'], c: { paint: '#1d5486', band: '#1d5486', door: '#1d5486', frame: '#1d5486', stripe: '#76b041', belt: [1.3, 1.62] } },
				{ id: 'green', name: 'PKP – zielona z żółtym pasem (lata 90.)', num: 'ET22-939', sw: ['#2f5d3a', '#f2c200', '#2f5d3a'], c: { paint: '#2f5d3a', band: '#2f5d3a', door: '#2f5d3a', frame: '#2f5d3a', stripe: '#f2c200', belt: [2.1, 2.28] } },
				{ id: 'olive', name: 'PKP – oliwkowa (lata 80.)', num: 'ET22-676', sw: ['#5a5e3a', '#5a5e3a', '#5a5e3a'], c: { paint: '#5a5e3a', band: '#5a5e3a', door: '#5a5e3a', frame: '#5a5e3a', stripe: '#5a5e3a', head: '#a52019' } },
			],
		},
		ST44: {
			kind: 'loco', name: 'ST44', full: 'Spalinowóz towarowy ST44', model: 'st44', len: 17.55, mass: 116.5, power: 1472, force: 370, vmax: 100, electric: false, height: 4.2,
			desc: '„Gagarin” (radziecka M62) – sześcioosiowy spalinowóz towarowy, 1472 kW. Charakterystyczny głośny diesel.',
			variants: [
				{ id: 'pkp', name: 'PKP – zielona z żółtym pasem', num: 'ST44-1201', sw: ['#3b6b40', '#e8c860', '#3b6b40'] },
				{ id: 'cargo', name: 'PKP Cargo – szara z granatowym dołem', num: 'ST44-2001', sw: ['#c9cccb', '#c8102e', '#1f3a70'], c: { paint: '#c9cccb', band: '#1f3a70', stripe: '#c8102e', door: '#c9cccb', frame: '#c9cccb', splitY: 1.62, belt: [1.62, 1.74], head: '#f2c200' } },
			],
		},
		SU46: {
			kind: 'loco', name: 'SU46', full: 'Spalinowóz pasażerski SU46', model: 'su46', len: 18.99, mass: 105, power: 1654, force: 316, vmax: 120, electric: false, height: 4.1,
			desc: 'Sześcioosiowy spalinowóz z HCP – 1654 kW, 120 km/h. Pospieszne na liniach bez sieci.',
			variants: [
				{ id: 'pkp', name: 'PKP – czerwono-brązowa z kremowym pasem', num: 'SU46-033', sw: ['#8e3a2c', '#e8d9a8', '#8e3a2c'] },
				{ id: 'cargo', name: 'PKP Cargo – szara z granatowym dołem', num: 'SU46-048', sw: ['#c9cccb', '#c8102e', '#1f3a70'], c: { paint: '#c9cccb', band: '#1f3a70', stripe: '#c8102e', door: '#c9cccb', frame: '#c9cccb', splitY: 1.62, belt: [1.62, 1.74], head: '#f2c200' } },
			],
		},
		'111A': {
			kind: 'coach', name: '111A', full: 'Wagon 2. klasy 111A (przedziałowy)', model: 'coach', len: 24.5, mass: 38, vmax: 120, height: 4.05,
			desc: 'Wagon przedziałowy 2. klasy, 10 przedziałów, okna opuszczane – klasyka pociągów pospiesznych.',
			variants: [
				{ id: 'pkp', name: 'PKP – zielony z kremowym pasem', sw: ['#4f9a6c', '#ddd2bd', '#4f9a6c'] },
				{ id: 'green', name: 'PKP – butelkowa zieleń', sw: ['#2f4f38', '#2f4f38', '#2f4f38'], c: { paint: '#2f4f38', stripe: '#2f4f38', band: '#2f4f38', door: '#2f4f38', text: '#e8e2cf' } },
				{ id: 'tlk', name: 'PKP Intercity TLK – granatowo-szary', sw: ['#1c2f5e', '#d9dadb', '#1c2f5e'], c: { paint: '#1c2f5e', stripe: '#d9dadb', band: '#1c2f5e', door: '#d9dadb', text: '#d9dadb' } },
				{ id: 'pr', name: 'Przewozy Regionalne – niebiesko-biały', sw: ['#1f4e9a', '#e3e3de', '#1f4e9a'], c: { paint: '#1f4e9a', stripe: '#e3e3de', band: '#1f4e9a', door: '#e3e3de', text: '#e3e3de' } },
			],
		},
		'120A': {
			kind: 'coach', name: '120A', full: 'Wagon 2. klasy 120A (bezprzedziałowy)', model: 'c120', len: 24.5, mass: 39, vmax: 120, height: 4.05,
			desc: 'Wagon bezprzedziałowy 2. klasy – otwarta sala, okna w równym rytmie po obu stronach.',
			variants: [
				{ id: 'pkp', name: 'PKP – zielony z kremowym pasem', sw: ['#4f9a6c', '#ddd2bd', '#4f9a6c'] },
				{ id: 'tlk', name: 'PKP Intercity TLK – granatowo-szary', sw: ['#1c2f5e', '#d9dadb', '#1c2f5e'], c: { paint: '#1c2f5e', stripe: '#d9dadb', band: '#1c2f5e', door: '#d9dadb', text: '#d9dadb' } },
				{ id: 'pr', name: 'Przewozy Regionalne – niebiesko-biały', sw: ['#1f4e9a', '#e3e3de', '#1f4e9a'], c: { paint: '#1f4e9a', stripe: '#e3e3de', band: '#1f4e9a', door: '#e3e3de', text: '#e3e3de' } },
			],
		},
		A9: {
			kind: 'coach', name: 'A9', full: 'Wagon 1. klasy A9 (typ Z1)', model: 'a9', len: 26.4, mass: 50, vmax: 160, height: 4.05,
			desc: 'Dalekobieżny wagon 1. klasy typu Z1 – 9 przedziałów, 160 km/h.',
			variants: [
				{ id: 'ic', name: 'PKP Intercity – biały z granatowym dołem', sw: ['#5a5e63', '#f0f0ee', '#1c2f5e'] },
				{ id: 'ic00', name: 'PKP Intercity – szary (lata 2000.)', sw: ['#1c2f5e', '#d9dadb', '#1c2f5e'], c: { paint: '#d9dadb', stripe: '#1c2f5e', door: '#d9dadb' } },
				{ id: 'pkp', name: 'PKP – zielony z żółtym pasem 1. klasy', sw: ['#f2c200', '#2f4f38', '#2f4f38'], c: { paint: '#2f4f38', band: '#2f4f38', stripe: '#f2c200', door: '#2f4f38', text: '#e8e2cf', zones: [[3.3, 3.42, 1]] } },
			],
		},
		B10: {
			kind: 'coach', name: 'B10', full: 'Wagon 2. klasy B10 (typ Z1)', model: 'b10', len: 26.4, mass: 50, vmax: 160, height: 4.05,
			desc: 'Dalekobieżny wagon 2. klasy typu Z1 – 10 przedziałów, 160 km/h.',
			variants: [
				{ id: 'ic', name: 'PKP Intercity – biały z granatowym dołem', sw: ['#5a5e63', '#f0f0ee', '#1c2f5e'] },
				{ id: 'ic00', name: 'PKP Intercity – szary (lata 2000.)', sw: ['#1c2f5e', '#d9dadb', '#1c2f5e'], c: { paint: '#d9dadb', stripe: '#1c2f5e', door: '#d9dadb' } },
				{ id: 'pkp', name: 'PKP – zielony', sw: ['#2f4f38', '#2f4f38', '#2f4f38'], c: { paint: '#2f4f38', band: '#2f4f38', stripe: '#2f4f38', door: '#2f4f38', text: '#e8e2cf' } },
			],
		},
		Bdhpumn: {
			kind: 'coach', name: 'Bdhpumn', full: 'Wagon piętrowy Bdhpumn', model: 'dd', len: 26.8, mass: 50, vmax: 120, height: 4.65,
			desc: 'Piętrus z Görlitz – dwa pokłady, dużo miejsc. Typowy w ruchu podmiejskim.',
			variants: [
				{ id: 'pkp', name: 'PKP – niebieski z żółtym pasem', sw: ['#c3c8cd', '#f2c418', '#2f6fb2'] },
				{ id: 'green', name: 'PKP – zielony z kremowym pasem', sw: ['#c3c8cd', '#e8ddb5', '#2f4f38'], c: { paint: '#2f4f38', stripe: '#e8ddb5', band: '#e8ddb5', door: '#2f4f38' } },
				{ id: 'polregio', name: 'Polregio – biały z czerwonym pasem', sw: ['#c3c8cd', '#e8461e', '#e9eaea'], c: { paint: '#e9eaea', stripe: '#e8461e', band: '#e8461e', door: '#1b2a4a' } },
			],
		},
		EN57: {
			kind: 'emu', name: 'EN57', full: 'Elektryczny zespół trakcyjny EN57', model: 'ezt', cars: [20.7, 21.0, 20.7], panto: 1, mass: 126, power: 580, force: 95, vmax: 110, electric: true, height: 3.95, maxUnits: 3,
			desc: '„Kibel” – trzy wagony, 110 km/h. Najliczniejszy EZT w Polsce; zespoły można łączyć.',
			variants: [
				{ id: 'retro', name: 'Retro – granatowo-żółty', num: 'EN57-038', sw: ['#b4b9c0', '#f4cb10', '#16357a'], c: { wiperTop: true } },
				{ id: 'pkp', name: 'PKP – granatowo-kremowy (lata 90.)', num: 'EN57-1234', sw: ['#b4b9c0', '#e9c46a', '#1e2c5a'], c: { paint: '#1e2c5a', stripe: '#e9c46a', band: '#e9c46a', door: '#e9c46a', wiperTop: true } },
				{ id: 'pr', name: 'Przewozy Regionalne – biało-granatowy z błękitem', num: 'EN57-1530', sw: ['#e6e7e8', '#3fa9f5', '#1b2a5a'], c: { paint: '#1b2a5a', stripe: '#e6e7e8', band: '#e6e7e8', door: '#3fa9f5', roof: '#9aa0a6', wiperTop: true } },
				{ id: 'polregio', name: 'Polregio – biało-granatowy z czerwienią', num: 'EN57AL-1652', sw: ['#e9eaea', '#e8461e', '#1b2a4a'], c: { paint: '#1b2a4a', stripe: '#e9eaea', band: '#e9eaea', door: '#e8461e', roof: '#9aa0a6' } },
				{ id: 'ks', name: 'Koleje Śląskie – biało-żółty z czerwonym', num: 'EN57AKŚ-1178', sw: ['#f2f2f2', '#e30613', '#ffcc00'], c: { paint: '#ffcc00', stripe: '#f2f2f2', band: '#f2f2f2', door: '#e30613', roof: '#a7acb1' } },
				{ id: 'km', name: 'Koleje Mazowieckie – biało-zielony z żółtym', num: 'EN57KM-1486', sw: ['#f2f2f2', '#ffd100', '#00843d'], c: { paint: '#00843d', stripe: '#f2f2f2', band: '#f2f2f2', door: '#ffd100', roof: '#a7acb1' } },
			],
		},
		EN71: {
			kind: 'emu', name: 'EN71', full: 'Elektryczny zespół trakcyjny EN71', model: 'en71', cars: [21.4, 21.6, 21.6, 21.4], panto: [1, 2], mass: 182, power: 1160, force: 190, vmax: 110, electric: true, height: 3.95, maxUnits: 2,
			desc: 'Czterowagonowy „brat” EN57 – dwa wagony silnikowe, 1160 kW. Dużo miejsc w ruchu aglomeracyjnym.',
			variants: [
				{ id: 'pkp', name: 'PKP – granatowo-kremowy', num: 'EN71-039', sw: ['#b4b9c0', '#e9c46a', '#1e2c5a'], c: { paint: '#1e2c5a', stripe: '#e9c46a', band: '#e9c46a', door: '#e9c46a', wiperTop: true } },
				{ id: 'polregio', name: 'Polregio – biało-granatowy z czerwienią', num: 'EN71-022', sw: ['#e9eaea', '#e8461e', '#1b2a4a'], c: { paint: '#1b2a4a', stripe: '#e9eaea', band: '#e9eaea', door: '#e8461e', roof: '#9aa0a6' } },
				{ id: 'ks', name: 'Koleje Śląskie – biało-żółty z czerwonym', num: 'EN71AKŚ-101', sw: ['#f2f2f2', '#e30613', '#ffcc00'], c: { paint: '#ffcc00', stripe: '#f2f2f2', band: '#f2f2f2', door: '#e30613', roof: '#a7acb1' } },
			],
		},
		ED72: {
			kind: 'emu', name: 'ED72', full: 'Elektryczny zespół trakcyjny ED72', model: 'ed72', cars: [21.4, 21.6, 21.6, 21.4], panto: [1, 2], mass: 182, power: 1400, force: 200, vmax: 120, electric: true, height: 3.95, maxUnits: 2,
			desc: 'Dalekobieżny zespół z Pafawagu – większe okna, sprzęg Scharfenberga, 120 km/h.',
			variants: [
				{ id: 'pkp', name: 'PKP – czerwono-kremowy', num: 'ED72-005', sw: ['#b4b9c0', '#e9c46a', '#a8262b'] },
				{ id: 'ir', name: 'interREGIO – szaro-granatowy', num: 'ED72A-004', sw: ['#d9dadb', '#d7262e', '#1b2a5a'], c: { paint: '#1b2a5a', stripe: '#d9dadb', band: '#d9dadb', door: '#d7262e', roof: '#9aa0a6' } },
			],
		},
		/* Nowoczesne zespoły (model 'elf' / 'ed250' w train.js): czoło opływowe, sprzęg Scharfenberga, pantografy
		   jednoramienne. articulated – wózki Jakobsa między członami (Elf: Bo'2'2'Bo' itd.); aero – mnożnik oporu
		   powietrza (opływowe czoło). Dane wg Wikipedii; 48WE (Elf 2) – długość z doniesień (> 90 m), moc i masa
		   przybliżone; długości członów dobrane tak, by cały skład (z odstępami 0,9 m) miał długość rzeczywistą. Malowania przybliżone wg zdjęć: paint – czoło i dół, stripe – pas okien, band – pudło,
		   trim – cienki pas pod oknami. */
		ED250: {
			kind: 'emu', name: 'ED250', full: 'Elektryczny zespół trakcyjny ED250 „Pendolino”', model: 'ed250', cars: [27.4, 25.4, 25.4, 25.4, 25.4, 25.4, 27.4], panto: [3, 4], mass: 410, power: 5500, force: 210, vmax: 200, electric: true, height: 3.9, maxUnits: 1, aero: 0.6,
			desc: 'Alstom Pendolino – siedem wagonów, 5,5 MW, w Polsce 200 km/h. Express Intercity Premium.',
			variants: [
				{ id: 'eip', name: 'PKP Intercity (EIP) – biały z granatowym dołem i niebieskim pasem', num: 'ED250-001', sw: ['#eceeef', '#2f6fb2', '#1c2f5e'], c: { paint: '#1c2f5e', stripe: '#24292e', band: '#eceeef', trim: '#2f6fb2', door: '#eceeef', apron: '#1c2f5e' } },
				{ id: 'ic', name: 'PKP Intercity – biało-srebrny z grafitowym dołem', num: 'ED250-012', sw: ['#eceeef', '#2a2e33', '#3b4046'] },
			],
		},
		EN96: {
			kind: 'emu', name: 'EN96', full: 'Elektryczny zespół trakcyjny EN96 (Pesa Elf 34WE)', model: 'elf', cars: [20.9, 20.9], panto: 1, mass: 83, power: 1600, force: 130, vmax: 160, electric: true, height: 3.95, maxUnits: 3, articulated: true, aero: 0.8,
			desc: 'Dwuczłonowy Elf (Bo\'2\'Bo\') – niska podłoga, 1600 kW, 160 km/h. Lekki i żwawy na liniach lokalnych.',
			variants: [
				{ id: 'polregio', name: 'Polregio – biało-czerwony z granatem', num: 'EN96-004', sw: ['#eceeef', '#1b2a4a', '#e8461e'], c: { paint: '#e8461e', stripe: '#1b2a4a', band: '#eceeef', trim: '#1b2a4a', door: '#e8461e' } },
				{ id: 'ks', name: 'Koleje Śląskie – biało-żółty z czerwonym', num: '34WEa-002', sw: ['#f2f2f2', '#e30613', '#ffcc00'] },
			],
		},
		EN62: {
			kind: 'emu', name: 'EN62', full: 'Elektryczny zespół trakcyjny EN62 (Pesa Elf 21WE)', model: 'elf', cars: [20.4, 16.35, 20.4], panto: 1, mass: 107, power: 1600, force: 140, vmax: 160, electric: true, height: 3.95, maxUnits: 3, articulated: true, aero: 0.8,
			desc: 'Trzyczłonowy Elf (Bo\'2\'2\'Bo\'), 59 m – niska podłoga, 160 km/h. Typowy w ruchu regionalnym.',
			variants: [
				{ id: 'polregio', name: 'Polregio – biało-czerwony z granatem', num: 'EN62-001', sw: ['#eceeef', '#1b2a4a', '#e8461e'], c: { paint: '#e8461e', stripe: '#1b2a4a', band: '#eceeef', trim: '#1b2a4a', door: '#e8461e' } },
				{ id: 'ks', name: 'Koleje Śląskie – biało-żółty z czerwonym', num: '21WEa-003', sw: ['#f2f2f2', '#e30613', '#ffcc00'] },
			],
		},
		EN76: {
			kind: 'emu', name: 'EN76', full: 'Elektryczny zespół trakcyjny EN76 (Pesa Elf 22WE)', model: 'elf', cars: [20.4, 15.9, 15.9, 20.4], panto: [1, 2], mass: 135, power: 2000, force: 180, vmax: 160, electric: true, height: 3.95, maxUnits: 2, articulated: true, aero: 0.8,
			desc: 'Czteroczłonowy Elf (Bo\'2\'2\'2\'Bo\'), 75 m, 2000 kW – najliczniejszy Elf w Polsce.',
			variants: [
				{ id: 'ks', name: 'Koleje Śląskie – biało-żółty z czerwonym', num: 'EN76-008', sw: ['#f2f2f2', '#e30613', '#ffcc00'] },
				{ id: 'km', name: 'Koleje Mazowieckie – biało-zielony z żółtym', num: 'EN76-030', sw: ['#f2f2f2', '#ffd100', '#00843d'], c: { paint: '#00843d', stripe: '#24292e', band: '#f2f2f2', trim: '#ffd100', door: '#ffd100' } },
				{ id: 'polregio', name: 'Polregio – biało-czerwony z granatem', num: 'EN76-022', sw: ['#eceeef', '#1b2a4a', '#e8461e'], c: { paint: '#e8461e', stripe: '#1b2a4a', band: '#eceeef', trim: '#1b2a4a', door: '#e8461e' } },
				{ id: 'kw', name: 'Koleje Wielkopolskie – biało-zielony', num: 'EN76-011', sw: ['#f2f2f2', '#24292e', '#3a9a3e'], c: { paint: '#3a9a3e', stripe: '#24292e', band: '#f2f2f2', trim: '#3a9a3e', door: '#3a9a3e' } },
			],
		},
		'48WE': {
			kind: 'emu', name: '48WE', full: 'Elektryczny zespół trakcyjny Pesa Elf 2 (48WE)', model: 'elf2', cars: [20.6, 16.1, 16.1, 16.1, 20.6], panto: [1, 3], mass: 165, power: 2000, force: 190, vmax: 160, electric: true, height: 3.95, maxUnits: 2, articulated: true, aero: 0.75,
			desc: 'Pięcioczłonowy Elf 2, ponad 90 m i ok. 250 miejsc – nowsze, bardziej zaokrąglone czoło.',
			variants: [
				{ id: 'kd', name: 'Koleje Dolnośląskie – biało-żółty', num: '48WEc-021', sw: ['#f2f2f2', '#24292e', '#f6b800'], c: { paint: '#f6b800', stripe: '#24292e', band: '#f2f2f2', trim: '#f6b800', door: '#f6b800' } },
				{ id: 'kw', name: 'Koleje Wielkopolskie – biało-zielony', num: '48WE-005', sw: ['#f2f2f2', '#24292e', '#3a9a3e'], c: { paint: '#3a9a3e', stripe: '#24292e', band: '#f2f2f2', trim: '#3a9a3e', door: '#3a9a3e' } },
			],
		},
		'27WE': {
			kind: 'emu', name: '27WE', full: 'Elektryczny zespół trakcyjny Pesa Elf 27WE', model: 'elf', cars: [19.8, 15.95, 15.95, 15.95, 15.95, 19.8], panto: [1, 4], mass: 190, power: 3200, force: 260, vmax: 160, electric: true, height: 3.95, maxUnits: 1, articulated: true, aero: 0.8,
			desc: 'Sześcioczłonowy Elf (Bo\'2\'Bo\'2\'Bo\'2\'Bo\'), 108 m, osiem silników – 3200 kW. SKM Warszawa.',
			variants: [
				{ id: 'skm', name: 'SKM Warszawa – biało-czerwony z żółtym', num: '27WE-007', sw: ['#f2f2f2', '#ffcc00', '#d71920'], c: { paint: '#d71920', stripe: '#24292e', band: '#f2f2f2', trim: '#ffcc00', door: '#ffcc00' } },
				{ id: 'ks', name: 'Koleje Śląskie – biało-żółty z czerwonym', num: '27WEb-004', sw: ['#f2f2f2', '#e30613', '#ffcc00'] },
			],
		},
		// wagony towarowe (ft – indeks FREIGHT_TYPES w train.js), masa z ładunkiem
		Eaos: { kind: 'wagon', name: 'Eaos', full: 'Węglarka Eaos', model: 'freight', ft: 0, len: 14.04, mass: 80, vmax: 100, height: 4.1, desc: 'Węglarka czteroosiowa – węgiel, kruszywo, złom.', variants: [{ id: 'std', name: 'różne kolory' }] },
		Falns: { kind: 'wagon', name: 'Falns', full: 'Wagon samowyładowczy Falns', model: 'freight', ft: 1, len: 15.74, mass: 90, vmax: 100, height: 4.1, desc: 'Samowyładowczy do węgla – typowy na Śląsku.', variants: [{ id: 'std', name: 'różne kolory' }] },
		Zacns: { kind: 'wagon', name: 'Zacns', full: 'Cysterna Zacns', model: 'freight', ft: 2, len: 16.2, mass: 85, vmax: 100, height: 4.1, desc: 'Cysterna na paliwa płynne.', variants: [{ id: 'std', name: 'różne kolory' }] },
		Sgns: { kind: 'wagon', name: 'Sgns', full: 'Platforma kontenerowa Sgns', model: 'freight', ft: 3, len: 19.64, mass: 60, vmax: 120, height: 4.1, desc: 'Platforma na kontenery 20′ i 40′.', variants: [{ id: 'std', name: 'różne kolory' }] },
		Habbiins: { kind: 'wagon', name: 'Habbiins', full: 'Wagon kryty Habbiins', model: 'freight', ft: 4, len: 23.0, mass: 65, vmax: 120, height: 4.1, desc: 'Kryty z przesuwnymi ścianami – towary paletowe.', variants: [{ id: 'std', name: 'srebrny' }] },
	};
	const variantOf = (id, v) => { const s = STOCK[id]; return (s && (s.variants.find((x) => x.id === v) || s.variants[0])) || null; };

	/* Skład z konfiguracji: { loco, lv, cars: [{ t, v }] } (lokomotywa + wagony – dowolnie mieszane; same wagony
	   towarowe – skład towarowy) albo { emu, ev, n } (n zespołów trakcyjnych). Zwraca opis składu dla fizyki i modelu:
	   długości wagonów, specs (bryła i malowanie każdego pojazdu), masa, moc, siła, opory (Davis), prędkość. */
	function makeConsist(cfg) {
		const cars = [], specs = [];
		const plural = (n, a, b, c) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
		if (cfg.emu) {
			const U = STOCK[cfg.emu], n = Math.max(1, Math.min(U.maxUnits || 3, cfg.n || 1)), v = variantOf(cfg.emu, cfg.ev);
			const pantographs = [];
			for (let u = 0; u < n; u++) {
				U.cars.forEach((len, j) => { cars.push(len); specs.push({ id: cfg.emu, model: U.model, v: v.id, c: v.c || null, num: v.num, H: U.height, unit: u, j, art: !!U.articulated }); });
				for (const pc of [].concat(U.panto)) pantographs.push(u * U.cars.length + pc);
			}
			return {
				name: `${U.name}, ${n} ${plural(n, 'zespół', 'zespoły', 'zespołów')}`, style: 'ezt', cars, specs, unitCars: U.cars.length, gap: 0.9, height: U.height,
				mass: U.mass * 1000 * n, rotFactor: 1.1, maxPower: U.power * 1000 * n, maxForce: U.force * 1000 * n, vmax: U.vmax / 3.6,
				serviceDecel: 0.8, emergencyDecel: 1.15, davisA: 2000 * n, davisB: 40 * n, davisC: (3.5 + 1.5 * n) * (U.aero || 1),
				electric: true, pantograph: [].concat(U.panto)[0], pantographs, freight: false, diesel: false, emu: true,
				adhMass: U.mass * 1000 * n * 0.45, // masa na osiach napędnych (przyczepność): ok. 45 % zespołu
			};
		}
		const lid = STOCK[cfg.loco] && STOCK[cfg.loco].kind === 'loco' ? cfg.loco : 'EU07', L = STOCK[lid], lv = variantOf(lid, cfg.lv);
		cars.push(L.len);
		specs.push({ id: lid, model: L.model, v: lv.id, c: lv.c || null, num: lv.num, H: L.height });
		let mass = L.mass, vmax = L.vmax, A = 1000 + 6 * L.mass, B = 40, C = 5, height = L.height;
		const list = (cfg.cars || []).filter((x) => STOCK[x.t] && (STOCK[x.t].kind === 'coach' || STOCK[x.t].kind === 'wagon'));
		const freight = list.length > 0 && list.every((x) => STOCK[x.t].kind === 'wagon');
		list.forEach((x, k) => {
			const W = STOCK[x.t], v = variantOf(x.t, x.v);
			cars.push(W.len);
			specs.push({ id: x.t, model: W.model, v: v.id, c: v.c || null, ft: W.ft, H: W.height, seed: k });
			mass += W.mass;
			vmax = Math.min(vmax, W.vmax);
			height = Math.max(height, W.height);
			if (W.kind === 'wagon') { A += 12 * W.mass; B += 6; C += 0.6; } else { A += 13 * W.mass; B += 5; C += W.height > 4.3 ? 0.6 : 0.4; }
		});
		// nazwa: kolejne jednakowe wagony razem („EU07 + 3× 111A + Bdhpumn”)
		const groups = [];
		for (const x of list) { const g = groups[groups.length - 1]; if (g && g.t === x.t) g.n++; else groups.push({ t: x.t, n: 1 }); }
		return {
			name: [L.name].concat(groups.map((g) => (g.n > 1 ? `${g.n}× ` : '') + STOCK[g.t].name)).join(' + '),
			style: freight ? 'freight' : L.electric ? 'ic' : 'dd', cars, specs, gap: 1.0, height,
			mass: mass * 1000, rotFactor: 1.06, maxPower: L.power * 1000, maxForce: L.force * 1000, vmax: vmax / 3.6,
			serviceDecel: freight ? 0.45 : 0.7, emergencyDecel: freight ? 0.8 : 1.05, davisA: A, davisB: B, davisC: C,
			electric: !!L.electric, pantograph: 0, freight, diesel: !L.electric, emu: false,
			adhMass: L.mass * 1000, // masa na osiach napędnych – lokomotywa
		};
	}

	// stary zapis składu ({ train: 'ezt' | 'ic' | 'dd', cars }) → konfiguracja z katalogu
	function legacyConfig(type, n) {
		if (type === 'ezt') return { emu: 'EN57', ev: 'retro', n };
		if (type === 'dd') return { loco: 'SM42', lv: 'pkp', cars: Array.from({ length: n }, () => ({ t: 'Bdhpumn', v: 'pkp' })) };
		return { loco: 'EU07', lv: 'pkp', cars: Array.from({ length: n }, () => ({ t: '111A', v: 'pkp' })) };
	}
	function makeTrain(type, n) {
		return makeConsist(legacyConfig(type, n));
	}
	// składy domyślne (ruch mijany, testy)
	const TRAINS = { ezt: makeTrain('ezt', 1), ic: makeTrain('ic', 5), dd: makeTrain('dd', 3) };
	// typy ze starego menu (zgodność: najdłuższy skład danego typu – maxCars)
	const TRAIN_TYPES = {
		ezt: { min: 1, max: 3, def: 1 },
		ic: { min: 2, max: 10, def: 5 },
		dd: { min: 1, max: 6, def: 3 },
	};

	function trainLengthOf(train) {
		return train.cars.reduce((a, b) => a + b, 0) + train.gap * (train.cars.length - 1);
	}

	// najdłuższy skład danego typu, który zmieści się przy peronach trasy
	function maxCars(def, type) {
		const tt = TRAIN_TYPES[type];
		let n = tt.min;
		const pl = (def.fixes && def.fixes.platformLength) || def.platformLength;
		while (n < tt.max && trainLengthOf(makeTrain(type, n + 1)) <= pl - 10) n++;
		return n;
	}

	// domyślny skład trasy (jak w scenariuszu)
	function defaultConfig(def) {
		const t = def && def.train;
		// linia bez sieci trakcyjnej – skład spalinowy (SM42 z piętrowymi), niezależnie od scenariusza
		if (def && def.electrified === false) return legacyConfig('dd', 3);
		return t === 'ic' ? legacyConfig('ic', 5) : t === 'dd' ? legacyConfig('dd', 3) : legacyConfig('ezt', 1);
	}

	/* Konfiguracja dopasowana do trasy: znane serie i malowania, skład pasażerski nie dłuższy niż perony (bez ostatnich
	   wagonów / zespołów), towarowy do 600 m i nie dalej wstecz niż początek toru przed stacją początkową. */
	const FREIGHT_MAX = 600;
	function normConfig(def, cfg) {
		let c = cfg && typeof cfg === 'object' ? cfg : null;
		if (c && c.train && !c.emu && !c.loco) c = TRAIN_TYPES[c.train] ? legacyConfig(c.train, c.cars || TRAIN_TYPES[c.train].def) : null;
		if (!c || !((STOCK[c.emu] && STOCK[c.emu].kind === 'emu') || (STOCK[c.loco] && STOCK[c.loco].kind === 'loco'))) c = defaultConfig(def);
		// linia bez sieci trakcyjnej: zespół trakcyjny – skład domyślny (spalinowy), lokomotywa elektryczna – spalinowa
		// (pasażerski SU46, towarowy ST44), wagony zostają
		if (def && def.electrified === false) {
			if (c.emu) c = defaultConfig(def);
			else if (STOCK[c.loco].electric) {
				const fr = (c.cars || []).some((x) => x && STOCK[x.t] && STOCK[x.t].kind === 'wagon');
				c = Object.assign({}, c, { loco: fr ? 'ST44' : 'SU46', lv: undefined });
			}
		}
		const pl = (def.fixes && def.fixes.platformLength) || def.platformLength;
		if (c.emu) {
			const U = STOCK[c.emu];
			const out = { emu: c.emu, ev: variantOf(c.emu, c.ev).id, n: Math.max(1, Math.min(U.maxUnits || 3, c.n || 1)) };
			while (out.n > 1 && trainLengthOf(makeConsist(out)) > pl - 10) out.n--;
			return out;
		}
		const out = { loco: c.loco, lv: variantOf(c.loco, c.lv).id, cars: (c.cars || []).filter((x) => x && STOCK[x.t] && (STOCK[x.t].kind === 'coach' || STOCK[x.t].kind === 'wagon')).map((x) => ({ t: x.t, v: variantOf(x.t, x.v).id })) };
		// wagony towarowe i pasażerskie się nie mieszają – rozstrzyga pierwszy wagon
		if (out.cars.length) { const fr = STOCK[out.cars[0].t].kind === 'wagon'; out.cars = out.cars.filter((x) => (STOCK[x.t].kind === 'wagon') === fr); }
		const freight = out.cars.length > 0 && STOCK[out.cars[0].t].kind === 'wagon';
		const origin = def.stations && def.stations[0] ? def.stations[0].pos : 0;
		const lim = freight ? Math.min(FREIGHT_MAX, origin + 580) : pl - 10;
		while (out.cars.length > 1 && trainLengthOf(makeConsist(out)) > lim) out.cars.pop();
		return out;
	}
	// najdłuższy dopuszczalny skład dla trasy (m) – pasażerski: perony, towarowy: FREIGHT_MAX i tor przed stacją
	function consistLimit(def, freight) {
		const pl = (def.fixes && def.fixes.platformLength) || def.platformLength;
		const origin = def.stations && def.stations[0] ? def.stations[0].pos : 0;
		return freight ? Math.min(FREIGHT_MAX, origin + 580) : pl - 10;
	}
	// klucz konfiguracji (pamięć podręczna przygotowanych tras, rekordy)
	function configKey(c) {
		return c.emu ? `${c.emu}.${c.ev}.${c.n}` : `${c.loco}.${c.lv}.` + c.cars.map((x) => `${x.t}:${x.v}`).join(',');
	}


	/* Poprawki trasy (sekcja "fixes" w pliku trasy albo --fixes plik.json przy generowaniu), nakładane przed
	   przygotowaniem. Pozycje jak w pliku trasy (kilometraż w m, jak "pos" stacji); "at" – miejsce istniejącego
	   obiektu (±30 m). Opis formatu: README, sekcja „Poprawki tras”.
	   { stations: { "Nazwa": { pos, platform: {side, edge, width, island, s0, s1} | null, type, stop, remove },
	                 add: [{ name, pos, type }] },
	     bridges: [{ at, remove } | { at, kind, from, to } | { from, to, kind }],
	     signals: [{ at, remove } | { at, pos, d, gantry } | { pos, name, kind, d, gantry }],
	     limits: [[pos, km/h]], crossings: { add: [pos], remove: [at] }, platformLength, ignore: ["id uwagi"],
	     switches: [{ at, d, type: "double" | "single" | "crossing", end: 1 | -1 }] } */
	function applyFixes(def) {
		const f = def.fixes;
		if (!f || typeof f !== 'object') return def;
		const out = Object.assign({}, def);
		if (f.platformLength) out.platformLength = f.platformLength;
		if (f.stations) {
			let st = def.stations.map((x) => Object.assign({}, x));
			for (const [name, fx] of Object.entries(f.stations)) {
				if (name === 'add' || !fx) continue;
				const x = st.find((q) => q.name === name);
				if (!x) continue;
				if (fx.remove) { x.removed = true; continue; }
				if (fx.pos !== undefined) x.pos = fx.pos;
				if (fx.type) x.type = fx.type;
				if (fx.stop !== undefined) x.stop = fx.stop;
				if (fx.platform === null) x.platform = null;
				else if (fx.platform) {
					// zakres peronu: z poprawki, z dotychczasowego peronu albo domyślny przed miejscem zatrzymania
					const range = x.platform ? { s0: x.platform.s0, s1: x.platform.s1 } : { s0: x.pos + 15 - (out.platformLength || 200), s1: x.pos + 15 };
					x.platform = Object.assign({ side: 1, edge: 1.7, width: 4.4 }, range, fx.platform, { fixed: true });
				}
			}
			for (const a of f.stations.add || []) st.push(Object.assign({ type: 'halt' }, a));
			const n = st.length;
			out.stations = st.filter((x, i) => !x.removed || i === 0 || i === n - 1).sort((a, b) => a.pos - b.pos);
		}
		if (Array.isArray(f.bridges)) {
			let br = (def.bridges || []).map((b) => Object.assign({}, b));
			for (const fx of f.bridges) {
				if (fx.at !== undefined) {
					const b = br.find((x) => fx.at >= x.from - 30 && fx.at <= x.to + 30);
					if (!b) continue;
					if (fx.remove) br = br.filter((x) => x !== b);
					else for (const k of ['from', 'to', 'kind']) if (fx[k] !== undefined) b[k] = fx[k];
				} else if (fx.from !== undefined && fx.to !== undefined) br.push({ from: fx.from, to: fx.to, kind: fx.kind || 'viaduct', fixed: true });
			}
			out.bridges = br.sort((a, b) => a.from - b.from);
		}
		if (Array.isArray(f.signals)) {
			const add = f.signals.filter((x) => x.at === undefined && x.pos !== undefined).map((x) => ({ pos: x.pos, name: x.name || '', kind: x.kind || 'block', d: x.d, gantry: x.gantry }));
			if (add.length) out.signals = def.signals.concat(add).sort((a, b) => a.pos - b.pos);
		}
		if (Array.isArray(f.limits) && f.limits.length) {
			const lim = def.limits.filter(([pos]) => !f.limits.some(([p]) => Math.abs(p - pos) < 5));
			out.limits = lim.concat(f.limits).sort((a, b) => a[0] - b[0]);
		}
		if (Array.isArray(f.switches) && def.env && def.env.sw) {
			// rozjazdy krzyżowe i skrzyżowania: typ (otoczenie kopiowane – opis trasy zostaje bez zmian)
			const sw = def.env.sw.map((x) => x.slice());
			const TYPE = { double: 4, single: 3, crossing: 2 };
			for (const fx of f.switches) {
				if (fx.at === undefined || !TYPE[fx.type]) continue;
				let best = null, bd = 15;
				for (const x of sw) {
					if (x[5] < 2) continue;
					const dd = Math.abs(x[0] - fx.at) + (fx.d !== undefined ? Math.abs(x[1] - fx.d) : 0);
					if (dd < bd) { bd = dd; best = x; }
				}
				if (!best) continue;
				best[5] = TYPE[fx.type];
				best[8] = 1;
				if (fx.end) best[10] = fx.end < 0 ? -1 : 1;
			}
			out.env = Object.assign({}, def.env, { sw });
		}
		if (f.crossings) {
			const rm = f.crossings.remove || [];
			out.crossings = (def.crossings || []).filter((pos) => !rm.some((at) => Math.abs(at - pos) < 30)).concat(f.crossings.add || []).sort((a, b) => a - b);
		}
		return out;
	}

	// stan uwagi generatora wobec poprawek: 'ignored' (na liście ignore), 'fixed' (poprawka w tym miejscu) albo null
	function issueStatus(def, issue) {
		const f = def.fixes;
		if (!f) return null;
		if ((f.ignore || []).includes(issue.id)) return 'ignored';
		const a = issue.pos - 80, b = (issue.to !== undefined ? issue.to : issue.pos) + 80;
		const hit = (v) => typeof v === 'number' && v >= a && v <= b;
		const any = (list) => (list || []).some((x) => (Array.isArray(x) ? hit(x[0]) : typeof x === 'number' ? hit(x) : x && (hit(x.at) || hit(x.pos) || hit(x.from) || hit(x.to))));
		const k = issue.k;
		if ((k === 'bridge' || k === 'bridge-add' || k === 'cross') && (any(f.bridges) || any(f.crossings && f.crossings.add) || any(f.crossings && f.crossings.remove))) return 'fixed';
		if (k === 'signals' && any(f.signals)) return 'fixed';
		if (k === 'speed' && any(f.limits)) return 'fixed';
		if (k === 'slip' && any(f.switches)) return 'fixed';
		if (k === 'platform' || k === 'stop' || k === 'station-skip') {
			const st = f.stations || {};
			if (Object.keys(st).some((name) => name !== 'add' && issue.m.includes('„' + name + '”')) || (st.add || []).some((x) => issue.m.includes('„' + x.name + '”'))) return 'fixed';
		}
		return null;
	}

	// cfg (opcjonalnie): konfiguracja składu (normConfig; także stary zapis { train, cars }) – domyślnie skład ze scenariusza
	// from (opcjonalnie): numer stacji, od której zaczyna się jazda (jazda swobodna) – stacje wcześniejsze pominięte, geometria
	// i otoczenie bez zmian (kilometraż jak w całej trasie); najdalej przedostatnia stacja
	function prepare(def0, cfg, from = 0) {
		let def = applyFixes(def0);
		const k = Math.max(0, Math.min(from | 0, def.stations.length - 2));
		if (k > 0) def = Object.assign({}, def, { stations: def.stations.slice(k), title: `${def.stations[k].name} – ${def.stations[def.stations.length - 1].name}`, name: def.name.replace(/^(\S+).*/, `$1 ${def.stations[k].name} – ${def.stations[def.stations.length - 1].name}`) });
		const c = normConfig(def, cfg);
		const train = makeConsist(c);
		const trainLength = trainLengthOf(train);
		const stations = def.stations.map((s, i) => {
			// trasa rzeczywista: zakres peronu z mapy (albo wywnioskowany z torów), strona i szerokość
			const pl = s.platform || null;
			const platformEnd = pl ? Math.max(pl.s1, s.pos + 5) : s.pos + 15;
			const terminus = i === def.stations.length - 1;
			/* peron z mapy (env.p[pi]): początek modelu nie przed obrysem – zakres z wykazu PLK wydłużał peron od strony
			   wjazdu nawet na rozjazdy (Toruń Wschodni: 100 m przed peronem); dłużej tylko, gdy skład się nie mieści */
			let start = pl ? Math.min(pl.s0, platformEnd - 60) : platformEnd - def.platformLength;
			const poly = pl && pl.pi !== undefined && def.env && def.env.p && def.env.p[pl.pi];
			if (poly) {
				let a = Infinity;
				for (let k = 1; k < poly.length; k += 2) a = Math.min(a, poly[k]);
				if (a > start) start = Math.min(a, platformEnd - 60, s.pos - trainLength - 2);
			}
			/* długi skład (np. ED250, dwa EN71): miejsce zatrzymania z danych bywa ponad 20 m przed końcem peronu – tył
			   składu wystawał poza początek peronu („skład za krótki peron”) i automat stał w miejscu. Zatrzymanie dalej, do
			   5 m przed końcem peronu; skład dłuższy niż peron – peron (model) wydłużony od strony wjazdu */
			let pos = s.pos;
			if (pos - trainLength - 3 < start) pos = Math.min(Math.max(pos, platformEnd - 5), start + trainLength + 3);
			if (pos - trainLength - 3 < start) start = pos - trainLength - 3;
			return {
				platform: pl,
				name: s.name,
				pos,
				index: i,
				// skład towarowy: bez postojów handlowych – zatrzymanie tylko na stacji końcowej
				stop: s.stop !== false && (!train.freight || i === 0 || i === def.stations.length - 1),
				type: s.type || 'station', // 'station' – dworzec z miasteczkiem, 'halt' – przystanek (tylko wygląd)
				platformEnd,
				platformStart: start,
				starterPos: terminus ? null : s.pos + 50,
				terminus,
			};
		});
		const last = stations[stations.length - 1];
		const bufferPos = last.platformEnd + 20;

		const grades = def.grades.map(([pos, g]) => ({ pos, g, h: 0 }));
		for (let i = 1; i < grades.length; i++) {
			const p = grades[i - 1];
			grades[i].h = p.h + ((grades[i].pos - p.pos) * p.g) / 1000;
		}
		const limits = def.limits.map(([pos, speed]) => ({ pos, speed }));

		const signals = [];
		// label – oznaczenie na tabliczce semafora (z trasy rzeczywistej: prawdziwe nazwy, np. „239N”, „G1”)
		stations.forEach((s) => {
			if (!s.terminus) signals.push({ pos: s.starterPos, type: 'starter', station: s.index, name: 'Odjazdowy ' + s.name, label: def.stations[s.index].exit || 'O' + (s.index + 1) });
		});
		def.signals.forEach((s) => signals.push({ pos: s.pos, type: 'block', kind: s.kind || 'block', hold: s.hold || 0, name: s.name || '', label: s.name || '', d: s.d, gantry: s.gantry }));
		// poprawki istniejących semaforów (także odjazdowych): przesunięcie, odsunięcie masztu, bramownica, usunięcie
		for (const fx of (def.fixes && def.fixes.signals) || []) {
			if (fx.at === undefined) continue;
			let q = null;
			for (const x of signals) if (Math.abs(x.pos - fx.at) <= 30 && (!q || Math.abs(x.pos - fx.at) < Math.abs(q.pos - fx.at))) q = x;
			if (!q) continue;
			if (fx.remove && q.type === 'block') { signals.splice(signals.indexOf(q), 1); continue; }
			if (fx.pos !== undefined && q.type === 'block') q.pos = fx.pos;
			if (fx.d !== undefined) q.d = fx.d;
			if (fx.gantry !== undefined) q.gantry = fx.gantry;
		}
		signals.sort((a, b) => a.pos - b.pos);
		let n = 0;
		signals.forEach((s) => {
			if (s.type !== 'block') return;
			n++;
			if (!s.name) { s.name = 'Sbl ' + n; s.label = 'S' + n; } else s.name = 'Sbl ' + s.name;
		});

		const route = {
			id: def.id,
			from: k, // stacja początkowa jazdy (numer w całej trasie)
			config: c,
			configKey: configKey(c),
			freight: !!train.freight,
			name: def.name,
			title: def.title,
			desc: def.desc,
			difficulty: def.difficulty,
			real: !!def.real,
			// sieć trakcyjna – cecha linii, nie pociągu (SM42 jeździ też pod siecią): z opisu trasy, trasa rzeczywista bez
			// tej informacji – zelektryfikowana, trasa testowa – jak pociąg
			electrified: def.electrified !== undefined ? !!def.electrified : def.real ? true : !!train.electric,
			// odcinki z siecią nad torem pociągu ([od, do]; trasy z generatora) – bez nich cała trasa wg electrified
			wire: Array.isArray(def.wire) ? def.wire : null,
			source: def.source || null,
			startClock: def.startClock,
			originWait: def.originWait,
			dwell: def.dwell,
			platformLength: def.platformLength,
			train,
			trainLength,
			stations,
			bufferPos,
			grades,
			limits,
			signals,
			crossings: (def.crossings || []).map((pos) => ({ pos, hornFrom: pos - 500 })),
			bridges: def.bridges || [],
			tunnels: def.tunnels || [],
			curves: (def.curves || []).map(([from, to, r]) => ({ from, to, r })),
			// trasa rzeczywista: krzywizna toru co `step` m (1/R · scale, + w prawo)
			curvature: def.curvature || null,
			env: def.env || null, // trasa rzeczywista: otoczenie z mapy (budynki, drogi, wody, zagospodarowanie)
			h0: typeof def.h0 === 'number' ? def.h0 : null, // wysokość bezwzględna główki szyny przy wysokości 0 w grze (NMT)
			issues: def.issues || [], // uwagi generatora (miejsca do sprawdzenia)
			fixes: def.fixes || null,
			double: def.double !== false, // drugi tor po lewej (pociągi z przeciwka – tylko wygląd)
			// horyzont z prawdziwego terenu (js/horizon-data.js): w trasie (Generator) albo osobny plik routes/horizon/<id>.js
			horizon: def.horizon || (typeof globalThis !== 'undefined' && globalThis.TrainHorizons && globalThis.TrainHorizons[def.id]) || null,
			/* dopasowanie do mapy (gra x, z → szerokość i długość geograficzna, js/horizon-data.js toLatLon): z Generatora
			   albo z pliku horyzontu (tools/horizon.js --geo) – linki do mapy i widoku ulicy przy uwagach */
			geo: def.geo || (typeof globalThis !== 'undefined' && globalThis.TrainHorizons && globalThis.TrainHorizons[def.id] && globalThis.TrainHorizons[def.id].geo) || null,
			length: bufferPos + 200,
		};
		buildAlignment(route);
		route.single = singleSections(route);
		return route;
	}

	/* Odcinki jednotorowe trasy rzeczywistej (krzyżowania): miejsca bez toru biegnącego obok (3–45 m od osi,
	   równolegle; tory z mapy env.t), próbki co 50 m. Mijanki (odcinki z drugim torem) krótsze niż 300 m nie liczą się
	   (skład się nie zmieści) – sąsiednie odcinki jednotorowe łączą się; odcinki krótsze niż 500 m – pomijane.
	   Zwraca [[od, do], …] (s, rosnąco) albo null (linia dwutorowa, trasa z gry). */
	function singleSections(route) {
		const rows = route.env && route.env.t;
		if (!rows || !rows.length) return null;
		const STEP = 50, n = Math.ceil(route.length / STEP) + 1;
		const two = new Uint8Array(n);
		for (const row of rows) {
			if (row[0] & 4) continue; // tor nieużywany
			for (let k = 0; 4 + k * 2 < row.length; k++) {
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2];
				if (sa === sb || Math.abs(db - da) > 0.15 * Math.abs(sb - sa)) continue; // tor ukośny
				const lo = Math.max(0, Math.ceil(Math.min(sa, sb) / STEP)), hi = Math.min(n - 1, Math.floor(Math.max(sa, sb) / STEP));
				for (let i = lo; i <= hi; i++) {
					const d = Math.abs(da + ((db - da) * (i * STEP - sa)) / (sb - sa));
					if (d > 3 && d < 45) two[i] = 1;
				}
			}
		}
		let out = [], cur = null;
		for (let i = 0; i < n; i++) {
			if (!two[i]) { if (!cur) cur = [i * STEP, i * STEP]; cur[1] = i * STEP; } else if (cur) { out.push(cur); cur = null; }
		}
		if (cur) out.push(cur);
		const merged = [];
		for (const x of out) {
			const last = merged[merged.length - 1];
			if (last && x[0] - last[1] < 300) last[1] = x[1];
			else merged.push(x.slice());
		}
		out = merged.filter((x) => x[1] - x[0] >= 500 && x[0] > 0 && x[1] < route.length - 250);
		return out.length ? out : null;
	}
	// odcinek jednotorowy w miejscu s (indeks w route.single) albo −1
	function singleAt(route, s) {
		const L = route.single;
		if (!L) return -1;
		for (let k = 0; k < L.length; k++) if (s >= L[k][0] && s <= L[k][1]) return k;
		return -1;
	}
	/* rysowanie pociągu z przeciwka na linii jednotorowej: 0 – na torze gracza (odcinek jednotorowy), 1 – na drugim
	   torze (mijanka, linia dwutorowa); przejście na 60 m przy końcach odcinka (rozjazd) */
	function laneWeight(route, s) {
		const L = route.single;
		if (!L) return 1;
		let d = Infinity;
		for (const [a, b] of L) {
			if (s >= a && s <= b) return 0;
			d = Math.min(d, Math.abs(s - a), Math.abs(s - b));
		}
		if (d >= 60) return 1;
		const x = d / 60;
		return x * x * (3 - 2 * x);
	}

	// ---- przebieg toru w planie: proste + łuki z krzywymi przejściowymi ----
	const GEO_STEP = 2;
	const GEO_START = -600;

	function curvatureAt(route, s) {
		const cv = route.curvature;
		if (cv) {
			const f = s / cv.step, i = Math.floor(f);
			if (i < 0 || i >= cv.k.length - 1) return 0;
			return (cv.k[i] + (cv.k[i + 1] - cv.k[i]) * (f - i)) / cv.scale;
		}
		for (const c of route.curves) {
			if (s < c.from || s > c.to) continue;
			const ramp = Math.min(80, (c.to - c.from) / 3);
			const k = Math.min(1, (s - c.from) / ramp, (c.to - s) / ramp);
			return k / c.r;
		}
		return 0;
	}

	// Kierunek 0 = „na północ” (−z). Przód: (sin θ, −cos θ), prawa strona: (cos θ, sin θ).
	function buildAlignment(route) {
		const n = Math.ceil((route.length + 600 - GEO_START) / GEO_STEP) + 1;
		const xs = new Float64Array(n), zs = new Float64Array(n), hs = new Float64Array(n);
		let x = 0, z = 0, th = 0;
		for (let i = 0; i < n; i++) {
			const s = GEO_START + i * GEO_STEP;
			xs[i] = x; zs[i] = z; hs[i] = th;
			const k = curvatureAt(route, s + GEO_STEP / 2);
			const thMid = th + (k * GEO_STEP) / 2;
			x += Math.sin(thMid) * GEO_STEP;
			z -= Math.cos(thMid) * GEO_STEP;
			th += k * GEO_STEP;
		}
		route.align = { xs, zs, hs, n };
	}

	function trackPoint(route, s, out) {
		const a = route.align;
		const f = Math.max(0, Math.min(a.n - 1.001, (s - GEO_START) / GEO_STEP));
		const i = Math.floor(f), t = f - i;
		const o = out || {};
		o.x = a.xs[i] + (a.xs[i + 1] - a.xs[i]) * t;
		o.z = a.zs[i] + (a.zs[i + 1] - a.zs[i]) * t;
		o.heading = a.hs[i] + (a.hs[i + 1] - a.hs[i]) * t;
		o.y = heightAt(route, s);
		return o;
	}

	// punkt odsunięty w bok od osi toru (d > 0 = w prawo)
	function sidePoint(route, s, d, out) {
		const o = trackPoint(route, s, out);
		o.x += Math.cos(o.heading) * d;
		o.z += Math.sin(o.heading) * d;
		return o;
	}

	// indeks ostatniego elementu z pos <= x (tablica posortowana)
	function pieceIndex(arr, x) {
		let lo = 0, hi = arr.length - 1, r = 0;
		while (lo <= hi) {
			const m = (lo + hi) >> 1;
			if (arr[m].pos <= x) { r = m; lo = m + 1; } else hi = m - 1;
		}
		return r;
	}

	function gradeAt(route, x) {
		return route.grades[pieceIndex(route.grades, x)].g;
	}

	function heightAt(route, x) {
		const g = route.grades[pieceIndex(route.grades, x)];
		return g.h + ((Math.max(x, g.pos) - g.pos) * g.g) / 1000;
	}

	function limitAt(route, x) {
		return route.limits[pieceIndex(route.limits, x)].speed;
	}

	// najniższe ograniczenie na odcinku [a, b] – pociąg obowiązuje całą długością
	function limitOver(route, a, b) {
		let i = pieceIndex(route.limits, a);
		let m = route.limits[i].speed;
		for (i++; i < route.limits.length && route.limits[i].pos <= b; i++) m = Math.min(m, route.limits[i].speed);
		return m;
	}

	function nextLimitChange(route, x) {
		return route.limits.find((l) => l.pos > x) || null;
	}

	/* przerwy w torach z mapy przy portalach tunelu: odcinek przed portalem kończy się kilka metrów przed początkiem
	   odcinka w tunelu (podział drogi z mapy na kawałki pod ziemią i na powierzchni – np. Powiśle przed tunelem
	   średnicowym: 3363 → 3371 m) – tor urywał się przed wjazdem. Koniec toru (do 25 m od portalu) łączony z początkiem
	   innego toru 1,5–14 m dalej w tym samym kierunku (oba odcinki i łącznik w linii, wysokości ±1 m); jednorazowo */
	function envJoinPortalGaps(route) {
		const env = route.env, T = env.t, TH = env.th;
		if (!T || env._tJoin || !route.tunnels || !route.tunnels.length) return;
		Object.defineProperty(env, '_tJoin', { value: true, configurable: true });
		const portal = (s) => route.tunnels.some((t) => Math.abs(s - t.from) < 25 || Math.abs(s - t.to) < 25);
		// końce torów: punkt, kierunek na zewnątrz, wysokość
		const ends = [];
		T.forEach((row, i) => {
			const m = (row.length - 1) / 2;
			if (m < 2) return;
			for (const first of [true, false]) {
				const a = first ? 0 : m - 1, b = first ? 1 : m - 2;
				const s = row[1 + a * 2], d = row[2 + a * 2];
				if (!portal(s)) continue;
				const ds = s - row[1 + b * 2], dd = d - row[2 + b * 2], L = Math.hypot(ds, dd) || 1;
				ends.push({ i, first, s, d, us: ds / L, ud: dd / L, h: TH && TH[i] ? TH[i][a] : -1, used: false });
			}
		});
		// koniec połączony już z innym torem (rozjazd) – bez łącznika
		const near = (e) => ends.some((o) => o !== e && Math.hypot(o.s - e.s, o.d - e.d) < 1.5);
		for (const e of ends) {
			if (e.used || near(e)) continue;
			let best = null, bd = Infinity;
			for (const o of ends) {
				if (o.used || o.i === e.i || near(o)) continue;
				const vs = o.s - e.s, vd = o.d - e.d, L = Math.hypot(vs, vd);
				if (L < 1.5 || L > 14) continue;
				if ((vs * e.us + vd * e.ud) / L < 0.98 || -(vs * o.us + vd * o.ud) / L < 0.98) continue;
				if (e.h >= 0 && o.h >= 0 && Math.abs(e.h - o.h) > 10) continue;
				if (L < bd) { bd = L; best = o; }
			}
			if (!best) continue;
			e.used = best.used = true;
			// łącznik dopisany do toru poza tunelem (bez bitu 16) – w tunelu zostaje jego kawałek
			const [x, y] = T[e.i][0] & 16 && !(T[best.i][0] & 16) ? [best, e] : [e, best];
			const row = T[x.i], th = TH && TH[x.i];
			if (x.first) { row.splice(1, 0, y.s, y.d); if (th) th.unshift(th[0]); }
			else { row.push(y.s, y.d); if (th) th.push(th[th.length - 1]); }
		}
	}

	/* „wiadukt kolejowy” z mapy (env.ro), który nie przecina naszego toru (wszystkie punkty po jednej stronie, ponad 3 m
	   od osi) albo przecina go i dalej biegnie obok – w danych bywa nim cały tor (Chorzów Batory: 1,5 km toru 5–26 m
	   od osi za przejściem nad linią).
	   Rysowany jako pomost nad torami leżał przy ziemi szarą płytą i skakał na 7 m tam, gdzie zbliżał się do torów
	   (skrajnia). Przeniesiony do torów z mapy (bit 2 – most, 8; wysokości z pomiaru pomostu env.roh jak env.th);
	   jednorazowo */
	function envRailBesideToTracks(route) {
		const env = route.env;
		if (!env.ro || !env.ro.length || !env.t || env._roMoved) return;
		Object.defineProperty(env, '_roMoved', { value: true, configurable: true });
		const keep = [], keepZ = [], keepH = [], hasZ = Array.isArray(env.roz), hasH = Array.isArray(env.roh);
		// (bit 64 – tor odzyskany z wiaduktu: wysokości z pomiaru powierzchni, w grze nie wyżej niż teren + 1,5 m)
		const toTrack = (row, h, k0, k1, fl) => {
			if (k1 - k0 < 1) return;
			env.t.push([fl | 64].concat(row.slice(1 + k0 * 2, 3 + k1 * 2)));
			if (env.th) env.th.push(h ? h.slice(k0, k1 + 1) : null);
		}
		env.ro.forEach((row, i) => {
			const n = (row.length - 1) / 2, h = hasH && env.roh[i] && env.roh[i].length === n ? env.roh[i] : null;
			/* przejście nad osią: zmiana strony z ponad 3 m po jednej na ponad 3 m po drugiej (tor kończący się na osi –
			   zjazd zwrotnicą do naszej linii – nie przecina jej) */
			let kc = -1, last = 0, lastK = -1;
			for (let k = 0; k < n && kc < 0; k++) {
				const d = row[2 + k * 2];
				if (Math.abs(d) <= 3) continue;
				const sg = Math.sign(d);
				if (last && sg !== last) {
					// punkt przecięcia: najbliższy osi między ostatnim punktem po jednej stronie a pierwszym po drugiej
					let bd = Infinity;
					for (let j = lastK; j <= k; j++) if (Math.abs(row[2 + j * 2]) < bd) { bd = Math.abs(row[2 + j * 2]); kc = j; }
				}
				last = sg;
				lastK = k;
			}
			if (kc < 0 && n >= 2) { toTrack(row, h, 0, n - 1, 2 | 8); return; }
			/* przecina tor, ale dalej biegnie obok niego (odcinek równoległy od 60 m, ponad 3 m od osi): wiadukt tylko do
			   początku tego odcinka (z zapasem 2 punktów), reszta – tor z mapy (bez bitu mostu) */
			const par = (k, dir) => {
				let L = 0;
				for (let j = k; j + dir >= 0 && j + dir < n; j += dir) {
					const ds = Math.abs(row[1 + (j + dir) * 2] - row[1 + j * 2]), dd = Math.abs(row[2 + (j + dir) * 2] - row[2 + j * 2]);
					if (dd > 0.15 * ds + 0.05 || Math.abs(row[2 + j * 2]) < 3) break;
					L += Math.hypot(ds, dd);
					if (L >= 60) return true;
				}
				return false;
			}
			let a = 0, b = n - 1;
			for (let k = kc; k < n - 1; k++) if (par(k, 1)) { b = Math.min(n - 1, k + 2); break; }
			for (let k = kc; k > 0; k--) if (par(k, -1)) { a = Math.max(0, k - 2); break; }
			if (a === 0 && b === n - 1) { keep.push(row); if (hasZ) keepZ.push(env.roz[i]); if (hasH) keepH.push(env.roh[i]); return; }
			const mid = [row[0]].concat(row.slice(1 + a * 2, 3 + b * 2));
			keep.push(mid);
			if (hasZ) keepZ.push(env.roz[i]);
			if (hasH) keepH.push(h ? h.slice(a, b + 1) : env.roh[i]);
			toTrack(row, h, 0, a, 8);
			toTrack(row, h, b, n - 1, 8);
		});
		env.ro = keep;
		if (hasZ) env.roz = keepZ;
		if (hasH) env.roh = keepH;
	}

	/* poprawki danych otoczenia z mapy (wspólne: gra przy wczytaniu starych plików – real-env envIndex, generator przed
	   zapisem – osm-route.js): „wiadukty kolejowe” biegnące obok linii → tory, przerwy w torach przy portalach tunelu;
	   jednorazowo (znaczniki niezapisywane) */
	/* Krótki wiadukt drogowy nad torem (do 25 m), w którym pomiar powierzchni (NMPT) nie widzi pomostu 5,5–20 m nad główką
	   szyny (env.oz = −1): w terenie nie ma tam obiektu nad torem – zwykle przejście pod torem albo mostek obok, opisany
	   w danych jako most nad linią (Czechowice-Dziedzice – Wisła Głębce km 48,5: ul. Sosnowa w tunelu pod torem; km 50,3:
	   mostek drogi polnej). Gra przedłużała taki obiekt nad terenem obok jak estakadę, która kończyła się kilkanaście
	   metrów nad ziemią – usuwany razem z wpisami w env.oz i env.oh. */
	function envDropFlatOverpasses(def) {
		const e = def.env;
		if (!e.o || !e.oz || e.oz.length !== e.o.length) return;
		for (let i = e.o.length - 1; i >= 0; i--) {
			const row = e.o[i];
			if (e.oz[i] !== -1) continue;
			let L = 0;
			for (let k = 1; k + 3 < row.length; k += 2) L += Math.hypot(row[k + 2] - row[k], row[k + 3] - row[k + 1]);
			if (L > 25) continue;
			e.o.splice(i, 1);
			e.oz.splice(i, 1);
			if (e.oh && e.oh.length > i) e.oh.splice(i, 1);
		}
	}

	function cleanEnv(def) {
		if (!def || !def.env) return def;
		envDropFlatOverpasses(def);
		envRailBesideToTracks(def);
		envJoinPortalGaps(def);
		return def;
	}

	return { STOCK, makeConsist, normConfig, configKey, consistLimit, legacyConfig, FREIGHT_MAX, TRAINS, TRAIN_TYPES, prepare, applyFixes, issueStatus, makeTrain, maxCars, defaultConfig, trainLengthOf, gradeAt, heightAt, limitAt, limitOver, nextLimitChange, curvatureAt, trackPoint, sidePoint, singleSections, singleAt, laneWeight, cleanEnv };
});
