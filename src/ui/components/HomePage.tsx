import { useCallback, useEffect, useMemo, useState } from 'react';
import { SAMPLE_BOOK } from '../../core/sampleBook';
import { listBooks, listProgress, saveImportedBook } from '../../core/storage/db';
import { isIOS } from '../../core/speech/webSpeechEngine';
import type { Book, Progress } from '../../core/types';
import { usePlaybackSession } from '../hooks/playbackSession';
import { navigate } from '../hooks/useRoute';
import { isNativeApp } from '../platform';
import { BookDetailsSheet, listeningHours } from './BookDetailsSheet';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { QuickListenSheet } from './QuickListen';
import { GoalCard } from './Goal';
import { useHabits } from '../hooks/useHabits';
import { useSettings } from '../hooks/settings';
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

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Home: pick up where you left off, see what's new, add a book. */
export function HomePage() {
  const pb = usePlaybackSession();
  const { settings } = useSettings();
  const habits = useHabits();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [editing, setEditing] = useState<{ book: Book; isNew: boolean } | null>(null);
  const [quick, setQuick] = useState<Book | null>(null);
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

  const pct = (b: Book) => (progress.get(b.id)?.finished ? 1 : (progress.get(b.id)?.percent ?? 0));
  // Books you've started and not finished, most recently opened first. The one in the player comes first.
  const listening = useMemo(() => {
    const started = (books ?? []).filter((b) => b.lastOpenedAt && !progress.get(b.id)?.finished);
    const playingId = pb.session?.book.id;
    return [...started].sort((a, b) => (b.id === playingId ? 1 : 0) - (a.id === playingId ? 1 : 0) || (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
  }, [books, progress, pb.session?.book.id]);
  const current = listening[0];
  // Newest books not already shown under Continue listening.
  const recent = useMemo(
    () => [...(books ?? [])].filter((b) => !listening.slice(0, 8).includes(b)).sort((a, b) => b.addedAt - a.addedAt).slice(0, 8),
    [books, listening],
  );

  const showInstall = isIOS() && !isNativeApp() && !isStandalone() && !hideInstall;
  const isCurrentPlaying = current && pb.session?.book.id === current.id && pb.state?.status === 'playing';

  const resume = (b: Book) => {
    // Already in the player: play right away (inside the tap, as iOS requires).
    if (pb.session?.book.id === b.id && pb.narrator) {
      pb.narrator.toggle();
      return;
    }
    navigate(`/book/${b.id}?play`);
  };

  return (
    <div className="page tab-page">
      <header className="topbar">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{greeting()}</div>
          <h1>
            My <em>Library</em>
          </h1>
        </div>
        <button className="icon-btn" onClick={importer.openPaste} aria-label="Paste text as a book">
          <Icon name="text" />
        </button>
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings and backup">
          <Icon name="user" />
        </button>
      </header>
      {importer.ui}

      {showInstall && (
        <div className="banner">
          <span className="icon-wrap">
            <Icon name="share" />
          </span>
          <div className="banner-body">
            <strong>Install on your iPhone:</strong> tap <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>. The app then
            opens full-screen, works offline and Safari won’t clear your library.
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
          <p>Add a PDF, EPUB, Word, RTF, web page or text book and listen to it. Nothing is uploaded and there’s no account.</p>
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
          <div className="features">
            <div>
              <Icon name="shield" /> Files stay on this device, stored privately in the app.
            </div>
            <div>
              <Icon name="headphones" /> Natural voices keep playing with the screen locked.
            </div>
            <div>
              <Icon name="bookmark" /> Your place is saved automatically.
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
            <section aria-labelledby="continue-h">
              <h2 className="section-title" id="continue-h">
                Continue listening
              </h2>
              <div className="hero">
                <button className="hero-open" onClick={() => navigate(`/book/${current.id}`)} aria-label={`Continue ${current.title}`}>
                  <Cover book={current} size={0.8} />
                  <div className="hero-body">
                    <div className="hero-eyebrow">{Math.round(pct(current) * 100)}% complete</div>
                    <h3>{current.title}</h3>
                    <div className="muted small">{current.author || current.category}</div>
                    <div className="progress-line" style={{ marginTop: 10 }}>
                      <i style={{ width: `${pct(current) * 100}%` }} />
                    </div>
                    <div className="muted small" style={{ marginTop: 6 }}>
                      {listeningHours(current.charCount * (1 - pct(current)))} left at 1×
                    </div>
                  </div>
                </button>
                <button
                  className="play-btn small play-fab"
                  aria-label={isCurrentPlaying ? `Pause ${current.title}` : `Resume ${current.title}`}
                  onClick={() => resume(current)}
                >
                  <Icon name={isCurrentPlaying ? 'pause' : 'play'} size={24} />
                </button>
              </div>
              {listening.length > 1 && (
                <div className="shelf-row" style={{ marginTop: 12 }}>
                  {listening.slice(1, 8).map((b) => (
                    <BookTile key={b.id} book={b} percent={pct(b)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {settings.habits && habits && <GoalCard habits={habits} goal={settings.dailyGoalMinutes} showStreak={settings.streaks} />}

          <section aria-labelledby="quick-h" className="card quick-card">
            <div className="quick-icon" aria-hidden="true">
              <Icon name="sparkle" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <h2 className="h-small" id="quick-h">
                Quick Listen
              </h2>
              <p className="small muted" style={{ margin: '2px 0 0' }}>
                A short listen: a book’s summary, or the passages you saved.
              </p>
            </div>
            <button className="btn" onClick={() => setQuick(current ?? recent[0] ?? books[0])}>
              Open
            </button>
          </section>

          {recent.length > 0 && (
            <section aria-labelledby="recent-h">
              <h2 className="section-title" id="recent-h">
                Recently added
              </h2>
              <div className="shelf-row">
                {recent.map((b) => (
                  <BookTile key={b.id} book={b} percent={pct(b)} />
                ))}
              </div>
            </section>
          )}

          <importer.AddLabel className="upload-card" label="Add a book">
            <span className="quick-icon" aria-hidden="true">
              <Icon name="plus" size={22} />
            </span>
            <span style={{ flex: 1 }}>
              <strong>Upload a book</strong>
              <span className="small muted" style={{ display: 'block' }}>
                PDF, EPUB, Word, RTF, web page or text
              </span>
            </span>
            <Icon name="chevronRight" size={20} />
          </importer.AddLabel>
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
      {quick && <QuickListenSheet book={quick} books={books ?? []} onClose={() => setQuick(null)} />}
    </div>
  );
}

export function BookTile({ book, percent }: { book: Book; percent: number }) {
  return (
    <button className="tile" onClick={() => navigate(`/book/${book.id}`)} aria-label={`Open ${book.title}`}>
      <Cover book={book} size={0.6} />
      <div className="progress-line">
        <i style={{ width: `${percent * 100}%` }} />
      </div>
      <span className="tile-title">{book.title}</span>
    </button>
  );
}
