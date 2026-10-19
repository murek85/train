/* Przeniesione z projektu Pogranicze Galaktyki (strategy/webgl3d/sky-3d.js) i opakowane jako zwykły skrypt.
   Oryginalny opis poniżej. */
import * as THREE from 'three';

(function () {
'use strict';
const NS = (window.Train3D = window.Train3D || {});
/* Sky of the 3D board: a dome around the camera with the colours of the time of day (blue noon, golden
   hour, orange sunset, blue hour, moonlit night), the sun's disk and glow, the moon (a gibbous phase,
   faint maria, a halo, phases), stars of many colours and magnitudes and the Milky Way turning slowly
   at night, meteors and satellites, the aurora (ice maps), the planet's shadow and the belt of Venus at
   twilight, the second sun and planets or moons of the map's world, high cirrus over the clouds, and drifting clouds. The
   same clouds cast soft shadows drifting over the terrain and the models: cloudShade() puts them into
   the sun (moon) light of a material's shader.
   The game camera looks down steeply, so the dome mostly shows when the camera is tilted (prototype)
   and in reflections; its horizon colour is also the colour of the distance haze. */

// Cloud cover shared by the sky and the shadows on the ground: offset (drift) and amount of shadow.
const SKY_CLOUDS = { cloudAmount: { value: 0 }, cloudOffset: { value: new THREE.Vector2() }, cloudThr: { value: 0.55 } };
const SKY_CLOUD_GLSL = `
	uniform float cloudAmount; uniform vec2 cloudOffset; uniform float cloudThr;
	float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
	float cloudNoise(vec2 p) {
		vec2 i = floor(p), f = fract(p);
		f = f * f * (3.0 - 2.0 * f);
		return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y);
	}
	float cloudCover(vec2 p) { return cloudNoise(p) * 0.55 + cloudNoise(p * 2.3 + 5.2) * 0.3 + cloudNoise(p * 5.1 - 1.7) * 0.15; }
	// Light let through the clouds at a point of the view space (1 clear … 1 - cloudAmount in shadow).
	float cloudShadow(vec3 viewPos) {
		if (cloudAmount <= 0.0) return 1.0;
		vec3 world = transpose(mat3(viewMatrix)) * (viewPos - viewMatrix[3].xyz);
		// (ten sam próg co chmury na niebie – cień leży pod chmurą)
		return 1.0 - cloudAmount * smoothstep(cloudThr, cloudThr + 0.22, cloudCover(world.xz / 1300.0 + cloudOffset));
	}`;

// The cloud cover for other shaders (sunbeams through the gaps): its GLSL and its shared uniforms.
function cloudGlsl() {
	return SKY_CLOUD_GLSL;
}
function cloudUniforms() {
	return SKY_CLOUDS;
}
// Cloud shadows in a material: the directional lights (sun or moon) dimmed under the clouds. Call from
// onBeforeCompile; the uniforms are shared, so every material follows the same clouds.
function cloudShade(THREE, shader) {
	Object.assign(shader.uniforms, SKY_CLOUDS);
	shader.fragmentShader = shader.fragmentShader
		.replace("#include <common>", "#include <common>\n" + SKY_CLOUD_GLSL)
		.replace(
			"#include <lights_fragment_begin>",
			THREE.ShaderChunk.lights_fragment_begin.replace(
				"getDirectionalLightInfo( directionalLight, directLight );",
				"getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= cloudShadow( geometryPosition );",
			),
		);
}

function createSky3D(THREE) {
	const C = (hex) => new THREE.Color(hex);
	// Colours by the sun's height: [elevation, zenith, horizon, sunlight].
	const KEYS = [
		[-1, "#03060e", "#0b1424", "#ff6a3a"],
		[-0.25, "#050a17", "#111c31", "#ff6a3a"],
		[-0.1, "#111d3c", "#2f3659", "#ff6a3a"],
		[-0.02, "#2a2c62", "#a8607a", "#ff7444"],
		[0.03, "#36407a", "#f07848", "#ff8a50"],
		[0.12, "#3d5c94", "#f0ae74", "#ffc184"],
		[0.3, "#3c70a6", "#a8c2d2", "#fff0d8"],
		[1, "#3874b0", "#b2cada", "#fff4e4"],
	].map(([e, z, h, s]) => [e, C(z), C(h), C(s)]);
	function palette(e, zenith, horizon, sunlight) {
		let i = 0;
		while (i < KEYS.length - 2 && e > KEYS[i + 1][0]) i++;
		const [e0, z0, h0, s0] = KEYS[i],
			[e1, z1, h1, s1] = KEYS[i + 1],
			t = Math.max(0, Math.min(1, (e - e0) / (e1 - e0)));
		zenith.copy(z0).lerp(z1, t);
		horizon.copy(h0).lerp(h1, t);
		sunlight.copy(s0).lerp(s1, t);
	}

	const uniforms = {
		zenith: { value: C("#3874b0") },
		horizon: { value: C("#b2cada") },
		sunColor: { value: C("#fff4e4") },
		sunDir: { value: new THREE.Vector3(0, 1, 0) },
		moonDir: { value: new THREE.Vector3(0.55, 0.42, -0.7).normalize() },
		sunVis: { value: 1 },
		moonVis: { value: 0 },
		starVis: { value: 0 },
		cover: { value: 0.4 },
		cloudLight: { value: C("#ffffff") },
		skyTime: { value: 0 },
		cloudOffset: SKY_CLOUDS.cloudOffset,
		cloudThr: SKY_CLOUDS.cloudThr,
		// chmury wolumetryczne: położenie kamery (chmury zakotwiczone w świecie), liczba kroków (jakość)
		camPos: { value: new THREE.Vector3() },
		cloudSteps: { value: 64 },
		cloudTex: { value: null },
		// Moon phase 0…1: 0 new, 0.5 full (lit from the side facing the sun).
		moonPhase: { value: 0.62 },
		// Aurora 0…1 (ice maps at night).
		aurora: { value: 0 },
		// łuna miasta nocą (kolor × siła): jaśniejszy pas nad horyzontem, chmury podświetlone od spodu
		cityGlow: { value: C("#000000") },
		// The sky of the map's world (setTheme): a second sun (direction, colour × visibility) and up to
		// two bodies — planets or moons: [direction xyz, angular radius], [colour A, ring 0/1], [colour B].
		sun2Dir: { value: new THREE.Vector3(0, 1, 0) },
		sun2Color: { value: C("#000000") },
		bodyDir: { value: [new THREE.Vector4(0, 1, 0, 0), new THREE.Vector4(0, 1, 0, 0)] },
		bodyA: { value: [new THREE.Vector4(), new THREE.Vector4()] },
		bodyB: { value: [new THREE.Vector4(), new THREE.Vector4()] },
		clear: { value: 1 },
	};
	const material = new THREE.ShaderMaterial({
		uniforms,
		vertexShader: `
			varying vec3 vDir;
			void main() {
				vDir = position;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: `
			uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; uniform vec3 moonDir;
			uniform float sunVis; uniform float moonVis; uniform float starVis; uniform float cover; uniform vec3 cloudLight;
			uniform float skyTime; uniform vec2 cloudOffset; uniform float moonPhase; uniform float aurora; uniform vec3 cityGlow;
			uniform float cloudThr; uniform vec3 camPos; uniform float cloudSteps; uniform sampler2D cloudTex;
			uniform vec3 sun2Dir; uniform vec3 sun2Color; uniform vec4 bodyDir[2]; uniform vec4 bodyA[2]; uniform vec4 bodyB[2]; uniform float clear;
			varying vec3 vDir;
			float skyHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
			float skyNoise(vec2 p) {
				vec2 i = floor(p), f = fract(p);
				f = f * f * (3.0 - 2.0 * f);
				float a = skyHash(vec3(i, 0.0)), b = skyHash(vec3(i + vec2(1.0, 0.0), 0.0)), c = skyHash(vec3(i + vec2(0.0, 1.0), 0.0)), d = skyHash(vec3(i + vec2(1.0, 1.0), 0.0));
				return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
			}
			float skyFbm(vec2 p) { return skyNoise(p) * 0.55 + skyNoise(p * 2.3 + 5.2) * 0.3 + skyNoise(p * 5.1 - 1.7) * 0.15; }
			float skyNoise3(vec3 p) {
				vec3 i = floor(p), f = fract(p);
				f = f * f * (3.0 - 2.0 * f);
				return mix(mix(mix(skyHash(i), skyHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(skyHash(i + vec3(0.0, 1.0, 0.0)), skyHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
					mix(mix(skyHash(i + vec3(0.0, 0.0, 1.0)), skyHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(skyHash(i + vec3(0.0, 1.0, 1.0)), skyHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
			}
			float skyFbm3(vec3 p) { return skyNoise3(p) * 0.55 + skyNoise3(p * 2.3 + 5.2) * 0.3 + skyNoise3(p * 5.1 - 1.7) * 0.15; }
			/* mapa zachmurzenia – jak cloudCover() w cieniach na ziemi (ten sam szum i skala 1300 m), żeby cień był pod
			   chmurą */
			float cvHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
			float cvNoise(vec2 p) {
				vec2 i = floor(p), f = fract(p);
				f = f * f * (3.0 - 2.0 * f);
				return mix(mix(cvHash(i), cvHash(i + vec2(1.0, 0.0)), f.x), mix(cvHash(i + vec2(0.0, 1.0)), cvHash(i + vec2(1.0, 1.0)), f.x), f.y);
			}
			float cvCover(vec2 p) { return cvNoise(p) * 0.55 + cvNoise(p * 2.3 + 5.2) * 0.3 + cvNoise(p * 5.1 - 1.7) * 0.15; }
			/* gęstość chmury w punkcie świata (y – wysokość nad kamerą): podstawa płaska, ku górze zwężenie (kłęby),
			   brzegi rozmyte szumem 3D; przy zachmurzeniu całkowitym – zwarta, niska warstwa */
			const float CB = 1100.0;
			float cloudTop() { return CB + mix(1500.0, 650.0, smoothstep(0.82, 1.0, cover)); }
			float cloudDens(vec3 w) {
				float h = (w.y - CB) / (cloudTop() - CB);
				if (h < 0.0 || h > 1.0) return 0.0;
				// mapa zachmurzenia lekko falująca z wysokością (bez pionowych „kolumn”), ku górze węższa (kłęby, wierzchołki)
				vec2 warp = (vec2(skyNoise3(w * 0.0009), skyNoise3(w * 0.0009 + 17.0)) - 0.5) * 520.0;
				float cv = cvCover((w.xz + warp) / 1300.0 + cloudOffset) - h * h * 0.28;
				float base = smoothstep(cloudThr, cloudThr + 0.2, cv);
				if (base <= 0.0) return 0.0;
				// kłęby szersze niż wyższe (oś pionowa ściśnięta), trzy oktawy szumu – od ok. 400 m do kilkudziesięciu metrów
				vec3 q = vec3(w.x, w.y * 1.7, w.z) * 0.0026 + vec3(skyTime * 0.006, 0.0, skyTime * 0.004);
				float det = skyNoise3(q) * 0.5 + skyNoise3(q * 2.9 + 3.1) * 0.3 + skyNoise3(q * 7.3 - 1.3) * 0.2;
				float shape = base * smoothstep(0.0, 0.06, h);
				return clamp((shape - (1.0 - det) * 0.55 * (1.0 - 0.4 * base)) * 1.7, 0.0, 1.0);
			}
			vec3 skyRot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
			// One layer of stars: at most one in a cell of a grid on the sphere (scale cells across), kept
			// above the threshold; a colour by temperature (red, yellow, white, blue), a magnitude (most
			// faint, a few bright), at least a pixel wide (fainter when smaller, so they don't shimmer),
			// twinkling, more near the horizon (h); the bright ones with a cross of diffraction spikes.
			vec3 skyStars(vec3 ds, float scale, float keep, float rad, float h, float spikes, float pxd) {
				vec3 g = ds * scale, cell = floor(g);
				float r = skyHash(cell);
				if (r < keep) return vec3(0.0);
				vec3 at = cell + 0.5 + (vec3(skyHash(cell + 1.3), skyHash(cell + 2.7), skyHash(cell + 4.1)) - 0.5) * 0.7;
				vec3 off = g - at;
				float px = max(pxd * scale * 0.7, 1e-4), rr = max(rad, px);
				float mag = pow(fract(r * 97.0), 3.0);
				float b = exp(-dot(off, off) / (rr * rr)) * (rad * rad) / (rr * rr) * 3.0;
				float t = fract(r * 531.0);
				vec3 tint = t < 0.14 ? vec3(1.0, 0.7, 0.5) : t < 0.36 ? vec3(1.0, 0.9, 0.74) : t < 0.78 ? vec3(0.96, 0.97, 1.0) : vec3(0.7, 0.8, 1.0);
				float low = 1.0 - smoothstep(0.0, 0.35, h);
				float tw = max(0.0, 1.0 + (0.18 + 0.55 * low) * (sin(skyTime * (3.0 + r * 7.0) + r * 60.0) * 0.6 + sin(skyTime * (7.3 + r * 3.0) + r * 13.0) * 0.4));
				if (spikes > 0.0 && mag > 0.45) {
					vec3 tx = normalize(cross(ds, vec3(0.0, 1.0, 0.0))), ty = cross(tx, ds);
					vec2 o = vec2(dot(off, tx), dot(off, ty)) / px;
					b += (exp(-abs(o.x) * 1.5 - abs(o.y) * 0.5) + exp(-abs(o.y) * 1.5 - abs(o.x) * 0.5)) * exp(-dot(o, o) * 0.03) * (mag - 0.45) * spikes;
				}
				return tint * b * (0.2 + 2.6 * mag) * tw;
			}
			void main() {
				vec3 d = normalize(vDir);
				float h = d.y;
				// The size of a pixel on the sky (taken here, in uniform control flow).
				float pxd = max(length(fwidth(d)), 1e-4);
				// Gradient: horizon → zenith; below the horizon the haze darkens a little.
				vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.65, h), 0.55));
				col = mix(col, horizon * 0.7, smoothstep(0.0, -0.4, h));
				// Twilight opposite the sun: the planet's shadow rising as a blue-grey band over the horizon,
				// the pink belt of Venus above it.
				float tw = smoothstep(-0.16, -0.03, sunDir.y) * (1.0 - smoothstep(0.02, 0.1, sunDir.y));
				if (tw > 0.0) {
					float anti = max(-dot(normalize(d.xz + 1e-5), normalize(sunDir.xz + 1e-5)), 0.0);
					float top = clamp(0.03 - sunDir.y * 0.9, 0.02, 0.18);
					float belt = (1.0 - smoothstep(top - 0.02, top + 0.01, h)) * smoothstep(-0.06, 0.0, h);
					float venus = exp(-pow((h - top - 0.05) / 0.045, 2.0));
					float wb = tw * pow(anti, 1.3);
					col = mix(col, col * vec3(0.55, 0.6, 0.82) + vec3(0.015, 0.025, 0.06), belt * wb * 0.75);
					col += vec3(0.42, 0.22, 0.28) * venus * wb * 0.3;
				}
				// The sun: a wide warm glow (stronger along the horizon at sunset), the corona and the disk.
				float s = max(dot(d, sunDir), 0.0);
				col += sunColor * (pow(s, 6.0) * 0.22 * (1.0 + 1.5 * (1.0 - smoothstep(0.0, 0.25, abs(h)))) + pow(s, 90.0) * 0.6) * sunVis;
				col += sunColor * smoothstep(0.99955, 0.9998, s) * 14.0 * sunVis;
				// The second sun (twin-sun worlds): smaller, its own glow.
				float s2 = max(dot(d, sun2Dir), 0.0);
				col += sun2Color * (pow(s2, 14.0) * 0.12 + pow(s2, 160.0) * 0.5 + smoothstep(0.99984, 0.99993, s2) * 4.5);
				float full = 0.5 - 0.5 * cos(moonPhase * 6.2832);
				// The night sky: stars and the galaxy turning slowly round the pole; meteors, satellites.
				if (starVis > 0.0) {
					vec3 ds = skyRot(d, normalize(vec3(0.0, 0.8, -0.6)), skyTime * 0.0035);
					// The Milky Way: a band along a great circle, wider and warmer at the bright core, clumped,
					// split by dark dust lanes along its middle; washed out by a full moon.
					vec3 N = normalize(vec3(0.35, 0.55, 0.75)), U = normalize(cross(N, vec3(0.0, 0.0, 1.0))), V = cross(N, U);
					float lat = dot(ds, N);
					float core = exp(-pow(distance(ds, normalize(U * 0.8 + V * 0.6)), 2.0) * 5.0);
					float w = 0.12 + 0.09 * core + 0.035 * skyNoise3(ds * 3.0);
					float band = exp(-lat * lat / (w * w));
					float clumps = skyFbm3(ds * 6.0);
					float dust = smoothstep(0.42, 0.72, skyFbm3(ds * 12.0 + 3.1)) * exp(-pow(lat / (w * 0.5) - 0.12, 2.0));
					float mw = band * (0.3 + 0.7 * clumps) * (1.0 - 0.8 * dust) * (0.55 + 1.6 * core) * (1.0 - 0.6 * full * moonVis);
					vec3 sky = mix(vec3(0.5, 0.58, 0.85), vec3(1.0, 0.85, 0.66), core) * mw * 0.13;
					// Two layers of stars: many faint (denser in the band), fewer bright with spikes.
					sky += skyStars(ds, 300.0, 0.955 - 0.06 * band, 0.12, h, 0.0, pxd) * 0.55;
					sky += skyStars(ds, 75.0, 0.982, 0.06, h, 0.7, pxd);
					// Meteors: now and then a streak flashing across, its tail fading.
					for (int i = 0; i < 3; i++) {
						float fi = float(i), k = skyTime / (8.0 + fi * 5.0) + fi * 0.37, id = floor(k), u = fract(k) / 0.08;
						if (u < 1.0) {
							vec3 S = normalize(vec3(skyHash(vec3(id, fi, 1.0)) - 0.5, 0.3 + 0.5 * skyHash(vec3(id, fi, 2.0)), skyHash(vec3(id, fi, 3.0)) - 0.5));
							vec3 T0 = vec3(skyHash(vec3(id, fi, 4.0)) - 0.5, -0.45 * skyHash(vec3(id, fi, 5.0)), skyHash(vec3(id, fi, 6.0)) - 0.5);
							vec3 T = normalize(T0 - S * dot(T0, S)), B = cross(S, T);
							float len = 0.1 + 0.12 * skyHash(vec3(id, fi, 7.0)), head = u * len * 1.6;
							if (dot(d, S) > 0.85) {
								float px = pxd, along = dot(d, T), across = dot(d, B);
								float tail = (head - along) / (len * 0.6);
								float on = step(0.0, tail) * step(tail, 1.0) * pow(1.0 - clamp(tail, 0.0, 1.0), 1.5);
								sky += vec3(1.0, 0.95, 0.86) * exp(-across * across / (px * px * 1.2)) * on * sin(u * 3.14159) * 1.4;
							}
						}
					}
					// Satellites: steady dim points crawling across the sky along their orbits.
					for (int i = 0; i < 2; i++) {
						float fi = float(i);
						vec3 On = normalize(vec3(sin(fi * 2.3 + 0.4) * 0.7, 0.3, cos(fi * 2.3 + 0.4) * 0.7));
						vec3 A = normalize(cross(On, vec3(0.0, 1.0, 0.0))), Bo = cross(On, A);
						float ang = skyTime / (110.0 + fi * 70.0) * 3.14159 + fi * 2.0;
						vec3 sat = cos(ang) * A + sin(ang) * Bo;
						float px = pxd;
						sky += vec3(0.95, 0.95, 0.9) * exp(-dot(d - sat, d - sat) / (px * px * 0.8)) * 0.5 * step(0.05, sat.y);
					}
					col += sky * starVis * smoothstep(-0.02, 0.12, h);
				}
				// Aurora: curtains of green light, red and violet towards their tops, rippling slowly, with
				// rays (vertical in the world, so converging on the zenith).
				if (aurora > 0.0 && h > 0.0) {
					vec2 q = d.xz / (h + 0.06);
					float lane = q.y * 0.45 + sin(q.x * 0.32 + skyTime * 0.05) * 1.3 + sin(q.x * 0.85 - skyTime * 0.09) * 0.45 + skyNoise(q * 0.4 + skyTime * 0.02) * 0.8;
					float curt = exp(-pow(lane - 1.2, 2.0) * 2.5) + exp(-pow(lane + 0.9, 2.0) * 3.5) * 0.6;
					vec2 az = normalize(d.xz + 1e-5);
					float rays = (0.4 + 0.6 * skyNoise(az * 22.0 + vec2(skyTime * 0.25, lane))) * (0.6 + 0.4 * skyNoise(az * 70.0 - vec2(0.0, skyTime * 0.6)));
					float vert = smoothstep(0.03, 0.1, h) * (1.0 - smoothstep(0.22, 0.65, h));
					vec3 ac = mix(vec3(0.15, 1.0, 0.5), vec3(0.8, 0.25, 0.75), smoothstep(0.14, 0.5, h));
					col += ac * curt * rays * vert * aurora * 0.6;
				}
				// Planets and moons of the map's world: a disk lit by the sun (a terminator), banded, with a thin
				// atmosphere at the rim and a tilted ring (behind the disk above, in front below); faint by day.
				for (int k = 0; k < 2; k++) {
					vec4 bd = bodyDir[k];
					if (bd.w <= 0.0) continue;
					vec3 bdir = normalize(bd.xyz);
					if (dot(d, bdir) < 0.6) continue;
					vec3 right = normalize(cross(bdir, vec3(0.0, 1.0, 0.0))), up = cross(right, bdir);
					vec2 p = vec2(dot(d, right), dot(d, up)) / bd.w;
					vec2 pt = mat2(0.94, -0.34, 0.34, 0.94) * p;
					float r2 = dot(p, p), vis = (1.0 - 0.55 * sunVis) * clear * smoothstep(-0.01, 0.05, h);
					vec2 rp = vec2(pt.x, pt.y / 0.26);
					float rr = length(rp);
					float ring = bodyA[k].w * smoothstep(1.3, 1.36, rr) * (1.0 - smoothstep(2.05, 2.15, rr)) * (0.55 + 0.45 * sin(rr * 46.0)) * (1.0 - 0.6 * smoothstep(1.62, 1.66, rr) * (1.0 - smoothstep(1.7, 1.74, rr)));
					vec3 ringCol = mix(bodyA[k].rgb, bodyB[k].rgb, 0.4) * (0.35 + 0.65 * clamp(dot(sunDir, up) * 0.5 + 0.6, 0.0, 1.0));
					if (pt.y > 0.0) col = mix(col, ringCol, ring * 0.8 * vis);
					if (r2 < 1.0) {
						vec3 n = vec3(p, sqrt(1.0 - r2));
						vec3 wn = right * n.x + up * n.y - bdir * n.z;
						float lit = smoothstep(-0.08, 0.25, dot(wn, sunDir));
						float bands = skyFbm(vec2(pt.y * 7.0 + float(k) * 3.0, pt.x * 0.8 + skyNoise(vec2(pt.y * 20.0, float(k))) * 0.4));
						vec3 surf = mix(bodyA[k].rgb, bodyB[k].rgb, smoothstep(0.35, 0.65, bands)) * (0.04 + 0.85 * lit) * (0.75 + 0.25 * n.z);
						col = mix(col, surf, vis * smoothstep(1.0, 0.94, r2));
					} else {
						col += bodyA[k].rgb * (1.0 - smoothstep(1.0, 1.25, sqrt(r2))) * 0.12 * vis;
					}
					if (pt.y <= 0.0) col = mix(col, ringCol, ring * 0.8 * vis);
				}
				// The moon: a disk lit from one side (gibbous), darker maria, a soft halo.
				if (moonVis > 0.0) {
					float m = dot(d, moonDir);
					vec3 right = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0))), up = cross(right, moonDir);
					vec2 p = vec2(dot(d, right), dot(d, up)) / 0.022;
					float r2 = dot(p, p);
					if (m > 0.0 && r2 < 1.0) {
						vec3 n = vec3(p, sqrt(1.0 - r2));
						// The phase: the light comes round from behind (new) over the side to the front (full).
						float ph = moonPhase * 6.2832;
						float lit = smoothstep(-0.06, 0.1, dot(n, normalize(vec3(-sin(ph), 0.15, -cos(ph)))));
						float maria = 0.78 + 0.22 * smoothstep(0.35, 0.65, skyNoise(p * 2.2 + 3.0));
						// The dark part faintly lit by the planet (earthshine).
						col = mix(col, vec3(0.93, 0.95, 1.0) * (0.035 + 2.2 * lit * maria), moonVis * smoothstep(1.0, 0.85, r2));
					}
					col += vec3(0.55, 0.65, 0.9) * (pow(max(m, 0.0), 300.0) * 0.12 + pow(max(m, 0.0), 3000.0) * 0.25) * moonVis * (0.2 + 0.8 * full);
				}
				// łuna miasta: ciepły pas nad horyzontem (rozproszone w powietrzu światło latarni)
				col += cityGlow * (exp(-max(h, 0.0) * 9.0) * 0.9 + exp(-max(h, 0.0) * 2.5) * 0.25);
				// Clouds. Glow of the low sun on them: lit from below at sunset and after it (the high cirrus
				// longer); silvery edges round the moon.
				if (h > 0.0) {
					float sy = sunDir.y;
					vec3 dusk = mix(vec3(1.0, 0.38, 0.26), vec3(1.0, 0.72, 0.44), smoothstep(-0.05, 0.12, sy));
					float toward = 0.35 + 0.65 * pow(s, 1.5);
					float moonM = pow(max(dot(d, moonDir), 0.0), 6.0) * moonVis;
					// Cirrus: thin high streaks, drifting faster, hidden by overcast.
					vec2 qc = d.xz / (h + 0.05) * 0.32 + cloudOffset * 3.5;
					vec2 rq = mat2(0.8, 0.6, -0.6, 0.8) * qc;
					float ci = smoothstep(0.55, 0.85, skyFbm(vec2(rq.x * 0.3, rq.y * 3.2))) * (0.3 + 0.7 * skyNoise(qc * 0.45 + 7.0));
					ci *= smoothstep(0.03, 0.3, h) * (1.0 - smoothstep(0.5, 0.9, cover)) * 0.55;
					float hiGlow = smoothstep(-0.2, -0.04, sy) * (1.0 - smoothstep(0.1, 0.3, sy));
					vec3 ciTone = mix(horizon, cloudLight * 1.1, 0.65) + dusk * hiGlow * toward * 0.9 + sunColor * pow(s, 6.0) * 0.3 * sunVis;
					col = mix(col, ciTone, ci);
					col += vec3(0.7, 0.76, 0.92) * ci * moonM * 0.35;
					/* chmury wolumetryczne z panoramy (cloudTex – liczona rzadko w osobnym przebiegu, renderClouds): kolor
					   przemnożony przez krycie, alfa – krycie */
					if (cover > 0.0 && d.y > 0.0) {
						vec4 cl = texture2D(cloudTex, vec2(atan(d.x, d.z) / 6.2831853 + 0.5, sqrt(d.y)));
						col = col * (1.0 - cl.a) + cl.rgb;
						// spody chmur nad miastem podświetlone łuną (najmocniej nisko nad horyzontem)
						col += cityGlow * cl.a * (1.2 + 1.6 * exp(-h * 4.0));
						col += vec3(0.75, 0.8, 0.95) * cl.a * (1.0 - cl.a) * 4.0 * moonM * 0.35;
					}
				}
				gl_FragColor = vec4(col, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}`,
		side: THREE.BackSide,
		depthWrite: false,
		fog: false,
	});
	/* Panorama chmur: 1024 × 512 (kierunek – długość, sqrt(wysokość) – szerokość: więcej wierszy nisko nad horyzontem),
	   marsz promienia przez warstwę ok. 1,1–2,6 km (do 7 km drogi, 64 kroki, bez szumu – gładko), światło: dwie próbki
	   w stronę słońca (prawo Beera, „puder” na brzegach), światło rozproszone nieba, o zachodzie podświetlenie od spodu,
	   w oddali kolor horyzontu. Liczona co ok. 0,4 s (chmury płyną powoli) – w kopule tylko odczyt z wygładzaniem. */
	const cloudRT = new THREE.WebGLRenderTarget(1024, 512, { type: THREE.HalfFloatType, depthBuffer: false });
	cloudRT.texture.wrapS = THREE.RepeatWrapping;
	cloudRT.texture.generateMipmaps = false;
	const cloudRT2 = cloudRT.clone();
	uniforms.cloudTex.value = cloudRT2.texture;
	// rozmycie panoramy (9 próbek, w poziomie z zawijaniem) – szum kroków marszu znika
	const blurMat = new THREE.ShaderMaterial({
		uniforms: { src: { value: cloudRT.texture }, px: { value: new THREE.Vector2(1 / 1024, 1 / 512) } },
		vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
		fragmentShader: `uniform sampler2D src; uniform vec2 px; varying vec2 vUv;
			void main() {
				vec4 c = vec4(0.0);
				for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
					float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
					c += texture2D(src, vUv + vec2(float(x), float(y)) * px * 1.5) * w;
				}
				gl_FragColor = c / 16.0;
			}`,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	});
	const fragSrc = material.fragmentShader;
	const PRE = fragSrc.slice(0, fragSrc.indexOf('void main()'));
	const cloudMat = new THREE.ShaderMaterial({
		uniforms,
		vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
		fragmentShader: PRE + `
			varying vec2 vUv;
			void main() {
				float az = (vUv.x - 0.5) * 6.2831853, dy = vUv.y * vUv.y, r = sqrt(max(0.0, 1.0 - dy * dy));
				vec3 d = vec3(sin(az) * r, dy, cos(az) * r);
				vec4 outC = vec4(0.0);
				if (cover > 0.0 && d.y > 0.004) {
					float s = max(dot(d, sunDir), 0.0), sy = sunDir.y;
					vec3 dusk = mix(vec3(1.0, 0.38, 0.26), vec3(1.0, 0.72, 0.44), smoothstep(-0.05, 0.12, sy));
					float top = cloudTop();
					float t0 = CB / d.y, t1 = min(min(top / d.y, 40000.0), t0 + 7000.0);
					if (t0 < 40000.0) {
						float nSt = clamp((t1 - t0) / 100.0, 20.0, cloudSteps);
						float dt = (t1 - t0) / nSt;
						float Tr = 1.0;
						vec3 acc = vec3(0.0);
						float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453); // szum – wygładzany rozmyciem panoramy
						float loGlow = smoothstep(-0.12, -0.01, sy) * (1.0 - smoothstep(0.06, 0.24, sy));
						vec3 sunL = sunColor * sunVis * 1.55 + dusk * loGlow * 1.2;
						vec3 amb = mix(horizon, cloudLight * mix(zenith, vec3(1.0), 0.55), 0.6) * (0.72 - 0.3 * smoothstep(0.85, 1.0, cover));
						vec3 L3 = normalize(vec3(sunDir.x, max(sunDir.y, 0.08), sunDir.z));
						for (int i = 0; i < 96; i++) {
							if (float(i) >= nSt || Tr < 0.02) break;
							float t = t0 + (float(i) + jit) * dt;
							vec3 w = vec3(camPos.x, 0.0, camPos.z) + d * t;
							float de = cloudDens(w);
							if (de <= 0.002) continue;
							float od = cloudDens(w + L3 * 120.0) * 1.6 + cloudDens(w + L3 * 380.0) * 1.1;
							float lightK = exp(-od * 1.9) * (1.0 - exp(-de * 6.0) * 0.55);
							float hh = (w.y - CB) / (top - CB);
							vec3 c = sunL * lightK * (0.55 + 0.45 * pow(s, 3.0)) + amb * (0.55 + 0.6 * hh);
							float a = 1.0 - exp(-de * dt * 0.0042 * (1.0 + 2.5 * smoothstep(0.85, 1.0, cover)));
							acc += Tr * a * c;
							Tr *= 1.0 - a;
						}
						float far = smoothstep(9000.0, 38000.0, t0);
						float al = (1.0 - Tr) * (1.0 - far * 0.55);
						vec3 cc = acc / max(1e-3, 1.0 - Tr);
						cc = mix(cc, horizon * 0.95 + cloudLight * 0.05, far * 0.7);
						outC = vec4(cc * al, al);
					}
				}
				gl_FragColor = outC;
			}`,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	});
	const cloudScene = new THREE.Scene(), cloudCam = new THREE.Camera();
	const cloudQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cloudMat);
	cloudQuad.frustumCulled = false;
	cloudScene.add(cloudQuad);
	const blurScene = new THREE.Scene(), blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat);
	blurQuad.frustumCulled = false;
	blurScene.add(blurQuad);
	let cloudT = -1, cloudAt = new THREE.Vector3(1e9, 0, 0);

	const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
	mesh.frustumCulled = false;
	// Drawn after the opaque board, behind it (depth test on): the sky is shaded only where it shows.
	mesh.renderOrder = 1000;

	// Worlds by map theme: a second sun (offset from the first along its path: [turn round, lower],
	// colour) and bodies [direction, angular radius, colour A, colour B, ring].
	const WORLDS = {
		twinsun: { sun2: [0.3, 0.07, "#ffae70"] },
		skyfall: { bodies: [[[-0.55, 0.2, -0.62], 0.13, "#d8b48c", "#9c6c56", 1]] },
		derelict: { bodies: [[[0.45, 0.18, -0.8], 0.11, "#93abc8", "#5c6c8c", 1]] },
		magma: { bodies: [[[0.72, 0.1, -0.62], 0.2, "#b0583e", "#5e2620", 0]] },
		lumen: { bodies: [[[-0.32, 0.3, -0.8], 0.03, "#b0eedc", "#5fa892", 0], [[0.52, 0.36, -0.58], 0.016, "#dccab2", "#9a8a74", 0]] },
		dunesea: { bodies: [[[-0.7, 0.15, -0.66], 0.05, "#e2c9a4", "#b48f6a", 0]] },
		frozenhive: { bodies: [[[0.3, 0.25, -0.85], 0.07, "#c4d8ec", "#7c93b0", 1]] },
		// Space (the orbital battle): black sky full of stars, no clouds; Kharon's moon low over the edge.
		space: { space: true, bodies: [[[0.55, 0.1, -0.83], 0.05, "#d2c4b4", "#6d5f52", 0]] },
	};
	let world = {};
	const sun2Base = C("#000"),
		yAxis = new THREE.Vector3(0, 1, 0);
	const zenith = C("#000"),
		horizon = C("#000"),
		sunlight = C("#000"),
		WHITE = C("#f2f5f8"),
		MOONLIT = C("#3b4a6a");
	return {
		mesh,
		uniforms,
		// The map's world (its theme): the second sun, planets and moons in the sky.
		setTheme(theme) {
			world = WORLDS[theme] || {};
			const bodies = world.bodies || [];
			for (let k = 0; k < 2; k++) {
				const b = bodies[k];
				uniforms.bodyDir.value[k].set(...(b ? b[0] : [0, 1, 0]), b ? b[1] : 0);
				if (!b) continue;
				const a = C(b[2]),
					bb = C(b[3]);
				uniforms.bodyA.value[k].set(a.r, a.g, a.b, b[4]);
				uniforms.bodyB.value[k].set(bb.r, bb.g, bb.b, 0);
			}
			if (world.sun2) sun2Base.set(world.sun2[2]);
		},
		// The second sun's direction for a sun direction (null on worlds with one sun).
		sun2(sunDir, out) {
			if (!world.sun2) return null;
			return out.copy(sunDir).applyAxisAngle(yAxis, world.sun2[0]).setY(sunDir.y - world.sun2[1]).normalize();
		},
		// Colours at a sun height: { zenith, horizon, sunlight } (shared objects, copy them to keep).
		palette(e) {
			palette(e, zenith, horizon, sunlight);
			return { zenith, horizon, sunlight };
		},
		// Every frame, after the light and the weather: e the sun's height (-1…1), sunDir the true
		// direction to the sun (below the horizon too), moonDir, haze 0…1 (weather), hazeColor, cover 0…1.
		update({ camera, time, e, sunDir, moonDir, zenith: z, horizon: h, sunlight: sl, haze = 0, hazeColor, cover = 0.4, flash = 0, flashColor, moonPhase = 0.62, aurora = 0, cityGlow = null, urban = 0 }) {
			if (cityGlow) uniforms.cityGlow.value.copy(cityGlow);
			else uniforms.cityGlow.value.setRGB(0, 0, 0);
			uniforms.moonPhase.value = moonPhase;
			uniforms.aurora.value = aurora * (1 - Math.min(1, haze * 1.2));
			mesh.position.copy(camera.position);
			uniforms.camPos.value.copy(camera.position);
			mesh.scale.setScalar(camera.far * 0.9);
			uniforms.zenith.value.copy(z);
			uniforms.horizon.value.copy(h);
			if (hazeColor && haze > 0) {
				uniforms.zenith.value.lerp(hazeColor, haze * 0.7);
				uniforms.horizon.value.lerp(hazeColor, haze * 0.8);
			}
			if (flash > 0 && flashColor) {
				uniforms.zenith.value.lerp(flashColor, flash * 0.45);
				uniforms.horizon.value.lerp(flashColor, flash * 0.45);
			}
			uniforms.sunColor.value.copy(sl);
			uniforms.sunDir.value.copy(sunDir);
			uniforms.moonDir.value.copy(moonDir);
			const clear = 1 - Math.min(1, haze * 1.2);
			uniforms.sunVis.value = Math.max(0, Math.min(1, (e + 0.06) / 0.08)) * (1 - haze * 0.8);
			uniforms.moonVis.value = Math.max(0, Math.min(1, -e / 0.12)) * clear;
			// gwiazdy przyćmione przez łunę w mieście
			uniforms.starVis.value = Math.max(0, Math.min(1, (-e - 0.05) / 0.2)) * clear * (1 - 0.6 * urban);
			uniforms.cover.value = Math.min(1, cover + haze * 0.6);
			uniforms.cloudLight.value.copy(MOONLIT).lerp(WHITE, Math.max(0, Math.min(1, (e + 0.1) / 0.3)));
			uniforms.skyTime.value = time;
			uniforms.clear.value = clear;
			if (world.sun2) {
				this.sun2(sunDir, uniforms.sun2Dir.value);
				const e2 = uniforms.sun2Dir.value.y;
				uniforms.sun2Color.value.copy(sun2Base).multiplyScalar(Math.max(0, Math.min(1, (e2 + 0.04) / 0.08)) * (1 - haze * 0.8));
			} else uniforms.sun2Color.value.setRGB(0, 0, 0);
			if (world.space) {
				uniforms.starVis.value = 1;
				uniforms.moonVis.value = 0;
				uniforms.cover.value = 0;
				uniforms.aurora.value = 0;
				uniforms.clear.value = 1;
			}
		},
		// Cloud drift and the shadow they cast (0 none … 1 dark).
		clouds(time, shadow) {
			SKY_CLOUDS.cloudOffset.value.set(time * 0.0042, time * 0.0017);
			SKY_CLOUDS.cloudAmount.value = shadow;
			// próg mapy zachmurzenia wg zachmurzenia: pogodnie – pojedyncze kłęby, pochmurno – dużo, deszcz – zwarta warstwa
			const c = uniforms.cover.value;
			SKY_CLOUDS.cloudThr.value = 0.72 - c * 0.55 - Math.max(0, Math.min(1, (c - 0.85) / 0.15)) * 0.22; // deszcz – bez prześwitów
		},
		// jakość chmur: liczba kroków marszu promienia (niska – mniej)
		setCloudQuality(steps) { uniforms.cloudSteps.value = steps; },
		/* panorama chmur – co ok. 0,4 s albo po przesunięciu kamery o ponad 300 m (force – od razu); renderer – WebGLRenderer */
		renderClouds(renderer, time, force) {
			if (!force && time - cloudT < 0.4 && cloudAt.distanceTo(uniforms.camPos.value) < 300) return;
			cloudT = time;
			cloudAt.copy(uniforms.camPos.value);
			const prev = renderer.getRenderTarget();
			renderer.setRenderTarget(cloudRT);
			renderer.render(cloudScene, cloudCam);
			renderer.setRenderTarget(cloudRT2);
			renderer.render(blurScene, cloudCam);
			renderer.setRenderTarget(prev);
		},
	};
}

NS.createSky3D = createSky3D;
NS.cloudShade = cloudShade;
NS.cloudGlsl = cloudGlsl;
NS.cloudUniforms = cloudUniforms;
})();
