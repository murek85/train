/* Wspólne narzędzia 3D: szum, tekstury z napisami, współdzielone materiały i bryły. */
(function () {
	'use strict';
	const T = window.THREE;
	const NS = (window.Train3D = window.Train3D || {});

	function hash(n) {
		const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
		return x - Math.floor(x);
	}
	function hash2(a, b) { return hash(a * 57.31 + b * 113.97); }
	function smoothstep(a, b, x) {
		const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
		return t * t * (3 - 2 * t);
	}
	// szum wartości 2D, wynik 0..1
	function vnoise(x, y) {
		const xi = Math.floor(x), yi = Math.floor(y);
		const xf = x - xi, yf = y - yi;
		const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
		const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
		return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
	}

	// ---- tekstury ----
	const texCache = new Map();
	function canvasTexture(key, w, h, draw) {
		if (texCache.has(key)) return texCache.get(key);
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		draw(c.getContext('2d'), w, h);
		const tex = new T.CanvasTexture(c);
		tex.colorSpace = T.SRGBColorSpace;
		tex.anisotropy = 4;
		texCache.set(key, tex);
		return tex;
	}

	function glowTexture() {
		return canvasTexture('glow', 64, 64, (g, w) => {
			const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
			r.addColorStop(0, 'rgba(255,255,255,1)');
			r.addColorStop(0.25, 'rgba(255,255,255,0.7)');
			r.addColorStop(1, 'rgba(255,255,255,0)');
			g.fillStyle = r;
			g.fillRect(0, 0, w, w);
		});
	}

	// tablica z napisem (nazwa stacji itp.)
	function labelTexture(text, bg, fg) {
		return canvasTexture(`label|${text}|${bg}|${fg}`, 512, 112, (g, w, h) => {
			g.font = '700 64px system-ui, sans-serif';
			g.fillStyle = bg;
			g.fillRect(0, 0, w, h);
			g.strokeStyle = 'rgba(255,255,255,0.9)';
			g.lineWidth = 6;
			g.strokeRect(5, 5, w - 10, h - 10);
			g.fillStyle = fg;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			let size = 64;
			while (g.measureText(text).width > w - 40 && size > 24) {
				size -= 4;
				g.font = `700 ${size}px system-ui, sans-serif`;
			}
			g.fillText(text, w / 2, h / 2 + 3);
		});
	}

	// znak drogowy kolejowy: kwadrat lub trójkąt z napisem
	function boardTexture(text, fill, shape) {
		return canvasTexture(`board|${text}|${fill}|${shape}`, 128, 128, (g, w) => {
			g.fillStyle = fill;
			g.strokeStyle = '#111';
			g.lineWidth = 8;
			g.beginPath();
			if (shape === 'tri') {
				g.moveTo(8, 12);
				g.lineTo(w - 8, 12);
				g.lineTo(w / 2, w - 8);
				g.closePath();
			} else if (shape === 'w4') {
				g.rect(14, 8, w - 28, w - 16);
			} else g.rect(8, 8, w - 16, w - 16);
			g.fill();
			g.stroke();
			g.fillStyle = '#111';
			if (shape === 'w4') {
				g.fillRect(24, w / 2 - 12, w - 48, 24);
				return;
			}
			g.font = `800 ${shape === 'tri' ? 40 : text.length > 2 ? 52 : 64}px system-ui, sans-serif`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText(text, w / 2, shape === 'tri' ? 48 : w / 2 + 4);
		});
	}

	function sprite(tex, w, h, opts = {}) {
		const m = new T.SpriteMaterial({
			map: tex,
			transparent: true,
			depthWrite: false,
			color: opts.color || 0xffffff,
			blending: opts.additive ? T.AdditiveBlending : T.NormalBlending,
			fog: opts.fog !== false,
			sizeAttenuation: true,
		});
		const s = new T.Sprite(m);
		s.scale.set(w, h, 1);
		s.userData.ownMaterial = true;
		return s;
	}

	// ---- wspólne uniformy shaderów ----
	// uTime – czas, uWind – siła wiatru (0…1.5), uWet – zmoczenie powierzchni (0…1, schnie powoli),
	// uSnow – pokrywa śnieżna (0…1, narasta i topnieje powoli), uRain – bieżąca siła deszczu (0…1)
	const U = { uTime: { value: 0 }, uWind: { value: 0.4 }, uWet: { value: 0 }, uSnow: { value: 0 }, uRain: { value: 0 } };

	const NOISE_GLSL = `
		float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
		float gNoise(vec2 p) {
			vec2 i = floor(p), f = fract(p);
			f = f * f * (3.0 - 2.0 * f);
			return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
		}
		float gFbm(vec2 p) { return gNoise(p) * 0.5 + gNoise(p * 2.03 + 1.7) * 0.25 + gNoise(p * 4.01 + 3.1) * 0.125 + gNoise(p * 8.05 + 5.3) * 0.0625; }
		// kamienie: najbliższy punkt komórkowy (F1), drugi najbliższy (F2) i numer kamienia
		vec3 gStones(vec2 p) {
			vec2 c = floor(p), f = fract(p);
			float d1 = 8.0, d2 = 8.0, id = 0.0;
			for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
				vec2 g = vec2(float(x), float(y));
				vec2 o = vec2(gHash(c + g), gHash(c + g + 17.3)) * 0.8 + 0.1;
				float d = length(g + o - f);
				if (d < d1) { d2 = d1; d1 = d; id = gHash(c + g + 3.7); } else if (d < d2) d2 = d;
			}
			return vec3(d1, d2, id);
		}
		// kręgi od kropel deszczu w kałużach
		float gRipples(vec2 p, float t) {
			float s = 0.0;
			for (int k = 0; k < 2; k++) {
				vec2 q = p * 1.6 + float(k) * 0.37, c = floor(q);
				vec2 o = vec2(gHash(c), gHash(c + 7.1)) * 0.6 + 0.2;
				float ph = fract(t * 1.3 + gHash(c + 3.3));
				float d = length(fract(q) - o);
				s += smoothstep(0.05, 0.0, abs(d - ph * 0.45)) * (1.0 - ph) * (1.0 - ph);
			}
			return s;
		}`;

	/* Pogoda na powierzchniach (wszystkie materiały na zewnątrz): mokre – ciemniejsze i błyszczące, w czasie
	   deszczu strużki spływające po pionowych ścianach; śnieg osiada na powierzchniach skierowanych w górę
	   (najpierw płatami, potem wszędzie), z delikatnym połyskiem. wN – normalna w świecie. */
	const WEATHER_GLSL = (wetK, snowK) => `
		{
			float up = wN.y;
			float wet = uWet * ${wetK.toFixed(2)};
			diffuseColor.rgb *= 1.0 - 0.3 * wet;
			#ifdef STANDARD
			roughnessFactor = mix(roughnessFactor, max(0.06, roughnessFactor * 0.3), wet);
			#endif
			if (uRain > 0.01 && abs(up) < 0.55) {
				vec2 sp = vec2((vWorldP.x + vWorldP.z) * 2.6, vWorldP.y * 0.35 + uTime * 1.6);
				float streak = smoothstep(0.72, 0.95, gNoise(vec2(sp.x, sp.y)) * gNoise(vec2(sp.x * 0.5 + 9.0, 0.0)) * 1.6);
				diffuseColor.rgb *= 1.0 - 0.16 * streak * uRain;
				#ifdef STANDARD
				roughnessFactor = mix(roughnessFactor, 0.05, streak * uRain);
				#endif
			}
			float sn = gNoise(vWorldP.xz * 0.3) * 0.55 + gNoise(vWorldP.xz * 1.7) * 0.3 + gNoise(vWorldP.xz * 6.5) * 0.15;
			float th = 1.05 - uSnow * 1.15;
			float snowMask = smoothstep(0.3, 0.75, up) * smoothstep(th - 0.07, th + 0.07, sn) * min(1.0, uSnow * 3.0) * ${snowK.toFixed(2)};
			vec3 snowC = mix(vec3(0.74, 0.8, 0.9), vec3(0.97, 0.98, 1.0), 0.55 + 0.45 * gNoise(vWorldP.xz * 3.0));
			snowC = mix(diffuseColor.rgb * 0.6 + vec3(0.3, 0.32, 0.36), snowC, smoothstep(0.0, 0.6, snowMask));
			diffuseColor.rgb = mix(diffuseColor.rgb, snowC, smoothstep(0.0, 0.3, snowMask));
			#ifdef STANDARD
			roughnessFactor = mix(roughnessFactor, 0.62, snowMask);
			metalnessFactor = mix(metalnessFactor, 0.0, snowMask);
			#endif
		}`;

	/* Teren: trawa (źdźbła, kępy, przesuszone płaty), piasek (zmarszczki od wiatru, ziarno), ziemia uprawna
	   (rzędy) – wagi w atrybucie aMat (trawa, piasek, ziemia); mikrorzeźba na oświetleniu (bump), kałuże
	   z kręgami od kropli w czasie deszczu. */
	const GROUND_GLSL = `
		vec2 wp = vWorldP.xz;
		float dist = length(vViewPosition);
		float near = 1.0 - smoothstep(60.0, 260.0, dist);
		// drobne wzory gasną, gdy piksel obejmuje więcej niż ich okres (bez migotania w oddali)
		float px = length(fwidth(wp));
		float aa3 = 1.0 - smoothstep(0.08, 0.3, px * 2.7), aa4 = 1.0 - smoothstep(0.03, 0.12, px * 6.0);
		vec3 mw = max(vMat, vec3(0.0));
		mw /= max(0.001, mw.x + mw.y + mw.z);
		vec3 base = diffuseColor.rgb;
		// trawa
		float g1 = gNoise(wp * 0.045), g2 = gNoise(wp * 0.38), g3 = mix(0.5, gNoise(wp * 2.7), aa3), g4 = mix(0.5, gNoise(wp * vec2(6.0, 8.5)), aa4);
		float gM = gFbm(wp * 0.011 + 2.0);
		// odcienie trawy (przesuszenie, kępy) tylko na zielonym – szare place i nieużytki miejskie bez żółknięcia
		float bMax = max(base.r, max(base.g, base.b));
		float greenK = smoothstep(0.15, 0.4, (bMax - min(base.r, min(base.g, base.b))) / max(0.01, bMax)) * step(base.r, base.g);
		vec3 grassC = base * (0.7 + 0.36 * g1 + 0.16 * g2) * (0.86 + 0.28 * gM);
		grassC = mix(grassC, grassC * vec3(1.28, 1.12, 0.62), smoothstep(0.58, 0.86, gNoise(wp * 0.018 + 3.0)) * 0.35 * greenK);
		grassC = mix(grassC, grassC * vec3(0.78, 0.92, 0.72), smoothstep(0.55, 0.8, g2) * 0.4);
		float blades = g3 * 0.5 + g4 * 0.5;
		// ciemniejsze, bujniejsze kępy i jaśniejsze, rzadsze miejsca (z bliska trawa nie jest jednolitą płaszczyzną)
		vec2 wr = mat2(0.8, -0.6, 0.6, 0.8) * wp;
		float clump = mix(0.5, gNoise(wr * 1.25 + 9.0) * 0.65 + gNoise(mat2(0.8, 0.6, -0.6, 0.8) * wp * 2.9) * 0.35, 1.0 - smoothstep(0.1, 0.35, px * 2.9));
		grassC = mix(grassC, grassC * mix(vec3(0.85), vec3(0.72, 0.86, 0.62), greenK), smoothstep(0.5, 0.78, clump) * 0.6);
		grassC = mix(grassC, grassC * mix(vec3(1.06), vec3(1.12, 1.1, 0.86), greenK), (1.0 - smoothstep(0.18, 0.42, clump)) * 0.35);
		grassC *= 0.82 + 0.36 * blades;
		// piasek
		float rip = sin(dot(wp, vec2(1.6, 0.6)) + gNoise(wp * 0.25) * 5.0) * 0.5 + 0.5;
		vec3 sandC = base * (0.92 + 0.1 * rip * near + 0.08 * g4 * near) * (0.95 + 0.1 * g1);
		// ziemia uprawna z rzędami
		float rowsX = 0.5 + 0.5 * sin(wp.x * 2.3), rowsZ = 0.5 + 0.5 * sin(wp.y * 2.3);
		float rows = mix(1.0, 0.78 + 0.22 * rowsX, clamp(vRow.x, 0.0, 1.0)) * mix(1.0, 0.78 + 0.22 * rowsZ, clamp(vRow.y, 0.0, 1.0));
		vec3 soilC = base * rows * (0.85 + 0.2 * g2 + 0.1 * g4 * near);
		diffuseColor.rgb = grassC * mw.x + sandC * mw.y + soilC * mw.z;
		// wysokość w metrach (kilka centymetrów): większa dawała losowe normalne – plamy w słońcu
		gH = (blades * mw.x * 0.8 + (rip * 0.7 + g4 * 0.3) * mw.y + (rows * 0.6 + g3 * 0.4) * mw.z) * near * 0.035;
		gSand = mw.y;
		// kałuże: na płaskich miejscach, gdy ziemia jest mokra
		puddle = smoothstep(0.62, 0.78, gNoise(wp * 0.06) * 0.7 + gNoise(wp * 0.25) * 0.3 + uWet * 0.12) * smoothstep(0.25, 0.6, uWet) * (1.0 - mw.y * 0.8);`;

	const GRAVEL_GLSL = `
		vec2 wp = vWorldP.xz;
		float near = 1.0 - smoothstep(30.0, 140.0, length(vViewPosition));
		vec3 st = gStones(wp * 7.5);
		near *= 1.0 - smoothstep(0.04, 0.12, length(fwidth(wp)) * 7.5 * 0.3);
		float edge = smoothstep(0.0, 0.18, st.y - st.x);
		vec3 tint = mix(vec3(0.88, 0.87, 0.85), vec3(1.04, 1.0, 0.95), st.z);
		tint = mix(tint, vec3(0.86, 0.78, 0.7), step(0.88, st.z) * 0.5);
		// dalej, gdy kamienie są mniejsze niż piksel: plamista faktura tłucznia zamiast gładkiej szarości
		float pxg = length(fwidth(wp));
		float farT = mix(0.5, gNoise(wp * 2.3), 1.0 - smoothstep(0.1, 0.3, pxg * 2.3)) * 0.6 + gNoise(wp * 0.55) * 0.4;
		vec3 farC = vec3(0.8 + 0.3 * farT) * mix(vec3(1.0), vec3(1.05, 0.97, 0.9), smoothstep(0.6, 0.8, gNoise(wp * 0.21 + 5.0)) * 0.6);
		diffuseColor.rgb *= mix(farC, tint * (0.68 + 0.32 * edge), near) * (0.88 + 0.18 * gNoise(wp * 0.7));
		gH = (1.0 - st.x) * edge * near;`;

	/* Wspólne dla nawierzchni: normalna geometryczna w świecie (z pochodnych – działa bez atrybutów), skala
	   piksela (wzory drobniejsze niż piksel gasną – bez migotania w oddali). */
	const SURF_HEAD = `
		vec2 wp = vWorldP.xz;
		vec3 gN = normalize(cross(dFdx(vWorldP), dFdy(vWorldP)));
		float fl = smoothstep(0.75, 0.92, abs(gN.y));
		float px = max(length(dFdx(vWorldP)), length(dFdy(vWorldP)));
		// wzór o częstotliwości f (okresy na metr) gaśnie, gdy okres zbliża się do dwóch–trzech pikseli
		#define AAK(f) (1.0 - smoothstep(0.22, 0.5, px * (f)))
		float aaF = AAK(38.0), aaM = AAK(10.0);
		// współrzędne wzoru w płaszczyźnie powierzchni (na ścianach – poziomo wzdłuż ściany i w pionie, bez smug)
		vec2 sp2 = abs(gN.y) > 0.6 ? wp : vec2(abs(gN.x) > abs(gN.z) ? vWorldP.z : vWorldP.x, vWorldP.y);
		vec3 c0 = diffuseColor.rgb;`;

	/* Drogi (jedna siatka z kolorami wierzchołków): asfalt – kruszywo, łaty napraw, spękania, ciemniejsze
	   koleiny; chodniki i place – kostka betonowa z fugami; oznakowanie poziome – starte miejscami. Rodzaj
	   nawierzchni rozpoznawany po kolorze (asfalt ciemny, kostka jasnoszara, linie białe/żółte). */
	const ROAD_GLSL = `${SURF_HEAD}
		float lum = dot(c0, vec3(0.299, 0.587, 0.114));
		float sat = max(c0.r, max(c0.g, c0.b)) - min(c0.r, min(c0.g, c0.b));
		// linie białe (#e9e7e0) i żółte; chodnik #a7a49d, krawężnik #c9c6be – kostka
		float mark = max(smoothstep(0.66, 0.74, lum), smoothstep(0.18, 0.3, sat) * step(0.12, lum));
		float pave = smoothstep(0.1, 0.16, lum) * (1.0 - mark);
		float asph = 1.0 - max(mark, pave);
		float m1 = gFbm(wp * 0.07), m2 = gNoise(wp * 0.6);
		// asfalt
		float speck = mix(0.5, gNoise(wp * 38.0), aaF);
		vec3 cr = gStones(wp * 0.32);
		float crack = (1.0 - smoothstep(0.0, 0.035, cr.y - cr.x)) * smoothstep(0.55, 0.75, gNoise(wp * 0.15 + 7.0)) * AAK(8.0);
		float patchA = smoothstep(0.6, 0.7, gFbm(mat2(0.8, -0.6, 0.6, 0.8) * wp * 0.09 + 11.0)) * 0.55; // ciemniejsze łaty napraw
		// asfalt jaśniejszy i neutralny (ciemnogranatowy wyglądał jak mokry), kruszywo i drobne nierówności
		float mid = mix(0.5, gNoise(mat2(0.8, -0.6, 0.6, 0.8) * wp * 5.0), AAK(5.0));
		vec3 asC = mix(c0, vec3(dot(c0, vec3(0.333))), 0.6) * 1.5 * (0.8 + 0.36 * m1 + 0.1 * m2) * (0.86 + 0.28 * speck) * (0.93 + 0.14 * mid);
		asC = mix(asC, asC * vec3(0.78, 0.8, 0.84), patchA);
		asC *= 1.0 - 0.45 * crack;
		// kostka: przesunięte rzędy prostokątów 0,2 × 0,1 m wzdłuż osi świata, fugi ciemniejsze
		vec2 q = wp * vec2(5.0, 10.0);
		q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
		vec2 f = fract(q), id = floor(q);
		float joint = min(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y) * 1.0);
		float jm = smoothstep(0.0, max(0.12, fwidth(joint) * 1.2), joint);
		float tone = gHash(id) * 0.16;
		vec3 pvC = c0 * mix(1.0, (0.88 + tone) * mix(0.62, 1.0, jm), AAK(22.0) * fl) * (0.88 + 0.22 * m1);
		// linie – ścieranie
		float wear = smoothstep(0.5, 0.8, gNoise(wp * 1.4) * 0.6 + gNoise(wp * 7.0) * 0.4 * AAK(7.0));
		vec3 mkC = mix(c0, vec3(0.05), wear * 0.45);
		diffuseColor.rgb = asC * asph + pvC * pave + mkC * mark;
		// wysokości mikrorzeźby w metrach (kilka milimetrów)
		gH = (speck * 0.004 * asph * aaF - crack * 0.006) + jm * pave * AAK(22.0) * fl * 0.008;
		puddle = smoothstep(0.66, 0.8, gNoise(wp * 0.09) * 0.7 + gNoise(wp * 0.4) * 0.3 + uWet * 0.1) * smoothstep(0.3, 0.7, uWet) * (asph + pave * 0.5) * fl;
		gRough = -0.08 * mark + 0.05 * (m2 - 0.5);`;

	/* Beton peronów i pomostów: plamy, drobne ziarno, rzadkie rysy, ciemniejsze zacieki. */
	const CONCRETE_GLSL = `${SURF_HEAD}
		float m1 = gFbm(sp2 * 0.12), m2 = gNoise(sp2 * 1.1);
		float grain = mix(0.5, gNoise(sp2 * 30.0), AAK(30.0));
		vec3 cr = gStones(wp * 0.5);
		float crack = (1.0 - smoothstep(0.0, 0.03, cr.y - cr.x)) * smoothstep(0.6, 0.8, gNoise(wp * 0.3 + 3.0)) * AAK(14.0) * fl;
		float stain = smoothstep(0.55, 0.85, gFbm(sp2 * 0.35 + 4.0));
		diffuseColor.rgb = c0 * (0.86 + 0.24 * m1 + 0.06 * m2) * (0.94 + 0.12 * grain) * (1.0 - 0.18 * stain) * (1.0 - 0.4 * crack);
		gH = grain * 0.003 - crack * 0.005;
		gRough = 0.06 * (m2 - 0.5) - 0.1 * stain * uWet;`;

	/* Zabrudzenia obiektów nieruchomych (elewacje, dachy, fundamenty, podkłady): plamy, zacieki pionowe
	   na ścianach, ziarno tynku – w przestrzeni świata, więc tylko dla obiektów, które się nie ruszają. */
	const DIRT_GLSL = `${SURF_HEAD}
		float m1 = gFbm(vec2(wp.x + wp.y, vWorldP.y) * 0.18 + wp * 0.05);
		float streak = gNoise(vec2((wp.x - wp.y) * 2.2 + gN.x * 3.0, vWorldP.y * 0.12)) * (1.0 - fl);
		float grain = mix(0.5, gNoise(vWorldP.xy * 20.0 + vWorldP.zy * 20.0), AAK(30.0));
		diffuseColor.rgb = c0 * (0.88 + 0.2 * m1) * (1.0 - 0.14 * smoothstep(0.5, 0.9, streak)) * (0.95 + 0.1 * grain);
		gH = grain * 0.002;`;

	/* Korony drzew i krzewy: kępki liści (szum 3D w przestrzeni świata – każde drzewo inne), prześwity
	   ciemniejsze, nasłonecznione końce jaśniejsze i cieplejsze; drobny wzór gaśnie w oddali. */
	const LEAF_GLSL = `
		vec3 lp = vWorldP * 4.2;
		float lpx = length(fwidth(vWorldP)) * 4.2;
		float laa = 1.0 - smoothstep(0.15, 0.45, lpx);
		float leafN = gNoise(lp.xz + lp.y * 0.71) * 0.55 + gNoise(lp.zy * 1.93 + lp.x * 0.47 + 3.0) * 0.45;
		float leafM = gNoise(vWorldP.xz * 0.9 + vWorldP.y * 0.6);
		diffuseColor.rgb *= mix(0.92 + 0.16 * leafM, (0.66 + 0.6 * leafN) * (0.9 + 0.2 * leafM), laa);
		diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 0.78), smoothstep(0.62, 0.86, leafN) * 0.45 * laa);
		gH = leafN * 0.05 * laa;`;

	// mikrorzeźba: wysokość gH zgina normalną (pochodne ekranowe)
	const BUMP_GLSL = (amp) => `
		{
			vec3 sp = -vViewPosition, sx = dFdx(sp), sy = dFdy(sp);
			vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
			float det = dot(sx, r1);
			vec3 grad = sign(det) * (dFdx(gH) * r1 + dFdy(gH) * r2) * ${amp.toFixed(2)};
			normal = normalize(abs(det) * normal - grad);
		}`;

	/* Łatki shaderów (onBeforeCompile). Każdy wariant ma własny klucz programu.
	   - 'lit'    : cienie chmur + pogoda na powierzchni (budynki, pociągi, znaki…),
	   - 'wind'   : roślinność – kołysanie na wietrze (instancje) + pogoda,
	   - 'ground' : teren – trawa / piasek / ziemia (aMat), rzędy upraw (aRow), mikrorzeźba, kałuże, pogoda,
	   - 'gravel' : podsypka – kamienie, mikrorzeźba, pogoda,
	   - 'clean'  : cienie chmur, bez pogody (woda, szyby),
	   - 'indoor' : bez chmur i pogody (wnętrza). */
	const allMaterials = [];
	function patch(material, variant) {
		allMaterials.push(material);
		material.customProgramCacheKey = () => 'train2-' + variant;
		material.onBeforeCompile = (shader) => {
			if (variant !== 'indoor' && NS.cloudShade) NS.cloudShade(T, shader);
			Object.assign(shader.uniforms, U);
			if (variant === 'indoor' || variant === 'clean') return;
			const ground = variant === 'ground', gravel = variant === 'gravel';
			const surf = variant === 'road' ? ROAD_GLSL : variant === 'concrete' ? CONCRETE_GLSL : variant === 'dirt' ? DIRT_GLSL : '';
			const veg = variant === 'wind' || variant === 'grass';
			const wind = veg ? `
				#ifdef USE_INSTANCING
				vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
				#else
				vec3 ip = vec3(0.0);
				#endif
				float sway = (position.y + 0.5) * (position.y + 0.5) * uWind * (1.0 + 0.5 * sin(uTime * 0.4 + ip.x * 0.01));
				transformed.x += sin(uTime * 1.7 + ip.x * 0.13 + ip.z * 0.07) * sway * 0.07;
				transformed.z += cos(uTime * 1.3 + ip.z * 0.11 + ip.x * 0.05) * sway * 0.05;
				${variant === 'grass' ? 'transformed.x += sin(uTime * 2.6 + ip.x * 0.4 + ip.z * 0.3) * sway * 0.12; transformed.y = -0.5 + (transformed.y + 0.5) * (1.0 - 0.9 * uSnow); transformed = mix(transformed, vec3(0.0, -0.6, 0.0), smoothstep(0.3, 0.65, uSnow));' : ''}` : '';
			shader.vertexShader = shader.vertexShader
				.replace('#include <common>', `#include <common>
				uniform float uTime; uniform float uWind; uniform float uSnow;
				varying vec3 vWorldP;
				${ground ? 'attribute vec2 aRow; varying vec2 vRow; attribute vec3 aMat; varying vec3 vMat;' : ''}`)
				.replace('#include <begin_vertex>', `#include <begin_vertex>
				${wind}`)
				.replace('#include <project_vertex>', `#include <project_vertex>
				{
					vec4 wpos = vec4(transformed, 1.0);
					#ifdef USE_INSTANCING
					wpos = instanceMatrix * wpos;
					#endif
					vWorldP = (modelMatrix * wpos).xyz;
				}
				${ground ? 'vRow = aRow; vMat = aMat;' : ''}`);
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', `#include <common>
				uniform float uWet; uniform float uSnow; uniform float uRain; uniform float uTime;
				varying vec3 vWorldP;
				${ground ? 'varying vec2 vRow; varying vec3 vMat;' : ''}
				${NOISE_GLSL}`)
				.replace('#include <color_fragment>', `#include <color_fragment>
				float gH = 0.0, puddle = 0.0, gSand = 0.0, gRough = 0.0; // gRough – zmiana chropowatości (stosowana niżej)
				${ground ? GROUND_GLSL : gravel ? GRAVEL_GLSL : variant === 'wind' ? LEAF_GLSL : surf}`)
				.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
				${ground ? BUMP_GLSL(1.4) : gravel ? BUMP_GLSL(2.6) : surf ? BUMP_GLSL(variant === 'road' ? 1.2 : 0.9) : variant === 'wind' ? BUMP_GLSL(1.0) : ''}
				vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
				#ifdef STANDARD
				roughnessFactor = mix(clamp(roughnessFactor + gRough, 0.3, 1.0), 0.97, gSand);
				#endif
				${WEATHER_GLSL(ground || gravel || variant === 'road' || variant === 'concrete' ? 1.0 : veg ? 0.6 : 0.75, variant === 'grass' ? 0.0 : variant === 'wind' ? 0.75 : 1.0)}
				${ground || variant === 'road' ? `
				// kałuże: ciemne, gładkie jak lustro, z kręgami od kropli
				{
					float pm = puddle * smoothstep(0.85, 0.97, wN.y);
					diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35 + vec3(0.02, 0.03, 0.04), pm);
					#ifdef STANDARD
					roughnessFactor = mix(roughnessFactor, 0.03, pm);
					#endif
					if (uRain > 0.01) {
						float rr = gRipples(vWorldP.xz, uTime) * pm * uRain;
						normal = normalize(normal + vec3(rr * 0.6, 0.0, rr * 0.6));
					}
				}` : ''}`);
		};
		material.userData.shared = true;
		return material;
	}

	// ---- współdzielone materiały i bryły ----
	// mat() – matowe powierzchnie (PBR, żeby mokre błyszczały); { indoor: true } – wnętrza bez pogody
	const mats = new Map();
	function mat(color, extra) {
		const key = 'M' + color + JSON.stringify(extra || {});
		if (!mats.has(key)) {
			const ex = Object.assign({}, extra || {});
			const indoor = ex.indoor, surf = ex.surf;
			delete ex.indoor;
			delete ex.surf;
			mats.set(key, patch(new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.86, metalness: 0, envMapIntensity: 0.35 }, ex)), indoor ? 'indoor' : surf || 'lit'));
		}
		return mats.get(key);
	}
	// materiał PBR (połysk, odbicia nieba)
	function matS(color, extra) {
		const key = 'S' + color + JSON.stringify(extra || {});
		if (!mats.has(key)) {
			const ex = Object.assign({}, extra || {});
			// surf: 'road' | 'concrete' | 'dirt' – proceduralna nawierzchnia (tylko obiekty nieruchome)
			const variant = ex.indoor ? 'indoor' : ex.clean ? 'clean' : ex.surf || 'lit';
			delete ex.indoor;
			delete ex.clean;
			delete ex.surf;
			mats.set(key, patch(new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, ex)), variant));
		}
		return mats.get(key);
	}
	function shared(geo) {
		geo.userData.shared = true;
		return geo;
	}
	const GEO = {
		box: shared(new T.BoxGeometry(1, 1, 1)),
		cyl: shared(new T.CylinderGeometry(0.5, 0.5, 1, 10)),
		cone: shared(new T.ConeGeometry(0.5, 1, 7)),
		ico: shared(new T.IcosahedronGeometry(0.5, 0)),
		sphere: shared(new T.SphereGeometry(0.5, 10, 8)),
		// trójkątny graniastosłup (dach): wierzchołek w górę, podstawa na y = −0.25, szerokość 0.866
		prism: shared(new T.CylinderGeometry(0.5, 0.5, 1, 3).rotateX(-Math.PI / 2)),
	};

	/* Podkład betonowy (jednostkowy jak GEO.box – skalowany 2,6 × 0,2 × 0,26 m): w środku zwężony (talia),
	   przekrój trapezowy (wierzch węższy od spodu), podparcia szyn płaskie. */
	GEO.sleeper = shared((() => {
		const XS = [-0.5, -0.36, -0.2, 0, 0.2, 0.36, 0.5], WS = [1, 1, 0.8, 0.74, 0.8, 1, 1];
		const pos = [], quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
		const sec = (k) => { const x = XS[k], w = WS[k] * 0.5; return { bl: [x, -0.5, -w], br: [x, -0.5, w], tl: [x, 0.5, -w * 0.78], tr: [x, 0.5, w * 0.78] }; };
		for (let k = 0; k + 1 < XS.length; k++) {
			const A = sec(k), B = sec(k + 1);
			quad(A.tl, A.tr, B.tr, B.tl); // wierzch
			quad(A.br, B.br, B.tr, A.tr);
			quad(A.bl, A.tl, B.tl, B.bl);
			quad(A.bl, B.bl, B.br, A.br);
		}
		for (const [k, sg] of [[0, -1], [XS.length - 1, 1]]) {
			const A = sec(k);
			if (sg < 0) quad(A.bl, A.br, A.tr, A.tl); else quad(A.bl, A.tl, A.tr, A.br);
		}
		const g = new T.BufferGeometry();
		g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
		g.computeVertexNormals();
		return g;
	})());

	function box(w, h, d, material, x, y, z) {
		const m = new T.Mesh(GEO.box, material);
		m.scale.set(w, h, d);
		m.position.set(x || 0, y || 0, z || 0);
		return m;
	}

	// dach dwuspadowy: szerokość w, wysokość h, długość len (wzdłuż z), podstawa na wysokości y
	function roof(w, h, len, material, x, y, z) {
		const m = new T.Mesh(GEO.prism, material);
		m.scale.set(w / 0.866, h / 0.75, len);
		m.position.set(x || 0, (y || 0) + 0.25 * (h / 0.75), z || 0);
		return m;
	}

	function disposeTree(obj) {
		obj.traverse((o) => {
			if (o.geometry && !o.isSprite && !o.geometry.userData.shared) o.geometry.dispose();
			if (o.material && !Array.isArray(o.material) && !o.material.userData.shared && (o.userData.ownMaterial || o.isSprite)) o.material.dispose();
		});
	}

	NS.util = { hash, hash2, smoothstep, vnoise, glowTexture, labelTexture, boardTexture, sprite, mat, matS, patch, U, GEO, box, roof, disposeTree, canvasTexture, allMaterials };
})();
