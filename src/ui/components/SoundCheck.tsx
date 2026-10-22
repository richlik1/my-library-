import { useState } from 'react';
import { benchmarkVoice, describeBenchmark } from '../../core/audio/benchmark';
import { DEFAULT_KOKORO_VOICE, getVoiceLog } from '../../core/audio/kokoroEngine';
import { encodeWav } from '../../core/audio/wav';
import { audioSessionSupported, setPlaybackAudioSession } from '../audioSession';
import { speechEngine } from '../engine';
import { usePlaybackSession } from '../hooks/playbackSession';
import { useToast } from '../hooks/toast';
import { neuralEngine } from '../narration';

type Answer = 'yes' | 'no' | null;

function beepUrl() {
  const sr = 22050;
  const s = new Float32Array(Math.round(sr * 0.7));
  for (let i = 0; i < s.length; i++) s[i] = 0.35 * Math.sin((2 * Math.PI * 660 * i) / sr) * Math.min(1, i / 800, (s.length - i) / 800);
  return URL.createObjectURL(new Blob([encodeWav([s], sr)], { type: 'audio/wav' }));
}

/**
 * Finds where sound stops on this device, one step at a time: an audio file
 * (what natural voice uses), the device voice, then the natural voice model.
 */
export function SoundCheck() {
  const toast = useToast();
  const pb = usePlaybackSession();
  const [beep, setBeep] = useState<Answer>(null);
  const [beepError, setBeepError] = useState('');
  const [speech, setSpeech] = useState<Answer>(null);
  const [speechError, setSpeechError] = useState('');
  const [natural, setNatural] = useState<{ busy: boolean; text: string } | null>(null);
  const [asked, setAsked] = useState<'beep' | 'speech' | null>(null);

  const playBeep = async () => {
    pb.narrator?.pause();
    setPlaybackAudioSession();
    setBeepError('');
    try {
      const a = new Audio(beepUrl());
      await a.play();
      setAsked('beep');
    } catch (e) {
      setBeepError(`The audio player refused to play: ${(e as Error).name} ${(e as Error).message}`);
      setBeep('no');
    }
  };

  const sayHello = () => {
    pb.narrator?.pause();
    setPlaybackAudioSession();
    setSpeechError('');
    if (!speechEngine.isSupported()) {
      setSpeechError('This browser has no speech engine.');
      setSpeech('no');
      return;
    }
    speechEngine.speak('This is your device voice.', { voiceId: pb.voiceId, rate: 1, pitch: 1 }, {
      onStart() {},
      onBoundary() {},
      onEnd() {},
      onError(code) {
        setSpeechError(`The device voice reported an error: ${code}`);
      },
    });
    setAsked('speech');
  };

  const testNatural = async () => {
    pb.narrator?.pause();
    setNatural({ busy: true, text: 'Starting the natural voice (first time: downloads 92 MB)…' });
    try {
      const b = await benchmarkVoice(neuralEngine(), DEFAULT_KOKORO_VOICE, (label) => setNatural({ busy: true, text: label }));
      setNatural({ busy: false, text: `Works. ${describeBenchmark(b)}` });
    } catch (e) {
      setNatural({ busy: false, text: `Didn’t work: ${(e as Error).message}` });
    }
  };

  const report = [
    `Beep (audio file): ${beep ?? 'not tried'}${beepError ? ` — ${beepError}` : ''}`,
    `Device voice: ${speech ?? 'not tried'}${speechError ? ` — ${speechError}` : ''}`,
    `Natural voice: ${natural?.text ?? 'not tried'}`,
    `Silent-mode override (Audio Session API): ${audioSessionSupported() ? 'available, on' : 'not available on this browser'}`,
    `Cross-origin isolated: ${typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated}; cores: ${navigator.hardwareConcurrency}`,
    navigator.userAgent,
    ...getVoiceLog(),
  ].join('\n');

  const Ask = ({ on }: { on(a: Answer): void }) => (
    <div className="row" style={{ display: 'flex', gap: 8, marginTop: 6 }}>
      <span className="small" style={{ alignSelf: 'center' }}>
        Did you hear it?
      </span>
      <button
        className="btn"
        onClick={() => {
          on('yes');
          setAsked(null);
        }}
      >
        Yes
      </button>
      <button
        className="btn"
        onClick={() => {
          on('no');
          setAsked(null);
        }}
      >
        No
      </button>
    </div>
  );

  return (
    <section className="card" aria-labelledby="sound-h">
      <h3 id="sound-h">Sound check</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        If you hear nothing, run these three steps. Turn the volume up first. If the bell icon in your status bar has a slash, Silent mode is on;
        {audioSessionSupported() ? ' the app now plays anyway, but if a step fails, turn Silent mode off and try again.' : ' turn it off (switch on the side of the iPhone or Control Center).'}
      </p>

      <div className="check-step">
        <strong>1. Audio file</strong> <span className="small muted">(how natural voice plays, also with the screen locked)</span>
        <div>
          <button className="btn" onClick={playBeep}>
            Play a beep
          </button>{' '}
          {beep && <span className="small">{beep === 'yes' ? '✓ Works' : '✗ No sound'}</span>}
        </div>
        {asked === 'beep' && <Ask on={setBeep} />}
        {beepError && <p className="small">{beepError}</p>}
      </div>

      <div className="check-step">
        <strong>2. Device voice</strong> <span className="small muted">(instant voice; stops when the screen locks)</span>
        <div>
          <button className="btn" onClick={sayHello}>
            Say a sentence
          </button>{' '}
          {speech && <span className="small">{speech === 'yes' ? '✓ Works' : '✗ No sound'}</span>}
        </div>
        {asked === 'speech' && <Ask on={setSpeech} />}
        {speechError && <p className="small">{speechError}</p>}
      </div>

      <div className="check-step">
        <strong>3. Natural voice</strong> <span className="small muted">(makes audio files on this phone; can take a few minutes the first time)</span>
        <div>
          <button className="btn" onClick={testNatural} disabled={natural?.busy}>
            {natural?.busy ? 'Testing…' : 'Test natural voice'}
          </button>
        </div>
        {natural && (
          <p className="small" role="status">
            {natural.text}
          </p>
        )}
      </div>

      {(beep || speech || (natural && !natural.busy)) && (
        <details style={{ marginTop: 10 }} open={beep === 'no' || speech === 'no' || !!natural?.text.startsWith('Didn’t')}>
          <summary className="small">Results to send</summary>
          <pre className="voice-log">{report}</pre>
          <button
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report);
                toast('Copied. Paste it into your message.');
              } catch {
                toast('Couldn’t copy; take a screenshot instead', { kind: 'error' });
              }
            }}
          >
            Copy results
          </button>
        </details>
      )}
    </section>
  );
}
