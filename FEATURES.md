# Features

What Tetherless can actually do today, grouped by who uses it. This is
a **living document** — update it in the same PR that adds, removes,
or materially changes a feature, not as a later cleanup pass. See
[Keeping this updated](#keeping-this-updated) at the bottom.

Last updated: 2026-11-02.

## Student (learner) experience

- **Device setup** with a staff-issued one-time setup code and a
  chosen username; no password on the device.
- **Mission library** showing the modules actually assigned to that
  learner's cohort or to them individually — not a free module choice.
- **Mission play**: multiple-choice questions with four answer
  choices, color-coded by team (Red/Blue/etc.), immediate feedback
  with a correct-answer outline and written explanation, flagged
  questions, and question navigation.
- **Scoring**: initial-attempt score is preserved even after later
  retries; current mastery, missed-question tracking, and full-retry
  support.
- **Remediation/practice**: targeted practice on missed questions,
  with its own saved progress and completion retry.
- **Review**: revisit a completed attempt's original questions and
  answer keys, including a historical module version if the learner
  was reassigned mid-attempt — never substitutes a different version's
  content.
- **Results**: score, mastery, topic and sector performance breakdowns.
- **Spanish Assist**: a toggle (`SpanishAssistToggle`) that overlays
  Spanish translations on English-first learner copy, module by
  module, without blocking an English-only draft.
- **Engagement layer** (deliberately separate from learning records):
  XP, streaks with a weekly skip day, sector checkpoints, a "Cyber
  Shield" meter, and mission badges. None of this affects scoring,
  mastery, or what a trainer sees.
- **Display preferences**: optional high-contrast, reduced-motion, and
  explicit dark/light theme — all per-device only, never inferred from
  the OS, never affecting learning records.
- **Offline-first**: a full mission can be played with no network;
  progress is saved locally and queued for sync; local-save, pending,
  syncing, synced, retryable-error, and rejected states are all shown
  honestly (see [Offline sync](#offline-sync-ddil) below).
- **Accessibility**: keyboard focus management after answering/
  navigating, accessible labels and live regions for answer feedback,
  a skip-to-content link, and automated WCAG checks in CI.
- **Settings**: profile fields, Student code (copy-only), display
  preferences, a manual-copy fallback when clipboard access is denied.

## Trainer reporting

- **Cohort dashboard**: every learner in a cohort with completion
  status, score, and mastery; sort, search, and completion filter;
  narrow-screen-safe table.
- **Learner detail**: per-module score, mastery, attempt/remediation
  counts, engagement time, sync state, topic performance, and sector
  performance, with accessible performance bars.
- **Falls back to the learner's real assignments** when no specific
  module is linked to — auto-selects a learner's one assigned module,
  offers a picker for several, or says plainly when there are none
  (fixed 2026-11-01/02, issues #6/#15).
- **Honest failure states**: a load failure is reported and retryable,
  never silently shown as empty data.

## Staff / Admin

Staff authorization is **permission-based**, not role-based — every
capability below is gated by a specific permission, independently
assignable per role by a Superadmin (see `ARCHITECTURE.md#permissions`).

- **Sign-in and session**: role-aware landing page, forced password
  change on first login, session expiry.
- **Cohorts**: create, rename, archive.
- **Learners**: create, edit, archive, reissue a setup code, remotely
  switch off a device, and a permanent, confirmation-gated purge
  (type the learner's code back to confirm).
- **Content/modules**: upload and validate a module (JSON, or CSV/
  Kahoot via the importer CLI), publish new versions, view an older
  published version, archive, and purge an unused module. A module in
  use (events or assignments exist) can be archived but never purged.
- **Assignments**: assign a published module to a cohort or an
  individual learner; unassign.
- **Staff accounts**: create (admin/trainer), enable/disable (with
  last-Superadmin and self-lockout protection), reset a password.
- **Role permissions**: a Superadmin can view and edit exactly which
  permissions each role (trainer/admin/superadmin) grants, at runtime,
  with no code change.
- **Score thresholds**: pass/struggling percentages are server
  settings a Superadmin controls — not hardcoded, not per-module —
  and changing them immediately reclassifies every learner's status.
- **Cohort export**: a downloadable file of a cohort's full data
  (learner records, devices, accepted/rejected events) for records or
  a privacy request — on the real server; the mock adapter's version
  is thinner and tracked as a known gap (#52).
- **Permanent delete (`data.purge`)**: the one irreversible action,
  restricted to Superadmin by default, cascades across every related
  table. **Currently has no guardrail requiring export-before-delete**
  — tracked as a priority gap to close (#53), not yet fixed.

## Content and curriculum

- **Module format**: a single JSON file per module (`TetherlessModule`)
  with stable module/question/choice/sector IDs, English-first copy
  with optional Spanish Assist, and a positive integer content version.
- **Validator**: checks schema, required identifiers, question count,
  score range, English copy completeness, duplicate IDs, missing
  correct choices, and dangling sector references — the same validator
  runs client-side (`npm run validate:content`) and server-side (on
  publish), so a module can't pass locally and fail in production.
- **Importer CLI**: converts CSV or a Kahoot spreadsheet export into
  the canonical module format; refuses to write a broken import.
- **Versioning**: publishing a new version never changes or removes
  the version a learner already has an attempt pinned to.
- **Two real published modules live in production today**: "Security
  Tools Basics" (v1 and v2) and "Phishing Basics" (v1). The module
  every learner screen is actually built/tested around, "Operation
  Cyber Squad," is validator-clean and ready to publish but has not
  been published to the real server yet (tracked in #7/#27).

## Offline sync (DDIL)

- Real IndexedDB-backed device identity and token (never
  `localStorage`), a local event outbox, and a sync engine that
  batches and sends queued events opportunistically on reconnect.
- Server-side idempotency: a resent batch (e.g. after a crash
  mid-request) is never double-counted.
- A lease mechanism prevents two overlapping sync attempts (e.g. two
  open tabs, or a reload mid-sync) from corrupting each other's state.

## Platform

- **Installable PWA**: Web App Manifest + service worker.
- **Two auto-deployed Render services** (frontend + API), redeploying
  on every push to `main`; self-hostable via `docker-compose.yml`
  (API + PostgreSQL + optional HTTPS).
- **CI**: full mobile-viewport, accessibility (axe), and visual-
  regression checks on every pull request; a separate backend suite
  runs against both the in-memory store and a real PostgreSQL service
  container.

## Known gaps (not yet built)

- A second game/activity format beyond multiple-choice — not decided
  (#42). A real, working but explicitly "not adopted" prototype exists
  at `prototypes/block-the-threat/` and may inform this decision.
- Bulk CSV roster import for learners (`checkRoster`/`commitRoster`)
  — split out as #43; manual learner-by-learner creation works today.
- A separate admin app — the whole product currently ships as one
  JS bundle; tracked in #48.
- Local push notifications and an outbound webhook (Systeme.io/Zapier)
  from the backend — neither exists yet.
- AI-driven analysis of performance data — `packages/analytics`
  computes rule-based scoring/active-time/reporting today; there is no
  LLM/ML component yet. "AI-driven" in the product brief is a target,
  not a current capability.
- Export-before-purge guardrail (#53) and mock/real export parity
  (#52) — see Staff/Admin above.

## Keeping this updated

When a PR adds, removes, or materially changes a feature:

1. Add or edit the relevant bullet above in the same PR — don't defer
   documentation to a follow-up.
2. Move an item out of **Known gaps** into its real section once it
   ships, instead of leaving both a "built" and a "not built" claim
   for the same thing.
3. Bump the **Last updated** date at the top.
4. If a claim here can't be verified by reading the current code (not
   memory, not a past conversation), don't write it — or mark it
   explicitly as planned/undecided like the gaps above.
