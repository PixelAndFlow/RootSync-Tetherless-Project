# DDIL layer (`src/sync`)

The offline-first layer for Tetherless: local persistence, the durable outbox,
the sync loop, and retry policy.

This is the **client half** of the sync contract. The server half — the event
envelope, the endpoint, the acknowledgement semantics — is owned by whoever
lands **TR-12** (Marc, Naquan, Chris). Nothing here finalizes it.

## Status

Built on `ddil-test`, off `main`. **Not merged.** The branch exists so it can
be reviewed, swapped out, or deleted without touching `main`.

Zero dependencies by design: plain TypeScript on Node 22, tested with the
built-in `node:test`. No `package.json`, no `node_modules`, no install step.

## Layout

    src/sync/
      types.ts              local types: ActivityEvent, DeliveryRecord, statuses
      stores/
        idb.ts              IndexedDB access; the factory is INJECTED
        db.ts               four stores, the durability rule, atomic recordEvent
      engine/
        lease.ts            leases, single-flight, crash recovery
        retry.ts            response classification, backoff, the state machine
        sync.ts             the sync loop
      transport/
        transport.ts        the seam to the server — one interface

    tests/sync/
      fakes/fake-idb.ts     in-memory IndexedDB
      fakes/fake-transport.ts  scripted responses, records what was sent
      helpers.ts            harness: db + transport + controllable clock
      persistence.test.ts   the durability rule
      retry.test.ts         retry accounting
      sync.test.ts          the loop end to end

## Run the tests

    nvm use 22          # .nvmrc pins 22; Node 22 runs .ts directly
    node --test "tests/sync/*.test.ts"

No install step. 31 tests, no network, no database, no token.

## The four stores

| Store | Mutability | Holds |
|---|---|---|
| `events` | immutable | The learner's work. Written once. Never updated. |
| `delivery` | mutable | Operational bookkeeping. Rebuildable. |
| `delivery_log` | append-only | One row per attempt. The support trail. |
| `meta` | mutable | Device identity, last server ack. |

The split is the load-bearing decision. A bug in the sync loop can corrupt
`delivery`; it must never be able to corrupt or delete `events`.

## The rules this layer enforces

**Durability.** `recordEvent` commits the event and its delivery row in one
transaction, before any network call. If the device dies one millisecond after
the learner answers, the work is already on disk.

**Duplicate delivery is success.** A `duplicate` response settles the event.
Treating it as an error is the bug that makes a client retry forever on work
the server already holds.

**Only a reached server spends retry budget.** A network error, a timeout, or
an expired lease leaves `attempts` untouched. A phone offline for a week still
has a full budget. This is covered by a test that runs 200 unreachable passes.

**Auth is a wait, not a failure.** An expired session moves events to
`blocked_auth` with no retry clock and no attempt consumed. Re-authenticating
is not a retry.

**A rejection is final.** `rejected` is never retried. The payload stays on the
device and the exits are the local export and the trainer review.

**A crash cannot strand work.** The lease is written to disk, so it survives a
force-quit and expires on its own. Web Locks covers two tabs on one device;
the lease covers everything else. Neither replaces the other.

## The transport seam

`SyncTransport` is the only place the server enters this code:

```ts
interface SyncTransport {
  send(events: ActivityEvent[]): Promise<SendResponse>;
}
```

The engine never sees HTTP, a token, or the wire format. When TR-12 is signed
off, one adapter implements this interface against the agreed `SyncRequest` /
`SyncResponse` and nothing else changes.

`FakeTransport` in `tests/sync/fakes/` is the reference implementation of the
seam — it scripts accept, duplicate, reject, mixed, failure and throw.

## What is deliberately NOT decided here

- The wire event envelope and field names
- Authentication and the device token
- Server acknowledgement semantics beyond the four outcome statuses
- The database and hosting choice

Per the scope boundary in the DDIL PRD: the local persistence layer and a
transport-independent sync engine can be built without Marc. The shared
contract cannot be finalized without him and Chris.

## Known gaps

- **Web Locks on iOS under a force-quit is unverified.** It exists from Safari
  15.4, but "supported" is not "verified under a force-quit mid-request". On
  the device test matrix (open decision D9).
- **Eviction under storage pressure is not implemented.** The policy is in the
  PRD §5.9; the code is not written. `navigator.storage.persist()` and the
  estimate check are still to do.
- **No real IndexedDB has been exercised yet.** The fake implements only what
  this layer uses; the first browser run is still pending.
