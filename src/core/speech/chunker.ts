/**
 * Splits chapter text into short speech chunks (≈ one sentence each).
 * Short utterances are far more reliable with browser speech engines: Chrome
 * cuts long utterances off after ~15 s and iOS may drop them when interrupted.
 * Chunks keep their character offsets so positions can be saved exactly.
 */
export interface Chunk {
  index: number;
  /** Absolute start offset in the chapter text. */
  start: number;
  /** Absolute end offset (exclusive). */
  end: number;
  text: string;
  paragraph: number;
}

export const MAX_CHUNK_CHARS = 200;
const MERGE_BELOW = 40;

type Seg = { start: number; end: number };

const segmenter: { segment(s: string): Iterable<{ index: number; segment: string }> } | null = (() => {
  try {
    const S = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ index: number; segment: string }> } }).Segmenter;
    return S ? new S(undefined, { granularity: 'sentence' }) : null;
  } catch {
    return null;
  }
})();

const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|e\.g|i\.e|No|Vol|Fig|Inc|Ltd|Co|Gen|Col|Lt|Capt|Rev|Hon)\.$/i;

/** Sentence boundaries inside one paragraph (offsets relative to the paragraph). */
export function sentenceSegments(text: string): Seg[] {
  const raw: Seg[] = [];
  if (segmenter) {
    for (const s of segmenter.segment(text)) raw.push({ start: s.index, end: s.index + s.segment.length });
  } else {
    const re = /[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && m[0].length) raw.push({ start: m.index, end: m.index + m[0].length });
    if (!raw.length) raw.push({ start: 0, end: text.length });
  }
  // Re-join splits after common abbreviations ("Dr. Smith").
  const out: Seg[] = [];
  for (const s of raw) {
    const prev = out[out.length - 1];
    if (prev && ABBREV.test(text.slice(prev.start, prev.end).trimEnd())) prev.end = s.end;
    else out.push({ ...s });
  }
  return out;
}

/** Splits an over-long sentence at clause punctuation, then at spaces. */
function splitLong(text: string, seg: Seg, max: number): Seg[] {
  const out: Seg[] = [];
  let start = seg.start;
  while (seg.end - start > max) {
    const window = text.slice(start, start + max);
    let cut = -1;
    for (const re of [/[,;:—–)]\s/g, /\s/g]) {
      let m: RegExpExecArray | null;
      let last = -1;
      while ((m = re.exec(window))) if (m.index > max * 0.35) last = m.index + m[0].length;
      if (last > 0) {
        cut = last;
        break;
      }
    }
    if (cut <= 0) cut = max;
    out.push({ start, end: start + cut });
    start += cut;
  }
  if (seg.end > start) out.push({ start, end: seg.end });
  return out;
}

export function chunkText(text: string, max = MAX_CHUNK_CHARS): Chunk[] {
  const chunks: Chunk[] = [];
  let paraStart = 0;
  let paragraph = 0;
  while (paraStart <= text.length) {
    let paraEnd = text.indexOf('\n\n', paraStart);
    if (paraEnd === -1) paraEnd = text.length;
    const para = text.slice(paraStart, paraEnd);
    if (para.trim()) {
      const segs = sentenceSegments(para).flatMap((s) => splitLong(para, s, max));
      let pending: Seg | null = null;
      const emit = (s: Seg) => {
        let a = s.start;
        let b = s.end;
        while (a < b && /\s/.test(para[a])) a++;
        while (b > a && /\s/.test(para[b - 1])) b--;
        if (b > a) chunks.push({ index: chunks.length, start: paraStart + a, end: paraStart + b, text: para.slice(a, b), paragraph });
      };
      for (const s of segs) {
        if (pending && pending.end - pending.start < MERGE_BELOW && s.end - pending.start <= max) {
          pending = { start: pending.start, end: s.end };
          continue;
        }
        if (pending) emit(pending);
        pending = s;
      }
      if (pending) emit(pending);
      paragraph++;
    }
    paraStart = paraEnd + 2;
  }
  return chunks;
}

/** Index of the chunk that contains `offset` (or the next one after it). */
export function chunkAt(chunks: Chunk[], offset: number): number {
  if (!chunks.length) return 0;
  let lo = 0;
  let hi = chunks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chunks[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  if (offset >= chunks[lo].end && lo + 1 < chunks.length) return lo + 1;
  return lo;
}

/** Moves an offset back to the start of the word it falls in. */
export function wordStart(text: string, offset: number, min = 0): number {
  let o = Math.max(min, Math.min(offset, text.length));
  while (o > min && !/\s/.test(text[o - 1])) o--;
  return o;
}
