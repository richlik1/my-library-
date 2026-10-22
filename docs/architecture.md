# MY LIBRARY AI — Architecture (V3)

## Principle: keep the working local-first web app, grow by modules

The current app is a single-user, offline-capable PWA (React + TypeScript + IndexedDB) with a Capacitor iOS shell. It
works today without servers or paid services. The smallest viable architecture is **the same app, organised into
modules with clear interfaces**, plus native shells where the web can’t do the job (background speech, CarPlay). No
microservices; no backend until a feature needs one (sync, communities).

```
 iPhone (PWA now · Capacitor native later)  ·  Android (later)  ·  Desktop browser
 ───────────────────────────────────────────────────────────────────────────────
 UI (React): Home · Library · Ask · Discover · Progress · Player
 ───────────────────────────────────────────────────────────────────────────────
 document-ingestion → document-normalization → library-storage ← progress-analytics
                                     │                 │
                         local-search / ai-retrieval   learning-engine
                                     │
 audio-generation (device voice · Kokoro · future engines) → audio cache → audio-playback
                                                       text-alignment ┘
 platform-integrations (Media Session · native iOS speech · CarPlay later)
 ───────────────────────────────────────────────────────────────────────────────
 Storage: IndexedDB (web) · SQLite (native, later)    Optional later: sync API + object storage
```

## Modules and their interfaces (as implemented, with file locations)

| Module | Location | Interface (key functions/types) |
|---|---|---|
| document-ingestion | `src/core/importers/*` | `importFile(file) → ImportedBook {title, author, format, chapters[], cover, ocr?}`; typed `ImportError` codes |
| document-normalization | `src/core/importers/text.ts`, `pdf.ts` | `normalizeText`, `unwrapLines`, `stripHeadersFooters`, `linesToText`, `joinPages`, `detectChapters`, `finalizeChapters` |
| library-storage | `src/core/storage/db.ts`, `backup.ts` | books, contents, files, progress, annotations, settings; `createBackup` / `restoreBackup` |
| audio-generation | `src/core/audio/*` | `NeuralEngine {load, synthesize(text, voice) → {samples, sampleRate}}`; `AudioQueue` (parts, dedupe, retry, pause/cancel); `KokoroEngine` (worker, modes, stuck detection) |
| audio-playback | `src/core/speech/narrator.ts`, `src/core/audio/audioNarrator.ts` | `PlaybackController {play, pause, seek, skip, skipSeconds?, setOptions, setSleepTimer, subscribe}` |
| text-alignment | `src/core/audio/timing.ts`, `ChunkTiming` | sentence timings `{start, end, t0, t1}` produced by generation; word timing only from engine boundary events |
| local-search / ai-retrieval | `src/core/search.ts` | `passages()`, `BookIndex.search(query, {chapter, k})`, `around(chapter, offset)`; `aiAnswerAvailability()` |
| learning-engine | `src/core/habits.ts`, `src/growth/*`, `src/core/summaries.ts` | goals, streaks, XP ledger, achievements; Growth Library catalog and plans; summaries model |
| progress-analytics | `src/core/habits.ts` (`ListeningTracker`), `src/ui/hooks/useHabits.ts` | listening seconds per day/book from real playback |
| collaboration | — | not started (needs accounts) |
| platform-integrations | `src/ui/hooks/usePlayback.ts` (Media Session), `ios/App/App/NativeSpeechPlugin.swift` | lock-screen metadata/actions; native speech in the iOS app |

**Rule for AI features:** every AI feature goes through `ai-retrieval` (passages with exact chapter/offset) and must show
those sources. If no model is available it shows the retrieved passages and says so — never generated text.

## Data model

Existing IndexedDB stores (schema v5): `books`, `contents`, `files`, `progress`, `annotations` (bookmarks, highlights,
notes, lessons; tags, favourite, reviewedAt), `kv` (settings, profile, achievement dates), `growthBooks`, `growthNotes`,
`growthDays`, `growthReviews`, `audio` (meta, parts), `audioData` (WAV bytes), `summaries`, `listening`, `xp`.

Planned additions, only when their milestone starts (each an additive, reversible IndexedDB version bump with an upgrade
test):

| Store | Milestone | Purpose |
|---|---|---|
| `pageMap` (per book: chapter → [{offset, page}]) | M3 | source page for lessons and citations |
| `searchIndex` (per book, persisted passages + term stats) | M2 | library-wide search without rebuilding |
| `flashcards`, `flashcardReviews` | M4 | spaced repetition (FSRS-style), review history, dedupe by review id |
| `learningPlans`, `planMilestones` | M5 | goal → books from the user’s library → sessions |
| `discoveredBooks` (catalog id, source, licence, import status) | M3 | legal free-book discovery |
| Cloud (later): `user_accounts`, `devices`, `sync_log`, `reading_circles`, … | M8+ | only with accounts |

## Speech architecture

1. **Device voices** (instant, free, offline): Web Speech in the PWA; AVSpeechSynthesizer in the native iOS app (works
   with the screen locked there).
2. **Natural voice** (Kokoro-82M, Apache-2.0, on device): generated per chapter in parts, cached as audio files, played by
   a media element (lock screen, background) — the only way the *web* app can play while locked.
3. **Later**: compressed audio cache; other engines behind the same `NeuralEngine` interface (e.g. Piper for speed, other
   languages); optional desktop generation script; optional hosted voices as a paid tier only with explicit approval.

## Scaling path (when, not now)

| Trigger | Change |
|---|---|
| Users want the same library on two devices | Optional account + sync API (e.g. a small Node/Go service or a managed backend), end-to-end encrypted notes/progress; book files stay local unless the user opts in |
| Public launch | Error monitoring (opt-in), privacy policy, data export/deletion, copyright reporting, staged releases via feature flags |
| Hosted AI or voices | Per-user quotas and cost limits; free local mode stays |
| Communities / classrooms | Role-based permissions, moderation, COPPA/FERPA review before schools/minors |
