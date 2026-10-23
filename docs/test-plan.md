# MY LIBRARY AI — Test plan (V3)

Status words: **Passed** · **Failed** · **Blocked** (cannot run in this environment) · **Not tested**.
Environment for automated runs: Linux, Chromium (Playwright) at desktop and 390×844 phone viewports, Node 22. The device
checklist is in `docs/TESTING.md` (owner, iPhone).

## How to run

| Suite | Command |
|---|---|
| Typecheck | `npx tsc -b` |
| Unit + integration | `npm test` |
| End-to-end (browser) | `npm run test:e2e` |
| Real voice model (opt-in) | `KOKORO_TEST_MODEL_DIR=/path/to/Kokoro-82M-v1.0-ONNX npx playwright test e2e/kokoro-real.spec.ts --project=desktop` |

## Milestone 1 — core loop (results 2026-10-22)

| Feature | Implementation | Tests | Device verification | Remaining issues |
|---|---|---|---|---|
| Whole workflow: import PDF → cleaned text → natural voice → play → sentence highlight → save lesson → offline restart → resume from cache | existing modules, wired; `e2e/core-loop.spec.ts` | **Passed** (desktop + phone viewport) | Not tested (iPhone) | Natural voice not yet working on the owner’s iPhone (see audit) |
| Running headers, page numbers, hyphenation | `pdf.ts`, `text.ts` | **Passed** (`core-loop`, `pdf.test.ts`, `text.test.ts`) | — | |
| Two-column PDFs (column-by-column and row-by-row) | `orderColumns()` in `pdf.ts` (new) | **Passed** (`tests/columns.test.ts`) | — | Full-width headings across columns disable the column split on that page |
| Honest highlighting: word only from real voice word events; otherwise sentence | `NarratorState.wordTiming`; Reader follows by sentence | **Passed** (`narrator.test.ts`, `core-loop` asserts no word highlight for natural voice) | Not tested | Natural voice has sentence timing only (no word timestamps) |
| Correct a chapter’s text; notes follow their words; audio regenerates; search index refreshed | `updateChapterText()`, Edit sheet | **Passed** (`storage.test.ts`, `core-loop`) | — | Notes whose text was deleted stay at the nearest place (reported to the user) |
| Save Lesson persists after restart and offline | annotations store | **Passed** (`core-loop`) | Not tested | No source page yet (M3) |
| Resume after restart at the same sentence | progress store | **Passed** (`core-loop`) | Not tested | |
| Cached audio plays offline without regeneration | audio cache + service worker | **Passed** (`core-loop`: 0 generation calls after offline restart) | Airplane mode on iPhone: Not tested | |
| Delete cached audio without deleting the book | NarrationPanel | **Passed** (`natural-voice.spec.ts` regenerate path) | — | No dedicated per-chapter “delete audio” button |
| Interrupted generation recovers | queue parts | **Passed** (`audio.test.ts` “only makes missing parts”) | — | |
| Lock screen / background playback | audio element + Media Session | Blocked here | **Not tested** | Owner checklist items 3–9 |

## Acceptance tests by milestone (to be written when each starts)

| Milestone | Acceptance tests |
|---|---|
| M1b Natural voice on iPhone | Owner: Settings speed test completes and the log shows a working mode; first sound ≤ 30 s; play locked for 10 min |
| M2 Ask + library search | Exact known passage found across 3 books; opens the right chapter/offset; works offline; deleting a book removes its entries; 50-book index stays responsive (timed) |
| M3 Free books + page map | Public-domain EPUB imported from a catalog end to end; licence shown; PDF lesson shows correct page on a fixture |
| M4 Flashcards | Scheduling against reference intervals; offline reviews; duplicate review events rejected |
| M5 Learning plans | Only books in the library are used; progress updates from real listening |
| M6 Native iOS | Owner checklist 1–23 on device; interruptions (calls, Siri), Bluetooth, airplane mode |
| M7 Local AI | Grounding evaluation set reviewed by hand: every claim cites a retrieved passage; unavailable state when no model |

## Import reliability target

Target: ≥95% successful imports on a defined fixture set of supported, readable documents. Current automated fixture set:
generated PDFs (single column, two column ×2, headers/footers, hyphenation, outline, page groups, scanned, partly
scanned, password/corrupt), EPUB (spine/TOC/cover/DRM), DOCX, TXT, Markdown, RTF, HTML — **all passing**. A set of real
public-domain books (Project Gutenberg EPUB/PDF) should be added in M3, since generated fixtures are cleaner than real files.

## 2.2.1 — “Audio still not working” (owner report)

| Change | Tests | Device verification |
|---|---|---|
| Audio Session API set to “playback” (Safari 17+), so Silent mode no longer mutes speech/Web Audio | — (Chromium has no Audio Session API) | **Not tested** — owner’s screenshots show Silent mode on |
| Settings → Sound check: beep (audio file), device voice, natural voice; copyable results | `e2e/sound.spec.ts` **Passed** | Owner to run |
| Player offers “Use device voice instead” when natural voice fails | `e2e/sound.spec.ts` **Passed** | Not tested |

## 2.3 — Fast natural voice (Piper)

Real models, run by `.github/workflows/voice-tests.yml` on a GitHub-hosted runner (Chromium, 4 vCPU), run #1, 2026-10-23:

| Engine | Speed (speech made per second of work) | First sound after Play, first use | Result |
|---|---|---|---|
| Piper Lessac medium, 1 thread | **1.4×** (8.9 s of speech in 6.1 s) | **9.0 s** | Passed |
| Kokoro q8, 3 threads | 0.4× (10.3 s in 26.0 s) | 13.0 s | Passed |
| Kokoro stuck-mode fallback | switched threads → single, completed | — | Passed |

Not measured on iPhone. Built-in presets now use Piper.
