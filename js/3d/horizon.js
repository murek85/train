/* Horyzont: dwa pierścienie dalekich wzgórz i gór wokół kamery. Zawsze w tej samej odległości,
   więc nigdy się do nich nie dojeżdża; kolor mieszany z mgłą oddalenia. */
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

	class Horizon {
		constructor(scene) {
			this.group = new T.Group();
			this.layers = [
				{ geo: ring(2250, 90, [[3, 160], [7, 90], [13, 45], [29, 18]], 1.3), color: new T.Color('#5d6f8c'), haze: 0.62 },
				{ geo: ring(1650, 25, [[5, 55], [11, 30], [23, 14], [47, 6]], 4.1), color: new T.Color('#4c6a3c'), haze: 0.42 },
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
			scene.add(this.group);
		}

		// haze: kolor horyzontu (liniowy); light: jasność 0…1; extraHaze: mgła z pogody 0…1
		update(camera, groundY, haze, light, extraHaze) {
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
