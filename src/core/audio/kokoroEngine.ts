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

export type VoiceMode = 'threads' | 'single' | 'page';

const MODE_KEY = 'ml-voice-mode';
const LOAD_STALL_MS = 120_000;
const SYNTH_BASE_MS = 45_000;
const SYNTH_PER_CHAR_MS = 600;
const PROBE_MS = 45_000;

/** What happened while starting and running the voice on this device (shown in Settings, for troubleshooting). */
const voiceLog: string[] = [];
export function vlog(line: string) {
  voiceLog.push(`${new Date().toLocaleTimeString()} ${line}`);
  if (voiceLog.length > 40) voiceLog.shift();
}
export const getVoiceLog = () => [...voiceLog];

function savedMode(): VoiceMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'threads' || v === 'single' || v === 'page' ? v : null;
  } catch {
    return null;
  }
}

function saveMode(m: VoiceMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* private mode */
  }
}

/** Forget a saved fallback (e.g. after an app update that may fix it). */
export function resetVoiceMode() {
  try {
    localStorage.removeItem(MODE_KEY);
  } catch {
    /* ignore */
  }
}

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

  /** How the model is running: several cores in the background, one core in the background, or on the page. */
  mode: VoiceMode | null = null;
  /** A sentence has been made since the model was (re)loaded. */
  private warm = false;

  private modes(): VoiceMode[] {
    const canWorker = !this.opts.inThread && typeof Worker !== 'undefined' && typeof document !== 'undefined' && this.opts.device !== 'cpu';
    const list: VoiceMode[] = [];
    if (canWorker && voiceThreads() > 1) list.push('threads');
    if (canWorker) list.push('single');
    list.push('page');
    return list;
  }

  load(onProgress?: LoadProgress): Promise<void> {
    if (this.isLoaded()) return Promise.resolve();
    this.loading ??= (async () => {
      const modes = this.modes();
      // Start with the way that last worked on this device (a mode that got stuck is skipped from then on).
      const start = Math.max(0, modes.indexOf(savedMode() ?? modes[0]));
      let lastError: unknown = null;
      vlog(`start: modes ${modes.join(' > ')}, from ${modes[start]}; isolated=${typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated}, cores=${navigator.hardwareConcurrency}, device=${this.opts.device ?? 'wasm'}`);
      for (let i = start; i < modes.length; i++) {
        const m = modes[i];
        const t0 = Date.now();
        try {
          if (m === 'page') await this.loadInPage(onProgress);
          else {
            const threads = m === 'threads' ? voiceThreads() : 1;
            await this.loadInWorker(onProgress, threads);
            this.workerReady = true;
            this.threads = threads;
            vlog(`${m}: model loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
            // Prove it can speak before using it: some phones load the model, then never finish a sentence.
            onProgress?.(1, 'Testing the voice…');
            const t1 = Date.now();
            const probeMs = (globalThis as { __MY_LIBRARY_VOICE_PROBE_MS__?: number }).__MY_LIBRARY_VOICE_PROBE_MS__ ?? PROBE_MS;
            let timer: ReturnType<typeof setTimeout> | null = null;
            await Promise.race([
              this.call({ type: 'synth', text: 'Hi.', voice: DEFAULT_KOKORO_VOICE }),
              new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error(`no answer to a test word in ${probeMs / 1000} s`)), probeMs))),
            ]).finally(() => timer && clearTimeout(timer));
            vlog(`${m}: test word in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
            this.warm = true;
          }
          this.mode = m;
          saveMode(m);
          onProgress?.(1, 'Voice model ready');
          return;
        } catch (e) {
          vlog(`${m}: failed after ${((Date.now() - t0) / 1000).toFixed(0)} s: ${(e as Error)?.message ?? e}`);
          lastError = e;
          this.stopWorker();
          this.workerReady = false;
          if (i + 1 < modes.length) {
            saveMode(modes[i + 1]);
            onProgress?.(0, 'Trying a safer way to run the voice…');
          }
        }
      }
      throw lastError;
    })().catch((e) => {
      this.loading = null;
      throw e;
    });
    return this.loading;
  }

  private stopWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = false;
    for (const p of this.pending.values()) p.reject(new Error('The voice was restarted'));
    this.pending.clear();
  }

  /**
   * The voice stopped responding (seen on some iPhones). Use the next safer
   * way to run it from now on; the next sentence reloads it that way.
   */
  private demote() {
    vlog(`${this.mode}: a sentence took too long; switching to a safer way`);
    const modes = this.modes();
    const i = this.mode ? modes.indexOf(this.mode) : -1;
    if (i >= 0 && i + 1 < modes.length) saveMode(modes[i + 1]);
    if (this.mode !== 'page') {
      this.warm = false;
      this.stopWorker();
      this.loading = null;
      this.mode = null;
    }
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
    // If nothing happens for two minutes after the last download progress, treat it as stuck.
    let stall: ReturnType<typeof setTimeout> | null = null;
    let rejectStall: (e: Error) => void = () => undefined;
    const stalled = new Promise<never>((_, rej) => (rejectStall = rej));
    const arm = () => {
      if (stall) clearTimeout(stall);
      stall = setTimeout(() => rejectStall(new Error('The voice model stopped responding while starting')), LOAD_STALL_MS);
    };
    arm();
    const progress: LoadProgress = (f, label) => {
      arm();
      onProgress?.(f, label);
    };
    const loaded = this.call(
      {
        type: 'load',
        modelId: this.opts.modelId ?? KOKORO_MODEL_ID,
        device: this.opts.device === 'webgpu' ? 'webgpu' : 'wasm',
        wasmPaths: new URL('ort/', document.baseURI).href,
        host: this.modelHost(),
        threads,
        // Tests can make one mode get stuck, to check the fallback.
        hang: (globalThis as { __MY_LIBRARY_VOICE_HANG__?: string }).__MY_LIBRARY_VOICE_HANG__ === (threads > 1 ? 'threads' : 'single'),
      },
      progress,
    ).then(() => undefined);
    return Promise.race([loaded, stalled]).finally(() => stall && clearTimeout(stall));
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
      // A sentence normally takes seconds; if there's no answer for much longer, the voice is stuck.
      const testBase = (globalThis as { __MY_LIBRARY_VOICE_SYNTH_MS__?: number }).__MY_LIBRARY_VOICE_SYNTH_MS__;
      // The first sentence after loading includes one-time warm-up, so it gets twice as long.
      const first = !this.warm;
      const limit = ((testBase ?? SYNTH_BASE_MS) + text.length * SYNTH_PER_CHAR_MS) * (first ? 2 : 1);
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<never>((_, rej) => {
        timer = setTimeout(() => {
          this.demote();
          rej(new Error('The voice stopped responding; switching to a safer way to run it'));
        }, limit);
      });
      const work = (async (): Promise<SynthResult> => {
        if (this.workerReady) {
          const r = await this.call({ type: 'synth', text, voice });
          if (r.type !== 'result') throw new Error('No audio returned');
          return { samples: r.samples, sampleRate: r.sampleRate };
        }
        const out = await this.tts!.generate(text, { voice, speed: 1 });
        return { samples: out.audio, sampleRate: out.sampling_rate };
      })();
      try {
        const r = await Promise.race([work, timeout]);
        this.warm = true;
        return r;
      } finally {
        if (timer) clearTimeout(timer);
      }
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
