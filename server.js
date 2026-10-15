// Prosty serwer statyczny do podglądu gry: node server.js → http://localhost:4180
// Pośrednicy dla generatora tras w przeglądarce (usługi bez nagłówków CORS): ścieżki z listy w electron/proxy.js
// (/gugik/nmpt, /proxy/opendata/…, /proxy/plk/…) – te same reguły co w aplikacji desktopowej.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { UA, proxyTarget } = require('./electron/proxy');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4180;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.webm': 'audio/webm' };

function pipe(url, req, res, hops) {
	const up = https.get(url, { headers: { 'User-Agent': UA }, timeout: 300000 }, (r) => {
		// przekierowanie w obrębie tej samej usługi
		if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 3) {
			const next = new URL(r.headers.location, url);
			r.resume();
			if (next.origin === new URL(url).origin) return pipe(next.href, req, res, hops + 1);
		}
		res.writeHead(r.statusCode || 502, { 'Content-Type': r.headers['content-type'] || 'application/octet-stream', 'Cache-Control': 'no-store' });
		r.pipe(res);
	});
	up.on('timeout', () => up.destroy(new Error('timeout')));
	up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
	req.on('close', () => up.destroy());
}

http.createServer((req, res) => {
	if (req.method === 'GET') {
		const target = proxyTarget(req.url);
		if (target === false) { res.writeHead(403); res.end(); return; }
		if (target) { pipe(target, req, res, 0); return; }
	}
	const url = decodeURIComponent(req.url.split('?')[0]);
	const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
	if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
	fs.readFile(file, (err, data) => {
		if (err) { res.writeHead(404); res.end('Nie znaleziono'); return; }
		res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
		res.end(data);
	});
}).listen(PORT, () => console.log(`Maszynista: http://localhost:${PORT}`));
