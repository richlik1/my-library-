# MY LIBRARY AI — Status report (V4, development branch `dev`)

Everything below is on `dev`. Production (`main`, the live site) is unchanged; deploying needs your approval.
"Tested" means an automated test ran it in the named engine. Nothing here was tested on a real iPhone.

## Done and tested

| Area | What works | Evidence |
|---|---|---|
| Import accuracy | PDF (single and two-column, headers, page numbers, hyphenation, footnotes moved to a Notes chapter), EPUB (TOC order, anchors, footnotes, non-linear extras), DOCX (footnotes/endnotes), TXT, MD, RTF, HTML | Generated books compared word by word with their source: 100% of words, in order (`tests/accuracy.test.ts`); 100-page / 20k-word PDF in about 0.2 s. Real books from Standard Ebooks: EPUB vs source text, in CI (`real-books.test.ts`, Chromium job green) |
| Import Quality Review | Confidence ("Looks right" / "Worth a check" / "Problems found"), order check that says when the order is *not* verified, flags (missing or out-of-order chapters, duplicated passages, blank pages, page-number gaps, garbled text, short chapters, TOC problems) | `tests/report.test.ts`, `e2e/import-review.spec.ts` |
| Chapter Organizer | Move, rename, split at a paragraph, merge, remove/restore, undo; notes, highlights and your place follow the text; stale narration audio is removed | `tests/organizer.test.ts`, storage remap test, e2e |
| Scanned PDFs | On-device OCR (Tesseract, about 7 MB downloaded once, kept offline); offered from the review and now also when a fully scanned PDF is imported | `e2e/ocr.spec.ts` (real OCR engine, Chromium) |
| Duplicates and recovery | The same file is recognised (SHA-256) with "Open it" / "Import a copy"; an import interrupted by closing the app is reported next launch | e2e |
| Page references | Lessons, search results and AI sources show "Chapter 3 · p. 47" when the file has page numbers | e2e `core-loop` |
| Narration text | Money, decades, Roman numerals, regnal names, units and abbreviations read the way a narrator does (English; other languages unchanged and keep the device voice) | `tests/speechText.test.ts`, checked against eSpeak output |
| Natural voice playback | Plays past the first minute into the next chapter and saves the place; buttons respond while audio is being made | WebKit (iPhone 14 profile) with the real Amy voice: 3.5 min continuous, 0 stalls; first sound about 2 s after the voice is stored |
| AI Reading Assistant | Off by default. With your own Claude key: explain, define, ask, chapter summary, study questions, flashcards, key lessons, action plan, compare chapters. Every answer is labelled "AI interpretation", shows the passages it used (Go there / Play from here), flags uncited answers and invented citations. Listen, save as note, save flashcards. Only the retrieved passages are sent; explain stays inside the chapter | `tests/assistant.test.ts`, `e2e/ai.spec.ts` (mocked API: checks what is sent and how it is labelled). Not run against the real API (that would bill your account) |
| Offline | Without AI or network: reading, narration with stored voices, search with references, notes | e2e (offline mode test) |
| Theme and comfort | Dark theme with a restrained violet accent by default; Book serif / Plain sans; Normal / Relaxed / Extra spacing | e2e `reading comfort`, screenshots |
| Storage and backups | Storage per book (narration audio, original file) with "Delete audio"; backups keep language, page maps, file fingerprint, review state, reading settings; AI key never in backups | `tests/storage.test.ts`, `e2e/ai.spec.ts` |
| Native iOS app | Compiles for the iOS Simulator, installs and launches (screenshot on the `ios-shots` branch) | CI `ios-simulator` job (informational) |

Bug fixed on the way: every screen change could crash the app in newer browsers (`window.scrollTo` returning a
Promise inside a React effect). Fixed on `dev`; the live site still has it until you approve a deploy.

## Not done yet

- **Word-by-word highlighting.** Sentence highlighting works. The natural voices don't report word timings, and
  timings will not be invented; word highlighting stays limited to the device voice, which reports them.
- **Search by meaning on the device.** Search uses words; meaning-based search needs a small embedding model (about
  25 MB). Not started.
- **Kokoro faster engine and compressed audio cache.** Audio is stored as WAV (about 2.6 MB per minute at 22 kHz);
  compressing it would save about 80%. Not started.
- **Local AI model.** Evaluated: a useful model is 1–2 GB and slow on an iPhone in a web page, so AI stays optional
  via your own key.

## Blocked: needs a real iPhone (decision D1: Apple Developer account, $99/year)

Not tested and not claimed: lock-screen playback in the native app, Bluetooth and headphone controls, calls and
interruptions, battery, memory over an hour, airplane mode on the device. Steps once D1 is approved:

1. Join the Apple Developer Program and add the account in Xcode (Settings → Accounts).
2. `npm ci && npm run build && npx cap sync ios`, open `ios/App/App.xcworkspace`, choose your team under Signing.
3. Run on the iPhone, then go through the checklist in `04-testing.md` §4. Send the **Listening log** and **Sound
   check** reports (Settings → Sound check → Copy details).

Without D1, the web app can be tested on the iPhone from a preview deploy, which also needs your approval.
