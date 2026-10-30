# RootSync Tetherless DDIL Engine: Test Results, Protocol Fixes & Audit Report

**Branch:** `ddil-test` (aligned with `main` at `9e1fb71`)  
**Target:** Raices Cyber Organization (RCO) Tetherless Cyberathlete Training PWA  
**Engine:** DDIL Offline-First Outbox, Lease Mutex, and Idempotent Sync Engine  
**Integration Status:** ✅ Verified against **Chris's Frontend Spec v1.1** & **Marc's API Spec v1.30**  
**Test Suite Status:** ✅ All 80 Tests Passing (`npm run test:ddil`, 0 Failures, 0 Skips, ~2.8s Execution)  
**Applet Build Status:** ✅ Vite Production Build & Compilation Succeeded (0 Errors)

---

## 1. System Integration Overview & Component Matrix

The Tetherless application achieves reliable offline-first operation across three independently developed components:

| Component | Owner & Spec | Responsibilities & Protocol Alignment | Status |
|---|---|---|---|
| **Frontend Integration** | **Chris (Spec v1.1)** | - Implements `OfflineLearningGateway` interface.<br>- Real-time outbox telemetry badge & inspection HUD.<br>- Monotonic session clock tracking.<br>- Client diagnostic payload stamping (`local_correct`, `local_total`, `local_is_correct`, `question_ids`).<br>- In live mode (`VITE_TETHERLESS_API_BASE_URL` set), wires to native W3C `window.indexedDB` (`tetherless-ddil`) in `src/services/gateways.ts`. In mock mode, operates with in-memory `mockGateways`. | **Connected & Verified (Spec v1.1)** |
| **Backend & API** | **Marc (API Spec v1.30)** | - Ingestion endpoint `POST /v1/sync/events`.<br>- RFC 4122 standard UUID formatting & validation.<br>- Authoritative server-side grading & idempotency store (`status: "duplicate"` acknowledged as success).<br>- HTTP status & payload mapping: `200` with per-event `status: "accepted" \| "duplicate" \| "retryable_error" \| "rejected"`; `401` device token expiration (`blocked_auth`); `429` rate limiting with `Retry-After`; `5xx` jittered exponential backoff. Note: HTTP `422` is restricted to `/v1/setup` and staff routes. | **Connected & Verified (Spec v1.30)** |
| **DDIL Persistence & Sync** | **Naquan (`ddil-test`)** | - Four-store IndexedDB layout (`events`, `delivery`, `delivery_log`, `meta`).<br>- Pre-commit transaction guarantee for answers (`saveAnswer` awaits IDB commit).<br>- Lease mutex for single-flight concurrency.<br>- Atomic monotonic `device_seq` allocator.<br>- Auth recovery pipeline via `engine.unblockAuth()` triggered during `startSession`. | **Connected & Verified (`ddil-test`)** |

---

## 2. Priority 0 Protocol Defects & Mitigations

### A. Protocol Fixes

