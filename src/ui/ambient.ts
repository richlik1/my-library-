/**
 * Optional background sounds under narration, made in the app with the Web
 * Audio API (no recordings, so nothing to license and nothing to download).
 * Separate from the narration player, so Lock Screen controls stay with the
 * book. Fades in when narration plays, fades out when it pauses or stops.
 */

export type SoundscapeId = 'rain' | 'ocean' | 'fire' | 'brown' | 'white';

export const SOUNDSCAPES: Array<{ id: SoundscapeId; name: string }> = [
  { id: 'rain', name: 'Rain' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'fire', name: 'Fireplace' },
  { id: 'brown', name: 'Deep noise' },
  { id: 'white', name: 'White noise' },
];

const FADE = 1.2;

type Ctx = AudioContext;

function noise(ctx: Ctx, seconds: number, kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.5;
    else if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3;
    }
  }
  // Crossfade the ends so the loop has no click.
  const f = Math.min(len >> 3, ctx.sampleRate >> 2);
  for (let i = 0; i < f; i++) {
    const t = i / f;
    d[i] = d[i] * t + d[len - f + i] * (1 - t);
  }
  return buf;
}

/** Sparse crackles for the fireplace. */
function crackles(ctx: Ctx, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let n = 0; n < seconds * 9; n++) {
    const at = Math.floor(Math.random() * (len - 400));
    const amp = 0.2 + Math.random() * 0.5;
    for (let i = 0; i < 300; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / 40);
  }
  return buf;
}

class Ambient {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private current: SoundscapeId | null = null;
  private volume = 0.35;
  private active = false;
  private listeners = new Set<() => void>();

  get state(): 'off' | 'playing' | 'paused' {
    if (!this.current) return 'off';
    return this.active && this.ctx?.state === 'running' ? 'playing' : 'paused';
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private ensureCtx(): Ctx | null {
    if (this.ctx) return this.ctx;
    const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.ctx.onstatechange = () => this.emit();
    return this.ctx;
  }

  /** Call from a tap: browsers (iOS especially) only start audio from a user gesture. */
  unlock() {
    if (this.current && this.ctx?.state === 'suspended' && this.active) void this.ctx.resume();
  }

  private build(id: SoundscapeId) {
    const ctx = this.ctx!;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    const loop = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      this.sources.push(s);
      return s;
    };
    const out = this.master!;
    if (id === 'white') loop(noise(ctx, 4, 'white')).connect(out);
    else if (id === 'brown') loop(noise(ctx, 6, 'brown')).connect(out);
    else if (id === 'rain') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 700;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      loop(noise(ctx, 5, 'pink')).connect(hp).connect(lp).connect(out);
    } else if (id === 'ocean') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const swell = ctx.createGain();
      swell.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      lfo.connect(depth).connect(swell.gain);
      this.sources.push(lfo);
      loop(noise(ctx, 8, 'brown')).connect(lp).connect(swell).connect(out);
    } else if (id === 'fire') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const bed = ctx.createGain();
      bed.gain.value = 0.6;
      loop(noise(ctx, 6, 'brown')).connect(lp).connect(bed).connect(out);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1500;
      loop(crackles(ctx, 7)).connect(hp).connect(out);
    }
    for (const s of this.sources) s.start();
  }

  /** Choose a sound (or null for none). Applies right away if narration is playing. */
  set(id: SoundscapeId | null, volume = this.volume) {
    this.volume = volume;
    if (id !== this.current) {
      this.current = id;
      if (!id) {
        this.fadeTo(0);
        setTimeout(() => {
          if (!this.current) {
            for (const s of this.sources) {
              try {
                s.stop();
              } catch {
                /* stopped */
              }
            }
            this.sources = [];
            void this.ctx?.suspend();
          }
          this.emit();
        }, FADE * 1000);
      } else if (this.ensureCtx()) {
        this.build(id);
        if (this.active) this.start();
      }
    } else if (this.active) this.fadeTo(this.volume);
    this.emit();
  }

  /** Follow narration: play while it plays, fade out when it pauses or stops. */
  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    if (!this.current || !this.ctx) return this.emit();
    if (active) this.start();
    else {
      this.fadeTo(0);
      const ctx = this.ctx;
      setTimeout(() => !this.active && void ctx.suspend().then(() => this.emit()), FADE * 1000);
    }
    this.emit();
  }

  private start() {
    if (!this.ctx) return;
    void this.ctx.resume().then(() => {
      this.fadeTo(this.volume);
      this.emit();
    });
  }

  private fadeTo(v: number) {
    if (!this.ctx || !this.master) return;
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(v, now + FADE);
  }
}

export const ambient = new Ambient();

// Resume inside the first tap after a sound was chosen (iOS needs a gesture).
if (typeof document !== 'undefined') document.addEventListener('pointerdown', () => ambient.unlock(), { capture: true });
