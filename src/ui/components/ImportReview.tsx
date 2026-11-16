import { useEffect, useMemo, useState } from 'react';
import { buildImportReport, type ReportFlag } from '../../core/importers/report';
import { build, changed, mergeWithNext, move, organize, paragraphStarts, rename, setRemoved, splitAt, textOf, type OrganizedChapter } from '../../core/organizer';
import { getBook, getContent, reorganizeBook, updateBook } from '../../core/storage/db';
import type { Book, Chapter } from '../../core/types';
import { usePlaybackSession } from '../hooks/playbackSession';
import { useToast } from '../hooks/toast';
import { goBack, navigate } from '../hooks/useRoute';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const CONFIDENCE = {
  high: { label: 'Looks right', cls: 'ok' },
  check: { label: 'Worth a check', cls: 'check' },
  low: { label: 'Problems found', cls: 'bad' },
} as const;

const ORDER_LABEL = { 'matches-source': 'Order checked against the book', conflicts: 'Order conflicts found', unverified: 'Order not verifiable' } as const;

function FlagList({ flags }: { flags: ReportFlag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="review-flags">
      {flags.map((f, i) => (
        <li key={i} className={`sev-${f.severity}`}>
          <Icon name={f.severity === 'info' ? 'info' : 'flag'} size={14} /> {f.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * Import Quality Review and Chapter Organizer: what was extracted (chapters, words, sample text), what looks wrong,
 * and tools to reorder, rename, split, merge or remove chapters. Changes are applied only on Save; the original file
 * is never changed.
 */
export function ImportReview({ id }: { id: string }) {
  const toast = useToast();
  const pb = usePlaybackSession();
  const [book, setBook] = useState<Book | null>(null);
  const [original, setOriginal] = useState<Chapter[] | null>(null);
  const [list, setList] = useState<OrganizedChapter[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ index: number; title: string } | null>(null);
  const [splitting, setSplitting] = useState<{ index: number; title: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([getBook(id), getContent(id)]).then(([b, c]) => {
      if (!b || !c) return;
      setBook(b);
      setOriginal(c.chapters);
      setList(organize(c.chapters));
    });
  }, [id]);

  const current = useMemo(() => (original ? build(list, original) : []), [list, original]);
  const report = useMemo(() => (book ? buildImportReport({ chapters: current, ocr: book.ocr, signals: book.signals }) : null), [book, current]);
  // Kept chapters' reports, matched to rows (removed rows have none).
  const rowReports = useMemo(() => {
    let k = 0;
    return list.map((c) => (c.removed ? null : report?.chapters[k++] ?? null));
  }, [list, report]);

  if (!book || !original || !report) return <div className="page tab-page" />;
  const dirty = changed(list, original);
  const keptCount = list.filter((c) => !c.removed).length;

  const save = async () => {
    setSaving(true);
    try {
      if (dirty) {
        const { chapters, audioCleared } = await reorganizeBook(id, list);
        // A book open in the player picks up its new chapters.
        if (pb.session?.book.id === id) pb.replaceChapters(id, chapters);
        toast(audioCleared ? 'Chapters saved. Audio for this book will be made again.' : 'Chapters saved.');
      } else {
        await updateBook(id, { needsReview: false });
        toast('Marked as checked.');
      }
      goBack();
    } catch (e) {
      toast(`Couldn’t save: ${(e as Error).message}`, { kind: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const conf = CONFIDENCE[report.confidence];
  return (
    <div className="page tab-page import-review">
      <header className="topbar">
        <button className="icon-btn" onClick={goBack} aria-label="Back">
          <Icon name="chevronLeft" />
        </button>
        <h1 style={{ flex: 1 }}>Check this book</h1>
      </header>

      <section className="card review-summary" aria-labelledby="review-h">
        <h2 id="review-h" className="h-small">
          {book.title}
        </h2>
        <div className="review-stats">
          <span className={`badge-conf ${conf.cls}`} role="status">
            {conf.label}
          </span>
          <span>
            {keptCount} chapter{keptCount === 1 ? '' : 's'} · {report.words.toLocaleString()} words
            {book.signals?.pages ? ` · ${book.signals.pages} pages` : ''}
          </span>
        </div>
        <p className="small" style={{ margin: '10px 0 0' }}>
          <strong>{ORDER_LABEL[report.order.status]}.</strong> {report.order.explanation}
        </p>
        <FlagList flags={report.flags} />
        <p className="small muted" style={{ marginBottom: 0 }}>
          Open each chapter to see how it starts and ends. Nothing is invented: text that couldn’t be read is reported here, not filled in.
          Changes are saved only when you tap Save, and the original file is never changed.
        </p>
      </section>

      <h2 className="section-title">Chapters</h2>
      <ol className="organizer" aria-label="Chapters">
        {list.map((c, i) => {
          const r = rowReports[i];
          const text = textOf(c, original);
          return (
            <li key={`${i}-${c.ranges.map((x) => `${x.ch}.${x.start}`).join('-')}`} className={`org-row ${c.removed ? 'removed' : ''}`}>
              <div className="org-head">
                <button className="grow org-title" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} aria-label={`${c.title} (number ${i + 1})`}>
                  <span className="num">{i + 1}</span>
                  <span className="t">
                    {c.title}
                    <small>
                      {c.removed
                        ? 'Removed'
                        : `${r?.words.toLocaleString() ?? 0} words${r?.pageRange ? ` · p. ${r.pageRange[0]}${r.pageRange[1] !== r.pageRange[0] ? `–${r.pageRange[1]}` : ''}` : ''}${c.kind === 'notes' ? ' · notes' : ''}`}
                    </small>
                  </span>
                  {r && r.confidence !== 'high' && <span className={`dot ${r.confidence}`} aria-label={r.confidence === 'low' ? 'problem' : 'check'} />}
                </button>
              </div>
              {r && <FlagList flags={r.flags} />}
              {open === i && (
                <div className="org-body">
                  {!c.removed && r && (
                    <div className="org-sample">
                      <p>
                        <span className="muted small">Starts: </span>
                        {r.firstParagraph}
                      </p>
                      {r.lastParagraph !== r.firstParagraph && (
                        <p>
                          <span className="muted small">Ends: </span>
                          {r.lastParagraph}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="org-actions" role="group" aria-label={`Change ${c.title}`}>
                    <button className="pill" onClick={() => {
                        setList(move(list, i, -1));
                        setOpen(i + -1); // the open row follows its chapter
                      }} disabled={i === 0} aria-label={`Move ${c.title} up`}>
                      <Icon name="chevronUp" size={14} /> Up
                    </button>
                    <button className="pill" onClick={() => {
                        setList(move(list, i, 1));
                        setOpen(i + 1); // the open row follows its chapter
                      }} disabled={i === list.length - 1} aria-label={`Move ${c.title} down`}>
                      <Icon name="chevronDown" size={14} /> Down
                    </button>
                    <button className="pill" onClick={() => setRenaming({ index: i, title: c.title })}>
                      Rename
                    </button>
                    <button className="pill" onClick={() => setSplitting({ index: i, title: '' })} disabled={paragraphStarts(c, original).length < 2}>
                      Split
                    </button>
                    <button className="pill" onClick={() => setList(mergeWithNext(list, i))} disabled={i === list.length - 1} aria-label={`Merge ${c.title} with the next chapter`}>
                      Merge with next
                    </button>
                    <button className="pill" onClick={() => setList(setRemoved(list, i, !c.removed))} disabled={!c.removed && keptCount <= 1}>
                      {c.removed ? 'Restore' : 'Remove'}
                    </button>
                  </div>
                  {text.length > 0 && <p className="muted small">{text.split(/\n\n/).length} paragraphs</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="review-actions">
        {dirty && (
          <button className="btn" onClick={() => setList(organize(original))}>
            Undo changes
          </button>
        )}
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {dirty ? 'Save chapters' : report.confidence === 'low' ? 'Keep as it is' : 'Looks right'}
        </button>
        <button className="btn" onClick={() => navigate(`/book/${id}`)}>
          Open book
        </button>
      </div>

      {renaming && (
        <Sheet title="Rename chapter" onClose={() => setRenaming(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setList(rename(list, renaming.index, renaming.title));
              setRenaming(null);
            }}
          >
            <label className="field">
              <span>Title</span>
              <input className="input" value={renaming.title} onChange={(e) => setRenaming({ ...renaming, title: e.target.value })} autoFocus aria-label="Chapter title" />
            </label>
            <button className="btn btn-primary" type="submit" style={{ width: '100%', marginTop: 12 }}>
              Rename
            </button>
          </form>
        </Sheet>
      )}

      {splitting && (
        <Sheet title="Split chapter" onClose={() => setSplitting(null)}>
          <p className="small muted">Tap the paragraph that should start the new chapter.</p>
          <label className="field">
            <span>New chapter title</span>
            <input className="input" value={splitting.title} placeholder={`${list[splitting.index].title} (continued)`} onChange={(e) => setSplitting({ ...splitting, title: e.target.value })} aria-label="New chapter title" />
          </label>
          <ol className="split-list" aria-label="Paragraphs">
            {textOf(list[splitting.index], original)
              .split(/\n\n/)
              .map((p, k) =>
                k === 0 ? null : (
                  <li key={k}>
                    <button
                      className="list-row"
                      onClick={() => {
                        setList(splitAt(list, original, splitting.index, k, splitting.title));
                        setSplitting(null);
                      }}
                    >
                      {p.length > 90 ? `${p.slice(0, 90)}…` : p}
                    </button>
                  </li>
                ),
              )}
          </ol>
        </Sheet>
      )}
    </div>
  );
}
