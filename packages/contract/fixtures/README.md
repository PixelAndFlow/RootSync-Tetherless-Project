# Recorded staff-API responses

Real responses from a running server (`MemoryStore`, fixed clock), captured
by `packages/server/test/staff-contract-fixtures.test.ts` — not hand-written
samples. One file per response named in `../src/staff-api.ts`.

Regenerate with:

```sh
cd packages/server
node --test test/staff-contract-fixtures.test.ts
```

`staff_id`/`cohort_id`/`learner_id`/`device_id` and most timestamps are
server-issued and will differ on every run — that's expected, not a sign
anything broke. What should stay the same on a clean run is the *shape*:
the set of keys, and which ones are present on which response. If that
changes, either the test's own assertions fail first, or the diff on these
files will show it, which is the point of recording them at all
(`Tetherless_Contract_Drift_and_Naming_Proposal_v1.00_2026-10-25.md` §2.3,
point 3).

| File | Route |
|---|---|
| `staff-accounts.json` | `GET /v1/staff/accounts` |
| `cohorts.json` | `GET /v1/staff/cohorts` |
| `learners.json` | `GET /v1/staff/learners` — all four `LearnerStatus` values represented |
| `modules.json` | `GET /v1/staff/modules` |
| `assignments.json` | `GET /v1/staff/assignments` |
| `cohort-report.json` | `GET /v1/staff/cohorts/:id/report` |
| `learner-report.json` | `GET /v1/staff/learners/:id/report` |
| `error-validation.json` | a 422 from `POST /v1/staff/learners` with a missing required field |

Not yet recorded (same scope note as `staff-api.ts` itself): login/logout/me,
the password-change ack, roster-import envelopes, roles/permissions,
thresholds, and the plain `{ ok: true }` acks.
