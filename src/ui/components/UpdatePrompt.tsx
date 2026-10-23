import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { listBooks } from '../../core/storage/db';
import { usePlaybackSession } from '../hooks/playbackSession';
import { useToast } from '../hooks/toast';
import { Sheet } from './Sheet';

const SEEN_KEY = 'ml-seen-version';

/**
 * Keeps the installed app up to date: checks for a new version whenever the
 * app is opened or brought back, installs it right away when nothing is
 * playing (otherwise asks), and shows what's new once after an update.
 */
export function UpdatePrompt() {
  const toast = useToast();
  const { state } = usePlaybackSession();
  const playing = useRef(false);
  playing.current = state?.status === 'playing';
  const [whatsNew, setWhatsNew] = useState(false);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => reg.update().catch(() => undefined);
      // Home Screen apps on iPhone are resumed, not relaunched, so check when the app comes back too.
      document.addEventListener('visibilitychange', () => !document.hidden && check());
      setInterval(check, 30 * 60 * 1000);
    },
  });

  // Offline support is set up silently (the Home screen already says it works offline).
  useEffect(() => {
    if (offlineReady) setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  useEffect(() => {
    if (!needRefresh) return;
    setNeedRefresh(false);
    // Don't interrupt listening: update straight away only when nothing is playing.
    if (!playing.current) void updateServiceWorker(true);
    else
      toast('A new version of My Library is ready.', {
        ms: 0,
        action: { label: 'Update', run: () => updateServiceWorker(true) },
      });
  }, [needRefresh, setNeedRefresh, toast, updateServiceWorker]);

  // Show what's new once per version, to people who already had books.
  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
      localStorage.setItem(SEEN_KEY, __APP_VERSION__);
    } catch {
      return;
    }
    if (seen === __APP_VERSION__) return;
    void listBooks().then((b) => b.length > 0 && setWhatsNew(true));
  }, []);

  if (!whatsNew) return null;
  return (
    <Sheet title={`What’s new in My Library ${__APP_VERSION__}`} onClose={() => setWhatsNew(false)}>
      <ul className="whats-new">
        <li>
          <strong>The natural voice starts fast:</strong> Home offers a one-time download (63 MB), then every book reads with it and Play starts
          in about 2 seconds. While it downloads, you can listen with the device voice and switch back when it’s ready.
        </li>
        <li>
          <strong>Buttons and Pause always respond:</strong> the voice never runs on the same thread as the screen any more (that could freeze
          every button for seconds). Messages no longer cover the buttons at the top.
        </li>
        <li>
          <strong>Keeps playing:</strong> when the next part isn’t ready yet, the player waits and continues by itself instead of stopping, and
          your place is saved as you listen. If audio stops anyway, Settings → Sound check → <strong>Listening log</strong> shows why.
        </li>
        <li>
          <strong>Clearer Voice &amp; speed:</strong> the voice comes first, with <strong>Fast natural</strong> recommended. The other natural
          voice (Kokoro) doesn’t work on iPhone, so books that used it now use Fast natural.
        </li>
        <li>
          <strong>New: Fast natural voice.</strong> A lighter voice (Piper) that makes audio several times faster, made for iPhone. In Voice &amp;
          speed choose <strong>Fast natural</strong>, or test it in Settings → Sound check.
        </li>
        <li>
          <strong>Sound fixes:</strong> sound now plays even with Silent mode on (iOS 17 and later). If you still hear nothing, Settings → Sound check
          finds where it stops. If the natural voice fails, the player offers the device voice right away.
        </li>
        <li>
          <strong>Better text:</strong> two-column PDFs read in the right order, and you can fix any chapter’s text (Chapters → Fix the text of this
          chapter). Highlighting follows each word only when the voice reports words; otherwise it highlights the sentence.
        </li>
        <li>
          <strong>Faster, more reliable natural voice:</strong> it uses several processor cores at once (about twice as fast in testing). If your phone
          gets stuck that way, it notices within a minute or two and switches to a safer way by itself, and remembers it.
        </li>
        <li>
          <strong>New layout:</strong> Home, Library, Discover and Progress tabs. Your book keeps playing while you browse, with a mini-player at the
          bottom.
        </li>
        <li>
          <strong>Natural voice starts faster:</strong> it plays after the first sentence instead of waiting for the whole chapter. Settings → Test natural
          voice speed measures your phone.
        </li>
        <li>
          <strong>Presets</strong> in Voice &amp; speed: Deep Focus, Business Learning, Relaxed Listening, Fast Review, or save your own.
        </li>
        <li>
          <strong>While listening:</strong> Save lesson, Explain this and Apply it.
        </li>
        <li>
          <strong>Daily goal, streak, XP and achievements</strong> on Progress, counted from real listening only. You can turn them off.
        </li>
        <li>
          <strong>Quotes:</strong> everything you saved, with tags, favorites, a daily review and export.
        </li>
        <li>
          <strong>Book Club</strong> in Discover, <strong>Quick Listen</strong> on Home, <strong>background sounds</strong> and a <strong>light theme</strong>
          .
        </li>
      </ul>
      <button className="btn btn-primary" onClick={() => setWhatsNew(false)}>
        Got it
      </button>
    </Sheet>
  );
}
