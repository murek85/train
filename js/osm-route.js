/* Generator tras z prawdziwych danych: tory, stacje, prędkości, semafory, mosty i tunele z OpenStreetMap
   (Overpass API), profil wysokości z modelu terenu Copernicus DEM (Open-Meteo). Wynik to opis trasy
   w formacie gry (jak w routes.js) z krzywizną toru zamiast listy łuków.
   Działa w przeglądarce (generator w menu) i w Node (tools/osm-route.js – trasy dołączone do gry).
   Dane: © współtwórcy OpenStreetMap (ODbL), Copernicus DEM. */
(function (root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.TrainOSM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
	'use strict';

	// główny serwer i lustra (z nagłówkami CORS – działają też z przeglądarki)
	const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
	const ELEVATION = 'https://api.open-meteo.com/v1/elevation';
	const POLAND = '49.0,14.1,54.9,24.2';
	const STEP = 10; // krok próbkowania przebiegu (m)
	const NMT = 'https://services.gugik.gov.pl/nmt/?request=GetHbyPointList';
	const SOURCE = 'Dane: © współtwórcy OpenStreetMap (ODbL), NMT, NMPT i BDOT10k – GUGiK (geoportal.gov.pl), Copernicus DEM (Open-Meteo)';
	const isNode = typeof window === 'undefined';
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	// ---------- pobieranie ----------
	// zapytanie z limitem czasu (serwer potrafi zawiesić połączenie) i komunikatem co 15 s
	async function fetchTimed(url, init, ms, log) {
		const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
		const t0 = Date.now();
		const kill = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
		const tick = log ? setInterval(() => log(`…nadal pobieram (${Math.round((Date.now() - t0) / 1000)} s)`), 15000) : null;
		try {
			return await fetch(url, Object.assign({}, init, ctrl ? { signal: ctrl.signal } : {}));
		} finally {
			if (kill) clearTimeout(kill);
			if (tick) clearInterval(tick);
		}
	}

	// limit zapytań na serwerze (zwykle 2 miejsca na adres IP): ile sekund do zwolnienia miejsca
	async function slotWait(url) {
		try {
			const res = await fetchTimed(url.replace(/interpreter$/, 'status'), {}, 15000);
			const t = await res.text();
			if (/slots? available now/.test(t)) return 0;
			const m = t.match(/in (\d+) seconds/);
			return m ? Number(m[1]) + 1 : 10;
		} catch (e) { return 10; }
	}

	async function overpass(query, log, ms) {
		let lastErr = null, waited = 0;
		for (let attempt = 0; attempt < 6; attempt++) {
			// główny serwer dwa razy, potem serwery zapasowe
			const url = OVERPASS[attempt < 2 ? 0 : (attempt - 1) % OVERPASS.length];
			try {
				const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
				if (isNode) headers['User-Agent'] = 'maszynista-route-generator/0.1';
				const res = await fetchTimed(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers }, ms || 90000, log);
				if (res.status === 429 && waited < 240) {
					// przekroczony limit – czekamy na wolne miejsce (nie liczy się jako nieudana próba)
					const sec = await slotWait(url);
					if (log) log(`Czekam na wolne miejsce na serwerze danych (${sec} s)…`);
					await sleep(sec * 1000);
					waited += sec;
					attempt--;
					continue;
				}
				const text = await res.text();
				// błąd w zapytaniu – ponawianie nic nie da
				if (res.status === 400) throw Object.assign(new Error('błędne zapytanie do serwera danych: ' + text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)), { fatal: true });
				if (text.trim().startsWith('{')) {
					const j = JSON.parse(text);
					// przekroczenie czasu/pamięci: serwer zwraca JSON z uwagą i niepełnymi danymi
					if (!(j.remark && /error|timed out|out of memory/i.test(j.remark))) return j;
					lastErr = new Error(j.remark);
				} else lastErr = new Error(`serwer ${new URL(url).host} odpowiedział błędem (${res.status})`);
			} catch (e) {
				if (e.fatal) throw e;
				lastErr = e.name === 'AbortError' ? new Error('przekroczony czas oczekiwania') : e;
			}
			if (log) log(`Serwer danych zajęty${lastErr ? ' (' + String(lastErr.message).slice(0, 70) + ')' : ''} – ponawiam (${attempt + 1}/6)…`);
			await sleep(1500 * (attempt + 1));
		}
		throw new Error('Serwery OpenStreetMap nie odpowiadają – spróbuj ponownie za chwilę. ' + (lastErr ? `(${lastErr.message})` : ''));
	}

	// Open-Meteo ma limit zapytań na minutę (liczony od liczby punktów): duże zestawy rozkładamy w czasie,
	// a po odmowie (429) czekamy minutę i ponawiamy
	async function elevations(points, log) {
		const out = [];
		const pace = points.length > 400;
		for (let i = 0; i < points.length; i += 100) {
			const part = points.slice(i, i + 100);
			const url = `${ELEVATION}?latitude=${part.map((p) => p.lat.toFixed(5)).join(',')}&longitude=${part.map((p) => p.lon.toFixed(5)).join(',')}`;
			let ok = false;
			for (let attempt = 0; attempt < 6 && !ok; attempt++) {
				let limited = false;
				try {
					const res = await fetch(url);
					const j = await res.json();
					if (Array.isArray(j.elevation)) { out.push(...j.elevation); ok = true; }
					else limited = res.status === 429 || /limit/i.test(j.reason || '');
				} catch (e) { /* ponów */ }
				if (!ok) {
					if (limited && log) log('Limit serwera wysokości – czekam minutę…');
					await sleep(limited ? 61000 : 1500 * (attempt + 1));
				}
			}
			if (!ok) throw new Error('Nie udało się pobrać wysokości terenu (Open-Meteo).');
			if (log) log(`Wysokości terenu: ${Math.min(points.length, i + 100)} / ${points.length}`);
			if (pace && i + 100 < points.length) await sleep(11000);
		}
		return out;
	}

	// domknięcie wartości v w punktach L (narastająca odległość): maksimum, potem minimum w oknie ±r – usuwa zagłębienia
	// węższe niż 2r (pod mostem NMT pokazuje dno doliny albo drogi, a tor biegnie wyżej)
	function closeDips(v, L, r) {
		const win = (src, f) => src.map((_, i) => {
			let m = src[i];
			for (let j = i - 1; j >= 0 && L[i] - L[j] <= r; j--) m = f(m, src[j]);
			for (let j = i + 1; j < src.length && L[j] - L[i] <= r; j++) m = f(m, src[j]);
			return m;
		});
		return win(win(v, Math.max), Math.min);
	}
	/* śledzenie trendu wzdłuż łamanej (v w punktach L): przewidywanie z ostatnich `win` m pewnych punktów (pochylenie do
	   ±slope); punkt odskakujący o ponad tol – odrzucony (most nad doliną: NMT pokazuje dno; pomost wiaduktu nad torem
	   zostawiony w NMT), najwyżej na maxLen m – dalej przyjmowany jako nowy poziom; odrzucone – liniowo między pewnymi */
	function trendFix(v, L, slope, tol, win, maxLen) {
		const ok = v.map(Number.isFinite), rel = [];
		let run0 = null;
		for (let k = 0; k < v.length; k++) {
			if (!ok[k]) continue;
			if (rel.length >= 2) {
				let use = [];
				for (let q = rel.length - 1; q >= 0 && L[k] - L[rel[q]] <= win; q--) use.push(rel[q]);
				if (use.length < 2) use = rel.slice(-2);
				let mx = 0, my = 0;
				for (const q of use) { mx += L[q]; my += v[q]; }
				mx /= use.length;
				my /= use.length;
				let sxx = 0, sxy = 0;
				for (const q of use) { sxx += (L[q] - mx) ** 2; sxy += (L[q] - mx) * (v[q] - my); }
				const sl = Math.max(-slope, Math.min(slope, sxx > 0 ? sxy / sxx : 0));
				const r = v[k] - (my + sl * (L[k] - mx));
				if (Math.abs(r) > tol && (run0 === null || L[k] - L[run0] < maxLen)) {
					ok[k] = false;
					if (run0 === null) run0 = k;
					continue;
				}
			}
			run0 = null;
			rel.push(k);
		}
		const out = v.slice();
		let last = -1;
		for (let k = 0; k <= v.length; k++) {
			if (k < v.length && !ok[k]) continue;
			if (last < 0 && k < v.length) for (let q = 0; q < k; q++) out[q] = v[k];
			else if (k === v.length) { if (last >= 0) for (let q = last + 1; q < v.length; q++) out[q] = v[last]; }
			else for (let q = last + 1; q < k; q++) out[q] = v[last] + ((v[k] - v[last]) * (L[q] - L[last])) / (L[k] - L[last] || 1);
			last = k;
		}
		return out;
	}
	// otwarcie: minimum, potem maksimum – usuwa garby węższe niż 2r (pomost wiaduktu nad torem zostawiony w NMT)
	function openBumps(v, L, r) {
		return closeDips(v.map((x) => -x), L, r).map((x) => -x);
	}

	/* NMT GUGiK: numeryczny model terenu z lotniczego skaningu laserowego (siatka 1 m, dokładność ok. 0,1–0,2 m, cała
	   Polska; mosty i budynki usunięte – pod wiaduktem prawdziwe dno). Zapytanie: lista punktów w układzie PL-1992
	   (EPSG:2180), metodą POST. */
	function to1992(lat, lon) {
		// odwzorowanie Gaussa-Krügera: elipsoida GRS80, południk osiowy 19°, skala 0,9993
		const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, ep2 = e2 / (1 - e2), k0 = 0.9993;
		const phi = (lat * Math.PI) / 180, A = (((lon - 19) * Math.PI) / 180) * Math.cos(phi);
		const sn = Math.sin(phi), N = a / Math.sqrt(1 - e2 * sn * sn), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2;
		const e4 = e2 * e2, e6 = e4 * e2;
		const M = a * ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) - ((35 * e6) / 3072) * Math.sin(6 * phi));
		const x = k0 * (M + N * Math.tan(phi) * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
		const y = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120);
		return [x - 5300000, y + 500000];
	}
	// wysokości (m n.p.m.) punktów {lat, lon}; cache (Map "x y" → h) – opcjonalnie, do ponownego generowania bez pobierania.
	// Serwer podaje wysokość tylko dla pierwszych 1000 punktów zapytania – paczki po 1000, po 4 naraz.
	async function nmtHeights(points, log, cache) {
		const got = cache || new Map();
		const keys = points.map((p) => { const [x, y] = to1992(p.lat, p.lon); return x.toFixed(1) + ' ' + y.toFixed(1); });
		/* wysokość dokładnie 0 m to błąd usługi (przeciążony serwer odpowiada zerami – w Polsce teren na poziomie
		   0,0 m praktycznie nie występuje); taki punkt, także zapisany wcześniej w pamięci, pobieramy ponownie, a
		   paczkę z przewagą zer traktujemy jak nieudaną odpowiedź. Bez tego niweleta miała urwiska i pochylenia
		   −40‰ (automat budujący rozkład nie wyhamowywał przed semaforem). */
		const bad = (h) => !Number.isFinite(h) || h === 0;
		const need = [...new Set(keys.filter((k) => bad(got.get(k))))];
		const parts = [];
		for (let i = 0; i < need.length; i += 1000) parts.push(need.slice(i, i + 1000));
		let done = 0, next = 0;
		const one = async (part) => {
			for (let attempt = 0; attempt < 5; attempt++) {
				try {
					const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
					if (isNode) headers['User-Agent'] = 'maszynista-route-generator/0.1';
					const res = await fetchTimed(NMT, { method: 'POST', body: 'list=' + part.join(','), headers }, 60000);
					const vals = (await res.text()).trim().split(',');
					if (res.ok && vals.length === part.length) {
						const hs = vals.map((v) => Number(v.trim().split(/\s+/)[2]));
						const zeros = hs.filter((h) => h === 0).length;
						if (zeros > part.length * 0.5 && attempt < 4) throw new Error('zera w odpowiedzi');
						hs.forEach((h, j) => got.set(part[j], Number.isFinite(h) && h > -100 && h !== 0 ? h : NaN));
						return;
					}
				} catch (e) { /* ponów */ }
				await sleep(2000 * (attempt + 1));
			}
			throw new Error('Nie udało się pobrać wysokości z NMT (GUGiK).');
		};
		const worker = async () => {
			while (next < parts.length) {
				await one(parts[next++]);
				done++;
				if (log && parts.length > 5 && (done % 10 === 0 || done === parts.length)) log(`Wysokości NMT: ${Math.min(need.length, done * 1000)} / ${need.length}`);
			}
		};
		await Promise.all([worker(), worker(), worker(), worker()]);
		return keys.map((k) => (bad(got.get(k)) ? NaN : got.get(k)));
	}

	/* NMPT GUGiK: numeryczny model pokrycia terenu (powierzchnia z budynkami, drzewami, mostami) – usługa WCS, siatka
	   0,5 m; pobieramy kafelki 1 km przeskalowane do 4 m (serwer odpowiada 20–45 s na zapytanie, niezależnie od
	   rozmiaru – po 8 naraz). Osie WCS: x – wschód, y – północ (EPSG:2180). */
	const NMPT = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel';
	const NMPT_Q = '?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=DSM_PL-EVRF2007-NH&FORMAT=image/x-aaigrid';
	/* Usługa nie wysyła nagłówków CORS: w Node – wprost; w aplikacji desktopowej – window.desktop.fetchText (proces
	   główny); w przeglądarce – przez pośrednika serwera gry (/gugik/nmpt, server.js). */
	async function nmptText(q) {
		if (isNode) {
			const res = await fetchTimed(NMPT + q, { headers: { 'User-Agent': 'maszynista-route-generator/0.1' } }, 180000);
			return res.ok ? res.text() : null;
		}
		const dk = typeof window !== 'undefined' && window.desktop;
		if (dk && dk.fetchText) return dk.fetchText(NMPT + q);
		if (typeof location !== 'undefined' && !/^https?:/.test(location.protocol)) throw Object.assign(new Error('gra otwarta z pliku – pobieranie NMPT wymaga serwera gry (npm start)'), { fatal: true });
		const res = await fetchTimed('gugik/nmpt' + q, {}, 180000);
		return res.ok ? res.text() : null;
	}
	const NMPT_TILE = 1000, NMPT_CELL = 4;
	// siatka Arc/Info ASCII z odpowiedzi WCS: { e0, n0, cs, nc, nr, v } – wysokości w dm (−1 – brak), wiersze od północy
	function parseGrid(t) {
		const i = t.indexOf('ncols');
		if (i < 0) return null;
		let body = t.slice(i);
		const j = body.indexOf('--wcs');
		if (j > 0) body = body.slice(0, j);
		const lines = body.split('\n'), hd = {};
		let li = 0;
		while (li < lines.length && /^[a-zA-Z_]/.test(lines[li])) {
			const [k, val] = lines[li].trim().split(/\s+/);
			hd[k.toLowerCase()] = Number(val);
			li++;
		}
		const nodata = hd.nodata_value !== undefined ? hd.nodata_value : -9999;
		const vals = lines.slice(li).join(' ').trim().split(/\s+/).map(Number);
		if (!hd.ncols || vals.length < hd.ncols * hd.nrows) return null;
		return { e0: hd.xllcorner, n0: hd.yllcorner, cs: hd.cellsize, nc: hd.ncols, nr: hd.nrows, v: vals.slice(0, hd.ncols * hd.nrows).map((x) => (x === nodata || !Number.isFinite(x) || x < -100 ? -1 : Math.round(x * 10))) };
	}
	// wycinek NMPT w pełnej rozdzielczości (0,5 m) – perony
	async function nmptBox(e0, n0, e1, n1) {
		const q = `${NMPT_Q}&SUBSET=x(${Math.floor(e0)},${Math.ceil(e1)})&SUBSET=y(${Math.floor(n0)},${Math.ceil(n1)})`;
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				const T = parseGrid((await nmptText(q)) || '');
				if (T) return T;
			} catch (e) {
				if (e.fatal) throw e;
			}
			await sleep(3000 * (attempt + 1));
		}
		throw new Error('Nie udało się pobrać wycinka NMPT.');
	}
	// kafelek: { e0, n0, cs, nc, nr, v } – wysokości w dm (−1 – brak), wiersze od północy
	async function nmptTile(e0, n0) {
		const q = `${NMPT_Q}&SUBSET=x(${e0},${e0 + NMPT_TILE})&SUBSET=y(${n0},${n0 + NMPT_TILE})&SCALEFACTOR=${0.5 / NMPT_CELL}`;
		for (let attempt = 0; attempt < 6; attempt++) {
			try {
				const T = parseGrid((await nmptText(q)) || '');
				if (T) return T;
			} catch (e) {
				if (e.fatal) throw e;
			}
			await sleep(3000 * (attempt + 1));
		}
		throw new Error('Nie udało się pobrać modelu powierzchni (NMPT, GUGiK).');
	}
	// kafelki pokrywające punkty {lat, lon} (brakujące – pobrane; cache: Map "e,n" → kafelek); zwraca próbnik
	// (n, e, r) → wysokość (m) – maksimum z komórek w promieniu r (komórki 4 m)
	async function nmptSampler(points, log, cache, onTile) {
		const tiles = cache || new Map();
		const key = (n, e) => Math.floor(e / NMPT_TILE) * NMPT_TILE + ',' + Math.floor(n / NMPT_TILE) * NMPT_TILE;
		const need = new Set();
		for (const p of points) { const [n, e] = to1992(p.lat, p.lon); need.add(key(n, e)); }
		const todo = [...need].filter((k) => !tiles.has(k));
		if (log) log(todo.length ? `Pobieram model powierzchni NMPT (${todo.length} kafelków 1 km${need.size > todo.length ? `, ${need.size - todo.length} z pamięci` : ''}; serwer odpowiada wolno – ok. ${Math.max(1, Math.round((todo.length * 9) / 60))} min)…` : `Model powierzchni NMPT: ${need.size} kafelków z pamięci.`);
		// kafelek, którego nie udało się pobrać, pomijamy (budynki i drzewa w nim – z danych OSM)
		let next = 0, done = 0, failed = 0;
		const worker = async () => {
			while (next < todo.length) {
				const k = todo[next++], [e0, n0] = k.split(',').map(Number);
				try {
					const T = await nmptTile(e0, n0);
					tiles.set(k, T);
					if (onTile) onTile(tiles, k, T);
				} catch (e) {
					if (e.fatal) { next = todo.length; throw e; }
					failed++;
				}
				done++;
				if (log && (done % 5 === 0 || done === todo.length)) log(`NMPT: ${done} / ${todo.length}${failed ? ` (nieudane: ${failed})` : ''}`);
			}
		};
		await Promise.all(Array.from({ length: 8 }, worker));
		if (failed > todo.length / 2) throw new Error(`nie udało się pobrać ${failed} z ${todo.length} kafelków`);
		return (n, e, r) => {
			const T = tiles.get(key(n, e));
			if (!T) return NaN;
			const c = Math.floor((e - T.e0) / T.cs), rr = T.nr - 1 - Math.floor((n - T.n0) / T.cs), R0 = r || 0;
			let m = -1;
			for (let a = -R0; a <= R0; a++) for (let q = -R0; q <= R0; q++) {
				const cc = c + a, r2 = rr + q;
				if (cc >= 0 && r2 >= 0 && cc < T.nc && r2 < T.nr) m = Math.max(m, T.v[r2 * T.nc + cc]);
			}
			return m < 0 ? NaN : m / 10;
		};
	}

	// stacje i przystanki o podanych nazwach (w Polsce)
	async function findStations(names, log) {
		const q = `[out:json][timeout:60];(${names.map((n) => `node["railway"~"^(station|halt)$"]["name"="${n.replace(/"/g, '')}"](${POLAND});`).join('')});out body;`;
		const d = await overpass(q, log);
		return d.elements.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon)).map((e) => ({ name: e.tags.name, lat: e.lat, lon: e.lon, type: e.tags.railway }));
	}

	// wszystko, co potrzebne do zbudowania trasy w prostokącie obejmującym obie stacje
	// line – numer linii: wtedy tylko tory tej linii + wszystkie tory w promieniu 1,5 km od obu stacji (mniejsze zapytanie);
	// bez numeru (albo gdy przebieg się nie domknie) – wszystkie tory w prostokącie
	async function fetchCorridor(a, b, log, line) {
		if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) throw new Error('Brak współrzędnych stacji.');
		const m = 0.035 + 0.12 * Math.max(Math.abs(a.lat - b.lat), Math.abs(a.lon - b.lon));
		const S = Math.min(a.lat, b.lat) - m, N = Math.max(a.lat, b.lat) + m;
		const W = Math.min(a.lon, b.lon) - m * 1.6, E = Math.max(a.lon, b.lon) + m * 1.6;
		const bb = [S, W, N, E].map((v) => v.toFixed(4)).join(',');
		// bez bocznic, torów stacji rozrządowych i bocznic przemysłowych (nie prowadzi po nich przebieg, a jest ich dużo)
		const L = String(line || '').replace(/[^0-9A-Za-z]/g, '');
		const sel = L
			? `(way["railway"="rail"]["ref"~"(^|;)${L}(;|$)"];way["railway"="rail"](around:1500,${a.lat},${a.lon});way["railway"="rail"](around:1500,${b.lat},${b.lon});)`
			: 'way["railway"="rail"]["service"!~"^(yard|siding|spur)$"]';
		// semafory, przejazdy i rozjazdy osobno, po dokładnych wartościach tagów (szybkie wyszukiwanie w indeksie
		// zamiast pobierania wszystkich węzłów torów); węzły spoza przebiegu generator po prostu pomija
		const q = `[out:json][timeout:150][bbox:${bb}];${sel};out body geom;(node["railway"="signal"];node["railway"="level_crossing"];node["railway"="switch"];);out tags;(node["railway"="station"];node["railway"="halt"];);out body;(way["waterway"="river"];way["waterway"="canal"];);out geom;`;
		if (log) log('Pobieram tory, semafory i stacje z OpenStreetMap (zwykle do minuty)…');
		return overpass(q, log, 190000);
	}

	// otoczenie (budynki, drogi, zagospodarowanie, wody) w prostokątach co ~1,5 km wzdłuż przebiegu (z marginesem);
	// prostokąty serwer obsługuje z indeksu przestrzennego – zapytanie „wokół linii” było dla niego za ciężkie
	async function fetchEnvironment(poly, log) {
		const boxes = [];
		for (let i = 0; i < poly.length - 1; i += 6) {
			const seg = poly.slice(i, i + 7);
			const la = seg.map((p) => p.lat), lo = seg.map((p) => p.lon);
			const mlo = 0.0052 / Math.cos((la[0] * Math.PI) / 180);
			boxes.push([Math.min(...la) - 0.0052, Math.min(...lo) - mlo, Math.max(...la) + 0.0052, Math.max(...lo) + mlo].map((v) => v.toFixed(4)).join(','));
		}
		const sel = (f) => boxes.map((b) => `${f}(${b});`).join('');
		const hw = 'way["highway"]["highway"!~"^(footway|path|steps|cycleway|track|bridleway|corridor|platform|proposed|construction|elevator|raceway|bus_stop|services|rest_area)$"]';
		const q = `[out:json][timeout:240];(${sel('way["building"]')}${sel(hw)}${sel('way["landuse"]')}${sel('way["natural"]')}${sel('way["leisure"]')}${sel('way["waterway"]')}${sel('way["amenity"="grave_yard"]')}${sel('way["railway"="rail"]')}${sel('way["railway"="disused"]')}${sel('way["disused:railway"="rail"]')}${sel('way["railway"="platform"]')}${sel('way["public_transport"="platform"]["train"="yes"]')}${sel('way["amenity"="parking"]')}${sel('way["place"="square"]')})->.w;.w out tags geom;(${sel('node["railway"="switch"]')}${sel('node["railway"="railway_crossing"]')}${sel('node["power"="catenary_mast"]')}${sel('node["highway"="crossing"]')}${sel('node["amenity"~"^(police|fire_station|post_office|school|kindergarten|childcare|hospital|clinic|doctors|dentist|veterinary|pharmacy|bank|townhall|courthouse|library|theatre|cinema|place_of_worship|restaurant|fast_food|cafe|pub|bar|community_centre|arts_centre|social_facility|nursing_home|bus_station|fuel|car_wash|car_repair|university|college)$"]')}${sel('node["shop"]')}${sel('node["office"]')}${sel('node["healthcare"]')}${sel('node["tourism"~"^(hotel|hostel|guest_house|museum)$"]')})->.n;.n out;(${sel('relation["landuse"]')}${sel('relation["natural"]')}${sel('relation["leisure"]')}${sel('relation["railway"="platform"]')})->.m;.m out geom;`;
		if (log) log(`Pobieram otoczenie: budynki, drogi, lasy, wody (${boxes.length} odcinków; zwykle 1–2 minuty)…`);
		return overpass(q, log, 280000);
	}

	// same maszty sieci trakcyjnej w pasie trasy (dane otoczenia zapisane przed ich dodaniem do zapytania)
	async function fetchMasts(poly, log) {
		const boxes = [];
		for (let i = 0; i < poly.length - 1; i += 6) {
			const seg = poly.slice(i, i + 7);
			const la = seg.map((p) => p.lat), lo = seg.map((p) => p.lon);
			const mlo = 0.0052 / Math.cos((la[0] * Math.PI) / 180);
			boxes.push([Math.min(...la) - 0.0052, Math.min(...lo) - mlo, Math.max(...la) + 0.0052, Math.max(...lo) + mlo].map((v) => v.toFixed(4)).join(','));
		}
		if (log) log('Pobieram maszty sieci trakcyjnej…');
		const j = await overpass(`[out:json][timeout:120];(${boxes.map((b) => `node["power"="catenary_mast"](${b});`).join('')});out;`, log, 150000);
		return j.elements || [];
	}

	// punkty usług (urzędy, służby, sklepy, szkoły…) w pasie trasy – do rodzaju budynków (dane zapisane przed ich dodaniem)
	async function fetchPois(poly, log) {
		const boxes = [];
		for (let i = 0; i < poly.length - 1; i += 6) {
			const seg = poly.slice(i, i + 7);
			const la = seg.map((p) => p.lat), lo = seg.map((p) => p.lon);
			const mlo = 0.0052 / Math.cos((la[0] * Math.PI) / 180);
			boxes.push([Math.min(...la) - 0.0052, Math.min(...lo) - mlo, Math.max(...la) + 0.0052, Math.max(...lo) + mlo].map((v) => v.toFixed(4)).join(','));
		}
		if (log) log('Pobieram punkty usług (urzędy, służby, sklepy, szkoły)…');
		const sel = (f) => boxes.map((b) => `${f}(${b});`).join('');
		const j = await overpass(`[out:json][timeout:120];(${sel('node["amenity"~"^(police|fire_station|post_office|school|kindergarten|childcare|hospital|clinic|doctors|dentist|veterinary|pharmacy|bank|townhall|courthouse|library|theatre|cinema|place_of_worship|restaurant|fast_food|cafe|pub|bar|community_centre|arts_centre|social_facility|nursing_home|bus_station|fuel|car_wash|car_repair|university|college)$"]')}${sel('node["shop"]')}${sel('node["office"]')}${sel('node["healthcare"]')}${sel('node["tourism"~"^(hotel|hostel|guest_house|museum)$"]')});out;`, log, 150000);
		return j.elements || [];
	}

	// przejścia dla pieszych, parkingi i place w pasie trasy (dane otoczenia zapisane przed ich dodaniem do zapytania)
	async function fetchStreetExtras(poly, log) {
		const boxes = [];
		for (let i = 0; i < poly.length - 1; i += 6) {
			const seg = poly.slice(i, i + 7);
			const la = seg.map((p) => p.lat), lo = seg.map((p) => p.lon);
			const mlo = 0.0052 / Math.cos((la[0] * Math.PI) / 180);
			boxes.push([Math.min(...la) - 0.0052, Math.min(...lo) - mlo, Math.max(...la) + 0.0052, Math.max(...lo) + mlo].map((v) => v.toFixed(4)).join(','));
		}
		if (log) log('Pobieram przejścia dla pieszych, parkingi i place…');
		const sel = (f) => boxes.map((b) => `${f}(${b});`).join('');
		const j = await overpass(`[out:json][timeout:120];(${sel('way["amenity"="parking"]')}${sel('way["place"="square"]')}${sel('way["highway"="pedestrian"]["area"="yes"]')})->.w;.w out tags geom;(${sel('node["highway"="crossing"]')})->.n;.n out;`, log, 150000);
		return j.elements || [];
	}

	// ---------- geometria ----------
	function projector(lat0, lon0) {
		const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
		return {
			xy: (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky],
			ll: (x, y) => ({ lat: lat0 + y / ky, lon: lon0 + x / kx }),
		};
	}
	const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
	// długość drogi OSM (m) z geometrii
	const wayLen = (e) => {
		const g = (e.geometry || []).filter(Boolean);
		let L = 0;
		for (let i = 1; i < g.length; i++) L += Math.hypot((g[i].lat - g[i - 1].lat) * 110574, (g[i].lon - g[i - 1].lon) * 111320 * Math.cos((g[i].lat * Math.PI) / 180));
		return L;
	};
	const segDist = (p, a, b) => {
		const ux = b[0] - a[0], uy = b[1] - a[1], L2 = ux * ux + uy * uy || 1e-9;
		const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / L2));
		return Math.hypot(p[0] - a[0] - ux * t, p[1] - a[1] - uy * t);
	};

	function segIntersect(p1, p2, p3, p4) {
		const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
		if (Math.abs(d) < 1e-9) return false;
		const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
		const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
		return t >= 0 && t <= 1 && u >= 0 && u <= 1;
	}

	class Heap {
		constructor() { this.a = []; }
		push(k, v) {
			const a = this.a;
			a.push([k, v]);
			let i = a.length - 1;
			while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
		}
		pop() {
			const a = this.a, top = a[0], last = a.pop();
			if (a.length) {
				a[0] = last;
				let i = 0;
				for (;;) {
					const l = 2 * i + 1, r = l + 1;
					let m = i;
					if (l < a.length && a[l][0] < a[m][0]) m = l;
					if (r < a.length && a[r][0] < a[m][0]) m = r;
					if (m === i) break;
					[a[m], a[i]] = [a[i], a[m]];
					i = m;
				}
			}
			return top;
		}
		get size() { return this.a.length; }
	}

	const speedOf = (tags) => {
		const v = parseInt(String(tags.maxspeed || '').replace(/[^0-9]/g, ''), 10);
		return v > 0 ? Math.min(160, v) : null;
	};
	const refs = (tags) => String(tags.ref || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);

	// ---------- otoczenie w układzie trasy (kilometraż s, odsunięcie d – w prawo dodatnie) ----------
	// pas otoczenia: budynki do 500 m od osi, drogi, wody i raster zagospodarowania do 560 m (widoczność ±500 m)
	const ENV_B = 500, ENV_A = 560, ENV_STEP = 10;
	const ROAD_TYPES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'pedestrian', 'road'];
	const roadType = (h) => ROAD_TYPES.indexOf(String(h || '').replace(/_link$/, ''));
	// kody obszarów: 0 brak, 1 las (11 liściasty, 12 iglasty), 2 park, 3 łąka/trawnik, 4 pole/ogródki, 5 zabudowa mieszkaniowa, 6 przemysł/kolej,
	// 7 handel/usługi, 8 cmentarz, 9 woda, 10 boiska
	const areaKind = (t) => {
		if (t.natural === 'water' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.water) return 9;
		// las: liściasty 11, iglasty 12, mieszany / bez oznaczenia 1
		if (t.landuse === 'forest' || t.natural === 'wood') return t.leaf_type === 'broadleaved' ? 11 : t.leaf_type === 'needleleaved' ? 12 : 1;
		if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return 8;
		if (/^(park|garden|nature_reserve)$/.test(t.leisure || '') || /^(recreation_ground|village_green)$/.test(t.landuse || '')) return 2;
		if (/^(pitch|playground|sports_centre|stadium|track)$/.test(t.leisure || '')) return 10;
		if (/^(grass|meadow|greenfield)$/.test(t.landuse || '') || /^(grassland|heath|scrub|wetland)$/.test(t.natural || '')) return 3;
		if (/^(farmland|orchard|allotments|vineyard|plant_nursery|farmyard|greenhouse_horticulture)$/.test(t.landuse || '')) return 4;
		if (t.landuse === 'residential') return 5;
		if (/^(industrial|railway|brownfield|construction|garages|quarry|landfill|depot)$/.test(t.landuse || '')) return 6;
		if (/^(commercial|retail)$/.test(t.landuse || '')) return 7;
		return 0;
	};
	// pierwszeństwo przy nakładaniu się obszarów (las w parku, park w zabudowie…)
	const AREA_PRI = [0, 6, 6, 5, 2, 1, 3, 3, 6, 9, 5, 6, 6];
	const buildingKind = (t, area) => {
		const b = t.building;
		if (b === 'train_station' || t.railway === 'station' || (t.public_transport === 'station' && t.train !== 'no')) return 6;
		if (/^(house|detached|semidetached_house|bungalow|farm|cabin|terrace)$/.test(b)) return 0;
		if (/^(apartments|residential|dormitory|flats)$/.test(b)) return area < 160 ? 0 : 1;
		if (/^(industrial|warehouse|factory|manufacture|hangar|storage_tank|silo|service|depot|transformer_tower)$/.test(b)) return 2;
		if (/^(commercial|retail|office|supermarket|hotel|public|civic|school|hospital|university|college|kindergarten|train_station|transportation|government|sports_hall|stadium)$/.test(b)) return 3;
		if (/^(church|chapel|cathedral|religious|mosque|temple|synagogue)$/.test(b)) return 4;
		if (/^(garage|garages|shed|roof|carport|hut|greenhouse|kiosk|toilets|container)$/.test(b)) return 5;
		return area < 30 ? 5 : area < 170 ? 0 : area > 1800 ? 2 : 1;
	};
	const num = (v) => { const x = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
	/* Rodzaj (przeznaczenie) budynku – env.bu, równolegle do env.b; w grze szyldy, kolory, wieże, bramy remiz…
	   Kolejność: funkcje wyróżniające się (urzędy, służby, usługi) przed ogólnymi (blok, dom), więc blok z apteką
	   na parterze dostaje szyld apteki (bryła i okna zostają z rodzaju bryły env.b[0]). Tekst: funkcje BDOT10k
	   (szczegółowe i przeważająca) i znaczniki OSM (klucz=wartość) budynku i punktów usług w jego obrysie. */
	const USE_RULES = [
		[25, /dworzec kolejowy|=train_station/],
		[30, /kontroli ruchu kolejowego|=signal_box/],
		[13, /policj|komenda|komisariat|=police/],
		[14, /straż pożarn|=fire_station/],
		[12, /operatora pocztowego|=post_office/],
		[18, /szpital|=hospital|hospicjum|ratownictwa medycznego/],
		[11, /apteka|=pharmacy/],
		[19, /ochrony zdrowia|przychodni|=clinic|=doctors|=dentist|weterynaryjn|=veterinary/],
		[16, /przedszkol|żłobek|=kindergarten|=childcare/],
		[17, /szkoła wyższa|=university|=college|placówka badawcza/],
		[33, /dom studencki|internat|bursa|=dormitory/],
		[15, /szkoła|=school/],
		[20, /urząd|starostwo|(^|[\s;,=])sąd([\s;,]|$)|prokuratura|administracji|=townhall|=courthouse|=government|placówka dyplomatyczna|archiwum/],
		[21, /kościół|kaplica|kultu religijnego|dzwonnica|klasztor|dom zakonny|=place_of_worship|=church|=chapel|=cathedral/],
		[24, /bibliotek|=library|dom kultury|muzeum|=museum|teatr|=theatre|(^|[\s;,=])kino|=cinema|galeria sztuki|=arts_centre|hala widowiskowa|=community_centre|centrum konferencyjne/],
		[23, /hala sportowa|sala gimnastyczna|basen|pływalnia|klub sportowy|lodowisko|korty|=sports_hall|=sports_centre|=swimming/],
		[22, /hotel|zajazd|=guest_house|=hostel/],
		[28, /dom opieki|dom dziecka|pomocy społecznej|opiekuńczo|=social_facility|=nursing_home/],
		[10, /(^|[\s;,=])bank([\s;,]|$)/],
		[26, /stacja paliw|=fuel/],
		[27, /warsztat|stacja obsługi pojazdów|myjnia|=car_repair|=car_wash/],
		[8, /hipermarket|supermarket|centrum handlowe|dom towarowy|=mall|=department_store|hala targowa/],
		[9, /restauracja|=restaurant|=fast_food|=cafe|=pub|=bar([\s;,]|$)|dyskoteka|=nightclub/],
		[32, /areszt|więzienie|=prison|koszary|=barracks/],
		[31, /dworzec autobusowy|zajezdnia|=bus_station/],
		[34, /parking wielopoziomowy|=parking/],
		[29, /transformator|stacja pomp|stacja gazowa|kotłownia|elektrociepłownia|spalarnia|=transformer_tower/],
		[7, /handlowo-usługow|shop=|=retail|=commercial|=kiosk/],
		[6, /siedziba firmy|biurow|=office|office=/],
		[5, /magazyn|=warehouse|spedycji|elewator|hangar/],
		[4, /produkcyjn|=industrial|=factory|=manufacture/],
		[2, /wielorodzinn|=apartments|zbiorowego zamieszkania/],
		[1, /jednorodzinn|letniskow|=house|=detached|=semidetached_house|=terrace/],
		[3, /garaż|gospodarcz|=garage|=shed/],
	];
	const USE_KEYS = ['building', 'amenity', 'shop', 'office', 'healthcare', 'tourism', 'leisure', 'railway', 'public_transport'];
	const useText = (t) => USE_KEYS.filter((k) => t[k]).map((k) => (k === 'shop' || k === 'office' ? `${k}=${t[k]}` : `=${t[k]}`)).join(' ') + ' ' + (t['bdot:use'] || '');
	const useOf = (text) => { for (const [u, re] of USE_RULES) if (re.test(text)) return u; return 0; };
	const polyArea = (xy) => {
		let a = 0;
		for (let i = 0; i < xy.length; i++) { const p = xy[i], q = xy[(i + 1) % xy.length]; a += p[0] * q[1] - q[0] * p[1]; }
		return Math.abs(a) / 2;
	};
	// Douglas–Peucker na punktach [s, d]
	const simplify = (P2, tol) => {
		if (P2.length < 3) return P2;
		const keep = new Uint8Array(P2.length);
		keep[0] = keep[P2.length - 1] = 1;
		const stack = [[0, P2.length - 1]];
		while (stack.length) {
			const [a, b] = stack.pop();
			const A = P2[a], B = P2[b], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-9;
			let mi = -1, md = tol;
			for (let i = a + 1; i < b; i++) {
				const d = Math.abs((B[0] - A[0]) * (A[1] - P2[i][1]) - (A[0] - P2[i][0]) * (B[1] - A[1])) / L;
				if (d > md) { md = d; mi = i; }
			}
			if (mi >= 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
		}
		return P2.filter((_, i) => keep[i]);
	};
	// zamknięty pierścień: podział w punkcie najdalszym od pierwszego i uproszczenie obu łamanych
	const simplifyRing = (ring, tol) => {
		if (ring.length <= 4) return ring;
		let far = 1, fd = -1;
		for (let i = 1; i < ring.length; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > fd) { fd = d; far = i; } }
		const a = simplify(ring.slice(0, far + 1), tol), b = simplify(ring.slice(far).concat([ring[0]]), tol);
		return a.slice(0, -1).concat(b.slice(0, -1));
	};
	const pointInPoly = (x, y, ring) => {
		let inside = false;
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const a = ring[i], b = ring[j];
			if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
		}
		return inside;
	};
	// pierścienie wielokąta z relacji (składanie odcinków o danej roli po wspólnych końcach)
	const rings = (members, role) => {
		const segs = members.filter((m) => m.type === 'way' && m.geometry && (m.role || 'outer') === role).map((m) => m.geometry.filter(Boolean).map((g) => [g.lat, g.lon]));
		const out = [];
		const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
		while (segs.length) {
			let ring = segs.shift();
			let grew = true;
			while (!same(ring[0], ring[ring.length - 1]) && grew) {
				grew = false;
				for (let i = 0; i < segs.length; i++) {
					const s2 = segs[i], end = ring[ring.length - 1];
					if (same(end, s2[0])) ring = ring.concat(s2.slice(1));
					else if (same(end, s2[s2.length - 1])) ring = ring.concat(s2.slice(0, -1).reverse());
					else continue;
					segs.splice(i, 1);
					grew = true;
					break;
				}
			}
			if (ring.length >= 4) out.push(ring);
		}
		return out;
	};

	/* Otoczenie trasy z danych OSM: budynki (obrys, wysokość, rodzaj, dach), drogi, rzeki i rastrowa mapa
	   zagospodarowania (komórki 10 m) – wszystko w układzie (s, d) przebiegu, z przesunięciem kilometrażu `shift`.
	   Obszary (lasy, jeziora) bywają ogromne – raster zamiast wielokątów nie zniekształca ich daleko od toru. */
	function buildEnvironment(data, ctx) {
		const { P, pts, shift, endS, stationsS, platformLength, log } = ctx;
		const n = pts.length;
		const R2 = (v) => Math.round(v * 2) / 2;
		const R1 = (v) => Math.round(v * 50) / 50; // tory: 2 cm (łagodne łuki rozjazdów)
		const RR = (v) => Math.round(v * 10) / 10; // drogi: 10 cm (krawędzie jezdni bez ząbków, węzły skrzyżowań)
		const GC = 100, grid = new Map();
		pts.forEach((p, k) => {
			const key = Math.floor(p[0] / GC) * 100003 + Math.floor(p[1] / GC);
			if (!grid.has(key)) grid.set(key, []);
			grid.get(key).push(k);
		});
		const nearestK = (x, y, hint) => {
			let best = -1, bd = Infinity;
			if (hint >= 0) {
				for (let k = Math.max(0, hint - 40); k <= Math.min(n - 1, hint + 40); k++) {
					const d = (pts[k][0] - x) ** 2 + (pts[k][1] - y) ** 2;
					if (d < bd) { bd = d; best = k; }
				}
				if (best > hint - 40 && best < hint + 40) return best;
			}
			const cx = Math.floor(x / GC), cy = Math.floor(y / GC);
			for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
				for (const k of grid.get((cx + i) * 100003 + cy + j) || []) {
					const d = (pts[k][0] - x) ** 2 + (pts[k][1] - y) ** 2;
					if (d < bd) { bd = d; best = k; }
				}
			}
			return best;
		};
		/* rzut punktu na przebieg: s (bez przesunięcia), d (w prawo dodatnie). Kierunek osi płynny – interpolowany między
		   wierzchołkami jak w grze (R.sidePoint: odsunięcie wzdłuż normalnej do kierunku w s); s – miejsce, w którym odcinek
		   do punktu jest prostopadły do tego kierunku. Dawniej rzut na najbliższy odcinek łamanej: daleko od toru, po
		   zewnętrznej stronie łuku, punkty z „wachlarza” przy wierzchołku dostawały to samo s (wierzchołek co 10 m) – po
		   odtworzeniu w grze drogi i obrysy miały zęby. */
		const tan = (k) => {
			const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
			return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
		};
		const project = (x, y, hint) => {
			const k = nearestK(x, y, hint);
			if (k < 0) return null;
			// g(u) – składowa wektora do punktu wzdłuż płynnego kierunku; zmiana znaku na odcinku – tam leży rzut
			const at = (k0, u) => {
				const a = pts[k0], b = pts[k0 + 1], ta = tan(k0), tb = tan(k0 + 1);
				const ax = a[0] + (b[0] - a[0]) * u, ay = a[1] + (b[1] - a[1]) * u;
				let tx = ta[0] + (tb[0] - ta[0]) * u, ty = ta[1] + (tb[1] - ta[1]) * u;
				const tl = Math.hypot(tx, ty) || 1;
				tx /= tl; ty /= tl;
				return { g: (x - ax) * tx + (y - ay) * ty, d: (x - ax) * ty - (y - ay) * tx };
			};
			for (const k0 of [k - 1, k]) {
				if (k0 < 0 || k0 + 1 >= n) continue;
				let lo = 0, hi = 1, glo = at(k0, 0).g;
				if (glo < 0 || at(k0, 1).g > 0) continue;
				for (let it = 0; it < 22; it++) {
					const mid = (lo + hi) / 2, gm = at(k0, mid).g;
					if ((gm >= 0) === (glo >= 0)) { lo = mid; glo = gm; } else hi = mid;
				}
				const u = (lo + hi) / 2;
				return { s: (k0 + u) * ENV_STEP, d: at(k0, u).d, k };
			}
			let bs = k * ENV_STEP, bd = 0, ba = Infinity;
			for (const k0 of [k - 1, k]) {
				if (k0 < 0 || k0 + 1 >= n) continue;
				const a = pts[k0], b = pts[k0 + 1];
				const ux = b[0] - a[0], uy = b[1] - a[1], L2 = ux * ux + uy * uy || 1e-9;
				const t = Math.max(0, Math.min(1, ((x - a[0]) * ux + (y - a[1]) * uy) / L2));
				const dist = Math.hypot(x - (a[0] + ux * t), y - (a[1] + uy * t));
				if (dist < ba) {
					ba = dist;
					bs = (k0 + t) * ENV_STEP;
					bd = ((x - a[0]) * uy - (y - a[1]) * ux) / Math.sqrt(L2);
				}
			}
			return { s: bs, d: bd, k };
		};
		const sOk = (s) => s > 15 && s < endS - 15;
		// pas peronów stacji (perony i wiaty są modelem z gry) – bez budynków z mapy
		const stationBlock = (s, d) => stationsS.some(([ps]) => s > ps + 15 - platformLength - 30 && s < ps + 15 + 40 && d > -16 && d < 12);

		const els = data.elements || [];
		const b = [], bTags = [], r = [], w = [], tr = [], pf = [], ov = [], obRuns = [], ro = [], cm = [];
		/* ulice: ra – atrybuty drogi równolegle do r: [pasy, szerokość (dm), nawierzchnia (0 asfalt, 1 kostka kamienna,
		   2 kostka betonowa / płyty / beton, 3 gruntowa), chodniki (0 brak, 1 lewy, 2 prawy, 3 oba, −1 – wg zabudowy),
		   jednokierunkowa]; rx – przejścia dla pieszych [s, d, sygnalizacja]; pk – parkingi (0) i place (1) [rodzaj, s, d, …] */
		const ra = [], rx = [], pk = [];
		const roadAttr = (t) => {
			const sf = String(t.surface || '');
			const surf = /sett|cobblestone|unhewn/.test(sf) ? 1 : /paving_stones|concrete|paved_stones|bricks/.test(sf) ? 2 : /unpaved|gravel|dirt|ground|compacted|grass|sand|earth|mud|pebble/.test(sf) ? 3 : 0;
			const swT = t.sidewalk || t['sidewalk:both'] || '';
			const sw = /^(both|separate|yes)$/.test(swT) ? 3 : swT === 'left' ? 1 : swT === 'right' ? 2 : /^(no|none)$/.test(swT) ? 0 : -1;
			return [Math.max(0, Math.min(8, Math.round(num(t.lanes) || 0))), Math.round(Math.min(40, num(t.width) || 0) * 10), surf, sw, t.oneway === 'yes' ? 1 : 0];
		};
		// parkingi i place: obrys (jak budynki), bez parkingów wielopoziomowych i podziemnych
		for (const e of els) {
			const t = e.tags;
			if (!t) continue;
			if (e.type === 'node' && t.highway === 'crossing' && e.lat !== undefined) {
				const p = P.xy(e.lat, e.lon), q = project(p[0], p[1], -1);
				if (q && Math.abs(q.d) > 8 && Math.abs(q.d) < ENV_B && sOk(q.s)) rx.push([R2(q.s + shift), R2(q.d), /traffic_signals/.test(t.crossing || '') ? 1 : 0]);
				continue;
			}
			if (e.type !== 'way' || !e.geometry) continue;
			const kind = t.amenity === 'parking' && !/multi-storey|underground|rooftop/.test(t.parking || '') ? 0 : t.place === 'square' || (t.highway === 'pedestrian' && t.area === 'yes') ? 1 : -1;
			if (kind < 0) continue;
			const g = e.geometry.filter(Boolean);
			if (g.length < 4) continue;
			let hint = -1, ok = true;
			const sd = [];
			for (const q0 of g.slice(0, -1)) {
				const p = P.xy(q0.lat, q0.lon), q = project(p[0], p[1], hint);
				if (!q || Math.abs(q.d) > ENV_B || Math.abs(q.d) < 6 || !sOk(q.s)) { ok = false; break; }
				hint = q.k;
				sd.push([q.s + shift, q.d]);
			}
			if (!ok) continue;
			const ring = simplifyRing(sd, 0.4);
			if (ring.length < 3) continue;
			const row = [kind];
			for (const [s2, d2] of ring) row.push(R2(s2), R2(d2));
			pk.push(row);
		}
		// dworce: przy każdej stacji najlepszy kandydat w promieniu 150 m (adres przy ul./pl. Dworcowej, nazwa,
		// przeznaczenie „transportu i łączności”, punkt stacji w obrysie) – w danych rzadko mają znacznik dworca
		const stationBld = new Set();
		// ślepe końce torów (kozły oporowe): koniec drogi kolejowej, którego punkt nie należy do żadnej innej drogi
		const bufs = [];
		{
			const key = (q) => q.lat.toFixed(7) + ',' + q.lon.toFixed(7);
			const uses = new Map();
			const rails = els.filter((e) => e.type === 'way' && e.tags && e.tags.railway === 'rail' && e.geometry && e.geometry.length > 1);
			for (const e of rails) for (const q of e.geometry) if (q) uses.set(key(q), (uses.get(key(q)) || 0) + 1);
			for (const e of rails) {
				if (ctx.pathWays && ctx.pathWays.has(e.id)) continue;
				const g = e.geometry.filter(Boolean);
				for (const [end, prev] of [[g[0], g[1]], [g[g.length - 1], g[g.length - 2]]]) {
					if (uses.get(key(end)) !== 1) continue;
					const pe = P.xy(end.lat, end.lon), pp = P.xy(prev.lat, prev.lon);
					const a = project(pe[0], pe[1], -1), b2 = project(pp[0], pp[1], a ? a.k : -1);
					if (!a || !b2 || Math.abs(a.d) < 3 || Math.abs(a.d) > 110 || !sOk(a.s)) continue;
					// kierunek „na zewnątrz” toru w (s, d)
					bufs.push([R2(a.s + shift), R2(a.d), Math.round(Math.atan2(a.d - b2.d, a.s - b2.s) * 100) / 100]);
				}
			}
		}
		const bestByName = new Map();
		for (const [sx, sy, sname] of ctx.stationPts || []) {
			let best = null, bs = 1.5;
			for (const e of els) {
				const t = e.tags;
				if (e.type !== 'way' || !t || !t.building || !e.geometry || /^(roof|garage|garages|shed|carport|kiosk|toilets)$/.test(t.building)) continue;
				const g = e.geometry.filter(Boolean);
				if (g.length < 4) continue;
				const xy = g.slice(0, -1).map((q) => P.xy(q.lat, q.lon));
				const cx = xy.reduce((a, p) => a + p[0], 0) / xy.length, cy = xy.reduce((a, p) => a + p[1], 0) / xy.length;
				const dist = Math.hypot(cx - sx, cy - sy);
				if (dist > 150) continue;
				const area = polyArea(xy);
				if (area < 150) continue;
				let sc = 0;
				if (t.building === 'train_station' || t.railway === 'station') sc += 6;
				if (/dworzec|station/i.test(t.name || '')) sc += 4;
				if (/dworcow/i.test(t['addr:street'] || '') || /dworcow/i.test(t['addr:place'] || '')) sc += 3;
				if (/transport/i.test(t['building:use:pl'] || t['building:usage:pl'] || '')) sc += 2;
				if (pointInPoly(sx, sy, xy)) sc += 3;
				sc -= dist / 100;
				if (sc > bs) { bs = sc; best = e.id; }
			}
			const cur = bestByName.get(sname);
			if (best && (!cur || bs > cur.sc)) bestByName.set(sname, { id: best, sc: bs });
		}
		for (const { id } of bestByName.values()) stationBld.add(id);
		const dropB = { far: 0, station: 0, small: 0, ring: 0 };
		// punkty usług z mapy (węzły amenity/shop/office…, także środki obrysów OSM zastąpionych przez BDOT10k) w siatce 50 m
		const poiGrid = new Map();
		for (const e of els) {
			const t = e.tags;
			if (e.type !== 'node' || !t || e.lat === undefined || !(t.amenity || t.shop || t.office || t.healthcare || t.tourism)) continue;
			const p = P.xy(e.lat, e.lon), key = Math.floor(p[0] / 50) + ',' + Math.floor(p[1] / 50);
			if (!poiGrid.has(key)) poiGrid.set(key, []);
			poiGrid.get(key).push({ x: p[0], y: p[1], t });
		}
		const poisIn = (xy) => {
			let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
			for (const [x, y] of xy) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
			const out = [];
			for (let gx = Math.floor(x0 / 50); gx <= Math.floor(x1 / 50); gx++) for (let gy = Math.floor(y0 / 50); gy <= Math.floor(y1 / 50); gy++) {
				for (const q of poiGrid.get(gx + ',' + gy) || []) if (pointInPoly(q.x, q.y, xy)) out.push(q.t);
			}
			return out;
		};
		const bu = [], bn = [];
		// ---- budynki ----
		for (const e of els) {
			if (e.type !== 'way' || !e.tags || !e.tags.building || !e.geometry || e.tags._roofOnly) continue;
			const g = e.geometry.filter(Boolean);
			if (g.length < 4) continue;
			const xy = g.slice(0, -1).map((q) => P.xy(q.lat, q.lon));
			const isSt = stationBld.has(e.id);
			let hint = -1, ok = true;
			const sd = [];
			for (const p of xy) {
				const q = project(p[0], p[1], hint);
				// dworzec może stać tuż za peronem: po prawej od 6,5 m, po lewej za drugim peronem (11,5 m)
				const near = isSt ? (q && (q.d > 0 ? q.d < 6.5 : q.d > -11.5)) : q && Math.abs(q.d) < 9;
				if (!q || Math.abs(q.d) > ENV_B || !sOk(q.s) || near) { ok = false; break; }
				hint = q.k;
				sd.push([q.s + shift, q.d]);
			}
			if (!ok) { dropB.far++; continue; }
			const cs = sd.reduce((a2, p) => a2 + p[0], 0) / sd.length, cd = sd.reduce((a2, p) => a2 + p[1], 0) / sd.length;
			if (!isSt && (stationBlock(cs, cd) || sd.some(([s2, d2]) => stationBlock(s2, d2)))) { dropB.station++; continue; }
			const area = polyArea(xy);
			if (area < 12) { dropB.small++; continue; }
			// dworzec: znacznik dworca, nazwa „Dworzec…” albo punkt stacji z mapy wewnątrz obrysu
			let kind = buildingKind(e.tags, area);
			if (isSt) kind = 6;
			const lv = num(e.tags['building:levels']);
			let h = num(e.tags.height);
			if (h === null) h = lv !== null ? lv * 3 + (kind === 0 ? 1.5 : 1) : [6.5, area > 700 ? 15 : 12, 9, 11, 16, 3, 11][kind];
			h = Math.max(2.5, Math.min(120, h));
			const rs = e.tags['roof:shape'];
			const roofS = rs === 'gabled' ? 1 : /^(hipped|pyramidal|half-hipped)$/.test(rs || '') ? 2 : rs === 'flat' ? 0 : kind === 0 ? (sd.length === 4 ? 1 : 2) : kind === 4 ? 1 : kind === 6 && area < 2500 ? 2 : 0;
			const ring = simplifyRing(sd, 0.35);
			if (ring.length < 3) { dropB.ring++; continue; }
			const row = [kind, Math.round(h * 10), roofS];
			for (const [s2, d2] of ring) row.push(R2(s2), R2(d2));
			// rodzaj budynku i nazwa (budynek, punkty usług w obrysie)
			const pois = poisIn(xy);
			let use = isSt ? 25 : useOf([useText(e.tags)].concat(pois.map(useText)).join(' '));
			let name = e.tags.name || '';
			for (const q of pois) if (q.name && useOf(useText(q)) === use) { name = q.name; break; }
			if (use > 3 && use !== 4 && use !== 5 && use !== 29 && name) bn.push(b.length, String(name).slice(0, 64));
			bu.push(use);
			b.push(row);
			bTags.push([num(e.tags.height) !== null || (lv !== null && !e.tags['source:bdot']), !!rs]);
		}
		/* ---- zadaszenia peronów: building=roof, man_made=canopy, wiaty (amenity=shelter) w pasie stacji do 35 m od osi
		   (budynki tak blisko toru i przy peronach są pomijane wyżej). rf: [wysokość (dm, 0 – typowa), szkło (1), poziom
		   (layer), s, d, …] */
		const rf = [];
		for (const e of els) {
			const t = e.tags;
			if (e.type !== 'way' || !t || !e.geometry) continue;
			if (!(t.building === 'roof' || t.man_made === 'canopy' || (t.building && t.amenity === 'shelter'))) continue;
			if (t.amenity === 'fuel' || /^(parking|fuel|car_wash)$/.test(t.amenity || '')) continue;
			const g = e.geometry.filter(Boolean);
			if (g.length < 4) continue;
			let hint = -1, ok = true;
			const sd = [];
			for (const q0 of g.slice(0, -1)) {
				const p = P.xy(q0.lat, q0.lon), q = project(p[0], p[1], hint);
				if (!q || Math.abs(q.d) > 150 || !sOk(q.s)) { ok = false; break; }
				hint = q.k;
				sd.push([q.s + shift, q.d]);
			}
			// dach peronów kilku torów bywa szeroki – wystarczy, że sięga do 35 m od osi
			if (!ok || !sd.some((p) => Math.abs(p[1]) < 35)) continue;
			const cs = sd.reduce((a2, p) => a2 + p[0], 0) / sd.length;
			if (!stationsS.some(([ps]) => cs > ps + 15 - platformLength - 80 && cs < ps + 15 + 80)) continue;
			if (polyArea(g.slice(0, -1).map((q) => P.xy(q.lat, q.lon))) < 8) continue;
			const ring = simplifyRing(sd, 0.25);
			if (ring.length < 3) continue;
			const row = [Math.round((num(t.height) || 0) * 10), t['roof:material'] === 'glass' ? 1 : 0, Math.round(num(t.layer) || 0)];
			for (const [s2, d2] of ring) row.push(R2(s2), R2(d2));
			rf.push(row);
		}
		if (rf.length && log) log(`Zadaszenia peronów z mapy: ${rf.length}.`);
		// ---- drogi i cieki (linie cięte przy torze) ----
		const lineRuns = (geom, maxD, minAbsD) => {
			const out = [];
			let cur = [], hint = -1;
			// zagęszczenie co ≤ 5 m – odcinek przecinający tor też zostanie przecięty
			const dense = [];
			const g2 = geom.filter(Boolean).map((q) => P.xy(q.lat, q.lon));
			for (let i = 0; i < g2.length; i++) {
				if (i > 0) {
					const a = g2[i - 1], c = g2[i], L = dist2(a, c), m = Math.floor(L / 5);
					for (let j = 1; j <= m; j++) dense.push([a[0] + ((c[0] - a[0]) * j) / (m + 1), a[1] + ((c[1] - a[1]) * j) / (m + 1)]);
				}
				dense.push(g2[i]);
			}
			for (const p of dense) {
				const pr = project(p[0], p[1], hint);
				const good = pr && Math.abs(pr.d) <= maxD && Math.abs(pr.d) >= minAbsD && sOk(pr.s);
				if (pr) hint = pr.k;
				if (good) cur.push([pr.s + shift, pr.d]);
				else { if (cur.length >= 2) out.push(cur); cur = []; }
			}
			if (cur.length >= 2) out.push(cur);
			return out;
		};
		for (const e of els) {
			if (e.type !== 'way' || !e.tags || !e.geometry) continue;
			const t = e.tags;
			// perony mają często też highway=platform – rozpoznawane przed drogami
			const isPlatform = t.railway === 'platform' || (t.public_transport === 'platform' && (t.train === 'yes' || t.railway));
			if (t.highway && !t.building && !isPlatform) {
				const ti = roadType(t.highway);
				// przejazd pod torem (layer=-1 albo krótki „tunel” pod nasypem) też jest drogą – w grze w wykopie pod wiaduktem
				if (ti < 0 || t.area === 'yes') continue;
				// długi tunel: tylko fragment pod naszym torem (do 25 m od osi) – przejazd pod mostem
				const longTunnel = t.tunnel && t.tunnel !== 'no' && wayLen(e) >= 150;
				// nad torem: most albo wyższa warstwa niż nasz tor w miejscu przecięcia (np. nasz tor w wykopie, layer=-1)
				const lay = Number(t.layer) || 0;
				const bridge = (t.bridge && t.bridge !== 'no') || (ctx.layerAt && lineRuns(e.geometry, 140, 0).some((run) => run.some((q, k) => k && Math.sign(q[1]) !== Math.sign(run[k - 1][1]) && lay > ctx.layerAt(q[0]))));
				if (bridge) {
					// wiadukt drogowy nad torem: cały obiekt (bez cięcia przy torze), jeśli przecina nasz tor – w całym pasie
					// otoczenia (długa estakada nie urywa się w powietrzu 140 m od toru)
					let crosses = false;
					for (const run of lineRuns(e.geometry, ENV_A, 0)) {
						for (let k = 0; k < run.length; k++) if (Math.abs(run[k][1]) < 4 || (k && Math.sign(run[k][1]) !== Math.sign(run[k - 1][1]))) crosses = true;
						if (!crosses) continue;
						const row = [ti];
						for (const [s2, d2] of simplify(run, 0.4)) row.push(R2(s2), R2(d2));
						ov.push(row);
					}
					if (crosses) continue;
					// most drogowy obok (nad innymi torami, ulicą, rzeką): obiekt mostowy, wysokość ustalona po pętli
					for (const run of lineRuns(e.geometry, ENV_A, 7.5)) obRuns.push([ti, simplify(run, 0.5)]);
					continue;
				}
				const at = roadAttr(t);
				for (const run of lineRuns(e.geometry, longTunnel ? 25 : ENV_A, 7.5)) {
					const row = [ti];
					for (const [s2, d2] of simplify(run, 0.4)) row.push(RR(s2), RR(d2));
					r.push(row);
					ra.push(at.slice());
				}
			} else if (t.railway === 'rail' || t.railway === 'disused' || t['disused:railway'] === 'rail') {
				// droga OSM użyta przez przebieg: pomijamy tylko odcinki na osi naszego toru (do 1,2 m) – ta sama droga bywa
				// dalej torem obok (przebieg zmienia tor na stacji), który musi zostać
				const onPath = !!(ctx.pathWays && ctx.pathWays.has(e.id));
				// długi tunel: tylko fragment pod naszym torem (do 25 m od osi)
				const longTunnelR = t.tunnel && t.tunnel !== 'no' && wayLen(e) >= 150;
				// krótki „tunel” (do 150 m) to zwykle przejazd pod wiaduktem – tor rysowany normalnie
				// tor nieużywany (stary, zarośnięty): railway=disused albo disused:railway=rail
				const disused = t.railway !== 'rail' || t.disused === 'yes';
				// tor na moście/wiadukcie przecinający nasz tor (tor przechodzi nad nim): wiadukt kolejowy – cały obiekt
				const lay = Number(t.layer) || 0;
				const onBridge = (t.bridge && t.bridge !== 'no') || lay > 0;
				// przecięcie z naszym torem: górą, gdy tor jest na moście albo ma wyższą warstwę niż nasz tor w tym miejscu
				{
					let crosses = false;
					for (const run of lineRuns(e.geometry, 140, 0)) {
						let c = false;
						for (let k = 1; k < run.length; k++) if (Math.sign(run[k][1]) !== Math.sign(run[k - 1][1]) && (onBridge || (ctx.layerAt && lay > ctx.layerAt(run[k][0])))) c = true;
						// przecina naprawdę: po obu stronach osi dalej niż 5 m (most naszej linii albo tor obok biegnący po osi
						// zmienia stronę o centymetry)
						if (!c || !run.some((q) => q[1] < -5) || !run.some((q) => q[1] > 5)) continue;
						crosses = true;
						const row = [t.service ? 1 : 0];
						for (const [s2, d2] of simplify(run, 0.08)) row.push(R1(s2), R1(d2));
						ro.push(row);
					}
					if (crosses) continue;
				}
				// tory obok naszego (stacyjne, bocznice, stacje towarowe, linie równoległe) do 110 m od osi;
				// bit 1 – bocznica / tor boczny, bit 2 – tor na moście (na poziomie naszego toru, z pomostem), bit 4 – nieużywany
				// bit 8 – tor zelektryfikowany (sieć trakcyjna nad nim)
				const electrified = /^(contact_line|yes)$/.test(t.electrified || '');
				const side = (t.service ? 1 : 0) | (onBridge ? 2 : 0) | (disused ? 4 : 0) | (electrified && !disused ? 8 : 0);
				// do 0,3 m od osi: tor odchodzący rozjazdem dochodzi do toru pociągu (w grze same szyny przy torze pociągu)
				for (const run of lineRuns(e.geometry, longTunnelR ? 25 : 110, onPath ? 1.2 : 0.3)) {
					if (onPath && run.length < 3) continue;
					const row = [side];
					for (const [s2, d2] of simplify(run, 0.08)) row.push(R1(s2), R1(d2));
					tr.push(row);
				}
			} else if (isPlatform) {
				// perony: obrys (zamknięty) albo linia (peron o szerokości 4 m)
				const g = e.geometry.filter(Boolean);
				const sOkP = (s2) => s2 > 5 && s2 < (n - 1) * ENV_STEP - 5;
				const closed = g.length >= 4 && Math.abs(g[0].lat - g[g.length - 1].lat) < 1e-7 && Math.abs(g[0].lon - g[g.length - 1].lon) < 1e-7;
				if (closed) {
					let hint = -1, ok = true;
					const sd = [];
					for (const q of g.slice(0, -1)) {
						const xy2 = P.xy(q.lat, q.lon), pr = project(xy2[0], xy2[1], hint);
						if (!pr || Math.abs(pr.d) > 60 || !sOkP(pr.s)) { ok = false; break; }
						hint = pr.k;
						sd.push([pr.s + shift, pr.d]);
					}
					if (ctx.debug && !ok) {
						const ds = g.map((q) => { const xy2 = P.xy(q.lat, q.lon), pr = project(xy2[0], xy2[1], -1); return pr ? pr : { s: NaN, d: NaN }; });
						log(`[debug] peron odrzucony: ${t.name || t.local_ref || ''} s ${Math.round(Math.min(...ds.map((x) => x.s)))}–${Math.round(Math.max(...ds.map((x) => x.s)))} d ${Math.min(...ds.map((x) => x.d)).toFixed(0)}…${Math.max(...ds.map((x) => x.d)).toFixed(0)}`);
					}
					if (ok && sd.length >= 3) {
						const row = [1];
						for (const [s2, d2] of simplifyRing(sd, 0.3)) row.push(R2(s2), R2(d2));
						pf.push(row);
					}
				} else {
					for (const run of lineRuns(e.geometry, 60, 1)) {
						const row = [0];
						for (const [s2, d2] of simplify(run, 0.3)) row.push(R2(s2), R2(d2));
						pf.push(row);
					}
				}
			} else if (t.waterway && /^(river|canal|stream)$/.test(t.waterway) && !(t.tunnel && t.tunnel !== 'no')) {
				const wd = num(t.width) || (t.waterway === 'river' ? 14 : t.waterway === 'canal' ? 12 : 3);
				for (const run of lineRuns(e.geometry, ENV_A, 8)) {
					const row = [Math.round(Math.min(60, wd))];
					for (const [s2, d2] of simplify(run, 1)) row.push(R2(s2), R2(d2));
					w.push(row);
				}
			}
		}
		// ---- zagospodarowanie: wielokąty w xy, raster w (s, d) ----
		const polys = [];
		const addPoly = (kind, ringsLL, holesLL) => {
			for (const rr of ringsLL) {
				const xy = rr.map(([la, lo]) => P.xy(la, lo));
				let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
				for (const [x, y] of xy) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
				polys.push({ kind, pri: AREA_PRI[kind], xy, holes: (holesLL || []).map((h) => h.map(([la, lo]) => P.xy(la, lo))), x0, y0, x1, y1 });
			}
		};
		// perony opisane jako relacje (wielokąty): zewnętrzne pierścienie jak obrysy peronów
		for (const e of els) {
			if (e.type !== 'relation' || !e.tags || e.tags.railway !== 'platform' || !e.members) continue;
			for (const rr of rings(e.members, 'outer')) {
				let hint = -1, ok = true;
				const sd = [];
				for (const [la, lo] of rr.slice(0, -1)) {
					const xy2 = P.xy(la, lo), pr = project(xy2[0], xy2[1], hint);
					if (!pr || Math.abs(pr.d) > 60) { ok = false; break; }
					hint = pr.k;
					sd.push([pr.s + shift, pr.d]);
				}
				if (!ok || sd.length < 3) continue;
				const row = [1];
				for (const [s2, d2] of simplifyRing(sd, 0.3)) row.push(R2(s2), R2(d2));
				pf.push(row);
			}
		}
		for (const e of els) {
			if (!e.tags) continue;
			const kind = areaKind(e.tags);
			if (!kind) continue;
			if (e.type === 'way' && e.geometry) {
				const g = e.geometry.filter(Boolean);
				if (g.length >= 4 && Math.abs(g[0].lat - g[g.length - 1].lat) < 1e-7 && Math.abs(g[0].lon - g[g.length - 1].lon) < 1e-7) addPoly(kind, [g.map((q) => [q.lat, q.lon])]);
			} else if (e.type === 'relation' && e.members) addPoly(kind, rings(e.members, 'outer'), rings(e.members, 'inner'));
		}
		const PB = 200, pidx = new Map();
		polys.forEach((p, i) => {
			for (let gx = Math.floor(p.x0 / PB); gx <= Math.floor(p.x1 / PB); gx++) for (let gy = Math.floor(p.y0 / PB); gy <= Math.floor(p.y1 / PB); gy++) {
				const key = gx * 100003 + gy;
				if (!pidx.has(key)) pidx.set(key, []);
				pidx.get(key).push(i);
			}
		});
		const cols = Math.round((2 * ENV_A) / ENV_STEP) + 1;
		const rowsOut = [];
		for (let s = 0; s <= endS; s += ENV_STEP) {
			const k = Math.min(n - 2, Math.floor(s / ENV_STEP));
			const a = pts[k], bb = pts[k + 1], L = Math.hypot(bb[0] - a[0], bb[1] - a[1]) || 1;
			const ux = (bb[0] - a[0]) / L, uy = (bb[1] - a[1]) / L;
			let line = '', last = -1, cnt = 0;
			for (let c = 0; c < cols; c++) {
				const d = -ENV_A + c * ENV_STEP;
				const x = a[0] + uy * d, y = a[1] - ux * d; // prawa strona względem kierunku jazdy: (uy, −ux)
				let kind = 0, pri = -1;
				for (const i of pidx.get(Math.floor(x / PB) * 100003 + Math.floor(y / PB)) || []) {
					const p = polys[i];
					if (p.pri <= pri || x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
					if (pointInPoly(x, y, p.xy) && !p.holes.some((h) => pointInPoly(x, y, h))) { kind = p.kind; pri = p.pri; }
				}
				if (kind === last) cnt++;
				else { if (cnt) line += String.fromCharCode(65 + last) + cnt; last = kind; cnt = 1; }
			}
			line += String.fromCharCode(65 + last) + cnt;
			rowsOut.push(line);
		}
		if (log && ctx.debug) log(`[debug] budynki odrzucone: ${JSON.stringify(dropB)}`);
		if (log) log(`Otoczenie: ${b.length} budynków (w tym ${b.filter((x) => x[0] === 6).length} dworców), ${r.length} odcinków dróg, ${tr.length} odcinków torów, ${pf.length} peronów, ${w.length} cieków, ${polys.length} obszarów.`);
		if (log && ov.length) log(`Wiadukty drogowe nad torem: ${ov.length}.`);
		// mosty drogowe obok toru: nad innymi torami prześwit 6,8 m, w pozostałych miejscach (ulica, rzeka) 3,5 m
		const segX = (a, b2, c, d2) => {
			const den = (b2[0] - a[0]) * (d2[1] - c[1]) - (b2[1] - a[1]) * (d2[0] - c[0]);
			if (Math.abs(den) < 1e-9) return false;
			const t1 = ((c[0] - a[0]) * (d2[1] - c[1]) - (c[1] - a[1]) * (d2[0] - c[0])) / den;
			const u1 = ((c[0] - a[0]) * (b2[1] - a[1]) - (c[1] - a[1]) * (b2[0] - a[0])) / den;
			return t1 >= 0 && t1 <= 1 && u1 >= 0 && u1 <= 1;
		};
		const ob = [];
		for (const [ti, run] of obRuns) {
			if (run.length < 2) continue;
			let overRail = false;
			for (const row of tr) {
				for (let i = 1; i + 3 < row.length && !overRail; i += 2) {
					const c = [row[i], row[i + 1]], d2 = [row[i + 2], row[i + 3]];
					for (let k = 0; k + 1 < run.length && !overRail; k++) if (segX(run[k], run[k + 1], c, d2)) overRail = true;
				}
				if (overRail) break;
			}
			const row = [ti, overRail ? 68 : 35];
			for (const [s2, d2] of run) row.push(R2(s2), R2(d2));
			ob.push(row);
		}
		if (log && ob.length) log(`Mosty drogowe obok toru: ${ob.length} (nad innymi torami: ${ob.filter((x) => x[1] === 68).length}).`);
		if (log && bufs.length) log(`Kozły oporowe (ślepe tory): ${bufs.length}.`);
		if (log && ro.length) log(`Wiadukty kolejowe nad torem: ${ro.length}.`);

		/* Rozjazdy i skrzyżowania torów z geometrii torów (węzły railway=switch w danych korytarza są bez
		   współrzędnych; typ i obsługę bierzemy z nich przez położenie w grafie torów – ctx.swTags).
		   3 kierunki: dwa rozchodzą się pod małym kątem (odgałęzienia), trzeci to ostrze. Zwykły rozjazd – jedno
		   odgałęzienie w osi ostrza (tor zasadniczy); symetryczny (wye) – oba odchylone. Promień łuku zwrotnego
		   dopasowany do geometrii z mapy (ok. 40 m odgałęzień, najmniejsze kwadraty: y = u² / 2R).
		   4 kierunki w dwóch prostych: skrzyżowanie torów, rozjazd krzyżowy pojedynczy lub podwójny (z typu w danych).
		   Wynik: [s, d, kierunek (setne radiana, układ s, d), strona (1 / −1), R (m; skrzyżowanie: 0), typ
		   (0 zwykły, 1 symetryczny, 2 skrzyżowanie, 3 krzyżowy pojedynczy, 4 krzyżowy podwójny), kąt skrzyżowania
		   (setne radiana), obsługa ręczna (1)]. */
		const sw = [];
		{
			const key = (q) => q.lat.toFixed(7) + ',' + q.lon.toFixed(7);
			const nb = new Map(), at = new Map();
			const seen = new Set();
			const railsAll = els.filter((e) => e.type === 'way' && e.tags && e.geometry && (e.tags.railway === 'rail' || e.tags.railway === 'disused' || e.tags['disused:railway'] === 'rail')).concat(ctx.rails || []);
			for (const e of railsAll) {
				if (seen.has(e.id) || (e.tags.tunnel && e.tags.tunnel !== 'no' && wayLen(e) >= 150)) continue;
				seen.add(e.id);
				const g = e.geometry.filter(Boolean);
				for (let i = 0; i < g.length; i++) {
					const k = key(g[i]);
					if (!nb.has(k)) { nb.set(k, new Map()); at.set(k, g[i]); }
					for (const j of [i - 1, i + 1]) if (j >= 0 && j < g.length) nb.get(k).set(key(g[j]), g[j]);
				}
			}
			const xyOf = (k) => { const q = at.get(k); return P.xy(q.lat, q.lon); };
			// typy rozjazdów: węzły z korytarza (położenie z grafu) i węzły z otoczenia (ze współrzędnymi)
			const swT = new Map(ctx.swTags || []);
			for (const e of els) if (e.type === 'node' && e.tags && e.lat !== undefined && (e.tags.railway === 'switch' || e.tags.railway === 'railway_crossing')) { const q = P.xy(e.lat, e.lon); swT.set(Math.round(q[0] * 10) + ',' + Math.round(q[1] * 10), { t: e.tags, id: e.id }); }
			const tagsAt = (o) => swT.get(Math.round(o[0] * 10) + ',' + Math.round(o[1] * 10)) || null;
			// maszty sieci trakcyjnej (power=catenary_mast) przy torach naszej linii – w grze linie słupów w tych miejscach
			for (const e of els) {
				if (e.type !== 'node' || !e.tags || e.tags.power !== 'catenary_mast' || e.lat === undefined) continue;
				const q = P.xy(e.lat, e.lon), pr = project(q[0], q[1], -1);
				if (pr && Math.abs(pr.d) <= 40) cm.push([R2(pr.s + shift), R2(pr.d)]);
			}
			cm.sort((a, b2) => a[0] - b2[0]);
			// łamana wzdłuż toru od węzła k w stronę sąsiada n (na rozgałęzieniach – najprościej), do maxLen m
			const walk = (k, n, maxLen) => {
				const out = [];
				let prev = k, cur = n, len = 0, dir = null;
				const o = xyOf(k);
				let last = o;
				while (cur && len < maxLen && out.length < 60) {
					const c = xyOf(cur);
					const L = dist2(c, last);
					len += L;
					if (L > 0.01) dir = [(c[0] - last[0]) / L, (c[1] - last[1]) / L];
					out.push(c);
					last = c;
					let best = null, bd = -2;
					for (const nk of nb.get(cur).keys()) {
						if (nk === prev) continue;
						const q = xyOf(nk), Lq = dist2(q, c) || 1;
						const dd = dir ? ((q[0] - c[0]) * dir[0] + (q[1] - c[1]) * dir[1]) / Lq : 1;
						if (dd > bd) { bd = dd; best = nk; }
					}
					if (bd < 0.9) break;
					prev = cur;
					cur = best;
				}
				return out;
			};
			// promień rozchodzenia się dwóch łamanych od punktu o (y = u² / 2R, u ≤ 38 m, y ≤ 3,5 m)
			const fitR = (o, ax, A, B) => {
				const nx = -ax[1], ny = ax[0];
				const loc = (pts2) => pts2.map((q) => [(q[0] - o[0]) * ax[0] + (q[1] - o[1]) * ax[1], (q[0] - o[0]) * nx + (q[1] - o[1]) * ny]);
				const a = loc(A), b = loc(B);
				const wAt = (arr, u) => {
					let pu = 0, pw = 0;
					for (const [qu, qw] of arr) { if (qu >= u) return qu - pu < 1e-6 ? qw : pw + ((qw - pw) * (u - pu)) / (qu - pu); pu = qu; pw = qw; }
					return null;
				};
				let su4 = 0, su2y = 0, n = 0;
				for (const [u, w] of b) {
					if (u < 3 || u > 38) continue;
					const wa = wAt(a, u);
					if (wa === null) continue;
					const y = Math.abs(w - wa);
					if (y > 3.5) break;
					su4 += u ** 4; su2y += u * u * y; n++;
				}
				if (n < 2 || su2y <= 0) return 0;
				return Math.max(120, Math.min(3000, su4 / (2 * su2y)));
			};
			const toSD = (o, dir, hint) => {
				const p1 = project(o[0] + dir[0] * 6, o[1] + dir[1] * 6, hint);
				return p1;
			};
			const ang = (p0, p1) => Math.atan2(p1.d - p0.d, p1.s - p0.s);
			const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
			let nWye = 0, nX = 0, nSlip = 0;
			for (const [k, m] of nb) {
				if (m.size !== 3 && m.size !== 4) continue;
				const o = xyOf(k);
				const keys = [...m.keys()];
				const dirs = keys.map((nk) => { const xy = xyOf(nk), L = dist2(xy, o) || 1; return [(xy[0] - o[0]) / L, (xy[1] - o[1]) / L]; });
				const dot = (i, j) => dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1];
				const p0 = project(o[0], o[1], -1);
				if (!p0 || Math.abs(p0.d) > 110 || !sOk(p0.s)) continue;
				const tw = tagsAt(o), tg = tw && tw.t, nodeId = tw ? tw.id : 0;
				const hand = tg && (tg['railway:local_operated'] === 'yes') ? 1 : 0;
				if (m.size === 3) {
					let bi = 0, bj = 1, bc = -2;
					for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (dot(i, j) > bc) { bc = dot(i, j); bi = i; bj = j; }
					if (bc < Math.cos((25 * Math.PI) / 180)) continue;
					const ti = 3 - bi - bj, ci = dot(ti, bi), cj = dot(ti, bj);
					const wyeTag = tg && tg['railway:switch'] === 'wye';
					if (Math.min(ci, cj) <= -0.9 && !(wyeTag && Math.abs(ci - cj) < 0.03)) {
						// zwykły: tor zasadniczy – odgałęzienie w osi ostrza
						const it = ci < cj ? bi : bj, iv = ci < cj ? bj : bi;
						const p1 = toSD(o, dirs[it], p0.k), p2 = toSD(o, dirs[iv], p0.k);
						if (!p1 || !p2) continue;
						const a = ang(p0, p1), da = wrap(ang(p0, p2) - a);
						const R = Math.round(fitR(o, dirs[it], walk(k, keys[it], 40), walk(k, keys[iv], 40))) || 190;
						sw.push([R1(p0.s + shift), R1(p0.d), Math.round(a * 100) / 100, da > 0 ? 1 : -1, R, 0, 0, hand]);
					} else {
						// symetryczny: oś – dwusieczna odgałęzień, promień rozchodzenia się obu torów
						const bx = dirs[bi][0] + dirs[bj][0], by = dirs[bi][1] + dirs[bj][1], L = Math.hypot(bx, by) || 1;
						const ax = [bx / L, by / L];
						const p1 = toSD(o, ax, p0.k);
						if (!p1) continue;
						const R = Math.round(fitR(o, ax, walk(k, keys[bi], 40), walk(k, keys[bj], 40))) || 190;
						sw.push([R1(p0.s + shift), R1(p0.d), Math.round(ang(p0, p1) * 100) / 100, 1, R, 1, 0, hand]);
						nWye++;
					}
				} else {
					// 4 kierunki: dwie proste (pary przeciwnych kierunków)
					// podział na dwie pary możliwie przeciwnych kierunków (przy małym kącie przeciwne są wszystkie cztery)
					let pairs = null, bestSum = Infinity;
					for (const pr of [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]]) {
						const sum = dot(pr[0][0], pr[0][1]) + dot(pr[1][0], pr[1][1]);
						if (sum < bestSum) { bestSum = sum; pairs = pr; }
					}
					if (dot(pairs[0][0], pairs[0][1]) > -0.95 || dot(pairs[1][0], pairs[1][1]) > -0.95) continue;
					const l1 = dirs[pairs[0][0]];
					let l2 = dirs[pairs[1][0]];
					if (l1[0] * l2[0] + l1[1] * l2[1] < 0) l2 = dirs[pairs[1][1]];
					const p1 = toSD(o, l1, p0.k), p2 = toSD(o, l2, p0.k);
					if (!p1 || !p2) continue;
					const a = ang(p0, p1), da = wrap(ang(p0, p2) - a);
					if (Math.abs(da) < 0.05) continue;
					// typ z danych: double_slip / single_slip / railway_crossing – pewny; węzeł oznaczony tylko jako rozjazd –
					// przyjęty rozjazd krzyżowy podwójny (najczęstszy), bez oznaczenia – skrzyżowanie (oba niepewne: uwaga)
					const st2 = tg && tg['railway:switch'];
					const kind = st2 === 'double_slip' ? 4 : st2 === 'single_slip' ? 3 : !tg || tg.railway === 'railway_crossing' ? 2 : 4;
					const known = st2 === 'double_slip' || st2 === 'single_slip' || (tg && tg.railway === 'railway_crossing') ? 1 : 0;
					if (kind > 2) nSlip++; else nX++;
					// [.., obsługa ręczna, typ pewny, węzeł OSM, strona połączeń pojedynczego (1 / −1)]
					sw.push([R1(p0.s + shift), R1(p0.d), Math.round(a * 100) / 100, da > 0 ? 1 : -1, 0, kind, Math.round(Math.abs(da) * 100) / 100, hand, known, nodeId, 1]);
				}
			}
			sw.sort((x, y) => x[0] - y[0]);

			/* Łagodny przebieg torów: (1) załamania łamanych z mapy zaokrąglone łukami (dwa przebiegi ścinania
			   narożników, punkty ostrzy rozjazdów i końce bez zmian); (2) przy rozjeździe tor zwrotny od ostrza za
			   krzyżownicę jak w rzeczywistości – stycznie do toru zasadniczego, po łuku y = u² / 2R (symetryczny:
			   ± u² / 4R), z płynnym przejściem (u/uj)³ w dalszy przebieg z mapy. */
			const toes = sw.filter((x) => x[5] <= 1);
			const nearToe = (q) => toes.some((x) => Math.abs(x[0] - q[0]) < 0.2 && Math.abs(x[1] - q[1]) < 0.2);
			const rounded = (P2) => {
				let A = P2;
				for (let it = 0; it < 2; it++) {
					const out = [A[0]];
					for (let i = 1; i < A.length - 1; i++) {
						const a = A[i - 1], b = A[i], c = A[i + 1];
						const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
						const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
						let turn = Math.abs(t2 - t1);
						if (turn > Math.PI) turn = 2 * Math.PI - turn;
						if (turn < 0.006 || nearToe(b) || l1 < 0.5 || l2 < 0.5) { out.push(b); continue; }
						const r = Math.min(10, 0.33 * l1, 0.33 * l2);
						out.push([b[0] - ((b[0] - a[0]) * r) / l1, b[1] - ((b[1] - a[1]) * r) / l1]);
						out.push([(b[0] * 2 + a[0] * 0 + (b[0] - ((b[0] - a[0]) * r) / l1) + (b[0] + ((c[0] - b[0]) * r) / l2)) / 4, (b[1] * 2 + (b[1] - ((b[1] - a[1]) * r) / l1) + (b[1] + ((c[1] - b[1]) * r) / l2)) / 4]);
						out.push([b[0] + ((c[0] - b[0]) * r) / l2, b[1] + ((c[1] - b[1]) * r) / l2]);
					}
					out.push(A[A.length - 1]);
					A = out;
				}
				return A;
			};
			for (let ri = 0; ri < tr.length; ri++) {
				const row = tr[ri];
				let P2 = [];
				for (let i = 1; i + 1 < row.length; i += 2) P2.push([row[i], row[i + 1]]);
				if (P2.length < 2) continue;
				// bez bardzo krótkich odcinków (gęste wierzchołki z mapy dają zygzaki): co najmniej 2 m, poza końcami i ostrzami
				const thin = (A, minL) => {
					const out = [A[0]];
					for (let i = 1; i < A.length - 1; i++) {
						const q = out[out.length - 1];
						if (Math.hypot(A[i][0] - q[0], A[i][1] - q[1]) >= minL || nearToe(A[i])) out.push(A[i]);
					}
					const e = A[A.length - 1];
					if (out.length > 1 && Math.hypot(e[0] - out[out.length - 1][0], e[1] - out[out.length - 1][1]) < 1 && !nearToe(out[out.length - 1])) out.pop();
					out.push(e);
					return out;
				};
				P2 = thin(rounded(thin(P2, 2)), 1.5);
				// tor zwrotny przy rozjeździe: odcinek od ostrza zastąpiony łukiem rozjazdu
				for (const x of toes) {
					const [s0, d0, a, side] = x, R = x[4] || 190, wye = x[5] === 1;
					const ca = Math.cos(a), sa = Math.sin(a);
					const toUV = (q) => [(q[0] - s0) * ca + (q[1] - d0) * sa, -(q[0] - s0) * sa + (q[1] - d0) * ca];
					let i0 = P2.findIndex((q) => Math.abs(q[0] - s0) < 0.2 && Math.abs(q[1] - d0) < 0.2);
					if (i0 < 0) {
						// tor odcięty przy torze pociągu: koniec łamanej tuż za ostrzem – dokładamy punkt ostrza
						const e0 = toUV(P2[0]), e1 = toUV(P2[P2.length - 1]);
						if (e0[0] > 0 && e0[0] < 12 && Math.abs(e0[1]) < 1) { P2.unshift([s0, d0]); i0 = 0; }
						else if (e1[0] > 0 && e1[0] < 12 && Math.abs(e1[1]) < 1) { P2.push([s0, d0]); i0 = P2.length - 1; }
						else continue;
					}
					for (const dir of [1, -1]) {
						// kierunek łamanej od ostrza: odgałęzienie (u > 0, odchylone w stronę rozjazdu) – nie tor zasadniczy
						const idx = [];
						for (let i = i0 + dir; i >= 0 && i < P2.length; i += dir) idx.push(i);
						if (!idx.length) continue;
						const far = idx.find((i) => Math.hypot(P2[i][0] - s0, P2[i][1] - d0) > 4);
						if (far === undefined) continue;
						const [uf, vf] = toUV(P2[far]);
						if (uf <= 0) continue;
						const sg = wye ? Math.sign(vf) || 1 : side;
						if (vf * sg < 0.04 * uf) continue; // tor zasadniczy (bez odchylenia)
						const k = wye ? 4 * R : 2 * R;
						// koniec łuku rozjazdu: za krzyżownicą; punkt styku leży na łamanej z mapy (interpolacja na odcinku,
						// a gdy wierzchołek jest blisko – sam wierzchołek, bez bardzo krótkich odcinków)
						let uc = Math.sqrt(2 * R * 1.5) + 6;
						let jj = -1, pc = null, slope = 0, prevI = i0;
						for (const i of idx) {
							const [ua, va] = toUV(P2[prevI]), [ub, vb] = toUV(P2[i]);
							if (ub >= uc) {
								slope = ub - ua > 1e-6 ? (vb - va) / (ub - ua) : 0;
								if (ub - uc < 8) { uc = ub; pc = [ub, vb]; jj = i; }
								else { pc = [uc, va + (vb - va) * ((uc - ua) / (ub - ua))]; jj = i; }
								break;
							}
							prevI = i;
						}
						if (jj < 0) continue; // odgałęzienie krótsze niż rozjazd – bez zmian
						// łuk rozjazdu y = u² / k z poprawką Hermite'a: na styku zgodne położenie i kierunek z łamaną
						const delta = pc[1] * sg - (uc * uc) / k, sigma = slope * sg - (2 * uc) / k;
						if (Math.abs(delta) > 2.5) continue; // geometria z mapy zbyt odmienna od rozjazdu – bez zmian
						const A = (3 * delta - sigma * uc) / (uc * uc), B = (sigma * uc - 2 * delta) / (uc * uc * uc);
						const curve = [];
						for (let u = 3; u < uc - 1.5; u += 3) {
							const v = sg * ((u * u) / k + A * u * u + B * u * u * u);
							curve.push([s0 + u * ca - v * sa, d0 + u * sa + v * ca]);
						}
						const vc = pc[1];
						if (pc[0] !== toUV(P2[jj])[0]) curve.push([s0 + uc * ca - vc * sa, d0 + uc * sa + vc * ca]);
						// wymiana punktów między ostrzem a punktem jj (od jj dalej – łamana z mapy)
						const lo = Math.min(i0, jj), hi = Math.max(i0, jj);
						P2 = dir > 0 ? P2.slice(0, i0 + 1).concat(curve, P2.slice(jj)) : P2.slice(0, jj + 1).concat(curve.slice().reverse(), P2.slice(i0));
						void lo; void hi;
						break;
					}
				}
				const nr = [row[0]];
				for (const [s2, d2] of P2) nr.push(R1(s2), R1(d2));
				tr[ri] = nr;
			}
			if (log && sw.length) log(`Rozjazdy: ${sw.length} (symetryczne: ${nWye}, krzyżowe: ${nSlip}, skrzyżowania torów: ${nX}).`);
		}
		/* Skrzyżowania innych linii między sobą (z dala od naszej linii): tor na moście (bridge / layer > 0), który
		   przecina inny tor albo drogę, biegnie 6,5 m nad terenem; połączone z nim tory wznoszą się do niego rampą
		   ok. 3% (do 220 m wzdłuż torów). Wynik: tz – dla toru (indeks jak w t) wysokości punktów nad terenem w dm. */
		const tz = new Array(tr.length).fill(null);
		let envTz = null;
		{
			const ptsOf = (row, off) => { const Q = []; for (let i = off; i + 1 < row.length; i += 2) Q.push([row[i], row[i + 1]]); return Q; };
			const TP = tr.map((row) => ptsOf(row, 1)), RP = r.map((row) => ptsOf(row, 1));
			// prawdziwe skrzyżowanie: odcinki przecinają się pod kątem > 8°, z dala (> 1,5 m) od ich końców –
			// nie styk torów na rozjeździe (wspólny punkt ostrza) ani tory równoległe
			const cross = (A, B) => {
				for (let i = 0; i + 1 < A.length; i++) for (let j = 0; j + 1 < B.length; j++) {
					const a = A[i], b2 = A[i + 1], c = B[j], d2 = B[j + 1];
					if (!segIntersect(a, b2, c, d2)) continue;
					const ux = b2[0] - a[0], uy = b2[1] - a[1], vx = d2[0] - c[0], vy = d2[1] - c[1];
					const den = ux * vy - uy * vx, lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
					if (Math.abs(den) < 0.14 * lu * lv) continue;
					const t = ((c[0] - a[0]) * vy - (c[1] - a[1]) * vx) / den, u = ((c[0] - a[0]) * uy - (c[1] - a[1]) * ux) / den;
					if (t * lu < 1.5 || (1 - t) * lu < 1.5 || u * lv < 1.5 || (1 - u) * lv < 1.5) continue;
					return true;
				}
				return false;
			};
			const box = (A) => { let a = Infinity, b2 = -Infinity, c = Infinity, d2 = -Infinity; for (const [x, y] of A) { a = Math.min(a, x); b2 = Math.max(b2, x); c = Math.min(c, y); d2 = Math.max(d2, y); } return [a, b2, c, d2]; };
			const TB = TP.map(box), RB = RP.map(box);
			const overlap = (u, v) => u[0] <= v[1] && v[0] <= u[1] && u[2] <= v[3] && v[2] <= u[3];
			const src = new Set();
			tr.forEach((row, i) => {
				// tylko z dala od naszej linii (30 m) i tylko nad innymi torami – nad drogą tor zostaje na poziomie dojazdów
				if (!(row[0] & 2) || TP[i].some(([, d2]) => Math.abs(d2) < 30)) return;
				let over = false;
				for (let j = 0; j < tr.length && !over; j++) if (j !== i && !(tr[j][0] & 2) && overlap(TB[i], TB[j]) && cross(TP[i], TP[j])) over = true;
				void RB;
				if (over) src.add(i);
			});
			if (src.size) {
				const key = (q) => Math.round(q[0] * 10) + ',' + Math.round(q[1] * 10);
				const adj = new Map();
				const link = (a, b2, L) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b2, L]); };
				TP.forEach((Q) => { for (let k = 0; k + 1 < Q.length; k++) { const L = Math.hypot(Q[k + 1][0] - Q[k][0], Q[k + 1][1] - Q[k][1]); link(key(Q[k]), key(Q[k + 1]), L); link(key(Q[k + 1]), key(Q[k]), L); } });
				/* Najbliższy wiadukt i odległość do niego wzdłuż torów (do 220 m): dla punktu toru kod = indeks wiaduktu
				   · 10000 + odległość w dm (−1 – brak). Wysokość liczy gra z rysowanego terenu: poziom wiaduktu = najniższy
				   teren pod nim + 6,5 m prześwitu, rampa 3%, tor nie niżej niż teren. */
				envTz = () => {
					const near = new Map(), h = new Heap();
					for (const i of src) for (const q of TP[i]) { near.set(key(q), [0, i]); h.push(0, key(q)); }
					while (h.size) {
						const [dd, kk] = h.pop();
						const cur = near.get(kk);
						if (dd > cur[0] || dd > 220) continue;
						for (const [k2, L] of adj.get(kk) || []) {
							const nd = dd + L, o = near.get(k2);
							if (!o || nd < o[0]) { near.set(k2, [nd, cur[1]]); h.push(nd, k2); }
						}
					}
					let nz = 0;
					TP.forEach((Q, i) => {
						const zs = Q.map((q) => { const v = near.get(key(q)); return v && v[0] <= 220 ? v[1] * 10000 + Math.round(v[0] * 10) : -1; });
						if (zs.some((v) => v >= 0)) { tz[i] = zs; nz++; }
					});
					if (log) log(`Wiadukty innych linii nad torami lub drogami: ${src.size} (torów z rampami: ${nz}).`);
					return tz.some(Boolean) ? tz : undefined;
				};
			}
		}
		if (cm.length && log) log(`Maszty sieci trakcyjnej z mapy: ${cm.length}.`);
		const autoSw = [];
		{
			const G = 20, cells = new Set();
			for (const row of b) for (let k = 3; k + 1 < row.length; k += 2) cells.add(Math.floor(row[k] / G) + ',' + Math.floor(row[k + 1] / G));
			const near = (s2, d2) => { for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) if (cells.has((Math.floor(s2 / G) + a) + ',' + (Math.floor(d2 / G) + c))) return true; return false; };
			r.forEach((row, i) => {
				if (ra[i][3] >= 0) return;
				let n = 0, hit = 0;
				for (let k = 1; k + 3 < row.length; k += 2) {
					const L = Math.hypot(row[k + 2] - row[k], row[k + 3] - row[k + 1]), m = Math.max(1, Math.ceil(L / 10));
					for (let j = 0; j < m; j++) { n++; if (near(row[k] + ((row[k + 2] - row[k]) * j) / m, row[k + 1] + ((row[k + 3] - row[k + 1]) * j) / m)) hit++; }
				}
				ra[i][3] = row[0] >= 2 && row[0] <= 6 && n && hit / n >= 0.4 ? 3 : 0;
				if (ra[i][3]) autoSw.push(i);
			});
			/* jezdnie dwujezdniowe i drogi równoległe tuż obok: bez chodnika od strony drugiej jezdni (równoległa, do
			   szerokości obu jezdni + 6 m, na co najmniej połowie długości) */
			const RW = [12, 10, 9, 8, 7, 5.5, 5.5, 4.5, 3.6, 4.5, 5], wOf = (i) => (ra[i][1] > 0 ? ra[i][1] / 10 : RW[r[i][0]] || 5);
			const SG = 20, sg = new Map();
			r.forEach((row, i) => {
				for (let k = 1; k + 3 < row.length; k += 2)
					for (let a = Math.floor(Math.min(row[k], row[k + 2]) / SG); a <= Math.floor(Math.max(row[k], row[k + 2]) / SG); a++)
						for (let c = Math.floor(Math.min(row[k + 1], row[k + 3]) / SG); c <= Math.floor(Math.max(row[k + 1], row[k + 3]) / SG); c++) {
							const key = a + ',' + c;
							if (!sg.has(key)) sg.set(key, []);
							sg.get(key).push(i, k);
						}
			});
			for (const i of autoSw) {
				const row = r[i];
				let n = 0, pr = 0, pl = 0;
				for (let k = 1; k + 3 < row.length; k += 2) {
					const L = Math.hypot(row[k + 2] - row[k], row[k + 3] - row[k + 1]);
					if (L < 0.5) continue;
					const u = [(row[k + 2] - row[k]) / L, (row[k + 3] - row[k + 1]) / L], nv = [-u[1], u[0]], m = Math.max(1, Math.round(L / 10));
					for (let q = 0; q < m; q++) {
						const p = [row[k] + (row[k + 2] - row[k]) * ((q + 0.5) / m), row[k + 1] + (row[k + 3] - row[k + 1]) * ((q + 0.5) / m)];
						let R0 = false, L0 = false;
						n++;
						for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
							const list = sg.get((Math.floor(p[0] / SG) + a) + ',' + (Math.floor(p[1] / SG) + c)) || [];
							for (let x = 0; x < list.length; x += 2) {
								const j = list[x], l = list[x + 1];
								if (j === i) continue;
								const r2 = r[j], L2 = Math.hypot(r2[l + 2] - r2[l], r2[l + 3] - r2[l + 1]);
								if (L2 < 0.5) continue;
								const v = [(r2[l + 2] - r2[l]) / L2, (r2[l + 3] - r2[l + 1]) / L2];
								if (Math.abs(u[0] * v[1] - u[1] * v[0]) > 0.42) continue; // ponad ok. 25°
								const t = ((p[0] - r2[l]) * v[0] + (p[1] - r2[l + 1]) * v[1]);
								if (t < 0 || t > L2) continue;
								const qx = r2[l] + v[0] * t - p[0], qy = r2[l + 1] + v[1] * t - p[1], dn = qx * nv[0] + qy * nv[1], lim = (wOf(i) + wOf(j)) / 2 + 6;
								if (dn > 0.5 && dn < lim) R0 = true;
								if (dn < -0.5 && dn > -lim) L0 = true;
							}
						}
						if (R0) pr++;
						if (L0) pl++;
					}
				}
				// nv – strona +d przy biegu drogi (prawa): sidewalk 2 – prawa, 1 – lewa
				if (n && pr / n >= 0.5) ra[i][3] &= ~2;
				if (n && pl / n >= 0.5) ra[i][3] &= ~1;
			}
		}
		if (log) log(`Ulice: ${r.length} odcinków, z chodnikami ${ra.filter((q) => q[3] > 0).length}; przejścia dla pieszych ${rx.length}, parkingi i place ${pk.length}.`);
		return { v: 8, b, bu, bn, _bTags: bTags, cm: cm.flat(), rf, r, ra, rx, pk, w, t: tr, _tz: envTz, p: pf, o: ov, ob, ro, sw, k: bufs, g: { step: ENV_STEP, s0: shift, d0: -ENV_A, cols, rows: rowsOut } };
	}

	/* Peron przy torze pociągu na stacji (pos – miejsce zatrzymania, kilometraż z przesunięciem): spośród peronów
	   z mapy ten, którego bliższa krawędź leży 1,2–3,6 m od osi toru i który obejmuje miejsce zatrzymania.
	   Zwraca stronę (1 – prawa, −1 – lewa), odległość krawędzi od osi, szerokość, początek i koniec (s), czy peron
	   jest wyspowy (tor po drugiej stronie) i indeks peronu w env.p (gra rysuje go wtedy jako peron stacji). */
	/* Brak peronu w mapie: układ z prawdziwych torów wzdłuż peronu (defLen m przed miejscem zatrzymania).
	   Peron z gry nie może wejść na tor: po prawej, jeśli tam jest miejsce; po lewej, jeśli po prawej leży tor;
	   wyspowy między naszym torem a najbliższym torem po stronie z większym odstępem, gdy tory są po obu stronach. */
	function inferPlatform(env, pos, defLen, halt) {
		const s1 = pos + 15, s0 = s1 - defLen;
		const near = { 1: [], '-1': [] };
		for (let s = s0 + 10; s <= s1 - 5; s += 20) {
			for (const sg of [1, -1]) {
				let nd = Infinity;
				for (const row of env.t || []) {
					for (let i = 1; i + 3 < row.length; i += 2) {
						const sa = row[i], sb = row[i + 2];
						if ((sa - s) * (sb - s) > 0) continue;
						const t = Math.abs(sb - sa) < 1e-6 ? 0 : (s - sa) / (sb - sa);
						const d = (row[i + 1] + (row[i + 3] - row[i + 1]) * t) * sg;
						if (d > 1.6 && d < nd) nd = d;
					}
				}
				near[sg].push(nd);
			}
		}
		const blocked = (sg, lim) => near[sg].filter((d) => d < lim).length / Math.max(1, near[sg].length);
		const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : Infinity; };
		/* szerokość z wolnego miejsca: tor za peronem 7,6–16 m od osi – peron wyspowy między torami (do 10 m);
		   dalej albo brak toru – peron jednostronny (przystanek 4,5 m, stacja 6,5 m) */
		const make = (sg) => {
			const gap = med(near[sg]);
			const base = { side: sg, edge: 1.7, s0: Math.round(s0), s1: Math.round(s1), inferred: true };
			if (gap >= 7.6 && gap <= 16) return Object.assign(base, { width: Math.round(Math.min(10, gap - 3.4) * 10) / 10, island: true });
			return Object.assign(base, { width: halt ? 4.5 : 6.5 });
		};
		if (blocked(1, 7.6) < 0.2) return make(1); // po prawej miejsce na peron
		if (blocked(-1, 7.6) < 0.2) return make(-1);
		const sg = med(near[1]) >= med(near[-1]) ? 1 : -1, gap = med(near[sg]);
		if (gap < 6.5) return null; // za ciasno na peron wyspowy – zostaje domyślny
		return { side: sg, edge: 1.7, width: Math.round(Math.min(10, gap - 3.4) * 10) / 10, s0: Math.round(s0), s1: Math.round(s1), island: true, inferred: true };
	}

	/* peron stacji z mapy: obrys przylegający do toru przebiegu w miejscu zatrzymania. Przekroje poprzeczne co 5 m
	   (przecięcia boków obrysu z linią s = const; peron jako linia – ±2 m): krawędź przy torze 1,2–3,6 m od osi; zasięg –
	   ciągły odcinek takich przekrojów wokół miejsca zatrzymania, szerokość – mediana przekrojów. Wygrywa najdłuższy
	   zasięg (dawniej: najbliższy punkt i długość całego obrysu – peron przy odchodzącej linii, tylko końcem przy naszym
	   torze, wygrywał z peronem wyspowym przy torze, np. Toruń Wschodni) */
	function platformLayout(env, pos, defLen, halt) {
		let best = null;
		(env.p || []).forEach((row, pi) => {
			const n = (row.length - 1) / 2, line = row[0] === 0;
			const pt = (k) => [row[1 + k * 2], row[2 + k * 2]];
			let s0 = Infinity, s1 = -Infinity;
			for (let k = 0; k < n; k++) { s0 = Math.min(s0, pt(k)[0]); s1 = Math.max(s1, pt(k)[0]); }
			if (pos < s0 - 30 || pos > s1 + 30) return;
			// przekrój w s: [dMin, dMax] albo null
			const xsec = (s) => {
				let lo = Infinity, hi = -Infinity;
				const m = line ? n - 1 : n;
				for (let k = 0; k < m; k++) {
					const a = pt(k), b = pt((k + 1) % n);
					if ((a[0] - s) * (b[0] - s) > 0 || a[0] === b[0]) continue;
					const d = a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0]);
					lo = Math.min(lo, d - (line ? 2 : 0));
					hi = Math.max(hi, d + (line ? 2 : 0));
				}
				return lo <= hi ? [lo, hi] : null;
			};
			const ok = (s, side) => {
				const x = xsec(s);
				if (!x || (x[0] < 0 && x[1] > 0)) return null;
				if ((x[0] > 0 ? 1 : -1) !== side) return null;
				const edge = side > 0 ? x[0] : -x[1], far = side > 0 ? x[1] : -x[0];
				return edge >= 1.2 && edge <= 3.6 ? { edge, w: far - edge } : null;
			};
			// strona i przekrój przy miejscu zatrzymania (czoło pociągu – peron głównie za nim)
			const sp = Math.max(s0 + 1, Math.min(s1 - 1, pos - 10));
			const x0 = xsec(sp);
			if (!x0 || (x0[0] < 0 && x0[1] > 0)) return;
			const side = x0[0] > 0 ? 1 : -1;
			if (!ok(sp, side)) return;
			const edges = [], widths = [];
			let a = sp, b = sp;
			for (let s = sp; s >= s0; s -= 5) { const q = ok(s, side); if (!q) break; a = s; edges.push(q.edge); widths.push(q.w); }
			for (let s = sp + 5; s <= s1; s += 5) { const q = ok(s, side); if (!q) break; b = s; edges.push(q.edge); widths.push(q.w); }
			if (b - a < 60) return;
			const med = (v) => { const c = v.slice().sort((x, y) => x - y); return c[c.length >> 1]; };
			if (!best || b - a > best.s1 - best.s0) best = { side, edge: Math.round(med(edges) * 10) / 10, width: Math.round(Math.max(3.5, Math.min(14, med(widths))) * 10) / 10, s0: Math.round(a), s1: Math.round(Math.max(b, pos + 5)), pi };
		});
		if (!best) return inferPlatform(env, pos, defLen, halt);
		// wyspowy: za dalszą krawędzią, 1,2–3,6 m dalej, biegnie inny tor z mapy
		const far = best.edge + best.width;
		let island = false;
		for (const row of env.t || []) {
			if (row[0] & 4) continue; // stary, nieużywany tor za peronem nie robi z niego peronu wyspowego
			for (let i = 1; i < row.length && !island; i += 2) {
				const s2 = row[i], d2 = row[i + 1] * best.side;
				if (s2 > best.s0 + 20 && s2 < best.s1 - 20 && d2 > far + 1.2 && d2 < far + 3.6) island = true;
			}
			if (island) break;
		}
		if (island) best.island = true;
		return best;
	}

	/* Budowa trasy z pobranych danych.
	   opts: { from, to (nazwy stacji), line (numer linii, opcjonalnie), elevation (async (punkty) => wysokości), log, id, meta } */
	async function buildRoute(data, opts) {
		const log = opts.log || (() => {});
		const els = data.elements;
		const ways = els.filter((e) => e.type === 'way' && e.tags && e.tags.railway === 'rail' && e.nodes && e.geometry);
		const waters = els.filter((e) => e.type === 'way' && e.tags && e.tags.waterway && e.geometry);
		const tagged = new Map();
		for (const e of els) if (e.type === 'node' && e.tags && e.tags.railway && e.tags.railway !== 'station' && e.tags.railway !== 'halt') tagged.set(e.id, e);
		const stationNodes = els.filter((e) => e.type === 'node' && e.tags && (e.tags.railway === 'station' || e.tags.railway === 'halt') && e.tags.name);
		if (!ways.length) throw new Error('Brak torów w pobranym obszarze.');
		const A = stationNodes.find((s) => s.tags.name === opts.from), B = stationNodes.find((s) => s.tags.name === opts.to);
		if (!A) throw new Error(`Nie znaleziono stacji „${opts.from}” w pobranym obszarze.`);
		if (!B) throw new Error(`Nie znaleziono stacji „${opts.to}” w pobranym obszarze.`);
		const P = projector((A.lat + B.lat) / 2, (A.lon + B.lon) / 2);

		// graf torów: wierzchołki – węzły OSM, krawędzie – odcinki dróg (z kierunkiem względem drogi)
		const pos = new Map(), adj = new Map();
		const link = (a, b, L, w, fwd) => {
			if (!adj.has(a)) adj.set(a, []);
			adj.get(a).push({ from: a, to: b, L, w, fwd });
		};
		for (const w of ways) {
			const ids = w.nodes, g = w.geometry;
			for (let i = 0; i < ids.length - 1; i++) {
				if (!g[i] || !g[i + 1]) continue;
				const pa = P.xy(g[i].lat, g[i].lon), pb = P.xy(g[i + 1].lat, g[i + 1].lon);
				pos.set(ids[i], pa);
				pos.set(ids[i + 1], pb);
				const L = dist2(pa, pb);
				link(ids[i], ids[i + 1], L, w, true);
				link(ids[i + 1], ids[i], L, w, false);
			}
		}
		const nearestNode = (p) => {
			let best = null, bd = Infinity;
			for (const [id, q] of pos) { const d = dist2(p, q); if (d < bd) { bd = d; best = id; } }
			return { id: best, d: bd };
		};
		const pA = P.xy(A.lat, A.lon), pB = P.xy(B.lat, B.lon);
		const nA = nearestNode(pA), nB = nearestNode(pB);
		if (nA.d > 600) throw new Error(`Stacja „${opts.from}” leży daleko od torów (${Math.round(nA.d)} m).`);
		if (nB.d > 600) throw new Error(`Stacja „${opts.to}” leży daleko od torów (${Math.round(nB.d)} m).`);

		// siatka próbek wszystkich torów (co 8 m, z kierunkiem): tor równoległy po lewej/prawej, linia dwutorowa
		const G = 25, grid = new Map();
		const gk = (x, y) => Math.floor(x / G) * 100003 + Math.floor(y / G);
		for (const w of ways) {
			const g = w.geometry;
			for (let i = 0; i < g.length - 1; i++) {
				if (!g[i] || !g[i + 1]) continue;
				const a = P.xy(g[i].lat, g[i].lon), b = P.xy(g[i + 1].lat, g[i + 1].lon);
				const L = dist2(a, b);
				if (L < 0.5) continue;
				const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
				for (let t = 0; t <= L; t += 8) {
					const x = a[0] + ux * t, y = a[1] + uy * t, k = gk(x, y);
					if (!grid.has(k)) grid.set(k, []);
					grid.get(k).push({ x, y, ux, uy, w: w.id });
				}
			}
		}
		const sideTracks = (x, y, ux, uy, self) => {
			let left = false, right = false;
			const cx = Math.floor(x / G), cy = Math.floor(y / G);
			for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
				for (const q of grid.get((cx + i) * 100003 + cy + j) || []) {
					if (q.w === self || Math.abs(q.ux * ux + q.uy * uy) < 0.97) continue;
					const ox = q.x - x, oy = q.y - y;
					if (Math.abs(ox * ux + oy * uy) > 12) continue;
					const lat = ox * uy - oy * ux; // > 0 – po prawej względem kierunku jazdy
					if (lat > 2.8 && lat < 8) right = true;
					else if (lat < -2.8 && lat > -8) left = true;
				}
			}
			return { left, right };
		};
		// koszt krawędzi: preferowana linia, tor główny (nie bocznice), ruch prawostronny na liniach dwutorowych
		const cost = (e) => {
			const t = e.w.tags;
			let f = 1;
			if (opts.line && !refs(t).includes(String(opts.line))) f *= 2.5;
			if (t.service) f *= t.service === 'crossover' ? 1.6 : 4;
			if (e.leftTrack === undefined) {
				const a = pos.get(e.from), b = pos.get(e.to);
				const ux = (b[0] - a[0]) / Math.max(1e-6, e.L), uy = (b[1] - a[1]) / Math.max(1e-6, e.L);
				const sd = sideTracks((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ux, uy, e.w.id);
				e.leftTrack = sd.right && !sd.left; // obok, po prawej, biegnie drugi tor – jedziemy lewym
			}
			if (e.leftTrack) f *= 3;
			return e.L * f;
		};
		/* Wyszukiwanie po krawędziach z kierunkiem: z odcinka można przejść tylko na odcinek, który go łagodnie
		   przedłuża (jak przez rozjazd) – bez zawracania i bez ostrych załamań. Węzłowy algorytm Dijkstry
		   „przechodził” przez rozjazd i cofał się na sąsiedni tor, czego pociąg zrobić nie może. */
		const edgeDir = (e) => {
			if (!e.dir) {
				const a = pos.get(e.from), b = pos.get(e.to), L = Math.max(1e-6, e.L);
				e.dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
			}
			return e.dir;
		};
		const smoothTurn = (e, f) => {
			if (f.to === e.from) return false;
			const a = edgeDir(e), b = edgeDir(f);
			return a[0] * b[0] + a[1] * b[1] > 0.72; // do ok. 44° między kolejnymi odcinkami
		};
		const search = (src, target, maxCost) => {
			const dist = new Map(), prev = new Map(), h = new Heap();
			for (const e of adj.get(src) || []) { const c = cost(e); dist.set(e, c); h.push(c, e); }
			let hit = null;
			while (h.size) {
				const [d, e] = h.pop();
				if (d > dist.get(e)) continue;
				if (target != null && e.to === target) { hit = e; break; }
				if (maxCost && d > maxCost) continue;
				for (const f of adj.get(e.to) || []) {
					if (!smoothTurn(e, f)) continue;
					const nd = d + cost(f);
					if (nd < (dist.has(f) ? dist.get(f) : Infinity)) { dist.set(f, nd); prev.set(f, e); h.push(nd, f); }
				}
			}
			return { dist, prev, hit };
		};
		const edgePath = (prev, last) => {
			const edges = [last];
			while (prev.has(edges[edges.length - 1])) edges.push(prev.get(edges[edges.length - 1]));
			edges.reverse();
			return { nodes: [edges[0].from].concat(edges.map((e) => e.to)), edges };
		};

		// rozbieg przed stacją początkową (pociąg stoi czołem przy W4, reszta składu za nim) i odcinek za końcową
		const dirAB = [pB[0] - pA[0], pB[1] - pA[1]];
		// kandydaci (różne tory) w odległości lo–hi od stacji, w stronę przeciwną do `away`
		const behind = (start, away, lo, hi) => {
			const { dist } = search(start, null, hi * 2);
			const p0 = pos.get(start), na = Math.hypot(away[0], away[1]);
			const c = [];
			for (const [e, d] of dist) {
				if (d < lo || d > hi) continue;
				const q = pos.get(e.to);
				const dot = ((q[0] - p0[0]) * away[0] + (q[1] - p0[1]) * away[1]) / (na * Math.max(1, dist2(q, p0)));
				if (dot < -0.3) c.push({ id: e.to, dot, q });
			}
			c.sort((a, b) => a.dot - b.dot);
			const out = [];
			for (const k of c) if (out.length < 8 && !out.some((o) => dist2(o.q, k.q) < 3)) out.push(k);
			return out.length ? out.map((k) => k.id) : [start];
		};
		log('Wyznaczam przebieg toru…');
		const pres = behind(nA.id, dirAB, 450, 900);
		const post = behind(nB.id, [-dirAB[0], -dirAB[1]], 120, 400)[0];

		// tor dla naszego kierunku: wariant z największą liczbą semaforów zwróconych w stronę jazdy
		const facing = (path) => {
			let fw = 0, bw = 0;
			path.nodes.forEach((id, i) => {
				const n = tagged.get(id);
				if (!n || n.tags.railway !== 'signal') return;
				const e = path.edges[Math.min(i, path.edges.length - 1)];
				const dir = n.tags['railway:signal:direction'];
				if (!dir || dir === 'both') return;
				if ((dir === 'forward') === e.fwd) fw++;
				else bw++;
			});
			return { fw, bw };
		};
		// spośród punktów startowych na różnych torach – przebieg o najniższym koszcie (prawy tor, główna linia)
		let found = null;
		for (const pre of pres) {
			const f = search(pre, post);
			if (f.hit && (!found || f.dist.get(f.hit) < found.dist.get(found.hit))) found = f;
		}
		const path = found ? edgePath(found.prev, found.hit) : null;
		if (!path) throw new Error('Nie da się połączyć stacji torami w pobranym obszarze – sprawdź nazwy lub numer linii.');
		const fc = facing(path);
		if (opts.debug) {
			const lt = path.edges.filter((e) => e.leftTrack).reduce((a2, e) => a2 + e.L, 0), all = path.edges.reduce((a2, e) => a2 + e.L, 0);
			const refsOn = {};
			for (const e of path.edges) { const r = e.w.tags.ref || '-'; refsOn[r] = (refsOn[r] || 0) + e.L; }
			let acc = 0, run = null;
			const runs = [];
			for (const e of path.edges) {
				if (e.leftTrack && !run) run = [acc, acc];
				if (run) { if (e.leftTrack) run[1] = acc + e.L; else { if (run[1] - run[0] > 200) runs.push(run); run = null; } }
				acc += e.L;
			}
			log(`[debug] odcinki po lewym torze (km): ${runs.map(([a2, b2]) => (a2 / 1000).toFixed(1) + '–' + (b2 / 1000).toFixed(1)).join(', ')}`);
			log(`[debug] lewy tor: ${Math.round(lt)} / ${Math.round(all)} m; numery linii na przebiegu: ${Object.entries(refsOn).map(([k, v]) => k + ':' + Math.round(v)).join(' ')}`);
		}
		log(`Przebieg: ${path.nodes.length} węzłów; semafory zwrócone w stronę jazdy: ${fc.fw}, w przeciwną: ${fc.bw}.`);

		const pathWays0 = new Set(path.edges.map((e) => e.w.id));
		// ---------- próbkowanie przebiegu co STEP m ----------
		const raw = path.nodes.map((id) => pos.get(id));
		const rawS = [0];
		for (let i = 1; i < raw.length; i++) rawS.push(rawS[i - 1] + dist2(raw[i - 1], raw[i]));
		const total = rawS[rawS.length - 1];
		const n = Math.floor(total / STEP) + 1;
		const pts = [];
		let j = 0;
		for (let k = 0; k < n; k++) {
			const s = k * STEP;
			while (j < raw.length - 2 && rawS[j + 1] < s) j++;
			const t = (s - rawS[j]) / Math.max(1e-6, rawS[j + 1] - rawS[j]);
			pts.push([raw[j][0] + (raw[j + 1][0] - raw[j][0]) * t, raw[j][1] + (raw[j + 1][1] - raw[j][1]) * t]);
		}
		// kilometraż węzłów przebiegu i odcinków (z tagami drogi)
		const nodeS = new Map();
		path.nodes.forEach((id, i) => { if (!nodeS.has(id)) nodeS.set(id, rawS[i]); });
		const edgeAt = (s) => {
			let lo = 0, hi = rawS.length - 2;
			while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rawS[m] <= s) lo = m; else hi = m - 1; }
			return path.edges[lo];
		};
		const project = (p, maxD) => {
			let bi = -1, bd = maxD;
			for (let k = 0; k < pts.length; k++) { const d = dist2(p, pts[k]); if (d < bd) { bd = d; bi = k; } }
			if (bi < 0) return null;
			// dokładnie: rzut na sąsiednie odcinki (dawniej najbliższy punkt – co 10 m)
			let bs = bi * STEP, bd2 = Infinity;
			for (const k of [bi - 1, bi]) {
				if (k < 0 || k + 1 >= pts.length) continue;
				const a = pts[k], b = pts[k + 1], ux = b[0] - a[0], uy = b[1] - a[1], L2 = ux * ux + uy * uy || 1e-9;
				const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / L2));
				const dd = Math.hypot(p[0] - (a[0] + ux * t), p[1] - (a[1] + uy * t));
				if (dd < bd2) { bd2 = dd; bs = (k + t) * STEP; }
			}
			return bs;
		};

		// ---------- oś toru w grze i krzywizna (1/R, + w prawo) ----------
		/* Gra buduje tor z samej krzywizny (całkowanie co 2 m), a otoczenie leży w układzie (s, d) względem osi.
		   Żeby tory, perony i budynki z mapy pasowały do toru w grze, oś musi być dokładnie tą linią, którą gra
		   odtworzy z krzywizny. Krzywizna jest więc „sterowana”: przewidywana z wygładzonego przebiegu (bez załamań
		   łamanej z mapy) i korygowana tak, by całkowana jak w grze linia trzymała się przebiegu. Ta linia (C) staje
		   się osią, na którą rzutujemy wszystko; odchyłkę od toru z mapy raportujemy. */
		const smooth = (arr, half) => arr.map((_, k) => {
			let s = 0, c = 0;
			for (let q = Math.max(0, k - half); q <= Math.min(arr.length - 1, k + half); q++) { s += arr[q]; c++; }
			return s / c;
		});
		const rawPts = pts.map((p) => p.slice());
		const psx = smooth(smooth(pts.map((p) => p[0]), 2), 2), psy = smooth(smooth(pts.map((p) => p[1]), 2), 2);
		const ps = psx.map((x, k) => [x, psy[k]]);
		const brg = [];
		for (let k = 0; k < n - 1; k++) brg.push(Math.atan2(ps[k + 1][0] - ps[k][0], ps[k + 1][1] - ps[k][1]));
		for (let k = 1; k < brg.length; k++) {
			while (brg[k] - brg[k - 1] > Math.PI) brg[k] -= 2 * Math.PI;
			while (brg[k] - brg[k - 1] < -Math.PI) brg[k] += 2 * Math.PI;
		}
		const kff = smooth(brg.map((_, k) => (k === 0 || k === brg.length - 1 ? 0 : (brg[k + 1] - brg[k - 1]) / (2 * STEP))), 1);
		const KMAX = 1 / 150, WN = 1 / 60; // najciaśniejszy łuk; długość reakcji korekty ok. 60 m
		const curv = new Array(n).fill(0);
		const C = [ps[0].slice()];
		const tightK = [];
		{
			let x = ps[0][0], y = ps[0][1], th = brg[0], j = 0;
			curv[0] = Math.round(Math.max(-KMAX, Math.min(KMAX, kff[0])) * 1e5) / 1e5;
			for (let i = 0; i < n - 1; i++) {
				let bd = Infinity, e = 0, eb = brg[Math.min(i, brg.length - 1)], bj = j;
				for (let q = Math.max(0, j - 3); q <= Math.min(n - 2, j + 6); q++) {
					const a = ps[q], b = ps[q + 1], ux = b[0] - a[0], uy = b[1] - a[1], L2 = ux * ux + uy * uy || 1e-9;
					const t = Math.max(0, Math.min(1, ((x - a[0]) * ux + (y - a[1]) * uy) / L2));
					const dd = Math.hypot(x - (a[0] + ux * t), y - (a[1] + uy * t));
					if (dd < bd) { bd = dd; bj = q; e = ((x - a[0]) * uy - (y - a[1]) * ux) / Math.sqrt(L2); eb = brg[q]; }
				}
				j = bj;
				let eh = th - eb;
				while (eh > Math.PI) eh -= 2 * Math.PI;
				while (eh < -Math.PI) eh += 2 * Math.PI;
				const want = kff[Math.min(kff.length - 1, i + 1)] - WN * WN * e - 2 * WN * eh;
				if (Math.abs(kff[Math.min(kff.length - 1, i + 1)]) > KMAX * 1.05) tightK.push(i + 1);
				const k1 = Math.round(Math.max(-KMAX, Math.min(KMAX, want)) * 1e5) / 1e5;
				curv[i + 1] = k1;
				// całkowanie jak w grze (routes.js buildAlignment): krok 2 m, krzywizna w połowie kroku
				for (let q = 0; q < 5; q++) {
					const km = curv[i] + (k1 - curv[i]) * ((q + 0.5) / 5);
					const tm = th + km;
					x += Math.sin(tm) * 2;
					y += Math.cos(tm) * 2;
					th += km * 2;
				}
				C.push([x, y]);
			}
		}
		// odchyłka osi w grze od toru z mapy (rzut na łamaną przebiegu)
		const devAt = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			let bd = Infinity;
			for (let q = Math.max(0, i - 6); q <= Math.min(n - 2, i + 6); q++) {
				const a = rawPts[q], b = rawPts[q + 1], ux = b[0] - a[0], uy = b[1] - a[1], L2 = ux * ux + uy * uy || 1e-9;
				const t = Math.max(0, Math.min(1, ((C[i][0] - a[0]) * ux + (C[i][1] - a[1]) * uy) / L2));
				bd = Math.min(bd, Math.hypot(C[i][0] - (a[0] + ux * t), C[i][1] - (a[1] + uy * t)));
			}
			devAt[i] = bd;
		}
		{
			let sum = 0, mx = 0;
			let mi = 0;
			for (let i = 5; i < n - 5; i++) { sum += devAt[i]; if (devAt[i] > mx) { mx = devAt[i]; mi = i; } }
			if (opts.debug) log(`[debug] największa odchyłka przy s = ${mi * STEP} m`);
			log(`Oś toru w grze: odchyłka od toru z mapy średnio ${(sum / Math.max(1, n - 10)).toFixed(2)} m, najwięcej ${mx.toFixed(2)} m.`);
		}
		// od tej chwili przebieg = oś toru w grze (stacje, semafory, otoczenie, profil rzutujemy na nią)
		for (let k = 0; k < n; k++) pts[k] = C[k];
		/* kilometraż węzłów przebiegu w układzie osi w grze: rzut każdego węzła łamanej z mapy na oś C (dokładnie, nie
		   co 10 m). Dawniej długość wzdłuż surowej łamanej (rawS) – jest dłuższa od wygładzonej osi (zygzaki punktów,
		   przejścia przez rozjazdy na stacjach), różnica narastała do kilkunastu metrów: przejazdy, semafory, W4
		   (miejsca zatrzymania), mosty, ograniczenia i sieć trakcyjna leżały obok ulic, peronów i torów z mapy
		   (rzutowanych na oś). Od tej chwili rawS, nodeS i edgeAt są w układzie osi. */
		{
			let kPrev = 0, sPrev = 0;
			for (let i = 0; i < raw.length; i++) {
				const p = raw[i];
				let best = null;
				const kHint = Math.max(kPrev, Math.round(rawS[i] / STEP) - 40);
				for (let k = Math.max(0, kPrev - 3); k <= Math.min(n - 2, Math.max(kHint, kPrev) + 60); k++) {
					const a = C[k], b = C[k + 1], ux = b[0] - a[0], uy = b[1] - a[1], L2 = ux * ux + uy * uy || 1e-9;
					const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / L2));
					const dd = Math.hypot(p[0] - (a[0] + ux * t), p[1] - (a[1] + uy * t));
					if (!best || dd < best.dd - 1e-6) best = { dd, k, s: (k + t) * STEP };
				}
				const s = best ? Math.max(sPrev, best.s) : sPrev;
				if (best) kPrev = best.k;
				rawS[i] = s;
				sPrev = s;
			}
			nodeS.clear();
			path.nodes.forEach((id, i) => { if (!nodeS.has(id)) nodeS.set(id, rawS[i]); });
		}

		// ---------- stacje ----------
		const forwardSignal = (id, s) => {
			const n0 = tagged.get(id);
			if (!n0 || n0.tags.railway !== 'signal') return null;
			const e = edgeAt(Math.max(0, s - 0.01));
			const dir = n0.tags['railway:signal:direction'];
			if (dir && dir !== 'both' && (dir === 'forward') !== e.fwd) return null;
			return n0;
		};
		const sigs = []; // semafory i wskaźniki zwrócone w stronę jazdy: { s, tags }
		for (const [id, s] of nodeS) { const sn = forwardSignal(id, s); if (sn) sigs.push({ s, tags: sn.tags }); }
		sigs.sort((a, b) => a.s - b.s);
		const w4 = sigs.filter((q) => q.tags['railway:signal:stop']);
		const platformLength = opts.platformLength || 220;
		const stations = [];
		const seen = new Set();
		const sA = project(pA, 400), sB = project(pB, 400);
		for (const st of stationNodes) {
			if (seen.has(st.tags.name)) continue;
			const s0 = project(P.xy(st.lat, st.lon), 250);
			if (opts.debug) log(`[debug] stacja ${st.tags.name}: ${s0 === null ? 'poza przebiegiem (> 250 m)' : 'km ' + (s0 / 1000).toFixed(2)}`);
			if (s0 === null || s0 < sA - 50 || s0 > sB + 50) continue;
			seen.add(st.tags.name);
			// miejsce zatrzymania: wskaźnik W4 zwrócony w naszą stronę przy stacji, inaczej przed środkiem peronu
			// okno do 300 m za węzłem stacji (węzeł bywa przy budynku, a W4 na końcu długiego peronu)
			const w = w4.filter((q) => q.s > s0 - 150 && q.s < s0 + 300).sort((a, b) => Math.abs(a.s - s0 - 70) - Math.abs(b.s - s0 - 70))[0];
			if (opts.debug) {
				const any = [...nodeS].filter(([id]) => { const n0 = tagged.get(id); return n0 && n0.tags['railway:signal:stop']; }).map(([id, s]) => `${id}@${Math.round(s)} ${tagged.get(id).tags['railway:signal:direction'] || ''}`);
				log(`[debug] W4 „${st.tags.name}” (s0 ${Math.round(s0)}): w stronę jazdy ${w4.map((q) => Math.round(q.s)).join(', ') || '–'}; na przebiegu ${any.join(', ') || '–'}`);
			}
			stations.push({ name: st.tags.name, s: w ? w.s : s0 + 80, type: st.tags.railway === 'halt' ? 'halt' : 'station', noW4: !w });
		}
		stations.sort((a, b) => a.s - b.s);
		// pierwsza i ostatnia – wybrane stacje; zbyt bliskie przystanki pomijamy
		const list = [], skippedSt = [];
		for (const st of stations) {
			const isEnd = st.name === opts.from || st.name === opts.to;
			if (list.length && st.s - list[list.length - 1].s < 900 && !isEnd) { skippedSt.push({ st, prev: list[list.length - 1].name }); continue; }
			if (list.length && st.s - list[list.length - 1].s < 900 && isEnd && list[list.length - 1].name !== opts.from) skippedSt.push({ st: list.pop(), prev: st.name });
			list.push(st);
		}
		const first = list.findIndex((s) => s.name === opts.from), last = list.findIndex((s) => s.name === opts.to);
		if (first < 0 || last <= first) throw new Error('Stacje leżą w złej kolejności albo zbyt blisko siebie.');
		const route = list.slice(first, last + 1);
		// przesunięcie kilometrażu: przed pierwszą stacją co najmniej 260 m toru (resztę dopełnia prosty odcinek)
		// wielokrotność kroku krzywizny – krzywizna i obiekty trafiają w te same miejsca toru
		const shift = Math.ceil(Math.max(0, 260 - route[0].s) / STEP) * STEP;
		const endS = Math.min(total, route[route.length - 1].s + 60);
		const S = (s) => Math.round(s + shift);

		// semafory odjazdowe stacji (nazwa z OSM): pierwszy wyjazdowy za miejscem zatrzymania
		const fn = (t) => t['railway:signal:combined:function'] || t['railway:signal:main:function'] || '';
		const isMain = (t) => !!(t['railway:signal:combined'] || t['railway:signal:main']);
		for (const st of route) {
			const ex = sigs.find((q) => isMain(q.tags) && fn(q.tags) === 'exit' && q.s > st.s - 20 && q.s < st.s + 400);
			if (ex && ex.tags.ref) st.exit = ex.tags.ref;
		}
		const zones = route.map((st) => [st.s - platformLength - 150, st.s + 160]);
		const inZone = (s) => zones.some(([a, b]) => s > a && s < b);

		// semafory na szlaku: wjazdowe, odstępowe, pośrednie (poza obszarem peronów), co najmniej 350 m od siebie
		const signals = [];
		for (const q of sigs) {
			if (!isMain(q.tags) || q.s < route[0].s + 120 || q.s > route[route.length - 1].s - 150 || inZone(q.s)) continue;
			const f = fn(q.tags);
			if (f === 'exit') continue;
			if (signals.length && q.s - signals[signals.length - 1].s < 350) continue;
			signals.push({ s: q.s, name: q.tags.ref || '', kind: f === 'entry' || f === 'intermediate' ? f : 'block' });
		}

		// tam, gdzie OSM ma mało semaforów (przerwa > 3 km), uzupełniamy odstępowe co ok. 2 km (bez prawdziwej nazwy)
		const anchors = route.slice(0, -1).map((st) => st.s + 50).concat(signals.map((q) => q.s), [route[route.length - 1].s - platformLength - 150]).sort((a, b) => a - b);
		let added = 0;
		for (let k = 0; k < anchors.length - 1; k++) {
			const gap = anchors[k + 1] - anchors[k];
			if (gap <= 3000) continue;
			const m = Math.round(gap / 2000);
			for (let q = 1; q < m; q++) {
				const s0 = anchors[k] + (gap * q) / m;
				if (inZone(s0)) continue;
				signals.push({ s: s0, name: '', kind: 'block' });
				added++;
			}
		}
		signals.sort((a, b) => a.s - b.s);
		if (added) log(`Uzupełniono ${added} semaforów odstępowych (mało danych o sygnalizacji w OSM).`);

		// ---------- dane PKP PLK (Regulamin sieci): kilometraż linii, prędkości, posterunki, perony ----------
		/* Kilometraż linii z posterunków (stacje przebiegu dopasowane po nazwie, co najmniej dwie) – liniowo między nimi.
		   Prędkości: wykaz 2.1 dla toru przebiegu (railway:track_ref z OSM: nieparzysty – N, parzysty – P; bez numeru –
		   mniejsza z obu torów), kolumna pociągów pasażerskich (EZT); bez danych PLK – maxspeed z OSM. */
		const normName = (x) => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
		let plk = null, kmAt = null, plkLine = null, plkV = null;
		if (opts.plk) {
			try {
				const data = await opts.plk(log);
				const cnt = new Map();
				for (let s2 = 0; s2 < endS; s2 += 100) for (const r of refs(edgeAt(s2).w.tags)) cnt.set(r, (cnt.get(r) || 0) + 1);
				plkLine = opts.line ? String(opts.line) : ([...cnt.entries()].sort((a, b) => b[1] - a[1])[0] || [null])[0];
				const posts = data.posts.filter((q) => q.line === plkLine);
				const anchors = [];
				for (const st of route) {
					const q = posts.find((x) => normName(x.name) === normName(st.name));
					if (q) anchors.push([st.s, q.km]);
				}
				anchors.sort((a, b) => a[0] - b[0]);
				if (anchors.length >= 2) {
					kmAt = (s2) => {
						let k = 0;
						while (k < anchors.length - 2 && s2 > anchors[k + 1][0]) k++;
						const [sa, ka] = anchors[k], [sb, kb] = anchors[k + 1];
						return ka + ((kb - ka) * (s2 - sa)) / (sb - sa || 1);
					};
					plk = data;
					const sp = data.speeds.filter((r) => r.line === plkLine);
					const trackOf = (s2) => {
						const tr = parseInt(edgeAt(Math.max(0, Math.min(total, s2))).w.tags['railway:track_ref'], 10);
						return Number.isFinite(tr) ? (tr % 2 ? 'N' : 'P') : null;
					};
					plkV = (s2) => {
						const km = kmAt(s2);
						const rows = sp.filter((r) => km >= Math.min(r.km0, r.km1) - 0.001 && km <= Math.max(r.km0, r.km1) + 0.001 && (r.v[0] || r.v[1]) > 0);
						if (!rows.length) return null;
						const tr = trackOf(s2), mine = tr ? rows.filter((r) => r.track === tr) : [];
						return Math.min(...(mine.length ? mine : rows).map((r) => r.v[0] || r.v[1]));
					};
					log(`PKP PLK: linia ${plkLine}, kilometraż ze stacji ${anchors.map(([s2, km]) => `${route.find((x) => x.s === s2).name} km ${km}`).join(', ')}.`);
					// posterunki z peronem między krańcami przebiegu, których nie ma w danych OSM
					const kA = kmAt(route[0].s), kB = kmAt(route[route.length - 1].s), lo = Math.min(kA, kB), hi = Math.max(kA, kB);
					const sOfKm = (km) => route[0].s + ((km - kA) / (kB - kA || 1)) * (route[route.length - 1].s - route[0].s);
					for (const q of posts) {
						if (!q.platform || q.km <= lo + 0.3 || q.km >= hi - 0.3 || route.some((st) => normName(st.name) === normName(q.name))) continue;
						issue('plk-stop', sOfKm(q.km), 'warn', `PKP PLK: ${q.kind === 'PO' ? 'przystanek' : 'stacja'} „${q.name}” (km ${q.km} linii ${plkLine}) z peronem – brak w danych OSM.`, `Dodaj: "stations": { "add": [{ "name": "${q.name}", "pos": ${S(sOfKm(q.km))}${q.kind === 'PO' ? ', "type": "halt"' : ''} }] }.`);
					}
				} else log(`PKP PLK: za mało stacji przebiegu w wykazie posterunków linii ${plkLine || '?'} – bez danych PLK.`);
			} catch (e) {
				log(`PKP PLK niedostępne (${e.message}) – prędkości z OSM.`);
			}
		}

		// ---------- ograniczenia prędkości ----------
		const lim = [];
		let lastV = null, plkN = 0, osmN = 0;
		for (let s = 0; s < endS; s += STEP) {
			const vp = plkV ? plkV(s) : null;
			if (vp) plkN++; else osmN++;
			const v = vp || speedOf(edgeAt(s).w.tags) || lastV || 100;
			lastV = v;
			if (!lim.length || lim[lim.length - 1][1] !== v) lim.push([s, v]);
		}
		// krótkie odcinki (< 150 m) łączymy z wolniejszym sąsiadem
		for (let k = 1; k < lim.length; k++) {
			const len = (k + 1 < lim.length ? lim[k + 1][0] : endS) - lim[k][0];
			if (len < 150) { lim[k][1] = Math.min(lim[k][1], lim[k - 1][1]); }
		}
		const limits = [];
		for (const [s, v] of lim) if (!limits.length || limits[limits.length - 1][1] !== v) limits.push([S(s), v]);
		if (plkV) log(`Prędkości: ${Math.round((100 * plkN) / (plkN + osmN))}% przebiegu z wykazu PKP PLK, reszta z OSM.`);
		// dojazd do stacji końcowej (kozioł oporowy za peronem)
		const lastS = S(route[route.length - 1].s);
		const vEnd = Math.min(40, limits.filter(([s]) => s <= lastS - 300).pop()?.[1] || 40);
		while (limits.length && limits[limits.length - 1][0] >= lastS - 300) limits.pop();
		limits.push([lastS - 300, vEnd]);
		if (limits[0][0] > 0) limits.unshift([0, limits[0][1]]);
		limits[0][0] = 0;

		// ---------- otoczenie: budynki, drogi, wody, zagospodarowanie ----------
		let env = null, envData = null;
		if (opts.environment) {
			const poly = [];
			for (let s = 0; s <= endS; s += 250) { const p = pts[Math.min(pts.length - 1, Math.round(s / STEP))]; poly.push(P.ll(p[0], p[1])); }
			envData = await opts.environment(poly, log);
			/* BDOT10k (GUGiK): budynki, jezdnie, zagospodarowanie, lasy, wody – zamiast obiektów tych rodzajów z OSM, gdy
			   paczki wszystkich powiatów wzdłuż trasy są dostępne (tory, perony, stacje, rozjazdy – z OSM) */
			if (opts.bdot && envData) {
				try {
					const routeLL = [];
					for (let s2 = 0; s2 <= endS; s2 += 50) { const q = pts[Math.min(n - 1, Math.round(s2 / STEP))]; routeLL.push(P.ll(q[0], q[1])); }
					const bd = await opts.bdot(routeLL, log);
					if (bd && bd.complete && bd.elements.length) {
						const LU = /^(forest|residential|commercial|retail|industrial|grass|meadow|farmland|allotments|orchard|plant_nursery|brownfield|landfill|quarry|reservoir|basin|greenfield|vineyard|farmyard)$/;
						const NAT = /^(wood|water|scrub|grassland|heath|wetland)$/;
						const replaced = (t) => !t.railway && !t.public_transport && (t.building || (t.highway && t.area !== 'yes') || t.waterway || t.water || LU.test(t.landuse || '') || NAT.test(t.natural || ''));
						// zadaszenia (dachy peronów, wiaty) zostają z OSM – BDOT ich nie ma; tylko do warstwy zadaszeń (rf), nie jako budynki
						const roofOnly = (t) => t.building === 'roof' || t.man_made === 'canopy' || (t.building && t.amenity === 'shelter');
						// budynki OSM z usługą lub nazwą zastępowane przez BDOT – zostają jako punkt (środek obrysu) do rodzaju i nazwy
						const pois = [];
						for (const e of envData.elements) {
							const t = e.tags;
							if (e.type !== 'way' || !t || !t.building || !e.geometry || !(t.amenity || t.shop || t.office || t.healthcare || t.tourism || t.name)) continue;
							const g = e.geometry.filter(Boolean);
							if (!g.length) continue;
							const tg = Object.assign({}, t);
							if (!(tg.amenity || tg.shop || tg.office || tg.healthcare || tg.tourism)) tg.amenity = 'named';
							pois.push({ type: 'node', id: -e.id, lat: g.reduce((a, q) => a + q.lat, 0) / g.length, lon: g.reduce((a, q) => a + q.lon, 0) / g.length, tags: tg });
						}
						const keep = envData.elements
							.filter((e) => !(e.type === 'way' && e.tags && replaced(e.tags) && !roofOnly(e.tags))) // węzły (przejścia, rozjazdy) zostają
							.map((e) => (e.type === 'way' && e.tags && roofOnly(e.tags) ? Object.assign({}, e, { tags: Object.assign({}, e.tags, { _roofOnly: '1' }) }) : e))
							.concat(pois);
						log(`Otoczenie: BDOT10k (${bd.elements.length} obiektów) zamiast ${envData.elements.length - keep.length} obiektów OSM tych samych rodzajów.`);
						envData = Object.assign({}, envData, { elements: keep.concat(bd.elements) });
					} else if (bd) log('BDOT10k niepełny dla trasy – otoczenie z OSM.');
				} catch (e) {
					log(`BDOT10k niedostępny (${e.message}) – otoczenie z OSM.`);
				}
			}
			// warstwa (layer) naszego toru w miejscu s (z przesunięciem kilometrażu) – co jest nad, a co pod torem
			const layerAt = (s2) => Number(edgeAt(Math.max(0, Math.min(total, s2 - shift))).w.tags.layer) || 0;
			const swTags = new Map();
			for (const [id, nd] of tagged) {
				if (nd.tags.railway !== 'switch' && nd.tags.railway !== 'railway_crossing') continue;
				const q = pos.get(id);
				if (q) swTags.set(Math.round(q[0] * 10) + ',' + Math.round(q[1] * 10), { t: nd.tags, id });
			}
			if (envData) env = buildEnvironment(envData, { P, pts, shift, endS, layerAt, stationsS: route.map((st, i) => [S(st.s), st.type === 'halt' && i > 0 && i < route.length - 1]), platformLength, log, debug: opts.debug, pathWays: new Set(path.edges.map((e) => e.w.id)), rails: ways, swTags, stationPts: stationNodes.filter((n) => n.tags.railway === 'station').map((n) => P.xy(n.lat, n.lon).concat([n.tags.name])) });
		}

		// ---------- uwagi dla poprawek (plik poprawek: fixes) ----------
		const issues = [];
		const fmtKm = (s2) => (s2 / 1000).toFixed(2).replace('.', ',');
		const issue = (k, s1, lvl, m, fix, s2, osm) => {
			const o = { id: `${k}@${Math.round(S(s1))}`, k, pos: S(s1), lvl, m, fix };
			if (s2 !== undefined && s2 !== null) o.to = S(s2);
			if (osm) o.osm = osm; // obiekt w OpenStreetMap (np. "way/123") – do sprawdzenia i poprawienia danych
			issues.push(o);
		};

		// ---------- mosty, wiadukty, tunele, przejazdy ----------
		const ranges = (key) => {
			const out = [];
			for (let s = 0; s < endS; s += STEP) {
				const t = edgeAt(s).w.tags;
				if (t[key] && t[key] !== 'no') {
					const r = out[out.length - 1];
					if (r && s - r[1] <= 30) r[1] = s + STEP; else out.push([s, s + STEP]);
				}
			}
			return out;
		};
		const waterSegs = [];
		for (const w of waters) for (let k = 0; k < w.geometry.length - 1; k++) waterSegs.push([P.xy(w.geometry[k].lat, w.geometry[k].lon), P.xy(w.geometry[k + 1].lat, w.geometry[k + 1].lon)]);
		const overWater = (a, b) => {
			for (let k = Math.floor(a / STEP); k < Math.min(pts.length - 1, Math.ceil(b / STEP)); k++) {
				for (const [p3, p4] of waterSegs) if (segIntersect(pts[k], pts[k + 1], p3, p4)) return true;
			}
			return false;
		};
		/* Co przecina przebieg: drogi, cieki i inne tory (z korytarza i otoczenia) – przecięcia odcinków w układzie
		   mapy z prawdziwym torem (łamana z mapy). Pod mostem rozpoznajemy, nad czym prowadzi; bez mostu – czy
		   w danych go nie brakuje (droga lub tor w tunelu pod torem, rzeka bez mostu, droga w poziomie bez przejazdu). */
		const pathNodeSet = new Set(path.nodes);
		const GCX = 50, rawGrid = new Map();
		rawPts.forEach((p, k) => {
			const key = Math.floor(p[0] / GCX) * 100003 + Math.floor(p[1] / GCX);
			if (!rawGrid.has(key)) rawGrid.set(key, []);
			rawGrid.get(key).push(k);
		});
		const crossS = (geom) => {
			const out = [];
			const g2 = geom.filter(Boolean).map((q) => P.xy(q.lat, q.lon));
			for (let i = 0; i + 1 < g2.length; i++) {
				const a = g2[i], b = g2[i + 1], L = dist2(a, b), m = Math.max(1, Math.ceil(L / 20));
				for (let j2 = 0; j2 < m; j2++) {
					const p1 = [a[0] + ((b[0] - a[0]) * j2) / m, a[1] + ((b[1] - a[1]) * j2) / m];
					const p2 = [a[0] + ((b[0] - a[0]) * (j2 + 1)) / m, a[1] + ((b[1] - a[1]) * (j2 + 1)) / m];
					const cx = Math.floor((p1[0] + p2[0]) / 2 / GCX), cy = Math.floor((p1[1] + p2[1]) / 2 / GCX);
					for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
						for (const k of rawGrid.get((cx + u) * 100003 + cy + v) || []) {
							if (k + 1 >= rawPts.length || !segIntersect(rawPts[k], rawPts[k + 1], p1, p2)) continue;
							const s2 = k * STEP + STEP / 2;
							if (!out.some((x) => Math.abs(x - s2) < 15)) out.push(s2);
						}
					}
				}
			}
			return out;
		};
		const yes = (v) => v && v !== 'no';
		// przejazdy w poziomie: węzły level_crossing (również na drugim torze) rzutowane na przebieg
		const lcS = [];
		for (const e of els) {
			if (e.type !== 'node' || !e.tags || e.tags.railway !== 'level_crossing') continue;
			// węzły z korytarza bywają bez współrzędnych – położenie z grafu torów
			const q = e.lat !== undefined ? P.xy(e.lat, e.lon) : pos.get(e.id);
			if (!q) continue;
			let bk = -1, bd = 25;
			for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (const k of rawGrid.get((Math.floor(q[0] / GCX) + u) * 100003 + Math.floor(q[1] / GCX) + v) || []) { const d0 = dist2(q, rawPts[k]); if (d0 < bd) { bd = d0; bk = k; } }
			if (bk >= 0) lcS.push(bk * STEP);
		}
		for (const e of (envData && envData.elements) || []) {
			if (e.type !== 'node' || !e.tags || e.tags.railway !== 'level_crossing' || e.lat === undefined) continue;
			const q = P.xy(e.lat, e.lon);
			let bk = -1, bd = 25;
			for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (const k of rawGrid.get((Math.floor(q[0] / GCX) + u) * 100003 + Math.floor(q[1] / GCX) + v) || []) { const d0 = dist2(q, rawPts[k]); if (d0 < bd) { bd = d0; bk = k; } }
			if (bk >= 0) lcS.push(bk * STEP);
		}
		const nearLC = (s2) => lcS.some((x) => Math.abs(x - s2) < 30);
		// tor obok naszego (do 25 m od miejsca przecięcia) na moście – linia przechodzi tu mostem
		const bridgeRails = ways.filter((w) => yes(w.tags.bridge) || Number(w.tags.layer) > 0).map((w) => w.geometry.filter(Boolean).map((q) => P.xy(q.lat, q.lon)));
		const railBridgeNear = (s2) => {
			const c = rawPts[Math.min(rawPts.length - 1, Math.round(s2 / STEP))];
			return bridgeRails.some((g) => g.some((q, i) => (i && segDist(c, g[i - 1], q) < 25)));
		};
		if (opts.debug) log(`[debug] przejazdy przy przebiegu: ${lcS.map((x) => Math.round(x)).join(', ')}`);
		const crossings2 = []; // { s, kind: road|water|rail, over, under, culvert, name, small, node }
		const seenW = new Set();
		const pathXY = new Set(path.nodes.map((id) => { const q = pos.get(id); return Math.round(q[0] * 2) + ',' + Math.round(q[1] * 2); }));
		const consider = (e, kind) => {
			if (seenW.has(e.id) || !e.geometry) return;
			seenW.add(e.id);
			const t = e.tags || {};
			const layer = Number(t.layer) || 0;
			const node = e.nodes ? e.nodes.some((id) => pathNodeSet.has(id)) : e.geometry.some((q) => {
				if (!q) return false;
				const xy = P.xy(q.lat, q.lon);
				return pathXY.has(Math.round(xy[0] * 2) + ',' + Math.round(xy[1] * 2));
			});
			for (const s2 of crossS(e.geometry)) {
				if (s2 < 0 || s2 > endS) continue;
				const our = Number(edgeAt(s2).w.tags.layer) || 0; // nasz tor w wykopie (−1) / na nasypie z mostem (1)
				crossings2.push({
					s: s2, kind, node, name: t.name || t.ref || '', osm: 'way/' + e.id,
					over: yes(t.bridge) || layer > Math.max(0, our) || (layer >= 0 && our < 0),
					under: yes(t.tunnel) || layer < Math.min(0, our) || t.covered === 'yes',
					culvert: t.tunnel === 'culvert' || (kind === 'water' && !/^(river|canal)$/.test(t.waterway || '') && !(num(t.width) > 6)),
					small: kind === 'road' && /^(service|living_street|pedestrian)$/.test(String(t.highway || '').replace(/_link$/, '')),
					maxh: !!t.maxheight, // ograniczenie wysokości – droga przechodzi pod czymś
				});
			}
		};
		for (const w of waters) consider(w, 'water');
		for (const w of ways) if (!pathWays0.has(w.id)) consider(w, 'rail');
		for (const e of (envData && envData.elements) || []) {
			if (e.type !== 'way' || !e.tags || !e.geometry) continue;
			const t = e.tags;
			if (t.railway === 'platform' || t.public_transport === 'platform' || t.area === 'yes') continue;
			if (t.highway && roadType(t.highway) >= 0) consider(e, 'road');
			else if (t.waterway && /^(river|canal|stream|drain|ditch)$/.test(t.waterway)) consider(e, 'water');
			else if (t.railway === 'rail' && !pathWays0.has(e.id)) consider(e, 'rail');
		}
		crossings2.sort((a, b) => a.s - b.s);
		const UNDER = { water: 'nad wodą', road: 'nad drogą', rail: 'nad torami' };
		const bridgeRanges = [];
		for (const [a, b] of ranges('bridge')) {
			if (b - a < 12 || b < 0 || a > endS) continue;
			const prevB = bridgeRanges[bridgeRanges.length - 1];
			if (prevB && a - prevB[1] < 40) prevB[1] = b; // przęsła jedno przy drugim – jeden obiekt
			else bridgeRanges.push([a, b]);
		}
		const bridges = [];
		const ourBridge = (s2) => bridgeRanges.some(([a, b]) => s2 > a - 15 && s2 < b + 15);
		for (const range of bridgeRanges) {
			const under = crossings2.filter((c) => c.s > range[0] - 10 && c.s < range[1] + 10 && !c.over);
			for (const c of under) { range[0] = Math.min(range[0], c.s - 8); range[1] = Math.max(range[1], c.s + 8); }
			const [a, b] = range;
			const kinds = new Set(under.map((c) => c.kind));
			const water = kinds.has('water') || overWater(a, b);
			const over = water ? 'water' : kinds.has('rail') ? 'rail' : kinds.has('road') ? 'road' : '?';
			bridges.push({ from: S(a), to: S(b), kind: water ? 'water' : 'viaduct', over });
			if (over === '?') issue('bridge', a, 'info', `Most ${Math.round(b - a)} m bez rozpoznanego obiektu pod spodem (dolina, przepust albo brak danych) – narysowany jako wiadukt.`, `Obejrzyj miejsce. Most nad wodą: "bridges": [{ "at": ${S((a + b) / 2)}, "kind": "water" }]; niepotrzebny: [{ "at": ${S((a + b) / 2)}, "remove": true }].`, b);
		}
		// brakujące mosty: pod torem droga lub tor w tunelu albo rzeka – w danych bez mostu
		for (const c of crossings2) {
			if (ourBridge(c.s) || c.over) continue;
			const what = c.kind === 'water' ? 'ciek' : c.kind === 'road' ? 'droga' : 'tor';
			const nm = c.name ? ` (${c.name})` : '';
			if ((c.kind === 'water' && !c.culvert) || (c.kind !== 'water' && c.under)) {
				const half = c.kind === 'water' ? 9 : c.kind === 'rail' ? 8 : 7;
				bridges.push({ from: S(c.s - half), to: S(c.s + half), kind: c.kind === 'water' ? 'water' : 'viaduct', over: c.kind, auto: true });
				issue('bridge-add', c.s, 'info', `Dodano ${c.kind === 'water' ? 'most' : 'wiadukt'}: ${what}${nm} pod torem, w danych tor nie ma mostu.`, `Jeśli zbędny: "bridges": [{ "at": ${S(c.s)}, "remove": true }]; inna długość: [{ "at": ${S(c.s)}, "from": …, "to": … }].`, null, c.osm);
				bridgeRanges.push([c.s - half, c.s + half]);
			} else if (c.kind === 'road' && c.node && !c.small && !nearLC(c.s)) {
				// droga ma wspólny punkt z torem, ale nie ma tam przejazdu: z ograniczeniem wysokości – przejście pod torem
				if (c.maxh) {
					bridges.push({ from: S(c.s - 7), to: S(c.s + 7), kind: 'viaduct', over: 'road', auto: true });
					bridgeRanges.push([c.s - 7, c.s + 7]);
					issue('cross', c.s, 'info', `Droga${nm} ma w danych punkt wspólny z torem, bez przejazdu, z ograniczeniem wysokości – dodano wiadukt (droga pod torem).`, `Jeśli to przejazd w poziomie: "bridges": [{ "at": ${S(c.s)}, "remove": true }], "crossings": { "add": [${S(c.s)}] }; jeśli dobrze: "ignore": ["cross@${Math.round(S(c.s))}"].`, null, c.osm);
				} else issue('cross', c.s, 'warn', `Droga${nm} ma w danych punkt wspólny z torem, ale bez oznaczenia przejazdu (railway=level_crossing).`, `Przejazd: "crossings": { "add": [${S(c.s)}] }; wiadukt (droga pod torem): "bridges": [{ "from": ${S(c.s - 7)}, "to": ${S(c.s + 7)}, "kind": "viaduct" }]; najlepiej uzupełnić dane OSM i wygenerować ponownie.`, null, c.osm);
			} else if ((c.kind === 'road' && !c.node && !c.small && !nearLC(c.s)) || (c.kind === 'rail' && !c.node)) {
				// bez przejazdu i bez mostu w danych: skrzyżowanie bezkolizyjne – przyjmujemy, że nasz tor biegnie górą
				// (droga z ograniczeniem wysokości – na pewno); w grze wiadukt, w raporcie uwaga z możliwościami
				const half = c.kind === 'rail' ? 8 : 7, besideB = railBridgeNear(c.s), sure = (c.kind === 'road' && c.maxh) || besideB;
				bridges.push({ from: S(c.s - half), to: S(c.s + half), kind: 'viaduct', over: c.kind, auto: true });
				bridgeRanges.push([c.s - half, c.s + half]);
				issue('cross', c.s, sure ? 'info' : 'warn', `${c.kind === 'road' ? 'Droga' : 'Inny tor'}${nm} przecina tor bez ${c.kind === 'road' ? 'przejazdu' : 'połączenia'} i bez mostu w danych – dodano wiadukt (${what} pod torem${besideB ? ', tory obok są w tym miejscu na moście' : sure ? ', droga ma ograniczenie wysokości' : ', przyjęto'}).`, `Jeśli ${what} biegnie nad torem: "bridges": [{ "at": ${S(c.s)}, "remove": true }] i popraw dane OSM (bridge=yes, layer=1 na ${c.kind === 'road' ? 'drodze' : 'torze'}), potem wygeneruj ponownie; ${c.kind === 'road' ? `przejazd w poziomie: "crossings": { "add": [${S(c.s)}] } i usuń wiadukt jak wyżej; ` : ''}jeśli dobrze: "ignore": ["cross@${Math.round(S(c.s))}"].`, null, c.osm);
			}
		}
		bridges.sort((a, b) => a.from - b.from);
		for (let k = 1; k < bridges.length; k++) {
			if (bridges[k].from <= bridges[k - 1].to + 5) {
				bridges[k - 1].to = Math.max(bridges[k - 1].to, bridges[k].to);
				if (bridges[k].kind === 'water') bridges[k - 1].kind = 'water';
				bridges.splice(k--, 1);
			}
		}
		const tunnels = [];
		for (const [a, b] of ranges('tunnel')) {
			if (b - a < 80 || inZone(a) || inZone(b)) continue;
			tunnels.push({ from: S(a), to: S(b) });
		}
		const crossings = [];
		for (const [id, s] of nodeS) {
			const t = tagged.get(id);
			// przejazd także w obrębie stacji – byle nie na samym peronie
			const onPlatform = route.some((st) => s > st.s - platformLength - 20 && s < st.s + 30);
			if (t && t.tags.railway === 'level_crossing' && !onPlatform && s > route[0].s + 200 && s < route[route.length - 1].s - 200) crossings.push(S(s));
		}
		crossings.sort((a, b) => a - b);


		// ---------- profil wysokości ----------
		const grades = [[0, 0]];
		// punkt (lat, lon) w miejscu (s, d) trasy (s – kilometraż przebiegu bez przesunięcia, d – w prawo od osi)
		const llAt = (s2, d2) => {
			const f = Math.max(0, Math.min(n - 1.001, s2 / STEP)), k = Math.floor(f), t = f - k;
			const a = pts[k], bb = pts[k + 1], L = dist2(a, bb) || 1, ux = (bb[0] - a[0]) / L, uy = (bb[1] - a[1]) / L;
			return P.ll(a[0] + (bb[0] - a[0]) * t + uy * d2, a[1] + (bb[1] - a[1]) * t - ux * d2);
		};
		// NMT GUGiK: niweleta z pomiaru (co 10 m na osi toru), na mostach i w tunelach – prosto między przyczółkami
		let lidar = false, rail0 = null, railAbs = null;
		if (opts.lidar) {
			try {
				log('Pobieram wysokości toru z NMT (GUGiK, skaning laserowy)…');
				const LAT = [-1.2, 0, 1.2], ll = [];
				for (let k = 0; k < n; k++) for (const d2 of LAT) ll.push(llAt(k * STEP, d2));
				const hAll = await opts.lidar(ll, log);
				const g = [];
				for (let k = 0; k < n; k++) {
					const v = [hAll[k * 3], hAll[k * 3 + 1], hAll[k * 3 + 2]].filter(Number.isFinite).sort((x, y) => x - y);
					g.push(v.length ? v[v.length >> 1] : NaN);
				}
				if (g.filter(Number.isFinite).length < 0.8 * n) throw new Error('za mało punktów (trasa poza Polską?)');
				// luki i obiekty: liniowo między pewnymi punktami
				const fixed = g.map(Number.isFinite);
				for (const o of bridges.concat(tunnels)) {
					for (let k = Math.max(0, Math.floor((o.from - shift - 15) / STEP)); k <= Math.min(n - 1, Math.ceil((o.to - shift + 15) / STEP)); k++) fixed[k] = false;
				}
				/* śledzenie niwelety: trend z ostatnich 100 m pewnych punktów (pochylenie do ±15‰); punkt ponad 2 m poniżej
				   przewidywania – most (NMT pokazuje dno), ponad 2 m powyżej – obiekt nad torem zostawiony w NMT (pomost
				   wiaduktu); odrzucamy do 800 m, dalej pomiar przyjmowany jako nowy poziom */
				const rel = [], dips = [];
				let run = null;
				for (let k = 0; k < n; k++) {
					if (!fixed[k]) continue;
					if (rel.length >= 3) {
						let use = [];
						for (let q = rel.length - 1; q >= 0 && k - rel[q] <= 10; q--) use.push(rel[q]);
						if (use.length < 2) use = rel.slice(-2);
						let mx = 0, my = 0;
						for (const q of use) { mx += q; my += g[q]; }
						mx /= use.length;
						my /= use.length;
						let sxx = 0, sxy = 0;
						for (const q of use) { sxx += (q - mx) ** 2; sxy += (q - mx) * (g[q] - my); }
						const slope = Math.max(-0.15, Math.min(0.15, sxx > 0 ? sxy / sxx : 0));
						const r = g[k] - (my + slope * (k - mx));
						if ((r < -2 || r > 2) && (!run || k - run.k0 < 80)) {
							fixed[k] = false;
							if (!run) run = { k0: k, down: r < 0, depth: 0 };
							run.depth = Math.max(run.depth, -r);
							continue;
						}
					}
					if (run && run.down && k - run.k0 >= 2) dips.push([run.k0, k - 1, run.depth]);
					run = null;
					rel.push(k);
				}
				// mosty z pomiaru: wydłużenie mostu z danych albo nowy most (w danych go brak)
				for (const [k0, k1, depth] of dips) {
					const a = k0 * STEP - 5, b = k1 * STEP + 5;
					const ov = bridges.filter((o) => o.to - shift > a - 10 && o.from - shift < b + 10);
					for (const o of ov) { o.from = Math.min(o.from, S(a)); o.to = Math.max(o.to, S(b)); o.nmt = 1; }
					if (!ov.length) bridges.push({ from: S(a), to: S(b), kind: 'viaduct', over: '?', nmt: 1 });
					issue('bridge-nmt', a, 'info', `Pomiar NMT: teren pod torem do ${depth.toFixed(1)} m niżej na ${Math.round(b - a)} m – ${ov.length ? 'most z danych wydłużony' : 'dodano most (w danych go brak)'}.`, `Jeśli to nie most: "bridges": [{ "at": ${S((a + b) / 2)}, "remove": true }]; inna długość: [{ "at": ${S((a + b) / 2)}, "from": …, "to": … }].`, b);
				}
				if (dips.length) {
					bridges.sort((x, y) => x.from - y.from);
					for (let k = 1; k < bridges.length; k++) {
						if (bridges[k].from <= bridges[k - 1].to + 5) {
							bridges[k - 1].to = Math.max(bridges[k - 1].to, bridges[k].to);
							if (bridges[k].kind === 'water') bridges[k - 1].kind = 'water';
							if (bridges[k - 1].over === '?') bridges[k - 1].over = bridges[k].over;
							bridges.splice(k--, 1);
						}
					}
					log(`Mosty z pomiaru NMT: ${dips.length} (wydłużone albo dodane).`);
				}
				let last = -1;
				for (let k = 0; k <= n; k++) {
					if (k < n && !fixed[k]) continue;
					if (last < 0 && k < n) for (let q = 0; q < k; q++) g[q] = g[k];
					else if (k === n) for (let q = last + 1; q < n; q++) g[q] = g[last];
					else for (let q = last + 1; q < k; q++) g[q] = g[last] + ((g[k] - g[last]) * (q - last)) / (k - last);
					last = k;
				}
				// zagłębienia do 80 m (mosty, przepusty), mediana z 5 (pojedyncze zakłócenia), średnia ±30 m;
				// główka szyny 0,3 m nad powierzchnią podsypki
				const gc = closeDips(g, g.map((_, i) => i * STEP), 25);
				const med = gc.map((_, i) => { const w = gc.slice(Math.max(0, i - 2), i + 3).sort((x, y) => x - y); return w[w.length >> 1]; });
				const hs = smooth(med, 3).map((v) => v + 0.3);
				/* krótkie garby i dołki ponad 15‰ (np. przy wiaduktach i przepustach nierozpoznanych jako most – NMT ma
				   tam skarpy albo teren pod obiektem; w danych tor bez mostu): fragment zastąpiony prostą między punktami
				   przed nim i za nim, gdy jej pochylenie mieści się w 15‰ (obszar poszerzany do 1,5 km); długie prawdziwe
				   wzniesienia (prosta też stroma) zostają */
				{
					const LIM = 0.015, w = Math.max(1, Math.round(50 / STEP)), MAXW = Math.round(1500 / STEP);
					const steep = (i) => i + w < n && Math.abs(hs[i + w] - hs[i]) / (w * STEP) > LIM + 1e-4;
					let fixedN = 0;
					for (let i = 0; i + w < n; i++) {
						if (!steep(i)) continue;
						let k1 = i;
						while (k1 + w < n && steep(k1)) k1++;
						let a = i, b = Math.min(n - 1, k1 + w), ok = false;
						for (let m = Math.round(100 / STEP); b - a <= MAXW; m += Math.round(50 / STEP)) {
							a = Math.max(0, i - m);
							b = Math.min(n - 1, k1 + w + m);
							if (Math.abs(hs[b] - hs[a]) / ((b - a) * STEP) <= LIM * 0.9) { ok = true; break; }
							if (a === 0 && b === n - 1) break;
						}
						if (ok) {
							for (let q = a + 1; q < b; q++) hs[q] = hs[a] + ((hs[b] - hs[a]) * (q - a)) / (b - a);
							fixedN++;
							i = b;
						} else i = k1;
					}
					if (fixedN) log(`Niweleta: wygładzone krótkie garby i dołki ponad 15‰: ${fixedN}.`);
				}
				// pochylenia co 50 m (0,1‰) z korektą narastającą – wysokość w grze zgodna z pomiarem
				grades.length = 0;
				if (shift > 0) grades.push([0, 0]);
				let cur = hs[0];
				for (let s2 = 0; s2 < endS; s2 += 50) {
					const target = hs[Math.min(n - 1, Math.round((s2 + 50) / STEP))];
					const gr = Math.max(-40, Math.min(40, Math.round(((target - cur) / 50) * 10000) / 10));
					cur += (gr * 50) / 1000;
					if (!grades.length || grades[grades.length - 1][1] !== gr) grades.push([S(s2), gr]);
				}
				grades[0][0] = 0;
				rail0 = Math.round(hs[0] * 100) / 100;
				railAbs = (s2) => hs[Math.max(0, Math.min(n - 1, Math.round(s2 / STEP)))];
				opts.heights = { first: Math.round(hs[0]), last: Math.round(hs[n - 1]), min: Math.round(Math.min(...hs)), max: Math.round(Math.max(...hs)) };
				lidar = true;
				log(`Niweleta z NMT: ${opts.heights.first}–${opts.heights.last} m n.p.m. (od ${opts.heights.min} do ${opts.heights.max}), ${grades.length} zmian pochylenia.`);
			} catch (e) {
				log(`NMT niedostępny (${e.message}) – profil i teren z Copernicus DEM.`);
			}
		}
		if (opts.elevation && !lidar) {
			log('Pobieram wysokości terenu (Copernicus DEM)…');
			const sampleS = [];
			for (let s = 0; s <= endS; s += 100) sampleS.push(s);
			// Copernicus DEM to model powierzchni (z koronami drzew i dachami): w każdym miejscu trzy punkty w poprzek
			// toru (−30, 0, +30 m) i najniższy z nich, potem mediana z 5 (pojedyncze skoki) i mocne wygładzenie
			const LAT = [-30, 0, 30];
			const ll = [];
			for (const s of sampleS) {
				const k = Math.min(pts.length - 2, Math.round(s / STEP));
				const a = pts[k], bb = pts[k + 1], L = dist2(a, bb) || 1, ux = (bb[0] - a[0]) / L, uy = (bb[1] - a[1]) / L;
				for (const d of LAT) ll.push(P.ll(a[0] + uy * d, a[1] - ux * d));
			}
			const hAll = await opts.elevation(ll, log);
			const h = sampleS.map((_, i) => Math.min(hAll[i * 3], hAll[i * 3 + 1], hAll[i * 3 + 2]));
			// korony drzew: w lesie (raster otoczenia, pas ±60 m) odejmujemy typową wysokość drzewostanu
			if (env) {
				const g = env.g, half = Math.round(60 / g.step), mid = Math.round(-g.d0 / g.step);
				h.forEach((_, i) => {
					const line = g.rows[Math.round(sampleS[i] / g.step)];
					if (!line) return;
					const kinds = [];
					const re = /([A-Z])(\d+)/g;
					let m;
					while ((m = re.exec(line))) for (let c = 0; c < Number(m[2]); c++) kinds.push(m[1].charCodeAt(0) - 65);
					let f = 0, n = 0;
					for (let c = mid - half; c <= mid + half; c++) { if (c < 0 || c >= kinds.length) continue; n++; if (kinds[c] === 1 || kinds[c] === 11 || kinds[c] === 12) f++; }
					if (n) h[i] -= 15 * (f / n);
				});
			}
			const med = h.map((_, i) => { const w = h.slice(Math.max(0, i - 2), i + 3).sort((x, y) => x - y); return w[w.length >> 1]; });
			// niweleta toru: wygładzenie ok. ±0,6 km, pochylenia co 400 m do ±10‰ (linie główne)
			const hs = smooth(smooth(med, 6), 4);
			const segs = [];
			for (let k = 0; k + 4 < hs.length; k += 4) segs.push([sampleS[k], Math.max(-10, Math.min(10, Math.round(((hs[k + 4] - hs[k]) / 400) * 1000)))]);
			grades.length = 0;
			for (const [s, g] of segs) if (!grades.length || grades[grades.length - 1][1] !== g) grades.push([S(s), g]);
			grades[0][0] = 0;
			opts.heights = { first: Math.round(h[0]), last: Math.round(h[h.length - 1]), min: Math.round(Math.min(...h)), max: Math.round(Math.max(...h)) };
		}

		// ---------- opis trasy w formacie gry ----------
		const kQ = [];
		for (let k = 0; k * STEP < endS; k++) kQ.push(Math.round((curv[Math.min(curv.length - 1, k)] || 0) * 1e5));
		const pre0 = new Array(Math.round(shift / STEP)).fill(0);
		const lengthKm = (route[route.length - 1].s - route[0].s) / 1000;
		// linia dwutorowa: na większości przebiegu obok biegnie tor równoległy
		let dbl = 0, cnt = 0;
		for (let k = 0; k + 1 < pts.length; k += 10) {
			const a = pts[k], b = pts[k + 1], L = dist2(a, b) || 1;
			const sd = sideTracks(a[0], a[1], (b[0] - a[0]) / L, (b[1] - a[1]) / L, edgeAt(k * STEP).w.id);
			cnt++;
			if (sd.left || sd.right) dbl++;
		}
		if (opts.debug) log(`[debug] tor równoległy obok przebiegu: ${dbl} / ${cnt} próbek (co 100 m)`);
		const meta = opts.meta || {};
		const def = {
			id: opts.id || 'osm-' + (opts.from + '-' + opts.to).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-'),
			name: meta.name || `Osobowy ${route[0].name} – ${route[route.length - 1].name}`,
			title: `${route[0].name} – ${route[route.length - 1].name}`,
			desc: meta.desc || `Prawdziwa linia${opts.line ? ' nr ' + opts.line : ''}: ${route.length} stacji i przystanków, ${lengthKm.toFixed(1)} km. Prędkości, semafory, łuki, wiadukty i profil jak w rzeczywistości.`,
			difficulty: meta.difficulty || (lengthKm > 30 ? 'trudny' : 'średni'),
			train: meta.train || 'ezt',
			startClock: meta.startClock || 7 * 3600 + 5 * 60,
			originWait: 45,
			dwell: 30,
			platformLength,
			real: true,
			// linia zelektryfikowana (sieć trakcyjna niezależnie od pociągu): większość przebiegu z electrified=contact_line / yes
			electrified: (() => {
				let el = 0, all = 0;
				for (const e of path.edges) { all += e.L; if (/^(contact_line|yes|rail)$/.test(e.w.tags.electrified || '')) el += e.L; }
				return all ? el / all > 0.5 : true;
			})(),
			/* odcinki przebiegu z siecią trakcyjną [od, do] (km trasy): sieć nad torem pociągu tylko tam (np. zelektryfikowany
			   wjazd do węzła na linii spalinowej); przerwy w danych do 300 m łączone, odcinki krótsze niż 300 m pomijane */
			wire: (() => {
				const out = [];
				let run = null, gap = 0;
				for (let s2 = 0; s2 <= endS; s2 += 25) {
					const on = /^(contact_line|yes|rail)$/.test(edgeAt(s2).w.tags.electrified || '');
					if (on) { if (!run) run = [s2, s2]; run[1] = s2; gap = 0; }
					else if (run && (gap += 25) > 300) { if (run[1] - run[0] >= 300) out.push(run); run = null; gap = 0; }
				}
				if (run && run[1] - run[0] >= 300) out.push(run);
				return out.map(([a, b]) => [S(a === 0 ? -400 : a), S(b >= endS - 25 ? endS + 400 : b)]);
			})(),
			line: opts.line || null,
			source: SOURCE,
			stations: route.map((st, i) => {
				const o = { name: st.name, pos: S(st.s) };
				if (st.type === 'halt' && i > 0 && i < route.length - 1) o.type = 'halt';
				if (st.exit) o.exit = st.exit;
				const pl = env && platformLayout(env, S(st.s), platformLength, st.type === 'halt');
				if (pl) o.platform = pl;
				return o;
			}),
			limits,
			grades,
			signals: signals.map((q) => ({ pos: S(q.s), name: q.name, kind: q.kind })),
			crossings,
			bridges,
			tunnels,
			curvature: { step: STEP, scale: 1e5, k: pre0.concat(kQ) },
			double: dbl > 0.5 * cnt,
		};
		// wysokość bezwzględna główki szyny w miejscu, gdzie wysokość w grze = 0 (dane z NMT)
		if (rail0 !== null) def.h0 = rail0;
		/* Perony stacji z pomiaru (NMPT 0,5 m – powierzchnia z peronami; NMT ich nie obejmuje): wycinek wokół peronu,
		   przekroje co 5 m po obu stronach toru (1–22 m od osi); peron – płaska płyta 0,35–1,25 m nad główką szyny
		   zaczynająca się 1,2–3,8 m od osi (wiaty i zadaszenia nad peronem – ponad 1,5 m wyżej – nie przerywają),
		   koniec – spadek o ponad 0,35 m; za nim podtorze innego toru – peron wyspowy. Strona – częściej wykryta;
		   krawędź, szerokość, wysokość – mediany (wysokość dopasowana do 0,35 / 0,55 / 0,76 / 0,96 m). */
		const measurePlatforms = async () => {
			const pl = (s2, d2) => { const q = llAt(s2 - shift, d2); return to1992(q.lat, q.lon); };
			const fetchBox = async (o) => {
				let n0 = Infinity, n1 = -Infinity, e0 = Infinity, e1 = -Infinity;
				for (let s2 = o.a; s2 <= o.b + 20; s2 += 20) for (const d2 of [-24, 0, 24]) {
					const [nn, ee] = pl(Math.min(o.b, s2), d2);
					n0 = Math.min(n0, nn); n1 = Math.max(n1, nn); e0 = Math.min(e0, ee); e1 = Math.max(e1, ee);
				}
				return nmptBox(e0 - 2, n0 - 2, e1 + 2, n1 + 2);
			};
			const sts = def.stations.map((o) => ({ o, a: o.pos - platformLength - 15, b: o.pos + 25 }));
			log(`Mierzę perony stacji z NMPT (${sts.length} wycinków 0,5 m)…`);
			let next = 0;
			const worker = async () => {
				while (next < sts.length) {
					const q = sts[next++];
					try { q.T = await fetchBox(q); } catch (e) { q.T = null; }
				}
			};
			await Promise.all([worker(), worker(), worker(), worker()]);
			for (const q of sts) {
				const T = q.T;
				if (!T) continue;
				const at = (s2, d2) => {
					const [nn, ee] = pl(s2, d2);
					const c = Math.floor((ee - T.e0) / T.cs), r2 = T.nr - 1 - Math.floor((nn - T.n0) / T.cs);
					return c < 0 || r2 < 0 || c >= T.nc || r2 >= T.nr || T.v[r2 * T.nc + c] < 0 ? NaN : T.v[r2 * T.nc + c] / 10;
				};
				const found = { 1: [], [-1]: [] };
				// odniesienie: powierzchnia toru na osi w przekroju (podkłady i szyny ok. 0,15 m pod główką szyny), bez niej –
				// niweleta
				const axisOff = [];
				for (let s2 = q.a; s2 <= q.b; s2 += 5) {
					const v = [-0.5, 0, 0.5].map((d2) => at(s2, d2)).filter(Number.isFinite).sort((x, y) => x - y);
					if (v.length) axisOff.push(v[v.length >> 1] + 0.15 - railAbs(s2 - shift));
				}
				axisOff.sort((x, y) => x - y);
				const corr = axisOff.length > 10 && Math.abs(axisOff[axisOff.length >> 1]) < 0.6 ? axisOff[axisOff.length >> 1] : 0;
				for (let s2 = q.a; s2 <= q.b; s2 += 5) {
					const rail = railAbs(s2 - shift) + corr;
					for (const side of [1, -1]) {
						const p = [];
						for (let j = 0; j <= 42; j++) p.push(at(s2, side * (1 + j * 0.5)) - rail);
						for (let j = 0; j <= 5; j++) {
							const h0 = p[j];
							if (!(h0 >= 0.35 && h0 <= 1.25)) continue;
							let flat = true;
							for (let k = j + 1; k <= j + 4; k++) if (!(Math.abs(p[k] - h0) < 0.2)) flat = false;
							if (!flat) continue;
							let k = j + 1;
							while (k <= 42 && (Math.abs(p[k] - h0) < 0.25 || p[k] > h0 + 1.5)) k++;
							const edge = 1 + j * 0.5, far = 1 + (k - 1) * 0.5 + 0.25;
							let island = false;
							for (let m = k; m <= Math.min(42, k + 8); m++) if (p[m] > -0.7 && p[m] < 0.15) island = true;
							if (far - edge >= 2.5) found[side].push({ s: s2, edge, width: far - edge, h: h0, island: island && k <= 42 });
							break;
						}
					}
				}
				const n = Math.round((q.b - q.a) / 5) + 1;
				const side = found[1].length >= found[-1].length ? 1 : -1, F = found[side];
				if (F.length < 0.25 * n) {
					if (opts.debug) log(`[debug] peron ${q.o.name}: nie wykryto (${found[1].length}/${found[-1].length} z ${n})`);
					continue;
				}
				const med = (f) => { const v = F.map(f).sort((x, y) => x - y); return v[v.length >> 1]; };
				const hh = [0.35, 0.55, 0.76, 0.96].reduce((x, y) => (Math.abs(y - med((z) => z.h)) < Math.abs(x - med((z) => z.h)) ? y : x));
				const s0 = Math.min(...F.map((z) => z.s)), s1 = Math.max(...F.map((z) => z.s));
				const old = q.o.platform || {};
				// krawędź: pierwszy punkt przekroju na peronie (co 0,5 m) – rzeczywista ok. 0,25 m bliżej; w zakresie 1,5–2,6 m –
				// normowa 1,72 m od osi toru
				const e0m = med((z) => z.edge) - 0.25, edgeM = e0m >= 1.25 && e0m <= 2.35 ? 1.72 : Math.round(e0m * 10) / 10;
				const P = { side, edge: edgeM, width: Math.round(Math.min(14, med((z) => z.width) + (med((z) => z.edge) - 0.25 - edgeM)) * 10) / 10, h: hh, measured: 1 };
				P.s0 = s1 - s0 >= 80 ? Math.round(s0) : old.s0;
				P.s1 = s1 - s0 >= 80 ? Math.round(Math.max(s1, q.o.pos + 5)) : old.s1;
				if (F.filter((z) => z.island).length > 0.5 * F.length) P.island = true;
				if (old.pi !== undefined && old.side === side) P.pi = old.pi;
				else if (env && env.p && P.s0 !== undefined) {
					/* pomiar wskazał drugą stronę niż obrys wybrany z mapy (np. dwa obrysy przy stacji – peron i drugi po
					   przeciwnej stronie): obrys z mapy po stronie z pomiaru, pokrywający się z peronem na co najmniej 60% */
					let bestPi, bestOv = 0;
					env.p.forEach((row, pi) => {
						let a = Infinity, b = -Infinity, dm = 0, m = 0;
						for (let k = 1; k + 1 < row.length; k += 2) { a = Math.min(a, row[k]); b = Math.max(b, row[k]); dm += row[k + 1]; m++; }
						if (!m || Math.sign(dm) !== side) return;
						const ov = Math.min(b, P.s1) - Math.max(a, P.s0);
						if (ov > 0.6 * (P.s1 - P.s0) && ov > bestOv) { bestOv = ov; bestPi = pi; }
					});
					if (bestPi !== undefined) P.pi = bestPi;
				}
				q.o.platform = P;
				log(`Peron ${q.o.name}: ${side > 0 ? 'z prawej' : 'z lewej'}${P.island ? ', wyspowy' : ''}, krawędź ${P.edge} m od osi, szerokość ${P.width} m, wysokość ${hh} m (pomiar ${med((z) => z.h).toFixed(2)} m; ${F.length}/${n} przekrojów, szyna ${corr >= 0 ? '+' : ''}${corr.toFixed(2)} m względem niwelety)${old.side && old.side !== side ? ' – inna strona niż z danych' : ''}.`);
			}
		};

		/* NMPT − NMT: wysokość obiektów nad terenem. Budynki: wysokość (90. percentyl powierzchni w obrysie nad
		   terenem przy ścianach) i dach płaski/spadzisty (rozrzut wysokości dachu), o ile OSM nie podaje; korony drzew:
		   siatka jak zagospodarowanie (co 10 m, kod co 2 m); pomosty wiaduktów nad torem i mostów obok. */
		const surfaceFromNmpt = async (H, DC, rowS, base) => {
			const NC = DC.length;
			// teren (NMT) z siatki w punkcie (s, d) trasy (s bez przesunięcia)
			const ground = (s2, d2) => {
				const fr = Math.max(0, Math.min(rowS.length - 1.001, s2 / 10)), r0 = Math.floor(fr), tr = fr - r0;
				let c0 = 0;
				while (c0 < NC - 2 && DC[c0 + 1] < d2) c0++;
				const tc = Math.max(0, Math.min(1, (d2 - DC[c0]) / (DC[c0 + 1] - DC[c0])));
				const at = (r2, c) => H[r2 * NC + c];
				const a = at(r0, c0) + (at(r0, c0 + 1) - at(r0, c0)) * tc, b2 = at(r0 + 1, c0) + (at(r0 + 1, c0 + 1) - at(r0 + 1, c0)) * tc;
				return a + (b2 - a) * tr;
			};
			const pl = (s2, d2) => { const q = llAt(s2 - shift, d2); return to1992(q.lat, q.lon); };
			// wiadukty nad torem i mosty obok: zagęszczenie łamanych do 6 m (profil jezdni z pomiaru w każdym punkcie)
			const densify = (row, off) => {
				const out = row.slice(0, off + 2);
				for (let k = off + 2; k + 1 < row.length; k += 2) {
					const sa = row[k - 2], da = row[k - 1], L = Math.hypot(row[k] - sa, row[k + 1] - da), parts = Math.ceil(L / 6);
					for (let j = 1; j < parts; j++) out.push(Math.round((sa + ((row[k] - sa) * j) / parts) * 2) / 2, Math.round((da + ((row[k + 1] - da) * j) / parts) * 2) / 2);
					out.push(row[k], row[k + 1]);
				}
				return out;
			};
			env.o = (env.o || []).map((row) => densify(row, 1));
			env.ro = (env.ro || []).map((row) => densify(row, 1));
			env.ob = (env.ob || []).map((row) => densify(row, 2));
			const cover = [];
			for (let s2 = 0; s2 <= endS; s2 += 50) for (let d2 = -560; d2 <= 560; d2 += 40) cover.push(llAt(s2, d2));
			const at = await opts.surface(cover, log);
			// budynki
			const bTags = env._bTags || [];
			let nb = 0;
			env.b.forEach((row, i) => {
				const m = (row.length - 3) / 2;
				if (m < 3) return;
				const tg = bTags[i] || [false, false];
				if (tg[0] && tg[1]) return;
				const V = [], SD = [];
				for (let k = 0; k < m; k++) { V.push(pl(row[3 + k * 2], row[4 + k * 2])); SD.push([row[3 + k * 2], row[4 + k * 2]]); }
				let n0 = Infinity, n1 = -Infinity, e0 = Infinity, e1 = -Infinity;
				for (const [nn, ee] of V) { n0 = Math.min(n0, nn); n1 = Math.max(n1, nn); e0 = Math.min(e0, ee); e1 = Math.max(e1, ee); }
				const inside = (nn, ee) => {
					let c = false;
					for (let a = 0, q = m - 1; a < m; q = a++) {
						const [na, ea] = V[a], [nq, eq] = V[q];
						if ((na > nn) !== (nq > nn) && ee < ((eq - ea) * (nn - na)) / (nq - na) + ea) c = !c;
					}
					return c;
				};
				const vals = [];
				for (let nn = Math.floor(n0 / 4) * 4 + 2; nn < n1; nn += 4) for (let ee = Math.floor(e0 / 4) * 4 + 2; ee < e1; ee += 4) {
					if (!inside(nn, ee)) continue;
					const v = at(nn, ee, 0);
					if (Number.isFinite(v)) vals.push(v);
				}
				if (!vals.length) {
					const v = at((n0 + n1) / 2, (e0 + e1) / 2, 0);
					if (Number.isFinite(v)) vals.push(v);
				}
				if (!vals.length) return;
				vals.sort((x, y) => x - y);
				const pct = (f) => vals[Math.min(vals.length - 1, Math.floor(f * vals.length))];
				let g = Infinity;
				for (const [s2, d2] of SD) g = Math.min(g, ground(s2 - shift, d2));
				const top = pct(0.9) - g;
				if (!(top > 1.8 && top < 150)) return;
				let area = 0;
				for (let a = 0, q = m - 1; a < m; q = a++) area += SD[q][0] * SD[a][1] - SD[a][0] * SD[q][1];
				area = Math.abs(area) / 2;
				// dach: rozrzut wysokości w obrysie – spadzisty, równy – płaski (małe budynki: za mało komórek)
				if (!tg[1] && vals.length >= 4) row[2] = pct(0.9) - pct(0.2) > 1.6 && area < 3000 ? row[2] || (m === 4 ? 1 : 2) : 0;
				if (!tg[0]) {
					let rh = 0;
					if (row[2] === 1 && m === 4) rh = Math.min(5.5, 0.42 * Math.min(Math.hypot(SD[1][0] - SD[0][0], SD[1][1] - SD[0][1]), Math.hypot(SD[2][0] - SD[1][0], SD[2][1] - SD[1][1])) + 0.6);
					else if (row[2]) rh = Math.min(4.5, 0.32 * Math.sqrt(area) + 0.5);
					row[1] = Math.round(Math.max(2.2, top - rh) * 10);
				}
				nb++;
			});
			// korony drzew (i inne obiekty bez budynków): co 10 m, kolumny jak zagospodarowanie, kod litera co 2 m
			const g = env.g, cvRows = [];
			for (let ri = 0; ri < g.rows.length; ri++) {
				const s2 = ri * g.step;
				let line = '', prev = -1, cnt = 0;
				for (let c = 0; c < g.cols; c++) {
					const d2 = g.d0 + c * g.step;
					let code = 0;
					if (Math.abs(d2) <= 560 && s2 <= endS) {
						const [nn, ee] = pl(s2 + shift, d2), v = at(nn, ee, 1);
						if (Number.isFinite(v)) code = Math.max(0, Math.min(25, Math.round((v - ground(s2, d2)) / 2)));
					}
					if (code === prev) cnt++;
					else { if (cnt) line += String.fromCharCode(65 + prev) + cnt; prev = code; cnt = 1; }
				}
				line += String.fromCharCode(65 + prev) + cnt;
				cvRows.push(line);
			}
			env.cv = { step: g.step, s0: g.s0, d0: g.d0, cols: g.cols, q: 2, rows: cvRows };
			// pomost: mediana powierzchni na osi drogi/toru w punktach |d| < 5 (nad torem) albo w środkowej części
			const deck = (row, off, mid) => {
				const P = [];
				for (let k = off; k + 1 < row.length; k += 2) P.push([row[k], row[k + 1]]);
				const sm = [];
				for (let k = 0; k + 1 < P.length; k++) {
					const L = Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]), parts = Math.max(1, Math.ceil(L / 2));
					for (let j = 0; j < parts; j++) sm.push([P[k][0] + ((P[k + 1][0] - P[k][0]) * j) / parts, P[k][1] + ((P[k + 1][1] - P[k][1]) * j) / parts]);
				}
				const pick = mid ? sm.slice(Math.floor(sm.length * 0.35), Math.ceil(sm.length * 0.65)) : sm.filter(([, d2]) => Math.abs(d2) < 5);
				const vals = pick.map(([s2, d2]) => { const [nn, ee] = pl(s2, d2); return at(nn, ee, 0); }).filter(Number.isFinite).sort((x, y) => x - y);
				return vals.length ? { z: vals[vals.length >> 1], s: (pick[0][0] + pick[pick.length - 1][0]) / 2 - shift } : null;
			};
			const deckZ = (row, off, mid, lo, hi, rel) => {
				const q = deck(row, off, mid);
				if (!q) return -1;
				const ref = rel ? railAbs(q.s) : 0;
				const dz = q.z - ref;
				return dz >= lo && dz <= hi ? Math.round((q.z - base) * 10) : -1;
			};
			// nad torem: pomost 5,5–20 m nad główką szyny (sieć trakcyjna); obok: 0,3–25 m nad terenem pod środkiem
			env.oz = (env.o || []).map((row) => deckZ(row, 1, false, 5.5, 20, true));
			env.roz = (env.ro || []).map((row) => deckZ(row, 1, false, 5.5, 20, true));
			env.obz = (env.ob || []).map((row) => {
				const q = deck(row, 2, true);
				if (!q) return -1;
				const P = [];
				for (let k = 2; k + 1 < row.length; k += 2) P.push([row[k], row[k + 1]]);
				const mid = P[P.length >> 1], dz = q.z - ground(mid[0] - shift, mid[1]);
				if (opts.debug && !(dz >= 0.3 && dz <= 25)) log(`[debug] most obok km ${((mid[0] - shift) / 1000).toFixed(2)} d ${mid[1].toFixed(0)}: pomost ${q.z.toFixed(1)}, teren ${(q.z - dz).toFixed(1)} (${dz.toFixed(1)} m)`);
				return dz >= 0.3 && dz <= 25 ? Math.round((q.z - base) * 10) : -1;
			});
			// diagnostyka: krzyżowania torów (z mapy między sobą i z osią naszego toru) – teren, powierzchnia, wysokości torów
			if (opts.debug) {
				const segs = [];
				env.t.forEach((row, i) => { const m = (row.length - 1) / 2; for (let k = 0; k + 1 < m; k++) segs.push([row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], i, k]); });
				segs.push(...[[0, 0, endS + shift, 0, -1, 0]]);
				const thAt = (i, k, t) => (i < 0 ? railAbs(0) : env.th[i][k] < 0 || env.th[i][k + 1] < 0 ? NaN : base + (env.th[i][k] + (env.th[i][k + 1] - env.th[i][k]) * t) / 10);
				const X = [];
				for (let a1 = 0; a1 < segs.length; a1++) for (let b1 = a1 + 1; b1 < segs.length; b1++) {
					const A1 = segs[a1], B1 = segs[b1];
					if (A1[4] === B1[4] || Math.max(A1[0], A1[2]) < Math.min(B1[0], B1[2]) || Math.max(B1[0], B1[2]) < Math.min(A1[0], A1[2])) continue;
					const [x1, y1, x2, y2] = A1, [x3, y3, x4, y4] = B1, den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
					if (Math.abs(den) < 1e-9) continue;
					const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den;
					if (t < 0.02 || t > 0.98 || u < 0.02 || u > 0.98) continue;
					const cos = Math.abs(((x2 - x1) * (x4 - x3) + (y2 - y1) * (y4 - y3)) / (Math.hypot(x2 - x1, y2 - y1) * Math.hypot(x4 - x3, y4 - y3)));
					if (cos > 0.985) continue;
					const sx = x1 + (x2 - x1) * t, dx = y1 + (y2 - y1) * t;
					const ra = A1[4] < 0 ? railAbs(sx - shift) : thAt(A1[4], A1[5], t), rb = B1[4] < 0 ? railAbs(sx - shift) : thAt(B1[4], B1[5], u);
					const [nn, ee] = pl(sx, dx);
					X.push(`km ${((sx - shift) / 1000).toFixed(3)} d ${dx.toFixed(0)}: tory ${A1[4]}(${A1[4] < 0 ? 'oś' : env.t[A1[4]][0]}) ${ra.toFixed(1)} / ${B1[4]}(${B1[4] < 0 ? 'oś' : env.t[B1[4]][0]}) ${rb.toFixed(1)}, teren ${ground(sx - shift, dx).toFixed(1)}, powierzchnia ${at(nn, ee, 0).toFixed(1)}–${at(nn, ee, 1).toFixed(1)}, kąt ${Math.round((Math.acos(Math.min(1, cos)) * 180) / Math.PI)}°`);
				}
				log(`[debug] krzyżowania torów: ${X.length}`);
				for (const x of X) log('[debug]   ' + x);
			}
			/* profil jezdni (toru) wiaduktów i mostów: powierzchnia (NMPT) w każdym punkcie – na pomoście jego wierzch, na
			   nasypie dojazdowym nasyp, na końcach teren; mediana z 5 (pojazdy, latarnie, przewody) i nie niżej niż teren */
			const profile = (row, off) => {
				const v = [];
				for (let k = off; k + 1 < row.length; k += 2) {
					const [nn, ee] = pl(row[k], row[k + 1]), z = at(nn, ee, 0), g = ground(row[k] - shift, row[k + 1]);
					v.push(Number.isFinite(z) ? Math.max(z, g) : g);
				}
				const md = v.map((_, i) => { const w = v.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b); return w[w.length >> 1]; });
				return md.map((x) => Math.round((x - base) * 10));
			};
			/* tory na mostach (bit 2): wysokość z pomostu (NMPT – podkłady i szyny ok. 0,15 m pod główką szyny) w punktach,
			   gdzie pomost jest ponad 1,5 m nad terenem; mediana z 5 (słupy, przewody) – zamiast prostej między końcami */
			let deckPts = 0;
			// punkty torów na mostach (komórki 25 m) – tory obok w ich pobliżu: początek pomostu bez oznaczenia mostu w danych
			const bg = new Map();
			env.t.forEach((row) => { if (row[0] & 2) for (let k = 1; k + 1 < row.length; k += 2) { const key = Math.floor(row[k] / 25) + ',' + Math.floor(row[k + 1] / 25); if (!bg.has(key)) bg.set(key, []); bg.get(key).push([row[k], row[k + 1]]); } });
			const nearBridge = (s2, d2) => { const a2 = Math.floor(s2 / 25), b2 = Math.floor(d2 / 25); for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) for (const [ps, pd] of bg.get(a2 + u + ',' + (b2 + v)) || []) if (Math.hypot(ps - s2, pd - d2) < 25) return true; return false; };
			env.t.forEach((row, i) => {
				if (!env.th[i]) return;
				const onB = !!(row[0] & 2), m = (row.length - 1) / 2, raw = [];
				let any = false;
				// typowa różnica wysokości toru względem naszej linii (tor tej samej linii czy inny poziom)
				const offs = [];
				for (let k = 0; k < m; k++) if (Math.abs(row[2 + k * 2]) <= 60 && env.th[i][k] >= 0) offs.push(base + env.th[i][k] / 10 - railAbs(row[1 + k * 2] - shift));
				offs.sort((x, y) => x - y);
				const sameLevel = offs.length > 0 && offs[offs.length >> 1] > -0.5;
				for (let k = 0; k < m; k++) {
					const s2 = row[1 + k * 2], d2 = row[2 + k * 2];
					if (!onB && !nearBridge(s2, d2)) { raw.push(NaN); continue; }
					const [nn, ee] = pl(s2, d2), sf = at(nn, ee, 0), g = ground(s2 - shift, d2), cur = base + env.th[i][k] / 10;
					// tor równoległy przy naszej linii (do 60 m): nie wyżej niż nasza linia (konstrukcja mostu – kratownica,
					// balustrady – w pomiarze powierzchni), zaniżenie 0,3–2,5 m przy moście (skraj przyczółka) – poziom linii
					const ka = Math.max(0, k - 1), kb = Math.min(m - 1, k + 1);
					const par = Math.abs(d2) <= 60 && Math.abs(row[2 + kb * 2] - row[2 + ka * 2]) <= 0.3 * Math.abs(row[1 + kb * 2] - row[1 + ka * 2]);
					const ra = railAbs(s2 - shift);
					// tor obok mostu: pomost najwyżej 2,5 m nad pomiarem terenu (nie pomost wiaduktu drogowego nad torem)
					const ok = Number.isFinite(sf) && sf - g > 1.5 && (onB || Math.abs(sf + 0.15 - cur) < 2.5);
					let val = ok ? sf + 0.15 : NaN;
					// górny limit: tor tej samej linii – nasza linia, inny poziom – własna wysokość toru
					if (par && Number.isFinite(val)) val = Math.min(val, sameLevel ? ra + 0.3 : cur + 0.8);
					if (par && sameLevel && !Number.isFinite(val) && ra - cur > 0.3 && ra - cur < 3.5) val = ra;
					raw.push(val);
					if (Number.isFinite(val)) any = true;
				}
				if (!any) return;
				for (let k = 0; k < m; k++) {
					if (!Number.isFinite(raw[k])) continue;
					const w = raw.slice(Math.max(0, k - 2), k + 3).filter(Number.isFinite).sort((x, y) => x - y);
					env.th[i][k] = Math.round((w[w.length >> 1] - base) * 10);
					deckPts++;
				}
			});
			if (opts.debug) log(`[debug] tory na mostach – wysokość z pomostu (NMPT): ${deckPts} punktów`);
			/* styki odcinków torów (wspólny koniec, do 0,6 m): różne wysokości (most z pomostu, dojazd z terenu) – odcinek bez
			   mostu łagodnie (40 m) dochodzi do wysokości odcinka mostowego (albo średniej) */
			{
				const joints = new Map();
				env.t.forEach((row, i) => {
					const m = (row.length - 1) / 2;
					if (!env.th[i] || m < 2) return;
					for (const k of [0, m - 1]) {
						const key = Math.round(row[1 + k * 2] / 0.6) + ',' + Math.round(row[2 + k * 2] / 0.6);
						if (!joints.has(key)) joints.set(key, []);
						joints.get(key).push([i, k]);
					}
				});
				let smoothed = 0;
				for (const list of joints.values()) {
					if (list.length < 2) continue;
					const br = list.filter(([i]) => env.t[i][0] & 2), src = br.length ? br : list;
					const target = src.reduce((a2, [i, k]) => a2 + env.th[i][k], 0) / src.length;
					for (const [i, k0] of list) {
						if (env.t[i][0] & 2 && br.length) continue;
						const row = env.t[i], z = env.th[i], m = (row.length - 1) / 2, diff = target - z[k0];
						if (Math.abs(diff) < 3 || z[k0] < 0) continue;
						const dir = k0 === 0 ? 1 : -1;
						let dist = 0;
						for (let k = k0; k >= 0 && k < m; k += dir) {
							if (k !== k0) dist += Math.hypot(row[1 + k * 2] - row[1 + (k - dir) * 2], row[2 + k * 2] - row[2 + (k - dir) * 2]);
							if (dist > 40) break;
							if (z[k] >= 0) z[k] = Math.round(z[k] + diff * (1 - dist / 40));
						}
						smoothed++;
					}
				}
				if (opts.debug) log(`[debug] styki torów wygładzone: ${smoothed}`);
			}
			/* krzyżowania torów z mapy (bez wspólnego węzła, kąt ponad 10°): gdy wysokości obu torów różnią się o mniej niż
			   4,5 m, a pomiar powierzchni (NMPT) w punkcie przecięcia pokazuje pomost ponad 3,5 m nad terenem (NMT pobrany
			   w tym punkcie) albo w danych nie ma rozjazdu ani skrzyżowania torów (do 10 m) – wiadukt: tor bliższy wysokości pomostu jest górą (odcinek nad przecięciem – most na poziomie
			   pomostu), drugi schodzi pod spód (prześwit co najmniej 6,2 m, rampa 2%). Linia dolna bywa w danych
			   spłaszczona (pod mostem NMT pokazuje dno, a śledzenie trendu wygładza takie obniżenie). */
			{
				const segs = [];
				env.t.forEach((row, i) => { const m = (row.length - 1) / 2; for (let k = 0; k + 1 < m; k++) segs.push([row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], i, k]); });
				segs.sort((x, y) => Math.min(x[0], x[2]) - Math.min(y[0], y[2]));
				const X = [];
				for (let a1 = 0; a1 < segs.length; a1++) {
					const A1 = segs[a1], amax = Math.max(A1[0], A1[2]);
					for (let b1 = a1 + 1; b1 < segs.length && Math.min(segs[b1][0], segs[b1][2]) <= amax; b1++) {
						const B1 = segs[b1];
						if (A1[4] === B1[4]) continue;
						const [x1, y1, x2, y2] = A1, [x3, y3, x4, y4] = B1, den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
						if (Math.abs(den) < 1e-9) continue;
						const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den;
						if (t < 0.02 || t > 0.98 || u < 0.02 || u > 0.98) continue;
						const la = Math.hypot(x2 - x1, y2 - y1), lb = Math.hypot(x4 - x3, y4 - y3);
						const cos = Math.abs(((x2 - x1) * (x4 - x3) + (y2 - y1) * (y4 - y3)) / (la * lb));
						if (cos > 0.985) continue;
						X.push({ sx: x1 + (x2 - x1) * t, dx: y1 + (y2 - y1) * t, A: A1, B: B1, t, u, sin: Math.sqrt(1 - cos * cos) });
					}
				}
				const thAbs = (i, k, t) => (env.th[i][k] < 0 || env.th[i][k + 1] < 0 ? NaN : base + (env.th[i][k] + (env.th[i][k + 1] - env.th[i][k]) * t) / 10);
				const gx = X.length ? await opts.lidar(X.map((x) => llAt(x.sx - shift, x.dx)), log) : [];
				// długość łamanej do punktu przecięcia
				const arc = (i, k, t) => { const row = env.t[i]; let c = 0; for (let q2 = 0; q2 < k; q2++) c += Math.hypot(row[3 + q2 * 2] - row[1 + q2 * 2], row[4 + q2 * 2] - row[2 + q2 * 2]); return c + t * Math.hypot(row[3 + k * 2] - row[1 + k * 2], row[4 + k * 2] - row[2 + k * 2]); };
				// tor dolny: pod spodem, rampa 2% w obie strony
				// obniżenie przechodzi na tory połączone końcem (dalszy ciąg linii, odgałęzienia) – bez progów na stykach
				const lower = (li, lc, L0, seen) => {
					if (seen.has(li) || env.t[li][0] & 2) return; // pomostów nie obniżamy
					seen.add(li);
					const lrow = env.t[li], lm = (lrow.length - 1) / 2, hit = [];
					let c = 0;
					for (let k = 0; k < lm; k++) {
						if (k) c += Math.hypot(lrow[1 + k * 2] - lrow[k * 2 - 1], lrow[2 + k * 2] - lrow[k * 2]);
						const target = L0 + 0.02 * Math.abs(c - lc), z = env.th[li][k];
						if (z >= 0 && base + z / 10 > target) { env.th[li][k] = Math.round((target - base) * 10); hit.push(k); }
					}
					if (!hit.length) return;
					env.t.forEach((row2, j) => {
						if (seen.has(j)) return;
						const m2 = (row2.length - 1) / 2;
						for (const [e, c2] of [[0, 0], [m2 - 1, -1]]) {
							const k = hit.find((q) => Math.hypot(row2[1 + e * 2] - lrow[1 + q * 2], row2[2 + e * 2] - lrow[2 + q * 2]) < 1.5);
							if (k === undefined) continue;
							lower(j, c2 < 0 ? arc(j, m2 - 2, 1) : 0, base + env.th[li][k] / 10, seen);
							return;
						}
					});
				};
				const zones = new Map(); // wiersz → [{ c (długość od początku), half, z }]
				let nX = 0;
				X.forEach((x, q) => {
					const ya = thAbs(x.A[4], x.A[5], x.t), yb = thAbs(x.B[4], x.B[5], x.u), g = gx[q];
					if (!Number.isFinite(ya) || !Number.isFinite(yb) || !Number.isFinite(g) || Math.abs(ya - yb) >= 4.5) return;
					const [nn, ee] = pl(x.sx, x.dx), sf = at(nn, ee, 1);
					// pomost w pomiarze ponad 3,5 m nad terenem – wiadukt pewny; bez niego: tory bez rozjazdu / skrzyżowania torów
					// w danych (do 10 m od przecięcia) też nie mogą się krzyżować w poziomie (pod wąskim mostem NMT interpoluje teren)
					const deck = sf - g > 3.5;
					const swNear = (env.sw || []).some((q) => Math.hypot(q[0] - x.sx, q[1] - x.dx) < 10);
					if (!deck && swNear) return;
					// stacja z głowicami (peron i 250 m przed i za nim): krzyżowania torów w poziomie są tam normalne, a w pomiarze
					// powierzchni bywa zadaszenie hali peronowej
					if (def.stations.some((o) => { const a0 = o.platform && o.platform.s0 !== undefined ? o.platform.s0 : o.pos - platformLength, b0 = o.platform && o.platform.s1 !== undefined ? o.platform.s1 : o.pos + 15; return x.sx > a0 - 250 && x.sx < b0 + 250; })) return;
					const U0 = Number.isFinite(sf) && sf - g > 1.5 ? sf + 0.15 : Math.max(ya, yb);
					const upA = deck ? Math.abs(ya - U0) <= Math.abs(yb - U0) : ya >= yb;
					const U = deck ? U0 : Math.max(upA ? ya : yb, Math.min(U0, Math.max(ya, yb) + 1));
					const up = upA ? x.A : x.B, lo = upA ? x.B : x.A, tUp = upA ? x.t : x.u, tLo = upA ? x.u : x.t, yLo = upA ? yb : ya;
					const L = deck ? Math.min(yLo, g + 0.3, U - 6.2) : Math.min(yLo, U - 6.2);
					const seen = new Set();
					seen.add(up[4]);
					lower(lo[4], arc(lo[4], lo[5], tLo), L, seen);
					// tor górny: odcinek nad przecięciem – most na poziomie pomostu
					const ui = up[4];
					if (!zones.has(ui)) zones.set(ui, []);
					zones.get(ui).push({ c: arc(ui, up[5], tUp), half: Math.min(30, Math.max(8, 7 / Math.max(0.2, x.sin))), z: U });
					nX++;
				});
				// podział torów górnych: odcinek mostowy (bit 2) i reszta
				if (zones.size) {
					const T2 = [], H2 = [];
					env.t.forEach((row, i) => {
						const zs = zones.get(i);
						if (!zs) { T2.push(row); H2.push(env.th[i]); return; }
						const m = (row.length - 1) / 2, cum = [0];
						for (let k = 1; k < m; k++) cum.push(cum[k - 1] + Math.hypot(row[1 + k * 2] - row[k * 2 - 1], row[2 + k * 2] - row[k * 2]));
						const inZ = cum.map((c) => zs.find((z) => Math.abs(c - z.c) <= z.half));
						let k0 = 0;
						while (k0 < m) {
							let k1 = k0;
							while (k1 + 1 < m && !!inZ[k1 + 1] === !!inZ[k0]) k1++;
							// odcinki stykają się wspólnym punktem; most – z sąsiednimi punktami (koniec mostu na dojeździe)
							const a2 = inZ[k0] ? Math.max(0, k0 - 1) : k0, b2 = inZ[k0] ? Math.min(m - 1, k1 + 1) : k1;
							if (b2 > a2) {
								const r2 = [inZ[k0] ? row[0] | 2 : row[0]], h2 = [];
								for (let k = a2; k <= b2; k++) {
									r2.push(row[1 + k * 2], row[2 + k * 2]);
									h2.push(inZ[k0] && inZ[k] ? Math.round((inZ[k].z - base) * 10) : env.th[i][k]);
								}
								T2.push(r2);
								H2.push(h2);
							}
							k0 = k1 + 1;
						}
					});
					env.t = T2;
					env.th = H2;
				}
				if (nX) log(`Krzyżowania torów z mapy z wiaduktem w pomiarze (NMPT): ${nX} – tor górny na moście, dolny pod spodem.`);
				/* prześwit pod torami z mapy biegnącymi nad innymi torami (most albo jego dojazd, różnica od 3,7 m): co najmniej 6,2 m (sieć trakcyjna) – tor dolny
				   obniżony (najwyżej o 2,5 m; większy brak to raczej błąd danych), rampa 2% i dalszy ciąg linii jak wyżej;
				   tory przy osi (do 6 m) zostają – tam poziom naszej linii */
				{
					const segs2 = [];
					env.t.forEach((row, i) => { const m = (row.length - 1) / 2; for (let k = 0; k + 1 < m; k++) segs2.push([row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], i, k]); });
					segs2.sort((x, y) => Math.min(x[0], x[2]) - Math.min(y[0], y[2]));
					let nC = 0;
					for (let a1 = 0; a1 < segs2.length; a1++) {
						const A1 = segs2[a1], amax = Math.max(A1[0], A1[2]);
						for (let b1 = a1 + 1; b1 < segs2.length && Math.min(segs2[b1][0], segs2[b1][2]) <= amax; b1++) {
							const B1 = segs2[b1];
							if (A1[4] === B1[4]) continue;
							const [x1, y1, x2, y2] = A1, [x3, y3, x4, y4] = B1, den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
							if (Math.abs(den) < 1e-9) continue;
							const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den;
							if (t < 0.02 || t > 0.98 || u < 0.02 || u > 0.98) continue;
							const dx = y1 + (y2 - y1) * t;
							if (Math.abs(dx) < 6) continue;
							const ya = thAbs(A1[4], A1[5], t), yb = thAbs(B1[4], B1[5], u);
							if (!Number.isFinite(ya) || !Number.isFinite(yb)) continue;
							const aUp = ya >= yb, up = aUp ? A1 : B1, lo = aUp ? B1 : A1, tLo = aUp ? u : t, yU = Math.max(ya, yb), yL = Math.min(ya, yb);
							const gap = yU - yL;
							if (gap < 1.5 || gap >= 6.2 || gap < 6.2 - 2.5) continue;
							const sn = new Set([up[4]]);
							lower(lo[4], arc(lo[4], lo[5], tLo), yU - 6.2, sn);
							nC++;
						}
					}
					if (nC) log(`Tory z mapy nad innymi torami z prześwitem poniżej 6,2 m: ${nC} – tor dolny obniżony.`);
				}
			}
			/* tory z mapy: bez zapadlisk ostrzejszych niż 3% (tor wzięty z terenu pod mostem albo w dolinie pod nasypem –
			   NMT pokazuje dno) i bez progów na stykach torów (koniec do końca – wyższy z poziomów) */
			{
				const G = 0.03;
				let raised = 0;
				const fill = (i) => {
					const row = env.t[i], z = env.th[i], m = (row.length - 1) / 2;
					for (const dir of [1, -1]) {
						for (let k = dir > 0 ? 1 : m - 2; k >= 0 && k < m; k += dir) {
							const j = k - dir;
							if (z[k] < 0 || z[j] < 0) continue;
							const L = Math.hypot(row[1 + k * 2] - row[1 + j * 2], row[2 + k * 2] - row[2 + j * 2]), lim = z[j] - Math.round(G * L * 10);
							if (z[k] < lim) { z[k] = lim; raised++; }
						}
					}
				};
				const ends = [];
				env.t.forEach((row, i) => { const m = (row.length - 1) / 2; ends.push([i, 0, row[1], row[2]], [i, m - 1, row[row.length - 2], row[row.length - 1]]); });
				/* odgałęzienia (koniec toru na innym torze – rozjazd): początek na wysokości toru zasadniczego, dalej
				   pochylenie najwyżej 3% w obie strony */
				const branches = [];
				ends.forEach(([i, k, s0, d0]) => {
					let best = null, bd = 1.0;
					const rowI = env.t[i], mI = (rowI.length - 1) / 2, kn = k === 0 ? 1 : mI - 2;
					const ui = [rowI[1 + kn * 2] - s0, rowI[2 + kn * 2] - d0], ul = Math.hypot(ui[0], ui[1]) || 1;
					env.t.forEach((row, j) => {
						if (j === i) return;
						const m = (row.length - 1) / 2;
						for (let q = 0; q + 1 < m; q++) {
							const sa = row[1 + q * 2], da = row[2 + q * 2], sb = row[3 + q * 2], db = row[4 + q * 2];
							if (Math.min(sa, sb) > s0 + 1 || Math.max(sa, sb) < s0 - 1) continue;
							const L2 = (sb - sa) ** 2 + (db - da) ** 2;
							const t = L2 ? Math.max(0, Math.min(1, ((s0 - sa) * (sb - sa) + (d0 - da) * (db - da)) / L2)) : 0;
							const dist = Math.hypot(sa + (sb - sa) * t - s0, da + (db - da) * t - d0);
							// środek toru (nie styk końców – te wyrównuje pętla niżej)
							// rozjazd: odgałęzienie pod małym kątem (do 30°) do toru zasadniczego
							const cos = Math.abs((ui[0] * (sb - sa) + ui[1] * (db - da)) / (ul * Math.sqrt(L2) || 1));
							if (dist < bd && cos > 0.866 && !((q === 0 && t < 0.05) || (q === m - 2 && t > 0.95))) { bd = dist; best = [j, q, t]; }
						}
					});
					if (best) branches.push([i, k, best]);
				});
				const branchFix = () => {
					for (const [i, k, [j, q, t]] of branches) {
						const za = env.th[j][q], zb = env.th[j][q + 1];
						if (za < 0 || zb < 0 || env.th[i][k] < 0) continue;
						const z0 = Math.round(za + (zb - za) * t);
						// różnica ponad 1,5 m – inny poziom (most, wykop), nie rozjazd
						if (env.th[i][k] === z0 || Math.abs(env.th[i][k] - z0) > 15) continue;
						env.th[i][k] = z0;
						raised++;
						const row = env.t[i], m = (row.length - 1) / 2, dir = k === 0 ? 1 : -1;
						for (let k2 = k + dir; k2 >= 0 && k2 < m; k2 += dir) {
							const kp = k2 - dir, L = Math.hypot(row[1 + k2 * 2] - row[1 + kp * 2], row[2 + k2 * 2] - row[2 + kp * 2]), g = Math.round(G * L * 10);
							const z = env.th[i][k2], zp = env.th[i][kp];
							if (z < 0) break;
							const zc = Math.max(zp - g, Math.min(zp + g, z));
							if (zc === z) break;
							env.th[i][k2] = zc;
						}
					}
				};
				for (let it = 0; it < 4; it++) {
					branchFix();
					env.t.forEach((_, i) => fill(i));
					for (let p2 = 0; p2 < ends.length; p2++) for (let q2 = p2 + 1; q2 < ends.length; q2++) {
						const A = ends[p2], B = ends[q2];
						if (A[0] === B[0] || Math.abs(A[2] - B[2]) > 1 || Math.hypot(A[2] - B[2], A[3] - B[3]) > 1) continue;
						const za = env.th[A[0]][A[1]], zb = env.th[B[0]][B[1]];
						if (za < 0 || zb < 0 || za === zb) continue;
						env.th[A[0]][A[1]] = env.th[B[0]][B[1]] = Math.max(za, zb);
						raised++;
					}
				}
				if (raised && opts.debug) log(`[debug] tory z mapy – wyrównane zapadliska i progi na stykach: ${raised}`);
			}
			env.oh = env.o.map((row) => profile(row, 1));
			env.roh = env.ro.map((row) => profile(row, 1));
			env.obh = env.ob.map((row) => profile(row, 2));
			/* drogi stykające się z końcem mostu (odcinek mostu w danych bywa krótszy niż prawdziwy most): od tego końca jezdnia
			   po powierzchni (NMPT), dopóki ta jest ponad 2 m nad terenem – dalszy ciąg pomostu albo nasyp dojazdu */
			if (env.rh) {
				const ends = [];
				for (const [rows2, off] of [[env.o, 1], [env.ob, 2]]) for (const row of rows2) { ends.push([row[off], row[off + 1]], [row[row.length - 2], row[row.length - 1]]); }
				let fixedR = 0;
				env.r.forEach((row, i) => {
					const z = env.rh[i], m = (row.length - 1) / 2;
					if (!z || m < 2) return;
					const touch = (k) => ends.some(([s2, d2]) => Math.hypot(s2 - row[1 + k * 2], d2 - row[2 + k * 2]) < 4);
					for (const [k0, dir] of [[0, 1], [m - 1, -1]]) {
						if (!touch(k0)) continue;
						for (let k = k0; k >= 0 && k < m; k += dir) {
							const [nn, ee] = pl(row[1 + k * 2], row[2 + k * 2]), sf = at(nn, ee, 0), g = ground(row[1 + k * 2] - shift, row[2 + k * 2]);
							if (!(sf - g > 2)) break;
							z[k] = Math.round((sf - base) * 10);
							fixedR++;
						}
					}
				});
				if (fixedR && opts.debug) log(`[debug] dojazdy do mostów po powierzchni: ${fixedR} punktów dróg`);
			}
			const okN = (a) => a.filter((x) => x >= 0).length;
			log(`NMPT: wysokość z pomiaru dla ${nb} budynków, korony drzew, pomosty – wiadukty nad torem ${okN(env.oz)}/${env.oz.length}, kolejowe ${okN(env.roz)}/${env.roz.length}, mosty obok ${okN(env.obz)}/${env.obz.length}.`);
		};

		// ---------- ukształtowanie terenu wokół trasy (siatka wysokości) ----------
		/* Co 100 m wzdłuż trasy, co 60 m w poprzek (±300 m). Copernicus DEM to model powierzchni: minimum z sąsiednich
		   punktów (dachy, pojedyncze drzewa), w lesie minus korony (12 m), na osiedlach i terenach przemysłowych
		   minus 2 m, dwukrotne wygładzenie. Zapis: wysokości bezwzględne w dm ponad `base`; gra dopasowuje je do
		   niwelety toru (przesunięcie z mediany na osi). */
		if (env && lidar && opts.dem) {
			/* NMT: co 10 m wzdłuż, w poprzek gęsto przy torze (skarpy nasypów i wykopów), rzadziej dalej, do ±560 m;
			   wysokości bezwzględne w dm ponad `base`, kolumny w `dc` (m od osi). */
			const DS = 10, half = [0, 2.5, 5, 8, 11, 15, 19, 24, 30, 37, 45, 55, 70, 90, 120, 160, 220, 300, 380, 460, 560];
			const DC = half.slice(1).reverse().map((x) => -x).concat(half), NC = DC.length;
			const rowS = [];
			for (let s2 = 0; s2 <= endS; s2 += DS) rowS.push(s2);
			const ll = [];
			for (const s2 of rowS) for (const d2 of DC) ll.push(llAt(s2, d2));
			log(`Pobieram ukształtowanie terenu z NMT (${ll.length} punktów)…`);
			const H = await opts.lidar(ll, log);
			// brakujące punkty – z sąsiedniego w wierszu / poprzedniego wiersza
			for (let i = 0; i < H.length; i++) if (!Number.isFinite(H[i])) H[i] = i % NC ? H[i - 1] : i >= NC ? H[i - NC] : rail0 - 1;
			let base = Infinity, hi = -Infinity;
			for (const x of H) { base = Math.min(base, x); hi = Math.max(hi, x); }
			base = Math.floor(base);
			env.dem = { s0: shift, ds: DS, dc: DC, cols: NC, rows: rowS.length, base, lidar: 1, v: H.map((x) => Math.round((x - base) * 10)) };
			log(`Ukształtowanie terenu (NMT): ${rowS.length} × ${NC} punktów, wysokości ${base}–${Math.round(hi)} m n.p.m.`);
			/* mosty dodane przez generator (bez mostu w danych, przyjęte przejście pod torem): pomiar weryfikuje – obniżenie
			   terenu pod torem (do 5 m od osi) w pasie ±25 m od miejsca przecięcia z danych: od 2,5 m pod podtorzem –
			   przejście potwierdzone, most przesunięty na obniżenie (długość z pomiaru); bez obniżenia – przejścia pod torem
			   nie ma (droga lub tor nad naszym, w poziomie albo dane się mylą) – most usunięty, z uwagą */
			const axisC = DC.map((x, c) => (Math.abs(x) <= 5 ? c : -1)).filter((c) => c >= 0);
			const depthAt = (s2) => {
				const ri = Math.max(0, Math.min(rowS.length - 1, Math.round(s2 / DS)));
				let dpt = 0;
				for (const c of axisC) dpt = Math.max(dpt, railAbs(s2) - 0.95 - H[ri * NC + c]);
				return dpt;
			};
			for (let q = bridges.length - 1; q >= 0; q--) {
				const o = bridges[q];
				if (!o.auto || o.nmt) continue;
				const a0 = o.from - shift, b0 = o.to - shift;
				let best = 0, bestS = null;
				for (let s2 = Math.floor((a0 - 25) / DS) * DS; s2 <= b0 + 25; s2 += DS) { const dpt = depthAt(s2); if (dpt > best) { best = dpt; bestS = s2; } }
				const own = issues.filter((x) => (x.k === 'bridge-add' || x.k === 'cross') && x.pos >= o.from - 10 && x.pos <= o.to + 10);
				if (best >= 2.5) {
					// zasięg obniżenia (wiersze siatki co 10 m z głębokością od 2 m) wokół najgłębszego miejsca
					let lo = bestS, hi = bestS;
					while (lo - DS >= a0 - 40 && depthAt(lo - DS) >= 2) lo -= DS;
					while (hi + DS <= b0 + 40 && depthAt(hi + DS) >= 2) hi += DS;
					o.from = S(lo - 7);
					o.to = S(hi + 7);
					o.nmt = 1;
					for (const x of own) {
						x.lvl = 'info';
						x.m = x.m.replace(/, przyjęto\)/, ')') + ` Potwierdzone pomiarem NMT: teren pod torem do ${best.toFixed(1)} m niżej (km ${fmtKm(o.from)}–${fmtKm(o.to)}).`;
					}
					continue;
				}
				// tor przecinający nasz bez wspólnego węzła (rozjazdu, skrzyżowania) nie może biec w poziomie – wiadukt zostaje;
				// wąskiego przejścia pod nasypem NMT nie pokazuje (pod mostem brak punktów gruntu – teren interpolowany)
				if (o.over === 'rail') {
					for (const x of own) x.m = x.m.replace(/, przyjęto\)/, ')') + ' Pomiar NMT nie pokazuje obniżenia (wąskie przejście pod nasypem jest interpolowane) – wiadukt zostaje, tor pod spodem w wykopie typowej głębokości.';
					continue;
				}
				bridges.splice(q, 1);
				for (const x of own) issues.splice(issues.indexOf(x), 1);
				issue('bridge-nmt', a0, 'info', `Pomiar NMT: pod torem brak obniżenia (najwyżej ${best.toFixed(1)} m w pasie ±25 m) – usunięto wiadukt dodany przez generator (${o.over === 'rail' ? 'tor' : 'droga'} bez przejazdu w danych).`, `Jeśli to jednak przejście pod torem: "bridges": [{ "from": ${o.from}, "to": ${o.to}, "kind": "viaduct" }].`, b0);
			}
			bridges.sort((x, y) => x.from - y.from);
			// tory z mapy: wysokość główki szyny w każdym punkcie (dm ponad base); odcinki na mostach – prosto między
			// punktami 5 m za końcami mostu (na nasypie dojazdowym), bo NMT pod mostem pokazuje dno.
			// Najpierw zagęszczenie: odcinki do 8 m (pomiar w punktach łamanej, długie proste – za mało punktów);
			// wiadukty innych linii (tz) – zbędne, wysokość z pomiaru
			env._tz = null;
			env.t = env.t.map((row) => {
				const m = (row.length - 1) / 2, out = [row[0], row[1], row[2]];
				for (let k = 1; k < m; k++) {
					const sa = row[k * 2 - 1], da = row[k * 2], sb = row[1 + k * 2], db = row[2 + k * 2];
					const parts = Math.ceil(Math.hypot(sb - sa, db - da) / 8);
					for (let j = 1; j < parts; j++) out.push(Math.round((sa + ((sb - sa) * j) / parts) * 50) / 50, Math.round((da + ((db - da) * j) / parts) * 50) / 50);
					out.push(sb, db);
				}
				return out;
			});
			const tl = [];
			env.t.forEach((row) => {
				const m = (row.length - 1) / 2;
				for (let k = 0; k < m; k++) tl.push(llAt(row[1 + k * 2] - shift, row[2 + k * 2]));
				if (row[0] & 2 && m >= 2) {
					const ext = (k0, k1) => {
						const s0 = row[1 + k0 * 2], d0 = row[2 + k0 * 2], s1 = row[1 + k1 * 2], d1 = row[2 + k1 * 2], L = Math.hypot(s0 - s1, d0 - d1) || 1;
						return llAt(s0 + ((s0 - s1) / L) * 5 - shift, d0 + ((d0 - d1) / L) * 5);
					};
					tl.push(ext(0, 1), ext(m - 1, m - 2));
				}
			});
			log(`Pobieram wysokości torów z mapy z NMT (${tl.length} punktów)…`);
			const th = await opts.lidar(tl, log);
			let q = 0;
			env.th = env.t.map((row) => {
				const m = (row.length - 1) / 2, v = th.slice(q, q + m);
				q += m;
				if (row[0] & 2 && m >= 2) {
					const a = th[q], b = th[q + 1];
					q += 2;
					if (Number.isFinite(a) && Number.isFinite(b)) {
						const L = [0];
						for (let k = 1; k < m; k++) L.push(L[k - 1] + Math.hypot(row[1 + k * 2] - row[k * 2 - 1], row[2 + k * 2] - row[k * 2]));
						for (let k = 0; k < m; k++) v[k] = a + ((b - a) * L[k]) / (L[m - 1] || 1);
					}
				}
				for (let k = 0; k < m; k++) if (!Number.isFinite(v[k])) v[k] = k ? v[k - 1] : NaN;
				for (let k = m - 2; k >= 0; k--) if (!Number.isFinite(v[k])) v[k] = v[k + 1];
				// tory przy naszej linii (do 15 m, równoległe): na odcinku naszego mostu – na jego poziomie (pod mostem NMT
				// pokazuje dno); pomiar ponad 1,5 m wyżej niż nasza linia – pomost nad torem zostawiony w NMT
				// typowa różnica względem naszej linii (tor tej samej linii czy inny poziom)
				const offs0 = [];
				for (let k = 0; k < m; k++) if (Math.abs(row[2 + k * 2]) <= 60 && Number.isFinite(v[k])) offs0.push(v[k] + 0.3 - railAbs(row[1 + k * 2] - shift));
				offs0.sort((x, y) => x - y);
				const sameLv = offs0.length > 0 && offs0[offs0.length >> 1] > -0.5;
				for (let k = 0; k < m; k++) {
					const s2 = row[1 + k * 2], d2 = row[2 + k * 2];
					if (Math.abs(d2) > 60 || !Number.isFinite(v[k])) continue;
					// tylko tory równoległe (do 15 m – skos do 0,15; obniżone na moście – do 0,3, np. zjazd) – tor ukośny może
					// przechodzić nad naszym (wiadukt kolejowy) albo pod nim
					const ka = Math.max(0, k - 1), kb = Math.min(m - 1, k + 1);
					const skew = Math.abs(row[2 + kb * 2] - row[2 + ka * 2]) / (Math.abs(row[1 + kb * 2] - row[1 + ka * 2]) || 1e-6);
					if (skew > 0.3) continue;
					const ra = railAbs(s2 - shift) - 0.3, onOurs = bridges.some((o) => s2 > o.from - 15 && s2 < o.to + 15);
					if (skew > 0.15 && !(onOurs && v[k] < ra - 1.5)) continue;
					// do 15 m: na odcinku naszego mostu albo pomiar ponad 1,5 m wyżej (pomost nad torem w NMT) – poziom naszej linii;
					// do 60 m (głowice stacji, tory obok): na odcinku naszego mostu pomiar ponad 1,5 m niżej – tor na tym samym
					// obiekcie (przejście pod całym torowiskiem), krótki odcinek toru z mapy nad przejściem nie ma odniesienia
					if ((Math.abs(d2) <= 15 && (onOurs || v[k] > ra + 1.5)) || (onOurs && row[0] & 2 && skew <= 0.15 && sameLv)) v[k] = ra;
					else if (onOurs && v[k] < ra - 1.5 && sameLv) v[k] = NaN; // dalej – prosto między pewnymi punktami toru przed i za mostem
				}
				// odrzucone punkty: liniowo między pewnymi sąsiadami w torze; bez sąsiada z jednej strony – poziom naszej linii
				if (v.some((x) => Number.isNaN(x))) {
					const Ls = [0];
					for (let k = 1; k < m; k++) Ls.push(Ls[k - 1] + Math.hypot(row[1 + k * 2] - row[k * 2 - 1], row[2 + k * 2] - row[k * 2]));
					for (let k = 0; k < m; k++) {
						if (!Number.isNaN(v[k])) continue;
						let a2 = k - 1, b2 = k + 1;
						while (a2 >= 0 && Number.isNaN(v[a2])) a2--;
						while (b2 < m && Number.isNaN(v[b2])) b2++;
						if (a2 >= 0 && b2 < m) v[k] = v[a2] + ((v[b2] - v[a2]) * (Ls[k] - Ls[a2])) / (Ls[b2] - Ls[a2] || 1);
						else v[k] = railAbs(row[1 + k * 2] - shift) - 0.3;
					}
				}
				// zagłębienia do 40 m wzdłuż toru (mosty bez oznaczenia, przepusty)
				if (v.every(Number.isFinite)) {
					const L = [0];
					for (let k = 1; k < m; k++) L.push(L[k - 1] + Math.hypot(row[1 + k * 2] - row[k * 2 - 1], row[2 + k * 2] - row[k * 2]));
					// tory: pochylenie do 4%, odskoki ponad 2 m do 400 m (mosty bez oznaczenia, pomosty nad torem w NMT)
					const c = closeDips(openBumps(trendFix(v, L, 0.04, 2, 100, 400), L, 15), L, 20);
					for (let k = 0; k < m; k++) v[k] = c[k];
				}
				return v.map((x) => (Number.isFinite(x) ? Math.round((x + 0.3 - base) * 10) : -1));
			});
			/* mosty drogowe obok toru (nie nad torami): teren pod środkiem (NMT, mosty usunięte) nie niżej niż 2 m od końców –
			   pod spodem nic nie ma (dane oznaczają most, a droga biegnie po terenie) – zwykła droga */
			if (env.ob && env.ob.length) {
				const obl = [], meta = [];
				env.ob.forEach((row, i) => {
					const P2 = [];
					for (let k = 2; k + 1 < row.length; k += 2) {
						if (k > 2) {
							const sa = row[k - 2], da = row[k - 1], L = Math.hypot(row[k] - sa, row[k + 1] - da), parts = Math.ceil(L / 5);
							for (let j = 1; j < parts; j++) P2.push([sa + ((row[k] - sa) * j) / parts, da + ((row[k + 1] - da) * j) / parts]);
						}
						P2.push([row[k], row[k + 1]]);
					}
					meta.push([i, obl.length, P2.length]);
					for (const [s2, d2] of P2) obl.push(llAt(s2 - shift, d2));
				});
				const hh = await opts.lidar(obl, log);
				let conv = 0;
				const keepOb = [];
				for (const [i, a0, m] of meta) {
					const row = env.ob[i], v = hh.slice(a0, a0 + m).filter(Number.isFinite);
					if (row[1] >= 60 || v.length < 3) { keepOb.push(row); continue; }
					const ends = Math.min(v[0], v[v.length - 1]), low = Math.min(...v.slice(Math.floor(v.length * 0.2), Math.ceil(v.length * 0.8)));
					if (ends - low < 2) { env.r.push([row[0]].concat(row.slice(2))); if (env.ra) env.ra.push([0, 0, 0, 0, 0]); conv++; } else keepOb.push(row);
				}
				env.ob = keepOb;
				if (conv) log(`Mosty drogowe bez obniżenia terenu pod spodem (pomiar NMT): ${conv} – jako zwykłe drogi.`);
			}
			// drogi z mapy: wysokość jezdni w każdym punkcie (odcinki do 10 m); zagłębienia do 24 m (przepusty) i garby
			// do 20 m (wiadukt nad drogą zostawiony w NMT) usunięte
			env.r = env.r.map((row) => {
				const m = (row.length - 1) / 2, out = [row[0], row[1], row[2]];
				for (let k = 1; k < m; k++) {
					const sa = row[k * 2 - 1], da = row[k * 2], sb = row[1 + k * 2], db = row[2 + k * 2];
					const parts = Math.ceil(Math.hypot(sb - sa, db - da) / 10);
					for (let j = 1; j < parts; j++) out.push(Math.round((sa + ((sb - sa) * j) / parts) * 2) / 2, Math.round((da + ((db - da) * j) / parts) * 2) / 2);
					out.push(sb, db);
				}
				return out;
			});
			const rl = [];
			for (const row of env.r) for (let k = 1; k + 1 < row.length; k += 2) rl.push(llAt(row[k] - shift, row[k + 1]));
			log(`Pobieram wysokości dróg z mapy z NMT (${rl.length} punktów)…`);
			const rhAll = await opts.lidar(rl, log);
			let rq = 0;
			env.rh = env.r.map((row) => {
				const m = (row.length - 1) / 2, v = rhAll.slice(rq, rq + m);
				rq += m;
				for (let k = 1; k < m; k++) if (!Number.isFinite(v[k])) v[k] = v[k - 1];
				for (let k = m - 2; k >= 0; k--) if (!Number.isFinite(v[k])) v[k] = v[k + 1];
				if (!v.every(Number.isFinite)) return null;
				const L = [0];
				for (let k = 1; k < m; k++) L.push(L[k - 1] + Math.hypot(row[1 + k * 2] - row[k * 2 - 1], row[2 + k * 2] - row[k * 2]));
				return closeDips(openBumps(v, L, 10), L, 12).map((x) => Math.round((x - base) * 10));
			});
			/* perony z mapy: poziom z pomiaru względem najbliższego toru (z mapy – jego wysokość z pomiaru, przy naszej linii
			   – niweleta): wysokość nad główką szyny dopasowana do normy (0,55 / 0,76 / 0,96 m); gdy NMT nie obejmuje
			   peronu (powierzchnia przy torze) – 0,76 m. env.ph – wierzch peronu (dm ponad base), −1 – bez pomiaru. */
			const pp = [], meta = [];
			for (const row of env.p || []) {
				const m = (row.length - 1) / 2;
				let cs = 0, cd = 0;
				for (let k = 0; k < m; k++) { cs += row[1 + k * 2]; cd += row[2 + k * 2]; }
				cs /= m;
				cd /= m;
				meta.push([cs, cd, pp.length]);
				pp.push(llAt(cs - shift, cd));
				if (row[0] === 1) for (let k = 0; k < m; k += Math.max(1, Math.floor(m / 4))) pp.push(llAt((cs + row[1 + k * 2]) / 2 - shift, (cd + row[2 + k * 2]) / 2));
				else for (let k = 0; k < m; k += Math.max(1, Math.floor(m / 4))) pp.push(llAt(row[1 + k * 2] - shift, row[2 + k * 2]));
			}
			const ph = await opts.lidar(pp, log);
			// szyna toru z mapy przy peronie (do 15 m od środka): z torów w pobliżu ten, którego poziom pasuje do pomiaru
			// powierzchni peronu (stacje wielopoziomowe); bez torów – niweleta
			const railNear = (cs, cd, v) => {
				let best = null, bd = Infinity;
				env.t.forEach((row, i) => {
					const m = (row.length - 1) / 2, z = env.th[i];
					for (let k = 0; k + 1 < m; k++) {
						const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2];
						if (Math.max(sa, sb) < cs - 10 || Math.min(sa, sb) > cs + 10) continue;
						const ux = sb - sa, uy = db - da, L2 = ux * ux + uy * uy || 1e-9, t = Math.max(0, Math.min(1, ((cs - sa) * ux + (cd - da) * uy) / L2));
						const dist = Math.hypot(cs - sa - ux * t, cd - da - uy * t);
						if (dist > 15 || !(z[k] >= 0 && z[k + 1] >= 0)) continue;
						const rl = base + (z[k] + (z[k + 1] - z[k]) * t) / 10;
						const cost = dist + (v !== undefined ? 6 * Math.max(0, Math.abs(v - rl - 0.4) - 0.6) : 0);
						if (cost < bd) { bd = cost; best = rl; }
					}
				});
				return best !== null && Math.abs(cd) > 12 ? best : railAbs(cs - shift);
			};
			env.ph = meta.map(([cs, cd, i0], q) => {
				const i1 = q + 1 < meta.length ? meta[q + 1][2] : pp.length;
				const v = ph.slice(i0, i1).filter(Number.isFinite).sort((x, y) => x - y);
				if (!v.length) return -1;
				const rail = railNear(cs, cd, v[v.length >> 1]);
				if (!Number.isFinite(rail)) return -1;
				const rel = v[v.length >> 1] - rail;
				// wyraźnie niżej niż tory w pobliżu (inny poziom stacji, tory dolnego poziomu poza danymi) – zmierzona powierzchnia
				if (rel < -1.5) {
					if (opts.debug) log(`[debug] peron km ${((cs - shift) / 1000).toFixed(2)} d ${cd.toFixed(0)}: ${rel.toFixed(2)} m względem torów – na zmierzonej powierzchni`);
					return Math.round((v[v.length >> 1] - base) * 10);
				}
				const hh = rel >= 0.3 && rel <= 1.25 ? [0.55, 0.76, 0.96].reduce((x, y) => (Math.abs(y - rel) < Math.abs(x - rel) ? y : x)) : 0.76;
				if (opts.debug) log(`[debug] peron km ${((cs - shift) / 1000).toFixed(2)} d ${cd.toFixed(0)}: pomiar ${rel.toFixed(2)} m nad szyną → ${hh} m (szyna ${rail.toFixed(1)} m n.p.m.)`);
				return Math.round((rail + hh - base) * 10);
			});
			if (opts.surface) {
				try {
					await measurePlatforms();
				} catch (e) {
					log(`Perony z pomiaru pominięte (${e.message}).`);
				}
				try {
					await surfaceFromNmpt(H, DC, rowS, base);
				} catch (e) {
					log(`NMPT niedostępny (${e.message}) – budynki, drzewa i wiadukty z danych OSM.`);
				}
			}
		} else if (env && opts.dem) {
			const DS = 100, DD = 60, NC = 11, D0 = -300;
			const rowS = [];
			for (let s2 = 0; s2 <= endS; s2 += DS) rowS.push(s2);
			const ll = [];
			for (const s2 of rowS) {
				const k = Math.min(n - 2, Math.round(s2 / STEP)), a = pts[k], bb = pts[k + 1], L = dist2(a, bb) || 1;
				const ux = (bb[0] - a[0]) / L, uy = (bb[1] - a[1]) / L;
				for (let c = 0; c < NC; c++) { const d2 = D0 + c * DD; ll.push(P.ll(a[0] + uy * d2, a[1] - ux * d2)); }
			}
			log(`Pobieram ukształtowanie terenu wokół trasy (${ll.length} punktów)…`);
			const hAll = await opts.dem(ll, log);
			const NR = rowS.length;
			const at = (A, r2, c) => A[Math.max(0, Math.min(NR - 1, r2)) * NC + Math.max(0, Math.min(NC - 1, c))];
			let H = new Float64Array(NR * NC);
			for (let r2 = 0; r2 < NR; r2++) for (let c = 0; c < NC; c++) {
				let m = Infinity;
				for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) m = Math.min(m, at(hAll, r2 + u, c + v));
				H[r2 * NC + c] = m;
			}
			// las i zabudowa z rastra zagospodarowania otoczenia
			const g = env.g, decoded = new Map();
			const kindAt = (s2, d2) => {
				const ri = Math.round((s2 - g.s0) / g.step), ci = Math.round((d2 - g.d0) / g.step);
				if (ri < 0 || ri >= g.rows.length || ci < 0 || ci >= g.cols) return 0;
				if (!decoded.has(ri)) {
					const out = [], re = /([A-Z])(\d+)/g;
					let m2;
					while ((m2 = re.exec(g.rows[ri]))) for (let q = 0; q < Number(m2[2]); q++) out.push(m2[1].charCodeAt(0) - 65);
					decoded.set(ri, out);
				}
				return decoded.get(ri)[ci] || 0;
			};
			for (let r2 = 0; r2 < NR; r2++) for (let c = 0; c < NC; c++) {
				const kd = kindAt(rowS[r2] + shift, D0 + c * DD);
				if (kd === 1 || kd === 11 || kd === 12) H[r2 * NC + c] -= 12;
				else if (kd === 5 || kd === 6 || kd === 7) H[r2 * NC + c] -= 2;
			}
			for (let it = 0; it < 2; it++) {
				const H2 = new Float64Array(NR * NC);
				for (let r2 = 0; r2 < NR; r2++) for (let c = 0; c < NC; c++) {
					let sum = 0, cnt = 0;
					for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) { sum += at(H, r2 + u, c + v); cnt++; }
					H2[r2 * NC + c] = sum / cnt;
				}
				H = H2;
			}
			let base = Infinity;
			for (const x of H) base = Math.min(base, x);
			base = Math.floor(base);
			env.dem = { s0: shift, ds: DS, d0: D0, dd: DD, cols: NC, rows: NR, base, v: Array.from(H, (x) => Math.round((x - base) * 10)) };
			let hi = -Infinity;
			for (const x of H) hi = Math.max(hi, x);
			log(`Ukształtowanie terenu: ${NR} × ${NC} punktów, wysokości ${base}–${Math.round(hi)} m n.p.m.`);
		}
		if (env && env._tz) env.tz = env._tz();
		if (env) delete env._tz;
		if (env) delete env._bTags;
		if (env) def.env = env;

		// uwagi: przebieg (odchyłka, łuki), tor (lewy, boczny), prędkości, semafory, stacje, perony
		const runsOf = (flag, minLen) => {
			const out = [];
			let a = null;
			for (let k = 0; k <= n; k++) {
				const on = k < n && flag(k);
				if (on && a === null) a = k;
				if (!on && a !== null) { if ((k - a) * STEP >= minLen) out.push([a, k - 1]); a = null; }
			}
			return out;
		};
		const inRoute = (k) => k * STEP > route[0].s - platformLength - 50 && k * STEP < route[route.length - 1].s + 40;
		for (const [a, b] of runsOf((k) => inRoute(k) && devAt[k] > 1.5, 20)) {
			let mx = 0;
			for (let k = a; k <= b; k++) mx = Math.max(mx, devAt[k]);
			issue('align', a * STEP, mx > 3 ? 'warn' : 'info', `Tor w grze odbiega od toru z mapy o ${mx.toFixed(1).replace('.', ',')} m (km ${fmtKm(S(a * STEP))}–${fmtKm(S(b * STEP))}) – ostry łuk, rozjazd albo załamanie w danych.`, 'Obejrzyj tory obok i perony w tym miejscu. Jeśli w mapie jest błąd (załamanie łamanej) – popraw dane OSM i wygeneruj ponownie; drobna odchyłka nie wymaga poprawki ("ignore").', b * STEP);
		}
		const tightSet = new Set(tightK);
		for (const [a, b] of runsOf((k) => inRoute(k) && tightSet.has(k), 20)) issue('curve', a * STEP, 'warn', `Łuk ciaśniejszy niż R 150 m (km ${fmtKm(S(a * STEP))}–${fmtKm(S(b * STEP))}) – w grze złagodzony.`, 'Zwykle to łącznica albo rozjazd w danych; sprawdź, czy przebieg nie skręca na sąsiedni tor (zob. uwagi o lewym torze / torze bocznym).', b * STEP);
		let acc = 0;
		const edgeRuns = { left: [], service: [], speed: [] };
		for (const e of path.edges) {
			const t = e.w.tags;
			for (const [key, on] of [['left', e.leftTrack], ['service', t.service && t.service !== 'crossover'], ['speed', !speedOf(t)]]) {
				const R0 = edgeRuns[key], last = R0[R0.length - 1];
				if (on) { if (last && acc - last[1] < 30) last[1] = acc + e.L; else R0.push([acc, acc + e.L]); }
			}
			acc += e.L;
		}
		const clipR = ([a, b]) => [Math.max(a, route[0].s - 100), Math.min(b, route[route.length - 1].s)];
		for (const r0 of edgeRuns.left) {
			const [a, b] = clipR(r0);
			if (b - a >= 300) issue('left', a, 'info', `Przebieg lewym torem (km ${fmtKm(S(a))}–${fmtKm(S(b))}) – obok, po prawej, biegnie drugi tor.`, `Tor wybiera generator (ruch prawostronny, numer linii). Jeśli to błąd: wygeneruj z innym --line albo sprawdź w OSM numery linii (ref) torów; jeśli to celowe (np. jednotorowy odcinek): "ignore": ["left@${Math.round(S(a))}"].`, b);
		}
		for (const r0 of edgeRuns.service) {
			const [a, b] = clipR(r0);
			if (b - a >= 80) issue('service', a, 'warn', `Przebieg torem bocznym lub stacyjnym (service) na ${Math.round(b - a)} m (km ${fmtKm(S(a))}).`, 'Zwykle tor główny ma przerwę w danych (brak połączenia). Popraw połączenie torów w OSM albo wygeneruj z --line; jeśli przebieg jest właściwy – "ignore".', b);
		}
		for (const r0 of edgeRuns.speed) {
			const [a, b] = clipR(r0);
			if (b - a >= 300) issue('speed', a, 'info', `Brak prędkości (maxspeed) w danych na ${(b - a) / 1000 < 1 ? Math.round(b - a) + ' m' : ((b - a) / 1000).toFixed(1).replace('.', ',') + ' km'} – przyjęto prędkość z sąsiedniego odcinka.`, `Prędkość ręcznie: "limits": [[${S(a)}, 80]] (pozycja, km/h).`, b);
		}
		if (added) issue('signals', route[0].s, 'info', `Uzupełniono ${added} semaforów odstępowych bez nazw (mało sygnalizacji w danych).`, 'Semafor ręcznie: "signals": [{ "pos": …, "name": "…", "kind": "block" }]; usunięcie: [{ "at": …, "remove": true }].');
		for (const { st, prev } of skippedSt) issue('station-skip', st.s, 'info', `Pominięto ${st.type === 'halt' ? 'przystanek' : 'stację'} „${st.name}” – mniej niż 900 m od „${prev}”.`, `Dodanie: "stations": { "add": [{ "name": "${st.name}", "pos": ${S(st.s)}, "type": "halt" }] }.`);
		route.forEach((st, i) => {
			const o = def.stations[i];
			if (st.noW4) issue('stop', st.s, 'info', `„${st.name}”: brak wskaźnika W4 w danych – miejsce zatrzymania oszacowane (środek peronu).`, `Inne miejsce: "stations": { "${st.name}": { "pos": ${o.pos} } } (czoło pociągu).`);
			if (o.platform && o.platform.inferred) issue('platform', st.s, 'info', `„${st.name}”: brak peronu w danych – układ wywnioskowany z torów (${o.platform.island ? 'peron wyspowy' : o.platform.side < 0 ? 'peron z lewej' : 'peron z prawej'}).`, `Inny układ: "stations": { "${st.name}": { "platform": { "side": -1, "edge": 1.7, "width": 6, "island": false, "s0": ${o.platform.s0}, "s1": ${o.platform.s1} } } }; domyślny po prawej: "platform": null.`);
			else if (!o.platform && env && (env.t || []).some((row) => { for (let q = 1; q + 1 < row.length; q += 2) if (row[q] > o.pos - platformLength && row[q] < o.pos + 15 && row[q + 1] > 1.6 && row[q + 1] < 7.6) return true; return false; })) {
				// brak peronu w mapie, a po prawej stoi tor – peron domyślny może na niego wchodzić
				issue('platform', st.s, 'warn', `„${st.name}”: peron z prawej (domyślny) – w danych brak peronu, a po prawej leży tor; peron może na niego wchodzić.`, `Inny układ: "stations": { "${st.name}": { "platform": { "side": -1, "edge": 1.7, "width": 4.4 } } }.`);
			}
		});
		if (env && env.sw) {
			// rozjazdy krzyżowe i skrzyżowania bez typu w danych – jedna uwaga na stację (albo odcinek szlaku)
			const groups = new Map();
			for (const x of env.sw) {
				if (x[5] < 2 || x[8]) continue;
				const st = def.stations.reduce((b, q) => (Math.abs(q.pos - x[0]) < Math.abs(b.pos - x[0]) ? q : b));
				const name = Math.abs(st.pos - x[0]) < 1500 ? st.name : `szlak km ${fmtKm(Math.round(x[0] / 1000) * 1000)}`;
				if (!groups.has(name)) groups.set(name, []);
				groups.get(name).push(x);
			}
			for (const [name, list] of groups) {
				const desc = list.slice(0, 8).map((x) => {
					const nd = x[9] && (tagged.get(x[9]) || (envData && envData.elements.find((e) => e.type === 'node' && e.id === x[9])));
					const ref = nd && nd.tags && nd.tags.ref;
					return `km ${fmtKm(x[0])}${ref ? ' nr ' + ref : ''} (${x[5] === 4 ? 'przyjęto podwójny' : 'przyjęto skrzyżowanie'})`;
				}).join(', ') + (list.length > 8 ? ` i ${list.length - 8} innych` : '');
				const x0 = list[0];
				issue('slip', x0[0] - shift, 'info', `„${name}”: ${list.length} ${list.length === 1 ? 'rozjazd krzyżowy lub skrzyżowanie' : list.length % 10 >= 2 && list.length % 10 <= 4 && (list.length % 100 < 10 || list.length % 100 >= 20) ? 'rozjazdy krzyżowe lub skrzyżowania' : 'rozjazdów krzyżowych lub skrzyżowań'} bez typu w danych – ${desc}.`, `Typ: "switches": [{ "at": ${x0[0]}, "d": ${x0[1]}, "type": "single", "end": 1 }] – "double" (rozjazd krzyżowy podwójny), "single" (pojedynczy; "end": 1 / −1 – po której stronie skrzyżowania są połączenia), "crossing" (skrzyżowanie bez połączeń). Najlepiej uzupełnić w OSM railway:switch=double_slip / single_slip albo railway=railway_crossing.`, list[list.length - 1][0] - shift, x0[9] ? 'node/' + x0[9] : undefined);
			}
		}
		issues.sort((a, b) => a.pos - b.pos);
		def.issues = issues;
		if (opts.fixes) def.fixes = opts.fixes;
		const nw = issues.filter((x) => x.lvl === 'warn').length;
		log(`Uwagi generatora: ${issues.length} (do sprawdzenia: ${nw}). Poprawki w pliku trasy (fixes) lub --fixes plik.json.`);
		// najkrótszy prawdziwy peron ogranicza długość składu
		const realLens = def.stations.filter((x) => x.platform && !x.platform.inferred).map((x) => x.platform.s1 - x.platform.s0);
		if (realLens.length) def.platformLength = Math.max(120, Math.min(400, Math.round(Math.min(...realLens))));
		/* perony z wykazu PKP PLK (2.18): wysokość (mediana krawędzi stacji), długość użytkowa, liczba peronów; peron
		   z pomiaru krótszy niż w wykazie – wydłużony od strony wjazdu; długość składu – najkrótszy peron z wykazu */
		if (plk) {
			const plkLens = [];
			for (const o of def.stations) {
				const recs = plk.platforms.filter((q) => normName(q.name) === normName(o.name));
				if (!recs.length) continue;
				const hs = recs.map((q) => q.h).sort((a, b) => a - b), h = hs[hs.length >> 1];
				const ls = recs.map((q) => Math.max(q.len.N || 0, q.len.P || 0)).filter((x) => x > 0).sort((a, b) => a - b), len = ls.length ? ls[ls.length >> 1] : null;
				const PL = o.platform || (o.platform = { side: 1, edge: 1.72, width: 6.5, inferred: true });
				PL.h = Math.round(h * 100) / 100;
				PL.plk = { h, len, n: new Set(recs.map((q) => q.no)).size };
				if (len) {
					plkLens.push(len);
					const s1 = PL.s1 !== undefined ? PL.s1 : o.pos + 15;
					if (PL.s0 === undefined || s1 - PL.s0 < len - 5) { PL.s0 = Math.round(s1 - len); PL.s1 = Math.round(s1); }
				}
				log(`Perony PKP PLK – ${o.name}: ${PL.plk.n} ${PL.plk.n === 1 ? 'peron' : 'perony'}, wysokość ${h.toFixed(2)} m${len ? `, długość ${len} m` : ''}.`);
			}
			if (plkLens.length) def.platformLength = Math.max(120, Math.min(400, Math.round(Math.min(...plkLens))));
			def.source += ', PKP PLK (Regulamin sieci)';
		}
		/* horyzont z prawdziwego terenu (js/horizon-data.js): powiązanie układu gry z mapą (punkty przebiegu co ok. 1 km)
		   i sylwetka terenu do 60 km z siatki wysokości co 4 km (opts.horizonElev – Open-Meteo); błąd – trasa bez
		   horyzontu (pagórki) */
		if (opts.horizonElev) {
			try {
				const RT = (typeof globalThis !== 'undefined' && globalThis.TrainRoutes) || (isNode ? require('./routes.js') : null);
				const HD = (typeof globalThis !== 'undefined' && globalThis.TrainHorizonData) || (isNode ? require('./horizon-data.js') : null);
				if (RT && HD) {
					const prep = RT.prepare(def), tp = {}, pairs = [];
					for (let k = 0; k < n; k += 50) {
						const s2 = S(k * STEP);
						if (s2 > prep.length) break;
						RT.trackPoint(prep, s2, tp);
						const ll = P.ll(pts[k][0], pts[k][1]);
						pairs.push([[tp.x, tp.z], [ll.lat, ll.lon]]);
					}
					const geo = HD.fitGeo(pairs);
					def.geo = { lat0: geo.lat0, lon0: geo.lon0, c: +geo.c.toFixed(6), s: +geo.s.toFixed(6), flip: geo.flip, tx: Math.round(geo.tx), ty: Math.round(geo.ty) };
					const g = HD.gridPoints(HD.bounds(prep, geo), 4000);
					log(`Horyzont: wysokości terenu do 60 km wokół trasy (${g.pts.length} punktów)…`);
					const vals = await opts.horizonElev(g.pts, log);
					def.horizon = HD.compute(prep, geo, HD.gridSampler(g, vals));
					const max = Math.max(...def.horizon.anchors.flatMap((a) => a.slice(1))) / 100;
					log(`Horyzont: ${def.horizon.anchors.length} profili, najwyżej ${max.toFixed(1)}° nad poziomem.`);
				}
			} catch (e) {
				log(`Horyzont: nie udało się (${e.message}) – trasa z pagórkami w tle.`);
			}
		}
		log(`Gotowe: ${def.title}, ${lengthKm.toFixed(1)} km, ${route.length} stacji, ${signals.length} semaforów, ${bridges.length} mostów/wiaduktów.`);
		return def;
	}

	// pełny przebieg: wyszukanie stacji, pobranie korytarza, budowa
	async function generate(opts) {
		const log = opts.log || (() => {});
		log(`Szukam stacji „${opts.from}” i „${opts.to}”…`);
		const found = await findStations([opts.from, opts.to], log);
		const a = found.find((s) => s.name === opts.from), b = found.find((s) => s.name === opts.to);
		if (!a) throw new Error(`Nie znaleziono stacji „${opts.from}” – wpisz nazwę dokładnie jak na rozkładzie (z polskimi znakami).`);
		if (!b) throw new Error(`Nie znaleziono stacji „${opts.to}” – wpisz nazwę dokładnie jak na rozkładzie (z polskimi znakami).`);
		const P = projector(a.lat, a.lon);
		const d = dist2(P.xy(a.lat, a.lon), P.xy(b.lat, b.lon));
		if (d > 70000) throw new Error(`Stacje są za daleko od siebie (${Math.round(d / 1000)} km w linii prostej, maksymalnie 70 km).`);
		if (d < 2000) throw new Error('Stacje są zbyt blisko siebie.');
		// otoczenie domyślnie włączone (opts.environment === false – sama trasa)
		const environment = opts.environment === false ? null : opts.envFetch || ((poly, l) => fetchEnvironment(poly, l));
		const dem = opts.dem === false || !environment ? null : opts.dem || ((pts, l) => elevations(pts, l));
		const lidar = opts.lidar === false ? null : opts.lidar || ((pts, l) => nmtHeights(pts, l, nmtCache));
		// oficjalne źródła (js/gen/sources.js): BDOT10k (otoczenie), PKP PLK (prędkości, kilometraż, perony)
		const SRC = (typeof globalThis !== 'undefined' && globalThis.TrainSources) || (isNode ? require('./gen/sources.js') : null);
		const bdot = opts.bdot === false || !environment || !SRC ? null : opts.bdot || ((pts, l) => SRC.bdotForRoute(pts, { log: l, cache: opts.fileCache }));
		const plk = opts.plk === false || !SRC ? null : opts.plk || ((l) => SRC.plkData({ log: l, cache: opts.fileCache }));
		const horizonElev = opts.horizon === false ? null : opts.horizonElev || ((pts, l) => elevations(pts, l));
		const build = (data) => buildRoute(data, Object.assign({}, opts, { elevation: (pts, l) => elevations(pts, l), environment, dem, lidar, bdot, plk, horizonElev }));
		let data = await fetchCorridor(a, b, log, opts.line);
		if (opts.onData) opts.onData(data);
		if (!opts.line) return build(data);
		try {
			return await build(data);
		} catch (e) {
			// tory linii nie łączą się po drodze (np. inny numer na odcinku) – pełny obszar
			if (!/połączyć/.test(e.message)) throw e;
			log('Tory linii nie tworzą ciągłego przebiegu – pobieram wszystkie tory w obszarze…');
			data = await fetchCorridor(a, b, log, null);
			if (opts.onData) opts.onData(data);
			return build(data);
		}
	}

	const nmtCache = new Map();
	return { generate, buildRoute, buildEnvironment, findStations, fetchCorridor, fetchEnvironment, fetchMasts, fetchStreetExtras, fetchPois, elevations, nmtHeights, nmptSampler, to1992, SOURCE, ROAD_TYPES };
});
