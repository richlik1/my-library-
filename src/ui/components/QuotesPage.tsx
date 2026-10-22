import { useEffect, useMemo, useState } from 'react';
import { XP_RULES, localDate, xpIds } from '../../core/habits';
import { awardXp, getContent, listAllAnnotations, listBooks, saveAnnotation } from '../../core/storage/db';
import type { Annotation, Book } from '../../core/types';
import { habitsChanged } from '../hooks/useHabits';
import { useToast } from '../hooks/toast';
import { goBack, navigate } from '../hooks/useRoute';
import { Icon } from './Icon';
import { downloadBlob } from './PlayerSheets';
import { Sheet } from './Sheet';

interface Quote {
  a: Annotation;
  book: Book;
  chapterTitle: string;
}

/** Longest excerpt offered for sharing: a short quotation, never whole pages of a book. */
const SHARE_LIMIT = 280;

export function quotesMarkdown(quotes: Quote[]): string {
  const lines = ['# My quotes', '', `Exported from My Library on ${new Date().toLocaleDateString()}.`, ''];
  for (const q of quotes) {
    lines.push(`> ${q.a.quote.replace(/\n+/g, ' ')}`, '', `— ${q.book.title}${q.book.author ? `, ${q.book.author}` : ''} · ${q.chapterTitle}`);
    if (q.a.note) lines.push('', `Note: ${q.a.note}`);
    if (q.a.tags?.length) lines.push('', `Tags: ${q.a.tags.join(', ')}`);
    lines.push(`Saved: ${new Date(q.a.createdAt).toLocaleDateString()}`, '', '---', '');
  }
  return lines.join('\n');
}

