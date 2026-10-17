/* Generator tras w osobnym wątku (Web Worker): pobieranie danych, budowa trasy i kontrola trasy bez zatrzymywania gry
   (budowa otoczenia i pomiary to kilkadziesiąt sekund obliczeń). Wiadomości:
   – od gry: { type: 'job', id, list: [{ from, to, line }], both, opts: { env, dem, nmpt, official }, base, desktop },
     { type: 'rpc-reply', rid, result, error };
   – do gry: { type: 'log', id, text }, { type: 'route', id, def, check, ms }, { type: 'error', id, message },
     { type: 'end', id }, { type: 'rpc', rid, method, args } (desktop: pobranie NMPT przez proces główny).
   Pamięć podręczna (IndexedDB, ta sama baza co gra): pobrane pliki źródeł i kafelki modelu powierzchni NMPT. */
'use strict';
importScripts('routes.js', 'physics.js', 'sim.js', 'horizon-data.js', 'gen/sources.js', 'osm-route.js', 'route-check.js');

// adresy względne (pośrednik serwera gry: proxy/…, gugik/nmpt) – względem strony gry, nie pliku wątku
let base = '';
const fetch0 = self.fetch.bind(self);
self.fetch = (u, o) => fetch0(typeof u === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(u) ? new URL(u, base).href : u, o);

// zapytania do gry (aplikacja desktopowa: NMPT przez proces główny)
let rid = 0;
const waiting = new Map();
const rpc = (method, ...args) => new Promise((res, rej) => {
	const id = ++rid;
	waiting.set(id, { res, rej });
	postMessage({ type: 'rpc', rid: id, method, args });
});

// IndexedDB – jak w grze (main.js): routes, nmpt, files
let dbOpening = null;
const dbOpen = () => dbOpening || (dbOpening = new Promise((res, rej) => {
	const req = indexedDB.open('maszynista', 3);
	req.onupgradeneeded = () => {
		const db = req.result;
		if (!db.objectStoreNames.contains('routes')) db.createObjectStore('routes', { keyPath: 'id' });
		if (!db.objectStoreNames.contains('nmpt')) db.createObjectStore('nmpt');
		if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
	};
	req.onsuccess = () => res(req.result);
	req.onerror = () => rej(req.error);
}));
const dbRun = async (store, mode, fn) => {
	const db = await dbOpen();
	return new Promise((res, rej) => {
		const t = db.transaction(store, mode);
		const r = fn(t.objectStore(store));
		t.oncomplete = () => res(r ? r.result : undefined);
		t.onerror = () => rej(t.error);
		t.onabort = () => rej(t.error);
	});
};
const fileDB = {
	get: async (url) => { try { const v = await dbRun('files', 'readonly', (st) => st.get(url)); return v ? new Uint8Array(v) : null; } catch (e) { return null; } },
	put: async (url, bytes) => { try { await dbRun('files', 'readwrite', (st) => st.put(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), url)); } catch (e) { /* brak miejsca */ } },
};
async function nmptSurface() {
	let tiles = new Map();
	try {
		const keys = await dbRun('nmpt', 'readonly', (st) => st.getAllKeys());
		const vals = await dbRun('nmpt', 'readonly', (st) => st.getAll());
		tiles = new Map(keys.map((k, i) => [k, vals[i]]));
	} catch (e) { /* bez pamięci */ }
	return (pts, l) => self.TrainOSM.nmptSampler(pts, l, tiles, (all, k, T) => {
		dbRun('nmpt', 'readwrite', (st) => st.put(Object.assign({}, T, { v: Int16Array.from(T.v) }), k)).catch(() => {});
	});
}

// kontrola trasy (js/route-check.js) – jak przycisk „Kontrola” w grze, skład domyślny trasy
function checkRoute(def) {
	try {
		const R = self.TrainRoutes;
		return { list: self.TrainRouteCheck.check(R.prepare(def, R.normConfig(def))) };
	} catch (e) { return { list: [], error: e.message || String(e) }; }
}

async function job(m) {
	const id = m.id, o = m.opts;
	const log = (text) => postMessage({ type: 'log', id, text });
	const surface = o.env && o.dem && o.nmpt ? await nmptSurface() : undefined;
	const one = async (from, to, line) => {
		const t0 = Date.now();
		const def = await self.TrainOSM.generate({ from, to, line: line || null, environment: o.env ? undefined : false, dem: o.env && o.dem ? undefined : false, surface, bdot: o.official ? undefined : false, plk: o.official ? undefined : false, fileCache: fileDB, log });
		// próba przygotowania trasy w grze (wyłapuje dane, których silnik nie przyjmie)
		self.TrainRoutes.prepare(def, { train: 'ezt', cars: 1 });
		log('Kontrola trasy…');
		postMessage({ type: 'route', id, def, check: checkRoute(def), ms: Date.now() - t0 });
		return def;
	};
	const { from, to, line } = m.list[0];
	const def = await one(from, to, line);
	// także trasa w drugą stronę: stacje krańcowe z wygenerowanej trasy zamienione (ta sama linia)
	if (m.both) {
		const a = def.stations[def.stations.length - 1].name, b = def.stations[0].name;
		log(`Trasa w drugą stronę: ${a} – ${b}…`);
		await one(a, b, line);
	}
}

onmessage = async (e) => {
	const m = e.data;
	if (m.type === 'rpc-reply') {
		const w = waiting.get(m.rid);
		waiting.delete(m.rid);
		if (w) { if (m.error) w.rej(new Error(m.error)); else w.res(m.result); }
		return;
	}
	if (m.type !== 'job') return;
	base = m.base;
	self.desktopProxy = m.desktop ? { fetchText: (url) => rpc('fetchText', url) } : null;
	try { await job(m); } catch (err) { postMessage({ type: 'error', id: m.id, message: (err && err.message) || String(err) }); }
	postMessage({ type: 'end', id: m.id });
};
