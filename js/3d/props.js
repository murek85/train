/* Bryły otoczenia budowane w kodzie: korony drzew z kilku brył z cieniowaniem w kolorach wierzchołków
   (ciemniej w środku i u dołu, jaśniej na czubkach), kępy trawy i kwiaty, ludzie (nogi, tułów, ręce, głowa,
   włosy), samochody (karoseria, kabina, koła z felgami, światła). Geometrie są wspólne – rysowane jako
   instancje z kolorem instancji. */
(function () {
	'use strict';
	const T = window.THREE;
	const NS = window.Train3D;
	const { hash, mat, matS, box, GEO } = NS.util;

	// sklejenie geometrii bez indeksów (pozycje, normalne, kolory wierzchołków; opcjonalnie limb – część ciała
	// do animacji – i keep – barwienie, zob. buildPeople)
	function merge(parts) {
		const pos = [], nor = [], col = [], lim = [], kp = [];
		const withLimb = parts.some((q) => q.limb !== undefined), withKeep = parts.some((q) => q.keep !== undefined);
		for (const { geo, color, limb, keep } of parts) {
			const g = geo.index ? geo.toNonIndexed() : geo;
			const p = g.attributes.position, n = g.attributes.normal;
			for (let i = 0; i < p.count; i++) {
				pos.push(p.getX(i), p.getY(i), p.getZ(i));
				nor.push(n.getX(i), n.getY(i), n.getZ(i));
				const c = typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i)) : color;
				col.push(c[0], c[1], c[2]);
				if (withLimb) lim.push(limb || 0);
				if (withKeep) kp.push(keep || 0);
			}
		}
		const out = new T.BufferGeometry();
		out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
		out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
		out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
		if (withLimb) out.setAttribute('aLimb', new T.Float32BufferAttribute(lim, 1));
		if (withKeep) out.setAttribute('aKeep', new T.Float32BufferAttribute(kp, 1));
		out.userData.shared = true;
		return out;
	}

	// szum wartości 3D (gładki) – kępy liści na powierzchni korony
	function n3(x, y, z) {
		const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
		const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
		const h = (i, j, k) => hash((xi + i) * 57.31 + (yi + j) * 113.97 + (zi + k) * 271.13);
		const l = (a2, b2, t) => a2 + (b2 - a2) * t;
		return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
	}
	/* bryła kępy liści: kula z gładkimi wybrzuszeniami (szum 3D – wcześniej losowe przesunięcia każdego wierzchołka
	   dawały kolczastą powierzchnię), spód spłaszczony jak w prawdziwych koronach; normalne gładkie jak elipsoidy,
	   lekko pochylone zgodnie z wybrzuszeniami (miękkie światło, widoczne kępy) */
	function lumpy(radius, detail, seed, squash) {
		const g = new T.IcosahedronGeometry(radius, detail);
		const p = g.attributes.position, sq = squash || 1, f = 2.2 / radius, o = seed * 0.37;
		const nrm = new Float32Array(p.count * 3);
		for (let i = 0; i < p.count; i++) {
			const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
			const nz = n3(x * f + o, y * f + o * 1.3, z * f - o) * 0.7 + n3(x * f * 2.3 - o, y * f * 2.3, z * f * 2.3 + o) * 0.3;
			const k = 0.82 + nz * 0.36;
			const yb = y < 0 ? y * 0.78 : y; // spłaszczony spód
			p.setXYZ(i, x * k, yb * k * sq, z * k);
			// normalna elipsoidy pochylona ku wybrzuszeniu (różnica szumu wzdłuż kierunku poziomego)
			const e = 0.18 * radius, dn = n3((x + e) * f + o, y * f + o * 1.3, z * f - o) - n3(x * f + o, y * f + o * 1.3, (z + e) * f - o);
			const nx = x + dn * 0.6 * radius, ny = y / (sq * sq), nz2 = z - dn * 0.6 * radius, l = Math.hypot(nx, ny, nz2) || 1;
			nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz2 / l;
		}
		g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
		return g;
	}

	/* cieniowanie korony: ciemno u dołu i w środku, jasno na górze i na brzegach (bez kierunku słońca); kępy liści
	   różnią się jasnością i odcieniem (część żółtawa, część niebieskawa) – korona nie jest jednolitą bryłą */
	const leafShade = (cy, r) => (x, y, z) => {
		const h = Math.max(0, Math.min(1, (y - cy + r) / (2 * r)));
		const edge = Math.min(1, Math.hypot(x, z) / r);
		const j = hash(Math.round(x * 9) * 3.1 + Math.round(y * 9) * 7.3 + Math.round(z * 9) * 1.9);
		const k = (0.42 + 0.42 * h + 0.24 * edge) * (0.9 + 0.2 * j);
		const t = (hash(Math.round(x * 4) * 5.7 + Math.round(y * 4) * 2.3 + Math.round(z * 4) * 8.9) - 0.5) * 0.12;
		return [k * (1 + t), k, k * (1 - t)];
	};

	/* ---- Korony z kępek liści (G5, wg zdjęć drzew): atlas faktur rysowany w kodzie (1024 × 512, 4 × 2 pola po 256 px):
	   0, 1 – kępki liści (dąb, lipa), 2 – gęste liście (rdzeń korony, bez prześwitów), 3 – drobne liście brzozy,
	   4 – gałązka świerku z igłami (od pnia w lewo do końca w prawo), 5 – pęczki igieł sosny, 6 – gęste igły (rdzeń),
	   7 – gałązki bez liści. Szarości – kolor nadaje egzemplarz (gatunek, pora roku), cieniowanie – kolory wierzchołków.
	   Zima (winter): w polach liściastych nagie gałązki (prześwitująca korona), iglaste bez zmian. ---- */
	const FOL = { cols: 4, rows: 2, mg: 0.012 };
	// współrzędne (u, v) w polu k atlasu (u, v ∈ 0…1, v = 1 – góra pola)
	function cellUV(k, u, v) {
		const col = k % FOL.cols, row = Math.floor(k / FOL.cols), m = FOL.mg;
		return [(col + m + u * (1 - 2 * m)) / FOL.cols, 1 - (row + m + (1 - v) * (1 - 2 * m)) / FOL.rows];
	}
	function foliageAtlas(winter) {
		return NS.util.canvasTexture(winter ? 'foliage-winter' : 'foliage', 1024, 512, (g) => {
			const S = 256;
			let sd = winter ? 77.7 : 11.3;
			const rnd = () => hash((sd += 1.618));
			const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
			const cell = (k, fn) => {
				const x0 = (k % 4) * S, y0 = Math.floor(k / 4) * S;
				g.save();
				g.beginPath();
				g.rect(x0 + 2, y0 + 2, S - 4, S - 4);
				g.clip();
				fn(x0, y0);
				g.restore();
			};
			// liść: elipsa z nerwem głównym
			const leaf = (x, y, L, ang, v) => {
				g.save();
				g.translate(x, y);
				g.rotate(ang);
				g.fillStyle = grey(v);
				g.beginPath();
				g.ellipse(0, 0, L / 2, L * 0.28, 0, 0, Math.PI * 2);
				g.fill();
				g.strokeStyle = grey(v * 0.72);
				g.lineWidth = Math.max(1, L * 0.06);
				g.beginPath();
				g.moveTo(-L / 2, 0);
				g.lineTo(L / 2, 0);
				g.stroke();
				g.restore();
			};
			// gałązka rozgałęziona (rekurencyjnie)
			const twig = (x, y, ang, len, w, depth, v) => {
				const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
				g.strokeStyle = grey(v);
				g.lineWidth = w;
				g.lineCap = 'round';
				g.beginPath();
				g.moveTo(x, y);
				g.lineTo(x2, y2);
				g.stroke();
				if (depth <= 0) return;
				const n = 2 + (rnd() < 0.4 ? 1 : 0);
				for (let i = 0; i < n; i++) twig(x2, y2, ang + (rnd() - 0.5) * 1.3, len * (0.62 + rnd() * 0.15), w * 0.68, depth - 1, v);
			};
			const cluster = (x0, y0, n, size, spreadK) => {
				const cx = x0 + S / 2, cy = y0 + S / 2;
				for (let i = 0; i < 5; i++) twig(cx + (rnd() - 0.5) * 30, y0 + S - 8, -Math.PI / 2 + (rnd() - 0.5) * 1.6, S * 0.22, 5, 2, 70);
				for (let i = 0; i < n; i++) {
					const a = rnd() * Math.PI * 2, r = S * spreadK * Math.sqrt(rnd());
					const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.92;
					// jaśniej u góry kępki, ciemniej u dołu i w głębi (wcześniej rysowane – pod spodem)
					const v = 105 + 150 * (0.55 * rnd() + 0.45 * (1 - (y - y0) / S)) * (i / n * 0.35 + 0.65);
					leaf(x, y, size * (0.75 + 0.5 * rnd()), rnd() * Math.PI * 2, v);
				}
			};
			// pole iglaste: gałązka z igłami (oś od lewej do prawej, lekko opadająca)
			const needles = (x, y, ang, len, v) => {
				g.strokeStyle = grey(v);
				g.lineWidth = 1.6;
				g.beginPath();
				g.moveTo(x, y);
				g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
				g.stroke();
			};
			const spray = (x0, y0) => {
				const yA = y0 + S / 2;
				const axis = (t) => [x0 + 6 + t * (S - 14), yA + t * t * 22];
				g.strokeStyle = grey(85);
				g.lineWidth = 5;
				g.beginPath();
				for (let t = 0; t <= 1.001; t += 0.05) { const [x, y] = axis(t); t ? g.lineTo(x, y) : g.moveTo(x, y); }
				g.stroke();
				// boczne gałązki na przemian, krótsze ku końcowi
				for (let t = 0.06; t < 0.95; t += 0.075) {
					const [x, y] = axis(t);
					for (const sgn of [-1, 1]) {
						const L = S * 0.36 * (1 - t * 0.6) * (0.8 + rnd() * 0.3), ang = sgn * (0.75 + rnd() * 0.25) + 0.12;
						g.strokeStyle = grey(95);
						g.lineWidth = 2.5;
						g.beginPath();
						g.moveTo(x, y);
						const xe = x + Math.cos(ang) * L, ye = y + Math.sin(ang) * L;
						g.lineTo(xe, ye);
						g.stroke();
						for (let q = 0.1; q < 1; q += 0.07) {
							const px = x + (xe - x) * q, py = y + (ye - y) * q, nl = 14 * (1 - q * 0.4);
							for (const s2 of [-1, 1]) needles(px, py, ang + s2 * 0.95 + (rnd() - 0.5) * 0.3, nl, 130 + rnd() * 120);
						}
					}
					for (const s2 of [-1, 1]) needles(x, y, s2 * 1.1 + 0.2, 16, 140 + rnd() * 110);
				}
			};
			const tufts = (x0, y0, n) => {
				for (let i = 0; i < n; i++) {
					const a = rnd() * Math.PI * 2, r = S * 0.28 * Math.sqrt(rnd());
					const cx = x0 + S / 2 + Math.cos(a) * r, cy = y0 + S / 2 + Math.sin(a) * r;
					twig(cx, cy + 20, -Math.PI / 2 + (rnd() - 0.5), 22, 4, 0, 80);
					for (let k = 0; k < 46; k++) {
						const b = rnd() * Math.PI * 2, L = 26 + rnd() * 26;
						needles(cx, cy, b, L, 120 + rnd() * 130);
					}
				}
			};
			if (winter) {
				// zima: gałązki bez liści (korona prześwitująca), w rdzeniu rzadsze
				for (const k of [0, 1, 3, 7]) cell(k, (x0, y0) => { for (let i = 0; i < 4; i++) twig(x0 + S / 2 + (rnd() - 0.5) * 60, y0 + S - 6, -Math.PI / 2 + (rnd() - 0.5) * 1.2, S * 0.3, 7, 4, 200); });
				cell(2, (x0, y0) => { for (let i = 0; i < 3; i++) twig(x0 + S / 2 + (rnd() - 0.5) * 80, y0 + S - 6, -Math.PI / 2 + (rnd() - 0.5) * 1.4, S * 0.28, 6, 3, 190); });
			} else {
				cell(0, (x0, y0) => cluster(x0, y0, 230, 30, 0.42));
				cell(1, (x0, y0) => cluster(x0, y0, 200, 36, 0.4));
				cell(2, (x0, y0) => { g.fillStyle = grey(110); g.fillRect(x0, y0, S, S); for (let i = 0; i < 520; i++) leaf(x0 + rnd() * S, y0 + rnd() * S, 26 + rnd() * 14, rnd() * 6.28, 95 + rnd() * 140); });
				cell(3, (x0, y0) => cluster(x0, y0, 300, 17, 0.44));
				cell(7, (x0, y0) => { for (let i = 0; i < 4; i++) twig(x0 + S / 2, y0 + S - 6, -Math.PI / 2 + (rnd() - 0.5) * 1.2, S * 0.3, 7, 4, 200); });
			}
			cell(4, spray);
			cell(5, (x0, y0) => tufts(x0, y0, 9));
			cell(6, (x0, y0) => { g.fillStyle = grey(100); g.fillRect(x0, y0, S, S); for (let i = 0; i < 1400; i++) { const x = x0 + rnd() * S, y = y0 + rnd() * S; needles(x, y, rnd() * 6.28, 12 + rnd() * 12, 110 + rnd() * 130); } });
		});
	}

	/* budowa korony z kart: pozycje, normalne, kolory wierzchołków, UV (atlas) */
	function crownGeo() {
		const P = [], N = [], C = [], U = [];
		const vtx = (p, n, c, uv) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); C.push(c[0], c[1], c[2]); U.push(uv[0], uv[1]); };
		const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
		// czworokąt a-b-c-d (przeciwnie do wskazówek patrząc od strony normalnej); nf(p) – normalna, cf(p) – kolor
		const quad = (a, b, c, d, uvs, nf, cf) => {
			for (const [p, uv] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [d, uvs[3]]]) vtx(p, nf(p), cf(p), uv);
		};
		// bryła (rdzeń, gałęzie): uvf(x, y, z) – UV w atlasie
		const solid = (geo, uvf, cf) => {
			const g = geo.index ? geo.toNonIndexed() : geo;
			const p = g.attributes.position, n = g.attributes.normal;
			for (let i = 0; i < p.count; i++) {
				const q = [p.getX(i), p.getY(i), p.getZ(i)];
				vtx(q, [n.getX(i), n.getY(i), n.getZ(i)], cf(q), uvf(q));
			}
		};
		const done = () => {
			const out = new T.BufferGeometry();
			out.setAttribute('position', new T.Float32BufferAttribute(P, 3));
			out.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
			out.setAttribute('color', new T.Float32BufferAttribute(C, 3));
			out.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
			out.computeBoundingSphere();
			out.userData.shared = true;
			return out;
		};
		return { quad, solid, done, nrm };
	}

	/* korona liściasta (jednostki: wysokość korony ok. 1): kępy (jak dawniej – rdzeń, n kęp na różnych wysokościach,
	   drobne kępki na obrzeżu); każda kępa – kilka kart z kępką liści, zwróconych na zewnątrz korony (normalne
	   zaokrąglone jak elipsoida – miękkie światło); w środku ciemny rdzeń z gęstych liści i konary od pnia */
	function leafyCards(n, seed, spread, squash, vy, lo, cells, dense) {
		const B = crownGeo(), lobes = [];
		lobes.push({ c: [0, 0.06, 0], r: lo ? 0.38 : 0.34, main: true });
		for (let k = 0; k < n; k += lo ? 2 : 1) {
			const a = k * 2.39996 + hash(seed + k) * 0.6, h = hash(seed * 3 + k);
			const oy = (h - 0.45) * vy * 1.5;
			const rad = spread * (0.75 + 0.5 * hash(seed * 5 + k)) * (1 - Math.min(0.6, Math.abs(oy) * 0.9));
			lobes.push({ c: [Math.cos(a) * rad, oy, Math.sin(a) * rad], r: (0.17 + hash(seed * 2 + k) * 0.15) * (lo ? 1.15 : 1), main: true });
		}
		for (let k = 0; k < (lo ? 0 : n); k++) {
			const a = k * 2.39996 + 1.2 + hash(seed * 7 + k) * 0.8, h = hash(seed * 11 + k);
			const oy = (h - 0.4) * vy * 1.7, rad = spread * (1.25 + 0.3 * hash(seed * 13 + k)) * (1 - Math.min(0.55, Math.abs(oy) * 0.8));
			lobes.push({ c: [Math.cos(a) * rad, oy, Math.sin(a) * rad], r: 0.09 + hash(seed * 17 + k) * 0.07 });
		}
		const shade = leafShade(0, 0.55), sq = squash;
		const outN = (p) => B.nrm([p[0], (p[1] - 0.05) / (sq * sq), p[2]]);
		// rdzeń: kępy główne pomniejszone, ciemne, z gęstych liści
		for (const L of lobes) {
			if (!L.main) continue;
			const geo = lumpy(L.r * 0.78, lo ? 0 : 1, seed + L.r * 31, sq).translate(L.c[0], L.c[1], L.c[2]);
			B.solid(geo, (q) => cellUV(dense, 0.5 + 0.45 * Math.sin(q[0] * 9 + q[2] * 5), 0.5 + 0.45 * Math.sin(q[1] * 11 + q[2] * 3)), (q) => shade(q[0], q[1], q[2]).map((x) => x * 0.72));
		}
		// konary: od pnia (spód korony) do środków kęp głównych – ciemne, z gęstego pola (nieprzezroczyste)
		if (!lo) for (const L of lobes.filter((x) => x.main).slice(1, 6)) {
			const a = [L.c[0] * 0.1, -0.5, L.c[2] * 0.1], b = [L.c[0] * 0.8, L.c[1] * 0.8, L.c[2] * 0.8];
			const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...dir);
			const geo = new T.CylinderGeometry(0.012, 0.022, len, 5);
			const qt = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dir[0] / len, dir[1] / len, dir[2] / len));
			geo.applyQuaternion(qt).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
			B.solid(geo, () => cellUV(dense, 0.5, 0.5), () => [0.16, 0.13, 0.11]);
		}
		// karty z kępkami liści
		lobes.forEach((L, li) => {
			const K = lo ? 4 : L.main ? 7 : 3, size = L.r * (lo ? 2.3 : 1.75);
			for (let j = 0; j < K; j++) {
				const h1 = hash(seed * 1.7 + li * 13.1 + j * 3.3), h2 = hash(seed * 2.9 + li * 7.7 + j * 5.1), h3 = hash(seed * 4.1 + li * 3.9 + j * 9.7);
				// kierunek: na zewnątrz kępy (od środka korony) z rozrzutem
				const az = h1 * Math.PI * 2, el = (h2 - 0.35) * 2.2;
				const rd = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
				const o = B.nrm([L.c[0] * 1.5 + rd[0], L.c[1] * 1.5 + rd[1] + 0.15, L.c[2] * 1.5 + rd[2]]);
				const cc = [L.c[0] + o[0] * L.r * 0.55, L.c[1] + o[1] * L.r * 0.55 * sq, L.c[2] + o[2] * L.r * 0.55];
				// płaszczyzna karty: normalna = kierunek o z odchyleniem, obrót wokół niej losowy
				const nn = B.nrm([o[0] + (h3 - 0.5) * 0.9, o[1] + 0.25, o[2] + (h1 - 0.5) * 0.9]);
				const ref = Math.abs(nn[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
				let t = B.nrm([ref[1] * nn[2] - ref[2] * nn[1], ref[2] * nn[0] - ref[0] * nn[2], ref[0] * nn[1] - ref[1] * nn[0]]);
				let b = [nn[1] * t[2] - nn[2] * t[1], nn[2] * t[0] - nn[0] * t[2], nn[0] * t[1] - nn[1] * t[0]];
				const rot = h2 * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
				[t, b] = [[t[0] * cr + b[0] * sr, t[1] * cr + b[1] * sr, t[2] * cr + b[2] * sr], [b[0] * cr - t[0] * sr, b[1] * cr - t[1] * sr, b[2] * cr - t[2] * sr]];
				const hs = size / 2, pt = (u, v) => [cc[0] + t[0] * u * hs + b[0] * v * hs, cc[1] + (t[1] * u * hs + b[1] * v * hs) * Math.min(1.3, Math.max(0.8, sq)), cc[2] + t[2] * u * hs + b[2] * v * hs];
				const k = cells[(li + j) % cells.length];
				B.quad(pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1), [cellUV(k, 0, 0), cellUV(k, 1, 0), cellUV(k, 1, 1), cellUV(k, 0, 1)], (p) => { const a = outN(p); return B.nrm([a[0] * 0.75 + nn[0] * 0.25, a[1] * 0.75 + nn[1] * 0.25, a[2] * 0.75 + nn[2] * 0.25]); }, (p) => shade(p[0], p[1], p[2]));
			}
		});
		return B.done();
	}

	/* świerk (jednostki: wysokość 1, y −0,5…0,5): piętra gałęzi – na każdym kilka(naście) kart gałązki z igłami od pnia
	   na zewnątrz, opadających ku końcom (w wersji dokładnej także druga karta skrzyżowana pod kątem – objętość), ciemny
	   stożkowy rdzeń z gęstych igieł i wierzchołek */
	function spruceCards(lo) {
		const B = crownGeo(), tiers = lo ? 5 : 9;
		const col = (p) => { const s = 0.5 + 0.5 * Math.max(0, Math.min(1, p[1] + 0.5)) + 0.1 * Math.hypot(p[0], p[2]); return [s, s, s]; };
		for (let k = 0; k < tiers; k++) {
			const t = k / tiers, r = 0.52 * (1 - t * 0.86), h = 0.86 / tiers * 1.6;
			const y0 = -0.42 + t * 0.86;
			const core = new T.ConeGeometry(r * 0.42, h * 1.2, lo ? 6 : 8, 1, true).translate(0, y0, 0);
			B.solid(core, (q) => cellUV(6, 0.5 + 0.45 * Math.atan2(q[2], q[0]) / Math.PI, 0.5 + (q[1] - y0) / h * 0.8), (q) => col(q).map((x) => x * 0.5));
			const M = lo ? 6 : 11;
			for (let j = 0; j < M; j++) {
				const a = (j / M) * Math.PI * 2 + k * 1.7 + hash(k * 7.1 + j) * 0.4, ca = Math.cos(a), sa = Math.sin(a);
				const L = r * (0.95 + hash(k * 3.3 + j * 1.7) * 0.2), w = Math.max(0.07, ((2 * Math.PI * r) / M) * (lo ? 1.5 : 1.2));
				const yi = y0 + h * 0.25, yo = y0 - h * 0.55;
				const crosses = lo ? [0] : [0, 1];
				for (const cx of crosses) {
					// szerokość karty: poziomo w poprzek gałęzi (cx = 1 – pochylona o 55°)
					const side = cx ? [-sa * 0.57, 0.82, ca * 0.57] : [-sa, 0, ca];
					const P0 = (u, v) => {
						const rr = r * 0.08 + L * u, y = yi + (yo - yi) * u * u, ww = w * (0.35 + 0.65 * u) * v * 0.5;
						return [ca * rr + side[0] * ww, y + side[1] * ww, sa * rr + side[2] * ww];
					};
					const n0 = B.nrm([ca, 0.65, sa]);
					B.quad(P0(0, 1), P0(1, 1), P0(1, -1), P0(0, -1), [cellUV(4, 0, 1), cellUV(4, 1, 1), cellUV(4, 1, 0), cellUV(4, 0, 0)], () => n0, col); // lico do góry
				}
			}
		}
		const tip = new T.ConeGeometry(0.035, 0.12, 6, 1, true).translate(0, 0.5, 0);
		B.solid(tip, () => cellUV(6, 0.5, 0.5), col);
		return B.done();
	}

	function buildTrees() {
		/* liściaste: korona (geometria w jednostkach: wysokość korony ok. 1) – rdzeń, n kęp na różnych wysokościach
		   (wyżej i niżej bliżej osi – kształt jaja, nie kuli) i n drobnych kępek na obrzeżu, które rozbijają sylwetkę;
		   drobne kępki z mniej dokładnej bryły (ok. 1000 trójkątów na koronę) */
		const leafy = (n, seed, spread, squash, vy = 0.42, lo = false) => {
			const parts = [];
			const lobe = (r, det, ox, oy, oz, sd) => parts.push({ geo: lumpy(r, lo ? 0 : det, sd, squash).translate(ox, oy, oz), color: leafShade(0, 0.55) });
			lobe(lo ? 0.38 : 0.34, 1, 0, 0.06, 0, seed);
			// wersja z daleka (lo): rdzeń i co druga kępa z bryły 20-ściennej, bez drobnych kępek – ok. 100 trójkątów
			for (let k = 0; k < n; k += lo ? 2 : 1) {
				const a = k * 2.39996 + hash(seed + k) * 0.6, h = hash(seed * 3 + k);
				const oy = (h - 0.45) * vy * 1.5;
				const rad = spread * (0.75 + 0.5 * hash(seed * 5 + k)) * (1 - Math.min(0.6, Math.abs(oy) * 0.9));
				lobe((0.17 + hash(seed * 2 + k) * 0.15) * (lo ? 1.15 : 1), 1, Math.cos(a) * rad, oy, Math.sin(a) * rad, seed + k * 13);
			}
			for (let k = 0; k < (lo ? 0 : n); k++) {
				const a = k * 2.39996 + 1.2 + hash(seed * 7 + k) * 0.8, h = hash(seed * 11 + k);
				const oy = (h - 0.4) * vy * 1.7, rad = spread * (1.25 + 0.3 * hash(seed * 13 + k)) * (1 - Math.min(0.55, Math.abs(oy) * 0.8));
				lobe(0.09 + hash(seed * 17 + k) * 0.07, 0, Math.cos(a) * rad, oy, Math.sin(a) * rad, seed + k * 29 + 5);
			}
			return merge(parts);
		};
		// iglaste: kilka pięter postrzępionych stożków
		// lo – wersja z daleka: 4 piętra po 8 boków (ok. 100 trójkątów zamiast ok. 900)
		const spruceOf = (lo) => {
			const parts = [];
			// 7 pięter gałęzi: brzegi postrzępione (co drugi wierzchołek dalej i niżej – zwisające końce gałęzi)
			const tiers = lo ? 4 : 7;
			for (let k = 0; k < tiers; k++) {
				const t = k / tiers;
				const r = 0.52 * (1 - t * 0.82), h = lo ? 0.4 : 0.27;
				const y0 = -0.42 + t * 0.86 + (lo ? 0.06 : 0);
				const g = new T.ConeGeometry(r, h, lo ? 8 : 16, lo ? 1 : 2, false).translate(0, y0, 0);
				const p = g.attributes.position;
				const yb = y0 - h / 2;
				for (let i = 0; i < p.count; i++) {
					const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i));
					const tip = 0.5 + 0.5 * Math.cos(a * (lo ? 4 : 8) + k * 1.3);
					const lev = (y - yb) / h; // 0 – dół piętra, 1 – czubek
					if (lev < 0.99) {
						const j = 1 + (tip - 0.5) * 0.32 * (1 - lev) + (hash(i * 3.7 + k) - 0.5) * 0.12;
						p.setXYZ(i, p.getX(i) * j, y - tip * 0.07 * (1 - lev), p.getZ(i) * j);
					}
				}
				g.computeVertexNormals();
				parts.push({ geo: g, color: (x, y) => { const s = 0.5 + 0.5 * Math.max(0, Math.min(1, y + 0.5)) + 0.1 * Math.hypot(x, 0); return [s, s, s]; } });
			}
			return merge(parts);
		};
		const spruce = spruceOf(false);
		const trunk = new T.CylinderGeometry(0.32, 0.5, 1, 7);
		trunk.userData.shared = true;
		/* korony z kart z kępkami liści i igieł (atlas foliageAtlas) – kształty kęp jak dawniej (leafy / spruceOf zostają
		   jako bryły zapasowe); pola atlasu: dąb – kępki 0 i 1, brzoza – drobne liście 3, topola – 3 i 0, sosna – pęczki
		   igieł 5 (rdzeń 6), krzew – 1 i 0 */
		const kinds = (lo) => ({
			oak: leafyCards(9, 1.3, 0.34, 0.9, 0.42, lo, [0, 1], 2),
			birch: leafyCards(8, 7.7, 0.22, 1.4, 0.42, lo, [3], 2),
			poplar: leafyCards(7, 4.4, 0.14, 2.6, 0.42, lo, [3, 0], 2),
			pine: leafyCards(8, 9.1, 0.36, 0.45, 0.8, lo, [5], 6), // sosna: spłaszczone kępy na kilku wysokościach
			bush: leafyCards(6, 2.2, 0.3, 0.75, 0.42, lo, [1, 0], 2),
			spruce: spruceCards(lo),
		});
		void leafy; void spruce;
		// z daleka (lo – World: kawałki dalej od kamery, zwarte masy lasu)
		return Object.assign(kinds(false), { trunk, lo: kinds(true) });
	}

	// kępa trawy: 10 cienkich źdźbeł wygiętych łukiem (2 odcinki, zwężające się), od ciemnej nasady do jasnych końców (y od −0.5 do 0.5)
	function buildGrass() {
		const parts = [];
		const blades = 10;
		for (let k = 0; k < blades; k++) {
			const a = hash(k * 3.1) * Math.PI * 2, lean = 0.2 + hash(k * 5.3) * 0.45;
			const rr = 0.2 * Math.sqrt(hash(k * 1.3));
			const ox = Math.cos(a) * rr, oz = Math.sin(a) * rr;
			const w = 0.04 + hash(k * 7.7) * 0.03, h = 0.55 + hash(k * 2.9) * 0.45;
			const tx = Math.cos(a) * lean, tz = Math.sin(a) * lean;
			const nx = -Math.sin(a), nz = Math.cos(a);
			// punkty osi źdźbła: wychylenie rośnie z kwadratem wysokości (łuk), szerokość maleje do zera
			const P = [0, 0.55, 1].map((t) => [ox + tx * t * t, -0.5 + h * (t - 0.12 * t * t * lean), oz + tz * t * t, w * (1 - t)]);
			const v = [];
			for (let q = 0; q < 2; q++) {
				const [x0, y0, z0, w0] = P[q], [x1, y1, z1, w1] = P[q + 1];
				const A = [x0 - nx * w0, y0, z0 - nz * w0], B = [x0 + nx * w0, y0, z0 + nz * w0], Cc = [x1 + nx * w1, y1, z1 + nz * w1], D = [x1 - nx * w1, y1, z1 - nz * w1];
				v.push(...A, ...B, ...Cc, ...A, ...Cc, ...D);
			}
			const g = new T.BufferGeometry();
			g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
			// normalne skierowane w górę (trawa oświetlona jak powierzchnia łąki, bez czarnych tyłów źdźbeł)
			const n = [];
			for (let i = 0; i < v.length / 3; i++) n.push(0, 1, 0);
			g.setAttribute('normal', new T.Float32BufferAttribute(n, 3));
			parts.push({ geo: g, color: (x, y) => { const s = 0.55 + 0.6 * (y + 0.5); return [s, s, s]; } });
		}
		const geo = merge(parts);
		const flower = new T.IcosahedronGeometry(0.07, 0);
		flower.userData.shared = true;
		return { geo, flower };
	}

	// człowiek (stopy na y = 0): tułów i ręce w kolorze ubrania, nogi ciemniejsze; głowa i dłonie w kolorze skóry, włosy ciemne
	/* Człowiek ok. 1,74 m (przód = −z), z częściami do animacji (aLimb, zob. shader w world.js):
	   0 tułów, 1/2 udo L/P, 3/4 łydka ze stopą L/P, 5/6 ramię L/P, 7/8 przedramię z dłonią L/P, 9 głowa.
	   Stawy: biodro y 0,92, kolano 0,5, bark 1,44 (x ±0,215), łokieć 1,16.
	   Ciało (kolor instancji – ubranie): kurtka z kołnierzem, dołem i kieszeniami, rękawy z mankietami; aKeep:
	   1 – spodnie (paleta wg osoby), 2 – stały kolor (buty z podeszwą, pasek, guziki, oczy), 3 – włosy (paleta).
	   Głowa (kolor instancji – skóra): szyja, głowa, żuchwa, nos, uszy, brwi, oczy, włosy, dłonie z kciukiem. */
	function buildPeople() {
		const W = [1, 1, 1], PANTS = [0.3, 0.31, 0.35], SHOE = [0.1, 0.1, 0.1], SOLE = [0.05, 0.05, 0.05], BELT = [0.16, 0.15, 0.14];
		const HAIR = [0.26, 0.21, 0.17], DARK = [0.08, 0.07, 0.07];
		const cyl = (rt, rb, h, seg, x, y, z, sz = 1) => new T.CylinderGeometry(rt, rb, h, seg).scale(1, 1, sz).translate(x, y, z);
		const sph = (r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 12, hs = 8) => new T.SphereGeometry(r, ws, hs).scale(sx, sy, sz).translate(x, y, z);
		const bx = (w, h, d, x, y, z) => new T.BoxGeometry(w, h, d).translate(x, y, z);
		const P = [];
		const part = (geo, color, limb, keep) => P.push({ geo, color, limb, keep });
		for (const [sx, thigh, shin] of [[-1, 1, 3], [1, 2, 4]]) {
			const x = sx * 0.095;
			// udo i biodro
			part(cyl(0.088, 0.066, 0.44, 10, x, 0.71, 0, 1.05), PANTS, thigh, 1);
			part(sph(0.066, x, 0.5, 0, 1, 1, 1, 10, 6), PANTS, shin, 1); // kolano
			// łydka, nogawka rozszerzona przy bucie
			part(cyl(0.062, 0.058, 0.36, 10, x, 0.31, 0, 1.05), PANTS, shin, 1);
			part(cyl(0.058, 0.066, 0.06, 10, x, 0.11, 0.005), PANTS, shin, 1);
			// but: cholewka, przód, podeszwa
			part(sph(0.058, x, 0.075, 0.01, 1, 0.8, 1.1, 10, 6), SHOE, shin, 2);
			part(sph(0.054, x, 0.05, -0.08, 0.95, 0.6, 1.25, 10, 6), SHOE, shin, 2);
			part(bx(0.088, 0.018, 0.235, x, 0.01, -0.035), SOLE, shin, 2);
		}
		// biodra, pasek z klamrą
		part(sph(0.172, 0, 0.9, 0, 1.05, 0.5, 0.74), PANTS, 0, 1);
		part(cyl(0.172, 0.17, 0.05, 14, 0, 0.98, 0, 0.68), BELT, 0, 2);
		part(bx(0.05, 0.035, 0.01, 0, 0.98, -0.118), [0.6, 0.55, 0.4], 0, 2);
		// kurtka: dół (szerszy), tułów zwężony w pasie, klatka, barki, kołnierz, zapięcie, kieszenie
		part(cyl(0.19, 0.2, 0.12, 14, 0, 1.03, 0, 0.66), W, 0);
		part(cyl(0.2, 0.175, 0.24, 14, 0, 1.17, 0, 0.62), W, 0);
		part(cyl(0.215, 0.2, 0.18, 14, 0, 1.36, 0, 0.62), W, 0);
		part(sph(0.215, 0, 1.45, 0, 1, 0.4, 0.62), W, 0);
		part(cyl(0.07, 0.09, 0.07, 12, 0, 1.53, 0.005, 0.95), W, 0);
		part(bx(0.012, 0.42, 0.01, 0, 1.24, -0.128), [0.55, 0.55, 0.55], 0, 0);
		for (const k of [-1, 1]) part(bx(0.09, 0.012, 0.01, k * 0.1, 1.12, -0.121), [0.6, 0.6, 0.6], 0, 0);
		// ręce: ramię (z barkiem), łokieć i przedramię z mankietem
		for (const [sx, up, low] of [[-1, 5, 7], [1, 6, 8]]) {
			const x = sx * 0.225;
			part(sph(0.066, x - sx * 0.005, 1.44, 0, 1, 1, 1, 10, 8), W, up);
			part(cyl(0.062, 0.052, 0.29, 10, x, 1.3, 0), W, up);
			part(sph(0.052, x, 1.16, 0, 1, 1, 1, 10, 6), W, low);
			part(cyl(0.051, 0.044, 0.25, 10, x, 1.03, 0), W, low);
			part(cyl(0.047, 0.047, 0.03, 10, x, 0.9, 0), [0.75, 0.75, 0.75], low);
		}
		/* dodatki (aKeep 4 – plecak, 5 – torba na ramię z paskiem): w bryle każdej osoby, widoczne tylko u części
		   (shader personMat – wg numeru egzemplarza; u pozostałych zwinięte do wnętrza tułowia) */
		part(new T.BoxGeometry(0.3, 0.38, 0.14).translate(0, 1.24, 0.17), W, 0, 4);
		part(new T.BoxGeometry(0.26, 0.12, 0.1).translate(0, 1.08, 0.2), W, 0, 4);
		for (const x of [-0.1, 0.1]) part(new T.BoxGeometry(0.035, 0.36, 0.02).translate(x, 1.3, -0.12), W, 0, 4); // szelki z przodu
		part(new T.BoxGeometry(0.08, 0.24, 0.3).translate(0.25, 0.98, 0.02), W, 0, 5);
		{
			const strap = new T.BoxGeometry(0.03, 0.62, 0.012).rotateZ(-0.62).translate(0.03, 1.28, -0.125);
			part(strap, W, 0, 5);
			part(new T.BoxGeometry(0.03, 0.62, 0.012).rotateZ(-0.62).translate(0.03, 1.28, 0.125), W, 0, 5);
		}
		const body = merge(P);
		const H = [];
		const hp = (geo, color, limb, keep) => H.push({ geo, color, limb, keep });
		hp(cyl(0.05, 0.056, 0.11, 10, 0, 1.56, 0.005), W, 0); // szyja
		hp(sph(0.104, 0, 1.69, 0, 0.9, 1.1, 1, 16, 12), W, 9); // czaszka
		hp(sph(0.075, 0, 1.625, -0.035, 1, 0.7, 0.95, 12, 8), W, 9); // żuchwa i policzki
		hp(sph(0.02, 0, 1.675, -0.104, 0.8, 1.3, 1.1, 8, 6), W, 9); // nos
		for (const sx of [-1, 1]) {
			hp(sph(0.024, sx * 0.095, 1.675, 0.005, 0.45, 1, 0.8, 8, 6), W, 9); // ucho
			hp(sph(0.012, sx * 0.034, 1.7, -0.088, 1, 0.8, 0.5, 8, 6), DARK, 9, 2); // oko
			hp(bx(0.04, 0.008, 0.012, sx * 0.034, 1.725, -0.089), HAIR, 9, 3); // brew
		}
		hp(new T.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.48).scale(0.95, 1.06, 1.04).translate(0, 1.71, 0.008), HAIR, 9, 3); // włosy
		hp(new T.SphereGeometry(0.108, 14, 6, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.45, Math.PI * 0.3).scale(0.96, 1.1, 1.05).translate(0, 1.7, 0.012), HAIR, 9, 3); // tył i boki
		// dłonie (z kciukiem) – przy przedramionach
		for (const [sx, low] of [[-1, 7], [1, 8]]) {
			hp(sph(0.043, sx * 0.225, 0.845, 0.004, 0.62, 1.25, 0.95, 10, 8), W, low);
			hp(sph(0.017, sx * 0.205, 0.86, -0.025, 0.8, 1.5, 0.8, 8, 6), W, low);
		}
		const head = merge(H);
		return { body, head };
	}

	/* Poza zapieczona w geometrii (pasażerowie w wagonach, maszynista) – te same stawy co shader personMat:
	   pose.hip / knee – kąt ud i łydek, sh / el – [lewy, prawy] bark i łokieć, drop – obniżenie (siedzenie). */
	const posed = new Map();
	function posePeople(key, pose) {
		if (posed.has(key)) return posed.get(key);
		const src = NS.props.people || (NS.props.people = buildPeople());
		const fix = (geo) => {
			const g = geo.clone();
			const P = g.attributes.position, N = g.attributes.normal, Lb = g.attributes.aLimb, Kp = g.attributes.aKeep;
			const rot = (arr, i, cy, a, centered) => {
				const y = arr.getY(i) - (centered ? cy : 0), z = arr.getZ(i), s = Math.sin(a), c = Math.cos(a);
				arr.setY(i, (centered ? cy : 0) + y * c - z * s);
				arr.setZ(i, y * s + z * c);
			};
			for (let i = 0; i < P.count; i++) {
				// plecak i torba (aKeep 4, 5) – siedzący bez nich (zwinięte do wnętrza tułowia)
				if (Kp && Kp.getX(i) > 3.5) { P.setXYZ(i, 0, 1.2 - (pose.drop || 0), 0); continue; }
				const L = Math.round(Lb.getX(i));
				let a1 = 0, a2 = 0, c1 = 0, c2 = 0;
				if (L >= 1 && L <= 4) { a1 = pose.hip + (L % 2 ? -0.03 : 0.05); a2 = L >= 3 ? pose.knee : 0; c1 = 0.92; c2 = 0.5; }
				if (L >= 5 && L <= 8) { const k = L % 2 ? 0 : 1; a1 = pose.sh[k]; a2 = L >= 7 ? pose.el[k] : 0; c1 = 1.44; c2 = 1.16; }
				if (a2) { rot(P, i, c2, a2, true); rot(N, i, 0, a2, false); }
				if (a1) { rot(P, i, c1, a1, true); rot(N, i, 0, a1, false); }
				P.setY(i, P.getY(i) - (pose.drop || 0));
			}
			g.userData.shared = true;
			return g;
		};
		const out = { body: fix(src.body), head: fix(src.head) };
		posed.set(key, out);
		return out;
	}
	// pasażer siedzący (dłonie na udach) i maszynista (ręce na pulpicie); wysokość siedziska 0,48 m
	const seatedPeople = () => posePeople('seated', { hip: 1.52, knee: -1.42, sh: [0.32, 0.3], el: [0.8, 0.85], drop: 0.35 });
	const driverPeople = () => posePeople('driver', { hip: 1.45, knee: -1.25, sh: [0.85, 0.95], el: [0.55, 0.45], drop: 0.35 });

	/* Fotel (wspólny dla wagonów i kabin; przód = −z, wierzch siedziska na y = 0): miękkie części (zaokrąglona
	   poduszka, oparcie pochylone do tyłu, zagłówek) i twarde (skorupa oparcia, nogi z poprzeczką, uchwyt). */
	let seatG = null;
	function seatGeos() {
		if (seatG) return seatG;
		const rbox = (w, h, d, r, x, y, z, tilt) => {
			const sh = new T.Shape(), x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
			sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r);
			sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1); sh.lineTo(x0 + r, y1);
			sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
			const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.005, d - 2 * r * 0.6), bevelEnabled: true, bevelThickness: r * 0.6, bevelSize: r * 0.4, bevelSegments: 2, curveSegments: 3 });
			g.translate(0, 0, -(d - 2 * r * 0.6) / 2);
			if (tilt) g.rotateX(tilt);
			return g.translate(x, y, z);
		};
		const W1 = [1, 1, 1], tilt = -0.17;
		const soft = merge([
			{ geo: rbox(0.42, 0.09, 0.44, 0.04, 0, -0.045, 0), color: W1 },
			{ geo: rbox(0.42, 0.58, 0.08, 0.035, 0, 0.32, 0.215, tilt), color: W1 },
			{ geo: rbox(0.28, 0.15, 0.09, 0.04, 0, 0.71, 0.27, tilt), color: W1 },
		]);
		const hard = merge([
			{ geo: new T.BoxGeometry(0.44, 0.6, 0.02).rotateX(tilt).translate(0, 0.32, 0.262), color: W1 },
			{ geo: new T.BoxGeometry(0.44, 0.04, 0.42).translate(0, -0.11, 0), color: W1 },
			{ geo: new T.BoxGeometry(0.04, 0.42, 0.04).translate(-0.17, -0.33, 0.02), color: W1 },
			{ geo: new T.BoxGeometry(0.04, 0.42, 0.04).translate(0.17, -0.33, 0.02), color: W1 },
			{ geo: new T.BoxGeometry(0.38, 0.03, 0.04).translate(0, -0.52, 0.02), color: W1 },
			{ geo: new T.BoxGeometry(0.26, 0.025, 0.025).translate(0, 0.66, 0.37), color: W1 },
		]);
		seatG = { soft, hard };
		return seatG;
	}

	const CAR_COLORS = ['#b8282a', '#2e6fb1', '#e0b22a', '#ecf0f1', '#2c8a4f', '#7f8c8d', '#1d2a38', '#5b2d6e', '#d35400'];
	/* Bryła samochodu (przód = +z, kolory wierzchołków: biały – lakier, mnożony przez kolor auta): nadwozie
	   wyciągnięte z profilu bocznego z fazowaniem (maska, zaokrąglony przód i tył), kabina z szybami wg typu
	   (pochylona przednia, tylna – stroma w hatchbacku, łagodna do bagażnika w sedanie, pionowa w kombi), dach,
	   słupki A, B i C w kolorze lakieru, czarne nadkola, listwy progowe, osłona chłodnicy, lusterka, klamki,
	   linia drzwi, zderzaki, tablice, koła z felgami, reflektory i światła tylne.
	   kind: 0 – hatchback (4,0 m), 1 – dostawczy (4,8 m), 2 – sedan (4,5 m), 3 – kombi (4,6 m). */
	const carGeos = {};
	function carGeo(kind) {
		if (carGeos[kind]) return carGeos[kind];
		const W1 = [1, 1, 1], GL = [0.06, 0.08, 0.11], TY = [0.05, 0.05, 0.05], RIM = [0.55, 0.57, 0.6], TRIM = [0.13, 0.13, 0.14], DK = [0.04, 0.04, 0.045];
		const van = kind === 1, L = [2.0, 2.4, 2.25, 2.3][kind] || 2.0;
		const ext = (pts, width, bevel, segs = 2) => {
			const sh = new T.Shape();
			pts.forEach(([z, y], k) => (k ? sh.lineTo(z, y) : sh.moveTo(z, y)));
			const g = new T.ExtrudeGeometry(sh, { depth: width - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 4 });
			g.rotateY(-Math.PI / 2); // profil (z, y), wyciągnięcie w poprzek
			g.translate(width / 2 - bevel, 0, 0);
			return g;
		};
		// prostopadłościan z zaokrąglonymi krawędziami (światła, zderzaki): w × h – lico, d – głębokość, r – promień
		const rbox = (w, h, d, r, x, y, z) => {
			const sh = new T.Shape(), x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
			sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r);
			sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1); sh.lineTo(x0 + r, y1);
			sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
			const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.005, d - r), bevelEnabled: true, bevelThickness: r * 0.5, bevelSize: r * 0.3, bevelSegments: 2, curveSegments: 3 });
			return g.translate(x, y, z - (d - r) / 2);
		};
		// belka wzdłuż odcinka (z0, y0)–(z1, y1) w płaszczyźnie x (słupki)
		const strut = (x, z0, y0, z1, y1, w, color) => {
			const len = Math.hypot(z1 - z0, y1 - y0);
			return { geo: new T.BoxGeometry(w, len, 0.07).rotateX(Math.atan2(z1 - z0, y1 - y0)).translate(x, (y0 + y1) / 2, (z0 + z1) / 2), color };
		};
		const parts = [];
		// nadwozie do linii okien
		const body = van
			? [[-L, 0.34], [L, 0.34], [L + 0.04, 0.6], [L - 0.05, 0.95], [L - 0.7, 1.12], [-L + 0.02, 1.12], [-L, 0.95]]
			: kind === 2
				? [[-L, 0.36], [L, 0.36], [L + 0.04, 0.56], [L - 0.04, 0.76], [0.95, 0.92], [-1.35, 0.97], [-L + 0.12, 0.95], [-L, 0.82]]
				: [[-L, 0.36], [L, 0.36], [L + 0.04, 0.56], [L - 0.04, 0.76], [0.95, 0.92], [-L + 0.15, 0.97], [-L, 0.84]];
		// nadwozie mocniej zaokrąglone (fazowanie 0,13 m w 4 krokach – jak współczesne auta); detale z przodu i z tyłu
		// odsunięte o przyrost fazowania (ex)
		const BV = 0.13, ex = BV - 0.07;
		parts.push({ geo: ext(body, 1.76, BV, 4), color: W1 });
		// kabina (szyby): przednia szyba od (0,92; 0,9) do (0,15; 1,42), tylna wg typu
		const gh = van
			? [[-L + 0.05, 1.1], [L - 0.72, 1.1], [L - 1.25, 1.95], [-L + 0.05, 1.98]]
			: kind === 2 ? [[-1.32, 0.95], [0.92, 0.9], [0.15, 1.42], [-0.85, 1.44], [-1.42, 1.0]]
				: kind === 3 ? [[-L + 0.1, 0.96], [0.92, 0.9], [0.15, 1.42], [-L + 0.22, 1.46], [-L + 0.06, 1.06]]
					: [[-L + 0.25, 0.95], [0.92, 0.9], [0.15, 1.42], [-1.05, 1.45], [-L + 0.18, 1.02]];
		parts.push({ geo: ext(gh, 1.54, 0.04), color: GL });
		// dach (lakier) nad kabiną
		const rf = van ? [[-L + 0.02, 1.94], [L - 1.24, 1.94], [L - 1.3, 2.02], [-L + 0.02, 2.04]]
			: [[gh[3][0] - 0.03, gh[3][1] - 0.04], [gh[2][0] + 0.05, gh[2][1] - 0.04], [gh[2][0] - 0.02, gh[2][1] + 0.05], [gh[3][0], gh[3][1] + 0.05]];
		parts.push({ geo: ext(rf, 1.5, 0.03), color: W1 });
		// słupki A (wzdłuż przedniej szyby), B (za przednimi drzwiami), C (przy tylnej szybie)
		for (const x of [-0.76, 0.76]) {
			if (van) {
				parts.push(strut(x, L - 0.72, 1.1, L - 1.25, 1.95, 0.05, W1));
				parts.push({ geo: new T.BoxGeometry(0.05, 0.82, 0.12).translate(x, 1.5, 0.55), color: W1 });
			} else {
				parts.push(strut(x, gh[1][0], gh[1][1], gh[2][0], gh[2][1], 0.05, W1));
				parts.push(strut(x, gh[4][0], gh[4][1], gh[3][0], gh[3][1], 0.05, W1));
				parts.push({ geo: new T.BoxGeometry(0.05, 0.48, 0.13).translate(x, 1.17, kind === 0 ? -0.42 : -0.3), color: W1 });
			}
		}
		// zderzaki, osłona chłodnicy, listwy progowe
		for (const z of [L + 0.02 + ex, -L - 0.02 - ex]) parts.push({ geo: rbox(1.82, 0.22, 0.16, 0.05, 0, 0.45, z), color: TRIM });
		parts.push({ geo: new T.BoxGeometry(0.72, 0.13, 0.04).translate(0, van ? 0.82 : 0.66, L + 0.04 + ex), color: DK });
		for (const x of [-0.885, 0.885]) {
			parts.push({ geo: new T.BoxGeometry(0.02, 0.07, 2 * L - 1.6).translate(x, 0.4, 0), color: TRIM });
			// linia drzwi, klamki
			const dz = van ? 0.4 : -0.3;
			parts.push({ geo: new T.BoxGeometry(0.012, 0.5, 0.012).translate(x * 1.003, 0.68, dz), color: DK });
			for (const z of van ? [0.9] : [0.25, -0.85]) parts.push({ geo: new T.BoxGeometry(0.02, 0.03, 0.12).translate(x * 1.006, 0.86, z), color: DK });
			// lusterko na wsporniku
			const mz = van ? L - 0.78 : 0.85, my = van ? 1.2 : 1.0;
			parts.push({ geo: new T.BoxGeometry(0.12, 0.03, 0.04).translate(x * 1.02, my - 0.03, mz), color: TRIM });
			parts.push({ geo: new T.BoxGeometry(0.06, 0.1, 0.12).translate(x * 1.1, my, mz), color: W1 });
		}
		// światła
		for (const x of [-0.6, 0.6]) {
			parts.push({ geo: rbox(0.4, 0.13, 0.1, 0.03, x, van ? 0.78 : 0.68, L + BV - 0.01), color: [1.7, 1.6, 1.25] });
			parts.push({ geo: rbox(0.32, 0.17, 0.1, 0.03, x * 1.05, van ? 0.85 : 0.76, -L - BV + 0.01), color: [0.95, 0.1, 0.08] });
		}
		// tablice rejestracyjne
		for (const z of [L + 0.1 + ex, -L - 0.1 - ex]) parts.push({ geo: new T.BoxGeometry(0.52, 0.12, 0.02).translate(0, 0.46, z), color: [1.4, 1.4, 1.4] });
		// koła w nadkolach: ciemne nadkole (półkole na boku), opona, felga
		const wz = van ? [1.55, -1.5] : [L - 0.72, -L + 0.68];
		for (const z of wz) for (const x of [-0.8, 0.8]) {
			parts.push({ geo: new T.CylinderGeometry(0.4, 0.4, 0.04, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(Math.sign(x) * 0.875, 0.34, z), color: DK });
			parts.push({ geo: new T.CylinderGeometry(0.32, 0.32, 0.22, 16).rotateZ(Math.PI / 2).translate(x, 0.32, z), color: TY });
			parts.push({ geo: new T.CylinderGeometry(0.2, 0.2, 0.23, 10).rotateZ(Math.PI / 2).translate(x * 1.005, 0.32, z), color: RIM });
		}
		/* trzy bryły: lakier (kolor wierzchołków biały – kolor auta z materiału albo egzemplarza), szyby (ciemne, błyszczące)
		   i reszta we własnych kolorach (opony, felgi, nadkola, zderzaki, światła, tablice) – dawniej jedna bryła i wszystko
		   mnożone przez kolor lakieru (fioletowe koła, pomarańczowe felgi) */
		const isW = (c) => c === W1, isG = (c) => c === GL;
		return (carGeos[kind] = { paint: merge(parts.filter((q) => isW(q.color))), glass: merge(parts.filter((q) => isG(q.color))), trim: merge(parts.filter((q) => !isW(q.color) && !isG(q.color))) });
	}
	// materiały części auta wspólne dla wszystkich (szyby z odbiciami nieba, reszta – kolory wierzchołków)
	let carFixed = null;
	function carFixedMats() {
		if (carFixed) return carFixed;
		carFixed = {
			glass: NS.util.patch(new T.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 }), 'train', { grime: 0.02 }),
			trim: NS.util.patch(new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.55, metalness: 0.35 }), 'train', { grime: 0.08 }),
		};
		return carFixed;
	}
	// losowy typ nadwozia: hatchback, sedan, kombi, dostawczy
	const carKind = (seed) => { const h = hash(seed + 3); return h < 0.42 ? 0 : h < 0.67 ? 2 : h < 0.85 ? 3 : 1; };
	const carMats = {};
	// samochód osobowy (przód = +z), długość ok. 4,2 m; materiał jak taboru (wariant 'train') – śnieg i krople we
	// współrzędnych auta, jadą razem z nim
	function carModel(seed, shadows) {
		const car = new T.Group();
		const color = CAR_COLORS[Math.floor(hash(seed) * CAR_COLORS.length)];
		const paint = carMats[color] || (carMats[color] = NS.util.patch(new T.MeshPhysicalMaterial({ color, vertexColors: true, roughness: 0.35, metalness: 0.4, clearcoat: 0.9, clearcoatRoughness: 0.12 }), 'train', { grime: 0.05 }));
		const G = carGeo(carKind(seed)), F = carFixedMats();
		for (const [geo, mt] of [[G.paint, paint], [G.glass, F.glass], [G.trim, F.trim]]) {
			const m = new T.Mesh(geo, mt);
			m.castShadow = shadows;
			car.add(m);
		}
		return car;
	}

	NS.props = { merge, lumpy, buildTrees, foliageAtlas, buildGrass, buildPeople, carModel, carGeo, carKind, carFixedMats, seatedPeople, driverPeople, seatGeos };
})();