/** Your saved passages, lessons and notes from every book. */
export function QuotesPage() {
  const toast = useToast();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('All');
  const [bookId, setBookId] = useState('all');
  const [editing, setEditing] = useState<Quote | null>(null);
  const [sharing, setSharing] = useState<Quote | null>(null);

  const refresh = async () => {
    const [annotations, books] = await Promise.all([listAllAnnotations(), listBooks()]);
    const byId = new Map(books.map((b) => [b.id, b]));
    const titles = new Map<string, string[]>();
    const out: Quote[] = [];
    for (const a of annotations.filter((x) => x.kind !== 'bookmark').sort((x, y) => y.createdAt - x.createdAt)) {
      const book = byId.get(a.bookId);
      if (!book) continue;
      if (!titles.has(book.id)) titles.set(book.id, ((await getContent(book.id))?.chapters ?? []).map((c) => c.title));
      out.push({ a, book, chapterTitle: titles.get(book.id)?.[a.chapter] ?? `Chapter ${a.chapter + 1}` });
    }
    setQuotes(out);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const tags = useMemo(() => [...new Set((quotes ?? []).flatMap((q) => q.a.tags ?? []))].sort(), [quotes]);
  const books = useMemo(() => [...new Map((quotes ?? []).map((q) => [q.book.id, q.book])).values()], [quotes]);
  const visible = useMemo(() => {
    const qq = query.trim().toLowerCase();
    return (quotes ?? []).filter((q) => {
      if (bookId !== 'all' && q.book.id !== bookId) return false;
      if (filter === 'Favorites' && !q.a.favorite) return false;
      if (filter !== 'All' && filter !== 'Favorites' && !(q.a.tags ?? []).includes(filter)) return false;
      return !qq || [q.a.quote, q.a.note ?? '', q.book.title, q.chapterTitle, ...(q.a.tags ?? [])].some((t) => t.toLowerCase().includes(qq));
    });
  }, [quotes, query, filter, bookId]);

  // Today's review: three quotes you haven't looked at for the longest time.
  const review = useMemo(() => {
    const today = localDate();
    return [...(quotes ?? [])]
      .filter((q) => !q.a.reviewedAt || localDate(q.a.reviewedAt) !== today)
      .sort((x, y) => (x.a.reviewedAt ?? 0) - (y.a.reviewedAt ?? 0) || x.a.createdAt - y.a.createdAt)
      .slice(0, 3);
  }, [quotes]);

  const patch = async (q: Quote, p: Partial<Annotation>) => {
    await saveAnnotation({ ...q.a, ...p });
    await refresh();
  };

  const markReviewed = async (q: Quote) => {
    await patch(q, { reviewedAt: Date.now() });
    const today = localDate();
    const isNew = await awardXp({ id: xpIds.review(today), kind: 'review', amount: XP_RULES.review, at: Date.now(), label: `Reviewed your quotes on ${today}` });
    habitsChanged();
    if (isNew) toast(`+${XP_RULES.review} XP for today’s review`);
  };

  return (
    <div className="page tab-page">
      <header className="topbar">
        <button className="icon-btn" onClick={goBack} aria-label="Back">
          <Icon name="chevronLeft" />
        </button>
        <h1 style={{ flex: 1 }}>Quotes</h1>
        <button
          className="btn"
          disabled={!quotes?.length}
          onClick={() => downloadBlob(new Blob([quotesMarkdown(visible)], { type: 'text/markdown' }), `My quotes ${localDate()}.md`)}
        >
          <Icon name="download" size={16} /> Export
        </button>
      </header>

      {quotes === null ? (
        <div className="spinner" style={{ margin: '40px auto' }} />
      ) : quotes.length === 0 ? (
        <div className="empty">
          <h2>No quotes yet</h2>
          <p>While listening, tap Save to keep the sentence you’re hearing as a lesson, or tap any sentence and choose Highlight.</p>
        </div>
      ) : (
        <>
          {review.length > 0 && (
            <section aria-labelledby="review-h" className="card">
              <h2 className="h-small" id="review-h">
                Today’s review
              </h2>
              <p className="small muted" style={{ margin: '4px 0 10px' }}>
                Three saved ideas you haven’t looked at for a while.
              </p>
              {review.map((q) => (
                <div key={q.a.id} className="review-item" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontFamily: 'var(--serif)' }}>{q.a.quote}</div>
                  <div className="quote-ref" style={{ marginTop: 4 }}>
                    {q.book.title} · {q.chapterTitle}
                  </div>
                  <button className="btn" style={{ marginTop: 8 }} onClick={() => markReviewed(q)}>
                    <Icon name="check" size={16} /> Reviewed
                  </button>
                </div>
              ))}
            </section>
          )}

          <div className="search" style={{ marginTop: 6 }}>
            <Icon name="search" size={20} />
            <input type="search" placeholder="Search quotes, notes and tags" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search quotes" />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <div className="chips" role="tablist" style={{ flex: 1 }}>
              {['All', 'Favorites', ...tags].map((t) => (
                <button key={t} role="tab" aria-selected={filter === t} className={`chip ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {books.length > 1 && (
            <select className="input" aria-label="Filter by book" value={bookId} onChange={(e) => setBookId(e.target.value)} style={{ marginBottom: 12 }}>
              <option value="all">All books</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          )}

          {visible.map((q) => (
            <article key={q.a.id} className="quote-card" aria-label={`Quote from ${q.book.title}`}>
              <blockquote>{q.a.quote}</blockquote>
              <div className="quote-ref">
                {q.book.title}
                {q.book.author ? `, ${q.book.author}` : ''} · {q.chapterTitle} · {new Date(q.a.createdAt).toLocaleDateString()}
              </div>
              {q.a.note && <p className="quote-note">{q.a.note}</p>}
              {!!q.a.tags?.length && (
                <div className="quote-tags">
                  {q.a.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="quote-actions">
                <button className="icon-btn" aria-pressed={!!q.a.favorite} aria-label={q.a.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => patch(q, { favorite: !q.a.favorite })}>
                  <Icon name="star" size={20} className={q.a.favorite ? 'fav-on' : undefined} />
                </button>
                <button className="icon-btn" aria-label="Edit note and tags" onClick={() => setEditing(q)}>
                  <Icon name="edit" size={18} />
                </button>
                <button className="icon-btn" aria-label="Open in the book" onClick={() => navigate(`/book/${q.book.id}?at=${q.a.chapter}.${q.a.start}`)}>
                  <Icon name="book" size={18} />
                </button>
                <button className="icon-btn" aria-label="Quote card" onClick={() => setSharing(q)}>
                  <Icon name="share" size={18} />
                </button>
              </div>
            </article>
          ))}
          {visible.length === 0 && <p className="muted" style={{ textAlign: 'center' }}>No quotes match.</p>}
        </>
      )}

      {editing && (
        <EditQuoteSheet
          quote={editing}
          onClose={() => setEditing(null)}
          onSave={async (note, tagList) => {
            await patch(editing, { note: note || undefined, tags: tagList, kind: note ? 'note' : editing.a.kind === 'note' ? 'highlight' : editing.a.kind });
            setEditing(null);
          }}
        />
      )}
      {sharing && <QuoteCardSheet quote={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}

function EditQuoteSheet({ quote, onClose, onSave }: { quote: Quote; onClose(): void; onSave(note: string, tags: string[]): void }) {
  const [note, setNote] = useState(quote.a.note ?? '');
  const [tags, setTags] = useState((quote.a.tags ?? []).join(', '));
  return (
    <Sheet title="Edit quote" onClose={onClose}>
      <blockquote style={{ fontFamily: 'var(--serif)', margin: '0 0 12px' }}>{quote.a.quote}</blockquote>
      <label className="field">
        <span>Your note</span>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="field">
        <span>Tags (separated by commas)</span>
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="lesson, leadership, family" />
      </label>
      <button
        className="btn btn-primary"
        onClick={() =>
          onSave(
            note.trim(),
            [...new Set(tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
          )
        }
      >
        Save
      </button>
    </Sheet>
  );
}

/** A quote card to look at or share. Sharing sends a short excerpt only, after you confirm. */
function QuoteCardSheet({ quote, onClose }: { quote: Quote; onClose(): void }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const excerpt = quote.a.quote.length > SHARE_LIMIT ? `${quote.a.quote.slice(0, SHARE_LIMIT).replace(/\s+\S*$/, '')}…` : quote.a.quote;
  const text = `“${excerpt}”\n— ${quote.book.title}${quote.book.author ? `, ${quote.book.author}` : ''}`;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  return (
    <Sheet title="Quote card" onClose={onClose}>
      <div className="share-card">
        <blockquote>“{excerpt}”</blockquote>
        <div className="ref">
          {quote.book.title}
          {quote.book.author ? ` · ${quote.book.author}` : ''}
        </div>
      </div>
      {quote.a.quote.length > SHARE_LIMIT && <p className="small muted">Shortened to a brief excerpt for sharing.</p>}
      {!confirm ? (
        <button className="btn" style={{ marginTop: 14 }} onClick={() => setConfirm(true)}>
          <Icon name="share" size={16} /> Share excerpt…
        </button>
      ) : (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="small" style={{ marginTop: 0 }}>
            This shares only the short excerpt above with the app you pick. Passages from books are usually copyrighted, so keep shares brief and personal.
          </p>
          <div className="row" style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  if (canShare) await navigator.share({ text });
                  else {
                    await navigator.clipboard.writeText(text);
                    toast('Copied the excerpt');
                  }
                } catch {
                  /* cancelled */
                }
                setConfirm(false);
              }}
            >
              {canShare ? 'Share' : 'Copy excerpt'}
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
