# My Library — your private audiobook player

**Live app:** <https://richlik1.github.io/my-library-/> (open in Safari on iPhone, then Share → Add to Home Screen)

Turn your own books into audiobooks, for free. Import a **PDF, EPUB, DOCX or TXT** file from your iPhone or computer, and
My Library extracts the text and reads it aloud with your device's built-in voices.

- **$0, forever.** No paid APIs, no paid text-to-speech, no database, no account.
- **Private.** Books, progress, highlights and notes stay on your device (IndexedDB). Nothing is uploaded.
- **Offline.** Once the app is installed, it opens and reads with no internet (on-device voices).
- **Installable.** Add it to your iPhone Home Screen from Safari; it runs full-screen like an app.

Built with React + TypeScript, PDF.js, the browser SpeechSynthesis API, IndexedDB and a PWA service worker (Workbox).

**Two ways to ship it:**
1. **Web app (free):** host it and add it to your Home Screen from Safari. See *Put it on your iPhone* below.
2. **Native iPhone app for the App Store** (in `ios/`, built with Capacitor): keeps reading with the screen locked and adds
   Lock Screen controls. See **[APP_STORE.md](APP_STORE.md)** for testing it on your phone and selling it.

---

## Natural voice (listen with the screen locked)

In a book, open **Voice & speed → Natural voice**. The app uses **Kokoro** (an open, free neural voice) to generate real audio
for each chapter **on your device**; nothing is uploaded and there is no fee. The first time, it downloads the 92 MB voice model
from Hugging Face (and a 21 MB runtime from this site), then works offline.

- Generated chapters play as audio files, so they **keep playing with the iPhone locked**, with Lock Screen and headphone controls,
  15 s back / 30 s forward, and speed changes that keep the pitch.
- Generation runs in order, ahead of where you're listening, skips chapters already made, retries failed sentences, and can be
  paused or cancelled. **It can take longer than listening** (about 3× in our browser test), so start early and keep the app open.
- 21 English voices (female and male, American and British), with previews. Changing the voice regenerates.
- Optional **WebGPU** switch for much faster generation where the browser supports it (larger one-time download).
- Device voices remain available as the instant option.

See `docs/PLAN.md` (architecture, benchmarks, phases) and `docs/TESTING.md` (what is tested and the iPhone checklist).

---

## LYONS AI — Knowledge & Growth Library

A second section of the app (tab **Growth Library**) for personal and business development:

- **21-book catalog** in 8 categories (Discipline & Mental Resilience, Confidence & Social Skills, Leadership & Communication,
  Business Operations & Sales, Financial Intelligence, Fatherhood & Relationships, AI & Technology, Reading Notes & Action Plans),
  searchable by title, author, skill, idea or your own notes, with "Read first" ordering.
- Per book: **original summary**, key ideas, how to apply it at **Lyons Cleaning Solutions**, at **StayOps** and at home,
  exercises, a quiz, notes, reading status, rating, and links to **legal** copies (Open Library, WorldCat, Libby).
- **Your copy:** import your own legally obtained book in Audiobooks and link it to listen during your daily block. The app never
  bundles copyrighted full texts.
- **Daily 30-minute block** (review 5 · read/listen 15 · practice 5 · apply 5) with a streak, and a **weekly accountability review**
  with automatic stats and a commitment that becomes an action item.
- **Mentor:** guided coaching for difficult conversations, negotiation, team problems, business decisions, sales calls,
  fatherhood moments and getting back on track. It runs on the device for free and cites the book behind each step. "Copy prompt"
  creates a detailed prompt for ChatGPT or Claude, using your editable business profile.
- Everything is stored on the device and included in backups.

Content lives in `src/growth/` (catalog, plan logic, mentor flows); screens in `src/ui/growth/`.

## Features

