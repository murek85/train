/* Pogoda (tylko wygląd – nie zmienia rozgrywki): zachmurzenie i cienie chmur, mgła, deszcz, śnieg,
   mokra i zaśnieżona nawierzchnia, siła wiatru dla drzew. Opady to cząstki wokół kamery, liczone w shaderze;
   nie pada wewnątrz wagonów najbliżej kamery (setCars) ani w tunelu w widoku z kabiny (shelterTarget). */
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
		// burza: ulewa, porywisty wiatr, ciemno, błyskawice (lightning) z grzmotem
		storm: { name: 'burza', cover: 1, shadow: 0.08, haze: 0.55, rain: 1.35, snow: 0, fogNear: 110, fogFar: 820, wind: 1.75, wet: 1, snowGround: 0, sun: 0.2, lightning: 1 },
	};
	for (const p of Object.values(PRESETS)) if (p.lightning === undefined) p.lightning = 0;
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
		// bryły wagonów najbliżej kamery (świat → układ wagonu, połowa wymiarów): wewnątrz pojazdu nie pada
		uniform mat4 uCar[8]; uniform vec3 uCarH[8]; uniform int uCars;
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
			float inside = 0.0;
			for (int i = 0; i < 8; i++) {
				if (i >= uCars) break;
				vec3 l = (uCar[i] * vec4(w, 1.0)).xyz;
				l.y -= uCarH[i].y;
				if (all(lessThan(abs(l), uCarH[i]))) inside = 1.0;
			}
			// druga końcówka kreski deszczu: wyżej i pod wiatr (smuga ruchu), długość zależna od kropli
			w += vec3(-drift.x, uSpeed, -drift.y) * (0.025 + 0.035 * aSeed) * aEnd * uLen;
			vec4 mv = modelViewMatrix * vec4(w, 1.0);
			gl_Position = projectionMatrix * mv;
			float depth = max(0.5, -mv.z);
			gl_PointSize = clamp(uSize * (0.55 + 0.9 * aSeed) * 60.0 / depth, 1.2, 16.0);
			vec3 q = abs(w - uCenter) / hb;
			vA = (1.0 - smoothstep(0.7, 1.0, max(q.x, q.z))) * (1.0 - smoothstep(0.85, 1.0, q.y));
			// tuż przy kamerze zanikają (nie zasłaniają widoku dużymi plamami)
			vA *= smoothstep(1.2, 4.0, depth) * (0.55 + 0.45 * fract(aSeed * 37.0)) * (1.0 - inside);
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
			// wagony, w których nie pada (setCars), i zadaszenie (tunel: 1 – opad niewidoczny)
			this.carM = Array.from({ length: 8 }, () => new T.Matrix4());
			this.carH = Array.from({ length: 8 }, () => new T.Vector3());
			this.nCars = 0;
			this.shelter = 0;
			this.shelterTarget = 0;
			this.build(1);
		}

		build(scale) {
			for (const m of [this.rain, this.rainNear, this.snow, this.splash, this.leaves]) if (m) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
			const mk = (snow, speed) => new T.ShaderMaterial({
				uniforms: {
					uT: { value: 0 }, uCenter: { value: new T.Vector3() }, uBox: { value: new T.Vector3(90, 90, 90) }, uSpeed: { value: speed }, uDrift: { value: new T.Vector2(snow ? 0.7 : 2.6, snow ? 0.35 : 1.3) },
					uLen: { value: snow ? 0 : 1 }, uSize: { value: snow ? 4.2 : 1 }, uSnow: { value: snow ? 1 : 0 }, uWindK: { value: 0.5 },
					uColor: { value: new T.Color(snow ? '#ffffff' : '#d4dee9') }, uOpacity: { value: 0 }, uLight: { value: 1 },
					uCar: { value: this.carM }, uCarH: { value: this.carH }, uCars: { value: 0 }, uLeaf: { value: 0 },
				},
				vertexShader: VS,
				fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uSnow; uniform float uLight; uniform float uLeaf; uniform float uT; varying float vA; varying float vS;
					void main() {
						float a = uOpacity * vA;
						if (a < 0.002) discard;
						if (uLeaf > 0.5) {
							// spadający liść: obracany owal (wirowanie – kąt z ziarna i czasu w vS), jesienne kolory
							vec2 c = gl_PointCoord - 0.5;
							float an = vS * 40.0 + uT * (1.2 + vS * 2.5);
							c = mat2(cos(an), -sin(an), sin(an), cos(an)) * c;
							float e = length(c * vec2(1.0, 2.1 + 1.4 * abs(sin(an * 0.7))));
							a *= smoothstep(0.42, 0.34, e);
							if (a < 0.02) discard;
							vec3 col = mix(vec3(0.78, 0.5, 0.12), vec3(0.58, 0.24, 0.08), fract(vS * 13.0));
							col = mix(col, vec3(0.82, 0.7, 0.2), step(0.7, fract(vS * 7.0)));
							gl_FragColor = vec4(col * uLight * (0.8 + 0.3 * fract(vS * 5.0)), a);
							return;
						}
						if (uSnow > 0.5) {
							vec2 c = gl_PointCoord - 0.5;
							float r = length(c);
							// płatek: miękki krążek z jaśniejszym środkiem
							a *= smoothstep(0.5, 0.2, r) * (0.7 + 0.3 * smoothstep(0.25, 0.0, r));
						}
						// krople i płatki różnej jasności (część łapie światło, część jest w cieniu)
						gl_FragColor = vec4(uColor * uLight * (0.75 + 0.5 * vS), a);
					}`,
				transparent: true,
				depthWrite: false,
				fog: false,
			});
			this.rain = new T.LineSegments(precip(Math.round(16000 * scale), false), mk(false, 24));
			this.rainNear = new T.LineSegments(precip(Math.round(5000 * scale), false), mk(false, 24));
			this.snow = new T.Points(precip(Math.round(18000 * scale), true), mk(true, 1.5));
			// spadające liście (jesień): rzadkie, większe, wolniej i mocniej niesione wiatrem
			this.leaves = new T.Points(precip(Math.round(1600 * scale), true), mk(true, 0.85));
			this.leaves.material.uniforms.uLeaf.value = 1;
			this.leaves.material.uniforms.uSize.value = 7;
			this.leaves.material.uniforms.uDrift.value.set(2.4, 1.2);
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
			for (const m of [this.rain, this.rainNear, this.snow, this.splash, this.leaves]) {
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
			if (instant) { Object.assign(this.cur, this.target); this.cur.snowGround = this.snowGroundTarget(); }
		}
		// pora roku: jesienią spadające liście, zimą lekka pokrywa śnieżna także bez opadu (nie w deszczu)
		setSeason(season) {
			this.season = season || 'summer';
		}
		snowGroundTarget() {
			return Math.max(this.target.snowGround, this.season === 'winter' && this.target.rain < 0.5 ? 0.45 : 0);
		}
		/* Błyskawice (burza – lightning): co 5–21 s wyładowanie w losowym kierunku 0,4–5,5 km od kamery: błysk (flash 0…1 –
		   scena rozjaśnia niebo i światło), kanał błyskawicy (bliżej niż 3,5 km, ok. 0,3 s) i grzmot z opóźnieniem
		   odległość / 343 m/s (takeThunder – main.js odtwarza) */
		updateLightning(dt, camera) {
			this.flash = 0;
			if (!this.bolts) { this.bolts = []; this.thunder = []; this.nextBolt = 3; }
			if (this.cur.lightning > 0.5) {
				this.nextBolt -= dt;
				if (this.nextBolt <= 0) {
					this.nextBolt = 5 + Math.random() * 16;
					const dist = 400 + Math.pow(Math.random(), 0.7) * 5100, ang = Math.random() * Math.PI * 2;
					const power = Math.max(0.15, 1 - dist / 6000);
					this.bolts.push({ t: 0, power, dist, ang, mesh: dist < 3500 ? this.boltMesh(camera, dist, ang) : null });
					this.thunder.push({ delay: dist / 343, gain: power, dist });
				}
			}
			for (const b of this.bolts) {
				b.t += dt;
				// dwa–trzy rozbłyski w ciągu ok. 0,35 s
				const t = b.t, f = Math.exp(-t * 14) + (t > 0.11 ? 0.7 * Math.exp(-(t - 0.11) * 16) : 0) + (t > 0.24 ? 0.45 * Math.exp(-(t - 0.24) * 18) : 0);
				this.flash = Math.max(this.flash, Math.min(1, f * b.power));
				if (b.mesh) b.mesh.material.opacity = Math.min(1, f * 1.2);
			}
			this.bolts = this.bolts.filter((b) => {
				if (b.t < 0.6) return true;
				if (b.mesh) { this.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
				return false;
			});
		}
		takeThunder() { const t = this.thunder || []; this.thunder = []; return t; }
		// kanał błyskawicy: łamana z rozgałęzieniem od podstawy chmur (ok. 900 m) do ziemi, wstęga zwrócona do kamery
		boltMesh(camera, dist, ang) {
			const R = Math.min(dist, 2600); // dalej – i tak za mgłą
			const base = new T.Vector3(camera.x + Math.sin(ang) * R, 0, camera.z - Math.cos(ang) * R);
			const top = 900, ground = camera.y - 40;
			const side = new T.Vector3(Math.cos(ang), 0, Math.sin(ang));
			const w = 2.2 + R / 700;
			const pos = [];
			const strip = (pts, wid) => {
				for (let i = 0; i + 1 < pts.length; i++) {
					const a = pts[i], b = pts[i + 1];
					const ax = side.clone().multiplyScalar(wid / 2);
					pos.push(a.x - ax.x, a.y, a.z - ax.z, a.x + ax.x, a.y, a.z + ax.z, b.x + ax.x, b.y, b.z + ax.z);
					pos.push(a.x - ax.x, a.y, a.z - ax.z, b.x + ax.x, b.y, b.z + ax.z, b.x - ax.x, b.y, b.z - ax.z);
				}
			};
			const main = [];
			let p = new T.Vector3(base.x + (Math.random() - 0.5) * 200, top, base.z + (Math.random() - 0.5) * 200);
			const n = 16;
			for (let i = 0; i <= n; i++) {
				main.push(p.clone());
				const k = i / n;
				p = new T.Vector3(p.x + side.x * (Math.random() - 0.5) * 120 + (base.x - p.x) * 0.15, top + (ground - top) * ((i + 1) / n), p.z + side.z * (Math.random() - 0.5) * 120 + (base.z - p.z) * 0.15);
				if (k > 0.2 && k < 0.6 && Math.random() < 0.25) {
					// rozgałęzienie
					const br = [main[main.length - 1].clone()];
					let q = br[0].clone();
					for (let j = 0; j < 5; j++) { q = new T.Vector3(q.x + side.x * (Math.random() - 0.3) * 90, q.y - 40 - Math.random() * 50, q.z + side.z * (Math.random() - 0.3) * 90); br.push(q.clone()); }
					strip(br, w * 0.5);
				}
			}
			strip(main, w);
			const g = new T.BufferGeometry();
			g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
			const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: new T.Color(2.2, 2.3, 2.6), transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
			m.frustumCulled = false;
			m.renderOrder = 1050;
			this.scene.add(m);
			return m;
		}

		/* Pojazdy, w których nie pada: cars – wagony ({ group, len, H }), wybierane najbliższe kamery (do 8); macierze
		   odwrotne co klatkę (pociąg jedzie). */
		setCars(cars, camera) {
			const list = (cars || []).filter((c) => c && c.group).map((c) => ({ c, d: c.group.position.distanceToSquared(camera) })).sort((a, b) => a.d - b.d).slice(0, 8);
			list.forEach(({ c }, i) => {
				c.group.updateMatrixWorld();
				this.carM[i].copy(c.group.matrixWorld).invert();
				this.carH[i].set(1.5, (c.H || 4.3) / 2 + 0.1, c.len / 2 + 0.05);
			});
			this.nCars = list.length;
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
			for (const p of ['cover', 'shadow', 'haze', 'rain', 'snow', 'fogNear', 'fogFar', 'wind', 'sun', 'lightning']) this.cur[p] += (this.target[p] - this.cur[p]) * k;
			this.updateLightning(dt, camera);
			// śnieg osiada powoli (ok. pół minuty) i jeszcze wolniej topnieje
			const sg = this.snowGroundTarget();
			this.cur.snowGround += (sg - this.cur.snowGround) * Math.min(1, dt * (sg > this.cur.snowGround ? 0.06 : 0.02));
			// nawierzchnia moknie i schnie wolniej niż pada
			this.cur.wet += (this.target.wet - this.cur.wet) * Math.min(1, dt * 0.08);
			// tunel: opad gaśnie w ciągu ok. 0,5 s po wjeździe, wraca po wyjeździe
			this.shelter += (this.shelterTarget - this.shelter) * Math.min(1, dt * 3);
			const open = 1 - this.shelter;
			// warstwa przy kamerze: gęste krople przelatujące tuż przed obiektywem
			this.nearCenter.copy(camera);
			const nearBox = new T.Vector3(36, 30, 36);
			// spadające liście: tylko pojedyncze (więcej przy wietrze) – jesień widać głównie po liściach leżących na ziemi
			const leafA = this.season === 'autumn' ? (0.06 + 0.16 * Math.min(1, this.cur.wind || 0)) * open * (1 - Math.min(1, this.cur.snow)) : 0;
			for (const [m, a, ctr, bx] of [[this.rain, Math.min(1.35, this.cur.rain) * 0.32 * open, this.center, this.box], [this.rainNear, Math.min(1.35, this.cur.rain) * 0.28 * open, this.nearCenter, nearBox], [this.snow, this.cur.snow * 0.95 * open, this.center, this.box], [this.leaves, leafA, this.center, this.box]]) {
				const u = m.material.uniforms;
				u.uT.value = this.time;
				u.uCenter.value.copy(ctr);
				u.uBox.value.copy(bx);
				u.uOpacity.value = a;
				u.uWindK.value = this.cur.wind;
				u.uLight.value = this.light;
				u.uCars.value = this.nCars;
				m.visible = a > 0.01;
			}
			const su = this.splash.material.uniforms;
			su.uT.value = this.time;
			su.uCenter.value.set(focus.x, 0, focus.z);
			su.uR.value = Math.min(60, 18 + dist * 0.35);
			su.uGround.value = focus.y - 0.3;
			su.uOpacity.value = this.cur.rain * 0.8 * open;
			su.uLight.value = this.light;
			this.splash.visible = this.cur.rain * open > 0.05;
			return this.cur;
		}
	}

	Weather.PRESETS = PRESETS;
	NS.Weather = Weather;
})();
