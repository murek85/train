const { app, nativeImage } = require('electron');
const files = process.argv.slice(2).filter((f) => f.endsWith('.png'));
app.whenReady().then(() => {
	for (const f of files) { const b = nativeImage.createFromPath(f).toBitmap(); let s = 0, n = 0; for (let i = 0; i < b.length; i += 16) { s += b[i] + b[i + 1] + b[i + 2]; n += 3; } console.log(f.split('/').pop(), (s / n).toFixed(1)); }
	app.exit(0);
});
