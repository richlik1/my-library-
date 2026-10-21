import { useCallback, useEffect, useMemo, useState } from 'react';
import { SAMPLE_BOOK } from '../../core/sampleBook';
import { listBooks, listProgress, saveImportedBook } from '../../core/storage/db';
import { isIOS } from '../../core/speech/webSpeechEngine';
import type { Book, Progress } from '../../core/types';
import { navigate } from '../hooks/useRoute';
import { SectionNav } from '../growth/SectionNav';
import { isNativeApp } from '../platform';
import { BookDetailsSheet, listeningHours } from './BookDetailsSheet';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { useImporter } from './useImporter';

const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function setFlag(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* private mode */
  }
}

export function Library() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [query, setQuery] = useState('');
  const [shelf, setShelf] = useState<string>('All');
  const [editing, setEditing] = useState<{ book: Book; isNew: boolean } | null>(null);
  const [hideInstall, setHideInstall] = useState(() => readFlag('ml-hide-install'));

  const refresh = useCallback(async () => {
    const [b, p] = await Promise.all([listBooks(), listProgress()]);
    setBooks(b);
    setProgress(new Map(p.map((x) => [x.bookId, x])));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const importer = useImporter(
    useCallback(
      (added: Book[], openDetails: boolean) => {
        refresh();
        if (openDetails) setEditing({ book: added[0], isNew: true });
      },
      [refresh],
    ),
  );

  const shelves = useMemo(() => {
    const cats = [...new Set((books ?? []).map((b) => b.category))].sort();
    const s = ['All'];
    if ((books ?? []).some((b) => (progress.get(b.id)?.percent ?? 0) > 0 && !progress.get(b.id)?.finished)) s.push('Listening');
    if ((books ?? []).some((b) => b.favorite)) s.push('Favorites');
    if ((books ?? []).some((b) => progress.get(b.id)?.finished)) s.push('Finished');
    return [...s, ...cats];
  }, [books, progress]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (books ?? []).filter((b) => {
      const p = progress.get(b.id);
      if (shelf === 'Listening' && !((p?.percent ?? 0) > 0 && !p?.finished)) return false;
      if (shelf === 'Favorites' && !b.favorite) return false;
      if (shelf === 'Finished' && !p?.finished) return false;
      if (!['All', 'Listening', 'Favorites', 'Finished'].includes(shelf) && b.category !== shelf) return false;
      return !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.category.toLowerCase().includes(q);
    });
  }, [books, progress, query, shelf]);

  const current = useMemo(
    () => (books ?? []).find((b) => b.lastOpenedAt && !progress.get(b.id)?.finished),
    [books, progress],
  );

  const showInstall = isIOS() && !isNativeApp() && !isStandalone() && !hideInstall;

  return (
    <div className="page">
      <header className="topbar">
        <h1>
          My <em>Library</em>
        </h1>
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings and backup">
          <Icon name="settings" />
        </button>
        <button className="icon-btn" onClick={importer.openPaste} aria-label="Paste text as a book">
          <Icon name="text" />
        </button>
        <importer.AddLabel className="btn btn-primary" label="Add a book">
          <Icon name="plus" size={18} /> Add
        </importer.AddLabel>
      </header>
      <SectionNav active="books" />
      {importer.ui}

      {showInstall && (
        <div className="banner">
          <span className="icon-wrap">
            <Icon name="share" />
          </span>
          <div className="banner-body">
            <strong>Install on your iPhone:</strong> tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong>. The
            app then opens full-screen, works offline and your library is protected from Safari’s automatic clean-up.
          </div>
          <button
            className="icon-btn"
            aria-label="Dismiss"
            onClick={() => {
              setFlag('ml-hide-install');
              setHideInstall(true);
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      {books && books.length === 0 && (
        <div className="empty">
          <div className="art">
            <Icon name="book" size={54} />
          </div>
          <h2>Your private audiobook shelf</h2>
          <p>Add a PDF, EPUB, Word, RTF, web page or text book. It’s read aloud with your device’s free voices — nothing is uploaded, no account needed.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <importer.AddLabel className="btn btn-primary">
              <Icon name="plus" size={18} /> Add your first book
            </importer.AddLabel>
            <button
              className="btn"
              onClick={async () => {
                const text = SAMPLE_BOOK.chapters.map((c) => c.text).join('\n\n');
                const book = await saveImportedBook(
                  SAMPLE_BOOK,
                  { name: 'Welcome to My Library.txt', size: text.length, type: 'text/plain', data: new Blob([text], { type: 'text/plain' }) },
                  'Other',
                );
                navigate(`/book/${book.id}?play`);
              }}
            >
              <Icon name="play" size={16} /> Try a sample book
            </button>
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={importer.openPaste}>
            <Icon name="text" size={16} /> Paste text instead
          </button>
          <div className="features">
            <div>
              <Icon name="shield" /> Files stay on this device, stored privately in the app.
            </div>
            <div>
              <Icon name="bookmark" /> Your place is saved automatically — resume exactly where you stopped.
            </div>
            <div>
              <Icon name="highlight" /> Highlights, bookmarks and notes, with backup &amp; restore.
            </div>
            <div>
              <Icon name="download" /> Works offline once installed.
            </div>
          </div>
        </div>
      )}

      {books && books.length > 0 && (
        <>
          {current && (
            <>
              <div className="section-title">Continue listening</div>
              <div className="hero" onClick={() => navigate(`/book/${current.id}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/book/${current.id}`)}>
                <Cover book={current} size={0.8} />
                <div className="hero-body">
                  <div className="hero-eyebrow">{Math.round((progress.get(current.id)?.percent ?? 0) * 100)}% complete</div>
                  <h2>{current.title}</h2>
                  <div className="muted small">{current.author || current.category}</div>
                  <div className="progress-line" style={{ marginTop: 10 }}>
                    <i style={{ width: `${(progress.get(current.id)?.percent ?? 0) * 100}%` }} />
                  </div>
                  <div className="muted small" style={{ marginTop: 6 }}>
                    {listeningHours(current.charCount * (1 - (progress.get(current.id)?.percent ?? 0)))} left at 1×
                  </div>
                </div>
                <button
                  className="play-btn small play-fab"
                  aria-label={`Resume ${current.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/book/${current.id}?play`);
                  }}
                >
                  <Icon name="play" size={24} />
                </button>
              </div>
            </>
          )}

          <div className="search" style={{ marginTop: 20 }}>
            <Icon name="search" size={20} />
            <input type="search" placeholder="Search title, author or category" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search books" />
          </div>
          <div className="chips" role="tablist">
            {shelves.map((s) => (
              <button key={s} className={`chip ${shelf === s ? 'active' : ''}`} onClick={() => setShelf(s)} role="tab" aria-selected={shelf === s}>
                {s}
              </button>
            ))}
          </div>

          <div className="grid" style={{ marginTop: 10 }}>
            {visible.map((b) => {
              const p = progress.get(b.id);
              return (
                <div key={b.id} className="book-card">
                  <button onClick={() => navigate(`/book/${b.id}`)} aria-label={`Open ${b.title}`} style={{ textAlign: 'left' }}>
                    <div style={{ position: 'relative' }}>
                      <Cover book={b} />
                      <span className="badge">{b.format}</span>
                      {b.ocr && <span className="badge warn">OCR</span>}
                    </div>
                  </button>
                  <button className="more" onClick={() => setEditing({ book: b, isNew: false })} aria-label={`Details for ${b.title}`}>
                    <Icon name="more" size={20} />
                  </button>
                  <div className="progress-line">
                    <i style={{ width: `${(p?.percent ?? 0) * 100}%` }} />
                  </div>
                  <div className="meta">
                    <div className="title">{b.title}</div>
                    <div className="author">{p?.finished ? 'Finished' : b.author || b.category}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {visible.length === 0 && <p className="muted" style={{ textAlign: 'center', marginTop: 30 }}>No books match.</p>}
        </>
      )}

      {editing && (
        <BookDetailsSheet
          book={editing.book}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSaved={() => refresh()}
          onDeleted={() => refresh()}
        />
      )}
    </div>
  );
}
