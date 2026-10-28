# MY LIBRARY AI — Product status

**As of 2026-10-28** · `main` at `85d0439` (v2.4.0) · Status: **live free web app; well tested in browser engines; never verified on a real iPhone.**

Labels: **✅ Verified** (run or observed for this report) · **📄 Documented** (this repo's docs) · **❓ Unverified** (needs the owner's iPhone or another check).

Details stay in [`docs/audit.md`](docs/audit.md), [`docs/roadmap.md`](docs/roadmap.md) (V3 milestones), [`docs/test-plan.md`](docs/test-plan.md), [`docs/TESTING.md`](docs/TESTING.md) (with the 23-item iPhone checklist) and [`docs/cost-model.md`](docs/cost-model.md).

## 1. Current functionality and technical health

| Area | Status | Evidence |
|---|---|---|
| Import PDF/EPUB/DOCX/TXT/RTF/HTML; text cleanup; chapters; on-device narration (device voices, Piper "fast natural", Kokoro on desktop); highlights, notes, lessons; backups; offline PWA; Growth Library section | Built | ✅ code read; 📄 README |
| Unit tests | **119 / 119 pass** | ✅ `npx vitest run` locally and in health-check run [40763898510](https://github.com/richlik1/my-library-/actions/runs/40763898510) |
| Typecheck and build | Clean | ✅ `npm run build` |
| End-to-end (Chromium desktop + iPhone-size viewport) | **Passed in the repo's CI** on `85d0439` | ✅ run [39968075547](https://github.com/richlik1/my-library-/actions/runs/39968075547), job `chromium` |
| End-to-end in WebKit (Safari's engine, iPhone 14 settings, macOS), including **4 minutes of real Piper listening** | **Passed in CI** on `85d0439` | ✅ same run, job `webkit-macos` |
| Same e2e suites run in this audit's sandbox | 12 of 40 passed | ✅ run here, but with a Chromium build newer than the repo pins (1243 vs 1194). Failures are consistent with the environment, not the app (CI passes on the same commit). Not counted as evidence either way. |
| Deployment | **Live** on GitHub Pages; last deploy succeeded 2026-10-23 after tests passed | ✅ deploy run [39968855650](https://github.com/richlik1/my-library-/actions/runs/39968855650). ❓ Page not fetched from here (sandbox blocks github.io). |
| Dependency audit (production) | 0 critical, 3 high: `@huggingface/transformers`, `kokoro-js`, `sharp` (libvips/libheif CVEs), no fix available | ✅ `npm audit --omit=dev`. `sharp` is a Node image library pulled in through the voice packages; the app runs in the browser. ❓ confirm it isn't in the shipped bundle. |
| Secret scan (full history) | No findings | ✅ health-check run |
| Running cost | **$0** | 📄 docs/cost-model.md; no servers or paid APIs in code |

## 2. Broken or incomplete

| # | Issue | Evidence |
|---|---|---|
| 1 | **Real iPhone never tested.** All 23 checklist items in docs/TESTING.md are "not run": locked-screen playback, offline, resume, Bluetooth, calls. | 📄 docs/TESTING.md |
| 2 | Natural voice on the owner's iPhone: Kokoro failed (first sentence never finished) and is now hidden on iPhone; Piper ("fast natural") is the replacement, **not yet confirmed on the device** | 📄 docs/audit.md §4, test-plan 2.3–2.4 |
| 3 | Generated audio is uncompressed WAV, about 2.9 MB/min (a 10-hour book is about 1.7 GB) | 📄 docs/audit.md §4 |
| 4 | Safari may evict website data if the app isn't installed to the Home Screen | 📄 docs/audit.md §4 |
| 5 | Native iOS app (Capacitor in `ios/`) never built; needs a Mac runner and the $99/yr Apple membership | 📄 docs/audit.md, APP_STORE.md |

## 3. Competitors and recent market developments

- **ElevenReader (ElevenLabs):** books, PDFs and articles narrated in 32+ languages, 0.25–3× speed, highlighting. Cloud voices. [App Store](https://apps.apple.com/US/app/id6479373050)
- **Speechify:** major paid TTS reader. ❓ 2026 changes not found in this audit's search.
- Both are cloud-voice, subscription products. ❓ Neither's pricing was verified here.

## 4. Relevant models, APIs and emerging technology

- **Piper** and **Kokoro**: open neural TTS running on device in WebAssembly. Already integrated. ✅
- **WebGPU** for faster on-device synthesis: switch exists. 📄 untested (no GPU here).
- **On-device LLMs** (WebLLM, llama.cpp): candidate for roadmap M7's grounded Q&A. Not started, correctly.

## 5. Actual differentiation and the customer problem solved

- **Problem:** turn books you already own into audio, privately and for free, and keep listening with the phone locked.
- **Differentiator (✅ in code):** everything runs on the device. No account, no upload, no subscription, works offline. ElevenReader and Speechify can't make that claim.
- **❓ Unverified:** demand beyond the owner. No users or metrics are collected, by design.

## 6. Monetization options and operating costs

- **Today:** free web app, $0 to run (✅ no server code).
- **Option (📄 APP_STORE.md):** one-time App Store price of $2.99–6.99. Costs $99/yr (Apple Developer Program) and 15% (Small Business Program). **Needs owner approval**, and is only worth it after the iPhone checklist passes.
- Anything with accounts or cloud voices adds hosting costs and is out of scope (docs/roadmap.md "Not now").

## 7. Three improvements worth prioritising

1. **Run the iPhone checklist** (owner, about 30 minutes), starting with narration, imports, saved progress and offline. See [`ROADMAP.md`](ROADMAP.md) week 1.
2. **Fix whatever the checklist finds** before any new feature. Narration on the locked phone is the product.
3. **Compressed audio (AAC/Opus)** to replace WAV, so long books fit on a phone.

## 8. Not to build yet

Accounts and sync, cloud AI or voices, communities and sharing, CarPlay, M7 local AI companion, new Growth Library content. Native iOS (M6) waits for approval of the $99/yr membership and a passing web checklist.

## 9. 30-day roadmap

See [`ROADMAP.md`](ROADMAP.md).
