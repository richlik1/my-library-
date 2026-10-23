import { useState } from 'react';
import { DEFAULT_PIPER_VOICE } from '../../core/audio/piper';
import { fastVoiceReady } from '../../core/audio/piperEngine';
import { piperEngine } from '../narration';
import { isNativeApp } from '../platform';
import { useToast } from '../hooks/toast';
import { Icon } from './Icon';

/**
 * Offers the one-time download of the fast natural voice on Home, so it's ready before the first Play.
 * Hidden once the voice has worked on this device. (Not shown while automated tests use a stand-in voice.)
 */
export function VoiceSetupCard() {
  const toast = useToast();
  const [state, setState] = useState<{ busy: boolean; label?: string; fraction?: number; done?: boolean }>({ busy: false });
  if (isNativeApp() || (globalThis as { __MY_LIBRARY_TEST_ENGINE__?: unknown }).__MY_LIBRARY_TEST_ENGINE__) return null;
  if (fastVoiceReady() && !state.done) return null;

  const start = async () => {
    setState({ busy: true, label: 'Starting…', fraction: 0 });
    try {
      await piperEngine.load((fraction, label) => setState({ busy: true, label, fraction }), DEFAULT_PIPER_VOICE);
      setState({ busy: false, done: true });
      toast('The natural voice is ready. Your books will use it.');
    } catch (e) {
      setState({ busy: false });
      toast(`Couldn’t get the voice ready: ${(e as Error).message}`, { kind: 'error' });
    }
  };

  return (
    <section aria-labelledby="voice-setup-h" className="card quick-card">
      <div className="quick-icon" aria-hidden="true">
        <Icon name={state.done ? 'check' : 'speed'} size={22} />
      </div>
      <div style={{ flex: 1 }}>
        <h2 className="h-small" id="voice-setup-h">
          {state.done ? 'Natural voice ready' : 'Get the natural voice'}
        </h2>
        <p className="small muted" style={{ margin: '2px 0 0' }} role="status">
          {state.done
            ? 'Books now read with it, also with the screen locked.'
            : state.busy
              ? state.label
              : 'Sounds human and keeps playing with the screen locked. Free and private; downloads once (63 MB).'}
        </p>
        {state.busy && (
          <div className="bar" style={{ marginTop: 6 }}>
            <i style={{ width: `${Math.round((state.fraction ?? 0) * 100)}%` }} />
          </div>
        )}
      </div>
      {!state.done && (
        <button className="btn btn-primary" onClick={start} disabled={state.busy}>
          {state.busy ? 'Getting…' : 'Download'}
        </button>
      )}
    </section>
  );
}
