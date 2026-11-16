# MY LIBRARY AI — Repository audit (V4)

Date: 2026-11-16. Commit audited: `8bfb096` (app 2.5.0, live on GitHub Pages). Method: read the source, ran the
test suites in this environment (Linux, Node 22, Chromium via Playwright), and read the latest CI runs, which include
WebKit (Safari's engine) with iPhone 14 settings on macOS and the real Amy voice.

**Status words:** Verified (an automated test ran and passed) · Implemented, untested · Partial · Missing ·
Fails · Blocked (cannot be built or checked here).

**Not available to this audit:** an iPhone, a Mac with Xcode, an iOS Simulator run, or a person listening. Nothing
below is claimed for a real iPhone unless it says so.

## 1. Baseline

| Suite | Result (this audit) |
|---|---|
| Typecheck `npx tsc -b` | clean |
| Unit/integration `npm test` (Vitest) | **123 passed**, 14 files |
| Browser end-to-end, Chromium desktop + 390×844 phone viewport | see §9 (run in progress when written; last green: CI run for `8bfb096`) |
| Safari engine (WebKit 26, iPhone 14 settings, macOS CI), required checks | **16/16 passed** on `8bfb096`: real Amy voice, 3.5 min continuous listening, start-up, buttons responsive while generating, stuck-voice handling, sound check |
| Safari engine, informational | 36/39; the 3 failures are offline-reload tests where the WebKit test driver itself errors (“WebKit encountered an internal error” on `page.reload()` while offline). Pass in Chromium |

Size: ~15,200 lines of TypeScript/TSX in `src`, 382 lines of Swift in `ios/App/App/NativeSpeechPlugin.swift`.

## 2. Platforms

| Item | Finding | Status |
|---|---|---|
| Web app / PWA | React 19 + TypeScript + Vite 8, service worker (offline, cross-origin isolation headers), GitHub Pages | Verified (Chromium, WebKit CI) |
| iOS native app | Capacitor 8 project in `ios/`, background-audio mode declared, native speech plugin (AVSpeechSynthesizer, audio session interruptions, Now Playing, word-range callbacks) | **Blocked: never compiled.** Needs Xcode (a Mac or a macOS CI runner) and, for a device install, an Apple Developer account ($99/yr) |
| Android | none | Missing |
| Storage | IndexedDB schema v5 (books, contents, files, progress, annotations, kv, audio, audioData, growth*, summaries, listening, xp); persistent-storage request; JSON backups | Verified |

## 3. Import pipeline

Entry point `src/core/importers/index.ts`: format by magic bytes then extension → per-format importer →
`finalizeChapters` (normalise, drop empties, split chapters over 40,000 characters).

| Capability | Status | Evidence / notes |
|---|---|---|
| Formats: PDF, EPUB, DOCX, TXT/Markdown, RTF, HTML | Verified | `tests/importers`, `formats`, `pdf`, `columns` |
| Metadata (title, author) | Verified for EPUB/PDF/DOCX | No language, publisher, date, ISBN/identifier stored |
| Covers | Verified: EPUB cover image; PDF renders page 1 | DOCX/TXT get a generated cover |
| EPUB reading order from the spine | Verified | `linear="no"` items are dropped silently (often notes) |
| EPUB chapter titles from nav/NCX | Verified | **Gap:** TOC entries pointing *inside* a file (`chapter.xhtml#sec2`) are ignored, so several chapters in one file become one chapter; nesting (parts → chapters → sections) is flattened |
| EPUB footnotes | Partial | Footnote *reference marks* are removed; footnote/endnote *bodies* (`aside epub:type="footnote"`, endnote files) are read inline as body text |
| PDF text order, two columns | Verified for one gutter per page | Three columns, sidebars and full-width headings across columns are not handled (the page falls back to visual order) |
| PDF running headers / page numbers | Verified | Edge lines repeating on ≥40% of pages |
| PDF hyphenation, line unwrapping, paragraphs, page-break continuation | Verified | Heuristics in `linesToText`/`joinPages` |
| PDF chapters | Verified: outline (bookmarks) first, then heading detection, then page groups | **Gap:** a chapter can only start at a page boundary; two outline entries on one page collapse to one; deeper outline levels lost |
| PDF footnotes, tables, figure captions | **Missing** | Page-bottom footnotes and table cells are merged into the running text |
| Scanned pages | Verified detection (pages with <20 characters and an image) and an OCR report | No OCR engine; mixed PDFs import the text pages and list the scanned ones |
| Source page / section references | **Missing** | Page boundaries are discarded after joining; EPUB file/anchor not kept. Saved lessons cite chapter only |
| Duplicate imports | **Missing** | Same file can be imported repeatedly |
| Interrupted import | **Missing** | Everything is held in memory until “Save to library”; a closed app loses the import |
| Import quality report | **Missing** | Only the OCR page list and “N chapters · about X min” |
| Chapter preview before saving | **Missing** | The “Book added” sheet edits title/author/category/cover only |
| Chapter editor | Partial | “Fix the text of this chapter” edits text (notes follow their words, `updateChapterText`). No reorder, rename, split, merge or exclude |
| Missing / duplicated passage detection | **Missing** | |
| Never inventing text | Verified by design | Importers only extract; no generation |
| Test fixtures | Partial | All fixtures are generated in tests (clean, controlled). No real-world books, no complex EPUB, no long book, no footnote/table fixture, no non-English text |

## 4. Narration

| Capability | Status | Evidence / notes |
|---|---|---|
| Device voice (Web Speech) | Verified (Chromium with a speech stub) | Real word boundaries when the browser reports them. **Stops when an iPhone locks** (platform limit) |
| Fast natural voice (Piper, ONNX Runtime WebAssembly, background worker) | Verified in Chromium and WebKit CI | 7 English voices chosen by a measured listener-rating model (UTMOS, 5 takes averaged): Amy 4.48 default. 4.7× real time in WebKit CI. One-time 63 MB download per voice |
| Kokoro (higher quality) | **Fails in WebKit** | No result within 9 minutes in Safari's engine; disabled on iPhone. Uses the ONNX Runtime WebGPU/JSEP build (the same build that hung Piper in WebKit before 2.3.3) |
| Voice previews | Verified | Recorded samples, instant, no download |
| Speed, pauses, pronunciation dictionary | Verified | Pronunciations: whole-word replacement before synthesis |
| Names and abbreviations | Partial | Only what eSpeak's phonemizer handles plus the user dictionary; no abbreviation expansion rules (e.g. “Dr.”, “No. 5”, “1990s”) |
| Chapter audio generation, parts, caching, offline playback | Verified | WAV (~2.9 MB/min, a 10-hour book ≈ 1.7 GB) |
| Generation keeps up, waits silently instead of stopping, resumes on return | Verified (CI) | Locked-phone behaviour not verified on a device |
| Background playback, Lock Screen and headphone controls | Implemented, untested on device | Media Session + audio element; Lock Screen artwork for every book (2.5.0) |
| Sleep timer | Verified | |
| Resume position | Verified | Saved every 1.5 s and on pause/hide; restored at the same sentence after restart |
| Seamless chapter transitions | Verified (CI) | Silence bridge while the next part is made |
| Generation while locked (web) | **Unverified** | iOS may suspend the page; design keeps the audio session alive, but only a device test can confirm |

## 5. Read & Listen Together

| Capability | Status | Notes |
|---|---|---|
| Sentence highlight + auto-scroll | Verified | `.chunk.active`, follow-along toggle in Settings |
| Word highlight | Verified for device voice when boundaries arrive; **never estimated** | Natural voices highlight by sentence (no word timing data) |
| Tap a sentence to seek | Verified | |
| Speed changes keep alignment | Verified | Timings are in audio time; playbackRate changes don't move them |
| Sync across chapters, pause/seek | Verified | |
| Stable segment IDs | Partial | Sentences are identified by character offsets in the chapter; offsets are stable unless the text is edited (edits remap notes, regenerate audio). No persistent segment table |
| Accessibility typography | Partial | Text size, light/dark, reduced motion. No dyslexia-friendly font, letter/line spacing or Dynamic Type |

## 6. Learning and AI

| Capability | Status | Notes |
|---|---|---|
| Full-book search with references | Verified | BM25 over 700-character passages, per book |
| Library-wide search | Missing | |
| Explain this / Apply it | Verified **without AI** | Shows the passage, context and related passages; no generated explanation |
| Summaries, questions, flashcards, definitions, action plans | Missing (AI) | `aiAnswerAvailability()` returns unavailable; summary records already carry a source label (`you` / `growth-library` / `ai`) |
| Highlights, notes, bookmarks, Save lesson, quotes review | Verified | Lessons cite book + chapter, not page |
| Growth Library, goals, streaks, XP | Verified | |

## 7. Privacy and content

| Item | Finding |
|---|---|
| Books and notes | Stored only in the browser's storage on the device; no account, no server, no analytics |
| Network | Only the voice files (Hugging Face) and the app itself (GitHub Pages) |
| Copyright | Import of the user's own files only; no sharing of books or generated audio |
| Upgrades | Database upgrades are additive (v1→v5 tested for v1→v3); settings survive app closing; backups export everything |

## 8. What fails or is unproven on iPhone (ranked)

1. **Device voice stops when the phone locks** (Apple's rule for websites). Fast natural voice is the workaround; native app is the real fix.
2. **Natural-voice generation while locked is unproven.** The web app keeps playing pre-made audio and tries to keep the page alive; no device evidence yet.
3. **Kokoro does not work in Safari's engine**; Piper is the only working natural voice on iPhone.
4. **The native iOS app has never been built or run** (no Mac/Xcode, no Apple Developer account).
5. **First natural-voice use downloads 63 MB** (≈19 s at 4 MB/s in tests).
6. **Storage growth**: uncompressed WAV.
7. **Offline restart can't be tested in Safari's engine** with the current test driver (passes in Chromium).

## 9. Test-run note

The browser suite needs Playwright's Chromium build; this container ships a newer one (1243 vs 1194). It was run
through links to the installed browser without changing project files. Results are recorded in the plan's test
section when complete.
