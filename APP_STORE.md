# Selling My Library on the App Store

This project now includes a real native iPhone app (in `ios/`). It runs the same app you already have, plus:

- **Keeps reading with the screen locked** or while you use other apps (native background audio).
- **Lock Screen, Control Center and headphone controls:** play/pause and previous/next chapter, with the book cover and chapter title shown.
- **Uses Apple's on-device voices,** including Enhanced and Premium voices.
- **Handles calls and Siri:** narration pauses for them and resumes after.
- **Saves your position natively,** so it survives the app being closed while it reads.
- **Exports through the share sheet:** backups and notes go to Files, iCloud Drive, AirDrop or Mail.
- **Includes a built-in sample book,** so App Review (and new buyers) can hear it right away.

---

## What it costs

| Item | Cost | Needed for |
|---|---|---|
| Testing on **your own iPhone** with Xcode | **Free**, but you need a Mac | Trying the native app yourself |
| **Apple Developer Program** | **$99 / year** | TestFlight, the App Store and charging money (no way around this) |
| Apple's commission on sales | 15% (Small Business Program, under $1M/yr; apply for it) or 30% | Each sale |
| Everything else in this app | $0 | No servers, no paid APIs, no subscriptions |

> You said earlier not to add paid services without your approval. The $99/year Apple membership is the one cost
> you can't avoid to sell on the App Store. Nothing else costs money.

---

## Step 1: Test it (free)

### A. Today, on your iPhone, without a Mac
Use the web version (see `README.md` → *Put it on your iPhone*). It is the same app, except speech stops when the screen locks.

### B. The real native app on your iPhone (free, needs a Mac)
1. Install **Xcode** from the Mac App Store (free) and Node.js 20+ from nodejs.org.
2. Get the code onto the Mac, then:
   ```bash
   cd my-library    # the cloned repository
   npm install
   npm run ios          # builds the web app, copies it into ios/, and opens Xcode
   ```
3. In Xcode: click **App** (top of the file list) → **Signing & Capabilities** → *Team*: **Add an Account…** and sign in with your
   normal Apple ID. Choose your "(Personal Team)".
   - If Xcode says the bundle identifier is taken, change `com.maliklyons.mylibrary` to something unique, like
     `com.yourname.mylibrary`.
4. Plug in your iPhone. On the iPhone, go to **Settings → Privacy & Security → Developer Mode**, turn it on and restart.
5. In Xcode pick your iPhone at the top and press **▶ Run**.
6. The first time, the iPhone will block the app. Go to **Settings → General → VPN & Device Management**, tap your Apple ID and
   choose **Trust**.
7. Test it: import a PDF, press play, **lock the phone**. It keeps reading. Use the Lock Screen controls.

With a free Apple ID, the app stops opening after **7 days**. Press Run in Xcode again to refresh it.

Whenever you change the web code, run `npm run ios:sync` and press Run again.

### C. TestFlight (needs the $99 membership, recommended before launch)
TestFlight installs the real app on your iPhone (and up to 10,000 testers) without a cable, and builds last 90 days.
Upload a build (Step 3) and it shows up in the TestFlight app.

---

## Step 2: Join the Apple Developer Program ($99/year)

1. Go to <https://developer.apple.com/programs/enroll/> and enroll as an **Individual** (sold under your name) or an
   **Organization** (sold under a company name; needs a free D-U-N-S number).
