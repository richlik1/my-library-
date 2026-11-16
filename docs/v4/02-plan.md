# MY LIBRARY AI — Implementation plan (V4)

Goal: *import a book, verify its chapter order, pick a natural narrator, listen while the exact passage is highlighted,
pause to understand, save what you learn, and continue from the same place later.*

Rules for every phase: nothing working is removed; the existing library, notes, bookmarks, progress and downloaded
audio survive every upgrade (additive database migrations, tested); nothing is published to the live app until the
Chromium and Safari-engine (WebKit) test suites pass; no deploys, purchases, paid APIs or data deletion without your
approval. Each phase ends with a test report: what passed, what failed, what was not tested on an iPhone.

## Decisions that need your approval (nothing below depends on them until marked)

| # | Decision | Needed for | Cost | Recommendation |
|---|---|---|---|---|
| D1 | **Apple Developer account** to install the native iOS app on your iPhone (TestFlight) | Phase 2b, device tests | $99 / year | Yes. The native app is the only way to get reliable locked-screen narration, Apple's Premium voices and exact word highlighting on iPhone |
| D2 | **Build the iOS app on GitHub's macOS runners** (already used for Safari tests) | Phase 2b | Free for public repos (the repo is public); private repos use paid minutes | Yes |
| D3 | **Optional cloud AI** (Claude API) for explanations, summaries, quizzes — off by default, per-request opt-in, only passages you select are sent | Phase 4 option C | Pay per use, see design §6 (e.g. a chapter summary ≈ $0.002 with Claude Haiku 5.5) + needs an API key and a small server or your own key on the device | Decide after Phase 4's on-device evaluation |
| D4 | **Optional server-side narration** | Not planned | Paid per character + privacy cost (book text leaves the device) | No, unless on-device quality is judged insufficient after device tests |

## Phase 1 — Import accuracy and chapter order (first)

Deliverables

1. **Source map**: every paragraph keeps where it came from (PDF page; EPUB file + anchor; DOCX/TXT paragraph index).
   Saved lessons and search results show page numbers for PDFs.
2. **EPUB**: split chapters at table-of-contents anchors inside a file; keep the TOC hierarchy (part → chapter →
   section) as levels; record language; separate footnotes/endnotes (`epub:type` footnote/endnote/aside and
   `linear="no"` notes files) into a Notes section that is not read aloud by default.
3. **PDF**: chapters may start mid-page (outline destinations with y-position); nested outline levels; page-bottom
   footnotes (smaller font + marker) moved to Notes; table regions detected (aligned columns) and marked as tables
   (read as “Table: …” rows, or skipped — your setting); multi-column pages beyond two columns; full-width headings
   kept on column pages.
4. **Import draft** (resumable): an import is saved in steps (per 20 PDF pages / per EPUB file) to IndexedDB; an
   interrupted import resumes or can be discarded.
5. **Duplicate check**: SHA-256 of the file plus title/author/identifier; offer “open existing”, “replace”, or
   “import as a copy”.
6. **Import quality report** (before saving): chapter count, words per chapter, pages without text (OCR needed),
   suspected order problems (chapter numbers out of sequence, TOC vs detected headings disagree), suspected duplicate
   passages (repeated shingles), suspected missing text (gaps in page/file coverage), and a confidence level per
   chapter (high / check / low) with the reason.
7. **Review screen**: for each chapter, its first and last paragraph; tap to open the full text.
8. **Chapter editor** (no change to the original file): reorder, rename, split at a paragraph, merge with next,
   exclude/include. Stored as an edit list on top of the extracted text, so it can be undone or reset.
9. **OCR** for flagged pages: on iPhone native app, Apple Vision (on device, free); on the web, optional Tesseract.js
   per page (on device, ~15 MB download, slower), only when you ask. OCR text is labelled as OCR in the report.

Acceptance (automated, on the fixture corpus in the testing strategy)

- Chapter order matches the ground truth for 100% of fixture books with a correct TOC/outline, and the report flags
  every fixture with a deliberately wrong order.
- Text completeness: ≥ 99% of ground-truth words present, in order (token-sequence recall), for text-based fixtures;
  0 invented words (precision 100% apart from normalisation).
- Running headers/page numbers: 0 left in clean fixtures.
- Footnotes: moved to Notes in footnote fixtures, never mid-sentence in body text.
- Duplicate import detected for the same file; interrupted import resumes at the last saved step.
- Existing libraries open unchanged after the upgrade (migration test from a v5 database with books, notes, audio).

## Phase 2 — Narration quality and reliability

2a (web app, no approvals needed)

1. Text normalisation for speech: abbreviations, numbers, dates, currency, Roman numerals, initials, units, with a
   per-book pronunciation dictionary and an import-time “unusual names” list to review.
