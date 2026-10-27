/* Drzewa z modeli (WebGPU): pień z gałęziami i karty liści z generatora EZ-Tree (vendor/ez-tree, MIT) – gatunki
   z presetów EZ-Tree z ustawieniami pod grę (mniej przekrojów kory, mniej i większe karty – na karcie cała gałązka
   z liśćmi z atlasu textures/foliage, tools/foliage.py), po 2 warianty (ziarno), wersja bliska i z daleka (te same
   gałęzie, mniej boków i kart). Bryły znormalizowane do pudełka −0,5…0,5 (jak dawne korony z props.js): egzemplarz
   skalowany do wysokości i szerokości korony (world.js buildTrees), kołysanie wariantu 'wind' rośnie od podstawy.
   Kora: textures/bark (CC0 – Poly Haven, TextureCan, przez EZ-Tree), liście: ambientCG (CC0).
   WebGL – dawne korony z kart (props.js), ten moduł nieużywany. */
import * as THREE from 'three';
import { RenderTarget, MeshBasicNodeMaterial } from 'three/webgpu';
import { Tree } from '../../vendor/ez-tree/tree.js';
import TreeOptions from '../../vendor/ez-tree/options.js';
import PRESETS from '../../vendor/ez-tree/presets.js';

const T = THREE;
const NS = (typeof window !== 'undefined' ? (window.Train3D = window.Train3D || {}) : {});

// pola atlasu liści (tools/foliage.py): 4 × 2, nasada gałązki na dole pola
const CELL = { oak: 0, poplar: 1, birch: 2, linden: 3, spruce: 4, pine: 5, dense: 6, bare: 7 };
const FOL = { cols: 4, rows: 2, mg: 0.004 };
function cellUV(k, u, v) {
	const col = k % FOL.cols, row = Math.floor(k / FOL.cols), m = FOL.mg;
	// (obraz bez odbicia: v = 1 – góra obrazu; rząd 0 atlasu na górze)
	return [(col + m + u * (1 - 2 * m)) / FOL.cols, 1 - (row + m + (1 - v) * (1 - 2 * m)) / FOL.rows];
}

/* gatunki: preset EZ-Tree, zmiany (set), pola atlasu liści, kora, ziarna wariantów; lo – zmiany wersji z daleka */
const SPECIES = {
	oak: {
		base: 'oak_medium', bark: 'oak', cells: [CELL.oak, CELL.oak, CELL.linden], seeds: [35729, 9113],
		set: { branch: { segments: { 0: 6, 1: 3, 2: 3, 3: 3 }, sections: { 0: 5, 1: 3, 2: 2, 3: 1 } }, leaves: { count: 3, size: 9.5, sizeVariance: 0.3 } },
	},
	birch: {
		base: 'aspen_medium', bark: 'birch', cells: [CELL.birch], seeds: [4121, 777],
		set: { branch: { segments: { 0: 5, 1: 3, 2: 3 }, sections: { 0: 5, 1: 3, 2: 2 } }, leaves: { count: 5, size: 6, sizeVariance: 0.3 } },
	},
	poplar: {
		base: 'aspen_large', bark: 'oak', cells: [CELL.poplar, CELL.birch], seeds: [2025, 515],
		set: { branch: { segments: { 0: 6, 1: 3, 2: 3 }, sections: { 0: 6, 1: 4, 2: 2 }, angle: { 1: 22, 2: 30 } }, leaves: { count: 5, size: 9.5, sizeVariance: 0.3 } },
	},
	spruce: {
		base: 'pine_medium', bark: 'pine', cells: [CELL.spruce], seeds: [13977, 4410],
		set: { branch: { children: { 0: 50 }, segments: { 0: 6, 1: 3 }, sections: { 0: 8, 1: 3 } }, leaves: { count: 7, size: 7.5, sizeVariance: 0.2, angle: 30 } },
	},
	// sosna: wysoki goły pień, korona na szczycie (preset dębu z gałęziami od 60% wysokości)
	pine: {
		base: 'oak_small', bark: 'pine', cells: [CELL.pine], seeds: [3301, 871],
		set: {
			branch: { levels: 2, start: { 1: 0.62, 2: 0.1 }, angle: { 1: 62, 2: 45 }, children: { 0: 8, 1: 5 }, length: { 0: 44, 1: 9, 2: 5 }, radius: { 0: 1.1, 1: 0.5, 2: 0.6 }, segments: { 0: 6, 1: 3, 2: 3 }, sections: { 0: 6, 1: 3, 2: 2 }, gnarliness: { 0: 0.04, 1: 0.12, 2: 0.15 }, force: { strength: 0.004 } },
			leaves: { count: 7, size: 5, sizeVariance: 0.3, angle: 50, start: 0.3 },
		},
	},
	bush: {
		base: 'bush_2', bark: 'oak', cells: [CELL.linden, CELL.birch], seeds: [881, 1911],
		set: { branch: { segments: { 0: 4, 1: 3, 2: 3 }, sections: { 0: 3, 1: 3, 2: 2 } }, leaves: { count: 5, size: 6, sizeVariance: 0.3 } },
	},
};

