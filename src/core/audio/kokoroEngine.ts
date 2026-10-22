import type { LoadProgress, NeuralEngine, NeuralVoice, SynthResult } from './types';

/**
 * Kokoro-82M (Apache-2.0) running in the browser through kokoro-js
 * (ONNX Runtime Web). Free and private: the model (~92 MB, q8) is downloaded
 * once from Hugging Face and cached by the browser; text never leaves the device.
 */

export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/** English voices with Kokoro's published quality grades, best first. */
export const KOKORO_VOICES: NeuralVoice[] = [
  { id: 'af_heart', name: 'Heart', gender: 'female', accent: 'American', grade: 'A' },
  { id: 'af_bella', name: 'Bella', gender: 'female', accent: 'American', grade: 'A-' },
  { id: 'af_nicole', name: 'Nicole', gender: 'female', accent: 'American', grade: 'B-' },
  { id: 'bf_emma', name: 'Emma', gender: 'female', accent: 'British', grade: 'B-' },
  { id: 'am_michael', name: 'Michael', gender: 'male', accent: 'American', grade: 'C+' },
  { id: 'am_fenrir', name: 'Fenrir', gender: 'male', accent: 'American', grade: 'C+' },
  { id: 'am_puck', name: 'Puck', gender: 'male', accent: 'American', grade: 'C+' },
  { id: 'af_aoede', name: 'Aoede', gender: 'female', accent: 'American', grade: 'C+' },
  { id: 'af_kore', name: 'Kore', gender: 'female', accent: 'American', grade: 'C+' },
  { id: 'af_sarah', name: 'Sarah', gender: 'female', accent: 'American', grade: 'C+' },
  { id: 'bm_george', name: 'George', gender: 'male', accent: 'British', grade: 'C' },
  { id: 'bm_fable', name: 'Fable', gender: 'male', accent: 'British', grade: 'C' },
  { id: 'bf_isabella', name: 'Isabella', gender: 'female', accent: 'British', grade: 'C' },
  { id: 'af_alloy', name: 'Alloy', gender: 'female', accent: 'American', grade: 'C' },
  { id: 'af_nova', name: 'Nova', gender: 'female', accent: 'American', grade: 'C' },
  { id: 'bm_lewis', name: 'Lewis', gender: 'male', accent: 'British', grade: 'D+' },
  { id: 'am_echo', name: 'Echo', gender: 'male', accent: 'American', grade: 'D' },
  { id: 'am_eric', name: 'Eric', gender: 'male', accent: 'American', grade: 'D' },
  { id: 'am_liam', name: 'Liam', gender: 'male', accent: 'American', grade: 'D' },
  { id: 'am_onyx', name: 'Onyx', gender: 'male', accent: 'American', grade: 'D' },
  { id: 'bm_daniel', name: 'Daniel', gender: 'male', accent: 'British', grade: 'D' },
];

export const DEFAULT_KOKORO_VOICE = 'af_heart';

interface KokoroLike {
  generate(text: string, opts: { voice: string; speed?: number }): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

type WorkerReply =
  | { id: number; type: 'progress'; fraction: number; label: string }
  | { id: number; type: 'done' }
  | { id: number; type: 'result'; samples: Float32Array; sampleRate: number }
  | { id: number; type: 'error'; message: string };

/** Threads for ONNX Runtime: more than one needs a cross-origin isolated page. */
export function voiceThreads(): number {
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  return isolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
}

export class KokoroEngine implements NeuralEngine {
  readonly id = 'kokoro';
  readonly label = 'Kokoro natural voices';
  private tts: KokoroLike | null = null;
  private worker: Worker | null = null;
  private workerReady = false;
  private loading: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve(r: WorkerReply): void; reject(e: Error): void; progress?: LoadProgress }>();
  /** Synthesis runs one sentence at a time; the model is not re-entrant. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: { modelId?: string; device?: 'wasm' | 'webgpu' | 'cpu'; modelHost?: string; inThread?: boolean } = {}) {}

  isLoaded() {
    return !!this.tts || this.workerReady;
  }

  voices() {
    return KOKORO_VOICES;
  }

  /** Where the work runs: a background thread (normal) or the page itself (fallback). */
  get runsIn(): 'worker' | 'page' | 'not loaded' {
    return this.workerReady ? 'worker' : this.tts ? 'page' : 'not loaded';
  }

