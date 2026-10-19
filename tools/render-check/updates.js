// SHOT_JS: aktualizacje obiektów na klatkę (WebGPU): updateForRender węzłów, wiązania pełne / współdzielone – wg kategorii
const r = window.maszynista.renderer, gl = r.gl;
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
await wait(6000);
const inBundle = (o) => { for (let p = o.parent; p; p = p.parent) if (p.isBundleGroup) return true; return false; };
const cat = (ro) => (ro.camera && ro.camera.isOrthographicCamera ? 'cień ' : 'obraz ') + (inBundle(ro.object) ? 'paczka' : 'reszta');
const T = {}; let frames = 0;
const tap = (obj, name, label) => { const f = obj[name].bind(obj); obj[name] = (ro, ...a) => { const k = label + ' ' + cat(ro); T[k] = (T[k] || 0) + 1; return f(ro, ...a); }; };
tap(gl._nodes, 'updateForRender', 'nodes');
tap(gl._bindings, 'updateForRender', 'bindFull');
tap(gl._bindings, 'updateSharedForRender', 'bindShared');
const odr = r.draw.bind(r); r.draw = (...a) => { frames++; return odr(...a); };
await wait(3000);
return Object.entries(T).sort().map(([k, v]) => k + ': ' + (v / frames).toFixed(0));
