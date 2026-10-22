import { describe, expect, it } from 'vitest';
import { BookIndex, passages, stem, terms } from '../src/core/search';

const chapters = [
  { title: 'Habits', text: 'Small habits compound over time.\n\nA habit is a routine you repeat until it becomes automatic. Good habits make progress easy.' },
  { title: 'Money', text: 'Compound interest grows savings slowly at first and then quickly.\n\nPay yourself first by saving before you spend.' },
  { title: 'Teams', text: 'Leaders listen first. A team trusts a leader who keeps promises.' },
];

describe('local book search', () => {
  it('tokenises and stems without common words', () => {
    expect(terms('The habits of leaders, and what they repeated')).toEqual(['habit', 'leader', 'repeat']);
    expect(stem('saving')).toBe(stem('saves'));
    expect(stem('stories')).toBe('story');
  });

  it('splits chapters into passages that point to exact text', () => {
    const ps = passages(chapters, 60);
    for (const p of ps) expect(chapters[p.chapter].text.slice(p.start, p.end).trim()).toBe(p.text);
    expect(ps.length).toBeGreaterThan(3);
  });

  it('ranks the passages that answer the question, with chapter references', () => {
    const idx = new BookIndex(chapters, 120);
    const hits = idx.search('how do I save money?');
    expect(hits[0]).toMatchObject({ chapter: 1, chapterTitle: 'Money' });
    expect(hits[0].text).toContain('saving');
    expect(idx.search('trust a leader')[0].chapterTitle).toBe('Teams');
    expect(idx.search('the and of')).toEqual([]);
  });

  it('finds the passage around a position', () => {
    const idx = new BookIndex(chapters, 60);
    const off = chapters[0].text.indexOf('routine');
    const { at } = idx.around(0, off);
    expect(at?.text).toContain('routine');
  });
});
