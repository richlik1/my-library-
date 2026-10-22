# MY LIBRARY AI — Cost model

Only facts and published list prices known at the time of writing; no usage forecasts. Prices change — check before
committing. Nothing here has been purchased.

## Free software used today ($0)

| Component | Licence | Cost |
|---|---|---|
| React, Vite, TypeScript, Workbox / vite-plugin-pwa, idb, jszip | MIT / Apache-2.0 | $0 |
| PDF.js | Apache-2.0 | $0 |
| Kokoro-82M voice model + kokoro-js | Apache-2.0 | $0 (downloaded by each device from Hugging Face, free) |
| ONNX Runtime Web, Transformers.js | MIT / Apache-2.0 | $0 |
| Capacitor | MIT | $0 |
| Playwright, Vitest | Apache-2.0 / MIT | $0 |

## Hosting and services used today

| Item | Cost today | Notes |
|---|---|---|
| GitHub repository + Actions (public repo) | $0 | Public repositories get free Actions minutes on standard runners |
| GitHub Pages (static hosting) | $0 | Soft limits apply (published by GitHub: site size and monthly bandwidth limits); fine for a test group, not for millions |
| Hugging Face model downloads | $0 | Served by Hugging Face to each device |
| User devices | owned by users | Generation uses the phone’s CPU/GPU and battery; audio uses device storage (~2.9 MB per minute as WAV today) |

## One-time / yearly costs that some milestones need (not purchased)

| Item | When needed | Published price (verify) |
|---|---|---|
| Apple Developer Program | TestFlight / App Store (M6) | $99 per year |
| Google Play developer account | Android release | $25 one-time |
| A Mac (or hosted macOS CI) | Building the iOS app (M6) | Mac hardware, or macOS runner minutes (GitHub charges macOS minutes at a higher rate than Linux once free minutes are used; public repos: free standard runners) |
| Domain name | Public launch | typically ~$10–20 per year |

## Ongoing costs that would start only with cloud features (not in the MVP)

| Feature | Cost drivers | Note |
|---|---|---|
| Accounts + sync | Database, API hosting, backups, monitoring | Scales with users and stored data |
| Cloud file storage for books/audio | Storage (GB-month) + egress | Audio is large unless compressed |
| Hosted neural voices | GPU time or per-character API fees | Only as an optional paid tier, with per-user quotas |
| Hosted AI (answers, summaries) | Tokens or GPU time | Needs per-user limits; local mode stays free |
| Moderation, support, legal (privacy policy, copyright process) | People and tools | Required before communities or schools |

## Revenue (hypothetical, from the owner’s brief)

Free core reader; possible Plus ($5.99/mo) and Pro ($12.99/mo) tiers with sync, hosted voices and larger AI allowances.
These are **untested price points**. App Store / Play Store fees, taxes, refunds and infrastructure costs would come out
of any revenue. No financial projection is made here.