| Finding | Severity | Description | Applied Fix | Verifying Tests |
|---|---|---|---|---|
| **N3: 401 Auth Stranding Trap** | **P0 (Critical)** | `blocked_auth` events had `next_attempt_at: null` and were excluded from future sync sweeps. When a user refreshed their token or re-authenticated, blocked events were never re-evaluated, permanently stranding learner progress. | 1. Implemented `unblockAuth()` in `SyncEngine` (`src/sync/engine/sync.ts`, line 100) to reset `blocked_auth` records back to `pending`.<br>2. In practice, `DdilLearningGateway.startSession()` invokes `await this.engine?.unblockAuth()` on session start (`src/sync/gateway/ddil-gateway.ts`, line 171) so blocked events drain upon renewed authentication.<br>3. Guaranteed no retry attempt budget is consumed while an event waits in `blocked_auth`. | `protocol-attacks.test.ts` (Attacks 1 & 2)<br>`field-scenarios.test.ts` (Test 2)<br>`cross-component.test.ts` (Tests 4 & 5) |
| **N4: Lease Mid-Flight Expiry Stale Overwrite** | **P0 (Critical)** | If Tab A's 60s lease expired during a slow network call, and Tab B claimed the lease and successfully synchronized an event (`acknowledged`), Tab A's eventual network timeout/failure would overwrite Tab B's success with `failed` or `rejected`. | Enforced strict lease ownership checks in `applyOne()` in `src/sync/engine/sync.ts`. Any late-arriving response from an expired lease or for an already settled record is discarded. | `protocol-attacks.test.ts` (Attack 3)<br>`field-scenarios.test.ts` (Test 4) |
| **N6: `device_seq` Concurrency Race & Idempotency** | **P0 (High)** | Concurrent calls to `saveAnswer` read and incremented `device_seq` without transactional locking, generating duplicate sequence numbers. Furthermore, `recordEvent` lacked idempotency handling on duplicate ID insertion. | 1. Implemented `withDeviceSeqLock` serialized mutex in `src/sync/engine/lease.ts`.<br>2. Wrapped sequence allocation in atomic read-modify-write transactions.<br>3. Handled duplicate event ID inserts idempotently without aborting transactions. | `protocol-attacks.test.ts` (Attacks 4 & 5)<br>`field-scenarios.test.ts` (Test 4) |
| **N1: `retainLocal` Answer Durability** | **P1 (Medium)** | Local UI metadata (`xp_award`, `answered_at`) must be guaranteed before UI answer feedback renders. If the local write failed silently, feedback would show without persisted records. | Updated `saveAnswer()` in `src/sync/gateway/ddil-gateway.ts` (line 239) to `await this.retainLocal(...)` before resolving, ensuring answers are committed to disk before returning to the caller. (Note: `completeAttempt` records awards via `this.retainLocal` fire-and-forget). | `protocol-attacks.test.ts` (Attack 6)<br>`field-scenarios.test.ts` (Test 1) |
| **Trace #4: Monotonic Session Continuity Loss** | **P1 (Medium)** | On browser restart or gateway reload, heartbeat provisioned a new session ID and reset the monotonic clock origin, truncating session duration metrics. | Persisted `session_id` and `session_started_at_monotonic` in the `meta` store. Gateway restart recovers the existing session without truncation. | `protocol-attacks.test.ts` (Attack 7)<br>`gateway.test.ts` |

---

## 3. Dedicated Field Scenario Attack Suite

The test suite in `tests/sync/field-scenarios.test.ts` executes the 5 critical adversarial field scenarios:

### 1. The Save-Then-Blackout Test
- **Scenario:** A learner submits an answer and the network drops immediately.
- **Verification:**
  - `saveAnswer()` does not resolve successfully before its IndexedDB transaction commits.
  - The answer survives simulated page reloads and browser restarts.
  - The event remains in `pending` delivery state with retry budget untouched.
  - A failed synchronization does not erase the answer.
  - Restoring connectivity delivers the event cleanly.
  - Replaying the same event does not create a duplicate server record (`status: "duplicate"` inside HTTP 200 counts as success).
- **Pass Status:** ✅ Verified (`field-scenarios.test.ts: SCENARIO 1`).

### 2. The 401 Authentication Trap Test
- **Scenario:** Learner credentials expire mid-sync session.
- **Verification:**
  - Full lifecycle tested: `pending` → `blocked_auth` → authentication recovery (`startSession` / `unblockAuth`) → `pending` → `accepted`.
  - HTTP 401 does not cause an infinite retry loop or burn retry attempt budgets.
  - Blocked events remain visible in the outbox inspector.
  - Restoring authentication provides an explicit recovery path via `engine.unblockAuth()`.
  - Already acknowledged events are not resubmitted.
- **Pass Status:** ✅ Verified (`field-scenarios.test.ts: SCENARIO 2`).

### 3. The Four-Store Consistency Test
- **Scenario:** Outbox inspector reflection vs. underlying database integrity.
- **Verification:**
  - `events`: Committed records remain immutable and intact across state changes.
  - `delivery`: Delivery state strictly reflects the defined state machine (`pending`, `in_flight`, `acknowledged`, `blocked_auth`, `failed`, `rejected`).
  - `delivery_log`: Historical attempt records are preserved as an append-only audit trail rather than overwritten.
  - `meta`: Persisted device identity, session timestamps, and server acknowledgement cursors survive restarts.
  - UI inspector displays actual database store records, not a detached memory state.
