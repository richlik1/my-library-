import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Chunk } from '../../core/speech/chunker';
import type { VoiceInfo } from '../../core/speech/engine';
import { isIOS } from '../../core/speech/webSpeechEngine';
import { deleteAnnotation, getBook, getContent, getProgress, listAnnotations, saveAnnotation } from '../../core/storage/db';
import type { Annotation, Book, Chapter, HighlightColor, Position } from '../../core/types';
import { isSequenceEngine } from '../../core/speech/engine';
import { speechEngine } from '../engine';
import { isNativeApp } from '../platform';
import { useSettings } from '../hooks/settings';
import { useToast } from '../hooks/toast';
import { usePlayback } from '../hooks/usePlayback';
import { goBack, navigate } from '../hooks/useRoute';
import { pickDefaultVoice, useVoices } from '../hooks/useVoices';
import { BookDetailsSheet } from './BookDetailsSheet';
import { NarrationPanel, useAudioJobs } from './NarrationPanel';
import { Icon } from './Icon';
import { AnnotationsSheet, COLORS, ChaptersSheet, NoteSheet, SleepSheet, VoiceSheet, swatch } from './PlayerSheets';
import { Reader, type TextRange } from './Reader';

interface Loaded {
  book: Book;
  chapters: Chapter[];
  start: Position;
  annotations: Annotation[];
}

export function Player({ id, autoplay }: { id: string; autoplay: boolean }) {
  const [data, setData] = useState<Loaded | null | 'missing'>(null);
  const { loaded } = useSettings();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [book, content, progress, annotations] = await Promise.all([getBook(id), getContent(id), getProgress(id), listAnnotations(id)]);
      if (!alive) return;
      if (!book || !content) return setData('missing');
      let start = progress && !progress.finished ? { chapter: progress.chapter, offset: progress.offset } : { chapter: 0, offset: 0 };
      // The iOS app also saves the position natively, which survives the app
      // being closed while narrating in the background. Use whichever is newer.
      if (isSequenceEngine(speechEngine)) {
        const native = await speechEngine.getSavedPosition(id);
        if (native && native.updatedAt > (progress?.updatedAt ?? 0) && native.chapter < content.chapters.length)
          start = { chapter: native.chapter, offset: native.offset };
      }
      if (!alive) return;
      setData({ book, chapters: content.chapters, start, annotations });
    })().catch(() => alive && setData('missing'));
    return () => {
      alive = false;
    };
  }, [id]);

  if (data === 'missing')
    return (
      <div className="page">
        <div className="empty">
          <h2>Book not found</h2>
          <p>It may have been deleted.</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to library
          </button>
        </div>
      </div>
    );
  if (!data || !loaded)
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center', height: '100dvh' }}>
        <div className="spinner" />
      </div>
    );
  return <PlayerView key={data.book.id} data={data} autoplay={autoplay} />;
}

type Popover = { kind: 'chunk'; chunk: Chunk; rect: DOMRect } | { kind: 'selection'; range: TextRange; rect: DOMRect } | null;
type SheetName = 'chapters' | 'notes' | 'voice' | 'sleep' | 'details' | null;

