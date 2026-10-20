/* Ekran startowy i ekran wczytywania trasy (jak w Pograniczu Galaktyki). Tło – rysunek 2D na canvasie: jazda po
   torze w perspektywie (podsypka, podkłady, szyny, drugi tor, słupy i przewody sieci trakcyjnej, wzgórza na
   horyzoncie, światła stacji w oddali, niebo wg pory dnia z gwiazdami nocą). Pasek postępu animuje CSS (działa także,
   gdy strona buduje świat i wątek jest zajęty) – idzie do 85% i czeka, aż praca się skończy, wtedy dochodzi do końca;
   ekran wczytywania przechodzi na rzeczywisty postęp (progress(p) z main.js) – pasek dochodzi do niego przejściem CSS,
   procent pokazuje tę samą wartość (dawniej procent liczony z animacji w klatkach tła stał, gdy klatki stały przy
   budowie świata, a pasek CSS szedł dalej).
   Ekran startowy: logo, pasek do zbudowania podglądu w menu, potem „kliknij lub naciśnij klawisz”. Ekran
   wczytywania: karta z trasą, składem i odjazdem, etapy, wskazówka; pociąg zwalnia w miarę postępu (dojazd do
   stacji). Przy ograniczonym ruchu (prefers-reduced-motion) tło stoi.
   Tło rysuje Web Worker na OffscreenCanvas (js/rail-scene.js) – płynnie także wtedy, gdy wątek główny wczytuje grę
   (świat, shadery); bez OffscreenCanvas – w wątku głównym. */
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
	const railScene = (...a) => window.TrainRailScene(...a);
	/* wspólna część: element na całe okno z canvasem tła; draw(c, W, H, t) – klatka (logika ekranu i – bez workera –
	   rysunek tła); zwraca { root, close, start, bg }; existing – gotowy element ze strony (ekran startowy w index.html,
	   widoczny od pierwszej klatki). bg – { night, s, speed }: tło w Web Workerze (js/rail-scene.js, OffscreenCanvas) –
	   animuje się płynnie, gdy wątek główny buduje świat i shadery; draw dostaje wtedy c = null, a ov.bg({ speed })
	   zmienia prędkość jazdy w tle. Bez OffscreenCanvas – rysowanie w wątku głównym jak dawniej. */
	function overlay(cls, html, draw, existing, bg) {
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
		const canvas = root.querySelector('canvas');
		const dpr = () => Math.min(2, window.devicePixelRatio || 1);
		let W = Math.round(innerWidth * dpr()), H = Math.round(innerHeight * dpr()), worker = null, c = null;
		if (bg && typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && canvas.transferControlToOffscreen) {
			try {
				worker = new Worker('js/rail-scene.js');
				const off = canvas.transferControlToOffscreen();
				worker.postMessage({ type: 'init', canvas: off, w: W, h: H, night: bg.night, s: bg.s || 0, speed: bg.speed || 0 }, [off]);
			} catch (e) {
				if (worker) worker.terminate();
				worker = null;
			}
		}
		if (!worker) c = canvas.getContext('2d');
		root.bgWorker = worker; // (pomiar płynności tła: tools/render-check/bootframes.js)
		const fit = () => {
			W = Math.round(innerWidth * dpr());
			H = Math.round(innerHeight * dpr());
			if (worker) worker.postMessage({ type: 'size', w: W, h: H });
			else { canvas.width = W; canvas.height = H; }
		};
		if (!worker) fit();
		addEventListener('resize', fit);
		const start = performance.now();
		let closing = false;
		const frame = (now) => {
			if (!root.isConnected || closing) return;
			draw(c, W, H, (now - start) / 1000);
			requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
		const close = (after) => {
			if (closing) return;
			closing = true;
			root.classList.add('closing');
			removeEventListener('resize', fit);
			setTimeout(() => { root.remove(); if (worker) worker.terminate(); if (after) after(); }, 500);
		};
		return { root, close, start, bg: worker ? (p) => worker.postMessage(Object.assign({ type: 'set' }, p)) : null };
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
	   tego skryptu (przed ciężkimi plikami gry); boot({ version, ready(), status(), onEnter }) z main.js dopina warunek
	   gotowości (świat podglądu w menu zbudowany), wersję i bieżący etap wczytywania (status() – tekst pod paskiem;
	   do wczytania main.js – „Wczytywanie plików gry…”). Po gotowości pasek dochodzi do końca i pojawia się zachęta;
	   klik albo klawisz zamyka ekran (klawisz nie trafia dalej do gry; onEnter po zniknięciu). */
	let bootState = null;
	function startBoot() {
		if (bootState) return bootState;
		const el = document.getElementById('boot');
		const night = 0.85;
		/* etap pod paskiem odświeżany co klatkę (requestAnimationFrame) – zadania z setTimeout nie dostają kolejki, gdy
		   kompilacja Three oddaje sterowanie przez scheduler.yield (jej kontynuacje mają pierwszeństwo); klatki
		   przeglądarka i tak co jakiś czas wymusza */
		let stepTick = null;
		const ov = overlay('scr-boot', `<div class="scr-boot-card">${LOGO}<h1>MASZYNISTA</h1><p class="scr-sub">symulator jazdy pociągiem po prawdziwych liniach</p><div class="scr-bar"><b></b></div><p class="scr-step" aria-hidden="true">Wczytywanie plików gry…</p><p class="scr-press">Kliknij lub naciśnij dowolny klawisz</p><p class="scr-ver"></p></div>`,
			(c, W, H, t) => { if (c) railScene(c, W, H, reducedMotion() ? 40 : t * 9, night); if (stepTick) stepTick(); }, el,
			{ night, s: reducedMotion() ? 40 : 0, speed: reducedMotion() ? 0 : 9 });
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
		const step = ov.root.querySelector('.scr-step');
		const setStep = (s) => { if (step && s && step.textContent !== s) step.textContent = s; };
		stepTick = () => { if (!ready && st.opts && st.opts.status) setStep(st.opts.status()); };
		const poll = () => {
			if (!ov.root.isConnected) return;
			const t = (performance.now() - ov.start) / 1000;
			if (st.opts && st.opts.status) setStep(st.opts.status());
			if (t >= minTime && st.opts && (!st.opts.ready || st.opts.ready())) {
				setStep('Gotowe');
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
		let speedS = 0, lastT = 0, lastV = -1, finished = false, finishedAt = 0;
		const minTime = o.minTime ?? 1.6;
		let pr = null, stage = null, pct = null, real = null;
		const label = (p) => {
			pct.textContent = Math.round(p * 100) + '%';
			stage.textContent = p >= 0.99 ? STAGES[STAGES.length - 1] : STAGES[Math.min(STAGES.length - 2, Math.floor(p * (STAGES.length - 1)))];
		};
		const ov = overlay('scr-load', `<div class="scr-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="scr-card"><span class="scr-eyebrow">${esc(o.eyebrow || 'TRASA')}</span><h1>${esc(o.title || '')}</h1><p class="scr-route">${esc(o.sub || '')}</p><div class="scr-bar"><b></b></div><div class="scr-stage"><span></span><em>0%</em></div><p class="scr-tip"><b>Wskazówka</b> ${esc(tip)}</p></div>`,
			(c, W, H, t) => {
				// pociąg zwalnia w miarę postępu: od ok. 30 m/s do zatrzymania przy końcu
				const p = pr ? pr.shown() : 0, v = reducedMotion() ? 0 : 30 * Math.max(0, 1 - p) + (p < 1 ? 1.5 : 0);
				if (c) {
					speedS += v * Math.max(0, Math.min(0.1, t - lastT));
					railScene(c, W, H, speedS, o.night ?? 0.2);
				} else if (ov.bg && Math.abs(v - lastV) > 0.25) { ov.bg({ speed: v }); lastV = v; } // (tło w workerze)
				lastT = t;
				if (pct) label(Math.max(p, real || 0)); // procent nie maleje (pasek dogania wartość przejściem)
				if (finished && p >= 0.999 && t >= minTime && performance.now() - finishedAt > 450) ov.close();
			}, null, { night: o.night ?? 0.2, speed: reducedMotion() ? 0 : 31.5 });
		pr = progress(ov.root);
		stage = ov.root.querySelector('.scr-stage span');
		pct = ov.root.querySelector('.scr-stage em');
		ov.root.addEventListener('pointerdown', () => finished && ov.close());
		return {
			// rzeczywisty postęp 0…1 (rośnie) – pasek przejściem CSS do tej wartości, procent i etap według niej
			progress(p) {
				if (finished || !(p >= 0)) return;
				p = Math.min(0.99, Math.max(real || 0, p));
				const bar = ov.root.querySelector('.scr-bar b');
				if (real === null) {
					const now = pr.shown();
					bar.style.animation = 'none';
					bar.style.transform = `scaleX(${now})`;
					void bar.offsetWidth;
					bar.style.transition = 'transform 0.5s linear';
					p = Math.max(p, now);
				}
				if (p === real) return;
				real = p;
				bar.style.transform = `scaleX(${p})`;
				label(p);
			},
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
