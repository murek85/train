/* Fizyka pociągu – czysta logika bez DOM (działa w przeglądarce i w Node). */
(function (root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.TrainPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
	'use strict';

	const G = 9.81;
	const LEVER_MIN = -5; // -5 = hamowanie nagłe
	const LEVER_MAX = 5;
	const BRAKE_STEPS = 4;
	// opóźnienie zadziałania hamulca zespolonego (s) – do szacowania drogi hamowania
	const BRAKE_DELAY = 1.2;

	// Pozycja nastawnika → polecenie: moc (0..1), hamulec (0..1), nagłe.
	function leverCommand(lever) {
		if (lever >= 1) return { power: Math.min(lever, LEVER_MAX) / LEVER_MAX, brake: 0, emergency: false };
		if (lever <= LEVER_MIN) return { power: 0, brake: 1, emergency: true };
		if (lever < 0) return { power: 0, brake: -lever / BRAKE_STEPS, emergency: false };
		return { power: 0, brake: 0, emergency: false };
	}

	function leverLabel(lever) {
		if (lever <= LEVER_MIN) return 'NAGŁE';
		if (lever < 0) return 'H' + -lever;
		if (lever > 0) return 'J' + lever;
		return '0';
	}

	function createState(pos) {
		return { pos, v: 0, a: 0, traction: 0, brake: 0, emergency: false };
	}

	function approach(cur, target, up, down, dt) {
		if (target > cur) return Math.min(target, cur + up * dt);
		return Math.max(target, cur - down * dt);
	}

	// Opory ruchu (wzór Davisa), N
	function resistance(train, v) {
		if (v <= 0) return 0;
		return train.davisA + train.davisB * v + train.davisC * v * v;
	}

	// Siła pociągowa, N – ograniczona siłą rozruchową i mocą
	function tractiveForce(train, v, level) {
		if (level <= 0) return 0;
		const fMax = train.maxForce * level;
		const fPower = v > 0.5 ? (train.maxPower * level) / v : fMax;
		let force = Math.min(fMax, fPower);
		const over = v - train.vmax;
		if (over > 0) force *= Math.max(0, 1 - over / 2);
		return force;
	}

	/**
	 * Jeden krok symulacji.
	 * grade – pochylenie jako ułamek (0.005 = 5‰ pod górę).
	 */
	function step(state, train, cmd, grade, dt) {
		state.traction = approach(state.traction, cmd.power, 0.9, 2.5, dt);
		state.emergency = cmd.emergency;
		state.brake = approach(state.brake, cmd.brake, cmd.emergency ? 3 : 0.6, 0.8, dt);
		const decelMax = cmd.emergency ? train.emergencyDecel : train.serviceDecel;

		const v = state.v;
		const meff = train.mass * train.rotFactor;
		const drive = (tractiveForce(train, v, state.traction) - train.mass * G * grade) / meff;
		const brakeDecel = state.brake * decelMax;
		let nv;
		if (v <= 0) {
			// postój: pociąg rusza tylko, gdy napęd (lub spadek) pokona hamulce i opór startowy
			const net = drive - brakeDecel - train.davisA / meff;
			nv = net > 0 ? net * dt : 0;
		} else {
			const a = drive - resistance(train, v) / meff - brakeDecel;
			nv = Math.max(0, v + a * dt);
		}
		state.a = (nv - v) / dt;
		state.pos += ((v + nv) / 2) * dt;
		state.v = nv;
		return state;
	}

	function brakingDistance(v, decel) {
		return decel > 0 ? (v * v) / (2 * decel) : Infinity;
	}

	// Szacowana droga hamowania z uwzględnieniem czasu napełniania cylindrów
	function brakingEstimate(v, decel) {
		return v * BRAKE_DELAY * 0.5 + brakingDistance(v, decel);
	}

	return {
		G, LEVER_MIN, LEVER_MAX, BRAKE_STEPS,
		leverCommand, leverLabel, createState, step,
		resistance, tractiveForce, brakingDistance, brakingEstimate,
	};
});