function fmt(sec: number) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function PlayerView({ data, autoplay }: { data: Loaded; autoplay: boolean }) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const voices = useVoices(speechEngine);
  const [book, setBook] = useState(data.book);
  const { chapters } = data;
  const voiceId = useMemo(() => {
    if (settings.voiceURI && voices.some((v) => v.id === settings.voiceURI)) return settings.voiceURI;
    return pickDefaultVoice(voices)?.id ?? null;
  }, [settings.voiceURI, voices]);
  const mode = book.narration?.engine ?? 'device';
  const { narrator, state } = usePlayback(book, chapters, data.start, voiceId, mode);
  const jobs = useAudioJobs(book.id);
  const [annotations, setAnnotations] = useState<Annotation[]>(data.annotations);
  const [popover, setPopover] = useState<Popover>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [noteDraft, setNoteDraft] = useState<{ range: TextRange; chapter: number; existing?: Annotation } | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  const [lockTip, setLockTip] = useState(() => {
    try {
      return isIOS() && !isNativeApp() && localStorage.getItem('ml-lock-tip-2') !== '1';
    } catch {
      return isIOS() && !isNativeApp();
    }
  });

  // Autoplay from the "resume" button on the library screen.
  useEffect(() => {
    if (narrator && autoplay) {
      narrator.play();
      history.replaceState(null, '', `#/book/${book.id}`);
    }
  }, [narrator, autoplay, book.id]);

  // Keyboard shortcuts on computers.
  useEffect(() => {
    if (!narrator) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select') || sheet) return;
      if (e.key === ' ') {
        e.preventDefault();
        narrator.toggle();
      } else if (e.key === 'ArrowRight') narrator.skip(e.shiftKey ? 10 : 1);
      else if (e.key === 'ArrowLeft') narrator.skip(e.shiftKey ? -10 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [narrator, sheet]);

  const refreshAnnotations = useCallback(async () => setAnnotations(await listAnnotations(book.id)), [book.id]);

  if (!narrator || !state) return null;

  const chapter = chapters[state.chapter];
  const audioMode = narrator.kind === 'audio';
  const chapterJob = jobs.find((j) => j.chapter === state.chapter);
  const chunks = state.chunks;
  const playing = state.status === 'playing';
  const cps = 15 * settings.rate; // rough characters per second
  const chapterLen = chapter?.text.length ?? 0;
  const elapsed = state.offset / cps;
  const total = chapterLen / cps;
  const currentChunk = chunks[state.chunkIndex];
  const bookmarkHere = annotations.find(
    (a) => a.kind === 'bookmark' && a.chapter === state.chapter && currentChunk && a.start >= currentChunk.start && a.start < currentChunk.end,
  );
  const notice = state.notice && state.notice !== dismissedNotice ? state.notice : null;

  const addHighlight = async (range: TextRange, color: HighlightColor) => {
    await saveAnnotation({ bookId: book.id, kind: 'highlight', chapter: state.chapter, start: range.start, end: range.end, quote: range.quote, color });
    window.getSelection()?.removeAllRanges();
    setPopover(null);
    refreshAnnotations();
  };

  const toggleBookmark = async (chunk: Chunk | undefined = currentChunk) => {
    if (!chunk) return;
    const existing = annotations.find((a) => a.kind === 'bookmark' && a.chapter === state.chapter && a.start >= chunk.start && a.start < chunk.end);
    if (existing) {
      await deleteAnnotation(existing.id);
      toast('Bookmark removed');
    } else {
      await saveAnnotation({ bookId: book.id, kind: 'bookmark', chapter: state.chapter, start: chunk.start, end: chunk.end, quote: chunk.text });
      toast('Bookmarked');
    }
    setPopover(null);
    refreshAnnotations();
  };

  const preview = (v: VoiceInfo) => {
    narrator.pause();
    speechEngine.speak(
      `Hello. This is ${v.name.replace(/\s*\(.*\)/, '')}, reading ${book.title}.`,
      { voiceId: v.id, rate: settings.rate, pitch: settings.pitch },
      { onStart() {}, onBoundary() {}, onEnd() {}, onError() {} },
    );
  };

  const popStyle = (rect: DOMRect): CSSProperties => {
    const below = rect.top < 140;
    return {
      left: Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150),
      top: below ? Math.min(rect.bottom + 10, window.innerHeight - 260) : Math.max(rect.top - 70, 10),
    };
  };

  return (
    <div className="player">
      <header className="player-top">
        <button className="icon-btn" onClick={goBack} aria-label="Back to library">
          <Icon name="chevronLeft" />
        </button>
        <button className="player-title" onClick={() => setSheet('chapters')}>
          <div className="bt">{book.title}</div>
          <div className="ct">
            {chapter?.title} · {state.chapter + 1}/{chapters.length}
          </div>
        </button>
        <button className="icon-btn" onClick={() => setSheet('details')} aria-label="Book details">
          <Icon name="more" />
        </button>
      </header>

      {chapter && (
        <Reader
          chapter={chapter}
          chapterIndex={state.chapter}
          chunks={chunks}
          activeChunk={state.chunkIndex}
          wordOffset={playing ? state.offset : -1}
          annotations={annotations}
          fontSize={settings.fontSize}
          follow={settings.followAlong}
          isLast={state.chapter === chapters.length - 1}
          onChunkTap={(chunk, rect) => setPopover({ kind: 'chunk', chunk, rect })}
          onSelect={(range, rect) => setPopover({ kind: 'selection', range, rect })}
          onNoteOpen={(a) => setNoteDraft({ range: { start: a.start, end: a.end, quote: a.quote }, chapter: a.chapter, existing: a })}
          onNextChapter={() => narrator.nextChapter()}
        />
      )}

      {popover && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 45 }} onClick={() => setPopover(null)} />
          <div className="popover" style={popStyle(popover.rect)} role="menu">
            {popover.kind === 'chunk' ? (
              <>
                <button
                  onClick={() => {
                    narrator.seek({ chapter: state.chapter, offset: popover.chunk.start }, true);
                    setPopover(null);
                  }}
                >
                  <Icon name="play" size={18} /> Play here
                </button>
                <button onClick={() => addHighlight({ start: popover.chunk.start, end: popover.chunk.end, quote: popover.chunk.text }, 'gold')}>
                  <Icon name="highlight" size={18} /> Highlight
                </button>
                <button
                  onClick={() => {
                    setNoteDraft({ range: { start: popover.chunk.start, end: popover.chunk.end, quote: popover.chunk.text }, chapter: state.chapter });
                    setPopover(null);
                  }}
                >
                  <Icon name="note" size={18} /> Note
                </button>
                <button onClick={() => toggleBookmark(popover.chunk)}>
                  <Icon name="bookmark" size={18} /> Bookmark
                </button>
              </>
            ) : (
              <>
                {COLORS.map((c) => (
                  <button key={c} onClick={() => addHighlight(popover.range, c)} aria-label={`Highlight ${c}`} style={{ minWidth: 44 }}>
                    <span className="swatch" style={{ background: swatch(c) }} />
                  </button>
                ))}
                <button
                  onClick={() => {
                    setNoteDraft({ range: popover.range, chapter: state.chapter });
                    setPopover(null);
                  }}
                >
                  <Icon name="note" size={18} /> Note
                </button>
                <button
                  onClick={() => {
                    narrator.seek({ chapter: state.chapter, offset: popover.range.start }, true);
                    window.getSelection()?.removeAllRanges();
                    setPopover(null);
                  }}
                >
                  <Icon name="play" size={18} /> Play
                </button>
              </>
            )}
          </div>
        </>
      )}

      <footer className="dock">
        {notice && (
          <div className="notice" role="alert">
            <Icon name="info" size={20} />
            <span>{notice}</span>
            <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setDismissedNotice(notice)} aria-label="Dismiss">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {!notice && lockTip && mode === 'device' && (
          <div className="notice">
            <Icon name="info" size={20} />
            <span>
              Device voices stop when the iPhone locks. To listen with the screen locked, choose <strong>Natural voice</strong> in Voice &amp;
              speed.
            </span>
            <button
              className="icon-btn"
              style={{ width: 32, height: 32 }}
              aria-label="Got it"
              onClick={() => {
                try {
                  localStorage.setItem('ml-lock-tip-2', '1');
                } catch {
                  /* ignore */
                }
                setLockTip(false);
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="dock-inner">
          {audioMode && state.waitingForAudio && (
            <div className="small" style={{ textAlign: 'center', color: 'var(--text-2)', margin: '2px 0 6px' }} role="status">
              {chapterJob?.status === 'failed'
                ? `Couldn’t generate this chapter. ${chapterJob.error ?? ''}`
                : chapterJob?.label ??
                  (chapterJob ? `Preparing this chapter’s audio… ${Math.round(chapterJob.progress * 100)}%` : 'This chapter’s audio isn’t generated yet. Press play to start.')}
            </div>
          )}
          <div className="scrub">
            {audioMode ? (
              <>
                <span>{fmt(state.time ?? 0)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.floor(state.duration ?? 0))}
                  value={Math.floor(state.time ?? 0)}
                  disabled={!state.duration}
                  style={{ '--fill': `${state.duration ? ((state.time ?? 0) / state.duration) * 100 : 0}%` } as CSSProperties}
                  onChange={(e) => narrator.skipSeconds?.(Number(e.target.value) - (state.time ?? 0))}
                  aria-label="Position in chapter"
                />
                <span>-{fmt(((state.duration ?? 0) - (state.time ?? 0)) / settings.rate)}</span>
              </>
            ) : (
              <>
                <span>{fmt(elapsed)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, chunks.length - 1)}
                  value={state.chunkIndex}
                  style={{ '--fill': `${chunks.length > 1 ? (state.chunkIndex / (chunks.length - 1)) * 100 : 0}%` } as CSSProperties}
                  onChange={(e) => {
                    const c = chunks[Number(e.target.value)];
                    if (c) narrator.seek({ chapter: state.chapter, offset: c.start });
                  }}
                  aria-label="Position in chapter"
                />
                <span>-{fmt(total - elapsed)}</span>
              </>
            )}
          </div>
          <div className="controls">
            <button className="icon-btn" onClick={() => narrator.prevChapter()} aria-label="Previous chapter">
              <Icon name="prevChapter" size={24} />
            </button>
            {audioMode ? (
              <button className="icon-btn skip-label" onClick={() => narrator.skipSeconds?.(-15)} aria-label="Back 15 seconds">
                <Icon name="back" size={26} />
                <small>15</small>
              </button>
            ) : (
              <button className="icon-btn" onClick={() => narrator.skip(-1)} aria-label="Back one sentence">
                <Icon name="back" size={26} />
              </button>
            )}
            <button className="play-btn" onClick={() => narrator.toggle()} aria-label={playing ? 'Pause' : 'Play'} data-testid="play">
              <Icon name={playing ? 'pause' : 'play'} size={30} />
            </button>
            {audioMode ? (
              <button className="icon-btn skip-label" onClick={() => narrator.skipSeconds?.(30)} aria-label="Forward 30 seconds">
                <Icon name="forward" size={26} />
                <small>30</small>
              </button>
            ) : (
              <button className="icon-btn" onClick={() => narrator.skip(1)} aria-label="Forward one sentence">
                <Icon name="forward" size={26} />
              </button>
            )}
            <button className="icon-btn" onClick={() => narrator.nextChapter()} aria-label="Next chapter" disabled={state.chapter >= chapters.length - 1}>
              <Icon name="nextChapter" size={24} />
            </button>
          </div>
          <div className="dock-tools">
            <button className="tool" onClick={() => setSheet('voice')}>
              <Icon name="speed" size={20} />
              <span className="val">{settings.rate.toFixed(2).replace(/\.?0+$/, '')}× · Voice</span>
            </button>
            <button className="tool" onClick={() => setSheet('chapters')}>
              <Icon name="list" size={20} />
              Chapters
            </button>
            <button className={`tool ${bookmarkHere ? 'active' : ''}`} onClick={() => toggleBookmark()}>
              <Icon name="bookmark" size={20} />
              Bookmark
            </button>
            <button className="tool" onClick={() => setSheet('notes')}>
              <Icon name="note" size={20} />
              Notes{annotations.length ? ` ${annotations.length}` : ''}
            </button>
            <button className={`tool ${state.sleep.mode !== 'off' ? 'active' : ''}`} onClick={() => setSheet('sleep')}>
              <Icon name="moon" size={20} />
              Sleep
            </button>
          </div>
        </div>
      </footer>

      {sheet === 'chapters' && (
        <ChaptersSheet
          chapters={chapters}
          current={state.chapter}
          onClose={() => setSheet(null)}
          onPick={(i) => {
            narrator.seek({ chapter: i, offset: 0 });
            setSheet(null);
          }}
        />
      )}
      {sheet === 'notes' && (
        <AnnotationsSheet
          book={book}
          chapters={chapters}
          annotations={annotations}
          onClose={() => setSheet(null)}
          onJump={(a) => {
            narrator.seek({ chapter: a.chapter, offset: a.start });
            setSheet(null);
          }}
          onEdit={(a) => setNoteDraft({ range: { start: a.start, end: a.end, quote: a.quote }, chapter: a.chapter, existing: a })}
          onDelete={async (a) => {
            await deleteAnnotation(a.id);
            refreshAnnotations();
          }}
        />
      )}
      {sheet === 'voice' && (
        <VoiceSheet
          voices={voices}
          selected={voiceId}
          onSelect={(id) => update({ voiceURI: id })}
          onPreview={preview}
          onClose={() => setSheet(null)}
          showDeviceVoices={mode === 'device'}
          top={<NarrationPanel book={book} chapters={chapters} currentChapter={state.chapter} onBookChange={setBook} />}
        />
      )}
      {sheet === 'sleep' && (
        <SleepSheet
          sleep={state.sleep}
          onClose={() => setSheet(null)}
          onSet={(m) => {
            narrator.setSleepTimer(m);
            setSheet(null);
            if (m !== 'off') toast(m === 'chapter' ? 'Will stop at the end of this chapter' : `Will stop in ${m} minutes`);
          }}
        />
      )}
      {sheet === 'details' && (
        <BookDetailsSheet book={book} onClose={() => setSheet(null)} onSaved={setBook} onDeleted={() => navigate('/')} />
      )}
      {noteDraft && (
        <NoteSheet
          initial={{ quote: noteDraft.range.quote, note: noteDraft.existing?.note, color: noteDraft.existing?.color, isNew: !noteDraft.existing }}
          onClose={() => setNoteDraft(null)}
          onSave={async (note, color) => {
            const ex = noteDraft.existing;
            await saveAnnotation({
              ...(ex ?? {}),
              bookId: book.id,
              kind: note ? 'note' : ex?.kind === 'bookmark' ? 'bookmark' : 'highlight',
              chapter: noteDraft.chapter,
              start: noteDraft.range.start,
              end: noteDraft.range.end,
              quote: noteDraft.range.quote,
              note: note || undefined,
              color,
            });
            window.getSelection()?.removeAllRanges();
            setNoteDraft(null);
            refreshAnnotations();
          }}
        />
      )}
    </div>
  );
}
