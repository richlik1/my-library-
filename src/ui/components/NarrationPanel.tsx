import { useEffect, useRef, useState } from 'react';
import { DEFAULT_KOKORO_VOICE, KOKORO_VOICES } from '../../core/audio/kokoroEngine';
import type { Job } from '../../core/audio/queue';
import { encodeWav } from '../../core/audio/wav';
import { audioCacheBytes, deleteBookAudio, deleteChapterAudio, getChapterWav, listBookAudio, updateBook } from '../../core/storage/db';
import { chapterAudioStatus } from '../../core/audio/types';
import { downloadBlob, safeName } from './PlayerSheets';
import type { Book, Chapter } from '../../core/types';
import { useToast } from '../hooks/toast';
import { hasWebGPU } from '../../core/audio/kokoroEngine';
import { audioQueue, kokoroDevice, neuralEngine, setKokoroDevice } from '../narration';
import { formatBytes } from './BookDetailsSheet';
import { Icon } from './Icon';

/** Live list of generation jobs for one book. */
export function useAudioJobs(bookId: string): Job[] {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    const unsub = audioQueue.subscribe((all) => setJobs(all.filter((j) => j.bookId === bookId)));
    return () => {
      unsub();
    };
  }, [bookId]);
  return jobs;
}

/** Chapters of a book whose audio is ready in the given voice; refreshes as generation finishes. */
export function useReadyChapters(bookId: string, voice: string, jobs: Job[]): Set<number> {
  const [ready, setReady] = useState<Set<number>>(new Set());
  const doneCount = jobs.filter((j) => j.status === 'done').length;
  useEffect(() => {
    let alive = true;
    void listBookAudio(bookId).then((list) => {
      if (!alive) return;
      const status = chapterAudioStatus(list.filter((a) => a.voice === voice));
      setReady(new Set([...status].filter(([, s]) => s.complete).map(([c]) => c)));
    });
    return () => {
      alive = false;
    };
  }, [bookId, voice, doneCount]);
  return ready;
}

