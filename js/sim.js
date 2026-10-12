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

	function rnd(seed) {
		const x = Math.sin(seed * 91.17 + 7.3) * 43758.5453;
		return x - Math.floor(x);
	}

	function fmtClock(sec) {
		const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
		const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
		return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
	}

	function fmtDelay(sec) {
		const s = Math.round(Math.abs(sec));
		return (sec < 0 ? '−' : '+') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
	}

	class Sim {
		constructor(route, opts = {}) {
			this.route = route;
			this.train = route.train;
			this.L = route.trainLength;
			this.opts = Object.assign({ czuwak: true, timetable: null }, opts);
			this.timetable = this.opts.timetable;
			this.st = P.createState(route.stations[0].pos);
			this.time = 0;
			this.lever = 0;
			this.horn = false;
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
			this.penalties = { overspeed: 0, emergency: 0, czuwak: 0, crossing: 0, overrun: 0, panto: 0 };
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
			this.signals = route.signals.map((s) => Object.assign({}, s, { holdUntil: null, passed: false, red: true, aspect: 'red' }));
			this.crossings = route.crossings.map((c) => Object.assign({}, c, { honked: false, done: false }));
			this.updateSignals();
		}

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

		// ---- sterowanie ----
		setLever(n) {
			n = Math.max(P.LEVER_MIN, Math.min(P.LEVER_MAX, n));
			if (n === this.lever || this.status !== 'running') return;
			if (n === P.LEVER_MIN && this.st.v > 0.5) {
				this.penalties.emergency += 15;
				this.msg('Hamowanie nagłe! (−15 pkt)', 'warn');
				this.sound('emergency');
			}
			this.lever = n;
			this.ackCzuwak();
			if (n > 0 && this.doorsOpen) this.msg('Drzwi otwarte – blokada rozruchu.', 'warn', 'doors');
		}
		// napięcie w obwodach lokomotywy (spalinowa – zawsze)
		get power() { return !this.train.electric || (this.panto.h >= 1 && this.panto.ws); }
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
		emergency() { this.setLever(P.LEVER_MIN); }
		ackCzuwak() {
			if (this.ca.alarm) this.dismiss('ca'); // potwierdzony czuwak – komunikat znika od razu
			this.ca.t = 0;
			this.ca.alarm = false;
		}

		systemBrake(text, key, pts) {
			this.lever = P.LEVER_MIN;
			this.penalties[key] += pts;
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
			ss.boardEnd = this.time + (s.terminus ? 8 : this.route.dwell * (0.6 + 0.4 * rnd(i * 3 + 1)));
			this.sound('doors');
			this.sound('chime');
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
			this.updatePanto(dt);
			const cmd = P.leverCommand(this.lever);
			if (this.doorsOpen || !this.power) cmd.power = 0;
			const grade = R.gradeAt(this.route, s.pos - this.L / 2) / 1000;
			const prev = s.pos;
			P.step(s, this.train, cmd, grade, dt);
			if (this.status !== 'running') return; // po wypadku tylko fizyka – pociąg wyhamowuje
			this.time += dt;
			const front = s.pos;

			if (front >= this.route.bufferPos) {
				s.pos = this.route.bufferPos;
				s.v = 0;
				this.fail('Najechanie na kozioł oporowy za peronem stacji końcowej.');
				return;
			}

			this.updateSignals();
			for (const sig of this.signals) {
				if (!sig.passed && prev < sig.pos && front >= sig.pos) {
					if (sig.aspect === 'red') {
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
			this.inTunnel = this.route.tunnels.some((t) => front > t.from && front - this.L < t.to);
		}

		updateSignals() {
			const front = this.st.pos;
			for (const sig of this.signals) {
				if (sig.passed) { sig.red = true; continue; }
				if (sig.type === 'starter') sig.red = !this.ss[sig.station].cleared;
				else if (sig.hold) {
					if (sig.holdUntil === null && sig.pos - front < HOLD_TRIGGER && this.st.v > 3) sig.holdUntil = this.time + sig.hold;
					sig.red = sig.holdUntil === null || this.time < sig.holdUntil;
				} else sig.red = false;
			}
			let nextRed = true; // za ostatnim semaforem jest stacja końcowa
			for (let i = this.signals.length - 1; i >= 0; i--) {
				const sig = this.signals[i];
				sig.aspect = sig.red ? 'red' : nextRed ? 'yellow' : 'green';
				nextRed = sig.red;
			}
		}

		checkSpeed(dt) {
			const front = this.st.pos;
			const limit = R.limitOver(this.route, front - this.L, front);
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
				if (this.horn && front >= c.hornFrom && front < c.pos) c.honked = true;
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
					const dep = this.plannedDep(i);
					if (this.time >= ss.boardEnd) {
						if (s.terminus) { this.finish(); return; }
						if (dep === null || this.time >= dep - 3) {
							this.doorsOpen = false;
							ss.closeAt = this.time;
							this.sound('doors');
							this.dismiss('doors');
							this.msg('Drzwi zamknięte.');
						} else this.prompt = `Postój według rozkładu – odjazd o ${fmtClock(route.startClock + dep)}`;
					} else this.prompt = route.freight ? (s.terminus ? 'Skład zatrzymany – koniec jazdy…' : 'Przygotowanie do odjazdu…') : s.terminus ? 'Pasażerowie wysiadają…' : 'Wymiana pasażerów…';
				} else if (!ss.cleared) {
					if (this.time >= ss.closeAt + 3) {
						ss.cleared = true;
						ss.state = 'departed';
						ss.departAt = this.time;
						this.sound('whistle');
						this.msg('Odjazd! Semafor podaje sygnał zezwalający.', 'good');
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
					} else this.prompt = 'Czekaj na zgodę dyżurnego ruchu…';
				}
			}
			if (!this.prompt && stopped) {
				const sig = this.nextSignal();
				if (sig && sig.aspect === 'red' && sig.pos - front < 400) this.prompt = 'Semafor wskazuje STÓJ – czekaj na zmianę sygnału';
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
		const b = Math.max(0.12, sim.train.serviceDecel * 0.55 - 9.81 * down);
		const k = 0.96;
		let target = (R.limitOver(route, front - L, front) / 3.6) * k;
		for (const lim of route.limits) {
			if (lim.pos <= front || lim.pos > front + 4000) continue;
			const vl = (lim.speed / 3.6) * k;
			target = Math.min(target, Math.sqrt(vl * vl + 2 * b * Math.max(0, lim.pos - front - 40)));
		}
		let stopAt = null;
		const st = route.stations[sim.next];
		if (st && st.stop && sim.ss[sim.next].state === 'pending') stopAt = st.pos;
		const sig = sim.nextSignal();
		if (sig && sig.aspect === 'red') stopAt = stopAt === null ? sig.pos - 20 : Math.min(stopAt, sig.pos - 20);
		let hold = false;
		if (stopAt !== null) {
			const d = stopAt - front;
			let va = Math.sqrt(2 * b * Math.max(0, d - 0.5));
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
			const dEff = Math.max(0.3, stopAt - front - v * 0.6);
			const need = (v * v) / (2 * dEff);
			if (need > b * 0.85) lever = Math.min(lever, -Math.min(4, Math.ceil((need / sim.train.serviceDecel) * 4 + 0.3)));
		}
		sim.setLever(lever);
		sim.ackCzuwak();
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
		return tt;
	}

	return { Sim, autopilot, buildTimetable, fmtClock, fmtDelay, OVERRUN_TOL };
});
