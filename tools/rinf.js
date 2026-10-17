#!/usr/bin/env node
/* Wyciąg z RINF (Register of Infrastructure, ERA – Europejska Agencja Kolejowa) dla generatora tras: pochylenia linii
   i tunele zarządcy PKP PLK. Źródło: zrzut grafu wiedzy ERA (Zenodo, „ERA Knowledge Graph”, plik rinf-kg-*.nq,
   licencja CC BY 4.0) – czytany strumieniowo, bez rozpakowywania całości na dysk:
     unzip -p ERA-KG.zip "rinf-kg-*.nq" | node tools/rinf.js - --date 2026-08-19
   albo z pliku: node tools/rinf.js rinf-kg-20260819.nq (także sam graf PKP PLK – wiersze grafu 0051).
   Wynik: js/gen/rinf-pl.js – { v, lines: { "448": [[km, ‰], …] }, tunnels: [[linia, km od, km do, długość], …] }.
   Pochylenie: wartość ‰ od podanego km (rosnąco), dodatnie – wznosi się w stronę rosnącego kilometrażu linii; tor
   nieparzysty (N), bez niego – pierwszy tor odcinka. */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const src = args[0];
if (!src) {
	console.error('Użycie: node tools/rinf.js <plik.nq | -> [--date RRRR-MM-DD] [--im 0051] [--out js/gen/rinf-pl.js]');
	process.exit(1);
}
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const IM = opt('im', '0051'), OUT = opt('out', path.join(__dirname, '..', 'js', 'gen', 'rinf-pl.js')), DATE = opt('date', '');
const GRAPH = `<http://data.europa.eu/949/graph/${IM}>`;
const E = 'http://data.europa.eu/949/';

// tylko potrzebne predykaty: odcinki linii (linia, tory), tory (identyfikator, pochylenia), linie (numer), tunele (km)
const WANT = new Set(['nationalLine', 'hasPart', 'trackId', 'gradientProfile', 'lineId', 'tunnelIdentification', 'lengthOfTunnel', 'netReference', 'startsAt', 'endsAt', 'hasLrsCoordinate'].map((x) => E + x));
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const S = new Map(); // podmiot -> { predykat: [obiekty] }
const types = { sol: new Set(), tunnel: new Set() };
const put = (s, p, o) => { let m = S.get(s); if (!m) S.set(s, (m = {})); (m[p] = m[p] || []).push(o); };
const lit = (o) => { const m = /^"((?:[^"\\]|\\.)*)"/.exec(o); return m ? JSON.parse('"' + m[1] + '"') : o; };
const iri = (o) => (o.startsWith('<') ? o.slice(1, -1) : o);

const input = src === '-' ? process.stdin : fs.createReadStream(src);
const rl = readline.createInterface({ input, crlfDelay: Infinity });
let n = 0, k = 0;
const rx = /^<([^>]+)> <([^>]+)> (.+) <[^>]+> \.\s*$/;
rl.on('line', (line) => {
	n++;
	if (!line.includes(GRAPH)) return;
	const m = rx.exec(line);
	if (!m) return;
	const [, s, p, o] = m;
	if (p === TYPE) {
		if (o === `<${E}SectionOfLine>`) types.sol.add(s);
		else if (o === `<${E}Tunnel>`) types.tunnel.add(s);
		return;
	}
	// etykiety współrzędnych liniowych: „Railway location km 0.536 on line PL0051017”
	if (p === LABEL) { if (o.includes('Railway location km')) put(s, p, lit(o)); return; }
	if (!WANT.has(p)) return;
	put(s, p, o.startsWith('<') ? iri(o) : lit(o));
	k++;
});
rl.on('close', () => {
	const g = (s, p) => ((S.get(s) || {})[E + p] || []);
	const lineNo = (lps) => { const id = g(lps, 'lineId')[0] || ''; const m = /^PL\d{4}(\d+)$/.exec(id); return m ? String(parseInt(m[1], 10)) : null; };
	// pochylenia: „-12.4(+1.114)” – ‰ od km
	const lines = {};
	for (const sol of types.sol) {
		const ln = lineNo(g(sol, 'nationalLine')[0]);
		if (!ln) continue;
		const tracks = g(sol, 'hasPart').filter((t) => g(t, 'gradientProfile').length);
		if (!tracks.length) continue;
		const tr = tracks.find((t) => g(t, 'trackId')[0] === 'N') || tracks[0];
		for (const v of g(tr, 'gradientProfile')) {
			const m = /^([+-]?\d+(?:\.\d+)?)\(([+-]?\d+(?:\.\d+)?)\)$/.exec(String(v).trim());
			if (m) (lines[ln] = lines[ln] || []).push([Math.round(parseFloat(m[2]) * 1000) / 1000, Math.round(parseFloat(m[1]) * 10) / 10]);
		}
	}
	for (const ln of Object.keys(lines)) {
		const L = lines[ln].sort((a, b) => a[0] - b[0]);
		lines[ln] = L.filter((q, i) => i === 0 || q[0] !== L[i - 1][0]);
	}
	// tunele: linia i km początku i końca z etykiet współrzędnych liniowych; ten sam tunel na obu torach – raz
	const kmOf = (ref) => {
		for (const c of g(ref, 'hasLrsCoordinate')) for (const l of (S.get(c) || {})[LABEL] || []) {
			const m = /km (-?\d+(?:\.\d+)?) on line PL\d{4}(\d+)/.exec(l);
			if (m) return [String(parseInt(m[2], 10)), parseFloat(m[1])];
		}
		return null;
	};
	const tun = new Map();
	for (const t of types.tunnel) {
		const nr = g(t, 'netReference')[0];
		if (!nr) continue;
		const a = kmOf(g(nr, 'startsAt')[0]), b = kmOf(g(nr, 'endsAt')[0]);
		if (!a || !b || a[0] !== b[0]) continue;
		const km0 = Math.min(a[1], b[1]), km1 = Math.max(a[1], b[1]), len = parseFloat(g(t, 'lengthOfTunnel')[0]) || Math.round((km1 - km0) * 1000);
		const key = `${a[0]}|${km0}|${km1}`;
		if (!tun.has(key)) tun.set(key, [a[0], km0, km1, Math.round(len)]);
	}
	const tunnels = [...tun.values()].sort((x, y) => (x[0] === y[0] ? x[1] - y[1] : Number(x[0]) - Number(y[0])));
	const data = { v: DATE, im: IM, lines, tunnels };
	const body = `/* RINF (Register of Infrastructure, ERA – Europejska Agencja Kolejowa), zarządca ${IM} (PKP PLK): pochylenia linii
   i tunele dla generatora tras. Licencja CC BY 4.0 – © European Union Agency for Railways. Wygenerowano: node tools/rinf.js
   (zrzut ${DATE || 'bez daty'}). Nie edytować ręcznie. */
(function (d) {
	if (typeof module === 'object' && module.exports) module.exports = d;
	else (typeof globalThis !== 'undefined' ? globalThis : window).TrainRinf = d;
})(${JSON.stringify(data)});
`;
	fs.writeFileSync(OUT, body, 'utf8');
	const nG = Object.values(lines).reduce((a, b) => a + b.length, 0);
	console.log(`Wiersze: ${n}, użyte: ${k}. Linie z pochyleniami: ${Object.keys(lines).length} (${nG} zmian), tunele: ${tunnels.length}. Zapisano ${OUT} (${(body.length / 1024).toFixed(0)} KB).`);
});
