// electron lum.js [y0 y1] pliki.png – średnia jasność zrzutów (opcjonalnie pas wierszy y0…y1 w ułamkach wysokości)
const { app, nativeImage } = require('electron');
const args = process.argv.slice(2), nums = args.filter((a) => /^[0-9.]+$/.test(a)).map(Number);
const files = args.filter((f) => f.endsWith('.png')), y0 = nums.length > 1 ? nums[0] : 0, y1 = nums.length > 1 ? nums[1] : 1;
app.whenReady().then(() => {
	for (const f of files) {
		const im = nativeImage.createFromPath(f), { width, height } = im.getSize(), b = im.toBitmap();
		let s = 0, n = 0;
		for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y += 2) for (let x = 0; x < width; x += 4) { const i = (y * width + x) * 4; s += b[i] + b[i + 1] + b[i + 2]; n += 3; }
		console.log(f.split('/').pop(), (s / n).toFixed(1));
	}
	app.exit(0);
});
