/* Renderer 3D: scena Three.js, kamera nad pociągiem obracana za kierunkiem jazdy, słońce i księżyc według
   godziny, niebo z chmurami, horyzont, pogoda, efekty po renderowaniu (ACES, bloom, okluzja), ustawienia
   jakości, minimapa. */
(function () {
	'use strict';
	const T = window.THREE;
	const R = window.TrainRoutes;
	const P = window.TrainPhysics;
	const NS = window.Train3D;
	const { sprite, boardTexture, smoothstep, U } = NS.util;

	/* Cienie kaskadowe: słońce to kilka świateł kierunkowych o tym samym kierunku i kolorze, każde z mapą cieni
	   o innym zasięgu (od najmniejszego). W shaderze oświetlenia (lights_fragment_begin – podmieniony dla wszystkich
	   materiałów, także tych z cieniami chmur) piksel bierze światło tylko z pierwszej kaskady, w której mapie leży
	   (z marginesem 3% od brzegu), a poza wszystkimi – z ostatniej, bez cienia; materiały bez cieni – z pierwszej.
	   Światło liczy się więc raz, a cień pochodzi z najostrzejszej mapy obejmującej piksel. */
	const CSM_OK = (() => {
		const C = T.ShaderChunk;
		const a = 'DirectionalLightShadow directionalLightShadow;\n\t#endif\n\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {';
		const b = '\t\tdirectionalLightShadow = directionalLightShadows[ i ];\n\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
		const src = C.lights_fragment_begin;
		if (!src.includes(a) || !src.includes(b)) return false;
		C.lights_fragment_begin = src
			.replace(a, 'DirectionalLightShadow directionalLightShadow;\n\t#endif\n\tbool csmDone = false;\n\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {')
			.replace(b, [
				'\t\tdirectionalLightShadow = directionalLightShadows[ i ];',
				'\t\t{',
				'\t\t\tvec3 csmP = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;',
				'\t\t\tbool csmIn = all( greaterThan( csmP.xy, vec2( 0.03 ) ) ) && all( lessThan( csmP.xy, vec2( 0.97 ) ) ) && csmP.z < 1.0;',
				'\t\t\tbool csmUse = ! csmDone && ( csmIn || ! receiveShadow || UNROLLED_LOOP_INDEX == NUM_DIR_LIGHT_SHADOWS - 1 );',
				'\t\t\tif ( csmUse ) {',
				'\t\t\t\tcsmDone = true;',
				'\t\t\t\tdirectLight.color *= ( directLight.visible && receiveShadow && csmIn ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',
				'\t\t\t} else directLight.color = vec3( 0.0 );',
				'\t\t}',
			].join('\n'));
		return true;
	})();
	/* kaskady: zasięg (połowa boku mapy, m) przy niskiej kamerze; wyżej – większe (mnożnik wg wysokości). Druga
	   kaskada węższa (80 zamiast 120 m) – w niej leży zwykle reszta składu za lokomotywą; przy 120 m teksel miał
	   ok. 12 cm i cienie wagonów były rozmyte. */
	const CASCADES = [36, 80, 340];

	// Ustawienia jakości: rozdzielczość, cienie, efekty po renderowaniu, gęstość roślinności, ilość opadu.
	const QUALITY = {
		// range – zasięg szczegółów świata (kawałki przed pociągiem, drzewa i drobiazgi z bliska, cienie)
		low: { name: 'niska', pr: 1, shadow: 1024, post: false, bloom: false, ao: false, atmo: false, msaa: 0, density: 0.5, particles: 0.35, range: 0.8 },
		medium: { name: 'średnia', pr: 1.5, shadow: 2048, post: true, bloom: true, ao: false, atmo: false, msaa: 4, density: 0.8, particles: 0.7, range: 1 },
		high: { name: 'wysoka', pr: 2, shadow: 4096, post: true, bloom: true, ao: true, atmo: true, msaa: 4, density: 1.15, particles: 1, range: 1.15 },
	};
	const ASPECT = { red: '#ff3b30', yellow: '#ffb020', green: '#34d058' };
	const FOV = 45;
	const PITCH = (36 * Math.PI) / 180; // domyślne pochylenie osi kamery w dół
	const PITCH_MIN = (10 * Math.PI) / 180;
	const PITCH_MAX = (82 * Math.PI) / 180;
	// orbita w widokach zewnętrznych: od lekko z dołu (kamera nisko przy torze) do pionu
	const ORBIT_MIN = (-7 * Math.PI) / 180;
	const ORBIT_MAX = (88 * Math.PI) / 180;
	const ZOOM_MIN = 0.06, ZOOM_MAX = 8;

	// Słońce według godziny (lato: wschód ok. 5:30, zachód ok. 20:15): e – sinus wysokości nad horyzontem, az – azymut.
	function sunModel(clockSec) {
		const h = (((clockSec / 3600) % 24) + 24) % 24;
		let e;
		if (h >= 5.5 && h <= 20.25) e = 0.8 * Math.sin((Math.PI * (h - 5.5)) / 14.75);
		else e = -0.35 * Math.sin((Math.PI * (h > 20.25 ? h - 20.25 : h + 3.75)) / 9.25);
		return { e, az: (Math.PI * (h - 12.9)) / 12 };
	}
	const clamp01 = (x) => Math.max(0, Math.min(1, x));
	const CAM_MODES = ['follow', 'cab', 'side', 'trackside', 'roof', 'bogie', 'rear', 'cinema'];
	const CAM_NAMES = {
		follow: 'za pociągiem', cab: 'z kabiny', side: 'z boku', trackside: 'przy torze (pociąg przejeżdża obok)', roof: 'z dachu',
		bogie: 'przy wózku i kołach', rear: 'z końca składu do tyłu', cinema: 'kinowa (ujęcia przy stacjach i przejazdach)',
	};
	const TRANS_T = 0.7; // płynne przejście między widokami (s)
	const tmpC = new T.Color();
	function angleLerp(a, b, t) {
		let d = b - a;
		while (d > Math.PI) d -= Math.PI * 2;
		while (d < -Math.PI) d += Math.PI * 2;
		return a + d * t;
	}

	class Renderer3D {
		constructor(canvas, mini) {
			this.canvas = canvas;
			this.mini = mini;
			this.mctx = mini.getContext('2d');
			this.gl = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
			this.gl.shadowMap.enabled = true;
			this.gl.shadowMap.type = T.PCFSoftShadowMap;
			this.scene = new T.Scene();
			this.camera = new T.PerspectiveCamera(FOV, 1, 0.5, 2600);
			this.scene.fog = new T.Fog(0xcfe6f7, 450, 1500);

			this.hemi = new T.HemisphereLight(0xdfeeff, 0x4a5a32, 1.2);
			this.sun = new T.DirectionalLight(0xffffff, 2.6);
			this.sun.castShadow = true;
			const sc = this.sun.shadow.camera;
			sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.near = 10; sc.far = 900;
			this.sun.shadow.bias = -0.0003;
			this.sun.shadow.normalBias = 0.5;
			this.scene.add(this.hemi, this.sun, this.sun.target);
			// dalsze kaskady (kolejność dodania = kolejność w shaderze: od najmniejszej mapy)
			this.cascades = [this.sun];
			for (let k = 1; CSM_OK && k < CASCADES.length; k++) {
				const l = new T.DirectionalLight(0xffffff, 2.6);
				l.castShadow = true;
				l.shadow.bias = -0.0003;
				this.scene.add(l, l.target);
				this.cascades.push(l);
			}
			this.csmFrame = 0;

			this.post = NS.createPost3D(T, this.gl);
			this.sky = NS.createSky3D(T);
			this.scene.add(this.sky.mesh);
			this.horizon = new NS.Horizon(this.scene);
			// promienie słońca w powietrzu i flara obiektywu (z Pogranicza)
			this.sunFx = NS.createSunFx3D(T, { scene: this.scene, heightAt: () => this.focus.y - 1 });
			// poświata księżyca (nocą, za terenem zasłonięta)
			this.moonGlow = sprite(NS.util.glowTexture(), 1, 1, { additive: true, color: 0xb8c8ff, fog: false });
			this.moonGlow.material.depthWrite = false;
			this.moonGlow.renderOrder = 950;
			this.scene.add(this.moonGlow);
			this.weather = new NS.Weather(this.scene);
			this.weatherKey = 'auto';
			this.env = { zenith: new T.Color(), horizon: new T.Color(), ground: new T.Color('#3a4a2a'), sunDir: new T.Vector3(), sunColor: new T.Color() };
			this.sunDir = new T.Vector3(0, 1, 0);
			this.moonDir = new T.Vector3(0, 1, 0);
			this.lightDir = new T.Vector3(0.3, 0.8, 0.4).normalize();
			this.hazeColor = new T.Color();
			this.focus = new T.Vector3();
			this.rainCenter = new T.Vector3();
			this.time = 0;
			this.envT = 0;
			this.dark = 0;

			this.world = new NS.World(this.scene);
			this.life = new NS.Life(this.scene);
			this.camMode = 'follow';
			this.trainModel = null;
			this.routeId = null;
			this.quality = null;
			// opcje renderera z ustawień: skala rozdzielczości, wygładzanie (MSAA), cienie
			this.renderOpts = { scale: 1, aa: true, shadows: true };
			this.setQuality('medium');

			// znacznik drogi hamowania
			const mm = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
			this.assistBar = new T.Mesh(new T.BoxGeometry(5, 0.08, 0.6), mm);
			this.assistLabel = sprite(boardTexture('H4', '#ffffff', 'sq'), 2.4, 2.4);
			this.assistLabel.position.y = 3;
			this.assistGroup = new T.Group();
			this.assistGroup.add(this.assistBar, this.assistLabel);
			this.scene.add(this.assistGroup);
			this.assist = true;

			this.grade = { lightTint: new T.Color(1, 1, 1), shadowTint: new T.Color(1, 1, 1), saturation: 1.1 };
			this.zoomLevels = [1, 1.7, 0.65];
			this.zoomNames = ['normalny', 'daleki', 'bliski'];
			this.zoomIdx = 0;
			this.zoom = 1;
			this.camHeading = 0;
			this.camState = { back: 0 };
			this.size = { w: 0, h: 0 };
			this.tp = {};
			this.tq = {};
			this.yaw = 0;
			this.pitch = PITCH;
			this.userZoom = 1;
			this.rotKey = 0;
			this.focusCar = -1; // środek orbity: −1 – przed czołem pociągu, 0… – pojazd składu
			this.pan = { x: 0, z: 0 }; // przesunięcie środka orbity (m): w bok i wzdłuż kierunku patrzenia
			this.orbitDist = 60;
			this.pitchKey = 0; // klawiatura: pochylenie (PageUp / PageDown) i przybliżenie (+ / −) w każdym widoku
			this.zoomKey = 0;
			this.trans = null; // przejście między widokami: { p, q, t }
			this.trackside = null; // stała kamera przy torze: { s, d }
			this.inputEnabled = false;
			this.perf = null; // nakładka diagnostyczna (F3)
			this.bindInput();
		}

		/* Nakładka diagnostyczna (F3): FPS, czas klatki na procesorze z podziałem na części (pociąg i kamera, otoczenie,
		   świat, ruch w tle, rysowanie), czas karty graficznej (EXT_disjoint_timer_query_webgl2, gdy dostępne), wywołania
		   rysowania, trójkąty, siatki, programy cieniowania, kawałki świata. Średnie z ok. 0,5 s. */
		togglePerf() {
			if (this.perf) {
				this.perf.el.remove();
				this.gl.info.autoReset = true;
				this.perf = null;
				return false;
			}
			const el = document.createElement('div');
			el.id = 'perf';
			document.body.appendChild(el);
			const gl = this.gl.getContext();
			this.perf = { el, gl, ext: gl.getExtension('EXT_disjoint_timer_query_webgl2'), queries: [], sum: {}, n: 0, gpu: 0, gpuN: 0, t: performance.now(), last: null };
			this.gl.info.autoReset = false;
			return true;
		}

		perfFrame(part, ms) {
			const P = this.perf;
			P.sum[part] = (P.sum[part] || 0) + ms;
		}

		perfEnd(t0) {
			const P = this.perf, now = performance.now(), info = this.gl.info;
			this.perfFrame('klatka', now - t0);
			P.sum.calls = (P.sum.calls || 0) + info.render.calls;
			P.sum.tris = (P.sum.tris || 0) + info.render.triangles;
			info.reset();
			P.n++;
			// wyniki zapytań czasu karty graficznej (dostępne po kilku klatkach)
			const gl = P.gl;
			while (P.queries.length && gl.getQueryParameter(P.queries[0], gl.QUERY_RESULT_AVAILABLE)) {
				const q = P.queries.shift();
				if (!gl.getParameter(P.ext.GPU_DISJOINT_EXT)) { P.gpu += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; P.gpuN++; }
				gl.deleteQuery(q);
			}
			if (now - P.t < 500) return;
			const k = 1 / P.n, f = (x) => (x * k).toFixed(1), S = P.sum;
			let meshes = 0;
			this.scene.traverseVisible((o) => { if (o.isMesh) meshes++; });
			const fps = (P.n * 1000) / (now - P.t);
			const row = (name, val, unit = '') => `${name.padEnd(11)}${String(val).padStart(6)}${unit ? ' ' + unit : ''}`;
			P.el.textContent = [
				row('FPS', fps.toFixed(0)),
				row('klatka CPU', f(S.klatka), 'ms'),
				...['pociąg', 'otoczenie', 'świat', 'ruch', 'rysowanie'].map((x) => row('  ' + x, f(S[x] || 0), 'ms')),
				row('GPU', P.ext ? (P.gpuN ? (P.gpu / P.gpuN).toFixed(1) : '…') : '–', P.ext ? 'ms' : ''),
				row('wywołania', Math.round(S.calls * k)),
				row('trójkąty', (S.tris * k / 1e6).toFixed(2), 'mln'),
				row('siatki', meshes),
				row('programy', info.programs.length),
				row('geometrie', info.memory.geometries),
				row('kawałki', this.world.chunks.size) + (this.world.pending ? ` (+${this.world.pending})` : ''),
			].join('\n');
			P.sum = {}; P.n = 0; P.gpu = 0; P.gpuN = 0; P.t = now;
		}

		/* Kompilacja shaderów przed startem jazdy (ekran wczytywania): wszystkie obiekty sceny – także ukryte (kabina
		   w widoku z zewnątrz, dalsze poziomy szczegółów) – bez tego program cieniowania kompiluje się przy pierwszym
		   pokazaniu obiektu (przycięcie przy wejściu do kabiny). Równolegle (KHR_parallel_shader_compile), gdy dostępne;
		   najwyżej 20 s. */
		precompile() {
			const hidden = [];
			this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
			let p;
			// ten sam bufor docelowy co przy rysowaniu (z efektami – bufor sceny), inaczej powstaje inny wariant programu
			const rt = this.gl.getRenderTarget();
			this.gl.setRenderTarget(this.quality.post ? this.post.target : null);
			try {
				p = this.gl.compileAsync(this.scene, this.camera);
			} catch (e) {
				p = Promise.resolve();
			}
			this.gl.setRenderTarget(rt);
			for (const o of hidden) o.visible = false;
			return Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 20000))]).then(() => this.warmUp());
		}

		/* Jedno rysowanie całej sceny (także obiektów ukrytych i poza kadrem) do bufora sceny: tekstury i bryły trafiają
		   do karty graficznej na ekranie wczytywania, a nie przy pierwszym pokazaniu (przycięcie ok. 50–100 ms przy
		   pierwszym wejściu do kabiny albo zmianie widoku). */
		warmUp() {
			const hidden = [], culled = [];
			this.scene.traverse((o) => {
				if (!o.visible) { hidden.push(o); o.visible = true; }
				if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
			});
			const rt = this.gl.getRenderTarget(), shadows = this.gl.shadowMap.autoUpdate;
			this.gl.shadowMap.autoUpdate = false;
			try {
				this.gl.setRenderTarget(this.quality.post ? this.post.target : null);
				this.gl.render(this.scene, this.camera);
			} catch (e) {
				// rozgrzanie jest tylko przyspieszeniem – błąd nie blokuje startu
			}
			this.gl.setRenderTarget(rt);
			this.gl.shadowMap.autoUpdate = shadows;
			for (const o of hidden) o.visible = false;
			for (const o of culled) o.frustumCulled = true;
		}

		/* Test wydajności (konsola: maszynista.bench()): bieżące miejsce trasy, widoki z kabiny i zza pociągu; dla każdego
		   mediana czasu klatki z oczekiwaniem na kartę graficzną (ms; n klatek), sam czas procesora (cpu), najdłuższa
		   klatka, wywołania, trójkąty i siatki. Symulacja stoi
		   (dt = 0 poza pomiarem animacji). */
		bench(sim, n = 20) {
			const gl = this.gl, ctx = gl.getContext(), px = new Uint8Array(4);
			const sync = () => ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
			const keep = this.camMode, auto = gl.info.autoReset;
			const view = (mode) => {
				this.camMode = mode;
				this.trans = null;
				this.resetView();
				this.camState.snap = true;
				for (let i = 0; i < 4; i++) this.draw(sim, 0, 0);
				const ts = [], cpu = [];
				for (let i = 0; i < n; i++) {
					sync();
					const a = performance.now();
					this.draw(sim, 1 / 60, 0);
					const b = performance.now();
					sync();
					ts.push(performance.now() - a);
					cpu.push(b - a);
				}
				ts.sort((a, b) => a - b);
				cpu.sort((a, b) => a - b);
				gl.info.autoReset = false;
				gl.info.reset();
				this.draw(sim, 0, 0);
				let meshes = 0;
				this.scene.traverseVisible((o) => { if (o.isMesh) meshes++; });
				const r = { ms: +ts[n >> 1].toFixed(1), cpu: +cpu[n >> 1].toFixed(1), max: +ts[n - 1].toFixed(1), calls: gl.info.render.calls, tris: +(gl.info.render.triangles / 1e6).toFixed(2), meshes };
				gl.info.reset();
				gl.info.autoReset = auto;
				return r;
			};
			const out = { trasa: sim.route.id, km: +(sim.st.pos / 1000).toFixed(2), bufor: `${ctx.drawingBufferWidth}×${ctx.drawingBufferHeight}`, jakość: this.quality.name, kabina: view('cab'), zaPociągiem: view('follow') };
			this.camMode = keep;
			this.resetView();
			this.camState.snap = true;
			return out;
		}

		cycleZoom() {
			this.zoomIdx = (this.zoomIdx + 1) % this.zoomLevels.length;
			return this.zoomNames[this.zoomIdx];
		}

		resize(hudH) {
			const w = window.innerWidth, h = Math.max(120, window.innerHeight - hudH);
			if (w === this.size.w && h === this.size.h) return;
			this.size = { w, h };
			const pr = Math.min(window.devicePixelRatio || 1, this.quality.pr) * this.renderOpts.scale;
			this.gl.setPixelRatio(pr);
			this.gl.setSize(w, h, true);
			this.post.setSize(w * pr, h * pr, this.renderOpts.aa ? this.quality.msaa : 0);
			this.camera.aspect = w / h;
			this.camera.updateProjectionMatrix();
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			this.mini.width = Math.round(w * dpr);
			this.mini.height = Math.round(64 * dpr);
			this.mini.style.width = w + 'px';
			this.mini.style.height = '64px';
			this.mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		setQuality(key) {
			const q = QUALITY[key] || QUALITY.medium;
			if (this.quality === q) return;
			this.quality = q;
			this.gl.toneMapping = q.post ? T.NoToneMapping : T.ACESFilmicToneMapping;
			this.cascades.forEach((l, k) => {
				// dwie bliższe kaskady w pełnej rozdzielczości jakości (pociąg i otoczenie przy nim), najdalsza do 2048
				const n = k < 2 ? q.shadow : Math.min(2048, q.shadow);
				l.shadow.mapSize.set(n, n);
				if (l.shadow.map) {
					l.shadow.map.dispose();
					l.shadow.map = null;
				}
			});
			this.world.density = q.density;
			this.world.detail = q.range;
			this.world.shadows = q.shadow >= 2048;
			this.weather.setQuality(q.particles);
			this.size = { w: 0, h: 0 };
			// tone mapping jest wkompilowany w shadery – przekompiluj materiały
			for (const m of NS.util.allMaterials) m.needsUpdate = true;
			this.scene.traverse((o) => {
				const m = o.material;
				if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; });
			});
			if (this.world.route) this.world.setRoute(this.world.route);
		}

		setRenderOptions(o) {
			const shadowsChanged = o.shadows !== undefined && o.shadows !== this.renderOpts.shadows;
			Object.assign(this.renderOpts, o);
			this.size = { w: 0, h: 0 }; // wymuś nowy rozmiar bufora
			if (shadowsChanged) {
				this.gl.shadowMap.enabled = this.renderOpts.shadows;
				for (const l of this.cascades) l.castShadow = this.renderOpts.shadows;
				this.syncCascades();
				// stan cieni jest wkompilowany w shadery
				this.scene.traverse((ob) => {
					const m = ob.material;
					if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; });
				});
				for (const m of NS.util.allMaterials) m.needsUpdate = true;
			}
		}

		// nazwa karty graficznej (do ustawień)
		gpuName() {
			try {
				const gl = this.gl.getContext();
				const ext = gl.getExtension('WEBGL_debug_renderer_info');
				return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
			} catch (e) {
				return '';
			}
		}

		setWeather(key) {
			this.weatherKey = key;
			if (this.routeId) this.weather.set(key, this.routeId, false);
		}

		reset(sim) {
			if (this.routeId !== sim.route.id || !this.world.route) {
				this.world.setRoute(sim.route);
				this.routeId = sim.route.id;
			} else this.world.warm = true;
			if (this.trainModel) this.trainModel.dispose();
			this.trainModel = new NS.TrainModel(this.scene, sim.train, { shadows: this.quality.shadow >= 1024, player: true, destination: sim.route.stations[sim.route.stations.length - 1].name });
			if (this.cab) this.cab.dispose();
			this.cab = new NS.CabInterior(this.trainModel);
			this.life.reset(sim.route, { shadows: this.quality.shadow >= 2048 });
			this.life.prewarm(sim); // modele pociągów tła na ekranie wczytywania (pula)
			/* trasa rzeczywista: pociągi z przeciwka po prawdziwym torze z mapy (nie po torze z gry); linia jednotorowa
			   (route.single): na odcinku jednotorowym – po torze pociągu gracza, na mijance – po torze bocznym, przejście
			   przy rozjeździe (R.laneWeight) */
			const rt = sim.route, lane = (s) => this.world.envLaneAt(s);
			const laneY = (s) => this.world.envTrackY(s, this.world.envLaneAt(s), false, false) - R.heightAt(rt, s);
			this.life.laneRaw = this.life.laneRawY = null;
			if (!this.world.env) this.life.lane = this.life.laneY = null;
			else if (!rt.single) { this.life.lane = lane; this.life.laneY = laneY; }
			else {
				this.life.laneRaw = lane;
				this.life.laneRawY = laneY;
				/* mijanka bez toru z mapy wybranego dla pociągów z przeciwka (tor urwany, odstawione wagony): najbliższy
				   wybrany tor do 300 m dalej albo 4,5 m od osi – pociąg czekający na krzyżowanie nie znika */
				const near = (s) => {
					for (let k = 25; k <= 300; k += 25) for (const x of [s - k, s + k]) { const d = lane(x); if (!Number.isNaN(d)) return d; }
					return 4.5;
				};
				this.life.lane = (s) => {
					const w = R.laneWeight(rt, s);
					if (w <= 0) return 0;
					const d = lane(s);
					return (Number.isNaN(d) ? near(s) : d) * w;
				};
				this.life.laneY = (s) => {
					const w = R.laneWeight(rt, s);
					if (w <= 0) return 0;
					const y = Number.isNaN(lane(s)) ? 0 : laneY(s);
					return Number.isFinite(y) ? y * w : 0;
				};
			}
			this.weather.set(this.weatherKey, sim.route.id, true);
			this.camHeading = R.trackPoint(sim.route, sim.st.pos + 15).heading;
			this.zoom = this.zoomLevels[this.zoomIdx];
			this.camState.snap = true;
		}

		// Słońce/księżyc, kolory nieba, światło, mgła, chmury, pogoda, odbicia nieba.
		updateEnvironment(sim, dt) {
			this.time += dt;
			const { e, az } = sunModel(sim.route.startClock + sim.time);
			const el = Math.asin(Math.max(-1, Math.min(1, e)));
			this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
			this.moonDir.set(-Math.sin(az) * 0.75, 0.55, -Math.cos(az) * 0.75).normalize();
			this.rainCenter.copy(this.camera.position).lerp(this.focus, 0.65);
			this.weather.light = 0.25 + 0.75 * smoothstep(-0.1, 0.25, this.e === undefined ? 1 : this.e);
			/* opad: nie pada w tunelu – w widoku z kabiny, gdy czoło jest ponad 10 m w tunelu (kamera zza pociągu wisi
			   nad terenem, tam pada) – ani wewnątrz wagonów */
			const pos = sim.st.pos, tl = sim.route.tunnels || [];
			this.weather.shelterTarget = !this.free && this.camMode === 'cab' && tl.some((t) => pos > t.from + 10 && pos < t.to - 5) ? 1 : 0;
			if (this.trainModel) this.weather.setCars(this.trainModel.cars, this.camera.position);
			const W = this.weather.update(dt, this.camera.position, this.focus);
			const pal = this.sky.palette(e);
			const zen = this.env.zenith.copy(pal.zenith), hor = this.env.horizon.copy(pal.horizon), sunCol = this.env.sunColor.copy(pal.sunlight);
			const dayK = smoothstep(-0.04, 0.22, e);
			const gray = this.hazeColor.copy(hor).lerp(tmpC.setRGB(0.5, 0.53, 0.57), 0.65).multiplyScalar(0.3 + 0.7 * smoothstep(-0.15, 0.3, e));
			this.sky.update({ camera: this.camera, time: this.time, e, sunDir: this.sunDir, moonDir: this.moonDir, zenith: zen, horizon: hor, sunlight: sunCol, haze: W.haze, hazeColor: gray, cover: W.cover });
			this.sky.clouds(this.time, W.shadow * clamp01((e + 0.02) / 0.15));

			// światło kierunkowe: słońce w dzień, księżyc w nocy
			if (e > -0.03) {
				this.lightDir.copy(this.sunDir);
				this.sun.color.copy(sunCol);
				this.sun.intensity = 0.05 + 3.5 * dayK * W.sun;
			} else {
				this.lightDir.copy(this.moonDir);
				this.sun.color.setRGB(0.55, 0.65, 0.95);
				this.sun.intensity = 0.6 * (1 - smoothstep(-0.1, 0.0, e)) * (1 - W.haze * 0.7);
			}
			this.syncCascades();
			this.hemi.color.copy(zen).lerp(hor, 0.5).lerp(gray, W.haze * 0.6);
			this.hemi.groundColor.setRGB(0.16, 0.19, 0.11).multiplyScalar(0.3 + dayK);
			// światło otoczenia dzielone między półkulę i odbicia nieba (razem dawały płaski, wyblakły obraz)
			this.hemi.intensity = (0.3 + 0.78 * smoothstep(-0.2, 0.3, e)) * (0.8 + 0.2 * W.sun);
			this.scene.environmentIntensity = 0.3 + 0.45 * dayK;
			// korekta barw: chłodne cienie, ciepłe światła (złota godzina – cieplej), nocą chłodniej i mniej nasycenia
			const golden = dayK * (1 - smoothstep(0.12, 0.35, e)) * W.sun, night = 1 - dayK;
			this.grade.lightTint.setRGB(1.035, 1.0, 0.95).lerp(tmpC.setRGB(1.09, 0.99, 0.86), golden * 0.6).lerp(tmpC.setRGB(0.97, 1.0, 1.06), night);
			this.grade.shadowTint.setRGB(0.95, 0.98, 1.05).lerp(tmpC.setRGB(0.86, 0.94, 1.14), night);
			this.grade.saturation = (1.1 - 0.14 * W.haze) * (1 - 0.18 * night) * (1 + golden * 0.1);

			const fog = this.scene.fog;
			// o zmierzchu mgła chłodnieje (zamiast przejmować pomarańcz zachodu)
			fog.color.copy(hor).lerp(zen, 0.45 * (1 - dayK)).lerp(gray, Math.min(1, 0.25 + W.haze));
			// mniejszy zasięg świata (jakość niska, dopasowanie w grze) – mgła bliżej, bez pustki za ostatnim kawałkiem
			const fr = Math.min(1, Math.max(0.6, (this.world.detail || 1) * (this.world.detailDyn || 1)) / 0.95);
			fog.near = W.fogNear * fr;
			fog.far = W.fogFar * fr;
			this.gl.setClearColor(fog.color);
			this.dark = Math.min(0.95, 1 - smoothstep(-0.1, 0.12, e) + W.haze * 0.3 + (1 - W.sun) * 0.12);

			U.uTime.value = this.time;
			U.uWind.value = W.wind;
			U.uWet.value = W.wet;
			U.uSnow.value = W.snowGround;
			U.uRain.value = W.rain;

			// odbicia nieba (lakier, szyby, szyny, woda, mokra ziemia) – odświeżane co 2 s
			this.envT -= dt;
			if (this.envT <= 0 || !this.scene.environment) {
				this.envT = 2;
				this.env.sunDir.copy(this.sunDir);
				const env = { zenith: zen.clone().lerp(gray, W.haze), horizon: hor.clone().lerp(gray, W.haze), ground: this.env.ground, sunDir: this.sunDir, sunColor: sunCol.clone().multiplyScalar(dayK * W.sun) };
				this.scene.environment = this.post.environment(env);
			}
			this.horizon.update(this.camera, this.focus.y - 3, fog.color, 0.25 + 0.75 * dayK, W.haze);
			// słońce: promienie i flara; księżyc: poświata
			this.sunFx.update({ camera: this.camera, imageRays: true, sunDir: this.sunDir, sunColor: sunCol, e, haze: W.haze, mist: W.haze * 0.5, focus: { x: this.focus.x, y: this.focus.z }, span: 700 });
			const moonVis = Math.max(0, Math.min(1, -e / 0.12)) * (1 - Math.min(1, W.haze * 1.2));
			this.moonGlow.visible = moonVis > 0.02;
			if (this.moonGlow.visible) {
				this.moonGlow.position.copy(this.camera.position).addScaledVector(this.moonDir, 1800);
				this.moonGlow.scale.setScalar(420);
				this.moonGlow.material.opacity = 0.32 * moonVis;
			}
			this.e = e;
			this.dayK = dayK;
			this.W = W;
		}

		// ---- sterowanie kamerą przez gracza: obrót wokół punktu przed pociągiem, pochylenie, oddalenie ----
		bindInput() {
			const c = this.canvas;
			let drag = null;
			// lewy przycisk – obrót, prawy (albo Shift + lewy) – przesuwanie widoku, kliknięcie w pojazd – środek orbity
			c.addEventListener('pointerdown', (e) => {
				if (!this.inputEnabled) return;
				drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, id: e.pointerId, pan: e.button === 2 || (e.button === 0 && e.shiftKey), button: e.button };
				c.setPointerCapture(e.pointerId);
				c.classList.add('dragging');
			});
			c.addEventListener('pointermove', (e) => {
				if (!drag || e.pointerId !== drag.id) return;
				if (this.free) this.freeLook(e.clientX - drag.x, e.clientY - drag.y);
				else if (drag.pan && this.camMode !== 'cab') this.panBy(e.clientX - drag.x, e.clientY - drag.y);
				else this.rotate((e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.005);
				drag.x = e.clientX;
				drag.y = e.clientY;
			});
			c.addEventListener('pointerup', (e) => {
				if (drag && drag.button === 0 && !drag.pan && !this.free && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) this.pickCar(e.clientX, e.clientY);
			});
			const end = () => { drag = null; c.classList.remove('dragging'); };
			c.addEventListener('pointerup', end);
			c.addEventListener('pointercancel', end);
			c.addEventListener('dblclick', () => { if (this.inputEnabled && !this.free) this.resetView(); });
			c.addEventListener('contextmenu', (e) => e.preventDefault());
			c.addEventListener('wheel', (e) => {
				if (!this.inputEnabled) return;
				e.preventDefault();
				if (this.free) this.freeWheel(e.deltaY);
				else this.zoomBy(Math.exp(e.deltaY * 0.0012));
			}, { passive: false });
		}

		rotate(dYaw, dPitch) {
			this.yaw -= dYaw;
			while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
			while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
			const cab = this.camMode === 'cab';
			this.pitch = Math.max(cab ? PITCH_MIN : ORBIT_MIN, Math.min(cab ? PITCH_MAX : ORBIT_MAX, this.pitch + dPitch));
		}

		zoomBy(f) {
			this.userZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.userZoom * f));
		}

		// przesunięcie środka orbity myszą (piksele → metry wg odległości kamery)
		panBy(dx, dy) {
			const k = Math.max(0.01, this.orbitDist * 0.0016);
			this.pan.x -= dx * k;
			this.pan.z += dy * k * (this.pitch > 1.2 ? 1 : 1.6);
		}

		resetView() {
			this.yaw = 0;
			this.pitch = PITCH;
			this.userZoom = 1;
			this.pan.x = this.pan.z = 0;
			this.focusCar = -1;
		}

		// środek orbity na kolejnym pojeździe składu (dir ±1); −1 – przed czołem; zwraca opis do komunikatu
		cycleFocusCar(dir, sim) {
			const n = this.trainModel ? this.trainModel.cars.length : 0;
			if (!n || this.camMode === 'cab') return null;
			let f = this.focusCar + dir;
			if (f < -1) f = n - 1;
			if (f >= n) f = -1;
			this.focusCar = f;
			this.pan.x = this.pan.z = 0;
			return this.focusLabel(sim);
		}
		focusLabel(sim) {
			const n = this.trainModel ? this.trainModel.cars.length : 0;
			if (this.focusCar < 0) return 'przed czołem pociągu';
			const sp = sim && sim.train.specs && sim.train.specs[this.focusCar];
			const S = sp && window.TrainRoutes.STOCK[sp.id];
			return `pojazd ${this.focusCar + 1} z ${n}${S ? ' – ' + S.name : ''}`;
		}
		// kliknięcie w pojazd: środek orbity na nim (ponowne kliknięcie w ten sam – z powrotem przed czoło)
		pickCar(x, y) {
			if (!this.trainModel || this.camMode === 'cab') return;
			const r = this.canvas.getBoundingClientRect();
			const ndc = new T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
			const rc = this.pickRay || (this.pickRay = new T.Raycaster());
			rc.setFromCamera(ndc, this.camera);
			const groups = this.trainModel.cars.map((c) => c.group);
			const hit = rc.intersectObjects(groups, true)[0];
			if (!hit) return;
			let o = hit.object;
			while (o && !groups.includes(o)) o = o.parent;
			const i = groups.indexOf(o);
			if (i < 0) return;
			this.focusCar = this.focusCar === i ? -1 : i;
			this.pan.x = this.pan.z = 0;
			if (this.onFocusCar) this.onFocusCar();
		}

		// fotel maszynisty: K przełącza między kabiną a poprzednim widokiem
		// zapamiętanie bieżącego ujęcia – kolejne klatki przechodzą z niego płynnie do nowego widoku
		startTransition() {
			this.trans = { p: this.camera.position.clone(), q: this.camera.quaternion.clone(), t: 0 };
		}

		toggleCab() {
			this.startTransition();
			if (this.camMode === 'cab') this.camMode = this.prevMode || 'follow';
			else {
				this.prevMode = this.camMode;
				this.camMode = 'cab';
			}
			this.resetView();
			this.camState.snap = true;
			return this.camMode === 'cab';
		}

		cycleCamMode() {
			this.startTransition();
			this.trackside = null;
			this.camMode = CAM_MODES[(CAM_MODES.indexOf(this.camMode) + 1) % CAM_MODES.length];
			this.resetView();
			this.camState.snap = true;
			return CAM_NAMES[this.camMode];
		}

		// ujęcie kinowe: przy wjeździe na stację z końca peronu, przy przejeździe – z drogi
		cinemaShot(sim) {
			const route = sim.route, front = sim.st.pos;
			const tp = this.tp;
			let st = null;
			if (sim.service !== null && sim.service !== undefined) st = route.stations[sim.service];
			else {
				const n = route.stations[sim.next];
				if (n && n.stop && n.pos - front < 650 && n.pos - front > -20) st = n;
			}
			if (st) {
				R.sidePoint(route, st.platformEnd + 26, 12.5, tp);
				this.camera.position.set(tp.x, tp.y + 2.8, tp.z);
				R.trackPoint(route, Math.min(front - 12, st.platformEnd), tp);
				this.camera.lookAt(tp.x, tp.y + 2.2, tp.z);
				this.focus.set(tp.x, tp.y, tp.z);
				return true;
			}
			const cr = route.crossings.find((c) => c.pos - front < 320 && c.pos - front > -sim.L);
			if (cr) {
				R.sidePoint(route, cr.pos + 6, 16, tp);
				this.camera.position.set(tp.x, tp.y + 2.2, tp.z);
				R.trackPoint(route, front - 15, tp);
				this.camera.lookAt(tp.x, tp.y + 2.4, tp.z);
				this.focus.set(tp.x, tp.y, tp.z);
				return true;
			}
			return false;
		}

		setNear(n) {
			if (this.camera.near !== n) {
				this.camera.near = n;
				this.camera.updateProjectionMatrix();
			}
		}

		updateCamera(sim, dt) {
			if (this.free) return this.freeUpdate(sim, dt); // swobodna kamera (js/3d/freecam.js)
			const route = sim.route, front = sim.st.pos, v = sim.st.v;
			const tp = this.tp;
			this.zoom += (this.zoomLevels[this.zoomIdx] - this.zoom) * Math.min(1, dt * 2.5);
			// klawiatura (także w pauzie – krok z zegara renderera)
			const kdt = dt > 0 ? dt : 1 / 60;
			if (this.rotKey) this.rotate(this.rotKey * kdt * 1.6, 0);
			if (this.pitchKey) this.rotate(0, this.pitchKey * kdt * 0.9);
			if (this.zoomKey) this.zoomBy(Math.exp(this.zoomKey * kdt * 1.4));
			const target = R.trackPoint(route, front + 20 + v * 0.8, this.tq).heading;
			this.camHeading = this.camState.snap ? target : angleLerp(this.camHeading, target, Math.min(1, dt * 1.6));
			// Kadr bazowy: czoło pociągu w dolnej części ekranu, tor daleko przed nim.
			// Kamera krąży wokół punktu „ahead” przed czołem; yaw = obrót gracza względem kierunku jazdy.
			const ahead = (6 + v * 0.8) * this.zoom; // środek ekranu: tyle metrów przed czołem
			const below = (16 + v * 0.1) * this.zoom; // dolna krawędź (przy widoku domyślnym): tyle metrów za czołem
			const half = (FOV * Math.PI) / 360;
			const pitch = this.pitch;
			const span = 1 / Math.tan(pitch) - 1 / Math.tan(Math.min(1.55, pitch + half));
			const spanDefault = 1 / Math.tan(PITCH) - 1 / Math.tan(PITCH + half);
			// przy płaskiej kamerze nie zjeżdżaj niżej niż ok. 7 m
			void span;
			/* orbita: odległość od środka – kadr domyślny jak dawniej (wysokość z zasięgu widoku przy pochyleniu
			   domyślnym) razy przybliżenie gracza; pochylenie od lekko z dołu do pionu, kamera nie niżej niż 1,5 m
			   nad terenem. Środek: punkt przed czołem (po obróceniu w bok – środek składu) albo wybrany pojazd,
			   przesunięty przez gracza (pan). */
			const heightDef = Math.max(7, (ahead + below) / spanDefault);
			const dist = (heightDef / Math.sin(PITCH)) * this.userZoom;
			this.orbitDist = dist;
			const height = dist * Math.sin(pitch);
			const want = this.camState;
			R.trackPoint(route, front, tp);
			const fx = Math.sin(this.camHeading), fz = -Math.cos(this.camHeading);
			const facing = Math.max(0, Math.cos(this.yaw));
			let along = ahead * facing - sim.L * 0.4 * (1 - facing);
			let px = tp.x + fx * along, pz = tp.z + fz * along, py = tp.y;
			const car = this.focusCar >= 0 && this.trainModel && this.trainModel.cars[this.focusCar];
			if (car) {
				// środek wybranego pojazdu (s – do terenu pod kamerą)
				const cars = sim.train.cars, gap = sim.train.gap || 1;
				let off = 0;
				for (let i = 0; i < this.focusCar; i++) off += cars[i] + gap;
				along = -(off + cars[this.focusCar] / 2);
				const gp = car.group.position;
				px = gp.x; pz = gp.z; py = R.heightAt(route, front + along);
			}
			const dir = this.camHeading + this.yaw;
			// przesunięcie środka: w bok (prostopadle do patrzenia) i wzdłuż kierunku patrzenia w poziomie
			const rx = Math.cos(dir), rz = Math.sin(dir), vx = Math.sin(dir), vz = -Math.cos(dir);
			px += rx * this.pan.x + vx * this.pan.z;
			pz += rz * this.pan.x + vz * this.pan.z;
			// w pauzie (dt = 0) bez wygładzania – kamerę można obracać i przesuwać także wtedy
			const k = want.snap || dt <= 0 ? 1 : Math.min(1, dt * (car ? 8 : 5));
			if (want.snap) { want.x = px; want.z = pz; want.h = py; }
			want.x += (px - want.x) * k;
			want.z += (pz - want.z) * k;
			want.h += (py - want.h) * k;
			want.snap = false;
			const horiz = dist * Math.cos(pitch);
			// nie wchodź pod teren: kamera co najmniej 1,5 m nad nim (wzdłuż toru: s, w bok: d – w przybliżeniu)
			const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
			const camS = front + along + this.pan.z * cy - this.pan.x * sy - horiz * cy, camD = this.pan.x * cy + this.pan.z * sy - horiz * sy;
			const camY = Math.max(want.h + 1.8 + height, this.world.terrainY(camS, camD) + 1.5);
			this.focus.set(want.x, want.h, want.z);
			const mode = this.camMode === 'cinema' ? (this.cinemaShot(sim) ? 'cinema' : 'follow') : this.camMode;
			this.setNear(mode === 'cab' ? 0.15 : 0.5);
			this.viewMode = mode;
			// kąt pionowy, ale ograniczony tak, by w poziomie nie przekroczyć ~100° (szerokie ekrany: bez „rybiego oka”)
			const baseFov = mode === 'cab' ? 62 : FOV;
			const maxH = ((mode === 'cab' ? 100 : 105) * Math.PI) / 180;
			const fov = Math.round(Math.min(baseFov, (2 * Math.atan(Math.tan(maxH / 2) / this.camera.aspect) * 180) / Math.PI) * 10) / 10;
			if (this.camera.fov !== fov) {
				this.camera.fov = fov;
				this.camera.updateProjectionMatrix();
			}
			if (this.cab) this.cab.setVisible(mode === 'cab');
			if (mode === 'follow') {
				this.camera.position.set(want.x - Math.sin(dir) * horiz, camY, want.z + Math.cos(dir) * horiz);
				this.camera.lookAt(want.x, want.h + 1.8, want.z);
			} else if (mode === 'cab') {
				// z kabiny: oczy maszynisty siedzącego w fotelu, rozglądanie myszą
				const eye = this.cab.eyeWorld(this.cabEye || (this.cabEye = new T.Vector3()), sim, this.time);
				const down = Math.max(-0.5, Math.min(1.1, 0.1 + (this.pitch - PITCH) * 0.9));
				const dirW = this.cab.lookDir(this.cabDir || (this.cabDir = new T.Vector3()), this.yaw, down);
				this.camera.position.copy(eye);
				this.camera.lookAt(eye.x + dirW.x, eye.y + dirW.y, eye.z + dirW.z);
				R.trackPoint(route, front + 40, tp);
				this.focus.set(tp.x, tp.y, tp.z);
			} else if (mode === 'side') {
				// z boku: kamera obok środka składu, obrót myszą wokół pociągu
				const sc = front - sim.L * 0.5;
				R.trackPoint(route, sc, tp);
				const h = tp.heading, dist = 30 * this.userZoom * this.zoom;
				const a = this.yaw;
				const ox = (Math.cos(h) * Math.cos(a) + Math.sin(h) * Math.sin(a)) * dist;
				const oz = (Math.sin(h) * Math.cos(a) - Math.cos(h) * Math.sin(a)) * dist;
				const lift = 3 + (this.pitch - PITCH + 0.35) * dist * 0.6;
				this.camera.position.set(tp.x + ox, Math.max(tp.y + 1.5, tp.y + lift), tp.z + oz);
				this.camera.lookAt(tp.x, tp.y + 2.2, tp.z);
				this.focus.set(tp.x, tp.y, tp.z);
			} else if (mode === 'trackside' || mode === 'roof' || mode === 'bogie' || mode === 'rear') {
				this.specialView(mode, sim, tp);
			}
			// płynne przejście z poprzedniego ujęcia (wygładzone, ok. 0,7 s)
			if (this.trans) {
				this.trans.t += dt > 0 ? dt : 1 / 60;
				const u = Math.min(1, this.trans.t / TRANS_T), e = u * u * (3 - 2 * u);
				if (u >= 1) this.trans = null;
				else {
					this.camera.position.lerpVectors(this.trans.p, this.camera.position, e);
					this.camera.quaternion.slerpQuaternions(this.trans.q, this.camera.quaternion, e);
				}
			}
			this.aimSun(tp.y, height);
		}

		/* Widoki dodatkowe (V):
		   – przy torze: kamera stoi 1,7 m nad terenem kilkaset metrów przed pociągiem, obok toru (wolne miejsce, na
		     przemian po obu stronach); patrzy na skład, gdy przejedzie – przenosi się dalej; kółko – przybliżenie (kąt
		     widzenia), mysz – rozglądanie;
		   – z dachu: nad czołem pierwszego pojazdu, patrzy przed siebie (mysz – rozglądanie);
		   – przy wózku: nisko obok pierwszego wózka, krąży wokół niego (mysz), kółko – odległość;
		   – z końca składu: za ostatnim pojazdem na wysokości okna kabiny, patrzy do tyłu. */
		specialView(mode, sim, tp) {
			const route = sim.route, front = sim.st.pos, cam = this.camera;
			const cars = this.trainModel ? this.trainModel.cars : [];
			const v3 = this.sv || (this.sv = [new T.Vector3(), new T.Vector3()]);
			const aimLocal = (car, ex, ey, ez, back) => {
				// oko w układzie pojazdu (z: −przód), patrzenie do przodu (back – do tyłu) z obrotem i pochyleniem gracza
				const g = car.group;
				g.updateMatrixWorld();
				const yaw = this.yaw + (back ? Math.PI : 0), dn = (this.pitch - PITCH) * 0.9;
				const eye = g.localToWorld(v3[0].set(ex, ey, ez));
				const tgt = g.localToWorld(v3[1].set(ex - Math.sin(yaw) * Math.cos(dn) * 10, ey - Math.sin(dn) * 10, ez - Math.cos(yaw) * Math.cos(dn) * 10));
				cam.position.copy(eye);
				cam.lookAt(tgt);
				this.focus.copy(eye);
			};
			if (mode === 'roof' && cars[0]) {
				const c = cars[0], H = c.H || 4.2;
				aimLocal(c, 0, H + 0.9, -c.len / 2 + 2.2, false);
				R.trackPoint(route, front + 40, tp);
				this.focus.set(tp.x, tp.y, tp.z);
			} else if (mode === 'rear' && cars.length) {
				const c = cars[cars.length - 1];
				aimLocal(c, 0, 2.7, c.len / 2 + 0.8, true);
				R.trackPoint(route, front - sim.L - 40, tp);
				this.focus.set(tp.x, tp.y, tp.z);
			} else if (mode === 'bogie' && cars[0]) {
				// orbita wokół pierwszego wózka (ok. 3 m od czoła ostojnicy), blisko toru
				const c = cars[0], g = c.group;
				g.updateMatrixWorld();
				const bz = -c.len / 2 + Math.min(3.6, c.len * 0.2);
				const center = g.localToWorld(v3[0].set(0, 0.7, bz));
				const a = Math.PI / 2 + this.yaw, el = Math.max(-0.05, Math.min(1.2, 0.12 + (this.pitch - PITCH) * 0.7)), r = Math.max(1.6, 3.4 * this.userZoom);
				const off = v3[1].set(Math.sin(a) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(a) * Math.cos(el) * r);
				off.applyQuaternion(g.getWorldQuaternion(this.svq || (this.svq = new T.Quaternion())));
				cam.position.copy(center).add(off);
				const s0 = front - (c.len / 2 + bz);
				R.trackPoint(route, s0, tp);
				cam.position.y = Math.max(cam.position.y, this.world.terrainY(s0, 0) + 0.25);
				cam.lookAt(center);
				this.focus.copy(center);
			} else if (mode === 'trackside') {
				// miejsce kamery: przed pociągiem; gdy skład je minie (albo za daleko) – następne
				let ts = this.trackside;
				const tail = front - sim.L;
				if (!ts || tail > ts.s + 25 || ts.s - front > 900) {
					const s = Math.min(route.length - 30, front + 260 + sim.st.v * 9);
					const side = ts ? -ts.side : 1;
					let d = side * 6;
					if (this.world.envFree) { const f = this.world.envFree(s, side * 4.5, side, 2.4, 14); if (f !== null && f !== undefined) d = f; }
					ts = this.trackside = { s, d, side };
					this.startTransition();
				}
				R.trackPoint(route, ts.s, tp);
				R.sidePoint(route, ts.s, ts.d, tp);
				const ey = this.world.terrainY(ts.s, ts.d) + 1.7;
				cam.position.set(tp.x, ey, tp.z);
				// patrzy na czoło (gdy daleko) i na środek składu, gdy przejeżdża obok; mysz dokłada obrót
				const aimS = Math.max(tail + sim.L * 0.3, Math.min(front, ts.s + 10));
				R.trackPoint(route, aimS, tp);
				cam.lookAt(tp.x, tp.y + 2, tp.z);
				cam.rotateY(-this.yaw);
				cam.rotateX(-(this.pitch - PITCH) * 0.6);
				// przybliżenie: węższy kąt widzenia, gdy pociąg daleko (kółko – zmiana)
				const dist = Math.max(10, Math.hypot(cam.position.x - tp.x, cam.position.z - tp.z));
				const fov = Math.max(8, Math.min(60, (2 * Math.atan(28 / dist) * 180) / Math.PI / this.userZoom));
				if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
				this.focus.set(tp.x, tp.y, tp.z);
			}
		}

		// kaskady jak słońce: ten sam kolor i natężenie; bez cieni (shader liczy wtedy każde światło) – tylko pierwsza
		syncCascades() {
			for (let k = 1; k < this.cascades.length; k++) {
				const l = this.cascades[k];
				l.color.copy(this.sun.color);
				l.intensity = this.sun.intensity;
				l.visible = this.sun.visible && this.renderOpts.shadows;
			}
		}

		/* Słońce i cienie podążają za widokiem (y – wysokość terenu, height – wysokość kamery). Kaskady: najbliższa
		   (ostra, ok. 36 m) przed kamerą, dalsze coraz większe; zasięgi rosną z wysokością kamery w stałych stopniach
		   (z histerezą). Bez migotania: środek każdej mapy przesuwany o całe teksele w płaszczyźnie prostopadłej do
		   promieni (krawędzie cieni nie „pełzają”), przesunięcie wzdłuż normalnej wg wielkości teksela. Dalsze
		   kaskady odświeżane na zmianę, co drugą klatkę. */
		aimSun(y, height) {
			const STEPS = [[0, 1], [45, 1.6], [110, 2.6], [200, 4]];
			let k = this.shadowStep ?? 0;
			while (k + 1 < STEPS.length && height > STEPS[k + 1][0] * 1.12) k++;
			while (k > 0 && height < STEPS[k][0] * 0.88) k--;
			this.shadowStep = k;
			const mul = STEPS[k][1];
			// baza światła: f – kierunek promieni, r, u – osie mapy cieni (jak lookAt kamery cienia z górą +y)
			const ld = this.lightDir, ly = Math.max(0.12, ld.y);
			const f = this.sunF || (this.sunF = new T.Vector3()), r = this.sunR || (this.sunR = new T.Vector3()), u = this.sunU || (this.sunU = new T.Vector3());
			f.set(-ld.x, -ly, -ld.z).normalize();
			r.set(0, 1, 0).cross(f).normalize();
			u.copy(f).cross(r).normalize();
			// kierunek patrzenia w poziomie – kaskady wysunięte przed kamerę
			const cam = this.camera.position, fw = this.camFw || (this.camFw = new T.Vector3());
			this.camera.getWorldDirection(fw);
			fw.y = 0;
			if (fw.lengthSq() < 1e-6) fw.set(0, 0, -1);
			fw.normalize();
			const c = this.sunC || (this.sunC = new T.Vector3());
			const n = this.cascades.length;
			this.csmFrame++;
			this.cascades.forEach((l, i) => {
				// jedna mapa (bez kaskad): dawny zasięg wokół punktu widoku
				const ext = n === 1 ? Math.min(400, 110 * mul) : Math.min(i === n - 1 ? 700 : 400, CASCADES[i] * mul);
				const shc = l.shadow.camera;
				const D = Math.max(400, ext * 1.6);
				if (shc.right !== ext || shc.far !== D * 2 + ext) {
					shc.left = -ext; shc.right = ext; shc.top = ext; shc.bottom = -ext;
					shc.near = 1; shc.far = D * 2 + ext;
					shc.updateProjectionMatrix();
				}
				const ts = (2 * ext) / (l.shadow.mapSize.x || 2048);
				// przesunięcie wzdłuż normalnej mniejsze (przy ts × 1,4 cienie kurczyły się i odklejały od podstaw)
				l.shadow.normalBias = Math.max(0.025, ts * 0.9);
				if (n === 1) c.set(this.focus.x, y, this.focus.z);
				else if (i === 0) {
					// najostrzejsza kaskada: między punktem przed kamerą a pociągiem (widok zza pociągu – kamera 30–60 m
					// za nim; środek przed samą kamerą zostawiał część składu w drugiej, rzadszej mapie)
					const fx = cam.x + fw.x * ext * 0.62, fz = cam.z + fw.z * ext * 0.62;
					c.set(fx + (this.focus.x - fx) * 0.6, y, fz + (this.focus.z - fz) * 0.6);
				} else c.set(cam.x + fw.x * ext * 0.62, y, cam.z + fw.z * ext * 0.62);
				const cr = c.dot(r), cu = c.dot(u), cf = c.dot(f);
				c.copy(r).multiplyScalar(Math.round(cr / ts) * ts).addScaledVector(u, Math.round(cu / ts) * ts).addScaledVector(f, cf);
				l.target.position.copy(c);
				l.position.copy(c).addScaledVector(f, -D);
				// dalsze kaskady odświeżane na zmianę (co drugą klatkę każda) – w klatce rysują się dwie mapy cieni
				// najdalsza (szeroka, mało szczegółów) – co czwartą klatkę
				if (i > 0) {
					l.shadow.autoUpdate = false;
					const every = i === n - 1 && n > 2 ? 4 : 2;
					if (this.csmFrame % every === i % every || this.csmFrame < 3) l.shadow.needsUpdate = true;
				}
			});
			this.syncCascades();
		}

		updateAssist(sim) {
			const show = this.assist && sim.st.v > 0.5 && sim.status === 'running';
			this.assistGroup.visible = show;
			if (!show) return;
			const d = P.brakingEstimate(sim.st.v, sim.train.serviceDecel, sim.brakeLag());
			const p = R.trackPoint(sim.route, sim.st.pos + d, this.tq);
			this.assistGroup.position.set(p.x, p.y + 0.1, p.z);
			this.assistGroup.rotation.y = -p.heading;
		}

		draw(sim, dt, hudH) {
			const P = this.perf, t0 = P ? performance.now() : 0;
			let t1 = t0;
			const lap = P ? (part) => { const t = performance.now(); this.perfFrame(part, t - t1); t1 = t; } : null;
			this.resize(hudH);
			// pociąg ustawiany przed kamerą – kamera w kabinie nie może być o klatkę spóźniona
			this.trainModel.weather = this.W; // deszcz i śnieg – częstsze łuki na pantografie
			this.trainModel.update(sim, this.dark, dt);
			this.updateCamera(sim, dt);
			this.cab.update(sim, dt, this.dark);
			if (P) lap('pociąg');
			this.updateEnvironment(sim, dt);
			if (P) lap('otoczenie');
			this.world.trainDoors = sim.doorsOpen ? this.trainModel.doorPoints() : null;
			this.world.viewPos.copy(this.camera.position);
			this.world.otherTrain = this.life.other;
			this.world.otherTrains = sim.traffic ? sim.traffic.active() : null;
			const W = this.W || { haze: 0, snow: 0, rain: 0 };
			this.world.update(sim, dt, this.dark, W.haze + W.snow * 0.6 + W.rain * 0.4);
			if (P) lap('świat');
			this.life.update(sim, dt, this.dark, this.focus, this.W || { rain: 0, snow: 0 });
			this.updateAssist(sim);
			if (P) lap('ruch');
			let query = null;
			if (P && P.ext && P.queries.length < 4) {
				query = P.gl.createQuery();
				P.gl.beginQuery(P.ext.TIME_ELAPSED_EXT, query);
			}
			const q = this.quality;
			const exposure = 1 + 0.7 * (1 - this.dayK);
			if (q.post) {
				const W = this.W;
				const rays = this.e > 0 ? 0.4 * (1 - W.haze) * W.sun * (1 - smoothstep(0.25, 0.55, this.e)) : 0;
				this.post.render(this.scene, this.camera, {
					bloom: q.bloom,
					bloomStrength: 0.5,
					/* AO w każdym widoku z zewnątrz, niezależnie od wysokości kamery – wcześniej tylko w widoku z góry
					   (kamera ponad 12 m nad pociągiem), bo przy płaskim spojrzeniu przyciemniało rozległe płaszczyzny;
					   po zejściu kamery cieniowanie nagle słabło. Płaskie spojrzenie wygasza teraz shader AO (post.js);
					   w kabinie bez AO (wnętrze widziane z bliska). */
					ao: q.ao && this.viewMode !== 'cab',
					aoRadius: 2.2,
					aoStrength: 1.2,
					aoFade: 140,
					exposure,
					saturation: this.grade.saturation,
					contrast: 1.07,
					shadowTint: this.grade.shadowTint,
					lightTint: this.grade.lightTint,
					vignette: 0.26,
					grade: 1,
					time: this.time,
					atmosphere: q.atmo
						? { sunDir: this.sunDir, sunColor: this.env.sunColor, haze: this.scene.fog.color, base: this.focus.y - 8, density: 0.0012 + W.haze * 0.006, falloff: 0.05, rays }
						: null,
				});
			} else {
				this.gl.toneMappingExposure = exposure;
				this.gl.setRenderTarget(null);
				this.gl.render(this.scene, this.camera);
			}
			this.drawMinimap(sim);
			if (P) {
				if (query) { P.gl.endQuery(P.ext.TIME_ELAPSED_EXT); P.queries.push(query); }
				lap('rysowanie');
				this.perfEnd(t0);
			}
		}

		drawMinimap(sim) {
			const ctx = this.mctx, r = sim.route, W = this.size.w;
			ctx.clearRect(0, 0, W, 64);
			if (this.miniRect === false) return;
			// w grze mapka trasy wypełnia miejsce w górnym pasku HUD (między stacją a punktami)
			const mr = this.miniRect;
			const x0 = mr ? mr.x0 : 16, x1 = mr ? mr.x1 : W - 70, y = 34;
			const mx = (p) => x0 + 10 + (Math.max(0, Math.min(r.length, p)) / r.length) * (x1 - x0 - 20);
			ctx.fillStyle = 'rgba(14,19,28,0.82)';
			ctx.beginPath();
			ctx.roundRect(x0, 8, x1 - x0, 46, 8);
			ctx.fill();
			ctx.strokeStyle = '#8a94a3';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(mx(0), y);
			ctx.lineTo(mx(r.bufferPos), y);
			ctx.stroke();
			ctx.lineWidth = 4;
			ctx.strokeStyle = '#2b2f36';
			for (const t of r.tunnels) { ctx.beginPath(); ctx.moveTo(mx(t.from), y); ctx.lineTo(mx(t.to), y); ctx.stroke(); }
			ctx.strokeStyle = '#4aa3df';
			for (const b of r.bridges) { ctx.beginPath(); ctx.moveTo(mx(b.from), y); ctx.lineTo(mx(b.to), y); ctx.stroke(); }
			ctx.font = '600 11px system-ui, sans-serif';
			ctx.textBaseline = 'middle';
			r.stations.forEach((s, i) => {
				const px = mx(s.pos);
				ctx.fillStyle = s.stop ? '#f4f4f4' : 'rgba(0,0,0,0)';
				ctx.strokeStyle = '#f4f4f4';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(px, y, 4, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
				ctx.fillStyle = s.stop ? '#e8edf3' : '#9aa5b3';
				ctx.textAlign = i === 0 ? 'left' : i === r.stations.length - 1 ? 'right' : 'center';
				ctx.fillText(s.name, px, 18);
			});
			for (const sig of sim.signals) {
				ctx.fillStyle = ASPECT[sig.aspect];
				ctx.beginPath();
				ctx.arc(mx(sig.pos), y + 10, 2.5, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.fillStyle = '#ffb020';
			const a = mx(sim.st.pos - sim.L), b = mx(sim.st.pos);
			ctx.fillRect(a, y - 4, Math.max(5, b - a), 8);
			ctx.fillStyle = '#c9d1db';
			ctx.textAlign = 'right';
			ctx.fillText(`${(sim.st.pos / 1000).toFixed(2)} km`, x1 - 8, y + 11);
		}
	}

	NS.Renderer3D = Renderer3D;
})();
