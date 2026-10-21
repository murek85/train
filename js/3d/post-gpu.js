/* Efekty po renderowaniu w trybie WebGPU – odpowiednik post.js (te same przebiegi, wzory i ustawienia) w TSL:
   scena do bufora HDR (połowa precyzji) z teksturą głębi, potem przebiegi pełnoekranowe (QuadMesh + NodeMaterial):
   - okluzja otoczenia z głębi w połowie rozdzielczości (16 próbek w półkuli nad powierzchnią) i rozmycie 3 × 3 z progiem
     głębi;
   - bloom: jasne (ponad próg) → łańcuch 5 coraz mniejszych kopii w dół i z powrotem w górę (dodawanie);
   - promienie słońca: jasne niebo wokół słońca (gdzie nic go nie zasłania) rozmyte promieniście ku słońcu;
   - wykończenie: okluzja, mgła wysokościowa (całka gęstości malejącej z wysokością wzdłuż promienia, cieplejsza ku
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
} from 'three/tsl';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

(function () {
	'use strict';
	const NS = (window.Train3D = window.Train3D || {});

	function createPostGPU(renderer) {
		const LEVELS = 5;
		let width = 1, height = 1, aa = 0, built = false;
		const half = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
		let sceneTarget, aoTarget, aoBlurTarget, raysA, raysB, finishTarget, aaTarget;
		const mips = [];
		// węzły tekstur (wartości podmieniane po zmianie rozmiaru buforów)
		const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
		blank.needsUpdate = true;
		const T = { color: texture(blank), depth: texture(blank), ao: texture(blank), aoBlur: texture(blank), raysA: texture(blank), raysB: texture(blank), bloom: texture(blank), finish: texture(blank), aa: texture(blank) };
		const mipTex = Array.from({ length: LEVELS }, () => texture(blank));

		function build() {
			for (const t of [sceneTarget, aoTarget, aoBlurTarget, raysA, raysB, finishTarget, aaTarget, ...mips]) t?.dispose();
			sceneTarget?.depthTexture?.dispose();
			sceneTarget = new RenderTarget(width, height, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
			sceneTarget.depthTexture = new THREE.DepthTexture(width, height);
			sceneTarget.depthTexture.type = THREE.FloatType;
			const hw = Math.max(1, width >> 1), hh = Math.max(1, height >> 1);
			aoTarget = new RenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
			aoBlurTarget = new RenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
			mips.length = 0;
			for (let i = 0; i < LEVELS; i++) mips.push(new RenderTarget(Math.max(1, width >> (i + 1)), Math.max(1, height >> (i + 1)), half));
			raysA = new RenderTarget(hw, hh, half);
			raysB = new RenderTarget(hw, hh, half);
			finishTarget = new RenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
			aaTarget = new RenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
			T.color.value = sceneTarget.texture;
			T.depth.value = sceneTarget.depthTexture;
			T.ao.value = aoTarget.texture;
			T.aoBlur.value = aoBlurTarget.texture;
			T.raysA.value = raysA.texture;
			T.raysB.value = raysB.texture;
			T.bloom.value = mips[0].texture;
			T.finish.value = finishTarget.texture;
			T.aa.value = aaTarget.texture;
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
			aoRadius: uniform(26), aoStrength: uniform(1.6), aoFade: uniform(3000), aoTexel: uniform(new THREE.Vector2()),
			texel: uniform(new THREE.Vector2()), upWeight: uniform(0.9), threshold: uniform(1.2), knee: uniform(0.8),
			sunDir: uniform(new THREE.Vector3(0, 1, 0)), sunColor: uniform(new THREE.Color()), raysColor: uniform(new THREE.Color()), sunUv: uniform(new THREE.Vector2()), spread: uniform(0.9),
			aoOn: uniform(0), bloomOn: uniform(0), bloomStrength: uniform(0.35), exposure: uniform(1), saturation: uniform(1.08), contrast: uniform(1.06),
			shadowTint: uniform(new THREE.Color(0.97, 0.99, 1.04)), lightTint: uniform(new THREE.Color(1.03, 1.0, 0.96)), vignette: uniform(0.28), aspect: uniform(1), grade: uniform(1),
			atmoOn: uniform(0), hazeColor: uniform(new THREE.Color()), fogBase: uniform(0), fogDensity: uniform(0), fogFalloff: uniform(0.01), raysOn: uniform(0),
		};
		const viewPos = (p) => getViewPosition(p, T.depth.sample(p).x, U.projInv);
		const aoMat = material(Fn(() => {
			const st = uv().toVar();
			const d = T.depth.sample(st).x;
			const P = getViewPosition(st, d, U.projInv).toVar();
			const N0 = normalize(cross(dFdx(P), dFdy(P))).toVar();
			const N = select(N0.z.lessThan(0), N0.negate(), N0).toVar();
			// widziane prawie stycznie (rozległa płaska ziemia z niskiej kamery) – okluzja gaśnie
			const facing = abs(dot(N, normalize(P.negate())));
			const a0 = hash(screenCoordinate.xy).mul(6.2831853).toVar();
			const up = select(abs(N.y).lessThan(0.99), vec3(0, 1, 0), vec3(1, 0, 0));
			const tx = normalize(cross(up, N)).toVar(), ty = cross(N, tx).toVar();
			const occ = float(0).toVar();
			for (let i = 0; i < 16; i++) {
				const t = (i + 0.5) / 16, z = 1 - t, rr = Math.sqrt(1 - z * z);
				const ang = a0.add(i * 2.3999632);
				const dir = tx.mul(cos(ang).mul(rr)).add(ty.mul(sin(ang).mul(rr))).add(N.mul(z));
				const Q = P.add(dir.mul(U.aoRadius).mul(0.15 + (1 - 0.15) * t * t)).toVar();
				const sz = viewPos(getScreenPosition(Q, U.proj)).z.toVar();
				const range = smoothstep(0.0, 1.0, U.aoRadius.div(max(abs(P.z.sub(sz)), 1e-3)));
				occ.addAssign(step(Q.z.add(U.aoRadius.mul(0.04)).sub(P.z.mul(0.003)), sz).mul(range));
			}
			occ.mulAssign(smoothstep(U.aoFade.mul(0.6), U.aoFade, P.z.negate()).oneMinus());
			occ.mulAssign(smoothstep(0.06, 0.28, facing));
			const v = pow(clamp(U.aoStrength.mul(occ).div(16).oneMinus(), 0, 1), 1.5);
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
			return vec4(vec3(sum.div(w)), 1);
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
			const c = U.raysColor.mul(pow(s, 24.0).mul(2.0).add(pow(s, 6.0).mul(0.25))).mul(smoothstep(-0.02, 0.06, rd.y));
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
			const c = min(finite(T.color.sample(st).rgb), vec3(64)).toVar();
			c.mulAssign(select(U.aoOn.greaterThan(0.5), T.aoBlur.sample(st).r, float(1)));
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
		const sharpAaMat = sharpen(T.aa), sharpFinishMat = sharpen(T.finish);

		const v3 = new THREE.Vector3(), fw = new THREE.Vector3();
		return {
			get samples() {
				return aa;
			},
			get target() {
				if (!built) build();
				return sceneTarget;
			},
			setSize(w, h, msaa = aa) {
				w = Math.max(1, Math.round(w));
				h = Math.max(1, Math.round(h));
				aa = msaa;
				if (w === width && h === height && built) return;
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
				renderer.setRenderTarget(sceneTarget);
				renderer.render(scene, camera);
				if (s.ao) {
					U.aoRadius.value = s.aoRadius ?? 26;
					U.aoStrength.value = s.aoStrength ?? 1.6;
					U.aoFade.value = s.aoFade ?? 3000;
					pass(aoMat, aoTarget);
					U.aoTexel.value.set(1 / aoTarget.width, 1 / aoTarget.height);
					pass(aoBlurMat, aoBlurTarget);
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
				if (aa > 0) {
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
				for (const t of [sceneTarget, aoTarget, aoBlurTarget, raysA, raysB, finishTarget, aaTarget, ...mips]) t?.dispose();
				for (const m of [aoMat, aoBlurMat, brightMat, raysMaskMat, raysBlurMat, finishMat, fxaaMat, sharpAaMat, sharpFinishMat, ...downMats, ...upMats]) m.dispose();
			},
		};
	}

	NS.createPostGPU = createPostGPU;
})();
