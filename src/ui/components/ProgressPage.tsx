import { useEffect, useState } from 'react';
import { listBlocks, listReviews, listStates } from '../../growth/store';
import { XP_RULES } from '../../core/habits';
import { listAllAnnotations, listBooks, listProgress } from '../../core/storage/db';
import { useHabits } from '../hooks/useHabits';
import { useSettings } from '../hooks/settings';
import { listeningHours } from './BookDetailsSheet';
import { Ring, goalText } from './Goal';
import { Icon } from './Icon';

interface Stats {
  books: number;
  started: number;
  finished: number;
  charsLeft: number;
  highlights: number;
  notes: number;
  bookmarks: number;
  growthFinished: number;
  blocks: number;
  reviews: number;
}

const GOALS = [5, 10, 15, 20, 30];
const dayLetter = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });

/** Progress: real numbers only — listening time is measured from actual playback. */
export function ProgressPage() {
  const { settings, update } = useSettings();
  const habits = useHabits();
  const [s, setS] = useState<Stats | null>(null);
  const [custom, setCustom] = useState('');
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
        charsLeft: started.reduce((sum, b) => sum + b.charCount * (1 - (p.get(b.id)?.percent ?? 0)), 0),
        highlights: annotations.filter((a) => a.kind === 'highlight').length,
        notes: annotations.filter((a) => a.kind === 'note').length,
        bookmarks: annotations.filter((a) => a.kind === 'bookmark').length,
        growthFinished: [...states.values()].filter((x) => x.status === 'finished').length,
        blocks: blocks.filter((b) => b.completedAt).length,
        reviews: reviews.length,
      });
    })();
  }, []);
  const goal = settings.dailyGoalMinutes;
  const maxWeek = Math.max(goal, ...(habits?.week.map((d) => d.minutes) ?? [0]));

  return (
    <div className="page tab-page">
      <header className="topbar">
        <h1>Progress</h1>
      </header>
      {!s || !habits ? (
        <div className="spinner" style={{ margin: '40px auto' }} />
      ) : (
        <>
          {settings.habits && (
            <>
              <section aria-labelledby="today-h">
                <h2 className="section-title" id="today-h">
                  Today
                </h2>
                <div className="card goal-card" style={{ marginBottom: 10 }}>
                  <Ring fraction={habits.todayMinutes / goal} size={72} label={`${Math.min(100, Math.round((habits.todayMinutes / goal) * 100))}% of today’s goal`} />
                  <div style={{ flex: 1 }}>
                    <strong>{goalText(habits, goal)}</strong>
                    <div className="small muted">Counts only time audio is actually playing.</div>
                  </div>
                </div>
                <div className="chips" role="radiogroup" aria-label="Daily goal">
                  {GOALS.map((m) => (
                    <button key={m} role="radio" aria-checked={goal === m} className={`chip ${goal === m ? 'active' : ''}`} onClick={() => update({ dailyGoalMinutes: m })}>
                      {m} min
                    </button>
                  ))}
                  <form
                    className="custom-goal"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = Math.round(Number(custom));
                      if (n >= 1 && n <= 600) update({ dailyGoalMinutes: n });
                      setCustom('');
                    }}
                  >
                    <input className="input" inputMode="numeric" placeholder={GOALS.includes(goal) ? 'Custom' : `${goal} min`} aria-label="Custom goal in minutes" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} />
                  </form>
                </div>
              </section>

              <section aria-labelledby="week-h">
                <h2 className="section-title" id="week-h">
                  This week
                </h2>
                <div className="week-bars" role="img" aria-label={habits.week.map((d) => `${d.date}: ${d.minutes} minutes`).join(', ')}>
                  {habits.week.map((d) => (
                    <div key={d.date} className={`week-bar ${d.minutes >= goal ? 'met' : ''} ${d.date === habits.today ? 'today' : ''}`}>
                      <i style={{ height: `${Math.max(3, (d.minutes / maxWeek) * 100)}%` }} />
                      <span>{dayLetter(d.date)}</span>
                    </div>
                  ))}
                </div>
                <div className="stat-grid" style={{ marginTop: 12 }}>
                  <Stat value={habits.week.filter((d) => d.minutes >= 1).length} label="Days listened this week" />
                  <Stat value={habits.monthMinutes} label="Minutes this month" />
                  {settings.streaks ? <Stat value={habits.streak} label="Day streak" /> : <Stat value={habits.totalMinutes} label="Minutes in total" />}
                </div>
                {settings.streaks && <p className="small muted">The streak allows one rest day a week, so a missed day doesn’t wipe it out.</p>}
              </section>

              <section aria-labelledby="level-h">
                <h2 className="section-title" id="level-h">
                  Level
                </h2>
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong>
                      Level {habits.level.level} · {habits.level.name}
                    </strong>
                    <span className="small muted">{habits.xp} XP</span>
                  </div>
                  <div className="bar" style={{ marginTop: 8 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(habits.level.progress * 100)} aria-label="Progress to next level">
                    <i style={{ width: `${habits.level.progress * 100}%` }} />
                  </div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    {habits.level.next - habits.xp} XP to Level {habits.level.level + 1}
                  </div>
                  <details style={{ marginTop: 10 }}>
                    <summary className="small">How XP is earned</summary>
                    <p className="small muted" style={{ margin: '8px 0' }}>
                      {XP_RULES.perListeningMinute} XP per minute of real listening · {XP_RULES.quiz} XP for a completed Growth Library quiz (once each) · {XP_RULES.bookCompleted} XP for
                      finishing a book (once each) · {XP_RULES.review} XP for reviewing your quotes (once a day).
                    </p>
                    <ul className="ledger">
                      {habits.ledger.slice(0, 12).map((e) => (
                        <li key={e.id}>
                          <span>{e.label}</span>
                          <span>+{e.amount}</span>
                        </li>
                      ))}
                      {habits.ledger.length === 0 && <li className="muted">No XP yet. Press play on a book to start.</li>}
                    </ul>
                  </details>
                </div>
              </section>

              <section aria-labelledby="ach-h">
                <h2 className="section-title" id="ach-h">
                  Achievements
                </h2>
                <ul className="achievements">
                  {habits.achievements.map((a) => (
                    <li key={a.id} className={a.earned ? 'earned' : ''}>
                      <span className="ach-icon" aria-hidden="true">
                        <Icon name={a.earned ? 'check' : 'star'} size={18} />
                      </span>
                      <span style={{ flex: 1 }}>
                        <strong>{a.name}</strong>
                        {a.isNew && <span className="tag">New</span>}
                        <span className="small muted" style={{ display: 'block' }}>
                          {a.earned && a.earnedAt ? `Earned ${new Date(a.earnedAt).toLocaleDateString()}` : `${a.description} ${a.progress}.`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          <a className="upload-card" href="#/quotes" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="quick-icon" aria-hidden="true">
              <Icon name="highlight" size={22} />
            </span>
            <span style={{ flex: 1 }}>
              <strong>Quote collection</strong>
              <span className="small muted" style={{ display: 'block' }}>
                {s.highlights + s.notes} saved passage{s.highlights + s.notes === 1 ? '' : 's'} and lessons
              </span>
            </span>
            <Icon name="chevronRight" size={20} />
          </a>

          <section aria-labelledby="lib-h">
            <h2 className="section-title" id="lib-h">
              Your library
            </h2>
            <div className="stat-grid">
              <Stat value={s.finished} label="Completed" />
              <Stat value={s.started} label="In progress" />
              <Stat value={s.books} label="Books" />
            </div>
            {s.started > 0 && <p className="small muted">About {listeningHours(s.charsLeft)} left in the books you’re listening to, at 1×.</p>}
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
            <div className="row" style={{ gap: 8, marginTop: 12, display: 'flex', flexWrap: 'wrap' }}>
              <a className="btn" href="#/growth/today">
                Today’s 30 minutes
              </a>
              <a className="btn" href="#/growth/review">
                Weekly review
              </a>
            </div>
          </section>

          <section aria-labelledby="opts-h">
            <h2 className="section-title" id="opts-h">
              Options
            </h2>
            <label className="switch">
              <span>
                Goals, XP and achievements
                <small>Turn off for a plain audiobook player. Your listening time is still kept.</small>
              </span>
              <input type="checkbox" checked={settings.habits} onChange={(e) => update({ habits: e.target.checked })} />
            </label>
            <label className="switch" style={{ borderBottom: 0 }}>
              <span>
                Show streak
                <small>Days in a row with listening, with one rest day a week.</small>
              </span>
              <input type="checkbox" checked={settings.streaks} onChange={(e) => update({ streaks: e.target.checked })} />
            </label>
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
