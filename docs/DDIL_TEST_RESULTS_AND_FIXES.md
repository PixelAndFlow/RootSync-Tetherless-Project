# DDIL integration, fixes, and verification

Updated October 30, 2026 for the combined implementation in PR #20.

Naquan's PR #18 at `4b9287e` is incorporated into `chris-frontend-marc-fixes` through merge commit `7fcc32c`, preserving his commits and authorship. Marc's integration commits and Chris's frontend corrections remain included. Main and the original `ddil-test` branch are unchanged by this integration.

## Implementation and review corrections

| Area | Implemented behavior |
| --- | --- |
| Event persistence | An event and its initial delivery row commit together. Answer feedback waits for save completion. Synchronization does not delete immutable events. |
| N6 sequence allocation | Naquan's `reserveDeviceSeq` allocates through one native IndexedDB read/write transaction. Its put is issued inside the read callback, and success waits for commit. Web Locks and the per-realm queue remain additional guards. |
| Concurrent claims | Selecting eligible delivery rows and claiming them now share a read/write transaction. Two tabs cannot both claim an unchanged pending snapshot. |
| N4 late responses | Each claim has a unique local `lease_id`; default gateway owners are unique per initialized instance. Applying an outcome checks the current row, exact claim, owner, inflight status, and live expiry in the same transaction as the write. |
| Recovery races | Expiry recovery, auth reopening, failed-event reopening, and lease renewal read current delivery rows inside their update transaction. The specific response/expiry/auth acknowledgment races from review have native-browser regressions. |
| Single flight | An engine rejects overlapping passes from the same instance even when Web Locks are unavailable. Cross-tab safety also relies on atomic claims. |
| N3 explicit recovery | `recoverAuth()` is retained and exposed as an optional frontend capability. Starting a mission/session never unblocks authorization. Normal sync leaves the whole queue paused if any records are blocked, including newly saved work. |
| Production credential check | Recovery reloads the protected stored token and makes an uncached authenticated `GET /v1/me/modules` before unblocking. A missing/invalid/revoked credential or network error leaves deliveries paused. Test gateways without an API use the injected transport seam. |
| Recovery UI | The sync screen offers an explicit “Check authorization” action after staff assistance. A failed check preserves the queue and explains that work remains saved. No token-entry screen, new login API, or automatic credential replacement is invented. |
| Status mapping | DDIL exposes the frontend's existing `blocked_auth` status. It remains visible offline. Recovery remains discoverable when rejected work also exists. Display text does not promise automatic token renewal. |
| Harness | Naquan's deferred fake transaction commit is retained. Scheduler-sensitive sleeps in the single-flight scenario are replaced by transport-entry barriers; responses acknowledge the actual event IDs sent. |

The optional local `lease_id` field requires no new IndexedDB store/index or backend migration. It is never sent in event envelopes. Older inflight rows without a claim token recover after lease expiry; local answers are retained. API paths, canonical wire fields and event schema version remain unchanged.

Sequence reservation and event persistence are separate transactions: this does not claim a crash-atomic counter/event/delivery triple. The fake still does not reproduce native transaction scheduling or every browser's storage behavior; the native tests provide distinct evidence.

## Verification commands and evidence

```powershell
npm test -- --maxWorkers=2
npm run test:ddil
npm run test:ddil-browser
npm run build
npm run test:student-api
npx playwright test --workers=2
```

- Frontend: **184 tests** across 41 files passed, including historical-version and failed-recovery UI regressions.
- DDIL: **96 tests** passed on this combined branch. These include four new rollback, lease-generation, expiry, and authorization regressions. The original standalone PR #18 had 83 tests; earlier PR #20 had 89.
- Native IndexedDB: **seven scenarios plus the parent test passed** (`node:test` reports 8). Two actual Chrome tabs, with Web Locks disabled, produced 200 unique sequences. Competing claims, same-owner replacement, response/expiry/auth acknowledgment races, and rollback are covered.
- Browser/API: the production app and disposable real local API passed setup, assignment refresh, interrupted/restarted attempts, completion, offline reload, reconnection and report checks. An additional saved answer survived a controlled 401; failed recovery preserved the blocked event IDs; a real protected API check then allowed acknowledged delivery.
- Production TypeScript/build and repository bundle/performance budgets passed. The existing Vite chunk-size advisory is separate from the passing budgets.
- Full Playwright: **96 passed, four intentionally skipped** across five Chromium viewport profiles. Final GitHub CI results are recorded in PR #20. Visual baseline files are unchanged.

The native acknowledgment-race tests deliberately schedule another database connection at the old read/write boundary. They reproduce an allowed interleaving; they do not estimate its frequency on phones.

## Contract and document references

- [API and Integration Spec v1.30](https://github.com/PixelAndFlow/RootSync-Tetherless-Project-Docs/blob/a8b35bcd74bbd68f14cc6d5050290c3d410086df/architecture/Tetherless_API_Spec_v1.30_2026-10-21.md)
- [PRD v1.00](https://github.com/PixelAndFlow/RootSync-Tetherless-Project-Docs/blob/a8b35bcd74bbd68f14cc6d5050290c3d410086df/prd/Tetherless_PRD_v1.00_2026-10-21.md)
- [Recorded team decisions](https://github.com/PixelAndFlow/RootSync-Tetherless-Project-Docs/blob/a8b35bcd74bbd68f14cc6d5050290c3d410086df/decisions/README.md)
- [Shared executable contract](../packages/contract/src/index.ts), [OpenAPI](../packages/contract/openapi.yaml), and [student flow fix notes](STUDENT_FLOW_FIXES_2026-10-29.md)

API document v1.30, OpenAPI metadata `1.10.0`, and event `schema_version: 1` are different version labels. Module files retain snake_case; app interfaces remain camelCase.

Per-event validation refusals are rejected items in a successful batch response, not a blanket 422. The corrected field scenarios use canonical `UNKNOWN_QUESTION`, not the former synthetic `DEADLINE_PASSED`.

## Remaining acceptance limits

- Local API tests use disposable MemoryStore, not hosted PostgreSQL. They simulate selected 401 responses and then verify against the real local API; this does not prove a deployed token-reissue procedure.
- “Check authorization” verifies access after it is restored. Staff must still follow the supported backend recovery procedure; this feature does not create credentials or bypass a revoked device.
- Physical Android/iPhone acceptance, Safari behavior, storage eviction, low-memory pressure, simultaneous cold-start enrollment, and every possible fault combination are not certified by these tests.
- In-progress attempt restoration and the remaining PRD/product items remain separately tracked.
- A mergeable PR and passing checks still require team review. Nothing in this report merges main or approves unanswered scope proposals.
