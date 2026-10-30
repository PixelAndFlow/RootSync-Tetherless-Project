# Frontend happy-path fixes — 2026-10-30

## Branch and review dependency

- Team repository: https://github.com/PixelAndFlow/RootSync-Tetherless-Project
- Branch: `chris-frontend-happy-path`.
- Baseline: PR20 commit `b0da0acc2b7ea636bff5bab684826b922792d477`, including the PR18 DDIL changes.
- This follow-up contains frontend fixes; it does not merge or replace PR20.
- While PR20 is open, review the follow-up against `chris-frontend-marc-fixes` so its diff contains only the new work.
- After PR20 merges, update this branch against team `main`, retarget the follow-up to `main`, verify the resulting diff, and rerun required checks before merging.

## Completed work

| Agreed item | Previous problem | Result |
| --- | --- | --- |
| 1. Answer saving and completion | A failed progress read could claim a committed answer was not saved. Completion failures escaped without recovery guidance; repeated clicks could overlap writes. | Saved feedback survives a progress-refresh failure. Mission and practice completion have busy guards, visible errors, and retry controls. Navigation waits for successful local completion. |
| 2. Student identity restoration | UI identity depended on localStorage even though real enrollment was stored by DDIL. Presentation-cache failure after setup could send students back through a consumed code. | Live startup restores identity from `getLearnerProfile()` after gateway initialization. Recovery failures block fresh setup and offer retry. A localStorage write failure cannot undo committed live enrollment. Tokens are not copied into the presentation cache. |
| 3. Interrupted-attempt resumption | Opening a mission allocated another attempt. Restart tests did not establish same-attempt recovery. | Mission and practice restore the unfinished attempt, saved choices/feedback, and next unanswered question. Recovery resolves the attempt's pinned content before today's assignment, so an undownloaded newer assignment does not replace the saved package. Missing history produces a recoverable error rather than a new attempt. Exit pauses the attempt; it does not claim to abandon it. |
| 4. Practice reliability | Record/start failures could leave indefinite loading or prevent retry. | Explicit loading, empty, error, and retry states; recovered practice retains its original question set, including answers already corrected in that attempt. |
| 5. Module validation | Downloaded content was cast to a TypeScript type and cached without runtime validation at that boundary. | The existing shared publishing validator checks downloaded and cached packages. Requested ID/version and supported schema/activity are checked before use. Invalid downloads are not cached. Choice keys differing only by case are resolved to the supplied choice ID to match the shared schema's case-insensitive rule. |
| 6. Trainer detail links | A live detail URL with no module selected defaulted to a demo module. | Live links without a module show a selection message and do not request a demo report. Existing API errors remain visible. |
| 7. Live wording/navigation | Live screens described student storage/sync as simulated; shared sign-in highlighted Staff after selecting Trainer. | Live copy describes local saving and acknowledged synchronization. Demo instructions stay in mock mode. Trainer entry preserves its destination through ordinary sign-in and its navigation selection; sign-in includes a Student setup link. Demo reset controls are hidden in live mode. |
| 8. Verification | Prior evidence did not cover these frontend recovery paths. | Added identity, package-validation, mission/practice retry, pinned-version recovery, missing-module link, and navigation tests. Strengthened the real local API/browser test with offline close/reopen, missing presentation cache, same attempt ID, and retained first-answer assertions. |

Implementation commits:

- `ba4492d`: durable enrollment restoration.
- `6226089`: pinned attempt recovery and local failure handling.
- `aaf68f0`: module validation before offline caching.
- `78107a2`: live copy and trainer navigation.

## Validation

Confirmed checks:

- Frontend suite: **210 passed across 44 files**.
- TypeScript and production build: **passed**.
- DDIL suite: **96 passed**.
- Native IndexedDB/browser checks: **8 passed**, comprising seven scenarios and their parent test.
- Local production frontend/API journey: **passed**, including real browser IndexedDB, service-worker offline reopening, same-attempt recovery, completion, server reporting, and controlled 401/recovery checks.
- Full Playwright suite: **96 passed, 4 existing intentional skips**, across five Chromium viewport profiles. No visual baselines were changed.
- Bundle/performance budgets passed: total production bundle **696.7 KB** against the 1 MB guardrail; JavaScript **152.7 KB gzip**, CSS **9.1 KB gzip**. Vite retains its advisory about a JavaScript chunk exceeding 500 KB.

The first GitHub quality run failed at the API/browser synced-state assertion after the frontend tests, DDIL tests, and build passed. Investigation identified a test lifecycle race: after reconnecting, the test started a separate offline reload before the reconnect batch's local acknowledgements had committed. Server reporting can already show completion while that local batch still holds live 60-second leases; a page reload can interrupt the client before it records receipt.

The correction holds a real API response behind an explicit gate and proves that distinction: the server report reaches 100% while local records are still inflight. After releasing the response, the test requires every local delivery to become acknowledged before starting the independent reload scenario. The corrected local run passed and observed 21 inflight records at the controlled boundary. It retains the offline close/reopen, same-attempt, server-score, and 401-recovery assertions. Production sync behavior, lease durations, and the failing heading's five-second timeout were not changed. GitHub CI must pass on the correction before this PR is considered ready for review completion.

## Boundaries and remaining acceptance work

- No backend endpoint, event payload, database migration, sequence-allocation algorithm, lease algorithm, or authorization-recovery contract changed. The DDIL gateway change is limited to validating module content at its cache boundary.
- Mock/demo mode remains available. Its in-memory attempt data still does not survive a page reload.
- Real tests use a disposable local API with **MemoryStore**, not hosted PostgreSQL. Controlled 401 responses do not prove the deployed credential-restoration process.
- Same-attempt recovery is not a guarantee of cross-tab coordination of the learning UI itself. Existing native tests cover sequence allocation and delivery claims across tabs; simultaneous editing of one attempt is not newly certified here.
- Browser close/reopen tests retain the browser context and origin storage. They do not certify OS process termination, storage eviction, iOS/Safari, or physical Android/iPhone behavior.
- Hosted HTTPS frontend availability, current PostgreSQL reads/writes, working team test credentials, approved module assignments, live reports, and physical-phone acceptance still require the team's shared environment and review.
- Staff content publishing/assignment UI, permission/session integration, and server logout are separate remaining work. This PR does not claim to complete them.
- The complete hosted happy path remains **unconfirmed** until those checks pass on the reviewed release candidate.

## Sources and intent

This follow-up implements the eight frontend tasks agreed with Chris. Concrete findings came from PR20's code and tests, Marc's handoff, and team issues including [#7](https://github.com/PixelAndFlow/RootSync-Tetherless-Project/issues/7), [#14](https://github.com/PixelAndFlow/RootSync-Tetherless-Project/issues/14), [#15](https://github.com/PixelAndFlow/RootSync-Tetherless-Project/issues/15), and [#17](https://github.com/PixelAndFlow/RootSync-Tetherless-Project/issues/17).

Compatibility follows existing gateway interfaces and the shared content schema. PRD v1.00, API Spec v1.30, and accepted decisions remain the project references; the Decision Register contains recommendations rather than presumed team approvals. This is an implementation report, not a new canonical document or a fresh audit of every PRD requirement.
