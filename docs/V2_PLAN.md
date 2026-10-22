# MY LIBRARY AI V2 — Audit and plan

Started 2026-10-22. Status words: **Working and tested** (an automated test ran and passed here), **Implemented but
unverified** (code exists, no test here or needs an iPhone), **Partially implemented**, **Missing**, **Blocked**.

## Phase 0 — Audit (before V2 changes)

Baseline at commit `d2e8d73`: `npm test` 93 passed; `npm run test:e2e` 36 passed, 2 skipped (opt-in real-model tests).
Typecheck clean.

| Feature | Current status | Evidence | Required work | Priority |
|---|---|---|---|---|
| Framework / architecture | React 19 + TypeScript + Vite PWA; Capacitor iOS project; hash routing; IndexedDB (`idb`) | `src/ui`, `src/core`, `ios/` | Keep | — |
| Navigation | Partially implemented: top segmented nav (Audiobooks / Growth Library / Mentor); no tabs; player is a separate page | `SectionNav.tsx`, `useRoute.ts` | Four tabs, Home screen, persistent mini-player | P1 |
| Playback continues while browsing | Missing: leaving the player page stops narration | `usePlayback` lives inside `Player` | Move playback to an app-level session | P1 |
| Import PDF/EPUB/DOCX/TXT/RTF/HTML, scanned-PDF detection | Working and tested | `tests/importers*.test.ts`, `e2e/app.spec.ts` | Keep | — |
| Device voice narration (Web Speech) | Working and tested (Chromium stub); stops when iPhone locks (iOS limit) | `tests/narrator.test.ts` | Keep as instant fallback | — |
| Natural voice (Kokoro) | Partially implemented: worked, but the whole chapter had to be generated before any sound (minutes per chapter at 0.3× real time), and the model ran on the page's main thread | Benchmarks below | Start after the first sentence; background thread | **P0 (owner report: "isn't working, takes long")** |
| Lock Screen / background audio for generated audio | Implemented but unverified on iPhone | Media Session code; e2e in Chromium only | Owner checklist (docs/TESTING.md) | P1 |
| Offline books and cached audio | Working and tested (Chromium) | e2e reload/resume from cache; service worker precache | Keep | — |
| Progress save/resume | Working and tested | e2e resume tests | Resume from Home | P1 |
| Bookmarks, highlights, notes | Working and tested | e2e, storage tests | Quote collection builds on this (Phase 2) | P2 |
| Categories, search, favorites, sort | Working and tested | e2e | Move into Library tab | P1 |
| Growth Library (21 books), quizzes, daily block, weekly review | Working and tested | `e2e/growth.spec.ts` | Reach from Discover | P1 |
| Mentor | Working and tested (rule-based, offline; not an AI model) | `tests/mentor.test.ts` | Reach from Discover; keep labelled as offline plans | P1 |
| Narrator presets | Missing | — | Phase 1 | P1 |
| Quick Listen | Missing | — | Phase 1 foundation (no fake summaries) | P1 |
| Light theme | Missing (dark only) | `styles.css` | System / dark / light | P1 |
| Reduced motion | Partially implemented | one `prefers-reduced-motion` rule | Cover all new animation | P1 |
| VoiceOver labels | Partially implemented: most buttons labelled | aria-labels in components | Label tabs, mini-player, presets; test with VoiceOver on iPhone (owner) | P1 |
| Dynamic Type | Partially implemented: adjustable reader text size; UI uses fixed px | `styles.css` | Respect browser text size where possible | P2 |
| Haptics | Missing | — | Native app only (Safari has no web haptics) | P2 |
| Daily goals, streaks, XP, achievements | Missing (Growth daily block exists) | — | Phase 2, needs real listening-time ledger | P2 |
| Quote collection | Partially implemented (highlights with quote text) | `Annotation.quote` | Phase 2 | P2 |
| AI companion, recap, summaries | Missing; no local language model in the app | — | Phase 3; evaluate WebLLM / llama.cpp; retrieval-only fallback | P3 |
| Book club, recommendations | Missing | — | Phase 4 (deterministic recommendations first) | P4 |
| Soundscapes | Missing; no licensed audio assets | — | Phase 5 (self-made or CC0 audio) | P5 |
| iOS native build | Implemented but unverified (no Mac here) | `ios/` | Blocked here: needs Xcode | — |

### Natural voice measurements (this machine: 4-core x86 Linux, Chromium, real Kokoro q8 model)

| Setup | Result |
|---|---|
| Before: page thread, 1 thread, whole chapter first | ~117 s before the first chapter was ready (short test book, includes model start) |
| Background worker, 1 thread | 0.3× listening speed (10.3 s of speech in ~39 s); model start 7 s |
| Background worker, 3 threads (cross-origin isolated page) | 0.4× listening speed (10.3 s in 24.4 s) |
| After: worker + parts (first part = 1 sentence) | **First sound 12.1 s after Play** on first use, model start included (was: the whole chapter first) |
| Python ONNX Runtime, 4 threads (reference) | 2.2× listening speed |

Not measured on an iPhone. Settings → **Test natural voice speed** now measures it on the device.

Multi-threading needs special page headers that GitHub Pages can't send; a service worker can add them, but this changes
how every page load works in Safari and can't be tested here. **Deferred until the iPhone speed test shows it is needed.**

