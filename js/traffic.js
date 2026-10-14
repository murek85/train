/* Ruch na linii: pociągi tła wg rozkładu ułożonego wokół rozkładu gracza. Czysta logika – przeglądarka i Node.
   – w tym samym kierunku (tor gracza): przed pociągiem gracza i za nim; jadą jak automat (ograniczenia, postoje,
     odjazd nie wcześniej niż wg ich rozkładu), stają przed semaforem, gdy odstęp za nim jest zajęty (blokada
     liniowa: zajętość odcinków między semaforami – occupied()); pociąg gracza widzi te same zajętości (sim.js);
   – z przeciwka (drugi tor, linie dwutorowe): tylko widoczne, bez semaforów;
   – linie jednotorowe (route.single – odcinki bez drugiego toru): krzyżowania na mijankach. Pociąg z przeciwka
     wjeżdża na odcinek jednotorowy tylko wtedy, gdy nie ma na nim pociągu w kierunku gracza, mijanka za odcinkiem
     jest wolna i zdąży go zwolnić, zanim dojedzie tam pociąg gracza (z rozkładu) albo pociąg tła; inaczej czeka na
     mijance (tor boczny). Pociąg gracza i pociągi tła w jego kierunku stają przed semaforem, gdy odcinek zajmuje
     pociąg z przeciwka (opposed()); pociągi z przeciwka jadą jeden za drugim z odstępem.
   Gdy pociąg gracza jest punktualny, pociągi tła nie wchodzą mu w drogę: poprzedzające odjeżdżają kilkanaście minut
   wcześniej, szybkie za nim – tak, by dojechać kilka minut po nim. Spóźniony gracz zatrzymuje pociąg za sobą
   (sim.onBlocked – komunikat, kara przy włączonej opcji), za szybki dogania poprzedzający (żółte i czerwone).
   level: 1 – mały ruch, 2 – średni, 3 – duży. */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory(require('./routes.js'));
	else root.TrainTraffic = factory(root.TrainRoutes);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R) {
	'use strict';

	const DWELL = 35; // postój pociągu tła, s
	const STOP_GAP = 15; // zatrzymanie przed semaforem „stój”, m
	const BLOCKED_AFTER = 25; // pociąg za graczem stoi tyle s przed semaforem zajętym przez gracza – zdarzenie
	const HOLD_GAP = 30; // pociąg z przeciwka czeka czołem tyle m przed odcinkiem jednotorowym
	const DECIDE = 1500; // decyzja o wjeździe na odcinek jednotorowy – z tej odległości, m
	const HELD_AFTER = 20; // pociąg z przeciwka czeka tyle s na krzyżowanie z graczem – komunikat dyżurnego

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

	/* składy pociągów tła (konfiguracje jak w menu – model 3D buduje życie w tle z tej samej konfiguracji) */
	const CONSISTS = {
		os: [{ emu: 'EN57', n: 1 }, { emu: 'EN71', n: 1 }, { emu: 'ED72', n: 1 }, { emu: 'EN76', n: 1 }, { emu: 'EN62', n: 1 }, { emu: '48WE', n: 1 }],
		ic: [{ loco: 'EP09', cars: [{ t: 'A9' }, { t: 'B10' }, { t: 'B10' }, { t: 'B10' }, { t: 'B10' }] }, { emu: 'ED250', n: 1 }, { loco: 'EU07', cars: [{ t: '111A' }, { t: '111A' }, { t: '120A' }, { t: '111A' }] }],
		freight: [{ loco: 'ET22', cars: Array.from({ length: 16 }, () => ({ t: 'Eaos' })) }, { loco: 'ET22', cars: Array.from({ length: 12 }, () => ({ t: 'Zacns' })) }, { loco: 'ST44', cars: Array.from({ length: 10 }, () => ({ t: 'Falns' })) }],
	};
	// linia bez sieci trakcyjnej – składy spalinowe
	const DIESEL = {
		os: [{ loco: 'SM42', cars: [{ t: 'Bdhpumn' }, { t: 'Bdhpumn' }] }, { loco: 'SU46', cars: [{ t: '111A' }, { t: '120A' }, { t: '111A' }] }],
		ic: [{ loco: 'SU46', cars: [{ t: '111A' }, { t: '111A' }, { t: '120A' }, { t: '111A' }] }],
		freight: [{ loco: 'ST44', cars: Array.from({ length: 10 }, () => ({ t: 'Falns' })) }, { loco: 'ST44', cars: Array.from({ length: 12 }, () => ({ t: 'Eaos' })) }],
	};
	const NAMES = { os: 'osobowy', ic: 'pospieszny', freight: 'towarowy' };

	function makeTrain(route, kind, cfg, dir, id) {
		const t = R.makeConsist(cfg);
		const len = t.cars.reduce((a, b) => a + b, 0) + t.gap * (t.cars.length - 1);
		return {
			id, kind, cfg, dir, len,
			vmax: Math.min(t.vmax, kind === 'freight' ? 80 / 3.6 : 200 / 3.6),
			acc: Math.max(0.15, Math.min(0.7, (t.maxForce / t.mass) * 0.75)),
			dec: Math.max(0.3, t.serviceDecel * 0.7),
			stops: kind === 'os',
			s: 0, v: 0, t0: 0, next: 0, dwellUntil: null, waitRed: 0, blocked: false, gone: false, active: false,
			granted: [], hold: -1, holdT: 0, held: false, tryAt: -Infinity,
		};
	}

	class Traffic {
		constructor(route, opts = {}) {
			this.route = route;
			this.level = opts.level || 2;
			this.trains = [];
			this.blockedCount = 0;
			// odjazd ostatniego pociągu osobowego tła w kierunku gracza ze stacji (indeks → czas) – zabiera podróżnych
			this.lastStopAt = {};
			// odcinki jednotorowe: users – pociągi z przeciwka, którym przydzielono odcinek (na nim albo w drodze na niego)
			this.secs = (route.single || []).map(([a, b]) => ({ a, b, users: [] }));
			this.heldCount = 0;
			const r = rng(opts.seed || 1), pick = (a) => a[Math.floor(r() * a.length)];
			const st = route.stations, last = st.length - 1;
			const tt = opts.timetable;
			const playerDep = tt ? tt[0].dep : route.originWait, playerArr = tt ? tt[last].arr : null;
			let id = 0;
			const add = (kind, dir, t0) => {
				const tr = makeTrain(route, kind, pick((route.electrified === false ? DIESEL : CONSISTS)[kind]), dir, ++id);
				tr.t0 = t0;
				this.trains.push(tr);
				return tr;
			};
			// w tym samym kierunku: przed graczem (odjazd z początku trasy wcześniej) i za nim
			const ahead = [[1, 'os', 15]], behind = [[1, 'os', 22]];
			if (this.level >= 2) { ahead.push([2, 'ic', 7]); behind.push([2, 'ic', null]); }
			if (this.level >= 3) { ahead.push([3, 'os', 30]); behind.push([3, 'freight', 35]); }
			for (const [, kind, min] of ahead) add(kind, 1, playerDep - min * 60);
			for (const [, kind, min] of behind) {
				let t0 = min === null ? null : playerDep + min * 60;
				// szybki pociąg za graczem: tak, by przy punktualnej jeździe gracza dojechał ok. 4 min po nim
				if (min === null) {
					const probe = makeTrain(route, kind, (route.electrified === false ? DIESEL : CONSISTS).ic[0], 1, 0);
					const run = this.runTime(probe);
					if (run === null || playerArr === null) continue;
					t0 = playerArr + 240 - run;
					if (t0 < playerDep + 120) continue; // wolniejsza trasa – pociąg dogoniłby gracza mimo punktualności
				}
				add(kind, 1, t0);
			}
			// z przeciwka (drugi tor): co takt, od początku trasy w drugą stronę; część jest już w drodze
			if (opts.opposite !== false) {
				// linia z odcinkami jednotorowymi – rzadziej (przepustowość jednego toru z krzyżowaniami)
				const takt = (route.single ? [0, 3600, 2400, 1800] : [0, 1800, 900, 480])[this.level] || 900;
				for (let t = -3600; t < 3 * 3600; t += takt * (0.75 + r() * 0.5)) add(pick(['os', 'os', 'ic', 'freight']), -1, t);
			}
			// stan początkowy: pociągi już w drodze – przebieg od ich odjazdu do chwili 0 (bez innych pociągów)
			// (linia z odcinkami jednotorowymi – wszystkie naraz, z blokadą i krzyżowaniami; pociąg gracza jeszcze nie jedzie)
			if (!this.secs.length) {
				for (const tr of this.trains) if (tr.t0 < 0) { this.start(tr); for (let t = tr.t0; t < 0 && !tr.gone; t += 0.5) this.move(tr, 0.5, t, null); }
			} else {
				const ghost = {
					st: { pos: -1e6 }, L: 0, train: { vmax: 1 }, ss: st.map(() => ({ cleared: true })), plannedDep: () => null,
					signals: route.signals.map((x) => ({ pos: x.pos })),
				};
				const early = this.trains.filter((tr) => tr.t0 < 0);
				const t0 = Math.min(0, ...early.map((tr) => tr.t0));
				for (let t = t0; t < 0; t += 0.5) {
					for (const tr of early) {
						if (tr.gone) continue;
						if (!tr.active) {
							if (t < tr.t0) continue;
							if (tr.dir < 0 && early.some((o) => o.dir < 0 && o.active && !o.gone && o.s + o.len > route.length - 300)) continue;
							if (tr.dir > 0 && this.occupied(-1000, (route.signals[0] ? route.signals[0].pos : route.length) + 20, tr.id)) continue;
							this.start(tr);
						}
						this.move(tr, 0.5, t, ghost);
					}
				}
				for (const tr of this.trains) { tr.tryAt = -Infinity; tr.holdT = 0; }
			}
		}

		// odcinek [a, b] zajmuje (albo ma przydzielony) pociąg z przeciwka – semafor przed nim „stój”
		opposed(a, b) {
			for (const x of this.secs) if (x.users.length && x.a < b && x.b > a) return true;
			return false;
		}
		/* czas jazdy pociągu tła z czołem od from do to (szacunek jak eta: 85 % dozwolonej prędkości, postoje osobowych) */
		travel(tr, from, to) {
			const route = this.route, dir = tr.dir, d = (to - from) * dir;
			let t = 0;
			for (let x = 0; x < d; x += 200) {
				const v = Math.min(tr.vmax, R.limitAt(route, from + dir * (x + 100)) / 3.6) * 0.85;
				t += Math.min(200, d - x) / Math.max(5, v);
			}
			if (tr.stops) for (const k of route.stations) if ((k.pos - from) * dir > 5 && (k.pos - to) * dir < 0) t += DWELL + 30;
			// rozpędzanie z postoju
			if (tr.v < 3) t += tr.vmax / tr.acc / 2;
			return t;
		}
		/* Czy pociąg z przeciwka tr może wjechać na odcinek jednotorowy k (sim – pociąg gracza)? null – tak, inaczej
		   powód: 'player' (pociąg gracza na odcinku albo dojedzie do niego przed jego zwolnieniem), 'train' (pociąg tła
		   w kierunku gracza), 'loop' (odcinek albo mijanka za nim zajęte przez inny pociąg z przeciwka) */
		canEnter(tr, k, now, sim) {
			const sec = this.secs[k], a = sec.a, b = sec.b, st = this.route.stations;
			const p = sim.st.pos;
			if (p > a - 5 && p - sim.L < b + 5) return 'player';
			for (const o of this.trains) if (o.dir > 0 && o.active && !o.gone && o.s > a - 5 && o.s - o.len < b + 5) return 'train';
			// jeden pociąg z przeciwka na odcinku (mijanka za nim ma miejsce na jeden skład); kolejno – pierwszy w kolejce
			if (sec.users.some((id) => id !== tr.id)) return 'loop';
			for (const o of this.trains) if (o !== tr && o.dir < 0 && o.active && !o.gone && o.s < tr.s && o.s > b - 5) return 'loop';
			if (k > 0) {
				const lo = this.secs[k - 1].b;
				for (const o of this.trains) if (o !== tr && o.dir < 0 && o.active && !o.gone && o.s < a && o.s + o.len > lo) return 'loop';
			}
			// odcinek zwolniony (koniec składu za początkiem odcinka) – z zapasem
			const clear = now + this.travel(tr, tr.s, a - tr.len - 10) + 30;
			// pociąg gracza: najwcześniej z największą prędkością składu, nie przed odjazdem wg rozkładu ze stacji przed odcinkiem
			if (p - sim.L < b) {
				const vp = Math.max(10, sim.train.vmax);
				let tp = now + Math.max(0, a - p) / vp;
				for (let i = 0; i < st.length; i++) {
					const x = st[i], q = sim.ss[i];
					if (!q || !x.stop || x.terminus || x.pos >= a || x.pos < p - sim.L - 50 || q.cleared || q.state === 'departed' || q.state === 'missed') continue;
					let dep = sim.plannedDep ? sim.plannedDep(i) : null;
					if (q.state === 'served' && q.boardEnd) dep = Math.max(dep === null ? 0 : dep, q.boardEnd);
					if (dep !== null) tp = Math.max(tp, dep + (a - x.pos) / vp);
				}
				if (tp < clear) return 'player';
			}
			// pociągi tła w kierunku gracza (także te, które dopiero wyjadą z początku trasy)
			for (const o of this.trains) {
				if (o.dir < 0 || o.gone) continue;
				if (o.active && o.s - o.len >= b) continue;
				const from = o.active ? o.s : Math.min(st[0].pos - 400, 0);
				if (now + Math.max(0, a - from) / o.vmax + (o.active ? 0 : Math.max(0, o.t0 - now)) < clear) return 'train';
			}
			return null;
		}

		// przejazd pojedynczego pociągu tła (bez innych) – czas od startu do końca trasy, s
		runTime(tr) {
			const copy = Object.assign({}, tr, { t0: 0 });
			this.start(copy);
			let t = 0;
			for (; t < 4 * 3600 && !copy.gone; t += 0.5) this.move(copy, 0.5, t, null);
			return copy.gone ? t : null;
		}

		start(tr) {
			const st = this.route.stations;
			tr.active = true;
			if (tr.dir > 0) { tr.s = Math.min(st[0].pos - 400, 0); tr.next = 0; } else { tr.s = this.route.length; tr.next = st.length - 1; }
			tr.v = tr.vmax * 0.6;
		}

		// odcinki blokowe: [semafor, następny semafor) – zajęty, gdy nachodzi na niego pociąg tła jadący w kierunku gracza
		occupied(a, b, exceptId) {
			for (const tr of this.trains) {
				if (!tr.active || tr.gone || tr.dir < 0 || tr.id === exceptId) continue;
				if (tr.s > a && tr.s - tr.len < b) return true;
			}
			return false;
		}

		/* ruch pociągu tła o dt (czas symulacji now); sim – symulacja gracza (null – przebieg próbny / stan początkowy):
		   prędkość docelowa z ograniczeń (z wyprzedzeniem), postoju na stacji i semafora „stój” */
		move(tr, dt, now, sim) {
			const route = this.route, st = route.stations, dir = tr.dir;
			const front = tr.s;
			// koniec trasy: w kierunku gracza – przed ostatnią stacją (zjazd na inny tor), z przeciwka – za początkiem
			if (dir > 0 ? front > st[st.length - 1].platformStart - 60 : front < -200) { tr.gone = true; tr.active = false; return; }
			const b = tr.dec;
			const brakeTo = (vt, d) => Math.sqrt(vt * vt + 2 * b * Math.max(0, d));
			const look = Math.min(route.length, Math.max(0, front));
			let target = Math.min(tr.vmax, R.limitOver(route, dir > 0 ? look - tr.len : look, dir > 0 ? look : look + tr.len) / 3.6);
			// ograniczenia przed czołem
			for (const l of route.limits) {
				const d = dir > 0 ? l.pos - front : front - l.pos;
				if (d > 0 && d < 3000) target = Math.min(target, brakeTo(l.speed / 3.6, d - 30));
			}
			// postój na stacji (osobowe): W4 stacji, odjazd po postoju, nie wcześniej niż wg rozkładu (odjazd + bieg)
			let stopAt = null;
			if (tr.stops && tr.next >= 0 && tr.next < st.length) {
				const s = st[tr.next];
				// z przeciwka: czoło przy początku peronu (W4 drugiego toru), skład wzdłuż peronu
				const stopPos = dir > 0 ? s.pos : s.platformStart + 10;
				const d = dir > 0 ? stopPos - front : front - stopPos;
				if (tr.dwellUntil !== null) {
					if (now >= tr.dwellUntil) { tr.dwellUntil = null; tr.next += dir; }
					else { tr.v = 0; return; }
				} else if (d < 0.8 && tr.v < 0.3) {
					tr.v = 0;
					tr.dwellUntil = now + DWELL;
					if (sim && dir > 0) this.lastStopAt[tr.next] = tr.dwellUntil;
					return;
				} else if (d < -20) tr.next += dir; // przejechany (np. start na stacji)
				else stopAt = d;
			} else if (!tr.stops) {
				const s = st[tr.next];
				if (s && (dir > 0 ? front > s.pos : front < s.pos)) tr.next += dir;
			}
			if (stopAt !== null) target = Math.min(target, brakeTo(0, stopAt - 0.5));
			// z przeciwka na linii z odcinkami jednotorowymi: odstęp za poprzedzającym pociągiem z przeciwka, krzyżowania
			if (dir < 0 && this.secs.length) {
				let lead = null;
				for (const o of this.trains) if (o !== tr && o.dir < 0 && o.active && !o.gone && o.s < front && (!lead || o.s > lead.s)) lead = o;
				if (lead) target = Math.min(target, brakeTo(0, front - (lead.s + lead.len) - 80));
				// zwolnienie odcinków za sobą (koniec składu za początkiem odcinka)
				for (let j = tr.granted.length - 1; j >= 0; j--) {
					const x = this.secs[tr.granted[j]];
					if (front + tr.len < x.a) { x.users = x.users.filter((id) => id !== tr.id); tr.granted.splice(j, 1); }
				}
				// następny odcinek przed czołem
				let k = -1;
				for (let j = this.secs.length - 1; j >= 0; j--) if (this.secs[j].b <= front + 1) { k = j; break; }
				tr.hold = -1;
				if (k >= 0 && !tr.granted.includes(k) && front - this.secs[k].b < DECIDE) {
					let why = null;
					if (sim) {
						if (now >= tr.tryAt) { tr.why = this.canEnter(tr, k, now, sim); tr.tryAt = now + 1; }
						why = tr.why;
					}
					if (!why) { this.secs[k].users.push(tr.id); tr.granted.push(k); tr.holdT = 0; tr.why = null; }
					else {
						tr.hold = k;
						target = Math.min(target, brakeTo(0, front - (this.secs[k].b + HOLD_GAP)));
					}
				}
			}
			// semafor przed czołem (tylko w kierunku gracza): odstęp za nim zajęty – zatrzymanie przed semaforem
			tr.redBy = null;
			if (dir > 0 && sim) {
				const sigs = sim.signals;
				const k = sigs.findIndex((x) => x.pos > front + 1);
				if (k >= 0) {
					const a = sigs[k].pos, e = k + 1 < sigs.length ? sigs[k + 1].pos : route.length;
					const p = sim.st.pos, playerIn = p > a && p - sim.L < e;
					if (playerIn || this.occupied(a, e, tr.id) || this.opposed(a, e)) {
						const d = a - STOP_GAP - front;
						target = Math.min(target, brakeTo(0, d));
						if (d < 30) tr.redBy = playerIn ? 'player' : 'train';
					}
				}
			}
			// przyspieszanie / hamowanie do prędkości docelowej
			if (target > tr.v) tr.v = Math.min(target, tr.v + tr.acc * dt);
			else tr.v = Math.max(target, tr.v - b * 1.6 * dt);
			if (target < 0.05 && tr.v < 0.3) tr.v = 0;
			tr.s += dir * tr.v * dt;
		}

		update(sim, dt) {
			const now = sim.time;
			for (const tr of this.trains) {
				if (tr.gone) continue;
				if (!tr.active) {
					if (now < tr.t0) continue;
					// wjazd na początek trasy tylko przy wolnym pierwszym odstępie (za pociągiem gracza, bez innych)
					if (tr.dir > 0) {
						const first = sim.signals[0], a = Math.min(this.route.stations[0].pos - 400, 0) - 50, e = first ? first.pos : this.route.length;
						if (sim.st.pos - sim.L < e + 20 || this.occupied(a, e + 20, tr.id) || this.opposed(a, e + 20)) continue;
					}
					// z przeciwka (linia z odcinkami jednotorowymi): wjazd, gdy koniec trasy jest wolny (pociąg przed nim odjechał)
					if (tr.dir < 0 && this.secs.length && this.trains.some((o) => o.dir < 0 && o.active && !o.gone && o.s + o.len > this.route.length - 300)) continue;
					this.start(tr);
				}
				this.move(tr, dt, now, sim);
				// pociąg za graczem stoi przed semaforem zajętym przez gracza – raz na postój
				if (tr.redBy === 'player' && tr.v === 0) {
					tr.waitRed += dt;
					if (tr.waitRed >= BLOCKED_AFTER && !tr.blocked) {
						tr.blocked = true;
						this.blockedCount++;
						if (sim.onBlocked) sim.onBlocked(tr);
					}
				} else { tr.waitRed = 0; if (tr.v > 3) tr.blocked = false; }
				if (tr.hold >= 0 && tr.v === 0) {
					tr.holdT += dt;
					if (tr.why === 'player' && tr.holdT >= HELD_AFTER && !tr.held) {
						tr.held = true;
						this.heldCount++;
						if (sim.onHeld) sim.onHeld(tr, this.secs[tr.hold]);
					}
				}
			}
		}

		// pociągi tła do rysowania i dźwięku: w ruchu i na trasie
		active() { return this.trains.filter((t) => t.active && !t.gone); }

		/* Przewidywany czas przyjazdu czoła pociągu tła na stację i (tablice odjazdów, zapowiedzi) – szacunek: jazda
		   z ok. 85 % dozwolonej prędkości (próbki co 200 m) i postoje osobowych; plan – to samo od odjazdu z początku
		   trasy (t0, „wg rozkładu”). null – pociąg już minął stację albo zjechał z trasy. */
		eta(tr, i, now, plan) {
			const route = this.route, st = route.stations, s = st[i];
			if (!s || (!plan && tr.gone)) return null;
			const dir = tr.dir, pos = dir > 0 ? s.pos : s.platformStart + 10;
			let from, t;
			if (tr.active && !plan) { from = tr.s; t = tr.dwellUntil !== null ? Math.max(now, tr.dwellUntil) : now; }
			else { from = dir > 0 ? Math.min(st[0].pos - 400, 0) : route.length; t = plan ? tr.t0 : Math.max(now, tr.t0); }
			const d = (pos - from) * dir;
			if (d < -5) return null;
			for (let x = 0; x < d; x += 200) {
				const v = Math.min(tr.vmax, R.limitAt(route, from + dir * (x + 100)) / 3.6) * 0.85;
				t += Math.min(200, d - x) / Math.max(5, v);
			}
			if (tr.stops) for (const k of st) if ((k.pos - from) * dir > 30 && (k.pos - s.pos) * dir < -30 && k.index !== i) t += DWELL + 30;
			return t;
		}
		// pociągi zbliżające się do miejsca pos (czoło przed nim, w odległości do range m) – zapowiedzi na peronie
		approaching(pos, range) {
			return this.active().filter((tr) => { const d = (pos - tr.s) * tr.dir; return d > 0 && d < range; });
		}

		snapshot() {
			return {
				blockedCount: this.blockedCount, heldCount: this.heldCount, lastStopAt: Object.assign({}, this.lastStopAt), users: this.secs.map((x) => x.users.slice()),
				trains: this.trains.map((t) => ({ id: t.id, s: t.s, v: t.v, next: t.next, dwellUntil: t.dwellUntil, waitRed: t.waitRed, blocked: t.blocked, gone: t.gone, active: t.active, granted: t.granted.slice(), holdT: t.holdT, held: t.held })),
			};
		}
		restore(o) {
			this.blockedCount = o.blockedCount || 0;
			this.lastStopAt = Object.assign({}, o.lastStopAt || {});
			this.heldCount = o.heldCount || 0;
			if (o.users) this.secs.forEach((x, k) => { x.users = (o.users[k] || []).slice(); });
			for (const x of o.trains || []) {
				const t = this.trains.find((y) => y.id === x.id);
				if (t) Object.assign(t, x);
			}
		}
	}

	return { Traffic, NAMES, CONSISTS, DIESEL, DWELL };
});
