# MY LIBRARY AI — Repository audit (V3, Phase 0)

Date: 2026-10-22. Commit audited: `2011526` (app version 2.1.2). Auditor: Claude Code, from the repository and test runs in
this environment (Linux, Chromium via Playwright, Node 22). **No Mac, no iOS Simulator, no iPhone, no Android device,
no GPU; Hugging Face is blocked from this environment.** Anything that needs those is marked accordingly.

Status words: **Verified working** (automated test ran and passed here) · **Implemented but untested** (code exists, no
test here) · **Partially implemented** · **Missing** · **Blocked** (cannot be verified or built in this environment).

## 1. Baseline test run

| Suite | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -b` | clean |
| Unit / integration (Vitest, jsdom + fake IndexedDB) | `npm test` | **112 passed**, 12 files |
| End-to-end (Playwright, Chromium desktop + 390×844 phone viewport) | `npm run test:e2e` | **62 passed**, 8 skipped (opt-in real-model tests) |
| Real Kokoro model in Chromium (opt-in, local model files) | `KOKORO_TEST_MODEL_DIR=… npx playwright test e2e/kokoro-real.spec.ts --project=desktop` | 4 passed |

The 8 skipped tests are the 4 real-model tests × 2 viewports; they need the 92 MB model on disk.

## 2. Repository and stack

| Item | Finding |
|---|---|
| Structure | `src/core` (importers, speech, audio, storage, search, habits, recommendations, summaries), `src/growth` (Growth Library catalog, mentor), `src/ui` (React components, hooks), `src/sw.ts` (service worker), `ios/` (Capacitor iOS project), `tests/` (Vitest), `e2e/` (Playwright), `docs/` |
| Size | ~13,800 lines of TypeScript/TSX in `src` |
| Framework | React 19.3, TypeScript 7, Vite 8, vite-plugin-pwa 2 (Workbox, `injectManifest`) |
| Key libraries | pdfjs-dist 6.4 (PDF), jszip (EPUB/DOCX), idb 8 (IndexedDB), kokoro-js 1.2.1 + @huggingface/transformers 3.8 (ONNX Runtime Web) for neural speech, Capacitor 8 (iOS) |
| Platforms | **Web/PWA**: deployed (GitHub Pages). **iOS native**: Capacitor project with a native speech plugin (`NativeSpeechPlugin.swift`, AVSpeechSynthesizer, background audio); **never compiled here** (no Xcode). **Android**: none |
| Deployment | `.github/workflows/deploy-my-library.yml` builds and publishes to GitHub Pages on every push to `main` (14 successful runs). `ios-testflight.yml` exists (manual; needs Apple Developer account secrets — not configured) |
| Database | IndexedDB `my-library`, schema **v5**, upgrade function in `src/core/storage/db.ts` (v1 books/contents/files/progress/annotations/kv; v2 Growth Library; v3 audio + audioData; v4 summaries; v5 listening + xp). Upgrade v1→v3 covered by a test; v4/v5 additive stores, exercised by e2e on fresh databases |
| Authentication | **None** (single user, local only) |
| Document storage | Extracted text (`contents`) and the original file as an ArrayBuffer (`files`, skipped above 30 MB) in IndexedDB |
| Backups | JSON export/import incl. books, progress, notes, settings, Growth Library, listening, XP, summaries; optional original files (base64) |

## 3. Feature audit

### Import and text
| Feature | Status | Evidence | Notes / risks |
|---|---|---|---|
| PDF text extraction | **Verified working** | `tests/pdf.test.ts`, `e2e/app.spec.ts` | PDF.js; Safari stream polyfill; worker fallback; 15 s start timeout |
| EPUB (spine, TOC, cover, DRM refusal) | Verified working | `tests/importers.test.ts` | |
| DOCX, TXT, Markdown, RTF, HTML | Verified working | `tests/formats.test.ts`, `tests/importers.test.ts` | |
| Scanned PDF detection | Verified working | `tests/pdf.test.ts` | Explains OCR is needed |
| OCR | **Missing** | — | No OCR engine. Tesseract.js (free) is a candidate; large download |
| Repeated headers / footers / page numbers | Verified working | `tests/pdf.test.ts` (“removes headers and page numbers”, “keeps chapter headings…”) | Heuristic: edge lines repeating on ≥40% of pages |
| Hyphenation repair, line unwrapping, paragraph rebuild, page-break continuation | Verified working | `tests/text.test.ts`, `tests/pdf.test.ts` | |
| Multi-column reading order | **Verified working** after Milestone 1 (was failing for row-by-row PDFs) | `tests/columns.test.ts` | New `orderColumns()` detects a gutter; pages with a full-width heading across columns aren’t split |
| Original vs normalized text kept separately | Partially implemented | Original file kept; only normalized text is stored as text | Original text recoverable by re-import |
| Mapping normalized text → source page | **Missing** | — | Needed for “source page” on saved lessons |
| Extraction preview and correction | **Verified working** after Milestone 1 | `e2e/core-loop.spec.ts`, `tests/storage.test.ts` | Chapters → “Fix the text of this chapter”; notes follow their words |

### Narration and playback
| Feature | Status | Evidence | Notes / risks |
|---|---|---|---|
| Device voices (Web Speech) | Verified working (Chromium with a speech stub) | `tests/narrator.test.ts`, e2e | Stops when an iPhone locks (iOS behaviour); word boundaries only where the browser reports them |
| Natural voice (Kokoro-82M, free, on device) | Verified working **in Chromium**; **failing on the owner’s iPhone** | real-model e2e; owner screenshots 2026-10-22 | Owner’s phone loaded the model but did not finish a sentence. 2.1.1–2.1.2 add stuck detection and fallback (multi-core → one core → page) with a log; **iPhone result pending** |
| Natural voice speed | Measured here: 0.5–0.6× listening speed with 3 threads, 0.2–0.4× with 1 | `kokoro-real.spec.ts` | Below real time on this CPU; iPhone unmeasured. Long books must be generated ahead |
| Chapter audio cache, parts, resume of interrupted generation, dedupe, retry | Verified working | `tests/audio.test.ts` (19 tests) | 16-bit WAV, ~2.9 MB per minute |
| Storage usage, delete a book’s audio, regenerate / save a chapter | Verified working | `natural-voice.spec.ts`, NarrationPanel | Per-chapter delete exists via Regenerate; no standalone “delete this chapter’s audio” button |
| Background / lock-screen playback (audio element + Media Session) | Implemented but untested on device | code; Chromium e2e only | **Blocked** here (needs iPhone) |
| Native iOS background speech (AVSpeechSynthesizer) | Implemented but untested | `ios/App/App/NativeSpeechPlugin.swift` | **Blocked** (no Xcode); needs Apple Developer account for TestFlight |
| Offline playback of cached audio | Verified working (Chromium) | `e2e/v2.spec.ts` offline reload; cached-audio replay in `natural-voice.spec.ts` | Airplane-mode test on iPhone pending |
| Progress persistence / resume | Verified working | e2e reload tests | Saved every 1.5 s and on pause/hide |
| Sentence highlighting | Verified working | e2e `.chunk.active` | |
| Word highlighting | **Verified working (honest)** after Milestone 1 | `tests/narrator.test.ts`, `e2e/core-loop.spec.ts` | Word highlight only when the voice reports word boundaries; natural voice highlights by sentence (labelled). Before M1 the word was estimated |
| Tap a sentence to play from it | Verified working | e2e “Play here” | |
| Narrator presets, pronunciations, pauses, speed | Verified working | `e2e/v2.spec.ts`, `natural-voice.spec.ts` | |
| Sleep timer (time / end of chapter) | Verified working | `tests/narrator.test.ts` | No volume fade |
| Background sounds (generated) | Verified working (Chromium) | `e2e/learning.spec.ts` | Lock-screen behaviour unverified |

### Learning, AI, search
| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Bookmarks, highlights, notes | Verified working | e2e | |
| Save Lesson while listening | Verified working | `e2e/habits.spec.ts` | Stores book, chapter, offsets, quote, tags, date; **no source page** |
| Quotes collection (search, tags, favorites, export, review) | Verified working | `e2e/habits.spec.ts` | |
| Per-book search with citations (BM25) | Verified working | `tests/search.test.ts`, `e2e/learning.spec.ts` | In-memory index, built per open book |
| Library-wide search | **Missing** | — | Milestone 2 |
| Explain This / Apply It | Verified working **without AI** | `e2e/learning.spec.ts` | Shows passage, context, related passages; no generated explanation |
| Local AI model (answers, summaries, quizzes, comparisons) | **Blocked** | — | No model downloadable/testable here; all AI-only features labelled unavailable |
| Flashcards / spaced repetition | **Missing** | — | |
| Learning plans from goals | Partially implemented | Growth Library daily block for its 21 books | Not for arbitrary libraries |
| Goals, streaks, XP, achievements | Verified working | `tests/habits.test.ts`, `e2e/habits.spec.ts` | Listening time measured from real playback |
| Recommendations (own library) | Verified working | `tests/recommend.test.ts` | |
| Legal free-book discovery | **Missing** | — | Candidates: Project Gutenberg, Standard Ebooks, Open Library (free, public-domain/legal) |
| Multilingual narration | **Missing** | Kokoro voices offered are English only | |
| Translation | Missing | — | |
| Cross-device sync, accounts | Missing (by design for MVP) | — | |
| Community, creators, classrooms | Missing (by design) | — | |
| CarPlay / Android Auto | Missing; Blocked here | — | Needs native builds, entitlements |

### Accessibility
| Item | Status | Evidence |
|---|---|---|
| Labelled controls | Verified (tests drive the UI by role and accessible name) | all e2e |
| Light / dark / system theme, reduced motion | Verified working | `e2e/v2.spec.ts`; CSS media queries |
| Adjustable reading text size | Verified working | Settings |
| Dynamic Type (iOS system text size) | Partially implemented | UI sizes in px; not tied to system setting |
| VoiceOver | Implemented but untested | needs iPhone |

## 4. Known defects and risks (ranked)

1. **Natural voice does not work on the owner’s iPhone (open).** Model loads, first sentence never finishes. Mitigations shipped (2.1.1/2.1.2); root cause unknown until the in-app voice log comes back. Highest priority: without it, locked-screen listening in the web app isn’t possible.
2. **Natural voice is slower than real time on tested hardware** (0.5× here). Users must generate ahead; long chapters stall.
3. ~~Word highlighting for natural voice is estimated~~ — fixed in Milestone 1.
4. **Storage growth**: WAV audio ~2.9 MB/min (a 10-hour book ≈ 1.7 GB). Needs compressed audio (AAC/Opus) or limits before wide use.
5. **iOS native app never built or tested**; App Store path requires a Mac/cloud Mac and an Apple Developer account ($99/yr).
6. **No page mapping** for saved lessons; PDFs cite chapter only.
7. **Cross-origin isolation via service worker** (2.1.0) changes how every page loads; verified in Chromium only.
8. **Safari can evict website data** if the app isn’t installed to the Home Screen; the app requests persistent storage and offers backups.

## 5. Security review (current single-user app)

| Area | Finding |
|---|---|
| Uploaded documents | Parsed in the browser; PDF.js with `isEvalSupported: false`; EPUB/HTML text extracted, scripts not executed; original files >30 MB not stored. No server, so no path traversal surface |
| External requests | Only the Kokoro model and voice files from Hugging Face (when Natural voice is used). No analytics, no accounts |
| Secrets | None in the repository (checked: no API keys; workflows use GitHub-provided tokens only) |
| Private books | Never uploaded or committed; stored in the device’s browser storage |
| Content rights | Users import their own files; sharing is limited to short excerpts after confirmation |
| Risks to address before accounts exist | Authentication, encryption at rest for cloud data, deletion/export, abuse handling — see `architecture.md` |

## 6. After Milestone 1 (same day)

`npm test`: **116 passed** (13 files). `npm run test:e2e`: **66 passed**, 8 skipped (opt-in real model). New:
`e2e/core-loop.spec.ts` (the full workflow, offline restart included), `tests/columns.test.ts`, chapter-correction and
word-timing unit tests. Details in `docs/test-plan.md`.
