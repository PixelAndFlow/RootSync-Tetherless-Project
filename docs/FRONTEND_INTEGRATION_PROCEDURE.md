# Frontend integration procedure

Prepared: 2026-10-22 (America/New_York).

This is a work plan, not a statement that integration is complete or that all
proposed interface changes have team approval. No application changes are part
of branch preparation. Keep this procedure local until reviewed for sharing.

## 1. Preserve the working baseline

- Start `chris-frontend-integration` from `chris` at `25158c0`.
- Track `pixelandflow/chris-frontend-integration` in the team repository,
  `PixelAndFlow/RootSync-Tetherless-Project`. `origin` is the personal repository.
- Keep `chris` unchanged. Do not merge the backend or DDIL branch wholesale into
  this frontend branch without reviewing repository-layout conflicts.
- Preserve existing untracked documents. Untracked files are working-directory
  files, not branch-specific; never use `git add .` to collect unrelated material.

## 2. Record the integration inputs and ownership

Verified code references at preparation time:

- Frontend: `chris`, `25158c0`; learner and Trainer gateways still use mocks.
- DDIL: `ddil-test`, `61fcf03`, including `536aa1b` and `eaf80cd`.
- Backend: `trial/2026-10-21-spec-v1.10`, `e2ceb7e`.
- Marc names `architecture/Tetherless_API_Spec_v1.20_2026-10-21.md` in the separate
  docs repository. Obtain and review that document before treating it as the
  final baseline; it has not been independently verified in this procedure.

Ownership proposal: Chris owns screens, presentation state, mock updates and
frontend API mappings; Naquan owns learner persistence, queue, transport and
offline preparation; Marc owns server validation, authorization and reporting.
Coordinate the shared gateway definitions before merging dependent changes.

## 3. Establish tests before modifying application behavior

Run the existing scripts from the frontend root in PowerShell and record results:

```powershell
npm.cmd run validate:content
npm.cmd test
npm.cmd run build
npm.cmd run check:bundle
npm.cmd run report:spanish-coverage
npm.cmd run check:performance
npm.cmd run test:device
```

Do not claim tests passed without execution. Report missing browsers or other
environment blockers separately from failures. Re-run relevant tests after each
small change, and the full suite before merging.

## 4. Align shared types and the frontend/DDIL boundary

- Inventory every consumer of content versions; update numeric versions and
  synthetic fixtures together. Preserve stable question/module identifiers.
  Do not invent a migration of real saved records from string versions.
- Use `occurred_at` for wire events. Keep local learner references out of wire
  identity; the server derives identity from the device token.
- Share UUID validation at the agreed boundary rather than implementing a
  second event factory or sync engine in React. TypeScript `string` alone is not
  runtime validation. Wire IDs must not use prefixes such as `evt-`.
- The backend currently allows eight event types. Ask whether Naquan's report
  of nine accepted types meant nine individual events; do not add a ninth type
  based solely on that wording.
- Coordinate exact gateway signatures with Naquan. His implementation already
  has `abandonAttempt` and `setContentVersion`; its mirrored interface still has
  the original ten methods. Agree how content version is pinned per attempt
  rather than relying on a mutable gateway-wide version for historical attempts.
- Agree signatures for `setupDevice`, `getLearnerProfile`,
  `listAssignedModules`, `prepareModuleForOffline`, and `getModule` before wiring
  real screens. Update frontend mocks alongside the agreed interfaces.
- Keep XP, streak and rank fields local; exclude them from server submissions.

## 5. Add authorization and sync presentation

- Add an explicit `blocked_auth` presentation state and mock scenarios.
- Do not discard pending answers, claim they synchronized, or suggest resetting
  storage when authorization fails.
- Show a neutral message such as: "Sync paused - this device needs authorization."
  Only show a recovery action when the error contract supports it.
- Naquan currently maps internal `blocked_auth` to frontend `retryable_error`.
  Coordinate the replacement with structured reason codes, not text matching.
- Marc's current learner device tokens do not expire on a timer. Resolve DDIL's
  automatic-expiry-recovery message with Marc and Naquan; do not promise that an
  invalid/revoked credential will recover automatically.
- Keep pending work and last successful sync distinct. Weekly sync reminders
  are an operational aid, not a seven-day storage guarantee.

## 6. Adapt onboarding and learner profile screens

