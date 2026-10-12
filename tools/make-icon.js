/* Ikona aplikacji desktopowej: czoło pociągu (bursztyn menu gry) z dwiema szybami i reflektorami, pod nim szyny,
   na ciemnogranatowym zaokrąglonym kwadracie – PNG 512 × 512 (build/icon.png; electron-builder robi z niego .ico
   dla Windows). node tools/make-icon.js */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const S = 512;
const SS = 4; // nadpróbkowanie na oś
const BG = [13, 17, 24];
const PANEL = [22, 28, 38];
const EDGE = [44, 54, 70];
const AMBER = [255, 176, 32];
const AMBER_D = [199, 125, 10];
const GLASS = [13, 17, 24];
const LAMP = [255, 244, 214];
const RAIL = [143, 155, 173];

// zaokrąglony prostokąt (środek cx, cy, połowy w, h, promień r): odległość ze znakiem (ujemna – w środku)
const rbox = (x, y, cx, cy, w, h, r) => {
	const qx = Math.max(Math.abs(x - cx) - (w - r), 0), qy = Math.max(Math.abs(y - cy) - (h - r), 0);
	return Math.hypot(qx, qy) - r;
};
function colourAt(x, y) {
	const tile = rbox(x, y, 256, 256, 220, 220, 92);
	if (tile > 0) return null;
	// szyny: dwie zbiegające się ku górze linie pod czołem i podkłady
	if (y > 392 && y < 440) {
		const t = (y - 392) / 48;
		for (const s of [-1, 1]) if (Math.abs(x - (256 + s * (92 + 40 * t))) < 7) return RAIL;
		if ((y > 404 && y < 414) || (y > 426 && y < 436)) if (Math.abs(x - 256) < 120 + 40 * t) return EDGE;
	}
	// czoło: zaokrąglony korpus, ciemniejszy pas pod szybami
	const body = rbox(x, y, 256, 262, 130, 128, 46);
	if (body < 0) {
		for (const cx of [196, 316]) if (rbox(x, y, cx, 206, 46, 40, 12) < 0) return GLASS; // szyby
		for (const cx of [190, 322]) if (Math.hypot(x - cx, y - 326) < 22) return LAMP; // reflektory
		if (y > 262 && y < 282) return AMBER_D;
		return AMBER;
	}
	if (tile > -9) return EDGE;
	return PANEL;
}

const rgba = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++)
	for (let x = 0; x < S; x++) {
		let r = 0, g = 0, b = 0, a = 0;
		for (let j = 0; j < SS; j++)
			for (let i = 0; i < SS; i++) {
				const col = colourAt(x + (i + 0.5) / SS, y + (j + 0.5) / SS);
				if (!col) continue;
				r += col[0];
				g += col[1];
				b += col[2];
				a++;
			}
		const o = (y * S + x) * 4, n = SS * SS;
		rgba[o] = a ? Math.round(r / a) : BG[0];
		rgba[o + 1] = a ? Math.round(g / a) : BG[1];
		rgba[o + 2] = a ? Math.round(b / a) : BG[2];
		rgba[o + 3] = Math.round((255 * a) / n);
	}

// PNG: sygnatura, IHDR, IDAT (każdy wiersz z bajtem filtra 0), IEND
const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
const crc = (buf) => {
	let c = 0xffffffff;
	for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
	const len = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type, 'ascii'), data]), sum = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	sum.writeUInt32BE(crc(body));
	return Buffer.concat([len, body, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // głębia bitowa
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) rgba.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`${out}: ${png.length} B`);
