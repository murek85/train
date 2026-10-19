const r = window.maszynista.renderer, s = window.maszynista.sim, c = window.SHOT_CASE || '';
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const rid = s.route.id.replace(/@\d+$/, '');
if (c.includes('rain')) r.weather.set('rain', rid, true);
if (c.includes('snow')) { r.weather.set('snow', rid, true); r.weather.cur.snowGround = 0.8; r.weather.snowGroundTarget = () => 0.8; }
if (c.includes('cab')) { r.camMode = 'cab'; r.trans = null; r.resetView(); r.camState.snap = true; }
await wait(6000);
// krople na szybie narastają – w kabinie dłużej
if (c.includes('cab')) await wait(6000);
return { case: c, wet: window.Train3D.util.U.uWet.value, snow: window.Train3D.util.U.uSnow.value, rain: window.Train3D.util.U.uRain.value, night: window.Train3D.util.U.uNightK.value };
