# MY LIBRARY AI — Testing strategy (V4)

Principle: a result is reported as **Passed** only when an automated test or a recorded device check produced it.
Everything else is **Not tested**, with the reason. No invented results.

## 1. Test layers

| Layer | Tool | Where | Gate |
|---|---|---|---|
| Typecheck, unit, integration | `tsc`, Vitest (jsdom + fake IndexedDB) | every push | required |
| Browser end-to-end | Playwright, Chromium desktop + 390×844 | CI (ubuntu) | required |
| Safari engine end-to-end | Playwright WebKit 26, iPhone 14 settings | CI (macOS) | required voice/sound/listening subset; rest informational |
| Real voices | Piper Amy downloaded in CI; long-listening, start-up, responsiveness tests | CI (macOS, WebKit) | required |
| Voice quality | `scripts/voice-lab` (UTMOS, 5 takes, speed, size) | on demand | informs voice choices; not a person's judgement |
| Import accuracy | fixture corpus + ground truth (§2) | CI | required (thresholds in plan) |
| Native iOS | Xcode build + XCUITest in the iOS Simulator | CI (macOS) after D2 | required once it exists |
| Device | checklist (§4) on your iPhone via TestFlight | after D1 | recorded by you; I can't run it |

## 2. Import fixture corpus

Each fixture has a ground-truth file: ordered chapter titles and the plain text per chapter (or a word list for
licensed tests). Measured per fixture: chapter-order match, token-sequence recall/precision vs ground truth (LCS on
normalised words), leftover header/page-number lines, footnotes in body text, report flags vs expected flags.

| Fixture | Source | Checks |
|---|---|---|
| Clean EPUB | Public-domain book (e.g. Standard Ebooks / Project Gutenberg), EPUB 3 | spine/TOC order, metadata, cover, completeness |
| Complex EPUB | Generated: nested TOC, two chapters per file (anchors), footnotes (`noteref`/`aside`), `linear="no"` notes, images with alt text, tables | splitting at anchors, notes separated, hierarchy |
| Standard PDF | Generated + a public-domain PDF | headers, page numbers, hyphenation, outline chapters, page refs |
| Two-column PDF | Generated (column-by-column and row-by-row; already exist) + 3-column + full-width heading variant | reading order |
| Scanned PDF | Generated image-only pages | OCR needed, clear message |
| Mixed scanned/text PDF | Generated | OCR pages listed, text pages imported, gap flags |
| Long book | Public-domain novel (≥ 150k words) as EPUB and PDF | time, memory, resumable draft, completeness |
| Footnotes and tables | Generated PDF/EPUB/DOCX | footnotes moved to Notes; tables marked |
| Malformed | truncated zip, broken XML, wrong extension, empty, password PDF | clear errors, no crash, partial-import report where possible |
| Non-English | Public-domain French/Spanish/German texts; one RTL (Arabic) sample | language detection, normaliser off for unsupported languages, no mangled characters |
| Order traps | Generated: TOC order ≠ spine order; chapter numbers out of sequence | report flags `order` |
| Duplicates | Generated: a repeated chapter | report flags `duplicate`; re-import of same file detected |

Only public-domain or generated material goes into the repository. Your own books are never committed.

## 3. Automated behaviour tests (added per phase)

- Phase 1: review screen shows first/last paragraph per chapter; chapter editor (reorder/rename/split/merge/exclude)
  changes the derived chapters and is undoable; original file unchanged (hash); migration from a v5 database keeps
  books, notes, bookmarks, progress and audio; interrupted import resumes.
- Phase 2: normaliser unit tests (numbers, dates, abbreviations, Roman numerals); compressed audio decodes and its
  duration matches timings within 20 ms; whole-book generation pause/resume; Kokoro WebKit spike result recorded.
- Phase 3: highlight = segment containing the audio time after play, pause, seek, ±30 s, speed 0.75–2×, chapter
  change, restart; word highlight only when `wordSource` is set; auto-scroll pause/resume.
- Phase 4: grounding set (≥ 50 questions with known answer passages across fixture books): citation present 100%,
  citation contains answer ≥ 90%, “not in the book” answered as such; generated text labelled.
- Phase 5: performance budgets (start, import time, memory, long tasks) in CI with CPU throttling; accessibility
  checks (axe) on every screen.

## 4. iPhone device checklist (needs D1; you run it, results recorded in `docs/TESTING.md`)

Import reliability (3 real books) · narration quality (listen 5 min per voice) · lock-screen playback 30 min ·
Bluetooth headphones play/pause/skip · app switching · incoming call interruption and resume · highlight sync while
reading · battery use per hour of narration (Settings → Battery) · memory (no reloads after 1 hour) · airplane mode
playback · backup export and restore on a fresh install.

The app's **Listening log** and **Sound check** produce copyable reports for each of these, so results can be sent
back as text.

## 5. Release rule

The live app updates only when the required CI checks pass. Each phase ends with a report listing passed, failed and
not-tested items, including what was not checked on a real iPhone.