function deepSet(dst, src) {
	for (const k in src) {
		if (src[k] && typeof src[k] === 'object' && dst[k] && typeof dst[k] === 'object') deepSet(dst[k], src[k]);
		else dst[k] = src[k];
	}
	return dst;
}

// wersja z daleka: kora z 3 boków, połowa przekrojów, ok. 30% kart (większych)
function loOptions(o) {
	const b = o.branch;
	for (const k in b.segments) b.segments[k] = 3;
	for (const k in b.sections) b.sections[k] = Math.max(1, Math.round(b.sections[k] / 2));
	o.leaves.count = Math.max(1, Math.round(o.leaves.count * 0.3));
	o.leaves.size *= 1.7;
}

const hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/* bryły gatunku: { bark, leaf } (BufferGeometry w pudełku −0,5…0,5), tris – liczba trójkątów */
function build(kind, variant, lo) {
	const S = SPECIES[kind];
	const o = new TreeOptions();
	o.copy(JSON.parse(JSON.stringify(PRESETS[S.base])));
	deepSet(o, S.set);
	o.seed = S.seeds[variant % S.seeds.length];
	if (lo) loOptions(o);
	const tree = new Tree(o);
	tree.generate();
	const bark = tree.branchesMesh.geometry, leaf = tree.leavesMesh.geometry;
	// z daleka bez gałązek ostatniego poziomu (liście zostają – z daleka gałązek i tak nie widać)
	const top = o.branch.levels, lv = bark.userData.level;
	if (lo && top > 1 && lv) bark.setIndex(Array.from(bark.index.array).filter((_, i, a) => lv[a[i - (i % 3)]] < top && lv[a[i - (i % 3) + 1]] < top && lv[a[i - (i % 3) + 2]] < top));
	bark.computeBoundingBox();
	leaf.computeBoundingBox();
	const bb = bark.boundingBox.clone().union(leaf.boundingBox);
	const H = bb.max.y - bb.min.y, W = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
	const cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2;
	const fit = (g) => {
		const p = g.attributes.position, n = g.attributes.normal;
		for (let i = 0; i < p.count; i++) {
			p.setXYZ(i, (p.getX(i) - cx) / W, (p.getY(i) - bb.min.y) / H - 0.5, (p.getZ(i) - cz) / W);
			// normalne po skalowaniu niejednorodnym (odwrotność transpozycji: × W, H, W)
			if (n) {
				const x = n.getX(i) * W, y = n.getY(i) * H, z = n.getZ(i) * W, l = Math.hypot(x, y, z) || 1;
				n.setXYZ(i, x / l, y / l, z / l);
			}
		}
		g.computeBoundingBox();
		g.computeBoundingSphere();
	};
	fit(bark);
	fit(leaf);
	// liście: pole atlasu i odbicie w poziomie losowo na kartę, normalne zaokrąglone od środka korony, ciemniej w głębi
	const lb = leaf.boundingBox, c = new T.Vector3(), r = new T.Vector3();
	lb.getCenter(c);
	lb.getSize(r).multiplyScalar(0.5).max(new T.Vector3(0.05, 0.05, 0.05));
	const p = leaf.attributes.position, nrm = leaf.attributes.normal, uv = leaf.attributes.uv;
	const col = new Float32Array(p.count * 3);
	for (let q = 0; q < p.count / 4; q++) {
		const k = S.cells[Math.floor(hash(q * 1.7 + variant * 31) * S.cells.length)], flip = hash(q * 3.1 + 7) < 0.5;
		for (let j = 0; j < 4; j++) {
			const i = q * 4 + j;
			const u0 = uv.getX(i), v0 = uv.getY(i);
			const [u, v] = cellUV(k, flip ? 1 - u0 : u0, v0);
			uv.setXY(i, u, v);
			const dx = (p.getX(i) - c.x) / r.x, dy = (p.getY(i) - c.y) / r.y, dz = (p.getZ(i) - c.z) / r.z;
			const dl = Math.hypot(dx, dy, dz) || 1;
			const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
			const ax = dx / dl * 0.7 + nx * 0.3, ay = dy / dl * 0.7 + ny * 0.3 + 0.15, az = dz / dl * 0.7 + nz * 0.3, al = Math.hypot(ax, ay, az) || 1;
			nrm.setXYZ(i, ax / al, ay / al, az / al);
			// głębia: od 0,45 w środku korony do 1 na obrzeżu, u góry jaśniej
			const sh = (0.45 + 0.55 * Math.min(1, Math.max(0, (dl - 0.25) / 0.75))) * (0.85 + 0.15 * Math.min(1, Math.max(0, dy * 0.5 + 0.5)));
			col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = sh;
		}
	}
	leaf.setAttribute('color', new T.BufferAttribute(col, 3));
	bark.userData.shared = leaf.userData.shared = true;
	return { bark, leaf, tris: (bark.index.count + leaf.index.count) / 3 };
}

