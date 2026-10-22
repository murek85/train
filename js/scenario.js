/* Scenariusze: zdarzenia na trasie (komunikaty dyżurnego ruchu, ograniczenia doraźne, zanik napięcia w sieci,
   wydłużone postoje, opóźnienie odjazdu, zmiana pogody), zadania samouczka i cele z gwiazdkami. Do tego zdarzenia
   losowe na dowolnej trasie (także wygenerowanej). Czysta logika bez DOM – przeglądarka i Node (testy).

   Scenariusz (js/scenarios.js): { id, title, desc, level, route, train (skład jak w menu), clock ('HH:MM' – odjazd),
   weather, events: [zdarzenie], tutorial: [krok], goals: [cel] }.
   Zdarzenie: { when, type, … } – when: { start: true } | { at: miejsce } | { time: s } | { arrive: stacja } |
   { depart: stacja }; miejsce: liczba (m od początku trasy) | { km } | { st: stacja, d: m od W4 stacji };
   stacja: indeks (ujemny – od końca) albo nazwa.
     radio   { text, ack }                – komunikat (ack – s na potwierdzenie Enterem)
     slow    { from, to, speed, why }     – ograniczenie doraźne (miejsca): rozkaz pisemny „O” na stacji, na której
                                            pociąg stoi (order: false – zawsze przez radiotelefon), inaczej komunikat
     fault   { signal }                   – uszkodzony semafor („stój” na stałe; po zatrzymaniu – sygnał zastępczy
                                            albo rozkaz „S”); signal: indeks albo oznaczenie (tabliczka)
     hold    { station, extra, why }      – postój wydłużony o extra s
     delay   { extra, why }               – odjazd ze stacji początkowej opóźniony o extra s
     outage  { from, to, duration }       – brak napięcia w sieci na odcinku przez duration s
     weather { key, text }                – zmiana pogody (clear | cloudy | rain | fog | snow)
     frozen  { signal, duration }         – zamarznięta zwrotnica: semafor (wjazdowy) „stój” przez duration s od
                                            zbliżenia się pociągu (1,5 km, w ruchu), komunikaty dyżurnego
   Krok samouczka: { text, until, when } – warunki: nazwy z COND (np. 'leverUp', 'near:1:1500', 'stopped:1').
   Cel: { type, max | min } – typy w GOALS. Gwiazdki: ukończenie – 1, cele – do 2 kolejnych. */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory(require('./routes.js'), require('./sim.js'));
	else root.TrainScenario = factory(root.TrainRoutes, root.TrainSim);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R, S) {
	'use strict';

	const km = (pos) => (pos / 1000).toFixed(1).replace('.', ',');
	const mins = (s) => { const m = Math.round(s / 60); return `${m} min`; };

	function stationIndex(route, st) {
		if (typeof st === 'string') {
			const i = route.stations.findIndex((x) => x.name === st);
			if (i < 0) throw new Error(`Scenariusz: brak stacji „${st}” na trasie ${route.id}`);
			return i;
		}
		return st < 0 ? route.stations.length + st : st;
	}
	// semafor scenariusza: indeks albo oznaczenie (tabliczka)
	function signalIndex(sim, spec) {
		if (typeof spec === 'number') return spec;
		return sim.signals.findIndex((s) => (s.label || s.name) === String(spec));
	}
	function where(route, spec) {
		if (typeof spec === 'number') return spec;
		if (spec && spec.km !== undefined) return spec.km * 1000;
		if (spec && spec.st !== undefined) return route.stations[stationIndex(route, spec.st)].pos + (spec.d || 0);
		throw new Error('Scenariusz: nieznane miejsce ' + JSON.stringify(spec));
	}
	// nadawca komunikatu: dyżurny ruchu najbliższej stacji (nie przystanku) od miejsca zdarzenia
	function dispatcher(route, pos) {
		let best = route.stations[0], bd = Infinity;
		for (const s of route.stations) {
			const d = Math.abs(s.pos - pos) * (s.type === 'halt' ? 3 : 1);
			if (d < bd) { bd = d; best = s; }
		}
		return 'Dyżurny ruchu ' + best.name;
	}
	// nazwa pociągu w komunikatach (relacja – bez odmiany nazw stacji)
	const trainName = (route) => `${route.freight ? 'Pociąg towarowy' : 'Pociąg'} ${route.stations[0].name} – ${route.stations[route.stations.length - 1].name}`;

	/* Warunki kroków samouczka (sim, stan przebiegu, parametry z nazwy po dwukropkach) */
	const COND = {
		cleared: (sim, st, i) => sim.ss[+i || 0].cleared,
		leverUp: (sim) => sim.lever > 0,
		speed: (sim, st, v) => sim.st.v * 3.6 >= +v,
		coast: (sim) => sim.lever === 0 && sim.st.v > 3,
		brake: (sim) => sim.lever < 0,
		horn: (sim) => sim.horn || sim.horn2,
		czuwak: (sim, st) => st.caAlarm && !sim.ca.alarm,
		near: (sim, st, i, d) => sim.st.pos >= sim.route.stations[+i].pos - (+d || 1000),
		stopped: (sim, st, i) => sim.st.v <= 0.02 && sim.next === +i && sim.stopZone(+i) === 'ok',
		doors: (sim, st, i) => sim.ss[+i].state === 'served' || sim.ss[+i].state === 'departed',
		end: (sim) => sim.status === 'ended',
		time: (sim, st, t) => sim.time >= st.stepAt + +t,
	};
	// warunek; „a|b” – wystarczy jeden z nich
	function cond(name, sim, st) {
		if (!name) return true;
		if (String(name).includes('|')) return String(name).split('|').some((n) => cond(n, sim, st));
		const [k, ...args] = String(name).split(':');
		const f = COND[k];
		if (!f) throw new Error('Scenariusz: nieznany warunek ' + name);
		return !!f(sim, st, ...args);
	}

	/* Cele: tekst dla gracza i sprawdzenie po jeździe */
	const GOALS = {
		punctual: {
			text: (g) => `Przyjazd na stację końcową najwyżej ${g.max >= 60 ? mins(g.max) : g.max + ' s'} po czasie`,
			ok: (sim, g) => { const r = sim.records.find((x) => x.index === sim.route.stations.length - 1); return !!r && r.delay <= g.max; },
		},
		noEmergency: { text: () => 'Bez hamowania nagłego', ok: (sim) => sim.stats.emergencies === 0 },
		noOverspeed: { text: () => 'Bez przekroczenia prędkości', ok: (sim) => sim.penalties.overspeed < 1 },
		accuracy: {
			text: (g) => `Każde zatrzymanie najwyżej ${g.max} m od W4`,
			ok: (sim, g) => { const st = sim.records.filter((r) => !r.through); return st.length > 0 && st.every((r) => !r.missed && Math.abs(r.error) <= g.max); },
		},
		// energia pobrana na jazdę minus odzysk przy hamowaniu elektrodynamicznym (hamulec zespolony, nowoczesne EZT)
		energy: { text: (g) => `Zużycie energii najwyżej ${g.max} kWh`, ok: (sim, g) => (sim.stats.energy - (sim.stats.regen || 0)) / 3.6e6 <= g.max },
		horn: { text: () => 'Syrena przed każdym przejazdem', ok: (sim) => sim.crossings.every((c) => c.honked) },
		radio: { text: () => 'Każdy komunikat dyżurnego potwierdzony', ok: (sim) => sim.penalties.radio === 0 },
		orders: { text: () => 'Rozkazy pisemne wykonane bez naruszeń', ok: (sim) => sim.penalties.order === 0 && sim.penalties.overspeed < 1 },
		score: { text: (g) => `Co najmniej ${g.min} pkt`, ok: (sim, g) => sim.score() >= g.min },
	};
	function goalText(g, route) {
		const G = GOALS[g.type];
		if (!G) throw new Error('Scenariusz: nieznany cel ' + g.type);
		return G.text(g, route);
	}

	/* Przebieg scenariusza dla jednej jazdy: sim wywołuje update(sim, dt) co krok; stan (wyzwolone zdarzenia, krok
	   samouczka) w snapshot() – w zapisie gry. */
	function runner(def, route) {
		const events = def.events || [], tut = def.tutorial || [];
		// sprawdzenie miejsc i stacji od razu (błąd w scenariuszu – przy starcie, nie w połowie jazdy)
		for (const e of events) {
			const w = e.when || {};
			if (w.at !== undefined) where(route, w.at);
			for (const k of ['arrive', 'depart']) if (w[k] !== undefined) stationIndex(route, w[k]);
			if (e.from !== undefined) where(route, e.from);
			if (e.to !== undefined) where(route, e.to);
			if (e.station !== undefined) stationIndex(route, e.station);
		}
		const st = { fired: events.map(() => false), restored: [], step: 0, shown: -1, stepAt: 0, caAlarm: false };

		function fire(sim, e) {
			const front = sim.st.pos;
			const radio = (text, ack, pos) => sim.radioMsg(dispatcher(route, pos === undefined ? front : pos), text, ack);
			switch (e.type) {
				case 'radio':
					radio(e.text, e.ack);
					break;
				case 'slow': {
					const a = where(route, e.from), b = where(route, e.to);
					sim.tempLimits.push({ from: a, to: b, speed: e.speed });
					// pociąg stoi na stacji (przed odjazdem) – rozkaz pisemny „O”; w drodze – komunikat dyżurnego
					const at = sim.service;
					if (e.order !== false && at !== null && at !== undefined && !sim.ss[at].cleared) {
						const A = [...route.stations].reverse().find((x) => x.pos < a) || route.stations[0];
						const B = route.stations.find((x) => x.pos > b) || route.stations[route.stations.length - 1];
						sim.issueOrder({
							type: 'O', station: route.stations[at].name,
							text: `Na szlaku ${A.name} – ${B.name} od km ${km(a)} do km ${km(b)} jechać z prędkością nie większą niż ${e.speed} km/h – ${e.why || 'roboty torowe'}.`,
							via: 'station',
						});
					} else radio(e.text || `${trainName(route)}: od km ${km(a)} do km ${km(b)} ograniczenie prędkości do ${e.speed} km/h – ${e.why || 'roboty torowe'}. Proszę potwierdzić.`, e.ack === undefined ? 25 : e.ack, a);
					break;
				}
				case 'fault': {
					const i = signalIndex(sim, e.signal);
					if (i >= 0) sim.signals[i].fault = true;
					break;
				}
				case 'hold': {
					const i = stationIndex(route, e.station);
					sim.ss[i].extra = (sim.ss[i].extra || 0) + e.extra;
					radio(e.text || `${trainName(route)}: na stacji ${route.stations[i].name} postój wydłużony o ${mins(e.extra)} – ${e.why || 'czekamy na przesiadkę z opóźnionego pociągu'}.`, e.ack, route.stations[i].pos);
					break;
				}
				case 'delay':
					sim.ss[0].extra = (sim.ss[0].extra || 0) + e.extra;
					radio(e.text || `${trainName(route)}: odjazd opóźniony o ${mins(e.extra)} – ${e.why || 'późne podstawienie składu'}. Proszę nadrobić, ile się da, w granicach dozwolonej prędkości.`, e.ack);
					break;
				case 'outage': {
					const a = where(route, e.from), b = where(route, e.to);
					const until = sim.time + (e.duration || 420);
					sim.outages.push({ from: a, to: b, until });
					st.restored.push({ until, done: false, pos: a });
					radio(e.text || `${trainName(route)}: zanik napięcia w sieci trakcyjnej od km ${km(a)} do km ${km(b)}. Proszę przejechać ten odcinek z rozpędu – przed nim nastawnik na zero.`, e.ack === undefined ? 25 : e.ack, a);
					break;
				}
				case 'weather':
					sim.events.push({ type: 'weather', key: e.key });
					if (e.text) radio(e.text, e.ack);
					break;
				case 'frozen': {
					const i = signalIndex(sim, e.signal);
					if (i >= 0) sim.freezeSignal(i, e.duration || 180);
					break;
				}
				default:
					throw new Error('Scenariusz: nieznane zdarzenie ' + e.type);
			}
		}
		function due(sim, e) {
			const w = e.when || { start: true };
			if (w.start) return true;
			if (w.at !== undefined) return sim.st.pos >= where(route, w.at);
			if (w.time !== undefined) return sim.time >= w.time;
			if (w.arrive !== undefined) { const i = stationIndex(route, w.arrive); return sim.records.some((r) => r.index === i); }
			if (w.depart !== undefined) { const i = stationIndex(route, w.depart); return sim.ss[i].cleared && sim.ss[i].departAt !== null; }
			return false;
		}

		return {
			def,
			state: st,
			update(sim) {
				if (sim.status !== 'running') return;
				events.forEach((e, k) => {
					if (!st.fired[k] && due(sim, e)) { st.fired[k] = true; fire(sim, e); }
				});
				for (const r of st.restored) {
					if (!r.done && sim.time >= r.until) {
						r.done = true;
						sim.radioMsg(dispatcher(route, r.pos), `${trainName(route)}: napięcie w sieci trakcyjnej przywrócone, jazda bez ograniczeń.`, 0);
					}
				}
				// samouczek: krok pokazywany, gdy spełniony jego warunek „when”, zaliczony po „until”
				if (sim.ca.alarm) st.caAlarm = true;
				while (st.step < tut.length) {
					const s = tut[st.step];
					if (st.shown !== st.step) {
						if (!cond(s.when, sim, st)) return;
						st.shown = st.step;
						st.stepAt = sim.time;
						st.caAlarm = sim.ca.alarm;
						sim.events.push({ type: 'task', text: s.text, n: st.step + 1, of: tut.length });
						sim.sound('click');
					}
					if (!cond(s.until, sim, st)) return;
					st.step++;
					if (st.step >= tut.length) sim.events.push({ type: 'task', text: null });
				}
			},
			// bieżące zadanie samouczka (po wczytaniu zapisu – do ponownego pokazania)
			task() {
				return st.shown === st.step && st.step < tut.length ? { text: tut[st.step].text, n: st.step + 1, of: tut.length } : null;
			},
			snapshot() { return JSON.parse(JSON.stringify(st)); },
			restore(o) { Object.assign(st, JSON.parse(JSON.stringify(o))); },
			goals() { return (def.goals || []).map((g) => goalText(g, route)); },
			result(sim) {
				const ok = sim.status === 'ended';
				const goals = (def.goals || []).map((g) => ({ text: goalText(g, route), ok: ok && GOALS[g.type].ok(sim, g) }));
				const met = goals.filter((g) => g.ok).length;
				const stars = ok ? 1 + (goals.length ? Math.round((2 * met) / goals.length) : 2) : 0;
				return { ok, goals, stars };
			},
		};
	}

	/* Zdarzenia losowe na dowolnej trasie: 2–4 zdarzenia z szablonów (ograniczenie doraźne na szlaku, wydłużony postój,
	   zanik napięcia, zmiana pogody, komunikat informacyjny), losowane z ziarna seed. weather – pogoda na starcie
	   (zmiana pogody tylko z ładnej). */
	function rng(seed) {
		let a = (Math.floor(seed) >>> 0) || 1;
		return () => {
			a = (a + 0x6d2b79f5) >>> 0;
			let t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}
	const FLAVOR = [
		'informuję: na następnej stacji wzmożony ruch podróżnych, proszę o sprawną wymianę.',
		'na szlaku pracują zespoły utrzymania – proszę uważnie obserwować tor i podawać sygnał „Baczność”.',
		'zgłoszono zwierzęta w pobliżu toru – proszę zachować ostrożność.',
		'proszę o informację po przyjeździe na stację końcową, jazda bez zmian.',
	];
	function randomEvents(route, seed, weather, season) {
		const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
		const st = route.stations, last = st.length - 1, events = [];
		// odcinki między stacjami (bez pierwszych i ostatnich 600 m)
		const gaps = [];
		for (let k = 0; k < last; k++) if (st[k + 1].pos - st[k].pos >= 2600) gaps.push(k);
		const used = new Set();
		const gapPick = () => { const free = gaps.filter((k) => !used.has(k)); if (!free.length) return null; const k = pick(free); used.add(k); return k; };
		if (gaps.length && r() < 0.65) {
			const k = gapPick(), g = st[k + 1].pos - st[k].pos;
			const len = 400 + Math.round(r() * 6) * 100;
			const a = Math.round(st[k].pos + 900 + r() * Math.max(0, g - 1500 - len));
			const lim = R.limitOver(route, a, a + len);
			const speed = [30, 40, 60].filter((v) => v < lim - 10);
			// rozkaz „O” na stacji przed odcinkiem (postój), skład bez postojów – komunikat po odjeździe
			// rozkaz wręcza dyżurny – na ostatniej stacji (nie przystanku) z postojem przed odcinkiem
			let ko = k;
			while (ko > 0 && !(st[ko].stop && st[ko].type !== 'halt')) ko--;
			const when = route.freight ? { depart: k } : ko === 0 ? { start: true } : { arrive: ko };
			if (speed.length) events.push({ when, type: 'slow', from: a, to: a + len, speed: pick(speed), why: pick(['roboty torowe', 'zły stan nawierzchni', 'wymiana podkładów', 'prace przy sieci trakcyjnej']) });
		}
		const stops = st.map((s, i) => i).filter((i) => i > 0 && i < last && st[i].stop);
		if (!route.freight && stops.length && r() < 0.45) {
			const i = pick(stops);
			events.push({ when: { arrive: i }, type: 'hold', station: i, extra: 60 + Math.round(r() * 4) * 30 });
		}
		if (route.train.electric && route.electrified !== false && gaps.length && r() < 0.35) {
			const k = gapPick();
			if (k !== null) {
				const g = st[k + 1].pos - st[k].pos, a = Math.round(st[k].pos + g * 0.4);
				events.push({ when: { depart: k }, type: 'outage', from: a, to: a + 500 + Math.round(r() * 7) * 100, duration: 360 });
			}
		}
		// uszkodzony semafor (nie wyjazdowy stacji początkowej): w środkowej części trasy
		const sigs = route.signals.map((x, i) => ({ x, i })).filter(({ x }) => x.pos > st[0].pos + 1500 && x.pos < st[last].pos - 1500 && !(x.type === 'starter' && x.station === 0));
		if (sigs.length && r() < 0.3) events.push({ when: { start: true }, type: 'fault', signal: pick(sigs).i });
		if (['clear', 'few', 'partly', 'cloudy', 'overcast', 'auto'].includes(weather) && r() < 0.3) {
			const key = pick(['drizzle', 'rain', 'fog', 'rain', 'downpour']);
			events.push({ when: { at: Math.round(st[0].pos + (st[last].pos - st[0].pos) * (0.3 + r() * 0.3)) }, type: 'weather', key });
		}
		// zima: zamarznięta zwrotnica przed stacją (semafor wjazdowy na dalszej części trasy) – postój 2–5 min
		if (season === 'winter') {
			// semafor wjazdowy (trasy z mapy) albo ostatni semafor przed stacją (do 1,5 km przed nią)
			const before = (x) => st.some((s) => s.type !== 'halt' && s.pos > x.pos && s.pos - x.pos < 1500);
			const entries = route.signals.map((x, i) => ({ x, i })).filter(({ x }) => (x.kind === 'entry' || (x.type !== 'starter' && x.kind !== 'intermediate' && before(x))) && x.pos > st[0].pos + 2000 && x.pos < st[last].pos);
			if (entries.length && r() < 0.5) events.push({ when: { start: true }, type: 'frozen', signal: pick(entries).i, duration: 120 + Math.round(r() * 6) * 30 });
		}
		while (events.length < 2) {
			const at = Math.round(st[0].pos + (st[last].pos - st[0].pos) * (0.15 + r() * 0.6));
			events.push({ when: { at }, type: 'radio', text: `${trainName(route)}: ${pick(FLAVOR)}`, ack: 20 });
		}
		return { id: 'random', title: 'Zdarzenia losowe', events, goals: [] };
	}

	/* Zadanie dnia: z daty (ziarno) – trasa spośród wbudowanych (u wszystkich ta sama), skład pasujący do linii
	   (zelektryfikowana – EZT albo lokomotywa elektryczna z wagonami, bez sieci – spalinowe), godzina 5:00–20:50,
	   pogoda, pora roku wg miesiąca, zdarzenia losowe (randomEvents z tym samym ziarnem – w grze, po przygotowaniu
	   trasy: events = null, daily: true), 2 cele z puli. routes – opisy tras wbudowanych (id, title, electrified). */
	const DAILY_TRAINS = {
		el: [{ emu: 'EN57', n: 1 }, { emu: 'EN76', n: 1 }, { emu: 'EN96', n: 1 }, { emu: 'ED72', n: 1 }, { loco: 'EU07', cars: [{ t: '111A' }, { t: '111A' }, { t: '120A' }, { t: '111A' }] }, { loco: 'EP09', cars: [{ t: 'A9' }, { t: 'B10' }, { t: 'B10' }] }],
		diesel: [{ loco: 'SM42', cars: [{ t: 'Bdhpumn' }, { t: 'Bdhpumn' }] }, { loco: 'SU46', cars: [{ t: '111A' }, { t: '120A' }, { t: '111A' }] }],
	};
	const DAILY_GOALS = [{ type: 'punctual', max: 60 }, { type: 'noEmergency' }, { type: 'noOverspeed' }, { type: 'accuracy', max: 3 }, { type: 'radio' }];
	function dayKey(date) {
		const d = new Date(date);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}
	function dailyScenario(date, routes) {
		const key = dayKey(date);
		const seed = key.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
		const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)];
		const list = routes.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
		const def = pick(list);
		const train = pick(def.electrified === false ? DAILY_TRAINS.diesel : DAILY_TRAINS.el);
		const min = 300 + Math.floor(r() * 96) * 10;
		const month = new Date(date).getMonth() + 1;
		const season = month >= 9 && month <= 11 ? 'autumn' : month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : 'summer';
		const weather = pick(season === 'winter' ? ['clear', 'partly', 'overcast', 'snow', 'fog'] : ['clear', 'few', 'partly', 'cloudy', 'overcast', 'drizzle', 'rain', 'downpour', 'fog']);
		const goals = [];
		while (goals.length < 2) { const g = pick(DAILY_GOALS); if (!goals.includes(g)) goals.push(g); }
		const dd = key.split('-').reverse().join('.');
		return {
			id: 'daily-' + key, daily: true, seed, title: `Zadanie dnia ${dd}`, level: 'zadanie dnia',
			desc: `${def.title}: ${weather === 'clear' ? 'pogodnie' : { few: 'pojedyncze chmury', partly: 'umiarkowane zachmurzenie', cloudy: 'pochmurno', overcast: 'duże zachmurzenie', drizzle: 'lekki deszcz', rain: 'deszcz', downpour: 'ulewa', fog: 'mgła', snow: 'śnieg' }[weather]}, ${{ spring: 'wiosna', summer: 'lato', autumn: 'jesień', winter: 'zima' }[season]}. Zdarzenia na trasie losowane z daty – u wszystkich takie same.`,
			route: def.id, train, clock: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, weather, season,
			events: null, goals,
		};
	}

	return { runner, randomEvents, dailyScenario, dayKey, where, stationIndex, GOALS, COND, goalText };
});
