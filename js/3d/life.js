/* Życie w tle: pociągi z przeciwka na drugim torze (osobowe, ekspresy, towarowe) i stada ptaków.
   Tylko wygląd – nie wpływa na rozgrywkę. */
(function () {
	'use strict';
	const T = window.THREE;
	const R = window.TrainRoutes;
	const NS = window.Train3D;
	const { mat } = NS.util;

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
			if (this.other) this.other.model.dispose();
			this.other = null;
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
			else if (kind === 'ezt') { const u = pick(['EN57', 'EN57', 'EN71', 'ED72']); train = R.makeConsist({ emu: u, ev: vr(u), n: u === 'EN57' ? 1 + Math.floor(Math.random() * 2) : 1 }); }
			else if (kind === 'ic') { const l = pick(['EU07', 'EU07', 'EP09']); train = R.makeConsist({ loco: l, lv: vr(l), cars: l === 'EP09' ? many(6, ['A9', 'B10', 'B10']) : many(5, ['111A', '111A', '120A']) }); }
			else { const l = pick(['SM42', 'SM42', 'SU46']); train = R.makeConsist({ loco: l, lv: vr(l), cars: l === 'SM42' ? many(3, ['Bdhpumn']) : many(4, ['111A', '120A']) }); }
			const s = sim.st.pos + 1300 + Math.random() * 300;
			if (s > this.route.length - 50) return;
			// trasa rzeczywista: tylko gdy prawdziwy tor obok ciągnie się przez cały przejazd obok pociągu gracza
			if (this.lane) {
				// tor z mapy musi być tam, gdzie pociąg z przeciwka mija pociąg gracza (dalej – pociąg ukryty)
				for (let x = sim.st.pos + 600; x > sim.st.pos - sim.L - 150; x -= 10) if (Number.isNaN(this.lane(x))) { this.cooldown = 8; return false; }
			}
			const model = new NS.TrainModel(this.scene, train, { player: false, shadows: this.shadows, seed: Math.random() * 1000, destination: this.route.stations[0].name });
			const v = (kind === 'freight' ? 17 : kind === 'ic' ? 33 : kind === 'dd' ? 22 : 24) * (0.85 + Math.random() * 0.3);
			this.other = { id: Math.random(), train, model, s, v, len: train.cars.reduce((a, b) => a + b, 0) + train.gap * (train.cars.length - 1) };
		}

		update(sim, dt, dark, focus, weather) {
			if (!this.route) return;
			// pociąg z przeciwka
			if (this.route.double || this.lane) {
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
						// trasa rzeczywista: pociąg widoczny tylko na torze z mapy (czoło i koniec składu)
						const vis = !Number.isNaN(this.lane(o.s)) && !Number.isNaN(this.lane(o.s + o.len));
						for (const c of o.model.cars) c.group.visible = vis;
						o.hidden = !vis;
						if (vis) o.model.updateOther(this.route, o.s, -1, this.lane, dark, this.laneY);
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