const KINDS = Object.keys(SPECIES);
const VARIANTS = 2;
let G = null;

/* wszystkie gatunki: G[kind][variant] = { bark, leaf, lo: { bark, leaf } } (budowane raz, przy pierwszym użyciu) */
function geometries() {
	if (G) return G;
	G = {};
	for (const kind of KINDS) {
		G[kind] = [];
		for (let v = 0; v < VARIANTS; v++) {
			const hi = build(kind, v, false), lo = build(kind, v, true);
			G[kind].push({ bark: hi.bark, leaf: hi.leaf, tris: hi.tris, lo: { bark: lo.bark, leaf: lo.leaf, tris: lo.tris } });
		}
	}
	return G;
}

// faktury (wczytywane raz; kolor – sRGB, normalne i ORM – liniowe)
const loader = typeof window !== 'undefined' ? new T.TextureLoader() : null;
const texCache = new Map();
function tex(url, srgb, repeat) {
	if (texCache.has(url)) return texCache.get(url);
	const t = loader.load(url);
	t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
	t.anisotropy = 8;
	if (repeat) {
		t.wrapS = t.wrapT = T.RepeatWrapping;
		t.repeat.set(repeat[0], repeat[1]);
	}
	t.name = url;
	texCache.set(url, t);
	return t;
}

/* materiały (wspólne): kora wg rodzaju, liście (atlas lato / zima – winter); patch – nodes.js (wariant 'wind':
   kołysanie, pogoda, mokre liście) */
