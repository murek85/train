/* Ekran startowy i ekran wczytywania trasy (jak w Pograniczu Galaktyki). Tło – rysunek 2D na canvasie: jazda po
   torze w perspektywie (podsypka, podkłady, szyny, drugi tor, słupy i przewody sieci trakcyjnej, wzgórza na
   horyzoncie, światła stacji w oddali, niebo wg pory dnia z gwiazdami nocą). Pasek postępu animuje CSS (działa także,
   gdy strona buduje świat i wątek jest zajęty) – idzie do 85% i czeka, aż praca się skończy, wtedy dochodzi do końca.
   Ekran startowy: logo, pasek do zbudowania podglądu w menu, potem „kliknij lub naciśnij klawisz”. Ekran
   wczytywania: karta z trasą, składem i odjazdem, etapy, wskazówka; pociąg zwalnia w miarę postępu (dojazd do
   stacji). Przy ograniczonym ruchu (prefers-reduced-motion) tło stoi. */
(function () {
	'use strict';
	const TIPS = [
		'Zatrzymaj czoło pociągu przy tablicy W4 – im dokładniej, tym więcej punktów.',
		'Przed przejazdem (tablica W6) użyj syreny – przytrzymaj H.',
		'Czuwak: co minutę potwierdź spacją, inaczej pociąg zahamuje nagle.',
		'Żółta tablica to nowe ograniczenie – obowiązuje, dopóki cały pociąg go nie minie.',
		'Żółte światło semafora zapowiada „stój” na następnym – zacznij hamować.',
		'K – fotel maszynisty w kabinie, V – kolejny tryb kamery.',
		'T przyspiesza czas ×2 i ×4 na długich odcinkach.',
		'Ciężki skład towarowy hamuje dłużej – zacznij hamowanie wcześniej.',
		'F – swobodna kamera: zwiedzaj trasę i sprawdzaj uwagi generatora.',
		'Asystent hamowania pokazuje na torze, gdzie pociąg się zatrzyma.',
		'Drzwi (D) otwierasz dopiero, gdy cały skład stoi przy peronie.',
		'W zakładce „Pociąg” złożysz własny skład – kliknij wagon, by zmienić malowanie.',
	];
	const STAGES = ['Układanie torów…', 'Stawianie sieci trakcyjnej…', 'Budowa stacji…', 'Sadzenie drzew…', 'Ustawianie semaforów…', 'Wjazd na peron…', 'Gotowe'];
	const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
	const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
	const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

	/* Tło: s – przebyta droga (m), night – 0 dzień … 1 noc. Kamera 3,2 m nad główką szyny, oś toru pośrodku. */
	function railScene(c, W, H, s, night) {
		const hz = H * 0.5, f = H * 0.95, camH = 3.2;
		const sky0 = mix([92, 146, 205], [6, 10, 24], night), sky1 = mix([226, 214, 190], [40, 32, 58], night);
		const g = c.createLinearGradient(0, 0, 0, hz);
		g.addColorStop(0, rgb(sky0));
		g.addColorStop(1, rgb(sky1));
		c.fillStyle = g;
		c.fillRect(0, 0, W, hz + 1);
		// gwiazdy nocą
		if (night > 0.3) for (let i = 0; i < 140; i++) {
			const a = (0.25 + 0.75 * hash(i * 3.1)) * (night - 0.3) / 0.7 * (0.75 + 0.25 * Math.sin(s * 0.05 + i));
			c.fillStyle = `rgba(230,236,255,${a.toFixed(3)})`;
			c.fillRect(hash(i) * W, hash(i * 7.7) * hz * 0.85, 1.4, 1.4);
		}
		// wzgórza: dwie warstwy, przesuwają się powoli (paralaksa)
		for (const [k, col, amp, shift] of [[0, mix([118, 132, 150], [22, 26, 40], night), 0.12, 0.002], [1, mix([84, 104, 92], [14, 18, 24], night), 0.07, 0.006]]) {
			c.fillStyle = rgb(col);
			c.beginPath();
			c.moveTo(0, hz + 1);
			for (let x = 0; x <= W; x += 8) {
				const u = x / W * 6 + s * shift + k * 9;
				const y = hz - H * amp * (0.35 + 0.35 * Math.sin(u * 1.3) * Math.sin(u * 0.47 + 1) + 0.3 * hash(Math.floor(u * 3)) * 0.3);
				c.lineTo(x, y);
			}
			c.lineTo(W, hz + 1);
			c.fill();
		}
		// grunt
		const gg = c.createLinearGradient(0, hz, 0, H);
		gg.addColorStop(0, rgb(mix([96, 110, 80], [16, 20, 18], night)));
		gg.addColorStop(1, rgb(mix([58, 70, 46], [8, 10, 10], night)));
		c.fillStyle = gg;
		c.fillRect(0, hz, W, H - hz);
		const P = (x, z) => [W / 2 + (f * x) / z, hz + (f * camH) / z];
		// podsypka obu torów (tor gracza i drugi po lewej, rozstaw 4,5 m)
		for (const ox of [0, -4.5]) {
			c.fillStyle = rgb(mix([128, 120, 108], [34, 32, 32], night));
			const a = P(ox - 2.4, 2), b = P(ox + 2.4, 2), d = P(ox + 2.4, 900), e = P(ox - 2.4, 900);
			c.beginPath();
			c.moveTo(a[0], H + 40); c.lineTo(b[0], H + 40); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]);
			c.fill();
			// podkłady co 0,6 m, przesuwają się z jazdą
			c.fillStyle = rgb(mix([88, 76, 64], [26, 22, 20], night));
			const off = s % 0.6;
			for (let z = 1.2 - off; z < 160; z += 0.6) {
				if (z < 1.2) continue;
				const l = P(ox - 1.3, z), r = P(ox + 1.3, z), h = Math.max(1, (f * 0.12) / z);
				c.fillRect(l[0], l[1] - h / 2, r[0] - l[0], h);
			}
			// szyny: główka 7 cm – trapez zwężający się w perspektywie
			c.fillStyle = rgb(mix([196, 200, 206], [96, 104, 120], night));
			for (const rx of [-0.75, 0.75]) {
				const a1 = P(ox + rx - 0.035, 1.2), a2 = P(ox + rx + 0.035, 1.2), b1 = P(ox + rx + 0.035, 900), b2 = P(ox + rx - 0.035, 900);
				c.beginPath();
				c.moveTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]); c.lineTo(b1[0], b1[1]); c.lineTo(b2[0], b2[1]);
				c.fill();
			}
		}
		// słupy sieci trakcyjnej co 60 m po prawej, przewód jezdny i lina nośna nad osią toru
		const pole = rgb(mix([64, 70, 78], [10, 12, 16], night));
		const poff = s % 60;
		for (let z = 60 - poff; z < 900; z += 60) {
			if (z < 2) continue;
			const b0 = P(3.6, z), t0 = P(3.6, z), w = Math.max(1, (f * 0.28) / z);
			t0[1] = hz + (f * (camH - 8.2)) / z;
			c.fillStyle = pole;
			c.fillRect(b0[0] - w / 2, t0[1], w, b0[1] - t0[1]);
			const arm = P(-0.2, z);
			c.fillRect(arm[0], t0[1] + (f * 1.0) / z, b0[0] - arm[0], Math.max(1, w * 0.45));
		}
		c.strokeStyle = rgb(mix([40, 44, 50], [120, 130, 150], night), 0.85);
		c.lineWidth = 1.2;
		for (const [y, x] of [[5.6, 0], [7.0, 0], [5.6, -4.5], [7.0, -4.5]]) {
			const a = P(x, 9), b = P(x, 900);
			c.beginPath();
			c.moveTo(a[0], hz + (f * (camH - y)) / 9);
			c.lineTo(b[0], hz + (f * (camH - y)) / 900);
			c.stroke();
		}
		// światła stacji w oddali (i reflektor przy horyzoncie nocą)
		for (let i = 0; i < 7; i++) {
			const p = P(-6 + i * 2.4, 520 + hash(i) * 60), r = 2 + night * 5;
			const gl = c.createRadialGradient(p[0], p[1] - 4, 0, p[0], p[1] - 4, r * 4);
			gl.addColorStop(0, `rgba(255,214,140,${0.35 + night * 0.5})`);
			gl.addColorStop(1, 'rgba(255,214,140,0)');
			c.fillStyle = gl;
			c.fillRect(p[0] - r * 4, p[1] - 4 - r * 4, r * 8, r * 8);
		}
		// winieta
		const v = c.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, W * 0.75);
		v.addColorStop(0, 'rgba(0,0,0,0)');
		v.addColorStop(1, 'rgba(0,0,0,0.6)');
		c.fillStyle = v;
		c.fillRect(0, 0, W, H);
	}

	/* wspólna część: element na całe okno z canvasem tła; draw(t) – klatka tła; zwraca { root, canvas, close };
	   existing – gotowy element ze strony (ekran startowy w index.html, widoczny od pierwszej klatki) */
	function overlay(cls, html, draw, existing) {
		let root = existing;
		if (!root) {
			root = document.createElement('div');
			root.className = 'scr ' + cls;
			root.setAttribute('role', 'status');
			root.setAttribute('aria-live', 'polite');
			root.innerHTML = `<canvas class="scr-bg" aria-hidden="true"></canvas>${html}`;
			document.body.append(root);
		}
		if (reducedMotion()) root.classList.add('reduced');
		const canvas = root.querySelector('canvas'), c = canvas.getContext('2d');
		const fit = () => {
			const dpr = Math.min(2, window.devicePixelRatio || 1);
			canvas.width = Math.round(innerWidth * dpr);
			canvas.height = Math.round(innerHeight * dpr);
		};
		fit();
		addEventListener('resize', fit);
		const start = performance.now();
		let closing = false;
		const frame = (now) => {
			if (!root.isConnected || closing) return;
			draw(c, canvas.width, canvas.height, (now - start) / 1000);
			requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
		const close = (after) => {
			if (closing) return;
			closing = true;
			root.classList.add('closing');
			removeEventListener('resize', fit);
			setTimeout(() => { root.remove(); if (after) after(); }, 500);
		};
		return { root, close, start };
	}

	// pasek postępu (CSS) i jego stan: shown() – bieżące wypełnienie 0…1; finish() – dojście do końca
	function progress(root) {
		const bar = root.querySelector('.scr-bar b');
		const shown = () => {
			const m = getComputedStyle(bar).transform.match(/matrix\(([-\d.e]+)/);
			return m ? Number(m[1]) : 0;
		};
		const finish = () => {
			const p = shown();
			bar.style.animation = 'none';
			bar.style.transform = `scaleX(${p})`;
			void bar.offsetWidth;
			bar.style.transition = 'transform 0.4s ease-out';
			bar.style.transform = 'scaleX(1)';
			root.classList.add('finished');
		};
		return { shown, finish };
	}

	const LOGO = `<svg class="scr-logo" viewBox="0 0 120 120" aria-hidden="true"><rect x="4" y="4" width="112" height="112" rx="26" fill="#161c26" stroke="#2c3646" stroke-width="3"/><rect x="28" y="22" width="64" height="66" rx="14" fill="#ffb020"/><rect x="34" y="30" width="23" height="20" rx="4" fill="#0d1118"/><rect x="63" y="30" width="23" height="20" rx="4" fill="#0d1118"/><rect x="28" y="57" width="64" height="5" fill="#c77d0a"/><circle cx="41" cy="73" r="5.5" fill="#fff4d6"/><circle cx="79" cy="73" r="5.5" fill="#fff4d6"/><path d="M40 92 L31 108 M80 92 L89 108" stroke="#8f9bad" stroke-width="4" stroke-linecap="round"/><path d="M33 98 H87 M29 105 H91" stroke="#2c3646" stroke-width="3"/></svg>`;

	/* Ekran startowy: element #boot z index.html (widoczny od pierwszej klatki). Animacja tła rusza od razu po wczytaniu
	   tego skryptu (przed ciężkimi plikami gry); boot({ version, ready(), onEnter }) z main.js dopina warunek
	   gotowości (świat podglądu w menu zbudowany) i wersję. Po gotowości pasek dochodzi do końca i pojawia się zachęta;
	   klik albo klawisz zamyka ekran (klawisz nie trafia dalej do gry; onEnter po zniknięciu). */
	let bootState = null;
	function startBoot() {
		if (bootState) return bootState;
		const el = document.getElementById('boot');
		const night = 0.85;
		const ov = overlay('scr-boot', `<div class="scr-boot-card">${LOGO}<h1>MASZYNISTA</h1><p class="scr-sub">symulator jazdy pociągiem po prawdziwych liniach</p><div class="scr-bar"><b></b></div><p class="scr-press">Kliknij lub naciśnij dowolny klawisz</p><p class="scr-ver"></p></div>`,
			(c, W, H, t) => railScene(c, W, H, reducedMotion() ? 40 : t * 9, night), el);
		const st = (bootState = { ov, opts: null });
		const pr = progress(ov.root);
		let ready = false, entered = false;
		const enter = (e) => {
			if (!ready || entered) return;
			if (e) { e.preventDefault(); e.stopPropagation(); }
			entered = true;
			removeEventListener('keydown', key, true);
			ov.close(st.opts && st.opts.onEnter);
		};
		const key = (e) => { e.preventDefault(); e.stopPropagation(); enter(); };
		addEventListener('keydown', key, true);
		ov.root.addEventListener('pointerdown', enter);
		st.enter = enter;
		const minTime = 1.2;
		const poll = () => {
			if (!ov.root.isConnected) return;
			const t = (performance.now() - ov.start) / 1000;
			if (t >= minTime && st.opts && (!st.opts.ready || st.opts.ready())) {
				pr.finish();
				setTimeout(() => { ready = true; ov.root.classList.add('ready'); }, 420);
				return;
			}
			setTimeout(poll, 120);
		};
		setTimeout(poll, 120);
		return st;
	}
	function boot(o = {}) {
		const st = startBoot();
		st.opts = o;
		const ver = st.ov.root.querySelector('.scr-ver');
		if (ver && o.version) ver.textContent = o.version;
		return { close: () => st.enter() };
	}

	/* Ekran wczytywania trasy: { eyebrow, title, sub, night } – zwraca { done() }: po zakończeniu pracy pasek dochodzi
	   do końca, ekran czeka minimalny czas i znika (klik zamyka wcześniej, gdy praca skończona). */
	function loading(o = {}) {
		const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
		const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
		let speedS = 0, lastT = 0, finished = false, finishedAt = 0;
		const minTime = o.minTime ?? 1.6;
		let pr = null, stage = null, pct = null;
		const ov = overlay('scr-load', `<div class="scr-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="scr-card"><span class="scr-eyebrow">${esc(o.eyebrow || 'TRASA')}</span><h1>${esc(o.title || '')}</h1><p class="scr-route">${esc(o.sub || '')}</p><div class="scr-bar"><b></b></div><div class="scr-stage"><span></span><em>0%</em></div><p class="scr-tip"><b>Wskazówka</b> ${esc(tip)}</p></div>`,
			(c, W, H, t) => {
				// pociąg zwalnia w miarę postępu: od ok. 30 m/s do zatrzymania przy końcu
				const p = pr ? pr.shown() : 0, v = reducedMotion() ? 0 : 30 * Math.max(0, 1 - p) + (p < 1 ? 1.5 : 0);
				speedS += v * Math.max(0, Math.min(0.1, t - lastT));
				lastT = t;
				railScene(c, W, H, speedS, o.night ?? 0.2);
				if (pct) {
					pct.textContent = Math.round(p * 100) + '%';
					stage.textContent = p >= 0.99 ? STAGES[STAGES.length - 1] : STAGES[Math.min(STAGES.length - 2, Math.floor(p * (STAGES.length - 1)))];
				}
				if (finished && p >= 0.999 && t >= minTime && performance.now() - finishedAt > 450) ov.close();
			});
		pr = progress(ov.root);
		stage = ov.root.querySelector('.scr-stage span');
		pct = ov.root.querySelector('.scr-stage em');
		ov.root.addEventListener('pointerdown', () => finished && ov.close());
		return {
			done() {
				if (finished) return;
				finished = true;
				finishedAt = performance.now();
				pr.finish();
				// (gdy klatki animacji stoją – np. okno w tle – zamknięcie na zegarze)
				setTimeout(() => ov.close(), Math.max(0, minTime * 1000 - (finishedAt - ov.start)) + 1200);
			},
			close: () => ov.close(),
		};
	}

	window.TrainScreens = { boot, loading, TIPS, railScene };
	// ekran startowy ze strony – animacja od razu (skrypt wczytany zaraz po nim w index.html)
	if (document.getElementById('boot')) startBoot();
})();
