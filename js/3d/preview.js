/* Podgląd składu w menu (zakładka „Pociąg”): osobny mały renderer z tym samym modelem co w grze (TrainModel),
   na odcinku toru, z oświetleniem dziennym i odbiciami nieba. Kamera krąży wokół wybranego pojazdu – przeciąganie
   myszą obraca, kółko przybliża; bez ruchu myszy powoli obraca się sama. Rysuje tylko, gdy jest widoczny. */
import * as THREE from 'three';

(function () {
	'use strict';
	const T = THREE;
	const NS = window.Train3D;

	class StockPreview {
		constructor(canvas) {
			this.canvas = canvas;
			this.gl = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
			this.gl.outputColorSpace = T.SRGBColorSpace;
			this.gl.toneMapping = T.ACESFilmicToneMapping;
			this.gl.toneMappingExposure = 1.05;
			// cienie słońca (miękkie): pojazd stoi na torze, wózki i podwozie w cieniu pudła
			this.gl.shadowMap.enabled = true;
			this.gl.shadowMap.type = T.PCFShadowMap; // od r180 PCF z miękkim brzegiem (shadow.radius); PCFSoftShadowMap usunięty
			this.scene = new T.Scene();
			/* odbicia: niebo (gradient, jaśniej przy horyzoncie i wokół słońca), ciemniejszy grunt z jasnym pasem
			   horyzontu – lakier i szyby mają co odbijać, a krawędzie fazowane łapią światło */
			const env = new T.Scene();
			const sky = new T.Mesh(new T.SphereGeometry(50, 48, 24), new T.MeshBasicMaterial({ side: T.BackSide, vertexColors: true }));
			const pos = sky.geometry.attributes.position, col = [];
			const sunDir = new T.Vector3(-30, 40, -20).normalize(), v = new T.Vector3();
			for (let i = 0; i < pos.count; i++) {
				v.fromBufferAttribute(pos, i).normalize();
				const y = v.y;
				const c = y > 0 ? new T.Color('#7fa9d8').lerp(new T.Color('#eef4fa'), Math.pow(1 - y, 3)) : new T.Color('#c9ccc4').lerp(new T.Color('#5d6253'), Math.min(1, -y * 4));
				c.multiplyScalar(1 + 5 * Math.pow(Math.max(0, v.dot(sunDir)), 64));
				col.push(c.r, c.g, c.b);
			}
			sky.geometry.setAttribute('color', new T.Float32BufferAttribute(col, 3));
			env.add(sky);
			const pm = new T.PMREMGenerator(this.gl);
			this.scene.environment = pm.fromScene(env, 0.02).texture;
			pm.dispose();
			this.scene.add(new T.HemisphereLight(0xdfeaf5, 0x6b6656, 0.55));
			const sun = new T.DirectionalLight(0xfff3df, 3.0);
			sun.position.set(-30, 40, -20);
			sun.castShadow = true;
			sun.shadow.mapSize.set(2048, 2048);
			sun.shadow.bias = -0.0003;
			sun.shadow.normalBias = 0.03;
			sun.shadow.radius = 1.5; // promień rozmycia w tekselach (5 próbek z szumem – większy daje ziarno)
			this.scene.add(sun, sun.target);
			this.sun = sun;
			// tor: podsypka, podkłady i szyny pod całym składem
			this.track = new T.Group();
			const ballast = new T.Mesh(new T.BoxGeometry(4.2, 0.3, 1), new T.MeshStandardMaterial({ color: '#8b857a', roughness: 1 }));
			ballast.position.y = -0.33;
			ballast.receiveShadow = true;
			this.track.add(ballast);
			const sleeper = new T.MeshStandardMaterial({ color: '#6f6a63', roughness: 0.95 }), rail = new T.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.8, roughness: 0.35 });
			this.sleepers = new T.InstancedMesh(new T.BoxGeometry(2.6, 0.16, 0.26), sleeper, 1200);
			this.track.add(this.sleepers);
			this.sleepers.receiveShadow = true;
			this.rails = [-0.75, 0.75].map((x) => { const r = new T.Mesh(new T.BoxGeometry(0.07, 0.15, 1), rail); r.position.set(x, -0.075, 0); r.receiveShadow = true; this.track.add(r); return r; });
			this.ballast = ballast;
			const ground = new T.Mesh(new T.CircleGeometry(400, 48), new T.MeshStandardMaterial({ color: '#7d8a62', roughness: 1 }));
			ground.rotation.x = -Math.PI / 2;
			ground.position.y = -0.5;
			ground.receiveShadow = true;
			this.scene.add(ground, this.track);
			this.camera = new T.PerspectiveCamera(30, 2, 0.5, 2000);
			this.yaw = 0.75; this.pitch = 0.16; this.dist = 26;
			this.target = new T.Vector3();
			this.goal = new T.Vector3();
			this.idle = 0;
			this.model = null;
			this.running = false;
			// obrót myszą, przybliżanie kółkiem
			let drag = null;
			canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); this.idle = 0; });
			canvas.addEventListener('pointermove', (e) => {
				if (!drag) return;
				this.yaw -= (e.clientX - drag.x) * 0.008;
				this.pitch = Math.max(-0.05, Math.min(1.1, this.pitch + (e.clientY - drag.y) * 0.006));
				drag = { x: e.clientX, y: e.clientY };
				this.idle = 0;
			});
			canvas.addEventListener('pointerup', () => { drag = null; });
			canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = Math.max(8, Math.min(140, this.dist * (e.deltaY > 0 ? 1.12 : 0.89))); this.idle = 0; }, { passive: false });
			this.loop = this.loop.bind(this);
		}

		// skład do pokazania; focus – indeks pojazdu, wokół którego krąży kamera
		setTrain(train, focus = 0) {
			if (this.model) { this.model.dispose(); this.model = null; }
			this.model = new NS.TrainModel(this.scene, train, { player: false, shadows: true, detail: true });
			let off = 0, z0 = 0;
			this.offsets = [];
			this.model.cars.forEach((car) => {
				car.group.position.set(0, 0, off + car.len / 2);
				car.group.rotation.set(0, 0, 0);
				this.offsets.push(off + car.len / 2);
				off += car.len + train.gap;
			});
			z0 = off;
			if (this.model.setInteriorLight) this.model.setInteriorLight(0);
			// tor pod składem z zapasem
			const L = z0 + 40, n = Math.min(1200, Math.ceil(L / 0.6));
			const m4 = new T.Matrix4();
			for (let i = 0; i < n; i++) this.sleepers.setMatrixAt(i, m4.makeTranslation(0, -0.2, -20 + i * 0.6));
			this.sleepers.count = n;
			this.sleepers.instanceMatrix.needsUpdate = true;
			for (const r of [...this.rails, this.ballast]) { r.scale.z = L; r.position.z = -20 + L / 2; }
			this.focus(focus, true);
		}

		focus(i, now) {
			if (!this.model || !this.offsets.length) return;
			const k = Math.max(0, Math.min(this.offsets.length - 1, i));
			const car = this.model.cars[k];
			this.goal.set(0, 2.0, this.offsets[k]);
			this.dist = Math.max(this.dist, car.len * 1.25);
			if (now) this.target.copy(this.goal);
		}

		start() { if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.loop); } }
		stop() { this.running = false; }

		loop(t) {
			if (!this.running) return;
			requestAnimationFrame(this.loop);
			const dt = Math.min(0.1, (t - this.last) / 1000);
			this.last = t;
			const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
			if (!w || !h) return;
			if (this.canvas.width !== Math.round(w * devicePixelRatio) || this.canvas.height !== Math.round(h * devicePixelRatio)) {
				this.gl.setPixelRatio(devicePixelRatio);
				this.gl.setSize(w, h, false);
				this.camera.aspect = w / h;
				this.camera.updateProjectionMatrix();
			}
			this.idle += dt;
			if (this.idle > 3) this.yaw += dt * 0.18;
			this.target.lerp(this.goal, Math.min(1, dt * 4));
			const c = Math.cos(this.pitch);
			this.camera.position.set(this.target.x + Math.sin(this.yaw) * c * this.dist, this.target.y + Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * c * this.dist);
			this.camera.lookAt(this.target);
			// cień: kamera światła wokół oglądanego pojazdu (ostry z bliska, bez marnowania mapy na cały skład)
			const sc = this.sun.shadow.camera, ext = Math.min(30, 6 + this.dist * 0.45);
			this.sun.target.position.copy(this.target);
			this.sun.position.set(this.target.x - 30, this.target.y + 40, this.target.z - 20);
			if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 120; sc.updateProjectionMatrix(); }
			this.gl.render(this.scene, this.camera);
		}
	}
	NS.StockPreview = StockPreview;
})();
