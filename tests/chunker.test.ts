import { describe, expect, it } from 'vitest';
import { MAX_CHUNK_CHARS, chunkAt, chunkText, wordStart } from '../src/core/speech/chunker';

const sample =
  'Dr. Watson arrived at noon. He was tired! Was he late? No.\n\n' +
  'A very long sentence follows, ' + 'with many clauses, '.repeat(30) + 'and it finally ends here.\n\nShort.';

describe('chunker', () => {
  const chunks = chunkText(sample);

  it('keeps chunk offsets aligned with the source text', () => {
    for (const c of chunks) expect(sample.slice(c.start, c.end)).toBe(c.text);
  });

  it('never exceeds the maximum chunk size', () => {
    expect(chunks.every((c) => c.text.length <= MAX_CHUNK_CHARS)).toBe(true);
  });

  it('covers all non-whitespace text in order', () => {
    expect(chunks.map((c) => c.text).join(' ').replace(/\s+/g, ' ')).toBe(sample.replace(/\s+/g, ' ').trim());
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBeGreaterThanOrEqual(chunks[i - 1].end);
  });

  it('does not split after abbreviations like "Dr."', () => {
    expect(chunks[0].text.startsWith('Dr. Watson arrived at noon.')).toBe(true);
  });

  it('tracks paragraphs', () => {
    expect(chunks[0].paragraph).toBe(0);
    expect(chunks[chunks.length - 1].paragraph).toBe(2);
    expect(chunks[chunks.length - 1].text).toBe('Short.');
  });

  it('finds the chunk for an offset', () => {
    const target = chunks[2];
    expect(chunkAt(chunks, target.start)).toBe(2);
    expect(chunkAt(chunks, target.start + 3)).toBe(2);
    expect(chunkAt(chunks, 0)).toBe(0);
    expect(chunkAt(chunks, sample.length + 10)).toBe(chunks.length - 1);
  });

  it('moves to the start of a word', () => {
    expect(wordStart('hello brave world', 9)).toBe(6);
    expect(wordStart('hello brave world', 6)).toBe(6);
  });

  it('handles empty text', () => {
    expect(chunkText('')).toEqual([]);
  });
});
