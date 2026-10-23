/**
 * The Piper voice itself: phonemes with eSpeak (phonemizer), audio with ONNX
 * Runtime (plain WebAssembly build, one thread). Used by the background worker
 * and, when a worker doesn't work on a device, directly on the page.
 */
import * as ort from 'onnxruntime-web/wasm';
import { phonemize } from 'phonemizer';
import { phonemeIds, splitPunctuation, type PiperConfig } from './piper';

export type Progress = (fraction: number, label: string) => void;
export type Log = (line: string) => void;

const secs = (t0: number) => `${((performance.now() - t0) / 1000).toFixed(1)} s`;

/** Downloads a file once and keeps it for offline use. */
async function cachedBytes(url: string, onProgress: (loaded: number, total: number) => void): Promise<{ bytes: ArrayBuffer; cached: boolean }> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open('piper-voices');
    const hit = await cache.match(url);
    if (hit) return { bytes: await hit.arrayBuffer(), cached: true };
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body?.getReader();
  let bytes: ArrayBuffer;
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
    bytes = all.buffer;
  } else bytes = await res.arrayBuffer();
  try {
    await cache?.put(url, new Response(bytes.slice(0), { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    /* storage full: works this time, downloads again next time */
  }
  return { bytes, cached: false };
}

export class PiperVoiceRunner {
  private session: ort.InferenceSession | null = null;
  private config: PiperConfig | null = null;

  constructor(private log: Log) {}

  get loaded() {
    return !!this.session;
  }

  async load(modelUrl: string, configUrl: string, wasmPaths: string, onProgress: Progress) {
    if (this.session) return;
    ort.env.wasm.wasmPaths = wasmPaths;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    let t = performance.now();
    this.config = JSON.parse(new TextDecoder().decode((await cachedBytes(configUrl, () => undefined)).bytes)) as PiperConfig;
    const model = await cachedBytes(modelUrl, (loaded, total) =>
      onProgress(total ? loaded / total : 0, `Downloading the voice (${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6) || '?'} MB)…`),
    );
    this.log(`model ${model.cached ? 'from storage' : 'downloaded'} (${Math.round(model.bytes.byteLength / 1e6)} MB) in ${secs(t)}`);
    onProgress(1, 'Starting the voice…');
    t = performance.now();
    this.session = await ort.InferenceSession.create(new Uint8Array(model.bytes), { executionProviders: ['wasm'] });
    this.log(`voice started in ${secs(t)}`);
    t = performance.now();
    await this.ipa('Hi.');
    this.log(`phonemes ready in ${secs(t)}`);
  }

  private async ipa(text: string): Promise<string> {
    const lang = this.config?.espeak?.voice ?? 'en-us';
    const parts = await Promise.all(splitPunctuation(text).map(async (p) => (p.punct ? p.text : (await phonemize(p.text, lang)).join(' '))));
    return parts.join('').replace(/\s+/g, ' ').trim();
  }

  async synth(text: string): Promise<{ samples: Float32Array; sampleRate: number }> {
    if (!this.session || !this.config) throw new Error('Voice not loaded');
    let t = performance.now();
    const ids = phonemeIds(await this.ipa(text), this.config.phoneme_id_map);
    const tPh = secs(t);
    const inf = this.config.inference ?? {};
    t = performance.now();
    const out = await this.session.run({
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, inf.length_scale ?? 1, inf.noise_w ?? 0.8]), [3]),
    });
    const samples = Float32Array.from((out[this.session.outputNames[0]].data as Float32Array) ?? []);
    const sampleRate = this.config.audio.sample_rate;
    this.log(`sentence (${text.length} chars): phonemes ${tPh}, audio ${secs(t)} for ${(samples.length / sampleRate).toFixed(1)} s of speech`);
    return { samples, sampleRate };
  }
}
