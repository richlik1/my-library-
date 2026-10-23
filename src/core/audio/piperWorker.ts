/// <reference lib="webworker" />
// Must run first: Safari can't `for await` over download streams, which the model loaders do.
import '../importers/streamPolyfill';
/** Runs a Piper voice in a background thread (see piperCore.ts). */
import { PiperVoiceRunner } from './piperCore';

type In =
  | { id: number; type: 'load'; modelUrl: string; configUrl: string; wasmPaths: string; hang?: boolean }
  | { id: number; type: 'synth'; text: string };

let hang = false;
const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);
const runner = new PiperVoiceRunner((line) => post({ id: 0, type: 'log', line }));

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      hang = !!m.hang;
      await runner.load(m.modelUrl, m.configUrl, m.wasmPaths, (fraction, label) => post({ id: m.id, type: 'progress', fraction, label }));
      post({ id: m.id, type: 'done' });
    } else {
      if (hang) return;
      const r = await runner.synth(m.text);
      post({ id: m.id, type: 'result', ...r }, [r.samples.buffer]);
    }
  } catch (err) {
    post({ id: m.id, type: 'error', message: (err as Error)?.message ?? String(err) });
  }
};
