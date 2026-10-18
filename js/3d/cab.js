/* Kabina maszynisty w czole pociągu gracza: wnętrze (ściany, sufit, szyby od środka, podłoga, ściana tylna
   z drzwiami, fotel), pulpit z działającymi wskaźnikami (prędkościomierz, manometr hamulca, wyświetlacze),
   ruchome nastawnik jazdy i kran hamulca, lampki czuwaka, drzwi i hamowania. Widoczna tylko w trybie kamery
   „z kabiny”. Układ współrzędnych: lokalny wagonu czołowego (przód = −z, y – wysokość nad główką szyny).
   Jakość: bryły z zaokrąglonymi krawędziami i toczone (gałki, zegary z chromowaną obręczą i szkłem, lampki
   kopułkowe), faktury z kanwy (lakier strukturalny, blacha ryflowana, tapicerka, panele, podziałka nastawnika),
   światło rozproszone przez szyby (świecenie materiałów i światło punktowe), ekrany w 1,5 × wyższej rozdzielczości. */
import * as THREE from 'three';

(function () {
	'use strict';
	const T = THREE;
	const NS = window.Train3D;
	const P = window.TrainPhysics;

	const ASPECT = { red: '#ff3b30', yellow: '#ffb020', green: '#34d058' };

	// płótno wyświetlacza: rysunek we współrzędnych logicznych w × h, płótno 1,5 × gęściej (ostrzejsze napisy z bliska)
	function canvasTex(w, h) {
		const k = 1.5, c = document.createElement('canvas');
		c.width = Math.round(w * k);
		c.height = Math.round(h * k);
		const tex = new T.CanvasTexture(c);
		tex.colorSpace = T.SRGBColorSpace;
		tex.anisotropy = 8;
		const g = c.getContext('2d');
		g.setTransform(k, 0, 0, k, 0, 0);
		return { c, g, tex, W: w, H: h };
	}

	function fmtClock(sec) {
		const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
		return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0')).join(':');
	}

	/* ---- Jakość wnętrza ----
	   Materiały kabiny: PBR z faktura z kanwy (blat przeciwodblaskowy, blacha ryflowana podłogi, tapicerka, panele
	   ścian) i świeceniem własnym w kolorze materiału – udaje światło rozproszone wpadające przez szyby (wnętrze
	   leży w cieniu dachu, bez tego było prawie czarne); natężenie maleje o zmroku (update). */
	const texCache = new Map();
	function patternTex(key, w, h, draw, repeat) {
		if (texCache.has(key)) return texCache.get(key);
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		draw(c.getContext('2d'), w, h);
		const tex = new T.CanvasTexture(c);
		tex.colorSpace = T.SRGBColorSpace;
		tex.wrapS = tex.wrapT = T.RepeatWrapping;
		tex.anisotropy = 8;
		if (repeat) tex.repeat.set(repeat[0], repeat[1]);
		texCache.set(key, tex);
		return tex;
	}
	const rnd = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
	// drobne ziarno (lakier strukturalny pulpitu, blat przeciwodblaskowy)
	const grainTex = () => patternTex('cab-grain', 256, 256, (g, w, h) => {
		g.fillStyle = '#808080';
		g.fillRect(0, 0, w, h);
		for (let k = 0; k < 9000; k++) {
			const v = 110 + Math.floor(rnd(k) * 40);
			g.fillStyle = `rgb(${v},${v},${v})`;
			g.fillRect(rnd(k + 0.3) * w, rnd(k + 0.7) * h, 1.5, 1.5);
		}
	}, [3, 3]);
	// blacha ryflowana (podłoga): ukośne „ziarna ryżu” na przemian
	const treadTex = () => patternTex('cab-tread', 256, 256, (g, w) => {
		g.fillStyle = '#7a7d80';
		g.fillRect(0, 0, w, w);
		const s = 32;
		for (let y = 0; y < w; y += s) for (let x = 0; x < w; x += s) {
			const a = ((x / s + y / s) % 2) ? 0.785 : -0.785;
			g.save();
			g.translate(x + s / 2, y + s / 2);
			g.rotate(a);
			g.fillStyle = '#9a9da0';
			g.fillRect(-11, -3, 22, 6);
			g.fillStyle = '#5a5d60';
			g.fillRect(-11, 2, 22, 2);
			g.restore();
		}
	}, [6, 10]);
	// tapicerka fotela: splot
	const fabricTex = () => patternTex('cab-fabric', 128, 128, (g, w) => {
		g.fillStyle = '#7f8080';
		g.fillRect(0, 0, w, w);
		for (let y = 0; y < w; y += 4) for (let x = 0; x < w; x += 4) {
			const v = 112 + (((x + y) / 4) % 2) * 22 + Math.floor(rnd(x * 7 + y) * 14);
			g.fillStyle = `rgb(${v},${v},${v})`;
			g.fillRect(x, y, 4, 4);
		}
	}, [3, 3]);
	// panel ściany tylnej: pola z ciemniejszymi spoinami i rzędem nitów
	const panelTex = () => patternTex('cab-panel', 256, 256, (g, w) => {
		g.fillStyle = '#8a8a8a';
		g.fillRect(0, 0, w, w);
		g.fillStyle = '#6a6a6a';
		g.fillRect(0, 0, w, 3);
		g.fillRect(0, 0, 3, w);
		g.fillStyle = '#5c5c5c';
		for (let x = 12; x < w; x += 24) { g.beginPath(); g.arc(x, 12, 2.2, 0, Math.PI * 2); g.fill(); }
		for (let k = 0; k < 3000; k++) { const v = 138 + Math.floor((rnd(k) - 0.5) * 8); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd(k + 0.2) * w, rnd(k + 0.6) * w, 1, 1); }
	}, [2, 2]);
	// podziałka nastawnika: J5…J1, 0, H1…H4, nagłe (od przodu do tyłu)
	const leverScaleTex = () => patternTex('cab-lever-scale', 128, 512, (g, w, h) => {
		g.fillStyle = '#1d2024';
		g.fillRect(0, 0, w, h);
		g.strokeStyle = '#5a6068';
		g.lineWidth = 3;
		g.strokeRect(3, 3, w - 6, h - 6);
		g.fillStyle = '#0a0b0c';
		g.fillRect(w / 2 - 9, 26, 18, h - 52); // szczelina
		g.font = '700 24px system-ui, sans-serif';
		g.textAlign = 'left';
		g.textBaseline = 'middle';
		const L = ['J5', 'J4', 'J3', 'J2', 'J1', '0', 'H1', 'H2', 'H3', 'H4', 'N'];
		L.forEach((t, k) => {
			const y = 40 + (k * (h - 80)) / (L.length - 1);
			g.fillStyle = t === '0' ? '#f2f2f2' : t[0] === 'J' ? '#7fd38a' : t === 'N' ? '#ff5a4e' : '#ffb15a';
			g.fillRect(w / 2 + 12, y - 1.5, 12, 3);
			g.fillText(t, w / 2 + 28, y);
		});
	});
	// tabliczka opisowa (biała na czarnym)
	const labelTex = (text) => patternTex('cab-label|' + text, 128, 32, (g, w, h) => {
		g.fillStyle = '#e9e6dc';
		g.fillRect(0, 0, w, h);
		g.fillStyle = '#16181a';
		g.font = '700 18px system-ui, sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText(text, w / 2, h / 2 + 1);
	});

	// prostopadłościan z zaokrąglonymi krawędziami (siatka 3 × 3 na ścianę, jak RoundedBoxGeometry; UV z BoxGeometry)
	const rgeos = new Map();
	function roundGeo(w, h, d, r) {
		const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
		let g = rgeos.get(key);
		if (g) return g;
		r = Math.min(r, Math.min(w, h, d) * 0.45);
		const hs = 0.5 / 3;
		g = new T.BoxGeometry(1, 1, 1, 3, 3, 3).toNonIndexed();
		const p = g.attributes.position, nr = g.attributes.normal, v = new T.Vector3(), q = new T.Vector3();
		for (let k = 0; k < p.count; k++) {
			v.fromBufferAttribute(p, k);
			const sx = Math.sign(v.x), sy = Math.sign(v.y), sz = Math.sign(v.z);
			q.set(v.x - sx * hs, v.y - sy * hs, v.z - sz * hs).normalize();
			p.setXYZ(k, (w / 2 - r) * sx + q.x * r, (h / 2 - r) * sy + q.y * r, (d / 2 - r) * sz + q.z * r);
			nr.setXYZ(k, q.x, q.y, q.z);
		}
		g.computeBoundingSphere();
		g.userData.shared = true;
		rgeos.set(key, g);
		return g;
	}
	const CYL = new T.CylinderGeometry(0.5, 0.5, 1, 32);
	const RING = new T.TorusGeometry(0.5, 0.06, 8, 40);
	const DOME = new T.SphereGeometry(0.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
	// gałka dźwigni (bryła obrotowa: szyjka, kula spłaszczona)
	const KNOB = new T.LatheGeometry([[0, 0], [0.18, 0], [0.16, 0.2], [0.35, 0.35], [0.5, 0.55], [0.48, 0.75], [0.3, 0.92], [0, 1]].map(([r, y]) => new T.Vector2(r, y)), 24);
	for (const geo of [CYL, RING, DOME, KNOB]) geo.userData.shared = true;

	class CabInterior {
		constructor(model) {
			const car = model.cars[0];
			this.model = model;
			this.car = car;
			this.own = [];
			const g = (this.group = new T.Group());
			g.visible = false;
			car.group.add(g);
			// kabina osadzona w części pojazdu (SM42 – kabina między maskami, wyżej): cabSpec – bryła kabiny, jej
			// połowa długości, przesunięcie (z – środek kabiny, y – podniesiona podłoga)
			const spec = car.cabSpec;
			const hl = spec ? spec.hl : car.len / 2, n = spec ? spec.nose : car.st.nose, H = spec ? spec.H : car.H;
			if (spec) g.position.set(0, spec.y, spec.z);
			const floor = 1.35;
			const deskFront = -hl + n * 0.45, deskBack = deskFront + 0.8;
			const back = deskBack + 1.65;
			this.eye = new T.Vector3(-0.35, 3.05, deskBack + 0.72);
			this.floor = floor;

			// ściany, sufit i szyby od środka – ta sama bryła co pudło, widziana od wewnątrz
			const own = (m) => { this.own.push(m); return m; };
			/* materiały wnętrza: glow – świecenie własne (światło rozproszone), skalowane o zmroku w update; map – faktura
			   (świeci razem z nią – emissiveMap) */
			this.glow = [];
			const cm = (color, o = {}) => {
				// odbicia nieba słabsze niż na zewnątrz (wnętrze widzi niebo tylko przez szyby)
				const m = own(new T.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, emissive: color, emissiveIntensity: o.glow ?? 0.22, side: o.side ?? T.FrontSide, envMapIntensity: o.env ?? 0.5 }));
				if (o.map) { m.map = o.map; m.emissiveMap = o.map; m.roughnessMap = o.rmap || null; }
				this.glow.push([m, m.emissiveIntensity]);
				return m;
			};
			// ściany jasne szarozielone (jak w kabinach PKP), sufit kremowy
			const wall = cm('#aab2a6', { side: T.BackSide, glow: 0.1, rough: 0.85 });
			const ceiling = cm('#dcd9cc', { side: T.BackSide, glow: 0.14, rough: 0.9 });
			const inGlass = own(new T.MeshBasicMaterial({ color: '#0d1820', transparent: true, opacity: 0.1, side: T.BackSide, depthWrite: false }));
			// krople i śnieg na szybie widziane od środka (te same uniformy co szyba z zewnątrz)
			if (model.glassU && NS.wetGlass) NS.wetGlass(inGlass, model.glassU);
			const shell = new T.Mesh(spec ? spec.geo : car.bodyGeo, [wall, wall, wall, ceiling, inGlass, inGlass, own(new T.MeshBasicMaterial({ visible: false })), wall]);
			if (spec) shell.position.y = -spec.y; // bryła kabiny w układzie pojazdu (grupa podniesiona o spec.y)
			g.add(shell);

			// materiały: pulpit (lakier strukturalny), blat i półka (czarne, matowe), metal, guma, podłoga, ściana, tapicerka
			const grain = grainTex();
			const panel = cm('#6e7882', { map: grain, rough: 0.75, glow: 0.2 });
			const deskTop = cm('#4a5057', { map: grain, rough: 0.85, glow: 0.18 });
			const black = cm('#1d2023', { map: grain, rough: 0.6, glow: 0.12 });
			const rubber = cm('#141516', { rough: 0.95, glow: 0.08 });
			// stal szczotkowana (obręcze zegarów, oprawki, poręcze, dźwignie) – matowa: lustrzany chrom tuż pod światłem
			// wypełniającym dawał jaskrawe refleksy i poświatę
			const chrome = cm('#a3a8ae', { metal: 0.7, rough: 0.45, glow: 0.05, env: 0.35 });
			const steel = cm('#8d9399', { metal: 0.6, rough: 0.5, glow: 0.12, env: 0.35 });
			const floorM = cm('#6a6e72', { map: treadTex(), metal: 0.55, rough: 0.5, glow: 0.18 });
			const backM = cm('#b9bec3', { map: panelTex(), rough: 0.8, glow: 0.25 });
			const doorM = cm('#8e959c', { map: panelTex(), rough: 0.7, glow: 0.22 });
			const fabric = cm('#2c3e57', { map: fabricTex(), rough: 0.95, glow: 0.2 });
			const add = (o) => { g.add(o); return o; };
			const rb = (w, h, d, m, x, y, z, r = 0.012) => { const o = new T.Mesh(roundGeo(w, h, d, r), m); o.position.set(x, y, z); return add(o); };
			const cyl = (rad, h, m, x, y, z) => { const o = new T.Mesh(CYL, m); o.scale.set(rad * 2, h, rad * 2); o.position.set(x, y, z); return add(o); };

			/* okładziny od środka: elementy nadwozia w kolorze malowania, które było widać w kabinie – słupek między dwiema
			   szybami czołowymi (EP09, ET22, ST44, SU46; pasek na zewnątrz szyby, widoczny przez nią) i skrzydła drzwi
			   bocznych lokomotywy (wystawały kilka cm do wnętrza) */
			const lining = cm('#aab2a6', { map: panelTex(), rough: 0.85, glow: 0.1 });
			if (!spec && car.st.split && car.st.panes !== 3) {
				// słupek wzdłuż krzywizny czoła (jak flatFront w train.js), 3,5 cm do środka i szerszy niż pasek z zewnątrz
				const st = car.st, kTop = 1 - 0.28 / Math.max(0.5, H - st.yb), t0 = Math.max(0.6, st.glassT || 0);
				const at = (tt) => { const t = Math.pow(tt, 0.9); return { y: st.yb + (H - st.yb) * (1 - kTop * Math.pow(t, 1.25)), z: -(hl - n * (1 - tt)) }; };
				let p0 = at(t0);
				for (let k = 1; k <= 10; k++) {
					const p1 = at(t0 + ((1 - t0) * k) / 10);
					const z1 = p0.z + 0.035, z2 = p1.z + 0.035;
					const seg = rb(0.16, Math.hypot(z2 - z1, p1.y - p0.y) + 0.012, 0.03, lining, 0, (p0.y + p1.y) / 2, (z1 + z2) / 2, 0.01);
					seg.rotation.x = Math.atan2(z2 - z1, p1.y - p0.y);
					p0 = p1;
				}
			}
			if (!spec && car.kind === 'loco') {
				// drzwi boczne kabiny (train.js: skrzydło 0,7 × 1,9 m przy burcie, z okienkiem 0,4 × 0,5 m)
				// część skrzydła wewnątrz kabiny (drzwi bywają przy samej ścianie tylnej i sięgają za nią); okienko odkryte
				const dz = -hl + n + 1.9, xs = 1.45 - 0.065, win = !car.st.noDoorWin;
				const za = dz - 0.39, zb = Math.min(dz + 0.39, back - 0.05);
				const panelZ = (z0, z1, h, y) => { if (z1 - z0 > 0.02) for (const sx of [-1, 1]) rb(0.03, h, z1 - z0, lining, sx * xs, y, (z0 + z1) / 2, 0.01); };
				if (zb - za > 0.2) {
					panelZ(za, zb, 1.25, 1.875);
					panelZ(za, zb, 0.17, 3.08);
					if (win) { panelZ(za, dz - 0.2, 0.5, 2.75); panelZ(dz + 0.2, zb, 0.5, 2.75); } else panelZ(za, zb, 0.5, 2.75);
					// klamka po stronie kabiny
					for (const sx of [-1, 1]) {
						rb(0.03, 0.025, 0.14, chrome, sx * (xs - 0.03), 2.2, za + 0.15, 0.008);
						rb(0.03, 0.06, 0.03, chrome, sx * (xs - 0.015), 2.2, za + 0.1, 0.008);
					}
				}
			}

			// podłoga z blachy ryflowanej, listwy przy ścianach; ściana tylna z panelami i drzwiami
			rb(2.7, 0.06, back + hl, floorM, 0, floor, (back - hl) / 2, 0.01);
			for (const sx of [-1, 1]) rb(0.05, 0.12, back + hl - 0.2, rubber, sx * 1.33, floor + 0.08, (back - hl) / 2, 0.01);
			rb(2.8, 2.5, 0.08, backM, 0, floor + 1.25, back);
			// drzwi do przedziału maszynowego: skrzydło z panelami, okno z ramką i uszczelką, klamka, zawiasy
			rb(0.82, 2.0, 0.06, doorM, 0.75, floor + 1.0, back - 0.045, 0.015);
			rb(0.5, 0.46, 0.03, rubber, 0.75, floor + 1.6, back - 0.08);
			const dwin = new T.Mesh(new T.PlaneGeometry(0.42, 0.38), own(new T.MeshBasicMaterial({ color: '#4a5a66' })));
			dwin.position.set(0.75, floor + 1.6, back - 0.097);
			dwin.rotation.y = Math.PI;
			this.own.push(dwin.geometry);
			add(dwin);
			for (const y of [0.35, 1.65]) cyl(0.025, 0.12, chrome, 0.36, floor + y, back - 0.07);
			const handle = rb(0.16, 0.025, 0.03, chrome, 1.05, floor + 1.0, back - 0.11, 0.008);
			handle.rotation.z = 0.05;
			rb(0.05, 0.08, 0.04, chrome, 1.1, floor + 1.0, back - 0.085, 0.008);
			// wieszak z kurtką, gaśnica w uchwycie, koło hamulca ręcznego na ścianie tylnej
			rb(0.04, 0.04, 0.08, chrome, -0.6, floor + 1.85, back - 0.08, 0.01);
			rb(0.38, 0.72, 0.12, cm('#25365c', { map: fabricTex(), rough: 0.95, glow: 0.18 }), -0.6, floor + 1.45, back - 0.11, 0.05);
			const ext = new T.Mesh(KNOB, cm('#c0392b', { rough: 0.5, glow: 0.2, env: 0.3 }));
			ext.scale.set(0.16, 0.52, 0.16);
			ext.position.set(-1.15, floor + 0.05, back - 0.15);
			add(ext);
			cyl(0.035, 0.06, black, -1.15, floor + 0.6, back - 0.15);
			rb(0.2, 0.04, 0.08, steel, -1.15, floor + 0.35, back - 0.08);
			const hw = new T.Group();
			hw.position.set(-0.05, floor + 1.25, back - 0.12);
			const ring = new T.Mesh(RING, steel);
			ring.scale.setScalar(0.34);
			hw.add(ring);
			for (const a of [0, Math.PI / 3, -Math.PI / 3]) { const sp = new T.Mesh(roundGeo(0.32, 0.018, 0.018, 0.006), steel); sp.rotation.z = a; hw.add(sp); }
			const hwHub = new T.Mesh(CYL, black);
			hwHub.scale.set(0.06, 0.06, 0.06);
			hwHub.rotation.x = Math.PI / 2;
			hw.add(hwHub);
			add(hw);

			// pulpit: korpus z zaokrąglonymi krawędziami, skośny blat, półka na przyrządy, osłona kolan z kratką
			const depth = deskBack - deskFront;
			rb(2.6, 2.3 - floor, depth, panel, 0, (floor + 2.3) / 2, (deskFront + deskBack) / 2, 0.03);
			/* blat płaski, wierzch na DESK = 2,37 m – na nim stoją przyrządy (wcześniej blat wznosił się ku maszyniście
			   o ok. 10°, a przyrządy stały na stałych wysokościach – lampki, przyciski i osłona nastawnika tonęły w blacie) */
			const DESK = 2.37;
			rb(2.64, DESK - 2.3, depth + 0.12, deskTop, 0, (DESK + 2.3) / 2, (deskFront + deskBack) / 2, 0.025);
			// gumowa listwa na krawędzi blatu od strony fotela
			rb(2.66, 0.05, 0.05, rubber, 0, DESK - 0.02, deskBack + 0.06, 0.02);
			const shelf = rb(2.4, 0.32, 0.06, black, 0, 2.56, deskFront + 0.2, 0.02);
			shelf.rotation.x = -0.6;
			// wnęka na nogi z kratką wentylacji grzejnika i podnóżek z pedałami (czuwak nożny, piasecznica)
			rb(1.2, 0.5, 0.02, black, -0.35, floor + 0.35, deskBack + 0.012, 0.01);
			for (let k = 0; k < 7; k++) rb(1.1, 0.018, 0.012, rubber, -0.35, floor + 0.15 + k * 0.06, deskBack + 0.026, 0.004);
			const rest2 = rb(0.9, 0.04, 0.32, floorM, -0.35, floor + 0.14, deskBack - 0.2, 0.012);
			rest2.rotation.x = 0.35;
			for (const [x, c] of [[-0.55, '#e6b800'], [-0.15, '#3a3f45']]) {
				const ped = rb(0.16, 0.025, 0.22, cm(c, { rough: 0.5, glow: 0.15 }), x, floor + 0.2, deskBack - 0.18, 0.01);
				ped.rotation.x = 0.45;
			}

			/* blat przeciwodblaskowy: matowy, ciemny – od półki z przyrządami do dolnej krawędzi szyby (zasłania
			   jasną blachę czoła widzianą od środka); przy pionowym czole (EN57) niżej, pod szybami */
			if (!spec) {
				// dolna krawędź szyby czołowej (x = 0,6 – obok słupka): promienie z przodu na bryłę, od góry w dół
				const probe = new T.Mesh(car.bodyGeo, [0, 1, 2, 3, 4, 5, 6, 7].map(() => new T.MeshBasicMaterial()));
				const rc = new T.Raycaster(), dirZ = new T.Vector3(0, 0, 1);
				let seen = false, yg = 2.5, zg = -hl + n * 0.1;
				for (let y = 3.6; y > 1.9; y -= 0.015) {
					rc.set(new T.Vector3(0.6, y, -hl - 5), dirZ);
					const h = rc.intersectObject(probe, false)[0];
					const isG = h && h.face && h.face.materialIndex === 4;
					if (isG) { seen = true; yg = y; zg = h.point.z; } else if (seen) break;
				}
				probe.material.forEach((m) => m.dispose());
				// pochyły blat od półki z przyrządami do krawędzi szyby, przy szybie gumowa uszczelka
				const y0 = 2.66, z0 = deskFront + 0.08, y1 = yg - 0.035, z1 = zg + 0.03;
				const Lg = Math.hypot(z1 - z0, y1 - y0);
				const gl = rb(2.62, 0.03, Lg, cm('#2b2f33', { map: grain, rough: 0.95, glow: 0.1 }), 0, (y0 + y1) / 2, (z0 + z1) / 2, 0.01);
				gl.rotation.x = Math.atan2(y1 - y0, z0 - z1);
				rb(2.62, 0.035, 0.035, rubber, 0, y1 + 0.01, z1 - 0.01, 0.012);
			}
			// obudowy ekranów (zaokrąglone ramki z daszkiem od góry) na półce
			const bezel = (w, h, x) => {
				const b = rb(w + 0.07, h + 0.07, 0.035, black, x, 2.56, deskFront + 0.235, 0.015);
				b.rotation.x = -0.6;
				const hood = rb(w + 0.07, 0.015, 0.07, black, x, 2.56 + Math.cos(0.6) * (h / 2 + 0.03), deskFront + 0.235 - Math.sin(0.6) * (h / 2 + 0.03) + 0.03, 0.006);
				hood.rotation.x = -0.6 + 0.9;
			};
			bezel(0.5, 0.29, -0.35); bezel(0.36, 0.25, 0.42);
			// zegary (prędkościomierz, manometr): okrągła obudowa, chromowana obręcz, szkło
			const gauge = (r, x) => {
				const gg = new T.Group();
				gg.position.set(x, 2.56, deskFront + 0.245);
				gg.rotation.x = -0.6 + Math.PI / 2;
				const housing = new T.Mesh(CYL, black);
				housing.scale.set(r * 2 + 0.05, 0.05, r * 2 + 0.05);
				housing.position.y = -0.01;
				gg.add(housing);
				const rim = new T.Mesh(RING, chrome);
				rim.scale.set(r * 2 + 0.02, r * 2 + 0.02, r * 2 + 0.02);
				rim.rotation.x = Math.PI / 2;
				rim.position.y = 0.022;
				gg.add(rim);
				const glassD = new T.Mesh(DOME, own(new T.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.05, roughness: 0.3, metalness: 0, envMapIntensity: 0.3, depthWrite: false })));
				glassD.scale.set(r * 2, 0.025, r * 2);
				glassD.position.y = 0.018;
				gg.add(glassD);
				add(gg);
			};
			gauge(0.135, -0.92); gauge(0.12, 0.92);
			// przełączniki dźwigienkowe w osłonach, z tabliczkami (rzędy na blacie po obu stronach nastawnika)
			// tabliczki jasne – bez świecenia (w dzień, pod światłem wypełniającym, przepalały się do białych plam)
			const plate = cm('#cfcbc0', { rough: 0.9, glow: 0.02, env: 0.15 });
			for (const [x0, n2] of [[-0.62, 6], [0.38, 5]]) {
				const xb = x0 + ((n2 - 1) * 0.075) / 2;
				rb(n2 * 0.075 + 0.04, 0.02, 0.12, black, xb, DESK + 0.01, deskBack - 0.12, 0.008);
				for (let k = 0; k < n2; k++) {
					const x = x0 + k * 0.075;
					rb(0.05, 0.006, 0.026, plate, x, DESK + 0.023, deskBack - 0.075, 0.002);
					cyl(0.014, 0.012, chrome, x, DESK + 0.026, deskBack - 0.14);
					const t2 = new T.Mesh(CYL, chrome);
					t2.scale.set(0.012, 0.05, 0.012);
					t2.position.set(x, DESK + 0.045, deskBack - 0.14);
					t2.rotation.x = k % 3 === 0 ? 0.5 : -0.5;
					add(t2);
				}
			}
			// radiotelefon (obudowa, wyświetlacz, pokrętło) ze słuchawką na uchwycie; rozkład jazdy w uchwycie
			rb(0.28, 0.12, 0.2, black, 1.12, DESK + 0.06, deskBack - 0.35, 0.015);
			rb(0.2, 0.06, 0.012, cm('#0d3b1e', { glow: 1.2, rough: 0.3 }), 1.12, DESK + 0.08, deskBack - 0.456, 0.004);
			cyl(0.02, 0.03, chrome, 1.22, DESK + 0.09, deskBack - 0.455).rotation.x = Math.PI / 2;
			rb(0.06, 0.045, 0.22, cm('#111214', { rough: 0.4, glow: 0.08 }), 1.12, DESK + 0.142, deskBack - 0.35, 0.02);
			const tt = rb(0.21, 0.005, 0.3, cm('#d9d5ca', { glow: 0.02, rough: 0.95, env: 0.1 }), -0.35, DESK + 0.003, deskBack - 0.25, 0.002);
			rb(0.24, 0.022, 0.04, steel, -0.35, DESK + 0.011, deskBack - 0.39, 0.008);
			// rolety przeciwsłoneczne nad szybami czołowymi
			if (!spec && !car.st.vfront) for (const x of [-0.62, 0.62]) {
				const vz = -hl + n * 0.62;
				const roll = cyl(0.03, 0.9, black, x, H - 0.42, vz);
				roll.rotation.z = Math.PI / 2;
				for (const e of [-1, 1]) rb(0.03, 0.06, 0.05, steel, x + e * 0.46, H - 0.42, vz, 0.008);
				const blind = rb(0.88, 0.22, 0.008, own(new T.MeshStandardMaterial({ color: '#1d2a33', transparent: true, opacity: 0.75, roughness: 0.6 })), x, H - 0.55, vz + 0.02, 0.003);
				blind.rotation.x = 0.55;
			}
			// sufit: kratka wentylacji, głośnik, poręcz na wspornikach
			rb(0.5, 0.025, 0.3, steel, 0.6, H - 0.1, back - 1.0, 0.008);
			for (let k = 0; k < 6; k++) rb(0.46, 0.012, 0.012, black, 0.6, H - 0.118, back - 1.12 + k * 0.05, 0.004);
			cyl(0.09, 0.03, black, -0.5, H - 0.1, back - 1.3);
			const rail = cyl(0.018, 0.9, chrome, -0.9, H - 0.25, back - 0.9);
			rail.rotation.x = Math.PI / 2;
			for (const dz of [-0.4, 0.4]) cyl(0.012, 0.15, chrome, -0.9, H - 0.18, back - 0.9 + dz);

			// wyświetlacze i wskaźniki (płaszczyzny z teksturą rysowaną na żywo)
			const screen = (w, h, cw, ch, x, y, z, tilt) => {
				const t = canvasTex(cw, ch);
				const m = own(new T.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
				const p = new T.Mesh(new T.PlaneGeometry(w, h), m);
				p.position.set(x, y, z);
				p.rotation.x = tilt;
				g.add(p);
				this.own.push(p.geometry, t.tex);
				return t;
			};
			const shelfZ = deskFront + 0.26;
			this.mfd = screen(0.5, 0.29, 512, 300, -0.35, 2.56, shelfZ, -0.6);
			this.side = screen(0.36, 0.25, 360, 250, 0.42, 2.56, shelfZ, -0.6);
			this.speedo = screen(0.27, 0.27, 256, 256, -0.92, 2.56, shelfZ + 0.005, -0.6);
			this.brakeG = screen(0.24, 0.24, 256, 256, 0.92, 2.56, shelfZ + 0.005, -0.6);
			/* woltomierz sieci i amperomierz silników trakcyjnych: małe zegary na półce z przyrządami, jeden nad drugim
			   w wolnym miejscu między prędkościomierzem a ekranem (wcześniej na blacie pod prędkościomierzem – jego obudowa
			   je zasłaniała); oś „w górę” półki pochylonej o 0,6 rad: (0, cos, −sin), normalna: (0, sin, cos) */
			const su = (u, f) => [2.56 + Math.cos(0.6) * u + Math.sin(0.6) * f, shelfZ - Math.sin(0.6) * u + Math.cos(0.6) * f];
			const smallX = -0.6975;
			[this.volt, this.amp] = [0.064, -0.064].map((u) => {
				const [y, z] = su(u, 0.004);
				const t = screen(0.1, 0.1, 128, 128, smallX, y, z, -0.6);
				const [ry, rz] = su(u, 0.008);
				const r2 = new T.Mesh(RING, chrome);
				r2.scale.setScalar(0.105);
				r2.position.set(smallX, ry, rz);
				r2.rotation.x = -0.6;
				add(r2);
				return t;
			});
			// lampki na pulpicie (czuwak, drzwi, hamowanie, prąd w sieci): klosz kopułkowy w chromowanej oprawce
			const lamp = (color, x) => {
				const m = own(new T.MeshBasicMaterial({ color: '#222' }));
				const z = deskBack - 0.22;
				const l = new T.Mesh(DOME, m);
				l.scale.set(0.055, 0.03, 0.055);
				l.position.set(x, DESK + 0.002, z);
				l.rotation.x = 0;
				add(l);
				const r2 = new T.Mesh(RING, chrome);
				r2.scale.setScalar(0.065);
				r2.position.set(x, DESK + 0.004, z);
				r2.rotation.x = Math.PI / 2;
				add(r2);
				return { m, on: new T.Color(color).multiplyScalar(1.5), off: new T.Color('#2a2a2a') };
			};
			this.lamps = { ca: lamp('#ffcc00', -0.95), doors: lamp('#2ecc71', -0.82), brake: lamp('#ff3b30', -0.69), power: lamp('#3aa0ff', -0.56) };
			// przycisk czuwaka (duży, żółty, wypukły) i przyciski drzwi – w oprawkach
			const button = (r, c, x, z) => {
				cyl(r + 0.012, 0.02, black, x, DESK + 0.01, z);
				const b = new T.Mesh(DOME, cm(c, { rough: 0.6, glow: 0.35, env: 0.25 }));
				b.scale.set(r * 2, 0.035, r * 2);
				b.position.set(x, DESK + 0.02, z);
				add(b);
			};
			button(0.06, '#e6b800', -1.0, deskBack - 0.42);
			for (const [x, c] of [[0.85, '#2ecc71'], [1.0, '#2ecc71'], [0.92, '#c0392b']]) button(0.03, c, x, deskBack - (c === '#c0392b' ? 0.42 : 0.25));
			for (const [txt, x, z] of [['CZUWAK', -1.0, deskBack - 0.33], ['DRZWI', 0.92, deskBack - 0.17]]) {
				const lb = new T.Mesh(new T.PlaneGeometry(0.1, 0.025), own(new T.MeshStandardMaterial({ map: labelTex(txt), roughness: 0.9, color: '#d6d2c8', envMapIntensity: 0.1 })));
				lb.position.set(x, DESK + 0.002, z);
				lb.rotation.x = -Math.PI / 2;
				this.own.push(lb.geometry);
				add(lb);
			}

			// nastawnik jazdy (dźwignia pod prawą ręką): osłona z podziałką i szczeliną, dźwignia z gałką
			rb(0.16, 0.06, 0.42, black, 0.12, DESK + 0.03, deskBack - 0.3, 0.02);
			const scaleP = new T.Mesh(new T.PlaneGeometry(0.1, 0.38), own(new T.MeshStandardMaterial({ map: leverScaleTex(), roughness: 0.55, emissive: '#ffffff', emissiveMap: leverScaleTex(), emissiveIntensity: 0.35 })));
			scaleP.position.set(0.12, DESK + 0.061, deskBack - 0.3);
			scaleP.rotation.x = -Math.PI / 2;
			this.own.push(scaleP.geometry);
			add(scaleP);
			this.lever = new T.Group();
			this.lever.position.set(0.12, DESK + 0.055, deskBack - 0.3);
			this.leverZ0 = deskBack - 0.3; // pozycja „0” – środek podziałki
			const stick = new T.Mesh(CYL, chrome);
			stick.scale.set(0.028, 0.26, 0.028);
			stick.position.y = 0.13;
			const knob = new T.Mesh(KNOB, cm('#202020', { rough: 0.6, glow: 0.1, env: 0.25 }));
			knob.scale.set(0.1, 0.09, 0.1);
			knob.position.y = 0.24;
			this.lever.add(stick, knob);
			g.add(this.lever);
			// kran hamulca zespolonego (po lewej): korpus zaworu, piasta, ramię z rękojeścią
			cyl(0.085, 0.07, steel, -1.12, DESK + 0.035, deskBack - 0.22);
			this.brakeHandle = new T.Group();
			this.brakeHandle.position.set(-1.12, DESK + 0.08, deskBack - 0.22);
			const hub = new T.Mesh(CYL, black);
			hub.scale.set(0.1, 0.06, 0.1);
			const arm = new T.Mesh(roundGeo(0.03, 0.03, 0.24, 0.012), chrome);
			arm.position.set(0, 0.03, -0.12);
			const grip = new T.Mesh(KNOB, cm('#b03a2e', { rough: 0.6, glow: 0.2, env: 0.25 }));
			grip.scale.set(0.06, 0.07, 0.06);
			grip.position.set(0, 0.03, -0.24);
			this.brakeHandle.add(hub, arm, grip);
			g.add(this.brakeHandle);

			// fotel maszynisty: kolumna na podstawie z pięcioma ramionami, poduszki z zaokrągleniami, podłokietniki, zagłówek
			const seatZ = this.eye.z + 0.15;
			cyl(0.05, 0.42, steel, -0.35, floor + 0.25, seatZ);
			cyl(0.08, 0.16, black, -0.35, floor + 0.1, seatZ);
			for (let k = 0; k < 5; k++) {
				const a = (k / 5) * Math.PI * 2;
				const leg = rb(0.3, 0.035, 0.05, black, -0.35 + Math.cos(a) * 0.15, floor + 0.05, seatZ + Math.sin(a) * 0.15, 0.012);
				leg.rotation.y = -a;
			}
			rb(0.55, 0.13, 0.52, fabric, -0.35, floor + 0.5, seatZ, 0.05);
			const rest = rb(0.52, 0.7, 0.12, fabric, -0.35, floor + 0.9, seatZ + 0.3, 0.05);
			rest.rotation.x = 0.15;
			rb(0.3, 0.18, 0.09, fabric, -0.35, floor + 1.35, seatZ + 0.37, 0.04);
			for (const x of [-0.65, -0.05]) {
				rb(0.07, 0.06, 0.4, black, x, floor + 0.72, seatZ - 0.02, 0.025);
				rb(0.03, 0.2, 0.03, steel, x, floor + 0.6, seatZ + 0.12, 0.008);
			}

			// lampa sufitowa: oprawa z kloszem (świeci nocą – ceilingLamp)
			rb(0.66, 0.04, 0.3, steel, 0, H - 0.1, back - 0.5, 0.012);
			this.ceilingLamp = own(new T.MeshBasicMaterial({ color: '#cfcfc8' }));
			rb(0.6, 0.03, 0.24, this.ceilingLamp, 0, H - 0.125, back - 0.5, 0.012);

			/* światło rozproszone dnia wpadające przez szyby (bez cieni): światło punktowe pod sufitem nad fotelem (wysoko
			   i dalej od blatu – oświetla pulpit równo, bez przepalonej plamy na jasnych tabliczkach). Stale
			   w grupie pojazdu (poza widokiem z kabiny – natężenie 0): liczba świateł w scenie się nie zmienia, więc
			   przełączenie widoku nie przekompilowuje shaderów */
			// (pół metra pod sufitem, z zasięgiem 5 m: dawniej 18 cm pod sufitem i do natężenia 15,5 – sufit i ściany w dzień
			// przepalone na biało)
			this.fill = new T.PointLight(0xfff2e2, 0, 5, 1.4);
			this.fill.position.set(0, H - 0.68, deskBack + 0.85).add(g.position);
			car.group.add(this.fill);
			// wnętrze przyjmuje cienie – pudło (dach, ściany) zasłania słońce, więc nie oświetla ono kabiny „przez blachę”
			g.traverse((o) => {
				if (o.isMesh) {
					o.receiveShadow = true;
					o.castShadow = false;
				}
			});
			/* scalenie nieruchomych części wnętrza o wspólnym materiale (ok. 150 siatek – ok. 150 wywołań rysowania na klatkę
			   w widoku z kabiny); dźwignie (nastawnik, kran hamulca) scalane każda wewnątrz siebie. Lampki, ekrany i tabliczki
			   mają własne materiały (zmieniane w jeździe) – zostają osobno, szyby (przezroczyste) i pudło też. */
			const moving = new Set([this.lever, this.brakeHandle]);
			if (!(NS.World && NS.World.opt && NS.World.opt.cabMerge === false)) { // perfOpt {"cabMerge":false} – porównanie
				NS.util.mergeMeshes(g, (o) => moving.has(o));
				for (const o of moving) NS.util.mergeMeshes(o);
			}
			g.traverse((o) => { if (o.isMesh && o.userData.ownGeometry) this.own.push(o.geometry); });
			this.t = 0;
			this.maxDial = Math.ceil(Math.round(model.train.vmax * 3.6) / 20) * 20 + 20;
		}

		setVisible(v) {
			this.group.visible = v;
			if (!v) this.fill.intensity = 0;
			// wnętrze kabiny widoczne z zewnątrz (train.js) – w widoku z kabiny zastępuje je pełne wnętrze
			if (this.car.room) this.car.room.visible = !v;
			/* reflektory i światła końca pierwszego pojazdu (model zewnętrzny, materiał nieoświetlany) leżą w obrębie kabiny –
			   z fotela były widoczne jako jasna okrągła tarcza na suficie; w widoku z kabiny schowane */
			if (!this.lamps0) {
				this.lamps0 = [];
				const m = this.model;
				this.car.group.traverse((o) => { if (o.isMesh && (o.material === m.headMat || o.material === m.tailMat)) this.lamps0.push(o); });
			}
			for (const o of this.lamps0) o.visible = !v;
		}

		update(sim, dt, dark) {
			if (!this.group.visible) return;
			// rozproszone światło we wnętrzu słabnie o zmroku (pulpit i ekrany świecą dalej)
			const day = 1 - Math.min(0.85, (dark || 0) * 0.9);
			for (const [m, base] of this.glow) m.emissiveIntensity = base * day;
			// nocą wnętrze oświetla tylko lampa sufitowa i ekrany – światło wypełniające słabnie
			this.fill.intensity = 0.8 + 2.7 * day * day;
			const st = sim.st;
			/* rączka nastawnika przesuwa się w szczelinie – podstawa przy znaku bieżącej pozycji (podziałka co ok. 32 mm:
			   0,38 m × 432/512 na 10 odstępów), z lekkim pochyleniem w stronę ruchu; napęd wg serii – pozycja jako ułamek
			   zakresu jazdy. Dawniej dźwignia obracała się na osi w środku podziałki i gałka (24 cm wyżej) oglądana z fotela
			   maszynisty wypadała nad sąsiednim znakiem – przy „0” wyglądało to na „H1”. */
			const lp = sim.lever > 0 && sim.drive ? (sim.lever / sim.drive.max) * 5 : sim.lever;
			this.lever.position.z = this.leverZ0 - lp * ((0.38 * 432) / 512 / 10);
			this.lever.rotation.x = -lp * 0.025;
			this.brakeHandle.rotation.y = -st.brake * 1.3;
			const blink = Math.floor(sim.time * 3) % 2 === 0;
			const set = (l, on) => l.m.color.copy(on ? l.on : l.off);
			// lampka czuwania – czuwak i SHP (ten sam przycisk)
			set(this.lamps.ca, sim.ca.alarm || sim.shp.alarm ? blink : sim.opts.czuwak && st.v > 0.5 && sim.ca.t > 50);
			set(this.lamps.doors, sim.doorsOpen);
			set(this.lamps.brake, st.brake > 0.05);
			set(this.lamps.power, sim.power); // napięcie w sieci (pantograf + wyłącznik szybki)
			this.t -= dt;
			if (this.t > 0) return;
			this.t = 0.15;
			this.drawMfd(sim);
			this.drawSide(sim);
			this.drawSpeedo(sim);
			this.drawBrake(sim);
			this.drawDial(this.volt, 'kV', 4, sim.train.electric === false ? 0 : 3.0 + Math.sin(sim.time * 0.3) * 0.08);
			// amperomierz: napęd wg serii – prąd silników z modelu napędu (1 = znamionowy ok. 560 A)
			this.drawDial(this.amp, 'A', 1000, sim.drive ? Math.min(1000, sim.drive.I * 560) : Math.abs(sim.st.traction) * 820 * Math.min(1, 0.3 + sim.st.v / 15));
		}

		// mały zegar analogowy: tarcza z podziałką, opis jednostki, wskazówka
		drawDial(t, unit, max, val) {
			if (!t) return;
			const { g, tex } = t, W = t.W, r = W * 0.44, cx = W / 2, cy = W / 2;
			g.fillStyle = '#101214';
			g.fillRect(0, 0, W, W);
			g.fillStyle = '#f1efe6';
			g.beginPath();
			g.arc(cx, cy, r, 0, Math.PI * 2);
			g.fill();
			g.strokeStyle = '#222';
			g.lineWidth = 2;
			for (let k = 0; k <= 10; k++) {
				const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
				g.beginPath();
				g.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
				g.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
				g.stroke();
			}
			g.fillStyle = '#222';
			g.font = '700 22px system-ui, sans-serif';
			g.textAlign = 'center';
			g.fillText(unit, cx, cy + r * 0.55);
			const a = Math.PI * 0.75 + Math.max(0, Math.min(1, val / max)) * Math.PI * 1.5;
			g.strokeStyle = '#c0392b';
			g.lineWidth = 4;
			g.beginPath();
			g.moveTo(cx, cy);
			g.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
			g.stroke();
			tex.needsUpdate = true;
		}

		drawMfd(sim) {
			const { g, tex, W, H } = this.mfd;
			const st = sim.st, kmh = st.v * 3.6;
			g.fillStyle = '#05070a';
			g.fillRect(0, 0, W, H);
			g.fillStyle = '#12202c';
			g.fillRect(0, 0, W, 34);
			g.fillStyle = '#9fc4e8';
			g.font = '600 20px system-ui, sans-serif';
			g.textBaseline = 'middle';
			g.textAlign = 'left';
			g.fillText(fmtClock(sim.clock()), 12, 18);
			g.textAlign = 'right';
			const ns = sim.route.stations[sim.next];
			g.fillText(ns ? ns.name : '', W - 12, 18);
			// pasek prędkości z ograniczeniem
			const x0 = 20, x1 = W - 20, yb = 250;
			const max = this.maxDial;
			const sx = (v) => x0 + ((x1 - x0) * Math.min(v, max)) / max;
			g.fillStyle = '#1e2a35';
			g.fillRect(x0, yb, x1 - x0, 22);
			g.fillStyle = kmh > sim.limit + 3 ? '#ff4b3e' : '#34d058';
			g.fillRect(x0, yb, sx(kmh) - x0, 22);
			g.fillStyle = '#ffffff';
			g.fillRect(sx(sim.limit) - 2, yb - 8, 4, 38);
			// cyfrowa prędkość
			g.textAlign = 'center';
			g.fillStyle = kmh > sim.limit + 3 ? '#ff6b5e' : '#ffffff';
			g.font = '700 96px ui-monospace, Consolas, monospace';
			g.fillText(String(Math.round(kmh)), 170, 140);
			g.font = '500 20px system-ui, sans-serif';
			g.fillStyle = '#8f9bad';
			g.fillText('km/h', 170, 205);
			// ograniczenie (tarcza) i semafor
			g.beginPath();
			g.arc(360, 120, 52, 0, Math.PI * 2);
			g.fillStyle = '#ffffff';
			g.fill();
			g.lineWidth = 12;
			g.strokeStyle = '#d0302a';
			g.stroke();
			g.fillStyle = '#111';
			g.font = '800 44px system-ui, sans-serif';
			g.fillText(String(sim.limit), 360, 122);
			const sig = sim.nextSignal();
			if (sig) {
				g.beginPath();
				g.arc(460, 90, 20, 0, Math.PI * 2);
				g.fillStyle = ASPECT[sig.aspect];
				g.fill();
				g.fillStyle = '#c9d1db';
				// oznaczenie sygnału wg Ie-1 (S1…S13a) nad lampką
				g.font = '700 17px ui-monospace, Consolas, monospace';
				g.fillText(sig.code, 460, 56);
				g.font = '600 18px system-ui, sans-serif';
				const d = sig.pos - st.pos;
				g.fillText(d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`, 460, 135);
			}
			g.fillStyle = '#ffb020';
			g.font = '700 22px ui-monospace, Consolas, monospace';
			g.fillText(sim.leverName(), 460, 200);
			tex.needsUpdate = true;
		}

		drawSide(sim) {
			const { g, tex, W, H } = this.side;
			const st = sim.st;
			g.fillStyle = '#05070a';
			g.fillRect(0, 0, W, H);
			g.font = '600 20px system-ui, sans-serif';
			g.textBaseline = 'middle';
			g.textAlign = 'left';
			const row = (y, label, value, color) => {
				g.fillStyle = '#8f9bad';
				g.fillText(label, 14, y);
				g.fillStyle = color || '#e6ebf2';
				g.textAlign = 'right';
				g.fillText(value, W - 14, y);
				g.textAlign = 'left';
			};
			row(30, 'Siła pociągowa', `${Math.round(st.traction * 100)} %`, '#34d058');
			if (sim.air) row(70, 'Przewód / cylinder', `${sim.air.pg.toFixed(1)} / ${sim.air.cyl[0].toFixed(1)} bar`, sim.air.cyl[0] > 0.2 ? '#ff6b5e' : null);
			else row(70, 'Hamulec', `${(st.brake * 3.8).toFixed(1)} bar`, st.brake > 0.05 ? '#ff6b5e' : null);
			row(110, 'Drzwi', sim.doorsOpen ? 'OTWARTE' : 'zamknięte', sim.doorsOpen ? '#ffb020' : '#34d058');
			row(150, 'Profil', `${window.TrainRoutes.gradeAt(sim.route, st.pos - sim.L / 2)} ‰`);
			// czuwak: pasek do alarmu
			g.fillStyle = '#8f9bad';
			g.fillText('CA', 14, 200);
			g.fillStyle = '#1e2a35';
			g.fillRect(60, 190, W - 74, 20);
			const k = sim.opts.czuwak ? Math.min(1, sim.ca.t / 60) : 0;
			g.fillStyle = sim.ca.alarm ? '#ff3b30' : k > 0.8 ? '#ffb020' : '#3aa0ff';
			g.fillRect(60, 190, (W - 74) * k, 20);
			tex.needsUpdate = true;
		}

		dial(t, value, max, step, label, color, value2) {
			const { g, tex } = t;
			const S = t.W, cx = S / 2, cy = S / 2, r = S / 2 - 8;
			const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
			const ang = (v) => a0 + ((a1 - a0) * Math.min(Math.max(v, 0), max)) / max;
			g.fillStyle = '#e9e6dc';
			g.beginPath();
			g.arc(cx, cy, r + 6, 0, Math.PI * 2);
			g.fill();
			g.fillStyle = '#101214';
			g.beginPath();
			g.arc(cx, cy, r, 0, Math.PI * 2);
			g.fill();
			g.strokeStyle = '#d8dde3';
			g.fillStyle = '#d8dde3';
			g.font = `600 ${Math.round(S * 0.075)}px system-ui, sans-serif`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			for (let v = 0; v <= max + 1e-6; v += step / 2) {
				const a = ang(v), big = Math.abs(v / step - Math.round(v / step)) < 1e-6;
				g.lineWidth = big ? 3 : 1.5;
				g.beginPath();
				g.moveTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
				g.lineTo(cx + Math.cos(a) * (r - (big ? 22 : 14)), cy + Math.sin(a) * (r - (big ? 22 : 14)));
				g.stroke();
				if (big) g.fillText(String(Math.round(v)), cx + Math.cos(a) * (r - 40), cy + Math.sin(a) * (r - 40));
			}
			g.fillStyle = '#8f9bad';
			g.font = `500 ${Math.round(S * 0.07)}px system-ui, sans-serif`;
			g.fillText(label, cx, cy + r * 0.45);
			const needle = (v, col, w) => {
				const a = ang(v);
				g.strokeStyle = col;
				g.lineWidth = w;
				g.lineCap = 'round';
				g.beginPath();
				g.moveTo(cx - Math.cos(a) * 14, cy - Math.sin(a) * 14);
				g.lineTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18));
				g.stroke();
			};
			if (value2 !== undefined) needle(value2, '#e6ebf2', 4);
			needle(value, color, 5);
			g.fillStyle = '#444';
			g.beginPath();
			g.arc(cx, cy, 10, 0, Math.PI * 2);
			g.fill();
			tex.needsUpdate = true;
		}

		drawSpeedo(sim) {
			this.dial(this.speedo, sim.st.v * 3.6, this.maxDial, 20, 'km/h', '#ffb020');
		}

		drawBrake(sim) {
			// czerwona – cylinder hamulcowy, biała – przewód główny
			// hamulec zespolony: ciśnienia z modelu powietrza (cylinder pierwszego pojazdu)
			if (sim.air) this.dial(this.brakeG, sim.air.cyl[0], 10, 2, 'bar', '#ff4b3e', sim.air.pg);
			else this.dial(this.brakeG, sim.st.brake * 3.8, 10, 2, 'bar', '#ff4b3e', 5 - sim.st.brake * 1.5);
		}

		// oko maszynisty w świecie (lekkie drgania przy jeździe)
		eyeWorld(out, sim, time) {
			const v = sim.st.v;
			const shake = Math.min(1, v / 25) * 0.006;
			out.set(this.eye.x + Math.sin(time * 17) * shake, this.eye.y + Math.sin(time * 23) * shake * 1.5, this.eye.z).add(this.group.position);
			this.car.group.updateMatrixWorld();
			return this.car.group.localToWorld(out);
		}

		// kierunek patrzenia: yaw (obrót w bok), down (pochylenie w dół) względem kabiny
		lookDir(out, yaw, down) {
			out.set(-Math.sin(yaw) * Math.cos(down), -Math.sin(down), -Math.cos(yaw) * Math.cos(down));
			return out.applyQuaternion(this.car.group.quaternion);
		}

		dispose() {
			this.car.group.remove(this.group);
			this.car.group.remove(this.fill);
			for (const o of this.own) o.dispose();
		}
	}

	NS.CabInterior = CabInterior;
})();
