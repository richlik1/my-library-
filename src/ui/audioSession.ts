/**
 * Safari (iOS 17+) supports the Audio Session API. Without it, web speech and
 * Web Audio follow the iPhone's silent switch, so with Silent mode on the app
 * plays nothing. "playback" makes the app's sound behave like a podcast app:
 * it plays in Silent mode, like other audiobook apps.
 */
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export function audioSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as AudioSessionNavigator).audioSession;
}

export function setPlaybackAudioSession() {
  const s = (navigator as AudioSessionNavigator).audioSession;
  if (!s) return false;
  try {
    if (s.type !== 'playback') s.type = 'playback';
    return true;
  } catch {
    return false;
  }
}

if (typeof document !== 'undefined') {
  setPlaybackAudioSession();
  // Some versions only accept the change during a tap.
  document.addEventListener('pointerdown', () => setPlaybackAudioSession(), { capture: true });
}
