/* Opady w trybie WebGPU (etap 5) – odpowiedniki shaderów GLSL z weather.js w TSL, z tymi samymi uniformami (obiekty
   { value } materiału – Weather.update ustawia je jak dotąd):
   - deszcz: odcinki (LineSegments, dwa wierzchołki na kroplę – smuga pochylona z wiatrem), pozycja z czasu i ziarna
     cząstki w prostopadłościanie wokół widoku (bez pracy procesora), bez opadu w wagonach najbliżej kamery;
   - śnieg i liście: punkty większe niż piksel – w WebGPU jako instancje kwadratu (Sprite + PointsNodeMaterial; WebGPU nie
     ma punktów o rozmiarze), wirowanie płatków, obracany owal liścia;
   - rozbryzgi kropel na ziemi (rozszerzający się krążek) i śnieg wzbijany przez pociąg (pozycje liczone na procesorze –
     te same tablice co w WebGL, jako atrybuty instancji). */
import * as THREE from 'three';
import { LineBasicNodeMaterial, PointsNodeMaterial } from 'three/webgpu';
import {
	Fn, float, vec2, vec3, vec4, uniform, reference, attribute, instancedBufferAttribute, varying, uv, mix, smoothstep, step,
	fract, floor, sin, cos, abs, max, min, clamp, length, positionGeometry, cameraViewMatrix, screenDPR, select,
} from 'three/tsl';

