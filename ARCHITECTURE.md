# Architecture

My Library is split into a **core** that knows nothing about React or the browser UI, and a thin **UI** layer. That split is
what makes a future native iOS app (offline neural voices, background audio, lock-screen controls) a matter of swapping
adapters rather than rewriting the app.

```
            ┌─────────────────────────── src/ui (React) ───────────────────────────┐
            │ Library · Player/Reader · Sheets · Settings · usePlayback · useVoices │
            └──────────────┬──────────────────────┬─────────────────────┬──────────┘
                           │                      │                     │
               ┌───────────▼─────────┐  ┌─────────▼─────────┐  ┌────────▼────────┐
               │ core/importers      │  │ core/speech       │  │ core/storage    │
               │ pdf epub docx txt   │  │ Narrator          │  │ db (IndexedDB)  │
               │ text (clean/chapter)│  │ chunker           │  │ backup (JSON)   │
               └─────────────────────┘  │ SpeechEngine ◄────┼──┼─ adapters       │
                                        └─────────┬─────────┘  └─────────────────┘
                                                  │
                              WebSpeechEngine (browser) │ future: NativeSpeechEngine (iOS)
```

## Data model (`src/core/types.ts`)

- **Book** — metadata only (title, author, category, cover data URL, format, counts, OCR report).
- **BookContent** — `chapters: { title, text }[]`. Text is normalised: single spaces, paragraphs separated by `\n\n`.
  Chapters longer than 40 000 characters are split into parts so the reader view stays fast.
- **Position** — `{ chapter, offset }`: a character offset inside a chapter's text. Every feature (progress, bookmarks,
  highlights, notes, “play from here”) uses this one coordinate system, so it is stable across devices and engines.
- **Progress**, **Annotation**, **Settings** — keyed by book id.

IndexedDB stores: `books`, `contents`, `files` (original upload, for full backups/re-processing), `progress`, `annotations`
(indexed by book), `kv` (settings).

## Import pipeline

1. `detectFormat` — magic bytes first (`%PDF-`, ZIP + `mimetypeapplication/epub+zip`), then extension.
2. Format importer → `ImportedBook`:
   - **PDF** (PDF.js legacy build for older iOS Safari, loaded lazily): text items → lines (by baseline) → running
     headers/footers and page numbers removed (repeated edge lines) → paragraphs (line-gap / short-line / indent heuristics,
     de-hyphenation) → pages joined (paragraphs continuing across pages are merged). Chapters from the PDF outline, else heading
     detection, else page groups. Pages with no text but with images are reported as needing OCR; a PDF with no text at all is
     rejected with the OCR explanation. First page rendered to a small JPEG cover.
   - **EPUB** — JSZip; `container.xml` → OPF → spine order; chapter titles from the EPUB3 nav or NCX; XHTML → text with
     paragraph breaks (scripts, styles, footnote markers skipped); cover image from the manifest; DRM detected via
     `encryption.xml`.
   - **DOCX** — JSZip; `word/document.xml` paragraphs and runs; heading levels from `styles.xml` (localised names, outline
     levels); tracked deletions skipped; split on the highest heading level used twice or more.
   - **TXT** — UTF-8/UTF-16 BOM/Windows-1252 decoding, Project Gutenberg header/footer removal, hard-wrap unwrapping, heading
     detection.
3. `finalizeChapters` — normalise, drop empty chapters, split very long ones.

## Speech

- **Chunker** (`chunker.ts`) — sentence segmentation (`Intl.Segmenter`, regex fallback, abbreviation repair), long sentences
  split at clause punctuation, tiny sentences merged; ≤ 200 characters per chunk. Each chunk keeps its absolute offsets.
  Short utterances avoid Chrome's ~15 s cut-off and make retry/skip cheap.
- **SpeechEngine** (`engine.ts`) — the only thing that produces sound:
  `getVoices`, `speak(text, {voiceId, rate, pitch}, {onStart, onBoundary, onEnd, onError})`, `cancel`, `isSpeaking`.
- **WebSpeechEngine** — browser `speechSynthesis`; keeps a strong reference to the utterance (Chrome GC bug), detaches handlers
  on cancel, nudges Chrome's online voices, delays a speak that immediately follows a cancel on iOS, classifies voices
  (Premium/Enhanced/novelty, on-device vs online).
- **Narrator** (`narrator.ts`) — the playback state machine (idle/playing/paused/ended): walks chunks and chapters, word-level
  position from boundary events, pause = cancel + remember position (more reliable than `speechSynthesis.pause()` on mobile),
  generation counter so events from cancelled utterances are ignored, start watchdog (speech silently never started) and end
  watchdog (engine never reported the end), retry ×2 then skip a failing sentence, stop with an explanation after repeated
  failures, interruption and autoplay-policy handling, foreground recovery, sleep timer. Fully unit-tested with a fake engine.

## PWA / offline

`vite-plugin-pwa` generates the manifest and a Workbox service worker that precaches the whole app (including the PDF.js worker),
so the app opens, imports and reads with no network. PDF.js CJK character maps/fonts are cached on first use. `base: './'` +
hash routing let the same build run from any host or sub-path. `navigator.storage.persist()` is requested to protect the library
from eviction; the Screen Wake Lock API keeps the screen on while narrating.

## Native iOS app (App Store build)

`ios/` is a [Capacitor](https://capacitorjs.com) project (free, open source). It wraps the same web build and swaps the speech
engine. `src/ui/engine.ts` is the only place that chooses the engine.

- **`NativeSpeechEngine`** (`src/core/speech/nativeSpeechEngine.ts`) talks to **`NativeSpeechPlugin.swift`**
  (`ios/App/App/`), which is registered in `MainViewController.swift`.
- It implements `SequenceSpeechEngine`. Instead of speaking one sentence at a time (which needs JavaScript to be running),
  the Narrator hands over **the rest of the book as one queue** (up to 4000 sentences, then it refills). That matters because
  iOS suspends the web view in the background, but native code keeps running while audio plays.
- The Swift side uses `AVSpeechSynthesizer` on an `AVAudioSession` with category `.playback` and mode `.spokenAudio`, plus
  `UIBackgroundModes = audio`. That gives:
  - background and locked-screen narration;
  - `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter` for Lock Screen, Control Center and headphone controls (play/pause,
    previous/next chapter);
  - pausing for calls and Siri, and resuming after them;
  - a native sleep timer that runs in the background.
- Word positions (`willSpeakRangeOfSpeechString`, in UTF-16 units, the same as JavaScript) are sent back as events.
- The position is also saved in `UserDefaults`, so it survives the app being killed in the background. When a book opens,
  the Player uses whichever saved position is newer.
- In the native app, web-only parts are switched off (`src/ui/platform.ts`): the service worker, the install banner, wake lock
  and Media Session. File export goes through `@capacitor/filesystem` and `@capacitor/share` (the share sheet).

### Future: offline neural voices
An engine that renders sentences with an open-source neural TTS model (e.g. Piper or Kokoro via sherpa-onnx) into PCM buffers
played by `AVAudioEngine` can implement the same `SequenceSpeechEngine` interface. Positions, notes and backups stay compatible
because everything uses the same chapter + character offset coordinates.
