/* Materiały węzłowe (TSL) dla WebGPURenderer – odpowiedniki łatek GLSL z common.js (patch): te same warianty
   ('lit', 'wind', 'grass', 'ground', 'gravel', 'road', 'concrete', 'platform', 'roof', 'dirt', 'train', 'clean',
   'indoor'), te same wzory i kolejność obliczeń co w GLSL:
   kolor bazowy (z kolorem wierzchołków i instancji) → wzór nawierzchni i wysokość mikrorzeźby gH → normalna zgięta
   przez gH → pogoda (mokro, strużki, krople, śnieg) → kałuże → chropowatość, metaliczność, światło latarni (emisja).
   Wszystko liczone w setupDiffuseColor (pierwszy etap shadera fragmentów) do zmiennych materiału (property), z których
   biorą roughnessNode, metalnessNode, normalNode, emissiveNode; tabor – okluzja z wierzchołków w modelu oświetlenia.
   Cienie chmur i wybór kaskady cieni – w węzłach świateł (setupCascades), więc obejmują wszystkie materiały.
   Używane tylko w trybie WebGPU (NS.gpu – ?webgpu w adresie); w trybie WebGL działają łatki GLSL. */
import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshPhysicalNodeMaterial, MeshLambertNodeMaterial, MeshBasicNodeMaterial, PMREMGenerator } from 'three/webgpu';
import {
	Fn, If, Loop, Discard, float, vec2, vec3, vec4, uniform, reference, uniformArray, property, attribute, instancedBufferAttribute,
	texture, varying, vertexColor, modelWorldMatrix, atan, asin, exp, int, instanceIndex, materialColor, normalLocal, reflector, select, mix, smoothstep, step, fract, floor, dFdx, dFdy, fwidth, length, normalize, dot, cross, reflect, pow, abs, max, min,
	clamp, sin, cos, sign, positionWorld, positionLocal, positionGeometry, positionView, normalGeometry, normalViewGeometry,
	faceDirection, cameraPosition, cameraViewMatrix, diffuseColor, materialRoughness, materialMetalness, materialEmissive,
	materialClearcoat, shadow, OnObjectUpdate, renderGroup,
} from 'three/tsl';

