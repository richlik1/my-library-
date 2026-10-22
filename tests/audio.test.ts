// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { ChunkGenerationError, generateChapterAudio } from '../src/core/audio/generate';
import { AudioQueue } from '../src/core/audio/queue';
import { chunkIndexAtTime, offsetAtTime, textHash, timeAtOffset } from '../src/core/audio/timing';
import type { ChapterAudio, NeuralEngine } from '../src/core/audio/types';
import { chapterAudioStatus, partKey, partRanges } from '../src/core/audio/types';
import { concatWavs, decodeWavInfo, encodeWav, trimSilence } from '../src/core/audio/wav';
import { db, deleteAudio, deleteBook, getAudioWav, getChapterAudio, getChapterWav, listBookAudio, putAudio, resetDbConnection, saveImportedBook } from '../src/core/storage/db';
import { chunkText } from '../src/core/speech/chunker';

/** Deterministic engine: 0.01 s of tone per character, padded with silence. */
class FakeEngine implements NeuralEngine {
  readonly id = 'fake';
  readonly label = 'Fake';
  calls: string[] = [];
  failTimes = new Map<string, number>();
  loaded = false;
  async load() {
    this.loaded = true;
  }
  isLoaded() {
    return this.loaded;
  }
  voices() {
    return [{ id: 'v1', name: 'One', gender: 'female' as const, accent: 'American' }];
  }
  async synthesize(text: string) {
    this.calls.push(text);
    const left = this.failTimes.get(text) ?? 0;
    if (left > 0) {
      this.failTimes.set(text, left - 1);
      throw new Error('model hiccup');
    }
    const sr = 1000;
    const body = new Float32Array(text.length * 10).fill(0.5);
    const out = new Float32Array(body.length + 100); // 50 ms silence on each side
    out.set(body, 50);
    return { samples: out, sampleRate: sr };
  }
}

const TEXT = 'The first sentence is long enough to stand alone. The second sentence follows it very nicely indeed.\n\nA new paragraph begins right here and continues.';

describe('wav encoding', () => {
  it('writes a valid 16-bit mono WAV', () => {
    const wav = encodeWav([new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([2])], 24000);
    expect(wav.byteLength).toBe(44 + 5 * 2);
    expect(decodeWavInfo(wav)).toEqual({ sampleRate: 24000, samples: 5, duration: 5 / 24000 });
    expect(new DataView(wav).getInt16(44 + 2 * 3, true)).toBe(32767);
    expect(new DataView(wav).getInt16(44 + 2 * 4, true)).toBe(32767); // clipped
  });

  it('trims silence at both ends', () => {
    const t = Array.from(trimSilence(new Float32Array([0, 0, 0.4, 0, 0.3, 0])));
    expect(t).toHaveLength(3);
    expect(t[0]).toBeCloseTo(0.4, 5);
    expect(t[2]).toBeCloseTo(0.3, 5);
  });
});

describe('chapter generation', () => {
  it('builds one audio file with sentence timings and pauses', async () => {
    const engine = new FakeEngine();
    const r = await generateChapterAudio(engine, TEXT, { voice: 'v1', sentencePause: 0.2, paragraphPause: 0.5 });
    const chunks = chunkText(TEXT);
    expect(r.timings).toHaveLength(chunks.length);
    expect(r.timings.map((t) => [t.start, t.end])).toEqual(chunks.map((c) => [c.start, c.end]));
    // Each chunk lasts 0.01 s per character (padding trimmed); pauses sit between chunks.
    expect(r.timings[0].t0).toBe(0);
    expect(r.timings[0].t1).toBeCloseTo(chunks[0].text.length * 0.01, 5);
    expect(r.timings[1].t0).toBeCloseTo(r.timings[0].t1 + 0.2, 5);
    expect(r.timings[2].t0).toBeCloseTo(r.timings[1].t1 + 0.5, 5);
    expect(decodeWavInfo(r.wav).duration).toBeCloseTo(r.duration, 2);
  });

  it('retries a failed sentence and succeeds', async () => {
    const engine = new FakeEngine();
    const first = chunkText(TEXT)[0].text;
    engine.failTimes.set(first, 2);
    const r = await generateChapterAudio(engine, TEXT, { voice: 'v1', retries: 2 });
    expect(r.timings).toHaveLength(3);
    expect(engine.calls.filter((c) => c === first)).toHaveLength(3);
  });

  it('reports which sentence failed instead of skipping it', async () => {
    const engine = new FakeEngine();
    const second = chunkText(TEXT)[1].text;
    engine.failTimes.set(second, 5);
    await expect(generateChapterAudio(engine, TEXT, { voice: 'v1', retries: 1 })).rejects.toBeInstanceOf(ChunkGenerationError);
    await expect(generateChapterAudio(engine, TEXT, { voice: 'v1', retries: 1 })).rejects.toThrow(/sentence 2/);
  });

  it('applies the pronunciation dictionary to the spoken text only', async () => {
    const engine = new FakeEngine();
    const r = await generateChapterAudio(engine, 'StayOps helps hosts every single day of the week.', { voice: 'v1', pronunciations: { StayOps: 'Stay Ops' } });
    expect(engine.calls[0]).toBe('Stay Ops helps hosts every single day of the week.');
    expect(r.timings[0]).toMatchObject({ start: 0, end: 49 });
  });
});

