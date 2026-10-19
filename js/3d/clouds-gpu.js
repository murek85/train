/* Chmury wolumetryczne w trybie WebGPU (etap 4) – z projektu Lot nad Polską (lot/src/clouds/clouds.js, noise3d.js; przepis
   A. Schneidera z „Horizon Zero Dawn”): warstwa cumulusów między dwiema sferami nad Ziemią, gęstość z mapy pogody i szumów
   3D (kształt Perlin–Worley, detal Worley), marsz promienia (do 110 kroków, krok rośnie z odległością) z oświetleniem
   słońcem po atmosferze (5 próbek ku słońcu, trzy oktawy rozpraszania wielokrotnego, „powder”), światłem nieba
   i mgiełką przed chmurą; połowa rozdzielczości, drganie kroku i akumulacja czasowa (reprojekcja poprzedniej klatki).
   Różnice wobec lot: bez głębi sceny – w train chmury (od 1–1,5 km) zawsze są za geometrią (świat do 2,6 km), więc
   trafiają do kopuły nieba (sky-gpu.js) i działają też bez efektów po renderowaniu; cień chmur na ziemi jako tekstura
   wokół kamery (shadowRT, co kilka klatek – w materiałach tylko próbka, bez uniformów chmur w każdym shaderze).
   Wynik (output): rgb – światło chmur z mgiełką, a – przepuszczalność (ile widać nieba za chmurą). */
import * as THREE from 'three';
import { RenderTarget, NodeMaterial, QuadMesh } from 'three/webgpu';
import {
	Fn, float, vec2, vec3, vec4, uniform, uv, texture, texture3D, Loop, If, Break, int, exp, max, min, clamp, mix, smoothstep,
	normalize, dot, sqrt, select, abs, getViewPosition, screenCoordinate, interleavedGradientNoise, fract, renderGroup,
	positionWorld,
} from 'three/tsl';

