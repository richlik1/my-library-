import type { Chapter } from '../types';

/** Chapters longer than this are split into parts so the reader stays fast. */
export const MAX_CHAPTER_CHARS = 40_000;

/**
 * Normalises raw text into the canonical form used everywhere in the app:
 * single spaces inside paragraphs, paragraphs separated by exactly "\n\n".
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/­/g, '') // soft hyphens
    .replace(/[​﻿]/g, '') // zero-width chars / BOM
    .replace(/ /g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter((p) => p.length > 0)
    .join('\n\n');
}

/**
 * Joins hard-wrapped lines (as found in plain-text e-books and PDFs) into
 * paragraphs. Blank lines always end a paragraph; otherwise a line ends a
 * paragraph when it is noticeably short and ends with terminal punctuation.
 */
export function unwrapLines(lines: string[]): string {
  const trimmed = lines.map((l) => l.replace(/\s+$/g, ''));
  const lengths = trimmed.filter((l) => l.trim().length > 0).map((l) => l.length).sort((a, b) => a - b);
  const typical = lengths.length ? lengths[Math.floor(lengths.length * 0.8)] : 80;
  const out: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = '';
  };
  for (const line of trimmed) {
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    if (!current) current = t;
    else if (/[A-Za-z]-$/.test(current) && /^[a-z]/.test(t)) current = current.slice(0, -1) + t; // de-hyphenate
    else current += ' ' + t;
    const short = line.length < typical * 0.7;
    if (short && /[.!?:"”'’)\]]$/.test(t)) flush();
  }
  flush();
  return out.join('\n\n');
}

const HEADING_RE =
  /^(?:(?:chapter|chap\.|part|book|section|volume|act)\s+(?:[0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty[\w-]*|thirty[\w-]*|forty[\w-]*|fifty[\w-]*)\b.*|prologue|epilogue|introduction|preface|foreword|afterword|acknowledg(?:e)?ments|conclusion|appendix\b.*)$/i;

/** True when a paragraph looks like a chapter heading. */
export function isHeading(paragraph: string): boolean {
  const p = paragraph.trim();
  if (p.length === 0 || p.length > 80) return false;
  return HEADING_RE.test(p.replace(/[.:]$/, ''));
}

/**
 * Splits normalised text into chapters using heading detection. Falls back to a
 * single chapter (later split into parts) when no headings are found.
 */
export function detectChapters(text: string, fallbackTitle = 'Text'): Chapter[] {
  const paragraphs = text.split('\n\n');
  const chapters: Chapter[] = [];
  let title = '';
  let body: string[] = [];
  const push = () => {
    const t = body.join('\n\n').trim();
    if (t) chapters.push({ title: title || (chapters.length === 0 ? 'Opening' : `Section ${chapters.length + 1}`), text: t });
    body = [];
  };
  let headingsFound = 0;
  for (const p of paragraphs) {
    if (isHeading(p)) {
      headingsFound++;
      // Consecutive headings (e.g. a table of contents) don't create empty chapters.
      if (body.length && !(body.length === 1 && isHeading(body[0]))) push();
      // Title the chapter; a short subtitle on the next paragraph is common
      // ("Chapter 1" / "The Beginning") but we keep it in the text so it is read.
      title = p.replace(/[.:]$/, '');
      body = [p];
    } else {
      body.push(p);
    }
  }
  push();
  if (headingsFound < 2) return [{ title: fallbackTitle, text: text.trim() }].filter((c) => c.text);
  return chapters;
}

/** Splits any chapter longer than `max` characters at paragraph boundaries. */
export function splitLongChapters(chapters: Chapter[], max = MAX_CHAPTER_CHARS): Chapter[] {
  const out: Chapter[] = [];
  for (const ch of chapters) {
    if (ch.text.length <= max) {
      out.push(ch);
      continue;
    }
    const paragraphs = ch.text.split('\n\n');
    const parts: string[] = [];
    let cur = '';
    for (const p of paragraphs) {
      // A single gigantic paragraph is split at sentence ends.
      const pieces = p.length > max ? splitAtSentences(p, max) : [p];
      for (const piece of pieces) {
        if (cur && cur.length + piece.length + 2 > max) {
          parts.push(cur);
          cur = '';
        }
        cur = cur ? `${cur}\n\n${piece}` : piece;
      }
    }
    if (cur) parts.push(cur);
    parts.forEach((text, i) => out.push({ title: parts.length > 1 ? `${ch.title} (part ${i + 1} of ${parts.length})` : ch.title, text }));
  }
  return out;
}

function splitAtSentences(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('. ', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Final clean-up applied to every importer's output. */
export function finalizeChapters(chapters: Chapter[]): Chapter[] {
  const cleaned = chapters
    .map((c) => ({ title: (c.title || '').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Untitled', text: normalizeText(c.text) }))
    .filter((c) => c.text.length > 0);
  return splitLongChapters(cleaned);
}

/** Guesses a readable title from a file name. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base || 'Untitled book';
}
