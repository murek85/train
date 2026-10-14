/* Piper – obsługa wątku syntezy (js/tts-worker.js) po stronie gry: polskie głosy, wczytanie (pobranie przy pierwszym
   użyciu, z postępem), synteza tekstu do próbek (Float32Array) odtwarzanych potem przez silnik dźwięku gry (WebAudio –
   przeglądarka nie przerywa ich przy kliknięciu, jak bywa z syntezą systemową w Brave). */
(function () {
	'use strict';

	const VOICES = [
		{ id: 'pl_PL-gosia-medium', name: 'Gosia (kobieta)' },
		{ id: 'pl_PL-darkman-medium', name: 'Darkman (mężczyzna)' },
		{ id: 'pl_PL-mc_speech-medium', name: 'MC Speech (mężczyzna)' },
	];
	const SIZE_MB = 63; // model głosu; silnik i fonemizer – ok. 30 MB jednorazowo

	let worker = null, seq = 0, loaded = null, loadingVoice = null;
	const waiting = new Map(); // id → { resolve, reject, progress }

	function ensure() {
		if (worker) return worker;
		worker = new Worker('js/tts-worker.js');
		worker.onmessage = (e) => {
			const m = e.data, w = waiting.get(m.id);
			if (!w) return;
			if (m.type === 'progress') { if (w.progress) w.progress(m); return; }
			waiting.delete(m.id);
			if (m.type === 'error') w.reject(new Error(m.message));
			else w.resolve(m);
		};
		worker.onerror = (e) => {
			for (const w of waiting.values()) w.reject(new Error(e.message || 'Błąd wątku syntezy mowy.'));
			waiting.clear();
		};
		return worker;
	}
	function call(msg, progress) {
		const id = ++seq;
		return new Promise((resolve, reject) => {
			waiting.set(id, { resolve, reject, progress });
			ensure().postMessage(Object.assign({ id }, msg));
		});
	}

	window.TrainPiper = {
		VOICES,
		SIZE_MB,
		get loaded() { return loaded; },
		get loading() { return loadingVoice; },
		// wczytanie głosu (pobranie przy pierwszym użyciu); progress({ what, loaded, total })
		async load(voice, progress) {
			if (loaded === voice) return;
			loadingVoice = voice;
			try {
				await call({ type: 'load', voice }, progress);
				loaded = voice;
			} finally {
				if (loadingVoice === voice) loadingVoice = null;
			}
		},
		// tekst → { pcm, sampleRate }; length – mnożnik długości (tempo)
		async synth(text, length) {
			const r = await call({ type: 'synth', text, length });
			return { pcm: r.pcm, sampleRate: r.sampleRate };
		},
		// głosy już pobrane: { id: true/false }
		async cached() {
			if (!window.caches) return {};
			return (await call({ type: 'cached', voices: VOICES.map((v) => v.id) })).have;
		},
	};
})();
