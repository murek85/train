// SHOT_JS: koszt map cieni – czas klatki z cieniami i z zamrożonymi mapami
const r = window.maszynista.renderer;
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
await wait(8000);
const origD = r.draw.bind(r); let frames = 0, ms = 0; r.draw = (...a) => { const t = performance.now(); frames++; const x = origD(...a); ms += performance.now() - t; return x; };
const m = async (label) => { await wait(1500); frames = 0; ms = 0; const t = performance.now(); await wait(3000); return label + ': ' + (frames * 1000 / (performance.now() - t)).toFixed(1) + ' fps, draw ' + (ms / frames).toFixed(1) + ' ms'; };
const out = [await m('z cieniami')];
const aim = r.aimSun.bind(r); r.aimSun = (...a) => { aim(...a); for (const l of r.cascades) { l.shadow.autoUpdate = false; l.shadow.needsUpdate = false; } };
out.push(await m('cienie zamrożone'));
return out;
