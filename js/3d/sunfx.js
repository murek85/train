/* Przeniesione z projektu Pogranicze Galaktyki (strategy/webgl3d/sun-fx-3d.js) i opakowane jako zwykły skrypt.
   Oryginalny opis poniżej. */
(function () {
'use strict';
const NS = (window.Train3D = window.Train3D || {});
const cloudGlsl = () => NS.cloudGlsl();
const cloudUniforms = () => NS.cloudUniforms();
/* Sunlight effects of the 3D board (on top of webgl3d/sky-3d.js):
   - Shafts: long soft beams of sunlight slanting down through the air towards the ground, where the
     clouds part (the same cloud cover as the sky and the cloud shadows), strongest in the golden hour
     and in hazy air (dust, mist); world-fixed around the camera focus, turned to face the camera
     round their axis. One draw.
   - Lens flare: when the sun is on screen and not behind the ground, a veil of glare round it and a
     chain of rings and glints along the line through the middle of the screen. */

function createSunFx3D(THREE, { scene, heightAt }) {
	// ---------- shafts ----------
	const COUNT = 140,
		quad = new THREE.PlaneGeometry(1, 1),
		g = new THREE.InstancedBufferGeometry();
	g.index = quad.index;
	g.setAttribute("position", quad.attributes.position);
	g.setAttribute("uv", quad.attributes.uv);
	const seeds = new Float32Array(COUNT * 4);
	for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
	g.setAttribute("seed", new THREE.InstancedBufferAttribute(seeds, 4));
	g.instanceCount = COUNT;
	const shaftUniforms = {
		sunDir: { value: new THREE.Vector3(0, 1, 0) },
		sunColor: { value: new THREE.Color("#ffd9a0") },
		focus: { value: new THREE.Vector2() },
		span: { value: 2000 },
		groundY: { value: 0 },
		strength: { value: 0 },
		...cloudUniforms(),
	};
	const shafts = new THREE.Mesh(
		g,
		new THREE.ShaderMaterial({
			uniforms: shaftUniforms,
			vertexShader: `uniform vec3 sunDir; uniform vec2 focus; uniform float span; uniform float groundY;
				attribute vec4 seed; varying float vA; varying vec2 vUv;
				${cloudGlsl()}
				void main() {
					vec2 base = focus - span * 0.5 + mod(seed.xy * span - (focus - span * 0.5), span);
					float len = 520.0 + seed.z * 520.0, w = 26.0 + seed.w * 64.0;
					vec3 ground = vec3(base.x, groundY, base.y), axis = normalize(sunDir) * len;
					vec3 side = normalize(cross(axis, cameraPosition - (ground + axis * 0.5))) * w;
					vec3 pos = ground + axis * (position.x + 0.5) + side * position.y;
					// Light gets through where the clouds part over this point.
					float clear = 1.0 - smoothstep(0.42, 0.66, cloudCover(base / 1300.0 + cloudOffset));
					vec2 rel = abs(base - focus) / span;
					vA = clear * (1.0 - smoothstep(0.3, 0.5, max(rel.x, rel.y))) * (0.5 + 0.5 * seed.z);
					// Forward scattering: brightest looking towards the sun, faint looking away.
					float fwd = max(dot(normalize(pos - cameraPosition), normalize(sunDir)), 0.0);
					vA *= 0.25 + 0.75 * fwd * fwd;
					vUv = uv;
					gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
				}`,
			fragmentShader: `uniform vec3 sunColor; uniform float strength; varying float vA; varying vec2 vUv;
				void main() {
					float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
					float a = vA * strength * pow(sin(vUv.x * 3.14159), 1.3) * across * across;
					gl_FragColor = vec4(sunColor * a, 1.0);
				}`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
			fog: false,
		}),
	);
	shafts.frustumCulled = false;
	shafts.renderOrder = 9;
	scene.add(shafts);

	// ---------- lens flare ----------
	const canvasTex = (draw) => {
		const c = document.createElement("canvas");
		c.width = c.height = 128;
		draw(c.getContext("2d"), 128);
		return new THREE.CanvasTexture(c);
	};
	const glow = canvasTex((x, s) => {
			const r = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
			r.addColorStop(0, "#ffffffff");
			r.addColorStop(0.2, "#ffffff66");
			r.addColorStop(1, "#ffffff00");
			x.fillStyle = r;
			x.fillRect(0, 0, s, s);
		}),
		ring = canvasTex((x, s) => {
			const r = x.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
			r.addColorStop(0, "#ffffff00");
			r.addColorStop(0.7, "#ffffff55");
			r.addColorStop(0.85, "#ffffff22");
			r.addColorStop(1, "#ffffff00");
			x.fillStyle = r;
			x.fillRect(0, 0, s, s);
		}),
		hex = canvasTex((x, s) => {
			x.beginPath();
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2;
				x.lineTo(s / 2 + Math.cos(a) * s * 0.45, s / 2 + Math.sin(a) * s * 0.45);
			}
			x.closePath();
			const r = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
			r.addColorStop(0, "#ffffff40");
			r.addColorStop(1, "#ffffff10");
			x.fillStyle = r;
			x.fill();
		});
	// [place along the line sun → centre → beyond (0 at the sun), size (share of the screen height), texture, colour, strength]
	const ELEMENTS = [
		[0, 0.9, glow, "#fff2d8", 0.45],
		[0, 0.22, glow, "#ffffff", 0.9],
		[0.35, 0.06, hex, "#a8d8ff", 0.5],
		[0.55, 0.11, ring, "#ffd59a", 0.35],
		[0.75, 0.04, hex, "#c8ffd2", 0.5],
		[1.1, 0.14, hex, "#b8c8ff", 0.35],
		[1.4, 0.07, ring, "#ffb0c8", 0.4],
		[1.75, 0.2, ring, "#a8e0ff", 0.25],
	];
	const flares = ELEMENTS.map(([t, size, map, color, power]) => {
		const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, fog: false }));
		sprite.renderOrder = 2000;
		sprite.raycast = () => {};
		sprite.visible = false;
		scene.add(sprite);
		return { sprite, t, size, power };
	});
	const ndc = new THREE.Vector3(),
		at = new THREE.Vector3(),
		probe = new THREE.Vector3();
	let seen = 0;
	const lookDir = new THREE.Vector3();

	return {
		// Every frame: sun direction (true, may be below the horizon), its colour, e (its height), haze and
		// mist 0…1, the camera and the focus of the view (map point) with the span of the view.
		update({ camera, imageRays = false, sunDir, sunColor, e, haze = 0, mist = 0, focus, span }) {
			// Shafts: in the golden hour, and in dusty or misty air; never at night.
			const golden = Math.max(0, Math.min(1, (e - 0.02) / 0.1)) * (1 - Math.max(0, Math.min(1, (e - 0.3) / 0.25)));
			// A thick storm (sand, snow) hides the sun: light dust and mist show the shafts, a dense one does not —
			// seen from above they would stand as hard parallel lines over the board.
			const thick = Math.max(0, Math.min(1, (haze - 0.2) / 0.3));
			// Only looking out towards the horizon: seen from above (the usual view of the board) the beams stand
			// as thin parallel white lines over the ground.
			const down = -camera.getWorldDirection(lookDir).y,
				side = 1 - Math.max(0, Math.min(1, (down - 0.45) / 0.3));
			// With the cinematic atmosphere the shafts are drawn in the image itself (webgl3d/post-3d.js): none here.
			shaftUniforms.strength.value = e > 0 && !imageRays ? Math.min(0.1, golden * 0.06 + haze * 0.05 + mist * 0.05) * (1 - thick) * side : 0;
			shafts.visible = shaftUniforms.strength.value > 0.002;
			shaftUniforms.sunDir.value.copy(sunDir);
			shaftUniforms.sunColor.value.copy(sunColor);
			shaftUniforms.focus.value.set(focus.x, focus.y);
			shaftUniforms.span.value = span;
			shaftUniforms.groundY.value = heightAt(focus.x, focus.y);
			// Flare: the sun on screen, above the horizon, not behind the ground (a few steps along the ray).
			// (A point close in front of the camera along the sun's direction: within the far plane.)
			camera.getWorldDirection(probe);
			const ahead = probe.dot(sunDir) > 0.05;
			ndc.copy(camera.position).addScaledVector(sunDir, camera.near * 20).project(camera);
			let vis = e > -0.02 && ahead && Math.abs(ndc.x) < 1.25 && Math.abs(ndc.y) < 1.25 ? 1 : 0;
			if (vis)
				for (let k = 1; k <= 14; k++) {
					probe.copy(camera.position).addScaledVector(sunDir, k * 180);
					if (heightAt(probe.x, probe.z) > probe.y) {
						vis = 0;
						break;
					}
				}
			const edge = 1 - Math.max(0, Math.min(1, (Math.max(Math.abs(ndc.x), Math.abs(ndc.y)) - 0.8) / 0.45));
			seen += ((vis ? edge * (1 - Math.min(1, haze * 1.3)) * Math.max(0, Math.min(1, (e + 0.02) / 0.08)) : 0) - seen) * 0.2;
			const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
			for (const f of flares) {
				f.sprite.visible = seen > 0.01;
				if (!f.sprite.visible) continue;
				at.set(ndc.x * (1 - f.t * 2), ndc.y * (1 - f.t * 2), 0.2).unproject(camera);
				const d = at.distanceTo(camera.position);
				f.sprite.position.copy(at);
				f.sprite.scale.setScalar(f.size * 2 * d * tanHalf);
				f.sprite.material.opacity = seen * f.power;
			}
		},
	};
}

NS.createSunFx3D = createSunFx3D;
})();
