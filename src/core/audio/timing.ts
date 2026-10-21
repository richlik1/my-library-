import type { ChunkTiming } from './types';

/** Index of the chunk playing at time `t` (seconds). */
export function chunkIndexAtTime(timings: ChunkTiming[], t: number): number {
  if (!timings.length) return 0;
  let lo = 0;
  let hi = timings.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timings[mid].t0 <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Approximate text offset being spoken at time `t` (interpolated inside the chunk). */
export function offsetAtTime(timings: ChunkTiming[], t: number): number {
  if (!timings.length) return 0;
  const c = timings[chunkIndexAtTime(timings, t)];
  if (t <= c.t0) return c.start;
  if (t >= c.t1) return c.end;
  const f = (t - c.t0) / Math.max(0.001, c.t1 - c.t0);
  return Math.round(c.start + f * (c.end - c.start));
}

/** Time (seconds) where a text offset is spoken; starts at the beginning of its chunk. */
export function timeAtOffset(timings: ChunkTiming[], offset: number): number {
  if (!timings.length) return 0;
  const i = timings.findIndex((c) => offset < c.end);
  return i === -1 ? timings[timings.length - 1].t1 : timings[i].t0;
}

/** Stable short hash of a string (FNV-1a), used to detect changed chapter text. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + ':' + s.length.toString(36);
}
