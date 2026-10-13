/* Spina wszystko: menu, pętla gry, klawiatura, ekran końcowy. */
(function () {
	'use strict';
	const R = window.TrainRoutes;
	const { Sim, autopilot, buildTimetable, fmtClock, fmtDelay } = window.TrainSim;

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
	function routeFor(def) {
		const c = cfgFor(def);
		const key = `${def.id}|${R.configKey(c)}`;
		if (!prepared[key]) prepared[key] = R.prepare(def, c);
		return prepared[key];
	}
	function routeById(id) { return routeFor(defById(id)); }
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
		$('sum-cond').textContent = `${wName}, ${tName}`;
		$('sum-help').textContent = [$('opt-ca').checked ? 'czuwak' : '', $('opt-assist').checked ? 'asystent' : ''].filter(Boolean).join(', ') || 'bez pomocy';
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
			row.append(cb, info, play, del);
			list.appendChild(row);
		}
		updateExportUI();
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

	function applySettings() {
		const vol = Number($('set-volume').value) / 100;
		$('set-volume-val').textContent = Math.round(vol * 100) + '%';
		muted = !$('set-sound').checked;
		audio.setMuted(muted);
		audio.setVolume(vol);
		const opts = { scale: Number($('set-scale').value), aa: $('set-aa').checked, shadows: $('set-shadows').checked };
		renderer.setRenderOptions(opts);
		$('fps').classList.toggle('hidden', !$('set-fps').checked);
		save('muted', muted);
		save('opt.volume', vol);
		save('opt.render', opts);
		save('opt.fps', $('set-fps').checked);
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
			startClock: r.startClock, weather: $('opt-weather').value, ca: !!sim.opts.czuwak, assist: !!renderer.assist, timeScale,
			timetable: sim.timetable,
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
		// zapis staje się bieżącym wyborem w menu (trasa, skład, warunki)
		selected = d.route;
		trainMode = modeOf(trainCfg);
		save('route', selected);
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
	// snap – zapis gry (loadGame): jazda od zapisanego miejsca zamiast od początku trasy
	function startGame(snap) {
		if (!(snap && snap.sim)) snap = null;
		if (!defs.length || !selected) { menuScreen('gen'); buildGenScreen(); return; } // bez tras – do generatora
		if (mode === 'loading') return;
		const def = defById(selected), route = routeById(selected), t = route.train;
		const dep = snap ? snap.clock : depClock(def), h = Math.floor(dep / 3600) % 24;
		const wsel = $('opt-weather');
		const kind = route.freight ? 'POCIĄG TOWAROWY' : (route.name.split(' ')[0] || 'Pociąg').toUpperCase();
		const km = ((def.stations[def.stations.length - 1].pos - def.stations[0].pos) / 1000).toFixed(1).replace('.', ',');
		loadingScreen = window.TrainScreens ? window.TrainScreens.loading({
			eyebrow: `${kind} · ${def.real ? 'TRASA RZECZYWISTA' : 'TRASA'}`,
			title: route.title,
			sub: `${t.name} · ${snap ? 'zapis z godz.' : 'odjazd'} ${fmtClock(dep).slice(0, 5)} · ${wsel.options[wsel.selectedIndex].text} · ${km} km`,
			night: h < 5 || h >= 21 ? 0.9 : h < 7 || h >= 19 ? 0.5 : 0.12,
		}) : null;
		mode = 'loading';
		loadingFrames = 0;
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
			hud.toast('Gdy semafor zmieni się na zielony, przesuń nastawnik w górę (↑).', 'info');
		}
		hud.toast('Kamera: przeciągnij myszą lub ←/→, kółko – oddalenie, V – tryb kamery, C – widok domyślny.', 'info');
		if (loadingScreen) loadingScreen.done();
		loadingScreen = null;
	}
	function beginGame(snap) {
		exitFree();
		document.querySelector('.controls [data-act=wipers]')?.classList.remove('on');
		const route = routeById(selected);
		applyClock(route);
		if (snap) route.startClock = snap.startClock; // godzina z zapisu (także przestawiona w pauzie)
		save('trainCfg', trainCfg);
		const opts = { czuwak: $('opt-ca').checked, timetable: snap ? snap.timetable : timetable(route) };
		sim = snap ? Sim.restore(route, opts, snap.sim) : new Sim(route, opts);
		resumed = !!snap;
		save('opt.ca', $('opt-ca').checked);
		save('opt.assist', $('opt-assist').checked);
		renderer.assist = $('opt-assist').checked;
		applyGraphics();
		renderer.reset(sim);
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
		renderer.setWeather(w);
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
		const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.4 ? 1 : 0;
		$('end-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
		$('end-points').textContent = `${score} / ${max} pkt`;
		if (ok) {
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
			['przejazdy', p.crossing], ['przejechane perony', p.overrun], ['pantograf pod obciążeniem', p.panto || 0],
		].filter(([, v]) => v > 0).map(([k, v]) => `${k} −${Math.round(v)}`);
		$('end-penalties').innerHTML = `Premia za syrenę przed przejazdami: +${sim.bonus}. ` + (parts.length ? `Kary: ${parts.join(', ')}.` : 'Bez kar – wzorowa jazda!');
		showOverlay('end');
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
				if (++loadingFrames >= 4 && !(renderer.world.pending > 0)) finishLoading();
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
			renderer.draw(demo, dt, 0);
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
		}
		requestAnimationFrame(frame);
	}

	// ---------- wejście ----------
	const KEYS = {
		ArrowUp: () => sim.leverUp(), KeyW: () => sim.leverUp(),
		ArrowDown: () => sim.leverDown(), KeyS: () => sim.leverDown(),
		Digit0: () => sim.neutral(), Numpad0: () => sim.neutral(),
		KeyE: () => sim.emergency(), Backspace: () => sim.emergency(),
		KeyD: () => sim.toggleDoors(),
		Space: () => { sim.ackCzuwak(); audio.play('click'); },
		KeyH: () => { sim.horn = true; },
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
			if (e.code === 'Enter' && screen === 'single') startGame();
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
		const fn = KEYS[e.code];
		if (!fn) return;
		e.preventDefault();
		if (e.repeat && e.code !== 'ArrowUp' && e.code !== 'ArrowDown' && e.code !== 'KeyW' && e.code !== 'KeyS') return;
		audio.ensure();
		fn();
	});
	document.addEventListener('keyup', (e) => {
		delete freeKeysDown[e.code];
		if (e.code === 'KeyH' && sim) sim.horn = false;
		if ((e.code === 'ArrowLeft' && renderer.rotKey < 0) || (e.code === 'ArrowRight' && renderer.rotKey > 0)) renderer.rotKey = 0;
		if (e.code === 'PageUp' || e.code === 'PageDown') renderer.pitchKey = 0;
		if (/^(Equal|Minus|NumpadAdd|NumpadSubtract)$/.test(e.code)) renderer.zoomKey = 0;
	});

	const ACTIONS = {
		up: () => sim.leverUp(), down: () => sim.leverDown(), neutral: () => sim.neutral(),
		doors: () => sim.toggleDoors(), ca: () => sim.ackCzuwak(), emergency: () => sim.emergency(),
		cab: () => KEYS.KeyK(), camera: () => KEYS.KeyV(), time: () => KEYS.KeyT(), wipers: () => KEYS.KeyR(), panto: () => KEYS.KeyU(),
	};
	document.querySelectorAll('.controls button').forEach((b) => {
		const act = b.dataset.act;
		b.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			if (mode !== 'play') return;
			audio.ensure();
			if (act === 'horn') sim.horn = true;
			else ACTIONS[act]();
		});
		if (act === 'horn') {
			const off = () => { if (sim) sim.horn = false; };
			b.addEventListener('pointerup', off);
			b.addEventListener('pointerleave', off);
		}
		b.addEventListener('click', (e) => e.preventDefault());
	});

	$('btn-start').addEventListener('click', () => startGame());
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
	$('set-scale').value = String(ro.scale);
	$('set-aa').checked = ro.aa;
	$('set-shadows').checked = ro.shadows;
	$('set-fps').checked = load('opt.fps', false);
	for (const id of ['set-sound', 'set-volume', 'set-scale', 'set-aa', 'set-shadows', 'set-fps']) $(id).addEventListener(id === 'set-volume' ? 'input' : 'change', applySettings);
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
	$('version').textContent = 'wersja 0.2.0';
	$('opt-assist').checked = load('opt.assist', true);
	document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') togglePause(); });
	// zamknięcie karty albo okna aplikacji w czasie jazdy – autozapis
	window.addEventListener('pagehide', () => { if (sim) autoSave(); });

	// podgląd stanu z konsoli przeglądarki (diagnostyka)
	window.maszynista = { get sim() { return sim || demo; }, renderer, get preview() { return preview; }, setTrain: (c, sel = 0) => { selCar = sel; setCfg(c); } };

	toMenu();
	loadCustom();
	requestAnimationFrame(frame);
	// ekran startowy: logo, pasek do zbudowania podglądu w menu, potem klik albo klawisz
	if (window.TrainScreens) window.TrainScreens.boot({ version: $('version').textContent, ready: () => !demo || renderer.world.pending === 0 });
	else if ($('boot')) $('boot').remove();
})();
