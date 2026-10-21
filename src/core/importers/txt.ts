import type { ImportedBook } from '../types';
import { detectChapters, finalizeChapters, titleFromFileName, unwrapLines } from './text';

/** Decodes bytes as UTF-8 / UTF-16 (BOM) and falls back to Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function parseTxt(raw: string, fileName: string): ImportedBook {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  // Project Gutenberg style header/footer removal.
  const start = lines.findIndex((l) => /^\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG/i.test(l));
  const end = lines.findIndex((l) => /^\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i.test(l));
  const header = start > 0 ? lines.slice(0, start).join('\n') : '';
  const body = lines.slice(start >= 0 ? start + 1 : 0, end > start ? end : undefined);

  let title = titleFromFileName(fileName);
  let author = '';
  const t = /^Title:\s*(.+)$/im.exec(header);
  const a = /^Author:\s*(.+)$/im.exec(header);
  if (t) title = t[1].trim();
  if (a) author = a[1].trim();

  const text = unwrapLines(body);
  return { title, author, format: 'txt', cover: null, chapters: finalizeChapters(detectChapters(text, title)) };
}

export async function importTxt(file: Blob, fileName: string): Promise<ImportedBook> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return parseTxt(decodeText(bytes), fileName);
}