- **Pass Status:** ✅ Verified (`field-scenarios.test.ts: SCENARIO 3`).

### 4. The Single-Flight Concurrency Test
- **Scenario:** Rapid multi-trigger of SYNC button during slow network responses.
- **Verification:**
  - Active request holds the lease mutex; concurrent triggers are serialized or skipped without race conditions.
  - Releasing response completes cleanly without duplicated transport calls.
  - Recovers cleanly when the active request encounters a network throw or server error.
  - Events created while a sync pass is active are not stranded; they remain queued for the subsequent pass.
- **Pass Status:** ✅ Verified (`field-scenarios.test.ts: SCENARIO 4`).

### 5. The Terminal Rejection Test (`status: "rejected"`)
- **Scenario:** Per-event server rejection per API Spec v1.30 §6.2.
- **Protocol Mechanism:**
  - `POST /v1/sync/events` responds with HTTP 200. Each item in `results` returns `{ event_id, status: "rejected", code, message }`.
  - The 7 spec-defined rejection codes are:
    1. `INVALID_EVENT`
    2. `UNSUPPORTED_SCHEMA_VERSION`
    3. `DEVICE_MISMATCH`
    4. `UNKNOWN_MODULE`
    5. `UNKNOWN_QUESTION`
    6. `UNKNOWN_CHOICE`
    7. `EVENT_ID_CONFLICT`
  *(Note: Synthetic error codes in test simulators, such as `DEADLINE_PASSED`, verify that non-retryable rejection transitions the event to terminal `rejected` state).*
- **Verification:**
  - Rejection is recorded with the server error code and details.
  - Transitions to terminal `rejected` state; client does not retry indefinitely or burn battery/data.
  - Event remains visible in inspector for staff audit.
  - Cannot be mistaken for an accepted event.
- **Pass Status:** ✅ Verified (`field-scenarios.test.ts: SCENARIO 5`).

---

## 4. Test Suite Execution & Coverage (80/80 Passing)

Ran via `npm run test:ddil` (`node --test "tests/sync/*.test.ts"`):

```
✔ tests/sync/content-version.test.ts (4 tests)
  - An attempt started with content_version 1 carries version 1 on all attempt events
  - Starting an attempt with a newer published version stamps the new version
  - Gateway rejects an attempt when the module is not in the published catalog
  - Ingestion matches answer against the module version recorded on the event

✔ tests/sync/contract-conformance.test.ts (5 tests)
  - Ingestion contract: event_type enum matches openapi.yaml exactly
  - Ingestion contract: rejection codes match openapi.yaml exactly
  - Ingestion contract: EventResult status enum matches openapi.yaml
  - Ingestion contract: required fields on every event match openapi.yaml
  - Ingestion contract: attempt event payload requirements match openapi.yaml

✔ tests/sync/cross-component.test.ts (9 tests)
  - Live HTTP round-trip against Marc's real server
  - Server acceptance followed by lost acknowledgment (idempotent replay)
  - Repeated submission of already accepted event returns duplicate (success)
  - Authentication expiration during synchronization transitions to blocked_auth
  - Recovery of blocked events after credentials are restored
  - Concurrent synchronization from separate gateway instances serialized by lease
  - Full learner journey: session_started, attempt_started, saveAnswer, attempt_completed accepted cleanly
  - Attempt abandoned with reason accepted
  - Strict schema rejection of unknown fields verified

✔ tests/sync/field-scenarios.test.ts (5 tests)
  - SCENARIO 1: The Save-Then-Blackout Test
  - SCENARIO 2: The 401 Authentication Trap Test
  - SCENARIO 3: The Four-Store Consistency Test
  - SCENARIO 4: The Single-Flight Concurrency Test
  - SCENARIO 5: The Terminal Rejection Test

✔ tests/sync/gateway.test.ts (24 tests)
  - Gateway contract alignment with Chris's interface
  - Bare RFC 4122 UUID generation
  - Schema v1.10 / v1.30 compliance (no forbidden keys, content_version stamped)
  - Local XP and award retention
  - Monotonic session clock tracking

✔ tests/sync/persistence.test.ts (7 tests)
  - Database creates exactly four stores (events, delivery, delivery_log, meta)
  - Atomic commit of event + delivery in single IDB transaction
  - Immutability of event payload store
  - Durability across database reopen
  - Full rollback on transaction abort
  - Meta round-trips device identity and server ack cursor
  - Fast status counting via index without cursor walks

✔ tests/sync/protocol-attacks.test.ts (7 tests)
  - ATTACK N3: blocked_auth unblocked on token refresh
  - ATTACK N3: unblockAuth in SyncEngine unblocks and syncs
  - ATTACK N4: Expired lease cannot overwrite acknowledged state from another tab
  - ATTACK N6: 15 concurrent saveAnswer calls produce strictly monotonic device_seq
  - ATTACK N6: Duplicate concurrent recordEvent calls do not duplicate or abort
  - ATTACK N1: retainLocal commits answer metadata before saveAnswer resolves
  - ATTACK Trace #4: Gateway restart recovers active session without resetting monotonic elapsed

✔ tests/sync/retry.test.ts (7 tests)
  - Unreachable/offline does NOT consume attempt budget
  - 1 week offline leaves retry count untouched
  - Server errors (5xx) consume attempts and apply jittered exponential backoff
  - Retry budget bounds attempts to prevent battery drain
  - Auth expiry (401) pauses delivery without burning attempts
  - Terminal rejections freeze attempts and transition to 'rejected'
  - Rate limiting (429) honors Retry-After header

✔ tests/sync/sync.test.ts (12 tests)
  - Clean pass delivers batch and appends delivery log entries
  - Duplicate response (200 + replayed) acknowledged as success
  - Unreachable leaves batch pending
  - Transport throw handled as unreachable
  - Expired session moves to blocked_auth
  - Mixed batch settles each event on its own outcome
  - Stale in-flight lease recovered after expiry
  - Batch caps respected (200 events / 512 KB)
  - Single reopen of failed work on startup

Total: 80 tests, 0 failures, 0 skipped, duration ~2.8s
```

