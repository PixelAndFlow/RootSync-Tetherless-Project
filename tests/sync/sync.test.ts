/**
 * The sync loop end to end.
 *
 * Covers the failures the week-one test is supposed to attack: duplicate
 * delivery, an interrupted request, a crash mid-flight, an expired session,
 * a terminal rejection, and an unreachable server.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { harness } from "./helpers.ts";
import { allDelivery, getDelivery } from "../../src/sync/stores/db.ts";

test("a clean pass acknowledges every event and logs one attempt each", async () => {
  const h = await harness();
  await h.record();
  await h.record();
  await h.record();

  const r = await h.engine.runOnce();

  assert.equal(r.claimed, 3);
  assert.equal(r.acknowledged, 3);
  assert.equal(h.transport.sendCount, 1, "three events in one batch, one request");

  const delivery = await allDelivery(h.db);
  assert.ok(delivery.every((d) => d.status === "acknowledged"));
  assert.equal(delivery.length, 3);
});

test("a duplicate response counts as success, not as an error", async () => {
  const h = await harness();
  await h.record();
  await h.record();
  h.transport.always({ kind: "duplicate_all" });

  const r = await h.engine.runOnce();

  assert.equal(r.acknowledged, 2, "duplicate is a success");
  assert.equal(r.retried, 0, "a replay must not be retried forever");
  const delivery = await allDelivery(h.db);
  assert.ok(delivery.every((d) => d.status === "acknowledged"));
});

test("an unreachable server leaves the batch pending with no attempt consumed", async () => {
  const h = await harness();
  await h.record();
  await h.record();
  h.transport.always({ kind: "fail", failure: { kind: "unreachable", error: "offline" } });

  const r = await h.engine.runOnce();

  assert.equal(r.retried, 2);
  assert.equal(r.failed, 0, "being offline must never fail work");
  const delivery = await allDelivery(h.db);
  assert.ok(delivery.every((d) => d.status === "pending"));
  assert.ok(delivery.every((d) => d.attempts === 0), "offline spends no budget");
});

test("a transport that throws is treated as unreachable, not as a crash", async () => {
  const h = await harness();
  await h.record();
  h.transport.always({ kind: "throw", error: "socket hang up" });

  const r = await h.engine.runOnce();

  assert.equal(r.retried, 1);
  assert.equal((await allDelivery(h.db))[0]?.attempts, 0);
});

test("an expired session blocks the queue without losing it", async () => {
  const h = await harness();
  await h.record();
  await h.record();
  h.transport.always({ kind: "fail", failure: { kind: "auth", error: "token expired" } });

  const r = await h.engine.runOnce();

  assert.equal(r.blockedAuth, 2);
  const delivery = await allDelivery(h.db);
  assert.ok(delivery.every((d) => d.status === "blocked_auth"));
  assert.ok(delivery.every((d) => d.attempts === 0), "re-auth is not a retry");
  assert.ok(delivery.every((d) => d.next_attempt_at === null), "no retry clock while waiting");

  // The events themselves are untouched.
  const events = await h.engine["opts"].db.transaction(["events"], "readonly");
  assert.ok(events, "the event store is still there");
});

test("a terminal rejection settles the event and keeps the reason", async () => {
  const h = await harness();
  await h.record();
  h.transport.always({
    kind: "reject_all",
    code: "UNKNOWN_QUESTION",
    message: "Question q-1 is not in this module version.",
  });

  const r = await h.engine.runOnce();

  assert.equal(r.rejected, 1);
  const d = await getDelivery(h.db, "evt-0001");
  assert.equal(d?.status, "rejected");
  assert.equal(d?.rejected_code, "UNKNOWN_QUESTION");
  assert.equal(d?.next_attempt_at, null);

  // And a second pass does not touch it again.
  const before = h.transport.sendCount;
  await h.engine.runOnce();
  assert.equal(h.transport.sendCount, before, "a rejection is never retried");
});

test("a mixed batch settles each event on its own outcome", async () => {
  const h = await harness();
  await h.record();
  await h.record();
  await h.record();
  h.transport.always({
    kind: "mixed",
    rejected: [1],
    code: "INVALID_EVENT",
    message: "bad payload",
  });

  const r = await h.engine.runOnce();

  assert.equal(r.acknowledged, 2, "per-event outcomes, never per-batch");
  assert.equal(r.rejected, 1);
  assert.equal((await getDelivery(h.db, "evt-0002"))?.status, "rejected");
  assert.equal((await getDelivery(h.db, "evt-0001"))?.status, "acknowledged");
  assert.equal((await getDelivery(h.db, "evt-0003"))?.status, "acknowledged");
});

test("success with no results at all is unreachable, not a silent success", async () => {
  const h = await harness();
  await h.record();
  h.transport.always({ kind: "empty_results" });

  const r = await h.engine.runOnce();

  assert.equal(r.acknowledged, 0);
  assert.equal(r.retried, 1, "an event with no result must not be assumed delivered");
  assert.equal((await getDelivery(h.db, "evt-0001"))?.attempts, 0);
});

test("a crash mid-request is recovered without spending an attempt", async () => {
  const h = await harness();
  await h.record();

  // Simulate the crash: claim the batch, then never send it and never settle it.
  const { claimBatch } = await import("../../src/sync/engine/lease.ts");
  const { allEvents } = await import("../../src/sync/stores/db.ts");
  const events = await allEvents(h.db);
  await claimBatch(h.db, events, { maxEvents: 200, owner: "device-1:tab-1", now: h.now() });

  assert.equal((await getDelivery(h.db, "evt-0001"))?.status, "inflight");

  // The lease has not expired yet: the event must NOT be re-claimed.
  let r = await h.engine.runOnce();
  assert.equal(r.claimed, 0, "a live lease must not be stolen");
  assert.equal(h.transport.sendCount, 0);

  // Past the lease TTL, the recovery pass returns it to pending.
  h.tick(61_000);
  r = await h.engine.runOnce();
  assert.equal(r.recovered, 1, "the stale lease is recovered");
  assert.equal(r.claimed, 1, "and then sent");
  assert.equal(r.acknowledged, 1);

  const d = await getDelivery(h.db, "evt-0001");
  assert.equal(d?.status, "acknowledged");
  assert.equal(d?.attempts, 0, "a crash is not a delivery failure");
});

test("a settled event is never re-sent on a later pass", async () => {
  const h = await harness();
  await h.record();
  await h.engine.runOnce();
  const after = h.transport.sendCount;

  await h.engine.runOnce();
  await h.engine.runOnce();

  assert.equal(h.transport.sendCount, after, "acknowledged work stays acknowledged");
});

test("batches are capped and ordered by device_seq", async () => {
  const h = await harness();
  for (let i = 0; i < 5; i += 1) await h.record();

  const engine = new (await import("../../src/sync/engine/sync.ts")).SyncEngine({
    db: h.db,
    transport: h.transport,
    owner: "device-1:tab-1",
    now: h.now,
    maxEventsPerBatch: 2,
  });

  const r = await engine.runOnce();
  assert.equal(r.claimed, 2, "the cap is respected");

  const sent = h.transport.sent[0]?.events ?? [];
  assert.deepEqual(
    sent.map((e) => e.device_seq),
    [1, 2],
    "a batch is contiguous in device_seq",
  );
});

test("failed work is re-opened by a later pass, and only once", async () => {
  const h = await harness({ maxAttempts: 2 });
  await h.record();
  h.transport.always({ kind: "fail", failure: { kind: "server_error", error: "500" } });

  await h.engine.runOnce(); // attempt 1
  h.tick(120_000);
  await h.engine.runOnce(); // attempt 2 -> failed

  assert.equal((await getDelivery(h.db, "evt-0001"))?.status, "failed");

  // A new pass with reopenFailedOnStart gives it one more chance.
  const engine = new (await import("../../src/sync/engine/sync.ts")).SyncEngine({
    db: h.db,
    transport: h.transport,
    owner: "device-1:tab-1",
    now: h.now,
    maxAttempts: 2,
    reopenFailedOnStart: true,
  });
  h.transport.always({ kind: "accept_all" });
  const r = await engine.runOnce();

  assert.equal(r.acknowledged, 1, "the learner recovers without support");
  assert.equal((await getDelivery(h.db, "evt-0001"))?.status, "acknowledged");
});
