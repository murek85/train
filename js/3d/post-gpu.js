/* Efekty po renderowaniu w trybie WebGPU – odpowiednik post.js (te same przebiegi, wzory i ustawienia) w TSL:
   scena do bufora HDR (połowa precyzji) z teksturą głębi, potem przebiegi pełnoekranowe (QuadMesh + NodeMaterial):
   - okluzja otoczenia z głębi w połowie rozdzielczości (GTAO – kąty horyzontu w 3 przekrojach) i rozmycie 3 × 3
     z progiem głębi; nakładana w materiałach na światło rozproszone (w następnej klatce, z reprojekcją), nie w wykończeniu;
   - bloom: jasne (ponad próg) → łańcuch 5 coraz mniejszych kopii w dół i z powrotem w górę (dodawanie);
   - promienie słońca: jasne niebo wokół słońca (gdzie nic go nie zasłania) rozmyte promieniście ku słońcu – jasność
     z obrazu nieba (chmury przy słońcu zasłaniają, prześwity i rozświetlone brzegi chmur dają smugi);
   - wykończenie: mgła wysokościowa (całka gęstości malejącej z wysokością wzdłuż promienia, cieplejsza ku
     słońcu), promienie, bloom, ekspozycja, ACES (dopasowanie Hilla), nasycenie i odcień cieni / świateł, sRGB, kontrast,
     winieta, szum przeciw pasmom; na końcu FXAA, gdy w ustawieniach jest wygładzanie.
   Scena bez MSAA: WebGPU nie scala głębi wielu próbek, a z głębi biorą okluzja, mgła i promienie – wygładza FXAA.
   Renderer: bez własnego tone mappingu i konwersji barw (scene.js) – wykończenie zapisuje gotowe sRGB na płótno.
   Użycie jak post.js: post.setSize(w, h, msaa); post.render(scene, camera, settings). */
import * as THREE from 'three';
import { RenderTarget, QuadMesh, NodeMaterial } from 'three/webgpu';
import {
	Fn, float, vec2, vec3, vec4, uniform, texture, uv, select, mix, smoothstep, step, max, min, clamp, pow, exp, abs, dot,
	cross, normalize, length, fract, sin, cos, sqrt, dFdx, dFdy, screenCoordinate, getViewPosition, getScreenPosition,
	If, sign, acos, positionWorld, positionView, screenUV, cameraPosition, distance, context, roughness, metalness,
	normalView, positionViewDirection, reflect,
} from 'three/tsl';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

