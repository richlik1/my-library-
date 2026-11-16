/**
 * AI Reading Assistant, grounded in the book. Every request is built from passages retrieved from the book
 * (numbered [1], [2], …); answers must cite them, and citations are checked against what was sent. Generated text
 * is always labelled as an interpretation; the book's own words are shown separately.
 *
 * AI is optional and off by default: with the reader's own API key (stored only on this device) requests go
 * straight from the device to the provider. Without it, the reader keeps working offline (search with references).
 */
import type { BookIndex } from './search';
import type { Chapter } from './types';
import { placeLabel } from './types';

export type AssistantTask = 'ask' | 'explain' | 'define' | 'summarize' | 'questions' | 'flashcards' | 'lessons' | 'plan' | 'compare';

export interface Source {
  n: number;
  chapter: number;
  start: number;
  end: number;
  text: string;
  label: string;
}

export interface AssistantRequest {
  task: AssistantTask;
  /** The question, the selected passage, the word, or the goal (for plans). */
  input: string;
  chapter: number;
  /** Where the reader is, for passages around it. */
  offset: number;
  /** For `compare`: the other chapter. */
  otherChapter?: number;
}

const MAX_CHAPTER_CHARS = 120_000; // about 30k tokens

/** The passages a request is grounded in: retrieved from the book, never invented. */
export function sourcesFor(req: AssistantRequest, index: BookIndex, chapters: Chapter[]): Source[] {
  const out: Array<Omit<Source, 'n' | 'label'>> = [];
  const add = (p: { chapter: number; start: number; end: number; text: string } | undefined) => {
    if (p && !out.some((o) => o.chapter === p.chapter && o.start === p.start)) out.push({ chapter: p.chapter, start: p.start, end: p.end, text: p.text });
  };
  const whole = (c: number) => {
    const text = chapters[c]?.text ?? '';
    add({ chapter: c, start: 0, end: Math.min(text.length, MAX_CHAPTER_CHARS), text: text.slice(0, MAX_CHAPTER_CHARS) });
  };
  switch (req.task) {
    case 'summarize':
    case 'questions':
    case 'flashcards':
    case 'lessons':
      whole(req.chapter);
      break;
    case 'compare':
      whole(req.chapter);
      if (req.otherChapter !== undefined) whole(req.otherChapter);
      break;
    case 'explain': {
      // Context stays in the reader's chapter: neighbouring passages from other chapters aren't sent.
      const same = <T extends { chapter: number }>(p: T | undefined) => (p && p.chapter === req.chapter ? p : undefined);
      const around = index.around(req.chapter, req.offset);
      add(same(around.before));
      add(same(around.at));
      add(same(around.after));
      for (const h of index.search(req.input, { k: 3, chapter: req.chapter })) add(same(h));
      break;
    }
    case 'define':
      for (const h of index.search(req.input, { k: 4, chapter: req.chapter })) add(h);
      add(index.around(req.chapter, req.offset).at);
      break;
    default:
      for (const h of index.search(req.input, { k: 6, chapter: req.chapter })) add(h);
      if (!out.length) add(index.around(req.chapter, req.offset).at);
  }
  return out.map((s, i) => ({ ...s, n: i + 1, label: placeLabel(chapters[s.chapter], s.chapter, s.start) }));
}

const TASK_PROMPTS: Record<AssistantTask, (input: string) => string> = {
  ask: (q) => `Question: ${q}\nAnswer it from the passages.`,
  explain: (p) => `Explain this passage in plain words, as a patient teacher would, using the other passages for context:\n“${p}”`,
  define: (w) => `Define “${w}” as it is used in this book, then give a plain-English meaning. Quote how the book uses it.`,
  summarize: () => 'Summarize this chapter in 5–8 short bullet points, in order, then one sentence on its main idea.',
  questions: () => 'Write 6 study questions about this chapter (mix recall and reflection), each with a short model answer.',
  flashcards: () => 'Make 8 flashcards about this chapter. Format each exactly as:\nQ: <question>\nA: <short answer> [n]\n(one blank line between cards).',
  lessons: () => 'List the 3–6 most important lessons or ideas in this chapter, each in one or two sentences.',
  plan: (goal) => `Turn the ideas in these passages into a practical action plan${goal ? ` for this goal: ${goal}` : ''}: 3–7 concrete steps, each tied to the idea it comes from.`,
  compare: () => 'Compare the ideas in these two chapters: where they agree, where they differ, and how one builds on the other.',
};

