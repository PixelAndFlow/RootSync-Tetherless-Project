# Roadmap

**Status: built and deployed**, ahead of the fixed 7-week MVP window
ending at Pursuit Demo Day (2026-11-06). See
[`FEATURES.md`](./FEATURES.md) for the full, kept-current capability
list and the repo's GitHub issues for the live punch list — this file
gives the shape, not the day-to-day detail.

## Shipped

- Offline-first PWA core: installable, service worker, real
  IndexedDB-backed sync engine (device identity, event outbox, lease
  mechanics) — see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
- A real backend (Node.js, PostgreSQL in production) with
  permission-based staff administration, content publishing and
  versioning, assignments, and trainer reporting.
- Two real published training modules; a third
  ("Operation Cyber Squad") validator-clean and ready to publish.
- Rule-based scoring, mastery, and active-time analytics
  (`packages/analytics`) feeding trainer reports.

## Genuinely still open

- A second game/activity format beyond multiple-choice (undecided —
  see issue #42; a prototype exists at `prototypes/block-the-threat/`
  but was explicitly not adopted).
- Bulk CSV roster import for learners (issue #43) — manual
  learner-by-learner creation works today.
- A separate admin app, instead of one shared JS bundle (issue #48).
- Local push notifications and an outbound Systeme.io/Zapier webhook —
  neither exists yet.
- AI-driven analysis of performance data — today's analytics are
  rule-based; an LLM/ML component is a target, not a current
  capability.
- Real-device (not Chromium-simulated) testing on actual Android and
  iOS hardware — see the open real-device-testing issues.

This file should keep tracking reality going forward: when something
in "Genuinely still open" ships, move it to "Shipped" in the same PR,
the way [`FEATURES.md`](./FEATURES.md) already requires.
