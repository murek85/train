/* Renderer 3D: scena Three.js, kamera nad pociągiem obracana za kierunkiem jazdy, słońce i księżyc według
   godziny, niebo z chmurami, horyzont, pogoda, efekty po renderowaniu (ACES, bloom, okluzja), ustawienia
   jakości, minimapa. */
import * as THREE from 'three';
import { WebGPURenderer, InstancedInterleavedBuffer, InterleavedBufferAttribute, InstancedBufferAttribute, LightsNode } from 'three/webgpu';

/* klucz shaderów WebGPU obejmuje identyfikatory świateł sceny w kolejności przeglądania sceny (LightsNode.customCacheKey):
   te same światła pociągu gracza (train.js playerLight) w innych wagonach nowego składu – inna kolejność, inny klucz
   i przebudowa shaderów wszystkich oświetlonych materiałów. Światła zawsze według identyfikatora */
{
	const setLights0 = LightsNode.prototype.setLights;
	LightsNode.prototype.setLights = function (lights) {
		if (lights && lights.length > 1) lights.sort((a, b) => a.id - b.id);
		return setLights0.call(this, lights);
	};
}

(function () {
	'use strict';
	const T = THREE;
	const R = window.TrainRoutes;
	const P = window.TrainPhysics;
	const NS = window.Train3D;
	const { sprite, boardTexture, smoothstep, U } = NS.util;

	/* Cienie kaskadowe: słońce to kilka świateł kierunkowych o tym samym kierunku i kolorze, każde z mapą cieni
	   o innym zasięgu (od najmniejszego). W shaderze oświetlenia (lights_fragment_begin – podmieniony dla wszystkich
	   materiałów, także tych z cieniami chmur) piksel bierze światło z pierwszej kaskady, w której mapie leży (waga 1
	   w głębi mapy, w pasie 8% przy brzegu maleje do 0 – reszta z następnej kaskady: przejście bez szwu), za ostatnią –
	   bez cienia (wygaszanie w jej pasie brzegowym); materiały bez cieni – z pierwszej. Suma wag zawsze 1. */
	const CSM_OK = (() => {
		const C = T.ShaderChunk;
		const a = 'DirectionalLightShadow directionalLightShadow;\n\t#endif\n\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {';
		const b = '\t\tdirectionalLightShadow = directionalLightShadows[ i ];\n\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
		const src = C.lights_fragment_begin;
		if (!src.includes(a) || !src.includes(b)) return false;
		C.lights_fragment_begin = src
			.replace(a, 'DirectionalLightShadow directionalLightShadow;\n\t#endif\n\tfloat csmRest = 1.0;\n\t#pragma unroll_loop_start\n\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {')
			.replace(b, [
				'\t\tdirectionalLightShadow = directionalLightShadows[ i ];',
				'\t\t{',
				'\t\t\tvec3 csmP = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;',
				'\t\t\tvec2 csmE = min( csmP.xy, 1.0 - csmP.xy );',
				'\t\t\tfloat csmW = smoothstep( 0.03, 0.11, min( csmE.x, csmE.y ) ) * step( csmP.z, 0.9999 );',
				'\t\t\tfloat csmSh = ( directLight.visible && receiveShadow && csmW > 0.0 ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',
				'\t\t\tif ( ! receiveShadow ) { directLight.color *= csmRest; csmRest = 0.0; }',
				'\t\t\telse if ( UNROLLED_LOOP_INDEX == NUM_DIR_LIGHT_SHADOWS - 1 ) { directLight.color *= csmRest * ( csmW * csmSh + 1.0 - csmW ); csmRest = 0.0; }',
				'\t\t\telse { float csmU = csmRest * csmW; directLight.color *= csmU * csmSh; csmRest -= csmU; }',
				'\t\t}',
			].join('\n'));
		return true;
	})();
	/* kaskady: zasięg (połowa boku mapy, m) przy niskiej kamerze; wyżej – większe (mnożnik wg wysokości). Druga
	   kaskada węższa (80 zamiast 120 m) – w niej leży zwykle reszta składu za lokomotywą; przy 120 m teksel miał
	   ok. 12 cm i cienie wagonów były rozmyte. */
	const CASCADES = [36, 80, 340];
	// obiekty z materiałem GLSL (ShaderMaterial) – w trybie WebGPU jeszcze bez odpowiednika, ukryte (bez kompilacji z góry)
	const glslOnly = (o) => NS.gpu && !!o.material && !!o.material.isShaderMaterial;

	// Ustawienia jakości: rozdzielczość, cienie, efekty po renderowaniu, gęstość roślinności, ilość opadu.
	const QUALITY = {
		// range – zasięg szczegółów świata (kawałki przed pociągiem, drzewa i drobiazgi z bliska, cienie)
		low: { name: 'niska', pr: 1, shadow: 1024, post: false, bloom: false, ao: false, atmo: false, msaa: 0, density: 0.5, particles: 0.35, range: 0.8 },
		medium: { name: 'średnia', pr: 1.5, shadow: 2048, post: true, bloom: true, ao: true, ssr: false, atmo: false, msaa: 4, density: 0.8, particles: 0.7, range: 1 },
		high: { name: 'wysoka', pr: 2, shadow: 4096, post: true, bloom: true, ao: true, ssr: true, atmo: true, msaa: 4, density: 1.15, particles: 1, range: 1.15 },
	};
	/* Jakość cieni (ustawienie „Cienie”, domyślnie jak jakość ogólna): rozmiar map (dwie bliższe kaskady; najdalsza do
	   2048), promień rozmycia krawędzi (PCF) kaskad, zasięg obiektów świata rzucających cień (× 450 m) i cienie terenu
	   (wzgórza, wykopy) */
	const SHADOWQ = {
		low: { size: 1024, radius: [1, 1, 1], far: 0.35, terrain: false },
		medium: { size: 2048, radius: [1.6, 2, 2], far: 1, terrain: false },
		high: { size: 4096, radius: [1.8, 2.4, 2.6], far: 1.15, terrain: true },
	};
	/* Jakość wody (ustawienie „Woda”): odbicie lustrzane (niska – bez; rozdzielczość odbicia wg jakości ogólnej – jej
	   zmiana w trakcie gry niszczy teksturę odbicia, water.js) i poziom shadera (water.js uWQ: zmarszczki z nurtem, piana
	   przy brzegu – od średniej; wysoka – mocniejsze zmarszczki) */
	const WATERQ = { low: { refl: false, wq: 0 }, medium: { refl: true, wq: 1 }, high: { refl: true, wq: 2 } };
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

	/* WebGPU nie wystartowało albo karta się zawiesiła: w trybie auto zapamiętany zapas (common.js gpuFail) i ponowny start
	   z WebGL; przy WebGPU wybranym w ustawieniach – tylko wpis w konsoli */
	function gpuFallback(why) {
		console.warn('WebGPU: przejście na WebGL –', why);
		if (!NS.gpuAuto) return;
		try { localStorage.setItem('maszynista.gpuFail', JSON.stringify(String(why || 1))); } catch { return; }
		location.reload();
	}

	/* WebGPU: wspólne shadery obiektów z instancjami. Three buduje shader osobno dla każdego InstancedMesh (uuid obiektu
	   w kluczu – węzły instancji wskazują jego bufory), a do 1024 egzemplarzy macierze idą w buforze uniformów
	   array<mat4, N> – inny kod WGSL dla każdej liczby egzemplarzy. Świat ma setki takich obiektów: ok. 800 budów (JS)
	   i 950 programów do skompilowania (karta) przy wczytywaniu jazdy. Tu: macierze zawsze jako atrybuty instancji
	   (limit bufora uniformów 0 – kod nie zależy od liczby), klucz bez uuid (z rozróżnieniem koloru egzemplarzy),
	   a bufory instancji w atrybutach podmieniane na własne bufory obiektu (wersja = wersja instanceMatrix /
	   instanceColor, więc zmiany macierzy trafiają do karty jak dotąd). */
	function shareInstancing(gl) {
		gl.backend.capabilities.getUniformBufferLimit = () => 0;
		gl.gpuShared = true; // tylko ten renderer (prototyp RenderObject jest wspólny – podgląd taboru ma własny renderer)
		const owned = new WeakMap(); // (nie w userData – klonowanie obiektu kopiuje je przez JSON)
		const own = (o) => {
			let d = owned.get(o);
			if (d && d.m === o.instanceMatrix && d.c === o.instanceColor) return d;
			const follow = (buf, src) => { Object.defineProperty(buf, 'version', { get: () => src.version, set() {}, configurable: true }); buf.setUsage(src.usage); return buf; };
			const im = follow(new InstancedInterleavedBuffer(o.instanceMatrix.array, 16, 1), o.instanceMatrix);
			d = { m: o.instanceMatrix, c: o.instanceColor, im, views: new Map() };
			owned.set(o, d);
			if (o.instanceColor) d.color = follow(new InstancedBufferAttribute(o.instanceColor.array, 3), o.instanceColor);
			return d;
		};
		const prev = gl.debug.onNodeBuilderCreated;
		gl.debug.onNodeBuilderCreated = (nb, ro) => {
			gl.debug.onNodeBuilderCreated = prev;
			if (prev) prev(nb, ro);
			const RO = Object.getPrototypeOf(ro);
			if (RO.gpuShared) return;
			RO.gpuShared = true;
			const key = RO.getMaterialCacheKey, attrs = RO.getAttributes;
			RO.getMaterialCacheKey = function () {
				const o = this.object;
				if (!o.isInstancedMesh || !this.renderer.gpuShared) return key.call(this);
				const count = o.count;
				o.isInstancedMesh = false;
				o.count = 1;
				try {
					return (Math.imul(key.call(this), 31) + (o.instanceColor ? 2 : 1)) | 0;
				} finally {
					o.isInstancedMesh = true;
					o.count = count;
				}
			};
			RO.getAttributes = function () {
				if (this.attributes !== null || !this.object.isInstancedMesh || !this.renderer.gpuShared) return attrs.call(this);
				const list = attrs.call(this), d = own(this.object);
				for (let i = 0; i < list.length; i++) {
					const a = list[i];
					/* każdy widok na bufor macierzy instancji (stride 16): kolumny macierzy (vec4, przesunięcia 0/4/8/12) i np.
					   pozycja instancji do kołysania roślin (nodes.js instanceOrigin – vec3, przesunięcie 12); bez podmiany
					   czytałby bufor obiektu, dla którego zbudowano shader (inne macierze, za krótki przy większej liczbie) */
					if (a.isInterleavedBufferAttribute && a.data.isInstancedInterleavedBuffer && a.data.stride === 16) {
						const k = a.itemSize + ':' + a.offset;
						let v = d.views.get(k);
						if (!v) d.views.set(k, (v = new InterleavedBufferAttribute(d.im, a.itemSize, a.offset)));
						list[i] = v;
					}
					else if (a.isInstancedBufferAttribute && a.itemSize === 3 && d.color && !Object.values(this.geometry.attributes).includes(a)) list[i] = d.color;
				}
				this.vertexBuffers = Array.from(new Set(list.map((a) => (a.isInterleavedBufferAttribute ? a.data : a))));
				return list;
			};
		};
	}

	class Renderer3D {
		constructor(canvas, mini) {
			this.canvas = canvas;
			this.mini = mini;
			this.mctx = mini.getContext('2d');
			/* WebGPU (NS.gpu, common.js – domyślnie): WebGPURenderer z materiałami węzłowymi; gotowy po init() (gpuInit).
			   WebGL (zgodność): WebGLRenderer z łatkami GLSL */
			if (NS.gpu) {
				// ?gputime – znaczniki czasu karty (nakładka F3: czas GPU; trochę kosztują, więc tylko na życzenie)
				this.gl = new WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance', forceWebGL: NS.gpuForceWebGL, trackTimestamp: /[?&]gputime/.test(location.search) });
				/* zapas tekstur na etap shadera (domyślnie w WebGPU 16): limit karty odczytany przed init() i zamówiony
				   (do 48, NS.gpuMaxTex). Samplerów jest sprzętowo 16 – tekstury z plików i tak w tablicach (nodes.js pbrFamily) */
				const limits = async () => {
					NS.gpuMaxTex = 16;
					if (NS.gpuForceWebGL || !navigator.gpu) return;
					try {
						const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
						const m = (a && a.limits.maxSampledTexturesPerShaderStage) || 16;
						if (m > 16) {
							NS.gpuMaxTex = Math.min(m, 48);
							const P = this.gl.backend.parameters;
							P.requiredLimits = Object.assign({}, P.requiredLimits, { maxSampledTexturesPerShaderStage: NS.gpuMaxTex });
						}
					} catch (e) {
						NS.gpuMaxTex = 16;
					}
				};
				this.gpuInit = limits().then(() => this.gl.init()).then(() => {
					if (!/[?&]noshare/.test(location.search)) shareInstancing(this.gl); // (?noshare – bez wspólnych shaderów instancji, do porównań)
					/* paczki (world.js bundleStatic) przy rysowaniu do bufora (efekty po renderowaniu): odtwarzane bez odświeżenia
					   wspólnych uniformów (kamera) – obraz z nieaktualnej kamery; co najmniej odświeżenie współdzielone (tanie – jak
					   przy rysowaniu wprost na ekran) */
					const N = this.gl._nodes, need = N.needsRefresh.bind(N);
					/* obiekty utworzone przy kompilacji (precompile – paczki jako zwykłe grupy): przy pierwszym rysowaniu
					   w paczce pełne odświeżenie (geometria, uniformy obiektu, powiązania); stan z kompilacji poza paczką dawał
					   na niektórych trasach część świata w złym miejscu (wiszący peron, Toruń – Chełmża) */
					const fresh = (this.compiledFresh = new WeakSet());
					/* przy odtwarzaniu paczki odświeżenie współdzielone (wspólne bufory kamery i czasu, updateBefore – cienie,
					   odbicie) tylko dla pierwszego obiektu danego shadera w tym render(): bufory te są wspólne dla shadera,
					   a uniformy nieruchomych obiektów paczki się nie zmieniają. Odświeżenie każdego obiektu w każdym przebiegu
					   (obraz, kaskady cieni, odbicie) brało ok. 1/3 czasu procesora klatki. Przy nagrywaniu paczki – każdy */
					N.needsRefresh = (ro) => {
						if (ro.bundle && fresh.has(ro)) { fresh.delete(ro); return 2; }
						const t = need(ro);
						if (t === 2 || !ro.bundle) return t;
						if (this.gl._currentRenderBundle) return 1;
						const st = ro._nodeBuilderState || ro.getNodeBuilderState(), rid = N.nodeFrame.renderId;
						if (st.sharedRid === rid) return 0;
						st.sharedRid = rid;
						return 1;
					};
					/* paczki (BundleGroup) wykonane od razu, w miejscu rysowania (Three rysuje je przed zwykłymi obiektami), a nie
					   na końcu przebiegu (WebGPUBackend.finishRender – executeBundles po wszystkich rysowaniach): statyczny świat
					   z paczek zamalowywał przezroczyste obiekty bez zapisu głębi (znacznik drogi hamowania H4, poświaty, szyby).
					   executeBundles zeruje stan przebiegu (potok, powiązania, bufory) – podręczny stan Three od nowa */
					const B = this.gl.backend;
					if (B.isWebGPUBackend && B.addBundle) {
						B.addBundle = function (renderContext, bundle) {
							const d = this.get(renderContext);
							d.currentPass.executeBundles([this.get(bundle).bundleGPU]);
							d.currentSets = { attributes: {}, bindingGroups: [], pipeline: null, index: null };
						};
					}
					/* Three (Renderer._renderObjectDirect) dopisuje każdy rysowany obiekt do nagrywanej właśnie paczki
					   (_currentRenderBundle) i nie zeruje jej w zagnieżdżonym render(): mapa cieni albo odbicie wody wywołane
					   w czasie nagrywania paczki dokładały do niej swoje obiekty (z kamerą cienia / odbicia). Każde odtworzenie
					   paczki odświeżało je potem tą kamerą – do wspólnego bufora kamery głównego przebiegu: część świata
					   rysowana z kamery cienia (pomniejszona sieć, peron, wózki) albo odbicia (peron jadący za widokiem).
					   Zagnieżdżony render() bez nagrywanej paczki */
					/* zakresy błędów karty to stos wspólny dla całego urządzenia: Three otwiera zakres przy asynchronicznym
					   tworzeniu potoku i zamyka go dopiero po jego gotowości – błąd wysłania klatki w tym czasie (np. zniszczona
					   mapa cieni po zmianie jej rozmiaru) trafiał do zakresu potoku, Three uznawał poprawny potok za błędny
					   (pipelineData.error) i obiektów z nim nie rysował już nigdy (znikające elementy świata). Wysłanie
					   i zakończenie kodera we własnym zakresie */
					if (B.isWebGPUBackend && B.device) {
						const dev = B.device, Q = dev.queue, submit0 = Q.submit.bind(Q);
						const report = (e) => { if (e) console.error('WebGPU:', e.message); };
						Q.submit = (list) => { dev.pushErrorScope('validation'); try { submit0(list); } finally { dev.popErrorScope().then(report); } };
						const CE = GPUCommandEncoder.prototype, finish0 = CE.finish;
						if (!CE.finish.scoped) {
							CE.finish = function (...a) { dev.pushErrorScope('validation'); try { return finish0.apply(this, a); } finally { dev.popErrorScope().then(report); } };
							CE.finish.scoped = true;
						}
					}
					/* zwolnienie ostatniego obiektu grupy powiązań (Bindings._destroyBindings) czyści w niej tekstury samplerów
					   (release); ponowne utworzenie powiązań dla nowego obiektu tego samego shadera tworzy sampler przed
					   odświeżeniem tekstury z węzła – wyjątek (np. cień chmur w materiale ziemi). Wyjątek w odbiciu wody
					   zostawiał wodę ukrytą na stałe. Tekstura z węzła przed utworzeniem powiązań */
					const Bd = this.gl._bindings, create0 = Bd._createBindings;
					if (create0) {
						Bd._createBindings = function (bindings) {
							for (const g of bindings) for (const b of g.bindings) if (b.isSampler && b.textureNode && b.texture == null) b.texture = b.textureNode.value;
							return create0.call(this, bindings);
						};
					}
					/* Three usuwa zbudowany shader (stan węzłów) i potok karty, gdy znika ostatni obiekt, który ich używa – np.
					   kawałki świata za pociągiem demo albo stary model pociągu przy zmianie składu. Nowy obiekt tego samego
					   materiału budował je potem od zera, synchronicznie w klatce (zmiana składu w menu: ok. 200 shaderów,
					   zawieszenie ok. 10 s). Shadery i potoki zostają w pamięci podręcznej (ich liczba – rodzaje materiałów) */
					/* nie zostaje stan z węzłami przypiętymi do rysowanego obiektu (np. Sprite – węzły odwołań do obiektu): i tak
					   służy tylko jemu, a trzymałby go w pamięci razem z przodkami (stary kawałek świata, paczka, geometrie).
					   Tylko odwołanie podane przy tworzeniu węzła (ReferenceNode.object) – ModelNode.object3d i .reference to
					   bieżący obiekt klatki (wspólne węzły), światła w węzłach cieni są stałe */
					const LEAKFIX = !/[?&]noleakfix/.test(location.search); // (?noleakfix – bez poprawek pamięci 0.54.19, do porównań)
					const bound = (st) => {
						for (const L of [st.updateNodes, st.updateBeforeNodes, st.updateAfterNodes]) for (const n of L || []) { const v = n.object; if (v && (v.isMesh || v.isSprite || v.isLine || v.isPoints)) return true; }
						return false;
					};
					const Nm = this.gl._nodes, nodesDelete = Nm.delete.bind(Nm);
					Nm.delete = (o) => {
						if (o && o.isRenderObject) { const st = Nm.get(o).nodeBuilderState; if (st && !st.kept && !(LEAKFIX && bound(st))) { st.kept = true; st.usedTimes++; } }
						return nodesDelete(o);
					};
					/* Three (Geometries.initGeometry) dopisuje nasłuchiwacz „dispose” geometrii do zwykłej mapy (silnie) i w jego
					   domknięciu trzyma pierwszy obiekt rysowania tej geometrii (z nim obiekt, przodków, paczkę, materiał). Geometria
					   wspólna (GEO, modele) albo nigdy niezwolniona trzymała tak stare kawałki świata i modele pociągów – sterta rosła
					   o ok. 250 MB na zmianę trasy. Inicjalizacja z zastępczym obiektem rysowania (słaby odnośnik do prawdziwego,
					   tylko geometria i atrybuty – to, czego używa nasłuchiwacz) i bez wpisu w mapie (służy tylko dispose() renderera) */
					const G = this.gl._geometries, initGeometry0 = G.initGeometry;
					if (LEAKFIX && initGeometry0 && G._geometryDisposeListeners) {
						G.initGeometry = function (ro) {
							const ref = new WeakRef(ro), geometry = ro.geometry;
							initGeometry0.call(this, { geometry, getAttributes: () => { const r = ref.deref(); return r ? r.getAttributes() : []; } });
							this._geometryDisposeListeners.delete(geometry);
						};
					}
					const Pl = this.gl._pipelines;
					Pl._releasePipeline = () => {};
					Pl._releaseProgram = () => {};
					const GL = this.gl, render0 = GL.render;
					/* odbicie wody rysowane osobnym render() (water.js) – bez zagnieżdżenia jego bufor ma ten sam kontekst
					   (format, próbki, głębokość wywołania) co obraz, więc obiekty rysowania obu przebiegów byłyby wspólne
					   i przełączały potoki co klatkę. Osobny kontekst dla buforów odbicia */
					const RC = GL._renderContexts, rcGet = RC.get.bind(RC);
					RC.get = (rt = null, mrt = null, depth = 0) => rcGet(rt, mrt, rt && rt.isWaterReflection ? depth + 50 : depth);
					GL.render = function (...a) {
						const b = this._currentRenderBundle;
						this._currentRenderBundle = null;
						try {
							return render0.apply(this, a);
						} finally {
							this._currentRenderBundle = b;
						}
					};
					/* obiekty rysowania (RenderObject) są wspólne dla kamer w tym samym kontekście (format bufora docelowego –
					   np. kaskady cieni) – każde pobranie ustawia im swoją kamerę, a odtworzenie paczki odświeża je bez
					   pobrania, więc z kamerą ostatniego innego przebiegu. Przed odtworzeniem kamera tej paczki */
					const renderBundle0 = GL._renderBundle;
					GL._renderBundle = function (bundle, ...a) {
						const d = this.backend.get(this._bundles.get(bundle.bundleGroup, bundle.camera, this._currentRenderContext));
						if (d.renderObjects) for (const ro of d.renderObjects) ro.camera = bundle.camera;
						return renderBundle0.call(this, bundle, ...a);
					};
					/* obiekt paczki bez gotowego potoku (kompilacja w tle – asyncPipelines) nie trafia do nagrania i brakowałby
					   w niej do następnej zmiany paczki – paczka nagrywana od nowa, gdy jego potok będzie gotowy (draw) */
					const Pp = GL._pipelines, ready = Pp.isReady.bind(Pp);
					this.pipeReady = ready;
					this.bundleWait = new Map();
					Pp.isReady = (ro) => {
						const ok = ready(ro);
						if (!ok && GL._currentRenderBundle) {
							const bg = GL._currentRenderBundle.bundleGroup;
							let w = this.bundleWait.get(bg);
							if (!w) this.bundleWait.set(bg, (w = { ros: new Set(), t: 0 }));
							w.ros.add(ro);
						}
						return ok;
					};
					/* zwolniony obiekt rysowania (materiał, geometria albo obiekt usunięty, zmiana shadera) niszczy swoje bufory
					   uniformów – nagrana paczka z nim odwoływała się do zniszczonego bufora (błąd wysłania, utracona klatka):
					   paczka do ponownego nagrania */
					/* RenderObject.setGeometry (Three – obiekt z nową geometrią, np. drzewo z inną wersją) zmienia geometrię bez
					   przeniesienia nasłuchiwacza „dispose”: zostaje na starej, a dispose() zdejmuje go już z nowej. Na wspólnej
					   geometrii (World.G – drzewa) trzymał tak na zawsze obiekt rysowania, jego paczkę i cały stary kawałek świata */
					const fixSetGeometry = (RO) => {
						if (RO.geometryMoved || !LEAKFIX) return;
						RO.geometryMoved = true;
						const set0 = RO.setGeometry;
						RO.setGeometry = function (g) {
							if (g !== this.geometry) { this.geometry.removeEventListener('dispose', this.onGeometryDispose); g.addEventListener('dispose', this.onGeometryDispose); }
							return set0.call(this, g);
						};
					};
					const Ob = this.gl._objects, cro0 = Ob.createRenderObject.bind(Ob);
					Ob.createRenderObject = (...a) => {
						const ro = cro0(...a), od = ro.onDispose;
						fixSetGeometry(Object.getPrototypeOf(ro));
						ro.onDispose = () => { if (ro.bundle) ro.bundle.needsUpdate = true; od(); };
						return ro;
					};
					const O = this.gl._objects, oget = O.get.bind(O);
					O.get = (...a) => { const ro = oget(...a); if (this.pipes && this.pipes.n) fresh.add(ro); return ro; };
					this.asyncPipelines();
					// Three przy braku karty WebGPU sam przechodzi na zaplecze WebGL 2 – w trybie auto wtedy lepszy zwykły WebGL
					if (!NS.gpuForceWebGL && !this.gl.backend.isWebGPUBackend) gpuFallback('brak karty WebGPU');
				}).catch((e) => { console.error('WebGPU:', e); gpuFallback(e && e.message); });
				this.gl.onDeviceLost = (info) => { console.error('WebGPU: utracono urządzenie', info); gpuFallback('utracono urządzenie'); };
			} else this.gl = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
			this.gl.shadowMap.enabled = true;
			this.gl.shadowMap.type = T.PCFShadowMap; // od r180 PCF z miękkim brzegiem (shadow.radius); PCFSoftShadowMap usunięty
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
			// kamery map cieni widzą też warstwę brył zastępczych (world.js shadowMerge) – kamera gracza i odbicia nie
			for (const l of this.cascades) l.shadow.camera.layers.enable(NS.World.SHADOW_LAYER);
			// obiekty bez odbicia w wodzie (world.js NOREFL_LAYER) – widzi je kamera gracza i map cieni, kamera odbicia nie
			this.camera.layers.enable(NS.World.NOREFL_LAYER);
			for (const l of this.cascades) l.shadow.camera.layers.enable(NS.World.NOREFL_LAYER);
			this.csmFrame = 0;
			/* hold – klatki bez rysowania (świat i kamera liczone dalej): na ekranie startowym i ekranie wczytywania
			   w WebGPU, zanim compileAsync (precompile) skompiluje potoki równolegle – rysowanie tworzy brakujące potoki
			   synchronicznie, jeden po drugim (dziesiątki sekund przy kilkuset materiałach) */
			this.hold = false;
			if (NS.gpu) NS.nodes.setupCascades(this.cascades); // wybór kaskady i cienie chmur w węzłach świateł

			this.post = NS.gpu ? NS.createPostGPU(this.gl) : NS.createPost3D(T, this.gl); // efekty po renderowaniu (WebGPU – post-gpu.js)
			this.sky = NS.createSky3D(T);
			if (!NS.gpu) this.scene.add(this.sky.mesh);
			// WebGPU: niebo z fizycznej atmosfery (sky-gpu.js) – kopuła, mgła w kolorze nieba, odbicia
			if (NS.gpu) {
				this.skyGpu = NS.skyGpu = new NS.SkyGPU(this.gl, this.scene);
				this.scene.add(this.skyGpu.mesh);
			}
			this.envGpu = NS.gpu ? NS.nodes.createEnvironment(this.gl) : null;
			this.horizon = new NS.Horizon(this.scene);
			// promienie słońca w powietrzu i flara obiektywu (z Pogranicza)
			this.sunFx = NS.createSunFx3D(T, { scene: this.scene, heightAt: () => this.focus.y - 1 });
			// poświata księżyca (nocą, za terenem zasłonięta)
			this.moonGlow = sprite(NS.util.glowTexture(), 1, 1, { additive: true, color: 0xb8c8ff, fog: false });
			this.moonGlow.material.depthWrite = false;
			this.moonGlow.renderOrder = 950;
			this.scene.add(this.moonGlow);
			this.weather = new NS.Weather(this.scene);
			this.waterRefl = NS.gpu ? new NS.WaterReflectionGPU(this.scene) : new NS.WaterReflection(this.gl); // odbicie lustrzane wody (js/3d/water.js)
			this.waterWind = new T.Vector2();
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
			this.world.reflLayer = !!NS.gpu;
			this.life = new NS.Life(this.scene);
			this.camMode = 'follow';
			this.trainModel = null;
			this.routeId = null;
			this.quality = null;
			// opcje renderera z ustawień: skala rozdzielczości, wygładzanie (MSAA), cienie
			this.renderOpts = { scale: 1, aa: true, shadows: true, sharpen: 0.35 };
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
			const gl = NS.gpu ? null : this.gl.getContext();
			this.perf = { el, gl, ext: gl && gl.getExtension('EXT_disjoint_timer_query_webgl2'), queries: [], sum: {}, n: 0, gpu: 0, gpuN: 0, t: performance.now(), last: null };
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
			// WebGPU: czas karty ze znaczników czasu (?gputime), odczyt asynchroniczny co klatkę
			if (NS.gpu && this.gl.backend.trackTimestamp && !P.tsBusy) {
				P.tsBusy = true;
				this.gl.resolveTimestampsAsync('render').then((ms) => { if (ms > 0) { P.gpu += ms; P.gpuN++; } P.tsBusy = false; }, () => { P.tsBusy = false; });
			}
			while (gl && P.queries.length && gl.getQueryParameter(P.queries[0], gl.QUERY_RESULT_AVAILABLE)) {
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
				row('GPU', P.ext || P.gpuN ? (P.gpuN ? (P.gpu / P.gpuN).toFixed(1) : '…') : '–', P.ext || P.gpuN ? 'ms' : ''),
				row('wywołania', Math.round(S.calls * k)),
				row('trójkąty', (S.tris * k / 1e6).toFixed(2), 'mln'),
				row('siatki', meshes),
				row('programy', info.programs ? info.programs.length : '–'),
				row('geometrie', info.memory.geometries),
				row('kawałki', this.world.chunks.size) + (this.world.pending ? ` (+${this.world.pending})` : ''),
			].join('\n');
			P.sum = {}; P.n = 0; P.gpu = 0; P.gpuN = 0; P.t = now;
		}

		/* Kompilacja shaderów przed startem jazdy (ekran wczytywania): wszystkie obiekty sceny – także ukryte (kabina
		   w widoku z zewnątrz, dalsze poziomy szczegółów) – bez tego program cieniowania kompiluje się przy pierwszym
		   pokazaniu obiektu (przycięcie przy wejściu do kabiny). Równolegle (KHR_parallel_shader_compile), gdy dostępne;
		   najwyżej 20 s. */
		/* opts: { all – także obiekty poza kadrem (domyślnie tak), reflect – odbicie w wodzie (WebGPU, domyślnie tak), warm –
		   rozgrzanie na końcu (domyślnie tak), hidden – także obiekty ukryte (dalsze poziomy szczegółów, kabina; domyślnie tak) }. Ekran startowy: tylko kadr (szybciej do menu), reszta w tle (main.js). */
		/* Potoki karty (WebGPU) – podmiana Pipelines.getForRender (raz, po init):
		   – w precompile (pipes.n > 0) obietnice potoków do wspólnej listy (pipes.pend) zamiast czekania na każdy osobno;
		   – na starcie (pipes.async, do pierwszych pełnych klatek – endAsyncPipelines) zwykłe rysowanie tworzy brakujące
		     potoki asynchronicznie (createRenderPipelineAsync), a Three pomija obiekt, dopóki potok nie jest gotowy.
		     Synchroniczny createRenderPipeline kompiluje w procesie karty i wstrzymuje go całego (także tło ekranu
		     startowego w workerze): LUT-y atmosfery, chmury i PMREM otoczenia w pierwszej klatce po init – ok. 2,7 s.
		     Rysowania jednorazowe (LUT przepuszczalności, PMREM) powtarzane, gdy potoki gotowe (pipesReady).
		   Bez paczek (BundleGroup): pominięty obiekt zostałby w nagranej paczce na stałe. */
		asyncPipelines() {
			const gl = this.gl, pl = gl._pipelines, get = pl.getForRender;
			const P = (this.pipes = { n: 0, pend: [], async: gl.backend.isWebGPUBackend === true, wait: 0, calm: 0 });
			pl.getForRender = (ro, promises) => {
				if (promises && P.n) {
					// (licznik potoków kompilacji – compileInfo, etap na ekranie startowym)
					const k = P.pend.length, r = get.call(pl, ro, P.pend), C = this.compileStat;
					for (let i = k; i < P.pend.length; i++) { C.pipeTotal++; P.pend[i].then(() => C.pipeDone++, () => C.pipeDone++); }
					return r;
				}
				if (promises || !P.async || gl._currentRenderBundle !== null) return get.call(pl, ro, promises);
				const q = [], r = get.call(pl, ro, q);
				if (q.length) {
					P.wait++;
					Promise.all(q).finally(() => { if (--P.wait === 0) this.pipesReady(); });
				}
				return r;
			};
		}

		pipesReady() {
			if (this.skyGpu) this.skyGpu.atmo.dirty = true;
			if (this.envGpu) this.envGpu.reset();
		}

		/* koniec asynchronicznych potoków startu: dwie pełne klatki bez nowych potoków (potem jak dotąd – brakujący potok
		   synchronicznie, bez pomijania obiektów) */
		endAsyncPipelines() {
			const P = this.pipes;
			if (!P || !P.async) return;
			P.calm = P.wait === 0 ? P.calm + 1 : 0;
			if (P.calm >= 2) P.async = false;
		}

		// postęp bieżącej kompilacji: { pass ('scena' | 'odbicie' | 'rozgrzanie'), objDone, objTotal – obiekty przebiegu, pipeDone, pipeTotal –
		// potoki karty } (WebGPU; null, gdy nie było kompilacji)
		compileInfo() {
			return this.compileStat || null;
		}

		precompile(opts = {}) {
			if (NS.gpu && !this.gl.hasInitialized()) return this.gpuInit.then(() => this.precompile(opts));
			const all = opts.all !== false, reflect = opts.reflect !== false, warm = opts.warm !== false, hiddenToo = opts.hidden !== false;
			/* kompilacja dla bufora i kamery: obiekty ukryte i poza kadrem włączone tylko na czas synchronicznej części
			   compileAsync (rzut sceny na listę obiektów) – bez tego obrót kamery w jeździe budowałby nowe shadery */
			/* paczki (BundleGroup, world.js bundleStatic) na ten czas jak zwykłe grupy – compileAsync Three pomija paczki, więc
			   ich obiekty (większość świata) budowały shadery i potoki synchronicznie w pierwszej pełnej klatce (ok. 4 s
			   zawieszenia przed menu); obiekt rysowany potem w paczce ma ten sam stan (klucz bez paczki) */
			/* postęp kompilacji (compileInfo – etap na ekranie startowym): obiekty sceny przejrzane przez compileAsync (budowa
			   shaderów) i potoki karty, na które czekamy; zerowany, gdy nie trwa żadna inna kompilacja */
			if (!this.pipes || !this.pipes.n) this.compileStat = { pass: 'scena', objDone: 0, objTotal: 0, pipeDone: 0, pipeTotal: 0 };
			const CS = this.compileStat;
			const compileFor = (target, camera, depth = 0) => {
				const hidden = [], culled = [], bundles = [];
				this.scene.traverse((o) => {
					/* (bez świateł: ukryte światło – np. kaskady cieni po wyłączeniu cieni – w kompilacji zmieniało zestaw świateł,
					   więc klucze shaderów inne niż przy rysowaniu – wszystko budowane drugi raz po zamknięciu okienka) */
					if (hiddenToo && !o.visible && !o.isLight && !glslOnly(o)) { hidden.push(o); o.visible = true; }
					if (all && o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
					if (o.isBundleGroup && !/[?&]nobc/.test(location.search)) { bundles.push(o); o.isBundleGroup = false; } // (?nobc – paczki bez kompilacji, do porównań)
				});
				const rt = this.gl.getRenderTarget();
				this.gl.setRenderTarget(target);
				/* depth – poziom zagnieżdżenia rysowania (kontekst w kluczu shadera): odbicie rysuje się wewnątrz rysowania
				   sceny (poziom 1), a compileAsync bierze zawsze kontekst poziomu 0 – inaczej shadery budowałyby się od nowa */
				// (tylko WebGPU – WebGLRenderer nie ma _renderContexts)
				const C = depth ? this.gl._renderContexts : null, cget = C && C.get;
				if (C) C.get = (t, mrt, d) => cget.call(C, t, mrt, d === undefined ? depth : d);
				let q;
				try {
					if (NS.gpu) {
						// (liczniki obiektów osobno dla przebiegu: scena, odbicie w wodzie – depth 1)
						CS.pass = depth ? 'odbicie' : 'scena';
						CS.objDone = 0;
						CS.objTotal = 0;
						q = this.gl.compileAsync(this.scene, camera, null, (e) => { CS.objDone = e.loaded; CS.objTotal = e.total; });
					} else q = this.gl.compileAsync(this.scene, camera);
				} catch (e) {
					q = Promise.resolve();
				}
				if (C) C.get = cget;
				this.gl.setRenderTarget(rt);
				for (const o of hidden) o.visible = false;
				for (const o of culled) o.frustumCulled = true;
				for (const o of bundles) o.isBundleGroup = true;
				return q;
			};
			// ten sam bufor docelowy co przy rysowaniu (z efektami – bufor sceny), inaczej powstaje inny wariant programu
			const main = this.usePost ? this.post.target : null;
			let p;
			if (NS.gpu) {
				/* compileAsync (Three 0.186) czeka na każdy potok osobno, obiekt po obiekcie – kompilacja szeregowa.
				   Obietnice potoków zbierane tu, a nie w pętli Three: wszystkie potoki powstają naraz (createRenderPipelineAsync
				   – równolegle w procesie karty), czekamy na komplet na końcu.
				   Odbicie w wodzie (reflector): scena rysowana do jego bufora z kamery odbitej – inny kontekst, więc osobne
				   shadery i potoki dla wszystkich materiałów; bez kompilacji tutaj powstawały przy pierwszym akwenie w kadrze
				   (ok. 100 shaderów i 80 potoków w jednej klatce: 3,5 s + kilkanaście sekund czekania na kartę) */
				// (kilka kompilacji naraz – np. dokompilowanie w tle w menu i start jazdy – zbiera do wspólnej listy; asyncPipelines)
				if (!this.pipes) this.asyncPipelines();
				/* compileAsync Three oddaje sterowanie przez scheduler.yield po każdym obiekcie, ale jego kontynuacje mają
				   pierwszeństwo – przez całą kompilację (8–10 s przed menu) przeglądarka nie rysowała ani jednej klatki
				   (etap i liczniki na ekranie startowym stały, zadania z setTimeout czekały). Na czas kompilacji co ok. 40 ms
				   czekanie na klatkę (requestAnimationFrame, najwyżej 100 ms – karta w tle), poza tym jak dotąd. */
				const S = typeof self !== 'undefined' && self.scheduler;
				if (S && typeof S.yield === 'function' && !this.yieldShim) {
					const orig = S.yield.bind(S);
					let last = performance.now();
					this.yieldShim = true;
					S.yield = () => {
						if (!this.pipes || !this.pipes.n) return orig();
						const now = performance.now();
						if (now - last < 40) return orig();
						return new Promise((res) => {
							let done = false;
							const go = () => { if (!done) { done = true; last = performance.now(); res(); } };
							requestAnimationFrame(go);
							setTimeout(go, 100);
						});
					};
				}
				const W = this.pipes;
				W.n++;
				const R = reflect && this.waterRefl && this.waterRefl.refl && this.waterRefl.refl.reflector;
				p = compileFor(main, this.camera)
					.then(() => {
						if (!R) return;
						const vc = R.getVirtualCamera(this.camera);
						vc.copy(this.camera);
						return compileFor(R.getRenderTarget(vc), vc, 0); // (odbicie osobnym render() – kontekst bez zagnieżdżenia, water.js render)
					})
					.finally(() => { W.n--; })
					.then(() => Promise.all(W.pend.splice(0)));
			} else p = compileFor(main, this.camera);
			/* rozgrzanie (synchroniczne rysowanie całej sceny, ok. 2 s): najpierw jedna klatka z etapem „rozgrzanie” (compileInfo
			   – etykieta na ekranie wczytywania), potem rysowanie */
			return Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 20000))]).then(async () => {
				if (NS.gpu) this.rebundle(3);
				if (!warm) return;
				if (this.compileStat) this.compileStat.pass = 'rozgrzanie';
				await new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 100); });
				this.warmUp();
			});
		}

		/* Jedno rysowanie całej sceny (także obiektów ukrytych i poza kadrem) do bufora sceny: tekstury i bryły trafiają
		   do karty graficznej na ekranie wczytywania, a nie przy pierwszym pokazaniu (przycięcie ok. 50–100 ms przy
		   pierwszym wejściu do kabiny albo zmianie widoku). */
		warmUp() {
			const hidden = [], culled = [];
			this.scene.traverse((o) => {
				if (!o.visible && !o.isLight && !glslOnly(o)) { hidden.push(o); o.visible = true; } // (bez świateł – precompile)
				if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
			});
			const rt = this.gl.getRenderTarget(), shadows = this.gl.shadowMap.autoUpdate;
			this.gl.shadowMap.autoUpdate = false;
			try {
				this.gl.setRenderTarget(this.usePost ? this.post.target : null);
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
			const gl = this.gl, ctx = NS.gpu ? null : gl.getContext(), px = new Uint8Array(4);
			// (WebGPU: bez czekania na kartę – tylko czas procesora)
			const sync = () => ctx && ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
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
			const out = { trasa: sim.route.id, km: +(sim.st.pos / 1000).toFixed(2), bufor: ctx ? `${ctx.drawingBufferWidth}×${ctx.drawingBufferHeight}` : `${this.canvas.width}×${this.canvas.height}`, jakość: this.quality.name, kabina: view('cab'), zaPociągiem: view('follow') };
			this.camMode = keep;
			this.resetView();
			this.camState.snap = true;
			return out;
		}

		// efekty po renderowaniu (post.js / post-gpu.js) – wg jakości
		get usePost() {
			return this.quality.post;
		}

		cycleZoom() {
			this.zoomIdx = (this.zoomIdx + 1) % this.zoomLevels.length;
			return this.zoomNames[this.zoomIdx];
		}

		// efekt z ustawień: 'on' / 'off' albo jak jakość (def)
		fxOn(k, def) {
			const v = this.fx && this.fx[k];
			return v === 'on' ? true : v === 'off' ? false : !!def;
		}

		resize(hudH) {
			const w = window.innerWidth, h = Math.max(120, window.innerHeight - hudH);
			if (w === this.size.w && h === this.size.h) return;
			this.size = { w, h };
			const pr = Math.min(window.devicePixelRatio || 1, this.quality.pr) * this.renderOpts.scale;
			this.gl.setPixelRatio(pr);
			this.gl.setSize(w, h, true);
			// (TAA – tylko WebGPU z efektami; w WebGL i bez efektów jak FXAA / MSAA)
			this.post.setSize(w * pr, h * pr, this.renderOpts.aa ? this.quality.msaa : 0, !!(NS.gpu && this.renderOpts.aa && this.renderOpts.taa));
			if (this.skyGpu) this.skyGpu.setSize(w * pr, h * pr);
			// bufory efektów nowego rozmiaru – paczki rysowania od nowa już w tej klatce (tekstura bufora AO w materiałach)
			if (NS.gpu) {
				this.scene.traverse((o) => { if (o.isBundleGroup) o.needsUpdate = true; });
				this.postVer = this.post.version;
				this.rebundle(3);
			}
			this.camera.aspect = w / h;
			this.camera.updateProjectionMatrix();
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			this.mini.width = Math.round(w * dpr);
			this.mini.height = Math.round(64 * dpr);
			this.mini.style.width = w + 'px';
			this.mini.style.height = '64px';
			this.mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		/* materiały z teksturami z plików (nodes.js pbrSet – teren, drogi, perony, ściany, dachy): po wczytaniu lub zmianie tekstur przebudowa
		   ich shaderów i nagrań paczek. Sama podmiana tekstury w węźle nie docierała do powiązań obiektów w paczkach
		   (BundleGroup – odświeżenie współdzielone, scene.js gpuInit): zostawała tekstura zastępcza 1×1 (szara,
		   jednolita trawa i perony bez płyt) */
		rebuildTextured() {
			const seen = new Set();
			const mark = (m) => {
				if (!m || seen.has(m) || !(['ground', 'platform', 'road', 'roof'].includes(m.patchVariant) || (m.patchOpt && m.patchOpt.wall))) return;
				seen.add(m);
				m.needsUpdate = true;
			};
			for (const m of NS.util.allMaterials) mark(m);
			this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mark); });
			this.rebundleFrames = Math.max(this.rebundleFrames || 0, 2);
		}

		/* światło odbite od ziemi (dolna półkula mapy otoczenia i HemisphereLight): średni kolor terenu wokół kamery
		   (25 punktów do 160 m w bok, ±120 m wzdłuż trasy – world.terrainColor: łąki, pola, las, zabudowa z danych) razy
		   natężenie padające na ziemię – słońce (księżyc) wg wysokości, 80% (cienie) i niebo. Dawniej stała część koloru
		   terenu, kilka razy za ciemna względem słońca: spody wiat, wagonów, gzymsów i liści w cieniu – czarne */
		envGround(sim, hemiBase) {
			const A = this.envAlbedo || (this.envAlbedo = new T.Color());
			const s0 = this.free && this.free.s !== undefined ? this.free.s : sim.st.pos;
			let r = 0, g = 0, b = 0, n = 0;
			try {
				for (const ds of [-120, -60, 0, 60, 120]) for (const d of [-160, -70, 0, 70, 160]) {
					const c = this.world.terrainColor(s0 + ds, d, 0);
					r += c.r; g += c.g; b += c.b; n++;
				}
			} catch (err) {
				n = 0;
			}
			if (n) A.setRGB(r / n, g / n, b / n);
			else A.set('#3a4a2a');
				const sI = this.sun.intensity * Math.max(0, this.lightDir.y) * 0.8, S = this.sun.color, H = this.hemi.color;
			const G = this.env.ground;
			G.setRGB(S.r * sI + H.r * hemiBase, S.g * sI + H.g * hemiBase, S.b * sI + H.b * hemiBase).multiply(A);
			// (półkula: kolor razy natężenie światła = natężenie odbite; mapa otoczenia – ta sama jasność co niebo w niej)
			this.hemi.groundColor.copy(G).multiplyScalar(1 / Math.max(0.05, hemiBase));
			G.copy(this.hemi.groundColor);
			return G;
		}

		// over – { shadow, water, tex }: 'auto' (jak jakość) albo low / medium / high (tex – także off)
		setQuality(key, over = {}) {
			const q = QUALITY[key] || QUALITY.medium;
			const qk = QUALITY[key] ? key : 'medium';
			const sk = SHADOWQ[over.shadow] ? over.shadow : qk, wk = WATERQ[over.water] ? over.water : qk;
			this.waterQ = WATERQ[wk];
			/* tekstury z plików (textures.js): „jak jakość” – w aplikacji desktopowej wg jakości ogólnej, w przeglądarce
			   najwyżej niska (pobieranie przez sieć); wczytywanie w tle – texReady (świat buduje się z tym, co jest) */
			const TQ = NS.textures && NS.textures.TEXQ, desk = !!window.desktop || /Electron/i.test(navigator.userAgent);
			const tk = TQ && TQ[over.tex] !== undefined ? over.tex : desk ? qk : qk === 'low' ? 'off' : 'low';
			if (NS.textures && tk !== this.texKey) {
				this.texKey = tk;
				this.texReady = (NS.gpu && !this.gl.hasInitialized() ? this.gpuInit : Promise.resolve())
					.then(() => NS.textures.load(this.gl, tk))
					.then((r) => {
						// materiały WebGPU (nodes.js): podmiana tekstur w gotowych shaderach; WebGL – na razie bez tekstur z plików
						if (NS.gpu && NS.nodes && NS.nodes.bindTextures && this.texKey === tk) {
							NS.nodes.bindTextures();
							this.rebuildTextured();
						}
						return r;
					});
			}
			if (NS.waterUniforms) NS.waterUniforms.uWQ.value = this.waterQ.wq;
			/* nowe efekty (ustawienia): odbicia ekranowe i okluzja – 'auto' (jak jakość) / 'on' / 'off', w locie; drzewa
			   z modeli i rośliny przyziemne z obiektami z mapy – przebudowa świata (fxKey) */
			this.fx = { ssr: over.ssr || 'auto', ao: over.ao || 'auto' };
			/* domyślnie (auto) wg jakości – pomiar (Mosina, kamera nieruchoma): drzewa z modeli ok. −17% FPS, rośliny i obiekty
			   z mapy −7…10%; wysoka – pełne modele i rośliny, średnia – modele uproszczone (wersja z daleka także blisko) bez
			   roślin, niska – proste korony bez roślin */
			const trees = over.trees && over.trees !== 'auto' ? over.trees : { high: 'models', medium: 'lite', low: 'simple' }[qk];
			const plants = over.plants && over.plants !== 'auto' ? over.plants === 'on' : qk === 'high';
			NS.World.opt.ezTrees = trees !== 'simple';
			this.world.treeLite = trees === 'lite';
			this.world.plants = plants;
			const fxKey = trees + '|' + plants;
			const fxChanged = this.fxKey !== undefined && this.fxKey !== fxKey;
			this.fxKey = fxKey;
			/* włączenie / wyłączenie odbicia wody też z pełnym odświeżeniem (WebGPU: po przebudowie świata bez odbicia
			   w shaderze woda zostawała bez odbicia do następnej przebudowy przy włączonym) */
			if (this.quality === q && this.shadowKey === sk && this.waterReflKey === this.waterQ.refl && !fxChanged) return;
			this.waterReflKey = this.waterQ.refl;
			this.shadowKey = sk;
			this.shadowQ = SHADOWQ[sk];
			this.quality = q;
			this.gl.toneMapping = q.post ? T.NoToneMapping : T.ACESFilmicToneMapping;
			// WebGPU z efektami: wykończenie zapisuje gotowe sRGB – bez konwersji renderera (płótno bez bufora pośredniego)
			if (NS.gpu) this.gl.outputColorSpace = q.post ? T.LinearSRGBColorSpace : T.SRGBColorSpace;
			const sq = this.shadowQ;
			this.cascades.forEach((l, k) => {
				// dwie bliższe kaskady w pełnej rozdzielczości jakości cieni (pociąg i otoczenie przy nim), najdalsza do 2048
				const n = k < 2 ? sq.size : Math.min(2048, sq.size);
				l.shadow.mapSize.set(n, n);
				l.shadow.radius = sq.radius[Math.min(k, sq.radius.length - 1)]; // miękkie krawędzie (PCF), dalej szersze
				// (WebGPU: mapę trzyma ShadowNode i sam zmienia jej rozmiar – zniszczona psuła wszystkie materiały z cieniami)
				if (l.shadow.map && !NS.gpu) {
					l.shadow.map.dispose();
					l.shadow.map = null;
				}
			});
			this.world.density = q.density;
			this.world.detail = q.range;
			// obiekty świata rzucają cień na każdej jakości cieni – na niskiej tylko najbliższe (zasięg × 0,35)
			this.world.shadows = true;
			this.world.shadowFarK = sq.far;
			this.world.terrainShadows = sq.terrain;
			this.weather.setQuality(q.particles);
			this.size = { w: 0, h: 0 };
			/* tone mapping jest wkompilowany w shadery – przekompiluj materiały (WebGL). WebGPU: bez – przy włączeniu albo
			   wyłączeniu efektów zmienia się bufor docelowy (inny kontekst w kluczu shadera, nowe shadery powstają same),
			   a między średnią i wysoką tone mapping się nie zmienia; przebudowa wszystkich (także nieba i chmur, rysowanych
			   na ekranie przeładowania) dawała kilkusekundową klatkę */
			if (!NS.gpu) {
				for (const m of NS.util.allMaterials) m.needsUpdate = true;
				this.scene.traverse((o) => {
					const m = o.material;
					if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; });
				});
			}
			if (this.world.route) this.world.setRoute(this.world.route);
			// WebGPU: mapy cieni nowego rozmiaru (ShadowNode tworzy tekstury od nowa) – wszystkie kaskady i paczki od nowa
			if (NS.gpu) {
				for (const l of this.cascades) l.shadowPlaced = false;
				this.rebundle(6);
				// odbicie wody rysowane w pierwszych klatkach po przebudowie także bez wody w kadrze (water.js render – force)
				if (this.waterRefl) this.waterRefl.force = 8;
			}
		}

		/* WebGPU: paczki (BundleGroup) nagrane od nowa przez n kolejnych klatek – nagrane polecenia trzymają powiązania
		   z teksturami i stanami z chwili nagrania (mapa cieni sprzed zmiany rozmiaru, stan po kompilacji); po zmianie jakości
		   i po kompilacji (precompile – paczki na chwilę jako zwykłe grupy) świeże nagranie (zniszczona tekstura mapy cieni,
		   cienie „miniatury” z nieaktualnej mapy) */
		rebundle(n = 2) {
			this.rebundleFrames = Math.max(this.rebundleFrames || 0, n);
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
				if (NS.gpu) {
					const b = this.gl.backend, i = b && b.device && b.device.adapterInfo;
					return (b && b.isWebGPUBackend ? 'WebGPU' : 'WebGL 2 (WebGPURenderer)') + (i ? ': ' + (i.description || [i.vendor, i.architecture].filter(Boolean).join(' ')) : '');
				}
				const gl = this.gl.getContext();
				const ext = gl.getExtension('WEBGL_debug_renderer_info');
				return 'WebGL: ' + (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
			} catch (e) {
				return '';
			}
		}

		// slow – zmiana w trakcie jazdy (zdarzenie trasy): przejście ok. 30 s; z pauzy – szybko (ok. 2 s)
		setWeather(key, slow) {
			this.weatherKey = key;
			if (this.routeId) this.weather.set(key, this.routeId.replace(/@\d+$/, ''), false, slow);
		}

		/* zmiana pory roku w trakcie jazdy (pauza): sam świat od nowa (roślinność, liście, śnieg) – pociąg, kabina i ruch bez
		   zmian; kawałki budują się w tle (main.js – w pauzie bez limitu czasu na klatkę) */
		reseason(sim) {
			const season = (sim.opts && sim.opts.season) || 'summer';
			this.world.season = season;
			this.world.leafPatches = sim.leaves || [];
			this.world.leafKey = JSON.stringify(sim.leaves || []);
			this.world.setRoute(sim.route);
			this.world.warm = true;
			this.weather.setSeason(season);
		}

		reset(sim) {
			// pora roku (kolory roślinności, liście) – inna niż przy budowie świata: świat od nowa
			const season = (sim.opts && sim.opts.season) || 'summer';
			const leaves = JSON.stringify(sim.leaves || []);
			/* świat od nowa także przy innej stacji początkowej (route.from): semafory i stacje świata odwołują się do list
			   trasy po numerach, a przycięta trasa ma ich mniej (dawniej: błąd „sig.code” i gra się nie wczytywała) */
			const rKey = sim.route.id + '@' + (sim.route.from || 0);
			if (this.routeId !== rKey || !this.world.route || this.world.season !== season || this.world.leafKey !== leaves) {
				this.world.season = season;
				this.world.leafPatches = sim.leaves || [];
				this.world.leafKey = leaves;
				this.world.setRoute(sim.route);
				this.routeId = rKey;
			} else this.world.warm = true;
			this.weather.setSeason(season);
			this.horizon.setRoute(sim.route);
			if (this.trainModel) this.trainModel.dispose();
			this.trainModel = new NS.TrainModel(this.scene, sim.train, { shadows: true, player: true, destination: sim.route.stations[sim.route.stations.length - 1].name });
			if (this.cab) this.cab.dispose();
			this.cab = new NS.CabInterior(this.trainModel);
			this.cab.limitLights(this.scene);
			this.life.reset(sim.route, { shadows: (this.shadowQ || SHADOWQ.medium).size >= 2048 });
			this.life.prewarm(sim); // modele pociągów tła na ekranie wczytywania (pula)
			/* trasa rzeczywista: pociągi z przeciwka po prawdziwym torze z mapy (nie po torze z gry); linia jednotorowa
			   (route.single): na odcinku jednotorowym – po torze pociągu gracza, na mijance – po torze bocznym, przejście
			   przy rozjeździe (R.laneWeight) */
			const rt = sim.route, lane = (s) => this.world.envLaneAt(s);
			const laneY = (s) => this.world.envTrackY(s, this.world.envLaneAt(s), false, false) - R.heightAt(rt, s);
			this.life.laneRaw = this.life.laneRawY = null;
			if (!this.world.env) this.life.lane = this.life.laneY = null;
			else if (!rt.single) {
				/* linia dwutorowa: tam, gdzie w danych brakuje toru z przeciwka (przerwa w mapie, głowica stacji) – najbliższy
				   rozpoznany do 300 m albo 4,5 m od osi (envLaneNear); dawniej pociąg z przeciwka znikał wtedy cały i nagle
				   wracał. laneRaw – sam tor z mapy (losowy pociąg z przeciwka bez ruchu na linii) */
				const near = (s) => this.world.envLaneNear(s);
				this.life.laneRaw = lane;
				this.life.laneRawY = laneY;
				this.life.lane = (s) => { const d = lane(s); return Number.isNaN(d) ? near(s) : d; };
				this.life.laneY = (s) => { const y = Number.isNaN(lane(s)) ? 0 : laneY(s); return Number.isFinite(y) ? y : 0; };
			}
			else {
				this.life.laneRaw = lane;
				this.life.laneRawY = laneY;
				/* mijanka bez toru z mapy wybranego dla pociągów z przeciwka (tor urwany, odstawione wagony): najbliższy
				   wybrany tor do 300 m dalej albo 4,5 m od osi – pociąg czekający na krzyżowanie nie znika */
				const near = (s) => this.world.envLaneNear(s);
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
			// pociągi innych linii przy peronach (po torze pociągów z przeciwka – life.lane – bez torów, które się z nim schodzą)
			this.life.setLocals(this.world.env ? this.world.envLocalTracks() : []);
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
			this.weather.setTrain(this.trainModel && this.trainModel.cars, sim.st.v);
			const W = this.weather.update(dt, this.camera.position, this.focus);
			const pal = this.sky.palette(e);
			const zen = this.env.zenith.copy(pal.zenith), hor = this.env.horizon.copy(pal.horizon), sunCol = this.env.sunColor.copy(pal.sunlight);
			// błyskawica: niebo rozjaśnione chłodnym światłem
			const fl = this.weather.flash || 0;
			if (fl > 0.001) { zen.lerp(tmpC.setRGB(0.75, 0.8, 0.95), fl * 0.65); hor.lerp(tmpC.setRGB(0.8, 0.84, 0.95), fl * 0.6); }
			const dayK = smoothstep(-0.04, 0.22, e);
			const gray = this.hazeColor.copy(hor).lerp(tmpC.setRGB(0.5, 0.53, 0.57), 0.65).multiplyScalar(0.3 + 0.7 * smoothstep(-0.15, 0.3, e));
			/* pod grubą warstwą chmur (duże zachmurzenie, opad) mgła i barwa horyzontu ciemniejsze – jak niebo z chmur
			   wolumetrycznych; dawniej jasnoszara mgła dawała w oddali biały pas pod ciemnym, deszczowym niebem. Mgła
			   (pogoda „mgła” – zachmurzenie 0,6) bez zmian */
			const overK = smoothstep(0.55, 1.0, W.cover), dimK = 1 - 0.4 * overK - 0.22 * Math.min(1, W.rain);
			gray.multiplyScalar(dimK);
			/* łuna miasta nocą: wg liczby latarni w okolicy (World.updateNightMap – urban), mocniej przy zachmurzeniu, mgle
			   i opadzie (światło odbite od chmur i rozproszone w powietrzu); pomarańczowa od lamp sodowych */
			const urban = this.world.urban || 0, nightK = 1 - smoothstep(-0.12, 0.02, e);
			const glowK = urban * nightK * (0.018 + 0.05 * Math.min(1, W.cover + W.haze));
			const cityGlow = this.cityGlow || (this.cityGlow = new T.Color());
			cityGlow.setRGB(1.0, 0.56, 0.28).multiplyScalar(glowK);
			this.sky.update({ camera: this.camera, time: this.time, e, sunDir: this.sunDir, moonDir: this.moonDir, zenith: zen, horizon: hor, sunlight: sunCol, haze: W.haze, hazeColor: gray, cover: W.cover, cityGlow, urban: urban * nightK });
			this.sky.clouds(this.time, W.shadow * clamp01((e + 0.02) / 0.15));
			if (this.skyGpu && this.gl.hasInitialized()) {
				const cover = this.coverC || (this.coverC = new T.Color());
				cover.copy(hor).lerp(gray, 0.5).multiplyScalar(1.1 * dimK); // (chmury biorą barwę horyzontu – o zachodzie ciepłe)
				// tło mgły nocą (jak mgła WebGL: horyzont i zenit z palety), tylko w pełnej nocy – o zmierzchu barwi atmosfera
				const fogNight = this.fogNightC || (this.fogNightC = new T.Color());
				fogNight.copy(hor).lerp(zen, 0.45).multiplyScalar(1 - smoothstep(-0.12, -0.02, e));
				this.skyGpu.update({ dt, sunDir: this.sunDir, moonDir: this.moonDir, clock: sim.route.startClock + sim.time, season: this.world.season, camera: this.camera, haze: W.haze, cover: W.cover, rain: W.rain, snow: W.snow, lightning: W.lightning, flash: fl, coverColor: cover, hazeColor: gray, cityGlow, fogNight, fog: { near: W.fogNear, far: W.fogFar } });
			}
			if (!NS.gpu) this.sky.renderClouds(this.gl, this.time); // panorama chmur wolumetrycznych (co ok. 0,4 s)

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
			if (!this.envAlbedo) this.hemi.groundColor.setRGB(0.16, 0.19, 0.11).multiplyScalar(0.3 + dayK); // (dalej – envGround)
			// światło otoczenia dzielone między półkulę i odbicia nieba (razem dawały płaski, wyblakły obraz)
			const hemiBase = (0.3 + 0.78 * smoothstep(-0.2, 0.3, e)) * (0.8 + 0.2 * W.sun);
			this.hemi.intensity = hemiBase + fl * 2.6;
			this.scene.environmentIntensity = 0.3 + 0.45 * dayK + fl * 0.5;
			// korekta barw: chłodne cienie, ciepłe światła (złota godzina – cieplej), nocą chłodniej i mniej nasycenia
			const golden = dayK * (1 - smoothstep(0.12, 0.35, e)) * W.sun, night = 1 - dayK;
			this.grade.lightTint.setRGB(1.035, 1.0, 0.95).lerp(tmpC.setRGB(1.09, 0.99, 0.86), golden * 0.6).lerp(tmpC.setRGB(0.97, 1.0, 1.06), night);
			this.grade.shadowTint.setRGB(0.95, 0.98, 1.05).lerp(tmpC.setRGB(0.86, 0.94, 1.14), night);
			this.grade.saturation = (1.1 - 0.14 * W.haze) * (1 - 0.18 * night) * (1 + golden * 0.1);

			const fog = this.scene.fog;
			// o zmierzchu mgła chłodnieje (zamiast przejmować pomarańcz zachodu)
			fog.color.copy(hor).lerp(zen, 0.45 * (1 - dayK)).lerp(gray, Math.min(1, 0.25 + W.haze));
			// nocą w mieście mgła i oddal w ciepłej poświacie
			fog.color.r += cityGlow.r * 0.6; fog.color.g += cityGlow.g * 0.6; fog.color.b += cityGlow.b * 0.6;
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

			/* odbicia nieba i światło otoczenia z mapy (lakier, szyby, szyny, woda, mokra ziemia, oświetlenie rozproszone):
			   co 2 s, o świcie i zmierzchu co 0,5 s (płynne przejście zamiast skoków). Niebo szarzeje z zachmurzeniem
			   (dawniej tylko z zamgleniem – pod pełnym zachmurzeniem odbicia i cienie były niebieskie jak przy czystym niebie);
			   dolna półkula – oświetlony teren wokół kamery (envGround), nie stała zieleń */
			this.envT -= dt;
			if (this.envT <= 0 || !this.scene.environment) {
				this.envT = Math.abs(e) < 0.25 ? 0.5 : 2;
				this.env.sunDir.copy(this.sunDir);
				const ovK = smoothstep(0.3, 1.0, W.cover) * 0.85;
				const cloudC = tmpC.copy(hor).lerp(gray, 0.5).multiplyScalar(1.1 * dimK);
				const ground = this.envGround(sim, hemiBase);
				const env = {
					zenith: zen.clone().lerp(gray, W.haze).lerp(cloudC, ovK),
					horizon: hor.clone().lerp(gray, W.haze).lerp(cloudC, ovK * 0.8),
					ground,
					sunDir: this.sunDir,
					sunColor: sunCol.clone().multiplyScalar(dayK * W.sun),
				};
				const tex = this.envGpu ? this.envGpu(env) : this.post.environment(env);
				if (tex) this.scene.environment = tex;
			}
			this.horizon.update(this.camera, this.focus.y - 3, fog.color, 0.25 + 0.75 * dayK, W.haze, this.free ? this.free.s : sim.st.pos);
			// słońce: promienie i flara; księżyc: poświata
			/* widok z kabiny: słońce zasłonięte, gdy promień od oka w jego stronę trafia w pudło kabiny (ściana, dach – nie
			   szyba); sprawdzane co 4 klatki. Dawniej flara świeciła przez dach jak okrągła lampa na suficie. */
			let sunBlocked = false;
			if (this.camMode === 'cab' && this.cab && this.cab.group.visible) {
				if (!this.sunRay) { this.sunRay = new T.Raycaster(); this.sunRay.far = 6; this.sunBlockedN = 0; }
				if (this.sunBlockedN++ % 4 === 0) {
					this.sunRay.set(this.camera.getWorldPosition(this.sunRayO || (this.sunRayO = new T.Vector3())), this.sunDir);
					this.sunRay.camera = this.camera; // w grupie pojazdu są też sprite'y (światła)
					let hit = false;
					try {
						const occ = this.sunOccluder(this.cab.car);
						if (occ) {
							const mw = this.cab.car.group.matrixWorld;
							for (const c of occ.children) c.matrixWorld.copy(mw);
							hit = this.sunRay.intersectObjects(occ.children, false).length > 0;
						}
					} catch (err) { hit = false; }
					this.sunBlockedV = hit;
				}
				sunBlocked = this.sunBlockedV;
			}
			this.sunFx.update({ camera: this.camera, imageRays: true, sunDir: this.sunDir, sunColor: sunCol, e, haze: W.haze, mist: W.haze * 0.5, focus: { x: this.focus.x, y: this.focus.z }, span: 700, blocked: sunBlocked });
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

		/* Zasłona słońca w kabinie: nieprzezroczyste trójkąty wagonu (pudło, wnętrze kabiny – bez szyb) do 6,5 m od oka
		   (promień sięga 6 m), zebrane raz w układzie wagonu – promień do słońca sprawdzany tylko na nich (dawniej na całym wagonie: setki tysięcy
		   trójkątów, ok. 7 ms co 4. klatkę). Od nowa przy innym wagonie z kabiną, przebudowie kabiny albo przesunięciu
		   oka o ponad 2,5 m (zebrane w czasie przejścia kamery do kabiny – puste). */
		// kamera we wnętrzu tunelu trasy z mapy (pod stropem obudowy)
		/* kamera zewnętrzna (za pociągiem, z boku, przy torze, przy wózku), gdy pociąg jest w tunelu: wewnątrz obudowy –
		   między ścianami i pod stropem (dawniej trzymała się 1,5 m nad terenem, czyli nad ulicą nad tunelem), skierowana
		   na pociąg. Położenie kamery na trasie (s, d) – rzut na oś toru (kilka kroków po stycznej). */
		tunnelClamp(sim, mode) {
			const w = this.world, route = sim.route, cam = this.camera.position;
			if (!w || !w.freeTunnel || !route.tunnels || !route.tunnels.length) return;
			const front = sim.st.pos, tail = front - sim.L;
			if (!route.tunnels.some((t) => front > t.from + 5 && tail < t.to - 5)) return;
			const t = this.tcp || (this.tcp = {});
			let s = front - sim.L / 2;
			for (let i = 0; i < 6; i++) {
				R.trackPoint(route, s, t);
				s += (cam.x - t.x) * Math.sin(t.heading) - (cam.z - t.z) * Math.cos(t.heading);
			}
			R.trackPoint(route, s, t);
			const d = (cam.x - t.x) * Math.cos(t.heading) + (cam.z - t.z) * Math.sin(t.heading);
			let box = w.freeTunnel(s, -Infinity);
			if (!box) return;
			const dc = Math.max(box.l, Math.min(box.r, d));
			// z boku: odległość ucięta przez ścianę przenosi się wzdłuż składu (widok ukośny zamiast dachu tuż przed kamerą)
			if (mode === 'side' && dc !== d) {
				const s2 = s + Math.min(25, (Math.abs(d) - Math.abs(dc)) * 0.8);
				const b2 = w.freeTunnel(s2, -Infinity);
				if (b2) { s = s2; box = b2; }
			}
			const y = mode === 'trackside' ? box.floor + 1.7 : mode === 'side' ? Math.max(box.floor + 1.2, Math.min(box.floor + 3.2, cam.y)) : Math.max(box.floor + 0.3, Math.min(box.ceil - 0.2, cam.y));
			if (dc === d && y === cam.y) return;
			R.sidePoint(route, s, Math.max(box.l, Math.min(box.r, dc)), t);
			cam.set(t.x, y, t.z);
			const f = this.focus;
			this.camera.lookAt(f.x, f.y + (mode === 'bogie' ? 0 : 1.8), f.z);
		}

		camInTunnel(sim) {
			const w = this.world;
			if (!w || !w.freeTunnel || !sim) return false;
			const s = this.free ? this.free.s : sim.st.pos;
			return !!w.freeTunnel(s, this.camera.position.y);
		}

		sunOccluder(car) {
			if (!car) return null;
			const key = this.cab ? this.cab.group.children.length : -1;
			car.group.updateMatrixWorld(true);
			const inv = new T.Matrix4().copy(car.group.matrixWorld).invert(), M = new T.Matrix4();
			const eye = this.camera.getWorldPosition(new T.Vector3()).applyMatrix4(inv);
			// ta sama kabina i oko w pobliżu miejsca zbierania (przejście kamery do kabiny, rozglądanie się) – bez zmian
			const O = this.sunOcc;
			if (O && O.car === car && O.key === key && O.eye.distanceTo(eye) < 2.5) return O.mesh;
			if (O && O.mesh) for (const c of O.mesh.children) c.geometry.dispose();
			this.sunOcc = { car, key, eye, mesh: null };
			// trójkąty w kostkach 1,5 m (każda – osobna siatka ze sferą ograniczającą: promień sprawdza tylko kostki na drodze)
			const v = [new T.Vector3(), new T.Vector3(), new T.Vector3()], cells = new Map();
			car.group.traverse((o) => {
				if (!o.isMesh || o.isInstancedMesh || o.userData.shadowProxy || !o.geometry.attributes.position) return;
				for (let p = o; p && p !== car.group; p = p.parent) if (!p.visible) return;
				const g = o.geometry, P = g.attributes.position, idx = g.index, mats = Array.isArray(o.material) ? o.material : null;
				const groups = mats && g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : P.count, materialIndex: 0 }];
				M.multiplyMatrices(inv, o.matrixWorld);
				for (const gr of groups) {
					const m = mats ? mats[gr.materialIndex] : o.material;
					if (!m || m.visible === false || (m.transparent && m.opacity < 0.5)) continue;
					const end = Math.min(gr.start + gr.count, idx ? idx.count : P.count);
					for (let i = gr.start; i + 2 < end; i += 3) {
						for (let j = 0; j < 3; j++) v[j].fromBufferAttribute(P, idx ? idx.getX(i + j) : i + j).applyMatrix4(M);
						if (Math.min(v[0].distanceTo(eye), v[1].distanceTo(eye), v[2].distanceTo(eye)) > 6.5) continue;
						const ck = [0, 1, 2].map((a) => Math.floor((v[0].getComponent(a) + v[1].getComponent(a) + v[2].getComponent(a)) / 4.5)).join(',');
						let pos = cells.get(ck);
						if (!pos) cells.set(ck, (pos = []));
						pos.push(v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z);
					}
				}
			});
			if (!cells.size) return null;
			const mat = this.sunOccMat || (this.sunOccMat = new T.MeshBasicMaterial({ side: T.DoubleSide }));
			const grp = new T.Group();
			grp.matrixAutoUpdate = false;
			for (const pos of cells.values()) {
				const geo = new T.BufferGeometry();
				geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
				geo.computeBoundingSphere();
				const m = new T.Mesh(geo, mat);
				m.matrixAutoUpdate = false;
				grp.add(m);
			}
			this.sunOcc.mesh = grp;
			return grp;
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

		/* Ujęcia kolejowe w tle menu (menuCam – main.js): co 9–12 s nowy kadr; przy stacji – widok z peronu (cinemaShot),
		   poza nią na zmianę: przejazd obok kamery stojącej przy torze, ujęcie z boku z wysoka okrążające skład, kamera
		   nisko przed czołem (pociąg „na” widza), widok z góry jak z wiaduktu na nadjeżdżający pociąg. Kamera nie schodzi
		   pod teren. */
		menuShot(sim, dt) {
			const route = sim.route, front = sim.st.pos, tp = this.tp, W = this.world, M = this.menuCamState || (this.menuCamState = { k: -1, t: 0, len: 0, a: 0 });
			const SHOTS = ['pass', 'orbit', 'front', 'bridge'];
			M.t += dt;
			const y = (s, d, h) => { R.sidePoint(route, s, d, tp); return Math.max(tp.y, W.terrainY ? W.terrainY(s, d) : tp.y) + h; };
			// nowe ujęcie po czasie albo gdy pociąg minął kamerę stojącą
			if (!M.shot || M.t > M.len || (M.shot === 'pass' && front - sim.L > M.s + 25) || (M.shot === 'bridge' && front > M.s - 8)) {
				M.k = (M.k + 1) % SHOTS.length;
				M.shot = SHOTS[M.k];
				M.t = 0;
				M.len = 9 + Math.random() * 3;
				M.side = Math.random() < 0.5 ? -1 : 1;
				M.s = front + (M.shot === 'pass' ? 70 + sim.st.v * 3 : M.shot === 'bridge' ? 140 + sim.st.v * 4 : 0);
				M.a = Math.random() * Math.PI * 2;
			}
			// stacja w pobliżu – widok z peronu (jak tryb „cinema”)
			if (this.cinemaShot(sim)) return;
			const mid = front - sim.L / 2;
			let cs, cd, ch, ls, ld, lh;
			if (M.shot === 'pass') { cs = M.s; cd = M.side * 7; ch = 1.7; ls = front - 6; ld = 0; lh = 2.2; }
			else if (M.shot === 'orbit') { M.a += dt * 0.12; const r = 26; cs = mid + Math.cos(M.a) * r; cd = Math.sin(M.a) * r; ch = 11 + Math.sin(M.t * 0.3) * 2; ls = mid; ld = 0; lh = 1.8; }
			else if (M.shot === 'front') { cs = front + 14 + Math.sin(M.t * 0.25) * 2; cd = M.side * 3.2; ch = 1.3; ls = front - 18; ld = 0; lh = 2.4; }
			else { cs = M.s; cd = M.side * 2; ch = 11; ls = front - 10; ld = 0; lh = 1.5; }
			const cy = y(cs, cd, ch);
			R.sidePoint(route, cs, cd, tp);
			this.camera.position.set(tp.x, cy, tp.z);
			R.sidePoint(route, ls, ld, tp);
			this.camera.lookAt(tp.x, tp.y + lh, tp.z);
			this.focus.set(tp.x, tp.y, tp.z);
		}

		setNear(n) {
			if (this.camera.near !== n) {
				this.camera.near = n;
				this.camera.updateProjectionMatrix();
			}
		}

		updateCamera(sim, dt) {
			if (this.free) return this.freeUpdate(sim, dt); // swobodna kamera (js/3d/freecam.js)
			if (this.menuCam) return this.menuShot(sim, dt); // tło menu: ujęcia kolejowe
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
			if (mode === 'follow' || mode === 'side' || mode === 'trackside' || mode === 'bogie') this.tunnelClamp(sim, mode);
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
				// w tunelu podłoże to poziom toru (teren nad tunelem to ulica)
				const inTun = this.world.freeTunnel && this.world.freeTunnel(s0, -Infinity);
				cam.position.y = Math.max(cam.position.y, (inTun ? R.heightAt(route, s0) : this.world.terrainY(s0, 0)) + 0.25);
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
				/* dalsze kaskady odświeżane na zmianę (co drugą klatkę każda) – w klatce rysują się dwie mapy cieni; najdalsza
				   (szeroka, mało szczegółów) – co czwartą klatkę. Kaskada bez odświeżenia w tej klatce zostaje tam, gdzie była
				   przy rysowaniu mapy (położenie, cel, zasięg): macierz cienia (WebGPU – liczona co klatkę z położenia światła,
				   nodes.js setupCascades) musi pasować do zawartości mapy, inaczej cienie z poprzedniego położenia lub zasięgu
				   lądowały przesunięte i pomniejszone (np. „miniatura” sieci trakcyjnej, peronu i wózków na ziemi) */
				/* najbliższa kaskada co klatkę, ale raz – przy autoUpdate mapa rysowała się od nowa dla każdej kamery tej
				   klatki (gracza i odbicia wody), z tym samym wynikiem */
				let upd = true;
				if (i > 0) {
					const every = i === n - 1 && n > 2 ? 4 : 2;
					upd = this.csmFrame % every === i % every || this.csmFrame < 3 || !l.shadowPlaced;
					// kamera przesunęła się o ponad 4% zasięgu od ostatniego rysowania mapy – od razu (szybki lot, jazda)
					if (!upd && l.shadowAt && l.shadowAt.distanceToSquared(cam) > (l.shadow.camera.right * 0.04) ** 2) upd = true;
				}
				l.shadow.autoUpdate = false;
				if (upd) l.shadow.needsUpdate = true;
				if (!upd) return;
				l.shadowPlaced = true;
				(l.shadowAt || (l.shadowAt = new T.Vector3())).copy(cam);
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
			// szron na szybach kabiny: zimą, późną jesienią nocą (przymrozek)
			const season = this.world.season || 'summer';
			this.trainModel.frostTarget = season === 'winter' ? 1 : season === 'autumn' && this.dark > 0.5 ? 0.4 : 0;
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
			this.life.listener = this.camera.position; // słuchacz zapowiedzi na peronach (pociągi podmiejskie)
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
			// szyny min. 1 piksel (world.js railPxMat): rozmiar piksela na metr odległości
			const RU = NS.World && NS.World.RAIL_U;
			if (RU) {
				// wysokość bufora rysowania (px), nie mniej niż pół wysokości okna (płótno zgłaszające za mały rozmiar – szerokie pasy)
				RU.uRailPxK.value = (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(this.gl.domElement.height, (window.innerHeight * (window.devicePixelRatio || 1)) / 2, 1);
			}
			// odbicie wody (przed klatką): bez opadów, flary i wnętrza kabiny; rozdzielczość wg jakości
			if (this.waterRefl && !this.hold) {
				const wv = (this.W && this.W.wind) || 0.4;
				this.waterWind.set(0.8 * wv, 0.35 * wv);
				const wt = this.weather;
				this.waterRefl.player = this.trainModel; // (pociąg gracza w odbiciu tylko przy wodzie – water.js)
				this.waterRefl.update(this.scene, this.camera, this.scene, this.time, this.waterWind, [wt.rain, wt.rainNear, wt.snow, wt.splash, wt.leaves, this.cab && this.cab.group].concat(this.sunFx.objects || []), q.post ? (q.atmo ? 0.6 : 0.5) : 0.35, !(this.waterQ || WATERQ.medium).refl);
			}
			// WebGPU: rysowanie po init(); wspólne uniformy materiałów węzłowych raz na klatkę; macierze świata raz na klatkę
			// (WebGPURenderer liczy je przy każdym render() – też dla każdej mapy cieni i przebiegów efektów)
			const gpuReady = !NS.gpu || this.gl.hasInitialized(), gpuOk = gpuReady && !this.hold;
			// drzewa z modeli: impostory dalekich lasów wypalane raz, w tle, od pierwszej klatki z gotową kartą (trees.js)
			if (NS.gpu && gpuReady && NS.trees && NS.World.opt.ezTrees !== false) NS.trees.bake(this.gl);
			// chmury wolumetryczne z kamerą tej klatki – także przy wstrzymanym rysowaniu (hold): ich bufory (cień chmur
			// w materiałach) muszą powstać jako bufory docelowe przed compileAsync, inaczej Three tworzy je jako zwykłe
			// tekstury, a pierwsze rysowanie do nich niszczy je pod związanymi już materiałami
			if (NS.gpu && gpuReady && this.skyGpu) this.skyGpu.renderClouds(this.camera);
			if (NS.gpu && gpuOk) {
				NS.nodes.sync();
				this.scene.updateMatrixWorld();
				this.scene.matrixWorldAutoUpdate = false;
				// odbicie wody osobnym render() przed klatką – nie zagnieżdżone w głównym przebiegu (water.js render)
				if (this.waterRefl && this.waterRefl.render) this.waterRefl.render(this.gl, this.scene, this.camera);
			}
			if (!gpuOk) {
				// (karta jeszcze niegotowa – klatka bez rysowania)
			} else if (this.usePost) {
				const W = this.W;
				/* promienie słońca: najmocniej nisko nad horyzontem; przy wysokim słońcu 30% (smugi w prześwitach chmur – maska
				   z jasności nieba w obrazie, post-gpu.js; dawniej powyżej ok. 33° wcale) */
				const rays = this.e > 0 ? 0.4 * (1 - W.haze) * W.sun * (0.3 + 0.7 * (1 - smoothstep(0.25, 0.55, this.e))) : 0;
				this.post.render(this.scene, this.camera, {
					sharpen: this.renderOpts.sharpen ?? 0.35, // wyostrzanie po wygładzaniu (ustawienia)
					bloom: q.bloom,
					bloomStrength: 0.5,
					/* AO w każdym widoku z zewnątrz, niezależnie od wysokości kamery – wcześniej tylko w widoku z góry
					   (kamera ponad 12 m nad pociągiem), bo przy płaskim spojrzeniu przyciemniało rozległe płaszczyzny;
					   po zejściu kamery cieniowanie nagle słabło. Płaskie spojrzenie wygasza teraz shader AO (post.js);
					   w kabinie bez AO (wnętrze widziane z bliska). */
					// w tunelu (trasa z mapy) bez AO: w zamkniętej obudowie zaciemniało strop i ściany do czerni
					/* okluzja otoczenia: podstawy budynków, pod drzewami i wiaduktami, skarpy, między wagonami; w kabinie bez jej
					   wnętrza (aoNear – pierwsze 3,5 m od kamery), dawniej w widoku z kabiny wyłączona; w tunelu – bez */
					ao: this.fxOn('ao', q.ao) && !this.camInTunnel(sim),
					aoNear: this.viewMode === 'cab' ? 3.5 : 0,
					aoRadius: 2.8,
					aoStrength: 1.6,
					aoFade: 140,
					// odbicia ekranowe (jakość wysoka, WebGPU) – mokre nawierzchnie, szyby, gładki metal
					ssr: this.fxOn('ssr', !!q.ssr),
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
				if (NS.gpu) this.post.idle();
				this.gl.toneMappingExposure = exposure;
				this.gl.setRenderTarget(null);
				this.gl.render(this.scene, this.camera);
			}
			if (NS.gpu) this.scene.matrixWorldAutoUpdate = true;
			if (NS.gpu && gpuOk) this.endAsyncPipelines();
			// bufory efektów przebudowane (post-gpu.js version) – paczki rysowania od nowa (powiązania z teksturą bufora AO)
			if (NS.gpu && this.post && this.post.version !== undefined && this.post.version !== this.postVer) {
				this.postVer = this.post.version;
				this.rebundle(3);
			}
			if (NS.gpu && gpuOk && this.rebundleFrames > 0) {
				this.rebundleFrames--;
				this.scene.traverse((o) => { if (o.isBundleGroup) o.needsUpdate = true; });
				if (NS.nodes && NS.nodes.refreshBindings) NS.nodes.refreshBindings(3); // (powiązania z nowymi teksturami buforów – nodes.js)
			}
			// paczki z obiektami nagranymi bez gotowego potoku: od nowa, gdy potoki gotowe (najdalej po ok. 10 s – obiekt mógł zniknąć)
			if (NS.gpu && gpuOk && this.bundleWait && this.bundleWait.size) {
				for (const [bg, w] of this.bundleWait) {
					let all = ++w.t > 600;
					if (!all) { all = true; for (const ro of w.ros) if (!this.pipeReady(ro)) { all = false; break; } }
					if (all) { bg.needsUpdate = true; this.bundleWait.delete(bg); }
				}
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