---

## 5. Harness Hardening & Composition Architecture

1. **Storage Initialization (`src/services/gateways.ts`):**
   - Live mode opens IndexedDB only when `VITE_TETHERLESS_API_BASE_URL` is set (`config.mode === "integration" && config.apiBaseUrl`).
   - In offline/mock mode, the app uses in-memory mock gateways (`mockGateways`).
2. **Fake IDB Harness Fixes (`tests/sync/fakes/fake-idb.ts`):**
   - **D1 (ReadOnlyError):** Throws `DOMException("The transaction is read-only.", "ReadOnlyError")` on illegal writes.
   - **D2 (Deletion Initialization):** Deletions map initialized per transaction to eliminate `TypeError`.
   - **D3 (Audit Trail Preservation):** Auto-increment sequences use store-level sequence counter (`base.seq`), preventing log row collapsing.
   - **D4 (KeyPath Constraint):** DataError thrown when explicit keys are passed to stores with existing key paths.
   - **D5 (Concurrent Duplicate Rejection):** Duplicate keys correctly rejected with `ConstraintError`.

---

## 6. Verification Checklist

- [x] Connected and verified against **Chris's Frontend Spec v1.1** (`OfflineLearningGateway`, diagnostic fields, UI badge).
- [x] Connected and verified against **Marc's Backend API Spec v1.30** (`POST /v1/sync/events`, UUID, idempotency, per-event rejection inside HTTP 200).
- [x] Protocol defect **N3** (blocked_auth un-stranding via `startSession` / `unblockAuth`) implemented and verified.
- [x] Protocol defect **N4** (lease ownership guard against stale overwrites) implemented and verified.
- [x] Protocol defect **N6** (device_seq atomic lock and concurrency safety) implemented and verified.
- [x] Protocol defect **N1** (answer `retainLocal` durability awaited before resolution) implemented and verified.
- [x] Protocol defect **Trace #4** (monotonic session continuity across restarts) implemented and verified.
- [x] 5 Field scenario attack tests implemented and passing.
- [x] Live HTTP cross-component tests against real Node HTTP server passing.
- [x] All 80 DDIL tests passing with 0 failures on native Node test runner (`npm run test:ddil`).
- [x] Codebase builds cleanly with Vite production build (`compile_applet` passed).
