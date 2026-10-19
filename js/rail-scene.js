/* Tło ekranu startowego i ekranu wczytywania (js/screens.js): jazda po torze w perspektywie, rysunek 2D.
   Ten sam plik: na stronie – TrainRailScene (rysowanie w wątku głównym, gdy brak OffscreenCanvas), w Web Workerze –
   własna pętla klatek na przekazanym canvasie (OffscreenCanvas): tło animuje się płynnie, także gdy wątek główny
   buduje świat i shadery (wcześniej klatki stały po kilka sekund).
   Komunikaty do workera: { type: 'init', canvas, w, h, night, s, speed } – start; { type: 'set', speed, night } –
   prędkość jazdy (m/s) i pora; { type: 'size', w, h } – rozmiar; { type: 'stop' }; { type: 'stats' } – odpowiedź
   z liczbą klatek, klatkami ponad 50 ms i najdłuższą (pomiar płynności). */
(function (root) {
	'use strict';
	const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
	const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
	const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

	/* Tło: s – przebyta droga (m), night – 0 dzień … 1 noc. Kamera 3,2 m nad główką szyny, oś toru pośrodku. */
	function railScene(c, W, H, s, night) {
		const hz = H * 0.5, f = H * 0.95, camH = 3.2;
		const sky0 = mix([92, 146, 205], [6, 10, 24], night), sky1 = mix([226, 214, 190], [40, 32, 58], night);
		const g = c.createLinearGradient(0, 0, 0, hz);
		g.addColorStop(0, rgb(sky0));
		g.addColorStop(1, rgb(sky1));
		c.fillStyle = g;
		c.fillRect(0, 0, W, hz + 1);
		// gwiazdy nocą
		if (night > 0.3) for (let i = 0; i < 140; i++) {
			const a = (0.25 + 0.75 * hash(i * 3.1)) * (night - 0.3) / 0.7 * (0.75 + 0.25 * Math.sin(s * 0.05 + i));
			c.fillStyle = `rgba(230,236,255,${a.toFixed(3)})`;
			c.fillRect(hash(i) * W, hash(i * 7.7) * hz * 0.85, 1.4, 1.4);
		}
		// wzgórza: dwie warstwy, przesuwają się powoli (paralaksa)
		for (const [k, col, amp, shift] of [[0, mix([118, 132, 150], [22, 26, 40], night), 0.12, 0.002], [1, mix([84, 104, 92], [14, 18, 24], night), 0.07, 0.006]]) {
			c.fillStyle = rgb(col);
			c.beginPath();
			c.moveTo(0, hz + 1);
			for (let x = 0; x <= W; x += 8) {
				const u = x / W * 6 + s * shift + k * 9;
				const y = hz - H * amp * (0.35 + 0.35 * Math.sin(u * 1.3) * Math.sin(u * 0.47 + 1) + 0.3 * hash(Math.floor(u * 3)) * 0.3);
				c.lineTo(x, y);
			}
			c.lineTo(W, hz + 1);
			c.fill();
		}
		// grunt
		const gg = c.createLinearGradient(0, hz, 0, H);
		gg.addColorStop(0, rgb(mix([96, 110, 80], [16, 20, 18], night)));
		gg.addColorStop(1, rgb(mix([58, 70, 46], [8, 10, 10], night)));
		c.fillStyle = gg;
		c.fillRect(0, hz, W, H - hz);
		const P = (x, z) => [W / 2 + (f * x) / z, hz + (f * camH) / z];
		// podsypka obu torów (tor gracza i drugi po lewej, rozstaw 4,5 m)
		for (const ox of [0, -4.5]) {
			c.fillStyle = rgb(mix([128, 120, 108], [34, 32, 32], night));
			const a = P(ox - 2.4, 2), b = P(ox + 2.4, 2), d = P(ox + 2.4, 900), e = P(ox - 2.4, 900);
			c.beginPath();
			c.moveTo(a[0], H + 40); c.lineTo(b[0], H + 40); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]);
			c.fill();
			// podkłady co 0,6 m, przesuwają się z jazdą
			c.fillStyle = rgb(mix([88, 76, 64], [26, 22, 20], night));
			const off = s % 0.6;
			for (let z = 1.2 - off; z < 160; z += 0.6) {
				if (z < 1.2) continue;
				const l = P(ox - 1.3, z), r = P(ox + 1.3, z), h = Math.max(1, (f * 0.12) / z);
				c.fillRect(l[0], l[1] - h / 2, r[0] - l[0], h);
			}
			// szyny: główka 7 cm – trapez zwężający się w perspektywie
			c.fillStyle = rgb(mix([196, 200, 206], [96, 104, 120], night));
			for (const rx of [-0.75, 0.75]) {
				const a1 = P(ox + rx - 0.035, 1.2), a2 = P(ox + rx + 0.035, 1.2), b1 = P(ox + rx + 0.035, 900), b2 = P(ox + rx - 0.035, 900);
				c.beginPath();
				c.moveTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]); c.lineTo(b1[0], b1[1]); c.lineTo(b2[0], b2[1]);
				c.fill();
			}
		}
		// słupy sieci trakcyjnej co 60 m po prawej, przewód jezdny i lina nośna nad osią toru
		const pole = rgb(mix([64, 70, 78], [10, 12, 16], night));
		const poff = s % 60;
		for (let z = 60 - poff; z < 900; z += 60) {
			if (z < 2) continue;
			const b0 = P(3.6, z), t0 = P(3.6, z), w = Math.max(1, (f * 0.28) / z);
			t0[1] = hz + (f * (camH - 8.2)) / z;
			c.fillStyle = pole;
			c.fillRect(b0[0] - w / 2, t0[1], w, b0[1] - t0[1]);
			const arm = P(-0.2, z);
			c.fillRect(arm[0], t0[1] + (f * 1.0) / z, b0[0] - arm[0], Math.max(1, w * 0.45));
		}
		c.strokeStyle = rgb(mix([40, 44, 50], [120, 130, 150], night), 0.85);
		c.lineWidth = 1.2;
		for (const [y, x] of [[5.6, 0], [7.0, 0], [5.6, -4.5], [7.0, -4.5]]) {
			const a = P(x, 9), b = P(x, 900);
			c.beginPath();
			c.moveTo(a[0], hz + (f * (camH - y)) / 9);
			c.lineTo(b[0], hz + (f * (camH - y)) / 900);
			c.stroke();
		}
		// światła stacji w oddali (i reflektor przy horyzoncie nocą)
		for (let i = 0; i < 7; i++) {
			const p = P(-6 + i * 2.4, 520 + hash(i) * 60), r = 2 + night * 5;
			const gl = c.createRadialGradient(p[0], p[1] - 4, 0, p[0], p[1] - 4, r * 4);
			gl.addColorStop(0, `rgba(255,214,140,${0.35 + night * 0.5})`);
			gl.addColorStop(1, 'rgba(255,214,140,0)');
			c.fillStyle = gl;
			c.fillRect(p[0] - r * 4, p[1] - 4 - r * 4, r * 8, r * 8);
		}
		// winieta
		const v = c.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, W * 0.75);
		v.addColorStop(0, 'rgba(0,0,0,0)');
		v.addColorStop(1, 'rgba(0,0,0,0.6)');
		c.fillStyle = v;
		c.fillRect(0, 0, W, H);
	}


	root.TrainRailScene = railScene;

	// Web Worker: własna pętla klatek (requestAnimationFrame workera – niezależna od wątku głównego)
	if (typeof window === 'undefined' && typeof importScripts === 'function') {
		let c = null, canvas = null, s = 0, speed = 0, night = 0.5, last = 0, run = false;
		const stats = { frames: 0, over50: 0, max: 0 }; // (płynność tła – { type: 'stats' }, tools/render-check/bootframes.js)
		const raf = root.requestAnimationFrame ? (f) => root.requestAnimationFrame(f) : (f) => setTimeout(() => f(performance.now()), 16);
		const frame = (now) => {
			if (!run) return;
			const dt = now - last;
			s += speed * Math.max(0, Math.min(0.1, dt / 1000));
			last = now;
			stats.frames++;
			if (dt > 50) stats.over50++;
			stats.max = Math.max(stats.max, dt);
			railScene(c, canvas.width, canvas.height, s, night);
			raf(frame);
		};
		root.onmessage = (e) => {
			const m = e.data;
			if (m.type === 'init') {
				canvas = m.canvas;
				canvas.width = m.w;
				canvas.height = m.h;
				c = canvas.getContext('2d');
				s = m.s || 0;
				speed = m.speed || 0;
				night = m.night;
				last = performance.now();
				run = true;
				raf(frame);
			} else if (m.type === 'set') {
				if (m.speed !== undefined) speed = m.speed;
				if (m.night !== undefined) night = m.night;
			} else if (m.type === 'size' && canvas) {
				canvas.width = m.w;
				canvas.height = m.h;
			} else if (m.type === 'stop') run = false;
			else if (m.type === 'stats') root.postMessage({ type: 'stats', stats });
		};
	}
})(typeof self !== 'undefined' ? self : this);
