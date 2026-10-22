import { useEffect, useMemo, useState } from 'react';
import { CATALOG } from '../../growth/catalog';
import { listStates } from '../../growth/store';
import { getContent, listAnnotations, listBooks, listProgress, saveAnnotation } from '../../core/storage/db';
import { chunkAt, chunkText } from '../../core/speech/chunker';
import type { Annotation, Book, Chapter, Progress } from '../../core/types';
import { useToast } from '../hooks/toast';
import { goBack, navigate } from '../hooks/useRoute';
import { Icon } from './Icon';

type ClubMode = 'discuss' | 'reflect' | 'test' | 'debate';

/** Discussion and reflection questions, filled in with the chapter you're on. Written for the app, not generated. */
export function clubQuestions(mode: 'discuss' | 'reflect', chapterTitle: string): string[] {
  return mode === 'discuss'
    ? [
        `In one sentence, what is “${chapterTitle}” about?`,
        'Which passage stood out most, and why?',
        'What evidence or example does the author use? Does it convince you?',
        'What question would you ask the author about this chapter?',
      ]
    : [
        'Where does this idea show up in your work this week?',
        'What will you do differently at home because of this chapter?',
        'What’s one small step you can take in the next 24 hours?',
        'What might stop you, and how will you handle it?',
      ];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Book Club: a private discussion about the chapter you're on. You answer in
 * writing; answers are saved with the book. Debate needs an AI model, so it's
 * shown as unavailable instead of faked.
 */
export function ClubPage() {
  const toast = useToast();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [bookId, setBookId] = useState<string>('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [mode, setMode] = useState<ClubMode>('discuss');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [past, setPast] = useState<Annotation[]>([]);
  const [linked, setLinked] = useState<Map<string, string>>(new Map());
  const [quiz, setQuiz] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const [b, p, states] = await Promise.all([listBooks(), listProgress(), listStates()]);
      const pm = new Map(p.map((x) => [x.bookId, x]));
      const sorted = [...b].sort((x, y) => (y.lastOpenedAt ?? 0) - (x.lastOpenedAt ?? 0));
      setBooks(sorted);
      setProgress(pm);
      setLinked(new Map([...states.values()].filter((s) => s.linkedBookId).map((s) => [s.linkedBookId!, s.bookId])));
      setBookId((id) => id || sorted[0]?.id || '');
    })();
  }, []);

  const book = books?.find((b) => b.id === bookId);
  const pos = progress.get(bookId);
  const chapter = pos && !pos.finished ? pos.chapter : 0;
  const chapterTitle = chapters[chapter]?.title ?? `Chapter ${chapter + 1}`;
  const entry = useMemo(() => (book ? (CATALOG.find((c) => c.id === linked.get(book.id)) ?? CATALOG.find((c) => norm(c.title) === norm(book.title))) : undefined), [book, linked]);

  useEffect(() => {
    if (!bookId) return;
    setAnswers({});
    setQuiz({});
    setChecked(false);
    void getContent(bookId).then((c) => setChapters(c?.chapters ?? []));
    void listAnnotations(bookId).then((a) => setPast(a.filter((x) => x.tags?.includes('book club')).sort((x, y) => y.createdAt - x.createdAt)));
  }, [bookId]);

  const questions = mode === 'discuss' || mode === 'reflect' ? clubQuestions(mode, chapterTitle) : [];

  const save = async () => {
    if (!book) return;
    const text = chapters[chapter]?.text ?? '';
    const chunks = chunkText(text);
    // Anchor the answers at your place in the chapter, so they open right there.
    const c = chunks[chunkAt(chunks, pos?.offset ?? 0)] ?? { start: 0, end: Math.min(text.length, 200), text: text.slice(0, 200) };
    const note = questions
      .map((q, i) => (answers[i]?.trim() ? `${q}\n${answers[i].trim()}` : ''))
      .filter(Boolean)
      .join('\n\n');
    if (!note) return;
    await saveAnnotation({ bookId: book.id, kind: 'note', chapter, start: c.start, end: c.end, quote: c.text, note, color: 'sky', tags: ['book club', mode === 'discuss' ? 'discussion' : 'reflection'] });
    setAnswers({});
    toast('Saved to your quotes');
    setPast(await listAnnotations(book.id).then((a) => a.filter((x) => x.tags?.includes('book club')).sort((x, y) => y.createdAt - x.createdAt)));
  };

  return (
    <div className="page tab-page">
      <header className="topbar">
        <button className="icon-btn" onClick={goBack} aria-label="Back">
          <Icon name="chevronLeft" />
        </button>
        <h1 style={{ flex: 1 }}>Book Club</h1>
      </header>
      {books === null ? (
        <div className="spinner" style={{ margin: '40px auto' }} />
      ) : !books.length ? (
        <div className="empty">
          <h2>No books yet</h2>
          <p>Add a book and start listening; the club talks about the chapter you’re on.</p>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Book</span>
            <select className="input" value={bookId} onChange={(e) => setBookId(e.target.value)}>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <p className="small muted" style={{ marginTop: -4 }}>
            Talking about: <strong>{chapterTitle}</strong> (where you are in the book).{' '}
            <button className="btn btn-ghost" style={{ minHeight: 28, padding: '0 6px' }} onClick={() => navigate(`/book/${bookId}`)}>
              Open book
            </button>
          </p>

          <div className="seg-nav" role="tablist" aria-label="Club mode">
            {(
              [
                ['discuss', 'Discuss'],
                ['reflect', 'Reflect'],
                ['test', 'Test me'],
                ['debate', 'Debate'],
              ] as const
            ).map(([m, label]) => (
              <a
                key={m}
                href="#"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? 'active' : ''}
                onClick={(e) => {
                  e.preventDefault();
                  setMode(m);
                }}
              >
                {label}
              </a>
            ))}
          </div>

          {(mode === 'discuss' || mode === 'reflect') && (
            <>
              <p className="small muted">Answer in your own words; your answers are saved with the book. These questions are written for the app, not generated by AI.</p>
              {questions.map((q, i) => (
                <label key={q} className="field question">
                  <span>{q}</span>
                  <textarea className="input" rows={2} value={answers[i] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} />
                </label>
              ))}
              <button className="btn btn-primary" onClick={save} disabled={!Object.values(answers).some((a) => a.trim())}>
                Save answers
              </button>
            </>
          )}

          {mode === 'test' &&
            (entry ? (
              <>
                <p className="small muted">Questions from the Growth Library entry for {entry.title}.</p>
                {entry.quiz.map((item, qi) => (
                  <div key={qi} className="quiz-q">
                    <p>
                      <strong>{item.q}</strong>
                    </p>
                    {item.options.map((o, oi) => {
                      const cls = checked ? (oi === item.answer ? 'right' : quiz[qi] === oi ? 'wrong' : '') : quiz[qi] === oi ? 'picked' : '';
                      return (
                        <button key={oi} className={`quiz-opt ${cls}`} disabled={checked} onClick={() => setQuiz((a) => ({ ...a, [qi]: oi }))}>
                          {o}
                        </button>
                      );
                    })}
                    {checked && <p className="small muted">{item.why}</p>}
                  </div>
                ))}
                {!checked ? (
                  <button className="btn btn-primary" disabled={Object.keys(quiz).length < entry.quiz.length} onClick={() => setChecked(true)}>
                    Check answers
                  </button>
                ) : (
                  <p>
                    <strong>
                      You got {entry.quiz.filter((q, i) => quiz[i] === q.answer).length} of {entry.quiz.length}.
                    </strong>
                  </p>
                )}
              </>
            ) : (
              <div className="card">
                <strong>No questions for this book yet</strong>
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Test questions exist for the 21 Growth Library books. For other books they’d have to be written by an AI model from the text, and there isn’t one on this device, so none are made up. Try Discuss instead.
                </p>
              </div>
            ))}

          {mode === 'debate' && (
            <div className="card">
              <strong>Debate needs an AI model</strong>
              <p className="small muted" style={{ marginBottom: 0 }}>
                Arguing the other side fairly needs a language model that has read the chapter. My Library doesn’t have one on this device yet, so this stays off rather than inventing the author’s position.
              </p>
            </div>
          )}

          {past.length > 0 && (
            <section aria-labelledby="past-h">
              <h2 className="section-title" id="past-h">
                Your past answers
              </h2>
              {past.slice(0, 5).map((a) => (
                <div key={a.id} className="quote-card">
                  <div className="quote-ref">
                    {chapters[a.chapter]?.title} · {new Date(a.createdAt).toLocaleDateString()}
                  </div>
                  <p className="small" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                    {a.note}
                  </p>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
