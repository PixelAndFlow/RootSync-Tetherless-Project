# Assigned modules and local student progress — fixes

This update preserves Marc's five commits through `484756a` and corrects the four integration findings from the October 29 review. It implements fixes; the earlier draft PR #19 recorded the problems.

## Behavior

| Trigger | Corrected result |
|---|---|
| Reopen the app offline after downloading an assigned module | DDIL restores the saved assignment catalog and the package from IndexedDB. A network failure is no longer presented as an unknown-module 404. |
| A trainer assigns content after the student opened an empty library | Re-entering the library, reconnecting, or returning to a visible tab refreshes assignments. Concurrent requests remain deduplicated. |
| Leave an unfinished full attempt and later finish a new one | Initial score, completion time and initial misses come from the first valid completed full attempt. Unfinished and abandoned history is preserved. |
| A new module version retires old questions | Current mastery and answered counts use the applicable current question set. Historical attempts retain their answers and content versions. |

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

## Local verification

- Frontend: 171 tests passed across 40 files; the final affected-file rerun passed 11 tests.
- DDIL: 89 tests passed, including five attempt/progress regressions.
- Existing Playwright suite: 96 passed, four intentionally skipped across five Chromium viewport profiles. The long practice/retry scenario is configured to run only on the first profile.
- New local browser/API regression: passed using actual browser IndexedDB and the production service worker.
- Production build, TypeScript and bundle/performance budgets: passed.

These results cover the isolated fix branch locally. GitHub checks and team review are separate merge requirements.

## Boundaries

- This does not approve unanswered scope changes in the Decision Register.
- Attempt restoration and broader historical-version review UI remain separate work in the frontend plan.
- No deployed API, real PostgreSQL or physical-device acceptance is claimed by the local browser test.
- Contract tests have a pre-existing Windows CRLF-sensitive YAML parser problem, reproduced on main during review; this PR does not change that parser or the contract.
- Merge through the normal team review process before updating the shared presentation build.
