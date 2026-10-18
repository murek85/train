/* Swobodna kamera (F w czasie jazdy): lot nad mapą do sprawdzania otoczenia, stacji i torów. Symulacja stoi,
   świat doładowuje się wokół kamery (kilometraż kamery = rzut jej pozycji na oś trasy). Sterowanie:
   WASD / strzałki – ruch w poziomie, Q / E – w dół / w górę, Shift – szybciej, przeciąganie myszą – rozglądanie,
   kółko – wysokość. */
import * as THREE from 'three';

(function () {
	'use strict';
	const T = THREE;
	const R = window.TrainRoutes;
	const NS = window.Train3D;
	const proto = NS.Renderer3D.prototype;
	const tp = {};
	const MIN_H = 1.7; // wysokość oczu pieszego nad terenem
	const MAX_D = 700; // dalej od toru nie ma otoczenia

	// rzut punktu (x, z) na oś trasy: kilometraż s i odsunięcie d (d > 0 – w prawo); hint – poprzednie s
	function project(route, x, z, hint) {
		let s = hint;
		for (let k = 0; k < 6; k++) {
			R.trackPoint(route, s, tp);
			const ds = (x - tp.x) * Math.sin(tp.heading) - (z - tp.z) * Math.cos(tp.heading);
			s = Math.max(-400, Math.min(route.length + 400, s + ds));
			if (Math.abs(ds) < 0.05) break;
		}
		R.trackPoint(route, s, tp);
		return { s, d: (x - tp.x) * Math.cos(tp.heading) + (z - tp.z) * Math.sin(tp.heading) };
	}

	proto.freeStart = function (sim) {
		const c = this.camera, dir = c.getWorldDirection(new T.Vector3());
		const p = project(sim.route, c.position.x, c.position.z, sim.st.pos);
		this.free = {
			x: c.position.x, y: c.position.y, z: c.position.z,
			yaw: Math.atan2(dir.x, -dir.z), pitch: Math.asin(Math.max(-1, Math.min(1, dir.y))),
			s: p.s, d: p.d, keys: {}, speed: 1,
		};
		if (this.cab) this.cab.setVisible(false);
	};

	proto.freeStop = function () {
		this.free = null;
		this.world.streamS = null;
		this.world.warm = true; // kawałki przy pociągu od razu, bez doładowywania po dwa na klatkę
		this.camState.snap = true;
	};

	proto.freeLook = function (dx, dy) {
		const f = this.free;
		f.yaw += dx * 0.0045;
		f.pitch = Math.max(-1.5, Math.min(1.2, f.pitch - dy * 0.0045));
	};

	proto.freeWheel = function (dy) {
		const f = this.free;
		const g = this.world.terrainY(f.s, f.d);
		f.y = Math.max(g + MIN_H, f.y - dy * 0.0025 * (f.y - g + 6));
	};

	// kamera w punkcie (s, d) na wysokości h nad terenem, patrząca na punkt (ts, td) na wysokości th
	proto.freeTeleport = function (route, s, d, h, ts, td, th) {
		const f = this.free;
		R.sidePoint(route, s, d, tp);
		f.x = tp.x; f.z = tp.z; f.s = s; f.d = d;
		f.y = this.world.terrainY(s, d) + h;
		R.sidePoint(route, ts, td, tp);
		const dx = tp.x - f.x, dz = tp.z - f.z, dy = this.world.terrainY(ts, td) + (th || 0) - f.y;
		f.yaw = Math.atan2(dx, -dz);
		f.pitch = Math.atan2(dy, Math.hypot(dx, dz));
		this.world.warm = true;
	};

	proto.freeUpdate = function (sim, dt) {
		const f = this.free, k = f.keys, route = sim.route, w = this.world;
		const ground0 = w.terrainY(f.s, f.d);
		const sp = f.speed * (8 + 0.9 * Math.max(0, f.y - ground0)) * (k.ShiftLeft || k.ShiftRight ? 4 : 1);
		const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
		const side = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
		const up = (k.KeyE || k.PageUp ? 1 : 0) - (k.KeyQ || k.PageDown ? 1 : 0);
		const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
		f.x += (sy * fwd + cy * side) * sp * dt;
		f.z += (-cy * fwd + sy * side) * sp * dt;
		f.y += up * sp * 0.7 * dt;
		let p = project(route, f.x, f.z, f.s);
		if (Math.abs(p.d) > MAX_D) {
			// poza pasem otoczenia – cofnij na granicę
			R.sidePoint(route, p.s, Math.sign(p.d) * MAX_D, tp);
			f.x = tp.x; f.z = tp.z;
			p = { s: p.s, d: Math.sign(p.d) * MAX_D };
		}
		// tunel na trasie z mapy: kamera, która wleciała portalem, porusza się we wnętrzu (podłoga, strop, ściany)
		const tun = w.freeTunnel ? w.freeTunnel(p.s, f.y) : null;
		if (tun && (p.d < tun.l || p.d > tun.r)) {
			R.sidePoint(route, p.s, Math.max(tun.l, Math.min(tun.r, p.d)), tp);
			f.x = tp.x; f.z = tp.z;
			p = { s: p.s, d: Math.max(tun.l, Math.min(tun.r, p.d)) };
		}
		f.s = p.s; f.d = p.d;
		const ground = tun ? tun.floor : w.terrainY(f.s, f.d);
		f.y = Math.max(ground + MIN_H, Math.min(tun ? tun.ceil : ground + 900, f.y));
		const cp = Math.cos(f.pitch);
		const c = this.camera;
		c.position.set(f.x, f.y, f.z);
		c.lookAt(f.x + sy * cp, f.y + Math.sin(f.pitch), f.z - cy * cp);
		this.setNear(f.y - ground < 4 ? 0.15 : 0.5);
		this.viewMode = 'free';
		const fov = Math.round(Math.min(55, (2 * Math.atan(Math.tan((105 * Math.PI) / 360) / c.aspect) * 180) / Math.PI) * 10) / 10;
		if (c.fov !== fov) { c.fov = fov; c.updateProjectionMatrix(); }
		if (this.cab) this.cab.setVisible(false);
		// środek uwagi (cienie, ruch uliczny, opady): punkt na ziemi przed kamerą
		const h = f.y - ground, ahead = Math.min(120, 10 + h * 1.2);
		this.focus.set(f.x + sy * ahead, ground, f.z - cy * ahead);
		w.streamS = f.s;
		this.aimSun(ground, Math.max(30, h));
	};

	// odczyt dla panelu: kilometraż, odsunięcie, wysokość nad terenem, najbliższa stacja
	proto.freeInfo = function (route) {
		const f = this.free;
		let best = null;
		for (const st of route.stations) {
			const mid = (st.platformStart + st.platformEnd) / 2, dd = Math.abs(mid - f.s);
			if (!best || dd < best.dist) best = { name: st.name, dist: dd, ahead: mid > f.s };
		}
		return { s: f.s, d: f.d, h: f.y - this.world.terrainY(f.s, f.d), station: best };
	};
})();
