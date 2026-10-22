/* Prawdziwe otoczenie tras rzeczywistych (dane OpenStreetMap w układzie trasy – zob. js/osm-route.js):
   budynki wyciągnięte z obrysów (elewacje z oknami świecącymi nocą, dachy płaskie, dwuspadowe i kopertowe),
   drogi na terenie, rzeki i zbiorniki, kolor terenu wg zagospodarowania, drzewa w lasach i parkach.
   Rozszerza World o metody wywoływane przy budowie kawałków świata. */
import * as THREE from 'three';

(function () {
	'use strict';
	const T = THREE;
	const R = window.TrainRoutes;
	const NS = window.Train3D;
	const { hash, vnoise, patch, canvasTexture, mat, box, GEO, smoothstep } = NS.util;
	const World = NS.World;
	const C = 200;
	const tp = {}, tp2 = {};
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
		['#d9dcdf', '#c9ced2'],
	];
	const ROOFS = [
		['#8e3b2e', '#6d4c3d', '#4a4d51', '#a0522d', '#7a3326', '#4d5257', '#5b3a2c'], // dachówka czerwona, brązowa, grafitowa
		['#555759', '#6b6b6b', '#62584f', '#7a3326'],
		['#868b8f', '#7a8084', '#959a9e'],
		['#555759', '#6b6b6b'],
		['#7a3326', '#4f6a5a'],
		['#76797d', '#7f6656', '#6a6e72'],
		['#8e3b2e', '#555759', '#7a3326'],
		['#e4e6e8'],
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
	/* sieci (rozpoznawane po nazwie z mapy): barwy szyldu (tło, napis) i pasa firmowego – bez logotypów (znaki towarowe),
	   sama nazwa z mapy zwykłą czcionką; fuel – sieć stacji paliw */
	const BRANDS = [
		[/żabka|zabka/i, ['#0b8a3e', '#ffffff', '#0b8a3e']],
		[/biedronka/i, ['#e30613', '#ffd400', '#e30613']],
		[/lidl/i, ['#0050aa', '#ffe500', '#0050aa']],
		[/netto/i, ['#ffd400', '#1a1a1a', '#ffd400']],
		[/\bdino\b/i, ['#ffffff', '#d7141a', '#2e8b3d']],
		[/kaufland/i, ['#e10915', '#ffffff', '#e10915']],
		[/aldi/i, ['#1c3f94', '#ffffff', '#1c3f94']],
		[/carrefour/i, ['#ffffff', '#004e9f', '#004e9f']],
		[/stokrotka/i, ['#5aa02c', '#ffffff', '#5aa02c']],
		[/lewiatan/i, ['#ffffff', '#00843d', '#00843d']],
		[/rossmann/i, ['#c3002f', '#ffffff', '#c3002f']],
		// sieci stacji paliw (1) – tylko dla stacji paliw (bank „PKO BP” nie dostaje barw BP)
		[/orlen/i, ['#e30613', '#ffffff', '#e30613'], 1],
		[/\bbp\b/i, ['#009b3a', '#ffe600', '#009b3a'], 1],
		[/shell/i, ['#ffd500', '#dd1d21', '#dd1d21'], 1],
		[/lotos/i, ['#00377a', '#ffd400', '#00377a'], 1],
		[/circle\s*k|statoil/i, ['#e30613', '#ffffff', '#f28c00'], 1],
		[/moya/i, ['#0b74b8', '#ffffff', '#0b74b8'], 1],
		[/amic/i, ['#00a651', '#ffffff', '#00a651'], 1],
	];
	const brandOf = (name, use) => { if (!name) return null; for (const [re, c, fuel] of BRANDS) if (re.test(name) && (!fuel || use === 26)) return c; return null; };
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
	/* Atlas szyldów: strony 1024 × 1024 (2 × 10 komórek 512 × 96), napis dopisywany do bieżącej strony przy pierwszym
	   użyciu (stały dla trasy – pamięć podręczna wg tekstu i barw); szyldy kawałka świata rysowane jedną siatką na stronę
	   (dawniej osobna płaszczyzna z własnym materiałem – ok. 75 wywołań rysowania na kadr w mieście) */
	const SIGN_ATLAS = { pages: [], cells: new Map() };
	const signCell = (text, bg, fg, icon) => {
		const key = `${text}|${bg}|${fg}|${icon || ''}`;
		let cell = SIGN_ATLAS.cells.get(key);
		if (cell) return cell;
		let pg = SIGN_ATLAS.pages[SIGN_ATLAS.pages.length - 1];
		if (!pg || pg.n >= 20) {
			const cv = document.createElement('canvas');
			cv.width = cv.height = 1024;
			const tex = new T.CanvasTexture(cv);
			tex.colorSpace = T.SRGBColorSpace;
			tex.anisotropy = 16;
			const mat2 = new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.22, roughness: 0.5 });
			mat2.userData.shared = true;
			pg = { cv, g: cv.getContext('2d'), tex, mat: mat2, n: 0 };
			SIGN_ATLAS.pages.push(pg);
		}
		const i = pg.n++, x = (i % 2) * 512, y = Math.floor(i / 2) * 96;
		pg.g.drawImage(signTexture(text, bg, fg, icon).image, x, y);
		pg.tex.needsUpdate = true;
		cell = { pg, uv: [(x + 2) / 1024, 1 - (y + 94) / 1024, (x + 510) / 1024, 1 - (y + 2) / 1024] };
		SIGN_ATLAS.cells.set(key, cell);
		return cell;
	};

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
		for (const t of [facadeTex, litTex, facadeNorm]) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 16; }
		litTex.colorSpace = T.SRGBColorSpace;
		const m = (o, v) => patch(new T.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9 }, o)), v || 'lit');
		World.envM = {
			facade: m({ map: facadeTex, normalMap: facadeNorm, normalScale: new T.Vector2(1, 1), emissiveMap: litTex, emissive: '#ffffff', emissiveIntensity: 0 }, 'dirt'),
			plain: m({}, 'dirt'),
			roof: m({ roughness: 0.78 }, 'roof'), // dachy: dachówki, blachodachówka, papa (common.js ROOF_GLSL)
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
			switchMachine: patch(new T.MeshStandardMaterial({ color: '#3e4549', roughness: 0.55, metalness: 0.45 }), 'lit'), // napędy zwrotnicowe (grafitowe)
			switchWood: patch(new T.MeshStandardMaterial({ color: '#4a3b2e', roughness: 0.92, metalness: 0 }), 'lit'), // podrozjazdnice drewniane (nasycone)
			switchCab: patch(new T.MeshStandardMaterial({ color: '#9aa1a6', roughness: 0.5, metalness: 0.5 }), 'lit'), // szafki ogrzewania rozjazdów
			switchHand: patch(new T.MeshStandardMaterial({ color: '#2d3136', roughness: 0.7, metalness: 0.4 }), 'lit'), // zwrotniki ręczne
			switchLamp: patch(new T.MeshStandardMaterial({ color: '#e8ecef', emissive: '#c8d8ff', emissiveIntensity: 0.25, roughness: 0.5 }), 'lit'), // latarnie zwrotnicowe
		};
		for (const k of Object.keys(World.envM)) World.envM[k].userData.shared = true;
		return World.envM;
	}

	/* przerwy w torach z mapy przy portalach tunelu: odcinek przed portalem kończy się kilka metrów przed początkiem
	   odcinka w tunelu (podział drogi z mapy na kawałki pod ziemią i na powierzchni – np. Powiśle przed tunelem
	   średnicowym: 3363 → 3371 m) – tor urywał się przed wjazdem. Koniec toru (do 25 m od portalu) łączony z początkiem
	   innego toru 1,5–14 m dalej w tym samym kierunku (oba odcinki i łącznik w linii, wysokości ±1 m); jednorazowo */
	const envJoinPortalGaps = (route) => {
		const env = route.env, T = env.t, TH = env.th;
		if (!T || env._tJoin || !route.tunnels || !route.tunnels.length) return;
		Object.defineProperty(env, '_tJoin', { value: true, configurable: true });
		const portal = (s) => route.tunnels.some((t) => Math.abs(s - t.from) < 25 || Math.abs(s - t.to) < 25);
		// końce torów: punkt, kierunek na zewnątrz, wysokość
		const ends = [];
		T.forEach((row, i) => {
			const m = (row.length - 1) / 2;
			if (m < 2) return;
			for (const first of [true, false]) {
				const a = first ? 0 : m - 1, b = first ? 1 : m - 2;
				const s = row[1 + a * 2], d = row[2 + a * 2];
				if (!portal(s)) continue;
				const ds = s - row[1 + b * 2], dd = d - row[2 + b * 2], L = Math.hypot(ds, dd) || 1;
				ends.push({ i, first, s, d, us: ds / L, ud: dd / L, h: TH && TH[i] ? TH[i][a] : -1, used: false });
			}
		});
		// koniec połączony już z innym torem (rozjazd) – bez łącznika
		const near = (e) => ends.some((o) => o !== e && Math.hypot(o.s - e.s, o.d - e.d) < 1.5);
		for (const e of ends) {
			if (e.used || near(e)) continue;
			let best = null, bd = Infinity;
			for (const o of ends) {
				if (o.used || o.i === e.i || near(o)) continue;
				const vs = o.s - e.s, vd = o.d - e.d, L = Math.hypot(vs, vd);
				if (L < 1.5 || L > 14) continue;
				if ((vs * e.us + vd * e.ud) / L < 0.98 || -(vs * o.us + vd * o.ud) / L < 0.98) continue;
				if (e.h >= 0 && o.h >= 0 && Math.abs(e.h - o.h) > 10) continue;
				if (L < bd) { bd = L; best = o; }
			}
			if (!best) continue;
			e.used = best.used = true;
			// łącznik dopisany do toru poza tunelem (bez bitu 16) – w tunelu zostaje jego kawałek
			const [x, y] = T[e.i][0] & 16 && !(T[best.i][0] & 16) ? [best, e] : [e, best];
			const row = T[x.i], th = TH && TH[x.i];
			if (x.first) { row.splice(1, 0, y.s, y.d); if (th) th.unshift(th[0]); }
			else { row.push(y.s, y.d); if (th) th.push(th[th.length - 1]); }
		}
	};

	/* „wiadukt kolejowy” z mapy (env.ro), który nie przecina naszego toru (wszystkie punkty po jednej stronie, ponad 3 m
	   od osi) albo przecina go i dalej biegnie obok – w danych bywa nim cały tor (Chorzów Batory: 1,5 km toru 5–26 m
	   od osi za przejściem nad linią).
	   Rysowany jako pomost nad torami leżał przy ziemi szarą płytą i skakał na 7 m tam, gdzie zbliżał się do torów
	   (skrajnia). Przeniesiony do torów z mapy (bit 2 – most, 8; wysokości z pomiaru pomostu env.roh jak env.th);
	   jednorazowo */
	const envRailBesideToTracks = (route) => {
		const env = route.env;
		if (!env.ro || !env.ro.length || !env.t || env._roMoved) return;
		Object.defineProperty(env, '_roMoved', { value: true, configurable: true });
		const keep = [], keepZ = [], keepH = [], hasZ = Array.isArray(env.roz), hasH = Array.isArray(env.roh);
		if (!env._roTracks) Object.defineProperty(env, '_roTracks', { value: new Set(), configurable: true });
		const toTrack = (row, h, k0, k1, fl) => {
			if (k1 - k0 < 1) return;
			env._roTracks.add(env.t.length);
			env.t.push([fl].concat(row.slice(1 + k0 * 2, 3 + k1 * 2)));
			if (env.th) env.th.push(h ? h.slice(k0, k1 + 1) : null);
		};
		env.ro.forEach((row, i) => {
			const n = (row.length - 1) / 2, h = hasH && env.roh[i] && env.roh[i].length === n ? env.roh[i] : null;
			/* przejście nad osią: zmiana strony z ponad 3 m po jednej na ponad 3 m po drugiej (tor kończący się na osi –
			   zjazd zwrotnicą do naszej linii – nie przecina jej) */
			let kc = -1, last = 0, lastK = -1;
			for (let k = 0; k < n && kc < 0; k++) {
				const d = row[2 + k * 2];
				if (Math.abs(d) <= 3) continue;
				const sg = Math.sign(d);
				if (last && sg !== last) {
					// punkt przecięcia: najbliższy osi między ostatnim punktem po jednej stronie a pierwszym po drugiej
					let bd = Infinity;
					for (let j = lastK; j <= k; j++) if (Math.abs(row[2 + j * 2]) < bd) { bd = Math.abs(row[2 + j * 2]); kc = j; }
				}
				last = sg;
				lastK = k;
			}
			if (kc < 0 && n >= 2) { toTrack(row, h, 0, n - 1, 2 | 8); return; }
			/* przecina tor, ale dalej biegnie obok niego (odcinek równoległy od 60 m, ponad 3 m od osi): wiadukt tylko do
			   początku tego odcinka (z zapasem 2 punktów), reszta – tor z mapy (bez bitu mostu) */
			const par = (k, dir) => {
				let L = 0;
				for (let j = k; j + dir >= 0 && j + dir < n; j += dir) {
					const ds = Math.abs(row[1 + (j + dir) * 2] - row[1 + j * 2]), dd = Math.abs(row[2 + (j + dir) * 2] - row[2 + j * 2]);
					if (dd > 0.15 * ds + 0.05 || Math.abs(row[2 + j * 2]) < 3) break;
					L += Math.hypot(ds, dd);
					if (L >= 60) return true;
				}
				return false;
			};
			let a = 0, b = n - 1;
			for (let k = kc; k < n - 1; k++) if (par(k, 1)) { b = Math.min(n - 1, k + 2); break; }
			for (let k = kc; k > 0; k--) if (par(k, -1)) { a = Math.max(0, k - 2); break; }
			if (a === 0 && b === n - 1) { keep.push(row); if (hasZ) keepZ.push(env.roz[i]); if (hasH) keepH.push(env.roh[i]); return; }
			const mid = [row[0]].concat(row.slice(1 + a * 2, 3 + b * 2));
			keep.push(mid);
			if (hasZ) keepZ.push(env.roz[i]);
			if (hasH) keepH.push(h ? h.slice(a, b + 1) : env.roh[i]);
			toTrack(row, h, 0, a, 8);
			toTrack(row, h, b, n - 1, 8);
		});
		env.ro = keep;
		if (hasZ) env.roz = keepZ;
		if (hasH) env.roh = keepH;
	};

	// ---------- indeks otoczenia trasy ----------
	World.prototype.envIndex = function (route) {
		const env = route.env;
		this.env = null;
		if (!env) return;
		const bByChunk = new Map(), rByChunk = new Map(), wByChunk = new Map();
		const push = (map, c, v) => { if (!map.has(c)) map.set(c, []); map.get(c).push(v); };
		// rodzaj budynku i nazwa z mapy (env.bu, env.bn: indeks, nazwa, …)
		const bUse = env.bu || [], bName = new Map(), bPitch = new Map();
		// boiska stadionów (env.sp: indeks budynku, s, d, kierunek ×1000, połowy długości i szerokości w dm)
		for (let k = 0; k + 6 < (env.sp || []).length; k += 7) {
			const q = env.sp;
			bPitch.set(q[k], { s: q[k + 1], d: q[k + 2], us: q[k + 3] / 1000, ud: q[k + 4] / 1000, hl: q[k + 5] / 10, hw: q[k + 6] / 10 });
		}
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
		envRailBesideToTracks(route);
		envJoinPortalGaps(route);
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
		/* wysokości jezdni z pomiaru (dm) wygładzone wzdłuż drogi (średnia ważona ±12 m): pomiar co kilka metrów
		   z dokładnością 0,1 m dawał schodki i załamania pochylenia; końce bez zmian (styk z innymi drogami) */
		(env.r || []).forEach((row, i) => {
			const z0 = env.rh && env.rh[i];
			if (!z0) return;
			const n = (row.length - 1) / 2;
			if (n < 3 || z0.length < n) { roadZ.set(row, z0.slice()); return; }
			const cum = [0];
			for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(row[1 + k * 2] - row[k * 2 - 1], row[2 + k * 2] - row[k * 2]));
			const z = z0.slice();
			for (let k = 1; k < n - 1; k++) {
				let sw = 0, sz = 0;
				for (let j = k; j >= 0 && cum[k] - cum[j] <= 12; j--) { const w = 1 - (cum[k] - cum[j]) / 13; sw += w; sz += w * z0[j]; }
				for (let j = k + 1; j < n && cum[j] - cum[k] <= 12; j++) { const w = 1 - (cum[j] - cum[k]) / 13; sw += w; sz += w * z0[j]; }
				z[k] = sz / sw;
			}
			roadZ.set(row, z);
		});
		/* drogi nachodzące na siebie: punkt drogi, której pas jezdni zachodzi na pas równoległej drogi (|cos| ≥ 0,9, osie
		   bliżej niż suma połówek szerokości + 1 m) wyższej o 0,3–2,5 m – na jej poziomie, z przejściem do własnej wysokości na 15 m. Maska dróg bierze
		   w takim pasie wyższą jezdnię, a pas ukośnie przecina komórki: niższa droga przeskakiwała co 2 m między dwoma
		   poziomami (np. dojazd wzdłuż ulicy, 1,3 m niżej). Większe różnice – drogi na różnych poziomach (wiadukt). */
		{
			const segs = [], B = new Map();
			env.r.forEach((row, i) => {
				const z = roadZ.get(row);
				if (!z) return;
				const n = (row.length - 1) / 2;
				for (let k = 0; k + 1 < n; k++) {
					const q = [row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], z[k], z[k + 1], i];
					segs.push(q);
					for (let b = Math.floor(Math.min(q[0], q[2]) / 40); b <= Math.floor(Math.max(q[0], q[2]) / 40); b++) { if (!B.has(b)) B.set(b, []); B.get(b).push(q); }
				}
			});
			const half = (i) => Math.max(rInfo[i].w || 5, ROAD_W[env.r[i][0]] || 5) / 2;
			const lifted = [];
			env.r.forEach((row, i) => {
				const z = roadZ.get(row);
				if (!z) return;
				const n = (row.length - 1) / 2, tz = new Array(n).fill(NaN);
				let any = false;
				for (let k = 0; k < n; k++) {
					const s = row[1 + k * 2], d = row[2 + k * 2], a = Math.max(0, k - 1), b2 = Math.min(n - 1, k + 1);
					const ux0 = row[1 + b2 * 2] - row[1 + a * 2], uy0 = row[2 + b2 * 2] - row[2 + a * 2], l0 = Math.hypot(ux0, uy0) || 1;
					for (const q of B.get(Math.floor(s / 40)) || []) {
						if (q[6] === i) continue;
						const ux = q[2] - q[0], uy = q[3] - q[1], L2 = ux * ux + uy * uy || 1e-9, Lq = Math.sqrt(L2);
						// rzut na odcinek z zapasem 3 m za końcami (przy węźle – koniec odcinka drugiej drogi)
						const t0 = ((s - q[0]) * ux + (d - q[1]) * uy) / L2;
						if (t0 <= -3 / Lq || t0 >= 1 + 3 / Lq || Math.abs((ux * ux0 + uy * uy0) / (Lq * l0)) < 0.9) continue;
						const t = Math.max(0, Math.min(1, t0));
						// pasy jezdni (z marginesem 0,5 m – jak rdzeń maski) zachodzą na siebie
						if (Math.hypot(q[0] + ux * t - s, q[1] + uy * t - d) > half(i) + half(q[6]) + 1) continue;
						const zq = q[4] + (q[5] - q[4]) * t, dz = zq - z[k];
						if (dz > 3 && dz < 25 && !(zq <= tz[k])) { tz[k] = zq; any = true; }
					}
				}
				if (any) lifted.push([row, z, tz]);
			});
			for (const [row, z, tz] of lifted) {
				const n = z.length, cum = [0];
				for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(row[1 + k * 2] - row[k * 2 - 1], row[2 + k * 2] - row[k * 2]));
				const z0 = z.slice();
				for (let k = 0; k < n; k++) {
					if (Number.isFinite(tz[k])) { z[k] = Math.max(z0[k], tz[k]); continue; }
					let best = 0;
					for (let j = 0; j < n; j++) if (Number.isFinite(tz[j]) && Math.abs(cum[j] - cum[k]) < 15) best = Math.max(best, (tz[j] - z0[k]) * (1 - Math.abs(cum[j] - cum[k]) / 15));
					z[k] = z0[k] + Math.max(0, best);
				}
			}
		}
		/* pochylenie jezdni najwyżej 12% (po sieci dróg, także przez węzły): garby z pomiaru ścięte. Węzeł przy końcu
		   wiaduktu nad torami dostawał wysokość pomostu (pomiar powierzchni) – drogi z niego spadały po 30–50% (rampy
		   ze stromym klinem terenu); pomost schodzi teraz do skrzyżowania (overpassPlan). Doliny (przejścia pod
		   torami) bez zmian – tylko obniżanie. */
		{
			// węzły: punkty dróg bliżej niż 1 m (końce dróg w danych nie zawsze w tym samym miejscu)
			const verts = [], keyOf = (s, d) => Math.floor(s) * 4096 + Math.floor(d + 2048), byKey = new Map();
			for (const [row, z] of roadZ) {
				const n = Math.min((row.length - 1) / 2, z.length), base = verts.length;
				for (let k = 0; k < n; k++) {
					const key = keyOf(row[1 + k * 2], row[2 + k * 2]);
					verts.push({ z, k, row, base, n, key });
					if (!byKey.has(key)) byKey.set(key, []);
					byKey.get(key).push(base + k);
				}
			}
			const zv = Float64Array.from(verts, (v) => v.z[v.k]), heap = [];
			/* końce wiaduktów drogowych z mapy: pomost może zejść do skrzyżowania najwyżej 8% na odcinku od ostatniego
			   miejsca nad torem (tor z mapy bliżej niż 4,5 m albo oś) do końca – drogi w tym węźle nie niżej (wiadukt
			   kończący się tuż za torami ma dalej estakadę albo wysoki nasyp, nie garb z pomiaru) */
			const floor = new Float64Array(verts.length).fill(-Infinity);
			const tSegs = new Map();
			(env.t || []).forEach((row) => {
				if (row[0] & 16) return; // tor w tunelu – droga nad nim nie jest wiaduktem
				for (let k = 1; k + 3 < row.length; k += 2) {
					const b = Math.floor((row[k] + row[k + 2]) / 2 / 50);
					if (!tSegs.has(b)) tSegs.set(b, []);
					tSegs.get(b).push([row[k], row[k + 1], row[k + 2], row[k + 3]]);
				}
			});
			const overTrack = (s1, d1) => {
				if (Math.abs(d1) < 6) return true;
				for (let b = Math.floor(s1 / 50) - 1; b <= Math.floor(s1 / 50) + 1; b++) for (const [a1, a2, b1, b2] of tSegs.get(b) || []) {
					const L2 = (b1 - a1) ** 2 + (b2 - a2) ** 2 || 1e-9, t = Math.max(0, Math.min(1, ((s1 - a1) * (b1 - a1) + (d1 - a2) * (b2 - a2)) / L2));
					if (Math.hypot(a1 + (b1 - a1) * t - s1, a2 + (b2 - a2) * t - d1) < 4.5) return true;
				}
				return false;
			};
			for (const orow of env.o || []) {
				const n = (orow.length - 1) / 2;
				if (n < 2) continue;
				for (const [k0, st] of [[0, 1], [n - 1, -1]]) {
					let room = 0;
					for (let k = k0; k >= 0 && k < n; k += st) {
						if (overTrack(orow[1 + k * 2], orow[2 + k * 2])) break;
						if (k !== k0) room += Math.hypot(orow[1 + k * 2] - orow[1 + (k - st) * 2], orow[2 + k * 2] - orow[2 + (k - st) * 2]);
					}
					const es = orow[1 + k0 * 2], ed = orow[2 + k0 * 2];
					for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of byKey.get(keyOf(es, ed) + a * 4096 + b) || []) {
						const w = verts[j];
						if (Math.hypot(w.row[1 + w.k * 2] - es, w.row[2 + w.k * 2] - ed) < 1.5) floor[j] = Math.max(floor[j], zv[j] - 0.8 * room);
					}
				}
			}
			const push = (z, i) => { heap.push([z, i]); let j = heap.length - 1; while (j > 0) { const p2 = (j - 1) >> 1; if (heap[p2][0] <= heap[j][0]) break; [heap[p2], heap[j]] = [heap[j], heap[p2]]; j = p2; } };
			const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let j = 0; for (;;) { const a = 2 * j + 1, b = a + 1; let m = j; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === j) break; [heap[m], heap[j]] = [heap[j], heap[m]]; j = m; } } return top; };
			zv.forEach((z, i) => push(z, i));
			const G = 1.2; // dm na metr
			while (heap.length) {
				const [z, i] = pop();
				if (z > zv[i]) continue;
				const v = verts[i], row = v.row, vs = row[1 + v.k * 2], vd = row[2 + v.k * 2];
				const relax = (j, dist) => { const c2 = Math.max(floor[j], z + G * dist); if (c2 < zv[j] - 0.01) { zv[j] = c2; push(c2, j); } };
				for (const k2 of [v.k - 1, v.k + 1]) if (k2 >= 0 && k2 < v.n) relax(v.base + k2, Math.hypot(row[1 + k2 * 2] - row[1 + v.k * 2], row[2 + k2 * 2] - row[2 + v.k * 2]));
				for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of byKey.get(v.key + a * 4096 + b) || []) {
					if (j === i) continue;
					const w = verts[j], dist = Math.hypot(w.row[1 + w.k * 2] - vs, w.row[2 + w.k * 2] - vd);
					// wspólny punkt (węzeł) albo dwa końce dróg obok siebie – nie przecięcie dróg na różnych poziomach
					const endV = v.k === 0 || v.k === v.n - 1, endW = w.k === 0 || w.k === w.n - 1;
					if (dist < 0.05 || (dist < 1 && endV && endW)) relax(j, dist);
				}
			}
			verts.forEach((v, i) => { v.z[v.k] = zv[i]; });
		}
		const deckZ = new Map();
		for (const [rows2, zs] of [[env.o, env.oz], [env.ro, env.roz], [env.ob, env.obz]]) (rows2 || []).forEach((row, i) => { if (zs && zs[i] >= 0) deckZ.set(row, zs[i]); });
		// profil jezdni z pomiaru w każdym punkcie łamanej (dm ponad dem.base)
		const deckP = new Map();
		/* profil pomostu z pomiaru (NMPT) – obwiednia dolna: nie wyżej niż 6% od sąsiednich punktów (pylony, liny i wanty
		   mostów wantowych, latarnie – w pomiarze jak garby pomostu; np. most Świętokrzyski falował o kilkanaście metrów) */
		const lowEnv = (row, off, hs) => {
			const v = hs.slice(), n = v.length, L = [];
			for (let k = 0; k + 1 < n; k++) L.push(Math.hypot(row[off + 2 + k * 2] - row[off + k * 2], row[off + 3 + k * 2] - row[off + 1 + k * 2]));
			for (let k = 1; k < n; k++) if (v[k] >= 0 && v[k - 1] >= 0) v[k] = Math.min(v[k], v[k - 1] + 0.6 * L[k - 1]);
			for (let k = n - 2; k >= 0; k--) if (v[k] >= 0 && v[k + 1] >= 0) v[k] = Math.min(v[k], v[k + 1] + 0.6 * L[k]);
			return v;
		};
		for (const [rows2, hs, off] of [[env.o, env.oh, 1], [env.ro, env.roh, 1], [env.ob, env.obh, 2]]) (rows2 || []).forEach((row, i) => { if (hs && hs[i]) deckP.set(row, hs[i].length === (row.length - off) / 2 ? lowEnv(row, off, hs[i]) : hs[i]); });
		this.env = { bByChunk, rByChunk, wByChunk, tByChunk, pByChunk, oByChunk, obByChunk, roByChunk, kByChunk, tSpan, tAt: new Map(), usedPlatforms, swByChunk, stationReal, reserved, grid, g, rows, masks: new Map(), cvGrid, deckZ, deckP, roadZ, rmasks: new Map(), rInfo, rxByChunk, pkByChunk, rfByChunk, rfAll, bUse, bName, bPitch };
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
		this.envTrenchInit();
		envMaterials();
	};

	/* Wkopy drogowe (np. DTŚ w Gliwicach i Katowicach): jezdnia ponad 4 m poniżej ulic do 25 m obok (co najmniej dwa
	   punkty innych dróg, poza pasem 30 m od toru). Pomiar terenu daleko od toru jest rzadki (kolumny co ~80 m) – punkt
	   pomiaru trafiający w dno wkopu zamieniał wkop szerokości 25 m w dolinę na 150 m. Wynik:
	   - e.trench: Map(wiersz env.r → Float64Array poziomu ulic obok w każdym punkcie, NaN – nie we wkopie, dm jak roadZ),
	   - e.trSegs: odcinki we wkopie [s1, d1, s2, d2, półszerokość, poziom ulic dm] (po kawałkach: e.trByChunk),
	   - punkty pomiaru terenu w pasie wkopu (do 6 m od krawędzi jezdni) – na poziomie ulic obok (kopia e.dem.v). */
	World.prototype.envTrenchInit = function () {
		const e = this.env, env = this.route.env, D = e.dem;
		e.trench = new Map();
		e.trSegs = [];
		e.trByChunk = new Map();
		e.trPortals = [];
		if (!D || !D.lidar || !env.r) return;
		const G = 25, grid = new Map(), key = (s, d) => Math.floor(s / G) * 8192 + Math.floor(d / G + 4096);
		const pts = [];
		env.r.forEach((row, i) => {
			const z = e.roadZ.get(row);
			if (!z) return;
			// punkty co ≤ 8 m wzdłuż drogi (w danych punkty tylko na załamaniach – proste ulice miały ich za mało)
			const n = Math.min((row.length - 1) / 2, z.length);
			const put = (q) => { pts.push(q); const kk = key(q.s, q.d); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(q); };
			for (let k = 0; k < n; k++) {
				const k2 = Math.min(k, n - 2), Ld = Math.hypot(row[3 + k2 * 2] - row[1 + k2 * 2], row[4 + k2 * 2] - row[2 + k2 * 2]) || 1;
				const us = (row[3 + k2 * 2] - row[1 + k2 * 2]) / Ld, ud = (row[4 + k2 * 2] - row[2 + k2 * 2]) / Ld;
				put({ s: row[1 + k * 2], d: row[2 + k * 2], z: z[k], i, us, ud, end: k === 0 || k === n - 1 });
				if (k + 1 < n) {
					const L = Math.hypot(row[3 + k * 2] - row[1 + k * 2], row[4 + k * 2] - row[2 + k * 2]), m = Math.floor(L / 8);
					for (let j = 1; j <= m; j++) { const t = j / (m + 1); put({ s: row[1 + k * 2] + (row[3 + k * 2] - row[1 + k * 2]) * t, d: row[2 + k * 2] + (row[4 + k * 2] - row[2 + k * 2]) * t, z: z[k] + (z[k + 1] - z[k]) * t, i, us, ud }); }
				}
			}
		});
		const proc = (row, i) => {
			const z = e.roadZ.get(row);
			if (!z || row[0] > 6) return;
			const n = Math.min((row.length - 1) / 2, z.length), ref = new Float64Array(n).fill(NaN);
			let any = false;
			for (let k = 0; k < n; k++) {
				const s1 = row[1 + k * 2], d1 = row[2 + k * 2];
				if (Math.abs(d1) < 30) continue;
				const k2 = Math.min(k, n - 2), Lv = Math.hypot(row[3 + k2 * 2] - row[1 + k2 * 2], row[4 + k2 * 2] - row[2 + k2 * 2]) || 1;
				const vs = (row[3 + k2 * 2] - row[1 + k2 * 2]) / Lv, vd = (row[4 + k2 * 2] - row[2 + k2 * 2]) / Lv;
				const hi = [];
				// tylko ulice biegnące wzdłuż (do 35°) – dojazdy do wiaduktu nad drogą (w poprzek, w górę) to nie wkop
				for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of grid.get(key(s1, d1) + a * 8192 + b) || []) {
					if (q.i === i || q.z < z[k] + 40 || Math.abs(q.us * vs + q.ud * vd) < 0.82) continue;
					if (Math.hypot(q.s - s1, q.d - d1) < 25) hi.push(q.z);
				}
				if (hi.length < 2) continue;
				hi.sort((x, y) => x - y);
				ref[k] = hi[hi.length >> 1];
				any = true;
			}
			if (!any) return;
			// pojedyncze punkty bez wkopu między punktami we wkopie (do 30 m) – też we wkopie (poziom z sąsiadów)
			for (let k = 1; k < n - 1; k++) if (Number.isNaN(ref[k])) {
				let a = k - 1, b = k + 1;
				while (b < n && Number.isNaN(ref[b])) b++;
				if (!Number.isNaN(ref[a]) && b < n && Math.hypot(row[1 + b * 2] - row[1 + a * 2], row[2 + b * 2] - row[2 + a * 2]) < 80) for (let j = k; j < b; j++) ref[j] = Math.max(z[j] + 40, (ref[a] + ref[b]) / 2);
			}
			// końce drogi (podział drogi w danych, wlot tunelu, rozwidlenie) – do 30 m jak ostatni punkt we wkopie, jeśli nadal głęboko
			for (const st of [1, -1]) {
				let L = st > 0 ? n - 1 : 0;
				while (L >= 0 && L < n && Number.isNaN(ref[L])) L -= st;
				if (L < 0 || L >= n) continue;
				for (let k = L + st; k >= 0 && k < n; k += st) {
					if (Math.hypot(row[1 + k * 2] - row[1 + L * 2], row[2 + k * 2] - row[2 + L * 2]) > 30 || ref[L] - z[k] <= 40) break;
					ref[k] = ref[L];
				}
			}
			e.trench.set(row, ref);
			const hw = Math.max(e.rInfo[i].w || 5, ROAD_W[row[0]] || 5) / 2;
			/* koniec jezdni we wkopie bez dalszej drogi (tunel – w danych bez odcinków w tunelu): portal tunelu */
			for (const [k, k2] of [[0, 1], [n - 1, n - 2]]) {
				if (Number.isNaN(ref[k]) || ref[k] - z[k] < 30) continue;
				const es = row[1 + k * 2], ed = row[2 + k * 2];
				// koniec przy granicy obszaru mapy (droga ucięta, nie tunel)
				if (Math.abs(ed) > MASK_D - 40 || es < 40 || es > this.route.length - 40) continue;
				let joined = false;
				for (let a = -1; a <= 1 && !joined; a++) for (let b = -1; b <= 1 && !joined; b++) for (const q of grid.get(key(es, ed) + a * 8192 + b) || []) {
					if (q.i !== i && Math.hypot(q.s - es, q.d - ed) < 1.5) { joined = true; break; }
				}
				if (joined) continue;
				const us = es - row[1 + k2 * 2], ud = ed - row[2 + k2 * 2], L = Math.hypot(us, ud) || 1;
				e.trPortals.push({ s: es, d: ed, us: us / L, ud: ud / L, hw, z: D.base + z[k] / 10 - D.off, top: D.base + ref[k] / 10 - D.off });
			}
			for (let k = 0; k + 1 < n; k++) {
				if (Number.isNaN(ref[k]) && Number.isNaN(ref[k + 1])) continue;
				const r2 = Number.isNaN(ref[k]) ? ref[k + 1] : Number.isNaN(ref[k + 1]) ? ref[k] : (ref[k] + ref[k + 1]) / 2;
				const sg = [row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], hw, r2];
				e.trSegs.push(sg);
				for (let c = Math.floor((Math.min(sg[0], sg[2]) - 10) / C); c <= Math.floor((Math.max(sg[0], sg[2]) + 10) / C); c++) {
					if (!e.trByChunk.has(c)) e.trByChunk.set(c, []);
					e.trByChunk.get(c).push(sg);
				}
			}
		};
		/* najpierw drogi główne (do drogi powiatowej – DTŚ, trasy); mniejsze (jednojezdniowe łączniki, ulice) tylko przy
		   wkopie drogi głównej (zjazdy) – osiedlowa ulica wzdłuż wyższych ulic na zboczu to nie wkop (wąwóz z murami) */
		env.r.forEach((row, i) => { if (row[0] <= 4) proc(row, i); });
		const major = e.trSegs.slice();
		env.r.forEach((row, i) => {
			if (row[0] <= 4 || row[0] > 6) return;
			for (let k = 1; k < row.length; k += 2) {
				const s1 = row[k], d1 = row[k + 1];
				if (major.some(([sa, da, sb, db]) => {
					const L2 = (sb - sa) ** 2 + (db - da) ** 2 || 1e-9, t = Math.max(0, Math.min(1, ((s1 - sa) * (sb - sa) + (d1 - da) * (db - da)) / L2));
					return Math.hypot(sa + (sb - sa) * t - s1, da + (db - da) * t - d1) < 20;
				})) { proc(row, i); return; }
			}
		});
		if (!e.trSegs.length) return;
		// pomiar terenu w pasie wkopu – poziom ulic obok
		const v = (e.dem.v = Array.from(e.dem.v)), dc = D.dc;
		if (!dc) return;
		for (const [sa, da, sb, db, hw, r2] of e.trSegs) {
			const L = Math.hypot(sb - sa, db - da) || 1e-9;
			for (let ri = Math.max(0, Math.floor((Math.min(sa, sb) - hw - 6 - D.s0) / D.ds)); ri <= Math.min(D.rows - 1, Math.ceil((Math.max(sa, sb) + hw + 6 - D.s0) / D.ds)); ri++) {
				const ss = D.s0 + ri * D.ds;
				for (let j = 0; j < dc.length; j++) {
					const dd = dc[j], t = Math.max(0, Math.min(1, ((ss - sa) * (sb - sa) + (dd - da) * (db - da)) / (L * L)));
					if (Math.hypot(sa + (sb - sa) * t - ss, da + (db - da) * t - dd) < hw + 6) v[ri * D.cols + j] = Math.max(v[ri * D.cols + j], Math.round(r2));
				}
			}
		}
	};
	// czy (s, d) w pasie jezdni we wkopie (+ ext metrów, z maski dróg – szybko): komórki oznaczone w envRoadMask
	World.prototype.envInTrench = function (s, d, ext) {
		const e = this.env;
		if (!e || !e.trSegs || !e.trSegs.length || Math.abs(d) >= MASK_D - 2) return false;
		const c = Math.floor(s / C);
		if (!e.trByChunk.has(c)) return false;
		this.envRoadMask(c);
		const f = e.rTrench && e.rTrench.get(c);
		if (!f) return false;
		const si = Math.floor(s - c * C), di = Math.floor(d + MASK_D), r = Math.max(0, Math.round(ext || 0));
		for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
			const s2 = si + a;
			if (s2 < 0 || s2 >= C || a * a + b * b > r * r) continue;
			if (f[s2 * 2 * MASK_D + di + b]) return true;
		}
		return false;
	};
	// poziom jezdni we wkopie najbliższej punktowi (s, d) (wartość bezwzględna; undefined – brak w promieniu 12 m)
	World.prototype.envTrenchFloor = function (s, d) {
		const e = this.env, D = e.dem;
		let best, bd = 12;
		for (const row of e.trench.keys()) {
			const z = e.roadZ.get(row), n = Math.min((row.length - 1) / 2, z.length);
			if (Math.abs(row[1] - s) > 800 && Math.abs(row[row.length - 2] - s) > 800) continue;
			for (let k = 0; k + 1 < n; k++) {
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2];
				if (Math.min(sa, sb) > s + 12 || Math.max(sa, sb) < s - 12) continue;
				const L2 = (sb - sa) ** 2 + (db - da) ** 2 || 1e-9, t = Math.max(0, Math.min(1, ((s - sa) * (sb - sa) + (d - da) * (db - da)) / L2));
				const dist = Math.hypot(sa + (sb - sa) * t - s, da + (db - da) * t - d);
				if (dist < bd) { bd = dist; best = D.base + (z[k] + (z[k + 1] - z[k]) * t) / 10 - D.off; }
			}
		}
		return best;
	};
	// punkt (s, d) w pasie jezdni we wkopie (do half od krawędzi): poziom ulic obok (wartość bezwzględna) albo undefined
	World.prototype.envTrenchAt = function (s, d, extra) {
		const e = this.env;
		if (!e || !e.trByChunk) return undefined;
		const D = e.dem;
		let best;
		for (const [sa, da, sb, db, hw, r2] of e.trByChunk.get(Math.floor(s / C)) || []) {
			const L2 = (sb - sa) ** 2 + (db - da) ** 2 || 1e-9, t = Math.max(0, Math.min(1, ((s - sa) * (sb - sa) + (d - da) * (db - da)) / L2));
			if (Math.hypot(sa + (sb - sa) * t - s, da + (db - da) * t - d) < hw + (extra || 0)) best = Math.max(best === undefined ? -Infinity : best, D.base + r2 / 10 - D.off);
		}
		return best;
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

	/* poziom wody (pomiar lidarowy): poziom połączonego zbiornika w wierszu rastra (mediana pomiaru wygładzona wzdłuż –
	   envWaterComps); undefined – poza wodą. Pomiar nad wodą jest zaszumiony (łachy, schodki lustra) – lustro i dno z tego
	   poziomu. */
	World.prototype.envWaterLevel = function (s, d) {
		const e = this.env;
		if (!e || !e.dem || !e.dem.lidar) return undefined;
		const g = e.g, ri = Math.round((s - g.s0) / g.step), ci = Math.round((d - g.d0) / g.step);
		if (ri < 0 || ri >= e.rows || ci < 0 || ci >= g.cols || e.grid[ri * g.cols + ci] !== 9) return undefined;
		return this.envCompLevel(ri, ci);
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
			for (const cc of [c - 1, c, c + 1]) for (const { k, row, i } of e.tByChunk.get(cc) || []) if (th[i] && !(row[0] & 18)) segT.push([row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], i, k]);
			// odcinki torów w przedziałach po 25 m wzdłuż trasy (wg zakresu s) – drogę porównujemy tylko z sąsiednimi
			// (wcześniej każdy z każdym: ok. 0,1 s na kawałek)
			const BK = 25, buckets = new Map();
			for (const q of segT) {
				for (let b = Math.floor(Math.min(q[0], q[2]) / BK); b <= Math.floor(Math.max(q[0], q[2]) / BK); b++) {
					if (!buckets.has(b)) buckets.set(b, []);
					buckets.get(b).push(q);
				}
			}
			for (const cc of [c - 1, c, c + 1]) for (const { k, row } of e.rByChunk.get(cc) || []) {
				const z = e.roadZ.get(row);
				if (!z) continue;
				const x1 = row[1 + k * 2], y1 = row[2 + k * 2], x2 = row[3 + k * 2], y2 = row[4 + k * 2];
				if (Math.max(x1, x2) < lo || Math.min(x1, x2) > hi) continue;
				const near = new Set();
				for (let b = Math.floor(Math.min(x1, x2) / BK); b <= Math.floor(Math.max(x1, x2) / BK); b++) for (const q of buckets.get(b) || []) near.add(q);
				for (const [x3, y3, x4, y4, i, tk] of near) {
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
		const m = this.env.rmasks.get(c);
		if (m) return m;
		const g = this.envRoadMaskSteps(c);
		let r;
		while (!(r = g.next()).done);
		return r.value;
	};
	// maska krokami (co odcinek drogi / toru; kilkadziesiąt ms na kawałek) – budowa kawałka przygotowuje maski przed siatką terenu
	/* w trakcie budowy maski kawałka c teren tego kawałka liczony bez niej (roadLevel – brak jezdni): wysokość toru
	   z mapy w strefie stacji podziemnej sięga po teren, a ten po maskę – dawniej nieskończona rekurencja */
	World.prototype.envRoadMaskSteps = function* (c) {
		const e = this.env;
		if (e.rmasks.has(c)) return e.rmasks.get(c);
		(e.rmBusy || (e.rmBusy = new Set())).add(c);
		try {
			return yield* this.envRoadMaskBuild(c);
		} finally {
			e.rmBusy.delete(c);
		}
	};
	World.prototype.envRoadMaskBuild = function* (c) {
		const e = this.env;
		for (const k of e.rmasks.keys()) if (Math.abs(k - c) > 12) e.rmasks.delete(k);
		const W = 2 * MASK_D, mask = new Int16Array(C * W).fill(-32768), s0 = c * C;
		// najniższa jezdnia w komórce (32767 – brak): gdzie jezdnie różnią się o ponad 4 m, wyższa biegnie nad niższą
		// (wiadukt drogowy nieoznaczony w danych) – teren w poziomie niższej, wyższa rysowana na swojej wysokości
		const lowZ = new Int16Array(C * W).fill(32767);
		// to samo w samym pasie jezdni (bez poboczy 2,5 m): skrzyżowanie dwóch poziomów tylko tam, gdzie jezdnie się
		// przecinają – dawniej także, gdy niższa ulica biegła obok rampy wiaduktu (rów i „pomost” wzdłuż całego zjazdu)
		const coreHi = new Int16Array(C * W).fill(-32768), coreLo = new Int16Array(C * W).fill(32767);
		// komórki jezdni we wkopie (envTrenchInit): bez poboczy (dalej teren na poziomie ulic obok, mur przy krawędzi);
		// siatka terenu poza wkopem nie schodzi do jego dna (meshTerrainY)
		const trFlag = new Uint8Array(C * W);
		for (const cc of [c - 1, c, c + 1]) {
			for (const { k, row, i } of e.rByChunk.get(cc) || []) {
				const z = e.roadZ.get(row);
				if (!z) continue;
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2], za = z[k], zb = z[k + 1];
				// odcinek we wkopie albo jego sąsiad (końce wkopu na rampach); dalsze odcinki tej drogi – zwykle, z poboczami
				const tr = e.trench && e.trench.get(row);
				let inTr = false;
				if (tr) for (let j = Math.max(0, k - 1); j <= Math.min(tr.length - 1, k + 2); j++) if (!Number.isNaN(tr[j])) inTr = true;
				const hwT = Math.max(e.rInfo[i].w || 5, ROAD_W[row[0]] || 5) / 2;
				// szerokość jak rysowana jezdnia (szersza z danych i typowej) – dawniej typowa: między jezdniami dwujezdniowej
				// drogi (np. DTŚ 14,5 m) zostawał pas terenu z pomiaru, a krawędzie jezdni wspinały się po nim klinami
				const half = inTr ? hwT + 0.5 : hwT + 2.5, r = Math.ceil(half), core2 = (hwT + 0.5) ** 2;
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
						if (si >= 0 && si < C && di >= 0 && di < W) {
							if (zz > mask[si * W + di]) mask[si * W + di] = zz;
							if (zz < lowZ[si * W + di]) lowZ[si * W + di] = zz;
							if (a * a + b * b <= core2) {
								if (zz > coreHi[si * W + di]) coreHi[si * W + di] = zz;
								if (zz < coreLo[si * W + di]) coreLo[si * W + di] = zz;
								if (inTr) trFlag[si * W + di] = 1;
							}
						}
					}
				}
				yield;
			}
		}
		// łączniki pod mostami (wysokość z końców dróg): teren pod mostem w poziomie przejścia
		for (const lk of this.envLinksZ()) {
			if (!lk) continue;
			const [ti, sa, da, sb, db, za, zb] = lk;
			if (Math.max(sa, sb) < s0 - 12 || Math.min(sa, sb) > s0 + C + 12) continue;
			const half = (ROAD_W[ti] || 5) / 2 + 2.5, rr = Math.ceil(half);
			const L = Math.hypot(sb - sa, db - da), n = Math.max(1, Math.ceil(L / 0.7));
			for (let q = 0; q <= n; q++) {
				const ss = sa + ((sb - sa) * q) / n, dd = da + ((db - da) * q) / n, zz = Math.round(za + ((zb - za) * q) / n);
				const si0 = Math.floor(ss - s0), di0 = Math.floor(dd + MASK_D);
				for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
					if (a * a + b * b > half * half + 0.5) continue;
					const si = si0 + a, di = di0 + b;
					if (si < 0 || si >= C || di < 0 || di >= W) continue;
					const ix = si * W + di;
					if (mask[ix] === -32768 || zz < mask[ix]) mask[ix] = zz;
					if (zz < lowZ[ix]) lowZ[ix] = zz;
				}
			}
		}
		yield;
		const bridged = new Uint8Array(C * W);
		for (let ix = 0; ix < mask.length; ix++) {
			if (coreLo[ix] === 32767) continue;
			if (coreHi[ix] - coreLo[ix] > 40) { mask[ix] = lowZ[ix]; bridged[ix] = 1; }
			// w pasie jezdni – jej poziom (pobocze wyższej drogi obok nie podnosi niższej jezdni)
			else mask[ix] = coreHi[ix];
		}
		if (!e.rBridged) e.rBridged = new Map();
		e.rBridged.set(c, bridged);
		if (!e.rTrench) e.rTrench = new Map();
		for (const k of e.rTrench.keys()) if (Math.abs(k - c) > 12) e.rTrench.delete(k);
		e.rTrench.set(c, trFlag);
		if (!e.rCoreLo) e.rCoreLo = new Map();
		for (const k of e.rCoreLo.keys()) if (Math.abs(k - c) > 12) e.rCoreLo.delete(k);
		e.rCoreLo.set(c, coreLo);
		/* Mury oporowe: jezdnia obok niższej (rampa wiaduktu nad ulicą w dole) – w pasie niższej jezdni do 7 m od krawędzi
		   wyższej ponad 1,2 m niżej; przy końcach wiaduktów drogowych z mapy także rampa nad terenem (pomiar terenu ponad
		   1,5 m niżej 4,5 m od krawędzi – wykop przy torach). Mur przy krawędzi wyższej jezdni od niższego poziomu do jej
		   poziomu + balustrada 1 m; pobocze wyższej drogi po stronie muru nie podnosi terenu. Dawniej siatka terenu (węzły
		   co ok. 10 m) rozmazywała różnicę poziomów w stromy klin, a rampa zjeżdżała po nim. */
		const walls = [], D0 = e.dem;
		if (D0 && D0.lidar) {
			const abs = (z) => D0.base + z / 10 - D0.off, rel = (y) => Math.round((y + D0.off - D0.base) * 10);
			const coreAt = (s, d) => {
				const si = Math.floor(s - s0), di = Math.floor(d + MASK_D);
				return si < 0 || si >= C || di < 0 || di >= W ? undefined : coreLo[si * W + di];
			};
			const trAt = (s, d) => {
				const si = Math.floor(s - s0), di = Math.floor(d + MASK_D);
				return si >= 0 && si < C && di >= 0 && di < W && trFlag[si * W + di] === 1;
			};
			const oEnds = [];
			for (let cc = c - 2; cc <= c + 2; cc++) for (const orow of e.oByChunk.get(cc) || []) oEnds.push([orow[1], orow[2]], [orow[orow.length - 2], orow[orow.length - 1]]);
			const nearO = (s1, d1) => oEnds.some(([s2, d2]) => Math.hypot(s2 - s1, d2 - d1) < 45);
			const clear = [];
			for (const cc of [c - 1, c, c + 1]) for (const { k, row, i } of e.rByChunk.get(cc) || []) {
				const z = e.roadZ.get(row);
				if (!z || row[0] > 6) continue; // bez ścieżek i chodników
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2], L = Math.hypot(sb - sa, db - da);
				if (L < 0.5 || Math.abs(da) < 9 || Math.abs(db) < 9 || Math.max(sa, sb) < s0 - 1 || Math.min(sa, sb) > s0 + C + 1) continue;
				const hw = Math.max(e.rInfo[i].w || 5, ROAD_W[row[0]] || 5) / 2, us = (sb - sa) / L, ud = (db - da) / L;
				const trR = e.trench && e.trench.get(row);
				for (const sg of [1, -1]) {
					const ns = -ud * sg, nd = us * sg;
					let cur = null;
					for (let t = 0; t <= L + 1e-6; t += 1) {
						const tt = Math.min(t, L), ps = sa + us * tt, pd = da + ud * tt, zA = z[k] + ((z[k + 1] - z[k]) * tt) / L;
						if (ps < s0 || ps >= s0 + C) { cur = null; continue; }
						// od 1,7 m za krawędzią (pas własnej jezdni w masce sięga 0,5 m dalej, z zaokrągleniem komórek – do ok. 1,4 m)
						let lo = null, oLo = hw + 3.5, road = false, blocked = false, hiQ = -Infinity;
						for (let o = hw + 1.7; o <= hw + 7.5; o += 0.5) {
							const q = coreAt(ps + ns * o, pd + nd * o);
							if (q === undefined) break;
							if (q !== 32767 && q < zA - 12) {
								// niższa jezdnia we wkopie (bez wkopu tej drogi) – ścianę stawia wkop, ta droga zostaje na górze
								if (!trR && trAt(ps + ns * o, pd + nd * o)) { blocked = true; break; }
								lo = q; oLo = o; road = true; break;
							}
							if (q !== 32767 && q <= zA + 12) { blocked = true; break; } // inna jezdnia w podobnym poziomie – bez muru
							if (q !== 32767) { hiQ = q; break; } // wyższa jezdnia obok (ulica nad wkopem)
						}
						// ściana wkopu: od jezdni do poziomu ulic obok (+ balustrada)
						if (lo === null && !blocked && trR) {
							let rA = Number.isNaN(trR[k]) ? trR[k + 1] : Number.isNaN(trR[k + 1]) ? trR[k] : trR[k] + ((trR[k + 1] - trR[k]) * tt) / L;
							if (hiQ > rA) rA = hiQ;
							// dalej (8 m za krawędzią) niżej niż ulice – np. rampa zjazdu obok: mur do jej poziomu
							const qs = ps + ns * (hw + 8), qd = pd + nd * (hw + 8), si = Math.floor(qs - s0), di = Math.floor(qd + MASK_D);
							const mz = si >= 0 && si < C && di >= 0 && di < W ? mask[si * W + di] : -32768;
							const far = mz !== -32768 ? mz : rel(this.demGround(qs, qd));
							if (far < rA) rA = Math.max(zA + 15, far);
							if (!Number.isNaN(rA) && rA > zA + 15) {
								if (!cur) { cur = []; walls.push(cur); }
								cur.push({ s: ps + ns * (hw + 0.3), d: pd + nd * (hw + 0.3), y0: abs(zA) - 0.3, y1: abs(rA) + 1.0, cap: abs(rA), ns, nd });
								continue;
							}
						}
						if (lo === null && oEnds.length && nearO(ps, pd)) {
							const qs = ps + ns * (hw + 4.5), qd = pd + nd * (hw + 4.5), g = this.demGround(qs, qd);
							if (abs(zA) - g > 1.5 && Math.abs(qd) > 7) lo = rel(g);
						}
						if (lo === null) { cur = null; continue; }
						if (!cur) { cur = []; walls.push(cur); }
						cur.push({ s: ps + ns * (hw + 0.3), d: pd + nd * (hw + 0.3), y0: abs(lo) - 0.3, y1: abs(zA) + 0.1 + 1.0 });
						// między murem a niższą jezdnią – teren w jej poziomie; przy rampie – teren z pomiaru
						for (let o = hw + 0.5; o <= oLo; o += 0.5) clear.push(ps + ns * o, pd + nd * o, road ? lo : -32768);
					}
				}
				yield;
			}
			// pobocze za murem: teren z pomiaru (poza pasami jezdni)
			for (let q = 0; q < clear.length; q += 3) {
				const si = Math.floor(clear[q] - s0), di = Math.floor(clear[q + 1] + MASK_D);
				for (const [a2, b2] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
					const ix = (si + a2) * W + di + b2;
					if (si + a2 >= 0 && si + a2 < C && di + b2 >= 0 && di + b2 < W && coreLo[ix] === 32767) mask[ix] = clear[q + 2];
				}
			}
		}
		if (!e.rWalls) e.rWalls = new Map();
		for (const k of e.rWalls.keys()) if (Math.abs(k - c) > 12) e.rWalls.delete(k);
		// łączenie odcinków muru (kolejne odcinki drogi, przerwy do 2,5 m) – bez pojedynczych płyt; najkrótsze (do 4 m) pominięte
		const ws = walls.filter((w) => w.length > 0);
		for (let merged = true; merged; ) {
			merged = false;
			for (let i1 = 0; i1 < ws.length && !merged; i1++) for (let i2 = 0; i2 < ws.length && !merged; i2++) {
				if (i1 === i2) continue;
				const A = ws[i1], B = ws[i2], ea = A[A.length - 1];
				const dist = (p1, p2) => Math.hypot(p1.s - p2.s, p1.d - p2.d);
				if (dist(ea, B[0]) < 2.5) { ws[i1] = A.concat(B); ws.splice(i2, 1); merged = true; }
				else if (dist(ea, B[B.length - 1]) < 2.5 && dist(A[0], B[0]) > 2.5) { ws[i1] = A.concat(B.slice().reverse()); ws.splice(i2, 1); merged = true; }
			}
		}
		const wLen = (w) => w.reduce((L, q, j) => L + (j ? Math.hypot(q.s - w[j - 1].s, q.d - w[j - 1].d) : 0), 0);
		e.rWalls.set(c, ws.filter((w) => w.length > 1 && wLen(w) >= 4));
		// tory z mapy poza torowiskiem naszej linii (po drogach – mają pierwszeństwo): teren pod nimi na poziomie podtorza
		// (nasyp do 2,5 m, wykop do 6 m)
		const D = e.dem, th = this.route.env.th;
		if (D && D.lidar && th) {
			const byTrack = new Uint8Array(C * W); // komórka z toru: na nakładaniu się pasów – niższy tor
			for (const cc of [c - 1, c, c + 1]) for (const { k, row, i } of e.tByChunk.get(cc) || []) {
				/* tor w tunelu – nie kształtuje terenu; tor na moście – tylko tam, gdzie leży mniej niż 2,5 m nad terenem z pomiaru
				   (warunek dg niżej): bez prześwitu pod „mostem” z danych (np. perony Stadionu w NMT) podsypka i perony nie giną
				   w terenie */
				if (!th[i] || row[0] & 16) continue;
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2];
				// tor osobnego tunelu obok naszego (stare pliki) – nie rysowany, bez rowu w terenie
				if (!(row[0] & 2) && (this.envRowFromTunnel(i) || this.envBuriedNearTunnel((sa + sb) / 2, (da + db) / 2, this.envRowY(i, k, (sa + sb) / 2, (da + db) / 2)))) continue;
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
						/* jezdnia ponad 1 m niżej niż podtorze (ulica pod mostem z mapy – przy końcach przęsła tor leży nisko nad
						   pomiarem): zostaje – dawniej teren i jezdnia wspinały się klinami pod przęsło (Toruń Główny) */
						if (!byTrack[ix] && mask[ix] !== -32768 && mask[ix] < zz - 10) continue;
						if (!byTrack[ix] || zz < mask[ix]) { mask[ix] = zz; byTrack[ix] = 1; }
					}
				}
				yield;
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
		/* ulice nad tunelem naszej linii: jezdnia nie niżej niż 0,5 m nad stropem (jak teren – demTerrainY), poza obrysem
		   obudowy zjazd 8% w bok; dawniej na poziomie z pomiaru – przy płytkim przykryciu (np. 3 m za wschodnim portalem
		   tunelu średnicowego) strop i lampy tunelu przebijały jezdnię. Tylko w obrębie tunelu wzdłuż toru (przed portalem
		   wykop z torami) */
		if (D && D.lidar) for (const t of this.route.tunnels || []) {
			if (t.to < s0 || t.from > s0 + C) continue;
			for (let si = 0; si < C; si++) {
				const s = s0 + si + 0.5;
				if (s < t.from || s > t.to || this.envTunnelK(s) < 0.5) continue;
				const [l, rr] = this.envTunnelSides(s), top = R.heightAt(this.route, s) + this.envTunnelH(s) + 0.5;
				const zt = (top + D.off - D.base) * 10, reach = (top - this.demGround(s, (l + rr) / 2) + 1) / 0.08;
				for (let di = Math.max(0, Math.floor(l - reach + MASK_D)); di < Math.min(W, Math.ceil(rr + reach + MASK_D)); di++) {
					const ix = si * W + di;
					if (mask[ix] === -32768) continue;
					const d = di - MASK_D + 0.5, out = Math.max(0, l - d, d - rr);
					const z = Math.round(zt - out * 0.8);
					if (z > mask[ix]) mask[ix] = z;
				}
			}
		}
		e.rmasks.set(c, mask);
		return mask;
	};
	/* łączniki dróg pod mostami naszej linii (envUnderLinks) z wysokością z pomiaru końców łączonych dróg (dm, jak
	   env.rh): [ti, sa, da, sb, db, za, zb]; bez pomiaru – null. Dawniej łącznik leżał na terenie, a końce dróg (w
	   przejściu pod mostem kilka metrów niżej) kończyły się rowem z uskokiem przed mostem. */
	World.prototype.envLinksZ = function () {
		const e = this.env;
		if (e.linksZ) return e.linksZ;
		const env = this.route.env;
		if (!e.roadLinks) e.roadLinks = this.envUnderLinks(env.r, 1);
		const endZ = (sx, dx) => {
			for (const row of env.r) {
				const z = e.roadZ.get(row);
				if (!z) continue;
				const n = (row.length - 1) / 2;
				for (const k of [0, n - 1]) if (Math.hypot(row[1 + k * 2] - sx, row[2 + k * 2] - dx) < 0.6) return z[k];
			}
			return null;
		};
		e.linksZ = e.roadLinks.map((lk) => { const za = endZ(lk[1], lk[2]), zb = endZ(lk[3], lk[4]); return za === null || zb === null ? null : lk.concat([za, zb]); });
		return e.linksZ;
	};
	/* Mury oporowe (liczone z maską dróg kawałka – envRoadMask): łamane [{ s, d, y0, y1 }] wzdłuż krawędzi jezdni. */
	World.prototype.envRetainingWalls = function (c) {
		const e = this.env;
		if (!e || !e.dem || !e.dem.lidar) return [];
		this.envRoadMask(c);
		return (e.rWalls && e.rWalls.get(c)) || [];
	};
	World.prototype.buildEnvRetainingWalls = function (group, c) {
		const walls = this.envRetainingWalls(c), r = this.route, e = this.env;
		const portals = (e.trPortals || []).filter((q) => Math.floor(q.s / C) === c);
		if (!walls.length && !portals.length) return;
		const P = [], dark = [], cap = [];
		const at = (q, y) => { R.sidePoint(r, q.s, q.d, tp); return [tp.x, y, tp.z]; };
		for (const w of walls) for (let j = 1; j < w.length; j++) {
			const a = w[j - 1], b = w[j];
			const a0 = at(a, a.y0), a1 = at(a, a.y1), b0 = at(b, b.y0), b1 = at(b, b.y1);
			P.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
			// ściana wkopu: chodnik na koronie (7 m na zewnątrz, na poziomie ulic) – przykrywa przejście siatki terenu z dna
			if (a.cap !== undefined && b.cap !== undefined && a.ns * b.ns + a.nd * b.nd > 0.7 && Math.hypot(a.s - b.s, a.d - b.d) < 3 && Math.abs(a.cap - b.cap) < 1) {
				const o = (q, w) => ({ s: q.s + q.ns * w, d: q.d + q.nd * w });
				const c0 = at(o(a, 0), a.cap + 0.04), c1 = at(o(b, 0), b.cap + 0.04), c2 = at(o(b, 7.2), b.cap + 0.04), c3 = at(o(a, 7.2), a.cap + 0.04);
				cap.push(...c0, ...c1, ...c2, ...c0, ...c2, ...c3);
			}
		}
		/* portale tuneli na końcach jezdni we wkopie: ściana czołowa w poprzek (filary po bokach, nadproże nad wlotem
		   wysokości do 5,5 m) i ciemne wnętrze tunelu (8 m w głąb) */
		const quad = (dst, A, B, Cq, Dq) => dst.push(...A, ...B, ...Cq, ...A, ...Cq, ...Dq);
		for (const q of portals) {
			const ns = -q.ud, nd = q.us, Wd = q.hw + 2, top = q.top + 1, open = Math.min(q.z + 5.5, q.top - 0.8);
			const pt = (o, along, y) => at({ s: q.s + ns * o + q.us * along, d: q.d + nd * o + q.ud * along }, y);
			quad(P, pt(-Wd, 0, q.z - 0.3), pt(-q.hw, 0, q.z - 0.3), pt(-q.hw, 0, top), pt(-Wd, 0, top));
			quad(P, pt(q.hw, 0, q.z - 0.3), pt(Wd, 0, q.z - 0.3), pt(Wd, 0, top), pt(q.hw, 0, top));
			quad(P, pt(-q.hw, 0, open), pt(q.hw, 0, open), pt(q.hw, 0, top), pt(-q.hw, 0, top));
			const D8 = 12;
			// płyta stropu portalu nad wlotem (16 m w głąb – zakrywa przejście terenu z dna wkopu do ulic nad tunelem)
			quad(P, pt(-Wd - 3, 0, q.top + 0.05), pt(Wd + 3, 0, q.top + 0.05), pt(Wd + 3, 20, q.top + 0.05), pt(-Wd - 3, 20, q.top + 0.05));
			quad(dark, pt(-q.hw, D8, q.z - 0.2), pt(q.hw, D8, q.z - 0.2), pt(q.hw, D8, open), pt(-q.hw, D8, open));
			quad(dark, pt(-q.hw, 0.05, q.z - 0.2), pt(-q.hw, D8, q.z - 0.2), pt(-q.hw, D8, open), pt(-q.hw, 0.05, open));
			quad(dark, pt(q.hw, 0.05, q.z - 0.2), pt(q.hw, D8, q.z - 0.2), pt(q.hw, D8, open), pt(q.hw, 0.05, open));
			quad(dark, pt(-q.hw, 0.05, open), pt(q.hw, 0.05, open), pt(q.hw, D8, open), pt(-q.hw, D8, open));
			quad(dark, pt(-q.hw, 0.05, q.z + 0.02), pt(q.hw, 0.05, q.z + 0.02), pt(q.hw, D8, q.z + 0.02), pt(-q.hw, D8, q.z + 0.02));
		}
		if (cap.length) {
			const g3 = new T.BufferGeometry();
			g3.setAttribute('position', new T.Float32BufferAttribute(cap, 3));
			g3.computeVertexNormals();
			if (!World.capM) World.capM = new T.MeshLambertMaterial({ color: '#a7a49d', side: T.DoubleSide });
			const m3 = new T.Mesh(g3, World.capM);
			m3.receiveShadow = true;
			group.add(m3);
		}
		if (dark.length) {
			const g2 = new T.BufferGeometry();
			g2.setAttribute('position', new T.Float32BufferAttribute(dark, 3));
			if (!World.tunnelM) World.tunnelM = new T.MeshBasicMaterial({ color: '#0b0c0e', side: T.DoubleSide });
			group.add(new T.Mesh(g2, World.tunnelM));
		}
		if (!P.length) return;
		const geo = new T.BufferGeometry();
		geo.setAttribute('position', new T.Float32BufferAttribute(P, 3));
		geo.computeVertexNormals();
		if (!World.wallM) World.wallM = new T.MeshLambertMaterial({ color: '#aaa69d', side: T.DoubleSide });
		const m = new T.Mesh(geo, World.wallM);
		m.castShadow = true;
		m.receiveShadow = true;
		group.add(m);
	};
	World.prototype.roadBridged = function (s, d) {
		const e = this.env;
		if (!e || Math.abs(d) >= MASK_D) return false;
		const c = Math.floor(s / C);
		this.envRoadMask(c);
		const b = e.rBridged && e.rBridged.get(c);
		return !!b && b[Math.floor(s - c * C) * 2 * MASK_D + Math.floor(d + MASK_D)] === 1;
	};
	World.prototype.roadLevel = function (s, d) {
		const e = this.env, D = e && e.dem;
		if (!D || !D.lidar || Math.abs(d) >= MASK_D) return undefined;
		const c = Math.floor(s / C);
		if (!e.rmasks.has(c) && e.rmBusy && e.rmBusy.has(c)) return undefined;
		const z = this.envRoadMask(c)[Math.floor(s - c * C) * 2 * MASK_D + Math.floor(d + MASK_D)];
		return z === -32768 ? undefined : D.base + z / 10 - D.off;
	};
	/* Wysokość węzła siatki terenu (wiersze co 4 m, kolumny World.TERRAIN_D – daleko od toru co kilkadziesiąt metrów):
	   teren, ale nie wyżej niż najniższa jezdnia (albo tor z mapy) w trójkątach przylegających do węzła. Inaczej płaskie
	   trójkąty rozpięte nad drogą między wyższymi punktami obok wystawały ponad jej poziom z pomiaru, a nawierzchnia
	   (surfY – nie niżej niż siatka) wspinała się po nich: drogi, chodniki i ścieżki falowały (do ok. 0,8 m). Węzły
	   przy torze (do 8 m) bez zmian. */
	/* kolumny siatki terenu kawałka c: World.TERRAIN_D, a przy wkopach drogowych (envTrenchInit) dodatkowo co 2,5 m w pasie
	   wkopu ±6 m – ściany wkopu ostre zamiast doliny na szerokość kilku kolumn (daleko od toru co 60–80 m) */
	World.prototype.envTerrainCols = function (c) {
		const e = this.env, TD = World.TERRAIN_D;
		if (!e || !e.trByChunk || !TD) return TD;
		if (!e.tCols) e.tCols = new Map();
		let cols = e.tCols.get(c);
		if (cols) return cols;
		const segs = e.trByChunk.get(c) || [];
		// cieki w tym kawałku: pas koryta (z brzegami) – tylko odcinki biegnące wzdłuż toru (pas w poprzek < 40 m)
		const wsegs = (e.dem && this.envStreamSegs().get(c)) || [];
		if (!segs.length && !wsegs.length) cols = TD;
		else {
			const add = [];
			for (const [, da, , db, hw] of segs) {
				const a = Math.min(da, db) - hw - 6, b = Math.max(da, db) + hw + 6;
				for (let d = Math.ceil(a / 2.5) * 2.5; d <= b; d += 2.5) if (Math.abs(d) > 10 && d > TD[0] && d < TD[TD.length - 1]) add.push(d);
			}
			for (const [sa, da, sb, db, w] of wsegs) {
				if (Math.max(sa, sb) < c * C - 4 || Math.min(sa, sb) > (c + 1) * C + 4) continue;
				const hb = w / 2 + wBank(w) + 3;
				if (Math.abs(db - da) + 2 * hb > 40) continue;
				const a = Math.min(da, db) - hb, b = Math.max(da, db) + hb, stp = Math.max(1.5, Math.min(3, w / 3));
				for (let d = Math.ceil(a / stp) * stp; d <= b; d += stp) if (Math.abs(d) > 10 && d > TD[0] && d < TD[TD.length - 1]) add.push(d);
			}
			const all = [...TD, ...add].sort((x, y) => x - y);
			cols = all.filter((d, j) => j === 0 || d - all[j - 1] > 0.8 || TD.includes(d));
			cols = cols.filter((d, j) => j === 0 || d !== cols[j - 1]);
		}
		e.tCols.set(c, cols);
		return cols;
	};
	World.prototype.meshTerrainY = function (s, d) {
		const y = this.terrainY(s, d), e = this.env, D = e && e.dem, TD = this.envTerrainCols(Math.floor(s / C));
		if (!D || !D.lidar || !TD || Math.abs(d) < 8 || Math.abs(d) >= MASK_D - 1) return y;
		// za portalem tunelu (12 m w głąb, pod płytą portalu) – teren na poziomie jezdni (bez zbocza w otworze wlotu)
		for (const q of e.trPortals || []) {
			const a = (s - q.s) * q.us + (d - q.d) * q.ud, o = -(s - q.s) * q.ud + (d - q.d) * q.us;
			if (a > -0.5 && a < 14.5 && Math.abs(o) < q.hw + 4.5) return Math.min(y, q.z - 0.2);
		}
		// węzeł we wkopie (do 1,5 m za krawędzią jezdni) – w dół do jezdni we wkopie; poza nim jezdnie we wkopie pomijane
		/* węzeł do 4,5 m za krawędzią jezdni we wkopie – na dno: trójkąt siatki z węzłem na górze nie wchodzi przed mur
		   (węzły co 2,5 × 4 m; dawniej trójkąty trawy przed ścianą); rów za murem przykrywa płyta chodnika (mury) */
		const inTr = this.envInTrench(s, d, 4);
		let j = 0;
		while (j < TD.length - 1 && TD[j] < d - 0.01) j++;
		const dl = Math.max(-MASK_D + 1, j > 0 ? TD[j - 1] : d), dr = Math.min(MASK_D - 1, j < TD.length - 1 ? TD[j + 1] : d);
		let zMin = 32767;
		for (let ss = Math.floor(s - 4); ss <= Math.floor(s + 4); ss++) {
			const c = Math.floor(ss / C), mask = this.envRoadMask(c), row = (ss - c * C) * 2 * MASK_D, trF = !inTr && e.rTrench && e.rTrench.get(c);
			for (let dd = Math.floor(dl + MASK_D); dd <= Math.floor(dr + MASK_D); dd++) {
				const z = mask[row + dd];
				if (z !== -32768 && z < zMin && !(trF && trF[row + dd])) zMin = z;
			}
		}
		if (inTr) { const tz = this.envTrenchFloor(s, d); if (tz !== undefined) return Math.min(y, tz); }
		return zMin === 32767 ? y : Math.min(y, D.base + zMin / 10 - D.off);
	};
	/* Droga przejazdu kolejowego na trasie rzeczywistej: prawdziwa ulica z mapy (ucięta przy torze) – koniec po jednej
	   i po drugiej stronie toru przy przejeździe, połączone odcinkiem przez tory; z każdej strony do ok. 120 m ulicy.
	   Wynik: pts ([s, d] od strony d < 0), cum, L, link [a, b] (łącznik – do narysowania jezdni), zone [a, b] – pas torów
	   (tor pociągu i tory z mapy, ±3,2 m) wzdłuż drogi; null – brak pary końców (wtedy droga z gry w poprzek toru). */
	World.prototype.envCrossingPath = function (cr) {
		const env = this.route.env;
		if (!env || !env.r) return null;
		const ends = [];
		env.r.forEach((row, i) => {
			const n = (row.length - 1) / 2;
			if (n < 2 || row[0] > 8) return;
			for (const [k, k2] of [[0, 1], [n - 1, n - 2]]) {
				const s = row[1 + k * 2], d = row[2 + k * 2];
				if (Math.abs(s - cr.pos) > 30 || Math.abs(d) > 22 || Math.abs(d) < 3) continue;
				// kierunek od toru: następny punkt dalej od osi
				if (Math.abs(row[2 + k2 * 2]) <= Math.abs(d)) continue;
				ends.push({ i, k, s, d, row, n, ti: row[0] });
			}
		});
		let best = null;
		for (const a of ends) for (const b of ends) {
			if (a.d >= 0 || b.d <= 0) continue;
			// odcinek a–b przecina oś blisko przejazdu; ta sama klasa drogi – premia
			const sx = a.s + ((b.s - a.s) * -a.d) / (b.d - a.d);
			const cost = Math.abs(sx - cr.pos) + (a.ti !== b.ti ? 6 : 0) + Math.abs(a.d) * 0.2 + b.d * 0.2;
			if (Math.abs(sx - cr.pos) < 18 && (!best || cost < best.cost)) best = { a, b, cost };
		}
		if (!best) return null;
		const side = (e) => {
			const out = [];
			let L = 0, prev = null;
			const step = e.k === 0 ? 1 : -1;
			for (let k = e.k; k >= 0 && k < e.n; k += step) {
				const p = [e.row[1 + k * 2], e.row[2 + k * 2]];
				if (prev) L += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
				out.push(p);
				prev = p;
				if (L > 120) break;
			}
			return out; // od toru na zewnątrz
		};
		const A = side(best.a).reverse(), B = side(best.b);
		const pts = A.concat(B), cum = [0];
		for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
		const L = cum[cum.length - 1];
		const at = (u) => {
			let k = 0;
			while (k < cum.length - 2 && cum[k + 1] < u) k++;
			const t = (u - cum[k]) / ((cum[k + 1] - cum[k]) || 1);
			return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t];
		};
		let za = Infinity, zb = -Infinity;
		for (let u = 0; u <= L; u += 0.5) {
			const [s, d] = at(u);
			if (Math.abs(d) < 3.2 || this.envTracksAt(s).some((t) => Math.abs(t.d - d) < 3.2)) { za = Math.min(za, u); zb = Math.max(zb, u); }
		}
		if (za > zb) { za = cum[A.length - 1]; zb = cum[A.length]; }
		// sw – chodniki ulicy (którejś z dwóch części drogi przez przejazd): przejazd dostaje je po obu stronach jezdni
		const inf = (e) => this.env.rInfo[e.i] || {};
		// lanes / one – pasy i jednokierunkowość (oznakowanie poziome jezdni przejazdu – buildCrossing)
		const ia = inf(best.a), wA = ia.w || 6;
		return { pts, cum, L, at, link: [cum[A.length - 1], cum[A.length]], zone: [za, zb], w: wA, sw: ia.sw || inf(best.b).sw ? 1 : 0, lanes: ia.lanes || (wA >= 12 ? 4 : wA >= 5.2 ? 2 : 1), one: ia.one || 0, surf: ia.surf || 0, ti: best.a.row[0] };
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
					if (Math.abs(pd) > 9 && !this.envStationZone(ps, pd) && !this.inBuilding(ps, pd) && Math.floor(s / C) === Math.floor(segs.c0 / C)) spots.push({ s: ps, d: pd, ds: -ns * side, dd: -nd * side, kind: ti <= 4 ? 'main' : 'res' });
					acc += 35;
					side = -side;
				}
				acc -= L;
			}
		}
		if (!spots.length) return;
		dyn.push({ type: 'lamps', lamps: this.envLampMeshes(group, spots) });
	};
	/* Latarnie (słup z wysięgnikiem nad jezdnię) jako instancje: spots – { s, d, ds, dd: kierunek wysięgnika w (s, d),
	   y: poziom podstawy (domyślnie teren), pool: promień plamy światła, poolAt: jej środek od słupa wzdłuż wysięgnika,
	   kind: 'main' – drogi główne i obiekty (słup stożkowy 8,6 m, wysięgnik łukiem, płaska oprawa LED), 'res' – ulice
	   osiedlowe (6,4 m, krótki wysięgnik, oprawa kopułkowa) }. Wynik – punkty świateł do puli nocą. */
	const lampGeo = (kind) => {
		const key = 'lampGeo_' + kind;
		if (World[key]) return World[key];
		const main = kind === 'main', H = main ? 8.6 : 6.4, L = main ? 1.75 : 1.0, V = (x, y, z) => new T.Vector3(x, y, z);
		const GAL = [0.56, 0.59, 0.62], DARK = [0.2, 0.22, 0.24], HEAD = [0.3, 0.32, 0.34];
		const r0 = main ? 0.09 : 0.075, r1 = main ? 0.055 : 0.045;
		/* (wg zdjęć latarni drogowych): cokół toczony z fazą, słup stożkowy, drzwiczki rewizyjne nad cokołem, kołnierz pod
		   wysięgnikiem; wysięgnik łukiem z tulejką na końcu */
		const parts = [
			{ geo: new T.LatheGeometry([[0, 0], [0.17, 0], [0.17, 0.05], [0.15, 0.08], [0.14, 0.55], [0.11, 0.62], [r0, 0.64], [0, 0.64]].map(([r, y]) => new T.Vector2(r, y)), 16), color: DARK },
			{ geo: new T.CylinderGeometry(r1, r0, H, 16).translate(0, H / 2, 0), color: GAL },
			{ geo: new T.BoxGeometry(0.06, 0.32, 0.03).translate(0, 1.05, -r0 + 0.004), color: HEAD }, // drzwiczki (od strony chodnika)
			{ geo: new T.CylinderGeometry(r1 + 0.02, r1 + 0.02, 0.08, 16).translate(0, H - 0.45, 0), color: HEAD },
			{ geo: new T.TubeGeometry(new T.QuadraticBezierCurve3(V(0, H - 0.4, 0), V(0, H + 0.25, 0.12), V(0, H + 0.2, L)), 14, main ? 0.04 : 0.035, 8), color: GAL },
			{ geo: new T.CylinderGeometry(main ? 0.05 : 0.045, main ? 0.05 : 0.045, 0.16, 10).rotateX(Math.PI / 2).translate(0, H + 0.2, L + 0.04), color: HEAD },
		];
		let hy, hz, lw, ll;
		if (main) {
			/* oprawa LED: płaski, opływowy korpus (profil boczny – wyższy przy wysięgniku, ścięty ku przodowi, zaokrąglone
			   krawędzie), od spodu klosz (instancja lens), radiator – żebra na wierzchu */
			hz = L + 0.4; hy = H + 0.125; lw = 0.28; ll = 0.62;
			const sh = new T.Shape(), z0 = -0.38, z1 = 0.38;
			sh.moveTo(z0, 0);
			sh.lineTo(z1, 0);
			sh.quadraticCurveTo(z1 + 0.04, 0.03, z1 - 0.02, 0.055);
			sh.quadraticCurveTo(0.05, 0.1, z0 + 0.06, 0.13);
			sh.quadraticCurveTo(z0, 0.135, z0, 0.08);
			sh.lineTo(z0, 0);
			const body = new T.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 6 });
			body.translate(0, 0, -0.15);
			body.rotateY(-Math.PI / 2); // profil (z, y) – długość wzdłuż wysięgnika
			parts.push({ geo: body.translate(0, H + 0.12, hz), color: HEAD });
			for (let k = -2; k <= 2; k++) parts.push({ geo: new T.BoxGeometry(0.02, 0.025, 0.36).translate(k * 0.05, H + 0.235, hz - 0.12), color: DARK });
		} else {
			// oprawa kopułkowa: klosz-czasza, kołnierz, iglica na szczycie
			hz = L + 0.22; hy = H + 0.1; lw = 0.3; ll = 0.46;
			parts.push({ geo: new T.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.75, 0.55, 1.1).translate(0, H + 0.1, hz), color: HEAD });
			parts.push({ geo: new T.CylinderGeometry(0.235, 0.235, 0.03, 16).scale(1, 1, 1.47).translate(0, H + 0.105, hz), color: DARK });
			parts.push({ geo: new T.ConeGeometry(0.03, 0.12, 8).translate(0, H + 0.32, hz), color: DARK });
		}
		World[key] = { geo: NS.props.merge(parts), hy, hz, lw, ll };
		return World[key];
	};
	World.prototype.envLampMeshes = function (group, spots) {
		const r = this.route, M = World.materials();
		const body = World.lampBodyM || (World.lampBodyM = patch(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5 }), 'lit'));
		body.userData.shared = true;
		const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1);
		const lamps = [];
		for (const kind of ['main', 'res']) {
			const list = spots.filter((sp) => (sp.kind || 'main') === kind);
			if (!list.length) continue;
			const G = lampGeo(kind);
			const mk = (geo, mat2) => { const m = new T.InstancedMesh(geo, mat2, list.length); m.count = list.length; return m; };
			const poles = mk(G.geo, body), lens = mk(NS.util.GEO.box, M.lampLens), pools = mk(M.poolGeo, M.lampPool);
			list.forEach((sp, k) => {
				R.sidePoint(r, sp.s, sp.d, tp);
				const y0 = sp.y !== undefined ? sp.y : this.terrainY(sp.s, sp.d), pr = sp.pool || 7;
				const bx = tp.x, bz = tp.z;
				// kierunek wysięgnika (nad jezdnię) w świecie – z punktu o metr dalej w (s, d) (obrót wg kursu toru dawał
				// wysięgnik wzdłuż drogi zamiast w poprzek)
				R.sidePoint(r, sp.s + sp.ds, sp.d + sp.dd, tp);
				const aL = Math.hypot(tp.x - bx, tp.z - bz) || 1, ax = (tp.x - bx) / aL, az = (tp.z - bz) / aL;
				q.setFromAxisAngle(up, Math.atan2(ax, az));
				poles.setMatrixAt(k, m4.compose(p3.set(bx, y0, bz), q, one));
				lens.setMatrixAt(k, m4.compose(p3.set(bx + ax * G.hz, y0 + G.hy - 0.012, bz + az * G.hz), q, sc.set(G.lw, 0.02, G.ll)));
				const pc = sp.poolAt || G.hz;
				pools.setMatrixAt(k, m4.compose(p3.set(bx + ax * pc, y0 + 0.12, bz + az * pc), Q_ID, sc.set(pr, 1, pr)));
				const o = new T.Object3D();
				o.position.set(bx + ax * G.hz, y0 + G.hy - 0.05, bz + az * G.hz);
				o.userData.power = kind === 'main' ? 0.85 : 0.65;
				o.userData.drop = 1.2;
				// drogi główne – LED ciepłobiałe, szerzej; osiedlowe – sodowe pomarańczowe (mapa nocna)
				o.userData.tint = kind === 'main' ? '255,226,190' : '255,170,90';
				o.userData.reach = kind === 'main' ? 13 : 10;
				group.add(o);
				lamps.push(o);
			});
			poles.castShadow = this.shadows;
			pools.renderOrder = 5;
			pools.frustumCulled = false;
			group.add(poles, lens, pools);
		}
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
			if (this.roadBelowDeck(s, d, pr.top + 0.9, 0.5)) return false;
		}
		return true;
	};
	/* ulica z mapy pod pomostem w punkcie (s, d): odcinek drogi (env.r – bez samych obiektów) bliżej niż połowa jej szerokości
	   + margin, a pomost (wierzch y) ponad 3 m nad terenem. Maska dróg (onRoad) i poziom jezdni z pomiaru (roadLevel) obejmują
	   też sam pomost – z nimi każdy punkt pod wiaduktem wyglądał jak droga i filary nie stawały nigdzie (wiadukt 140 m nad
	   stacją towarową bez podpory) */
	World.prototype.roadBelowDeck = function (s, d, y, margin = 1.5) {
		if (y - this.terrainY(s, d) <= 3) return false;
		const e = this.env, G8 = 8;
		/* siatka odcinków ulic (komórki 8 × 8 m w (s, d), odcinek w komórkach swojego prostokąta poszerzonego o połowę
		   szerokości jezdni i 2 m) – raz na trasę; dawniej każde zapytanie przeglądało wszystkie odcinki trzech kawałków */
		if (!e.rSegGrid) {
			const grid = (e.rSegGrid = new Map());
			const add = (s1, d1, s2, d2, hr) => {
				const hw = hr + 2;
				for (let a = Math.floor((Math.min(s1, s2) - hw) / G8); a <= Math.floor((Math.max(s1, s2) + hw) / G8); a++)
					for (let b = Math.floor((Math.min(d1, d2) - hw) / G8); b <= Math.floor((Math.max(d1, d2) + hw) / G8); b++) {
						const key = a * 100003 + b;
						if (!grid.has(key)) grid.set(key, []);
						grid.get(key).push([s1, d1, s2, d2, hr]);
					}
			};
			const ends = []; // końce ulic przy torze (3–16 m od osi, dalszy punkt dalej od osi)
			(this.route.env.r || []).forEach((row, i) => {
				/* pół szerokości jak rysowana jezdnia (szerokość z BDOT, chodniki 2,6 m – jak maska dróg); dawniej tylko wg klasy
				   drogi – na szerokich ulicach (np. 4 pasy z BDOT) filar wiaduktu stawał na pasie ruchu */
				const q = e.rInfo[i] || {}, hr = Math.max(q.w || 0, ROAD_W[row[0]] || 6) / 2 + (q.sw ? 2.6 : 0.4);
				const n = (row.length - 1) / 2;
				for (let k = 0; k < n - 1; k++) add(row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], hr);
				if (n > 1) for (const [k, k2] of [[0, 1], [n - 1, n - 2]]) {
					const sE = row[1 + k * 2], dE = row[2 + k * 2];
					if (Math.abs(dE) > 3 && Math.abs(dE) < 16 && Math.abs(row[2 + k2 * 2]) > Math.abs(dE)) ends.push({ s: sE, d: dE, hr, ti: row[0] });
				}
			});
			/* ulica przerwana w danych przy torze (końce po obu stronach osi, przecięcie osi do 12 m od siebie): łącznik pod
			   wiaduktem też jest jezdnią – dawniej filar wiaduktu stawał na nim (Tarnowskie Góry – Katowice km 20,2) */
			for (const a of ends) {
				if (a.d >= 0) continue;
				let best = null, bc = Infinity;
				for (const b of ends) {
					if (b.d <= 0 || Math.abs(b.s - a.s) > 12) continue;
					const c = Math.abs(b.s - a.s) + (a.ti !== b.ti ? 6 : 0);
					if (c < bc) { bc = c; best = b; }
				}
				if (best) add(a.s, a.d, best.s, best.d, Math.max(a.hr, best.hr));
			}
		}
		let near = false;
		for (const [s1, d1, s2, d2, hr] of e.rSegGrid.get(Math.floor(s / G8) * 100003 + Math.floor(d / G8)) || []) {
			const L2 = (s2 - s1) ** 2 + (d2 - d1) ** 2 || 1e-9, t = Math.max(0, Math.min(1, ((s - s1) * (s2 - s1) + (d - d1) * (d2 - d1)) / L2));
			if (Math.hypot(s1 + (s2 - s1) * t - s, d1 + (d2 - d1) * t - d) < hr + margin) { near = true; break; }
		}
		if (!near) return false;
		// ulica obok na poziomie pomostu (np. wzdłuż wiaduktu kolejowego przy przyczółku) – nie pod nim
		const rl = this.roadLevel(s, d);
		return rl === undefined || rl < y - 3;
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
		let cum = [0];
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
			if (Math.abs(d) < 6 || this.envTrackGap(s, d) < 3) y = Math.max(y, R.heightAt(r, s) + (this.ownWire(s) ? 6.6 : 5.5) + (rail ? 0.4 : 0));
			return y;
		}) : P.map((_, k) => yOf(k));
		/* wiadukt kolejowy: profil jak tor – nad torami skrajnia (główka szyny 7 m nad naszą, z siecią), dalej co najwyżej
		   2,5% w dół do terenu z pomiaru; pomiar powierzchni (NMPT) łapie sieć trakcyjną i obiekty nad torem – dwa tory na
		   jednym moście wychodziły 2,6 m od siebie, a tor schodził z mostu skokiem (Chorzów Batory km 27,3) */
		if (rail && P.length > 1) {
			const cumR = [0];
			for (let k = 1; k < P.length; k++) cumR.push(cumR[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
			const req = P.map(([s, d]) => (Math.abs(d) < 6 || this.envTrackGap(s, d) < 3 ? R.heightAt(r, s) + (this.ownWire(s) ? 6.6 : 5.5) + 0.4 : -Infinity));
			for (let k = 0; k < P.length; k++) {
				let y = this.terrainY(P[k][0], P[k][1]) + 0.1;
				for (let j = 0; j < P.length; j++) if (req[j] > -Infinity) y = Math.max(y, req[j] - 0.025 * Math.abs(cumR[k] - cumR[j]));
				Y[k] = y;
			}
		}
		/* koniec pomostu nisko nad terenem (zjazd): wierzch w poziomie dochodzącej jezdni (nawierzchnia + 0,1 m), zjazd
		   wyrównany na ostatnich 20 m – z pomiaru (NMPT: balustrady, auta) koniec wypadał ok. 0,5 m wyżej niż ulica
		   dalej i jezdnia urywała się progiem z bokami pomostu */
		if (!rail && P.length > 2) for (const kE of [0, P.length - 1]) {
			const tgt = this.surfY(P[kE][0], P[kE][1]) + 0.1, dz = tgt - Y[kE];
			if (Math.abs(dz) < 0.05 || Math.abs(dz) > 8) continue;
			// długość wyrównania: co najmniej 20 m, przy większej różnicy pochylenie zjazdu do 8%
			let room = 0;
			for (let k = kE, st2 = kE === 0 ? 1 : -1; k >= 0 && k < P.length; k += st2) {
				if (Math.abs(P[k][1]) < 6 || this.envTrackGap(P[k][0], P[k][1]) < 3) break;
				room = Math.abs(cum[k] - cum[kE]);
			}
			// dalej niż 10% na odcinku do toru – estakada / nasyp (bez ściągania pomostu w dół)
			if (dz < 0 && -dz > 0.1 * room + 0.3) continue;
			const LB = Math.min(Math.max(20, Math.abs(dz) / 0.08), Math.max(room, 1));
			for (let k = 0; k < P.length; k++) {
				const u = Math.abs(cum[k] - cum[kE]);
				if (u >= LB || Math.abs(P[k][1]) <= 8) continue;
				let y = Math.max(this.terrainY(P[k][0], P[k][1]) + 0.1, Y[k] + dz * (1 - u / LB));
				// nad torami – skrajnia (jak w profilu z pomiaru)
				if (this.envTrackGap(P[k][0], P[k][1]) < 3) y = Math.max(y, R.heightAt(r, P[k][0]) + (this.ownWire(P[k][0]) ? 6.6 : 5.5));
				Y[k] = y;
			}
		}
		/* wiadukt drogowy kończący się nad wykopem toru (w danych obiekt krótki – np. 11 m nad torem w głębokim
		   wykopie; skarpy wykopu w grze 1:1,5 są szersze niż prawdziwe ściany oporowe): pomost przedłużony w kierunku
		   jezdni, dopóki teren jest ponad 3 m niżej (do 40 m) – inaczej droga dojazdowa schodziła po skarpie na dno
		   wykopu i wracała (zerwany dojazd, „ściany”); jezdnia z mapy pod przedłużeniem nie jest rysowana (inDeckExt) */
		let xa = 0, xb = 0;
		if (!rail && P.length > 1) {
			const ext = (E, Pv, y) => {
				const ux = E[0] - Pv[0], uy = E[1] - Pv[1], L = Math.hypot(ux, uy) || 1, out = [];
				let tEnd = 0; // odległość ostatniego dodanego punktu od końca obiektu
				// teren ponad 3 m niżej – przedłużenie nad wykopem (do 40 m)
				for (let t = 2; t <= 40; t += 2) {
					const q = [E[0] + (ux / L) * t, E[1] + (uy / L) * t];
					if (this.terrainY(q[0], q[1]) > y - 3) break;
					out.push(q);
					tEnd = t;
				}
				/* górna krawędź wykopu (teren do 0,8 m pod pomostem) do 6 m dalej – pomost do niej (pod końcem nasyp – embk):
				   dawniej ostatnie metry skarpy wykopu zostawały pod ulicą bez pomostu (Toruń – Chełmża km 2,25 i 2,34) */
				if (out.length || this.terrainY(E[0], E[1]) < y - 3) {
					const tE = tEnd;
					for (let t = tE + 1; t <= tE + 6; t++) {
						const q = [E[0] + (ux / L) * t, E[1] + (uy / L) * t];
						if (this.terrainY(q[0], q[1]) <= y - 0.8) continue;
						for (let u = tE + 1; u <= t; u++) out.push([E[0] + (ux / L) * u, E[1] + (uy / L) * u]);
						tEnd = t;
						break;
					}
				}
				/* dalej (do 6 m) ulica w poziomie pomostu (do 1,2 m) – pomost dochodzi do niej: obiekt w danych krótszy niż przęsło
				   nad wykopem, między jego końcem a ulicą na skraju wykopu zostawała szczelina 2–4 m (Toruń Miasto) */
				const t0 = tEnd;
				for (let t = t0 + 1; t <= t0 + 6; t++) {
					const q = [E[0] + (ux / L) * t, E[1] + (uy / L) * t];
					const rl = this.onRoad(q[0], q[1]) ? this.roadLevel(q[0], q[1]) : undefined;
					if (rl === undefined || Math.abs(rl - y) > 1.2) continue;
					for (let u = t0 + 1; u < t; u++) out.push([E[0] + (ux / L) * u, E[1] + (uy / L) * u]);
					break;
				}
				return out;
			};
			const n0 = P.length, yA = Y[0], yB = Y[n0 - 1];
			/* koniec pomostu wysoko (ponad 1,5 m) nad dalszą ulicą z mapy (koniec jej łamanej do 2,5 m od końca obiektu) –
			   pomost przedłużony rampą wzdłuż tej ulicy, 8% w dół, do jej poziomu (do 120 m; pod rampą nasyp – embk, ulica
			   pod nią nie jest rysowana – inDeckExt). Dawniej ulica spadała tuż za końcem o kilka metrów (km 24,7 Tarnowskie
			   Góry – Katowice: 4,7 m na 4 m – poszarpany klin jezdni i terenu pod pomostem). Wynik: [[s, d], y][] od końca */
			const ramp = (E, Pv, y) => {
				const e = this.env, out = [];
				// ulica z wierzchołkiem do maxD m od E, dalej w kierunku E − Pv (|cos| ≥ 0,7 – nie ulica w poprzek)
				const find = (E2, Pv2, maxD, skip) => {
					for (let cc = Math.floor(E2[0] / C) - 1; cc <= Math.floor(E2[0] / C) + 1; cc++) for (const { row: rr } of e.rByChunk.get(cc) || []) {
						if (rr === skip) continue;
						const n = (rr.length - 1) / 2;
						if (n < 2) continue;
						let kN = -1, dN = maxD;
						for (let k = 0; k < n; k++) { const dd = Math.hypot(rr[1 + k * 2] - E2[0], rr[2 + k * 2] - E2[1]); if (dd < dN) { dN = dd; kN = k; } }
						if (kN < 0) continue;
						for (const st2 of [1, -1]) {
							if (kN + st2 < 0 || kN + st2 >= n) continue;
							const q = [rr[1 + (kN + st2) * 2], rr[2 + (kN + st2) * 2]];
							const L1 = Math.hypot(q[0] - E2[0], q[1] - E2[1]) || 1, L2 = Math.hypot(E2[0] - Pv2[0], E2[1] - Pv2[1]) || 1;
							if (((q[0] - E2[0]) * (E2[0] - Pv2[0]) + (q[1] - E2[1]) * (E2[1] - Pv2[1])) / (L1 * L2) >= 0.7) return { rr, k: kN, st2, n };
						}
					}
					return null;
				};
				let cur = find(E, Pv, 4, null);
				if (!cur) return out;
				const lvl = (q) => { const rl = this.onRoad(q[0], q[1]) ? this.roadLevel(q[0], q[1]) : undefined; return (rl !== undefined && rl < y - 0.5 ? rl : this.terrainY(q[0], q[1])) + 0.1; };
				// (ulica dalej na wysokości pomostu – estakada dłuższa niż obiekt w danych: bez rampy)
				{
					const { rr, k, st2 } = cur, q1 = [rr[1 + (k + st2) * 2], rr[2 + (k + st2) * 2]], rl1 = this.onRoad(q1[0], q1[1]) ? this.roadLevel(q1[0], q1[1]) : undefined;
					if ((rl1 !== undefined && rl1 > y - 1.5) || y - lvl(q1) < 1.5) return out;
				}
				/* drugi pomost obok (inny obiekt drogowy z mapy, wierzchołek do 14 m, z profilem z pomiaru): ulica biegnie dalej
				   estakadą razem z nim – przedłużenie na jego wysokości, w dół dopiero za nim (km 24,8 Tarnowskie Góry – Katowice:
				   estakada w Chorzowie – w danych obiektem jest tylko jedna jezdnia na całej długości) */
				const D = e.dem;
				const twinY = (pt) => {
					let best = null, bd = 14;
					for (let cc = Math.floor(pt[0] / C) - 1; cc <= Math.floor(pt[0] / C) + 1; cc++) for (const o of e.oByChunk.get(cc) || []) {
						if (o === row) continue;
						const hs = e.deckP && e.deckP.get(o);
						if (!hs || !D || hs.length !== (o.length - 1) / 2) continue;
						for (let j = 0; j < hs.length; j++) {
							const dd = Math.hypot(o[1 + j * 2] - pt[0], o[2 + j * 2] - pt[1]);
							if (dd < bd && hs[j] >= 0) { bd = dd; best = D.base + hs[j] / 10 - D.off; }
						}
					}
					return best;
				};
				let u = 0, prev = [E[0], E[1]], before = Pv, y0 = y;
				for (let hop = 0; hop < 8 && cur; hop++) {
					const { rr, k, st2, n } = cur;
					for (let j = k + st2; j >= 0 && j < n; j += st2) {
						const nx = [rr[1 + j * 2], rr[2 + j * 2]], L = Math.hypot(nx[0] - prev[0], nx[1] - prev[1]), m = Math.max(1, Math.ceil(L / 4));
						for (let q = 1; q <= m; q++) {
							const pt = [prev[0] + ((nx[0] - prev[0]) * q) / m, prev[1] + ((nx[1] - prev[1]) * q) / m];
							u += L / m;
							const tw = twinY(pt);
							let yy;
							if (tw !== null && tw > lvl(pt) + 1) { yy = tw; y0 = tw; u = 0; } // przy drugim pomoście – jego wysokość
							else yy = y0 - 0.08 * u;
							if (yy <= lvl(pt) || out.length > 120) return out;
							out.push([pt, yy]);
						}
						before = prev;
						prev = nx;
					}
					// koniec odcinka ulicy w danych – dalszy odcinek od tego węzła w tym samym kierunku
					cur = find(prev, before, 1.5, rr);
				}
				return out;
			};
			let head = ext(P[0], P[1], yA).reverse(), tail = ext(P[n0 - 1], P[n0 - 2], yB);
			let headY = head.map(() => yA), tailY = tail.map(() => yB);
			// rampa za przedłużeniem nad wykopem (albo od samego końca obiektu)
			{
				const hE = head.length ? head[0] : P[0], hP = head.length > 1 ? head[1] : head.length ? P[0] : P[1];
				const rp = ramp(hE, hP, yA).reverse();
				head = rp.map((x) => x[0]).concat(head); headY = rp.map((x) => x[1]).concat(headY);
				const tE = tail.length ? tail[tail.length - 1] : P[n0 - 1], tP = tail.length > 1 ? tail[tail.length - 2] : tail.length ? P[n0 - 1] : P[n0 - 2];
				const rq = ramp(tE, tP, yB);
				tail = tail.concat(rq.map((x) => x[0])); tailY = tailY.concat(rq.map((x) => x[1]));
			}
			if (head.length || tail.length) {
				P.unshift(...head);
				Y.unshift(...headY);
				P.push(...tail);
				Y.push(...tailY);
				xa = head.length;
				xb = tail.length;
				ci += xa;
				cum = [0];
				for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
			}
		}
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
		/* filar k: jak najbliżej poprzecznego do pomostu (ang = kierunek pomostu, obrys w poprzek), obracany w stronę
		   kierunku torów (5 kroków) tylko tyle, ile trzeba, żeby obrys ominął tory i drogi; długość – szerokość pomostu
		   w kierunku filara (do 40 m). Dawniej filary wzdłuż torów (pod ukośnym pomostem długie i „agresywne”), a w 0.58.34
		   kierunek wybierany na przemian */
		const pierAt = (k) => {
			const a2 = P[Math.max(0, k - 1)], b2 = P[Math.min(P.length - 1, k + 1)], al = Math.atan2(b2[1] - a2[1], b2[0] - a2[0]);
			// kierunek wzdłuż torów (dirs = [±1, 0]) najbliższy al
			const at = Math.abs(al + Math.PI / 2) < Math.abs(al - Math.PI / 2) ? -Math.PI / 2 : Math.PI / 2;
			for (let q = 0; q <= 4; q++) {
				const ang = al + (at - al) * (q / 4), L = Math.min(40, (w + 1) / Math.max(0.25, Math.abs(Math.cos(ang - al))));
				const pr = { k, s: P[k][0], d: P[k][1], top: Y[k] - 0.9, ang, cross: L };
				if (this.pierFree(pr)) return pr;
			}
			return null;
		};
		// filary: po obu stronach torowiska – pierwszy punkt łamanej (od osi na zewnątrz), w którym nie ma toru z mapy
		for (const sg of [1, -1]) {
			let best = -1;
			const order = P.map((p, k) => k).filter((k) => P[k][1] * sg > 6).sort((a, b) => Math.abs(P[a][1]) - Math.abs(P[b][1]));
			for (const k of order) {
				if (Y[k] < this.terrainY(P[k][0], P[k][1]) + 3) break;
				// (onRoad – także sam pomost: obiekt to odcinek ulicy z mapy; filar wyklucza tylko ulica pod pomostem)
				if (this.envTrackGap(P[k][0], P[k][1]) > 3.2 && !this.roadBelowDeck(P[k][0], P[k][1], Y[k])) {
					const pr = pierAt(k);
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
					if (this.envTrackGap(P[k][0], P[k][1]) <= 3.2 || this.roadBelowDeck(P[k][0], P[k][1], Y[k])) continue;
					const pr = pierAt(k);
					if (pr) cand.push({ u: u(k), pr });
				}
				let last = 0;
				while (uEnd - last > 35) {
					// (następny filar co najmniej 15 m dalej – dawniej 8 m: dwa filary tuż obok siebie)
					const near = cand.filter((c) => c.u > last + 15 && c.u <= last + 35);
					const c = near.length ? near.reduce((a, b) => (b.u > a.u ? b : a)) : cand.filter((c2) => c2.u > last + 15).reduce((a, b) => (!a || b.u < a.u ? b : a), null);
					if (!c) break;
					piers.push(c.pr);
					last = c.u;
				}
			}
		}
		return { w, P, cum, Y, G, embk, ems, piers, dirN, xa, xb };
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
						// (maska dróg obejmuje też sam pomost – ulica pod nim tylko z odcinków dróg z mapy)
						if (this.roadBelowDeck(s, d, pr.top + 0.9, 0.5)) { add('pier-road', s, d, `${name}: filar (${fmtD(d)}) stoi na drodze.`, 'Filar trzeba przesunąć poza jezdnię.'); break; }
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
						// (jak w planie: filary nie bliżej niż 6 m od osi toru pociągu)
						if (cum[k2] < sup[q] + 10 || cum[k2] > sup[q + 1] - 10 || Y[k2] - 0.9 - G[k2] < 3 || Math.abs(P[k2][1]) < 6) continue;
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
				if (row[0] & 18) return;
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
			if (row[0] & 18) return;
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
			(e.t || []).forEach((row, i) => { if (row[0] & 18) return; const m = (row.length - 1) / 2; for (let k = 0; k + 1 < m; k++) segT.push([row[1 + k * 2], row[2 + k * 2], row[3 + k * 2], row[4 + k * 2], i, k]); });
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
			/* końce bez nasypu (pomost wchodzi w zbocze wykopu albo kończy się nad terenem): przyczółek – ściana w poprzek
			   pomostu od terenu do spodu w pierwszym miejscu (od końca do środka), gdzie pod pomostem jest prześwit, ława
			   podłożyskowa i ściany skrzydłowe wzdłuż obu krawędzi między nim a końcem (dawniej pod końcem pomostu widać
			   było zbocze i pustkę – pomost „leżał na trawie”) */
			const gapAt = (k) => Y[k] - 0.9 - G[k];
			const emSides = new Set(ems.map((m) => m.side));
			for (const kE of P.length > 2 ? [0, P.length - 1] : []) {
				if (emSides.has(Math.sign(P[kE][1]))) continue;
				const st2 = kE === 0 ? 1 : -1;
				let kA = kE;
				while (kA !== kE + st2 * 12 && kA >= 0 && kA < P.length && Math.abs(P[kA][1]) > 7 && gapAt(kA) < 0.4) kA += st2;
				// nie na ulicy pod pomostem: przyczółek dalej (za ulicą – pomost nad nią)
				for (let q = 0; q < 12 && kA >= 0 && kA < P.length && this.roadBelowDeck(P[kA][0], P[kA][1], Y[kA], 0.5); q++) kA += st2;
				if (kA < 0 || kA >= P.length || gapAt(kA) < 0.4 || Math.abs(P[kA][1]) <= 7 || this.envTrackGap(P[kA][0], P[kA][1]) < 3) continue;
				const yb = (k) => Math.min(G[k], Y[k] - 0.9) - 0.4, L = edge(kA, -1), Rr = edge(kA, 1);
				quad([L[0], yb(kA), L[1]], [Rr[0], yb(kA), Rr[1]], [Rr[0], Y[kA] - 0.9, Rr[1]], [L[0], Y[kA] - 0.9, L[1]], wallC);
				const L2 = edge(kA, -1, w / 2 + 0.3), R2 = edge(kA, 1, w / 2 + 0.3);
				quad([L2[0], Y[kA] - 1.15, L2[1]], [R2[0], Y[kA] - 1.15, R2[1]], [R2[0], Y[kA] - 0.9, R2[1]], [L2[0], Y[kA] - 0.9, L2[1]], wallC);
				for (let k = kE; k !== kA; k += st2) {
					if (this.roadBelowDeck(P[k][0], P[k][1], Y[k], 0.5) || this.roadBelowDeck(P[k + st2][0], P[k + st2][1], Y[k + st2], 0.5)) continue; // nad ulicą – bez ścian
					for (const sg of [-1, 1]) {
						const A = edge(k, sg), B = edge(k + st2, sg);
						quad([A[0], yb(k), A[1]], [B[0], yb(k + st2), B[1]], [B[0], Y[k + st2] - 0.9, B[1]], [A[0], Y[k] - 0.9, A[1]], wallC);
					}
				}
			}
			/* odcinek pomostu wyniesiony nad teren (ponad 1,2 m albo nad torami): tylko tam balustrady i gzyms – na zjazdach
			   przy ziemi pomost przechodzi w ulicę z krawężnikiem (dawniej betonowe ściany 1 m stały przy jezdni aż do końca
			   obiektu, także tam, gdzie jezdnia leżała już na terenie) */
			const elev = (k) => Y[k] - G[k] > 1.2 || this.envTrackGap(P[k][0], P[k][1]) < 6;
			// gzyms pomostu: pas wysunięty 0,15 m na zewnątrz boków na wysokości jezdni (cień pod nim)
			for (let k = 0; k < P.length - 1; k++) {
				if (!elev(k) && !elev(k + 1)) continue;
				for (const sg of [-1, 1]) {
					const A = edge(k, sg, w / 2 + 0.15), B = edge(k + 1, sg, w / 2 + 0.15), A0 = edge(k, sg), B0 = edge(k + 1, sg);
					quad([A[0], Y[k] - 0.25, A[1]], [B[0], Y[k + 1] - 0.25, B[1]], [B[0], Y[k + 1] + 0.12, B[1]], [A[0], Y[k] + 0.12, A[1]], wallC);
					quad([A0[0], Y[k] - 0.25, A0[1]], [B0[0], Y[k + 1] - 0.25, B0[1]], [B[0], Y[k + 1] - 0.25, B[1]], [A[0], Y[k] - 0.25, A[1]], wallC);
				}
			}
			for (let k = 0; k < P.length - 1; k++) {
				const L0 = edge(k, -1), R0 = edge(k, 1), L1 = edge(k + 1, -1), R1 = edge(k + 1, 1);
				const y0 = Y[k], y1 = Y[k + 1];
				const top = (p, y) => [p[0], y, p[1]];
				// jezdnia; boki pomostu (0,9 m) z balustradami (1 m) – materiał dwustronny (kierunek łamanej bywa dowolny)
				quad(top(L0, y0), top(R0, y0), top(R1, y1), top(L1, y1), asph);
				const h0 = elev(k) ? 1.0 : 0.15, h1 = elev(k + 1) ? 1.0 : 0.15;
				for (const [A, B] of [[L0, L1], [R0, R1]]) quad([A[0], y0 - 0.9, A[1]], [B[0], y1 - 0.9, B[1]], [B[0], y1 + h1, B[1]], [A[0], y0 + h0, A[1]], conc);
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
			/* długa podpora (pomost ukośny do torów, ponad 12 m): rząd słupów co ok. 6 m pod wspólnym oczepem zamiast pełnej
			   ściany */
			const Lp = pr.ang !== undefined ? pr.cross : pr.len || 6, dv = pr.ang !== undefined ? [-Math.sin(pr.ang), Math.cos(pr.ang)] : [1, 0];
			if (Lp > 12) {
				const nCol = Math.ceil((Lp - 1.6) / 6) + 1;
				for (let c = 0; c < nCol; c++) {
					const off = -Lp / 2 + 0.8 + ((Lp - 1.6) * c) / (nCol - 1), cs = pr.s + dv[0] * off, cd = pr.d + dv[1] * off;
					R.sidePoint(r, cs, cd, tp2);
					const yc = this.terrainY(cs, cd) - 0.2, hc = pr.top - yc;
					if (hc < 1) continue;
					const col = new T.Mesh(NS.util.GEO.box, pm.material);
					col.scale.set(1.2, hc, 1.2);
					col.rotation.y = pm.rotation.y;
					col.position.set(tp2.x, yc + hc / 2, tp2.z);
					col.castShadow = this.shadows;
					group.add(col);
				}
			} else group.add(pm);
			// oczep: szerszy i dłuższy od filaru pas pod spodem pomostu
			const cap = new T.Mesh(NS.util.GEO.box, pm.material);
			if (pr.ang !== undefined) cap.scale.set(pr.cross + 0.6, 0.7, 1.9);
			else cap.scale.set(1.9, 0.7, (pr.len || 6) + 0.6);
			cap.rotation.y = pm.rotation.y;
			cap.position.set(tp.x, pr.top - 0.35, tp.z);
			cap.castShadow = this.shadows;
			group.add(cap);
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
		// B-18 na wjazdach – przez atlas znaków (streetFurnFlush): tarcza na 2,2 m
		if (sink.signs.length) this.streetFurnFlush(group, sink.signs.map((sg) => ({ x: sg.x, y: sg.y, z: sg.z, ang: sg.ang, kind: 'B18_' + sg.ton })), [], null);
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
			if ((row[0] & 1) !== 1 || row[0] & 22) return; // tylko czynne bocznice / tory boczne (nie na moście, nie w tunelu)
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
		const RZ = new T.Matrix4().makeRotationZ(Math.PI / 2), RA = new T.Matrix4(), EU = new T.Euler(), cols = new Map();
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
				else if (Array.isArray(rot)) out.multiply(RA.makeRotationFromEuler(EU.set(rot[0], rot[1], rot[2])));
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
	/* tor z mapy przy naszym tunelu, poza jego obudową, pod terenem (główka szyny niżej niż 0,3 m nad terenem) – tor
	   osobnego tunelu obok (pliki z generatora sprzed 0.37 – np. WKD przy Śródmieściu): nie rysowany (z kozłami) */
	World.prototype.envBuriedNearTunnel = function (s, d, yRail) {
		if (!this.env.dem || this.envTunnelK(s) < 0.5) return false;
		const [l, rr] = this.envTunnelSides(s);
		return (d < l || d > rr) && yRail < this.demGround(s, d) + 0.3; // pomiar (teren bez rowu pod torem)
	};

	/* tor z mapy zaczynający się przy portalu naszego tunelu (do 30 m przed nim albo za nim, do 45 m od osi), który tuż przy
	   portalu leży ponad 3 m nad naszym torem – w rzeczywistości biegnie dalej we własnym tunelu (w danych bez znacznika,
	   pomiar NMT to ulica nad nim; np. tory za zachodnim portalem tunelu średnicowego): nie rysowany */
	World.prototype.envRowFromTunnel = function (i) {
		const e = this.env;
		if (!e.dem || !this.route.tunnels.length) return false;
		if (!e.rowFromTun) e.rowFromTun = new Map();
		if (e.rowFromTun.has(i)) return e.rowFromTun.get(i);
		const row = this.route.env.t[i], m = (row.length - 1) / 2;
		let out = false;
		if (!(row[0] & 18)) {
			for (let k = 0; k < m && !out; k++) {
				const s = row[1 + k * 2], d = row[2 + k * 2];
				if (Math.abs(d) >= 45 || !this.route.tunnels.some((t) => Math.abs(s - t.from) < 30 || Math.abs(s - t.to) < 30)) continue;
				const y = this.envRowMeasured(i, Math.min(k, m - 2), s, d);
				if (y !== undefined && y > R.heightAt(this.route, s) + 3) out = true;
			}
		}
		e.rowFromTun.set(i, out);
		return out;
	};

	World.prototype.buildEnvBuffers = function (group, list) {
		if (!list || !list.length) return;
		const r = this.route;
		const red = mat('#c62f2f'), white = mat('#f2f2f2'), wood = mat('#4a3a2a');
		for (const [s, d, ang] of list) {
			if (this.envOccupied(s, d, 0.5) || this.envBuriedNearTunnel(s, d, this.envTrackY(s, d, false, false))) continue;
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
		for (const { k, row } of e.tByChunk.get(c) || []) if (row[0] & 1 && !(row[0] & 16)) ds.push((row[2 + k * 2] + row[4 + k * 2]) / 2); // bez torów w tunelu
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
		// dno wkopu drogowego: utwardzone (szare) – w szczelinach między jezdniami i na rozwidleniach nie świeci trawa
		if (this.envInTrench(s, d, 1)) return [0.3, 0.3, 0.31];
		const k = this.areaAt(s, d);
		const n = vnoise(s * 0.02, d * 0.02);
		const c = AREA_RGB[k] || AREA_RGB[0];
		return [c[0] + 0.08 * (n - 0.5), c[1] + 0.07 * (n - 0.5), c[2] + 0.04 * (n - 0.5)];
	};
	World.prototype.envTerrainMat = function (s, d) {
		if (this.envInTrench(s, d, 1)) return [0, 0, 1];
		const k = this.areaAt(s, d);
		const sd = AREA_SAND[k] || 0;
		return [1 - sd, sd, 0];
	};
	World.prototype.envTreeP = function (s, d) {
		return TREE_P[this.areaAt(s, d)] || 0;
	};

	// strefy stacji (model stacji w grze) – bez dróg i wód z mapy
	/* miejsce zajęte przez stację z gry (bez ulic, latarń i wód z mapy): peron z wyposażeniem za tylną krawędzią (1,5 m),
	   a przy stacji bez dworca z mapy także dworzec z gry za peronem (elewacja w x = 12, do ok. 24 m od osi). Dawniej pas
	   od −16 do 12 m od osi na całej długości stacji – ulice z mapy obok peronu znikały (zostawały ich chodniki, a teren
	   pod jezdnią przyjmował jej wysokość: uskoki i urwane chodniki przy torach) */
	World.prototype.envStationZone = function (s, d) {
		this.route.stations.forEach((st, i) => { if (st._zone === undefined) {
			const pl = st.platform, sg = pl ? pl.side : 1, a = pl ? pl.edge : 2.15, b = pl ? pl.edge + pl.width : 6.1;
			const genB = st.type !== 'halt' && !this.envStationBuilding(i) && !(pl && pl.island) && !(this.envUnderground && this.envUnderground(st));
			st._zone = { sg, a: a - 0.5, b: genB ? Math.max(b + 1.5, 24) : b + 1.5 };
		} });
		for (const st of this.route.stations) {
			if (s <= st.platformStart - 30 || s >= st.platformEnd + 40) continue;
			const z = st._zone, x = d * z.sg;
			if (x > z.a && x < z.b) return true;
		}
		for (const q of (this.env && this.env.reserved) || []) if (s > q.s0 && s < q.s1 && d > q.d0 && d < q.d1) return true;
		return false;
	};

	// miejsca zajęte przez tor gracza, drugi tor i perony z gry (tory i perony z mapy tam nie wchodzą)
	// forTrack – pytanie przy rysowaniu toru z mapy: tor dalej niż skrajnia za krawędzią peronu zostaje (peron z gry jest
	// przed nim przycinany – buildStation backAbs), wcześniej znikał w nominalnej szerokości peronu z danych
	World.prototype.envOccupied = function (s, d, margin, forTrack) {
		const r = this.route, m = margin || 0;
		if (Math.abs(d) < 2.6 + m) return true;
		// na trasach rzeczywistych drugi tor jest z mapy; zajęty jest tylko peron stacji (prawdziwy albo domyślny)
		for (const st of r.stations) {
			if (s < st.platformStart - 5 || s > st.platformEnd + 5) continue;
			const pl = st.platform;
			const a = pl ? pl.edge : 2.15, b = pl ? pl.edge + pl.width : 6.1, sg = pl ? pl.side : 1;
			const x = d * sg;
			if (forTrack && x >= Math.max(a, 1.72) + 1.72 + 0.8) continue;
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
		// tory z odstawionymi wagonami (envPlanWagons): zajęte odcinki [od, do] w s dla każdego toru z mapy – pociąg z
		// przeciwka nie jedzie przez stojący skład
		const busy = new Map();
		for (const list of (e.wagons && e.wagons.values()) || []) for (const w of list) {
			if (w.i === undefined) continue;
			const half = w.len / 2 + 4;
			if (!busy.has(w.i)) busy.set(w.i, []);
			busy.get(w.i).push([w.s - half, w.s + half]);
		}
		const occupied = (t, s) => (busy.get(t.i) || []).some(([a, b]) => s > a && s < b);
		for (let i = 0; i < n; i++) {
			const s = LANE_S0 + i * LANE_STEP;
			// stan 0 – brak toru; dalej tory po lewej
			const ds = [NaN].concat(this.envTracksAt(s).filter((t) => !(t.side & 4) && Math.abs(t.d) > 3 && t.d > -45 && t.d < 45 && !occupied(t, s)).map((t) => t.d + (t.side & 1 ? 1000 : 0)));
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
	/* tor pociągów z przeciwka na mijance (linia jednotorowa): w miejscu s albo najbliższy rozpoznany do 300 m, bez niego
	   4,5 m od osi – wspólne dla rysowania pociągów (scene.js) i semaforów ich kierunku (world.js) */
	World.prototype.envLaneNear = function (s) {
		const d0 = this.envLaneAt(s);
		if (!Number.isNaN(d0)) return d0;
		for (let k = 25; k <= 300; k += 25) for (const x of [s - k, s + k]) { const d = this.envLaneAt(x); if (!Number.isNaN(d)) return d; }
		return 4.5;
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
		const railRows = (env && env.t || []).filter((row) => !(row[0] & 18));
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
			/* dno: od skrajnego do skrajnego obiektu (tory obok siebie) + pół szerokości (jezdnia z chodnikami); dawniej nie
			   szerzej niż otwór z danych – przy krótszym przęśle skarpa nasypu schodziła na chodnik; teraz przęsło liczone
			   z dna wykopu (bridgeSpan) */
			const hw = ((s1 - s0) * sn) / 2 + h0.w;
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
			if (row[0] & 18) return;
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
	/* udział tunelu w miejscu s (0 – poza, 1 – w głębi): przejście 12 m od portalu – przed nim wykop dojazdowy */
	/* otwory portali tuneli dla shadera terenu (common.js uPortalA/B): środek otworu przy ścianie czołowej, od 0,5 m nad
	   główką szyny do stropu, szerokość obudowy; bez tuneli albo bez pomiaru terenu – wyłączone */
	World.prototype.envPortalUniforms = function () {
		const U = NS.util.U, A = U.uPortalA.value, B = U.uPortalB.value;
		for (const v of B) v.w = 0;
		if (!this.env || !this.env.dem) return;
		let k = 0;
		const p0 = {}, p1 = {};
		for (const t of this.route.tunnels) for (const [s, dir] of [[t.from, 1], [t.to, -1]]) {
			if (k >= 8) return;
			const [l, rr] = this.envTunnelSides(s), h = R.heightAt(this.route, s);
			R.sidePoint(this.route, s, (l + rr) / 2, p0);
			R.sidePoint(this.route, s + dir, (l + rr) / 2, p1);
			const L = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
			A[k].set(p0.x, h - 0.5, p0.z, this.envTunnelH(s + dir * 0.5) + 0.45);
			B[k].set((p1.x - p0.x) / L, (p1.z - p0.z) / L, (rr - l) / 2 - 0.05, 1);
			k++;
		}
	};

	// jak envTunnelK, ale z przejściem 0,1–0,45 m za portalem (teren nad obudową tuż za ścianą czołową)
	World.prototype.envTunnelSharp = function (s) {
		let k = 0;
		for (const t of this.route.tunnels) {
			if (s < t.from || s > t.to) continue;
			k = Math.max(k, smoothstep(t.from + 0.1, t.from + 0.45, s) * (1 - smoothstep(t.to - 0.45, t.to - 0.1, s)));
		}
		return k;
	};
	World.prototype.envTunnelK = function (s) {
		let k = 0;
		for (const t of this.route.tunnels) {
			if (s < t.from || s > t.to) continue;
			k = Math.max(k, smoothstep(t.from, t.from + 12, s) * (1 - smoothstep(t.to - 12, t.to, s)));
		}
		return k;
	};

	/* Tunel na trasie rzeczywistej: obudowa pod terenem z pomiaru – ściany, sklepienie i strop (beton), lampy co 30 m;
	   szerokość wg torów (dwa tory – z lewej drugi tor) i peronów stacji w tunelu (poszerzenie po stronie peronu);
	   portale: ściana czołowa od sklepienia do terenu nad nim. Obudowa rzuca cień – wnętrze nie jest oświetlone
	   słońcem przez teren (teren jednostronny, z dołu niewidoczny). */
	/* stacja podziemna: peron (jego środek) w tunelu na trasie z pomiarem terenu */
	World.prototype.envUnderground = function (st) {
		if (!this.env || !this.env.dem || !st.platform) return false;
		return this.envTunnelK((st.platformStart + st.platformEnd) / 2) > 0.5;
	};

	/* perony z mapy w tunelu (np. innej linii we wspólnej obudowie): [s0, s1, dMin, dMax] – hala, światła, szerokość */
	World.prototype.envTunnelPlatforms = function () {
		const env = this.route.env;
		if (!env) return [];
		if (env._tunPf) return env._tunPf;
		const out = [];
		if (this.env && this.env.dem) for (const row of env.p || []) {
			const m = (row.length - 1) / 2;
			let s0 = Infinity, s1 = -Infinity, d0 = Infinity, d1 = -Infinity, cs = 0;
			for (let k = 0; k < m; k++) { const s2 = row[1 + k * 2], d2 = row[2 + k * 2]; s0 = Math.min(s0, s2); s1 = Math.max(s1, s2); d0 = Math.min(d0, d2); d1 = Math.max(d1, d2); cs += s2 / m; }
			if (row[0] !== 1) { d0 -= 2; d1 += 2; } // peron jako linia – szerokość 4 m
			if (this.envTunnelK(cs) > 0.5) out.push([s0, s1, d0, d1]);
		}
		Object.defineProperty(env, '_tunPf', { value: out, configurable: true });
		return out;
	};

	/* Tory z mapy przy peronach w tunelu innej linii (np. Warszawa Śródmieście obok tunelu średnicowego): pociągi
	   podmiejskie zatrzymujące się na tych peronach (life.js). Peron od 80 m, poza peronami stacji trasy; tor – wiersz
	   toru z mapy biegnący wzdłuż krawędzi peronu (do 3,5 m od niej), nie tor naszej linii ani tor pociągów z przeciwka.
	   Wynik: { i, sA, sB, stop, lane(s), y(s), name } – odsunięcie i wysokość względem osi trasy (poza końcami wiersza – jak na końcu). */
	World.prototype.envLocalTracks = function () {
		const env = this.route.env, r = this.route;
		if (!env || !this.env || !this.env.dem) return [];
		const out = [], seen = new Set();
		for (const row of env.p || []) {
			const m = (row.length - 1) / 2, pts = [];
			for (let k = 0; k < m; k++) pts.push([row[1 + k * 2], row[2 + k * 2]]);
			let s0 = Infinity, s1 = -Infinity;
			for (const [s] of pts) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
			const mid = (s0 + s1) / 2;
			if (s1 - s0 < 80 || this.envTunnelK(mid) <= 0.5) continue;
			if (r.stations.some((st) => s1 > st.platformStart - 20 && s0 < st.platformEnd + 20)) continue;
			const across = (s) => {
				let lo = Infinity, hi = -Infinity;
				for (let k = 0; k < m; k++) {
					const [sa, da] = pts[k], [sb, db] = pts[(k + 1) % m];
					if ((sa - s) * (sb - s) > 0 || sa === sb) continue;
					const d = da + ((db - da) * (s - sa)) / (sb - sa);
					lo = Math.min(lo, d); hi = Math.max(hi, d);
				}
				return lo < hi ? [lo, hi] : null;
			};
			for (const f of [0.3, 0.5, 0.7]) {
				const s = s0 + (s1 - s0) * f, w = across(s), ln = this.envLaneAt(s);
				if (!w) continue;
				for (const t of this.envTracksAt(s)) {
					if (seen.has(t.i) || t.sk || Math.abs(t.d) < 3 || Math.abs(t.d - ln) < 1) continue;
					if (!((t.d < w[0] && t.d > w[0] - 3.5) || (t.d > w[1] && t.d < w[1] + 3.5))) continue;
					seen.add(t.i);
					const tr = env.t[t.i], n = (tr.length - 1) / 2;
					let sA = Infinity, sB = -Infinity;
					for (let k = 0; k < n; k++) { sA = Math.min(sA, tr[1 + k * 2]); sB = Math.max(sB, tr[1 + k * 2]); }
					// odcinek wiersza w miejscu s (s w wierszu rośnie albo maleje – szukanie po kolei)
					const seg = (x) => {
						const c = Math.max(sA, Math.min(sB, x));
						for (let k = 0; k < n - 1; k++) {
							const sa = tr[1 + k * 2], sb = tr[3 + k * 2];
							if ((sa - c) * (sb - c) <= 0 && sa !== sb) return [k, tr[2 + k * 2] + ((tr[4 + k * 2] - tr[2 + k * 2]) * (c - sa)) / (sb - sa), c];
						}
						return [0, tr[2], c];
					};
					const lane = (x) => seg(x)[1];
					const y = (x) => { const [k, d, c] = seg(x); return this.envRowY(t.i, k, c, d) - R.heightAt(r, c); };
					// nazwa stacji: env.os (stacja innej linii pominięta przez generator) najbliżej środka peronu, do 400 m
					let name = null, best = 400;
					for (const [ps, nm] of env.os || []) if (Math.abs(ps - mid) < best) { best = Math.abs(ps - mid); name = nm; }
					out.push({ i: t.i, sA, sB, stop: mid, lane, y, name });
				}
			}
		}
		return out;
	};

	/* udział hali stacji podziemnej w miejscu s (0 – zwykły tunel, 1 – hala): przejście 6 m za końcami peronu */
	World.prototype.envHallK = function (s) {
		let k = 0;
		for (const [s0, s1] of this.envTunnelPlatforms()) {
			if (s < s0 - 12 || s > s1 + 12) continue;
			k = Math.max(k, smoothstep(s0 - 12, s0 - 6, s) * (1 - smoothstep(s1 + 6, s1 + 12, s)));
		}
		for (const st of this.route.stations) {
			if (s < st.platformStart - 12 || s > st.platformEnd + 12 || !this.envUnderground(st)) continue;
			k = Math.max(k, smoothstep(st.platformStart - 12, st.platformStart - 6, s) * (1 - smoothstep(st.platformEnd + 6, st.platformEnd + 12, s)));
		}
		return k;
	};

	/* szerokość wnętrza tunelu w miejscu s: [lewa, prawa] ściana (odsunięcie od osi) – wg torów i peronów w tunelu */
	World.prototype.envTunnelSides = function (s) {
		const r = this.route;
		// szerzej niż skrajnia (chodnik służbowy 0,9 m, semafory i wieszaki sieci przy ścianie)
		let l = r.double ? -9.6 : -4.5, rr = 4.5;
		for (const [s0, s1, d0, d1] of this.envTunnelPlatforms()) if (s > s0 - 15 && s < s1 + 15) { l = Math.min(l, d0 - 1.5); rr = Math.max(rr, d1 + 1.5); }
		// tory innych linii w tym samym tunelu (bit 16): obudowa obejmuje je (2,6 m od osi skrajnego toru, wygładzone)
		const tw = this.envTunnelTrackSpan();
		if (tw.size) {
			for (let b = Math.floor(s / 4) - 4; b <= Math.floor(s / 4) + 4; b++) {
				const q = tw.get(b);
				if (q) { l = Math.min(l, q[0] - 3.4); rr = Math.max(rr, q[1] + 3.4); }
			}
		}
		for (const st of r.stations) {
			const P = st.platform;
			if (!P || s < st.platformStart - 15 || s > st.platformEnd + 15) continue;
			const ext = (P.edge || 1.7) + (P.width || 6) + 1.5;
			if ((P.side || 1) > 0) rr = Math.max(rr, ext); else l = Math.min(l, -ext);
		}
		return [l, rr];
	};

	// zasięg torów w tunelu (bit 16) w przedziałach po 4 m: [najmniejsze, największe odsunięcie]
	World.prototype.envTunnelTrackSpan = function () {
		const env = this.route.env;
		if (!env) return new Map();
		if (env._tunSpan) return env._tunSpan;
		const m = new Map();
		for (const row of env.t || []) {
			if (!(row[0] & 16)) continue;
			for (let k = 1; k + 3 < row.length; k += 2) {
				const sa = row[k], da = row[k + 1], sb = row[k + 2], db = row[k + 3], n = Math.max(1, Math.ceil(Math.abs(sb - sa) / 2));
				for (let j = 0; j <= n; j++) {
					const s2 = sa + ((sb - sa) * j) / n, d2 = da + ((db - da) * j) / n, b = Math.floor(s2 / 4), q = m.get(b);
					if (q) { q[0] = Math.min(q[0], d2); q[1] = Math.max(q[1], d2); } else m.set(b, [d2, d2]);
				}
			}
		}
		Object.defineProperty(env, '_tunSpan', { value: m, configurable: true }); // bez zapisu do pliku trasy
		return m;
	};

	/* swobodna kamera w tunelu (wleciała portalem albo jest pod stropem): podłoga, strop i ściany zamiast terenu
	   z pomiaru; null – poza tunelem albo nad nim */
	World.prototype.freeTunnel = function (s, y) {
		if (!this.env || !this.env.dem || this.envTunnelK(s) < 0.5) return null;
		const h = R.heightAt(this.route, s), top = h + this.envTunnelH(s);
		if (y > top + 0.5) return null;
		const [l, rr] = this.envTunnelSides(s);
		return { floor: h, ceil: top - 0.4, l: l + 0.4, r: rr - 0.4 };
	};

	/* wysokość stropu tunelu nad główką szyny w miejscu s: poza stacjami stała, 6 m – mieści pociąg i sieć trakcyjną
	   (przewód jezdny 5,6 m jak na szlaku, lina nośna tuż pod stropem; teren nad płytszym przykryciem podniesiony –
	   demTerrainY); dawniej zależała od przykrycia z pomiaru (6–6,8 m) i strop falował. Hala stacji podziemnej: wyżej,
	   do 7,6 m, gdy pozwala przykrycie (strop 0,8 m pod terenem), wygładzona (najmniejsza w ±8 m). */
	/* budynek nad tunelem (nad obudową, do 2 m za ścianą): podstawa nie niżej niż strop tunelu + 0,5 m – przy portalu
	   teren pod skrajem obrysu schodzi w wykop przed tunelem i budynek zwisał wtedy w wylot (parter pod wiaduktem) */
	World.prototype.envOverTunnel = function (s, d, y, ext = 2) {
		if (!this.env || !this.env.dem) return y;
		for (const t of this.route.tunnels) {
			if (s < t.from - ext || s > t.to + ext) continue;
			const [l, rr] = this.envTunnelSides(Math.max(t.from, Math.min(t.to, s)));
			if (d < l - 2 || d > rr + 2) continue;
			const sc = Math.max(t.from, Math.min(t.to, s));
			return Math.max(y, R.heightAt(this.route, sc) + this.envTunnelH(sc) + 0.5);
		}
		return y;
	};
	const TUN_H = 6.0;
	World.prototype.envTunnelH = function (s) {
		const env = this.route.env;
		if (this.envHallK(s) === 0 && this.envHallK(s - 8) === 0 && this.envHallK(s + 8) === 0) return TUN_H;
		if (!env._tunH) Object.defineProperty(env, '_tunH', { value: new Map(), configurable: true });
		const raw = (b) => {
			if (env._tunH.has(b)) return env._tunH.get(b);
			const s2 = b * 2, h = R.heightAt(this.route, s2), [l, rr] = this.envTunnelSides(s2);
			let g = Infinity;
			for (const d of [l, (l + rr) / 2, 0, rr]) g = Math.min(g, this.demGround(s2, d));
			const hk = this.envHallK(s2);
			const v = hk > 0 ? TUN_H + Math.max(0, Math.min(7.6, g - h - 0.8) - TUN_H) * hk : TUN_H;
			env._tunH.set(b, v);
			return v;
		};
		let m = Infinity;
		for (let b = Math.floor(s / 2) - 4; b <= Math.floor(s / 2) + 4; b++) m = Math.min(m, raw(b));
		return m;
	};

	World.prototype.buildEnvTunnel = function (group, t, c0 = -Infinity, c1 = Infinity, dyn = null) {
		const r = this.route, STEPS = 4, ARCH = 1.2, HA = 0.35; // wysokość – envTunnelH; hala stacji: płaski strop, małe fazy
		const dbl = r.double;
		const sides = (s) => this.envTunnelSides(s);
		const prof = (l, rr, k, h) => {
			const a = Math.min(ARCH + (HA - ARCH) * k, h * 0.2);
			// 6 punktów obudowy (ściana – strop – ściana) i 2 posadzki (osobny pas, poniżej korony podsypki – przykrywa
			// grunt i trawę spod tunelu, tor zostaje widoczny)
			return [[l, -0.6], [l, h - a], [l + a, h], [rr - a, h], [rr, h - a], [rr, -0.6], [rr, -0.55], [l, -0.55]];
		};
		const pos = [], col = [], idx = [];
		// posadzka jaśniejsza (dawniej #4a4743 – w tunelu i obok jasnej hali wyglądała jak czarna dziura między torami)
		const cWall = new T.Color('#86827a'), cBase = new T.Color('#67635d'), cFloor = new T.Color('#6a665f'), hFloor = new T.Color('#958f85');
		// hala: ściany z jasnych płytek, ciemniejszy cokół, jasny strop
		const hWall = new T.Color('#d8d2c4'), hBase = new T.Color('#7d776d'), hCeil = new T.Color('#c9c6bf'), cc = new T.Color();
		let rings = 0, hkPrev = 0;
		const idxH = []; // pierścienie hali – jaśniejszy materiał (poświata płytek i świetlówek)
		// część tunelu w kawałku świata [c0, c1)
		const a0 = Math.max(t.from, c0), a1 = Math.min(t.to, c1);
		if (a1 - a0 < 0.5) return;
		for (let s = a0, last = false; !last; s += STEPS) {
			last = s >= a1 - 0.01; // ostatni pierścień zawsze na końcu kawałka (a1) – dawniej przerwa do 4 m w stropie na granicy kawałków
			const ss = Math.min(s, a1), h = R.heightAt(r, ss), [l, rr] = sides(ss), hk = this.envHallK(ss);
			prof(l, rr, hk, this.envTunnelH(ss)).forEach(([d, y], j) => {
				R.sidePoint(r, ss, d, tp);
				pos.push(tp.x, h + y, tp.z);
				const base = j === 0 || j === 5;
				if (j > 5) cc.copy(cFloor).lerp(hFloor, hk);
				else cc.copy(base ? cBase : cWall).lerp(base ? hBase : j === 2 || j === 3 ? hCeil : hWall, hk);
				col.push(cc.r, cc.g, cc.b);
			});
			const dst = Math.max(hk, hkPrev) > 0.3 ? idxH : idx;
			// posadzka (j = 6) zawsze w zwykłym materiale – w hali poświata rozjaśniała ją jak śnieg
			if (rings) for (const j of [0, 1, 2, 3, 4, 6]) { const a = (rings - 1) * 8 + j, b = a + 8; (j === 6 ? idx : dst).push(a, b, b + 1, a, b + 1, a + 1); }
			hkPrev = hk;
			rings++;
		}
		if (rings < 2) return;
		const geo = new T.BufferGeometry();
		geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
		geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
		geo.setIndex(idx.concat(idxH));
		geo.addGroup(0, idx.length, 0);
		geo.addGroup(idx.length, idxH.length, 1);
		geo.computeVertexNormals();
		// lekka poświata (lampy i światło od wlotów): ściany widoczne, ale ciemne – bez niej obudowa w cieniu była czarna jak pustka
		if (!World.tunnelM) { World.tunnelM = patch(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: T.DoubleSide, emissive: '#4a4640', emissiveIntensity: 1.0 }), 'indoor'); World.tunnelM.userData.shared = true; }
		// hala: świetlówki oświetlają ściany i strop w całej długości (w puli świateł tylko kilka punktów naszej stacji)
		if (!World.hallM) { World.hallM = patch(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: T.DoubleSide, emissive: '#bdb8ad', emissiveIntensity: 0.42 }), 'indoor'); World.hallM.userData.shared = true; }
		const tube = new T.Mesh(geo, [World.tunnelM, World.hallM]);
		tube.castShadow = true;
		tube.receiveShadow = true;
		group.add(tube);
		/* obudowa od zewnątrz (ściany 0,4 m za wnętrzem, strop 0,15 m nad nim, beton): widoczna, gdzie teren obok tunelu
		   schodzi poniżej stropu (płytki tunel przy rampie ulicy, przy portalu) – dawniej przez dziurę w terenie widać
		   było ciemne wnętrze (czarne pasy przy ulicy) */
		{
			const on = [];
			let prev = null;
			for (let s = a0, last = false; !last; s += STEPS) {
				last = s >= a1 - 0.01; // ostatni pierścień zawsze na końcu kawałka (a1) – dawniej przerwa do 4 m w stropie na granicy kawałków
				const ss = Math.min(s, a1), h = R.heightAt(r, ss), [l, rr] = sides(ss), H = this.envTunnelH(ss) + 0.15;
				const ring = [[l - 0.4, -1.5], [l - 0.4, H], [rr + 0.4, H], [rr + 0.4, -1.5]].map(([d, y]) => { R.sidePoint(r, ss, d, tp); return [tp.x, h + y, tp.z]; });
				if (prev) for (let j = 0; j < 3; j++) on.push(...prev[j], ...prev[j + 1], ...ring[j + 1], ...prev[j], ...ring[j + 1], ...ring[j]);
				prev = ring;
			}
			if (on.length) {
				const g2 = new T.BufferGeometry();
				g2.setAttribute('position', new T.Float32BufferAttribute(on, 3));
				g2.computeVertexNormals();
				if (!World.tunnelOutM) { World.tunnelOutM = patch(new T.MeshStandardMaterial({ color: '#8f8b83', roughness: 0.95, side: T.DoubleSide }), 'concrete'); World.tunnelOutM.userData.shared = true; }
				const shell = new T.Mesh(g2, World.tunnelOutM);
				shell.receiveShadow = true;
				group.add(shell);
			}
		}
		// lampy na ścianach co 30 m, na zmianę po obu stronach (co 15 m) – świecą zawsze
		if (!World.tunnelLampM) { World.tunnelLampM = new T.MeshBasicMaterial({ color: new T.Color(2.2, 1.9, 1.4) }); World.tunnelLampM.userData.shared = true; }
		const lampsS = [];
		for (let s = t.from + 15; s < t.to - 10; s += 15) if (s >= a0 && s < a1 && this.envHallK(s) < 0.01) lampsS.push(s);
		if (lampsS.length) {
			const tunLights = [];
			const im = new T.InstancedMesh(GEO.box, World.tunnelLampM, lampsS.length), m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(0.12, 0.12, 1.2), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
			lampsS.forEach((s, k) => {
				const [l, rr] = sides(s), left = Math.round((s - t.from - 15) / 15) % 2 === 1;
				R.sidePoint(r, s, left ? l + 0.08 : rr - 0.08, tp);
				q.setFromAxisAngle(up, -R.trackPoint(r, s, {}).heading);
				im.setMatrixAt(k, m4.compose(p3.set(tp.x, R.heightAt(r, s) + this.envTunnelH(s) - ARCH - 0.3, tp.z), q, sc));
				// co druga lampa (co 30 m) – światło punktowe z puli (zawsze włączone): ściany, tory i pociąg w tunelu nie są czarne
				if (k % 2 === 0 && dyn) {
					const o = new T.Object3D();
					o.position.set(tp.x, R.heightAt(r, s) + this.envTunnelH(s) - ARCH - 0.5, tp.z);
					Object.assign(o.userData, { always: true, power: 0.9, drop: 0 });
					group.add(o);
					tunLights.push(o);
				}
			});
			group.add(im);
			if (tunLights.length) dyn.push({ type: 'lamps', lamps: tunLights });
		}
		/* wyposażenie obudowy poza halami: chodnik służbowy przy obu ścianach (0,9 m, krawężnik), koryta kablowe na
		   ścianach (2,2 m nad główką szyny), zielone lampki ewakuacyjne co 50 m (na zmianę po obu stronach) */
		{
			const STEP = 4, walk = [], tray = [];
			// pasy wzdłuż ściany: prof(s, l, rr) → punkty [d, y] przekroju (względem główki szyny); null – przerwa
			const strip = (dst, prof) => {
				let prev = null;
				for (let s = a0, last = false; !last; s += STEPS) {
					last = s >= a1 - 0.01; // ostatni pierścień zawsze na końcu kawałka (a1) – dawniej przerwa do 4 m w stropie na granicy kawałków
					const ss = Math.min(s, a1), [l, rr] = sides(ss), h = R.heightAt(r, ss), P = this.envHallK(ss) > 0.3 ? null : prof(l, rr);
					const ring = P && P.map(([d, y]) => { R.sidePoint(r, ss, d, tp); return [tp.x, h + y, tp.z]; });
					if (ring && prev) for (let j = 0; j + 1 < ring.length; j++) dst.push(...prev[j], ...ring[j], ...ring[j + 1], ...prev[j], ...ring[j + 1], ...prev[j + 1]);
					prev = ring;
				}
			};
			void STEP;
			for (const side of [-1, 1]) {
				const w = (l, rr) => (side < 0 ? l : rr);
				strip(walk, (l, rr) => [[w(l, rr), 0.1], [w(l, rr) - side * 0.9, 0.1], [w(l, rr) - side * 0.9, -0.55]]);
				strip(tray, (l, rr) => [[w(l, rr), 2.2], [w(l, rr) - side * 0.32, 2.2], [w(l, rr) - side * 0.32, 2.3]]);
				strip(tray, (l, rr) => [[w(l, rr), 1.75], [w(l, rr) - side * 0.25, 1.75], [w(l, rr) - side * 0.25, 1.83]]);
			}
			const mk = (arr, m) => {
				if (!arr.length) return;
				const g2 = new T.BufferGeometry();
				g2.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
				g2.computeVertexNormals();
				const mesh = new T.Mesh(g2, m);
				mesh.receiveShadow = true;
				group.add(mesh);
			};
			if (!World.tunWalkM) { World.tunWalkM = patch(new T.MeshStandardMaterial({ color: '#8a867e', roughness: 0.95, side: T.DoubleSide, emissive: '#2c2a27', emissiveIntensity: 0.6 }), 'indoor'); World.tunWalkM.userData.shared = true; }
			if (!World.tunTrayM) { World.tunTrayM = patch(new T.MeshStandardMaterial({ color: '#55595e', roughness: 0.6, metalness: 0.5, side: T.DoubleSide, emissive: '#1d1f21', emissiveIntensity: 0.6 }), 'indoor'); World.tunTrayM.userData.shared = true; }
			mk(walk, World.tunWalkM);
			mk(tray, World.tunTrayM);
			const ex = [];
			for (let s = t.from + 25, k = 0; s < t.to - 10; s += 50, k++) if (s >= a0 && s < a1 && this.envHallK(s) < 0.01) ex.push([s, k % 2 ? -1 : 1]);
			if (ex.length) {
				if (!World.tunExitM) { World.tunExitM = new T.MeshBasicMaterial({ color: new T.Color(0.2, 1.8, 0.5) }); World.tunExitM.userData.shared = true; }
				const im = new T.InstancedMesh(GEO.box, World.tunExitM, ex.length), m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(0.05, 0.18, 0.45), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
				ex.forEach(([s, side], k) => {
					const [l, rr] = sides(s);
					R.sidePoint(r, s, side < 0 ? l + 0.05 : rr - 0.05, tp);
					q.setFromAxisAngle(up, -R.trackPoint(r, s, {}).heading);
					im.setMatrixAt(k, m4.compose(p3.set(tp.x, R.heightAt(r, s) + 2.7, tp.z), q, sc));
				});
				group.add(im);
			}
		}
		/* hala stacji: pasy świetlówek pod stropem – nad osią peronu i nad torem (oprawy po 4 m, przerwy 1,5 m); światło
		   rzucają oprawy z puli świateł stacji (buildStation, userData.always) */
		const strips = [];
		for (const st of r.stations) {
			const P = st.platform;
			if (!P || !this.envUnderground(st)) continue;
			const xs = [0, (P.side || 1) * ((P.edge || 1.7) + (P.width || 6) / 2)];
			if (dbl) xs.push(-4.5);
			for (let s = st.platformStart - 4; s < st.platformEnd + 4; s += 5.5) if (s >= a0 && s < a1) for (const x of xs) strips.push([s, x]);
		}
		for (const [s0, s1, d0, d1] of this.envTunnelPlatforms()) {
			for (let s = s0 - 2; s < s1 + 2; s += 5.5) if (s >= a0 && s < a1) strips.push([s, (d0 + d1) / 2]);
		}
		if (strips.length) {
			if (!World.hallLampM) { World.hallLampM = new T.MeshBasicMaterial({ color: new T.Color(2.4, 2.4, 2.2) }); World.hallLampM.userData.shared = true; }
			const im = new T.InstancedMesh(GEO.box, World.hallLampM, strips.length), m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(0.3, 0.08, 4), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
			strips.forEach(([s, x], k) => {
				R.sidePoint(r, s, x, tp);
				q.setFromAxisAngle(up, -R.trackPoint(r, s, {}).heading);
				im.setMatrixAt(k, m4.compose(p3.set(tp.x, R.heightAt(r, s) + this.envTunnelH(s) - 0.05, tp.z), q, sc));
			});
			group.add(im);
		}
		// portale: ściana czołowa nad wlotem – od sklepienia do terenu nad tunelem (z pomiaru)
		const wallM = mat('#8a857c');
		for (const s of [t.from, t.to]) {
			if (s < c0 || s >= c1) continue;
			const [l, rr] = sides(s), h = R.heightAt(r, s), H = this.envTunnelH(s);
			let top = h + H + 0.8;
			for (const d of [l, 0, rr]) top = Math.max(top, this.demGround(s, d) + 0.4);
			const g = new T.Group();
			this.place(g, s, 0);
			const w = rr - l + 2;
			g.add(box(w, top - (h + H - ARCH), 0.8, wallM, (l + rr) / 2, (top + h + H - ARCH) / 2 - h, 0));
			for (const d of [l - 0.5, rr + 0.5]) g.add(box(1, top - h + 0.6, 0.8, wallM, d, (top - h) / 2 - 0.3, 0));
			group.add(g);
		}
	};

	World.prototype.demTerrainY = function (s, d) {
		const h = R.heightAt(this.route, s), F = h - 0.95;
		const fl = this.flat(s, d), dp = this.dip(s, d);
		const sh = this.envShoulder(s), edge = d >= 0 ? sh.r : sh.l;
		const beyond = Math.max(0, Math.abs(d) - edge);
		let diff = this.demGround(s, d) - F;
		// skarpa: przejście na szerokości 1,5 × różnica + 8 m (nasyp / wykop), stacje płaskie
		const wB = this.env.dem.lidar ? 0.5 * Math.abs(diff) + 2 : 1.5 * Math.abs(diff) + 8; // NMT: skarpy są w pomiarze
		/* pod przęsłem mostu nad wodą (pomiar lidarowy): teren z pomiaru także przy osi – dawniej korona torowiska
		   (poziom toru) biegła pod mostem jak grobla w poprzek rzeki (Wisła w Toruniu: ściana ok. 10 m nad wodą) */
		let wk = 0;
		if (this.env.dem.lidar && Math.abs(d) < 40) for (const b of this.route.bridges) {
			if (b.kind !== 'water' || s < b.from || s > b.to) continue;
			wk = Math.max(wk, smoothstep(b.from, b.from + 8, s) * (1 - smoothstep(b.to - 8, b.to, s)));
		}
		/* tunel (trasa rzeczywista): nad nim teren z pomiaru także przy osi – ulice, place, budynki; zejście do portalu
		   w wykopie (poza tunelem jak dotąd); spłaszczenie stacji nie dotyczy stacji podziemnej */
		/* w obrębie obudowy (szerokość tunelu + 2 m) przejście ostre – tuż za ścianą czołową portalu (wiersze siatki terenu
		   0,5 m przed i za nią); obok obudowy – łagodnie, 12 m (stoki wykopu dojazdowego) */
		let tk = this.envTunnelK(s);
		if (tk > 0 || this.envTunnelK(s + 12) > 0 || this.envTunnelK(s - 12) > 0) {
			const [l0, r0] = this.envTunnelSides(s);
			if (d > l0 - 2 && d < r0 + 2) tk = this.envTunnelSharp(s);
		}
		diff *= Math.max(wk, tk, smoothstep(0, wB, beyond) * (1 - fl));
		let y = F + diff - (this.areaAt(s, d) === 9 && (Math.abs(d) > 10 || wk > 0.5) ? 1.1 : 0);
		// dno pod wodą nie wyżej niż 0,9 m pod poziomem wody (łachy z zaszumionego pomiaru przebijały lustro)
		if (Math.abs(d) > 10 || wk > 0.5) { const wl = this.envWaterLevel(s, d); if (wl !== undefined) y = Math.min(y, wl - 0.9); }
		// koryto cieku: dno i skarpy brzegów (poziom wody z profilu cieku – envStreamBed)
		if (Math.abs(d) > 10 || wk > 0.5) y = Math.min(y, this.envStreamBed(s, d));
		if (dp > 0) y = Math.min(y, F - dp);
		// droga lub tor z mapy z pomiaru: teren w ich pasie na ich wysokości (za koroną torowiska; w jej obrębie – gdy
		// tor leży niżej niż korona); na stacjach – poza peronami (od 14 m od osi)
		// pod przęsłem naszego mostu także przy torze: droga przechodząca pod mostem (łącznik) – teren w jej poziomie
		const far = (fl < 0.5 && Math.abs(d) >= 8) || Math.abs(d) >= 14 || tk > 0.5 || (Math.abs(d) < 14 && this.underBridge(s, d));
		const ry = this.roadLevel(s, d);
		if (ry !== undefined) {
			if (far) { if (beyond > 1.5 || ry - 0.12 < y - 0.3) y = ry - 0.12; }
			/* ulica obok toru albo przy stacji (poza koroną torowiska i peronem), wyżej niż teren tutaj: teren i jezdnia
			   z chodnikiem w poziomie ulicy w całej szerokości – dawniej teren do 8 m (na stacjach do 14 m) od osi zostawał
			   na poziomie torowiska i jezdnia przechylała się ku torom, a chodnik po drugiej stronie stał wyżej */
			// (do 2 m – wyżej to zwykle dojazd do wiaduktu albo ulica na murze oporowym)
			else if (beyond > 0.5 && ry - 0.12 > y && ry - 0.12 - y < 2 && !this.envStationZone(s, d)) y = ry - 0.12;
		}
		// nad obudową tunelu (płytkie przykrycie przy portalu): teren nie niżej niż 0,35 m nad stropem
		if (tk > 0) {
			const [l, rr] = this.envTunnelSides(s);
			if (d > l - 4 && d < rr + 4) {
				const top = h + this.envTunnelH(s) + 0.35, e = Math.min(smoothstep(l - 4, l - 1, d), 1 - smoothstep(rr + 1, rr + 4, d));
				if (y < top) y += (top - y) * tk * e;
			}
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
			// w tunelu naszej linii (w obrębie obudowy): jej poziom – teren z pomiaru to ulica nad tunelem
			if (this.env.dem && this.envTunnelK(s) > 0.5) { const [l, rr] = this.envTunnelSides(s); if (d > l && d < rr) return h; }
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
		const base = this.envTrackY(s, d, crossing, row[0] & 18);
		return base + Math.max(0, y - base) * nearK;
	};
	/* udział „toru ukośnego” (w poprzek naszej linii) w punkcie odcinka k toru z mapy i: w węzłach z kierunku między
	   sąsiednimi węzłami (|Δd| / |Δs| 0,12–0,3 – przejście płynne), wzdłuż odcinka liniowo. Dawniej rozstrzygał każdy
	   odcinek osobno (próg 0,2) – na łukach rozchodzących się torów kolejne odcinki przeskakiwały między wzorami
	   wysokości i szyny miały uskoki po kilkadziesiąt centymetrów co kilka metrów. */
	World.prototype.envRowCross = function (i, k, s, d) {
		const e = this.env, row = this.route.env.t[i];
		if (!e.rowCross) e.rowCross = new Map();
		let w = e.rowCross.get(i);
		if (!w) {
			const n = (row.length - 1) / 2;
			w = new Float32Array(n);
			for (let v = 0; v < n; v++) {
				const a = Math.max(0, v - 1), b = Math.min(n - 1, v + 1);
				const ds = Math.abs(row[1 + b * 2] - row[1 + a * 2]), dd = Math.abs(row[2 + b * 2] - row[2 + a * 2]);
				w[v] = smoothstep(0.12, 0.3, dd / (ds || 1e-9));
			}
			e.rowCross.set(i, w);
		}
		const sa0 = row[1 + k * 2], da0 = row[2 + k * 2], sb0 = row[3 + k * 2], db0 = row[4 + k * 2];
		const L2 = (sb0 - sa0) ** 2 + (db0 - da0) ** 2 || 1e-9, t = Math.max(0, Math.min(1, ((s - sa0) * (sb0 - sa0) + (d - da0) * (db0 - da0)) / L2));
		return w[k] + (w[k + 1] - w[k]) * t;
	};
	World.prototype.envRowY = function (i, k, s, d) {
		const row = this.route.env.t[i];
		const wc = this.envRowCross(i, k, s, d);
		const yl = this.envRowMeasured(i, k, s, d);
		if (yl !== undefined) {
			/* pomiar (NMT): tory przy osi (do 6 m) – poziom naszej linii; dalej zmierzona wysokość, przy czym różnice do
			   0,5 m wyrównane do naszej linii (perony, rozjazdy stacji bez uskoków; te tory tworzą torowisko linii), od
			   1,2 m – pełny pomiar (inna linia); przejście przy 5–7,5 m od osi płynne */
			const h = R.heightAt(this.route, s);
			let yc = yl;
			if (wc > 0 && !(row[0] & 2)) {
				// tor ukośny pod naszym mostem: nie wyżej niż dno wykopu (przejście, którego pomiar nie widzi); tor z mostem
				// w danych leży na pomoście (tory stacji na wiadukcie) – bez obniżenia
				// (bez obniżenia odcinka zaczynającego się albo kończącego na moście z mapy – tor dochodzący do pomostu innych
				// torów, nie przejście pod nim)
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2], Lk = Math.hypot(sb - sa, db - da) || 1;
				const onBr = this.envOnRailBridge(sa, da, (sb - sa) / Lk, (db - da) / Lk) || this.envOnRailBridge(sb, db, (sb - sa) / Lk, (db - da) / Lk);
				const dp = yl < h + 2 && !onBr ? this.dip(s, d, true) : 0;
				if (dp > 0.5) yc = Math.min(yl, h - dp);
			}
			const diff = yl - h;
			const yp = h + diff * smoothstep(0.5, 1.2, Math.abs(diff)) * smoothstep(5, 7.5, Math.abs(d));
			return yp + (yc - yp) * wc;
		}
		const z = this.envRowZ(i, k, s, d);
		if (wc <= 0) return this.envTrackY(s, d, false, row[0] & 18, z);
		if (wc >= 1) return this.envTrackY(s, d, true, row[0] & 18, z);
		const y0 = this.envTrackY(s, d, false, row[0] & 18, z), y1 = this.envTrackY(s, d, true, row[0] & 18, z);
		return y0 + (y1 - y0) * wc;
	};
	// wysokość główki szyny toru z mapy z pomiaru NMT (env.th, dm ponad dem.base) w układzie gry; brak – undefined
	/* punkt (s, d) na moście z mapy: do 1,5 m od odcinka toru z bitem 2 biegnącego w tym samym kierunku co (us, ud)
	   (|cos| ≥ 0,9 – tor przechodzący pod mostem w poprzek się nie liczy); siatka odcinków 8 m, raz na trasę */
	World.prototype.envOnRailBridge = function (s, d, us, ud) {
		const e = this.env, G = 8;
		if (!e.brGrid) {
			e.brGrid = new Map();
			(this.route.env.t || []).forEach((row) => {
				if (!(row[0] & 2)) return;
				const m = (row.length - 1) / 2;
				for (let k = 0; k < m - 1; k++) {
					const s1 = row[1 + k * 2], d1 = row[2 + k * 2], s2 = row[3 + k * 2], d2 = row[4 + k * 2];
					for (let a = Math.floor((Math.min(s1, s2) - 2) / G); a <= Math.floor((Math.max(s1, s2) + 2) / G); a++)
						for (let b = Math.floor((Math.min(d1, d2) - 2) / G); b <= Math.floor((Math.max(d1, d2) + 2) / G); b++) {
							const key = a * 100003 + b;
							if (!e.brGrid.has(key)) e.brGrid.set(key, []);
							e.brGrid.get(key).push([s1, d1, s2, d2]);
						}
				}
			});
		}
		for (const [s1, d1, s2, d2] of e.brGrid.get(Math.floor(s / G) * 100003 + Math.floor(d / G)) || []) {
			const L2 = (s2 - s1) ** 2 + (d2 - d1) ** 2 || 1e-9, t = Math.max(0, Math.min(1, ((s - s1) * (s2 - s1) + (d - d1) * (d2 - d1)) / L2));
			if (Math.hypot(s1 + (s2 - s1) * t - s, d1 + (d2 - d1) * t - d) >= 1.5) continue;
			if (Math.abs((s2 - s1) * us + (d2 - d1) * ud) >= 0.9 * Math.sqrt(L2)) return true;
		}
		return false;
	};
	World.prototype.envRowMeasured = function (i, k, s, d) {
		const th = this.route.env.th, D = this.env.dem;
		// tor w tunelu (bit 16): pomiar NMT to teren nad tunelem – tor na poziomie naszej linii (envTrackY)
		if (!th || !th[i] || !D || !D.lidar || this.route.env.t[i][0] & 16) return undefined;
		const a = th[i][k], b = th[i][k + 1];
		if (!(a >= 0) || !(b >= 0)) return undefined;
		const row = this.route.env.t[i];
		const sa0 = row[1 + k * 2], da0 = row[2 + k * 2], sb0 = row[3 + k * 2], db0 = row[4 + k * 2];
		const t = Math.abs(sb0 - sa0) > Math.abs(db0 - da0) ? (s - sa0) / (sb0 - sa0) : (d - da0) / (db0 - da0);
		/* punkt toru bez mostu leżący na moście z mapy (tor z bitem 2 do 1,5 m obok) ponad 1,5 m poniżej naszej linii –
		   pomiar to droga pod przęsłem: na wysokości naszej linii (pomostu). Dawniej tory dochodzące do mostu zjeżdżały
		   w ostatnim punkcie do jezdni pod nim (Toruń Główny, wiadukt nad ulicą: uskoki ok. 4 m) */
		const Lr = Math.hypot(sb0 - sa0, db0 - da0) || 1;
		const lift = (yv, sx, dx) => {
			if (row[0] & 2 || !this.envOnRailBridge(sx, dx, (sb0 - sa0) / Lr, (db0 - da0) / Lr)) return yv;
			const hh = R.heightAt(this.route, sx);
			return yv < hh - 1.5 ? hh : yv;
		};
		const ya = lift(D.base + a / 10 - D.off, sa0, da0), yb = lift(D.base + b / 10 - D.off, sb0, db0);
		const y = ya + (yb - ya) * Math.max(0, Math.min(1, t));
		/* tor na moście ponad 1,5 m pod terenem z pomiaru – wysokość z prostej między końcami długiego „mostu” na nasypie
		   (pliki z generatora do 0.37): bez pomiaru, na poziomie naszej linii (envTrackY – most) */
		if (row[0] & 2 && y < this.demGround(s, d) - 1.5) return undefined;
		/* tor odzyskany z „wiaduktu” z mapy (envRailBesideToTracks): wysokości z pomiaru powierzchni (NMPT – także
		   obiekty nad torem); ponad 1,5 m nad terenem z pomiaru – na terenie (0,3 m nad pomiarem) –
		   dawniej tor przy Chorzowie Batorym wspinał się nagle na 7–8 m */
		if (this.route.env._roTracks && this.route.env._roTracks.has(i) && y > this.demGround(s, d) + 1.5) return this.demGround(s, d) + 0.3;
		return y;
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
		// w tunelu: głowica na wsporniku przy prawej ścianie (maszt wchodził w ścianę)
		if (this.env.dem && this.envTunnelK(s) > 0.5) return { d: this.envTunnelSides(s)[1] - 0.45, wall: true };
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
	// sieć nad torem pociągu w miejscu s: odcinki z siecią z generatora (wire), bez nich – cała trasa wg electrified
	World.prototype.ownWire = function (s) {
		const r = this.route;
		if (r.wire) return r.wire.some(([a, b]) => s >= a && s <= b);
		return !!r.electrified;
	};

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
			for (const row of e.oByChunk.get(cc) || []) { const pl = this.overpassPlan(row, false); out.push({ P: pl.P, Y: pl.Y, w: pl.w, xa: pl.xa, xb: pl.xb }); }
			for (const row of (e.roByChunk && e.roByChunk.get(cc)) || []) { const pl = this.overpassPlan(row, true); out.push({ P: pl.P, Y: pl.Y, w: pl.w }); }
		}
		e.ovh.set(c, out);
		return out;
	};
	// punkt (s, d) pod przedłużeniem wiaduktu drogowego nad wykopem (overpassPlan: xa, xb) – jezdnia z mapy tu nie jest rysowana
	World.prototype.inDeckExt = function (s, d) {
		if (!this.env) return false;
		for (const o of this.envOverheads(Math.floor(s / C))) {
			if (!o.xa && !o.xb) continue;
			const P = o.P, n = P.length;
			for (let k = 0; k + 1 < n; k++) {
				if (!(k < o.xa || k >= n - 1 - o.xb)) continue;
				const a = P[k], b = P[k + 1], ds = b[0] - a[0], dd = b[1] - a[1], L2 = ds * ds + dd * dd || 1;
				/* tylko w pasie odcinka (rzut na odcinek, bez półkola za końcem pomostu) – dawniej koło o promieniu pół
				   szerokości jezdni za końcem przedłużenia wycinało 3–5 m ulicy dochodzącej do pomostu (szczelina z trawą) */
				const tr = ((s - a[0]) * ds + (d - a[1]) * dd) / L2;
				if (tr < -0.02 || tr > 1.02) continue;
				const t = Math.max(0, Math.min(1, tr));
				if (Math.hypot(s - (a[0] + ds * t), d - (a[1] + dd * t)) < o.w / 2 + 0.5) return true;
			}
		}
		return false;
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
				// spód wiaduktu albo strop tunelu (trasa z mapy) – sieć niska: lina nośna tuż pod stropem, wspornik przy nim
				const ceil = this.env.dem && this.envTunnelK(ss[k]) > 0.5 ? R.heightAt(r, ss[k]) + this.envTunnelH(ss[k]) : Infinity;
				lim.push(Math.min(ceil, ovh.length ? this.deckBottom(ss[k], dd[k], ovh) : Infinity));
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
			if (!inChunk(poles[p]) || !this.ownWire(poles[p]) || !this.ownWire(poles[p + 1])) continue;
			span([poles[p], 0, p, R.heightAt(r, poles[p])], [poles[p + 1], 0, p + 1, R.heightAt(r, poles[p + 1])]);
		}
		// tory zelektryfikowane z mapy (przęsła, których pierwszy słup jest w tym kawałku)
		const rowsHere = new Set();
		for (const c of [Math.floor(s0 / C) - 1, Math.floor(s0 / C), Math.floor(s0 / C) + 1]) for (const { i, row } of e.tByChunk.get(c) || []) if ((row[0] & 8) && !(row[0] & 4) && !this.envRowFromTunnel(i)) rowsHere.add(i); // bez toru nieużywanego (w tunelu – sieć pod stropem, bez słupów)
		for (const i of rowsHere) {
			const sup = this.envWireSupports(i);
			for (let k = 0; k + 1 < sup.length; k++) {
				const A = sup[k], B = sup[k + 1];
				if (Math.abs(B[2] - A[2]) !== 1 || !inChunk(Math.min(A[0], B[0]))) continue;
				if (Math.abs(A[1]) < 1.2 && Math.abs(B[1]) < 1.2) continue; // nad torem pociągu – już jest
				if (Math.abs(A[1]) >= 250 || Math.abs(B[1]) >= 250) continue; // dalej od osi nie stawiamy słupów (tory z mapy do 250 m)
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
		const parts = { steel: [], insul: [], found: [], lattice: [], beam: [], tube: [], weight: [], wheel: [] };
		const F = new T.Matrix4(), Mx = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), S3 = new T.Vector3(), Z = new T.Vector3(0, 0, 1);
		const part = (list, x, y, sx, sy, sz, angle) => {
			Q.setFromAxisAngle(Z, angle || 0);
			Mx.compose(V.set(x, y, 0), Q, S3.set(sx, sy, sz));
			list.push(F.clone().multiply(Mx));
		};
		const tube = (x1, y1, x2, y2, th) => part(parts.tube, (x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1), th * 1.2, th * 1.2, Math.atan2(y2 - y1, x2 - x1));
		// część poza płaszczyzną słupa (z – wzdłuż toru), obrót Eulera (rx, ry, rz)
		const EU = new T.Euler();
		const partZ = (list, x, y, z, sx, sy, sz, rx, rz) => {
			Q.setFromEuler(EU.set(rx || 0, 0, rz || 0));
			Mx.compose(V.set(x, y, z), Q, S3.set(sx, sy, sz));
			list.push(F.clone().multiply(Mx));
		};
		// pręt / linka wzdłuż toru: od (x, y1, z1) do (x, y2, z2)
		const rod = (x, y1, z1, y2, z2, t) => partZ(parts.steel, x, (y1 + y2) / 2, (z1 + z2) / 2, t, t, Math.hypot(y2 - y1, z2 - z1), Math.atan2(-(y2 - y1), z2 - z1));
		/* kotwienie sieci z naprężaczem (co ok. 24 przęsła – koniec odcinka naprężania, jak na zdjęciach sieci PKP): na
		   słupie od strony zewnętrznej dwa stosy ciężarków na prowadnicach (przewód jezdny i lina nośna – dwa odcinki
		   naprężania zachodzą na siebie), krążki u góry z linkami do ciężarków, odciągi słupa wzdłuż toru do fundamentów */
		const anchor = (x, yb, yt, out) => {
			const xo = x + out * 0.42;
			for (const z of [-0.32, 0.32]) {
				const y0 = yb + 1.4;
				for (let k = 0; k < 14; k++) partZ(parts.weight, xo, y0 + k * 0.07, z, 0.36, 0.055, 0.36);
				partZ(parts.steel, xo + out * 0.22, (y0 + yt - 0.6) / 2, z, 0.035, yt - 0.6 - y0 + 0.4, 0.035);
				partZ(parts.steel, xo, (y0 + 14 * 0.07 + yt - 0.55) / 2, z, 0.015, yt - 0.55 - (y0 + 14 * 0.07), 0.015);
				partZ(parts.wheel, xo, yt - 0.4, z, 0.5, 0.06, 0.5, 0, Math.PI / 2);
			}
			for (const e of [-1, 1]) {
				rod(x, yt - 0.3, 0, yb + 0.15, e * 4.2, 0.035);
				partZ(parts.found, x, yb - 0.05, e * 4.2, 0.45, 0.4, 0.45);
			}
		};
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
			// tor pociągu – tylko na odcinku z siecią (słup przy końcu przęsła: tu albo u sąsiada)
			const own = this.ownWire(s) && (this.ownWire(poles[p - 1] ?? s) || this.ownWire(poles[p + 1] ?? s));
			const ds = own ? [0] : [];
			for (const d of supAt.get(p) || []) if (Math.abs(d) < 250 && ds.every((x) => Math.abs(x - d) > 1.2)) ds.push(d);
			if (!ds.length) continue;
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
					if (p % 24 === 12) {
						anchor(xl, yr(lo) - 0.6, yr(lo) + CAT.cw + CAT.sys + 0.6, -1);
						anchor(xr, yr(hi) - 0.6, yr(hi) + CAT.cw + CAT.sys + 0.6, 1);
					}
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
					if (p % 24 === 12) anchor(xp, y - 0.6, y + CAT.cw + CAT.sys + 0.6, Math.sign(xp - d) || 1);
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
		const wM = World.catWeight || (World.catWeight = NS.util.matS('#55585b', { roughness: 0.85, metalness: 0.1 })); // ciężarki betonowe / żeliwne
		const mats = { steel: EM.catSteel, insul: EM.catInsul, found: EM.catFound, lattice: EM.catSteel, beam: EM.catSteel, tube: EM.catSteel, weight: wM, wheel: EM.catSteel };
		const CG = catGeometries(), geos = { steel: GEO.box, found: GEO.box, insul: CG.insul, lattice: CG.lattice, beam: CG.beam, tube: CG.tube, weight: GEO.cyl, wheel: GEO.cyl };
		for (const [k, list] of Object.entries(parts)) {
			if (!list.length) continue;
			const inst = new T.InstancedMesh(geos[k], mats[k], list.length);
			list.forEach((m, i2) => inst.setMatrixAt(i2, m));
			inst.castShadow = (k === 'steel' || k === 'lattice' || k === 'beam' || k === 'tube' || k === 'weight') && this.shadows;
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
		const parts = { timber: [], wood: [], blade: [], steel: [], machine: [], hand: [], lamp: [], ball: [], cab: [] };
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
			// podrozjazdnice: betonowe, przy zwrotnikach ręcznych (rozjazdy starsze, boczne) – drewniane
			const timbers = (u0, u1, vA, vB) => {
				for (let u = u0; u < u1; u += 0.6) {
					const lo = vA(u), hi = vB(u);
					add(handOp ? parts.wood : parts.timber, u, (lo + hi) / 2, -0.26, 0, hi - lo, 0.2, 0.26);
				}
			};
			// iglica od ostrza: linia v(u) (z kątem), odcinkami po 1 m
			const blade = (len, vf, af, sgnIn) => {
				for (let u = 0; u < len; u += 1) {
					const um = u + 0.5, taper = (0.05 * (len - um)) / len;
					add(parts.blade, um, vf(um) + sgnIn * taper, -0.08, af(um), 0.06, 0.13, 1.0);
				}
			};
			/* napęd (wg zdjęć rozjazdów PKP): elektryczny – stalowa podstawa na dwóch podrozjazdnicach, grafitowa obudowa
			   z pokrywą, skrzynka kablowa, drążek nastawczy i dwa drążki kontrolne do iglic, obok szafka ogrzewania rozjazdu
			   na nóżkach; zwrotnik ręczny – skrzynka, dźwignia z kulą przeciwwagi, słupek z latarnią zwrotnicową (białe
			   tarcze wskaźnika położenia z obu stron) */
			const drive = (u, v) => {
				const sv = Math.sign(v) || 1;
				if (handOp) {
					add(parts.hand, u, v, -0.05, 0, 0.36, 0.3, 0.7);
					add(parts.hand, u + 0.45, v, 0.12, 0, 0.06, 0.06, 0.9);
					add(parts.ball, u + 0.88, v, 0.12, 0, 0.24, 0.24, 0.24);
					add(parts.hand, u - 0.2, v + sv * 0.25, 0.5, 0, 0.07, 1.1, 0.07);
					add(parts.hand, u - 0.2, v + sv * 0.25, 1.15, 0, 0.3, 0.38, 0.3);
					for (const e of [-1, 1]) add(parts.lamp, u - 0.2 + e * 0.16, v + sv * 0.25, 1.15, 0, 0.22, 0.26, 0.02);
					add(parts.hand, u - 0.2, v + sv * 0.25, 1.37, 0, 0.36, 0.05, 0.36);
					add(parts.steel, u, v / 2, -0.16, 0, Math.abs(v) - 0.2, 0.06, 0.08);
				} else {
					add(parts.steel, u, v, -0.19, 0, 0.9, 0.05, 1.5);
					add(parts.machine, u, v, -0.02, 0, 0.5, 0.32, 1.1);
					add(parts.machine, u, v, 0.16, 0, 0.56, 0.05, 1.16);
					add(parts.machine, u + 0.72, v + sv * 0.1, -0.05, 0, 0.26, 0.26, 0.24);
					for (const du of [-0.32, 0, 0.32]) add(parts.steel, u + du, v / 2, -0.16, 0, Math.abs(v) - 0.25, du ? 0.04 : 0.06, du ? 0.05 : 0.08);
					// szafka ogrzewania rozjazdu
					add(parts.cab, u - 3.2, v, 0.45, 0, 0.42, 0.85, 0.6);
					for (const du of [-0.22, 0.22]) add(parts.steel, u - 3.2 + du, v, -0.05, 0, 0.05, 0.4, 0.05);
				}
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
		const mats = { timber: M.sleeper, wood: EM.switchWood, blade: M.rail, steel: M.railSide, machine: EM.switchMachine, hand: EM.switchHand, lamp: EM.switchLamp, ball: EM.switchHand, cab: EM.switchCab };
		for (const [k, list2] of Object.entries(parts)) {
			if (!list2.length) continue;
			const inst = new T.InstancedMesh(k === 'ball' ? GEO.sphere : GEO.box, mats[k], list2.length);
			list2.forEach((mm, i) => inst.setMatrixAt(i, mm));
			inst.receiveShadow = true;
			inst.castShadow = (k === 'machine' || k === 'hand' || k === 'cab' || k === 'ball') && this.shadows;
			group.add(inst);
		}
	};

	// ---------- budowa kawałka ----------
	/* Generator: kolejne etapy budowy rozdzielone yield – kawałek buduje się przez kilka klatek (World.update),
	   do sceny trafia w całości. Między krokami nie buduje się nic innego (pule envLampSink / envDeckSink). */
	World.prototype.buildEnvChunk = function* (group, c, dyn) {
		const e = this.env;
		if (!e) return;
		const M = envMaterials();
		// pula świateł kawałka (latarnie na pomostach, peronach) i wyposażenie pomostów drogowych – rysowane razem
		this.envLampSink = [];
		this.envDeckSink = { mk: { p: [], c: [] }, deck: { p: [], c: [] }, lamps: [], signs: [] };
		this.buildEnvOverpasses(group, e.oByChunk.get(c) || []);
		this.buildEnvOverpasses(group, e.roByChunk.get(c) || [], true);
		yield;
		const rs = e.rByChunk.get(c) || [];
		rs.c0 = c * C;
		if (dyn) this.buildEnvLamps(group, rs, dyn);
		yield* this.buildEnvBuildings(group, e.bByChunk.get(c) || [], M);
		yield;
		const rsegs = (e.rByChunk.get(c) || []).slice();
		rsegs.c0 = c * C;
		yield* this.buildEnvRoads(group, rsegs, M, dyn);
		this.buildEnvRetainingWalls(group, c);
		this.buildEnvWater(group, c, e.wByChunk.get(c) || []);
		yield;
		this.buildEnvBridges(group, e.obByChunk.get(c) || []);
		this.deckDressFlush(group, this.envDeckSink);
		this.envDeckSink = null;
		yield;
		yield* this.buildEnvTracks(group, e.tByChunk.get(c) || []);
		yield;
		this.buildEnvWagons(group, e.wagons.get(c));
		this.buildEnvBuffers(group, e.kByChunk.get(c));
		this.buildEnvSwitches(group, e.swByChunk.get(c));
		if (dyn) this.buildEnvYardLights(group, c, dyn);
		yield;
		this.buildEnvPlatforms(group, e.pByChunk.get(c) || [], dyn);
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
	// generator (krok co odcinek toru) – zob. buildEnvChunk
	World.prototype.buildEnvTracks = function* (group, segs) {
		if (!segs.length) return;
		const r = this.route, M = World.materials();
		const bal = { p: [] }, balOld = { p: [] }, rails = { p: [], r: [] }, rust = { p: [] };
		const sleepers = [], woodSl = [];
		const quadStrip = (dst, cols, ys, sa, da, sb, db) => {
			// cols – odsunięcia w poprzek łamanej, ys – wysokości względem główki szyny
			const L = Math.hypot(sb - sa, db - da) || 1;
			const ns = -(db - da) / L, nd = (sb - sa) / L;
			const P = (s, d, o, y) => { R.sidePoint(r, s + ns * o, d + nd * o, tp); return [tp.x, tp.y + y - (dzOf ? dzOf(s, d) : 0) - (o && yWide ? yWide(s, d, o) : 0), tp.z]; };
			// szyny (dst.r): kierunek w poprzek (od pierwszej do ostatniej kolumny) × strona kolumny – World.railAttr
			let lat = null;
			if (dst.r) {
				const L0 = P(sa, da, cols[0], 0), L1 = P(sa, da, cols[cols.length - 1], 0), ll = Math.hypot(L1[0] - L0[0], L1[2] - L0[2]) || 1;
				lat = [(L1[0] - L0[0]) / ll, (L1[2] - L0[2]) / ll];
			}
			const mid = (cols[0] + cols[cols.length - 1]) / 2;
			const R3 = (c) => { const sd = c < mid ? -1 : 1; dst.r.push(lat[0] * sd, 0, lat[1] * sd); };
			for (let j = 0; j < cols.length - 1; j++) {
				const a = P(sa, da, cols[j], ys[j]), b = P(sa, da, cols[j + 1], ys[j + 1]), c2 = P(sb, db, cols[j + 1], ys[j + 1]), d2 = P(sb, db, cols[j], ys[j]);
				const up = ((c2[2] - a[2]) * (b[0] - a[0]) - (c2[0] - a[0]) * (b[2] - a[2])) < 0;
				if (up) dst.p.push(...a, ...b, ...c2, ...a, ...c2, ...d2);
				else dst.p.push(...a, ...c2, ...b, ...a, ...d2, ...c2);
				if (lat) for (const c of up ? [cols[j], cols[j + 1], cols[j + 1], cols[j], cols[j + 1], cols[j]] : [cols[j], cols[j + 1], cols[j + 1], cols[j], cols[j], cols[j + 1]]) R3(c);
			}
		};
		const deck = { p: [] };
		const balWeed = { p: [] };
		const earth = { p: [] };
		const piers = [];
		let dzOf = null, yWide = null;
		const tzAll = this.route.env.tz;
		for (const { i, k, row } of segs) {
			yield;
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
				/* przy torze pociągu (rozjazd): same szyny – podsypka i podkłady są wspólne z torem pociągu; tor równoległy
				   (odcinek prawie równoległy, ponad 2,3 m od osi – w danych mapy tor sąsiedni bywa bliżej niż 4 m, np. Rybnik –
				   Katowice km 3,2–4,3: same szyny na trawie) – z własną podsypką i podkładami */
				const parallel = Math.abs(db - da) < 0.03 * Math.hypot(sb - sa, db - da) + 0.02 && Math.abs(dm) > 2.3;
				const atOurs = Math.abs(dm) < 3.4 && !parallel && !(crossing && this.dip(sm, dm, true) > 2);
				if (atOurs) {
					if (Math.abs(dm) < 0.3 || this.envOccupied(sm, Math.sign(dm) * 3.6, 0)) continue; // na osi / pod peronem
					for (const rd of [-0.75, 0.75]) quadStrip(side ? rust : rails, [rd - 0.06, rd - 0.036, rd + 0.036, rd + 0.06], [-0.22, 0, 0, -0.22], sa, da, sb, db);
					continue;
				}
				// tor równoległy tuż obok: z pasa naszego toru (envOccupied – do 3,2 m od osi) nie odrzucany – tylko perony
				const occ = parallel && Math.abs(dm) < 3.6 ? this.envOccupied(sm, Math.sign(dm) * 3.6, 0) : this.envOccupied(sm, dm, 0.6, true);
				if (occ || (!(row[0] & 18) && (this.envRowFromTunnel(i) || this.envBuriedNearTunnel(sm, dm, R.heightAt(r, sm) - dzOf(sm, dm))))) continue;
				quadStrip(disused ? balWeed : side ? balOld : bal, [-2.2, -1.6, 1.6, 2.2], [-0.95, -0.31, -0.31, -0.95], sa, da, sb, db);
				// tor wyżej niż teren (rampa do wiaduktu innej linii, tor na nasypie): nasyp ze skarpami 1:1,5; wiadukt – filary
				let slab = false; // nasyp wypadałby na ulicę niżej – tor na pomoście
				if (this.env.dem || zr) {
					const yTop = R.heightAt(r, sm) - dzOf(sm, dm) - 0.95, hh = yTop - this.terrainY(sm, dm);
					if (hh > 2 && onBridge && zAt(sm, dm) !== undefined) {
						if (Math.floor(sb / 14) !== Math.floor(sa / 14)) piers.push([sm, dm, yTop - 1.0, this.terrainY(sm, dm) - 0.3, Math.atan2(db - da, sb - sa)]);
					} else if (hh > 0.5 && !onBridge && !this.onBridgeSpan(sm, dm) && this.dip(sm, dm) <= 1) {
						// (nad wykopem pod mostem tor stoi na pomoście – bez nasypu)
						const wd = 2.2 + 1.5 * hh;
						/* skarpy nasypu nie na ulicy ponad 1 m niżej ani na torze niżej (naszym z poboczem – koroną torowiska – albo
						   z mapy): po każdej stronie skarpa do przeszkody (0,5 m przed nią) i dalej pionowa ściana oporowa; przeszkoda
						   tuż przy torze (do 2,6 m od osi) – zamiast nasypu pomost. Dawniej skarpy 1:1,5 zsypywały się na jezdnię pod
						   wiaduktem (Toruń Główny – tory dochodzące do mostu, envRowMeasured) i na tory pod wiaduktem kolejowym
						   (Tarnowskie Góry – Katowice km 32,7) */
						const Ls = Math.hypot(sb - sa, db - da) || 1, ns = -(db - da) / Ls, nd = (sb - sa) / Ls;
						const blocked = (o) => {
							for (const f of [0, 0.5, 1]) {
								const ps = sa + (sb - sa) * f + ns * o, pd = da + (db - da) * f + nd * o;
								const shq = this.envShoulder(ps);
								if (pd < shq.r && pd > -shq.l && R.heightAt(r, ps) < yTop - 0.05) return true;
								if (this.envTracksAt(ps).some((t) => t.i !== i && Math.abs(t.d - pd) < 2.6 && this.envRowY(t.i, t.k, ps, t.d) < yTop - 0.05)) return true;
								if (this.onRoad(ps, pd)) { const rl = this.roadLevel(ps, pd); if (rl !== undefined && rl < yTop - 1) return true; }
							}
							return false;
						};
						const lim = [wd, wd];
						for (const [j, sg] of [[0, -1], [1, 1]]) for (let o = 2.2; o <= wd + 1e-6; o += 0.5) if (blocked(sg * o)) { lim[j] = o - 0.5; break; }
						if (lim[0] < 2.6 || lim[1] < 2.6) slab = true;
						else {
							// skarpa do lim, dalej ściana do podstawy (przy pełnej szerokości – bez ściany)
							const yAt = (o) => -0.95 - hh * Math.min(1, (o - 2.2) / (wd - 2.2));
							const cols = [], ys = [];
							if (lim[0] < wd) { cols.push(-lim[0]); ys.push(-0.95 - hh); }
							cols.push(-lim[0], -2.2, 2.2, lim[1]); ys.push(yAt(lim[0]), -0.95, -0.95, yAt(lim[1]));
							if (lim[1] < wd) { cols.push(lim[1]); ys.push(-0.95 - hh); }
							quadStrip(earth, cols, ys, sa, da, sb, db);
						}
					}
				}
				// tor na moście: pomost (płyta z gzymsami) pod podsypką
				const shm = this.envShoulder(sm), insideM = dm < shm.r - 1.5 && dm > -shm.l + 1.5;
				if (slab || onBridge || (!crossing && (this.onBridgeSpan(sm, dm) || (insideM && this.dip(sm, dm) > 1)))) {
					/* wspólny pomost: tor na pomoście obok (3–7 m, ta sama wysokość ±0,6 m) – po tej stronie płyta do połowy odstępu,
					   bez gzymsu (dawniej każdy tor miał osobny pomost z gzymsami po obu stronach – między torami stacji na
					   wiadukcie stały ścianki, a na rozjazdach się przecinały) */
					const yMe = R.heightAt(r, sm) - dzOf(sm, dm);
					let hl = 0, hr = 0;
					for (const t of this.envTracksAt(sm)) {
						if (t.i === i) continue;
						const dd = t.d - dm;
						if (Math.abs(dd) < 3 || Math.abs(dd) > 7) continue;
						const tr = this.route.env.t[t.i];
						if (!(tr[0] & 2) && !this.onBridgeSpan(sm, t.d)) continue;
						if (Math.abs(this.envRowY(t.i, t.k, sm, t.d) - yMe) > 0.6) continue;
						if (dd > 0) hr = hr ? Math.min(hr, dd / 2 + 0.05) : dd / 2 + 0.05;
						else hl = hl ? Math.min(hl, -dd / 2 + 0.05) : -dd / 2 + 0.05;
					}
					const cols = [], ys = [];
					if (hl) { cols.push(-hl); ys.push(-1.0); } else { cols.push(-2.9, -2.9, -2.6, -2.6); ys.push(-2.0, -0.2, 0.2, -1.0); }
					if (hr) { cols.push(hr); ys.push(-1.0); } else { cols.push(2.6, 2.6, 2.9, 2.9); ys.push(-1.0, 0.2, -0.2, -2.0); }
					quadStrip(deck, cols, ys, sa, da, sb, db);
				}
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
			if (d.r && d.r.length === d.p.length) geo.setAttribute('aRail', new T.Float32BufferAttribute(d.r, 3)); // szyny min. 1 piksel
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
			const m4 = new T.Matrix4(), qt = new T.Quaternion(), p3 = new T.Vector3(), upV = new T.Vector3(0, 1, 0), shade = new T.Color();
			list.forEach(([s, d, ang, dz], i) => {
				R.sidePoint(r, s, d, tp);
				qt.setFromAxisAngle(upV, -tp.heading - ang);
				inst.setMatrixAt(i, m4.compose(p3.set(tp.x, tp.y - 0.27 - (dz || 0), tp.z), qt, sc));
				// lekko różne odcienie podkładów (wiek, zabrudzenie)
				const hs = NS.util.hash(s * 1.37 + d * 3.1);
				inst.setColorAt(i, shade.setScalar(hs < 0.08 ? 0.72 : 0.9 + NS.util.hash(s * 2.11 + d) * 0.16));
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
	// spód zadaszenia z mapy nad punktem (s, d) – wysokość nad główką szyny (jak buildEnvRoofs); brak dachu – undefined
	World.prototype.envRoofUnder = function (s, d) {
		const e = this.env;
		if (!e || !e.rfAll) return undefined;
		let best;
		for (const o of e.rfAll) {
			if (!(s > o.s0 - 0.5 && s < o.s1 + 0.5 && inPoly(o.pts, s, d))) continue;
			const over = o.overTrack !== undefined ? o.overTrack : o.pts.some((p) => Math.abs(p[1]) < 1.8);
			const hRail = over ? Math.max(8.5, o.h || 0) : o.h > 2.5 ? Math.min(7, o.h + 0.77) : 4.4;
			const y = hRail - 0.3;
			if (best === undefined || y < best) best = y;
		}
		return best;
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
				const band = brk ? clip(clip(pts, (p) => p[1] - a), (p) => b - p[1]) : pts;
				if (band.length < 3) continue;
				const mid2 = (a + b) / 2, isGlass = o.glass || (brk && ridges.some((rd) => Math.abs(rd - mid2) < 1.5));
				// pas pocięty co 4 m wzdłuż toru – na łuku dach idzie za torem (długi bok nie jest cięciwą łuku)
				let sa = Infinity, sb = -Infinity;
				for (const q of band) { sa = Math.min(sa, q[0]); sb = Math.max(sb, q[0]); }
				for (let x = sa; x < sb - 1e-6; x += 4) {
					const poly = clip(clip(band, (q) => q[0] - x), (q) => Math.min(sb, x + 4) - q[0]);
					if (poly.length < 3) continue;
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
	/* Tłum na peronie z mapy (s, d): pts – obrys peronu, s0–s1 – zasięg; seats – [s, d, sgn] ławek; stairsAt – zakresy schodów.
	   Szerokość w miejscu s z obrysu (najmniejsze i największe d na przecięciach). */
	World.prototype.envCrowd = function (group, dyn, pts, s0, s1, seats, stairsAt) {
		const n = pts.length, across = (s) => {
			let lo = Infinity, hi = -Infinity;
			for (let k = 0; k < n; k++) {
				const [sa, da] = pts[k], [sb, db] = pts[(k + 1) % n];
				if ((sa - s) * (sb - s) > 0 || sa === sb) continue;
				const d = da + ((db - da) * (s - sa)) / (sb - sa);
				lo = Math.min(lo, d); hi = Math.max(hi, d);
			}
			return lo < hi ? [lo, hi] : null;
		};
		const seed0 = s0 * 0.37 + s1 * 0.11, list = [];
		const free = (s) => !stairsAt.some(([a, b]) => s > a - 1 && s < b + 1);
		// czekający: przy obu krawędziach (1–2,2 m od krawędzi), przodem do toru
		for (let k = 0; k < 14; k++) {
			const seed = seed0 + k * 7.13, s = s0 + 8 + hash(seed) * (s1 - s0 - 16), w = across(s);
			if (!w || !free(s) || w[1] - w[0] < 3) continue;
			const lowSide = hash(seed + 0.4) < 0.5, d = lowSide ? w[0] + 1 + hash(seed + 0.8) * 1.2 : w[1] - 1 - hash(seed + 0.8) * 1.2;
			list.push({ s, d, state: 'wait', yaw: lowSide ? Math.PI / 2 : -Math.PI / 2, spd: 0, seed });
		}
		// siedzący: część ławek zajęta (jedna albo dwie osoby)
		seats.forEach(([s, d, sg], k) => {
			const seed = seed0 + k * 3.3;
			if (hash(seed) < 0.5) return;
			for (const dz of hash(seed + 0.2) < 0.35 ? [-0.45, 0.45] : [(hash(seed + 0.6) - 0.5) * 0.9]) list.push({ s: s + dz, d: d + sg * 0.06, state: 'sit', yaw: sg * Math.PI / 2, spd: 0, seed: seed + dz });
		});
		// spacerujący: wzdłuż osi peronu (±1 m), z przerwami
		for (let k = 0; k < 5; k++) {
			const seed = seed0 + k * 17.3, s = s0 + 10 + hash(seed) * (s1 - s0 - 20), w = across(s);
			if (!w) continue;
			const d = (w[0] + w[1]) / 2 + (hash(seed + 0.3) - 0.5) * 2;
			list.push({ s, d, ts: s0 + 10 + hash(seed + 0.9) * (s1 - s0 - 20), state: 'stroll', spd: 0.9 + hash(seed + 0.7) * 0.5, wait: 0, seed });
		}
		if (!list.length) return;
		const { bodies, heads, setAnim } = World.peopleMeshes(list.length);
		list.forEach((p, k) => {
			bodies.setColorAt(k, col.setHex(World.PEOPLE[Math.floor(hash(p.seed * 1.7) * World.PEOPLE.length)]));
			heads.setColorAt(k, col.setHex(World.SKIN[Math.floor(hash(p.seed * 2.3) * World.SKIN.length)]));
		});
		bodies.castShadow = heads.castShadow = this.shadows;
		bodies.frustumCulled = heads.frustumCulled = false;
		group.add(bodies, heads);
		const d = { type: 'crowd', list, bodies, heads, setAnim, dy: pts.dy || 0, s0: s0 + 10, s1: s1 - 10, stairsAt, init: false };
		dyn.push(d);
		this.updateCrowd(d, 0);
	};
	World.prototype.updateCrowd = function (d, dt) {
		const r = this.route, m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p3 = new T.Vector3(), sc = new T.Vector3();
		let moved = !d.init;
		for (const p of d.list) {
			if (p.state === 'pause') { p.wait -= dt; if (p.wait <= 0) { p.state = 'stroll'; p.ts = d.s0 + Math.random() * (d.s1 - d.s0); } continue; }
			if (p.state !== 'stroll' || dt <= 0) continue;
			moved = true;
			const step = p.spd * Math.min(dt, 0.1), dir = Math.sign(p.ts - p.s);
			let ns = p.s + dir * step;
			// schody – omijane: cel za nimi albo zawrócenie
			if (d.stairsAt.some(([a, b]) => ns > a && ns < b)) { p.ts = p.s - dir * 20; ns = p.s; }
			p.s = ns;
			p.dir = dir;
			if (Math.abs(p.ts - p.s) < 0.3) {
				if (Math.random() < 0.5) { p.state = 'pause'; p.wait = 3 + Math.random() * 8; }
				else p.ts = d.s0 + Math.random() * (d.s1 - d.s0);
			}
		}
		if (!moved) return;
		d.init = true;
		d.list.forEach((p, k) => {
			const moving = p.state === 'stroll';
			if (d.setAnim) d.setAnim(k, hash(p.seed + 0.33) * 6.28, moving ? 1 : p.state === 'sit' ? -1 : 0, p.spd * 0.62);
			// kąt jak na stacjach (lokalnie: z rośnie ku malejącemu s): idący ku rosnącemu s – 0, ku malejącemu – π
			const yaw = moving ? (p.dir < 0 ? Math.PI : 0) : p.state === 'pause' ? Math.sin(p.seed) * 0.8 + Math.PI / 2 : p.yaw;
			R.sidePoint(r, p.s, p.d, tp);
			q.setFromAxisAngle(up, yaw - tp.heading);
			const sz = 0.95 + hash(p.seed) * 0.12;
			m4.compose(p3.set(tp.x, R.heightAt(r, p.s) + d.dy + 0.77, tp.z), q, sc.set(sz, sz, sz));
			d.bodies.setMatrixAt(k, m4);
			d.heads.setMatrixAt(k, m4);
		});
		d.bodies.instanceMatrix.needsUpdate = d.heads.instanceMatrix.needsUpdate = true;
	};
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

	World.prototype.buildEnvPlatforms = function (group, list, dyn = null) {
		if (!list.length) return;
		const r = this.route;
		// a – atrybut aPl (kilometraż względem base, odsunięcie) – wzór płyt peronu wzdłuż toru (common.js PLATFORM_GLSL)
		const top = { p: [], a: [] }, sides = { p: [] }, wl = { p: [], a: [] }, yl = { p: [], a: [] };
		let base = null;
		const pl = (s, d) => { if (base === null) base = Math.floor(s / 100) * 100; return [s - base, d]; };
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
			/* skrajnia: punkt obrysu bliżej niż 1,72 m od osi toru (pociągu albo z mapy, wzdłuż naszego) – odsunięty na tę
			   odległość po stronie, po której leży peron (obrys z mapy bywa niedokładny i płyta zachodziła na tor) */
			const CLR = 1.72;
			let dC = 0;
			for (const p of poly) dC += p[1] / poly.length;
			const clear = (s, d) => {
				for (const t of [{ d: 0 }].concat(this.envTracksAt(s).filter((x) => !x.sk))) {
					const side = Math.sign(dC - t.d) || 1;
					if (Math.abs(d - t.d) < CLR + 1 && side * (d - t.d) < CLR) d = t.d + side * CLR;
				}
				return d;
			};
			const map = ([s, d0]) => {
				const d = clear(s, d0);
				R.sidePoint(r, s, d, tp);
				const y = yAt(s, d);
				// ściana boczna do terenu (obniżony teren przy wiadukcie, nasyp) – peron nie wisi nad ziemią
				return [tp.x, y + 0.77, tp.z, Math.min(y - 0.4, this.terrainY(s, d) - 0.3), ...pl(s, d)];
			};
			const topTri = (A, B, Cc) => {
				top.p.push(A[0], A[1], A[2], B[0], B[1], B[2], Cc[0], Cc[1], Cc[2]);
				top.a.push(A[4], A[5], B[4], B[5], Cc[4], Cc[5]);
			};
			/* wierzch: obrys pocięty na pasy co 4 m wzdłuż toru i boki zagęszczone co 4 m – na łuku peron idzie za torem;
			   dawniej wierzchołki tylko w punktach obrysu, a długi bok (np. 170 m) był w świecie cięciwą łuku i płyta
			   przechodziła przez tor na drugą stronę (Łaziska Górne) */
			let s0 = Infinity, s1 = -Infinity;
			for (const p of poly) { s0 = Math.min(s0, p[0]); s1 = Math.max(s1, p[0]); }
			for (let x = s0; x < s1 - 1e-6; x += 4) {
				const x1 = Math.min(s1, x + 4);
				const piece = clip(clip(poly, (p) => p[0] - x), (p) => x1 - p[0]);
				if (piece.length < 3) continue;
				const Wp = piece.map(map);
				const ids = T.ShapeUtils.triangulateShape(Wp.map((p) => new T.Vector2(p[0], p[2])), []);
				for (const [a, b, c2] of ids) {
					const A = Wp[a], B = Wp[b], Cc = Wp[c2];
					const up = ((Cc[2] - A[2]) * (B[0] - A[0]) - (Cc[0] - A[0]) * (B[2] - A[2])) < 0;
					if (up) topTri(A, B, Cc);
					else topTri(A, Cc, B);
				}
			}
			const dense = [];
			for (let k = 0; k < poly.length; k++) {
				const a = poly[k], b = poly[(k + 1) % poly.length], m = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / 4));
				for (let q = 0; q < m; q++) dense.push([a[0] + ((b[0] - a[0]) * q) / m, a[1] + ((b[1] - a[1]) * q) / m]);
			}
			const W = dense.map(map);
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
				/* peron kończący się do 12 m przed portalem tunelu – bez pochylni (schodziła klinami między torami w wylot,
				   np. Powiśle przed tunelem średnicowym) */
				if (this.env.dem && chk.some((p) => this.envTunnelK(p[0] + no[0] * 12) > 0)) continue;
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
					return [tp.x, yt, tp.z, Math.min(yt - 0.3, y - 0.4, this.terrainY(ps, pd) - 0.3), ...pl(ps, pd)];
				};
				const A = v(a, 0), B = v(b, 0), Ao = v(a, Lr), Bo = v(b, Lr);
				const tri = (P1, P2, P3) => {
					const up = ((P3[2] - P1[2]) * (P2[0] - P1[0]) - (P3[0] - P1[0]) * (P2[2] - P1[2])) < 0;
					if (up) topTri(P1, P2, P3);
					else topTri(P1, P3, P2);
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
				const Q = [A0, A1, B1, B0], v = Q.map((q) => P3(q, y(q)));
				for (const [x, z, w2] of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) {
					dst.p.push(...v[x], ...v[z], ...v[w2]);
					if (dst.a) for (const k of [x, z, w2]) dst.a.push(...pl(Q[k][0], Q[k][1]));
				}
			};
			// pionowa ściana wzdłuż boku (odsunięcie o od krawędzi, wysokości yTop…yBot nad wierzchem) – obie strony
			const face = (dst, a, b, no, o, h0, h1, y) => {
				const A = [a[0] - no[0] * o, a[1] - no[1] * o], B = [b[0] - no[0] * o, b[1] - no[1] * o];
				const v = [P3(A, y(A) + h0), P3(A, y(A) + h1), P3(B, y(B) + h1), P3(B, y(B) + h0)];
				for (const [x, z, w2] of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) dst.p.push(...v[x], ...v[z], ...v[w2]);
			};
			for (let k = 0; k < poly.length; k++) {
				const a = poly[k], b = poly[(k + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
				if (L < 1) continue;
				const no = [(so * -(b[1] - a[1])) / L, (so * (b[0] - a[0])) / L];
				if (Math.abs(no[1]) < 0.9) continue; // bok w poprzek toru
				const m = Math.max(1, Math.ceil(L / 4));
				for (let q = 0; q < m; q++) {
					// (punkty boku odsunięte ze skrajni jak wierzch i ściany – clear)
					const s0q = a[0] + ((b[0] - a[0]) * q) / m, s1q = a[0] + ((b[0] - a[0]) * (q + 1)) / m;
					const p0 = [s0q, clear(s0q, a[1] + ((b[1] - a[1]) * q) / m)], p1 = [s1q, clear(s1q, a[1] + ((b[1] - a[1]) * (q + 1)) / m)];
					const ms = (p0[0] + p1[0]) / 2, md = (p0[1] + p1[1]) / 2;
					const tr = [0].concat(this.envTracksAt(ms).filter((t) => !t.sk).map((t) => t.d));
					if (!tr.some((td) => { const g = (td - md) * Math.sign(no[1]); return g > 1.2 && g < 2.8; })) continue;
					/* krawężnik peronowy (jasne płyty, nawis 7 cm nad ścianą – czoło i spód) i pas ostrzegawczy z wypustkami
					   0,55–0,95 m od krawędzi */
					const y = (p) => yAt(p[0], p[1]) + 0.785;
					strip(wl, p0, p1, no, -0.07, 0.5, y);
					strip(yl, p0, p1, no, 0.55, 0.95, y);
					face(sides, p0, p1, no, -0.07, -0.2, 0, y);
					strip(sides, p0, p1, no, -0.07, 0, (p) => y(p) - 0.2);
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
				// wysokość jak model peronu stacji (przesunięty o różnicę względem 0,76 m – peron niski, np. 0,30 m z PKP PLK);
				// dawniej zawsze 0,76 m – ławki, kosze, wiata i pasażerowie modelu „wpadały” w dorysowaną płytę
				const dh = typeof P.h === 'number' ? P.h - 0.76 : 0;
				parts.forEach((q, k) => { if (q.length >= 3) draw(q, (s2) => R.heightAt(r, s2) - 0.005 + dh, k === 0 ? [a] : k === 1 ? [b] : [a, b]); });
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
			// bez pomiaru: wysokość peronów pobliskiej stacji (PKP PLK, np. 0,30 m), inaczej typowe 0,76 m
			let hSt = 0.77;
			if (yTop === null) {
				const cs = pts.reduce((a, p) => a + p[0], 0) / pts.length;
				const st = r.stations.find((x) => x.platform && typeof x.platform.h === 'number' && cs > x.platformStart - 80 && cs < x.platformEnd + 80);
				if (st) hSt = st.platform.h + 0.01;
			}
			pts.dy = hSt - 0.77; // wyposażenie (latarnie, tablice) na tej samej wysokości
			// w tunelu (peron innej linii we wspólnej obudowie): poziom naszej linii – tor z mapy obok ma wysokość terenu nad tunelem
			draw(poly, (s, d) => (yTop !== null ? yTop - 0.77 : (this.envTunnelK(s) > 0.5 ? R.heightAt(r, s) : this.envTrackY(s, d, false, false)) + hSt - 0.77));
		}
		// wyposażenie: latarnie co 30 m wzdłuż osi peronu i tablice z nazwą najbliższej stacji
		for (const pts of deco) {
			let s0 = Infinity, s1 = -Infinity, dm = 0;
			for (const [s, d] of pts) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); dm += d; }
			dm /= pts.length;
			if (s1 - s0 < 40) continue;
			let st = r.stations.reduce((a, b) => Math.abs((b.platformStart + b.platformEnd) / 2 - (s0 + s1) / 2) < Math.abs((a.platformStart + a.platformEnd) / 2 - (s0 + s1) / 2) ? b : a);
			// stacja innej linii bliżej niż nasza (env.os – pominięte przez generator, np. Śródmieście obok Centralnej)
			{
				const cm = (s0 + s1) / 2, dOur = Math.abs((st.platformStart + st.platformEnd) / 2 - cm);
				let best = null;
				for (const [ps, name] of r.env.os || []) if (Math.abs(ps - cm) < Math.min(dOur, 400) && (!best || Math.abs(ps - cm) < Math.abs(best[0] - cm))) best = [ps, name];
				if (best) st = { name: best[1] };
			}
			const lamps = [];
			for (let s = s0 + 12; s < s1 - 6; s += 30) {
				const g = new T.Group();
				this.place(g, s, dm);
				g.position.y += pts.dy || 0;
				if (this.env.dem && this.envTunnelK(s) > 0.5) {
					// peron w tunelu (hala ze świetlówkami pod stropem): bez latarni na słupie – światło pod stropem, zawsze włączone
					const o = new T.Object3D();
					o.position.set(0, Math.min(5.5, this.envTunnelH(s) - 0.6) - (pts.dy || 0), 0);
					Object.assign(o.userData, { always: true, power: 1.2, drop: 0 });
					g.add(o);
					lamps.push(o);
				} else lamps.push(this.platformLamp(g, 0, 0, dm > 0 ? 1 : -1));
				group.add(g);
			}
			/* peron w tunelu (np. Warszawa Śródmieście): schody do stropu hali (dwa wyjścia, ok. 1/5 i 4/5 peronu, w osi peronu,
			   dół od strony środka peronu) i pawilony wejściowe na powierzchni nad górnym końcem (teren z pomiaru) */
			const stairsAt = [];
			if (this.env.dem && this.envTunnelK((s0 + s1) / 2) > 0.5 && s1 - s0 > 80) {
				const stepM = NS.util.matS('#a9a59c', { roughness: 0.85 }), railM = mat('#6d747c'), wallM = mat('#cfcac0'), w = 2.6, run = 0.3;
				for (const f of [0.2, 0.8]) {
					/* wysokość schodów: górny stopień i ściany 0,3 m pod stropem (od wierzchu peronu: 0,77 m + pts.dy nad szyną) –
					   dawniej H = strop − 0,5 m od wierzchu peronu: ściany i górne stopnie wystawały ok. 0,4 m ponad strop, nad
					   ulicę nad tunelem (np. wyjścia z peronu Śródmieścia) */
					const sb = s0 + (s1 - s0) * f, H = Math.min(6.4, this.envTunnelH(sb) - 0.77 - (pts.dy || 0) - 0.3), steps = Math.round(H / 0.172), rise = H / steps, L = steps * run;
					const dir = f < 0.5 ? -1 : 1; // w stronę bliższego końca peronu (lokalne z rośnie ku malejącemu s)
					const g = new T.Group();
					this.place(g, sb, dm);
					g.position.y += pts.dy || 0;
					for (let k = 0; k < steps; k++) { const h = (k + 1) * rise; g.add(box(w, h, run, stepM, 0, 0.77 + h / 2, -dir * (k + 0.5) * run)); }
					for (const e of [-1, 1]) {
						g.add(box(0.12, H, L, wallM, e * (w / 2 + 0.06), 0.77 + H / 2, (-dir * L) / 2));
						g.add(box(0.06, 0.06, L + 0.4, railM, e * (w / 2 - 0.08), 0.77 + 1.0 + H / 2, (-dir * L) / 2));
					}
					group.add(g);
					stairsAt.push([Math.min(sb, sb + dir * L) - 2, Math.max(sb, sb + dir * L) + 2]);
					// pawilon na powierzchni nad górnym końcem schodów
					// (teren z podniesieniem nad stropem tunelu – demTerrainY; sam pomiar bywa niżej niż strop i pawilon tonął)
					const sTop = sb + dir * L, gy = this.terrainY(sTop, dm);
					if (Number.isFinite(gy)) {
						const pg = new T.Group();
						this.place(pg, sTop, dm);
						pg.position.y = gy;
						const glass = World.materials().glass;
						pg.add(box(4.2, 0.35, 6.4, mat('#8d9096'), 0, 3.15, 0));
						for (const e of [-1, 1]) pg.add(box(0.12, 3.0, 6.0, glass, e * 2.0, 1.5, 0));
						pg.add(box(4.0, 3.0, 0.12, glass, 0, 1.5, dir * 3.0));
						for (const [x, z] of [[-2, -3.1], [2, -3.1], [-2, 3.1], [2, 3.1]]) pg.add(box(0.16, 3.1, 0.16, mat('#5c6168'), x, 1.55, z));
						this.nameBoard(pg, st.name, 3.2, 0.5, 0, 3.6, 0, false);
						group.add(pg);
					}
				}
			}
			const seats = [];
			// ławki parami plecami do siebie i kosze, co 30 m między światłami (poza schodami i tablicami)
			for (let s = s0 + 27; s < s1 - 10; s += 30) {
				if (!(this.env.dem && this.envTunnelK(s) > 0.5) || [0.3, 0.7].some((f) => Math.abs(s - (s0 + (s1 - s0) * f)) < 4) || stairsAt.some(([a, b2]) => s > a - 2 && s < b2 + 2)) continue;
				const g = new T.Group();
				this.place(g, s, dm);
				g.position.y += pts.dy || 0;
				this.bench(g, -0.6, 0, 1);
				this.bench(g, 0.6, 0, -1);
				this.bin(g, 0, 2.2);
				group.add(g);
				seats.push([s, dm - 0.6, 1], [s, dm + 0.6, -1]);
			}
			// pasażerowie na peronie w tunelu (stacja innej linii – np. Warszawa Śródmieście): czekający przy obu krawędziach,
			// siedzący na ławkach, spacerujący wzdłuż peronu
			if (dyn && this.env.dem && this.envTunnelK((s0 + s1) / 2) > 0.5 && s1 - s0 > 80) this.envCrowd(group, dyn, pts, s0, s1, seats, stairsAt);
			for (const f of [0.3, 0.7]) {
				const s = s0 + (s1 - s0) * f, g = new T.Group();
				this.place(g, s, dm);
				g.position.y += pts.dy || 0;
				this.nameBoard(g, st.name, 4.2, 0.8, 0, 3.0, 0, false);
				g.add(box(0.08, 2.75, 0.08, mat('#5d6670'), 0, 1.6, -1.7));
				g.add(box(0.08, 2.75, 0.08, mat('#5d6670'), 0, 1.6, 1.7));
				group.add(g);
			}
			if (lamps.length && this.envLampSink) this.envLampSink.push(...lamps);
		}
		// nawierzchnia z płyt, krawężnik i pas ostrzegawczy (wzór wzdłuż toru – World.platformMats)
		const PM = World.platformMats();
		// ściany boczne – beton jak nawierzchnia, ciemniejszy (wcześniej jasna, gładka biel – peron wyglądał jak pudło)
		const edge = World.platformEdge || (World.platformEdge = NS.util.matS('#9d978c', { roughness: 0.95, surf: 'concrete', side: T.DoubleSide }));
		for (const [d, material] of [[top, PM.top], [sides, edge], [wl, PM.edge], [yl, PM.tact]]) {
			if (!d.p.length) continue;
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(d.p, 3));
			if (d.a) geo.setAttribute('aPl', new T.Float32BufferAttribute(d.a, 2));
			geo.computeVertexNormals();
			const m = new T.Mesh(geo, material);
			m.receiveShadow = true;
			m.castShadow = this.shadows;
			group.add(m);
		}
	};

	// generator (krok co budynek) – zob. buildEnvChunk
	/* budynek nad portalem tunelu (część obrysu nad obudową): obrys przycięty do 0,5 m przed ścianą czołową – dawniej
	   wisiał kilka metrów nad wykopem i torami przed wylotem (Powiśle: 5,5 m przed portalem tunelu średnicowego); obrys
	   z mapy bywa przesunięty, a budynek nad portalem stoi w rzeczywistości na obudowie. Zwraca b, kopię z przyciętym
	   obrysem albo null (prawie cały przed portalem) */
	World.prototype.envClipAtPortal = function (b) {
		if (!this.env.dem || !this.route.tunnels.length) return b;
		const row = b.row, n = b.n;
		for (const t of this.route.tunnels) {
			for (const [ps, dir] of [[t.from, 1], [t.to, -1]]) {
				if (b.s1 < ps - 30 || b.s0 > ps + 30) continue;
				const [l, rr] = this.envTunnelSides(ps);
				if (b.d1 < l - 2 || b.d0 > rr + 2) continue;
				// część nad obudową i część ponad 0,5 m przed portalem
				let inside = false, out = false;
				for (let k = 0; k < n; k++) {
					const f = (row[3 + k * 2] - ps) * dir;
					if (f > 0.5) inside = true;
					if (f < -0.5) out = true;
				}
				if (!inside || !out) continue;
				const pts = [];
				for (let k = 0; k < n; k++) pts.push([row[3 + k * 2], row[4 + k * 2]]);
				const g = (p) => (p[0] - ps) * dir + 0.5, cut = [];
				for (let k = 0; k < n; k++) {
					const a = pts[k], c = pts[(k + 1) % n], fa = g(a), fc = g(c);
					if (fa >= 0) cut.push(a);
					if (fa >= 0 !== fc >= 0) { const q = fa / (fa - fc); cut.push([a[0] + (c[0] - a[0]) * q, a[1] + (c[1] - a[1]) * q]); }
				}
				let area = 0;
				for (let k = 0; k < cut.length; k++) { const a = cut[k], c = cut[(k + 1) % cut.length]; area += a[0] * c[1] - c[0] * a[1]; }
				if (cut.length < 3 || Math.abs(area) / 2 < 20) return null;
				const nr = [row[0], row[1], row[2]];
				let cs = 0, s0 = Infinity, s1 = -Infinity, d0 = Infinity, d1 = -Infinity;
				for (const [s, d] of cut) { nr.push(s, d); cs += s; s0 = Math.min(s0, s); s1 = Math.max(s1, s); d0 = Math.min(d0, d); d1 = Math.max(d1, d); }
				return { ...b, row: nr, n: cut.length, s0, s1, d0, d1, cs: cs / cut.length };
			}
		}
		return b;
	};

	World.prototype.buildEnvBuildings = function* (group, list, M) {
		if (!list.length) return;
		const r = this.route;
		const fa = { p: [], uv: [], c: [] }, pl = { p: [], uv: [], c: [] }, rf = { p: [], uv: [], c: [] }; // rf – dachy (osobny materiał)
		const tri = (dst, a, b, c2, ua, ub, uc, rgb) => {
			dst.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c2[0], c2[1], c2[2]);
			dst.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
			for (let k = 0; k < 3; k++) dst.c.push(rgb.r, rgb.g, rgb.b);
		};
		const Z = [0, 0];
		/* prostopadłościan do siatki dst: środek (x, z), od y0 do y1, w – wzdłuż kierunku (ax, az), dp – w poprzek;
		   ściany na zewnątrz (balkony, kominy) */
		const cub = (dst, x, z, y0, y1, ax, az, w, dp, rgb, noBottom) => {
			const bx = -az, bz = ax, V = [];
			for (const y of [y0, y1]) for (const sa of [-1, 1]) for (const sb of [-1, 1]) V.push([x + (ax * sa * w) / 2 + (bx * sb * dp) / 2, y, z + (az * sa * w) / 2 + (bz * sb * dp) / 2]);
			const yc = (y0 + y1) / 2;
			for (const f of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) {
				if (noBottom && f[0] === 0 && f[1] === 1) continue;
				const a = V[f[0]], b2 = V[f[1]], c2 = V[f[2]], d2 = V[f[3]];
				const fc = [(a[0] + c2[0]) / 2 - x, (a[1] + c2[1]) / 2 - yc, (a[2] + c2[2]) / 2 - z];
				const e1 = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], e2 = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]];
				const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
				if (nn[0] * fc[0] + nn[1] * fc[1] + nn[2] * fc[2] >= 0) { tri(dst, a, b2, c2, Z, Z, Z, rgb); tri(dst, a, c2, d2, Z, Z, Z, rgb); }
				else { tri(dst, a, c2, b2, Z, Z, Z, rgb); tri(dst, a, d2, c2, Z, Z, Z, rgb); }
			}
		};
		const BALC = ['#d9d4c8', '#8a9aa6', '#c96f4a', '#6f8f6a', '#e3c86b', '#9aa3ab'];
		const reserved = (this.env && this.env.reserved) || [];
		/* zaspy (zima) pod ścianami od strony wiatru (z zachodu – ujemne s… w układzie trasy umownie: normalna ściany
		   w stronę (−1, 0,35)) i losowo pod pozostałymi; przekrój – klin oparty o ścianę */
		const drifts = this.season === 'winter' ? [] : null, dProf = [[0, 1], [0.3, 0.88], [0.75, 0.5], [1.3, 0.15], [1.7, 0]];
		this.envSignSink = []; // szyldy budynków kawałka – jedna siatka na stronę atlasu
		for (let b of list) {
			yield;
			if (reserved.some((q) => b.s1 > q.s0 && b.s0 < q.s1 && b.d1 > q.d0 && b.d0 < q.d1)) continue;
			b = this.envClipAtPortal(b);
			if (!b) continue;
			const row = b.row, n = b.n, kind = row[0], h = row[1] / 10, roofS = row[2];
			if (drifts && h > 1.5) {
				let area = 0;
				for (let k = 0; k < n; k++) { const a = (k + 1) % n; area += row[3 + k * 2] * row[4 + a * 2] - row[3 + a * 2] * row[4 + k * 2]; }
				const sgA = area > 0 ? 1 : -1;
				for (let k = 0; k < n; k++) {
					const a = (k + 1) % n, sa = row[3 + k * 2], da = row[4 + k * 2], sb = row[3 + a * 2], db = row[4 + a * 2];
					const L = Math.hypot(sb - sa, db - da);
					if (L < 3) continue;
					// normalna na zewnątrz obrysu w (s, d)
					const ns = ((db - da) / L) * sgA, nd = (-(sb - sa) / L) * sgA;
					const wind = -ns * 0.94 + nd * 0.35;
					if (wind < 0.2 && hash(b.i * 0.71 + k * 1.3) > 0.25) continue;
					const pts = [], steps = Math.max(1, Math.round(L / 2.5));
					for (let q = 0; q <= steps; q++) {
						const f = q / steps, s = sa + (sb - sa) * f + ns * 0.05, d = da + (db - da) * f + nd * 0.05;
						if (this.onRoad(s + ns, d + nd) || this.envTrackGap(s + ns, d + nd) < 2.5) { if (pts.length > 2) drifts.push({ pts: pts.splice(0), prof: dProf }); else pts.length = 0; continue; }
						R.sidePoint(r, s, d, tp);
						const x = tp.x, z = tp.z;
						R.sidePoint(r, s + ns, d + nd, tp);
						// wyżej w środku ściany, niżej przy narożnikach; od strony wiatru wyższe
						const H = (0.25 + 0.45 * Math.max(0, wind)) * (0.55 + 0.45 * Math.sin(Math.PI * f)) * (0.7 + 0.6 * vnoise(s * 0.3, d * 0.3));
						pts.push({ x, y: this.terrainY(s, d) - 0.05, z, nx: tp.x - x, nz: tp.z - z, H });
					}
					if (pts.length > 1) drifts.push({ pts, prof: dProf });
				}
			}
			const seed = b.i * 1.37 + b.cs * 0.013;
			const use = (this.env.bUse && this.env.bUse[b.i]) || 0;
			// elewacja wg rodzaju (urzędy, służby, szkoły…; bloki i domy z usługą na parterze – bez zmian)
			const UW = USE_WALL[use] && kind !== 0 && kind !== 1 ? USE_WALL[use] : null;
			const wall = col.set(UW ? UW[Math.floor(hash(seed) * UW.length)] : WALLS[kind][Math.floor(hash(seed) * WALLS[kind].length)]).clone();
			const roofC = col.set(ROOFS[kind][Math.floor(hash(seed + 0.5) * ROOFS[kind].length)]).clone();
			// wierzchołki obrysu w świecie, podstawa – najniższy punkt terenu pod budynkiem
			/* budynek przy tunelu (część obrysu nad obudową): stoi na stropie – przy portalu także część nad wykopem przed nim
			   (do 15 m, np. pawilon stacji Warszawa Powiśle na poziomie ulicy nad wylotem), nie jako zadaszenie nad torami */
			let atTunnel = false;
			if (this.env.dem) for (let k = 0; k < n && !atTunnel; k++) { const s = row[3 + k * 2], d = row[4 + k * 2]; atTunnel = this.envOverTunnel(s, d, -Infinity) > -Infinity; }
			const P = [];
			let base = Infinity, cx = 0, cz = 0;
			for (let k = 0; k < n; k++) {
				const s = row[3 + k * 2], d = row[4 + k * 2];
				R.sidePoint(r, s, d, tp);
				const y = this.envOverTunnel(s, d, this.terrainY(s, d), atTunnel ? 15 : 2);
				base = Math.min(base, y);
				P.push([tp.x, 0, tp.z]);
				cx += tp.x; cz += tp.z;
			}
			cx /= n; cz /= n;
			/* budynek przy portalu: podstawa z terenu nad samą obudową (poziom ulicy nad tunelem), a nie ze stropu przy wykopie
			   (pawilon Powiśla nad wschodnim wylotem stał wtedy za nisko, poniżej ulicy) */
			if (atTunnel) {
				let bIn = Infinity;
				for (let k = 0; k < n; k++) { const s = row[3 + k * 2], d = row[4 + k * 2]; if (this.envOverTunnel(s, d, -Infinity, 0) > -Infinity) bIn = Math.min(bIn, this.envOverTunnel(s, d, this.terrainY(s, d), 0)); }
				if (bIn < Infinity) base = Math.max(base, bIn);
			}
			base -= 0.3;
			// budynek na zboczu (podstawa w najniższym punkcie): dach co najmniej 2,5 m ponad najwyższym punktem terenu pod
			// obrysem – inaczej górna strona chowała się w terenie („zapadnięty” budynek przy wykopie lub nasypie)
			let topG = -Infinity;
			for (let k = 0; k < n; k++) topG = Math.max(topG, this.terrainY(row[3 + k * 2], row[4 + k * 2]));
			let top = Math.max(base + 0.3 + h, topG + Math.min(h, 2.5));
			/* budynek pod pomostem wiaduktu drogowego (sklepy pod estakadą): dach 0,2 m pod spodem pomostu (gdy zostaje
			   ponad 2,5 m) – dawniej bryła z wysokością z mapy przebijała jezdnię estakady (Chorzów, km 24,8) */
			if (this.env.dem) {
				const ovh = this.envOverheads(Math.floor(b.cs / C));
				if (ovh.length) {
					// (wierzchołki obrysu i środek – pomost węższy niż budynek)
					let db = this.deckBottom(b.cs, (b.d0 + b.d1) / 2, ovh);
					for (let k = 0; k < n; k++) db = Math.min(db, this.deckBottom(row[3 + k * 2], row[4 + k * 2], ovh));
					if (db < Infinity && db - base > 2.5 && top > db - 0.2) top = db - 0.2;
				}
			}
			if (kind === 7) { this.envStadium(pl, tri, b, P, base, top, seed, group); continue; }
			/* nad torami (hala peronowa, zadaszenie, pomost – w danych jako budynek): sam dach na zmierzonej wysokości,
			   widoczny też od spodu, bez ścian */
			let overTrack = false;
			for (let k = 0; k <= n && !overTrack && !atTunnel; k++) {
				let s0 = 0, d0 = 0;
				if (k < n) { s0 = row[3 + k * 2]; d0 = row[4 + k * 2]; } else { for (let q = 0; q < n; q++) { s0 += row[3 + q * 2] / n; d0 += row[4 + q * 2] / n; } }
				// nad tunelem tory są pod ziemią – zwykły budynek (np. hala Dworca Centralnego nad tunelem średnicowym)
				if (this.env.dem && this.envTunnelK(s0) > 0.5) continue;
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
			/* balkony bloków mieszkalnych (wg zdjęć bloków z wielkiej płyty): płyta i balustrada przed oknem co drugiego
			   (albo co trzeciego) przęsła elewacji, od pierwszego piętra – na ścianach dłuższych niż 9 m; przęsła i kondygnacje
			   jak w teksturze elewacji (okno w środku przęsła 3 m, kondygnacje co 3 m od cokołu) */
			if (kind === 1 && (!use || use === 2) && h >= 8.5 && hash(seed + 7.7) < 0.8) {
				const every = hash(seed + 8.1) < 0.6 ? 2 : 3, ph = Math.floor(hash(seed + 8.4) * every);
				const rail = col.set(BALC[Math.floor(hash(seed + 8.8) * BALC.length)]).clone(), slab = col.set('#b9b6ae').clone();
				let accB = Math.floor(hash(seed + 0.9) * 4) * 3;
				for (let k = 0; k < n; k++) {
					const p = P[k], q = P[(k + 1) % n], len = Math.hypot(q[0] - p[0], q[2] - p[2]);
					const ux = (q[0] - p[0]) / (len || 1), uz = (q[2] - p[2]) / (len || 1), [nx, nz] = NE[k];
					if (len >= 9) {
						for (let t = 1.5 - (accB % 3); t < len - 1.6; t += 3) {
							if (t < 1.6 || Math.round((accB + t - 1.5) / 3) % every !== ph) continue;
							for (let y = base + 3.3; y + 1.3 < top - 0.45; y += 3) {
								const x0 = p[0] + ux * t, z0 = p[2] + uz * t;
								// płyta (wysunięta 1,1 m), balustrada od frontu i po bokach
								cub(pl, x0 + nx * 0.55, z0 + nz * 0.55, y - 0.16, y, ux, uz, 2.5, 1.1, slab);
								cub(pl, x0 + nx * 1.07, z0 + nz * 1.07, y, y + 1.0, ux, uz, 2.5, 0.05, rail, true);
								for (const e of [-1, 1]) cub(pl, x0 + ux * e * 1.225 + nx * 0.55, z0 + uz * e * 1.225 + nz * 0.55, y, y + 1.0, ux, uz, 0.05, 1.0, rail, true);
							}
						}
					}
					accB += len;
				}
			}
			if (use) this.envBuildingDecor(group, pl, tri, b, use, P, NE, ccw, base, top, h, seed, flatRoof, cx, cz);
			// dworzec z mapy: tablica z nazwą stacji na ścianie najbliższej torów
			if (kind === 6) this.envStationSign(group, b, top);
			// dachy
			const up = (a, b2, c2) => ((b2[2] - a[2]) * (c2[0] - a[0]) - (b2[0] - a[0]) * (c2[2] - a[2])) > 0; // normalna w górę
			const roofTri = (a, b2, c2, rgb) => { if (up(a, b2, c2)) tri(rf, a, b2, c2, Z, Z, Z, rgb); else tri(rf, a, c2, b2, Z, Z, Z, rgb); };
			const at = (p, y) => [p[0], y, p[2]];
			if (roofS === 1 && n === 4) {
				// dwuspadowy: kalenica wzdłuż dłuższego boku, szczyty w kolorze ścian
				const l0 = Math.hypot(P[1][0] - P[0][0], P[1][2] - P[0][2]), l1 = Math.hypot(P[2][0] - P[1][0], P[2][2] - P[1][2]);
				const o = l0 >= l1 ? 0 : 1;
				const A = P[o], B = P[(o + 1) % 4], Cc = P[(o + 2) % 4], D = P[(o + 3) % 4];
				const rh = Math.min(5.5, 0.42 * Math.min(l0, l1) + 0.6);
				const R0 = [(D[0] + A[0]) / 2, top + rh, (D[2] + A[2]) / 2], R1 = [(B[0] + Cc[0]) / 2, top + rh, (B[2] + Cc[2]) / 2];
				/* okap: połacie wysunięte 0,4 m poza ściany (także nad szczytami), od spodu podbitka; dawniej dach kończył się
				   równo ze ścianą */
				const EV = 0.4, slope = rh / Math.max(1, Math.min(l0, l1) / 2), Oe = offP(EV);
				const rl = Math.hypot(R1[0] - R0[0], R1[2] - R0[2]) || 1, rx = (R1[0] - R0[0]) / rl, rz = (R1[2] - R0[2]) / rl;
				const R0e = [R0[0] - rx * EV, R0[1], R0[2] - rz * EV], R1e = [R1[0] + rx * EV, R1[1], R1[2] + rz * EV];
				const ye = top - EV * slope, E = (j) => [Oe[(o + j) % 4][0], ye, Oe[(o + j) % 4][1]];
				const soffit = roofC.clone().multiplyScalar(0.45);
				for (const [a, b2, c2] of [[E(0), E(1), R1e], [E(0), R1e, R0e], [E(2), E(3), R0e], [E(2), R0e, R1e]]) {
					roofTri(a, b2, c2, roofC);
					const dn = (v) => [v[0], v[1] - 0.1, v[2]];
					if (up(dn(a), dn(b2), dn(c2))) tri(rf, dn(a), dn(c2), dn(b2), Z, Z, Z, soffit); else tri(rf, dn(a), dn(b2), dn(c2), Z, Z, Z, soffit);
				}
				// komin (dom): murowany, przy kalenicy, z czapą
				if (kind === 0 && hash(seed + 5.5) < 0.85) {
					const f = 0.25 + hash(seed + 5.9) * 0.5, sd = hash(seed + 6.2) < 0.5 ? -1 : 1;
					const px = R0[0] + (R1[0] - R0[0]) * f + rz * sd * 0.7, pz = R0[2] + (R1[2] - R0[2]) * f - rx * sd * 0.7;
					const yb = top + rh - 0.7 * slope - 0.3, yt = top + rh + 0.9;
					const brick = col.set(hash(seed + 6.6) < 0.6 ? '#8a4a3a' : '#bdb6aa').clone();
					cub(pl, px, pz, yb, yt, rx, rz, 0.55, 0.55, brick, true);
					cub(pl, px, pz, yt, yt + 0.08, rx, rz, 0.72, 0.72, col.set('#55595e').clone());
				}
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
				// okap 0,35 m z podbitką (jak przy dachu dwuspadowym)
				const Oe = offP(0.35), soffit = roofC.clone().multiplyScalar(0.45), ye = top - 0.2;
				for (let k = 0; k < n; k++) {
					const a = [Oe[k][0], ye, Oe[k][1]], b2 = [Oe[(k + 1) % n][0], ye, Oe[(k + 1) % n][1]];
					roofTri(a, b2, apex, roofC);
					const dn = (v) => [v[0], v[1] - 0.1, v[2]], ap = dn(apex);
					if (up(dn(a), dn(b2), ap)) tri(rf, dn(a), ap, dn(b2), Z, Z, Z, soffit); else tri(rf, dn(a), dn(b2), ap, Z, Z, Z, soffit);
				}
				if (kind === 0 && hash(seed + 5.5) < 0.85) {
					const ox = (P[0][0] - cx) * 0.25, oz = (P[0][2] - cz) * 0.25, hy = apex[1] - top;
					const brick = col.set(hash(seed + 6.6) < 0.6 ? '#8a4a3a' : '#bdb6aa').clone();
					cub(pl, cx + ox, cz + oz, top + hy * 0.6, apex[1] + 0.7, 1, 0, 0.55, 0.55, brick, true);
					cub(pl, cx + ox, cz + oz, apex[1] + 0.7, apex[1] + 0.78, 1, 0, 0.72, 0.72, col.set('#55595e').clone());
				}
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
		mesh(rf, M.roof);
		if (drifts && drifts.length) { const dm = World.driftMesh(drifts); if (dm) group.add(dm); }
		const bySheet = new Map();
		for (const q of this.envSignSink) { if (!bySheet.has(q.pg)) bySheet.set(q.pg, []); bySheet.get(q.pg).push(q); }
		for (const [pg, qs] of bySheet) group.add(quadMesh(qs, pg.mat));
		this.envSignSink = null;
	};

	/* Stadion (rodzaj budynku 7): obrys z mapy to zewnętrzna ściana. W środku boisko (env.sp – z leisure=pitch, bez
	   niego piłkarskie 105 × 68 m wzdłuż osi obrysu) z pasami murawy, liniami i bramkami; wokół trybuny schodkowe
	   w dwóch kondygnacjach (między nimi przejście i pas lóż), nad nimi pierścień dachu z otworem nad boiskiem.
	   Pierścienie – obrys przeskalowany względem środka; wewnętrzny dobrany tak, by mieścił boisko z obrzeżem. */
	World.prototype.envStadium = function (dst, tri, b, P, base, top, seed, group) {
		const r = this.route, n = P.length, row = b.row;
		const Z = [0, 0];
		const C3 = (hex) => new T.Color(hex);
		// trójkąt / czworokąt zwrócony w stronę wektora (tx, ty, tz) albo z obu stron (bez wektora)
		const face3 = (a, b2, c, rgb, tx, ty, tz, out = dst) => {
			if (tx === undefined) { tri(out, a, b2, c, Z, Z, Z, rgb); tri(out, a, c, b2, Z, Z, Z, rgb); return; }
			const e1 = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
			const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
			if (nx * tx + ny * ty + nz * tz >= 0) tri(out, a, b2, c, Z, Z, Z, rgb);
			else tri(out, a, c, b2, Z, Z, Z, rgb);
		};
		const face = (a, b2, c, d, rgb, tx, ty, tz) => { face3(a, b2, c, rgb, tx, ty, tz); face3(a, c, d, rgb, tx, ty, tz); };
		let cx = 0, cz = 0, sC = 0, dC = 0;
		for (let k = 0; k < n; k++) { cx += P[k][0] / n; cz += P[k][2] / n; sC += row[3 + k * 2] / n; dC += row[4 + k * 2] / n; }
		let rad = 0;
		for (const p of P) rad += Math.hypot(p[0] - cx, p[2] - cz) / n;
		const ringAt = (f) => P.map((p) => [cx + (p[0] - cx) * f, cz + (p[2] - cz) * f]);
		const outer = ringAt(1);
		const inPoly = (x, z, poly) => {
			let c = false;
			for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
				const [xi, zi] = poly[i], [xj, zj] = poly[j];
				if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
			}
			return c;
		};
		// boisko: środek i kierunek dłuższego boku w świecie
		const pt = this.env.bPitch && this.env.bPitch.get(b.i);
		let px, pz, ux, uz, hl = 52.5, hw = 34;
		if (pt) {
			R.sidePoint(r, pt.s, pt.d, tp);
			px = tp.x; pz = tp.z;
			R.sidePoint(r, pt.s + pt.us * 10, pt.d + pt.ud * 10, tp);
			const L = Math.hypot(tp.x - px, tp.z - pz) || 1;
			ux = (tp.x - px) / L; uz = (tp.z - pz) / L;
			hl = pt.hl; hw = pt.hw;
		} else {
			let sxx = 0, szz = 0, sxz = 0;
			for (const p of P) { const dx = p[0] - cx, dz = p[2] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
			const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
			ux = Math.cos(ang); uz = Math.sin(ang); px = cx; pz = cz;
		}
		const vx = -uz, vz = ux;
		const at = (a, c, y) => [px + ux * a + vx * c, y, pz + uz * a + vz * c];
		// najmniejszy pierścień wewnętrzny (skala obrysu), w którym mieści się boisko z obrzeżem (8 m za liniami bramkowymi,
		// 6 m z boku); boisko za duże na obrys – pomniejszone
		const fits = (f, sc) => [[1, 1], [1, -1], [-1, -1], [-1, 1]].every(([a, c]) => {
			const q = at(a * (hl * sc + 8), c * (hw * sc + 6), 0);
			return inPoly(cx + (q[0] - cx) / f, cz + (q[2] - cz) / f, outer);
		});
		let sc = 1;
		while (sc > 0.3 && !fits(0.82, sc)) sc -= 0.05;
		let lo = 0.2, hi = 0.82;
		for (let it = 0; it < 16; it++) { const m = (lo + hi) / 2; if (fits(m, sc)) hi = m; else lo = m; }
		const fIn = hi, inner = ringAt(fIn);
		const L = hl * sc, W = hw * sc;
		// poziom murawy: teren pod boiskiem i przy trybunach nie przebija murawy
		let yP = base + 0.3;
		for (let k = 0; k < n; k++) yP = Math.max(yP, this.terrainY(sC + (row[3 + k * 2] - sC) * fIn, dC + (row[4 + k * 2] - dC) * fIn) + 0.06);
		if (pt) for (const [a, c] of [[0, 0], [1, 1], [1, -1], [-1, -1], [-1, 1]]) yP = Math.max(yP, this.terrainY(pt.s + pt.us * a * L - pt.ud * c * W, pt.d + pt.ud * a * L + pt.us * c * W) + 0.06);
		yP = Math.min(yP, base + 4);
		const H = top - yP;
		if (H < 6) return;

		// ---- trybuny: ściana band, niższa kondygnacja, przejście z lożami, wyższa kondygnacja, ściana pod dachem ----
		const SEATS = [['#b3262b', '#c9c9c9'], ['#1f4e9c', '#2f63b8'], ['#c9c9c9', '#a8acb0'], ['#c8a227', '#1f4e9c'], ['#b3262b', '#e8e8e8']];
		const seats = SEATS[Math.floor(hash(seed + 2.1) * SEATS.length)].map(C3);
		const conc = C3('#9a9c9e'), riserC = C3('#7d8084'), glass = C3('#2c3b47'), adA = C3('#1d4f9e'), adB = C3('#e6e8ea');
		const fT = Math.max(fIn + 0.12, 1 - 3.5 / Math.max(rad, 20)); // najwyższy rząd 3,5 m od ściany zewnętrznej
		const yT = top - Math.max(2.5, Math.min(5, H * 0.12));
		const y0 = yP + 1.2;
		const ring = (f) => (f === fIn ? inner : ringAt(f));
		const toC = (x, z) => [cx - x, 0, cz - z];
		// pierścień pionowy (f, ya → yb) zwrócony do środka
		const wallIn = (f, ya, yb, colOf) => {
			const q = ring(f);
			for (let k = 0; k < n; k++) {
				const a = q[k], c = q[(k + 1) % n], t = toC((a[0] + c[0]) / 2, (a[1] + c[1]) / 2);
				face([a[0], ya, a[1]], [c[0], ya, c[1]], [c[0], yb, c[1]], [a[0], yb, a[1]], colOf(k), t[0], 0, t[2]);
			}
		};
		// pierścień poziomy (fa → fb na wysokości y) zwrócony w górę
		const flat = (fa, fb, y, rgb) => {
			const qa = ring(fa), qb = ring(fb);
			for (let k = 0; k < n; k++) {
				const k2 = (k + 1) % n;
				face([qa[k][0], y, qa[k][1]], [qa[k2][0], y, qa[k2][1]], [qb[k2][0], y, qb[k2][1]], [qb[k][0], y, qb[k][1]], rgb, 0, 1, 0);
			}
		};
		// kondygnacja schodkowa: od (fa, ya) do (fb, yb), stopnie (siedziska) i podstopnie
		const tier = (fa, ya, fb, yb) => {
			const N = Math.max(4, Math.min(28, Math.round((yb - ya) / 0.9)));
			for (let i = 0; i < N; i++) {
				const f0 = fa + ((fb - fa) * i) / N, f1 = fa + ((fb - fa) * (i + 1)) / N, yy = ya + ((yb - ya) * i) / N, y1 = ya + ((yb - ya) * (i + 1)) / N;
				flat(f0, f1, yy, seats[hash(seed + i * 0.37) < 0.12 ? 1 : 0]);
				wallIn(f1, yy, y1, () => riserC);
			}
		};
		wallIn(fIn, yP, y0, (k) => (k % 2 ? adA : adB)); // bandy reklamowe
		const fM = fIn + (fT - fIn) * 0.48, yM = y0 + (yT - y0) * 0.42;
		const fM2 = Math.min(fT - 0.04, fM + 4 / Math.max(rad, 20));
		tier(fIn, y0, fM, yM);
		flat(fM, fM2, yM, conc); // przejście
		const yU = Math.min(yT - 2, yM + 3);
		wallIn(fM2, yM, yU, () => glass); // loże
		tier(fM2, yU, fT, yT);
		flat(fT, 1, yT, conc);
		wallIn(fT, yT, top - 1.2, () => conc);

		// ---- dach: pierścień od ściany zewnętrznej do otworu nad boiskiem, lekko opadający do środka ----
		const roofC = C3('#e2e4e6'), roofIn = C3('#c4c7ca'), white = C3('#f4f4f2');
		const fR = fIn + (1 - fIn) * 0.32, qR = ringAt(fR), yR = top - 1.2;
		/* dach – osobna siatka bez mapy nocnej (plamy świateł nad trybunami, liczone w rzucie, rozjaśniałyby go z góry) */
		const rb = { p: [], uv: [], c: [] };
		for (let k = 0; k < n; k++) {
			const k2 = (k + 1) % n;
			face3([outer[k][0], top, outer[k][1]], [outer[k2][0], top, outer[k2][1]], [qR[k2][0], yR, qR[k2][1]], roofC, 0, 1, 0, rb);
			face3([outer[k][0], top, outer[k][1]], [qR[k2][0], yR, qR[k2][1]], [qR[k][0], yR, qR[k][1]], roofC, 0, 1, 0, rb);
			face3([outer[k][0], top - 0.4, outer[k][1]], [outer[k2][0], top - 0.4, outer[k2][1]], [qR[k2][0], yR - 0.4, qR[k2][1]], roofIn, 0, -1, 0, rb);
			face3([outer[k][0], top - 0.4, outer[k][1]], [qR[k2][0], yR - 0.4, qR[k2][1]], [qR[k][0], yR - 0.4, qR[k][1]], roofIn, 0, -1, 0, rb);
			face([qR[k][0], yR - 1.6, qR[k][1]], [qR[k2][0], yR - 1.6, qR[k2][1]], [qR[k2][0], yR, qR[k2][1]], [qR[k][0], yR, qR[k][1]], white); // obrzeże otworu
		}
		if (group) {
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(rb.p, 3));
			geo.setAttribute('color', new T.Float32BufferAttribute(rb.c, 3));
			geo.computeVertexNormals();
			if (!World.stadiumRoofM) { World.stadiumRoofM = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }); World.stadiumRoofM.userData.shared = true; }
			const rm = new T.Mesh(geo, World.stadiumRoofM);
			rm.castShadow = this.shadows;
			rm.receiveShadow = true;
			group.add(rm);
		}

		// ---- oświetlenie: pas naświetlaczy na obrzeżu otworu dachu (od spodu i od środka; nocą świeci), światła nad boiskiem
		// (plama na murawie i trybunach z mapy nocnej, światła punktowe z puli) ----
		if (group) {
			const lens = { p: [], uv: [], c: [] }, lc = C3('#ffffff');
			for (let k = 0; k < n; k++) {
				const k2 = (k + 1) % n, a = qR[k], c = qR[k2];
				const t = toC((a[0] + c[0]) / 2, (a[1] + c[1]) / 2), tl = Math.hypot(t[0], t[2]) || 1, ox = (t[0] / tl) * 0.06, oz = (t[2] / tl) * 0.06;
				const ix = (t[0] / tl) * 1.2, iz = (t[2] / tl) * 1.2;
				face3([a[0], yR - 1.65, a[1]], [c[0], yR - 1.65, c[1]], [c[0] - ix, yR - 1.65, c[1] - iz], lc, 0, -1, 0, lens);
				face3([a[0], yR - 1.65, a[1]], [c[0] - ix, yR - 1.65, c[1] - iz], [a[0] - ix, yR - 1.65, a[1] - iz], lc, 0, -1, 0, lens);
				const fq = [[a[0] + ox, yR - 1.55, a[1] + oz], [c[0] + ox, yR - 1.55, c[1] + oz], [c[0] + ox, yR - 1.05, c[1] + oz], [a[0] + ox, yR - 1.05, a[1] + oz]];
				face3(fq[0], fq[1], fq[2], lc, t[0], 0, t[2], lens);
				face3(fq[0], fq[2], fq[3], lc, t[0], 0, t[2], lens);
			}
			// naświetlacze – osobna siatka z materiałem kloszy latarń (nocą jasne)
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(lens.p, 3));
			const lm = new T.Mesh(geo, World.materials().lampLens);
			group.add(lm);
			// światła: nad boiskiem siatka 4 × 3, nad trybunami co ok. 30 m po pierścieniu przejścia
			const light = (x, y, z, k, reach) => {
				const o = new T.Object3D();
				o.position.set(x, y, z);
				Object.assign(o.userData, { power: k, reach, tint: '235,242,255', drop: 0 });
				group.add(o);
				this.envLampSink.push(o);
			};
			if (this.envLampSink) {
				for (const a of [-0.75, -0.25, 0.25, 0.75]) for (const c of [-0.6, 0, 0.6]) { const q = at(a * L, c * W, yR - 2); light(q[0], q[1], q[2], 2.2, Math.max(L, W) * 0.55); }
				const qM = ringAt((fM + fM2) / 2);
				let acc2 = 15;
				for (let k = 0; k < n; k++) {
					const a = qM[k], c = qM[(k + 1) % n], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
					for (; acc2 < len; acc2 += 30) light(a[0] + ((c[0] - a[0]) * acc2) / len, yT, a[1] + ((c[1] - a[1]) * acc2) / len, 1.4, 24);
					acc2 -= len;
				}
			}
		}

		// ---- elewacja: ściana zewnętrzna (dołem przeszklona), pionowe żebra co ok. 7 m ----
		const wall = C3(WALLS[7][Math.floor(hash(seed) * WALLS[7].length)]), fin = C3('#f0f1f2');
		const yG = Math.min(base + 5, top - 3);
		let acc = 0;
		for (let k = 0; k < n; k++) {
			const a = outer[k], c = outer[(k + 1) % n], t = toC((a[0] + c[0]) / 2, (a[1] + c[1]) / 2);
			face([a[0], base, a[1]], [c[0], base, c[1]], [c[0], yG, c[1]], [a[0], yG, a[1]], glass, -t[0], 0, -t[2]);
			face([a[0], yG, a[1]], [c[0], yG, c[1]], [c[0], top, c[1]], [a[0], top, a[1]], wall, -t[0], 0, -t[2]);
			const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
			if (len < 0.1) continue;
			const ox = -t[0] / (Math.hypot(t[0], t[2]) || 1), oz = -t[2] / (Math.hypot(t[0], t[2]) || 1);
			for (let u = (7 - (acc % 7)) % 7; u < len; u += 7) {
				const x = a[0] + ((c[0] - a[0]) * u) / len, z = a[1] + ((c[1] - a[1]) * u) / len;
				face([x, yG, z], [x + ox * 0.9, yG, z + oz * 0.9], [x + ox * 0.9, top + 0.3, z + oz * 0.9], [x, top + 0.3, z], fin);
			}
			acc += len;
		}

		// ---- boisko: obrzeże, pasy murawy, linie, bramki ----
		const surround = C3('#3b7634'), gA = C3('#4c9b43'), gB = C3('#418b3a');
		const contour = inner.map(([x, z]) => new T.Vector2(x, z));
		for (const [i0, i1, i2] of T.ShapeUtils.triangulateShape(contour, [])) face3([inner[i0][0], yP, inner[i0][1]], [inner[i1][0], yP, inner[i1][1]], [inner[i2][0], yP, inner[i2][1]], surround, 0, 1, 0);
		const NS2 = 12;
		for (let i = 0; i < NS2; i++) {
			const a0 = -L - 2 + ((2 * L + 4) * i) / NS2, a1 = -L - 2 + ((2 * L + 4) * (i + 1)) / NS2;
			face(at(a0, -W - 2, yP + 0.015), at(a1, -W - 2, yP + 0.015), at(a1, W + 2, yP + 0.015), at(a0, W + 2, yP + 0.015), i % 2 ? gA : gB, 0, 1, 0);
		}
		const yL = yP + 0.03, lw = 0.07;
		const line = (a0, c0, a1, c1) => {
			const da = a1 - a0, dc = c1 - c0, l2 = Math.hypot(da, dc) || 1, na = (-dc / l2) * lw, nc = (da / l2) * lw;
			face(at(a0 + na, c0 + nc, yL), at(a1 + na, c1 + nc, yL), at(a1 - na, c1 - nc, yL), at(a0 - na, c0 - nc, yL), white, 0, 1, 0);
		};
		const m = Math.min(1, W / 34, L / 52.5);
		line(-L, -W, L, -W); line(-L, W, L, W); line(-L, -W, -L, W); line(L, -W, L, W); line(0, -W, 0, W);
		for (let i = 0; i < 36; i++) {
			const t0 = (i / 36) * Math.PI * 2, t1 = ((i + 1) / 36) * Math.PI * 2, rc = 9.15 * m;
			line(Math.cos(t0) * rc, Math.sin(t0) * rc, Math.cos(t1) * rc, Math.sin(t1) * rc);
		}
		for (const sg of [-1, 1]) {
			for (const [dep, hw2] of [[16.5 * m, 20.16 * m], [5.5 * m, 9.16 * m]]) {
				line(sg * L, -hw2, sg * (L - dep), -hw2); line(sg * L, hw2, sg * (L - dep), hw2); line(sg * (L - dep), -hw2, sg * (L - dep), hw2);
			}
			// bramka: słupki i poprzeczka (7,32 × 2,44 m)
			const gw = 3.66 * m, gh = 2.44, q = 0.06;
			for (const c of [-gw, gw]) {
				face(at(sg * L - q, c, yP), at(sg * L + q, c, yP), at(sg * L + q, c, yP + gh), at(sg * L - q, c, yP + gh), white);
				face(at(sg * L, c - q, yP), at(sg * L, c + q, yP), at(sg * L, c + q, yP + gh), at(sg * L, c - q, yP + gh), white);
			}
			face(at(sg * L, -gw, yP + gh - q), at(sg * L, gw, yP + gh - q), at(sg * L, gw, yP + gh + q), at(sg * L, -gw, yP + gh + q), white);
			face(at(sg * L - q, -gw, yP + gh), at(sg * L - q, gw, yP + gh), at(sg * L + q, gw, yP + gh), at(sg * L + q, -gw, yP + gh), white);
			// siatka (jaśniejsza szarość): tył i boki
			const net = C3('#d6d8da'), bk = sg * (L + 1.8);
			face(at(bk, -gw, yP), at(bk, gw, yP), at(bk, gw, yP + gh * 0.8), at(bk, -gw, yP + gh * 0.8), net);
			for (const c of [-gw, gw]) face(at(sg * L, c, yP), at(bk, c, yP), at(bk, c, yP + gh * 0.8), at(sg * L, c, yP + gh), net);
		}
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
		const brand = brandOf(name, use);
		if (text && S) {
			const high = !!S[4];
			let bg = S[1], fg = S[2];
			if (use === 8) bg = MARKET_C[Math.floor(hash(seed + 3.3) * MARKET_C.length)];
			if (brand) { bg = brand[0]; fg = brand[1]; }
			const sh = high ? Math.min(2.2, 0.9 + h * 0.06) : 0.85, sw = Math.min(L * 0.8, Math.max(2.6, Math.min(14, text.length * sh * 0.5 + 1.4)));
			const ys = high ? top - sh / 2 - 0.5 : Math.min(top - sh / 2 - 0.3, y0 + (use === 14 ? 4.5 : 3.4)); // remiza – nad bramami
			if (ys - sh / 2 > y0 + 1.8) {
				// tablica z atlasu szyldów (scalana na końcu budowy budynków kawałka – envSignSink)
				const cell = signCell(text, bg, fg, S[3]), nl = Math.hypot(nx, nz) || 1, ux = nx / nl, uz = nz / nl;
				const q = { c: [mx + nx * 0.09, ys, mz + nz * 0.09], r: [(uz * sw) / 2, 0, (-ux * sw) / 2], u: [0, sh / 2, 0], n: [ux, 0, uz], uv: cell.uv, pg: cell.pg };
				if (this.envSignSink) this.envSignSink.push(q);
				else group.add(quadMesh([q], cell.pg.mat));
				// skrzynka szyldu (rama)
				cuboid(mx + nx * 0.04, ys, mz + nz * 0.04, sw + 0.12, sh + 0.12, 0.08, C3('#2a2d31'));
			}
		}
		// sklep sieci w parterze (np. Żabka w bloku): pas w barwie sieci nad witryną, tylko na ścianie frontowej
		if (use === 7 && brand && top - y0 > 3.6) cuboid(mx + nx * 0.06, y0 + 3.05, mz + nz * 0.06, L - 0.6, 0.4, 0.06, C3(brand[2]));
		// pas w kolorze sieci (market) pod attyką
		if (use === 8 && h > 3.5) {
			const c = C3(brand ? brand[2] : MARKET_C[Math.floor(hash(seed + 3.3) * MARKET_C.length)]);
			for (let k = 0; k < n; k++) {
				const p = P[k], q = P[(k + 1) % n], [ex, ez] = NE[k];
				const a = [p[0] + ex * 0.03, top - 0.9, p[2] + ez * 0.03], b2 = [q[0] + ex * 0.03, top - 0.9, q[2] + ez * 0.03], c2 = [q[0] + ex * 0.03, top - 0.45, q[2] + ez * 0.03], d2 = [p[0] + ex * 0.03, top - 0.45, p[2] + ez * 0.03];
				if (ccw) { tri(pl, a, c2, b2, Z, Z, Z, c); tri(pl, a, d2, c2, Z, Z, Z, c); } else { tri(pl, a, b2, c2, Z, Z, Z, c); tri(pl, a, c2, d2, Z, Z, Z, c); }
			}
		}
		/* witryna parteru (sklep, market, restauracja, bank, apteka, poczta): przeszklenie wzdłuż ściany frontowej
		   ze szprosami co ok. 1,6 m, drzwi pośrodku (jaśniejsza rama); market – zadaszenie nad wejściem na dwóch słupach
		   z pasem w barwie sieci */
		const glassC = C3('#24313b'), frameC = C3('#5d6670'), steelC = C3('#c9ced3');
		if ((use >= 7 && use <= 12) && top - y0 > 3.3 && L > 5) {
			const gw = L - 1.2, gh = 2.4, gy = y0 + 0.4 + gh / 2;
			cuboid(mx + nx * 0.05, gy, mz + nz * 0.05, gw, gh, 0.06, glassC);
			const nm = Math.max(2, Math.round(gw / 1.6));
			for (let i = 0; i <= nm; i++) {
				const t = i / nm - 0.5;
				cuboid(mx + ux * t * gw + nx * 0.09, gy, mz + uz * t * gw + nz * 0.09, 0.08, gh + 0.08, 0.05, frameC);
			}
			for (const dy of [-gh / 2, gh / 2]) cuboid(mx + nx * 0.09, gy + dy, mz + nz * 0.09, gw + 0.08, 0.1, 0.05, frameC);
			cuboid(mx + nx * 0.1, y0 + 0.4 + 1.1, mz + nz * 0.1, 1.9, 2.2, 0.04, steelC); // drzwi (rama)
			cuboid(mx + nx * 0.12, y0 + 0.4 + 1.1, mz + nz * 0.12, 1.7, 2.05, 0.03, glassC);
			if (use === 8 && L > 10) {
				const cw = Math.min(9, L * 0.4), cd = 2.4, cy = y0 + 3.15;
				const bc = C3(brand ? brand[2] : MARKET_C[Math.floor(hash(seed + 3.3) * MARKET_C.length)]);
				cuboid(mx + nx * cd / 2, cy, mz + nz * cd / 2, cw, 0.28, cd, C3('#e8e8e6'));
				cuboid(mx + nx * (cd + 0.03), cy, mz + nz * (cd + 0.03), cw + 0.06, 0.42, 0.06, bc);
				for (const t of [-0.5, 0.5]) cuboid(mx + ux * t * (cw - 0.4) + nx * (cd - 0.25), y0 + 1.5, mz + uz * t * (cw - 0.4) + nz * (cd - 0.25), 0.16, 3.2, 0.16, steelC);
			}
		}
		// policja: granatowy pas wzdłuż ściany frontowej nad parterem (z białym paskiem)
		if (use === 13 && top - y0 > 3.6) {
			cuboid(mx + nx * 0.05, y0 + 2.95, mz + nz * 0.05, L - 0.4, 0.42, 0.05, C3('#1d3f8f'));
			cuboid(mx + nx * 0.07, y0 + 3.2, mz + nz * 0.07, L - 0.4, 0.07, 0.04, C3('#f2f2f2'));
		}
		// apteka: zielony krzyż wysunięty prostopadle do ściany przy jednym końcu (widoczny z ulicy z obu stron)
		if (use === 11 && top - y0 > 3.6 && L > 4) {
			const px = A[0] + ux * 0.9 + nx * 0.55, pz = A[2] + uz * 0.9 + nz * 0.55, py = y0 + 3.3;
			cuboid(px, py, pz, 0.12, 0.95, 0.95, C3('#f2f2f2'), nx, nz);
			cuboid(px, py, pz, 0.16, 0.7, 0.22, C3('#1e8f3e'), nx, nz);
			cuboid(px, py, pz, 0.16, 0.22, 0.7, C3('#1e8f3e'), nx, nz);
			cuboid(A[0] + ux * 0.9 + nx * 0.2, py + 0.4, A[2] + uz * 0.9 + nz * 0.2, 0.06, 0.06, 0.45, frameC);
		}
		// urząd, szkoła: schody i daszek nad wejściem na dwóch słupach
		if ((use === 20 || use === 15 || use === 17) && L > 8) {
			const ew = Math.min(6, L * 0.35);
			for (let i = 0; i < 3; i++) cuboid(mx + nx * (0.35 + (2 - i) * 0.35), y0 - 0.15 + i * 0.15, mz + nz * (0.35 + (2 - i) * 0.35), ew + 0.6 - i * 0.2, 0.15 + i * 0.15 + 0.15, 0.35, C3('#b9b4aa'));
			if (top - y0 > 3.8) {
				cuboid(mx + nx * 1.3, y0 + 3.3, mz + nz * 1.3, ew, 0.25, 2.6, C3('#e3dfd6'));
				for (const t of [-0.5, 0.5]) cuboid(mx + ux * t * (ew - 0.5) + nx * 2.3, y0 + 1.65, mz + uz * t * (ew - 0.5) + nz * 2.3, 0.3, 3.3, 0.3, C3('#ece8df'));
			}
		}
		/* stacja paliw: wiata przed budynkiem (od strony ulicy), na czterech słupach, z pasem w barwach sieci, dwie wyspy
		   z dystrybutorami, pylon z cenami przy wjeździe – gdy przed ścianą jest wolne miejsce (bez budynków, jezdni i torów) */
		if (use === 26) this.envFuelCanopy(b, k0, cuboid, C3, brand, ux, uz, nx, nz, mx, mz);

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

	// wiata stacji paliw (envBuildingDecor): środek 7 m przed ścianą frontową, w układzie trasy sprawdzane wolne miejsce
	World.prototype.envFuelCanopy = function (b, k0, cuboid, C3, brand, ux, uz, nx, nz, mx, mz) {
		const row = b.row, n = b.n, r = this.route;
		const s0 = row[3 + k0 * 2], d0 = row[4 + k0 * 2], s1 = row[3 + ((k0 + 1) % n) * 2], d1 = row[4 + ((k0 + 1) % n) * 2];
		let cs = 0, cd2 = 0;
		for (let k = 0; k < n; k++) { cs += row[3 + k * 2] / n; cd2 += row[4 + k * 2] / n; }
		const el = Math.hypot(s1 - s0, d1 - d0) || 1, es = (s1 - s0) / el, ed = (d1 - d0) / el;
		let ps = -ed, pd = es;
		const ms = (s0 + s1) / 2, md = (d0 + d1) / 2;
		if (ps * (ms - cs) + pd * (md - cd2) < 0) { ps = -ps; pd = -pd; }
		const DIST = 7, CW = 14, CD = 9;
		const sc = ms + ps * DIST, dc = md + pd * DIST;
		// wolne miejsce: środek i narożniki wiaty poza budynkami i jezdnią, daleko od torów
		const pts = [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, q]) => [sc + es * a * CW / 2 + ps * q * CD / 2, dc + ed * a * CW / 2 + pd * q * CD / 2]);
		if (pts.some(([s2, d2]) => Math.abs(d2) < 12 || this.inBuilding(s2, d2) || this.onRoad(s2, d2) || this.envTrackGap(s2, d2) < 6)) return;
		R.sidePoint(r, sc, dc, tp);
		const x = tp.x, z = tp.z, gy = this.terrainY(sc, dc);
		const H = 5.2, band = C3(brand ? brand[2] : '#1e8f3e'), white = C3('#f2f2f0'), conc = C3('#a9a59c');
		// słupy, dach z pasem (obwódka), spód jasny
		for (const [a, q] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cuboid(x + ux * a * (CW / 2 - 1.2) + nx * q * (CD / 2 - 1.2), gy + H / 2, z + uz * a * (CW / 2 - 1.2) + nz * q * (CD / 2 - 1.2), 0.4, H, 0.4, white);
		cuboid(x, gy + H + 0.35, z, CW, 0.7, CD, white);
		for (const q of [-1, 1]) cuboid(x + nx * q * (CD / 2 + 0.02), gy + H + 0.35, z + nz * q * (CD / 2 + 0.02), CW + 0.08, 0.72, 0.05, band);
		for (const a of [-1, 1]) cuboid(x + ux * a * (CW / 2 + 0.02), gy + H + 0.35, z + uz * a * (CW / 2 + 0.02), 0.05, 0.72, CD + 0.08, band);
		// wyspy z dystrybutorami
		for (const a of [-1, 1]) {
			const ix = x + ux * a * 3.2, iz = z + uz * a * 3.2;
			cuboid(ix, gy + 0.1, iz, 1.3, 0.2, 5.2, conc, nx, nz);
			for (const q of [-1, 1]) {
				const px = ix + nx * q * 1.3, pz = iz + nz * q * 1.3;
				cuboid(px, gy + 1.0, pz, 0.55, 1.6, 0.9, white, nx, nz);
				cuboid(px, gy + 1.65, pz, 0.58, 0.32, 0.93, band, nx, nz);
				cuboid(px + ux * 0.3, gy + 1.15, pz + uz * 0.3, 0.04, 0.4, 0.5, C3('#24313b'), nx, nz); // wyświetlacz
			}
		}
		// pylon z cenami przy krawędzi placu (od strony ulicy)
		const yx = x + ux * (CW / 2 + 1.5) + nx * (CD / 2 + 1.5), yz = z + uz * (CW / 2 + 1.5) + nz * (CD / 2 + 1.5);
		cuboid(yx, gy + 3.2, yz, 1.5, 6.4, 0.45, band);
		cuboid(yx + nx * 0.24, gy + 2.6, yz + nz * 0.24, 1.2, 3.6, 0.03, C3('#1b1d20'));
		for (let i = 0; i < 4; i++) cuboid(yx + nx * 0.26, gy + 1.3 + i * 0.85, yz + nz * 0.26, 0.9, 0.42, 0.02, C3(i % 2 ? '#ffd400' : '#f2f2f2'));
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
		const y = this.terrainY(s, d), D = this.envTerrainCols(Math.floor(s / C));
		if (!D || d <= D[0] || d >= D[D.length - 1]) return y;
		// jezdnia we wkopie: na swoim poziomie (siatka przy ścianie wkopu wznosi się ku ulicom obok)
		if (this.envInTrench(s, d, 0)) return y;
		let j = 1;
		while (D[j] <= d) j++;
		j--;
		const i0 = Math.floor(s / 4);
		const e = this.env, r = this.route;
		if (!e.meshY || e.meshY.size > 200000) e.meshY = new Map();
		// węzeł siatki terenu: położenie w świecie (x, z) i wysokość – jak w ribbon() (wiersze co 4 m, kolumny D)
		const node = (a, b) => {
			const key = a * 4096 + Math.round(D[b] * 4) + 2400;
			let n = e.meshY.get(key);
			if (n === undefined) {
				R.sidePoint(r, a * 4, D[b], tpS);
				n = [tpS.x, tpS.z, this.meshTerrainY(a * 4, D[b])]; // jak siatka terenu (ribbon)
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
			rZ.push(null); // (wysokość łącznika – niżej, z envLinksZ)
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
			/* wyrównanie przebiegu: drobne załamania z danych (punkty co kilka metrów, zaokrąglenia) – punkt wewnętrzny
			   z łagodnym skrętem (do 30°) przesunięty w stronę prostej między sąsiadami (dwa przebiegi); końce ciągu
			   (skrzyżowania) i wyraźne zakręty bez zmian */
			for (let it = 0; it < 2; it++) {
				const q = pts.map((p) => p.slice());
				for (let k = 1; k + 1 < pts.length; k++) {
					const a = q[k - 1], b = q[k], c = q[k + 1];
					const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
					if (l1 < 0.05 || l2 < 0.05) continue;
					const cos = ((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) / (l1 * l2);
					if (cos < 0.866) continue;
					const mx = (a[0] * l2 + c[0] * l1) / (l1 + l2), my = (a[1] * l2 + c[1] * l1) / (l1 + l2);
					pts[k] = [b[0] + (mx - b[0]) * 0.5, b[1] + (my - b[1]) * 0.5];
				}
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
			put(zByChunk, Math.floor(pc[0] / C), { ch, t, sig: !!x[2] });
		}
		// wysokość jezdni drogi źródłowej odcinka ciągu (inf – obiekt atrybutów drogi) w punkcie (s, d): rzut na jej łamaną
		const infRow = new Map(rInf.map((o, i) => [o, i]));
		const rowZAt = (inf, s0, d0) => {
			const i = infRow.get(inf), p = rows[i], z = rZ[i], D = e.dem;
			if (i === undefined || !z || !p || p.length < 2 || !D) return null;
			let best = null, bd = Infinity;
			for (let k = 0; k + 1 < p.length && k + 1 < z.length; k++) {
				const a = p[k], b = p[k + 1], ds = b[0] - a[0], dd = b[1] - a[1], L2 = ds * ds + dd * dd || 1;
				const t = Math.max(0, Math.min(1, ((s0 - a[0]) * ds + (d0 - a[1]) * dd) / L2));
				const dist = Math.hypot(s0 - a[0] - ds * t, d0 - a[1] - dd * t);
				if (dist < bd) { bd = dist; best = z[k] + (z[k + 1] - z[k]) * t; }
			}
			return best === null ? null : D.base + best / 10 - D.off;
		};
		e.streets = { chains, juncs, chByChunk, jByChunk, zByChunk, rowZAt };
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

	// generator (kroki co ciąg ulicy, skrzyżowanie, trójkąt placu) – zob. buildEnvChunk
	World.prototype.buildEnvRoads = function* (group, segs, M, dyn) {
		if (segs.c0 === undefined) return;
		const e = this.env, r = this.route, st = this.envStreets(), ci = Math.floor(segs.c0 / C);
		/* u – położenie w poprzek jezdni (odsunięcie od osi, połowa szerokości, liczba pasów; 0 – poza jezdnią z pasami):
		   shader dróg rysuje z niego koleiny i brud przy krawędziach (common.js ROAD_GLSL) */
		const dst = { p: [], c: [], u: [] }, mk = { p: [], c: [] };
		const manholes = [], drains = [];
		const ZL = [0, 0, 0];
		// nad tunelem ulice biegną po terenie także nad osią toru i nad stacją podziemną
		/* droga przez przejazd (rysowana przez przejazd – envCrossingPath): punkt na jej osi (do połowy szerokości + 1,5 m);
		   dawniej każda droga do 12 m od przejazdu i 40 m od osi – znikały też ulice biegnące wzdłuż toru (szczeliny po
		   ok. 25 m po obu stronach skrzyżowania przy przejeździe) */
		const crPaths = this.route.crossings.map((x) => { if (!e.crPath) e.crPath = new Map(); if (!e.crPath.has(x)) e.crPath.set(x, this.envCrossingPath(x)); return [x, e.crPath.get(x)]; });
		const onCrossing = (s, d) => crPaths.some(([x, cp]) => {
			if (Math.abs(s - x.pos) > 45 || Math.abs(d) > 40) return false;
			if (!cp) return Math.abs(s - x.pos) < 12 && Math.abs(d) < 12;
			const P = cp.pts, hw = cp.w / 2 + (cp.sw ? 2.6 : 1.5); // z chodnikami (rysuje je przejazd)
			for (let k = 0; k + 1 < P.length; k++) {
				const [sa, da] = P[k], [sb, db] = P[k + 1], ux = sb - sa, uy = db - da, L2 = ux * ux + uy * uy || 1e-9;
				const t = Math.max(0, Math.min(1, ((s - sa) * ux + (d - da) * uy) / L2));
				if (Math.hypot(sa + ux * t - s, da + uy * t - d) < hw) return true;
			}
			return false;
		});
		const skip = (s, d) => (this.envTunnelK(s) > 0.5 ? this.inDeckExt(s, d) : (Math.abs(d) < 7.5 && !this.underBridge(s, d)) || this.envStationZone(s, d) || onCrossing(s, d) || this.inDeckExt(s, d));
		const white = col.set('#e9e7e0').clone(), side = col.set('#a7a49d').clone(), curb = col.set('#c9c6be').clone();
		// wysokość nawierzchni z pamięcią (te same punkty liczone wielokrotnie przez podział trójkątów)
		const SY = new Map();
		const sY = (s, d) => {
			const key = Math.round(s * 50) * 1e6 + Math.round(d * 50);
			let y = SY.get(key);
			if (y === undefined) { y = this.surfY(s, d); SY.set(key, y); }
			return y;
		};
		const W = (p, dy) => { R.sidePoint(r, p[0], p[1], tp); return [tp.x, (p.length > 2 ? p[2] : sY(p[0], p[1])) + dy, tp.z]; };
		/* skrzyżowanie dwóch poziomów (roadBridged): punkt jezdni na wysokości jej drogi z pomiaru (wyższa – pomost nad
		   niższą); poza nim – nawierzchnia jak zwykle */
		const lvl = (p, inf) => {
			if (!inf || !this.roadBridged(p[0], p[1])) return p;
			const z = st.rowZAt(inf, p[0], p[1]);
			if (z === null) return p;
			const q = [p[0], p[1], z];
			q.L = p.L;
			return q;
		};
		const deck = dst, deckC = col.set('#9a968d').clone(); // boki pomostu – w siatce jezdni (kolor wierzchołków)
		// trójkąt zwrócony w górę
		const tri = (d0, a, b, c, rgb, L) => {
			const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0;
			if (up) d0.p.push(...a, ...b, ...c);
			else d0.p.push(...a, ...c, ...b);
			for (let q = 0; q < 3; q++) d0.c.push(rgb.r, rgb.g, rgb.b);
			if (d0.u) for (const q of up ? [0, 1, 2] : [0, 2, 1]) d0.u.push(...((L && L[q]) || ZL));
		};
		const midL = (a, b) => (a.L && b.L ? [(a.L[0] + b.L[0]) / 2, (a.L[1] + b.L[1]) / 2, a.L[2]] : undefined);
		/* trójkąt w (s, d) dzielony na cztery, dopóki teren w połowie boków odbiega od płaszczyzny trójkąta
		   (siatka terenu ma załamania co kilka–kilkadziesiąt metrów; duży trójkąt jezdni zapadał się pod nie) */
		const triS = (d0, A, B, Cq, dy, rgb, lvl = 0) => {
			if (lvl < 3) {
				const ab = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], bc = [(B[0] + Cq[0]) / 2, (B[1] + Cq[1]) / 2], ca = [(Cq[0] + A[0]) / 2, (Cq[1] + A[1]) / 2];
				ab.L = midL(A, B); bc.L = midL(B, Cq); ca.L = midL(Cq, A);
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
			tri(d0, W(A, dy), W(B, dy), W(Cq, dy), rgb, [A.L, B.L, Cq.L]);
		};
		const quad = (d0, A, B, Cq, D, dy, rgb) => {
			if (skip((A[0] + Cq[0]) / 2, (A[1] + Cq[1]) / 2)) return;
			triS(d0, A, B, Cq, dy, rgb);
			triS(d0, A, Cq, D, dy, rgb);
		};
		// pas wzdłuż odcinka k ciągu między odsunięciami (sa·w/2 + ea) i (sb·w/2 + eb), w zakresie [ta, tb], kawałki do 4 m
		const band = (d0, ch, k, ta, tb, sa, ea, sb, eb, dy, rgb, lanes = 0) => {
			ta = Math.max(ta, ch.cum[k]);
			tb = Math.min(tb, ch.cum[k + 1]);
			if (tb - ta < 0.02) return;
			const n = Math.max(1, Math.ceil((tb - ta) / 4));
			// kawałek dzielony, dopóki teren między jego końcami nie jest prawie płaski (załamania, strome zjazdy)
			const inf = ch.seg[k] && ch.seg[k].inf;
			const piece = (t0, t1, lv) => {
				if (lv < 3 && t1 - t0 > 0.6) {
					const y0 = sY(...chPtK(ch, k, t0, (sa + sb) / 2, (ea + eb) / 2)), y1 = sY(...chPtK(ch, k, t1, (sa + sb) / 2, (ea + eb) / 2)), tm = (t0 + t1) / 2;
					if (Math.abs(sY(...chPtK(ch, k, tm, (sa + sb) / 2, (ea + eb) / 2)) - (y0 + y1) / 2) > 0.04) { piece(t0, tm, lv + 1); piece(tm, t1, lv + 1); return; }
				}
				// położenie w poprzek jezdni (tylko jezdnia z pasami ruchu – lanes > 0)
				const lat = (p, sg, t) => { if (lanes) { const L = ch.cum[k + 1] - ch.cum[k], f2 = L > 1e-9 ? Math.max(0, Math.min(1, (t - ch.cum[k]) / L)) : 0, w2 = ch.w[k] + (ch.w[k + 1] - ch.w[k]) * f2; p.L = [(sg * w2) / 2, w2 / 2, lanes]; } return p; };
				const A = lvl(lat(chPtK(ch, k, t0, sa, ea), sa, t0), inf), B = lvl(lat(chPtK(ch, k, t0, sb, eb), sb, t0), inf), Cq = lvl(lat(chPtK(ch, k, t1, sb, eb), sb, t1), inf), D = lvl(lat(chPtK(ch, k, t1, sa, ea), sa, t1), inf);
				if (A.length > 2 || B.length > 2 || Cq.length > 2 || D.length > 2) {
					if (skip((A[0] + Cq[0]) / 2, (A[1] + Cq[1]) / 2)) return;
					const Q = [A, B, Cq, D].map((p) => W(p, dy));
					tri(d0, Q[0], Q[1], Q[2], rgb, [A.L, B.L, Cq.L]);
					tri(d0, Q[0], Q[2], Q[3], rgb, [A.L, Cq.L, D.L]);
					// pomost wyższej jezdni nad terenem: boki (gzyms) 0,9 m wzdłuż krawędzi jezdni
					if (d0 === dst && sa === -1 && sb === 1) for (const [p, q] of [[A, D], [B, Cq]]) {
						const wp = W(p, dy), wq = W(q, dy);
						if (wp[1] - sY(p[0], p[1]) < 1.5 && wq[1] - sY(q[0], q[1]) < 1.5) continue;
						const bp = [wp[0], wp[1] - 0.9, wp[2]], bq = [wq[0], wq[1] - 0.9, wq[2]];
						for (const [x, y, z] of [[wp, wq, bq], [wp, bq, bp], [wp, bq, wq], [wp, bp, bq]]) { deck.p.push(...x, ...y, ...z); for (let j = 0; j < 3; j++) { deck.c.push(deckC.r, deckC.g, deckC.b); if (deck.u) deck.u.push(...ZL); } }
					}
					return;
				}
				quad(d0, A, B, Cq, D, dy, rgb);
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
				for (const [x, y, z] of [[a0, b0, b1], [a0, b1, a1], [a0, b1, b0], [a0, a1, b1]]) { d0.p.push(...x, ...y, ...z); for (let k = 0; k < 3; k++) { d0.c.push(curb.r, curb.g, curb.b); if (d0.u) d0.u.push(...ZL); } }
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
		// element płaski na jezdni (studzienka, kratka): punkt ciągu w t, kierunek wzdłuż ciągu
		const furn = (list, ch, k, t, sd, ex, dy) => {
			const p = chPtK(ch, k, t, sd, ex), q = chPtK(ch, k, t + 1, sd, ex);
			if (skip(p[0], p[1]) || this.roadBridged(p[0], p[1])) return;
			const a = W(p, dy), b = W(q, dy);
			list.push([a[0], a[1], a[2], Math.atan2(b[0] - a[0], b[2] - a[2])]);
		};

		/* słupek znaku albo sygnalizatora przy ciągu: w t, po stronie sg (na chodniku 1,1 m za krawężnikiem, bez chodnika
		   0,55 m od krawędzi jezdni), przodem do jadących w kierunku dir (+1 – rosnące t) */
		const signs = [], heads = [];
		const post = (ch, t, sg, dir) => {
			t = Math.max(0.3, Math.min(ch.L - 0.3, t));
			const k = chSeg(ch, t), onSw = sg > 0 ? ch.sw[k][0] : ch.sw[k][1], ex = sg * (onSw ? 1.1 : 0.55);
			const p = chPtK(ch, k, t, sg, ex);
			if (skip(p[0], p[1]) || this.roadBridged(p[0], p[1]) || this.inBuilding(p[0], p[1])) return null;
			const ta = Math.max(0, t - 0.5 * dir), tb = Math.min(ch.L, Math.max(0, t + 0.5 * dir));
			const a = W(chPtK(ch, chSeg(ch, ta), ta, sg, ex), 0), b = W(chPtK(ch, chSeg(ch, tb), tb, sg, ex), 0), o = W(p, onSw ? 0.17 : 0);
			// a → b już w kierunku jazdy (ta, tb według dir) – bez ponownego mnożenia przez dir (dla dir = −1 sygnalizator
			// i znak były obrócone tyłem do jadących)
			const fx = b[0] - a[0], fz = b[2] - a[2];
			if (Math.hypot(fx, fz) < 0.2) return null;
			return { x: o[0], y: o[1], z: o[2], ang: Math.atan2(-fx, -fz) };
		};

		// ciągi ulic: jezdnia, chodniki z krawężnikiem, oznakowanie (od końców przyciętych na skrzyżowaniach)
		for (const { ch, k } of st.chByChunk.get(ci) || []) {
			const f = ch.seg[k].inf, ti = f.ti, dy = roadDy(ti), T0 = ch.trim[0], T1 = ch.trim[1];
			const t0 = T0.t, t1 = ch.L - T1.t;
			// asfalt z pasami ruchu: koleiny i brud przy krawędziach w shaderze (położenie w poprzek – lanes)
			const lanesK = f.surf === 0 && ti <= 7 && Math.min(ch.w[k], ch.w[k + 1]) >= 4.5 ? Math.max(1, f.lanes || (f.one ? 1 : 2)) : 0;
			band(dst, ch, k, t0, t1, -1, 0, 1, 0, dy, col.set(SURF_C[f.surf] || ROAD_C[ti] || '#46494c').clone(), lanesK);
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
			// studzienki w osi pasa co ok. 40 m, kratki ściekowe przy krawężnikach co ok. 25 m
			if (lanesK) {
				const L = lanesK;
				const a = Math.max(t0, ch.cum[k]), b = Math.min(t1, ch.cum[k + 1]);
				for (let x = Math.ceil((a - 13) / 40) * 40 + 13; x < b; x += 40) furn(manholes, ch, k, x, L > 1 ? -1 + 1 / L : 0, 0, dy + 0.014);
				for (let x = Math.ceil((a - 6) / 25) * 25 + 6; x < b; x += 25) for (const [on, sg] of [[swP, 1], [swN, -1]]) if (on) furn(drains, ch, k, x, sg, -sg * 0.28, dy + 0.014);
			}
			yield;
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
			const lights = junctionLights(J);
			for (const A of J.arms) {
				const f = A.inf;
				if (!(lights ? A.inc : A.minor) || f.surf || f.ti > 6 || A.h * 2 < 5) continue;
				const ch = A.ch, h = A.h, top = f.one ? h : 0, t = A.t + 0.5;
				const ta = A.end ? ch.L - t - 0.3 : t, k = chSeg(ch, ta + 0.15);
				// z sygnalizacją – linia zatrzymania ciągła (P-14) na pasach wlotu
				if (lights) {
					if (A.end) band(mk, ch, k, ta, ta + 0.5, 0, -(top - 0.2), 0, -(top - h + 0.25), roadDy(f.ti) + 0.02, white);
					else band(mk, ch, k, ta, ta + 0.5, 0, top - h + 0.25, 0, top - 0.2, roadDy(f.ti) + 0.02, white);
					continue;
				}
				for (let o = 0.2; o < top + h - 0.3; o += 0.9) {
					// pas dojazdowy – strona ujemna wlotu (prawa strona jadącego do skrzyżowania)
					const e1 = top - o - 0.5, e2 = top - o;
					if (A.end) band(mk, ch, k, ta, ta + 0.3, 0, -e2, 0, -e1, roadDy(f.ti) + 0.02, white);
					else band(mk, ch, k, ta, ta + 0.3, 0, e1, 0, e2, roadDy(f.ti) + 0.02, white);
				}
			}
			/* znaki i sygnalizatory na wlotach (prawe pobocze jadącego do skrzyżowania): z sygnalizacją – sygnalizator przy
			   linii zatrzymania; bez – A-7 na wlotach podporządkowanych, D-1 przed skrzyżowaniem na części wlotów drogi
			   z pierwszeństwem */
			const minorN = J.arms.filter((A) => A.minor).length, grp = lights ? junctionGroups(J.arms) : null, off = hash(J.s * 0.031 + J.d * 0.7) * 60;
			J.arms.forEach((A, ai) => {
				if (!A.inc || A.inf.ti > 6 || A.h * 2 < 4.5) return;
				const ch = A.ch, dir = A.end ? 1 : -1, rs = A.end ? 1 : -1, tt = (x) => (A.end ? ch.L - A.t - x : A.t + x);
				let p;
				if (lights) { if ((p = post(ch, tt(1.4), rs, dir))) heads.push(Object.assign(p, { grp: grp[ai], off })); }
				else if (A.minor && !A.inf.surf) { if ((p = post(ch, tt(1.0), rs, dir))) signs.push(Object.assign(p, { kind: 'A7' })); }
				else if (minorN && A.inf.ti <= 5 && ch.L - A.t > 25 && hash(J.s * 0.7 + ai * 3.1) < 0.6) { if ((p = post(ch, tt(14), rs, dir))) signs.push(Object.assign(p, { kind: 'D1' })); }
			});
			yield;
		}
		// przejścia dla pieszych (zebry): pasy 0,5 m co 1 m w poprzek jezdni, 4 m wzdłuż (po łuku ciągu)
		for (const { ch, t, sig } of st.zByChunk.get(ci) || []) {
			const k0 = chSeg(ch, t), w = ch.w[k0], dy = roadDy(ch.seg[k0].inf.ti) + 0.022;
			for (let k = chSeg(ch, t - 2); k <= chSeg(ch, t + 2); k++)
				for (let o = -w / 2 + 0.5; o <= w / 2 - 0.4; o += 1.0) band(mk, ch, k, t - 2, t + 2, 0, o - 0.25, 0, o + 0.25, dy, white);
			// D-6 tuż przed przejściem po prawej stronie obu kierunków (jadący w stronę +t – strona dodatnia); z sygnalizacją
			// z mapy – sygnalizator przed znakiem (grupa 2 – przejście)
			const one = ch.seg[k0].inf.one;
			for (const [sg, dir] of one ? [[1, 1], [-1, 1]] : [[1, 1], [-1, -1]]) {
				let p;
				if ((p = post(ch, t - dir * 2.6, sg, dir))) signs.push(Object.assign(p, { kind: 'D6' }));
				if (sig && (p = post(ch, t - dir * 3.6, sg, dir))) heads.push(Object.assign(p, { grp: 2, off: hash(ch.L * 0.37 + t * 0.11) * 60 }));
			}
		}
		/* przystanki autobusowe (env.bs, przypisane do ciągów – envBusStops): znak D-15 przodem do nadjeżdżających i wiata
		   (dach, tylna szyba, słupki, ławka) na chodniku albo poboczu za nim */
		for (const B of this.envBusStops()) {
			if (Math.floor(B.s / C) !== ci) continue;
			const ch = B.ch, k = chSeg(ch, B.t), onSw = B.side > 0 ? ch.sw[k][0] : ch.sw[k][1];
			let p;
			if ((p = post(ch, B.t + B.dir * 4.5, B.side, B.dir))) signs.push(Object.assign(p, { kind: 'D15' }));
			const ex = B.side * (onSw ? 2.6 : 2.2), a = chPtK(ch, k, B.t, B.side, ex), b = chPt(ch, B.t + 1, B.side, ex);
			if (skip(a[0], a[1]) || this.inBuilding(a[0], a[1])) continue;
			const A = W(a, 0), Bw = W(b, 0), g = new T.Group();
			g.position.set(A[0], A[1] + (onSw ? 0.17 : 0), A[2]);
			// oś wiaty wzdłuż ulicy, tył (szyba) od strony chodnika dalej od jezdni
			g.rotation.y = Math.atan2(Bw[0] - A[0], Bw[2] - A[2]);
			// strona „od jezdni” w układzie wiaty (lokalne +x w świecie: cos θ, −sin θ)
			const F = W(chPtK(ch, k, B.t, B.side, ex + B.side), 0), th = g.rotation.y;
			const back = (F[0] - A[0]) * Math.cos(th) - (F[2] - A[2]) * Math.sin(th) > 0 ? 1 : -1;
			const steel = mat('#5c6168'), glass = World.materials().glass;
			g.add(box(1.7, 0.08, 3.4, mat('#8d9096'), 0, 2.45, 0));
			g.add(box(0.04, 2.1, 3.2, glass, back * 0.75, 1.25, 0));
			for (const z of [-1.6, 1.6]) for (const x of [-0.75, 0.75]) g.add(box(0.07, 2.45, 0.07, steel, x, 1.22, z));
			g.add(box(0.4, 0.06, 1.8, mat('#6b4a2e'), back * 0.45, 0.45, 0));
			group.add(g);
		}
		this.streetFurnFlush(group, signs, heads, dyn);
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
			/* jezdnie przez plac / parking (skrzyżowanie w obrysie placu): nawierzchnia placu pod nimi pominięta – obie
			   warstwy leżały 2–3 cm od siebie i na łukach terenu migotały (jezdnia w łatach szarego placu) */
			let bs0 = Infinity, bs1 = -Infinity, bd0 = Infinity, bd1 = -Infinity;
			for (const p of pts) { bs0 = Math.min(bs0, p[0]); bs1 = Math.max(bs1, p[0]); bd0 = Math.min(bd0, p[1]); bd1 = Math.max(bd1, p[1]); }
			const segs = [];
			for (let cc = Math.floor((bs0 - 40) / C); cc <= Math.floor((bs1 + 40) / C); cc++) for (const { k, row: rr, i } of e.rByChunk.get(cc) || []) {
				const sa = rr[1 + k * 2], da = rr[2 + k * 2], sb = rr[3 + k * 2], db = rr[4 + k * 2], hw = (e.rInfo[i].w || 5) / 2;
				if (Math.max(sa, sb) < bs0 - hw || Math.min(sa, sb) > bs1 + hw || Math.max(da, db) < bd0 - hw || Math.min(da, db) > bd1 + hw) continue;
				segs.push([sa, da, sb, db, hw - 0.15]);
			}
			// wiadukty drogowe z mapy (zjazd nisko nad placem) – też bez nawierzchni placu pod pomostem
			for (let cc = Math.floor((bs0 - 40) / C); cc <= Math.floor((bs1 + 40) / C); cc++) for (const rr of e.oByChunk.get(cc) || []) {
				const hw = ((ROAD_W[rr[0]] || 6) + 1.2) / 2;
				for (let k = 1; k + 3 < rr.length; k += 2) {
					const sa = rr[k], da = rr[k + 1], sb = rr[k + 2], db = rr[k + 3];
					if (Math.max(sa, sb) < bs0 - hw || Math.min(sa, sb) > bs1 + hw || Math.max(da, db) < bd0 - hw || Math.min(da, db) > bd1 + hw) continue;
					segs.push([sa, da, sb, db, hw - 0.15]);
				}
			}
			const onRd = (p, near) => {
				for (const [sa, da, sb, db, hw] of near) {
					const L2 = (sb - sa) ** 2 + (db - da) ** 2 || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - sa) * (sb - sa) + (p[1] - da) * (db - da)) / L2));
					if (Math.hypot(sa + (sb - sa) * t - p[0], da + (db - da) * t - p[1]) < hw) return true;
				}
				return false;
			};
			// nawierzchnia: trójkąty dzielone po najdłuższym boku do 4 m (przy krawędzi jezdni – do 0,8 m)
			/* near – odcinki jezdni, które mogą sięgać trójkąta (prostokąt odcinka powiększony o hw zachodzi na prostokąt
			   trójkąta); dzieci dostają listę rodzica przefiltrowaną dalej – dawniej każdy test po wszystkich odcinkach
			   przy placu (duży plac przecięty ulicami: dziesiątki ms) */
			const split = (a, b, c, lvl, near = segs) => {
				const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]), L = Math.max(ab, bc, ca);
				if (near.length) {
					const s0 = Math.min(a[0], b[0], c[0]), s1 = Math.max(a[0], b[0], c[0]), d0 = Math.min(a[1], b[1], c[1]), d1 = Math.max(a[1], b[1], c[1]);
					near = near.filter(([sa, da, sb, db, hw]) => Math.max(sa, sb) + hw >= s0 && Math.min(sa, sb) - hw <= s1 && Math.max(da, db) + hw >= d0 && Math.min(da, db) - hw <= d1);
				}
				let fine = L <= 4 || lvl > 9;
				if (fine && segs.length) {
					const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3], on = [a, b, c, m].filter((p) => onRd(p, near)).length;
					if (on === 4) return; // pod jezdnią
					if (on > 0 && L > 0.8 && lvl < 16) fine = false;
					else if (on > 0 && onRd(m, near)) return;
				}
				if (fine) {
					if (!skip((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3)) tri(dst, W(a, dyP), W(b, dyP), W(c, dyP), rgb);
					return;
				}
				const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
				if (L === ab) { const x = m(a, b); split(a, x, c, lvl + 1, near); split(x, b, c, lvl + 1, near); }
				else if (L === bc) { const x = m(b, c); split(a, b, x, lvl + 1, near); split(a, x, c, lvl + 1, near); }
				else { const x = m(c, a); split(a, b, x, lvl + 1, near); split(x, b, c, lvl + 1, near); }
			};
			for (const [a1, b1, c1] of T.ShapeUtils.triangulateShape(pts.map((p) => new T.Vector2(p[0], p[1])), [])) {
				split(pts[a1], pts[b1], pts[c1], 0);
				yield;
			}
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
			yield;
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
			// lakier – kolor egzemplarza; szyby i reszta (opony, światła, tablice) – własne kolory
			const F = NS.props.carFixedMats();
			for (const [k, list] of byKind) {
				const G = NS.props.carGeo(k);
				for (const [geo, mt, paintIt] of [[G.paint, parkCarMat(), true], [G.glass, F.glass, false], [G.trim, F.trim, false]]) {
					const im = new T.InstancedMesh(geo, mt, list.length);
					list.forEach((x, i) => {
						const a = W(x.c, 0.075), b = W([x.c[0] + x.dir[0], x.c[1] + x.dir[1]], 0.075);
						q.setFromAxisAngle(up, Math.atan2(b[0] - a[0], b[2] - a[2]));
						im.setMatrixAt(i, m4.compose(p3.set(a[0], a[1], a[2]), q, one));
						if (paintIt) im.setColorAt(i, col.set(x.color));
					});
					im.castShadow = this.shadows && paintIt;
					im.receiveShadow = true;
					group.add(im);
				}
			}
		}
		for (const d0 of [dst, mk]) {
			if (!d0.p.length) continue;
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(d0.p, 3));
			geo.setAttribute('color', new T.Float32BufferAttribute(d0.c, 3));
			if (d0.u && d0.u.length === d0.p.length) geo.setAttribute('aLat', new T.Float32BufferAttribute(d0.u, 3));
			geo.computeVertexNormals();
			// nawierzchnie oświetlone jak płaszczyzna (bez smug z drobnych pochyleń trójkątów), ściany krawężników bez zmian
			const nm = geo.attributes.normal.array;
			for (let q = 0; q < nm.length; q += 3) if (Math.abs(nm[q + 1]) > 0.5) { nm[q] = 0; nm[q + 1] = Math.sign(nm[q + 1]); nm[q + 2] = 0; }
			const m = new T.Mesh(geo, d0 === mk ? M.roadMark : M.road);
			m.receiveShadow = true;
			group.add(m);
		}
		this.roadWearFlush(group, manholes, drains);
	};

	/* Znaki pionowe i sygnalizacja uliczna. Sygnalizacja na skrzyżowaniach ważniejszych dróg (co najmniej dwa wloty
	   drogi wojewódzkiej lub ważniejszej i trzy powiatowej lub ważniejszej, asfalt) – w danych nie ma sygnalizacji
	   skrzyżowań, więc wg klas dróg, na części (stale dla skrzyżowania); na przejściach dla pieszych – z mapy. */
	const junctionLights = (J) => J.surf === 0 && J.arms.length >= 3 && J.arms.filter((A) => A.inf.ti <= 3).length >= 2 && J.arms.filter((A) => A.inf.ti <= 4).length >= 3 && hash(J.s * 0.013 + J.d * 0.17) < 0.75;
	// fazy: wloty naprzeciw siebie razem (najpierw para drogi głównej – grupa 0), pozostałe – grupa 1
	const junctionGroups = (arms) => {
		const g = arms.map(() => -1), order = arms.map((_, i) => i).sort((a, b) => arms[a].inf.ti - arms[b].inf.ti);
		let next = 0;
		for (const i of order) {
			if (g[i] >= 0) continue;
			g[i] = next;
			let best = -1, bd = 0.7;
			arms.forEach((B, j) => {
				if (g[j] >= 0) return;
				const df = Math.abs(Math.abs(B.ang - arms[i].ang) - Math.PI);
				if (df < bd) { bd = df; best = j; }
			});
			if (best >= 0) g[best] = next;
			next = 1;
		}
		return g;
	};
	/* stan sygnalizatora w cyklu 60 s: 0 zielone, 1 żółte, 2 czerwone, 3 czerwone z żółtym (przed zielonym); grupa 0 i 1 –
	   kierunki skrzyżowania na zmianę, 2 – przejście dla pieszych (dla jadących dłużej zielone) */
	const tlState = (grp, t) => {
		if (grp === 0) return t < 24 ? 0 : t < 27 ? 1 : t < 58.5 ? 2 : 3;
		if (grp === 1) return t < 28.5 ? 2 : t < 30 ? 3 : t < 54 ? 0 : t < 57 ? 1 : 2;
		return t < 42 ? 0 : t < 45 ? 1 : t < 58.5 ? 2 : 3;
	};
	const TL_LIT = [4, 2, 1, 3]; // komory: 1 czerwona (góra), 2 żółta, 4 zielona
	const TL_ON = [new T.Color(4, 0.32, 0.22), new T.Color(4, 2.3, 0.2), new T.Color(0.25, 4, 1.5)];
	const TL_OFF = [new T.Color(0.11, 0.025, 0.02), new T.Color(0.11, 0.08, 0.015), new T.Color(0.02, 0.09, 0.05)];

	// tarcze znaków (A-7 ustąp pierwszeństwa, D-1 droga z pierwszeństwem, D-6 przejście dla pieszych); back – szary tył
	const streetSign = (kind, back) => canvasTexture(`street-sign|${kind}|${back ? 1 : 0}`, 128, 128, (g, w) => {
		g.clearRect(0, 0, w, w);
		const poly = (pts, c) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = c; g.fill(); };
		const GR = '#7d8287';
		if (kind === 'A7') {
			poly([[4, 12], [124, 12], [64, 118]], back ? GR : '#c62828');
			if (!back) poly([[24, 23], [104, 23], [64, 96]], '#f4f4f2');
		} else if (kind === 'D15') {
			// D-15 przystanek autobusowy: niebieska tarcza, białe pole z autobusem
			g.fillStyle = back ? GR : '#1f5fbf';
			g.fillRect(6, 6, 116, 116);
			if (!back) {
				g.fillStyle = '#f4f4f2';
				g.fillRect(20, 20, 88, 88);
				g.fillStyle = '#1b2a4a';
				g.fillRect(30, 40, 68, 40); // nadwozie
				g.fillStyle = '#f4f4f2';
				for (let x = 35; x < 92; x += 15) g.fillRect(x, 45, 10, 14); // okna
				g.fillStyle = '#1b2a4a';
				for (const x of [42, 86]) { g.beginPath(); g.arc(x, 82, 7, 0, Math.PI * 2); g.fill(); }
			}
		} else if (kind === 'D1') {
			poly([[64, 2], [126, 64], [64, 126], [2, 64]], back ? GR : '#f4f4f2');
			if (!back) { poly([[64, 12], [116, 64], [64, 116], [12, 64]], '#222'); poly([[64, 18], [110, 64], [64, 110], [18, 64]], '#f2c12e'); }
		} else {
			g.fillStyle = back ? GR : '#1f5fbf';
			g.beginPath();
			if (g.roundRect) g.roundRect(4, 4, 120, 120, 10); else g.rect(4, 4, 120, 120);
			g.fill();
			if (!back) {
				poly([[64, 14], [116, 108], [12, 108]], '#f4f4f2');
				g.fillStyle = '#111';
				for (let x = 30; x < 100; x += 14) g.fillRect(x, 96, 8, 7); // pasy przejścia
				// pieszy: głowa, tułów, nogi w kroku, ręce
				g.beginPath(); g.arc(66, 46, 6, 0, Math.PI * 2); g.fill();
				g.lineCap = 'round'; g.strokeStyle = '#111'; g.lineWidth = 7;
				g.beginPath(); g.moveTo(64, 55); g.lineTo(61, 74); g.moveTo(61, 74); g.lineTo(52, 90); g.moveTo(61, 74); g.lineTo(72, 90); g.stroke();
				g.lineWidth = 5;
				g.beginPath(); g.moveTo(63, 60); g.lineTo(52, 70); g.moveTo(63, 60); g.lineTo(74, 68); g.stroke();
			}
		}
	});
	const SIGN_SZ = { A7: 0.9, D1: 0.7, D6: 0.75, D15: 0.6, B18_15: 0.75, B18_20: 0.75, B18_30: 0.75 };
	/* Atlas znaków (512 × 512, komórki 128 px): lica i tyły wszystkich rodzajów w jednej teksturze – tarcze kawałka
	   świata rysowane jedną siatką (dawniej lico i tył osobno dla każdego rodzaju – ok. 70 wywołań rysowania na kadr) */
	const SIGN_CELLS = ['A7', 'D1', 'D6', 'B18_15', 'B18_20', 'B18_30', 'A7|b', 'D1|b', 'D6|b', 'round|b', 'D15', 'D15|b'];
	const signAtlas = () => {
		if (World.signAtlas) return World.signAtlas;
		const cv = document.createElement('canvas');
		cv.width = cv.height = 512;
		const g = cv.getContext('2d'), uv = {};
		SIGN_CELLS.forEach((key, i) => {
			const [kind, back] = key.split('|'), x = (i % 4) * 128, y = Math.floor(i / 4) * 128;
			const src = kind === 'round' ? signBack() : kind.startsWith('B18_') ? signB18(+kind.slice(4)) : streetSign(kind, !!back);
			g.drawImage(src.image, x, y, 128, 128);
			// flipY: v od dołu tekstury
			uv[key] = [(x + 1) / 512, 1 - (y + 127) / 512, (x + 127) / 512, 1 - (y + 1) / 512];
		});
		const tex = new T.CanvasTexture(cv);
		tex.colorSpace = T.SRGBColorSpace;
		tex.anisotropy = 16;
		const m = patch(new T.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.5, side: T.FrontSide }), 'lit');
		m.userData.shared = true;
		World.signAtlas = { mat: m, uv };
		return World.signAtlas;
	};
	/* płaskie czworokąty w jednej siatce: q – { c: środek [x, y, z], r: wektor „w prawo” (połowa szerokości), u: wektor
	   „w górę” (połowa wysokości), n: normalna, uv: [u0, v0, u1, v1] } */
	const quadMesh = (qs, material) => {
		const pos = new Float32Array(qs.length * 12), nor = new Float32Array(qs.length * 12), uvs = new Float32Array(qs.length * 8), idx = [];
		qs.forEach((q, k) => {
			const [cx, cy, cz] = q.c, r = q.r, u = q.u, n = q.n, [u0, v0, u1, v1] = q.uv;
			const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
			P.forEach(([a, b], j) => {
				pos.set([cx + r[0] * a + u[0] * b, cy + r[1] * a + u[1] * b, cz + r[2] * a + u[2] * b], k * 12 + j * 3);
				nor.set(n, k * 12 + j * 3);
				uvs.set([a < 0 ? u0 : u1, b < 0 ? v0 : v1], k * 8 + j * 2);
			});
			const o = k * 4;
			idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
		});
		const geo = new T.BufferGeometry();
		geo.setAttribute('position', new T.BufferAttribute(pos, 3));
		geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
		geo.setAttribute('uv', new T.BufferAttribute(uvs, 2));
		geo.setIndex(idx);
		return new T.Mesh(geo, material);
	};
	// sygnalizator: słup 3,6 m, komora z tarczą tła i daszkami; soczewki osobno (kolor egzemplarza zmieniany w cyklu)
	const tlGeo = () => {
		if (World.tlGeo) return World.tlGeo;
		const POLE = [0.42, 0.45, 0.48], BODY = [0.08, 0.09, 0.1], PLATE = [0.05, 0.05, 0.05];
		const parts = [
			{ geo: new T.CylinderGeometry(0.06, 0.07, 3.6, 8).translate(0, 1.8, 0), color: POLE },
			{ geo: new T.BoxGeometry(0.34, 1.0, 0.24).translate(0, 3.0, 0.17), color: BODY },
			{ geo: new T.BoxGeometry(0.58, 1.22, 0.02).translate(0, 3.0, 0.05), color: PLATE },
		];
		for (const y of [3.32, 3.0, 2.68]) parts.push({ geo: new T.BoxGeometry(0.28, 0.02, 0.16).translate(0, y + 0.135, 0.36), color: BODY });
		World.tlGeo = NS.props.merge(parts);
		return World.tlGeo;
	};
	World.prototype.streetFurnFlush = function (group, signs, heads, dyn) {
		const M = envMaterials(), shared = (mm) => { mm.userData.shared = true; return mm; };
		const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p3 = new T.Vector3(), sc = new T.Vector3(), one = new T.Vector3(1, 1, 1);
		if (signs.length) {
			// tarcze (lica i tyły) – jedna siatka z atlasu; słupki – instancje
			const A = signAtlas(), qs = [];
			const pole = new T.InstancedMesh(GEO.cyl, M.catSteel, signs.length);
			signs.forEach((sg, k) => {
				const sz = SIGN_SZ[sg.kind] || 0.75, hy = sg.kind.startsWith('B18_') ? 2.2 : 2.0 + sz / 2, h = sz / 2;
				const fx = Math.sin(sg.ang), fz = Math.cos(sg.ang), rx = Math.cos(sg.ang), rz = -Math.sin(sg.ang);
				const back = sg.kind.startsWith('B18_') ? 'round|b' : sg.kind + '|b';
				qs.push({ c: [sg.x + fx * 0.05, sg.y + hy, sg.z + fz * 0.05], r: [rx * h, 0, rz * h], u: [0, h, 0], n: [fx, 0, fz], uv: A.uv[sg.kind] });
				qs.push({ c: [sg.x + fx * 0.04, sg.y + hy, sg.z + fz * 0.04], r: [-rx * h, 0, -rz * h], u: [0, h, 0], n: [-fx, 0, -fz], uv: A.uv[back] });
				pole.setMatrixAt(k, m4.compose(p3.set(sg.x, sg.y + (hy + sz * 0.3) / 2, sg.z), Q_ID, sc.set(0.07, hy + sz * 0.3, 0.07)));
			});
			const faces = quadMesh(qs, A.mat);
			faces.receiveShadow = true;
			pole.castShadow = this.shadows;
			group.add(faces, pole);
		}
		if (heads.length) {
			const body = World.lampBodyM || (World.lampBodyM = shared(patch(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5 }), 'lit')));
			if (!World.tlLensGeo) { World.tlLensGeo = new T.CircleGeometry(0.1, 16); World.tlLensGeo.userData.shared = true; }
			const lensM = World.tlLensM || (World.tlLensM = shared(new T.MeshBasicMaterial({ color: 0xffffff })));
			const bodies = new T.InstancedMesh(tlGeo(), body, heads.length), lens = new T.InstancedMesh(World.tlLensGeo, lensM, heads.length * 3);
			heads.forEach((h, k) => {
				q.setFromAxisAngle(up, h.ang);
				bodies.setMatrixAt(k, m4.compose(p3.set(h.x, h.y, h.z), q, one));
				const fx = Math.sin(h.ang), fz = Math.cos(h.ang);
				[3.32, 3.0, 2.68].forEach((y, j) => {
					lens.setMatrixAt(k * 3 + j, m4.compose(p3.set(h.x + fx * 0.295, h.y + y, h.z + fz * 0.295), q, one));
					lens.setColorAt(k * 3 + j, TL_OFF[j]);
				});
			});
			bodies.castShadow = this.shadows;
			group.add(bodies, lens);
			if (dyn) dyn.push({ type: 'tlights', lens, heads, cur: new Int8Array(heads.length).fill(-1) });
		}
	};
	// cykl świateł sygnalizatorów kawałka (zmiana koloru soczewek tylko przy zmianie stanu)
	World.prototype.updateTLights = function (d) {
		let ch = false;
		d.heads.forEach((h, i) => {
			const st = tlState(h.grp, (this.time + h.off) % 60);
			if (st === d.cur[i]) return;
			d.cur[i] = st;
			ch = true;
			for (let j = 0; j < 3; j++) d.lens.setColorAt(i * 3 + j, (TL_LIT[st] >> j) & 1 ? TL_ON[j] : TL_OFF[j]);
		});
		if (ch) d.lens.instanceColor.needsUpdate = true;
	};

	/* Wyposażenie jezdni: studzienki i kratki ściekowe – płaskie instancje z teksturą z kanwy, tuż nad nawierzchnią
	   (koleiny i brud przy krawędziach – w shaderze dróg). */
	const manholeTex = () => canvasTexture('road-manhole', 128, 128, (g, w) => {
		const c = w / 2;
		g.clearRect(0, 0, w, w);
		g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fillStyle = '#4a4744'; g.fill();
		g.beginPath(); g.arc(c, c, c - 12, 0, Math.PI * 2); g.fillStyle = '#2f2d2b'; g.fill();
		// wzór żeber pokrywy: pierścienie i promienie
		g.strokeStyle = '#4f4b47'; g.lineWidth = 4;
		for (const r of [16, 30, 44]) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
		for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 16, c + Math.sin(a) * 16); g.lineTo(c + Math.cos(a) * 50, c + Math.sin(a) * 50); g.stroke(); }
	});
	const drainTex = () => canvasTexture('road-drain', 128, 96, (g, w, h) => {
		g.fillStyle = '#4b4845'; g.fillRect(0, 0, w, h);
		g.fillStyle = '#121212'; g.fillRect(8, 8, w - 16, h - 16);
		g.fillStyle = '#4b4845';
		for (let x = 16; x < w - 12; x += 13) g.fillRect(x, 8, 5, h - 16);
		g.fillRect(8, h / 2 - 3, w - 16, 6);
	});
	World.prototype.roadWearFlush = function (group, manholes, drains) {
		if (!manholes.length && !drains.length) return;
		// atlas: pokrywa studzienki (lewa komórka), kratka (prawa) – jedna siatka płaskich czworokątów na kawałek
		if (!World.wearAtlas) {
			const cv = document.createElement('canvas');
			cv.width = 256;
			cv.height = 128;
			const g = cv.getContext('2d');
			g.drawImage(manholeTex().image, 0, 0, 128, 128);
			g.drawImage(drainTex().image, 128, 0, 128, 128);
			const tex = new T.CanvasTexture(cv);
			tex.colorSpace = T.SRGBColorSpace;
			tex.anisotropy = 16;
			const m = patch(new T.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.55, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -30 }), 'lit');
			m.userData.shared = true;
			World.wearAtlas = m;
		}
		const qs = [];
		for (const [list, w, l, uv] of [[manholes, 0.66, 0.66, [0.002, 0.002, 0.498, 0.998]], [drains, 0.42, 0.56, [0.502, 0.002, 0.998, 0.998]]]) {
			for (const [x, y, z, ang] of list) {
				const ca = Math.cos(ang), sa = Math.sin(ang);
				// oś u wzdłuż lokalnego x (obrót wokół pionu), v – wzdłuż −z (jak płaszczyzna obrócona o −90° wokół x)
				qs.push({ c: [x, y, z], r: [ca * w / 2, 0, -sa * w / 2], u: [-sa * l / 2, 0, -ca * l / 2], n: [0, 1, 0], uv });
			}
		}
		const m = quadMesh(qs, World.wearAtlas);
		m.receiveShadow = true;
		group.add(m);
	};

	// wody: cieki (pasy) i zbiorniki z rastra (prostokąty 10 m), lustro wody nieco poniżej terenu brzegu
	/* ---------- woda: poziomy, koryta cieków, kontur zbiorników ----------
	   Cieki (env.w, łamane z szerokością): poziom wody wzdłuż biegu z pomiaru terenu (najniższy z osi i brzegów, filtr
	   medianowy – szum pomiaru nad wodą), bez wznoszenia się z biegiem rzeki (kierunek – ten z mniejszym przycięciem);
	   tafla płaska w poprzek, koryto wycięte w terenie (dno, skarpy brzegów) – dawniej wstęga położona na terenie
	   (na zboczu przechylona). Zbiorniki (raster „woda”): poziom wspólny dla połączonego zbiornika – mediana wiersza
	   wygładzona wzdłuż biegu (bez schodków między wierszami); brzeg z konturu (marching squares na rozmytym polu, 5 m). */
	const W_STEP = 4; // krok próbek poziomu cieku (m)
	const wDepth = (w) => Math.max(0.35, Math.min(1.4, 0.35 + 0.035 * w)); // głębokość koryta
	const wBank = (w) => 1.5 + 0.12 * w; // szerokość skarpy brzegu (od lustra do poziomu terenu nad nim)
	World.prototype.envStreamProfile = function (row) {
		const e = this.env;
		if (!e.wProf) e.wProf = new Map();
		let P = e.wProf.get(row);
		if (P) return P;
		const w = row[0], n = (row.length - 1) / 2, pts = [], cumP = [0];
		for (let k = 0; k < n; k++) pts.push([row[1 + k * 2], row[2 + k * 2]]);
		for (let k = 1; k < n; k++) cumP.push(cumP[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
		const L = cumP[n - 1], m = Math.max(2, Math.ceil(L / W_STEP) + 1);
		const at = (u) => {
			let k = 0;
			while (k < n - 2 && cumP[k + 1] < u) k++;
			const f = cumP[k + 1] > cumP[k] ? (u - cumP[k]) / (cumP[k + 1] - cumP[k]) : 0, a = pts[k], b = pts[k + 1];
			const ls = cumP[k + 1] - cumP[k] || 1;
			return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, -(b[1] - a[1]) / ls, (b[0] - a[0]) / ls];
		};
		const g = [], cum = [];
		for (let i = 0; i < m; i++) {
			const u = (L * i) / (m - 1), [s, d, ns, nd] = at(u), h = w / 2 + 0.5;
			cum.push(u);
			g.push(Math.min(this.demGround(s, d), this.demGround(s + ns * h, d + nd * h), this.demGround(s - ns * h, d - nd * h)));
		}
		// filtr medianowy (5 próbek)
		const gm = g.map((_, i) => { const win = g.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b); return win[win.length >> 1]; });
		// bez wznoszenia z biegiem (przeciek 3 mm na próbkę – szum) w obu kierunkach; kierunek z mniejszym przycięciem
		const run = (order) => {
			const out = new Array(m);
			let prev = Infinity, cut = 0;
			for (const i of order) {
				const v = Math.min(gm[i] - 0.2, prev + 0.003);
				out[i] = v;
				cut += gm[i] - 0.2 - v;
				prev = v;
			}
			return { out, cut };
		};
		const idx = [...Array(m).keys()], A = run(idx), B = run(idx.slice().reverse());
		const lv = (A.cut <= B.cut ? A : B).out, dir = A.cut <= B.cut ? 1 : -1; // dir – bieg rzeki wzdłuż łamanej (+1) albo pod prąd
		const lvl = lv.map((_, i) => (lv[Math.max(0, i - 1)] + lv[i] + lv[Math.min(m - 1, i + 1)]) / 3);
		P = { w, pts, cumP, cum, lvl, L, dir };
		e.wProf.set(row, P);
		return P;
	};
	// poziom cieku w odległości u od początku łamanej
	const profLvl = (P, u) => {
		const f = Math.max(0, Math.min(P.lvl.length - 1.001, (u / (P.L || 1)) * (P.lvl.length - 1))), i = Math.floor(f);
		return P.lvl[i] + (P.lvl[i + 1] - P.lvl[i]) * (f - i);
	};
	/* odcinki cieków po kawałkach (do koryta w terenie i kolumn siatki terenu): [sa, da, sb, db, w, la, lb], przypisane
	   do każdego kawałka, w którego pas (z zasięgiem skarpy) wchodzą */
	World.prototype.envStreamSegs = function () {
		const e = this.env;
		if (e.wSegs) return e.wSegs;
		e.wSegs = new Map();
		if (!e.dem) return e.wSegs;
		if (!e.waterLinks) e.waterLinks = this.envUnderLinks(this.route.env.w, 1);
		const rows = (this.route.env.w || []).concat(e.waterLinks);
		for (const row of rows) {
			const P = this.envStreamProfile(row), reach = row[0] / 2 + wBank(row[0]) + 16;
			for (let k = 0; k + 1 < P.pts.length; k++) {
				const [sa, da] = P.pts[k], [sb, db] = P.pts[k + 1], seg = [sa, da, sb, db, row[0], profLvl(P, P.cumP[k]), profLvl(P, P.cumP[k + 1])];
				for (let c = Math.floor((Math.min(sa, sb) - reach) / C); c <= Math.floor((Math.max(sa, sb) + reach) / C); c++) {
					if (!e.wSegs.has(c)) e.wSegs.set(c, []);
					e.wSegs.get(c).push(seg);
				}
			}
		}
		return e.wSegs;
	};
	/* teren przy cieku nie wyżej niż koryto: dno (w lustrze – głębokość, płytsze przy brzegu), skarpa do 0,35 m nad
	   lustrem, dalej wznosi się 0,6 m na metr (wyżej – teren bez zmian); Infinity – poza zasięgiem */
	World.prototype.envStreamBed = function (s, d) {
		const list = this.envStreamSegs().get(Math.floor(s / C));
		if (!list) return Infinity;
		let y = Infinity;
		for (const [sa, da, sb, db, w, la, lb] of list) {
			const half = w / 2, bank = wBank(w), reach = half + bank + 16;
			if (s < Math.min(sa, sb) - reach || s > Math.max(sa, sb) + reach || d < Math.min(da, db) - reach || d > Math.max(da, db) + reach) continue;
			const ds = sb - sa, dd = db - da, L2 = ds * ds + dd * dd || 1;
			const t = Math.max(0, Math.min(1, ((s - sa) * ds + (d - da) * dd) / L2));
			const off = Math.hypot(s - sa - ds * t, d - da - dd * t);
			if (off > reach) continue;
			const lvl = la + (lb - la) * t, dep = wDepth(w);
			let v;
			if (off <= half) v = lvl - dep * (1 - 0.6 * (off / half) * (off / half));
			else if (off <= half + bank) v = lvl - 0.4 * dep + (0.4 * dep + 0.35) * smoothstep(half, half + bank, off);
			else v = lvl + 0.35 + (off - half - bank) * 0.6;
			if (v < y) y = v;
		}
		return y;
	};

	/* zbiorniki: składowe połączone komórek „woda” (4-sąsiedztwo) i poziom wiersza składowej (mediana pomiaru,
	   wygładzona wzdłuż: mediana ±15 wierszy, potem średnia ±10 – 150 / 100 m; przy węższym oknie sąsiednie pasy rzeki
	   płynącej w poprzek toru różniły się o ponad metr – część tafli poza lustrem odbicia, bez odbić) */
	World.prototype.envWaterComps = function () {
		const e = this.env;
		if (e.wComp) return e.wComp;
		const g = e.g, cols = g.cols, rows = e.rows, grid = e.grid, comp = new Int32Array(rows * cols).fill(-1);
		let nc = 0;
		const stack = [];
		for (let i = 0; i < rows * cols; i++) {
			if (grid[i] !== 9 || comp[i] >= 0) continue;
			comp[i] = nc;
			stack.push(i);
			while (stack.length) {
				const x = stack.pop(), r = (x / cols) | 0, c2 = x - r * cols;
				for (const [rr, cc] of [[r - 1, c2], [r + 1, c2], [r, c2 - 1], [r, c2 + 1]]) {
					if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
					const y = rr * cols + cc;
					if (grid[y] === 9 && comp[y] < 0) { comp[y] = nc; stack.push(y); }
				}
			}
			nc++;
		}
		const lidar = !!(e.dem && e.dem.lidar);
		// surowe poziomy (składowa, wiersz) – mediana pomiaru (lidar) albo terenu + 1,1 m (bez lidaru: teren obniżony pod wodą)
		const raw = new Map();
		for (let r = 0; r < rows; r++) {
			const byC = new Map(), s0 = g.s0 + r * g.step;
			for (let c2 = 0; c2 < cols; c2++) {
				const k = comp[r * cols + c2];
				if (k < 0) continue;
				if (!byC.has(k)) byC.set(k, []);
				const d = g.d0 + c2 * g.step;
				byC.get(k).push(lidar ? this.demGround(s0, d) : this.terrainY(s0, d) + 1.1);
			}
			for (const [k, hs] of byC) { hs.sort((a, b) => a - b); raw.set(k * rows + r, hs[hs.length >> 1]); }
		}
		const lvl = new Map();
		const med = new Map();
		for (const [key, v] of raw) {
			const k = Math.floor(key / rows), r = key - k * rows, win = [];
			for (let q = r - 15; q <= r + 15; q++) { const x = raw.get(k * rows + q); if (x !== undefined) win.push(x); }
			win.sort((a, b) => a - b);
			med.set(key, win.length ? win[win.length >> 1] : v);
		}
		for (const [key, v] of med) {
			const k = Math.floor(key / rows), r = key - k * rows;
			let sum = 0, n = 0;
			for (let q = r - 10; q <= r + 10; q++) { const x = med.get(k * rows + q); if (x !== undefined) { sum += x; n++; } }
			lvl.set(key, n ? sum / n : v);
		}
		e.wComp = { comp, lvl, rows, cols };
		return e.wComp;
	};
	// poziom zbiornika (pomiar terenu przy lustrze) w komórce (ri, ci) – undefined poza wodą
	World.prototype.envCompLevel = function (ri, ci) {
		const W = this.envWaterComps();
		if (ri < 0 || ri >= W.rows || ci < 0 || ci >= W.cols) return undefined;
		const k = W.comp[ri * W.cols + ci];
		return k < 0 ? undefined : W.lvl.get(k * W.rows + ri);
	};

	World.prototype.buildEnvWater = function (group, c, segs) {
		const e = this.env, r = this.route;
		const dst = { p: [], c: [], sh: [], fl: [] };
		const white = { r: 1, g: 1, b: 1 };
		const skip = (s, d) => (Math.abs(d) < 8 && !this.underBridge(s, d)) || this.envStationZone(s, d);
		if (!e.waterLinks) e.waterLinks = this.envUnderLinks(this.route.env.w, 1);
		for (const row of e.waterLinks) if (Math.floor((row[1] + row[3]) / 2 / C) === c) segs = segs.concat([{ k: 0, row }]);
		/* wierzchołek: [x, y, z, płytkość 0 (głęboko) … 1 (brzeg), nurt x, nurt z (m/s w świecie)] – kolor głębi, linia
		   brzegu i zmarszczki płynące z nurtem (water.js) */
		const push = (v) => { dst.p.push(v[0], v[1], v[2]); dst.sh.push(v[3] || 0); dst.fl.push(v[4] || 0, v[5] || 0); };
		const T3 = (x, y2, z) => {
			const up = ((z[2] - x[2]) * (y2[0] - x[0]) - (z[0] - x[0]) * (y2[2] - x[2])) < 0;
			push(x);
			if (up) { push(y2); push(z); } else { push(z); push(y2); }
		};
		const W3 = (s, d, y, sh = 0, fx = 0, fz = 0) => { R.sidePoint(r, s, d, tp); return [tp.x, y, tp.z, sh, fx, fz]; };
		const shal = (dep) => 1 - Math.max(0, Math.min(1, dep / 0.5)); // od 0,5 m głębokości – głęboko (dno pod wodą co najmniej 0,45 m niżej)
		/* cieki: tafla na poziomie z profilu (płaska w poprzek), do 0,7 skarpy w głąb brzegu (brzeg wycięty w terenie –
		   envStreamBed – przykrywa jej krawędź); oś nie niżej niż nawierzchnia (tam, gdzie siatka terenu jest za rzadka na
		   koryto) */
		for (const { k, row } of segs) {
			if (!e.dem) {
				this.envStrip(dst, [[row[1 + k * 2], row[2 + k * 2]], [row[3 + k * 2], row[4 + k * 2]]], row[0], 0.12, white, skip);
				while (dst.sh.length < dst.p.length / 3) { dst.sh.push(0); dst.fl.push(0, 0); }
				continue;
			}
			const P = this.envStreamProfile(row), w = row[0], hw = w / 2 + wBank(w) * 0.7;
			const [sa, da] = P.pts[k], [sb, db] = P.pts[k + 1], L = Math.hypot(sb - sa, db - da);
			if (L < 0.05) continue;
			const ns = -(db - da) / L, nd = (sb - sa) / L, pieces = Math.max(1, Math.ceil(L / W_STEP));
			const ex = Math.min(0.6, w / 2) / L;
			// nurt: w kierunku biegu, szybszy na szerszych (0,3–1 m/s), w świecie
			R.sidePoint(r, sa, da, tp);
			const ax = tp.x, az = tp.z;
			R.sidePoint(r, sb, db, tp);
			const fv = Math.min(1, 0.3 + w * 0.025) * P.dir / (Math.hypot(tp.x - ax, tp.z - az) || 1), fx = (tp.x - ax) * fv, fz = (tp.z - az) * fv;
			for (let q = 0; q < pieces; q++) {
				const t0 = q / pieces - (q === 0 ? ex : 0), t1 = (q + 1) / pieces + (q === pieces - 1 ? ex : 0);
				const s0 = sa + (sb - sa) * t0, d0 = da + (db - da) * t0, s1 = sa + (sb - sa) * t1, d1 = da + (db - da) * t1;
				if (skip((s0 + s1) / 2, (d0 + d1) / 2)) continue;
				// w obrębie zbiornika (raster „woda” – np. Wisła: linia biegu rzeki w jej korycie) – tylko tafla zbiornika
				if (this.areaAt((s0 + s1) / 2, (d0 + d1) / 2) === 9) continue;
				const ends = [[s0, d0, P.cumP[k] + L * t0], [s1, d1, P.cumP[k] + L * t1]].map(([s, d, u]) => {
					const y = profLvl(P, u), yc = Math.max(y, this.surfY(s, d) + 0.03);
					return [W3(s - ns * hw, d - nd * hw, y, 1, fx, fz), W3(s, d, yc, shal(yc - this.terrainY(s, d)), fx, fz), W3(s + ns * hw, d + nd * hw, y, 1, fx, fz)];
				});
				const [A, B] = ends;
				T3(A[0], A[1], B[1]); T3(A[0], B[1], B[0]);
				T3(A[1], A[2], B[2]); T3(A[1], B[2], B[1]);
			}
		}
		/* zbiorniki: kontur pola „woda” rozmytego filtrem 1-2-1 (próbki co 5 m – połowa kroku rastra), izolinia 0,5;
		   poziom wierzchołka – zbiornika (envCompLevel) w najbliższych komórkach wody, liniowo między wierszami */
		const g = e.g, st = g.step, hs = st / 2, cols = g.cols, rows = e.rows;
		if (!e.wBlur) {
			const B = new Float32Array(rows * cols);
			const isW = (ri, ci) => (ri >= 0 && ri < rows && ci >= 0 && ci < cols && e.grid[ri * cols + ci] === 9 ? 1 : 0);
			for (let ri = 0; ri < rows; ri++) for (let ci = 0; ci < cols; ci++) {
				let v = 0;
				for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) v += (a ? 1 : 2) * (b ? 1 : 2) * isW(ri + a, ci + b);
				B[ri * cols + ci] = v / 16;
			}
			e.wBlur = B;
		}
		const Bf = e.wBlur;
		const fAt = (q, p) => { // pole w punkcie siatki próbek (q – wiersz co 5 m, p – kolumna co 5 m)
			const fr = q / 2, fc = p / 2, r0 = Math.floor(fr), c0 = Math.floor(fc), tr = fr - r0, tc = fc - c0;
			const v = (ri, ci) => (ri >= 0 && ri < rows && ci >= 0 && ci < cols ? Bf[ri * cols + ci] : 0);
			const a = v(r0, c0) + (v(r0, c0 + 1) - v(r0, c0)) * tc, b = v(r0 + 1, c0) + (v(r0 + 1, c0 + 1) - v(r0 + 1, c0)) * tc;
			return a + (b - a) * tr;
		};
		const lvlAt = (s, d) => {
			const fr = (s - g.s0) / st, fc = (d - g.d0) / st, r0 = Math.floor(fr), c0 = Math.round(fc);
			let a = this.envCompLevel(r0, c0), b = this.envCompLevel(r0 + 1, c0);
			for (let rad = 1; (a === undefined || b === undefined) && rad <= 2; rad++) for (let dc = -rad; dc <= rad; dc++) {
				if (a === undefined) a = this.envCompLevel(r0, c0 + dc);
				if (b === undefined) b = this.envCompLevel(r0 + 1, c0 + dc);
			}
			if (a === undefined && b === undefined) {
				for (let dr = -1; dr <= 2 && a === undefined; dr++) for (let dc = -2; dc <= 2 && a === undefined; dc++) a = this.envCompLevel(r0 + dr, c0 + dc);
				b = a;
			}
			if (a === undefined) a = b;
			if (b === undefined) b = a;
			if (a === undefined) return this.terrainY(s, d) + 0.6;
			const t = Math.max(0, Math.min(1, fr - r0));
			return a + (b - a) * t - 0.45;
		};
		const ptS = (q) => g.s0 + q * hs, ptD = (p) => g.d0 + p * hs;
		const qa = Math.floor((c * C - g.s0) / hs) - 1, qb = Math.ceil(((c + 1) * C - g.s0) / hs) + 1;
		for (let q = qa; q < qb; q++) {
			const sc = ptS(q + 0.5);
			if (Math.floor(sc / C) !== c || q < 0 || q / 2 >= rows - 1) continue;
			for (let p = 0; p < (cols - 1) * 2; p++) {
				const v0 = fAt(q, p), v1 = fAt(q, p + 1), v2 = fAt(q + 1, p + 1), v3 = fAt(q + 1, p);
				const idx = (v0 >= 0.5 ? 1 : 0) | (v1 >= 0.5 ? 2 : 0) | (v2 >= 0.5 ? 4 : 0) | (v3 >= 0.5 ? 8 : 0);
				if (!idx) continue;
				const dc = ptD(p + 0.5);
				if ((Math.abs(dc) < 10 && !this.underBridge(sc, dc)) || this.envStationZone(sc, dc)) continue;
				// narożniki (s, d) i punkty na krawędziach (izolinia 0,5)
				const cor = [[ptS(q), ptD(p), v0], [ptS(q), ptD(p + 1), v1], [ptS(q + 1), ptD(p + 1), v2], [ptS(q + 1), ptD(p), v3]];
				const mid = (i, j) => { const A = cor[i], Bq = cor[j], t = (0.5 - A[2]) / (Bq[2] - A[2] || 1e-6); return [A[0] + (Bq[0] - A[0]) * t, A[1] + (Bq[1] - A[1]) * t]; };
				// wielokąt(y) wody w kwadracie – obchodzimy narożniki i krawędzie po kolei
				const polys = [];
				if (idx === 5 || idx === 10) {
					// siodło: środek decyduje, czy wody się łączą
					const joined = (v0 + v1 + v2 + v3) / 4 >= 0.5;
					const order = [];
					for (let i = 0; i < 4; i++) {
						const j = (i + 1) % 4, ii = cor[i][2] >= 0.5, jj = cor[j][2] >= 0.5;
						if (ii) order.push([cor[i][0], cor[i][1]]);
						if (ii !== jj) order.push(mid(i, j));
					}
					if (joined) polys.push(order);
					else {
						// dwa osobne trójkąty przy narożnikach z wodą
						for (let i = 0; i < 4; i++) if (cor[i][2] >= 0.5) polys.push([[cor[i][0], cor[i][1]], mid(i, (i + 1) % 4), mid((i + 3) % 4, i)]);
					}
				} else {
					const poly = [];
					for (let i = 0; i < 4; i++) {
						const j = (i + 1) % 4, ii = cor[i][2] >= 0.5, jj = cor[j][2] >= 0.5;
						if (ii) poly.push([cor[i][0], cor[i][1]]);
						if (ii !== jj) poly.push(mid(i, j));
					}
					polys.push(poly);
				}
				for (const poly of polys) {
					if (poly.length < 3) continue;
					const V = poly.map(([s, d]) => { const y = lvlAt(s, d); return W3(s, d, y, shal(y - this.terrainY(s, d))); });
					for (let i = 1; i + 1 < V.length; i++) T3(V[0], V[i], V[i + 1]);
				}
			}
		}
		if (!dst.p.length) return;
		const geo = new T.BufferGeometry();
		geo.setAttribute('position', new T.Float32BufferAttribute(dst.p, 3));
		// trasa bez pomiaru (envStrip – bez płytkości i nurtu): zera
		while (dst.sh.length < dst.p.length / 3) { dst.sh.push(0); dst.fl.push(0, 0); }
		geo.setAttribute('aShal', new T.Float32BufferAttribute(dst.sh, 1));
		geo.setAttribute('aFlow', new T.Float32BufferAttribute(dst.fl, 2));
		geo.computeVertexNormals();
		const m = new T.Mesh(geo, World.materials().water);
		m.receiveShadow = true;
		group.add(m);
	};

	/* przystanki autobusowe z mapy (env.bs) na ciągach ulic: najbliższy ciąg (droga dla aut, także dojazdowa – zatoki
	   i pętle autobusowe; bez gruntowych) do 22 m – pierwszy z kandydatów (od najbliższego), na którym jest miejsce poza
	   skrzyżowaniem (krótki ciąg – w jego środku); side – strona ciągu (+1 – strona dodatnia), dir – kierunek jazdy autobusu (prawa strona), raz na trasę */
	World.prototype.envBusStops = function () {
		const e = this.env;
		if (e.busStops) return e.busStops;
		const out = [], st = this.envStreets();
		for (const [s, d] of this.route.env.bs || []) {
			const cands = [];
			const c0 = Math.floor(s / C);
			for (const cc of [c0 - 1, c0, c0 + 1]) for (const { ch, k } of st.chByChunk.get(cc) || []) {
				const inf = ch.seg[k].inf;
				if (inf.ti > 8 || inf.surf === 3) continue;
				const [sa, da] = ch.pts[k], [sb, db] = ch.pts[k + 1], L = ch.cum[k + 1] - ch.cum[k];
				if (L < 1e-6) continue;
				const f = Math.max(0, Math.min(1, ((s - sa) * (sb - sa) + (d - da) * (db - da)) / (L * L)));
				const ps = sa + (sb - sa) * f, pd = da + (db - da) * f, dd = Math.hypot(ps - s, pd - d) + (inf.ti === 8 ? 3 : 0); // ulica przed dojazdową
				if (dd < 22) cands.push({ dd, ch, t: ch.cum[k] + f * L, side: ((s - ps) * -(db - da) + (d - pd) * (sb - sa)) >= 0 ? 1 : -1 });
			}
			cands.sort((a, b) => a.dd - b.dd);
			const best = cands.find((x) => x.ch.L - x.ch.trim[1].t - x.ch.trim[0].t >= 4);
			if (!best) continue;
			const ch = best.ch, lo0 = ch.trim[0].t, hi0 = ch.L - ch.trim[1].t;
			const lo = Math.min(lo0 + 8, (lo0 + hi0) / 2), hi = Math.max(hi0 - 8, (lo0 + hi0) / 2);
			const t = Math.max(lo, Math.min(hi, best.t));
			// jednokierunkowa – kierunek ulicy (przystanek po dowolnej stronie)
			const one = ch.seg[chSeg(ch, t)].inf.one, flip = ch.seg[chSeg(ch, t)].flip;
			const dir = one ? (flip ? -1 : 1) : best.side;
			const p = chPt(ch, t, 0, 0);
			out.push({ id: out.length, ch, t, side: best.side, dir, s: p[0], d: p[1] });
		}
		e.busStops = out;
		return out;
	};
	// sieć ulic dla ruchu ulicznego i pieszego (street-life.js): punkty ciągów, wloty, sygnalizacja
	World.streetUtil = { chPt, chPtK, chSeg, armPt, tlState, junctionLights, junctionGroups };
	// nocne okna budynków
	World.prototype.envNight = function (dark) {
		if (World.envM) World.envM.facade.emissiveIntensity = dark > 0.25 ? 0.8 * dark : 0;
	};
})();
