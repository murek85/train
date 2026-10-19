const { app, nativeImage } = require('electron');
const [a, b, out] = process.argv.slice(-3);
app.whenReady().then(() => {
	const IA = nativeImage.createFromPath(a), IB = nativeImage.createFromPath(b);
	const A = IA.toBitmap(), B = IB.toBitmap(), { width, height } = IA.getSize();
	let sum = 0, big = 0; const n = A.length / 4; const D = Buffer.alloc(A.length);
	for (let i = 0; i < A.length; i += 4) { const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3; sum += d; if (d > 24) big++; const v = Math.min(255, d * 4); D[i] = v; D[i + 1] = v; D[i + 2] = v; D[i + 3] = 255; }
	if (out !== '-') require('fs').writeFileSync(out, nativeImage.createFromBitmap(D, { width, height }).toPNG());
	console.log(JSON.stringify({ meanAbs: +(sum / n).toFixed(2), pctOver24: +(100 * big / n).toFixed(2) }));
	app.exit(0);
});
