# MY LIBRARY AI — Roadmap (V3)

Ordered by what most improves successful imports, listening reliability, retention and learning. Each milestone is a
vertical slice with acceptance tests (`docs/test-plan.md`). A milestone starts only when its dependencies pass.
Complexity: S (≤1 day), M (2–4 days), L (1–2 weeks), XL (more).

| # | Milestone | Depends on | DB changes | Complexity | Acceptance (summary) | Deploy needs |
|---|---|---|---|---|---|---|
| **M1** | **Core loop slice** — import → clean text → narrate → offline play → highlight → save lesson → resume after restart, as one tested workflow; honest highlighting (word-level only from real engine timing, otherwise sentence); chapter text correction; two-column PDF fixture | existing | none | M | `e2e/core-loop.spec.ts` passes on phone and desktop viewports; unit fixtures for cleanup | GitHub Pages (existing) |
| M1b | **Natural voice on iPhone** — act on the owner’s voice log: fix the failing mode or ship a lighter/faster engine behind `NeuralEngine` | owner device log | none | M–L | Owner’s speed test completes; first sound ≤ 30 s; ≥1× listening speed or clear generate-ahead flow | — |
| M2 | **Ask tab + library-wide search** — fifth tab “Ask”; search all books, notes and lessons offline with snippets; open the exact passage; side-by-side results for “compare books” (no AI) | M1 | `searchIndex` (v6) | M | Finds known passages; opens the right place; works offline; deleting a book removes its entries | — |
| M3 | **Legal free-book discovery** — Project Gutenberg / Standard Ebooks / Open Library search, licence shown, one-tap EPUB import; source page map for PDFs | M1 | `discoveredBooks`, `pageMap` (v7) | M | Imports a public-domain EPUB end to end; only public-domain/openly licensed items offered; lessons show page numbers for PDFs | Network access to those catalogs from the device |
| M4 | **Flashcards with spaced repetition** — manual cards from lessons, FSRS-style scheduling, offline reviews | M2 | `flashcards`, `flashcardReviews` (v8) | M | Schedules verified against reference values; no duplicate reviews; works offline | — |
| M5 | **Learning plans from your library** — goal → selected books → sessions → milestones; uses progress data | M2, M4 | `learningPlans`, `planMilestones` | M | Plan uses only books the user has; progress updates from real listening | — |
| M6 | **Native iOS build** — Capacitor build in CI on a hosted Mac, TestFlight; native speech + background audio verified; lock screen, interruptions, Bluetooth | M1 | none | L | Owner checklist 1–23 passes on device | Apple Developer Program ($99/yr), hosted macOS runner |
| M7 | **Local AI companion** — evaluate on-device models (WebLLM/WebGPU, llama.cpp in native app); grounded answers with citations; difficulty levels; quizzes from text | M2, M6 | `aiConversations` | L–XL | Manual grounding review: no unsupported claims in the evaluation set; graceful “unavailable” | Model download hosting (free on Hugging Face) |
| M8 | Multilingual narration and focus/sleep modes | M1b | — | M | Language detection + matching voice; sleep fade | — |
| M9 | Optional accounts + cross-device sync | M6 | cloud schema | XL | Encrypted sync, conflict tests, export/delete | Hosting, domain, monitoring (paid) |
| M10 | CarPlay / Android Auto evaluation | M6 | — | L | Platform policy check first; supported templates only | Entitlements, Android app |
| M11+ | Reading circles, sharing, creators, classrooms, AI podcasts, monetization | M9 | cloud | XL | Per-feature, with privacy and moderation reviews | Paid infrastructure; legal review |

## Why this order

- Reliability first: the owner can’t yet use the natural voice on iPhone (M1b), and the core loop needs a single
  end-to-end test so regressions are caught (M1).
- The Ask tab and full-library search (M2) are the clearest differentiation that works **without** an AI model and
  becomes the retrieval layer every later AI feature needs.
- Free-book discovery (M3) gives people something to listen to without paying — essential for retention beyond one book.
- Native iOS (M6) is the only robust path to locked-screen listening with device voices and to CarPlay; it needs paid
  developer accounts, so it waits for approval.

## Not now

Accounts, sync, communities, creators, classrooms, paid tiers, cloud AI/voices: these need infrastructure, costs and
legal review. They stay out of the free local-first MVP until a group of real users relies on the core loop.

## Product metrics to collect (with consent, later)

Successful import rate on a defined fixture set (target ≥95%), first-sound time, sessions per week, 7-day return,
listening minutes, lessons saved. Today these are measured only in tests; the app has no analytics.
