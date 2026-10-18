/* Symulacja przejazdu: sygnalizacja, stacje, rozkład, czuwak, punktacja. Bez DOM. */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory(require('./physics.js'), require('./routes.js'));
	else root.TrainSim = factory(root.TrainPhysics, root.TrainRoutes);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P, R) {
	'use strict';

	const HOLD_TRIGGER = 1500; // semafor „trzymający” zaczyna odliczanie, gdy pociąg jest tak blisko
	const OVERSPEED_TOL = 3;
	const OVERSPEED_TRIP = 20;
	const CA_PERIOD = 60;
	const CA_GRACE = 5;
	const OVERRUN_TOL = 8; // ile metrów za koniec peronu może wystawać czoło
	const STOP_EPS = 0.02;
	const SNAPSHOT_V = 1; // wersja formatu zapisu gry (Sim.snapshot)
	const SHP_DIST = 200; // elektromagnes SHP przed semaforem, m
	const SHP_GRACE = 3.5; // czas na potwierdzenie SHP, s

	/* Sygnały na semaforach świetlnych wg instrukcji Ie-1 (PKP PLK). Górne światło zapowiada następny semafor: zielone
	   ciągłe – wolna droga z największą prędkością, zielone migające – następny ogranicza do 100 km/h, pomarańczowe
	   migające – do 40 lub 60 km/h, pomarańczowe ciągłe – następny wskazuje „stój”. Dolne pomarańczowe ciągłe –
	   ograniczenie przy tym semaforze (przez rozjazdy): bez pasa 40 km/h, z pasem pomarańczowym 60, z zielonym 100.
	   own – ograniczenie przy semaforze (null – największa dozwolona), next – 'free' | 100 | 'low' (40/60) | 'stop'. */
	const SIG_NEXT = ['free', 100, 'low', 'stop'];
	const SIG_OWN = { none: ['S2', 'S3', 'S4', 'S5'], 100: ['S6', 'S7', 'S8', 'S9'], 40: ['S10', 'S11', 'S12', 'S13'], 60: ['S10a', 'S11a', 'S12a', 'S13a'] };
	/* Sz – sygnał zastępczy (białe migające obok czerwonego): przejazd obok semafora wskazującego „stój” (uszkodzony),
	   jazda do 40 km/h do następnego semafora */
	const SIGNALS = { S1: { top: 'red', flash: false, low: false, pas: null, own: null, next: null }, Sz: { top: 'red', flash: false, low: false, pas: null, own: 40, next: null, white: true } };
	for (const own of ['none', 100, 40, 60]) {
		SIG_OWN[own].forEach((code, k) => {
			const next = SIG_NEXT[k];
			SIGNALS[code] = {
				top: next === 'free' || next === 100 ? 'green' : 'yellow',
				flash: next === 100 || next === 'low',
				low: own !== 'none',
				pas: own === 100 ? 'green' : own === 60 ? 'yellow' : null,
				own: own === 'none' ? null : own,
				next,
			};
		});
	}
	function signalCode(own, next) {
		return SIG_OWN[own || 'none'][SIG_NEXT.indexOf(next)];
	}
	// opis sygnału dla gracza: prędkość przy semaforze i zapowiedź następnego
	function signalText(code) {
		const S = SIGNALS[code];
		if (code === 'Sz') return { title: 'Sz 40 km/h', next: 'sygnał zastępczy – jazda do 40 km/h' };
		if (!S || code === 'S1') return { title: 'STÓJ', next: 'zatrzymaj się przed nim' };
		const nx = { free: 'następny: wolna droga', 100: 'następny: do 100 km/h', low: 'następny: do 40 lub 60 km/h', stop: 'następny: STÓJ' }[S.next];
		return { title: S.own ? `${S.own} km/h` : S.next === 'stop' ? 'OSTROŻNIE' : 'WOLNA', next: nx };
	}
	// ograniczenie pokazywane przez semafor: spadek dozwolonej prędkości w ciągu SIG_ZONE m za nim (okręg zwrotnicowy)
	const SIG_ZONE = 300;
	function signalSpeed(route, pos) {
		const before = R.limitAt(route, pos - 1), sec = R.limitOver(route, pos, pos + SIG_ZONE);
		if (sec >= before || sec > 100) return null;
		return sec <= 40 ? 40 : sec <= 60 ? 60 : 100;
	}

	// liście na torze (jesień): co ok. 1,5 km z prawdopodobieństwem 0,35 odcinek 150–450 m; stałe dla trasy
	function leafPatches(route) {
		const out = [];
		let k = 0;
		for (let x = route.stations[0].pos + 800; x < route.length - 300; x += 1500) {
			k++;
			if (rnd(k * 3.7 + route.length * 0.001) < 0.35) {
				const a = x + rnd(k * 5.1) * 900, len = 150 + rnd(k * 9.3) * 300;
				out.push([Math.round(a), Math.round(a + len)]);
			}
		}
		return out;
	}

	/* oblodzona sieć trakcyjna (zima): co ok. 2 km z prawdopodobieństwem 0,45 odcinek 300–1200 m, na którym szadź na
	   przewodzie jezdnym – ślizgacz traci styk (łuki, chwilowe przerwy w zasilaniu); stałe dla trasy */
	function icePatches(route) {
		const out = [];
		let k = 0;
		for (let x = route.stations[0].pos + 600; x < route.length - 400; x += 2000) {
			k++;
			if (rnd(k * 4.3 + route.length * 0.0013 + 0.5) < 0.45) {
				const a = x + rnd(k * 6.7 + 1.1) * 1000, len = 300 + rnd(k * 8.1 + 2.3) * 900;
				out.push([Math.round(a), Math.round(a + len)]);
			}
		}
		return out;
	}

	function rnd(seed) {
		const x = Math.sin(seed * 91.17 + 7.3) * 43758.5453;
		return x - Math.floor(x);
	}

	/* Pasażerowie: popyt – podróżnych na minutę przy peronie w kierunku pociągu, wg rodzaju stacji (dworzec / przystanek)
	   i pory dnia (szczyt poranny i popołudniowy, noc); pojemność składu – miejsca siedzące i stojące z długości
	   wagonów pasażerskich (ok. 4,5 osoby na metr) */
	const PAX_KG = 75;
	const BG_DWELL = 35; // postój osobowego pociągu tła (traffic.js DWELL), s
	function paxRate(st, clock) {
		const h = (((clock / 3600) % 24) + 24) % 24;
		const k = h < 5 ? 0.15 : h < 6 ? 0.5 : h < 9 ? 1.8 : h < 14 ? 0.9 : h < 18 ? 1.5 : h < 21 ? 0.8 : 0.35;
		return (st.type === 'halt' ? 0.3 : 0.85) * k;
	}
	function paxCap(route) {
		const t = route.train;
		if (route.freight || t.freight) return 0;
		return Math.round((t.emu ? t.cars : t.cars.slice(1)).reduce((a, b) => a + b, 0) * 4.5);
	}

	function fmtClock(sec) {
		const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
		const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
		return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
	}

	/* Godziny w zapowiedziach do odczytania głosem, jak na dworcu: „o 06:17” → „o godzinie szóstej siedemnaście”,
	   „o 07:05” → „o godzinie siódmej zero pięć”, „o 18:00” → „o godzinie osiemnastej”; godzina bez „o” – w mianowniku
	   („06:17” → „szósta siedemnaście”). Tekst na ekranie zostaje z cyframi. */
	const H_LOC = ['zero', 'pierwszej', 'drugiej', 'trzeciej', 'czwartej', 'piątej', 'szóstej', 'siódmej', 'ósmej', 'dziewiątej', 'dziesiątej',
		'jedenastej', 'dwunastej', 'trzynastej', 'czternastej', 'piętnastej', 'szesnastej', 'siedemnastej', 'osiemnastej', 'dziewiętnastej', 'dwudziestej'];
	const H_NOM = ['zero', 'pierwsza', 'druga', 'trzecia', 'czwarta', 'piąta', 'szósta', 'siódma', 'ósma', 'dziewiąta', 'dziesiąta',
		'jedenasta', 'dwunasta', 'trzynasta', 'czternasta', 'piętnasta', 'szesnasta', 'siedemnasta', 'osiemnasta', 'dziewiętnasta', 'dwudziesta'];
	const N_1_19 = ['zero', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć', 'dziesięć',
		'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
	const N_TENS = { 2: 'dwadzieścia', 3: 'trzydzieści', 4: 'czterdzieści', 5: 'pięćdziesiąt' };
	function hourWords(h, loc) {
		const T = loc ? H_LOC : H_NOM;
		return h <= 20 ? T[h] : `${T[20]} ${T[h - 20]}`;
	}
	function minuteWords(m) {
		if (m < 10) return `zero ${N_1_19[m]}`;
		if (m < 20) return N_1_19[m];
		return N_TENS[Math.floor(m / 10)] + (m % 10 ? ' ' + N_1_19[m % 10] : '');
	}
	function spokenTimes(text) {
		return text.replace(/(\bo\s+)?\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/g, (all, o, hh, mm) => {
			const h = Number(hh), m = Number(mm);
			const w = hourWords(h, !!o) + (m ? ' ' + minuteWords(m) : '');
			return o ? `o godzinie ${w}` : w;
		});
	}

	function fmtDelay(sec) {
		const s = Math.round(Math.abs(sec));
		return (sec < 0 ? '−' : '+') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
	}

	class Sim {
		constructor(route, opts = {}) {
			this.route = route;
			this.train = Object.assign({}, route.train); // kopia – masa zmienia się z liczbą pasażerów
			this.L = route.trainLength;
			/* brake: 'simple' – nastawnik z pozycjami hamowania H1…H4 | 'air' – hamulec zespolony (zawór maszynisty, ciśnienia;
			   nastawnik tylko jazda); shp – samoczynne hamowanie pociągu (elektromagnesy 200 m przed semaforami) */
			/* traffic – ruch na linii (js/traffic.js): pociągi tła, blokada liniowa; trafficPenalty – kara za zatrzymanie
			   pociągu jadącego za graczem */
			// dispatch – rutynowe komunikaty dyżurnego ruchu (odjazd, pociąg na odstępie przed graczem, przyjęcie na stację)
			/* drive: 'simple' – nastawnik J1…J5 | 'series' – napęd wg serii (oporowy, falownik, spalinowy; P.createDrive);
			   weather, season – warunki przyczepności (season: spring | summer | autumn – liście na torach | winter) */
			this.opts = Object.assign({ czuwak: true, timetable: null, brake: 'simple', shp: false, traffic: null, trafficPenalty: false, dispatch: false, drive: 'simple', weather: 'clear', season: 'summer' }, opts);
			this.traffic = this.opts.traffic || null;
			this.timetable = this.opts.timetable;
			this.st = P.createState(route.stations[0].pos);
			this.time = 0;
			this.lever = 0;
			this.horn = false;
			this.horn2 = false; // druga syrena (wysokotonowa, J) – też sygnał „Baczność”
			this.status = 'running';
			this.failReason = '';
			this.events = [];
			this.prompt = null;
			this.limit = R.limitAt(route, this.st.pos);
			this.doorsOpen = true;
			this.next = 0;
			this.service = 0;
			this.ca = { t: 0, alarm: false };
			this.overspeed = false;
			this.inTunnel = false;
			this.penalties = { overspeed: 0, emergency: 0, czuwak: 0, crossing: 0, overrun: 0, panto: 0, radio: 0, shp: 0, traffic: 0, order: 0, flat: 0, drive: 0 };
			/* rozkazy pisemne (Ir-1): „O” – ostrzeżenia (ograniczenie prędkości, jazda ostrożna), wręczany na stacji przed
			   odjazdem; „S” – zezwolenie na przejazd obok semafora wskazującego „stój” (uszkodzony semafor odstępowy),
			   dyktowany przez radiotelefon. Do potwierdzenia odbioru (Enter); bez potwierdzenia – brak odjazdu / ruszenie
			   z hamowaniem i karą. said – rutynowe komunikaty już nadane. */
			this.orders = [];
			this.orderSeq = 0;
			this.said = {};
			this.faultWait = 0;
			this.air = this.opts.brake === 'air' ? P.createAir(this.train) : null;
			/* start z zahamowanym składem (jak na postoju): hamulec prosty – nastawnik na H1, zespolony – zawór na odcięciu
			   po obniżeniu ciśnienia w przewodzie głównym do 4,6 bar (cylindry ok. 1 bar); przed ruszeniem – odhamowanie */
			if (this.air) {
				const a = this.air;
				a.valve = 'lap';
				a.pg = 4.6;
				a.pipe.fill(4.6);
				a.cyl.fill((P.PG_RUN - 4.6) * (P.C_MAX / 1.5));
				this.st.brake = a.cyl[0] / P.C_MAX;
			} else {
				this.lever = -1;
				this.st.brake = P.leverCommand(-1).brake;
			}
			this.drive = this.opts.drive === 'series' ? P.createDrive(this.train) : null;
			/* przyczepność: piasecznica (t – piasek sypie się jeszcze t s, left – zapas, s), poślizg kół przy ruszaniu (slip),
			   blokowanie kół przy hamowaniu (lock – czas, flat – płaskie miejsca już ukarane w tym hamowaniu); jesień – odcinki
			   z liśćmi na torze (leaves: [od, do]), stałe dla trasy */
			this.sand = { t: 0, left: 600 };
			this.slip = false;
			this.lock = { t: 0, flat: false };
			this.leaves = this.opts.season === 'autumn' ? leafPatches(route) : [];
			this.ice = this.iceFor(this.opts.season);
			this.iceGapT = 0; // trwająca przerwa w styku ślizgacza z oblodzonym przewodem (s)
			this.leafSeen = {};
			/* ocena jazdy (rating): przyspieszenie wygładzone (aS), czas szarpnięć (jerk), czas jazdy niekomfortowej
			   (comfort: za szybko w łuku, ostre hamowanie), czas jazdy (moving); samples – [km·1000, prędkość, dozwolona]
			   co 20 m do wykresu; marks – miejsca hamowań nagłych */
			this.rate = { aS: 0, jerk: 0, comfort: 0, moving: 0, samples: [], next: 0, marks: [] };
			this.tractionBlock = false;
			/* Zdarzenia scenariusza (js/scenario.js): ograniczenia doraźne { from, to, speed }, odcinki bez napięcia w sieci
			   { from, to, until }, komunikat radiotelefonu do potwierdzenia, statystyki do celów (energia w J, hamowania
			   nagłe). scenario – przebieg scenariusza (update(sim, dt), snapshot(), restore()), opcjonalnie. */
			this.tempLimits = [];
			this.outages = [];
			this.outageOn = false;
			this.radio = null;
			this.radioSeq = 0;
			this.stats = { energy: 0, emergencies: 0, regen: 0, blocked: 0 };
			this.scenario = this.opts.scenario || null;
			/* Pantograf i wyłącznik szybki (pojazdy elektryczne): up – polecenie (podniesiony/opuszczony), h – położenie
			   ramion 0…1 (podnoszenie sprężonym powietrzem ok. 7 s, opuszczanie ok. 3,5 s), ws – wyłącznik szybki
			   (załącza się po zetknięciu z siecią tylko przy nastawniku na zerze – blokada; wyłącza się przy zaniku
			   napięcia). Bez napięcia: brak siły pociągowej i obwodów pomocniczych (przetwornica, sprężarka, wentylatory). */
			const el = !!this.train.electric;
			this.panto = { up: el, h: el ? 1 : 0, ws: el, wsT: 0 };
			this.bonus = 0;
			this.records = [];
			this.ss = route.stations.map((s, i) => {
				const waiting = s.terminus ? 0 : Math.round(5 + rnd(i * 7 + route.id.length) * 14);
				return {
					state: s.stop ? 'pending' : 'through',
					waiting, initial: waiting,
					boardStart: 0, boardEnd: 0, closeAt: null, departAt: null,
					cleared: !s.stop, overrunAt: null,
				};
			});
			const o = this.ss[0];
			o.state = 'served';
			o.boardEnd = this.plannedDep(0) - 5;
			/* pasażerowie: cap – pojemność, load – w pociągu, left – pozostawieni na peronach (skład pełny), baseMass – masa
			   pustego składu; na stacjach wsiadający (board) zależą od czasu od ostatniego pociągu osobowego w tym kierunku
			   (pociągi tła – traffic.lastStopAt, bez nich – takt 30 min), wysiadający (alight) – część jadących */
			this.pax = { cap: paxCap(route), load: 0, left: 0 };
			this.baseMass = this.train.mass;
			this.ss.forEach((x, i) => { x.board = x.initial = x.waiting = this.paxDemand(i, route.stations[i].stop ? this.plannedArr(i) : null); x.alight = 0; });
			if (this.pax.cap) {
				o.board = o.initial = o.waiting = Math.min(this.pax.cap, this.paxDemand(0, this.plannedDep(0) == null ? 0 : this.plannedDep(0), true));
				this.pax.load = o.board;
				this.setLoad();
			}
			this.signals = route.signals.map((s) => Object.assign({}, s, { holdUntil: null, passed: false, red: true, aspect: 'red', code: 'S1', speed: signalSpeed(route, s.pos) }));
			this.crossings = route.crossings.map((c) => Object.assign({}, c, { honked: false, done: false }));
			// SHP: next – pierwszy semafor, którego elektromagnes (200 m przed nim) jest jeszcze przed czołem pociągu
			this.shp = { alarm: false, t: 0, next: this.signals.findIndex((x) => x.pos - SHP_DIST > this.st.pos) };
			if (this.shp.next < 0) this.shp.next = this.signals.length;
			this.updateSignals();
		}

		// wsiadający na stacji i, gdy pociąg jest tam o czasie t (od startu): popyt × czas od ostatniego pociągu osobowego
		paxDemand(i, t, origin) {
			const st = this.route.stations[i];
			if (!this.pax.cap || st.terminus || (!st.stop && !origin) || t == null) return 0;
			const last = this.traffic && this.traffic.lastStopAt[i] != null ? this.traffic.lastStopAt[i] : t - 1800;
			const gap = Math.max(120, Math.min(3600, t - last));
			return Math.min(160, Math.round(paxRate(st, this.route.startClock + t) * (gap / 60) * (0.7 + 0.6 * rnd(i * 13 + this.route.id.length))));
		}
		setLoad() { this.train.mass = this.baseMass + this.pax.load * PAX_KG; }

		// ---- komunikaty ----
		// key – komunikat dotyczący stanu (czuwak, prędkość, drzwi): HUD go nie dubluje i chowa po dismiss(key)
		msg(text, kind = 'info', key) { this.events.push({ type: 'msg', text, kind, key }); }
		dismiss(key) { this.events.push({ type: 'dismiss', key }); }
		sound(name) { this.events.push({ type: 'sound', name }); }

		// ---- rozkład ----
		plannedArr(i) { return this.timetable ? this.timetable[i].arr : null; }
		plannedDep(i) {
			if (this.timetable) return this.timetable[i].dep;
			return i === 0 ? this.route.originWait : null;
		}
		clock() { return this.route.startClock + this.time; }

		// ---- ograniczenia prędkości: z trasy i doraźne (scenariusz) ----
		limitOver(a, b) {
			let m = R.limitOver(this.route, a, b);
			for (const t of this.tempLimits) if (t.from <= b && t.to >= a) m = Math.min(m, t.speed);
			return m;
		}
		// następna zmiana obowiązującej prędkości za x (HUD): { pos, speed } albo null
		nextLimitChange(x) {
			const eff = (p) => this.limitOver(p, p);
			const cand = this.route.limits.filter((l) => l.pos > x).map((l) => l.pos);
			for (const t of this.tempLimits) for (const p of [t.from, t.to + 0.01]) if (p > x) cand.push(p);
			cand.sort((a, b) => a - b);
			let cur = eff(x);
			for (const p of cand) {
				const v = eff(p);
				if (v !== cur) return { pos: p, speed: v };
				cur = v;
			}
			return null;
		}

		// ---- rozkazy pisemne ----
		issueOrder(o) {
			const order = Object.assign({ no: ++this.orderSeq, at: this.time, acked: false }, o);
			this.orders.push(order);
			this.events.push({ type: 'order', order });
			this.sound('radio');
			return order;
		}
		pendingOrder() { return this.orders.find((o) => !o.acked) || null; }
		ackOrder() {
			const o = this.pendingOrder();
			if (!o) return false;
			o.acked = true;
			this.events.push({ type: 'order-ack', order: o });
			if (o.type === 'S' && o.signal !== undefined) this.grantPermit(o.signal, 'S');
			return true;
		}
		// nadawca komunikatu: dyżurny ruchu najbliższej stacji (nie przystanku)
		dispatcherName(pos) {
			let best = this.route.stations[0], bd = Infinity;
			for (const s of this.route.stations) {
				const d = Math.abs(s.pos - pos) * (s.type === 'halt' ? 3 : 1);
				if (d < bd) { bd = d; best = s; }
			}
			return 'Dyżurny ruchu ' + best.name;
		}
		trainName() {
			const st = this.route.stations;
			return `${this.route.freight ? 'Pociąg towarowy' : 'Pociąg'} ${st[0].name} – ${st[st.length - 1].name}`;
		}
		/* przejazd obok uszkodzonego semafora: Sz – sygnał zastępczy (40 km/h), S – rozkaz „S” (jazda ostrożna 20 km/h);
		   obowiązuje do następnego semafora */
		grantPermit(i, kind) {
			const sig = this.signals[i];
			if (!sig || sig.permit) return;
			sig.permit = kind;
			const end = i + 1 < this.signals.length ? this.signals[i + 1].pos : Math.min(this.route.length, sig.pos + 2000);
			this.tempLimits.push({ from: sig.pos, to: end, speed: kind === 'Sz' ? 40 : 20 });
		}
		/* uszkodzony semafor (zdarzenie): pociąg stoi przed nim – po chwili dyżurny podaje sygnał zastępczy (semafory
		   wjazdowe, wyjazdowe, drogowskazowe) albo dyktuje rozkaz „S” (odstępowe); ruszenie przed potwierdzeniem rozkazu
		   „S” – hamowanie nagłe i −20 pkt */
		checkFaults(dt) {
			const front = this.st.pos;
			const o = this.pendingOrder();
			if (o && o.type === 'S' && this.st.v > 1 && !o.moved) {
				o.moved = true;
				this.systemBrake('Ruszenie bez potwierdzenia rozkazu „S” – hamowanie (−20 pkt). Potwierdź rozkaz: Enter.', 'order', 20);
			}
			const sig = this.nextSignal();
			if (!sig || !sig.fault || sig.permit || sig.asked || this.st.v > 0.1 || sig.pos - front > 300) { this.faultWait = 0; return; }
			this.faultWait += dt;
			if (this.faultWait < 8) return;
			sig.asked = true;
			const i = this.signals.indexOf(sig), name = sig.label || sig.name || '';
			if (sig.type === 'starter' || sig.kind === 'entry' || sig.kind === 'intermediate') {
				this.grantPermit(i, 'Sz');
				this.radioMsg(this.dispatcherName(sig.pos), `${this.trainName()}: semafor ${name} uszkodzony – podaję sygnał zastępczy. Jazda z prędkością do 40 km/h do następnego semafora.`, 0);
			} else {
				const st = this.route.stations, nx = st.find((x) => x.pos > sig.pos);
				this.issueOrder({
					type: 'S', signal: i, station: this.dispatcherName(sig.pos).replace('Dyżurny ruchu ', ''),
					text: `Zezwalam po otrzymaniu rozkazu przejechać obok semafora ${name} wskazującego sygnał „stój” (semafor uszkodzony). Jazda ostrożna z prędkością nie większą niż 20 km/h do następnego semafora${nx ? ` (w kierunku stacji ${nx.name})` : ''}.`,
					via: 'radio',
				});
			}
		}
		/* rutynowe komunikaty dyżurnego (opcja): odjazd ze stacji (nie z przystanku), pociąg tła na odstępie przed
		   graczem (semafor „stój”), przyjęcie na stację końcową */
		checkDispatch() {
			if (!this.opts.dispatch) return;
			const route = this.route, st = route.stations, front = this.st.pos, said = this.said;
			const last = st[st.length - 1];
			if (!said.end && front > last.pos - 2500 && front < last.pos) {
				said.end = 1;
				this.radioMsg(this.dispatcherName(last.pos), `${this.trainName()}: przyjmuję na stację ${last.name}, wjazd na tor przy peronie – zatrzymanie przy W4.`, 0);
			}
			const sig = this.nextSignal();
			if (sig && this.traffic && sig.red && !sig.fault && sig.type !== 'starter' && sig.pos - front < 2500 && !said['t' + sig.pos]) {
				const i = this.signals.indexOf(sig), end = i + 1 < this.signals.length ? this.signals[i + 1].pos : route.length;
				if (this.traffic.occupied(sig.pos, end)) {
					said['t' + sig.pos] = 1;
					this.radioMsg(this.dispatcherName(sig.pos), `${this.trainName()}: na odstępie za semaforem ${sig.label || sig.name || ''} jedzie inny pociąg – semafor wskazuje „stój”, zachowaj ostrożność.`, 0);
				}
			}
		}

		/* krzyżowanie (linia jednotorowa): następny semafor „stój”, bo odcinek za nim zajmuje pociąg z przeciwka –
		   komunikat dyżurnego (zawsze – wyjaśnia postój), raz na semafor */
		checkCrossing() {
			if (!this.traffic || !this.traffic.secs.length) return;
			const sig = this.nextSignal(), front = this.st.pos;
			if (!sig || !sig.opp || sig.fault || sig.pos - front > 1500 || this.said['x' + sig.pos]) return;
			if (sig.type === 'starter' && !this.ss[sig.station].cleared && this.service === sig.station && this.doorsOpen) return; // jeszcze postój
			this.said['x' + sig.pos] = 1;
			this.stats.crossings = (this.stats.crossings || 0) + 1;
			const st = this.route.stations, nx = st.find((x) => x.pos > sig.pos + 100);
			const at = sig.type === 'starter' ? ` na stacji ${st[sig.station].name}` : '';
			this.radioMsg(this.dispatcherName(sig.pos), `${this.trainName()}: krzyżowanie${at} – ${nx ? `od stacji ${nx.name} ` : ''}jedzie pociąg z przeciwka. Semafor ${sig.label || sig.name || ''} wskazuje „stój”, odjazd po jego przyjeździe.`, 0);
		}
		// linia jednotorowa: pociąg z przeciwka czeka na mijance na krzyżowanie z pociągiem gracza (komunikat – opcja)
		onHeld(tr, sec) {
			if (!this.opts.dispatch) return;
			const st = this.route.stations.find((x) => x.pos > sec.b - 50 && x.pos < sec.b + 1500);
			const kind = tr.kind === 'ic' ? 'pospieszny' : tr.kind === 'freight' ? 'towarowy' : 'osobowy';
			this.radioMsg(this.dispatcherName(sec.b), `${this.trainName()}: pociąg ${kind} z przeciwka czeka ${st ? `na stacji ${st.name}` : 'na mijance'} na krzyżowanie z Tobą – proszę o sprawną jazdę.`, 0);
		}

		// ruch na linii: pociąg za graczem stoi przed semaforem, bo odstęp zajmuje pociąg gracza (spóźnienie)
		onBlocked(tr) {
			this.stats.blocked++;
			const pen = this.opts.trafficPenalty;
			if (pen) this.penalties.traffic += 10;
			this.radioMsg('Dyżurny ruchu', `Za Tobą stoi przed semaforem pociąg ${tr.kind === 'ic' ? 'pospieszny' : tr.kind === 'freight' ? 'towarowy' : 'osobowy'} – proszę o sprawną jazdę i krótkie postoje.${pen ? ' (−10 pkt)' : ''}`, 0);
		}

		/* Zapowiedzi (gong, tekst, opcjonalnie głos – main.js): na peronie (where 'platform') i w pociągu ('train');
		   pociąg tła z przeciwka zbliżający się do stacji, na której stoi gracz – raz na pociąg i stację */
		announce(text, where = 'platform') { this.events.push({ type: 'announce', text, where }); }
		checkAnnounce() {
			if (!this.traffic || this.service === null || !this.doorsOpen || !this.pax.cap) return;
			const i = this.service, s = this.route.stations[i];
			if (s.terminus) return;
			for (const tr of this.traffic.approaching(s.pos, 1600)) {
				const key = `ann${tr.id}.${i}`;
				if (this.said[key] || tr.dir > 0) continue; // w kierunku gracza – jedzie za nim, czeka przed semaforem
				this.said[key] = 1;
				const kind = tr.kind === 'ic' ? 'pospieszny' : tr.kind === 'freight' ? 'towarowy' : 'osobowy';
				this.announce(tr.stops ? `Pociąg osobowy do stacji ${this.route.stations[0].name} wjedzie na tor drugi. Prosimy zachować ostrożność i nie zbliżać się do krawędzi peronu.`
					: `Uwaga! Po torze drugim przejedzie pociąg ${kind} bez zatrzymania. Prosimy zachować szczególną ostrożność i odsunąć się od krawędzi peronu.`);
			}
		}

		/* Tablica odjazdów stacji i: pociąg gracza (tor 1) i osobowe tła zatrzymujące się na stacji (w kierunku gracza –
		   tor 1, z przeciwka – tor 2); time – przewidywany odjazd (s od startu), plan – wg rozkładu; do n pozycji w 2 h */
		departures(i, n = 5) {
			const route = this.route, st = route.stations, s = st[i], now = this.time, out = [];
			if (!s) return out;
			const ss = this.ss[i], dep = this.plannedDep(i);
			if (s.stop && !s.terminus && dep != null && !ss.cleared && !['departed', 'missed'].includes(ss.state)) {
				const lastRec = this.records[this.records.length - 1];
				let lag = lastRec ? Math.max(0, lastRec.delay || 0) : 0;
				if (ss.state === 'pending' && i > 0) lag = Math.max(lag, now - this.plannedArr(i));
				if (ss.state === 'served' && this.service === i) lag = Math.max(0, Math.max(ss.boardEnd, now) - dep);
				out.push({ time: dep + lag, plan: dep, name: route.freight ? 'towarowy' : 'osobowy', dest: st[st.length - 1].name, track: 1, player: true });
			}
			if (this.traffic) {
				const T = this.traffic;
				for (const tr of T.trains) {
					if (!tr.stops || tr.gone) continue;
					// stacja końcowa pociągu tła – bez odjazdu
					if ((tr.dir > 0 && i === st.length - 1) || (tr.dir < 0 && i === 0)) continue;
					const dwelling = tr.active && tr.dwellUntil !== null && tr.next === i;
					const eta = dwelling ? tr.dwellUntil - BG_DWELL : T.eta(tr, i, now);
					if (eta === null) continue;
					const plan = T.eta(tr, i, now, true);
					out.push({ time: eta + BG_DWELL, plan: (plan === null ? eta : plan) + BG_DWELL, name: 'osobowy', dest: tr.dir > 0 ? st[st.length - 1].name : st[0].name, track: tr.dir > 0 ? 1 : 2 });
				}
			}
			return out.filter((x) => x.time > now - 20 && x.time < now + 7200).sort((a, b) => a.time - b.time).slice(0, n);
		}

		// ---- radiotelefon (dyżurny ruchu): komunikat; ack – czas na potwierdzenie (s), bez potwierdzenia −10 pkt ----
		radioMsg(from, text, ack) {
			this.radio = { id: ++this.radioSeq, from, text, at: this.time, ack: ack || 0, acked: !ack };
			this.events.push({ type: 'radio', from, text, ack: !!ack, id: this.radio.id });
			this.sound('radio');
		}
		ackRadio() {
			const r = this.radio;
			if (!r || r.acked) return false;
			r.acked = true;
			this.events.push({ type: 'radio-ack', id: r.id });
			return true;
		}
		checkRadio() {
			const r = this.radio;
			if (!r || r.acked || !r.ack || this.time < r.at + r.ack) return;
			r.acked = true;
			this.penalties.radio += 10;
			this.events.push({ type: 'radio-ack', id: r.id });
			this.msg('Nie potwierdzono komunikatu dyżurnego (−10 pkt). Potwierdzenie: klawisz Enter.', 'warn');
		}

		// ---- sterowanie ----
		setLever(n) {
			// hamulec zespolony: nastawnik tylko jazda (0…J5), hamowanie zaworem maszynisty
			n = Math.max(this.air ? 0 : P.LEVER_MIN, Math.min(this.leverMax(), n));
			if (n === this.lever || this.status !== 'running') return;
			if (n === P.LEVER_MIN && this.st.v > 0.5) {
				this.penalties.emergency += 15;
				this.stats.emergencies++;
				this.rate.marks.push(Math.round(this.st.pos));
				this.msg('Hamowanie nagłe! (−15 pkt)', 'warn');
				this.sound('emergency');
			}
			this.lever = n;
			this.ackCzuwak();
			if (n > 0 && this.doorsOpen) this.msg('Drzwi otwarte – blokada rozruchu.', 'warn', 'doors');
		}
		// napięcie w obwodach lokomotywy (spalinowa – zawsze)
		get power() { return !this.train.electric || (this.panto.h >= 1 && this.panto.ws && !this.outageOn); }
		/* zanik napięcia w sieci (scenariusz): na odcinku bez napięcia wyłącznik szybki wyłącza się; po wyjeździe
		   z odcinka (albo po przywróceniu napięcia) załącza się sam przy nastawniku na zerze */
		updateOutage() {
			if (!this.train.electric) return;
			const front = this.st.pos, rear = front - this.L;
			const on = this.outages.some((o) => this.time < o.until && front > o.from && rear < o.to);
			if (on && !this.outageOn) {
				this.msg('Brak napięcia w sieci trakcyjnej – wyłącznik szybki wyłączony. Jazda z rozpędu.', 'warn', 'outage');
				if (this.panto.ws) this.sound('ws-off');
			} else if (!on && this.outageOn) this.msg('Napięcie w sieci – nastawnik na 0, wyłącznik szybki załączy się.', 'info', 'outage');
			this.outageOn = on;
			if (on) this.panto.ws = false;
		}
		togglePanto() {
			const p = this.panto;
			if (!this.train.electric) { this.msg('Lokomotywa spalinowa nie ma pantografu.', 'info'); return; }
			if (this.status !== 'running') return;
			p.up = !p.up;
			this.sound('panto');
			if (p.up) this.msg('Pantograf: podnoszenie…', 'info', 'panto');
			else {
				// opuszczenie pod prądem – łuk elektryczny na ślizgaczu (uszkadza nakładki i przewód jezdny)
				if (p.ws && p.h >= 1 && this.lever > 0 && this.st.v > 0.5) {
					this.penalties.panto += 10;
					this.events.push({ type: 'arc' });
					this.msg('Opuszczenie pantografu pod obciążeniem – łuk elektryczny! (−10 pkt). Najpierw nastawnik na 0.', 'bad', 'panto');
				} else this.msg('Pantograf: opuszczanie – wyłącznik szybki wyłączony.', 'info', 'panto');
				if (p.ws) this.sound('ws-off');
				p.ws = false;
			}
		}
		updatePanto(dt) {
			const p = this.panto;
			if (!this.train.electric) return;
			p.h = p.up ? Math.min(1, p.h + dt / 7) : Math.max(0, p.h - dt / 3.5);
			if (p.h < 1 && p.ws) { p.ws = false; this.sound('ws-off'); }
			// wyłącznik szybki: po zetknięciu z siecią, z nastawnikiem na zerze (1 s na zadziałanie)
			if (p.up && p.h >= 1 && !p.ws) {
				if (this.lever > 0) { if (p.wsT >= 0) this.msg('Nastawnik na 0 – wyłącznik szybki nie załączy się pod obciążeniem.', 'warn', 'panto'); p.wsT = -1; }
				else {
					if (p.wsT < 0) p.wsT = 0;
					p.wsT += dt;
					if (p.wsT > 1) { p.ws = true; p.wsT = 0; this.sound('ws-on'); this.msg('Pantograf podniesiony, wyłącznik szybki załączony – napięcie w sieci.', 'good', 'panto'); }
				}
			}
		}
		leverUp() { this.setLever(this.lever + 1); }
		leverDown() { this.setLever(this.lever - 1); }
		neutral() { this.setLever(0); }
		emergency() {
			if (!this.air) { this.setLever(P.LEVER_MIN); return; }
			if (this.status !== 'running' || this.air.valve === 'emerg') return;
			if (this.st.v > 0.5) {
				this.penalties.emergency += 15;
				this.stats.emergencies++;
				this.rate.marks.push(Math.round(this.st.pos));
				this.msg('Hamowanie nagłe! (−15 pkt)', 'warn');
				this.sound('emergency');
			}
			this.air.valve = 'emerg';
			this.lever = 0;
			this.ackCzuwak();
		}
		/* zawór maszynisty (hamulec zespolony): dir +1 – w stronę hamowania (napełnianie → jazda → odcięcie → hamowanie),
		   −1 – w stronę luzowania; z pozycji nagłego – do odcięcia. Zwraca nową pozycję. */
		brakeValve(dir) {
			const a = this.air;
			if (!a || this.status !== 'running') return null;
			const i = a.valve === 'emerg' ? (dir < 0 ? 2 : 3) : Math.max(0, Math.min(3, P.VALVES.indexOf(a.valve) + dir));
			a.valve = P.VALVES[i];
			this.ackCzuwak();
			return a.valve;
		}
		// ---- przyczepność ----
		onLeaves(a, b) { return this.leaves.some(([x, y]) => x < b && y > a); }
		adhesionAt(a, b) { return P.adhesion(this.opts.weather, this.opts.season, this.onLeaves(a, b), this.sand.t > 0); }
		// zmiana warunków w czasie jazdy (pogoda w pauzie, zdarzenie scenariusza)
		setConditions(weather) { if (weather) this.opts.weather = weather; }
		// pora roku w trakcie jazdy (pauza): przyczepność wg pory, odcinki „liście na torze” tylko jesienią (losowane od nowa)
		setSeason(season) {
			if (!season || season === this.opts.season) return false;
			this.opts.season = season;
			this.leaves = season === 'autumn' ? leafPatches(this.route) : [];
			this.ice = this.iceFor(season);
			return true;
		}
		// odcinki oblodzonej sieci: zima, pojazd elektryczny na linii zelektryfikowanej
		iceFor(season) { return season === 'winter' && this.train.electric && this.route.electrified !== false ? icePatches(this.route) : []; }
		/* oblodzony przewód jezdny: pantograf pod napięciem w ruchu – ślizgacz co chwilę traci styk (częściej przy
		   większej prędkości): łuk elektryczny i krótka przerwa w zasilaniu (0,1–0,35 s, bez siły pociągowej); raz na
		   odcinek komunikat */
		updateIce(dt) {
			if (this.iceGapT > 0) this.iceGapT -= dt;
			if (!this.ice || !this.ice.length || !this.train.electric) return;
			const front = this.st.pos, v = this.st.v;
			const on = this.ice.find(([a, b]) => front > a && front - this.L < b);
			if (!on || !this.power || v < 2) return;
			if (!this.said['ice' + on[0]]) {
				this.said['ice' + on[0]] = 1;
				this.msg('Oblodzona sieć trakcyjna – iskrzenie pantografu i chwilowe przerwy w zasilaniu. Jedź łagodnie.', 'info', 'ice');
			}
			if (this.iceGapT <= 0 && Math.random() < dt * (0.5 + v / 12)) {
				this.iceGapT = 0.1 + Math.random() * 0.25;
				this.events.push({ type: 'iceArc' });
			}
		}
		/* zamarznięta zwrotnica (zdarzenie, zima): semafor wjazdowy „stój” przez duration s od chwili, gdy pociąg w drodze
		   zbliży się na 1,5 km (dyżurny wyjaśnia przez radiotelefon); po rozmrożeniu – zgoda na wjazd */
		freezeSignal(i, duration) {
			const sig = this.signals[i];
			if (!sig) return;
			sig.frozen = duration;
			sig.frozenUntil = null;
		}
		checkFrozen() {
			const front = this.st.pos;
			for (const sig of this.signals) {
				if (!sig.frozen || sig.passed) continue;
				const name = sig.label || sig.name || '', st = this.route.stations.find((x) => x.pos > sig.pos - 50);
				if (sig.frozenUntil === null && sig.pos - front < 1500 && this.st.v > 3) {
					sig.frozenUntil = this.time + sig.frozen;
					this.radioMsg(this.dispatcherName(sig.pos), `${this.trainName()}: zamarznięta zwrotnica w głowicy wjazdowej${st ? ` stacji ${st.name}` : ''} – rozmrażamy. Semafor ${name} wskazuje „stój”, wjazd za ok. ${Math.max(1, Math.round(sig.frozen / 60))} min.`, 0);
				} else if (sig.frozenUntil !== null && this.time >= sig.frozenUntil && !this.said['thaw' + sig.pos]) {
					this.said['thaw' + sig.pos] = 1;
					this.radioMsg(this.dispatcherName(sig.pos), `${this.trainName()}: zwrotnica rozmrożona, droga przebiegu ułożona – semafor ${name} podaje sygnał zezwalający na wjazd.`, 0);
				}
			}
		}
		sandOn() {
			if (this.status !== 'running') return false;
			if (this.sand.left <= 0) { this.msg('Piasecznica pusta.', 'warn', 'sand'); return false; }
			if (this.sand.t <= 0) this.sound('panto');
			this.sand.t = 6;
			return true;
		}
		// hamulec dodatkowy lokomotywy (hamulec zespolony, skład z lokomotywą): dir +1 – mocniej, −1 – luzuj
		locoBrake(dir) {
			if (!this.air || this.air.ep) return null;
			return P.locoBrake(this.air, dir);
		}
		// najwyższa pozycja nastawnika (napęd wg serii: oporowy 28, falownik 10, spalinowy 8)
		leverMax() { return this.drive ? this.drive.max : P.LEVER_MAX; }
		leverName(n = this.lever) { return this.drive ? P.driveLabel(this.drive, n) : P.leverLabel(n); }

		// zwłoka hamulca do szacowania drogi hamowania (asystent, automat)
		brakeLag() { return this.air ? P.airLag(this.air) : undefined; }
		// przycisk czuwania (spacja): kasuje czuwak i SHP (zmiana nastawnika kasuje tylko czuwak)
		ackButton() {
			this.ackCzuwak();
			if (this.shp.alarm) { this.shp.alarm = false; this.dismiss('shp'); }
		}
		ackCzuwak() {
			if (this.ca.alarm) this.dismiss('ca'); // potwierdzony czuwak – komunikat znika od razu
			this.ca.t = 0;
			this.ca.alarm = false;
		}

		systemBrake(text, key, pts) {
			if (this.air) { this.air.valve = 'emerg'; this.lever = 0; } else this.lever = P.LEVER_MIN;
			this.penalties[key] += pts;
			this.stats.emergencies++;
			if (this.rate) this.rate.marks.push(Math.round(this.st.pos));
			this.msg(text, 'bad');
			this.sound('emergency');
		}

		stopZone(i) {
			const s = this.route.stations[i];
			const front = this.st.pos, rear = front - this.L;
			const maxFront = s.terminus ? this.route.bufferPos : s.platformEnd + OVERRUN_TOL;
			if (front > maxFront) return 'over';
			// skład towarowy (dłuższy niż peron): liczy się czoło – do 40 m przed W4
			if (this.route.freight) return front >= s.pos - 40 ? 'ok' : 'far';
			if (rear < s.platformStart - 3) return front > s.platformStart ? 'short' : 'far';
			return 'ok';
		}

		canOpenDoors() {
			const s = this.route.stations[this.next];
			return !this.doorsOpen && this.st.v <= STOP_EPS && !!s && s.stop &&
				this.ss[this.next].state === 'pending' && this.stopZone(this.next) === 'ok';
		}

		toggleDoors() {
			if (this.status !== 'running') return;
			if (this.doorsOpen) { this.msg('Drzwi zamkną się same po wymianie pasażerów.'); return; }
			if (this.st.v > STOP_EPS) { this.msg('Nie można otworzyć drzwi w czasie jazdy!', 'warn'); return; }
			if (!this.canOpenDoors()) { this.msg('Tu nie ma peronu – drzwi pozostają zamknięte.', 'warn'); return; }
			this.serve(this.next);
		}

		serve(i) {
			const s = this.route.stations[i], ss = this.ss[i];
			ss.state = 'served';
			this.doorsOpen = true;
			this.service = i;
			const err = this.st.pos - s.pos;
			const planned = this.plannedArr(i);
			const delay = planned == null ? 0 : this.time - planned;
			const stopPts = Math.max(0, Math.round(100 - Math.abs(err) * 5));
			const timePts = delay <= 30 ? 50 : Math.max(-50, Math.round(50 - (delay - 30) / 2));
			this.records.push({ station: s.name, index: i, planned, actual: this.time, delay, error: err, stopPts, timePts });
			ss.boardStart = this.time;
			const pax = this.pax;
			if (pax.cap) {
				// wysiadają: stacja końcowa – wszyscy, dworzec ok. 25 %, przystanek ok. 10 %; wsiadają – do zapełnienia składu
				ss.alight = s.terminus ? pax.load : Math.round(pax.load * (s.type === 'halt' ? 0.1 : 0.25) * (0.6 + 0.8 * rnd(i * 5 + 2)));
				const want = this.paxDemand(i, this.time);
				const room = Math.max(0, pax.cap - (pax.load - ss.alight));
				ss.board = ss.initial = ss.waiting = Math.min(want, room);
				ss.left = want - ss.board;
				pax.load = pax.load - ss.alight + ss.board;
				pax.left += ss.left;
				this.setLoad();
				if (ss.left > 0) this.msg(`Skład pełny – ${ss.left} ${ss.left === 1 ? 'podróżny został' : 'podróżnych zostało'} na peronie.`, 'warn');
				/* postój: ok. 10 s na otwarcie i zamknięcie drzwi + wymiana (wysiadający i wsiadający) – ok. 1,2 osoby/s
				   na wagon; nie krócej niż 60 % postoju rozkładowego, nie dłużej niż dwukrotność */
				const flow = Math.max(1.5, (this.train.emu ? this.train.cars.length : this.train.cars.length - 1) * 1.2);
				const need = 10 + (ss.alight + ss.board) / flow;
				ss.boardEnd = this.time + (s.terminus ? Math.min(20, 8 + ss.alight / flow / 2) : Math.max(this.route.dwell * 0.6, Math.min(this.route.dwell * 2, need)));
			} else ss.boardEnd = this.time + (s.terminus ? 8 : this.route.dwell * (0.6 + 0.4 * rnd(i * 3 + 1)));
			this.sound('doors');
			if (pax.cap) {
				const dep = this.plannedDep(i);
				this.announce(s.terminus ? `${this.trainName()} zakończył bieg. Prosimy o opuszczenie wagonów i zabranie bagażu.`
					: `${this.trainName()} stoi przy peronie pierwszym, przy torze pierwszym. ${dep != null ? `Planowy odjazd o ${fmtClock(this.route.startClock + dep).slice(0, 5)}.` : 'Odjazd po wymianie podróżnych.'}`);
			} else this.sound('chime');
			const where = Math.abs(err) < 0.5 ? 'idealnie przy W4' : `${Math.abs(err).toFixed(1)} m ${err < 0 ? 'przed' : 'za'} W4`;
			const when = planned == null ? '' : delay <= 30 ? ', punktualnie' : `, opóźnienie ${fmtDelay(delay)}`;
			this.msg(`${s.name}: zatrzymanie ${where}${when} (+${stopPts + timePts} pkt)`, stopPts + timePts >= 100 ? 'good' : 'info');
		}

		finish() {
			this.status = 'ended';
			this.msg('Koniec trasy. Dziękujemy za jazdę!', 'good');
			this.sound('good');
		}

		fail(reason) {
			this.status = 'failed';
			this.failReason = reason;
			this.lever = P.LEVER_MIN;
			this.msg(reason, 'bad');
			this.sound('crash');
		}

		// ---- pętla ----
		update(dt) {
			if (this.status === 'ended') return;
			const s = this.st;
			this.updateOutage();
			this.updatePanto(dt);
			const cmd = P.leverCommand(this.lever);
			if (this.air) {
				const r = P.stepAir(this.air, dt);
				cmd.brake = r.brake;
				cmd.emergency = r.emergency;
				cmd.direct = true;
				// blokada jazdy: przewód główny poniżej 4 bar (pociąg hamuje) – bez siły pociągowej
				const block = this.air.pg < 4.0;
				if (block && this.lever > 0 && !this.tractionBlock) this.msg('Blokada jazdy: ciśnienie w przewodzie głównym poniżej 4 bar – odhamuj (Q).', 'warn', 'airblock');
				this.tractionBlock = block;
				if (block) cmd.power = 0;
			}
			this.updateIce(dt);
			if (this.doorsOpen || !this.power || this.iceGapT > 0) cmd.power = 0;
			const grade = R.gradeAt(this.route, s.pos - this.L / 2) / 1000;
			const prev = s.pos;
			this.applyDrive(cmd, dt);
			P.step(s, this.train, cmd, grade, dt);
			if (this.drive) s.traction = Math.min(1, s.force / this.train.maxForce);
			// energia pobrana na jazdę (siła pociągowa × prędkość), J
			if (s.force > 0) this.stats.energy += s.force * s.v * dt;
			// odzysk energii przy hamowaniu elektrodynamicznym (nowoczesne EZT, z napięciem w sieci): ok. połowa pracy hamowania
			if (this.air && this.air.ed && s.brake > 0 && s.v > 2 && this.power) this.stats.regen += 0.5 * s.brake * this.train.serviceDecel * this.train.mass * s.v * dt;
			if (this.status !== 'running') return; // po wypadku tylko fizyka – pociąg wyhamowuje
			this.time += dt;
			const front = s.pos;

			if (front >= this.route.bufferPos) {
				s.pos = this.route.bufferPos;
				s.v = 0;
				this.fail('Najechanie na kozioł oporowy za peronem stacji końcowej.');
				return;
			}

			if (this.traffic) this.traffic.update(this, dt);
			this.checkAnnounce();
			this.updateSignals();
			this.checkCrossing();
			this.checkShp(dt);
			this.checkFaults(dt);
			this.checkFrozen();
			for (const sig of this.signals) {
				if (!sig.passed && prev < sig.pos && front >= sig.pos) {
					// przejazd obok „stój” dozwolony tylko na sygnał zastępczy albo rozkaz „S” (permit)
					if (sig.aspect === 'red' && !sig.permit) {
						this.fail(`Minięcie semafora „${sig.name}” wskazującego sygnał STÓJ.`);
						return;
					}
					sig.passed = true;
				}
			}

			this.checkSpeed(dt);
			this.checkCrossings();
			this.checkStations();
			this.checkCzuwak(dt);
			this.trackRating(dt);
			this.checkRadio();
			this.checkDispatch();
			this.inTunnel = this.route.tunnels.some((t) => front > t.from && front - this.L < t.to);
			if (this.scenario) this.scenario.update(this, dt);
		}

		updateSignals() {
			const front = this.st.pos, sigs = this.signals;
			for (let i = 0; i < sigs.length; i++) {
				const sig = sigs[i];
				if (sig.passed) { sig.red = true; continue; }
				/* blokada liniowa (ruch na linii): odstęp za semaforem zajęty przez pociąg tła – „stój”; linia jednotorowa:
				   odcinek za semaforem zajęty (przydzielony) przez pociąg z przeciwka – „stój” do krzyżowania (opp) */
				const end = i + 1 < sigs.length ? sigs[i + 1].pos : this.route.length;
				sig.opp = !!this.traffic && this.traffic.opposed(sig.pos, end);
				const occ = !!this.traffic && (sig.opp || this.traffic.occupied(sig.pos, end));
				if (sig.fault) sig.red = true; // uszkodzony – „stój” na stałe
				else if (sig.type === 'starter') sig.red = !this.ss[sig.station].cleared || occ;
				else if (this.traffic) sig.red = occ;
				else if (sig.hold) {
					if (sig.holdUntil === null && sig.pos - front < HOLD_TRIGGER && this.st.v > 3) sig.holdUntil = this.time + sig.hold;
					sig.red = sig.holdUntil === null || this.time < sig.holdUntil;
				} else sig.red = false;
				// zamarznięta zwrotnica – „stój” do rozmrożenia (odliczanie od zbliżenia się pociągu)
				if (sig.frozen && (sig.frozenUntil === null || this.time < sig.frozenUntil)) sig.red = true;
			}
			/* sygnał wg następnego semafora (za ostatnim – stacja końcowa, jak „stój”) i ograniczenia przy tym semaforze;
			   aspect – barwa górnego światła (HUD, minimapa, ekran w kabinie): red | yellow | green */
			let next = 'stop';
			for (let i = this.signals.length - 1; i >= 0; i--) {
				const sig = this.signals[i];
				sig.code = sig.red ? (sig.permit === 'Sz' ? 'Sz' : 'S1') : signalCode(sig.speed, next);
				sig.aspect = SIGNALS[sig.code].top;
				next = sig.red ? 'stop' : sig.speed === 100 ? 100 : sig.speed ? 'low' : 'free';
			}
		}

		checkSpeed(dt) {
			const front = this.st.pos;
			const limit = this.limitOver(front - this.L, front);
			this.limit = limit;
			const kmh = this.st.v * 3.6;
			if (kmh > limit + OVERSPEED_TOL) {
				this.penalties.overspeed += 2 * dt;
				if (!this.overspeed) {
					this.overspeed = true;
					this.msg(`Przekroczenie prędkości! Ograniczenie ${limit} km/h`, 'warn', 'speed');
					this.sound('warn');
				}
				if (kmh > limit + OVERSPEED_TRIP && this.lever !== P.LEVER_MIN) {
					this.systemBrake('Samoczynne hamowanie: znaczne przekroczenie prędkości (−30 pkt)', 'overspeed', 30);
				}
			} else if (kmh < limit && this.overspeed) {
				this.overspeed = false;
				this.dismiss('speed'); // z powrotem w limicie – ostrzeżenie znika
			}
		}

		checkCrossings() {
			const front = this.st.pos;
			for (const c of this.crossings) {
				if (c.done) continue;
				if ((this.horn || this.horn2) && front >= c.hornFrom && front < c.pos) c.honked = true;
				if (front >= c.pos) {
					c.done = true;
					if (c.honked) this.bonus += 5;
					else {
						this.penalties.crossing += 15;
						this.msg('Brak sygnału „Baczność” (syrena) przed przejazdem (−15 pkt)', 'warn');
					}
				}
			}
		}

		checkStations() {
			const route = this.route, front = this.st.pos, stopped = this.st.v <= STOP_EPS;
			this.prompt = null;

			if (this.service !== null) {
				const i = this.service, s = route.stations[i], ss = this.ss[i];
				if (this.doorsOpen) {
					const span = Math.max(1, ss.boardEnd - ss.boardStart);
					ss.waiting = Math.max(0, Math.round(ss.initial * (1 - (this.time - ss.boardStart) / span)));
					// extra – postój wydłużony przez dyżurnego (scenariusz: przesiadka, opóźnienie na starcie), s
					const dep = this.plannedDep(i), extra = ss.extra || 0;
					if (this.time >= ss.boardEnd + (dep === null ? extra : 0)) {
						if (s.terminus) { this.finish(); return; }
						if (dep === null || this.time >= dep + extra - 3) {
							this.doorsOpen = false;
							ss.closeAt = this.time;
							this.sound('doors');
							this.dismiss('doors');
							this.msg('Drzwi zamknięte.');
						} else this.prompt = extra ? `Postój wydłużony przez dyżurnego – odjazd ok. ${fmtClock(route.startClock + dep + extra).slice(0, 5)}` : `Postój według rozkładu – odjazd o ${fmtClock(route.startClock + dep)}`;
					} else this.prompt = route.freight ? (s.terminus ? 'Skład zatrzymany – koniec jazdy…' : 'Przygotowanie do odjazdu…') : s.terminus ? 'Pasażerowie wysiadają…' : 'Wymiana pasażerów…';
					} else if (!ss.cleared) {
					if (this.pendingOrder()) this.prompt = `Potwierdź odbiór rozkazu pisemnego „${this.pendingOrder().type}” – Enter`;
					else if (this.time >= ss.closeAt + 3) {
						ss.cleared = true;
						ss.state = 'departed';
						ss.departAt = this.time;
						this.sound('whistle');
							this.events.push({ type: 'departed', index: i }); // odjazd ze stacji – gra robi autozapis
						this.msg('Odjazd! Semafor podaje sygnał zezwalający.', 'good');
						// zapowiedź w pociągu: następna stacja z postojem
						const nx = route.stations.findIndex((x, k) => k > i && x.stop);
						if (this.pax.cap && nx > 0) this.announce(`Następna stacja: ${route.stations[nx].name}${route.stations[nx].terminus ? ' – stacja końcowa' : ''}.`, 'train');
						if (this.opts.dispatch && s.type !== 'halt' && i + 1 < route.stations.length) this.radioMsg(this.dispatcherName(s.pos), `${this.trainName()}: odjazd ze stacji ${s.name}, droga przebiegu przygotowana do stacji ${route.stations[i + 1].name}.`, 0);
					} else this.prompt = 'Czekaj na sygnał odjazdu…';
				}
				if (ss.cleared && front > s.starterPos) this.service = null;
			}

			const n = this.next, s = route.stations[n];
			if (!s) return;
			const ss = this.ss[n];
			if (!s.terminus && front > s.starterPos) {
				if (!s.stop) {
					ss.departAt = this.time;
					this.records.push({ station: s.name, index: n, through: true, planned: this.plannedArr(n), actual: this.time, delay: this.plannedArr(n) == null ? 0 : this.time - this.plannedArr(n) });
				}
				this.next++;
				return;
			}
			if (s.stop && ss.state === 'pending' && this.service === null) {
				const zone = this.stopZone(n);
				if (stopped) {
					if (zone === 'ok') this.prompt = route.freight ? 'Naciśnij D, aby zakończyć jazdę' : 'Naciśnij D, aby otworzyć drzwi';
					else if (zone === 'short') this.prompt = 'Pociąg nie mieści się przy peronie – podjedź bliżej tablicy W4';
					else if (zone === 'over' && ss.overrunAt === null) {
						ss.overrunAt = this.time;
						this.penalties.overrun += 60;
						this.records.push({ station: s.name, index: n, missed: true, planned: this.plannedArr(n), actual: this.time, delay: 0, stopPts: 0, timePts: 0 });
						this.msg(`Przejechany peron stacji ${s.name}! (−60 pkt) Czekaj na zgodę dyżurnego.`, 'bad');
						this.sound('bad');
					}
				}
				if (ss.overrunAt !== null && !ss.cleared) {
					if (this.time >= ss.overrunAt + 8) {
						ss.cleared = true;
						ss.state = 'missed';
						ss.departAt = this.time;
						this.msg('Dyżurny zezwala na dalszą jazdę.', 'info');
						this.sound('whistle');
						this.events.push({ type: 'departed', index: n });
					} else this.prompt = 'Czekaj na zgodę dyżurnego ruchu…';
				}
			}
			if (!this.prompt && stopped) {
				const sig = this.nextSignal();
				if (sig && sig.aspect === 'red' && sig.pos - front < 400) this.prompt = 'Semafor wskazuje STÓJ – czekaj na zmianę sygnału';
			}
		}

		/* Napęd i przyczepność przed krokiem fizyki: siła pociągowa z napędu wg serii (albo z nastawnika – w P.step),
		   ograniczona przyczepnością μ·g·masa napędna – napęd prosty: bez poślizgu (jak układ przeciwpoślizgowy), wg serii:
		   poślizg kół (siła spada do ok. 1/3) – zmniejsz nastawnik albo użyj piasecznicy; hamowanie do μ·g – EZT
		   z falownikiem i tryb prosty: bez blokowania, inaczej blokowanie kół, po 1,5 s płaskie miejsca (−10 pkt). */
		applyDrive(cmd, dt) {
			const s = this.st, front = s.pos;
			if (this.sand.t > 0) { this.sand.t -= dt; this.sand.left -= dt; }
			const mu = this.adhesionAt(front - this.L, front);
			// liście na torze – komunikat przy pierwszym wjeździe na odcinek
			for (const [a, b] of this.leaves) {
				if (front > a && front < b && !this.leafSeen[a]) { this.leafSeen[a] = 1; this.msg('Liście na torze – śliska szyna! Łagodnie z nastawnikiem i hamulcem, piasecznica: X.', 'warn', 'leaves'); }
			}
			const adhF = mu * P.G * (this.train.adhMass || this.train.mass * 0.4);
			this.adhF = adhF; // granica siły pociągowej (automat)
			if (this.drive) {
				const pw = cmd.power > 0 && !this.tractionBlock;
				let F = P.driveStep(this.drive, this.train, pw ? this.lever : 0, s.v, dt, pw);
				for (const e of this.drive.events) {
					if (e === 'trip') {
						this.panto.ws = false;
						this.sound('ws-off');
						this.msg(`Przekaźnik nadmiarowy: za szybkie przechodzenie pozycji (${this.leverName()}) – wyłącznik szybki wyłączony. Nastawnik na 0.`, 'bad', 'drive');
					} else if (e === 'heat') {
						this.panto.ws = false;
						this.penalties.drive += 10;
						this.sound('ws-off');
						this.msg('Przegrzanie oporników rozruchowych – za długa jazda na pozycjach oporowych (−10 pkt). Jedź na pozycjach ekonomicznych (S12, R12, B…).', 'bad', 'drive');
					}
				}
				// falownik: układ przeciwpoślizgowy – siła do granicy przyczepności
				if (this.drive.kind === 'inverter') F = Math.min(F, adhF * 0.97);
				// poślizg kół: siła ponad przyczepność
				const slip = F > adhF;
				if (slip && !this.slip) { this.msg('Poślizg kół! Zmniejsz nastawnik albo użyj piasecznicy (X).', 'warn', 'slip'); this.sound('warn'); }
				this.slip = slip;
				cmd.force = slip ? adhF * 0.35 : F;
			} else {
				cmd.forceCap = adhF;
				this.slip = false;
			}
			// hamowanie: ograniczenie przyczepnością
			const maxDec = mu * P.G * 0.95, want = s.brake * (s.emergency ? this.train.emergencyDecel : this.train.serviceDecel);
			const wsp = !this.drive || (this.drive.kind === 'inverter');
			if (want > maxDec && s.v > 0.5 && !wsp) {
				cmd.decelCap = maxDec * 0.7; // koła zablokowane – tarcie ślizgowe
				this.lock.t += dt;
				if (this.lock.t > 1.5 && s.v > 3 && !this.lock.flat) {
					this.lock.flat = true;
					this.penalties.flat += 10;
					this.msg('Zablokowane koła – płaskie miejsca na obręczach (−10 pkt). Hamuj łagodniej na śliskich szynach.', 'bad', 'flat');
				}
			} else {
				cmd.decelCap = maxDec;
				this.lock.t = 0;
				if (want < maxDec * 0.8) this.lock.flat = false;
			}
		}

		/* Ocena jazdy – zbieranie: szarpnięcie – zmiana przyspieszenia (wygładzonego, ok. 0,5 s) szybsza niż 0,8 m/s³;
		   komfort – przyspieszenie poprzeczne w łuku (v²·krzywizna, po odjęciu ok. 0,65 m/s² wyrównanych przechyłką)
		   ponad 1 m/s² albo hamowanie służbowe ponad 1,2 m/s²; próbki do wykresu co 20 m */
		trackRating(dt) {
			const r = this.rate, s = this.st;
			const prev = r.aS;
			r.aS += (s.a - r.aS) * Math.min(1, dt / 0.5);
			if (s.v > 1) {
				r.moving += dt;
				if (Math.abs(r.aS - prev) / dt > 0.8) r.jerk += dt;
				const lat = s.v * s.v * Math.abs(R.curvatureAt(this.route, s.pos)) - 0.65;
				if (lat > 1 || (!s.emergency && -s.a > 1.2)) r.comfort += dt;
			}
			if (s.pos >= r.next) {
				r.samples.push([Math.round(s.pos), Math.round(s.v * 36) / 10, this.limit]);
				r.next = s.pos + 20;
			}
		}
		/* Ocena jazdy (gwiazdki 1–5): punktualność (średnie spóźnienie na postojach), zatrzymania (średnia odległość od W4),
		   płynność i komfort (sekundy na minutę jazdy), energia (zużycie po odliczeniu odzysku wobec przejazdu automatu –
		   timetable.energy), bezpieczeństwo (kary za hamowania nagłe, czuwak, SHP, rozkazy, prędkość, koła, napęd).
		   Ogólna – średnia; jazda przerwana – 1. */
		rating() {
			const stars = (x, lim) => { let k = 5; for (const l of lim) { if (x <= l) return k; k--; } return 1; };
			const stops = this.records.filter((r) => !r.through);
			const min = Math.max(1, this.rate.moving / 60);
			const late = stops.length ? stops.reduce((a, r) => a + Math.max(0, r.delay || 0), 0) / stops.length : 0;
			const err = stops.length ? stops.reduce((a, r) => a + (r.missed ? 20 : Math.abs(r.error)), 0) / stops.length : 0;
			const p = this.penalties;
			const pen = (p.emergency || 0) + (p.czuwak || 0) + (p.shp || 0) + (p.order || 0) + (p.overspeed || 0) + (p.flat || 0) + (p.drive || 0) + (p.radio || 0);
			const ref = this.timetable && this.timetable.energy;
			const net = (this.stats.energy - (this.stats.regen || 0));
			const cats = [
				{ key: 'time', name: 'Punktualność', stars: stars(late, [30, 60, 120, 300]), detail: late < 1 ? 'bez spóźnień' : `średnio ${Math.round(late)} s po czasie` },
				{ key: 'stop', name: 'Zatrzymania przy W4', stars: stops.some((r) => r.missed) ? 1 : stars(err, [0.5, 1.5, 3, 6]), detail: stops.length ? `średnio ${err.toFixed(1)} m od W4` : '—' },
				{ key: 'smooth', name: 'Płynność', stars: stars(this.rate.jerk / min, [1, 3, 6, 12]), detail: `szarpnięcia ${(this.rate.jerk / min).toFixed(1)} s/min` },
				{ key: 'comfort', name: 'Komfort pasażerów', stars: stars(this.rate.comfort / min, [1, 3, 6, 12]), detail: `łuki i hamowanie ${(this.rate.comfort / min).toFixed(1)} s/min` },
				{ key: 'energy', name: 'Energia', stars: ref ? stars(net / ref, [0.85, 1, 1.15, 1.35]) : null, detail: `${(net / 3.6e6).toFixed(1)} kWh${ref ? ` (automat: ${(ref / 3.6e6).toFixed(1)})` : ''}` },
				{ key: 'safety', name: 'Bezpieczeństwo', stars: stars(pen, [0, 15, 40, 80]), detail: pen ? `kary −${Math.round(pen)} pkt` : 'bez naruszeń' },
			];
			const rated = cats.filter((c) => c.stars !== null);
			const overall = this.status === 'ended' ? Math.max(1, Math.round(rated.reduce((a, c) => a + c.stars, 0) / rated.length)) : 1;
			return { cats, overall };
		}

		/* SHP: przejazd nad elektromagnesem 200 m przed semaforem – lampka i sygnał; bez potwierdzenia przyciskiem czuwania
		   (spacja) w ciągu SHP_GRACE s – hamowanie nagłe */
		checkShp(dt) {
			const sh = this.shp, front = this.st.pos;
			while (sh.next < this.signals.length && this.signals[sh.next].pos - SHP_DIST <= front) {
				if (this.opts.shp && this.st.v > 1 && !sh.alarm) {
					sh.alarm = true;
					sh.t = 0;
					this.msg('SHP! Naciśnij spację (przycisk czuwania).', 'warn', 'shp');
					this.sound('shp');
				}
				sh.next++;
			}
			if (!sh.alarm) return;
			sh.t += dt;
			if (sh.t >= SHP_GRACE) {
				sh.alarm = false;
				this.dismiss('shp');
				this.systemBrake('SHP niepotwierdzone – hamowanie nagłe (−40 pkt)', 'shp', 40);
			}
		}

		checkCzuwak(dt) {
			if (!this.opts.czuwak || this.st.v < 0.5) { this.ackCzuwak(); return; }
			this.ca.t += dt;
			if (this.ca.t >= CA_PERIOD && !this.ca.alarm) {
				this.ca.alarm = true;
				this.msg('CZUWAK! Naciśnij spację', 'warn', 'ca');
			}
			if (this.ca.t >= CA_PERIOD + CA_GRACE) {
				this.ackCzuwak();
				this.systemBrake('Czuwak niepotwierdzony – hamowanie nagłe (−40 pkt)', 'czuwak', 40);
			}
		}

		// ---- zapis gry ----
		/* Stan jazdy jako zwykły obiekt (JSON, kilka KB). Bez trasy i rozkładu – te odtwarza gra (trasa z id i składu,
		   rozkład zapisany obok); komunikaty (events, prompt) i wartości wyliczane w kroku (limit, inTunnel) – pominięte. */
		snapshot() {
			const copy = (o) => JSON.parse(JSON.stringify(o));
			return {
				v: SNAPSHOT_V,
				st: copy(this.st), time: this.time, lever: this.lever, status: this.status, failReason: this.failReason,
				doorsOpen: this.doorsOpen, next: this.next, service: this.service, overspeed: this.overspeed,
				ca: copy(this.ca), panto: copy(this.panto), penalties: copy(this.penalties), bonus: this.bonus,
				records: copy(this.records), ss: copy(this.ss),
				signals: this.signals.map((s) => [s.holdUntil, s.passed ? 1 : 0, s.fault ? 1 : 0, s.permit || 0, s.asked ? 1 : 0, s.frozen || 0, s.frozenUntil === undefined ? null : s.frozenUntil]),
				crossings: this.crossings.map((c) => [c.honked ? 1 : 0, c.done ? 1 : 0]),
				tempLimits: copy(this.tempLimits), outages: copy(this.outages), radio: copy(this.radio), radioSeq: this.radioSeq,
				stats: copy(this.stats), scen: this.scenario ? this.scenario.snapshot() : null,
				air: copy(this.air), shp: copy(this.shp), traffic: this.traffic ? this.traffic.snapshot() : null,
				orders: copy(this.orders), orderSeq: this.orderSeq, said: copy(this.said),
				drive: copy(this.drive), sand: copy(this.sand), lock: copy(this.lock), leafSeen: copy(this.leafSeen), weather: this.opts.weather,
				rate: copy(this.rate), pax: copy(this.pax),
			};
		}

		// jazda odtworzona z zapisu (snapshot) na tej samej trasie i tym samym składzie; niezgodny zapis – wyjątek
		static restore(route, opts, snap) {
			const sim = new Sim(route, opts);
			if (!snap || snap.v !== SNAPSHOT_V) throw new Error('Nieznana wersja zapisu.');
			if (snap.ss.length !== sim.ss.length || snap.signals.length !== sim.signals.length || snap.crossings.length !== sim.crossings.length) {
				throw new Error('Zapis nie pasuje do trasy (trasa zmieniła się od zapisu).');
			}
			Object.assign(sim.st, snap.st);
			for (const k of ['time', 'lever', 'status', 'failReason', 'doorsOpen', 'next', 'service', 'overspeed', 'bonus']) sim[k] = snap[k];
			Object.assign(sim.ca, snap.ca);
			Object.assign(sim.panto, snap.panto);
			Object.assign(sim.penalties, snap.penalties);
			sim.records = JSON.parse(JSON.stringify(snap.records));
			sim.ss = JSON.parse(JSON.stringify(snap.ss));
			sim.signals.forEach((s, i) => {
				const x = snap.signals[i];
				s.holdUntil = x[0];
				s.passed = !!x[1];
				s.fault = !!x[2];
				s.permit = x[3] || undefined;
				s.asked = !!x[4];
				s.frozen = x[5] || 0;
				s.frozenUntil = x[6] === undefined ? null : x[6];
			});
			sim.orders = snap.orders || [];
			sim.orderSeq = snap.orderSeq || 0;
			sim.said = snap.said || {};
			if (sim.drive && snap.drive) Object.assign(sim.drive, snap.drive);
			if (snap.sand) Object.assign(sim.sand, snap.sand);
			if (snap.lock) Object.assign(sim.lock, snap.lock);
			sim.leafSeen = snap.leafSeen || {};
			if (snap.rate) Object.assign(sim.rate, snap.rate);
			if (snap.pax) { Object.assign(sim.pax, snap.pax); sim.setLoad(); }
			if (snap.weather) sim.opts.weather = snap.weather;
			sim.crossings.forEach((c, i) => { c.honked = !!snap.crossings[i][0]; c.done = !!snap.crossings[i][1]; });
			// zapisy sprzed scenariuszy – bez tych pól
			sim.tempLimits = snap.tempLimits || [];
			sim.outages = snap.outages || [];
			sim.radio = snap.radio || null;
			sim.radioSeq = snap.radioSeq || 0;
			Object.assign(sim.stats, snap.stats || {});
			if (sim.scenario && snap.scen) sim.scenario.restore(snap.scen);
			if (sim.air && snap.air) Object.assign(sim.air, snap.air);
			if (snap.shp) Object.assign(sim.shp, snap.shp);
			if (sim.traffic && snap.traffic) sim.traffic.restore(snap.traffic);
			const front = sim.st.pos;
			sim.limit = sim.limitOver(front - sim.L, front);
			sim.inTunnel = route.tunnels.some((t) => front > t.from && front - sim.L < t.to);
			sim.updateSignals();
			return sim;
		}

		// ---- informacje dla HUD ----
		nextSignal() {
			return this.signals.find((s) => !s.passed && s.pos > this.st.pos) || null;
		}

		score() {
			const st = this.records.reduce((a, r) => a + (r.stopPts || 0) + (r.timePts || 0), 0);
			const pen = Object.values(this.penalties).reduce((a, b) => a + b, 0);
			return Math.round(st + this.bonus - pen);
		}

		maxScore() {
			const stops = this.route.stations.filter((s, i) => i > 0 && s.stop).length;
			return stops * 150 + this.route.crossings.length * 5;
		}
	}

	// Prosty automatyczny maszynista – do demo w menu, budowy rozkładu i testów.
	function autopilot(sim) {
		if (sim.status !== 'running') return;
		const route = sim.route, s = sim.st, L = sim.L;
		const front = s.pos, v = s.v;
		// zakładane opóźnienie hamowania; na spadku mniejsze (składowa ciężaru – najbardziej stromy spadek w zasięgu 1,5 km)
		let down = 0;
		for (let x = front - L; x < front + 1500; x += 50) down = Math.max(down, -R.gradeAt(route, x) / 1000);
		// przyczepność na najbliższych 1,5 km (śliskie szyny – dłuższe hamowanie)
		const mu = sim.adhesionAt(front - L, front + 1500);
		const b = Math.max(0.12, Math.min(sim.train.serviceDecel * 0.55, mu * 9.81 * 0.55) - 9.81 * down);
		const k = 0.96;
		// hamulec zespolony: zwłoka do narastania hamowania (połowa – narastanie stopniowe)
		const lag = sim.air ? sim.brakeLag() * 0.5 : 0;
		let target = (sim.limitOver(front - L, front) / 3.6) * k;
		const lims = sim.tempLimits.length ? route.limits.concat(sim.tempLimits.map((t) => ({ pos: t.from, speed: t.speed }))) : route.limits;
		for (const lim of lims) {
			if (lim.pos <= front || lim.pos > front + 4000) continue;
			const vl = (lim.speed / 3.6) * k;
			target = Math.min(target, Math.sqrt(vl * vl + 2 * b * Math.max(0, lim.pos - front - 40 - v * lag)));
		}
		let stopAt = null;
		const st = route.stations[sim.next];
		if (st && st.stop && sim.ss[sim.next].state === 'pending') stopAt = st.pos;
		const sig = sim.nextSignal();
		if (sig && sig.aspect === 'red' && !sig.permit) stopAt = stopAt === null ? sig.pos - 20 : Math.min(stopAt, sig.pos - 20);
		let hold = false;
		if (stopAt !== null) {
			const d = stopAt - front;
			let va = Math.sqrt(2 * b * Math.max(0, d - 0.5 - v * lag));
			if (d > 3) va = Math.max(va, 1.2);
			target = Math.min(target, va);
			if (d < 1.5) hold = true;
		}
		const err = target - v;
		let lever;
		if (hold || sim.doorsOpen) lever = -3;
		else if (err > 1.5) lever = 5;
		else if (err > 0.6) lever = 2;
		else if (err > -0.3) lever = 0;
		else if (err > -1) lever = -1;
		else if (err > -2) lever = -2;
		else if (err > -3.5) lever = -3;
		else lever = -4;
		if (stopAt !== null && !hold && v > 0.3) {
			// hamowanie celowane: potrzebne opóźnienie z uwzględnieniem zwłoki hamulca
			const dEff = Math.max(0.3, stopAt - front - v * (sim.air ? lag : 0.6));
			const need = (v * v) / (2 * dEff);
			if (need > b * 0.85) lever = Math.min(lever, -Math.min(4, Math.ceil((need / sim.train.serviceDecel) * 4 + 0.3)));
		}
		// hamulec zespolony: pozycja nastawnika ujemna → wymagane wypełnienie cylindrów → ciśnienie w przewodzie głównym;
		// zawór: hamowanie do tego ciśnienia, potem odcięcie; luzowanie – jazda (napełnianie przy niskim ciśnieniu)
		if (sim.air) {
			const a = sim.air;
			const want = lever < 0 ? Math.min(1, -lever / 4) : 0, pgT = P.PG_RUN - want * 1.5;
			let valve;
			if (want === 0) valve = a.pg < 4.7 ? 'fill' : 'run';
			else if (a.pg > pgT + 0.05) valve = 'brake';
			else if (a.pg < pgT - 0.25) valve = 'run';
			else valve = 'lap';
			if (a.valve === 'emerg' && v > 0.1) valve = 'emerg';
			a.valve = valve;
			lever = want > 0 || a.pg < 4.6 ? 0 : Math.max(0, lever);
		}
		/* napęd wg serii: oporowy – kolejne pozycje, gdy prąd spadnie poniżej 0,85 (cofnięcie przy 1,15), do pozycji
		   ekonomicznej wg potrzebnej siły; falownik – procent siły; spalinowy – pozycja nastawnika. Poślizg – piasecznica
		   i mniejsza pozycja. */
		if (sim.drive && lever > 0) {
			const d = sim.drive;
			if (d.kind === 'resistor') {
				const top = lever >= 5 ? 28 : lever >= 2 ? 24 : 12;
				// granica prądu z przyczepności (bez poślizgu)
				const Ilim = Math.min(1.15, ((sim.adhF || Infinity) * 0.92) / sim.train.maxForce);
				let n = Math.max(0, sim.lever);
				if (sim.slip && n > 0) n--;
				else if (d.heat > 0.75 && !P.driveEcon(d, n)) n = n > 12 ? 12 : 0; // gorące oporniki – pozycja ekonomiczna
				else if (d.I < Math.min(0.85, Ilim - 0.3) && n < top) n++;
				else if (d.I > Ilim && n > 0) n--;
				else if (n > top) n--;
				lever = n;
			} else if (d.kind === 'inverter') lever = sim.slip ? Math.max(1, sim.lever - 2) : lever >= 5 ? 10 : lever * 2;
			else lever = sim.slip ? Math.max(1, sim.lever - 1) : lever >= 5 ? 8 : Math.round(lever * 1.6);
		}
		if (sim.slip || (lever > 0 && mu < 0.12 && v < 8)) sim.sandOn();
		// bez napięcia (zanik w sieci, wyłącznik szybki wyłączony): nastawnik na 0 – wyłącznik załączy się po powrocie napięcia
		if (sim.train.electric && !sim.power) lever = Math.min(lever, 0);
		sim.setLever(lever);
		sim.ackButton();
		sim.ackOrder();
		sim.ackRadio();
		sim.horn = sim.crossings.some((c) => !c.done && front > c.hornFrom + 50 && front < c.pos - 150);
		if (sim.canOpenDoors()) sim.toggleDoors();
	}

	// Rozkład jazdy: czasy przejazdu automatu + zapas, zaokrąglone w górę do 30 s.
	function buildTimetable(route) {
		const sim = new Sim(route, { czuwak: false });
		const dt = 0.1;
		for (let guard = 0; sim.status === 'running' && guard < 300000; guard++) {
			autopilot(sim);
			sim.update(dt);
		}
		if (sim.status !== 'ended') {
			const why = sim.failReason || `pociąg utknął na km ${(sim.st.pos / 1000).toFixed(2)} (za słaby skład na wzniesienie albo błędne pochylenia trasy)`;
			throw new Error('Automat nie ukończył trasy ' + route.id + ': ' + why);
		}
		const arrivals = {};
		sim.records.forEach((r) => { arrivals[r.index] = r.actual; });
		const depart = sim.ss.map((x) => x.departAt);
		depart[0] = route.originWait;
		const tt = [{ arr: null, dep: route.originWait }];
		for (let i = 1; i < route.stations.length; i++) {
			const s = route.stations[i];
			const run = arrivals[i] - depart[i - 1];
			const arr = tt[i - 1].dep + Math.ceil((run * 1.06 + 10) / 30) * 30;
			tt.push({ arr, dep: s.terminus ? null : s.stop ? arr + route.dwell : arr });
		}
		// energia przejazdu automatu (odniesienie oceny „Energia”; w zapisie gry – osobno, tablica JSON jej nie niesie)
		tt.energy = sim.stats.energy - (sim.stats.regen || 0);
		return tt;
	}

	return { Sim, autopilot, buildTimetable, fmtClock, fmtDelay, spokenTimes, OVERRUN_TOL, SIGNALS, signalText, signalSpeed };
});
