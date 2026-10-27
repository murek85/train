/* Modele 3D z plików (glTF / GLB, folder models/): spis models/index.json –
   { version: 1, models: { "<id>": { file: "<plik>.glb", lod: "<plik>_lo.glb" (opcjonalnie – wersja z daleka, te same
   materiały), title, author, license: "CC0 1.0" | "CC BY 4.0" | …, source: "<adres strony modelu>", variant: 'lit'
   (wariant łatki materiału – nodes.js / common.js patch; pogoda, cienie chmur, mokre powierzchnie), scale: 1,
   up: 'y', variants: { nazwa: '<wyrażenie na nazwy węzłów>' } | 'each' – kilka obiektów w jednym pliku, każdy jako
   osobny model „id:nazwa” (wyśrodkowany w x/z, podstawa na y = 0) } } }. Siatki modelu scalane wg materiału (jedna bryła na materiał – egzemplarze InstancedMesh rysowane
   jednym wywołaniem na materiał), w układzie modelu (podstawa na y = 0 – jak w pliku). Siatki skompresowane:
   EXT_meshopt_compression (meshopt) i KHR_draco_mesh_compression (Draco, wasm w vendor/three/addons/libs/draco/gltf).
   Wczytywane raz, przy starcie gry (main.js – przed budową świata); brak spisu albo pliku – model pominięty, get()
   zwraca null (obiekty w kodzie jak dotąd). credits() – lista do ekranu „Autorzy” (CC BY wymaga podania autora). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

(function () {
	'use strict';
	const T = THREE;
	const NS = (window.Train3D = window.Train3D || {});
	const ROOT = 'models/';
	const st = { manifest: null, models: new Map(), loading: null, failed: [], done: false };

	let loader = null;
	function gltfLoader() {
		if (loader) return loader;
		const draco = new DRACOLoader().setDecoderPath('vendor/three/addons/libs/draco/gltf/');
		loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
		return loader;
	}

	/* scena glTF → części { geometry, material } (siatki scalone wg materiału, przekształcenia węzłów wliczone);
	   wspólne atrybuty: position, normal, uv (brakujące – uzupełniane), kolory wierzchołków tylko gdy wszystkie mają */
	function parts(scene, def, pick, shift) {
		scene.updateMatrixWorld(true);
		const byMat = new Map();
		scene.traverse((o) => {
			if (!o.isMesh || !o.geometry || (pick && !pick(o))) return;
			const mats = Array.isArray(o.material) ? o.material : [o.material];
			const g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
			g0.applyMatrix4(o.matrixWorld);
			if (shift) g0.translate(shift.x, shift.y, shift.z);
			// wiele materiałów na jednej siatce – grupy osobno
			const groups = g0.groups.length ? g0.groups : [{ start: 0, count: g0.attributes.position.count, materialIndex: 0 }];
			for (const gr of groups) {
				const m = mats[gr.materialIndex || 0] || mats[0];
				let g = g0;
				if (g0.groups.length) {
					g = new T.BufferGeometry();
					for (const [k, a] of Object.entries(g0.attributes)) g.setAttribute(k, new T.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize, a.normalized));
				}
				if (!byMat.has(m)) byMat.set(m, []);
				byMat.get(m).push(g);
			}
		});
		const s = def.scale || 1;
		const out = [];
		for (const [m, list] of byMat) {
			for (const g of list) {
				if (!g.attributes.normal) g.computeVertexNormals();
				if (!g.attributes.uv) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
				for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
			}
			if (list.some((g) => !g.attributes.color)) for (const g of list) if (g.attributes.color) g.deleteAttribute('color');
			const geo = list.length > 1 ? mergeGeometries(list, false) : list[0];
			if (!geo) continue;
			if (s !== 1) geo.scale(s, s, s);
			geo.computeBoundingBox();
			geo.computeBoundingSphere();
			geo.userData.shared = true; // (wspólna dla wszystkich egzemplarzy – nie zwalniana z kawałkiem świata)
			const material = NS.util && NS.util.patch ? NS.util.patch(m, def.variant || 'lit') : m;
			if (geo.attributes.color) material.vertexColors = true;
			out.push({ geometry: geo, material });
		}
		return out;
	}

	// węzeł należący do wariantu: on sam albo któryś przodek o nazwie pasującej do wyrażenia
	const named = (o, re) => { for (let x = o; x; x = x.parent) if (x.name && re.test(x.name)) return true; return false; };
	// węzły najwyższego poziomu z siatką (warianty 'each')
	const tops = (scene) => {
		const s = scene.children.length === 1 && !scene.children[0].isMesh ? scene.children[0] : scene;
		return s.children.filter((c) => { let m = false; c.traverse((x) => { if (x.isMesh) m = true; }); return m; }).map((c) => c.name);
	};

	async function loadOne(id, def) {
		const L = gltfLoader();
		const hi = await L.loadAsync(ROOT + def.file);
		const lo = def.lod ? await L.loadAsync(ROOT + def.lod).catch((e) => { console.warn('Modele: wersja z daleka niewczytana', id, e.message); return null; }) : null;
		// warianty: { nazwa: wyrażenie } albo każdy węzeł najwyższego poziomu (nazwa = nazwa węzła)
		const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const V = def.variants === 'each' ? Object.fromEntries(tops(hi.scene).map((n) => [n, '^' + reEsc(n) + '$'])) : def.variants || null;
		const make = (key, pick) => {
			// wariant wyśrodkowany: środek pudełka w x/z, podstawa na y = 0 (przesunięcie z wersji bliskiej – takie samo dla dalekiej)
			let shift = null;
			if (pick) {
				const b = new T.Box3();
				hi.scene.updateMatrixWorld(true);
				hi.scene.traverse((o) => { if (o.isMesh && pick(o)) b.expandByObject(o); });
				if (b.isEmpty()) return;
				const c = b.getCenter(new T.Vector3());
				shift = new T.Vector3(-c.x, -b.min.y, -c.z);
			}
			const P = parts(hi.scene, def, pick, shift);
			if (!P.length) return;
			let L2 = null;
			if (lo) {
				const Q = parts(lo.scene, def, pick, shift);
				// wersja z daleka – część na część (te same materiały, w tej samej kolejności); inaczej bez niej
				if (Q.length === P.length) L2 = Q.map((q) => q.geometry);
			}
			const box = new T.Box3();
			for (const p of P) box.union(p.geometry.boundingBox);
			st.models.set(key, { id: key, def, parts: P, lo: L2, box, size: box.getSize(new T.Vector3()) });
		};
		if (!V) make(id, null);
		else for (const [name, re] of Object.entries(V)) { const R = new RegExp(re); make(id + ':' + name, (o) => named(o, R)); }
	}

	/* wczytanie spisu i wszystkich modeli (raz; kolejne wywołania – ta sama obietnica). Wynik: { loaded, failed } */
	function load() {
		if (st.loading) return st.loading;
		st.loading = (async () => {
			try {
				const r = await fetch(ROOT + 'index.json', { cache: 'no-store' });
				st.manifest = r.ok ? await r.json() : null;
			} catch (e) {
				st.manifest = null;
			}
			const defs = (st.manifest && st.manifest.models) || {};
			await Promise.all(Object.entries(defs).map(async ([id, def]) => {
				try {
					await loadOne(id, def);
				} catch (e) {
					st.failed.push(id);
					console.warn('Modele: nie wczytano', id, e.message);
				}
			}));
			st.done = true;
			return { loaded: st.models.size, failed: st.failed.slice() };
		})();
		return st.loading;
	}

	// model ({ parts: [{ geometry, material }], lo, box, size }) albo null – brak / jeszcze niewczytany; warianty – „id:nazwa”
	function get(id) {
		return st.models.get(id) || null;
	}
	// nazwy wczytanych wariantów modelu (np. variants('nettle_plant') → ['nettle_plant:…', …])
	function variants(id) {
		return [...st.models.keys()].filter((k) => k === id || k.startsWith(id + ':'));
	}

	/* egzemplarze modelu: InstancedMesh na każdą część (pojemność n, count 0 – wstawianie: put(matrix, color)), wersja
	   z daleka w userData.lo (World.updateLod przełącza geometrię całych kawałków jak koron drzew) */
	function instanced(id, n) {
		const M = get(id);
		if (!M) return null;
		const meshes = M.parts.map((p, i) => {
			const m = new T.InstancedMesh(p.geometry, p.material, Math.max(1, n));
			m.count = 0;
			if (M.lo) {
				m.userData.hi = p.geometry;
				m.userData.lo = M.lo[i];
			}
			m.userData.model = id;
			return m;
		});
		return {
			meshes,
			put(matrix, color) {
				for (const m of meshes) {
					if (m.count >= m.instanceMatrix.count) continue;
					m.setMatrixAt(m.count, matrix);
					if (color) m.setColorAt(m.count, color);
					m.count++;
				}
			},
		};
	}

	// autorzy i licencje wczytanych modeli (ekran „Autorzy”)
	function credits() {
		const defs = (st.manifest && st.manifest.models) || {};
		return Object.entries(defs).map(([id, d]) => ({ id, title: d.title || id, author: d.author || '', license: d.license || '', source: d.source || '' }));
	}

	NS.models = { load, get, variants, instanced, credits, get ready() { return st.done; } };
})();
