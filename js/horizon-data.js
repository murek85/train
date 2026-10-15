/* Horyzont z prawdziwego terenu: dla tras rzeczywistych sylwetka dalekiego terenu (2,5–60 km) widziana z toru.
   Powiązanie układu gry z mapą (fitGeo): punkty trasy znane w obu układach (stacje z OSM albo punkty przebiegu
   z Generatora) → obrót (i ewentualne odbicie osi) + przesunięcie, metodą najmniejszych kwadratów. Profile (compute):
   co ok. 3 km trasy, w 180 kierunkach co 2° (w układzie gry – jak pierścień w js/3d/horizon.js: x = sin a, z = −cos a),
   największy kąt wzniesienia terenu nad oczami obserwatora, z krzywizną Ziemi (i refrakcją – współczynnik 0,87).
   Zapis w trasie: horizon = { step: 2, anchors: [[s, kąt0, kąt1, …]] } – kąty w setnych stopnia (liczby całkowite).
   Wysokości daje elevAt(lat, lon) – siatka z Open-Meteo (Generator) albo kafle terenu AWS (tools/horizon.js).
   Czysta logika – przeglądarka i Node. */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory(require('./routes.js'));
	else root.TrainHorizonData = factory(root.TrainRoutes);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R) {
	'use strict';

	const EARTH = 6371000, REFRACT = 0.87, EYE = 3;
	const KY = 110574;
	const kxAt = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

	/* pary [[gx, gz], [lat, lon]] → przekształcenie gra → mapa: { lat0, lon0, c, s, flip, tx, ty, rms } (x – wschód,
	   y – północ, metry w rzucie lokalnym wokół lat0/lon0) */
	function fitGeo(pairs) {
		const lat0 = pairs.reduce((a, p) => a + p[1][0], 0) / pairs.length, lon0 = pairs.reduce((a, p) => a + p[1][1], 0) / pairs.length;
		const kx = kxAt(lat0);
		const P = pairs.map(([[gx, gz], [lat, lon]]) => [[gx, gz], [(lon - lon0) * kx, (lat - lat0) * KY]]);
		let best = null;
		for (const flip of [1, -1]) {
			const G = P.map(([[gx, gz], p]) => [[gx, gz * flip], p]);
			const mg = [0, 0], mp = [0, 0];
			for (const [g, p] of G) { mg[0] += g[0]; mg[1] += g[1]; mp[0] += p[0]; mp[1] += p[1]; }
			mg[0] /= G.length; mg[1] /= G.length; mp[0] /= G.length; mp[1] /= G.length;
			let sxx = 0, sxy = 0;
			for (const [g, p] of G) {
				const ax = g[0] - mg[0], ay = g[1] - mg[1], bx = p[0] - mp[0], by = p[1] - mp[1];
				sxx += ax * bx + ay * by;
				sxy += ax * by - ay * bx;
			}
			const th = Math.atan2(sxy, sxx), c = Math.cos(th), s = Math.sin(th);
			const tx = mp[0] - (c * mg[0] - s * mg[1]), ty = mp[1] - (s * mg[0] + c * mg[1]);
			let e = 0;
			for (const [g, p] of G) e += (c * g[0] - s * g[1] + tx - p[0]) ** 2 + (s * g[0] + c * g[1] + ty - p[1]) ** 2;
			const rms = Math.sqrt(e / G.length);
			if (!best || rms < best.rms) best = { lat0, lon0, c, s, flip, tx, ty, rms };
		}
		return best;
	}
	// punkt gry (x, z) → { lat, lon }
	function toLatLon(geo, gx, gz) {
		const x = geo.c * gx - geo.s * gz * geo.flip + geo.tx, y = geo.s * gx + geo.c * gz * geo.flip + geo.ty;
		return { lat: geo.lat0 + y / KY, lon: geo.lon0 + x / kxAt(geo.lat0) };
	}
	// kierunek w grze (dx, dz) → kierunek na mapie (wschód, północ)
	function dirToMap(geo, dx, dz) { return [geo.c * dx - geo.s * dz * geo.flip, geo.s * dx + geo.c * dz * geo.flip]; }

	const DISTS = [];
	for (let d = 2500; d < 10000; d += 500) DISTS.push(d);
	for (let d = 10000; d < 30000; d += 1000) DISTS.push(d);
	for (let d = 30000; d <= 60000; d += 2000) DISTS.push(d);
	const MAXD = 60000;

	// prostokąt (lat/lon) obejmujący trasę i 60 km wokół – do pobrania wysokości
	function bounds(route, geo) {
		let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
		const tp = {};
		for (let s = 0; s <= route.length; s += 500) {
			R.trackPoint(route, s, tp);
			const p = toLatLon(geo, tp.x, tp.z);
			a = Math.min(a, p.lat); b = Math.max(b, p.lat); c = Math.min(c, p.lon); d = Math.max(d, p.lon);
		}
		const dl = (MAXD + 3000) / KY, dn = (MAXD + 3000) / kxAt((a + b) / 2);
		return { latMin: a - dl, latMax: b + dl, lonMin: c - dn, lonMax: d + dn };
	}

	/* profile horyzontu: route – trasa po R.prepare, geo – fitGeo, elevAt(lat, lon) – wysokość terenu [m n.p.m.] */
	function compute(route, geo, elevAt, opts = {}) {
		const step = opts.anchorStep || 3000, az = 180;
		const st = route.stations, s0 = st[0].pos, s1 = st[st.length - 1].pos;
		const ss = [];
		for (let s = s0; s < s1; s += step) ss.push(Math.round(s));
		ss.push(Math.round(s1));
		const tp = {}, anchors = [];
		for (const s of ss) {
			R.trackPoint(route, s, tp);
			const o = toLatLon(geo, tp.x, tp.z);
			const h0 = elevAt(o.lat, o.lon);
			if (!Number.isFinite(h0)) continue;
			const eye = h0 + EYE, kx = kxAt(o.lat), row = [s];
			for (let k = 0; k < az; k++) {
				const a = (k * 2 * Math.PI) / az;
				const [ex, ny] = dirToMap(geo, Math.sin(a), -Math.cos(a));
				let best = -0.05;
				for (const d of DISTS) {
					const h = elevAt(o.lat + (ny * d) / KY, o.lon + (ex * d) / kx);
					if (!Number.isFinite(h)) continue;
					const drop = (d * d) / (2 * EARTH) * REFRACT;
					best = Math.max(best, Math.atan2(h - drop - eye, d));
				}
				row.push(Math.round((best * 180 / Math.PI) * 100));
			}
			anchors.push(row);
		}
		return { step: 360 / az, anchors };
	}

	// kąty wzniesienia (radiany, az wartości) w miejscu s – liniowo między najbliższymi punktami profilu
	function sample(h, s, out) {
		const A = h.anchors;
		let i = 0;
		while (i < A.length - 2 && A[i + 1][0] < s) i++;
		const a = A[i], b = A[Math.min(A.length - 1, i + 1)];
		const t = b[0] > a[0] ? Math.max(0, Math.min(1, (s - a[0]) / (b[0] - a[0]))) : 0;
		const n = a.length - 1;
		for (let k = 0; k < n; k++) out[k] = ((a[k + 1] + (b[k + 1] - a[k + 1]) * t) / 100) * (Math.PI / 180);
		return out;
	}

	/* siatka wysokości z punktów (Open-Meteo): bounds → punkty co `cell` m; values – wysokości w tej kolejności → elevAt
	   (dwuliniowo) */
	function gridPoints(b, cell) {
		const latMid = (b.latMin + b.latMax) / 2, dLat = cell / KY, dLon = cell / kxAt(latMid);
		const ny = Math.ceil((b.latMax - b.latMin) / dLat) + 1, nx = Math.ceil((b.lonMax - b.lonMin) / dLon) + 1;
		const pts = [];
		for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push({ lat: b.latMin + j * dLat, lon: b.lonMin + i * dLon });
		return { pts, nx, ny, dLat, dLon, b };
	}
	function gridSampler(g, values) {
		return (lat, lon) => {
			const fx = (lon - g.b.lonMin) / g.dLon, fy = (lat - g.b.latMin) / g.dLat;
			const i = Math.floor(fx), j = Math.floor(fy);
			if (i < 0 || j < 0 || i >= g.nx - 1 || j >= g.ny - 1) return NaN;
			const u = fx - i, v = fy - j, at = (x, y) => values[y * g.nx + x];
			return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
		};
	}

	/* horyzont dla gotowej trasy (np. wygenerowanej przed wersją z horyzontem): powiązanie z mapą – def.geo albo stacje
	   wyszukane w OSM (api.findStations; przy kilku węzłach o tej samej nazwie – najbliższy dopasowaniu z jednoznacznych),
	   wysokości – siatka co 4 km (api.elevations – Open-Meteo). Wynik: { geo (do zapisu w trasie), horizon, n – stacje } */
	async function forRoute(def, api) {
		const log = api.log || (() => {});
		const route = R.prepare(def), tp = {};
		let geo = def.geo, n = 0;
		if (!geo) {
			const found = await api.findStations(route.stations.map((s) => s.name), log);
			const game = route.stations.map((s) => { R.trackPoint(route, s.pos, tp); return [tp.x, tp.z]; });
			const cand = route.stations.map((s) => found.filter((x) => x.name === s.name));
			const uniq = cand.map((c, i) => (c.length === 1 ? [game[i], [c[0].lat, c[0].lon]] : null)).filter(Boolean);
			if (uniq.length < 2) throw new Error('za mało stacji odnalezionych na mapie (potrzeba co najmniej dwóch)');
			let g0 = fitGeo(uniq);
			const pairs = [];
			cand.forEach((c, i) => {
				let best = null;
				for (const x of c) {
					const p = toLatLon(g0, game[i][0], game[i][1]);
					const d = Math.hypot((p.lat - x.lat) * KY, (p.lon - x.lon) * kxAt(x.lat));
					if (!best || d < best.d) best = { d, x };
				}
				if (best && best.d < 1500) pairs.push([game[i], [best.x.lat, best.x.lon]]);
			});
			if (pairs.length < 2) throw new Error('stacje na mapie nie pasują do przebiegu trasy');
			g0 = fitGeo(pairs);
			n = pairs.length;
			log(`Dopasowanie do mapy: ${n} stacji, błąd średni ${Math.round(g0.rms)} m.`);
			geo = { lat0: g0.lat0, lon0: g0.lon0, c: +g0.c.toFixed(6), s: +g0.s.toFixed(6), flip: g0.flip, tx: Math.round(g0.tx), ty: Math.round(g0.ty) };
		}
		const g = gridPoints(bounds(route, geo), 4000);
		log(`Wysokości terenu do 60 km wokół trasy (${g.pts.length} punktów)…`);
		const vals = await api.elevations(g.pts, log);
		return { geo, horizon: compute(route, geo, gridSampler(g, vals)), n };
	}

	return { fitGeo, toLatLon, dirToMap, bounds, compute, sample, gridPoints, gridSampler, forRoute, DISTS };
});
