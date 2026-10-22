# MY LIBRARY AI — Implementation plan

The goal: **upload a book, pick a voice, press play, lock the iPhone and keep listening. When you come back, the app remembers
where you stopped.** Everything else builds on that.

Status words used in this document: **passed** (an automated or manual test ran and passed), **failed**, **blocked** (cannot be
run in the available environment), **not run** (could run, hasn't yet).

---

## 1. Development environment (inspected 2026-10-21)

| Item | Finding | Consequence |
|---|---|---|
| OS | Linux (Ubuntu 24.04), x86-64, 4 CPU cores, 15 GB RAM, no GPU | Web app, unit and browser tests run here |
| Xcode / iOS Simulator | **Not available** (needs macOS) | Native iOS code can be written but **not compiled or run here** |
| Physical iPhone | Not connected; the owner tests on an iPhone (iOS 18.7, Safari 26.6) | Device behavior (lock screen, Bluetooth, calls) must be tested by the owner |
| Browser for tests | Chromium (Playwright) | Safari-only behavior is emulated where possible, otherwise not testable here |
| Network | npm and PyPI reachable; Hugging Face, GitHub releases and jsDelivr **blocked** | Neural voice models can't be downloaded the normal way here |
| Local AI hardware | CPU only, 15 GB RAM | Small LLMs could run slowly here; not representative of an iPhone |

### Kokoro benchmark (measured in this environment)
Using the Kokoro-82M q8 ONNX weights (sha256 `fbae9257…a1478`, obtained from an npm mirror for testing only) with `kokoro-onnx`
on this 4-core CPU:

| Voice | Audio length | Time to generate | Speed | Peak memory |
|---|---|---|---|---|
| af_heart (female) | 9.7 s | 4.5 s | 2.2× real time | ~535 MB (process) |
| am_michael (male) | 10.8 s | 4.9 s | 2.2× real time | |

Model load: 1.6 s. Model size: 92 MB (q8) + ~0.5 MB per voice. Sample rate 24 kHz.

In the browser (Chromium, WebAssembly, 1 thread, same machine) the app's real Kokoro path ran at roughly **0.3× real time**:
generating a chapter takes about three times as long as listening to it. **Not yet measured on an iPhone.** Memory near
0.5 GB is a real risk for a Safari tab. WebGPU (available in Safari 26) should be much faster but is unverified; it is offered
as an option. Multi-threaded WebAssembly would need cross-origin isolation headers, which GitHub Pages can't send.

---

## 2. Architecture decisions (and where they differ from the brief)

| Brief | Decision | Why |
|---|---|---|
| React Native + Expo | **Keep React + TypeScript + Capacitor** (already built) | It runs today on the owner's iPhone as a web app with no Mac, and the same code ships as a native iOS app through Capacitor. Expo would mean rewriting a tested UI and still needs a Mac or a cloud build service. |
| SQLite for metadata | **IndexedDB now, behind the `core/storage` functions**; SQLite in the native app later | IndexedDB is the browser's built-in database. The storage functions are the seam where a SQLite version plugs in. |
| Background narration not via browser speech | **Generate real audio files (Kokoro), then play them with the media player** | iOS keeps playing media files with the screen locked and shows Lock Screen controls; browser speech stops. Device voices stay as the instant fallback. |
| Kokoro / Piper / Apple voices | **Kokoro first** (in the browser with `kokoro-js`, WebGPU when available, WASM otherwise). Piper next. Apple voices = fallback. | Kokoro quality is clearly better; Piper is smaller and faster for weaker devices. |
| Desktop generation service | **Phase 2**: a free script that generates a book's audio on a computer and packages it for the phone | For long books, or if the iPhone is too slow or runs out of memory. |
| Local LLM | **Phase 3 evaluation**: WebLLM (WebGPU) on the phone vs llama.cpp on a computer | If neither runs acceptably, "Talk to your book" stays unavailable. No paid API. |

Layers (each behind its own interface, so the reader works even when AI is unavailable):

```
importers  →  storage (books, text, files, progress, notes, audio cache)
                 │
speech engines ──┤  device voices (instant)   ·   neural engines (Kokoro, Piper) → audio generation queue → audio cache
                 │
playback ────────┘  speech narrator (device voices)   ·   audio-file player (lock screen, media controls)
AI (later)       →  retrieval over stored text  →  local model if available, otherwise disabled
```

---

## 3. Phases

### Phase 1 — Working audiobook MVP (this round)
- [x] Import PDF, EPUB, DOCX, TXT, Markdown, RTF, HTML; scanned-PDF detection (existing)
- [x] Bookshelf, categories, search, progress (existing)
- [x] Free narration fallback with device voices (existing)
- [x] **Audio-file narration**: neural engine interface, Kokoro in the browser (WebAssembly; WebGPU option), chapter
      generation queue (retries, dedupe, pause/resume/cancel, progress), audio cache, audio-file player with Lock Screen /
      Media Session controls, 15 s back / 30 s forward, speed with pitch kept, position save/resume, auto-advance and
      generate-ahead
- [x] Brief's categories added to the shelf defaults (merged into existing lists once); Unread filter; sort by last opened,
      title, progress
- [ ] Owner tests on iPhone: lock screen, app switching, calls, Bluetooth (checklist in `docs/TESTING.md`) — **not run**

### Phase 2 — Natural narration
Done: voice per book, pronunciation list and pause length (Settings → Natural voice), whole-book generation, storage
management, regenerate a chapter, save a chapter as WAV, generate two chapters ahead with a warning when the next isn't ready.
Still to do: Piper engine; desktop generation script; M4A export.

### Phase 3 — AI reading assistant
Local search over chunks (with chapter/page references); evaluate on-device LLM; grounded Q&A with citations; chapter
summaries labelled as AI-generated; listen to summaries.

### Phase 4 — Personal learning
Quizzes from chapter text; action plans with lesson/action/priority/deadline/status/source; listening statistics from real
playback; goals; push-to-talk voice commands.

### Phase 5 — Production hardening
Large-book performance, memory and battery tests, accessibility, encrypted backups, privacy review, full iPhone testing,
native SQLite.

---

## 4. Costs
All $0 in recurring fees: open-source code, models downloaded free from Hugging Face by the device, GitHub Pages hosting.
Optional: Apple Developer Program $99/year, only for TestFlight / App Store.
