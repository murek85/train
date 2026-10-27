#!/usr/bin/env node
/* Modele z Poly Haven (CC0) do gry: uproszczenie i kompresja gltfpack (meshoptimizer, devDependency) – wersja bliska
   (hi) i z daleka (lo), siatki meshopt, bez kwantyzacji wierzchołków (js/3d/models.js scala
   siatki w liczbach zmiennoprzecinkowych) – i wpis w models/index.json (tytuł, autor, licencja, źródło). Faktury
   zmniejszane przed gltfpack (Pillow – kopia modelu w katalogu tymczasowym; gltfpack z npm nie koduje WebP) do 512 px
   (bliska) i 256 px (z daleka), osadzone jako JPG / PNG.
   Użycie: node tools/models.js <katalog z podkatalogami modeli glTF 1k> [id …]
   Podkatalog = identyfikator Poly Haven (np. street_lamp_01) z plikiem .gltf i teksturami. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// kopia katalogu modelu z fakturami zmniejszonymi do px (Pillow)
function shrunk(dir, px) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'model-'));
	fs.cpSync(dir, tmp, { recursive: true });
	const py = `import sys,os
from PIL import Image
for r,_,fs in os.walk(sys.argv[1]):
  for f in fs:
    if f.lower().endswith(('.jpg','.jpeg','.png')):
      p=os.path.join(r,f); im=Image.open(p)
      if max(im.size)>${px}:
        im=im.resize((max(1,im.width*${px}//max(im.size)),max(1,im.height*${px}//max(im.size))),Image.LANCZOS)
        im.save(p, quality=88) if f.lower().endswith(('.jpg','.jpeg')) else im.save(p)
`;
	execFileSync('python', ['-I', '-c', py, tmp], { stdio: 'pipe' });
	return tmp;
}

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'models');
/* docelowa liczba trójkątów: [bliska, z daleka]; variant – wariant łatki materiału (js/3d/nodes.js / common.js patch);
   variants – kilka obiektów w jednym pliku (Poly Haven: odmiany obok siebie): { nazwa: wyrażenie na nazwy węzłów }
   albo 'each' – każdy węzeł najwyższego poziomu osobno (js/3d/models.js – osobne modele „id:nazwa”) */
const SPEC = {
	street_lamp_01: { tris: [3000, 400], title: 'Latarnia uliczna 01' },
	street_lamp_02: { tris: [3000, 400], title: 'Latarnia uliczna 02' },
	metal_trash_can: { tris: [1200, 200], title: 'Kosz na śmieci', variants: { clean: '^metal_trash_can(?!_rust)', rust: '_rust' } },
	modular_street_seating: { tris: [3000, 400], title: 'Ławki uliczne (moduły)' },
	painted_wooden_bench: { tris: [700, 200], title: 'Ławka drewniana' },
	modular_chainlink_fence: { tris: [4000, 600], title: 'Ogrodzenie z siatki (moduły)' },
	concrete_road_barrier_02: { tris: [1500, 200], title: 'Bariera betonowa' },
	fire_hydrant: { tris: [1500, 200], title: 'Hydrant', variants: { new: '^fire_hydrant(?!.*aged)', aged: 'aged' } },
	shrub_03: { tris: [800, 150], title: 'Krzew', variant: 'wind', variants: 'each' },
	fern_02: { tris: [700, 150], title: 'Paproć', variant: 'wind', variants: 'each' },
	nettle_plant: { tris: [500, 150], title: 'Pokrzywa', variant: 'wind', variants: 'each' },
};

function tris(gltfPath) {
	const g = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
	let n = 0;
	for (const m of g.meshes || []) for (const p of m.primitives || []) {
		const acc = g.accessors[p.indices !== undefined ? p.indices : p.attributes.POSITION];
		n += Math.floor(acc.count / 3);
	}
	return n;
}

async function info(id) {
	const r = await fetch(`https://api.polyhaven.com/info/${id}`);
	return r.ok ? r.json() : {};
}

(async () => {
	const src = process.argv[2];
	if (!src) {
		console.error('Użycie: node tools/models.js <katalog modeli glTF> [id …]');
		process.exit(1);
	}
	const only = process.argv.slice(3);
	const manPath = path.join(OUT, 'index.json');
	const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { version: 1, models: {} };
	fs.mkdirSync(OUT, { recursive: true });
	for (const id of Object.keys(SPEC)) {
		if (only.length && !only.includes(id)) continue;
		const dir = path.join(src, id);
		if (!fs.existsSync(dir)) { console.log(`${id}: brak katalogu – pominięty`); continue; }
		const gltfName = fs.readdirSync(dir).find((f) => f.endsWith('.gltf'));
		const n = tris(path.join(dir, gltfName)), S = SPEC[id];
		const files = {};
		for (const [k, target] of [['', S.tris[0]], ['_lo', S.tris[1]]]) {
			const ratio = Math.min(1, target / Math.max(1, n));
			const out = path.join(OUT, `${id}${k}.glb`);
			const tmp = shrunk(dir, k ? 256 : 512);
			// (-kn – nazwy węzłów zostają: warianty z jednego pliku)
			const args = ['gltfpack', '-i', path.join(tmp, gltfName), '-o', out, '-c', '-noq', '-kn', '-si', ratio.toFixed(4)];
			if (ratio < 0.3) args.push('-sa'); // mocne uproszczenie – do celu niezależnie od błędu
			try {
				execFileSync('npx', args, { cwd: ROOT, stdio: 'pipe', shell: true });
			} finally {
				fs.rmSync(tmp, { recursive: true, force: true });
			}
			files[k || 'hi'] = path.basename(out);
		}
		const meta = await info(id).catch(() => ({}));
		const authors = Object.keys(meta.authors || {}).join(', ');
		man.models[id] = Object.assign({ file: files.hi, lod: files._lo, title: S.title, author: authors || 'Poly Haven', license: 'CC0 1.0', source: `https://polyhaven.com/a/${id}` }, S.variant ? { variant: S.variant } : {}, S.variants ? { variants: S.variants } : {});
		const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
		console.log(`${id}: ${n} trójkątów → ${S.tris[0]} / ${S.tris[1]}; ${files.hi} ${kb(files.hi)} KB, ${files._lo} ${kb(files._lo)} KB; autor: ${authors}`);
	}
	fs.writeFileSync(manPath, JSON.stringify(man, null, '\t') + '\n');
})().catch((e) => {
	console.error('Błąd:', e.message);
	process.exit(1);
});
