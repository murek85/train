/* Przeniesione z projektu Pogranicze Galaktyki (strategy/webgl3d/post-3d.js) i opakowane jako zwykły skrypt.
   Oryginalny opis poniżej. */
(function () {
'use strict';
const NS = (window.Train3D = window.Train3D || {});
/* The cinematic image of the 3D board: the scene is drawn into a high-range (half-float) frame with
   multisampling, then finished on the screen in a few full-screen passes:
   - ambient occlusion: the darkening of creases, feet of walls and the ground under units, from the
     depth buffer at half resolution (a ring of samples round each point, softened by a depth-aware blur);
   - bloom: what is brighter than white (lights, lava, fire, explosions, the sun on wet ground) glows,
     a chain of ever smaller blurred copies added back from the smallest;
   - the finish: exposure, filmic tone mapping (ACES fit: no clipped whites, deep shadows), a colour grade
     (saturation, contrast, a tint for the shadows and the lights — per planet and time of day), a soft
     vignette and a little noise against banding in the gradients, then sRGB.
   - The atmosphere (0.127): height fog lying in the valleys and thinning upwards (integrated along each
     ray of sight), lit warmer and brighter looking towards the sun, and shafts of light from the sun
     (a radial blur of the bright sky round it, where the ground does not hide it).
   - Sky reflections: an environment map (prefiltered for rough and smooth surfaces) painted from the sky's
     current colours and the sun, renewed when they change — metal, glass and wet ground reflect the sky.
   Everything is made in code (no textures, no add-on files). Usage: const post = createPost3D(THREE,
   renderer); post.setSize(w, h); post.render(scene, camera, settings); post.environment(...) → texture. */
function createPost3D(THREE, renderer) {
	const VS = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
	// One triangle covering the screen.
	const tri = new THREE.BufferGeometry();
	tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
	tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
	const quad = new THREE.Mesh(tri),
		quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	quad.frustumCulled = false;
	const shader = (fragmentShader, uniforms, extra = {}) =>
		new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...extra });
	function pass(material, target, clear = true) {
		quad.material = material;
		renderer.setRenderTarget(target);
		if (clear) renderer.clear(true, false, false);
		renderer.render(quad, quadCamera);
	}

	// ---------- targets ----------
	const half = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
	let sceneTarget = null,
		aoTarget = null,
		aoBlurTarget = null,
		raysA = null,
		raysB = null,
		dofTarget = null,
		finishTarget = null,
		samples = 4;
	const mips = [];
	const LEVELS = 5;
	let width = 1,
		height = 1;
	function build() {
		sceneTarget?.dispose();
		sceneTarget?.depthTexture?.dispose();
		const depth = new THREE.DepthTexture(width, height);
		depth.type = THREE.UnsignedIntType;
		sceneTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples, depthTexture: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
		const hw = Math.max(1, width >> 1),
			hh = Math.max(1, height >> 1);
		aoTarget?.dispose();
		aoBlurTarget?.dispose();
		aoTarget = new THREE.WebGLRenderTarget(hw, hh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
		aoBlurTarget = aoTarget.clone();
		for (const m of mips) m.dispose();
		mips.length = 0;
		for (let i = 0; i < LEVELS; i++) mips.push(new THREE.WebGLRenderTarget(Math.max(1, width >> (i + 1)), Math.max(1, height >> (i + 1)), half));
		raysA?.dispose();
		raysB?.dispose();
		raysA = new THREE.WebGLRenderTarget(hw, hh, half);
		raysB = raysA.clone();
		dofTarget?.dispose();
		dofTarget = new THREE.WebGLRenderTarget(width, height, half);
		finishTarget?.dispose();
		finishTarget = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
	}

	// ---------- sharpening (adaptive, like CAS): cross of neighbours, weight by local contrast ----------
	// Restores thin lines (rails, catenary) softened by resampling; edges already sharp and bright spots get
	// little (no halos). strength 0…1.
	const sharp = shader(
		`uniform sampler2D tColor; uniform vec2 texel; uniform float strength;
		varying vec2 vUv;
		void main() {
			vec3 c = texture2D(tColor, vUv).rgb;
			vec3 n = texture2D(tColor, vUv + vec2(0.0, texel.y)).rgb, s = texture2D(tColor, vUv - vec2(0.0, texel.y)).rgb;
			vec3 e = texture2D(tColor, vUv + vec2(texel.x, 0.0)).rgb, w = texture2D(tColor, vUv - vec2(texel.x, 0.0)).rgb;
			vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
			vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
			vec3 wt = amp * mix(-0.1, -0.2, strength) * min(strength * 3.0, 1.0);
			gl_FragColor = vec4(clamp((c + (n + s + e + w) * wt) / (1.0 + 4.0 * wt), 0.0, 1.0), 1.0);
		}`,
		{ tColor: { value: null }, texel: { value: new THREE.Vector2() }, strength: { value: 0.35 } },
	);

	// ---------- depth of field (0.135): tilt-shift ----------
	// A band round the focus line stays sharp; above and below it the picture blurs more and more (more
	// above: that is the far side of the board), a disc of samples on a golden-angle spiral. The blur is
	// in screen space on purpose: the interface layer lies on the see-through plane of the battle in
	// space, so a blur by depth would smear the orders drawn there.
	const dof = shader(
		`uniform sampler2D tColor; uniform vec2 texel; uniform float strength; uniform float focus; uniform float band; uniform float aspect;
		varying vec2 vUv;
		void main() {
			float dy = vUv.y - focus;
			float k = smoothstep(band, band + 0.4, abs(dy)) * (dy > 0.0 ? 1.0 : 0.7);
			vec2 e = abs(vUv - 0.5) * vec2(aspect, 1.0);
			k = max(k, smoothstep(0.6, 1.0, length(e)) * 0.45) * strength;
			vec3 c = texture2D(tColor, vUv).rgb;
			if (k < 0.02) { gl_FragColor = vec4(c, 1.0); return; }
			float radius = k * 5.0;
			vec3 sum = c;
			float w = 1.0;
			for (int i = 1; i < 18; i++) {
				float fi = float(i);
				float r = sqrt(fi / 17.0) * radius;
				float a = fi * 2.39996;
				vec3 s = texture2D(tColor, vUv + vec2(cos(a), sin(a)) * r * texel).rgb;
				s = min(s, vec3(32.0));
				// Bright points weigh a little more: bokeh-like highlights.
				float sw = 1.0 + max(0.0, dot(s, vec3(0.3, 0.55, 0.15)) - 1.0) * 0.4;
				sum += s * sw;
				w += sw;
			}
			gl_FragColor = vec4(sum / w, 1.0);
		}`,
		{ tColor: { value: null }, texel: { value: new THREE.Vector2() }, strength: { value: 0 }, focus: { value: 0.47 }, band: { value: 0.2 }, aspect: { value: 1 } },
	);

	// ---------- ambient occlusion ----------
	const aoMaterial = shader(
		`uniform sampler2D tDepth; uniform mat4 projInv; uniform mat4 proj; uniform float radius; uniform float strength; uniform float fade; uniform float near;
		varying vec2 vUv;
		vec3 viewPos(vec2 uv) {
			float d = texture2D(tDepth, uv).x;
			vec4 p = projInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
			return p.xyz / p.w;
		}
		float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
		void main() {
			float d = texture2D(tDepth, vUv).x;
			if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
			vec3 P = viewPos(vUv);
			vec3 N = normalize(cross(dFdx(P), dFdy(P)));
			if (N.z < 0.0) N = -N;
			// Seen almost edge-on (wide flat ground from a low camera) the samples drop under the neighbouring
			// pixels of the same surface and darken it falsely: there the occlusion fades out.
			float facing = abs(dot(N, normalize(-P)));
			// Samples in the half-sphere over the surface (turned by a per-pixel angle), nearer ones more often;
			// a sample is hidden when the visible surface at its place on the screen lies in front of it.
			float a0 = hash(gl_FragCoord.xy) * 6.2831853, occ = 0.0;
			for (int i = 0; i < 16; i++) {
				float t = (float(i) + 0.5) / 16.0;
				float z = 1.0 - t, rr = sqrt(1.0 - z * z), ang = a0 + float(i) * 2.3999632;
				vec3 h = vec3(rr * cos(ang), rr * sin(ang), z);
				// Into the frame of the normal.
				vec3 up = abs(N.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
				vec3 tx = normalize(cross(up, N)), ty = cross(N, tx);
				vec3 dir = tx * h.x + ty * h.y + N * h.z;
				float scale = mix(0.15, 1.0, t * t);
				vec3 Q = P + dir * radius * scale;
				vec4 c = proj * vec4(Q, 1.0);
				vec2 uv = c.xy / c.w * 0.5 + 0.5;
				float sz = viewPos(uv).z;
				float range = smoothstep(0.0, 1.0, radius / max(abs(P.z - sz), 1e-3));
				// self-occlusion bias grows with distance (coarser depth far away)
				occ += step(Q.z + radius * 0.04 - P.z * 0.003, sz) * range;
			}
			// Far away the depth is too coarse: the occlusion fades out.
			occ *= 1.0 - smoothstep(fade * 0.6, fade, -P.z);
			occ *= smoothstep(near, near * 1.6 + 0.01, -P.z); // (cab view: no occlusion on the cab interior, only outside)
			occ *= smoothstep(0.06, 0.28, facing);
			gl_FragColor = vec4(vec3(pow(clamp(1.0 - strength * occ / 16.0, 0.0, 1.0), 1.5)), 1.0);
		}`,
		{ tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() }, radius: { value: 26 }, strength: { value: 1.6 }, fade: { value: 3000 }, near: { value: 0 } },
	);
	// A 3×3 blur that keeps the edges of objects (samples far in depth do not count).
	const aoBlur = shader(
		`uniform sampler2D tAo; uniform sampler2D tDepth; uniform vec2 texel; varying vec2 vUv;
		void main() {
			float d0 = texture2D(tDepth, vUv).x, sum = 0.0, w = 0.0;
			for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
				vec2 o = vec2(float(x), float(y)) * texel * 1.5;
				float k = 1.0 / (1.0 + 4000.0 * abs(texture2D(tDepth, vUv + o).x - d0));
				sum += texture2D(tAo, vUv + o).r * k;
				w += k;
			}
			gl_FragColor = vec4(vec3(sum / w), 1.0);
		}`,
		{ tAo: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2() } },
	);

	// ---------- bloom ----------
	const bright = shader(
		`uniform sampler2D tColor; uniform float threshold; uniform float knee; uniform vec2 texel; varying vec2 vUv;
		void main() {
			vec3 c = (texture2D(tColor, vUv + texel * vec2(-0.5, -0.5)).rgb + texture2D(tColor, vUv + texel * vec2(0.5, -0.5)).rgb
				+ texture2D(tColor, vUv + texel * vec2(-0.5, 0.5)).rgb + texture2D(tColor, vUv + texel * vec2(0.5, 0.5)).rgb) * 0.25;
			// A pixel that is not a number (or endless) from any shader would spread through the blur: dropped.
			if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
			float l = max(c.r, max(c.g, c.b));
			gl_FragColor = vec4(min(c * smoothstep(threshold, threshold + knee, l), vec3(16.0)), 1.0);
		}`,
		{ tColor: { value: null }, threshold: { value: 1.2 }, knee: { value: 0.8 }, texel: { value: new THREE.Vector2() } },
	);
	const down = shader(
		`uniform sampler2D tColor; uniform vec2 texel; varying vec2 vUv;
		void main() {
			vec3 c = texture2D(tColor, vUv).rgb * 0.5;
			c += (texture2D(tColor, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tColor, vUv + texel * vec2(1.0, -1.0)).rgb
				+ texture2D(tColor, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tColor, vUv + texel * vec2(1.0, 1.0)).rgb) * 0.125;
			gl_FragColor = vec4(c, 1.0);
		}`,
		{ tColor: { value: null }, texel: { value: new THREE.Vector2() } },
	);
	const up = shader(
		`uniform sampler2D tColor; uniform vec2 texel; uniform float weight; varying vec2 vUv;
		void main() {
			vec3 c = texture2D(tColor, vUv).rgb * 4.0;
			c += (texture2D(tColor, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tColor, vUv - vec2(texel.x, 0.0)).rgb
				+ texture2D(tColor, vUv + vec2(0.0, texel.y)).rgb + texture2D(tColor, vUv - vec2(0.0, texel.y)).rgb) * 2.0;
			c += texture2D(tColor, vUv + texel).rgb + texture2D(tColor, vUv - texel).rgb
				+ texture2D(tColor, vUv + vec2(texel.x, -texel.y)).rgb + texture2D(tColor, vUv + vec2(-texel.x, texel.y)).rgb;
			gl_FragColor = vec4(c / 16.0 * weight, 1.0);
		}`,
		{ tColor: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } },
		{ blending: THREE.AdditiveBlending, transparent: true },
	);

	// ---------- light shafts ----------
	// The sky round the sun, where nothing stands in front of it, then smeared towards the sun's place on the
	// screen (each pixel gathers the light along the line to the sun, fading with the distance).
	const raysMask = shader(
		`uniform sampler2D tDepth; uniform sampler2D tColor; uniform float raysRef; uniform mat4 projInv; uniform mat4 camWorld; uniform vec3 sunDir; uniform vec3 sunColor; varying vec2 vUv;
		void main() {
			float d = texture2D(tDepth, vUv).x;
			if (d < 0.99999) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
			vec4 v = projInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
			vec3 rd = normalize((camWorld * vec4(v.xyz / v.w, 0.0)).xyz);
			float s = max(dot(rd, sunDir), 0.0);
			// sky brightness in the frame (clouds included) against clear sky by the sun: clouds block the rays (as post-gpu.js)
			float k = clamp(dot(min(texture2D(tColor, vUv).rgb, vec3(8.0)), vec3(0.2126, 0.7152, 0.0722)) / raysRef, 0.0, 1.5);
			gl_FragColor = vec4(sunColor * (pow(s, 24.0) * 2.0 + pow(s, 6.0) * 0.25) * smoothstep(-0.02, 0.06, rd.y) * k, 1.0);
		}`,
		{ tDepth: { value: null }, tColor: { value: null }, raysRef: { value: 1.2 }, projInv: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() } },
	);
	const raysBlur = shader(
		`uniform sampler2D tColor; uniform vec2 sunUv; uniform float spread; varying vec2 vUv;
		void main() {
			vec2 step = (sunUv - vUv) * spread / 40.0;
			vec2 uv = vUv;
			vec3 sum = vec3(0.0);
			float w = 1.0;
			for (int i = 0; i < 40; i++) {
				sum += texture2D(tColor, uv).rgb * w;
				w *= 0.965;
				uv += step;
			}
			gl_FragColor = vec4(sum / 16.0, 1.0);
		}`,
		{ tColor: { value: null }, sunUv: { value: new THREE.Vector2() }, spread: { value: 1 } },
	);

	// ---------- the finish ----------
	const finish = shader(
		`uniform sampler2D tColor; uniform sampler2D tAo; uniform sampler2D tBloom;
		uniform float aoOn; uniform float bloomOn; uniform float bloomStrength; uniform float exposure;
		uniform float saturation; uniform float contrast; uniform vec3 shadowTint; uniform vec3 lightTint;
		uniform float vignette; uniform float aspect; uniform float grade; uniform float view;
		uniform sampler2D tDepth; uniform sampler2D tRays; uniform mat4 projInv; uniform mat4 camWorld; uniform vec3 camPos;
		uniform float atmoOn; uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 hazeColor; uniform float fogBase; uniform float fogDensity; uniform float fogFalloff; uniform float raysOn;
		uniform vec4 heat[16]; uniform float heatTime;
		varying vec2 vUv;
		// Heat haze (0.144): the air shimmers over explosions, fires, lava and engines — the picture is
		// shifted by small ripples climbing up the screen, strongest in the middle of each source (x, y its
		// centre on screen, z its radius in screen heights, w its strength).
		vec2 heatShift(vec2 uv) {
			vec2 off = vec2(0.0);
			for (int i = 0; i < 16; i++) {
				vec4 h = heat[i];
				if (h.w <= 0.0) break;
				vec2 d = (uv - h.xy) * vec2(aspect, 1.0);
				float f = smoothstep(1.0, 0.15, length(d) / h.z) * h.w;
				if (f <= 0.001) continue;
				float ph = uv.y / h.z * 22.0 - heatTime * 7.0,
					px = uv.x * aspect / h.z * 9.0 + heatTime * 2.1;
				off += vec2(sin(ph + 1.6 * sin(px)), cos(ph * 0.83 + px * 0.5)) * f * h.z * 0.03;
			}
			return off;
		}
		// ACES filmic, the fit by Stephen Hill (input and output in linear sRGB primaries).
		vec3 aces(vec3 c) {
			const mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
			const mat3 o = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
			c = i * c;
			c = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.4329510) + 0.238081);
			return clamp(o * c, 0.0, 1.0);
		}
		vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
		float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
		void main() {
			// Diagnostics (window.post3dView): 1 = the occlusion alone, 2 = the bloom alone.
			if (view > 2.5) { vec4 r = texture2D(tColor, vUv); bool bad = any(isnan(r)) || any(isinf(r)); float l = max(r.r, max(r.g, r.b)); gl_FragColor = vec4(bad ? vec3(0.0, 0.0, 1.0) : l > 8.0 ? vec3(1.0, 0.0, 0.0) : l < 0.0 ? vec3(0.0, 1.0, 0.0) : vec3(min(l, 1.0) * 0.3), 1.0); return; }
			if (view > 0.5) { gl_FragColor = vec4(view < 1.5 ? vec3(texture2D(tAo, vUv).r) : srgb(min(texture2D(tBloom, vUv).rgb, 1.0)), 1.0); return; }
			vec3 c = texture2D(tColor, heat[0].w > 0.0 ? vUv + heatShift(vUv) : vUv).rgb;
			if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
			c = min(c, vec3(64.0));
			if (aoOn > 0.5) c *= texture2D(tAo, vUv).r;
			// The atmosphere: height fog along the ray from the camera to the ground (analytic integral of a
			// density falling off with height), its colour the haze, warmed and brightened towards the sun.
			if (atmoOn > 0.5) {
				float d = texture2D(tDepth, vUv).x;
				if (d < 0.99999) {
					vec4 v = projInv * vec4(vec3(vUv, d) * 2.0 - 1.0, 1.0);
					vec3 world = (camWorld * vec4(v.xyz / v.w, 1.0)).xyz, ray = world - camPos;
					float t = length(ray);
					vec3 rd = ray / t;
					float b = fogFalloff, h0 = camPos.y - fogBase;
					float k = abs(rd.y * b) > 1e-4 ? (1.0 - exp(-t * rd.y * b)) / (rd.y * b) : t;
					float amount = 1.0 - exp(-fogDensity * exp(-h0 * b) * k);
					float toSun = pow(max(dot(rd, sunDir), 0.0), 6.0);
					vec3 haze = hazeColor * (1.0 + toSun * 0.6) + sunColor * toSun * 0.35;
					c = mix(c, haze, clamp(amount, 0.0, 0.55));
				}
			}
			if (raysOn > 0.5) c += texture2D(tRays, vUv).rgb;
			if (bloomOn > 0.5) c += texture2D(tBloom, vUv).rgb * bloomStrength;
			c = aces(c * exposure);
			// The grade: saturation, then a tint for the shadows and for the lights.
			float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
			c = mix(vec3(l), c, mix(1.0, saturation, grade));
			c *= mix(vec3(1.0), mix(shadowTint, lightTint, smoothstep(0.05, 0.7, l)), grade);
			c = srgb(clamp(c, 0.0, 1.0));
			c = mix(c, (c - 0.5) * contrast + 0.5, grade);
			float v = length((vUv - 0.5) * vec2(aspect, 1.0));
			c *= 1.0 - vignette * smoothstep(0.45, 1.1, v);
			c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
			gl_FragColor = vec4(c, 1.0);
		}`,
		{
			tColor: { value: null },
			tAo: { value: null },
			tBloom: { value: null },
			aoOn: { value: 1 },
			bloomOn: { value: 1 },
			bloomStrength: { value: 0.35 },
			exposure: { value: 1 },
			saturation: { value: 1.08 },
			contrast: { value: 1.06 },
			shadowTint: { value: new THREE.Color(0.97, 0.99, 1.04) },
			lightTint: { value: new THREE.Color(1.03, 1.0, 0.96) },
			vignette: { value: 0.28 },
			aspect: { value: 1 },
			grade: { value: 1 },
			view: { value: 0 },
			tDepth: { value: null },
			tRays: { value: null },
			projInv: { value: new THREE.Matrix4() },
			camWorld: { value: new THREE.Matrix4() },
			camPos: { value: new THREE.Vector3() },
			atmoOn: { value: 0 },
			sunDir: { value: new THREE.Vector3(0, 1, 0) },
			sunColor: { value: new THREE.Color() },
			hazeColor: { value: new THREE.Color() },
			fogBase: { value: 0 },
			fogDensity: { value: 0 },
			fogFalloff: { value: 0.01 },
			raysOn: { value: 0 },
			heat: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) },
			heatTime: { value: 0 },
		},
	);

	// ---------- sky reflections ----------
	const envScene = new THREE.Scene(),
		envUniforms = {
			zenith: { value: new THREE.Color() },
			horizon: { value: new THREE.Color() },
			ground: { value: new THREE.Color() },
			sunDir: { value: new THREE.Vector3(0, 1, 0) },
			sunColor: { value: new THREE.Color() },
		};
	envScene.add(
		new THREE.Mesh(
			new THREE.SphereGeometry(1, 32, 16),
			new THREE.ShaderMaterial({
				uniforms: envUniforms,
				vertexShader: "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
				fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
				void main() {
					vec3 d = normalize(vDir);
					vec3 c = d.y > 0.0 ? mix(horizon, zenith, pow(d.y, 0.6)) : mix(horizon, ground, smoothstep(0.0, 0.25, -d.y));
					float s = max(0.0, dot(d, normalize(sunDir)));
					c += sunColor * (pow(s, 400.0) * 18.0 + pow(s, 12.0) * 0.6) * step(-0.02, d.y);
					gl_FragColor = vec4(c, 1.0);
				}`,
				side: THREE.BackSide,
				depthWrite: false,
			}),
		),
	);
	const pmrem = new THREE.PMREMGenerator(renderer);
	let envTarget = null,
		envKey = "";

	return {
		get samples() {
			return samples;
		},
		// bufor sceny (kompilacja shaderów z góry musi znać docelowy bufor – od niego zależy wariant programu)
		get target() {
			if (!sceneTarget) build();
			return sceneTarget;
		},
		setSize(w, h, msaa = samples) {
			w = Math.max(1, Math.round(w));
			h = Math.max(1, Math.round(h));
			if (w === width && h === height && msaa === samples && sceneTarget) return;
			width = w;
			height = h;
			samples = msaa;
			build();
		},
		// The environment from the sky's colours (linear) and the sun; renewed only when they change visibly.
		environment(sky) {
			const key = [sky.zenith, sky.horizon, sky.ground, sky.sunColor].map((c) => c.getHexString()).join("") + sky.sunDir.toArray().map((v) => v.toFixed(1)).join();
			if (key === envKey && envTarget) return envTarget.texture;
			envKey = key;
			envUniforms.zenith.value.copy(sky.zenith);
			envUniforms.horizon.value.copy(sky.horizon);
			envUniforms.ground.value.copy(sky.ground);
			envUniforms.sunDir.value.copy(sky.sunDir);
			envUniforms.sunColor.value.copy(sky.sunColor);
			const next = pmrem.fromScene(envScene, 0, 0.1, 10);
			envTarget?.dispose();
			envTarget = next;
			return envTarget.texture;
		},
		// settings: { ao, bloom, grade (0…1), exposure, saturation, contrast, shadowTint, lightTint, vignette, aoRadius, bloomStrength }
		render(scene, camera, s = {}) {
			if (!sceneTarget) build();
			const autoClear = renderer.autoClear;
			renderer.setRenderTarget(sceneTarget);
			renderer.render(scene, camera);
			renderer.autoClear = false;
			if (s.ao) {
				aoMaterial.uniforms.tDepth.value = sceneTarget.depthTexture;
				aoMaterial.uniforms.projInv.value.copy(camera.projectionMatrixInverse);
				aoMaterial.uniforms.proj.value.copy(camera.projectionMatrix);
				aoMaterial.uniforms.radius.value = s.aoRadius ?? 26;
				aoMaterial.uniforms.strength.value = s.aoStrength ?? 1.6;
				aoMaterial.uniforms.fade.value = s.aoFade ?? 3000;
				aoMaterial.uniforms.near.value = s.aoNear ?? 0;
				pass(aoMaterial, aoTarget);
				aoBlur.uniforms.tAo.value = aoTarget.texture;
				aoBlur.uniforms.tDepth.value = sceneTarget.depthTexture;
				aoBlur.uniforms.texel.value.set(1 / aoTarget.width, 1 / aoTarget.height);
				pass(aoBlur, aoBlurTarget);
			}
			if (s.bloom) {
				bright.uniforms.tColor.value = sceneTarget.texture;
				bright.uniforms.texel.value.set(1 / width, 1 / height);
				pass(bright, mips[0]);
				for (let i = 1; i < LEVELS; i++) {
					down.uniforms.tColor.value = mips[i - 1].texture;
					down.uniforms.texel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
					pass(down, mips[i]);
				}
				for (let i = LEVELS - 1; i > 0; i--) {
					up.uniforms.tColor.value = mips[i].texture;
					up.uniforms.texel.value.set(1 / mips[i].width, 1 / mips[i].height);
					up.uniforms.weight.value = 0.9;
					pass(up, mips[i - 1], false);
				}
			}
			// Light shafts: only with the sun above the horizon and in front of the camera.
			const a = s.atmosphere;
			let rays = false;
			if (a?.rays > 0.01) {
				const sunPoint = new THREE.Vector3().copy(camera.position).addScaledVector(a.sunDir, 1000).project(camera),
					ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).dot(a.sunDir);
				if (ahead > 0.05 && a.sunDir.y > -0.02) {
					rays = true;
					raysMask.uniforms.tDepth.value = sceneTarget.depthTexture;
					raysMask.uniforms.tColor.value = sceneTarget.texture;
					raysMask.uniforms.projInv.value.copy(camera.projectionMatrixInverse);
					raysMask.uniforms.camWorld.value.copy(camera.matrixWorld);
					raysMask.uniforms.sunDir.value.copy(a.sunDir);
					raysMask.uniforms.sunColor.value.copy(a.sunColor).multiplyScalar(a.rays);
					pass(raysMask, raysA);
					raysBlur.uniforms.tColor.value = raysA.texture;
					raysBlur.uniforms.sunUv.value.set(sunPoint.x * 0.5 + 0.5, sunPoint.y * 0.5 + 0.5);
					raysBlur.uniforms.spread.value = 0.9;
					pass(raysBlur, raysB);
				}
			}
			let colour = sceneTarget.texture;
			if ((s.dof || 0) > 0.01) {
				dof.uniforms.tColor.value = sceneTarget.texture;
				dof.uniforms.texel.value.set(1 / width, 1 / height);
				dof.uniforms.strength.value = s.dof;
				dof.uniforms.focus.value = s.dofFocus ?? 0.47;
				dof.uniforms.band.value = s.dofBand ?? 0.2;
				dof.uniforms.aspect.value = width / height;
				pass(dof, dofTarget);
				colour = dofTarget.texture;
			}
			const u = finish.uniforms;
			u.tDepth.value = sceneTarget.depthTexture;
			u.tRays.value = raysB.texture;
			u.raysOn.value = rays ? 1 : 0;
			u.atmoOn.value = a ? 1 : 0;
			if (a) {
				u.projInv.value.copy(camera.projectionMatrixInverse);
				u.camWorld.value.copy(camera.matrixWorld);
				u.camPos.value.copy(camera.position);
				u.sunDir.value.copy(a.sunDir);
				u.sunColor.value.copy(a.sunColor);
				u.hazeColor.value.copy(a.haze);
				u.fogBase.value = a.base;
				u.fogDensity.value = a.density;
				u.fogFalloff.value = a.falloff;
			}
			u.tColor.value = colour;
			u.tAo.value = aoBlurTarget.texture;
			u.tBloom.value = mips[0].texture;
			u.aoOn.value = s.ao ? 1 : 0;
			u.bloomOn.value = s.bloom ? 1 : 0;
			u.bloomStrength.value = s.bloomStrength ?? 0.35;
			u.exposure.value = s.exposure ?? 1;
			u.saturation.value = s.saturation ?? 1.08;
			u.contrast.value = s.contrast ?? 1.06;
			if (s.shadowTint) u.shadowTint.value.copy(s.shadowTint);
			if (s.lightTint) u.lightTint.value.copy(s.lightTint);
			u.vignette.value = s.vignette ?? 0.28;
			u.grade.value = s.grade ?? 1;
			u.view.value = s.view || 0;
			// Heat sources: [x, y, radius, strength] × up to 16 (s.heat), the rest switched off.
			const hs = s.heat || [];
			u.heat.value.forEach((v, i) => (i < hs.length ? v.fromArray(hs[i]) : v.set(0, 0, 0, 0)));
			u.heatTime.value = s.time || 0;
			u.aspect.value = width / height;
			// sharpening after the finish pass (s.sharpen 0…1)
			if ((s.sharpen || 0) > 0.01) {
				pass(finish, finishTarget);
				sharp.uniforms.tColor.value = finishTarget.texture;
				sharp.uniforms.texel.value.set(1 / width, 1 / height);
				sharp.uniforms.strength.value = s.sharpen;
				pass(sharp, null);
			} else pass(finish, null);
			renderer.autoClear = autoClear;
		},
		dispose() {
			sceneTarget?.depthTexture?.dispose();
			for (const t of [sceneTarget, aoTarget, aoBlurTarget, envTarget, raysA, raysB, dofTarget, finishTarget, ...mips]) t?.dispose();
			pmrem.dispose();
			for (const m of [aoMaterial, aoBlur, bright, down, up, finish, raysMask, raysBlur, dof, sharp]) m.dispose();
			tri.dispose();
		},
	};
}

NS.createPost3D = createPost3D;
})();
