# PR21 update after PR20 merged — October 30, 2026

## Current review and integration state

- Team repository: [PixelAndFlow/RootSync-Tetherless-Project](https://github.com/PixelAndFlow/RootSync-Tetherless-Project).
- PR20 merged into team main at `24375331b7bcbc5e5c3671665d60e1b22372cecd`.
- Branch `chris-frontend-happy-path` now includes that main history through merge `c4cc0f2`.
- [PR21](https://github.com/PixelAndFlow/RootSync-Tetherless-Project/pull/21) now targets **main** and remains **Draft**. It no longer targets the old PR20 branch.
- Implementation tested for this update: `eaf864a88f1de32713818e21807267ff473c380b`. Later documentation and browser-assertion changes do not change that application implementation.
- Review PR21's diff against main, including the conflict resolution. Once required checks and team review are satisfied, merge PR21 into main and test the exact deployed merge commit. No further PR20 merge is required.

This report supersedes the integration instructions and frontend observations in the earlier acceptance record. The prior failure where main displayed the built-in module described main `9e1fb71` before PR20 merged; it must not be attributed to current main without a new test.

## Changes made in this update

### Preserve main's setup and identity fixes

Main contained two Marc commits beyond PR20's source branch: durable identity recovery and revised setup re-entry behavior. They overlapped with PR21's profile provider and tests.

The resolved provider retains recovery from a prepared mock gateway, preserves an existing demo profile, and tolerates presentation-cache write failures. Live mode still restores identity from DDIL before rendering student routes, does not trust stale local identity, and shows an actionable recovery failure rather than silently opening enrollment. Main's atomic `device_token`/`learner_profile` IndexedDB transaction remains intact, as does its server-mediated setup re-entry behavior. No setup, event, token or server wire contract was changed.

Regression checks exercise the combined behavior, including main's demo recovery and PR21's live recovery/storage-failure cases. Resolving the conflict did not revert main's `setMetaMany` change.

### Use consistent percentage precision

The student gateway now uses the existing `score()` helper from `packages/analytics/src/scoring.ts` for returned/replayed initial score and current mastery. This uses the server's existing one-decimal precision rather than maintaining a second rounding formula.

For **14/15**, the student and trainer now both display **93.3%**. Offline practice preserves that initial score and raises mastery to **100%** when the missed question is corrected. Correct-answer counts, immutable events and backend scoring authority remain unchanged. A regression verifies completion, stored replay and reopening on the 14/15 case.

### Render module-specific descriptions and checkpoints

Mission details use supplied `mission_brief`, then subtitle, then neutral fallback text. Topic names come from the published topic labels or actual question topics. The UI no longer describes every module using the built-in Cyber Squad introduction.

Checkpoint maps render only when the package supplies sectors. Their count is derived from those sectors, including the singular case. Phishing Basics now shows actual phishing topics and no invented “Four checkpoints” section. Tests cover supplied descriptions/topics, absent metadata and a one-checkpoint package.

## Separate backend blocker

[Issue #11](https://github.com/PixelAndFlow/RootSync-Tetherless-Project/issues/11) now records the confirmed PostgreSQL startup defect, with **Marc / PixelAndFlow** as the existing assigned owner. Its body includes direct SQL evidence, reproduction steps and acceptance criteria. The backend correction is deliberately separate from this frontend PR.

A fresh PostgreSQL database successfully starts once and stores the complete journey. A second `PgStore.connect()` fails with:

```text
constraint "events_event_type_known" for relation "events" already exists
```

The constraint exists but the migration ledger contains only versions 1 and 2. Migration 3 adds the constraint without recording version 3; the migration runner then repeats it on startup. This was reproduced again on `eaf864a` after incorporating main.

This PR does not change migration SQL, migration bookkeeping or the hosted database. Acceptance for the separate fix includes fresh/repeated startup, the already-applied-constraint/missing-ledger state, and preservation of learner/events/reports. Hosted migration state must be inspected rather than assumed to match the local test.

## Refreshed acceptance evidence

The production frontend and actual backend code were tested with **PostgreSQL 16.15**, isolated disposable local Docker storage, and desktop Chrome. Student viewport: 375×667; staff/trainer: 1280×900. Only synthetic local accounts/data were used.

On implementation `eaf864a`, the core sequence passed:

1. Staff signs in, completes required password change, selects a cohort, creates a student, and reveals/dismisses the one-time code through the UI.
2. The student enrolls with that code; another device cannot reuse it.
3. The real assigned **Phishing Basics v1, 15 questions** loads; its description/topics are accurate and no nonexistent checkpoint map appears.
4. An answer is saved online; another is saved offline. The page closes and reopens offline with its optional localStorage presentation cache removed.
5. DDIL restores the student, same attempt ID and both saved answers; the remaining questions complete offline.
6. Initial result is **14/15, 93.3%**. Practice corrects the miss and raises mastery to **15/15, 100%**, preserving the initial score.
7. Read-only review writes no answer/completion events.
8. Reconnection preserves all **16 answer-event IDs** and commits their acknowledgements.
9. PostgreSQL/reporting contains **24 accepted events, zero rejected events and no sequence gaps** in this recorded run. Event totals can vary with legitimate lifecycle/heartbeat events; the answer count remains 16.
10. A separate trainer account sees the cohort/student/module results through the UI, switches to an empty cohort without stale rows, and opens the correct detail. Unauthorized administrator-account creation is rejected.

**Result: 16 core checks passed; one additional backend-restart check failed.** The browser recorded no `pageerror` exceptions. This confirms the controlled core journey, not full release acceptance.

Cohorts and module assignments were prepared using the real staff API because the full management UI is still incomplete. Browser reopening retains the Chrome context's origin storage; this is not physical-phone, OS termination or eviction certification. Public HTTPS deployment, hosted PostgreSQL and actual iPhone/Android acceptance remain separate.

## Validation summary

- Frontend: **214 passed, 44 files**.
- DDIL: **99 passed**.
- Native browser/IndexedDB: **8 passed** (seven scenarios plus parent).
- Production frontend + local API test: **passed**, including offline same-attempt recovery and the held-response acknowledgement regression.
- TypeScript/production build and size/performance budgets: **passed**. Total production bundle 697.1 KB; JS 152.9 KB gzip and CSS 9.1 KB gzip. Vite's existing >500 KB chunk advisory remains.
- Playwright regression: **91 passed, 4 existing intentional skips** in the full run; five theme checks initially expected obsolete checkpoint copy. After updating that assertion and adding checkpoint-label checks, their separate rerun was **5/5 passed**. Together these cover all 96 runnable cases; GitHub CI will rerun the full suite on the pushed head. No visual baselines changed.
- GitHub CI is authoritative on the pushed PR head; do not interpret older successful runs as approval of a new commit.

The raw refreshed screenshots, recordings, traces, SQL evidence and JSON results are retained locally in `docs/happy-path-acceptance-2026-10-30-pr21-update/`. A downloadable evidence archive accompanies the local report. Large recordings are not added to the source repository.

The previous same-value cohort-selection automation edge remains outside this update's scope. No broader staff/content operations, deployment changes or backend restart fix are claimed here.

## Remaining path to freeze

1. Review PR21 against current main, including preservation of Marc's setup changes; merge only after required checks and review.
2. Resolve issue #11 in a focused backend change and verify repeated real-PostgreSQL startup.
3. Run acceptance on the combined main merge commit and hosted environment with approved test accounts/content.
4. Complete team physical-device checks and explicitly identify any deferred management operations.

Supported presentation statement: **the core student journey passed locally on the named candidate with real PostgreSQL, preassigned content, offline recovery, synchronization and actual trainer reports.** Do not claim fully accepted release/deployment or restart reliability while issue #11 remains open.
