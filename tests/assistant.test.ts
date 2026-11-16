import { describe, expect, it } from 'vitest';
import { buildPrompt, checkCitations, parseFlashcards, sourcesFor } from '../src/core/assistant';
import { BookIndex } from '../src/core/search';
import type { Chapter } from '../src/core/types';

const chapters: Chapter[] = [
  { title: 'Chapter 1', text: 'The keeper climbed the lighthouse stairs every evening.\n\nHe wrote the weather in a grey journal.', pages: [{ offset: 0, page: 4 }] },
  { title: 'Chapter 2', text: 'A storm broke the lantern glass.\n\nThe keeper repaired the lantern before dawn with spare glass from the cellar.' },
];
const index = new BookIndex(chapters, 80);
const book = { title: 'The Lighthouse', author: 'A. Keeper' };

describe('grounded reading assistant', () => {
  it('builds requests only from passages retrieved from the book, labelled with chapter and page', () => {
    const sources = sourcesFor({ task: 'ask', input: 'How was the lantern repaired?', chapter: 1, offset: 0 }, index, chapters);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0].text).toContain('repaired the lantern');
    for (const s of sources) expect(chapters[s.chapter].text.slice(s.start, s.end)).toBe(s.text);
    const { system, user } = buildPrompt({ task: 'ask', input: 'How was the lantern repaired?', chapter: 1, offset: 0 }, sources, book);
    expect(system).toContain('Use only the numbered passages');
    expect(system).toContain('don’t cover this');
    expect(user).toContain('[1] (Chapter 2)');
    // Nothing from outside the retrieved passages is sent.
    for (const c of chapters) for (const p of c.text.split('\n\n')) if (!sources.some((s) => s.text.includes(p))) expect(user).not.toContain(p);
  });

  it('keeps explanation context inside the reader’s chapter', () => {
    const sources = sourcesFor({ task: 'explain', input: chapters[0].text.split('\n\n')[1], chapter: 0, offset: 60 }, index, chapters);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.chapter === 0)).toBe(true);
  });

  it('sends the whole chapter (with its page) for chapter summaries', () => {
    const sources = sourcesFor({ task: 'summarize', input: '', chapter: 0, offset: 0 }, index, chapters);
    expect(sources).toHaveLength(1);
    expect(sources[0].text).toBe(chapters[0].text);
    expect(sources[0].label).toBe('Chapter 1 · p. 4');
  });

  it('checks citations: real ones are kept, invented ones are reported', () => {
    const sources = sourcesFor({ task: 'compare', input: '', chapter: 0, offset: 0, otherChapter: 1 }, index, chapters);
    expect(sources.map((s) => s.n)).toEqual([1, 2]);
    const r = checkCitations('Both chapters show care [1], [2]. Also see [1–2] and [7].', sources);
    expect(r.cited.map((s) => s.n)).toEqual([1, 2]);
    expect(r.invalid).toEqual([7]);
    expect(checkCitations('No citations at all.', sources).cited).toEqual([]);
  });

  it('parses flashcards and keeps their source passage when the citation is real', () => {
    const sources = sourcesFor({ task: 'flashcards', input: '', chapter: 1, offset: 0 }, index, chapters);
    const cards = parseFlashcards('Q: What broke the glass?\nA: A storm [1]\n\nQ: When was it fixed?\nA: Before dawn [9]\n\nnot a card', sources);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ q: 'What broke the glass?', a: 'A storm' });
    expect(cards[0].source?.chapter).toBe(1);
    expect(cards[1].source).toBeUndefined();
  });
});