/** System prompt + user message. The passages are the only source of facts about the book. */
export function buildPrompt(req: AssistantRequest, sources: Source[], book: { title: string; author: string }) {
  const system = [
    `You are a reading assistant helping someone understand “${book.title}”${book.author ? ` by ${book.author}` : ''}.`,
    'Use only the numbered passages from the book for anything about the book. Cite the passages you rely on with their numbers in square brackets, like [2].',
    'If the passages do not contain the answer, say “The passages I have don’t cover this.” and do not guess.',
    'General knowledge (like the plain meaning of a word) is allowed when you say it is general knowledge, not from the book.',
    'Be concise and plain-spoken. No preamble.',
  ].join('\n');
  const passages = sources.map((s) => `[${s.n}] (${s.label})\n${s.text}`).join('\n\n');
  const user = `Passages from the book:\n\n${passages}\n\n${TASK_PROMPTS[req.task](req.input.trim())}`;
  return { system, user };
}

/** Which passages an answer cites, and citations that don't exist (a model inventing sources). */
export function checkCitations(text: string, sources: Source[]): { cited: Source[]; invalid: number[] } {
  const nums = [...text.matchAll(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g)].flatMap((m) =>
    m[1].split(/\s*,\s*/).flatMap((part) => {
      const [a, b] = part.split(/\s*[–-]\s*/).map(Number);
      return b ? Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i) : [a];
    }),
  );
  const unique = [...new Set(nums)];
  return { cited: sources.filter((s) => unique.includes(s.n)), invalid: unique.filter((n) => !sources.some((s) => s.n === n)) };
}

export interface Flashcard {
  q: string;
  a: string;
  source?: Source;
}

/** Parses “Q: … / A: … [n]” cards. Cards citing a passage that wasn't sent keep no source. */
export function parseFlashcards(text: string, sources: Source[]): Flashcard[] {
  return text
    .split(/\n\s*\n/)
    .map((block): Flashcard | null => {
      const q = /^\s*Q:\s*(.+)$/m.exec(block)?.[1]?.trim();
      const a = /^\s*A:\s*([\s\S]+)$/m.exec(block)?.[1]?.trim();
      if (!q || !a) return null;
      const n = Number(/\[(\d+)\]/.exec(a)?.[1]);
      const source = sources.find((s) => s.n === n);
      return { q, a: a.replace(/\s*\[\d+\]\s*$/, ''), ...(source ? { source } : {}) };
    })
    .filter((c): c is Flashcard => !!c);
}

// ---- Provider (the reader's own API key) -----------------------------------------------------------------------

export interface AiConfig {
  provider: 'claude';
  apiKey: string;
  model: string;
}

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (best)', note: 'about 2–3¢ per question' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'about 1¢ per question' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest)', note: 'well under 1¢ per question' },
] as const;

const KEY = 'ml-ai';

/** AI settings live only in this device's storage (never in backups). */
export function getAiConfig(): AiConfig | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AiConfig | null;
    return v?.apiKey ? v : null;
  } catch {
    return null;
  }
}

export function setAiConfig(c: AiConfig | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

export interface AssistantAnswer {
  text: string;
  cited: Source[];
  invalid: number[];
  model: string;
  refused?: boolean;
}

/** Sends one grounded request to Claude, directly from the device with the reader's key. */
export async function askClaude(config: AiConfig, prompt: { system: string; user: string }, sources: Source[]): Promise<AssistantAnswer> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  // Opus and Sonnet can hand a declined request to a fallback model; Haiku has no server-side fallback.
  const fallback = config.model !== 'claude-haiku-5-5';
  const response = await client.beta.messages.create({
    model: config.model,
    max_tokens: 16000,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    output_config: { effort: 'low' },
    ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  });
  if (response.stop_reason === 'refusal') return { text: '', cited: [], invalid: [], model: response.model, refused: true };
  const text = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return { text, ...checkCitations(text, sources), model: response.model };
}
