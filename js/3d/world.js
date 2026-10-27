/* Świat wzdłuż toru budowany kawałkami: teren, tor, sieć trakcyjna, drzewa, stacje, semafory,
   przejazdy, mosty i tunele. Kawałki przed pociągiem powstają, za pociągiem są usuwane. */
import * as THREE from 'three';
import { BundleGroup } from 'three/webgpu';

(function () {
	'use strict';
	const T = THREE;
	const R = window.TrainRoutes;
	const NS = window.Train3D;
	const { hash, smoothstep, vnoise, mat, matS, patch, GEO, box, roof, sprite, glowTexture, labelTexture, boardTexture, disposeTree, canvasTexture } = NS.util;

	const C = 200; // długość kawałka, m
	const AHEAD = 1300;
	const BEHIND = 450;
	// kolumny terenu (odsunięcia od osi toru): gęsto przy torze (nasyp, rów), rzadziej w oddali
	const TERRAIN_D = (() => {
		const side = [3.4, 4.6, 5.6, 6.4, 7.2, 8.4, 10, 12.5, 15.5, 19, 23, 28, 34, 41, 49, 58, 68, 80, 94, 110, 130, 155, 185, 220, 260, 310, 370, 440, 520, 600];
		return [...side.map((d) => -d).reverse(), 0, ...side];
	})();
	const ASPECT_COLOR = { green: 0x34d058, yellow: 0xffb020, red: 0xff3b30, yellow2: 0xffb020, white: 0xf2f2ff };
	const SKIN = ['#f1c9a5', '#e2b48f', '#c58c66', '#8d5a3b', '#f5d5b8'];
	// ubrania (kurtki, płaszcze) jak na ulicach i peronach: przeważają ciemne i stonowane, rzadziej żywe kolory
	const PEOPLE = [0x22304a, 0x1c1d20, 0x3a3d42, 0x2f4a3a, 0xa58a62, 0x6e2430, 0x3f5f86, 0xb6b8b9, 0xa8322d, 0xb58b2c, 0xd9d9d6, 0x2a2b2e, 0x5a4636, 0x4b5d6e];
	const HOUSE_WALLS = ['#e8dcc4', '#d9b99b', '#c9d3d9', '#efe6b8', '#f2f0ea', '#cfb7a3'];
	const HOUSE_ROOFS = ['#8e3b2e', '#6d4c3d', '#59626b', '#a0522d'];
	const tmpColor = new T.Color();
	const tp = {}, ftp = {}; // ftp – foldOther
	/* żółty pas ostrzegawczy peronu: od 0,55 do 0,95 m od krawędzi (PM.tact); wyposażenie (ławki z nogami siedzących,
	   kosze) – co najmniej 1 m za nim, ludzie stoją i chodzą co najmniej 0,3 m za nim (do pociągu przechodzą przez pas
	   tylko przy wsiadaniu i wysiadaniu) */
	const LINE = 0.95, FURN = LINE + 1.0, PAX = LINE + 0.3;
	const M4 = new T.Matrix4(), M4B = new T.Matrix4(), V3 = new T.Vector3(), V3B = new T.Vector3(), S3 = new T.Vector3(), Q0 = new T.Quaternion(), Q1 = new T.Quaternion();
	const SECOND = -4.6; // oś drugiego toru
	const NO_BRIDGES = [];

	class World {
		constructor(scene) {
			this.scene = scene;
			this.chunks = new Map();
			this.route = null;
			this.time = 0;
			this.density = 1; // gęstość roślinności (ustawienia jakości)
			this.shadows = true;
			this.zones = []; // pastwiska – drzewa ich omijają
			this.viewPos = new T.Vector3(); // pozycja kamery (ustawia scena) – do wyboru najbliższych latarń
			// kilka prawdziwych świateł punktowych przypisywanych co klatkę do latarń najbliższych kamerze
			// (stała liczba świateł – bez przekompilowywania shaderów)
			this.lightPool = Array.from({ length: 8 }, () => {
				const l = new T.PointLight(0xffc27a, 0, 22, 1.6);
				l.userData.streetLamp = true; // (bez wpływu na wnętrze kabiny – cab.js limitLights)
				scene.add(l);
				return l;
			});
			this.trainDoors = null; // drzwi pociągu gracza w świecie (ustawia scena)
		}

		static lampMaterials() {
			const shared = (m) => { m.userData.shared = true; return m; };
			const poolTex = canvasTexture('lamp-pool', 128, 128, (g, w) => {
				const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
				// wygaszone przed krawędzią koła – bez widocznego obrysu
				r.addColorStop(0, 'rgba(255,255,255,1)');
				r.addColorStop(0.3, 'rgba(255,255,255,0.6)');
				r.addColorStop(0.6, 'rgba(255,255,255,0.18)');
				r.addColorStop(0.85, 'rgba(255,255,255,0)');
				r.addColorStop(1, 'rgba(255,255,255,0)');
				g.fillStyle = r;
				g.fillRect(0, 0, w, w);
			});
			const haloTex = canvasTexture('lamp-halo', 64, 64, (g, w) => {
				const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
				r.addColorStop(0, 'rgba(255,255,255,1)');
				r.addColorStop(0.15, 'rgba(255,255,255,0.6)');
				r.addColorStop(0.5, 'rgba(255,255,255,0.12)');
				r.addColorStop(1, 'rgba(255,255,255,0)');
				g.fillStyle = r;
				g.fillRect(0, 0, w, w);
			});
			return {
				lampLens: shared(new T.MeshBasicMaterial({ color: '#d8d4c8' })),
				lampHousing: mat('#3a3f45'),
				lampHalo: shared(new T.SpriteMaterial({ map: haloTex, color: 0xffc98a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0, fog: false })),
				lampPool: shared(new T.MeshBasicMaterial({ map: poolTex, color: 0xffc27a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false })),
				poolGeo: (() => { const g = new T.CircleGeometry(1, 32).rotateX(-Math.PI / 2); g.userData.shared = true; return g; })(),
			};
		}

		// Latarnia: obudowa, świecący klosz od spodu, poświata (większa w mgle i opadach), plama światła na ziemi.
		// (hx, hy, hz) – położenie klosza w układzie grupy g, groundY – wysokość podłoża pod nią. Zwraca klosz.
		lampHead(g, hx, hy, hz, groundY, along, size) {
			const M = World.materials();
			const k = size || 1;
			const w = (along ? 0.38 : 0.8) * k, d = (along ? 0.8 : 0.38) * k;
			// obudowa: spłaszczona kopuła z okapem, pod nią klosz
			const dome = new T.Mesh(GEO.sphere, M.lampHousing);
			dome.scale.set(w, 0.3 * k, d);
			dome.position.set(hx, hy + 0.04, hz);
			g.add(dome);
			const skirt = new T.Mesh(GEO.cyl, M.lampHousing);
			skirt.scale.set(w * 0.98, 0.06, d * 0.98);
			skirt.position.set(hx, hy - 0.02, hz);
			g.add(skirt);
			const lens = new T.Mesh(GEO.sphere, M.lampLens);
			lens.scale.set(w * 0.82, 0.1, d * 0.82);
			lens.position.set(hx, hy - 0.05, hz);
			g.add(lens);
			const halo = new T.Sprite(M.lampHalo);
			halo.scale.set(1.5 * k, 1.5 * k, 1);
			halo.userData.lampHalo = true;
			halo.position.set(hx, hy - 0.12, hz);
			g.add(halo);
			const h = hy - groundY;
			const pool = new T.Mesh(M.poolGeo, M.lampPool);
			pool.scale.setScalar(Math.max(3.5, h * 1.05));
			pool.position.set(hx, groundY + 0.03, hz);
			pool.renderOrder = 5;
			g.add(pool);
			return lens;
		}

		/* Ludzie: części oznaczone aKeep nie biorą koloru instancji (ubranie/skóra) – spodnie i włosy z palet wg
		   numeru osoby (gl_InstanceID), buty i pasek stałe. */
		static personMat(m) {
			m = NS.util.patch(m, 'lit', { noSnow: true }); // śnieg nie osiada na ludziach (ruszają się – plamy wyglądały jak tekstura)
			if (NS.gpu) return NS.nodes.extend(m, NS.nodes.personHooks()); // WebGPU: animacja i palety w TSL (nodes.js)
			const prev = m.onBeforeCompile;
			m.onBeforeCompile = (sh, r) => {
				prev(sh, r);
				sh.vertexShader = sh.vertexShader
					.replace('#include <common>', `#include <common>
					attribute float aKeep; attribute float aLimb; attribute vec3 aAnim;
					vec3 animP;
					// obrót wokół osi x (pochylenie w przód/tył) względem punktu c; y – wokół osi pionowej
					vec3 rX(vec3 p, vec3 c, float a) { p -= c; float s = sin(a), k = cos(a); return c + vec3(p.x, p.y * k - p.z * s, p.y * s + p.z * k); }
					vec3 rY(vec3 p, vec3 c, float a) { p -= c; float s = sin(a), k = cos(a); return c + vec3(p.x * k + p.z * s, p.y, -p.x * s + p.z * k); }`)
					.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
					/* animacja (aAnim: x – faza, y – chód 0…1, z – cykle kroku na s): chód – wymach ud, zgięcie kolan
					   w fazie przenoszenia, ręce przeciwnie do nóg z ugiętymi łokciami, podskok; stanie – oddech,
					   przenoszenie ciężaru, kołysanie rąk, rozglądanie się */
					animP = position;
					/* osoba (wg numeru egzemplarza – ciało i głowa mają ten sam): wzrost 1,6–1,9 m, tusza; plecak (ok. 28 %)
					   albo torba na ramię (ok. 22 %) – u pozostałych dodatki zwinięte do wnętrza tułowia */
					float pid = float(gl_InstanceID);
					float pH = 0.92 + 0.16 * fract(sin(pid * 7.13 + 0.7) * 43758.5453), pW = 0.9 + 0.2 * fract(sin(pid * 3.31 + 2.9) * 43758.5453);
					float bagR = fract(sin(pid * 3.71 + 1.3) * 43758.5453);
					if ((aKeep > 3.5 && aKeep < 4.5 && bagR > 0.28) || (aKeep > 4.5 && (bagR < 0.28 || bagR > 0.5))) animP = vec3(0.0, 1.2, 0.0);
					{
						// aAnim.y = −1 – siedzi (uda poziomo, łydki w dół, przedramiona na udach, ciało niżej o 0,35 m)
						float sit = step(aAnim.y, -0.5);
						float ph = uTime * aAnim.z * 6.2832 + aAnim.x, w = max(aAnim.y, 0.0), id = 1.0 - w, sw = sin(ph);
						float t2 = uTime + aAnim.x * 7.0;
						int L = int(aLimb + 0.5);
						float a1 = 0.0, a2 = 0.0, turn = 0.0;
						vec3 c1 = vec3(0.0), c2 = vec3(0.0);
						float shift = id * (1.0 - sit) * sin(t2 * 0.23) * 0.035;
						if (L == 1 || L == 3) { a1 = sw * 0.46 * w + shift; c1 = vec3(0.0, 0.92, 0.0); c2 = vec3(0.0, 0.5, 0.0); if (L == 3) a2 = -max(0.0, sin(ph + 2.0)) * 0.8 * w - max(0.0, shift) * 1.5; }
						if (L == 2 || L == 4) { a1 = -sw * 0.46 * w - shift; c1 = vec3(0.0, 0.92, 0.0); c2 = vec3(0.0, 0.5, 0.0); if (L == 4) a2 = -max(0.0, sin(ph + 5.14)) * 0.8 * w - max(0.0, -shift) * 1.5; }
						if (L == 5 || L == 7) { a1 = -sw * 0.4 * w + id * 0.05 * sin(t2 * 0.7); c1 = vec3(0.0, 1.44, 0.0); c2 = vec3(0.0, 1.16, 0.0); if (L == 7) a2 = 0.12 + 0.12 * id * (0.5 + 0.5 * sin(t2 * 0.4)) + w * (0.3 + 0.25 * max(0.0, -sw)); }
						if (L == 6 || L == 8) { a1 = sw * 0.4 * w + id * 0.05 * sin(t2 * 0.7 + 1.3); c1 = vec3(0.0, 1.44, 0.0); c2 = vec3(0.0, 1.16, 0.0); if (L == 8) a2 = 0.12 + 0.12 * id * (0.5 + 0.5 * sin(t2 * 0.37 + 2.0)) + w * (0.3 + 0.25 * max(0.0, sw)); }
						if (L == 9) turn = id * 0.5 * sin(t2 * 0.31) * sin(t2 * 0.13 + 1.0) + w * 0.06 * sin(ph);
						if (sit > 0.5) {
							if (L >= 1 && L <= 4) { a1 = 1.52 + (L == 2 || L == 4 ? 0.05 : -0.03); a2 = L >= 3 ? -1.42 - 0.08 * sin(t2 * 0.21 + float(L)) : 0.0; }
							if (L >= 5 && L <= 8) { a1 = 0.32 + 0.03 * sin(t2 * 0.5 + float(L)); a2 = L >= 7 ? 0.8 : 0.0; }
						}
						if (a2 != 0.0) { animP = rX(animP, c2, a2); objectNormal = rX(objectNormal, vec3(0.0), a2); }
						if (a1 != 0.0) { animP = rX(animP, c1, a1); objectNormal = rX(objectNormal, vec3(0.0), a1); }
						if (turn != 0.0) { animP = rY(animP, vec3(0.0, 1.56, 0.0), turn); objectNormal = rY(objectNormal, vec3(0.0), turn); }
						// podskok przy chodzie, oddech (unosi tułów i głowę), przechył ciała przy przenoszeniu ciężaru
						animP.y += (abs(sin(ph)) - 0.5) * 0.04 * w - 0.35 * sit;
						if (L == 0 || L >= 5) animP.y += id * (0.5 + 0.5 * sin(t2 * 1.6)) * 0.006 * smoothstep(0.95, 1.2, position.y);
						animP.x += shift * 0.25 * smoothstep(0.3, 1.0, position.y);
						// wzrost i tusza (siedzący – tylko tusza, żeby siedzieli na ławce)
						animP *= vec3(pW, mix(pH, 1.0, sit), pW);
					}`)
					.replace('#include <begin_vertex>', 'vec3 transformed = animP;')
					.replace('#include <color_vertex>', `#include <color_vertex>
					if (aKeep > 0.5) {
						float ph = fract(sin(float(gl_InstanceID) * 12.9898 + aKeep * 3.1) * 43758.5453);
						vec3 pal = aKeep < 1.5
							? (ph < 0.4 ? vec3(0.12, 0.16, 0.3) : ph < 0.6 ? vec3(0.07) : ph < 0.8 ? vec3(0.24, 0.24, 0.23) : vec3(0.42, 0.36, 0.26))
							: aKeep > 2.5
								? aKeep > 3.5
									// plecaki i torby: czarne, granatowe, szare, czerwone, brązowe (skóra)
									? (ph < 0.35 ? vec3(0.03) : ph < 0.55 ? vec3(0.04, 0.06, 0.14) : ph < 0.72 ? vec3(0.18) : ph < 0.86 ? vec3(0.4, 0.05, 0.04) : vec3(0.22, 0.12, 0.06))
									: (ph < 0.35 ? vec3(0.1, 0.08, 0.06) : ph < 0.65 ? vec3(0.3, 0.2, 0.12) : ph < 0.85 ? vec3(0.62, 0.5, 0.3) : vec3(0.55))
								: color.rgb;
						vColor.rgb = pal;
					}`);
			};
			m.customProgramCacheKey = () => 'train2-person';
			m.userData.shared = true;
			return m;
		}

		/* Ludzie jako instancje (ciała i głowy): geometria-nakładka na wspólne atrybuty modelu + własny atrybut
		   instancji aAnim (faza, chód, tempo – zob. personMat), wspólny dla ciał i głów. setAnim(k, …). */
		static peopleMeshes(cap) {
			const PG = World.G.people, M = World.materials();
			const anim = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
			anim.setUsage(T.DynamicDrawUsage);
			const wrap = (geo) => {
				const g = new T.BufferGeometry();
				for (const [k, v] of Object.entries(geo.attributes)) g.setAttribute(k, v);
				g.setAttribute('aAnim', anim);
				return g;
			};
			const bodies = new T.InstancedMesh(wrap(PG.body), M.personBody, cap);
			const heads = new T.InstancedMesh(wrap(PG.head), M.personHead, cap);
			const setAnim = (k, phase, walk, freq) => { anim.setXYZ(k, phase, walk, freq); anim.needsUpdate = true; };
			return { bodies, heads, anim, setAnim };
		}

		// materiały współdzielone przez wszystkie kawałki (tworzone raz)
		/* materiały nawierzchni peronu (wariant 'platform' – common.js): wierzch z płyt, krawężnik peronowy, pas
		   ostrzegawczy z wypustkami; ściana – beton. Inne #define – bez zamiany na materiał z kolorem w wierzchołkach. */
		static platformMats() {
			if (World._plM) return World._plM;
			const mk = (color, def) => {
				const m = matS(color, { roughness: 0.92, surf: 'platform' });
				if (def) {
					m.defines = Object.assign({}, m.defines, { [def]: '' });
					const k = m.customProgramCacheKey();
					m.customProgramCacheKey = () => k + '-' + def;
				}
				m.userData.plain = false;
				return m;
			};
			World._plM = { top: mk('#aaa79f'), edge: mk('#d4d1c8', 'PL_EDGE'), tact: mk('#e2bb28', 'PL_TACT'), wall: matS('#9d978c', { roughness: 0.95, surf: 'concrete' }) };
			return World._plM;
		}
		/* atrybut aPl (kilometraż, odsunięcie) dla wzoru nawierzchni peronu: s – kilometraż (mid − z w układzie toru),
		   przesunięty o wielokrotność 100 m (dokładność w shaderze; wzór ciągły – okresy płyt dzielą 100 m) */
		static plAttr(geo, sOf, dOf) {
			const p = geo.attributes.position, a = new Float32Array(p.count * 2);
			let o = null;
			for (let i = 0; i < p.count; i++) {
				const s = sOf(i, p);
				if (o === null) o = Math.floor(s / 100) * 100;
				a[i * 2] = s - o;
				a[i * 2 + 1] = dOf(i, p);
			}
			geo.setAttribute('aPl', new T.BufferAttribute(a, 2));
			return geo;
		}
		// płyta peronu w układzie toru stacji (x – odsunięcie, z – wzdłuż; mid – kilometraż z = 0), dzielona co 3 m (wygina się po łuku)
		/* płyta o zmiennej szerokości: ściana od toru w odległości x0(z) od osi, tylna w x1(z) (po stronie sg), wysokość h,
		   środek na y; wierzchołki co 3 m wzdłuż peronu; attr – wzór płyt (shader peronu, jak platformSlab) */
		platformSlabVar(sg, x0, x1, h, len, y, mid, material, attr) {
			const geo = new T.BoxGeometry(1, h, len, 1, 1, Math.max(1, Math.ceil(len / 3))).toNonIndexed();
			const p = geo.attributes.position;
			for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setX(i, sg * (p.getX(i) * sg < 0 ? x0(z) : x1(z))); }
			geo.translate(0, y, 0);
			geo.computeVertexNormals();
			if (attr) World.plAttr(geo, (i, q) => mid - q.getZ(i), (i, q) => q.getX(i));
			const m = new T.Mesh(geo, material);
			m.userData.ownGeometry = true;
			m.castShadow = this.shadows;
			m.receiveShadow = true;
			return m;
		}

		platformSlab(w, h, len, x, y, z, mid, material) {
			const geo = new T.BoxGeometry(w, h, len, 1, 1, Math.max(1, Math.ceil(len / 3))).toNonIndexed();
			geo.translate(x, y, z);
			World.plAttr(geo, (i, p) => mid - p.getZ(i), (i, p) => p.getX(i));
			const m = new T.Mesh(geo, material);
			m.castShadow = this.shadows;
			m.receiveShadow = true;
			return m;
		}

		static materials() {
			if (World.M) return World.M;
			// roślinność (kołysanie – wariant 'wind'); fol – korony drzew i krzewy: atlas kępek liści i igieł (props.foliageAtlas),
			// karty z przezroczystością (alphaTest – także w cieniach), widoczne z obu stron
			// (faktura w szarościach – średnio ok. 0,45 po przeliczeniu z sRGB: kolor materiału ×2,5 zachowuje jasność koron)
			const veg = (color, fol) => {
				const m = patch(new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.82, vertexColors: true }, fol ? { map: NS.props.foliageAtlas(false), alphaTest: 0.42, side: T.DoubleSide } : {})), 'wind');
				if (fol) m.color.multiplyScalar(2.5);
				return m;
			};
			World.G = { trees: NS.props.buildTrees(), grass: NS.props.buildGrass(), people: NS.props.buildPeople() };
			// woda: mapa normalnych z sumy fal, przesuwana w czasie; odbija niebo (mapa otoczenia sceny)
			const normals = canvasTexture('water-normals', 256, 256, (g, w) => {
				const hgt = new Float32Array(w * w);
				for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
					let v = 0, a = 1, f = 4;
					for (let o = 0; o < 4; o++) {
						v += a * Math.sin((x / w) * Math.PI * 2 * f + Math.sin((y / w) * Math.PI * 2 * (f - 1) + o * 1.7) * 1.3 + o) * Math.cos((y / w) * Math.PI * 2 * f + o * 2.1);
						a *= 0.5;
						f *= 2;
					}
					hgt[y * w + x] = v;
				}
				const img = g.createImageData(w, w);
				for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
					const hx = hgt[y * w + ((x + 1) % w)] - hgt[y * w + ((x + w - 1) % w)];
					const hy = hgt[((y + 1) % w) * w + x] - hgt[((y + w - 1) % w) * w + x];
					const nx = -hx * 1.2, ny = -hy * 1.2, l = Math.hypot(nx, ny, 1);
					const i = (y * w + x) * 4;
					img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
					img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
					img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
					img.data[i + 3] = 255;
				}
				g.putImageData(img, 0, 0);
			});
			normals.colorSpace = T.NoColorSpace;
			normals.wrapS = normals.wrapT = T.RepeatWrapping;
			normals.repeat.set(30, 2);
			World.M = {
				terrain: patch(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 'ground'),
				ballast: patch(new T.MeshStandardMaterial({ color: '#8f8c85', roughness: 0.95 }), 'gravel'),
				// podsypka toru z zabrudzeniem w kolorach wierzchołków (World.ballastTint): tor pociągu i tory z mapy
				ballastTrack: patch(new T.MeshStandardMaterial({ color: '#8f8c85', roughness: 0.95, vertexColors: true }), 'gravel'),
				rail: World.railPxMat(matS('#c3c9cf', { metalness: 0.85, roughness: 0.28 })),
				sleeper: matS('#9b988f', { roughness: 0.9, surf: 'concrete' }),
				trough: matS('#a6a39b', { roughness: 0.92, surf: 'concrete' }), // korytka kablowe wzdłuż toru
				clip: matS('#2b2d30', { roughness: 0.6, metalness: 0.5 }),
				railSide: matS('#54402f', { roughness: 0.82, metalness: 0.3 }), // boki szyn: ciemna rdza (jaskrawo pomarańczowe w słońcu wyglądały jak pomalowane)
				grass: patch(new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, vertexColors: true, side: T.DoubleSide }), 'grass'),
				flower: mat('#ffffff'),
				// opadłe liście (jesień): płaski listek z faktury z przezroczystością, kolor z egzemplarza
				litter: patch(new T.MeshStandardMaterial({ map: World.leafTexture(), alphaTest: 0.5, side: T.DoubleSide, roughness: 0.85, color: '#ffffff' }), 'lit'),
				personBody: World.personMat(new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 })),
				personHead: World.personMat(new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.35 })),
				trunkMat: mat('#5a3f2a', { roughness: 0.95 }),
				birchMat: mat('#e9e6df', { roughness: 0.9 }),
				trunk: mat('#5a3f2a'),
				birch: mat('#e9e6df'),
				spruce: veg('#ffffff', true),
				leaf: veg('#ffffff', true),
				bush: veg('#ffffff', true),
				reed: veg('#8a9442'),
				forest: patch(new T.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), 'lit'),
				// woda: fale, Fresnel, odbicie lustrzane (js/3d/water.js)
				water: NS.waterMaterial(),
				normals,
				// latarnie: klosz, poświata, plama światła na ziemi (wspólne dla wszystkich)
				...World.lampMaterials(),
				// okna budynków – nocą świecą
				glass: patch(new T.MeshStandardMaterial({ color: '#a9c4d6', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }), 'clean'),
				litWin: patch(new T.MeshLambertMaterial({ color: '#3d4a57', emissive: 0xffc070, emissiveIntensity: 0 }), 'lit'),
			};
			return World.M;
		}

		/* Pora roku w grafice (sim.opts.season – ustawia scene.reset przed budową świata): kolory koron, trawy i terenu,
		   zimą bezlistne korony, jesienią opadłe liście (na torze gęsto na odcinkach „liście na torze” – leafPatches) */
		seasonTree(kind, rgb, seed) {
			const se = this.season || 'summer', h = hash(seed + 0.61);
			const conifer = kind === 'spruce' || kind === 'pine';
			if (conifer) return se === 'winter' ? [rgb[0] * 0.85, rgb[1] * 0.85, rgb[2] * 0.9] : rgb;
			// jasność egzemplarza (ok. 1) – względem koloru bazowego gatunku
			const sh = (rgb[0] + rgb[1] + rgb[2]) / ({ oak: 0.99, birch: 1.34, poplar: 0.99, bush: 0.92 }[kind] || 1);
			if (se === 'spring') return [rgb[0] * 1.08, rgb[1] * 1.14, rgb[2] * 0.95];
			if (se === 'winter') return [0.25 * sh, 0.21 * sh, 0.18 * sh]; // gałęzie bez liści – szarobrązowa, rzadka korona
			if (se === 'autumn') {
				if (kind === 'birch' || kind === 'poplar') return h < 0.75 ? [0.82 * sh, 0.68 * sh, 0.16 * sh] : [0.62 * sh, 0.58 * sh, 0.2 * sh];
				if (kind === 'bush') return h < 0.45 ? [0.6 * sh, 0.2 * sh, 0.09 * sh] : h < 0.8 ? [0.68 * sh, 0.42 * sh, 0.12 * sh] : [0.36 * sh, 0.4 * sh, 0.16 * sh];
				// dęby, lipy: rdzawe, złote, brązowe, część jeszcze zielona
				return h < 0.32 ? [0.6 * sh, 0.3 * sh, 0.1 * sh] : h < 0.62 ? [0.74 * sh, 0.55 * sh, 0.13 * sh] : h < 0.82 ? [0.44 * sh, 0.31 * sh, 0.14 * sh] : [0.38 * sh, 0.48 * sh, 0.17 * sh];
			}
			// lato: pojedyncze drzewa lekko żółknące
			return h < 0.04 ? [rgb[0] * 1.2, rgb[1] * 1.02, rgb[2] * 0.6] : rgb;
		}
		// zimą korony liściastych mniejsze (bez liści widać tylko gałęzie)
		seasonCrown(kind) { return this.season === 'winter' && kind !== 'spruce' && kind !== 'pine' ? 0.78 : 1; }
		// kolor trawy i terenu wg pory roku (zielenie – jesienią płowe, zimą zgaszone, wiosną świeższe)
		seasonGreen(r, g, b) {
			const se = this.season || 'summer';
			if (se === 'summer' || !(g > r && g > b)) return [r, g, b];
			if (se === 'spring') return [r * 0.96, g * 1.06, b * 0.95];
			const [tr, tg, tb, k] = se === 'autumn' ? [0.48, 0.44, 0.22, 0.45] : [0.43, 0.41, 0.34, 0.62];
			return [r + (tr - r) * k, g + (tg - g) * k, b + (tb - b) * k];
		}
		onLeafPatch(s) { return (this.leafPatches || []).some(([a, b]) => s > a && s < b); }

		// faktura opadłego liścia: owalny listek z nerwem i ogonkiem (biały – kolor z egzemplarza), przezroczyste tło
		static leafTexture() {
			return canvasTexture('leaf-litter', 64, 64, (g, w) => {
				g.clearRect(0, 0, w, w);
				g.fillStyle = '#ffffff';
				g.beginPath();
				g.moveTo(6, 32);
				g.quadraticCurveTo(30, 6, 58, 32);
				g.quadraticCurveTo(30, 58, 6, 32);
				g.fill();
				g.strokeStyle = 'rgba(120,110,90,0.7)';
				g.lineWidth = 2;
				g.beginPath(); g.moveTo(2, 32); g.lineTo(54, 32); g.stroke();
				g.lineWidth = 1;
				for (let x = 14; x < 50; x += 8) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 7, 22); g.moveTo(x, 32); g.lineTo(x + 7, 42); g.stroke(); }
			});
		}

		/* Przygotowanie trasy w krokach (generator): indeks otoczenia trasy rzeczywistej (budynki, drogi, wody,
		   zagospodarowanie – real-env.js) i sieć ulic całej trasy. Ekran wczytywania wykonuje kroki w kolejnych klatkach
		   (main.js prepareWorld) – długie trasy (Poznań – Wrocław: ok. 4,5 s) nie zamrażają strony; setRoute tej samej
		   trasy potem już tylko czyści świat. */
		*setRouteSteps(route) {
			this.prepared = null;
			// kawałki poprzedniej trasy – usuwane krokami (zwalnianie siatek i tekstur dużego świata trwało setki ms)
			this.abortJob();
			if (this.streetLifeReset) this.streetLifeReset();
			let tY = performance.now();
			for (const [c, ch] of [...this.chunks]) {
				this.dropChunk(ch);
				this.chunks.delete(c);
				if (performance.now() - tY > 8) { yield; tY = performance.now(); }
			}
			this.clear();
			this.route = route;
			if (this.envIndexSteps) yield* this.envIndexSteps(route);
			// sieć ulic (ok. 0,4–1,8 s) – przy wczytaniu trasy, nie w pierwszym kroku budowy kawałka (przycięcie)
			if (this.env && this.envStreetsSteps) yield* this.envStreetsSteps();
			if (this.envPortalUniforms) this.envPortalUniforms();
			this.warm = true;
			this.prepared = route;
		}

		setRoute(route) {
			if (this.prepared === route && this.route === route) {
				this.clear();
				this.warm = true;
				return;
			}
			const g = this.setRouteSteps(route);
			while (!g.next().done);
		}

		clear() {
			this.abortJob();
			this.dropTreePool();
			if (this.streetLifeReset) this.streetLifeReset();
			for (const ch of this.chunks.values()) this.dropChunk(ch);
			this.chunks.clear();
			this.zones = [];
		}

		dropChunk(ch) {
			this.scene.remove(ch.group);
			ch.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
			disposeTree(ch.group);
			if (ch.group.userData.ezTrees) this.treePoolDirty = true;
			for (const d of ch.dyn) {
				if (d.ownMat) d.ownMat.dispose();
				if (d.tex) d.tex.dispose();
				if (d.model) d.model.dispose();
				if (d.zone) this.zones = this.zones.filter((z) => z !== d.zone);
			}
		}

		// ---------- funkcje terenu ----------
		/* Obniżenie terenu przy mostach.
		   Trasa z gry: dolina rzeki (10 m) albo obniżenie pod wiaduktem (6,5 m) wzdłuż toru.
		   Trasa rzeczywista: wiadukt nad drogą lub torami – wykop wzdłuż obiektu pod mostem (kierunek i szerokość
		   z mapy, bridgeCorridor): pod przęsłem pełna głębokość, skarpy 1:1,5, wzdłuż drogi/toru powrót do poziomu
		   terenu na ok. 90 m; obok (stacje, bocznice, zabudowa) teren na swoim poziomie. Most nad rzeką – dolina
		   w pasie przy torze. Poza przęsłem tor na koronie nasypu (do skrajnego toru głównego), chyba że full
		   (tory i drogi przechodzące pod torem schodzą razem z terenem). */
		dip(s, dd, full) {
			let d = 0;
			for (const b of this.dipBridges(s)) {
				const via = b.kind === 'viaduct', D0 = via ? 6.5 : 10;
				// głębokość: z pomiaru terenu (NMT) albo typowa (wiadukt 6,5 m, dolina rzeki 10 m)
				const D = this.env && this.bridgeDepth ? this.bridgeDepth(b, D0) : D0;
				if (!this.env) {
					const ext = via ? 22 : 30;
					const t = Math.min(s - (b.from - ext), b.to + ext - s);
					if (t > 0) d = Math.max(d, D * smoothstep(0, via ? Math.min(30, (b.to - b.from) / 2 + ext) : 45, t));
					continue;
				}
				const sp = this.bridgeSpan(b), out = Math.max(sp[0] - s, s - sp[1], 0);
				let v = 0;
				if (via) {
					const c = this.bridgeCorridor ? this.bridgeCorridor(b) : null;
					if (!c) continue;
					const ds = s - c.s, dl = dd === undefined ? 0 : dd;
					if (c.paths) {
						// wykop wzdłuż torów przechodzących pod mostem (punkty co 1,5 m z głębokością)
						const W = c.paths.hw;
						for (let k = Math.floor((s - 14) / 8); k <= Math.floor((s + 14) / 8); k++) {
							for (const p of c.paths.buckets.get(k) || []) {
								const e = Math.hypot(s - p[0], dl - p[1]), sl = W + 1.5 * p[2] + 0.3;
								if (e < sl) v = Math.max(v, p[2] * (1 - smoothstep(W, sl, e)));
							}
						}
						// drogi pod tym samym przęsłem: prosty wykop na pełną głębokość pod mostem, dalej powrót do terenu
						for (const rc of c.roads || []) {
							const rs = s - rc.s, t = rs * rc.ca + dl * rc.sa, q = Math.abs(rs * rc.sa - dl * rc.ca);
							if (q > rc.hw + 1.5 * D + 0.3 || Math.abs(t) > 104) continue;
							const depth = D * (1 - smoothstep(0, 90, Math.max(0, Math.abs(t) - 14)));
							v = Math.max(v, depth * (1 - smoothstep(rc.hw, rc.hw + 1.5 * depth + 0.3, q)));
						}
					} else {
						const t = ds * c.ca + dl * c.sa, q = Math.abs(ds * c.sa - dl * c.ca); // wzdłuż i w poprzek wykopu
						if (t > (c.t1 || 14) + 100 || t < (c.t0 || -14) - 100 || q > c.hw + 12) continue;
						// pełna głębokość wzdłuż całego przejścia pod mostami (naszym i torów obok), dalej powrót do terenu
						const outT = Math.max(0, t - (c.t1 !== undefined ? c.t1 : 14), (c.t0 !== undefined ? c.t0 : -14) - t);
						const depth = D * (1 - smoothstep(0, 90, outT));
						v = depth * (1 - smoothstep(c.hw, c.hw + 1.5 * depth + 0.3, q));
					}
				} else {
					// most nad wodą na trasie z pomiarem NMT (bez mostów – prawdziwe dno doliny i koryto): bez sztucznej doliny;
					// dawniej wykop na głębokość najgłębszego miejsca wzdłuż całego obiektu – długi most (np. przez Wisłę)
					// kopał 10+ m dół także pod lądowym końcem z ulicami i budynkami (Toruń Miasto)
					if (this.env && this.env.dem && this.env.dem.lidar) continue;
					if (out > 50) continue;
					v = D * (1 - smoothstep(0, 50, out)) * (dd === undefined ? 1 : 1 - smoothstep(30, 70, Math.abs(dd)));
				}
				// poza przęsłem tor pociągu na koronie nasypu
				if (v > 0 && out > 0 && !full && dd !== undefined && !(this.envUnderBridge && this.envUnderBridge(s, dd))) {
					const sh = this.bridgeShoulder(b, dd);
					v *= smoothstep(sh, sh + 1.5 * v + 0.3, Math.abs(dd));
				}
				d = Math.max(d, v);
			}
			return d;
		}

		/* Mosty, których obniżenie terenu (dip) może sięgać s – kubełki co 50 m. dip liczy się dziesiątki tysięcy razy
		   na kawałek (każdy punkt terenu) – dawniej za każdym razem po wszystkich mostach trasy. Zasięg z tych samych
		   warunków co w dip (zapas), poza nim dip dałby 0. */
		dipBridges(s) {
			let ix = this.dipIdx;
			if (!ix || ix.route !== this.route || ix.env !== this.env) {
				ix = this.dipIdx = { route: this.route, env: this.env, map: new Map() };
				for (const b of this.route.bridges) {
					const r = this.dipRange(b);
					if (!r) continue;
					for (let k = Math.floor(r[0] / 50); k <= Math.floor(r[1] / 50); k++) {
						if (!ix.map.has(k)) ix.map.set(k, []);
						ix.map.get(k).push(b);
					}
				}
			}
			return ix.map.get(Math.floor(s / 50)) || NO_BRIDGES;
		}

		// zakres s, w którym dip mostu b może być niezerowy (null – nigdzie)
		dipRange(b) {
			const via = b.kind === 'viaduct', D0 = via ? 6.5 : 10;
			if (!this.env) { const ext = via ? 22 : 30; return [b.from - ext, b.to + ext]; }
			if (!via) {
				if (this.env.dem && this.env.dem.lidar) return null;
				const sp = this.bridgeSpan(b);
				return [sp[0] - 50, sp[1] + 50];
			}
			const c = this.bridgeCorridor ? this.bridgeCorridor(b) : null;
			if (!c) return null;
			const D = this.bridgeDepth ? this.bridgeDepth(b, D0) : D0;
			if (c.paths) {
				// punkty wykopu brane z kubełków ±14 m (po 8 m) – zasięg do ok. 22 m od punktu
				let lo = Infinity, hi = -Infinity;
				for (const pts of c.paths.buckets.values()) for (const p of pts) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }
				lo -= 30;
				hi += 30;
				// drogi: |t| ≤ 104, odległość w poprzek ≤ hw + 1,5·D (s – s drogi = t·ca + q·sa)
				for (const rc of c.roads || []) { const e = 104 + rc.hw + 1.5 * D + 1; lo = Math.min(lo, rc.s - e); hi = Math.max(hi, rc.s + e); }
				return lo <= hi ? [lo, hi] : null;
			}
			const e = Math.max(14, Math.abs(c.t0 || 0), Math.abs(c.t1 || 0)) + 100 + c.hw + 13;
			return [c.s - e, c.s + e];
		}

		// tor równoległy na koronie nasypu na odcinku przęsła – też na moście (w danych bywa bez oznaczenia mostu)
		onBridgeSpan(s, d) {
			for (const b of this.route.bridges) { const sp = this.bridgeSpan(b); if (s >= sp[0] - 1 && s <= sp[1] + 1 && Math.abs(d) <= this.bridgeShoulder(b, d)) return true; }
			return false;
		}

		// przęsło mostu w grze: z danych, rozszerzone tak, by obejmowało miejsce, w którym obiekt pod spodem (wykop)
		// przecina oś toru (przy ukośnym przecięciu dane bywają przesunięte o kilka metrów)
		bridgeSpan(b) {
			if (!this.spans) this.spans = new Map();
			let sp = this.spans.get(b);
			if (!sp) {
				sp = [b.from, b.to];
				const c = this.env && b.kind === 'viaduct' && this.bridgeCorridor ? this.bridgeCorridor(b) : null;
				if (c) {
					/* przęsło nad całym dnem wykopu (jezdnia z chodnikami): przyczółek (w poprzek toru do skraju korony nasypu)
					   0,4 m za skrajem dna przy ulicy ukośnej do toru – wzdłuż toru dalej o skos; najwyżej 30 m od środka.
					   Dawniej zawsze ±8 m (albo przęsło z danych) – nasyp toru za krótkim przęsłem zachodził na ulicę */
					const D = Math.max(this.bridgeShoulder(b, -1), this.bridgeShoulder(b, 1)) + 0.6;
					const need = c.ca === 0 && c.sa === 1 ? 8 : Math.min(30, Math.max(8, (c.hw + 0.4 + D * Math.abs(c.ca)) / Math.max(0.35, Math.abs(c.sa))));
					sp[0] = Math.min(sp[0], c.s - need);
					sp[1] = Math.max(sp[1], c.s + need);
				}
				this.spans.set(b, sp);
			}
			return sp;
		}

		// korona nasypu przy moście po stronie d: 4,2 m albo za skrajnym torem głównym z mapy (do 12 m od osi)
		bridgeShoulder(b, dd) {
			if (!this.shoulders) this.shoulders = new Map();
			let sh = this.shoulders.get(b);
			if (!sh) {
				sh = { l: 4.2, r: 4.2 };
				for (const t of this.envTracksAt ? this.envTracksAt((b.from + b.to) / 2) : []) {
					if (t.side & 5) continue;
					if (t.d > 0 && t.d < 12) sh.r = Math.max(sh.r, t.d + 2.6);
					if (t.d < 0 && t.d > -12) sh.l = Math.max(sh.l, -t.d + 2.6);
				}
				this.shoulders.set(b, sh);
			}
			return dd < 0 ? sh.l : sh.r;
		}

		// odległość od skraju torowiska (przy dwóch torach lewa strona liczy się od drugiego toru)
		eff(d) {
			return this.route.double && d < 0 ? Math.max(0, -d + SECOND) : Math.abs(d);
		}

		flat(s, d) {
			let f = 0;
			for (const st of this.route.stations) {
				const big = st.type !== 'halt';
				const ext = big ? 170 : 100;
				if (s < st.platformStart - ext || s > st.platformEnd + ext) continue;
				const ws = smoothstep(st.platformStart - ext, st.platformStart - ext + 55, s) * (1 - smoothstep(st.platformEnd + ext - 55, st.platformEnd + ext, s));
				// pomiar terenu (NMT): tylko torowisko stacji z peronami – do skraju korony po danej stronie (envShoulder) + 1 m,
				// zanik na 6 m; dawniej 24–44 m, a na stacji w wykopie teren obok spłaszczony do poziomu toru zostawiał ulicę na
				// skraju wykopu na „murku” (Toruń Miasto, peron po drugiej stronie)
				const shE = this.env && this.env.dem && this.env.dem.lidar && this.envShoulder ? this.envShoulder(s) : null;
				const wd = shE
					? 1 - smoothstep((d >= 0 ? shE.r : shE.l) + 1, (d >= 0 ? shE.r : shE.l) + 7, Math.abs(d))
					: this.env
					? (d >= 0 ? 1 - smoothstep(24, 44, d) : 1 - smoothstep(18, 34, -d))
					: d >= 0 ? 1 - smoothstep(big ? 200 : 125, big ? 240 : 155, d) : 1 - smoothstep(big ? 28 : 16, big ? 48 : 32, -d);
				f = Math.max(f, ws * wd);
			}
			for (const c of this.route.crossings) {
				const a = Math.abs(s - c.pos);
				// trasa rzeczywista: tylko przy torze (droga przez przejazd idzie po terenie z pomiaru) – dawniej pas 90 m
				// spłaszczony do poziomu toru w poprzek całej mapy (na pagórkach uskoki terenu po kilkanaście metrów)
				if (a < 45) f = Math.max(f, (1 - smoothstep(12, 45, a)) * (this.env ? 1 - smoothstep(14, 34, Math.abs(d)) : 1));
			}
			return f;
		}

		terrainY(s, d) {
			if (this.env && this.env.dem) return this.demTerrainY(s, d); // trasa rzeczywista z ukształtowaniem terenu
			const h = R.heightAt(this.route, s);
			const ad = this.eff(d);
			const k = smoothstep(6, 75, ad) * (1 - this.flat(s, d));
			let rough = (vnoise(s * 0.006 + 11, d * 0.008 + 3) - 0.5) * 26 + (vnoise(s * 0.03, d * 0.03 + 7) - 0.5) * 3;
			// trasa rzeczywista: teren prawie płaski (miasto, budynki z mapy); pod wodą obniżony
			if (this.env) rough = rough * 0.12 - (this.areaAt(s, d) === 9 && ad > 10 ? 1.1 : 0);
			const fl = this.flat(s, d), dp = this.dip(s, d);
			// rów odwadniający wzdłuż nasypu
			const ditch = ad > 4.6 && ad < 9 && dp < 0.5 ? 0.75 * Math.exp(-Math.pow((ad - 6.4) / 1.1, 2)) * (1 - fl) : 0;
			return h - 0.95 + rough * k - dp - ditch;
		}

		// pola uprawne: prostokąty w układzie (kilometraż, odsunięcie)
		field(s, d) {
			if (this.env) return null; // trasa rzeczywista: pola z mapy (raster zagospodarowania)
			const ad = Math.abs(d);
			if (ad < 30 || this.flat(s, d) > 0.2) return null;
			const fs = Math.floor(s / 110), fd = Math.floor(d / 80);
			if (hash(fs * 7.13 + fd * 3.71) <= 0.55) return null;
			const es = s - fs * 110, ed = d - fd * 80;
			return { kind: hash(fs * 1.9 + fd * 5.3), rowsX: hash(fs * 3.3 + fd * 1.1) < 0.5, border: Math.min(es, 110 - es, ed, 80 - ed) < 3.5 };
		}

		// piasek: brzegi rzek pod mostami i piaszczyste płaty na wzgórzach (z dala od toru)
		sandK(s, d) {
			const dp = this.dip(s);
			let k = dp > 1.5 ? smoothstep(1.5, 4, dp) : 0;
			const ad = this.eff(d);
			// (na trasach z mapy zagospodarowanie terenu zna mapa – bez losowych płatów piasku na łąkach i placach)
			if (!this.env && ad > 40 && this.flat(s, d) < 0.2) k = Math.max(k, smoothstep(0.7, 0.8, vnoise(s * 0.004 + 21, d * 0.006 + 4)));
			return k;
		}

		/* materiał terenu dla shadera: [trawa, piasek, ziemia uprawna] i udział [lasu, pola, terenu kolejowego] (aLand –
		   wybór tekstury gruntu: ściółka, ziemia orna, żwir) */
		terrainMat(s, d) {
			if (this.env) return this.eff(d) < 6 ? [1, 0, 0] : this.envTerrainMat(s, d);
			const f = this.field(s, d);
			if (f && !f.border) return [0, 0, 1, 0, 1, 0];
			const k = this.sandK(s, d);
			return [1 - k, k, 0];
		}

		rowWeights(s, d) {
			const f = this.field(s, d);
			if (!f || f.border) return [0, 0];
			return f.rowsX ? [1, 0] : [0, 1];
		}

		terrainColor(s, d, y) {
			const ad = this.eff(d);
			const n = vnoise(s * 0.02, d * 0.02);
			let r = 0.34 + 0.1 * n, g = 0.46 + 0.08 * n, b = 0.22 + 0.04 * n;
			const f = this.field(s, d);
			if (this.env && ad >= 6) [r, g, b] = this.envTerrainColor(s, d);
			if (f && f.border) { r = 0.33; g = 0.5; b = 0.22; } // miedza
			else if (f) {
				if (f.kind < 0.3) { r = 0.84; g = 0.73; b = 0.38; } // zboże
				else if (f.kind < 0.5) { r = 0.55; g = 0.42; b = 0.29; } // zaorane
				else if (f.kind < 0.62) { r = 0.86; g = 0.8; b = 0.3; } // rzepak
				else { r = 0.5; g = 0.66; b = 0.27; } // uprawa
			}
			const sk = f && !f.border ? 0 : this.sandK(s, d);
			if (sk > 0) { r += (0.8 - r) * sk; g += (0.7 - g) * sk; b += (0.5 - b) * sk; }
			if (ad < 4.7) { r = 0.5; g = 0.46; b = 0.4; }
			else if (ad < 9 && this.dip(s, d) < 0.5) {
				const w = Math.exp(-Math.pow((ad - 6.4) / 1.2, 2));
				r -= 0.06 * w; g -= 0.02 * w; b -= 0.04 * w;
			}
			const h = R.heightAt(this.route, s);
			if (this.dip(s, d) > 3 && y < h - 7.5) { r = 0.42; g = 0.4; b = 0.3; }
			// pola po żniwach i zimą: ściernisko / zaorane
			if (f && !f.border && (this.season === 'autumn' || this.season === 'winter') && (f.kind < 0.3 || (f.kind >= 0.5 && f.kind < 0.62))) {
				if (this.season === 'autumn') { r = 0.7; g = 0.62; b = 0.4; } else { r = 0.5; g = 0.43; b = 0.34; }
			}
			[r, g, b] = this.seasonGreen(r, g, b);
			tmpColor.setRGB(r, g, b, T.SRGBColorSpace);
			return tmpColor;
		}

		// wstęga wzdłuż toru: kolumny d (odsunięcia), wiersze co ds metrów
		// shiftFn(s) – przesunięcie całej wstęgi w bok (rozjazdy, bocznice); yfn dostaje też odsunięcie względne
		ribbon(s0, s1, ds, cols, yfn, colorFn, rowFn, shiftFn, matFn) {
			const g = this.ribbonRows(s0, s1, ds, cols, yfn, colorFn, rowFn, shiftFn, matFn);
			let r;
			while (!(r = g.next()).done);
			return r.value;
		}

		// ribbon krokami (wiersz na krok) – siatka terenu kawałka to kilka tysięcy węzłów (budowa w kilku klatkach)
		// ds – krok wierszy (m) albo lista kilometraży wierszy (rosnąco, np. z dodatkowymi przy portalach tuneli)
		*ribbonRows(s0, s1, ds, cols, yfn, colorFn, rowFn, shiftFn, matFn) {
			const sList = Array.isArray(ds) ? ds : null;
			const rows = sList ? sList.length : Math.max(2, Math.ceil((s1 - s0) / ds) + 1);
			const pos = new Float32Array(rows * cols.length * 3);
			const col = colorFn ? new Float32Array(rows * cols.length * 3) : null;
			const rowA = rowFn ? new Float32Array(rows * cols.length * 2) : null;
			const matA = matFn ? new Float32Array(rows * cols.length * 3) : null;
			// aLand – udział lasu, pola uprawnego i terenu kolejowego / przemysłowego (tekstury gruntu, nodes.js groundPattern)
			const landA = matFn ? new Float32Array(rows * cols.length * 3) : null;
			let k = 0;
			for (let i = 0; i < rows; i++) {
				const s = sList ? sList[i] : Math.min(s1, s0 + i * ds);
				R.trackPoint(this.route, s, tp);
				const cx = Math.cos(tp.heading), cz = Math.sin(tp.heading);
				const sh = shiftFn ? shiftFn(s) : 0;
				for (const rel of cols) {
					const d = rel + sh;
					const y = yfn(s, d, tp.y, rel);
					pos[k] = tp.x + cx * d;
					pos[k + 1] = y;
					pos[k + 2] = tp.z + cz * d;
					if (col) {
						const c = colorFn(s, d, y);
						col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
					}
					if (matA) {
						const m = matFn(s, d);
						matA[k] = m[0]; matA[k + 1] = m[1]; matA[k + 2] = m[2];
						landA[k] = m[3] || 0; landA[k + 1] = m[4] || 0; landA[k + 2] = m[5] || 0;
					}
					if (rowA) {
						const w = rowFn(s, d);
						rowA[(k / 3) * 2] = w[0];
						rowA[(k / 3) * 2 + 1] = w[1];
					}
					k += 3;
				}
				yield;
			}
			const idx = [];
			const n = cols.length;
			for (let i = 0; i < rows - 1; i++) {
				for (let j = 0; j < n - 1; j++) {
					const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
					idx.push(a, b, c, b, d, c);
				}
			}
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.BufferAttribute(pos, 3));
			if (col) geo.setAttribute('color', new T.BufferAttribute(col, 3));
			if (rowA) geo.setAttribute('aRow', new T.BufferAttribute(rowA, 2));
			if (matA) geo.setAttribute('aMat', new T.BufferAttribute(matA, 3));
			if (landA) geo.setAttribute('aLand', new T.BufferAttribute(landA, 3));
			geo.setIndex(idx);
			geo.computeVertexNormals();
			return geo;
		}

		// ustawia obiekt na torze: s – kilometraż, d – odsunięcie w prawo, lokalne −z = kierunek jazdy
		place(obj, s, d, dy) {
			R.sidePoint(this.route, s, d, tp);
			obj.position.set(tp.x, tp.y + (dy || 0), tp.z);
			obj.rotation.y = -tp.heading;
			return obj;
		}

		// rzut punktu świata (x, z) na oś toru: kilometraż s i odsunięcie d (w prawo); hint – przybliżone s
		/* Węzeł siatki terenu daleko od osi (siatka sięga 600 m w bok), bliżej innego miejsca trasy (zakręt, pętla) niż
		   własnego toru: nie wyżej niż teren tamtego miejsca, przy nim 0,25 m pod spodem. Dawniej surowy pomiar z cudzej
		   siatki przykrywał tam wykop i wyrównaną stację – gładka płyta nad torami (Szklarska Poręba Górna, km 17,3). */
		foldY(s, d, y) {
			const p = this.foldOther(s, d);
			return p ? Math.min(y, this.terrainY(p.s, p.d) - 0.25 * (1 - smoothstep(50, 80, Math.abs(p.d)))) : y;
		}

		// punkt (s, d) bliżej innego miejsca trasy (do 80 m) niż własnego toru – położenie względem tamtego toru, inaczej null
		foldOther(s, d) {
			const ad = Math.abs(d);
			if (ad < 20) return null;
			const r = this.route, G = 64;
			let F = r._fold;
			if (!F) {
				F = r._fold = { cells: new Map() };
				for (let ss = 0; ss <= r.length; ss += 8) {
					R.trackPoint(r, ss, ftp);
					const k = Math.floor(ftp.x / G) + ',' + Math.floor(ftp.z / G);
					let a = F.cells.get(k);
					if (!a) F.cells.set(k, (a = []));
					a.push(ss, ftp.x, ftp.z);
				}
			}
			R.trackPoint(r, s, ftp);
			const x = ftp.x + Math.cos(ftp.heading) * d, z = ftp.z + Math.sin(ftp.heading) * d;
			const cx = Math.floor(x / G), cz = Math.floor(z / G);
			let best = Math.min(ad - 0.5, 80), bs = null;
			for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) {
				const a = F.cells.get(i + ',' + j);
				if (a) for (let q = 0; q < a.length; q += 3) {
					if (Math.abs(a[q] - s) < 30) continue;
					const e = Math.hypot(a[q + 1] - x, a[q + 2] - z);
					if (e < best) { best = e; bs = a[q]; }
				}
			}
			if (bs === null) return null;
			// rzut na tor (jak toTrack, z własnym punktem – wspólny tp trzyma położenie węzła siatki i drzewa u wywołującego)
			let ps = bs;
			for (let k = 0; k < 6; k++) {
				R.trackPoint(r, ps, ftp);
				const ds = (x - ftp.x) * Math.sin(ftp.heading) - (z - ftp.z) * Math.cos(ftp.heading);
				ps += ds;
				if (Math.abs(ds) < 0.02) break;
			}
			R.trackPoint(r, ps, ftp);
			const p = { s: ps, d: (x - ftp.x) * Math.cos(ftp.heading) + (z - ftp.z) * Math.sin(ftp.heading) };
			const ap = Math.abs(p.d);
			if (Math.abs(p.s - s) < 30 || ap >= ad || ap > 80 || p.s < 0 || p.s > r.length) return null;
			return p;
		}

		/* miejsce na koronę w (s, d): odległość od skraju torowiska naszej linii, od torów z mapy (2,5 m od osi) i od toru tej
		   samej trasy w innym miejscu (zakręt, pętla – foldOther). Korony drzew, krzaki i masy lasu nie wchodzą nad tory –
		   dawniej korony z pomiaru (promień do ok. 10 m, pień od 11 m od osi) przykrywały tor, a na zakrętach drzewa
		   kawałka rosły na torze z innego miejsca trasy. */
		crownRoom(s, d) {
			let room;
			if (this.env && this.envShoulder) {
				const sh = this.envShoulder(s);
				room = d >= 0 ? d - sh.r : -d - sh.l;
				for (const t of this.envTracksAt(s)) room = Math.min(room, Math.abs(t.d - d) - 2.5);
			} else room = this.eff(d) - 3;
			const p = this.foldOther(s, d);
			if (p) room = Math.min(room, this.eff(p.d) - 3.5);
			return room - 0.5;
		}

		/* trójkąty siatki terenu (wiersze ss, kolumny cols) z węzłem przy innym miejscu trasy (foldOther) – osobno, po jednej
		   siatce na kawałek tamtego miejsca: rysowane tylko bez niego (updateLod), z nim – jego dokładny teren z wykopem
		   i stacją (jedna siatka na kilka kawałków na skraju wczytanych przykrywała tor ostatniego wczytanego). Wynik: lista
		   { geo, c } albo null (geo – bez tych trójkątów) */
		foldSplit(geo, ss, cols) {
			const n = cols.length, fc = new Int32Array(ss.length * n).fill(-1e9);
			let any = false;
			for (let i = 0; i < ss.length; i++) for (let j = 0; j < n; j++) {
				const p = this.foldOther(ss[i], cols[j]);
				if (!p) continue;
				fc[i * n + j] = Math.floor(p.s / C);
				any = true;
			}
			if (!any) return null;
			const idx = geo.index.array, keep = [], out = new Map();
			for (let t = 0; t < idx.length; t += 3) {
				let c = -1e9;
				for (let q = 0; q < 3; q++) c = Math.max(c, fc[idx[t + q]]);
				const L = c > -1e9 ? out.get(c) || (out.set(c, []), out.get(c)) : keep;
				L.push(idx[t], idx[t + 1], idx[t + 2]);
			}
			const list = [];
			for (const [c, L] of out) {
				const g2 = geo.clone();
				g2.setIndex(L);
				list.push({ geo: g2, c });
			}
			geo.setIndex(keep);
			return list;
		}

		toTrack(x, z, hint) {
			const r = this.route;
			let s = hint;
			for (let k = 0; k < 6; k++) {
				R.trackPoint(r, s, tp);
				const ds = (x - tp.x) * Math.sin(tp.heading) - (z - tp.z) * Math.cos(tp.heading);
				s += ds;
				if (Math.abs(ds) < 0.02) break;
			}
			R.trackPoint(r, s, tp);
			return { s, d: (x - tp.x) * Math.cos(tp.heading) + (z - tp.z) * Math.sin(tp.heading) };
		}

		/* Obiekt zbudowany w układzie lokalnym toru (x – w prawo, y – nad główką szyny, z – wstecz; środek w s = mid)
		   wygięty wzdłuż osi toru: długie bryły (perony, krawędzie, przęsła) wierzchołek po wierzchołku, krótkie
		   elementy w całości – w miejscu łuku odpowiadającym ich środkowi, z wysokością toru w tym miejscu
		   (userData.rigid – zawsze w całości). keep – obiekty zostawione bez zmian (np. pasażerowie, liczeni co klatkę). */
		bendGroup(g, mid, keep) {
			const r = this.route;
			g.position.set(0, 0, 0);
			g.rotation.set(0, 0, 0);
			g.scale.set(1, 1, 1);
			g.updateMatrixWorld(true);
			const F = new T.Matrix4(), Tz = new T.Matrix4(), M = new T.Matrix4(), Mi = new T.Matrix4(), bb = new T.Box3();
			const frame = (s) => {
				R.trackPoint(r, s, tp);
				F.makeRotationY(-tp.heading);
				F.setPosition(tp.x, tp.y, tp.z);
				return F;
			};
			const reparent = (obj, m) => {
				if (obj.parent) obj.parent.remove(obj);
				m.decompose(obj.position, obj.quaternion, obj.scale);
				obj.matrixAutoUpdate = true;
				g.add(obj);
			};
			const rigid = (obj, cz) => {
				M.multiplyMatrices(frame(mid - cz), Tz.makeTranslation(0, 0, -cz)).multiply(obj.matrixWorld);
				reparent(obj, M.clone());
			};
			const v = new T.Vector3(), nrm = new T.Vector3();
			const bendMesh = (mesh, ext) => {
				let geo = mesh.geometry;
				if (geo.type === 'BoxGeometry') {
					const p = geo.parameters;
					geo = new T.BoxGeometry(p.width, p.height, p.depth, 1, 1, Math.max(1, Math.ceil(ext / 3)));
				} else geo = geo.clone();
				geo.applyMatrix4(mesh.matrixWorld);
				const pos = geo.attributes.position, nor = geo.attributes.normal;
				for (let i = 0; i < pos.count; i++) {
					v.fromBufferAttribute(pos, i);
					R.sidePoint(r, mid - v.z, v.x, tp);
					pos.setXYZ(i, tp.x, tp.y + v.y, tp.z);
					if (nor) {
						nrm.fromBufferAttribute(nor, i);
						const c = Math.cos(-tp.heading), sn = Math.sin(-tp.heading);
						nor.setXYZ(i, nrm.x * c + nrm.z * sn, nrm.y, -nrm.x * sn + nrm.z * c);
					}
				}
				pos.needsUpdate = true;
				geo.computeBoundingBox();
				geo.computeBoundingSphere();
				geo.userData.shared = false;
				mesh.geometry = geo;
				reparent(mesh, new T.Matrix4());
			};
			const process = (obj) => {
				if (keep && keep.has(obj)) return;
				bb.makeEmpty();
				bb.setFromObject(obj);
				const ext = bb.isEmpty() ? 0 : bb.max.z - bb.min.z;
				const cz = bb.isEmpty() ? obj.matrixWorld.elements[14] : (bb.min.z + bb.max.z) / 2;
				if (ext <= 40 || obj.userData.rigid || obj.isSprite) return rigid(obj, cz);
				if (obj.isInstancedMesh) {
					for (let i = 0; i < obj.count; i++) {
						obj.getMatrixAt(i, Mi);
						Mi.premultiply(obj.matrixWorld);
						const z = Mi.elements[14];
						M.multiplyMatrices(frame(mid - z), Tz.makeTranslation(0, 0, -z)).multiply(Mi);
						obj.setMatrixAt(i, M);
					}
					obj.instanceMatrix.needsUpdate = true;
					obj.computeBoundingSphere();
					return reparent(obj, new T.Matrix4());
				}
				if (obj.isMesh) return bendMesh(obj, ext);
				if (obj.children.length) {
					for (const ch of [...obj.children]) process(ch);
					if (obj.parent) obj.parent.remove(obj);
					return;
				}
				rigid(obj, cz);
			};
			for (const ch of [...g.children]) process(ch);
			g.updateMatrixWorld(true);
		}

		/* Zaspy (zima): bryły śniegu z pasów – każdy pas to łamana w świecie (punkty { x, y, z, nx, nz } – podstawa
		   i kierunek w poprzek) z przekrojem prof ([odsunięcie w m, wysokość 0…1]) i wysokością H w punkcie. Atrybut aDrift
		   (wysokość nad podstawą): shader obniża bryłę pod ziemię, gdy pokrywy śnieżnej mało (uSnow) – zaspy rosną i topnieją
		   razem z pokrywą. */
		/* Główki szyn nie węższe niż ok. 1 piksel: w oddali (ułamek piksela) szyna rwała się w przerywaną, migoczącą linię.
		   Wierzchołki przesuwane na boki (atrybut aRail – kierunek w poprzek szyny × strona, World.railAttr) o tyle, by
		   połowa szerokości była co najmniej pół piksela z odległości od kamery rysującej przebieg (mapy cieni – kamera
		   ortograficzna – bez poszerzania), najwyżej 0,12 m; uRailPxK – rozmiar piksela na metr odległości (scene.js). */
		static railPxMat(m) {
			// własny materiał przy scalaniu kawałka (mergeStatic) – nie wspólny z kolorem w wierzchołkach (bez poszerzania)
			m.userData.plain = false;
			if (NS.gpu) { const g = NS.nodes.extend(m, NS.nodes.railHooks(World.RAIL_U)); g.userData.plain = false; return g; }
			const prev = m.onBeforeCompile;
			m.onBeforeCompile = (sh, r) => {
				prev(sh, r);
				sh.uniforms.uRailPxK = World.RAIL_U.uRailPxK;
				sh.vertexShader = sh.vertexShader
					.replace('#include <common>', '#include <common>\nattribute vec3 aRail;\nuniform float uRailPxK;')
					.replace('#include <begin_vertex>', `#include <begin_vertex>
					{ vec3 wpR = (modelMatrix * vec4(transformed, 1.0)).xyz; transformed += aRail * (isOrthographic ? 0.0 : clamp(0.5 * uRailPxK * distance(cameraPosition, wpR) - 0.036, 0.0, 0.12)); }`);
			};
			const key = m.customProgramCacheKey();
			m.customProgramCacheKey = () => key + '-railpx';
			return m;
		}
		/* Korytka kablowe (betonowe, 0,36 × 0,14 m, płyty co 1 m z łączeniem) po prawej stronie toru przy skraju podsypki
		   (3,85 m od osi). Bez nich: na mostach i w tunelach (z zapasem), przy przejazdach, peronach stacji, przy innych
		   torach, drogach i zabudowie (trasa z mapy) oraz tam, gdzie teren odbiega od podstawy torowiska ponad 0,6 m (wysoki
		   nasyp, wykop – korytka na skarpie wyglądały jak zawieszone). Drobny detal – z daleka niewidoczne (userData.fine). */
		buildCableTrough(group, s0, s1) {
			const r = this.route, D = 3.85, M = World.materials();
			const near = (s, list, a, b, m) => list.some((x) => s > a(x) - m && s < b(x) + m);
			const ok = (s) => {
				if (near(s, r.bridges || [], (b) => b.from, (b) => b.to, 8) || near(s, r.tunnels || [], (t) => t.from, (t) => t.to, 12)) return false;
				if ((r.crossings || []).some((c) => Math.abs((c.pos !== undefined ? c.pos : c) - s) < 14)) return false;
				if (near(s, r.stations || [], (st) => st.platformStart, (st) => st.platformEnd, 15)) return false;
				if (this.env && (this.envTrackGap(s, D) < 2.6 || this.envOccupied(s, D, 0.4))) return false;
				const base = R.heightAt(r, s) - 1.0;
				return Math.abs(this.terrainY(s, D) - base) < 0.6;
			};
			const list = [];
			for (let s = Math.ceil(s0); s + 1 <= s1; s += 1) if (ok(s + 0.5)) list.push(s + 0.5);
			if (!list.length) return;
			const mesh = new T.InstancedMesh(GEO.box, M.trough, list.length);
			const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(0.36, 0.14, 0.97), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
			list.forEach((s, i) => {
				R.sidePoint(r, s, D, tp);
				q.setFromAxisAngle(up, -tp.heading); // (jak podkłady: x w poprzek, z wzdłuż toru)
				m4.compose(p3.set(tp.x, this.terrainY(s, D) + 0.05, tp.z), q, sc);
				mesh.setMatrixAt(i, m4);
			});
			mesh.receiveShadow = true;
			mesh.userData.fine = true;
			group.add(mesh);
		}
		/* odcień podsypki w odległości o (m) od osi toru: między szynami ciemniejsza, zatłuszczona (smar, pył z wagonów),
		   przy szynach rdzawa (pył z hamulców i szyn), na ramionach i skarpach czysta; c – wynik (T.Color) */
		static ballastTint(o, c) {
			const a = Math.abs(o);
			if (a < 0.55) return c.setRGB(0.6, 0.55, 0.49);
			if (a < 0.95) return c.setRGB(0.64, 0.5, 0.39);
			const t = Math.min(1, (a - 0.95) / 0.8);
			return c.setRGB(0.64 + 0.36 * t, 0.5 + 0.5 * t, 0.39 + 0.61 * t);
		}
		/* atrybut aRail dla wstęgi szyny (ribbon: wiersze po n kolumn w poprzek, od lewej): kierunek od pierwszej do
		   ostatniej kolumny (w poziomie) × strona kolumny (lewa połowa −1, prawa +1) */
		static railAttr(geo, n) {
			const p = geo.attributes.position.array, rows = p.length / 3 / n, a = new Float32Array(p.length);
			for (let i = 0; i < rows; i++) {
				const l = i * n * 3, r = (i * n + n - 1) * 3;
				let dx = p[r] - p[l], dz = p[r + 2] - p[l + 2];
				const len = Math.hypot(dx, dz) || 1;
				dx /= len; dz /= len;
				for (let j = 0; j < n; j++) {
					const sd = j < n / 2 ? -1 : 1, k = (i * n + j) * 3;
					a[k] = dx * sd; a[k + 2] = dz * sd;
				}
			}
			geo.setAttribute('aRail', new T.Float32BufferAttribute(a, 3));
			return geo;
		}
		static driftMat() {
			if (World.driftM) return World.driftM;
			const m = NS.util.patch(new T.MeshStandardMaterial({ color: '#eef2f8', roughness: 0.78 }), 'lit');
			if (NS.gpu) return (World.driftM = NS.nodes.extend(m, NS.nodes.driftHooks()));
			const prev = m.onBeforeCompile;
			m.onBeforeCompile = (sh, r) => {
				prev(sh, r);
				sh.vertexShader = sh.vertexShader
					.replace('#include <common>', '#include <common>\nattribute float aDrift;')
					.replace('#include <begin_vertex>', `#include <begin_vertex>
					{ float dk = 1.0 - smoothstep(0.12, 0.55, uSnow); transformed.y -= (aDrift + 0.1) * dk; }`);
			};
			const key = m.customProgramCacheKey();
			m.customProgramCacheKey = () => key + '-drift';
			m.userData.shared = true;
			World.driftM = m;
			return m;
		}
		static driftMesh(strips) {
			// siatka z indeksami (wspólne wierzchołki – gładkie cieniowanie zaokrąglonych zasp)
			const pos = [], dr = [], idx = [];
			for (const { pts, prof } of strips) {
				if (pts.length < 2) continue;
				const base = pos.length / 3, np = prof.length;
				for (const p of pts) for (const [o, hf] of prof) {
					pos.push(p.x + p.nx * o, p.y + hf * p.H - (p.slope || 0) * o, p.z + p.nz * o); // slope – spadek podłoża w poprzek (m/m)
					dr.push(hf * p.H);
				}
				for (let k = 0; k + 1 < pts.length; k++) for (let j = 0; j + 1 < np; j++) {
					const a = base + k * np + j, b = a + np;
					idx.push(a, b, b + 1, a, b + 1, a + 1);
				}
			}
			if (!pos.length) return null;
			const g = new T.BufferGeometry();
			g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
			g.setAttribute('aDrift', new T.Float32BufferAttribute(dr, 1));
			g.setIndex(idx);
			g.computeVertexNormals();
			// obieg trójkątów zależy od kierunku łamanej – normalne zawsze w górę
			const nm = g.attributes.normal.array;
			for (let q = 0; q < nm.length; q += 3) if (nm[q + 1] < 0) { nm[q] = -nm[q]; nm[q + 1] = -nm[q + 1]; nm[q + 2] = -nm[q + 2]; }
			const m = new T.Mesh(g, World.driftMat());
			m.material.side = T.DoubleSide;
			m.receiveShadow = true;
			m.userData.drift = true;
			return m;
		}
		/* wały śniegu odgarniętego z toru (pługi, przejazdy pociągów): na ramionach podsypki po obu stronach toru, przerwy
		   na stacjach, przejazdach, mostach, w tunelach, przy innych torach i rozjazdach; wysokość falująca 0,15–0,35 m */
		buildTrackDrifts(group, s0, s1) {
			const r = this.route, h = (s) => R.heightAt(r, s), strips = [];
			const prof = [[-0.65, 0], [-0.45, 0.35], [-0.22, 0.78], [0.05, 1], [0.3, 0.82], [0.52, 0.42], [0.72, 0]];
			const sides = r.double && !this.env ? [-1 * (2.95 - SECOND), 2.95] : [-2.95, 2.95];
			const bad = (s, d) => {
				for (const st of r.stations) if (s > st.platformStart - 30 && s < st.platformEnd + 30) return true;
				for (const c of r.crossings) if (Math.abs(s - c.pos) < 10) return true;
				for (const b of r.bridges) if (s > b.from - 6 && s < b.to + 6) return true;
				for (const t of r.tunnels) if (s > t.from - 4 && s < t.to + 4) return true;
				if (this.env) {
					if (this.envTrackGap(s, d) < 2.2 && Math.abs(d) > 2.2) return true;
					if (this.envOnSwitch && this.envOnSwitch(s, d)) return true;
					if (this.onRoad(s, d)) return true;
				}
				return false;
			};
			for (const d of sides) {
				let pts = [];
				const flush = () => { if (pts.length > 3) strips.push({ pts, prof }); pts = []; };
				for (let s = s0; s <= s1 + 0.01; s += 2) {
					if (bad(s, d)) { flush(); continue; }
					const sg = Math.sign(d);
					R.sidePoint(r, s, d, tp);
					const x = tp.x, z = tp.z;
					R.sidePoint(r, s, d + sg, tp);
					const nx = tp.x - x, nz = tp.z - z;
					// podstawa na skarpie podsypki (jak bal() w budowie toru: 0,31 m pod główką przy 2,15 m, spadek 0,48)
					const base = h(s) - 0.31 - (Math.abs(d) - (r.double && !this.env && d < 0 ? Math.abs(SECOND) : 0) - 2.15) * 0.48;
					const H = 0.14 + 0.22 * vnoise(s * 0.05 + d, d * 0.3);
					pts.push({ x, y: base - 0.04, z, nx, nz, H, slope: 0.48 });
				}
				flush();
			}
			const m = World.driftMesh(strips);
			if (m) group.add(m);
		}

		excluded(s, d) {
			const r = this.route, ad = this.eff(d);
			if (ad < 11) return true;
			for (const st of r.stations) {
				const big = st.type !== 'halt';
				const e = big ? 160 : 100;
				if (this.env ? s > st.platformStart - 40 && s < st.platformEnd + 50 && d > -18 && d < 14 : s > st.platformStart - e && s < st.platformEnd + e && d > (big ? -32 : -24) && d < (big ? 215 : 135)) return true;
			}
			for (const z of this.zones) if (s > z.sA - 4 && s < z.sB + 4 && d > z.dA - 4 && d < z.dB + 4) return true;
			for (const c of r.crossings) if (Math.abs(s - c.pos) < 9 || (Math.abs(s - c.pos) < 16 && ad < 16)) return true;
			for (const b of r.bridges) if (s > b.from - 38 && s < b.to + 38) return true;
			for (const t of r.tunnels) if (s > t.from - 35 && s < t.to + 35 && ad < 110) return true;
			return false;
		}

		// ---------- budowa kawałka ----------
		// cały kawałek naraz
		buildChunk(c) {
			const job = this.chunkJob(c);
			while (!job.gen.next().done);
			return { group: job.group, dyn: job.dyn };
		}

		// budowa kawałka krokami (gen.next() – kolejny krok; po ostatnim grupa jest w scenie)
		chunkJob(c) {
			const job = { c, group: new T.Group(), dyn: [] };
			job.gen = this.chunkSteps(c, job.group, job.dyn);
			return job;
		}

		// przerwana budowa (kawałek już niepotrzebny, zmiana trasy) – zwolnienie tego, co powstało
		abortJob() {
			const job = this.job;
			if (!job) return;
			this.job = null;
			job.gen.return();
			this.envLampSink = this.envDeckSink = null;
			this.dropChunk(job);
		}

		*chunkSteps(c, group, dyn) {
			const r = this.route;
			const s0 = c * C, s1 = s0 + C;
			const inRange = (s) => s >= s0 && s < s1;

			const M = World.materials();
			/* kolumny siatki terenu: przy wkopach drogowych gęściej (envTerrainCols); na granicy z sąsiednim kawałkiem
			   o innych kolumnach – wysokości z kolumn wspólnych (bez szczelin między kawałkami) */
			// maski dróg (teren przy jezdniach) tego kawałka i sąsiednich – krokami, zanim zażąda ich siatka terenu
			/* (±2 kawałki: ulice kawałka sięgają do sąsiedniego, a wysokość jezdni za nim budowała jego maskę bez przerw –
			   pojedyncze zapytania po ok. 50 ms) */
			if (this.env && this.envRoadMaskSteps) for (let cc = c - 2; cc <= c + 2; cc++) yield* this.envRoadMaskSteps(cc);
			// maski zajętości (drogi, budynki, tory – sadzenie drzew i trawy) – też krokami, przed ich pierwszym użyciem
			if (this.env && this.envMaskSteps) for (let cc = c - 1; cc <= c + 1; cc++) yield* this.envMaskSteps(cc);
			const cols = this.envTerrainCols ? this.envTerrainCols(c) : TERRAIN_D;
			const mY = (s, d) => this.foldY(s, d, this.meshTerrainY ? this.meshTerrainY(s, d) : this.terrainY(s, d));
			const edgeY = (s, d, other) => {
				if (other === cols || other.includes(d)) return mY(s, d);
				const com = cols.filter((x) => other.includes(x));
				let j = 0;
				while (j < com.length - 2 && com[j + 1] < d) j++;
				const a = com[j], b = com[j + 1], t = (d - a) / (b - a || 1);
				return mY(s, a) + (mY(s, b) - mY(s, a)) * t;
			};
			const colsA = cols === TERRAIN_D ? null : this.envTerrainCols(c - 1), colsB = cols === TERRAIN_D ? null : this.envTerrainCols(c + 1);
			const tY = (s, d) => (colsA && s === s0 ? edgeY(s, d, colsA) : colsB && s === s1 ? edgeY(s, d, colsB) : mY(s, d));
			/* wiersze terenu co 4 m, przy portalach tuneli (trasa z mapy) dodatkowo 0,5 m przed i za ścianą czołową – skok
			   terenu z dna wykopu nad strop schowany za ścianą (dawniej pochylnia przez 4–12 m widoczna we wlocie) */
			let tRows = 4;
			if (this.env && this.env.dem && r.tunnels.length) {
				const extra = [];
				for (const t of r.tunnels) for (const p of [t.from, t.to]) for (const x of [p - 0.5, p + 0.5]) if (x > s0 + 0.2 && x < s1 - 0.2) extra.push(x);
				if (extra.length) {
					const L = [];
					for (let s = s0; s < s1 - 0.01; s += 4) L.push(s);
					L.push(s1);
					tRows = L.concat(extra).sort((a, b) => a - b).filter((x, i, A) => i === 0 || x - A[i - 1] > 0.2 || x === s1);
				}
			}
			const terrain = new T.Mesh(
				yield* this.ribbonRows(s0, s1, tRows, cols, tY, (s, d, y) => this.terrainColor(s, d, y), (s, d) => this.rowWeights(s, d), null, (s, d) => this.terrainMat(s, d)),
				M.terrain,
			);
			terrain.receiveShadow = true;
			// cienie terenu (wzgórza, wykopy) – wysoka jakość cieni; w zasięgu cieni kawałków (updateLod – lod.casters)
			terrain.castShadow = !!this.terrainShadows;
			group.add(terrain);
			// (trójkąty przy innym miejscu trasy – zakręt, pętla – osobno, foldSplit)
			const rowS = Array.isArray(tRows) ? tRows : Array.from({ length: Math.max(2, Math.ceil((s1 - s0) / tRows) + 1) }, (_, i) => Math.min(s1, s0 + i * tRows));
			const fold = this.foldSplit(terrain.geometry, rowS, cols);
			if (fold) {
				for (const f of fold) {
					const fm = new T.Mesh(f.geo, M.terrain);
					fm.receiveShadow = true;
					fm.userData.fold = f.c;
					group.add(fm);
				}
				// (cały teren kawałka przy innym miejscu trasy – bez pustej siatki)
				if (!terrain.geometry.index.count) { group.remove(terrain); terrain.geometry.dispose(); }
			}
			yield;

			// podsypka: korona, ramiona i skarpy (ziarno kamieni w shaderze)
			const bal = (d) => {
				const a = Math.abs(d);
				return a < 1.75 ? -0.29 : a < 2.15 ? -0.31 : -0.31 - (a - 2.15) * 0.48;
			};
			// (kolumny przy szynach i między nimi – pasy zabrudzenia w kolorach wierzchołków, World.ballastTint)
			const balC = new T.Color(), IN = [-0.95, -0.75, -0.55, 0, 0.55, 0.75, 0.95];
			const ballast = new T.Mesh(
				r.double && !this.env
					? this.ribbon(s0, s1, 4, [-8.2, -7.6, -7.0, -6.35, ...IN.map((x) => SECOND + x), -2.3, ...IN, 1.75, 2.15, 2.8, 3.6].sort((a, b) => a - b), (s, d, h) => h + (d < -2.3 ? bal(d - SECOND) : bal(d)), (s, d) => World.ballastTint(d < -2.3 ? d - SECOND : d, balC))
					: this.ribbon(s0, s1, 4, [-3.6, -2.8, -2.15, -1.75, ...IN, 1.75, 2.15, 2.8, 3.6], (s, d, h) => h + bal(d), (s, d) => World.ballastTint(d, balC)),
				M.ballastTrack,
			);
			ballast.receiveShadow = true;
			group.add(ballast);
			if (this.season === 'winter') this.buildTrackDrifts(group, s0, s1);
			// szyny: profil (stopka, szyjka, główka) – rdzawe boki, błyszcząca wytarta główka
			const PROF = [[-0.075, -0.2], [-0.0749, -0.185], [-0.012, -0.17], [-0.0119, -0.05], [-0.036, -0.04], [-0.0359, -0.004]];
			const prof = PROF.concat(PROF.slice().reverse().map(([d, y]) => [-d, y]));
			for (const rd of r.double && !this.env ? [-0.75, 0.75, SECOND - 0.75, SECOND + 0.75] : [-0.75, 0.75]) {
				const ys = new Map(prof.map(([d, y]) => [rd + d, y]));
				const body = new T.Mesh(this.ribbon(s0, s1, 4, prof.map(([d]) => rd + d), (s, d, h, rel) => h + (ys.get(rel) || 0)), M.railSide);
				body.receiveShadow = true;
				group.add(body);
				group.add(new T.Mesh(World.railAttr(this.ribbon(s0, s1, 4, [rd - 0.036, rd + 0.036], (s, d, h) => h), 2), M.rail));
			}
			// podkłady betonowe z przytwierdzeniami szyn
			const sleeperStep = 0.6;
			const nSl = Math.floor(C / sleeperStep);
			const tracks = r.double && !this.env ? [0, SECOND] : [0];
			const sleepers = new T.InstancedMesh(GEO.sleeper, M.sleeper, nSl * tracks.length);
			const clips = new T.InstancedMesh(GEO.railClip, M.clip, nSl * tracks.length * 4);
			// podkłady: lekko różne odcienie betonu (wiek, zabrudzenie smarem)
			const shade = new T.Color();
			const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
			let nc = 0;
			tracks.forEach((td, ti) => {
				for (let i = 0; i < nSl; i++) {
					const s = s0 + (i + 0.5) * sleeperStep;
					R.sidePoint(r, s, td, tp);
					q.setFromAxisAngle(up, -tp.heading);
					m4.compose(p3.set(tp.x, tp.y - 0.27, tp.z), q, sc.set(2.6, 0.2, 0.26));
					sleepers.setMatrixAt(ti * nSl + i, m4);
					const hs = hash(s * 1.37 + ti * 7.1);
					sleepers.setColorAt(ti * nSl + i, shade.setScalar(hs < 0.08 ? 0.72 : 0.9 + hash(s * 2.11 + ti) * 0.16));
					const cx = Math.cos(tp.heading), cz = Math.sin(tp.heading);
					// przytwierdzenia po obu stronach stopki szyny, łapką do szyny (za szyną – obrócone)
					for (const off of [-0.75 - 0.11, -0.75 + 0.11, 0.75 - 0.11, 0.75 + 0.11]) {
						const flip = off > Math.sign(off) * 0.75;
						q.setFromAxisAngle(up, -tp.heading + (flip ? Math.PI : 0));
						m4.compose(p3.set(tp.x + cx * off, tp.y - 0.135, tp.z + cz * off), q, sc.set(1, 1, 1));
						clips.setMatrixAt(nc++, m4);
					}
				}
			});
			sleepers.receiveShadow = clips.receiveShadow = true;
			sleepers.userData.fine = clips.userData.fine = true;
			group.add(sleepers, clips);
			yield;
			this.buildCableTrough(group, s0, s1);

			// sieć trakcyjna – cecha linii, nie pociągu; trasa rzeczywista: zawsze (sieć nad torami z mapy wg ich danych,
			// nad torem pociągu – na odcinkach z siecią)
			if (r.electrified || this.env || (r.wire && r.wire.length)) this.buildCatenary(group, s0, s1);
			if (!this.env) this.buildPastures(group, dyn, c, s0);
			yield;
			yield* this.buildTrees(group, c, s0, s1);
			yield;
			yield* this.buildGrass(group, c, s0, s1);
			yield* this.buildPlants(group, c, s0, s1);
			if (this.env) yield* this.buildMapObjects(group, c, s0, s1, dyn);
			this.buildPosts(group, s0, s1);
			yield;
			if (this.env) yield* this.buildEnvChunk(group, c, dyn);
			else this.buildHouses(group, c, s0, s1);
			yield;

			r.stations.forEach((st, i) => { if (inRange((st.platformStart + st.platformEnd) / 2)) this.buildStation(group, dyn, st, i); });
			r.signals.forEach((sig, i) => { if (inRange(sig.pos)) this.buildSignal(group, dyn, sig, i); });
			/* semafory dla pociągów z przeciwka przy końcach mijanek (linie z odcinkami jednotorowymi): przed rozjazdem, po
			   prawej stronie toru mijanki w ich kierunku (u nas – po lewej), zwrócone w ich stronę; „stój”, dopóki odcinek
			   nie zostanie przydzielony (traffic.js oppSignal) */
			const TT = typeof window !== 'undefined' ? window.TrainTraffic : null;
			if (r.single && this.env && TT) r.single.forEach(([, b], k) => {
				const pos = b + TT.SIG_GAP;
				if (!inRange(pos) || pos > r.length - 20) return;
				// tor mijanki – ten sam, po którym jedzie pociąg z przeciwka (scene.js)
				const lane = this.envLaneNear(pos);
				this.buildSignal(group, dyn, { pos, d: lane < 0 ? lane - 3.0 : lane + 3.0, label: 'D' + (k + 1), opp: true }, k, true);
			});
			for (const w of this.warnDiscs()) if (inRange(w.pos)) this.buildWarnDisc(group, dyn, w);
			for (let i = 1; i < r.limits.length; i++) {
				const l = r.limits[i], down = l.speed < r.limits[i - 1].speed;
				if (inRange(l.pos)) this.buildBoard(group, l.pos, boardTexture(String(l.speed), down ? '#ffd23f' : '#ffffff', 'sq'));
				if (down && inRange(l.pos - 700)) this.buildBoard(group, l.pos - 700, boardTexture(String(l.speed), '#ff9f1c', 'tri'), 'tri');
			}
			r.crossings.forEach((cr) => {
				if (inRange(cr.pos)) this.buildCrossing(group, dyn, cr);
				if (inRange(cr.hornFrom)) this.buildBoard(group, cr.hornFrom, boardTexture('W6', '#ffffff', 'sq'));
			});
			r.bridges.forEach((b) => { if (inRange((b.from + b.to) / 2)) (b.kind === 'viaduct' ? this.buildViaduct(group, b) : this.buildBridge(group, b)); });
			// trasa rzeczywista: obudowa tunelu w każdym kawałku jego część (długie tunele miejskie), portale w swoich kawałkach
			if (this.env && this.env.dem) r.tunnels.forEach((t) => { if (t.to >= s0 && t.from < s1) this.buildEnvTunnel(group, t, s0, s1, dyn); });
			else r.tunnels.forEach((t) => { if (inRange((t.from + t.to) / 2)) this.buildTunnel(group, dyn, t); });

			if (this.haloSize) group.traverse((o) => { if (o.userData.lampHalo) o.scale.set(this.haloSize, this.haloSize, 1); });
			yield;
			yield* this.mergeStatic(group, dyn);
			this.scene.add(group);
		}

		/* Scalanie nieruchomych siatek kawałka: siatki o tym samym materiale (i tych samych atrybutach, cieniach) łączone
		   w jedną bryłę w układzie kawałka – jedno wywołanie rysowania zamiast setek (stacja: ok. 700 siatek → kilkadziesiąt).
		   Pomijane: wszystko, do czego sięga dyn (lampy, zegary, auta, semafory, pasażerowie, wagony – z potomkami; stacja –
		   bez grupy g, używanej tylko jako układ współrzędnych), instancje, sprite'y, materiały przezroczyste, siatki
		   z userData lamp (power, drop, lampHalo, dark), renderOrder i LOD (grupy geometrii, np. ścian BoxGeometry, przy jednym
		   materiale bez znaczenia – pomijane). Pozostałe obiekty nieruchome –
		   bez przeliczania macierzy co klatkę (matrixAutoUpdate = false). */
		*mergeStatic(group, dyn) {
			if (World.opt.merge === false) { group.userData.lod = { trees: [], fine: [], casters: [], fold: [] }; return; } // diagnostyka: bez scalania
			const prot = new Set(), seen = new Set([group]);
			const walk = (v, depth) => {
				if (!v || typeof v !== 'object' || seen.has(v) || depth > 6) return;
				seen.add(v);
				if (v.isScene || v.isMaterial || v.isBufferGeometry || v.isTexture) return;
				if (v.isObject3D) { v.traverse((o) => prot.add(o)); return; }
				if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
				if (ArrayBuffer.isView(v)) return;
				for (const k in v) walk(v[k], depth + 1);
			};
			for (const d of dyn) for (const k in d) if (!(d.type === 'station' && k === 'g')) walk(d[k], 1);
			const LAMP = ['power', 'drop', 'lampHalo', 'dark'];
			group.updateMatrixWorld(true);
			const inv = new T.Matrix4().copy(group.matrixWorld).invert();
			const batches = new Map();
			const movable = (o) => {
				for (let p = o; p && p !== group; p = p.parent) if (p.isLOD || !p.visible) return true;
				return false;
			};
			/* pozycja do scalenia: bryła g w układzie kawałka (macierz mw), col – kolor egzemplarza (mnoży kolory wierzchołków).
			   Materiał zwykły (mat()/matS(): stały kolor, bez tekstury, nieprzezroczysty) – zastąpiony wspólnym z kolorem
			   w wierzchołkach (vcMat): jedno wywołanie rysowania na rodzaj powierzchni zamiast na kolor; brakujący atrybut
			   color – z koloru materiału */
			const add = (o, g, mw, col) => {
				let m = o.material;
				const plain = m.userData.plain && m.isMeshStandardMaterial && !m.map && !m.vertexColors && !m.transparent && m.emissive.r + m.emissive.g + m.emissive.b === 0;
				if (plain) {
					const c = m.color.clone();
					if (col) c.multiply(col);
					col = c;
					m = NS.util.vcMat(m);
				}
				const attrs = Object.keys(g.attributes);
				if (plain && !attrs.includes('color')) attrs.push('color');
				attrs.sort();
				const sig = attrs.map((k) => { const at = g.attributes[k]; return at ? `${k}${at.itemSize}${at.normalized ? 'n' : ''}${at.array.constructor.name}${at.isInterleavedBufferAttribute ? 'i' : ''}` : `${k}3Float32Array`; }).join(',');
				if (sig.includes('i,') || sig.endsWith('i')) return false;
				const key = `${m.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${sig}`;
				let bt = batches.get(key);
				if (!bt) batches.set(key, (bt = { m, attrs, list: [], cast: o.castShadow, recv: o.receiveShadow, own: false, vc: !!m.userData.vc }));
				bt.list.push({ o, g, mw, col, plain });
				if (o.userData.ownMaterial) bt.own = true;
				return true;
			};
			const baked = new Set(), IM = new T.Matrix4(), IC = new T.Color();
			group.traverse((o) => {
				if (!o.isMesh || o.isSkinnedMesh || prot.has(o) || !o.visible) return;
				const m = o.material, g = o.geometry;
				if (Array.isArray(m) || m.transparent || o.renderOrder || !o.frustumCulled || o.customDepthMaterial || o.customDistanceMaterial) return;
				if (g.morphAttributes.position || g.drawRange.count !== Infinity || !g.attributes.position || !g.attributes.normal) return;
				if (LAMP.some((k) => o.userData[k] !== undefined) || o.userData.fold !== undefined || movable(o)) return;
				const mw = new T.Matrix4().multiplyMatrices(inv, o.matrixWorld);
				if (!o.isInstancedMesh) { add(o, g, mw, null); return; }
				/* instancje z niewielu egzemplarzy (latarnie, słupki, znaki, wsporniki…) – wtopione w bryłę kawałka; bez koron
				   (poziom szczegółów), drobnych detali (z daleka znikają) i materiałów z kołysaniem (faza z położenia egzemplarza);
				   kolor egzemplarza tylko przy kolorach wierzchołków */
				if (o.count > 64 || !o.count || o.userData.lo || o.userData.fine || o.userData.near || /wind|grass/.test(m.customProgramCacheKey ? m.customProgramCacheKey() : '')) return;
				if (o.instanceColor && !(g.attributes.color && m.vertexColors)) return;
				let ok = true;
				for (let i = 0; i < o.count && ok; i++) {
					o.getMatrixAt(i, IM);
					let col = null;
					if (o.instanceColor) { o.getColorAt(i, IC); col = IC.clone(); }
					ok = add(o, g, new T.Matrix4().multiplyMatrices(mw, IM), col);
				}
				if (ok) baked.add(o);
			});
			yield;
			const N3 = new T.Matrix3(), v = new T.Vector3();
			/* przerwa (yield) po partii, gdy od poprzedniej minęły ponad 4 ms – dawniej co 8 partii, a partie budynków i dróg
			   bywają duże: jeden krok scalania trwał do 350 ms (przycięcie obrazu przy dobudowie kawałka) */
			let tY = performance.now();
			for (const bt of batches.values()) {
				// pojedyncza zwykła siatka – bez zmian (chyba że do wspólnego materiału z kolorem w wierzchołkach);
				// pojedyncza instancja (jeden egzemplarz) – też wtapiana
				if (bt.list.length < 2 && !bt.list[0].o.isInstancedMesh && !bt.vc) continue;
				let nv = 0, ni = 0;
				for (const { g } of bt.list) {
					nv += g.attributes.position.count;
					ni += g.index ? g.index.count : g.attributes.position.count;
				}
				const out = {}, proto = {};
				for (const k of bt.attrs) {
					const src = bt.list.find((x) => x.g.attributes[k]);
					const at = src ? src.g.attributes[k] : null;
					proto[k] = at ? { C: at.array.constructor, size: at.itemSize, norm: at.normalized } : { C: Float32Array, size: 3, norm: false };
					out[k] = new proto[k].C(nv * proto[k].size);
				}
				const index = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
				let vo = 0, io = 0;
				for (const { o, g, mw, col, plain } of bt.list) {
					const cnt = g.attributes.position.count;
					N3.getNormalMatrix(mw);
					const flip = mw.determinant() < 0;
					for (const k of bt.attrs) {
						const at = g.attributes[k], dst = out[k], sz = proto[k].size;
						if (!at || (k === 'color' && plain)) {
							// kolor z materiału (wspólny materiał z kolorem w wierzchołkach; kolory bryły materiał pomijał)
							for (let i = 0; i < cnt; i++) { dst[(vo + i) * 3] = col.r; dst[(vo + i) * 3 + 1] = col.g; dst[(vo + i) * 3 + 2] = col.b; }
							continue;
						}
						if (k === 'position' || k === 'normal') {
							for (let i = 0; i < cnt; i++) {
								v.set(at.getX(i), at.getY(i), at.getZ(i));
								if (k === 'position') v.applyMatrix4(mw); else v.applyMatrix3(N3).normalize();
								dst[(vo + i) * 3] = v.x; dst[(vo + i) * 3 + 1] = v.y; dst[(vo + i) * 3 + 2] = v.z;
							}
						} else if (k === 'color' && col) {
							for (let i = 0; i < cnt; i++) {
								dst[(vo + i) * sz] = at.getX(i) * col.r;
								dst[(vo + i) * sz + 1] = at.getY(i) * col.g;
								dst[(vo + i) * sz + 2] = at.getZ(i) * col.b;
								if (sz === 4) dst[(vo + i) * sz + 3] = at.getW(i);
							}
						} else dst.set(at.array.subarray(0, cnt * sz), vo * sz);
					}
					const src = g.index ? g.index.array : null, tri = src ? g.index.count : cnt;
					for (let i = 0; i < tri; i += 3) {
						const a0 = src ? src[i] : i, a1 = src ? src[i + 1] : i + 1, a2 = src ? src[i + 2] : i + 2;
						index[io++] = vo + a0;
						index[io++] = vo + (flip ? a2 : a1);
						index[io++] = vo + (flip ? a1 : a2);
					}
					vo += cnt;
					// (duża partia – np. jezdnie albo detale budynków, kilkaset tysięcy wierzchołków – też z przerwami)
					if (performance.now() - tY > 4) { yield; tY = performance.now(); }
					if (o.parent) {
						o.parent.remove(o);
						if (o.isInstancedMesh) o.dispose();
						if (!g.userData.shared) g.dispose();
					}
				}
				const geo = new T.BufferGeometry();
				for (const k of bt.attrs) geo.setAttribute(k, new T.BufferAttribute(out[k], proto[k].size, proto[k].norm));
				geo.setIndex(new T.BufferAttribute(index, 1));
				geo.computeBoundingBox();
				geo.computeBoundingSphere();
				const mesh = new T.Mesh(geo, bt.m);
				mesh.castShadow = bt.cast;
				mesh.receiveShadow = bt.recv;
				if (bt.own) mesh.userData.ownMaterial = true;
				group.add(mesh);
				if (performance.now() - tY > 4) { yield; tY = performance.now(); }
			}
			yield;
			// puste grupy po scaleniu – usunięte; reszta nieruchoma (bez przeliczania macierzy co klatkę)
			const empty = [];
			group.traverse((o) => { if (o !== group && !o.isMesh && !o.isSprite && !o.isLight && !o.isPoints && !o.isLine && !prot.has(o) && !o.children.length) empty.push(o); });
			for (const o of empty) o.parent.remove(o);
			group.updateMatrixWorld(true);
			group.traverse((o) => { if (o !== group && !prot.has(o) && !LAMP.some((k) => o.userData[k] !== undefined)) o.matrixAutoUpdate = false; });
			/* poziomy szczegółów kawałka (World.update): trees – korony z bryłą dokładną i uproszczoną (drzewa z modeli – pule
			   świata, treePool); fine – drobne instancje (userData.fine: podkłady, przytwierdzenia, trawa, kwiaty, trzciny),
			   z daleka niewidoczne; near – rośliny przyziemne z modeli (userData.near), tylko w kawałkach bliskich */
			const lod = { trees: [], fine: [], near: [], casters: [], fold: [] };
			group.traverse((o) => {
				if (o.userData.fold !== undefined) lod.fold.push(o);
				if (o.isMesh && o.castShadow && !prot.has(o)) lod.casters.push(o);
				if (!o.isInstancedMesh || prot.has(o)) return;
				if (o.userData.lo) lod.trees.push(o);
				else if (o.userData.near) { lod.near.push(o); o.castShadow = false; }
				else if (o.userData.fine) { lod.fine.push(o); o.castShadow = false; } // drobiazgi bez cienia
			});
			lod.casters = lod.casters.filter((o) => o.castShadow);
			group.userData.lod = lod;
			yield;
			if (NS.gpu && World.opt.shadowMerge !== false) this.shadowMerge(group, lod);
			yield;
			if (NS.gpu && World.opt.bundle !== false) lod.bundle = this.bundleStatic(group, prot, LAMP);
			if (this.reflLayer) {
				const inBundle = (o) => { for (let p = o.parent; p && p !== group; p = p.parent) if (p.isBundleGroup) return true; return false; };
				group.traverse((o) => {
					if (!(o.isMesh || o.isSprite || o.isLine || o.isPoints) || o.layers.mask !== 1 || inBundle(o)) return;
					if (o.material && !Array.isArray(o.material) && o.material.userData && o.material.userData.water) return;
					o.layers.set(World.NOREFL_LAYER);
				});
			}
		}

		/* WebGPU: cień nieruchomych brył kawałka jedną scaloną bryłą (jak cień składu – train.js shadowMerge). W mapach cieni
		   WebGPURenderer odświeża w całości każdy obiekt w każdej klatce (materiał cienia ma colorNode), więc setki brył
		   rzucających cień kosztowały kilka ms. Do bryły: siatki zwykłe (nie instancje – korony z alphaTest, pnie, drobiazgi
		   zostają same), nieprzezroczyste, bez alphaTest; bryła rysowana tylko w mapach cieni (w obrazie zakres 0 – kamery
		   cieni słońca są ortograficzne). lod.casters – zamiast nich bryła (updateLod przełącza jej castShadow). */
		shadowMerge(group, lod) {
			const inv = new T.Matrix4().copy(group.matrixWorld).invert(), m = new T.Matrix4(), v = new T.Vector3();
			const take = lod.casters.filter((o) => !o.isInstancedMesh && o.geometry.attributes.position && !Array.isArray(o.material) && !o.material.transparent && !o.material.alphaTest && !o.material.map);
			if (take.length < 2) return;
			let n = 0;
			for (const o of take) n += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
			const pos = new Float32Array(n * 3);
			let k = 0;
			for (const o of take) {
				m.multiplyMatrices(inv, o.matrixWorld);
				const p = o.geometry.attributes.position, idx = o.geometry.index, cnt = idx ? idx.count : p.count;
				const flip = m.determinant() < 0;
				for (let q = 0; q < cnt; q += 3) for (let j = 0; j < 3; j++) {
					const qq = q + (flip && j ? 3 - j : j);
					v.fromBufferAttribute(p, idx ? idx.getX(qq) : qq).applyMatrix4(m);
					pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z;
				}
				o.castShadow = false;
			}
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.BufferAttribute(pos, 3));
			geo.computeBoundingSphere();
			const sh = new T.Mesh(geo, World.shadowProxyMat || (World.shadowProxyMat = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false })));
			sh.castShadow = true;
			sh.receiveShadow = false;
			sh.onBeforeRender = (r, sc, c, g) => { g.drawRange.count = c.isOrthographicCamera ? Infinity : 0; };
			/* tylko warstwa cieni (World.SHADOW_LAYER – widzą ją wyłącznie kamery map cieni, scene.js): onBeforeRender nie
			   działa przy odtwarzaniu paczki (BundleGroup) – bryła nagrana w przebiegu cieni rysowała się w obrazie i odbiciu
			   wody (z cieniami terenu – pokrywała cały kawałek: woda bez odbić) */
			sh.layers.set(World.SHADOW_LAYER);
			sh.userData.shadowProxy = true;
			group.add(sh);
			sh.updateMatrixWorld(true);
			sh.matrixAutoUpdate = false;
			lod.casters = lod.casters.filter((o) => o.castShadow).concat([sh]);
		}

		/* WebGPU: nieruchome siatki kawałka w paczce (BundleGroup) – polecenia rysowania nagrane raz i odtwarzane, bez
		   przeglądania sceny, odcinania i przygotowania każdego obiektu co klatkę (WebGPURenderer ma duży narzut na obiekt:
		   ok. 30 µs; kawałki to ok. 2/3 wywołań w obrazie i cieniach). Paczka nagrywa obiekty widoczne w chwili nagrania, więc
		   w niej bez odcinania pojedynczych brył (rysowane zawsze – karta ma zapas). Nowe nagranie przy zmianie poziomów
		   szczegółów i cieni (updateLod). Poza paczką: to, czego dotyka dyn (lampy, semafory, auta, pasażerowie…), siatki lamp,
		   woda (odbicie lustrzane ukrywa ją na czas rysowania odbicia). */
		bundleStatic(group, prot, LAMP) {
			const list = [];
			group.traverse((o) => {
				if (!o.isMesh || prot.has(o) || o.matrixAutoUpdate !== false || !o.visible && !o.userData.fine && !o.userData.near && o.userData.fold === undefined) return;
				if (LAMP.some((k) => o.userData[k] !== undefined) || (o.material && !Array.isArray(o.material) && o.material.userData && o.material.userData.water)) return;
				for (let p = o.parent; p && p !== group; p = p.parent) if (prot.has(p) || p.isLOD) return;
				list.push(o);
			});
			if (!list.length) return null;
			const b = new BundleGroup();
			b.name = 'static';
			group.add(b);
			group.updateMatrixWorld(true);
			for (const o of list) {
				b.attach(o);
				o.updateMatrix();
				o.frustumCulled = false;
			}
			b.updateMatrixWorld(true);
			b.matrixAutoUpdate = false;
			b.matrixWorldAutoUpdate = false; // całe poddrzewo bez przeliczania macierzy co klatkę
			return b;
		}

		/* Pule drzew z modeli (WebGPU): egzemplarze wszystkich kawałków (group.userData.ezTrees / ezImp – klucz, macierz,
		   kolor) w siatkach na gatunek | wariant | część (kora, liście) | poziom: hi – kawałek bliski (wersja dokładna; przy
		   treeLite – z daleka), lo – dalszy (wersja z daleka), far – poza zasięgiem cieni (bez cienia); impostory: gatunek
		   | z cieniem / bez. Przebudowa przy zmianie kawałków i ich poziomów (treePoolDirty – update), w jednej paczce
		   rysowania (BundleGroup) nagrywanej od nowa tylko wtedy. Pojemność siatki – z zapasem (nowa siatka przy przepełnieniu). */
		updateTreePool() {
			this.treePoolDirty = false;
			if (!NS.trees) return;
			let P = this.treePool;
			if (!P) {
				P = this.treePool = { root: new BundleGroup(), meshes: new Map() };
				P.root.name = 'treePool';
				P.root.matrixAutoUpdate = false;
				P.root.matrixWorldAutoUpdate = false;
				this.scene.add(P.root);
			}
			const EG = NS.trees.geometries(), EM = NS.trees.materials(patch);
			const leafM = this.season === 'winter' ? EM.leafWinter : EM.leaf;
			// zliczenie egzemplarzy na siatkę puli
			const need = new Map(), parts = [];
			const add = (key, n) => need.set(key, (need.get(key) || 0) + n);
			for (const ch of this.chunks.values()) {
				const u = ch.group.userData, L = u.lod;
				if (!u.ezTrees && !u.ezImp) continue;
				const tier = !L || L.hi === undefined || L.hi ? 'hi' : L.cast === false ? 'far' : 'lo';
				parts.push([u, tier]);
				if (u.ezTrees) for (const k of u.ezTrees.keys) { add(k + '|bark|' + tier, 1); add(k + '|leaf|' + tier, 1); }
				if (u.ezImp) for (const k of u.ezImp.keys) add('imp|' + k + '|' + (tier === 'far' ? 'far' : 'cast'), 1);
			}
			const mesh = (key, n) => {
				let m = P.meshes.get(key);
				if (m && m.instanceMatrix.count >= n) return m;
				if (m) { P.root.remove(m); m.dispose(); }
				const [a, b, c, tier] = key.split('|');
				let geo, mat;
				if (a === 'imp') {
					geo = NS.trees.impostors.geo[b];
					mat = NS.trees.impostorMaterial(patch);
				} else {
					const g = EG[a][+b], lo = tier !== 'hi' || this.treeLite;
					geo = lo ? g.lo[c] : g[c];
					mat = c === 'leaf' ? leafM : EM.bark[NS.trees.barkOf(a)];
				}
				m = new T.InstancedMesh(geo, mat, Math.ceil(n * 1.4) + 16);
				m.count = 0;
				m.castShadow = this.shadows && (a === 'imp' ? c !== 'far' : tier !== 'far');
				m.receiveShadow = true;
				m.frustumCulled = false;
				m.matrixAutoUpdate = false;
				if (a === 'imp' || c === 'leaf') m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3), 3);
				P.meshes.set(key, m);
				P.root.add(m);
				return m;
			};
			for (const m of P.meshes.values()) m.count = 0;
			const fill = (key, R, i) => {
				const m = mesh(key, need.get(key)), k = m.count++;
				m.instanceMatrix.array.set(R.mats.subarray(i * 16, i * 16 + 16), k * 16);
				if (m.instanceColor) m.instanceColor.array.set(R.cols.subarray(i * 3, i * 3 + 3), k * 3);
			};
			for (const [u, tier] of parts) {
				const E = u.ezTrees, I = u.ezImp;
				if (E) for (let i = 0; i < E.keys.length; i++) {
					fill(E.keys[i] + '|bark|' + tier, E, i);
					fill(E.keys[i] + '|leaf|' + tier, E, i);
				}
				if (I) for (let i = 0; i < I.keys.length; i++) fill('imp|' + I.keys[i] + '|' + (tier === 'far' ? 'far' : 'cast'), I, i);
			}
			for (const m of P.meshes.values()) {
				m.visible = m.count > 0;
				m.instanceMatrix.needsUpdate = true;
				if (m.instanceColor) m.instanceColor.needsUpdate = true;
				if (NS.nodes && NS.nodes.touchInstances) NS.nodes.touchInstances(m); // (pozycje do kołysania – nodes.js)
			}
			P.root.needsUpdate = true;
		}

		dropTreePool() {
			const P = this.treePool;
			if (!P) return;
			for (const m of P.meshes.values()) m.dispose();
			this.scene.remove(P.root);
			this.treePool = null;
		}

		/* Poziom szczegółów kawałków wg odległości kamery od kawałka wzdłuż toru (s – kilometraż kamery): korony bliżej niż
		   TREE_NEAR – bryła dokładna, dalej uproszczona; drobne instancje dalej niż FINE_FAR – niewidoczne (ułamek piksela). */
		updateLod(s) {
			if (World.opt.lod === false) return;
			const R = Math.max(0.6, (this.detail || 1) * (this.detailDyn || 1));
			// shadowFarK – jakość cieni (scene.js SHADOWQ: niska – tylko najbliższe kawałki)
			const far = 230 * Math.max(1, this.density) * R, near = 170 * R, shadowFar = 450 * R * (this.shadowFarK ?? 1);
			for (const [c, ch] of this.chunks) {
				const L = ch.group.userData.lod;
				if (!L) continue;
				const d = Math.max(0, c * C - s, s - (c + 1) * C);
				const hi = d < near;
				if (L.hi !== hi) {
					L.hi = hi;
					for (const m of L.trees) m.geometry = hi ? m.userData.hi : m.userData.lo;
					for (const m of L.near) m.visible = hi;
					if (ch.group.userData.ezTrees) this.treePoolDirty = true;
					if (L.bundle) L.bundle.needsUpdate = true;
				}
				const show = d < far;
				if (L.show !== show) {
					L.show = show;
					for (const m of L.fine) m.visible = show;
					if (L.bundle) L.bundle.needsUpdate = true;
				}
				// teren przy innym miejscu trasy (foldSplit) – tylko bez kawałka tamtego miejsca
				for (const m of L.fold || []) {
					const has = this.chunks.has(m.userData.fold);
					if (m.visible === has) {
						m.visible = !has;
						if (L.bundle) L.bundle.needsUpdate = true;
					}
				}
				// cienie: kawałki dalej niż shadowFar nie rzucają cienia (najdalsza kaskada – mniej brył do rysowania)
				const cast = d < shadowFar;
				if (L.cast !== cast) {
					L.cast = cast;
					if (ch.group.userData.ezTrees) this.treePoolDirty = true;
					for (const m of L.casters) m.castShadow = cast;
					if (L.bundle) L.bundle.needsUpdate = true;
				}
			}
		}

		buildCatenary(group, s0, s1) {
			if (this.env) return this.buildEnvCatenary(group, s0, s1);
			const r = this.route;
			const pts = [];
			let wd = 0;
			const add = (sa, ya, sb, yb) => {
				R.sidePoint(r, sa, wd, tp);
				pts.push(tp.x, tp.y + ya, tp.z);
				R.sidePoint(r, sb, wd, tp);
				pts.push(tp.x, tp.y + yb, tp.z);
			};
			const mess = (s) => 6.8 - 0.9 * Math.sin((Math.PI * (((s % 60) + 60) % 60)) / 60);
			for (const d of r.double ? [0, SECOND] : [0]) {
				wd = d;
				for (let s = s0; s < s1; s += 5) {
					add(s, 5.6, s + 5, 5.6);
					add(s, mess(s), s + 5, mess(s + 5));
					if (s % 10 === 0) add(s, 5.6, s, mess(s));
				}
			}
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
			if (!World.wireMat) {
				World.wireMat = new T.LineBasicMaterial({ color: 0x2a2a2a });
				World.wireMat.userData.shared = true;
			}
			group.add(new T.LineSegments(geo, World.wireMat));
			const poleMat = mat('#7b8288');
			for (let sm = Math.ceil(s0 / 60) * 60; sm < s1; sm += 60) {
				let s = sm;
				// słup nie może stać na drodze przejazdu – przesunięty poza jezdnię
				const cr = r.crossings.find((c) => Math.abs(s - c.pos) < 10);
				if (cr) s = cr.pos + (s < cr.pos ? -10 : 10);
				// ani przy semaforze (ta sama strona toru) – przesunięcie o kilka metrów
				const sg = r.signals.find((x) => Math.abs(s - x.pos) < 4);
				if (sg) s = sg.pos + (s < sg.pos ? -5 : 5);
				if (r.tunnels.some((t) => s > t.from - 5 && s < t.to + 5)) continue;
				const g = new T.Group();
				g.add(box(0.32, 8.2, 0.32, poleMat, 0, 3.2, 0));
				g.add(box(3.9, 0.16, 0.16, poleMat, -1.95, 6.8, 0));
				g.add(box(3.6, 0.1, 0.1, poleMat, -1.8, 5.75, 0));
				this.place(g, s, 3.7);
				g.traverse((o) => { o.castShadow = true; });
				group.add(g);
				if (r.double) {
					// słup po lewej z wysięgnikiem nad drugim torem
					const gl = new T.Group();
					gl.add(box(0.32, 8.2, 0.32, poleMat, 0, 3.2, 0));
					gl.add(box(7.0, 0.16, 0.16, poleMat, 3.5, 6.8, 0));
					gl.add(box(6.7, 0.1, 0.1, poleMat, 3.35, 5.75, 0));
					this.place(gl, s, SECOND - 6.6);
					gl.traverse((o) => { o.castShadow = true; });
					group.add(gl);
				}
			}
		}

		// słupki hektometrowe co 100 m i tablice kilometrowe
		buildPosts(group, s0, s1) {
			const white = mat('#f2f2f2'), black = mat('#1b1b1b');
			for (let s = Math.ceil(s0 / 100) * 100; s < s1; s += 100) {
				if (s < 0 || s > this.route.bufferPos) continue;
				if (this.route.stations.some((st) => s > st.platformStart - 10 && s < st.platformEnd + 10)) continue;
				let pd = this.route.double ? SECOND - 4.4 : -3.9;
				if (this.env) {
					pd = this.envFree(s, -3.9, -1, 2.2, 9);
					if (pd === null) pd = this.envFree(s, 3.9, 1, 2.2, 9);
					if (pd === null) continue;
				}
				const g = new T.Group();
				this.place(g, s, pd);
				g.position.y = this.terrainY(s, pd) + 0.2;
				g.add(box(0.16, 1.0, 0.16, white, 0, 0.5, 0));
				g.add(box(0.17, 0.18, 0.17, black, 0, 0.95, 0));
				if (s % 1000 === 0) {
					this.fixedBoard(g, boardTexture(String(s / 1000), '#ffffff', 'sq'), 'sq', 0.55, 0, 1.5, 0);
					g.add(box(0.12, 0.6, 0.08, mat('#f2f2f2'), 0, 1.2, 0.05));
				}
				group.add(g);
			}
		}

		// Drzewa kilku gatunków (świerk, sosna, dąb, brzoza, topola), krzewy i dalekie masy lasu.
		// Korony z kilku brył z cieniowaniem w kolorach wierzchołków; każde drzewo ma własny odcień (instancja).
		// generatory drzew i trawy (krok co kilkadziesiąt / tysiąc sztuk) – zob. chunkSteps
		*buildTrees(group, c, s0, s1) {
			const M = World.materials(), G = World.G.trees;
			/* WebGPU: drzewa z modeli (trees.js – EZ-Tree: pień z gałęziami i karty gałązek z liśćmi, 2 warianty na gatunek);
			   rozmieszczenie, wielkość i kolory jak dawnych koron – egzemplarze zbierane w ez i wstawiane po pętli (dokładna
			   liczba na wariant) */
			const ez = NS.gpu && NS.trees && World.opt.ezTrees !== false ? [] : null;
			// zimą liściaste z faktury nagich gałązek (to samo rozmieszczenie pól atlasu; iglaste bez zmian)
			const fa = NS.props.foliageAtlas(this.season === 'winter');
			M.leaf.map = M.bush.map = fa;
			const dens = this.density;
			const N = Math.round(230 * dens * (this.env ? 2.4 : 1));
			/* drzewa z mapy (trasa rzeczywista – env.vt z generatora: pojedyncze drzewa i szpalery z OSM, po 4: s, d, gatunek,
			   wysokość) w tym kawałku – indeks kawałków budowany raz na trasę */
			const vt = this.env && this.route.env && this.route.env.vt;
			if (vt && (!this.vtIdx || this.vtIdx.vt !== vt)) {
				const idx = new Map();
				for (let i = 0; i < vt.length; i += 4) {
					const cc = Math.floor(vt[i] / C);
					if (!idx.has(cc)) idx.set(cc, []);
					idx.get(cc).push(i);
				}
				this.vtIdx = { vt, idx };
			}
			const osmT = vt ? this.vtIdx.idx.get(c) || [] : [];
			const inst = (geo, material, n) => {
				const m = new T.InstancedMesh(geo, material, Math.max(1, n));
				m.count = 0;
				return m;
			};
			const NO = N + osmT.length;
			const trunks = inst(G.trunk, M.trunkMat, NO + 120);
			const birchTrunks = inst(G.trunk, M.birchMat, NO);
			const spruces = inst(G.spruce, M.spruce, NO);
			const oaks = inst(G.oak, M.leaf, NO);
			const birches = inst(G.birch, M.leaf, NO);
			const poplars = inst(G.poplar, M.leaf, NO);
			const pines = inst(G.pine, M.leaf, NO);
			const bushes = inst(G.bush, M.bush, Math.round(110 * dens));
			// zwarte masy lasu (150–520 m od toru) – zawsze z bryły z daleka
			const blobs = inst(World.opt.lod === false ? G.oak : G.lo.oak, M.leaf, Math.round((this.env ? 160 : 70) * dens));
			// korony: bliżej kamery dokładna bryła, dalej uproszczona (World.update – przełączanie całych kawałków)
			for (const [m, k] of [[spruces, 'spruce'], [oaks, 'oak'], [birches, 'birch'], [poplars, 'poplar'], [pines, 'pine'], [bushes, 'bush']]) {
				m.userData.hi = G[k];
				m.userData.lo = G.lo[k];
			}
			const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
			const put = (m, x, y, z, sx, sy, sz, color) => {
				if (m.count >= m.instanceMatrix.count) return;
				m4.compose(p3.set(x, y, z), q, sc.set(sx, sy, sz));
				m.setMatrixAt(m.count, m4);
				if (color) m.setColorAt(m.count, tmpColor.setRGB(color[0], color[1], color[2], T.SRGBColorSpace));
				m.count++;
			};
			/* jedno drzewo w (tp, y): sp – gatunek (świerk > 0,6 > sosna > 0,5 > dąb, lipa > 0,33 > brzoza > 0,22 > topola),
			   k – wielkość (1 – typowe drzewo ok. 11 m), q – obrót */
			const plant = (sp, k, y, seed, sh) => {
				if (ez) {
					// pudełko drzewa: podstawa 0,2 m w ziemi, wysokość i szerokość jak dawny pień z koroną
					const kind = sp > 0.6 ? 'spruce' : sp > 0.5 ? 'pine' : sp > 0.33 ? 'oak' : sp > 0.22 ? 'birch' : 'poplar';
					const kc = this.seasonCrown(kind);
					const [Hk, Wk, base] = { spruce: [11.7, 6.2, [0.17, 0.34, 0.2]], pine: [12.6, 6, [0.2, 0.36, 0.18]], oak: [10.1, 8.5, [0.29, 0.5, 0.2]], birch: [10.65, 4.4, [0.45, 0.62, 0.27]], poplar: [16.5, 3.6, [0.3, 0.48, 0.21]] }[kind];
					const H = Hk * k * (kind === 'spruce' || kind === 'pine' ? 1 : 0.85 + 0.15 * kc), W = Wk * k * kc;
					ez.push([kind, hash(seed + 0.37) < 0.5 ? 0 : 1, tp.x, y - 0.2 + H / 2, tp.z, W, H, q.clone(), this.seasonTree(kind, base.map((x) => x * sh), seed)]);
				} else if (sp > 0.6) { // świerk
					put(trunks, tp.x, y + 1 * k, tp.z, 0.45 * k, 2 * k, 0.45 * k);
					put(spruces, tp.x, y + 6.2 * k, tp.z, 6.2 * k, 11 * k, 6.2 * k, this.seasonTree('spruce', [0.17 * sh, 0.34 * sh, 0.2 * sh], seed));
				} else if (sp > 0.5) { // sosna: wysoki pień, płaska korona
					put(trunks, tp.x, y + 4.5 * k, tp.z, 0.45 * k, 9 * k, 0.45 * k);
					put(pines, tp.x, y + 9.6 * k, tp.z, 6 * k, 6 * k, 6 * k, this.seasonTree('pine', [0.2 * sh, 0.36 * sh, 0.18 * sh], seed));
				} else if (sp > 0.33) { // dąb, lipa: szeroka korona
					put(trunks, tp.x, y + 2.2 * k, tp.z, 0.75 * k, 4.4 * k, 0.75 * k);
					const kc = this.seasonCrown('oak');
					put(oaks, tp.x, y + 6.6 * k, tp.z, 8.5 * k * kc, 7 * k * kc, 8.5 * k * kc, this.seasonTree('oak', [0.29 * sh, 0.5 * sh, 0.2 * sh], seed));
				} else if (sp > 0.22) { // brzoza: biały pień, jasna wąska korona
					put(birchTrunks, tp.x, y + 3 * k, tp.z, 0.3 * k, 6 * k, 0.3 * k);
					const kc = this.seasonCrown('birch');
					put(birches, tp.x, y + 7.4 * k, tp.z, 4.4 * k * kc, 6.5 * k * kc, 4.4 * k * kc, this.seasonTree('birch', [0.45 * sh, 0.62 * sh, 0.27 * sh], seed));
				} else { // topola: wysoka i smukła
					put(trunks, tp.x, y + 1.5 * k, tp.z, 0.5 * k, 3 * k, 0.5 * k);
					const kc = this.seasonCrown('poplar');
					put(poplars, tp.x, y + 9 * k, tp.z, 3.6 * k * kc, 15 * k * kc, 3.6 * k * kc, this.seasonTree('poplar', [0.3 * sh, 0.48 * sh, 0.21 * sh], seed));
				}
			};
			// drzewa z mapy: w swoim miejscu, gatunek i wysokość z danych (bez – z pomiaru koron albo typowa); losowe drzewa
			// nie bliżej niż 5 m od nich (te same drzewa z pomiaru koron)
			const near = new Set();
			const SPK = [0.4, 0.4, 0.3, 0.1, 0.7, 0.55, 0.7];
			for (let j = 0; j < osmT.length; j++) {
				const o = osmT[j], s = vt[o], d = vt[o + 1], spc = vt[o + 2], h = vt[o + 3], seed = c * 1000 + 700 + j;
				if (s < s0 || s >= s1 || this.excluded(s, d) || this.inBuilding(s, d)) continue;
				near.add(Math.round(s / 5) + ',' + Math.round(d / 5));
				const ch = this.canopyAt ? this.canopyAt(s, d) : -1;
				let sp = SPK[spc] ?? 0.4;
				if (spc === 0) sp = hash(seed + 0.66) < 0.7 ? 0.4 : hash(seed + 0.67) < 0.6 ? 0.3 : 0.1; // liściaste: dąb, lipa / brzoza / topola
				if (spc === 6) sp = hash(seed + 0.66) < 0.5 ? 0.7 : 0.55;
				const Hk = sp > 0.6 ? 11.7 : sp > 0.5 ? 12.6 : sp > 0.33 ? 10.1 : sp > 0.22 ? 10.65 : 16.5;
				let k = (h > 0 ? h : ch >= 3 ? ch : 8 + hash(seed + 0.13) * 6) / Hk;
				k = Math.max(0.35, Math.min(2.4, k));
				const rc = sp > 0.6 ? 3.1 : sp > 0.5 ? 3 : sp > 0.33 ? 4.25 : sp > 0.22 ? 2.2 : 1.8;
				k = Math.min(k, this.crownRoom(s, d) / rc);
				if (k < 0.3) continue;
				R.sidePoint(this.route, s, d, tp);
				q.setFromAxisAngle(up, hash(seed + 0.9) * 6.28);
				plant(sp, k, this.terrainY(s, d), seed, 0.8 + hash(seed + 0.4) * 0.35);
			}
			const nearOsm = (s, d) => {
				if (!near.size) return false;
				const a0 = Math.round(s / 5), b0 = Math.round(d / 5);
				for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) if (near.has(a0 + x + ',' + (b0 + y))) return true;
				return false;
			};
			for (let i = 0; i < N; i++) {
				if ((i & 63) === 63) yield;
				const seed = c * 1000 + i;
				const s = s0 + hash(seed) * C;
				const side = hash(seed + 0.31) < 0.5 ? -1 : 1;
				const d = side * (11 + Math.pow(hash(seed + 0.57), 0.8) * 160);
				if (nearOsm(s, d)) continue;
				let ch = -1;
				if (this.env) {
					// trasa rzeczywista: z pomiaru koron (NMPT) – drzewa tam, gdzie rosną (korony od 3 m), wysokość z pomiaru;
					// bez pomiaru – wg zagospodarowania: w lasach gęsto, w parkach i na osiedlach rzadziej; nie w budynkach
					ch = this.canopyAt ? this.canopyAt(s, d) : -1;
					if (ch >= 0 ? ch < 3 || hash(seed + 0.77) > 0.85 : hash(seed + 0.77) > this.envTreeP(s, d)) continue;
					if (this.inBuilding(s, d) || this.onRoad(s, d) || this.areaAt(s, d) === 9 || this.envNoPlant(s, d)) continue;
				} else {
					const forest = vnoise(s * 0.006 + 2, d * 0.012);
					if (forest < 0.45 && hash(seed + 0.77) > 0.16) continue;
				}
				if (this.excluded(s, d) || this.field(s, d)) continue;
				R.sidePoint(this.route, s, d, tp);
				const y = this.terrainY(s, d);
				// skala: z pomiaru (typowe drzewo ok. 11 m), z rozrzutem; bez pomiaru – losowa
				let k = ch >= 0 ? Math.max(0.4, Math.min(2.4, ch / 11)) * (0.85 + hash(seed + 0.13) * 0.25) : 0.75 + hash(seed + 0.13) * 0.7;
				q.setFromAxisAngle(up, hash(seed + 0.9) * 6.28);
				let sp = vnoise(s * 0.01 + 5, d * 0.01) + (hash(seed + 0.66) - 0.5) * 0.25;
				// trasa rzeczywista: w lasach sosny, świerki, dęby i brzozy (bez topoli)
				if (this.env && sp <= 0.22) sp = 0.25 + hash(seed + 0.71) * 0.5;
				// las liściasty (11): dęby, lipy, brzozy; iglasty (12): sosny i świerki
				if (this.env) {
					const ar = this.areaAt(s, d);
					if (ar === 11) sp = 0.23 + hash(seed + 0.72) * 0.26;
					else if (ar === 12) sp = 0.51 + hash(seed + 0.72) * 0.45;
				}
				const sh = 0.8 + hash(seed + 0.4) * 0.35;
				// trasa rzeczywista: korona (promień wg gatunku) nie wchodzi w budynki ani nad jezdnię – drzewo mniejsze albo żadne
				const rc = sp > 0.6 ? 3.1 : sp > 0.5 ? 3 : sp > 0.33 ? 4.25 : sp > 0.22 ? 2.2 : 1.8;
				if (this.env && this.envFit) {
					const f = this.envFit(s, d, rc * k);
					if (!f || k * f < 0.35) continue;
					k *= f;
				}
				// korona przed skrajem torowiska (crownRoom) – drzewo mniejsze albo żadne
				k = Math.min(k, this.crownRoom(s, d) / rc);
				if (k < 0.35) continue;
				plant(sp, k, y, seed, sh);
			}
			// krzewy: przy torze, na skraju pól i lasów
			const nb = bushes.instanceMatrix.count;
			for (let i = 0; i < nb; i++) {
				const seed = c * 777 + i * 1.37;
				const s = s0 + hash(seed) * C;
				const d = (hash(seed + 0.2) < 0.5 ? -1 : 1) * (11 + hash(seed + 0.4) * 70);
				if (hash(seed + 0.6) > 0.7 || this.excluded(s, d) || this.field(s, d)) continue;
				// krzaki: w zieleni, a rzadko także na terenach kolejowych (zarośla przy torach), nie na drogach
				const chB = this.env && this.canopyAt ? this.canopyAt(s, d) : -1;
				if (this.env && (chB >= 0 ? chB < 1 && hash(seed + 0.41) > 0.25 : this.envTreeP(s, d) < 0.1 && !(this.areaAt(s, d) === 6 && hash(seed + 0.41) < 0.35))) continue;
				if (this.env && (this.inBuilding(s, d) || this.onRoad(s, d) || this.areaAt(s, d) === 9 || this.envNoPlant(s, d))) continue;
				R.sidePoint(this.route, s, d, tp);
				const y = this.terrainY(s, d);
				let k = 0.6 + hash(seed + 0.8) * 0.9;
				if (this.env && this.envFit) {
					const f = this.envFit(s, d, 1.5 * k);
					if (!f) continue;
					k *= f;
				}
				k = Math.min(k, this.crownRoom(s, d) / 1.5);
				if (k < 0.3) continue;
				q.setFromAxisAngle(up, hash(seed + 0.1) * 6.28);
				const sh = 0.8 + hash(seed + 0.3) * 0.3;
				const kb = this.seasonCrown('bush');
				if (ez) ez.push(['bush', hash(seed + 0.37) < 0.5 ? 0 : 1, tp.x, y - 0.15 + 1.2 * k * kb, tp.z, 3.2 * k * kb, 2.4 * k * kb, q.clone(), this.seasonTree('bush', [0.27 * sh, 0.45 * sh, 0.2 * sh], seed)]);
				else put(bushes, tp.x, y + 0.8 * k, tp.z, 3 * k * kb, 2.2 * k * kb, 3 * k * kb, this.seasonTree('bush', [0.27 * sh, 0.45 * sh, 0.2 * sh], seed));
			}
			// daleko od toru: zwarte masy lasu (duże bryły; drzewa z modeli – kępy impostorów)
			const nf = blobs.instanceMatrix.count;
			const impList = ez && NS.trees.impostors ? [] : null;
			for (let i = 0; i < nf; i++) {
				const seed = c * 555 + i * 2.1;
				const s = s0 + hash(seed) * C;
				// trasa rzeczywista: do 520 m (widoczność ±500 m)
				const d = (hash(seed + 0.2) < 0.5 ? -1 : 1) * (150 + hash(seed + 0.4) * (this.env ? 370 : 160));
				const chF = this.env && this.canopyAt ? this.canopyAt(s, d) : -1;
				const arF = this.env ? this.areaAt(s, d) : 0;
				if ((this.env ? (chF >= 0 ? chF < 6 : arF !== 1 && arF !== 11 && arF !== 12) : vnoise(s * 0.006 + 2, d * 0.012) < 0.5) || this.excluded(s, d) || this.field(s, d)) continue;
				if (this.env && (this.inBuilding(s, d) || this.envNoPlant(s, d))) continue;
				R.sidePoint(this.route, s, d, tp);
				const y = this.terrainY(s, d);
				// bryła 15k wysokości ze środkiem na 7k: z pomiaru koron
				let k = chF >= 0 ? Math.max(0.5, Math.min(2, chF / 14)) : 0.8 + hash(seed + 0.7) * 0.6;
				if (this.env && this.envFit) {
					const f = this.envFit(s, d, 10 * k);
					if (!f || k * f < 0.4) continue;
					k *= f;
				}
				k = Math.min(k, this.crownRoom(s, d) / 10);
				if (k < 0.4) continue;
				q.setFromAxisAngle(up, hash(seed + 0.1) * 6.28);
				const sh = 0.7 + hash(seed + 0.3) * 0.3;
				if (impList) {
					/* drzewa z modeli: zamiast bryły kępa 5 drzew-impostorów (trees.js) – las iglasty: świerki i sosny,
					   liściasty: dęby i brzozy, inny – mieszany */
					for (let j = 0; j < 5; j++) {
						const hj = hash(seed * 3.7 + j * 1.31);
						const sj = s + (hash(seed + j * 0.71) - 0.5) * 18 * k, dj = d + (hash(seed + j * 0.53) - 0.5) * 18 * k;
						const conifer = arF === 12 || (arF !== 11 && hj < 0.45);
						const kind = conifer ? (hj * 7.3 % 1 < 0.5 ? 'spruce' : 'pine') : (hj * 5.1 % 1 < 0.7 ? 'oak' : 'birch');
						R.sidePoint(this.route, sj, dj, tp);
						const H = 15 * k * (0.75 + 0.45 * hash(seed + j * 0.97)), W = H * (conifer ? 0.5 : 0.75);
						q.setFromAxisAngle(up, hash(seed + j * 0.37) * 6.28);
						const base = { spruce: [0.17, 0.34, 0.2], pine: [0.2, 0.36, 0.18], oak: [0.29, 0.5, 0.2], birch: [0.45, 0.62, 0.27] }[kind];
						impList.push([kind, tp.x, this.terrainY(sj, dj) - 0.3 + H * 0.5, tp.z, W, H, q.clone(), this.seasonTree(kind, base.map((x) => x * sh * 1.1), seed + j)]);
					}
				} else put(blobs, tp.x, y + 7 * k, tp.z, 20 * k, 15 * k, 20 * k, [0.17 * sh, 0.33 * sh, 0.17 * sh]);
			}
			const out = [trunks, birchTrunks, spruces, oaks, birches, poplars, pines, bushes, blobs];
			if (ez) {
				/* drzewa z modeli: bez siatek w kawałku – egzemplarze (macierz, kolor) zapisane w grupie kawałka i rysowane
				   ze wspólnych pul świata (treePool – siatka na gatunek, wariant, część i poziom szczegółów dla wszystkich
				   kawałków). WebGPURenderer ma narzut ok. 10 µs na obiekt w każdym przebiegu (obraz i 3 kaskady cieni), także
				   w paczkach rysowania; dawniej para siatek na gatunek i wariant w każdym kawałku (ok. 200 obiektów) – ok.
				   7 FPS na wysokiej. (Siatka zbiorcza – BatchedMesh – w Three na WebGPU to osobne wywołanie na egzemplarz.) */
				const rows = (list, keyOf, at) => {
					const mats = new Float32Array(list.length * 16), cols = new Float32Array(list.length * 3), keys = [];
					list.forEach((e, i) => {
						const [x, y, z, w, h, rot, col] = at(e);
						m4.compose(p3.set(x, y, z), rot, sc.set(w, h, w)).toArray(mats, i * 16);
						tmpColor.setRGB(col[0], col[1], col[2], T.SRGBColorSpace).toArray(cols, i * 3);
						keys.push(keyOf(e));
					});
					return { keys, mats, cols };
				};
				group.userData.ezTrees = rows(ez, (e) => e[0] + '|' + e[1], (e) => [e[2], e[3], e[4], e[5], e[6], e[7], e[8]]);
				if (impList && impList.length) {
					// (skala jak drzewa z modeli – drzewo w pudełku −0,5…0,5, płaszczyzny ±0,62 z marginesem wypalania)
					const IMP = NS.trees.impostors;
					group.userData.ezImp = rows(impList.filter((e) => IMP.geo[e[0]]), (e) => e[0], (e) => [e[1], e[2], e[3], e[4], e[5], e[6], e[7]]);
				}
				this.treePoolDirty = true;
			}
			for (const m of out) {
				if (!m.count) {
					m.dispose();
					continue;
				}
				m.castShadow = this.shadows && m !== blobs;
				m.receiveShadow = true;
				if (m.instanceColor) m.instanceColor.needsUpdate = true;
				group.add(m);
			}
		}

		/* Obiekty z mapy (trasa rzeczywista – generator: env.ba, env.pt):
		   - bariery (ba – rząd: rodzaj, wysokość w dm – 0 typowa, s, d, s, d…): 0 ekran akustyczny (płyty 4 m między
		     słupami H, 3,5 m), 1 mur (2 m, 0,3 m grubości), 2 płot z siatki (1,6 m, słupki co 3 m, siatka – faktura
		     z przezroczystością); scalone w kawałku po jednej bryle na rodzaj;
		   - punkty (pt – po 3: s, d, rodzaj): 0 latarnia – latarnia uliczna z kodu (real-env.js envLampMeshes: słup,
		     wysięgnik ku najbliższej jezdni, klosz, plama światła, światło nocą; dawne latarnie co 35 m nie bliżej niż
		     25 m od niej – osmLamps), 1 ławka, 2 kosz, 3 hydrant – modele (models.js); bez modeli – pominięte.
		   Odcinki i punkty przypisane do kawałka wg s (indeks raz na trasę) */
		*buildMapObjects(group, c, s0, s1, dyn) {
			const E = this.route.env, ba = E.ba, pt = E.pt;
			this.osmLamps = null;
			if (!(ba && ba.length) && !(pt && pt.length)) return;
			if (!this.objIdx || this.objIdx.ba !== ba || this.objIdx.pt !== pt) {
				const segs = new Map(), pts = new Map();
				(ba || []).forEach((row, ri) => {
					for (let i = 2; i + 3 < row.length; i += 2) {
						const cc = Math.floor((row[i] + row[i + 2]) / 2 / C);
						if (!segs.has(cc)) segs.set(cc, []);
						segs.get(cc).push([ri, i]);
					}
				});
				for (let i = 0; i < (pt || []).length; i += 3) {
					const cc = Math.floor(pt[i] / C);
					if (!pts.has(cc)) pts.set(cc, []);
					pts.get(cc).push(i);
				}
				this.objIdx = { ba, pt, segs, pts };
			}
			const S = this.objIdx.segs.get(c) || [], Pt = this.objIdx.pts.get(c) || [];
			// ---- bariery (z roślinami i obiektami – ustawienia) ----
			if (S.length && this.plants !== false) {
				const B = [0, 1, 2].map(() => ({ P: [], N: [], U: [] }));
				const a = {}, b = {};
				const quad = (G, p0, p1, p2, p3, n, u0, u1, v0, v1) => {
					for (const [p, u, v] of [[p0, u0, v0], [p1, u1, v0], [p2, u1, v1], [p0, u0, v0], [p2, u1, v1], [p3, u0, v1]]) {
						G.P.push(p[0], p[1], p[2]);
						G.N.push(n[0], n[1], n[2]);
						G.U.push(u, v);
					}
				};
				// prostopadłościan wzdłuż odcinka (x0, z0) → (x1, z1), grubość w, od y0 do y1 (każdy koniec osobno)
				const slab = (G, x0, z0, y0a, y0b, x1, z1, y1a, y1b, w, uLen) => {
					const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
					const A = [x0 + nx, z0 + nz], Bq = [x1 + nx, z1 + nz], Cq = [x1 - nx, z1 - nz], D = [x0 - nx, z0 - nz];
					const n1 = [-dz / L, 0, dx / L];
					quad(G, [A[0], y0a, A[1]], [Bq[0], y1a, Bq[1]], [Bq[0], y1b, Bq[1]], [A[0], y0b, A[1]], n1, 0, uLen, 0, y0b - y0a);
					quad(G, [Cq[0], y1a, Cq[1]], [D[0], y0a, D[1]], [D[0], y0b, D[1]], [Cq[0], y1b, Cq[1]], [-n1[0], 0, -n1[2]], 0, uLen, 0, y0b - y0a);
					quad(G, [A[0], y0b, A[1]], [Bq[0], y1b, Bq[1]], [Cq[0], y1b, Cq[1]], [D[0], y0b, D[1]], [0, 1, 0], 0, uLen, 0, w);
				};
				const post = (G, x, z, y0, y1, w) => {
					slab(G, x - w / 2, z, y0, y1, x + w / 2, z, y0, y1, w, w);
					slab(G, x, z - w / 2, y0, y1, x, z + w / 2, y0, y1, w, w);
				};
				for (const [ri, i] of S) {
					const row = ba[ri], kind = row[0];
					const H = row[1] > 0 ? row[1] / 10 : [3.5, 2, 1.6][kind];
					const sA = row[i], dA = row[i + 1], sB = row[i + 2], dB = row[i + 3];
					const len = Math.hypot(sB - sA, dB - dA);
					if (len < 0.3 || this.excluded((sA + sB) / 2, (dA + dB) / 2)) continue;
					const n = Math.max(1, Math.ceil(len / (kind === 2 ? 3 : 4)));
					for (let k = 0; k < n; k++) {
						const t0 = k / n, t1 = (k + 1) / n;
						const sa = sA + (sB - sA) * t0, da = dA + (dB - dA) * t0, sb = sA + (sB - sA) * t1, db = dA + (dB - dA) * t1;
						R.sidePoint(this.route, sa, da, a);
						R.sidePoint(this.route, sb, db, b);
						// podstawa: teren; przy torze (do 12 m) na estakadzie, moście albo nasypie – poziom toru (ekrany na pomoście)
						const base = (s2, d2) => { const y = this.terrainY(s2, d2) - 0.2; if (Math.abs(d2) > 12) return y; const th = R.heightAt(this.route, s2) - 0.7; return th > y + 0.5 ? th : y; };
						const ya = base(sa, da), yb = base(sb, db);
						const G = B[kind], segL = len / n;
						if (kind === 0) {
							slab(G, a.x, a.z, ya, ya + H, b.x, b.z, yb, yb + H, 0.14, segL);
							post(G, a.x, a.z, ya, ya + H + 0.1, 0.18);
						} else if (kind === 1) {
							slab(G, a.x, a.z, ya, ya + H, b.x, b.z, yb, yb + H, 0.3, segL);
						} else {
							// siatka (płaszczyzna dwustronna – faktura w metrach) i słupek z rurką u góry
							const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nn = [-dz / L, 0, dx / L];
							quad(G, [a.x, ya + 0.25, a.z], [b.x, yb + 0.25, b.z], [b.x, yb + H, b.z], [a.x, ya + H, a.z], nn, 0, segL, 0, H - 0.25);
							post(B[1], a.x, a.z, ya, ya + H + 0.05, 0.06);
						}
						if (k === n - 1 && kind === 0) post(B[0], b.x, b.z, yb, yb + H + 0.1, 0.18);
					}
					if ((ri & 31) === 31) yield;
				}
				const M = World.materials();
				if (!M.mapBarrier) {
					// ekrany: szarozielone płyty betonowe (wzór betonu z łatki), mury: beton; płot: siatka z faktury
					M.mapBarrier = [matS('#7e8b82', { roughness: 0.85, surf: 'concrete', side: T.DoubleSide }), matS('#9d978d', { roughness: 0.9, surf: 'concrete', side: T.DoubleSide }), World.fenceMaterial()];
				}
				B.forEach((G, kind) => {
					if (!G.P.length) return;
					const geo = new T.BufferGeometry();
					geo.setAttribute('position', new T.Float32BufferAttribute(G.P, 3));
					geo.setAttribute('normal', new T.Float32BufferAttribute(G.N, 3));
					geo.setAttribute('uv', new T.Float32BufferAttribute(G.U, 2));
					geo.computeBoundingSphere();
					const m = new T.Mesh(geo, M.mapBarrier[kind]);
					m.userData.ownGeometry = true;
					m.castShadow = this.shadows && kind !== 2;
					m.receiveShadow = true;
					group.add(m);
				});
			}
			// ---- latarnie z mapy (zawsze – także bez roślin i modeli: oświetlenie ulic nocą) ----
			if (Pt.length && this.envLampMeshes) {
				const spots = [], near = new Set();
				for (const i of Pt) {
					const s = pt[i], d = pt[i + 1];
					if (pt[i + 2] !== 0 || this.excluded(s, d) || this.inBuilding(s, d) || this.onRoad(s, d)) continue;
					// wysięgnik ku najbliższej jezdni (8 kierunków, 2–7 m); bez jezdni obok – ku torowi
					let ds = 0, dd = d > 0 ? -1 : 1, best = 1e9;
					for (let a = 0; a < 8; a++) {
						const ca = Math.cos(a * Math.PI / 4), sa = Math.sin(a * Math.PI / 4);
						for (let r = 2; r <= 7; r += 1.25) if (r < best && this.onRoad(s + ca * r, d + sa * r)) { best = r; ds = ca; dd = sa; break; }
					}
					spots.push({ s, d, ds, dd, kind: 'res', pool: best < 1e9 ? Math.min(7, best + 2) : 5, poolAt: best < 1e9 ? best : 1.2 });
					for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) near.add((Math.round(s / 25) + x) + ',' + (Math.round(d / 25) + y));
				}
				this.osmLamps = near;
				if (spots.length) {
					const L = this.envLampMeshes(group, spots);
					if (dyn) dyn.push({ type: 'lamps', lamps: L });
				}
			}
			// ---- obiekty punktowe (modele) ----
			const MD = NS.models;
			if (Pt.length && MD && MD.ready && this.plants !== false) {
				const pick = [[], ['painted_wooden_bench'], MD.variants('metal_trash_can'), MD.variants('fire_hydrant')];
				const scale = [1.6, 1, 0.95, 1];
				const byId = new Map();
				for (const i of Pt) {
					const s = pt[i], d = pt[i + 1], kind = pt[i + 2];
					const pool = (pick[kind] || []).filter((id) => MD.get(id));
					if (!pool.length || this.excluded(s, d) || this.inBuilding(s, d)) continue;
					const id = pool[Math.floor(hash(s * 0.37 + d) * pool.length)];
					if (!byId.has(id)) byId.set(id, []);
					byId.get(id).push([s, d, scale[kind]]);
				}
				const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
				for (const [id, L] of byId) {
					const I = MD.instanced(id, L.length);
					if (!I) continue;
					for (const [s, d, k] of L) {
						R.sidePoint(this.route, s, d, tp);
						q.setFromAxisAngle(up, hash(s * 1.3 + d * 0.7) * 6.28);
						m4.compose(p3.set(tp.x, this.terrainY(s, d) - 0.02, tp.z), q, sc.set(k, k, k));
						I.put(m4);
					}
					for (const m of I.meshes) {
						if (!m.count) { m.dispose(); continue; }
						m.castShadow = this.shadows && id.startsWith('street_lamp');
						m.receiveShadow = true;
						if (!id.startsWith('street_lamp')) m.userData.fine = true;
						group.add(m);
					}
				}
			}
		}

		// siatka ogrodzenia: oczka w romb (ok. 6 cm) z drutu ocynkowanego, przezroczyste tło – faktura na 1 m × 1 m
		static fenceMaterial() {
			const tex = canvasTexture('fence-mesh', 256, 256, (g, w) => {
				g.clearRect(0, 0, w, w);
				g.strokeStyle = '#d6dadc';
				g.lineWidth = 2.2;
				const n = 16, st = w / n;
				for (let k = -n; k <= 2 * n; k++) {
					g.beginPath();
					g.moveTo(k * st, 0);
					g.lineTo(k * st + w, w);
					g.stroke();
					g.beginPath();
					g.moveTo(k * st, w);
					g.lineTo(k * st + w, 0);
					g.stroke();
				}
			});
			tex.wrapS = tex.wrapT = T.RepeatWrapping;
			tex.anisotropy = 8;
			return patch(new T.MeshStandardMaterial({ map: tex, alphaTest: 0.35, side: T.DoubleSide, color: '#b9bec2', roughness: 0.45, metalness: 0.6 }), 'lit');
		}

		/* Rośliny przyziemne z modeli (models.js – Poly Haven CC0): w lesie i pod drzewami paprocie i krzewinki, przy torze
		   i na skrajach łąk pokrzywy i krzewinki – kępami (szum), kilka odmian każdej. Jesienią przybrązowiałe, zimą tylko
		   nieliczne. Bez modeli (brak plików) – nic (trawa jak dotąd); dalej niż drobne instancje (fine) – niewidoczne. */
		*buildPlants(group, c, s0, s1) {
			const MD = NS.models;
			if (!MD || !MD.ready || this.plants === false) return;
			const ferns = MD.variants('fern_02'), nettles = MD.variants('nettle_plant'), shrubs = MD.variants('shrub_03');
			if (!ferns.length && !nettles.length && !shrubs.length) return;
			const se = this.season || 'summer';
			const N = Math.round(900 * this.density * (se === 'winter' ? 0.2 : 1));
			const list = [];
			for (let i = 0; i < N; i++) {
				if (i % 400 === 399) yield;
				const seed = c * 7919 + i * 0.617;
				const s = s0 + hash(seed) * C;
				const near = hash(seed + 0.2) < 0.55;
				const d = (hash(seed + 0.3) < 0.5 ? -1 : 1) * (near ? 5 + hash(seed + 0.4) * 10 : 8 + Math.pow(hash(seed + 0.4), 1.5) * 90);
				if (this.eff(d) < 4.6 || this.excluded(s, d) || this.field(s, d)) continue;
				if (this.dip(s, d) > 1.2 || this.sandK(s, d) > 0.3) continue;
				if (this.env && (this.inBuilding(s, d) || this.onRoad(s, d) || this.areaAt(s, d) === 9 || this.envNoPlant(s, d))) continue;
				if (this.route.stations.some((x) => s > x.platformStart - 30 && s < x.platformEnd + 30 && Math.abs(d) < 18)) continue;
				// las: z danych (zagospodarowanie, korony) albo szum jak drzewa; skraj – kępy wg szumu
				const forest = this.env ? (this.areaAt(s, d) === 1 || this.areaAt(s, d) === 11 || this.areaAt(s, d) === 12 || (this.canopyAt && this.canopyAt(s, d) >= 3)) : vnoise(s * 0.006 + 2, d * 0.012) > 0.45;
				if (!forest && vnoise(s * 0.05 + 11, d * 0.05) < (near ? 0.45 : 0.62)) continue;
				const h = hash(seed + 0.7);
				const pool = forest ? (h < 0.7 ? ferns : shrubs) : (h < 0.6 ? nettles : shrubs);
				if (!pool.length) continue;
				const id = pool[Math.floor(hash(seed + 0.9) * pool.length)];
				// wielkość: paproć 0,8–1,4 ×, pokrzywa (model ok. 0,2 m) do ok. 0,8–1,1 m, krzewinka (0,3–0,4 m) do ok. 0,8 m
				const k = id.startsWith('fern') ? 0.8 + hash(seed + 0.5) * 0.6 : id.startsWith('nettle') ? 4 + hash(seed + 0.5) * 2 : 1.8 + hash(seed + 0.5) * 1.2;
				list.push([id, s, d, k, hash(seed + 0.1) * 6.28]);
			}
			if (!list.length) return;
			const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
			const tint = se === 'autumn' ? new T.Color(0.95, 0.72, 0.42) : se === 'winter' ? new T.Color(0.62, 0.55, 0.45) : null;
			const byId = new Map();
			for (const e of list) {
				if (!byId.has(e[0])) byId.set(e[0], []);
				byId.get(e[0]).push(e);
			}
			for (const [id, L] of byId) {
				const I = MD.instanced(id, L.length);
				if (!I) continue;
				for (const [, s, d, k, rot] of L) {
					R.sidePoint(this.route, s, d, tp);
					q.setFromAxisAngle(up, rot);
					m4.compose(p3.set(tp.x, this.terrainY(s, d) - 0.03, tp.z), q, sc.set(k, k, k));
					I.put(m4, tint);
				}
				for (const m of I.meshes) {
					if (!m.count) { m.dispose(); continue; }
					m.receiveShadow = true;
					// (tylko w kawałkach bliskich – updateLod; narzut na obiekt, z dalszych kawałków ułamek piksela)
					m.userData.near = true;
					if (m.instanceColor) m.instanceColor.needsUpdate = true;
					group.add(m);
				}
			}
		}

		/* kępy trawy z kart (WebGPU): 3 pionowe karty skrzyżowane co 60° z polami atlasu textures/foliage/grass_color
		   (tools/grass.py – źdźbła ambientCG CC0: niska, wysoka, z kłosami, rzadka), dwie odmiany (inne pola); bryła
		   −0,5…0,5 (kołysanie wariantu 'grass' od podstawy), u podstawy ciemniej, normalne ku górze (miękkie światło) */
		static grassCards() {
			if (World.GC) return World.GC;
			const tex = new T.TextureLoader().load('textures/foliage/grass_color.webp');
			tex.colorSpace = T.SRGBColorSpace;
			tex.anisotropy = 8;
			const geo = (cells) => {
				const P = [], N = [], U = [], Cc = [], I = [];
				cells.forEach((cell, f) => {
					const a = (f / cells.length) * Math.PI, ux = Math.cos(a) * 0.5, uz = Math.sin(a) * 0.5;
					const u0 = cell / 4 + 0.002, u1 = (cell + 1) / 4 - 0.002, b = P.length / 3;
					for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
						P.push(ux * sx, sy * 0.5, uz * sx);
						const nx = -uz * 0.5, nz = ux * 0.5, l = Math.hypot(nx, 1, nz);
						N.push(nx / l, 1 / l, nz / l);
						U.push(sx < 0 ? u0 : u1, sy < 0 ? 0 : 1);
						const v = sy < 0 ? 0.7 : 1;
						Cc.push(v, v, v);
					}
					I.push(b, b + 1, b + 2, b, b + 2, b + 3);
				});
				const g = new T.BufferGeometry();
				g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
				g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
				g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
				g.setAttribute('color', new T.Float32BufferAttribute(Cc, 3));
				g.setIndex(I);
				g.computeBoundingSphere();
				g.userData.shared = true;
				return g;
			};
			const material = patch(new T.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: T.DoubleSide, vertexColors: true, roughness: 0.95, color: '#ffffff' }), 'grass');
			// (atlas w szarościach – liniowo ok. 0,17: kolor egzemplarza × 5,5 daje jasność dawnych kęp)
			material.color.multiplyScalar(5.5);
			World.GC = { geos: [geo([0, 1, 3]), geo([2, 0, 1])], material };
			return World.GC;
		}

		// Kępy trawy i kwiaty na łąkach przy torze (gęsto blisko, rzadziej dalej); nie na polach, piasku i drogach.
		*buildGrass(group, c, s0, s1) {
			const M = World.materials(), G = World.G.grass;
			const N = Math.round(11000 * this.density);
			// WebGPU: kępy z kart z fakturą (World.grassCards – atlas ze zdjęć źdźbeł), dwie odmiany na przemian
			const GC = NS.gpu && World.opt.grassCards !== false ? World.grassCards() : null;
			const tufts = new T.InstancedMesh(GC ? GC.geos[0] : G.geo, GC ? GC.material : M.grass, N);
			const tufts2 = GC ? new T.InstancedMesh(GC.geos[1], GC.material, N) : null;
			if (tufts2) {
				tufts2.count = 0;
				tufts2.userData.fine = true;
			}
			const flowers = new T.InstancedMesh(G.flower, M.flower, Math.round(N * 0.08));
			tufts.count = flowers.count = 0;
			tufts.userData.fine = flowers.userData.fine = true;
			const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
			const FL = [[1, 1, 1], [1, 0.85, 0.2], [0.75, 0.45, 0.95], [0.95, 0.3, 0.3], [0.45, 0.6, 1]];
			for (let i = 0; i < N; i++) {
				if (i % 1000 === 999) yield;
				const seed = c * 9173 + i * 0.731;
				const s = s0 + hash(seed) * C;
				const side = hash(seed + 0.3) < 0.5 ? -1 : 1;
				const d = side * (4.2 + Math.pow(hash(seed + 0.6), 2.0) * 50);
				if (this.eff(d) < 4.4) continue;
				// bez trawy na peronach, ulicach i podwórkach miasteczek, drogach przy przystankach i na pastwiskach
				const st = this.route.stations.some((x) => {
					const big = x.type !== 'halt';
					const e = big ? 160 : 100;
					if (s > x.platformStart - 30 && s < x.platformEnd + 30 && d > -16 && d < 16) return true;
					return !this.env && s > x.platformStart - e && s < x.platformEnd + e && d > (big ? 28 : 22) && d < (big ? 215 : 135);
				}) || this.zones.some((z) => s > z.sA - 2 && s < z.sB + 2 && d > z.dA - 2 && d < z.dB + 2);
				if (st || this.dip(s, d) > 1.2 || this.sandK(s, d) > 0.3) continue;
				if (this.env) {
					// trasa rzeczywista: trawa na terenach zielonych, rzadko na osiedlach, wcale na placach i w budynkach
					const ak = this.areaAt(s, d);
					// tereny kolejowe: rzadkie chwasty; place handlowe i woda – bez trawy
					if ((ak === 6 && hash(seed + 0.53) > 0.2) || ak === 7 || ak === 9 || (ak === 5 && hash(seed + 0.47) > 0.35) || this.inBuilding(s, d) || this.onRoad(s, d)) continue;
				}
				const f = this.field(s, d);
				if (f && !f.border) continue;
				if (this.route.crossings.some((x) => Math.abs(s - x.pos) < 5)) continue;
				// kępy rosną skupiskami
				if (vnoise(s * 0.15 + 3, d * 0.15) < 0.25) continue;
				R.sidePoint(this.route, s, d, tp);
				const y = this.terrainY(s, d);
				const k = 0.55 + hash(seed + 0.9) * 0.6;
				q.setFromAxisAngle(up, hash(seed + 0.1) * 6.28);
				const dry = vnoise(s * 0.02 + 7, d * 0.02);
				const sh = 0.85 + hash(seed + 0.5) * 0.3;
				const gc = this.seasonGreen((0.3 + dry * 0.22) * sh, (0.5 + dry * 0.06) * sh, 0.18 * sh);
				// (karty: kępa ok. 0,55–1 m szeroka, 0,4–0,7 m wysoka; druga odmiana – co druga kępa)
				const tm = tufts2 && hash(seed + 0.44) < 0.5 ? tufts2 : tufts;
				if (GC) m4.compose(p3.set(tp.x, y + 0.5 * k * 0.75 - 0.03, tp.z), q, sc.set(k * 1.05, k * 0.75, k * 1.05));
				else m4.compose(p3.set(tp.x, y + 0.5 * k * 0.8, tp.z), q, sc.set(k * 1.6, k * 0.8, k * 1.6));
				tm.setMatrixAt(tm.count, m4);
				tm.setColorAt(tm.count++, tmpColor.setRGB(gc[0], gc[1], gc[2], T.SRGBColorSpace));
				// kwiaty – wiosną i latem
				if ((this.season === 'summer' || this.season === 'spring' || !this.season) && hash(seed + 0.71) < 0.08 && flowers.count < flowers.instanceMatrix.count) {
					m4.compose(p3.set(tp.x + 0.05, y + 0.85 * k, tp.z), q, sc.set(1, 0.7, 1));
					flowers.setMatrixAt(flowers.count, m4);
					const fc = FL[Math.floor(hash(seed + 0.33) * FL.length)];
					flowers.setColorAt(flowers.count++, tmpColor.setRGB(fc[0], fc[1], fc[2], T.SRGBColorSpace));
				}
			}
			for (const m of [tufts, tufts2, flowers]) {
				if (!m) continue;
				if (!m.count) { m.dispose(); continue; }
				m.receiveShadow = true;
				if (m.instanceColor) m.instanceColor.needsUpdate = true;
				group.add(m);
			}
			if (this.season === 'autumn') yield* this.buildLitter(group, c, s0, s1);
		}

		/* Opadłe liście (jesień): na torze (między szynami, na podkładach i podsypce) – gęsto na odcinkach „liście na torze”
		   (leafPatches, jak w symulacji – śliska szyna), rzadko gdzie indziej; w trawie przy torze i pod drzewami. Płaskie
		   listki z faktury, kolory: żółte, rdzawe, brązowe. */
		*buildLitter(group, c, s0, s1) {
			const M = World.materials();
			if (!World.litterGeo) {
				World.litterGeo = new T.PlaneGeometry(0.17, 0.11).rotateX(-Math.PI / 2);
				World.litterGeo.userData.shared = true;
			}
			const patchLen = (this.leafPatches || []).reduce((a, [x, y]) => a + Math.max(0, Math.min(s1, y) - Math.max(s0, x)), 0);
			const N = Math.round((C * 30 + patchLen * 120) * this.density); // odcinek „liście na torze”: ok. 25 liści na m²
			// perony stacji w tym kawałku: [s0, s1, krawędź d od…do, wysokość wierzchu nad główką szyny]
			const plats = [];
			for (const st of this.route.stations) {
				const P = st.platform, a = Math.max(s0, st.platformStart), b = Math.min(s1, st.platformEnd);
				if (b - a < 5) continue;
				const sg = P ? P.side : 1, e0 = P ? P.edge : 2.15, w = P ? P.width : 4.4, hh = P && typeof P.h === 'number' ? P.h : 0.76;
				plats.push([a, b, sg * (e0 + 1.0), sg * (e0 + w - 0.2), hh]);
			}
			const leaves = new T.InstancedMesh(World.litterGeo, M.litter, Math.max(1, N));
			leaves.count = 0;
			leaves.userData.fine = true;
			const LC = [[0.78, 0.55, 0.12], [0.66, 0.32, 0.1], [0.45, 0.3, 0.15], [0.82, 0.68, 0.2], [0.55, 0.22, 0.08], [0.4, 0.38, 0.16]];
			const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
			const h = (s) => R.heightAt(this.route, s);
			for (let i = 0; i < N && leaves.count < N; i++) {
				if (i % 1500 === 1499) yield;
				const seed = c * 4517 + i * 0.913;
				let s = s0 + hash(seed) * C, d, y;
				const onPatch = this.onLeafPatch(s);
				const r = hash(seed + 0.2);
				/* gdzie leży liść: odcinek „liście na torze” – na torze; poza nim na torze tylko pojedyncze (losowo), część na
				   peronach i ulicach, reszta na trawie – gęsto pod drzewami, rzadko na otwartym terenie */
				if (!onPatch && r >= 0.03 && r < 0.13 && plats.length) {
					const pl = plats[Math.floor(hash(seed + 0.31) * plats.length)];
					s = pl[0] + hash(seed + 0.32) * (pl[1] - pl[0]);
					d = pl[2] + hash(seed + 0.33) * (pl[3] - pl[2]);
					y = h(s) + pl[4] + 0.035;
				} else if (!onPatch && r >= 0.13 && r < 0.3 && this.env) {
					d = (hash(seed + 0.3) < 0.5 ? -1 : 1) * (8 + hash(seed + 0.4) * 70);
					if (!this.onRoad(s, d)) continue;
					y = this.terrainY(s, d) + 0.07;
				} else if (onPatch || r < 0.03) {
					// tor: między szynami i obok (podsypka); na podkładach wyżej
					d = (hash(seed + 0.3) - 0.5) * (onPatch ? 4.2 : 4.6);
					const onSleeper = Math.abs(d) < 1.3 && Math.abs(((s - s0) % 0.6) - 0.3) < 0.13;
					y = h(s) + (onSleeper ? -0.165 : Math.abs(d) < 1.75 ? -0.283 : -0.3 - Math.max(0, Math.abs(d) - 2.15) * 0.48);
					if (Math.abs(Math.abs(d) - 0.75) < 0.05) continue; // nie na główce szyny
				} else {
					// trawa przy torze i pod drzewami (gęstość wg zadrzewienia: pomiar koron albo zagospodarowanie)
					d = (hash(seed + 0.3) < 0.5 ? -1 : 1) * (4.4 + Math.pow(hash(seed + 0.4), 1.3) * 55);
					if (this.env && (this.inBuilding(s, d) || this.onRoad(s, d) || this.areaAt(s, d) === 9)) continue;
					if (this.excluded(s, d)) continue;
					const trees = this.env ? Math.max(this.envTreeP(s, d), this.canopyAt && this.canopyAt(s, d) >= 3 ? 1 : 0) : vnoise(s * 0.006 + 2, d * 0.012);
					if (hash(seed + 0.38) > 0.12 + 0.88 * Math.min(1, trees)) continue;
					y = this.terrainY(s, d) + 0.025;
				}
				R.sidePoint(this.route, s, d, tp);
				q.setFromAxisAngle(up, hash(seed + 0.5) * 6.28);
				const k = 0.8 + hash(seed + 0.6) * 0.9;
				m4.compose(p3.set(tp.x, y + 0.005, tp.z), q, sc.set(k, 1, k));
				leaves.setMatrixAt(leaves.count, m4);
				const lc = LC[Math.floor(hash(seed + 0.7) * LC.length)], v = 1.0 + hash(seed + 0.8) * 0.3;
				leaves.setColorAt(leaves.count++, tmpColor.setRGB(lc[0] * v, lc[1] * v, lc[2] * v, T.SRGBColorSpace));
			}
			if (!leaves.count) { leaves.dispose(); return; }
			leaves.receiveShadow = true;
			if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
			group.add(leaves);
		}

		// Dom: cokół, ściany (parterowy lub piętrowy), dach z okapem, komin, okna z ramami i parapetami, drzwi ze schodkiem, rynny.
		house(group, s, d, seed, size, aligned) {
			const g = new T.Group();
			const k = size || 1;
			const w = (7 + hash(seed) * 4) * k, l = (9 + hash(seed + 0.2) * 5) * k;
			const floors = hash(seed + 0.45) < 0.35 ? 2 : 1;
			const fh = 2.9, h = floors * fh + 0.4;
			const wallC = HOUSE_WALLS[Math.floor(hash(seed + 0.6) * HOUSE_WALLS.length)];
			const walls = mat(wallC, { roughness: 0.92 });
			const roofM = mat(HOUSE_ROOFS[Math.floor(hash(seed + 0.7) * HOUSE_ROOFS.length)], { roughness: 0.7 });
			const plinth = mat('#6f6a63', { roughness: 0.95 }), frame = mat('#f4f2ec'), sill = mat('#9a948a'), door = mat(['#5b3a25', '#2f4a5e', '#6b2a24'][Math.floor(hash(seed + 0.12) * 3)]);
			g.add(box(w + 0.2, 0.5, l + 0.2, plinth, 0, 0.25, 0));
			g.add(box(w, h - 0.4, l, walls, 0, 0.4 + (h - 0.4) / 2, 0));
			const rh = 2.6 + hash(seed + 0.8) * 1.6;
			g.add(roof(w + 1.1, rh, l + 1.0, roofM, 0, h, 0));
			// rynny wzdłuż okapów
			for (const sx of [-1, 1]) g.add(box(0.14, 0.12, l + 1.0, sill, sx * (w / 2 + 0.5), h - 0.05, 0));
			// komin
			g.add(box(0.7, rh * 0.9 + 0.6, 0.7, mat('#8c4a3a', { roughness: 0.9 }), w * 0.18, h + rh * 0.45, l * 0.22));
			const win = World.materials().litWin;
			const winRow = (x, sgn, zs, y) => {
				for (const z of zs) {
					g.add(box(0.12, 1.2, 1.25, frame, x + sgn * 0.01, y, z));
					g.add(box(0.13, 1.0, 1.05, win, x + sgn * 0.02, y, z));
					g.add(box(0.14, 0.04, 1.05, frame, x + sgn * 0.03, y, z));
					g.add(box(0.3, 0.08, 1.35, sill, x + sgn * 0.12, y - 0.66, z));
				}
			};
			for (let f = 0; f < floors; f++) {
				const y = 0.4 + f * fh + 1.55;
				winRow(w / 2, 1, [-l * 0.28, l * 0.28], y);
				winRow(-w / 2, -1, [-l * 0.28, 0, l * 0.28], y);
			}
			// drzwi na szczycie (krótszej ścianie) ze schodkiem i daszkiem
			g.add(box(1.1, 2.1, 0.1, door, -w * 0.2, 0.4 + 1.05, l / 2 + 0.03));
			g.add(box(1.5, 0.2, 0.7, plinth, -w * 0.2, 0.3, l / 2 + 0.35));
			g.add(box(1.6, 0.08, 0.8, roofM, -w * 0.2, 2.75, l / 2 + 0.4));
			for (let f = 0; f < floors; f++) {
				const y = 0.4 + f * fh + 1.55;
				g.add(box(1.05, 1.0, 0.13, win, w * 0.22, y, l / 2 + 0.02));
				g.add(box(1.25, 1.2, 0.12, frame, w * 0.22, y, l / 2 + 0.01));
			}
			this.place(g, s, d);
			g.position.y = this.terrainY(s, d) - 0.25;
			g.rotation.y += aligned ? (hash(seed + 0.3) < 0.5 ? 0 : Math.PI / 2) : (hash(seed + 0.95) - 0.5) * 0.5 + (hash(seed + 0.3) < 0.5 ? 0 : Math.PI / 2);
			g.traverse((o) => { o.castShadow = this.shadows; o.receiveShadow = true; });
			group.add(g);
		}

		buildHouses(group, c, s0, s1) {
			const r = this.route;
			for (let k = 0; k < 3; k++) {
				const seed = c * 31 + k * 7.7;
				const s = s0 + hash(seed) * C;
				const nearStation = r.stations.some((st) => s > st.platformStart - 250 && s < st.platformEnd + 250);
				if (hash(seed + 0.5) > (nearStation ? 0.95 : 0.3)) continue;
				const n = nearStation ? 3 : 1 + Math.floor(hash(seed + 0.2) * 2);
				for (let j = 0; j < n; j++) {
					const ss = s + (j - n / 2) * 22;
					const side = hash(seed + j + 0.1) < 0.5 ? -1 : 1;
					const d = side * (nearStation ? 35 + hash(seed + j) * 50 : 45 + hash(seed + j) * 110);
					if (!this.excluded(ss, d) && !this.excluded(ss + 8, d) && !this.excluded(ss - 8, d)) this.house(group, ss, d, seed + j * 3.3);
				}
			}
		}

		// ---------- stacje i przystanki ----------
		// 'station': dworzec, wiata, drugi peron, rozjazdy, bocznica z wagonami, miasteczko;
		// 'halt': przystanek – perony z wiatami, ławki, gospodarstwa w pobliżu.
		buildStation(group, dyn, st, i) {
			const M = World.materials();
			const big = st.type !== 'halt';
			const dbl = this.route.double;
			const mid = (st.platformStart + st.platformEnd) / 2;
			const len = st.platformEnd - st.platformStart;
			const g = new T.Group(); // układ lokalny toru – na końcu wygięty po łuku (bendGroup)
			const shadows = this.shadows;
			const add = (o) => { o.castShadow = shadows; o.receiveShadow = true; g.add(o); return o; };
			const steel = mat('#5d6670');
			const concrete = matS('#b8b2a6', { roughness: 0.9, surf: 'concrete' });
			const glows = [];
			const lamps = [];
			// stacja podziemna (peron w tunelu na trasie z mapy): bez latarń i wiat, światła hali, schody na powierzchnię
			const under = !!(this.env && this.envUnderground && this.envUnderground(st));
			// biegi schodów (od 1/4 i 3/4 peronu ku jego końcom, 10,8 m) – bez ławek i gablot na nich
			// wąski peron wyspowy (< 5 m): bez schodów na peronie (zostają pawilony nad końcami peronu)
			const stairsOn = under && !(st.platform && st.platform.island && (st.platform.width || 6) < 5);
			const onStairs = (z) => stairsOn && [-1, 1].some((e) => (z - e * len * 0.25) * e > -1.5 && (z - e * len * 0.25) * e < 12);

			// perony: prawy (tor gracza) i lewy (drugi tor)
			// trasa rzeczywista: jeden peron przy torze pociągu – strona, odległość krawędzi i szerokość z mapy
			// (albo wywnioskowane z torów); peron wyspowy ma wyposażenie pośrodku („tył” = oś peronu)
			const PL = st.platform;
			let sides;
			/* skrajnia: krawędź peronu co najmniej 1,72 m od osi toru (perony 0,76 m, PKP PLK) – dane z mapy bywają bliżej
			   (peron rysowany na obrysie zachodził pod pudło pociągu) */
			const CLR = 1.72;
			if (PL) {
				const pe = Math.max(PL.edge, CLR), pw = Math.max(1.2, PL.edge + PL.width - pe);
				const PLc = { edge: pe, width: pw };
				const sg = PL.side, c = sg * (PLc.edge + PLc.width / 2);
				/* tor z mapy tuż za tylną krawędzią (0,8–3 m od niej, na ponad połowie długości) – peron w praktyce wyspowy, choć
				   w danych bez tej cechy: wyposażenie i latarnie w osi peronu (dawniej przy tylnej krawędzi – przy torze, np. Orzesze) */
				let island = !!PL.island;
				if (!island && this.env && this.envTracksAt) {
					let n = 0, hit = 0;
					for (let s = st.platformStart + 10; s < st.platformEnd - 10; s += 10, n++) {
						if (this.envTracksAt(s).some((t) => { const x = t.d * sg - (PLc.edge + PLc.width); return x > 0.8 && x < 3; })) hit++;
					}
					island = n > 0 && hit > n / 2;
				}
				sides = [{ c, edge: sg * PLc.edge, line: sg * (PLc.edge + 0.45), back: island ? c : sg * (PLc.edge + PLc.width), sgn: sg, width: PLc.width, island }];
			} else {
				sides = [{ c: 4.15, edge: 2.15, line: 2.6, back: 6.1, sgn: 1, width: 4.4 }];
				if (dbl && !this.env) sides.push({ c: -8.75, edge: -6.75, line: -7.2, back: -10.7, sgn: -1, width: 4.4 });
			}
			const P0 = sides[0];
			const PM = World.platformMats();
			for (const P of sides) {
				/* płyta wierzchnia 0,22 m (płyty chodnikowe) nawisa 0,18 m nad ścianą od strony toru (jak na peronach PKP PLK –
				   pod krawędzią cień); trasa rzeczywista: ściana głębsza (peron na nasypie, przy moście lub obniżeniu terenu) */
				/* druga krawędź peronu (tył albo druga krawędź wyspy) w miejscu z: z szerokości peronu, ale co najmniej CLR przed
				   osią toru z mapy po tej stronie – peron zwężający się ku końcom (obrys z mapy) nie wchodzi na sąsiedni tor
				   (dawniej płyta o stałej szerokości na całej długości – tor z mapy przechodził przez peron) */
				const eA = Math.abs(P.edge), bNom = eA + P.width;
				const backAbs = (z) => {
					let b = bNom;
					if (this.env && this.envTracksAt) for (const t of this.envTracksAt(mid - z)) { const x = t.d * P.sgn; if (Math.abs(t.d) > 1 && x > eA + 0.5) b = Math.min(b, x - CLR); }
					return b;
				};
				P.backAbs = backAbs;
				const wb = this.env ? -2.24 : -0.24;
				/* płyta i ściana jedną bryłą z wierzchołkami co 3 m wzdłuż peronu: krawędź od toru prosta, tylna – w szerokości
				   z backAbs, między wierzchołkami skośnie (bez schodków – dawniej osobne prostokąty co 3 m dawały poszarpaną
				   krawędź) */
				const wAt = (z) => Math.max(0, backAbs(z) - eA);
				g.add(this.platformSlabVar(P.sgn, () => eA, (z) => eA + wAt(z), 0.22, len, 0.65, mid, PM.top, true));
				// ściana pod nawisem płyty (0,18 m od krawędzi; peron wyspowy – z obu stron)
				const wall = this.platformSlabVar(P.sgn, () => eA + 0.18, (z) => Math.max(eA + 0.18, eA + wAt(z) - (P.island ? 0.18 : 0)), 0.54 - wb, len, (0.54 + wb) / 2, mid, PM.wall, false);
				add(wall);
				// pochylnie na końcach (z = +len/2 – początek peronu, s = platformStart); nie tam, gdzie peron z mapy
				// biegnie dalej (dorysowana reszta obrysu)
				const ext = this.env && this.envPlatformExt ? this.envPlatformExt(st) : { start: false, end: false };
				// przystanek (bez wyspy) ma od strony z = +len/2 własną pochylnię przy tylnej krawędzi (haltPlatformExtras)
				// pochylnia (6 m za końcem) – szerokość przycięta jak peron w jej zasięgu
				const rampP = (z) => { const w = Math.min(backAbs(z), backAbs(z + Math.sign(z) * 6)) - eA; return w < 0.8 ? null : { c: P.sgn * (eA + w / 2), width: w }; };
				const rS = rampP(len / 2), rE = rampP(-len / 2);
				if (!ext.start && (big || P.island) && rS) this.platformRamp(g, rS, len / 2, 1, concrete, this.env ? 2.2 : 0.25);
				if (!ext.end && rE) this.platformRamp(g, rE, -len / 2, -1, concrete, this.env ? 2.2 : 0.25);
				// krawężnik peronowy (jasne płyty 0,5 m) i pas ostrzegawczy z wypustkami (0,4 m, 0,55–0,95 m od krawędzi)
				g.add(this.platformSlab(0.5, 0.03, len, P.edge + P.sgn * 0.25, 0.77, 0, mid, PM.edge));
				g.add(this.platformSlab(0.4, 0.03, len, P.edge + P.sgn * 0.75, 0.77, 0, mid, PM.tact));
				// latarnie: stożkowy słup, wygięty wysięgnik nad peron, oprawa; na co drugiej – numer peronu,
				// na środkowej – zegar, na niektórych – głośnik
				// odcinek pod wiatą: bez latarń (oświetla go wiata), zegar i tablice podwieszone pod jej dachem
				const { sl: shL, sz: shZ } = this.shelterSpan(big, P, len);
				// pod dachem z mapy albo pod wiatą z gry (gdy peron nie ma zadaszenia z mapy)
				const hasReal = this.env && this.envRoofOver ? this.envRoofOver(st) : false;
				const underRoof = (z) => (hasReal ? this.envRoofAt(mid - z, P.island ? P.c : P.back) : Math.abs(z - shZ) < shL / 2 + 1);
				const zs = [];
				for (let z = -len / 2 + 12; z < len / 2; z += 30) zs.push(z);
				// oś peronu w miejscu z: środek prawdziwej szerokości (obrys z mapy – peron bywa szerszy od modelu i zwęża się),
				// inaczej środek modelu; wyposażenie (tablice, ławki, kosze, gabloty) i latarnie peronu wyspowego stoją w tej osi
				// (nie dalej niż środek przyciętej szerokości – przy torze z mapy za tylną krawędzią)
				const xm = (z) => { const m = this.env && this.envPlatformMid ? this.envPlatformMid(st, mid - z) : null; const x = m === null ? Math.abs(P.c) : Math.max(eA + 1.6, Math.abs(m)); return P.sgn * Math.min(x, (eA + backAbs(z)) / 2); };
				const lampX = (z) => (P.island ? xm(z) : P.sgn * Math.min(Math.abs(P.back), backAbs(z)));
				const sxAt = (z) => lampX(z) - P.sgn * 0.55; // pod wysięgnikiem latarni
				zs.forEach((z, k) => {
					if (under || underRoof(z)) return;
					lamps.push(this.platformLamp(g, lampX(z), z, P.sgn));
					// pod wysięgnikiem (łuk 0,2–0,7 m od słupa, ok. 4,5 m nad główką szyny): zawiesia do rury wysięgnika
					if (k % 2 === 1) this.hangSign(g, this.platformTexture(P.sgn > 0 ? 1 : 2), 0.6, 0.42, lampX(z) - P.sgn * 0.45, 3.05, z, 4.47);
					if (k % 3 === 0) this.speaker(g, lampX(z), 3.7, z, P.sgn);
				});
				if (big) {
					/* zegar i tablica z numerem peronu: podwieszone pod wiatą z gry; przy zadaszeniu z mapy – pod nim (najbliższe
					   miejsce peronu pod dachem, zawiesie do spodu dachu), bez dachu – na słupie. Dawniej zawsze w miejscu wiaty
					   z gry i do wysokości 3,7 m – przy dachu z mapy w innym miejscu albo wyżej wisiały w powietrzu. */
					const dyG = PL && typeof PL.h === 'number' ? PL.h - 0.76 : 0;
					const mount = (z0, x0) => {
						if (!hasReal) return { z: z0, top: 3.7 };
						for (let dz = 0; dz < len; dz += 2) {
							for (const z of dz ? [z0 - dz, z0 + dz] : [z0]) {
								if (Math.abs(z) > len / 2 - 3) continue;
								const x = typeof x0 === 'function' ? x0(z) : x0, y = this.envRoofUnder(mid - z, x);
								if (y !== undefined) return { z, top: y - dyG };
							}
						}
						return null;
					};
					const post = (x, z, top) => g.add(box(0.1, top - 0.77, 0.1, steel, x, (top + 0.77) / 2, z));
					const mc = mount(shZ, sxAt);
					if (mc) dyn.push(this.platformClock(g, sxAt(mc.z), 3.05, mc.z, mc.top));
					else { post(sxAt(shZ), shZ, 2.64); dyn.push(this.platformClock(g, sxAt(shZ), 3.05, shZ, 3.46)); }
					const ms = mount(shZ + shL * 0.3, sxAt);
					if (ms && (!mc || Math.abs(ms.z - mc.z) > 3)) this.hangSign(g, this.platformTexture(P.sgn > 0 ? 1 : 2), 0.6, 0.42, sxAt(ms.z), 3.15, ms.z, ms.top);
					else if (!ms) { post(sxAt(shZ + shL * 0.3), shZ + shL * 0.3, 2.94); this.hangSign(g, this.platformTexture(P.sgn > 0 ? 1 : 2), 0.6, 0.42, sxAt(shZ + shL * 0.3), 3.15, shZ + shL * 0.3, 3.37); }
					// tablica odjazdów (elektroniczna, dwustronna): po drugiej stronie zegara
					// (pod dachem z mapy – najbliższe miejsce co najmniej 3,5 m od zegara i tablicy peronowej; bez dachu – na słupie)
					const bz = shZ - shL * 0.3, taken = [mc, ms].filter(Boolean).map((x) => x.z);
					const free = (m) => m && taken.every((z) => Math.abs(m.z - z) > 3.5);
					const mb = [bz, mc && mc.z - 4.5, mc && mc.z + 4.5, bz - 6].filter((z) => typeof z === 'number').map((z) => mount(z, sxAt)).find(free);
					if (mb) dyn.push(this.departureBoard(g, st.index, sxAt(mb.z), 2.95, mb.z, mb.top));
					else { post(sxAt(bz), bz, 2.58); dyn.push(this.departureBoard(g, st.index, sxAt(bz), 2.95, bz, 3.4)); }
				}
				// tablice z nazwą
				const nz = [-len * 0.38, len * 0.38], tz = [];
				for (let z = -len / 2 + 40; z < len / 2; z += 70) tz.push(z);
				for (const z of nz) {
					// tablica wzdłuż peronu, dwustronna (czytelna z pociągu i od strony poczekalni), na dwóch słupkach
					const bx = xm(z);
					this.nameBoard(g, st.name, 4.2, 0.8, bx, 3.0, z, false);
					for (const dz of [-1.7, 1.7]) g.add(box(0.08, 2.75, 0.08, steel, bx, 1.6, z + dz));
				}
				// wiata: słupy przy tylnej krawędzi peronu z wysięgnikami i zastrzałami, dach nachylony ku tyłowi
				// (rynna z tyłu, blenda z przodu, jasny spód), świetlówki pod dachem, tylna i boczne ściany szklane
				const { sl, sz } = this.shelterSpan(big, P, len, true);
				// prawdziwe zadaszenie z mapy (trasa rzeczywista) zastępuje wiatę z gry (dach rysuje buildEnvRoofs)
				const realRoof = hasReal;
				if (under) {
					// hala stacji podziemnej: tablice z nazwą na ścianie za peronem (co ok. 30 m), oprawy świetlówek pod stropem
					// świecą zawsze (światła z puli – także w dzień)
					const wx = P.island ? null : P.sgn * (P.edge + P.width + 1.38);
					// peron dochodzi do ściany hali (pas 1,6 m za tylną krawędzią)
					if (wx !== null) {
						g.add(this.platformSlab(1.6, 0.22, len, P.sgn * (P.edge + P.width + 0.8), 0.65, 0, mid, PM.top));
						g.add(box(1.6, 1.3, len, PM.wall, P.sgn * (P.edge + P.width + 0.8), -0.11, 0));
					}
					if (wx !== null) for (let z = -len / 2 + 20; z < len / 2 - 10; z += 30) this.nameBoard(g, st.name, 5.0, 0.9, wx, 3.6, z, false);
					// reklamy na ścianie hali (podświetlane plansze) między tablicami z nazwą
					if (wx !== null) {
						const ADS = ['#c8402f', '#2f6fc8', '#e0a52a', '#3a9a5b', '#8b4fc1', '#d8d4cc'];
						for (let z = -len / 2 + 35; z < len / 2 - 15; z += 30) {
							const c = new T.Color(ADS[Math.floor(hash(st.pos * 0.1 + z) * ADS.length)]);
							g.add(box(0.06, 1.7, 3.2, mat('#2a2d31'), wx + P.sgn * 0.02, 2.4, z));
							g.add(box(0.05, 1.5, 3.0, new T.MeshBasicMaterial({ color: c.multiplyScalar(0.9) }), wx - P.sgn * 0.02, 2.4, z));
						}
					}
					// kolumny stropu w osi szerokiego peronu (co 12 m; bez schodów, tablic i gablot)
					if ((PL ? PL.width : P.width) >= 6) {
						const colM = matS('#cfc9bd', { roughness: 0.7 });
						for (let z = -len / 2 + 8; z < len / 2 - 6; z += 12) {
							if (onStairs(z) || [-len * 0.38, len * 0.38].some((q) => Math.abs(q - z) < 3.2)) continue;
							// ławki (co 26 / 40 m od −len/2 + 18) i gabloty (co 70 m od −len/2 + 40) w tej samej osi
							const near = (z0, st2) => { const k = (z - z0) / st2; return Math.abs(k - Math.round(k)) * st2 < 2.6; };
							if (near(-len / 2 + 18, big ? 26 : 40) || near(-len / 2 + 19.5, big ? 26 : 40) || near(-len / 2 + 40, 70)) continue;
							const x = P.c + (P.island ? 0 : P.sgn * 0.6);
							// do stropu hali (envTunnelH – wg przykrycia, 6–7,6 m); dawniej stałe 6,3 m nad peronem – przy niższym stropie
							// wierzch kolumny wystawał na ulicę nad stacją (Warszawa Centralna)
							const hc = (this.env && this.env.dem ? Math.min(7.06, this.envTunnelH(mid - z)) : 7.06) - 0.76;
							g.add(box(0.55, hc, 0.55, colM, x, 0.76 + hc / 2, z));
						}
					}
					for (let z = -len / 2 + 10; z < len / 2; z += 20) {
						const o = new T.Object3D();
						o.position.set(P.c, this.env && this.env.dem ? Math.min(6.4, this.envTunnelH(mid - z) - 0.3) : 6.4, z); // pod stropem
						o.userData.always = true;
						o.userData.power = 1.1;
						o.userData.drop = 0.3;
						g.add(o);
						lamps.push(o);
					}
				} else if (!realRoof && big && P.island) {
					// peron wyspowy: dwie połowy wiaty plecami do siebie (słupy i szklana ściana w osi peronu, dach nad oboma
					// krawędziami – pochylony ku osi, z rynną pośrodku)
					const xc = xm(sz);
					lamps.push(...this.shelter(g, { sgn: P.sgn, edge: P.edge, back: xc, mid: true }, sl, sz));
					lamps.push(...this.shelter(g, { sgn: -P.sgn, edge: 2 * xc - P.edge, back: xc, mid: true }, sl, sz));
				} else if (!realRoof && big) lamps.push(...this.shelter(g, P, sl, sz));
				else if (!realRoof) lamps.push(...this.haltShelter(g, P, sz, st.name));
				// ławki (pod wiatą dwie; na przystanku rzadziej), kosze przy ławkach
				// peron wyspowy: ławki parami plecami do siebie (przodem do obu torów); przy jednym torze – oparciem od toru
				const bz = [];
				for (let z = -len / 2 + 18; z < len / 2 - 10; z += big ? 26 : 40) if (Math.abs(z - sz) > sl / 2 + 2) bz.push(z);
				if (big) bz.push(sz - sl * 0.18, sz + sl * 0.18);
				const clear = (z) => !onStairs(z) && nz.every((q) => Math.abs(q - z) > 3.2) && tz.every((q) => Math.abs(q - z) > 2.2);
				/* miejsce ławek i kosza w poprzek peronu: krawędź od strony toru eA, druga krawędź (tył albo druga krawędź
				   peronu wyspowego) – symetrycznie do osi; ławka (przód z nogami siedzących 0,7 m, tył 0,4 m) i kosz (0,25 m)
				   co najmniej FURN od krawędzi, przy której jest tor. Za wąski peron – bez ławek (kosza) */
				const seatsAt = (z, k) => {
					const x0 = xm(z), eA = P.edge, sg = P.sgn, far = 2 * x0 - eA, w = (far - eA) * sg;
					if (P.island) {
						if (w >= 2 * (FURN + 0.7 + 0.6)) return [[x0 - sg * 0.6, sg], [x0 + sg * 0.6, -sg]];
						if (w < FURN + 0.7 + 0.4 + FURN) return [];
						// jedna ławka, na zmianę przodem do jednego i drugiego toru
						return k % 2 ? [[eA + sg * (FURN + 0.7), sg]] : [[far - sg * (FURN + 0.7), -sg]];
					}
					const c = eA + sg * Math.max(FURN + 0.7, (x0 - eA) * sg);
					return (far - c) * sg >= 0.45 ? [[c, sg]] : [];
				};
				const binAt = (z) => {
					const x0 = xm(z), eA = P.edge, sg = P.sgn, far = 2 * x0 - eA, w = (far - eA) * sg;
					if (P.island) return w >= 2 * (FURN + 0.25) ? x0 : null;
					const c = eA + sg * Math.max(FURN + 0.25, (x0 - eA) * sg);
					return (far - c) * sg >= 0.3 ? c : null;
				};
				bz.forEach((z, k) => {
					if (!clear(z) || !clear(z + 1.5)) return;
					for (const [x, sgn] of seatsAt(z, k)) {
						this.bench(g, x, z, sgn);
						(g.userData.seats = g.userData.seats || []).push({ x, z, sgn });
					}
					const xb = binAt(z + 1.5);
					if (xb !== null) this.bin(g, xb, z + 1.5);
				});
				if (!big && !P.island) this.haltPlatformExtras(g, P, len, mid, st);
				// gabloty z rozkładem jazdy (na peronie wyspowym – dwustronne)
				for (const z of tz) {
					if (onStairs(z)) continue;
					const bx = xm(z);
					g.add(box(0.08, 1.9, 0.08, steel, bx, 1.7, z - 0.65));
					g.add(box(0.08, 1.9, 0.08, steel, bx, 1.7, z + 0.65));
					g.add(box(0.1, 1.0, 1.4, mat('#f2d23a'), bx, 2.2, z));
					for (const e of P.island ? [-1, 1] : [-1]) g.add(box(0.12, 0.8, 1.2, mat('#fffbe8'), bx + e * P.sgn * 0.02, 2.2, z));
				}
			}

			// budynek dworca (tylko stacje)
			const bz = -(len / 2 - 22);
			const realB = this.env && big ? this.envStationBuilding(i) : null;
			// dworzec z gry po stronie peronu (przy peronie wyspowym – brak, przy lewym – obrócony)
			const genB = big && !realB && !under && !(PL && P0.island); // stacja podziemna – bez dworca przy torze
			if (genB) {
				const sub = new T.Group();
				sub.userData.rigid = true; // budynek w całości (bez wyginania)
				dyn.push(this.stationBuilding(sub, st.name, bz, lamps));
				if (P0.sgn < 0) sub.rotation.y = Math.PI;
				g.add(sub);
			} else if (!big) {
				// biletomat przy wejściu na peron, tablica elektroniczna przy wiacie, przejście w poziomie szyn
				this.ticketMachine(g, P0.back - P0.sgn * 0.55, len / 2 - 7, P0.sgn);
				const last = this.route.stations[this.route.stations.length - 1].name;
				this.infoDisplay(g, P0.back - P0.sgn * 1.0, -len * 0.15 + 9, last === st.name ? this.route.stations[0].name : last);
				if (!this.env) this.pedCrossing(g, sides, len, mid);
			}

			/* stacja podziemna: schody z peronu do stropu (dwa wyjścia, ok. 1/4 i 3/4 peronu, przy tylnej ścianie albo w osi
			   peronu wyspowego) i pawilony wejściowe na powierzchni nad nimi (teren z pomiaru); wyjście pasażerów – u stóp
			   schodów */
			let underExit = null;
			if (under) {
				/* do stropu hali: górny stopień i ściany 0,3 m pod stropem (envTunnelH – najniższy na długości schodów); dawniej
				   stałe 7 m nad główką szyny, a strop hali bywa niższy (6–7,6 m wg przykrycia) – ściany i stopnie wystawały ponad
				   strop na ulicę nad stacją (Warszawa Centralna) */
				const P = P0, steps = 36, run = 0.3, w = 2.6;
				let hTop = 7.0;
				if (this.env && this.env.dem) for (let o = -len / 2; o <= len / 2; o += 4) hTop = Math.min(hTop, this.envTunnelH(mid - o) - 0.3);
				const rise = (hTop - 0.76) / steps;
				const sx = P.island ? P.c : P.sgn * (P.edge + P.width - w / 2 - 0.3);
				const stepM = matS('#a9a59c', { roughness: 0.85 }), railM = mat('#6d747c');
				for (const z0 of stairsOn ? [-len * 0.25, len * 0.25] : [-len / 2 + 2, len / 2 - 2]) {
					// biegną w stronę bliższego końca peronu (dół schodów od strony środka peronu)
					const dir = z0 < 0 ? -1 : 1;
					for (let k = 0; k < (stairsOn ? steps : 0); k++) {
						const h = (k + 1) * rise;
						g.add(box(w, h, run, stepM, sx, 0.76 + h / 2, z0 + dir * (k + 0.5) * run));
					}
					const L = steps * run, zc = z0 + (dir * L) / 2;
					for (const e of stairsOn ? [-1, 1] : []) {
						g.add(box(0.12, hTop - 0.76, L, mat('#cfcac0'), sx + e * (w / 2 + 0.06), (0.76 + hTop) / 2, zc)); // ściany biegu (do stropu)
						g.add(box(0.06, 0.06, L + 0.4, railM, sx + e * (w / 2 - 0.08), (0.76 + hTop) / 2 + 0.95, zc)); // poręcz (umownie wzdłuż)
					}
					if (!underExit && stairsOn) underExit = { x: sx, z: z0 - dir * 0.8 };
					// pawilon wejściowy na powierzchni nad górnym końcem schodów
					const sTop = mid - (z0 + dir * L), gy = this.demGround ? this.terrainY(sTop, sx) : null; // (z podniesieniem nad stropem)
					if (gy !== null && Number.isFinite(gy)) {
						const pg = new T.Group();
						this.place(pg, sTop, sx);
						pg.position.y = gy;
						const glass = World.materials().glass;
						pg.add(box(4.2, 0.35, 6.4, mat('#8d9096'), 0, 3.15, 0)); // dach
						for (const e of [-1, 1]) pg.add(box(0.12, 3.0, 6.0, glass, e * 2.0, 1.5, 0)); // ściany szklane
						pg.add(box(4.0, 3.0, 0.12, glass, 0, 1.5, -dir * 3.0));
						for (const [x, z] of [[-2, -3.1], [2, -3.1], [-2, 3.1], [2, 3.1]]) pg.add(box(0.16, 3.1, 0.16, mat('#5c6168'), x, 1.55, z));
						this.nameBoard(pg, st.name, 3.6, 0.55, 0, 3.65, 0, false);
						const lamp = new T.Object3D();
						lamp.position.set(0, 2.8, 0);
						lamp.userData.power = 0.7;
						pg.add(lamp);
						lamps.push(lamp);
						group.add(pg);
					}
				}
			}

			// wskaźnik W4
			if (st.stop) {
				const z = mid - st.pos;
				g.add(box(0.08, 2.3, 0.08, steel, 2.45, 1.85, z));
				this.fixedBoard(g, boardTexture('', '#ffffff', 'w4'), 'sq', 0.8, 2.45, 2.95, z);
			}
			// kozioł oporowy na stacji końcowej
			if (st.terminus) {
				const z = mid - this.route.bufferPos;
				const red = mat('#c62f2f');
				add(box(3.2, 0.5, 0.5, red, 0, 1.15, z));
				for (let k = -1; k <= 1; k += 2) g.add(box(0.5, 0.18, 0.52, mat('#f2f2f2'), k * 0.8, 1.15, z));
				add(box(0.3, 1.1, 2.4, mat('#4a3a2a'), -0.8, 0.5, z - 1));
				add(box(0.3, 1.1, 2.4, mat('#4a3a2a'), 0.8, 0.5, z - 1));
			}

			// pasażerowie: czekający (podchodzą do drzwi) i wysiadający (idą do wyjścia)
			const people = (cap) => {
				const { bodies, heads, setAnim } = World.peopleMeshes(cap);
				for (let k = 0; k < cap; k++) {
					bodies.setColorAt(k, tmpColor.setHex(PEOPLE[Math.floor(hash(st.pos + k * 3.7) * PEOPLE.length)]));
					heads.setColorAt(k, tmpColor.setHex(SKIN[Math.floor(hash(st.pos + k * 5.1) * SKIN.length)]));
				}
				bodies.castShadow = heads.castShadow = shadows;
				// pozycje zmieniają się w czasie – sfera ograniczająca z pierwszej klatki byłaby błędna
				bodies.frustumCulled = heads.frustumCulled = false;
				bodies.count = heads.count = 0;
				g.add(bodies, heads);
				return { bodies, heads, setAnim, cap, list: [] };
			};
			const W = people(24), A = people(8), I = people(8), S = people(16), Sp = people(6);
			/* siedzący na ławkach (co druga ławka zajęta, jedna albo dwie osoby, przodem do toru) i spacerujący
			   wzdłuż peronu (chodzą tam i z powrotem, czasem przystają) */
			for (const [k, seat] of (g.userData.seats || []).entries()) {
				const seed = st.pos + k * 3.3;
				if (hash(seed) < 0.45) continue;
				const two = hash(seed + 0.2) < 0.4;
				for (const dz of two ? [-0.45, 0.45] : [(hash(seed + 0.6) - 0.5) * 0.9]) {
					if (S.list.length >= S.cap) break;
					S.list.push({ x: seat.x + seat.sgn * 0.06, z: seat.z + dz, state: 'sit', yaw: seat.sgn * Math.PI / 2, spd: 0, seed: seed + dz });
				}
			}
			{
				// pas między krawędzią a wyposażeniem w osi peronu (ławki, tablice – na środku szerokości)
				const half = P0.width / 2, nM = 2 + Math.floor(hash(st.pos * 2.1) * (Sp.cap - 1));
				for (let k = 0; k < Sp.cap; k++) {
					const seed = st.pos + k * 17.3;
					const x = P0.edge + P0.sgn * (PAX + 0.1 + hash(seed) * Math.max(0.15, half - 2.1));
					Sp.list.push({ x, z: (hash(seed + 0.5) - 0.5) * (len - 30), tx: x, tz: (hash(seed + 0.9) - 0.5) * (len - 30), state: k < nM ? 'stroll' : 'off', spd: 0.9 + hash(seed + 0.7) * 0.5, wait: 0, seed, zr: (len - 30) / 2 });
				}
			}
			for (let k = 0; k < W.cap; k++) {
				const seed = st.pos + k * 13.1;
				const effW = P0.width / 2; // do wyposażenia w osi peronu
				W.list.push({ x: P0.edge + P0.sgn * (PAX + 0.05 + hash(seed) * Math.max(0.3, effW - PAX - 0.6)), z: (hash(seed + 0.5) - 0.5) * (len - 20), state: 'off', spd: 1.2 + hash(seed + 0.7) * 0.6, seed });
			}
			for (let k = 0; k < A.cap; k++) A.list.push({ x: 0, z: 0, state: 'off', spd: 1.1 + hash(st.pos + k) * 0.5, seed: st.pos + k * 5.3 });
			// czekający na drugim peronie – stoją
			if (sides.length > 1) {
				const n = Math.floor(hash(st.pos * 1.3) * 7);
				for (let k = 0; k < I.cap; k++) {
					const seed = st.pos + k * 7.9;
					I.list.push({ x: -8.0 - hash(seed) * 2.4, z: (hash(seed + 0.4) - 0.5) * (len - 20), state: k < n ? 'wait' : 'off', spd: 0, seed });
				}
			}
			// wyjście: drzwi dworca z gry, przy dworcu z mapy – w jego stronę (koniec peronu najbliżej budynku)
			// przystanek: wyjście pochylnią na początku peronu
			const xBack = P0.back - P0.sgn * 0.5;
			const exit = underExit ? underExit : realB || (big && !genB) ? { x: xBack, z: realB ? Math.max(-len / 2 + 8, Math.min(len / 2 - 8, mid - realB.cs)) : len / 2 - 4 }
				: big ? (P0.sgn > 0 ? { x: 11.5, z: bz + 2.5 } : { x: -11.5, z: -(bz + 2.5) })
				: P0.island ? { x: P0.c, z: len / 2 - 3 } : { x: P0.back - P0.sgn * 1.3, z: len / 2 + 4 };
			// tablica „Wyjście” ze strzałką – na peronie przy wyjściu, podwieszona w poprzek peronu
			{
				const ez = Math.max(-len / 2 + 4, Math.min(len / 2 - 4, exit.z + (genB ? 6 * P0.sgn : -6)));
				const ex = P0.edge + P0.sgn * 2.05;
				for (const dx of [-0.5, 0.5]) g.add(box(0.06, 2.45, 0.06, steel, ex + dx, 2.0, ez));
				g.add(box(1.1, 0.05, 0.06, steel, ex, 3.22, ez));
				this.hangSign(g, this.exitTexture(), 0.9, 0.3, ex, 2.98, ez, 3.2);
			}
			const grid = this.stationGrid(g, len);
			this.bendGroup(g, mid, new Set([W, A, I, S, Sp].flatMap((P) => [P.bodies, P.heads])));
			// peron z pomiaru: inna wysokość niż 0,76 m – cała stacja (peron, wyposażenie, pasażerowie) o różnicę
			if (PL && typeof PL.h === 'number' && Math.abs(PL.h - 0.76) > 0.01) g.position.y = PL.h - 0.76;
			dyn.push({ type: 'station', index: i, st, g, glows, lamps, W, A, I, S, Sp, exit, len, sgn: P0.sgn, edgeX: P0.edge, bend: mid, init: false, lastT: null, boarding: false, grid, width: P0.width });
			group.add(g);

			if (big && !this.env) this.buildStationTracks(group, dyn, st); // trasa rzeczywista: tory stacyjne z mapy
			if (!this.env) this.buildTown(group, dyn, st, big); // trasa rzeczywista: zabudowa z mapy
		}

		// rozjazdy między torami i bocznica z wagonami towarowymi (tylko wygląd)
		buildStationTracks(group, dyn, st) {
			if (!this.route.double) return;
			const ps = st.platformStart, pe = st.platformEnd;
			const ramp = (a, b, d0, d1) => (s) => d0 + (d1 - d0) * smoothstep(a, b, s);
			this.trackPath(group, ps - 230, ps - 170, ramp(ps - 230, ps - 170, 0, -4.6));
			if (!st.terminus) this.trackPath(group, pe + 100, pe + 160, ramp(pe + 100, pe + 160, -4.6, 0));
			const sEnd = st.terminus ? pe - 10 : pe + 70;
			this.trackPath(group, ps - 140, sEnd, ramp(ps - 140, ps - 70, -4.6, -15));
			// kozioł na końcu bocznicy
			const kb = new T.Group();
			this.place(kb, sEnd, -15);
			kb.add(box(3.2, 0.5, 0.5, mat('#c62f2f'), 0, 1.15, 0));
			kb.add(box(0.3, 1.1, 2.4, mat('#4a3a2a'), 0, 0.5, 1.2));
			group.add(kb);
			// wagony na bocznicy
			const wagons = new NS.TrainModel(this.scene, NS.TrainModel.OTHER.wagons, { player: false, shadows: this.shadows, seed: st.pos, reflect: !this.reflLayer });
			wagons.place(this.route, sEnd - 6, 1, -15);
			wagons.compact();
			dyn.push({ type: 'model', model: wagons });
		}

		// kawałek toru po dowolnej linii d(s): podsypka, podkłady, szyny
		trackPath(group, s0, s1, dAt) {
			const M = World.materials();
			const yb = (s, d, h, rel) => h + (Math.abs(rel) > 1.6 ? -0.95 : -0.33);
			group.add(new T.Mesh(this.ribbon(s0, s1, 3, [-2.2, -1.6, 1.6, 2.2], yb, null, null, dAt), M.ballast));
			for (const rd of [-0.75, 0.75]) {
				group.add(new T.Mesh(World.railAttr(this.ribbon(s0, s1, 3, [rd - 0.06, rd - 0.036, rd + 0.036, rd + 0.06], (s, d, h, rel) => h + (Math.abs(rel - rd) > 0.04 ? -0.22 : 0), null, null, dAt), 4), M.rail));
			}
			const n = Math.floor((s1 - s0) / 0.65);
			const sleepers = new T.InstancedMesh(GEO.sleeper, M.sleeper, n);
			const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(2.6, 0.2, 0.3), p3 = new T.Vector3(), up = new T.Vector3(0, 1, 0);
			for (let k = 0; k < n; k++) {
				const s = s0 + (k + 0.5) * 0.65;
				const slope = (dAt(s + 1) - dAt(s - 1)) / 2;
				R.sidePoint(this.route, s, dAt(s), tp);
				q.setFromAxisAngle(up, -tp.heading - Math.atan(slope));
				m4.compose(p3.set(tp.x, tp.y - 0.25, tp.z), q, sc);
				sleepers.setMatrixAt(k, m4);
			}
			sleepers.receiveShadow = true;
			sleepers.userData.fine = true;
			group.add(sleepers);
		}

		// ---------- zabudowa ----------
		fence(group, sA, sB, dA, dB, color) {
			const wood = mat(color || '#8b6a45');
			const sides = [[sA, dA, sB, dA], [sB, dA, sB, dB], [sB, dB, sA, dB], [sA, dB, sA, dA]];
			for (const [s1, d1, s2, d2] of sides) {
				const L = Math.hypot(s2 - s1, d2 - d1);
				const n = Math.max(1, Math.round(L / 3));
				for (let k = 0; k <= n; k++) {
					const s = s1 + ((s2 - s1) * k) / n, d = d1 + ((d2 - d1) * k) / n;
					const p = new T.Mesh(GEO.box, wood);
					this.place(p, s, d);
					p.position.y = this.terrainY(s, d) + 0.55;
					p.scale.set(0.14, 1.1, 0.14);
					group.add(p);
				}
				const sm = (s1 + s2) / 2, dm = (d1 + d2) / 2;
				for (const hgt of [0.45, 0.9]) {
					const r = new T.Mesh(GEO.box, wood);
					this.place(r, sm, dm);
					r.position.y = this.terrainY(sm, dm) + hgt;
					r.scale.set(Math.abs(d2 - d1) + 0.1, 0.08, Math.abs(s2 - s1) + 0.1);
					group.add(r);
				}
			}
		}

		church(group, s, d) {
			const g = new T.Group();
			this.place(g, s, d);
			g.position.y = this.terrainY(s, d) - 0.2;
			const white = mat('#efe9dc'), red = mat('#9c3b2c'), dark = mat('#3d4a52');
			g.add(box(10, 8, 20, white, 0, 4, 0));
			g.add(roof(11, 5.5, 21, red, 0, 8, 0));
			g.add(box(5.5, 17, 5.5, white, 0, 8.5, -12));
			const spire = new T.Mesh(GEO.cone, dark);
			spire.scale.set(5, 9, 5);
			spire.position.set(0, 21.5, -12);
			g.add(spire);
			g.add(box(0.2, 2, 0.2, mat('#d4af37'), 0, 27, -12));
			g.add(box(1, 0.2, 0.2, mat('#d4af37'), 0, 27.3, -12));
			for (let z = -6; z <= 6; z += 4) g.add(box(0.1, 3, 1.2, World.materials().litWin, 5.02, 4.5, z));
			g.add(box(0.1, 3, 1.6, mat('#5b3a25'), 0, 1.5, -14.8).rotateY(Math.PI / 2));
			g.traverse((o) => { o.castShadow = this.shadows; o.receiveShadow = true; });
			group.add(g);
		}

		barn(group, s, d, seed) {
			const g = new T.Group();
			this.place(g, s, d);
			g.position.y = this.terrainY(s, d) - 0.2;
			g.rotation.y += (hash(seed) - 0.5) * 0.3;
			const wood = mat(hash(seed + 1) < 0.5 ? '#7a4a2a' : '#8e3b2e');
			g.add(box(10, 6, 16, wood, 0, 3, 0));
			g.add(roof(11, 4.2, 17, mat('#5a5a5a'), 0, 6, 0));
			g.add(box(0.1, 4, 4, mat('#4a2d18'), 5.02, 2, 0));
			g.traverse((o) => { o.castShadow = this.shadows; o.receiveShadow = true; });
			group.add(g);
		}

		road(group, sA, sB, d0, d1, color) {
			group.add(new T.Mesh(this.ribbon(sA, sB, 4, [d0, d1], (s, d) => this.terrainY(s, d) + 0.09), mat(color || '#55555b', { surf: 'road' })));
		}

		crossRoad(group, s, dA, dB, color) {
			const cols = [];
			for (let d = dA; d <= dB; d += 4) cols.push(d);
			group.add(new T.Mesh(this.ribbon(s - 3, s + 3, 6, cols, (ss, d) => this.terrainY(ss, d) + 0.1), mat(color || '#55555b', { side: T.DoubleSide, surf: 'road' })));
		}

		// Miasteczko przy stacji: ulica wzdłuż torów, przecznice, domy z ogródkami, kościół, latarnie,
		// auta i przechodnie. Przy przystanku: gospodarstwa z oborą i pastwiskiem.
		buildTown(group, dyn, st, big) {
			const mid = (st.platformStart + st.platformEnd) / 2;
			const ps = st.platformStart, pe = st.platformEnd;
			const seed0 = st.pos * 0.37;
			if (!big) {
				this.road(group, mid - 90, mid + 90, 40, 44, '#8a7a5a');
				for (let k = 0; k < 2; k++) {
					const s = mid + (k ? 55 : -55), sd = seed0 + k * 9;
					this.house(group, s, 54, sd, 1, true);
					this.barn(group, s + 22 * (k ? 1 : -1), 62, sd + 3);
					this.fence(group, s - 24, s + 24, 47, 76);
					this.buildPasture(group, dyn, s - 25, s + 25, 80, 120, sd);
				}
				return;
			}
			const sA = ps - 130, sB = pe + 130;
			this.road(group, sA, sB, 43, 49);
			this.road(group, sA, sB, 41.5, 43, '#9a958c');
			this.road(group, sA, sB, 49, 50.5, '#9a958c');
			const cross = [mid - 60, mid + 60];
			for (const cs of cross) this.crossRoad(group, cs, 49, 175);
			let n = 0;
			for (let s = sA + 8; s < sB - 8; s += 21) {
				if (cross.some((c) => Math.abs(s - c) < 12)) continue;
				const sd = seed0 + n++ * 1.7;
				for (const d of [36, 60]) {
					if (d === 36 && s > ps - 30 && s < pe + 10) continue; // tu stoi dworzec
					if (hash(sd + d) < 0.15) continue;
					this.house(group, s, d, sd + d, 0.95, true);
					if (hash(sd + d * 3) < 0.45) this.fence(group, s - 9, s + 9, d > 45 ? 54 : 30, d > 45 ? 68 : 40, '#e8e2d4');
				}
			}
			for (const cs of cross) {
				for (let d = 76; d < 170; d += 22) {
					for (const side of [-1, 1]) {
						const sd = seed0 + d + side * 5 + cs;
						if (hash(sd) < 0.2) continue;
						this.house(group, cs + side * 13, d, sd, 0.9, true);
					}
				}
			}
			this.church(group, mid, 190);
			// latarnie uliczne
			const lamps = [];
			const steel = mat('#4a5058');
			for (let s = sA + 10; s < sB; s += 32) {
				const g = new T.Group();
				this.place(g, s, 41);
				g.position.y = this.terrainY(s, 41);
				g.add(box(0.14, 5.2, 0.14, steel, 0, 2.6, 0));
				g.add(box(1.5, 0.08, 0.08, steel, 0.75, 5.15, 0));
				const strut = box(0.06, 0.8, 0.06, steel, 0.35, 4.85, 0);
				strut.rotation.z = -0.9;
				g.add(strut);
				lamps.push(this.lampHead(g, 1.5, 5.1, 0, 0));
				group.add(g);
			}
			dyn.push({ type: 'lamps', lamps });
			// auta na ulicy
			const cars = [];
			for (let k = 0; k < 3; k++) {
				const car = this.carModel(st.pos + k * 3);
				group.add(car);
				const dir = k % 2 ? -1 : 1;
				cars.push({ obj: car, s: sA + hash(st.pos + k) * (sB - sA), d: dir > 0 ? 47.4 : 44.6, dir, speed: 8 + hash(st.pos + k * 2) * 5 });
			}
			dyn.push({ type: 'traffic', cars, sA, sB });
			// przechodnie
			const nw = 8;
			const { bodies, heads, setAnim } = World.peopleMeshes(nw);
			const list = [];
			for (let k = 0; k < nw; k++) {
				bodies.setColorAt(k, tmpColor.setHex(PEOPLE[Math.floor(hash(st.pos + k * 9.1) * PEOPLE.length)]));
				heads.setColorAt(k, tmpColor.setHex(SKIN[Math.floor(hash(st.pos + k * 4.3) * SKIN.length)]));
				list.push({ s: sA + hash(st.pos + k * 2.3) * (sB - sA), d: hash(st.pos + k) < 0.5 ? 42.2 : 49.8, dir: hash(st.pos + k * 4) < 0.5 ? -1 : 1, spd: 1.1 + hash(st.pos + k * 5) * 0.5, seed: k });
				setAnim(k, hash(st.pos + k * 6.1) * 6.28, 1, (1.1 + hash(st.pos + k * 5) * 0.5) * 0.62); // idą – tempo kroku wg prędkości
			}
			bodies.castShadow = heads.castShadow = this.shadows;
			bodies.frustumCulled = heads.frustumCulled = false;
			group.add(bodies, heads);
			dyn.push({ type: 'walkers', bodies, heads, list, sA, sB });
		}

		carModel(seed) {
			// model ma przód w +z, a w grze przód obiektów jadących wzdłuż kierunku ruchu to −z
			const g = new T.Group();
			const car = NS.props.carModel(seed, this.shadows);
			car.rotation.y = Math.PI;
			g.add(car);
			return g;
		}

		// Pastwisko z płotem i stadem krów lub owiec, które powoli się przemieszczają.
		buildPasture(group, dyn, sA, sB, dA, dB, seed) {
			this.fence(group, sA, sB, dA, dB);
			const sheep = hash(seed + 0.3) < 0.4;
			const n = sheep ? 8 + Math.floor(hash(seed) * 7) : 4 + Math.floor(hash(seed) * 4);
			const body = new T.InstancedMesh(sheep ? GEO.ico : GEO.box, mat('#ffffff', sheep ? { flatShading: true } : undefined), n);
			const head = new T.InstancedMesh(GEO.box, mat(sheep ? '#2a2a2a' : '#ffffff'), n);
			const legs = new T.InstancedMesh(GEO.box, mat('#2a2a2a'), n * 4);
			const list = [];
			for (let k = 0; k < n; k++) {
				const sd = seed + k * 3.3;
				const c = sheep ? [0.9, 0.88, 0.82] : [[0.95, 0.95, 0.93], [0.15, 0.13, 0.12], [0.5, 0.32, 0.2], [0.75, 0.6, 0.45]][Math.floor(hash(sd) * 4)];
				body.setColorAt(k, tmpColor.setRGB(c[0], c[1], c[2], T.SRGBColorSpace));
				if (!sheep) head.setColorAt(k, tmpColor.setRGB(c[0] * 0.9, c[1] * 0.9, c[2] * 0.9, T.SRGBColorSpace));
				list.push({ s: sA + 4 + hash(sd + 0.1) * (sB - sA - 8), d: dA + 4 + hash(sd + 0.2) * (dB - dA - 8), h: hash(sd + 0.3) * 6.28, t: hash(sd + 0.4) * 5, walk: false, graze: hash(sd + 0.5) < 0.6 });
			}
			for (const m of [body, head, legs]) {
				m.frustumCulled = false;
				m.castShadow = this.shadows;
				m.receiveShadow = true;
				group.add(m);
			}
			const parts = sheep
				? { body: [0, 0.75, 0, 1.2, 0.95, 1.5], head: [0, 0.95, -0.85, 0.35, 0.4, 0.45], leg: [0.3, 0.25, 0.45, 0.15, 0.5, 0.15], headDown: 0.45 }
				: { body: [0, 1.3, 0, 1.0, 1.0, 2.2], head: [0, 1.55, -1.35, 0.5, 0.55, 0.7], leg: [0.35, 0.45, 0.8, 0.2, 0.9, 0.2], headDown: 0.75 };
			const zone = { sA, sB, dA, dB };
			this.zones.push(zone);
			dyn.push({ type: 'herd', body, head, legs, list, parts, bounds: zone, zone });
		}

		buildPastures(group, dyn, c, s0) {
			for (let k = 0; k < 2; k++) {
				const seed = c * 41.7 + k * 13.3;
				if (hash(seed) > 0.22) continue;
				const sA = s0 + 15 + hash(seed + 0.1) * 100, sB = sA + 55 + hash(seed + 0.2) * 20;
				const side = hash(seed + 0.3) < 0.5 ? -1 : 1;
				const dn = 30 + hash(seed + 0.4) * 60, dfar = dn + 35 + hash(seed + 0.5) * 20;
				const dA = side > 0 ? dn : -dfar, dB = side > 0 ? dfar : -dn;
				let ok = true;
				for (let s = sA; s <= sB && ok; s += 10) {
					for (let d = dA; d <= dB && ok; d += 10) {
						if (this.excluded(s, d) || this.field(s, d) || vnoise(s * 0.006 + 2, d * 0.012) > 0.5) ok = false;
					}
				}
				if (ok) this.buildPasture(group, dyn, sA, sB, dA, dB, seed);
			}
		}

		// latarnia peronowa (x – słup, sgn – strona toru: wysięgnik w stronę −sgn); zwraca klosz
		/* pochylnia na końcu peronu (jak na PKP: ok. 1:8, z wierzchu peronu do poziomu główki szyny): klin o szerokości
		   peronu P od z0 w kierunku dir (±1 wzdłuż osi z), spód w ziemi na głębokości deep */
		platformRamp(g, P, z0, dir, material, deep) {
			const L = 6, h = 0.755;
			const sh = new T.Shape([new T.Vector2(0, -deep), new T.Vector2(L, -deep), new T.Vector2(L, 0.02), new T.Vector2(0, h)]);
			const geo = new T.ExtrudeGeometry(sh, { depth: P.width, bevelEnabled: false });
			// dir = +1: kształt x → +z, wyciągnięcie → −x; dir = −1: x → −z, wyciągnięcie → +x (obrót – bez odwracania ścian)
			geo.rotateY(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
			geo.translate(P.c + (dir > 0 ? P.width / 2 : -P.width / 2), 0, z0);
			const m = new T.Mesh(geo, material);
			m.castShadow = this.shadows;
			m.receiveShadow = true;
			g.add(m);
		}

		platformLamp(g, x, z, sgn) {
			if (!World.poleGeo) {
				World.poleGeo = new T.CylinderGeometry(0.055, 0.1, 1, 12);
				World.poleGeo.userData.shared = true;
			}
			const M = World.materials();
			const paint = matS('#3e4650', { roughness: 0.5, metalness: 0.55 });
			const base = new T.Mesh(GEO.cyl, paint);
			base.scale.set(0.36, 0.3, 0.36);
			base.position.set(x, 0.92, z);
			g.add(base);
			const pole = new T.Mesh(World.poleGeo, paint);
			// wymiary jak latarnie peronowe: wysięgnik ok. 3,6 m nad peronem, oprawa ok. 0,55 m
			pole.scale.set(0.85, 3.5, 0.85);
			pole.position.set(x, 0.77 + 0.3 + 1.75, z);
			pole.castShadow = this.shadows;
			g.add(pole);
			const collar = new T.Mesh(GEO.cyl, paint);
			collar.scale.set(0.2, 0.12, 0.2);
			collar.position.set(x, 2.3, z);
			g.add(collar);
			// wygięty wysięgnik: kilka odcinków rury po łuku
			const pts = [];
			for (let k = 0; k <= 5; k++) {
				const a = (k / 5) * (Math.PI / 2);
				pts.push([x - sgn * (0.7 - 0.7 * Math.cos(a)), 4.35 + 0.22 * Math.sin(a) - (k / 5) * 0.06]);
			}
			const up = new T.Vector3(0, 1, 0), va = new T.Vector3(), vb = new T.Vector3();
			for (let k = 0; k < pts.length - 1; k++) {
				va.set(pts[k][0], pts[k][1], z);
				vb.set(pts[k + 1][0], pts[k + 1][1], z);
				const t = new T.Mesh(GEO.cyl, paint);
				t.scale.set(0.06, va.distanceTo(vb), 0.06);
				t.position.copy(va).add(vb).multiplyScalar(0.5);
				t.quaternion.setFromUnitVectors(up, vb.sub(va).normalize());
				g.add(t);
			}
			g.add(box(0.05, 0.32, 0.05, paint, x, 4.35, z));
			const end = pts[pts.length - 1];
			return this.lampHead(g, end[0] - sgn * 0.22, end[1] - 0.05, z, 0.77, false, 0.7);
		}

		// dwustronna tabliczka podwieszona w poprzek peronu (lico w stronę ±z) na dwóch zawiesiach
		hangSign(g, tex, w, h, x, y, z, hangTo) {
			if (!World.boardGeo) {
				World.boardGeo = new T.PlaneGeometry(1, 1);
				World.boardGeo.userData.shared = true;
			}
			World.signMats = World.signMats || new Map();
			if (!World.signMats.has(tex.uuid)) {
				const m = NS.util.patch(new T.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.05 }), 'lit');
				World.signMats.set(tex.uuid, m);
			}
			const m = World.signMats.get(tex.uuid);
			const frame = matS('#c9cdd2', { roughness: 0.4, metalness: 0.5 });
			g.add(box(0.06, h + 0.08, w + 0.08, frame, x, y, z).rotateY(Math.PI / 2));
			for (const side of [1, -1]) {
				const p = new T.Mesh(World.boardGeo, m);
				p.scale.set(w, h, 1);
				p.rotation.y = side > 0 ? 0 : Math.PI;
				p.position.set(x, y, z + side * 0.035);
				g.add(p);
			}
			// zawiesia do wysięgnika / dachu – na krawędziach tablicy w jej płaszczyźnie (tablica w poprzek peronu, wzdłuż
			// wysięgnika; dawniej przed i za tablicą – obok wysięgnika, w powietrzu)
			const top = hangTo || y + h / 2 + 0.25, hl = top - (y + h / 2);
			for (const dx of [-w * 0.35, w * 0.35]) g.add(box(0.025, hl, 0.025, frame, x + dx, y + h / 2 + hl / 2, z));
		}

		/* Tablica odjazdów: obraz z płótna (odświeżany w updateDyn, gdy pociąg jest blisko stacji – sim.departures),
		   w ramie, zawieszona jak tablice peronowe (w poprzek peronu, czytelna wzdłuż niego) */
		departureBoard(g, index, x, y, z, hangTo) {
			const w = 1.7, h = 0.74;
			const cv = document.createElement('canvas');
			cv.width = 512;
			cv.height = 224;
			const tex = new T.CanvasTexture(cv);
			tex.colorSpace = T.SRGBColorSpace;
			tex.anisotropy = 16;
			const m = NS.util.patch(new T.MeshStandardMaterial({ map: tex, roughness: 0.35, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 }), 'lit');
			if (!World.boardGeo) { World.boardGeo = new T.PlaneGeometry(1, 1); World.boardGeo.userData.shared = true; }
			const frame = matS('#2b3036', { roughness: 0.45, metalness: 0.5 });
			g.add(box(0.1, h + 0.1, w + 0.1, frame, x, y, z).rotateY(Math.PI / 2));
			const faces = [];
			for (const side of [1, -1]) {
				const p = new T.Mesh(World.boardGeo, m);
				p.scale.set(w, h, 1);
				p.rotation.y = side > 0 ? 0 : Math.PI;
				p.position.set(x, y, z + side * 0.055);
				g.add(p);
				faces.push(p);
			}
			const top = hangTo || y + h / 2 + 0.25, hl = top - (y + h / 2);
			for (const dx of [-w * 0.38, w * 0.38]) g.add(box(0.03, hl, 0.03, frame, x + dx, y + h / 2 + hl / 2, z));
			return { type: 'board', index, faces, cv, tex, ownMat: m, next: 0 };
		}
		drawBoard(d, sim) {
			const c = d.cv.getContext('2d'), W = d.cv.width, H = d.cv.height;
			const hm = (t) => { const s = (((Math.floor(sim.route.startClock + t) % 86400) + 86400) % 86400); return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0'); };
			c.fillStyle = '#0a1830';
			c.fillRect(0, 0, W, H);
			c.fillStyle = '#e9eef5';
			c.font = 'bold 26px system-ui, sans-serif';
			c.textBaseline = 'middle';
			c.fillText('ODJAZDY', 16, 22);
			c.textAlign = 'right';
			c.fillText(hm(sim.time), W - 16, 22);
			c.textAlign = 'left';
			c.fillStyle = '#2d4a74';
			c.fillRect(0, 42, W, 2);
			const rows = sim.departures ? sim.departures(d.index, 4) : [];
			c.font = '600 23px system-ui, sans-serif';
			if (!rows.length) { c.fillStyle = '#8ea3bf'; c.fillText('brak odjazdów w ciągu 2 godzin', 16, 80); }
			rows.forEach((r, k) => {
				const yy = 70 + k * 42, late = Math.round((r.time - r.plan) / 60);
				c.fillStyle = '#ffd25a';
				c.fillText(hm(r.plan), 16, yy);
				c.fillStyle = '#e9eef5';
				let dest = r.dest;
				while (c.measureText(dest).width > 250 && dest.length > 4) dest = dest.slice(0, -2) + '…';
				c.fillText(dest, 96, yy);
				c.fillStyle = '#8ea3bf';
				c.fillText('tor ' + r.track, 362, yy);
				if (late >= 2) { c.fillStyle = '#ff8a5a'; c.textAlign = 'right'; c.fillText('+' + late + ' min', W - 12, yy); c.textAlign = 'left'; }
			});
			d.tex.needsUpdate = true;
		}

		platformTexture(n) {
			return canvasTexture('peron|' + n, 256, 176, (c, w, h) => {
				c.fillStyle = '#1c3d6e';
				c.fillRect(0, 0, w, h);
				c.strokeStyle = '#ffffff';
				c.lineWidth = 6;
				c.strokeRect(6, 6, w - 12, h - 12);
				c.fillStyle = '#ffffff';
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.font = '800 96px system-ui, sans-serif';
				c.fillText(String(n), w / 2, h * 0.42);
				c.font = '600 30px system-ui, sans-serif';
				c.fillText('peron', w / 2, h * 0.82);
			});
		}

		exitTexture() {
			return canvasTexture('wyjscie', 384, 124, (c, w, h) => {
				c.fillStyle = '#1e7b3c';
				c.fillRect(0, 0, w, h);
				c.fillStyle = '#ffffff';
				c.textAlign = 'left';
				c.textBaseline = 'middle';
				c.font = '700 54px system-ui, sans-serif';
				c.fillText('Wyjście', 30, h / 2 + 2);
				// strzałka
				c.beginPath();
				c.moveTo(w - 110, h / 2 - 10); c.lineTo(w - 60, h / 2 - 10); c.lineTo(w - 60, h / 2 - 30);
				c.lineTo(w - 22, h / 2); c.lineTo(w - 60, h / 2 + 30); c.lineTo(w - 60, h / 2 + 10); c.lineTo(w - 110, h / 2 + 10);
				c.closePath();
				c.fill();
			});
		}

		// głośnik peronowy na słupie latarni
		speaker(g, x, y, z, sgn) {
			const grey = matS('#d6d8da', { roughness: 0.5, metalness: 0.3 });
			g.add(box(0.12, 0.12, 0.12, grey, x - sgn * 0.12, y, z));
			const horn = new T.Mesh(GEO.cone, grey);
			horn.scale.set(0.3, 0.42, 0.3);
			horn.rotation.z = sgn * Math.PI / 2 * 0.85;
			horn.position.set(x - sgn * 0.35, y - 0.03, z);
			g.add(horn);
		}

		// zegar peronowy (dwustronny), wskazówki pokazują czas gry
		platformClock(g, x, y, z, hangTo) {
			const face = canvasTexture('zegar', 256, 256, (c, w) => {
				c.fillStyle = '#ffffff';
				c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2); c.fill();
				c.fillStyle = '#111111';
				for (let k = 0; k < 60; k++) {
					const a = (k / 60) * Math.PI * 2, big = k % 5 === 0;
					c.save(); c.translate(w / 2, w / 2); c.rotate(a);
					c.fillRect(-(big ? 5 : 2), -w / 2 + 14, big ? 10 : 4, big ? 30 : 12);
					c.restore();
				}
			});
			const fm = NS.util.patch(new T.MeshStandardMaterial({ map: face, roughness: 0.4 }), 'lit');
			fm.userData.shared = true;
			if (!World.discGeo) { World.discGeo = new T.CircleGeometry(0.5, 32); World.discGeo.userData.shared = true; }
			const body = new T.Mesh(GEO.cyl, matS('#2a2d31', { roughness: 0.4, metalness: 0.5 }));
			body.scale.set(0.82, 0.12, 0.82);
			body.rotation.x = Math.PI / 2;
			body.position.set(x, y, z);
			g.add(body);
			const top = hangTo || y + 0.85;
			g.add(box(0.05, top - y - 0.4, 0.05, matS('#3e4650', { metalness: 0.55, roughness: 0.5 }), x, (top + y + 0.4) / 2, z));
			const hands = [];
			for (const side of [1, -1]) {
				const f = new T.Mesh(World.discGeo, fm);
				f.scale.setScalar(0.74);
				f.rotation.y = side > 0 ? 0 : Math.PI;
				f.position.set(x, y, z + side * 0.065);
				g.add(f);
				const black = mat('#111111');
				const hour = new T.Group(), minute = new T.Group();
				hour.add(box(0.035, 0.2, 0.01, black, 0, 0.08, 0));
				minute.add(box(0.025, 0.3, 0.01, black, 0, 0.12, 0));
				for (const h of [hour, minute]) {
					h.position.set(x, y, z + side * 0.072);
					if (side < 0) h.rotation.y = Math.PI;
					g.add(h);
				}
				hands.push({ hour, minute, side });
			}
			return { type: 'clock', hands };
		}

		/* Wiata przystankowa (jak na zmodernizowanych przystankach): stalowa rama grafitowa, płaski dach z blendą,
		   tylna i boczne ściany szklane w ramach, ławka w środku, tabliczka z nazwą nad wejściem, listwa LED.
		   Zwraca punkt światła do puli świateł nocą. */
		haltShelter(g, P, sz, name) {
			const M = World.materials();
			const frame = matS('#3a3f45', { roughness: 0.45, metalness: 0.6 });
			const roofM = matS('#4a5058', { roughness: 0.5, metalness: 0.4 });
			const sg = P.sgn, L = 7, H = 2.65, y0 = 0.77;
			const xb = P.back - sg * 0.3;
			// głębokość: dach z blendą (0,45 m przed słupami) kończy się co najmniej 0,3 m przed krawędzią peronu
			const D = Math.max(1.0, Math.min(2.0, Math.abs(xb - P.edge) - 0.75)), xf = xb - sg * D, xc = (xb + xf) / 2;
			// słupy
			for (const x of [xb, xf]) for (const z of [sz - L / 2, sz + L / 2]) {
				g.add(box(0.1, H, 0.1, frame, x, y0 + H / 2, z));
				g.add(box(0.22, 0.03, 0.22, frame, x, y0 + 0.015, z)); // stopa (płyta z kotwami)
			}
			g.add(box(0.1, H, 0.1, frame, xb, y0 + H / 2, sz));
			// rura spustowa przy tylnym narożniku, gablota z rozkładem jazdy na ścianie bocznej (od zewnątrz)
			const dp = new T.Mesh(GEO.cyl, frame);
			dp.scale.set(0.08, H, 0.08);
			dp.position.set(xb + sg * 0.1, y0 + H / 2, sz + L / 2 + 0.12);
			g.add(dp);
			g.add(box(0.7, 0.9, 0.06, mat('#f2d23a'), xb - sg * 0.5, y0 + 1.45, sz - L / 2 - 0.05));
			g.add(box(0.6, 0.78, 0.02, mat('#fffbe8'), xb - sg * 0.5, y0 + 1.45, sz - L / 2 - 0.09));
			// dach z lekkim spadkiem ku tyłowi i blendą
			const roof = box(D + 0.6, 0.1, L + 0.6, roofM, xc - sg * 0.15, y0 + H + 0.08, sz);
			roof.rotation.z = sg * 0.05;
			roof.castShadow = this.shadows;
			g.add(roof);
			g.add(box(0.05, 0.28, L + 0.6, frame, xf - sg * 0.42, y0 + H + 0.05, sz));
			// blenda także z boków i z tyłu dachu, okapnik pod przednią krawędzią
			for (const e of [-1, 1]) g.add(box(D + 0.62, 0.2, 0.05, frame, xc - sg * 0.15, y0 + H + 0.06, sz + e * (L / 2 + 0.3)));
			g.add(box(0.05, 0.2, L + 0.6, frame, xb + sg * 0.17, y0 + H + 0.12, sz));
			g.add(box(0.08, 0.03, L + 0.6, frame, xf - sg * 0.4, y0 + H - 0.1, sz));
			/* ściany szklane: tylna (dwa pola) i boczne (do połowy głębokości – wejście od frontu); na szybach matowy pas
			   ostrzegawczy (ok. 1,4 m) – jak na wiatach PKP PLK, szyba widoczna dla idących */
			const band = mat('#e8ecef', { roughness: 0.6, transparent: true, opacity: 0.75 });
			for (const [z0, z1] of [[sz - L / 2, sz], [sz, sz + L / 2]]) {
				g.add(box(0.03, H - 0.25, z1 - z0 - 0.12, M.glass, xb, y0 + (H - 0.25) / 2 + 0.12, (z0 + z1) / 2));
				for (const y of [y0 + 0.12, y0 + H - 0.12]) g.add(box(0.06, 0.06, z1 - z0, frame, xb, y, (z0 + z1) / 2));
				g.add(box(0.036, 0.1, z1 - z0 - 0.14, band, xb, y0 + 1.4, (z0 + z1) / 2));
			}
			for (const z of [sz - L / 2, sz + L / 2]) {
				const w = D * 0.55, x = xb - sg * w / 2;
				g.add(box(w, H - 0.25, 0.03, M.glass, x, y0 + (H - 0.25) / 2 + 0.12, z));
				g.add(box(w, 0.06, 0.06, frame, x, y0 + H - 0.12, z));
				g.add(box(w, 0.06, 0.06, frame, x, y0 + 0.12, z));
				g.add(box(w - 0.04, 0.1, 0.036, band, x, y0 + 1.4, z));
				g.add(box(0.08, H, 0.08, frame, xb - sg * w, y0 + H / 2, z)); // słupek na końcu ściany bocznej
			}
			// kosz przy tylnym narożniku (z dala od pasa ostrzegawczego)
			if (Math.abs(xb - sg * 0.35 - P.edge) >= FURN + 0.25) this.bin(g, xb - sg * 0.35, sz + L / 2 + 0.6);
			// ławka w środku, tabliczka z nazwą nad wejściem
			// (na wąskim peronie ławki z nogami siedzących weszłyby na pas ostrzegawczy – bez ławek)
			if (Math.abs(xb - sg * 0.55 - P.edge) >= FURN + 0.7) {
				this.bench(g, xb - sg * 0.55, sz - 1.4, sg);
				this.bench(g, xb - sg * 0.55, sz + 1.4, sg);
			}
			this.nameBoard(g, name, 3.4, 0.5, xf - sg * 0.46, y0 + H - 0.05, sz, false);
			// listwa LED pod dachem i punkt światła
			g.add(box(0.12, 0.03, L - 1.2, M.lampLens, xc, y0 + H - 0.04, sz));
			const o = new T.Object3D();
			o.userData.power = 0.3;
			o.userData.drop = 1.1;
			o.position.set(xc, y0 + H, sz);
			g.add(o);
			const pool = new T.Mesh(M.poolGeo, M.lampPool);
			pool.scale.setScalar(3.2);
			pool.position.set(xc, y0 + 0.03, sz);
			pool.renderOrder = 5;
			g.add(pool);
			return [o];
		}

		// barierka: słupki co 2 m, poręcz i przeciąg; wzdłuż z (x stałe) albo w poprzek (axis 'x')
		railing(g, a0, a1, fixed, y0, axis) {
			const steel = matS('#7d858e', { roughness: 0.45, metalness: 0.6 });
			const L = Math.abs(a1 - a0), n = Math.max(1, Math.round(L / 2)), mid = (a0 + a1) / 2;
			for (let k = 0; k <= n; k++) {
				const a = a0 + ((a1 - a0) * k) / n;
				g.add(axis === 'x' ? box(0.05, 1.1, 0.05, steel, a, y0 + 0.55, fixed) : box(0.05, 1.1, 0.05, steel, fixed, y0 + 0.55, a));
			}
			for (const y of [y0 + 1.08, y0 + 0.55]) g.add(axis === 'x' ? box(L, 0.045, 0.045, steel, mid, y, fixed) : box(0.045, 0.045, L, steel, fixed, y, mid));
		}

		/* Przystanek: pas dotykowy przy krawędzi, barierki wzdłuż tylnej krawędzi i na końcu peronu, pochylnia
		   z poręczami na początku peronu (od strony nadjeżdżającego pociągu) i chodnik do przejścia przez tory. */
		haltPlatformExtras(g, P, len, mid, st) {
			const sg = P.sgn, y0 = 0.77;
			const h0 = R.heightAt(this.route, mid);
			// barierka wzdłuż tyłu i w poprzek na drugim końcu (przy pochylni otwarte); tył – najwęższe miejsce peronu
			// (peron przycięty przed torem z mapy – backAbs)
			let bMin = Math.abs(P.back);
			if (P.backAbs) for (let z = -len / 2; z <= len / 2; z += 3) bMin = Math.min(bMin, P.backAbs(z));
			const back = sg * bMin, xr = back - sg * 0.08;
			this.railing(g, -len / 2 + 0.2, len / 2 - 0.2, xr, y0);
			this.railing(g, P.edge + sg * 0.6, back - sg * 0.1, -len / 2 + 0.15, y0, 'x');
			// pochylnia: od końca peronu w dół do terenu, przy tylnej krawędzi
			const RL = 18, RW = 2.4, xc = back - sg * (RW / 2 + 0.1), z0 = len / 2;
			const yb = this.terrainY(mid - (z0 + RL), xc) - h0 + 0.06;
			const geo = new T.BoxGeometry(RW, 1, RL);
			const pa = geo.attributes.position;
			for (let i = 0; i < pa.count; i++) {
				const t = (pa.getZ(i) + RL / 2) / RL;
				pa.setY(i, pa.getY(i) > 0 ? y0 + (yb - y0) * t : Math.min(yb, y0 + (yb - y0) * t) - 0.5);
			}
			geo.computeVertexNormals();
			const ramp = new T.Mesh(geo, matS('#b8b2a6', { roughness: 0.9, surf: 'concrete' }));
			ramp.userData.ownGeometry = true;
			ramp.position.set(xc, 0, z0 + RL / 2);
			ramp.castShadow = this.shadows;
			ramp.receiveShadow = true;
			g.add(ramp);
			// poręcze pochylni (obie strony)
			const steel = matS('#7d858e', { roughness: 0.45, metalness: 0.6 });
			const ang = Math.atan2(y0 - yb, RL), Lr = Math.hypot(RL, y0 - yb);
			for (const e of [-1, 1]) {
				const x = xc + e * (RW / 2 - 0.05);
				for (let k = 0; k <= 9; k++) {
					const t = k / 9;
					g.add(box(0.05, 1.0, 0.05, steel, x, y0 + (yb - y0) * t + 0.5, z0 + RL * t));
				}
				for (const dy of [0.95, 0.5]) {
					const r = box(0.045, 0.045, Lr, steel, x, (y0 + yb) / 2 + dy, z0 + RL / 2);
					r.rotation.x = ang;
					g.add(r);
				}
			}
			// chodnik od pochylni do przejścia przez tory
			g.add(box(RW, 0.12, 5.2, mat('#9b968d', { roughness: 0.95 }), xc, yb - 0.02, z0 + RL + 2.6));
		}

		/* Przejście w poziomie szyn na przystanku (za początkiem peronów): płyty między szynami i przy nich,
		   chodnik między torami, „labirynty” z barierek przy torach, tablica ostrzegawcza. */
		pedCrossing(g, sides, len, mid) {
			const dbl = this.route.double;
			const h0 = R.heightAt(this.route, mid);
			const zc = len / 2 + 18 + 4.2;
			const panel = mat('#3a3a3a', { roughness: 0.9 });
			const walk = mat('#9b968d', { roughness: 0.95 });
			const tracks = dbl ? [0, SECOND] : [0];
			for (const t of tracks) {
				g.add(box(1.36, 0.1, 2.4, panel, t, -0.07, zc));
				for (const e of [-1, 1]) g.add(box(0.72, 0.1, 2.4, panel, t + e * 1.18, -0.07, zc));
			}
			if (dbl) g.add(box(Math.abs(SECOND) - 3.08, 0.1, 2.4, walk, SECOND / 2, -0.1, zc));
			// chodnik z boków torowiska do chodników od pochylni (pochyły)
			for (const P of sides) {
				const xIn = P.sgn > 0 ? 1.55 : (dbl ? SECOND : 0) - 1.55;
				const xOut = P.back - P.sgn * 1.3;
				const yOut = this.terrainY(mid - zc, xOut) - h0 + 0.04;
				const L = Math.abs(xOut - xIn), slab = box(L, 0.1, 2.4, walk, (xIn + xOut) / 2, (yOut - 0.07) / 2, zc);
				// koniec +x płyty: przy torze (xIn < xOut) albo przy peronie lewym
				slab.rotation.z = Math.atan2(xOut > xIn ? yOut + 0.07 : -0.07 - yOut, L);
				g.add(slab);
				// labirynt: dwie przesunięte barierki przed torem (biało-czerwone)
				const xb = P.sgn > 0 ? 3.0 : (dbl ? SECOND : 0) - 3.0;
				const yB = this.terrainY(mid - zc, xb) - h0;
				const red = mat('#c62f2f'), white = mat('#f2f2f2');
				for (const [dz, dx] of [[-1.25, 0.55], [1.25, -0.55]]) {
					const x = xb + P.sgn * dx;
					for (const e of [-1, 1]) g.add(box(0.06, 1.0, 0.06, red, x + e * 0.8, yB + 0.5, zc + dz));
					g.add(box(1.7, 0.06, 0.06, white, x, yB + 0.95, zc + dz));
					g.add(box(1.7, 0.06, 0.06, red, x, yB + 0.55, zc + dz));
				}
				// tablica „Uwaga! Patrz na pociąg”
				const xs = P.back + P.sgn * 0.6;
				const ys = this.terrainY(mid - zc + 2, xs) - h0;
				g.add(box(0.07, 2.2, 0.07, matS('#7d858e', { metalness: 0.6, roughness: 0.45 }), xs, ys + 1.1, zc - 2));
				const tex = labelTexture('UWAGA! POCIĄG', '#f2c230', '#111111');
				const pm = new T.MeshStandardMaterial({ map: tex, roughness: 0.6 });
				pm.userData.shared = false;
				for (const side of [0, Math.PI]) {
					const pl = new T.Mesh(new T.PlaneGeometry(1.5, 0.34), pm);
					pl.userData.ownMaterial = pl.userData.ownGeometry = true;
					pl.rotation.y = side;
					pl.position.set(xs, ys + 2.05, zc - 2 + (side ? -0.04 : 0.04));
					g.add(pl);
				}
			}
		}

		// biletomat: obudowa z zaokrąglonym daszkiem, podświetlony ekran i wrzutnie od strony peronu
		ticketMachine(g, x, z, sg) {
			const body = matS('#2f3438', { roughness: 0.4, metalness: 0.5 }), y0 = 0.77;
			g.add(box(0.5, 1.55, 0.75, body, x, y0 + 0.78, z));
			const cap = new T.Mesh(GEO.cyl, body);
			cap.scale.set(0.5, 0.75, 0.5);
			cap.rotation.x = Math.PI / 2;
			cap.position.set(x, y0 + 1.56, z);
			g.add(cap);
			g.add(box(0.02, 0.36, 0.48, new T.MeshBasicMaterial({ color: '#7fb7e6' }), x - sg * 0.26, y0 + 1.22, z));
			g.add(box(0.03, 0.08, 0.6, mat('#f2c230'), x - sg * 0.26, y0 + 1.5, z));
			g.add(box(0.03, 0.12, 0.14, mat('#111111'), x - sg * 0.26, y0 + 0.92, z - 0.15));
			g.add(box(0.03, 0.05, 0.22, mat('#111111'), x - sg * 0.26, y0 + 0.75, z + 0.12));
		}

		// tablica elektroniczna z kierunkiem jazdy (pomarańczowe diody), na słupie, czytelna z peronu i z pociągu
		infoDisplay(g, x, z, dest) {
			const tex = canvasTexture(`halt-led|${dest}`, 512, 128, (c, w, h) => {
				c.fillStyle = '#0b0b0b';
				c.fillRect(0, 0, w, h);
				c.fillStyle = '#ffa31a';
				c.textBaseline = 'middle';
				c.font = '700 34px ui-monospace, Consolas, monospace';
				c.fillText('Os', 16, 36);
				c.fillText(dest.toUpperCase().slice(0, 18), 90, 36);
				c.font = '600 28px ui-monospace, Consolas, monospace';
				c.fillText('Pociąg osobowy · peron 1', 16, 92);
				c.fillStyle = 'rgba(0,0,0,0.35)';
				for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
			});
			const steel = matS('#3a3f45', { roughness: 0.45, metalness: 0.6 });
			// wyświetlacz ok. 1,3 × 0,4 m na słupku, dolna krawędź ok. 2,4 m nad peronem
			g.add(box(0.08, 2.6, 0.08, steel, x, 0.77 + 1.3, z));
			g.add(box(0.12, 0.42, 1.35, steel, x, 0.77 + 2.6, z));
			const lm = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
			lm.userData.shared = false;
			for (const side of [-1, 1]) {
				const pl = new T.Mesh(new T.PlaneGeometry(1.25, 0.31), lm);
				pl.userData.ownMaterial = pl.userData.ownGeometry = true;
				pl.rotation.y = side * Math.PI / 2;
				pl.position.set(x + side * 0.07, 0.77 + 2.6, z);
				g.add(pl);
			}
		}

		// wiata peronowa; zwraca świetlówki (do oświetlenia nocą)
		/* długość i środek wiaty na peronie długości len: wiata (z dachem i blendą 0,2 m dłuższymi z obu stron) kończy się
		   co najmniej 3 m przed końcami peronu (pochylnie); model – rozmiar wiaty z gry (stacja 30 / 14 m, przystanek 7 m) */
		shelterSpan(big, P, len, model) {
			const base = big && P.sgn > 0 ? 30 : big || !model ? 14 : 7;
			const sl = Math.max(4, Math.min(base, len - 6.4));
			const lim = Math.max(0, len / 2 - 3.2 - sl / 2);
			return { sl, sz: Math.max(-lim, Math.min(lim, big && P.sgn > 0 ? 0 : -len * 0.15)) };
		}

		shelter(g, P, sl, sz) {
			const M = World.materials();
			const steel = matS('#5d6670', { roughness: 0.45, metalness: 0.6 });
			const under = mat('#dfe2e6', { roughness: 0.7, emissive: '#5a5d62' });
			const roofM = matS('#4d555e', { roughness: 0.55, metalness: 0.45 });
			const fascia = matS('#1c3d6e', { roughness: 0.4, metalness: 0.3 });
			const sg = P.sgn;
			/* wiata w obrysie peronu: dach (wysunięty 0,3 m za linię słupów i 0,1 m przed przednią płatew) kończy się 0,15 m
			   przed tylną krawędzią peronu i 0,5 m przed krawędzią od strony toru (dawniej równo z nią, a z tyłu 5 cm poza
			   peronem); połowa wiaty peronu wyspowego (mid) – dachy obu połówek stykają się w osi peronu */
			const xb = P.back - sg * (P.mid ? 0.25 : 0.45); // linia słupów (tył peronu albo oś peronu wyspowego)
			const xf = P.edge + sg * 0.6;
			const yb = 3.78, yf = 4.02;             // dach wyżej z przodu, spływa do rynny z tyłu
			const span = Math.abs(xf - xb) + 0.4;
			const slope = Math.atan2(yf - yb, Math.abs(xf - xb));
			const xm = (xb + xf) / 2, ym = (yb + yf) / 2;
			const n = Math.max(2, Math.round(sl / 5));
			for (let k = 0; k <= n; k++) {
				const z = sz - sl / 2 + 0.3 + (k * (sl - 0.6)) / n;
				// słup (dwuteownik): środnik + półki
				g.add(box(0.06, yb - 0.77, 0.18, steel, xb, (yb + 0.77) / 2, z));
				for (const dz of [-0.08, 0.08]) g.add(box(0.18, yb - 0.77, 0.03, steel, xb, (yb + 0.77) / 2, z + dz));
				g.add(box(0.36, 0.05, 0.36, steel, xb, 0.8, z));
				// wysięgnik pod dachem
				const arm = box(span, 0.16, 0.12, steel, xm, ym - 0.12, z);
				arm.rotation.z = sg > 0 ? slope : -slope;
				g.add(arm);
				// zastrzał
				const bx0 = xb, by0 = yb - 1.0, bx1 = xb + (xf - xb) * 0.45, by1 = yb + (yf - yb) * 0.45 - 0.18;
				const br = box(Math.hypot(bx1 - bx0, by1 - by0), 0.08, 0.08, steel, (bx0 + bx1) / 2, (by0 + by1) / 2, z);
				br.rotation.z = Math.atan2(by1 - by0, bx1 - bx0);
				g.add(br);
			}
			// płatwie wzdłuż wiaty (na wysięgnikach, pod pokryciem) i rury spustowe z rynny przy co drugim słupie
			for (const t of [0.12, 0.5, 0.88]) {
				const pu = box(0.1, 0.14, sl - 0.2, steel, xb + (xf - xb) * t, yb + (yf - yb) * t - 0.2, sz);
				pu.rotation.z = sg > 0 ? slope : -slope;
				g.add(pu);
			}
			for (let k = 0; k <= n; k += 2) {
				const z = sz - sl / 2 + 0.3 + (k * (sl - 0.6)) / n + 0.16;
				const dp = new T.Mesh(GEO.cyl, steel);
				dp.scale.set(0.1, yb - 0.85, 0.1);
				dp.position.set(xb + sg * 0.15, (yb + 0.85) / 2, z);
				g.add(dp);
				g.add(box(0.16, 0.06, 0.25, steel, xb + sg * 0.15, 0.83, z + 0.08)); // wylot
			}
			// dach: pokrycie + jaśniejszy spód
			const roof = box(span, 0.08, sl + 0.4, roofM, xm + sg * 0.1, ym + 0.02, sz); // przód nad krawędzią peronu
			roof.rotation.z = sg > 0 ? slope : -slope;
			roof.castShadow = this.shadows;
			g.add(roof);
			const ceil = box(span, 0.03, sl, under, xm, ym - 0.05, sz);
			ceil.rotation.z = roof.rotation.z;
			g.add(ceil);
			// pokrycie z blachy na rąbek stojący: żeberka w dół spadku co 0,6 m
			for (let z = sz - sl / 2; z <= sz + sl / 2 + 1e-6; z += 0.6) {
				const rib = box(span, 0.035, 0.03, roofM, xm + sg * 0.1, ym + 0.075, z);
				rib.rotation.z = roof.rotation.z;
				g.add(rib);
			}
			// blenda z przodu, rynna z tyłu
			g.add(box(0.06, 0.34, sl + 0.4, fascia, xf - sg * 0.08, yf - 0.05, sz));
			const gut = new T.Mesh(GEO.cyl, steel);
			gut.scale.set(0.16, sl + 0.4, 0.16);
			gut.rotation.x = Math.PI / 2;
			gut.position.set(xb + sg * 0.15, yb - 0.02, sz);
			g.add(gut);
			// świetlówki pod dachem (dwa pasy)
			const lights = [];
			for (const t of [0.35, 0.7]) {
				const x = xb + (xf - xb) * t, y = yb + (yf - yb) * t - 0.12;
				const tube = box(0.09, 0.05, sl - 1.5, M.lampLens, x, y, sz);
				g.add(tube);
				if (t > 0.5) continue; // jeden rząd plam światła (dwa nakładałyby się i prześwietlały posadzkę)
				for (let z = sz - sl / 2 + 3.5; z < sz + sl / 2 - 2; z += 7) {
					const pool = new T.Mesh(M.poolGeo, M.lampPool);
					pool.scale.setScalar(3.0);
					pool.position.set(xb + (xf - xb) * 0.52, 0.8, z);
					pool.renderOrder = 5;
					g.add(pool);
				}
			}
			// punkty dla puli świateł punktowych – wzdłuż wiaty, między pasami świetlówek
			const xl = xb + (xf - xb) * 0.52, yl = yb + (yf - yb) * 0.52 - 0.1;
			const nl = Math.max(1, Math.round(sl / 8));
			for (let k = 0; k < nl; k++) {
				const o = new T.Object3D();
				// świetlówki są słabsze od latarni, a światło punktowe niżej – żeby nie prześwietlać spodu dachu
				o.userData.power = 0.35;
				o.userData.drop = 1.3;
				o.position.set(xl, yl, sz - sl / 2 + (sl * (k + 0.5)) / nl);
				g.add(o);
				lights.push(o);
			}
			// tylna ściana: panele szklane w ramach
			const frame = matS('#7d858e', { roughness: 0.4, metalness: 0.6 });
			const xw = xb + sg * 0.12;
			g.add(box(0.06, 2.3, sl - 0.4, M.glass, xw, 2.1, sz));
			for (const y of [0.98, 3.25]) g.add(box(0.08, 0.07, sl - 0.4, frame, xw, y, sz));
			for (let z = sz - sl / 2 + 0.2; z <= sz + sl / 2 - 0.2 + 1e-6; z += (sl - 0.4) / Math.round((sl - 0.4) / 1.6)) g.add(box(0.08, 2.3, 0.06, frame, xw, 2.1, z));
			// boki wiaty otwarte (bez szklanych ścian bocznych – wyglądały jak wolno stojące puste ramy)
			return lights;
		}

		/* ławka peronowa (wg zdjęć ławek PKP): boki z żeliwa – jedna płaska bryła (noga przednia i tylna, wspornik siedziska,
		   wygięte oparcie), drewniane listwy siedziska i oparcia, podłokietniki; sg – strona oparcia */
		bench(g, x, z, sg) {
			const iron = matS('#2f3438', { roughness: 0.5, metalness: 0.6 });
			const wood = mat('#9a6a3c', { roughness: 0.8 });
			const L = 1.9, y0 = 0.77;
			if (!World.benchSide) {
				const P = [[-0.24, 0], [-0.17, 0], [-0.15, 0.36], [0.12, 0.38], [0.16, 0], [0.23, 0], [0.21, 0.43], [0.27, 0.6], [0.37, 0.98], [0.31, 1.0], [0.21, 0.63], [0.15, 0.47], [-0.2, 0.47], [-0.24, 0.43]];
				const sh = new T.Shape();
				P.forEach(([u, v], k) => (k ? sh.lineTo(u, v) : sh.moveTo(u, v)));
				const geo = new T.ExtrudeGeometry(sh, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
				geo.translate(0, 0, -0.0225);
				geo.userData.shared = true;
				World.benchSide = geo;
			}
			for (const e of [-1, 1]) {
				const zz = z + e * (L / 2 - 0.1);
				const side = new T.Mesh(World.benchSide, iron);
				side.scale.x = sg;
				side.position.set(x, y0, zz);
				g.add(side);
				g.add(box(0.42, 0.04, 0.07, iron, x - sg * 0.02, y0 + 0.68, zz)); // podłokietnik
				g.add(box(0.04, 0.2, 0.04, iron, x - sg * 0.2, y0 + 0.57, zz)); // wspornik podłokietnika
			}
			// siedzisko: 5 listew ze szczelinami, oparcie: 3 listwy wzdłuż wygięcia boków
			for (let k = 0; k < 5; k++) g.add(box(0.07, 0.035, L, wood, x - sg * (0.19 - k * 0.085), y0 + 0.49, z));
			for (let k = 0; k < 3; k++) {
				const v = 0.64 + k * 0.13;
				const sl = box(0.03, 0.1, L, wood, x + sg * (0.235 + (v - 0.6) * 0.3), y0 + v, z);
				sl.rotation.z = -sg * 0.29;
				g.add(sl);
			}
		}

		// kosz na śmieci na słupku: wiadro toczone (szersze u góry, z wywiniętym brzegiem), ciemne wnętrze widoczne z góry
		bin(g, x, z) {
			const post = matS('#3e4650', { roughness: 0.5, metalness: 0.55 });
			g.add(box(0.06, 1.0, 0.06, post, x, 1.27, z));
			if (!World.binGeo) {
				World.binGeo = new T.LatheGeometry([[0, 0], [0.17, 0], [0.19, 0.02], [0.2, 0.3], [0.215, 0.58], [0.235, 0.6], [0.235, 0.63], [0.2, 0.63], [0.19, 0.6], [0.185, 0.5]].map(([r, y]) => new T.Vector2(r, y)), 20);
				World.binGeo.userData.shared = true;
			}
			const can = new T.Mesh(World.binGeo, matS('#2f5e3a', { roughness: 0.45, metalness: 0.4 }));
			can.position.set(x, 1.15, z);
			g.add(can);
			// ciemne dno wnętrza widoczne przez otwór
			const inner = new T.Mesh(GEO.cyl, mat('#141516'));
			inner.scale.set(0.38, 0.02, 0.38);
			inner.position.set(x, 1.65, z);
			g.add(inner);
		}

		/* Budynek dworca (elewacja od strony torów w x = 12, wejście na osi z = bz + 2.5 – tam idą wysiadający):
		   piętrowy korpus z frontowym szczytem (zegar w szczycie, nazwa stacji między kondygnacjami, zadaszone
		   wejście), dwa parterowe skrzydła z poczekalnią i kasami, cokół, gzymsy, boniowane narożniki,
		   okna w opaskach z nadprożami i parapetami, kominy, rynny; przed budynkiem utwardzony plac. */
		stationBuilding(g, name, bz, lamps) {
			const M = World.materials();
			const sh = this.shadows;
			const add = (o) => { o.castShadow = sh; o.receiveShadow = true; g.add(o); return o; };
			// kolory elewacji i dachu zależne od stacji
			let hs = 0;
			for (const ch of name) hs = (hs * 31 + ch.charCodeAt(0)) % 9973;
			const wall = mat(['#d9dccf', '#e9c9a4', '#c98f72', '#ead7c3', '#e8d9b5'][Math.floor(hs / 15) % 5], { roughness: 0.92 }), trim = mat('#f5f0e4', { roughness: 0.85 });
			const plinth = mat('#77706a', { roughness: 0.95 }), roofM = mat(['#7a3326', '#5a5f66', '#8e3b2e'][hs % 3], { roughness: 0.7 });
			const brick = mat('#9c4a36', { roughness: 0.9 }), sill = mat('#a8a194'), wood = mat('#5b3a25', { roughness: 0.7 });
			const tin = matS('#59616a', { roughness: 0.5, metalness: 0.5 }), paving = mat('#9b968d', { roughness: 0.95 });
			const G = -0.95, y0 = 0.77, X = 12;
			const zc = bz + 2.5;
			// plac przed dworcem na poziomie peronu
			add(box(5.95, y0 - G, 29, paving, 9.05, (y0 + G) / 2, zc));

			// dach dwuspadowy: płaszczyzny + trójkąt szczytu w kolorze ściany; axis 'z' – kalenica wzdłuż toru
			const gable = (cx, ye, cz, span, len, rise, axis, ov) => {
				const tri = new T.Mesh(GEO.prism, wall);
				tri.scale.set(span / 0.866, rise / 0.75, len);
				tri.position.set(cx, ye + 0.25 * (rise / 0.75), cz);
				if (axis === 'x') tri.rotation.y = Math.PI / 2;
				add(tri);
				const a = Math.atan2(rise, span / 2), lp = (span / 2 + ov) / Math.cos(a);
				const mx = (span / 2 + ov) / 2, my = ye + rise - (Math.tan(a) * (span / 2 + ov)) / 2 + 0.1;
				for (const e of [-1, 1]) {
					const pl = axis === 'z'
						? box(lp, 0.16, len + ov * 2, roofM, cx + e * mx, my, cz)
						: box(len + ov * 2, 0.16, lp, roofM, cx, my, cz + e * mx);
					if (axis === 'z') pl.rotation.z = -e * a; else pl.rotation.x = e * a;
					add(pl);
				}
				add(axis === 'z' ? box(0.3, 0.2, len + ov * 2, roofM, cx, ye + rise + 0.12, cz) : box(len + ov * 2, 0.2, 0.3, roofM, cx, ye + rise + 0.12, cz));
				// rynny pod okapami
				const ex = span / 2 + ov - 0.05, ey = ye - Math.tan(a) * ov + 0.02;
				for (const e of [-1, 1]) g.add(axis === 'z' ? box(0.16, 0.14, len + ov * 2, tin, cx + e * ex, ey, cz) : box(len + ov * 2, 0.14, 0.16, tin, cx, ey, cz + e * ex));
			};
			// okno w opasce z krzyżem, parapetem i nadprożem z kluczem; nx – kierunek elewacji (±1 w osi x)
			const win = (x, y, z, w, h, nx) => {
				g.add(box(0.12, h + 0.3, w + 0.3, trim, x + nx * 0.03, y, z));
				g.add(box(0.12, h, w, M.litWin, x + nx * 0.05, y, z));
				g.add(box(0.13, h, 0.07, trim, x + nx * 0.07, y, z));
				g.add(box(0.13, 0.07, w, trim, x + nx * 0.07, y + h * 0.18, z));
				g.add(box(0.32, 0.08, w + 0.45, sill, x + nx * 0.14, y - h / 2 - 0.19, z));
				g.add(box(0.2, 0.22, w + 0.5, trim, x + nx * 0.08, y + h / 2 + 0.26, z));
				g.add(box(0.24, 0.32, 0.24, trim, x + nx * 0.1, y + h / 2 + 0.3, z));
			};
			const winZ = (x, y, z, w, h, nz) => { // okno na ścianie szczytowej (elewacja ±z)
				g.add(box(w + 0.3, h + 0.3, 0.12, trim, x, y, z + nz * 0.03));
				g.add(box(w, h, 0.12, M.litWin, x, y, z + nz * 0.05));
				g.add(box(0.07, h, 0.13, trim, x, y, z + nz * 0.07));
				g.add(box(w + 0.45, 0.08, 0.32, sill, x, y - h / 2 - 0.19, z + nz * 0.14));
				g.add(box(w + 0.5, 0.22, 0.2, trim, x, y + h / 2 + 0.26, z + nz * 0.08));
			};

			// korpus: piętrowy, szczyt frontowy
			const D = 9.5, Lc = 11, Hc = 7.2, xc = X + D / 2;
			add(box(D + 0.25, y0 - G + 0.45, Lc + 0.25, plinth, xc, (G + y0 + 0.45) / 2, zc));
			add(box(D, Hc, Lc, wall, xc, y0 + Hc / 2, zc));
			add(box(D + 0.12, 0.2, Lc + 0.12, trim, xc, y0 + 3.75, zc));     // gzyms międzykondygnacyjny
			add(box(D + 0.45, 0.3, Lc + 0.45, trim, xc, y0 + Hc - 0.1, zc)); // gzyms koronujący
			for (const e of [-1, 1]) for (let k = 0; k < 9; k++) {
				const y = y0 + 0.5 + k * 0.78;
				g.add(box(0.1, 0.5, k % 2 ? 0.55 : 0.85, trim, X - 0.04, y, zc + e * (Lc / 2 - (k % 2 ? 0.27 : 0.42))));
			}
			gable(xc, y0 + Hc + 0.05, zc, Lc, D, 3.3, 'x', 0.5);
			// zegar w szczycie
			const cg = new T.Group();
			const clock = this.platformClock(cg, 0, 0, 0, 0.45);
			cg.scale.setScalar(1.7);
			cg.rotation.y = -Math.PI / 2;
			cg.position.set(X - 0.12, y0 + Hc + 1.25, zc);
			g.add(cg);
			// nazwa stacji między kondygnacjami
			this.nameBoard(g, name, 8.2, 1.15, X - 0.08, y0 + 4.55, zc, true);
			// wejście: dwuskrzydłowe drzwi z naświetlem w opasce, schodek, daszek na wspornikach
			g.add(box(0.14, 3.6, 2.9, trim, X - 0.03, y0 + 1.8, zc));
			g.add(box(0.12, 2.5, 2.2, wood, X - 0.06, y0 + 1.25, zc));
			for (const e of [-1, 1]) g.add(box(0.13, 1.5, 0.75, M.litWin, X - 0.08, y0 + 1.5, zc + e * 0.5));
			g.add(box(0.13, 0.7, 2.2, M.litWin, X - 0.06, y0 + 2.95, zc));
			g.add(box(0.13, 0.06, 2.2, trim, X - 0.08, y0 + 2.55, zc));
			add(box(2.0, 0.12, 3.8, tin, X - 1.0, y0 + 3.55, zc));
			g.add(box(1.95, 0.25, 0.08, tin, X - 1.0, y0 + 3.45, zc - 1.9));
			g.add(box(1.95, 0.25, 0.08, tin, X - 1.0, y0 + 3.45, zc + 1.9));
			g.add(box(0.1, 0.25, 3.8, tin, X - 2.0, y0 + 3.45, zc));
			for (const e of [-1, 1]) {
				const rod = box(0.04, 0.04, Math.hypot(1.9, 1.0), tin, X - 0.95, y0 + 4.05, zc + e * 1.6);
				rod.rotation.y = Math.PI / 2;
				rod.rotation.z = -Math.atan2(1.0, 1.9);
				g.add(rod);
			}
			// okna korpusu: parter obok wejścia, piętro trzy; z tyłu również
			for (const e of [-1, 1]) win(X, y0 + 1.75, zc + e * 3.4, 1.4, 2.3, -1);
			for (const z of [-3.4, 0, 3.4]) win(X, y0 + 5.35, zc + z, 1.15, 1.55, -1);
			for (const z of [-3.4, 0, 3.4]) {
				win(X + D, y0 + 1.75, zc + z, 1.3, 2.0, 1);
				win(X + D, y0 + 5.35, zc + z, 1.15, 1.55, 1);
			}
			// kominy
			for (const e of [-1, 1]) {
				add(box(0.8, 3.2, 0.8, brick, xc + e * 2.6, y0 + Hc + 2.3, zc + e * 2.2));
				g.add(box(1.0, 0.15, 1.0, trim, xc + e * 2.6, y0 + Hc + 3.95, zc + e * 2.2));
			}

			// skrzydła parterowe: poczekalnia (−z) i kasy (+z)
			const Dw = 8, Lw = 8.5, Hw = 4.4, xw = X + 0.6, xcw = xw + Dw / 2;
			for (const e of [-1, 1]) {
				const zw = zc + e * (Lc / 2 + Lw / 2);
				add(box(Dw + 0.25, y0 - G + 0.45, Lw, plinth, xcw, (G + y0 + 0.45) / 2, zw));
				add(box(Dw, Hw, Lw, wall, xcw, y0 + Hw / 2, zw));
				add(box(Dw + 0.4, 0.26, Lw, trim, xcw, y0 + Hw - 0.08, zw));
				gable(xcw, y0 + Hw + 0.05, zw - e * 0.3, Dw, Lw + 0.6, 2.4, 'z', 0.45);
				const ze = zw + e * Lw / 2;
				g.add(box(0.1, Hw, 0.5, trim, xw - 0.04, y0 + Hw / 2, ze - e * 0.25));
				// okna od strony peronu; w skrzydle kas – drzwi z tabliczką
				const zs = [-2.6, 0, 2.6].map((z) => zw + z);
				zs.forEach((z, k) => {
					if (e > 0 && k === 1) {
						g.add(box(0.14, 2.75, 1.7, trim, xw - 0.03, y0 + 1.37, z));
						g.add(box(0.12, 2.45, 1.3, wood, xw - 0.06, y0 + 1.22, z));
						g.add(box(0.13, 1.2, 0.9, M.litWin, xw - 0.08, y0 + 1.6, z));
						add(box(1.2, 0.08, 2.2, tin, xw - 0.6, y0 + 2.95, z));
						this.plaque(g, 'KASY', 1.5, 0.4, xw - 0.09, y0 + 3.45, z);
					} else win(xw, y0 + 1.75, z, 1.35, 2.2, -1);
				});
				for (const z of [-2.6, 0, 2.6]) win(xw + Dw, y0 + 1.75, zw + z, 1.2, 1.9, 1);
				// okna w szczycie skrzydła
				for (const x of [-1.8, 1.8]) winZ(xcw + x, y0 + 1.75, ze, 1.2, 2.0, e);
				winZ(xcw, y0 + Hw + 0.9, ze + e * 0.0, 0.7, 0.8, e);
				// rura spustowa
				g.add(box(0.12, Hw + 0.4, 0.12, tin, xw - 0.15, (G + y0 + Hw) / 2 + 0.1, ze - e * 0.12));
			}
			// kinkiety: na skrzydłach między oknami i pod daszkiem wejścia
			const bracket = matS('#2a2d31', { roughness: 0.45, metalness: 0.6 });
			for (const e of [-1, 1]) for (const dz of [-1.3, 1.3]) {
				const z = zc + e * (Lc / 2 + Lw / 2) + dz;
				g.add(box(0.5, 0.06, 0.06, bracket, xw - 0.25, y0 + 3.05, z));
				g.add(box(0.06, 0.4, 0.06, bracket, xw - 0.03, y0 + 2.9, z));
				lamps.push(this.wallLamp(g, xw - 0.5, y0 + 2.9, z, y0));
			}
			lamps.push(this.wallLamp(g, X - 1.0, y0 + 3.42, zc, y0, true));
			this.plaque(g, 'POCZEKALNIA', 2.6, 0.4, xw - 0.09, y0 + 3.45, zc - (Lc / 2 + Lw / 2));
			// donice z kwiatami i ławka pod ścianą
			const flowers = mat('#c24a5a', { roughness: 0.9 }), pot = mat('#6d655c');
			for (const e of [-1, 1]) {
				g.add(box(0.7, 0.55, 0.7, pot, X - 0.9, y0 + 0.28, zc + e * 2.0));
				const f = new T.Mesh(GEO.sphere, flowers);
				f.scale.set(0.75, 0.45, 0.75);
				f.position.set(X - 0.9, y0 + 0.65, zc + e * 2.0);
				g.add(f);
			}
			this.bench(g, xw - 0.7, zc + Lc / 2 + 2.6 + 1.3, 1);
			this.bench(g, xw - 0.7, zc - Lc / 2 - 4.0, 1);
			return clock;
		}

		// mała latarnia ścienna (latarenka z kloszem); flush – oprawa podsufitowa pod daszkiem
		wallLamp(g, x, y, z, groundY, flush) {
			const M = World.materials();
			if (!flush) {
				const cap = new T.Mesh(GEO.cyl, M.lampHousing);
				cap.scale.set(0.34, 0.08, 0.34);
				cap.position.set(x, y + 0.02, z);
				g.add(cap);
			}
			const lens = new T.Mesh(GEO.sphere, M.lampLens);
			lens.scale.set(flush ? 0.5 : 0.24, flush ? 0.1 : 0.3, flush ? 0.5 : 0.24);
			lens.position.set(x, y - (flush ? 0 : 0.17), z);
			g.add(lens);
			lens.userData.power = 0.6;
			const halo = new T.Sprite(M.lampHalo);
			halo.scale.set(1.0, 1.0, 1);
			halo.userData.lampHalo = true;
			halo.position.set(x, y - 0.18, z);
			g.add(halo);
			const pool = new T.Mesh(M.poolGeo, M.lampPool);
			pool.scale.setScalar(2.8);
			pool.position.set(x - 0.4, groundY + 0.03, z);
			pool.renderOrder = 5;
			g.add(pool);
			return lens;
		}

		// tabliczka z napisem na ścianie (front na −x)
		plaque(g, text, w, h, x, y, z) {
			const tex = labelTexture(text, '#1c3d6e', '#ffffff');
			const m = NS.util.patch(new T.MeshStandardMaterial({ map: tex, roughness: 0.5 }), 'clean');
			m.userData.shared = false;
			if (!World.boardGeo) { World.boardGeo = new T.PlaneGeometry(1, 1); World.boardGeo.userData.shared = true; }
			const p = new T.Mesh(World.boardGeo, m);
			p.userData.ownMaterial = true;
			p.scale.set(w, h, 1);
			p.rotation.y = -Math.PI / 2;
			p.position.set(x, y, z);
			g.add(p);
		}

		// płaska tablica z nazwą stacji ustawiona wzdłuż toru (lokalna oś z); oneSided – tylko strona od toru (−x)
		nameBoard(g, name, w, h, x, y, z, oneSided) {
			const tex = labelTexture(name, '#1c3d6e', '#ffffff');
			if (!World.boardGeo) {
				World.boardGeo = new T.PlaneGeometry(1, 1);
				World.boardGeo.userData.shared = true;
			}
			const m = NS.util.patch(new T.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1 }), 'clean');
			m.userData.shared = false;
			const frame = mat('#d9dde2', { roughness: 0.4, metalness: 0.4 });
			g.add(box(0.06, h + 0.12, w + 0.12, frame, x, y, z));
			for (const side of oneSided ? [-1] : [-1, 1]) {
				const p = new T.Mesh(World.boardGeo, m);
				p.userData.ownMaterial = true;
				p.scale.set(w, h, 1);
				p.rotation.y = side * Math.PI / 2;
				p.position.set(x + side * 0.035, y, z);
				p.castShadow = false;
				g.add(p);
			}
		}

		/* Semafor świetlny (wzór PKP): fundament, maszt rurowy w biało-czerwone pasy, drabinka z tyłu i podest,
		   głowica – czarna tarcza tła z białą obwódką i pięć komór (od góry: zielona, pomarańczowa, czerwona,
		   pomarańczowa dolna, biała), każda z daszkiem i soczewką; tabliczka z oznaczeniem na maszcie.
		   Lico od strony nadjeżdżającego pociągu (lokalne +z). Zapalane: zielona / pomarańczowa / czerwona. */
		// wspólne geometrie głowic sygnałów (daszek komory, obręcz, soczewka, tarcza tła)
		signalGeos() {
			if (!World.SG) {
				const sh = (gm) => { gm.userData.shared = true; return gm; };
				World.SG = {
					visor: sh(new T.CylinderGeometry(0.21, 0.21, 0.32, 14, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 0, 0.16)),
					ring: sh(new T.CylinderGeometry(0.19, 0.19, 0.06, 16).rotateX(Math.PI / 2)),
					lens: sh(new T.SphereGeometry(0.15, 14, 10).scale(1, 1, 0.45)),
					shield: (() => {
						const shp = new T.Shape(), w = 0.36, h = 1.38, r = 0.32;
						shp.moveTo(-w + r, -h); shp.lineTo(w - r, -h); shp.quadraticCurveTo(w, -h, w, -h + r);
						shp.lineTo(w, h - r); shp.quadraticCurveTo(w, h, w - r, h); shp.lineTo(-w + r, h);
						shp.quadraticCurveTo(-w, h, -w, h - r); shp.lineTo(-w, -h + r); shp.quadraticCurveTo(-w, -h, -w + r, -h);
						return sh(new T.ExtrudeGeometry(shp, { depth: 0.05, bevelEnabled: false }));
					})(),
				};
			}
			return World.SG;
		}

		buildSignal(group, dyn, sig, idx, opp) {
			this.signalGeos();
			const G = World.SG;
			const g = new T.Group();
			// trasa rzeczywista: maszt w wolnym miejscu obok torów z mapy, między torami albo bramownica nad torami
			const spot = this.env && !opp ? this.envSignalSpot(sig.pos, sig) : { d: sig.d !== undefined ? sig.d : 3.4 };
			this.place(g, sig.pos, spot.d);
			if (opp) g.rotation.y += Math.PI; // semafor dla kierunku przeciwnego – zwrócony w drugą stronę
			const steel = matS('#9aa0a6', { roughness: 0.45, metalness: 0.6 });
			const white = mat('#eeeeee'), red = mat('#c62828'), black = matS('#121212', { roughness: 0.5, metalness: 0.2 });
			const mastG = new T.Group();
			g.add(mastG);
			if (spot.gantry) {
				mastG.visible = false;
				this.envGantry(g, spot.l - spot.d, spot.r - spot.d, 7.1, steel);
				g.add(box(0.1, 0.5, 0.1, steel, 1.6, 6.8, -0.12));
			}
			// przy ścianie tunelu: bez masztu, wspornik od ściany do głowicy
			if (spot.wall) {
				mastG.visible = false;
				g.add(box(0.45, 0.12, 0.12, steel, 0.22, 4.25, -0.2));
				g.add(box(0.12, 1.6, 0.12, steel, 0.4, 4.25, -0.2));
			}
			// fundament
			mastG.add(box(0.8, 0.5, 0.8, mat('#9e9a92', { roughness: 0.95 }), 0, -0.05, 0));
			// maszt w pasy
			// wymiary jak PKP: głowica pięciokomorowa ok. 1,9 × 0,5 m, środek ok. 4,9 m nad główką szyny
			const mastH = 3.7;
			for (let k = 0; k < 7; k++) {
				const seg = new T.Mesh(GEO.cyl, k % 2 ? white : red);
				seg.scale.set(0.2, mastH / 7, 0.2);
				seg.position.set(0, 0.2 + (k + 0.5) * (mastH / 7), 0);
				mastG.add(seg);
			}
			const cap = new T.Mesh(GEO.cyl, steel);
			cap.scale.set(0.26, 0.08, 0.26);
			cap.position.set(0, 0.2 + mastH, 0);
			mastG.add(cap);
			// drabinka z tyłu masztu i podest pod głowicą
			for (const x of [-0.2, 0.2]) mastG.add(box(0.04, mastH - 0.6, 0.04, steel, x, 0.5 + (mastH - 0.6) / 2, -0.28));
			for (let y = 0.8; y < mastH; y += 0.32) mastG.add(box(0.4, 0.03, 0.03, steel, 0, y, -0.28));
			mastG.add(box(0.8, 0.05, 0.6, steel, 0, 3.55, -0.05));
			for (const x of [-0.39, 0.39]) mastG.add(box(0.03, 0.7, 0.03, steel, x, 3.9, -0.33));
			mastG.add(box(0.8, 0.03, 0.03, steel, 0, 4.25, -0.33));
			// głowica (podgrupa w skali 0,7): tarcza tła z obwódką, komory świateł, poświata
			const hy = spot.gantry ? 6.0 : spot.wall ? 4.3 : 4.9; // środek głowicy
			const HS = 0.7;
			const head = new T.Group();
			// na bramownicy: głowica 1,6 m w prawo od osi toru (poza przewodem jezdnym i pantografem)
			const hx = spot.gantry ? 1.6 : 0;
			head.position.set(hx, hy, 0);
			head.scale.setScalar(HS);
			g.add(head);
			if (!spot.gantry && !spot.wall) g.add(box(0.12, 0.5, 0.12, steel, 0, hy - 1.38 * HS - 0.1, -0.1));
			const rim = new T.Mesh(G.shield, white);
			rim.scale.set(1.08, 1.04, 1);
			head.add(rim);
			const shield = new T.Mesh(G.shield, black);
			shield.position.set(0, 0, 0.02);
			head.add(shield);
			head.add(box(0.5, 2.5, 0.35, black, 0, 0, -0.17));
			// komory świateł
			const ORDER = ['green', 'yellow', 'red', 'yellow2', 'white'];
			const DARK = { green: 0x123018, yellow: 0x3a2808, red: 0x3a0e0c, yellow2: 0x3a2808, white: 0x3a3a3a };
			const lamps = ORDER.map((name, k) => {
				const y = 1.08 - k * 0.54;
				const ring = new T.Mesh(G.ring, steel);
				ring.position.set(0, y, 0.09);
				head.add(ring);
				const visor = new T.Mesh(G.visor, black);
				visor.position.set(0, y, 0.07);
				head.add(visor);
				const m = new T.Mesh(G.lens, new T.MeshBasicMaterial({ color: DARK[name] }));
				m.userData.ownMaterial = true;
				m.position.set(0, y, 0.12);
				head.add(m);
				m.userData.dark = DARK[name];
				return m;
			});
			// tabliczka z oznaczeniem semafora
			const label = sig.label || (sig.type === 'starter' ? 'O' + (sig.station + 1) : sig.name.replace('Sbl ', 'S'));
			const tex = labelTexture(label, '#f4f4f4', '#111111');
			const pm = NS.util.patch(new T.MeshStandardMaterial({ map: tex, roughness: 0.6 }), 'lit');
			pm.userData.shared = false;
			if (!World.boardGeo) { World.boardGeo = new T.PlaneGeometry(1, 1); World.boardGeo.userData.shared = true; }
			const plate = new T.Mesh(World.boardGeo, pm);
			plate.userData.ownMaterial = true;
			plate.scale.set(0.7, 0.16, 1);
			plate.position.set(spot.gantry ? 1.6 : 0, spot.gantry ? hy - 1.25 : 2.6, 0.11);
			g.add(plate);
			/* pas świetlny pod głowicą (Ie-1: zielony – 100 km/h, pomarańczowy – 60 km/h przy semaforze): poziomy świecący
			   pas w czarnej skrzynce z białą obwódką */
			head.add(box(1.02, 0.3, 0.3, white, 0, -1.78, -0.12));
			head.add(box(0.94, 0.22, 0.32, black, 0, -1.78, -0.11));
			const pas = new T.Mesh(GEO.box, new T.MeshBasicMaterial({ color: 0x2a2a2a }));
			pas.userData.ownMaterial = true;
			pas.scale.set(0.78, 0.08, 0.02);
			pas.position.set(0, -1.78, 0.06);
			head.add(pas);
			// poświaty przy świecących lampach: górnej (albo czerwonej) i dolnej pomarańczowej (położenie ustawiane przy zmianie)
			const glow = sprite(glowTexture(), 2.2, 2.2, { additive: true, fog: false });
			glow.position.set(0, 0, 0.5);
			head.add(glow);
			const glow2 = sprite(glowTexture(), 2.2, 2.2, { additive: true, fog: false });
			glow2.position.set(0, lamps[3].position.y, 0.5);
			head.add(glow2);
			g.traverse((o) => { if (o.isMesh) { o.castShadow = this.shadows; o.receiveShadow = true; } });
			dyn.push({ type: opp ? 'oppSignal' : 'signal', index: idx, lamps, glow, glow2, pas, key: null });
			group.add(g);
		}

		/* Tarcze ostrzegawcze (Ie-1, wg Wikipedii i zdjęcia tarczy w Ustroniu): przed semaforem wjazdowym, gdy poprzedni
		   sygnał to semafor odjazdowy albo wjazdowy (szlak bez samoczynnej blokady liniowej – przy SBL rolę tarczy pełni
		   ostatni semafor odstępowy), w odległości drogi hamowania (1000 m; nie bliżej niż 150 m za poprzednim sygnałem).
		   Lista dla trasy liczona raz: { pos, index – semafor wjazdowy (r.signals), label }. */
		warnDiscs() {
			if (this._warn) return this._warn;
			const r = this.route, list = [];
			const sg = r.signals.map((s, i) => ({ s, i })).sort((a, b) => a.s.pos - b.s.pos);
			sg.forEach(({ s, i }, k) => {
				if (s.kind !== 'entry' || k === 0) return;
				const prev = sg[k - 1].s;
				if (prev.kind === 'block') return;
				const pos = s.pos - 1000;
				if (pos < prev.pos + 150 || pos < 50) return;
				list.push({ pos, index: i, label: 'To' + (s.label || '') });
			});
			this._warn = list;
			return list;
		}

		/* Tarcza ostrzegawcza świetlna: szary maszt rurowy na fundamencie, czarna głowica z dwiema komorami (górna zielona,
		   dolna pomarańczowa) z daszkami, tabliczka z oznaczeniem pod głowicą; przed nią wskaźnik W 1 (biała tablica
		   z czarną obwódką i czarnym krzyżem ukośnym). Sygnały (world update): Os1 – pomarańczowe ciągłe (semafor: stój),
		   Os2 – zielone ciągłe, Os3 – zielone migające (100 km/h), Os4 – pomarańczowe migające (40 / 60 km/h). */
		buildWarnDisc(group, dyn, w) {
			const G = this.signalGeos();
			let s = w.pos;
			if (this.route.electrified) {
				const m = ((s % 60) + 60) % 60;
				if (m < 2.5) s -= 3 - m;
				else if (m > 57.5) s -= 3 - (60 - m);
			}
			const g = new T.Group();
			const d = this.env && this.envBoardSpot ? this.envBoardSpot(s) : 3.4;
			this.place(g, s, d);
			const steel = matS('#9aa0a6', { roughness: 0.45, metalness: 0.6 }), grey = matS('#a7acb1', { roughness: 0.5, metalness: 0.5 });
			const black = matS('#121212', { roughness: 0.5, metalness: 0.2 });
			g.add(box(0.6, 0.45, 0.6, mat('#9e9a92', { roughness: 0.95 }), 0, -0.05, 0));
			const mast = new T.Mesh(GEO.cyl, grey);
			mast.scale.set(0.17, 3.6, 0.17);
			mast.position.set(0, 0.2 + 1.8, 0);
			g.add(mast);
			g.add(box(0.26, 0.06, 0.26, steel, 0, 0.22, 0));
			// głowica (skala 0,7 jak semafor): tarcza tła, komory z daszkami i soczewkami
			const head = new T.Group();
			head.position.set(0, 4.25, 0);
			head.scale.setScalar(0.7);
			g.add(head);
			const sh = new T.Mesh(G.shield, black);
			sh.scale.set(1, 0.5, 1);
			head.add(sh);
			head.add(box(0.5, 1.3, 0.3, black, 0, 0, -0.15));
			const DARK = { green: 0x123018, yellow: 0x3a2808 };
			const lamps = ['green', 'yellow'].map((name, k) => {
				const y = k ? -0.34 : 0.34;
				const ring = new T.Mesh(G.ring, steel);
				ring.position.set(0, y, 0.09);
				head.add(ring);
				const visor = new T.Mesh(G.visor, black);
				visor.position.set(0, y, 0.07);
				head.add(visor);
				const m = new T.Mesh(G.lens, new T.MeshBasicMaterial({ color: DARK[name] }));
				m.userData.ownMaterial = true;
				m.userData.dark = DARK[name];
				m.position.set(0, y, 0.12);
				head.add(m);
				return m;
			});
			// wspornik głowicy i tabliczka z oznaczeniem
			g.add(box(0.1, 0.4, 0.1, steel, 0, 3.75, -0.08));
			const pm = NS.util.patch(new T.MeshStandardMaterial({ map: labelTexture(w.label, '#f4f4f4', '#111111'), roughness: 0.6 }), 'lit');
			pm.userData.shared = false;
			if (!World.boardGeo) { World.boardGeo = new T.PlaneGeometry(1, 1); World.boardGeo.userData.shared = true; }
			const plate = new T.Mesh(World.boardGeo, pm);
			plate.userData.ownMaterial = true;
			plate.scale.set(0.42, 0.13, 1);
			plate.position.set(0, 3.62, 0.1);
			g.add(plate);
			// wskaźnik W 1 – 4 m przed tarczą (bliżej nadjeżdżającego pociągu), na niskim słupku
			if (!World.w1Mat) {
				const tex = canvasTexture('w1', 128, 192, (c, W, H) => {
					c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, W, H);
					c.strokeStyle = '#111'; c.lineWidth = 12; c.strokeRect(6, 6, W - 12, H - 12);
					c.lineWidth = 22; c.beginPath(); c.moveTo(14, 14); c.lineTo(W - 14, H - 14); c.moveTo(W - 14, 14); c.lineTo(14, H - 14); c.stroke();
				});
				World.w1Mat = NS.util.patch(new T.MeshStandardMaterial({ map: tex, roughness: 0.6 }), 'lit');
			}
			const w1 = new T.Group();
			this.place(w1, s - 4, d - Math.sign(d || 1) * 0.6);
			const pl = new T.Mesh(World.boardGeo, World.w1Mat);
			pl.scale.set(0.6, 0.9, 1);
			pl.position.set(0, 1.25, 0.03);
			w1.add(pl);
			w1.add(box(0.62, 0.92, 0.02, steel, 0, 1.25, 0));
			w1.add(box(0.07, 0.85, 0.07, steel, 0, 0.42, -0.03));
			const glow = sprite(glowTexture(), 2.0, 2.0, { additive: true, fog: false });
			glow.position.set(0, 0, 0.5);
			head.add(glow);
			for (const o of [g, w1]) o.traverse((x) => { if (x.isMesh) { x.castShadow = this.shadows; x.receiveShadow = true; } });
			dyn.push({ type: 'warnDisc', index: w.index, lamps, glow, key: null });
			group.add(g, w1);
		}

		// tablica przy torze na słupku, przodem do nadjeżdżającego pociągu; shape: 'sq' | 'tri'
		/* Tablice ograniczeń doraźnych (scenariusz – sim.tempLimits): trójkątna zapowiedź 700 m przed odcinkiem, tarcza
		   z prędkością na początku i tarcza z prędkością przywróconą za końcem odcinka. Stawiane w zbudowanych kawałkach
		   (także po ich ponownej budowie – ch.temp: postawione tablice). */
		syncTempBoards(sim) {
			sim.tempLimits.forEach((t, k) => {
				const after = R.limitAt(this.route, t.to + 1);
				const boards = [[t.from - 700, 'tri', '#ff9f1c', t.speed], [t.from, 'sq', '#ffd23f', t.speed], [t.to + 5, 'sq', '#ffffff', after]];
				boards.forEach(([pos, shape, col, v], j) => {
					const ch = this.chunks.get(Math.floor(pos / C));
					if (!ch || pos < 0) return;
					const key = k * 3 + j;
					if (!ch.temp) ch.temp = new Set();
					if (ch.temp.has(key)) return;
					ch.temp.add(key);
					this.buildBoard(ch.group, pos, boardTexture(String(v), col, shape), shape);
				});
			});
		}

		buildBoard(group, s, tex, shape) {
			// nie w miejscu słupa trakcyjnego (słupy co 60 m po tej samej stronie toru) – przesunięcie przed słup
			if (this.route.electrified) {
				const m = ((s % 60) + 60) % 60;
				if (m < 2.5) s -= 3 - m;
				else if (m > 57.5) s -= 3 - (60 - m) ;
			}
			const g = new T.Group();
			this.place(g, s, this.env ? this.envBoardSpot(s) : 3.1);
			const pole = matS('#8a8f94', { roughness: 0.5, metalness: 0.6 });
			const p = new T.Mesh(GEO.cyl, pole);
			p.scale.set(0.08, 2.9, 0.08);
			p.position.set(0, 1.25, 0.05);
			g.add(p);
			// obejmy mocujące tarczę do słupka (tarcza ok. 0,85 m – jak tablice PKP)
			for (const y of [2.45, 2.95]) g.add(box(0.13, 0.05, 0.1, pole, 0, y, 0.05));
			this.fixedBoard(g, tex, shape || 'sq', 0.85, 0, 2.7, 0);
			group.add(g);
		}

		// Płaska tarcza: lico (tekstura) od strony nadjeżdżającego pociągu (lokalne +z), szary tył z blachy.
		// Materiały wspólne dla jednakowych tarcz.
		fixedBoard(g, tex, shape, size, x, y, z) {
			if (!World.boardGeo) {
				World.boardGeo = new T.PlaneGeometry(1, 1);
				World.boardGeo.userData.shared = true;
			}
			World.boardMats = World.boardMats || new Map();
			const get = (key, make) => {
				if (!World.boardMats.has(key)) World.boardMats.set(key, make());
				return World.boardMats.get(key);
			};
			const front = get(tex.uuid, () => NS.util.patch(new T.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.45, metalness: 0.05 }), 'lit'));
			const backTex = boardTexture('', '#7d8287', shape === 'tri' ? 'tri' : 'sq');
			const back = get('back|' + shape, () => NS.util.patch(new T.MeshStandardMaterial({ map: backTex, alphaTest: 0.5, roughness: 0.55, metalness: 0.5 }), 'lit'));
			const f = new T.Mesh(World.boardGeo, front);
			f.scale.set(size, size, 1);
			f.position.set(x, y, z + 0.11);
			f.castShadow = true;
			g.add(f);
			const b = new T.Mesh(World.boardGeo, back);
			b.scale.set(size, size, 1);
			b.rotation.y = Math.PI;
			b.position.set(x, y, z + 0.1);
			g.add(b);
		}

		roadY(s, d) {
			const h = R.heightAt(this.route, s);
			const ad = this.eff(d);
			/* trasa rzeczywista: jezdnia przejazdu w poziomie główek szyn wszystkich torów, które przecina – naszego i torów
			   z mapy (każdy na swojej wysokości, envRowY) – 2 cm pod główką (szyny widoczne, bez progu); między torami
			   wysokość liniowo od jednego do drugiego, za skrajnym torem zjazd do nawierzchni ulicy (do ok. 8%). Dawniej
			   poziom naszego toru do 3,4 m od osi i zaraz nawierzchnia ulicy – sąsiednie tory z mapy (na innej wysokości)
			   wystawały ponad jezdnię albo chowały się pod nią */
			if (this.env && this.surfY && this.envTracksAt) {
				const tr = [{ d: 0, y: h }];
				for (const t of this.envTracksAt(s)) if (Math.abs(t.d - d) < 25 && Math.abs(t.d) > 1) tr.push({ d: t.d, y: this.envRowY(t.i, t.k, s, t.d) });
				tr.sort((a, b) => a.d - b.d);
				const RAIL = 1.6; // od osi toru: szyny i podkłady pod płytami przejazdu
				let lo = null, hi = null;
				for (const t of tr) { if (t.d <= d) lo = t; else if (!hi) hi = t; }
				const top = (t) => t.y - 0.02;
				if (lo && hi && hi.d - lo.d < 9) { const u = (d - lo.d) / (hi.d - lo.d || 1); return top(lo) + (top(hi) - top(lo)) * u; }
				const near = !lo ? hi : !hi ? lo : d - lo.d < hi.d - d ? lo : hi, m = Math.abs(d - near.d);
				if (m <= RAIL) return top(near);
				const ys = this.surfY(s, d) + 0.1, ramp = Math.max(6, Math.abs(ys - top(near)) / 0.08);
				const t = smoothstep(0, 1, Math.min(1, (m - RAIL) / ramp));
				return top(near) * (1 - t) + ys * t;
			}
			if (ad < 3.4) return h - 0.14;
			const t = smoothstep(3.4, 7, ad);
			return (h - 0.14) * (1 - t) + (this.terrainY(s, d) + 0.08) * t;
		}

		buildCrossing(group, dyn, cr) {
			const pts = [], idx = [];
			// trasa rzeczywista: prawdziwa ulica z mapy przez przejazd (envCrossingPath); jezdnia z gry tylko na łączniku
			// i w pasie, w którym ulica z mapy przy przejeździe nie jest rysowana
			const path = this.env && this.envCrossingPath ? this.envCrossingPath(cr) : null;
			const wp = [], wi = []; // chodniki (osobna siatka – jaśniejsza nawierzchnia)
			if (path) {
				const half = Math.max(2.8, path.w / 2), SW = 2.0, CURB = 0.12;
				/* jezdnia przejazdu w tym samym zasięgu, w którym ulica z mapy nie jest rysowana (real-env onCrossing: do 45 m
				   wzdłuż toru i 40 m od osi) – dawniej tylko do 12,5 m wzdłuż toru i na ulicy skośnej do toru zostawała między
				   nią a ulicą z mapy szczelina z trawą; chodniki (gdy ulica je ma) po obu stronach: krawężnik 0,12 m, przez
				   pas torów – w poziomie jezdni */
				const rows = [];
				for (let u = 0; u <= path.L; u += 2) {
					const [s, d] = path.at(u);
					const inSkip = (Math.abs(s - cr.pos) <= 45 && Math.abs(d) <= 40) || (u >= path.link[0] - 2 && u <= path.link[1] + 2);
					if (!inSkip) { rows.push(null); continue; }
					const [s2, d2] = path.at(Math.min(path.L, u + 0.5)), [s1, d1] = path.at(Math.max(0, u - 0.5));
					const L = Math.hypot(s2 - s1, d2 - d1) || 1, ns = -(d2 - d1) / L, nd = (s2 - s1) / L;
					const atO = (o, dy) => { const ss = s + ns * o, dd = d + nd * o; R.sidePoint(this.route, ss, dd, tp); return [tp.x, this.roadY(ss, dd) + dy, tp.z]; };
					const inZone = u >= path.zone[0] - 1 && u <= path.zone[1] + 1, cy = inZone ? 0.01 : CURB;
					rows.push({ u, atO, road: [atO(-half, 0), atO(half, 0)], walk: path.sw ? [[atO(-half - SW, cy), atO(-half, cy), atO(-half, 0)], [atO(half, 0), atO(half, cy), atO(half + SW, cy)]] : null });
				}
				/* oznakowanie poziome jezdni przejazdu (jak na ulicach i pomostach – deckDress): przy przejeździe oś ciągła
				   (dwukierunkowa; od 4 pasów podwójna ciągła i przerywane między pasami), jednokierunkowa – przerywane między
				   pasami, linie krawędziowe bez chodnika; przerwa w pasie torów (path.zone ± 1,5 m). Dawniej jezdnia
				   przejazdu bez linii, a ulica z mapy obok z pasami */
				const MKM = World.envM && World.envM.roadMark;
				if (MKM && !path.surf && path.ti <= 6 && 2 * half >= 4.5) {
					const mp = [], mc = [], WC = new T.Color('#e9e7e0');
					const cw = 2 * half - 0.6, lanes = Math.max(1, Math.min(path.lanes || 1, Math.floor(cw / 2.6)));
					const quad = (r1, r2, o0, o1) => {
						const a = r1.atO(o0, 0.02), b = r1.atO(o1, 0.02), c = r2.atO(o1, 0.02), d = r2.atO(o0, 0.02);
						// trójkąty przodem do góry (materiał jednostronny, kierunek ulicy dowolny)
						for (const [p, q, w2] of [[a, b, c], [a, c, d]]) {
							const up = (q[2] - p[2]) * (w2[0] - p[0]) - (q[0] - p[0]) * (w2[2] - p[2]) > 0;
							for (const v of up ? [p, q, w2] : [p, w2, q]) { mp.push(...v); mc.push(WC.r, WC.g, WC.b); }
						}
					};
					const offs = []; // [odsunięcie, przerywana]
					if (!path.one) {
						if (lanes >= 4) offs.push([-0.12, false], [0.12, false], [-cw / 4, true], [cw / 4, true]);
						else if (lanes >= 2) offs.push([0, false]);
					} else for (let l = 1; l < lanes; l++) offs.push([-cw / 2 + (cw * l) / lanes, true]);
					if (!path.sw) offs.push([-half + 0.55, false], [half - 0.55, false]);
					rows.forEach((r2, j) => {
						const r1 = rows[j - 1];
						if (!r2 || !r1 || (r2.u > path.zone[0] - 1.5 && r1.u < path.zone[1] + 1.5)) return;
						for (const [o, dashed] of offs) {
							// przerywana 3 m / 3 m (wiersze co 2 m: co trzeci odcinek przerwy)
							if (dashed && Math.floor(r1.u / 2) % 3 === 2) continue;
							quad(r1, r2, o - 0.06, o + 0.06);
						}
					});
					if (mp.length) {
						const mg = new T.BufferGeometry();
						mg.setAttribute('position', new T.Float32BufferAttribute(mp, 3));
						mg.setAttribute('color', new T.Float32BufferAttribute(mc, 3));
						mg.computeVertexNormals();
						const mk = new T.Mesh(mg, MKM);
						mk.receiveShadow = true;
						group.add(mk);
					}
				}
				rows.forEach((r2, j) => {
					const r1 = rows[j - 1];
					if (!r2 || !r1) return;
					const b0 = pts.length / 3;
					pts.push(...r1.road[0], ...r1.road[1], ...r2.road[0], ...r2.road[1]);
					idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
					if (!r2.walk) return;
					for (const side of [0, 1]) {
						// pasy: chodnik (płaski) i lico krawężnika (pionowe, od strony jezdni)
						const A = r1.walk[side], B = r2.walk[side];
						for (const [i0, i1] of side ? [[0, 1], [1, 2]] : [[1, 2], [0, 1]]) {
							const c0 = wp.length / 3;
							wp.push(...A[i0], ...A[i1], ...B[i0], ...B[i1]);
							wi.push(c0, c0 + 2, c0 + 1, c0 + 1, c0 + 2, c0 + 3);
						}
					}
				});
			}
			const ds = [];
			if (!path) for (let d = -150; d <= 150; d += 5) ds.push(d);
			ds.forEach((d, j) => {
				for (const off of [-3.2, 3.2]) {
					R.sidePoint(this.route, cr.pos + off, d, tp);
					pts.push(tp.x, this.roadY(cr.pos + off, d), tp.z);
				}
				if (j) {
					const a = (j - 1) * 2, b = a + 1, c = a + 2, e = a + 3;
					idx.push(a, c, b, b, c, e);
				}
			});
			const geo = new T.BufferGeometry();
			geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
			geo.setIndex(idx);
			geo.computeVertexNormals();
			const road = new T.Mesh(geo, mat('#4c4c52', { side: T.DoubleSide }));
			road.receiveShadow = true;
			group.add(road);
			if (wp.length) {
				const wg = new T.BufferGeometry();
				wg.setAttribute('position', new T.Float32BufferAttribute(wp, 3));
				wg.setIndex(wi);
				wg.computeVertexNormals();
				const walk = new T.Mesh(wg, mat('#a7a49d', { side: T.DoubleSide, roughness: 0.9 }));
				walk.receiveShadow = true;
				group.add(walk);
			}

			const lights = [], glows = [], arms = [];
			/* Pas torów przejazdu: wszystkie tory, które przecina droga – tor pociągu, drugi tor z gry i tory z mapy
			   (wcześniej tylko tor pociągu: przy kilku torach sygnalizatory stały między torami albo tuż przy szynach,
			   a auta zatrzymywały się na sąsiednich torach). zLo / zHi – granice pasu (oś skrajnego toru ± 3,2 m). */
			const trackD = [0];
			if (this.route.double && !this.env) trackD.push(SECOND);
			if (this.env && this.envTracksAt) for (const t of this.envTracksAt(cr.pos)) if (Math.abs(t.d) < 40) trackD.push(t.d);
			const zLo = Math.min(...trackD) - 3.2, zHi = Math.max(...trackD) + 3.2;
			// sygnalizator 3 m przed pasem torów (ok. 5,5 m od najbliższej szyny), linia zatrzymania aut przy nim
			const SIG = 3, STOP = SIG + 2.6;
			// odległość punktu (s, d) od najbliższej szyny (tor pociągu, drugi tor z gry, tory z mapy)
			const railDist = (ss, dd) => {
				let m = Math.min(Math.abs(dd), this.route.double && !this.env ? Math.abs(dd - SECOND) : Infinity);
				if (this.env && this.envTracksAt) for (const t of this.envTracksAt(ss)) m = Math.min(m, Math.abs(dd - t.d));
				return m - 0.75;
			};
			/* trasa rzeczywista: sygnalizator przy prawdziwej ulicy (envCrossingPath) – przed pasem torów tej ulicy
			   (path.zone), z boku jezdni (po prawej dla nadjeżdżających) i przodem do aut jadących po niej. Przy ulicy
			   ukośnej do toru kilka metrów wzdłuż drogi to mało w poprzek toru – sygnalizator przesuwany od torów, aż
			   stoi co najmniej 3,5 m od najbliższej szyny (jezdnia w tym miejscu – 3 m); u – miejsce na ulicy (linia
			   zatrzymania aut przed nim) */
			const placeAt = (side) => {
				if (!path) return null;
				const u0 = side < 0 ? path.zone[0] : path.zone[1], du = side < 0 ? -1 : 1;
				let out = null;
				for (let k = SIG; k <= 45; k += 0.5) {
					const u = Math.max(0, Math.min(path.L, u0 + du * k));
					const [s0, d0] = path.at(u), [sa, da] = path.at(Math.max(0, u - 1)), [sb, db] = path.at(Math.min(path.L, u + 1));
					// kierunek nadjeżdżania (ku torowi): po stronie d < 0 – rosnące u, po drugiej – malejące
					const a = side < 0 ? Math.atan2(db - da, sb - sa) : Math.atan2(da - db, sa - sb);
					const off = Math.max(5, path.w / 2 + 1.8);
					out = { s: s0 + Math.cos(a + Math.PI / 2) * off, d: d0 + Math.sin(a + Math.PI / 2) * off, a, u };
					if ((railDist(s0, d0) >= 3 && railDist(out.s, out.d) >= 3.5) || u === 0 || u === path.L) break;
				}
				return out;
			};
			const sigs = [placeAt(-1), placeAt(1)];
			for (const [off, side, pa] of [[-5, zLo - SIG, sigs[0]], [5, zHi + SIG, sigs[1]]]) {
				const g = new T.Group();
				const ps = pa ? pa.s : cr.pos + off, pd = pa ? pa.d : side;
				this.place(g, ps, pd);
				g.position.y = this.roadY(ps, pd);
				g.add(box(0.12, 3.2, 0.12, mat('#777777'), 0, 1.6, 0));
				// krzyż św. Andrzeja: białe ramiona (ok. 1,3 m) z czerwonym obramowaniem
				for (const a of [0.62, -0.62]) {
					const red = box(1.35, 0.24, 0.05, mat('#c62828'), 0, 2.9, 0.01);
					red.rotation.z = a;
					g.add(red);
					const arm = box(1.29, 0.15, 0.06, mat('#f4f4f4'), 0, 2.9, 0.03);
					arm.rotation.z = a;
					g.add(arm);
				}
				// sygnalizator: belka, czarne tarcze z daszkami, dwie lampy
				g.add(box(1.2, 0.12, 0.08, mat('#333333'), 0, 2.2, -0.02));
				for (const lx of [-0.4, 0.4]) {
					const plate = new T.Mesh(GEO.cyl, mat('#141414'));
					plate.scale.set(0.62, 0.04, 0.62);
					plate.rotation.x = Math.PI / 2;
					plate.position.set(lx, 2.2, 0.02);
					g.add(plate);
					g.add(box(0.42, 0.04, 0.22, mat('#141414'), lx, 2.42, 0.13));
					const l = new T.Mesh(GEO.sphere, new T.MeshBasicMaterial({ color: 0x3a1a1a }));
					l.userData.ownMaterial = true;
					l.scale.set(0.3, 0.3, 0.14);
					l.position.set(lx, 2.2, 0.08);
					g.add(l);
					lights.push(l);
					const gl = sprite(glowTexture(), 3, 3, { additive: true, color: 0xff3020, fog: false });
					gl.position.set(lx, 2.2, 0.35);
					gl.material.opacity = 0;
					g.add(gl);
					glows.push(gl);
				}
				// znak i lampy przodem do nadjeżdżających aut (droga biegnie w poprzek toru; przy ulicy z mapy – wg jej kierunku)
				g.rotateY(pa ? -pa.a : side < 0 ? -Math.PI / 2 : Math.PI / 2);
				/* półrogatka: napęd przy słupie, ramię w pasy biało-czerwone z trzema lampkami do osi jezdni, przeciwwaga;
				   opuszczana kilka sekund po włączeniu sygnalizacji (updateDyn). Strona jezdni i długość ramienia – z położenia
				   osi drogi w układzie sygnalizatora */
				g.updateMatrix();
				if (path && pa) { const [rs, rd] = path.at(pa.u); R.sidePoint(this.route, rs, rd, tp); }
				else R.sidePoint(this.route, cr.pos, pd, tp);
				const loc = new T.Vector3(tp.x, g.position.y, tp.z).applyMatrix4(new T.Matrix4().copy(g.matrix).invert());
				const sx = loc.x >= 0 ? 1 : -1, armL = Math.max(2.5, Math.min(7, Math.abs(loc.x) - 0.6));
				const drive = mat('#8d939a', { roughness: 0.6 }), dk = mat('#2b2e31');
				g.add(box(0.42, 1.0, 0.34, drive, sx * 0.45, 0.5, 0.32));
				g.add(box(0.46, 0.05, 0.38, dk, sx * 0.45, 1.02, 0.32));
				const pivot = new T.Group();
				pivot.position.set(sx * 0.45, 0.92, 0.55);
				const red = mat('#c62828', { roughness: 0.5 }), white = mat('#f2f2f2', { roughness: 0.5 });
				const nSeg = Math.max(4, Math.round(armL / 0.5));
				for (let k = 0; k < nSeg; k++) pivot.add(box(armL / nSeg, 0.1, 0.07, k % 2 ? white : red, sx * (0.15 + (k + 0.5) * (armL / nSeg)), 0, 0));
				pivot.add(box(0.4, 0.24, 0.14, dk, -sx * 0.32, 0, 0)); // przeciwwaga
				for (const f of [0.35, 0.68, 0.98]) {
					const lm = new T.Mesh(GEO.sphere, mat('#7a1a12', { roughness: 0.3 }));
					lm.scale.set(0.09, 0.09, 0.06);
					lm.position.set(sx * (0.15 + armL * f), 0.08, 0.03);
					pivot.add(lm);
				}
				pivot.userData.sgn = sx;
				pivot.rotation.z = sx * Math.PI * 0.48;
				g.add(pivot);
				arms.push(pivot);
				group.add(g);
			}
			const cars = [];
			for (let k = 0; k < 3; k++) {
				const car = this.carModel(cr.pos + k * 1.7);
				group.add(car);
				const dir = k % 2 ? -1 : 1;
				// stop – środek auta na linii zatrzymania (współrzędna d drogi w poprzek toru), exit – za pasem torów
				cars.push({ obj: car, dir, p: dir > 0 ? zLo - 20 - k * 60 : zHi + 20 + k * 60, speed: 11 + hash(cr.pos + k * 3) * 5, stop: dir > 0 ? zLo - STOP : zHi + STOP, exit: dir > 0 ? zHi + 3 : zLo - 3 });
				if (path) {
					// po ulicy z mapy: w – droga przebyta w kierunku jazdy; zatrzymanie 2,6 m przed sygnalizatorem
					const z0 = dir > 0 ? path.zone[0] : path.L - path.zone[1], z1 = dir > 0 ? path.zone[1] : path.L - path.zone[0];
					const sigW = dir > 0 ? sigs[0].u : path.L - sigs[1].u;
					Object.assign(cars[k], { w: Math.max(0, Math.min(z0, sigW) - 25 - k * 30), stopW: sigW - 2.6, entryW: Math.max(sigW - 2.6 + 0.5, z0 - 2.2), exitW: z1 + 3 });
				}
			}
			dyn.push({ type: 'crossing', cr, lights, glows, cars, path, arms, armT: 0, actT: 0 });
		}

		/* Wiadukt nad ulicą (trasy rzeczywiste): betonowe przęsło z gzymsami i balustradami, przyczółki ze
		   skrzydłami, filary przy dłuższych obiektach, pod spodem jezdnia z chodnikami i oznakowaniem. */
		buildViaduct(group, b) {
			const sp = this.bridgeSpan(b), mid = (sp[0] + sp[1]) / 2, len = Math.max(14, sp[1] - sp[0]);
			const g = new T.Group();
			const conc = mat('#a7a39b', { roughness: 0.92 }), dark = mat('#8a867e', { roughness: 0.95 });
			const rail = matS('#5d6670', { roughness: 0.5, metalness: 0.5 });
			const dbl = this.route.double && !this.env; // trasa rzeczywista: drugi tor (z mapy) ma własny pomost
			const cx = dbl ? SECOND / 2 : 0, wide = dbl ? 10.6 : 6;
			const h0 = R.heightAt(this.route, mid);
			/* trasa rzeczywista: przyczółki nie na ulicy ani chodniku pod mostem – przęsło z danych bywa krótsze niż prześwit
			   nad ulicą (przyczółek stał na chodniku i części jezdni): przyczółek odsuwany wzdłuż toru na zewnątrz (co 0,75 m,
			   do 15 m), aż jego obrys (3,2 m wzdłuż, szerokość korony nasypu) nie zachodzi na drogę z mapy niżej niż most;
			   przęsło i balustrady – do przyczółków */
			const shL = this.env ? this.bridgeShoulder(b, -1) : 0, shR = this.env ? this.bridgeShoulder(b, 1) : 0;
			const abW = shL + shR + 1.5, ax = (shR - shL) / 2;
			const abutOnRoad = (z) => {
				if (!this.env || !this.onRoad) return false;
				// (maska onRoad obejmuje też tory z mapy – ulica pod mostem z odcinków dróg: roadBelowDeck)
				for (const dz of [-1.6, -0.8, 0, 0.8, 1.6]) for (let x = ax - abW / 2 - 0.6; x <= ax + abW / 2 + 0.61; x += 1) {
					const s = mid - z - dz;
					if (this.roadBelowDeck ? this.roadBelowDeck(s, x, h0, 0.6) : this.onRoad(s, x)) return true;
				}
				return false;
			};
			const zAb = {};
			for (const e of [-1, 1]) {
				let z = e * (len / 2 + 1.6);
				for (let k = 0; k < 20 && abutOnRoad(z); k++) z += e * 0.75;
				zAb[e] = z;
			}
			// przęsło (od przyczółka do przyczółka, po 0,5 m na ich ławy) i gzymsy
			const dL = zAb[1] - zAb[-1] - 3.2 + 1, dz0 = (zAb[1] + zAb[-1]) / 2;
			/* trasa rzeczywista: pomost pod wszystkimi torami z mapy na poziomie naszej linii (w grupie torów – np. linia
			   średnicowa w Warszawie: 4 tory na estakadzie za Wisłą); dawniej 6 m pod naszym torem, a tory obok wisiały
			   w powietrzu bez pomostu i podpór. Szerokość [l, r] od osi co 10 m (oś skrajnego toru + 2,4 m, zaokrąglone
			   w górę do 1 m – mniej uskoków krawędzi), co najmniej 3 m */
			const extAt = (z) => {
				if (!this.env || !this.envTracksAt) return [wide / 2 - cx, wide / 2 + cx];
				const s = mid - z, hs = R.heightAt(this.route, s);
				let l = 3, r = 3;
				for (const t of this.envTracksAt(s)) {
					if (t.sk || Math.abs(t.d) > 25 || Math.abs(t.d) < 0.5) continue;
					if (Math.abs(this.envRowY(t.i, t.k, s, t.d) - hs) > 1) continue;
					if (t.d < 0) l = Math.max(l, Math.ceil(-t.d + 2.4)); else r = Math.max(r, Math.ceil(t.d + 2.4));
				}
				return [l, r];
			};
			const nD = this.env ? Math.max(1, Math.ceil(dL / 10)) : 1;
			for (let q = 0; q < nD; q++) {
				const z0 = dz0 - dL / 2 + (q * dL) / nD, z1 = z0 + dL / nD, zc = (z0 + z1) / 2, Lz = z1 - z0 + 0.02;
				const [l0, r0] = extAt(z0), [l1, r1] = extAt(z1), l = Math.max(l0, l1), r = Math.max(r0, r1);
				g.add(box(l + r, 1.1, Lz, conc, (r - l) / 2, -0.95, zc));
				for (const [sx, xe] of [[-1, -l], [1, r]]) {
					g.add(box(0.45, 0.35, Lz, dark, xe + sx * 0.05, -0.25, zc));
					// balustrada: słupki i poręcze
					for (let z = Math.max(z0, dz0 - dL / 2 + 0.5); z < z1 - 0.01 && z <= dz0 + dL / 2 - 0.5 + 1e-6; z += 2) g.add(box(0.07, 1.0, 0.07, rail, xe - sx * 0.05, 0.4, z));
					for (const y of [0.85, 0.45]) g.add(box(0.06, 0.06, Lz, rail, xe - sx * 0.05, y, zc));
				}
			}
			// przyczółki ze skrzydłami
			for (const e of [-1, 1]) {
				const z = zAb[e];
				if (this.env) {
					// przyczółek zamyka nasyp: szerokość korony nasypu, wysokość do dna obniżenia pod przęsłem
					const yIn = Math.min(this.terrainY(e > 0 ? b.from + 1 : b.to - 1, 0), this.terrainY((b.from + b.to) / 2, 0)) - h0;
					const hh = Math.max(2, -0.4 - yIn + 0.8);
					// (nie węższy niż pomost przy nim – extAt)
					const [la, ra] = extAt(z), lA = Math.max(abW / 2 - ax, la + 0.75), rA = Math.max(abW / 2 + ax, ra + 0.75);
					g.add(box(lA + rA, hh, 3.2, conc, (rA - lA) / 2, -0.4 - hh / 2, z));
					for (const [sx, xe] of [[-1, -lA], [1, rA]]) g.add(box(0.6, hh, 9, conc, xe + sx * 0.3, -0.4 - hh / 2, z + e * 4));
					continue;
				}
				const yb = this.terrainY(mid - z, 0) - h0;
				const hh = Math.max(2, -0.4 - yb + 1.2);
				g.add(box(wide + 1.2, hh, 3.2, conc, cx, -0.4 - hh / 2, z));
				for (const sx of [-1, 1]) {
					const wing = box(0.6, hh, 6, conc, cx + sx * (wide / 2 + 0.3), -0.4 - hh / 2, z + e * 2.5);
					g.add(wing);
				}
			}
			/* filary pośrednie: podpora w poprzek całego pomostu – słupy co najwyżej 6 m (skrajne 1,4 m od krawędzi), oczep pod
			   pomostem. Trasa rzeczywista: żaden słup nie na ulicy pod pomostem ani na torze innej linii niżej (ponad 3 m) –
			   słupy przesuwane w poprzek (skrajne do 2,5 m od miejsca, odstępy do 7 m), a gdy się nie da – cała podpora wzdłuż
			   mostu do 8 m; bez miejsca na komplet słupów podpora pominięta. Dawniej pomijane były pojedyncze słupy i zostawał
			   jeden słup z oczepem na całą szerokość (estakada linii średnicowej nad ulicami) */
			const colLayout = (z) => {
				const [l, r] = extAt(z), s = mid - z;
				const nC = Math.max(2, Math.ceil((l + r - 2.8) / 6) + 1), xs = [];
				for (let c = 0; c < nC; c++) xs.push(-l + 1.4 + ((l + r - 2.8) * c) / (nC - 1));
				if (!this.env) return xs;
				const low = (ss, dd) => { if (!this.onRoad || !this.onRoad(ss, dd)) return false; const rl = this.roadLevel(ss, dd); return rl !== undefined && rl < h0 - 3; };
				/* przy osi (korona torowiska – bez maski dróg) łącznik ulicy pod pomostem: jezdnia 3,5 m od osi po obu stronach
				   (do 10 m wzdłuż toru – ulica ukośna), odcinek między nimi przechodzi przez miejsce słupa (do 1,5 m) */
				const linkAt = (ss, dd) => {
					if (!this.env || Math.abs(dd) > 3) return false;
					for (let a = -10; a <= 10; a += 2) {
						if (!low(ss + a, -3.5)) continue;
						for (let b = -10; b <= 10; b += 2) {
							if (!low(ss + b, 3.5)) continue;
							const t = (dd + 3.5) / 7, sx = ss + a + (b - a) * t;
							if (Math.abs(sx - ss) < 1.5) return true;
						}
					}
					return false;
				};
				const colFree = (x) => {
					if (linkAt(s, x)) return false;
					for (let o = -0.75; o <= 0.75; o += 0.75) for (const dx of [-0.6, 0, 0.6]) {
						if (this.roadBelowDeck && this.roadBelowDeck(s + o, x + dx, h0, 0.5)) return false;
						/* rysowana jezdnia (maska dróg) ponad 3 m pod pomostem – także łączniki ulic przerwanych przy torze, których
						   końce w danych są poprzesuwane (ulica ukośna do toru, dwujezdniowa: Bytom Stroszek) */
						if (low(s + o, x + dx)) return false;
						if (this.envTracksAt && this.envTracksAt(s + o).some((t) => Math.abs(t.d - (x + dx)) < 2.4 && this.envRowY(t.i, t.k, s + o, t.d) < h0 - 3)) return false;
					}
					return true;
				};
				if (xs.every(colFree)) return xs;
				// układ przesunięty: skrajne słupy w wolnym miejscu do 2,5 m od krawędziowych, pośrednie zachłannie co ≤ 7 m
				const x0 = -l + 1.4, x1 = r - 1.4, free = [];
				for (let x = x0 - 2.5; x <= x1 + 2.5 + 1e-6; x += 0.5) if (x >= -l + 0.6 && x <= r - 0.6 && colFree(x)) free.push(x);
				const first = free.find((x) => x <= x0 + 2.5), last = [...free].reverse().find((x) => x >= x1 - 2.5);
				if (first === undefined || last === undefined || last - first < 1) return null;
				const out = [first];
				while (last - out[out.length - 1] > 7) {
					const cur = out[out.length - 1], nx = [...free].reverse().find((x) => x > cur + 1.5 && x <= cur + 7);
					if (nx === undefined) return null;
					out.push(nx);
				}
				out.push(last);
				return out;
			};
			if (len > 26) {
				// przęsła co 10 m, na długich estakadach (ponad 120 m) co 20 m
				for (let z0 = -len / 2 + 9; z0 < len / 2 - 8; z0 += len > 120 ? 20 : 10) {
					if (Math.abs(z0) < 7) continue;
					let z = null, cols = null;
					for (let o = 0; o <= 8 && z === null; o++) for (const sg of o ? [1, -1] : [1]) {
						const zz = z0 + sg * o;
						if (z !== null || Math.abs(zz) < 7 || Math.abs(zz) > len / 2 - 3) continue;
						const c = colLayout(zz);
						if (c) { z = zz; cols = c; }
					}
					if (z === null) continue;
					const s = mid - z;
					// (kontrola tras – audit.js: miejsca słupów, wysokość spodu pomostu)
					if (this.auditSink) for (const x of cols) this.auditSink.push({ kind: 'viaduct-col', s, d: x, r: 0.55, top: h0 - 2.3, bridge: b });
					for (const x of cols) {
						const hh = Math.max(1, -2.3 - (this.terrainY(s, x) - h0));
						const p = new T.Mesh(GEO.cyl, conc);
						p.scale.set(1.1, hh, 1.1);
						p.position.set(x, -2.3 - hh / 2, z);
						g.add(p);
					}
					g.add(box(Math.max(2, cols[cols.length - 1] - cols[0] + 1.6), 0.8, 1.5, conc, (cols[0] + cols[cols.length - 1]) / 2, -1.9, z));
				}
			}
			g.traverse((o) => { if (o.isMesh) { o.castShadow = this.shadows; o.receiveShadow = true; } });
			// jezdnia pod wiaduktem: pas wzdłuż terenu w poprzek toru, chodniki, linia środkowa
			const strip = (z0, z1, dy, material) => {
				const posA = [], idx = [];
				const xs = [];
				for (let x = -70; x <= 70; x += 5) xs.push(x);
				for (const x of xs) for (const z of [z0, z1]) posA.push(x, this.terrainY(mid - z, x) - h0 + dy, z);
				for (let k = 0; k < xs.length - 1; k++) {
					const a = k * 2, c = k * 2 + 2;
					idx.push(a, a + 1, c, c, a + 1, c + 1);
				}
				const geo = new T.BufferGeometry();
				geo.setAttribute('position', new T.Float32BufferAttribute(posA, 3));
				geo.setIndex(idx);
				geo.computeVertexNormals();
				const m = new T.Mesh(geo, material);
				m.receiveShadow = true;
				g.add(m);
			};
			if (!this.env) {
				// ulica pod wiaduktem (na trasach rzeczywistych jest z mapy)
				strip(-3.5, 3.5, 0.12, mat('#3b3e42', { roughness: 0.9 }));
				strip(3.5, 5.3, 0.25, mat('#8f8a82', { roughness: 0.95 }));
				strip(-5.3, -3.5, 0.25, mat('#8f8a82', { roughness: 0.95 }));
				strip(-0.08, 0.08, 0.14, mat('#e8e8e2', { roughness: 0.8 }));
			}
			this.bendGroup(g, mid);
			group.add(g);
		}

		buildBridge(group, b) {
			const mid = (b.from + b.to) / 2, len = b.to - b.from;
			const g = new T.Group();
			const stone = mat('#9a9287');
			const steel = mat('#3d5566');
			const spans = Math.max(1, Math.round(len / 45));
			const sl = len / spans;
			const dbl = this.route.double && !this.env;
			const cx = dbl ? SECOND / 2 : 0, wide = dbl ? 10 : 5.4;
			for (let i = 0; i <= spans; i++) {
				let z = len / 2 - i * sl;
				const pw = i === 0 || i === spans ? 6 : 3.4;
				// trasa rzeczywista: filar nie na ulicy z mapy pod mostem – przesunięty wzdłuż mostu (do 15 m), inaczej
				// pominięty (koniec długiego mostu nad ulicami – filar stawał w poprzek jezdni)
				if (this.env) {
					const blocked = (zz) => {
						const s = mid - zz;
						for (let o = -pw / 2 - 1.5; o <= pw / 2 + 1.5; o += 1) for (const dd of [-wide / 2, 0, wide / 2]) {
							// (maska onRoad obejmuje też tory z mapy – ulica pod mostem z odcinków dróg: roadBelowDeck)
							if (this.roadBelowDeck ? this.roadBelowDeck(s + o, cx + dd, R.heightAt(this.route, s), 0.5) : this.onRoad && this.onRoad(s + o, cx + dd)) return true;
							// tor innej linii pod mostem (ponad 3 m niżej)
							if (this.envTracksAt && this.envTracksAt(s + o).some((t) => Math.abs(t.d - (cx + dd)) < 2.4 && this.envRowY(t.i, t.k, s + o, t.d) < R.heightAt(this.route, s) - 3)) return true;
						}
						return false;
					};
					if (blocked(z)) {
						let nz = null;
						for (let o = 1; o <= 15 && nz === null; o++) for (const sg of [1, -1]) if (nz === null && Math.abs(z + sg * o) <= len / 2 && !blocked(z + sg * o)) nz = z + sg * o;
						if (nz === null) continue;
						z = nz;
					}
				}
				/* trasa rzeczywista: filar do dna (teren z pomiaru pod obrysem, pod wodą – dno koryta) – dawniej stała wysokość
				   11 m i na wysokim moście (Wisła, linia średnicowa) filary wisiały nad wodą */
				let hp = 11;
				if (this.env && this.terrainY) {
					const s = mid - z, h = R.heightAt(this.route, s);
					let bot = Infinity;
					for (const o of [-pw / 2, 0, pw / 2]) for (const dd of [-wide / 2 + 0.2, 0, wide / 2 - 0.2]) bot = Math.min(bot, this.terrainY(s + o, cx + dd));
					if (Number.isFinite(bot)) hp = Math.max(2, h - 0.9 - bot + 0.6);
				}
				g.add(box(pw, hp, wide - 0.4, stone, cx, -0.9 - hp / 2, z));
				if (this.auditSink) this.auditSink.push({ kind: 'bridge-pier', s: mid - z, d: cx, r: pw / 2, w: wide - 0.4, top: R.heightAt(this.route, mid - z) - 0.9, bridge: b });
			}
			g.add(box(wide, 0.6, len, mat('#4c5257'), cx, -0.75, 0));
			const panels = 6;
			for (let i = 0; i < spans; i++) {
				const za = len / 2 - i * sl, zb = za - sl;
				for (const x of dbl ? [SECOND - 2.7, 2.7] : [-2.7, 2.7]) {
					g.add(box(0.28, 0.4, sl, steel, x, -0.3, (za + zb) / 2));
					g.add(box(0.28, 0.32, sl - (2 * sl) / panels, steel, x, 4.8, (za + zb) / 2));
					for (let k = 0; k <= panels; k++) {
						const z = za - (k * sl) / panels;
						if (k > 0 && k < panels) g.add(box(0.2, 5.1, 0.2, steel, x, 2.25, z));
						if (k < panels) {
							const z2 = z - sl / panels;
							const end = k === 0 || k === panels - 1;
							const y1 = -0.3, y2 = 4.8;
							const up = k % 2 === 0;
							const ya = end ? (k === 0 ? y1 : y2) : up ? y1 : y2;
							const yb = end ? (k === 0 ? y2 : y1) : up ? y2 : y1;
							const dz = z2 - z, dy = yb - ya;
							const diag = box(0.16, Math.hypot(dz, dy), 0.16, steel, x, (ya + yb) / 2, (z + z2) / 2);
							diag.rotation.x = Math.atan2(dz, dy);
							g.add(diag);
						}
					}
				}
			}
			g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
			if (this.env) { this.bendGroup(g, mid); group.add(g); return; } // trasa rzeczywista: rzeka i brzegi z mapy
			const M = World.materials();
			const water = new T.Mesh(new T.PlaneGeometry(640, len - 14).rotateX(-Math.PI / 2), M.water);
			water.position.set(0, -8.25, 0);
			water.receiveShadow = true;
			g.add(water);
			// trzciny wzdłuż brzegów
			const reeds = new T.InstancedMesh(GEO.cone, M.reed, 260);
			const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p3 = new T.Vector3();
			let n = 0;
			for (let i = 0; i < 260; i++) {
				const bank = hash(b.from + i) < 0.5 ? 1 : -1;
				const z = bank * ((len - 14) / 2 - hash(b.from + i * 1.7) * 5);
				const x = (hash(b.from + i * 2.3) - 0.5) * 520;
				if (Math.abs(x) < 6) continue;
				const k = 0.7 + hash(b.from + i * 3.1) * 0.7;
				m4.compose(p3.set(x, -8.25 + 0.9 * k, z), q, sc.set(0.35 * k, 1.9 * k, 0.35 * k));
				reeds.setMatrixAt(n++, m4);
			}
			reeds.count = n;
			reeds.userData.fine = true;
			g.add(reeds);
			this.bendGroup(g, mid);
			group.add(g);
		}

		buildTunnel(group, dyn, t) {
			const r = this.route;
			const cols = [];
			for (let d = -110; d <= 110; d += 10) cols.push(d);
			const hill = (s, d) => {
				const ws = smoothstep(t.from - 22, t.from, s) * (1 - smoothstep(t.to, t.to + 22, s));
				const ridge = 15 + 10 * vnoise(s * 0.01, 4);
				const cd = Math.cos((Math.PI * Math.min(1, Math.abs(d) / 110)) / 2);
				const h = R.heightAt(r, s);
				return Math.max(this.terrainY(s, d), h - 0.95 + ridge * ws * cd * cd) + 0.06;
			};
			const ownMat = patch(new T.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1, side: T.DoubleSide }), 'lit');
			const geo = this.ribbon(t.from - 24, t.to + 24, 6, cols, hill, (s, d, y) => {
				const n = vnoise(s * 0.05, d * 0.05);
				const rock = y - R.heightAt(r, s) > 14 ? 0.15 : 0;
				return tmpColor.setRGB(0.27 + rock + n * 0.06, 0.4 + n * 0.08 - rock * 0.3, 0.22 + rock * 0.5, T.SRGBColorSpace);
			});
			const mound = new T.Mesh(geo, ownMat);
			mound.castShadow = true;
			mound.receiveShadow = true;
			group.add(mound);
			const stone = mat('#8c857a');
			for (const s of [t.from, t.to]) {
				const g = new T.Group();
				this.place(g, s, 0);
				const dbl = r.double, cx = dbl ? SECOND / 2 : 0, w = dbl ? 9.8 : 5.2;
				g.add(box(2, 8.5, 2, stone, cx - w / 2 - 1, 3.3, 0));
				g.add(box(2, 8.5, 2, stone, cx + w / 2 + 1, 3.3, 0));
				g.add(box(w + 4, 2, 2, stone, cx, 7.4, 0));
				g.add(box(w, 6.4, 0.6, mat('#111111'), cx, 2.3, s === t.from ? 0.9 : -0.9));
				group.add(g);
			}
			dyn.push({ type: 'tunnel', t, mat: ownMat, ownMat });
		}

		// ---------- aktualizacja ----------
		// stan latarń: klosze, poświaty, plamy i stożki światła (wspólne materiały) + pula świateł punktowych
		updateLamps(dark, haze) {
			const M = World.M;
			const night = dark > 0.15 ? Math.min(1, (dark - 0.1) * 1.5) : 0;
			// szadź na przewodach sieci trakcyjnej (zima, ze śniegiem): jaśniejsze, nocą przygaszone (linie nie są oświetlane)
			if (World.wireMat) {
				const rime = this.season === 'winter' ? 0.6 * Math.min(1, NS.util.U.uSnow.value * 1.6) : 0;
				World.wireMat.color.setHex(0x2a2a2a).lerp(tmpColor.setRGB(0.8, 0.84, 0.88), rime * (1 - 0.75 * Math.min(1, dark)));
				// (przewody jako bryły – trasy z mapy: też szadź; dawniej tylko linie)
				if (World.wireMesh) World.wireMesh.color.setHex(0x2c2e31).lerp(tmpColor.setRGB(0.8, 0.84, 0.88), rime * (1 - 0.75 * Math.min(1, dark)));
			}
			if (night > 0) M.lampLens.color.setRGB(1, 0.82, 0.55).multiplyScalar(1 + 3.5 * night);
			else M.lampLens.color.set('#d8d4c8');
			M.lampHalo.opacity = 0.75 * night;
			M.lampHalo.color.setRGB(1, 0.8, 0.55).multiplyScalar(1.6);
			M.lampPool.opacity = 0; // plamy światła – z mapy nocnej (updateNightMap) w shaderach podłoża
			// w mgle, deszczu i śniegu światło rozprasza się w powietrzu – szersza, miękka poświata
			const hz = Math.min(1, haze);
			M.lampHalo.opacity = (0.75 + 0.2 * hz) * night;
			const hs = 1.5 + 4.5 * hz;
			if (Math.abs(hs - (this.haloSize || 0)) > 0.05) {
				this.haloSize = hs;
				for (const ch of this.chunks.values()) ch.group.traverse((o) => { if (o.userData.lampHalo) o.scale.set(hs, hs, 1); });
			}
			const pool = this.lightPool;
			NS.util.U.uNightK.value = night;
			/* światła stacji podziemnych (userData.always): świecą także w dzień; nie trafiają do mapy nocnej (plamy na
			   ulicach nad stacją) */
			const cand = [];
			for (const ch of this.chunks.values()) {
				for (const d of ch.dyn) {
					// lampy semaforów mają własne poświaty – pula świateł jest tylko dla latarń, wiat i kinkietów
					if (!d.lamps || d.type === 'signal' || d.type === 'oppSignal' || d.type === 'warnDisc') continue;
					for (const lens of d.lamps) {
						const always = !!lens.userData.always;
						if (!night && !always) continue;
						lens.getWorldPosition(V3);
						const dd = V3.distanceToSquared(this.viewPos);
						if (dd < 360 * 360) cand.push({ dd, x: V3.x, y: V3.y - (lens.userData.drop || 0.4), z: V3.z, k: lens.userData.power || 1, tint: lens.userData.tint, reach: lens.userData.reach, always });
					}
				}
			}
			if (night) this.updateNightMap(cand.filter((c) => !c.always));
			cand.sort((a, b) => a.dd - b.dd);
			pool.forEach((l, k) => {
				const c = cand[k];
				if (!c) { l.intensity = 0; return; }
				l.position.set(c.x, c.y, c.z);
				l.intensity = 34 * (c.always ? 1 : night) * c.k; // plamy na ziemi – z mapy nocnej; punktowe dla ścian, pociągów i drobiazgów
			});
		}

		/* mapa światła nocnego (shader – common.js NIGHT_GLSL): 512 × 512 m wokół kamery (siatka co 16 m, bez pływania), co
		   0,5 s albo po przesunięciu. Lewa połowa: plama każdej latarni (promień zasięgu, barwa – LED ciepłobiała, sodowa
		   pomarańczowa), prawa: sama oprawa (do odbić w mokrym). urban – ile latarni w okolicy (łuna miasta na niebie). */
		updateNightMap(cand) {
			const N = 512, SZ = 512;
			const x0 = Math.round(this.viewPos.x / 16) * 16 - SZ / 2, z0 = Math.round(this.viewPos.z / 16) * 16 - SZ / 2;
			let nm = this.nightMap;
			if (!nm) {
				// (WebGPU: płótno i tekstura już są – nodes.js, wkompilowane w materiały)
				const pre = NS.gpu && NS.util.U.uNightTex.value.isCanvasTexture ? NS.util.U.uNightTex.value : null;
				const cv = pre ? pre.image : document.createElement('canvas');
				cv.width = N * 2;
				cv.height = N;
				const tex = pre || new T.CanvasTexture(cv);
				tex.flipY = false;
				tex.generateMipmaps = false;
				tex.minFilter = T.LinearFilter;
				tex.colorSpace = T.NoColorSpace;
				nm = this.nightMap = { cv, g: cv.getContext('2d'), tex, t: -1, x0: NaN, z0: NaN, n: -1 };
				NS.util.U.uNightTex.value = tex;
			}
			if (this.time - nm.t < 0.5 && nm.x0 === x0 && nm.z0 === z0 && nm.n === cand.length) return;
			nm.t = this.time;
			nm.x0 = x0;
			nm.z0 = z0;
			nm.n = cand.length;
			const g = nm.g, k = N / SZ;
			g.globalCompositeOperation = 'source-over';
			g.fillStyle = '#000';
			g.fillRect(0, 0, N * 2, N);
			g.globalCompositeOperation = 'lighter';
			let near = 0;
			for (const c of cand) {
				const u = (c.x - x0) * k, v = (c.z - z0) * k;
				if (u < -30 || v < -30 || u > N + 30 || v > N + 30) continue;
				if (c.dd < 200 * 200) near++;
				const tint = c.tint || '255,196,130', r = (c.reach || 7) * k, a = Math.min(0.8, 0.55 * c.k + 0.15);
				let gr = g.createRadialGradient(u, v, 0, u, v, r);
				gr.addColorStop(0, `rgba(${tint},${a})`);
				gr.addColorStop(0.45, `rgba(${tint},${a * 0.55})`);
				gr.addColorStop(1, `rgba(${tint},0)`);
				g.fillStyle = gr;
				g.fillRect(u - r, v - r, r * 2, r * 2);
				const re = 3 * k;
				gr = g.createRadialGradient(N + u, v, 0, N + u, v, re);
				gr.addColorStop(0, `rgba(${tint},1)`);
				gr.addColorStop(1, `rgba(${tint},0)`);
				g.fillStyle = gr;
				g.fillRect(N + u - re, v - re, re * 2, re * 2);
			}
			nm.tex.needsUpdate = true;
			NS.util.U.uNightBox.value.set(x0, z0, SZ);
			this.urban = Math.min(1, near / 90);
		}

		update(sim, dt, dark, haze) {
			if (!this.route) return;
			this.time += dt;
			// ruch uliczny i pieszy na trasie rzeczywistej (street-life.js)
			if (this.env && this.updateStreetLife) this.updateStreetLife(sim, dt, dark);
			// swobodna kamera: świat wokół kamery (streamS – jej kilometraż), w obie strony po równo
			const free = this.streamS !== null && this.streamS !== undefined;
			const front = free ? this.streamS : sim.st.pos;
			// zasięg świata: jakość (detail) × dopasowanie w grze (detailDyn – spadek FPS); najmniej 60 %
			const R = Math.max(0.6, (this.detail || 1) * (this.detailDyn || 1));
			const c0 = Math.floor((front - (free ? 900 : BEHIND * Math.min(1, R))) / C), c1 = Math.floor((front + (free ? 900 : AHEAD * R)) / C);
			for (const [c, ch] of this.chunks) {
				if (c < c0 - 1 || c > c1 + 1) {
					this.dropChunk(ch);
					this.chunks.delete(c);
				}
			}
			if (this.job && (this.job.c < c0 - 1 || this.job.c > c1 + 1)) this.abortJob();
			const cMin = Math.floor(-500 / C), cMax = Math.floor((this.route.length + 300) / C);
			const fc = Math.floor(front / C);
			const order = [];
			if (free) {
				for (let k = 0; fc - k >= c0 || fc + k <= c1; k++) {
					if (fc + k <= c1) order.push(fc + k);
					if (k && fc - k >= c0) order.push(fc - k);
				}
			} else {
				for (let c = fc; c <= c1; c++) order.push(c);
				for (let c = fc - 1; c >= c0; c--) order.push(c);
			}
			/* Budowa kawałków krokami w limicie czasu na klatkę, najpierw przy pociągu (−200…+600 m). Kawałek trasy
			   rzeczywistej to 0,1–0,5 s obliczeń – dawniej cały w jednej klatce (przy każdym doczytaniu krawędzi mapy
			   FPS spadał o połowę). Do sceny trafia dopiero gotowy kawałek. Zwykle ok. 3 ms na klatkę (dalekie kawałki
			   dobudowują się w tle); budowa nie nadąża (brakuje kawałka bliżej niż 900 m) – 8 ms; brak kawałka przy
			   pociągu (wczytywanie, zmiana trasy, skok kamery) albo fast (ekran wczytywania) – 40 ms. */
			const nearLo = Math.floor((front - 200) / C), nearHi = Math.floor((front + 600) / C);
			const isNear = (c) => c >= nearLo && c <= nearHi;
			const queue = order.filter(isNear).concat(order.filter((c) => !isNear(c)));
			const todo = () => queue.find((c) => c >= cMin && c <= cMax && !this.chunks.has(c) && !(this.job && this.job.c === c));
			// brakuje kawałka przy pociągu, a budujemy daleki – najpierw ten przy pociągu
			if (this.job && !isNear(this.job.c)) { const n = todo(); if (n !== undefined && isNear(n)) this.abortJob(); }
			const next = this.job ? this.job.c : todo();
			let budget = 3;
			if (this.fast || this.warm || (next !== undefined && isNear(next))) budget = 40;
			else if (next !== undefined && Math.abs(next * C + C / 2 - front) < 900) budget = 8;
			// swobodna kamera (podgląd mapy): wszystko w ±900 m od kamery – szybciej kosztem płynności (dawniej nad miastem
			// nawet minuta doczytywania)
			if (free && next !== undefined) budget = Math.max(budget, 20);
			const t0 = performance.now();
			while (performance.now() - t0 < budget) {
				if (!this.job) {
					const c = todo();
					if (c === undefined) break;
					this.job = this.chunkJob(c);
				}
				if (this.job.gen.next().done) {
					this.chunks.set(this.job.c, { group: this.job.group, dyn: this.job.dyn });
					this.job = null;
				}
			}
			this.warm = false;
			// kawałki wokół pociągu (kamery) jeszcze do zbudowania – ekran wczytywania czeka, aż będzie 0; pendingNear –
			// tylko te przy pociągu (okienko wczytywania po wyborze mapy)
			const left = order.filter((c) => c >= cMin && c <= cMax && !this.chunks.has(c));
			this.pending = left.length;
			this.pendingNear = left.filter((c) => c >= nearLo && c <= nearHi).length;
			if (World.M) {
				this.updateLamps(dark, haze || 0);
				World.M.litWin.emissiveIntensity = dark > 0.25 ? 0.9 * dark : 0;
				if (this.envNight) this.envNight(dark);
				World.M.normals.offset.x = (this.time * 0.006) % 1;
				World.M.normals.offset.y = (this.time * 0.011) % 1;
			}

			this.updateLod(free ? this.streamS : this.toTrack(this.viewPos.x, this.viewPos.z, front).s);
			if (this.treePoolDirty) this.updateTreePool();
			if (sim.tempLimits && sim.tempLimits.length) this.syncTempBoards(sim);
			const blink = Math.floor(this.time / 0.45) % 2;
			for (const ch of this.chunks.values()) {
				for (const d of ch.dyn) this.updateDyn(d, sim, dt, dark, blink);
			}
		}

		// Pasażerowie na peronie: czekający idą do najbliższych drzwi i wsiadają, wysiadający idą do wyjścia.
		/* Przeszkody na peronie dla pasażerów: obrysy (w rzucie) brył stacji na wysokości człowieka – ławki, kosze,
		   latarnie, słupy tablic i wiat, gabloty, ściany, budynek – w siatce oczek 0,2 m, powiększone o promień
		   człowieka. Bez płyt peronu (poniżej 0,95 m), dachów i tablic podwieszonych (powyżej 2,4 m) i pasażerów. */
		stationGrid(g, len) {
			g.updateMatrixWorld(true);
			const bx = new T.Box3(), boxes = [];
			for (const o of g.children) {
				if (o.isInstancedMesh || o.isSprite || o.isPoints || o.isLight || (!o.isMesh && !o.isGroup)) continue;
				bx.setFromObject(o);
				if (bx.isEmpty() || bx.min.y > 2.4 || bx.max.y < 0.95) continue;
				boxes.push([bx.min.x, bx.min.z, bx.max.x, bx.max.z]);
			}
			const C2 = 0.2, R0 = 0.22, x0 = -30, z0 = -len / 2 - 15, nx = Math.ceil(60 / C2), nz = Math.ceil((len + 30) / C2);
			const cells = new Uint8Array(nx * nz);
			for (const [ax, az, bx2, bz] of boxes) {
				const i0 = Math.max(0, Math.floor((ax - R0 - x0) / C2)), i1 = Math.min(nx - 1, Math.floor((bx2 + R0 - x0) / C2));
				const j0 = Math.max(0, Math.floor((az - R0 - z0) / C2)), j1 = Math.min(nz - 1, Math.floor((bz + R0 - z0) / C2));
				for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * nx + i] = 1;
			}
			return {
				// wolne miejsce (poza siatką – wolne)
				free: (x, z) => {
					const i = Math.floor((x - x0) / C2), j = Math.floor((z - z0) / C2);
					return i < 0 || j < 0 || i >= nx || j >= nz || !cells[j * nx + i];
				},
			};
		}

		/* Krok pieszego p ku celowi (tx, tz) o długość step z omijaniem przeszkód (siatka stacji) i innych osób (others):
		   kierunek do celu, a gdy zajęty – odchylenia na przemian, najpierw w stronę ostatniego wyboru (bez wahania);
		   ostatnie 1,2 m do celu bez omijania (miejsce w kolejce, drzwi – tuż przy innych); zablokowany ponad 1,5 s
		   przeciska się. Zwraca true po dojściu. */
		// keep – { E, sg, min }: kroki bliżej krawędzi peronu (E, zwrot sg) niż min odrzucane, chyba że oddalają od niej
		stepWalker(p, tx, tz, step, dts, G, others, keep) {
			const dx = tx - p.x, dz = tz - p.z, L = Math.hypot(dx, dz);
			if (L <= Math.max(step, 0.12)) { p.x = tx; p.z = tz; p.stuck = 0; return true; }
			if (step <= 0) return false;
			const ux = dx / L, uz = dz / L, near = L < 1.2, sd = p.side || 1;
			for (const a of [0, 0.45 * sd, -0.45 * sd, 0.9 * sd, -0.9 * sd, 1.4 * sd, -1.4 * sd, 1.9 * sd, -1.9 * sd]) {
				const c = Math.cos(a), sn = Math.sin(a), vx = ux * c - uz * sn, vz = ux * sn + uz * c;
				const nx = p.x + vx * step, nz = p.z + vz * step, lx = p.x + vx * 0.4, lz = p.z + vz * 0.4;
				if (!near && G && (!G.free(nx, nz) || !G.free(lx, lz))) continue;
				if (keep && (nx - keep.E) * keep.sg < keep.min && (nx - p.x) * keep.sg < 0) continue;
				let hit = false;
				if (!near) for (const o of others) {
					if (o === p) continue;
					const dn = Math.hypot(o.x - lx, o.z - lz);
					// blokuje tylko ktoś, do kogo się zbliżamy (oddalanie się zawsze wolno – bez zakleszczeń)
					if (dn < 0.45 && dn < Math.hypot(o.x - p.x, o.z - p.z)) { hit = true; break; }
				}
				if (hit) continue;
				if (a) p.side = Math.sign(a);
				p.x = nx; p.z = nz; p.stuck = 0;
				return false;
			}
			p.stuck = (p.stuck || 0) + dts;
			if (p.stuck > 1.5) { p.x += ux * step; p.z += uz * step; }
			return false;
		}

		updatePassengers(d, sim) {
			// nowa symulacja (np. po pociągu pokazowym w menu) – stan stacji od nowa
			if (d.sim !== sim) { d.sim = sim; d.init = false; d.boarding = false; d.lastT = null; d.doorQ = null; }
			const st = d.st, ss = sim.ss[d.index];
			const dts = d.lastT === null ? 0 : Math.max(0, Math.min(0.5, sim.time - d.lastT));
			d.lastT = sim.time;
			const W = d.W, A = d.A, I = d.I, S = d.S, Sp = d.Sp;
			let dirty = false;
			if (!d.init) {
				d.init = true;
				dirty = true;
				const n = st.terminus ? 0 : Math.min(W.cap, ss.initial);
				const gone = ss.state === 'served' && sim.service !== d.index;
				const departed = ss.state === 'departed' || ss.state === 'missed';
				W.list.forEach((p, k) => { p.state = k < n && !gone && !departed ? 'wait' : 'off'; });
				for (const P of [W, A, I, S, Sp]) P.bodies.count = P.heads.count = P.list.length; // tylko ustawione osoby
				/* czekający i spacerujący nie stoją w ławkach, latarniach ani w innych osobach: przesunięcie do najbliższego
				   wolnego miejsca (spirala do 3 m) */
				const placed = S.list.slice();
				for (const p of W.list.concat(Sp.list)) {
					if (p.state === 'off') continue;
					const ok = (x, z) => (!d.grid || d.grid.free(x, z)) && placed.every((o) => Math.hypot(o.x - x, o.z - z) > 0.55);
					if (!ok(p.x, p.z)) {
						search: for (let r = 0.3; r <= 3; r += 0.3) for (let k = 0; k < 12; k++) {
							const a = (k / 12) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
							if ((x - d.edgeX) * d.sgn > PAX && (x - d.edgeX) * d.sgn < d.width - 0.4 && ok(x, z)) { p.x = x; p.z = z; break search; }
						}
					}
					if (p.tx !== undefined && Sp.list.includes(p)) p.tx = p.x; // tor spaceru – nowe położenie w poprzek
					placed.push(p);
				}
			}
			/* Wymiana pasażerów przy drzwiach (czas symulacji t):
			   – po otwarciu drzwi (ok. 1,4 s) najpierw wysiadają: kolejno co ok. 1,5 s na drzwi, ze stopnia wagonu
			     (podłoga o STEP wyżej) schodzą na peron i idą do wyjścia;
			   – czekający podchodzą do najbliższych drzwi i stają w kolejce po obu stronach (nie w przejściu), po
			     wysiadających wchodzą pojedynczo: do krawędzi peronu, stopniem w górę do przedsionka;
			   – zamknięcie drzwi: kto jest w drzwiach, kończy ruch, kolejka zostaje na peronie. */
			const STEP = 0.56, t = sim.time, E = d.edgeX, sg = d.sgn;
			const boarding = sim.service === d.index && sim.doorsOpen;
			if (boarding && !d.boarding) {
				d.doors = (this.trainDoors || []).map((v) => {
					if (d.bend === undefined) return d.g.worldToLocal(v.clone());
					const q = this.toTrack(v.x, v.z, d.bend);
					return new T.Vector3(q.d, v.y, d.bend - q.s);
				}).filter((v) => Math.abs(v.z) < d.len / 2 + 6);
				d.doorQ = d.doors.map((dr) => ({ z: dr.z, free: t + 1.4, aEnd: t + 1.4, n: 0 }));
				const nA = d.doors.length && d.index > 0 ? 2 + Math.floor(hash(st.pos + sim.time) * 6) : 0;
				A.list.forEach((p, k) => {
					if (k < nA) {
						const Dq = d.doorQ[k % d.doorQ.length];
						p.door = Dq;
						p.x = E - sg * 0.9;
						p.z = Dq.z + (hash(p.seed) - 0.5) * 0.3;
						p.y = STEP;
						p.t0 = Dq.aEnd;
						Dq.aEnd += 1.3 + hash(p.seed + 1) * 0.5;
						p.tx = d.exit.x;
						p.tz = d.exit.z + (hash(p.seed) - 0.5) * 4;
						p.next = null;
						p.state = 'inside';
					} else p.state = 'off';
				});
				for (const Dq of d.doorQ) Dq.free = Dq.aEnd + 0.3; // wsiadający po wysiadających
				dirty = true;
			}
			d.boarding = boarding;
			if (boarding && d.doorQ && d.doorQ.length) {
				for (const p of W.list) {
					if (p.state !== 'wait') continue;
					let best = d.doorQ[0], bd = Infinity;
					for (const Dq of d.doorQ) {
						const dd = Math.abs(Dq.z - p.z);
						if (dd < bd) { bd = dd; best = Dq; }
					}
					if (bd > 25) continue; // za daleko od drzwi pociągu – zostaje (pociąg krótszy od peronu)
					// miejsce w kolejce: na przemian po obu stronach drzwi, kolejni dalej od nich
					const q = best.n++, side = q % 2 ? 1 : -1, row = Math.floor(q / 2);
					p.door = best;
					p.tx = E + sg * (PAX + 0.05 + 0.3 * row); // kolejka za pasem – do krawędzi dopiero przy wsiadaniu
					p.tz = best.z + side * (0.75 + 0.35 * row) + (hash(p.seed) - 0.5) * 0.15;
					p.next = 'queue';
					p.state = 'walk';
				}
			} else {
				for (const p of W.list) if ((p.state === 'walk' && p.next === 'queue') || p.state === 'queue' || p.state === 'board') { p.state = 'wait'; p.next = null; }
				for (const p of A.list) if (p.state === 'inside') p.state = 'off';
				if (d.doorQ) for (const Dq of d.doorQ) Dq.n = 0;
			}
			const sm = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
			// osoby na peronie (do omijania): stojący, siedzący, idący – bez tych w wagonie i na stopniu
			const others = [];
			for (const P of [W, A, I, S, Sp]) for (const p of P.list) if (p.state !== 'off' && p.state !== 'inside' && p.state !== 'step' && p.state !== 'out') others.push(p);
			for (const P of [W, A]) {
				for (const p of P.list) {
					const st0 = p.state;
					if (st0 === 'off' || st0 === 'wait') continue;
					dirty = true;
					if (st0 === 'walk' || st0 === 'board') {
						const step = p.spd * dts * (st0 === 'board' ? 0.8 : 1);
						// idący po peronie omijają przeszkody za pasem ostrzegawczym; na pas – tylko wsiadający
						if (this.stepWalker(p, p.tx, p.tz, step, dts, d.grid, others, st0 === 'board' || p.next === 'exit' ? null : { E, sg, min: PAX })) {
							if (st0 === 'board') { p.state = 'step'; p.st = 0; }
							else if (p.next === 'exit') { p.next = null; p.tx = p.ex; p.tz = p.ez; }
							else p.state = p.next === 'queue' ? 'queue' : 'off';
						}
					} else if (st0 === 'queue') {
						const Dq = p.door;
						if (boarding && Dq && t >= Dq.free) {
							Dq.free = t + 1.5;
							p.tx = E + sg * 0.12;
							p.tz = Dq.z;
							p.state = 'board';
						}
					} else if (st0 === 'step') {
						// wejście: z krawędzi peronu stopniem w górę do przedsionka i w głąb wagonu
						p.st += dts / 0.9;
						p.x = E + sg * 0.12 - sg * 0.95 * p.st;
						p.y = STEP * sm(0.12, 0.6, p.st);
						if (p.st >= 1) { p.state = 'off'; p.y = 0; }
					} else if (st0 === 'inside') {
						if (t >= p.t0) { p.state = 'out'; p.st = 0; }
					} else if (st0 === 'out') {
						// wyjście: z przedsionka na stopień i w dół na peron
						p.st += dts / 1.0;
						p.x = E - sg * 0.9 + sg * 1.45 * p.st;
						p.y = STEP * (1 - sm(0.4, 0.8, p.st));
						// po zejściu: najpierw za pas ostrzegawczy (prostopadle do krawędzi), potem do wyjścia
						if (p.st >= 1) { p.y = 0; p.state = 'walk'; p.next = 'exit'; p.ex = p.tx; p.ez = p.tz; p.tx = E + sg * (PAX + 0.2); p.tz = p.z; }
					}
				}
			}
			// spacerujący: idą do celu wzdłuż peronu, czasem przystają i rozglądają się, potem wybierają nowy cel
			for (const p of Sp.list) {
				if (p.state === 'off') continue;
				dirty = true;
				if (p.state === 'pause') {
					p.wait -= dts;
					if (p.wait <= 0) { p.state = 'stroll'; p.tz = (Math.random() - 0.5) * 2 * p.zr; }
					continue;
				}
				// tor spaceru – p.tx (w poprzek peronu); przeszkody i ludzi omija, potem wraca na swój tor
				const step = p.spd * dts;
				if (Math.abs(p.tz - p.z) <= 0.25 || this.stepWalker(p, p.tx, p.tz, step, dts, d.grid, others, { E, sg, min: PAX })) {
					if (Math.random() < 0.5) { p.state = 'pause'; p.wait = 3 + Math.random() * 8; }
					else p.tz = (Math.random() - 0.5) * 2 * p.zr;
				}
			}
			if (!dirty) return;
			for (const P of [W, A, I, S, Sp]) {
				P.list.forEach((p, k) => {
					const on = p.state !== 'off' && p.state !== 'inside';
					const bob = p.y || 0; // podskok i ruch kończyn – w shaderze (personMat); p.y – stopień wagonu
					const moving = p.state === 'walk' || p.state === 'stroll' || p.state === 'board' || p.state === 'step' || p.state === 'out';
					if (P.setAnim) P.setAnim(k, hash(p.seed + 0.33) * 6.28, moving ? 1 : p.state === 'sit' ? -1 : 0, p.spd * 0.62);
					const s = on ? 0.95 + hash(p.seed) * 0.12 : 0;
					// idący patrzą w stronę celu, czekający – na tor
					const yaw = p.state === 'sit' ? p.yaw : p.state === 'stroll' ? (p.tz > p.z ? Math.PI : 0) : p.state === 'pause' ? (p.x > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(p.seed) * 0.8
						: p.state === 'walk' || p.state === 'board' ? Math.atan2(-(p.tx - p.x), -(p.tz - p.z))
						: p.state === 'step' ? sg * Math.PI / 2 : p.state === 'out' ? -sg * Math.PI / 2
						: p.state === 'queue' && p.door ? Math.atan2(-(E - p.x), -(p.door.z - p.z)) : p.x > 0 ? Math.PI / 2 : -Math.PI / 2;
					if (d.bend !== undefined) {
						// stacja wygięta po łuku: położenie na łuku i obrót wg kierunku toru w tym miejscu
						R.sidePoint(this.route, d.bend - p.z, p.x, tp);
						Q1.setFromAxisAngle(V3B.set(0, 1, 0), yaw - tp.heading);
						M4.compose(V3.set(tp.x, tp.y + 0.77 + bob, tp.z), Q1, S3.set(s, s, s));
					} else {
						Q1.setFromAxisAngle(V3B.set(0, 1, 0), yaw);
						M4.compose(V3.set(p.x, 0.77 + bob, p.z), Q1, S3.set(s, s, s));
					}
					P.bodies.setMatrixAt(k, M4);
					P.heads.setMatrixAt(k, M4);
				});
				P.bodies.instanceMatrix.needsUpdate = P.heads.instanceMatrix.needsUpdate = true;
				if (P.bodies.instanceColor) P.bodies.instanceColor.needsUpdate = true;
				if (P.heads.instanceColor) P.heads.instanceColor.needsUpdate = true;
			}
		}

		// stado na pastwisku: zwierzęta skubią trawę i powoli przechodzą w inne miejsce
		updateHerd(d, dt) {
			const b = d.bounds, P = d.parts;
			const up = V3B.set(0, 1, 0);
			d.list.forEach((a, k) => {
				a.t -= dt;
				if (a.t <= 0) {
					a.walk = Math.random() < 0.35;
					a.graze = !a.walk && Math.random() < 0.7;
					a.h += (Math.random() - 0.5) * 2.2;
					a.t = 3 + Math.random() * 7;
				}
				if (a.walk) {
					a.s += Math.cos(a.h) * 0.6 * dt;
					a.d += Math.sin(a.h) * 0.6 * dt;
					if (a.s < b.sA + 3 || a.s > b.sB - 3) { a.h = Math.PI - a.h; a.s = Math.max(b.sA + 3, Math.min(b.sB - 3, a.s)); }
					if (a.d < b.dA + 3 || a.d > b.dB - 3) { a.h = -a.h; a.d = Math.max(b.dA + 3, Math.min(b.dB - 3, a.d)); }
				}
				R.sidePoint(this.route, a.s, a.d, tp);
				Q1.setFromAxisAngle(up, -(tp.heading + a.h));
				M4B.compose(V3.set(tp.x, this.terrainY(a.s, a.d), tp.z), Q1, S3.set(1, 1, 1));
				const part = (m, i, x, y, z, sx, sy, sz) => {
					M4.compose(V3.set(x, y, z), Q0, S3.set(sx, sy, sz));
					M4.premultiply(M4B);
					m.setMatrixAt(i, M4);
				};
				const [bx, by, bz, bw, bh, bl] = P.body;
				part(d.body, k, bx, by, bz, bw, bh, bl);
				const [hx, hy, hz, hw, hh, hl] = P.head;
				part(d.head, k, hx, hy - (a.graze ? P.headDown : 0), hz, hw, hh, hl);
				const [lx, ly, lz, lw, lh, ll] = P.leg;
				const sw = a.walk ? Math.sin(this.time * 6 + k) * 0.15 : 0;
				part(d.legs, k * 4, -lx, ly, -lz + sw, lw, lh, ll);
				part(d.legs, k * 4 + 1, lx, ly, -lz - sw, lw, lh, ll);
				part(d.legs, k * 4 + 2, -lx, ly, lz - sw, lw, lh, ll);
				part(d.legs, k * 4 + 3, lx, ly, lz + sw, lw, lh, ll);
			});
			for (const m of [d.body, d.head, d.legs]) {
				m.instanceMatrix.needsUpdate = true;
				if (m.instanceColor) m.instanceColor.needsUpdate = true;
			}
		}

		updateStreet(d, dt) {
			if (d.type === 'traffic') {
				/* auta jednym pasem w danym kierunku: odstęp od auta przed sobą (wcześniej szybsze przejeżdżało przez
				   wolniejsze), odległość wzdłuż ulicy z zawinięciem jej końców */
				const span = d.sB - d.sA;
				for (const c of d.cars) {
					if (c.v === undefined) c.v = c.speed;
					let vmax = c.speed;
					for (const o of d.cars) {
						if (o === c || o.dir !== c.dir) continue;
						const gap = ((((o.s - c.s) * c.dir) % span) + span) % span;
						if (gap < 30) vmax = Math.min(vmax, o.v !== undefined ? o.v + Math.max(0, gap - 7) * 0.8 : c.speed, Math.sqrt(2 * 4 * Math.max(0, gap - 6.5)));
					}
					c.v = vmax > c.v ? Math.min(vmax, c.v + 2.5 * dt) : Math.max(vmax, c.v - 8 * dt);
				}
				for (const c of d.cars) {
					c.s += c.dir * c.v * dt;
					if (c.s > d.sB) c.s = d.sA;
					if (c.s < d.sA) c.s = d.sB;
					R.sidePoint(this.route, c.s, c.d, tp);
					c.obj.position.set(tp.x, this.terrainY(c.s, c.d) + 0.1, tp.z);
					c.obj.rotation.y = -tp.heading + (c.dir > 0 ? 0 : Math.PI);
				}
				return;
			}
			// przechodnie
			const up = V3B.set(0, 1, 0);
			d.list.forEach((p, k) => {
				p.s += p.dir * p.spd * dt;
				if (p.s > d.sB || p.s < d.sA) { p.dir = -p.dir; p.s = Math.max(d.sA, Math.min(d.sB, p.s)); }
				/* mijanie na chodniku: gdy ktoś idzie z naprzeciwka albo wolniej przed nami (do 2 m), zejście w bok
				   (w prawo od kierunku marszu), potem powrót na środek chodnika */
				let want = 0;
				for (const o of d.list) {
					if (o === p || Math.abs(o.d - p.d) > 1) continue;
					const ahead = (o.s - p.s) * p.dir;
					if (ahead > 0 && ahead < 2 && (o.dir !== p.dir || o.spd < p.spd)) { want = 0.45; break; }
				}
				p.off = (p.off || 0) + (want - (p.off || 0)) * Math.min(1, dt * 3);
				const pd = p.d - p.dir * p.off;
				R.sidePoint(this.route, p.s, pd, tp);
				const y = this.terrainY(p.s, pd) + 0.1;
				const bob = 0; // podskok i ruch kończyn – w shaderze (personMat)
				Q1.setFromAxisAngle(up, -tp.heading + (p.dir > 0 ? 0 : Math.PI));
				M4.compose(V3.set(tp.x, y - 0.1 + bob, tp.z), Q1, S3.set(1, 1, 1));
				d.bodies.setMatrixAt(k, M4);
				d.heads.setMatrixAt(k, M4);
			});
			d.bodies.instanceMatrix.needsUpdate = d.heads.instanceMatrix.needsUpdate = true;
			if (d.bodies.instanceColor) d.bodies.instanceColor.needsUpdate = true;
			if (d.heads.instanceColor) d.heads.instanceColor.needsUpdate = true;
		}

		updateDyn(d, sim, dt, dark, blink) {
			const front = sim.st.pos;
			if (d.type === 'signal') {
				/* sygnał wg Ie-1 (sim.js SIGNALS): górna lampa (zielona / pomarańczowa, ciągła albo migająca ok. 1 raz na
				   sekundę) albo czerwona, dolna pomarańczowa i pas – przy ograniczeniu prędkości przy semaforze */
				const sig = sim.signals[d.index], S = sig && TrainSimSignals()[sig.code];
				if (!S) return; // semafor spoza trasy jazdy (świat z innej stacji początkowej)
				const phase = Math.floor(this.time / 0.5) % 2 === 0;
				const flashOn = !S.flash || phase, whiteOn = !!S.white && phase; // sygnał zastępczy – białe migające
				const key = sig.code + (flashOn ? '' : '-') + (whiteOn ? 'w' : '');
				if (key !== d.key) {
					d.key = key;
					const top = S.top === 'red' ? 2 : S.top === 'yellow' ? 1 : 0;
					const lit = new Set();
					if (flashOn) lit.add(top);
					if (S.low) lit.add(3);
					if (whiteOn) lit.add(4);
					// kolory ponad 1.0 świecą w bloomie
					d.lamps.forEach((l, k) => {
						const name = ['green', 'yellow', 'red', 'yellow2', 'white'][k];
						l.material.color.setHex(lit.has(k) ? ASPECT_COLOR[name] : l.userData.dark);
						if (lit.has(k)) l.material.color.multiplyScalar(4);
					});
					d.glow.visible = flashOn;
					d.glow.material.color.setHex(ASPECT_COLOR[S.top]).multiplyScalar(1.6);
					d.glow.position.y = d.lamps[top].position.y;
					d.glow2.visible = S.low;
					d.glow2.material.color.setHex(ASPECT_COLOR.yellow2).multiplyScalar(1.6);
					d.pas.material.color.setHex(S.pas ? ASPECT_COLOR[S.pas] : 0x2a2a2a);
					if (S.pas) d.pas.material.color.multiplyScalar(3);
				}
				d.glow.material.opacity = d.glow2.material.opacity = 0.55 + dark * 0.45;
			} else if (d.type === 'oppSignal') {
				// semafor pociągów z przeciwka: zielone (wolna droga na odcinek jednotorowy) albo czerwone
				const go = sim.traffic && sim.traffic.oppSignal ? sim.traffic.oppSignal(d.index) === 'go' : false;
				const key = go ? 'go' : 'stop';
				if (key !== d.key) {
					d.key = key;
					const on = go ? 0 : 2;
					d.lamps.forEach((l, k) => {
						const name = ['green', 'yellow', 'red', 'yellow2', 'white'][k];
						l.material.color.setHex(k === on ? ASPECT_COLOR[name] : l.userData.dark);
						if (k === on) l.material.color.multiplyScalar(4);
					});
					d.glow.visible = true;
					d.glow.material.color.setHex(ASPECT_COLOR[go ? 'green' : 'red']).multiplyScalar(1.6);
					d.glow.position.y = d.lamps[on].position.y;
					d.glow2.visible = false;
				}
				d.glow.material.opacity = 0.55 + dark * 0.45;
			} else if (d.type === 'warnDisc') {
				// tarcza ostrzegawcza: sygnał wg semafora wjazdowego (Os1 – stój, Os2 – wolna, Os3 – 100, Os4 – 40/60 km/h)
				const sig = sim.signals[d.index], S = sig && TrainSimSignals()[sig.code];
				if (!S) return; // semafor spoza trasy jazdy (świat z innej stacji początkowej)
				const stop = !S || S.top === 'red', own = S && S.own;
				const k = stop || (own && own < 100) ? 1 : 0, flash = !stop && !!own;
				const on = !flash || Math.floor(this.time / 0.5) % 2 === 0;
				const key = k + (on ? '' : '-');
				if (key !== d.key) {
					d.key = key;
					d.lamps.forEach((l, j) => {
						const lit = j === k && on;
						l.material.color.setHex(lit ? ASPECT_COLOR[j ? 'yellow' : 'green'] : l.userData.dark);
						if (lit) l.material.color.multiplyScalar(4);
					});
					d.glow.visible = on;
					d.glow.material.color.setHex(ASPECT_COLOR[k ? 'yellow' : 'green']).multiplyScalar(1.6);
					d.glow.position.y = d.lamps[k].position.y;
				}
				d.glow.material.opacity = 0.55 + dark * 0.45;
			} else if (d.type === 'station') {
				for (const g of d.glows) {
					g.material.opacity = dark > 0.15 ? Math.min(1, dark * 1.3) : 0;
					g.material.color.setRGB(1.5, 1.15, 0.7);
				}
				this.updatePassengers(d, sim);
			} else if (d.type === 'clock') {
				const t = (sim.clock() % 43200) / 3600;
				for (const h of d.hands) {
					// wskazówki obracają się zgodnie z ruchem wskazówek zegara patrząc na tarczę
					h.hour.rotation.z = -(t / 12) * Math.PI * 2;
					h.minute.rotation.z = -(t % 1) * Math.PI * 2;
				}
			} else if (d.type === 'board') {
				// tablica odjazdów: co 5 s, gdy pociąg jest w pobliżu stacji
				const sp = sim.route.stations[d.index];
				if (this.time >= d.next && sp && Math.abs(front - sp.pos) < 1500) { d.next = this.time + 5; this.drawBoard(d, sim); }
			} else if (d.type === 'herd') {
				this.updateHerd(d, dt);
			} else if (d.type === 'crowd') {
				if (this.updateCrowd) this.updateCrowd(d, dt);
			} else if (d.type === 'traffic' || d.type === 'walkers') {
				this.updateStreet(d, dt);
			} else if (d.type === 'tlights') {
				this.updateTLights(d);
			} else if (d.type === 'crossing') {
				const cr = d.cr;
				// sygnalizacja: pociąg gracza albo inny pociąg – z przeciwka (malejący kilometraż) albo pociąg tła w kierunku
				// gracza (ruch na linii: otherTrains – wszystkie pociągi tła, także nierysowane)
				const ot = this.otherTrain;
				// pociąg tła stojący przed przejazdem (np. czeka na krzyżowanie) nie zamyka rogatek – tylko w ruchu albo na przejeździe
				const on = (t) => (t.dir > 0 ? t.s > cr.pos - 5 && t.s - t.len < cr.pos + 5 : t.s < cr.pos + 5 && t.s + t.len > cr.pos - 5);
				const near = (t) => (t.dir > 0 ? t.s > cr.pos - 800 && t.s - t.len < cr.pos + 5 : t.s < cr.pos + 800 && t.s + t.len > cr.pos - 5) && (t.v === undefined || t.v > 0.5 || on(t));
				const active = (front > cr.pos - 800 && front - sim.L < cr.pos + 5) || (this.otherTrains ? this.otherTrains.some(near) : !!ot && near({ dir: -1, s: ot.s, len: ot.len }));
				/* włączenie sygnalizacji: auto, które nie zdąży zatrzymać się przed linią (potrzebne opóźnienie ponad
				   6 m/s²), przejeżdża (go) – reszta staje; wcześniej takie auto hamowało za linią i wpełzało na tory */
				const rising = active && !d.was;
				d.was = active;
				d.lights.forEach((l, k) => {
					const on = active && (k % 2) === blink;
					l.material.color.setHex(on ? 0xff3020 : 0x3a1a1a);
					if (on) l.material.color.multiplyScalar(4);
					d.glows[k].material.opacity = on ? 0.9 : 0;
				});
				// półrogatki: opadają po 4 s świecenia (ok. 6 s), podnoszą się po przejeździe pociągu (ok. 5 s)
				d.actT = active ? d.actT + dt : 0;
				d.armT = Math.max(0, Math.min(1, d.armT + (d.actT > 4 ? dt / 6 : -dt / 5)));
				const e = d.armT * d.armT * (3 - 2 * d.armT);
				for (const a of d.arms || []) a.rotation.z = a.userData.sgn * Math.PI * 0.48 * (1 - e);
				// trasa rzeczywista: auta po ulicy z mapy (w – droga przebyta w kierunku jazdy), prawym pasem
				// ruch uliczny (street-life.js) jeździ też przez ten przejazd – własne auta przejazdu ukryte
				if (d.path && this.slife && this.env.snet && this.env.snet.xcr.has(cr)) {
					for (const car of d.cars) car.obj.visible = false;
					return;
				}
				if (d.path) {
					const P = d.path;
					for (const car of d.cars) {
						if (car.v === undefined) car.v = car.speed;
						if (rising && car.w < car.entryW && (car.w > car.stopW || car.stopW - car.w < (car.v * car.v) / 12)) car.go = true;
						if (car.go && (car.w > car.exitW || !active)) car.go = false;
						let vmax = car.speed;
						if (active && !car.go && car.w < car.entryW) vmax = car.w <= car.stopW ? Math.sqrt(2 * 4 * Math.max(0, car.stopW - car.w)) : 0;
						for (const o of d.cars) {
							if (o === car || o.dir !== car.dir) continue;
							const gap = o.w - car.w;
							if (gap > 0 && gap < 40) vmax = Math.min(vmax, Math.sqrt(2 * 4 * Math.max(0, gap - 6.5)));
						}
						car.v = vmax > car.v ? Math.min(vmax, car.v + 2.5 * dt) : Math.max(vmax, car.v - 8 * dt);
						car.w += car.v * dt;
						/* powrót na początek ulicy: przy włączonej sygnalizacji z prędkością, z której zdąży stanąć przed linią
						   (krótka ulica – wcześniej auto wracało z pełną prędkością kilka metrów przed linią i wjeżdżało na
						   tory); nie na auto stojące w kolejce przy początku ulicy – wtedy czeka ukryte */
						if (car.w > P.L) {
							const free = d.cars.every((o) => o === car || o.dir !== car.dir || o.w > 9);
							if (free) {
								car.w = 0;
								car.v = active ? Math.min(car.speed, Math.sqrt(2 * 4 * Math.max(0, car.stopW))) : car.speed;
								car.go = false;
							} else { car.w = P.L + 1; car.v = 0; }
						}
						car.obj.visible = car.w <= P.L;
						const u = car.dir > 0 ? car.w : P.L - car.w, u2 = Math.min(P.L, Math.max(0, u + car.dir * 1));
						const [s, dd] = P.at(u), [sb, db] = P.at(u2);
						const L = Math.hypot(sb - s, db - dd) || 1, ns = -(db - dd) / L, nd = (sb - s) / L;
						// prawy pas: normalna w prawo od kierunku jazdy (w układzie s, d: (−Δd, Δs) to w lewo)
						const ps = s - ns * 1.6, pd = dd - nd * 1.6;
						R.sidePoint(this.route, ps, pd, tp);
						const x0 = tp.x, z0 = tp.z;
						car.obj.position.set(x0, this.roadY(ps, pd), z0);
						R.sidePoint(this.route, sb - ns * 1.6, db - nd * 1.6, tp);
						car.obj.rotation.y = Math.atan2(-(tp.x - x0), -(tp.z - z0));
					}
					return;
				}
				// u – położenie auta wzdłuż jego kierunku jazdy; linia zatrzymania i początek torowiska
				for (const car of d.cars) {
					if (car.v === undefined) car.v = car.speed;
					const u = car.dir * car.p;
					const stopU = car.dir * car.stop;
					const entryU = stopU + 3.5; // przód auta wjeżdża na tory
					if (rising && u < entryU && (u > stopU || stopU - u < (car.v * car.v) / 12)) car.go = true;
					if (car.go && (u > car.dir * car.exit || !active)) car.go = false;
					let vmax = car.speed;
					if (active && !car.go && u < entryU) {
						// przed linią – hamowanie do linii; za linią, ale przed torami – zatrzymanie od razu
						vmax = u <= stopU ? Math.sqrt(2 * 4 * Math.max(0, stopU - u)) : 0;
					}
					// kolejka: nie najeżdżaj na auto przed sobą
					for (const o of d.cars) {
						if (o === car || o.dir !== car.dir) continue;
						const gap = car.dir * o.p - u;
						if (gap > 0 && gap < 40) vmax = Math.min(vmax, Math.sqrt(2 * 4 * Math.max(0, gap - 6.5)));
					}
					car.v = vmax > car.v ? Math.min(vmax, car.v + 2.5 * dt) : Math.max(vmax, car.v - 8 * dt);
					let nu = u + car.v * dt;
					if (nu > 150) { nu = -150; car.v = car.speed; }
					car.p = car.dir * nu;
					const off = car.dir > 0 ? -1.6 : 1.6;
					R.sidePoint(this.route, cr.pos + off, car.p, tp);
					car.obj.position.set(tp.x, this.roadY(cr.pos + off, car.p), tp.z);
					car.obj.rotation.y = -tp.heading - (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
				}
			} else if (d.type === 'tunnel') {
				const t = d.t;
				const near = front > t.from - 40 && front - sim.L < t.to + 40;
				const target = near ? 0.3 : 1;
				d.mat.opacity += (target - d.mat.opacity) * Math.min(1, dt * 3);
				d.mat.depthWrite = d.mat.opacity > 0.98;
			}
		}
	}

	// tabela sygnałów z symulacji (sim.js ładowany przed światem w przeglądarce)
	const TrainSimSignals = () => window.TrainSim.SIGNALS;

	// przełączniki diagnostyczne (porównanie wydajności; localStorage „maszynista.perfOpt”, np. {"merge":false} – od uruchomienia)
	World.opt = { merge: true, lod: true, cabMerge: true };
	try { Object.assign(World.opt, JSON.parse(localStorage.getItem('maszynista.perfOpt') || '{}')); } catch (e) { /* brak dostępu do localStorage */ }
	// ?nobundle w adresie – świat bez paczek WebGPU (BundleGroup), do porównań przy błędach obrazu
	if (typeof location !== 'undefined' && /[?&]nobundle/.test(location.search)) World.opt.bundle = false;
	NS.World = World;
	World.TERRAIN_D = TERRAIN_D;
	World.SHADOW_LAYER = 3; // bryły zastępcze cieni (shadowMerge) – tylko kamery map cieni
	/* obiekty bez odbicia w wodzie (WebGPU – odbicie to cała scena z drugiej kamery, ok. 8 ms co drugą klatkę): poza paczkami
	   kawałków (lampy, semafory, auta, pasażerowie) i pociągi tła; kamera gracza i map cieni widzą tę warstwę, kamera odbicia
	   nie (water.js). reflLayer – świat gry (scene.js; świat audytu bez tego) */
	World.NOREFL_LAYER = 4;
	World.RAIL_U = { uRailPxK: { value: 0 } }; // szyny min. 1 piksel (railPxMat)
	World.PEOPLE = PEOPLE; // kolory ubrań i skóry ludzi (tłum na peronach z mapy – real-env.js)
	World.SKIN = SKIN; // kolumny siatki terenu (odsunięcia od osi), wiersze co 4 m
})();