describe('timing maps', () => {
  const timings = [
    { start: 0, end: 10, t0: 0, t1: 2 },
    { start: 11, end: 31, t0: 2.5, t1: 6.5 },
  ];
  it('maps time to text and back', () => {
    expect(chunkIndexAtTime(timings, 3)).toBe(1);
    expect(offsetAtTime(timings, 1)).toBe(5);
    expect(offsetAtTime(timings, 4.5)).toBe(21);
    expect(offsetAtTime(timings, 2.2)).toBe(10);
    expect(timeAtOffset(timings, 15)).toBe(2.5);
    expect(timeAtOffset(timings, 0)).toBe(0);
    expect(timeAtOffset(timings, 999)).toBe(6.5);
  });
  it('hashes text stably', () => {
    expect(textHash('abc')).toBe(textHash('abc'));
    expect(textHash('abc')).not.toBe(textHash('abd'));
  });
});

describe('generation queue and audio cache', () => {
  beforeEach(async () => {
    await resetDbConnection();
    const d = await db();
    for (const s of ['books', 'contents', 'files', 'audio', 'audioData'] as const) await d.clear(s);
  });

  const deps = (engine: FakeEngine, texts: string[], voice = 'v1') => ({
    engine: () => engine,
    chapterText: async (_b: string, ch: number) => texts[ch],
    voiceFor: async () => voice,
    chapterAudio: getChapterAudio,
    putAudio,
    deleteAudio,
  });

  it('generates chapters in order, caches them, and skips cached ones', async () => {
    const engine = new FakeEngine();
    const q = new AudioQueue(deps(engine, [TEXT, 'Chapter two has only one sentence in it today.']));
    q.enqueue('b1', [0, 1]);
    await q.idle();
    expect(q.list.map((j) => j.status)).toEqual(['done', 'done']);
    const meta = await listBookAudio('b1');
    expect([...chapterAudioStatus(meta).entries()].map(([c, s]) => [c, s.complete])).toEqual([
      [0, true],
      [1, true],
    ]);
    expect((await getChapterWav('b1', 1))!.byteLength).toBeGreaterThan(44);
    const calls = engine.calls.length;
    q.enqueue('b1', [0, 1]);
    await q.idle();
    expect(engine.calls.length).toBe(calls); // nothing regenerated
  });

  it('regenerates when the voice changes', async () => {
    const engine = new FakeEngine();
    await (async () => {
      const q = new AudioQueue(deps(engine, [TEXT]));
      q.enqueue('b1', [0]);
      await q.idle();
    })();
    const before = engine.calls.length;
    const q2 = new AudioQueue(deps(engine, [TEXT], 'v2'));
    q2.enqueue('b1', [0]);
    await q2.idle();
    expect(engine.calls.length).toBeGreaterThan(before);
    expect((await getChapterAudio('b1', 0)).map((m) => m.voice)).toEqual(['v2', 'v2']);
  });

  it('regenerates when narration settings (pauses, pronunciations) change', async () => {
    const engine = new FakeEngine();
    let opts: { sentencePause?: number } = { sentencePause: 0.2 };
    const q = new AudioQueue({ ...deps(engine, [TEXT]), options: async () => opts });
    q.enqueue('b1', [0]);
    await q.idle();
    const first = engine.calls.length;
    q.enqueue('b1', [0]);
    await q.idle();
    expect(engine.calls.length).toBe(first); // same settings: reused
    opts = { sentencePause: 0.5 };
    q.enqueue('b1', [0]);
    await q.idle();
    expect(engine.calls.length).toBeGreaterThan(first);
  });

  it('marks a chapter failed with a reason and lets it be retried', async () => {
    const engine = new FakeEngine();
    const first = chunkText(TEXT)[0].text;
    engine.failTimes.set(first, 3);
    const q = new AudioQueue(deps(engine, [TEXT]));
    q.enqueue('b1', [0]);
    await q.idle();
    expect(q.list[0]).toMatchObject({ status: 'failed' });
    expect(q.list[0].error).toMatch(/sentence 1/);
    q.enqueue('b1', [0]); // retry
    await q.idle();
    expect(q.list[0].status).toBe('done');
  });

  it('pauses, resumes and cancels', async () => {
    const engine = new FakeEngine();
    const q = new AudioQueue(deps(engine, [TEXT, TEXT, TEXT]));
    q.pause();
    q.enqueue('b1', [0, 1, 2]);
    await new Promise((r) => setTimeout(r, 30));
    expect(engine.calls).toHaveLength(0);
    q.cancel('b1');
    expect(q.list).toHaveLength(0);
    q.enqueue('b1', [2]);
    q.resume();
    await q.idle();
    expect(q.list.map((j) => [j.chapter, j.status])).toEqual([[2, 'done']]);
  });

  it('deleting a book deletes its audio', async () => {
    const book = await saveImportedBook({ title: 'T', author: '', format: 'txt', cover: null, chapters: [{ title: 'A', text: TEXT }] }, { name: 't.txt', size: 1, type: 'text/plain', data: new Blob(['x']) }, 'Other');
    const q = new AudioQueue(deps(new FakeEngine(), [TEXT]));
    q.enqueue(book.id, [0]);
    await q.idle();
    expect((await listBookAudio(book.id)).length).toBeGreaterThan(0);
    await deleteBook(book.id);
    expect(await listBookAudio(book.id)).toHaveLength(0);
    expect(await getAudioWav(partKey(book.id, 0, 0))).toBeUndefined();
  });
});