let MATS = null;
function materials(patch) {
	if (MATS) return MATS;
	const bark = {};
	for (const b of ['oak', 'birch', 'pine']) {
		const base = `textures/bark/${b}_`, rep = [1, b === 'birch' ? 2 : 3];
		const orm = tex(base + 'orm_1k.webp', false, rep);
		bark[b] = patch(new T.MeshStandardMaterial({ map: tex(base + 'color_1k.webp', true, rep), normalMap: tex(base + 'normal_1k.webp', false, rep), roughnessMap: orm, aoMap: orm, color: '#ffffff', roughness: 1, metalness: 0 }), 'wind');
	}
	const leafMat = (winter) => {
		const m = patch(new T.MeshStandardMaterial({
			map: tex(`textures/foliage/foliage${winter ? '-winter' : ''}_color.webp`, true),
			normalMap: tex(`textures/foliage/foliage${winter ? '-winter' : ''}_normal.webp`, false),
			color: '#ffffff', vertexColors: true, roughness: 0.75, metalness: 0, alphaTest: 0.4, side: T.DoubleSide,
		}), 'wind');
		// (atlas w szarościach – liniowo ok. 0,25: kolor egzemplarza × 2,6 daje jasność dawnych koron)
		m.color.multiplyScalar(2.6);
		return m;
	};
	MATS = { bark, leaf: leafMat(false), leafWinter: leafMat(true) };
	return MATS;
}

const barkOf = (kind) => SPECIES[kind].bark;

/* Impostory (dalekie lasy zamiast dawnych „mas lasu”): każdy gatunek z IMP_KINDS wypalony przy starcie z 3 stron (co
   60°) do atlasu (rząd – gatunek, kolumna – kierunek; kolor bez oświetlenia, krycie w alfie), w świecie 3 skrzyżowane
   pionowe płaszczyzny z widokami z tych stron – 6 trójkątów na drzewo, zwykły materiał (cienie, mgła, kołysanie,
   kolor egzemplarza). Normalne zaokrąglone (miękkie światło jak korona, nie płaska karta). */
const IMP_KINDS = ['oak', 'birch', 'spruce', 'pine'], IMP_F = 3, IMP_S = 256, IMP_BOX = 0.62;
let IMP = null, baking = null;
// faktura wczytana (obraz gotowy)
const loaded = (t) => new Promise((res) => {
	if (t.image && (t.image.width || t.image.naturalWidth)) return res();
	const iv = setInterval(() => { if (t.image && (t.image.width || t.image.naturalWidth)) { clearInterval(iv); res(); } }, 50);
});
/* wypalenie (raz, w tle – od pierwszej klatki z gotową kartą): czeka na faktury i kompilację potoków (gra rysuje
   tylko obiekty z gotowym potokiem – bez tego atlas zostawał pusty); do tego czasu dalekie lasy – dawne bryły */
