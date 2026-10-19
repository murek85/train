// SHOT_JS: kamera swobodna nad torem, SHOT_S m przed pociągiem (domyślnie 2500), 25 m w górze, wzdłuż trasy – widok na
// oddal (mgła, horyzont, łuna miasta nocą); czeka na doczytanie świata wokół kamery
const r = window.maszynista.renderer, s = window.maszynista.sim, R = window.TrainRoutes;
const ds = Number(window.SHOT_S) || 2500;
const tp = R.trackPoint(s.route, Math.min(s.route.length - 50, s.st.pos + ds), {});
const tp2 = R.trackPoint(s.route, Math.min(s.route.length, s.st.pos + ds + 50), {});
r.freeStart(s);
const f = r.free;
f.x = tp.x; f.z = tp.z; f.y = (tp.y || 0) + 25;
f.yaw = Math.atan2(tp2.x - tp.x, -(tp2.z - tp.z));
f.pitch = -0.08;
for (let i = 0; i < 240 && (r.world.pending > 0 || i < 8); i++) await new Promise((res) => setTimeout(res, 250));
await new Promise((res) => setTimeout(res, 4000));
return { pos: Math.round(s.st.pos + ds), pending: r.world.pending };