describe('chapters made in parts', () => {
  beforeEach(async () => {
    await resetDbConnection();
    const d = await db();
    for (const s of ['audio', 'audioData'] as const) await d.clear(s);
  });

  const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} is here and it is fine.`).join(' ');
  const deps = (engine: FakeEngine) => ({
    engine: () => engine,
    chapterText: async () => long,
    voiceFor: async () => 'v1',
    chapterAudio: getChapterAudio,
    putAudio,
    deleteAudio,
  });

  it('splits a chapter into a tiny first part, then bigger parts', () => {
    expect(partRanges(1)).toEqual([[0, 1]]);
    expect(partRanges(30)).toEqual([
      [0, 1],
      [1, 6],
      [6, 20],
      [20, 30],
    ]);
  });

  it('makes the first part first, so listening can start early, and the whole chapter joins seamlessly', async () => {
    const engine = new FakeEngine();
    const q = new AudioQueue(deps(engine));
    const seen: number[] = [];
    q.subscribe((jobs) => jobs[0] && seen.push(jobs[0].partsDone ?? 0));
    q.enqueue('b', [0]);
    await q.idle();
    const parts = await getChapterAudio('b', 0);
    expect(parts.map((p) => [p.part, p.parts])).toEqual([
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
    ]);
    // Calls go in reading order; the first part (1 sentence) is ready after the first call.
    expect(engine.calls[0]).toContain('number 1 ');
    expect(seen).toContain(1);
    // Part timings are relative to the part; joined audio length equals the parts' total.
    expect(parts[1].timings[0].t0).toBe(0);
    const whole = await getChapterWav('b', 0);
    const total = parts.reduce((s, p) => s + p.duration, 0);
    expect(decodeWavInfo(whole!).duration).toBeCloseTo(total, 2);
  });

  it('starts with the part where the listener is', async () => {
    const engine = new FakeEngine();
    const q = new AudioQueue(deps(engine));
    q.enqueue('b', [0], { startOffset: long.indexOf('number 26 ') });
    await q.idle();
    expect(engine.calls[0]).toContain('number 21 '); // part 3 begins at sentence 21
  });

  it('only makes missing parts after an interruption', async () => {
    const engine = new FakeEngine();
    const q = new AudioQueue(deps(engine));
    q.enqueue('b', [0]);
    await q.idle();
    await deleteAudio([partKey('b', 0, 2)]);
    engine.calls = [];
    q.enqueue('b', [0]);
    await q.idle();
    expect(engine.calls).toHaveLength(14);
    expect(chapterAudioStatus(await getChapterAudio('b', 0)).get(0)).toMatchObject({ complete: true, done: 4, total: 4 });
  });

  it('joins WAV files', () => {
    const a = encodeWav([new Float32Array([0.5, 0.5])], 8000);
    const b = encodeWav([new Float32Array([-0.5])], 8000);
    const j = concatWavs([a, b]);
    expect(decodeWavInfo(j)).toEqual({ sampleRate: 8000, samples: 3, duration: 3 / 8000 });
    expect(new DataView(j).getInt16(48, true)).toBe(-16384);
  });
});

export type { ChapterAudio };
