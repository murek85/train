/* Pogoda (tylko wygląd – nie zmienia rozgrywki): zachmurzenie i cienie chmur, mgła, deszcz, śnieg,
   mokra i zaśnieżona nawierzchnia, siła wiatru dla drzew. Opady to cząstki wokół kamery, liczone w shaderze. */
(function () {
	'use strict';
	const T = window.THREE;
	const NS = window.Train3D;

	const PRESETS = {
		clear: { name: 'słonecznie', cover: 0.25, shadow: 0.35, haze: 0, rain: 0, snow: 0, fogNear: 650, fogFar: 2100, wind: 0.35, wet: 0, snowGround: 0, sun: 1 },
		cloudy: { name: 'pochmurno', cover: 0.78, shadow: 0.55, haze: 0.15, rain: 0, snow: 0, fogNear: 450, fogFar: 1700, wind: 0.75, wet: 0, snowGround: 0, sun: 0.7 },
		rain: { name: 'deszcz', cover: 0.97, shadow: 0.15, haze: 0.45, rain: 1, snow: 0, fogNear: 140, fogFar: 950, wind: 1.15, wet: 1, snowGround: 0, sun: 0.32 },
		fog: { name: 'mgła', cover: 0.6, shadow: 0.05, haze: 0.85, rain: 0, snow: 0, fogNear: 15, fogFar: 300, wind: 0.12, wet: 0.35, snowGround: 0, sun: 0.4 },
		snow: { name: 'śnieg', cover: 0.92, shadow: 0.12, haze: 0.5, rain: 0, snow: 1, fogNear: 90, fogFar: 720, wind: 0.55, wet: 0, snowGround: 1, sun: 0.5 },
	};
	const ROUTE_DEFAULT = { osobowy: 'clear', ekspres: 'cloudy' };
	// Opad wypełnia prostopadłościan wokół widoku; jego rozmiar zależy od kamery (90…420 m w poziomie),
	// więc pada na całym ekranie także przy kamerze wysoko i daleko. Pozycje cząstek są w [0,1) i skalowane w shaderze.

	function precip(count, snow) {
		const g = new T.BufferGeometry();
		const n = snow ? count : count * 2;
		const pos = new Float32Array(n * 3), end = new Float32Array(n), seed = new Float32Array(n);
		for (let i = 0; i < count; i++) {
			const x = Math.random(), y = Math.random(), z = Math.random(), r = Math.random();
			const reps = snow ? 1 : 2;
			for (let k = 0; k < reps; k++) {
				const j = i * reps + k;
				pos.set([x, y, z], j * 3);
				end[j] = k;
				seed[j] = r;
			}
		}
		g.setAttribute('position', new T.BufferAttribute(pos, 3));
		g.setAttribute('aEnd', new T.BufferAttribute(end, 1));
		g.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
		g.boundingSphere = new T.Sphere(new T.Vector3(), 1e6);
		return g;
	}

	/* Krople i płatki: każda cząstka wie, gdzie jest, z czasu i własnego ziarna (bez pracy procesora).
	   Deszcz – kreski pochylone z wiatrem, różnej długości i jasności; śnieg – płatki różnej wielkości
	   wirujące na wietrze (ograniczony rozmiar przy samej kamerze). uLight – jasność otoczenia (noc ciemniejsza). */
	const VS = `
		uniform float uT; uniform vec3 uCenter; uniform vec3 uBox; uniform float uSpeed; uniform vec2 uDrift; uniform float uLen; uniform float uSize; uniform float uSnow; uniform float uWindK;
		attribute float aEnd; attribute float aSeed;
		varying float vA; varying float vS;
		void main() {
			vec3 hb = uBox * 0.5;
			vec3 p = position * uBox;
			float sp = 0.75 + 0.5 * aSeed;
			p.y -= uT * uSpeed * sp;
			vec2 drift = uDrift * (0.4 + uWindK);
			p.xz += drift * uT * sp;
			if (uSnow > 0.5) {
				// wirowanie płatków: dwie fale różnej długości, mocniejsze przy wietrze
				float a = uT * (0.9 + aSeed) + aSeed * 40.0;
				p.xz += vec2(sin(a) + 0.5 * sin(a * 2.3 + 1.7), cos(a * 0.8) + 0.5 * cos(a * 1.9)) * (0.6 + uWindK * 1.4);
			}
			vec3 w = uCenter + mod(p - uCenter + hb, uBox) - hb;
			// druga końcówka kreski deszczu: wyżej i pod wiatr (smuga ruchu), długość zależna od kropli
			w += vec3(-drift.x, uSpeed, -drift.y) * (0.025 + 0.035 * aSeed) * aEnd * uLen;
			vec4 mv = modelViewMatrix * vec4(w, 1.0);
			gl_Position = projectionMatrix * mv;
			float depth = max(0.5, -mv.z);
			gl_PointSize = clamp(uSize * (0.55 + 0.9 * aSeed) * 60.0 / depth, 1.2, 16.0);
			vec3 q = abs(w - uCenter) / hb;
			vA = (1.0 - smoothstep(0.7, 1.0, max(q.x, q.z))) * (1.0 - smoothstep(0.85, 1.0, q.y));
			// tuż przy kamerze zanikają (nie zasłaniają widoku dużymi plamami)
			vA *= smoothstep(1.2, 4.0, depth) * (0.55 + 0.45 * fract(aSeed * 37.0));
			vS = aSeed;
		}`;

	// rozbryzgi kropel na ziemi: rozszerzający się krążek, który zanika (cykl ok. 0,3 s, nowe miejsce w każdym cyklu)
	const SPLASH_VS = `
		uniform float uT; uniform vec3 uCenter; uniform float uR; uniform float uGround;
		attribute float aSeed;
		varying float vPh;
		float h(float n) { return fract(sin(n * 127.1) * 43758.5453); }
		void main() {
			float cyc = uT * (2.6 + aSeed) + aSeed * 13.0;
			float id = floor(cyc);
			vPh = fract(cyc);
			vec2 o = (vec2(h(id + aSeed * 91.0), h(id * 1.7 + aSeed * 53.0)) - 0.5) * 2.0 * uR;
			vec3 w = vec3(uCenter.x + o.x, uGround, uCenter.z + o.y);
			vec4 mv = modelViewMatrix * vec4(w, 1.0);
			gl_Position = projectionMatrix * mv;
			gl_PointSize = clamp((4.0 + 26.0 * vPh) * 6.0 / max(1.0, -mv.z), 1.0, 22.0);
		}`;

	class Weather {
		constructor(scene) {
			this.scene = scene;
			this.cur = Object.assign({}, PRESETS.clear);
			this.target = PRESETS.clear;
			this.key = 'clear';
			this.time = 0;
			this.count = 1;
			this.light = 1;
			this.box = new T.Vector3(90, 90, 90);
			this.center = new T.Vector3();
			this.nearCenter = new T.Vector3();
			this.build(1);
		}

		build(scale) {
			for (const m of [this.rain, this.rainNear, this.snow, this.splash]) if (m) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
			const mk = (snow, speed) => new T.ShaderMaterial({
				uniforms: {
					uT: { value: 0 }, uCenter: { value: new T.Vector3() }, uBox: { value: new T.Vector3(90, 90, 90) }, uSpeed: { value: speed }, uDrift: { value: new T.Vector2(snow ? 0.7 : 2.6, snow ? 0.35 : 1.3) },
					uLen: { value: snow ? 0 : 1 }, uSize: { value: snow ? 4.2 : 1 }, uSnow: { value: snow ? 1 : 0 }, uWindK: { value: 0.5 },
					uColor: { value: new T.Color(snow ? '#ffffff' : '#d4dee9') }, uOpacity: { value: 0 }, uLight: { value: 1 },
				},
				vertexShader: VS,
				fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uSnow; uniform float uLight; varying float vA; varying float vS;
					void main() {
						float a = uOpacity * vA;
						if (uSnow > 0.5) {
							vec2 c = gl_PointCoord - 0.5;
							float r = length(c);
							// płatek: miękki krążek z jaśniejszym środkiem
							a *= smoothstep(0.5, 0.2, r) * (0.7 + 0.3 * smoothstep(0.25, 0.0, r));
						}
						gl_FragColor = vec4(uColor * uLight, a);
					}`,
				transparent: true,
				depthWrite: false,
				fog: false,
			});
			this.rain = new T.LineSegments(precip(Math.round(16000 * scale), false), mk(false, 24));
			this.rainNear = new T.LineSegments(precip(Math.round(5000 * scale), false), mk(false, 24));
			this.snow = new T.Points(precip(Math.round(18000 * scale), true), mk(true, 1.5));
			const sg = new T.BufferGeometry();
			const sn = Math.round(1400 * scale);
			const pos = new Float32Array(sn * 3), seed = new Float32Array(sn);
			for (let i = 0; i < sn; i++) seed[i] = Math.random();
			sg.setAttribute('position', new T.BufferAttribute(pos, 3));
			sg.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
			sg.boundingSphere = new T.Sphere(new T.Vector3(), 1e6);
			this.splash = new T.Points(sg, new T.ShaderMaterial({
				uniforms: { uT: { value: 0 }, uCenter: { value: new T.Vector3() }, uR: { value: 30 }, uGround: { value: 0 }, uOpacity: { value: 0 }, uLight: { value: 1 } },
				vertexShader: SPLASH_VS,
				fragmentShader: `uniform float uOpacity; uniform float uLight; varying float vPh;
					void main() {
						vec2 c = (gl_PointCoord - 0.5) * vec2(1.0, 2.6);
						float r = length(c);
						float ring = smoothstep(0.08, 0.0, abs(r - 0.42 * vPh - 0.05));
						float a = ring * (1.0 - vPh) * uOpacity;
						gl_FragColor = vec4(vec3(0.85, 0.9, 0.95) * uLight, a);
					}`,
				transparent: true,
				depthWrite: false,
				fog: false,
			}));
			for (const m of [this.rain, this.rainNear, this.snow, this.splash]) {
				m.frustumCulled = false;
				m.renderOrder = 1100;
				this.scene.add(m);
			}
		}

		setQuality(particles) {
			if (Math.abs(particles - this.count) < 0.01) return;
			this.count = particles;
			this.build(particles);
		}

		set(key, routeId, instant) {
			if (key === 'auto') key = ROUTE_DEFAULT[routeId] || 'clear';
			this.key = key;
			this.target = PRESETS[key] || PRESETS.clear;
			if (instant) Object.assign(this.cur, this.target);
		}

		// camera – pozycja kamery, focus – punkt, na który patrzy (środek kadru na ziemi)
		update(dt, camera, focus) {
			this.time += dt;
			const dist = Math.hypot(camera.x - focus.x, camera.z - focus.z, camera.y - focus.y);
			const horiz = Math.max(90, Math.min(420, dist * 2.4));
			const vert = Math.max(60, Math.min(260, camera.y - focus.y + 45));
			const kb = Math.min(1, dt * 2);
			this.box.x += (horiz - this.box.x) * kb;
			this.box.z = this.box.x;
			this.box.y += (vert - this.box.y) * kb;
			this.center.set(focus.x, Math.min(camera.y, focus.y) - 5 + this.box.y / 2, focus.z);
			const k = Math.min(1, dt * 0.5);
			for (const p of ['cover', 'shadow', 'haze', 'rain', 'snow', 'fogNear', 'fogFar', 'wind', 'sun']) this.cur[p] += (this.target[p] - this.cur[p]) * k;
			// śnieg osiada powoli (ok. pół minuty) i jeszcze wolniej topnieje
			const sg = this.target.snowGround;
			this.cur.snowGround += (sg - this.cur.snowGround) * Math.min(1, dt * (sg > this.cur.snowGround ? 0.06 : 0.02));
			// nawierzchnia moknie i schnie wolniej niż pada
			this.cur.wet += (this.target.wet - this.cur.wet) * Math.min(1, dt * 0.08);
			// warstwa przy kamerze: gęste krople przelatujące tuż przed obiektywem
			this.nearCenter.copy(camera);
			const nearBox = new T.Vector3(36, 30, 36);
			for (const [m, a, ctr, bx] of [[this.rain, this.cur.rain * 0.32, this.center, this.box], [this.rainNear, this.cur.rain * 0.28, this.nearCenter, nearBox], [this.snow, this.cur.snow * 0.95, this.center, this.box]]) {
				const u = m.material.uniforms;
				u.uT.value = this.time;
				u.uCenter.value.copy(ctr);
				u.uBox.value.copy(bx);
				u.uOpacity.value = a;
				u.uWindK.value = this.cur.wind;
				u.uLight.value = this.light;
				m.visible = a > 0.01;
			}
			const su = this.splash.material.uniforms;
			su.uT.value = this.time;
			su.uCenter.value.set(focus.x, 0, focus.z);
			su.uR.value = Math.min(60, 18 + dist * 0.35);
			su.uGround.value = focus.y - 0.3;
			su.uOpacity.value = this.cur.rain * 0.8;
			su.uLight.value = this.light;
			this.splash.visible = this.cur.rain > 0.05;
			return this.cur;
		}
	}

	Weather.PRESETS = PRESETS;
	NS.Weather = Weather;
})();
