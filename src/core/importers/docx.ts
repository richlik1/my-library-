import JSZip from 'jszip';
import type { Chapter, ImportedBook } from '../types';
import { ImportError } from './errors';
import { detectChapters, finalizeChapters, titleFromFileName } from './text';

const local = (el: Element) => el.localName || el.nodeName.replace(/^.*:/, '');
const attr = (el: Element | undefined | null, name: string) =>
  el ? (el.getAttribute(`w:${name}`) ?? el.getAttribute(name) ?? '') : '';
function children(el: Element, name: string): Element[] {
  return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && local(n as Element) === name);
}
function descendants(el: Document | Element, name: string): Element[] {
  return Array.from(el.getElementsByTagName('*')).filter((e) => local(e) === name);
}

interface Para {
  text: string;
  level: number | null; // heading level (1 = top) or null for body text
}

function paragraphText(p: Element): string {
  let s = '';
  const walk = (el: Element) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      const name = local(e);
      if (name === 't') s += e.textContent ?? '';
      else if (name === 'tab') s += ' ';
      else if (name === 'br' || name === 'cr') s += ' ';
      else if (name === 'noBreakHyphen') s += '-';
      else if (['del', 'delText', 'instrText', 'footnoteReference', 'endnoteReference', 'pPr', 'rPr'].includes(name)) continue;
      else walk(e);
    }
  };
  walk(p);
  return s.replace(/\s+/g, ' ').trim();
}

export async function importDocx(file: Blob, fileName: string): Promise<ImportedBook> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new ImportError('This DOCX file could not be opened. Older .doc files are not supported — save it as .docx first.', 'corrupt');
  }
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new ImportError('This does not look like a Word (.docx) document.', 'corrupt');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  // Map style ids to heading levels ("Heading1", localised names, "Title").
  const headingLevels = new Map<string, number>();
  const stylesXml = await zip.file('word/styles.xml')?.async('string');
  if (stylesXml) {
    for (const st of descendants(parser.parseFromString(stylesXml, 'application/xml'), 'style')) {
      const id = attr(st, 'styleId');
      const name = attr(children(st, 'name')[0], 'val').toLowerCase();
      const outline = children(st, 'pPr')[0] ? children(children(st, 'pPr')[0], 'outlineLvl')[0] : undefined;
      const m = /^heading\s*(\d)$/.exec(name);
      if (name === 'title') headingLevels.set(id, 0);
      else if (m) headingLevels.set(id, Number(m[1]));
      else if (outline) headingLevels.set(id, Number(attr(outline, 'val')) + 1);
    }
  }

  const paras: Para[] = [];
  for (const p of descendants(doc, 'p')) {
    const text = paragraphText(p);
    if (!text) continue;
    const pPr = children(p, 'pPr')[0];
    const styleId = pPr ? attr(children(pPr, 'pStyle')[0], 'val') : '';
    const outline = pPr ? children(pPr, 'outlineLvl')[0] : undefined;
    let level: number | null = headingLevels.get(styleId) ?? null;
    if (level === null && /^heading(\d)$/i.test(styleId)) level = Number(styleId.slice(7));
    if (level === null && outline) level = Number(attr(outline, 'val')) + 1;
    if (level !== null && text.length > 150) level = null; // not really a heading
    paras.push({ text, level });
  }
  if (!paras.length) throw new ImportError('No readable text was found in this document.', 'empty');

  let title = '';
  let author = '';
  const core = await zip.file('docProps/core.xml')?.async('string');
  if (core) {
    const c = parser.parseFromString(core, 'application/xml');
    title = descendants(c, 'title')[0]?.textContent?.trim() ?? '';
    author = descendants(c, 'creator')[0]?.textContent?.trim() ?? '';
  }
  const titlePara = paras.find((p) => p.level === 0);
  title = title || titlePara?.text || titleFromFileName(fileName);

  // Split on the highest heading level that occurs at least twice.
  const counts = [1, 2, 3].map((l) => paras.filter((p) => p.level === l).length);
  const splitLevel = [1, 2, 3].find((_, i) => counts[i] >= 2);
  let chapters: Chapter[];
  if (splitLevel) {
    chapters = [];
    let cur: Chapter | null = null;
    for (const p of paras) {
      if (p.level !== null && p.level > 0 && p.level <= splitLevel) {
        if (cur && cur.text.trim()) chapters.push(cur);
        cur = { title: p.text, text: p.text };
      } else {
        if (!cur) cur = { title: 'Opening', text: '' };
        cur.text += (cur.text ? '\n\n' : '') + p.text;
      }
    }
    if (cur && cur.text.trim()) chapters.push(cur);
  } else {
    chapters = detectChapters(paras.map((p) => p.text).join('\n\n'), title);
  }
  return { title, author, format: 'docx', cover: null, chapters: finalizeChapters(chapters) };
}
