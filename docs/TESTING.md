# Test status

**passed** = ran and passed · **failed** · **blocked** = can't run in the available environment · **not run** = could run, hasn't yet.
Updated 2026-10-21. Environment: Linux, Chromium (Playwright), Node 22. No Mac, no iOS Simulator, no iPhone attached.

## Automated (run with `npm test` and `npm run test:e2e`)

| Area | Test | Status |
|---|---|---|
| Import | PDF text, headings, header/footer removal, page groups | passed |
| Import | Scanned PDF → OCR message; partly scanned PDF report | passed |
| Import | EPUB (spine, TOC, cover, DRM refusal), DOCX, TXT, RTF, HTML, plain text with any name | passed |
| Import | PDF in Safari-like browser (no async-iterable streams), blocked PDF worker, failure details | passed |
| Storage | Books, originals stored as bytes (Safari), progress, notes, backup round-trip, schema upgrades v1→v3 | passed |
| Speech chunks | Offsets, ordering, max size, abbreviations | passed |
| Device-voice narration | Play, pause, resume at the word, skip, chapters, retries, interruptions, sleep timer | passed |
| Natural voice core | WAV encoding, sentence timings, retries, failure reasons, pronunciation dictionary | passed |
| Generation queue | Order, cache reuse (no duplicate synthesis), regenerate on voice change, retry, pause/resume/cancel | passed |
| Audio cache | Deleting a book deletes its audio | passed |
| Audio playback (Chromium) | Generate → play real audio file → 30 s skip into next chapter → auto-advance → pause → reload → resume from cache | passed |
| Kokoro adapter (Node, real model) | Token ids identical to the Python reference (44/44); audio produced | passed (manual run) |
| Kokoro in browser (Chromium, WebAssembly, real model) | Model load, chapter generation and playback | passed (opt-in test `e2e/kokoro-real.spec.ts`) |
| Kokoro with WebGPU | Faster generation option | blocked (no GPU here) |
| Growth Library, Mentor | Catalog, quizzes, daily block, weekly review, mentor plans | passed |

## Measured performance (this environment, not an iPhone)

| Engine | Setup | Speed |
|---|---|---|
| Kokoro q8, Python ONNX Runtime | 4 CPU threads | 2.2× faster than real time, ~535 MB memory |
| Kokoro q8, Chromium WebAssembly | 1 thread | ~0.3× real time (≈ 3 s of work per 1 s of audio); first use adds model download |

## Manual iPhone checklist (owner) — all **not run** until tested on the phone

Open https://richlik1.github.io/my-library-/ in Safari (or from the Home Screen). Use a book with Natural voice and at least
two generated chapters.

| # | Check | Expected |
|---|---|---|
| 1 | Settings → Check book import | All ✓ |
| 2 | Natural voice → Generate this chapter | Progress shown; chapter becomes ready |
| 3 | Play, then **lock the phone** | Audio keeps playing |
| 4 | Lock Screen controls: pause, play, skip back/forward | Work; app shows the same state when reopened |
| 5 | Let a chapter end while locked | Next generated chapter starts by itself |
| 6 | Switch to another app while playing | Audio keeps playing |
| 7 | Incoming call / Siri | Audio pauses; resume with play |
| 8 | Bluetooth headphones / car: play-pause buttons | Work |
| 9 | Disconnect Bluetooth while playing | Playback pauses (iOS default) |
| 10 | Airplane mode, reopen app, play a generated chapter | Plays offline |
| 11 | Close the app completely, reopen the book | Resumes at the saved sentence |
| 12 | Speed 1.5× | Faster, same pitch |
| 13 | WebGPU switch on (Voice & speed) | Faster generation, or turn off if it fails |
| 14 | Low storage | Clear error, no data loss |

Report results as passed / failed (with what happened) so this table can be updated.
