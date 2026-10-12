/* Dźwięki generowane w WebAudio – bez plików.
   Pociąg (głos wg serii – VOICE): silniki trakcyjne prądu stałego z przekładnią, wentylatory, styczniki
   i przetwornica (EU07, EP09, ET22, EN57, EN71, ED72) albo silnik spalinowy z pulsami zapłonu (SM42, SU46,
   dwusuwowy ST44), luzy zderzaków przy ruszaniu i hamowaniu, toczenie kół (szum zależny od prędkości), stukot na złączach szyn (po dwa uderzenia
   na wózek), pisk obręczy na ciasnych łukach, tarcie i pisk hamulców, syk luzowania, sprężarka na postoju,
   dwutonowa syrena z formantami tuby. Otoczenie: wiatr z porywami i szelest liści, deszcz z kroplami
   (w kabinie – o dach i szybę), kilka gatunków ptaków w stereo, świerszcze wieczorem, szum miasta przy
   stacjach z przejeżdżającymi autami, dzwon alarmowy przejazdów, pogłos w tunelu. */
(function () {
	'use strict';

	const JOINT = 25; // długość szyny – stukot na złączach

	/* Głos pojazdu trakcyjnego (wg serii z katalogu):
	   dc – lokomotywa/EZT prądu stałego z rozruchem oporowym: wycie silników trakcyjnych i przekładni rosnące
	        z prędkością, wentylatory przy mocy, styczniki przy zmianie pozycji nastawnika, przetwornica;
	   diesel – silnik spalinowy: pulsy zapłonu (cyl – cylindry, two – dwusuw), obroty od biegu jałowego;
	   horn – tony syreny [Hz], gear – wysokość wycia przekładni na m/s, heavy – masa dźwięku. */
	const VOICE = {
		EU07: { kind: 'dc', horn: [370, 466], gear: 34, blow: 1, conv: 0.5, heavy: 1 },
		EP09: { kind: 'dc', horn: [392, 494], gear: 31, blow: 1.1, conv: 0.5, heavy: 1 },
		ET22: { kind: 'dc', horn: [311, 392], gear: 38, blow: 1.25, conv: 0.5, heavy: 1.25 },
		SM42: { kind: 'diesel', horn: [415, 523], cyl: 6, two: false, idle: 0.42, heavy: 1 },
		SU46: { kind: 'diesel', horn: [349, 440], cyl: 6, two: false, idle: 0.4, heavy: 1.1 },
		ST44: { kind: 'diesel', horn: [294, 370], cyl: 12, two: true, idle: 0.5, heavy: 1.45 },
		EN57: { kind: 'dc', horn: [440, 554], gear: 44, blow: 0.45, conv: 1, heavy: 0.8, emu: true },
		EN71: { kind: 'dc', horn: [440, 554], gear: 44, blow: 0.5, conv: 1, heavy: 0.9, emu: true },
		ED72: { kind: 'dc', horn: [415, 523], gear: 41, blow: 0.5, conv: 1, heavy: 0.9, emu: true },
	};

	class TrainAudio {
		constructor() {
			this.ctx = null;
			this.muted = false;
			this.volume = 0.8;
			this.bogies = [];
			this.lastJoint = [];
			this.prevBrake = 0;
			this.env = { wind: 0.4, rain: 0, snow: 0, dark: 0, cab: false };
			this.birdT = 2;
			this.dropT = 0;
			this.compT = 0;
			this.compOn = 0;
			this.bellT = 0;
			this.passing = null;
			this.passId = null;
		}

		ensure() {
			if (!this.ctx) {
				const AC = window.AudioContext || window.webkitAudioContext;
				if (!AC) return;
				this.ctx = new AC();
				this.build();
			}
			if (this.ctx.state === 'suspended') this.ctx.resume();
		}

		build() {
			const c = this.ctx;
			// wyjście: kompresor (bez przesterowań), pogłos (tunel) równolegle
			this.out = c.createDynamicsCompressor();
			this.out.threshold.value = -14;
			this.out.ratio.value = 4;
			this.out.connect(c.destination);
			this.master = c.createGain();
			this.master.gain.value = this.muted ? 0 : 0.75 * this.volume;
			this.master.connect(this.out);
			this.verb = c.createConvolver();
			this.verb.buffer = this.impulse(2.2, 2.5);
			this.verbG = c.createGain();
			this.verbG.gain.value = 0;
			this.verb.connect(this.verbG).connect(this.master);
			// szyna pociągu (z wysyłką na pogłos) i szyna otoczenia (tłumiona w kabinie)
			this.trainBus = c.createGain();
			this.trainBus.connect(this.master);
			this.trainBus.connect(this.verb);
			this.ambF = c.createBiquadFilter();
			this.ambF.type = 'lowpass';
			this.ambF.frequency.value = 18000;
			this.ambBus = c.createGain();
			this.ambBus.connect(this.ambF).connect(this.master);

			const len = c.sampleRate * 3;
			const buf = c.createBuffer(1, len, c.sampleRate);
			const d = buf.getChannelData(0);
			for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
			this.noiseBuf = buf;
			// szum różowy (cieplejszy – toczenie, wiatr)
			const pinkBuf = c.createBuffer(1, len, c.sampleRate);
			const pd = pinkBuf.getChannelData(0);
			let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
			for (let i = 0; i < len; i++) {
				const w = Math.random() * 2 - 1;
				b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
				b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
				pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
			}
			const src = (b) => {
				const s = c.createBufferSource();
				s.buffer = b;
				s.loop = true;
				s.start(0, Math.random() * 2);
				return s;
			};
			const gain = (dest) => {
				const g = c.createGain();
				g.gain.value = 0;
				g.connect(dest);
				return g;
			};
			const filter = (type, f, q, dest) => {
				const b = c.createBiquadFilter();
				b.type = type;
				b.frequency.value = f;
				if (q) b.Q.value = q;
				b.connect(dest);
				return b;
			};
			const osc = (type, f, dest) => {
				const o = c.createOscillator();
				o.type = type;
				o.frequency.value = f;
				o.connect(dest);
				o.start();
				return o;
			};
			const T = this.trainBus, A = this.ambBus;

			// napęd: trzy harmoniczne falownika (+ lekka modulacja) i przekładnia
			this.motorG = gain(T);
			const mf = filter('lowpass', 2600, 0.8, this.motorG);
			this.motor = [osc('sawtooth', 100, mf), osc('triangle', 200, mf), osc('sine', 300, mf)];
			this.motorMix = this.motor.map((o) => {
				const g = c.createGain();
				o.disconnect();
				o.connect(g).connect(mf);
				return g;
			});
			this.gearG = gain(T);
			this.gear = osc('sine', 400, this.gearG);
			// buczenie transformatora / silnika, wentylatory (szum pasmowy)
			this.humG = gain(T);
			this.hum = osc('sawtooth', 50, filter('lowpass', 180, 0.9, this.humG));
			this.fanG = gain(T);
			src(this.noiseBuf).connect(filter('bandpass', 700, 0.8, this.fanG));
			// toczenie kół: niski grzmot + szum wyższy przy prędkości
			this.rollG = gain(T);
			this.rollF = filter('lowpass', 300, 0.7, this.rollG);
			src(pinkBuf).connect(this.rollF);
			this.rollHiG = gain(T);
			this.rollHiF = filter('bandpass', 1200, 0.6, this.rollHiG);
			src(this.noiseBuf).connect(this.rollHiF);
			// pisk obręczy na łukach
			this.flangeG = gain(T);
			this.flange = osc('sine', 3400, this.flangeG);
			this.flange2 = osc('sine', 4100, this.flangeG);
			// hamulce: tarcie, syk powietrza, pisk przy dohamowaniu
			this.fricG = gain(T);
			src(this.noiseBuf).connect(filter('bandpass', 1800, 1.2, this.fricG));
			this.hissG = gain(T);
			src(this.noiseBuf).connect(filter('highpass', 3000, 0.7, this.hissG));
			this.squealG = gain(T);
			this.squeal = osc('sine', 2600, this.squealG);
			/* sprężarka tłokowa: rytmiczne „tuk-tuk” (ok. 7 suwów/s) – szum niski i dudnienie modulowane piłą
			   (ostry początek suwu, wolne opadanie) */
			this.compG = gain(T);
			const compAM = c.createGain();
			compAM.gain.value = 0.35;
			compAM.connect(this.compG);
			src(pinkBuf).connect(filter('lowpass', 320, 1.1, compAM));
			osc('sine', 52, compAM);
			this.compLfo = c.createOscillator();
			this.compLfo.type = 'sawtooth';
			this.compLfo.frequency.value = 7;
			const compDepth = c.createGain();
			compDepth.gain.value = -0.35;
			this.compLfo.connect(compDepth).connect(compAM.gain);
			this.compLfo.start();
			/* silnik spalinowy: pulsy zapłonu – szum wydechu (pasmo 90–600 Hz) modulowany sinusem o częstotliwości
			   zapłonów; tony silnika dają oscylatory napędu (motor) */
			this.chugG = gain(T);
			this.chugAM = c.createGain();
			this.chugAM.gain.value = 0.5;
			this.chugAM.connect(this.chugG);
			src(pinkBuf).connect(filter('bandpass', 220, 0.7, this.chugAM));
			this.chugLfo = c.createOscillator();
			this.chugLfo.frequency.value = 37;
			this.chugDepth = c.createGain();
			this.chugDepth.gain.value = 0.48;
			this.chugLfo.connect(this.chugDepth).connect(this.chugAM.gain);
			this.chugLfo.start();
			// przetwornica (maszyna wirująca zasilająca obwody pomocnicze): stałe buczenie i cichy gwizd
			this.convG = gain(T);
			const cvf = filter('lowpass', 1400, 0.7, this.convG);
			this.conv = [osc('sine', 100, cvf), osc('triangle', 600, cvf)];
			this.conv[1].disconnect();
			const cvw = c.createGain();
			cvw.gain.value = 0.25;
			this.conv[1].connect(cvw).connect(cvf);
			// wentylatory: obok szumu ton łopatek
			this.bladeG = gain(T);
			this.blade = osc('triangle', 140, filter('lowpass', 700, 1, this.bladeG));
			/* syrena: dwa tony (piła + prostokąt, lekko rozstrojone) przez łagodne przesterowanie i formanty tuby
			   (rezonanse ok. 900 i 1900 Hz), do tego „chuchnięcie” powietrza przy otwarciu zaworu */
			this.hornG = gain(T);
			const hLp = filter('lowpass', 4200, 0.6, this.hornG);
			const hPk2 = c.createBiquadFilter();
			hPk2.type = 'peaking'; hPk2.frequency.value = 1900; hPk2.Q.value = 1.4; hPk2.gain.value = 5;
			hPk2.connect(hLp);
			const hPk1 = c.createBiquadFilter();
			hPk1.type = 'peaking'; hPk1.frequency.value = 900; hPk1.Q.value = 1.1; hPk1.gain.value = 8;
			hPk1.connect(hPk2);
			const hHp = filter('highpass', 180, 0.7, hPk1);
			const shaper = c.createWaveShaper();
			const curve = new Float32Array(1024);
			for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(2.4 * x) / Math.tanh(2.4); }
			shaper.curve = curve;
			shaper.connect(hHp);
			const hIn = c.createGain();
			hIn.gain.value = 0.55;
			hIn.connect(shaper);
			this.horn = [];
			for (const f of [370, 466]) {
				const a = c.createOscillator(), b = c.createOscillator(), ga = c.createGain(), gb = c.createGain();
				a.type = 'sawtooth'; b.type = 'square';
				a.frequency.value = f; b.frequency.value = f; b.detune.value = 4;
				ga.gain.value = 0.6; gb.gain.value = 0.3;
				a.connect(ga).connect(hIn); b.connect(gb).connect(hIn);
				a.start(); b.start();
				this.horn.push(a, b);
			}
			this.hornAirG = gain(T);
			src(this.noiseBuf).connect(filter('bandpass', 1300, 0.8, this.hornAirG));
			// wycieraczki: silniczek, szuranie pióra po szybie, pisk gumy na suchej szybie
			this.wipMotG = gain(T);
			osc('sawtooth', 82, filter('lowpass', 320, 0.9, this.wipMotG));
			this.wipSwG = gain(T);
			src(this.noiseBuf).connect(filter('bandpass', 1500, 0.9, this.wipSwG));
			this.wipSqG = gain(T);
			this.wipSq = osc('sine', 950, this.wipSqG);
			// brzęczyk czuwaka
			this.caG = gain(this.master);
			osc('square', 880, filter('lowpass', 2500, 0.7, this.caG));

			// otoczenie: wiatr (szum różowy z porywami), deszcz (szum + krople), świerszcze, dzwonki przejazdu
			this.windG = gain(A);
			this.windF = filter('bandpass', 500, 0.6, this.windG);
			src(pinkBuf).connect(this.windF);
			this.rainG = gain(A);
			const rl = filter('lowpass', 5200, 0.5, this.rainG);
			src(this.noiseBuf).connect(filter('highpass', 900, 0.5, rl));
			this.rainLowG = gain(A);
			src(pinkBuf).connect(filter('lowpass', 500, 0.7, this.rainLowG));
			this.cricketG = gain(A);
			osc('sine', 4400, this.cricketG);
			this.bellG = gain(A);
			// szelest liści na wietrze (poza kabiną) i szum miasta przy stacjach
			this.leafG = gain(A);
			this.leafF = filter('highpass', 2600, 0.5, this.leafG);
			src(this.noiseBuf).connect(this.leafF);
			this.cityG = gain(A);
			src(pinkBuf).connect(filter('lowpass', 260, 0.6, this.cityG));
			// mijany pociąg: łoskot toczenia, napęd (z efektem Dopplera), podmuch powietrza
			this.passG = gain(A);
			this.passF = filter('lowpass', 600, 0.7, this.passG);
			src(pinkBuf).connect(this.passF);
			this.passHiG = gain(A);
			src(this.noiseBuf).connect(filter('bandpass', 1400, 0.7, this.passHiG));
			this.passMotorG = gain(A);
			this.passMotor = osc('sawtooth', 120, filter('lowpass', 1500, 0.8, this.passMotorG));
		}

		// pociąg z przeciwka (life.other) albo null
		setPassing(o) {
			this.passing = o;
		}

		// dźwięk mijanego pociągu: głośność zależna od odległości do najbliższego wagonu, stukot jego wózków,
		// sygnał syreną przed mijanką, wyższy ton napędu przy zbliżaniu i niższy przy oddalaniu (Doppler)
		updatePassing(sim, dt, now) {
			const o = this.passing;
			if (!o) {
				if (this.passId !== null) {
					for (const g of [this.passG, this.passHiG, this.passMotorG]) this.set(g.gain, 0, 0.3);
					this.passId = null;
				}
				return;
			}
			const t = o.train;
			if (this.passId !== o.id) {
				this.passId = o.id;
				this.passHorn = false;
				let off = 0;
				this.passBogies = [];
				t.cars.forEach((len) => {
					this.passBogies.push(off + len * 0.15, off + len * 0.85);
					off += len + t.gap;
				});
				this.passLast = this.passBogies.map((b) => Math.floor((o.s + b) / JOINT));
			}
			const Ls = sim.st.pos - (this.env.cab ? 3 : sim.L * 0.3);
			const along = Math.max(0, o.s - Ls, Ls - (o.s + o.len));
			const dist = Math.hypot(along, 4.6);
			const near = 1 / (1 + (dist / 28) * (dist / 28));
			const heavy = t.style === 'freight' ? 1.35 : 1;
			const vk = Math.min(1, o.v / 25);
			this.set(this.passG.gain, 0.42 * near * vk * heavy, 0.1);
			this.set(this.passF.frequency, 250 + 2200 * near, 0.1);
			this.set(this.passHiG.gain, 0.09 * near * near * vk, 0.1);
			// Doppler: zbliża się, gdy czoło jest przed słuchaczem
			const vrel = o.v + sim.st.v;
			const approach = o.s > Ls ? 1 : along > 0 ? -1 : 0;
			const dop = 343 / (343 - approach * Math.min(80, vrel));
			const base = (t.style === 'ezt' ? 140 + o.v * 24 : 70 + o.v * 12) * dop;
			this.set(this.passMotor.frequency, base, 0.15);
			this.set(this.passMotorG.gain, 0.03 * near * heavy, 0.1);
			// stukot wózków mijanego pociągu na złączach
			this.passBogies.forEach((b, j) => {
				const sb = o.s + b;
				const idx = Math.floor(sb / JOINT);
				if (idx !== this.passLast[j]) {
					this.passLast[j] = idx;
					const dd = Math.hypot(sb - Ls, 4.6);
					const v = 0.45 * heavy / (1 + (dd / 18) * (dd / 18));
					if (v > 0.01) this.clack(now + dd / 343, v, this.ambBus, 1, dd, o.v);
				}
			});
			// syrena przed mijanką (krótki sygnał „baczność”)
			if (!this.passHorn && o.s - Ls < 420 && o.s - Ls > 60) {
				this.passHorn = true;
				const hv = 0.05 * heavy;
				const f1 = t.style === 'freight' ? 311 : 392, f2 = t.style === 'freight' ? 392 : 494;
				this.tone(f1 * dop, now, 1.1, 'sawtooth', hv, this.ambBus);
				this.tone(f2 * dop, now, 1.1, 'sawtooth', hv * 0.8, this.ambBus);
			}
		}

		// odpowiedź impulsowa pogłosu (zanikający szum)
		impulse(sec, decay) {
			const c = this.ctx;
			const n = Math.floor(c.sampleRate * sec);
			const b = c.createBuffer(2, n, c.sampleRate);
			for (let ch = 0; ch < 2; ch++) {
				const d = b.getChannelData(ch);
				for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
			}
			return b;
		}

		set(param, value, tc = 0.08) {
			param.setTargetAtTime(value, this.ctx.currentTime, tc);
		}

		reset(sim) {
			const t = sim.train;
			let off = 0;
			this.bogies = [];
			t.cars.forEach((len) => {
				this.bogies.push(off + len * 0.13, off + len * 0.87);
				off += len + t.gap;
			});
			this.lastJoint = this.bogies.map((o) => Math.floor((sim.st.pos - o) / JOINT));
			// sprzęgi i zderzaki między pojazdami (odległość od czoła)
			this.couplers = [];
			off = 0;
			t.cars.forEach((len, k) => { off += len; if (k < t.cars.length - 1) this.couplers.push(off + t.gap / 2); off += t.gap; });
			const id = (t.specs && t.specs[0] && t.specs[0].id) || '';
			this.voice = VOICE[id] || (t.diesel ? VOICE.SM42 : t.style === 'ezt' ? VOICE.EN57 : VOICE.EU07);
			this.horn.forEach((o, k) => { o.frequency.value = this.voice.horn[k >> 1]; });
			this.prevLever = sim.lever;
			this.prevV = sim.st.v;
			this.hornWas = false;
			this.lastPos = sim.st.pos;
			this.prevBrake = sim.st.brake;
			// krzyżownice rozjazdów na stacjach z dwoma torami (jak w world.js: zjazdy przed i za peronem, wjazd na bocznicę)
			this.frogs = [];
			if (sim.route.double) {
				for (const st of sim.route.stations) {
					if (st.type === 'halt') continue;
					this.frogs.push(st.platformStart - 200, st.platformStart - 105);
					if (!st.terminus) this.frogs.push(st.platformEnd + 130);
				}
			}
			this.frogs.sort((a, b) => a - b);
			/* rozjazdy z mapy na torze pociągu (wiersze env.sw: s, d, kąt, strona, promień, typ, kąt skrzyżowania):
			   zwykły – ostrza iglic (lekki stuk), koniec iglic (złącze), krzyżownica (szyny skrzydłowe i dziób –
			   mocne podwójne uderzenie z brzękiem), koniec krzyżownicy; skrzyżowanie torów i rozjazd krzyżowy –
			   krzyżownice ostre po obu stronach i rozwarte w środku (+ iglice przy krzyżowym). div – zjazd na tor
			   zwrotny (łuk w miejscu krzyżownicy): pisk obręczy i kołysanie */
			this.swEv = [];
			const R = window.TrainRoutes;
			const ev = (x, k, frog) => this.swEv.push({ s: x, k, frog: !!frog });
			for (const row of (sim.route.env && sim.route.env.sw) || []) {
				const [s0, d0, a, , R0, type] = row;
				if (Math.abs(d0) > 1.6) continue;
				if (type >= 2) {
					const th = Math.max(0.06, Math.abs(row[6] || 0.11)), h = Math.min(14, 0.75 / Math.tan(th));
					ev(s0 - h, 1.2, true); ev(s0 - 0.4, 0.8); ev(s0 + 0.4, 0.8); ev(s0 + h, 1.2, true);
					if (type >= 3) { ev(s0 - h - 5, 0.45); ev(s0 + h + 5, 0.45); }
				} else {
					const Rs = R0 || 190, dir = Math.cos(a) >= 0 ? 1 : -1;
					const bl = Math.max(7, Math.min(32, 0.82 * Math.sqrt(Rs))), u = Math.sqrt((type === 1 ? 6 : 3) * Rs);
					ev(s0, 0.45); ev(s0 + dir * bl, 0.9); ev(s0 + dir * u, 1.35, true); ev(s0 + dir * (u + 5), 0.9);
				}
			}
			for (const e of this.swEv) e.div = e.frog && Math.abs(R.curvatureAt(sim.route, e.s)) > 1 / 800; // oś trasy jest wygładzona – zjazd ma promień ok. 500–800 m
			this.swEv.sort((a, b) => a.s - b.s);
			this.swSqueal = 0;
		}

		/* Próbki uderzenia koła o złącze (liczone raz). Koło wpada w szczelinę złącza i uderza w czoło
		   następnej szyny: dwa krótkie impulsy szumu (drugi słabszy, kilka ms później), przepuszczone przez
		   filtry pasmowe odpowiadające rezonansom wózka i nadwozia (ok. 120, 280, 650 Hz) i odrobinę trzasku
		   stali (1,8 kHz). Bez czystych tonów – brzmi jak głuche „tuk”, nie jak dzwonek czy bęben. */
		clackBuffers() {
			if (this.clackBufs) return this.clackBufs;
			const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * 0.3);
			// filtr pasmowy (RBJ) przeliczany offline
			const bandpass = (x, f, q) => {
				const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * q), cs = Math.cos(w);
				const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
				const y = new Float32Array(x.length);
				let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
				for (let i = 0; i < x.length; i++) {
					const v = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
					x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
					y[i] = v;
				}
				return y;
			};
			this.clackBufs = [0, 1, 2, 3, 4, 5].map((v) => {
				const e = new Float32Array(n);
				const rnd = (k) => { const x = Math.sin((v + 1) * 91.7 + k * 13.3) * 43758.5453; return x - Math.floor(x); };
				// pobudzenie: gładkie pchnięcie (pół sinusa ~3 ms) z odrobiną szumu – koło wpada w szczelinę
				// i uderza w czoło szyny; drugie koło (druga szyna) kilka ms później; potem słaby odskok
				const hits = [[0, 1], [0.0015 + rnd(1) * 0.003, 0.6 + rnd(2) * 0.3], [0.007 + rnd(3) * 0.004, 0.3]];
				for (const [t0, amp] of hits) {
					const i0 = Math.floor(t0 * sr), T = Math.floor(0.003 * sr);
					for (let i = 0; i < T * 3 && i0 + i < n; i++) {
						const t = i / sr;
						const push = i < T ? Math.sin((Math.PI * i) / T) : 0;
						e[i0 + i] += amp * (push * 0.5 + (Math.random() * 2 - 1) * 1.0 * Math.exp(-t / 0.002));
					}
				}
				// grzechotanie sprzęgów i nadwozia po uderzeniu
				const rattle = new Float32Array(n);
				for (let i = Math.floor(0.008 * sr); i < n; i++) {
					const t = i / sr - 0.008;
					rattle[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.055) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 23));
				}
				const j = 1 + (v - 2.5) * 0.035;
				const body = bandpass(e, 92 * j, 10), bogie = bandpass(e, 205 * j, 6), frame = bandpass(e, 420 * j, 4), steel = bandpass(e, 1150 * j, 3);
				const rat = bandpass(rattle, 520 * j, 1.4);
				const b = c.createBuffer(1, n, sr);
				const d = b.getChannelData(0);
				let peak = 0;
				for (let i = 0; i < n; i++) {
					d[i] = body[i] * 1.1 + bogie[i] * 1.3 + frame[i] * 2.6 + steel[i] * 1.15 + rat[i] * 0.5;
					peak = Math.max(peak, Math.abs(d[i]));
				}
				for (let i = 0; i < n; i++) d[i] /= peak || 1;
				return b;
			});
			return this.clackBufs;
		}

		// otoczenie: { wind 0…1.5, rain 0…1, snow 0…1, dark 0…1, cab – widok z kabiny }
		setEnv(e) {
			Object.assign(this.env, e);
		}

		silence() {
			if (!this.ctx) return;
			for (const g of [this.motorG, this.gearG, this.humG, this.fanG, this.rollG, this.rollHiG, this.flangeG, this.fricG, this.hissG, this.squealG, this.compG, this.hornG, this.caG, this.windG, this.rainG, this.rainLowG, this.cricketG, this.bellG, this.passG, this.passHiG, this.passMotorG, this.chugG, this.convG, this.bladeG, this.hornAirG, this.leafG, this.cityG, this.wipMotG, this.wipSwG, this.wipSqG]) this.set(g.gain, 0, 0.05);
			this.hornWas = false;
		}

		update(sim, dt) {
			if (!this.ctx || dt <= 0) return;
			const c = this.ctx, now = c.currentTime;
			const st = sim.st, v = st.v, tr = st.traction, br = st.brake;
			const live = sim.power !== false; // bez napięcia (pantograf opuszczony) – cichną obwody elektryczne
			const tun = sim.inTunnel ? 1.6 : 1;
			const ezt = sim.train.style === 'ezt';
			const E = this.env;
			const cab = E.cab;
			const moving = v > 0.05 || tr > 0.05;

			// pogłos w tunelu, tłumienie otoczenia w kabinie
			this.set(this.verbG.gain, sim.inTunnel ? 0.55 : 0.04, 0.3);
			this.set(this.ambF.frequency, cab ? 1800 : 18000, 0.3);
			this.set(this.trainBus.gain, cab ? 0.75 : 1, 0.3);

			// napęd wg głosu pojazdu
			const V = this.voice || VOICE.EU07;
			if (V.kind === 'diesel') {
				/* silnik spalinowy: obroty od biegu jałowego do pełnych z nastawnikiem (bezwładnie), zapłony
				   cyl/2 na obrót w czterosuwie, cyl na obrót w dwusuwie; tony silnika na harmonicznych obrotów */
				this.dieselRpm = (this.dieselRpm || V.idle) + ((V.idle + tr * (1 - V.idle)) - (this.dieselRpm || V.idle)) * Math.min(1, dt * 0.7);
				const rps = this.dieselRpm * (V.two ? 12.5 : 25); // 750 / 1500 obr./min przy pełnych
				const fire = rps * (V.two ? V.cyl : V.cyl / 2);
				this.set(this.chugLfo.frequency, fire, 0.05);
				this.set(this.chugG.gain, (0.05 + this.dieselRpm * 0.11) * V.heavy * tun);
				this.set(this.motor[0].frequency, fire / (V.two ? 4 : 2));
				this.set(this.motor[1].frequency, fire);
				this.set(this.motor[2].frequency, fire * 2.02);
				this.motorMix[0].gain.value = 0.7;
				this.motorMix[1].gain.value = 0.4;
				this.motorMix[2].gain.value = V.two ? 0.35 : 0.15;
				this.set(this.motorG.gain, (0.012 + this.dieselRpm * 0.035) * V.heavy * tun);
				this.set(this.fanG.gain, 0.005 + this.dieselRpm * this.dieselRpm * 0.03);
				this.set(this.blade.frequency, 60 + this.dieselRpm * 120);
				this.set(this.bladeG.gain, this.dieselRpm * 0.008);
				this.set(this.convG.gain, 0);
				this.set(this.gear.frequency, 160 + v * 30);
				this.set(this.gearG.gain, moving ? Math.min(0.008, (v / 40) * 0.008) * (0.4 + tr) : 0);
			} else {
				/* prąd stały, rozruch oporowy: silniki trakcyjne „wyją” razem z przekładnią (ton ∝ prędkości,
				   głośniej pod prądem), lekki buczący komutator; wentylatory silników przy mocy; przetwornica stale */
				this.set(this.chugG.gain, 0);
				const base = 40 + v * V.gear * 0.5;
				this.set(this.motor[0].frequency, base);
				this.set(this.motor[1].frequency, base * 2);
				this.set(this.motor[2].frequency, base * 3.01);
				this.motorMix[0].gain.value = 0.35;
				this.motorMix[1].gain.value = 0.45;
				this.motorMix[2].gain.value = 0.25;
				this.set(this.motorG.gain, moving ? (0.003 + tr * 0.028 * Math.min(1, 0.3 + v / 15)) * V.heavy * tun : 0);
				this.set(this.gear.frequency, 120 + v * V.gear);
				this.set(this.gearG.gain, moving ? Math.min(0.016, (v / 30) * 0.016) * (0.35 + tr) * V.heavy : 0);
				this.set(this.fanG.gain, live ? (0.006 + tr * 0.03) * V.blow : 0, live ? 0.08 : 1.5);
				this.set(this.blade.frequency, 110 + tr * 60);
				this.set(this.bladeG.gain, live ? (0.002 + tr * 0.012) * V.blow : 0, live ? 0.08 : 1.5);
				this.set(this.convG.gain, live ? 0.008 * V.conv * (cab ? 1.2 : 0.8) : 0, live ? 0.6 : 1.2);
				this.set(this.conv[0].frequency, 100 + Math.sin(now * 0.7) * 0.6);
				// styczniki: przy każdej zmianie pozycji nastawnika kilka kliknięć (rozruch oporowy)
				if (sim.lever !== this.prevLever) {
					const n = Math.min(4, Math.abs(sim.lever - this.prevLever) + (sim.lever > 0 ? 1 : 0));
					for (let q = 0; q < n; q++) this.contactor(now + 0.04 + q * (0.05 + Math.random() * 0.07), (cab ? 0.09 : 0.04) * (0.7 + Math.random() * 0.3));
				}
			}
			this.prevLever = sim.lever;
			this.set(this.hum.frequency, V.kind === 'diesel' ? 50 : 100);
			this.set(this.humG.gain, V.kind === 'diesel' ? 0.004 : 0.006 + tr * 0.01);
			// szarpnięcia zderzaków i sprzęgów: przy ruszaniu (naciąg od czoła) i mocnym hamowaniu (najazd od końca)
			if (!V.emu && this.couplers && this.couplers.length) {
				if (this.prevV < 0.05 && v >= 0.05 && tr > 0.05) this.slack(now, false, sim);
				else if (v > 2 && br - (this.slackBrake || 0) > 0.35) this.slack(now, true, sim);
			}
			if (br < 0.1 || v < 1) this.slackBrake = br;
			else this.slackBrake = Math.max(this.slackBrake || 0, br);
			this.prevV = v;

			// toczenie
			const vk = Math.min(1, v / 40);
			this.set(this.rollG.gain, (0.02 + vk * 0.32) * tun * (v > 0.1 ? 1 : 0));
			this.set(this.rollF.frequency, 160 + v * 9);
			this.set(this.rollHiG.gain, vk * vk * 0.05 * tun);
			this.set(this.rollHiF.frequency, 900 + v * 30);

			// pisk obręczy na ciasnych łukach (promień < ok. 900 m)
			const R = window.TrainRoutes;
			const k = Math.abs(R.curvatureAt(sim.route, st.pos - sim.L / 2));
			const fl = k > 1 / 900 && v > 3 ? Math.min(1, (k - 1 / 900) * 900) * Math.min(1, v / 12) : 0;
			const trem = 0.6 + 0.4 * Math.sin(now * 23) * Math.sin(now * 3.1);
			// zjazd na tor zwrotny rozjazdu: krótki pisk obręczy i kołysanie (dudnienie) przez czas przejazdu składu
			const sw = this.swSqueal > now && v > 1 ? Math.min(1, v / 8) : 0;
			this.set(this.flangeG.gain, Math.max(fl, sw * 0.8) * 0.022 * trem, 0.05);
			this.set(this.flange.frequency, 3300 + Math.sin(now * 2.3) * 140);

			// hamulce
			const dBrake = (br - this.prevBrake) / dt;
			this.prevBrake = br;
			this.set(this.fricG.gain, br > 0.05 && v > 0.3 ? br * Math.min(1, v / 15) * 0.05 : 0);
			const hiss = dBrake > 0 ? Math.min(0.1, dBrake * 0.22) : Math.min(0.09, -dBrake * 0.16);
			this.set(this.hissG.gain, hiss, 0.05);
			this.set(this.squealG.gain, v > 0.05 && v < 4 && br > 0.3 ? 0.022 * (1 - v / 4) : 0);
			this.set(this.squeal.frequency, 2400 + (1 - v / 4) * 600);

			// sprężarka: na postoju co jakiś czas pracuje kilkanaście sekund
			this.compT -= dt;
			if (this.compT <= 0) {
				this.compOn = v < 0.1 && Math.random() < 0.5 ? 1 : 0;
				this.compT = this.compOn ? 10 + Math.random() * 8 : 20 + Math.random() * 25;
			}
			this.set(this.compG.gain, this.compOn && v < 0.5 && live ? 0.05 : 0, 0.4);
			this.set(this.compLfo.frequency, 6.5 + Math.sin(now * 0.2) * 0.4, 0.5);

			/* syrena: przy otwarciu zaworu ton podciąga się z ok. 90 % do pełnej wysokości (narastające ciśnienie)
			   z dmuchnięciem powietrza, przy zamknięciu lekko opada i gaśnie */
			const hornOn = sim.horn && sim.status === 'running';
			if (hornOn !== this.hornWas) {
				this.hornWas = hornOn;
				this.horn.forEach((o, k) => {
					const f = V.horn[k >> 1];
					o.frequency.cancelScheduledValues(now);
					o.frequency.setValueAtTime(o.frequency.value, now);
					if (hornOn) { o.frequency.setValueAtTime(f * 0.9, now); o.frequency.linearRampToValueAtTime(f, now + 0.09); }
					else o.frequency.linearRampToValueAtTime(f * 0.96, now + 0.22);
				});
				this.hornG.gain.cancelScheduledValues(now);
				this.hornG.gain.setTargetAtTime(hornOn ? 0.13 * V.heavy : 0, now, hornOn ? 0.035 : 0.07);
				if (hornOn) {
					this.hornAirG.gain.cancelScheduledValues(now);
					this.hornAirG.gain.setValueAtTime(0.06, now);
					this.hornAirG.gain.setTargetAtTime(0.008, now + 0.05, 0.08);
				} else this.set(this.hornAirG.gain, 0, 0.05);
			}

			// wycieraczki (stan z modelu: wipeOn – pracują, wipe – prędkość pióra, 0…ok. 1,6)
			const wOn = !!E.wipeOn, wv = Math.min(1.6, E.wipe || 0), dry = E.rain < 0.08 && E.snow < 0.08;
			this.set(this.wipMotG.gain, wOn ? (cab ? 0.012 : 0.003) : 0, 0.05);
			this.set(this.wipSwG.gain, wOn ? wv * (dry ? 0.008 : 0.018) * (cab ? 1 : 0.35) : 0, 0.03);
			this.set(this.wipSqG.gain, wOn && dry ? wv * 0.0035 * (cab ? 1 : 0.3) : 0, 0.03);
			this.set(this.wipSq.frequency, 880 + Math.sin(now * 37) * 90, 0.02);
			const caOn = sim.ca.alarm && Math.floor(now * 4) % 2 === 0;
			this.set(this.caG.gain, caOn ? 0.05 : 0, 0.01);

			// Stukot: każdy wózek uderza na złączu dwiema osiami (rozstaw 2,5 m) – charakterystyczne „ta-tam”;
			// sąsiednie wózki dwóch wagonów dają podwójne „ta-tam ta-tam”. Głośność zależy od odległości wózka od
			// słuchacza (w kabinie – czoło), barwa i siła od prędkości; złącza różnią się siłą uderzenia.
			if (v > 0.3) {
				// Ten sam model co pociąg z przeciwka: jedno uderzenie na wózek (sąsiednie wózki dwóch wagonów
				// dają „ta-tam”), słuchacz kilka metrów w bok od wózka – w kabinie tuż nad pierwszym wózkiem,
				// z zewnątrz obok składu; głośność maleje z odległością, dalsze uderzenia są głuchsze i spóźnione.
				const ear = cab ? 4 : sim.L * 0.3;
				const side = cab ? 2.2 : 4.6;
				const base = Math.min(0.5, 0.18 + v / 70) * tun * (cab ? 0.85 : 1);
				const hit = (o, idx, at, k) => {
					const dd = Math.hypot(o - ear, side);
					const joint = 0.85 + 0.3 * ((Math.sin(idx * 12.9898) * 43758.5453) % 1 + 1) % 1;
					const vol = (base * joint * k) / (1 + (dd / 18) * (dd / 18));
					if (vol < 0.004) return;
					this.clack(at + dd / 343, vol, null, 1, dd, v);
				};
				this.bogies.forEach((o, j) => {
					const idx = Math.floor((st.pos - o) / JOINT);
					if (idx !== this.lastJoint[j]) {
						this.lastJoint[j] = idx;
						hit(o, idx, now, 1);
					}
				});
				const p0 = this.lastPos, p1 = st.pos;
				// rozjazdy z mapy: każde miejsce pod każdym wózkiem; na krzyżownicy obie osie wózka (rozstaw 2,5 m) i brzęk
				for (const e of this.swEv || []) {
					if (e.s < p0 - sim.L - 5 || e.s > p1 + 1) continue;
					this.bogies.forEach((o, j) => {
						const a = p0 - o, b = p1 - o;
						if (a < e.s && b >= e.s) {
							hit(o, e.s, now, e.k);
							if (e.frog) {
								hit(o, e.s + 0.37, now + 2.5 / v, e.k * 0.85);
								const dd = Math.hypot(o - ear, side);
								this.tone(1050 + Math.random() * 450, now + dd / 343, 0.14, 'triangle', (base * e.k * 0.07) / (1 + (dd / 18) * (dd / 18)), this.trainBus);
								if (e.div && j === 0) this.swSqueal = now + Math.min(4, 2 + sim.L / Math.max(3, v));
							}
						}
					});
				}
				// krzyżownice rozjazdów: kilka szybkich uderzeń pod każdym wózkiem
				for (const f of this.frogs) {
					for (const o of this.bogies) {
						const a = p0 - o, b = p1 - o;
						if (a < f && b >= f) {
							hit(o, f, now, 1.25);
							hit(o, f + 7, now + 1.2 / v, 0.8);
							hit(o, f + 13, now + 3.4 / v, 0.9);
						}
					}
				}
			}
			this.lastPos = st.pos;

			this.updatePassing(sim, dt, now);

			// ---- otoczenie ----
			const gust = 0.65 + 0.35 * Math.sin(now * 0.37) * Math.sin(now * 0.13 + 1.3);
			const wind = E.wind;
			this.set(this.windG.gain, (0.01 + wind * 0.05) * gust * (1 + vk * 0.5), 0.3);
			this.set(this.windF.frequency, 300 + wind * 500 * gust + v * 10, 0.3);
			// deszcz: szum + krople (w kabinie mocniej o dach i szybę)
			this.set(this.rainG.gain, E.rain * (cab ? 0.09 : 0.06), 0.5);
			this.set(this.rainLowG.gain, E.rain * 0.04, 0.5);
			if (E.rain > 0.05) {
				this.dropT -= dt;
				while (this.dropT <= 0) {
					this.dropT += 0.02 + Math.random() * 0.08 / E.rain;
					this.drop(now + Math.random() * 0.05, (cab ? 0.05 : 0.025) * (0.4 + Math.random() * 0.6));
				}
			}
			// ptaki w dzień (bez deszczu i śniegu), świerszcze o zmierzchu latem
			const day = 1 - E.dark;
			const urban = E.urban || 0;
			if (day > 0.5 && E.rain < 0.2 && E.snow < 0.2) {
				this.birdT -= dt;
				if (this.birdT <= 0) {
					this.birdT = 1.2 + Math.random() * 5 + urban * 3;
					this.bird(now, (cab ? 0.012 : 0.03) * (0.5 + Math.random() * 0.6));
				}
			}
			// szelest liści przy wietrze (poza miastem i poza kabiną), szum miasta i przejeżdżające auta przy stacjach
			this.set(this.leafG.gain, cab ? 0 : wind * 0.012 * gust * gust * (1 - urban * 0.6), 0.3);
			this.set(this.cityG.gain, urban * (0.03 - E.dark * 0.015) * (cab ? 0.4 : 1), 1);
			if (urban > 0.2 && !cab) {
				this.carT = (this.carT ?? 3) - dt;
				if (this.carT <= 0) {
					this.carT = (4 + Math.random() * 10) / urban * (1 + E.dark);
					this.carPass(now, 0.03 * urban);
				}
			}
			const crick = E.dark > 0.3 && E.dark < 0.9 && E.rain < 0.1 && E.snow < 0.1 ? (Math.sin(now * 28) > 0.2 ? 1 : 0) * (Math.sin(now * 1.7) > -0.3 ? 1 : 0) : 0;
			this.set(this.cricketG.gain, crick * 0.004 * (cab ? 0.3 : 1), 0.01);

			/* sygnalizator przejazdu: dzwon alarmowy (szybkie uderzenia młoteczka, ok. 7 na s) – dzwoni od zbliżenia
			   się pociągu na ok. 900 m do zjechania z przejazdu; głośność wg odległości słuchacza od przejazdu */
			const ear = st.pos - (cab ? 3 : sim.L * 0.3);
			let bell = 0, bellPan = 0;
			for (const cr of sim.route.crossings) {
				const ahead = cr.pos - st.pos;
				if (ahead > 900 || ahead < -sim.L - 15) continue;
				const dd = Math.hypot(cr.pos - ear, 7);
				const k2 = 1 / (1 + (dd / 45) * (dd / 45));
				if (k2 > bell) { bell = k2; bellPan = Math.max(-0.7, Math.min(0.7, (cr.pos - ear) / 60)) * 0; }
			}
			if (bell > 0.01) {
				this.bellT -= dt;
				while (this.bellT <= 0) {
					this.bellT += 0.14 + Math.random() * 0.012;
					this.ding(now + Math.max(0, this.bellT), bell * (cab ? 0.035 : 0.08), bellPan);
				}
			} else this.bellT = 0;
		}

		// uderzenie koła: próbka z clackBuffers(); rate – wysokość (prędkość), dist – odległość (dalej głuchsze)
		clack(when, vol, dest, rate, dist, speed) {
			if (rate !== undefined) {
				const c = this.ctx;
				const bufs = this.clackBuffers();
				const s = c.createBufferSource();
				s.buffer = bufs[Math.floor(Math.random() * bufs.length)];
				s.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
				// jasność: szybciej – ostrzejsze uderzenie; w kabinie i z daleka – głuchsze
				const f = c.createBiquadFilter();
				f.type = 'lowpass';
				f.frequency.value = (700 + Math.min(40, speed || 20) * 55) * (this.env.cab ? 0.5 : 1) / (1 + (dist || 0) / 60);
				const g = c.createGain();
				g.gain.value = vol;
				s.connect(f).connect(g).connect(dest || this.trainBus);
				s.start(Math.max(when, c.currentTime));
				return;
			}
			const c = this.ctx;
			const s = c.createBufferSource();
			s.buffer = this.noiseBuf;
			const f = c.createBiquadFilter();
			f.type = 'bandpass';
			f.frequency.value = 600 + Math.random() * 500;
			f.Q.value = 1.1;
			const g = c.createGain();
			g.gain.setValueAtTime(vol, when);
			g.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
			s.connect(f).connect(g).connect(dest || this.trainBus);
			s.start(when, Math.random() * 2, 0.1);
			// niskie łupnięcie
			const o = c.createOscillator();
			o.type = 'sine';
			o.frequency.setValueAtTime(110, when);
			o.frequency.exponentialRampToValueAtTime(45, when + 0.09);
			const og = c.createGain();
			og.gain.setValueAtTime(vol * 0.9, when);
			og.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
			o.connect(og).connect(dest || this.trainBus);
			o.start(when);
			o.stop(when + 0.15);
		}

		// stycznik: suchy trzask zestyku i głuche łupnięcie zwory
		contactor(when, vol) {
			const c = this.ctx;
			const s2 = c.createBufferSource();
			s2.buffer = this.noiseBuf;
			const f = c.createBiquadFilter();
			f.type = 'highpass';
			f.frequency.value = 1800;
			const g = c.createGain();
			g.gain.setValueAtTime(vol, when);
			g.gain.exponentialRampToValueAtTime(0.0005, when + 0.018);
			s2.connect(f).connect(g).connect(this.trainBus);
			s2.start(when, Math.random() * 2, 0.03);
			const o = c.createOscillator();
			o.frequency.setValueAtTime(160, when);
			o.frequency.exponentialRampToValueAtTime(70, when + 0.05);
			const og = c.createGain();
			og.gain.setValueAtTime(vol * 0.8, when);
			og.gain.exponentialRampToValueAtTime(0.0005, when + 0.06);
			o.connect(og).connect(this.trainBus);
			o.start(when);
			o.stop(when + 0.08);
		}

		/* luzy sprzęgów: kolejne zderzaki uderzają jeden po drugim – przy ruszaniu od czoła (naciąg), przy
		   hamowaniu od końca (najazd); metaliczny łomot z dzwonieniem, ciszej z dala od słuchacza */
		slack(now, push, sim) {
			const ear = this.env.cab ? 3 : sim.L * 0.3, side = this.env.cab ? 2 : 5;
			const heavy = sim.train.freight ? 1.4 : 1;
			const list = push ? this.couplers.slice().reverse() : this.couplers;
			list.forEach((x, k) => {
				const at = now + 0.05 + k * (push ? 0.07 : 0.11) * (0.8 + Math.random() * 0.4);
				const dd = Math.hypot(x - ear, side);
				const vol = (0.22 * heavy) / (1 + (dd / 20) * (dd / 20));
				if (vol < 0.004) return;
				this.clack(at + dd / 343, vol, null, 0.75, dd, 10);
				this.tone(620 + Math.random() * 260, at + dd / 343, 0.18, 'triangle', vol * 0.08, this.trainBus);
			});
		}

		// przejeżdżający samochód w oddali: szum opon i silnika narastający i gasnący, przesuwający się w stereo
		carPass(when, vol) {
			const c = this.ctx, dur = 2.5 + Math.random() * 2;
			const s2 = c.createBufferSource();
			s2.buffer = this.noiseBuf;
			s2.loop = true;
			const f = c.createBiquadFilter();
			f.type = 'bandpass';
			f.Q.value = 0.6;
			f.frequency.setValueAtTime(500, when);
			f.frequency.linearRampToValueAtTime(900, when + dur / 2);
			f.frequency.linearRampToValueAtTime(420, when + dur);
			const g = c.createGain();
			g.gain.setValueAtTime(0.0001, when);
			g.gain.exponentialRampToValueAtTime(vol, when + dur / 2);
			g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
			const pan = c.createStereoPanner ? c.createStereoPanner() : null;
			const dir = Math.random() < 0.5 ? -1 : 1;
			if (pan) {
				pan.pan.setValueAtTime(-0.8 * dir, when);
				pan.pan.linearRampToValueAtTime(0.8 * dir, when + dur);
				s2.connect(f).connect(g).connect(pan).connect(this.ambBus);
			} else s2.connect(f).connect(g).connect(this.ambBus);
			s2.start(when, Math.random() * 2);
			s2.stop(when + dur + 0.1);
		}

		drop(when, vol) {
			const c = this.ctx;
			const s = c.createBufferSource();
			s.buffer = this.noiseBuf;
			const f = c.createBiquadFilter();
			f.type = 'bandpass';
			f.frequency.value = 2500 + Math.random() * 3500;
			f.Q.value = 3;
			const g = c.createGain();
			g.gain.setValueAtTime(vol, when);
			g.gain.exponentialRampToValueAtTime(0.0005, when + 0.03);
			s.connect(f).connect(g).connect(this.ambBus);
			s.start(when, Math.random() * 2, 0.05);
		}

		/* ptaki – kilka wzorów śpiewu, każdy z innego miejsca (stereo):
		   0 – ćwierkanie wróbla (krótkie glissanda), 1 – trel (szybkie powtórzenia jednej nuty),
		   2 – dwutonowe „ti-tju” (sikora), 3 – kos: melodyjna fraza o niższych tonach z vibrato */
		bird(when, vol) {
			const c = this.ctx;
			const pan = c.createStereoPanner ? c.createStereoPanner() : null;
			const out = c.createGain();
			out.gain.value = 1;
			if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan).connect(this.ambBus); } else out.connect(this.ambBus);
			const note = (t, f0, f1, f2, d, v) => {
				const o = c.createOscillator();
				o.type = 'sine';
				o.frequency.setValueAtTime(f0, t);
				o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.5);
				o.frequency.exponentialRampToValueAtTime(f2, t + d);
				const g = c.createGain();
				g.gain.setValueAtTime(0.0001, t);
				g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.01, d * 0.2));
				g.gain.exponentialRampToValueAtTime(0.0001, t + d);
				o.connect(g).connect(out);
				o.start(t);
				o.stop(t + d + 0.02);
			};
			const kind = Math.floor(Math.random() * 4);
			if (kind === 0) {
				const n = 2 + Math.floor(Math.random() * 4), base = 2800 + Math.random() * 2200;
				for (let i = 0; i < n; i++) {
					const t = when + i * (0.09 + Math.random() * 0.08);
					note(t, base * (0.9 + Math.random() * 0.2), base * (1.2 + Math.random() * 0.4), base * 0.85, 0.09, vol);
				}
			} else if (kind === 1) {
				const n = 8 + Math.floor(Math.random() * 10), f = 3800 + Math.random() * 1500;
				for (let i = 0; i < n; i++) note(when + i * 0.045, f, f * 1.08, f * 0.95, 0.035, vol * 0.7 * (1 - i / (n * 1.4)));
			} else if (kind === 2) {
				const f = 4200 + Math.random() * 800;
				for (let r = 0; r < 2 + Math.floor(Math.random() * 3); r++) {
					const t = when + r * 0.42;
					note(t, f, f * 1.02, f, 0.12, vol);
					note(t + 0.17, f * 0.74, f * 0.72, f * 0.7, 0.16, vol * 0.85);
				}
			} else {
				let t = when;
				const n = 4 + Math.floor(Math.random() * 4);
				for (let i = 0; i < n; i++) {
					const f = 1500 + Math.random() * 1300, d = 0.12 + Math.random() * 0.18;
					note(t, f, f * (0.9 + Math.random() * 0.25), f * (0.85 + Math.random() * 0.3), d, vol * 0.9);
					t += d + 0.03 + Math.random() * 0.08;
				}
			}
		}

		/* uderzenie młoteczka dzwonu alarmowego: alikwoty niesymetryczne (dzwon, nie czysty ton), szybkie
		   wybrzmienie, lekka losowość siły */
		ding(when, vol, pan) {
			const c = this.ctx;
			const out = c.createGain();
			out.gain.value = vol * (0.85 + Math.random() * 0.3);
			if (c.createStereoPanner && pan) { const p2 = c.createStereoPanner(); p2.pan.value = pan; out.connect(p2).connect(this.ambBus); } else out.connect(this.ambBus);
			for (const [f, v, d] of [[1240, 1, 0.32], [2610, 0.5, 0.2], [3980, 0.28, 0.12], [5430, 0.15, 0.08]]) {
				const o = c.createOscillator();
				o.type = 'sine';
				o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
				const g = c.createGain();
				g.gain.setValueAtTime(0.0001, when);
				g.gain.exponentialRampToValueAtTime(v, when + 0.003);
				g.gain.exponentialRampToValueAtTime(0.0001, when + d);
				o.connect(g).connect(out);
				o.start(when);
				o.stop(when + d + 0.02);
			}
		}

		tone(freq, start, dur, type = 'sine', vol = 0.12, dest) {
			const c = this.ctx;
			const o = c.createOscillator();
			o.type = type;
			o.frequency.value = freq;
			const g = c.createGain();
			g.gain.setValueAtTime(0.0001, start);
			g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
			g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
			o.connect(g).connect(dest || this.master);
			o.start(start);
			o.stop(start + dur + 0.05);
		}

		burst(start, dur, freq, vol, type = 'highpass') {
			const c = this.ctx;
			const s = c.createBufferSource();
			s.buffer = this.noiseBuf;
			const f = c.createBiquadFilter();
			f.type = type;
			f.frequency.value = freq;
			const g = c.createGain();
			g.gain.setValueAtTime(vol, start);
			g.gain.exponentialRampToValueAtTime(0.001, start + dur);
			s.connect(f).connect(g).connect(this.trainBus);
			s.start(start, 0, dur + 0.05);
		}

		play(name) {
			if (!this.ctx) return;
			const t = this.ctx.currentTime;
			switch (name) {
				case 'chime':
					// gong dworcowy: trzy tony z alikwotami
					for (const [f, d] of [[784, 0.4], [659, 0.75], [523, 1.1]]) {
						this.tone(f, t + d, 1.1, 'sine', 0.1);
						this.tone(f * 2.01, t + d, 0.6, 'sine', 0.025);
					}
					break;
				case 'doors':
					for (let i = 0; i < 3; i++) this.tone(1250, t + i * 0.28, 0.14, 'square', 0.035);
					this.burst(t + 0.85, 0.55, 1400, 0.12);
					// dociśnięcie skrzydeł
					this.burst(t + 1.45, 0.12, 300, 0.25, 'lowpass');
					break;
				case 'whistle':
					this.tone(2900, t, 0.22, 'sine', 0.09);
					this.tone(2900, t + 0.3, 0.7, 'sine', 0.09);
					break;
				case 'warn':
					this.tone(1500, t, 0.12, 'square', 0.05);
					this.tone(1500, t + 0.18, 0.12, 'square', 0.05);
					break;
				case 'emergency':
					this.burst(t, 2.4, 500, 0.32);
					break;
				case 'good':
					this.tone(880, t, 0.18);
					this.tone(1320, t + 0.14, 0.35);
					break;
				case 'bad':
					this.tone(220, t, 0.35, 'sawtooth', 0.08);
					this.tone(180, t + 0.3, 0.5, 'sawtooth', 0.08);
					break;
				case 'crash':
					this.burst(t, 1.6, 200, 0.5);
					this.tone(70, t, 1.2, 'sawtooth', 0.2);
					break;
				case 'panto':
					// zawór pantografu: syk powietrza
					this.burst(t, 1.2, 2200, 0.08);
					break;
				case 'ws-on':
					// wyłącznik szybki: głośne kłapnięcie styków
					this.contactor(t, 0.25);
					this.burst(t, 0.15, 300, 0.3, 'lowpass');
					break;
				case 'ws-off':
					this.contactor(t, 0.18);
					this.burst(t, 0.25, 800, 0.12);
					break;
				case 'click':
					this.tone(1800, t, 0.04, 'square', 0.03);
					break;
			}
		}

		setRain(level) {
			this.env.rain = level;
		}

		setMuted(m) {
			this.muted = m;
			if (this.master) this.set(this.master.gain, m ? 0 : 0.75 * this.volume, 0.05);
		}

		setVolume(v) {
			this.volume = v;
			if (this.master) this.set(this.master.gain, this.muted ? 0 : 0.75 * v, 0.05);
		}
	}

	window.TrainAudio = TrainAudio;
})();
