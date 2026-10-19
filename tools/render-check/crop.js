// electron crop.js <out> <x> <y> <w> <h> <scale> <in1> <in2> – dwa wycinki obok siebie
const { app, nativeImage } = require('electron');
const a = process.argv.slice(-8);
const [out, x, y, w, h, sc, i1, i2] = [a[0], +a[1], +a[2], +a[3], +a[4], +a[5], a[6], a[7]];
app.whenReady().then(() => {
	const A = nativeImage.createFromPath(i1).crop({ x, y, width: w, height: h }).resize({ width: w * sc, height: h * sc, quality: 'good' });
	const B = nativeImage.createFromPath(i2).crop({ x, y, width: w, height: h }).resize({ width: w * sc, height: h * sc, quality: 'good' });
	const W = w * sc, H = h * sc, ba = A.toBitmap(), bb = B.toBitmap(), o = Buffer.alloc((W * 2 + 4) * H * 4);
	for (let j = 0; j < H; j++) { ba.copy(o, j * (W * 2 + 4) * 4, j * W * 4, (j + 1) * W * 4); bb.copy(o, (j * (W * 2 + 4) + W + 4) * 4, j * W * 4, (j + 1) * W * 4); }
	require('fs').writeFileSync(out, nativeImage.createFromBitmap(o, { width: W * 2 + 4, height: H }).toPNG());
	app.exit(0);
});
