/// <reference lib="webworker" />
/**
 * Runs Kokoro in a background thread so the app stays responsive while the
 * model loads and audio is generated. Messages: see KokoroWorkerEngine.
 */
import { env as hfEnv } from '@huggingface/transformers';
import { KokoroTTS, env } from 'kokoro-js';

type In =
  | { id: number; type: 'load'; modelId: string; device: 'wasm' | 'webgpu'; wasmPaths: string; host?: string; threads: number; hang?: boolean }
  | { id: number; type: 'synth'; text: string; voice: string };

interface KokoroLike {
  generate(text: string, opts: { voice: string; speed?: number }): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

let tts: KokoroLike | null = null;
let loading: Promise<void> | null = null;
let hang = false;
const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

async function load(m: Extract<In, { type: 'load' }>) {
  env.wasmPaths = m.wasmPaths;
  if (m.host) hfEnv.remoteHost = m.host.endsWith('/') ? m.host : `${m.host}/`;
  const wasm = (hfEnv.backends.onnx as { wasm?: { numThreads?: number } }).wasm;
  if (wasm) wasm.numThreads = m.threads;
  const files = new Map<string, { loaded: number; total: number }>();
  tts = (await KokoroTTS.from_pretrained(m.modelId, {
    dtype: m.device === 'webgpu' ? 'fp32' : 'q8',
    device: m.device,
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file && p.total) {
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        const loaded = [...files.values()].reduce((s, f) => s + f.loaded, 0);
        const total = [...files.values()].reduce((s, f) => s + f.total, 0);
        post({ id: m.id, type: 'progress', fraction: total ? loaded / total : 0, label: `Downloading the voice model (${Math.round(loaded / 1e6)} of ${Math.round(total / 1e6)} MB)…` });
      }
    },
  })) as unknown as KokoroLike;
}

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      hang = !!m.hang;
      loading ??= load(m).catch((err) => {
        loading = null;
        throw err;
      });
      await loading;
      post({ id: m.id, type: 'done' });
    } else {
      if (!tts) throw new Error('Voice model not loaded');
      if (hang) return;
      const out = await tts.generate(m.text, { voice: m.voice, speed: 1 });
      const samples = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
      post({ id: m.id, type: 'result', samples, sampleRate: out.sampling_rate }, [samples.buffer]);
    }
  } catch (err) {
    post({ id: m.id, type: 'error', message: (err as Error)?.message ?? String(err) });
  }
};
