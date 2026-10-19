// SHOT_JS: czas klatki przy pogodzie z SHOT_CASE (rain / snow) – widok zza pociągu
const r = window.maszynista.renderer, s = window.maszynista.sim;
r.weather.set(window.SHOT_CASE || 'rain', s.route.id.replace(/@\d+$/, ''), true);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
await wait(6000);
const od = r.draw.bind(r); let frames = 0, ms = 0; r.draw = (...a) => { const t = performance.now(); frames++; const x = od(...a); ms += performance.now() - t; return x; };
const t = performance.now(); await wait(3000);
return (window.SHOT_CASE || 'rain') + ': ' + (frames * 1000 / (performance.now() - t)).toFixed(1) + ' fps, draw ' + (ms / frames).toFixed(1) + ' ms';
