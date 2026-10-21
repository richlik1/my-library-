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

export class KokoroEngine implements NeuralEngine {
  readonly id = 'kokoro';
  readonly label = 'Kokoro natural voices';
  private tts: KokoroLike | null = null;
  private loading: Promise<void> | null = null;
  /** Synthesis runs one sentence at a time; the model is not re-entrant. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: { modelId?: string; device?: 'wasm' | 'webgpu' | 'cpu'; modelHost?: string } = {}) {}

  isLoaded() {
    return !!this.tts;
  }

  voices() {
    return KOKORO_VOICES;
  }

  load(onProgress?: LoadProgress): Promise<void> {
    if (this.tts) return Promise.resolve();
    this.loading ??= (async () => {
      const { KokoroTTS, env } = await import('kokoro-js');
      // Serve the WebAssembly runtime from this app instead of a CDN (offline-friendly, private).
      if (typeof document !== 'undefined') env.wasmPaths = new URL('ort/', document.baseURI).href;
      // Optional: load the model from your own server instead of Hugging Face.
      const host = this.opts.modelHost ?? (globalThis as { __MY_LIBRARY_MODEL_HOST__?: string }).__MY_LIBRARY_MODEL_HOST__;
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
      onProgress?.(1, 'Voice model ready');
    })().catch((e) => {
      this.loading = null;
      throw e;
    });
    return this.loading;
  }

  synthesize(text: string, voice: string): Promise<SynthResult> {
    const run = async () => {
      await this.load();
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