2. Paragraph/heading/section pauses tuned per voice; consistent loudness across chapters (already per sentence).
3. Compressed audio cache (AAC/Opus via WebCodecs where available, WAV fallback): target ≥ 5× smaller.
4. “Make the whole book” with progress, pause/resume, battery-aware (pause under 20% unless charging).
5. Kokoro: retry on the plain WebAssembly ONNX Runtime build (the fix that made Piper work in WebKit). Offer it on
   iPhone only if it passes the WebKit CI voice tests and is faster than real time; otherwise keep it desktop-only.
6. Voice studio: previews, ratings, accents, per-book voice, pauses, dictionary.

2b (native iOS app, needs D1 + D2)

1. Build the Capacitor app in CI for the iOS Simulator; XCUITest smoke tests.
2. Native narration with AVSpeechSynthesizer (Apple's Premium/Enhanced voices): plays locked, in the background,
   with Lock Screen and headphone controls, call interruptions, Bluetooth routing.
3. Native rendering to audio files with `AVSpeechSynthesizer.write`; where iOS reports word markers during rendering,
   offline chapter audio **with real word timings** (otherwise sentence timings).
4. Piper/Kokoro through the same native audio player for consistent controls.
5. TestFlight build on your iPhone.

Acceptance: WebKit CI voice suite stays green; 10 minutes continuous locked playback on a device (D1); interruption by a
call resumes correctly; Bluetooth play/pause works; start-up ≤ 3 s when the voice is downloaded.

## Phase 3 — Read & Listen Together

1. Persistent **segment table** per chapter version: stable IDs for paragraphs and sentences; edits create a new
   version and a mapping, so notes, positions and audio stay linked.
2. **Timing metadata** stored per audio part: sentence times (all voices) and word times only from a real source:
   Web Speech boundaries, AVSpeechSynthesizer word callbacks / write markers (native), or a Piper model exported
   with phoneme durations (spike: re-export ONNX with the duration output; ship only if alignment error < 50 ms on
   a labelled sample). Otherwise sentence-level, labelled as such.
3. Reader: word + sentence highlight, auto-scroll with a “return to the spoken text” button when you scroll away,
   tap-to-seek, keeps sync through pause, seek, speed changes and chapter changes.
4. Accessibility: dyslexia-friendly font option (e.g. Atkinson Hyperlegible or OpenDyslexic, both free licences),
   letter/word/line spacing, iOS Dynamic Type in the native app, VoiceOver labels audit, high contrast.

Acceptance: automated sync tests (highlight equals the segment whose time range contains the audio time, ±1 segment,
after seek/pause/speed/chapter change); word highlight never shown without a real timing source (test).

## Phase 4 — Comprehension and learning (grounded)

Order: (A) features that need no generative model, then (B) on-device models, then (C) optional cloud (D3).

- A: library-wide search; semantic search with an on-device embedding model (~25 MB); vocabulary lookups from an
  offline dictionary (e.g. WordNet-based, free licence); flashcards from your highlights with spaced repetition;
  chapter outline and key-sentence extraction (extractive, quoted, with references).
- B: on-device language model for explain/summarise/questions: Apple Foundation Models in the native app on
  supported devices (free, private), or a small WebGPU model in the browser (1–2 GB download) — evaluate quality,
  speed and memory on your iPhone before offering it.
- C: optional Claude API with explicit opt-in per request, sending only retrieved passages.
- Every generated text is labelled “AI interpretation”, cites chapter + page/passage, and links to the source; answers
  with no supporting passage say so. Explanations and summaries can be listened to with the chosen voice.

Acceptance: grounding evaluation set (questions with known answer passages from fixture books): ≥ 90% of answers cite a
passage that contains the answer; 0 answers without a citation; refusal when the book doesn't contain the answer.

## Phase 5 — iPhone experience, accessibility, performance

Screens: Home & Continue Listening · Bookshelf · Import Center · Import Quality Review · Book Details · Chapter List ·
Read & Listen Player · Voice Studio · AI Reading Assistant · Highlights & Notes · Learning Dashboard · Settings &
Backups. Performance budgets: app start < 2 s on a mid-range iPhone (cached), import 300-page PDF < 60 s, memory
< 300 MB while narrating, no main-thread task > 100 ms during playback.

## Order and size (rough)

| Phase | Size | Can start |
|---|---|---|
| 1 Import | largest (≈ 3–4 build-and-test cycles) | now |
| 2a Narration (web) | medium | after 1, or in parallel for Kokoro spike |
| 2b Native iOS | medium, gated | after D1/D2 |
| 3 Read & Listen | medium | after 1 (segment table) |
| 4 Learning | medium–large | A after 1; B/C after evaluation |
| 5 Polish | ongoing | each phase includes its screens |
