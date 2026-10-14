/* Życie w tle: pociągi z przeciwka na drugim torze (osobowe, ekspresy, towarowe) i stada ptaków.
   Tylko wygląd – nie wpływa na rozgrywkę. */
(function () {
	'use strict';
	const T = window.THREE;
	const R = window.TrainRoutes;
	const NS = window.Train3D;
	const { mat, hash } = NS.util;

	const SECOND = -4.6;

	// ptak: tułów i dwa skrzydła; machanie = skalowanie w pionie (końce skrzydeł nad/pod tułowiem)
	function birdGeometry() {
		const g = new T.BufferGeometry();
		const v = [
			0, 0, -0.25, -0.9, 0.35, 0.1, 0, 0, 0.2,
			0, 0, -0.25, 0, 0, 0.2, 0.9, 0.35, 0.1,
		];
		g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
		g.computeVertexNormals();
		return g;
	}

	/* Maszynista i pasażerowie pociągu tła (opcja): proste postacie (tułów i głowa) w oknach – jedna bryła z kolorami
	   wierzchołków na wagon. Wymiary w układzie wagonu: y – nad główką szyny, z – wzdłuż (czoło po stronie −z). */
	const PEOPLE_MAT = mat('#ffffff', { vertexColors: true });
	function addPeople(model, seed, passengers) {
		const box = (pos, col, w, h, d, x, y, z) => {
			const g = new T.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z);
			const p = g.attributes.position.array;
			for (let i = 0; i < p.length; i++) pos.push(p[i]);
			for (let i = 0; i < p.length / 3; i++) col.push(...col.c);
			g.dispose();
		};
		const SHIRT = [[0.15, 0.2, 0.35], [0.45, 0.12, 0.1], [0.2, 0.35, 0.2], [0.55, 0.5, 0.45], [0.1, 0.1, 0.12], [0.6, 0.45, 0.15]];
		let k = 0;
		model.cars.forEach((car, i) => {
			const pos = [], col = [];
			const person = (x, y, z, shirt) => {
				col.c = shirt;
				box(pos, col, 0.42, 0.62, 0.3, x, y, z);
				col.c = [0.85, 0.66, 0.52];
				box(pos, col, 0.2, 0.24, 0.22, x, y + 0.45, z);
			};
			const h = (car.H || 4) > 4.3 ? 1.9 : 1.75; // tułów siedzącego (wagony piętrowe – dolny pokład)
			if (i === 0) person(-0.45, h + 0.35, -car.len / 2 + 1.9, [0.12, 0.16, 0.28]); // maszynista w kabinie
			if (passengers) {
				const n = 3 + Math.floor(hash(seed * 7 + i) * 6);
				for (let j = 0; j < n; j++) {
					const r = hash(seed * 13 + i * 31 + j);
					const z = -car.len / 2 + 4 + r * (car.len - 8);
					person(hash(r * 91 + j) < 0.5 ? -0.85 : 0.85, h, z, SHIRT[(k++) % SHIRT.length]);
				}
			}
			if (!pos.length) return;
			const g = new T.BufferGeometry();
			g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
			g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
			g.computeVertexNormals();
			const m = new T.Mesh(g, PEOPLE_MAT);
			m.userData.ownGeometry = true;
			car.group.add(m);
		});
	}

	class Life {
		constructor(scene) {
			this.scene = scene;
			this.route = null;
			this.other = null; // pociąg z przeciwka
			this.cooldown = 20;
			this.k = 0;
			const N = 36;
			this.birds = new T.InstancedMesh(birdGeometry(), mat('#2b2b30', { side: T.DoubleSide }), N);
			this.birds.frustumCulled = false;
			scene.add(this.birds);
			this.flocks = [0, 1, 2].map((f) => ({
				n: 12,
				ang: f * 2.1,
				r: 90 + f * 40,
				h: 30 + f * 12,
				speed: 0.12 + f * 0.03,
				members: Array.from({ length: 12 }, (_, i) => ({ dx: (Math.random() - 0.5) * 14, dy: (Math.random() - 0.5) * 4, dz: (Math.random() - 0.5) * 14, ph: Math.random() * 6 })),
			}));
			this.m4 = new T.Matrix4();
			this.q = new T.Quaternion();
			this.v = new T.Vector3();
			this.sc = new T.Vector3();
			this.e = new T.Euler();
		}

		reset(route, opts) {
			this.clear();
			this.route = route;
			this.shadows = opts.shadows;
			this.cooldown = 15 + Math.random() * 20;
		}

		clear() {
			if (this.models) {
				for (const m of this.models.values()) m.model.dispose();
				this.models.clear();
			} else if (this.other) this.other.model.dispose();
			if (this.pool) { for (const m of this.pool) m.dispose(); this.pool = []; }
			this.other = null;
		}

		/* Ruch na linii (sim.traffic, js/traffic.js): modele najbliższych pociągów tła – najwyżej this.limit naraz (do
		   2,2 km od pociągu gracza), nowy model najwyżej jeden na klatkę (budowa modelu – kilkadziesiąt ms); w kierunku
		   gracza – na jego torze, z przeciwka – na torze z mapy (trasa rzeczywista) albo na drugim torze. this.details –
		   maszynista i pasażerowie w oknach. this.other – najbliższy widoczny z przeciwka (dźwięk mijania). */
		updateTraffic(sim, dark) {
			if (!this.models) {
				if (this.other) this.other.model.dispose();
				this.other = null;
				this.models = new Map();
			}
			const ref = sim.st.pos, route = this.route;
			const dist = (t) => (t.dir > 0 ? Math.max(0, t.s - t.len - ref, ref - sim.L - t.s) : Math.max(0, t.s - ref, ref - sim.L - (t.s + t.len)));
			const onLane = (t) => t.dir > 0 || !this.lane || (!Number.isNaN(this.lane(t.s)) && !Number.isNaN(this.lane(t.s + t.len)));
			const cand = sim.traffic.active()
				.filter((t) => (t.dir > 0 || route.double || this.lane) && dist(t) < 2200)
				.sort((a, b) => dist(a) - dist(b))
				.slice(0, Math.max(1, this.limit || 3));
			const want = new Set(cand.map((t) => t.id));
			for (const [id, m] of this.models) if (!want.has(id)) { this.release(m.model); this.models.delete(id); }
			let built = 0;
			this.other = null;
			for (const t of cand) {
				let m = this.models.get(t.id);
				if (!m) {
					if (built++) continue;
					m = { model: this.buildModel(t) };
					this.models.set(t.id, m);
				}
				const show = onLane(t);
				for (const c of m.model.cars) c.group.visible = show;
				if (!show) continue;
				if (t.dir > 0) m.model.updateOther(route, t.s, 1, 0, dark);
				else if (this.lane) m.model.updateOther(route, t.s, -1, this.lane, dark, this.laneY);
				else m.model.updateOther(route, t.s, -1, SECOND, dark);
				if (t.dir < 0 && !this.other) this.other = { id: t.id, s: t.s, v: t.v, len: t.len, train: m.model.train, model: m.model };
			}
		}

		/* Pula modeli: model pociągu, który wyjechał z zasięgu, zostaje ukryty i wraca dla kolejnego pociągu z tym samym
		   składem i kierunkiem (bez budowy – bez przycięcia). prewarm – modele dla składów ruchu budowane na ekranie
		   wczytywania. Klucz: skład, kierunek (tablica kierunkowa), szczegóły (postacie). */
		poolKey(t) { return JSON.stringify(t.cfg) + (t.dir > 0 ? '+' : '-') + (this.details ? 'p' : ''); }
		release(model) {
			for (const c of model.cars) c.group.visible = false;
			if (!this.pool) this.pool = [];
			this.pool.push(model);
			while (this.pool.length > 10) this.pool.shift().dispose();
		}
		buildModel(t) {
			const key = this.poolKey(t);
			const i = this.pool ? this.pool.findIndex((m) => m.poolKey === key) : -1;
			if (i >= 0) return this.pool.splice(i, 1)[0];
			const st = this.route.stations;
			const train = R.makeConsist(t.cfg);
			const model = new NS.TrainModel(this.scene, train, { player: false, shadows: this.shadows, seed: t.id * 97.3, destination: (t.dir > 0 ? st[st.length - 1] : st[0]).name });
			if (this.details) addPeople(model, t.id, t.kind !== 'freight');
			model.compact();
			model.poolKey = key;
			return model;
		}
		prewarm(sim) {
			if (!sim.traffic) return;
			const seen = new Set();
			for (const t of sim.traffic.trains) {
				const key = this.poolKey(t);
				if (seen.has(key) || seen.size >= 6) continue;
				seen.add(key);
				this.release(this.buildModel(t));
			}
		}

		spawn(sim) {
			const kinds = ['freight', 'freight', 'ezt', 'ic', 'dd'];
			const kind = kinds[Math.floor(Math.random() * kinds.length)];
			// towarowy: za każdym razem inny skład (całopociągowy z węglem, cysternami, kontenerami albo mieszany);
			// pasażerski: losowa seria i malowanie z katalogu taboru (R.STOCK)
			const pick = (a) => a[Math.floor(Math.random() * a.length)];
			const vr = (id) => pick(R.STOCK[id].variants).id;
			const many = (n, ids) => Array.from({ length: n }, () => { const t = pick(ids); return { t, v: vr(t) }; });
			let train;
			if (kind === 'freight') train = NS.TrainModel.freightTrain(Math.random() * 1000);
			else if (kind === 'ezt') { const u = pick(['EN57', 'EN57', 'EN71', 'ED72', 'EN76', 'EN62', 'EN96', '48WE', '27WE', 'ED250']); train = R.makeConsist({ emu: u, ev: vr(u), n: u === 'EN57' || u === 'EN96' ? 1 + Math.floor(Math.random() * 2) : 1 }); }
			else if (kind === 'ic') { const l = pick(['EU07', 'EU07', 'EP09']); train = R.makeConsist({ loco: l, lv: vr(l), cars: l === 'EP09' ? many(6, ['A9', 'B10', 'B10']) : many(5, ['111A', '111A', '120A']) }); }
			else { const l = pick(['SM42', 'SM42', 'SU46']); train = R.makeConsist({ loco: l, lv: vr(l), cars: l === 'SM42' ? many(3, ['Bdhpumn']) : many(4, ['111A', '120A']) }); }
			const s = sim.st.pos + 1300 + Math.random() * 300;
			if (s > this.route.length - 50) return;
			// trasa rzeczywista: tylko gdy prawdziwy tor obok ciągnie się przez cały przejazd obok pociągu gracza
			const lane = this.laneRaw || this.lane;
			if (lane) {
				// tor z mapy musi być tam, gdzie pociąg z przeciwka mija pociąg gracza (dalej – pociąg ukryty)
				for (let x = sim.st.pos + 600; x > sim.st.pos - sim.L - 150; x -= 10) if (Number.isNaN(lane(x))) { this.cooldown = 8; return false; }
			}
			const model = new NS.TrainModel(this.scene, train, { player: false, shadows: this.shadows, seed: Math.random() * 1000, destination: this.route.stations[0].name });
			const v = (kind === 'freight' ? 17 : kind === 'ic' ? 33 : kind === 'dd' ? 22 : 24) * (0.85 + Math.random() * 0.3);
			this.other = { id: Math.random(), train, model, s, v, len: train.cars.reduce((a, b) => a + b, 0) + train.gap * (train.cars.length - 1) };
		}

		update(sim, dt, dark, focus, weather) {
			if (!this.route) return;
			// ruch na linii – pociągi tła z symulacji; bez niego – losowy pociąg z przeciwka (tylko wygląd)
			if (sim.traffic) this.updateTraffic(sim, dark);
			else if (this.route.double || this.lane) {
				if (!this.other) {
					this.cooldown -= dt;
					if (this.cooldown <= 0) {
						if (this.spawn(sim) !== false) this.cooldown = 35 + Math.random() * 60;
					}
				}
				const o = this.other;
				if (o) {
					o.s -= o.v * dt;
					const rear = o.s + o.len;
					if (rear < sim.st.pos - sim.L - 450 || rear < -400) this.clear();
					else if (this.lane) {
						// trasa rzeczywista: pociąg widoczny tylko na torze z mapy (czoło i koniec składu); bez ruchu na linii –
						// także na linii jednotorowej tylko po prawdziwym drugim torze (laneRaw), nie po torze gracza
						const lane = this.laneRaw || this.lane;
						const vis = !Number.isNaN(lane(o.s)) && !Number.isNaN(lane(o.s + o.len));
						for (const c of o.model.cars) c.group.visible = vis;
						o.hidden = !vis;
						if (vis) o.model.updateOther(this.route, o.s, -1, lane, dark, this.laneRawY || this.laneY);
					} else o.model.updateOther(this.route, o.s, -1, SECOND, dark);
				}
			}
			// ptaki: krążą wokół widoku; chowają się nocą i w deszczu/śniegu
			const show = dark < 0.6 && weather.rain < 0.3 && weather.snow < 0.3;
			this.birds.visible = show;
			if (!show) return;
			this.k += dt;
			let i = 0;
			for (const f of this.flocks) {
				f.ang += f.speed * dt;
				const cx = focus.x + Math.cos(f.ang) * f.r, cz = focus.z + Math.sin(f.ang) * f.r;
				const yaw = -f.ang;
				for (const m of f.members) {
					const flap = Math.sin(this.k * 9 + m.ph);
					this.e.set(0, yaw, Math.sin(this.k * 0.7 + m.ph) * 0.2);
					this.q.setFromEuler(this.e);
					this.v.set(cx + m.dx, focus.y + f.h + m.dy + Math.sin(this.k + m.ph) * 0.8, cz + m.dz);
					this.sc.set(1.3, 1.3 * flap, 1.3);
					this.m4.compose(this.v, this.q, this.sc);
					this.birds.setMatrixAt(i++, this.m4);
				}
			}
			this.birds.count = i;
			this.birds.instanceMatrix.needsUpdate = true;
		}
	}

	NS.Life = Life;
})();
