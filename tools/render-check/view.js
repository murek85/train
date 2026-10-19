// SHOT_JS: widok kamery i pogoda z SHOT_CASE (np. trackside, side-clear, cab-rain) – pokazuje niebo
const r = window.maszynista.renderer, s = window.maszynista.sim, c = (window.SHOT_CASE || 'side').split('-');
const rid = s.route.id.replace(/@\d+$/, '');
for (const w of ['clear', 'cloudy', 'rain', 'fog', 'snow', 'storm']) if (c.includes(w)) r.weather.set(w, rid, true);
r.camMode = c[0]; r.trans = null; r.resetView(); r.camState.snap = true;
await new Promise((res) => setTimeout(res, 5000));
return { mode: r.camMode, weather: r.weather.key };
