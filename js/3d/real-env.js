/* Prawdziwe otoczenie tras rzeczywistych (dane OpenStreetMap w układzie trasy – zob. js/osm-route.js):
   budynki wyciągnięte z obrysów (elewacje z oknami świecącymi nocą, dachy płaskie, dwuspadowe i kopertowe),
   drogi na terenie, rzeki i zbiorniki, kolor terenu wg zagospodarowania, drzewa w lasach i parkach.
   Rozszerza World o metody wywoływane przy budowie kawałków świata. */
(function () {
	'use strict';
	const T = window.THREE;
	const R = window.TrainRoutes;
	const NS = window.Train3D;
	const { hash, vnoise, patch, canvasTexture, mat, box, GEO, smoothstep } = NS.util;
	const World = NS.World;
	const C = 200;
	const tp = {};
	const col = new T.Color();

	// rodzaje budynków: 0 dom, 1 blok, 2 hala/przemysł, 3 usługi/urząd, 4 kościół, 5 garaż/szopa
	const WALLS = [
		['#e8dcc4', '#d9c2a5', '#efe6cf', '#c9d3d9', '#f2efe6', '#d8b896', '#c4b49c', '#e3d2b4'],
		['#e6e1d6', '#d4cfc4', '#c9ced3', '#e0d3b8', '#b9c3c9', '#d9c9a8', '#cfd8cc', '#e8d8c0'],
		['#b9bdc1', '#a9adb1', '#c2b9ad', '#9fa8ac', '#c8bba8', '#a8968a', '#b88a68'],
		['#d9d6cf', '#c4c9cc', '#e3ddd0', '#b8c2c8', '#d6c7ad'],
		['#d8cdb8', '#c9b89a', '#b5543c'],
		['#b3a99d', '#a4a7aa', '#bdb1a0', '#9a9c9f'],
		['#e8d9b5', '#e2cfa8', '#d9c2a5', '#c98f72'],
	];
	const ROOFS = [
		['#8e3b2e', '#6d4c3d', '#59626b', '#a0522d', '#7a3326', '#4d5257'],
		['#5a5f66', '#6b6f73', '#62584f'],
		['#868b8f', '#7a8084', '#959a9e'],
		['#5a5f66', '#6b6f73'],
		['#7a3326', '#4f6a5a'],
		['#76797d', '#7f6656', '#6a6e72'],
		['#8e3b2e', '#5a5f66', '#7a3326'],
	];
	/* rodzaje (przeznaczenie) budynków – env.bu (zob. USE_RULES w osm-route.js): 1 dom, 2 blok, 3 garaż, 4 przemysł,
	   5 magazyn, 6 biurowiec, 7 sklep/usługi, 8 market/centrum handlowe, 9 restauracja, 10 bank, 11 apteka, 12 poczta,
	   13 policja, 14 straż pożarna, 15 szkoła, 16 przedszkole/żłobek, 17 uczelnia, 18 szpital, 19 przychodnia,
	   20 urząd/sąd, 21 kościół/kaplica, 22 hotel, 23 hala sportowa/basen, 24 kultura (biblioteka, dom kultury, muzeum,
	   teatr, kino), 25 dworzec, 26 stacja paliw, 27 warsztat/myjnia, 28 opieka społeczna, 29 technika (transformator,
	   kotłownia), 30 nastawnia, 31 dworzec autobusowy/zajezdnia, 32 areszt/koszary, 33 dom studencki, 34 parking.
	   USE_SIGN: napis szyldu (gdy brak nazwy z mapy), tło, kolor napisu, znak (krzyż), szyld wysoko (market, hotel);
	   USE_WALL: kolor elewacji (budynki niemieszkalne). */
	const USE_SIGN = {
		6: [null, '#2b3a4a', '#ffffff'],
		7: ['SKLEP', '#1f5f8b', '#ffffff'],
		8: ['MARKET', '#d7262e', '#ffffff', null, true],
		9: ['RESTAURACJA', '#5a2e1e', '#f5deb3'],
		10: ['BANK', '#0b3d6b', '#ffffff'],
		11: ['APTEKA', '#1e8f3e', '#ffffff', 'cross'],
		12: ['POCZTA', '#f6c800', '#c4161c'],
		13: ['POLICJA', '#1d3f8f', '#ffffff'],
		14: ['STRAŻ POŻARNA', '#c4161c', '#ffffff'],
		15: ['SZKOŁA', '#1c3d6e', '#ffffff'],
		16: ['PRZEDSZKOLE', '#f39c12', '#ffffff'],
		17: ['UCZELNIA', '#2c2c54', '#ffffff'],
		18: ['SZPITAL', '#ffffff', '#c4161c', 'cross'],
		19: ['PRZYCHODNIA', '#ffffff', '#1e8f3e', 'cross'],
		20: ['URZĄD', '#f2f2f2', '#7a1f1f'],
		22: ['HOTEL', '#1b1b1b', '#e8c46a', null, true],
		23: ['HALA SPORTOWA', '#0e6b8c', '#ffffff'],
		24: ['DOM KULTURY', '#5b2c6f', '#ffffff'],
		26: ['STACJA PALIW', '#1e8f3e', '#ffffff'],
		27: ['SERWIS', '#33363a', '#f2c230'],
		28: ['DOM POMOCY', '#3d6b5a', '#ffffff'],
		30: [null, '#1c3d6e', '#ffffff'],
		31: ['DWORZEC AUTOBUSOWY', '#1c3d6e', '#ffffff'],
		33: ['DOM STUDENCKI', '#2c2c54', '#ffffff'],
	};
	const SHOPS = ['SPOŻYWCZY', 'PIEKARNIA', 'KWIATY', 'ODZIEŻ', 'MIĘSO WĘDLINY', 'DROGERIA', 'OPTYK', 'FRYZJER', 'KSIĘGARNIA', 'ELEKTRONIKA', 'OBUWIE', 'ZOOLOGICZNY'];
	const MARKET_C = ['#d7262e', '#0a5ca8', '#f2b705', '#1e8f3e', '#e4572e'];
	const USE_WALL = {
		12: ['#efe3c0', '#e8dcc4'], 13: ['#dfe3e6', '#cfd6dc'], 14: ['#a8432f', '#b5543c', '#d9d6cf'], 15: ['#e9d49a', '#f0e2b6', '#e3cfa6'],
		16: ['#f2c2c2', '#bfe3c4', '#c9d9f2', '#f5e3a1'], 17: ['#d9cdb5', '#c9a98a'], 18: ['#f1f1ee', '#e6ebee'], 19: ['#e9eef0', '#eef0e6'],
		20: ['#e3d6bb', '#efe6cf', '#d8c8a8'], 22: ['#e6dccb', '#d9d6cf'], 23: ['#c9d3d9', '#d6dde2'], 24: ['#dccfb5', '#e3d6bb'],
		8: ['#d9dcdf', '#e1e3e5'], 10: ['#d8d4cc', '#c9c4ba'], 30: ['#c98f72', '#b5765c'], 32: ['#b9b3a8'],
	};
	// szyld: napis (zmniejszany do szerokości), opcjonalnie krzyż (apteka, szpital, przychodnia)
	const signTexture = (text, bg, fg, icon) => canvasTexture(`sign|${text}|${bg}|${fg}|${icon || ''}`, 512, 96, (g, w, h) => {
		g.fillStyle = bg;
		g.fillRect(0, 0, w, h);
		g.strokeStyle = fg;
		g.globalAlpha = 0.35;
		g.lineWidth = 4;
		g.strokeRect(4, 4, w - 8, h - 8);
		g.globalAlpha = 1;
		let x0 = 24;
		if (icon === 'cross') {
			const c = h / 2, a = h * 0.36, t = h * 0.13;
			g.fillStyle = fg;
			g.fillRect(24 + a - t, c - a, t * 2, a * 2);
			g.fillRect(24, c - t, a * 2, t * 2);
			x0 = 24 + a * 2 + 16;
		}
		g.fillStyle = fg;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		let size = 58;
		g.font = `700 ${size}px system-ui, sans-serif`;
		while (g.measureText(text).width > w - x0 - 24 && size > 20) { size -= 3; g.font = `700 ${size}px system-ui, sans-serif`; }
		g.fillText(text, (x0 + w - 24) / 2, h / 2 + 2);
	});
	// drogi wg ROAD_TYPES z osm-route.js: szerokość, kolor, linia środkowa
	const ROAD_W = [12, 10, 9, 8, 7, 5.5, 5.5, 4.5, 3.6, 4.5, 5];
	const ROAD_C = ['#3a3d41', '#3c3f43', '#3d4044', '#3f4246', '#414447', '#46494c', '#45484b', '#55575a', '#4c4e51', '#8e8a83', '#46494c'];
	// kolory terenu wg zagospodarowania (0 brak … 10 boiska) i udział drzew
	const AREA_RGB = [[0.38, 0.47, 0.25], [0.2, 0.3, 0.14], [0.3, 0.5, 0.22], [0.37, 0.53, 0.24], [0.47, 0.5, 0.29], [0.41, 0.48, 0.31], [0.53, 0.51, 0.46], [0.56, 0.55, 0.52], [0.3, 0.42, 0.22], [0.42, 0.4, 0.32], [0.26, 0.55, 0.26], [0.22, 0.31, 0.15], [0.18, 0.28, 0.14]];
	const AREA_SAND = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.35, 0]; // piasek tylko na brzegach wód (na placach shader piasku robił „wydmy”)
	const TREE_P = [0.06, 1, 0.45, 0.12, 0.03, 0.14, 0.03, 0.02, 0.4, 0, 0.02, 1, 1]; // 11, 12 – las liściasty / iglasty

	// materiały otoczenia (wspólne)
	function envMaterials() {
		if (World.envM) return World.envM;
		/* elewacja: 4 przęsła × 4 kondygnacje (12 × 12 m, 128 px na 3 m): okna z ramą, słupkiem i ślemieniem,
		   szyby z odbiciem nieba, firanki i rolety w części okien, parapety i nadproża, tynk z ziarnem; mapa
		   normalnych – okna wpuszczone w ścianę (ościeża), wystające parapety; mapa świecenia – część okien zapalona */
		const FW = 512, CELL = 128;
		const win = (i, j) => ({ x0: i * CELL + 32, x1: i * CELL + 96, y0: j * CELL + 19, y1: j * CELL + 92, h: hash(i * 7.1 + j * 3.3) , h2: hash(i * 2.9 + j * 8.1 + 0.4) });
		const facadeTex = canvasTexture('env-facade2', FW, FW, (g, w) => {
			g.fillStyle = '#f4f3f0';
			g.fillRect(0, 0, w, w);
			// ziarno tynku
			const img = g.getImageData(0, 0, w, w), dd = img.data;
			for (let q = 0; q < dd.length; q += 4) { const n = (hash(q * 0.37) - 0.5) * 14; dd[q] += n; dd[q + 1] += n; dd[q + 2] += n; }
			g.putImageData(img, 0, 0);
			for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
				const W2 = win(i, j);
				// nadproże i parapet (z cieniem pod spodem)
				g.fillStyle = '#e2e0da';
				g.fillRect(W2.x0 - 4, W2.y0 - 7, W2.x1 - W2.x0 + 8, 7);
				g.fillStyle = '#d6d3cc';
				g.fillRect(W2.x0 - 6, W2.y1, W2.x1 - W2.x0 + 12, 6);
				g.fillStyle = 'rgba(0,0,0,0.13)';
				g.fillRect(W2.x0 - 6, W2.y1 + 6, W2.x1 - W2.x0 + 12, 5);
				// ościeże (cień w otworze)
				g.fillStyle = '#9d9a94';
				g.fillRect(W2.x0, W2.y0, W2.x1 - W2.x0, W2.y1 - W2.y0);
				// rama
				const fx0 = W2.x0 + 3, fy0 = W2.y0 + 3, fx1 = W2.x1 - 3, fy1 = W2.y1 - 1;
				g.fillStyle = W2.h2 < 0.2 ? '#7a5a3e' : '#f7f7f5';
				g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
				// szyby: odbicie nieba (jaśniej u dołu), ukośny refleks
				const panes = [[fx0 + 4, fy0 + 4, (fx0 + fx1) / 2 - 2, fy0 + 20], [(fx0 + fx1) / 2 + 2, fy0 + 4, fx1 - 4, fy0 + 20], [fx0 + 4, fy0 + 24, (fx0 + fx1) / 2 - 2, fy1 - 4], [(fx0 + fx1) / 2 + 2, fy0 + 24, fx1 - 4, fy1 - 4]];
				for (const [a, b, c2, d2] of panes) {
					const gr = g.createLinearGradient(0, b, 0, d2);
					gr.addColorStop(0, '#2c3846');
					gr.addColorStop(1, '#5d7186');
					g.fillStyle = gr;
					g.fillRect(a, b, c2 - a, d2 - b);
				}
				g.save();
				g.beginPath();
				for (const [a, b, c2, d2] of panes) g.rect(a, b, c2 - a, d2 - b);
				g.clip();
				g.fillStyle = 'rgba(220,235,250,0.16)';
				g.beginPath();
				g.moveTo(fx0 + 10 + W2.h * 20, fy1);
				g.lineTo(fx0 + 30 + W2.h * 20, fy1);
				g.lineTo(fx0 + 60 + W2.h * 20, fy0);
				g.lineTo(fx0 + 40 + W2.h * 20, fy0);
				g.fill();
				// firanki / zasłony / rolety
				if (W2.h < 0.45) {
					g.fillStyle = 'rgba(236,230,216,0.82)';
					g.fillRect(fx0 + 4, fy0 + 24, 9, fy1 - fy0 - 28);
					g.fillRect(fx1 - 13, fy0 + 24, 9, fy1 - fy0 - 28);
					g.fillStyle = 'rgba(240,236,226,0.35)';
					g.fillRect(fx0 + 13, fy0 + 24, fx1 - fx0 - 26, fy1 - fy0 - 28);
				} else if (W2.h < 0.6) {
					const rl = fy0 + 4 + (fy1 - fy0) * (0.25 + W2.h2 * 0.5);
					g.fillStyle = '#c9c6bd';
					g.fillRect(fx0 + 4, fy0 + 4, fx1 - fx0 - 8, rl - fy0 - 4);
					g.fillStyle = 'rgba(0,0,0,0.12)';
					for (let y = fy0 + 6; y < rl; y += 4) g.fillRect(fx0 + 4, y, fx1 - fx0 - 8, 1);
				}
				g.restore();
			}
		});
		// mapa normalnych z mapy wysokości: ściana 0,5, otwór okna 0, rama 0,25, parapet 0,85, nadproże 0,62
		const facadeNorm = canvasTexture('env-facade2-n', FW, FW, (g, w) => {
			const H = new Float32Array(w * w).fill(0.5);
			const fill = (x0, y0, x1, y1, v) => { for (let y = Math.max(0, y0); y < Math.min(w, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) H[y * w + x] = v; };
			for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
				const W2 = win(i, j);
				fill(W2.x0 - 4, W2.y0 - 7, W2.x1 + 4, W2.y0, 0.6);
				fill(W2.x0, W2.y0, W2.x1, W2.y1, 0.0);
				fill(W2.x0 + 3, W2.y0 + 3, W2.x1 - 3, W2.y1 - 1, 0.22);
				const fx0 = W2.x0 + 3, fy0 = W2.y0 + 3, fx1 = W2.x1 - 3, fy1 = W2.y1 - 1;
				for (const [a, b, c2, d2] of [[fx0 + 4, fy0 + 4, (fx0 + fx1) / 2 - 2, fy0 + 20], [(fx0 + fx1) / 2 + 2, fy0 + 4, fx1 - 4, fy0 + 20], [fx0 + 4, fy0 + 24, (fx0 + fx1) / 2 - 2, fy1 - 4], [(fx0 + fx1) / 2 + 2, fy0 + 24, fx1 - 4, fy1 - 4]]) fill(a | 0, b | 0, c2 | 0, d2 | 0, 0.1);
				fill(W2.x0 - 6, W2.y1, W2.x1 + 6, W2.y1 + 6, 0.85);
			}
			const img = g.createImageData(w, w), dd = img.data, S = 3.2;
			for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
				const hx = H[y * w + Math.min(w - 1, x + 1)] - H[y * w + Math.max(0, x - 1)];
				const hy = H[Math.min(w - 1, y + 1) * w + x] - H[Math.max(0, y - 1) * w + x];
				// kanwa: y w dół = v w dół, stąd znak przy hy
				const nx = -hx * S, ny = hy * S, l = Math.hypot(nx, ny, 1), q = (y * w + x) * 4;
				dd[q] = ((nx / l) * 0.5 + 0.5) * 255; dd[q + 1] = ((ny / l) * 0.5 + 0.5) * 255; dd[q + 2] = ((1 / l) * 0.5 + 0.5) * 255; dd[q + 3] = 255;
			}
			g.putImageData(img, 0, 0);
		});
		facadeNorm.colorSpace = T.NoColorSpace;
		const litTex = canvasTexture('env-facade2-lit', FW, FW, (g, w) => {
			g.fillStyle = '#000000';
			g.fillRect(0, 0, w, w);
			for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
				if (hash(i * 7.1 + j * 3.3 + 0.21) > 0.42) continue;
				const W2 = win(i, j), warm = hash(i * 1.3 + j * 9.7) < 0.75;
				const gr = g.createLinearGradient(0, W2.y0, 0, W2.y1);
				gr.addColorStop(0, warm ? '#ffcf8a' : '#bcd2ff');
				gr.addColorStop(1, warm ? '#ffe2b8' : '#dbe7ff');
				g.fillStyle = gr;
				g.fillRect(W2.x0 + 7, W2.y0 + 7, W2.x1 - W2.x0 - 14, W2.y1 - W2.y0 - 12);
			}
		});
		for (const t of [facadeTex, litTex, facadeNorm]) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; }
		litTex.colorSpace = T.SRGBColorSpace;
		const m = (o, v) => patch(new T.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9 }, o)), v || 'lit');
		World.envM = {
			facade: m({ map: facadeTex, normalMap: facadeNorm, normalScale: new T.Vector2(1, 1), emissiveMap: litTex, emissive: '#ffffff', emissiveIntensity: 0 }, 'dirt'),
			plain: m({}, 'dirt'),
			// przesunięcie głębi: między wierzchołkami jezdnia nie przecina załamań siatki terenu i mogła się pod nie
			// zapadać o kilka centymetrów (z ukosa – zielone kliny w jezdni)
			road: m({ roughness: 0.94, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -12 }, 'road'),
			roadMark: m({ roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -24 }, 'road'), // oznakowanie – nad jezdnią
			roadDouble: m({ roughness: 0.94, side: T.DoubleSide }, 'road'), // wiadukty drogowe
			ballastOld: patch(new T.MeshStandardMaterial({ color: '#7f766a', roughness: 0.97 }), 'gravel'), // stara podsypka bocznic
			ballastWeed: patch(new T.MeshStandardMaterial({ color: '#6d6a52', roughness: 0.98 }), 'gravel'), // zarośnięta podsypka torów nieużywanych
			sleeperWood: patch(new T.MeshStandardMaterial({ color: '#4f3e30', roughness: 0.95 }), 'dirt'),
			deck: patch(new T.MeshStandardMaterial({ color: '#a7a39b', roughness: 0.92, side: T.DoubleSide }), 'concrete'), // pomosty torów na mostach
			embank: patch(new T.MeshStandardMaterial({ color: '#6d7a45', roughness: 0.95, side: T.DoubleSide }), 'lit'), // nasypy torów z mapy
			catSteel: patch(new T.MeshStandardMaterial({ color: '#8c9298', roughness: 0.45, metalness: 0.6 }), 'lit'), // konstrukcje sieci
			catInsul: patch(new T.MeshStandardMaterial({ color: '#7a4a32', roughness: 0.35, metalness: 0.1 }), 'lit'), // izolatory
			catFound: patch(new T.MeshStandardMaterial({ color: '#9e9a92', roughness: 0.95 }), 'concrete'), // fundamenty
			switchMachine: patch(new T.MeshStandardMaterial({ color: '#4f6a8a', roughness: 0.6, metalness: 0.3 }), 'lit'), // napędy zwrotnicowe
			switchHand: patch(new T.MeshStandardMaterial({ color: '#2d3136', roughness: 0.7, metalness: 0.4 }), 'lit'), // zwrotniki ręczne
			switchLamp: patch(new T.MeshStandardMaterial({ color: '#e8ecef', emissive: '#c8d8ff', emissiveIntensity: 0.25, roughness: 0.5 }), 'lit'), // latarnie zwrotnicowe
		};
		for (const k of Object.keys(World.envM)) World.envM[k].userData.shared = true;
		return World.envM;
	}

	// ---------- indeks otoczenia trasy ----------
	World.prototype.envIndex = function (route) {
		const env = route.env;
		this.env = null;
		if (!env) return;
		const bByChunk = new Map(), rByChunk = new Map(), wByChunk = new Map();
		const push = (map, c, v) => { if (!map.has(c)) map.set(c, []); map.get(c).push(v); };
		// rodzaj budynku i nazwa z mapy (env.bu, env.bn: indeks, nazwa, …)
		const bUse = env.bu || [], bName = new Map();
		for (let k = 0; k + 1 < (env.bn || []).length; k += 2) bName.set(env.bn[k], env.bn[k + 1]);
		env.b.forEach((row, i) => {
			let cs = 0, s0 = Infinity, s1 = -Infinity, d0 = Infinity, d1 = -Infinity;
			const n = (row.length - 3) / 2;
			for (let k = 0; k < n; k++) {
				const s = row[3 + k * 2], d = row[4 + k * 2];
				cs += s;
				s0 = Math.min(s0, s); s1 = Math.max(s1, s); d0 = Math.min(d0, d); d1 = Math.max(d1, d);
			}
			const b = { i, row, n, s0, s1, d0, d1, cs: cs / n };
			push(bByChunk, Math.floor(b.cs / C), b);
		});
		// drogi i cieki: każdy odcinek do kawałka, w którym leży jego środek
		const lines = (list, map) => list.forEach((row, i) => {
			const n = (row.length - 1) / 2;
			for (let k = 0; k < n - 1; k++) {
				const sm = (row[1 + k * 2] + row[3 + k * 2]) / 2;
				push(map, Math.floor(sm / C), { i, k, row });
			}
		});
		lines(env.r, rByChunk);
		lines(env.w, wByChunk);
		/* ulice: szerokość (z BDOT albo wg klasy), pasy (bez danych – z szerokości), nawierzchnia, chodniki, jednokierunkowa */
		const ra = env.ra || [];
		const rInfo = env.r.map((row, i) => {
			const a = ra[i] || [0, 0, 0, -1, 0], ti = row[0];
			const w = a[1] > 0 ? Math.max(3, Math.min(16, a[1] / 10)) : ROAD_W[ti] || 5;
			return { w, lanes: a[0] || (w >= 12 ? 4 : w >= 5.2 ? 2 : 1), surf: a[2] || 0, sw: a[3] > 0 && a[2] !== 3 ? a[3] : 0, one: a[4] || 0 };
		});
		const rxByChunk = new Map(), pkByChunk = new Map();
		for (const x of env.rx || []) push(rxByChunk, Math.floor(x[0] / C), x);
		(env.pk || []).forEach((row) => {
			let cs = 0;
			const n = (row.length - 1) / 2;
			for (let k = 0; k < n; k++) cs += row[1 + k * 2];
			push(pkByChunk, Math.floor(cs / n / C), row);
		});
		// zadaszenia peronów z mapy (env.rf: wysokość dm, szkło, poziom, s, d, …) wg kawałka środka obrysu
		const rfByChunk = new Map(), rfAll = [];
		for (const row of env.rf || []) {
			const pts = [];
			for (let k = 3; k + 1 < row.length; k += 2) pts.push([row[k], row[k + 1]]);
			const cs = pts.reduce((a, p) => a + p[0], 0) / pts.length;
			const o = { h: row[0] / 10, glass: !!row[1], layer: row[2], pts, cs, s0: Math.min(...pts.map((p) => p[0])), s1: Math.max(...pts.map((p) => p[0])) };
			push(rfByChunk, Math.floor(cs / C), o);
			rfAll.push(o);
		}
		const tByChunk = new Map(), pByChunk = new Map();
		lines(env.t || [], tByChunk);
		(env.p || []).forEach((row, i) => {
			let cs = 0;
			const n = (row.length - 1) / 2;
			for (let k = 0; k < n; k++) cs += row[1 + k * 2];
			push(pByChunk, Math.floor(cs / n / C), { i, row, n });
		});
		// prawdziwe dworce (rodzaj 6) przy stacjach trasy: zastępują model dworca z gry
		const stationReal = new Map();
		for (const list of bByChunk.values()) for (const b of list) {
			if (b.row[0] !== 6) continue;
			route.stations.forEach((st, si) => {
				if (st.type === 'halt' || b.cs < st.platformStart - 150 || b.cs > st.platformEnd + 150) return;
				const cur = stationReal.get(si);
				const dist = Math.abs(b.cs - (st.platformStart + st.platformEnd) / 2) + Math.abs((b.d0 + b.d1) / 2) * 0.5;
				if (!cur || dist < cur.dist) stationReal.set(si, { b, dist });
			});
		}
		// stacje bez dworca z mapy: miejsce dworca z gry wolne od budynków i dróg z mapy
		const reserved = [];
		route.stations.forEach((st, si) => {
			if (st.type === 'halt' || stationReal.has(si) || (st.platform && st.platform.island)) return;
			const sg = st.platform ? st.platform.side : 1;
			const sb = (st.platformStart + st.platformEnd) / 2 + sg * ((st.platformEnd - st.platformStart) / 2 - 22);
			reserved.push(sg > 0 ? { s0: sb - 18, s1: sb + 18, d0: 5, d1: 26 } : { s0: sb - 18, s1: sb + 18, d0: -26, d1: -5 });
		});
		// mosty drogowe obok toru: kawałek wg środka obiektu
		const obByChunk = new Map();
		(env.ob || []).forEach((row) => {
			let cs = 0;
			const n = (row.length - 2) / 2;
			for (let k = 0; k < n; k++) cs += row[2 + k * 2];
			push(obByChunk, Math.floor(cs / n / C), row);
		});
		// raster zagospodarowania
		const g = env.g, rows = g.rows.length;
		const grid = new Uint8Array(rows * g.cols);
		g.rows.forEach((line, ri) => {
			let c = 0;
			const re = /([A-Z])(\d+)/g;
			let m;
			while ((m = re.exec(line))) {
				const kind = m[1].charCodeAt(0) - 65, cnt = Number(m[2]);
				grid.fill(kind, ri * g.cols + c, ri * g.cols + c + cnt);
				c += cnt;
			}
		});
		// wiadukty drogowe nad torem: kawałek wg punktu nad osią toru
		const oByChunk = new Map();
		(env.o || []).forEach((row) => {
			let best = 1, bd = Infinity;
			for (let i = 1; i < row.length; i += 2) if (Math.abs(row[i + 1]) < bd) { bd = Math.abs(row[i + 1]); best = i; }
			push(oByChunk, Math.floor(row[best] / C), row);
		});
		const kByChunk = new Map();
		(env.k || []).forEach((k) => push(kByChunk, Math.floor(k[0] / C), k));
		const swByChunk = new Map();
		(env.sw || []).forEach((x) => push(swByChunk, Math.floor(x[0] / C), x));
		const usedPlatforms = new Set(route.stations.filter((x) => x.platform && x.platform.pi !== undefined).map((x) => x.platform.pi));
		// przekroje torów z mapy (słupy trakcyjne, semafory, filary – wolne miejsca obok torów): odcinek do każdego
		// kawałka, który obejmuje
		const tSpan = new Map();
		(env.t || []).forEach((row, i) => {
			const n = (row.length - 1) / 2;
			for (let k = 0; k < n - 1; k++) {
				const a = row[1 + k * 2], b = row[3 + k * 2];
				for (let c = Math.floor(Math.min(a, b) / C); c <= Math.floor(Math.max(a, b) / C); c++) push(tSpan, c, { k, row, i });
			}
		});
		// wiadukty kolejowe nad torem: kawałek wg punktu nad osią toru
		const roByChunk = new Map();
		(env.ro || []).forEach((row) => {
			let best = 1, bd = Infinity;
			for (let i = 1; i < row.length; i += 2) if (Math.abs(row[i + 1]) < bd) { bd = Math.abs(row[i + 1]); best = i; }
			push(roByChunk, Math.floor(row[best] / C), row);
		});
		// korony drzew z pomiaru (NMPT − NMT): siatka jak zagospodarowanie, kod co cv.q m
		let cvGrid = null;
		if (env.cv && env.cv.rows) {
			cvGrid = new Uint8Array(env.cv.rows.length * env.cv.cols);
			env.cv.rows.forEach((line, ri) => {
				let c = 0;
				const re = /([A-Z])(\d+)/g;
				let m;
				while ((m = re.exec(line))) {
					const cnt = Number(m[2]);
					cvGrid.fill(m[1].charCodeAt(0) - 65, ri * env.cv.cols + c, ri * env.cv.cols + c + cnt);
					c += cnt;
				}
			});
		}
		// pomosty z pomiaru (dm ponad dem.base, −1 – brak): wiadukty nad torem (drogowe, kolejowe), mosty obok
		// wysokości dróg z pomiaru (dm ponad dem.base) dla wierszy env.r
		const roadZ = new Map();
		(env.r || []).forEach((row, i) => { if (env.rh && env.rh[i]) roadZ.set(row, env.rh[i]); });
		const deckZ = new Map();
		for (const [rows2, zs] of [[env.o, env.oz], [env.ro, env.roz], [env.ob, env.obz]]) (rows2 || []).forEach((row, i) => { if (zs && zs[i] >= 0) deckZ.set(row, zs[i]); });
		// profil jezdni z pomiaru w każdym punkcie łamanej (dm ponad dem.base)
		const deckP = new Map();
		for (const [rows2, hs] of [[env.o, env.oh], [env.ro, env.roh], [env.ob, env.obh]]) (rows2 || []).forEach((row, i) => { if (hs && hs[i]) deckP.set(row, hs[i]); });
		this.env = { bByChunk, rByChunk, wByChunk, tByChunk, pByChunk, oByChunk, obByChunk, roByChunk, kByChunk, tSpan, tAt: new Map(), usedPlatforms, swByChunk, stationReal, reserved, grid, g, rows, masks: new Map(), cvGrid, deckZ, deckP, roadZ, rmasks: new Map(), rInfo, rxByChunk, pkByChunk, rfByChunk, rfAll, bUse, bName };
		// strefy rozjazdów: od ostrza do ukresu (tory 3,6 m od siebie), skrzyżowania – całe pole skrzyżowania
		const swZones = new Map();
		for (const x of env.sw || []) {
			const [s, d, a, side] = x, R = x[4] || 190, type = x[5] || 0;
			const z = { s, d, ca: Math.cos(a), sa: Math.sin(a), side, R, type };
			if (type <= 1) { z.u0 = -2; z.u1 = Math.sqrt(2 * R * 3.6) + 2; } else { const th = Math.max(0.05, x[6] || 0.1); z.tn = Math.tan(th) * side; z.u1 = Math.min(40, 2.6 / Math.tan(th) + 2); z.u0 = -z.u1; }
			for (let c = Math.floor((s - 60) / C); c <= Math.floor((s + 60) / C); c++) push(swZones, c, z);
		}
		this.env.swZones = swZones;
		// ukształtowanie terenu: przesunięcie siatki wysokości tak, by teren na osi toru leżał średnio pod podsypką
		if (env.dem && env.dem.lidar && env.dem.v && env.dem.v.length === env.dem.rows * env.dem.cols) {
			// NMT: niweleta i teren z tego samego pomiaru – jedno przesunięcie (wysokość szyny przy 0 w grze)
			const D = env.dem;
			let off = route.h0;
			if (typeof off !== 'number') {
				const cc = D.dc.indexOf(0), diffs = [];
				for (let ri = 0; ri < D.rows; ri++) diffs.push(D.base + D.v[ri * D.cols + cc] / 10 - (R.heightAt(route, D.s0 + ri * D.ds) - 0.3));
				diffs.sort((a, b) => a - b);
				off = diffs[diffs.length >> 1];
			}
			this.env.dem = Object.assign({}, D, { offs: new Float64Array(D.rows).fill(off), off });
			this.env.shoulders = new Map();
		} else if (env.dem && env.dem.v && env.dem.v.length === env.dem.rows * env.dem.cols) {
			// lokalnie (okno ±600 m, mediana, wygładzenie): niweleta toru z wygładzonego profilu ma błędy rzędu metrów –
			// teren obok toru ma zostać na jego poziomie; zostają lokalne formy (nasypy, wykopy, doliny do ok. 1 km)
			const D = env.dem, cc = Math.round(-D.d0 / D.dd), diffs = [];
			for (let ri = 0; ri < D.rows; ri++) diffs.push(D.base + D.v[ri * D.cols + cc] / 10 - (R.heightAt(route, D.s0 + ri * D.ds) - 0.95));
			const med = diffs.map((_, ri) => {
				const w = diffs.slice(Math.max(0, ri - 6), ri + 7).sort((a, b) => a - b);
				return w[w.length >> 1];
			});
			const offs = med.map((_, ri) => {
				let sum = 0, cnt = 0;
				for (let q = Math.max(0, ri - 3); q <= Math.min(med.length - 1, ri + 3); q++) { sum += med[q]; cnt++; }
				return sum / cnt;
			});
			this.env.dem = Object.assign({}, D, { offs });
			this.env.shoulders = new Map();
		}
		/* peron stacji (model z gry) nie zasłania torów z mapy: dalsza krawędź co najmniej 1,72 m od osi najbliższego toru
		   za peronem (szerokość z obrysu bywa za duża – obejmuje sąsiedni peron albo tor) */
		for (const st of route.stations) {
			const pl = st.platform;
			if (!pl) continue;
			let lim = Infinity;
			for (const row of env.t || []) {
				for (let k = 1; k + 1 < row.length; k += 2) {
					const s2 = row[k], x = row[k + 1] * pl.side;
					if (s2 > st.platformStart + 10 && s2 < st.platformEnd - 10 && x > pl.edge + 2.5) lim = Math.min(lim, x - 1.72);
				}
			}
			if (lim - pl.edge < pl.width) st.platform = Object.assign({}, pl, { width: Math.round(Math.max(2.5, lim - pl.edge) * 10) / 10, island: pl.island || lim < Infinity });
		}
		this.env.wagons = this.envPlanWagons(env.t || []);
		envMaterials();
	};

	// rodzaj zagospodarowania w punkcie (s, d)
	// wysokość koron (m) z pomiaru w (s, d); bez danych – −1
	World.prototype.canopyAt = function (s, d) {
		const e = this.env, cv = this.route.env && this.route.env.cv;
		if (!e || !e.cvGrid || !cv) return -1;
		const ri = Math.round((s - cv.s0) / cv.step), ci = Math.round((d - cv.d0) / cv.step);
		if (ri < 0 || ri >= cv.rows.length || ci < 0 || ci >= cv.cols) return -1;
		return e.cvGrid[ri * cv.cols + ci] * cv.q;
	};
	/* wysokości jezdni z pomiaru w punktach P (zagęszczona łamana wiersza, off – początek współrzędnych) w układzie gry
	   albo undefined; interpolacja po długości łamanej */
	World.prototype.deckProfile = function (row, off, P) {
		const hs = this.env && this.env.deckP && this.env.deckP.get(row), D = this.env && this.env.dem;
		if (!hs || !D || !D.lidar) return undefined;
		const pts = [];
		for (let i = off; i + 1 < row.length; i += 2) pts.push([row[i], row[i + 1]]);
		if (pts.length !== hs.length || pts.length < 2) return undefined;
		const cumO = [0];
		for (let k = 1; k < pts.length; k++) cumO.push(cumO[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
		const out = [];
		let c = 0, j = 0;
		for (let k = 0; k < P.length; k++) {
			if (k) c += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
			while (j < cumO.length - 2 && cumO[j + 1] < c) j++;
			const t = Math.max(0, Math.min(1, (c - cumO[j]) / (cumO[j + 1] - cumO[j] || 1)));
			out.push(D.base + (hs[j] + (hs[j + 1] - hs[j]) * t) / 10 - D.off);
		}
		return out;
	};
	// poziom pomostu z pomiaru (układ gry) albo undefined
	World.prototype.deckLevel = function (row) {
		const z = this.env && this.env.deckZ && this.env.deckZ.get(row), D = this.env && this.env.dem;
		return z !== undefined && D && D.lidar ? D.base + z / 10 - D.off : undefined;
	};

	World.prototype.areaAt = function (s, d) {
		const e = this.env;
		if (!e) return 0;
		const ri = Math.round((s - e.g.s0) / e.g.step), ci = Math.round((d - e.g.d0) / e.g.step);
		if (ri < 0 || ri >= e.rows || ci < 0 || ci >= e.g.cols) return 0;
		return e.grid[ri * e.g.cols + ci];
	};

	// czy punkt leży w obrysie budynku (drzewa, trawa)
	/* bez roślinności: torowisko naszej linii, do 3,2 m od torów z mapy, perony z mapy i peron stacji (pomiar koron NMPT
	   obejmuje też wagony na bocznicach i zadaszenia peronów) */
	World.prototype.envNoPlant = function (s, d) {
		const sh = this.envShoulder(s);
		if (d < sh.r + 1 && d > -sh.l - 1) return true;
		if (this.envOccupied(s, d, 0.8)) return true;
		for (const t of this.envTracksAt(s)) if (Math.abs(t.d - d) < 3.2) return true;
		return this.envOnPlatform(s, d, 0);
	};
	// na peronie z mapy (obrys albo linia o szerokości ok. 4 m), z zapasem buf (m)
	World.prototype.envOnPlatform = function (s, d, buf) {
		const e = this.env, c = Math.floor(s / C);
		for (const cc of [c - 1, c, c + 1]) {
			for (const { row, n } of e.pByChunk.get(cc) || []) {
				if (row[0] === 1) {
					let inside = false;
					for (let a = 0, b = n - 1; a < n; b = a++) {
						const sa = row[1 + a * 2], da = row[2 + a * 2], sb = row[1 + b * 2], db = row[2 + b * 2];
						if ((da > d) !== (db > d) && s < ((sb - sa) * (d - da)) / (db - da) + sa) inside = !inside;
					}
					if (inside) return true;
					if (buf > 0) {
						for (let a = 0, b = n - 1; a < n; b = a++) {
							const sa = row[1 + a * 2], da = row[2 + a * 2], sb = row[1 + b * 2], db = row[2 + b * 2];
							const ux = sb - sa, uy = db - da, L2 = ux * ux + uy * uy || 1e-9, t = Math.max(0, Math.min(1, ((s - sa) * ux + (d - da) * uy) / L2));
							if (Math.hypot(s - sa - ux * t, d - da - uy * t) < buf) return true;
						}
					}
				} else {
					for (let k = 0; k + 1 < n; k++) {
						const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2];
						const ux = sb - sa, uy = db - da, L2 = ux * ux + uy * uy || 1e-9, t = Math.max(0, Math.min(1, ((s - sa) * ux + (d - da) * uy) / L2));
						if (Math.hypot(s - sa - ux * t, d - da - uy * t) < 2.6 + buf) return true;
					}
				}
			}
		}
		return false;
	};
	World.prototype.inBuilding = function (s, d) {
		const e = this.env;
		if (!e) return false;
		const c = Math.floor(s / C);
		for (const cc of [c - 1, c, c + 1]) {
			for (const b of e.bByChunk.get(cc) || []) {
				if (s < b.s0 - 2 || s > b.s1 + 2 || d < b.d0 - 2 || d > b.d1 + 2) continue;
				let inside = false;
				const row = b.row;
				for (let i = 0, j = b.n - 1; i < b.n; j = i++) {
					const si = row[3 + i * 2], di = row[4 + i * 2], sj = row[3 + j * 2], dj = row[4 + j * 2];
					if ((di > d) !== (dj > d) && s < ((sj - si) * (d - di)) / (dj - di) + si) inside = !inside;
				}
				if (inside) return true;
			}
		}
		return false;
	};

	/* Maska kawałka (komórki 1 × 1 m, pas ±560 m): bit 1 – jezdnie z chodnikami, skrzyżowania, parkingi i place (całe
	   obrysy), wiadukty i mosty drogowe, tory z mapy; bit 2 – budynki (obrysy). Trawa, krzaki i drzewa nie rosną na
	   jezdniach ani na torach, a korony nie wchodzą w budynki (envFit). Liczona raz na kawałek, potem odczyt O(1). */
	const MASK_D = 560;
	World.prototype.envMask = function (c) {
		const e = this.env;
		if (e.masks.has(c)) return e.masks.get(c);
		for (const k of e.masks.keys()) if (Math.abs(k - c) > 12) e.masks.delete(k);
		const W = 2 * MASK_D, mask = new Uint8Array(C * W);
		const s0 = c * C;
		const paint = (sa, da, sb, db, half, bit = 1) => {
			const L = Math.hypot(sb - sa, db - da), n = Math.max(1, Math.ceil(L / 0.7));
			const r = Math.ceil(half);
			for (let q = 0; q <= n; q++) {
				const s = sa + ((sb - sa) * q) / n, d = da + ((db - da) * q) / n;
				const si0 = Math.floor(s - s0);
				if (si0 < -r || si0 >= C + r) continue;
				const di0 = Math.floor(d + MASK_D);
				for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
					if (a * a + b * b > half * half + 0.5) continue;
					const si = si0 + a, di = di0 + b;
					if (si >= 0 && si < C && di >= 0 && di < W) mask[si * W + di] |= bit;
				}
			}
		};
		// wnętrze wielokąta (s, d) – komórki ze środkiem w obrysie
		const fill = (pts, bit) => {
			const n = pts.length;
			if (n < 3) return;
			let lo = Infinity, hi = -Infinity;
			for (const p of pts) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }
			for (let si = Math.max(0, Math.floor(lo - s0)); si <= Math.min(C - 1, Math.floor(hi - s0)); si++) {
				const s = s0 + si + 0.5, xs = [];
				for (let i = 0, j = n - 1; i < n; j = i++) {
					const [sa, da] = pts[i], [sb, db] = pts[j];
					if (sa > s !== sb > s) xs.push(da + ((s - sa) * (db - da)) / (sb - sa));
				}
				xs.sort((a, b) => a - b);
				for (let q = 0; q + 1 < xs.length; q += 2)
					for (let di = Math.max(0, Math.ceil(xs[q] + MASK_D - 0.5)); di <= Math.min(W - 1, Math.floor(xs[q + 1] + MASK_D - 0.5)); di++) mask[si * W + di] |= bit;
			}
		};
		const ring = (row, off) => { const p = []; for (let k = off; k + 1 < row.length; k += 2) p.push([row[k], row[k + 1]]); return p; };
		for (const cc of [c - 1, c, c + 1]) {
			for (const { k, row, i } of e.rByChunk.get(cc) || []) { const q = e.rInfo[i]; paint(row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], q.w / 2 + (q.sw ? 2.6 : 0.4)); }
			for (const J of this.envStreets().jByChunk.get(cc) || []) paint(J.s, J.d, J.s, J.d, J.rad);
			for (const row of e.pkByChunk.get(cc) || []) { const n = (row.length - 1) / 2; fill(ring(row, 1), 1); for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; paint(row[1 + k * 2], row[2 + k * 2], row[1 + k2 * 2], row[2 + k2 * 2], 1.2); } }
			for (const b of e.bByChunk.get(cc) || []) if (b.s1 >= s0 - 1 && b.s0 <= s0 + C + 1) fill(ring(b.row, 3).slice(0, b.n), 2);
			for (const { k, row } of e.tByChunk.get(cc) || []) paint(row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], 2.2);
		}
		// wiadukty i mosty drogowe (długie – całe, odcinki poza kawałkiem pomijane przy malowaniu), wiadukty kolejowe
		const env = this.route.env;
		for (const [list, off, wide] of [[env.o, 1, true], [env.ob, 2, true], [env.ro, 1, false]]) for (const row of list || []) {
			const half = wide ? (ROAD_W[row[0]] || 6) / 2 + 1.5 : 3;
			for (let k = off; k + 3 < row.length; k += 2) {
				if (Math.max(row[k], row[k + 2]) < s0 - half || Math.min(row[k], row[k + 2]) > s0 + C + half) continue;
				paint(row[k], row[k + 1], row[k + 2], row[k + 3], half);
			}
		}
		e.masks.set(c, mask);
		return mask;
	};
	/* Ile miejsca ma korona o promieniu R w (s, d): największy ułamek R (1 … 0,4), przy którym w kole korony nie ma
	   budynku, a w kole 0,6 promienia (najmniej 1 m od pnia) – jezdni, chodnika, placu, toru ani wiaduktu (korona może
	   wystawać nad ulicę najwyżej o 40% promienia); brak miejsca – 0 */
	World.prototype.envFit = function (s, d, R) {
		if (!this.env || Math.abs(d) >= MASK_D - R - 1) return 1;
		const at = (x, y) => { const c = Math.floor(x / C); return this.envMask(c)[Math.floor(x - c * C) * 2 * MASK_D + Math.floor(y + MASK_D)]; };
		const free = (r, bit) => {
			if (at(s, d) & bit) return false;
			for (let q = 0; q < 12; q++) {
				const a = (q * Math.PI) / 6, ca = Math.cos(a), sa = Math.sin(a);
				if ((at(s + ca * r, d + sa * r) & bit) || (at(s + ca * r * 0.5, d + sa * r * 0.5) & bit)) return false;
			}
			return true;
		};
		for (const f of [1, 0.85, 0.7, 0.55, 0.4]) if (free(R * f, 2) && free(Math.max(1, R * f * 0.6), 1)) return f;
		return 0;
	};
	/* Wysokość jezdni z pomiaru dla kawałka (komórki 1 × 1 m, pas ±560 m, dm ponad dem.base; brak – −32768): pas
	   jezdni z poboczem 2,5 m – teren w nim przyjmuje wysokość drogi (nasypy dojazdów, wykopy, przejazdy pod torem). */
	/* przejazdy w poziomie w kawałku c (z zapasem 13 m): droga z mapy przecina tor z mapy (nie most, poza torowiskiem
	   naszej linii), jezdnia do 2 m od podtorza – { s, d, y (główka szyny w układzie gry) } */
	World.prototype.envLevelCrossings = function (c) {
		const e = this.env, D = e.dem, th = this.route.env.th;
		if (!e.lvlX) e.lvlX = new Map();
		if (e.lvlX.has(c)) return e.lvlX.get(c);
		const out = [];
		if (D && D.lidar && th) {
			const lo = c * C - 13, hi = (c + 1) * C + 13, segT = [];
			for (const cc of [c - 1, c, c + 1]) for (const { k, row, i } of e.tByChunk.get(cc) || []) if (th[i] && !(row[0] & 2)) segT.push([row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], i, k]);
			for (const cc of [c - 1, c, c + 1]) for (const { k, row } of e.rByChunk.get(cc) || []) {
				const z = e.roadZ.get(row);
				if (!z) continue;
				const x1 = row[1 + k * 2], y1 = row[2 + k * 2], x2 = row[3 + k * 2], y2 = row[4 + k * 2];
				for (const [x3, y3, x4, y4, i, tk] of segT) {
					const den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
					if (Math.abs(den) < 1e-9) continue;
					const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den;
					if (t < 0 || t > 1 || u < 0 || u > 1) continue;
					const s = x1 + (x2 - x1) * t, d = y1 + (y2 - y1) * t;
					if (s < lo || s > hi || Math.abs(d) < 8 || out.some((q) => Math.hypot(q.s - s, q.d - d) < 1)) continue;
					const y = this.envRowY(i, tk, s, d), zr = D.base + (z[k] + (z[k + 1] - z[k]) * t) / 10 - D.off;
					if (Math.abs(zr - (y - 0.9)) < 2) out.push({ s, d, y });
				}
			}
		}
		e.lvlX.set(c, out);
		return out;
	};
	World.prototype.envRoadMask = function (c) {
		const e = this.env;
		if (e.rmasks.has(c)) return e.rmasks.get(c);
		for (const k of e.rmasks.keys()) if (Math.abs(k - c) > 12) e.rmasks.delete(k);
		const W = 2 * MASK_D, mask = new Int16Array(C * W).fill(-32768), s0 = c * C;
		for (const cc of [c - 1, c, c + 1]) {
			for (const { k, row } of e.rByChunk.get(cc) || []) {
				const z = e.roadZ.get(row);
				if (!z) continue;
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2], za = z[k], zb = z[k + 1];
				const half = (ROAD_W[row[0]] || 5) / 2 + 2.5, r = Math.ceil(half);
				const L = Math.hypot(sb - sa, db - da), n = Math.max(1, Math.ceil(L / 0.7));
				for (let q = 0; q <= n; q++) {
					const s = sa + ((sb - sa) * q) / n, d = da + ((db - da) * q) / n, zz = Math.round(za + ((zb - za) * q) / n);
					const si0 = Math.floor(s - s0);
					if (si0 < -r || si0 >= C + r) continue;
					const di0 = Math.floor(d + MASK_D);
					for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
						if (a * a + b * b > half * half + 0.5) continue;
						const si = si0 + a, di = di0 + b;
						// na skrzyżowaniu dróg – wyższa (dojazd do wiaduktu nad niższą ulicą)
						if (si >= 0 && si < C && di >= 0 && di < W && zz > mask[si * W + di]) mask[si * W + di] = zz;
					}
				}
			}
		}
		// tory z mapy poza torowiskiem naszej linii (po drogach – mają pierwszeństwo): teren pod nimi na poziomie podtorza
		// (nasyp do 2,5 m, wykop do 6 m)
		const D = e.dem, th = this.route.env.th;
		if (D && D.lidar && th) {
			const byTrack = new Uint8Array(C * W); // komórka z toru: na nakładaniu się pasów – niższy tor
			for (const cc of [c - 1, c, c + 1]) for (const { k, row, i } of e.tByChunk.get(cc) || []) {
				if (!th[i] || row[0] & 2) continue;
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2];
				const L = Math.hypot(sb - sa, db - da), n = Math.max(1, Math.ceil(L / 0.7));
				for (let q = 0; q <= n; q++) {
					const s = sa + ((sb - sa) * q) / n, d = da + ((db - da) * q) / n;
					const si0 = Math.floor(s - s0);
					if (si0 < -3 || si0 >= C + 3 || Math.abs(d) < 8) continue;
					const yr = this.envRowY(i, k, s, d), y = yr - 0.95, dg = y - this.demGround(s, d);
					// tory torowiska naszej linii (na jej poziomie, w obrębie korony) – teren pod nimi to korona
					const shq = this.envShoulder(s);
					// tor ukośny (przejście pod naszym torem): wykop do 10 m
					const cross = Math.abs(db - da) > 0.2 * Math.abs(sb - sa);
					if (dg > 2.5 || dg < (cross ? -10 : -6) || (Math.abs(yr - R.heightAt(this.route, s)) < 0.5 && d < shq.r && d > -shq.l)) continue;
					const zz = Math.round((y + 0.12 + D.off - D.base) * 10), di0 = Math.floor(d + MASK_D);
					for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
						if (a * a + b * b > 9.5) continue;
						const si = si0 + a, di = di0 + b;
						if (si < 0 || si >= C || di < 0 || di >= W) continue;
						const ix = si * W + di;
						if (!byTrack[ix] || zz < mask[ix]) { mask[ix] = zz; byTrack[ix] = 1; }
					}
				}
			}
			/* przejazdy w poziomie (droga z mapy przez tor z mapy, różnica poziomów do 2 m): jezdnia na wysokości główki
			   szyny (podsypka i podkłady pod nawierzchnią przejazdu), rampy 10% wzdłuż drogi do 12 m od toru */
			for (const cr of this.envLevelCrossings(c)) {
				const zr = Math.round((cr.y - 0.12 + D.off - D.base) * 10), si0 = Math.floor(cr.s - s0), di0 = Math.floor(cr.d + MASK_D);
				for (let a = -13; a <= 13; a++) for (let b = -13; b <= 13; b++) {
					const si = si0 + a, di = di0 + b;
					if (si < 0 || si >= C || di < 0 || di >= W) continue;
					const ix = si * W + di, dist = Math.hypot(a, b);
					if (dist > 13 || mask[ix] === -32768) continue;
					const z = dist <= 3 ? zr : zr - Math.round((dist - 3) * 1.0);
					if (z > mask[ix]) mask[ix] = z;
				}
			}
		}
		e.rmasks.set(c, mask);
		return mask;
	};
	World.prototype.roadLevel = function (s, d) {
		const e = this.env, D = e && e.dem;
		if (!D || !D.lidar || Math.abs(d) >= MASK_D) return undefined;
		const c = Math.floor(s / C), z = this.envRoadMask(c)[Math.floor(s - c * C) * 2 * MASK_D + Math.floor(d + MASK_D)];
		return z === -32768 ? undefined : D.base + z / 10 - D.off;
	};
	World.prototype.onRoad = function (s, d) {
		if (!this.env || Math.abs(d) >= MASK_D) return false;
		const c = Math.floor(s / C), mask = this.envMask(c);
		return (mask[Math.floor(s - c * C) * 2 * MASK_D + Math.floor(d + MASK_D)] & 1) === 1;
	};

	/* Latarnie uliczne wzdłuż dróg z mapy (od ulic osiedlowych w górę): co ok. 35 m, na zmianę po obu stronach.
	   Słupy, wysięgniki, oprawy, klosze i plamy światła jako instancje; klosze trafiają do puli świateł nocą. */
	World.prototype.buildEnvLamps = function (group, segs, dyn) {
		if (!segs.length) return;
		const spots = [];
		const done = new Set();
		for (const { i, row } of segs) {
			if (done.has(i)) continue;
			done.add(i);
			const ti = row[0];
			if (ti > 6) continue; // bez dróg serwisowych i deptaków
			const q0 = this.env.rInfo[i], w = q0.w + (q0.sw ? 4.2 : 0), n = (row.length - 1) / 2; // za chodnikiem
			let acc = 17 + hash(i * 1.7) * 18, side = hash(i * 3.1) < 0.5 ? 1 : -1;
			for (let k = 0; k < n - 1; k++) {
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2];
				const L = Math.hypot(sb - sa, db - da);
				if (L < 0.1) continue;
				const ns = -(db - da) / L, nd = (sb - sa) / L;
				while (acc <= L) {
					const t = acc / L, s = sa + (sb - sa) * t, d = da + (db - da) * t;
					const off = w / 2 + 1.1;
					const ps = s + ns * side * off, pd = d + nd * side * off;
					if (Math.abs(pd) > 9 && !this.envStationZone(ps, pd) && !this.inBuilding(ps, pd) && Math.floor(s / C) === Math.floor(segs.c0 / C)) spots.push({ s: ps, d: pd, ds: -ns * side, dd: -nd * side });
					acc += 35;
					side = -side;
				}
				acc -= L;
			}
		}
		if (!spots.length) return;
		dyn.push({ type: 'lamps', lamps: this.envLampMeshes(group, spots) });
	};
	/* Latarnie (słup 8 m z wysięgnikiem nad jezdnię) jako instancje: spots – { s, d, ds, dd: kierunek wysięgnika w (s, d),
	   y: poziom podstawy (domyślnie teren), pool: promień plamy światła, poolAt: jej środek od słupa wzdłuż wysięgnika }.
	   Wynik – punkty świateł do puli nocą. */
	World.prototype.envLampMeshes = function (group, spots) {
		const r = this.route, M = World.materials();
		const mk = (geo, mat2) => { const m = new T.InstancedMesh(geo, mat2, spots.length); m.count = spots.length; return m; };
		const pole = mk(NS.util.GEO.cyl, M.lampHousing), arm = mk(NS.util.GEO.box, M.lampHousing), head = mk(NS.util.GEO.box, M.lampHousing);
		const lens = mk(NS.util.GEO.box, M.lampLens), pools = mk(M.poolGeo, M.lampPool);
		const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
		const lamps = [];
		spots.forEach((sp, k) => {
			R.sidePoint(r, sp.s, sp.d, tp);
			const y0 = sp.y !== undefined ? sp.y : this.terrainY(sp.s, sp.d), pr = sp.pool || 7;
			const bx = tp.x, bz = tp.z;
			// kierunek wysięgnika (nad jezdnię) w świecie – z punktu o metr dalej w (s, d) (obrót wg kursu toru dawał
			// wysięgnik wzdłuż drogi zamiast w poprzek)
			R.sidePoint(r, sp.s + sp.ds, sp.d + sp.dd, tp);
			const aL = Math.hypot(tp.x - bx, tp.z - bz) || 1, ax = (tp.x - bx) / aL, az = (tp.z - bz) / aL;
			const ang = Math.atan2(ax, az);
			q.setFromAxisAngle(up, ang);
			pole.setMatrixAt(k, m4.compose(p3.set(bx, y0 + 4, bz), q, sc.set(0.16, 8, 0.16)));
			arm.setMatrixAt(k, m4.compose(p3.set(bx + ax * 0.8, y0 + 7.9, bz + az * 0.8), q, sc.set(0.08, 0.08, 1.6)));
			head.setMatrixAt(k, m4.compose(p3.set(bx + ax * 1.6, y0 + 7.85, bz + az * 1.6), q, sc.set(0.32, 0.12, 0.7)));
			lens.setMatrixAt(k, m4.compose(p3.set(bx + ax * 1.6, y0 + 7.78, bz + az * 1.6), q, sc.set(0.26, 0.03, 0.6)));
			const pc = sp.poolAt || 1.6;
			pools.setMatrixAt(k, m4.compose(p3.set(bx + ax * pc, y0 + 0.12, bz + az * pc), Q_ID, sc.set(pr, 1, pr)));
			const o = new T.Object3D();
			o.position.set(bx + ax * 1.6, y0 + 7.8, bz + az * 1.6);
			o.userData.power = 0.8;
			o.userData.drop = 1.2;
			group.add(o);
			lamps.push(o);
		});
		pole.castShadow = this.shadows;
		pools.renderOrder = 5;
		pools.frustumCulled = false;
		group.add(pole, arm, head, lens, pools);
		return lamps;
	};
	const Q_ID = new T.Quaternion();

	// obrys filara wolny: bez toru z mapy (1,9 m od osi toru) i bez drogi poniżej (ponad 3 m pod spodem pomostu)
	World.prototype.pierFree = function (pr) {
		const dirs = pr.ang !== undefined ? [-Math.sin(pr.ang), Math.cos(pr.ang)] : [1, 0];
		const L = pr.ang !== undefined ? pr.cross : pr.len || 6;
		for (let t = -0.5; t <= 0.5; t += 0.125) {
			const s = pr.s + dirs[0] * L * t, d = pr.d + dirs[1] * L * t;
			if (this.envTrackGap(s, d) < 1.9) return false;
			if (this.onRoad(s, d)) { const rl = this.roadLevel(s, d); if ((rl !== undefined ? rl : this.terrainY(s, d)) < pr.top - 3) return false; }
		}
		return true;
	};

	/* Plan wiaduktu nad torem (wspólny dla rysowania i kontroli): łamana zagęszczona co ≤ 4 m (P), długość (cum),
	   wysokość jezdni (Y), teren (G), nasyp (embk), nasypy przy końcach (ems), filary (piers). */
	World.prototype.overpassPlan = function (row, rail) {
		const r = this.route;
		const ti = row[0], w = rail ? 5.6 : (ROAD_W[ti] || 6) + 1.2;
		const pts = [];
		for (let i = 1; i < row.length; i += 2) pts.push([row[i], row[i + 1]]);
		// zagęszczenie co ≤ 4 m (płynne zjazdy)
		const P = [];
		for (let k = 0; k < pts.length; k++) {
			if (k) {
				const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.floor(L / 4);
				for (let j = 1; j <= m; j++) P.push([a[0] + ((b[0] - a[0]) * j) / (m + 1), a[1] + ((b[1] - a[1]) * j) / (m + 1)]);
			}
			P.push(pts[k]);
		}
		// długość od punktu nad torem w obie strony; wysokość: pełna w pasie torów, potem zjazd do terenu
		let ci = 0;
		P.forEach((p, k) => { if (Math.abs(p[1]) < Math.abs(P[ci][1])) ci = k; });
		const cum = [0];
		for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
		// pomost: z pomiaru (NMPT) albo typowo 7,2 m (drogowy) / 7,6 m (kolejowy) nad główką szyny
		const zM = this.deckLevel(row), hTop = zM !== undefined ? zM : R.heightAt(r, P[ci][0]) + (rail ? 7.6 : 7.2);
		const yOf = (k) => {
			const [s, d] = P[k];
			const ground = this.terrainY(s, d) + 0.1;
			const side = k < ci ? cum[ci] : cum[P.length - 1] - cum[ci];
			const t = side > 0 ? Math.abs(cum[k] - cum[ci]) / side : 0;
			const full = Math.abs(d) < 14 ? 1 : t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45);
			return Math.max(ground, ground + (hTop - ground) * full);
		};
		// profil z pomiaru (NMPT w każdym punkcie): nad torami co najmniej 5,5 m nad główką szyny (sieć trakcyjna)
		const prof = this.deckProfile(row, 1, P);
		const Y = prof ? P.map(([s, d], k) => {
			let y = Math.max(prof[k], this.terrainY(s, d) + 0.1);
			// nad zelektryfikowanymi – spód pomostu (0,9 m pod wierzchem) min. 5,7 m: sieć obniżona pod wiaduktem mieści się
			if (Math.abs(d) < 6 || this.envTrackGap(s, d) < 3) y = Math.max(y, R.heightAt(r, s) + (r.electrified ? 6.6 : 5.5) + (rail ? 0.4 : 0));
			return y;
		}) : P.map((_, k) => yOf(k));
		// nasyp pod zjazdami: tam, gdzie pod pomostem nie ma toru (przęsło nad torami zostaje otwarte)
		const G = P.map(([s, d]) => this.terrainY(s, d) + 0.05);
		// droga lub ścieżka pod pomostem (poziom jezdni ponad 3 m niżej) – przęsło otwarte, bez nasypu
		const roadUnder = (s, d, y) => { const rl = this.onRoad(s, d) ? this.roadLevel(s, d) : undefined; return rl !== undefined ? y - rl > 3 : this.onRoad(s, d) && y - this.terrainY(s, d) > 3; };
		const embk = P.map(([s, d], k) => Y[k] - 0.9 - G[k] > 0.3 && Math.abs(d) > 7 && this.envTrackGap(s, d) > 5.5 && !roadUnder(s, d, Y[k]));
		// koniec obiektu wysoko nad terenem (pomiar: jezdnia dalej na estakadzie, w danych obiekt krótszy) – bez nasypu
		// po tej stronie, estakada na filarach
		for (const kE of [0, P.length - 1]) {
			if (Y[kE] - G[kE] <= 3) continue;
			const sg = Math.sign(P[kE][1]);
			P.forEach((p, k) => { if (Math.sign(p[1]) === sg) embk[k] = false; });
		}
		const dirN = (k) => {
			const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
			const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
			return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
		};
		// nasyp tylko przy końcu obiektu (ciągły odcinek od końca łamanej do osi); dalej estakada na filarach
		// (długi wiadukt nad stacją towarową ma między torami przerwy, ale tam nie ma nasypu)
		const ems = [];
		for (const side of [-1, 1]) {
			const ord = P.map((_, k) => k).filter((k) => Math.sign(P[k][1]) === side).sort((a, b) => Math.abs(P[a][1]) - Math.abs(P[b][1]));
			const em = [];
			for (let q = ord.length - 1; q >= 0 && embk[ord[q]]; q--) em.unshift(ord[q]);
			if (em.length) ems.push({ side, ord, em });
		}
		const piers = [];
		// filar k: wzdłuż torów (len) albo w poprzek jezdni (ang, cross) – cały obrys poza torami i drogami
		const pierAt = (k, cross) => {
			const n2 = dirN(k), a2 = P[Math.max(0, k - 1)], b2 = P[Math.min(P.length - 1, k + 1)];
			const pr = cross ? { k, s: P[k][0], d: P[k][1], top: Y[k] - 0.9, ang: Math.atan2(b2[1] - a2[1], b2[0] - a2[0]), cross: w + 1 } : { k, s: P[k][0], d: P[k][1], top: Y[k] - 0.9, len: Math.min(40, (w + 1) / Math.max(0.25, Math.abs(n2[0]))) };
			return this.pierFree(pr) ? pr : null;
		};
		// filary: po obu stronach torowiska – pierwszy punkt łamanej (od osi na zewnątrz), w którym nie ma toru z mapy
		for (const sg of [1, -1]) {
			let best = -1;
			const order = P.map((p, k) => k).filter((k) => P[k][1] * sg > 6).sort((a, b) => Math.abs(P[a][1]) - Math.abs(P[b][1]));
			for (const k of order) {
				if (Y[k] < this.terrainY(P[k][0], P[k][1]) + 3) break;
				if (this.envTrackGap(P[k][0], P[k][1]) > 3.2 && !this.onRoad(P[k][0], P[k][1])) {
					const pr = pierAt(k, false);
					if (pr) { best = k; piers.push(pr); break; }
				}
			}
			if (best >= 0) {
				/* estakada dalej od torowiska, do nasypu: filary w wolnych miejscach (między torami – równolegle do nich, z dala
				   od torów – w poprzek jezdni), przęsła do ok. 35 m; bez wolnego miejsca w tym zasięgu – najbliższe dalsze */
				let q0 = order.length;
				while (q0 > 0 && embk[order[q0 - 1]]) q0--; // od order[q0] – nasyp przy końcu obiektu
				const u = (k) => Math.abs(cum[k] - cum[best]);
				const uEnd = q0 < order.length ? u(order[q0]) : order.length ? u(order[order.length - 1]) : 0;
				const cand = [];
				for (const k of order.slice(0, q0)) {
					if (Math.abs(P[k][1]) <= Math.abs(P[best][1]) || Y[k] - 0.9 - this.terrainY(P[k][0], P[k][1]) < 3) continue;
					if (this.envTrackGap(P[k][0], P[k][1]) <= 3.2 || this.onRoad(P[k][0], P[k][1])) continue;
					const pr = this.envTrackGap(P[k][0], P[k][1]) > (w + 1) / 2 + 1.5 ? pierAt(k, true) || pierAt(k, false) : pierAt(k, false);
					if (pr) cand.push({ u: u(k), pr });
				}
				let last = 0;
				while (uEnd - last > 35) {
					const near = cand.filter((c) => c.u > last + 8 && c.u <= last + 35);
					const c = near.length ? near.reduce((a, b) => (b.u > a.u ? b : a)) : cand.filter((c2) => c2.u > last + 8).reduce((a, b) => (!a || b.u < a.u ? b : a), null);
					if (!c) break;
					piers.push(c.pr);
					last = c.u;
				}
			}
		}
		return { w, P, cum, Y, G, embk, ems, piers, dirN };
	};

	/* Kontrola obiektów nad torami (wiadukty drogowe i kolejowe z mapy) – te same obliczenia co rysowanie
	   (overpassPlan). Wyszukuje: nasyp lub jego skarpę na torze albo drodze, filar na torze albo drodze, pomost bez
	   podpór na ponad 50 m, koniec obiektu wysoko nad terenem bez dalszej drogi. Wynik – uwagi (k: 'audit') dołączane
	   do uwag generatora w swobodnej kamerze; liczone raz na trasę. */
	World.prototype.envAudit = function () {
		if (!this.env) return [];
		if (this.env.audit) return this.env.audit;
		const e = this.route.env, out = [];
		const add = (code, s, d, m, fix) => {
			if (out.some((x) => x.code === code && Math.abs(x.pos - s) < 30 && Math.abs(x.d - d) < 30)) return;
			out.push({ id: `audit-${code}@${Math.round(s)}`, code, k: 'audit', lvl: 'warn', pos: s, d, m, fix });
		};
		const roadY = (s, d) => { const rl = this.roadLevel(s, d); return rl !== undefined ? rl : this.terrainY(s, d); };
		const trackY = (s, d) => { const t = this.envTracksAt(s).find((q) => Math.abs(q.d - d) < 2); return t && t.y !== undefined ? t.y : this.terrainY(s, d); };
		// końce dróg i innych wiaduktów (dalszy ciąg jezdni przy końcu obiektu)
		const ends = [];
		for (const row of e.r || []) ends.push([row[1], row[2]], [row[row.length - 2], row[row.length - 1]]);
		for (const rows of [e.o || [], e.ro || []]) for (const row of rows) ends.push([row[1], row[2]], [row[row.length - 2], row[row.length - 1]]);
		const fmtD = (d) => `${Math.abs(Math.round(d))} m ${d < 0 ? 'w lewo' : 'w prawo'} od osi`;
		for (const [rows, rail] of [[e.o || [], false], [e.ro || [], true]]) {
			const name = rail ? 'Wiadukt kolejowy' : 'Wiadukt drogowy';
			rows.forEach((row) => {
				if (row.length < 5) return;
				const { w, P, cum, Y, G, ems, piers, dirN } = this.overpassPlan(row, rail);
				// nasyp i skarpy przy końcach: nie na torze ani na drodze poniżej
				for (const { em } of ems) for (const k of em) {
					const h = Math.max(0, Y[k] - 0.9 - G[k]), n = dirN(k);
					for (const eg of [-1, 1]) for (const f of [0, 0.5, 0.9]) {
						const o = w / 2 + 1.5 * h * f, s = P[k][0] + n[0] * o * eg, d = P[k][1] + n[1] * o * eg, top = Y[k] - 0.9 - h * f;
						if (this.envTrackGap(s, d) < 2 && trackY(s, d) < top - 1) add('embk-track', s, d, `${name}: nasyp zjazdu (${fmtD(d)}) leży na torze z mapy.`, 'Pod tym miejscem biegnie tor – zamiast nasypu powinno być przęsło na filarach. Sprawdź wysokość jezdni (NMPT) i przebieg toru.');
						else if (this.onRoad(s, d) && roadY(s, d) < top - 1) add('embk-road', s, d, `${name}: nasyp zjazdu (${fmtD(d)}) przykrywa drogę lub ścieżkę.`, 'Pod obiektem biegnie droga – zamiast nasypu powinno być przęsło na filarach. Sprawdź wysokość drogi i jezdni wiaduktu.');
					}
				}
				// filary: nie na torze ani na drodze
				for (const pr of piers) {
					const dirs = pr.ang !== undefined ? [-Math.sin(pr.ang), Math.cos(pr.ang)] : [1, 0];
					const L = pr.ang !== undefined ? pr.cross : pr.len || 6;
					for (let t = -0.5; t <= 0.5; t += 0.125) {
						const s = pr.s + dirs[0] * L * t, d = pr.d + dirs[1] * L * t;
						if (this.envTrackGap(s, d) < 1.9) { add('pier-track', s, d, `${name}: filar (${fmtD(d)}) stoi na torze z mapy.`, 'Filar trzeba przesunąć w wolne miejsce między torami.'); break; }
						if (this.onRoad(s, d) && roadY(s, d) < pr.top - 3) { add('pier-road', s, d, `${name}: filar (${fmtD(d)}) stoi na drodze.`, 'Filar trzeba przesunąć poza jezdnię.'); break; }
					}
				}
				// podpory wzdłuż pomostu: filary, początek nasypu, miejsca przy terenie; przęsło ponad 50 m – brak podpór
				const sup = piers.map((pr) => cum[pr.k]);
				for (const { em } of ems) sup.push(cum[em[0]]);
				P.forEach((_, k) => { if (Y[k] - 0.9 - G[k] < 1.5) sup.push(cum[k]); });
				sup.sort((a, b) => a - b);
				for (let q = 0; q + 1 < sup.length; q++) {
					if (sup[q + 1] - sup[q] <= 50) continue;
					// długie przęsło nad grupą torów (brak miejsca na filar) jest prawdziwe – błąd tylko, gdy było wolne miejsce
					let k = -1;
					for (let k2 = 0; k2 < P.length && k < 0; k2++) {
						if (cum[k2] < sup[q] + 10 || cum[k2] > sup[q + 1] - 10 || Y[k2] - 0.9 - G[k2] < 3) continue;
						const a2 = P[Math.max(0, k2 - 1)], b2 = P[Math.min(P.length - 1, k2 + 1)], n2 = dirN(k2), top = Y[k2] - 0.9;
						if (this.pierFree({ s: P[k2][0], d: P[k2][1], top, len: Math.min(40, (w + 1) / Math.max(0.25, Math.abs(n2[0]))) }) || this.pierFree({ s: P[k2][0], d: P[k2][1], top, ang: Math.atan2(b2[1] - a2[1], b2[0] - a2[0]), cross: w + 1 })) k = k2;
					}
					if (k < 0) continue;
					add('span', P[k][0], P[k][1], `${name}: pomost bez podpór na ${Math.round(sup[q + 1] - sup[q])} m (${fmtD(P[k][1])}).`, 'Pod pomostem brakuje filarów – sprawdź tory i drogi pod obiektem (filary nie mogą na nich stać).');
				}
				// końce: wysoko nad terenem tylko przy dalszej drodze lub innym wiadukcie
				for (const kE of [0, P.length - 1]) {
					if (Y[kE] - G[kE] <= 3) continue;
					const [s, d] = P[kE];
					if (Math.abs(d) > 500) continue; // granica danych otoczenia – dalszy ciąg poza danymi
					if (ends.some(([s2, d2]) => (s2 !== s || d2 !== d) && Math.hypot(s2 - s, d2 - d) < 6)) continue;
					// droga z mapy przechodzi tuż za końcem na poziomie jezdni (dalszy ciąg)
					const rl = this.roadLevel(s, d);
					if (rl !== undefined && Math.abs(rl - Y[kE]) < 1.5) continue;
					add('end', s, d, `${name}: koniec obiektu ${(Y[kE] - G[kE]).toFixed(1).replace('.', ',')} m nad terenem, bez dalszej drogi (${fmtD(d)}).`, 'Obiekt w danych kończy się w powietrzu – dalszy ciąg (estakada albo zjazd) jest poza danymi. Uzupełnij drogę w OSM albo sprawdź wysokość jezdni.');
				}
			});
		}
		// mosty drogowe obok toru (env.ob): długie przęsło mimo wolnego miejsca na filar, koniec w powietrzu
		for (const row of e.ob || []) {
			const pl = this.bridgePlan(row);
			if (!pl) continue;
			const { w, P, cum, ground, Y, piers } = pl;
			const sup = piers.map((pr) => cum[pr.k]);
			P.forEach((_, k) => { if (Y[k] - 0.9 - ground[k] < 1.5) sup.push(cum[k]); });
			sup.sort((x, y) => x - y);
			for (let q = 0; q + 1 < sup.length; q++) {
				if (sup[q + 1] - sup[q] <= 50) continue;
				const k = P.findIndex((pp, k2) => cum[k2] > sup[q] + 10 && cum[k2] < sup[q + 1] - 10 && Y[k2] - 0.9 - ground[k2] > 3 && this.pierFree({ s: pp[0], d: pp[1], top: Y[k2] - 0.9, ang: Math.atan2(P[Math.min(P.length - 1, k2 + 1)][1] - P[Math.max(0, k2 - 1)][1], P[Math.min(P.length - 1, k2 + 1)][0] - P[Math.max(0, k2 - 1)][0]), cross: 5 }));
				if (k >= 0) add('ob-span', P[k][0], P[k][1], `Most drogowy obok toru: pomost bez podpór na ${Math.round(sup[q + 1] - sup[q])} m (${fmtD(P[k][1])}).`, 'Pod pomostem jest wolne miejsce na filar – sprawdź rozmieszczenie filarów.');
			}
			for (const kE of [0, P.length - 1]) {
				const [s, d] = P[kE];
				if (Y[kE] - ground[kE] <= 3 || Math.abs(d) > 500) continue;
				if (ends.some(([s2, d2]) => (s2 !== s || d2 !== d) && Math.hypot(s2 - s, d2 - d) < 6)) continue;
				const rl = this.roadLevel(s, d);
				if (rl !== undefined && Math.abs(rl - Y[kE]) < 1.5) continue;
				add('ob-end', s, d, `Most drogowy obok toru: koniec ${(Y[kE] - ground[kE]).toFixed(1).replace('.', ',')} m nad terenem, bez dalszej drogi (${fmtD(d)}).`, 'Most w danych kończy się w powietrzu – sprawdź wysokość jezdni (NMPT) i dalszy ciąg drogi w OSM.');
			}
		}
		// mosty naszej linii: drogi i tory pod przęsłem – nie w nasypie, prześwit
		if (!this.env.roadLinks) this.env.roadLinks = this.envUnderLinks(e.r, 1);
		for (const lk of this.env.roadLinks) {
			const [, s1, d1, s2, d2] = lk, yEnd = Math.min(this.terrainY(s1, d1), this.terrainY(s2, d2));
			let worst = 0, ws = s1, wd = d1, clr = Infinity;
			for (let t = 0; t <= 1; t += 0.05) {
				const s = s1 + (s2 - s1) * t, d = d1 + (d2 - d1) * t;
				if (!this.underBridge(s, d)) continue;
				const g = this.terrainY(s, d);
				if (g - yEnd > worst) { worst = g - yEnd; ws = s; wd = d; }
				if (Math.abs(d) < 3) clr = Math.min(clr, R.heightAt(this.route, s) - 0.9 - g);
			}
			if (worst > 1) add('under-road-embk', ws, wd, `Droga pod mostem naszej linii wchodzi w nasyp (teren ${worst.toFixed(1).replace('.', ',')} m nad jezdnią przy moście, ${fmtD(wd)}).`, 'Pod przęsłem brakuje wykopu dla drogi – sprawdź most (przęsło) i przebieg drogi.');
			if (clr < 4) add('under-road-clear', (s1 + s2) / 2, 0, `Droga pod mostem naszej linii: prześwit tylko ${clr.toFixed(1).replace('.', ',')} m.`, 'Pod mostem drogowym potrzeba co najmniej ok. 4,5 m – sprawdź wysokość toru (profil) i głębokość wykopu.');
		}
		for (const b of this.route.bridges) {
			if (b.kind !== 'viaduct') continue;
			const sp = this.bridgeSpan(b);
			(e.t || []).forEach((row, i) => {
				if (row[0] & 2) return;
				const m = (row.length - 1) / 2;
				for (let k = 0; k + 1 < m; k++) {
					const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2];
					if (Math.sign(da) === Math.sign(db) || da === db) continue;
					const sc = sa + ((sb - sa) * da) / (da - db);
					if (sc < sp[0] - 2 || sc > sp[1] + 2) continue;
					const y = this.envRowY(i, k, sc, 0), clr = R.heightAt(this.route, sc) - y;
					if (clr < 5.6) add('under-rail-clear', sc, 0, `Tor z mapy pod mostem naszej linii: prześwit tylko ${clr.toFixed(1).replace('.', ',')} m.`, 'Pod mostem nad torem elektryfikowanym potrzeba co najmniej ok. 6 m – sprawdź głębokość wykopu pod mostem.');
					// tor obok mostu nie w nasypie
					for (const dd of [-12, -8, 8, 12]) {
						const t2 = (dd - da) / (db - da);
						const s2 = sa + (sb - sa) * t2;
						if (t2 < -2 || t2 > 3) continue;
						const y2 = this.envRowY(i, k, s2, dd), g2 = this.terrainY(s2, dd);
						if (g2 > y2 + 0.5) { add('under-rail-embk', s2, dd, `Tor z mapy pod mostem naszej linii wchodzi w nasyp (teren ${(g2 - y2).toFixed(1).replace('.', ',')} m nad główką szyny, ${fmtD(dd)}).`, 'Pod przęsłem brakuje wykopu dla toru – sprawdź most i wysokości toru.'); break; }
					}
				}
			});
		}
		// perony z mapy: tor z mapy nie może biec przez obrys peronu
		(e.t || []).forEach((row, i) => {
			if (row[0] & 2) return;
			const m = (row.length - 1) / 2;
			for (let k = 0; k + 1 < m; k++) {
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2], n = Math.max(1, Math.ceil(Math.hypot(sb - sa, db - da) / 4));
				for (let j = 0; j <= n; j++) {
					const s = sa + ((sb - sa) * j) / n, d = da + ((db - da) * j) / n;
					if (Math.abs(d) < 2.5) continue;
					if (this.envOnPlatform(s, d, 0)) { add('platform-track', s, d, `Tor z mapy biegnie przez peron (${fmtD(d)}).`, 'Peron zasłania tor – sprawdź obrys peronu i przebieg toru w OSM.'); break; }
				}
			}
		});
		// drogi z mapy na torach z mapy w poziomie: główka szyny na poziomie jezdni (bez progu)
		{
			const segT = [];
			(e.t || []).forEach((row, i) => { if (row[0] & 2) return; const m = (row.length - 1) / 2; for (let k = 0; k + 1 < m; k++) segT.push([row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], i, k]); });
			segT.sort((x, y) => Math.min(x[0], x[2]) - Math.min(y[0], y[2]));
			const mins = segT.map((q) => Math.min(q[0], q[2]));
			for (const row of e.r || []) {
				const m = (row.length - 1) / 2;
				for (let k = 0; k + 1 < m; k++) {
					const x1 = row[1 + k * 2], y1 = row[2 + k * 2], x2 = row[3 + k * 2], y2 = row[4 + k * 2], lo = Math.min(x1, x2), hi = Math.max(x1, x2);
					let q0 = 0, q1 = mins.length;
					while (q0 < q1) { const mid = (q0 + q1) >> 1; if (mins[mid] < lo - 60) q0 = mid + 1; else q1 = mid; }
					for (let q = q0; q < segT.length && mins[q] <= hi; q++) {
						const [x3, y3, x4, y4, ti, tk] = segT[q];
						if (Math.max(x3, x4) < lo) continue;
						const den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
						if (Math.abs(den) < 1e-9) continue;
						const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den;
						if (t < 0 || t > 1 || u < 0 || u > 1) continue;
						const sx = x1 + (x2 - x1) * t, dx = y1 + (y2 - y1) * t;
						if (Math.abs(dx) < 8 || this.underBridge(sx, dx) || this.envUnderBridge(sx, dx)) continue;
						const diff = this.envRowY(ti, tk, sx, dx) - this.terrainY(sx, dx);
						if (Math.abs(diff) > 0.6 && Math.abs(diff) < 3.5) add('road-track', sx, dx, `Droga przecina tor z mapy z progiem ${diff.toFixed(1).replace('.', ',')} m (${fmtD(dx)}).`, 'Na przejeździe szyny powinny być na poziomie jezdni – sprawdź wysokość toru i drogi (albo to przejście pod/nad torem bez mostu w danych).');
					}
				}
			}
		}
		out.sort((a, b) => a.pos - b.pos);
		this.env.audit = out;
		return out;
	};

	/* Wiadukt drogowy nad torem: pomost na wysokości ok. 7 m nad główką szyny w pasie torowiska, zjazdy do
	   poziomu ulic na końcach obiektu, boki i balustrady z betonu, filary po obu stronach torowiska. */
	World.prototype.buildEnvOverpasses = function (group, rows, rail) {
		if (!rows.length) return;
		const r = this.route, M = envMaterials();
		const dst = { p: [], c: [] };
		// wiadukt kolejowy (rail): podsypka zamiast asfaltu, szyny na wierzchu
		const asph = col.set(rail ? '#77736c' : '#3f4246').clone(), conc = col.set('#a7a39b').clone(), steelC = col.set('#6a6f74').clone();
		const piers = [];
		for (const row of rows) {
			const { w, P, Y, G, ems, piers: pr2, dirN } = this.overpassPlan(row, rail);
			piers.push(...pr2);
			if (!rail && this.envDeckSink) this.deckDress(this.envDeckSink, row, row[0], P, Y, w, true);
			const edge = (k, sideSign, off) => {
				const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
				const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ns = -(b[1] - a[1]) / L, nd = (b[0] - a[0]) / L;
				const o = off === undefined ? w / 2 : off;
				R.sidePoint(r, P[k][0] + ns * sideSign * o, P[k][1] + nd * sideSign * o, tp);
				return [tp.x, tp.z];
			};
			const earth = col.set('#6d7a45').clone(), wallC = col.set('#a7a39b').clone();
			const tri3 = (a, b, c2, rgb) => { dst.p.push(...a, ...b, ...c2); for (let i = 0; i < 3; i++) dst.c.push(rgb.r, rgb.g, rgb.b); };
			/* nasypy dojazdów i przyczółki – równoległe do torów: po każdej stronie torowiska przyczółek w linii stałego
			   odsunięcia d (gdzie zaczyna się nasyp); krawędzie pomostu przycięte do tej linii, skarpy 1:1,5 od niej na zewnątrz */
			const W3 = (sd, y) => { R.sidePoint(r, sd[0], sd[1], tp); return [tp.x, y, tp.z]; };
			for (const { side, ord, em } of ems) {
				const emSet = new Set(em);
				const dA = Math.abs(P[em[0]][1]);
				const cuts = [];
				for (const eg of [-1, 1]) {
					const pts2 = ord.map((k) => { const nn = dirN(k), o = (w / 2) * eg; return { k, sd: [P[k][0] + nn[0] * o, P[k][1] + nn[1] * o], y: Y[k] - 0.9, g: G[k], n: nn }; });
					const j = pts2.findIndex((q) => Math.abs(q.sd[1]) >= dA);
					if (j < 0) continue;
					let cut = pts2[j];
					if (j > 0) {
						const a = pts2[j - 1], b = pts2[j], t = (dA - Math.abs(a.sd[1])) / (Math.abs(b.sd[1]) - Math.abs(a.sd[1]) || 1);
						cut = { k: b.k, sd: [a.sd[0] + (b.sd[0] - a.sd[0]) * t, side * dA], y: a.y + (b.y - a.y) * t, g: a.g + (b.g - a.g) * t, n: b.n };
					}
					cuts.push(cut);
					// skarpa wzdłuż krawędzi od linii przyczółka na zewnątrz, dopóki nasyp
					const seq = [cut].concat(pts2.slice(j).filter((q) => emSet.has(q.k) && Math.abs(q.sd[1]) > dA + 0.01));
					for (let q = 0; q + 1 < seq.length; q++) {
						const A = seq[q], B = seq[q + 1], hA = Math.max(0, A.y - A.g), hB = Math.max(0, B.y - B.g);
						const bA = [A.sd[0] + A.n[0] * eg * 1.5 * hA, A.sd[1] + A.n[1] * eg * 1.5 * hA], bB = [B.sd[0] + B.n[0] * eg * 1.5 * hB, B.sd[1] + B.n[1] * eg * 1.5 * hB];
						tri3(W3(A.sd, A.y), W3(B.sd, B.y), W3(bB, B.g), earth);
						tri3(W3(A.sd, A.y), W3(bB, B.g), W3(bA, A.g), earth);
					}
				}
				if (cuts.length < 2) continue;
				// ściana przyczółka (stałe d, od terenu do spodu pomostu) i ziemne czoła skarp po obu końcach
				const [c1, c2] = cuts[0].sd[0] < cuts[1].sd[0] ? cuts : [cuts[1], cuts[0]];
				const g1 = Math.min(c1.g, c2.g);
				tri3(W3(c1.sd, g1), W3(c2.sd, g1), W3(c2.sd, c2.y), wallC);
				tri3(W3(c1.sd, g1), W3(c2.sd, c2.y), W3(c1.sd, c1.y), wallC);
				for (const [c, dir] of [[c1, -1], [c2, 1]]) {
					const h = Math.max(0, c.y - c.g), foot = [c.sd[0] + dir * 1.5 * h, c.sd[1]];
					tri3(W3(c.sd, c.y), W3(foot, c.g), W3(c.sd, c.g), earth);
				}
			}
			const quad = (a, b, c2, d2, rgb) => {
				dst.p.push(...a, ...b, ...c2, ...a, ...c2, ...d2);
				for (let i = 0; i < 6; i++) dst.c.push(rgb.r, rgb.g, rgb.b);
			};
			for (let k = 0; k < P.length - 1; k++) {
				const L0 = edge(k, -1), R0 = edge(k, 1), L1 = edge(k + 1, -1), R1 = edge(k + 1, 1);
				const y0 = Y[k], y1 = Y[k + 1];
				const top = (p, y) => [p[0], y, p[1]];
				// jezdnia; boki pomostu (0,9 m) z balustradami (1 m) – materiał dwustronny (kierunek łamanej bywa dowolny)
				quad(top(L0, y0), top(R0, y0), top(R1, y1), top(L1, y1), asph);
				for (const [A, B] of [[L0, L1], [R0, R1]]) quad([A[0], y0 - 0.9, A[1]], [B[0], y1 - 0.9, B[1]], [B[0], y1 + 1.0, B[1]], [A[0], y0 + 1.0, A[1]], conc);
				// spód pomostu
				quad(top(L0, y0 - 0.9), top(L1, y1 - 0.9), top(R1, y1 - 0.9), top(R0, y0 - 0.9), conc);
				if (rail) {
					// szyny na wiadukcie (dwa toki 1,5 m od siebie)
					for (const o of [-0.75, 0.75]) {
						const f = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
						const t0 = 0.5 + (o - 0.06) / w, t1 = 0.5 + (o + 0.06) / w;
						const a = f(L0, R0, t0), b = f(L0, R0, t1), c2 = f(L1, R1, t1), d2 = f(L1, R1, t0);
						quad([a[0], y0 + 0.17, a[1]], [b[0], y0 + 0.17, b[1]], [c2[0], y1 + 0.17, c2[1]], [d2[0], y1 + 0.17, d2[1]], steelC);
					}
				}
			}
		}
		if (dst.p.length) {
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(dst.p, 3));
			geo.setAttribute('color', new T.Float32BufferAttribute(dst.c, 3));
			geo.computeVertexNormals();
			const m = new T.Mesh(geo, M.roadDouble);
			m.castShadow = this.shadows;
			m.receiveShadow = true;
			group.add(m);
		}
		for (const pr of piers) {
			R.sidePoint(r, pr.s, pr.d, tp);
			const y0 = this.terrainY(pr.s, pr.d) - 0.2, h = pr.top - y0;
			if (h < 1) continue;
			const pm = new T.Mesh(NS.util.GEO.box, World.platformConcrete || (World.platformConcrete = NS.util.matS('#b8b2a6', { roughness: 0.9, surf: 'concrete' })));
			if (pr.ang !== undefined) {
				pm.scale.set(pr.cross, h, 1.2); // w poprzek jezdni
				pm.rotation.y = -(tp.heading + pr.ang);
			} else {
				pm.scale.set(1.2, h, pr.len || 6); // wzdłuż torów
				pm.rotation.y = -tp.heading;
			}
			pm.position.set(tp.x, y0 + h / 2, tp.z);
			pm.castShadow = this.shadows;
			group.add(pm);
		}
	};

	/* Wyposażenie pomostów drogowych (wiadukty nad torem, mosty obok toru): oznakowanie poziome, chodniki z krawężnikiem,
	   latarnie przy balustradzie, znaki B-18 przy wjazdach na wiadukt. Zbierane dla całego kawałka (env deck sink)
	   i rysowane razem w deckDressFlush: oznakowanie – jedna siatka (roadMark), chodniki – jedna siatka, latarnie
	   i znaki – instancje. */
	// atrybuty drogi na obiekcie (pasy, chodniki, jednokierunkowa): z ulicy z mapy tej samej klasy, która styka się
	// z końcem obiektu (obiekt w danych to osobny odcinek bez atrybutów); bez takiej – wg szerokości
	World.prototype.deckRoadInfo = function (row, ti, P) {
		const e = this.env;
		if (!e.deckInf) e.deckInf = new Map();
		if (e.deckInf.has(row)) return e.deckInf.get(row);
		const ends = [P[0], P[P.length - 1]], seen = new Set();
		let best = null, bd = 6;
		for (const p of ends) for (let cc = Math.floor(p[0] / C) - 1; cc <= Math.floor(p[0] / C) + 1; cc++) for (const { i, row: rr } of e.rByChunk.get(cc) || []) {
			if (seen.has(i) || rr[0] !== ti) continue;
			seen.add(i);
			for (const q of ends) for (const [s, d] of [[rr[1], rr[2]], [rr[rr.length - 2], rr[rr.length - 1]]]) {
				const dist = Math.hypot(s - q[0], d - q[1]);
				if (dist < bd) { bd = dist; best = e.rInfo[i]; }
			}
		}
		const w0 = ROAD_W[ti] || 6;
		let inf = best || { w: w0, lanes: w0 >= 12 ? 4 : w0 >= 5.2 ? 2 : 1, surf: 0, sw: 0, one: 0 };
		/* jezdnie rozdzielone (autostrada, dwujezdniowa): obok drugi wiadukt tej samej klasy – każdy pomost to jedna
		   jezdnia jednokierunkowa z połową pasów (atrybuty dochodzącej drogi bywają wspólne dla obu jezdni) */
		const oc = (pp) => pp.reduce((a, p) => (Math.abs(p[1]) < Math.abs(a[1]) ? p : a));
		const me = oc(P), twin = (e.oByChunk.get(Math.floor(me[0] / C)) || []).concat(e.oByChunk.get(Math.floor(me[0] / C) - 1) || [], e.oByChunk.get(Math.floor(me[0] / C) + 1) || []).some((o) => {
			if (o === row || o[0] !== ti) return false;
			const pts = [];
			for (let i = 1; i + 1 < o.length; i += 2) pts.push([o[i], o[i + 1]]);
			const x = oc(pts);
			return Math.hypot(x[0] - me[0], x[1] - me[1]) < 40;
		});
		if (twin && !inf.one && inf.lanes >= 2) inf = Object.assign({}, inf, { one: 1, lanes: Math.max(1, Math.round(inf.lanes / 2)) });
		e.deckInf.set(row, inf);
		return inf;
	};

	World.prototype.deckDress = function (sink, row, ti, P, Y, w, entry) {
		if (ti > 6 || P.length < 2) return; // drogi serwisowe, polne, ścieżki – bez wyposażenia
		const r = this.route, inf = this.deckRoadInfo(row, ti, P);
		const cum = [0];
		for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
		const total = cum[cum.length - 1];
		if (total < 8) return;
		// normalna w wierzchołku – jak krawędzie pomostu (edge w buildEnvOverpasses), linie biegną równo z balustradą
		const nrm = (k) => {
			const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
			return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
		};
		const N = P.map((_, k) => nrm(k));
		const seg = (t) => { let k = 0; while (k < P.length - 2 && cum[k + 1] < t) k++; return k; };
		// punkt na odległości t wzdłuż osi, odsunięty o o (w stronę normalnej), dy nad jezdnią – w świecie i w (s, d)
		const sdAt = (t, o) => {
			const k = seg(t), f = Math.max(0, Math.min(1, (t - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k])));
			const a = [P[k][0] + N[k][0] * o, P[k][1] + N[k][1] * o], b = [P[k + 1][0] + N[k + 1][0] * o, P[k + 1][1] + N[k + 1][1] * o];
			return { s: a[0] + (b[0] - a[0]) * f, d: a[1] + (b[1] - a[1]) * f, y: Y[k] + (Y[k + 1] - Y[k]) * f, k };
		};
		const at = (t, o, dy) => { const q = sdAt(t, o); R.sidePoint(r, q.s, q.d, tp); return [tp.x, q.y + dy, tp.z]; };
		// trójkąt przodem do góry (roadMark jest jednostronny; kierunek łamanej bywa dowolny)
		const tri = (dst, a, b, c, rgb) => {
			if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0) dst.p.push(...a, ...b, ...c);
			else dst.p.push(...a, ...c, ...b);
			for (let i = 0; i < 3; i++) dst.c.push(rgb.r, rgb.g, rgb.b);
		};
		// pas od o0 do o1 na odcinku osi [t0, t1], z podziałem na wierzchołkach łamanej (zjazdy – wysokość wg Y)
		const band = (dst, t0, t1, o0, o1, dy, rgb) => {
			const ts = [t0];
			for (let k = 1; k < P.length - 1; k++) if (cum[k] > t0 && cum[k] < t1) ts.push(cum[k]);
			ts.push(t1);
			for (let q = 0; q + 1 < ts.length; q++) {
				const a = at(ts[q], o0, dy), b = at(ts[q], o1, dy), c = at(ts[q + 1], o1, dy), d = at(ts[q + 1], o0, dy);
				tri(dst, a, b, c, rgb);
				tri(dst, a, c, d, rgb);
			}
		};
		// pionowa ściana (krawężnik) na odsunięciu o, od dy0 do dy1
		const face = (dst, t0, t1, o, dy0, dy1, rgb) => {
			const ts = [t0];
			for (let k = 1; k < P.length - 1; k++) if (cum[k] > t0 && cum[k] < t1) ts.push(cum[k]);
			ts.push(t1);
			for (let q = 0; q + 1 < ts.length; q++) {
				const a = at(ts[q], o, dy0), b = at(ts[q + 1], o, dy0), c = at(ts[q + 1], o, dy1), d = at(ts[q], o, dy1);
				dst.p.push(...a, ...b, ...c, ...a, ...c, ...d);
				for (let i = 0; i < 6; i++) dst.c.push(rgb.r, rgb.g, rgb.b);
			}
		};
		/* chodniki: z atrybutów ulicy (1 lewy, 2 prawy, 3 oba), jeśli obok jezdni o potrzebnej liczbie pasów zostaje
		   miejsce na 1,5–2 m – inaczej jeden albo żaden (pomost ma szerokość wg klasy drogi) */
		// minimum: jednokierunkowa – wszystkie pasy po 3 m, dwukierunkowa – dwa pasy po 2,75 m (więcej, jeśli się zmieszczą)
		const lanes0 = Math.max(1, inf.lanes), minCw = inf.one ? lanes0 * 3 : 5.5;
		const swW = Math.min(2, Math.max(1.5, (w - minCw) / 2));
		let sw = [];
		if (inf.sw && !inf.surf) {
			const want = inf.sw === 3 ? [1, -1] : [inf.sw === 2 ? 1 : -1];
			if (want.length === 2 && w - 2 * swW < minCw) want.length = 1;
			if (w - swW * want.length >= minCw) sw = want;
		}
		const swOn = (sg) => sw.includes(sg);
		const T0 = 1.5, T1 = total - 1.5; // od końców obiektu – tam oznakowanie i chodniki ulicy
		// kolory jak na ulicach (shader dróg rozpoznaje po nich kostkę chodnika, krawężnik i linie)
		const SWC = col.set('#a7a49d').clone(), CURB = col.set('#c9c6be').clone(), WHITE = col.set('#e9e7e0').clone();
		for (const sg of sw) {
			const oIn = sg * (w / 2 - swW), oOut = sg * (w / 2);
			band(sink.deck, 0, total, sg * (w / 2 - swW + 0.16), oOut, 0.15, SWC);
			band(sink.deck, 0, total, oIn, sg * (w / 2 - swW + 0.16), 0.17, CURB);
			face(sink.deck, 0, total, oIn, 0, 0.17, CURB);
		}
		// jezdnia między krawężnikami (albo 0,3 m od balustrad): oś, pasy, linie krawędziowe
		const ea = -w / 2 + (swOn(-1) ? swW : 0.3), eb = w / 2 - (swOn(1) ? swW : 0.3), cw = eb - ea, cMid = (ea + eb) / 2;
		const lanes = Math.max(1, Math.min(lanes0, Math.floor(cw / 2.6)));
		if (!inf.surf && cw >= 4.5) {
			const MK = 0.02;
			const line = (o, ta, tb) => band(sink.mk, ta, tb, o - 0.06, o + 0.06, MK, WHITE);
			const solid = (o) => line(o, T0, T1);
			// przerywana 3 m / 3 m
			const dash = (o) => { for (let x = T0; x < T1; x += 6) line(o, x, Math.min(T1, x + 3)); };
			if (!inf.one) {
				// na obiekcie linia ciągła (zakaz wyprzedzania), na szerokich – podwójna ciągła i przerywane między pasami
				if (lanes >= 4) { solid(cMid - 0.12); solid(cMid + 0.12); dash(cMid - cw / 4); dash(cMid + cw / 4); }
				else if (lanes >= 2) solid(cMid);
			} else for (let l = 1; l < lanes; l++) dash(ea + (cw * l) / lanes);
			// krawędziowe przy balustradach (bez chodnika)
			if (!swOn(-1)) line(ea + 0.25, T0, T1);
			if (!swOn(1)) line(eb - 0.25, T0, T1);
		}
		/* latarnie co ok. 33 m przy balustradzie (na chodniku, jeśli jest): na szerokich obiektach po obu stronach,
		   na węższych na zmianę; wysięgnik nad jezdnię, plama światła na osi pomostu i w jego szerokości (poza nim
		   wisiałaby w powietrzu nad torami) */
		const both = w >= 12 || lanes >= 4;
		let side = hash(cum.length * 1.37 + P[0][0] * 0.011) < 0.5 ? 1 : -1;
		for (let t = 8 + hash(P[0][0] * 0.013 + P[0][1]) * 10; t < total - 6; t += 33) {
			for (const sg of both ? [1, -1] : [side]) {
				const q = sdAt(t, sg * (w / 2 - 0.35)), n = N[q.k];
				sink.lamps.push({ s: q.s, d: q.d, y: q.y + (swOn(sg) ? 0.15 : 0), ds: -n[0] * sg, dd: -n[1] * sg, pool: both ? w / 4 + 0.3 : Math.min(7, w / 2), poolAt: both ? w / 4 : w / 2 - 0.35 });
			}
			side = -side;
		}
		// znaki B-18 (dopuszczalna masa) przy wjazdach na wiadukt nad torem – po prawej stronie jadącego (dwukierunkowe)
		if (entry && !inf.one && ti >= 2 && total > 30) {
			const ton = [15, 20, 30][Math.floor(hash(P[0][0] * 0.07 + P[0][1] * 0.3) * 3)];
			for (const [tS, dir] of [[2.5, 1], [total - 2.5, -1]]) {
				const a = at(tS, 0, 0), b = at(tS + dir * 2, 0, 0), fx = b[0] - a[0], fz = b[2] - a[2];
				const p1 = at(tS, 1, 0), rgt = (p1[0] - a[0]) * -fz + (p1[2] - a[2]) * fx > 0 ? 1 : -1; // prawa: (−fz, fx)
				const o = rgt * (w / 2 - 0.45), q = sdAt(tS, o);
				R.sidePoint(r, q.s, q.d, tp);
				sink.signs.push({ x: tp.x, y: q.y + (swOn(rgt) ? 0.15 : 0), z: tp.z, ang: Math.atan2(-fx, -fz), ton });
			}
		}
	};

	// tarcza znaku B-18 (biała, czerwony pierścień, masa w tonach) i tył tarczy (szary)
	const signB18 = (ton) => canvasTexture(`b18|${ton}`, 128, 128, (g, w) => {
		g.beginPath();
		g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
		g.fillStyle = '#c62828';
		g.fill();
		g.beginPath();
		g.arc(w / 2, w / 2, w / 2 - 16, 0, Math.PI * 2);
		g.fillStyle = '#f4f4f2';
		g.fill();
		g.fillStyle = '#111';
		g.font = '800 44px system-ui, sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText(`${ton}t`, w / 2, w / 2 + 3);
	});
	const signBack = () => canvasTexture('sign-back-round', 64, 64, (g, w) => {
		g.beginPath();
		g.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2);
		g.fillStyle = '#7d8287';
		g.fill();
	});

	World.prototype.deckDressFlush = function (group, sink) {
		const M = envMaterials();
		for (const [buf, material] of [[sink.deck, M.roadDouble], [sink.mk, M.roadMark]]) {
			if (!buf.p.length) continue;
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(buf.p, 3));
			geo.setAttribute('color', new T.Float32BufferAttribute(buf.c, 3));
			geo.computeVertexNormals();
			const m = new T.Mesh(geo, material);
			m.receiveShadow = true;
			group.add(m);
		}
		if (sink.lamps.length) {
			const lamps = this.envLampMeshes(group, sink.lamps);
			if (this.envLampSink) this.envLampSink.push(...lamps);
		}
		if (sink.signs.length) {
			if (!World.signPlane) { World.signPlane = new T.PlaneGeometry(0.75, 0.75); World.signPlane.userData.shared = true; }
			const byTon = new Map();
			for (const sg of sink.signs) { if (!byTon.has(sg.ton)) byTon.set(sg.ton, []); byTon.get(sg.ton).push(sg); }
			const m4 = new T.Matrix4(), q = new T.Quaternion(), q2 = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p3 = new T.Vector3(), sc = new T.Vector3(), one = new T.Vector3(1, 1, 1);
			const shared = (mm) => { mm.userData.shared = true; return mm; };
			const back = World.signBackM || (World.signBackM = shared(patch(new T.MeshStandardMaterial({ map: signBack(), alphaTest: 0.5, roughness: 0.6, metalness: 0.3 }), 'lit')));
			const pole = new T.InstancedMesh(GEO.cyl, M.catSteel, sink.signs.length), backs = new T.InstancedMesh(World.signPlane, back, sink.signs.length);
			let n = 0;
			for (const [ton, list] of byTon) {
				const key = `signB18M${ton}`;
				const face = World[key] || (World[key] = shared(patch(new T.MeshStandardMaterial({ map: signB18(ton), alphaTest: 0.5, roughness: 0.5 }), 'lit')));
				const fr = new T.InstancedMesh(World.signPlane, face, list.length);
				list.forEach((sg, k) => {
					q.setFromAxisAngle(up, sg.ang);
					// tarcza na 2,2 m, przodem do nadjeżdżających; tył 1 cm za nią, obrócony
					const fx = Math.sin(sg.ang), fz = Math.cos(sg.ang);
					fr.setMatrixAt(k, m4.compose(p3.set(sg.x + fx * 0.06, sg.y + 2.2, sg.z + fz * 0.06), q, one));
					q2.setFromAxisAngle(up, sg.ang + Math.PI);
					backs.setMatrixAt(n, m4.compose(p3.set(sg.x + fx * 0.05, sg.y + 2.2, sg.z + fz * 0.05), q2, one));
					pole.setMatrixAt(n, m4.compose(p3.set(sg.x, sg.y + 1.3, sg.z), Q_ID, sc.set(0.07, 2.6, 0.07)));
					n++;
				});
				group.add(fr);
			}
			pole.castShadow = this.shadows;
			group.add(pole, backs);
		}
	};

	/* Wagony towarowe na bocznicach i torach stacji towarowych: na części torów (losowo, ale stale dla danego
	   toru) skład wagonów jednego prawdziwego typu (NS.FREIGHT_TYPES z train.js – Eaos, Falns, Zacns, Sgns z kontenerami,
	   Habbiins; długości i kolory jak w rzeczywistości). Wyliczane raz dla trasy; w kawałku świata rysowane jako instancje
	   części (kilka wywołań rysowania). */
	// punkt (s, d) w strefie rozjazdu (na rozjeździe albo przed ukresem)
	World.prototype.envOnSwitch = function (s, d) {
		for (const z of this.env.swZones.get(Math.floor(s / C)) || []) {
			const ds = s - z.s, dd = d - z.d;
			const u = ds * z.ca + dd * z.sa, v = -ds * z.sa + dd * z.ca;
			if (u < z.u0 || u > z.u1) continue;
			if (z.type <= 1) {
				const y = z.type === 0 ? (u * u) / (2 * z.R) : (u * u) / (4 * z.R);
				const lo = z.type === 0 ? Math.min(0, y * z.side) - 2.6 : -y - 2.6, hi = z.type === 0 ? Math.max(0, y * z.side) + 2.6 : y + 2.6;
				if (v > lo && v < hi) return true;
			} else if (Math.min(Math.abs(v), Math.abs(v - u * z.tn)) < 2.6) return true;
		}
		return false;
	};

	World.prototype.envPlanWagons = function (tracks) {
		const byChunk = new Map();
		tracks.forEach((row, i) => {
			if ((row[0] & 1) !== 1 || row[0] & 6) return; // tylko czynne bocznice / tory boczne (nie na moście)
			if (hash(i * 2.17 + 0.3) > 0.6) return; // część torów pusta
			const pts = [];
			for (let k = 1; k < row.length; k += 2) pts.push([row[k], row[k + 1]]);
			const cum = [0];
			for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
			const total = cum[cum.length - 1];
			if (total < 30) return;
			const at = (a) => {
				let k = 0;
				while (k < cum.length - 2 && cum[k + 1] < a) k++;
				const t = (a - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
				return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t, k];
			};
			const FT = NS.FREIGHT_TYPES;
			// częściej węglarki (Śląsk), rzadziej kryte
			const r0 = hash(i * 3.71), type = r0 < 0.28 ? 1 : r0 < 0.5 ? 0 : r0 < 0.68 ? 2 : r0 < 0.88 ? 3 : 4;
			const len = FT[type].len, step = len + 1.2;
			const start = 8 + hash(i * 1.13) * Math.max(0, total * 0.35);
			const fill = 0.35 + hash(i * 5.3) * 0.6;
			const end = Math.min(total - 6, start + total * fill);
			const palette = FT[type].colors;
			const base = palette[Math.floor(hash(i * 7.7) * palette.length)];
			let n = 0;
			for (let a = start; a + len <= end; a += step, n++) {
				const p0 = at(a), p1 = at(a + len), c = at(a + len / 2);
				// nie przy krawędzi peronowej (peron stacji, perony z mapy – do 3 m)
				if ([p0, p1, c].some((q) => this.envOccupied(q[0], q[1], 2.5) || this.envOnPlatform(q[0], q[1], 3))) continue;
				// nie pod mostem ani w wykopie pod nim (tor schodzi pod nasz most)
				if ([p0, p1, c].some((q) => this.dip(q[0], q[1], true) > 0.5 || this.underBridge(q[0], q[1]))) continue;
				// nie na rozjeździe ani przed ukresem (co 2 m wzdłuż wagonu)
				let onSw = false;
				for (let q = 0; q <= len && !onSw; q += 2) { const pq = at(a + q); onSw = this.envOnSwitch(pq[0], pq[1]); }
				if (onSw) continue;
				const seed = i * 13.7 + n * 1.91;
				const color = hash(seed) < 0.75 ? base : palette[Math.floor(hash(seed + 0.4) * palette.length)];
				const w = { s: c[0], d: c[1], ang: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), type, len, color, seed, i, k: c[2] };
				const ck = Math.floor(c[0] / C);
				if (!byChunk.has(ck)) byChunk.set(ck, []);
				byChunk.get(ck).push(w);
			}
		});
		return byChunk;
	};

	World.prototype.buildEnvWagons = function (group, list) {
		if (!list || !list.length) return;
		const r = this.route;
		const parts = new Map(); // nazwa → { geo, mat, list: [macierz, kolor] }
		const add = (name, geo, material, m4, color) => {
			if (!parts.has(name)) parts.set(name, { geo, material, items: [] });
			parts.get(name).items.push([m4.clone(), color]);
		};
		const dark = mat('#26282b', { roughness: 0.85 }), body = mat('#ffffff', { roughness: 0.8 }), coalM = mat('#1b1b1c', { roughness: 0.95 });
		const W = new T.Matrix4(), L = new T.Matrix4(), S = new T.Matrix4(), RX = new T.Matrix4().makeRotationX(Math.PI / 2), out = new T.Matrix4();
		const M = { dark, coal: coalM, steel: mat('#55595e', { roughness: 0.5, metalness: 0.5 }), wheel: mat('#3b3a38', { roughness: 0.6, metalness: 0.5 }), roof: mat('#8a8f93', { roughness: 0.6 }) };
		const RZ = new T.Matrix4().makeRotationZ(Math.PI / 2), RA = new T.Matrix4(), cols = new Map();
		const colOf = (hex) => { if (!cols.has(hex)) cols.set(hex, new T.Color(hex)); return cols.get(hex); };
		for (const w of list) {
			R.sidePoint(r, w.s, w.d, tp);
			W.makeRotationY(-(tp.heading + w.ang));
			// wysokość toru z mapy w tym miejscu (jak przy rysowaniu toru: pomiar, wykop, poziom linii)
			W.setPosition(tp.x, w.i !== undefined ? this.envRowY(w.i, w.k, w.s, w.d) : this.envTrackY(w.s, w.d, false, false), tp.z);
			for (const [geo, mk, x, y, z, sx, sy, sz, col, rot] of NS.freightParts(w.type, w.len, w.seed, w.color, true)) {
				out.copy(W).multiply(L.makeTranslation(x, y, z));
				if (rot === 'x') out.multiply(RX);
				else if (rot === 'z') out.multiply(RZ);
				else if (typeof rot === 'number') out.multiply(RA.makeRotationX(rot));
				out.multiply(S.makeScale(sx, sy, sz));
				add(geo + '|' + mk, GEO[geo], mk === 'body' ? body : M[mk], out, mk === 'body' ? colOf(col) : null);
			}
		}
		for (const { geo, material, items } of parts.values()) {
			const im = new T.InstancedMesh(geo, material, items.length);
			items.forEach(([m4, c], k) => {
				im.setMatrixAt(k, m4);
				if (c) im.setColorAt(k, c);
			});
			if (im.instanceColor) im.instanceColor.needsUpdate = true;
			im.castShadow = this.shadows;
			im.receiveShadow = true;
			group.add(im);
		}
	};

	// kozły oporowe na końcach ślepych torów: belka z odbojnicami, podkłady w stos
	World.prototype.buildEnvBuffers = function (group, list) {
		if (!list || !list.length) return;
		const r = this.route;
		const red = mat('#c62f2f'), white = mat('#f2f2f2'), wood = mat('#4a3a2a');
		for (const [s, d, ang] of list) {
			if (this.envOccupied(s, d, 0.5)) continue;
			const g = new T.Group();
			const ps = s - Math.cos(ang) * 1.2, pd = d - Math.sin(ang) * 1.2;
			R.sidePoint(r, ps, pd, tp);
			tp.y = this.envTrackY(ps, pd, false, false);
			g.position.set(tp.x, tp.y, tp.z);
			g.rotation.y = -(tp.heading + ang);
			// kozioł zwrócony czołem w stronę toru (−z w układzie grupy to kierunek „na zewnątrz” – czoło od strony +z)
			g.add(box(3.2, 0.45, 0.45, red, 0, 1.12, 0.6));
			for (const x of [-0.8, 0.8]) g.add(box(0.5, 0.2, 0.47, white, x, 1.12, 0.6));
			for (const x of [-0.8, 0.8]) g.add(box(0.3, 1.0, 2.2, wood, x, 0.45, -0.6));
			g.traverse((o) => { if (o.isMesh) { o.castShadow = this.shadows; o.receiveShadow = true; } });
			group.add(g);
		}
	};

	/* Maszty oświetleniowe stacji towarowych: w kawałkach z wieloma bocznicami, między torami, wysokie słupy
	   z kilkoma naświetlaczami; nocą świecą i biorą udział w puli świateł. */
	World.prototype.buildEnvYardLights = function (group, c, dyn) {
		const e = this.env, r = this.route, M = World.materials();
		const ds = [];
		for (const { k, row } of e.tByChunk.get(c) || []) if (row[0] & 1) ds.push((row[2 + k * 2] + row[4 + k * 2]) / 2);
		if (ds.length < 10) return;
		ds.sort((a, b) => a - b);
		const lamps = [];
		for (const [frac, sOff] of [[0.3, 60], [0.7, 150]]) {
			const want = ds[Math.floor(ds.length * frac)];
			const s = c * C + sOff;
			let d = null;
			for (let k = 0; k < 24 && d === null; k++) {
				const cand = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.0;
				if (!this.onRoad(s, cand) && !this.envOccupied(s, cand, 1.5) && !this.inBuilding(s, cand)) d = cand;
			}
			if (d === null) continue;
			const g = new T.Group();
			this.place(g, s, d);
			const y0 = this.terrainY(s, d) - R.heightAt(r, s);
			const steel = mat('#7d858e', { roughness: 0.5 });
			g.add(box(0.5, 0.4, 0.5, mat('#9a948a'), 0, y0 + 0.2, 0));
			const pole = new T.Mesh(GEO.cyl, steel);
			pole.scale.set(0.35, 22, 0.35);
			pole.position.set(0, y0 + 11, 0);
			g.add(pole);
			g.add(box(3.0, 0.25, 0.25, steel, 0, y0 + 22, 0));
			for (const x of [-1.2, -0.4, 0.4, 1.2]) {
				g.add(box(0.6, 0.45, 0.35, M.lampHousing, x, y0 + 21.7, 0.15));
				const lens = box(0.5, 0.05, 0.3, M.lampLens, x, y0 + 21.47, 0.15);
				g.add(lens);
			}
			const pool = new T.Mesh(M.poolGeo, M.lampPool);
			pool.scale.setScalar(26);
			pool.position.set(0, y0 + 0.1, 0);
			pool.renderOrder = 5;
			g.add(pool);
			const o = new T.Object3D();
			o.position.set(0, y0 + 21.4, 0);
			o.userData.power = 2.2;
			o.userData.drop = 4;
			g.add(o);
			lamps.push(o);
			pole.castShadow = this.shadows;
			group.add(g);
		}
		if (lamps.length) dyn.push({ type: 'lamps', lamps });
	};

	// kolor i materiał terenu tras rzeczywistych
	World.prototype.envTerrainColor = function (s, d) {
		const k = this.areaAt(s, d);
		const n = vnoise(s * 0.02, d * 0.02);
		const c = AREA_RGB[k] || AREA_RGB[0];
		return [c[0] + 0.08 * (n - 0.5), c[1] + 0.07 * (n - 0.5), c[2] + 0.04 * (n - 0.5)];
	};
	World.prototype.envTerrainMat = function (s, d) {
		const k = this.areaAt(s, d);
		const sd = AREA_SAND[k] || 0;
		return [1 - sd, sd, 0];
	};
	World.prototype.envTreeP = function (s, d) {
		return TREE_P[this.areaAt(s, d)] || 0;
	};

	// strefy stacji (model stacji w grze) – bez dróg i wód z mapy
	World.prototype.envStationZone = function (s, d) {
		for (const st of this.route.stations) if (s > st.platformStart - 30 && s < st.platformEnd + 40 && d > -16 && d < 12) return true;
		for (const q of (this.env && this.env.reserved) || []) if (s > q.s0 && s < q.s1 && d > q.d0 && d < q.d1) return true;
		return false;
	};

	// miejsca zajęte przez tor gracza, drugi tor i perony z gry (tory i perony z mapy tam nie wchodzą)
	World.prototype.envOccupied = function (s, d, margin) {
		const r = this.route, m = margin || 0;
		if (Math.abs(d) < 2.6 + m) return true;
		// na trasach rzeczywistych drugi tor jest z mapy; zajęty jest tylko peron stacji (prawdziwy albo domyślny)
		for (const st of r.stations) {
			if (s < st.platformStart - 5 || s > st.platformEnd + 5) continue;
			const pl = st.platform;
			const a = pl ? pl.edge : 2.15, b = pl ? pl.edge + pl.width : 6.1, sg = pl ? pl.side : 1;
			const x = d * sg;
			if (x > a - 0.2 - m && x < b + 0.3 + m) return true;
		}
		return false;
	};

	// prawdziwy dworzec stacji (z mapy) albo null
	World.prototype.envStationBuilding = function (si) {
		const e = this.env;
		const x = e && e.stationReal.get(si);
		return x ? x.b : null;
	};

	// ---------- miejsce obok torów z mapy (słupy, semafory, tablice, filary) ----------
	// odsunięcia torów z mapy w przekroju s (z pamięcią podręczną co 1 m)
	World.prototype.envTracksAt = function (s) {
		const e = this.env;
		if (!e) return [];
		const key = Math.round(s);
		let out = e.tAt.get(key);
		if (out) return out;
		out = [];
		for (const { k, row, i } of e.tSpan.get(Math.floor(key / C)) || []) {
			const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2];
			if ((key - sa) * (key - sb) > 0 || sa === sb) continue;
			// sk: tor ukośny względem naszego (np. linia przechodząca pod torem)
			out.push({ d: da + ((db - da) * (key - sa)) / (sb - sa), side: row[0], sk: Math.abs(db - da) > 0.15 * Math.abs(sb - sa), i, k });
		}
		if (e.tAt.size > 30000) e.tAt.clear();
		e.tAt.set(key, out);
		return out;
	};

	/* Tor pociągów z przeciwka na trasie rzeczywistej: prawdziwy tor z mapy po lewej (bez torów nieużywanych),
	   wybrany dla całej trasy naraz (programowanie dynamiczne, Viterbi): co 5 m kandydatami są wszystkie tory
	   3–45 m od osi – po lewej, a gdy pociąg gracza jedzie lewym torem, po prawej (z dopłatą; tor gracza
	   rozdziela strony, więc przeskoku nie ma); przejście między próbkami tylko po ciągłym torze (zmiana ≤ 0,8 m na 5 m – także
	   przez rozjazdy i głowice stacji); koszt: odległość od typowego rozstawu 4,5 m, tor boczny, a najwięcej –
	   brak toru (przerwa). Tor, który dalej się kończy, przegrywa z torem biegnącym przez całą głowicę. */
	const LANE_STEP = 5, LANE_S0 = -300;
	World.prototype.envLane = function () {
		const e = this.env;
		if (e.lane) return e.lane;
		const n = Math.ceil((this.route.length - LANE_S0) / LANE_STEP) + 1;
		const cand = [], cost = [], back = [];
		for (let i = 0; i < n; i++) {
			const s = LANE_S0 + i * LANE_STEP;
			// stan 0 – brak toru; dalej tory po lewej
			const ds = [NaN].concat(this.envTracksAt(s).filter((t) => !(t.side & 4) && Math.abs(t.d) > 3 && t.d > -45 && t.d < 45).map((t) => t.d + (t.side & 1 ? 1000 : 0)));
			cand.push(ds);
			// koszt: odległość od rozstawu 4,5 m po lewej (po prawej – gdy pociąg gracza jedzie lewym torem – z dopłatą)
			const unary = ds.map((d) => {
				if (Number.isNaN(d)) return 1;
				const side = d > 500 ? 0.06 : 0, dd = d > 500 ? d - 1000 : d;
				return side + (dd < 0 ? 0.02 * Math.abs(dd + 4.5) : 0.04 + 0.02 * Math.abs(dd - 4.5));
			});
			const c = new Float64Array(ds.length), b = new Int16Array(ds.length).fill(-1);
			if (i === 0) unary.forEach((u, k) => { c[k] = u; });
			else {
				const pd = cand[i - 1], pc = cost[i - 1];
				for (let k = 0; k < ds.length; k++) {
					const dk = ds[k] > 500 ? ds[k] - 1000 : ds[k];
					let best = Infinity, bj = -1;
					for (let j = 0; j < pd.length; j++) {
						const dj = pd[j] > 500 ? pd[j] - 1000 : pd[j];
						// brak toru ↔ tor: zawsze, ale z wysokim kosztem (bez szatkowania toru); tor → tor: tylko po ciągłym torze
						const nk = Number.isNaN(dk), nj = Number.isNaN(dj);
						if (!nk && !nj && Math.abs(dk - dj) >= 0.8) continue;
						const cj = pc[j] + (nk !== nj ? 30 : 0);
						if (cj < best) { best = cj; bj = j; }
					}
					c[k] = best + unary[k];
					b[k] = bj;
				}
			}
			cost.push(c);
			back.push(b);
		}
		const lane = new Float32Array(n).fill(NaN);
		let k = 0;
		for (let j = 1; j < cost[n - 1].length; j++) if (cost[n - 1][j] < cost[n - 1][k]) k = j;
		for (let i = n - 1; i >= 0; i--) {
			const d = cand[i][k];
			lane[i] = d > 500 ? d - 1000 : d;
			k = back[i][k] >= 0 ? back[i][k] : 0;
		}
		e.lane = lane;
		return lane;
	};
	// odsunięcie toru pociągów z przeciwka w miejscu s (NaN – brak toru)
	World.prototype.envLaneAt = function (s) {
		const lane = this.envLane(), f = (s - LANE_S0) / LANE_STEP, i = Math.floor(f);
		if (i < 0 || i + 1 >= lane.length) return NaN;
		return lane[i] + (lane[i + 1] - lane[i]) * (f - i);
	};

	/* Wykop pod wiaduktem: obiekt przechodzący pod mostem (droga albo tory z mapy) – miejsce przecięcia osi toru,
	   kierunek w układzie (s, d) i połowa szerokości dna wykopu (jezdnia + chodniki albo rozstaw torów; nie
	   szerzej niż otwór pod przęsłem). Bez obiektu w danych – prostopadle, szerokość otworu. */
	World.prototype.bridgeCorridor = function (b) {
		if (!this.corridors) this.corridors = new Map();
		if (this.corridors.has(b)) return this.corridors.get(b);
		const env = this.route.env;
		const hits = [];
		// łamane z mapy są ucinane przy torze (drogi 7,5 m, tory 0,3 m od osi): koniec blisko osi przedłużony do osi
		const scan = (rows, off, wOf, near) => {
			for (const row of rows || []) {
				const n = (row.length - off) / 2;
				if (n < 2) continue;
				const P = (k) => [row[off + k * 2], row[off + k * 2 + 1]];
				// łamana przechodzi przez oś toru (zmiana strony)
				for (let q = 0; q + 1 < n; q++) {
					const [sa, da] = P(q), [sb, db] = P(q + 1);
					if (Math.sign(da) === Math.sign(db) || da === db) continue;
					if (Math.abs(db - da) < 0.34 * Math.hypot(sb - sa, db - da)) continue;
					const sc = sa + ((sb - sa) * da) / (da - db);
					if (sc < b.from - 15 || sc > b.to + 15) continue;
					hits.push({ s: sc, ang: Math.atan2(db - da, sb - sa), w: wOf(row), rail: rows === railRows });
				}
				for (const [e, f] of [[0, 1], [n - 1, n - 2]]) {
					const [se, de] = P(e), [sf, df] = P(f);
					// koniec blisko osi, ostatni odcinek ukośnie w stronę osi (nie tor równoległy)
					if (Math.abs(de) > near || Math.abs(df) <= Math.abs(de) || Math.abs(df - de) < 0.15 * Math.abs(sf - se) || Math.abs(df - de) < 0.3) continue;
					const sc = se - (de * (sf - se)) / (df - de);
					if (sc < b.from - 15 || sc > b.to + 15) continue;
					if (Math.abs(df - de) < 0.34 * Math.hypot(sf - se, df - de)) continue; // prawie równoległy – nie przecina
					hits.push({ s: sc, ang: Math.atan2(df - de, sf - se), w: wOf(row), rail: rows === railRows });
				}
			}
		};
		const railRows = (env && env.t || []).filter((row) => !(row[0] & 2));
		scan(env && env.r, 1, (row) => (ROAD_W[row[0]] || 6) / 2 + 2, 10);
		// wiadukt nad torami: drogi pod tym samym przęsłem osobno (własny wykop obok torów)
		const roadHits = b.over === 'rail' ? hits.splice(0, hits.length) : [];
		if (b.over !== 'road') scan(railRows, 1, () => 2.6, 6);
		let c;
		if (hits.length) {
			const s0 = Math.min(...hits.map((h) => h.s)), s1 = Math.max(...hits.map((h) => h.s));
			const h0 = hits.reduce((a, h) => (h.w > a.w ? h : a));
			let ang = h0.ang;
			if (Math.cos(ang) < 0) ang += Math.PI;
			const sn = Math.max(0.35, Math.abs(Math.sin(ang)));
			// dno: od skrajnego do skrajnego obiektu (tory obok siebie) + pół szerokości, nie szerzej niż otwór
			const hw = Math.min(((s1 - s0) * sn) / 2 + h0.w, Math.max(3, ((b.to - b.from) * sn) / 2 - 0.5));
			c = { s: (s0 + s1) / 2, ca: Math.cos(ang), sa: Math.sin(ang), hw };
		} else c = { s: (b.from + b.to) / 2, ca: 0, sa: 1, hw: Math.max(3, (b.to - b.from) / 2 - 0.5) };
		// wzdłuż wykopu: odcinek pod mostami (nasz tor na przęśle, tory obok na swoich mostach) – tam pełna głębokość
		let t0 = -14, t1 = 14;
		for (let t = -90; t <= 90; t += 2) {
			const ss = c.s + t * c.ca, dd = t * c.sa;
			const underOurs = ss > b.from - 2 && ss < b.to + 2 && Math.abs(dd) < 5;
			if (underOurs || this.envUnderBridge(ss, dd)) { t0 = Math.min(t0, t - 4); t1 = Math.max(t1, t + 4); }
		}
		c.t0 = t0;
		c.t1 = t1;
		// pod mostem same tory: wykop wzdłuż ich rzeczywistego przebiegu (łuki, rozjazdy, kilka torów), nie prostej
		if (hits.length && hits.every((h) => h.rail)) c.paths = this.envUnderPaths(b, 6.5);
		if (c.paths && roadHits.length) {
			c.roads = roadHits.map((h) => {
				let ang = h.ang;
				if (Math.cos(ang) < 0) ang += Math.PI;
				return { s: h.s, ca: Math.cos(ang), sa: Math.sin(ang), hw: h.w };
			});
		}
		this.corridors.set(b, c);
		return c;
	};

	/* Wykop pod torami przechodzącymi pod mostem: punkty co 1,5 m na torach z mapy, które pod mostem (naszym albo
	   torów obok) przecinają go ukośnie, i na torach z nimi połączonych (rozjazdy). Głębokość: pełna pod mostami,
	   dalej wzdłuż toru (po sieci torów) powrót do terenu na ok. 90 m. Zwraca kubełki po s: [s, d, głębokość]. */
	World.prototype.envUnderPaths = function (b, D) {
		const rows = this.route.env.t || [], S = 1.5, lo = b.from - 200, hi = b.to + 200;
		const pts = [], ends = [];
		rows.forEach((row, i) => {
			if (row[0] & 2) return;
			const n = (row.length - 1) / 2;
			let near = false;
			for (let k = 0; k < n && !near; k++) near = row[1 + k * 2] > lo && row[1 + k * 2] < hi && Math.abs(row[2 + k * 2]) < 150;
			if (!near) return;
			const first = pts.length;
			for (let k = 0; k + 1 < n; k++) {
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2], L = Math.hypot(sb - sa, db - da);
				const m = Math.max(1, Math.ceil(L / S)), ang = L > 0 ? Math.abs(db - da) / L : 0;
				for (let j = k ? 1 : 0; j <= m; j++) {
					const ps = sa + ((sb - sa) * j) / m, pd = da + ((db - da) * j) / m, y = this.envRowMeasured(i, k, ps, pd);
					pts.push({ s: ps, d: pd, ang, row: i, dist: Infinity, y });
				}
			}
			if (pts.length > first) ends.push(first, pts.length - 1);
		});
		if (!pts.length) return null;
		// ukośnie pod mostem: nasz (przęsło z zapasem, do 5 m od osi) albo tor obok na swoim moście
		const queue = [];
		for (let q = 0; q < pts.length; q++) {
			const p = pts[q];
			if (p.ang < 0.34 || p.s < b.from - 80 || p.s > b.to + 80) continue;
			const ours = p.s > b.from - 10 && p.s < b.to + 10 && Math.abs(p.d) < 5;
			if (ours || this.envUnderBridge(p.s, p.d)) { p.dist = 0; queue.push(q); }
		}
		if (!queue.length) return null;
		// połączenia: kolejne punkty toru, koniec toru z najbliższym punktem innego toru (rozjazd, do 1,5 m)
		const links = new Map();
		const link = (a, c, w) => {
			if (!links.has(a)) links.set(a, []);
			if (!links.has(c)) links.set(c, []);
			links.get(a).push([c, w]);
			links.get(c).push([a, w]);
		};
		for (const e of ends) {
			let best = -1, bd = 1.5;
			for (let q = 0; q < pts.length; q++) {
				if (pts[q].row === pts[e].row) continue;
				const w = Math.hypot(pts[q].s - pts[e].s, pts[q].d - pts[e].d);
				if (w < bd) { bd = w; best = q; }
			}
			if (best >= 0) link(e, best, bd);
		}
		// odległość wzdłuż torów od miejsca pod mostem; tory równoległe przy naszej linii (do 20 m) nie schodzą
		const ok = (p) => p.ang > 0.2 || Math.abs(p.d) > 20;
		while (queue.length) {
			const q = queue.shift(), p = pts[q];
			const next = [];
			if (q > 0 && pts[q - 1].row === p.row) next.push([q - 1, Math.hypot(pts[q - 1].s - p.s, pts[q - 1].d - p.d)]);
			if (q + 1 < pts.length && pts[q + 1].row === p.row) next.push([q + 1, Math.hypot(pts[q + 1].s - p.s, pts[q + 1].d - p.d)]);
			for (const l of links.get(q) || []) next.push(l);
			for (const [r, w] of next) {
				const nd = p.dist + w;
				if (nd < pts[r].dist && nd < 95 && ok(pts[r])) { pts[r].dist = nd; queue.push(r); }
			}
		}
		const buckets = new Map();
		for (const p of pts) {
			if (p.dist === Infinity) continue;
			// z pomiaru: tor pod mostem tyle niżej od naszego (teren pod nim: o tyle niżej od korony nasypu)
			// z pomiaru; przejście, którego pomiar nie widzi (wiadukt kolejowy przyjęty mimo braku obniżenia) – typowa głębokość
			const synth = D * (1 - smoothstep(2, 92, p.dist)), meas = p.y !== undefined ? Math.max(0, Math.min(14, R.heightAt(this.route, p.s) - p.y)) : null;
			const depth = meas === null ? synth : b.over === 'rail' && !b.nmt && b.auto ? Math.max(meas, synth) : meas;
			if (depth < 0.05) continue;
			const k = Math.floor(p.s / 8);
			if (!buckets.has(k)) buckets.set(k, []);
			buckets.get(k).push([p.s, p.d, depth]);
		}
		return { hw: 3, buckets };
	};

	// ---------- ukształtowanie terenu (siatka wysokości z generatora) ----------
	// wysokość terenu z siatki (w układzie gry) – dwuliniowo
	World.prototype.demGround = function (s, d) {
		const D = this.env.dem;
		const fr = Math.max(0, Math.min(D.rows - 1.001, (s - D.s0) / D.ds));
		let fc;
		if (D.dc) {
			// kolumny gęściej przy torze (m od osi w dc)
			const dc = D.dc;
			if (d <= dc[0]) fc = 0;
			else if (d >= dc[dc.length - 1]) fc = dc.length - 1.001;
			else {
				let lo = 0, hi = dc.length - 1;
				while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dc[m] <= d) lo = m; else hi = m; }
				fc = Math.min(dc.length - 1.001, lo + (d - dc[lo]) / (dc[hi] - dc[lo]));
			}
		} else fc = Math.max(0, Math.min(D.cols - 1.001, (d - D.d0) / D.dd));
		const r0 = Math.floor(fr), c0 = Math.floor(fc), tr = fr - r0, tc = fc - c0, v = D.v, C2 = D.cols;
		const a = v[r0 * C2 + c0] + (v[r0 * C2 + c0 + 1] - v[r0 * C2 + c0]) * tc;
		const b = v[(r0 + 1) * C2 + c0] + (v[(r0 + 1) * C2 + c0 + 1] - v[(r0 + 1) * C2 + c0]) * tc;
		const off = D.offs[r0] + (D.offs[r0 + 1] - D.offs[r0]) * tr;
		return D.base + (a + (b - a) * tr) / 10 - off;
	};

	// korona torowiska w miejscu s: grupa torów wokół toru pociągu (kolejne tory bliżej niż 12 m), + 3 m pobocza
	World.prototype.envShoulderRaw = function (key) {
		const cache = this.env.shouldersRaw || (this.env.shouldersRaw = new Map());
		let sh = cache.get(key);
		if (sh) return sh;
		// bez torów nieużywanych i ukośnych (linie przechodzące pod torem nie poszerzają korony)
		// z pomiarem (NMT) – tylko tory na poziomie naszej linii (do 0,5 m różnicy): obok bywa inna linia wyżej lub niżej
		const h0 = R.heightAt(this.route, key * 5);
		const level = (t) => { const y = this.envRowMeasured(t.i, t.k, key * 5, t.d); return y === undefined || Math.abs(y - h0) < 0.5; };
		const ts = this.envTracksAt(key * 5).filter((t) => !(t.side & 4) && !t.sk && level(t)).map((t) => t.d);
		let r = 0, l = 0;
		for (const d of ts.filter((x) => x > 0).sort((a, b) => a - b)) { if (d - r < 12) r = d; else break; }
		for (const d of ts.filter((x) => x < 0).sort((a, b) => b - a)) { if (l - d < 12) l = d; else break; }
		sh = { r: Math.max(4.2, r + 3), l: Math.max(4.2, -l + 3) };
		if (cache.size > 40000) cache.clear();
		cache.set(key, sh);
		return sh;
	};
	// wygładzona wzdłuż toru (największa w oknie ±80 m) – granica nie skacze przy chwilowej przerwie między torami
	World.prototype.envShoulder = function (s) {
		const cache = this.env.shoulders || (this.env.shoulders = new Map());
		const key = Math.round(s / 5);
		let sh = cache.get(key);
		if (sh) return sh;
		sh = { r: 4.2, l: 4.2 };
		for (let k = key - 16; k <= key + 16; k++) { const q = this.envShoulderRaw(k); sh.r = Math.max(sh.r, q.r); sh.l = Math.max(sh.l, q.l); }
		if (cache.size > 20000) cache.clear();
		cache.set(key, sh);
		return sh;
	};

	/* Teren z ukształtowaniem: od korony torowiska (poziom toru pociągu, stacje – płaskie) w stronę terenu z siatki
	   skarpą 1:1,5 – nasyp, gdy teren niżej, wykop, gdy wyżej; wykop pod wiaduktem jako górne ograniczenie. */
	World.prototype.demTerrainY = function (s, d) {
		const h = R.heightAt(this.route, s), F = h - 0.95;
		const fl = this.flat(s, d), dp = this.dip(s, d);
		const sh = this.envShoulder(s), edge = d >= 0 ? sh.r : sh.l;
		const beyond = Math.max(0, Math.abs(d) - edge);
		let diff = this.demGround(s, d) - F;
		// skarpa: przejście na szerokości 1,5 × różnica + 8 m (nasyp / wykop), stacje płaskie
		const wB = this.env.dem.lidar ? 0.5 * Math.abs(diff) + 2 : 1.5 * Math.abs(diff) + 8; // NMT: skarpy są w pomiarze
		diff *= smoothstep(0, wB, beyond) * (1 - fl);
		let y = F + diff - (this.areaAt(s, d) === 9 && Math.abs(d) > 10 ? 1.1 : 0);
		if (dp > 0) y = Math.min(y, F - dp);
		// droga lub tor z mapy z pomiaru: teren w ich pasie na ich wysokości (za koroną torowiska; w jej obrębie – gdy
		// tor leży niżej niż korona); na stacjach – poza peronami (od 14 m od osi)
		if ((fl < 0.5 && Math.abs(d) >= 8) || Math.abs(d) >= 14) {
			const ry = this.roadLevel(s, d);
			if (ry !== undefined && (beyond > 1.5 || ry - 0.12 < y - 0.3)) y = ry - 0.12;
		}
		return y;
	};

	/* Wysokość główki szyny toru z mapy w (s, d): tory w grupie torów naszej linii – na jej poziomie (na moście,
	   na nasypie, pod przęsłem razem z wykopem); dalsze tory (inne linie) – na terenie; z – podniesienie nad teren
	   (wiadukty innych linii z rampami). */
	World.prototype.envTrackY = function (s, d, crossing, onBridge, zAbs) {
		const h = R.heightAt(this.route, s), raised = typeof zAbs === 'number' && zAbs > -1e8;
		const sh = this.envShoulder(s);
		const inside = d < sh.r - 1.5 && d > -sh.l + 1.5;
		if (!raised) {
			// tory w grupie torów naszej linii: jej poziom (nad wykopem pod drogą – na własnym moście)
			if (inside && !crossing) return h;
			if (!this.env.dem) return onBridge || (!crossing && this.onBridgeSpan(s, d)) ? h : h - this.dip(s, d, crossing);
			if (onBridge) return h;
			return this.terrainY(s, d) + 0.95;
		}
		// tor wiaduktu innej linii albo rampa do niego: nie niżej niż teren
		const base = this.env.dem ? this.terrainY(s, d) + 0.95 : h - this.dip(s, d, crossing);
		return Math.max(base, zAbs);
	};

	/* Wysokość główki szyny toru z mapy (tor i, odcinek k) w punkcie (s, d): tory przy torze pociągu – na jego
	   poziomie (na moście, na nasypie, pod przęsłem z wykopem); dalsze – na terenie; tory innych linii na wiaduktach
	   i rampy do nich – poziom wiaduktu minus 3% odległości wzdłuż torów (z dala od naszej linii). Używają jej tory,
	   sieć trakcyjna nad nimi – przewody i tory są na tej samej wysokości. */
	World.prototype.envRowZ = function (i, k, s, d) {
		const tz = this.route.env.tz, zr = tz && tz[i];
		if (!zr) return undefined;
		const row = this.route.env.t[i];
		const sa0 = row[1 + k * 2], da0 = row[2 + k * 2], sb0 = row[3 + k * 2], db0 = row[4 + k * 2];
		const lvl = (code) => (code === undefined || code < 0 ? -1e9 : this.envBridgeLevel(Math.floor(code / 10000)) - 0.03 * ((code % 10000) / 10));
		const za = lvl(zr[k]), zb = lvl(zr[k + 1]);
		if (za < -1e8 && zb < -1e8) return undefined;
		const t = Math.abs(sb0 - sa0) > Math.abs(db0 - da0) ? (s - sa0) / (sb0 - sa0) : (d - da0) / (db0 - da0);
		const a = za < -1e8 ? zb : za, b = zb < -1e8 ? za : zb;
		const y = a + (b - a) * Math.max(0, Math.min(1, t));
		const nearK = Math.min(1, Math.max(0, (Math.abs(d) - 30) / 18));
		if (nearK <= 0) return undefined;
		const crossing = Math.abs(db0 - da0) > 0.2 * Math.abs(sb0 - sa0);
		const base = this.envTrackY(s, d, crossing, row[0] & 2);
		return base + Math.max(0, y - base) * nearK;
	};
	World.prototype.envRowY = function (i, k, s, d) {
		const row = this.route.env.t[i];
		const sa0 = row[1 + k * 2], da0 = row[2 + k * 2], sb0 = row[3 + k * 2], db0 = row[4 + k * 2];
		const crossing = Math.abs(db0 - da0) > 0.2 * Math.abs(sb0 - sa0);
		const yl = this.envRowMeasured(i, k, s, d);
		if (yl !== undefined) {
			/* pomiar (NMT): tory przy osi (do 6 m) – poziom naszej linii; dalej zmierzona wysokość, przy czym różnice do
			   0,5 m wyrównane do naszej linii (perony, rozjazdy stacji bez uskoków; te tory tworzą torowisko linii), od
			   1,2 m – pełny pomiar (inna linia) */
			const h = R.heightAt(this.route, s);
			// tor ukośny pod naszym mostem: nie wyżej niż dno wykopu (przejście, którego pomiar nie widzi)
			if (crossing) { const dp = yl < h + 2 ? this.dip(s, d, true) : 0; return dp > 0.5 ? Math.min(yl, h - dp) : yl; }
			const diff = yl - h;
			if (Math.abs(d) < 6) return h;
			return h + diff * smoothstep(0.5, 1.2, Math.abs(diff));
		}
		return this.envTrackY(s, d, crossing, row[0] & 2, this.envRowZ(i, k, s, d));
	};
	// wysokość główki szyny toru z mapy z pomiaru NMT (env.th, dm ponad dem.base) w układzie gry; brak – undefined
	World.prototype.envRowMeasured = function (i, k, s, d) {
		const th = this.route.env.th, D = this.env.dem;
		if (!th || !th[i] || !D || !D.lidar) return undefined;
		const a = th[i][k], b = th[i][k + 1];
		if (!(a >= 0) || !(b >= 0)) return undefined;
		const row = this.route.env.t[i];
		const sa0 = row[1 + k * 2], da0 = row[2 + k * 2], sb0 = row[3 + k * 2], db0 = row[4 + k * 2];
		const t = Math.abs(sb0 - sa0) > Math.abs(db0 - da0) ? (s - sa0) / (sb0 - sa0) : (d - da0) / (db0 - da0);
		return D.base + (a + (b - a) * Math.max(0, Math.min(1, t))) / 10 - D.off;
	};
	// głębokość pod mostem z pomiaru (NMT: dno doliny, drogi, wykopu pod przęsłem) – bez pomiaru stała D
	World.prototype.bridgeDepth = function (b, D) {
		const dem = this.env.dem;
		if (!dem || !dem.lidar) return D;
		if (!this.bDepth) this.bDepth = new Map();
		if (this.bDepth.has(b)) return this.bDepth.get(b);
		let m = 0;
		for (let s = b.from; s <= b.to; s += 2) {
			const F = R.heightAt(this.route, s) - 0.95;
			for (let d = -6; d <= 6; d += 3) m = Math.max(m, F - this.demGround(s, d));
		}
		m = Math.max(1.5, Math.min(14, m));
		this.bDepth.set(b, m);
		return m;
	};

	// poziom główki szyny na wiadukcie innej linii (indeks toru w env.t): najniższy teren pod nim + 6,5 m prześwitu
	World.prototype.envBridgeLevel = function (i) {
		const cache = this.env.bridgeLevels || (this.env.bridgeLevels = new Map());
		if (cache.has(i)) return cache.get(i);
		const row = this.route.env.t[i];
		let low = Infinity;
		for (let k = 1; k + 1 < row.length; k += 2) low = Math.min(low, this.env.dem ? this.terrainY(row[k], row[k + 1]) : R.heightAt(this.route, row[k]) - 0.95);
		const lv = low + 0.95 + 6.5;
		cache.set(i, lv);
		return lv;
	};

	// odległość punktu (s, d) od najbliższej osi toru (nasz tor albo tor z mapy)
	World.prototype.envTrackGap = function (s, d) {
		let g = Math.abs(d);
		for (const t of this.envTracksAt(s)) g = Math.min(g, Math.abs(t.d - d));
		return g;
	};

	// pierwsze wolne odsunięcie od d0 w stronę dir (co najmniej need od osi torów, nie na drodze), do |d| ≤ maxAbs
	World.prototype.envFree = function (s, d0, dir, need, maxAbs) {
		for (let d = d0; Math.abs(d) <= maxAbs; d += dir * 0.2) {
			if (this.envTrackGap(s, d) >= need && !this.onRoad(s, d)) return d;
		}
		return null;
	};

	// skrajne tory grupy torów wokół naszego (kolejne tory bliżej niż 2·need + 0,6 m): miejsca na słupy bramownicy
	World.prototype.envCluster = function (s, need) {
		const ds = this.envTracksAt(s).map((t) => t.d).filter((d) => Math.abs(d) < 60);
		let r = 0, l = 0;
		for (const d of ds.filter((x) => x > 0).sort((a, b) => a - b)) { if (d - r < 2 * need + 0.6) r = d; else break; }
		for (const d of ds.filter((x) => x < 0).sort((a, b) => b - a)) { if (l - d < 2 * need + 0.6) l = d; else break; }
		return { l: l - need - 0.3, r: r + need + 0.3 };
	};

	/* Semafor: maszt po prawej (3,2–4,6 m od osi), gdy tam wolne; między torami, gdy odstęp do toru po prawej
	   pozwala (≥ 4,6 m); inaczej na bramownicy nad grupą torów (głowica nad torem pociągu). */
	World.prototype.envSignalSpot = function (s, sig) {
		// poprawka z pliku trasy: odsunięcie masztu (d) albo bramownica (gantry)
		if (sig && sig.gantry) return { d: sig.d !== undefined ? sig.d : 0, gantry: true, ...this.envCluster(s, 2.4) };
		if (sig && sig.d !== undefined) return { d: sig.d };
		const right = this.envFree(s, 3.2, 1, 2.4, 4.6);
		if (right !== null) return { d: right };
		const ts = this.envTracksAt(s).map((t) => t.d).filter((d) => d > 0).sort((a, b) => a - b);
		if (ts.length && ts[0] >= 4.6) return { d: ts[0] / 2 };
		return { d: 0, gantry: true, ...this.envCluster(s, 2.4) };
	};

	// tablica (ograniczenie, W6…): po prawej, między torami albo po lewej
	World.prototype.envBoardSpot = function (s) {
		const right = this.envFree(s, 3.1, 1, 2.2, 4.4);
		if (right !== null) return right;
		const ts = this.envTracksAt(s).map((t) => t.d).filter((d) => d > 0).sort((a, b) => a - b);
		if (ts.length && ts[0] >= 4.4) return ts[0] / 2;
		const left = this.envFree(s, -3.1, -1, 2.2, 4.4);
		return left !== null ? left : 3.1;
	};

	// bramownica: dwa słupy na krańcach grupy torów i rygiel na wysokości y (układ lokalny obiektu na osi toru)
	World.prototype.envGantry = function (g, l, r, y, material) {
		for (const x of [l, r]) g.add(box(0.36, y + 0.4, 0.36, material, x, (y + 0.4) / 2 - 0.2, 0));
		g.add(box(r - l + 0.6, 0.35, 0.3, material, (l + r) / 2, y, 0));
		g.add(box(r - l + 0.6, 0.12, 0.12, material, (l + r) / 2, y - 0.45, 0));
	};

	/* Sieć trakcyjna na trasie rzeczywistej (jak PKP, sieć łańcuchowa 3 kV):
	   – słupy wspólne dla całej trasy: co 60 m, na łukach co 50 / 40 m; z dala od przejazdów, semaforów, przęseł
	     krótkich mostów; w tunelach bez konstrukcji (przewody zostają);
	   – przewód jezdny 5,6 m nad główką szyny, prosty między punktami podwieszenia, zygzak ±0,25 m na zmianę;
	     lina nośna 1,4 m wyżej w punktach podwieszenia, zwis 0,9 m w połowie przęsła, wieszaki co ok. 8 m;
	   – nad torem pociągu i nad torami zelektryfikowanymi z mapy (electrified=contact_line), także odgałęzieniami;
	   – konstrukcje: pojedynczy tor – słup z wysięgnikiem (rura górna, rura odciągowa, ramię, izolatory), dwa tory –
	     słupy po obu stronach, trzy i więcej – bramka nad grupą torów z wieszakami nad każdym torem.
	   Przewody jako cienkie pasy (widoczne z bliska) i linie (z daleka). */
	const CAT = { cw: 5.6, sys: 1.4, sag: 0.9, stagger: 0.25 };
	World.prototype.envPoles = function () {
		const e = this.env;
		if (e.poles) return e.poles;
		const r = this.route, out = [];
		/* maszty z mapy (env.cm: s, d) przy torach linii (do 25 m): grupy w odległości do 4 m wzdłuż toru – jedna linia
		   słupów (maszty po obu stronach, bramka); między nimi – linie co 40–60 m tylko w lukach danych (> 85 m) */
		const real = [];
		const cm = r.env && r.env.cm;
		if (cm && cm.length) {
			const ms = [];
			for (let i = 0; i + 1 < cm.length; i += 2) if (Math.abs(cm[i + 1]) < 25) ms.push(cm[i]);
			ms.sort((a, b) => a - b);
			for (let i = 0; i < ms.length;) {
				let j = i, sum = 0;
				while (j < ms.length && ms[j] - ms[i] < 4) sum += ms[j++];
				real.push(sum / (j - i));
				i = j;
			}
		}
		let ri = 0, last = -210;
		while (last < r.length + 100) {
			const k0 = Math.abs(R.curvatureAt(r, Math.max(0, last)));
			const step = k0 > 1 / 450 ? 40 : k0 > 1 / 900 ? 50 : 60;
			while (ri < real.length && real[ri] < last + 15) ri++;
			if (ri < real.length && real[ri] <= last + step + 25) {
				out.push(real[ri]);
				last = real[ri++];
				continue;
			}
			let q = last + step;
			const cr = r.crossings.find((c) => Math.abs(q - c.pos) < 10);
			if (cr) q = cr.pos + (q < cr.pos ? -10 : 10);
			const sg = r.signals.find((x) => Math.abs(q - x.pos) < 4);
			if (sg) q = sg.pos + (q < sg.pos ? -5 : 5);
			const br = r.bridges.find((b) => q > b.from + 2 && q < b.to - 2 && b.to - b.from < 45);
			if (br) q = q - br.from < br.to - q ? br.from - 2 : br.to + 2;
			if (!out.length || q > out[out.length - 1] + 20) out.push(q);
			last = Math.max(q, last + 20);
		}
		e.poles = out;
		return out;
	};

	// punkty podwieszenia przewodów toru z mapy: przecięcia łamanej toru z liniami słupów (s = słup)
	World.prototype.envWireSupports = function (i) {
		const e = this.env;
		if (!e.wireSup) e.wireSup = new Map();
		if (e.wireSup.has(i)) return e.wireSup.get(i);
		const row = this.route.env.t[i], poles = this.envPoles(), out = [];
		const firstPole = (s) => { let lo = 0, hi = poles.length; while (lo < hi) { const m = (lo + hi) >> 1; if (poles[m] < s) lo = m + 1; else hi = m; } return lo; };
		for (let k = 1; k + 3 < row.length; k += 2) {
			const sa = row[k], da = row[k + 1], sb = row[k + 2], db = row[k + 3];
			const lo = Math.min(sa, sb), hi = Math.max(sa, sb);
			if (hi - lo < 0.01) continue;
			const pts = [];
			for (let p = firstPole(lo); p < poles.length && poles[p] <= hi; p++) pts.push([poles[p], da + ((db - da) * (poles[p] - sa)) / (sb - sa), p, (k - 1) / 2]);
			if (sb < sa) pts.reverse();
			for (const q of pts) if (!out.length || out[out.length - 1][2] !== q[2]) out.push(q);
		}
		e.wireSup.set(i, out);
		return out;
	};

	/* Bryły sieci (wspólne, jednostkowe – skalowane w instancjach):
	   - kratownica: cztery kątowniki w narożnikach i skratowanie zygzakiem na każdej ścianie (słupy, belki bramek),
	   - rura wzdłuż osi x (wysięgniki, odciągi, ramiona),
	   - izolator wzdłuż osi x: rdzeń i talerze. */
	let catGeo = null;
	function catGeometries() {
		if (catGeo) return catGeo;
		const merge = NS.props.merge, W1 = [1, 1, 1];
		/* kratownica jednostkowa (oś y – długość): bays przęseł; ty – grubość prętów w jednostkach długości (instancja
		   skaluje y do kilku–kilkunastu metrów, więc pręty poprzeczne muszą być w niej bardzo cienkie) */
		const lattice = (bays, ty) => {
			const parts = [], bar = (w, h, d, x, y, z, rz, ry) => {
				const g = new T.BoxGeometry(w, h, d);
				if (rz) g.rotateZ(rz);
				if (ry) g.rotateY(ry);
				g.translate(x, y, z);
				parts.push({ geo: g, color: W1 });
			};
			const t = 0.13;
			for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) bar(t, 1, t, x * (1 - t), 0, z * (1 - t));
			for (let k = 0; k < bays; k++) {
				const y0 = -0.5 + k / bays, y1 = y0 + 1 / bays, dl = Math.hypot(1 - t, 1 / bays), ang = Math.atan2(1 / bays, 1 - t) * (k % 2 ? 1 : -1);
				for (const z of [-0.5, 0.5]) bar(dl, ty, t * 0.45, 0, (y0 + y1) / 2, z * (1 - t), ang);
				for (const x of [-0.5, 0.5]) bar(dl, ty, t * 0.45, x * (1 - t), (y0 + y1) / 2, 0, ang, Math.PI / 2);
			}
			for (const y of [-0.5 + ty / 2, 0.5 - ty / 2]) bar(1, ty, 1, 0, y, 0);
			return merge(parts);
		};
		const tube = new T.CylinderGeometry(0.5, 0.5, 1, 8).rotateZ(Math.PI / 2);
		tube.userData.shared = true;
		const ins = [{ geo: new T.CylinderGeometry(0.28, 0.28, 1, 8).rotateZ(Math.PI / 2), color: W1 }];
		for (let k = 0; k < 6; k++) ins.push({ geo: new T.CylinderGeometry(0.5, 0.5, 0.07, 12).rotateZ(Math.PI / 2).translate(-0.36 + k * 0.144, 0, 0), color: W1 });
		catGeo = { lattice: lattice(10, 0.007), beam: lattice(26, 0.0035), tube, insul: merge(ins) };
		return catGeo;
	}

	/* Wiadukty (drogowe i kolejowe) nad torami w pobliżu kawałka c: odcinki osi (s, d) z wysokością wierzchu Y
	   i szerokością w. deckBottom – spód pomostu (0,9 m pod wierzchem) nad punktem (s, d) albo Infinity. */
	World.prototype.envOverheads = function (c) {
		const e = this.env;
		if (!e.ovh) e.ovh = new Map();
		if (e.ovh.has(c)) return e.ovh.get(c);
		const out = [];
		for (const cc of [c - 1, c, c + 1]) {
			for (const row of e.oByChunk.get(cc) || []) { const pl = this.overpassPlan(row, false); out.push({ P: pl.P, Y: pl.Y, w: pl.w }); }
			for (const row of (e.roByChunk && e.roByChunk.get(cc)) || []) { const pl = this.overpassPlan(row, true); out.push({ P: pl.P, Y: pl.Y, w: pl.w }); }
		}
		e.ovh.set(c, out);
		return out;
	};
	World.prototype.deckBottom = function (s, d, list) {
		let best = Infinity;
		for (const o of list) {
			const P = o.P, Y = o.Y;
			for (let k = 0; k + 1 < P.length; k++) {
				const a = P[k], b = P[k + 1], ds = b[0] - a[0], dd = b[1] - a[1], L2 = ds * ds + dd * dd || 1;
				const t = Math.max(0, Math.min(1, ((s - a[0]) * ds + (d - a[1]) * dd) / L2));
				const dist = Math.hypot(s - (a[0] + ds * t), d - (a[1] + dd * t));
				if (dist < o.w / 2 + 0.4) best = Math.min(best, Y[k] + (Y[k + 1] - Y[k]) * t - 0.9);
			}
		}
		return best;
	};

	World.prototype.buildEnvCatenary = function (group, s0, s1) {
		const r = this.route, e = this.env, poles = this.envPoles();
		const lines = [], ribbon = [];
		const P = (s, d, y) => { R.sidePoint(r, s, d, tp); return [tp.x, y, tp.z]; };
		// cienki przewód: dwa skrzyżowane pasy (poziomy i pionowy) + linia
		const seg = (a, b, w) => {
			lines.push(...a, ...b);
			const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, nx = (-dz / L) * w, nz = (dx / L) * w;
			const q = (p1, p2, p3, p4) => ribbon.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
			q([a[0] - nx, a[1], a[2] - nz], [a[0] + nx, a[1], a[2] + nz], [b[0] + nx, b[1], b[2] + nz], [b[0] - nx, b[1], b[2] - nz]);
			q([a[0], a[1] - w, a[2]], [a[0], a[1] + w, a[2]], [b[0], b[1] + w, b[2]], [b[0], b[1] - w, b[2]]);
		};
		// przęsło sieci między punktami podwieszenia A i B: [s, d, indeks słupa, wysokość główki szyny]
		const ovh = this.envOverheads(Math.floor(s0 / C)), brackets = [];
		/* przęsło: przewód jezdny i lina nośna próbkowane co ok. 3 m; pod wiaduktem obie obniżone pod spód pomostu
		   (jezdny 0,4 m, nośna 0,1 m pod nim; wysokość systemu zmniejszona) z łagodnym spadkiem (8 %) przed i za nim;
		   w najniższym miejscu wspornik z izolatorem do spodu pomostu */
		const span = (A, B) => {
			const zA = (A[2] % 2 ? 1 : -1) * CAT.stagger, zB = (B[2] % 2 ? 1 : -1) * CAT.stagger;
			const Ls = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(6, Math.ceil(Ls / 3));
			const ss = [], dd = [], yr = [], lim = [];
			for (let k = 0; k <= n; k++) {
				const t = k / n;
				ss.push(A[0] + (B[0] - A[0]) * t);
				dd.push(A[1] + (B[1] - A[1]) * t);
				yr.push(A[3] + (B[3] - A[3]) * t);
				lim.push(ovh.length ? this.deckBottom(ss[k], dd[k], ovh) : Infinity);
			}
			const sm = lim.map((_, i) => { let m = Infinity; lim.forEach((v, j) => { if (v < Infinity) m = Math.min(m, v + (Math.abs(i - j) * Ls / n) * 0.08); }); return m; });
			const cy = [], my = [];
			for (let k = 0; k <= n; k++) {
				const t = k / n;
				const c = Math.min(yr[k] + CAT.cw, sm[k] - 0.4);
				cy.push(c);
				my.push(Math.max(c + 0.12, Math.min(yr[k] + CAT.cw + CAT.sys - CAT.sag * 4 * t * (1 - t), sm[k] - 0.1)));
			}
			const cP = (k) => P(ss[k], dd[k] + zA + (zB - zA) * (k / n), cy[k]), mP = (k) => P(ss[k], dd[k], my[k]);
			for (let k = 0; k < n; k++) { seg(cP(k), cP(k + 1), 0.03); seg(mP(k), mP(k + 1), 0.025); }
			for (let k = 1; k < n; k++) if (k % 3 === 0 || n < 9) lines.push(...cP(k), ...mP(k)); // wieszaki
			let lo = -1;
			for (let k = 0; k <= n; k++) if (lim[k] < Infinity && (lo < 0 || lim[k] < lim[lo])) lo = k;
			if (lo >= 0 && lim[lo] - my[lo] < 1.5) { const top = P(ss[lo], dd[lo], lim[lo]); brackets.push([top[0], my[lo], top[2], lim[lo] - my[lo]]); }
		};
		const inChunk = (s) => s >= s0 && s < s1;
		// tor pociągu
		for (let p = 0; p + 1 < poles.length; p++) {
			if (!inChunk(poles[p])) continue;
			span([poles[p], 0, p, R.heightAt(r, poles[p])], [poles[p + 1], 0, p + 1, R.heightAt(r, poles[p + 1])]);
		}
		// tory zelektryfikowane z mapy (przęsła, których pierwszy słup jest w tym kawałku)
		const rowsHere = new Set();
		for (const c of [Math.floor(s0 / C) - 1, Math.floor(s0 / C), Math.floor(s0 / C) + 1]) for (const { i, row } of e.tByChunk.get(c) || []) if ((row[0] & 8) && !(row[0] & 4)) rowsHere.add(i);
		for (const i of rowsHere) {
			const sup = this.envWireSupports(i);
			for (let k = 0; k + 1 < sup.length; k++) {
				const A = sup[k], B = sup[k + 1];
				if (Math.abs(B[2] - A[2]) !== 1 || !inChunk(Math.min(A[0], B[0]))) continue;
				if (Math.abs(A[1]) < 1.2 && Math.abs(B[1]) < 1.2) continue; // nad torem pociągu – już jest
				if (Math.abs(A[1]) >= 60 || Math.abs(B[1]) >= 60) continue; // dalej od osi nie stawiamy słupów
				span([A[0], A[1], A[2], this.envRowY(i, A[3], A[0], A[1])], [B[0], B[1], B[2], this.envRowY(i, B[3], B[0], B[1])]);
			}
		}
		// punkty podwieszenia torów z mapy wg słupa (indeks p → odsunięcia d) – do stawiania słupów
		const supAt = new Map();
		for (const i of rowsHere) for (const q of this.envWireSupports(i)) { if (!supAt.has(q[2])) supAt.set(q[2], []); supAt.get(q[2]).push(q[1]); }
		const wm = World.wireMesh || (World.wireMesh = NS.util.matS('#2c2e31', { roughness: 0.5, metalness: 0.6, side: T.DoubleSide }));
		if (!World.wireMat) {
			World.wireMat = new T.LineBasicMaterial({ color: 0x2a2a2a });
			World.wireMat.userData.shared = true;
		}
		const lg = new T.BufferGeometry();
		lg.setAttribute('position', new T.Float32BufferAttribute(lines, 3));
		group.add(new T.LineSegments(lg, World.wireMat));
		const rg = new T.BufferGeometry();
		rg.setAttribute('position', new T.Float32BufferAttribute(ribbon, 3));
		rg.computeVertexNormals();
		group.add(new T.Mesh(rg, wm));

		// konstrukcje wsporcze przy słupach w tym kawałku
		const parts = { steel: [], insul: [], found: [], lattice: [], beam: [], tube: [] };
		const F = new T.Matrix4(), Mx = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), S3 = new T.Vector3(), Z = new T.Vector3(0, 0, 1);
		const part = (list, x, y, sx, sy, sz, angle) => {
			Q.setFromAxisAngle(Z, angle || 0);
			Mx.compose(V.set(x, y, 0), Q, S3.set(sx, sy, sz));
			list.push(F.clone().multiply(Mx));
		};
		const tube = (x1, y1, x2, y2, th) => part(parts.tube, (x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1), th * 1.2, th * 1.2, Math.atan2(y2 - y1, x2 - x1));
		// słup kratowy na fundamencie (zwężony ku górze nie jest – jak typowe słupy kratowe PKP)
		const post = (x, yb, yt) => {
			part(parts.found, x, yb - 0.25, 0.7, 0.7, 0.7);
			part(parts.lattice, x, (yb + yt) / 2, 0.42, yt - yb, 0.36);
		};
		// miejsce na słup: od x0 na zewnątrz (dir), co najmniej 2,4 m od osi torów
		const spot = (s, x0, dir) => { const f = this.envFree(s, x0, dir, 2.4, Math.abs(x0) + 14); return f === null ? x0 : f; };
		// wysięgnik ze słupa w xp nad tor w xt (główka szyny yr)
		const cant = (xp, xt, yr) => {
			const sgn = Math.sign(xt - xp) || 1, yc = yr + CAT.cw, ym = yc + CAT.sys;
			tube(xp, ym, xt + sgn * 0.4, ym, 0.08); // rura górna (lina nośna)
			tube(xp, ym - 1.0, xt + sgn * 0.2, yc + 0.35, 0.07); // rura odciągowa
			tube(xt, yc + 0.35, xt - sgn * 0.6, yc + 0.02, 0.04); // ramię przewodu jezdnego
			tube(xt, ym, xt, yc + 0.35, 0.03);
			part(parts.insul, xp + sgn * 0.45, ym, 0.45, 0.13, 0.13);
			part(parts.insul, xp + sgn * 0.45, ym - 1.0 + ((yc + 0.35 - (ym - 1.0)) * 0.45) / Math.max(1, Math.abs(xt - xp)), 0.45, 0.12, 0.12, Math.atan2(yc + 0.35 - (ym - 1.0), (xt - xp)));
		};
		for (let p = 0; p < poles.length; p++) {
			const s = poles[p];
			if (!inChunk(s) || r.tunnels.some((t) => s > t.from - 5 && s < t.to + 5)) continue;
			R.trackPoint(r, s, tp);
			F.makeRotationY(-tp.heading);
			F.setPosition(tp.x, 0, tp.z);
			const h = R.heightAt(r, s);
			// tory zelektryfikowane w tym miejscu (tor pociągu + z mapy): te same punkty podwieszenia co przęsła – każde
			// przęsło ma słup na obu końcach (wcześniej tory dobierane osobno – część przewodów wisiała bez słupów)
			const ds = [0];
			for (const d of supAt.get(p) || []) if (Math.abs(d) < 60 && ds.every((x) => Math.abs(x - d) > 1.2)) ds.push(d);
			ds.sort((a, b) => a - b);
			const groups = [];
			for (const d of ds) { const g = groups[groups.length - 1]; if (g && d - g[g.length - 1] <= 7.5) g.push(d); else groups.push([d]); }
			for (const G of groups) {
				const yr = (d) => (Math.abs(d) < 0.5 ? h : this.envTrackY(s, d, false, false));
				const lo = G[0], hi = G[G.length - 1];
				// pod wiaduktem słupa nie stawiamy – przewody trzymają wsporniki przy spodzie pomostu
				if (ovh.length && [lo - 3.3, ...G, hi + 3.3].some((x) => this.deckBottom(s, x, ovh) < yr(Math.min(hi, Math.max(lo, x))) + CAT.cw + CAT.sys + 1.2)) continue;
				if (G.length >= 3) {
					// bramka nad grupą torów
					const xl = spot(s, lo - 3.2, -1), xr = spot(s, hi + 3.2, 1), ymax = Math.max(...G.map(yr)), yb = ymax + CAT.cw + CAT.sys + 0.9;
					post(xl, yr(lo) - 0.6, yb + 0.2);
					post(xr, yr(hi) - 0.6, yb + 0.2);
					// belka bramki – kratownica pozioma
					part(parts.beam, (xl + xr) / 2, yb - 0.25, 0.75, xr - xl + 0.4, 0.5, Math.PI / 2);
					for (const d of G) {
						const y = yr(d);
						tube(d, yb - 0.6, d, y + CAT.cw + CAT.sys, 0.05);
						tube(d, y + CAT.cw + CAT.sys, d, y + CAT.cw + 0.3, 0.03);
						tube(d, y + CAT.cw + 0.3, d - 0.6, y + CAT.cw + 0.02, 0.04);
						part(parts.insul, d, y + CAT.cw + CAT.sys + 0.25, 0.4, 0.13, 0.13, Math.PI / 2);
					}
				} else if (G.length === 2) {
					// słupy po obu stronach pary torów
					const xl = spot(s, lo - 3.3, -1), xr = spot(s, hi + 3.3, 1);
					post(xl, yr(lo) - 0.6, yr(lo) + CAT.cw + CAT.sys + 0.6);
					cant(xl, lo, yr(lo));
					post(xr, yr(hi) - 0.6, yr(hi) + CAT.cw + CAT.sys + 0.6);
					cant(xr, hi, yr(hi));
				} else {
					// pojedynczy tor: słup po wolnej stronie (tor pociągu – najpierw po prawej; tor z mapy – z dala od naszego)
					const d = G[0], y = yr(d);
					let xp;
					if (Math.abs(d) < 0.5) {
						const rr = this.envFree(s, 3.3, 1, 2.6, 4.4);
						xp = rr !== null ? rr : (this.envFree(s, -3.3, -1, 2.6, 4.4) ?? 3.3);
					} else xp = spot(s, d + Math.sign(d) * 3.3, Math.sign(d));
					post(xp, y - 0.6, y + CAT.cw + CAT.sys + 0.6);
					cant(xp, d, y);
				}
			}
		}
		const EM = envMaterials();
		// wsporniki sieci pod wiaduktami: pręt od spodu pomostu do liny nośnej z izolatorem
		if (brackets.length) {
			const bi = new T.InstancedMesh(GEO.box, EM.catSteel, brackets.length * 2), m4 = new T.Matrix4(), q0 = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3();
			brackets.forEach(([x, y, z, h], k) => {
				bi.setMatrixAt(k * 2, m4.compose(v.set(x, y + h / 2, z), q0, sc.set(0.06, Math.max(0.05, h), 0.06)));
				bi.setMatrixAt(k * 2 + 1, m4.compose(v.set(x, y + h - 0.03, z), q0, sc.set(0.5, 0.06, 0.12)));
			});
			bi.castShadow = this.shadows;
			group.add(bi);
		}
		const mats = { steel: EM.catSteel, insul: EM.catInsul, found: EM.catFound, lattice: EM.catSteel, beam: EM.catSteel, tube: EM.catSteel };
		const CG = catGeometries(), geos = { steel: GEO.box, found: GEO.box, insul: CG.insul, lattice: CG.lattice, beam: CG.beam, tube: CG.tube };
		for (const [k, list] of Object.entries(parts)) {
			if (!list.length) continue;
			const inst = new T.InstancedMesh(geos[k], mats[k], list.length);
			list.forEach((m, i2) => inst.setMatrixAt(i2, m));
			inst.castShadow = (k === 'steel' || k === 'lattice' || k === 'beam' || k === 'tube') && this.shadows;
			inst.receiveShadow = true;
			group.add(inst);
		}
	};

	/* Rozjazdy i skrzyżowania torów (z geometrii torów z mapy, env.sw). Układ lokalny: u wzdłuż toru zasadniczego
	   od ostrza (środka skrzyżowania), v w poprzek. Promień łuku zwrotnego z mapy (domyślnie 190 m): od niego
	   zależą długość iglic (ok. 0,82·√R – 1:9 R 190: 11 m, 1:12 R 500: 18 m, 1:18,5 R 1200: 28 m), miejsce
	   krzyżownicy (rozstaw toków wewnętrznych 1,5 m: u = √(3R)) i długość podrozjazdnic.
	   0 – zwykły: podrozjazdnice, iglice z zamknięciami, napęd elektryczny albo zwrotnik ręczny z latarnią,
	       krzyżownica z dziobem i szynami skrzydłowymi, kierownice;
	   1 – symetryczny: oba tory odchylone o połowę, krzyżownica w osi;
	   2 – skrzyżowanie torów: dwie krzyżownice ostre, dwie rozwarte, kierownice, podrozjazdnice pod oboma torami;
	   3, 4 – rozjazd krzyżowy (pojedynczy / podwójny): skrzyżowanie z iglicami i napędami.
	   Szyny torów rysują tory (pociągu i z mapy); części rozjazdu jako instancje na kawałek świata. */
	World.prototype.buildEnvSwitches = function (group, list) {
		if (!list || !list.length) return;
		const r = this.route, M = World.materials();
		const parts = { timber: [], blade: [], steel: [], machine: [], hand: [], lamp: [] };
		const q = new T.Quaternion(), upV = new T.Vector3(0, 1, 0), m4 = new T.Matrix4(), p3 = new T.Vector3(), sc = new T.Vector3();
		for (const row of list) {
			const [s, d, a, side] = row;
			const Rs = row[4] || 190, type = row[5] || 0, cross = row[6] || 0, handOp = !!row[7];
			if (this.envOccupied(s, d, 0) && Math.abs(d) > 3) continue; // pod peronem z gry
			R.sidePoint(r, s, d, tp);
			// rozjazd na torze ukośnym (np. linii pod naszym torem) – na jej poziomie, jak tory
			tp.y = this.envTrackY(s, d, Math.abs(Math.sin(a)) > 0.15, false);
			const H = tp.heading + a, fx = Math.sin(H), fz = -Math.cos(H), rx = Math.cos(H), rz = Math.sin(H);
			// część w (u, v), obrót ang (w prawo +) – v i ang już ze znakiem strony
			const add = (dst, u, v, y, ang, w, h, len) => {
				p3.set(tp.x + fx * u + rx * v, tp.y + y, tp.z + fz * u + rz * v);
				q.setFromAxisAngle(upV, -(H + ang));
				dst.push(m4.compose(p3, q, sc.set(w, h, len)).clone());
			};
			const timbers = (u0, u1, vA, vB) => {
				for (let u = u0; u < u1; u += 0.6) {
					const lo = vA(u), hi = vB(u);
					add(parts.timber, u, (lo + hi) / 2, -0.26, 0, hi - lo, 0.2, 0.26);
				}
			};
			// iglica od ostrza: linia v(u) (z kątem), odcinkami po 1 m
			const blade = (len, vf, af, sgnIn) => {
				for (let u = 0; u < len; u += 1) {
					const um = u + 0.5, taper = (0.05 * (len - um)) / len;
					add(parts.blade, um, vf(um) + sgnIn * taper, -0.08, af(um), 0.06, 0.13, 1.0);
				}
			};
			// napęd: elektryczny (skrzynia) albo zwrotnik ręczny (skrzynka, dźwignia, latarnia)
			const drive = (u, v) => {
				if (handOp) {
					add(parts.hand, u, v, -0.05, 0, 0.36, 0.3, 0.7);
					add(parts.hand, u, v, 0.55, 0, 0.07, 1.0, 0.07);
					add(parts.lamp, u, v, 1.15, 0, 0.26, 0.26, 0.26);
				} else add(parts.machine, u, v, -0.05, 0, 0.55, 0.42, 1.1);
				add(parts.steel, u, v / 2, -0.16, 0, Math.abs(v) - 0.2, 0.06, 0.08);
			};
			if (type <= 1) {
				const uf = Math.sqrt(3 * Rs), bl = Math.max(7, Math.min(32, 0.82 * Math.sqrt(Rs)));
				if (type === 0) {
					// zwykły: tor zasadniczy prosty (v = 0), zwrotny w stronę side
					const yv = (u) => (u * u) / (2 * Rs);
					timbers(0.3, uf + 6, () => -1.3 * side, (u) => (Math.min(yv(u), 4.6) + 1.3) * side);
					blade(bl, () => (0.75 - 0.05) * side, () => 0, -side);
					blade(bl, (u) => (yv(u) - 0.75 + 0.05) * side, (u) => (u / Rs) * side, side);
					for (let u = 0.6; u < bl * 0.5; u += Math.max(1.2, bl * 0.16)) add(parts.steel, u, 0, -0.16, 0, 1.7, 0.05, 0.08);
					drive(0.6, -2.35 * side);
					const fa = (uf / Rs / 2) * side;
					add(parts.steel, uf + 1.2, 0.75 * side, -0.1, fa, 0.22, 0.17, 3.2);
					add(parts.steel, uf - 1.0, (0.75 - 0.14) * side, -0.1, fa * 0.5, 0.07, 0.15, 3.4);
					add(parts.steel, uf - 1.0, (0.75 + 0.14) * side, -0.1, fa * 1.5, 0.07, 0.15, 3.4);
					add(parts.steel, uf, (-0.75 + 0.07) * side, -0.1, 0, 0.06, 0.13, 4.5);
					add(parts.steel, uf, (yv(uf) + 0.75 - 0.07) * side, -0.1, (uf / Rs) * side, 0.06, 0.13, 4.5);
				} else {
					// symetryczny: oba tory odchylone o połowę (± u² / 4R), krzyżownica w osi
					const yh = (u) => (u * u) / (4 * Rs);
					timbers(0.3, uf + 6, (u) => -Math.min(yh(u), 2.3) - 1.3, (u) => Math.min(yh(u), 2.3) + 1.3);
					blade(bl, (u) => yh(u) - 0.75 + 0.05, (u) => u / (2 * Rs), 1);
					blade(bl, (u) => -(yh(u) - 0.75 + 0.05), (u) => -u / (2 * Rs), -1);
					for (let u = 0.6; u < bl * 0.5; u += Math.max(1.2, bl * 0.16)) add(parts.steel, u, 0, -0.16, 0, 1.7, 0.05, 0.08);
					drive(0.6, -2.35);
					add(parts.steel, uf + 1.2, 0, -0.1, 0, 0.22, 0.17, 3.2);
					for (const sg of [-1, 1]) {
						add(parts.steel, uf - 1.0, 0.14 * sg, -0.1, (sg * uf) / (4 * Rs), 0.07, 0.15, 3.4);
						add(parts.steel, uf, sg * (yh(uf) + 0.75 - 0.07), -0.1, (sg * uf) / (2 * Rs), 0.06, 0.13, 4.5);
					}
				}
			} else {
				// skrzyżowanie torów: tor A wzdłuż u, tor B pod kątem cross w stronę side
				const th = Math.max(0.05, cross), c = Math.cos(th), sn = Math.sin(th) * side, tn = Math.tan(th) * side;
				const U = Math.min(40, 2.6 / Math.tan(th) + 2);
				timbers(-U, U, (u) => Math.min(-1.3, u * tn - 1.3), (u) => Math.max(1.3, u * tn + 1.3));
				// krzyżownice w miejscach przecięcia toków: ostre (daleko od środka) i rozwarte (przy środku)
				for (const av of [-0.75, 0.75]) for (const bv of [-0.75, 0.75]) {
					const t = (av - bv * c) / sn, u = t * c - bv * sn;
					const obtuse = Math.sign(av) !== Math.sign(bv) ? false : true;
					const acute = Math.abs(u) > 2;
					add(parts.steel, u, av, -0.1, (th / 2) * side, acute ? 0.22 : 0.18, 0.17, acute ? 3.2 : 2.2);
					if (!acute || obtuse) add(parts.steel, u, av - Math.sign(av) * 0.1, -0.1, 0, 0.06, 0.13, 3.0); // kierownica przy krzyżownicy rozwartej
				}
				if (type >= 3) {
					// rozjazd krzyżowy: iglice przy obu torach w połowie długości i napędy po obu stronach
					const ends = type === 4 ? [-1, 1] : [row[10] < 0 ? -1 : 1];
					for (const e of ends) {
						const u0 = e * U * 0.45;
						for (const sgv of [-1, 1]) {
							add(parts.blade, u0, sgv * 0.68, -0.08, 0, 0.06, 0.13, 6);
							add(parts.blade, u0, u0 * tn + sgv * 0.68, -0.08, th * side, 0.06, 0.13, 6);
						}
						add(parts.steel, u0, 0, -0.16, 0, 1.7, 0.05, 0.08);
						drive(u0, -e * 2.4 * side + (e > 0 ? 0 : u0 * tn));
					}
				}
			}
		}
		const EM = envMaterials();
		const mats = { timber: M.sleeper, blade: M.rail, steel: M.railSide, machine: EM.switchMachine, hand: EM.switchHand, lamp: EM.switchLamp };
		for (const [k, list2] of Object.entries(parts)) {
			if (!list2.length) continue;
			const inst = new T.InstancedMesh(GEO.box, mats[k], list2.length);
			list2.forEach((mm, i) => inst.setMatrixAt(i, mm));
			inst.receiveShadow = true;
			inst.castShadow = (k === 'machine' || k === 'hand') && this.shadows;
			group.add(inst);
		}
	};

	// ---------- budowa kawałka ----------
	World.prototype.buildEnvChunk = function (group, c, dyn) {
		const e = this.env;
		if (!e) return;
		const M = envMaterials();
		// pula świateł kawałka (latarnie na pomostach, peronach) i wyposażenie pomostów drogowych – rysowane razem
		this.envLampSink = [];
		this.envDeckSink = { mk: { p: [], c: [] }, deck: { p: [], c: [] }, lamps: [], signs: [] };
		this.buildEnvOverpasses(group, e.oByChunk.get(c) || []);
		this.buildEnvOverpasses(group, e.roByChunk.get(c) || [], true);
		const rs = e.rByChunk.get(c) || [];
		rs.c0 = c * C;
		if (dyn) this.buildEnvLamps(group, rs, dyn);
		this.buildEnvBuildings(group, e.bByChunk.get(c) || [], M);
		const rsegs = (e.rByChunk.get(c) || []).slice();
		rsegs.c0 = c * C;
		this.buildEnvRoads(group, rsegs, M);
		this.buildEnvWater(group, c, e.wByChunk.get(c) || []);
		this.buildEnvBridges(group, e.obByChunk.get(c) || []);
		this.deckDressFlush(group, this.envDeckSink);
		this.envDeckSink = null;
		this.buildEnvTracks(group, e.tByChunk.get(c) || []);
		this.buildEnvWagons(group, e.wagons.get(c));
		this.buildEnvBuffers(group, e.kByChunk.get(c));
		this.buildEnvSwitches(group, e.swByChunk.get(c));
		if (dyn) this.buildEnvYardLights(group, c, dyn);
		this.buildEnvPlatforms(group, e.pByChunk.get(c) || []);
		this.buildEnvRoofs(group, e.rfByChunk.get(c) || []);
		if (dyn && this.envLampSink.length) dyn.push({ type: 'lamps', lamps: this.envLampSink });
		this.envLampSink = null;
	};

	/* Mosty drogowe obok toru (nad innymi torami, ulicą, rzeką): pomost na wysokości terenu + prześwit (6,8 m
	   nad torami, ok. 1 m w pozostałych miejscach) w środkowej części, zjazdy na końcach, balustrady, filary. */
	/* Plan mostu drogowego obok toru (env.ob; wspólny dla rysowania i kontroli): łamana co ≤ 4 m (P), teren (ground),
	   jezdnia (Y), filary (piers) w 35% i 65% długości – w wolnym miejscu (cały obrys poza torami i drogami). null – za krótki. */
	World.prototype.bridgePlan = function (row) {
		// nad torami pełny prześwit; nad ulicą/rzeką/obniżeniem (terenu pod spodem gra nie wycina) – niski pomost
		const ti = row[0], clear = row[1] >= 60 ? row[1] / 10 : 1.0, w = (ROAD_W[ti] || 6) + 1.2;
		const pts = [];
		for (let i = 2; i < row.length; i += 2) pts.push([row[i], row[i + 1]]);
		const P = [];
		for (let k = 0; k < pts.length; k++) {
			if (k) {
				const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.floor(L / 4);
				for (let j = 1; j <= m; j++) P.push([a[0] + ((b[0] - a[0]) * j) / (m + 1), a[1] + ((b[1] - a[1]) * j) / (m + 1)]);
			}
			P.push(pts[k]);
		}
		if (P.length < 2) return null;
		const cum = [0];
		for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
		const total = cum[cum.length - 1];
		if (total < 12) return null;
		const ground = P.map(([s, d]) => this.terrainY(s, d) + 0.1);
		const zM = this.deckLevel(row), prof = this.deckProfile(row, 2, P);
		const top = zM !== undefined ? zM : Math.max(...ground.slice(Math.floor(P.length * 0.3), Math.ceil(P.length * 0.7) + 1)) + clear;
		const Y = prof ? P.map((_, k) => Math.max(prof[k], ground[k])) : P.map((_, k) => {
			const t = cum[k] / total, e = Math.min(t, 1 - t) / 0.25; // 0 na końcach, 1 od 25% długości
			return Math.max(ground[k], ground[k] + (top - ground[k]) * Math.min(1, e));
		});
		/* filary w wolnych miejscach pod wysokim pomostem (nad torami – równolegle do torów, na szerokość ukośnego pomostu;
		   poza tym – w poprzek mostu), przęsła do ok. 35 m; bez wolnego miejsca w tym zasięgu – najbliższe dalsze */
		const cand = [];
		P.forEach((p, k) => {
			if (Y[k] - ground[k] <= 2.5 || this.envOccupied(p[0], p[1], 0.5) || this.envTrackGap(p[0], p[1]) <= 3.2) return;
			const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
			const pr = row[1] >= 60 ? { k, s: p[0], d: p[1], top: Y[k] - 0.9, ang: 0, par: Math.min(40, (w + 1) / Math.max(0.25, Math.abs(Math.sin(ang)))) } : { k, s: p[0], d: p[1], top: Y[k] - 0.9, ang };
			if (this.pierFree(pr.par ? { s: pr.s, d: pr.d, top: pr.top, len: pr.par } : { s: pr.s, d: pr.d, top: pr.top, ang, cross: 5 })) cand.push(pr);
		});
		const piers = [];
		// podpory: odcinki pomostu przy terenie (końce, nasypy), między nimi filary
		const low = P.map((_, k) => Y[k] - 0.9 - ground[k] < 1.5);
		let last = 0;
		for (let k = 0; k < P.length; k++) {
			if (low[k]) { last = cum[k]; continue; }
			let nextLow = total;
			for (let k2 = k; k2 < P.length; k2++) if (low[k2]) { nextLow = cum[k2]; break; }
			if (nextLow - last <= 35) { k = P.findIndex((_, k2) => cum[k2] >= nextLow); if (k < 0) break; last = nextLow; continue; }
			const near = cand.filter((q) => cum[q.k] > last + 8 && cum[q.k] <= last + 35 && cum[q.k] < nextLow);
			const pick = near.length ? near.reduce((x, y) => (cum[y.k] > cum[x.k] ? y : x)) : cand.filter((q) => cum[q.k] > last + 8 && cum[q.k] < nextLow).reduce((x, y) => (!x || cum[y.k] < cum[x.k] ? y : x), null);
			if (!pick) { k = P.findIndex((_, k2) => cum[k2] >= nextLow); if (k < 0) break; last = nextLow; continue; }
			piers.push(pick);
			last = cum[pick.k];
			k = pick.k;
		}
		return { w, P, cum, total, ground, Y, piers };
	};

	World.prototype.buildEnvBridges = function (group, rows) {
		if (!rows.length) return;
		const r = this.route, M = envMaterials();
		const dst = { p: [], c: [] };
		const asph = col.set('#3f4246').clone(), conc = col.set('#a7a39b').clone();
		const piers = [];
		for (const row of rows) {
			const pl = this.bridgePlan(row);
			if (!pl) continue;
			const { w, P, Y } = pl;
			piers.push(...pl.piers);
			if (this.envDeckSink) this.deckDress(this.envDeckSink, row, row[0], P, Y, w, false);
			const edge = (k, sg) => {
				const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
				const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ns = -(b[1] - a[1]) / L, nd = (b[0] - a[0]) / L;
				R.sidePoint(r, P[k][0] + ns * sg * w / 2, P[k][1] + nd * sg * w / 2, tp);
				return [tp.x, tp.z];
			};
			const quad = (a, b, c2, d2, rgb) => {
				dst.p.push(...a, ...b, ...c2, ...a, ...c2, ...d2);
				for (let i = 0; i < 6; i++) dst.c.push(rgb.r, rgb.g, rgb.b);
			};
			for (let k = 0; k < P.length - 1; k++) {
				const L0 = edge(k, -1), R0 = edge(k, 1), L1 = edge(k + 1, -1), R1 = edge(k + 1, 1), y0 = Y[k], y1 = Y[k + 1];
				quad([L0[0], y0, L0[1]], [R0[0], y0, R0[1]], [R1[0], y1, R1[1]], [L1[0], y1, L1[1]], asph);
				for (const [A, B] of [[L0, L1], [R0, R1]]) quad([A[0], y0 - 0.9, A[1]], [B[0], y1 - 0.9, B[1]], [B[0], y1 + 1.0, B[1]], [A[0], y0 + 1.0, A[1]], conc);
				quad([L0[0], y0 - 0.9, L0[1]], [L1[0], y1 - 0.9, L1[1]], [R1[0], y1 - 0.9, R1[1]], [R0[0], y0 - 0.9, R0[1]], conc);
			}
		}
		if (dst.p.length) {
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(dst.p, 3));
			geo.setAttribute('color', new T.Float32BufferAttribute(dst.c, 3));
			geo.computeVertexNormals();
			const m = new T.Mesh(geo, M.roadDouble);
			m.castShadow = this.shadows;
			m.receiveShadow = true;
			group.add(m);
		}
		const pm = World.platformConcrete || (World.platformConcrete = NS.util.matS('#b8b2a6', { roughness: 0.9, surf: 'concrete' }));
		for (const pr of piers) {
			R.sidePoint(r, pr.s, pr.d, tp);
			const y0 = this.terrainY(pr.s, pr.d) - 0.2, h = pr.top - y0;
			const m = new T.Mesh(GEO.box, pm);
			if (pr.par) m.scale.set(1.2, h, pr.par); else m.scale.set(5, h, 1.2);
			m.position.set(tp.x, y0 + h / 2, tp.z);
			m.rotation.y = -(tp.heading + pr.ang);
			m.castShadow = this.shadows;
			group.add(m);
		}
	};

	/* Tory z mapy obok toru gracza (stacyjne, bocznice, linie równoległe): podsypka, szyny i podkłady scalone
	   w trzy siatki na kawałek. Odcinki pokrywające się z torem gracza, drugim torem i peronami z gry są pomijane. */
	World.prototype.buildEnvTracks = function (group, segs) {
		if (!segs.length) return;
		const r = this.route, M = World.materials();
		const bal = { p: [] }, balOld = { p: [] }, rails = { p: [] }, rust = { p: [] };
		const sleepers = [], woodSl = [];
		const quadStrip = (dst, cols, ys, sa, da, sb, db) => {
			// cols – odsunięcia w poprzek łamanej, ys – wysokości względem główki szyny
			const L = Math.hypot(sb - sa, db - da) || 1;
			const ns = -(db - da) / L, nd = (sb - sa) / L;
			const P = (s, d, o, y) => { R.sidePoint(r, s + ns * o, d + nd * o, tp); return [tp.x, tp.y + y - (dzOf ? dzOf(s, d) : 0) - (o && yWide ? yWide(s, d, o) : 0), tp.z]; };
			for (let j = 0; j < cols.length - 1; j++) {
				const a = P(sa, da, cols[j], ys[j]), b = P(sa, da, cols[j + 1], ys[j + 1]), c2 = P(sb, db, cols[j + 1], ys[j + 1]), d2 = P(sb, db, cols[j], ys[j]);
				const up = ((c2[2] - a[2]) * (b[0] - a[0]) - (c2[0] - a[0]) * (b[2] - a[2])) < 0;
				if (up) dst.p.push(...a, ...b, ...c2, ...a, ...c2, ...d2);
				else dst.p.push(...a, ...c2, ...b, ...a, ...d2, ...c2);
			}
		};
		const deck = { p: [] };
		const balWeed = { p: [] };
		const earth = { p: [] };
		const piers = [];
		let dzOf = null, yWide = null;
		const tzAll = this.route.env.tz;
		for (const { i, k, row } of segs) {
			const onBridge = row[0] & 2, disused = row[0] & 4, side = (row[0] & 1) || disused;
			const sa0 = row[1 + k * 2], da0 = row[2 + k * 2], sb0 = row[3 + k * 2], db0 = row[4 + k * 2];
			const crossing = Math.abs(db0 - da0) > 0.2 * Math.abs(sb0 - sa0);
			const zAt = (s, d) => this.envRowZ(i, k, s, d);
			dzOf = (s, d) => R.heightAt(r, s) - this.envRowY(i, k, s, d);
			void tzAll;
			yWide = null;
			const L = Math.hypot(sb0 - sa0, db0 - da0);
			const pieces = Math.max(1, Math.ceil(L / 4));
			for (let q = 0; q < pieces; q++) {
				const sa = sa0 + ((sb0 - sa0) * q) / pieces, da = da0 + ((db0 - da0) * q) / pieces;
				const sb = sa0 + ((sb0 - sa0) * (q + 1)) / pieces, db = da0 + ((db0 - da0) * (q + 1)) / pieces;
				const sm = (sa + sb) / 2, dm = (da + db) / 2;
				// przy torze pociągu (rozjazd): same szyny – podsypka i podkłady są wspólne z torem pociągu
				const atOurs = Math.abs(dm) < 3.4 && !(crossing && this.dip(sm, dm, true) > 2);
				if (atOurs) {
					if (Math.abs(dm) < 0.3 || this.envOccupied(sm, Math.sign(dm) * 3.6, 0)) continue; // na osi / pod peronem
					for (const rd of [-0.75, 0.75]) quadStrip(side ? rust : rails, [rd - 0.06, rd - 0.036, rd + 0.036, rd + 0.06], [-0.22, 0, 0, -0.22], sa, da, sb, db);
					continue;
				}
				if (this.envOccupied(sm, dm, 0.6)) continue;
				quadStrip(disused ? balWeed : side ? balOld : bal, [-2.2, -1.6, 1.6, 2.2], [-0.95, -0.31, -0.31, -0.95], sa, da, sb, db);
				// tor wyżej niż teren (rampa do wiaduktu innej linii, tor na nasypie): nasyp ze skarpami 1:1,5; wiadukt – filary
				if (this.env.dem || zr) {
					const yTop = R.heightAt(r, sm) - dzOf(sm, dm) - 0.95, hh = yTop - this.terrainY(sm, dm);
					if (hh > 2 && onBridge && zAt(sm, dm) !== undefined) {
						if (Math.floor(sb / 14) !== Math.floor(sa / 14)) piers.push([sm, dm, yTop - 1.0, this.terrainY(sm, dm) - 0.3, Math.atan2(db - da, sb - sa)]);
					} else if (hh > 0.5 && !onBridge && !this.onBridgeSpan(sm, dm) && this.dip(sm, dm) <= 1) {
						// (nad wykopem pod mostem tor stoi na pomoście – bez nasypu)
						const wd = 2.2 + 1.5 * hh;
						quadStrip(earth, [-wd, -2.2, 2.2, wd], [-0.95 - hh, -0.95, -0.95, -0.95 - hh], sa, da, sb, db);
					}
				}
				// tor na moście: pomost (płyta z gzymsami) pod podsypką
				const shm = this.envShoulder(sm), insideM = dm < shm.r - 1.5 && dm > -shm.l + 1.5;
				if (onBridge || (!crossing && (this.onBridgeSpan(sm, dm) || (insideM && this.dip(sm, dm) > 1)))) quadStrip(deck, [-2.9, -2.9, -2.6, -2.6, 2.6, 2.6, 2.9, 2.9], [-2.0, -0.2, 0.2, -1.0, -1.0, 0.2, -0.2, -2.0], sa, da, sb, db);
				for (const rd of [-0.75, 0.75]) quadStrip(side ? rust : rails, [rd - 0.06, rd - 0.036, rd + 0.036, rd + 0.06], [-0.22, 0, 0, -0.22], sa, da, sb, db);
				const Lp = Math.hypot(sb - sa, db - da);
				for (let t = 0.3; t < Lp; t += side ? 0.75 : 0.65) {
					// tor nieużywany: część podkładów zbutwiała i zniknęła
					if (disused && hash(sa * 0.71 + t * 3.3) < 0.3) continue;
					const ss = sa + ((sb - sa) * t) / Lp, sd = da + ((db - da) * t) / Lp;
					(side ? woodSl : sleepers).push([ss, sd, Math.atan2(db - da, sb - sa), dzOf ? dzOf(ss, sd) : 0]);
				}
			}
		}
		const mk = (d, material) => {
			if (!d.p.length) return;
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(d.p, 3));
			geo.computeVertexNormals();
			const m = new T.Mesh(geo, material);
			m.receiveShadow = true;
			group.add(m);
		};
		const EM = envMaterials();
		mk(bal, M.ballast);
		mk(balOld, EM.ballastOld);
		mk(balWeed, EM.ballastWeed);
		mk(earth, EM.embank);
		for (const [ps, pd, top, bot, ang] of piers) {
			R.sidePoint(r, ps, pd, tp);
			const m = new T.Mesh(GEO.box, EM.deck);
			m.scale.set(4.2, Math.max(0.5, top - bot), 1.2);
			m.position.set(tp.x, (top + bot) / 2, tp.z);
			m.rotation.y = -(tp.heading + ang);
			m.castShadow = this.shadows;
			group.add(m);
		}
		mk(deck, EM.deck);
		mk(rails, M.rail);
		mk(rust, M.railSide);
		const sl = (list, material, sc, geo) => {
			if (!list.length) return;
			const inst = new T.InstancedMesh(geo || NS.util.GEO.box, material, list.length);
			const m4 = new T.Matrix4(), qt = new T.Quaternion(), p3 = new T.Vector3(), upV = new T.Vector3(0, 1, 0);
			list.forEach(([s, d, ang, dz], i) => {
				R.sidePoint(r, s, d, tp);
				qt.setFromAxisAngle(upV, -tp.heading - ang);
				inst.setMatrixAt(i, m4.compose(p3.set(tp.x, tp.y - 0.27 - (dz || 0), tp.z), qt, sc));
			});
			inst.receiveShadow = true;
			group.add(inst);
		};
		sl(sleepers, M.sleeper, new T.Vector3(2.6, 0.2, 0.26), NS.util.GEO.sleeper);
		sl(woodSl, EM.sleeperWood, new T.Vector3(2.6, 0.16, 0.25)); // bocznice: podkłady drewniane
	};

	// perony z mapy (wyspowe, przy innych torach): płyta betonowa 0,77 m nad główką szyny z jasną krawędzią;
	// z pomiaru (env.ph) – poziom wierzchu peronu (także perony przy torach innego poziomu stacji)
	// punkt (s, d) w wielokącie
	const inPoly = (pts, s, d) => {
		let inside = false;
		for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			const a = pts[i], b = pts[j];
			if ((a[1] > d) !== (b[1] > d) && s < ((b[0] - a[0]) * (d - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
		}
		return inside;
	};
	// punkt (s, d) pod zadaszeniem z mapy
	World.prototype.envRoofAt = function (s, d) {
		const e = this.env;
		return !!e && !!e.rfAll && e.rfAll.some((o) => s > o.s0 - 0.5 && s < o.s1 + 0.5 && inPoly(o.pts, s, d));
	};
	// czy peron stacji ma zadaszenie z mapy (wtedy bez wiaty z gry)
	World.prototype.envRoofOver = function (st) {
		const P = st.platform;
		if (!this.env || !P) return false;
		for (let s = st.platformStart + 2; s < st.platformEnd; s += 3) {
			for (const f of [0.25, 0.5, 0.75]) if (this.envRoofAt(s, P.side * (P.edge + P.width * f))) return true;
		}
		return false;
	};
	/* zadaszenia peronów z mapy: płaski dach (pokrycie, jasny spód, obrzeże – blenda) nad obrysem, na słupach
	   (wąski dach – jeden rząd w osi, szeroki – dwa rzędy) co ok. 7,5 m z poprzecznymi podciągami; słupy nie stoją
	   na torach. Wysokość: z mapy albo ok. 4,4 m nad główką szyny (wierzch peronu + 3,6 m); dach nad torem – ponad
	   siecią trakcyjną (hala peronowa, 8,5 m). */
	World.prototype.buildEnvRoofs = function (group, list) {
		if (!list.length) return;
		const r = this.route;
		const top = [], under = [], edge = [], glassT = [];
		const cols = [], beams = [];
		const onTrack = (s, d, m) => Math.abs(d) < m || this.envTracksAt(s).some((t) => Math.abs(t.d - d) < m);
		// przycięcie wielokąta (s, d) do półpłaszczyzny f(p) ≥ 0
		const clip = (poly, f) => {
			const out = [];
			for (let k = 0; k < poly.length; k++) {
				const a = poly[k], b = poly[(k + 1) % poly.length], fa = f(a), fb = f(b);
				if (fa >= 0) out.push(a);
				if (fa >= 0 !== fb >= 0) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
			}
			return out;
		};
		for (const o of list) {
			let pts = o.pts;
			// dach nad torem (obrys przykrywa tor w kilku przekrojach) – hala nad siecią trakcyjną
			let overTrack = false;
			for (let s = o.s0 + 1; s < o.s1 && !overTrack; s += 2) {
				const tr = [0].concat(this.envTracksAt(s).map((t) => t.d));
				if (tr.some((td) => inPoly(pts, s, td))) overTrack = true;
			}
			o.overTrack = overTrack;
			// niski dach nad peronem nie wchodzi w skrajnię toru pociągu (krawędź co najmniej 1,8 m od osi)
			if (!overTrack) {
				const sg = Math.sign(pts.reduce((a, p) => a + p[1], 0)) || 1;
				pts = clip(pts, (p) => sg * p[1] - 1.8);
				if (pts.length < 3) continue;
			}
			const hRail = overTrack ? Math.max(8.5, o.h || 0) : o.h > 2.5 ? Math.min(7, o.h + 0.77) : 4.4;
			const yTop = (s) => R.heightAt(r, s) + hRail;
			const xsAt = (s) => {
				const xs = [];
				for (let i = 0; i < pts.length; i++) {
					const a = pts[i], b = pts[(i + 1) % pts.length];
					if ((a[0] - s) * (b[0] - s) > 0 || a[0] === b[0]) continue;
					xs.push(a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0]));
				}
				return xs.sort((a, b) => a - b);
			};
			/* hala nad torami: dach wielospadowy – kalenice nad peronami (środki wolnych pasów w przekroju środkowym),
			   kosze nad torami, przy kalenicach pasy świetlików; dach nad peronem – płaski. prof(d) – wysokość nad yTop */
			let brk = null, ridges = [];
			if (overTrack) {
				const sm = (o.s0 + o.s1) / 2, xs = xsAt(sm), D1 = xs[0], D2 = xs[xs.length - 1];
				let run0 = null;
				for (let d = D1 + 0.5; d <= D2 - 0.5; d += 0.5) {
					const free = !onTrack(sm, d, 2.3);
					if (free && run0 === null) run0 = d;
					if ((!free || d + 0.5 > D2 - 0.5) && run0 !== null) { if (d - run0 >= 3) ridges.push((run0 + d) / 2); run0 = null; }
				}
				if (!ridges.length) ridges = [(D1 + D2) / 2];
				const pk = [[D1 - 1, 0]];
				ridges.forEach((rd, i) => {
					const lo = i ? (ridges[i - 1] + rd) / 2 : D1, hi = i + 1 < ridges.length ? (rd + ridges[i + 1]) / 2 : D2;
					const hgt = Math.min(2.2, 0.16 * Math.min(rd - lo, hi - rd));
					pk.push([lo, 0], [rd - 1.5, hgt * (1 - 1.5 / Math.max(1.6, rd - lo))], [rd, hgt], [rd + 1.5, hgt * (1 - 1.5 / Math.max(1.6, hi - rd))]);
					if (i + 1 === ridges.length) pk.push([hi, 0]);
				});
				pk.push([D2 + 1, 0]);
				brk = pk.sort((a, b) => a[0] - b[0]);
			}
			const prof = (d) => {
				if (!brk) return 0;
				for (let i = 0; i + 1 < brk.length; i++) if (d <= brk[i + 1][0]) { const [a, ya] = brk[i], [b, yb2] = brk[i + 1]; return ya + ((yb2 - ya) * (d - a)) / Math.max(1e-6, b - a); }
				return 0;
			};
			const V = (s, d, dy) => { R.sidePoint(r, s, d, tp); return [tp.x, yTop(s) + prof(d) + dy, tp.z]; };
			// pasy między punktami załamania profilu (płaskie trójkąty – widać spadki); przy kalenicach – szkło
			const strips = brk ? brk.slice(0, -1).map((b0, i) => [b0[0], brk[i + 1][0]]) : [[-Infinity, Infinity]];
			for (const [a, b] of strips) {
				const poly = brk ? clip(clip(pts, (p) => p[1] - a), (p) => b - p[1]) : pts;
				if (poly.length < 3) continue;
				const mid2 = (a + b) / 2, isGlass = o.glass || (brk && ridges.some((rd) => Math.abs(rd - mid2) < 1.5));
				const W3 = poly.map(([s, d]) => V(s, d, 0));
				const ids = T.ShapeUtils.triangulateShape(W3.map((p) => new T.Vector2(p[0], p[2])), []);
				for (const [i0, i1, i2] of ids) {
					const A = W3[i0], B = W3[i1], Cc = W3[i2];
					const up = ((Cc[2] - A[2]) * (B[0] - A[0]) - (Cc[0] - A[0]) * (B[2] - A[2])) < 0;
					const [P1, P2, P3] = up ? [A, B, Cc] : [A, Cc, B];
					(isGlass ? glassT : top).push(...P1, ...P2, ...P3);
					// spód 0,25 m niżej, odwrócony (pod świetlikiem – bez spodu, widać niebo)
					if (!isGlass) under.push(P1[0], P1[1] - 0.25, P1[2], P3[0], P3[1] - 0.25, P3[2], P2[0], P2[1] - 0.25, P2[2]);
				}
			}
			// obrzeże (blenda) wzdłuż obrysu – boki dzielone co 2 m, żeby szły po profilu
			const fas = overTrack ? 0.6 : 0.3;
			for (let k = 0; k < pts.length; k++) {
				const pa = pts[k], pb = pts[(k + 1) % pts.length], m = Math.max(1, Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 2));
				for (let j = 0; j < m; j++) {
					const u0 = j / m, u1 = (j + 1) / m;
					const s0 = pa[0] + (pb[0] - pa[0]) * u0, d0 = pa[1] + (pb[1] - pa[1]) * u0, s1 = pa[0] + (pb[0] - pa[0]) * u1, d1 = pa[1] + (pb[1] - pa[1]) * u1;
					const p = V(s0, d0, 0), q = V(s1, d1, 0);
					edge.push(p[0], p[1] + 0.05, p[2], q[0], q[1] - fas, q[2], q[0], q[1] + 0.05, q[2], p[0], p[1] + 0.05, p[2], p[0], p[1] - fas, p[2], q[0], q[1] - fas, q[2]);
				}
			}
			// słupy i podciągi w przekrojach co ok. 7,5 m
			const L = o.s1 - o.s0, n = Math.max(1, Math.round(L / 7.5));
			for (let k = 0; k <= n; k++) {
				const s = o.s0 + 1.2 + ((L - 2.4) * k) / n;
				const xs = [];
				for (let i = 0; i < pts.length; i++) {
					const a = pts[i], b = pts[(i + 1) % pts.length];
					if ((a[0] - s) * (b[0] - s) > 0 || a[0] === b[0]) continue;
					xs.push(a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0]));
				}
				xs.sort((a, b) => a - b);
				for (let i = 0; i + 1 < xs.length; i += 2) {
					const d1 = xs[i], d2 = xs[i + 1], w = d2 - d1;
					if (w < 1.2) continue;
					const yb = yTop(s) - 0.25;
					// słupy w wolnych pasach przekroju (peron, międzytorze – nie na torze): pas do 12 m – słup w środku,
					// szerszy – co ok. 10 m (hala nad kilkoma peronami: słupy na każdym peronie)
					const posts = [];
					let run0 = null;
					for (let d = d1 + 0.4; d <= d2 - 0.4 + 1e-6; d += 0.5) {
						const free = !onTrack(s, d, 2.3);
						if (free && run0 === null) run0 = d;
						if ((!free || d + 0.5 > d2 - 0.4) && run0 !== null) {
							const e = free ? d : d - 0.5, rw = e - run0;
							if (rw >= 0.4) {
								const m = Math.max(1, Math.round(rw / 10));
								for (let j = 0; j < m; j++) posts.push(m === 1 ? (run0 + e) / 2 : run0 + 1 + ((rw - 2) * j) / (m - 1));
							}
							run0 = null;
						}
					}
					if (!posts.length) continue;
					R.trackPoint(r, s, tp);
					const hd = tp.heading;
					for (const d of posts) {
						const y0 = this.terrainY(s, d) - 0.2, y1 = yb + prof(d);
						R.sidePoint(r, s, d, tp);
						cols.push([tp.x, (y0 + y1) / 2, tp.z, y1 - y0, hd]);
					}
					// podciąg poprzeczny pod dachem
					R.sidePoint(r, s, (d1 + d2) / 2, tp);
					beams.push([tp.x, yb - 0.17, tp.z, w - 0.2, hd]);
				}
			}
		}
		const M = World.materials();
		const roofM = World.roofMetal || (World.roofMetal = NS.util.matS('#4d555e', { roughness: 0.55, metalness: 0.45, side: T.DoubleSide }));
		const underM = World.roofUnder || (World.roofUnder = NS.util.mat('#dfe2e6', { roughness: 0.7, emissive: '#4a4d52' }));
		const edgeM = World.roofEdge || (World.roofEdge = NS.util.matS('#1c3d6e', { roughness: 0.4, metalness: 0.3, side: T.DoubleSide }));
		for (const [arr, material, shadow] of [[top, roofM, true], [under, underM, false], [edge, edgeM, true], [glassT, M.glass, false]]) {
			if (!arr.length) continue;
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
			geo.computeVertexNormals();
			const m = new T.Mesh(geo, material);
			m.castShadow = shadow && this.shadows;
			m.receiveShadow = true;
			group.add(m);
		}
		const steel = World.roofSteel || (World.roofSteel = NS.util.matS('#5d6670', { roughness: 0.45, metalness: 0.6 }));
		const m4 = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
		for (const [list2, isBeam] of [[cols, false], [beams, true]]) {
			if (!list2.length) continue;
			const im = new T.InstancedMesh(GEO.box, steel, list2.length);
			list2.forEach(([x, y, z, h, hd], k) => {
				q.setFromAxisAngle(Y, -hd);
				im.setMatrixAt(k, m4.compose(v.set(x, y, z), q, isBeam ? sc.set(h, 0.32, 0.2) : sc.set(0.24, h, 0.24)));
			});
			im.castShadow = this.shadows;
			im.receiveShadow = true;
			group.add(im);
		}
	};

	/* środek prawdziwej szerokości peronu stacji w przekroju s (obrys z mapy: przecięcia boków z linią s = const,
	   od krawędzi przy torze pociągu do najdalszego punktu) albo null */
	World.prototype.envPlatformMid = function (st, s) {
		const P = st.platform;
		if (!P || P.pi === undefined) return null;
		const e = this.env;
		if (!e.pfPts) e.pfPts = new Map();
		let pts = e.pfPts.get(P.pi);
		if (pts === undefined) {
			pts = null;
			for (const list of e.pByChunk.values()) for (const { i, row, n } of list) {
				if (i !== P.pi || row[0] !== 1 || pts) continue;
				pts = [];
				for (let k = 0; k < n; k++) pts.push([row[1 + k * 2], row[2 + k * 2]]);
			}
			e.pfPts.set(P.pi, pts);
		}
		if (!pts) return null;
		let far = -Infinity;
		for (let k = 0; k < pts.length; k++) {
			const a = pts[k], b = pts[(k + 1) % pts.length];
			if ((a[0] - s) * (b[0] - s) > 0 || a[0] === b[0]) continue;
			far = Math.max(far, P.side * (a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0])));
		}
		if (far < P.edge + 2) return null;
		return P.side * (P.edge + far) / 2;
	};

	// czy obrys peronu stacji z mapy wychodzi poza model peronu (przed platformStart / za platformEnd)
	World.prototype.envPlatformExt = function (st) {
		const P = st.platform, out = { start: false, end: false };
		if (!P || P.pi === undefined) return out;
		for (const list of this.env.pByChunk.values()) for (const { i, row, n } of list) {
			if (i !== P.pi || row[0] !== 1) continue;
			for (let k = 0; k < n; k++) {
				const s = row[1 + k * 2], d = row[2 + k * 2];
				if (P.side * d < P.edge - 0.5) continue;
				if (s < st.platformStart - 1) out.start = true;
				if (s > st.platformEnd + 1) out.end = true;
			}
			return out;
		}
		return out;
	};

	World.prototype.buildEnvPlatforms = function (group, list) {
		if (!list.length) return;
		const r = this.route;
		const top = { p: [] }, sides = { p: [] }, wl = { p: [] }, yl = { p: [] };
		const deco = [];
		// przycięcie wielokąta (s, d) do półpłaszczyzny f(p) ≥ 0 (Sutherland–Hodgman)
		const clip = (poly, f) => {
			const out = [];
			for (let k = 0; k < poly.length; k++) {
				const a = poly[k], b = poly[(k + 1) % poly.length], fa = f(a), fb = f(b);
				if (fa >= 0) out.push(a);
				if (fa >= 0 !== fb >= 0) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
			}
			return out;
		};
		const draw = (poly, yAt, cuts) => {
			const W = poly.map(([s, d]) => {
				R.sidePoint(r, s, d, tp);
				const y = yAt(s, d);
				// ściana boczna do terenu (obniżony teren przy wiadukcie, nasyp) – peron nie wisi nad ziemią
				return [tp.x, y + 0.77, tp.z, Math.min(y - 0.4, this.terrainY(s, d) - 0.3)];
			});
			const ids = T.ShapeUtils.triangulateShape(W.map((p) => new T.Vector2(p[0], p[2])), []);
			for (const [a, b, c2] of ids) {
				const A = W[a], B = W[b], Cc = W[c2];
				const up = ((Cc[2] - A[2]) * (B[0] - A[0]) - (Cc[0] - A[0]) * (B[2] - A[2])) < 0;
				if (up) top.p.push(A[0], A[1], A[2], B[0], B[1], B[2], Cc[0], Cc[1], Cc[2]);
				else top.p.push(A[0], A[1], A[2], Cc[0], Cc[1], Cc[2], B[0], B[1], B[2]);
			}
			// ściany boczne (krawędź peronu)
			for (let k = 0; k < W.length; k++) {
				const p = W[k], q = W[(k + 1) % W.length];
				sides.p.push(p[0], p[1], p[2], q[0], q[3], q[2], q[0], q[1], q[2], p[0], p[1], p[2], p[0], p[3], p[2], q[0], q[3], q[2]);
			}
			/* pochylnie: na bokach w poprzek toru (koniec peronu) klin 6 m na zewnątrz, od wierzchu do poziomu toru
			   (bez boków przyciętych przy modelu peronu stacji – cuts; skrócony albo pominięty, gdy dalej jest tor lub droga) */
			let ar = 0;
			for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; ar += a[0] * b[1] - b[0] * a[1]; }
			const so2 = ar > 0 ? -1 : 1;
			for (let k = 0; k < poly.length; k++) {
				const a = poly[k], b = poly[(k + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
				if (L < 1.5) continue;
				const no = [(so2 * -(b[1] - a[1])) / L, (so2 * (b[0] - a[0])) / L];
				if (Math.abs(no[0]) < 0.9) continue;
				if (cuts && cuts.some((c) => Math.abs(a[0] - c) < 0.05 && Math.abs(b[0] - c) < 0.05)) continue;
				// punkty kontrolne 0,8 m od narożników (narożnik przy krawędzi peronowej leży tuż przy skrajni toru)
				const ti = Math.min(0.4, 0.8 / L), chk = [ti, 1 - ti].map((t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
				// zajęte: tor (pociągu lub z mapy); na drogę albo dojście pochylnia może schodzić
				const busy = (s2, d2) => Math.abs(d2) < 1.4 || this.envTracksAt(s2).some((t) => Math.abs(t.d - d2) < 1.4);
				const free = (l) => [0.5, 1].every((f) => chk.every((p) => !busy(p[0] + no[0] * l * f, p[1] + no[1] * l * f)));
				// pochylnia schodzi do terenu (nie niżej niż 1,5 m pod główkę szyny), nachylenie ok. 1:7, długość 6–12 m
				const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], y0 = yAt(mid[0], mid[1]);
				const gEnd = (l) => Math.max(y0 - 1.5, Math.min(y0 + 0.02, this.terrainY(mid[0] + no[0] * l, mid[1] + no[1] * l) + 0.05));
				const want = Math.min(12, Math.max(6, (y0 + 0.77 - gEnd(8)) * 7));
				const Lr = free(want) ? want : free(6) ? 6 : free(3) ? 3 : 0;
				if (!Lr) continue;
				const yE = gEnd(Lr);
				const v = (p, out) => {
					const ps = p[0] + no[0] * out, pd = p[1] + no[1] * out, y = yAt(p[0], p[1]);
					R.sidePoint(r, ps, pd, tp);
					const yt = out ? yE : y + 0.77;
					return [tp.x, yt, tp.z, Math.min(yt - 0.3, y - 0.4, this.terrainY(ps, pd) - 0.3)];
				};
				const A = v(a, 0), B = v(b, 0), Ao = v(a, Lr), Bo = v(b, Lr);
				const tri = (P1, P2, P3) => {
					const up = ((P3[2] - P1[2]) * (P2[0] - P1[0]) - (P3[0] - P1[0]) * (P2[2] - P1[2])) < 0;
					if (up) top.p.push(P1[0], P1[1], P1[2], P2[0], P2[1], P2[2], P3[0], P3[1], P3[2]);
					else top.p.push(P1[0], P1[1], P1[2], P3[0], P3[1], P3[2], P2[0], P2[1], P2[2]);
				};
				tri(A, B, Bo);
				tri(A, Bo, Ao);
				// boki klina i czoło przy końcu pochylni
				for (const [p, q] of [[A, Ao], [B, Bo], [Ao, Bo]]) sides.p.push(p[0], p[1], p[2], q[0], q[1], q[2], q[0], q[3], q[2], p[0], p[1], p[2], q[0], q[3], q[2], p[0], p[3], p[2]);
			}
			/* krawędź peronowa: bok wzdłuż toru (tor z mapy albo tor pociągu 1,2–2,8 m od boku, po jego zewnętrznej stronie)
			   – biała krawędź 0,35 m i żółta linia bezpieczeństwa 0,45 m od krawędzi */
			let area = 0;
			for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
			const so = area > 0 ? -1 : 1; // normalna na zewnątrz: so · (−Δd, Δs)
			const P3 = (p, y) => { R.sidePoint(r, p[0], p[1], tp); return [tp.x, y, tp.z]; };
			const strip = (dst, a, b, no, o0, o1, y) => {
				const A0 = [a[0] - no[0] * o0, a[1] - no[1] * o0], A1 = [a[0] - no[0] * o1, a[1] - no[1] * o1], B0 = [b[0] - no[0] * o0, b[1] - no[1] * o0], B1 = [b[0] - no[0] * o1, b[1] - no[1] * o1];
				const v = [P3(A0, y(A0)), P3(A1, y(A1)), P3(B1, y(B1)), P3(B0, y(B0))];
				for (const [x, z, w2] of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) dst.p.push(...v[x], ...v[z], ...v[w2]);
			};
			for (let k = 0; k < poly.length; k++) {
				const a = poly[k], b = poly[(k + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
				if (L < 1) continue;
				const no = [(so * -(b[1] - a[1])) / L, (so * (b[0] - a[0])) / L];
				if (Math.abs(no[1]) < 0.9) continue; // bok w poprzek toru
				const m = Math.max(1, Math.ceil(L / 4));
				for (let q = 0; q < m; q++) {
					const p0 = [a[0] + ((b[0] - a[0]) * q) / m, a[1] + ((b[1] - a[1]) * q) / m], p1 = [a[0] + ((b[0] - a[0]) * (q + 1)) / m, a[1] + ((b[1] - a[1]) * (q + 1)) / m];
					const ms = (p0[0] + p1[0]) / 2, md = (p0[1] + p1[1]) / 2;
					const tr = [0].concat(this.envTracksAt(ms).filter((t) => !t.sk).map((t) => t.d));
					if (!tr.some((td) => { const g = (td - md) * Math.sign(no[1]); return g > 1.2 && g < 2.8; })) continue;
					const y = (p) => yAt(p[0], p[1]) + 0.785;
					strip(wl, p0, p1, no, 0, 0.35, y);
					strip(yl, p0, p1, no, 0.45, 0.59, y);
				}
			}
		};
		for (const { i, row, n } of list) {
			const pts = [];
			for (let k = 0; k < n; k++) pts.push([row[1 + k * 2], row[2 + k * 2]]);
			if (this.env.usedPlatforms.has(i)) {
				/* peron stacji: model z gry ma stałą szerokość (pomiar przekroju urywa się np. na zejściach do przejścia
				   podziemnego) – reszta obrysu z mapy dorysowana: na długości modelu za jego tylną krawędzią (reszta peronu
				   wyspowego), poza nią cały obrys; krawędź nie bliżej toru niż krawędź modelu (skrajnia); wysokość jak model */
				const st = r.stations.find((x) => x.platform && x.platform.pi === i);
				if (!st || row[0] !== 1) continue;
				const P = st.platform, sg = P.side, a = st.platformStart, b = st.platformEnd, back = P.edge + P.width - 0.05;
				const near = clip(pts, (p) => sg * p[1] - P.edge);
				const parts = [clip(near, (p) => a - p[0]), clip(near, (p) => p[0] - b), clip(clip(clip(near, (p) => p[0] - a), (p) => b - p[0]), (p) => sg * p[1] - back)];
				parts.forEach((q, k) => { if (q.length >= 3) draw(q, (s2) => R.heightAt(r, s2) - 0.005, k === 0 ? [a] : k === 1 ? [b] : [a, b]); });
				continue;
			}
			if (pts.some(([s, d]) => this.envOccupied(s, d, 0.3))) continue;
			deco.push(pts);
			let poly = pts;
			if (row[0] === 0) {
				// peron jako linia: obrys o szerokości 4 m
				const left = [], right = [];
				for (let k = 0; k < pts.length; k++) {
					const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
					const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ns = -(b[1] - a[1]) / L, nd = (b[0] - a[0]) / L;
					left.push([pts[k][0] + ns * 2, pts[k][1] + nd * 2]);
					right.push([pts[k][0] - ns * 2, pts[k][1] - nd * 2]);
				}
				poly = left.concat(right.reverse());
				if (poly.some(([s, d]) => this.envOccupied(s, d, 0.3))) continue;
			}
			const ph = this.route.env.ph, D = this.env.dem, yTop = ph && ph[i] >= 0 && D && D.lidar ? D.base + ph[i] / 10 - D.off : null;
			draw(poly, (s, d) => (yTop !== null ? yTop - 0.77 : this.envTrackY(s, d, false, false)));
		}
		// wyposażenie: latarnie co 30 m wzdłuż osi peronu i tablice z nazwą najbliższej stacji
		for (const pts of deco) {
			let s0 = Infinity, s1 = -Infinity, dm = 0;
			for (const [s, d] of pts) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); dm += d; }
			dm /= pts.length;
			if (s1 - s0 < 40) continue;
			const st = r.stations.reduce((a, b) => Math.abs((b.platformStart + b.platformEnd) / 2 - (s0 + s1) / 2) < Math.abs((a.platformStart + a.platformEnd) / 2 - (s0 + s1) / 2) ? b : a);
			const lamps = [];
			for (let s = s0 + 12; s < s1 - 6; s += 30) {
				const g = new T.Group();
				this.place(g, s, dm);
				lamps.push(this.platformLamp(g, 0, 0, dm > 0 ? 1 : -1));
				group.add(g);
			}
			for (const f of [0.3, 0.7]) {
				const s = s0 + (s1 - s0) * f, g = new T.Group();
				this.place(g, s, dm);
				this.nameBoard(g, st.name, 4.2, 0.8, 0, 3.0, 0, false);
				g.add(box(0.08, 2.75, 0.08, mat('#5d6670'), 0, 1.6, -1.7));
				g.add(box(0.08, 2.75, 0.08, mat('#5d6670'), 0, 1.6, 1.7));
				group.add(g);
			}
			if (lamps.length && this.envLampSink) this.envLampSink.push(...lamps);
		}
		const concrete = World.platformConcrete || (World.platformConcrete = NS.util.matS('#b8b2a6', { roughness: 0.9, surf: 'concrete' }));
		// ściany boczne – beton jak nawierzchnia, ciemniejszy (wcześniej jasna, gładka biel – peron wyglądał jak pudło)
		const edge = World.platformEdge || (World.platformEdge = NS.util.matS('#9d978c', { roughness: 0.95, surf: 'concrete', side: T.DoubleSide }));
		const white = World.platformWhite || (World.platformWhite = NS.util.mat('#f2f2f2'));
		const yellow = World.platformYellow || (World.platformYellow = NS.util.mat('#e8c430'));
		for (const [d, material] of [[top, concrete], [sides, edge], [wl, white], [yl, yellow]]) {
			if (!d.p.length) continue;
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(d.p, 3));
			geo.computeVertexNormals();
			const m = new T.Mesh(geo, material);
			m.receiveShadow = true;
			m.castShadow = this.shadows;
			group.add(m);
		}
	};

	World.prototype.buildEnvBuildings = function (group, list, M) {
		if (!list.length) return;
		const r = this.route;
		const fa = { p: [], uv: [], c: [] }, pl = { p: [], uv: [], c: [] };
		const tri = (dst, a, b, c2, ua, ub, uc, rgb) => {
			dst.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c2[0], c2[1], c2[2]);
			dst.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
			for (let k = 0; k < 3; k++) dst.c.push(rgb.r, rgb.g, rgb.b);
		};
		const Z = [0, 0];
		const reserved = (this.env && this.env.reserved) || [];
		for (const b of list) {
			if (reserved.some((q) => b.s1 > q.s0 && b.s0 < q.s1 && b.d1 > q.d0 && b.d0 < q.d1)) continue;
			const row = b.row, n = b.n, kind = row[0], h = row[1] / 10, roofS = row[2];
			const seed = b.i * 1.37 + b.cs * 0.013;
			const use = (this.env.bUse && this.env.bUse[b.i]) || 0;
			// elewacja wg rodzaju (urzędy, służby, szkoły…; bloki i domy z usługą na parterze – bez zmian)
			const UW = USE_WALL[use] && kind !== 0 && kind !== 1 ? USE_WALL[use] : null;
			const wall = col.set(UW ? UW[Math.floor(hash(seed) * UW.length)] : WALLS[kind][Math.floor(hash(seed) * WALLS[kind].length)]).clone();
			const roofC = col.set(ROOFS[kind][Math.floor(hash(seed + 0.5) * ROOFS[kind].length)]).clone();
			// wierzchołki obrysu w świecie, podstawa – najniższy punkt terenu pod budynkiem
			const P = [];
			let base = Infinity, cx = 0, cz = 0;
			for (let k = 0; k < n; k++) {
				const s = row[3 + k * 2], d = row[4 + k * 2];
				R.sidePoint(r, s, d, tp);
				const y = this.terrainY(s, d);
				base = Math.min(base, y);
				P.push([tp.x, 0, tp.z]);
				cx += tp.x; cz += tp.z;
			}
			cx /= n; cz /= n;
			base -= 0.3;
			const top = base + 0.3 + h;
			/* nad torami (hala peronowa, zadaszenie, pomost – w danych jako budynek): sam dach na zmierzonej wysokości,
			   widoczny też od spodu, bez ścian */
			let overTrack = false;
			for (let k = 0; k <= n && !overTrack; k++) {
				let s0 = 0, d0 = 0;
				if (k < n) { s0 = row[3 + k * 2]; d0 = row[4 + k * 2]; } else { for (let q = 0; q < n; q++) { s0 += row[3 + q * 2] / n; d0 += row[4 + q * 2] / n; } }
				if (Math.abs(d0) < 3.5 || this.envTracksAt(s0).some((t) => Math.abs(t.d - d0) < 2)) overTrack = true;
			}
			if (overTrack) {
				const contour = P.map((p) => new T.Vector2(p[0], p[2]));
				const yRoof = Math.max(top, R.heightAt(r, b.cs) + 5.8);
				for (const [i0, i1, i2] of T.ShapeUtils.triangulateShape(contour, [])) {
					const A = [P[i0][0], yRoof, P[i0][2]], B2 = [P[i1][0], yRoof, P[i1][2]], C2 = [P[i2][0], yRoof, P[i2][2]];
					tri(pl, A, B2, C2, Z, Z, Z, roofC);
					tri(pl, A, C2, B2, Z, Z, Z, roofC);
				}
				// słupy w narożnikach poza torami
				for (let k = 0; k < n; k++) {
					const s0 = row[3 + k * 2], d0 = row[4 + k * 2];
					if (Math.abs(d0) < 3.5 || this.envTracksAt(s0).some((t) => Math.abs(t.d - d0) < 2.4)) continue;
					const x = P[k][0], z = P[k][2], y0 = this.terrainY(s0, d0), q = 0.25;
					for (const [a1, b1, a2, b2] of [[-q, -q, q, -q], [q, -q, q, q], [q, q, -q, q], [-q, q, -q, -q]]) {
						const A = [x + a1, y0, z + b1], B2 = [x + a2, y0, z + b2], C2 = [x + a2, yRoof, z + b2], D2 = [x + a1, yRoof, z + b1];
						tri(pl, A, B2, C2, Z, Z, Z, wall);
						tri(pl, A, C2, D2, Z, Z, Z, wall);
						tri(pl, A, C2, B2, Z, Z, Z, wall);
						tri(pl, A, D2, C2, Z, Z, Z, wall);
					}
				}
				continue;
			}
			// orientacja obrysu (ściany na zewnątrz): pole ze znakiem w płaszczyźnie xz
			let ar = 0;
			for (let k = 0; k < n; k++) { const p = P[k], q = P[(k + 1) % n]; ar += p[0] * q[2] - q[0] * p[2]; }
			const ccw = ar > 0;
			// wysokie „przemysłowe” w mieście to zwykle biurowce – też z oknami (bez nich stały jak gołe kolumny)
			const textured = kind === 0 || kind === 1 || kind === 3 || kind === 4 || kind === 6 || (kind === 2 && h > 9);
			const dst = textured ? fa : pl;
			// przesunięcie wzoru okien (inne zapalone okna w każdym budynku)
			let acc = Math.floor(hash(seed + 0.9) * 4) * 3;
			const ov = Math.floor(hash(seed + 0.3) * 4) * 0.25;
			for (let k = 0; k < n; k++) {
				const p = P[k], q = P[(k + 1) % n];
				const len = Math.hypot(q[0] - p[0], q[2] - p[2]);
				const a = [p[0], base, p[2]], b2 = [q[0], base, q[2]], c2 = [q[0], top, q[2]], d2 = [p[0], top, p[2]];
				const u0 = acc / 12, u1 = (acc + len) / 12, v1 = (top - base - 0.3) / 12 + ov;
				// przy obrysie przeciwnym do ruchu wskazówek (xz, y w górę) zewnętrzna normalna wymaga kolejności (a, c, b)
				if (ccw) {
					tri(dst, a, c2, b2, [u0, ov - 0.025], [u1, v1], [u1, ov - 0.025], wall);
					tri(dst, a, d2, c2, [u0, ov - 0.025], [u0, v1], [u1, v1], wall);
				} else {
					tri(dst, a, b2, c2, [u0, ov - 0.025], [u1, ov - 0.025], [u1, v1], wall);
					tri(dst, a, c2, d2, [u0, ov - 0.025], [u1, v1], [u0, v1], wall);
				}
				acc += len;
			}
			/* detale bryły: cokół (ciemniejszy, wysunięty), gzyms pod dachem, attyka płaskiego dachu. Pasy liczone
			   na obrysie odsuniętym o off (ukos w narożnikach – bez szczelin i zakładek) */
			const NE = [];
			for (let k = 0; k < n; k++) {
				const p = P[k], q = P[(k + 1) % n], L = Math.hypot(q[0] - p[0], q[2] - p[2]) || 1;
				const dx = (q[0] - p[0]) / L, dz = (q[2] - p[2]) / L;
				NE.push(ccw ? [dz, -dx] : [-dz, dx]);
			}
			const offP = (off) => P.map((v, k) => {
				const n1 = NE[(k - 1 + n) % n], n2 = NE[k], dt = n1[0] * n2[0] + n1[1] * n2[1];
				const f = off / Math.max(0.35, 1 + dt);
				return [v[0] + (n1[0] + n2[0]) * f, v[2] + (n1[1] + n2[1]) * f];
			});
			// pionowy pas na obrysie O między y0 a y1; inward – zwrócony do środka (wewnętrzna strona attyki)
			const bandW = (O, y0, y1, rgb, inward) => {
				for (let k = 0; k < n; k++) {
					const p = O[k], q = O[(k + 1) % n];
					const a = [p[0], y0, p[1]], b2 = [q[0], y0, q[1]], c2 = [q[0], y1, q[1]], d2 = [p[0], y1, p[1]];
					if (ccw !== !!inward) { tri(pl, a, c2, b2, Z, Z, Z, rgb); tri(pl, a, d2, c2, Z, Z, Z, rgb); }
					else { tri(pl, a, b2, c2, Z, Z, Z, rgb); tri(pl, a, c2, d2, Z, Z, Z, rgb); }
				}
			};
			// poziomy pierścień między obrysami Oi (wewnętrzny) i Oo (zewnętrzny) na wysokości y
			const ringH = (Oi, Oo, y, rgb, down) => {
				for (let k = 0; k < n; k++) {
					const k2 = (k + 1) % n;
					const A = [Oi[k][0], y, Oi[k][1]], B2 = [Oi[k2][0], y, Oi[k2][1]], C2 = [Oo[k2][0], y, Oo[k2][1]], D2 = [Oo[k][0], y, Oo[k][1]];
					for (const [x, yv, z] of [[A, B2, C2], [A, C2, D2]]) {
						const isUp = ((yv[2] - x[2]) * (z[0] - x[0]) - (yv[0] - x[0]) * (z[2] - x[2])) > 0;
						if (isUp !== !!down) tri(pl, x, yv, z, Z, Z, Z, rgb); else tri(pl, x, z, yv, Z, Z, Z, rgb);
					}
				}
			};
			const O0 = offP(0);
			const plinth = wall.clone().multiplyScalar(0.6), light = wall.clone().lerp(col.set('#ffffff'), 0.3);
			if (kind !== 5) {
				const Op = offP(0.07), yP = base + 0.3 + 0.6 + hash(seed + 2.1) * 0.3;
				bandW(Op, base, yP, plinth);
				ringH(O0, Op, yP, plinth);
			}
			const flatRoof = !(roofS === 1 || roofS === 2);
			if (h > 3.5 && kind !== 5) {
				const Oc = offP(0.22);
				bandW(Oc, top - 0.42, top - 0.04, light);
				ringH(O0, Oc, top - 0.04, light);
				ringH(O0, Oc, top - 0.42, light, true);
			}
			if (flatRoof && h > 3.5) {
				const Oi = offP(-0.24), yA = top + 0.5;
				bandW(O0, top, yA, wall);
				bandW(Oi, top, yA, wall.clone().multiplyScalar(0.85), true);
				ringH(Oi, O0, yA, light);
			}
			if (use) this.envBuildingDecor(group, pl, tri, b, use, P, NE, ccw, base, top, h, seed, flatRoof, cx, cz);
			// dworzec z mapy: tablica z nazwą stacji na ścianie najbliższej torów
			if (kind === 6) this.envStationSign(group, b, top);
			// dachy
			const up = (a, b2, c2) => ((b2[2] - a[2]) * (c2[0] - a[0]) - (b2[0] - a[0]) * (c2[2] - a[2])) > 0; // normalna w górę
			const roofTri = (a, b2, c2, rgb) => { if (up(a, b2, c2)) tri(pl, a, b2, c2, Z, Z, Z, rgb); else tri(pl, a, c2, b2, Z, Z, Z, rgb); };
			const at = (p, y) => [p[0], y, p[2]];
			if (roofS === 1 && n === 4) {
				// dwuspadowy: kalenica wzdłuż dłuższego boku, szczyty w kolorze ścian
				const l0 = Math.hypot(P[1][0] - P[0][0], P[1][2] - P[0][2]), l1 = Math.hypot(P[2][0] - P[1][0], P[2][2] - P[1][2]);
				const o = l0 >= l1 ? 0 : 1;
				const A = P[o], B = P[(o + 1) % 4], Cc = P[(o + 2) % 4], D = P[(o + 3) % 4];
				const rh = Math.min(5.5, 0.42 * Math.min(l0, l1) + 0.6);
				const R0 = [(D[0] + A[0]) / 2, top + rh, (D[2] + A[2]) / 2], R1 = [(B[0] + Cc[0]) / 2, top + rh, (B[2] + Cc[2]) / 2];
				roofTri(at(A, top), at(B, top), R1, roofC);
				roofTri(at(A, top), R1, R0, roofC);
				roofTri(at(Cc, top), at(D, top), R0, roofC);
				roofTri(at(Cc, top), R0, R1, roofC);
				// szczyty (trójkąty ścian) – zwrócone na zewnątrz
				for (const [p, q, rr] of [[B, Cc, R1], [D, A, R0]]) {
					const a = at(p, top), b2 = at(q, top);
					const nx = (b2[2] - a[2]), nz = -(b2[0] - a[0]);
					const out = nx * (rr[0] - cx) + nz * (rr[2] - cz) > 0;
					if (out) tri(pl, a, rr, b2, Z, Z, Z, wall); else tri(pl, a, b2, rr, Z, Z, Z, wall);
				}
			} else if (roofS === 1 || roofS === 2) {
				// kopertowy (namiotowy): wierzchołek nad środkiem
				const area = Math.abs(ar) / 2;
				const apex = [cx, top + Math.min(4.5, 0.32 * Math.sqrt(area) + 0.5), cz];
				for (let k = 0; k < n; k++) roofTri(at(P[k], top), at(P[(k + 1) % n], top), apex, roofC);
			} else {
				// płaski: triangulacja obrysu, attyka jako lekko podniesiony brzeg
				const contour = P.map((p) => new T.Vector2(p[0], p[2]));
				const ids = T.ShapeUtils.triangulateShape(contour, []);
				for (const [i0, i1, i2] of ids) roofTri(at(P[i0], top), at(P[i1], top), at(P[i2], top), roofC);
			}
		}
		const mesh = (d, material) => {
			if (!d.p.length) return;
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(d.p, 3));
			geo.setAttribute('uv', new T.Float32BufferAttribute(d.uv, 2));
			geo.setAttribute('color', new T.Float32BufferAttribute(d.c, 3));
			geo.computeVertexNormals();
			const m = new T.Mesh(geo, material);
			m.castShadow = this.shadows;
			m.receiveShadow = true;
			group.add(m);
		};
		mesh(fa, M.facade);
		mesh(pl, M.plain);
	};

	/* Wyposażenie budynku wg rodzaju na ścianie od strony toru (najbliższej osi, co najmniej 4 m): szyld z napisem
	   (nazwa z mapy albo rodzaj), bramy garażowe i wieża remizy, wieża z krzyżem kościoła, maszty z flagami urzędu i
	   szkoły, pas w kolorze sieci marketu. Bryły dopisywane do siatki zwykłych ścian (pl), szyldy – osobne płaszczyzny. */
	World.prototype.envBuildingDecor = function (group, pl, tri, b, use, P, NE, ccw, base, top, h, seed, flatRoof, cx, cz) {
		const row = b.row, n = b.n, y0 = base + 0.3;
		// ściana frontowa
		let k0 = -1, bd = Infinity;
		for (let k = 0; k < n; k++) {
			const d0 = row[4 + k * 2], d1 = row[4 + ((k + 1) % n) * 2];
			const L = Math.hypot(P[(k + 1) % n][0] - P[k][0], P[(k + 1) % n][2] - P[k][2]);
			if (L >= 4 && Math.abs(d0 + d1) / 2 < bd) { bd = Math.abs(d0 + d1) / 2; k0 = k; }
		}
		if (k0 < 0) return;
		const A = P[k0], B = P[(k0 + 1) % n], L = Math.hypot(B[0] - A[0], B[2] - A[2]);
		const ux = (B[0] - A[0]) / L, uz = (B[2] - A[2]) / L, [nx, nz] = NE[k0];
		const mx = (A[0] + B[0]) / 2, mz = (A[2] + B[2]) / 2;
		const Z = [0, 0];
		// prostopadłościan (środek, wymiary wzdłuż ściany / w górę / w głąb, obrót jak ściana) – ściany na zewnątrz
		const cuboid = (x, y, z, w, hh, dp, rgb, rx, rz) => {
			const ax = rx === undefined ? ux : rx, az = rz === undefined ? uz : rz, bx = -az, bz = ax;
			const V = [];
			for (const sy of [-1, 1]) for (const sa of [-1, 1]) for (const sb of [-1, 1]) V.push([x + ax * sa * w / 2 + bx * sb * dp / 2, y + sy * hh / 2, z + az * sa * w / 2 + bz * sb * dp / 2]);
			const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
			for (const f of F) {
				const a = V[f[0]], b2 = V[f[1]], c2 = V[f[2]], d2 = V[f[3]];
				const fc = [(a[0] + c2[0]) / 2 - x, (a[1] + c2[1]) / 2 - y, (a[2] + c2[2]) / 2 - z];
				const e1 = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], e2 = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]];
				const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
				if (nn[0] * fc[0] + nn[1] * fc[1] + nn[2] * fc[2] >= 0) { tri(pl, a, b2, c2, Z, Z, Z, rgb); tri(pl, a, c2, d2, Z, Z, Z, rgb); }
				else { tri(pl, a, c2, b2, Z, Z, Z, rgb); tri(pl, a, d2, c2, Z, Z, Z, rgb); }
			}
		};
		const C3 = (c) => new T.Color(c);
		// szyld
		const S = USE_SIGN[use];
		const name = this.env.bName && this.env.bName.get(b.i);
		let text = S ? (name && use !== 13 && use !== 14 && use !== 12 ? name : S[0]) : null;
		if (use === 7 && !name) text = SHOPS[Math.floor(hash(seed + 4.1) * SHOPS.length)];
		if (use === 6 && !name) text = null; // biurowiec bez nazwy – bez szyldu
		if (text && S) {
			const high = !!S[4];
			let bg = S[1];
			if (use === 8) bg = MARKET_C[Math.floor(hash(seed + 3.3) * MARKET_C.length)];
			const sh = high ? Math.min(2.2, 0.9 + h * 0.06) : 0.85, sw = Math.min(L * 0.8, Math.max(2.6, Math.min(14, text.length * sh * 0.5 + 1.4)));
			const ys = high ? top - sh / 2 - 0.5 : Math.min(top - sh / 2 - 0.3, y0 + (use === 14 ? 4.5 : 3.4)); // remiza – nad bramami
			if (ys - sh / 2 > y0 + 1.8) {
				const key = `${text}|${bg}|${S[2]}|${S[3] || ''}`;
				World.signMats = World.signMats || new Map();
				let m = World.signMats.get(key);
				if (!m) {
					const tex = signTexture(text, bg, S[2], S[3]);
					m = new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.22, roughness: 0.5 });
					m.userData.shared = true;
					World.signMats.set(key, m);
				}
				if (!World.signGeo) { World.signGeo = new T.PlaneGeometry(1, 1); World.signGeo.userData.shared = true; }
				const sm = new T.Mesh(World.signGeo, m);
				sm.scale.set(sw, sh, 1);
				sm.position.set(mx + nx * 0.09, ys, mz + nz * 0.09);
				sm.rotation.y = Math.atan2(nx, nz);
				group.add(sm);
				// skrzynka szyldu (rama)
				cuboid(mx + nx * 0.04, ys, mz + nz * 0.04, sw + 0.12, sh + 0.12, 0.08, C3('#2a2d31'));
			}
		}
		// pas w kolorze sieci (market) pod attyką
		if (use === 8 && h > 3.5) {
			const c = C3(MARKET_C[Math.floor(hash(seed + 3.3) * MARKET_C.length)]);
			for (let k = 0; k < n; k++) {
				const p = P[k], q = P[(k + 1) % n], [ex, ez] = NE[k];
				const a = [p[0] + ex * 0.03, top - 0.9, p[2] + ez * 0.03], b2 = [q[0] + ex * 0.03, top - 0.9, q[2] + ez * 0.03], c2 = [q[0] + ex * 0.03, top - 0.45, q[2] + ez * 0.03], d2 = [p[0] + ex * 0.03, top - 0.45, p[2] + ez * 0.03];
				if (ccw) { tri(pl, a, c2, b2, Z, Z, Z, c); tri(pl, a, d2, c2, Z, Z, Z, c); } else { tri(pl, a, b2, c2, Z, Z, Z, c); tri(pl, a, c2, d2, Z, Z, Z, c); }
			}
		}
		// straż pożarna: czerwone bramy garażowe (z białymi pasami) i wieża do suszenia węży w narożniku
		if (use === 14) {
			const nd = Math.max(1, Math.min(4, Math.floor((L - 2) / 4.6)));
			for (let i = 0; i < nd; i++) {
				const t = (i + 0.5) / nd - 0.5, x = mx + ux * t * Math.min(L - 2, nd * 4.6), z = mz + uz * t * Math.min(L - 2, nd * 4.6);
				cuboid(x + nx * 0.05, y0 + 1.85, z + nz * 0.05, 3.4, 3.7, 0.1, C3('#b3201b'));
				for (const yy of [1.1, 2.3]) cuboid(x + nx * 0.11, y0 + yy, z + nz * 0.11, 3.4, 0.12, 0.02, C3('#f2f2f2'));
			}
			if (h < 14) {
				const tx = A[0] + ux * 1.6 - nx * 1.6, tz = A[2] + uz * 1.6 - nz * 1.6, th = Math.max(top - base, 6) + 6;
				cuboid(tx, base + th / 2, tz, 3.2, th, 3.2, C3('#a8432f'));
				cuboid(tx, base + th + 0.15, tz, 3.6, 0.3, 3.6, C3('#5a5f66'));
			}
		}
		// kościół: wieża z dachem hełmowym i krzyżem na końcu dłuższej osi (kaplica – sam krzyż na dachu)
		if (use === 21) {
			let ex = 0, ez = 0, lmax = 0;
			for (let k = 0; k < n; k++) for (let j = k + 1; j < n; j++) { const dx = P[j][0] - P[k][0], dz = P[j][2] - P[k][2], l = Math.hypot(dx, dz); if (l > lmax) { lmax = l; ex = dx / l; ez = dz / l; } }
			const big = lmax > 18;
			// koniec osi bliżej toru
			let end = 1;
			{ const sa = ex * (A[0] - cx) + ez * (A[2] - cz); end = sa > 0 ? 1 : -1; }
			const tw = big ? Math.min(7, lmax * 0.22) : 0, along = lmax / 2 - tw / 2;
			const tx = cx + ex * end * along, tz = cz + ez * end * along;
			const wallC = C3('#e3d6bb'), roofC = C3('#4f6a5a');
			let yTop = top + (flatRoof ? 0.5 : 3);
			if (big) {
				const th = Math.max(top - base + 10, 22);
				cuboid(tx, base + th / 2, tz, tw, th, tw, wallC, ex, ez);
				// hełm: ostrosłup
				const ap = [tx, base + th + tw * 1.4, tz];
				const c4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, bq]) => [tx + (ex * a - ez * bq) * tw / 2, base + th, tz + (ez * a + ex * bq) * tw / 2]);
				for (let k = 0; k < 4; k++) {
					const a = c4[k], b2 = c4[(k + 1) % 4];
					const nrm = ((b2[2] - a[2]) * (ap[0] - a[0]) - (b2[0] - a[0]) * (ap[2] - a[2]));
					if (nrm > 0) tri(pl, a, b2, ap, Z, Z, Z, roofC); else tri(pl, a, ap, b2, Z, Z, Z, roofC);
					tri(pl, a, ap, b2, Z, Z, Z, roofC);
				}
				yTop = ap[1];
			}
			const kx = big ? tx : cx, kz = big ? tz : cz, gold = C3('#c9a227');
			cuboid(kx, yTop + 1.1, kz, 0.18, 2.2, 0.18, gold, ex, ez);
			cuboid(kx, yTop + 1.5, kz, 1.2, 0.18, 0.18, gold, -ez, ex);
		}
		// urząd, szkoła, policja: maszt z flagą (urząd – dwa: Polska i Unia) przed ścianą frontową
		if (use === 20 || use === 15 || use === 13) {
			const flags = use === 20 ? [['#ffffff', '#dc143c'], ['#003399', '#003399']] : [['#ffffff', '#dc143c']];
			flags.forEach(([c1, c2], i) => {
				const off = (i - (flags.length - 1) / 2) * 2.2 + Math.min(L / 2 - 1, 3.5);
				const fx = mx + ux * off + nx * 1.6, fz = mz + uz * off + nz * 1.6, gy = this.terrainY ? y0 - 0.3 : y0;
				const ph = Math.min(9, Math.max(6, top - base + 1.5));
				cuboid(fx, gy + ph / 2, fz, 0.09, ph, 0.09, C3('#d8dde2'));
				cuboid(fx + ux * 0.65, gy + ph - 0.45, fz + uz * 0.65, 1.2, 0.36, 0.03, C3(c1));
				cuboid(fx + ux * 0.65, gy + ph - 0.81, fz + uz * 0.65, 1.2, 0.36, 0.03, C3(c2));
			});
		}
		// szpital: czerwony krzyż na dachu płaskim
		if (use === 18 && flatRoof && h > 6) {
			const c = C3('#c4161c');
			cuboid(cx, top + 0.05, cz, 6, 0.04, 1.8, c);
			cuboid(cx, top + 0.05, cz, 1.8, 0.04, 6, c);
		}
	};

	World.prototype.envStationSign = function (group, b, top) {
		const st = this.route.stations.find((x, si) => this.envStationBuilding(si) === b);
		if (!st) return;
		const row = b.row;
		// ściana najbliższa osi toru
		let best = null;
		for (let k = 0; k < b.n; k++) {
			const s0 = row[3 + k * 2], d0 = row[4 + k * 2], s1 = row[3 + ((k + 1) % b.n) * 2], d1 = row[4 + ((k + 1) % b.n) * 2];
			const L = Math.hypot(s1 - s0, d1 - d0), dm = Math.abs((d0 + d1) / 2);
			if (L > 6 && (!best || dm < best.dm)) best = { sm: (s0 + s1) / 2, dmS: (d0 + d1) / 2, dm, L };
		}
		if (!best) return;
		const g = new T.Group();
		this.place(g, best.sm, 0);
		const h0 = R.heightAt(this.route, best.sm);
		const w = Math.min(12, best.L * 0.7), off = best.dmS > 0 ? -0.25 : 0.25;
		this.nameBoard(g, st.name, w, Math.min(1.6, w * 0.16), best.dmS + off, top - 2.4 - h0, 0, best.dmS > 0);
		group.add(g);
	};

	/* Wysokość nawierzchni w (s, d): teren, ale nie niżej niż wyrenderowana siatka terenu (wiersze co 4 m, kolumny
	   World.TERRAIN_D – daleko od toru co kilkadziesiąt metrów; między węzłami siatka bywa wyżej niż teren i
	   przykrywałaby jezdnie, chodniki i place). Węzły siatki z pamięci podręcznej. */
	const tpS = {};
	World.prototype.surfY = function (s, d) {
		const y = this.terrainY(s, d), D = World.TERRAIN_D;
		if (!D || d <= D[0] || d >= D[D.length - 1]) return y;
		let j = 1;
		while (D[j] <= d) j++;
		j--;
		const i0 = Math.floor(s / 4);
		const e = this.env, r = this.route;
		if (!e.meshY || e.meshY.size > 200000) e.meshY = new Map();
		// węzeł siatki terenu: położenie w świecie (x, z) i wysokość – jak w ribbon() (wiersze co 4 m, kolumny D)
		const node = (a, b) => {
			const key = a * 64 + b;
			let n = e.meshY.get(key);
			if (n === undefined) {
				R.sidePoint(r, a * 4, D[b], tpS);
				n = [tpS.x, tpS.z, this.terrainY(a * 4, D[b])];
				e.meshY.set(key, n);
			}
			return n;
		};
		/* punkt w świecie i trójkąt siatki, który go zawiera (szukany w XZ: na łuku daleko od osi wiersze
		   rozchodzą się wachlarzem i (s, d) nie przekłada się liniowo na komórkę) */
		R.sidePoint(r, s, d, tpS);
		const px = tpS.x, pz = tpS.z;
		const bary = (A, B, C) => {
			const v0x = B[0] - A[0], v0z = B[1] - A[1], v1x = C[0] - A[0], v1z = C[1] - A[1], v2x = px - A[0], v2z = pz - A[1];
			const den = v0x * v1z - v1x * v0z;
			if (Math.abs(den) < 1e-9) return null;
			const u = (v2x * v1z - v1x * v2z) / den, v = (v0x * v2z - v2x * v0z) / den;
			return u >= -1e-4 && v >= -1e-4 && u + v <= 1 + 1e-4 ? A[2] + (B[2] - A[2]) * u + (C[2] - A[2]) * v : null;
		};
		for (const i of [i0, i0 - 1, i0 + 1]) for (const jj of [j, j - 1, j + 1]) {
			if (jj < 0 || jj >= D.length - 1) continue;
			const a = node(i, jj), b = node(i, jj + 1), c = node(i + 1, jj), dd = node(i + 1, jj + 1);
			const m = bary(a, b, c) ?? bary(b, dd, c);
			if (m !== null) return Math.max(y, m);
		}
		return y;
	};

	// pas wzdłuż łamanej w (s, d) po terenie; width – szerokość, dy – wysokość nad terenem
	World.prototype.envStrip = function (dst, pts, width, dy, rgb, skip) {
		const r = this.route;
		for (let k = 0; k < pts.length - 1; k++) {
			const [sa, da] = pts[k], [sb, db] = pts[k + 1];
			const L = Math.hypot(sb - sa, db - da);
			if (L < 0.05) continue;
			const ns = -(db - da) / L, nd = (sb - sa) / L; // prostopadła w (s, d)
			const pieces = Math.max(1, Math.ceil(L / 4)); // gęsto – teren między narożnikami nie przebija
			for (let q = 0; q < pieces; q++) {
				// odcinki łamanej zachodzą na siebie (bez szczelin na załamaniach)
				const ex = Math.min(0.6, width / 2) / L;
				const t0 = q / pieces - (q === 0 ? ex : 0), t1 = (q + 1) / pieces + (q === pieces - 1 ? ex : 0);
				const s0 = sa + (sb - sa) * t0, d0 = da + (db - da) * t0, s1 = sa + (sb - sa) * t1, d1 = da + (db - da) * t1;
				if (skip && skip((s0 + s1) / 2, (d0 + d1) / 2)) continue;
				const corner = (s, d, side) => {
					const ss = s + ns * side * width / 2, dd = d + nd * side * width / 2;
					R.sidePoint(r, ss, dd, tp);
					return [tp.x, this.surfY(ss, dd) + dy, tp.z];
				};
				const a = corner(s0, d0, -1), b = corner(s0, d0, 1), c2 = corner(s1, d1, 1), d2 = corner(s1, d1, -1);
				const up = ((c2[2] - a[2]) * (b[0] - a[0]) - (c2[0] - a[0]) * (b[2] - a[2])) < 0;
				const T3 = (x, y, z) => { dst.p.push(...x, ...y, ...z); for (let i = 0; i < 3; i++) dst.c.push(rgb.r, rgb.g, rgb.b); };
				if (up) { T3(a, b, c2); T3(a, c2, d2); } else { T3(a, c2, b); T3(a, d2, c2); }
			}
		}
	};

	// pod mostem toru z mapy (odcinek mostowy, do 3,5 m od jego osi)
	World.prototype.envUnderBridge = function (s, d) {
		for (const t of this.envTracksAt(s)) if ((t.side & 2) && Math.abs(t.d - d) < 3.5) return true;
		return false;
	};

	// pod przęsłem naszego mostu (drogi i cieki przechodzą tu pod torem)
	World.prototype.underBridge = function (s, d) {
		return Math.abs(d) < 17 && this.route.bridges.some((b) => { const sp = this.bridgeSpan ? this.bridgeSpan(b) : [b.from, b.to]; return s > sp[0] - 8 && s < sp[1] + 8; });
	};
	/* Łączniki pod mostami: drogi i cieki z mapy są ucinane przy torze (7,5 / 8 m od osi); przy moście końce po obu
	   stronach toru (przedłużone do osi w bliskim miejscu) łączymy odcinkiem pod przęsłem. */
	World.prototype.envUnderLinks = function (rows, off) {
		const out = [], ends = [];
		for (const row of rows || []) {
			const n = (row.length - off) / 2;
			if (n < 2) continue;
			const P = (q) => [row[off + q * 2], row[off + q * 2 + 1]];
			for (const [e, f] of [[0, 1], [n - 1, n - 2]]) {
				const [se, de] = P(e), [sf, df] = P(f);
				if (Math.abs(de) > 16 || Math.abs(df) <= Math.abs(de) || Math.abs(df - de) < 0.3) continue;
				const sc = se - (de * (sf - se)) / (df - de);
				// zasięg mostu z miejscem przecięcia obiektu pod spodem (dane mostu i drogi bywają przesunięte o kilka metrów)
				if (!this.route.bridges.some((b) => { const sp = this.bridgeSpan ? this.bridgeSpan(b) : [b.from, b.to]; return sc > sp[0] - 6 && sc < sp[1] + 6; })) continue;
				ends.push({ row, se, de, sc });
			}
		}
		// każdy koniec łączymy z najbliższym końcem po drugiej stronie toru (jezdnie rozdzielone z jednej strony – do
		// wspólnego końca); bez powtórzeń par
		const seen = new Set();
		ends.forEach((A, a) => {
			let best = -1, bd = 10;
			ends.forEach((B, b) => {
				if (Math.sign(B.de) === Math.sign(A.de) || B.row[0] !== A.row[0]) return;
				const dd = Math.abs(B.sc - A.sc);
				if (dd < bd) { bd = dd; best = b; }
			});
			if (best < 0) return;
			const key = Math.min(a, best) + ',' + Math.max(a, best);
			if (seen.has(key)) return;
			seen.add(key);
			const B = ends[best];
			out.push([A.row[0], A.se, A.de, B.se, B.de]);
		});
		return out;
	};

	/* Sieć ulic (raz na trasę). Drogi z mapy (env.r i łączniki pod mostami) → graf:
	   – węzły: końce dróg do 1,5 m od siebie – wspólny węzeł; koniec drogi przy odcinku innej (do 1,5 m) – węzeł wstawiony
	     w tę drogę (skrzyżowanie typu T); przecięcie dwóch dróg na tym samym poziomie (wysokości z pomiaru do 3 m) – węzeł
	     w obu (skrzyżowanie bez wspólnego końca, np. dwie ulice przechodzące przez skrzyżowanie); węzły na jednej drodze
	     bliżej niż 3 m – jeden węzeł;
	   – krawędzie między węzłami łączone w ciągi przez węzły stopnia 2 (przejście jednej ulicy w drugą): jedna łamana
	     z fazowaniem załamań (ukos na dwusiecznej – bez nakładania i szczelin), szerokość przechodzi płynnie;
	   – węzły stopnia 3+ to skrzyżowania: wloty posortowane kątowo; dla każdej pary sąsiednich wlotów przecięcie ich
	     krawędzi jezdni wyznacza narożnik – zaokrąglony łukiem (promień wg klasy drogi, styczne r / tg(θ/2)); wloty pod
	     ostrym kątem (do ok. 35°, zbieg jezdni) – klin bez łuku; wloty naprzeciw (ponad ok. 150°) – prosta krawędź;
	     wloty przycięte do początku łuku, płat skrzyżowania to wielokąt z końców wlotów i łuków, chodniki obiegają
	     narożnik łukiem z krawężnikiem. */
	const RAD_J = (ti) => (ti <= 4 ? 7 : ti <= 6 ? 5 : 3);
	// punkt ciągu ch na odcinku k w odległości t od początku, odsunięty o side · w/2 + extra (dodatnie – strona +d przy biegu wzdłuż s)
	const chPtK = (ch, k, t, side, extra) => {
		const L = ch.cum[k + 1] - ch.cum[k], f = L > 1e-9 ? Math.max(0, Math.min(1, (t - ch.cum[k]) / L)) : 0;
		const a = ch.pts[k], b = ch.pts[k + 1], ma = ch.m[k], mb = ch.m[k + 1];
		const oa = (side * ch.w[k]) / 2 + extra, ob = (side * ch.w[k + 1]) / 2 + extra;
		const xa = a[0] + ma[0] * oa, ya = a[1] + ma[1] * oa;
		return [xa + (b[0] + mb[0] * ob - xa) * f, ya + (b[1] + mb[1] * ob - ya) * f];
	};
	const chSeg = (ch, t) => { let k = 0; while (k < ch.pts.length - 2 && ch.cum[k + 1] < t) k++; return k; };
	const chPt = (ch, t, side, extra) => chPtK(ch, chSeg(ch, t), t, side, extra);
	// punkt wlotu A (koniec ciągu) w układzie wlotu: t od węzła, strona dodatnia – w stronę następnego wlotu (kątowo)
	const armPt = (A, t, side, extra) => (A.end ? chPt(A.ch, A.ch.L - t, -side, -extra) : chPt(A.ch, t, side, extra));

	World.prototype.envStreets = function () {
		const e = this.env;
		if (e.streets) return e.streets;
		const env = this.route.env;
		if (!e.roadLinks) e.roadLinks = this.envUnderLinks(env.r, 1);
		const rows = [], rInf = [], rZ = [];
		env.r.forEach((row, i) => {
			const p = [];
			for (let k = 1; k + 1 < row.length; k += 2) p.push([row[k], row[k + 1]]);
			rows.push(p);
			rInf.push(Object.assign({ ti: row[0] }, e.rInfo[i]));
			rZ.push(e.roadZ.get(row) || null);
		});
		// łączniki pod mostami – atrybuty drogi, którą łączą
		for (const lk of e.roadLinks) {
			const a = [lk[1], lk[2]], b = [lk[3], lk[4]], near = (x) => Math.hypot(x[0] - a[0], x[1] - a[1]) < 1 || Math.hypot(x[0] - b[0], x[1] - b[1]) < 1;
			const j = rows.findIndex((p, i) => rInf[i].ti === lk[0] && p.length > 1 && (near(p[0]) || near(p[p.length - 1])));
			rows.push([a, b]);
			rInf.push(j >= 0 ? rInf[j] : { ti: lk[0], w: ROAD_W[lk[0]] || 5, lanes: 2, surf: 0, sw: 0, one: 0 });
			rZ.push(null);
		}
		const rc = rows.map((p) => {
			const c = [0];
			for (let k = 1; k < p.length; k++) c.push(c[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
			return c;
		});
		const along = (i, pos) => { const k = Math.min(Math.floor(pos), rc[i].length - 2), f = pos - k; return rc[i][k] + (rc[i][k + 1] - rc[i][k]) * f; };
		const inner = (i, pos) => { const a = along(i, pos); return a > 1.5 && a < rc[i][rc[i].length - 1] - 1.5; };
		const zAt = (i, pos) => { const z = rZ[i]; if (!z || z.length < 2) return null; const k = Math.min(Math.floor(pos), z.length - 2); return z[k] + (z[k + 1] - z[k]) * (pos - k); };
		const sameLevel = (i, pi, j, pj) => { const a = zAt(i, pi), b = zAt(j, pj); return a === null || b === null || Math.abs(a - b) < 30; };

		// węzły (z sumowaniem zbiorów – węzły tego samego skrzyżowania łączone)
		const nodes = [], par = [], G = 6, nGrid = new Map();
		const find = (n) => { while (par[n] !== n) { par[n] = par[par[n]]; n = par[n]; } return n; };
		const union = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
		const nearNode = (s, d, tol) => {
			let best = -1, bd = tol;
			const a = Math.floor(s / G), b = Math.floor(d / G);
			for (let x = a - 1; x <= a + 1; x++) for (let y = b - 1; y <= b + 1; y++) for (const n of nGrid.get(x + ',' + y) || []) {
				const dd = Math.hypot(nodes[n][0] - s, nodes[n][1] - d);
				if (dd < bd) { bd = dd; best = n; }
			}
			return best;
		};
		const addNode = (s, d) => {
			const id = nodes.length, key = Math.floor(s / G) + ',' + Math.floor(d / G);
			nodes.push([s, d]);
			par.push(id);
			if (!nGrid.has(key)) nGrid.set(key, []);
			nGrid.get(key).push(id);
			return id;
		};
		const cuts = rows.map(() => []); // { pos (odcinek + ułamek), n }
		rows.forEach((p, i) => {
			if (p.length < 2) return;
			for (const pos of [0, p.length - 1]) {
				const q = p[pos], f = nearNode(q[0], q[1], 1.5);
				cuts[i].push({ pos, n: f >= 0 ? f : addNode(q[0], q[1]) });
			}
		});
		const touch = (j, pos, n) => {
			const a = along(j, pos);
			for (const c of cuts[j]) if (Math.abs(along(j, c.pos) - a) < 3) { union(c.n, n); return; }
			cuts[j].push({ pos, n });
		};
		const SG = 10, sGrid = new Map();
		rows.forEach((p, i) => {
			for (let k = 0; k + 1 < p.length; k++) {
				const [sa, da] = p[k], [sb, db] = p[k + 1];
				for (let a = Math.floor((Math.min(sa, sb) - 2) / SG); a <= Math.floor((Math.max(sa, sb) + 2) / SG); a++)
					for (let b = Math.floor((Math.min(da, db) - 2) / SG); b <= Math.floor((Math.max(da, db) + 2) / SG); b++) {
						const key = a + ',' + b;
						if (!sGrid.has(key)) sGrid.set(key, []);
						sGrid.get(key).push(i, k);
					}
			}
		});
		// koniec drogi przy odcinku innej – skrzyżowanie typu T
		rows.forEach((p, i) => {
			if (p.length < 2) return;
			for (const c of cuts[i].slice(0, 2)) {
				const q = p[c.pos], list = sGrid.get(Math.floor(q[0] / SG) + ',' + Math.floor(q[1] / SG)) || [];
				let best = null, bd = 1.5;
				for (let x = 0; x < list.length; x += 2) {
					const j = list[x], k = list[x + 1];
					if (j === i) continue;
					const [sa, da] = rows[j][k], [sb, db] = rows[j][k + 1], L2 = (sb - sa) ** 2 + (db - da) ** 2;
					if (L2 < 1e-6) continue;
					const t = Math.max(0, Math.min(1, ((q[0] - sa) * (sb - sa) + (q[1] - da) * (db - da)) / L2));
					const dd = Math.hypot(sa + (sb - sa) * t - q[0], da + (db - da) * t - q[1]);
					if (dd < bd && inner(j, k + t) && sameLevel(i, c.pos, j, k + t)) { bd = dd; best = [j, k + t]; }
				}
				if (best) touch(best[0], best[1], c.n);
			}
		});
		// przecięcia dróg bez wspólnego końca
		const seen = new Set();
		for (const list of sGrid.values()) for (let x = 0; x < list.length; x += 2) for (let y = x + 2; y < list.length; y += 2) {
			const i = list[x], k = list[x + 1], j = list[y], l = list[y + 1];
			if (i === j) continue;
			const key = i < j ? i + ',' + k + ',' + j + ',' + l : j + ',' + l + ',' + i + ',' + k;
			if (seen.has(key)) continue;
			seen.add(key);
			const [x1, y1] = rows[i][k], [x2, y2] = rows[i][k + 1], [x3, y3] = rows[j][l], [x4, y4] = rows[j][l + 1];
			const den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
			if (Math.abs(den) < 1e-9) continue;
			const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den;
			if (t < 0 || t > 1 || u < 0 || u > 1 || !inner(i, k + t) || !inner(j, l + u) || !sameLevel(i, k + t, j, l + u)) continue;
			const n = addNode(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
			touch(i, k + t, n);
			touch(j, l + u, n);
		}
		// położenie węzła: średnia połączonych
		const acc = new Map();
		nodes.forEach((p, n) => { const r = find(n), a = acc.get(r) || [0, 0, 0]; a[0] += p[0]; a[1] += p[1]; a[2]++; acc.set(r, a); });
		const NP = new Map();
		for (const [r, a] of acc) NP.set(r, [a[0] / a[2], a[1] / a[2]]);

		// krawędzie między węzłami
		const edges = [];
		rows.forEach((p, i) => {
			if (p.length < 2) return;
			const cs = cuts[i].map((c) => ({ pos: c.pos, n: find(c.n) })).sort((a, b) => a.pos - b.pos);
			for (let q = 0; q + 1 < cs.length; q++) {
				const A = cs[q], B = cs[q + 1];
				if (B.pos - A.pos < 1e-6) continue;
				const pa = NP.get(A.n), pb = NP.get(B.n), pts = [pa];
				for (let v = Math.floor(A.pos) + 1; v < B.pos; v++) {
					const pv = p[v], last = pts[pts.length - 1];
					if (Math.hypot(pv[0] - last[0], pv[1] - last[1]) > 0.3 && Math.hypot(pv[0] - pb[0], pv[1] - pb[1]) > 0.3) pts.push(pv);
				}
				pts.push(pb);
				let L = 0;
				for (let v = 1; v < pts.length; v++) L += Math.hypot(pts[v][0] - pts[v - 1][0], pts[v][1] - pts[v - 1][1]);
				if (L < 0.5 || (A.n === B.n && L < 6)) continue;
				edges.push({ pts, inf: rInf[i], a: A.n, b: B.n });
			}
		});
		const ends = new Map();
		edges.forEach((ed, x) => {
			for (const [n, end] of [[ed.a, 0], [ed.b, 1]]) { if (!ends.has(n)) ends.set(n, []); ends.get(n).push([x, end]); }
		});

		// ciągi przez węzły stopnia 2
		const mkChain = (pts0, seg0, na, nb) => {
			const pts = [pts0[0]], seg = [];
			for (let k = 1; k < pts0.length; k++) {
				const q = pts[pts.length - 1];
				if (Math.hypot(pts0[k][0] - q[0], pts0[k][1] - q[1]) < 0.05 && k < pts0.length - 1) continue;
				if (Math.hypot(pts0[k][0] - q[0], pts0[k][1] - q[1]) < 0.05) { pts[pts.length - 1] = pts0[k]; continue; }
				pts.push(pts0[k]);
				seg.push(seg0[k - 1]);
			}
			if (pts.length < 2) return null;
			/* uskoki: krótki odcinek (do 3 m) w poprzek, między dwoma prawie równoległymi (styk odcinków dróg z danych
			   przesuniętych o metr–dwa) – zamieniony na punkt w jego środku */
			const dir = (k) => { const L = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); return [(pts[k + 1][0] - pts[k][0]) / L, (pts[k + 1][1] - pts[k][1]) / L, L]; };
			for (let k = 1; k + 2 < pts.length; k++) {
				const a = dir(k - 1), b = dir(k), c = dir(k + 1);
				if (b[2] > 3 || a[0] * c[0] + a[1] * c[1] < 0.85 || a[0] * b[0] + a[1] * b[1] > 0.7 || b[0] * c[0] + b[1] * c[1] > 0.7) continue;
				pts.splice(k, 2, [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2]);
				seg.splice(k, 1);
				k = Math.max(0, k - 2);
			}
			const n = pts.length, cum = [0];
			for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
			const nr = seg.map((_, k) => { const L = cum[k + 1] - cum[k]; return [-(pts[k + 1][1] - pts[k][1]) / L, (pts[k + 1][0] - pts[k][0]) / L]; });
			// fazowanie: wektor odsunięcia na dwusiecznej, wydłużony 1 / cos (najwyżej 2×)
			const m = pts.map((_, k) => {
				const a = nr[Math.max(0, k - 1)], b = nr[Math.min(n - 2, k)];
				let x = a[0] + b[0], y = a[1] + b[1];
				const l = Math.hypot(x, y);
				if (l < 1e-6) return a;
				x /= l;
				y /= l;
				const c = Math.max(0.5, x * a[0] + y * a[1]);
				return [x / c, y / c];
			});
			const w = pts.map((_, k) => (seg[Math.max(0, k - 1)].inf.w + seg[Math.min(n - 2, k)].inf.w) / 2);
			// chodniki po stronach ciągu: [+, −] (sidewalk OSM: 1 – lewa, 2 – prawa strona względem kierunku drogi; +d – prawa)
			const sw = seg.map((g) => { const v = g.inf.sw; return [!!(g.flip ? v & 1 : v & 2), !!(g.flip ? v & 2 : v & 1)]; });
			return { pts, seg, cum, L: cum[n - 1], m, w, sw, na, nb, trim: [{ t: 0, p: 0, n: 0 }, { t: 0, p: 0, n: 0 }] };
		};
		const used = new Uint8Array(edges.length), chains = [];
		for (let x = 0; x < edges.length; x++) {
			if (used[x]) continue;
			used[x] = 1;
			let pts = edges[x].pts.slice(), seg = edges[x].pts.slice(1).map(() => ({ inf: edges[x].inf, flip: false }));
			let na = edges[x].a, nb = edges[x].b;
			for (;;) {
				const L = ends.get(nb);
				if (L.length !== 2 || nb === na) break;
				const o = L.find(([y]) => !used[y]);
				if (!o) break;
				const [y, end] = o, ed = edges[y], flip = end === 1, ep = flip ? ed.pts.slice().reverse() : ed.pts;
				used[y] = 1;
				pts = pts.concat(ep.slice(1));
				seg = seg.concat(ep.slice(1).map(() => ({ inf: ed.inf, flip })));
				nb = flip ? ed.a : ed.b;
			}
			for (;;) {
				const L = ends.get(na);
				if (L.length !== 2 || na === nb) break;
				const o = L.find(([y]) => !used[y]);
				if (!o) break;
				const [y, end] = o, ed = edges[y], flip = end === 0, ep = flip ? ed.pts.slice().reverse() : ed.pts;
				used[y] = 1;
				pts = ep.slice(0, -1).concat(pts);
				seg = ep.slice(1).map(() => ({ inf: ed.inf, flip })).concat(seg);
				na = flip ? ed.b : ed.a;
			}
			const ch = mkChain(pts, seg, na, nb);
			if (ch) chains.push(ch);
		}

		// skrzyżowania
		const armsAt = new Map();
		for (const ch of chains) for (const end of [0, 1]) {
			const n = end ? ch.nb : ch.na;
			if (!armsAt.has(n)) armsAt.set(n, []);
			armsAt.get(n).push({ ch, end });
		}
		// przecięcie krawędzi + wlotu A z krawędzią − wlotu B (odsuniętych o dl dalej od osi): t na obu i punkt
		const cross = (N, A, B, dl) => {
			const lA = [-A.u[1], A.u[0]], lB = [-B.u[1], B.u[0]], hA = A.h + dl, hB = B.h + dl;
			const rx = -lB[0] * hB - lA[0] * hA, ry = -lB[1] * hB - lA[1] * hA;
			const det = -A.u[0] * B.u[1] + B.u[0] * A.u[1];
			if (Math.abs(det) < 1e-6) return null;
			const t = (-rx * B.u[1] + B.u[0] * ry) / det, t2 = (A.u[0] * ry - A.u[1] * rx) / det;
			return { tA: t, tB: t2, p: [N[0] + A.u[0] * t + lA[0] * hA, N[1] + A.u[1] * t + lA[1] * hA] };
		};
		const cornerPts = (N, c, dl) => {
			const g = c.type === 'gore', a = armPt(c.A, g ? c.A.t : c.A.sP, 1, dl), b = armPt(c.B, g ? c.B.t : c.B.sN, -1, -dl);
			const P = c.type === 'arc' ? cross(N, c.A, c.B, dl) : null;
			const out = [];
			for (let q = 0; q <= 8; q++) {
				const t = q / 8, u = 1 - t;
				out.push(P ? [u * u * a[0] + 2 * u * t * P.p[0] + t * t * b[0], u * u * a[1] + 2 * u * t * P.p[1] + t * t * b[1]] : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
			}
			return out;
		};
		const juncs = [];
		for (const [n, arms] of armsAt) {
			if (arms.length < 3) continue;
			const N = NP.get(n);
			for (const A of arms) {
				const ch = A.ch, k = A.end ? ch.seg.length - 1 : 0, g = ch.seg[k];
				const dist = Math.min(6, ch.L * 0.5), P = chPt(ch, A.end ? ch.L - dist : dist, 0, 0);
				const us = P[0] - N[0], ud = P[1] - N[1], l = Math.hypot(us, ud) || 1;
				A.u = [us / l, ud / l];
				A.ang = Math.atan2(A.u[1], A.u[0]);
				A.h = (A.end ? ch.w[ch.w.length - 1] : ch.w[0]) / 2;
				A.inf = g.inf;
				A.swP = A.end ? ch.sw[k][1] : ch.sw[k][0];
				A.swN = A.end ? ch.sw[k][0] : ch.sw[k][1];
				// jednokierunkowa: wlot, gdy ruch płynie do węzła
				A.inc = !g.inf.one || (A.end === 1) !== g.flip;
				const other = armsAt.get(A.end ? ch.na : ch.nb);
				A.max = Math.min(25, ch.L * (ch.na === ch.nb || other.length >= 3 ? 0.48 : 0.9));
				A.tP = 0;
				A.tN = 0;
			}
			arms.sort((a, b) => a.ang - b.ang);
			const corners = [];
			for (let a = 0; a < arms.length; a++) {
				const A = arms[a], B = arms[(a + 1) % arms.length];
				let th = B.ang - A.ang;
				if (th <= 1e-6) th += Math.PI * 2;
				const c = { A, B, type: 'line' };
				const P = th < 2.6 ? cross(N, A, B, 0) : null;
				if (P && (th < 0.6 || P.tA > 14 || P.tB > 14)) {
					/* zbieg pod ostrym kątem (rozwidlenie, dwie jezdnie w jedną): jezdnie dochodzą do węzła i przy nim na siebie
					   zachodzą; chodniki i oznakowanie od miejsca, w którym się rozchodzą (przecięcie zewnętrznych krawędzi
					   chodników) */
					const P2 = cross(N, A, B, 2.3) || P;
					c.type = 'gore';
					c.tA = Math.max(0, P2.tA);
					c.tB = Math.max(0, P2.tB);
				} else if (P) {
					const r = Math.min(RAD_J(A.inf.ti), RAD_J(B.inf.ti)), Lt = Math.min(10, r / Math.tan(th / 2));
					c.type = 'arc';
					c.tA = Math.max(0, P.tA + Lt);
					c.tB = Math.max(0, P.tB + Lt);
					A.tP = Math.max(A.tP, c.tA);
					B.tN = Math.max(B.tN, c.tB);
				}
				corners.push(c);
			}
			for (const A of arms) {
				A.t = Math.min(A.max, Math.max(A.tP, A.tN, 0.5));
				A.sP = A.sN = A.t;
			}
			for (const c of corners) {
				if (c.type === 'arc') { c.A.sP = Math.min(c.tA, c.A.t); c.B.sN = Math.min(c.tB, c.B.t); }
				// klin: strony od rozejścia (dalej niż koniec wlotu), najwyżej do połowy ciągu
				if (c.type === 'gore') { c.A.sP = Math.max(c.A.t, Math.min(c.tA, c.A.ch.L * 0.48)); c.B.sN = Math.max(c.B.t, Math.min(c.tB, c.B.ch.L * 0.48)); }
			}
			for (const A of arms) A.ch.trim[A.end] = { t: A.t, p: A.sP, n: A.sN };
			// płat: końce wlotów i narożniki
			const ring = [];
			const push = (p) => { const q = ring[ring.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.05) ring.push(p); };
			for (const c of corners) {
				push(armPt(c.A, c.A.t, -1, 0));
				push(armPt(c.A, c.A.t, 1, 0));
				for (const p of cornerPts(N, c, 0)) push(p);
				c.sw = c.type !== 'gore' && c.A.swP && c.B.swN;
				if (c.sw) c.cv = [cornerPts(N, c, 0), cornerPts(N, c, 0.16), cornerPts(N, c, 2.16)];
			}
			const tiMin = Math.min(...arms.map((A) => A.inf.ti)), main = arms.find((A) => A.inf.ti === tiMin);
			for (const A of arms) A.minor = A.inf.ti > tiMin && A.inc;
			juncs.push({ s: N[0], d: N[1], ring, corners, arms, ti: tiMin, surf: main.inf.surf, rad: Math.max(...arms.map((A) => A.t + A.h + (A.swP || A.swN ? 2.3 : 0.5))) });
		}
		const chByChunk = new Map(), jByChunk = new Map();
		const put = (map, c, v) => { if (!map.has(c)) map.set(c, []); map.get(c).push(v); };
		for (const ch of chains) for (let k = 0; k + 1 < ch.pts.length; k++) put(chByChunk, Math.floor((ch.pts[k][0] + ch.pts[k + 1][0]) / 2 / C), { ch, k });
		for (const J of juncs) put(jByChunk, Math.floor(J.s / C), J);
		/* przejścia dla pieszych (zebry): na najbliższym ciągu ulicy (do 6 m), poza płatem skrzyżowania – przesunięte na
		   wlot tuż za nim; przejścia bliżej niż 6 m (dwa węzły tego samego przejścia) – jedno; ch.zeb – miejsca na ciągu
		   (oznakowanie je omija) */
		const zByChunk = new Map(), zAll = [];
		for (const x of env.rx || []) {
			const [sx, dx] = x, c0 = Math.floor(sx / C);
			let best = null, bd = 6;
			for (const cc of [c0 - 1, c0, c0 + 1]) for (const { ch, k } of chByChunk.get(cc) || []) {
				const [sa, da] = ch.pts[k], [sb, db] = ch.pts[k + 1], L = ch.cum[k + 1] - ch.cum[k];
				const t = Math.max(0, Math.min(1, ((sx - sa) * (sb - sa) + (dx - da) * (db - da)) / (L * L)));
				const dd = Math.hypot(sa + (sb - sa) * t - sx, da + (db - da) * t - dx);
				if (dd < bd) { bd = dd; best = { ch, t: ch.cum[k] + t * L }; }
			}
			if (!best) continue;
			const { ch } = best, lo = ch.trim[0].t + (ch.trim[0].t > 0 ? 2.6 : 2.2), hi = ch.L - ch.trim[1].t - (ch.trim[1].t > 0 ? 2.6 : 2.2);
			if (hi < lo) continue;
			const t = Math.max(lo, Math.min(hi, best.t)), pc = chPt(ch, t, 0, 0);
			if (ch.seg[chSeg(ch, t)].inf.surf === 3 || zAll.some((z) => Math.hypot(z[0] - pc[0], z[1] - pc[1]) < 6)) continue;
			zAll.push(pc);
			(ch.zeb || (ch.zeb = [])).push(t);
			put(zByChunk, Math.floor(pc[0] / C), { ch, t });
		}
		e.streets = { chains, juncs, chByChunk, jByChunk, zByChunk };
		return e.streets;
	};

	const SURF_C = [null, '#5e5a55', '#8b8780', '#857659']; // kostka kamienna, kostka betonowa / płyty, gruntowa
	// zaparkowane auto (przód = +z, ok. 4,2 m): nadwozie i dach w kolorze instancji, szyby, koła, światła
	const CAR_C = ['#b8282a', '#2e6fb1', '#e0b22a', '#ecf0f1', '#2c8a4f', '#7f8c8d', '#1d2a38', '#5b2d6e', '#d0d3d6', '#3b3f44'];
	let parkMat = null;
	const parkCarMat = () => {
		if (!parkMat) {
			parkMat = patch(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }), 'lit');
			parkMat.userData.shared = true;
		}
		return parkMat;
	};

	World.prototype.buildEnvRoads = function (group, segs, M) {
		if (segs.c0 === undefined) return;
		const e = this.env, r = this.route, st = this.envStreets(), ci = Math.floor(segs.c0 / C);
		const dst = { p: [], c: [] }, mk = { p: [], c: [] };
		const skip = (s, d) => (Math.abs(d) < 7.5 && !this.underBridge(s, d)) || this.envStationZone(s, d) || this.route.crossings.some((x) => Math.abs(s - x.pos) < 12 && Math.abs(d) < 40);
		const white = col.set('#e9e7e0').clone(), side = col.set('#a7a49d').clone(), curb = col.set('#c9c6be').clone();
		// wysokość nawierzchni z pamięcią (te same punkty liczone wielokrotnie przez podział trójkątów)
		const SY = new Map();
		const sY = (s, d) => {
			const key = Math.round(s * 50) * 1e6 + Math.round(d * 50);
			let y = SY.get(key);
			if (y === undefined) { y = this.surfY(s, d); SY.set(key, y); }
			return y;
		};
		const W = (p, dy) => { R.sidePoint(r, p[0], p[1], tp); return [tp.x, sY(p[0], p[1]) + dy, tp.z]; };
		// trójkąt zwrócony w górę
		const tri = (d0, a, b, c, rgb) => {
			if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0) d0.p.push(...a, ...b, ...c);
			else d0.p.push(...a, ...c, ...b);
			for (let q = 0; q < 3; q++) d0.c.push(rgb.r, rgb.g, rgb.b);
		};
		/* trójkąt w (s, d) dzielony na cztery, dopóki teren w połowie boków odbiega od płaszczyzny trójkąta
		   (siatka terenu ma załamania co kilka–kilkadziesiąt metrów; duży trójkąt jezdni zapadał się pod nie) */
		const triS = (d0, A, B, Cq, dy, rgb, lvl = 0) => {
			if (lvl < 3) {
				const ab = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], bc = [(B[0] + Cq[0]) / 2, (B[1] + Cq[1]) / 2], ca = [(Cq[0] + A[0]) / 2, (Cq[1] + A[1]) / 2];
				const L = Math.max(Math.hypot(B[0] - A[0], B[1] - A[1]), Math.hypot(Cq[0] - B[0], Cq[1] - B[1]), Math.hypot(A[0] - Cq[0], A[1] - Cq[1]));
				if (L > 2.5) {
					const yA = sY(A[0], A[1]), yB = sY(B[0], B[1]), yC = sY(Cq[0], Cq[1]);
					const off = Math.max(Math.abs(sY(ab[0], ab[1]) - (yA + yB) / 2), Math.abs(sY(bc[0], bc[1]) - (yB + yC) / 2), Math.abs(sY(ca[0], ca[1]) - (yC + yA) / 2));
					if (off > 0.03) {
						triS(d0, A, ab, ca, dy, rgb, lvl + 1); triS(d0, ab, B, bc, dy, rgb, lvl + 1);
						triS(d0, ca, bc, Cq, dy, rgb, lvl + 1); triS(d0, ab, bc, ca, dy, rgb, lvl + 1);
						return;
					}
				}
			}
			tri(d0, W(A, dy), W(B, dy), W(Cq, dy), rgb);
		};
		const quad = (d0, A, B, Cq, D, dy, rgb) => {
			if (skip((A[0] + Cq[0]) / 2, (A[1] + Cq[1]) / 2)) return;
			triS(d0, A, B, Cq, dy, rgb);
			triS(d0, A, Cq, D, dy, rgb);
		};
		// pas wzdłuż odcinka k ciągu między odsunięciami (sa·w/2 + ea) i (sb·w/2 + eb), w zakresie [ta, tb], kawałki do 4 m
		const band = (d0, ch, k, ta, tb, sa, ea, sb, eb, dy, rgb) => {
			ta = Math.max(ta, ch.cum[k]);
			tb = Math.min(tb, ch.cum[k + 1]);
			if (tb - ta < 0.02) return;
			const n = Math.max(1, Math.ceil((tb - ta) / 4));
			// kawałek dzielony, dopóki teren między jego końcami nie jest prawie płaski (załamania, strome zjazdy)
			const piece = (t0, t1, lvl) => {
				if (lvl < 3 && t1 - t0 > 0.6) {
					const y0 = sY(...chPtK(ch, k, t0, (sa + sb) / 2, (ea + eb) / 2)), y1 = sY(...chPtK(ch, k, t1, (sa + sb) / 2, (ea + eb) / 2)), tm = (t0 + t1) / 2;
					if (Math.abs(sY(...chPtK(ch, k, tm, (sa + sb) / 2, (ea + eb) / 2)) - (y0 + y1) / 2) > 0.04) { piece(t0, tm, lvl + 1); piece(tm, t1, lvl + 1); return; }
				}
				quad(d0, chPtK(ch, k, t0, sa, ea), chPtK(ch, k, t0, sb, eb), chPtK(ch, k, t1, sb, eb), chPtK(ch, k, t1, sa, ea), dy, rgb);
			};
			for (let q = 0; q < n; q++) piece(ta + ((tb - ta) * q) / n, ta + ((tb - ta) * (q + 1)) / n, 0);
		};
		// pas między dwiema łamanymi o tej samej liczbie punktów (narożniki skrzyżowań)
		const ribbon2 = (d0, A, B, dy, rgb) => { for (let q = 0; q + 1 < A.length; q++) quad(d0, A[q], B[q], B[q + 1], A[q + 1], dy, rgb); };
		// krawężnik: pionowa ściana od jezdni do chodnika wzdłuż łamanej
		const wall = (d0, P) => {
			for (let q = 0; q + 1 < P.length; q++) {
				const p0 = P[q], p1 = P[q + 1];
				if (skip((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)) continue;
				const a0 = W(p0, 0.06), a1 = W(p0, 0.19), b0 = W(p1, 0.06), b1 = W(p1, 0.19);
				for (const [x, y, z] of [[a0, b0, b1], [a0, b1, a1], [a0, b1, b0], [a0, a1, b1]]) { d0.p.push(...x, ...y, ...z); for (let k = 0; k < 3; k++) d0.c.push(curb.r, curb.g, curb.b); }
			}
		};
		const sample = (ch, k, ta, tb, sg) => {
			ta = Math.max(ta, ch.cum[k]);
			tb = Math.min(tb, ch.cum[k + 1]);
			if (tb - ta < 0.02) return [];
			const n = Math.max(1, Math.ceil((tb - ta) / 4)), out = [];
			for (let q = 0; q <= n; q++) out.push(chPtK(ch, k, ta + ((tb - ta) * q) / n, sg, 0));
			return out;
		};
		const roadDy = (ti) => 0.1 + (10 - ti) * 0.003;

		// ciągi ulic: jezdnia, chodniki z krawężnikiem, oznakowanie (od końców przyciętych na skrzyżowaniach)
		for (const { ch, k } of st.chByChunk.get(ci) || []) {
			const f = ch.seg[k].inf, ti = f.ti, dy = roadDy(ti), T0 = ch.trim[0], T1 = ch.trim[1];
			const t0 = T0.t, t1 = ch.L - T1.t;
			band(dst, ch, k, t0, t1, -1, 0, 1, 0, dy, col.set(SURF_C[f.surf] || ROAD_C[ti] || '#46494c').clone());
			const [swP, swN] = ch.sw[k];
			for (const [on, sg, a0, a1] of [[swP, 1, T0.p, ch.L - T1.n], [swN, -1, T0.n, ch.L - T1.p]]) {
				if (!on) continue;
				band(dst, ch, k, a0, a1, sg, 0, sg, sg * 0.16, 0.19, curb);
				band(dst, ch, k, a0, a1, sg, sg * 0.16, sg, sg * 2.16, 0.17, side);
				wall(dst, sample(ch, k, a0, a1, sg));
			}
			if (f.surf === 0 && ti <= 6 && Math.min(ch.w[k], ch.w[k + 1]) >= 5) {
				const lo = Math.max(T0.t, T0.p, T0.n) + (T0.t > 0 ? 1 : 0), hi = ch.L - Math.max(T1.t, T1.p, T1.n) - (T1.t > 0 ? 1 : 0);
				const line = (sg, ex, ta, tb) => {
					let parts = [[ta, tb]];
					for (const z of ch.zeb || []) parts = parts.flatMap(([a, b]) => (b <= z - 2.4 || a >= z + 2.4 ? [[a, b]] : [[a, z - 2.4], [z + 2.4, b]].filter(([x, y]) => y > x)));
					for (const [a, b] of parts) band(mk, ch, k, a, b, sg, ex - 0.06, sg, ex + 0.06, dy + 0.02, white);
				};
				// przerywana 3 m / 3 m, faza wzdłuż całego ciągu
				const dash = (sg, ex) => {
					const a = Math.max(lo, ch.cum[k]), b = Math.min(hi, ch.cum[k + 1]);
					for (let x = Math.floor(a / 6) * 6; x < b; x += 6) line(sg, ex, Math.max(a, x), Math.min(b, x + 3));
				};
				const solid = (sg, ex) => line(sg, ex, lo, hi);
				if (!f.one) {
					if (f.lanes >= 4) { solid(0, -0.12); solid(0, 0.12); dash(-0.5, 0); dash(0.5, 0); }
					else dash(0, 0);
				} else for (let l = 1; l < f.lanes; l++) dash(-1 + (2 * l) / f.lanes, 0);
				// krawędziowe na drogach zbiorczych i ważniejszych poza zabudową
				if (ti <= 4 && !swP && !swN) { solid(-1, 0.3); solid(1, -0.3); }
			}
		}
		// skrzyżowania: płat, chodniki wokół narożników, linie warunkowego zatrzymania na wlotach podporządkowanych
		for (const J of st.jByChunk.get(ci) || []) {
			const dy = roadDy(J.ti), rgb = col.set(SURF_C[J.surf] || ROAD_C[J.ti] || '#46494c').clone(), N = [J.s, J.d];
			const ring = [];
			J.ring.forEach((p, q) => {
				const b = J.ring[(q + 1) % J.ring.length], L = Math.hypot(b[0] - p[0], b[1] - p[1]), n = Math.max(1, Math.ceil(L / 4));
				for (let x = 0; x < n; x++) ring.push([p[0] + ((b[0] - p[0]) * x) / n, p[1] + ((b[1] - p[1]) * x) / n]);
			});
			const mid = (p) => [(N[0] + p[0]) / 2, (N[1] + p[1]) / 2];
			let sgn = 0, star = true;
			for (let q = 0; q < ring.length && star; q++) {
				const b0 = ring[q], b1 = ring[(q + 1) % ring.length], cr = (b0[0] - N[0]) * (b1[1] - N[1]) - (b0[1] - N[1]) * (b1[0] - N[0]);
				if (Math.abs(cr) < 1e-6) continue;
				if (!sgn) sgn = Math.sign(cr);
				else if (Math.sign(cr) !== sgn) star = false;
			}
			if (!star) {
				for (const [a1, b1, c1] of T.ShapeUtils.triangulateShape(ring.map((p) => new T.Vector2(p[0], p[1])), [])) triS(dst, ring[a1], ring[b1], ring[c1], dy, rgb);
			} else for (let q = 0; q < ring.length; q++) {
				const b0 = ring[q], b1 = ring[(q + 1) % ring.length], m0 = mid(b0), m1 = mid(b1);
				if (skip((b0[0] + b1[0] + N[0]) / 3, (b0[1] + b1[1] + N[1]) / 3)) continue;
				triS(dst, N, m0, m1, dy, rgb);
				triS(dst, m0, b0, b1, dy, rgb);
				triS(dst, m0, b1, m1, dy, rgb);
			}
			for (const c of J.corners) if (c.cv) {
				ribbon2(dst, c.cv[0], c.cv[1], 0.19, curb);
				ribbon2(dst, c.cv[1], c.cv[2], 0.17, side);
				wall(dst, c.cv[0]);
			}
			for (const A of J.arms) {
				const f = A.inf;
				if (!A.minor || f.surf || f.ti > 6 || A.h * 2 < 5) continue;
				const ch = A.ch, h = A.h, top = f.one ? h : 0, t = A.t + 0.5;
				const ta = A.end ? ch.L - t - 0.3 : t, k = chSeg(ch, ta + 0.15);
				for (let o = 0.2; o < top + h - 0.3; o += 0.9) {
					// pas dojazdowy – strona ujemna wlotu (prawa strona jadącego do skrzyżowania)
					const e1 = top - o - 0.5, e2 = top - o;
					if (A.end) band(mk, ch, k, ta, ta + 0.3, 0, -e2, 0, -e1, roadDy(f.ti) + 0.02, white);
					else band(mk, ch, k, ta, ta + 0.3, 0, e1, 0, e2, roadDy(f.ti) + 0.02, white);
				}
			}
		}
		// przejścia dla pieszych (zebry): pasy 0,5 m co 1 m w poprzek jezdni, 4 m wzdłuż (po łuku ciągu)
		for (const { ch, t } of st.zByChunk.get(ci) || []) {
			const k0 = chSeg(ch, t), w = ch.w[k0], dy = roadDy(ch.seg[k0].inf.ti) + 0.022;
			for (let k = chSeg(ch, t - 2); k <= chSeg(ch, t + 2); k++)
				for (let o = -w / 2 + 0.5; o <= w / 2 - 0.4; o += 1.0) band(mk, ch, k, t - 2, t + 2, 0, o - 0.25, 0, o + 0.25, dy, white);
		}
		/* Parkingi i place. Nawierzchnia: obrys podzielony na trójkąty o bokach do 4 m (po terenie, bez przebić); krawężnik
		   wzdłuż obrysu poza bokami przy ulicy (wjazd). Parking – układ miejsc wzdłuż najdłuższego boku: rzędy miejsc
		   prostopadłych 2,5 × 5 m z alejkami 6 m (rząd, alejka, rząd, rząd plecami, alejka…), na wąskich (do 4,5 m, przy
		   ulicy) – równoległe po 6 m; miejsce tylko w całości w obrysie, poza budynkami; linie między miejscami, na części
		   miejsc zaparkowane auta (instancje). */
		const cars = [];
		for (const row of e.pkByChunk.get(ci) || []) {
			const n = (row.length - 1) / 2, kind = row[0];
			let pts = [];
			for (let k = 0; k < n; k++) pts.push([row[1 + k * 2], row[2 + k * 2]]);
			let area = 0;
			for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
			if (area < 0) pts = pts.reverse(); // przeciwnie do ruchu wskazówek w (s, d): wnętrze po lewej boków
			const rgb = col.set(kind === 0 ? '#4a4d50' : '#a8a49c').clone(), dyP = 0.075;
			// nawierzchnia: trójkąty dzielone po najdłuższym boku do 4 m
			const split = (a, b, c, lvl) => {
				const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]), L = Math.max(ab, bc, ca);
				if (L <= 4 || lvl > 9) {
					if (!skip((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)) tri(dst, W(a, dyP), W(b, dyP), W(c, dyP), rgb);
					return;
				}
				const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
				if (L === ab) { const x = m(a, b); split(a, x, c, lvl + 1); split(x, b, c, lvl + 1); }
				else if (L === bc) { const x = m(b, c); split(a, b, x, lvl + 1); split(a, x, c, lvl + 1); }
				else { const x = m(c, a); split(a, b, x, lvl + 1); split(x, b, c, lvl + 1); }
			};
			for (const [a1, b1, c1] of T.ShapeUtils.triangulateShape(pts.map((p) => new T.Vector2(p[0], p[1])), [])) split(pts[a1], pts[b1], pts[c1], 0);
			// krawężnik wzdłuż boków (do środka 0,2 m), bez boków przy jezdni
			const nearRoad = (s, d) => {
				for (const cc of [ci - 1, ci, ci + 1]) for (const { k, row: rr, i } of e.rByChunk.get(cc) || []) {
					const sa = rr[1 + k * 2], da = rr[2 + k * 2], sb = rr[3 + k * 2], db = rr[4 + k * 2], L2 = (sb - sa) ** 2 + (db - da) ** 2 || 1e-9;
					const t = Math.max(0, Math.min(1, ((s - sa) * (sb - sa) + (d - da) * (db - da)) / L2));
					if (Math.hypot(sa + (sb - sa) * t - s, da + (db - da) * t - d) < e.rInfo[i].w / 2 + 2.6) return true;
				}
				return false;
			};
			for (let k = 0; k < n; k++) {
				const a = pts[k], b = pts[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
				if (L < 0.5) continue;
				const nv = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; // do wnętrza
				const m = Math.max(1, Math.ceil(L / 4));
				for (let q = 0; q < m; q++) {
					const p0 = [a[0] + ((b[0] - a[0]) * q) / m, a[1] + ((b[1] - a[1]) * q) / m], p1 = [a[0] + ((b[0] - a[0]) * (q + 1)) / m, a[1] + ((b[1] - a[1]) * (q + 1)) / m];
					if (nearRoad((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)) continue;
					const i0 = [p0[0] + nv[0] * 0.2, p0[1] + nv[1] * 0.2], i1 = [p1[0] + nv[0] * 0.2, p1[1] + nv[1] * 0.2];
					quad(dst, p0, i0, i1, p1, 0.2, curb);
					wall(dst, [i0, i1]);
				}
			}
			if (kind !== 0 || n < 3) continue;
			// układ miejsc: oś u wzdłuż najdłuższego boku, v do wnętrza
			let kb = 0, Lb = 0;
			for (let k = 0; k < n; k++) { const L = Math.hypot(pts[(k + 1) % n][0] - pts[k][0], pts[(k + 1) % n][1] - pts[k][1]); if (L > Lb) { Lb = L; kb = k; } }
			const o = pts[kb], u = [(pts[(kb + 1) % n][0] - o[0]) / Lb, (pts[(kb + 1) % n][1] - o[1]) / Lb], v = [-u[1], u[0]];
			let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
			for (const p of pts) {
				const pu = (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1], pv = (p[0] - o[0]) * v[0] + (p[1] - o[1]) * v[1];
				u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv);
			}
			const P = (pu, pv) => [o[0] + u[0] * pu + v[0] * pv, o[1] + u[1] * pu + v[1] * pv];
			const inside = (p) => {
				let c = false;
				for (let k = 0, j = n - 1; k < n; j = k++) {
					const [xi, yi] = pts[k], [xj, yj] = pts[j];
					if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
				}
				return c;
			};
			const ok = (a0, a1, b0, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1], [(a0 + a1) / 2, (b0 + b1) / 2]].every(([pu, pv]) => { const p = P(pu, pv); return inside(p) && !this.inBuilding(p[0], p[1]) && !skip(p[0], p[1]); });
			const Wd = v1 - v0, rows2 = []; // [v od, v do, długość miejsca wzdłuż u, prostopadłe]
			if (Wd < 4.5) rows2.push([v0 + 0.2, v0 + 2.4, 6, false]);
			else for (let vv = v0 + 0.3; vv + 5 <= v1 - 0.2; vv += 16) {
				rows2.push([vv, vv + 5, 2.5, true]);
				if (vv + 16 <= v1 - 0.2) rows2.push([vv + 11, vv + 16, 2.5, true]);
			}
			const line = (pa, pb) => this.envStrip(mk, [pa, pb], 0.12, 0.1, white, skip);
			for (const [a, b, len, perp] of rows2) {
				for (let pu = u0 + 0.3; pu + len <= u1 - 0.3; pu += len) {
					if (!ok(pu + 0.1, pu + len - 0.1, a + 0.1, b - 0.1)) continue;
					// linie boczne miejsca (wspólne z sąsiednim pokrywają się), przy równoległych – też linia zewnętrzna
					line(P(pu, a), P(pu, b));
					line(P(pu + len, a), P(pu + len, b));
					if (!perp) line(P(pu, b), P(pu + len, b));
					// auto w części miejsc
					const sd = row[1] * 3.17 + row[2] * 1.91 + pu * 7.3 + a * 2.1;
					if (hash(sd) < 0.55) {
						const c0 = P(pu + len / 2, (a + b) / 2), dir = perp ? (hash(sd + 0.4) < 0.5 ? v : [-v[0], -v[1]]) : (hash(sd + 0.4) < 0.5 ? u : [-u[0], -u[1]]);
						cars.push({ c: c0, dir, color: CAR_C[Math.floor(hash(sd + 0.7) * CAR_C.length)] });
					}
				}
			}
		}
		if (cars.length) {
			// osobna instancja na każdy typ nadwozia (hatchback, sedan, kombi, dostawczy)
			const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p3 = new T.Vector3(), one = new T.Vector3(1, 1, 1);
			const byKind = new Map();
			for (const x of cars) {
				const k = NS.props.carKind(x.c[0] * 0.37 + x.c[1] * 1.13);
				if (!byKind.has(k)) byKind.set(k, []);
				byKind.get(k).push(x);
			}
			for (const [k, list] of byKind) {
				const im = new T.InstancedMesh(NS.props.carGeo(k), parkCarMat(), list.length);
				list.forEach((x, i) => {
					const a = W(x.c, 0.075), b = W([x.c[0] + x.dir[0], x.c[1] + x.dir[1]], 0.075);
					q.setFromAxisAngle(up, Math.atan2(b[0] - a[0], b[2] - a[2]));
					im.setMatrixAt(i, m4.compose(p3.set(a[0], a[1], a[2]), q, one));
					im.setColorAt(i, col.set(x.color));
				});
				im.castShadow = this.shadows;
				im.receiveShadow = true;
				group.add(im);
			}
		}
		for (const d0 of [dst, mk]) {
			if (!d0.p.length) continue;
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(d0.p, 3));
			geo.setAttribute('color', new T.Float32BufferAttribute(d0.c, 3));
			geo.computeVertexNormals();
			// nawierzchnie oświetlone jak płaszczyzna (bez smug z drobnych pochyleń trójkątów), ściany krawężników bez zmian
			const nm = geo.attributes.normal.array;
			for (let q = 0; q < nm.length; q += 3) if (Math.abs(nm[q + 1]) > 0.5) { nm[q] = 0; nm[q + 1] = Math.sign(nm[q + 1]); nm[q + 2] = 0; }
			const m = new T.Mesh(geo, d0 === mk ? M.roadMark : M.road);
			m.receiveShadow = true;
			group.add(m);
		}
	};

	// wody: cieki (pasy) i zbiorniki z rastra (prostokąty 10 m), lustro wody nieco poniżej terenu brzegu
	World.prototype.buildEnvWater = function (group, c, segs) {
		const e = this.env, r = this.route;
		const dst = { p: [], c: [] };
		const white = { r: 1, g: 1, b: 1 };
		const skip = (s, d) => (Math.abs(d) < 8 && !this.underBridge(s, d)) || this.envStationZone(s, d);
		if (!e.waterLinks) e.waterLinks = this.envUnderLinks(this.route.env.w, 1);
		for (const row of e.waterLinks) if (Math.floor((row[1] + row[3]) / 2 / C) === c) segs = segs.concat([{ k: 0, row }]);
		for (const { k, row } of segs) {
			const pts = [[row[1 + k * 2], row[2 + k * 2]], [row[3 + k * 2], row[4 + k * 2]]];
			this.envStrip(dst, pts, row[0], 0.12, white, skip);
		}
		// zbiorniki: serie komórek „woda” w wierszach rastra należących do kawałka
		const g = e.g, st = g.step;
		for (let s = c * C; s < (c + 1) * C; s += st) {
			const ri = Math.round((s - g.s0) / st);
			if (ri < 0 || ri >= e.rows) continue;
			let ci = 0;
			while (ci < g.cols) {
				if (e.grid[ri * g.cols + ci] !== 9) { ci++; continue; }
				let cj = ci;
				while (cj + 1 < g.cols && e.grid[ri * g.cols + cj + 1] === 9) cj++;
				const dA = g.d0 + (ci - 0.5) * st, dB = g.d0 + (cj + 0.5) * st;
				for (let d = dA; d < dB - 1e-6; d += 20) {
					const d2 = Math.min(dB, d + 20);
					if (Math.abs((d + d2) / 2) < 10 || this.envStationZone(s, (d + d2) / 2)) continue;
					const P = [[s - st / 2, d], [s - st / 2, d2], [s + st / 2, d2], [s + st / 2, d]].map(([ss, dd]) => {
						R.sidePoint(r, ss, dd, tp);
						return [tp.x, 0, tp.z];
					});
					const y = this.terrainY(s, (d + d2) / 2) + 0.65;
					for (const p of P) p[1] = y;
					const up = ((P[2][2] - P[0][2]) * (P[1][0] - P[0][0]) - (P[2][0] - P[0][0]) * (P[1][2] - P[0][2])) < 0;
					const T3 = (x, y2, z) => { dst.p.push(...x, ...y2, ...z); for (let i = 0; i < 3; i++) dst.c.push(1, 1, 1); };
					if (up) { T3(P[0], P[1], P[2]); T3(P[0], P[2], P[3]); } else { T3(P[0], P[2], P[1]); T3(P[0], P[3], P[2]); }
				}
				ci = cj + 1;
			}
		}
		if (!dst.p.length) return;
		const geo = new T.BufferGeometry();
		geo.setAttribute('position', new T.Float32BufferAttribute(dst.p, 3));
		geo.computeVertexNormals();
		const m = new T.Mesh(geo, World.materials().water);
		m.receiveShadow = true;
		group.add(m);
	};

	// nocne okna budynków
	World.prototype.envNight = function (dark) {
		if (World.envM) World.envM.facade.emissiveIntensity = dark > 0.25 ? 0.8 * dark : 0;
	};
})();