| | |
|---|---|
| Import | PDF (PDF.js), EPUB (DRM-free), DOCX (Word), TXT — several at once. Progress shown while extracting. |
| Text extraction | Rebuilds paragraphs, removes running headers / page numbers, joins hyphenated words, finds chapters (PDF outline → headings → page groups). |
| Scanned PDFs | Detected automatically. Fully scanned → clear explanation that OCR is needed and free ways to do it. Partly scanned → book is added and the scanned pages are listed. |
| Bookshelf | Covers (from the PDF's first page, the EPUB cover, your own photo, or a generated cover), categories, favorites, search, “Continue listening”. |
| Listening | Play/pause, back/forward one sentence, previous/next chapter, chapter list, position slider, tap any sentence → “Play here”. |
| Voices | Every free voice on the device, grouped by language, Enhanced/Premium voices marked, preview button. Speed 0.5×–3×, pitch. |
| Progress | Saved automatically (every ~1.5 s, on pause, when leaving the app) — down to the word when the voice reports word positions. Resume exactly where you stopped. |
| Notes | Highlights (4 colours), notes, bookmarks. Select text or tap a sentence. Export notes as Markdown. |
| Sleep timer | 5–90 minutes or end of chapter. |
| Backup | Export / restore a JSON backup of the whole library and progress (optionally including the original files). |
| Reliability | Long books are split into sentence-sized speech chunks. Failed sentences are retried, then skipped; silent stalls are detected; interruptions pause with an explanation; the place is never lost. |

### Honest limitations (please read)

- **iPhone lock screen / background (web version only):** iOS stops web-app speech when the screen locks or you switch apps. The
  web version keeps the screen awake while reading, saves your exact place, and continues from the same sentence when you
  return. The **native app** in `ios/` keeps reading in the background and shows Lock Screen controls. See [APP_STORE.md](APP_STORE.md).
- Voice quality depends on your device. On iPhone, download free better voices: **Settings → Accessibility → Spoken Content →
  Voices → English → (e.g.) Ava / Zoe / Evan “Enhanced” or “Premium”**, then choose them in *Voice & speed*.
- Scanned (image-only) PDFs need OCR first. OCR is not built in (a good offline OCR engine would add ~15 MB and be slow on a
  phone); the app explains the free options.
- DRM-protected EPUBs (e.g. bought from Apple Books/Kindle) cannot be read. DRM-free EPUBs work.
- Browser storage can be cleared by the browser for sites you don't use. Installing to the Home Screen and tapping
  *Settings → Protect my library* prevents that; keep a backup anyway.

---

## Run it on your computer

Requirements: [Node.js](https://nodejs.org) 20 or newer (free).

```bash
cd my-library    # the cloned repository
npm install        # installs dependencies and copies PDF.js assets into public/pdfjs
npm run dev        # starts http://localhost:5173
```

Open <http://localhost:5173> in Chrome, Edge, Safari or Firefox, click **Add**, choose a PDF and press **Play**.

Other commands:

```bash
npm test           # unit tests (importers, chunker, narrator, storage/backup) — Vitest
npm run test:e2e   # end-to-end tests in Chromium — Playwright (upload PDF → read aloud → resume, notes, OCR, offline, backup)
npm run typecheck  # TypeScript
npm run build      # production build into dist/ (includes the offline service worker)
npm run preview    # serve the production build on http://localhost:4173
npm run ios        # (Mac only) build, copy into the iOS project and open Xcode
npm run ios:sync   # build and copy into the iOS project
```

> For `npm run test:e2e` you need Playwright's Chromium once: `npx playwright install chromium`.

---

## Put it on your iPhone (free)

A Home Screen web app needs to be served over **HTTPS** (that is what enables offline mode and installation). Pick one free option:

### Option A — GitHub Pages (uses this repository)

GitHub Pages is free for **public** repositories (private repositories need a paid GitHub plan — use Option B instead).

1. On GitHub open the repository → **Settings → Pages** → under *Build and deployment* set **Source: GitHub Actions**.
2. Merge this code into the `main` branch (or open **Actions → Deploy My Library to GitHub Pages → Run workflow**).
3. When the workflow finishes, the app is live at `https://<your-username>.github.io/<repository-name>/`
   (for this repo: <https://richlik1.github.io/my-library-/>). The URL is also shown in the workflow run.

### Option B — Netlify Drop (no Git needed)

1. On your computer run `npm install` and `npm run build` in the project folder.
2. Go to <https://app.netlify.com/drop> (free account) and drag the **`dist`** folder onto the page.
3. Netlify gives you an `https://….netlify.app` address. (Cloudflare Pages → *Upload assets* works the same way, also free.)

### Install on the iPhone

1. Open the HTTPS address in **Safari** (it must be Safari for installation).
2. Tap the **Share** button (square with an arrow) → scroll → **Add to Home Screen** → **Add**.
3. Open **My Library** from the new Home Screen icon. Wait for the message *“ready to work offline”* the first time.
4. Tap **Add** → choose a book from **Files**, iCloud Drive or Downloads → **Save to library** → open it → **Play**.
5. Optional but recommended: *Settings (gear) → Protect my library*, and download an Enhanced/Premium voice (see above).
6. If you hear nothing: turn the volume up and make sure the Ring/Silent switch is not on Silent.

Updates: when a new version is deployed the app shows *“A new version is available — Update”*.

### Quick test on the iPhone without deploying

Run `npm run dev` on your computer, then open the `Network:` address it prints (e.g. `http://192.168.1.20:5173`) in Safari on an
iPhone on the same Wi-Fi. Importing and listening work, but offline mode and *Add to Home Screen* as a real app require the HTTPS
options above.

---

## Backups

*Settings → Export backup* downloads `my-library-backup-YYYY-MM-DD.json` (on iPhone choose **Save to Files**). It contains every
book's extracted text, your reading positions, bookmarks, highlights, notes and settings. *Full backup* also includes the original
files. *Restore backup* merges a backup into the current library (books you already have are kept, newer positions and notes are
merged in).

---

## Project structure

```
my-library (repository root)/
├── src/
│   ├── core/                 # Plain TypeScript, no React — reusable by a future native app
│   │   ├── types.ts          # Data model (Book, Chapter, Progress, Annotation, Settings)
│   │   ├── importers/        # pdf.ts, epub.ts, docx.ts, txt.ts, text.ts (cleanup/chapters), errors.ts (OCR message)
│   │   ├── speech/           # chunker.ts, engine.ts (interface), webSpeechEngine.ts, narrator.ts (playback controller)
│   │   └── storage/          # db.ts (IndexedDB), backup.ts (export/import)
│   ├── ui/                   # React interface (library, player, sheets, settings, styles.css)
│   └── main.tsx
├── tests/                    # Vitest unit tests
├── e2e/                      # Playwright end-to-end tests
├── public/icons/             # App icons (Home Screen, manifest); public/privacy.html = privacy policy
├── ios/                      # Native iOS app (Capacitor). Swift: ios/App/App/NativeSpeechPlugin.swift
├── store/screenshots/        # App Store screenshots (6.9" iPhone)
├── capacitor.config.ts       # Native app id / name
├── vite.config.ts            # Vite + PWA (manifest, offline precache)
├── APP_STORE.md              # Test on your iPhone, publish and sell on the App Store
└── ARCHITECTURE.md           # Design notes
```

No paid services are used. The only network requests the app ever makes are to load itself from where you host it.
