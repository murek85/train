// SHOT_JS: kamera swobodna nad stacją (SHOT_S m od pociągu, domyślnie 300), 40 m w górze, w poprzek torów – bocznice
// z wagonami, sieć trakcyjna, budynki (porównania instancji)
const r = window.maszynista.renderer, s = window.maszynista.sim, R = window.TrainRoutes;
const ds = window.SHOT_S !== undefined ? Number(window.SHOT_S) : 300;
const tp = R.trackPoint(s.route, Math.max(0, Math.min(s.route.length - 50, s.st.pos + ds)), {});
const tp2 = R.trackPoint(s.route, Math.max(0, Math.min(s.route.length, s.st.pos + ds + 50)), {});
r.freeStart(s);
const f = r.free, hx = tp2.x - tp.x, hz = tp2.z - tp.z, hl = Math.hypot(hx, hz) || 1;
f.x = tp.x - (hz / hl) * 60; f.z = tp.z + (hx / hl) * 60; f.y = (tp.y || 0) + 40;
f.yaw = Math.atan2(hx / hl + (hz / hl) * 0.8, -(hz / hl) + (hx / hl) * 0.8);
f.pitch = -0.45;
for (let i = 0; i < 240 && (r.world.pending > 0 || i < 8); i++) await new Promise((res) => setTimeout(res, 250));
await new Promise((res) => setTimeout(res, 4000));
return { pending: r.world.pending };
