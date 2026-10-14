/* Piper – synteza mowy siecią neuronową (VITS, model ONNX) w osobnym wątku (Web Worker), bez blokowania gry.
   Pliki pobierane przy pierwszym użyciu i zapamiętywane w pamięci podręcznej przeglądarki (Cache Storage „maszynista-
   piper”) – potem działa bez internetu: silnik ONNX Runtime Web (cdnjs, ok. 11 MB), fonemizer eSpeak NG (piper-wasm,
   jsDelivr, ok. 19 MB – tekst na fonemy) i model głosu (HuggingFace, ok. 63 MB na głos).
   Wiadomości: { type: 'load', voice, id } → 'progress' { what, loaded, total } … 'ready' | 'error';
   { type: 'synth', text, length, id } → 'audio' { pcm (Float32Array), sampleRate } | 'error'. */
'use strict';

const ORT = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/';
const PHON = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const VOICES = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/';
const CACHE = 'maszynista-piper-v1';

let session = null, config = null, voiceId = null, phon = null, loading = null;

// plik z pamięci podręcznej albo z sieci (z postępem, zapisany w pamięci podręcznej); wynik – ArrayBuffer
async function cached(url, what, id) {
	// pamięć podręczna niedostępna (np. nietypowy protokół strony) – pobieranie za każdym razem
	let cache = null;
	try { cache = await caches.open(CACHE); } catch (e) { cache = null; }
	const hit = cache && (await cache.match(url));
	if (hit) return hit.arrayBuffer();
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Nie udało się pobrać ${what} (HTTP ${res.status}).`);
	const total = +(res.headers.get('content-length') || 0);
	const reader = res.body.getReader(), parts = [];
	let loaded = 0, last = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		parts.push(value);
		loaded += value.length;
		if (loaded - last > 512 * 1024) { last = loaded; postMessage({ type: 'progress', id, what, loaded, total }); }
	}
	const buf = await new Blob(parts).arrayBuffer();
	if (cache) {
		try { await cache.put(url, new Response(buf, { headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream' } })); } catch (e) { /* bez zapisu */ }
	}
	postMessage({ type: 'progress', id, what, loaded: total || loaded, total: total || loaded });
	return buf;
}
const blobUrl = (buf, type) => URL.createObjectURL(new Blob([buf], { type }));

async function load(voice, id) {
	if (!self.ort) {
		importScripts(blobUrl(await cached(ORT + 'ort.wasm.min.js', 'silnika ONNX', id), 'text/javascript'));
		const wasm = blobUrl(await cached(ORT + 'ort-wasm-simd.wasm', 'silnika ONNX', id), 'application/wasm');
		ort.env.wasm.numThreads = 1; // bez izolacji między źródłami – jeden wątek (i tak osobny od gry)
		ort.env.wasm.wasmPaths = { 'ort-wasm-simd.wasm': wasm, 'ort-wasm.wasm': wasm };
	}
	if (!phon) {
		importScripts(blobUrl(await cached(PHON + '.js', 'fonemizera', id), 'text/javascript'));
		phon = {
			wasm: blobUrl(await cached(PHON + '.wasm', 'fonemizera', id), 'application/wasm'),
			data: blobUrl(await cached(PHON + '.data', 'fonemizera', id), 'application/octet-stream'),
		};
	}
	if (voiceId !== voice) {
		// pl_PL-gosia-medium → pl/pl_PL/gosia/medium/pl_PL-gosia-medium.onnx
		const [loc, name, q] = voice.split('-');
		const path = `${VOICES}${loc.split('_')[0]}/${loc}/${name}/${q}/${voice}.onnx`;
		config = JSON.parse(new TextDecoder().decode(await cached(path + '.json', 'opisu głosu', id)));
		session = await ort.InferenceSession.create(await cached(path, 'modelu głosu', id), { executionProviders: ['wasm'] });
		voiceId = voice;
	}
}

// tekst → identyfikatory fonemów (eSpeak NG w module piper_phonemize – nowa instancja na wywołanie, jak w Piperze)
function phonemes(text) {
	return new Promise((resolve, reject) => {
		createPiperPhonemize({
			print: (data) => { try { resolve(JSON.parse(data).phoneme_ids); } catch (e) { reject(e); } },
			printErr: (m) => reject(new Error(m)),
			locateFile: (u) => (u.endsWith('.wasm') ? phon.wasm : u.endsWith('.data') ? phon.data : u),
		}).then((m) => m.callMain(['-l', config.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']), reject);
	});
}

/* synteza: zdania osobno (krótsze wejście – szybciej i stabilniej), złączone z krótką przerwą; length – mnożnik
   długości (tempo mowy: większy – wolniej) */
async function synth(text, length) {
	const inf = config.inference || {};
	const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
	const pcms = [];
	const gap = new Float32Array(Math.round(config.audio.sample_rate * 0.12));
	for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
		const ids = await phonemes(p);
		const feeds = {
			input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
			input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
			scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) * length, inf.noise_w ?? 0.8])),
		};
		if (config.speaker_id_map && Object.keys(config.speaker_id_map).length) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]));
		const out = await session.run(feeds);
		if (pcms.length) pcms.push(gap);
		pcms.push(out.output.data);
	}
	const pcm = new Float32Array(pcms.reduce((a, b) => a + b.length, 0));
	let o = 0;
	for (const p of pcms) { pcm.set(p, o); o += p.length; }
	return pcm;
}

self.onmessage = async (e) => {
	const m = e.data;
	try {
		if (m.type === 'load') {
			loading = load(m.voice, m.id);
			await loading;
			postMessage({ type: 'ready', id: m.id, voice: m.voice });
		} else if (m.type === 'synth') {
			if (loading) await loading;
			if (!session) throw new Error('Głos Pipera nie jest wczytany.');
			const pcm = await synth(m.text, m.length || 1);
			postMessage({ type: 'audio', id: m.id, pcm, sampleRate: config.audio.sample_rate }, [pcm.buffer]);
		} else if (m.type === 'cached') {
			// które pliki są już w pamięci podręcznej (lista adresów modeli głosów)
			let cache = null;
			try { cache = await caches.open(CACHE); } catch (e) { cache = null; }
			const have = {};
			for (const v of m.voices) {
				if (!cache) { have[v] = false; continue; }
				const [loc, name, q] = v.split('-');
				have[v] = !!(await cache.match(`${VOICES}${loc.split('_')[0]}/${loc}/${name}/${q}/${v}.onnx`));
			}
			postMessage({ type: 'cached', id: m.id, have });
		}
	} catch (err) {
		loading = null;
		postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
	}
};
