# Frontend integration preparation - steps 1-9

Date: 2026-10-22 (America/New_York). Branch: `chris-frontend-integration`.
Base: `25158c0`. Application changes are local and uncommitted until explicitly
reviewed/committed. No team message has been sent and no real API is enabled.

## Inputs checked

- Frontend baseline and existing tests/contracts at `25158c0`.
- Naquan's `ddil-test` at `61fcf03`, including HTTP transport and live-server tests.
- Marc's `trial/2026-10-21-spec-v1.10` at `e2ceb7e`, including routes, response
  construction, scoring, authorization, content types and validator dependencies.
- Team messages supplied by Chris, including Nick's setup/role preferences.
- The separate docs-repository v1.20 specification remains to be reviewed. Code
  compatibility does not establish that a trial has been formally adopted.

## What is implemented

| Preparation step | Result | Boundary retained |
| --- | --- | --- |
| 1. Baseline tests | Unit/build/content/coverage/budget checks recorded; baseline browser issues recorded below | No claim of hardware or real DDIL durability |
| 2. Setup screen | Setup code + username; validation, pending/duplicate-submit protection, safe errors and storage-failure handling | Synthetic `DEMO-2026` only, not server enrollment |
| 3. Profile/settings | Username, learner code, cohort, copy/manual-copy fallback, existing display preferences | Local demo identity only; no tokens/setup codes persisted |
| 4. Authorization presentation | `blocked_auth`, readable status and guidance, disabled sync action, preserved pending records; blocked state remains visible offline | No token refresh/relink mechanism or promise of automatic recovery |
| 5. API errors | Safe structured error normalization, field hints, request ID, missing-auth/network/invalid-response behavior | No raw server exception text, secrets, automatic retries or credential storage |
| 6. Trainer adapter preparation | Opt-in cohort/report/detail/summary API adapter with checked response mappings and synthetic response tests | Not installed in the current mock Trainer screens; staff login remains unconnected |
| 7. Content compatibility | Numeric sample versions, optional staff note/activity type, UUID guard and eight-event wire reference; browser-bundle test of pinned shared validator | No duplicated DDIL event factory, real-data migration, or unsupported game implementation |
| 8. UI regression | New setup/profile/theme tests plus existing quiz, Spanish, flagging, save, review and remediation checks; separate integration snapshots | Chromium simulations are not native Safari/iOS/Android tests |
| 9. Documentation | This report, procedure status, content guide, mock scenarios and README updated | Handoff remains a draft, not a team decision |

## How to try it locally

Run `npm.cmd run dev`, open the local learner route, and use setup code
`DEMO-2026` with any valid username (2-24 permitted characters). The synthetic
code is repeatable; real setup codes will be single-use and online-only.

Existing demo profiles still open without being erased. Use the development
reset control only if you intentionally want to remove the demo profile and try
setup again. Do not use reset/clear-data as an authorization recovery strategy.

Profile and settings are at `/#/learner/settings`. Quiz answers still use the
in-memory mock and do not survive page reload. The banner explicitly identifies
sample data and simulated sync. This build is not a production offline app.

## Interface boundaries and intentional differences

- The original ten `OfflineLearningGateway` method signatures remain unchanged.
  `SyncStatus` adds `blocked_auth` and `SyncSummary` adds an optional structured
  presentation reason. Naquan's mirrored types must be aligned before merging.
- The optional mock-only `LearnerSetupGateway` is an isolated preparation seam.
  It is not asserted to be the final DDIL setup contract. There is deliberately
  no HTTP setup implementation, token persistence or silent mock fallback when
  the setup seam is absent.
- `ApiTrainerReportsGateway` is separate from the existing `TrainerDataGateway`.
  The server does not supply all fields required by the old mock model. The new
  adapter preserves nullable scores and `mayHaveUnsyncedWork`; it does not invent
  XP, streaks, sector mastery, or a "synced" status for a learner device.
- The status code `struggling` maps to provisional display text "Needs support"
  in one place. This is not RCO-approved wording and is not wired into screens.
- `TetherlessEvent` in the legacy types is explicitly local/demo-only and still
  has the old shape for compatibility. It must not be serialized. The isolated
  wire reference uses `occurred_at` and omits payload-supplied learner identity.
