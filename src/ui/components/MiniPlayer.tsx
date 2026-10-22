import { usePlaybackSession } from '../hooks/playbackSession';
import { navigate } from '../hooks/useRoute';
import { Cover } from './Cover';
import { Icon } from './Icon';

/** Shows the book that's playing on every tab; tap to open the full player. */
export function MiniPlayer() {
  const { session, narrator, state } = usePlaybackSession();
  if (!session || !narrator || !state) return null;
  const { book, chapters } = session;
  const playing = state.status === 'playing';
  const fraction =
    narrator.kind === 'audio' && state.duration
      ? (state.time ?? 0) / state.duration
      : state.chunks.length > 1
        ? state.chunkIndex / (state.chunks.length - 1)
        : 0;
  const open = () => navigate(`/book/${book.id}`);
  return (
    <div className="mini-player" role="region" aria-label="Now playing">
      <button className="mini-main" onClick={open} aria-label={`Open player: ${book.title}`}>
        <span className="mini-cover">
          <Cover book={book} size={0.28} />
        </span>
        <span className="mini-text">
          <span className="mini-title">{book.title}</span>
          <span className="mini-sub">
            {state.waitingForAudio ? 'Preparing audio…' : chapters[state.chapter]?.title}
          </span>
        </span>
      </button>
      {narrator.kind === 'audio' && (
        <button className="icon-btn" onClick={() => narrator.skipSeconds?.(-15)} aria-label="Back 15 seconds">
          <Icon name="back" size={22} />
        </button>
      )}
      <button className="mini-play" onClick={() => narrator.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
        <Icon name={playing ? 'pause' : 'play'} size={24} />
      </button>
      <div className="mini-progress" aria-hidden="true">
        <i style={{ width: `${Math.min(1, Math.max(0, fraction)) * 100}%` }} />
      </div>
    </div>
  );
}
