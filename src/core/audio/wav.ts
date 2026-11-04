/** 16-bit PCM mono WAV encoding. Pure functions, no browser APIs. */

export function encodeWav(parts: Float32Array[], sampleRate: number): ArrayBuffer {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const buf = new ArrayBuffer(44 + total * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + total * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, total * 2, true);
  let o = 44;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, p[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  return buf;
}

export function decodeWavInfo(buf: ArrayBuffer): { sampleRate: number; samples: number; duration: number } {
  const v = new DataView(buf);
  const tag = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  if (tag !== 'RIFF') throw new Error('Not a WAV file');
  const sampleRate = v.getUint32(24, true);
  const samples = v.getUint32(40, true) / 2;
  return { sampleRate, samples, duration: samples / sampleRate };
}

export const silence = (seconds: number, sampleRate: number) => new Float32Array(Math.round(seconds * sampleRate));

/** Trims near-silent samples from both ends (TTS models often pad each sentence). */
export function trimSilence(samples: Float32Array, threshold = 0.003): Float32Array {
  let a = 0;
  let b = samples.length;
  while (a < b && Math.abs(samples[a]) < threshold) a++;
  while (b > a && Math.abs(samples[b - 1]) < threshold) b--;
  return samples.subarray(a, b);
}

/**
 * Makes one synthesized sentence sound like part of a recording:
 * - trims silence by loudness over 10 ms windows, keeping a margin so quiet sounds (h, s, f) aren't clipped;
 * - removes DC offset; evens out loudness (target RMS, never clipping);
 * - fades in and out briefly so there are no clicks where sentences meet.
 */
export function polishSpeech(input: Float32Array, sampleRate: number, opts: { targetRms?: number } = {}): Float32Array {
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  const windows = Math.ceil(input.length / win);
  if (!input.length) return input;
  let mean = 0;
  for (const x of input) mean += x;
  mean /= input.length;
  const rms = (w: number) => {
    let s = 0;
    const end = Math.min(input.length, (w + 1) * win);
    for (let i = w * win; i < end; i++) s += (input[i] - mean) ** 2;
    return Math.sqrt(s / Math.max(1, end - w * win));
  };
  const levels = Array.from({ length: windows }, (_, w) => rms(w));
  const peakLevel = Math.max(...levels);
  if (peakLevel < 1e-4) return new Float32Array(0);
  const gate = peakLevel * 0.04; // about -28 dB below the loudest part
  let first = levels.findIndex((l) => l > gate);
  let last = levels.length - 1 - [...levels].reverse().findIndex((l) => l > gate);
  // Keep 30 ms before and 60 ms after the speech.
  const a = Math.max(0, (first - 3) * win);
  const b = Math.min(input.length, (last + 7) * win);
  first = a;
  last = b;
  const out = new Float32Array(last - first);
  for (let i = 0; i < out.length; i++) out[i] = input[first + i] - mean;
  // Loudness of the voiced part only (pauses don't count).
  let sum = 0;
  let count = 0;
  for (let w = 0; w < levels.length; w++)
    if (levels[w] > gate * 2) {
      sum += levels[w] ** 2;
      count++;
    }
  const voicedRms = Math.sqrt(sum / Math.max(1, count));
  let peak = 0;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  const target = opts.targetRms ?? 0.1; // about -20 dBFS
  const gain = Math.min(target / Math.max(voicedRms, 1e-6), 0.95 / Math.max(peak, 1e-6), 4);
  const fadeIn = Math.min(out.length, Math.round(sampleRate * 0.01));
  const fadeOut = Math.min(out.length, Math.round(sampleRate * 0.03));
  for (let i = 0; i < out.length; i++) {
    let g = gain;
    if (i < fadeIn) g *= i / fadeIn;
    const fromEnd = out.length - 1 - i;
    if (fromEnd < fadeOut) g *= fromEnd / fadeOut;
    out[i] *= g;
  }
  return out;
}

/** Joins 16-bit mono WAV files with the same sample rate into one. */
export function concatWavs(files: ArrayBuffer[]): ArrayBuffer {
  if (files.length === 1) return files[0];
  const sampleRate = decodeWavInfo(files[0]).sampleRate;
  const datas = files.map((f) => new Uint8Array(f, 44, new DataView(f).getUint32(40, true)));
  const total = datas.reduce((s, d) => s + d.length, 0);
  const out = new Uint8Array(44 + total);
  out.set(new Uint8Array(encodeWav([], sampleRate)), 0);
  const v = new DataView(out.buffer);
  v.setUint32(4, 36 + total, true);
  v.setUint32(40, total, true);
  let o = 44;
  for (const d of datas) {
    out.set(d, o);
    o += d.length;
  }
  return out.buffer;
}
