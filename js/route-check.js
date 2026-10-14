/* Kontrola trasy (ROADMAP D5): błędy danych trasy, które psują jazdę albo wygląd – pochylenia nie do przejechania,
   skoki wysokości, ciasne łuki, W4 poza peronem, przejazd na peronie, semafory zbyt blisko siebie albo przejazdu,
   nieciągłe ograniczenia prędkości, kolejność stacji; na końcu przejazd automatem (rozkład jazdy). Czysta logika –
   menu (Generator tras: raport przy trasie), narzędzie tools/route-check.js i testy.
   Uwaga: { id, k, lvl: 'warn' | 'info', pos, m (opis), fix (co zrobić) } – jak uwagi generatora (route.issues). */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) module.exports = factory(require('./routes.js'), require('./sim.js'));
	else root.TrainRouteCheck = factory(root.TrainRoutes, root.TrainSim);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (R, S) {
	'use strict';

	const km = (pos) => (pos / 1000).toFixed(2).replace('.', ',');

	function check(route, opts = {}) {
		const out = [];
		const add = (k, lvl, pos, m, fix) => out.push({ id: `rc-${k}-${Math.round(pos)}`, k, lvl, pos, m, fix, check: true });
		const st = route.stations, len = route.length;
		const inStation = (x, pad = 0) => st.some((s) => x > s.platformStart - pad && x < s.platformEnd + pad);

		// pochylenia: ponad 30 ‰ na więcej niż 100 m (na liniach kolejowych prawie nie występuje – błąd modelu terenu)
		let run = null;
		for (let x = 0; x <= len; x += 10) {
			const g = Math.abs(R.gradeAt(route, x));
			if (g > 30) { if (!run) run = { a: x, g }; run.g = Math.max(run.g, g); }
			else if (run) {
				if (x - run.a > 100) add('grade', 'warn', run.a, `Pochylenie ${Math.round(run.g)} ‰ na ${x - run.a} m od km ${km(run.a)}`, 'Sprawdź wysokości (NMT) – wygeneruj trasę ponownie albo popraw pochylenia w sekcji fixes.');
				run = null;
			}
		}
		// skoki wysokości: ponad 1,5 m na 10 m
		for (let x = 10; x <= len; x += 10) {
			const dh = Math.abs(R.heightAt(route, x) - R.heightAt(route, x - 10));
			if (dh > 1.5) { add('height', 'warn', x, `Skok wysokości toru o ${dh.toFixed(1)} m na 10 m (km ${km(x)})`, 'Błąd wysokości toru – wygeneruj trasę ponownie.'); x += 200; }
		}
		// ciasne łuki: promień poniżej 180 m na co najmniej 30 m (poza stacjami)
		let c0 = null;
		for (let x = 0; x <= len; x += 10) {
			const k = Math.abs(R.curvatureAt(route, x));
			if (k > 1 / 180 && !inStation(x, 200)) { if (c0 === null) c0 = x; }
			else if (c0 !== null) {
				if (x - c0 >= 30) add('curve', 'info', c0, `Łuk o promieniu poniżej 180 m na ${x - c0} m (km ${km(c0)})`, 'Sprawdź przebieg toru z mapy (możliwe złe połączenie torów).');
				c0 = null;
			}
		}
		// stacje: kolejność, W4 na peronie, nakładające się perony
		for (let i = 0; i < st.length; i++) {
			const s = st[i];
			if (i && s.pos <= st[i - 1].pos) add('stations', 'warn', s.pos, `Stacja ${s.name} przed poprzednią (${st[i - 1].name})`, 'Kolejność stacji w danych trasy.');
			if (s.pos < s.platformStart - 1 || s.pos > s.platformEnd + 10) add('w4', 'warn', s.pos, `${s.name}: tablica W4 poza peronem`, 'Popraw położenie peronu albo stacji (fixes).');
			if (i && s.platformStart < st[i - 1].platformEnd) add('platform', 'warn', s.platformStart, `${s.name}: peron zachodzi na peron stacji ${st[i - 1].name}`, 'Sprawdź perony z mapy.');
		}
		// przejazdy: na peronie, sygnał „Baczność” za przejazdem
		for (const c of route.crossings) {
			if (inStation(c.pos)) add('crossing', 'warn', c.pos, `Przejazd kolejowy na peronie (km ${km(c.pos)})`, 'Sprawdź przejazd albo peron z mapy.');
			if (c.hornFrom >= c.pos) add('crossing', 'warn', c.pos, `Tablica W6 za przejazdem (km ${km(c.pos)})`, 'Błąd danych przejazdu.');
		}
		// semafory: odstęp poniżej 150 m, semafor tuż przy przejeździe
		const sigs = route.signals;
		for (let i = 1; i < sigs.length; i++) {
			if (sigs[i].pos - sigs[i - 1].pos < 150) add('signals', 'info', sigs[i].pos, `Semafory ${sigs[i - 1].label || sigs[i - 1].name || ''} i ${sigs[i].label || sigs[i].name || ''} tylko ${Math.round(sigs[i].pos - sigs[i - 1].pos)} m od siebie`, 'Sprawdź semafory z mapy (zdublowany semafor?).');
		}
		for (const sg of sigs) for (const c of route.crossings) if (Math.abs(sg.pos - c.pos) < 15) add('signals', 'info', sg.pos, `Semafor ${sg.label || sg.name || ''} na przejeździe (km ${km(sg.pos)})`, 'Przesuń semafor (fixes).');
		// ograniczenia prędkości: bardzo niskie, gwałtowne spadki
		for (let i = 0; i < route.limits.length; i++) {
			const l = route.limits[i], p = route.limits[i - 1];
			if (l.speed < 20) add('speed', 'warn', l.pos, `Ograniczenie ${l.speed} km/h (km ${km(l.pos)})`, 'Sprawdź prędkości z mapy.');
			if (p && p.speed - l.speed >= 70) add('speed', 'info', l.pos, `Spadek prędkości z ${p.speed} do ${l.speed} km/h (km ${km(l.pos)})`, 'Sprawdź, czy to nie błąd prędkości z mapy.');
		}
		// przejazd automatem (ten sam co rozkład jazdy)
		if (opts.drive !== false) {
			try { S.buildTimetable(route); } catch (e) { add('drive', 'warn', 0, e.message, 'Trasa nie do przejechania – zob. wyżej (pochylenia, ograniczenia).'); }
		}
		return out.sort((a, b) => a.pos - b.pos);
	}

	return { check };
});
