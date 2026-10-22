/* Fizyka pociągu – czysta logika bez DOM (działa w przeglądarce i w Node). */
(function (root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.TrainPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
	'use strict';

	const G = 9.81;
	const LEVER_MIN = -5; // -5 = hamowanie nagłe
	const LEVER_MAX = 5;
	const BRAKE_STEPS = 4;
	// opóźnienie zadziałania hamulca zespolonego (s) – do szacowania drogi hamowania
	const BRAKE_DELAY = 1.2;

	// Pozycja nastawnika → polecenie: moc (0..1), hamulec (0..1), nagłe.
	function leverCommand(lever) {
		if (lever >= 1) return { power: Math.min(lever, LEVER_MAX) / LEVER_MAX, brake: 0, emergency: false };
		if (lever <= LEVER_MIN) return { power: 0, brake: 1, emergency: true };
		if (lever < 0) return { power: 0, brake: -lever / BRAKE_STEPS, emergency: false };
		return { power: 0, brake: 0, emergency: false };
	}

	function leverLabel(lever) {
		if (lever <= LEVER_MIN) return 'NAGŁE';
		if (lever < 0) return 'H' + -lever;
		if (lever > 0) return 'J' + lever;
		return '0';
	}

	function createState(pos) {
		return { pos, v: 0, a: 0, traction: 0, brake: 0, emergency: false };
	}

	function approach(cur, target, up, down, dt) {
		if (target > cur) return Math.min(target, cur + up * dt);
		return Math.max(target, cur - down * dt);
	}

	// Opory ruchu (wzór Davisa), N
	function resistance(train, v) {
		if (v <= 0) return 0;
		return train.davisA + train.davisB * v + train.davisC * v * v;
	}

	// Siła pociągowa, N – ograniczona siłą rozruchową i mocą
	function tractiveForce(train, v, level) {
		if (level <= 0) return 0;
		const fMax = train.maxForce * level;
		const fPower = v > 0.5 ? (train.maxPower * level) / v : fMax;
		let force = Math.min(fMax, fPower);
		const over = v - train.vmax;
		if (over > 0) force *= Math.max(0, 1 - over / 2);
		return force;
	}

	/**
	 * Jeden krok symulacji.
	 * grade – pochylenie jako ułamek (0.005 = 5‰ pod górę).
	 */
	function step(state, train, cmd, grade, dt) {
		state.traction = approach(state.traction, cmd.power, 0.9, 2.5, dt);
		state.emergency = cmd.emergency;
		// direct – hamulec zespolony: cmd.brake to już wypełnienie cylindrów (narastanie liczy model powietrza)
		state.brake = cmd.direct ? cmd.brake : approach(state.brake, cmd.brake, cmd.emergency ? 3 : 0.6, 0.8, dt);
		const decelMax = cmd.emergency ? train.emergencyDecel : train.serviceDecel;

		const v = state.v;
		const meff = train.mass * train.rotFactor;
		// force – siła pociągowa z napędu wg serii / po ograniczeniu przyczepnością (N); decelCap – najwyższe opóźnienie
		// hamowania, na jakie pozwala przyczepność (m/s²)
		let F = cmd.force !== undefined ? cmd.force : tractiveForce(train, v, state.traction);
		if (cmd.forceCap !== undefined) F = Math.min(F, cmd.forceCap); // napęd prosty: przyczepność bez poślizgu
		state.force = F;
		const drive = (F - train.mass * G * grade) / meff;
		const brakeDecel = Math.min(state.brake * decelMax, cmd.decelCap !== undefined ? cmd.decelCap : Infinity);
		let nv;
		if (v <= 0) {
			// postój: pociąg rusza tylko, gdy napęd (lub spadek) pokona hamulce i opór startowy
			const net = drive - brakeDecel - train.davisA / meff;
			nv = net > 0 ? net * dt : 0;
		} else {
			const a = drive - resistance(train, v) / meff - brakeDecel;
			nv = Math.max(0, v + a * dt);
		}
		state.a = (nv - v) / dt;
		state.pos += ((v + nv) / 2) * dt;
		state.v = nv;
		return state;
	}

	/* Hamulec zespolony (pneumatyczny) – uproszczony model ciśnień, bar:
	   – zawór maszynisty: 'fill' napełnianie (uderzeniowe, do 5,4 – przeładowanie), 'run' jazda (5,0; przeładowanie
	     schodzi powoli), 'lap' odcięcie (ciśnienie bez zmian), 'brake' hamowanie (obniżanie o ok. 0,35 bar/s, najniżej
	     3,3), 'emerg' nagłe (opróżnienie przewodu);
	   – przewód główny na każdym pojeździe: zmiana ciśnienia biegnie wzdłuż składu (fala hamowania ok. 250 m/s,
	     luzowanie wolniej); w EZT hamulec elektropneumatyczny – wszystkie wagony od razu;
	   – zawór rozrządczy: cylinder do 3,8 bar przy obniżeniu przewodu o 1,5 bar (hamowanie pełne); nastawa P
	     (osobowa): napełnianie ok. 4 s, luzowanie ok. 18 s; G (towarowa): ok. 25 s i 50 s; nagłe – szybciej.
	   Wynik: brake – średnie wypełnienie cylindrów 0…1, emergency – przewód opróżniony. */
	const PG_RUN = 5.0, PG_MIN_SERVICE = 3.3, C_MAX = 3.8, VALVES = ['fill', 'run', 'lap', 'brake'];
	function createAir(train) {
		const n = train.cars.length;
		const spec = train.specs && train.specs[0];
		return {
			valve: 'run', pg: PG_RUN,
			pipe: new Array(n).fill(PG_RUN), cyl: new Array(n).fill(0),
			seg: train.cars.slice(), // długości pojazdów – droga fali hamowania
			G: !!train.freight, ep: !!train.emu,
			// hamowanie elektrodynamiczne z odzyskiem energii (nowoczesne EZT z falownikiem)
			ed: !!(spec && /^(elf|elf2|ed250)$/.test(spec.model)),
		};
	}
	function stepAir(a, dt) {
		switch (a.valve) {
			case 'fill': a.pg = Math.min(5.4, a.pg + 1.2 * dt); break;
			case 'run': a.pg += (PG_RUN - a.pg) * Math.min(1, dt * (a.pg < PG_RUN ? 0.6 : 0.05)); break;
			case 'brake': if (a.pg > PG_MIN_SERVICE) a.pg = Math.max(PG_MIN_SERVICE, a.pg - 0.35 * dt); break;
			case 'emerg': a.pg = Math.max(0, a.pg - 4 * dt); break;
			default: break; // odcięcie
		}
		const n = a.pipe.length;
		let sum = 0;
		for (let i = 0; i < n; i++) {
			const up = i === 0 ? a.pg : a.pipe[i - 1];
			const k = a.ep ? 1 : Math.min(1, (dt * 250) / Math.max(5, a.seg[i]));
			a.pipe[i] += (up - a.pipe[i]) * (up < a.pipe[i] ? k : k * 0.35);
			const emerg = a.pipe[i] < 2.5;
			const target = emerg ? C_MAX : Math.max(0, Math.min(C_MAX, (PG_RUN - a.pipe[i]) * (C_MAX / 1.5)));
			const c = a.cyl[i];
			const upRate = emerg ? (a.G ? 0.3 : 1.6) : a.ep ? 1.4 : a.G ? 0.15 : 0.95;
			const downRate = a.ep ? 0.6 : a.G ? 0.075 : 0.21;
			a.cyl[i] = target > c ? Math.min(target, c + upRate * dt) : Math.max(target, c - downRate * dt);
			if (i === 0 && !a.ep) {
				const t = a.locoT || 0;
				a.loco = (a.loco || 0) + Math.max(-dt * 0.8, Math.min(dt * 1.0, t - (a.loco || 0)));
				sum += Math.max(a.cyl[0], a.loco);
			} else sum += a.cyl[i];
		}
		return { brake: sum / n / C_MAX, emergency: a.pg < 2.5 };
	}
	/* Hamulec dodatkowy lokomotywy (tylko lokomotywa, zawór obok zespolonego): a.locoT – zadane ciśnienie (0…3,8 bar,
	   co 0,95), a.loco – ciśnienie w cylindrach lokomotywy (narasta ok. 1 bar/s); w cylindrze lokomotywy obowiązuje
	   wyższe z dwóch (stepAir – pojazd 0). */
	function locoBrake(a, dir) {
		a.locoT = Math.max(0, Math.min(C_MAX, (a.locoT || 0) + dir * 0.95));
		return a.locoT;
	}

	// zwłoka hamulca do szacowania drogi hamowania (s): P – kilka sekund, G – kilkanaście, EZT – ok. 1 s
	function airLag(a) {
		if (a.ep) return 1;
		const len = a.seg.reduce((x, y) => x + y, 0);
		return (a.G ? 14 : 3) + len / 250;
	}

	/* Napędy wg serii (opcja „Napęd wg serii”):
	   – oporowy (EU07, EP09, ET22, EN57, EN71, ED72): pozycje nastawnika S1…S12 (silniki szeregowo, S12 – pozycja
	     ekonomiczna), R1…R12 (równolegle, R12 – ekonomiczna), B1…B4 (bocznikowanie – osłabienie pola, wyższa
	     prędkość). Każda pozycja ma prędkość „równowagi” veq; prąd silników rośnie z różnicą veq − v (I = 1 – prąd
	     znamionowy). Za szybkie przechodzenie przez pozycje – prąd ponad 1,35 przez 0,4 s: przekaźnik nadmiarowy
	     wyłącza wyłącznik szybki (trip). Jazda na pozycjach oporowych (nie ekonomicznych) grzeje oporniki rozruchowe
	     (pełne nagrzanie ok. 150 s przy prądzie znamionowym, stygnięcie ok. 90 s):
	     przegrzanie – też wyłączenie (heat);
	   – falownik (Elfy, ED250): nastawnik 10…100 % siły, siła narasta płynnie (ok. 25 % na sekundę); układ
	     przeciwpoślizgowy – siła do granicy przyczepności, bez poślizgu;
	   – spalinowy (SM42, ST44, SU46): pozycje N1…N8 – obroty silnika (0…1) narastają ok. 0,18/s, moc ~ obroty^1,5.
	   driveStep zwraca siłę pociągową (N), w d.I – prąd / obciążenie (0…), w d.events – zdarzenia (trip, heat). */
	const RESISTOR = /^(EU07|EP09|ET22|EN57|EN71|ED72)$/, INVERTER = /^(EN96|EN62|EN76|48WE|27WE|ED250)$/;
	function createDrive(train) {
		const id = train.specs && train.specs[0] ? train.specs[0].id : '';
		if (RESISTOR.test(id)) return { kind: 'resistor', id, max: 28, I: 0, heat: 0, over: 0, events: [], vS: train.vmax * 0.42, vP: train.vmax * 0.82 };
		if (INVERTER.test(id)) return { kind: 'inverter', id, max: 10, I: 0, F: 0, events: [] };
		return { kind: 'diesel', id, max: 8, I: 0, rpm: 0, events: [] };
	}
	// pozycje ekonomiczne (oporowy) – można na nich jechać dowolnie długo
	function driveEcon(d, lever) { return d.kind !== 'resistor' || lever === 12 || lever >= 24 || lever <= 0; }
	function driveLabel(d, lever) {
		if (lever < 0) return leverLabel(lever);
		if (lever === 0) return '0';
		if (d.kind === 'inverter') return lever * 10 + ' %';
		if (d.kind === 'diesel') return 'N' + lever;
		if (lever <= 12) return 'S' + lever;
		if (lever <= 24) return 'R' + (lever - 12);
		return 'B' + (lever - 24);
	}
	function driveStep(d, train, lever, v, dt, power) {
		d.events.length = 0;
		const n = Math.max(0, lever);
		let F = 0;
		if (d.kind === 'resistor') {
			let veq = 0;
			if (n <= 12) veq = (d.vS * n) / 12;
			else if (n <= 24) veq = d.vS + ((d.vP - d.vS) * (n - 12)) / 12;
			else veq = d.vP * (1 + 0.1 * (n - 24));
			const dv = (d.vS / 12) * 2.6; // skok prądu po przejściu na kolejną pozycję – ok. 0,4 znamionowego
			d.I = n > 0 && power ? Math.max(0, (veq - v) / dv + (n > 24 ? 0 : 0.05)) : 0;
			F = train.maxForce * Math.min(d.I, 1.2) * (n > 24 ? 1 - 0.08 * (n - 24) : 1);
			F = Math.min(F, (train.maxPower * 1.1) / Math.max(v, 1));
			if (d.I > 1.35) {
				d.over += dt;
				if (d.over > 0.4) { d.over = 0; d.events.push('trip'); }
			} else d.over = 0;
			// oporniki rozruchowe: pozycje nieekonomiczne pod prądem grzeją
			if (n > 0 && !driveEcon(d, n) && d.I > 0.1) d.heat += (dt * d.I) / 150;
			else d.heat = Math.max(0, d.heat - dt / 90);
			if (d.heat > 1) { d.heat = 0.6; d.events.push('heat'); }
		} else if (d.kind === 'inverter') {
			const target = power ? (train.maxForce * n) / 10 : 0;
			d.F += Math.max(-train.maxForce * 0.6 * dt, Math.min(train.maxForce * 0.25 * dt, target - d.F));
			F = Math.min(d.F, (train.maxPower * (n / 10)) / Math.max(v, 1) + (n ? 1 : 0));
			d.I = F / train.maxForce;
		} else {
			const target = n / 8;
			d.rpm += Math.max(-0.4 * dt, Math.min(0.18 * dt, target - d.rpm));
			const P = train.maxPower * Math.pow(d.rpm, 1.5);
			F = n > 0 ? Math.min(train.maxForce * Math.min(1, d.rpm * 1.6), P / Math.max(v, 0.5)) : 0;
			d.I = F / train.maxForce;
		}
		return Math.max(0, F);
	}

	/* Przyczepność koło–szyna (μ): sucho ok. 0,30, deszcz 0,20, mgła (wilgoć) 0,22, śnieg 0,15, liście na torze
	   0,06; zima – mniej o 15 %; piasecznica +0,07 (najwyżej 0,33). Siła pociągowa do μ·g·masa napędna, opóźnienie
	   hamowania do μ·g (wszystkie osie hamowane). */
	function adhesion(weather, season, leaves, sand) {
		// lekki deszcz – najgorzej (wilgoć z brudem na szynach, opad ich nie zmywa), ulewa – jak deszcz
		let mu = { drizzle: 0.18, rain: 0.2, downpour: 0.2, storm: 0.19, fog: 0.22, snow: 0.15 }[weather] || 0.3;
		if (leaves) mu = Math.min(mu, ['drizzle', 'rain', 'downpour', 'storm'].includes(weather) ? 0.05 : 0.06);
		if (season === 'winter') mu *= 0.85;
		if (sand) mu = Math.min(0.33, mu + 0.07);
		return mu;
	}

	function brakingDistance(v, decel) {
		return decel > 0 ? (v * v) / (2 * decel) : Infinity;
	}

	// Szacowana droga hamowania z uwzględnieniem czasu napełniania cylindrów (lag – zwłoka hamulca zespolonego, s)
	function brakingEstimate(v, decel, lag) {
		return v * (lag === undefined ? BRAKE_DELAY : lag) * 0.5 + brakingDistance(v, decel);
	}

	return {
		G, LEVER_MIN, LEVER_MAX, BRAKE_STEPS,
		leverCommand, leverLabel, createState, step, createAir, stepAir, airLag, VALVES, PG_RUN, C_MAX, locoBrake,
		createDrive, driveStep, driveLabel, driveEcon, adhesion,
		resistance, tractiveForce, brakingDistance, brakingEstimate,
	};
});
