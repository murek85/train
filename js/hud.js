/* Pulpit maszynisty (DOM) i prędkościomierz. */
(function () {
	'use strict';
	const P = window.TrainPhysics;
	const R = window.TrainRoutes;
	const { fmtClock, fmtDelay, SIGNALS, signalText } = window.TrainSim;

	const $ = (id) => document.getElementById(id);

	// kategorie komunikatów (pasek u góry): wg klucza komunikatu o stanie, inaczej wg wagi
	const TOAST_CAT = { valve: 'HAMULEC', sand: 'PIASECZNICA', order: 'ROZKAZ', detail: 'OTOCZENIE', ca: 'CZUWAK', shp: 'SHP', speed: 'PRĘDKOŚĆ', doors: 'DRZWI',
		panto: 'PANTOGRAF', ice: 'SIEĆ TRAKCYJNA', outage: 'ZASILANIE', leaves: 'SZYNY', slip: 'POŚLIZG', flat: 'KOŁA', airblock: 'HAMULEC', drive: 'NAPĘD',
		info: 'KOMUNIKAT', warn: 'UWAGA', bad: 'ZDARZENIE', good: 'W PORZĄDKU', announce: 'ZAPOWIEDŹ' };

	function fmtDist(d) {
		if (d < 1000) return `${Math.max(0, Math.round(d / 10) * 10)} m`;
		return `${(d / 1000).toFixed(1)} km`;
	}

	class Hud {
		constructor() {
			this.root = $('hud');
			this.speedo = $('speedo');
			this.sctx = this.speedo.getContext('2d');
			this.toasts = $('toasts');
			this.prompt = $('prompt');
			// komunikaty pod okienkiem radiotelefonu: wysokość okienka (zmienna CSS --radio-h) – odstęp nie zależy od liczby linii
			const radio = $('radio');
			if (radio && window.ResizeObserver) {
				new ResizeObserver(() => {
					if (radio.offsetHeight) document.documentElement.style.setProperty('--radio-h', radio.offsetHeight + 'px');
				}).observe(radio);
			}
			// panel z rozkładem (lewa góra) tej samej szerokości co panel z nastawnikiem (lewy dół) – zmienna CSS --drive-w
			const drive = this.root.querySelector('.hud-drive');
			if (drive && window.ResizeObserver) {
				new ResizeObserver(() => {
					if (drive.offsetWidth) document.documentElement.style.setProperty('--drive-w', drive.offsetWidth + 'px');
				}).observe(drive);
			}
			this.leverEls = [];
			const lever = $('lever');
			for (let n = P.LEVER_MAX; n >= P.LEVER_MIN; n--) {
				const d = document.createElement('div');
				d.textContent = P.leverLabel(n);
				d.className = n > 0 ? 'p' : n === P.LEVER_MIN ? 'b e' : n < 0 ? 'b' : '';
				lever.appendChild(d);
				this.leverEls.push({ n, el: d });
			}
			this.cache = {};
			// zawór maszynisty (hamulec zespolony): pozycje od napełniania do nagłego
			this.valveEls = [];
			for (const [v, t] of [['fill', 'Napełn.'], ['run', 'Jazda'], ['lap', 'Odcięcie'], ['brake', 'Hamow.'], ['emerg', 'Nagłe']]) {
				const d = document.createElement('div');
				d.textContent = t;
				d.dataset.v = v;
				if (v === 'emerg') d.className = 'e';
				$('valve-pos').appendChild(d);
				this.valveEls.push(d);
			}
		}

		setup(sim) {
			this.vmaxDial = Math.ceil(Math.round(sim.train.vmax * 3.6) / 20) * 20 + 20;
			this.cache = {};
			this.toasts.innerHTML = '';
			// hamulec zespolony: nastawnik tylko jazda, obok zawór maszynisty
			$('lever').classList.toggle('air', !!sim.air);
			$('lever').classList.toggle('series', !!sim.drive);
			$('drive').classList.toggle('hidden', !sim.drive);
			$('valve').classList.toggle('hidden', !sim.air);
			document.querySelectorAll('.controls .air-only').forEach((b) => b.classList.toggle('hidden', !sim.air));
			$('btn-down').textContent = sim.air ? '▼ Jazda' : '▼ Hamuj';
			$('l-shp').classList.toggle('hidden', !sim.opts.shp);
			this.radioHide();
			this.orderHide();
			this.orderChip(sim.orders ? sim.orders.length : 0);
			this.task(null);
			this.buildTimeline(sim);
		}

		// rozkład jako pionowa oś czasu: godzina z rozkładu, kropka stacji (pełna – postój, pusta – przelot), nazwa i stan
		buildTimeline(sim) {
			const box = $('timeline');
			box.innerHTML = '';
			const rail = document.createElement('div');
			rail.className = 'tl-rail';
			const fill = document.createElement('div');
			fill.className = 'tl-fill';
			const train = document.createElement('div');
			train.className = 'tl-train';
			box.append(rail, fill, train);
			const rows = sim.route.stations.map((s) => {
				const row = document.createElement('div');
				row.className = 'tl-row' + (s.stop ? '' : ' through');
				row.innerHTML = '<div class="tl-time"></div><div class="tl-dot"></div><div class="tl-name"><b></b><span></span></div>';
				row.querySelector('b').textContent = s.name;
				box.appendChild(row);
				return { row, time: row.querySelector('.tl-time'), sub: row.querySelector('span'), cls: '', t: '', st: '', sc: '' };
			});
			this.tl = { box, rail, fill, train, rows, centers: null, scrolled: -1 };
		}

		updateTimeline(sim, current) {
			const tl = this.tl;
			if (!tl) return;
			const route = sim.route, st = route.stations;
			const hm = (sec) => fmtClock(route.startClock + sec).slice(0, 5);
			const recs = {};
			for (const r of sim.records) recs[r.index] = r;
			st.forEach((s, i) => {
				const R0 = tl.rows[i], ss = sim.ss[i], rec = recs[i];
				const passed = i < sim.next && sim.service !== i;
				let cls = 'tl-row' + (s.stop ? '' : ' through') + (passed ? ' past' : '') + (ss.state === 'missed' ? ' missed' : '') + (i === current ? ' cur' : '');
				const arr = sim.plannedArr(i), dep = sim.plannedDep(i);
				const time = i === 0 ? (dep != null ? hm(dep) : '') : arr != null ? hm(arr) : '';
				let sub = '', sc = '';
				if (rec && rec.missed) { sub = 'pominięta – bez postoju'; sc = 'late'; }
				else if (rec) {
					const late = rec.delay > 30;
					sub = `${rec.through ? 'przelot' : 'przyj.'} ${hm(rec.actual)} · ${late ? fmtDelay(rec.delay) : 'o czasie'}`;
					sc = late ? 'late' : 'ok';
				} else if (i === 0) sub = sim.service === 0 || sim.next === 0 ? `odjazd ${time}` : 'stacja początkowa';
				else if (s.terminus) sub = 'stacja końcowa';
				else if (!s.stop) sub = 'przelot bez zatrzymania';
				else if (dep != null && arr != null) sub = `postój ${Math.round(dep - arr)} s · odj. ${hm(dep)}`;
				else sub = 'postój';
				if (sim.service === i && i > 0) { sub = `postój · odjazd ${dep != null ? hm(dep) : 'po wymianie'}`; sc = ''; }
				if (R0.cls !== cls) { R0.row.className = cls; R0.cls = cls; }
				if (R0.t !== time) { R0.time.textContent = time; R0.t = time; }
				if (R0.st !== sub) { R0.sub.textContent = sub; R0.st = sub; }
				if (R0.sc !== sc) { R0.sub.className = sc; R0.sc = sc; }
			});
			// środki wierszy (po pierwszym ułożeniu panelu)
			if (!tl.centers || !tl.centers[0]) {
				tl.centers = tl.rows.map((r) => r.row.offsetTop + r.row.offsetHeight / 2);
				if (!tl.centers[0]) return;
				const c = tl.centers;
				tl.rail.style.top = c[0] + 'px';
				tl.rail.style.height = c[c.length - 1] - c[0] + 'px';
				tl.fill.style.top = c[0] + 'px';
			}
			// pozycja czoła pociągu między stacjami (liniowo względem kilometrażu)
			const c = tl.centers, front = sim.st.pos;
			let y = c[0];
			if (front >= st[st.length - 1].pos) y = c[c.length - 1];
			else for (let i = 0; i < st.length - 1; i++) {
				if (front < st[i + 1].pos) {
					const f = Math.max(0, Math.min(1, (front - st[i].pos) / (st[i + 1].pos - st[i].pos)));
					y = c[i] + (c[i + 1] - c[i]) * f;
					break;
				}
			}
			const yy = Math.round(y);
			if (this.cache.tlY !== yy) {
				this.cache.tlY = yy;
				tl.train.style.top = yy + 'px';
				tl.fill.style.height = Math.max(0, yy - c[0]) + 'px';
				// przewijanie osi czasu, gdy stacji jest więcej niż mieści się w panelu
				const box = tl.box;
				if (box.scrollHeight > box.clientHeight + 4) box.scrollTop = Math.max(0, yy - box.clientHeight / 2);
			}
		}

		// wysokość dolnych okienek (podpowiedź wyświetlana nad nimi)
		height() {
			if (this.root.classList.contains('hidden')) return 0;
			const d = this.root.querySelector('.hud-drive'), c = this.root.querySelector('.hud-controls');
			return Math.max(d ? d.offsetHeight : 0, c && getComputedStyle(c).bottom !== 'auto' ? c.offsetHeight : 0) + 16;
		}

		set(id, value, prop = 'textContent') {
			if (this.cache[id + prop] === value) return;
			this.cache[id + prop] = value;
			$(id)[prop] = value;
		}

		setStyle(id, prop, value) {
			const k = id + '|' + prop;
			if (this.cache[k] === value) return;
			this.cache[k] = value;
			$(id).style[prop] = value;
		}

		/* Komunikat: czas zależy od wagi (informacja 4 s, ostrzeżenie 6 s, błąd 7 s); key – komunikat o stanie
		   (czuwak, prędkość, drzwi): nie dubluje się (odświeża istniejący) i znika od razu po dismiss(key).
		   Kliknięcie zamyka komunikat. Ten sam tekst bez klucza też się nie powtarza. */
		toast(text, kind, key) {
			kind = kind || 'info';
			let el = [...this.toasts.children].find((x) => (key && x.dataset.key === key) || (!key && !x.dataset.key && x.dataset.text === text && !x.classList.contains('fade')));
			if (!el) {
				el = document.createElement('div');
				el.innerHTML = '<i class="lamp"></i><em></em><span></span>';
				el.addEventListener('click', () => this.hideToast(el, true));
				this.toasts.appendChild(el);
			}
			// pasek jak komunikat dyżurnego: lampa w kolorze wagi, kategoria (wg klucza albo wagi) i treść
			el.className = 'toast ' + kind;
			el.dataset.text = text;
			el.children[1].textContent = TOAST_CAT[key] || TOAST_CAT[kind] || 'KOMUNIKAT';
			el.children[2].textContent = text;
			if (key) el.dataset.key = key;
			clearTimeout(el._t1);
			clearTimeout(el._t2);
			const ms = kind === 'bad' ? 7000 : kind === 'warn' ? 6000 : kind === 'announce' ? 9000 : 4000;
			el._t1 = setTimeout(() => this.hideToast(el), ms);
			while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
		}

		hideToast(el, quick) {
			if (!el || !el.parentNode) return;
			clearTimeout(el._t1);
			el.classList.add('fade');
			if (quick) el.classList.add('quick');
			el._t2 = setTimeout(() => el.remove(), quick ? 220 : 600);
		}

		/* Radiotelefon: komunikat dyżurnego ruchu (from – nadawca); ack – czeka na potwierdzenie (Enter albo kliknięcie),
		   bez potwierdzenia znika po 14 s, po potwierdzeniu – po 3 s */
		radio(from, text, ack) {
			$('radio-from').textContent = from;
			$('radio-text').textContent = text;
			$('radio').className = 'radio' + (ack ? ' ack' : '');
			document.body.classList.add('radio-on');
			clearTimeout(this.radioT);
			if (!ack) this.radioT = setTimeout(() => this.radioHide(), 14000);
		}
		radioAck() {
			$('radio').classList.remove('ack');
			clearTimeout(this.radioT);
			this.radioT = setTimeout(() => this.radioHide(), 3000);
		}
		radioHide() {
			clearTimeout(this.radioT);
			$('radio').classList.add('hidden');
			document.body.classList.remove('radio-on');
		}
		/* rozkaz pisemny: karta z treścią (show – pokaż), po potwierdzeniu – zielone „potwierdzono”, karta znika po 5 s,
		   zostaje przycisk z liczbą rozkazów (O – pokaż ostatni) */
		order(o, clock) {
			const names = { O: 'ROZKAZ PISEMNY „O”', S: 'ROZKAZ PISEMNY „S”' };
			$('order-title').textContent = names[o.type] || 'ROZKAZ PISEMNY';
			$('order-no').textContent = 'nr ' + o.no;
			$('order-meta').textContent = `dla pociągu: ${o.train || ''}\nstacja: ${o.station || ''} · dnia ${new Date().toLocaleDateString('pl-PL')} · godz. ${clock}${o.via === 'radio' ? ' · przekazany przez radiotelefon' : ''}`;
			$('order-text').textContent = o.text;
			$('order-from').textContent = 'Dyżurny ruchu: ' + (o.station || '');
			$('order-ack').textContent = o.acked ? 'potwierdzono odbiór' : 'Enter – potwierdzam odbiór';
			$('order').className = 'order' + (o.acked ? ' done' : '');
			// pieczątka stacji (po potwierdzeniu odbioru)
			$('order').dataset.stamp = (o.station || 'PKP').toUpperCase();
			clearTimeout(this.orderT);
			if (o.acked) this.orderT = setTimeout(() => $('order').classList.add('hidden'), 5000);
		}
		orderChip(n) {
			$('order-chip').textContent = `Rozkazy: ${n}`;
			$('order-chip').classList.toggle('hidden', !n);
		}
		orderHide() {
			clearTimeout(this.orderT);
			$('order').classList.add('hidden');
		}

		// zadanie samouczka (null – koniec samouczka)
		task(t) {
			if (!t || !t.text) { $('task').classList.add('hidden'); return; }
			$('task-n').textContent = t.of ? `krok ${t.n} z ${t.of}` : '';
			$('task-text').textContent = t.text;
			$('task').classList.remove('hidden');
		}

		// chowa komunikat o stanie, który przestał obowiązywać (np. czuwak potwierdzony spacją)
		dismiss(key) {
			for (const el of [...this.toasts.children]) if (el.dataset.key === key) this.hideToast(el, true);
		}

		update(sim, timeScale) {
			const route = sim.route, st = sim.st, front = st.pos;
			const kmh = st.v * 3.6;
			this.drawSpeedo(kmh, sim.limit);

			for (const { n, el } of this.leverEls) el.classList.toggle('active', n === sim.lever);
			// napęd wg serii: pozycja, prąd silników, oporniki (oporowy) / obroty (spalinowy)
			if (sim.drive) {
				const d = sim.drive;
				this.set('d-pos', sim.leverName());
				this.set('d-pos', P.driveEcon(d, sim.lever) && sim.lever > 0 ? 'econ' : '', 'className');
				this.setStyle('d-cur', 'width', Math.round(Math.min(1, d.I / 1.5) * 100) + '%');
				this.set('d-cur', d.I > 1.15 ? 'over' : '', 'className');
				this.setStyle('d-heat', 'width', Math.round(Math.min(1, d.kind === 'resistor' ? d.heat : d.kind === 'diesel' ? d.rpm : 0) * 100) + '%');
				this.set('d-info', d.kind === 'resistor' ? (P.driveEcon(d, sim.lever) ? 'pozycja ekonomiczna' : 'na oporach') : d.kind === 'diesel' ? 'obroty silnika' : 'falownik');
			}
			// hamulec zespolony: pozycja zaworu maszynisty, ciśnienie w przewodzie głównym i w cylindrze
			if (sim.air) {
				const a = sim.air;
				for (const el of this.valveEls) el.classList.toggle('active', el.dataset.v === a.valve);
				this.set('v-pg', a.pg.toFixed(1));
				this.set('v-cyl', Math.max(a.cyl[0], a.loco || 0).toFixed(1));
				this.set('v-pg', 'num' + (a.pg < 4.0 ? ' low' : ''), 'className');
			}
			$('eff-trac').style.width = Math.round(st.traction * 100) + '%';
			$('eff-brake').style.width = Math.round(st.brake * 100) + '%';

			// zegar i opóźnienie
			this.set('i-clock', fmtClock(sim.clock()));
			let delay = null;
			const atStation = sim.service !== null && !sim.ss[sim.service].cleared;
			let ni = atStation ? sim.service : sim.next;
			if (!atStation) while (ni < route.stations.length - 1 && ['served', 'departed', 'missed'].includes(sim.ss[ni].state)) ni++;
			const s = route.stations[ni];
			if (s) {
				const planned = atStation ? sim.plannedDep(ni) : sim.plannedArr(ni);
				if (planned != null && sim.time > planned) delay = sim.time - planned;
			}
			this.set('i-delay', delay ? `opóźnienie ${fmtDelay(delay)}` : 'zgodnie z rozkładem');
			this.set('i-delay', delay ? 'bad' : 'good', 'className');

			// stacja
			if (s) {
				if (atStation) {
					const dep = sim.plannedDep(ni);
					this.set('i-station-label', s.terminus ? 'Stacja końcowa' : 'Postój');
					this.set('i-station', s.name);
					this.set('i-station-sub', s.terminus ? (sim.pax.cap ? `${sim.ss[ni].alight} podróżnych wysiada` : 'koniec jazdy') : dep != null ? `odjazd ${fmtClock(route.startClock + dep)}` : 'odjazd po wymianie pasażerów');
				} else {
					const arr = sim.plannedArr(ni);
					const dist = s.pos - front;
					this.set('i-station-label', s.stop ? 'Następna stacja' : 'Przelot przez stację');
					this.set('i-station', s.name);
					const when = arr != null ? `${s.stop ? 'przyj.' : 'przelot'} ${fmtClock(route.startClock + arr)} · ` : '';
					this.set('i-station-sub', when + (dist > 0 ? fmtDist(dist) : s.stop ? `${Math.abs(dist).toFixed(1)} m za W4` : 'na stacji'));
				}
			}

			// pasażerowie: w pociągu / pojemność, na postoju – wymiana
			const px = sim.pax;
			if (px.cap) {
				const q = sim.ss[ni], here = atStation && q && !s.terminus;
				this.set('i-pax', here ? `wsiada ${q.board} · wysiada ${q.alight} · jedzie ${px.load}` : `w pociągu ${px.load} / ${px.cap} (${Math.round((px.load / px.cap) * 100)} %)`);
			} else this.set('i-pax', '');

			this.updateTimeline(sim, ni);

			// ograniczenie: bieżące, następna zmiana (tarcza z odległością), przekroczenie, chwila na hamowanie
			const decel = sim.train.serviceDecel;
			const over = kmh > sim.limit + 3;
			this.set('i-limit', String(sim.limit));
			this.set('i-limit-disc', 'limit-disc' + (over ? ' over' : ''), 'className');
			const nl = sim.nextLimitChange(front); // z ograniczeniami doraźnymi (scenariusz)
			let limSub = '', limCls = '';
			if (nl && nl.pos - front < 4000) {
				const d = nl.pos - front, down = nl.speed < sim.limit;
				this.set('i-limit-next', String(nl.speed));
				this.set('i-limit-next-dist', fmtDist(d));
				this.set('i-limit-next-box', 'lim-next' + (down ? ' down' : ''), 'className');
				// czy trzeba już hamować do niższej prędkości (droga hamowania + zapas)
				const vt = nl.speed / 3.6;
				if (down && st.v > vt && (st.v * st.v - vt * vt) / (2 * decel) * 1.15 + st.v * 3 > d) { limSub = `zwolnij do ${nl.speed}`; limCls = 'warn'; }
			} else {
				this.set('i-limit-next', '—');
				this.set('i-limit-next-dist', 'bez zmian');
				this.set('i-limit-next-box', 'lim-next none', 'className');
			}
			if (over) { limSub = `za szybko o ${Math.round(kmh - sim.limit)} km/h`; limCls = 'bad'; }
			this.set('i-limit-sub', limSub);
			this.set('i-limit-sub', 'hint-line ' + limCls, 'className');

			// semafor: wskazanie, odległość, pasek zbliżania (ostatnie 1,5 km), objaśnienie, alarm przy czerwonym
			const sig = sim.nextSignal();
			if (sig) {
				const d = sig.pos - front;
				const brake = P.brakingEstimate(st.v, decel, sim.brakeLag());
				const alarm = sig.aspect === 'red' && st.v > 0.5 && brake * 1.1 + 25 > d;
				this.set('sig-box', `sig-box ${sig.aspect}${window.TrainSim.SIGNALS[sig.code].own ? ' lim' : ''}${alarm ? ' alarm' : ''}`, 'className');
				// głowica jak semafor (Ie-1): górne światło, miganie, dolne pomarańczowe, pas; napis – prędkość przy semaforze
				const S = SIGNALS[sig.code], tx = signalText(sig.code);
				this.set('i-signal-lamp', `sig-head ${{ red: 'r', yellow: 'y', green: 'g' }[S.top]}${S.flash ? ' f' : ''}${S.low ? ' y2' : ''}${S.pas ? ' p' + S.pas[0] : ''}${S.white ? ' w' : ''}`, 'className');
				this.set('i-signal', tx.title);
				this.set('i-signal-dist', fmtDist(d));
				this.set('i-signal-sub', sig.type === 'starter' ? `odjazdowy ${sig.label || 'O' + (sig.station + 1)}` : `${{ entry: 'wjazdowy', intermediate: 'drogowskazowy' }[sig.kind] || 'odstępowy'} ${sig.label || ''}`.trim());
				this.setStyle('i-signal-bar', 'width', Math.round(Math.max(0, Math.min(1, 1 - d / 1500)) * 100) + '%');
				this.set('i-signal-hint', alarm ? 'HAMUJ!' : sig.permit === 'S' ? 'rozkaz „S” – jazda ostrożna do 20 km/h' : sig.fault && !sig.permit ? 'S1 · uszkodzony? – zatrzymaj się, czekaj na dyżurnego' : `${sig.code} · ${tx.next}`);
			} else {
				this.set('sig-box', 'sig-box', 'className');
				this.set('i-signal-lamp', 'sig-head', 'className');
				this.set('i-signal', '—');
				this.set('i-signal-dist', '');
				this.set('i-signal-sub', 'koniec szlaku');
				this.setStyle('i-signal-bar', 'width', '0%');
				this.set('i-signal-hint', 'kozioł oporowy');
			}

			// profil
			const g = R.gradeAt(route, front - sim.L / 2);
			this.set('i-grade', g === 0 ? 'poziomo' : `${g > 0 ? '+' : ''}${g} ‰`);
			this.setStyle('i-grade-ico', 'transform', `rotate(${-Math.max(-30, Math.min(30, g * 2.5))}deg)`);
			this.set('i-accel', `a = ${st.a >= 0 ? '+' : ''}${st.a.toFixed(2)} m/s²`);
			// kilometraż: położenie czoła pociągu od początku trasy (jak w swobodnej kamerze), długość i reszta do końca
			const km = (m) => (m / 1000).toFixed(1).replace('.', ',');
			const last = route.stations[route.stations.length - 1].pos;
			this.set('i-km', 'km ' + km(Math.max(0, front)));
			this.set('i-km-sub', `zostało ${km(Math.max(0, last - front))} z ${km(last)} km`);

			this.set('i-score', String(sim.score()));
			this.set('i-score-sub', `maks. ${sim.maxScore()}`);

			// lampki
			const ca = $('l-ca');
			ca.className = 'ind' + (sim.ca.alarm ? ' on-red blink' : sim.opts.czuwak && st.v > 0.5 && sim.ca.t > 50 ? ' on' : '');
			$('l-doors').className = 'ind' + (sim.doorsOpen ? ' on' : '');
			$('l-slip').className = 'ind' + (sim.slip || sim.lock.t > 0 ? ' on-red blink' : '');
			$('l-sand').className = 'ind' + (sim.sand.t > 0 ? ' on' : '');
			$('l-shp').className = 'ind' + (sim.shp.alarm ? ' on-red blink' : '') + (sim.opts.shp ? '' : ' hidden');
			$('l-brake').className = 'ind' + (st.emergency && st.brake > 0.05 ? ' on-red' : st.brake > 0.05 ? ' on' : '');
			this.set('l-time', '×' + timeScale);

			// podpowiedź
			if (sim.prompt && sim.status === 'running') {
				this.set('prompt', sim.prompt);
				this.prompt.classList.remove('hidden');
				this.prompt.style.bottom = this.height() + 12 + 'px';
			} else this.prompt.classList.add('hidden');
			// zadanie samouczka nad podpowiedzią
			$('task').style.bottom = this.height() + 60 + 'px';
		}

		/* prędkościomierz jak w kabinie: tarcza z pierścieniem, strefa dozwolona (zielona) i ponad ograniczeniem
		   (czerwona), bursztynowy znacznik ograniczenia na obwodzie, odczyt cyfrowy w okienku */
		drawSpeedo(kmh, limit) {
			const c = this.speedo, ctx = this.sctx;
			const size = c.clientWidth || 168;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			if (c.width !== Math.round(size * dpr)) {
				c.width = c.height = Math.round(size * dpr);
			}
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			const cx = size / 2, cy = size / 2, r = size / 2 - 4;
			const max = this.vmaxDial;
			const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
			const ang = (v) => a0 + ((a1 - a0) * Math.max(0, Math.min(v, max))) / max;
			const mono = 'ui-monospace, Consolas, monospace';
			const over = kmh > limit + 3;
			ctx.clearRect(0, 0, size, size);
			// tarcza i pierścień
			const g = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
			g.addColorStop(0, '#141b25');
			g.addColorStop(1, '#06090d');
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = 'rgba(170,195,220,0.28)';
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.strokeStyle = 'rgba(170,195,220,0.08)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
			ctx.stroke();
			// strefy: dozwolona i ponad ograniczeniem
			const rz = r - 7;
			ctx.lineWidth = 4;
			ctx.strokeStyle = 'rgba(79,224,140,0.55)';
			ctx.beginPath();
			ctx.arc(cx, cy, rz, a0, ang(limit));
			ctx.stroke();
			ctx.strokeStyle = 'rgba(255,106,85,0.8)';
			ctx.beginPath();
			ctx.arc(cx, cy, rz, ang(limit), a1);
			ctx.stroke();
			// przebyta część skali – jasny łuk do wskazówki
			ctx.strokeStyle = over ? 'rgba(255,106,85,0.95)' : 'rgba(255,210,122,0.9)';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(cx, cy, rz - 4, a0, ang(kmh));
			ctx.stroke();
			// podziałka
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.font = `600 ${Math.round(size * 0.062)}px ${mono}`;
			const step = max > 180 ? 20 : 10, lab = max > 180 ? 40 : 20;
			for (let v = 0; v <= max; v += step) {
				const a = ang(v), big = v % lab === 0;
				ctx.strokeStyle = big ? '#c9d4df' : '#5d6b7a';
				ctx.lineWidth = big ? 2 : 1;
				ctx.beginPath();
				ctx.moveTo(cx + Math.cos(a) * (r - 13), cy + Math.sin(a) * (r - 13));
				ctx.lineTo(cx + Math.cos(a) * (r - (big ? 21 : 17)), cy + Math.sin(a) * (r - (big ? 21 : 17)));
				ctx.stroke();
				if (big) {
					ctx.fillStyle = v > limit ? '#c98a80' : '#b9c4cf';
					ctx.fillText(String(v), cx + Math.cos(a) * (r - 32), cy + Math.sin(a) * (r - 32));
				}
			}
			// znacznik ograniczenia (trójkąt na obwodzie)
			{
				const a = ang(limit), ro = r - 2, ri = r - 12, w = 0.07;
				ctx.fillStyle = '#ffb020';
				ctx.shadowColor = '#ffb020';
				ctx.shadowBlur = 6;
				ctx.beginPath();
				ctx.moveTo(cx + Math.cos(a - w) * ro, cy + Math.sin(a - w) * ro);
				ctx.lineTo(cx + Math.cos(a + w) * ro, cy + Math.sin(a + w) * ro);
				ctx.lineTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
				ctx.closePath();
				ctx.fill();
				ctx.shadowBlur = 0;
			}
			// wskazówka
			const a = ang(kmh);
			ctx.strokeStyle = over ? '#ff6a55' : '#ffb020';
			ctx.shadowColor = ctx.strokeStyle;
			ctx.shadowBlur = 8;
			ctx.lineWidth = 3;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10);
			ctx.lineTo(cx + Math.cos(a) * (r - 15), cy + Math.sin(a) * (r - 15));
			ctx.stroke();
			ctx.shadowBlur = 0;
			ctx.lineCap = 'butt';
			ctx.fillStyle = '#0b0f15';
			ctx.strokeStyle = over ? '#ff6a55' : '#ffb020';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(cx, cy, 5, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			// odczyt cyfrowy w okienku
			const bw = size * 0.36, bh = size * 0.16, by = cy + size * 0.15;
			ctx.fillStyle = 'rgba(3,6,9,0.9)';
			ctx.strokeStyle = over ? 'rgba(255,106,85,0.7)' : 'rgba(170,195,220,0.22)';
			ctx.lineWidth = 1;
			ctx.fillRect(cx - bw / 2, by, bw, bh);
			ctx.strokeRect(cx - bw / 2 + 0.5, by + 0.5, bw - 1, bh - 1);
			ctx.fillStyle = over ? '#ff6a55' : '#e8eef2';
			ctx.font = `700 ${Math.round(size * 0.12)}px ${mono}`;
			ctx.fillText(String(Math.round(kmh)).padStart(3, ' '), cx, by + bh / 2 + 1);
			ctx.fillStyle = '#8798a6';
			ctx.font = `600 ${Math.round(size * 0.052)}px ${mono}`;
			ctx.fillText('KM/H', cx, by + bh + size * 0.07);
		}
	}

	window.TrainHud = Hud;
})();