export function NarrationPanel({
  book,
  chapters,
  currentChapter,
  onBookChange,
}: {
  book: Book;
  chapters: Chapter[];
  currentChapter: number;
  onBookChange(b: Book): void;
}) {
  const toast = useToast();
  const jobs = useAudioJobs(book.id);
  const mode = book.narration?.engine ?? 'device';
  const voice = book.narration?.voice ?? DEFAULT_KOKORO_VOICE;
  const ready = useReadyChapters(book.id, voice, jobs);
  const [usage, setUsage] = useState(0);
  const [preview, setPreview] = useState<{ voice: string; label: string } | null>(null);
  const previewAudio = useRef<HTMLAudioElement | null>(null);
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [device, setDevice] = useState(kokoroDevice());
  useEffect(() => {
    void hasWebGPU().then(setGpuAvailable);
  }, []);

  const [deleted, setDeleted] = useState(0);
  const refresh = async () => setUsage(await audioCacheBytes());
  useEffect(() => {
    void refresh();
  }, [book.id, voice, jobs.filter((j) => j.status === 'done').length, deleted]);

  const setNarration = async (patch: Partial<NonNullable<Book['narration']>>) => {
    const narration = { engine: mode, voice, ...patch };
    const next = await updateBook(book.id, { narration });
    if (next) onBookChange(next);
  };

  const playPreview = async (id: string) => {
    const name = KOKORO_VOICES.find((v) => v.id === id)?.name ?? id;
    setPreview({ voice: id, label: 'Preparing…' });
    try {
      const engine = neuralEngine();
      await engine.load((_f, label) => setPreview({ voice: id, label }));
      setPreview({ voice: id, label: 'Generating sample…' });
      const r = await engine.synthesize(`Hi, I'm ${name}. I'll read ${book.title} to you.`, id);
      const url = URL.createObjectURL(new Blob([encodeWav([r.samples], r.sampleRate)], { type: 'audio/wav' }));
      previewAudio.current?.pause();
      const a = new Audio(url);
      previewAudio.current = a;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
      setPreview(null);
    } catch (e) {
      setPreview(null);
      toast(`Couldn’t play the sample: ${(e as Error).message}`, { kind: 'error' });
    }
  };

  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'generating');
  const failed = jobs.filter((j) => j.status === 'failed');
  const current = jobs.find((j) => j.status === 'generating');

  return (
    <section style={{ marginBottom: 18 }}>
      <div className="seg-nav" role="radiogroup" aria-label="Narration">
        <a
          href="#"
          role="radio"
          aria-checked={mode === 'device'}
          className={mode === 'device' ? 'active' : ''}
          onClick={(e) => {
            e.preventDefault();
            void setNarration({ engine: 'device' });
          }}
        >
          Device voice
        </a>
        <a
          href="#"
          role="radio"
          aria-checked={mode === 'kokoro'}
          className={mode === 'kokoro' ? 'active' : ''}
          onClick={(e) => {
            e.preventDefault();
            void setNarration({ engine: 'kokoro' });
          }}
        >
          Natural voice
        </a>
      </div>

      {mode === 'device' ? (
        <p className="muted small" style={{ marginTop: 0 }}>
          Instant, using your device’s built-in voices. On iPhone it stops when the screen locks. Choose <strong>Natural voice</strong> to
          listen with the screen locked.
        </p>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Kokoro creates real audio on this device, free and private. It downloads a 92 MB voice model once, then makes each chapter
            ahead of time. Making a chapter can take longer than listening to it, so start a few chapters (or the whole book) early and
            keep the app open while it works. Finished chapters keep playing with the screen locked and work offline.
          </p>

          <div className="rate-row" style={{ marginBottom: 6 }}>
            <div className="rate-head">
              <span>
                Audio for this book: {ready.size} of {chapters.length} chapters ready
              </span>
            </div>
            <div className="bar" style={{ marginTop: 4 }}>
              <i style={{ width: `${(ready.size / Math.max(1, chapters.length)) * 100}%` }} />
            </div>
          </div>
          {current && (
            <p className="small" style={{ margin: '6px 0' }}>
              {current.label ?? `Generating “${chapters[current.chapter]?.title}”: ${Math.round(current.progress * 100)}%`}
            </p>
          )}
          {failed.map((j) => (
            <div key={j.chapter} className="banner warn" style={{ margin: '6px 0' }}>
              <div className="banner-body small">
                <strong>{chapters[j.chapter]?.title}</strong>: {j.error}
              </div>
              <button className="btn" onClick={() => audioQueue.enqueue(book.id, [j.chapter])}>
                Retry
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
            <button
              className="btn btn-primary"
              disabled={ready.has(currentChapter)}
              onClick={() => {
                audioQueue.enqueue(book.id, [currentChapter]);
                audioQueue.prioritize(book.id, currentChapter);
              }}
            >
              {ready.has(currentChapter) ? 'This chapter is ready' : 'Generate this chapter'}
            </button>
            <button className="btn" onClick={() => audioQueue.enqueue(book.id, chapters.map((_, i) => i))}>
              Generate whole book
            </button>
            {ready.has(currentChapter) && (
              <>
                <button
                  className="btn"
                  onClick={async () => {
                    await deleteChapterAudio(book.id, currentChapter);
                    audioQueue.clearFinished();
                    audioQueue.enqueue(book.id, [currentChapter]);
                    audioQueue.prioritize(book.id, currentChapter);
                    toast('Making this chapter again');
                  }}
                >
                  Regenerate this chapter
                </button>
                <button
                  className="btn"
                  onClick={async () => {
                    const wav = await getChapterWav(book.id, currentChapter);
                    if (!wav) return;
                    const name = `${safeName(book.title)} - ${String(currentChapter + 1).padStart(2, '0')} ${safeName(chapters[currentChapter]?.title ?? '')}.wav`;
                    await downloadBlob(new Blob([wav], { type: 'audio/wav' }), name);
                  }}
                >
                  <Icon name="download" size={16} /> Save this chapter’s audio
                </button>
              </>
            )}
            {active.length > 0 &&
              (audioQueue.isPaused ? (
                <button className="btn" onClick={() => audioQueue.resume()}>
                  Resume
                </button>
              ) : (
                <button className="btn" onClick={() => audioQueue.pause()}>
                  Pause generating
                </button>
              ))}
            {active.length > 0 && (
              <button className="btn btn-ghost" onClick={() => audioQueue.cancel(book.id)}>
                Cancel
              </button>
            )}
          </div>
          <p className="muted small">
            {active.length > 0 ? `${active.length} chapter${active.length > 1 ? 's' : ''} in the queue. Keep this app open while it generates. ` : ''}
            Audio stored on this device: {formatBytes(usage)}.{' '}
            {ready.size > 0 && (
              <button
                className="btn btn-ghost"
                style={{ minHeight: 28, padding: '0 6px', fontSize: 13 }}
                onClick={async () => {
                  audioQueue.cancel(book.id);
                  await deleteBookAudio(book.id);
                  audioQueue.clearFinished();
                  setDeleted((n) => n + 1);
                  toast('Deleted this book’s audio');
                }}
              >
                Delete this book’s audio
              </button>
            )}
          </p>

          {gpuAvailable && (
            <label className="switch">
              <span>
                Faster generation with the graphics chip
                <small>Uses WebGPU. One-time download of a larger model (326 MB instead of 92 MB). Turn off if generation fails.</small>
              </span>
              <input
                type="checkbox"
                checked={device === 'webgpu'}
                onChange={(e) => {
                  const d = e.target.checked ? 'webgpu' : 'wasm';
                  setKokoroDevice(d);
                  setDevice(d);
                }}
              />
            </label>
          )}

          <div className="voice-group">
            <h4>Natural voices</h4>
            <ul className="list">
              {KOKORO_VOICES.map((v) => (
                <li key={v.id}>
                  <div className={`list-row ${v.id === voice ? 'current' : ''}`}>
                    <button className="grow" style={{ textAlign: 'left' }} onClick={() => setNarration({ voice: v.id })}>
                      <div>
                        {v.name}
                        {v.grade?.startsWith('A') && <span className="tag">Best</span>}
                      </div>
                      <div className="sub">
                        {v.gender === 'female' ? 'Female' : 'Male'} · {v.accent} · grade {v.grade}
                      </div>
                    </button>
                    <button className="icon-btn" onClick={() => playPreview(v.id)} aria-label={`Preview ${v.name}`} disabled={!!preview}>
                      <Icon name="play" size={18} />
                    </button>
                    {v.id === voice && <Icon name="check" size={20} />}
                  </div>
                  {preview?.voice === v.id && <div className="sub small" style={{ padding: '0 2px 8px' }}>{preview.label}</div>}
                </li>
              ))}
            </ul>
            <p className="muted small">Changing the voice means chapters are generated again in the new voice.</p>
          </div>
        </>
      )}
    </section>
  );
}
