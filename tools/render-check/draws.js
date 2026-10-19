// SHOT_JS: wywołania rysowania na klatkę wg kategorii (przebieg główny / mapy cieni) – WebGPU
const r = window.maszynista.renderer, gl = r.gl, be = gl.backend;
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
await wait(6000);
const chunkOf = new Map(); for (const ch of r.world.chunks.values()) ch.group.traverse((o) => chunkOf.set(o, ch));
const cat = (o) => {
	if (chunkOf.has(o)) return 'świat:' + (o.userData.shadowProxy ? 'bryła cienia' : (o.matrixAutoUpdate === false ? 'stałe' : 'ruchome') + (o.isInstancedMesh ? '-inst' + (o.userData.fine ? '(fine)' : o.userData.lo ? '(korony)' : '') : ''));
	for (let p = o; p; p = p.parent) { if (r.trainModel && p === r.trainModel.group) return 'pociąg'; if (r.cab && p === r.cab.group) return 'kabina'; }
	return 'inne:' + (o.parent ? o.parent.type : '-');
};
const tally = new Map(); let frames = 0;
const od = be.draw.bind(be);
be.draw = (ro, info) => { const pass = ro.camera && ro.camera.isOrthographicCamera ? 'cień' : 'główny'; const k = pass + ' ' + cat(ro.object); tally.set(k, (tally.get(k) || 0) + 1); return od(ro, info); };
const odr = r.draw.bind(r); r.draw = (...a) => { frames++; return odr(...a); };
await wait(3000);
return [...tally].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ': ' + (v / frames).toFixed(0));
