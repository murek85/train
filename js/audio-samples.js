/* Nagrania (etap 11, D1): warstwy dźwięku z plików w sounds/ (CC0, Freesound) – obok syntezy z audio.js.
   sounds/sounds.json: { "klucz": { "file": "nazwa.ogg", "from": s, "len": s, "xf": s, "gain": k, "ref": …, "pitch": Hz } }
   – file: plik w sounds/ (dowolny format dekodowany przez przeglądarkę: ogg, mp3, flac, wav, webm),
   – from / len: wycinek nagrania (s; domyślnie całość), xf: przenikanie końca pętli w początek (s),
   – gain: głośność względem normalizacji (RMS ok. −20 dBFS), ref / pitch – patrz SAMPLE_KEYS.
   Brak pliku albo wpisu – warstwa z syntezy (audio.js). Klucze (rola, pętla/pojedyncze, parametry):
     roll, roll_cab – toczenie z zewnątrz / w kabinie (pętla; ref – prędkość nagrania w m/s),
     clack1…clack4 – uderzenia kół na złączach (pojedyncze),
     flange – pisk obręczy na łuku (pętla),
     motor_dc, motor_emu, motor_ac – napęd: lokomotywa prądu stałego (EU07), EZT prądu stałego (EN57), falownik
       nowoczesnych EZT (pętle; ref – prędkość nagrania w m/s),
     diesel_idle, diesel_run – silnik spalinowy na biegu jałowym i pod obciążeniem (pętle),
     blower – wentylatory silników trakcyjnych (pętla), compressor – sprężarka (pętla),
     brake_squeal – pisk przy dohamowaniu (pętla), air_hiss – syk powietrza (pętla),
     horn_lo, horn_hi – syrena niska i wysoka (pętle; pitch – ton nagrania w Hz),
     wind, rain, rain_cab, birds, city, crickets, bell – otoczenie (pętle). */
(function () {
	'use strict';

	const SAMPLE_KEYS = {
		roll: { loop: true, ref: 22 }, roll_cab: { loop: true, ref: 22 },
		clack1: {}, clack2: {}, clack3: {}, clack4: {},
		flange: { loop: true },
		motor_dc: { loop: true, ref: 16.7 }, motor_emu: { loop: true, ref: 16.7 }, motor_ac: { loop: true, ref: 16.7 },
		diesel_idle: { loop: true }, diesel_run: { loop: true },
		blower: { loop: true }, compressor: { loop: true },
		brake_squeal: { loop: true }, air_hiss: { loop: true },
		horn_lo: { loop: true, pitch: 370 }, horn_hi: { loop: true, pitch: 740 },
		wind: { loop: true }, rain: { loop: true }, rain_cab: { loop: true }, birds: { loop: true }, city: { loop: true }, crickets: { loop: true }, bell: { loop: true },
	};

	class SampleBank {
		constructor(ctx, base = 'sounds/') {
			this.ctx = ctx;
			this.base = base;
			this.buf = {};
			this.cfg = {};
			this.ready = false;
		}

		// wczytanie manifestu i plików (brak manifestu – bez nagrań)
		async load() {
			let man = {};
			try {
				const r = await fetch(this.base + 'sounds.json', { cache: 'no-cache' });
				if (r.ok) man = await r.json();
			} catch (e) { /* bez nagrań */ }
			const jobs = Object.entries(man).filter(([k, v]) => SAMPLE_KEYS[k] && v && v.file).map(async ([k, v]) => {
				try {
					const r = await fetch(this.base + v.file);
					if (!r.ok) return;
					const raw = await this.ctx.decodeAudioData(await r.arrayBuffer());
					this.cfg[k] = Object.assign({}, SAMPLE_KEYS[k], v);
					this.buf[k] = this.prepare(raw, this.cfg[k]);
				} catch (e) {
					console.warn('Nagranie ' + k + ' (' + v.file + '): ' + e.message);
				}
			});
			await Promise.all(jobs);
			this.ready = true;
			return Object.keys(this.buf);
		}

		has(k) { return !!this.buf[k]; }
		param(k, name, def) { const c = this.cfg[k]; return c && c[name] !== undefined ? c[name] : def; }

		/* wycinek, pętla bez trzasku (koniec przenika w początek – stała moc), normalizacja RMS do ok. −20 dBFS */
		prepare(raw, o) {
			const sr = raw.sampleRate, ch = raw.numberOfChannels;
			const a = Math.max(0, Math.floor((o.from || 0) * sr));
			const len0 = Math.min(raw.length - a, o.len ? Math.floor(o.len * sr) : raw.length - a);
			const xf = o.loop ? Math.min(Math.floor(len0 * 0.25), Math.floor((o.xf ?? 0.4) * sr)) : 0;
			const n = Math.max(1, len0 - xf);
			const out = this.ctx.createBuffer(ch, n, sr);
			let sum = 0;
			for (let c = 0; c < ch; c++) {
				const src = raw.getChannelData(c), d = out.getChannelData(c);
				for (let i = 0; i < n; i++) {
					let v = src[a + i];
					if (i < xf) {
						const t = i / xf;
						v = v * Math.sin(t * Math.PI / 2) + src[a + n + i] * Math.cos(t * Math.PI / 2);
					}
					d[i] = v;
					sum += v * v;
				}
				// pojedyncze: krótkie wygaszenie na końcu (bez trzasku)
				if (!o.loop) { const f = Math.min(n, Math.floor(sr * 0.01)); for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f; }
			}
			const rms = Math.sqrt(sum / (n * ch)) || 1, k = (0.1 / rms) * (o.gain ?? 1);
			for (let c = 0; c < ch; c++) { const d = out.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= k; }
			return out;
		}

		// warstwa zapętlona: { src, g } – głośność 0 (ustawiana w update), start w losowym miejscu
		loop(k, dest) {
			const b = this.buf[k];
			if (!b) return null;
			const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
			src.buffer = b;
			src.loop = true;
			g.gain.value = 0;
			src.connect(g).connect(dest);
			src.start(0, Math.random() * b.duration);
			return { src, g, key: k };
		}
	}

	window.TrainSampleBank = SampleBank;
	window.TrainSampleKeys = SAMPLE_KEYS;
})();
