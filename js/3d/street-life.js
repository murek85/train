/* Ruch uliczny i pieszy na trasach rzeczywistych: auta, dostawczaki i ciężarówki po sieci ulic z mapy (envStreets,
   real-env.js) oraz piesi na chodnikach. Tylko wygląd – nie wpływa na rozgrywkę.

   Auta: ruch prawostronny, pasy wg liczby pasów z mapy, ulice jednokierunkowe tylko zgodnie z kierunkiem; prędkość wg
   klasy drogi, odstęp od auta przed sobą. Na skrzyżowaniach: sygnalizacja (te same fazy co sygnalizatory w grze),
   pierwszeństwo – wloty podporządkowane (A-7) ustępują, przy równorzędnych – reguła prawej ręki, skręcający w lewo
   ustępuje jadącym z naprzeciwka; wjazd tylko, gdy tor przejazdu przez skrzyżowanie jest wolny i za skrzyżowaniem
   jest miejsce. Przejścia dla pieszych – zatrzymanie przed pieszym na pasach (z sygnalizacją – wg świateł). Przejazdy
   kolejowe – kolejka przed sygnalizatorem, gdy nadjeżdża pociąg (gracza albo tła); auto, które nie zdąży stanąć,
   przejeżdża. Ślepy koniec ulicy (skraj mapy) daleko od kamery – auto znika i pojawia się gdzie indziej; blisko –
   zawraca.

   Piesi: chodnikami (gdzie są w danych), na skrzyżowaniach za róg po łuku chodnika, przez przejścia dla pieszych
   (z sygnalizacją – na zielonym, bez – gdy nic nie nadjeżdża), przez przejazd kolejowy (czekają przy opuszczonych
   rogatkach); więcej przy stacjach.

   Gęstość i zasięg wg jakości grafiki (world.density) i opcji „Ruch uliczny” (world.streetLevel 0–3); ruch tylko
   w promieniu kilkuset metrów od kamery. */
