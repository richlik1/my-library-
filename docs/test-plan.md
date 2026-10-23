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

## 2.3.3 — Fast natural voice in Safari’s engine

`.github/workflows/safari-tests.yml` run 39904396120 (commit `eae5d78`), WebKit 26.0 on a macOS runner with iPhone 14
settings, real Lessac voice served locally:

| Check | Result |
|---|---|
| Sound check → fast natural voice (background thread) | **Passed**: ready in 5 s, 8.7 s of speech in 2.7 s (**3.2×** listening speed) |
| A book plays with the fast natural voice | **Passed**: first sound 5.0 s after Play |
| Background thread forced to hang → falls back to the page | **Passed**: switched after 34 s, then 3.9× |
| Kokoro speed test in WebKit | **Failed** (no result in 9 min); labelled “doesn’t work yet” on iPhone |
| Offline reload tests in WebKit | Failed with “WebKit encountered an internal error” on `page.reload()` while offline (Playwright WebKit); passed in Chromium |

Cause of the earlier hang: not proven. The change that fixed it switched from ONNX Runtime’s WebGPU build to its plain WebAssembly build
(also 3× faster in Chromium: 1.4× → 4.1×, and a 11 MB runtime instead of 22 MB). Not yet measured on an iPhone.

## 2.4.0 — Voice start-up, responsiveness, phone experience

Real Lessac voice, local runs (Chromium, iPhone-size viewport) and Safari engine CI (WebKit 26, iPhone 14 settings, macOS runner).
Downloads served at ~4 MB/s to imitate a phone connection.

| Check | Chromium (local) | WebKit (CI) |
|---|---|---|
| First use: Play → first sound, incl. 63 MB download | 21.3 s | 19.7 s |
| Later app opens: Play → first sound (voice started in the background on launch) | 2.0 s (3.9 s without the background start) | 2.1 s |
| After the Home “Get the natural voice” download: Play → first sound | 1.9 s | in CI |
| Device voice offered during the first download, natural voice offered back when ready | Passed | Passed |
| Longest wait for a tap while the voice makes audio | 4 ms (19 ms at 4× CPU slowdown) | 59 ms |
| Pause stops the sound and stays stopped; Forward 30 s, Play work | Passed | Passed |
| A stuck voice is reported, offers the device voice; screen stays responsive | Passed (40 ms at 4× slowdown) | one run 848 ms, earlier 109 ms; progress redraws since limited to 10/s |
| 3.5 minutes of continuous listening across 3 chapters; place restored after restart | Passed (0 stalls) | Passed (0 stalls) |
| Toasts never cover the top buttons | Passed | — |

Measured times include up to ~1 s of test polling (the clock must reach 0:01). Not measured on an iPhone.
