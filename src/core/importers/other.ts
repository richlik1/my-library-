import type { ImportedBook } from '../types';
import { htmlToText } from './epub';
import { ImportError } from './errors';
import { detectChapters, finalizeChapters, titleFromFileName } from './text';
import { decodeText, parseTxt } from './txt';

/** Web pages saved from a browser (.html/.htm/.xhtml). */
export async function importHtml(file: Blob, fileName: string): Promise<ImportedBook> {
  const doc = new DOMParser().parseFromString(decodeText(new Uint8Array(await file.arrayBuffer())), 'text/html');
  const title = doc.querySelector('title')?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim() || titleFromFileName(fileName);
  const author = doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ?? '';
  const text = htmlToText(doc.body ?? doc.documentElement);
  if (text.replace(/\s/g, '').length < 2) throw new ImportError('No readable text was found in this web page.', 'empty');
  return { title, author, format: 'txt', cover: null, chapters: finalizeChapters(detectChapters(text, title)) };
}

/** Converts Rich Text Format to plain text (enough for reading aloud). */
export function rtfToText(rtf: string): string {
  let out = '';
  let depth = 0;
  const skipDepth: number[] = [];
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf[i];
    if (c === '{') {
      depth++;
      // Skip destinations such as font tables, colors, pictures and metadata.
      if (/^\{\\(\*|fonttbl|colortbl|stylesheet|info|pict|header|footer|listtable|listoverridetable)/.test(rtf.slice(i, i + 22))) skipDepth.push(depth);
      continue;
    }
    if (c === '}') {
      if (skipDepth[skipDepth.length - 1] === depth) skipDepth.pop();
      depth--;
      continue;
    }
    const skipping = skipDepth.length > 0;
    if (c === '\\') {
      const next = rtf[i + 1];
      if (next === '\\' || next === '{' || next === '}') {
        if (!skipping) out += next;
        i++;
        continue;
      }
      if (next === "'") {
        if (!skipping) out += String.fromCharCode(parseInt(rtf.slice(i + 2, i + 4), 16));
        i += 3;
        continue;
      }
      const m = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i, i + 40));
      if (m) {
        const word = m[1];
        if (!skipping) {
          if (word === 'par' || word === 'line') out += '\n\n';
          else if (word === 'tab') out += ' ';
          else if (word === 'u' && m[2]) out += String.fromCharCode((Number(m[2]) + 65536) % 65536);
        }
        i += m[0].length - 1;
        // \uN is followed by a fallback character to skip.
        if (word === 'u' && rtf[i + 1] === '?') i++;
        continue;
      }
      i++;
      continue;
    }
    if (!skipping && c !== '\r' && c !== '\n') out += c;
  }
  return out;
}

export async function importRtf(file: Blob, fileName: string): Promise<ImportedBook> {
  const raw = decodeText(new Uint8Array(await file.arrayBuffer()));
  const text = rtfToText(raw);
  if (text.replace(/\s/g, '').length < 2) throw new ImportError('No readable text was found in this RTF document.', 'empty');
  const title = titleFromFileName(fileName);
  return { title, author: '', format: 'txt', cover: null, chapters: finalizeChapters(detectChapters(text, title)) };
}

/** True when the bytes look like human-readable text (any extension). */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  const sample = bytes.subarray(0, 4096);
  let bad = 0;
  for (const b of sample) if (b === 0 || (b < 9) || (b > 13 && b < 32)) bad++;
  return bad / sample.length < 0.02;
}

/** Any other file that turns out to be plain text. */
export async function importUnknownText(file: Blob, fileName: string): Promise<ImportedBook | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeText(bytes)) return null;
  return parseTxt(decodeText(bytes), fileName);
}