(function () {
	'use strict';
	const T = window.THREE;
	const R = window.TrainRoutes;
	const NS = window.Train3D;
	const { hash, canvasTexture, glowTexture } = NS.util;
	const World = NS.World;
	const C = 200; // długość kawałka świata (jak w world.js)

	// prędkość wg klasy drogi (m/s): autostrada, ekspresowa, krajowa, wojewódzka, powiatowa, gminna, osiedlowa,
	// strefa zamieszkania, dojazdowa, deptak, inna
	const VMAX = [25, 22, 15, 14, 13.5, 11.5, 10, 5, 6, 0, 9];
	// pojazdy: 0 hatchback, 1 dostawczy, 2 sedan, 3 kombi (bryły z props.js), 4 ciężarowy, 5 autobus; długość (m),
	// przyspieszenie
	const LEN = [4.3, 5.2, 4.8, 4.9, 9.6, 12];
	const ACC = [2.2, 1.6, 2.2, 2.2, 1.0, 0.9];
	const BUS_PAINT = ['#c8102e', '#f2c400', '#1f5fbf', '#2e8b57', '#e8e8e8'];
	const PAINT = ['#b8282a', '#2e6fb1', '#e0b22a', '#ecf0f1', '#2c8a4f', '#7f8c8d', '#1d2a38', '#5b2d6e', '#d0d3d6', '#3b3f44', '#ecf0f1', '#1d2a38', '#d0d3d6'];
	const TRUCK_PAINT = ['#c0392b', '#ecf0f1', '#2e6fb1', '#e67e22', '#27ae60', '#f1c40f'];
	const SW_OFF = 1.15; // środek chodnika od krawędzi jezdni (chodnik 2 m za krawężnikiem 0,16 m)
	const tp = {}, tq = {};

	const lerp2 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
	// łamana (s, d): długości narastające
	function mkPath(pts, extra) {
		const cum = [0];
		for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
		return Object.assign({ pts, cum, L: cum[cum.length - 1] }, extra);
	}
	// punkt i kierunek łamanej w u
	function pathAt(P, u, out) {
		const n = P.pts.length;
		if (n < 2) { out.s = P.pts[0][0]; out.d = P.pts[0][1]; out.hs = 1; out.hd = 0; return out; }
		u = Math.max(0, Math.min(P.L, u));
		let k = P.hint || 0;
		if (k > n - 2 || P.cum[k] > u) k = 0;
		while (k < n - 2 && P.cum[k + 1] < u) k++;
		P.hint = k;
		const a = P.pts[k], b = P.pts[k + 1], L = P.cum[k + 1] - P.cum[k] || 1e-9, f = (u - P.cum[k]) / L;
		out.s = a[0] + (b[0] - a[0]) * f;
		out.d = a[1] + (b[1] - a[1]) * f;
		out.hs = (b[0] - a[0]) / L;
		out.hd = (b[1] - a[1]) / L;
		out.ch = P.ch || null; // ciąg ulicy (pas ruchu) – wysokość własnej drogi na skrzyżowaniu dwupoziomowym
		return out;
	}
	// krzywa Béziera (kwadratowa) z punktu a (kierunek ta) do b (kierunek tb): punkt kontrolny na przecięciu stycznych
	function turnPts(a, ta, b, tb, n = 10) {
		const den = ta[0] * tb[1] - ta[1] * tb[0];
		let c = null;
		if (Math.abs(den) > 0.05) {
			const t = ((b[0] - a[0]) * tb[1] - (b[1] - a[1]) * tb[0]) / den;
			const u = ((b[0] - a[0]) * ta[1] - (b[1] - a[1]) * ta[0]) / den;
			if (t > 0 && t < 40 && u > 0 && u < 40) c = [a[0] + ta[0] * t, a[1] + ta[1] * t];
		}
		if (!c) c = lerp2(a, b, 0.5);
		const out = [];
		for (let q = 0; q <= n; q++) {
			const t = q / n, v = 1 - t;
			out.push([v * v * a[0] + 2 * v * t * c[0] + t * t * b[0], v * v * a[1] + 2 * v * t * c[1] + t * t * b[1]]);
		}
		return out;
	}
	// najmniejszy promień łuku łamanej (do prędkości na skręcie)
	function minRadius(pts) {
		let r = Infinity;
		for (let k = 1; k + 1 < pts.length; k++) {
			const a = pts[k - 1], b = pts[k], c = pts[k + 1];
			const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
			const cr = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
			if (cr > 1e-6) r = Math.min(r, (ab * bc * ca) / (2 * cr));
		}
		return r;
	}

	/* ---------- sieć: pasy, skrzyżowania, łączniki przez przejazdy ---------- */
	World.prototype.streetNet = function () {
		const e = this.env;
		if (e.snet) return e.snet;
		const st = this.envStreets(), U = World.streetUtil;
		const net = { st, xcr: new Set(), ends: new Map(), J: new Map(), links: new Map(), lanes: new Map(), turns: new Map(), zebras: [] };
		const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
		st.chains.forEach((ch, i) => {
			ch.id = i;
			const g = ch.seg[Math.floor(ch.seg.length / 2)];
			ch.inf = g.inf;
			ch.ti = g.inf.ti;
			// jednokierunkowa: +1 – ruch w stronę rosnącego t ciągu, −1 – malejącego, 0 – dwukierunkowa
			ch.cdir = g.inf.one ? (g.flip ? -1 : 1) : 0;
			ch.car = ch.ti !== 9 && ch.L > 1.5;
			ch.wAvg = ch.w.reduce((a, b) => a + b, 0) / ch.w.length;
			for (const end of [0, 1]) push(net.ends, end ? ch.nb : ch.na, { ch, end });
		});
		for (const J of st.juncs) {
			const A0 = J.arms[0];
			J.node = A0.end ? A0.ch.nb : A0.ch.na;
			J.lights = U.junctionLights(J);
			J.grp = J.lights ? U.junctionGroups(J.arms) : null;
			J.off = hash(J.s * 0.031 + J.d * 0.7) * 60; // jak sygnalizatory skrzyżowania (real-env.js)
			J.arms.forEach((A, i) => { A.i = i; A.J = J; });
			net.J.set(J.node, J);
		}
		// przejścia dla pieszych: miejsca na ciągach (zajętość – piesi na pasach)
		for (const list of st.zByChunk.values()) for (const z of list) {
			z.off = hash(z.ch.L * 0.37 + z.t * 0.11) * 60; // jak sygnalizator przejścia (real-env.js)
			net.zebras.push(z);
		}
		/* przejazdy kolejowe: ulica ucięta przy torze – dwa końce ciągów (envCrossingPath: końce łącznika) połączone przez
		   tory; linia zatrzymania 2,6 m przed sygnalizatorem (3 m przed pasem torów), jak auta przy przejeździe w world.js */
		for (const cr of this.route.crossings) {
			const cp = (e.crPath && e.crPath.get(cr)) || this.envCrossingPath(cr);
			if (!cp) continue;
			const pa = cp.at(cp.link[0]), pb = cp.at(cp.link[1]);
			const near = (p) => {
				let best = null, bd = 2.5;
				for (const [n, list] of net.ends) {
					if (list.length !== 1 || net.J.has(n)) continue;
					const { ch, end } = list[0], q = ch.pts[end ? ch.pts.length - 1 : 0], dd = Math.hypot(q[0] - p[0], q[1] - p[1]);
					if (dd < bd) { bd = dd; best = n; }
				}
				return best;
			};
			const na = near(pa), nb = near(pb);
			if (na === null || nb === null || na === nb) continue;
			const X = { cr, cp, na, nb, stopA: cp.at(Math.max(0, cp.zone[0] - 5.6)), stopB: cp.at(Math.min(cp.L, cp.zone[1] + 5.6)), zone: [cp.at(cp.zone[0]), cp.at(cp.zone[1])] };
			net.xcr.add(cr);
			net.links.set(na, { X, other: nb, from: 'a' });
			net.links.set(nb, { X, other: na, from: 'b' });
		}
		e.snet = net;
		return net;
	};

	// odsunięcia pasów ruchu w kierunku jazdy (dodatnie – na prawo od kierunku jazdy), od wewnętrznego do prawego
	function laneOffs(ch) {
		const w = ch.wAvg, lanes = ch.inf.lanes || 0;
		if (ch.cdir) {
			const n = Math.max(1, Math.min(3, lanes || 1)), lw = w / n;
			return Array.from({ length: n }, (_, j) => -w / 2 + lw * (j + 0.5));
		}
		// wąska jezdnia: mijanie z naprzeciwka z odstępem (najmniej 1,25 m od osi)
		const n = lanes >= 4 ? 2 : 1, lw = Math.min(3.5, w / (2 * n));
		return Array.from({ length: n }, (_, j) => Math.max(1.25, lw * (j + 0.5)));
	}
	// pas ciągu ch w kierunku dir (+1 – rosnące t), numer j: łamana od wylotu skrzyżowania do linii zatrzymania
	World.prototype.streetLane = function (ch, dir, j) {
		const net = this.streetNet(), key = ch.id * 8 + (dir > 0 ? 0 : 4) + j;
		let P = net.lanes.get(key);
		if (P) return P;
		const U = World.streetUtil, offs = laneOffs(ch), off = offs[Math.min(j, offs.length - 1)];
		const t0 = ch.trim[0].t, t1 = ch.L - ch.trim[1].t;
		const a = dir > 0 ? t0 : t1, b = dir > 0 ? t1 : t0, len = Math.abs(b - a);
		const pts = [];
		const n = Math.max(1, Math.ceil(len / 3));
		for (let q = 0; q <= n; q++) pts.push(U.chPt(ch, a + ((b - a) * q) / n, 0, dir * off));
		if (pts.length < 2 || len < 0.05) pts.push([pts[0][0] + 0.01, pts[0][1]]);
		// przejścia dla pieszych na pasie (u od początku pasa)
		const zeb = [];
		for (const z of net.zebras) if (z.ch === ch) zeb.push({ z, u: (z.t - a) * dir });
		// przystanki autobusowe po stronie pasu (prawa w kierunku jazdy): u – środek autobusu przy przystanku
		const bus = [];
		for (const B of this.envBusStops()) if (B.ch === ch && B.dir === dir) bus.push({ B, u: (B.t - a) * dir });
		P = mkPath(pts, { kind: 'lane', ch, dir, j, n: offs.length, off, zeb, bus, vmax: VMAX[ch.ti] || 9, key });
		P.node = dir > 0 ? ch.nb : ch.na;
		net.lanes.set(key, P);
		return P;
	};
	// łącznik przez skrzyżowanie: z końca pasu P do początku pasu Q
	World.prototype.streetTurn = function (P, Q, extra) {
		const net = this.streetNet(), key = P.key * 100000 + Q.key;
		let X = net.turns.get(key);
		if (X) return X;
		const a = P.pts[P.pts.length - 1], b = Q.pts[0];
		const ta = [P.pts[P.pts.length - 1][0] - P.pts[P.pts.length - 2][0], P.pts[P.pts.length - 1][1] - P.pts[P.pts.length - 2][1]];
		const tb = [Q.pts[1][0] - Q.pts[0][0], Q.pts[1][1] - Q.pts[0][1]];
		const la = Math.hypot(ta[0], ta[1]) || 1, lb = Math.hypot(tb[0], tb[1]) || 1;
		ta[0] /= la; ta[1] /= la; tb[0] /= lb; tb[1] /= lb;
		const pts = turnPts(a, ta, b, tb);
		const cross = ta[0] * tb[1] - ta[1] * tb[0]; // > 0 – w prawo (d na prawo od s)
		const r = minRadius(pts);
		X = mkPath(pts, Object.assign({ kind: 'turn', from: P, to: Q, right: cross > 0.3, left: cross < -0.3, vmax: Math.max(3.5, Math.min(11, Math.sqrt(2.6 * r))) }, extra));
		net.turns.set(key, X);
		return X;
	};

	/* ---------- stan ruchu ---------- */
	/* plama światła na jezdni (noc): owal z miękkim brzegiem, jaśniejszy przy krawędzi bliżej auta (v = 0) – przed autem
	   od reflektorów, za autem mniejsza czerwona od świateł tylnych */
	const beamTex = () => canvasTexture('street-beam', 64, 128, (g, w, h) => {
		const img = g.createImageData(w, h);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
			const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h;
			const r = Math.hypot(u * (0.7 + v * 0.5), (v - 0.42) * 2.0);
			const a = Math.min(1, Math.max(0, 1 - r) ** 1.4 * (1.1 - v * 0.7)) * Math.min(1, v / 0.14);
			const i = (y * w + x) * 4;
			img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
			img.data[i + 3] = Math.round(a * 255);
		}
		g.putImageData(img, 0, 0);
	});
	World.prototype.streetLifeReset = function () {
		this.streetBroken = false;
		const L = this.slife;
		if (!L) return;
		for (const m of L.meshes) { this.scene.remove(m); m.dispose(); }
		if (L.peds) { this.scene.remove(L.peds.bodies, L.peds.heads); L.peds.bodies.dispose(); L.peds.heads.dispose(); }
		this.slife = null;
	};
	// bryła ciężarówki (przód = +z): kabina, skrzynia (lakier – kolor egzemplarza), koła, światła
	function truckGeo() {
		if (truckGeo.g) return truckGeo.g;
		const W1 = [1, 1, 1], GL = [0.06, 0.08, 0.11], TY = [0.05, 0.05, 0.05], RIM = [0.55, 0.57, 0.6], TRIM = [0.13, 0.13, 0.14], BOX = [0.86, 0.87, 0.88];
		const box = (w, h, d, x, y, z, color) => ({ geo: new T.BoxGeometry(w, h, d).translate(x, y, z), color });
		const parts = [
			box(2.4, 1.9, 2.0, 0, 1.75, 3.7, W1), // kabina
			box(2.3, 0.8, 0.06, 0, 2.05, 4.71, GL), // przednia szyba
			box(0.05, 0.6, 1.0, -1.21, 2.05, 3.95, GL), box(0.05, 0.6, 1.0, 1.21, 2.05, 3.95, GL),
			box(2.44, 0.35, 0.2, 0, 0.75, 4.75, TRIM), // zderzak
			box(2.0, 0.25, 9.2, 0, 0.85, -0.2, TRIM), // rama
			box(2.5, 2.7, 7.2, 0, 2.35, -1.3, BOX), // skrzynia (zabudowa)
		];
		for (const x of [-0.85, 0.85]) {
			parts.push(box(0.36, 0.16, 0.08, x, 1.0, 4.82, [1.7, 1.6, 1.25]));
			parts.push(box(0.3, 0.18, 0.06, x, 0.95, -4.92, [0.95, 0.1, 0.08]));
		}
		for (const z of [3.6, -2.6, -3.9]) for (const x of [-1.05, 1.05]) {
			parts.push({ geo: new T.CylinderGeometry(0.5, 0.5, 0.35, 14).rotateZ(Math.PI / 2).translate(x, 0.5, z), color: TY });
			parts.push({ geo: new T.CylinderGeometry(0.28, 0.28, 0.37, 10).rotateZ(Math.PI / 2).translate(x * 1.01, 0.5, z), color: RIM });
		}
		const merge = NS.props.merge;
		const isW = (c) => c === W1, isG = (c) => c === GL;
		truckGeo.g = { paint: merge(parts.filter((q) => isW(q.color))), glass: merge(parts.filter((q) => isG(q.color))), trim: merge(parts.filter((q) => !isW(q.color) && !isG(q.color))) };
		return truckGeo.g;
	}
	// bryła autobusu (przód = +z, 12 m): nadwozie (lakier), pas okien, szyby, drzwi, koła, światła, tablica kierunkowa
	function busGeo() {
		if (busGeo.g) return busGeo.g;
		const W1 = [1, 1, 1], GL = [0.06, 0.08, 0.11], TY = [0.05, 0.05, 0.05], RIM = [0.55, 0.57, 0.6], TRIM = [0.13, 0.13, 0.14];
		const box = (w, h, d, x, y, z, color) => ({ geo: new T.BoxGeometry(w, h, d).translate(x, y, z), color });
		const parts = [
			box(2.5, 2.55, 12, 0, 1.75, 0, W1),
			box(2.52, 1.0, 10.6, 0, 2.15, -0.3, GL),
			box(2.3, 1.5, 0.05, 0, 1.95, 6.01, GL),
			box(2.3, 0.9, 0.05, 0, 2.2, -6.01, GL),
			box(2.4, 0.3, 0.12, 0, 0.6, 6.02, TRIM), box(2.4, 0.3, 0.12, 0, 0.6, -6.02, TRIM),
		];
		for (const z of [4.6, 0.3, -4.0]) for (const x of [-1.27, 1.27]) parts.push(box(0.05, 2.2, 1.2, x, 1.55, z, [0.2, 0.22, 0.24]));
		for (const x of [-0.85, 0.85]) {
			parts.push(box(0.36, 0.16, 0.08, x, 0.95, 6.05, [1.7, 1.6, 1.25]));
			parts.push(box(0.3, 0.2, 0.06, x, 1.0, -6.05, [0.95, 0.1, 0.08]));
		}
		parts.push(box(1.6, 0.25, 0.06, 0, 2.85, 6.04, [1.6, 1.0, 0.1]));
		for (const z of [3.9, -3.2]) for (const x of [-1.08, 1.08]) {
			parts.push({ geo: new T.CylinderGeometry(0.5, 0.5, 0.32, 14).rotateZ(Math.PI / 2).translate(x, 0.5, z), color: TY });
			parts.push({ geo: new T.CylinderGeometry(0.28, 0.28, 0.34, 10).rotateZ(Math.PI / 2).translate(x * 1.01, 0.5, z), color: RIM });
		}
		const merge = NS.props.merge;
		const isW = (c) => c === W1, isG = (c) => c === GL;
		busGeo.g = { paint: merge(parts.filter((q) => isW(q.color))), glass: merge(parts.filter((q) => isG(q.color))), trim: merge(parts.filter((q) => !isW(q.color) && !isG(q.color))) };
		return busGeo.g;
	}
	World.prototype.streetLifeInit = function (capCars, capPeds) {
		World.materials(); // bryły postaci (World.G)
		const F = NS.props.carFixedMats();
		const paintM = new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.4, metalness: 0.3 });
		const L = { cars: [], peds: null, pedList: [], meshes: [], kinds: [], capCars, capPeds, view: null, spawnT: 0, cand: null, candAt: null, nextId: 1 };
		for (let k = 0; k < 6; k++) {
			const G = k === 5 ? busGeo() : k === 4 ? truckGeo() : NS.props.carGeo(k);
			const ms = [[G.paint, paintM, true], [G.glass, F.glass, false], [G.trim, F.trim, false]].map(([geo, m, paint]) => {
				const im = new T.InstancedMesh(geo, m, capCars);
				im.count = 0;
				im.frustumCulled = false;
				im.castShadow = this.shadows && paint;
				im.receiveShadow = true;
				if (paint) im.setColorAt(0, new T.Color(1, 1, 1));
				this.scene.add(im);
				L.meshes.push(im);
				return im;
			});
			L.kinds.push(ms);
		}
		// światła aut nocą: plamy na jezdni (reflektory i tylne) – jedna siatka instancji, kolor egzemplarza
		const bm = new T.MeshBasicMaterial({ map: beamTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
		const beams = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), bm, capCars * 2);
		beams.count = 0;
		beams.frustumCulled = false;
		beams.renderOrder = 2;
		beams.setColorAt(0, new T.Color(1, 1, 1));
		this.scene.add(beams);
		L.meshes.push(beams);
		L.beams = beams;
		/* poświata reflektorów i świateł tylnych nocą (widoczna z daleka): kwadraty zwrócone do kamery, jaśniejsze, gdy
		   światło świeci w jej stronę */
		const gm = new T.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false });
		const glows = new T.InstancedMesh(new T.PlaneGeometry(1, 1), gm, capCars * 4);
		glows.count = 0;
		glows.frustumCulled = false;
		glows.renderOrder = 3;
		glows.setColorAt(0, new T.Color(1, 1, 1));
		this.scene.add(glows);
		L.meshes.push(glows);
		L.glows = glows;
		const pm = World.peopleMeshes(capPeds);
		pm.bodies.frustumCulled = pm.heads.frustumCulled = false;
		pm.bodies.castShadow = pm.heads.castShadow = this.shadows;
		pm.bodies.count = pm.heads.count = 0;
		this.scene.add(pm.bodies, pm.heads);
		L.peds = pm;
		// zwrot postaci: model idący ku rosnącemu s ma obrót −heading (jak pasażerowie na peronach)
		R.sidePoint(this.route, 100, 0, tp);
		const h = tp.heading, x0 = tp.x, z0 = tp.z;
		R.sidePoint(this.route, 101, 0, tq);
		L.yawOff = -h - Math.atan2(tq.x - x0, tq.z - z0);
		this.slife = L;
		return L;
	};

	// kilometraż i odsunięcie kamery (rzut na oś trasy, kilka kroków Newtona od poprzedniego wyniku)
	World.prototype.streetView = function (sim) {
		const L = this.slife, r = this.route, v = this.viewPos;
		let s = L.view ? L.view[0] : sim.st.pos;
		if (!v || !Number.isFinite(v.x)) return [sim.st.pos, 0];
		if (L.view && Math.abs(s - sim.st.pos) > 3000) s = sim.st.pos;
		let d = 0;
		for (let it = 0; it < 4; it++) {
			R.sidePoint(r, s, 0, tp);
			R.sidePoint(r, s + 1, 0, tq);
			const tx = tq.x - tp.x, tz = tq.z - tp.z, tl = Math.hypot(tx, tz) || 1;
			const ds = ((v.x - tp.x) * tx + (v.z - tp.z) * tz) / tl;
			s += Math.max(-300, Math.min(300, ds));
			// odsunięcie: w prawo od kierunku trasy
			R.sidePoint(r, s, 0, tp);
			R.sidePoint(r, s, 1, tq);
			d = ((v.x - tp.x) * (tq.x - tp.x) + (v.z - tp.z) * (tq.z - tp.z));
		}
		L.view = [s, d];
		return L.view;
	};

	// sygnalizacja przejazdu kolejowego: jak w world.js (pociąg gracza albo pociąg tła blisko przejazdu)
	World.prototype.streetXing = function (sim, cr) {
		const front = sim.st.pos;
		const on = (t) => (t.dir > 0 ? t.s > cr.pos - 5 && t.s - t.len < cr.pos + 5 : t.s < cr.pos + 5 && t.s + t.len > cr.pos - 5);
		const near = (t) => (t.dir > 0 ? t.s > cr.pos - 800 && t.s - t.len < cr.pos + 5 : t.s < cr.pos + 800 && t.s + t.len > cr.pos - 5) && (t.v === undefined || t.v > 0.5 || on(t));
		const ot = this.otherTrain;
		return (front > cr.pos - 800 && front - sim.L < cr.pos + 5) || (this.otherTrains ? this.otherTrains.some(near) : !!ot && near({ dir: -1, s: ot.s, len: ot.len }));
	};
	const tlNow = (J, A, time) => World.streetUtil.tlState(J.grp[A.i], (time + J.off) % 60);

	/* plan za końcem pasu P: [łącznik, następny pas] albo null (ślepy koniec – auto znika) albo zawracanie */
	World.prototype.streetPlan = function (P, car, far) {
		const net = this.streetNet(), n = P.node, ch = P.ch;
		const J = net.J.get(n);
		const laneOf = (ch2, dir, right) => { const offs = laneOffs(ch2); const j = right ? offs.length - 1 : Math.floor(Math.random() * offs.length); return this.streetLane(ch2, dir, j); };
		if (J) {
			const A = J.arms.find((x) => x.ch === ch && x.end === (P.dir > 0 ? 1 : 0));
			if (A) {
				const opts = [];
				for (const B of J.arms) {
					if (B === A || !B.ch.car) continue;
					const dir = B.end === 0 ? 1 : -1;
					if (B.ch.cdir && B.ch.cdir !== dir) continue; // jednokierunkowa pod prąd
					// kąt skrętu: na wprost – częściej, ciężarówki – drogi wyższych klas
					const dot = -(A.u[0] * B.u[0] + A.u[1] * B.u[1]);
					let w = dot > 0.7 ? 3 : 1.4;
					if (car.kind === 4 && B.ch.ti > 5) w *= 0.15;
					// autobus: ulice z przystankami, bez dróg dojazdowych
					if (car.kind === 5) w *= this.chBusStops(B.ch) ? 5 : B.ch.ti > 6 ? 0.05 : 1;
					if (B.ch.ti >= 8) w *= 0.3;
					opts.push({ B, dir, w });
				}
				if (opts.length) {
					let r = Math.random() * opts.reduce((a, o) => a + o.w, 0), o = opts[0];
					for (const x of opts) { r -= x.w; if (r <= 0) { o = x; break; } }
					const cross = A.u[0] * o.B.u[1] - A.u[1] * o.B.u[0];
					const Q = laneOf(o.B.ch, o.dir, cross < 0);
					return [this.streetTurn(P, Q, { J, inArm: A, outArm: o.B }), Q];
				}
			}
		}
		const lk = net.links.get(n);
		if (lk) {
			const list = net.ends.get(lk.other) || [];
			const o = list.find((x) => x.ch.car);
			if (o) {
				const dir = o.end === 0 ? 1 : -1;
				if (!o.ch.cdir || o.ch.cdir === dir) {
					const Q = laneOf(o.ch, dir, true);
					return [this.streetTurn(P, Q, { X: lk.X, link: true }), Q];
				}
			}
		}
		// ślepy koniec: daleko od kamery – znika; blisko – zawraca (ulica dwukierunkowa)
		if (far || ch.cdir) return null;
		const Q = laneOf(ch, -P.dir, true);
		const a = P.pts[P.pts.length - 1], b = Q.pts[0];
		const ta = [P.pts[P.pts.length - 1][0] - P.pts[P.pts.length - 2][0], P.pts[P.pts.length - 1][1] - P.pts[P.pts.length - 2][1]];
		const l = Math.hypot(ta[0], ta[1]) || 1;
		const out = [ta[0] / l, ta[1] / l], w = Math.max(3, Math.hypot(b[0] - a[0], b[1] - a[1]));
		const c1 = [a[0] + out[0] * w * 0.9, a[1] + out[1] * w * 0.9], c2 = [b[0] + out[0] * w * 0.9, b[1] + out[1] * w * 0.9];
		const pts = [];
		for (let q = 0; q <= 10; q++) {
			const t = q / 10, v = 1 - t;
			pts.push([v * v * v * a[0] + 3 * v * v * t * c1[0] + 3 * v * t * t * c2[0] + t * t * t * b[0], v * v * v * a[1] + 3 * v * v * t * c1[1] + 3 * v * t * t * c2[1] + t * t * t * b[1]]);
		}
		return [mkPath(pts, { kind: 'turn', uturn: true, vmax: 2.5 }), Q];
	};

	// czy na ciągu są przystanki autobusowe
	World.prototype.chBusStops = function (ch) {
		if (ch.hasBus === undefined) ch.hasBus = this.envBusStops().some((B) => B.ch === ch);
		return ch.hasBus;
	};
	// kolejka odcinków auta: zawsze co najmniej do następnego pasu (łącznik + pas)
	World.prototype.streetQueue = function (car, far) {
		while (car.q.length < 3) {
			const last = car.q[car.q.length - 1];
			if (last.kind !== 'lane') break;
			const pl = this.streetPlan(last, car, far);
			if (!pl) { car.q.push({ kind: 'end', L: 0, pts: [last.pts[last.pts.length - 1]] }); break; }
			car.q.push(pl[0], pl[1]);
		}
	};

	// położenie w odległości du od środka auta wzdłuż jego kolejki (ujemne – za nim, po poprzednim odcinku)
	function carPoint(car, du, out) {
		let u = car.u + du, i = 0;
		const q = car.q;
		if (u < 0 && car.prev) return pathAt(car.prev, car.prev.L + u, out);
		while (i < q.length - 1 && u > q[i].L && q[i + 1].kind !== 'end') { u -= q[i].L; i++; }
		return pathAt(q[i], u, out);
	}
	// odległość wzdłuż kolejki od środka auta do punktu u odcinka P (Infinity – poza kolejką)
	function aheadOf(car, P, u) {
		let acc = -car.u;
		for (const x of car.q) {
			if (x === P) return acc + u;
			acc += x.L;
		}
		return Infinity;
	}

	// czy tory przejazdu przez skrzyżowanie (łączniki) się przecinają / zbiegają
	World.prototype.streetConflict = function (A, B) {
		// ten sam pas wlotu – odstęp jak za autem; sąsiednie pasy wlotu – kolizja tylko, gdy tory się zbliżają (skręt
		// z dwóch pasów naraz)
		if (A.from === B.from) return false;
		if (A === B) return true;
		if (A.to === B.to) return true;
		const net = this.streetNet();
		const k2 = A.from.key + '|' + A.to.key + '|' + B.from.key + '|' + B.to.key;
		if (!net.conf) net.conf = new Map();
		let v = net.conf.get(k2);
		if (v === undefined) {
			v = false;
			for (const p of A.pts) { for (const q of B.pts) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 2.6) { v = true; break; } if (v) break; }
			net.conf.set(k2, v);
		}
		return v;
	};

	/* ---------- aktualizacja ---------- */
	World.prototype.updateStreetLife = function (sim, dt, dark) {
		this.streetDark = dark || 0;
		if (this.streetBroken || !this.env || !this.env.dem || !this.route.env || !this.route.env.r) return;
		try { this.streetStep(sim, dt); } catch (err) {
			// błąd w ruchu ulicznym nie zatrzymuje gry – ruch wyłączony do zmiany trasy
			console.error('Ruch uliczny wyłączony:', err);
			this.streetLifeReset();
			this.streetBroken = true;
		}
	};
	World.prototype.streetStep = function (sim, dt) {
		const level = this.streetLevel === undefined ? 2 : this.streetLevel;
		const dens = this.density || 0.8, tier = dens < 0.65 ? 0 : dens < 1 ? 1 : 2;
		const mul = [0, 0.5, 1, 1.5][level] || 0;
		const RAD = [300, 450, 600][tier], nCars = Math.round([15, 30, 50][tier] * mul), nPeds = Math.round([20, 40, 70][tier] * mul);
		if (!mul) { if (this.slife) this.streetLifeReset(); return; } // ruch uliczny wyłączony w opcjach
		if (!this.slife) {
			this.streetLifeInit(Math.ceil(50 * 1.5) + 5, Math.ceil(70 * 1.5) + 5);
		}
		const L = this.slife, net = this.streetNet();
		const [vs, vd] = this.streetView(sim);
		// skok kamery (inne miejsce trasy): ruch od nowa w całym zasięgu
		if (L.last && Math.hypot(L.last[0] - vs, L.last[1] - vd) > RAD) { L.cars.length = 0; for (const p of L.pedList) if (p.z) p.z.busy = 0; L.pedList.length = 0; L.age = 0; }
		L.last = [vs, vd];
		dt = Math.min(dt, 0.1);
		// stany przejazdów kolejowych w pobliżu
		const xs = new Map();
		for (const lk of net.links.values()) if (!xs.has(lk.X) && Math.abs(lk.X.cr.pos - vs) < RAD + 200) xs.set(lk.X, this.streetXing(sim, lk.X.cr));
		this.updateStreetCars(sim, dt, L, net, vs, vd, RAD, nCars, xs);
		this.updateStreetPeds(sim, dt, L, net, vs, vd, RAD, nPeds, xs);
	};

	// kandydaci do pojawienia się: punkty pasów (i chodników) w zasięgu – co 2 s albo po przesunięciu kamery
	World.prototype.streetCand = function (L, net, vs, vd, RAD) {
		if (L.cand && L.candAt && Math.hypot(L.candAt[0] - vs, L.candAt[1] - vd) < 60) return L.cand;
		const cars = [], peds = [];
		const stations = this.route.stations.map((x) => (x.platformStart + x.platformEnd) / 2);
		for (const ch of net.st.chains) {
			for (let k = 0; k + 1 < ch.pts.length; k++) {
				const a = ch.pts[k], b = ch.pts[k + 1], segL = ch.cum[k + 1] - ch.cum[k];
				for (let t = 0; t < segL; t += 12) {
					const p = lerp2(a, b, t / (segL || 1)), dist = Math.hypot(p[0] - vs, p[1] - vd);
					if (dist > RAD) continue;
					const tt = ch.cum[k] + t;
					if (tt < ch.trim[0].t + 2 || tt > ch.L - ch.trim[1].t - 2) continue;
					if (ch.car) cars.push({ ch, t: tt, dist });
					const sw = ch.sw[k];
					if (sw[0] || sw[1]) {
						const nearSt = stations.reduce((m, x) => Math.min(m, Math.abs(x - p[0]) + Math.abs(p[1]) * 0.5), Infinity);
						peds.push({ ch, k, t: tt, dist, w: 1 + 3 * Math.exp(-nearSt / 180) });
					}
				}
			}
		}
		L.cand = { cars, peds, pedW: peds.reduce((a, x) => a + x.w, 0) };
		L.candAt = [vs, vd];
		return L.cand;
	};

	World.prototype.updateStreetCars = function (sim, dt, L, net, vs, vd, RAD, nCars, xs) {
		const cars = L.cars, P0 = {}, P1 = {};
		// usuwanie: za daleko od kamery
		for (let i = cars.length - 1; i >= 0; i--) {
			const c = cars[i];
			// za daleko od kamery; nadmiar (mniejszy ruch w opcjach) – najdalsze z końca listy
			if (Math.hypot(c.p[0] - vs, c.p[1] - vd) > RAD * 1.2 || (cars.length > nCars && Math.hypot(c.p[0] - vs, c.p[1] - vd) > RAD * 0.5)) cars.splice(i, 1);
		}
		// pojawianie się: do kilku na klatkę; po starcie w całym zasięgu, potem dalej od kamery
		const cand = this.streetCand(L, net, vs, vd, RAD);
		for (let tries = 0; cars.length < nCars && tries < 6 && cand.cars.length; tries++) {
			const x = cand.cars[Math.floor(Math.random() * cand.cars.length)];
			if (L.age > 2 && x.dist < RAD * 0.55) continue;
			if (!this.chunks.has(Math.floor(x.ch.pts[0][0] / C)) && !this.chunks.has(Math.floor(x.ch.pts[x.ch.pts.length - 1][0] / C))) continue;
			const ch = x.ch, dirs = ch.cdir ? [ch.cdir] : [1, -1], dir = dirs[Math.floor(Math.random() * dirs.length)];
			const offs = laneOffs(ch), P = this.streetLane(ch, dir, Math.floor(Math.random() * offs.length));
			const u = (x.t - (dir > 0 ? ch.trim[0].t : ch.L - ch.trim[1].t)) * dir;
			if (u < 0 || u > P.L) continue;
			const pos = pathAt(P, u, P0);
			if (cars.some((o) => Math.hypot(o.p[0] - pos.s, o.p[1] - pos.d) < 12)) continue;
			const r = Math.random();
			const kind = ch.ti <= 4 && r < 0.12 ? 4 : r < 0.25 ? 1 : [0, 2, 3][Math.floor(Math.random() * 3)];
			const car = { id: L.nextId++, kind, len: LEN[kind], acc: ACC[kind], drv: 0.88 + Math.random() * 0.22, q: [P], u, v: 0, prev: null, p: [pos.s, pos.d], h: [pos.hs, pos.hd], wait: 0,
				color: kind === 5 ? BUS_PAINT[Math.floor(Math.random() * BUS_PAINT.length)] : kind === 4 ? TRUCK_PAINT[Math.floor(Math.random() * TRUCK_PAINT.length)] : PAINT[Math.floor(Math.random() * PAINT.length)], done: new Set() };
			car.v = Math.min(P.vmax * car.drv, 8);
			this.streetQueue(car, Math.hypot(pos.s - vs, pos.d - vd) > RAD * 0.6);
			cars.push(car);
		}
		/* autobusy: do 3 naraz (gdy w zasięgu są przystanki – jeden na trzy przystanki), pojawiają się na pasie przed
		   przystankiem (po starcie – dalej od kamery) */
		const nBus = cars.filter((o) => o.kind === 5).length;
		const stops = this.envBusStops().filter((B) => Math.hypot(B.s - vs, B.d - vd) < RAD * 0.9 && (!(L.age > 2) || Math.hypot(B.s - vs, B.d - vd) > RAD * 0.55));
		if (nBus < Math.min(3, Math.ceil(stops.length / 3)) && stops.length && Math.random() < 0.05) {
			const B = stops[Math.floor(Math.random() * stops.length)], ch = B.ch;
			if (ch.car && ch.ti <= 8 && (!ch.cdir || ch.cdir === B.dir) && this.chunks.has(Math.floor(B.s / C))) {
				const P = this.streetLane(ch, B.dir, laneOffs(ch).length - 1), S = P.bus.find((x) => x.B === B);
				const u = S ? Math.max(6, S.u - 30 - Math.random() * 30) : -1;
				if (u >= 0 && u < P.L) {
					const pos = pathAt(P, u, P0);
					if (!cars.some((o) => Math.hypot(o.p[0] - pos.s, o.p[1] - pos.d) < 16)) {
						const bus = { id: L.nextId++, kind: 5, len: LEN[5], acc: ACC[5], drv: 0.9, q: [P], u, v: 6, prev: null, p: [pos.s, pos.d], h: [pos.hs, pos.hd], wait: 0, color: BUS_PAINT[Math.floor(Math.random() * BUS_PAINT.length)], done: new Set() };
						this.streetQueue(bus, Math.hypot(pos.s - vs, pos.d - vd) > RAD * 0.6);
						cars.push(bus);
					}
				}
			}
		}
		L.age = (L.age || 0) + dt;
		const time = this.time;
		// położenia i kierunki (przed regułami)
		for (const c of cars) {
			const p = carPoint(c, 0, P0);
			c.p[0] = p.s; c.p[1] = p.d; c.h[0] = p.hs; c.h[1] = p.hd;
		}
		for (const c of cars) {
			const P = c.q[0];
			let vmax = (P.vmax || 9) * c.drv;
			const cap = (dist, vEnd = 0) => { vmax = Math.min(vmax, Math.sqrt(Math.max(0, vEnd * vEnd + 2 * 3.2 * Math.max(0, dist)))); };
			// łączniki przed autem (skręt – wolniej); ślepy koniec – zatrzymanie
			for (let i = 1; i < c.q.length; i++) {
				const X = c.q[i], dist = aheadOf(c, X, 0) - c.len / 2;
				if (X.kind === 'turn') cap(dist, X.vmax);
			}
			// sygnalizacja dalszych skrzyżowań w kolejce (krótki odcinek między skrzyżowaniami – hamowanie z wyprzedzeniem)
			for (let i = 2; i < c.q.length; i++) {
				const Y = c.q[i];
				if (Y.kind !== 'turn' || !Y.J || !Y.J.lights) continue;
				const dist = aheadOf(c, Y, 0) - c.len / 2 - 0.4, s2 = tlNow(Y.J, Y.inArm, this.time);
				if (s2 >= 2 || (s2 === 1 && dist > (c.v * c.v) / 8)) cap(dist, 0);
			}
			// auto przed sobą (ten sam kierunek, w pasie przed nami)
			let gap = Infinity;
			for (const o of cars) {
				if (o === c) continue;
				const rs = o.p[0] - c.p[0], rd = o.p[1] - c.p[1], fwd = rs * c.h[0] + rd * c.h[1];
				if (fwd <= 0 || fwd > 45) continue;
				const lat = Math.abs(-rs * c.h[1] + rd * c.h[0]);
				if (lat > 1.7 || o.h[0] * c.h[0] + o.h[1] * c.h[1] < 0.2) continue;
				gap = Math.min(gap, fwd - (c.len + o.len) / 2 - 2);
			}
			if (gap < Infinity) cap(gap - 0.5, 0);
			/* wąska jezdnia dwukierunkowa (do 5,5 m): mijanie z naprzeciwka powoli (do ok. 15 km/h, gdy auto z naprzeciwka
			   jest bliżej niż 30 m) */
			if (P.kind === 'lane' && !P.ch.cdir && P.ch.wAvg < 5.5) for (const o of cars) {
				if (o === c || o.h[0] * c.h[0] + o.h[1] * c.h[1] > -0.5) continue;
				const rs = o.p[0] - c.p[0], rd = o.p[1] - c.p[1], fwd = rs * c.h[0] + rd * c.h[1];
				if (fwd > -2 && fwd < 30 && Math.abs(-rs * c.h[1] + rd * c.h[0]) < 5) { vmax = Math.min(vmax, 4.2); break; }
			}
			// skrzyżowanie przed autem: zgoda na wjazd (sygnalizacja, pierwszeństwo, wolny przejazd, miejsce za nim) –
			// tylko pierwsze auto przed linią (dalsze stoją za nim); zgoda cofnięta, gdy auto jeszcze przed linią,
			// a zapaliło się czerwone
			const X = c.q[1];
			const dStop = X && X.J ? P.L - c.u - c.len / 2 - 0.4 : Infinity;
			if (c.cleared && P.kind === 'lane' && X.J && X.J.lights && (dStop > 1 || c.v < 2) && dStop > -1 && tlNow(X.J, X.inArm, time) >= 2) c.cleared = false;
			if (P.kind === 'lane' && X && X.kind === 'turn' && X.J && !c.cleared && gap > dStop - 1) {
				if (dStop < 40) {
					const ok = this.streetMayEnter(c, P, X, dStop, cars, time, dt);
					if (ok) c.cleared = true;
					else cap(dStop, 0);
				}
			}
			// przejścia dla pieszych na pasie (także na następnych odcinkach – przejście tuż za skrzyżowaniem)
			for (let qi = 0; qi < c.q.length && qi < 3; qi++) for (const zb of c.q[qi].kind === 'lane' ? c.q[qi].zeb : []) {
				const dz = aheadOf(c, c.q[qi], zb.u) - c.len / 2 - 3.2;
				if (dz < -2.5 || dz > 35) continue;
				const z = zb.z;
				let stop = (z.busy || 0) > 0;
				if (z.sig && !stop) { const s2 = World.streetUtil.tlState(2, (time + (z.off || 0)) % 60); if (s2 >= 2 || (s2 === 1 && dz > (c.v * c.v) / 8)) stop = true; }
				if (stop && dz > -0.5) cap(dz, 0);
			}
			// autobus: postój na przystanku (15–25 s); pasażerowie wsiadają i wysiadają (piesi przy przystanku)
			if (c.kind === 5) for (let qi = 0; qi < c.q.length && qi < 3; qi++) for (const S of c.q[qi].kind === 'lane' ? c.q[qi].bus : []) {
				if (c.done.has(S.B.id)) continue;
				const du = aheadOf(c, c.q[qi], S.u);
				if (du < -2 || du > 70) continue;
				if (du < 1 && c.v < 0.4) {
					if (!c.dwell) c.dwell = 15 + Math.random() * 10;
					c.dwell -= dt;
					if (c.dwell <= 0) { c.done.add(S.B.id); c.dwell = 0; this.streetBusLeft(S.B); }
				}
				if (!c.done.has(S.B.id)) cap(du, 0);
			}
			/* przejazd kolejowy: linia zatrzymania (stopA / stopB – 2,6 m przed sygnalizatorem) wzdłuż drogi przed łącznikiem
			   przez tory (odcinek przed nim bywa krótszy niż metr – odległość od początku łącznika w linii prostej) */
			for (let i = 0; i < c.q.length; i++) {
				const Y = c.q[i];
				if (!Y.link) continue;
				const Xg = Y.X, on = xs.get(Xg), a = Y.pts[0];
				const S = Math.hypot(a[0] - Xg.stopA[0], a[1] - Xg.stopA[1]) < Math.hypot(a[0] - Xg.stopB[0], a[1] - Xg.stopB[1]) ? Xg.stopA : Xg.stopB;
				const b = Y.pts[Y.pts.length - 1], bl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
				const proj = ((S[0] - a[0]) * (b[0] - a[0]) + (S[1] - a[1]) * (b[1] - a[1])) / bl;
				const dist = aheadOf(c, Y, 0) + (proj > 0 ? proj : -Math.hypot(S[0] - a[0], S[1] - a[1])) - c.len / 2;
				if (on) {
					if (!c.xgo && (dist < -0.3 || (!c.xseen && dist < (c.v * c.v) / 12))) c.xgo = true;
					if (!c.xgo) cap(dist, 0);
				} else c.xgo = false;
				c.xseen = on;
				break;
			}
			// przyspieszanie / hamowanie
			vmax = Math.max(0, vmax);
			c.v = vmax > c.v ? Math.min(vmax, c.v + c.acc * dt) : Math.max(vmax, c.v - 6.5 * dt);
			if (c.v < 0.05 && vmax < 0.3) c.v = 0;
		}
		// ruch wzdłuż kolejki
		for (let i = cars.length - 1; i >= 0; i--) {
			const c = cars[i];
			c.u += c.v * dt;
			while (c.u > c.q[0].L && c.q.length > 1) {
				if (c.q[1].kind === 'end') { c.u = c.q[0].L; c.v = 0; c.gone = true; break; }
				c.u -= c.q[0].L;
				c.prev = c.q.shift();
				if (c.q[0].kind === 'lane') { c.cleared = false; c.wait = 0; }
				this.streetQueue(c, Math.hypot(c.p[0] - vs, c.p[1] - vd) > RAD * 0.6);
			}
			if (c.gone) cars.splice(i, 1);
		}
		this.drawStreetCars(L, cars);
	};

	/* zgoda na wjazd na skrzyżowanie J (łącznik X z pasu P): sygnalizacja, pierwszeństwo, wolny przejazd, miejsce za
	   skrzyżowaniem; czekanie dłużej niż 8 s na auta, które dopiero nadjeżdżają – jedzie (bez zakleszczeń) */
	World.prototype.streetMayEnter = function (c, P, X, dStop, cars, time, dt) {
		const J = X.J, A = X.inArm;
		if (J.lights) {
			const s = tlNow(J, A, time);
			if (s === 2 || s === 3) return false;
			if (s === 1 && dStop > (c.v * c.v) / 8 + 1) return false;
		}
		if (dStop > 25) return false; // zgoda dopiero blisko linii
		c.wait += dt;
		// wlot podporządkowany bez sygnalizacji: najpierw prawie stanąć
		if (!J.lights && A.minor && c.v > 3) return false;
		const right = [-c.h[1], c.h[0]];
		for (const o of cars) {
			if (o === c) continue;
			const oq = o.q[0];
			// auto na skrzyżowaniu – kolizyjny tor przejazdu
			if (oq.kind === 'turn' && oq.J === J) { if (this.streetConflict(oq, X)) return false; continue; }
			const OX = o.q[1];
			if (oq.kind !== 'lane' || !OX || OX.J !== J) continue;
			if (o.cleared) { if (this.streetConflict(OX, X)) return false; continue; }
			const od = oq.L - o.u - o.len / 2;
			if (od > 28 || !this.streetConflict(OX, X)) continue;
			if (c.wait > 8) continue;
			// pierwszeństwo nadjeżdżającego o
			let prio;
			if (J.lights) {
				const so = tlNow(J, OX.inArm, time);
				prio = so === 0 && X.left && !OX.left;
			} else if (A.minor !== OX.inArm.minor) prio = !!A.minor;
			else {
				const u = OX.inArm.u;
				prio = u[0] * right[0] + u[1] * right[1] > 0.5 || (X.left && !OX.left && u[0] * c.h[0] + u[1] * c.h[1] > 0.7);
			}
			if (prio && od < 6 + o.v * 3) return false;
		}
		// miejsce za skrzyżowaniem
		const Q = c.q[2];
		if (Q && Q.kind === 'lane') for (const o of cars) {
			if (o === c) continue;
			if (o.q[0] === Q && o.u - o.len / 2 < c.len + 2) return false;
			if (o.q[0].kind === 'turn' && o.q[1] === Q && o.q[0] !== X) return false;
		}
		return true;
	};

	/* Wysokość jezdni pod autem / pieszym – jak rysowana jezdnia (buildEnvRoads): nawierzchnia (surfY) + ok. 0,1 m;
	   przy torze tylko na przejeździe w poziomie – poziom torowiska (roadY); pod mostem kolejowym i nad tunelem –
	   nawierzchnia (dawniej roadY: przy torze auta wjeżdżały na poziom szyn – na most albo w głąb tunelu); skrzyżowanie dwupoziomowe dróg
	   (roadBridged) – wysokość własnej drogi ciągu ch (dolna jezdnia pod wiaduktem, górna na nim). */
	World.prototype.streetY = function (s, d, ch) {
		if (!this.env || !this.surfY || (Math.abs(d) < 7.5 && this.nearLevelCrossing(s))) return this.roadY(s, d);
		if (ch && this.roadBridged(s, d)) {
			const k = nearSeg(ch, s, d), inf = ch.seg && ch.seg[k] && ch.seg[k].inf;
			const z = inf ? this.envStreets().rowZAt(inf, s, d) : null;
			if (z !== null) return z + roadDy(inf.ti);
		}
		return this.surfY(s, d) + 0.1;
	};
	/* przejazd w poziomie w pobliżu kilometra s (do 25 m – ulica przecina tor pod kątem); poza nim jezdnia przy torze
	   to most nad nią albo tunel pod nią (np. linia średnicowa w Warszawie) – nie poziom torowiska */
	World.prototype.nearLevelCrossing = function (s) {
		for (const cr of this.route.crossings) if (Math.abs(cr.pos - s) < 25) return true;
		return false;
	};
	// jak w buildEnvRoads: jezdnie wyższej klasy minimalnie wyżej (bez migotania na styku)
	const roadDy = (ti) => 0.1 + (10 - (ti || 10)) * 0.003;
	// odcinek ciągu najbliższy punktowi (s, d)
	function nearSeg(ch, s, d) {
		let best = 0, bd = Infinity;
		for (let k = 0; k + 1 < ch.pts.length; k++) {
			const a = ch.pts[k], b = ch.pts[k + 1], ds = b[0] - a[0], dd = b[1] - a[1], L2 = ds * ds + dd * dd || 1;
			const t = Math.max(0, Math.min(1, ((s - a[0]) * ds + (d - a[1]) * dd) / L2));
			const x = Math.hypot(s - a[0] - ds * t, d - a[1] - dd * t);
			if (x < bd) { bd = x; best = k; }
		}
		return best;
	}

	const Y_UP = new T.Vector3(0, 1, 0), BEAM_W = new T.Color(1, 0.86, 0.62), BEAM_R = new T.Color(1, 0.12, 0.06);
	/* poświata świateł: przy każdym aucie dwa reflektory (z przodu, 0,6 m od osi, 0,7 m nad jezdnią) i dwa światła tylne;
	   kwadrat zwrócony do kamery, siła wg kąta (światło do kamery – pełna, z boku – słaba), wielkość rośnie z odległością
	   (widoczne z daleka) */
	const GLOW_W = new T.Color(1, 0.9, 0.7), GLOW_R = new T.Color(1, 0.1, 0.05);
	World.prototype.drawStreetGlows = function (L, cars, dark) {
		const G = L.glows, cam = this.viewPos;
		let n = 0;
		if (dark > 0.25 && cam) {
			const kd = Math.min(1, (dark - 0.25) / 0.35), m4 = new T.Matrix4(), q = new T.Quaternion(), p3 = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
			const look = new T.Matrix4(), up = new T.Vector3(0, 1, 0), F = {}, B = {};
			for (const c of cars) {
				if (!this.chunks.has(Math.floor(c.p[0] / C))) continue;
				carPoint(c, c.len / 2, F);
				carPoint(c, -c.len / 2, B);
				R.sidePoint(this.route, F.s, F.d, tp);
				const fx = tp.x, fz = tp.z, fy = this.streetY(F.s, F.d, F.ch);
				R.sidePoint(this.route, B.s, B.d, tp);
				const bx = tp.x, bz = tp.z, by = this.streetY(B.s, B.d, B.ch);
				const L0 = Math.hypot(fx - bx, fz - bz) || 1, ux = (fx - bx) / L0, uz = (fz - bz) / L0, rx = -uz, rz = ux;
				const dist = Math.hypot(cam.x - fx, cam.z - fz);
				if (dist > 900) continue;
				const size = 0.5 + dist * 0.004;
				for (const [px, py, pz, dir, base, kk] of [
					[fx + rx * 0.62, fy + 0.72, fz + rz * 0.62, 1, GLOW_W, 1], [fx - rx * 0.62, fy + 0.72, fz - rz * 0.62, 1, GLOW_W, 1],
					[bx + rx * 0.66, by + 0.8, bz + rz * 0.66, -1, GLOW_R, c.v < 0.5 ? 0.9 : 0.6], [bx - rx * 0.66, by + 0.8, bz - rz * 0.66, -1, GLOW_R, c.v < 0.5 ? 0.9 : 0.6],
				]) {
					const tx = cam.x - px, tz = cam.z - pz, tl = Math.hypot(tx, tz) || 1;
					const facing = (ux * tx + uz * tz) / tl * dir; // 1 – światło do kamery
					const k = kd * kk * (0.15 + 0.85 * Math.max(0, facing) ** 2);
					if (k < 0.03) continue;
					p3.set(px + (ux * dir * 0.05), py, pz + (uz * dir * 0.05));
					look.lookAt(cam, p3, up);
					q.setFromRotationMatrix(look);
					const s0 = size * (dir > 0 ? 1.6 : 1.0);
					m4.compose(p3, q, sc.set(s0, s0, s0));
					G.setMatrixAt(n, m4);
					G.setColorAt(n, col.copy(base).multiplyScalar(k));
					n++;
				}
			}
		}
		G.count = n;
		G.instanceMatrix.needsUpdate = true;
		if (G.instanceColor) G.instanceColor.needsUpdate = true;
	};
	World.prototype.drawStreetCars = function (L, cars) {
		const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(0, 0, 0, 'YXZ'), p3 = new T.Vector3(), one = new T.Vector3(1, 1, 1), col = new T.Color();
		const cnt = [0, 0, 0, 0, 0, 0];
		const F = {}, B = {}, N = {};
		// noc (zmierzch): plamy świateł na jezdni
		const dark = this.streetDark || 0, beams = L.beams, bq = new T.Quaternion(), bs = new T.Vector3(), bc = new T.Color();
		let nb = 0;
		const beam = (s, d, yaw, w, len, color, k) => {
			R.sidePoint(this.route, s, d, tp);
			bq.setFromAxisAngle(Y_UP, yaw);
			m4.compose(p3.set(tp.x, this.streetY(s, d, N.ch) + 0.04, tp.z), bq, bs.set(w, 1, len));
			beams.setMatrixAt(nb, m4);
			beams.setColorAt(nb, bc.copy(color).multiplyScalar(k));
			nb++;
		};
		for (const c of cars) {
			const vis = this.chunks.has(Math.floor(c.p[0] / C));
			if (!vis) continue;
			carPoint(c, c.len * 0.38, F);
			carPoint(c, -c.len * 0.38, B);
			R.sidePoint(this.route, F.s, F.d, tp);
			const fx = tp.x, fz = tp.z, fy = this.streetY(F.s, F.d, F.ch);
			R.sidePoint(this.route, B.s, B.d, tp);
			const bx = tp.x, bz = tp.z, by = this.streetY(B.s, B.d, B.ch);
			const yaw = Math.atan2(fx - bx, fz - bz), pitch = -Math.atan2(fy - by, Math.hypot(fx - bx, fz - bz) || 1);
			e.set(pitch, yaw, 0);
			q.setFromEuler(e);
			m4.compose(p3.set((fx + bx) / 2, (fy + by) / 2 - 0.02, (fz + bz) / 2), q, one);
			const ms = L.kinds[c.kind], k = cnt[c.kind]++;
			for (const im of ms) im.setMatrixAt(k, m4);
			ms[0].setColorAt(k, col.set(c.color));
			if (dark > 0.25) {
				// przed autem: plama od maski na ok. 13 m; za autem: 1,2 m za tyłem (kierunek wzdłuż kolejki)
				const kd = Math.min(1, (dark - 0.25) / 0.35);
				carPoint(c, c.len / 2 + 6, N);
				beam(N.s, N.d, yaw, c.kind >= 4 ? 5 : 4.4, 14, BEAM_W, 0.6 * kd);
				carPoint(c, -c.len / 2 - 1.2, N);
				beam(N.s, N.d, yaw, 2.2, 2.4, BEAM_R, (c.v < 0.5 ? 0.38 : 0.22) * kd);
			}
		}
		beams.count = nb;
		beams.instanceMatrix.needsUpdate = true;
		if (beams.instanceColor) beams.instanceColor.needsUpdate = true;
		this.drawStreetGlows(L, cars, dark);
		L.kinds.forEach((ms, k) => {
			for (const im of ms) { im.count = cnt[k]; im.instanceMatrix.needsUpdate = true; }
			if (ms[0].instanceColor) ms[0].instanceColor.needsUpdate = true;
		});
	};

	/* ---------- piesi ---------- */
	// punkt chodnika ciągu ch w t po stronie sc (+1 / −1 względem rosnącego t)
	const swPt = (ch, t, sc) => World.streetUtil.chPt(ch, t, sc, sc * SW_OFF);
	// czy na odcinku ciągu w t jest chodnik po stronie sc
	const swHas = (ch, t, sc) => { const k = World.streetUtil.chSeg(ch, t); return !!ch.sw[k][sc > 0 ? 0 : 1]; };

	World.prototype.updateStreetPeds = function (sim, dt, L, net, vs, vd, RAD, nPeds, xs) {
		const peds = L.pedList, time = this.time;
		for (let i = peds.length - 1; i >= 0; i--) {
			const p = peds[i];
			if (Math.hypot(p.p[0] - vs, p.p[1] - vd) > RAD * 1.15 || (peds.length > nPeds && p.state !== 'stand' && Math.hypot(p.p[0] - vs, p.p[1] - vd) > RAD * 0.5) || p.gone) {
				if (p.z) p.z.busy = Math.max(0, (p.z.busy || 0) - 1);
				if (p.stop) p.stop.waitN = Math.max(0, p.stop.waitN - 1);
				peds.splice(i, 1);
			}
		}
		// czekający na przystankach w zasięgu: 0–3 osoby (po odjeździe autobusu – nowi po chwili)
		const SU = World.streetUtil;
		for (const B of this.envBusStops()) {
			if (Math.hypot(B.s - vs, B.d - vd) > RAD * 0.8 || !this.chunks.has(Math.floor(B.s / C))) continue;
			if (B.next === undefined) { B.next = 0; B.waitN = 0; }
			if (B.waitN > 0 || time < B.next) continue;
			B.next = time + 60;
			const k = SU.chSeg(B.ch, B.t), onSw = B.side > 0 ? B.ch.sw[k][0] : B.ch.sw[k][1];
			for (let i = Math.floor(Math.random() * 4); i > 0; i--) {
				const tt = B.t + (Math.random() - 0.5) * 4, ex = B.side * ((onSw ? 1.6 : 1.3) + Math.random() * 0.6);
				const q = SU.chPt(B.ch, tt, B.side, ex), c0 = SU.chPt(B.ch, tt, 0, 0), hl = Math.hypot(c0[0] - q[0], c0[1] - q[1]) || 1;
				peds.push({ ch: B.ch, sc: B.side, t: tt, dir: 1, spd: 1.2, seed: Math.random() * 100, state: 'stand', stop: B, onSw, p: q, h: [(c0[0] - q[0]) / hl, (c0[1] - q[1]) / hl], path: null, u: 0 });
				B.waitN++;
			}
		}
		const cand = this.streetCand(L, net, vs, vd, RAD);
		for (let tries = 0; peds.length < nPeds && tries < 8 && cand.peds.length; tries++) {
			let r = Math.random() * cand.pedW, x = cand.peds[0];
			for (const y of cand.peds) { r -= y.w; if (r <= 0) { x = y; break; } }
			if (L.age > 2 && x.dist < RAD * 0.5) continue;
			const sw = x.ch.sw[x.k], sc = sw[0] && sw[1] ? (Math.random() < 0.5 ? 1 : -1) : sw[0] ? 1 : -1;
			const p = { ch: x.ch, sc, t: x.t, dir: Math.random() < 0.5 ? 1 : -1, spd: 1.05 + Math.random() * 0.5, seed: Math.random() * 100, state: 'walk', p: [0, 0], h: [1, 0], path: null, u: 0 };
			const q = swPt(p.ch, p.t, p.sc);
			p.p = q;
			peds.push(p);
		}
		for (const p of peds) {
			if (p.state === 'stand') continue;
			if (p.state === 'wait') {
				p.wait += dt;
				if (this.streetPedGo(p, time, xs)) {
					p.state = 'path';
					if (p.z) p.z.busy = (p.z.busy || 0) + 1;
				} else if (p.wait > 40) { p.state = 'walk'; p.dir = -p.dir; p.path = null; }
				continue;
			}
			if (p.state === 'path') {
				p.u += p.spd * dt;
				const P = p.path;
				if (p.u >= P.L) {
					if (p.z) { p.z.busy = Math.max(0, (p.z.busy || 0) - 1); p.z = null; }
					Object.assign(p, P.next);
					p.state = 'walk';
					p.path = null;
				} else {
					const q = pathAt(P, p.u, tp);
					p.h = [q.hs, q.hd];
					p.p = [q.s, q.d];
				}
				continue;
			}
			// chodnik wzdłuż ciągu
			const ch = p.ch, lo = Math.max(ch.trim[0].p, ch.trim[0].n, 0), hi = ch.L - Math.max(ch.trim[1].p, ch.trim[1].n, 0);
			const nt = p.t + p.dir * p.spd * dt;
			// przejście dla pieszych: część pieszych przechodzi na drugą stronę
			if (ch.zeb && !p.noZ) for (const zt of ch.zeb) {
				if ((zt - p.t) * p.dir < 0 || (zt - nt) * p.dir > 0) continue;
				const z = net.zebras.find((zz) => zz.ch === ch && Math.abs(zz.t - zt) < 0.01);
				if (z && swHas(ch, zt, -p.sc) && Math.random() < 0.45) {
					const a = swPt(ch, zt, p.sc), b = swPt(ch, zt, -p.sc);
					p.path = mkPath([a, b], { next: { ch, sc: -p.sc, t: zt, dir: Math.random() < 0.5 ? 1 : -1, noZ: true } });
					p.u = 0;
					p.z = z;
					p.state = 'wait';
					p.wait = 0;
					p.t = zt;
				}
				break;
			}
			if (p.state !== 'walk') continue;
			if (p.noZ && ch.zeb && ch.zeb.every((zt) => Math.abs(zt - p.t) > 3)) p.noZ = false;
			// koniec chodnika (tylko idąc na zewnątrz – pieszy przed początkiem chodnika idzie dalej): za róg (skrzyżowanie),
			// przez przejazd kolejowy albo zawrócenie
			if ((nt < lo && p.dir < 0) || (nt > hi && p.dir > 0) || !swHas(ch, Math.max(0, Math.min(ch.L, nt)), p.sc)) {
				const atEnd = nt > hi && p.dir > 0 ? 1 : nt < lo && p.dir < 0 ? 0 : -1;
				const nx = atEnd >= 0 ? this.streetPedTurn(p, atEnd, net) : null;
				if (nx) { p.path = nx; p.u = 0; p.state = nx.X ? 'wait' : 'path'; p.wait = 0; }
				else p.dir = -p.dir;
				continue;
			}
			p.t = nt;
			const a = swPt(ch, p.t, p.sc), b = swPt(ch, p.t + p.dir * 0.5, p.sc);
			const hl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
			p.h = [(b[0] - a[0]) / hl, (b[1] - a[1]) / hl];
			p.p = a;
		}
		this.drawStreetPeds(L, peds);
	};

	/* autobus odjeżdża z przystanku B: czekający wsiedli (znikają), 0–2 wysiadłych rusza chodnikiem (gdy jest) */
	World.prototype.streetBusLeft = function (B) {
		const L = this.slife;
		if (!L) return;
		for (const p of L.pedList) if (p.stop === B) p.gone = true;
		B.next = this.time + 20 + Math.random() * 40;
		const k = World.streetUtil.chSeg(B.ch, B.t);
		if (!(B.side > 0 ? B.ch.sw[k][0] : B.ch.sw[k][1])) return;
		for (let i = Math.floor(Math.random() * 3); i > 0; i--) {
			const t = B.t + (Math.random() - 0.5) * 3;
			L.pedList.push({ ch: B.ch, sc: B.side, t, dir: Math.random() < 0.5 ? 1 : -1, spd: 1.05 + Math.random() * 0.5, seed: Math.random() * 100, state: 'walk', p: swPt(B.ch, t, B.side), h: [1, 0], path: null, u: 0 });
		}
	};

	// za róg: łuk chodnika do sąsiedniego wlotu; przez przejazd kolejowy – łącznik (z czekaniem)
	World.prototype.streetPedTurn = function (p, end, net) {
		const ch = p.ch, n = end ? ch.nb : ch.na, J = net.J.get(n);
		if (J) {
			const A = J.arms.find((x) => x.ch === ch && x.end === end);
			if (!A) return null;
			const as = A.end ? -p.sc : p.sc; // strona względem wlotu (+ – w stronę następnego wlotu)
			const c = as > 0 ? J.corners.find((x) => x.A === A) : J.corners.find((x) => x.B === A);
			if (!c || !c.cv) return null;
			let pts = c.cv[1].map((q, k) => lerp2(q, c.cv[2][k], 0.5));
			if (as < 0) pts = pts.slice().reverse();
			const B = as > 0 ? c.B : c.A; // wlot, na który przechodzi
			const bs = as > 0 ? -1 : 1; // strona względem wlotu B
			const sc = B.end ? -bs : bs, dir = B.end ? -1 : 1;
			const t = B.end ? B.ch.L - Math.max(B.ch.trim[1].p, B.ch.trim[1].n) : Math.max(B.ch.trim[0].p, B.ch.trim[0].n);
			const start = swPt(ch, p.t, p.sc);
			pts = [start].concat(pts);
			pts.push(swPt(B.ch, t, sc));
			return mkPath(pts, { next: { ch: B.ch, sc, t, dir } });
		}
		const lk = net.links.get(n);
		if (lk) {
			const list = net.ends.get(lk.other) || [];
			const o = list[0];
			if (!o) return null;
			// strona ulicy względem kierunku marszu (+1 – prawa) zostaje ta sama po drugiej stronie torów
			const rel = p.sc * (end ? 1 : -1), sc2 = rel * (o.end === 0 ? 1 : -1);
			if (!swHas(o.ch, o.end ? o.ch.L - 0.5 : 0.5, sc2)) return null;
			const t = o.end ? o.ch.L : 0;
			const a = swPt(ch, p.t, p.sc), b = swPt(o.ch, t, sc2);
			return mkPath([a, b], { X: lk.X, next: { ch: o.ch, sc: sc2, t, dir: o.end ? -1 : 1 } });
		}
		return null;
	};

	// pieszy przed przejściem: sygnalizacja (zielone dla pieszych – auta mają czerwone), bez – gdy nic nie nadjeżdża;
	// przed przejazdem kolejowym – gdy sygnalizacja wyłączona
	World.prototype.streetPedGo = function (p, time, xs) {
		const P = p.path;
		if (P.X) return !xs.get(P.X);
		const z = p.z;
		if (!z) return true;
		if (z.sig) return World.streetUtil.tlState(2, (time + (z.off || 0)) % 60) === 2 && (time + (z.off || 0)) % 60 < 56;
		const L = this.slife;
		for (const c of L.cars) for (let qi = 0; qi < c.q.length && qi < 3; qi++) {
			const Q = c.q[qi];
			if (Q.kind !== 'lane' || Q.ch !== z.ch) continue;
			const zb = Q.zeb.find((x) => x.z === z);
			if (!zb) continue;
			// auto, które nie zdąży łagodnie stanąć (albo już wjeżdża na przejście) – pieszy czeka
			const dist = aheadOf(c, Q, zb.u);
			if (dist > -c.len / 2 - 1 && dist < Math.max(10, c.v * 3, 3.2 + c.len / 2 + (c.v * c.v) / 6)) return false;
		}
		return true;
	};

	World.prototype.drawStreetPeds = function (L, peds) {
		const pm = L.peds, m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p3 = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
		let k = 0;
		const PEOPLE = World.PEOPLE, SKIN = World.SKIN;
		for (const p of peds) {
			if (!this.chunks.has(Math.floor(p.p[0] / C))) continue;
			R.sidePoint(this.route, p.p[0], p.p[1], tp);
			const x0 = tp.x, z0 = tp.z;
			R.sidePoint(this.route, p.p[0] + p.h[0], p.p[1] + p.h[1], tq);
			// model idący wzdłuż +s ma obrót −heading (pasażerowie na peronach): kierunek w świecie → obrót
			const yaw = Math.atan2(tq.x - x0, tq.z - z0) + (L.yawOff || 0);
			q.setFromAxisAngle(up, yaw);
			// chodnik – nad krawężnikiem; na jezdni (przejście, przejazd) – na nawierzchni
			const onRoad = !!(p.z || (p.path && p.path.X)) || (p.state === 'stand' && !p.onSw);
			const y = onRoad ? this.streetY(p.p[0], p.p[1], p.ch) : this.surfY(p.p[0], p.p[1]) + 0.25;
			const s0 = 0.95 + (p.seed % 1) * 0.12;
			m4.compose(p3.set(x0, y, z0), q, sc.set(s0, s0, s0));
			pm.bodies.setMatrixAt(k, m4);
			pm.heads.setMatrixAt(k, m4);
			if (!p.col) {
				p.col = true;
				p.ci = Math.floor(hash(p.seed * 1.7) * PEOPLE.length);
				p.si = Math.floor(hash(p.seed * 2.3) * SKIN.length);
			}
			pm.bodies.setColorAt(k, col.setHex(PEOPLE[p.ci]));
			pm.heads.setColorAt(k, col.setHex(SKIN[p.si]));
			const moving = p.state === 'walk' || p.state === 'path';
			pm.setAnim(k, hash(p.seed + 0.33) * 6.28, moving ? 1 : 0, p.spd * 0.62);
			k++;
		}
		pm.bodies.count = pm.heads.count = k;
		pm.bodies.instanceMatrix.needsUpdate = pm.heads.instanceMatrix.needsUpdate = true;
		if (pm.bodies.instanceColor) pm.bodies.instanceColor.needsUpdate = true;
		if (pm.heads.instanceColor) pm.heads.instanceColor.needsUpdate = true;
	};
})();