(function () {
	'use strict';
	const NS = (window.Train3D = window.Train3D || {});
	const EARTH_R = 6371000, PI = Math.PI;

	// ---- szumy (lot/src/clouds/noise3d.js) ----
	function rng(seed) {
		let a = seed >>> 0;
		return () => {
			a = (a + 0x6d2b79f5) >>> 0;
			let t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}
	const wrap = (i, n) => ((i % n) + n) % n;
	function worley3(cells, seed) {
		const r = rng(seed), pts = new Float32Array(cells * cells * cells * 3);
		for (let i = 0; i < pts.length; i++) pts[i] = r();
		return (x, y, z) => {
			const fx = x * cells, fy = y * cells, fz = z * cells;
			const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz);
			let best = 9;
			for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const ix = cx + dx, iy = cy + dy, iz = cz + dz;
				const k = (wrap(iz, cells) * cells * cells + wrap(iy, cells) * cells + wrap(ix, cells)) * 3;
				const px = ix + pts[k] - fx, py = iy + pts[k + 1] - fy, pz = iz + pts[k + 2] - fz;
				const d = px * px + py * py + pz * pz;
				if (d < best) best = d;
			}
			return Math.max(0, 1 - Math.sqrt(best));
		};
	}
	function perlin3(period, seed) {
		const r = rng(seed), g = new Float32Array(period * period * period * 3);
		for (let i = 0; i < g.length; i += 3) {
			const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
			g[i] = s * Math.cos(t); g[i + 1] = s * Math.sin(t); g[i + 2] = u;
		}
		const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
		const dotG = (ix, iy, iz, x, y, z) => {
			const k = (wrap(iz, period) * period * period + wrap(iy, period) * period + wrap(ix, period)) * 3;
			return g[k] * (x - ix) + g[k + 1] * (y - iy) + g[k + 2] * (z - iz);
		};
		const lerp = (a, b, t) => a + (b - a) * t;
		return (x, y, z) => {
			const fx = x * period, fy = y * period, fz = z * period;
			const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
			const u = fade(fx - ix), v = fade(fy - iy), w = fade(fz - iz);
			const n = lerp(
				lerp(lerp(dotG(ix, iy, iz, fx, fy, fz), dotG(ix + 1, iy, iz, fx, fy, fz), u), lerp(dotG(ix, iy + 1, iz, fx, fy, fz), dotG(ix + 1, iy + 1, iz, fx, fy, fz), u), v),
				lerp(lerp(dotG(ix, iy, iz + 1, fx, fy, fz), dotG(ix + 1, iy, iz + 1, fx, fy, fz), u), lerp(dotG(ix, iy + 1, iz + 1, fx, fy, fz), dotG(ix + 1, iy + 1, iz + 1, fx, fy, fz), u), v),
				w,
			);
			return Math.max(0, Math.min(1, n * 0.85 + 0.5));
		};
	}
	function shapeNoise(n = 64, seed = 7) {
		const p = [perlin3(4, seed), perlin3(8, seed + 1), perlin3(16, seed + 2)];
		const w = [worley3(4, seed + 3), worley3(8, seed + 4), worley3(16, seed + 5)];
		const out = new Uint8Array(n * n * n);
		let i = 0;
		for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
			const fx = (x + 0.5) / n, fy = (y + 0.5) / n, fz = (z + 0.5) / n;
			const perlin = p[0](fx, fy, fz) * 0.625 + p[1](fx, fy, fz) * 0.25 + p[2](fx, fy, fz) * 0.125;
			const worley = w[0](fx, fy, fz) * 0.625 + w[1](fx, fy, fz) * 0.25 + w[2](fx, fy, fz) * 0.125;
			const pw = (perlin - (worley - 1)) / (1 - (worley - 1));
			out[i++] = Math.round(Math.max(0, Math.min(1, pw)) * 255);
		}
		return out;
	}
	function detailNoise(n = 32, seed = 21) {
		const w = [worley3(4, seed), worley3(8, seed + 1), worley3(16, seed + 2)];
		const out = new Uint8Array(n * n * n);
		let i = 0;
		for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
			const fx = (x + 0.5) / n, fy = (y + 0.5) / n, fz = (z + 0.5) / n;
			out[i++] = Math.round((w[0](fx, fy, fz) * 0.625 + w[1](fx, fy, fz) * 0.25 + w[2](fx, fy, fz) * 0.125) * 255);
		}
		return out;
	}
	function weatherMap(n = 512, seed = 99) {
		const cov = [perlin3(4, seed), perlin3(8, seed + 1), perlin3(16, seed + 2), perlin3(32, seed + 3)];
		const cells = worley3(24, seed + 4), tall = perlin3(6, seed + 5);
		const out = new Uint8Array(n * n * 2);
		for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
			const fx = (x + 0.5) / n, fy = (y + 0.5) / n;
			const f = cov[0](fx, fy, 0.3) * 0.5 + cov[1](fx, fy, 0.3) * 0.25 + cov[2](fx, fy, 0.3) * 0.15 + cov[3](fx, fy, 0.3) * 0.1;
			const c = Math.max(0, Math.min(1, f * 0.75 + cells(fx, fy, 0.5) * 0.45 - 0.12));
			const k = (y * n + x) * 2;
			out[k] = Math.round(c * 255);
			out[k + 1] = Math.round(Math.max(0, Math.min(1, tall(fx, fy, 0.7) * 1.3 - 0.15)) * 255);
		}
		return out;
	}
	function tex3d(data, n) {
		const t = new THREE.Data3DTexture(data, n, n, n);
		t.format = THREE.RedFormat;
		t.type = THREE.UnsignedByteType;
		t.minFilter = t.magFilter = THREE.LinearFilter;
		t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
		t.unpackAlignment = 1;
		t.needsUpdate = true;
		return t;
	}
	const rtHalf = (w, h) => {
		const rt = new RenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
		rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
		rt.texture.generateMipmaps = false;
		return rt;
	};
	// węzeł tekstury bez aktualizacji dla każdego obiektu (WebGPU: uniform odwrócenia osi Y przy każdym obiekcie)
	const staticTex = (t) => { const n = texture(t); Object.defineProperty(n, 'updateType', { get: () => 'none', set() {} }); return n; };

	class CloudsGPU {
		constructor(renderer, atmo) {
			this.renderer = renderer;
			this.atmo = atmo;
			const W = 512;
			const weather = new THREE.DataTexture(weatherMap(W), W, W, THREE.RGFormat, THREE.UnsignedByteType);
			weather.minFilter = weather.magFilter = THREE.LinearFilter;
			weather.wrapS = weather.wrapT = THREE.RepeatWrapping;
			weather.needsUpdate = true;
			this.shapeTex = texture3D(tex3d(shapeNoise(64), 64));
			this.detailTex = texture3D(tex3d(detailNoise(32), 32));
			this.weatherTex = texture(weather);
			const G = (v) => uniform(v).setGroup(renderGroup);
			this.u = {
				base: G(1500), thickness: G(1600), coverage: G(0.42), extinction: G(0.12), wind: G(new THREE.Vector2()),
				frame: G(0), camPos: G(new THREE.Vector3()), projInv: G(new THREE.Matrix4()), camWorld: G(new THREE.Matrix4()),
				prevViewProj: G(new THREE.Matrix4()), history: G(0), ambient: G(0.5), multi: G(0.35), sunGain: G(2.0), texel: G(new THREE.Vector2(0.5, 0.5)),
				shadowCenter: G(new THREE.Vector2()), shadowSize: G(6000),
			};
			this.windVelocity = new THREE.Vector2(7, 2.5);
			this.setSize(2, 2);
			this.shadowRT = rtHalf(256, 256);
			this.shadowRT.texture.wrapS = this.shadowRT.texture.wrapT = THREE.ClampToEdgeWrapping;
			this.shadowN = 0;
			this._build();
		}
		setSize(w, h) {
			const cw = Math.max(1, Math.floor(w / 2)), ch = Math.max(1, Math.floor(h / 2));
			if (this.rtA && this.rtA.width === cw && this.rtA.height === ch) return;
			this.rtA?.dispose();
			this.rtB?.dispose();
			this.rtA = rtHalf(cw, ch);
			this.rtB = rtHalf(cw, ch);
			this.u.texel.value.set(1 / cw, 1 / ch);
			this.u.history.value = 0;
			if (this.output) this.output.value = this.rtA.texture;
		}
		density(p, height, cheap) {
			const U = this.u;
			const q = p.xz.add(U.wind);
			const w = this.weatherTex.sample(q.div(36000)).level(0);
			const cov = clamp(w.r.sub(float(1).sub(U.coverage).sub(0.1)).div(0.32), 0, 1);
			const h = height.sub(U.base).div(U.thickness);
			const top = mix(float(0.3), float(1.0), w.g).mul(cov.sqrt());
			const grad = smoothstep(0.0, 0.06, h).mul(smoothstep(top.mul(0.4), top, h).oneMinus());
			const s = this.shapeTex.sample(vec3(q.x, height.mul(1.6), q.y).div(2200)).level(0).r;
			const shape = clamp(s.sub(0.4).div(0.5), 0, 1);
			const d0 = clamp(shape.mul(grad).sub(float(1).sub(cov.mul(0.92))).div(max(cov.mul(0.92), 0.02)), 0, 1);
			if (cheap) return d0;
			const dp = vec3(q.x, height.mul(1.3), q.y).add(vec3(0, U.wind.x.mul(0.4), 0)).div(330);
			const detail = this.detailTex.sample(dp).level(0).r;
			const erode = mix(detail.oneMinus(), detail, smoothstep(0.05, 0.4, h)).mul(0.6);
			return clamp(d0.sub(erode.mul(float(1).sub(d0))).div(float(1).sub(erode.mul(0.6))).mul(1.6), 0, 1);
		}
		_build() {
			const U = this.u, atmo = this.atmo, self = this;
			const hg = (g, c) => { const g2 = g * g; return float((1 - g2) / (4 * PI)).div(float(1 + g2).sub(c.mul(2 * g)).pow(1.5)); };
			// przecięcie promienia z kamery (wysokość hc) ze sferą R + H – postać odporna na float32 (lot)
			const shell = (hc, dy, H) => {
				const b = float(EARTH_R).add(hc).mul(dy);
				const cc = hc.sub(H).mul(hc.add(H).add(2 * EARTH_R));
				const disc = b.mul(b).sub(cc);
				const s = sqrt(max(0, disc));
				const q = b.negate().sub(select(b.greaterThanEqual(0), s, s.negate()));
				const r1 = q, r2 = cc.div(select(abs(q).greaterThan(1e-3), q, float(1e-3)));
				return select(disc.greaterThan(0), vec2(min(r1, r2), max(r1, r2)), vec2(-1, -1));
			};
			this.historyNode = texture(this.rtB.texture);
			const cloudFn = Fn(() => {
				const st = uv();
				const dir = normalize(U.camWorld.mul(vec4(getViewPosition(st, float(0.5), U.projInv), 0)).xyz).toVar();
				const hc = U.camPos.y;
				const top = U.base.add(U.thickness);
				const sIn = shell(hc, dir.y, U.base), sOut = shell(hc, dir.y, top), sG = shell(hc, dir.y, float(0));
				const below = hc.lessThan(U.base), above = hc.greaterThan(top);
				const exitDown = select(sIn.x.greaterThan(0), sIn.x, sOut.y);
				const okBelow = sG.x.lessThan(0), okAbove = sOut.x.greaterThan(0);
				const t0 = select(below, select(okBelow, sIn.y, float(0)), select(above, select(okAbove, sOut.x, float(0)), float(0))).toVar();
				const t1raw = select(below, select(okBelow, sOut.y, float(0)), select(above, select(okAbove, exitDown, float(0)), exitDown));
				const t1 = min(t1raw, t0.add(60000)).toVar();
				const L = vec3(0).toVar(), T = float(1).toVar(), depthSum = float(0).toVar(), wSum = float(0).toVar();
				const sun = atmo.u.lightDir;
				const cosT = dot(dir, sun);
				const ph0 = mix(hg(0.8, cosT), hg(-0.25, cosT), 0.25);
				const ph1 = mix(hg(0.4, cosT), hg(-0.12, cosT), 0.25);
				const ph2 = float(1 / (4 * PI));
				const skyE = atmo.skyIrradiance();
				const seg = t1.sub(t0).toVar();
				If(seg.greaterThan(1), () => {
					const jitter = fract(interleavedGradientNoise(screenCoordinate.xy).add(U.frame.mul(0.618034)));
					const stepAt = (tt) => clamp(tt.mul(0.018).add(40), 40, 400);
					const t = t0.add(stepAt(t0).mul(jitter)).toVar();
					Loop({ start: int(0), end: int(110) }, () => {
						If(t.greaterThan(t1), () => { Break(); });
						const dt = stepAt(t);
						const p = U.camPos.add(dir.mul(t));
						const dxz = p.xz.sub(U.camPos.xz);
						const height = p.y.sub(dot(dxz, dxz).div(2 * EARTH_R));
						const d = self.density(p, height, t.greaterThan(25000)).toVar();
						If(d.greaterThan(0.003), () => {
							const sigma = d.mul(U.extinction);
							const od = float(0).toVar();
							let prev = 0;
							for (const s of [60, 140, 260, 480, 900]) {
								const mid = (prev + s) / 2;
								od.addAssign(self.density(p.add(sun.mul(mid)), height.add(sun.y.mul(mid)), true).mul(s - prev));
								prev = s;
							}
							const odS = od.mul(U.extinction);
							const sunLight = atmo.sunLight(max(0, height));
							const hRel = clamp(height.sub(U.base).div(U.thickness), 0, 1);
							const beer = exp(odS.negate()).mul(ph0).add(exp(odS.mul(-0.35)).mul(ph1).mul(0.5).mul(U.multi)).add(exp(odS.mul(-0.12)).mul(ph2).mul(0.25).mul(U.multi));
							const powder = float(1).sub(exp(d.mul(-6))).mul(0.6).add(0.4);
							const ambient = skyE.div(PI).mul(mix(float(0.3), float(0.9), hRel)).mul(U.ambient).add(sunLight.mul(max(0, sun.y)).mul(0.05).mul(float(1).sub(hRel)));
							const S = sunLight.mul(beer).mul(powder).mul(U.sunGain.mul(PI * 1.1)).add(ambient).mul(sigma);
							const tr = exp(sigma.mul(dt).negate());
							const w = T.mul(float(1).sub(tr));
							L.addAssign(T.mul(S.sub(S.mul(tr)).div(max(sigma, 1e-6))));
							depthSum.addAssign(t.mul(w));
							wSum.addAssign(w);
							T.mulAssign(tr);
						});
						t.addAssign(dt);
						If(T.lessThan(0.01), () => { Break(); });
					});
				});
				const dist = select(wSum.greaterThan(1e-4), depthSum.div(max(wSum, 1e-4)), t0.add(seg.mul(0.5))).toVar();
				const { inscatter, transmittance } = atmo.aerial(U.camPos.y.add(250), dir.mul(dist));
				const alpha = float(1).sub(T);
				const current = vec4(L.mul(transmittance).add(inscatter.mul(alpha)), T);
				// akumulacja czasowa: gdzie ten punkt chmury był na ekranie w poprzedniej klatce
				const clip = U.prevViewProj.mul(vec4(U.camPos.add(dir.mul(dist)), 1));
				const ndc = clip.xy.div(clip.w);
				const prevUv = vec2(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)));
				const inside = prevUv.x.greaterThan(0).and(prevUv.x.lessThan(1)).and(prevUv.y.greaterThan(0)).and(prevUv.y.lessThan(1)).and(clip.w.greaterThan(0));
				const hist = self.historyNode.sample(prevUv).level(0);
				const valid = inside.and(U.history.greaterThan(0.5)).and(hist.a.lessThan(1.5));
				return select(seg.greaterThan(1), mix(current, hist, select(valid, float(0.9), float(0))), vec4(0, 0, 0, 1));
			});
			const m = new NodeMaterial();
			m.fragmentNode = cloudFn();
			m.depthTest = m.depthWrite = false;
			this.quad = new QuadMesh(m);
			this.output = texture(this.rtA.texture);
			/* chmury w punkcie ekranu st: namiot 4 × 4 tekseli bufora (wygładza ziarno drgania kroku) */
			this.sample = (st) => {
				const f = st.div(U.texel).sub(0.5);
				const base = f.floor(), fr = f.sub(base);
				const acc = vec4(0).toVar(), wSum = float(0).toVar();
				for (let j = -1; j <= 2; j++) {
					const wy = max(0, float(1).sub(abs(fr.y.sub(j)).div(2)));
					for (let i = -1; i <= 2; i++) {
						const w = max(0, float(1).sub(abs(fr.x.sub(i)).div(2))).mul(wy);
						acc.addAssign(this.output.sample(base.add(vec2(i + 0.5, j + 0.5)).mul(U.texel)).level(0).mul(w));
						wSum.addAssign(w);
					}
				}
				return acc.div(max(wSum, 1e-8));
			};
			// ---- cień chmur na ziemi: tekstura 256² wokół kamery (6 km), trzy próbki gęstości wzdłuż promienia światła ----
			const shadowMat = new NodeMaterial();
			shadowMat.fragmentNode = Fn(() => {
				const xz = uv().sub(0.5).mul(U.shadowSize).add(U.shadowCenter);
				const p = vec3(xz.x, 0, xz.y);
				const sun = atmo.u.lightDir, sy = max(sun.y, 0.06);
				const acc = float(0).toVar();
				for (const fk of [0.15, 0.4, 0.7]) {
					const hy = U.base.add(U.thickness.mul(fk));
					acc.addAssign(self.density(p.add(sun.mul(hy.div(sy))), hy, true));
				}
				const od = acc.div(3).mul(U.extinction).mul(U.thickness.mul(0.6)).div(sy);
				return vec4(vec3(mix(float(0.12), float(1), exp(od.negate()))), 1);
			})();
			shadowMat.depthTest = shadowMat.depthWrite = false;
			this.shadowQuad = new QuadMesh(shadowMat);
			const sTex = staticTex(this.shadowRT.texture);
			this.shadowParams = new THREE.Vector3(0, 0, 6000); // (x, z środka, bok) – kopia dla materiałów
			const sp = uniform(this.shadowParams).setGroup(renderGroup);
			/** Cień chmur w punkcie świata (materiały – kolor światła słońca): 0,12 pełny cień … 1 słońce; poza mapą – 1. */
			this.groundShadow = (pw) => {
				const q = pw.xz.sub(sp.xy).div(sp.z).add(0.5);
				const inMap = q.x.greaterThan(0.005).and(q.x.lessThan(0.995)).and(q.y.greaterThan(0.005)).and(q.y.lessThan(0.995));
				return select(inMap, sTex.sample(q).r, float(1));
			};
		}
		update(dt) {
			this.u.wind.value.addScaledVector(this.windVelocity, dt);
		}
		/* przed rysowaniem sceny (macierze kamery tej klatki): chmury do bufora; co 4 klatki – mapa cieni wokół kamery */
		render(camera) {
			const U = this.u, r = this.renderer, prev = r.getRenderTarget();
			camera.updateMatrixWorld();
			U.camPos.value.copy(camera.position);
			U.projInv.value.copy(camera.projectionMatrixInverse);
			U.camWorld.value.copy(camera.matrixWorld);
			[this.rtA, this.rtB] = [this.rtB, this.rtA];
			this.historyNode.value = this.rtB.texture;
			r.setRenderTarget(this.rtA);
			this.quad.render(r);
			this.output.value = this.rtA.texture;
			if (this.shadowN++ % 4 === 0) {
				// środek mapy przesuwany skokowo (co 1/16 boku) – bez pływania cieni
				const step = U.shadowSize.value / 16;
				U.shadowCenter.value.set(Math.round(camera.position.x / step) * step, Math.round(camera.position.z / step) * step);
				r.setRenderTarget(this.shadowRT);
				this.shadowQuad.render(r);
				this.shadowParams.set(U.shadowCenter.value.x, U.shadowCenter.value.y, U.shadowSize.value);
			}
			r.setRenderTarget(prev);
			U.prevViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
			U.frame.value = (U.frame.value + 1) % 4096;
			U.history.value = 1;
		}
	}

	NS.CloudsGPU = CloudsGPU;
})();
