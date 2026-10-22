import { useMemo, useState } from 'react';
import { aiAnswerAvailability, indexFor, terms, type SearchHit } from '../../core/search';
import { saveAnnotation } from '../../core/storage/db';
import type { Annotation, Book, Chapter, Position } from '../../core/types';
import { useToast } from '../hooks/toast';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export type AskMode = 'explain' | 'apply' | 'ask';

/** Shows a passage with the matching words in bold. */
function Marked({ text, query }: { text: string; query: string }) {
  const want = new Set(terms(query));
  if (!want.size) return <>{text}</>;
  return (
    <>
      {text.split(/(\b[\w']+\b)/).map((part, i) => (terms(part).some((t) => want.has(t)) ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>))}
    </>
  );
}

/**
 * Ask My Book: understand and use what you're hearing. Without an on-device
 * AI model it never writes answers; it shows the book's own passages, with
 * where they are, plus your notes.
 */
export function AskSheet({
  book,
  chapters,
  position,
  sentence,
  annotations,
  initialMode,
  onClose,
  onGo,
  onSaved,
}: {
  book: Book;
  chapters: Chapter[];
  position: Position;
  /** The sentence being heard. */
  sentence: { start: number; end: number; text: string } | null;
  annotations: Annotation[];
  initialMode: AskMode;
  onClose(): void;
  onGo(pos: Position, play: boolean): void;
  onSaved(): void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<AskMode>(initialMode);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [plan, setPlan] = useState('');
  const index = useMemo(() => indexFor(book.id, chapters), [book.id, chapters]);
  const around = useMemo(() => index.around(position.chapter, sentence?.start ?? position.offset), [index, position, sentence]);
  const focus = sentence?.text ?? around.at?.text ?? '';
  const related = useMemo(
    () => (around.at ? index.search(focus, { k: 3, exclude: { chapter: position.chapter, start: around.at.start, end: around.at.end } }) : []),
    [index, focus, around.at, position.chapter],
  );
  const hits = useMemo(() => (asked ? index.search(asked, { k: 6, chapter: position.chapter }) : []), [index, asked, position.chapter]);
  const chapterNotes = annotations.filter((a) => a.chapter === position.chapter && a.note);
  const actions = annotations.filter((a) => a.tags?.includes('action'));
  const ai = aiAnswerAvailability();
  const chapterTitle = chapters[position.chapter]?.title ?? `Chapter ${position.chapter + 1}`;

  const Hit = ({ h, query }: { h: SearchHit | { chapter: number; start: number; text: string; chapterTitle?: string }; query: string }) => (
    <li className="hit">
      <div className="hit-ref">{h.chapterTitle ?? chapters[h.chapter]?.title}</div>
      <p className="hit-text">
        <Marked text={h.text.length > 420 ? `${h.text.slice(0, 420)}…` : h.text} query={query} />
      </p>
      <div className="row" style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" onClick={() => onGo({ chapter: h.chapter, offset: h.start }, false)}>
          Go there
        </button>
        <button className="btn btn-ghost" onClick={() => onGo({ chapter: h.chapter, offset: h.start }, true)}>
          <Icon name="play" size={14} /> Play from here
        </button>
      </div>
    </li>
  );

  return (
    <Sheet title="Ask My Book" onClose={onClose}>
      <div className="seg-nav" role="tablist" aria-label="Ask My Book">
        {(
          [
            ['explain', 'Explain this'],
            ['apply', 'Apply it'],
            ['ask', 'Search the book'],
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
      <p className="small muted" style={{ marginTop: 0 }}>
        <Icon name="info" size={14} /> {ai.reason}
      </p>

      {mode === 'explain' && (
        <>
          <h4 className="ask-h">What you’re hearing · {chapterTitle}</h4>
          <div className="ask-passage">
            {around.before && <p className="ctx">{around.before.text.slice(-300)}</p>}
            <p className="focus">{focus}</p>
            {around.after && <p className="ctx">{around.after.text.slice(0, 300)}</p>}
          </div>
          <h4 className="ask-h">Where the book says more about this</h4>
          {related.length ? (
            <ul className="hits">
              {related.map((h) => (
                <Hit key={`${h.chapter}:${h.start}`} h={h} query={focus} />
              ))}
            </ul>
          ) : (
            <p className="small muted">No other passages in this book use the same key words.</p>
          )}
          {chapterNotes.length > 0 && (
            <>
              <h4 className="ask-h">Your notes in this chapter</h4>
              <ul className="hits">
                {chapterNotes.map((a) => (
                  <li key={a.id} className="hit">
                    <p className="hit-text" style={{ fontStyle: 'italic' }}>
                      {a.quote.slice(0, 200)}
                    </p>
                    <p className="small">{a.note}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {mode === 'apply' && (
        <>
          <h4 className="ask-h">The idea · {chapterTitle}</h4>
          <div className="ask-passage">
            <p className="focus">{focus}</p>
          </div>
          <label className="field">
            <span>How will you use this? One concrete action.</span>
            <textarea className="input" rows={3} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="This week I will…" />
          </label>
          <button
            className="btn btn-primary"
            disabled={!plan.trim() || !focus}
            onClick={async () => {
              const s = sentence ?? (around.at ? { start: around.at.start, end: around.at.end, text: around.at.text } : null);
              if (!s) return;
              await saveAnnotation({ bookId: book.id, kind: 'note', chapter: position.chapter, start: s.start, end: s.end, quote: s.text, note: plan.trim(), color: 'mint', tags: ['action'] });
              setPlan('');
              toast('Action saved to your quotes');
              onSaved();
            }}
          >
            Save action
          </button>
          {actions.length > 0 && (
            <>
              <h4 className="ask-h">Your actions from this book</h4>
              <ul className="hits">
                {actions.map((a) => (
                  <li key={a.id} className="hit">
                    <p className="small" style={{ margin: 0 }}>
                      <strong>{a.note}</strong>
                    </p>
                    <p className="hit-ref" style={{ marginTop: 4 }}>
                      {chapters[a.chapter]?.title}: “{a.quote.slice(0, 120)}{a.quote.length > 120 ? '…' : ''}”
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {mode === 'ask' && (
        <>
          <form
            className="row"
            style={{ display: 'flex', gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              setAsked(question.trim());
            }}
          >
            <input className="input" style={{ flex: 1 }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What does the author say about habits?" aria-label="Your question" />
            <button className="btn btn-primary" type="submit" disabled={!question.trim()}>
              Search
            </button>
          </form>
          {asked &&
            (hits.length ? (
              <>
                <h4 className="ask-h">Passages that match “{asked}”</h4>
                <ul className="hits">
                  {hits.map((h) => (
                    <Hit key={`${h.chapter}:${h.start}`} h={h} query={asked} />
                  ))}
                </ul>
              </>
            ) : (
              <p className="small muted">This book doesn’t seem to cover that: no passages use those words.</p>
            ))}
        </>
      )}
    </Sheet>
  );
}