(function () {
	'use strict';
	const NS = (window.Train3D = window.Train3D || {});

	/* ---- wspólne uniformy: wartości z tych samych obiektów { value } co w GLSL (common.js U, sky.js chmury), przepisywane
	   raz na klatkę (sync – scene.js przed rysowaniem) do uniformów grupy renderGroup – jeden bufor dla wszystkich obiektów.
	   (reference() aktualizuje się osobno dla każdego obiektu – przy ok. 800 obiektach × kilkanaście uniformów kilkadziesiąt
	   ms procesora na klatkę) ---- */
	const U = NS.util.U;
	const syncs = [];
	const shared = (src, init) => {
		const u = uniform(init).setGroup(renderGroup);
		syncs.push(init !== null && typeof init === 'object' ? () => u.value.copy(src.value) : () => { u.value = src.value; });
		return u;
	};
	const uTime = shared(U.uTime, 0), uWind = shared(U.uWind, 0), uWet = shared(U.uWet, 0), uSnow = shared(U.uSnow, 0);
	const uRain = shared(U.uRain, 0), uWear = shared(U.uWear, 1), uNightK = shared(U.uNightK, 0), uNightBox = shared(U.uNightBox, new THREE.Vector3());
	/* Mapa nocna: jedna stała tekstura od początku (World.updateNightMap rysuje na jej płótnie – bez podmiany tekstury
	   w zbudowanych shaderach) i próbki bez aktualizacji dla każdego obiektu: węzeł tekstury na zapleczu WebGPU dostaje
	   uniform odwrócenia osi Y aktualizowany przy każdym obiekcie (9 próbek w materiale – kilka ms procesora na klatkę);
	   tekstura bez flipY, więc odwracać nie trzeba. */
	if (NS.gpu) {
		const cv = document.createElement('canvas');
		cv.width = 1024;
		cv.height = 512;
		const tex = new THREE.CanvasTexture(cv);
		tex.flipY = false;
		tex.generateMipmaps = false;
		tex.minFilter = THREE.LinearFilter;
		tex.colorSpace = THREE.NoColorSpace;
		U.uNightTex.value = tex;
	}
	const nightSample = (uv) => {
		const node = texture(U.uNightTex.value, uv);
		Object.defineProperty(node, 'updateType', { get: () => 'none', set() {} });
		return node;
	};
	const uPortalA = uniformArray(U.uPortalA.value, 'vec4').setGroup(renderGroup), uPortalB = uniformArray(U.uPortalB.value, 'vec4').setGroup(renderGroup);
	const SC = NS.cloudUniforms();
	const cloudAmount = shared(SC.cloudAmount, 0), cloudOffset = shared(SC.cloudOffset, new THREE.Vector2()), cloudThr = shared(SC.cloudThr, 0.55);
	// przed każdą klatką (scene.js draw, preview.js)
	function sync() {
		for (const f of syncs) f();
	}

	// obrót wektora 2D macierzą mat2(a, b, c, d) jak w GLSL (kolumnami): M · v
	const rot = (v, a, b, c, d) => vec2(v.x.mul(a).add(v.y.mul(c)), v.x.mul(b).add(v.y.mul(d)));
	// 1 − smoothstep (bez odwróconych krawędzi – w HLSL/WGSL nieokreślone)
	const nsm = (a, b, x) => smoothstep(a, b, x).oneMinus();
	// reszta z dzielenia zawsze dodatnia (jak mod w GLSL; % w WGSL zachowuje znak dzielnej)
	const pmod = (x, y) => x.sub(floor(x.div(y)).mul(y));

	// ---- szumy (common.js NOISE_GLSL) – funkcje shadera (setLayout: jedna definicja, nie rozwijane w miejscu) ----
	const gHash = Fn(([p]) => {
		const q = pmod(p, 2048);
		const p3 = fract(vec3(q.x, q.y, q.x).mul(0.1031)).toVar();
		p3.addAssign(dot(p3, p3.yzx.add(33.33)));
		return fract(p3.x.add(p3.y).mul(p3.z));
	}).setLayout({ name: 'gHash', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	const gNoise = Fn(([p]) => {
		const i = floor(p).toVar(), f0 = fract(p);
		const f = f0.mul(f0).mul(f0.mul(-2).add(3)).toVar();
		return mix(mix(gHash(i), gHash(i.add(vec2(1, 0))), f.x), mix(gHash(i.add(vec2(0, 1))), gHash(i.add(vec2(1, 1))), f.x), f.y);
	}).setLayout({ name: 'gNoise', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	const gGrad = Fn(([i]) => {
		const a = gHash(i).mul(6.2831853);
		return vec2(cos(a), sin(a));
	}).setLayout({ name: 'gGrad', type: 'vec2', inputs: [{ name: 'i', type: 'vec2' }] });
	const gPerlin = Fn(([p]) => {
		const i = floor(p).toVar(), f = fract(p).toVar();
		const u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10)).toVar();
		const a = dot(gGrad(i), f), b = dot(gGrad(i.add(vec2(1, 0))), f.sub(vec2(1, 0)));
		const c = dot(gGrad(i.add(vec2(0, 1))), f.sub(vec2(0, 1))), d = dot(gGrad(i.add(1)), f.sub(1));
		return clamp(mix(mix(a, b, u.x), mix(c, d, u.x), u.y).mul(0.75).add(0.5), 0, 1);
	}).setLayout({ name: 'gPerlin', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	const gFbm = Fn(([p]) => gNoise(p).mul(0.5).add(gNoise(p.mul(2.03).add(1.7)).mul(0.25)).add(gNoise(p.mul(4.01).add(3.1)).mul(0.125)).add(gNoise(p.mul(8.05).add(5.3)).mul(0.0625)))
		.setLayout({ name: 'gFbm', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	// kamienie: F1, F2 i numer kamienia (pętla 3 × 3 rozwinięta, wybór bez rozgałęzień)
	const gStones = Fn(([p]) => {
		const c = floor(p).toVar(), f = fract(p).toVar();
		const d1 = float(8).toVar(), d2 = float(8).toVar(), id = float(0).toVar();
		for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
			const cg = c.add(vec2(x, y)).toVar();
			const o = vec2(gHash(cg), gHash(cg.add(17.3))).mul(0.8).add(0.1);
			const d = length(vec2(x, y).add(o).sub(f)).toVar();
			const closer = d.lessThan(d1);
			d2.assign(select(closer, d1, min(d2, d)));
			id.assign(select(closer, gHash(cg.add(3.7)), id));
			d1.assign(min(d1, d));
		}
		return vec3(d1, d2, id);
	}).setLayout({ name: 'gStones', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }] });
	// kręgi od kropel deszczu w kałużach
	const gRipples = Fn(([p, t]) => {
		const s = float(0).toVar();
		for (let k = 0; k < 2; k++) {
			const q = p.mul(1.6).add(k * 0.37).toVar(), c = floor(q).toVar();
			const o = vec2(gHash(c), gHash(c.add(7.1))).mul(0.6).add(0.2);
			const ph = fract(t.mul(1.3).add(gHash(c.add(3.3)))).toVar();
			const d = length(fract(q).sub(o));
			s.addAssign(nsm(0.0, 0.05, abs(d.sub(ph.mul(0.45)))).mul(ph.oneMinus()).mul(ph.oneMinus()));
		}
		return s;
	}).setLayout({ name: 'gRipples', type: 'float', inputs: [{ name: 'p', type: 'vec2' }, { name: 't', type: 'float' }] });

	// ---- cienie chmur (sky.js SKY_CLOUD_GLSL) ----
	const cloudHash = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)))
		.setLayout({ name: 'cloudHash', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	const cloudNoise = Fn(([p]) => {
		const i = floor(p).toVar(), f0 = fract(p);
		const f = f0.mul(f0).mul(f0.mul(-2).add(3)).toVar();
		return mix(mix(cloudHash(i), cloudHash(i.add(vec2(1, 0))), f.x), mix(cloudHash(i.add(vec2(0, 1))), cloudHash(i.add(vec2(1, 1))), f.x), f.y);
	}).setLayout({ name: 'cloudNoise', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	const cloudCover = Fn(([p]) => cloudNoise(p).mul(0.55).add(cloudNoise(p.mul(2.3).add(5.2)).mul(0.3)).add(cloudNoise(p.mul(5.1).sub(1.7)).mul(0.15)))
		.setLayout({ name: 'cloudCover', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	// światło przepuszczone przez chmury w punkcie świata (1 – bez chmur … 1 − cloudAmount w cieniu)
	// (w miejscu użycia, nie jako funkcja shadera – uniformy w funkcjach z setLayout nie trafiają do WGSL)
	const cloudShadow = (w) => cloudAmount.mul(smoothstep(cloudThr, cloudThr.add(0.22), cloudCover(w.xz.div(1300).add(cloudOffset)))).oneMinus();

	/* Światła słońca (księżyca) – kaskady cieni (scene.js): każde światło liczy się tylko tam, gdzie jego mapa jest
	   pierwszą obejmującą piksel (margines 3% od brzegu); poza wszystkimi – ostatnie, bez cienia; obiekty bez cieni –
	   tylko pierwsze. Kolor świateł przyciemniony cieniem chmur w materiałach na zewnątrz (userData.cloudShade). */
	function setupCascades(lights) {
		const n = lights.length;
		// (węzły tworzone raz na światło – ShadowNode ma własną mapę cieni)
		const ins = lights.map((l) => {
			// macierz cienia liczona tu (jak przy rysowaniu mapy – LightShadow.updateMatrices), wspólny uniform na klatkę
			const mat = uniform(new THREE.Matrix4()).setGroup(renderGroup);
			syncs.push(() => {
				l.updateMatrixWorld();
				l.target.updateMatrixWorld();
				l.shadow.updateMatrices(l);
				mat.value.copy(l.shadow.matrix);
			});
			const p = mat.mul(vec4(positionWorld, 1));
			const q = p.xyz.div(p.w);
			return select(q.x.greaterThan(0.03).and(q.x.lessThan(0.97)).and(q.y.greaterThan(0.03)).and(q.y.lessThan(0.97)).and(q.z.lessThan(1)), float(1), float(0));
		});
		lights.forEach((l, i) => {
			const col = uniform(new THREE.Color()).setGroup(renderGroup);
			syncs.push(() => col.value.copy(l.color).multiplyScalar(l.intensity));
			const base = col;
			l.colorNode = Fn((builder) => {
				if (i > 0 && !builder.object.receiveShadow) return vec3(0);
				if (!builder.material.userData.cloudShade) return base;
				// cień chmur: z chmur wolumetrycznych (tekstura wokół kamery – clouds-gpu.js), bez nich – szum jak w GLSL
				const cl = NS.skyGpu && NS.skyGpu.clouds;
				return base.mul(cl ? cl.groundShadow(positionWorld) : cloudShadow(positionWorld));
			})();
			if (n < 2) return;
			let before = float(0);
			for (let k = 0; k < i; k++) before = max(before, ins[k]);
			const use = ins[i].mul(before.oneMinus());
			const fallback = i === n - 1 ? max(before, ins[i]).oneMinus() : float(0);
			l.shadow.shadowNode = use.mul(shadow(l)).add(fallback);
		});
	}

	// ---- wzory nawierzchni (common.js *_GLSL); S – zmienne materiału (gH, puddle, gSand, gRough) ----
	const attr = (name, type) => Fn((builder) => (builder.geometry.hasAttribute(name) ? attribute(name, type) : type === 'vec3' ? vec3(0) : vec2(0)))();

	function groundPattern(S) {
		const wp = positionWorld.xz.toVar();
		const near = nsm(60, 260, length(positionView)).toVar();
		const px = length(fwidth(wp)).toVar();
		const aa3 = nsm(0.08, 0.3, px.mul(2.7)), aa4 = nsm(0.03, 0.12, px.mul(6));
		const mw0 = max(attr('aMat', 'vec3'), vec3(0)).toVar();
		const mw = mw0.div(max(0.001, mw0.x.add(mw0.y).add(mw0.z))).toVar();
		const vRow = attr('aRow', 'vec2');
		const base = vec3(diffuseColor.rgb).toVar();
		const g1 = gNoise(wp.mul(0.045)).toVar(), g2 = gNoise(wp.mul(0.38)).toVar();
		const g3 = mix(0.5, gNoise(wp.mul(2.7)), aa3).toVar(), g4 = mix(0.5, gNoise(wp.mul(vec2(6.0, 8.5))), aa4).toVar();
		const gM = gFbm(wp.mul(0.011).add(2));
		const bMax = max(base.r, max(base.g, base.b));
		const greenK = smoothstep(0.15, 0.4, bMax.sub(min(base.r, min(base.g, base.b))).div(max(0.01, bMax))).mul(step(base.r, base.g)).toVar();
		const grassC = base.mul(g1.mul(0.36).add(0.7).add(g2.mul(0.16))).mul(gM.mul(0.28).add(0.86)).toVar();
		grassC.assign(mix(grassC, grassC.mul(vec3(1.28, 1.12, 0.62)), smoothstep(0.58, 0.86, gNoise(wp.mul(0.018).add(3))).mul(0.35).mul(greenK)));
		grassC.assign(mix(grassC, grassC.mul(vec3(0.78, 0.92, 0.72)), smoothstep(0.55, 0.8, g2).mul(0.4)));
		const blades = g3.mul(0.5).add(g4.mul(0.5)).toVar();
		const clump = mix(0.5, gNoise(rot(wp, 0.8, -0.6, 0.6, 0.8).mul(1.25).add(9)).mul(0.65).add(gNoise(rot(wp, 0.8, 0.6, -0.6, 0.8).mul(2.9)).mul(0.35)), nsm(0.1, 0.35, px.mul(2.9))).toVar();
		grassC.assign(mix(grassC, grassC.mul(mix(vec3(0.85), vec3(0.72, 0.86, 0.62), greenK)), smoothstep(0.5, 0.78, clump).mul(0.6)));
		grassC.assign(mix(grassC, grassC.mul(mix(vec3(1.06), vec3(1.12, 1.1, 0.86), greenK)), nsm(0.18, 0.42, clump).mul(0.35)));
		grassC.mulAssign(blades.mul(0.36).add(0.82));
		const rip = sin(dot(wp, vec2(1.6, 0.6)).add(gNoise(wp.mul(0.25)).mul(5))).mul(0.5).add(0.5).toVar();
		const sandC = base.mul(rip.mul(0.1).mul(near).add(0.92).add(g4.mul(0.08).mul(near))).mul(g1.mul(0.1).add(0.95));
		const rowsX = sin(wp.x.mul(2.3)).mul(0.5).add(0.5), rowsZ = sin(wp.y.mul(2.3)).mul(0.5).add(0.5);
		const rows = mix(1, rowsX.mul(0.22).add(0.78), clamp(vRow.x, 0, 1)).mul(mix(1, rowsZ.mul(0.22).add(0.78), clamp(vRow.y, 0, 1))).toVar();
		const soilC = base.mul(rows).mul(g2.mul(0.2).add(0.85).add(g4.mul(0.1).mul(near)));
		diffuseColor.rgb.assign(grassC.mul(mw.x).add(sandC.mul(mw.y)).add(soilC.mul(mw.z)));
		S.gH.assign(blades.mul(mw.x).mul(0.8).add(rip.mul(0.7).add(g4.mul(0.3)).mul(mw.y)).add(rows.mul(0.6).add(g3.mul(0.4)).mul(mw.z)).mul(near).mul(0.035));
		S.gSand.assign(mw.y);
		S.puddle.assign(smoothstep(0.62, 0.78, gNoise(wp.mul(0.06)).mul(0.7).add(gNoise(wp.mul(0.25)).mul(0.3)).add(uWet.mul(0.12))).mul(smoothstep(0.25, 0.6, uWet)).mul(mw.y.mul(0.8).oneMinus()));
	}

	function gravelPattern(S) {
		const wp = positionWorld.xz.toVar();
		const pxg = length(fwidth(wp)).toVar();
		const sa = gStones(wp.mul(11)).toVar(), sb = gStones(rot(wp, 0.8, -0.6, 0.6, 0.8).mul(6.5).add(17)).toVar();
		const fa = nsm(0.02, 0.07, pxg.mul(11 * 0.3)).toVar(), fb = nsm(0.02, 0.07, pxg.mul(6.5 * 0.3)).toVar();
		const ea = smoothstep(0.0, 0.22, sa.y.sub(sa.x)).toVar(), eb = smoothstep(0.0, 0.28, sb.y.sub(sb.x)).toVar();
		const stA = sa.z.mul(0.38).add(0.8).mul(mix(0.62, 1.0, ea));
		const stB = sb.z.mul(0.32).add(0.82).mul(mix(0.66, 1.0, eb));
		const stone = mix(1, stA, fa).mul(mix(1, mix(1, stB, 0.55), fb));
		const tint = mix(vec3(0.93, 0.94, 0.97), vec3(1.06, 1.0, 0.92), sb.z).toVar();
		tint.assign(mix(tint, vec3(0.98, 0.84, 0.72), step(0.9, sa.z).mul(0.55).mul(fa)));
		const farT = gNoise(wp.mul(2.3)).mul(0.6).add(gNoise(wp.mul(0.55)).mul(0.4));
		const farC = vec3(farT.mul(0.24).add(0.86));
		diffuseColor.rgb.mulAssign(mix(farC, tint.mul(stone), max(fa, 0.35)));
		diffuseColor.rgb.mulAssign(gFbm(wp.mul(0.3)).mul(0.22).add(0.88));
		diffuseColor.rgb.assign(mix(diffuseColor.rgb, diffuseColor.rgb.mul(vec3(0.8, 0.66, 0.54)), smoothstep(0.58, 0.82, gFbm(wp.mul(0.16).add(3))).mul(0.5)));
		diffuseColor.rgb.assign(mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.56), smoothstep(0.65, 0.85, gNoise(wp.mul(0.45).add(9))).mul(0.18)));
		S.gH.assign(sa.x.oneMinus().mul(ea).mul(fa).mul(0.5).add(sb.x.oneMinus().mul(eb).mul(fb).mul(0.8)).mul(0.035));
		S.gRough.assign(sa.z.sub(0.5).mul(0.03));
	}

	// wspólne dla nawierzchni (SURF_HEAD): normalna geometryczna z pochodnych, skala piksela, wygaszanie drobnych wzorów
	function surfHead() {
		const wP = positionWorld;
		const wp = wP.xz.toVar();
		const gN = normalize(cross(dFdx(wP), dFdy(wP))).toVar();
		const fl = smoothstep(0.75, 0.92, abs(gN.y)).toVar();
		const px = max(length(dFdx(wP)), length(dFdy(wP))).toVar();
		const AAK = (f) => nsm(0.22, 0.5, px.mul(f));
		const sp2 = select(abs(gN.y).greaterThan(0.6), wp, vec2(select(abs(gN.x).greaterThan(abs(gN.z)), wP.z, wP.x), wP.y)).toVar();
		const c0 = vec3(diffuseColor.rgb).toVar();
		return { wP, wp, gN, fl, px, AAK, aaF: AAK(38), aaM: AAK(10), sp2, c0 };
	}

	function roadPattern(S) {
		const { wp, fl, AAK, aaF, c0 } = surfHead();
		const lum = dot(c0, vec3(0.299, 0.587, 0.114)).toVar();
		const sat = max(c0.r, max(c0.g, c0.b)).sub(min(c0.r, min(c0.g, c0.b)));
		const mark = max(smoothstep(0.66, 0.74, lum), smoothstep(0.18, 0.3, sat).mul(step(0.12, lum))).toVar();
		const pave = smoothstep(0.1, 0.16, lum).mul(mark.oneMinus()).toVar();
		const asph = max(mark, pave).oneMinus().toVar();
		const m1 = gFbm(wp.mul(0.07)).toVar(), m2 = gNoise(wp.mul(0.6)).toVar();
		const speck = mix(0.5, gNoise(wp.mul(38)), aaF).toVar();
		const cr = gStones(wp.mul(0.32)).toVar();
		const crack = nsm(0.0, 0.035, cr.y.sub(cr.x)).mul(smoothstep(0.55, 0.75, gNoise(wp.mul(0.15).add(7)))).mul(AAK(8)).toVar();
		const patchA = smoothstep(0.6, 0.7, gFbm(rot(wp, 0.8, -0.6, 0.6, 0.8).mul(0.09).add(11))).mul(0.55);
		const mid = mix(0.5, gNoise(rot(wp, 0.8, -0.6, 0.6, 0.8).mul(5)), AAK(5));
		const asC = mix(c0, vec3(dot(c0, vec3(0.333))), 0.6).mul(1.5).mul(m1.mul(0.36).add(0.8).add(m2.mul(0.1))).mul(speck.mul(0.28).add(0.86)).mul(mid.mul(0.14).add(0.93)).toVar();
		const vLat = attr('aLat', 'vec3').toVar();
		const rut = float(0).toVar(), edgeD = float(0).toVar();
		If(vLat.z.greaterThan(0.5), () => {
			const lw = vLat.y.mul(2).div(vLat.z).toVar(), pos = vLat.x.add(vLat.y);
			const lc = pos.sub(floor(pos.div(lw)).add(0.5).mul(lw));
			rut.assign(nsm(0.06, 0.3, abs(abs(lc).sub(min(0.85, lw.mul(0.27))))).mul(gNoise(wp.mul(0.35).add(4)).mul(0.35).add(0.65)));
			edgeD.assign(nsm(0.0, 0.6, vLat.y.sub(abs(vLat.x))).mul(m1.mul(0.4).add(0.6)));
		});
		asC.mulAssign(rut.mul(0.28).oneMinus().sub(edgeD.mul(0.22)));
		asC.assign(mix(asC, asC.mul(vec3(1.02, 0.97, 0.9)), edgeD.mul(0.5)));
		asC.assign(mix(asC, asC.mul(vec3(0.78, 0.8, 0.84)), patchA));
		asC.mulAssign(crack.mul(0.45).oneMinus());
		const q0 = wp.mul(vec2(5, 10));
		const q = vec2(q0.x.add(step(1, pmod(floor(q0.y), 2)).mul(0.5)), q0.y).toVar();
		const f = fract(q).toVar(), id = floor(q);
		const joint = min(min(f.x, f.x.oneMinus()).mul(2), min(f.y, f.y.oneMinus())).toVar();
		const jm = smoothstep(0.0, max(0.12, fwidth(joint).mul(1.2)), joint).toVar();
		const tone = gHash(id).mul(0.16);
		const pvC = c0.mul(mix(1, tone.add(0.88).mul(mix(0.62, 1.0, jm)), AAK(22).mul(fl))).mul(m1.mul(0.22).add(0.88));
		const wear = smoothstep(0.5, 0.8, gNoise(wp.mul(1.4)).mul(0.6).add(gNoise(wp.mul(7)).mul(0.4).mul(AAK(7))));
		const mkC = mix(c0, vec3(0.05), wear.mul(0.45));
		diffuseColor.rgb.assign(asC.mul(asph).add(pvC.mul(pave)).add(mkC.mul(mark)));
		S.gH.assign(speck.mul(0.004).mul(asph).mul(aaF).sub(crack.mul(0.006)).add(jm.mul(pave).mul(AAK(22)).mul(fl).mul(0.008)));
		S.puddle.assign(smoothstep(0.66, 0.8, gNoise(wp.mul(0.09)).mul(0.7).add(gNoise(wp.mul(0.4)).mul(0.3)).add(uWet.mul(0.1))).mul(smoothstep(0.3, 0.7, uWet)).mul(asph.add(pave.mul(0.5))).mul(fl));
		S.puddle.assign(max(S.puddle, rut.mul(0.75).add(edgeD.mul(0.6)).mul(smoothstep(0.35, 0.8, uWet)).mul(asph).mul(fl).mul(gNoise(wp.mul(0.6)).mul(0.5).add(0.5))));
		S.gRough.assign(mark.mul(-0.08).add(m2.sub(0.5).mul(0.05)).sub(rut.mul(0.12).mul(asph)));
	}

	function concretePattern(S) {
		const { wp, fl, AAK, sp2, c0 } = surfHead();
		const m1 = gFbm(sp2.mul(0.12)), m2 = gNoise(sp2.mul(1.1)).toVar();
		const grain = mix(0.5, gNoise(sp2.mul(30)), AAK(30)).toVar();
		const cr = gStones(wp.mul(0.5)).toVar();
		const crack = nsm(0.0, 0.03, cr.y.sub(cr.x)).mul(smoothstep(0.6, 0.8, gNoise(wp.mul(0.3).add(3)))).mul(AAK(14)).mul(fl).toVar();
		const stain = smoothstep(0.55, 0.85, gFbm(sp2.mul(0.35).add(4))).toVar();
		diffuseColor.rgb.assign(c0.mul(m1.mul(0.24).add(0.86).add(m2.mul(0.06))).mul(grain.mul(0.12).add(0.94)).mul(stain.mul(0.18).oneMinus()).mul(crack.mul(0.4).oneMinus()));
		S.gH.assign(grain.mul(0.003).sub(crack.mul(0.005)));
		S.gRough.assign(m2.sub(0.5).mul(0.06).sub(stain.mul(0.1).mul(uWet)));
	}

	function platformPattern(S, kind) {
		const { fl, px, AAK, sp2, c0 } = surfHead();
		const m1 = gFbm(sp2.mul(0.12)), m2 = gNoise(sp2.mul(1.1)).toVar();
		const grain = mix(0.5, gNoise(sp2.mul(30)), AAK(30)).toVar();
		const stain = smoothstep(0.55, 0.85, gFbm(sp2.mul(0.35).add(4))).toVar();
		const base = c0.mul(m1.mul(0.2).add(0.88).add(m2.mul(0.05))).mul(grain.mul(0.12).add(0.94)).mul(stain.mul(0.15).oneMinus()).toVar();
		const jH = float(0).toVar(), bump = float(0).toVar();
		const vPl = attr('aPl', 'vec2').toVar();
		If(fl.greaterThan(0.5), () => {
			let sz, qs;
			if (kind === 'tact') {
				sz = vec2(0.4);
				qs = vPl.div(sz);
				const fd = fract(vPl.div(0.06)).sub(0.5);
				bump.assign(nsm(0.17, 0.3, length(fd)).mul(AAK(17)));
				base.mulAssign(bump.mul(0.1).add(1).sub(AAK(17).mul(0.05)));
			} else if (kind === 'edge') {
				sz = vec2(1.0, 1000.0);
				qs = vec2(vPl.x, 0.5);
			} else {
				sz = vec2(0.5);
				const q0 = vPl.div(sz);
				qs = vec2(q0.x.add(step(1, pmod(floor(q0.y), 2)).mul(0.5)), q0.y);
			}
			const qv = vec2(qs).toVar();
			const jf = fract(qv).toVar(), jid = floor(qv);
			const jd = min(min(jf.x, jf.x.oneMinus()).mul(sz.x), min(jf.y, jf.y.oneMinus()).mul(sz.y));
			const joint = nsm(0.004, px.mul(1.2).add(0.004), jd).mul(AAK(1.5)).toVar();
			base.mulAssign(gHash(jid.add(3)).mul(0.1).add(0.95).mul(joint.mul(0.28).oneMinus()));
			jH.assign(joint.mul(-0.004));
		});
		diffuseColor.rgb.assign(base);
		S.gH.assign(grain.mul(0.002).add(jH).add(bump.mul(0.004)));
		S.gRough.assign(m2.sub(0.5).mul(0.06).sub(stain.mul(0.1).mul(uWet)));
	}

	function dirtPattern(S) {
		const { wP, wp, gN, fl, AAK, c0 } = surfHead();
		const m1 = gFbm(vec2(wp.x.add(wp.y), wP.y).mul(0.18).add(wp.mul(0.05)));
		const streak = gNoise(vec2(wp.x.sub(wp.y).mul(2.2).add(gN.x.mul(3)), wP.y.mul(0.12))).mul(fl.oneMinus());
		const grain = mix(0.5, gNoise(wP.xy.mul(20).add(wP.zy.mul(20))), AAK(30)).toVar();
		diffuseColor.rgb.assign(c0.mul(m1.mul(0.2).add(0.88)).mul(smoothstep(0.5, 0.9, streak).mul(0.14).oneMinus()).mul(grain.mul(0.1).add(0.95)));
		S.gH.assign(grain.mul(0.002));
	}

	function roofPattern(S) {
		const { wP, wp, gN, px, AAK, c0 } = surfHead();
		const m1 = gFbm(wp.mul(0.15).add(3)).toVar();
		const ny = abs(gN.y).toVar();
		const base = vec3(c0).toVar(), hgt = float(0).toVar();
		If(ny.greaterThan(0.985), () => {
			const sx = fract(wp.x).toVar();
			const seam = nsm(0.0, px.mul(1.5).add(0.03), min(sx, sx.oneMinus())).toVar();
			const grain = mix(0.5, gNoise(wp.mul(25)), AAK(25)).toVar();
			const patchA = smoothstep(0.55, 0.75, gFbm(wp.mul(0.08).add(7)));
			base.assign(c0.mul(m1.mul(0.25).add(0.85)).mul(grain.mul(0.16).add(0.92)).mul(seam.mul(0.18).mul(AAK(1)).oneMinus()).mul(patchA.mul(0.15).oneMinus()));
			hgt.assign(grain.mul(0.002).add(seam.mul(0.004)));
		}).ElseIf(ny.greaterThan(0.12), () => {
			const tg = normalize(vec2(gN.z.negate(), gN.x).add(1e-5)).toVar();
			const hc = dot(wp, tg);
			const ry = wP.y.div(0.2).toVar(), rI = floor(ry).toVar(), rF = fract(ry);
			const tc = hc.div(0.3).add(rI.mul(0.5)).toVar(), tI = floor(tc);
			const wave = sin(tc.mul(6.2832)).mul(0.5).add(0.5).toVar();
			const lip = smoothstep(0.0, 0.3, rF).toVar();
			const aa = nsm(0.18, 0.5, max(fwidth(ry), fwidth(tc).mul(0.6))).toVar();
			const tone = gHash(vec2(tI, rI)).mul(0.16).add(0.92);
			const moss = smoothstep(0.6, 0.85, gFbm(wp.mul(0.25).add(1.7))).mul(0.5);
			base.assign(c0.mul(mix(1, tone.mul(lip.mul(0.45).add(0.55)).mul(wave.mul(0.14).add(0.9)), aa)).mul(m1.mul(0.22).add(0.88)));
			base.assign(mix(base, base.mul(vec3(0.75, 0.85, 0.6)), moss));
			hgt.assign(lip.mul(0.003).add(wave.mul(0.002)).mul(aa));
		}).Else(() => {
			const grain = mix(0.5, gNoise(wP.xy.mul(20).add(wP.zy.mul(20))), AAK(30));
			base.assign(c0.mul(m1.mul(0.15).add(0.9)).mul(grain.mul(0.1).add(0.95)));
		});
		diffuseColor.rgb.assign(base);
		S.gH.assign(hgt);
	}

	function leafPattern(S, hasMap) {
		const wP = positionWorld;
		const lp = wP.mul(4.2).toVar();
		const laa = nsm(0.15, 0.45, length(fwidth(wP)).mul(4.2)).toVar();
		const leafN = gNoise(lp.xz.add(lp.y.mul(0.71))).mul(0.55).add(gNoise(lp.zy.mul(1.93).add(lp.x.mul(0.47)).add(3)).mul(0.45)).toVar();
		const leafM = gNoise(wP.xz.mul(0.9).add(wP.y.mul(0.6))).toVar();
		if (hasMap) {
			diffuseColor.rgb.mulAssign(leafM.mul(0.2).add(0.9));
			diffuseColor.rgb.assign(mix(diffuseColor.rgb, diffuseColor.rgb.mul(vec3(1.1, 1.06, 0.82)), smoothstep(0.62, 0.86, leafN).mul(0.25)));
		} else {
			diffuseColor.rgb.mulAssign(mix(leafM.mul(0.16).add(0.92), leafN.mul(0.6).add(0.66).mul(leafM.mul(0.2).add(0.9)), laa));
			diffuseColor.rgb.assign(mix(diffuseColor.rgb, diffuseColor.rgb.mul(vec3(1.12, 1.08, 0.78)), smoothstep(0.62, 0.86, leafN).mul(0.45).mul(laa)));
		}
		S.gH.assign(leafN.mul(0.05).mul(laa));
	}

	// tabor: patyna, spoiny, falowanie blach, nity, żebra dachu (TRAIN_GLSL) – w układzie wagonu (position, normal)
	function trainPattern(S, grime, panels) {
		const vWear = attr('aWear', 'vec2').toVar();
		S.wearAO.assign(clamp(vWear.x, 0, 1).oneMinus());
		const lp = vec3(positionGeometry).toVar(), ln = normalize(normalGeometry).toVar();
		const pxw = length(fwidth(lp)).toVar();
		const n1 = gFbm(vec2(lp.z.mul(0.7).add(lp.x.mul(0.45)), lp.y.mul(1.1)).add(3)).toVar();
		const g = n1.mul(0.9).add(0.55).mul(grime).toVar();
		If(vWear.y.greaterThan(0.5), () => {
			const low = nsm(0.7, n1.mul(0.5).add(1.9), lp.y);
			const n2 = gNoise(vec2(lp.z.add(lp.x.mul(0.7)).mul(4.5), lp.y.mul(0.3)));
			const streak = smoothstep(0.5, 0.9, n2).mul(smoothstep(1.3, 3.3, lp.y)).mul(abs(ln.y).oneMinus());
			const roof = smoothstep(3.4, 3.85, lp.y).mul(smoothstep(0.15, 0.7, ln.y));
			g.assign(max(g, low.mul(n1.mul(0.55).add(0.45)).add(streak.mul(0.2)).add(roof.mul(n1.mul(0.5).add(0.25)))));
		});
		S.wearG.assign(clamp(g.mul(uWear), 0, 1));
		const dirtC = vec3(0.2, 0.17, 0.135).mul(n1.mul(0.6).add(0.7));
		diffuseColor.rgb.assign(mix(diffuseColor.rgb, dirtC, S.wearG.mul(0.6)));
		if (!panels) return;
		If(vWear.y.greaterThan(0.5).and(abs(ln.x).greaterThan(0.75)).and(lp.y.greaterThan(1.1)).and(lp.y.lessThan(3.5)), () => {
			const fine = nsm(0.012, 0.04, pxw).toVar();
			const wy = smoothstep(1.15, 1.4, lp.y).mul(nsm(3.2, 3.45, lp.y)).toVar();
			const wav = sin(fract(lp.z.div(0.9)).mul(3.14159)).mul(gNoise(vec2(lp.z.mul(0.8), lp.y.mul(1.6))).mul(0.5).add(0.5));
			const sd = abs(fract(lp.z.div(2.7).add(0.5)).sub(0.5)).mul(2.7);
			const seam = nsm(0.003, pxw.mul(1.2).add(0.003), sd).mul(fine).mul(wy).toVar();
			const rv = nsm(0.009, 0.016, length(vec2(fract(lp.z.div(0.16)).sub(0.5).mul(0.16), lp.y.sub(1.2))));
			S.gH.addAssign(wav.mul(0.004).mul(wy).sub(seam.mul(0.002)).add(rv.mul(fine).mul(0.003)));
			diffuseColor.rgb.mulAssign(seam.mul(0.3).oneMinus());
		});
		If(vWear.y.greaterThan(0.5).and(ln.y.greaterThan(0.3)).and(lp.y.greaterThan(3.3)), () => {
			const fine = nsm(0.015, 0.05, pxw);
			const sd = abs(fract(lp.z.div(1.2).add(0.5)).sub(0.5)).mul(1.2).toVar();
			const rib = nsm(0.012, pxw.mul(1.5).add(0.012), sd);
			S.gH.addAssign(rib.mul(0.005).mul(fine));
			diffuseColor.rgb.mulAssign(nsm(0.0, 0.12, sd).mul(n1.mul(0.6).add(0.4)).mul(0.18).oneMinus());
		});
	}

	// mikrorzeźba: wysokość gH zgina normalną (pochodne ekranowe; BUMP_GLSL)
	function bump(n, gH, amp) {
		const sp = positionView, sx = dFdx(sp).toVar(), sy = dFdy(sp).toVar();
		const r1 = cross(sy, n).toVar(), r2 = cross(n, sx).toVar();
		const det = dot(sx, r1).toVar();
		const grad = sign(det).mul(dFdx(gH).mul(r1).add(dFdy(gH).mul(r2))).mul(amp);
		return normalize(abs(det).mul(n).sub(grad));
	}

	// pogoda na powierzchni (WEATHER_GLSL); P – współrzędne wzoru (świata albo pojazdu), wN – normalna w świecie
	function weather(S, wN, wetK, snowK, P, standard) {
		const wP = vec3(P).toVar();
		const up = wN.y.toVar();
		const wpx = length(fwidth(wP)).toVar();
		const wet = uWet.mul(wetK).toVar();
		diffuseColor.rgb.mulAssign(wet.mul(0.3).oneMinus());
		if (standard) S.rough.assign(mix(S.rough, max(0.06, S.rough.mul(0.3)), wet));
		If(uRain.greaterThan(0.01).and(abs(up).lessThan(0.55)), () => {
			const sp = vec2(wP.x.add(wP.z).mul(2.6), wP.y.mul(0.35).add(uTime.mul(1.6))).toVar();
			const streak = smoothstep(0.72, 0.95, gNoise(sp).mul(gNoise(vec2(sp.x.mul(0.5).add(9), 0))).mul(1.6)).toVar();
			diffuseColor.rgb.mulAssign(streak.mul(0.16).mul(uRain).oneMinus());
			if (standard) S.rough.assign(mix(S.rough, 0.05, streak.mul(uRain)));
		});
		If(wet.greaterThan(0.05).and(up.greaterThan(0.6)), () => {
			const dq = wP.xz.mul(14), di = floor(dq).toVar(), dfr = fract(dq).sub(0.5);
			const dc = vec2(gHash(di), gHash(di.add(7.1))).sub(0.5).mul(0.4);
			const dr = length(dfr.sub(dc)).div(gHash(di.add(3.3)).mul(0.12).add(0.12));
			const drop = nsm(0.7, 1.0, dr).mul(step(0.45, gHash(di.add(5.7)))).mul(nsm(0.01, 0.03, wpx)).mul(wet).toVar();
			diffuseColor.rgb.mulAssign(drop.mul(0.25).oneMinus());
			if (standard) S.rough.assign(mix(S.rough, 0.02, drop));
		});
		if (snowK <= 0) return;
		If(uSnow.greaterThan(0.0), () => {
			const sq = wP.xz.toVar();
			const snFine = nsm(0.02, 0.08, wpx);
			const sn0 = gPerlin(sq.mul(0.033).add(2.7)).mul(0.42)
				.add(gPerlin(rot(sq, 0.8, -0.6, 0.6, 0.8).mul(0.127).add(4.1)).mul(0.27))
				.add(gPerlin(rot(sq, 0.47, 0.88, -0.88, 0.47).mul(0.53).add(9.3)).mul(0.18))
				.add(mix(0.5, gPerlin(rot(sq, -0.29, 0.96, -0.96, -0.29).mul(2.11).add(1.9)), snFine).mul(0.13));
			const sn = sn0.sub(0.5).mul(1.8).add(0.5).toVar();
			const th = float(1.05).sub(uSnow.mul(1.15)).toVar();
			const snw = min(0.12, wpx.mul(1.5)).add(0.13).toVar();
			const snowMask = smoothstep(0.3, 0.75, up).mul(smoothstep(th.sub(snw), th.add(snw), sn)).mul(min(1.0, uSnow.mul(3))).mul(snowK).toVar();
			const snowC = mix(vec3(0.74, 0.8, 0.9), vec3(0.97, 0.98, 1.0), gNoise(wP.xz.mul(3)).mul(0.45).add(0.55)).toVar();
			snowC.addAssign(vec3(0.25).mul(step(0.992, gHash(floor(wP.xz.mul(45))))).mul(nsm(0.01, 0.025, wpx)));
			snowC.assign(mix(diffuseColor.rgb.mul(0.6).add(vec3(0.3, 0.32, 0.36)), snowC, smoothstep(0.0, 0.6, snowMask)));
			diffuseColor.rgb.assign(mix(diffuseColor.rgb, snowC, smoothstep(0.0, 0.45, snowMask)));
			if (standard) {
				S.rough.assign(mix(S.rough, 0.62, snowMask));
				S.metal.assign(mix(S.metal, 0.0, snowMask));
			}
		});
	}

	// światło latarni z mapy nocnej i odbicia opraw w mokrej nawierzchni (NIGHT_GLSL)
	function night(S, wN) {
		const wP = positionWorld;
		S.night.assign(vec3(0));
		If(uNightK.greaterThan(0.001), () => {
			const nq = wP.xz.sub(uNightBox.xy).div(uNightBox.z).toVar();
			If(nq.x.greaterThan(0.003).and(nq.x.lessThan(0.997)).and(nq.y.greaterThan(0.003)).and(nq.y.lessThan(0.997)), () => {
				const pool = nightSample(vec2(nq.x.mul(0.5), nq.y)).rgb.toVar();
				const face = max(wN.y, 0.0).mul(0.75).add(0.25);
				S.night.addAssign(diffuseColor.rgb.mul(0.85).add(0.06).mul(pool).mul(pool.add(0.35)).mul(2.0).mul(face).mul(uNightK));
			});
			const wr = uWet.mul(smoothstep(0.6, 0.9, wN.y)).toVar();
			If(wr.greaterThan(0.02), () => {
				const vd = normalize(wP.sub(cameraPosition)).toVar();
				const rd = reflect(vd, wN).toVar();
				If(rd.y.greaterThan(0.02), () => {
					const em = vec3(0).toVar();
					const d0 = float(6.5).div(rd.y).toVar(), stepL = float(1.8).div(max(length(rd.xz), 0.05)).toVar();
					// (pętla GLSL z break: odległość maleje z i – próbka liczy się, dopóki dist ≥ 0,5)
					for (let i = 0; i < 8; i++) {
						const dist = d0.sub(stepL.mul(i - 1)).toVar();
						const rq = wP.xz.add(rd.xz.mul(min(dist, 400))).sub(uNightBox.xy).div(uNightBox.z).toVar();
						const ok = dist.greaterThanEqual(0.5).and(dist.lessThan(250)).and(rq.x.greaterThan(0.003)).and(rq.x.lessThan(0.997)).and(rq.y.greaterThan(0.003)).and(rq.y.lessThan(0.997));
						const e = nightSample(vec2(rq.x.mul(0.5).add(0.5), rq.y)).rgb;
						em.addAssign(select(ok, e.mul(e), vec3(0)));
					}
					const fr = pow(max(dot(vd.negate(), wN), 0.0).oneMinus(), 3.0).mul(0.65).add(0.35);
					S.night.addAssign(em.mul(0.4).mul(wr).mul(fr).mul(uNightK));
				});
			});
		});
	}

	// tabor: okluzja z wierzchołków także dla światła bezpośredniego (TRAIN_LIGHT_GLSL)
	// (model oświetlenia materiału – flagi powłoki itd. ustawia Three; tu tylko przyciemnienie na końcu)
	function wearLighting(model, ao) {
		const finish = model.finish.bind(model);
		model.finish = (builder) => {
			const { reflectedLight } = builder.context;
			reflectedLight.indirectDiffuse.mulAssign(ao);
			reflectedLight.indirectSpecular.mulAssign(ao.mul(ao));
			reflectedLight.directDiffuse.mulAssign(mix(1.0, ao, 0.35));
			reflectedLight.directSpecular.mulAssign(mix(1.0, ao, 0.5));
			finish(builder);
		};
	}

	// pozycja instancji (kolumna przesunięcia macierzy) – do kołysania roślin; osobny bufor na tablicy instanceMatrix
	const originBuffers = new WeakMap();
	const instanceOrigin = Fn((builder) => {
		const o = builder.object;
		if (!o.isInstancedMesh) return vec3(0);
		const m = o.instanceMatrix;
		let ib = originBuffers.get(m);
		if (!ib) {
			ib = new THREE.InstancedInterleavedBuffer(m.array, 16, 1);
			ib.srcVersion = m.version;
			originBuffers.set(m, ib);
		}
		OnObjectUpdate(() => {
			if (ib.srcVersion !== m.version) { ib.srcVersion = m.version; ib.needsUpdate = true; }
		});
		return instancedBufferAttribute(ib, 'vec3', 16, 12);
	});

	// kołysanie na wietrze (instancje roślin); trawa – mocniej, przygniata ją śnieg
	function sway(grass) {
		const ip = instanceOrigin().toVar();
		const p = vec3(positionLocal).toVar();
		const y5 = positionGeometry.y.add(0.5);
		const s = y5.mul(y5).mul(uWind).mul(sin(uTime.mul(0.4).add(ip.x.mul(0.01))).mul(0.5).add(1)).toVar();
		p.x.addAssign(sin(uTime.mul(1.7).add(ip.x.mul(0.13)).add(ip.z.mul(0.07))).mul(s).mul(0.07));
		p.z.addAssign(cos(uTime.mul(1.3).add(ip.z.mul(0.11)).add(ip.x.mul(0.05))).mul(s).mul(0.05));
		if (grass) {
			p.x.addAssign(sin(uTime.mul(2.6).add(ip.x.mul(0.4)).add(ip.z.mul(0.3))).mul(s).mul(0.12));
			p.y.assign(p.y.add(0.5).mul(uSnow.mul(0.9).oneMinus()).sub(0.5));
			p.assign(mix(p, vec3(0, -0.6, 0), smoothstep(0.3, 0.65, uSnow)));
		}
		return p;
	}

	const WET_K = { ground: 1, gravel: 1, road: 1, concrete: 1, platform: 1, roof: 1, wind: 0.6, grass: 0.6 };
	const BUMP_K = { ground: 1.4, gravel: 1.6, road: 1.2, concrete: 0.9, platform: 0.9, roof: 0.9, dirt: 0.9, wind: 1.0 };

	/* Materiał węzłowy wariantu: klasa pochodna od materiału Three (Standard / Physical / Lambert) z obliczeniami
	   wariantu w setupDiffuseColor. variant i opt zapamiętane w materiale (clone / copy je przenoszą).
	   Haki (patchHooks, extend) – odpowiedniki dalszych łatek GLSL nakładanych na patch() w innych plikach:
	   vertex(builder) – przed instancjami (positionLocal, normalLocal w układzie obiektu), diffuse(builder) – zaraz po kolorze
	   bazowym (przed wzorem i pogodą), lighting(outgoing) – światło wychodzące (przed mgłą). */
	const classes = new Map();
	function variantClass(Base) {
		if (classes.has(Base)) return classes.get(Base);
		class Patched extends Base {
			setupPosition(builder) {
				const v = this.patchVariant, H = this.patchHooks;
				if (H && H.vertex) H.vertex(builder);
				if (v === 'wind' || v === 'grass') positionLocal.assign(sway(v === 'grass'));
				return super.setupPosition(builder);
			}
			setupDiffuseColor(builder) {
				super.setupDiffuseColor(builder);
				const v = this.patchVariant, S = this.patchVars, H = this.patchHooks;
				if (H && H.diffuse) H.diffuse(builder);
				if (!S) return;
				const opt = this.patchOpt || {};
				const standard = !!this.isMeshStandardMaterial;
				const train = v === 'train', ground = v === 'ground';
				if (ground) {
					Loop(8, ({ i }) => {
						const pa = uPortalA.element(i), pb = uPortalB.element(i);
						const rel = positionWorld.xz.sub(pa.xz);
						const along = dot(rel, pb.xy), across = abs(rel.x.mul(pb.y).sub(rel.y.mul(pb.x)));
						If(pb.w.greaterThanEqual(0.5).and(across.lessThan(pb.z)).and(along.greaterThan(-0.6)).and(along.lessThan(0.6))
							.and(positionWorld.y.greaterThan(pa.y)).and(positionWorld.y.lessThan(pa.y.add(pa.w))), () => { Discard(); });
					});
				}
				S.gH.assign(0); S.puddle.assign(0); S.gSand.assign(0); S.gRough.assign(0);
				if (train) { S.wearG.assign(0); S.wearAO.assign(1); }
				const defs = this.defines || {};
				// (opt.rm – chropowatość, metaliczność i zabrudzenie bazowe w wierzchołkach: atrybut aRM, train.js vcConvert)
				const rm = opt.rm ? attr('aRM', 'vec3').toVar() : null;
				if (ground) groundPattern(S);
				else if (v === 'gravel') gravelPattern(S);
				else if (v === 'wind') leafPattern(S, !!this.map);
				else if (train) trainPattern(S, rm ? rm.z : opt.grime ?? 0.12, !!opt.panels);
				else if (v === 'road') roadPattern(S);
				else if (v === 'concrete') concretePattern(S);
				else if (v === 'platform') platformPattern(S, 'PL_TACT' in defs ? 'tact' : 'PL_EDGE' in defs ? 'edge' : 'top');
				else if (v === 'roof') roofPattern(S);
				else if (v === 'dirt') dirtPattern(S);
				// normalna (widok): geometryczna, na tylnej stronie odwrócona; mikrorzeźba
				let n = normalViewGeometry;
				if (this.side === THREE.DoubleSide) n = n.mul(faceDirection);
				else if (this.side === THREE.BackSide) n = n.negate();
				const amp = train ? (opt.panels ? 1.0 : 0) : BUMP_K[v] || 0;
				S.normal.assign(amp ? bump(n, S.gH, amp) : n);
				const wN = normalize(vec4(S.normal, 0).mul(cameraViewMatrix).xyz).toVar();
				if (v === 'wind') {
					const rim = pow(abs(dot(S.normal, normalize(positionView))).oneMinus(), 2.0);
					diffuseColor.rgb.assign(mix(diffuseColor.rgb, diffuseColor.rgb.mul(vec3(1.3, 1.32, 0.9)).add(vec3(0.015, 0.025, 0.0)), rim.mul(0.6)));
				}
				if (standard) {
					if (train) {
						const r0 = rm ? rm.x : materialRoughness, m0 = rm ? rm.y : materialMetalness;
						S.rough.assign(clamp(mix(r0, 0.88, S.wearG), 0.04, 1.0));
						S.metal.assign(mix(m0, m0.mul(0.35), S.wearG));
					} else {
						S.rough.assign(mix(clamp(materialRoughness.add(S.gRough), 0.3, 1.0), 0.97, S.gSand));
						S.metal.assign(materialMetalness);
					}
				}
				const snowK = opt.noSnow ? 0 : v === 'grass' ? 0 : v === 'wind' ? 0.75 : 1;
				weather(S, wN, WET_K[v] ?? 0.75, snowK, train ? positionGeometry : positionWorld, standard);
				if (ground || v === 'road') {
					const pm = S.puddle.mul(smoothstep(0.85, 0.97, wN.y)).toVar();
					diffuseColor.rgb.assign(mix(diffuseColor.rgb, diffuseColor.rgb.mul(0.35).add(vec3(0.02, 0.03, 0.04)), pm));
					if (standard) S.rough.assign(mix(S.rough, 0.03, pm));
					If(uRain.greaterThan(0.01), () => {
						const rr = gRipples(positionWorld.xz, uTime).mul(pm).mul(uRain);
						S.normal.assign(normalize(S.normal.add(vec3(rr.mul(0.6), 0, rr.mul(0.6)))));
					});
				}
				night(S, wN);
			}
			build(builder) {
				const P = this.patchNodes;
				if (P) Object.assign(this, P);
				try {
					super.build(builder);
				} finally {
					if (P) for (const k in P) this[k] = null;
				}
			}
			// (obserwator powstaje na końcu setup – bez podstawionych węzłów, inaczej hasNode)
			setupObserver(builder) {
				const P = this.patchNodes;
				if (P) for (const k in P) this[k] = null;
				return super.setupObserver(builder);
			}
			setupLighting(builder) {
				const out = super.setupLighting(builder), H = this.patchHooks;
				return H && H.lighting ? H.lighting(out, builder) : out;
			}
			setupLightingModel(builder) {
				const model = super.setupLightingModel(builder);
				if (this.patchVariant === 'train' && this.patchVars && model && model.isPhysicalLightingModel !== false && model.finish) wearLighting(model, this.patchVars.wearAO);
				return model;
			}
			/* klucz zbudowanego shadera: Three skraca obiekty materiału do „{}” – wariant, opcje i #define (rodzaj płyt peronu)
			   muszą trafić do klucza, inaczej materiały różniące się tylko nimi dzieliłyby jeden shader */
			customProgramCacheKey() {
				const o = this.patchOpt || {}, d = this.defines ? Object.keys(this.defines).sort().join('+') : '';
				const h = (this.patchHooks ? Object.keys(this.patchHooks).sort().join('+') + (this.patchHooks.tag || '') : '') + (this.patchNodes ? '|' + Object.keys(this.patchNodes).sort().join('+') : '');
				return super.customProgramCacheKey() + '|' + this.patchVariant + '|' + [o.grime, o.panels ? 1 : 0, o.rm ? 1 : 0, o.noSnow ? 1 : 0].join(',') + '|' + d + '|' + h;
			}
			copy(source) {
				super.copy(source);
				if (source.patchVariant !== undefined) initVariant(this, source.patchVariant, source.patchOpt);
				if (source.patchHooks) this.patchHooks = source.patchHooks;
				if (source.patchNodes) this.patchNodes = Object.assign({}, this.patchNodes, source.patchNodes);
				return this;
			}
		}
		classes.set(Base, Patched);
		return Patched;
	}

	/* Węzły materiału (normalNode, emissiveNode…) podstawiane tylko na czas budowy shadera (Patched.build): materiał
	   z węzłem we właściwości WebGPURenderer odświeża co klatkę w całości (NodeMaterialObserver.hasNode – wszystkie
	   uniformy obiektu, także w paczkach i dla obiektów static) – ok. 900 obiektów × każda klatka. */
	function nodeProps(m, props) {
		m.patchNodes = Object.assign({}, m.patchNodes, props);
		m.needsUpdate = true;
	}

	// zmienne wariantu i węzły materiału, które z nich biorą
	function initVariant(m, variant, opt) {
		m.patchVariant = variant;
		m.patchOpt = opt;
		m.userData.cloudShade = variant !== 'indoor';
		if (variant === 'indoor' || variant === 'clean') { m.patchVars = null; return m; }
		const S = (m.patchVars = {
			gH: property('float', 'tGH'), puddle: property('float', 'tPuddle'), gSand: property('float', 'tSand'), gRough: property('float', 'tGRough'),
			rough: property('float', 'tRough'), metal: property('float', 'tMetal'), normal: property('vec3', 'tNormal'), night: property('vec3', 'tNight'),
			wearG: property('float', 'tWearG'), wearAO: property('float', 'tWearAO'),
		});
		nodeProps(m, { normalNode: S.normal, emissiveNode: materialEmissive.add(S.night) });
		if (m.isMeshStandardMaterial) nodeProps(m, { roughnessNode: S.rough, metalnessNode: S.metal });
		if (variant === 'train' && m.isMeshPhysicalMaterial) nodeProps(m, { clearcoatNode: materialClearcoat.mul(S.wearG.mul(0.85).oneMinus()), clearcoatNormalNode: S.normal });
		return m;
	}

	/* patch() w trybie WebGPU: nowy materiał węzłowy z parametrami podanego (kolor, mapy, chropowatość, przezroczystość…)
	   i obliczeniami wariantu. */
	function patch(material, variant, opt = {}) {
		const Base = material.isMeshPhysicalMaterial ? MeshPhysicalNodeMaterial : material.isMeshStandardMaterial ? MeshStandardNodeMaterial : material.isMeshBasicMaterial ? MeshBasicNodeMaterial : MeshLambertNodeMaterial;
		const m = new (variantClass(Base))();
		for (let key of Object.keys(material)) {
			if (key === 'uuid' || key === 'id' || key === 'type' || key === '_listeners' || key.startsWith('is')) continue;
			// pola z podkreślnikiem – przez właściwość publiczną (alphaTest, clearcoat, sheen… z getterami)
			if (key.startsWith('_')) {
				if (!(key.slice(1) in material)) continue;
				key = key.slice(1);
			}
			const v = material[key];
			if (v === undefined || typeof v === 'function') continue;
			m[key] = v && (v.isColor || v.isVector2 || v.isVector3) ? v.clone() : v;
		}
		m.userData = Object.assign({}, material.userData);
		m.version++;
		return initVariant(m, variant, opt);
	}

	/* Odbicia nieba (post.js environment w WebGL): kula z gradientem zenit – horyzont – ziemia i plamą słońca, zamieniona
	   na mapę PMREM; ten sam bufor docelowy przy każdym odświeżeniu (materiały nie przebudowują się co 2 s). */
	function createEnvironment(renderer) {
		const u = { zenith: uniform(new THREE.Color()), horizon: uniform(new THREE.Color()), ground: uniform(new THREE.Color()), sunDir: uniform(new THREE.Vector3(0, 1, 0)), sunColor: uniform(new THREE.Color()) };
		// (bez tone mappingu – wartości liniowe jak w WebGL; inaczej ACES z nocną ekspozycją rozjaśniał ciemne niebo kilkanaście razy)
		const mat = new MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });
		const sky = NS.skyGpu;
		mat.colorNode = Fn(() => {
			const d = normalize(positionLocal).toVar();
			// niebo z atmosfery (sky-gpu.js), pod horyzontem – ciemniejszy grunt; bez niej – gradient zenit / horyzont
			const skyC = sky ? sky.skyColor(vec3(d.x, max(d.y, 0.02), d.z), false) : mix(u.horizon, u.zenith, pow(max(d.y, 0), 0.6));
			const groundC = mix(sky ? sky.skyColor(vec3(d.x, 0.02, d.z), false) : u.horizon, u.ground, smoothstep(0.0, 0.25, d.y.negate()));
			const c = select(d.y.greaterThan(0), skyC, groundC).toVar();
			const s = max(0.0, dot(d, normalize(u.sunDir))).toVar();
			c.addAssign(u.sunColor.mul(pow(s, 400.0).mul(18.0).add(pow(s, 12.0).mul(0.6))).mul(step(-0.02, d.y)));
			return c;
		})();
		const scene = new THREE.Scene();
		scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat));
		const pmrem = new PMREMGenerator(renderer);
		let target = null, key = '';
		const update = (sky) => {
			if (!renderer.hasInitialized()) return null;
			const k = [sky.zenith, sky.horizon, sky.ground, sky.sunColor].map((c) => c.getHexString()).join('') + sky.sunDir.toArray().map((v) => v.toFixed(1)).join();
			if (k === key && target) return target.texture;
			key = k;
			u.zenith.value.copy(sky.zenith);
			u.horizon.value.copy(sky.horizon);
			u.ground.value.copy(sky.ground);
			u.sunDir.value.copy(sky.sunDir);
			u.sunColor.value.copy(sky.sunColor);
			target = pmrem.fromScene(scene, 0, 0.1, 10, { renderTarget: target });
			return target.texture;
		};
		// ponowne wyliczenie przy następnym wywołaniu (scene.js pipesReady – pierwsze było bez gotowych potoków)
		update.reset = () => { key = ''; };
		return update;
	}

	// haki dla materiału (zob. Patched); zwraca materiał
	function extend(m, hooks) {
		m.patchHooks = Object.assign({}, m.patchHooks, hooks);
		m.needsUpdate = true;
		return m;
	}

	/* Ludzie (world.js personMat, train.js pasażerowie): spodnie, buty, włosy, plecaki i torby z palet wg numeru osoby
	   (aKeep – część nie bierze koloru instancji). bags – plecaki i torby (ludzie na peronach). */
	const personPalette = (bags) => varying(Fn(() => {
		const aKeep = attribute('aKeep', 'float');
		const ph = fract(sin(float(instanceIndex).mul(12.9898).add(aKeep.mul(3.1))).mul(43758.5453)).toVar();
		const pants = select(ph.lessThan(0.4), vec3(0.12, 0.16, 0.3), select(ph.lessThan(0.6), vec3(0.07), select(ph.lessThan(0.8), vec3(0.24, 0.24, 0.23), vec3(0.42, 0.36, 0.26))));
		const hair = select(ph.lessThan(0.35), vec3(0.1, 0.08, 0.06), select(ph.lessThan(0.65), vec3(0.3, 0.2, 0.12), select(ph.lessThan(0.85), vec3(0.62, 0.5, 0.3), vec3(0.55))));
		const bag = select(ph.lessThan(0.35), vec3(0.03), select(ph.lessThan(0.55), vec3(0.04, 0.06, 0.14), select(ph.lessThan(0.72), vec3(0.18), select(ph.lessThan(0.86), vec3(0.4, 0.05, 0.04), vec3(0.22, 0.12, 0.06)))));
		const top = bags ? select(aKeep.greaterThan(3.5), bag, hair) : hair;
		return select(aKeep.lessThan(1.5), pants, select(aKeep.greaterThan(2.5), top, vertexColor().rgb));
	})(), bags ? 'vPalB' : 'vPal');
	const paletteDiffuse = (bags) => () => {
		If(attribute('aKeep', 'float').greaterThan(0.5), () => { diffuseColor.rgb.assign(materialColor.rgb.mul(personPalette(bags))); });
	};

	// obrót punktu p wokół osi x (pochylenie) / y (pionowej) względem c o kąt a
	const rX = (p, c, a) => { const q = p.sub(c).toVar(), s = sin(a), k = cos(a); return c.add(vec3(q.x, q.y.mul(k).sub(q.z.mul(s)), q.y.mul(s).add(q.z.mul(k)))); };
	const rY = (p, c, a) => { const q = p.sub(c).toVar(), s = sin(a), k = cos(a); return c.add(vec3(q.x.mul(k).add(q.z.mul(s)), q.y, q.x.mul(s).negate().add(q.z.mul(k)))); };

	/* animacja ludzi w wierzchołkach (aAnim: x – faza, y – chód 0…1 albo −1 – siedzi, z – cykle kroku na s; aLimb – część
	   ciała): chód, oddech, przenoszenie ciężaru, rozglądanie się; wzrost i tusza wg numeru osoby, plecak albo torba */
	function personVertex() {
		const aKeep = attribute('aKeep', 'float'), aLimb = attribute('aLimb', 'float'), aAnim = attribute('aAnim', 'vec3');
		const p0 = positionGeometry;
		const pos = vec3(p0).toVar(), nrm = vec3(normalLocal).toVar();
		const pid = float(instanceIndex);
		const h = (a, b) => fract(sin(pid.mul(a).add(b)).mul(43758.5453));
		const pH = h(7.13, 0.7).mul(0.16).add(0.92), pW = h(3.31, 2.9).mul(0.2).add(0.9), bagR = h(3.71, 1.3).toVar();
		If(aKeep.greaterThan(3.5).and(aKeep.lessThan(4.5)).and(bagR.greaterThan(0.28)).or(aKeep.greaterThan(4.5).and(bagR.lessThan(0.28).or(bagR.greaterThan(0.5)))), () => { pos.assign(vec3(0.0, 1.2, 0.0)); });
		const sit = step(aAnim.y, -0.5).toVar();
		const ph = uTime.mul(aAnim.z).mul(6.2832).add(aAnim.x).toVar(), w = max(aAnim.y, 0.0).toVar(), id = w.oneMinus().toVar(), sw = sin(ph).toVar();
		const t2 = uTime.add(aAnim.x.mul(7)).toVar();
		const L = floor(aLimb.add(0.5)).toVar();
		const is = (...k) => k.map((x) => L.equal(x)).reduce((a, b) => a.or(b));
		const a1 = float(0).toVar(), a2 = float(0).toVar(), turn = float(0).toVar(), c1 = vec3(0).toVar(), c2 = vec3(0).toVar();
		const shift = id.mul(sit.oneMinus()).mul(sin(t2.mul(0.23))).mul(0.035).toVar();
		If(is(1, 3), () => {
			a1.assign(sw.mul(0.46).mul(w).add(shift)); c1.assign(vec3(0, 0.92, 0)); c2.assign(vec3(0, 0.5, 0));
			a2.assign(select(L.equal(3), max(0.0, sin(ph.add(2))).mul(0.8).mul(w).negate().sub(max(0.0, shift).mul(1.5)), float(0)));
		});
		If(is(2, 4), () => {
			a1.assign(sw.mul(-0.46).mul(w).sub(shift)); c1.assign(vec3(0, 0.92, 0)); c2.assign(vec3(0, 0.5, 0));
			a2.assign(select(L.equal(4), max(0.0, sin(ph.add(5.14))).mul(0.8).mul(w).negate().sub(max(0.0, shift.negate()).mul(1.5)), float(0)));
		});
		If(is(5, 7), () => {
			a1.assign(sw.mul(-0.4).mul(w).add(id.mul(0.05).mul(sin(t2.mul(0.7))))); c1.assign(vec3(0, 1.44, 0)); c2.assign(vec3(0, 1.16, 0));
			a2.assign(select(L.equal(7), id.mul(0.12).mul(sin(t2.mul(0.4)).mul(0.5).add(0.5)).add(0.12).add(w.mul(max(0.0, sw.negate()).mul(0.25).add(0.3))), float(0)));
		});
		If(is(6, 8), () => {
			a1.assign(sw.mul(0.4).mul(w).add(id.mul(0.05).mul(sin(t2.mul(0.7).add(1.3))))); c1.assign(vec3(0, 1.44, 0)); c2.assign(vec3(0, 1.16, 0));
			a2.assign(select(L.equal(8), id.mul(0.12).mul(sin(t2.mul(0.37).add(2)).mul(0.5).add(0.5)).add(0.12).add(w.mul(max(0.0, sw).mul(0.25).add(0.3))), float(0)));
		});
		If(L.equal(9), () => { turn.assign(id.mul(0.5).mul(sin(t2.mul(0.31))).mul(sin(t2.mul(0.13).add(1))).add(w.mul(0.06).mul(sin(ph)))); });
		If(sit.greaterThan(0.5).and(L.greaterThanEqual(1)).and(L.lessThanEqual(4)), () => {
			a1.assign(select(is(2, 4), float(1.57), float(1.49)));
			a2.assign(select(L.greaterThanEqual(3), sin(t2.mul(0.21).add(L)).mul(-0.08).sub(1.42), float(0)));
		});
		If(sit.greaterThan(0.5).and(L.greaterThanEqual(5)).and(L.lessThanEqual(8)), () => {
			a1.assign(sin(t2.mul(0.5).add(L)).mul(0.03).add(0.32));
			a2.assign(select(L.greaterThanEqual(7), float(0.8), float(0)));
		});
		const zero = vec3(0);
		pos.assign(rX(pos, c2, a2)); nrm.assign(rX(nrm, zero, a2));
		pos.assign(rX(pos, c1, a1)); nrm.assign(rX(nrm, zero, a1));
		pos.assign(rY(pos, vec3(0, 1.56, 0), turn)); nrm.assign(rY(nrm, zero, turn));
		pos.y.addAssign(abs(sin(ph)).sub(0.5).mul(0.04).mul(w).sub(sit.mul(0.35)));
		pos.y.addAssign(select(L.equal(0).or(L.greaterThanEqual(5)), id.mul(sin(t2.mul(1.6)).mul(0.5).add(0.5)).mul(0.006).mul(smoothstep(0.95, 1.2, p0.y)), float(0)));
		pos.x.addAssign(shift.mul(0.25).mul(smoothstep(0.3, 1.0, p0.y)));
		pos.mulAssign(vec3(pW, mix(pH, 1.0, sit), pW));
		positionLocal.assign(pos);
		normalLocal.assign(nrm);
	}
	const personHooks = () => ({ tag: 'person', vertex: personVertex, diffuse: paletteDiffuse(true) });

	// zaspy (world.js driftMat): bryła obniżona pod ziemię, gdy pokrywy śnieżnej mało
	const driftHooks = () => ({ tag: 'drift', vertex: () => { positionLocal.y.subAssign(attribute('aDrift', 'float').add(0.1).mul(nsm(0.12, 0.55, uSnow))); } });

	/* wnętrza wagonów (train.js): materiał bez pogody i chmur, świecenie własne mnożone przez kolor (oświetlone wnętrze
	   zachowuje barwy); person – pasażerowie (palety jak ludzie na peronach, bez plecaków) */
	function interior(material, person) {
		const m = patch(material, 'indoor');
		nodeProps(m, { emissiveNode: materialEmissive.mul(diffuseColor.rgb) });
		if (person) extend(m, { tag: 'pax', diffuse: paletteDiffuse(false) });
		return m;
	}

	/* Woda (water.js): fale (normalna z sumy czterech fal kierunkowych, krótkie – wygaszone), odbicie lustrzane z Fresnelem
	   (reflector – płaszczyzna na wysokości lustra najbliższego akwenu, zniekształcona falami). WU – uniformy water.js. */
	const waterN = property('vec3', 'tWaterN'), waterNV = property('vec3', 'tWaterNV');
	let waterRefl = null;
	function waterReflector() {
		if (!waterRefl) {
			waterRefl = reflector({ resolutionScale: 0.5, generateMipmaps: false, bounces: false });
			waterRefl.uvNode = clamp(waterRefl.uvNode.add(waterN.xz.mul(0.035)), 0.002, 0.998);
		}
		return waterRefl;
	}
	function waterHooks(WU) {
		const t = reference('value', 'float', WU.uWTime), wind = reference('value', 'vec2', WU.uWWind);
		const reflOn = reference('value', 'float', WU.uReflOn), reflY = reference('value', 'float', WU.uReflY);
		const refl = waterReflector();
		return {
			tag: 'water',
			diffuse: () => {
				const p = positionWorld.xz;
				const fw = length(fwidth(p)).toVar();
				const wd = normalize(wind.add(1e-4)).toVar(), perp = vec2(wd.y.negate(), wd.x);
				const dirs = [wd, normalize(wd.add(perp.mul(0.6))), normalize(wd.sub(perp.mul(0.9))), perp], lens = [9.0, 4.3, 2.1, 1.1];
				const amp = length(wind).mul(0.06).add(0.07).toVar();
				const g = vec2(0).toVar();
				for (let i = 0; i < 4; i++) {
					const L = lens[i], k = (2 * Math.PI) / L, w = Math.sqrt(9.81 * k);
					const a = amp.mul(L / 9).mul(nsm(L * 0.12, L * 0.35, fw));
					const ph = dot(dirs[i], p).mul(k).sub(t.mul(w)).add(i * 1.7);
					g.addAssign(dirs[i].mul(a.mul(k).mul(cos(ph))));
				}
				const wg = g.mul(smoothstep(150, 900, length(positionWorld.sub(cameraPosition))).mul(0.7).oneMinus());
				waterN.assign(normalize(vec3(wg.x.negate(), 1, wg.y.negate())));
				waterNV.assign(normalize(cameraViewMatrix.mul(vec4(waterN, 0)).xyz));
			},
			lighting: (out) => {
				const Vw = normalize(cameraPosition.sub(positionWorld));
				const F = pow(max(dot(waterN, Vw), 0.0).oneMinus(), 5.0).mul(0.98).add(0.02);
				const onPlane = reflOn.mul(nsm(1.2, 4.0, abs(positionWorld.y.sub(reflY))));
				return mix(out, refl.rgb, clamp(F.mul(1.1).add(0.08), 0, 1).mul(onPlane));
			},
		};
	}
	function waterMaterial(material, WU) {
		const m = extend(patch(material, 'clean'), waterHooks(WU));
		nodeProps(m, { normalNode: waterNV });
		return m;
	}

	/* Mokra, ośnieżona i oszroniona szyba (train.js WET_GLSL / WET_FRAG): krople jak soczewki w trzech wielkościach,
	   pola przetarte przez dwie wycieraczki (12 wycinków każda), wał wody na obrysie, na szybach bocznych krople spływające
	   do tyłu w czasie jazdy, śnieg, szron z odmrażaniem od nawiewu; powierzchnia kropli zgina normalną. U – uniformy
	   szyby (train.js glassU). */
	const wgH = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)))
		.setLayout({ name: 'wgH', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	const wgN = Fn(([p]) => {
		const i = floor(p).toVar(), f0 = fract(p);
		const f = f0.mul(f0).mul(f0.mul(-2).add(3)).toVar();
		return mix(mix(wgH(i), wgH(i.add(vec2(1, 0))), f.x), mix(wgH(i.add(vec2(0, 1))), wgH(i.add(vec2(1, 1))), f.x), f.y);
	}).setLayout({ name: 'wgN', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	// kropla w komórce g (pokrycie cov): x – kropla, y – ciemny brzeg, zw – nachylenie powierzchni (soczewka)
	const wgDrop = Fn(([g, cov]) => {
		const id = floor(g).toVar(), f = fract(g);
		const c = vec2(wgH(id.add(7.3)).mul(0.4).add(0.3), wgH(id.add(3.1)).mul(0.4).add(0.3));
		const rad = wgH(id.add(1.7)).mul(wgH(id.add(5.9))).mul(0.26).add(0.1);
		const dv0 = f.sub(c).div(rad);
		const dv = vec2(dv0.x, dv0.y.mul(0.8)).toVar();
		const d = length(dv).toVar(), drop = nsm(0.75, 1.0, d).toVar();
		return select(wgH(id).greaterThan(cov.mul(0.6)), vec4(0), vec4(drop, smoothstep(0.6, 1.0, d).mul(drop), dv.mul(drop)));
	}).setLayout({ name: 'wgDrop', type: 'vec4', inputs: [{ name: 'g', type: 'vec2' }, { name: 'cov', type: 'float' }] });

	function wetGlass(m, U) {
		const f = (k) => reference('value', 'float', U[k]);
		const arr = (k, type) => uniformArray(U[k].value, type);
		const uWP = arr('uWP', 'vec3'), uWU = arr('uWU', 'vec3'), uWV = arr('uWV', 'vec3'), uWS = arr('uWS', 'float'), uA0 = arr('uA0', 'float'), uSweep = arr('uSweep', 'float');
		const uWA = arr('uWA', 'float'), uSA = arr('uSA', 'float');
		const uWL = f('uWL'), uWD = f('uWD'), uWG = f('uWG'), uSG = f('uSG'), uWR = f('uWR'), uSR = f('uSR'), uFrost = f('uFrost'), uDefrost = f('uDefrost'), uStretch = f('uStretch');
		const uFwd = reference('value', 'vec3', U.uFwd), uOrg = reference('value', 'vec3', U.uOrg), uFlow = reference('value', 'vec2', U.uFlow);
		const nOut = property('vec3', 'tGlassN');
		const side = m.side;
		extend(m, {
			tag: 'glass',
			diffuse: () => {
				const vWG = positionWorld;
				const wn = normalize(modelWorldMatrix.mul(vec4(normalGeometry, 0)).xyz).toVar();
				const sideK = nsm(0.35, 0.6, abs(dot(wn, uFwd))).mul(nsm(0.55, 0.8, abs(wn.y)));
				const sideG = sideK.greaterThan(0.5).toVar();
				const wa = select(sideG, uWG.mul(0.85), uWG).toVar(), sa = float(uSG).toVar(), wgE = float(0).toVar();
				for (let i = 0; i < 2; i++) {
					If(sideG.not(), () => {
						const dd = vWG.sub(uWP.element(i)).toVar();
						const q = vec2(dot(dd, uWU.element(i)).mul(uWS.element(i)), dot(dd, uWV.element(i))).toVar();
						const r = length(q).toVar();
						const an = atan(q.y, q.x).sub(asin(clamp(uWD.div(max(r, 1e-3)), 0.0, 1.0))).toVar();
						const tf = an.sub(uA0.element(i)).div(uSweep.element(i)).toVar();
						If(r.lessThan(uWL).and(r.greaterThan(uWD.add(0.02))).and(tf.greaterThan(-0.04)).and(tf.lessThan(1.04)), () => {
							const b = int(clamp(tf, 0.0, 0.999).mul(12.0)).add(i * 12);
							wa.assign(min(wa, uWA.element(b)));
							sa.assign(min(sa, uSA.element(b)));
						});
						If(uWL.greaterThan(0.0), () => {
							const wob = sin(an.mul(37.0).add(i * 2.1)).mul(0.006).add(sin(r.mul(61.0)).mul(0.004)).toVar();
							If(tf.greaterThan(-0.03).and(tf.lessThan(1.03)).and(r.greaterThan(uWD)), () => {
								const mid = abs(clamp(tf, 0.0, 1.0).sub(0.5)).mul(0.8).oneMinus();
								wgE.assign(max(wgE, nsm(0.0, mid.mul(0.01).add(0.016), abs(r.sub(uWL).sub(0.014).sub(wob))).mul(smoothstep(-0.03, 0.03, tf)).mul(nsm(0.97, 1.03, tf))));
							});
							If(r.greaterThan(uWD.add(0.02)).and(r.lessThan(uWL.add(0.02))), () => {
								const ds = select(tf.lessThan(0.5), tf.negate().mul(uSweep.element(i)).mul(r), tf.sub(1.0).mul(uSweep.element(i)).mul(r));
								wgE.assign(max(wgE, nsm(0.0, 0.014, abs(ds.sub(0.012).sub(wob))).mul(smoothstep(uWD, uWD.add(0.08), r))));
							});
						});
					});
				}
				wa.assign(max(wa, uWR.mul(wgE)));
				sa.assign(max(sa, uSR.mul(wgE)));
				const d0 = vWG.sub(uWP.element(0)).toVar();
				const q0 = vec2(dot(d0, uWU.element(0)), dot(d0, uWV.element(0))).toVar();
				const qS = vec2(q0).toVar();
				If(sideG, () => {
					qS.assign(vec2(dot(vWG.sub(uOrg), uFwd), vWG.y.sub(uOrg.y)));
					q0.assign(vec2(qS.x.add(uFlow.x).mul(uStretch), qS.y.add(uFlow.y)));
				});
				const cov = exp(wa.negate()).oneMinus().toVar();
				const a1 = wgDrop(q0.mul(18.0), cov.mul(0.7)).toVar(), a2 = wgDrop(q0.mul(42.0).add(0.5), cov).toVar(), a3 = wgDrop(q0.mul(95.0).add(0.3), cov.mul(1.2)).toVar();
				const drop = max(max(a1.x, a2.x.mul(0.85)), a3.x.mul(0.6)).toVar(), rim = max(max(a1.y, a2.y.mul(0.85)), a3.y.mul(0.5)).toVar();
				const dn = select(a1.x.greaterThan(a2.x), a1.zw, select(a2.x.greaterThan(a3.x), a2.zw, a3.zw)).toVar();
				const hv = select(a1.x.greaterThan(a2.x), a1.zw, a2.zw);
				const amax = max(a1.x, a2.x);
				const hl = nsm(0.0, 0.32, length(hv.sub(vec2(-0.25, 0.35).mul(amax)))).mul(amax).toVar();
				const D = diffuseColor;
				D.rgb.assign(mix(D.rgb, D.rgb.mul(0.7).add(vec3(0.04, 0.05, 0.06)), drop.mul(0.5)));
				D.rgb.assign(mix(D.rgb, vec3(0.02), rim.mul(0.45)));
				D.rgb.addAssign(vec3(0.75, 0.8, 0.85).mul(hl).mul(0.55));
				D.rgb.assign(mix(D.rgb, vec3(0.55, 0.6, 0.66), cov.mul(0.06)));
				const film = wgE.mul(clamp(uWR.div(2.5), 0.0, 1.0)).toVar();
				D.rgb.assign(mix(D.rgb, D.rgb.mul(0.55).add(vec3(0.12, 0.14, 0.16)), film.mul(0.75)));
				D.rgb.addAssign(vec3(0.5, 0.55, 0.6).mul(film).mul(smoothstep(0.5, 1.0, wgE)).mul(0.25));
				D.a.assign(clamp(D.a.add(film.mul(0.4)), 0.0, 1.0));
				D.a.assign(clamp(D.a.add(drop.mul(0.12)).add(rim.mul(0.25)).add(hl.mul(0.35)).add(cov.mul(0.05)), 0.0, 1.0));
				const sCov = exp(sa.negate()).oneMinus().toVar();
				const sn = wgN(qS.mul(7.0)).mul(0.6).add(wgN(qS.mul(21.0)).mul(0.4));
				const snow = smoothstep(sCov.oneMinus(), sCov.oneMinus().add(0.18), sn).mul(step(0.01, sa)).toVar();
				D.rgb.assign(mix(D.rgb, vec3(0.92, 0.94, 0.98), snow));
				D.a.assign(max(D.a, snow.mul(0.93)));
				If(uFrost.greaterThan(0.01), () => {
					const fq = qS.mul(9.0).toVar();
					const fw = wgN(fq.mul(0.5).add(3.7)).toVar();
					const fern = abs(wgN(fq.mul(2.3).add(fw.mul(2.0))).mul(2.0).sub(1.0)).oneMinus().toVar();
					const crys = fern.mul(fern).mul(0.55).add(wgN(fq.mul(6.0)).mul(0.3)).add(fw.mul(0.15));
					const reach = float(1e3).toVar();
					for (let i = 0; i < 2; i++) {
						const dd = vWG.sub(uWP.element(i));
						reach.assign(min(reach, length(vec2(dot(dd, uWU.element(i)), dot(dd, uWV.element(i))))));
					}
					const thawFront = nsm(uDefrost.sub(0.1), uDefrost.add(0.2), reach.add(wgN(qS.mul(3.0)).sub(0.5).mul(0.3)));
					const thaw = select(sideG, wgN(qS.mul(1.4).add(5.0)).mul(0.6).add(0.2), thawFront);
					const fcov = uFrost.mul(0.42).mul(thaw.oneMinus()).toVar();
					const frost = smoothstep(fcov.oneMinus(), fcov.oneMinus().add(0.22), crys).mul(step(0.02, fcov)).toVar();
					D.rgb.assign(mix(D.rgb, vec3(0.84, 0.89, 0.95), frost.mul(0.6)));
					D.a.assign(max(D.a, frost.mul(0.45)));
				});
				// normalna szyby zgięta przez powierzchnię kropli (osie szyby – oś pierwszej wycieraczki, w układzie widoku)
				let n = normalViewGeometry;
				if (side === THREE.DoubleSide) n = n.mul(faceDirection);
				else if (side === THREE.BackSide) n = n.negate();
				nOut.assign(n);
				If(drop.greaterThan(0.01), () => {
					const tU = normalize(cameraViewMatrix.mul(vec4(uWU.element(0), 0)).xyz), tV = normalize(cameraViewMatrix.mul(vec4(uWV.element(0), 0)).xyz);
					nOut.assign(normalize(nOut.add(tU.mul(dn.x).add(tV.mul(dn.y)).mul(0.9))));
				});
			},
		});
		nodeProps(m, { normalNode: nOut });
		return m;
	}

	// pierścienie horyzontu (horizon.js): kolor mieszany z mgłą wg atrybutu shade; uniforms – te same obiekty co w GLSL
	function horizonMaterial(uniforms) {
		const m = new MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
		const k = reference('value', 'float', uniforms.k);
		// (z niebem z atmosfery – kolor mgły w kierunku punktu, jak teren przed nim; sky-gpu.js)
		const haze = NS.skyGpu ? NS.skyGpu.fogColor : reference('value', 'color', uniforms.haze);
		m.colorNode = mix(haze, reference('value', 'color', uniforms.col), k.oneMinus().mul(attribute('shade', 'float').mul(0.65).add(0.35)));
		m.uniforms = uniforms;
		return m;
	}

	NS.nodes = { sync, patch, extend, wetGlass, personHooks, driftHooks, interior, waterMaterial, waterReflector, setupCascades, createEnvironment, horizonMaterial, cloudShadow, gHash, gNoise, gPerlin, gFbm, gStones, uniforms: { uTime, uWind, uWet, uSnow, uRain, uWear, uNightK, uNightBox } };
})();
