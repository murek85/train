/* Oficjalne źródła danych dla generatora tras (Node i przeglądarka):
   - BDOT10k (GUGiK, Baza Danych Obiektów Topograficznych): budynki z liczbą kondygnacji i funkcją, jezdnie z klasą,
     szerokością i położeniem (most/wiadukt, tunel), lasy (liściasty/iglasty/mieszany), zabudowa, uprawy, wody –
     paczki powiatowe GML (ZIP); powiaty wzdłuż trasy z usługi ULDK (GUGiK). Obiekty zamieniane na obiekty
     w formacie OpenStreetMap (te same znaczniki), więc generator przetwarza je jak dane z mapy.
   - PKP PLK, Regulamin sieci (załączniki XLSX): 2.1 prędkości maksymalne (linia, tor, km), 2.6 posterunki ruchu
     (stacje i przystanki z kilometrażem), 2.12 sieć trakcyjna, 2.18 perony (wysokość, długość, tor).
   W przeglądarce usługi bez nagłówków CORS idą przez pośrednika serwera gry (server.js: /proxy/opendata/…,
   /proxy/plk/…). Dane: © GUGiK (BDOT10k, ULDK), © PKP Polskie Linie Kolejowe S.A. (Regulamin sieci). */
(function (root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.TrainSources = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
	'use strict';
	const isNode = typeof window === 'undefined' && typeof importScripts !== 'function';
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const UA = 'maszynista-route-generator/0.1';

	// ---------- pobieranie (pośrednik w przeglądarce) ----------
	const PROXY = [
		['https://opendata.geoportal.gov.pl/', 'proxy/opendata/'],
		['https://www.plk-sa.pl/', 'proxy/plk/'],
	];
	function viaProxy(url) {
		if (isNode) return url;
		for (const [a, b] of PROXY) if (url.startsWith(a)) return b + url.slice(a.length);
		return url;
	}
	async function fetchBytes(url, ms) {
		let last = null;
		for (let attempt = 0; attempt < 4; attempt++) {
			try {
				const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
				const kill = ctrl ? setTimeout(() => ctrl.abort(), ms || 300000) : null;
				const res = await fetch(viaProxy(url), Object.assign({ headers: isNode ? { 'User-Agent': UA } : {} }, ctrl ? { signal: ctrl.signal } : {}));
				if (kill) clearTimeout(kill);
				if (res.ok) return new Uint8Array(await res.arrayBuffer());
				last = new Error(`HTTP ${res.status}`);
				if (res.status === 404) break;
			} catch (e) { last = e; }
			await sleep(2000 * (attempt + 1));
		}
		throw new Error(`Nie udało się pobrać ${url.replace(/^https?:\/\//, '').slice(0, 80)} (${last ? last.message : 'błąd'})`);
	}
	const utf8 = (b) => new TextDecoder('utf-8').decode(b);

	// ---------- ZIP (centralny katalog, deflate) ----------
	async function inflateRaw(data) {
		if (isNode) return new Uint8Array(require('zlib').inflateRawSync(Buffer.from(data.buffer, data.byteOffset, data.byteLength)));
		const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	}
	// pliki archiwum, których nazwa spełnia want(name): { nazwa: Uint8Array }
	async function unzip(bytes, want) {
		const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		let eocd = -1;
		for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
		if (eocd < 0) throw new Error('uszkodzone archiwum ZIP');
		const n = dv.getUint16(eocd + 10, true);
		let p = dv.getUint32(eocd + 16, true);
		const out = {};
		for (let k = 0; k < n; k++) {
			const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
			const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), cmtLen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
			const name = utf8(bytes.subarray(p + 46, p + 46 + nameLen));
			p += 46 + nameLen + extraLen + cmtLen;
			if (!want(name)) continue;
			const off = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
			const data = bytes.subarray(off, off + csize);
			out[name] = method === 0 ? data : await inflateRaw(data);
		}
		return out;
	}

	// ---------- PL-1992 (EPSG:2180): odwzorowanie Gaussa-Krügera, GRS80, południk 19°, skala 0,9993 ----------
	const A = 6378137, F = 1 / 298.257222101, E2 = 2 * F - F * F, EP2 = E2 / (1 - E2), K0 = 0.9993, L0 = (19 * Math.PI) / 180;
	// [x – północ, y – wschód] z (lat, lon)
	function to1992(lat, lon) {
		const phi = (lat * Math.PI) / 180, Aa = ((lon * Math.PI) / 180 - L0) * Math.cos(phi);
		const sn = Math.sin(phi), N = A / Math.sqrt(1 - E2 * sn * sn), T = Math.tan(phi) ** 2, C = EP2 * Math.cos(phi) ** 2;
		const e4 = E2 * E2, e6 = e4 * E2;
		const M = A * ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi - ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) - ((35 * e6) / 3072) * Math.sin(6 * phi));
		const x = K0 * (M + N * Math.tan(phi) * ((Aa * Aa) / 2 + ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6) / 720));
		const y = K0 * N * (Aa + ((1 - T + C) * Aa ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5) / 120);
		return [x - 5300000, y + 500000];
	}
	// (lat, lon) z x (północ), y (wschód)
	function from1992(x, y) {
		const e4 = E2 * E2, e6 = e4 * E2;
		const M = (x + 5300000) / K0, mu = M / (A * (1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
		const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
		const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
		const s1 = Math.sin(phi1), c1 = Math.cos(phi1), t1 = Math.tan(phi1);
		const C1 = EP2 * c1 * c1, T1 = t1 * t1, N1 = A / Math.sqrt(1 - E2 * s1 * s1), R1 = (A * (1 - E2)) / (1 - E2 * s1 * s1) ** 1.5, D = (y - 500000) / (N1 * K0);
		const lat = phi1 - ((N1 * t1) / R1) * ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
		const lon = L0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / c1;
		return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
	}

	// ---------- BDOT10k ----------
	const ULDK = 'https://uldk.gugik.gov.pl/';
	// powiaty (TERYT, 4 cyfry) w punktach {lat, lon} – usługa ULDK (GUGiK), po 4 zapytania naraz
	async function countiesAt(points, log) {
		const out = new Set();
		let next = 0;
		const worker = async () => {
			while (next < points.length) {
				const p = points[next++], [x, y] = to1992(p.lat, p.lon);
				for (let attempt = 0; attempt < 3; attempt++) {
					try {
						const res = await fetch(`${ULDK}?request=GetCountyByXY&xy=${y.toFixed(1)},${x.toFixed(1)}&result=teryt`, isNode ? { headers: { 'User-Agent': UA } } : {});
						const t = (await res.text()).trim().split('\n');
						if (t[0] === '0' && /^\d{4}$/.test((t[1] || '').trim())) out.add(t[1].trim());
						break;
					} catch (e) { await sleep(1500); }
				}
			}
		};
		await Promise.all([worker(), worker(), worker(), worker()]);
		if (log) log(`Powiaty wzdłuż trasy (ULDK): ${[...out].join(', ') || 'brak'}.`);
		return [...out];
	}
	const bdotUrl = (teryt) => `https://opendata.geoportal.gov.pl/bdot10k/schemat2021/${teryt.slice(0, 2)}/${teryt}_GML.zip`;

	const CLASSES = ['BUBD_A', 'SKJZ_L', 'PTLZ_A', 'PTZB_A', 'PTTR_A', 'PTUT_A', 'PTWP_A', 'PTNZ_A', 'PTGN_A', 'PTRK_A', 'PTSO_A', 'PTWZ_A', 'SWRS_L', 'SWKN_L', 'SWRM_L', 'BUSP_A'];
	const field = (f, tag) => { const m = f.match(new RegExp(`<ot:${tag}(?:\\s[^>]*)?>([^<]*)</ot:${tag}>`)); return m ? m[1].trim() : null; };
	const fields = (f, tag) => [...f.matchAll(new RegExp(`<ot:${tag}(?:\\s[^>]*)?>([^<]*)</ot:${tag}>`, 'g'))].map((m) => m[1].trim());
	// geometria: obszar – zewnętrzny pierścień, linia – kolejne odcinki; współrzędne GML: wschód, północ
	function geom(f, area) {
		const parts = [];
		const src = area ? (f.match(/<gml:exterior>[\s\S]*?<\/gml:exterior>/) || [''])[0] : f;
		for (const m of src.matchAll(/<gml:posList[^>]*>([^<]*)<\/gml:posList>/g)) {
			const v = m[1].trim().split(/\s+/).map(Number);
			for (let i = 0; i + 1 < v.length; i += 2) parts.push([v[i], v[i + 1]]);
			if (area) break;
		}
		return parts;
	}
	const ROAD = { autostrada: 'motorway', 'droga ekspresowa': 'trunk', 'droga główna ruchu przyśpieszonego': 'primary', 'droga główna': 'secondary', 'droga zbiorcza': 'tertiary', 'droga lokalna': 'unclassified', 'droga dojazdowa': 'residential', 'droga wewnętrzna': 'service' };
	// znaczniki OSM dla obiektu BDOT10k (null – pomijany)
	function tagsOf(cls, f) {
		const t = { 'source:bdot': '1' };
		const rodzaj = field(f, 'rodzaj') || '';
		if (cls === 'BUBD_A') {
			if (field(f, 'kategoriaIstnienia') && field(f, 'kategoriaIstnienia') !== 'eksploatowany') return null;
			const og = field(f, 'funkcjaOgolnaBudynku') || '', pf = field(f, 'przewazajacaFunkcjaBudynku') || '', all = fields(f, 'funkcjaSzczegolowaBudynku').join(' ') + ' ' + pf;
			let b = 'yes';
			if (/dworzec kolejowy|budynek dworca/.test(all)) b = 'train_station';
			else if (/kościół|cerkiew|świątynia/.test(all)) b = 'church';
			else if (/kaplica/.test(all)) b = 'chapel';
			else if (/garaż|parking wielopoziomowy/.test(pf)) b = /parking/.test(pf) ? 'parking' : 'garage';
			else if (/budynek gospodarczy/.test(pf)) b = 'shed';
			else if (/stacja transformatorowa|stacja pomp/.test(pf)) b = 'transformer_tower';
			else if (/jednorodzinny|letniskowy/.test(pf)) b = 'house';
			else if (/wielorodzinny|zbiorowego zamieszkania/.test(pf)) b = 'apartments';
			else if (/dom studencki|bursa|internat/.test(pf)) b = 'dormitory';
			else if (/hangar/.test(pf)) b = 'hangar';
			else if (/przemysłowe/.test(og)) b = 'industrial';
			else if (/magazyn/.test(og)) b = 'warehouse';
			else if (/rolnictwa/.test(og)) b = 'farm_auxiliary';
			else if (/handlowo/.test(og)) b = 'retail';
			else if (/biurowe/.test(og)) b = 'office';
			else if (/oświaty|nauki|kultury|sportowe/.test(og)) b = /sport|gimnastyczna/.test(pf) ? 'sports_hall' : 'school';
			else if (/szpitali|zdrowotnej/.test(og)) b = 'hospital';
			else if (/zakwaterowania/.test(og)) b = 'hotel';
			else if (/transportu/.test(og)) b = 'transportation';
			else if (/mieszkalne/.test(og)) b = 'residential';
			t.building = b;
			// funkcje szczegółowe i przeważająca (rodzaj budynku w grze: policja, poczta, szkoła…) oraz nazwa
			t['bdot:use'] = (pf + '; ' + all).toLowerCase();
			const nm = field(f, 'nazwa');
			if (nm) t.name = nm;
			const lv = field(f, 'liczbaKondygnacji');
			if (lv && Number(lv) > 0) t['building:levels'] = lv;
			return t;
		}
		if (cls === 'SKJZ_L') {
			if (field(f, 'kategoriaIstnienia') && field(f, 'kategoriaIstnienia') !== 'eksploatowany') return null;
			t.highway = ROAD[field(f, 'klasaDrogi') || ''] || 'service';
			const w = Number(field(f, 'szerokoscNawierzchni'));
			if (w > 0) t.width = String(w);
			const pol = field(f, 'polozenie') || '';
			if (/ponad/.test(pol)) { t.bridge = 'yes'; t.layer = '1'; } else if (/pod powierzchni/.test(pol)) { t.tunnel = 'yes'; t.layer = '-1'; }
			const sur = field(f, 'materialNawierzchni') || '';
			if (/grunt|żwir|tłucz/.test(sur)) t.surface = 'unpaved';
			else if (/kostka kamienna|bruk/.test(sur)) t.surface = 'sett';
			else if (/kostka|płyt|beton/.test(sur)) t.surface = 'paving_stones';
			const lanes = Number(field(f, 'liczbaPasowRuchu'));
			if (lanes > 0) t.lanes = String(lanes);
			return t;
		}
		if (cls === 'PTLZ_A') {
			t.landuse = 'forest';
			const k = field(f, 'kategoria') || '';
			t.leaf_type = /liściasty/.test(k) ? 'broadleaved' : /iglasty/.test(k) ? 'needleleaved' : 'mixed';
			return t;
		}
		if (cls === 'PTZB_A') { t.landuse = /handlowo/.test(rodzaj) ? 'commercial' : /przemysłowo/.test(rodzaj) ? 'industrial' : 'residential'; return t; }
		if (cls === 'PTTR_A') { t.landuse = /uprawa/.test(rodzaj) ? 'farmland' : 'grass'; return t; }
		if (cls === 'PTUT_A') { t.landuse = /działkowe/.test(rodzaj) ? 'allotments' : /sad/.test(rodzaj) ? 'orchard' : 'plant_nursery'; return t; }
		if (cls === 'PTWP_A') { t.natural = 'water'; return t; }
		if (cls === 'PTNZ_A') { t.landuse = 'industrial'; return t; }
		if (cls === 'PTGN_A') { t.landuse = 'brownfield'; return t; }
		if (cls === 'PTRK_A') { t.natural = 'scrub'; return t; }
		if (cls === 'PTSO_A') { t.landuse = 'landfill'; return t; }
		if (cls === 'PTWZ_A') { t.landuse = 'quarry'; return t; }
		if (cls === 'BUSP_A') { t.leisure = /zabaw/.test(rodzaj) ? 'playground' : 'pitch'; return t; }
		if (cls === 'SWRS_L' || cls === 'SWKN_L' || cls === 'SWRM_L') {
			t.waterway = cls === 'SWKN_L' ? 'canal' : cls === 'SWRM_L' ? 'ditch' : /rzeka/.test(rodzaj) ? 'river' : 'stream';
			/* ciek pod ziemią (przepust, kolektor) albo „sztuczny łącznik” – odcinek dorysowany dla ciągłości sieci (przez
			   jezioro albo kanał zakryty; np. Kanał Kamionkowski pod torami przy Warszawie Stadion) – bez wody na powierzchni */
			if (/pod powierzchni/.test(field(f, 'polozenie') || '') || /łącznik/.test(field(f, 'cechaGeometrii') || '')) { t.tunnel = 'culvert'; t.layer = '-1'; }
			return t;
		}
		return null;
	}
	/* Obiekty BDOT10k z paczki powiatu (ZIP) jako obiekty OSM (way z geometrią w stopniach), tylko w pasie maxD od
	   punktów trasy (route: [{lat, lon}] co ok. 50 m). Zwraca { elements, counts }. */
	async function bdotElements(zipBytes, route, maxD, idBase) {
		const files = await unzip(zipBytes, (n) => CLASSES.some((c) => n.endsWith(`__OT_${c}.xml`)));
		// siatka punktów trasy (komórki 200 m) – szybkie sprawdzenie odległości
		const G = 200, grid = new Map();
		for (const p of route) {
			const [x, y] = to1992(p.lat, p.lon), k = Math.floor(y / G) + ',' + Math.floor(x / G);
			if (!grid.has(k)) grid.set(k, []);
			grid.get(k).push([y, x]);
		}
		const R = Math.ceil(maxD / G) + 1, md2 = (maxD + 40) ** 2;
		const near = (e, n) => {
			const ce = Math.floor(e / G), cn = Math.floor(n / G);
			for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (const [pe, pn] of grid.get(ce + a + ',' + (cn + b)) || []) if ((pe - e) ** 2 + (pn - n) ** 2 < md2) return true;
			return false;
		};
		const elements = [], counts = {};
		let id = idBase;
		for (const [name, bytes] of Object.entries(files)) {
			const cls = CLASSES.find((c) => name.endsWith(`__OT_${c}.xml`));
			const area = cls.endsWith('_A');
			const text = utf8(bytes);
			const open = `<ot:OT_${cls}`, close = `</ot:OT_${cls}>`;
			let i = text.indexOf(open);
			while (i >= 0) {
				const j = text.indexOf(close, i);
				if (j < 0) break;
				const f = text.slice(i, j);
				i = text.indexOf(open, j);
				const g = geom(f, area);
				if (g.length < 2 || !g.some(([e, n]) => near(e, n))) continue;
				const tags = tagsOf(cls, f);
				if (!tags) continue;
				// uproszczenie: punkty bliżej niż 0,5 m od poprzedniego pomijane
				const geometry = [];
				let pe = null, pn = null;
				for (const [e, n] of g) {
					if (pe !== null && Math.hypot(e - pe, n - pn) < 0.5) continue;
					geometry.push(from1992(n, e));
					pe = e;
					pn = n;
				}
				if (geometry.length < 2) continue;
				elements.push({ type: 'way', id: id--, tags, geometry });
				counts[cls] = (counts[cls] || 0) + 1;
			}
		}
		return { elements, counts };
	}
	/* Otoczenie z BDOT10k dla trasy: powiaty (ULDK) w punktach trasy i ±maxD w poprzek, paczki (cache: async
	   get(url) / put(url, bytes) – opcjonalnie), obiekty w pasie. Zwraca { elements, counties, complete }. */
	async function bdotForRoute(route, opts) {
		const log = opts.log || (() => {}), maxD = opts.maxD || 600;
		const probe = [];
		for (let i = 0; i < route.length; i += 20) {
			const p = route[i], q = route[Math.min(route.length - 1, i + 1)], [x0, y0] = to1992(p.lat, p.lon), [x1, y1] = to1992(q.lat, q.lon);
			const L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
			for (const d of [-maxD, 0, maxD]) probe.push(from1992(x0 + nx * d, y0 + ny * d));
		}
		const counties = await countiesAt(probe, log);
		const elements = [];
		let complete = counties.length > 0, idBase = -1e9;
		for (const teryt of counties) {
			const url = bdotUrl(teryt);
			try {
				let bytes = opts.cache ? await opts.cache.get(url) : null;
				if (!bytes) {
					log(`Pobieram BDOT10k powiatu ${teryt} (GUGiK)…`);
					bytes = await fetchBytes(url, 600000);
					if (opts.cache) await opts.cache.put(url, bytes);
				}
				const { elements: el, counts } = await bdotElements(bytes, route, maxD, idBase);
				idBase -= 1e7;
				elements.push(...el);
				log(`BDOT10k ${teryt}: ${counts.BUBD_A || 0} budynków, ${counts.SKJZ_L || 0} jezdni, ${(counts.PTLZ_A || 0) + (counts.PTZB_A || 0) + (counts.PTTR_A || 0) + (counts.PTUT_A || 0) + (counts.PTWP_A || 0)} obszarów, ${(counts.SWRS_L || 0) + (counts.SWKN_L || 0) + (counts.SWRM_L || 0)} cieków.`);
			} catch (e) {
				complete = false;
				log(`BDOT10k powiatu ${teryt} niedostępny (${e.message}).`);
			}
		}
		return { elements, counties, complete };
	}

	// ---------- PKP PLK: Regulamin sieci (XLSX) ----------
	const PLK = 'https://www.plk-sa.pl';
	// wiersze arkusza (pierwszy arkusz z danymi – największy) jako tablice tekstów
	async function xlsxRows(bytes) {
		const files = await unzip(bytes, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
		const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
		const ss = files['xl/sharedStrings.xml'] ? [...utf8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))) : [];
		let best = null;
		for (const [name, b] of Object.entries(files)) if (name.includes('worksheets') && (!best || b.length > best.length)) best = b;
		const rows = [];
		for (const r of utf8(best).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
			const cells = [];
			for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
				let col = 0;
				for (const ch of c[1]) col = col * 26 + ch.charCodeAt(0) - 64;
				const v = (c[3] || '').match(/<v>([\s\S]*?)<\/v>/);
				let val = v ? v[1] : '';
				if (/t="s"/.test(c[2]) && val) val = ss[Number(val)] || '';
				else if (/t="inlineStr"/.test(c[2])) val = dec([...(c[3] || '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
				cells[col - 1] = dec(String(val)).trim();
			}
			rows.push(Array.from(cells, (x) => x || ''));
		}
		return rows;
	}
	// załączniki z bieżącego rozkładu jazdy (zmiana w połowie grudnia): adresy plików 2.1, 2.6, 2.12, 2.18
	async function plkAnnexUrls(log) {
		const now = new Date(), y = now.getFullYear() + (now.getMonth() === 11 && now.getDate() >= 13 ? 1 : 0);
		const page = `${PLK}/klienci-i-kontrahenci/warunki-udostepniania-infrastruktury-i-regulaminy/regulamin-sieci/regulamin-sieci-${y - 1}/${y}`;
		const html = utf8(await fetchBytes(page, 60000));
		const pick = (no) => {
			const m = html.match(new RegExp(`href="([^"]*ZAL_2\\.${no.replace('.', '\\.')}_[^"]*\\.xlsx)"`, 'i'));
			return m ? (m[1].startsWith('http') ? m[1] : PLK + (m[1].startsWith('/') ? '' : '/') + m[1]) : null;
		};
		const out = { speeds: pick('1'), posts: pick('6'), catenary: pick('12'), platforms: pick('18') };
		if (log) log(`Regulamin sieci PKP PLK ${y - 1}/${y}: załączniki ${Object.entries(out).filter(([, v]) => v).map(([k]) => k).join(', ') || 'nie znaleziono'}.`);
		return out;
	}
	const kmOf = (v) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };
	/* Dane PLK (cache jak w bdotForRoute): { speeds: [{ line, track, km0, km1, v: [ezt, wagonowe, towarowe] }],
	   posts: [{ line, kind, name, km, platform }], platforms: [{ name, kind, no, track, h (m), len: { N, P } }],
	   catenary: [{ line, track, km0, km1, type, vmax }] } */
	async function plkData(opts) {
		const log = opts.log || (() => {});
		const urls = await plkAnnexUrls(log);
		const get = async (url) => {
			if (!url) return [];
			let bytes = opts.cache ? await opts.cache.get(url) : null;
			if (!bytes) {
				bytes = await fetchBytes(url, 120000);
				if (opts.cache) await opts.cache.put(url, bytes);
			}
			return xlsxRows(bytes);
		};
		const data = { speeds: [], posts: [], platforms: [], catenary: [] };
		for (const r of await get(urls.speeds)) {
			const km0 = kmOf(r[3]), km1 = kmOf(r[4]);
			if (!/^\d+$/.test(r[0]) || km0 === null || km1 === null) continue;
			data.speeds.push({ line: r[0], track: r[2], km0, km1, v: [Number(r[5]) || 0, Number(r[6]) || 0, Number(r[7]) || 0] });
		}
		for (const r of await get(urls.posts)) {
			const km = kmOf(r[4]);
			if (!/^\d+$/.test(r[0]) || km === null) continue;
			data.posts.push({ line: r[0], kind: r[2], name: r[3], km, platform: /TAK/i.test(r[5] || '') });
		}
		for (const r of await get(urls.platforms)) {
			const h = Number(r[5]);
			if (!r[0] || !(h > 100 && h < 1500)) continue;
			const len = {}, raw = String(r[6] || '');
			const nm = raw.match(/N:\s*(\d+)/), pm = raw.match(/P:\s*(\d+)/);
			if (nm || pm) { if (nm) len.N = Number(nm[1]); if (pm) len.P = Number(pm[1]); } else if (Number(raw) > 0) len.N = len.P = Number(raw);
			data.platforms.push({ name: r[0], kind: r[1], no: r[3], track: r[4], h: h / 1000, len });
		}
		for (const r of await get(urls.catenary)) {
			const km0 = kmOf(r[3]), km1 = kmOf(r[4]);
			if (!/^\d+$/.test(r[0]) || km0 === null || km1 === null) continue;
			data.catenary.push({ line: r[0], track: r[2], km0, km1, type: r[5], vmax: Number(r[6]) || null });
		}
		log(`PKP PLK: ${data.speeds.length} odcinków prędkości, ${data.posts.length} posterunków, ${data.platforms.length} krawędzi peronowych.`);
		return data;
	}

	/* RINF (ERA, zarządca PKP PLK): pochylenia linii i tunele z wyciągu js/gen/rinf-pl.js (tools/rinf.js) – w Node przez
	   require, w przeglądarce wczytywany przy pierwszym użyciu (plik ok. 0,7 MB, nie przy starcie gry) */
	let rinfP = null;
	function rinfData() {
		const G = typeof globalThis !== 'undefined' ? globalThis : window;
		if (G.TrainRinf) return Promise.resolve(G.TrainRinf);
		if (typeof module === 'object' && module.exports && typeof require === 'function') return Promise.resolve(require('./rinf-pl.js'));
		// wątek generatora (js/gen-worker.js): ścieżka względem pliku wątku
		if (typeof importScripts === 'function') {
			try { importScripts('gen/rinf-pl.js'); } catch (e) { return Promise.reject(new Error('nie udało się wczytać danych RINF')); }
			return G.TrainRinf ? Promise.resolve(G.TrainRinf) : Promise.reject(new Error('brak danych RINF'));
		}
		if (!rinfP) rinfP = new Promise((res, rej) => {
			const sc = document.createElement('script');
			sc.src = 'js/gen/rinf-pl.js';
			sc.onload = () => (G.TrainRinf ? res(G.TrainRinf) : rej(new Error('brak danych RINF')));
			sc.onerror = () => { rinfP = null; rej(new Error('nie udało się wczytać danych RINF')); };
			document.head.appendChild(sc);
		});
		return rinfP;
	}

	return { unzip, xlsxRows, to1992, from1992, countiesAt, bdotUrl, bdotElements, bdotForRoute, plkAnnexUrls, plkData, fetchBytes, rinfData };
});
