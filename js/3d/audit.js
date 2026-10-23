/* Kontrola geometrii trasy rzeczywistej (świat 3D bez rysowania): miejsca, które psują wygląd i które dotąd trzeba było
   wyszukiwać na zrzutach – filary i słupy na jezdniach i torach, wiadukty drogowe (envAudit: nasypy, filary, przęsła,
   końce nad terenem), ulica przerwana przy torze bez przejazdu ani wiaduktu, skoki wysokości torów z mapy, teren
   i ulice nad tunelem niżej niż jego strop, tor pod peronem, budynek na torowisku.
   NS.auditWorld(world) – uwagi { id, code, k: 'audit', lvl: 'warn' | 'info', pos, d, m, fix } (jak envAudit; w swobodnej
   kamerze razem z uwagami generatora); NS.auditRoutes(list, onProgress) – wiele tras po kolei (main.js, adres ?audit). */
import * as THREE from 'three';

(function () {
	'use strict';
	const R = window.TrainRoutes;
	const NS = window.Train3D;

	const km = (s) => (s / 1000).toFixed(2).replace('.', ',');
	const side = (d) => `${Math.abs(Math.round(d))} m ${d < 0 ? 'w lewo' : 'w prawo'} od osi`;

	function auditWorld(w) {
		const r = w.route, e = r.env, out = [];
		if (!e || !w.env) return out;
		const add = (code, lvl, s, d, m, fix) => {
			if (out.some((x) => x.code === code && Math.abs(x.pos - s) < 40 && Math.abs(x.d - d) < 30)) return;
			out.push({ id: `audit-${code}@${Math.round(s)}`, code, k: 'audit', lvl, pos: s, d, m, fix });
		};
		const h = (s) => R.heightAt(r, s);
		// jezdnia (maska dróg – rysowana) albo odcinek ulicy z mapy ponad 3 m pod poziomem y
		const roadUnder = (s, d, y) => {
			if (w.roadBelowDeck(s, d, y, 0)) return true;
			if (!w.onRoad(s, d)) return false;
			const rl = w.roadLevel(s, d);
			return rl !== undefined && rl < y - 3;
		};
		// tor z mapy ponad 3 m pod poziomem y (pod pomostem)
		const trackUnder = (s, d, y) => w.envTracksAt(s).some((t) => Math.abs(t.d - d) < 1.6 && w.envRowY(t.i, t.k, s, t.d) < y - 3);

		// 1. wiadukty drogowe i kolejowe z mapy nad torem (real-env envAudit – te same obliczenia co rysowanie)
		for (const x of w.envAudit()) out.push(Object.assign({}, x));

		// 2. słupy estakad i filary mostów naszej linii (pozycje z budowy – world.auditSink)
		w.auditSink = [];
		const g = new THREE.Group();
		for (const b of r.bridges || []) {
			try { (b.kind === 'viaduct' ? w.buildViaduct : w.buildBridge).call(w, g, b); } catch (err) { /* obiekt bez geometrii */ }
		}
		const piers = w.auditSink;
		w.auditSink = null;
		g.traverse((o) => { if (o.geometry && o.userData.ownGeometry) o.geometry.dispose(); });
		for (const p of piers) {
			const pts = [];
			if (p.kind === 'bridge-pier') { for (let a = -p.r; a <= p.r + 1e-6; a += p.r) for (let q = -p.w / 2; q <= p.w / 2 + 1e-6; q += 1) pts.push([p.s + a, p.d + q]); }
			else for (const [a, q] of [[0, 0], [p.r, 0], [-p.r, 0], [0, p.r], [0, -p.r]]) pts.push([p.s + a, p.d + q]);
			const name = p.kind === 'bridge-pier' ? 'Filar mostu' : 'Słup estakady';
			for (const [s, d] of pts) {
				if (roadUnder(s, d, p.top)) { add('col-road', 'warn', s, d, `${name} (${side(d)}) stoi na jezdni pod obiektem.`, 'Słup powinien stanąć poza jezdnią i chodnikiem – sprawdź ulicę pod obiektem (łączniki pod torem, szerokość z BDOT).'); break; }
				if (trackUnder(s, d, p.top)) { add('col-track', 'warn', s, d, `${name} (${side(d)}) stoi na torze pod obiektem.`, 'Słup powinien stanąć między torami – sprawdź tory z mapy pod obiektem.'); break; }
			}
		}

		// 3. ulica przerwana przy torze (końce po obu stronach osi) bez przejazdu, wiaduktu ani tunelu
		const ends = [];
		(e.r || []).forEach((row) => {
			const n = (row.length - 1) / 2;
			if (n < 2 || row[0] > 8) return; // (bez ścieżek i dróg polnych)
			for (const [k, k2] of [[0, 1], [n - 1, n - 2]]) {
				const s = row[1 + k * 2], d = row[2 + k * 2];
				if (Math.abs(d) < 3 || Math.abs(d) > 16 || Math.abs(row[2 + k2 * 2]) <= Math.abs(d)) continue;
				// ostatni odcinek wyraźnie w stronę toru (ulica równoległa do toru kończąca się obok – nie przerwana przy torze)
				if (Math.abs(row[2 + k2 * 2] - d) < 0.5 * Math.abs(row[1 + k2 * 2] - s)) continue;
				ends.push({ s, d, ti: row[0] });
			}
		});
		const overAt = (sx) => (e.o || []).concat(e.ro || []).some((o) => { for (let k = 1; k + 1 < o.length; k += 2) if (Math.abs(o[k] - sx) < 20 && Math.abs(o[k + 1]) < 12) return true; return false; });
		for (const a of ends) {
			if (a.d >= 0) continue;
			for (const b of ends) {
				if (b.d <= 0) continue;
				// przecięcie osi: z prostej między końcami
				const sx = a.s + ((b.s - a.s) * -a.d) / (b.d - a.d);
				if (Math.abs(b.s - a.s) > 30) continue;
				if ((r.crossings || []).some((c) => Math.abs((c.pos !== undefined ? c.pos : c) - sx) < 40)) continue;
				if ((r.bridges || []).some((q) => sx > q.from - 10 && sx < q.to + 10)) continue;
				if ((r.tunnels || []).some((q) => sx > q.from - 10 && sx < q.to + 10)) continue;
				if (overAt(sx)) continue;
				// przy peronie stacji – zwykle przejście podziemne albo kładka (nie przejazd)
				if (r.stations.some((q) => sx > q.platformStart - 20 && sx < q.platformEnd + 20)) continue;
				// końce przy poziomie szyny (do 2 m) – w poziomie toru; wyżej / niżej – wiadukt albo przejście bez obiektu w danych
				const la = w.roadLevel(a.s, a.d), lb = w.roadLevel(b.s, b.d), hx = h(sx);
				const lvl = la !== undefined && lb !== undefined && Math.abs(la - hx) < 2 && Math.abs(lb - hx) < 2;
				// ważna: ulica (do klasy 7) w poziomie szyn po obu stronach; drogi dojazdowe (8 – często do pól, bez przejazdu)
				// i ulice na innym poziomie – uwaga
				add('road-gap', lvl && Math.max(a.ti, b.ti) <= 7 ? 'warn' : 'info', sx, 0, `Ulica przerwana przy torze (km ${km(sx)}) – bez przejazdu, wiaduktu ani tunelu${lvl ? ', w poziomie szyn' : ''}.`, lvl ? `Prawdopodobnie przejazd bez oznaczenia w danych: "crossings": { "add": [${Math.round(sx)}] }.` : 'Ulica na innym poziomie niż tor – sprawdź, czy to przejście pod torami albo wiadukt (sekcja fixes: bridges).');
				break;
			}
		}

		// 4. skoki wysokości torów z mapy (poza tunelem i mostami z danych): ponad 1 m na 2 m
		(e.t || []).forEach((row, i) => {
			if (row[0] & 18) return;
			const m = (row.length - 1) / 2;
			let prev = null;
			for (let k = 0; k < m - 1; k++) {
				const sa = row[1 + k * 2], da = row[2 + k * 2], sb = row[3 + k * 2], db = row[4 + k * 2], L = Math.hypot(sb - sa, db - da);
				const n = Math.max(1, Math.ceil(L / 2));
				for (let q = 0; q <= n; q++) {
					const s = sa + ((sb - sa) * q) / n, d = da + ((db - da) * q) / n, y = w.envRowY(i, k, s, d);
					if (prev && Math.hypot(s - prev.s, d - prev.d) < 3 && Math.abs(y - prev.y) > 1) add('track-jump', 'warn', s, d, `Tor z mapy (${side(d)}) zmienia wysokość skokiem o ${Math.abs(y - prev.y).toFixed(1)} m.`, 'Wysokość toru z pomiaru zmienia się nagle – sprawdź most lub nasyp w danych (tor przy moście, przejście pod torami).');
					prev = { s, d, y };
				}
			}
		});

		// 5. tunel: teren albo ulica nad nim niżej niż strop (element tunelu widoczny na powierzchni)
		for (const t of r.tunnels || []) {
			if (!w.env.dem) break;
			for (let s = t.from + 2; s < t.to; s += 4) {
				if (w.envTunnelK(s) < 0.5) continue;
				const top = h(s) + w.envTunnelH(s) + 0.1, [l, rr] = w.envTunnelSides(s);
				for (let d = l; d <= rr; d += 2) {
					const rl = w.roadLevel(s, d), y = rl !== undefined ? rl : w.terrainY(s, d);
					if (y < top) { add('tunnel-surface', 'warn', s, d, `Nad tunelem (${side(d)}) ${rl !== undefined ? 'ulica' : 'teren'} ${(top - y).toFixed(1)} m niżej niż strop.`, 'Strop tunelu przebija powierzchnię – sprawdź wysokość tunelu i ulic nad nim.'); break; }
				}
			}
		}

		// 6. tor pod peronem: peron stacji z gry (pas krawędź – tył) i perony z mapy (wnętrze obrysu)
		for (const st of r.stations) {
			const P = st.platform;
			if (!P || (w.envTunnelK && w.envTunnelK((st.platformStart + st.platformEnd) / 2) > 0.5)) continue;
			const sg = P.side || 1, d0 = sg * (P.edge + 0.3), d1 = sg * (P.edge + (P.width || 4) - 0.3);
			for (let s = st.platformStart + 5; s < st.platformEnd - 5; s += 5) {
				const hit = w.envTracksAt(s).find((t) => !t.sk && (t.d - d0) * (t.d - d1) < 0);
				if (hit) { add('platform-track', 'warn', s, hit.d, `Tor z mapy (${side(hit.d)}) pod peronem stacji ${st.name}.`, 'Peron z gry nachodzi na tor – popraw szerokość albo stronę peronu (fixes: stations → platform).'); break; }
			}
		}
		(e.p || []).forEach((row, i) => {
			if (w.env.usedPlatforms && w.env.usedPlatforms.has(i)) return;
			const n = (row.length - 1) / 2, pts = [];
			for (let k = 0; k < n; k++) pts.push([row[1 + k * 2], row[2 + k * 2]]);
			let s0 = Infinity, s1 = -Infinity;
			for (const [s] of pts) { s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
			for (let s = s0 + 3; s < s1 - 3; s += 6) {
				let lo = Infinity, hi = -Infinity;
				for (let k = 0; k < n; k++) {
					const [sa, da] = pts[k], [sb, db] = pts[(k + 1) % n];
					if ((sa - s) * (sb - s) > 0 || sa === sb) continue;
					const d = da + ((db - da) * (s - sa)) / (sb - sa);
					lo = Math.min(lo, d); hi = Math.max(hi, d);
				}
				if (!(hi - lo > 3)) continue;
				const hit = w.envTracksAt(s).find((t) => !t.sk && t.d > lo + 1 && t.d < hi - 1);
				if (hit || (lo + 1 < 0 && hi - 1 > 0)) { add('platform-track', 'warn', s, hit ? hit.d : 0, `Peron z mapy (${side((lo + hi) / 2)}) leży na torze.`, 'Obrys peronu z mapy obejmuje tor – sprawdź dane peronu (OSM) albo tor.'); break; }
			}
		});

		// 7. budynek na torowisku (nasz tor albo tor z mapy, na poziomie terenu – nie hala nad torami, nie nad tunelem)
		(e.b || []).forEach((row) => {
			const n = (row.length - 3) / 2;
			let cs = 0, cd = 0;
			for (let k = 0; k < n; k++) { cs += row[3 + k * 2] / n; cd += row[4 + k * 2] / n; }
			if (Math.abs(cd) > 60 || (w.envTunnelK && w.envTunnelK(cs) > 0.5)) return;
			for (let k = 0; k <= n; k++) {
				const s = k < n ? row[3 + k * 2] : cs, d = k < n ? row[4 + k * 2] : cd;
				const gap = w.envTrackGap(s, d);
				if (gap > 1.5) continue;
				if (Math.abs(w.terrainY(s, d) - h(s)) > 3) continue; // (budynek ponad lub pod torem – obiekt na innym poziomie)
				add('building-track', 'info', s, d, `Budynek (${side(d)}) na torowisku.`, 'Obrys budynku obejmuje tor – zwykle zadaszenie nad torami albo błąd w danych.');
				break;
			}
		});
		return out.sort((a, b) => a.pos - b.pos);
	}

	/* wiele tras po kolei: list – [{ id, title, route }], onProgress(i, n, id) – postęp; świat bez rysowania (osobna scena) */
	async function auditRoutes(list, onProgress) {
		const res = [];
		const world = new NS.World(new THREE.Scene());
		for (let i = 0; i < list.length; i++) {
			const it = list[i];
			if (onProgress) onProgress(i, list.length, it.id);
			await new Promise((ok) => setTimeout(ok, 0));
			let items = [], err = null;
			try {
				world.setRoute(it.route);
				items = auditWorld(world);
			} catch (x) { err = String(x && x.stack || x); }
			res.push({ id: it.id, title: it.title, items, err });
		}
		world.clear();
		return res;
	}

	NS.auditWorld = auditWorld;
	NS.auditRoutes = auditRoutes;
})();