function bake(renderer) {
	if (IMP || baking) return baking;
	baking = bakeRun(renderer).catch((e) => console.warn('Drzewa: impostory niewypalone', e));
	return baking;
}
async function bakeRun(renderer) {
	const rt = new RenderTarget(IMP_F * IMP_S, IMP_KINDS.length * IMP_S, { depthBuffer: true });
	rt.texture.generateMipmaps = true;
	rt.texture.minFilter = T.LinearMipmapLinearFilter;
	rt.texture.magFilter = T.LinearFilter;
	rt.texture.colorSpace = T.SRGBColorSpace;
	rt.texture.name = 'tree-impostors';
	const G = geometries(), scene = new T.Scene();
	const fol = tex('textures/foliage/foliage_color.webp', true);
	const leafM = new MeshBasicNodeMaterial({ map: fol, vertexColors: true, alphaTest: 0.4, side: T.DoubleSide, color: '#ffffff' });
	const barkM = {};
	for (const b of ['oak', 'birch', 'pine']) barkM[b] = new MeshBasicNodeMaterial({ map: tex(`textures/bark/${b}_color_1k.webp`, true, [1, b === 'birch' ? 2 : 3]), color: '#7a7a7a' });
	const cam = new T.OrthographicCamera(-IMP_BOX, IMP_BOX, IMP_BOX, -IMP_BOX, 0.01, 10);
	await Promise.all([fol, ...Object.values(barkM).map((m) => m.map)].map(loaded));
	// kompilacja potoków dla celu atlasu (wszystkie gatunki naraz)
	IMP_KINDS.forEach((kind, i) => {
		const g = G[kind][0];
		const b = new T.Mesh(g.bark, barkM[SPECIES[kind].bark]), l = new T.Mesh(g.leaf, leafM);
		b.position.x = l.position.x = i * 0.01;
		scene.add(b, l);
	});
	const prev0 = renderer.getRenderTarget();
	renderer.setRenderTarget(rt);
	await renderer.compileAsync(scene, cam);
	renderer.setRenderTarget(prev0);
	scene.clear();
	const prev = renderer.getRenderTarget(), ac = renderer.autoClear, cc = new T.Color(), ca = renderer.getClearAlpha();
	renderer.getClearColor(cc);
	renderer.setRenderTarget(rt);
	renderer.setClearColor(0x000000, 0);
	renderer.clear();
	renderer.autoClear = false;
	IMP_KINDS.forEach((kind, row) => {
		const g = G[kind][0];
		const bark = new T.Mesh(g.bark, barkM[SPECIES[kind].bark]), leaf = new T.Mesh(g.leaf, leafM);
		scene.add(bark, leaf);
		for (let f = 0; f < IMP_F; f++) {
			const a = (f / IMP_F) * Math.PI;
			cam.position.set(Math.sin(a) * 3, 0, Math.cos(a) * 3);
			cam.lookAt(0, 0, 0);
			rt.viewport.set(f * IMP_S, row * IMP_S, IMP_S, IMP_S);
			renderer.render(scene, cam);
		}
		scene.remove(bark, leaf);
	});
	rt.viewport.set(0, 0, rt.width, rt.height);
	renderer.autoClear = ac;
	renderer.setClearColor(cc, ca);
	renderer.setRenderTarget(prev);
	leafM.dispose();
	for (const m of Object.values(barkM)) m.dispose();
	// bryły: 3 płaszczyzny (kierunki jak przy wypalaniu), UV – pole atlasu gatunku
	const geo = {};
	IMP_KINDS.forEach((kind, row) => {
		const P = [], N = [], U = [], I = [];
		for (let f = 0; f < IMP_F; f++) {
			const a = (f / IMP_F) * Math.PI, ux = Math.cos(a), uz = -Math.sin(a);
			// (cel rysowania w WebGPU: wiersz 0 obrazu u góry – v odwrócone względem miejsca rysowania)
			const u0 = f / IMP_F, u1 = (f + 1) / IMP_F, v0 = 1 - row / IMP_KINDS.length, v1 = 1 - (row + 1) / IMP_KINDS.length;
			const base = P.length / 3;
			for (const [sx, sy, u, v] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]]) {
				const x = ux * sx * IMP_BOX, z = uz * sx * IMP_BOX, y = sy * IMP_BOX;
				P.push(x, y, z);
				const l = Math.hypot(x * 0.8, 0.55 + y * 0.6, z * 0.8) || 1;
				N.push((x * 0.8) / l, (0.55 + y * 0.6) / l, (z * 0.8) / l);
				U.push(u, v);
			}
			I.push(base, base + 1, base + 2, base, base + 2, base + 3);
		}
		const g = new T.BufferGeometry();
		g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
		g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
		g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
		g.setIndex(I);
		g.computeBoundingSphere();
		g.userData.shared = true;
		geo[kind] = g;
	});
	IMP = { texture: rt.texture, rt, geo, kinds: IMP_KINDS };
	return IMP;
}

let IMP_MAT = null;
// materiał impostorów (wariant 'wind' – kołysanie, pogoda); kolor z egzemplarza (wypalone w szarościach)
function impostorMaterial(patch) {
	if (IMP_MAT || !IMP) return IMP_MAT;
	IMP_MAT = patch(new T.MeshStandardMaterial({ map: IMP.texture, alphaTest: 0.45, side: T.DoubleSide, color: '#ffffff', roughness: 0.85, metalness: 0 }), 'wind');
	IMP_MAT.color.multiplyScalar(2.6);
	return IMP_MAT;
}

NS.trees = { KINDS, VARIANTS, geometries, materials, barkOf, build, bake, impostorMaterial, get impostors() { return IMP; } };
export { KINDS, VARIANTS, geometries, materials, barkOf, build, SPECIES, bake };
