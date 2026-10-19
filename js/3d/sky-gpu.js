/* Niebo i atmosfera w trybie WebGPU (etap 3) – fizyczna atmosfera z projektu Lot nad Polską (lot/src/atmosphere/gpu.js,
   model.js; S. Hillaire, „A Scalable and Production Ready Sky and Atmosphere Rendering Technique”, 2020):
   tablice przepuszczalności i rozpraszania wielokrotnego, widok nieba z wysokości kamery (słońce i księżyc), tarcza
   słońca, niebo nocne (gwiazdy w dwóch warstwach, Droga Mleczna z pyłami, księżyc z fazą i morzami), natężenie światła
   nieba. Jednostki atmosfery: kilometry; Ziemia to kula, kamera nad jej biegunem.
   Na tym (SkyGPU):
   - kopuła nieba wokół kamery (zamiast sky.js): radiancja nieba + słońce + niebo nocne; do czasu chmur (etap 4)
     zachmurzenie przechodzi w szarość nieba z pogody, nocą łuna miasta nad horyzontem;
   - mgła (scene.fogNode): kolor z radiancji nieba tuż nad horyzontem w kierunku patrzenia (bez szwu z niebem; ku słońcu
     jaśniejsza i cieplejsza), zamglenie i zachmurzenie z pogody, łuna miasta; zasięg z scene.fog (pogoda, scene.js);
   - kolor nieba do odbić (envColor – nodes.js createEnvironment).
   Skale: skyK – radiancja atmosfery (słońce 12 jednostek jak w lot) do jasności sceny train (ekspozycja 1–1,7);
   nightK – gwiazdy i księżyc (w lot nocna ekspozycja do 6). */
import * as THREE from 'three';
import { RenderTarget, NodeMaterial, QuadMesh, MeshBasicNodeMaterial } from 'three/webgpu';
import {
	Fn, float, vec2, vec3, vec4, uniform, uv, texture, Loop, If, exp, sqrt, max, min, clamp, abs, dot, normalize, length,
	cos, sin, acos, asin, atan, pow, select, int, floor, fract, smoothstep, time, mx_fractal_noise_float, mix, positionLocal,
	positionWorld, cameraPosition, fog, rangeFogFactor, renderGroup, screenUV,
} from 'three/tsl';

