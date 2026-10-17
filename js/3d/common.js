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
	// uWear – mnożnik zabrudzenia taboru (0 – czysty, 1 – zwykła eksploatacja)
	/* mapa światła nocnego (World.updateNightMap): widok z góry ok. 512 × 512 m wokół kamery – lewa połowa tekstury: plamy
	   światła latarni na ziemi, prawa: same oprawy (do odbić w mokrej nawierzchni); uNightBox – x0, z0 lewego dolnego rogu
	   i bok w metrach; uNightK – siła (0 w dzień) */
	const nightBlank = new T.DataTexture(new Uint8Array(4), 1, 1);
	nightBlank.needsUpdate = true;
	const U = { uTime: { value: 0 }, uWind: { value: 0.4 }, uWet: { value: 0 }, uSnow: { value: 0 }, uRain: { value: 0 }, uWear: { value: 1 },
		uNightTex: { value: nightBlank }, uNightBox: { value: new T.Vector3(0, 0, 512) }, uNightK: { value: 0 },
		/* otwory portali tuneli (trasa z mapy, world.js envPortalUniforms): A – środek (x, y dołu, z) i wysokość, B – kierunek
		   w głąb wzdłuż toru (x, z), połowa szerokości, 1 – włączony; teren w otworze odrzucany (siatka wysokości nie ma
		   dziury – skok terenu z dna wykopu nad strop zasłaniał wlot) */
		uPortalA: { value: Array.from({ length: 8 }, () => new T.Vector4()) }, uPortalB: { value: Array.from({ length: 8 }, () => new T.Vector4()) } };

	const NOISE_GLSL = `
		/* skrót: siatka zawinięta co 2048 oczek – współrzędne świata (dziesiątki km × kilka oczek na metr) dawały w sinusie
		   argumenty rzędu 1e7, przy precyzji 32 bitów skrót się „rozsypywał” w kwadratowe płaty (kanciasty śnieg, plamy).
		   Bez sinusa (sin dużych argumentów na części kart graficznych ma kilka bitów dokładności – skrót przyjmował
		   niewiele wartości i sąsiednie oczka wychodziły podobne: schodkowe, kwadratowe płaty śniegu). */
		float gHash(vec2 p) { vec3 p3 = fract(vec3(mod(p, 2048.0).xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
		float gNoise(vec2 p) {
			vec2 i = floor(p), f = fract(p);
			f = f * f * (3.0 - 2.0 * f);
			return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
		}
		/* szum gradientowy (Perlin) 0…1: izolinie gładkie i bez kierunku siatki – szum wartości (gNoise) daje przy progu
		   zaokrąglone kwadraty ułożone wzdłuż osi (płaty śniegu) */
		vec2 gGrad(vec2 i) { float a = gHash(i) * 6.2831853; return vec2(cos(a), sin(a)); }
		float gPerlin(vec2 p) {
			vec2 i = floor(p), f = fract(p);
			vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
			float a = dot(gGrad(i), f), b = dot(gGrad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
			float c = dot(gGrad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), d = dot(gGrad(i + 1.0), f - 1.0);
			return clamp(0.5 + 0.75 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y), 0.0, 1.0);
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
	   deszczu strużki spływające po pionowych ścianach i krople na poziomych (perełki z połyskiem); śnieg osiada na
	   powierzchniach skierowanych w górę (najpierw płatami, potem wszędzie), z delikatnym połyskiem i iskrzeniem
	   kryształków z bliska. wN – normalna w świecie. P – współrzędne wzoru: świata (vWorldP) dla obiektów
	   nieruchomych, pojazdu (vLocP) dla taboru – wzór śniegu i kropel jedzie razem z pociągiem, zamiast przesuwać
	   się po dachu. */
	/* światło latarni z mapy nocnej: plama na ziemi (powierzchnie w górę – w pełni, ściany – trochę; śnieg jasny, asfalt
	   ciemny – przez kolor podłoża) i odbicia opraw w mokrej nawierzchni – promień odbity od powierzchni do wysokości
	   opraw (ok. 6,5 m): przy patrzeniu pod małym kątem odbicie wydłuża się w smugę w stronę oka, jak na mokrym asfalcie */
	const NIGHT_GLSL = `
		if (uNightK > 0.001) {
			vec2 nq = (vWorldP.xz - uNightBox.xy) / uNightBox.z;
			if (nq.x > 0.003 && nq.x < 0.997 && nq.y > 0.003 && nq.y < 0.997) {
				vec3 pool = texture2D(uNightTex, vec2(nq.x * 0.5, nq.y)).rgb;
				float face = 0.25 + 0.75 * max(wN.y, 0.0);
				/* asfalt ma albedo ok. 0,05–0,1 – pod latarnią i tak wyraźnie jaśniejszy (latarnia o rzędy jaśniejsza od księżyca);
				   jasne podłoże (śnieg, beton) – słabsze wzmocnienie, bez prześwietlenia pod gęstymi lampami peronów */
				totalEmissiveRadiance += (diffuseColor.rgb * 0.85 + 0.06) * pool * (0.35 + pool) * 2.0 * face * uNightK;
			}
			float wr = uWet * smoothstep(0.6, 0.9, wN.y);
			if (wr > 0.02) {
				vec3 vd = normalize(vWorldP - cameraPosition);
				vec3 rd = reflect(vd, wN);
				if (rd.y > 0.02) {
					/* chropowatość mokrej nawierzchni rozmywa odbicie głównie w pionie – próbki wzdłuż promienia co 1,8 m po
					   ziemi (mniej niż średnica plamki oprawy – smuga ciągła), od odbicia oprawy na 6,5 m w stronę oka */
					vec3 em = vec3(0.0);
					float d0 = 6.5 / rd.y, stepL = 1.8 / max(length(rd.xz), 0.05);
					for (int i = 0; i < 8; i++) {
						float dist = d0 - stepL * (float(i) - 1.0);
						if (dist < 0.5) break;
						vec2 rq = (vWorldP.xz + rd.xz * min(dist, 400.0) - uNightBox.xy) / uNightBox.z;
						if (dist < 250.0 && rq.x > 0.003 && rq.x < 0.997 && rq.y > 0.003 && rq.y < 0.997) {
							vec3 e = texture2D(uNightTex, vec2(0.5 + rq.x * 0.5, rq.y)).rgb;
							em += e * e;
						}
					}
					float fr = 0.35 + 0.65 * pow(1.0 - max(dot(-vd, wN), 0.0), 3.0);
					totalEmissiveRadiance += em * 0.4 * wr * fr * uNightK;
				}
			}
		}`;
	const WEATHER_GLSL = (wetK, snowK, P = 'vWorldP') => `
		{
			vec3 wP = ${P};
			float up = wN.y;
			float wpx = length(fwidth(wP));
			float wet = uWet * ${wetK.toFixed(2)};
			diffuseColor.rgb *= 1.0 - 0.3 * wet;
			#ifdef STANDARD
			roughnessFactor = mix(roughnessFactor, max(0.06, roughnessFactor * 0.3), wet);
			#endif
			if (uRain > 0.01 && abs(up) < 0.55) {
				vec2 sp = vec2((wP.x + wP.z) * 2.6, wP.y * 0.35 + uTime * 1.6);
				float streak = smoothstep(0.72, 0.95, gNoise(vec2(sp.x, sp.y)) * gNoise(vec2(sp.x * 0.5 + 9.0, 0.0)) * 1.6);
				diffuseColor.rgb *= 1.0 - 0.16 * streak * uRain;
				#ifdef STANDARD
				roughnessFactor = mix(roughnessFactor, 0.05, streak * uRain);
				#endif
			}
			/* krople na powierzchniach poziomych: drobne perełki (ciemniejsze, gładkie), gasną w oddali; jedna kropla na
			   oczko siatki, cała w oczku (bez szukania w sąsiednich – pętla 3 × 3 w każdym materiale wydłużała
			   kompilację shaderów do kilkunastu sekund) */
			if (wet > 0.05 && up > 0.6) {
				vec2 dq = wP.xz * 14.0, di = floor(dq), dfr = fract(dq) - 0.5;
				vec2 dc = (vec2(gHash(di), gHash(di + 7.1)) - 0.5) * 0.4;
				float dr = length(dfr - dc) / (0.12 + 0.12 * gHash(di + 3.3));
				float drop = (1.0 - smoothstep(0.7, 1.0, dr)) * step(0.45, gHash(di + 5.7)) * (1.0 - smoothstep(0.01, 0.03, wpx)) * wet;
				diffuseColor.rgb *= 1.0 - 0.25 * drop;
				#ifdef STANDARD
				roughnessFactor = mix(roughnessFactor, 0.02, drop);
				#endif
			}
			/* wzór płatów śniegu: oktawy obrócone względem siebie (bez krawędzi wzdłuż osi świata – „kwadraty”), najdrobniejsza
			   gaśnie z odległością (z daleka migotała i szarpała brzegi płatów na pikselowe schodki) */
			/* kilka skal o niewspółmiernych częstotliwościach (bez powtarzalnego rytmu): duże polany i zaspy (~30 m), płaty
			   (~8 m), kępy (~2 m), drobne brzegi (~0,5 m – gasną z odległością) */
			vec2 sq = wP.xz;
			float snFine = 1.0 - smoothstep(0.02, 0.08, wpx);
			float sn = gPerlin(sq * 0.033 + 2.7) * 0.42
				+ gPerlin(mat2(0.8, -0.6, 0.6, 0.8) * sq * 0.127 + 4.1) * 0.27
				+ gPerlin(mat2(0.47, 0.88, -0.88, 0.47) * sq * 0.53 + 9.3) * 0.18
				+ mix(0.5, gPerlin(mat2(-0.29, 0.96, -0.96, -0.29) * sq * 2.11 + 1.9), snFine) * 0.13;
			sn = 0.5 + (sn - 0.5) * 1.8; // suma oktaw skupia się wokół 0,5 – rozciągnięcie, by pokrywa narastała stopniowo
			float th = 1.05 - uSnow * 1.15;
			// granica płatów śniegu miękka (szersze przejście – bez ostrych krawędzi)
			float snw = 0.13 + min(0.12, wpx * 1.5); // przejście szersze z odległością (bez ostrych schodków)
			float snowMask = smoothstep(0.3, 0.75, up) * smoothstep(th - snw, th + snw, sn) * min(1.0, uSnow * 3.0) * ${snowK.toFixed(2)};
			vec3 snowC = mix(vec3(0.74, 0.8, 0.9), vec3(0.97, 0.98, 1.0), 0.55 + 0.45 * gNoise(wP.xz * 3.0));
			// kryształki: pojedyncze jaśniejsze punkty z bliska
			snowC += vec3(0.25) * step(0.992, gHash(floor(wP.xz * 45.0))) * (1.0 - smoothstep(0.01, 0.025, wpx));
			snowC = mix(diffuseColor.rgb * 0.6 + vec3(0.3, 0.32, 0.36), snowC, smoothstep(0.0, 0.6, snowMask));
			diffuseColor.rgb = mix(diffuseColor.rgb, snowC, smoothstep(0.0, 0.45, snowMask));
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

	/* Podsypka: tłuczeń w dwóch skalach (ok. 5 i 9 cm) – kamienie różnej jasności, szczeliny między nimi
	   ciemniejsze, ale nie czarne (wcześniej jedna skala z czarnymi fugami wyglądała jak bruk); szary granit z ciepłymi
	   i chłodnymi kamieniami, rzadziej rdzawe; plamy rdzy z hamulców i wypłukanego pyłu. Mikrorzeźba w metrach
	   (kamienie wystają o kilka cm). Drobne wzory gasną, gdy są mniejsze od piksela. */
	const GRAVEL_GLSL = `
		vec2 wp = vWorldP.xz;
		float pxg = length(fwidth(wp));
		vec3 sa = gStones(wp * 11.0), sb = gStones(mat2(0.8, -0.6, 0.6, 0.8) * wp * 6.5 + 17.0);
		float fa = 1.0 - smoothstep(0.02, 0.07, pxg * 11.0 * 0.3), fb = 1.0 - smoothstep(0.02, 0.07, pxg * 6.5 * 0.3);
		float ea = smoothstep(0.0, 0.22, sa.y - sa.x), eb = smoothstep(0.0, 0.28, sb.y - sb.x);
		float stA = (0.8 + 0.38 * sa.z) * mix(0.62, 1.0, ea);
		float stB = (0.82 + 0.32 * sb.z) * mix(0.66, 1.0, eb);
		float stone = mix(1.0, stA, fa) * mix(1.0, mix(1.0, stB, 0.55), fb);
		vec3 tint = mix(vec3(0.93, 0.94, 0.97), vec3(1.06, 1.0, 0.92), sb.z);
		tint = mix(tint, vec3(0.98, 0.84, 0.72), step(0.9, sa.z) * 0.55 * fa);
		// w oddali (kamienie mniejsze od piksela): plamista szarość zamiast gładkiej
		float farT = gNoise(wp * 2.3) * 0.6 + gNoise(wp * 0.55) * 0.4;
		vec3 farC = vec3(0.86 + 0.24 * farT);
		diffuseColor.rgb *= mix(farC, tint * stone, max(fa, 0.35));
		float m1 = gFbm(wp * 0.3);
		diffuseColor.rgb *= 0.88 + 0.22 * m1;
		// plamy rdzy (pył z hamulców, przy szynach i na łukach) i jaśniejszego, wypłukanego pyłu
		diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.66, 0.54), smoothstep(0.58, 0.82, gFbm(wp * 0.16 + 3.0)) * 0.5);
		diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.56), smoothstep(0.65, 0.85, gNoise(wp * 0.45 + 9.0)) * 0.18);
		gH = ((1.0 - sa.x) * ea * fa * 0.5 + (1.0 - sb.x) * eb * fb * 0.8) * 0.035;
		gRough = 0.03 * (sa.z - 0.5);`;

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
		/* koleiny i brud przy krawędziach (drogi z mapy – vLat: odsunięcie od osi jezdni, połowa szerokości, liczba
		   pasów): ślady kół w każdym pasie ciemniejsze i wygładzone, przy krawężnikach osad; w deszczu woda w koleinach */
		float rut = 0.0, edgeD = 0.0;
		if (vLat.z > 0.5) {
			float lw = 2.0 * vLat.y / vLat.z, pos = vLat.x + vLat.y;
			float lc = pos - (floor(pos / lw) + 0.5) * lw;
			rut = (1.0 - smoothstep(0.06, 0.3, abs(abs(lc) - min(0.85, lw * 0.27)))) * (0.65 + 0.35 * gNoise(wp * 0.35 + 4.0));
			edgeD = (1.0 - smoothstep(0.0, 0.6, vLat.y - abs(vLat.x))) * (0.6 + 0.4 * m1);
		}
		asC *= 1.0 - 0.28 * rut - 0.22 * edgeD;
		asC = mix(asC, asC * vec3(1.02, 0.97, 0.9), edgeD * 0.5);
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
		puddle = max(puddle, (rut * 0.75 + edgeD * 0.6) * smoothstep(0.35, 0.8, uWet) * asph * fl * (0.5 + 0.5 * gNoise(wp * 0.6)));
		gRough = -0.08 * mark + 0.05 * (m2 - 0.5) - 0.12 * rut * asph;`;

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

	/* Nawierzchnia peronu (wg zdjęć peronów PKP PLK po modernizacji) – wzór wzdłuż toru: atrybut aPl = (kilometraż,
	   odsunięcie od osi toru; z przesunięciem o wielokrotność 100 m – wzór ciągły między kawałkami). Wierzch: szare płyty
	   chodnikowe 0,5 × 0,5 m w rzędach przesuniętych o pół płyty, każda w trochę innym odcieniu, ciemniejsze fugi;
	   PL_EDGE – krawężnik peronowy (jasne płyty 1 m wzdłuż krawędzi); PL_TACT – pas ostrzegawczy z płyt 0,4 m
	   z kopułkami co 6 cm. Ściany (nie poziome) – zwykły beton. */
	const PLATFORM_GLSL = `${SURF_HEAD}
		float m1 = gFbm(sp2 * 0.12), m2 = gNoise(sp2 * 1.1);
		float grain = mix(0.5, gNoise(sp2 * 30.0), AAK(30.0));
		float stain = smoothstep(0.55, 0.85, gFbm(sp2 * 0.35 + 4.0));
		vec3 base = c0 * (0.88 + 0.2 * m1 + 0.05 * m2) * (0.94 + 0.12 * grain) * (1.0 - 0.15 * stain);
		float jH = 0.0, bump = 0.0;
		if (fl > 0.5) {
			#if defined(PL_TACT)
			vec2 sz = vec2(0.4);
			vec2 qs = vPl / sz;
			vec2 fd = fract(vPl / 0.06) - 0.5;
			bump = (1.0 - smoothstep(0.17, 0.3, length(fd))) * AAK(17.0);
			base *= 1.0 + 0.1 * bump - 0.05 * AAK(17.0);
			#elif defined(PL_EDGE)
			vec2 sz = vec2(1.0, 1000.0);
			vec2 qs = vec2(vPl.x, 0.5);
			#else
			vec2 sz = vec2(0.5);
			vec2 qs = vPl / sz;
			qs.x += step(1.0, mod(floor(qs.y), 2.0)) * 0.5;
			#endif
			vec2 jf = fract(qs), jid = floor(qs);
			float jd = min(min(jf.x, 1.0 - jf.x) * sz.x, min(jf.y, 1.0 - jf.y) * sz.y);
			float joint = (1.0 - smoothstep(0.004, 0.004 + 1.2 * px, jd)) * AAK(1.5);
			base *= (0.95 + 0.1 * gHash(jid + 3.0)) * (1.0 - 0.28 * joint);
			jH = -joint * 0.004;
		}
		diffuseColor.rgb = base;
		gH = grain * 0.002 + jH + bump * 0.004;
		gRough = 0.06 * (m2 - 0.5) - 0.1 * stain * uWet;`;

	/* Zabrudzenia obiektów nieruchomych (elewacje, dachy, fundamenty, podkłady): plamy, zacieki pionowe
	   na ścianach, ziarno tynku – w przestrzeni świata, więc tylko dla obiektów, które się nie ruszają. */
	const DIRT_GLSL = `${SURF_HEAD}
		float m1 = gFbm(vec2(wp.x + wp.y, vWorldP.y) * 0.18 + wp * 0.05);
		float streak = gNoise(vec2((wp.x - wp.y) * 2.2 + gN.x * 3.0, vWorldP.y * 0.12)) * (1.0 - fl);
		float grain = mix(0.5, gNoise(vWorldP.xy * 20.0 + vWorldP.zy * 20.0), AAK(30.0));
		diffuseColor.rgb = c0 * (0.88 + 0.2 * m1) * (1.0 - 0.14 * smoothstep(0.5, 0.9, streak)) * (0.95 + 0.1 * grain);
		gH = grain * 0.002;`;

	/* Dachy budynków (G5, wg zdjęć dachów w Polsce): spadziste – rzędy dachówek (co 0,2 m wysokości) z cieniem pod
	   zakładką, fala dachówki w poprzek spadku, odcień każdej dachówki, plamy mchu i zabrudzeń; płaskie – papa w pasach
	   co 1 m z zakładami, ziarno posypki, łaty; ściany szczytowe – tynk. */
	const ROOF_GLSL = `${SURF_HEAD}
		float m1 = gFbm(wp * 0.15 + 3.0);
		float ny = abs(gN.y);
		vec3 base = c0;
		float hgt = 0.0;
		if (ny > 0.985) {
			float sx = fract(wp.x), seam = 1.0 - smoothstep(0.0, 0.03 + 1.5 * px, min(sx, 1.0 - sx));
			float grain = mix(0.5, gNoise(wp * 25.0), AAK(25.0));
			float patchA = smoothstep(0.55, 0.75, gFbm(wp * 0.08 + 7.0));
			base = c0 * (0.85 + 0.25 * m1) * (0.92 + 0.16 * grain) * (1.0 - 0.18 * seam * AAK(1.0)) * (1.0 - 0.15 * patchA);
			hgt = grain * 0.002 + seam * 0.004;
		} else if (ny > 0.12) {
			vec2 tg = normalize(vec2(-gN.z, gN.x) + 1e-5);
			float hc = dot(wp, tg);
			float ry = vWorldP.y / 0.2, rI = floor(ry), rF = fract(ry);
			float tc = hc / 0.3 + rI * 0.5, tI = floor(tc);
			float wave = 0.5 + 0.5 * sin(tc * 6.2832);
			float lip = smoothstep(0.0, 0.3, rF);
			// wygładzanie wg gęstości rzędów na ekranie (z ukosa piksel w świecie jest długi, ale rzędy wciąż widać)
			float aa = 1.0 - smoothstep(0.18, 0.5, max(fwidth(ry), fwidth(tc) * 0.6));
			float tone = 0.92 + 0.16 * gHash(vec2(tI, rI));
			float moss = smoothstep(0.6, 0.85, gFbm(wp * 0.25 + 1.7)) * 0.5;
			base = c0 * mix(1.0, tone * (0.55 + 0.45 * lip) * (0.9 + 0.14 * wave), aa) * (0.88 + 0.22 * m1);
			base = mix(base, base * vec3(0.75, 0.85, 0.6), moss);
			hgt = (lip * 0.003 + wave * 0.002) * aa;
		} else {
			float grain = mix(0.5, gNoise(vWorldP.xy * 20.0 + vWorldP.zy * 20.0), AAK(30.0));
			base = c0 * (0.9 + 0.15 * m1) * (0.95 + 0.1 * grain);
		}
		diffuseColor.rgb = base;
		gH = hgt;`;

	/* Korony drzew i krzewy: kępki liści (szum 3D w przestrzeni świata – każde drzewo inne), prześwity
	   ciemniejsze, nasłonecznione końce jaśniejsze i cieplejsze; drobny wzór gaśnie w oddali. */
	const LEAF_GLSL = `
		vec3 lp = vWorldP * 4.2;
		float lpx = length(fwidth(vWorldP)) * 4.2;
		float laa = 1.0 - smoothstep(0.15, 0.45, lpx);
		float leafN = gNoise(lp.xz + lp.y * 0.71) * 0.55 + gNoise(lp.zy * 1.93 + lp.x * 0.47 + 3.0) * 0.45;
		float leafM = gNoise(vWorldP.xz * 0.9 + vWorldP.y * 0.6);
		#ifdef USE_MAP
		// korony z faktury kępek liści: tylko duże plamy (odcień kęp) – liście są w fakturze
		diffuseColor.rgb *= 0.9 + 0.2 * leafM;
		diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.06, 0.82), smoothstep(0.62, 0.86, leafN) * 0.25);
		#else
		diffuseColor.rgb *= mix(0.92 + 0.16 * leafM, (0.66 + 0.6 * leafN) * (0.9 + 0.2 * leafM), laa);
		diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 0.78), smoothstep(0.62, 0.86, leafN) * 0.45 * laa);
		#endif
		gH = leafN * 0.05 * laa;`;

	/* Tabor (wariant 'train'): patyna eksploatacyjna, spoiny i falowanie blach, nity, okluzja z wierzchołków.
	   Atrybut aWear (wypiekany przy budowie modelu, train.js bakeWear): x – zasłonięcie otoczenia (0…1), y – 1, gdy
	   position to współrzędne wagonu (y – wysokość nad główką szyny, z – wzdłuż wagonu); bez atrybutu (0, 0) – część
	   ruchoma (koła, drzwi, pantograf): tylko zabrudzenie bazowe materiału. Wszystko w układzie wagonu – wzór jedzie
	   z pociągiem. */
	const TRAIN_GLSL = (grime, panels) => `
		float wearG = 0.0, wearAO = 1.0 - clamp(vWear.x, 0.0, 1.0);
		{
			vec3 lp = vLocP, ln = normalize(vLocN);
			float pxw = length(fwidth(lp));
			float n1 = gFbm(vec2(lp.z * 0.7 + lp.x * 0.45, lp.y * 1.1) + 3.0);
			float g = ${grime.toFixed(3)} * (0.55 + 0.9 * n1);
			if (vWear.y > 0.5) {
				// kurz i smar od wózków (wyżej rzadziej, nierówna granica), zacieki spod okien i z dachu, sadza na dachu
				float low = 1.0 - smoothstep(0.7, 1.9 + 0.5 * n1, lp.y);
				float n2 = gNoise(vec2((lp.z + lp.x * 0.7) * 4.5, lp.y * 0.3));
				float streak = smoothstep(0.5, 0.9, n2) * smoothstep(1.3, 3.3, lp.y) * (1.0 - abs(ln.y));
				float roof = smoothstep(3.4, 3.85, lp.y) * smoothstep(0.15, 0.7, ln.y);
				g = max(g, low * (0.45 + 0.55 * n1) + streak * 0.2 + roof * (0.25 + 0.5 * n1));
			}
			wearG = clamp(g * uWear, 0.0, 1.0);
			vec3 dirtC = vec3(0.2, 0.17, 0.135) * (0.7 + 0.6 * n1);
			diffuseColor.rgb = mix(diffuseColor.rgb, dirtC, wearG * 0.6);
			${panels ? `
			// burty: falowanie blach między wręgami (co 0,9 m – odbicia nieba lekko falują), pionowe spoiny co 2,7 m,
			// rząd nitów nad ostojnicą; drobne wzory gasną, gdy są mniejsze od piksela
			if (vWear.y > 0.5 && abs(ln.x) > 0.75 && lp.y > 1.1 && lp.y < 3.5) {
				float fine = 1.0 - smoothstep(0.012, 0.04, pxw);
				float wy = smoothstep(1.15, 1.4, lp.y) * (1.0 - smoothstep(3.2, 3.45, lp.y));
				float wav = sin(fract(lp.z / 0.9) * 3.14159) * (0.5 + 0.5 * gNoise(vec2(lp.z * 0.8, lp.y * 1.6)));
				float sd = abs(fract(lp.z / 2.7 + 0.5) - 0.5) * 2.7;
				float seam = (1.0 - smoothstep(0.003, 0.003 + 1.2 * pxw, sd)) * fine * wy;
				float rv = 1.0 - smoothstep(0.009, 0.016, length(vec2((fract(lp.z / 0.16) - 0.5) * 0.16, lp.y - 1.2)));
				gH += wav * 0.004 * wy - seam * 0.002 + rv * fine * 0.003;
				diffuseColor.rgb *= 1.0 - 0.3 * seam;
			}
			// dach: poprzeczne żebra łączące arkusze blachy co 1,2 m (z góry – z kamery za pociągiem – najlepiej
			// widoczne), przy żebrach więcej osadu
			if (vWear.y > 0.5 && ln.y > 0.3 && lp.y > 3.3) {
				float fine = 1.0 - smoothstep(0.015, 0.05, pxw);
				float sd = abs(fract(lp.z / 1.2 + 0.5) - 0.5) * 1.2;
				float rib = 1.0 - smoothstep(0.012, 0.012 + 1.5 * pxw, sd);
				gH += rib * 0.005 * fine;
				diffuseColor.rgb *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.12, sd)) * (0.4 + 0.6 * n1);
			}` : ''}
		}`;
	const TRAIN_LIGHT_GLSL = `
		{
			// okluzja: światło otoczenia i odbicia w zagłębieniach, trochę także bezpośrednie (kontakt części)
			reflectedLight.indirectDiffuse *= wearAO;
			reflectedLight.indirectSpecular *= wearAO * wearAO;
			reflectedLight.directDiffuse *= mix(1.0, wearAO, 0.35);
			reflectedLight.directSpecular *= mix(1.0, wearAO, 0.5);
		}`;

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
	   - 'train'  : jak 'lit' + patyna, spoiny, nity i okluzja taboru (TRAIN_GLSL; opt.grime – zabrudzenie bazowe,
	                opt.panels – spoiny i falowanie blach burt),
	   - 'clean'  : cienie chmur, bez pogody (woda, szyby),
	   - 'indoor' : bez chmur i pogody (wnętrza). */
	const allMaterials = [];
	function patch(material, variant, opt = {}) {
		allMaterials.push(material);
		const train = variant === 'train', grime = opt.grime ?? 0.12, panels = !!opt.panels;
		const snowK = opt.noSnow ? 0.0 : variant === 'grass' ? 0.0 : variant === 'wind' ? 0.75 : 1.0; // noSnow – np. ludzie (śnieg na nich nie osiada)
		material.customProgramCacheKey = () => 'train2-' + variant + (train ? `-${grime}-${panels ? 1 : 0}` : '') + (opt.noSnow ? '-ns' : '');
		material.onBeforeCompile = (shader) => {
			if (variant !== 'indoor' && NS.cloudShade) NS.cloudShade(T, shader);
			Object.assign(shader.uniforms, U);
			if (variant === 'indoor' || variant === 'clean') return;
			const ground = variant === 'ground', gravel = variant === 'gravel';
			if (train) {
				shader.vertexShader = shader.vertexShader
					.replace('#include <common>', `#include <common>
					attribute vec2 aWear; varying vec2 vWear; varying vec3 vLocP; varying vec3 vLocN;`)
					.replace('#include <begin_vertex>', `#include <begin_vertex>
					vLocP = transformed; vLocN = objectNormal; vWear = aWear;`);
				shader.fragmentShader = shader.fragmentShader
					.replace('#include <common>', `#include <common>
					uniform float uWear; varying vec2 vWear; varying vec3 vLocP; varying vec3 vLocN;`)
					.replace('#include <aomap_fragment>', `#include <aomap_fragment>
					${TRAIN_LIGHT_GLSL}`)
					.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
					#ifdef USE_CLEARCOAT
					material.clearcoat *= 1.0 - 0.85 * wearG;
					#endif`)
					// lakier: bezbarwna powłoka też faluje na blachach
					.replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
					#ifdef USE_CLEARCOAT
					clearcoatNormal = normal;
					#endif`);
			}
			const surf = variant === 'road' ? ROAD_GLSL : variant === 'concrete' ? CONCRETE_GLSL : variant === 'platform' ? PLATFORM_GLSL : variant === 'roof' ? ROOF_GLSL : variant === 'dirt' ? DIRT_GLSL : '';
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
				${ground ? 'attribute vec2 aRow; varying vec2 vRow; attribute vec3 aMat; varying vec3 vMat;' : ''}
				${variant === 'road' ? 'attribute vec3 aLat; varying vec3 vLat;' : ''}
				${variant === 'platform' ? 'attribute vec2 aPl; varying vec2 vPl;' : ''}`)
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
				${ground ? 'vRow = aRow; vMat = aMat;' : ''}
				${variant === 'road' ? 'vLat = aLat;' : ''}
				${variant === 'platform' ? 'vPl = aPl;' : ''}`);
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', `#include <common>
				uniform float uWet; uniform float uSnow; uniform float uRain; uniform float uTime;
				uniform sampler2D uNightTex; uniform vec3 uNightBox; uniform float uNightK;
				varying vec3 vWorldP;
				${ground ? 'varying vec2 vRow; varying vec3 vMat; uniform vec4 uPortalA[8]; uniform vec4 uPortalB[8];' : ''}
				${variant === 'road' ? 'varying vec3 vLat;' : ''}
				${variant === 'platform' ? 'varying vec2 vPl;' : ''}
				${NOISE_GLSL}`)
				.replace('#include <color_fragment>', `#include <color_fragment>
				${ground ? `
				for (int i = 0; i < 8; i++) {
					vec4 pa = uPortalA[i], pb = uPortalB[i];
					if (pb.w < 0.5) continue;
					vec2 rel = vWorldP.xz - pa.xz;
					float along = dot(rel, pb.xy), across = abs(rel.x * pb.y - rel.y * pb.x);
					if (across < pb.z && along > -0.6 && along < 0.6 && vWorldP.y > pa.y && vWorldP.y < pa.y + pa.w) discard;
				}` : ''}
				float gH = 0.0, puddle = 0.0, gSand = 0.0, gRough = 0.0; // gRough – zmiana chropowatości (stosowana niżej)
				${ground ? GROUND_GLSL : gravel ? GRAVEL_GLSL : variant === 'wind' ? LEAF_GLSL : train ? TRAIN_GLSL(grime, panels) : surf}`)
				.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
				${ground ? BUMP_GLSL(1.4) : gravel ? BUMP_GLSL(1.6) : surf ? BUMP_GLSL(variant === 'road' ? 1.2 : 0.9) : variant === 'wind' ? BUMP_GLSL(1.0) : train && panels ? BUMP_GLSL(1.0) : ''}
				vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
				${variant === 'wind' ? `
				// korony: brzegi bryły (patrząc stycznie) jaśniejsze i żółtozielone – prześwitujące liście, miękka sylwetka
				{
					float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
					diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.3, 1.32, 0.9) + vec3(0.015, 0.025, 0.0), rim * 0.6);
				}` : ''}
				#ifdef STANDARD
				${train ? `
				// tabor: brud matowy (bez dolnej granicy 0,3 – chrom i lakier zostają błyszczące)
				roughnessFactor = clamp(mix(roughnessFactor, 0.88, wearG), 0.04, 1.0);
				metalnessFactor = mix(metalnessFactor, metalnessFactor * 0.35, wearG);` : `
				roughnessFactor = mix(clamp(roughnessFactor + gRough, 0.3, 1.0), 0.97, gSand);`}
				#endif
				${WEATHER_GLSL(ground || gravel || variant === 'road' || variant === 'concrete' || variant === 'platform' || variant === 'roof' ? 1.0 : veg ? 0.6 : 0.75, snowK, train ? 'vLocP' : 'vWorldP')}
				${ground || variant === 'road' ? `
				// kałuże: ciemne, gładkie jak lustro, z kręgami od kropli (niżej – też światło latarni z mapy nocnej)
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
				}` : ''}`)
				.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
				${NIGHT_GLSL}`);
		};
		material.userData.shared = true;
		return material;
	}

	// ---- współdzielone materiały i bryły ----
	// mat() – matowe powierzchnie (PBR, żeby mokre błyszczały); { indoor: true } – wnętrza bez pogody
	const mats = new Map();
	// { train: g } – materiał taboru (wariant 'train', g – zabrudzenie bazowe; panels – spoiny, nity, żebra dachu)
	function mat(color, extra) {
		const key = 'M' + color + JSON.stringify(extra || {});
		if (!mats.has(key)) {
			const ex = Object.assign({}, extra || {});
			const indoor = ex.indoor, surf = ex.surf, train = ex.train, panels = ex.panels;
			delete ex.indoor;
			delete ex.surf;
			delete ex.train;
			delete ex.panels;
			const variant = indoor ? 'indoor' : surf || (train !== undefined ? 'train' : 'lit');
			const m = patch(new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.86, metalness: 0, envMapIntensity: 0.35 }, ex)), variant, { grime: train, panels });
			// plain – stały kolor, bez zmian w czasie gry: World.mergeStatic może go zastąpić wspólnym materiałem z kolorem
			// w wierzchołkach (variant – wariant łatki shadera)
			m.userData.plain = train === undefined;
			m.userData.variant = variant;
			mats.set(key, m);
		}
		return mats.get(key);
	}
	// materiał PBR (połysk, odbicia nieba)
	function matS(color, extra) {
		const key = 'S' + color + JSON.stringify(extra || {});
		if (!mats.has(key)) {
			const ex = Object.assign({}, extra || {});
			// surf: 'road' | 'concrete' | 'dirt' – proceduralna nawierzchnia (tylko obiekty nieruchome)
			const variant = ex.indoor ? 'indoor' : ex.clean ? 'clean' : ex.surf || (ex.train !== undefined ? 'train' : 'lit');
			const train = ex.train, panels = ex.panels;
			delete ex.indoor;
			delete ex.clean;
			delete ex.surf;
			delete ex.train;
			delete ex.panels;
			const m = patch(new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, ex)), variant, { grime: train, panels });
			m.userData.plain = train === undefined;
			m.userData.variant = variant;
			mats.set(key, m);
		}
		return mats.get(key);
	}
	/* Wspólny materiał z kolorem w wierzchołkach zamiast wielu różniących się tylko kolorem (scalanie świata): te same
	   parametry powierzchni i wariant łatki; kolor – atrybut color bryły */
	const vcMats = new Map();
	function vcMat(m) {
		const key = [m.userData.variant, m.roughness, m.metalness, m.flatShading ? 1 : 0, m.side, m.envMapIntensity].join('|');
		if (!vcMats.has(key)) {
			const v = patch(new T.MeshStandardMaterial({ color: '#ffffff', roughness: m.roughness, metalness: m.metalness, flatShading: m.flatShading, side: m.side, envMapIntensity: m.envMapIntensity, vertexColors: true }), m.userData.variant);
			v.userData.vc = true;
			vcMats.set(key, v);
		}
		return vcMats.get(key);
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
		// gładsze (zbiorniki cystern – duże, widoczne z bliska)
		cylHi: shared(new T.CylinderGeometry(0.5, 0.5, 1, 28)),
		sphereHi: shared(new T.SphereGeometry(0.5, 28, 14)),
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

	/* Przytwierdzenie szyny (jak SB / Vossloh, wymiary w m, x – w poprzek toru, środek przy stopce szyny): płyta
	   żebrowa, łapka sprężysta w kształcie „ω” (dwa ramiona i grzbiet) i śruba; bryły złączone, ok. 70 trójkątów. */
	GEO.railClip = shared((() => {
		const parts = [[0.1, 0.022, 0.18, 0, -0.024, 0], [0.03, 0.03, 0.15, -0.03, -0.004, 0], [0.075, 0.018, 0.02, 0.005, 0.006, -0.045], [0.075, 0.018, 0.02, 0.005, 0.006, 0.045], [0.02, 0.022, 0.11, 0.035, 0.012, 0], [0.026, 0.04, 0.026, -0.005, 0.02, 0]];
		const pos = [], nor = [];
		for (const [w, h, d, x, y, z] of parts) {
			const g = new T.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
			pos.push(...g.attributes.position.array);
			nor.push(...g.attributes.normal.array);
			g.dispose();
		}
		const g = new T.BufferGeometry();
		g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
		g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
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

	/* Scalanie siatek grupy (root) wg materiału, cieni i zestawu atrybutów – w układzie root; keep(o) – obiekt (z potomkami)
	   zostaje osobno (ruchome części). Pomijane: instancje, sprite'y, materiały przezroczyste i tablice materiałów,
	   ukryte, renderOrder. Oryginały usuwane (własne bryły zwalniane). Zwraca liczbę usuniętych siatek. */
	function mergeMeshes(root, keep) {
		root.updateMatrixWorld(true);
		const inv = new T.Matrix4().copy(root.matrixWorld).invert();
		const groups = new Map(), skip = new Set();
		root.traverse((o) => { if (o !== root && keep && keep(o)) o.traverse((x) => skip.add(x)); });
		root.traverse((o) => {
			if (o === root || !o.isMesh || o.isInstancedMesh || skip.has(o) || !o.visible || o.renderOrder) return;
			for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible || p.isLOD) return;
			const m = o.material, g = o.geometry;
			if (Array.isArray(m) || m.transparent || !g.attributes.position || !g.attributes.normal || g.morphAttributes.position) return;
			const attrs = Object.keys(g.attributes).sort();
			if (attrs.some((k) => g.attributes[k].isInterleavedBufferAttribute)) return;
			const sig = attrs.map((k) => `${k}${g.attributes[k].itemSize}${g.attributes[k].array.constructor.name}`).join(',');
			const key = `${m.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${sig}`;
			if (!groups.has(key)) groups.set(key, { m, attrs, list: [], cast: o.castShadow, recv: o.receiveShadow });
			groups.get(key).list.push(o);
		});
		const M4 = new T.Matrix4(), N3 = new T.Matrix3(), v = new T.Vector3();
		let removed = 0;
		for (const b of groups.values()) {
			if (b.list.length < 2) continue;
			let nv = 0, ni = 0;
			for (const o of b.list) { nv += o.geometry.attributes.position.count; ni += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; }
			const out = {};
			for (const k of b.attrs) { const a = b.list[0].geometry.attributes[k]; out[k] = new a.array.constructor(nv * a.itemSize); }
			const index = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
			let vo = 0, io = 0;
			for (const o of b.list) {
				const g = o.geometry, cnt = g.attributes.position.count;
				M4.multiplyMatrices(inv, o.matrixWorld);
				N3.getNormalMatrix(M4);
				const flip = M4.determinant() < 0;
				for (const k of b.attrs) {
					const a = g.attributes[k], dst = out[k], sz = a.itemSize;
					if (k === 'position' || k === 'normal') {
						for (let i = 0; i < cnt; i++) {
							v.set(a.getX(i), a.getY(i), a.getZ(i));
							if (k === 'position') v.applyMatrix4(M4); else v.applyMatrix3(N3).normalize();
							dst[(vo + i) * 3] = v.x; dst[(vo + i) * 3 + 1] = v.y; dst[(vo + i) * 3 + 2] = v.z;
						}
					} else dst.set(a.array.subarray(0, cnt * sz), vo * sz);
				}
				const src = g.index ? g.index.array : null, n = src ? g.index.count : cnt;
				for (let i = 0; i < n; i += 3) {
					const a0 = src ? src[i] : i, a1 = src ? src[i + 1] : i + 1, a2 = src ? src[i + 2] : i + 2;
					index[io++] = vo + a0; index[io++] = vo + (flip ? a2 : a1); index[io++] = vo + (flip ? a1 : a2);
				}
				vo += cnt;
				o.parent.remove(o);
				if (!g.userData.shared && o.userData.ownGeometry !== false) g.dispose();
				removed++;
			}
			const geo = new T.BufferGeometry();
			for (const k of b.attrs) { const a = b.list[0].geometry.attributes[k]; geo.setAttribute(k, new T.BufferAttribute(out[k], a.itemSize, a.normalized)); }
			geo.setIndex(new T.BufferAttribute(index, 1));
			geo.computeBoundingSphere();
			const mesh = new T.Mesh(geo, b.m);
			mesh.castShadow = b.cast;
			mesh.receiveShadow = b.recv;
			mesh.userData.ownGeometry = true;
			root.add(mesh);
			removed--;
		}
		return removed;
	}

	function disposeTree(obj) {
		obj.traverse((o) => {
			if (o.geometry && !o.isSprite && !o.geometry.userData.shared) o.geometry.dispose();
			if (o.material && !Array.isArray(o.material) && !o.material.userData.shared && (o.userData.ownMaterial || o.isSprite)) o.material.dispose();
		});
	}

	NS.util = { hash, hash2, smoothstep, vnoise, glowTexture, labelTexture, boardTexture, sprite, mat, matS, vcMat, mergeMeshes, patch, U, GEO, box, roof, disposeTree, canvasTexture, allMaterials };
})();