## Plan

**Phase 1 (this round)** — highest-impact usability first
1. Natural voice fix (done): background worker, play after the first sentence, part-by-part generation, automatic
   WebGPU→processor fallback, on-device speed test.
2. App-level playback session: narration keeps going while you browse; persistent mini-player; full-screen player.
3. Four tabs: Home (Continue Listening, Recently Added, Quick Listen, Upload), Library (All, Currently Reading,
   Completed, Favorites, categories, search), Discover (from your own library + Growth Library + Mentor), Progress
   (real numbers only). Settings behind the profile button.
4. Narrator presets (voice, speed, pauses, engine), one-tap switching, remembered per book.
5. Quick Listen foundation: summary data model; listen to existing summaries (Growth Library summaries for matching
   books) and to your own highlights; AI overview clearly shown as not available (no model yet).
6. Accessibility: light/dark/system theme, reduced motion, labelled controls, large touch targets.

**Phase 2** — listening-time ledger from real playback, daily goal, optional streaks, XP ledger with levels,
achievements, quote collection. **Phase 3** — local AI evaluation, retrieval with citations, recap, summaries.
**Phase 4** — book club, recommendations. **Phase 5** — soundscapes and iPhone performance.

## Phase 1 results (2026-10-22)

| Acceptance criterion | Status | Evidence |
|---|---|---|
| Importing and playing books still works | Working and tested | `e2e/app.spec.ts`, `e2e/natural-voice.spec.ts` (48 e2e passed) |
| A book can be resumed from the Home screen | Working and tested | `e2e/v2.spec.ts` “playback keeps going while browsing…” |
| Playback continues across tabs; mini-player opens the full player | Working and tested (Chromium) | same test |
| Playback controls remain accessible (labelled buttons, 44 px+ targets) | Working and tested for labels (tests drive controls by accessible name); VoiceOver itself **not tested** (needs iPhone) | e2e selectors by role/name |
| Narrator presets persist after restarting | Working and tested | `e2e/v2.spec.ts` presets test (reload) |
| All navigation destinations function | Working and tested | v2 + growth tests visit Home, Library, Discover, Progress, Settings, Growth Library, Mentor |
| No regression in background audio | Implemented but unverified on iPhone (media element + Media Session unchanged; generated parts are joined into one file per stretch) | owner checklist |
| No regression in offline playback | Working and tested (Chromium: reload plays cached audio) | `natural-voice.spec.ts` |
| Quick Listen: no fabricated summaries; AI shown as unavailable | Working and tested | `e2e/v2.spec.ts` Quick Listen test |
| Light/dark/system theme | Working and tested (setting persists); contrast checked by eye on screenshots | `e2e/v2.spec.ts` |
| Reduced motion | Implemented: all new animations off under `prefers-reduced-motion` | `styles.css` |
| Haptics | Blocked on the web app (Safari has no web haptics); possible in the native app later | — |
| Recommendations explainable and can be turned off | Working and tested | `tests/recommend.test.ts`, `e2e/v2.spec.ts` |

Not done in Phase 1 (by design): goals, streaks, XP, achievements (Phase 2); AI features (Phase 3).

## Phase 2 results (2026-10-22)

| Acceptance criterion | Status | Evidence |
|---|---|---|
| Daily goals reflect real listening (not paused, not generating, no throttled background timers) | Working and tested | `tests/habits.test.ts` (tracker: speed, locked-phone jump, skips, pauses, late timers), `e2e/habits.spec.ts` (3.5 s played → 2–5 s saved; pause adds nothing) |
| Goal options 5/10/15/20/30/custom; Home shows “12 of 20 minutes completed.” / “You finished your reading goal today.” | Working and tested | `e2e/habits.spec.ts` |
| Weekly consistency, monthly total, optional forgiving streak (one rest day a week) | Working and tested | `tests/habits.test.ts` |
| XP survives restarts; ledger is auditable (Progress → How XP is earned) | Working and tested | XP stored in IndexedDB `xp` store; reload in e2e |
| Rewards can’t be duplicated | Working and tested | dedup ids (`book:<id>`, `quiz:<id>`, `review:<date>`, `listen:<date>` updated not added) |
| Levels from a formula (60 × (level−1)^1.6), named for 1–5, unlimited after | Working and tested | `tests/habits.test.ts` |
| Achievements: First Book, First Hour, Five-Day Habit, First Completed, Ten Completed, Knowledge Collector | Working and tested | unit + e2e |
| Quote references point to the source; open in book jumps to the passage | Working and tested | `e2e/habits.spec.ts` |
| Save while listening (Save = “Save Lesson”) without interrupting narration | Working and tested | `e2e/habits.spec.ts` |
| Quotes: search, filter by book/tag, favorites, notes, tags, export (Markdown), quote card, limited-excerpt sharing with confirmation | Working and tested (share sheet itself not testable here) | `e2e/habits.spec.ts` |
| All progress works offline | Working and tested (all local IndexedDB; included in backups) | — |
| Gamification optional | Working and tested (switch on Progress) | `e2e/habits.spec.ts` |
| Page references for PDFs | Missing: quotes show chapter only; page positions aren’t kept at import | — |

“Explain This” and “Apply It” while listening need a local AI model: Phase 3.
