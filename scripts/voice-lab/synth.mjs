// Makes the same passage with one Piper voice exactly the way the app does (phonemizer + ONNX Runtime web,
// one thread) and reports how fast it was. Usage: bun synth.mjs <voice.onnx> <out.wav>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phonemize } from 'phonemizer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ort = await import(join(root, 'node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs'));
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = 'file://' + join(root, 'node_modules/onnxruntime-web/dist/');

export const PASSAGE = [
  'The lighthouse stood at the edge of the world, and every night its keeper climbed the long stairs to light the lamp.',
  'Ships passed far out at sea and never knew his name.',
  'But on the morning the storm finally broke, he found a letter waiting on the rocks, and everything changed.',
];

const [model, out] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(model + '.json', 'utf8'));
let t = performance.now();
const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(model)), { executionProviders: ['wasm'] });
const startS = (performance.now() - t) / 1000;
const map = cfg.phoneme_id_map;
const pad = map['_']?.[0] ?? 0;
const pieces = [];
let synthS = 0;
for (const sentence of PASSAGE) {
  // Same as the app: punctuation kept, words phonemized with eSpeak.
  const parts = sentence.split(/([,.;:!?]+\s*)/).filter(Boolean);
  let ipa = '';
  for (const p of parts) ipa += /^[,.;:!?]/.test(p) ? p : (await phonemize(p, cfg.espeak?.voice ?? 'en-us')).join(' ');
  const ids = [...(map['^'] ?? [1]), pad];
  for (const ch of ipa.normalize('NFD')) if (map[ch]) ids.push(...map[ch], pad);
  ids.push(...(map['$'] ?? [2]));
  const inf = cfg.inference ?? {};
  t = performance.now();
  const r = await session.run({
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, inf.length_scale ?? 1, inf.noise_w ?? 0.8]), [3]),
  });
  synthS += (performance.now() - t) / 1000;
  pieces.push(Float32Array.from(r[session.outputNames[0]].data), new Float32Array(Math.round(cfg.audio.sample_rate * 0.35)));
}
const n = pieces.reduce((s, p) => s + p.length, 0);
const sr = cfg.audio.sample_rate;
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
let o = 44;
for (const p of pieces) for (const s of p) { buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), o); o += 2; }
writeFileSync(out, buf);
console.log(JSON.stringify({ startS, synthS, audioS: n / sr, speed: n / sr / synthS }));
