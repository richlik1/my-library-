import { vlog } from './kokoroEngine';
import { DEFAULT_PIPER_VOICE, PIPER_HOST, PIPER_VOICES } from './piper';
import type { LoadProgress, NeuralEngine, SynthResult } from './types';

type Reply =
  | { id: number; type: 'progress'; fraction: number; label: string }
  | { id: number; type: 'done' }
  | { id: number; type: 'result'; samples: Float32Array; sampleRate: number }
  | { id: number; type: 'error'; message: string };

const LOAD_STALL_MS = 120_000;
const SYNTH_BASE_MS = 30_000;
const SYNTH_PER_CHAR_MS = 300;

/** One Piper voice at a time runs in a background worker; switching voices reloads it. */
export class PiperEngine implements NeuralEngine {
  readonly id = 'piper';
  readonly label = 'Piper fast natural voices';
  private worker: Worker | null = null;
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
    return this.loadedVoice ? 'worker' : 'not loaded';
  }

  private stop() {
    this.worker?.terminate();
    this.worker = null;
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

  load(onProgress?: LoadProgress, voiceId = this.voice): Promise<void> {
    if (this.loadedVoice === voiceId) return Promise.resolve();
    if (this.loading && this.loadingVoice === voiceId) return this.loading;
    this.loadingVoice = voiceId;
    this.loading = (async () => {
      this.stop();
      const v = PIPER_VOICES.find((x) => x.id === voiceId) ?? PIPER_VOICES[0];
      const host = (globalThis as { __MY_LIBRARY_PIPER_HOST__?: string }).__MY_LIBRARY_PIPER_HOST__ ?? PIPER_HOST;
      const t0 = Date.now();
      this.worker = new Worker(new URL('./piperWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<Reply>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        if (e.data.type === 'progress') return p.progress?.(e.data.fraction, e.data.label);
        this.pending.delete(e.data.id);
        if (e.data.type === 'error') p.reject(new Error(e.data.message));
        else p.resolve(e.data);
      };
      this.worker.onerror = (e) => {
        e.preventDefault?.();
        for (const p of this.pending.values()) p.reject(new Error(e.message || 'The voice stopped'));
        this.pending.clear();
        this.loadedVoice = null;
      };
      let stall: ReturnType<typeof setTimeout> | null = null;
      let fail: (e: Error) => void = () => undefined;
      const stalled = new Promise<never>((_, rej) => (fail = rej));
      const arm = () => {
        if (stall) clearTimeout(stall);
        stall = setTimeout(() => fail(new Error('The voice stopped responding while starting')), LOAD_STALL_MS);
      };
      arm();
      try {
        await Promise.race([
          this.call(
            {
              type: 'load',
              modelUrl: `${host}${v.path}.onnx`,
              configUrl: `${host}${v.path}.onnx.json`,
              wasmPaths: new URL('ort/', document.baseURI).href,
              hang: (globalThis as { __MY_LIBRARY_VOICE_HANG__?: string }).__MY_LIBRARY_VOICE_HANG__ === 'piper',
            },
            (f, label) => {
              arm();
              onProgress?.(f, label);
            },
          ),
          stalled,
        ]);
        vlog(`piper ${v.id}: loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        this.loadedVoice = v.id;
        onProgress?.(1, 'Voice ready');
      } catch (e) {
        vlog(`piper ${v.id}: failed to load: ${(e as Error).message}`);
        this.stop();
        throw e;
      } finally {
        if (stall) clearTimeout(stall);
        this.loading = null;
      }
    })();
    return this.loading;
  }

  synthesize(text: string, voice: string): Promise<SynthResult> {
    const run = async (): Promise<SynthResult> => {
      await this.load(undefined, PIPER_VOICES.some((v) => v.id === voice) ? voice : this.voice);
      const limit = SYNTH_BASE_MS + text.length * SYNTH_PER_CHAR_MS;
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        const r = await Promise.race([
          this.call({ type: 'synth', text }),
          new Promise<never>(
            (_, rej) =>
              (timer = setTimeout(() => {
                vlog('piper: a sentence took too long; restarting the voice');
                this.stop();
                rej(new Error('The fast voice stopped responding'));
              }, limit)),
          ),
        ]);
        if (r.type !== 'result') throw new Error('No audio returned');
        return { samples: r.samples, sampleRate: r.sampleRate };
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
