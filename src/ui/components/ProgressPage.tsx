import { useEffect, useState } from 'react';
import { listBlocks, listReviews, listStates } from '../../growth/store';
import { listAllAnnotations, listBooks, listProgress } from '../../core/storage/db';
import { listeningHours } from './BookDetailsSheet';

interface Stats {
  books: number;
  started: number;
  finished: number;
  hoursLeft: number;
  highlights: number;
  notes: number;
  bookmarks: number;
  growthFinished: number;
  growthReading: number;
  blocks: number;
  reviews: number;
}

/** Progress: real numbers from your library, nothing estimated or invented. */
export function ProgressPage() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    (async () => {
      const [books, progress, annotations, states, blocks, reviews] = await Promise.all([
        listBooks(),
        listProgress(),
        listAllAnnotations(),
        listStates(),
        listBlocks(),
        listReviews(),
      ]);
      const p = new Map(progress.map((x) => [x.bookId, x]));
      const started = books.filter((b) => (p.get(b.id)?.percent ?? 0) > 0 && !p.get(b.id)?.finished);
      setS({
        books: books.length,
        started: started.length,
        finished: books.filter((b) => p.get(b.id)?.finished).length,
        hoursLeft: started.reduce((sum, b) => sum + b.charCount * (1 - (p.get(b.id)?.percent ?? 0)), 0),
        highlights: annotations.filter((a) => a.kind === 'highlight').length,
        notes: annotations.filter((a) => a.kind === 'note').length,
        bookmarks: annotations.filter((a) => a.kind === 'bookmark').length,
        growthFinished: [...states.values()].filter((x) => x.status === 'finished').length,
        growthReading: [...states.values()].filter((x) => x.status === 'reading' || x.status === 'rereading').length,
        blocks: blocks.filter((b) => b.completedAt).length,
        reviews: reviews.length,
      });
    })();
  }, []);

  return (
    <div className="page tab-page">
      <header className="topbar">
        <h1>Progress</h1>
      </header>
      {!s ? (
        <div className="spinner" style={{ margin: '40px auto' }} />
      ) : (
        <>
          <section aria-labelledby="lib-h">
            <h2 className="section-title" id="lib-h">
              Your library
            </h2>
            <div className="stat-grid">
              <Stat value={s.finished} label="Completed" />
              <Stat value={s.started} label="In progress" />
              <Stat value={s.books} label="Books" />
            </div>
            {s.started > 0 && <p className="small muted">About {listeningHours(s.hoursLeft)} left in the books you’re listening to, at 1×.</p>}
          </section>
          <section aria-labelledby="saved-h">
            <h2 className="section-title" id="saved-h">
              Saved while listening
            </h2>
            <div className="stat-grid">
              <Stat value={s.highlights} label="Highlights" />
              <Stat value={s.notes} label="Notes" />
              <Stat value={s.bookmarks} label="Bookmarks" />
            </div>
          </section>
          <section aria-labelledby="growth-h">
            <h2 className="section-title" id="growth-h">
              Growth Library
            </h2>
            <div className="stat-grid">
              <Stat value={s.growthFinished} label="Books finished" />
              <Stat value={s.blocks} label="Daily blocks done" />
              <Stat value={s.reviews} label="Weekly reviews" />
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <a className="btn" href="#/growth/today">
                Today’s 30 minutes
              </a>
              <a className="btn" href="#/growth/review">
                Weekly review
              </a>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
