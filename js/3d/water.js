/* Woda: materiał (fale z kilku kierunków, kolor głębi, efekt Fresnela – im bardziej z ukosa, tym więcej odbicia) i odbicie
   lustrzane (WaterReflection): scena rysowana z kamery odbitej względem lustra najbliższego akwenu, w połowie
   rozdzielczości, z ukośną płaszczyzną przycięcia (to, co pod lustrem, nie zasłania odbicia) – jak Reflector w three.js,
   bez dodatkowych wariantów shaderów. Odbicie zniekształcone falami; akweny na innej wysokości niż lustro – samo niebo
   (mapa otoczenia). */
import * as THREE from 'three';

(function () {
	'use strict';
	const T = THREE;
	const NS = window.Train3D;

	// wspólne dla wszystkich akwenów
	const WU = {
		uReflTex: { value: null },
		uReflMat: { value: new T.Matrix4() },
		uReflOn: { value: 0 },
		uReflY: { value: -1e5 },
		uWTime: { value: 0 },
		uWWind: { value: new T.Vector2(0.8, 0.35) },
	};

	/* materiał wody: cienie chmur ('clean'), fale w shaderze (normalna z sumy fal – 4 kierunki i drobna zmarszczka),
	   odbicie lustrzane z WaterReflection */
	function waterMaterial() {
		const m = NS.util.patch(new T.MeshStandardMaterial({ color: '#18323b', roughness: 0.05, metalness: 0, envMapIntensity: 1.0 }), 'clean');
		const base = m.onBeforeCompile;
		m.customProgramCacheKey = () => 'water2';
		m.onBeforeCompile = (sh, r) => {
			base(sh, r);
			Object.assign(sh.uniforms, WU);
			sh.vertexShader = sh.vertexShader
				.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
				.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
			sh.fragmentShader = sh.fragmentShader
				.replace('#include <common>', `#include <common>
				varying vec3 vWP;
				uniform sampler2D uReflTex; uniform mat4 uReflMat; uniform float uReflOn; uniform float uReflY; uniform float uWTime; uniform vec2 uWWind;
				// wysokość fal (pochodne – normalna): cztery fale kierunkowe (z wiatrem i w poprzek) i drobna zmarszczka
				vec2 waveGrad(vec2 p, float t, float fw) {
					vec2 g = vec2(0.0);
					vec2 wd = normalize(uWWind + vec2(1e-4));
					vec2 dirs[4];
					dirs[0] = wd; dirs[1] = normalize(wd + vec2(-wd.y, wd.x) * 0.6); dirs[2] = normalize(wd - vec2(-wd.y, wd.x) * 0.9); dirs[3] = vec2(-wd.y, wd.x);
					float lens[4]; lens[0] = 9.0; lens[1] = 4.3; lens[2] = 2.1; lens[3] = 1.1;
					float amp = 0.07 + 0.06 * length(uWWind);
					for (int i = 0; i < 4; i++) {
						float k = 6.2831853 / lens[i], w = sqrt(9.81 * k);
						float a = amp * lens[i] / 9.0 * (1.0 - smoothstep(lens[i] * 0.12, lens[i] * 0.35, fw)); // krótsze niż kilka pikseli – wygaszone (bez mory)
						float ph = dot(dirs[i], p) * k - w * t + float(i) * 1.7;
						g += dirs[i] * (a * k * cos(ph));
					}
					return g;
				}`)
				.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
				float wDist = length(vWP - cameraPosition);
				vec2 wg = waveGrad(vWP.xz, uWTime, length(fwidth(vWP.xz))) * (1.0 - smoothstep(150.0, 900.0, wDist) * 0.7);
				vec3 wN = normalize(vec3(-wg.x, 1.0, -wg.y));
				normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`)
				.replace('#include <opaque_fragment>', `
				{
					// odbicie lustrzane (na wysokości lustra) z Fresnelem; zniekształcone falami
					vec3 Vw = normalize(cameraPosition - vWP);
					float F = 0.02 + 0.98 * pow(1.0 - max(dot(wN, Vw), 0.0), 5.0);
					float onPlane = uReflOn * (1.0 - smoothstep(1.2, 4.0, abs(vWP.y - uReflY)));
					if (onPlane > 0.0) {
						vec4 rc = uReflMat * vec4(vWP.x, uReflY, vWP.z, 1.0);
						vec2 ruv = rc.xy / rc.w + wN.xz * 0.035;
						vec3 refl = texture2D(uReflTex, clamp(ruv, vec2(0.002), vec2(0.998))).rgb;
						outgoingLight = mix(outgoingLight, refl, clamp(F * 1.1 + 0.08, 0.0, 1.0) * onPlane);
					}
				}
				#include <opaque_fragment>`);
		};
		m.userData.water = true;
		return m;
	}

	class WaterReflection {
		constructor(renderer) {
			this.gl = renderer;
			this.rt = new T.WebGLRenderTarget(16, 16, { type: T.HalfFloatType, samples: 0 });
			this.cam = new T.PerspectiveCamera();
			this.list = [];
			this.n = 0;
			this.y = null;
			WU.uReflTex.value = this.rt.texture;
			// pomocnicze
			this.v = new T.Vector3(); this.t = new T.Vector3(); this.l = new T.Vector3(); this.rot = new T.Matrix4(); this.pl = new T.Plane(); this.cp = new T.Vector4(); this.q = new T.Vector4(); this.nrm = new T.Vector3(0, 1, 0);
			this.bias = new T.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
		}
		// akweny w świecie (co 30 klatek): siatki z materiałem wody, ich wysokość lustra i środek
		scan(root) {
			this.list = [];
			root.traverse((o) => {
				if (!o.isMesh || !o.material || !o.material.userData || !o.material.userData.water) return;
				const g = o.geometry;
				if (!g.boundingSphere) g.computeBoundingSphere();
				if (!g.boundingBox) g.computeBoundingBox();
				// wysokość lustra: mediana wierzchołków (pasy rzek idą za terenem – skrajne wartości mylą)
				if (g.userData.waterY === undefined) {
					const a = g.attributes.position.array, ys = [];
					for (let i = 1; i < a.length; i += 3 * Math.max(1, Math.floor(a.length / 3 / 400))) ys.push(a[i]);
					ys.sort((x, y) => x - y);
					g.userData.waterY = ys[ys.length >> 1];
				}
				this.list.push({ o, c: g.boundingSphere.center, r: g.boundingSphere.radius, y: g.userData.waterY });
			});
		}
		/* przed klatką: najbliższy akwen (do 1,5 km poza jego zasięgiem) – jego lustro; hide – obiekty ukryte w odbiciu
		   (opady, wnętrze kabiny); scale – rozdzielczość odbicia względem ekranu */
		update(scene, camera, root, time, wind, hide, scale = 0.5) {
			WU.uWTime.value = time;
			if (wind) WU.uWWind.value.copy(wind);
			if (this.n++ % 30 === 0) this.scan(root);
			const cp = camera.position;
			// punkt ok. 200 m przed kamerą (w poziomie) – akwen najbliżej niego (ten, na który się patrzy)
			camera.getWorldDirection(this.t);
			const fl = Math.hypot(this.t.x, this.t.z) || 1, fx = cp.x + (this.t.x / fl) * 200, fz = cp.z + (this.t.z / fl) * 200;
			let best = null;
			for (const w of this.list) {
				if (!w.o.visible) continue;
				const d = Math.max(0, Math.hypot(w.c.x - fx, w.c.z - fz) - w.r);
				if (d < 1500 && cp.y > w.y + 0.3 && (!best || d < best.d)) best = { d, w };
			}
			WU.uReflOn.value = best ? 1 : 0;
			if (!best) return;
			// co druga klatka (połowa kosztu; przesunięcie o klatkę ginie w falach) – chyba że zmienił się akwen
			if (this.n % 2 === 0 && this.y === best.w.y) return;
			this.y = best.w.y;
			const y = best.w.y;
			WU.uReflY.value = y;
			const size = this.gl.getDrawingBufferSize(this.v);
			const W = Math.max(64, Math.round(size.x * scale)), H = Math.max(64, Math.round(size.y * scale));
			if (this.rt.width !== W || this.rt.height !== H) this.rt.setSize(W, H);
			// kamera odbita względem płaszczyzny y
			const C = this.cam;
			C.fov = camera.fov; C.aspect = camera.aspect; C.near = camera.near; C.far = camera.far;
			C.position.set(cp.x, 2 * y - cp.y, cp.z);
			this.rot.extractRotation(camera.matrixWorld);
			this.l.set(0, 0, -1).applyMatrix4(this.rot).add(cp);
			this.t.set(this.l.x, 2 * y - this.l.y, this.l.z);
			C.up.set(0, 1, 0).applyMatrix4(this.rot).reflect(this.nrm);
			C.lookAt(this.t);
			C.updateMatrixWorld();
			C.updateProjectionMatrix();
			// macierz tekstury: świat → współrzędne odbicia (0…1)
			WU.uReflMat.value.copy(this.bias).multiply(C.projectionMatrix).multiply(C.matrixWorldInverse);
			// ukośna płaszczyzna przycięcia (Lengyel) – nic spod lustra
			this.pl.setFromNormalAndCoplanarPoint(this.nrm, this.v.set(cp.x, y, cp.z)).applyMatrix4(C.matrixWorldInverse);
			this.cp.set(this.pl.normal.x, this.pl.normal.y, this.pl.normal.z, this.pl.constant);
			const e = C.projectionMatrix.elements;
			this.q.set((Math.sign(this.cp.x) + e[8]) / e[0], (Math.sign(this.cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
			this.cp.multiplyScalar(2 / this.cp.dot(this.q));
			e[2] = this.cp.x; e[6] = this.cp.y; e[10] = this.cp.z + 1 - 0.003; e[14] = this.cp.w;
			// rysowanie: bez wody, opadów i wnętrza; bez odświeżania cieni
			const hidden = [];
			for (const w of this.list) if (w.o.visible) { w.o.visible = false; hidden.push(w.o); }
			for (const o of hide || []) if (o && o.visible) { o.visible = false; hidden.push(o); }
			const gl = this.gl, prev = gl.getRenderTarget(), auto = gl.shadowMap.autoUpdate;
			gl.shadowMap.autoUpdate = false;
			gl.setRenderTarget(this.rt);
			gl.clear();
			gl.render(scene, C);
			gl.setRenderTarget(prev);
			gl.shadowMap.autoUpdate = auto;
			for (const o of hidden) o.visible = true;
		}
	}

	NS.waterMaterial = waterMaterial;
	NS.WaterReflection = WaterReflection;
	NS.waterUniforms = WU;
})();
