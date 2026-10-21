import { PDFDocument, StandardFonts } from 'pdf-lib';

export async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle('The Lighthouse Keeper');
  doc.setAuthor('E. Example');
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const pages = [
    ['Chapter 1', '', 'The lighthouse stood at the edge of the world.', 'Every night its keeper climbed the long stairs.', '', 'He never missed a single evening.'],
    ['Chapter 2', '', 'One stormy night a ship appeared on the horizon.', 'The keeper lit the great lamp and waited.'],
  ];
  for (const lines of pages) {
    const page = doc.addPage([420, 600]);
    let y = 540;
    for (const line of lines) {
      if (!line) {
        y -= 18;
        continue;
      }
      page.drawText(line, { x: 40, y, size: 13, font });
      y -= 17;
    }
  }
  return Buffer.from(await doc.save());
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64');

export async function scannedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(PNG);
  for (let i = 0; i < 2; i++) doc.addPage([400, 600]).drawImage(img, { x: 0, y: 0, width: 400, height: 600 });
  return Buffer.from(await doc.save());
}

/**
 * Replaces the browser's speech engine with a recorder, so tests can see
 * exactly what would be spoken and control when each sentence ends.
 */
export const speechStub = () => {
  type U = { text: string; voice: unknown; rate: number; pitch: number; lang: string; onstart?: () => void; onend?: () => void; onerror?: (e: unknown) => void; onboundary?: (e: unknown) => void };
  const w = window as unknown as { __spoken: string[]; __current: U | null; __finish: () => void; __auto: boolean };
  w.__spoken = [];
  w.__current = null;
  w.__auto = false;
  const voices = [
    { name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.Samantha', localService: true, default: true },
    { name: 'Daniel (Enhanced)', lang: 'en-GB', voiceURI: 'com.apple.voice.Daniel', localService: true, default: false },
  ];
  class FakeUtterance {
    text: string;
    voice: unknown = null;
    rate = 1;
    pitch = 1;
    lang = '';
    onstart?: () => void;
    onend?: () => void;
    onerror?: (e: unknown) => void;
    onboundary?: (e: unknown) => void;
    constructor(t: string) {
      this.text = t;
    }
  }
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => voices,
    addEventListener() {},
    removeEventListener() {},
    speak(u: U) {
      w.__spoken.push(u.text);
      w.__current = u;
      synth.speaking = true;
      setTimeout(() => {
        u.onstart?.();
        if (w.__auto) setTimeout(() => w.__finish(), 30);
      }, 10);
    },
    cancel() {
      synth.speaking = false;
      const u = w.__current;
      w.__current = null;
      u?.onerror?.({ error: 'interrupted' });
    },
    pause() {},
    resume() {},
  };
  w.__finish = () => {
    const u = w.__current;
    if (!u) return;
    w.__current = null;
    synth.speaking = false;
    u.onend?.();
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
};