2. In **App Store Connect** (<https://appstoreconnect.apple.com>) → **Business** (Agreements, Tax, and Banking), accept the
   **Paid Apps Agreement** and add your **bank account and tax forms**. **You cannot charge for an app until this is done.**
3. Optional but worth it: apply for the **App Store Small Business Program**. It cuts Apple's commission from 30% to 15%.

---

## Step 3: Upload a build

### With a Mac (Xcode)
1. `npm run ios`, then in Xcode → *Signing & Capabilities* pick your **paid team** (not "Personal Team").
2. At the top choose **Any iOS Device (arm64)**.
3. **Product → Archive**. When the Organizer opens, choose **Distribute App → App Store Connect → Upload**.
4. Each new upload needs a higher **Build** number (App target → General → Identity).

### Without a Mac (GitHub Actions, free minutes)
The workflow `.github/workflows/ios-testflight.yml` builds on GitHub's Mac machines and uploads to TestFlight.
1. In App Store Connect, create the app first (Step 4, items 1–2).
2. Create an API key: App Store Connect → **Users and Access → Integrations → App Store Connect API → +**, role
   **App Manager**. Download the `.p8` file (you can only download it once).
3. In the GitHub repo → **Settings → Secrets and variables → Actions**, add `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID` and
   `ASC_KEY_P8_BASE64`. The last one is the `.p8` file converted to base64 (`base64 -i AuthKey_XXXX.p8`).
4. **Actions → iOS build → TestFlight → Run workflow**.

Public repos get free Mac minutes. Private repos get a monthly allowance, and Mac minutes count 10× (each build uses about
10–20 minutes).

---

## Step 4: Create the App Store listing

App Store Connect → **Apps → + → New App**:

1. **Platform** iOS · **Name** (see below) · **Primary language** English · **Bundle ID**: the one from Xcode
   (`com.maliklyons.mylibrary`, or the one you changed it to) · **SKU**: `mylibrary1`.
2. **Name must be unique on the App Store.** "My Library" is almost certainly taken. Ideas (30 characters max):
   *My Library: Books Read Aloud* · *My Library – PDF to Audiobook* · *Readaloud Library* · *ShelfVoice*.
   If you rename the app, also change `CFBundleDisplayName` in `ios/App/App/Info.plist` (the name under the icon).
3. **Pricing and Availability** → choose a price (for example **$4.99**, a one-time purchase, no in-app purchases, no
   subscription, no extra code). See *Pricing ideas* below.
4. **App Privacy** → *Data collection*: **"No, we do not collect data from this app."** That is accurate: nothing leaves the
   device.
5. **Privacy Policy URL** (required): host `public/privacy.html`. It is published with the web app, for example
   `https://<your-site>/privacy.html` (GitHub Pages or Netlify, see README).
6. **Support URL** (required): the web app's address, your GitHub repo, or a simple contact page.
7. **Age rating**: answer "None" to everything → 4+.
8. **Category**: Books (primary), Education or Productivity (secondary).
9. **Screenshots**: ready-made 6.9" iPhone screenshots (1320 × 2868) are in `store/screenshots/`. Upload them under
   *iPhone 6.9" Display*. Apple scales them for smaller iPhones. (iPad screenshots are only needed if you keep iPad support.)
10. **App Review Information** → Notes, for example:
    > No account is needed. To test: on first launch tap **Try a sample book**. It opens a built-in guide and reads it aloud.
    > Lock the device to hear narration continue in the background (UIBackgroundModes audio is used only for this spoken
    > narration). To test import, tap **Add** and choose any PDF, EPUB, DOCX or TXT file.
11. Select your uploaded build, then **Add for Review → Submit**. Review usually takes 1–3 days.

### Suggested store text

**Subtitle** (30): `Your books, read aloud`

**Promotional text**: `Turn your own PDFs, EPUBs and documents into audiobooks — private, offline, and yours.`

**Description**:
```
Turn any PDF, EPUB, Word document or text file into an audiobook.

My Library reads your own books aloud with natural on-device voices — even with your screen locked. Import a book from Files or iCloud Drive and press play. That's it.

LISTEN YOUR WAY
• Keeps reading with the screen locked or while you use other apps
• Lock Screen, Control Center and headphone controls
• Speeds from 0.5× to 3×, and every voice on your iPhone — including Enhanced and Premium voices
• Skip by sentence or chapter, or tap any sentence to start there
• Sleep timer: minutes or end of chapter

NEVER LOSE YOUR PLACE
• Your position is saved automatically, down to the word
• Resume exactly where you stopped

READ ALONG
• Follow the highlighted sentence as it is read
• Highlights in four colors, notes and bookmarks
• Export your notes

YOUR BOOKSHELF
• Covers, categories, favorites and search
• Smart text extraction: chapters, headers and page numbers handled for you
• Scanned PDFs are detected, with clear guidance on making them readable

PRIVATE BY DESIGN
• No account. No ads. No tracking. No subscription.
• Your books never leave your device
• Works completely offline
• Backup and restore your library and notes

Supports DRM-free PDF, EPUB, DOCX and TXT files.
```

**Keywords** (100 characters): `audiobook,pdf reader,text to speech,read aloud,epub,tts,listen,books,voice,reader,docx,study`

### Pricing ideas
- **One-time price ($2.99–$6.99):** simplest; no code needed, and it fits "no subscription" as a selling point. *Recommended
  to start.*
- **Free download + one-time "unlock" in-app purchase:** more downloads, since people try before buying, but it needs
  StoreKit code and a "Restore Purchases" button. Ask if you want it.
- **Subscription:** hard to justify when everything runs on the device; reviewers and buyers expect ongoing server costs
  behind a subscription.

---

## App Review checklist (already handled in this project)

- [x] Uses native features beyond a website: background audio, Lock Screen controls, native voices, share sheet. Apple
      rejects apps that are "just a website" (guideline 4.2).
- [x] `UIBackgroundModes = audio` is used only for audible narration (guideline 2.5.4).
- [x] Privacy manifest (`PrivacyInfo.xcprivacy`) declares no tracking and no data collection, plus the UserDefaults reason.
- [x] `ITSAppUsesNonExemptEncryption = NO` (no export-compliance paperwork).
- [x] App icon at 1024 × 1024 with no transparency; dark launch screen.
- [x] Works with no account and no network; a sample book is built in for reviewers.
- [x] No web-only features show in the app: no "install" banner, no service worker updates (updates come from the App Store).
- [ ] **Your part:** unique app name, privacy policy URL, support URL, screenshots uploaded, price chosen, Paid Apps Agreement
      signed.

## Releasing updates
1. Change the code and run the tests (`npm test`).
2. Raise **Version** (e.g. 1.0.1) and **Build** in Xcode, or set the *version* input of the GitHub workflow.
3. Archive and upload, then in App Store Connect create a new version, pick the build and submit.