  load(onProgress?: LoadProgress): Promise<void> {
    if (this.isLoaded()) return Promise.resolve();
    this.loading ??= (async () => {
      const canWorker = !this.opts.inThread && typeof Worker !== 'undefined' && typeof document !== 'undefined' && this.opts.device !== 'cpu';
      if (canWorker) {
        const threads = voiceThreads();
        for (const t of threads > 1 ? [threads, 1] : [1]) {
          try {
            await this.loadInWorker(onProgress, t);
            this.workerReady = true;
            this.threads = t;
            onProgress?.(1, 'Voice model ready');
            return;
          } catch (e) {
            this.worker?.terminate();
            this.worker = null;
            // Several cores didn't work on this device: try again with one (the model is cached by now).
            if (t > 1) continue;
            // A failed download won't work any better on the page; only fall back when the worker itself can't start.
            if (!(e as Error & { workerStart?: boolean }).workerStart) throw e;
          }
        }
      }
      await this.loadInPage(onProgress);
      onProgress?.(1, 'Voice model ready');
    })().catch((e) => {
      this.loading = null;
      throw e;
    });
    return this.loading;
  }

  private modelHost() {
    return this.opts.modelHost ?? (globalThis as { __MY_LIBRARY_MODEL_HOST__?: string }).__MY_LIBRARY_MODEL_HOST__;
  }

  /** Processor threads the loaded model uses. */
  threads = 1;

  private loadInWorker(onProgress?: LoadProgress, threads = 1): Promise<void> {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./kokoroWorker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      throw Object.assign(new Error((e as Error).message), { workerStart: true });
    }
    this.worker = worker;
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      if (e.data.type === 'progress') return p.progress?.(e.data.fraction, e.data.label);
      this.pending.delete(e.data.id);
      if (e.data.type === 'error') p.reject(new Error(e.data.message));
      else p.resolve(e.data);
    };
    worker.onerror = (e) => {
      e.preventDefault?.();
      const err = Object.assign(new Error(e.message || 'The voice worker stopped'), { workerStart: !this.workerReady });
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      if (this.workerReady) {
        // The worker crashed (often out of memory). Load again next time.
        this.workerReady = false;
        this.loading = null;
        this.worker = null;
      }
    };
    return this.call(
      {
        type: 'load',
        modelId: this.opts.modelId ?? KOKORO_MODEL_ID,
        device: this.opts.device === 'webgpu' ? 'webgpu' : 'wasm',
        wasmPaths: new URL('ort/', document.baseURI).href,
        host: this.modelHost(),
        threads,
      },
      onProgress,
    ).then(() => undefined);
  }

  private call(msg: Record<string, unknown>, progress?: LoadProgress): Promise<WorkerReply> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress });
      this.worker!.postMessage({ ...msg, id });
    });
  }

  private async loadInPage(onProgress?: LoadProgress) {
    const { KokoroTTS, env } = await import('kokoro-js');
    // Serve the WebAssembly runtime from this app instead of a CDN (offline-friendly, private).
    if (typeof document !== 'undefined') env.wasmPaths = new URL('ort/', document.baseURI).href;
    // Optional: load the model from your own server instead of Hugging Face.
    const host = this.modelHost();
    if (host) {
      const transformers = await import('@huggingface/transformers');
      transformers.env.remoteHost = host.endsWith('/') ? host : `${host}/`;
    }
    const device = this.opts.device ?? 'wasm';
    const files = new Map<string, { loaded: number; total: number }>();
    this.tts = (await KokoroTTS.from_pretrained(this.opts.modelId ?? KOKORO_MODEL_ID, {
      // q8 (92 MB) for WASM; WebGPU needs full precision (larger download, much faster).
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      device,
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && p.file && p.total) {
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
          const loaded = [...files.values()].reduce((s, f) => s + f.loaded, 0);
          const total = [...files.values()].reduce((s, f) => s + f.total, 0);
          onProgress?.(total ? loaded / total : 0, `Downloading the voice model (${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6)} MB)…`);
        }
      },
    })) as unknown as KokoroLike;
  }

  synthesize(text: string, voice: string): Promise<SynthResult> {
    const run = async (): Promise<SynthResult> => {
      await this.load();
      if (this.workerReady) {
        const r = await this.call({ type: 'synth', text, voice });
        if (r.type !== 'result') throw new Error('No audio returned');
        return { samples: r.samples, sampleRate: r.sampleRate };
      }
      const out = await this.tts!.generate(text, { voice, speed: 1 });
      return { samples: out.audio, sampleRate: out.sampling_rate };
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}

/** True when the browser offers WebGPU (e.g. Safari 26, recent Chrome). */
export async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}
