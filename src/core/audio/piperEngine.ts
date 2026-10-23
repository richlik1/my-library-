import { vlog } from './voiceLog';
import { DEFAULT_PIPER_VOICE, PIPER_HOST, PIPER_VOICES } from './piper';
import type { PiperVoiceRunner } from './piperCore';
import type { LoadProgress, NeuralEngine, SynthResult } from './types';

type Reply =
  | { id: number; type: 'progress'; fraction: number; label: string }
  | { id: number; type: 'log'; line: string }
  | { id: number; type: 'done' }
  | { id: number; type: 'result'; samples: Float32Array; sampleRate: number }
  | { id: number; type: 'error'; message: string };

/** Where the voice runs: a background thread, or (when a device's worker doesn't work) the page itself. */
export type PiperMode = 'worker' | 'page';

const MODE_KEY = 'ml-piper-mode';
const LOAD_STALL_MS = 120_000;
const PROBE_MS = 30_000;
const SYNTH_BASE_MS = 30_000;
const SYNTH_PER_CHAR_MS = 300;

function savedMode(): PiperMode {
  const forced = (globalThis as { __MY_LIBRARY_PIPER_MODE__?: PiperMode }).__MY_LIBRARY_PIPER_MODE__;
  if (forced) return forced;
  try {
    return localStorage.getItem(MODE_KEY) === 'page' ? 'page' : 'worker';
  } catch {
    return 'worker';
  }
}

function saveMode(m: PiperMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* private mode */
  }
}

function timeout<T>(p: Promise<T>, ms: number, message: string, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    p,
    new Promise<never>(
      (_, rej) =>
        (timer = setTimeout(() => {
          onTimeout?.();
          rej(new Error(message));
        }, ms)),
    ),
  ]).finally(() => timer && clearTimeout(timer));
}