- Implement setup code plus chosen username against mocks first; no name field.
- Add username, learner code with copy, and cohort to profile/settings.
- Handle invalid/used codes, username validation, network errors and delayed
  requests without duplicate submissions or exposing credentials in logs.
- Current server code requires a client-generated device UUID. Coordinate with
  Naquan so one stable ID is created/persisted for setup; do not generate learner
  identity in React. Marc's earlier wording needs confirmation against his code.
- Delegate token storage, profile persistence and learner API calls to DDIL.
- Do not mark a module "available offline" until DDIL confirms complete,
  validated local availability. Preserve an explicitly identifiable mock demo.

## 7. Adapt Trainer requests and error handling

- Add cohort-aware requests to the Trainer gateway and mocks.
- Map server snake_case fields to frontend camelCase in the API adapter, not
  separately in each screen. Handle null/missing results and empty cohorts.
- Handle `{error: {code, message, request_id, retryable, details}}` consistently;
  expose helpful user messages and a support request ID without leaking tokens.
- The backend calculates authoritative scores and uses server settings for
  thresholds. Do not treat module `passing_score_percent` as authoritative.
- Support server status codes while keeping user-facing labels configurable;
  the final wording for `struggling` is still pending stakeholder feedback.
- Decide how initial/best/latest/mastery appear without conflating XP with grades.
- Full staff administration is not authorized merely because endpoints exist.
  Agree Demo Day screens and ownership for login/password change, rosters,
  setup-code distribution, content, assignments and account management first.

## 8. Align content validation

- Inspect the shared validator and its complete dependency chain for browser
  compatibility and bundle impact before importing it.
- Prefer a shared package/version over silently copying divergent validators.
- Align `content_version`, optional `note`, and `activity_type`. Keep staff notes
  out of learner presentation; do not imply unsupported games are implemented.
- Add accepted/rejected fixture tests and field-specific errors. Use synthetic
  fixtures for public integration work, not additional RCO-supplied materials.
- Review RCO files already in public history separately with the team; do not
  move files, rewrite history, or assume the docs repository is private here.

## 9. Verify UI and behavior in both themes

- Test setup/profile, missions, question navigation, answer saving, results,
  remediation, sync status and Trainer states in dark and light modes.
- Preserve readable buttons, stable quiz-tile colors, flag controls, keyboard
  focus, Spanish support, responsive layouts and motion/contrast preferences.
- Verify delayed saves prevent duplicate answers; failed saves allow retry;
  feedback commits only after durable-save success.
- Test authorization/rejection states without loss of local work and ensure
  unknown errors have a safe fallback. Keep simulated behavior labeled as such.

## 10. Connect and prove one real learner flow

After shared signatures and adapter packaging are agreed, compose the adapters
at `GatewayProvider`; do not scatter storage or HTTP calls through learner UI.

Use a synthetic cohort and learner: staff creates learner/code and assigns a
module; learner sets up online, prepares the module, answers offline, closes and
reopens the browser, restores the attempt, reconnects and syncs. Verify duplicate
replay, server-calculated results and Trainer reporting. Also test interrupted
saving, authorization failure and rejected events.

Naquan's current live-server tests use fake IndexedDB; they do not prove real
browser durability. Test actual IndexedDB separately, then installed iPhone and
Android behavior. Verify PostgreSQL persistence across server restarts; the
memory-backed demo intentionally loses server data on restart. Real-device and
multi-day retention testing remain separate from Playwright viewport tests.

## 11. Review, document and merge

- Review diffs and stage only explicitly selected integration files.
- Update integration/status documents with what was actually implemented and
  tested, including remaining risks and contract revisions.
- Push small commits only to `pixelandflow/chris-frontend-integration` during
  integration. Do not commit credentials, real learner data, unrelated private
  handoffs or restricted RCO source documents.
- Obtain shared-interface review and passing acceptance checks before requesting
  a merge into `chris`. Do not merge to `main` or change teammates' branches as
  part of this procedure.

## Preparation status

The original branch-only preparation is complete. The subsequently authorized
frontend-only steps 1-9 (as scoped in the conversation) have now been implemented
locally with mocks and opt-in adapters. See `FRONTEND_INTEGRATION_STATUS.md` for
the exact scope and test evidence. This does NOT complete real integration in
step 10 above or the review/merge in step 11. Shared gateway adoption, real
persistence and staff-administration scope remain team dependencies.
