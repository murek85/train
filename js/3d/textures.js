/* Tekstury PBR z plików (folder textures/, skany CC0 – ambientCG, Poly Haven; przygotowanie: tools/textures.py).
   Spis textures/index.json: { sets: { "<grupa>/<nazwa>": { maps: { color: 'srgb', normal: 'linear', orm: 'linear' },
   sizes: [1024, 2048], ext: 'webp' | 'ktx2', scale: <metry na kafel> } } }; plik mapy:
   textures/<grupa>/<nazwa>_<mapa>_<1k|2k>.<ext>. ORM – okluzja (R), chropowatość (G), metaliczność (B), jak w glTF.
   Jakość (ustawienie „Tekstury”, TEXQ): rozdzielczość map – największa dostępna nie większa od docelowej; wyłączone –
   bez wczytywania (materiały zostają przy wzorach proceduralnych). Brak spisu, pliku lub błąd wczytania – zestaw
   pominięty, get() zwraca null (materiał z zapasem proceduralnym), gra działa dalej.
   KTX2 (Basis Universal: kolor ETC1S, normalne i ORM UASTC) – karta dostaje format skompresowany (BC7 / ASTC / ETC2),
   ok. 4× mniej pamięci niż obraz; WebP/JPG/PNG – zwykłe tekstury z mipmapami liczonymi przy wczytaniu. */
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

(function () {
	'use strict';
	const T = THREE;
	const NS = (window.Train3D = window.Train3D || {});

	// docelowa rozdzielczość map wg jakości tekstur (0 – bez tekstur z plików)
	const TEXQ = { off: 0, low: 1024, medium: 2048, high: 2048 };
	const ROOT = 'textures/';
	const label = (n) => (n >= 1024 ? n / 1024 + 'k' : String(n));

	const st = { key: null, size: 0, sets: new Map(), loading: null, ktx: null, ktxFor: null, manifest: undefined };

	async function manifest() {
		if (st.manifest !== undefined) return st.manifest;
		try {
			const r = await fetch(ROOT + 'index.json', { cache: 'no-store' });
			st.manifest = r.ok ? await r.json() : null;
		} catch (e) {
			st.manifest = null;
		}
		return st.manifest;
	}

	// loader KTX2 dla tego renderera (wykrycie formatów karty – WebGPU po init())
	async function ktxLoader(renderer) {
		if (st.ktx && st.ktxFor === renderer) return st.ktx;
		if (st.ktx) st.ktx.dispose();
		const L = new KTX2Loader().setTranscoderPath('vendor/three/addons/libs/basis/');
		if (renderer.isWebGPURenderer) await L.detectSupportAsync(renderer);
		else L.detectSupport(renderer);
		st.ktx = L;
		st.ktxFor = renderer;
		return L;
	}

	const imageLoader = new T.TextureLoader();
	function loadImage(url) {
		return new Promise((res, rej) => imageLoader.load(url, res, undefined, rej));
	}

	async function loadMap(renderer, url, ext, kind) {
		const tex = ext === 'ktx2' ? await (await ktxLoader(renderer)).loadAsync(url) : await loadImage(url);
		tex.colorSpace = kind === 'srgb' ? T.SRGBColorSpace : T.NoColorSpace;
		tex.wrapS = tex.wrapT = T.RepeatWrapping;
		tex.anisotropy = 16;
		tex.name = url;
		tex.needsUpdate = true;
		return tex;
	}

	/* stare tekstury zwalniane dopiero po kilku sekundach: materiały WebGPU trzymają powiązanie z nimi do podmiany
	   (nodes.js bindTextures po wczytaniu nowych) – zniszczona tekstura w użyciu to błąd rysowania („Destroyed texture
	   used in a submit”) */
	function disposeLater(sets) {
		if (!sets.size) return;
		setTimeout(() => {
			for (const s of sets.values()) for (const t of Object.values(s.maps)) t.dispose();
		}, 5000);
	}

	/* wczytanie wszystkich zestawów ze spisu w rozdzielczości dla jakości key (ponowne wywołanie z tą samą jakością –
	   ta sama obietnica). Wynik: { key, size, loaded, failed } */
	function load(renderer, key) {
		const want = TEXQ[key] ?? TEXQ.medium;
		if (st.loading && st.key === key) return st.loading;
		st.key = key;
		const run = (async () => {
			const man = await manifest();
			const old = st.sets, sets = new Map();
			const out = { key, size: want, loaded: 0, failed: [] };
			const done = () => {
				if (st.key !== key) {
					disposeLater(sets); // w międzyczasie inna jakość – te nie trafią do materiałów
					return out;
				}
				st.sets = sets;
				st.size = want;
				disposeLater(old);
				return out;
			};
			if (!want || !man || !man.sets) return done();
			await Promise.all(Object.entries(man.sets).map(async ([name, def]) => {
				const sizes = (def.sizes || []).filter((n) => n <= want).sort((a, b) => b - a);
				const n = sizes[0] || Math.min(...(def.sizes || [want]));
				const ext = def.ext || 'webp';
				const maps = {};
				try {
					for (const [m, kind] of Object.entries(def.maps || {})) maps[m] = await loadMap(renderer, `${ROOT}${name}_${m}_${label(n)}.${ext}`, ext, kind);
				} catch (e) {
					for (const t of Object.values(maps)) t.dispose();
					out.failed.push(name);
					return;
				}
				sets.set(name, { maps, scale: def.scale || 2, mean: def.mean || [0.2, 0.2, 0.2], size: n });
				out.loaded++;
			}));
			if (out.failed.length) console.warn('Tekstury: nie wczytano', out.failed.join(', '));
			return done();
		})();
		st.loading = run;
		return run;
	}

	// zestaw map ({ maps: { color, normal, orm }, scale, mean – średni kolor liniowy, size }) albo null – brak pliku / tekstury wyłączone
	function get(name) {
		return st.sets.get(name) || null;
	}

	NS.textures = { TEXQ, load, get, get key() { return st.key; }, get size() { return st.size; }, get count() { return st.sets.size; } };
})();
