/* Horyzont: dwa pierścienie wokół kamery, zawsze w tej samej odległości (nigdy się do nich nie dojeżdża), kolor
   mieszany z mgłą oddalenia. Daleki – sylwetka terenu: dla tras rzeczywistych z danymi (route.horizon – js/horizon-
   data.js, tools/horizon.js, Generator) wysokość wierzchołka = R · tg(kąt wzniesienia terenu w tym kierunku) w bieżącym
   miejscu trasy (płasko – prawie zero, Beskidy z Rybnika – kilka stopni); bez danych – łagodne pagórki. Bliski – niska
   linia lasów i zabudowy (dawniej druga warstwa wzgórz – góry „znikąd” na płaskim terenie). */
(function () {
	'use strict';
	const T = window.THREE;
	const NS = window.Train3D;

	function ring(radius, base, amps, seed) {
		const seg = 360;
		const pos = [], shade = [], idx = [];
		for (let i = 0; i <= seg; i++) {
			const a = (i / seg) * Math.PI * 2;
			let h = base;
			amps.forEach(([f, amp], k) => {
				h += amp * (0.5 + 0.5 * Math.sin(a * f + seed * (k + 1) * 1.7 + Math.sin(a * (f + 1) + seed) * 0.6));
			});
			const x = Math.sin(a) * radius, z = -Math.cos(a) * radius;
			pos.push(x, -80, z, x, h * 0.45, z, x, h, z);
			shade.push(0, 0.55, 1);
			if (i < seg) {
				const o = i * 3;
				for (let r = 0; r < 2; r++) idx.push(o + r, o + r + 3, o + r + 1, o + r + 1, o + r + 3, o + r + 4);
			}
		}
		const g = new T.BufferGeometry();
		g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
		g.setAttribute('shade', new T.Float32BufferAttribute(shade, 1));
		g.setIndex(idx);
		return g;
	}

	const FAR = 2250;

	class Horizon {
		constructor(scene) {
			this.group = new T.Group();
			this.layers = [
				{ geo: ring(FAR, 20, [[3, 40], [7, 24], [13, 12], [29, 6]], 1.3), color: new T.Color('#5d6f8c'), haze: 0.62 },
				{ geo: ring(1650, 4, [[37, 7], [71, 5], [13, 4], [113, 3]], 4.1), color: new T.Color('#3f5636'), haze: 0.42 },
			].map((L) => {
				const m = new T.ShaderMaterial({
					uniforms: { col: { value: L.color.clone() }, haze: { value: new T.Color() }, k: { value: L.haze } },
					vertexShader: 'attribute float shade; varying float vShade; void main() { vShade = shade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
					fragmentShader: `uniform vec3 col; uniform vec3 haze; uniform float k; varying float vShade;
						void main() {
							vec3 c = mix(haze, col, (1.0 - k) * (0.35 + 0.65 * vShade));
							gl_FragColor = vec4(c, 1.0);
							#include <tonemapping_fragment>
							#include <colorspace_fragment>
						}`,
					fog: false,
					side: T.DoubleSide,
				});
				const mesh = new T.Mesh(L.geo, m);
				mesh.frustumCulled = false;
				mesh.renderOrder = 900;
				this.group.add(mesh);
				return { mesh, base: L.color.clone(), haze: L.haze };
			});
			this.farBase = Float32Array.from(this.layers[0].mesh.geometry.attributes.position.array);
			this.data = null;
			this.angles = null;
			this.lastS = null;
			scene.add(this.group);
		}

		// trasa: z danymi horyzontu – daleki pierścień z prawdziwego terenu; bez – pagórki
		setRoute(route) {
			this.data = route && route.horizon && route.horizon.anchors && route.horizon.anchors.length ? route.horizon : null;
			this.angles = this.data ? new Float32Array(this.data.anchors[0].length - 1) : null;
			this.lastS = null;
			const pos = this.layers[0].mesh.geometry.attributes.position;
			if (!this.data) { pos.array.set(this.farBase); pos.needsUpdate = true; }
		}
		// daleki pierścień wg profilu w miejscu s (co 100 m; kierunki pierścienia: 361 punktów, profil – co 2°)
		updateFar(s) {
			if (!this.data || (this.lastS !== null && Math.abs(s - this.lastS) < 100)) return;
			this.lastS = s;
			const A = window.TrainHorizonData.sample(this.data, s, this.angles), n = A.length;
			const pos = this.layers[0].mesh.geometry.attributes.position, arr = pos.array, seg = arr.length / 9 - 1;
			for (let i = 0; i <= seg; i++) {
				const f = (i / seg) * n, k = Math.floor(f) % n, t = f - Math.floor(f);
				const ang = A[k] + (A[(k + 1) % n] - A[k]) * t;
				// trochę ponad linię wzroku nawet na płaskim terenie (przykrywa krawędź świata), najwyżej ok. 12°
				const h = Math.max(6, FAR * Math.tan(Math.min(0.21, ang)) + 6);
				arr[i * 9 + 4] = h * 0.45;
				arr[i * 9 + 7] = h;
			}
			pos.needsUpdate = true;
		}

		// haze: kolor horyzontu (liniowy); light: jasność 0…1; extraHaze: mgła z pogody 0…1
		update(camera, groundY, haze, light, extraHaze, s) {
			if (s !== undefined) this.updateFar(s);
			this.group.position.set(camera.position.x, groundY, camera.position.z);
			for (const L of this.layers) {
				const u = L.mesh.material.uniforms;
				u.haze.value.copy(haze);
				u.col.value.copy(L.base).multiplyScalar(0.25 + 0.75 * light);
				u.k.value = Math.min(0.97, L.haze + extraHaze * 0.6);
			}
			this.group.visible = extraHaze < 0.8;
		}
	}

	NS.Horizon = Horizon;
})();