- Runtime event validation remains DDIL/server-owned. The frontend UUID guard
  validates API input shape only; it is not a complete wire-envelope validator.

## Content and validator findings

`npm.cmd run check:shared-content` reads the validator directly from the pinned
Git commit `e2ceb7e` and bundles it in memory for the browser. It requires that
commit to have been fetched locally; it is not part of the default CI suite.

The direct `tetherless-module.ts` entry and dependencies `issues.ts`, `text.ts`,
and `schema.ts` bundle without Node runtime dependencies: 12,184 bytes minified.
Avoid importing the package-wide index blindly: it also exports file importers.

Both local fixtures and the template pass the shared validator with zero errors;
they have 1, 1 and 2 warnings respectively. The local fixture validator remains
for development checks; no copy of Marc's validator has been added to the app.
Agree a browser-safe shared package/export before using it for real downloads.

The three sample content files now use numeric version 1. This is a reset of
demo fixture numbering, NOT a general mapping of semver strings to server
versions, and NOT a migration of any real learner records. Published modules
must use their actual server-issued version. Existing RCO reference documents
were not changed or recopied.

## Validation record

Baseline before application edits:

- Unit tests: 44 passed across 13 files.
- Production build, content tests, translation coverage and budgets passed.
- Browser suite: 64 passed, 4 intentional skips, 7 failures. Five were stale
  original screenshots; two were HTTP navigation failures while another build
  ran concurrently. Subsequent runs do not rebuild while a browser suite runs.
- Restricted-sandbox esbuild startup failed; reruns with approved filesystem
  access succeeded. This was an environment restriction, not a test failure.

After changes:

- Unit tests: 80 passed across 19 files.
- Content tests: 15 passed; Spanish coverage: 99/99 (100%).
- Production build and budget checks pass: JS 414.55 kB (126.42 kB gzip), CSS
  48.40 kB (9.02 kB gzip), total bundle 565.7 KB under the 1,024 KB guardrail.
- Shared-validator browser and fixture checks pass as described above.
- First updated browser run: 86 passed, 4 intentional skips. New integration
  snapshots were generated separately; original `chris` snapshots are preserved.
  Representative dark/light profile and Android/iPhone quiz screenshots were
  visually inspected. Final no-update screenshot verification is recorded below.
- The four skips avoid repeating the full remediation/retry workflow on every
  viewport; that full workflow runs on the minimum Android viewport, while core
  flows run on all five Chromium viewport profiles.

## Remaining work for team integration

Naquan:

1. Agree/publish the expanded gateway signatures and packaging, including setup,
   profile, assigned modules, complete offline preparation and module retrieval.
2. Align the frontend `blocked_auth` state with structured reasons and remove
   unsupported automatic-expiry-recovery wording. Current server device tokens
   do not expire on a timer.
3. Pin numeric content versions per attempt; align existing abandonment support.
4. Validate actual IndexedDB persistence, reopening, quota failures and device
   behavior. The current live-server test still uses fake IndexedDB locally.

Marc:

1. Confirm the reviewed code/OpenAPI and cleaned spec as the integration baseline.
2. Confirm client-generated device UUID behavior (the implemented setup route)
   supersedes earlier handoff wording, and agree authorization reason/recovery
   codes with Naquan.
3. Agree the browser-safe validator distribution and module version policy.
4. Confirm minimum staff screens, final reporting wording, and PostgreSQL-backed
   test setup/results. Expanded endpoints do not automatically authorize a full
   administration portal for this frontend step.

Together: connect adapters through the provider, test enrollment through Trainer
results with real persistence, and review shared types before merging into
`chris`. No separate interactive games, full staff portal, service worker,
IndexedDB implementation or database work was added here.

## Draft team update (not sent)

Frontend preparation is implemented locally on `chris-frontend-integration`:
mock-backed code/username setup and profile/settings, authorization-paused UI,
standard error handling, cohort-aware reporting adapter tests, numeric fixture
versions and shared-validator compatibility checks. The existing quiz/demo is
preserved. The live reporting adapter is opt-in; real enrollment, DDIL storage,
offline downloads and sync are not connected yet. Next we need the agreed
gateway signatures/package, authorization mapping and minimum staff UI scope,
then a joint real-browser/Postgres integration test.
