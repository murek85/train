const r = window.maszynista.renderer;
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
await wait(8000);
r.togglePerf();
await wait(3000);
return r.perf.el.textContent.split('\n');
