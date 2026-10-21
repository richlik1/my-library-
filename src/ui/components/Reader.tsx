import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Chunk } from '../../core/speech/chunker';
import type { Annotation, Chapter } from '../../core/types';
import { Icon } from './Icon';

export interface TextRange {
  start: number;
  end: number;
  quote: string;
}

interface Props {
  chapter: Chapter;
  chapterIndex: number;
  chunks: Chunk[];
  activeChunk: number;
  /** Current word offset, or -1 when not speaking. */
  wordOffset: number;
  annotations: Annotation[];
  fontSize: number;
  follow: boolean;
  isLast: boolean;
  onChunkTap(chunk: Chunk, rect: DOMRect): void;
  onSelect(range: TextRange, rect: DOMRect): void;
  onNoteOpen(a: Annotation): void;
  onNextChapter(): void;
}

interface Para {
  index: number;
  chunks: Chunk[];
}

export function Reader(p: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserScroll = useRef(0);

  const paras = useMemo(() => {
    const out: Para[] = [];
    for (const c of p.chunks) {
      const last = out[out.length - 1];
      if (last && last.index === c.paragraph) last.chunks.push(c);
      else out.push({ index: c.paragraph, chunks: [c] });
    }
    return out;
  }, [p.chunks]);

  // Annotations grouped per paragraph so unchanged paragraphs don't re-render.
  const byPara = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const para of paras) {
      const s = para.chunks[0].start;
      const e = para.chunks[para.chunks.length - 1].end;
      const list = p.annotations.filter((a) => a.chapter === p.chapterIndex && a.start < e && (a.end > s || (a.kind === 'bookmark' && a.start >= s)));
      if (list.length) map.set(para.index, list);
    }
    return map;
  }, [paras, p.annotations, p.chapterIndex]);

  const activePara = p.chunks[p.activeChunk]?.paragraph ?? -1;

  // Follow the narration unless the reader scrolled by hand in the last few seconds.
  useEffect(() => {
    if (!p.follow || p.wordOffset < 0) return;
    if (Date.now() - lastUserScroll.current < 4000) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-i="${p.activeChunk}"]`);
    const box = scrollRef.current;
    if (!el || !box) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top + b.height * 0.2 || r.bottom > b.top + b.height * 0.7) {
      box.scrollTo({ top: box.scrollTop + r.top - b.top - b.height * 0.33, behavior: 'smooth' });
    }
  }, [p.activeChunk, p.follow, p.wordOffset]);

  // Jump to the current sentence when a chapter opens.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const el = box.querySelector<HTMLElement>(`[data-i="${p.activeChunk}"]`);
    if (el && p.activeChunk > 0) box.scrollTop = el.offsetTop - box.clientHeight * 0.33;
    else box.scrollTop = 0;
  }, [p.chapterIndex]);

  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const startEl = closestChunk(range.startContainer);
    const endEl = closestChunk(range.endContainer);
    if (!startEl || !endEl || !scrollRef.current?.contains(startEl)) return false;
    const start = Number(startEl.dataset.s) + textOffset(startEl, range.startContainer, range.startOffset);
    const end = Number(endEl.dataset.s) + textOffset(endEl, range.endContainer, range.endOffset);
    if (end - start < 2) return false;
    const quote = p.chapter.text.slice(start, end).trim();
    p.onSelect({ start, end, quote }, range.getBoundingClientRect());
    return true;
  };

  return (
    <div
      className="reader"
      ref={scrollRef}
      onWheel={() => (lastUserScroll.current = Date.now())}
      onTouchMove={() => (lastUserScroll.current = Date.now())}
      onMouseUp={() => setTimeout(handleSelection, 0)}
      onTouchEnd={() => setTimeout(handleSelection, 350)}
      onClick={(e) => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        const target = e.target as HTMLElement;
        const pin = target.closest<HTMLElement>('[data-note]');
        if (pin) {
          const a = p.annotations.find((x) => x.id === pin.dataset.note);
          if (a) p.onNoteOpen(a);
          return;
        }
        const el = target.closest<HTMLElement>('[data-i]');
        if (!el) return;
        const chunk = p.chunks[Number(el.dataset.i)];
        if (chunk) p.onChunkTap(chunk, el.getBoundingClientRect());
      }}
    >
      <div className="reader-inner" style={{ fontSize: p.fontSize }}>
        {paras.map((para, i) => (
          <Paragraph
            key={para.index}
            para={para}
            text={p.chapter.text}
            heading={i === 0 && para.chunks.length === 1 && isTitle(para.chunks[0].text, p.chapter.title)}
            active={para.index === activePara ? p.activeChunk : -1}
            word={para.index === activePara ? p.wordOffset : -1}
            readUpTo={para.index < activePara ? Infinity : para.index === activePara ? p.activeChunk : -1}
            annotations={byPara.get(para.index)}
          />
        ))}
        {paras.length === 0 && <p className="muted">This chapter has no readable text.</p>}
        <div className="chapter-end">
          {!p.isLast ? (
            <button className="btn" onClick={p.onNextChapter}>
              Next chapter <Icon name="chevronRight" size={18} />
            </button>
          ) : (
            <span className="muted">The end</span>
          )}
        </div>
      </div>
    </div>
  );
}

function isTitle(text: string, title: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return text.length < 120 && norm(title).startsWith(norm(text));
}

const Paragraph = memo(function Paragraph({
  para,
  text,
  heading,
  active,
  word,
  readUpTo,
  annotations,
}: {
  para: Para;
  text: string;
  heading: boolean;
  active: number;
  word: number;
  readUpTo: number;
  annotations?: Annotation[];
}) {
  const bookmark = annotations?.find((a) => a.kind === 'bookmark' && a.start >= para.chunks[0].start);
  const ranges = annotations?.filter((a) => a.kind !== 'bookmark') ?? [];
  const children = para.chunks.map((c, i) => (
    <span key={c.index}>
      {i > 0 && ' '}
      <span data-i={c.index} data-s={c.start} className={`chunk ${c.index === active ? 'active' : ''} ${c.index < readUpTo ? 'read' : ''}`}>
        {renderSegments(text, c, ranges, c.index === active ? word : -1)}
      </span>
    </span>
  ));
  const flag = bookmark && (
    <span className="bm-flag" aria-label="Bookmark">
      <Icon name="bookmark" size={14} />
    </span>
  );
  return heading ? (
    <h2 className="chapter-heading">
      {flag}
      {children}
    </h2>
  ) : (
    <p>
      {flag}
      {children}
    </p>
  );
});

function renderSegments(text: string, c: Chunk, ranges: Annotation[], word: number) {
  const marks = ranges.filter((a) => a.start < c.end && a.end > c.start);
  let wordStart = -1;
  let wordEnd = -1;
  if (word >= c.start && word < c.end) {
    wordStart = word;
    wordEnd = word;
    while (wordEnd < c.end && !/\s/.test(text[wordEnd])) wordEnd++;
  }
  if (!marks.length && wordStart < 0) return c.text;
  const cuts = new Set([c.start, c.end]);
  for (const m of marks) {
    cuts.add(Math.max(c.start, m.start));
    cuts.add(Math.min(c.end, m.end));
  }
  if (wordStart >= 0) {
    cuts.add(wordStart);
    cuts.add(wordEnd);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const seg = text.slice(a, b);
    const mark = [...marks].reverse().find((m) => m.start <= a && m.end >= b);
    const inner = a >= wordStart && b <= wordEnd && wordStart >= 0 ? <span className="word">{seg}</span> : seg;
    out.push(
      mark ? (
        <mark key={a} className={`hl-${mark.color ?? 'gold'}`}>
          {inner}
        </mark>
      ) : (
        <span key={a}>{inner}</span>
      ),
    );
    for (const m of marks) {
      if (m.kind === 'note' && m.end === b) {
        out.push(
          <button key={`n${m.id}`} className="note-pin" data-note={m.id} aria-label="Open note" contentEditable={false}>
            <Icon name="note" size={11} />
          </button>,
        );
      }
    }
  }
  return out;
}

function closestChunk(node: Node): HTMLElement | null {
  const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  return el?.closest<HTMLElement>('[data-s]') ?? null;
}

/** Character offset of (node, offset) within a chunk element's text. */
function textOffset(chunkEl: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(chunkEl);
  try {
    r.setEnd(node, offset);
  } catch {
    return 0;
  }
  // Note pins contain no text, so the range text maps 1:1 onto the chunk text.
  return r.toString().length;
}
