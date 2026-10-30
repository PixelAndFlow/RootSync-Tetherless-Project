# Assigned modules and local student progress — fixes

This update preserves Marc's five commits through `484756a` and corrects the four integration findings from the October 29 review. It implements fixes; the earlier draft PR #19 recorded the problems.

## Behavior

| Trigger | Corrected result |
|---|---|
| Reopen the app offline after downloading an assigned module | DDIL restores the saved assignment catalog and the package from IndexedDB. A network failure is no longer presented as an unknown-module 404. |
| A trainer assigns content after the student opened an empty library | Re-entering the library, reconnecting, or returning to a visible tab refreshes assignments. Concurrent requests remain deduplicated. |
| Leave an unfinished full attempt and later finish a new one | Initial score, completion time and initial misses come from the first valid completed full attempt. Unfinished and abandoned history is preserved. |
| A new module version retires old questions | Current mastery and answered counts use the applicable current question set. Historical attempts retain their answers and content versions. |
| A historical attempt is opened after a different module version is assigned | Initial correct counts and read-only review load the first completed attempt's original package. Current mastery remains based on the current package. |
| The original package or saved record is unavailable | Results/review show an unavailable state, rather than silently substituting the assigned version or leaving a rejected promise unhandled. |
| Retired missed questions are no longer in the assigned package | Practice sends only question IDs present in that package, and the debrief does not offer practice when none of the original misses are eligible. |

Catalog fallback is scoped to the saved student and device. It permits offline/network/server-outage access but does not hide authentication, permission, malformed-response or other client errors. A valid saved empty list is distinct from never having loaded assignments. Download states are recalculated from the cached packages.

Local reconstruction follows device sequence rather than a changeable phone clock, counts the first answer per question within an attempt, and checks full-attempt completion against that attempt's package when available. Local figures remain projections; server analytics remains authoritative. The shared frontend/DDIL attempt types now retain optional `contentVersion` and the `abandoned` status. API routes, wire fields, event version and database schema are unchanged.

## Run the regression checks

```powershell
npm ci
npm test
npm run test:ddil
npm run build
npm run test:student-api
npx playwright test --workers=2
```

`test:student-api` requires installed Google Chrome. It starts a disposable local MemoryStore API, creates synthetic staff/student data, builds a separate production frontend in `node_modules/.cache/student-api-dist`, and drives the real screens with browser IndexedDB and the service worker. It verifies new assignments in the same app instance, a completed result after restarting an attempt, a full offline page reload, and the resulting server report after synchronization. It does not read deployed credentials, modify Render or use an existing database.

Frontend PR CI now runs the DDIL suite and this local browser/API regression as well as the existing checks.

## October 30 review corrections

The combined PR #18/#20 review found that the results screen could show `-1/1` correct when an older two-question attempt was compared with a newer one-question package. The review screen could label newly added questions as initial misses. `useInitialAttempt` now loads the original record first, selects its first completed full attempt, and loads that attempt's explicit content version. Live records without a version and mismatched downloads are rejected honestly; legacy fixture-only records remain supported.

Read-only correct/missed/all filters require an original answer. Filter changes reset the question index. Practice continues to use the assigned version and excludes retired IDs from its payload. No scores or historic events are rewritten.

The browser feedback waits now target the feedback `div`, avoiding the temporary saving `p` with the same `aria-live` attribute. The same correction is included in the existing e2e helpers.

Twelve new regression tests cover historical counts, original content/answer keys and all filters, filter navigation, unavailable/missing/mismatched versions, record read failures, legacy mock compatibility, and the practice question list.

## Original verification (October 29)

- Frontend: 171 tests passed across 40 files; the final affected-file rerun passed 11 tests.
- DDIL: 89 tests passed, including five attempt/progress regressions.
- Existing Playwright suite: 96 passed, four intentionally skipped across five Chromium viewport profiles. The long practice/retry scenario is configured to run only on the first profile.
- New local browser/API regression: passed using actual browser IndexedDB and the production service worker.
- Production build, TypeScript and bundle/performance budgets: passed.

These results cover the isolated fix branch locally. GitHub checks and team review are separate merge requirements.

## Boundaries

- This does not approve unanswered scope changes in the Decision Register.
- In-progress attempt restoration remains separate work. Historical first-attempt results/review are included in the October 30 corrections above.
- PR #18's existing lease-safety finding and application credential-recovery wiring are separate work; these frontend fixes do not resolve them or merge #18.
- No deployed API, real PostgreSQL or physical-device acceptance is claimed by the local browser test.
- Contract tests have a pre-existing Windows CRLF-sensitive YAML parser problem, reproduced on main during review; this PR does not change that parser or the contract.
- Merge through the normal team review process before updating the shared presentation build.
