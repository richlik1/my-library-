# MY LIBRARY AI — 30-day roadmap (2026-10-28 → 2026-11-27)

**Goal for the month: prove the core works on a real iPhone (narration, imports, saved progress, offline playback) before adding anything.**

The milestone plan stays in [`docs/roadmap.md`](docs/roadmap.md) (M1–M11). This month is M1b plus fixes. The full device checklist is the existing 23 items in [`docs/TESTING.md`](docs/TESTING.md#manual-iphone-checklist-owner--all-not-run-until-tested-on-the-phone); the numbers below refer to it.

## Week 1: the 30-minute iPhone run (owner)

Open the live app in Safari and **Add to Home Screen first**: Safari can evict data for un-installed sites. Then run these items in order and report each as passed or failed, with what happened:

| Priority | Checklist items | What it proves |
|---|---|---|
| **Imports** | #1 (Settings → Check book import), then import one real PDF and one EPUB you own | Files you actually have can be read |
| **Narration** | #17 (speed test, send the result), #18 (Play → first sound), #2 (generate a chapter), #3–#5 (lock the phone, Lock Screen controls, next chapter while locked) | The fast natural voice works on your phone, including locked |
| **Saved progress** | #11 (close the app completely, reopen → same sentence), #21 (10 locked minutes counted) | You never lose your place |
| **Offline playback** | #10 (Airplane mode → play a generated chapter) | It works on a plane or a subway |

**Done when:** every item above is marked passed or failed in docs/TESTING.md, with the speed-test text from #17 pasted in. Cost: $0.

## Week 2: fix what week 1 found

| Item | Done when | Gate |
|---|---|---|
| One PR per failed item, each with a test that reproduces it (Chromium or WebKit CI) | Item re-run on the iPhone and passes | Owner merge (deploys automatically after tests pass) |
| If narration fails on device: act on the voice log (M1b) | Owner's speed test ≥ 1× listening speed, or a clear generate-ahead flow | Owner re-test |

## Week 3: storage

| Item | Done when | Gate |
|---|---|---|
| Compressed audio (AAC or Opus) instead of WAV, keeping the existing cache tests green | A 60-minute chapter stored in under 30 MB (WAV ≈ 174 MB); playback and resume tests pass in Chromium and WebKit CI | Owner merge |

## Week 4: remaining checklist and a decision

| Item | Done when | Gate |
|---|---|---|
| Run the other checklist items (#6–#9, #12–#16, #19–#23) | All marked | Owner |
| Decide on native iOS (M6) | Written yes/no. A yes means approving the $99/yr Apple membership. | **Owner decision and approval of the cost** |

## Not building in these 30 days

M2 library search, M3 free-book discovery, flashcards, learning plans, local AI, accounts and sync, CarPlay, new Growth Library content.