(function () {
	'use strict';
	const NS = (window.Train3D = window.Train3D || {});
	const ref = (U, k, type) => reference('value', type, U[k]);
	const pmod = (x, y) => x.sub(floor(x.div(y)).mul(y)); // jak mod w GLSL (dodatni)
	const nsm = (a, b, x) => smoothstep(a, b, x).oneMinus();

	/* pozycja cząstki (świat) z pozycji startowej w [0,1)³ i ziarna; snow – wirowanie płatków; zwraca też widoczność vA
	   (zanik przy brzegach pudła i tuż przy kamerze, wnętrza wagonów) i odległość od kamery */
	function particle(U, pos01, seed, aEnd, snow) {
		// (same wyrażenia, bez przypisań – węzły materiału budowane poza Fn)
		const uT = ref(U, 'uT', 'float'), center = ref(U, 'uCenter', 'vec3'), box = ref(U, 'uBox', 'vec3'), speed = ref(U, 'uSpeed', 'float');
		const driftU = ref(U, 'uDrift', 'vec2'), windK = ref(U, 'uWindK', 'float'), len = ref(U, 'uLen', 'float'), cars = ref(U, 'uCars', 'float');
		const hb = box.mul(0.5);
		const sp = seed.mul(0.5).add(0.75);
		const drift = driftU.mul(windK.add(0.4));
		let swirl = vec2(0);
		if (snow) {
			const a = uT.mul(seed.add(0.9)).add(seed.mul(40));
			swirl = vec2(sin(a).add(sin(a.mul(2.3).add(1.7)).mul(0.5)), cos(a.mul(0.8)).add(cos(a.mul(1.9)).mul(0.5))).mul(windK.mul(1.4).add(0.6));
		}
		const p0 = pos01.mul(box);
		const pxz = p0.xz.add(drift.mul(uT).mul(sp)).add(swirl);
		const p1 = vec3(pxz.x, p0.y.sub(uT.mul(speed).mul(sp)), pxz.y);
		const w0 = center.add(pmod(p1.sub(center).add(hb), box)).sub(hb);
		// bryły wagonów najbliżej kamery (świat → układ wagonu, połowa wymiarów): wewnątrz pojazdu nie pada
		let inside = float(0);
		for (let i = 0; i < 8; i++) {
			const l = uniform(U.uCar.value[i]).mul(vec4(w0, 1)).xyz;
			const h = uniform(U.uCarH.value[i]);
			const inBox = abs(l.x).lessThan(h.x).and(abs(l.y.sub(h.y)).lessThan(h.y)).and(abs(l.z).lessThan(h.z)).and(cars.greaterThan(i + 0.5));
			inside = max(inside, select(inBox, float(1), float(0)));
		}
		const w = aEnd ? w0.add(vec3(drift.x.negate(), speed, drift.y.negate()).mul(seed.mul(0.035).add(0.025)).mul(aEnd).mul(len)) : w0;
		const depth = max(0.5, cameraViewMatrix.mul(vec4(w, 1)).z.negate());
		const q = abs(w.sub(center)).div(hb);
		const vA = nsm(0.7, 1.0, max(q.x, q.z)).mul(nsm(0.85, 1.0, q.y)).mul(smoothstep(1.2, 4.0, depth)).mul(fract(seed.mul(37)).mul(0.45).add(0.55)).mul(inside.oneMinus());
		return { w, vA, depth };
	}

	/* atrybuty cząstek jako atrybuty instancji (te same tablice; w geometrii podmienione – Weather.updateKick ustawia
	   needsUpdate na nich) */
	function inst(geometry, name, type) {
		let a = geometry.attributes[name];
		if (!a.isInstancedBufferAttribute) {
			const ia = new THREE.InstancedBufferAttribute(a.array, a.itemSize);
			ia.setUsage(a.usage);
			geometry.setAttribute(name, ia);
			a = ia;
		}
		return instancedBufferAttribute(a, type);
	}

	// deszcz: odcinki (atrybuty wierzchołków jak w WebGL – position, aEnd, aSeed)
	function rainMaterial(U) {
		const seed = attribute('aSeed', 'float');
		const P = particle(U, positionGeometry, seed, attribute('aEnd', 'float'), false);
		const m = new LineBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
		m.positionNode = P.w;
		const vA = varying(P.vA, 'vRainA'), vS = varying(seed, 'vRainS');
		m.colorNode = ref(U, 'uColor', 'color').mul(ref(U, 'uLight', 'float')).mul(vS.mul(0.5).add(0.75));
		m.opacityNode = ref(U, 'uOpacity', 'float').mul(vA);
		m.uniforms = U;
		return m;
	}

	// śnieg i liście: instancje kwadratu (Sprite.count) – ziarno i pozycja startowa jako atrybuty instancji
	function flakeSprite(U, geometry, leaf) {
		const pos01 = inst(geometry, 'position', 'vec3');
		const seed = inst(geometry, 'aSeed', 'float');
		const P = particle(U, pos01, seed, null, true);
		const m = new PointsNodeMaterial({ transparent: true, depthWrite: false, fog: false, sizeAttenuation: false });
		m.positionNode = P.w;
		/* rozmiar w pikselach bufora jak gl_PointSize (PointsNodeMaterial mnoży przez gęstość pikseli); najmniej 2 px –
		   punkt GLSL o 1,2 px rasteryzuje się jak ostry piksel, kwadrat z miękkim krążkiem tej wielkości byłby niewidoczny */
		const px = clamp(ref(U, 'uSize', 'float').mul(seed.mul(0.9).add(0.55)).mul(60).div(P.depth), 2.0, 16.0);
		m.sizeNode = px.div(screenDPR);
		const vPx = varying(px, leaf ? 'vLeafPx' : 'vSnowPx');
		const vA = varying(P.vA, leaf ? 'vLeafA' : 'vSnowA'), vS = varying(seed, leaf ? 'vLeafS' : 'vSnowS');
		const uLight = ref(U, 'uLight', 'float'), uOpacity = ref(U, 'uOpacity', 'float'), uT = ref(U, 'uT', 'float');
		const c = uv().sub(0.5);
		if (leaf) {
			// spadający liść: obracany owal (wirowanie z ziarna i czasu), jesienne kolory
			const an = vS.mul(40).add(uT.mul(vS.mul(2.5).add(1.2)));
			const cr = vec2(c.x.mul(cos(an)).add(c.y.mul(sin(an))), c.x.mul(sin(an).negate()).add(c.y.mul(cos(an))));
			const e = length(cr.mul(vec2(1.0, abs(sin(an.mul(0.7))).mul(1.4).add(2.1))));
			const col = mix(mix(vec3(0.78, 0.5, 0.12), vec3(0.58, 0.24, 0.08), fract(vS.mul(13))), vec3(0.82, 0.7, 0.2), step(0.7, fract(vS.mul(7))));
			m.colorNode = col.mul(uLight).mul(fract(vS.mul(5)).mul(0.3).add(0.8));
			m.opacityNode = uOpacity.mul(vA).mul(nsm(0.34, 0.42, e));
		} else {
			// płatek: miękki krążek z jaśniejszym środkiem
			const r = length(c);
			m.colorNode = ref(U, 'uColor', 'color').mul(uLight).mul(vS.mul(0.5).add(0.75));
			// (małe płatki – prawie pełny kwadrat: krążek o średnicy 2–3 px i tak wygląda jak punkt)
			const soft = mix(float(1), nsm(0.2, 0.5, r), smoothstep(2.5, 5.0, vPx));
			m.opacityNode = uOpacity.mul(vA).mul(soft).mul(nsm(0.0, 0.25, r).mul(0.3).add(0.7));
		}
		m.uniforms = U;
		const s = new THREE.Sprite(m);
		s.count = geometry.attributes.aSeed.count;
		s.userData.particleGeometry = geometry;
		return s;
	}

	// rozbryzgi kropel na ziemi: rozszerzający się krążek (cykl ok. 0,3 s, w każdym cyklu nowe miejsce)
	function splashSprite(U, geometry) {
		const seed = inst(geometry, 'aSeed', 'float');
		const uT = ref(U, 'uT', 'float'), center = ref(U, 'uCenter', 'vec3'), R = ref(U, 'uR', 'float'), ground = ref(U, 'uGround', 'float');
		const h = (n) => fract(sin(n.mul(127.1)).mul(43758.5453));
		const cyc = uT.mul(seed.add(2.6)).add(seed.mul(13));
		const id = floor(cyc), ph = fract(cyc);
		const o = vec2(h(id.add(seed.mul(91))), h(id.mul(1.7).add(seed.mul(53)))).sub(0.5).mul(2).mul(R);
		const w = vec3(center.x.add(o.x), ground, center.z.add(o.y));
		const mvz = cameraViewMatrix.mul(vec4(w, 1)).z;
		const m = new PointsNodeMaterial({ transparent: true, depthWrite: false, fog: false, sizeAttenuation: false });
		m.positionNode = w;
		m.sizeNode = clamp(ph.mul(26).add(4).mul(6).div(max(1.0, mvz.negate())), 1.0, 22.0).div(screenDPR);
		const vPh = varying(ph, 'vSplashPh');
		const c = uv().sub(0.5).mul(vec2(1.0, 2.6));
		const ring = nsm(0.0, 0.08, abs(length(c).sub(vPh.mul(0.42)).sub(0.05)));
		m.colorNode = vec3(0.85, 0.9, 0.95).mul(ref(U, 'uLight', 'float'));
		m.opacityNode = ring.mul(vPh.oneMinus()).mul(ref(U, 'uOpacity', 'float'));
		m.uniforms = U;
		const s = new THREE.Sprite(m);
		s.count = geometry.attributes.aSeed.count;
		s.userData.particleGeometry = geometry;
		return s;
	}

	// śnieg spod pociągu: pozycje i wiek z procesora (Weather.updateKick – te same tablice, atrybuty instancji)
	function kickSprite(U, geometry) {
		const pos = inst(geometry, 'position', 'vec3');
		const life = inst(geometry, 'aLife', 'float');
		const mvz = cameraViewMatrix.mul(vec4(pos, 1)).z;
		const m = new PointsNodeMaterial({ transparent: true, depthWrite: false, fog: false, sizeAttenuation: false });
		m.positionNode = pos;
		m.sizeNode = clamp(life.oneMinus().mul(1.4).add(0.4).mul(ref(U, 'uScale', 'float')).div(max(0.5, mvz.negate())), 0.0, 120.0).div(screenDPR);
		const vL = varying(life, 'vKickL');
		m.colorNode = vec3(0.93, 0.95, 1.0).mul(ref(U, 'uLight', 'float'));
		m.opacityNode = nsm(0.1, 0.5, length(uv().sub(0.5))).mul(vL).mul(vL).mul(ref(U, 'uOpacity', 'float'));
		m.uniforms = U;
		const s = new THREE.Sprite(m);
		s.count = geometry.attributes.aLife.count;
		s.userData.particleGeometry = geometry;
		return s;
	}

	NS.weatherGpu = { rainMaterial, flakeSprite, splashSprite, kickSprite };
})();
