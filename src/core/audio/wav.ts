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
