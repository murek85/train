/* Spina wszystko: menu, pętla gry, klawiatura, ekran końcowy. */
(function () {
	'use strict';
	const R = window.TrainRoutes;
	const { Sim, autopilot, buildTimetable, fmtClock, fmtDelay } = window.TrainSim;
	const SC = window.TrainScenario;
	const SCENARIOS = window.TrainScenarios || [];

	const $ = (id) => document.getElementById(id);
	// trasy: wbudowane, rzeczywiste dołączone do gry (routes/*.js) i wygenerowane w menu (zapisane w przeglądarce)
	const defs = (window.TrainRouteDefs || []).slice();
	const BUILTIN = new Set(defs.map((d) => d.id));
	// trasy z generatora (z otoczeniem ok. 1 MB każda) – w IndexedDB, wczytywane asynchronicznie po starcie
	const prepared = {}; // trasy przygotowane dla danego składu: klucz „trasa|pociąg|liczba wagonów”
	const timetables = {};
	const renderer = new window.Train3D.Renderer3D($('view'), $('mini'));
	// kliknięcie w pojazd – komunikat o środku orbity kamery
	renderer.onFocusCar = () => { if (sim) hud.toast('Kamera: ' + renderer.focusLabel(sim)); };
	const hud = new window.TrainHud();
	const audio = new window.TrainAudio();

	let mode = 'menu'; // menu | play | pause | over | end
	// bez tras wbudowanych lista bywa pusta, dopóki nie wczytają się (albo nie powstaną) trasy z generatora
	const wantedRoute = load('route', defs[0] ? defs[0].id : null); // może to być trasa z generatora, wczytana dopiero z IndexedDB
	let selected = wantedRoute;
	if (!defs.some((d) => d.id === selected)) selected = defs[0] ? defs[0].id : null;
	// wybrany skład: typ pociągu i liczba zespołów/wagonów (przycinana do długości peronów trasy)
	let trainCfg = load('trainCfg', null) || R.defaultConfig(defs[0] || { train: 'ezt' });
	// stary zapis ({ train, cars }) → konfiguracja z katalogu taboru
	if (trainCfg && trainCfg.train && !trainCfg.emu && !trainCfg.loco) trainCfg = R.legacyConfig(R.TRAIN_TYPES[trainCfg.train] ? trainCfg.train : 'ezt', trainCfg.cars || 1);
	let sim = null;
	let demo = null;
	// scen – scenariusz z menu „Scenariusze” (null – jazda swobodna); rideEvents – zdarzenia losowe bieżącej jazdy (do
	// zapisu gry); rideWeather – pogoda bieżącej jazdy (scenariusz, zmiana w czasie jazdy, pauza)
	let scen = null, rideEvents = null, rideWeather = null, rideTraffic = null;
	let timeScale = 1;
	let endTimer = 0;
	let last = performance.now();
	let muted = load('muted', false);
	audio.muted = muted;

	function load(key, def) {
		try {
			const v = localStorage.getItem('maszynista.' + key);
			return v === null ? def : JSON.parse(v);
		} catch (e) { return def; }
	}
	function save(key, value) {
		try { localStorage.setItem('maszynista.' + key, JSON.stringify(value)); } catch (e) { /* brak dostępu */ }
	}

	// ---------- trasy z generatora: IndexedDB ----------
	// baza: trasy (routes) i kafelki modelu powierzchni NMPT (nmpt – klucz "e,n", ponowne generowanie bez pobierania)
	let dbOpening = null;
	const dbOpen = () => dbOpening || (dbOpening = new Promise((res, rej) => {
		const req = indexedDB.open('maszynista', 3);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains('routes')) db.createObjectStore('routes', { keyPath: 'id' });
			if (!db.objectStoreNames.contains('nmpt')) db.createObjectStore('nmpt');
			if (!db.objectStoreNames.contains('files')) db.createObjectStore('files'); // pobrane pliki źródeł (BDOT10k, PLK)
		};
		req.onsuccess = () => res(req.result);
		req.onerror = () => rej(req.error);
	}));
	const dbRun = async (store, mode, fn) => {
		const db = await dbOpen();
		return new Promise((res, rej) => {
			const t = db.transaction(store, mode);
			const r = fn(t.objectStore(store));
			t.oncomplete = () => res(r ? r.result : undefined);
			t.onerror = () => rej(t.error);
			t.onabort = () => rej(t.error);
		});
	};
	const routeDB = {
		all: () => dbRun('routes', 'readonly', (st) => st.getAll()),
		put: (d) => dbRun('routes', 'readwrite', (st) => st.put(d)),
		del: (id) => dbRun('routes', 'readwrite', (st) => st.delete(id)),
	};
	const tileDB = {
		all: async () => {
			const keys = await dbRun('nmpt', 'readonly', (st) => st.getAllKeys());
			const vals = await dbRun('nmpt', 'readonly', (st) => st.getAll());
			return new Map(keys.map((k, i) => [k, vals[i]]));
		},
		put: (k, t) => dbRun('nmpt', 'readwrite', (st) => st.put(t, k)),
	};
	// pobrane pliki oficjalnych źródeł (paczki BDOT10k, arkusze PLK) – według adresu
	const fileDB = {
		get: async (url) => { try { const v = await dbRun('files', 'readonly', (st) => st.get(url)); return v ? new Uint8Array(v) : null; } catch (e) { return null; } },
		put: async (url, bytes) => { try { await dbRun('files', 'readwrite', (st) => st.put(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), url)); } catch (e) { /* brak miejsca */ } },
	};
	// model powierzchni NMPT dla generatora: kafelki z pamięci, nowe zapisywane od razu (wartości jako Int16Array)
	async function nmptSurface() {
		let tiles = new Map();
		try { tiles = await tileDB.all(); } catch (e) { /* bez pamięci */ }
		return (pts, l) => window.TrainOSM.nmptSampler(pts, l, tiles, (all, k, T) => {
			tileDB.put(k, Object.assign({}, T, { v: Int16Array.from(T.v) })).catch(() => {});
		});
	}
	const plain = (d) => Object.assign({}, d, { custom: undefined });
	async function loadCustom() {
		let list = [];
		try {
			// przeniesienie tras zapisanych wcześniej w localStorage
			const old = JSON.parse(localStorage.getItem('maszynista.customRoutes') || '[]');
			for (const d of old) await routeDB.put(d);
			if (old.length) localStorage.removeItem('maszynista.customRoutes');
			list = await routeDB.all();
		} catch (e) { /* brak IndexedDB (np. tryb prywatny) – tylko trasy wbudowane */ }
		for (const d of list) if (!BUILTIN.has(d.id) && !defs.some((x) => x.id === d.id)) defs.push(Object.assign(d, { custom: true }));
		const want = defs.some((d) => d.id === wantedRoute) ? wantedRoute : !defs.some((d) => d.id === selected) && defs[0] ? defs[0].id : null;
		if (want && selected !== want && mode === 'menu') {
			selected = want;
			trainCfg = cfgFor(defById(selected));
			startDemo();
		}
		buildMenu();
		if (!$('scr-gen').classList.contains('hidden')) buildGenScreen();
		if (!$('saves').classList.contains('hidden')) buildSaves(); // zapisy na trasach z generatora – już dostępne
	}
	function forgetRoute(id) {
		const i = defs.findIndex((d) => d.id === id && d.custom);
		if (i < 0) return;
		defs.splice(i, 1);
		for (const k of Object.keys(prepared)) if (k.startsWith(id + '|')) delete prepared[k];
		for (const k of Object.keys(timetables)) if (k.startsWith(id + '|')) delete timetables[k];
		routeDB.del(id).catch(() => {});
		if (selected === id) { selected = defs[0] ? defs[0].id : null; save('route', selected); if (mode === 'menu') startDemo(); }
	}

	/* trasa rzeczywista z podejrzanym profilem: pochylenie ponad 30‰ łącznie na ponad 300 m (błędne wysokości z NMT –
	   trasy wygenerowane przed poprawką pobierania): pierwsze takie miejsce albo null */
	function suspectGrades(d) {
		if (!d.real || !Array.isArray(d.grades)) return null;
		let len = 0, first = null, gmax = 0;
		for (let i = 0; i < d.grades.length; i++) {
			const [pos, g] = d.grades[i], next = i + 1 < d.grades.length ? d.grades[i + 1][0] : pos + 50;
			if (Math.abs(g) > 30) { len += next - pos; if (!first) first = pos; gmax = Math.max(gmax, Math.abs(g)); }
		}
		return len > 300 ? { km: (first / 1000).toFixed(1).replace('.', ','), len: Math.round(len), g: Math.round(gmax) } : null;
	}
	function defById(id) { return defs.find((d) => d.id === id) || defs[0]; }
	// skład dopasowany do trasy (znane serie, długość wg peronów / limitu składu towarowego)
	function cfgFor(def) {
		return R.normConfig(def, trainCfg);
	}
	function routeFor(def, cfg) {
		const c = cfg ? R.normConfig(def, cfg) : cfgFor(def);
		const key = `${def.id}|${R.configKey(c)}`;
		if (!prepared[key]) prepared[key] = R.prepare(def, c);
		return prepared[key];
	}
	function routeById(id) { return routeFor(defById(id)); }
	// trasa bieżącej jazdy: scenariusz (jego trasa i skład) albo wybór z menu
	function rideDef() { return scen ? defById(scen.route) : defById(selected); }
	function rideRoute() { return scen ? routeFor(defById(scen.route), scen.train) : routeById(selected); }
	function timetable(route) {
		const key = `${route.id}|${route.configKey}`;
		if (!timetables[key]) timetables[key] = buildTimetable(route);
		return timetables[key];
	}
	// pora dnia: 'auto' (godzina ze scenariusza) albo wybrana godzina; pola w menu i w pauzie są zsynchronizowane
	function hm(str) {
		const [h, m] = String(str || '0:0').split(':').map(Number);
		return ((h || 0) * 60 + (m || 0)) * 60;
	}
	function timeChoice(src) {
		const pre = src === 'pause' ? 'pause-time' : 'opt-time';
		const v = $(pre).value, cv = $(pre + '-custom').value;
		for (const id of ['opt-time', 'pause-time']) {
			$(id).value = v;
			$(id + '-custom').value = cv;
			$(id + '-custom').classList.toggle('hidden', v !== 'custom');
		}
		save('opt.time', v);
		save('opt.timeCustom', cv);
		return v === 'auto' ? null : hm(v === 'custom' ? cv : v);
	}
	// godzina odjazdu z pierwszej stacji dla trasy (z uwzględnieniem wyboru pory dnia)
	function depClock(def) {
		const sec = timeChoice();
		return sec === null ? def.startClock + def.originWait : sec;
	}
	function applyClock(route) {
		if (route.baseClock === undefined) route.baseClock = route.startClock;
		const sec = timeChoice();
		route.startClock = sec === null ? route.baseClock : sec - route.originWait;
	}

	// rekord trasy dla rodzaju składu (EN57 / EU07 + wagony / SM42 + wagony – jak dawniej; inne: seria czołowa)
	function bestKey(route) {
		const c = route.config, lead = c.emu || c.loco;
		const kind = c.emu === 'EN57' ? 'ezt' : route.freight ? 'freight-' + lead : lead === 'EU07' ? 'ic' : lead === 'SM42' ? 'dd' : lead;
		return `best.${route.id}.${kind}`;
	}

	// ---------- menu ----------
	function plural(n, one, few, many) {
		if (n === 1) return one;
		return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
	}

	function buildMenu() {
		// mapy
		const list = $('route-list');
		list.innerHTML = '';
		if (!defs.length) list.innerHTML = '<p class="empty">Brak tras. Wygeneruj trasę z prawdziwej linii w menu „Generator tras”.</p>';
		$('btn-start').disabled = !defs.length;
		for (const d of defs) {
			const stops = d.stations.filter((s) => s.stop !== false).length;
			const b = document.createElement('button');
			b.className = 'route' + (d.id === selected ? ' sel' : '');
			const badge = d.custom ? '<span class="badge custom">wygenerowana</span>' : d.real ? '<span class="badge">rzeczywista</span>' : '';
			const sus = suspectGrades(d);
			const warn = sus ? `<span class="badge warn" title="Pochylenie ${sus.g}‰ na ${sus.len} m od km ${sus.km} – na liniach kolejowych ponad 30‰ prawie nie występuje. Trasa wygenerowana przy błędzie usługi wysokości (NMT): tor w fikcyjnym jarze lub na garbie. Wygeneruj ją ponownie.">⚠ wysokości</span>` : '';
			const el = d.electrified === false ? ' · bez sieci trakcyjnej' : '';
			b.innerHTML = `<h3><span>${esc(d.title)}${badge}${warn}</span><small>poziom: ${esc(d.difficulty)}</small></h3>
				<div class="t">${esc(d.name)}</div>
				<p>${esc(d.desc)}</p>
				<div class="meta">${((d.stations[d.stations.length - 1].pos + 35) / 1000).toFixed(1)} km · ${d.stations.length} stacji (${stops} postojów) · perony ${d.platformLength} m · odjazd ${fmtClock(depClock(d)).slice(0, 5)}${el}</div>
				${d.source ? `<div class="src">${esc(d.source)}</div>` : ''}`;
			b.addEventListener('click', () => { if (d.id !== selected) selectRoute(d.id); });
			list.appendChild(b);
		}
		buildCondTab();
		const def = defById(selected);
		if (!def) { $('summary').innerHTML = ''; $('cars-hint').textContent = ''; return; }
		buildTrainTab(def);
		// podsumowanie (pasek startu) i skróty na zakładkach
		const route = routeFor(def);
		const t = route.train;
		const tab = timetable(route);
		const duration = Math.round(tab[tab.length - 1].arr / 60);
		const best = load(bestKey(route), null);
		const wsel = $('opt-weather'), tsel = $('opt-time');
		const wName = wsel.options[wsel.selectedIndex].text, tName = tsel.value === 'auto' ? fmtClock(depClock(def)).slice(0, 5) : tsel.value === 'custom' ? $('opt-time-custom').value : tsel.value;
		$('summary').innerHTML = `<b>${esc(route.title)}</b> · ${esc(t.name)}${route.freight ? ' (towarowy)' : ''} · ${Math.round(route.trainLength)} m, ${Math.round(t.mass / 1000)} t · odjazd ${tName}, ${wName} · ~<b>${duration} min</b>${best !== null ? ` · rekord: <b>${best}</b>` : ''}`;
		$('sum-map').textContent = def.title;
		$('sum-train').textContent = t.name;
		const tr = Number($('opt-traffic').value);
		$('sum-cond').textContent = `${wName}, ${tName}${tr ? ', ruch ' + ['', 'mały', 'średni', 'duży'][tr] : ''}${$('opt-events').checked ? ', zdarzenia losowe' : ''}`;
		$('sum-help').textContent = [$('opt-ca').checked ? 'czuwak' : '', $('opt-shp').checked ? 'SHP' : '', $('opt-assist').checked ? 'asystent' : '', $('opt-brake').value === 'air' ? 'hamulec zespolony' : '', $('opt-drive').value === 'series' ? 'napęd wg serii' : ''].filter(Boolean).join(', ') || 'bez pomocy';
	}

	// ---------- zakładki ekranu „Gra jednoosobowa” ----------
	let singleTab = load('singleTab', 'map');
	function showTab(name) {
		singleTab = name;
		save('singleTab', name);
		document.querySelectorAll('#single-tabs button').forEach((b) => b.classList.toggle('sel', b.dataset.tab === name));
		for (const t of ['map', 'train', 'cond', 'help']) $('tab-' + t).classList.toggle('hidden', t !== name);
		showPreview();
	}

	/* ---------- zakładka „Pociąg”: rodzaj składu, lokomotywa / zespół, malowania, wagony, skład ----------
	   trainCfg – konfiguracja z katalogu (R.normConfig): { loco, lv, cars: [{ t, v }] } albo { emu, ev, n };
	   trainMode – 'pass' | 'emu' | 'freight' (każdy rodzaj pamięta swój ostatni skład); selCar – zaznaczony pojazd */
	const S = R.STOCK;
	let trainMode = trainCfg.emu ? 'emu' : trainCfg.cars && trainCfg.cars[0] && S[trainCfg.cars[0].t] && S[trainCfg.cars[0].t].kind === 'wagon' ? 'freight' : 'pass';
	const modeCfgs = load('trainCfgs', {});
	let selCar = 0;
	const lastVar = load('lastVariant', {});
	const swatch = (v) => { const c = (v && v.sw) || ['#777', '#999', '#555']; return `<span class="chip">${c.map((x) => `<i style="background:${x}"></i>`).join('')}</span>`; };
	// rodzaj składu z konfiguracji (sama lokomotywa – rodzaj bieżący, o ile nie EZT)
	const modeOf = (c) => (c.emu ? 'emu' : c.cars && c.cars[0] && S[c.cars[0].t] ? (S[c.cars[0].t].kind === 'wagon' ? 'freight' : 'pass') : trainMode === 'emu' ? 'pass' : trainMode);
	// nowy skład: przebudowa menu i podglądu 3D, potem pociąg w tle – z okienkiem wczytywania (menuBusy)
	function setCfg(c, rebuildDemo = true) {
		trainCfg = c;
		modeCfgs[modeOf(c)] = c;
		save('trainCfg', c);
		save('trainCfgs', modeCfgs);
		if (!rebuildDemo || !selected) { buildMenu(); return; }
		menuBusy('Zmiana składu', routeById(selected).train.name, buildMenu);
	}
	let demoT = 0;
	// podgląd 3D z okienkiem wczytywania, gdy trzeba zbudować model (pierwsze otwarcie zakładki „Pociąg”)
	function showPreview() {
		const need = mode === 'menu' && screen === 'single' && singleTab === 'train' && !!selected && (!preview || previewKey !== routeById(selected).configKey);
		if (need) menuBusy('Podgląd składu', routeById(selected).train.name, updatePreview, false);
		else updatePreview();
	}
	function defaultFor(mode) {
		const m = modeCfgs[mode];
		if (m && (mode === 'emu' ? S[m.emu] : S[m.loco])) return m;
		if (mode === 'emu') return { emu: 'EN57', ev: 'retro', n: 1 };
		if (mode === 'freight') return { loco: 'ET22', lv: 'cargo', cars: ['Falns', 'Falns', 'Falns', 'Falns', 'Eaos', 'Eaos', 'Eaos', 'Falns', 'Falns', 'Falns'].map((t) => ({ t, v: 'std' })) };
		return { loco: 'EU07', lv: 'pkp', cars: Array.from({ length: 5 }, () => ({ t: '111A', v: 'pkp' })) };
	}
	function buildTrainTab(def) {
		const c = cfgFor(def), route = routeFor(def), t = route.train;
		// rodzaj składu wynika z konfiguracji (pusty skład towarowy – sama lokomotywa – zostaje w trybie towarowym)
		if (c.emu) trainMode = 'emu';
		else if (trainMode === 'emu' || c.cars.length) trainMode = route.freight ? 'freight' : c.cars.length ? 'pass' : trainMode === 'emu' ? 'pass' : trainMode;
		const electrified = route.electrified;
		document.querySelectorAll('#train-kind button').forEach((b) => b.classList.toggle('sel', b.dataset.kind === trainMode));
		const emu = trainMode === 'emu';
		$('lead-h').textContent = emu ? 'Zespół trakcyjny' : 'Lokomotywa';
		$('consist-hint').textContent = emu ? 'malowanie – w karcie zespołu, liczba zespołów – poniżej' : 'kliknij wagon – zaznaczenie, przeciągnij – kolejność';
		$('wagon-box').classList.toggle('hidden', emu);
		$('units-box').classList.toggle('hidden', !emu);
		// lokomotywy / zespoły
		const ll = $('lead-list');
		ll.innerHTML = '';
		const leadId = emu ? c.emu : c.loco;
		for (const [id, x] of Object.entries(S)) {
			if (x.kind !== (emu ? 'emu' : 'loco')) continue;
			const noWire = x.electric && !electrified;
			const b = document.createElement('button');
			b.className = 'stock' + (id === leadId ? ' sel' : '') + (noWire ? ' off' : '');
			b.title = x.full + (noWire ? ' – linia bez sieci trakcyjnej' : '');
			const v = S[id].variants.find((q) => q.id === (id === leadId ? (emu ? c.ev : c.lv) : lastVar[id])) || x.variants[0];
			b.innerHTML = `<b>${esc(x.name)}</b><small>${x.electric ? 'elektryczna' : 'spalinowa'} · ${x.vmax} km/h · ${x.power} kW</small><span class="sw">${(v.sw || []).map((q) => `<i style="background:${q}"></i>`).join('')}</span>`;
			b.addEventListener('click', () => {
				if (noWire) { hint(`${x.name} potrzebuje sieci trakcyjnej – ta linia jej nie ma.`, true); return; }
				const vv = lastVar[id] || x.variants[0].id;
				selCar = 0;
				setCfg(emu ? { emu: id, ev: vv, n: c.n || 1 } : Object.assign({}, c, { loco: id, lv: vv }));
			});
			ll.appendChild(b);
		}
		// malowania wybranego pojazdu (zaznaczonego w składzie albo lokomotywy / zespołu)
		const selSpec = selCar > 0 && !emu ? c.cars[selCar - 1] : null;
		const lv = $('lead-livery'), cv = $('car-livery');
		lv.innerHTML = cv.innerHTML = '';
		// malowania: rząd próbek kolorów (nazwa w podpowiedzi), nazwa i numer wybranego obok etykiety
		const variantRow = (box, id, cur, pick, extra) => {
			const x = S[id];
			if (!x) return;
			const sel = x.variants.find((v) => v.id === cur) || x.variants[0];
			box.innerHTML = `<div class="lv-head"><span class="lab">${esc(x.name)} – malowanie</span><b>${esc(sel.name)}</b>${sel.num ? `<small>${esc(sel.num)}</small>` : ''}</div>`;
			const row = document.createElement('div');
			row.className = 'lv-row';
			for (const v of x.variants) {
				const b = document.createElement('button');
				b.className = 'lv' + (v.id === cur ? ' sel' : '');
				b.title = v.name + (v.num ? ` (${v.num})` : '');
				b.setAttribute('aria-label', b.title);
				b.innerHTML = swatch(v);
				b.addEventListener('click', () => { lastVar[id] = v.id; save('lastVariant', lastVar); pick(v.id); });
				row.appendChild(b);
			}
			if (extra) row.appendChild(extra);
			box.appendChild(row);
		};
		if (emu) variantRow(lv, c.emu, c.ev, (v) => setCfg(Object.assign({}, c, { ev: v })));
		else variantRow(lv, c.loco, c.lv, (v) => setCfg(Object.assign({}, c, { lv: v })));
		if (selSpec && S[selSpec.t].variants.length > 1) {
			const all = document.createElement('button');
			all.textContent = `Zastosuj do wszystkich ${S[selSpec.t].name}`;
			all.addEventListener('click', () => setCfg(Object.assign({}, c, { cars: c.cars.map((q) => (q.t === selSpec.t ? { t: q.t, v: selSpec.v } : q)) })));
			variantRow(cv, selSpec.t, selSpec.v, (v) => setCfg(Object.assign({}, c, { cars: c.cars.map((q, k) => (k === selCar - 1 ? { t: q.t, v } : q)) })), all);
		}
		// wagony do dołączenia
		const limit = R.consistLimit(def, trainMode === 'freight');
		if (!emu) {
			const wl = $('wagon-list');
			wl.innerHTML = '';
			for (const [id, x] of Object.entries(S)) {
				if (x.kind !== (trainMode === 'freight' ? 'wagon' : 'coach')) continue;
				const b = document.createElement('button');
				b.className = 'stock';
				b.title = x.full + ' – ' + x.desc;
				const v = x.variants.find((q) => q.id === lastVar[id]) || x.variants[0];
				b.innerHTML = `<b>+ ${esc(x.name)}</b><small>${x.len} m · ${x.mass} t · ${x.vmax} km/h</small><span class="sw">${(v.sw || []).map((q) => `<i style="background:${q}"></i>`).join('')}</span>`;
				b.addEventListener('click', () => {
					const next = Object.assign({}, c, { cars: c.cars.concat([{ t: id, v: v.id }]) });
					if (R.trainLengthOf(R.makeConsist(next)) > limit) { hint(`Skład byłby dłuższy niż ${Math.round(limit)} m (${trainMode === 'freight' ? 'najdłuższy skład towarowy' : 'perony tej trasy'}).`, true); return; }
					selCar = next.cars.length;
					setCfg(next);
				});
				wl.appendChild(b);
			}
		} else {
			const U = S[c.emu], sl = $('opt-units');
			let max = 1;
			while (max < (U.maxUnits || 3) && R.trainLengthOf(R.makeConsist({ emu: c.emu, ev: c.ev, n: max + 1 })) <= limit) max++;
			sl.min = 1;
			sl.max = max;
			sl.value = c.n;
			$('opt-units-val').textContent = `${c.n} ${plural(c.n, 'zespół', 'zespoły', 'zespołów')} (${c.n * U.cars.length} wagony)`;
		}
		// skład: pojazdy w skali, malowanie z wariantu; wagony można przeciągać, usuwać (×) i zaznaczać
		const box = $('consist');
		box.innerHTML = '';
		// skala: cały skład w szerokości paska (najwyżej 4 px/m)
		const k = Math.min(4, (Math.max(200, box.clientWidth || 360) - 6 - 2 * t.cars.length) / route.trainLength);
		t.specs.forEach((sp, i) => {
			const e = document.createElement('div');
			const v = S[sp.id].variants.find((q) => q.id === sp.v);
			e.className = 'car' + (i === 0 || (emu && sp.j === 0) ? ' lead' : '') + ((emu ? 0 : i) === selCar ? ' sel' : '');
			e.style.width = t.cars[i] * k + 'px';
			e.innerHTML = ((v && v.sw) || ['#888', '#aaa', '#666']).map((q) => `<i style="background:${q}"></i>`).join('') + `<span class="lbl">${esc(S[sp.id].name)}</span>`;
			e.title = S[sp.id].full + (v ? ' – ' + v.name : '');
			e.addEventListener('click', () => { selCar = emu ? 0 : i; buildMenu(); updatePreview(); });
			if (!emu && i > 0) {
				e.draggable = true;
				e.addEventListener('dragstart', (ev) => { e.classList.add('drag'); ev.dataTransfer.setData('text/plain', String(i - 1)); });
				e.addEventListener('dragend', () => e.classList.remove('drag'));
				e.addEventListener('dragover', (ev) => ev.preventDefault());
				e.addEventListener('drop', (ev) => {
					ev.preventDefault();
					const from = Number(ev.dataTransfer.getData('text/plain')), to = i - 1;
					if (!(from >= 0) || from === to) return;
					const cars = c.cars.slice(), [m] = cars.splice(from, 1);
					cars.splice(to, 0, m);
					selCar = to + 1;
					setCfg(Object.assign({}, c, { cars }));
				});
			}
			box.appendChild(e);
		});
		// pasek akcji zaznaczonego wagonu: przesunięcie w składzie i odczepienie (też klawisz Delete)
		const act = $('car-actions'), wi = selCar - 1;
		act.classList.toggle('hidden', emu || !(wi >= 0 && wi < c.cars.length));
		if (!emu && wi >= 0 && wi < c.cars.length) {
			const sp = t.specs[selCar], v = S[sp.id].variants.find((q) => q.id === sp.v);
			$('ca-name').innerHTML = `<small>wagon ${wi + 1}/${c.cars.length}</small> <b>${esc(S[sp.id].name)}</b>${v ? ' – ' + esc(v.name) : ''}`;
			$('ca-name').title = `Wagon ${wi + 1} z ${c.cars.length}: ${S[sp.id].full}${v ? ' – ' + v.name : ''}`;
			$('ca-left').disabled = wi === 0;
			$('ca-right').disabled = wi === c.cars.length - 1;
		}
		const kw = Math.round(t.maxPower / 1000);
		$('consist-stats').innerHTML = `<div><small>Długość</small><b>${Math.round(route.trainLength)} m</b></div><div><small>Masa</small><b>${Math.round(t.mass / 1000)} t</b></div><div><small>Moc</small><b>${kw} kW</b></div><div><small>V max</small><b>${Math.round(t.vmax * 3.6)} km/h</b></div>`;
		const lead = S[emu ? c.emu : c.loco];
		const ratio = (t.maxPower / 1000) / (t.mass / 1000);
		const notes = [];
		if (!emu && !c.cars.length) notes.push('Sama lokomotywa – dołącz wagony z listy.');
		if (trainMode === 'freight') notes.push(`Skład towarowy do ${Math.round(limit)} m – jedzie bez postojów, zatrzymanie na stacji końcowej.`);
		else notes.push(`Perony tej trasy: ${def.platformLength} m – skład do ${Math.round(limit)} m.`);
		if (!emu && ratio < 4.5 && c.cars.length) notes.push(`Słaba moc na tę masę (${ratio.toFixed(1)} kW/t) – długie rozpędzanie.`);
		if (emu && route.trainLength > limit) notes.push(`${lead.name} (${Math.round(route.trainLength)} m) nie mieści się przy peronach – część składu stanie poza nimi.`);
		hint(notes.join(' '), false);
		$('stock-desc') && ($('stock-desc').textContent = lead.desc);
		updatePreview();
	}
	// akcje zaznaczonego wagonu (pasek pod składem)
	function moveCar(dir) {
		const c = cfgFor(defById(selected)), i = selCar - 1, j = i + dir;
		if (!c.cars || i < 0 || j < 0 || j >= c.cars.length) return;
		const cars = c.cars.slice();
		[cars[i], cars[j]] = [cars[j], cars[i]];
		selCar = j + 1;
		setCfg(Object.assign({}, c, { cars }));
	}
	function detachCar() {
		const c = cfgFor(defById(selected)), i = selCar - 1;
		if (!c.cars || i < 0 || i >= c.cars.length) return;
		const cars = c.cars.filter((_, q) => q !== i);
		selCar = cars.length ? Math.min(i, cars.length - 1) + 1 : 0;
		setCfg(Object.assign({}, c, { cars }));
	}
	function hint(text, warn) {
		const el = $('cars-hint');
		el.textContent = text;
		el.classList.toggle('warn', !!warn);
	}
	// podgląd 3D: tylko na widocznej zakładce „Pociąg” w menu
	let preview = null, previewKey = '';
	function updatePreview() {
		const on = mode === 'menu' && screen === 'single' && singleTab === 'train' && !!selected;
		if (!on) { if (preview) preview.stop(); return; }
		if (!preview) {
			try { preview = new window.Train3D.StockPreview($('stock-view')); } catch (e) { return; }
		}
		const route = routeById(selected), key = route.configKey;
		if (key !== previewKey) { previewKey = key; preview.setTrain(route.train, selCar); } else preview.focus(selCar);
		preview.start();
	}

	// ---------- zakładka „Warunki”: kafelki pogody i pory dnia (wybór w ukrytych listach – te same co w pauzie) ----------
	const WEATHER_SKY = { auto: ['#8fb3d9', '#c9d6e3'], clear: ['#3f8fe0', '#bfe0ff'], cloudy: ['#8a96a3', '#c3cad2'], rain: ['#56606b', '#8c96a0'], fog: ['#b9bec3', '#e1e4e6'], snow: ['#c9d3dd', '#f2f5f8'] };
	const TIME_SKY = { auto: ['#8fb3d9', '#c9d6e3'], '05:20': ['#2b3a63', '#f0a77a'], '08:00': ['#6fa7df', '#e9d3a8'], '12:00': ['#3f8fe0', '#bfe0ff'], '16:00': ['#5d98d6', '#f1d9a6'], '19:50': ['#3a3f73', '#f08a4b'], '23:00': ['#070b18', '#1b2440'], custom: ['#444b5a', '#6d7385'] };
	function tiles(boxId, selId, sky) {
		const box = $(boxId), sel = $(selId);
		box.innerHTML = '';
		for (const o of sel.options) {
			const b = document.createElement('button');
			b.className = o.value === sel.value ? 'sel' : '';
			const [a, z] = sky[o.value] || ['#555', '#777'];
			const m = o.text.match(/^(.*?)\s*\((.*)\)$/);
			b.innerHTML = `<div class="sky" style="background:linear-gradient(${a}, ${z})"></div><b>${esc(m ? m[1] : o.text)}</b>${m ? `<small>${esc(m[2])}</small>` : ''}`;
			b.addEventListener('click', () => { sel.value = o.value; sel.dispatchEvent(new Event('change')); });
			box.appendChild(b);
		}
	}
	function buildCondTab() {
		tiles('weather-tiles', 'opt-weather', WEATHER_SKY);
		tiles('time-tiles', 'opt-time', TIME_SKY);
		document.querySelector('.custom-time').classList.toggle('hidden', $('opt-time').value !== 'custom');
	}
	// pauza: kafelki pogody i pory dnia (te same listy co w menu – zsynchronizowane), nagłówek z bieżącą jazdą
	function buildPause() {
		tiles('pause-weather-tiles', 'pause-weather', WEATHER_SKY);
		tiles('pause-time-tiles', 'pause-time', TIME_SKY);
		$('pause-custom-row').classList.toggle('hidden', $('pause-time').value !== 'custom');
		if (!sim) { $('pause-info').innerHTML = ''; return; }
		const r = sim.route, km = (sim.st.pos / 1000).toFixed(2).replace('.', ',');
		$('pause-info').innerHTML = `<b>${esc(r.title)}</b> · ${fmtClock(r.startClock + sim.time).slice(0, 5)} · km ${km} · ${Math.round(sim.st.v * 3.6)} km/h`;
	}

	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
	}

	// ---------- generator tras (dane rzeczywiste) ----------
	const GEN_EXAMPLES = [];
	let genBusy = false;
	function genLog(text, cls) {
		const box = $('gen-log');
		if (box.querySelector('.muted')) box.innerHTML = '';
		const el = document.createElement('div');
		if (cls) el.className = cls;
		el.textContent = text;
		box.appendChild(el);
		box.scrollTop = box.scrollHeight;
	}
	const exportSel = new Set(); // trasy zaznaczone do eksportu (id)
	function buildGenScreen() {
		const ex = $('gen-examples');
		ex.innerHTML = '';
		for (const e of GEN_EXAMPLES) {
			const b = document.createElement('button');
			b.textContent = `${e.from} → ${e.to}`;
			b.addEventListener('click', () => { $('gen-from').value = e.from; $('gen-to').value = e.to; $('gen-line').value = e.line; });
			ex.appendChild(b);
		}
		const list = $('gen-list');
		list.innerHTML = '';
		const mine = defs.filter((d) => d.custom);
		if (!mine.length) list.innerHTML = '<div class="hint">Brak – wygenerowane trasy pojawią się tutaj i na liście map.</div>';
		// zaznaczenie tras do eksportu (zostaje między odświeżeniami listy; usunięte trasy wypadają)
		for (const id of [...exportSel]) if (!mine.some((d) => d.id === id)) exportSel.delete(id);
		for (const d of mine) {
			const row = document.createElement('div');
			row.className = 'gen-item' + (exportSel.has(d.id) ? ' sel' : '');
			const cb = document.createElement('input');
			cb.type = 'checkbox';
			cb.className = 'gen-sel';
			cb.title = 'Zaznacz do eksportu';
			cb.checked = exportSel.has(d.id);
			cb.addEventListener('change', () => { if (cb.checked) exportSel.add(d.id); else exportSel.delete(d.id); row.classList.toggle('sel', cb.checked); updateExportUI(); });
			const info = document.createElement('div');
			info.style.cssText = 'display:contents';
			info.innerHTML = `<b>${esc(d.title)}</b><span>${((d.stations[d.stations.length - 1].pos - d.stations[0].pos) / 1000).toFixed(1)} km · ${d.stations.length} st.</span>`;
			const play = document.createElement('button');
			play.textContent = 'Wybierz';
			play.addEventListener('click', () => pickRoute(d.id));
			const del = document.createElement('button');
			del.textContent = 'Usuń';
			del.addEventListener('click', () => { forgetRoute(d.id); buildGenScreen(); buildMenu(); });
			// kontrola trasy – raport pod wierszem (ponowne kliknięcie chowa)
			const chk = document.createElement('button');
			chk.textContent = 'Kontrola';
			chk.title = 'Sprawdź trasę: pochylenia, skoki wysokości, łuki, perony, przejazdy, semafory, prędkości, przejazd automatem';
			const rep = document.createElement('div');
			rep.className = 'gen-check hidden';
			chk.addEventListener('click', () => {
				if (!rep.classList.contains('hidden')) { rep.classList.add('hidden'); return; }
				rep.innerHTML = '<span class="hint">Sprawdzanie…</span>';
				rep.classList.remove('hidden');
				setTimeout(() => { rep.innerHTML = checkReport(checkRoute(d)); }, 30);
			});
			row.append(cb, info, play, chk, del);
			list.appendChild(row);
			list.appendChild(rep);
		}
		updateExportUI();
	}
	// kontrola trasy wygenerowanej (skład wybrany w menu); błąd przygotowania trasy – w error
	function checkRoute(def) {
		try { return { list: window.TrainRouteCheck.check(routeFor(def)) }; } catch (e) { return { list: [], error: e.message || String(e) }; }
	}
	function checkReport(rc) {
		if (rc.error) return `<div class="gc-item warn">⚠ ${esc(rc.error)}</div>`;
		if (!rc.list.length) return '<div class="gc-ok">Kontrola trasy: bez błędów i uwag.</div>';
		const w = rc.list.filter((x) => x.lvl === 'warn').length;
		return `<div class="gc-sum">Kontrola trasy: ${w} ${plural(w, 'błąd', 'błędy', 'błędów')}, ${rc.list.length - w} ${plural(rc.list.length - w, 'uwaga', 'uwagi', 'uwag')}</div>` +
			rc.list.map((x) => `<div class="gc-item ${x.lvl}">${x.lvl === 'warn' ? '⚠ ' : ''}km ${(x.pos / 1000).toFixed(2).replace('.', ',')} – ${esc(x.m)}<small>→ ${esc(x.fix)}</small></div>`).join('');
	}
	function updateExportUI() {
		const mine = defs.filter((d) => d.custom), n = mine.filter((d) => exportSel.has(d.id)).length;
		$('gen-export').disabled = n === 0;
		$('gen-export').textContent = n ? `Eksportuj zaznaczone (${n})` : 'Eksportuj zaznaczone';
		const all = $('gen-sel-all');
		all.disabled = !mine.length;
		all.checked = mine.length > 0 && n === mine.length;
		all.indeterminate = n > 0 && n < mine.length;
	}
	/* ---------- import i eksport tras ----------
	   Plik .trasa: JSON { format: 'maszynista-trasa', v: 1, app, exported, routes: [def, …] } skompresowany gzip
	   (CompressionStream; bez niego – zwykły JSON). Import przyjmuje .trasa (gzip albo JSON), .json (ten format albo
	   sam opis trasy) i pliki tras z narzędzia (routes/*.js: opis trasy w wywołaniu funkcji). */
	const TRASA = 'maszynista-trasa';
	function ioMsg(html) { $('gen-io-msg').innerHTML = html; }
	const fileSafe = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
	async function gzip(text) {
		if (typeof CompressionStream === 'undefined') return null;
		const s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
		return new Blob([await new Response(s).arrayBuffer()], { type: 'application/gzip' });
	}
	async function exportRoutes(list) {
		if (!list.length) { ioMsg('<span class="err">Brak wygenerowanych tras do eksportu.</span>'); return; }
		const pack = { format: TRASA, v: 1, app: $('version') ? $('version').textContent.trim() : '', exported: new Date().toISOString(), routes: list.map(plain) };
		const json = JSON.stringify(pack);
		const blob = (await gzip(json)) || new Blob([json], { type: 'application/json' });
		const name = (list.length === 1 ? fileSafe(list[0].title || list[0].id) : `trasy-${list.length}`) + '.trasa';
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 30000);
		ioMsg(`<span class="ok">Zapisano ${esc(name)} (${(blob.size / 1024 / 1024).toFixed(2)} MB${list.length > 1 ? `, ${list.length} tras` : ''}).</span>`);
	}
	// opisy tras z zawartości pliku (bajty)
	async function routesFromFile(name, bytes) {
		let text;
		if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
			if (typeof DecompressionStream === 'undefined') throw new Error('ta przeglądarka nie rozpakowuje plików .trasa');
			const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
			text = await new Response(s).text();
		} else text = new TextDecoder().decode(bytes);
		text = text.replace(/^﻿/, '').trim();
		let obj;
		if (text.startsWith('{') || text.startsWith('[')) obj = JSON.parse(text);
		else {
			// plik trasy z narzędzia: (function (def) {…})({…});
			const a = text.indexOf('})({'), b = text.lastIndexOf('});');
			if (a < 0 || b < a) throw new Error('nie rozpoznano formatu pliku');
			obj = JSON.parse(text.slice(a + 3, b + 1));
		}
		const list = obj && obj.format === TRASA ? obj.routes : Array.isArray(obj) ? obj : [obj];
		if (!Array.isArray(list) || !list.length) throw new Error('plik nie zawiera tras');
		return list;
	}
	async function importFiles(files) {
		const done = [], errs = [];
		for (const f of files) {
			let list;
			try { list = await routesFromFile(f.name, new Uint8Array(await f.arrayBuffer())); } catch (e) { errs.push(`${f.name}: ${e.message}`); continue; }
			for (const raw of list) {
				const def = Object.assign({}, raw);
				try {
					if (!def || !def.id || !Array.isArray(def.stations) || def.stations.length < 2) throw new Error('brak opisu trasy (stacje)');
					R.prepare(def, { train: 'ezt', cars: 1 }); // trasa, której silnik nie przyjmie, nie trafia na listę
				} catch (e) { errs.push(`${f.name}${def && def.title ? ' – ' + def.title : ''}: ${e.message}`); continue; }
				// kopia trasy dołączonej do gry – osobna pozycja na liście
				if (BUILTIN.has(def.id)) { def.id += '-imp'; def.title = (def.title || def.name || def.id) + ' (import)'; }
				const old = defs.findIndex((d) => d.id === def.id);
				if (old >= 0 && !confirm(`Trasa „${def.title || def.id}” już jest na liście. Zastąpić ją importowaną?`)) continue;
				def.custom = true;
				if (old >= 0) defs[old] = def; else defs.push(def);
				for (const k of Object.keys(prepared)) if (k.startsWith(def.id + '|')) delete prepared[k];
				for (const k of Object.keys(timetables)) if (k.startsWith(def.id + '|')) delete timetables[k];
				try { await routeDB.put(plain(def)); } catch (e) { errs.push(`${def.title}: zapis tylko do końca sesji (brak miejsca w pamięci)`); }
				done.push(def);
			}
		}
		if (!$('scr-gen').classList.contains('hidden')) buildGenScreen();
		buildMenu();
		ioMsg((done.length ? `<span class="ok">Zaimportowano: ${done.map((d) => esc(d.title || d.id)).join(', ')}.</span>` : '') + errs.map((m) => `<div class="err">${esc(m)}</div>`).join(''));
		if (done.length === 1 && $('scr-gen').classList.contains('hidden')) pickRoute(done[0].id);
		return done;
	}

	// trasa z generatora: przejście do gry jednoosobowej z okienkiem wczytywania (jak przy wyborze trasy w menu)
	function pickRoute(id) {
		trainCfg = cfgFor(defById(id));
		menuScreen('single');
		selectRoute(id);
	}
	async function runGenerator() {
		if (genBusy) return;
		const from = $('gen-from').value.trim(), to = $('gen-to').value.trim(), line = $('gen-line').value.trim();
		if (!from || !to) { genLog('Wpisz stację początkową i końcową.', 'err'); return; }
		genBusy = true;
		$('gen-run').disabled = true;
		$('gen-log').innerHTML = '';
		const t0 = performance.now();
		try {
			const dem = $('gen-env').checked && $('gen-dem').checked;
			const surface = dem && $('gen-nmpt').checked ? await nmptSurface() : undefined;
			const official = $('gen-official').checked;
			const def = await window.TrainOSM.generate({ from, to, line: line || null, environment: $('gen-env').checked ? undefined : false, dem: dem ? undefined : false, surface, bdot: official ? undefined : false, plk: official ? undefined : false, fileCache: fileDB, log: (m) => genLog(m) });
			// próba przygotowania trasy w grze (wyłapuje dane, których silnik nie przyjmie)
			R.prepare(def, { train: 'ezt', cars: 1 });
			def.custom = true;
			// ta sama trasa wygenerowana ponownie zastępuje poprzednią; nie nadpisujemy tras dołączonych do gry
			if (BUILTIN.has(def.id)) def.id += '-gen';
			const old = defs.findIndex((d) => d.id === def.id);
			if (old >= 0) defs[old] = def; else defs.push(def);
			for (const k of Object.keys(prepared)) if (k.startsWith(def.id + '|')) delete prepared[k];
			for (const k of Object.keys(timetables)) if (k.startsWith(def.id + '|')) delete timetables[k];
			let stored = true;
			try { await routeDB.put(plain(def)); } catch (e) { stored = false; }
			genLog(`Zapisano trasę „${def.title}” (${((performance.now() - t0) / 1000).toFixed(0)} s)${stored ? '' : ' – tylko do końca sesji (brak miejsca w pamięci przeglądarki)'} – jest na liście „Wygenerowane trasy”.`, 'ok');
			// trasa trafia na listę „Wygenerowane trasy” (tam „Wybierz”); w przebiegu – tylko ostrzeżenia do sprawdzenia
			for (const x of (def.issues || []).filter((q) => q.lvl === 'warn')) genLog(`⚠ km ${(x.pos / 1000).toFixed(2)}: ${x.m}`, 'err');
			// kontrola trasy (js/route-check.js): błędy danych, przejazd automatem
			const rc = checkRoute(def);
			if (rc.error) genLog('Kontrola trasy: ' + rc.error, 'err');
			else {
				const w = rc.list.filter((x) => x.lvl === 'warn');
				genLog(`Kontrola trasy: ${w.length ? `${w.length} ${plural(w.length, 'błąd', 'błędy', 'błędów')}` : 'bez błędów'}${rc.list.length - w.length ? `, ${rc.list.length - w.length} ${plural(rc.list.length - w.length, 'uwaga', 'uwagi', 'uwag')}` : ''}.`, w.length ? 'err' : 'ok');
				for (const x of w) genLog(`⚠ km ${(x.pos / 1000).toFixed(2)}: ${x.m}`, 'err');
			}
			buildGenScreen();
			buildMenu();
		} catch (e) {
			genLog(e.message || String(e), 'err');
		} finally {
			genBusy = false;
			$('gen-run').disabled = false;
		}
	}

	/* Wybór mapy z okienkiem wczytywania: przygotowanie trasy, rozkład jazdy (przejazd automatem) i budowa świata
	   podglądu idą etapami z odświeżeniem okna między nimi (bez zamrożenia menu); pasek – postęp doczytywania
	   kawałków świata. Kolejny wybór przerywa poprzedni. */
	let loadSeq = 0;
	// następna klatka (odświeżenie okienka) – albo najwyżej 120 ms, gdy okno jest ukryte i klatki stoją
	const nextFrame = () => new Promise((res) => {
		let done = false;
		const go = () => { if (!done) { done = true; setTimeout(res, 0); } };
		requestAnimationFrame(go);
		setTimeout(go, 120);
	});
	// head – nagłówek okienka (domyślnie „Wczytywanie trasy”; zmiana składu i warunków – własny)
	function routeLoading(step, frac, title, head) {
		const box = $('route-loading');
		if (step === null) { box.classList.add('hidden'); return; }
		box.classList.remove('hidden');
		if (title !== undefined) { $('rl-title').textContent = title; $('rl-head').textContent = head || 'Wczytywanie trasy'; }
		$('rl-step').textContent = step;
		$('rl-fill').style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
	}
	async function selectRoute(id) {
		const seq = ++loadSeq, def = defById(id);
		const live = () => seq === loadSeq && mode === 'menu';
		// przerwane (inny wybór albo start gry) – okienko znika, chyba że wyświetla je już nowszy wybór
		const quit = () => { if (seq === loadSeq) routeLoading(null); };
		selected = id;
		save('route', selected);
		routeLoading('Przygotowanie trasy…', 0.05, def.title);
		await nextFrame();
		if (!live()) return quit();
		buildMenu();
		routeLoading('Rozkład jazdy…', 0.25);
		await nextFrame();
		if (!live()) return quit();
		timetable(routeById(id));
		routeLoading('Budowa świata…', 0.45);
		await nextFrame();
		if (!live()) return quit();
		startDemo();
		await worldNear(live, 0.45);
		if (seq !== loadSeq) return;
		routeLoading('Gotowe', 1);
		setTimeout(() => { if (seq === loadSeq) routeLoading(null); }, 250);
	}
	// doczytywanie kawałków świata podglądu przy pociągu (najwyżej ok. 20 s – potem okienko i tak znika); pasek od f0 do 1
	async function worldNear(live, f0) {
		let total = 0;
		for (let k = 0; k < 1200 && live(); k++) {
			await nextFrame();
			// czekamy na kawałki przy pociągu (dalsze dobudowują się po jednym na klatkę już po zamknięciu okienka)
			const p = renderer.world ? renderer.world.pendingNear || 0 : 0;
			total = Math.max(total, p);
			if (k > 2 && p === 0) break;
			if (total) routeLoading(`Budowa świata… (${total - p} z ${total})`, f0 + (1 - f0) * (1 - p / total));
		}
	}
	/* Zmiana w menu „Gra jednoosobowa” (skład, warunki, pierwsze otwarcie podglądu): okienko jak przy wyborze trasy,
	   blokujące menu na czas przebudowy – najpierw okienko się rysuje, potem praca etapami z odświeżeniem między nimi:
	   work() (lista, podsumowanie, model podglądu 3D), pierwsze rysowanie podglądu (kompilacja shaderów), pociąg
	   w tle (demo: model w scenie, świat) – gdy demo. Kolejna zmiana (albo wybór trasy) przerywa poprzednią. */
	async function menuBusy(head, title, work, demo = true) {
		const seq = ++loadSeq;
		const live = () => seq === loadSeq && mode === 'menu';
		const quit = () => { if (seq === loadSeq) routeLoading(null); };
		clearTimeout(demoT);
		routeLoading('Przygotowanie…', 0.1, title, head);
		await nextFrame();
		if (!live()) return quit();
		work();
		routeLoading('Podgląd…', 0.35);
		await nextFrame();
		await nextFrame();
		if (!live()) return quit();
		if (demo) {
			routeLoading('Pociąg w tle…', 0.6);
			await nextFrame();
			if (!live()) return quit();
			startDemo();
			await worldNear(live, 0.6);
			if (!live()) return quit();
		}
		routeLoading('Gotowe', 1);
		setTimeout(() => { if (seq === loadSeq) routeLoading(null); }, 150);
	}

	function startDemo() {
		// bez tras: menu bez podglądu jazdy w tle
		if (!defs.length || !selected) { demo = null; return; }
		const route = routeById(selected);
		applyClock(route);
		demo = new Sim(route, { czuwak: false, timetable: timetable(route) });
		renderer.assist = false; // bez znacznika drogi hamowania w podglądzie (w grze ustawia go startGame)
		demo.time = route.originWait - 6; // demo rusza niemal od razu
		renderer.reset(demo);
	}

	function showOverlay(id) {
		for (const o of ['menu', 'pause', 'end', 'settings', 'saves']) $(o).classList.toggle('hidden', o !== id);
	}

	// ekrany menu głównego: 'main' | 'single'
	let screen = 'main';
	function menuScreen(name) {
		screen = name;
		$('scr-main').classList.toggle('hidden', name !== 'main');
		$('scr-single').classList.toggle('hidden', name !== 'single');
		$('scr-gen').classList.toggle('hidden', name !== 'gen');
		$('scr-news').classList.toggle('hidden', name !== 'news');
		$('scr-scen').classList.toggle('hidden', name !== 'scen');
		$('scr-hist').classList.toggle('hidden', name !== 'hist');
		showPreview();
	}

	// ustawienia otwierane z menu albo z pauzy – „Wróć” prowadzi tam, skąd przyszliśmy
	let settingsFrom = 'menu';
	function openSettings(from) {
		settingsFrom = from;
		const gpu = renderer.gpuName();
		$('gpu-info').textContent = gpu ? 'Karta graficzna: ' + gpu : '';
		showOverlay('settings');
	}
	function closeSettings() {
		showOverlay(settingsFrom);
	}

	const QUALITY_HINT = {
		low: 'Bez efektów po renderowaniu, rzadsza roślinność, mniej opadów – dla słabszych komputerów.',
		medium: 'Bloom (poświata świateł), wygładzanie krawędzi, cienie 2048.',
		high: 'Dodatkowo okluzja otoczenia, mgła wysokościowa, promienie słońca, cienie 4096, gęsta roślinność.',
	};

	/* Zapowiedź (sim.js announce): gong, tekst (toast) i – w ustawieniu „głos” – synteza mowy przeglądarki (głos polski,
	   jeśli jest); przy wyciszeniu – tylko tekst */
	function announce(text) {
		const how = $('set-announce').value;
		if (how === 'off') return;
		audio.play('chime');
		hud.toast(text, 'announce');
		if (how !== 'voice' || muted || mode !== 'play') return;
		// po gongu (ok. 1,4 s); Piper – synteza od razu, odtworzenie nie wcześniej niż po gongu
		if (voiceEngine() === 'piper') speakPiper(text, performance.now() + 1400);
		else setTimeout(() => speak(text), 1400);
	}
	const voiceEngine = () => ($('set-voice-engine').value === 'piper' && window.TrainPiper && window.Worker ? 'piper' : 'system');
	/* Piper (js/tts-piper.js): wybrany głos wczytywany (przy pierwszym użyciu – pobierany) w tle, z postępem w ustawieniach;
	   do czasu wczytania zapowiedzi czyta głos systemu. Próbki odtwarza silnik dźwięku gry (audio.playVoice) – szyna
	   „Głos zapowiedzi”; tempo – długość z syntezy, wysokość – szybkość odtwarzania (z kompensacją długości). */
	let piperErr = null;
	function piperLoad() {
		const TP = window.TrainPiper, id = $('set-voice').value;
		if (!TP || !id || TP.loaded === id || TP.loading === id) return TP && TP.loaded === id ? Promise.resolve() : null;
		const name = (TP.VOICES.find((v) => v.id === id) || {}).name || id;
		piperErr = null;
		voiceStatus(`Piper: wczytywanie głosu ${name}…`);
		const done = {};
		return TP.load(id, (p) => {
			done[p.what] = p;
			const mb = (x) => Math.round(x / 1048576);
			voiceStatus(`Piper: pobieranie ${p.what} – ${mb(p.loaded)}${p.total ? ' / ' + mb(p.total) : ''} MB (tylko za pierwszym razem)`);
		}).then(() => {
			voiceStatus(`Piper: głos ${name} gotowy.`);
			fillVoices();
		}, (e) => {
			piperErr = e.message;
			voiceStatus(`Piper: nie udało się wczytać głosu – ${e.message} Zapowiedzi czyta głos systemu.`, true);
		});
	}
	function voiceStatus(text, err) {
		const el = $('voice-status');
		el.textContent = text || '';
		el.classList.toggle('err', !!err);
	}
	async function speakPiper(text, at) {
		const TP = window.TrainPiper, id = $('set-voice').value;
		if (!TP || TP.loaded !== id) {
			piperLoad();
			setTimeout(() => speak(text), Math.max(0, at - performance.now())); // jeszcze nie gotowy – głos systemu
			return;
		}
		const rate = Number($('set-voice-rate').value) || 1, pitch = Number($('set-voice-pitch').value) || 1;
		try {
			const r = await TP.synth(text, pitch / rate);
			setTimeout(() => { if (!muted && $('set-announce').value === 'voice') audio.playVoice(r.pcm, r.sampleRate, pitch); }, Math.max(0, at - performance.now()));
		} catch (e) {
			console.warn('Piper:', e);
			setTimeout(() => speak(text), Math.max(0, at - performance.now()));
		}
	}
	/* synteza mowy: głos wybrany w ustawieniach (nazwa głosu systemu; brak – pierwszy polski), tempo, wysokość,
	   głośność (ogólna × „Głos zapowiedzi”) */
	function pickVoice() {
		const sp = window.speechSynthesis, list = sp ? sp.getVoices() : [], name = $('set-voice').value;
		return (name && list.find((x) => x.name === name)) || list.find((x) => /^pl/i.test(x.lang)) || null;
	}
	const speaking = new Set();
	let speechCut = 0; // czas świadomego przerwania mowy (cancel) – wtedy bez dokańczania
	function stopSpeech() {
		speechCut = performance.now();
		if (window.speechSynthesis) window.speechSynthesis.cancel();
		audio.stopVoice();
	}
	/* tries – ile razy już dokańczano; przeglądarka bywa, że kończy wypowiedź przedwcześnie (Brave: przy kliknięciu
	   i obracaniu kamery) – gdy gra jej nie przerywała, a zostało więcej niż jedno słowo, reszta czytana od ostatniego
	   słowa (najwyżej 3 razy) */
	function speak(text, tries = 0) {
		const sp = window.speechSynthesis;
		if (!sp) return;
		const u = new SpeechSynthesisUtterance(text);
		const v = pickVoice();
		u.lang = v ? v.lang : 'pl-PL';
		if (v) u.voice = v;
		u.rate = Number($('set-voice-rate').value) || 0.95;
		u.pitch = Number($('set-voice-pitch').value) || 1;
		u.volume = Math.min(1, (Number($('set-volume').value) / 100) * (Number($('set-mix-voice').value) / 100) * 1.2);
		/* odwołanie do wypowiedzi do jej końca – w Chromium (przeglądarka, Electron) wypowiedź bez odwołania bywa zwalniana
		   przez odśmiecanie pamięci w trakcie czytania i mowa urywa się (np. przy kliknięciu, gdy gra tworzy nowe obiekty) */
		speaking.add(u);
		let at = 0;
		const t0 = performance.now();
		u.onboundary = (e) => { at = e.charIndex; };
		u.onend = u.onerror = (e) => {
			speaking.delete(u);
			if (speechCut > t0 || tries >= 3 || $('set-announce').value !== 'voice' || muted) return;
			const rest = text.slice(at).trim();
			// zostało więcej niż jedno słowo (przy zwykłym końcu ostatnie zdarzenie słowa wskazuje ostatnie słowo)
			if (at > 0 && /\s/.test(rest)) {
				console.info(`Synteza mowy: wypowiedź urwana (${e.type}${e.error ? ' ' + e.error : ''}) po ${at}/${text.length} znakach – dokańczam.`);
				setTimeout(() => speak(rest, tries + 1), 150);
			}
		};
		sp.speak(u);
	}
	// lista głosów systemu (polskie; z opcją – wszystkie); pierwsza pozycja – automatycznie (pierwszy polski)
	function fillVoices() {
		const sp = window.speechSynthesis, sel = $('set-voice');
		const piper = voiceEngine() === 'piper';
		$('voice-all-row').classList.toggle('hidden', piper);
		if (piper) {
			const TP = window.TrainPiper, want = load('opt.voice', {}).piper || TP.VOICES[0].id;
			const fill = (have) => {
				sel.innerHTML = '';
				for (const v of TP.VOICES) {
					const o = document.createElement('option');
					o.value = v.id;
					o.textContent = `${v.name}${have[v.id] ? '' : ` – do pobrania (${TP.SIZE_MB} MB)`}`;
					sel.appendChild(o);
				}
				sel.value = TP.VOICES.some((v) => v.id === want) ? want : TP.VOICES[0].id;
			};
			fill({});
			TP.cached().then(fill, () => {});
			return;
		}
		if (!sp) { sel.innerHTML = '<option value="">synteza mowy niedostępna</option>'; return; }
		const want = load('opt.voice', {}).name || sel.value || '';
		const all = $('set-voice-all').checked;
		const list = sp.getVoices().filter((x) => all || /^pl/i.test(x.lang) || x.name === want);
		sel.innerHTML = '';
		const auto = document.createElement('option');
		auto.value = '';
		auto.textContent = 'automatycznie (pierwszy polski)';
		sel.appendChild(auto);
		for (const v of list) {
			const o = document.createElement('option');
			o.value = v.name;
			o.textContent = `${v.name.replace(/^Microsoft /, '').replace(/ - .*$/, '')} (${v.lang}${v.localService ? '' : ', online'})`;
			sel.appendChild(o);
		}
		sel.value = list.some((x) => x.name === want) ? want : '';
	}

	const MIX_KEYS = ['train', 'horn', 'amb', 'sig', 'voice'];
	function applySettings() {
		const vol = Number($('set-volume').value) / 100;
		$('set-volume-val').textContent = Math.round(vol * 100) + '%';
		muted = !$('set-sound').checked;
		audio.setMuted(muted);
		audio.setVolume(vol);
		// głośność grup dźwięków
		const mix = {};
		for (const k of MIX_KEYS) {
			const el = $('set-mix-' + k);
			mix[k] = Number(el.value) / 100;
			el.nextElementSibling.textContent = el.value + '%';
		}
		audio.setMix(mix);
		save('opt.mix', mix);
		const opts = { scale: Number($('set-scale').value), aa: $('set-aa').checked, shadows: $('set-shadows').checked };
		renderer.setRenderOptions(opts);
		$('fps').classList.toggle('hidden', !$('set-fps').checked);
		// pociągi tła: limit rysowanych naraz i szczegóły (nowe modele – od następnego pojawienia się pociągu)
		renderer.life.limit = Number($('set-traffic-max').value) || 3;
		renderer.life.details = $('set-traffic-people').checked;
		save('opt.trafficMax', renderer.life.limit);
		save('opt.trafficPeople', renderer.life.details);
		save('muted', muted);
		save('opt.volume', vol);
		save('opt.render', opts);
		save('opt.fps', $('set-fps').checked);
		save('opt.announce', $('set-announce').value);
		if ($('set-announce').value !== 'voice') stopSpeech();
		// głos zapowiedzi: ustawienia widoczne przy „gong, tekst i głos”
		$('voice-opts').classList.toggle('hidden', $('set-announce').value !== 'voice');
		const vr = $('set-voice-rate'), vp = $('set-voice-pitch');
		vr.nextElementSibling.textContent = '×' + Number(vr.value).toFixed(2).replace('.', ',');
		vp.nextElementSibling.textContent = Number(vp.value).toFixed(2).replace('.', ',');
		const vprev = load('opt.voice', {}), piper = voiceEngine() === 'piper';
		save('opt.voice', {
			engine: $('set-voice-engine').value, name: piper ? vprev.name || '' : $('set-voice').value, piper: piper ? $('set-voice').value : vprev.piper,
			all: $('set-voice-all').checked, rate: Number(vr.value), pitch: Number(vp.value),
		});
	}

	// ---------- zapisane gry: autozapis i 5 miejsc w localStorage (maszynista.save.auto, save.1 … save.5) ----------
	const SLOT_IDS = ['auto', 1, 2, 3, 4, 5], SAVE_V = 1;
	let savesFrom = 'menu';
	const readSave = (n) => load('save.' + n, null);
	// odcisk trasy: zapis z trasy wygenerowanej od tego czasu ponownie (inne stacje, semafory, długość) jest odrzucany
	const routeSig = (r) => [r.stations.length, r.signals.length, r.crossings.length, Math.round(r.length)].join('|');
	function saveProblem(d) {
		if (!d || d.v !== SAVE_V || !d.sim) return 'Zapis w nieznanym formacie.';
		if (!defs.some((x) => x.id === d.route)) return 'Tej trasy nie ma w grze (usunięta albo jeszcze się wczytuje).';
		return null;
	}
	function savesMsg(text, kind) {
		$('saves-msg').innerHTML = text ? `<span class="${kind}">${esc(text)}</span>` : '';
	}
	function openSaves(from) {
		savesFrom = from;
		savesMsg('');
		buildSaves();
		showOverlay('saves');
	}
	function closeSaves() {
		if (savesFrom === 'pause') buildPause();
		showOverlay(savesFrom);
	}
	// przycisk z potwierdzeniem (nadpisanie, usunięcie, porzucenie bieżącej jazdy): pierwsze kliknięcie – „Na pewno?”
	function slotBtn(text, fn, confirm, cls) {
		const b = document.createElement('button');
		b.textContent = text;
		if (cls) b.className = cls;
		let armed = 0;
		b.addEventListener('click', () => {
			if (confirm && !armed) {
				b.textContent = 'Na pewno?';
				b.classList.add('confirm');
				armed = setTimeout(() => { armed = 0; b.textContent = text; b.classList.remove('confirm'); }, 3000);
				return;
			}
			clearTimeout(armed);
			fn();
		});
		return b;
	}
	function buildSaves() {
		const canSave = savesFrom === 'pause' && !!sim && sim.status === 'running';
		$('saves-title').textContent = canSave ? 'Zapisz / wczytaj grę' : 'Wczytaj grę';
		$('saves-hint').textContent = (canSave
			? 'Zapis obejmuje stan jazdy: miejsce na trasie, prędkość, nastawnik, drzwi, pantograf, rozkład, punkty i kary, pogodę i porę dnia.'
			: 'Wybierz zapis, aby jechać dalej od zapisanego miejsca.') + ' Autozapis – przy każdym odjeździe ze stacji, wyjściu do menu i zamknięciu gry.';
		const list = $('save-list');
		list.innerHTML = '';
		for (const id of SLOT_IDS) {
			const auto = id === 'auto', d = readSave(id), why = d && saveProblem(d);
			const el = document.createElement('div');
			el.className = 'save-slot ' + (d ? 'used' : 'empty') + (auto ? ' auto' : '');
			const icon = auto ? '<i title="Autozapis">A</i>' : `<i>${id}</i>`;
			if (d) {
				const when = new Date(d.saved).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
				const km = Number(d.km || 0).toFixed(2).replace('.', ',');
				el.innerHTML = `${icon}<div class="sd"><b>${auto ? 'Autozapis: ' : ''}${esc(d.title)} · ${esc(d.train)}</b><span>km ${km} · godz. ${fmtClock(d.clock || 0).slice(0, 5)} · ${Number(d.score) || 0} pkt${d.next ? ' · dalej: ' + esc(d.next) : ''}</span><span${why ? ' class="err"' : ''}>${why ? esc(why) : 'zapisano ' + esc(when)}</span></div><div class="sb"></div>`;
			} else el.innerHTML = `${icon}<div class="sd"><b>${auto ? 'Autozapis – pusty' : 'Puste miejsce'}</b></div><div class="sb"></div>`;
			const sb = el.querySelector('.sb');
			// autozapis robi tylko gra – bez ręcznego zapisu w to miejsce
			if (canSave && !auto) sb.appendChild(slotBtn(d ? 'Nadpisz' : 'Zapisz', () => saveGame(id), !!d, 'primary'));
			if (d) {
				const ld = slotBtn('Wczytaj', () => loadGame(id), canSave, canSave ? '' : 'primary');
				ld.disabled = !!why;
				if (canSave) ld.title = 'Bieżąca jazda bez zapisu przepadnie';
				sb.appendChild(ld);
				sb.appendChild(slotBtn('Usuń', () => {
					try { localStorage.removeItem('maszynista.save.' + id); } catch (e) { /* brak dostępu */ }
					buildSaves();
					savesMsg(auto ? 'Usunięto autozapis.' : `Usunięto zapis z miejsca ${id}.`, 'ok');
				}, true));
			}
			list.appendChild(el);
		}
	}
	// zapis bieżącej jazdy w miejscu id ('auto' albo 1…5); false – brak jazdy albo brak miejsca w pamięci
	function writeSave(id) {
		if (!sim || sim.status !== 'running') return false;
		const r = sim.route, nx = r.stations[sim.next];
		const data = {
			v: SAVE_V, saved: Date.now(),
			route: r.id, title: r.title, train: r.train.name, cfg: r.config, cfgKey: r.configKey, sig: routeSig(r),
			startClock: r.startClock, weather: rideWeather || $('opt-weather').value, ca: !!sim.opts.czuwak, assist: !!renderer.assist, timeScale,
			scen: scen ? scen.id : null, events: rideEvents, brake: sim.opts.brake, shp: !!sim.opts.shp, drive: sim.opts.drive, season: sim.opts.season,
			traffic: rideTraffic ? rideTraffic.level : 0, trafficSeed: rideTraffic ? rideTraffic.seed : 1, trafficPen: !!sim.opts.trafficPenalty, dispatch: !!sim.opts.dispatch,
			timetable: sim.timetable, ttEnergy: sim.timetable && sim.timetable.energy,
			km: sim.st.pos / 1000, clock: sim.clock(), score: sim.score(), next: nx ? nx.name : null,
			sim: sim.snapshot(),
		};
		try { localStorage.setItem('maszynista.save.' + id, JSON.stringify(data)); } catch (e) { return false; }
		return true;
	}
	function autoSave() {
		if (mode !== 'loading') writeSave('auto'); // w czasie wczytywania jazda jeszcze nie ruszyła – zostaje poprzedni autozapis
	}
	function saveGame(id) {
		if (!sim || sim.status !== 'running') { savesMsg('Zapis jest możliwy tylko w czasie jazdy.', 'err'); return; }
		if (!writeSave(id)) { savesMsg('Nie udało się zapisać – brak miejsca w pamięci przeglądarki albo brak dostępu.', 'err'); return; }
		buildSaves();
		savesMsg(`Zapisano grę w miejscu ${id}.`, 'ok');
	}
	function loadGame(n) {
		const d = readSave(n), why = saveProblem(d);
		if (why) { savesMsg(why, 'err'); return; }
		const sc = d.scen ? (d.scen.startsWith('daily-') ? dailyFor(d.scen.slice(6)) : SCENARIOS.find((x) => x.id === d.scen)) : null;
		if (d.scen && !sc) { savesMsg('Nie można wczytać zapisu: scenariusz już nie istnieje.', 'err'); return; }
		const prevCfg = trainCfg;
		trainCfg = d.cfg;
		try {
			const route = routeFor(defById(d.route));
			if (route.configKey !== d.cfgKey || routeSig(route) !== d.sig || !Array.isArray(d.timetable) || d.timetable.length !== route.stations.length) {
				throw new Error('trasa albo skład zmieniły się od zapisu.');
			}
			Sim.restore(route, { timetable: d.timetable }, d.sim); // próba – błąd zostaje w tym oknie, bez przerywania gry
		} catch (e) {
			trainCfg = prevCfg;
			savesMsg('Nie można wczytać zapisu: ' + e.message, 'err');
			return;
		}
		scen = sc || null;
		if (scen) trainCfg = prevCfg; // scenariusz ma własny skład – wybór w menu bez zmian
		else {
			// zapis staje się bieżącym wyborem w menu (trasa, skład, warunki)
			selected = d.route;
			trainMode = modeOf(trainCfg);
			save('route', selected);
		}
		$('opt-ca').checked = d.ca;
		$('opt-assist').checked = d.assist;
		$('opt-weather').value = $('pause-weather').value = d.weather || 'auto';
		pauseFromFree = false;
		audio.silence();
		startGame(d);
	}

	function quitApp() {
		if (window.desktop && window.desktop.quit) window.desktop.quit();
		else window.close();
	}

	function toMenu() {
		if (sim) autoSave(); // przerwana jazda (z pauzy) – do autozapisu; po końcu trasy zapis się nie zmienia
		exitFree();
		mode = 'menu';
		renderer.inputEnabled = false;
		renderer.rotKey = 0;
		renderer.resetView();
		sim = null;
		audio.silence();
		$('hud').classList.add('hidden');
		$('btn-pause').classList.add('hidden');
		$('prompt').classList.add('hidden');
		$('toasts').innerHTML = '';
		showOverlay('menu');
		menuScreen('main');
		buildMenu();
		startDemo();
	}

	/* Start jazdy z ekranem wczytywania (js/screens.js): ekran z trasą i składem, po dwóch klatkach (ekran zdąży się
	   narysować) budowa jazdy (beginGame), potem tryb „loading” – świat wokół pociągu dobudowuje się, symulacja stoi;
	   gdy nie ma już kawałków do zbudowania (i minęło kilka klatek na kompilację shaderów) – jazda (finishLoading). */
	let loadingScreen = null, loadingFrames = 0, resumed = false;
	// kompilacja shaderów na ekranie wczytywania: 0 – nie zaczęta, 1 – trwa, 2 – gotowa
	let precompiled = 0;
	// snap – zapis gry (loadGame): jazda od zapisanego miejsca zamiast od początku trasy
	function startGame(snap) {
		if (!(snap && snap.sim)) snap = null;
		if (!defs.length || !selected) { menuScreen('gen'); buildGenScreen(); return; } // bez tras – do generatora
		if (mode === 'loading') return;
		const def = rideDef(), route = rideRoute(), t = route.train;
		const dep = snap ? snap.clock : scen ? hm(scen.clock) : depClock(def), h = Math.floor(dep / 3600) % 24;
		const wsel = $('opt-weather'), wKey = snap ? snap.weather : scen ? scen.weather : wsel.value;
		const wName = (wsel.querySelector(`option[value="${wKey}"]`) || wsel.options[wsel.selectedIndex]).text;
		const kind = scen ? 'SCENARIUSZ · ' + scen.title.toUpperCase() : route.freight ? 'POCIĄG TOWAROWY' : (route.name.split(' ')[0] || 'Pociąg').toUpperCase();
		const km = ((def.stations[def.stations.length - 1].pos - def.stations[0].pos) / 1000).toFixed(1).replace('.', ',');
		loadingScreen = window.TrainScreens ? window.TrainScreens.loading({
			eyebrow: `${kind} · ${def.real ? 'TRASA RZECZYWISTA' : 'TRASA'}`,
			title: route.title,
			sub: `${t.name} · ${snap ? 'zapis z godz.' : 'odjazd'} ${fmtClock(dep).slice(0, 5)} · ${wName} · ${km} km`,
			night: h < 5 || h >= 21 ? 0.9 : h < 7 || h >= 19 ? 0.5 : 0.12,
		}) : null;
		mode = 'loading';
		loadingFrames = 0;
		precompiled = 0;
		sim = null;
		requestAnimationFrame(() => requestAnimationFrame(() => {
			try {
				beginGame(snap);
			} catch (e) {
				if (loadingScreen) loadingScreen.close();
				loadingScreen = null;
				mode = 'menu';
				throw e;
			}
		}));
	}
	function finishLoading() {
		mode = 'play';
		renderer.inputEnabled = true;
		const route = sim.route;
		const rname = route.freight ? route.name.replace(/^(Osobowy|Pospieszny|Pociąg)\b/i, 'Towarowy') : route.name;
		if (resumed) hud.toast(`${rname}: ${route.title}. Wczytano zapis – jazda od km ${(sim.st.pos / 1000).toFixed(2).replace('.', ',')}, godz. ${fmtClock(sim.clock()).slice(0, 5)}.`, 'info');
		else {
			hud.toast(`${rname}: ${route.title}. Odjazd o ${fmtClock(route.startClock + route.originWait)}.`, 'info');
			hud.toast(sim.air ? 'Skład zahamowany: zawór maszynisty na odcięciu. Gdy semafor zmieni się na zielony, odhamuj (Q) i przesuń nastawnik w górę (↑).' : 'Skład zahamowany: nastawnik na H1. Gdy semafor zmieni się na zielony, przesuń nastawnik w górę (↑) – przez 0 na jazdę.', 'info');
		}
		hud.toast('Kamera: przeciągnij myszą lub ←/→, kółko – oddalenie, V – tryb kamery, C – widok domyślny.', 'info');
		if (scen && !resumed) hud.toast(`Scenariusz „${scen.title}”. Cele: ${(sim.scenario.goals() || []).join('; ') || 'ukończ jazdę'}.`, 'info');
		if (sim.scenario && sim.scenario.task()) hud.task(sim.scenario.task());
		if (sim.pendingOrder()) showLastOrder(); // zapis z niepotwierdzonym rozkazem
		if (loadingScreen) loadingScreen.done();
		loadingScreen = null;
	}
	function beginGame(snap) {
		exitFree();
		document.querySelector('.controls [data-act=wipers]')?.classList.remove('on');
		const route = rideRoute();
		applyClock(route);
		if (scen && scen.clock) route.startClock = hm(scen.clock) - route.originWait; // godzina odjazdu ze scenariusza
		if (snap) route.startClock = snap.startClock; // godzina z zapisu (także przestawiona w pauzie)
		if (!scen) save('trainCfg', trainCfg);
		/* scenariusz albo zdarzenia losowe (opcja jazdy swobodnej; z zapisu – te same zdarzenia co przed zapisem) */
		let run = null;
		rideEvents = null;
		// zadanie dnia: zdarzenia losowane z ziarna daty po przygotowaniu trasy
		if (scen) run = SC.runner(scen.daily ? Object.assign({}, scen, { events: SC.randomEvents(route, scen.seed, scen.weather).events }) : scen, route);
		else if (snap ? snap.events : $('opt-events').checked) {
			rideEvents = snap && snap.events ? snap.events : SC.randomEvents(route, Date.now() % 1e9, $('opt-weather').value);
			run = SC.runner(rideEvents, route);
		}
		// hamulec i SHP: z zapisu albo z opcji („Pomoc”)
		const brake = snap ? snap.brake || 'simple' : $('opt-brake').value, shp = snap ? !!snap.shp : $('opt-shp').checked;
		const drive = snap ? snap.drive || 'simple' : $('opt-drive').value, season = snap ? snap.season || 'summer' : scen && scen.season ? scen.season : $('opt-season').value;
		const tt = snap ? snap.timetable : timetable(route);
		if (snap && snap.ttEnergy) tt.energy = snap.ttEnergy; // odniesienie oceny „Energia”
		// ruch na linii: poziom i ziarno (z zapisu – te same pociągi tła)
		const tLevel = snap ? snap.traffic || 0 : Number($('opt-traffic').value), tSeed = snap ? snap.trafficSeed || 1 : Math.floor(Math.random() * 1e9);
		const traffic = tLevel > 0 ? new window.TrainTraffic.Traffic(route, { level: tLevel, seed: tSeed, timetable: tt }) : null;
		const dispatch = snap ? snap.dispatch !== false : $('opt-dispatch').checked;
		const opts = { czuwak: $('opt-ca').checked, timetable: tt, scenario: run, brake, shp, traffic, trafficPenalty: snap ? !!snap.trafficPen : $('opt-traffic-pen').checked, dispatch, drive, season };
		rideTraffic = { level: tLevel, seed: tSeed };
		sim = snap ? Sim.restore(route, opts, snap.sim) : new Sim(route, opts);
		resumed = !!snap;
		save('opt.ca', $('opt-ca').checked);
		save('opt.assist', $('opt-assist').checked);
		renderer.assist = $('opt-assist').checked;
		applyGraphics();
		// pogoda jazdy: z zapisu, ze scenariusza albo z menu (scenariusz nie zmienia wyboru w menu)
		rideWeather = snap ? snap.weather || $('opt-weather').value : scen ? scen.weather : $('opt-weather').value;
		renderer.setWeather(rideWeather);
		renderer.world.detailDyn = 1; // dopasowanie szczegółów – od nowa w każdej jeździe
		renderer.reset(sim);
		sim.setConditions(rideWeatherKey()); // przyczepność wg pogody („jak w scenariuszu” – pogoda trasy)
		$('hud').classList.remove('hidden');
		$('btn-pause').classList.remove('hidden');
		showOverlay(null);
		hud.setup(sim);
		audio.ensure();
		audio.reset(sim);
		timeScale = snap ? snap.timeScale || 1 : 1;
		mode = 'loading'; // jazda rusza po dobudowaniu świata (frame → finishLoading)
		updatePreview();
	}

	// jakość grafiki (ustawienia) i pogoda (menu gry albo pauza – oba pola są zsynchronizowane)
	function applyGraphics(src) {
		const q = $('opt-quality').value;
		const w = (src === 'pause' ? $('pause-weather') : $('opt-weather')).value;
		$('opt-weather').value = $('pause-weather').value = w;
		$('quality-hint').textContent = QUALITY_HINT[q];
		save('opt.quality', q);
		save('opt.weather', w);
		renderer.setQuality(q);
		if (src === 'pause' || !sim) rideWeather = w;
		renderer.setWeather(sim && rideWeather ? rideWeather : w);
		if (sim) sim.setConditions(rideWeatherKey());
	}

	function togglePause() {
		if (mode === 'play' || mode === 'free') {
			pauseFromFree = mode === 'free';
			mode = 'pause';
			buildPause();
			renderer.rotKey = 0;
			audio.silence();
			$('free').classList.add('hidden');
			showOverlay('pause');
		} else if (mode === 'pause') {
			mode = pauseFromFree ? 'free' : 'play';
			if (mode === 'free' && !$('free-run').checked) audio.silence();
			$('free').classList.toggle('hidden', mode !== 'free');
			if (mode === 'free') $('prompt').classList.add('hidden');
			showOverlay(null);
		}
	}

	// ---------- swobodna kamera: lot nad mapą, symulacja stoi ----------
	let pauseFromFree = false, freeT = 0, freeKmDrag = false;
	const freeKeysDown = {};
	function enterFree() {
		if (!sim || (mode !== 'play' && mode !== 'pause')) return;
		if (mode === 'pause') showOverlay(null);
		mode = 'free';
		pauseFromFree = false;
		renderer.rotKey = 0;
		audio.silence();
		renderer.freeStart(sim);
		renderer.free.keys = freeKeysDown;
		renderer.free.speed = Number($('free-speed').value) || 1;
		$('hud').classList.add('hidden');
		$('btn-pause').classList.add('hidden');
		$('prompt').classList.add('hidden');
		const route = sim.route;
		$('free-km').max = Math.ceil(route.length / 10) * 10;
		const list = $('free-stations');
		list.innerHTML = '';
		route.stations.forEach((st, i) => {
			const b = document.createElement('button');
			const pl = st.platform;
			const kind = st.type === 'halt' ? 'przystanek' : 'stacja';
			const side = pl ? (pl.island ? 'peron wyspowy' : pl.side < 0 ? 'peron z lewej' : 'peron z prawej') : 'peron z prawej';
			b.innerHTML = `<span>${esc(st.name)}</span><small>${(st.pos / 1000).toFixed(1)} km · ${kind}, ${side}</small>`;
			b.addEventListener('click', () => freeGo('station', i));
			list.appendChild(b);
		});
		buildIssues(route);
		$('free').classList.remove('hidden');
		freeT = 0;
		hud.toast('Swobodna kamera: WASD – ruch, Q/E – wysokość, mysz – rozglądanie. F – powrót do jazdy.', 'info');
	}
	function exitFree() {
		if (!renderer.free) return;
		renderer.freeStop();
		for (const k in freeKeysDown) delete freeKeysDown[k];
		$('free').classList.add('hidden');
		pauseFromFree = false;
		if (mode === 'free') {
			mode = 'play';
			$('hud').classList.remove('hidden');
			$('btn-pause').classList.remove('hidden');
		}
	}
	// uwagi generatora trasy: miejsca do sprawdzenia, co można zrobić (poprawka w sekcji fixes pliku trasy)
	const ISSUE_KIND = { align: 'przebieg', curve: 'łuk', left: 'tor', service: 'tor', speed: 'prędkość', signals: 'semafory', 'station-skip': 'stacja', stop: 'zatrzymanie', platform: 'peron', bridge: 'most', 'bridge-add': 'most', cross: 'skrzyżowanie', slip: 'rozjazd', audit: 'kontrola obiektów' };
	function buildIssues(route) {
		const box = $('free-issues');
		// uwagi generatora i kontrola obiektów nad torami w grze (te same obliczenia co rysowanie)
		const audit = renderer.world && renderer.world.envAudit ? renderer.world.envAudit() : [];
		const list = (route.issues || []).concat(audit);
		const st = (x) => R.issueStatus({ fixes: route.fixes }, x);
		const open = list.filter((x) => !st(x));
		$('free-tab-issues').textContent = `Uwagi generatora (${open.length}${open.some((x) => x.lvl === 'warn') ? ', ' + open.filter((x) => x.lvl === 'warn').length + ' !' : ''})`;
		box.innerHTML = list.length ? `<div class="issue-sum">Miejsca, których generator nie był pewien, i co można z nimi zrobić. Poprawki: sekcja <code>fixes</code> w pliku trasy (albo <code>--fixes plik.json</code> przy generowaniu) – opis w README.</div>` : '<div class="issue-sum">Brak uwag generatora dla tej trasy.</div>';
		for (const x of list) {
			const s0 = st(x);
			const el = document.createElement('div');
			el.className = 'issue ' + (x.lvl === 'warn' ? 'warn' : 'info') + (s0 ? ' done' : '');
			const km = (x.pos / 1000).toFixed(2).replace('.', ',');
			el.innerHTML = `<div class="ih"><span>${x.lvl === 'warn' ? '⚠ ' : ''}${ISSUE_KIND[x.k] || x.k} · km ${km}</span><span>${s0 === 'fixed' ? 'poprawione' : s0 === 'ignored' ? 'pominięte' : esc(x.id)}</span></div><b>${esc(x.m)}</b>${s0 ? '' : `<div class="fx">→ ${esc(x.fix)}</div>`}<div class="ib"><button data-a="show">Pokaż</button><button data-a="copy" title="Kopiuje id, opis i podpowiedź poprawki">Kopiuj</button>${x.osm ? `<a href="https://www.openstreetmap.org/${esc(x.osm)}" target="_blank" rel="noopener" title="Obiekt w OpenStreetMap">OSM</a>` : ''}</div>`;
			el.querySelector('[data-a=show]').addEventListener('click', () => freeGo('issue', x));
			el.querySelector('[data-a=copy]').addEventListener('click', (e) => {
				const txt = `${route.id} ${x.id} (km ${km}): ${x.m}\nPoprawka: ${x.fix}${x.osm ? '\nOSM: https://www.openstreetmap.org/' + x.osm : ''}`;
				const done = () => { e.target.textContent = 'Skopiowano'; setTimeout(() => { e.target.textContent = 'Kopiuj'; }, 1500); };
				if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => hud.toast(txt, 'info'));
				else hud.toast(txt, 'info');
			});
			box.appendChild(el);
		}
	}
	function freeTab(name) {
		document.querySelectorAll('[data-free-tab]').forEach((b) => b.classList.toggle('sel', b.dataset.freeTab === name));
		$('free-stations').classList.toggle('hidden', name !== 'stations');
		$('free-issues').classList.toggle('hidden', name !== 'issues');
	}
	function freeGo(what, arg) {
		const f = renderer.free, route = sim.route;
		if (!f) return;
		const ground = () => renderer.world.terrainY(f.s, f.d);
		if (what === 'station') {
			const st = route.stations[arg], mid = (st.platformStart + st.platformEnd) / 2;
			const sg = st.platform ? st.platform.side : 1;
			renderer.freeTeleport(route, st.platformStart - 45, sg * 30, 24, mid, sg * 3, 0);
		} else if (what === 'train') {
			const s = sim.st.pos;
			renderer.freeTeleport(route, s - sim.L - 40, -25, 22, s - sim.L / 2, 0, 0);
		} else if (what === 'km') {
			renderer.freeTeleport(route, arg - 60, -35, 40, arg + 40, 0, 0);
		} else if (what === 'issue') {
			// miejsce uwagi: z ukosa z lewej, nad torem, patrząc na początek miejsca
			const s1 = arg.to !== undefined ? (arg.pos + arg.to) / 2 : arg.pos;
			// miejsce z dala od osi (kontrola obiektów) – kamera obok niego
			if (arg.d !== undefined && Math.abs(arg.d) > 20) renderer.freeTeleport(route, s1 - 45, arg.d - Math.sign(arg.d) * 30, 18, s1, arg.d, 0);
			else renderer.freeTeleport(route, s1 - 70, -30, 26, s1, 0, 0);
		} else if (what === 'high') {
			f.y = ground() + 150;
			f.pitch = -0.95;
		} else if (what === 'bird') {
			f.y = ground() + 35;
			f.pitch = -0.45;
		} else if (what === 'walk') {
			f.y = ground() + 1.7;
			f.pitch = 0;
		}
	}
	function updateFreePanel(dt) {
		freeT -= dt;
		if (freeT > 0 || !renderer.free) return;
		freeT = 0.15;
		const info = renderer.freeInfo(sim.route), st = info.station;
		const side = Math.abs(info.d) < 1 ? 'na osi toru' : `${Math.round(Math.abs(info.d))} m ${info.d > 0 ? 'w prawo' : 'w lewo'} od osi toru`;
		const h = info.h < 10 ? info.h.toFixed(1).replace('.', ',') : Math.round(info.h);
		$('free-info').textContent = `km ${(info.s / 1000).toFixed(3).replace('.', ',')} · ${side}\nwysokość ${h} m nad terenem\nnajbliżej: ${st.name} – ${Math.round(st.dist)} m ${st.ahead ? 'dalej' : 'wcześniej'}`;
		if (!freeKmDrag) $('free-km').value = Math.round(info.s / 10) * 10;
		$('free-km-val').textContent = (Number($('free-km').value) / 1000).toFixed(2).replace('.', ',') + ' km';
		const near = sim.route.stations.findIndex((x) => x.name === st.name);
		[...$('free-stations').children].forEach((b, i) => b.classList.toggle('near', i === near && st.dist < 400));
	}

	function showEnd() {
		mode = 'end';
		audio.silence();
		const ok = sim.status === 'ended';
		const score = sim.score(), max = sim.maxScore();
		$('end-title').textContent = ok ? 'Koniec trasy – ' + sim.route.stations[sim.route.stations.length - 1].name : 'Jazda przerwana';
		$('end-reason').textContent = ok ? `Przejazd zakończony o ${fmtClock(sim.clock())}.` : sim.failReason;
		const ratio = ok ? Math.max(0, score / max) : 0;
		let stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.4 ? 1 : 0;
		// scenariusz: gwiazdki za ukończenie i cele; najlepszy wynik zapamiętany
		const res = scen && sim.scenario ? sim.scenario.result(sim) : null;
		$('end-goals').classList.toggle('hidden', !res);
		if (res) {
			stars = res.stars;
			if (ok) $('end-title').textContent = `Scenariusz „${scen.title}” ukończony`;
			$('end-goals').innerHTML = res.goals.map((g) => `<li class="${g.ok ? 'ok' : 'no'}">${esc(g.text)}</li>`).join('');
			const bestS = load('scen.' + scen.id, 0);
			if (stars > bestS) save('scen.' + scen.id, stars);
		}
		$('end-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
		$('end-points').textContent = `${score} / ${max} pkt`;
		showRating(ok, score);
		if (ok && !scen) {
			const best = load(bestKey(sim.route), null);
			if (best === null || score > best) {
				save(bestKey(sim.route), score);
				$('end-points').textContent += ' – nowy rekord!';
			}
		}
		const rows = sim.records.map((r) => {
			const planned = r.planned != null ? fmtClock(sim.route.startClock + r.planned) : '—';
			const actual = fmtClock(sim.route.startClock + r.actual);
			const delay = r.planned != null ? fmtDelay(r.delay) : '—';
			const stop = r.through ? 'przelot' : r.missed ? 'przejechany peron' : `${Math.abs(r.error).toFixed(1)} m ${r.error < 0 ? 'przed' : 'za'}`;
			const pts = r.through ? '' : (r.stopPts || 0) + (r.timePts || 0);
			return `<tr><td>${r.station}</td><td class="num">${planned}</td><td class="num">${actual}</td><td class="num">${delay}</td><td>${stop}</td><td class="num">${pts}</td></tr>`;
		});
		$('end-table').innerHTML = `<tr><th>Stacja</th><th>Plan</th><th>Rzeczywiście</th><th>Odchyłka</th><th>Zatrzymanie</th><th>Pkt</th></tr>${rows.join('') || '<tr><td colspan="6">Brak obsłużonych stacji</td></tr>'}`;
		const p = sim.penalties;
		const parts = [
			['prędkość', p.overspeed], ['hamowanie nagłe', p.emergency], ['czuwak', p.czuwak],
			['przejazdy', p.crossing], ['przejechane perony', p.overrun], ['pantograf pod obciążeniem', p.panto || 0], ['komunikaty dyżurnego', p.radio || 0], ['SHP', p.shp || 0], ['zatrzymane pociągi', p.traffic || 0], ['rozkazy', p.order || 0], ['płaskie miejsca', p.flat || 0], ['oporniki', p.drive || 0],
		].filter(([, v]) => v > 0).map(([k, v]) => `${k} −${Math.round(v)}`);
		const blocked = sim.traffic ? ` Pociągi zatrzymane przez Twoje opóźnienie: ${sim.stats.blocked}.` : '';
		$('end-penalties').innerHTML = `Premia za syrenę przed przejazdami: +${sim.bonus}. ` + (parts.length ? `Kary: ${parts.join(', ')}.` : 'Bez kar – wzorowa jazda!') + blocked;
		showOverlay('end');
	}

	/* Ocena jazdy na ekranie końca: kategorie (gwiazdki 1–5), ogólna, najlepsza dla trasy i składu; wykres przejazdu;
	   wpis do historii jazd (localStorage history – ostatnie 30) */
	const starsTxt = (n) => '★'.repeat(n) + `<em>${'★'.repeat(5 - n)}</em>`;
	function showRating(ok, score) {
		const rt = sim.rating(), r = sim.route;
		const key = `${r.id}|${r.train.name}`;
		const hist = load('history', []);
		const best = hist.filter((h) => h.key === key).reduce((m, h) => Math.max(m, h.overall), 0);
		$('end-rating').innerHTML = `<div class="rall">Ocena jazdy: <b class="st">${'★'.repeat(rt.overall)}${'☆'.repeat(5 - rt.overall)}</b>${best ? ` · dotąd najlepsza na tej trasie tym składem: ${'★'.repeat(best)}` : ''}${rt.overall > best && best ? ' – nowy najlepszy wynik!' : ''}</div>` +
			rt.cats.map((c) => `<div class="rc"><b>${esc(c.name)} <i>${c.stars === null ? '—' : starsTxt(c.stars)}</i></b>${esc(c.detail)}</div>`).join('');
		drawChart($('end-chart'), sim);
		hist.unshift({ key, date: Date.now(), title: r.title, train: r.train.name, ok, score, overall: rt.overall, cats: rt.cats.map((c) => [c.name, c.stars]), scen: scen ? scen.title : null });
		save('history', hist.slice(0, 30));
	}
	// wykres przejazdu: prędkość (bursztyn) wobec dozwolonej (szara, schodkowa), stacje, hamowania nagłe (czerwone)
	function drawChart(cv, s) {
		const g = cv.getContext('2d'), W = cv.width, H = cv.height, S = s.rate.samples, st = s.route.stations;
		g.clearRect(0, 0, W, H);
		if (S.length < 2) return;
		const x0 = st[0].pos, x1 = Math.max(S[S.length - 1][0], st[st.length - 1].pos);
		const vmax = Math.max(40, ...S.map((p) => Math.max(p[1], p[2]))) * 1.08;
		const L = 34, B = 22, X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - 8), Y = (v) => H - B - (v / vmax) * (H - B - 8);
		g.font = '10px system-ui, sans-serif';
		g.fillStyle = '#6f7a89';
		g.strokeStyle = '#1e2733';
		for (let v = 0; v <= vmax; v += 20) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - 8, Y(v)); g.stroke(); g.fillText(String(v), 6, Y(v) + 3); }
		// stacje
		g.strokeStyle = '#2f3b4b';
		st.forEach((x, i) => {
			const px = X(x.pos);
			g.beginPath(); g.moveTo(px, 8); g.lineTo(px, H - B); g.stroke();
			if (i % Math.ceil(st.length / 8) === 0 || i === st.length - 1) g.fillText(x.name.slice(0, 14), Math.min(W - 70, px + 2), H - 8);
		});
		// dozwolona prędkość (schodki)
		g.strokeStyle = '#8592a3';
		g.lineWidth = 1.5;
		g.beginPath();
		S.forEach((p, i) => { if (i) g.lineTo(X(p[0]), Y(S[i - 1][2])); g.lineTo(X(p[0]), Y(p[2])); });
		g.stroke();
		// prędkość
		g.strokeStyle = '#ffb020';
		g.lineWidth = 2;
		g.beginPath();
		S.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
		g.stroke();
		// hamowania nagłe
		g.fillStyle = '#ff4b3e';
		for (const m of s.rate.marks) { const px = X(m); g.beginPath(); g.moveTo(px, H - B); g.lineTo(px - 5, H - B - 9); g.lineTo(px + 5, H - B - 9); g.fill(); }
		g.lineWidth = 1;
	}
	function buildHistory() {
		const list = $('hist-list'), hist = load('history', []);
		const best = {};
		for (const h of hist) best[h.key] = Math.max(best[h.key] || 0, h.overall);
		list.innerHTML = hist.length ? '' : '<p class="hint">Brak jazd – historia zapisuje się po każdej jeździe.</p>';
		for (const h of hist) {
			const el = document.createElement('div');
			el.className = 'hist-item';
			const when = new Date(h.date).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
			el.innerHTML = `<b>${esc(h.title)}</b> · ${esc(h.train)}${h.scen ? ` · scenariusz „${esc(h.scen)}”` : ''} · <span class="st">${'★'.repeat(h.overall)}${'☆'.repeat(5 - h.overall)}</span>${h.overall === best[h.key] ? ' (najlepsza)' : ''} · ${h.score} pkt${h.ok ? '' : ' · przerwana'}
				<small>${esc(when)} – ${h.cats.map(([n, s]) => `${esc(n)} ${s === null ? '—' : s + '★'}`).join(', ')}</small>`;
			list.appendChild(el);
		}
	}

	// ---------- pętla ----------
	function step(s, dt) {
		let rem = dt;
		while (rem > 1e-6) {
			const h = Math.min(0.05, rem);
			s.update(h);
			rem -= h;
		}
	}

	/* Jakość automatycznie: czas rysowania świata w menu (procesor, mediana z 90 klatek po zbudowaniu świata):
	   do 7 ms – wysoka, do 14 ms – średnia, więcej – niska. */
	function autoQuality(ms) {
		autoQ.t.push(ms);
		if (autoQ.t.length < 90) return;
		const t = autoQ.t.slice(30).sort((a, b) => a - b), med = t[t.length >> 1];
		autoQ = null;
		const q = med < 7 ? 'high' : med < 14 ? 'medium' : 'low';
		$('opt-quality').value = q;
		applyGraphics();
		hud.toast(`Dobrano jakość grafiki: ${{ high: 'wysoka', medium: 'średnia', low: 'niska' }[q]} (rysowanie ok. ${med.toFixed(0)} ms) – zmiana w Ustawieniach.`, 'info');
	}
	/* Dopasowanie szczegółów w grze: co 5 s średni FPS; dwa okresy poniżej 28 FPS – zasięg świata o 10 % mniejszy (najmniej
	   60 %), cztery powyżej 55 FPS – z powrotem o 10 % */
	const ad = { n: 0, t: 0, low: 0, high: 0 };
	function autoDetail(raw) {
		if (!$('set-autodetail').checked) return;
		ad.n++;
		ad.t += raw;
		if (ad.t < 5) return;
		const fps = ad.n / ad.t, w = renderer.world;
		ad.n = 0;
		ad.t = 0;
		ad.low = fps < 28 ? ad.low + 1 : 0;
		ad.high = fps > 55 ? ad.high + 1 : 0;
		const cur = w.detailDyn || 1;
		if (ad.low >= 2 && cur > 0.6) {
			w.detailDyn = Math.round((cur - 0.1) * 10) / 10;
			ad.low = 0;
			hud.toast(`Mała płynność (${fps.toFixed(0)} FPS) – zmniejszono zasięg szczegółów do ${Math.round(w.detailDyn * 100)} %.`, 'info', 'detail');
		} else if (ad.high >= 4 && cur < 1) {
			w.detailDyn = Math.round((cur + 0.1) * 10) / 10;
			ad.high = 0;
		}
	}

	let fpsN = 0, fpsT = 0;
	function frame(now) {
		const raw = (now - last) / 1000;
		const dt = Math.min(0.1, raw);
		last = now;
		fpsN++;
		fpsT += raw;
		if (fpsT >= 0.5) {
			if (!$('fps').classList.contains('hidden')) $('fps').textContent = Math.round(fpsN / fpsT) + ' FPS';
			fpsN = 0;
			fpsT = 0;
		}
		// ekran wczytywania: kawałki świata budowane bez limitu czasu na klatkę (World.update)
		if (renderer.world) renderer.world.fast = mode === 'loading';
		if (mode === 'loading') {
			// wczytywanie: świat buduje się w draw (symulacja stoi), ekran wczytywania przykrywa scenę
			$('fps').classList.add('menu-off');
			if (sim) {
				renderer.miniRect = false;
				renderer.draw(sim, 0, 0);
				// świat zbudowany – jeszcze kompilacja shaderów wszystkich obiektów (także ukrytych, np. kabiny), potem start
				if (++loadingFrames >= 4 && !(renderer.world.pending > 0)) {
					if (!precompiled) {
						precompiled = 1;
						const s0 = sim;
						renderer.precompile().then(() => { if (sim === s0) precompiled = 2; });
					} else if (precompiled === 2) finishLoading();
				}
			} else if (demo) renderer.draw(demo, 0, 0);
			requestAnimationFrame(frame);
			return;
		}
		if (mode === 'menu' && !demo) {
			$('fps').classList.add('menu-off');
		} else if (mode === 'menu') {
			if (demo.status !== 'running') startDemo();
			autopilot(demo);
			step(demo, dt * 2);
			demo.events.length = 0;
			renderer.miniRect = false; // podgląd w menu bez żadnego HUD (bez paska trasy)
			$('fps').classList.add('menu-off');
			const tq = performance.now();
			renderer.draw(demo, dt, 0);
			if (autoQ && !(renderer.world.pending > 0)) autoQuality(performance.now() - tq);
		} else if (sim) {
			$('fps').classList.remove('menu-off');
			// swobodna kamera z „Pociąg jedzie dalej” – symulacja biegnie, prowadzi automat (klawisze sterują kamerą)
			const freeRun = mode === 'free' && $('free-run').checked && sim.status === 'running';
			if (mode === 'play' || mode === 'over' || freeRun) {
				if (freeRun) autopilot(sim);
				const f0 = freeRun && $('free-follow').checked ? R.trackPoint(sim.route, sim.st.pos) : null;
				step(sim, mode === 'play' || freeRun ? dt * timeScale : dt);
				// „Leć z pociągiem”: kamera przesuwa się o tyle, o ile przesunęło się czoło składu
				if (f0 && renderer.free) {
					const f1 = R.trackPoint(sim.route, sim.st.pos);
					renderer.free.x += f1.x - f0.x;
					renderer.free.z += f1.z - f0.z;
					renderer.free.y += f1.y - f0.y;
				}
				for (const e of sim.events) {
					if (e.type === 'msg') hud.toast(e.text, e.kind, e.key);
					else if (e.type === 'dismiss') hud.dismiss(e.key);
					else if (e.type === 'sound') audio.play(e.name);
					else if (e.type === 'arc' && renderer.trainModel && renderer.trainModel.arcBurst) renderer.trainModel.arcBurst();
					else if (e.type === 'departed') autoSave();
					else if (e.type === 'radio') hud.radio(e.from, e.text, e.ack);
					else if (e.type === 'announce') announce(e.text);
					else if (e.type === 'order' || e.type === 'order-ack') { hud.order(Object.assign({ train: sim.trainName() }, e.order), fmtClock(sim.route.startClock + e.order.at).slice(0, 5)); hud.orderChip(sim.orders.length); }
					else if (e.type === 'radio-ack') hud.radioAck();
					else if (e.type === 'task') hud.task(e);
					else if (e.type === 'weather') { rideWeather = e.key; renderer.setWeather(e.key); sim.setConditions(rideWeatherKey()); }
				}
				sim.events.length = 0;
				if (mode === 'play' && sim.status !== 'running') {
					mode = 'over';
					endTimer = sim.status === 'ended' ? 2 : 3;
					timeScale = 1;
				}
				if (mode === 'over') {
					endTimer -= dt;
					if (endTimer <= 0) showEnd();
				}
				audio.update(sim, mode === 'end' ? 0 : dt * timeScale);
				const wc = renderer.weather.cur;
				// urban: bliskość stacji (szum miasta, przejeżdżające auta) – 1 na stacji, 0 dalej niż ok. 1,5 km
				const sp = sim.st.pos;
				const urban = sim.route.stations.reduce((m, x) => Math.max(m, 1 - Math.max(0, Math.abs(sp - (x.platformStart + x.platformEnd) / 2) - 300) / 1200), 0);
				audio.setEnv({ wind: wc.wind, rain: mode === 'end' ? 0 : wc.rain, snow: wc.snow, dark: renderer.dark || 0, cab: renderer.camMode === 'cab', urban: Math.max(0, urban), wipe: renderer.trainModel ? renderer.trainModel.wSpeed || 0 : 0, wipeOn: renderer.trainModel ? renderer.trainModel.wiperMode > 0 || renderer.trainModel.wPh > 0 : false });
				audio.setPassing(mode === 'end' ? null : renderer.life.other);
			}
			if (mode === 'free') updateFreePanel(dt);
			else if (!(mode === 'pause' && pauseFromFree)) hud.update(sim, timeScale); // HUD jazdy schowany w trybie kamery
			renderer.miniRect = false; // w grze trasa jest na osi czasu w lewym panelu
			renderer.draw(sim, mode === 'pause' ? 0 : dt, 0);
			if (mode === 'play') autoDetail(raw);
		}
		requestAnimationFrame(frame);
	}

	// ---------- wejście ----------
	// rozkazy pisemne: ostatni (niepotwierdzony – ten) na karcie; ponownie – schowanie
	function showLastOrder() {
		if (!sim || !sim.orders.length) { hud.toast('Brak rozkazów pisemnych w tej jeździe.', 'info', 'order'); return; }
		if (!$('order').classList.contains('hidden') && !sim.pendingOrder()) { hud.orderHide(); return; }
		const o = sim.pendingOrder() || sim.orders[sim.orders.length - 1];
		hud.order(Object.assign({ train: sim.trainName() }, o), fmtClock(sim.route.startClock + o.at).slice(0, 5));
	}
	const VALVE_NAMES = { fill: 'napełnianie', run: 'jazda', lap: 'odcięcie', brake: 'hamowanie', emerg: 'nagłe' };
	// pogoda bieżącej jazdy po rozwinięciu „jak w scenariuszu” (do przyczepności)
	const rideWeatherKey = () => (renderer.weather && renderer.weather.key) || rideWeather || 'clear';
	function locoKey(dir) {
		const p = sim.locoBrake(dir);
		if (p === null) { hud.toast('Hamulec dodatkowy – w lokomotywie przy hamulcu zespolonym (Pomoc → Hamulec).', 'info', 'valve'); return; }
		hud.toast(`Hamulec dodatkowy lokomotywy: ${p.toFixed(1)} bar`, 'info', 'valve');
		audio.play('click');
	}
	function valveKey(dir) {
		if (!sim.air) { hud.toast('Zawór maszynisty – przy hamulcu zespolonym (Pomoc → Hamulec). Hamowanie: ↓ / S.', 'info', 'valve'); return; }
		const v = sim.brakeValve(dir);
		if (v) { hud.toast('Zawór maszynisty: ' + VALVE_NAMES[v], 'info', 'valve'); audio.play('click'); }
	}
	const KEYS = {
		ArrowUp: () => sim.leverUp(), KeyW: () => sim.leverUp(),
		ArrowDown: () => sim.leverDown(), KeyS: () => sim.leverDown(),
		Digit0: () => sim.neutral(), Numpad0: () => sim.neutral(),
		KeyE: () => sim.emergency(), Backspace: () => sim.emergency(),
		KeyD: () => sim.toggleDoors(),
		// Enter: najpierw rozkaz pisemny, potem komunikat dyżurnego
		Enter: () => { if (sim.ackOrder() || sim.ackRadio()) audio.play('click'); },
		NumpadEnter: () => { if (sim.ackOrder() || sim.ackRadio()) audio.play('click'); },
		KeyO: () => showLastOrder(),
		KeyX: () => { if (sim.sandOn()) hud.toast('Piasecznica', 'info', 'sand'); },
		// hamulec dodatkowy lokomotywy (hamulec zespolony)
		'Shift+KeyA': () => locoKey(1),
		'Shift+KeyQ': () => locoKey(-1),
		Space: () => { sim.ackButton(); audio.play('click'); },
		// zawór maszynisty (hamulec zespolony): A – w stronę hamowania, Q – w stronę luzowania
		KeyA: () => valveKey(1),
		KeyQ: () => valveKey(-1),
		KeyH: () => { sim.horn = true; },
		KeyJ: () => { sim.horn2 = true; },
		KeyT: () => {
			timeScale = timeScale === 1 ? 2 : timeScale === 2 ? 4 : 1;
			hud.toast(`Przyspieszenie czasu ×${timeScale}`);
		},
		KeyU: () => sim.togglePanto(),
		KeyR: () => {
			const tm = renderer.trainModel;
			if (!tm || !tm.cycleWipers) return;
			const m = tm.cycleWipers();
			hud.toast('Wycieraczki: ' + ['wyłączone', 'praca przerywana', 'praca ciągła', 'praca szybka'][m]);
			audio.play('click');
			const b = document.querySelector('.controls [data-act=wipers]');
			if (b) b.classList.toggle('on', m > 0);
		},
		KeyZ: () => hud.toast('Widok: ' + renderer.cycleZoom()),
		KeyC: () => { renderer.resetView(); hud.toast('Kamera: widok domyślny'); },
		KeyV: () => hud.toast('Kamera: ' + renderer.cycleCamMode()),
		// środek orbity kamery na poprzednim / następnym pojeździe składu
		BracketLeft: () => { const t = renderer.cycleFocusCar(-1, sim); if (t) hud.toast('Kamera: ' + t); },
		BracketRight: () => { const t = renderer.cycleFocusCar(1, sim); if (t) hud.toast('Kamera: ' + t); },
		KeyK: () => hud.toast(renderer.toggleCab() ? 'Kabina maszynisty – rozglądaj się myszą, K wraca do poprzedniego widoku' : 'Widok z zewnątrz'),
		KeyM: () => {
			muted = !muted;
			audio.setMuted(muted);
			save('muted', muted);
			$('set-sound').checked = !muted;
			hud.toast(muted ? 'Dźwięk wyłączony' : 'Dźwięk włączony');
		},
	};

	document.addEventListener('keydown', (e) => {
		// nakładka diagnostyczna (wydajność) – w każdym miejscu gry
		if (e.code === 'F3') { e.preventDefault(); renderer.togglePerf(); return; }
		// wczytywanie trasy po wyborze mapy – menu zablokowane (także Enter / Esc)
		if (!$('route-loading').classList.contains('hidden')) { e.preventDefault(); return; }
		if (!$('saves').classList.contains('hidden')) {
			if (e.code === 'Escape') { e.preventDefault(); closeSaves(); }
			return;
		}
		if (!$('settings').classList.contains('hidden')) {
			if (e.code === 'Escape') closeSettings();
			return;
		}
		if (mode === 'menu') {
			if (e.code === 'Enter' && screen === 'single') { scen = null; startGame(); }
			if ((e.code === 'Delete' || e.code === 'Backspace') && screen === 'single' && singleTab === 'train' && !$('car-actions').classList.contains('hidden') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); detachCar(); }
			if (e.code === 'Escape' && screen !== 'main') menuScreen('main');
			return;
		}
		if (mode === 'end') {
			if (e.code === 'Enter') startGame();
			else if (e.code === 'Escape') toMenu();
			return;
		}
		if (mode === 'free') {
			if (e.code === 'Escape' || e.code === 'KeyF') exitFree();
			else if (e.code === 'KeyP') togglePause();
			else if (/^(Key[WASDQE]|Arrow|Shift|Page)/.test(e.code)) freeKeysDown[e.code] = true;
			else return;
			e.preventDefault();
			if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
			return;
		}
		if (e.code === 'Escape' || e.code === 'KeyP') {
			togglePause();
			e.preventDefault();
			return;
		}
		if (e.code === 'KeyF' && (mode === 'play' || mode === 'pause')) {
			enterFree();
			e.preventDefault();
			return;
		}
		if (mode !== 'play') return;
		if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
			renderer.rotKey = e.code === 'ArrowLeft' ? -1 : 1;
			e.preventDefault();
			return;
		}
		// kamera z klawiatury: PageUp / PageDown – pochylenie, + / − – przybliżenie (w każdym widoku)
		if (e.code === 'PageUp' || e.code === 'PageDown') { renderer.pitchKey = e.code === 'PageUp' ? -1 : 1; e.preventDefault(); return; }
		if (/^(Equal|Minus|NumpadAdd|NumpadSubtract)$/.test(e.code)) { renderer.zoomKey = /Equal|Add/.test(e.code) ? -1 : 1; e.preventDefault(); return; }
		const fn = (e.shiftKey && KEYS['Shift+' + e.code]) || KEYS[e.code];
		if (!fn) return;
		e.preventDefault();
		if (e.repeat && e.code !== 'ArrowUp' && e.code !== 'ArrowDown' && e.code !== 'KeyW' && e.code !== 'KeyS') return;
		audio.ensure();
		fn();
	});
	document.addEventListener('keyup', (e) => {
		delete freeKeysDown[e.code];
		if (e.code === 'KeyH' && sim) sim.horn = false;
		if (e.code === 'KeyJ' && sim) sim.horn2 = false;
		if ((e.code === 'ArrowLeft' && renderer.rotKey < 0) || (e.code === 'ArrowRight' && renderer.rotKey > 0)) renderer.rotKey = 0;
		if (e.code === 'PageUp' || e.code === 'PageDown') renderer.pitchKey = 0;
		if (/^(Equal|Minus|NumpadAdd|NumpadSubtract)$/.test(e.code)) renderer.zoomKey = 0;
	});

	const ACTIONS = {
		up: () => sim.leverUp(), down: () => sim.leverDown(), neutral: () => sim.neutral(),
		doors: () => sim.toggleDoors(), ca: () => sim.ackButton(), emergency: () => sim.emergency(),
		'valve-brake': () => valveKey(1), 'valve-rel': () => valveKey(-1), sand: () => KEYS.KeyX(),
		cab: () => KEYS.KeyK(), camera: () => KEYS.KeyV(), time: () => KEYS.KeyT(), wipers: () => KEYS.KeyR(), panto: () => KEYS.KeyU(),
	};
	document.querySelectorAll('.controls button').forEach((b) => {
		const act = b.dataset.act;
		b.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			if (mode !== 'play') return;
			audio.ensure();
			if (act === 'horn' || act === 'horn2') sim[act] = true;
			else ACTIONS[act]();
		});
		if (act === 'horn' || act === 'horn2') {
			const off = () => { if (sim) sim[act] = false; };
			b.addEventListener('pointerup', off);
			b.addEventListener('pointerleave', off);
		}
		b.addEventListener('click', (e) => e.preventDefault());
	});

	$('btn-start').addEventListener('click', () => { scen = null; startGame(); });
	$('radio').addEventListener('click', () => { if (sim && sim.ackRadio()) audio.play('click'); });
	$('order').addEventListener('click', () => { if (sim && !sim.ackOrder()) hud.orderHide(); });
	$('order-chip').addEventListener('click', () => showLastOrder());
	$('ca-left').addEventListener('click', () => moveCar(-1));
	$('ca-right').addEventListener('click', () => moveCar(1));
	$('ca-del').addEventListener('click', detachCar);
	$('btn-pause').addEventListener('click', togglePause);
	$('btn-resume').addEventListener('click', togglePause);
	$('btn-free').addEventListener('click', () => { if (pauseFromFree) togglePause(); else enterFree(); });
	$('free-close').addEventListener('click', exitFree);
	$('free-run').addEventListener('change', () => {
		if ($('free-run').checked) { audio.ensure(); hud.toast('Pociąg jedzie dalej – prowadzi automat', 'info'); }
		else audio.silence();
		$('free-run').blur();
	});
	$('free-follow').addEventListener('change', () => $('free-follow').blur());
	$('free-speed').addEventListener('change', () => { if (renderer.free) renderer.free.speed = Number($('free-speed').value) || 1; });
	$('free-km').addEventListener('input', () => { freeKmDrag = true; freeGo('km', Number($('free-km').value)); });
	$('free-km').addEventListener('change', () => { freeKmDrag = false; });
	document.querySelectorAll('[data-free]').forEach((b) => b.addEventListener('click', () => freeGo(b.dataset.free)));
	document.querySelectorAll('[data-free-tab]').forEach((b) => b.addEventListener('click', () => freeTab(b.dataset.freeTab)));
	window.addEventListener('blur', () => { for (const k in freeKeysDown) delete freeKeysDown[k]; });
	$('btn-quit').addEventListener('click', toMenu);
	$('btn-again').addEventListener('click', () => startGame());
	$('btn-menu').addEventListener('click', toMenu);
	$('opt-ca').checked = load('opt.ca', true);
	// pierwsze uruchomienie (bez zapisanej jakości): test wydajności w menu dobierze jakość (frame → autoQuality)
	let autoQ = load('opt.quality', null) === null ? { t: [] } : null;
	$('opt-quality').value = load('opt.quality', 'medium');
	$('opt-weather').value = $('pause-weather').value = load('opt.weather', 'auto');
	$('opt-quality').addEventListener('change', () => { applyGraphics(mode === 'menu' ? undefined : 'pause'); if (mode === 'menu') startDemo(); });
	const weatherName = () => { const s = $('opt-weather'); return s.options[s.selectedIndex].text; };
	$('opt-weather').addEventListener('change', () => menuBusy('Zmiana warunków', 'Pogoda: ' + weatherName(), () => { applyGraphics(); buildMenu(); }));
	$('pause-weather').addEventListener('change', () => { applyGraphics('pause'); buildPause(); });
	// pora dnia: w menu – godzina odjazdu (przebudowa podglądu), w pauzie – przestawienie bieżącej godziny
	$('opt-time').value = $('pause-time').value = load('opt.time', 'auto');
	$('opt-time-custom').value = $('pause-time-custom').value = load('opt.timeCustom', '21:30');
	timeChoice();
	for (const id of ['opt-time', 'opt-time-custom']) $(id).addEventListener('change', () => {
		const sec = timeChoice();
		menuBusy('Zmiana warunków', 'Pora dnia: ' + (sec === null ? 'jak w scenariuszu' : fmtClock(sec).slice(0, 5)), buildMenu);
	});
	for (const id of ['pause-time', 'pause-time-custom']) $(id).addEventListener('change', () => {
		const sec = timeChoice('pause');
		if (!sim) { buildPause(); return; }
		const r = sim.route;
		if (r.baseClock === undefined) r.baseClock = r.startClock;
		r.startClock = sec === null ? r.baseClock : sec - sim.time;
		buildPause();
	});
	// ustawienia: dźwięk, renderer
	const ro = load('opt.render', { scale: 1, aa: true, shadows: true });
	$('set-sound').checked = !muted;
	$('set-volume').value = Math.round(load('opt.volume', 0.8) * 100);
	const mix0 = load('opt.mix', {});
	const MIX_DEF = { voice: 0.6 }; // domyślnie 100 %, głos zapowiedzi – 60 %
	for (const k of MIX_KEYS) $('set-mix-' + k).value = Math.round((mix0[k] === undefined ? (MIX_DEF[k] === undefined ? 1 : MIX_DEF[k]) : mix0[k]) * 100);
	$('set-scale').value = String(ro.scale);
	$('set-aa').checked = ro.aa;
	$('set-shadows').checked = ro.shadows;
	$('set-fps').checked = load('opt.fps', false);
	$('set-traffic-max').value = String(load('opt.trafficMax', 3));
	$('set-autodetail').checked = load('opt.autoDetail', true);
	$('set-autodetail').addEventListener('change', () => { save('opt.autoDetail', $('set-autodetail').checked); if (!$('set-autodetail').checked) renderer.world.detailDyn = 1; });
	$('set-autoq').addEventListener('click', () => { autoQ = { t: [] }; closeSettings(); hud.toast('Pomiar wydajności w menu (kilka sekund)…', 'info'); });
	$('set-traffic-people').checked = load('opt.trafficPeople', false);
	$('set-announce').value = load('opt.announce', 'text');
	const voice0 = load('opt.voice', {});
	$('set-voice-all').checked = !!voice0.all;
	$('set-voice-engine').value = voice0.engine === 'piper' ? 'piper' : 'system';
	$('set-voice-engine').addEventListener('change', () => {
		voiceStatus('');
		fillVoices();
		applySettings();
		if (voiceEngine() === 'piper') piperLoad();
	});
	$('set-voice-rate').value = voice0.rate || 0.95;
	$('set-voice-pitch').value = voice0.pitch || 1;
	fillVoices();
	if (window.speechSynthesis) window.speechSynthesis.addEventListener('voiceschanged', fillVoices); // lista głosów wczytuje się z opóźnieniem
	$('set-voice-all').addEventListener('change', () => { fillVoices(); applySettings(); });
	for (const id of ['set-voice-rate', 'set-voice-pitch']) $(id).addEventListener('input', applySettings);
	$('set-voice').addEventListener('change', () => { applySettings(); if (voiceEngine() === 'piper') piperLoad(); });
	$('set-voice-test').addEventListener('click', async (e) => {
		e.preventDefault();
		const sample = 'Pociąg osobowy do stacji Katowice odjedzie z toru pierwszego przy peronie pierwszym. Prosimy zachować ostrożność.';
		stopSpeech();
		audio.ensure();
		if (voiceEngine() === 'piper') {
			// Piper: najpierw wczytanie głosu (przy pierwszym użyciu – pobranie), potem gong i zapowiedź
			const TP = window.TrainPiper;
			if (TP.loaded !== $('set-voice').value) { await piperLoad(); if (TP.loaded !== $('set-voice').value) return; }
			audio.play('chime');
			const rate = Number($('set-voice-rate').value) || 1, pitch = Number($('set-voice-pitch').value) || 1, t0 = performance.now();
			try {
				const r = await TP.synth(sample, pitch / rate);
				setTimeout(() => audio.playVoice(r.pcm, r.sampleRate, pitch), Math.max(0, t0 + 1400 - performance.now()));
			} catch (err) { voiceStatus('Piper: ' + err.message, true); }
			return;
		}
		if (!window.speechSynthesis) return;
		audio.play('chime');
		setTimeout(() => speak(sample), 1400);
	});
	// Piper wybrany wcześniej – głos wczytywany od razu (z pamięci podręcznej), żeby pierwsza zapowiedź była nim czytana
	if (voiceEngine() === 'piper' && $('set-announce').value === 'voice') piperLoad();
	for (const id of ['set-sound', 'set-volume', 'set-scale', 'set-aa', 'set-shadows', 'set-fps', 'set-traffic-max', 'set-traffic-people', 'set-announce']) $(id).addEventListener(id === 'set-volume' ? 'input' : 'change', applySettings);
	for (const k of MIX_KEYS) $('set-mix-' + k).addEventListener('input', applySettings);
	applySettings();
	applyGraphics();
	// gra jednoosobowa: zakładki, rodzaj składu, liczba zespołów
	document.querySelectorAll('#single-tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
	document.querySelectorAll('#train-kind button').forEach((b) => b.addEventListener('click', () => {
		if (trainMode === b.dataset.kind) return;
		modeCfgs[modeOf(trainCfg)] = trainCfg;
		trainMode = b.dataset.kind;
		selCar = 0;
		setCfg(defaultFor(trainMode));
	}));
	// liczba zespołów: w czasie przeciągania suwaka tylko opis, po puszczeniu – nowy skład (okienko wczytywania)
	$('opt-units').addEventListener('input', () => { const n = Number($('opt-units').value); $('opt-units-val').textContent = `${n} ${plural(n, 'zespół', 'zespoły', 'zespołów')}`; });
	$('opt-units').addEventListener('change', () => setCfg(Object.assign({}, cfgFor(defById(selected)), { n: Number($('opt-units').value) })));
	for (const id of ['opt-ca', 'opt-assist']) $(id).addEventListener('change', buildMenu);
	showTab(singleTab);
	// menu główne
	$('btn-single').addEventListener('click', () => menuScreen('single'));
	$('btn-scen').addEventListener('click', () => { buildScenarios(); menuScreen('scen'); });
	$('scen-back').addEventListener('click', () => menuScreen('main'));
	$('opt-events').checked = load('opt.events', false);
	$('opt-events').addEventListener('change', () => { save('opt.events', $('opt-events').checked); buildMenu(); });
	$('single-back').addEventListener('click', () => menuScreen('main'));
	$('btn-gen').addEventListener('click', () => { buildGenScreen(); menuScreen('gen'); });
	// import i eksport tras: przyciski w generatorze, przeciąganie plików na okno menu
	$('gen-import').addEventListener('click', () => $('gen-file').click());
	$('gen-file').addEventListener('change', async (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) await importFiles(fs); });
	$('gen-export').addEventListener('click', () => exportRoutes(defs.filter((d) => d.custom && exportSel.has(d.id))));
	$('gen-sel-all').addEventListener('change', (e) => {
		for (const d of defs.filter((q) => q.custom)) { if (e.target.checked) exportSel.add(d.id); else exportSel.delete(d.id); }
		buildGenScreen();
	});
	{
		let depth = 0;
		const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
		window.addEventListener('dragenter', (e) => { if (mode !== 'menu' || !hasFiles(e)) return; depth++; document.body.classList.add('drop-routes'); });
		window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('drop-routes'); } });
		// upuszczony plik nigdy nie otwiera się zamiast gry (w aplikacji – przejście okna na plik); w menu – import
		window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
		window.addEventListener('drop', async (e) => {
			depth = 0;
			document.body.classList.remove('drop-routes');
			if (!hasFiles(e)) return;
			e.preventDefault();
			if (mode !== 'menu') return;
			const fs = [...e.dataTransfer.files].filter((f) => /\.(trasa|json|js|gz)$/i.test(f.name));
			if (!fs.length) return;
			buildGenScreen();
			menuScreen('gen');
			await importFiles(fs);
		});
	}
	$('gen-back').addEventListener('click', () => menuScreen('main'));
	/* Scenariusze (js/scenarios.js): karta z opisem, trasą, składem, celami i najlepszym wynikiem (gwiazdki) */
	function trainLabel(c) {
		const S = R.STOCK;
		if (c.emu) return `${S[c.emu] ? S[c.emu].name : c.emu}${c.n > 1 ? ` ×${c.n}` : ''}`;
		const n = (c.cars || []).length;
		return `${c.loco} + ${n} ${plural(n, 'wagon', 'wagony', 'wagonów')}`;
	}
	// zadanie dnia (scenario.js dailyScenario) dla daty 'RRRR-MM-DD' (dziś – bez argumentu); trasy wbudowane
	function dailyFor(key) {
		const d = key ? new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) : new Date();
		return SC.dailyScenario(d, defs.filter((x) => BUILTIN.has(x.id)));
	}
	// seria: kolejne dni (do dziś albo do wczoraj) z ukończonym zadaniem dnia
	function dailyStreak() {
		let n = 0;
		const d = new Date();
		if (!load('scen.daily-' + SC.dayKey(d), 0)) d.setDate(d.getDate() - 1);
		while (load('scen.daily-' + SC.dayKey(d), 0) > 0) { n++; d.setDate(d.getDate() - 1); }
		return n;
	}
	function buildScenarios() {
		const list = $('scen-list');
		list.innerHTML = '';
		const today = defs.some((x) => BUILTIN.has(x.id)) ? [dailyFor()] : [];
		for (const sc of today.concat(SCENARIOS)) {
			const def = defs.find((d) => d.id === sc.route);
			const best = load('scen.' + sc.id, 0);
			const el = document.createElement('div');
			el.className = 'scen' + (sc.daily ? ' daily' : '');
			const goals = def ? (sc.goals || []).map((g) => `<li>${esc(SC.goalText(g, def))}</li>`).join('') : '';
			el.innerHTML = `<h3><span>${esc(sc.title)} <small class="lvl">${esc(sc.level)}</small></span><span class="stars" title="Najlepszy wynik">${'★'.repeat(best)}<i class="off">${'★'.repeat(3 - best)}</i></span></h3>
				<div class="t">${def ? esc(def.title) : 'trasa niedostępna'} · ${esc(trainLabel(sc.train))} · ${esc(sc.clock)}</div>
				<p>${esc(sc.desc)}</p>${goals ? `<ul>${goals}</ul>` : ''}${sc.daily ? `<div class="t">Seria: ${dailyStreak()} ${plural(dailyStreak(), 'dzień', 'dni', 'dni')} z rzędu</div>` : ''}`;
			const b = document.createElement('button');
			b.className = 'primary';
			b.textContent = best ? 'Jedź jeszcze raz' : 'Jedź';
			b.disabled = !def;
			b.addEventListener('click', () => { scen = sc; startGame(); });
			el.appendChild(b);
			list.appendChild(el);
		}
	}

	// „Co nowego” – historia wersji z js/news.js (najnowsza na górze)
	function buildNews() {
		const list = $('news-list');
		list.innerHTML = '';
		for (const v of window.TrainNews || []) {
			const sec = document.createElement('section');
			sec.className = 'news-ver';
			sec.innerHTML = `<h3>Wersja ${esc(v.version)} <small>${esc(v.date)}</small></h3>` + v.groups.map(([g, items]) => `<h4>${esc(g)}</h4><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`).join('');
			list.appendChild(sec);
		}
	}
	$('btn-news').addEventListener('click', () => { buildNews(); menuScreen('news'); });
	$('btn-hist').addEventListener('click', () => { buildHistory(); menuScreen('hist'); });
	$('hist-back').addEventListener('click', () => menuScreen('main'));
	$('news-back').addEventListener('click', () => menuScreen('main'));
	$('gen-run').addEventListener('click', runGenerator);
	for (const id of ['gen-from', 'gen-to', 'gen-line']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') runGenerator(); e.stopPropagation(); });
	$('btn-settings').addEventListener('click', () => openSettings('menu'));
	$('btn-pause-settings').addEventListener('click', () => openSettings('pause'));
	$('btn-load').addEventListener('click', () => openSaves('menu'));
	$('btn-saves').addEventListener('click', () => openSaves('pause'));
	$('saves-back').addEventListener('click', closeSaves);
	$('settings-back').addEventListener('click', closeSettings);
	// wyjście tylko w aplikacji desktopowej (Electron)
	const desktop = !!(window.desktop && window.desktop.quit) || /Electron/i.test(navigator.userAgent);
	$('btn-exit').classList.toggle('hidden', !desktop);
	$('btn-exit').addEventListener('click', quitApp);
	$('version').textContent = 'wersja 0.15.0';
	$('opt-assist').checked = load('opt.assist', true);
	$('opt-shp').checked = load('opt.shp', false);
	$('opt-drive').value = load('opt.drive', 'simple');
	$('opt-season').value = load('opt.season', 'summer');
	$('opt-drive').addEventListener('change', () => { save('opt.drive', $('opt-drive').value); buildMenu(); });
	$('opt-season').addEventListener('change', () => { save('opt.season', $('opt-season').value); buildMenu(); });
	$('opt-traffic').value = String(load('opt.traffic', 2));
	$('opt-traffic-pen').checked = load('opt.trafficPen', false);
	$('opt-dispatch').checked = load('opt.dispatch', true);
	$('opt-dispatch').addEventListener('change', () => save('opt.dispatch', $('opt-dispatch').checked));
	// suwak ruchu na linii: 0 – brak (losowy pociąg z przeciwka tylko dla widoku), 1–3 – mały, średni, duży
	const trafficVal = () => { $('opt-traffic-val').textContent = ['brak (tylko pociągi z przeciwka dla widoku)', 'mały ruch', 'średni ruch', 'duży ruch'][Number($('opt-traffic').value)]; };
	trafficVal();
	$('opt-traffic').addEventListener('input', trafficVal);
	$('opt-traffic').addEventListener('change', () => { save('opt.traffic', Number($('opt-traffic').value)); buildMenu(); });
	$('opt-traffic-pen').addEventListener('change', () => save('opt.trafficPen', $('opt-traffic-pen').checked));
	$('opt-brake').value = load('opt.brake', 'simple');
	$('opt-shp').addEventListener('change', () => { save('opt.shp', $('opt-shp').checked); buildMenu(); });
	$('opt-brake').addEventListener('change', () => { save('opt.brake', $('opt-brake').value); buildMenu(); });
	document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') togglePause(); });
	// zamknięcie karty albo okna aplikacji w czasie jazdy – autozapis
	window.addEventListener('pagehide', () => { if (sim) autoSave(); });

	// podgląd stanu z konsoli przeglądarki (diagnostyka)
	window.maszynista = { get sim() { return sim || demo; }, renderer, get preview() { return preview; }, setTrain: (c, sel = 0) => { selCar = sel; setCfg(c); }, bench: (n) => renderer.bench(sim || demo, n) };

	toMenu();
	loadCustom();
	requestAnimationFrame(frame);
	// ekran startowy: logo, pasek do zbudowania podglądu w menu, potem klik albo klawisz
	if (window.TrainScreens) window.TrainScreens.boot({ version: $('version').textContent, ready: () => !demo || renderer.world.pending === 0 });
	else if ($('boot')) $('boot').remove();
})();
