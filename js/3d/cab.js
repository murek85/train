/* Kabina maszynisty w czole pociągu gracza: wnętrze (ściany, sufit, szyby od środka, podłoga, ściana tylna
   z drzwiami, fotel), pulpit z działającymi wskaźnikami (prędkościomierz, manometr hamulca, wyświetlacze),
   ruchome nastawnik jazdy i kran hamulca, lampki czuwaka, drzwi i hamowania. Widoczna tylko w trybie kamery
   „z kabiny”. Układ współrzędnych: lokalny wagonu czołowego (przód = −z, y – wysokość nad główką szyny). */
(function () {
	'use strict';
	const T = window.THREE;
	const NS = window.Train3D;
	const P = window.TrainPhysics;
	const { mat: matW, matS: matSW, box, GEO } = NS.util;
	// wnętrze kabiny: bez śniegu i deszczu
	const mat = (c, e) => matW(c, Object.assign({ indoor: true }, e));
	const matS = (c, e) => matSW(c, Object.assign({ indoor: true }, e));

	const ASPECT = { red: '#ff3b30', yellow: '#ffb020', green: '#34d058' };

	function canvasTex(w, h) {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const tex = new T.CanvasTexture(c);
		tex.colorSpace = T.SRGBColorSpace;
		tex.anisotropy = 4;
		return { c, g: c.getContext('2d'), tex };
	}

	function fmtClock(sec) {
		const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
		return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0')).join(':');
	}

	class CabInterior {
		constructor(model) {
			const car = model.cars[0];
			this.model = model;
			this.car = car;
			this.own = [];
			const g = (this.group = new T.Group());
			g.visible = false;
			car.group.add(g);
			// kabina osadzona w części pojazdu (SM42 – kabina między maskami, wyżej): cabSpec – bryła kabiny, jej
			// połowa długości, przesunięcie (z – środek kabiny, y – podniesiona podłoga)
			const spec = car.cabSpec;
			const hl = spec ? spec.hl : car.len / 2, n = spec ? spec.nose : car.st.nose, H = spec ? spec.H : car.H;
			if (spec) g.position.set(0, spec.y, spec.z);
			const floor = 1.35;
			const deskFront = -hl + n * 0.45, deskBack = deskFront + 0.8;
			const back = deskBack + 1.65;
			this.eye = new T.Vector3(-0.35, 3.05, deskBack + 0.72);
			this.floor = floor;

			// ściany, sufit i szyby od środka – ta sama bryła co pudło, widziana od wewnątrz
			const own = (m) => { this.own.push(m); return m; };
			// lekkie świecenie własne udaje światło rozproszone wpadające przez szyby (wnętrze jest w cieniu dachu)
			// ściany jasne szarozielone (jak w kabinach PKP), sufit kremowy
			const wall = own(new T.MeshLambertMaterial({ color: '#aab2a6', emissive: '#33382f', side: T.BackSide }));
			const ceiling = own(new T.MeshLambertMaterial({ color: '#dcd9cc', emissive: '#46443d', side: T.BackSide }));
			const inGlass = own(new T.MeshBasicMaterial({ color: '#0d1820', transparent: true, opacity: 0.1, side: T.BackSide, depthWrite: false }));
			// krople i śnieg na szybie widziane od środka (te same uniformy co szyba z zewnątrz)
			if (model.glassU && NS.wetGlass) NS.wetGlass(inGlass, model.glassU);
			const bandIn = wall;
			const shell = new T.Mesh(spec ? spec.geo : car.bodyGeo, [wall, wall, bandIn, ceiling, inGlass, inGlass, own(new T.MeshBasicMaterial({ visible: false }))]);
			if (spec) shell.position.y = -spec.y; // bryła kabiny w układzie pojazdu (grupa podniesiona o spec.y)
			g.add(shell);
			this.inner = [wall, ceiling];

			const dark = mat('#4a5058', { emissive: 0x101316 }), panel = mat('#69717a', { emissive: 0x15181c }), grey = mat('#5d646b'), black = mat('#22262a', { emissive: 0x08090a });
			// podłoga, ściana tylna z drzwiami, gaśnica
			g.add(box(2.7, 0.06, back + hl, mat('#4a4f55'), 0, floor, (back - hl) / 2));
			g.add(box(2.8, 2.5, 0.08, mat('#b9bec3'), 0, floor + 1.25, back));
			g.add(box(0.8, 2.0, 0.1, mat('#8e959c'), 0.75, floor + 1.0, back - 0.02));
			// okno w drzwiach (z ramką), klamka, wieszak z kurtką
			g.add(box(0.46, 0.42, 0.11, mat('#2c3238'), 0.75, floor + 1.6, back - 0.025));
			g.add(box(0.4, 0.36, 0.12, own(new T.MeshBasicMaterial({ color: '#4a5a66' })), 0.75, floor + 1.6, back - 0.03));
			g.add(box(0.14, 0.03, 0.05, mat('#c9ccd0'), 0.45, floor + 1.0, back - 0.1));
			g.add(box(0.04, 0.04, 0.08, mat('#c9ccd0'), -0.6, floor + 1.85, back - 0.08));
			g.add(box(0.36, 0.7, 0.1, mat('#25365c'), -0.6, floor + 1.45, back - 0.1));
			const ext = new T.Mesh(GEO.cyl, mat('#c0392b'));
			ext.scale.set(0.16, 0.5, 0.16);
			ext.position.set(-1.15, floor + 0.3, back - 0.15);
			g.add(ext);

			// pulpit: korpus, skośny blat, półka na przyrządy
			const depth = deskBack - deskFront;
			g.add(box(2.6, 2.3 - floor, depth, panel, 0, (floor + 2.3) / 2, (deskFront + deskBack) / 2));
			const top = box(2.6, 0.06, depth + 0.1, dark, 0, 2.34, (deskFront + deskBack) / 2);
			top.rotation.x = -0.18;
			g.add(top);
			const shelf = box(2.4, 0.32, 0.06, black, 0, 2.56, deskFront + 0.2);
			shelf.rotation.x = -0.6;
			g.add(shelf);
			/* blat przeciwodblaskowy: matowy, ciemny – od półki z przyrządami do dolnej krawędzi szyby (zasłania
			   jasną blachę czoła widzianą od środka); przy pionowym czole (EN57) niżej, pod szybami */
			if (!spec) {
				// dolna krawędź szyby czołowej (x = 0,6 – obok słupka): promienie z przodu na bryłę, od góry w dół
				const probe = new T.Mesh(car.bodyGeo, [0, 1, 2, 3, 4, 5, 6].map(() => new T.MeshBasicMaterial()));
				const rc = new T.Raycaster(), dirZ = new T.Vector3(0, 0, 1);
				let seen = false, yg = 2.5, zg = -hl + n * 0.1;
				for (let y = 3.6; y > 1.9; y -= 0.015) {
					rc.set(new T.Vector3(0.6, y, -hl - 5), dirZ);
					const h = rc.intersectObject(probe, false)[0];
					const isG = h && h.face && h.face.materialIndex === 4;
					if (isG) { seen = true; yg = y; zg = h.point.z; } else if (seen) break;
				}
				probe.material.forEach((m) => m.dispose());
				// pochyły blat od półki z przyrządami do krawędzi szyby
				const y0 = 2.66, z0 = deskFront + 0.08, y1 = yg - 0.035, z1 = zg + 0.03;
				const Lg = Math.hypot(z1 - z0, y1 - y0);
				const gl = box(2.62, 0.03, Lg, own(new T.MeshLambertMaterial({ color: '#2b2f33', emissive: '#08090a' })), 0, (y0 + y1) / 2, (z0 + z1) / 2);
				gl.rotation.x = Math.atan2(y1 - y0, z0 - z1);
				g.add(gl);
			}
			// obwódki ekranów i zegarów (ciemne ramki na półce)
			const bezel = (w, h, x) => {
				const b = box(w + 0.05, h + 0.05, 0.02, mat('#15181b'), x, 2.56, deskFront + 0.24);
				b.rotation.x = -0.6;
				g.add(b);
			};
			bezel(0.5, 0.29, -0.35); bezel(0.36, 0.25, 0.42); bezel(0.27, 0.27, -0.92); bezel(0.24, 0.24, 0.92);
			// przełączniki dźwigienkowe z tabliczkami (rzędy na blacie po obu stronach nastawnika)
			const tog = mat('#c9ccd0'), plate = mat('#e8e4d8');
			for (const [x0, n2] of [[-0.62, 6], [0.38, 5]]) {
				for (let k = 0; k < n2; k++) {
					const x = x0 + k * 0.075;
					g.add(box(0.05, 0.012, 0.03, plate, x, 2.355, deskBack - 0.08));
					const t2 = box(0.012, 0.045, 0.012, tog, x, 2.37, deskBack - 0.14);
					t2.rotation.x = (k % 3 === 0 ? 0.5 : -0.5) - 0.18;
					g.add(t2);
				}
			}
			// radiotelefon ze słuchawką (po prawej), rozkład jazdy w uchwycie (na środku blatu)
			g.add(box(0.28, 0.12, 0.2, black, 1.12, 2.42, deskBack - 0.35));
			g.add(box(0.05, 0.04, 0.2, mat('#111'), 1.12, 2.5, deskBack - 0.35));
			g.add(box(0.2, 0.06, 0.04, mat('#0d3b1e', { emissive: 0x0a3a14 }), 1.12, 2.44, deskBack - 0.455));
			const tt = box(0.21, 0.004, 0.3, own(new T.MeshLambertMaterial({ color: '#f2f0e6', emissive: '#2a2a28' })), -0.35, 2.385, deskBack - 0.25);
			tt.rotation.x = -0.18;
			g.add(tt);
			g.add(box(0.23, 0.02, 0.04, mat('#3a3f45'), -0.35, 2.39, deskBack - 0.39));
			// rolety przeciwsłoneczne nad szybami czołowymi
			if (!spec && !car.st.vfront) for (const x of [-0.62, 0.62]) {
				const vz = -hl + n * 0.62;
				const roll = new T.Mesh(GEO.cyl, mat('#3a3f45'));
				roll.scale.set(0.05, 0.9, 0.05);
				roll.rotation.z = Math.PI / 2;
				roll.position.set(x, H - 0.42, vz);
				g.add(roll);
				const blind = box(0.88, 0.22, 0.01, own(new T.MeshLambertMaterial({ color: '#1d2a33', transparent: true, opacity: 0.75 })), x, H - 0.55, vz + 0.02);
				blind.rotation.x = 0.55;
				g.add(blind);
			}
			// sufit: kratka wentylacji, poręcz; okno w drzwiach tylnych
			g.add(box(0.5, 0.02, 0.3, mat('#7d848b'), 0.6, H - 0.1, back - 1.0));
			for (let k = 0; k < 6; k++) g.add(box(0.48, 0.012, 0.012, black, 0.6, H - 0.115, back - 1.12 + k * 0.05));
			g.add(box(0.03, 0.03, 0.9, mat('#c9ccd0'), -0.9, H - 0.25, back - 0.9));

			// wyświetlacze i wskaźniki (płaszczyzny z teksturą rysowaną na żywo)
			const screen = (w, h, cw, ch, x, y, z, tilt) => {
				const t = canvasTex(cw, ch);
				const m = own(new T.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
				const p = new T.Mesh(new T.PlaneGeometry(w, h), m);
				p.position.set(x, y, z);
				p.rotation.x = tilt;
				g.add(p);
				this.own.push(p.geometry, t.tex);
				return t;
			};
			const shelfZ = deskFront + 0.26;
			this.mfd = screen(0.5, 0.29, 512, 300, -0.35, 2.56, shelfZ, -0.6);
			this.side = screen(0.36, 0.25, 360, 250, 0.42, 2.56, shelfZ, -0.6);
			this.speedo = screen(0.27, 0.27, 256, 256, -0.92, 2.56, shelfZ + 0.005, -0.6);
			this.brakeG = screen(0.24, 0.24, 256, 256, 0.92, 2.56, shelfZ + 0.005, -0.6);
			// woltomierz sieci i amperomierz silników trakcyjnych (małe zegary na blacie)
			this.volt = screen(0.13, 0.13, 128, 128, -1.08, 2.405, deskBack - 0.58, -Math.PI / 2 + 0.55);
			this.amp = screen(0.13, 0.13, 128, 128, -0.92, 2.405, deskBack - 0.58, -Math.PI / 2 + 0.55);

			// lampki na pulpicie: czuwak, drzwi, hamowanie, prąd w sieci
			const lamp = (color, x) => {
				const m = own(new T.MeshBasicMaterial({ color: '#222' }));
				const l = new T.Mesh(GEO.cyl, m);
				l.scale.set(0.07, 0.03, 0.07);
				l.position.set(x, 2.4, deskBack - 0.22);
				l.rotation.x = -0.18;
				g.add(l);
				return { m, on: new T.Color(color).multiplyScalar(1.5), off: new T.Color('#2a2a2a') };
			};
			this.lamps = { ca: lamp('#ffcc00', -0.95), doors: lamp('#2ecc71', -0.82), brake: lamp('#ff3b30', -0.69), power: lamp('#3aa0ff', -0.56) };
			// przycisk czuwaka (duży, żółty) i przyciski drzwi
			const ca = new T.Mesh(GEO.cyl, mat('#e6b800'));
			ca.scale.set(0.12, 0.05, 0.12);
			ca.position.set(-1.0, 2.36, deskBack - 0.42);
			g.add(ca);
			for (const [x, c] of [[0.85, '#2ecc71'], [1.0, '#2ecc71'], [0.92, '#c0392b']]) {
				const b = new T.Mesh(GEO.cyl, mat(c));
				b.scale.set(0.06, 0.04, 0.06);
				b.position.set(x, 2.36, deskBack - (c === '#c0392b' ? 0.42 : 0.25));
				g.add(b);
			}

			// nastawnik jazdy (dźwignia pod prawą ręką) i kran hamulca zespolonego (po lewej)
			const metal = matS('#9aa0a6', { metalness: 0.8, roughness: 0.3 });
			g.add(box(0.16, 0.06, 0.4, black, 0.12, 2.37, deskBack - 0.3));
			this.lever = new T.Group();
			this.lever.position.set(0.12, 2.38, deskBack - 0.3);
			const stick = new T.Mesh(GEO.cyl, metal);
			stick.scale.set(0.035, 0.26, 0.035);
			stick.position.y = 0.13;
			const knob = new T.Mesh(GEO.sphere, mat('#202020'));
			knob.scale.set(0.09, 0.07, 0.09);
			knob.position.y = 0.27;
			this.lever.add(stick, knob);
			g.add(this.lever);
			this.brakeHandle = new T.Group();
			this.brakeHandle.position.set(-1.12, 2.4, deskBack - 0.22);
			const hub = new T.Mesh(GEO.cyl, black);
			hub.scale.set(0.1, 0.06, 0.1);
			const arm = box(0.03, 0.03, 0.24, metal, 0, 0.03, -0.12);
			const grip = new T.Mesh(GEO.sphere, mat('#b03a2e'));
			grip.scale.setScalar(0.06);
			grip.position.set(0, 0.04, -0.24);
			this.brakeHandle.add(hub, arm, grip);
			g.add(this.brakeHandle);

			// fotel maszynisty
			const fabric = mat('#2c3e57');
			const seatZ = this.eye.z + 0.15;
			const col = new T.Mesh(GEO.cyl, grey);
			col.scale.set(0.12, 0.45, 0.12);
			col.position.set(-0.35, floor + 0.23, seatZ);
			g.add(col);
			g.add(box(0.55, 0.12, 0.52, fabric, -0.35, floor + 0.5, seatZ));
			const rest = box(0.52, 0.7, 0.1, fabric, -0.35, floor + 0.9, seatZ + 0.3);
			rest.rotation.x = 0.15;
			g.add(rest);
			g.add(box(0.3, 0.18, 0.08, fabric, -0.35, floor + 1.35, seatZ + 0.37));
			for (const x of [-0.65, -0.05]) g.add(box(0.06, 0.05, 0.4, dark, x, floor + 0.72, seatZ - 0.02));

			// lampa sufitowa
			this.ceilingLamp = own(new T.MeshBasicMaterial({ color: '#cfcfc8' }));
			g.add(box(0.6, 0.03, 0.25, this.ceilingLamp, 0, H - 0.12, back - 0.5));

			// wnętrze przyjmuje cienie – pudło (dach, ściany) zasłania słońce, więc nie oświetla ono kabiny „przez blachę”
			g.traverse((o) => {
				if (o.isMesh) {
					o.receiveShadow = true;
					o.castShadow = false;
				}
			});
			this.t = 0;
			this.maxDial = Math.ceil(Math.round(model.train.vmax * 3.6) / 20) * 20 + 20;
		}

		setVisible(v) {
			this.group.visible = v;
			// wnętrze kabiny widoczne z zewnątrz (train.js) – w widoku z kabiny zastępuje je pełne wnętrze
			if (this.car.room) this.car.room.visible = !v;
		}

		update(sim, dt, dark) {
			if (!this.group.visible) return;
			// rozproszone światło we wnętrzu słabnie o zmroku (pulpit i ekrany świecą dalej)
			for (const m of this.inner) m.emissiveIntensity = 1 - Math.min(0.85, (dark || 0) * 0.9);
			const st = sim.st;
			this.lever.rotation.x = -sim.lever * 0.075;
			this.brakeHandle.rotation.y = -st.brake * 1.3;
			const blink = Math.floor(sim.time * 3) % 2 === 0;
			const set = (l, on) => l.m.color.copy(on ? l.on : l.off);
			set(this.lamps.ca, sim.ca.alarm ? blink : sim.opts.czuwak && st.v > 0.5 && sim.ca.t > 50);
			set(this.lamps.doors, sim.doorsOpen);
			set(this.lamps.brake, st.brake > 0.05);
			set(this.lamps.power, sim.power); // napięcie w sieci (pantograf + wyłącznik szybki)
			this.t -= dt;
			if (this.t > 0) return;
			this.t = 0.15;
			this.drawMfd(sim);
			this.drawSide(sim);
			this.drawSpeedo(sim);
			this.drawBrake(sim);
			this.drawDial(this.volt, 'kV', 4, sim.train.electric === false ? 0 : 3.0 + Math.sin(sim.time * 0.3) * 0.08);
			this.drawDial(this.amp, 'A', 1000, Math.abs(sim.st.traction) * 820 * Math.min(1, 0.3 + sim.st.v / 15));
		}

		// mały zegar analogowy: tarcza z podziałką, opis jednostki, wskazówka
		drawDial(t, unit, max, val) {
			if (!t) return;
			const { g, c, tex } = t, W = c.width, r = W * 0.44, cx = W / 2, cy = W / 2;
			g.fillStyle = '#101214';
			g.fillRect(0, 0, W, W);
			g.fillStyle = '#f1efe6';
			g.beginPath();
			g.arc(cx, cy, r, 0, Math.PI * 2);
			g.fill();
			g.strokeStyle = '#222';
			g.lineWidth = 2;
			for (let k = 0; k <= 10; k++) {
				const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
				g.beginPath();
				g.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
				g.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
				g.stroke();
			}
			g.fillStyle = '#222';
			g.font = '700 22px system-ui, sans-serif';
			g.textAlign = 'center';
			g.fillText(unit, cx, cy + r * 0.55);
			const a = Math.PI * 0.75 + Math.max(0, Math.min(1, val / max)) * Math.PI * 1.5;
			g.strokeStyle = '#c0392b';
			g.lineWidth = 4;
			g.beginPath();
			g.moveTo(cx, cy);
			g.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
			g.stroke();
			tex.needsUpdate = true;
		}

		drawMfd(sim) {
			const { g, c, tex } = this.mfd;
			const W = c.width, H = c.height, st = sim.st, kmh = st.v * 3.6;
			g.fillStyle = '#05070a';
			g.fillRect(0, 0, W, H);
			g.fillStyle = '#12202c';
			g.fillRect(0, 0, W, 34);
			g.fillStyle = '#9fc4e8';
			g.font = '600 20px system-ui, sans-serif';
			g.textBaseline = 'middle';
			g.textAlign = 'left';
			g.fillText(fmtClock(sim.clock()), 12, 18);
			g.textAlign = 'right';
			const ns = sim.route.stations[sim.next];
			g.fillText(ns ? ns.name : '', W - 12, 18);
			// pasek prędkości z ograniczeniem
			const x0 = 20, x1 = W - 20, yb = 250;
			const max = this.maxDial;
			const sx = (v) => x0 + ((x1 - x0) * Math.min(v, max)) / max;
			g.fillStyle = '#1e2a35';
			g.fillRect(x0, yb, x1 - x0, 22);
			g.fillStyle = kmh > sim.limit + 3 ? '#ff4b3e' : '#34d058';
			g.fillRect(x0, yb, sx(kmh) - x0, 22);
			g.fillStyle = '#ffffff';
			g.fillRect(sx(sim.limit) - 2, yb - 8, 4, 38);
			// cyfrowa prędkość
			g.textAlign = 'center';
			g.fillStyle = kmh > sim.limit + 3 ? '#ff6b5e' : '#ffffff';
			g.font = '700 96px ui-monospace, Consolas, monospace';
			g.fillText(String(Math.round(kmh)), 170, 140);
			g.font = '500 20px system-ui, sans-serif';
			g.fillStyle = '#8f9bad';
			g.fillText('km/h', 170, 205);
			// ograniczenie (tarcza) i semafor
			g.beginPath();
			g.arc(360, 120, 52, 0, Math.PI * 2);
			g.fillStyle = '#ffffff';
			g.fill();
			g.lineWidth = 12;
			g.strokeStyle = '#d0302a';
			g.stroke();
			g.fillStyle = '#111';
			g.font = '800 44px system-ui, sans-serif';
			g.fillText(String(sim.limit), 360, 122);
			const sig = sim.nextSignal();
			if (sig) {
				g.beginPath();
				g.arc(460, 90, 20, 0, Math.PI * 2);
				g.fillStyle = ASPECT[sig.aspect];
				g.fill();
				g.fillStyle = '#c9d1db';
				g.font = '600 18px system-ui, sans-serif';
				const d = sig.pos - st.pos;
				g.fillText(d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`, 460, 135);
			}
			g.fillStyle = '#ffb020';
			g.font = '700 22px ui-monospace, Consolas, monospace';
			g.fillText(P.leverLabel(sim.lever), 460, 200);
			tex.needsUpdate = true;
		}

		drawSide(sim) {
			const { g, c, tex } = this.side;
			const W = c.width, H = c.height, st = sim.st;
			g.fillStyle = '#05070a';
			g.fillRect(0, 0, W, H);
			g.font = '600 20px system-ui, sans-serif';
			g.textBaseline = 'middle';
			g.textAlign = 'left';
			const row = (y, label, value, color) => {
				g.fillStyle = '#8f9bad';
				g.fillText(label, 14, y);
				g.fillStyle = color || '#e6ebf2';
				g.textAlign = 'right';
				g.fillText(value, W - 14, y);
				g.textAlign = 'left';
			};
			row(30, 'Siła pociągowa', `${Math.round(st.traction * 100)} %`, '#34d058');
			row(70, 'Hamulec', `${(st.brake * 3.8).toFixed(1)} bar`, st.brake > 0.05 ? '#ff6b5e' : null);
			row(110, 'Drzwi', sim.doorsOpen ? 'OTWARTE' : 'zamknięte', sim.doorsOpen ? '#ffb020' : '#34d058');
			row(150, 'Profil', `${window.TrainRoutes.gradeAt(sim.route, st.pos - sim.L / 2)} ‰`);
			// czuwak: pasek do alarmu
			g.fillStyle = '#8f9bad';
			g.fillText('CA', 14, 200);
			g.fillStyle = '#1e2a35';
			g.fillRect(60, 190, W - 74, 20);
			const k = sim.opts.czuwak ? Math.min(1, sim.ca.t / 60) : 0;
			g.fillStyle = sim.ca.alarm ? '#ff3b30' : k > 0.8 ? '#ffb020' : '#3aa0ff';
			g.fillRect(60, 190, (W - 74) * k, 20);
			tex.needsUpdate = true;
		}

		dial(t, value, max, step, label, color, value2) {
			const { g, c, tex } = t;
			const S = c.width, cx = S / 2, cy = S / 2, r = S / 2 - 8;
			const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
			const ang = (v) => a0 + ((a1 - a0) * Math.min(Math.max(v, 0), max)) / max;
			g.fillStyle = '#e9e6dc';
			g.beginPath();
			g.arc(cx, cy, r + 6, 0, Math.PI * 2);
			g.fill();
			g.fillStyle = '#101214';
			g.beginPath();
			g.arc(cx, cy, r, 0, Math.PI * 2);
			g.fill();
			g.strokeStyle = '#d8dde3';
			g.fillStyle = '#d8dde3';
			g.font = `600 ${Math.round(S * 0.075)}px system-ui, sans-serif`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			for (let v = 0; v <= max + 1e-6; v += step / 2) {
				const a = ang(v), big = Math.abs(v / step - Math.round(v / step)) < 1e-6;
				g.lineWidth = big ? 3 : 1.5;
				g.beginPath();
				g.moveTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
				g.lineTo(cx + Math.cos(a) * (r - (big ? 22 : 14)), cy + Math.sin(a) * (r - (big ? 22 : 14)));
				g.stroke();
				if (big) g.fillText(String(Math.round(v)), cx + Math.cos(a) * (r - 40), cy + Math.sin(a) * (r - 40));
			}
			g.fillStyle = '#8f9bad';
			g.font = `500 ${Math.round(S * 0.07)}px system-ui, sans-serif`;
			g.fillText(label, cx, cy + r * 0.45);
			const needle = (v, col, w) => {
				const a = ang(v);
				g.strokeStyle = col;
				g.lineWidth = w;
				g.lineCap = 'round';
				g.beginPath();
				g.moveTo(cx - Math.cos(a) * 14, cy - Math.sin(a) * 14);
				g.lineTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18));
				g.stroke();
			};
			if (value2 !== undefined) needle(value2, '#e6ebf2', 4);
			needle(value, color, 5);
			g.fillStyle = '#444';
			g.beginPath();
			g.arc(cx, cy, 10, 0, Math.PI * 2);
			g.fill();
			tex.needsUpdate = true;
		}

		drawSpeedo(sim) {
			this.dial(this.speedo, sim.st.v * 3.6, this.maxDial, 20, 'km/h', '#ffb020');
		}

		drawBrake(sim) {
			// czerwona – cylinder hamulcowy, biała – przewód główny
			this.dial(this.brakeG, sim.st.brake * 3.8, 10, 2, 'bar', '#ff4b3e', 5 - sim.st.brake * 1.5);
		}

		// oko maszynisty w świecie (lekkie drgania przy jeździe)
		eyeWorld(out, sim, time) {
			const v = sim.st.v;
			const shake = Math.min(1, v / 25) * 0.006;
			out.set(this.eye.x + Math.sin(time * 17) * shake, this.eye.y + Math.sin(time * 23) * shake * 1.5, this.eye.z).add(this.group.position);
			this.car.group.updateMatrixWorld();
			return this.car.group.localToWorld(out);
		}

		// kierunek patrzenia: yaw (obrót w bok), down (pochylenie w dół) względem kabiny
		lookDir(out, yaw, down) {
			out.set(-Math.sin(yaw) * Math.cos(down), -Math.sin(down), -Math.cos(yaw) * Math.cos(down));
			return out.applyQuaternion(this.car.group.quaternion);
		}

		dispose() {
			this.car.group.remove(this.group);
			for (const o of this.own) o.dispose();
		}
	}

	NS.CabInterior = CabInterior;
})();
