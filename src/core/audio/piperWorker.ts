/// <reference lib="webworker" />
/** Runs a Piper voice in a background thread: phonemes with eSpeak (phonemizer), audio with ONNX Runtime. */
import * as ort from 'onnxruntime-web/webgpu';
import { phonemize } from 'phonemizer';
import { phonemeIds, splitPunctuation, type PiperConfig } from './piper';

type In =
  | { id: number; type: 'load'; modelUrl: string; configUrl: string; wasmPaths: string; hang?: boolean }
  | { id: number; type: 'synth'; text: string };

let session: ort.InferenceSession | null = null;
let config: PiperConfig | null = null;
let hang = false;
const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

/** Downloads a file once and keeps it for offline use. */
async function cachedBytes(url: string, onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open('piper-voices');
    const hit = await cache.match(url);
    if (hit) return await hit.arrayBuffer();
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body?.getReader();
  let buf: ArrayBuffer;
  if (reader) {
    const parts: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
    const all = new Uint8Array(loaded);
    let o = 0;
    for (const p of parts) {
      all.set(p, o);
      o += p.length;
    }
    buf = all.buffer;
  } else buf = await res.arrayBuffer();
  try {
    await cache?.put(url, new Response(buf.slice(0), { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    /* storage full: works this time, downloads again next time */
  }
  return buf;
}

async function toIpa(text: string, lang: string): Promise<string> {
  const parts = await Promise.all(splitPunctuation(text).map(async (p) => (p.punct ? p.text : (await phonemize(p.text, lang)).join(' '))));
  return parts.join('').replace(/\s+/g, ' ').trim();
}

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      hang = !!m.hang;
      if (!session) {
        ort.env.wasm.wasmPaths = m.wasmPaths;
        ort.env.wasm.numThreads = 1;
        config = JSON.parse(new TextDecoder().decode(await cachedBytes(m.configUrl, () => undefined))) as PiperConfig;
        const model = await cachedBytes(m.modelUrl, (loaded, total) =>
          post({ id: m.id, type: 'progress', fraction: total ? loaded / total : 0, label: `Downloading the voice (${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6) || '?'} MB)…` }),
        );
        post({ id: m.id, type: 'progress', fraction: 1, label: 'Starting the voice…' });
        session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
      }
      post({ id: m.id, type: 'done' });
    } else {
      if (!session || !config) throw new Error('Voice not loaded');
      if (hang) return;
      const ipa = await toIpa(m.text, config.espeak?.voice ?? 'en-us');
      const ids = phonemeIds(ipa, config.phoneme_id_map);
      const inf = config.inference ?? {};
      const feeds: Record<string, ort.Tensor> = {
        input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, inf.length_scale ?? 1, inf.noise_w ?? 0.8]), [3]),
      };
      const out = await session.run(feeds);
      const samples = Float32Array.from((out[session.outputNames[0]].data as Float32Array) ?? []);
      post({ id: m.id, type: 'result', samples, sampleRate: config.audio.sample_rate }, [samples.buffer]);
    }
  } catch (err) {
    post({ id: m.id, type: 'error', message: (err as Error)?.message ?? String(err) });
  }
};