(function () {
	'use strict';
	const NS = (window.Train3D = window.Train3D || {});

	function createPostGPU(renderer) {
		const LEVELS = 5;
		let width = 1, height = 1, aa = 0, built = false;
		/* TAA (wygładzanie czasowe): taa – włączone; scena rysowana z kamerą przesuniętą co klatkę o ułamek piksela
		   (ciąg Haltona 2, 3); przebieg rozwiązania łączy bieżącą klatkę z historią w miejscu, gdzie ten punkt świata był
		   w poprzedniej klatce (reprojekcja z głębi i macierzy kamery – bez bufora ruchu: węzeł velocity z three nie
		   współpracuje z paczkami rysowania), historia przycięta do zakresu kolorów sąsiadów (bez smug, także na
		   obiektach ruchomych względem świata – pociąg, auta) */
		let taa = false, taaJ = 0, taaFresh = true;
		const HALTON = Array.from({ length: 16 }, (_, i) => {
			const h = (b, n) => { let f = 1, r = 0; for (let k = n + 1; k > 0; k = Math.floor(k / b)) { f /= b; r += f * (k % b); } return r; };
			return [h(2, i), h(3, i)];
		});
		const prevVP = new THREE.Matrix4();
		const half = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
		let aoValid = false, version = 0;
		let sceneTarget, aoTarget, aoBlurTarget, raysA, raysB, finishTarget, aaTarget, taaTarget, histTarget, ssrTarget;
		const mips = [];
		// węzły tekstur (wartości podmieniane po zmianie rozmiaru buforów)
		const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
		blank.needsUpdate = true;
		const T = { color: texture(blank), depth: texture(blank), ao: texture(blank), aoBlur: texture(blank), raysA: texture(blank), raysB: texture(blank), bloom: texture(blank), finish: texture(blank), aa: texture(blank), taa: texture(blank), hist: texture(blank), ssr: texture(blank) };
		const mipTex = Array.from({ length: LEVELS }, () => texture(blank));

		function build() {
			for (const t of [sceneTarget, aoTarget, raysA, raysB, finishTarget, aaTarget, taaTarget, histTarget, ssrTarget, ...mips]) t?.dispose();
			sceneTarget?.depthTexture?.dispose();
			sceneTarget = new RenderTarget(width, height, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
			sceneTarget.depthTexture = new THREE.DepthTexture(width, height);
			sceneTarget.depthTexture.type = THREE.FloatType;
			const hw = Math.max(1, width >> 1), hh = Math.max(1, height >> 1);
			aoTarget = new RenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
			/* (r – okluzja, g – odległość od kamery wzdłuż osi widoku: sprawdzenie reprojekcji w materiałach). Ten sam obiekt
			   przez całą grę, tylko nowy rozmiar: tekstura jest w powiązaniach materiałów świata (okluzja w kontekście
			   renderera) – nowa tekstura w miejsce zwolnionej nie docierała do nich („zniszczona tekstura użyta w wysyłce”) */
			if (aoBlurTarget) aoBlurTarget.setSize(hw, hh);
			else aoBlurTarget = new RenderTarget(hw, hh, half);
			aoValid = false;
			mips.length = 0;
			for (let i = 0; i < LEVELS; i++) mips.push(new RenderTarget(Math.max(1, width >> (i + 1)), Math.max(1, height >> (i + 1)), half));
			raysA = new RenderTarget(hw, hh, half);
			raysB = new RenderTarget(hw, hh, half);
			ssrTarget = new RenderTarget(hw, hh, half);
			finishTarget = new RenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
			aaTarget = new RenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
			taaTarget = taa ? new RenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }) : null;
			histTarget = taa ? new RenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }) : null;
			taaFresh = true;
			T.color.value = sceneTarget.texture;
			T.depth.value = sceneTarget.depthTexture;
			T.ao.value = aoTarget.texture;
			T.aoBlur.value = aoBlurTarget.texture;
			aoMap.value = aoBlurTarget.texture;
			version++;
			T.raysA.value = raysA.texture;
			T.raysB.value = raysB.texture;
			T.ssr.value = ssrTarget.texture;
			T.bloom.value = mips[0].texture;
			T.finish.value = finishTarget.texture;
			T.aa.value = aaTarget.texture;
			T.taa.value = taa ? taaTarget.texture : blank;
			T.hist.value = taa ? histTarget.texture : blank;
			mips.forEach((m, i) => { mipTex[i].value = m.texture; });
			built = true;
		}

		const quad = new QuadMesh();
		function pass(material, target, clear = true) {
			quad.material = material;
			renderer.setRenderTarget(target);
			const ac = renderer.autoClear;
			renderer.autoClear = clear;
			quad.render(renderer);
			renderer.autoClear = ac;
		}
		const material = (node, extra) => {
			const m = new NodeMaterial();
			m.fragmentNode = node;
			m.depthTest = false;
			m.depthWrite = false;
			if (extra) Object.assign(m, extra);
			return m;
		};
		const hash = (p) => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
		// (NaN ≠ NaN – piksel nie-liczba z któregokolwiek shadera nie rozlewa się po rozmyciu)
		const finite = (c) => select(c.x.equal(c.x).and(c.y.equal(c.y)).and(c.z.equal(c.z)).and(c.x.lessThan(1e30)).and(c.y.lessThan(1e30)).and(c.z.lessThan(1e30)), c, vec3(0));

		// ---------- okluzja otoczenia ----------
		const U = {
			projInv: uniform(new THREE.Matrix4()), proj: uniform(new THREE.Matrix4()), camWorld: uniform(new THREE.Matrix4()), camPos: uniform(new THREE.Vector3()),
			aoRadius: uniform(26), aoStrength: uniform(1.6), projScale: uniform(new THREE.Vector2(1, 1)), ssrSeed: uniform(0), aoFade: uniform(3000), aoNear: uniform(0), aoTexel: uniform(new THREE.Vector2()),
			texel: uniform(new THREE.Vector2()), upWeight: uniform(0.9), threshold: uniform(1.2), knee: uniform(0.8),
			sunDir: uniform(new THREE.Vector3(0, 1, 0)), sunColor: uniform(new THREE.Color()), raysColor: uniform(new THREE.Color()), raysRef: uniform(2.0), sunUv: uniform(new THREE.Vector2()), spread: uniform(0.9),
			aoOn: uniform(0), ssrOn: uniform(0), bloomOn: uniform(0), bloomStrength: uniform(0.35), exposure: uniform(1), saturation: uniform(1.08), contrast: uniform(1.06),
			shadowTint: uniform(new THREE.Color(0.97, 0.99, 1.04)), lightTint: uniform(new THREE.Color(1.03, 1.0, 0.96)), vignette: uniform(0.28), aspect: uniform(1), grade: uniform(1),
			atmoOn: uniform(0), hazeColor: uniform(new THREE.Color()), fogBase: uniform(0), fogDensity: uniform(0), fogFalloff: uniform(0.01), raysOn: uniform(0),
		};
		const viewPos = (p) => getViewPosition(p, T.depth.sample(p).x, U.projInv);
		/* GTAO (okluzja horyzontu, Jimenez 2016): w 3 przekrojach przez piksel (kierunki ekranu obracane szumem) po obu
		   stronach szukany najwyższy punkt sąsiedztwa w promieniu aoRadius – kąt horyzontu; widoczność to całka
		   cosinusowa nieba ponad horyzontami w płaszczyźnie przekroju, z normalną rzutowaną na przekrój (pochyła ściana
		   i stok – poprawnie, bez szarego płaskiego terenu). Dawniej 16 próbek w półkuli: zaciemnienie skokowe
		   i „aureole” wokół krawędzi. Normalna z głębi – z tej strony piksela, gdzie głębia ciągła (bez aureol na
		   krawędziach obiektów) */
		const aoNormal = (st, P) => {
			const tx = vec2(U.aoTexel.x.mul(0.5), 0), ty = vec2(0, U.aoTexel.y.mul(0.5));
			const pr = viewPos(st.add(tx)), pl = viewPos(st.sub(tx)), pu = viewPos(st.add(ty)), pd = viewPos(st.sub(ty));
			const dx = select(abs(pr.z.sub(P.z)).lessThan(abs(P.z.sub(pl.z))), pr.sub(P), P.sub(pl));
			const dy = select(abs(pu.z.sub(P.z)).lessThan(abs(P.z.sub(pd.z))), pu.sub(P), P.sub(pd));
			const n = normalize(cross(dy, dx)).toVar();
			return select(dot(n, P).greaterThan(0), n.negate(), n);
		};
		const SLICES = 3, STEPS = 6;
		const aoMat = material(Fn(() => {
			const st = uv().toVar();
			const d = T.depth.sample(st).x.toVar();
			const P = getViewPosition(st, d, U.projInv).toVar();
			const N = aoNormal(st, P).toVar();
			const V = normalize(P.negate()).toVar();
			const noise = hash(screenCoordinate.xy).toVar(), jit = hash(screenCoordinate.xy.add(17.3)).toVar();
			// promień w ekranie (uv) – dla bliskich punktów ograniczony (koszt i pamięć podręczna tekstur)
			const rUV = vec2(U.projScale.x, U.projScale.y).mul(U.aoRadius.mul(0.5).div(max(P.z.negate(), 0.1))).toVar();
			const lim = min(0.12, max(rUV.x, rUV.y)).div(max(max(rUV.x, rUV.y), 1e-5));
			rUV.mulAssign(lim);
			const vis = float(0).toVar();
			for (let i = 0; i < SLICES; i++) {
				const phi = noise.add(i).mul(Math.PI / SLICES);
				const dir = vec2(cos(phi), sin(phi)).toVar();
				const dv = vec3(dir, 0);
				const axis = normalize(cross(dv, V)).toVar();
				const ortho = dv.sub(V.mul(dot(dv, V)));
				const pN = N.sub(axis.mul(dot(N, axis))).toVar();
				const pLen = max(length(pN), 1e-4).toVar();
				const cosN = clamp(dot(pN, V).div(pLen), 0, 1);
				const n = sign(dot(ortho, pN)).mul(acos(cosN)).toVar();
				const h = [];
				for (const side of [-1, 1]) {
					const hc = float(-1).toVar();
					for (let j = 0; j < STEPS; j++) {
						const s = jit.add(j).div(STEPS);
						// (y uv w dół – przeciwnie do osi y widoku)
						const o = vec2(dir.x, dir.y.negate()).mul(rUV).mul(s.mul(s).mul(side));
						const S = viewPos(st.add(o));
						const dl = S.sub(P).toVar();
						const len = max(length(dl), 1e-4);
						const fall = smoothstep(U.aoRadius, U.aoRadius.mul(0.6), len);
						hc.assign(max(hc, mix(float(-1), dot(dl, V).div(len), fall)));
					}
					h.push(hc);
				}
				const h0 = n.add(max(acos(h[0]).negate().sub(n), -Math.PI / 2));
				const h1 = n.add(min(acos(h[1]).sub(n), Math.PI / 2));
				const sinN = sin(n), arc = (x) => cos(x.mul(2).sub(n)).negate().add(cosN).add(x.mul(2).mul(sinN)).mul(0.25);
				vis.addAssign(pLen.mul(arc(h0).add(arc(h1))));
			}
			const occ = clamp(vis.div(SLICES), 0, 1).oneMinus().toVar();
			occ.mulAssign(smoothstep(U.aoFade.mul(0.6), U.aoFade, P.z.negate()).oneMinus());
			// (widok z kabiny: bez okluzji na wnętrzu kabiny – aoNear, tylko świat za szybą)
			occ.mulAssign(smoothstep(U.aoNear, U.aoNear.mul(1.6).add(0.01), P.z.negate()));
			const v = pow(clamp(occ.oneMinus(), 0, 1), U.aoStrength);
			return select(d.greaterThanEqual(0.99999), vec4(1), vec4(vec3(v), 1));
		})());
		const aoBlurMat = material(Fn(() => {
			const st = uv().toVar();
			const d0 = T.depth.sample(st).x.toVar();
			const sum = float(0).toVar(), w = float(0).toVar();
			for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
				const o = vec2(x, y).mul(U.aoTexel).mul(1.5);
				const k = float(1).div(abs(T.depth.sample(st.add(o)).x.sub(d0)).mul(4000).add(1));
				sum.addAssign(T.ao.sample(st.add(o)).r.mul(k));
				w.addAssign(k);
			}
			return vec4(sum.div(w), getViewPosition(st, d0, U.projInv).z.negate(), 0, 1);
		})());

		// ---------- odbicia ekranowe (SSR) ----------
		/* odbicia z obrazu: piksele z maską odbicia (kanał alfa sceny – gładkość i Fresnel z materiałów, getOutput niżej)
		   śledzą promień odbity w przestrzeni widoku (24 kroki coraz dłuższe, potem 4 kroki połowienia) po buforze głębi;
		   trafienie – kolor sceny w tym miejscu, pewność gaśnie przy brzegach kadru, z odległością i dla promieni ku
		   kamerze. Normalna z głębi (jak AO) – mokra jezdnia odbija jak lustro, rozmycie daje połowa rozdzielczości i TAA */
		const ssrMat = material(Fn(() => {
			const st = uv().toVar();
			const d = T.depth.sample(st).x.toVar();
			const mask = clamp(T.color.sample(st).a, 0, 1).toVar();
			const P = getViewPosition(st, d, U.projInv).toVar();
			const N = aoNormal(st, P).toVar();
			const Rd = normalize(reflect(normalize(P), N)).toVar();
			const jit = hash(screenCoordinate.xy.add(U.ssrSeed)).toVar();
			const maxD = clamp(P.z.negate().mul(0.9), 6, 90).toVar();
			const found = float(0).toVar(), tLo = float(0).toVar(), tHi = maxD.toVar(), tPrev = float(0).toVar();
			const STEPS = 24;
			for (let i = 0; i < STEPS; i++) {
				const f = jit.add(i).div(STEPS);
				const t = maxD.mul(pow(f, 1.6)).toVar();
				const Q = P.add(Rd.mul(t)).toVar();
				const q = getScreenPosition(Q, U.proj);
				const sz = viewPos(q).z;
				const thick = t.mul(0.08).add(0.3);
				const hit = Q.z.lessThan(sz).and(sz.sub(Q.z).lessThan(thick)).and(Q.z.lessThan(-0.05)).and(found.lessThan(0.5));
				If(hit, () => {
					found.assign(1);
					tLo.assign(tPrev);
					tHi.assign(t);
				});
				tPrev.assign(t);
			}
			for (let i = 0; i < 4; i++) {
				const tm = tLo.add(tHi).mul(0.5).toVar();
				const Q = P.add(Rd.mul(tm));
				const sz = viewPos(getScreenPosition(Q, U.proj)).z;
				const behind = Q.z.lessThan(sz);
				tHi.assign(select(behind, tm, tHi));
				tLo.assign(select(behind, tLo, tm));
			}
			const hUV = getScreenPosition(P.add(Rd.mul(tHi)), U.proj).toVar();
			const edge = smoothstep(0, 0.06, hUV.x).mul(smoothstep(0, 0.06, hUV.y)).mul(smoothstep(1, 0.94, hUV.x)).mul(smoothstep(1, 0.94, hUV.y));
			const conf = found.mul(edge).mul(smoothstep(1, 0.6, tHi.div(maxD))).mul(smoothstep(0.9, 0.3, Rd.z))
				.mul(step(0.02, mask)).mul(step(d, 0.99999)).mul(step(T.depth.sample(hUV).x, 0.99999));
			const col = min(finite(T.color.sample(hUV).rgb), vec3(32));
			return vec4(col, conf);
		})());

		// ---------- bloom ----------
		const brightMat = material(Fn(() => {
			const st = uv(), t = U.texel;
			const c = finite(T.color.sample(st.add(t.mul(vec2(-0.5, -0.5)))).rgb.add(T.color.sample(st.add(t.mul(vec2(0.5, -0.5)))).rgb)
				.add(T.color.sample(st.add(t.mul(vec2(-0.5, 0.5)))).rgb).add(T.color.sample(st.add(t.mul(vec2(0.5, 0.5)))).rgb).mul(0.25)).toVar();
			const l = max(c.r, max(c.g, c.b));
			return vec4(min(c.mul(smoothstep(U.threshold, U.threshold.add(U.knee), l)), vec3(16)), 1);
		})());
		const downMats = [], upMats = [];
		for (let i = 0; i < LEVELS; i++) {
			const src = mipTex[i];
			downMats.push(material(Fn(() => {
				const st = uv(), t = U.texel;
				const c = src.sample(st).rgb.mul(0.5)
					.add(src.sample(st.add(t.mul(vec2(-1, -1)))).rgb.add(src.sample(st.add(t.mul(vec2(1, -1)))).rgb)
						.add(src.sample(st.add(t.mul(vec2(-1, 1)))).rgb).add(src.sample(st.add(t.mul(vec2(1, 1)))).rgb).mul(0.125));
				return vec4(c, 1);
			})()));
			upMats.push(material(Fn(() => {
				const st = uv(), t = U.texel;
				const c = src.sample(st).rgb.mul(4)
					.add(src.sample(st.add(vec2(t.x, 0))).rgb.add(src.sample(st.sub(vec2(t.x, 0))).rgb).add(src.sample(st.add(vec2(0, t.y))).rgb).add(src.sample(st.sub(vec2(0, t.y))).rgb).mul(2))
					.add(src.sample(st.add(t)).rgb).add(src.sample(st.sub(t)).rgb).add(src.sample(st.add(vec2(t.x, t.y.negate()))).rgb).add(src.sample(st.add(vec2(t.x.negate(), t.y))).rgb);
				return vec4(c.div(16).mul(U.upWeight), 1);
			})(), { blending: THREE.AdditiveBlending, transparent: true }));
		}

		// ---------- promienie słońca ----------
		const raysMaskMat = material(Fn(() => {
			const st = uv().toVar();
			const d = T.depth.sample(st).x;
			const far = getViewPosition(st, float(1), U.projInv);
			const rd = normalize(U.camWorld.mul(vec4(far, 0)).xyz).toVar();
			const s = max(dot(rd, U.sunDir), 0.0).toVar();
			/* jasność nieba w tym miejscu obrazu (z chmurami) względem typowej jasności czystego nieba przy słońcu (raysRef,
			   pomiar HDR ok. 2,4): chmura przed słońcem gasi promienie, prześwity i jasne brzegi chmur dają smugi; dawniej
			   sam wzór wokół słońca – promienie także przez gęste chmury */
			const sky = min(finite(T.color.sample(st).rgb), vec3(8));
			const k = clamp(dot(sky, vec3(0.2126, 0.7152, 0.0722)).div(U.raysRef), 0, 1.5);
			const c = U.raysColor.mul(pow(s, 24.0).mul(2.0).add(pow(s, 6.0).mul(0.25))).mul(smoothstep(-0.02, 0.06, rd.y)).mul(k);
			return select(d.lessThan(0.99999), vec4(0, 0, 0, 1), vec4(c, 1));
		})());
		const raysBlurMat = material(Fn(() => {
			const st = uv().toVar();
			const stepv = U.sunUv.sub(st).mul(U.spread).div(40).toVar();
			const sum = vec3(0).toVar();
			let w = 1;
			for (let i = 0; i < 40; i++) {
				sum.addAssign(T.raysA.sample(st.add(stepv.mul(i))).rgb.mul(w));
				w *= 0.965;
			}
			return vec4(sum.div(16), 1);
		})());

		// ---------- wykończenie ----------
		// ACES – dopasowanie Stephena Hilla (wejście i wyjście w liniowym sRGB); macierze jak w GLSL (kolumnami)
		const mat3mul = (c, a, b, d) => vec3(a[0], a[1], a[2]).mul(c.x).add(vec3(b[0], b[1], b[2]).mul(c.y)).add(vec3(d[0], d[1], d[2]).mul(c.z));
		const aces = (c0) => {
			const c = mat3mul(c0, [0.59719, 0.076, 0.0284], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]).toVar();
			const r = c.mul(c.add(0.0245786)).sub(0.000090537).div(c.mul(c.mul(0.983729).add(0.432951)).add(0.238081));
			return clamp(mat3mul(r, [1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]), 0, 1);
		};
		const srgb = (c) => mix(c.mul(12.92), pow(c, vec3(1 / 2.4)).mul(1.055).sub(0.055), step(0.0031308, c));
		const finishMat = material(Fn(() => {
			const st = uv().toVar();
			const c0 = T.color.sample(st).toVar();
			const c = min(finite(c0.rgb), vec3(64)).toVar();
			// odbicia ekranowe: część koloru (maska z materiału razy pewność trafienia) zastąpiona kolorem odbitym
			const ssr = T.ssr.sample(st);
			c.assign(mix(c, ssr.rgb, clamp(c0.a, 0, 1).mul(ssr.a).mul(U.ssrOn)));
			// mgła wysokościowa
			const d = T.depth.sample(st).x.toVar();
			const world = U.camWorld.mul(vec4(getViewPosition(st, d, U.projInv), 1)).xyz;
			const ray = world.sub(U.camPos).toVar();
			const t = length(ray).toVar();
			const rd = ray.div(t).toVar();
			const b = U.fogFalloff, h0 = U.camPos.y.sub(U.fogBase);
			const rb = rd.y.mul(b).toVar();
			const k = select(abs(rb).greaterThan(1e-4), exp(t.mul(rb).negate()).oneMinus().div(rb), t);
			const amount = exp(U.fogDensity.mul(exp(h0.mul(b).negate())).mul(k).negate()).oneMinus();
			const toSun = pow(max(dot(rd, U.sunDir), 0.0), 6.0).toVar();
			const haze = U.hazeColor.mul(toSun.mul(0.6).add(1)).add(U.sunColor.mul(toSun).mul(0.35));
			const fogK = select(U.atmoOn.greaterThan(0.5).and(d.lessThan(0.99999)), clamp(amount, 0, 0.55), float(0));
			c.assign(mix(c, haze, fogK));
			c.addAssign(T.raysB.sample(st).rgb.mul(U.raysOn));
			c.addAssign(T.bloom.sample(st).rgb.mul(U.bloomStrength).mul(U.bloomOn));
			c.assign(aces(c.mul(U.exposure)));
			// gradacja: nasycenie, odcień cieni i świateł
			const l = dot(c, vec3(0.2126, 0.7152, 0.0722)).toVar();
			c.assign(mix(vec3(l), c, mix(1.0, U.saturation, U.grade)));
			c.mulAssign(mix(vec3(1), mix(U.shadowTint, U.lightTint, smoothstep(0.05, 0.7, l)), U.grade));
			c.assign(srgb(clamp(c, 0, 1)));
			c.assign(mix(c, c.sub(0.5).mul(U.contrast).add(0.5), U.grade));
			const v = length(st.sub(0.5).mul(vec2(U.aspect, 1)));
			c.mulAssign(U.vignette.mul(smoothstep(0.45, 1.1, v)).oneMinus());
			c.addAssign(hash(screenCoordinate.xy).sub(0.5).div(255));
			return vec4(c, 1);
		})());
		const fxaaMat = material(fxaa(T.finish));
		/* wyostrzanie (adaptacyjne – jak CAS): krzyż sąsiadów, siła wg lokalnego kontrastu (krawędzie już ostre i jasne
		   plamy bez obwódek), U.sharp 0…1; przywraca ostrość cienkich linii (szyny, sieć) rozmytych przez FXAA */
		U.sharp = uniform(0.35);
		U.sharpTexel = uniform(new THREE.Vector2());
		const sharpen = (src) => material(Fn(() => {
			const st = uv(), t = U.sharpTexel;
			const c = src.sample(st).rgb.toVar();
			const n = src.sample(st.add(vec2(0, t.y.negate()))).rgb, s = src.sample(st.add(vec2(0, t.y))).rgb;
			const e = src.sample(st.add(vec2(t.x, 0))).rgb, w = src.sample(st.add(vec2(t.x.negate(), 0))).rgb;
			const mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
			const amp = sqrt(clamp(min(mn, vec3(1).sub(mx)).div(max(mx, vec3(1e-4))), 0, 1));
			const wt = amp.mul(mix(-0.1, -0.2, U.sharp)).mul(min(U.sharp.mul(3), 1));
			return vec4(clamp(c.add(n.add(s).add(e).add(w).mul(wt)).div(wt.mul(4).add(1)), 0, 1), 1);
		})());
		const sharpAaMat = sharpen(T.aa), sharpFinishMat = sharpen(T.finish), sharpTaaMat = sharpen(T.taa);
		/* rozwiązanie TAA (na obrazie po wykończeniu – po tonemappingu; jasne punkty nie dają migotania): punkt świata
		   z głębi piksela najbliższego kamerze w otoczeniu 3 × 3 (ostre krawędzie), rzut macierzą poprzedniej klatki
		   (prevVP) – położenie w historii; niebo (głębia 1) – sam kierunek. Historia przycięta do zakresu sąsiadów, waga
		   bieżącej klatki rośnie z przesunięciem; historia poza kadrem lub pierwsza klatka – sama bieżąca */
		U.taaTexel = uniform(new THREE.Vector2());
		U.taaValid = uniform(0);
		U.prevVP = uniform(new THREE.Matrix4());
		const taaMat = material(Fn(() => {
			const st = uv().toVar(), tx = U.taaTexel;
			const bd = float(1).toVar(), best = vec2(0).toVar();
			for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
				const o = vec2(x, y).mul(tx);
				const d = T.depth.sample(st.add(o)).x.toVar();
				If(d.lessThan(bd), () => { bd.assign(d); best.assign(o); });
			}
			const sb = st.add(best);
			const vp = getViewPosition(sb, bd, U.projInv);
			const sky = bd.greaterThanEqual(0.99999);
			const wp = U.camWorld.mul(vec4(vp, select(sky, float(0), float(1))));
			const pc = U.prevVP.mul(wp).toVar();
			const pn = pc.xy.div(max(abs(pc.w), 1e-6)).mul(sign(pc.w));
			// (przesunięcie piksela najbliższego – do bieżącego piksela)
			const hUV = vec2(pn.x.mul(0.5).add(0.5), float(0.5).sub(pn.y.mul(0.5))).sub(best).toVar();
			const cur = T.finish.sample(st).rgb.toVar();
			const mn = vec3(cur).toVar(), mx = vec3(cur).toVar();
			for (const [x, y] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
				const c = T.finish.sample(st.add(vec2(x, y).mul(tx))).rgb;
				mn.assign(min(mn, c));
				mx.assign(max(mx, c));
			}
			const hist = clamp(T.hist.sample(hUV).rgb, mn, mx);
			const inside = step(0, hUV.x).mul(step(0, hUV.y)).mul(step(hUV.x, 1)).mul(step(hUV.y, 1)).mul(step(0, pc.w)).mul(U.taaValid);
			const motion = clamp(length(st.sub(hUV).div(tx)).div(10), 0, 1);
			const w = mix(1, clamp(motion.mul(0.5).add(0.1), 0, 1), inside);
			return vec4(mix(hist, cur, w), 1);
		})());

		/* okluzja otoczenia w materiałach – tylko na świetle rozproszonym (niebo, otoczenie, odbicia mapy otoczenia),
		   nie na słońcu: dawniej mnożona przez cały obraz, więc ściany i ziemia w pełnym słońcu dostawały szary nalot.
		   Głębia bieżącej klatki powstaje dopiero przy rysowaniu, więc materiały biorą okluzję z poprzedniej klatki:
		   punkt świata rzutowany macierzą tamtej klatki (aoVP), zgodność odległości od kamery (g bufora) – inaczej
		   (odsłonięte miejsce, obiekt jadący z kamerą: pociąg, wnętrze kabiny) to samo miejsce ekranu, gdy odległość się
		   zgadza; w ostateczności bez okluzji. Odbicie wody (inna kamera) – bez okluzji */
		const aoMap = texture(blank);
		const aoU = { on: uniform(0), ssr: uniform(0), vp: uniform(new THREE.Matrix4()), cam: uniform(new THREE.Vector3()) };
		const aoNode = Fn(() => {
			const pc = aoU.vp.mul(vec4(positionWorld, 1)).toVar();
			const pw = max(pc.w, 1e-3);
			const pUV = vec2(pc.x.div(pw).mul(0.5).add(0.5), float(0.5).sub(pc.y.div(pw).mul(0.5))).toVar();
			const a = aoMap.sample(pUV).toVar();
			const b = aoMap.sample(screenUV).toVar();
			const dz = positionView.z.negate().toVar();
			const inside = step(0, pUV.x).mul(step(0, pUV.y)).mul(step(pUV.x, 1)).mul(step(pUV.y, 1)).mul(step(0, pc.w));
			const okA = inside.mul(step(abs(a.g.sub(pc.w)), pc.w.mul(0.04).add(0.15)));
			const okB = step(abs(b.g.sub(dz)), dz.mul(0.04).add(0.15));
			const v = mix(mix(float(1), b.r, okB), a.r, okA);
			const main = step(distance(cameraPosition, aoU.cam), 0.01);
			return mix(float(1), v, aoU.on.mul(main));
		})();
		/* maska odbić ekranowych w kanale alfa obrazu sceny (bez drugiego celu rysowania – MRT nie współpracuje
		   z paczkami): nieprzezroczyste materiały PBR – gładkość (chropowatość poniżej ok. 0,4) razy Fresnel (metal –
		   pełny), pozostałe nieprzezroczyste – 0; przezroczyste bez zmian (mieszanie). Tylko gdy włączone i dla kamery
		   gracza (odbicie wody, mapy – alfa 1 jak dawniej) */
		const ssrMask = Fn(() => {
			const nv = clamp(dot(normalView, positionViewDirection), 0, 1);
			const f0 = mix(float(0.04), float(1), metalness);
			const F = f0.add(f0.oneMinus().mul(pow(nv.oneMinus(), 5)));
			return smoothstep(0.42, 0.08, roughness).mul(F);
		});
		renderer.contextNode = context({
			getAO: (input, { material }) => (material.transparent === true ? input : input !== null ? input.mul(aoNode) : aoNode),
			getOutput: (out, builder) => {
				const m = builder.material;
				if (!m || m.transparent === true || (m.patchHooks && m.patchHooks.tag === 'water')) return out;
				const k = aoU.ssr.mul(step(distance(cameraPosition, aoU.cam), 0.01));
				const mask = m.isMeshStandardNodeMaterial ? ssrMask() : float(0);
				return vec4(out.rgb, mix(out.a, mask, k));
			},
		});

		const v3 = new THREE.Vector3(), fw = new THREE.Vector3();
		return {
			/* numer przebudowy buforów: materiały (okluzja w kontekście renderera) wskazują teksturę bufora AO, a paczki
			   rysowania trzymają powiązania z chwili nagrania – po przebudowie (zmiana rozmiaru, TAA) paczki od nowa (scene.js),
			   inaczej „zniszczona tekstura użyta w wysyłce” */
			get version() {
				return version;
			},
			// bez efektów (scene.js) – materiały bez okluzji z bufora
			idle() {
				aoU.on.value = 0;
				aoU.ssr.value = 0;
				aoValid = false;
			},
			get samples() {
				return aa;
			},
			get target() {
				if (!built) build();
				return sceneTarget;
			},
			// useTaa – wygładzanie czasowe zamiast FXAA (nowe bufory: drugi cel sceny, historia)
			setSize(w, h, msaa = aa, useTaa = taa) {
				w = Math.max(1, Math.round(w));
				h = Math.max(1, Math.round(h));
				aa = msaa;
				const tChanged = !!useTaa !== taa;
				taa = !!useTaa;
				if (w === width && h === height && built && !tChanged) return;
				width = w;
				height = h;
				build();
			},
			render(scene, camera, s = {}) {
				if (!built) build();
				U.projInv.value.copy(camera.projectionMatrixInverse);
				U.proj.value.copy(camera.projectionMatrix);
				U.camWorld.value.copy(camera.matrixWorld);
				U.camPos.value.copy(camera.position);
				U.projScale.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
				aoU.on.value = s.ao && aoValid ? 1 : 0;
				aoU.ssr.value = s.ssr ? 1 : 0;
				U.ssrOn.value = s.ssr ? 1 : 0;
				aoU.cam.value.copy(camera.position);
				renderer.setRenderTarget(sceneTarget);
				if (taa) {
					// przesunięcie o ułamek piksela (macierze dla efektów i reprojekcji – bez przesunięcia, sprzed rysowania)
					const j = HALTON[taaJ++ % HALTON.length];
					camera.setViewOffset(width, height, j[0] - 0.5, j[1] - 0.5, width, height);
					try {
						renderer.render(scene, camera);
					} finally {
						camera.clearViewOffset();
					}
				} else renderer.render(scene, camera);
				if (s.ao) {
					U.aoRadius.value = s.aoRadius ?? 26;
					U.aoStrength.value = s.aoStrength ?? 1.6;
					U.aoFade.value = s.aoFade ?? 3000;
					U.aoNear.value = s.aoNear ?? 0;
					U.aoTexel.value.set(1 / aoTarget.width, 1 / aoTarget.height);
					pass(aoMat, aoTarget);
					pass(aoBlurMat, aoBlurTarget);
					// (macierz tej klatki – okluzja dla materiałów następnej)
					aoU.vp.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
				}
				aoValid = !!s.ao;
				if (s.ssr) {
					U.aoTexel.value.set(1 / aoTarget.width, 1 / aoTarget.height);
					U.ssrSeed.value = (U.ssrSeed.value + 7.31) % 100;
					pass(ssrMat, ssrTarget);
				}
				if (s.bloom) {
					U.texel.value.set(1 / width, 1 / height);
					pass(brightMat, mips[0]);
					for (let i = 1; i < LEVELS; i++) {
						U.texel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
						pass(downMats[i - 1], mips[i]);
					}
					U.upWeight.value = 0.9;
					for (let i = LEVELS - 1; i > 0; i--) {
						U.texel.value.set(1 / mips[i].width, 1 / mips[i].height);
						pass(upMats[i], mips[i - 1], false);
					}
				}
				// promienie: słońce nad horyzontem i przed kamerą
				const a = s.atmosphere;
				let rays = false;
				if (a && a.rays > 0.01) {
					const sp = v3.copy(camera.position).addScaledVector(a.sunDir, 1000).project(camera);
					const ahead = fw.set(0, 0, -1).applyQuaternion(camera.quaternion).dot(a.sunDir);
					if (ahead > 0.05 && a.sunDir.y > -0.02) {
						rays = true;
						U.sunDir.value.copy(a.sunDir);
						U.raysColor.value.copy(a.sunColor).multiplyScalar(a.rays);
						pass(raysMaskMat, raysA);
						// (współrzędne ekranu jak uv() przebiegów – oś y w dół)
						U.sunUv.value.set(sp.x * 0.5 + 0.5, 1 - (sp.y * 0.5 + 0.5));
						U.spread.value = 0.9;
						pass(raysBlurMat, raysB);
					}
				}
				U.raysOn.value = rays ? 1 : 0;
				U.atmoOn.value = a ? 1 : 0;
				if (a) {
					U.sunDir.value.copy(a.sunDir);
					U.sunColor.value.copy(a.sunColor);
					U.hazeColor.value.copy(a.haze);
					U.fogBase.value = a.base;
					U.fogDensity.value = a.density;
					U.fogFalloff.value = a.falloff;
				}
				U.aoOn.value = s.ao ? 1 : 0;
				U.bloomOn.value = s.bloom ? 1 : 0;
				U.bloomStrength.value = s.bloomStrength ?? 0.35;
				U.exposure.value = s.exposure ?? 1;
				U.saturation.value = s.saturation ?? 1.08;
				U.contrast.value = s.contrast ?? 1.06;
				if (s.shadowTint) U.shadowTint.value.copy(s.shadowTint);
				if (s.lightTint) U.lightTint.value.copy(s.lightTint);
				U.vignette.value = s.vignette ?? 0.28;
				U.grade.value = s.grade ?? 1;
				U.aspect.value = width / height;
				const sh = (s.sharpen ?? 0) > 0.01;
				U.sharp.value = s.sharpen ?? 0;
				U.sharpTexel.value.set(1 / width, 1 / height);
				if (taa) {
					pass(finishMat, finishTarget);
					U.taaTexel.value.set(1 / width, 1 / height);
					U.taaValid.value = taaFresh ? 0 : 1;
					taaFresh = false;
					U.prevVP.value.copy(prevVP);
					pass(taaMat, taaTarget);
					// macierz tej klatki – dla następnej (rzut bez przesunięcia: projectionMatrix po clearViewOffset)
					prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
					renderer.copyTextureToTexture(taaTarget.texture, histTarget.texture);
					pass(sharpTaaMat, null); // (wyostrzanie 0 – bez zmian obrazu)
				} else if (aa > 0) {
					pass(finishMat, finishTarget);
					if (sh) {
						pass(fxaaMat, aaTarget);
						pass(sharpAaMat, null);
					} else pass(fxaaMat, null);
				} else if (sh) {
					pass(finishMat, finishTarget);
					pass(sharpFinishMat, null);
				} else pass(finishMat, null);
			},
			dispose() {
				sceneTarget?.depthTexture?.dispose();
				for (const t of [sceneTarget, aoTarget, aoBlurTarget, raysA, raysB, finishTarget, aaTarget, taaTarget, histTarget, ssrTarget, ...mips]) t?.dispose();
				for (const m of [aoMat, aoBlurMat, ssrMat, brightMat, raysMaskMat, raysBlurMat, finishMat, fxaaMat, sharpAaMat, sharpFinishMat, sharpTaaMat, taaMat, ...downMats, ...upMats]) m.dispose();
			},
		};
	}

	NS.createPostGPU = createPostGPU;
})();
