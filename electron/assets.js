/* Pliki gry dla protokołu app:// aplikacji desktopowej: ścieżka z adresu → plik w folderze gry (nigdy poza nim)
   i jego typ. Czyste funkcje – wspólne dla electron/main.js i testów. */
'use strict';
const path = require('node:path');

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ktx2': 'image/ktx2',
	'.wasm': 'application/wasm',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.ogg': 'audio/ogg',
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.flac': 'audio/flac',
	'.webm': 'audio/webm',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
};

// plik dla ścieżki adresu („/” → index.html) albo null – ścieżka wychodząca poza folder gry lub złe kodowanie
function resolveAsset(root, pathname) {
	let rel;
	try {
		rel = decodeURIComponent(pathname || '/');
	} catch {
		return null;
	}
	if (rel.includes('\0')) return null;
	if (rel === '/' || rel === '') rel = '/index.html';
	const base = path.resolve(root);
	const file = path.resolve(base, '.' + rel.replace(/\\/g, '/'));
	return file.startsWith(base + path.sep) ? file : null;
}

function mimeOf(file) {
	return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

module.exports = { resolveAsset, mimeOf, MIME };