/** One Piper voice at a time; switching voices reloads it. */
export class PiperEngine implements NeuralEngine {
  readonly id = 'piper';
  readonly label = 'Piper fast natural voices';
  private mode: PiperMode = savedMode();
  private worker: Worker | null = null;
  private page: PiperVoiceRunner | null = null;
  private loadedVoice: string | null = null;
  private loading: Promise<void> | null = null;
  private loadingVoice: string | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve(r: Reply): void; reject(e: Error): void; progress?: LoadProgress }>();
  private chain: Promise<unknown> = Promise.resolve();
  /** Voice to load when load() is called without one. */
  voice = DEFAULT_PIPER_VOICE;

  isLoaded() {
    return this.loadedVoice !== null;
  }

  voices() {
    return PIPER_VOICES;
  }

  get runsIn() {
    return this.loadedVoice ? this.mode : 'not loaded';
  }

  private stop() {
    this.worker?.terminate();
    this.worker = null;
    this.page = null;
    this.loadedVoice = null;
    for (const p of this.pending.values()) p.reject(new Error('The voice was restarted'));
    this.pending.clear();
  }

  private call(msg: Record<string, unknown>, progress?: LoadProgress): Promise<Reply> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress });
      this.worker!.postMessage({ ...msg, id });
    });
  }

  private startWorker() {
    this.worker = new Worker(new URL('./piperWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<Reply>) => {
      if (e.data.type === 'log') return vlog(`piper worker: ${e.data.line}`);
      const p = this.pending.get(e.data.id);
      if (!p) return;
      if (e.data.type === 'progress') return p.progress?.(e.data.fraction, e.data.label);
      this.pending.delete(e.data.id);
      if (e.data.type === 'error') p.reject(new Error(e.data.message));
      else p.resolve(e.data);
    };
    this.worker.onerror = (e) => {
      e.preventDefault?.();
      vlog(`piper worker error: ${e.message || 'unknown'}`);
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'The voice stopped'));
      this.pending.clear();
      this.loadedVoice = null;
    };
  }

  /** Loads the voice in the current mode and makes a test word, so a stuck voice is found before Play. */
  private async loadIn(mode: PiperMode, urls: { modelUrl: string; configUrl: string; wasmPaths: string }, onProgress: (f: number, l: string) => void) {
    this.stop();
    this.mode = mode;
    let stall: ReturnType<typeof setTimeout> | null = null;
    let fail: (e: Error) => void = () => undefined;
    const stalled = new Promise<never>((_, rej) => (fail = rej));
    const arm = () => {
      if (stall) clearTimeout(stall);
      stall = setTimeout(() => fail(new Error('The voice stopped responding while starting')), LOAD_STALL_MS);
    };
    const progress = (f: number, l: string) => {
      arm();
      onProgress(f, l);
    };
    arm();
    try {
      if (mode === 'worker') {
        this.startWorker();
        const hang = (globalThis as { __MY_LIBRARY_VOICE_HANG__?: string }).__MY_LIBRARY_VOICE_HANG__ === 'piper';
        await Promise.race([this.call({ type: 'load', ...urls, hang }, progress), stalled]);
      } else {
        const { PiperVoiceRunner } = await import('./piperCore');
        const runner = new PiperVoiceRunner((line) => vlog(`piper page: ${line}`));
        await Promise.race([runner.load(urls.modelUrl, urls.configUrl, urls.wasmPaths, progress), stalled]);
        this.page = runner;
      }
    } finally {
      if (stall) clearTimeout(stall);
    }
    onProgress(1, 'Making a test word…');
    const t = Date.now();
    await timeout(this.raw('Hi.'), PROBE_MS, 'The voice got stuck on a test word', () => this.stop());
    vlog(`piper ${mode}: test word in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }

  load(onProgress?: LoadProgress, voiceId = this.voice): Promise<void> {
    if (this.loadedVoice === voiceId) return Promise.resolve();
    if (this.loading && this.loadingVoice === voiceId) return this.loading;
    this.loadingVoice = voiceId;
    this.loading = (async () => {
      const v = PIPER_VOICES.find((x) => x.id === voiceId) ?? PIPER_VOICES[0];
      const host = (globalThis as { __MY_LIBRARY_PIPER_HOST__?: string }).__MY_LIBRARY_PIPER_HOST__ ?? PIPER_HOST;
      const urls = { modelUrl: `${host}${v.path}.onnx`, configUrl: `${host}${v.path}.onnx.json`, wasmPaths: new URL('ort/', document.baseURI).href };
      const modes: PiperMode[] = savedMode() === 'page' ? ['page'] : ['worker', 'page'];
      vlog(`piper ${v.id}: start in ${modes.join(' > ')}; isolated=${typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated}, cores=${navigator.hardwareConcurrency}`);
      try {
        for (let i = 0; i < modes.length; i++) {
          const t0 = Date.now();
          try {
            await this.loadIn(modes[i], urls, (f, l) => onProgress?.(f, l));
            vlog(`piper ${modes[i]}: ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
            if (modes[i] === 'page') saveMode('page');
            this.loadedVoice = v.id;
            onProgress?.(1, 'Voice ready');
            return;
          } catch (e) {
            vlog(`piper ${modes[i]}: failed after ${((Date.now() - t0) / 1000).toFixed(0)} s: ${(e as Error).message}`);
            this.stop();
            if (i === modes.length - 1) throw e;
            onProgress?.(0, 'Trying another way to run the voice…');
          }
        }
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /** One sentence in the loaded runner, without loading or time limits. */
  private async raw(text: string): Promise<SynthResult> {
    if (this.page) return this.page.synth(text);
    if (!this.worker) throw new Error('Voice not loaded');
    const r = await this.call({ type: 'synth', text });
    if (r.type !== 'result') throw new Error('No audio returned');
    return { samples: r.samples, sampleRate: r.sampleRate };
  }

  synthesize(text: string, voice: string): Promise<SynthResult> {
    const run = async (): Promise<SynthResult> => {
      await this.load(undefined, PIPER_VOICES.some((v) => v.id === voice) ? voice : this.voice);
      return timeout(this.raw(text), SYNTH_BASE_MS + text.length * SYNTH_PER_CHAR_MS, 'The fast voice stopped responding', () => {
        vlog(`piper ${this.mode}: a sentence took too long; restarting the voice`);
        this.stop();
      });
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