(function () {
	'use strict';
	const NS = (window.Train3D = window.Train3D || {});

	// ---- parametry atmosfery (lot/src/atmosphere/model.js) ----
	const ATMOSPHERE = {
		groundRadius: 6360,
		topRadius: 6460,
		rayleighScattering: [5.802e-3, 13.558e-3, 33.1e-3],
		rayleighScaleHeight: 8,
		mieScattering: 3.996e-3,
		mieExtinction: 4.4e-3,
		mieScaleHeight: 1.2,
		mieG: 0.8,
		ozoneAbsorption: [0.65e-3, 1.881e-3, 0.085e-3],
		ozoneCenter: 25,
		ozoneWidth: 15,
		groundAlbedo: 0.25,
		haze: 6, // mnożnik aerozoli (Polska latem – widoczność 20–40 km)
		sunAngularRadius: 0.004675,
		sunIlluminance: 12,
	};
	const PI = Math.PI;
	const TRANSMITTANCE = [256, 64], MULTI = [32, 32], SKY = [192, 108];

	// „Hash without Sine” (D. Hoskins) – jak lot/src/gfx/noise.js
	const hash12 = Fn(([p]) => {
		const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
		p3.addAssign(dot(p3, p3.yzx.add(33.33)));
		return fract(p3.x.add(p3.y).mul(p3.z));
	}).setLayout({ name: 'skyHash12', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
	const hash22 = Fn(([p]) => {
		const p3 = fract(vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.103, 0.0973))).toVar();
		p3.addAssign(dot(p3, p3.yzx.add(33.33)));
		return fract(p3.xx.add(p3.yz).mul(p3.zy));
	}).setLayout({ name: 'skyHash22', type: 'vec2', inputs: [{ name: 'p', type: 'vec2' }] });

	function lut(w, h) {
		const rt = new RenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
		const t = rt.texture;
		t.minFilter = t.magFilter = THREE.LinearFilter;
		t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
		t.generateMipmaps = false;
		return rt;
	}

	/* Atmosfera – przeniesiona z lot (lot/src/atmosphere/gpu.js) bez zmian w obliczeniach; uniformy w grupie renderGroup
	   (jeden bufor na klatkę – train ma setki shaderów). */
	class Atmosphere {
		constructor(renderer) {
			this.renderer = renderer;
			const a = ATMOSPHERE;
			const G = (v) => uniform(v).setGroup(renderGroup);
			this.u = {
				Rg: G(a.groundRadius), Rt: G(a.topRadius), rayleigh: G(new THREE.Vector3(...a.rayleighScattering)), rayleighH: G(a.rayleighScaleHeight),
				mieScat: G(a.mieScattering), mieExt: G(a.mieExtinction), mieH: G(a.mieScaleHeight), mieG: G(a.mieG),
				ozone: G(new THREE.Vector3(...a.ozoneAbsorption)), ozoneC: G(a.ozoneCenter), ozoneW: G(a.ozoneWidth), albedo: G(a.groundAlbedo), haze: G(a.haze),
				sunDir: G(new THREE.Vector3(0, 1, 0)), sunE: G(a.sunIlluminance),
				lightDir: G(new THREE.Vector3(0, 1, 0)), lightE: G(new THREE.Vector3(a.sunIlluminance, a.sunIlluminance, a.sunIlluminance)),
				moonDir: G(new THREE.Vector3(0, -1, 0)), moonE: G(0), moonT1: G(new THREE.Vector3(1, 0, 0)), moonT2: G(new THREE.Vector3(0, 1, 0)),
				skyToEq: G(new THREE.Matrix3()), pixelAngle: G(0.0005), sunRadius: G(a.sunAngularRadius), viewH: G(a.groundRadius + 0.3),
			};
			this.transmittanceRT = lut(...TRANSMITTANCE);
			this.multiRT = lut(...MULTI);
			this.skyRT = lut(...SKY);
			this.moonSkyRT = lut(...SKY);
			this.irradianceRT = lut(1, 1);
			this.tTex = texture(this.transmittanceRT.texture);
			this.msTex = texture(this.multiRT.texture);
			this.skyTex = texture(this.skyRT.texture);
			this.moonSkyTex = texture(this.moonSkyRT.texture);
			this.irrTex = texture(this.irradianceRT.texture);
			this._build();
			this.dirty = true;
		}
		setHaze(v) {
			if (Math.abs(this.u.haze.value - v) < 0.05) return;
			this.u.haze.value = v;
			this.dirty = true;
		}
		setNight({ moonDir, moonE, skyToEq, pixelAngle }) {
			this.u.moonDir.value.copy(moonDir).normalize();
			const md = this.u.moonDir.value;
			this.u.moonT1.value.set(-md.z, 0, md.x).normalize();
			this.u.moonT2.value.crossVectors(this.u.moonT1.value, md).normalize();
			this.u.moonE.value = moonE;
			this.u.skyToEq.value.copy(skyToEq);
			this.u.pixelAngle.value = pixelAngle;
		}
		/* light – główne światło (słońce albo nocą księżyc): kierunek i natężenie RGB (oświetlenie chmur) */
		update(sunDir, cameraY, light) {
			this.u.sunDir.value.copy(sunDir).normalize();
			if (light) {
				this.u.lightDir.value.copy(light.dir).normalize();
				this.u.lightE.value.copy(light.e);
			} else this.u.lightDir.value.copy(this.u.sunDir.value);
			this.u.viewH.value = this.u.Rg.value + Math.max(0.002, cameraY / 1000);
			const r = this.renderer, prev = r.getRenderTarget();
			if (this.dirty) {
				this._pass(this.transmittanceQuad, this.transmittanceRT);
				this._pass(this.multiQuad, this.multiRT);
				this.dirty = false;
			}
			this._pass(this.moonSkyQuad, this.moonSkyRT);
			this._pass(this.skyQuad, this.skyRT);
			this._pass(this.irradianceQuad, this.irradianceRT);
			r.setRenderTarget(prev);
		}
		_pass(quad, rt) {
			this.renderer.setRenderTarget(rt);
			quad.render(this.renderer);
		}
		_build() {
			const U = this.u, self = this;
			const rayleighD = (h) => exp(h.negate().div(U.rayleighH));
			const mieD = (h) => exp(h.negate().div(U.mieH));
			const ozoneD = (h) => max(0, float(1).sub(abs(h.sub(U.ozoneC)).div(U.ozoneW)));
			const rayleighScat = (h) => U.rayleigh.mul(rayleighD(h));
			const mieScat = (h) => U.mieScat.mul(U.haze).mul(mieD(h));
			const extinctionAt = (h) => U.rayleigh.mul(rayleighD(h)).add(U.mieExt.mul(U.haze).mul(mieD(h))).add(U.ozone.mul(ozoneD(h)));
			const phaseRayleigh = (c) => float(3 / (16 * PI)).mul(c.mul(c).add(1));
			const phaseMie = (c) => {
				const g = U.mieG, g2 = g.mul(g);
				const k = float(3 / (8 * PI)).mul(float(1).sub(g2)).div(g2.add(2));
				return k.mul(c.mul(c).add(1)).div(pow(max(1e-4, g2.add(1).sub(g.mul(c).mul(2))), 1.5));
			};
			const distTop = (r, mu) => max(0, r.negate().mul(mu).add(sqrt(max(0, r.mul(r).mul(mu.mul(mu).sub(1)).add(U.Rt.mul(U.Rt))))));
			const groundDisc = (r, mu) => r.mul(r).mul(mu.mul(mu).sub(1)).add(U.Rg.mul(U.Rg));
			const distGround = (r, mu) => select(mu.lessThan(0).and(groundDisc(r, mu).greaterThanEqual(0)), r.negate().mul(mu).sub(sqrt(max(0, groundDisc(r, mu)))), float(-1));
			const H = () => sqrt(U.Rt.mul(U.Rt).sub(U.Rg.mul(U.Rg)));
			const transmittanceUv = (r, mu) => {
				const rho = sqrt(max(0, r.mul(r).sub(U.Rg.mul(U.Rg))));
				const d = distTop(r, mu);
				const dMin = U.Rt.sub(r), dMax = rho.add(H());
				return vec2(d.sub(dMin).div(dMax.sub(dMin)), rho.div(H()));
			};
			const sampleT = (r, mu) => this.tTex.sample(transmittanceUv(r, mu)).level(0).rgb;
			const sunT = (r, muS) => {
				const sinH = U.Rg.div(r);
				const cosH = sqrt(max(0, float(1).sub(sinH.mul(sinH)))).negate();
				const vis = clamp(muS.sub(cosH).div(U.sunRadius.mul(2)).add(0.5), 0, 1);
				return sampleT(r, muS).mul(vis);
			};
			const sampleMS = (r, muS) => {
				const st = vec2(muS.mul(0.5).add(0.5), r.sub(U.Rg).div(U.Rt.sub(U.Rg)));
				const half = vec2(0.5 / MULTI[0], 0.5 / MULTI[1]);
				return this.msTex.sample(clamp(st, half, vec2(1).sub(half))).level(0).rgb;
			};

			const transmittanceFn = Fn(() => {
				const st = uv();
				const rho = H().mul(st.y);
				const r = sqrt(rho.mul(rho).add(U.Rg.mul(U.Rg)));
				const dMin = U.Rt.sub(r), dMax = rho.add(H());
				const d = max(1e-4, dMin.add(st.x.mul(dMax.sub(dMin))));
				const mu = clamp(H().mul(H()).sub(rho.mul(rho)).sub(d.mul(d)).div(r.mul(d).mul(2)), -1, 1);
				const depth = vec3(0).toVar();
				const N = 40;
				Loop({ start: int(0), end: int(N) }, ({ i }) => {
					const t = float(i).add(0.5).mul(d).div(N);
					const ri = sqrt(r.mul(r).add(t.mul(t)).add(r.mul(mu).mul(t).mul(2)));
					depth.addAssign(extinctionAt(ri.sub(U.Rg)).mul(d.div(N)));
				});
				return vec4(exp(depth.negate()), 1);
			});
			const multiFn = Fn(() => {
				const st = uv();
				const muS = st.x.mul(2).sub(1);
				const r = max(U.Rg.add(0.01), U.Rg.add(st.y.mul(U.Rt.sub(U.Rg))));
				const sun = vec3(0, muS, sqrt(max(0, float(1).sub(muS.mul(muS)))));
				const pos = vec3(0, r, 0);
				const Lsum = vec3(0).toVar(), Fsum = vec3(0).toVar();
				const SQ = 8, STEPS = 20;
				Loop({ start: int(0), end: int(SQ * SQ) }, ({ i }) => {
					const fi = float(i);
					const a = fi.mod(SQ).add(0.5).div(SQ), b = fi.div(SQ).floor().add(0.5).div(SQ);
					const cosT = float(1).sub(a.mul(2)), sinT = sqrt(max(0, float(1).sub(cosT.mul(cosT))));
					const phi = b.mul(2 * PI);
					const dir = vec3(sinT.mul(cos(phi)), cosT, sinT.mul(sin(phi)));
					const g = distGround(r, cosT);
					const tMax = select(g.greaterThan(0), g, distTop(r, cosT));
					const L = vec3(0).toVar(), F = vec3(0).toVar(), T = vec3(1).toVar();
					const dt = tMax.div(STEPS);
					Loop({ start: int(0), end: int(STEPS) }, ({ i: k }) => {
						const p = pos.add(dir.mul(float(k).add(0.5).mul(dt)));
						const ri = length(p);
						const h = ri.sub(U.Rg);
						const sc = rayleighScat(h).add(mieScat(h));
						const ext = extinctionAt(h);
						const tr = exp(ext.negate().mul(dt));
						const S = sc.mul(sunT(ri, dot(p.div(ri), sun))).mul(1 / (4 * PI));
						L.addAssign(T.mul(S.sub(S.mul(tr)).div(ext)));
						F.addAssign(T.mul(sc.sub(sc.mul(tr)).div(ext)));
						T.mulAssign(tr);
					});
					If(g.greaterThan(0), () => {
						const pg = pos.add(dir.mul(g));
						const n = normalize(pg);
						const muG = dot(n, sun);
						L.addAssign(T.mul(sunT(U.Rg, muG)).mul(max(0, muG)).mul(U.albedo).div(PI));
					});
					Lsum.addAssign(L);
					Fsum.addAssign(F);
				});
				const L2 = Lsum.div(SQ * SQ), f = Fsum.div(SQ * SQ);
				return vec4(L2.div(max(vec3(1e-4), vec3(1).sub(f))), 1);
			});
			const horizon = () => {
				const vh = sqrt(max(0, U.viewH.mul(U.viewH).sub(U.Rg.mul(U.Rg))));
				const beta = acos(clamp(vh.div(U.viewH), -1, 1));
				return { beta, zha: float(PI).sub(beta) };
			};
			const makeSkyFn = (lightDir, lightE) => Fn(() => {
				const st = uv();
				const { beta, zha } = horizon();
				const v = st.y;
				const c0 = float(1).sub(v.mul(2));
				const upper = zha.mul(float(1).sub(c0.mul(c0)));
				const c1 = v.mul(2).sub(1);
				const lower = zha.add(beta.mul(c1.mul(c1)));
				const vza = select(v.lessThan(0.5), upper, lower);
				const az = st.x.mul(st.x).mul(PI);
				const muS = lightDir.y;
				const sunL = vec3(sqrt(max(0, float(1).sub(muS.mul(muS)))), muS, 0);
				const dir = vec3(sin(vza).mul(cos(az)), cos(vza), sin(vza).mul(sin(az)));
				const pos = vec3(0, U.viewH, 0);
				const g = distGround(U.viewH, dir.y);
				const tMax = select(g.greaterThan(0), g, distTop(U.viewH, dir.y));
				const L = vec3(0).toVar(), T = vec3(1).toVar(), tPrev = float(0).toVar();
				const cosV = dot(dir, sunL);
				const pR = phaseRayleigh(cosV), pM = phaseMie(cosV);
				const N = 32;
				Loop({ start: int(0), end: int(N) }, ({ i }) => {
					const x = float(i).add(1).div(N);
					const t1 = tMax.mul(x.mul(x));
					const dt = t1.sub(tPrev);
					const p = pos.add(dir.mul(tPrev.add(dt.mul(0.5))));
					const r = length(p);
					const h = r.sub(U.Rg);
					const ms = dot(p.div(r), sunL);
					const sR = rayleighScat(h), sM = mieScat(h);
					const ext = extinctionAt(h);
					const S = sR.mul(pR).add(sM.mul(pM)).mul(sunT(r, ms)).add(sR.add(sM).mul(sampleMS(r, ms)));
					const tr = exp(ext.negate().mul(dt));
					L.addAssign(T.mul(S.sub(S.mul(tr)).div(max(ext, vec3(1e-7)))));
					T.mulAssign(tr);
					tPrev.assign(t1);
				});
				return vec4(L.mul(lightE), 1);
			});
			const skyLookup = (tex, light, dir) => {
				const { beta, zha } = horizon();
				const vza = acos(clamp(dir.y, -1, 1));
				const up = clamp(vza.div(zha), 0, 1);
				const vUp = float(1).sub(sqrt(float(1).sub(up))).mul(0.5);
				const lo = clamp(vza.sub(zha).div(beta), 0, 1);
				const vLo = sqrt(lo).mul(0.5).add(0.5);
				const v = select(vza.lessThan(zha), vUp, vLo);
				const dh = dir.xz.div(max(1e-5, length(dir.xz)));
				const sh = light.xz.div(max(1e-5, length(light.xz)));
				const phi = acos(clamp(dot(dh, sh), -1, 1));
				const u = sqrt(phi.div(PI));
				const half = vec2(0.5 / SKY[0], 0.5 / SKY[1]);
				return tex.sample(clamp(vec2(u, v), half, vec2(1).sub(half))).level(0).rgb;
			};
			/** Radiancja nieba w kierunku dir (świat) widziana z kamery (słońce + księżyc). */
			this.skyRadiance = (dir) => skyLookup(this.skyTex, U.sunDir, dir).add(skyLookup(this.moonSkyTex, U.moonDir, dir));
			/** Tarcza słońca w kierunku dir, osłabiona atmosferą. */
			this.sunDisk = (dir) => {
				const c = dot(dir, U.sunDir);
				const cosR = cos(U.sunRadius.mul(2.2));
				const x = clamp(float(1).sub(c).div(float(1).sub(cosR)), 0, 1);
				const limb = pow(max(0, float(1).sub(x)), 0.45);
				const T = sampleT(U.viewH, dir.y);
				return select(c.greaterThan(cosR), T.mul(U.sunE).mul(limb).mul(60), vec3(0));
			};
			this.viewTransmittance = (dir) => sampleT(U.viewH, dir.y);
			/** Główne światło (słońce, nocą księżyc) – natężenie RGB docierające na wysokość yM metrów n.p.m. */
			this.sunLight = (yM) => sunT(U.Rg.add(max(0.001, yM.div(1000))), U.lightDir.y).mul(U.lightE);
			/** Całkowanie rozpraszania wzdłuż promienia: { L (bez E słońca), T }. W Fn. */
			const march = (pos, dir, tMax, steps) => {
				const L = vec3(0).toVar(), T = vec3(1).toVar(), tPrev = float(0).toVar();
				const sun = U.sunDir;
				const cosV = dot(dir, sun);
				const pR = phaseRayleigh(cosV), pM = phaseMie(cosV);
				const n = float(steps);
				Loop({ start: int(0), end: int(n) }, ({ i }) => {
					const t1 = tMax.mul(float(i).add(1).div(n));
					const dt = t1.sub(tPrev);
					const p = pos.add(dir.mul(tPrev.add(dt.mul(0.5))));
					const r = length(p);
					const h = r.sub(U.Rg);
					const muS = dot(p.div(r), sun);
					const sR = rayleighScat(h), sM = mieScat(h);
					const ext = extinctionAt(h);
					const S = sR.mul(pR).add(sM.mul(pM)).mul(sunT(r, muS)).add(sR.add(sM).mul(sampleMS(r, muS)));
					const tr = exp(ext.negate().mul(dt));
					L.addAssign(T.mul(S.sub(S.mul(tr)).div(max(ext, vec3(1e-7)))));
					T.mulAssign(tr);
					tPrev.assign(t1);
				});
				return { L, T };
			};
			/** Perspektywa powietrzna między kamerą (y w metrach) a punktem odległym o offset (metry). */
			this.aerial = (cameraY, offsetM) => {
				const pos = vec3(0, U.Rg.add(max(0.002, cameraY.div(1000))), 0);
				const d = offsetM.div(1000).mul(0.55);
				const dist = length(d);
				const steps = clamp(dist.mul(0.8).floor().add(3), 3, 12);
				const { L, T } = march(pos, d.div(max(1e-6, dist)), dist, steps);
				return { inscatter: L.mul(U.sunE), transmittance: T };
			};
			const mix3 = (a, b, t) => a.add(b.sub(a).mul(t));
			/** Niebo nocne: gwiazdy, Droga Mleczna i tarcza księżyca z fazą. */
			this.nightSky = (dir) => {
				const eq = U.skyToEq.mul(dir);
				const T = sampleT(U.viewH, dir.y).mul(smoothstep(-0.02, 0.01, dir.y));
				const a = abs(eq);
				const isX = a.x.greaterThanEqual(a.y).and(a.x.greaterThanEqual(a.z));
				const isY = a.y.greaterThan(a.x).and(a.y.greaterThanEqual(a.z));
				const fuv = select(isX, eq.yz.div(a.x), select(isY, eq.xz.div(a.y), eq.xy.div(a.z)));
				const face = select(isX, select(eq.x.greaterThan(0), float(0), float(1)), select(isY, select(eq.y.greaterThan(0), float(2), float(3)), select(eq.z.greaterThan(0), float(4), float(5))));
				const stretch = float(1).add(dot(fuv, fuv).mul(0.5));
				const sigma = U.pixelAngle.mul(1.1);
				const layer = (cells, density, base, spread, power, seed) => {
					const g = fuv.mul(0.5).add(0.5).mul(cells);
					const cell = floor(g).add(face.mul(97.3)).add(seed);
					const pos = hash22(cell).mul(0.7).add(0.15);
					const delta = fract(g).sub(pos).mul(2 / cells).div(stretch);
					const h = hash12(cell.add(17.7));
					const exists = select(h.lessThan(density), float(1), float(0));
					const mag = hash12(cell.add(5.3));
					const b = float(base).add(pow(mag, power).mul(spread));
					const tint = mix3(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.86, 0.66), hash12(cell.add(9.1)));
					const twinkle = float(1).add(sin(time.mul(hash12(cell.add(2.2)).mul(9).add(6)).add(h.mul(60))).mul(0.4).mul(float(1).sub(clamp(dir.y.mul(4), 0, 1))));
					return tint.mul(b.mul(exists).mul(twinkle).mul(exp(dot(delta, delta).div(sigma.mul(sigma)).negate())));
				};
				let stars = layer(36, 0.17, 0.12, 3.5, 6, 0).add(layer(110, 0.14, 0.02, 0.18, 3, 11));
				const gnp = vec3(-0.8676, -0.1981, 0.456), gc = vec3(-0.0549, -0.8734, -0.4838);
				const gb = asin(clamp(dot(eq, gnp), -1, 1));
				const n1 = mx_fractal_noise_float(eq.mul(7), 4, 2, 0.5);
				const n2 = mx_fractal_noise_float(eq.mul(18).add(3.1), 3, 2, 0.5);
				const sq = (v) => v.mul(v);
				const band = exp(sq(gb.div(0.16)).negate()).add(exp(sq(gb.div(0.42)).negate()).mul(0.35));
				const dust = float(1).sub(exp(sq(gb.div(0.05)).negate()).mul(smoothstep(-0.1, 0.4, n2)).mul(0.7));
				const core = dot(eq, gc).mul(0.5).add(0.5);
				const milky = vec3(0.95, 0.9, 0.82).mul(band.mul(dust).mul(n1.mul(0.6).add(0.7).max(0)).mul(core.mul(core).mul(0.9).add(0.25)).mul(0.005));
				const rM = 0.011;
				const md = U.moonDir, t1 = U.moonT1, t2 = U.moonT2;
				const x = dot(dir, t1).div(rM), y = dot(dir, t2).div(rM);
				const r2 = x.mul(x).add(y.mul(y));
				const front = smoothstep(0, 0.001, dot(dir, md));
				const disk = float(1).sub(smoothstep(0.92, 1.0, r2)).mul(front);
				const z = sqrt(max(0, float(1).sub(r2)));
				const n = t1.mul(x).add(t2.mul(y)).sub(md.mul(z));
				const lit = smoothstep(-0.04, 0.08, dot(n, U.sunDir));
				const maria = mx_fractal_noise_float(vec3(x, y, 0).mul(1.6).add(vec3(4.2, 1.3, 0.7)), 4, 2.1, 0.55);
				const albedo = float(0.12).mul(smoothstep(-0.25, 0.3, maria).mul(0.6).add(0.45));
				const moon = vec3(1, 0.97, 0.92).mul(albedo.mul(U.sunE).div(PI).mul(lit.add(0.004))).mul(disk).mul(0.7);
				stars = stars.add(milky).mul(float(1).sub(disk));
				return stars.add(moon).mul(T);
			};
			const irradianceFn = Fn(() => {
				const E = vec3(0).toVar();
				const N = 8;
				for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
					const a = (i + 0.5) / N, b = (j + 0.5) / N;
					const rr = Math.sqrt(a), phi = 2 * PI * b;
					E.addAssign(self.skyRadiance(vec3(rr * Math.cos(phi), Math.sqrt(1 - a), rr * Math.sin(phi))));
				}
				return vec4(E.mul(PI / (N * N)), 1);
			});
			const quad = (fn) => {
				const m = new NodeMaterial();
				m.fragmentNode = fn();
				m.depthTest = m.depthWrite = false;
				return new QuadMesh(m);
			};
			this.transmittanceQuad = quad(transmittanceFn);
			this.multiQuad = quad(multiFn);
			this.skyQuad = quad(makeSkyFn(U.sunDir, U.sunE));
			this.moonSkyQuad = quad(makeSkyFn(U.moonDir, U.moonE));
			this.irradianceQuad = quad(irradianceFn);
			this.skyIrradiance = () => this.irrTex.sample(vec2(0.5)).level(0).rgb;
		}
	}

	// ---- sfera niebieska (lot/src/moon.js – czas gwiazdowy i obrót do układu sceny) ----
	const DEG = Math.PI / 180;
	function daysSinceJ2000(year, dayOfYear, hoursUtc) {
		return (Date.UTC(year, 0, 1) - Date.UTC(2000, 0, 1, 12)) / 86400000 + (dayOfYear - 1) + hoursUtc / 24;
	}
	function localSiderealTime(d, lon) {
		return ((((280.46061837 + 360.98564736629 * d + lon) % 360) + 360) % 360) * DEG;
	}
	// macierz (wiersze) z układu równikowego do sceny: wschód, góra, południe (jak w lot)
	function equatorialToScene(lst, lat) {
		const cL = Math.cos(lst), sL = Math.sin(lst), cP = Math.cos(lat * DEG), sP = Math.sin(lat * DEG);
		return [[-sL, cL, 0], [cP * cL, cP * sL, sP], [sP * cL, sP * sL, -cP]];
	}
	const SEASON_DAY = { spring: 105, summer: 196, autumn: 288, winter: 15 };

	/* Niebo trybu WebGPU: atmosfera, kopuła, mgła, kolor odbić. */
	class SkyGPU {
		constructor(renderer, scene) {
			this.renderer = renderer;
			const atmo = (this.atmo = new Atmosphere(renderer));
			const G = (v) => uniform(v).setGroup(renderGroup);
			const u = (this.u = {
				skyK: G(0.55), nightK: G(2.5), cover: G(0), coverC: G(new THREE.Color()), city: G(new THREE.Color()),
				hazeC: G(new THREE.Color()), hazeK: G(0), fogNear: G(450), fogFar: G(1500), sunK: G(1),
			});
			/* niebo w kierunku d: atmosfera, łuna miasta; full – też tarcza słońca i niebo nocne (tylko kopuła – w mgle
			   i odbiciach, czyli w każdym materiale, byłyby kosztowne: szumy Drogi Mlecznej i księżyca); bez full – też
			   zachmurzenie jako barwa horyzontu z szarością pogody (mgła i odbicia nie widzą chmur z kopuły) */
			const skyColor = (d, full) => {
				const c = atmo.skyRadiance(d).mul(u.skyK).toVar();
				if (full) {
					c.addAssign(atmo.sunDisk(d).mul(u.skyK));
					c.addAssign(atmo.nightSky(d).mul(u.nightK));
				} else c.assign(mix(c, u.coverC, u.cover));
				c.addAssign(u.city.mul(smoothstep(0.0, 0.35, d.y.max(0)).oneMinus().add(0.15)));
				return c;
			};
			this.skyColor = skyColor;
			// chmury wolumetryczne (clouds-gpu.js) – w kopule: niebo za chmurą × przepuszczalność + światło chmur
			const clouds = (this.clouds = new NS.CloudsGPU(renderer, atmo));
			const mat = new MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
			mat.colorNode = Fn(() => {
				const cl = clouds.sample(screenUV).toVar();
				return skyColor(normalize(positionLocal), true).mul(cl.a).add(cl.rgb.mul(u.skyK));
			})();
			this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
			this.mesh.frustumCulled = false;
			this.mesh.renderOrder = 1000;
			/* mgła: kolor nieba tuż nad horyzontem w kierunku punktu, zamglenie pogody; zasięg z scene.fog. Kolory horyzontu
			   wg azymutu liczone raz na klatkę do paska 128 × 1 (fogRT) – w materiałach (każdym!) tylko próbka tekstury, bez
			   uniformów atmosfery (grupa render każdego shadera zapisywana przy każdym render() – kilka ms procesora) */
			this.fogRT = new RenderTarget(128, 1, { type: THREE.HalfFloatType, depthBuffer: false });
			const ft = this.fogRT.texture;
			ft.wrapS = THREE.RepeatWrapping;
			ft.wrapT = THREE.ClampToEdgeWrapping;
			ft.minFilter = ft.magFilter = THREE.LinearFilter;
			ft.generateMipmaps = false;
			const fogMat = new NodeMaterial();
			fogMat.fragmentNode = Fn(() => {
				const az = uv().x.sub(0.5).mul(2 * PI);
				const d = normalize(vec3(cos(az), 0.03, sin(az)));
				return vec4(mix(skyColor(d, false), u.hazeC, u.hazeK), 1);
			})();
			fogMat.depthTest = fogMat.depthWrite = false;
			this.fogQuad = new QuadMesh(fogMat);
			const fogTex = texture(ft);
			Object.defineProperty(fogTex, 'updateType', { get: () => 'none', set() {} }); // (bez aktualizacji dla każdego obiektu)
			const fogColor = Fn(() => {
				const v = positionWorld.sub(cameraPosition);
				return fogTex.sample(vec2(atan(v.z, v.x).div(2 * PI).add(0.5), 0.5)).rgb;
			})();
			this.fogColor = fogColor;
			this.fogNode = fog(fogColor, rangeFogFactor(u.fogNear, u.fogFar));
			scene.fogNode = this.fogNode;
			this.skyToEq = new THREE.Matrix3();
		}
		/* Co klatkę (scene.js updateEnvironment): sunDir, moonDir, clock (s od północy, czas lokalny), season, camera,
		   haze (pogoda 0…1), cover (0…1), coverColor, hazeColor, cityGlow, fog (near, far) */
		update(o) {
			const atmo = this.atmo, u = this.u;
			const ill = (1 - o.sunDir.dot(o.moonDir)) / 2;
			atmo.setHaze(6 + 34 * o.haze);
			// sfera niebieska: czas gwiazdowy z godziny (strefa CEST), szerokość ok. 50,3° N, długość 18,7° E
			const hUtc = o.clock / 3600 - 2, day = SEASON_DAY[o.season] || 196;
			const m = equatorialToScene(localSiderealTime(daysSinceJ2000(2026, day, hUtc), 18.7), 50.3);
			this.skyToEq.set(m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]);
			const cam = o.camera;
			atmo.setNight({ moonDir: o.moonDir, moonE: 0.06 * Math.pow(ill, 1.5) * 0.2, skyToEq: this.skyToEq, pixelAngle: (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, this.renderer.domElement.height) });
			/* główne światło chmur: słońce, a gdy zajdzie – księżyc (jak w lot: natężenie wg fazy, chłodna barwa) */
			const night = o.sunDir.y < -0.02, moonKey = Math.min(1, Math.max(0, (-0.02 - o.sunDir.y) / 0.1));
			const light = this.light || (this.light = { dir: new THREE.Vector3(), e: new THREE.Vector3() });
			light.dir.copy(night ? o.moonDir : o.sunDir);
			const le = night ? 0.06 * Math.pow(ill, 1.5) * moonKey : 12;
			light.e.set(le * (night ? 0.72 : 1), le * (night ? 0.84 : 1), le);
			atmo.update(o.sunDir, cam.position.y + 250, light); // (wysokość n.p.m. – trasy na Śląsku ok. 250 m)
			// chmury wg pogody: zasięg = zachmurzenie, w opadzie niższa podstawa, grubsza i gęstsza warstwa (lot: deszcz, śnieg, burza)
			const C = this.clouds.u, wet = Math.max(o.rain || 0, o.snow || 0), storm = Math.min(1, o.lightning || 0);
			C.coverage.value = Math.min(1, o.cover);
			C.base.value = 1500 - 500 * wet - 100 * storm;
			C.thickness.value = 1600 + 600 * wet + 2300 * storm;
			C.extinction.value = 0.12 + 0.04 * wet + 0.04 * storm;
			C.sunGain.value = night ? 0.6 : 2.0;
			C.ambient.value = 0.5 + (o.flash || 0) * 1.2;
			this.clouds.update(o.dt || 0);
			const prev = this.renderer.getRenderTarget();
			this.renderer.setRenderTarget(this.fogRT);
			this.fogQuad.render(this.renderer);
			this.renderer.setRenderTarget(prev);
			// (mgła i odbicia: szarość nieba dopiero od średniego zachmurzenia; „słonecznie” ma 0,25 – drobne cumulusy)
			const ck = Math.max(0, Math.min(1, (o.cover - 0.3) / 0.7));
			u.cover.value = ck * ck * (3 - 2 * ck) * 0.95;
			u.coverC.value.copy(o.coverColor);
			u.hazeC.value.copy(o.hazeColor);
			u.hazeK.value = Math.min(0.85, o.haze * 0.9);
			u.city.value.copy(o.cityGlow);
			u.fogNear.value = o.fog.near;
			u.fogFar.value = o.fog.far;
			this.mesh.position.copy(cam.position);
			this.mesh.scale.setScalar(cam.far * 0.9);
		}
		// przed rysowaniem sceny (scene.js draw) – chmury z kamerą tej klatki; rozmiar bufora (połowa rozdzielczości)
		renderClouds(camera) {
			this.clouds.render(camera);
		}
		setSize(w, h) {
			this.clouds.setSize(w, h);
		}
	}

	NS.SkyGPU = SkyGPU;
})();
