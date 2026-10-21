/* Ścieżki trzymania obiektów oznaczonych w migawce heapleak.js (HEAP_SNAP): ile oznaczonych obiektów żyje według grupy
   (kawałek świata, model, typ obiektu) i dla kilku z każdej grupy najkrótsza ścieżka od korzenia sterty (bez krawędzi
   słabych). Migawka czytana strumieniowo (pliki kilku GB).
     node --max-old-space-size=16000 tools/render-check/heappath.js <migawka> [ścieżek na grupę, domyślnie 2] */
const fs = require('fs');
const [file, perGroupArg] = process.argv.slice(2);
const PER = +(perGroupArg || 2);
const fd = fs.openSync(file, 'r');
const CH = 1 << 24, buf = Buffer.alloc(CH);
let head = '', meta = null, nodes, edges, strings = [];
let mode = 'head', arr = null, ai = 0, num = -1, pat = '', pi = 0, next = null;
let strParts = null, esc = false;
const seek = (p, then) => { mode = 'seek'; pat = p; pi = 0; next = then; };
for (;;) {
	const n = fs.readSync(fd, buf, 0, CH, null);
	if (!n) break;
	let i = 0;
	if (mode === 'head') {
		head += buf.toString('latin1', 0, Math.min(n, 1 << 16));
		const k = head.indexOf('"nodes":[');
		meta = JSON.parse(head.slice(0, k).replace(/,\s*$/, '') + '}').snapshot;
		nodes = new Uint32Array(meta.node_count * meta.meta.node_fields.length);
		edges = new Uint32Array(meta.edge_count * meta.meta.edge_fields.length);
		i = Buffer.byteLength(head.slice(0, k + 9), 'latin1');
		mode = 'nums'; arr = nodes; ai = 0; num = -1;
		next = () => seek('"edges":[', () => { mode = 'nums'; arr = edges; ai = 0; num = -1; next = () => seek('"strings":[', () => { mode = 'strs'; }); });
	}
	for (; i < n; i++) {
		const c = buf[i];
		if (mode === 'nums') {
			if (c >= 48 && c <= 57) num = num < 0 ? c - 48 : num * 10 + c - 48;
			else { if (num >= 0) { arr[ai++] = num; num = -1; } if (c === 93) next(); }
		} else if (mode === 'seek') {
			if (c === pat.charCodeAt(pi)) { if (++pi === pat.length) next(); } else pi = c === pat.charCodeAt(0) ? 1 : 0;
		} else if (mode === 'strs') {
			if (strParts === null) { if (c === 34) { strParts = []; strParts.start = i + 1; esc = false; } else if (c === 93) { mode = 'done'; break; } }
			else if (esc) esc = false;
			else if (c === 92) esc = true;
			else if (c === 34) {
				strParts.push(buf.subarray(strParts.start, i));
				const s = Buffer.concat(strParts).toString('utf8');
				strings.push(s.includes('\\') ? JSON.parse('"' + s + '"') : s);
				strParts = null;
			}
		}
	}
	if (strParts !== null) { strParts.push(Buffer.from(buf.subarray(strParts.start, n))); strParts.start = 0; }
	if (mode === 'done') break;
}
fs.closeSync(fd);
const NF = meta.meta.node_fields, EF = meta.meta.edge_fields, NT = meta.meta.node_types[0], ET = meta.meta.edge_types[0];
const nT = NF.indexOf('type'), nN = NF.indexOf('name'), nE = NF.indexOf('edge_count'), nS = NF.indexOf('self_size');
const eT = EF.indexOf('type'), eN = EF.indexOf('name_or_index'), eTo = EF.indexOf('to_node');
const NFL = NF.length, EFL = EF.length, N = meta.node_count;
console.log('węzły ' + N + ', krawędzie ' + meta.edge_count + ', napisy ' + strings.length);
const first = new Uint32Array(N + 1);
for (let k = 0; k < N; k++) first[k + 1] = first[k] + nodes[k * NFL + nE];
const nodeName = (k) => strings[nodes[k * NFL + nN]];
const nodeType = (k) => NT[nodes[k * NFL + nT]];
const edgeName = (e) => { const t = ET[edges[e * EFL + eT]], v = edges[e * EFL + eN]; return t === 'element' || t === 'hidden' ? '[' + v + ']' : strings[v]; };
const WEAK = ET.indexOf('weak');
// oznaczone: obiekt z krawędzią __stary do obiektu StaryObiekt; grupa – napis z jego właściwości „grupa”
const groups = new Map();
for (let k = 0; k < N; k++) {
	for (let e = first[k]; e < first[k + 1]; e++) {
		if (ET[edges[e * EFL + eT]] !== 'property' || strings[edges[e * EFL + eN]] !== '__stary') continue;
		const m = edges[e * EFL + eTo] / NFL;
		let g = '?';
		for (let f = first[m]; f < first[m + 1]; f++) if (strings[edges[f * EFL + eN]] === 'grupa') g = nodeName(edges[f * EFL + eTo] / NFL);
		if (!groups.has(g)) groups.set(g, []);
		groups.get(g).push(k);
	}
}
const keyEdge = (e) => { const v = edges[e * EFL + eN], t = ET[edges[e * EFL + eT]]; return t !== 'element' && t !== 'hidden' && strings[v].includes('part of key'); };
// najkrótsze ścieżki od korzenia (węzeł 0), bez krawędzi słabych i bez przejścia przez znaczniki __stary
/* wpis WeakMap (efemeron) trzyma wartość tylko, gdy klucz jest osiągalny: krawędź od tablicy mapy czeka na klucz */
const nI = NF.indexOf('id'), byId = new Map();
for (let k = 0; k < N; k++) byId.set(nodes[k * NFL + nI], k);
const parent = new Int32Array(N).fill(-1), pedge = new Int32Array(N).fill(-1), q = new Uint32Array(N);
const pending = new Map();
parent[0] = 0;
let qh = 0, qt = 0;
q[qt++] = 0;
const reach = (t, k, e) => {
	if (parent[t] >= 0) return;
	parent[t] = k; pedge[t] = e; q[qt++] = t;
	const w = pending.get(t);
	if (w) { pending.delete(t); for (const [k2, e2] of w) reach(edges[e2 * EFL + eTo] / NFL, k2, e2); }
};
while (qh < qt) {
	const k = q[qh++];
	for (let e = first[k]; e < first[k + 1]; e++) {
		if (edges[e * EFL + eT] === WEAK) continue;
		if (keyEdge(e)) {
			if (nodeType(k) !== 'array') continue; // krawędź od klucza do wartości sama nie trzyma
			const m = /part of key \(.*? @(\d+)\)/.exec(strings[edges[e * EFL + eN]]), key = m ? byId.get(+m[1]) : undefined;
			if (key !== undefined && parent[key] < 0) { if (!pending.has(key)) pending.set(key, []); pending.get(key).push([k, e]); continue; }
		}
		reach(edges[e * EFL + eTo] / NFL, k, e);
	}
}
const label = (k) => { const t = nodeType(k), s = nodeName(k); return t === 'object' || t === 'native' ? s.slice(0, 60) : t === 'closure' ? 'ƒ ' + s : t + ' ' + s.slice(0, 40); };
console.log('--- oznaczone obiekty, które żyją (grupa: liczba)');
for (const [g, ks] of [...groups].sort((a, b) => b[1].length - a[1].length)) console.log(String(ks.length).padStart(7) + ' ' + g);
console.log('--- ścieżki trzymania (od korzenia)');
const seen = new Set();
for (const [g, ks] of [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
	let shown = 0;
	for (const k of ks) {
		if (shown >= PER) break;
		if (parent[k] < 0) continue;
		const path = [];
		for (let x = k; x !== 0; x = parent[x]) path.push(x);
		path.reverse();
		const key = path.slice(0, -1).map((x) => edgeName(pedge[x])).join('.');
		if (seen.has(key)) continue;
		seen.add(key);
		shown++;
		console.log('[' + g + '] (korzeń)' + path.map((x) => ' .' + edgeName(pedge[x]) + ' → ' + label(x)).join(''));
	}
}
// trzeci argument: identyfikatory węzłów (@id ze ścieżek, po przecinku) – wszystkie krawędzie do nich (kto jeszcze trzyma)
if (process.argv[4]) {
	const want = new Map();
	for (let k = 0; k < N; k++) for (const id of process.argv[4].split(',')) if (nodes[k * NFL + nI] === +id) want.set(k, id);
	for (let k = 0; k < N; k++) for (let e = first[k]; e < first[k + 1]; e++) {
		const t = edges[e * EFL + eTo] / NFL;
		if (want.has(t)) console.log('@' + want.get(t) + ' ← ' + label(k) + ' @' + nodes[k * NFL + nI] + ' .' + edgeName(e) + (edges[e * EFL + eT] === WEAK ? ' (słaba)' : '') + (parent[k] >= 0 ? '' : ' (nieosiągalny)'));
	}
}
