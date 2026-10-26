/**
 * Targeted attack scenarios validating the fixes for Baby Patch's protocol defects:
 *
 *  - N3: blocked_auth un-stranding (preventing permanent data stranding)
 *  - N4: Lease expiry mid-flight (preventing stale cross-tab overwrites)
 *  - N6: Concurrent device_seq race & duplicate event_id idempotency
 *  - N1: retainLocal persistence durability before completion
 *  - Trace #4: Session continuity preservation across restarts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { harness } from "./helpers.ts";
import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import { FakeTransport } from "./fakes/fake-transport.ts";
import { DdilLearningGateway } from "../../src/sync/gateway/ddil-gateway.ts";
import {
  allDelivery,
  allEvents,
  getDelivery,
  getEvent,
  getMeta,
  recordEvent,
} from "../../src/sync/stores/db.ts";
import { claimBatch, recoverExpiredLeases } from "../../src/sync/engine/lease.ts";
import { SyncEngine } from "../../src/sync/engine/sync.ts";
import type { ActivityEvent } from "../../src/sync/types.ts";

// ---------------------------------------------------------------- N3: blocked_auth un-stranding

test("ATTACK N3: blocked_auth does not strand records permanently when auth refreshes", async () => {
  const h = await harness();
  await h.record();
  await h.record();

  // 1. Initial pass hits auth failure (e.g. 401 token expired)
  h.transport.always({ kind: "fail", failure: { kind: "auth", error: "token expired" } });
  const r1 = await h.engine.runOnce();
  assert.equal(r1.blockedAuth, 2, "both events blocked on auth");

  let delivery = await allDelivery(h.db);
  assert.ok(delivery.every((d) => d.status === "blocked_auth"));
  assert.ok(delivery.every((d) => d.next_attempt_at === null));

  // In the unfixed code: transport recovers, but pass() ignores blocked_auth forever (claimed: 0, sends: 0)
  h.transport.always({ kind: "accept_all" });

  // 2. Un-strand via unblockAuth (simulating token refresh callback)
  const unblockedCount = await h.engine.unblockAuth();
  assert.equal(unblockedCount, 2, "unblocked 2 auth-blocked events");

  delivery = await allDelivery(h.db);
  assert.ok(delivery.every((d) => d.status === "pending"), "events returned to pending");
  assert.ok(delivery.every((d) => d.attempts === 0), "attempts remain 0 — auth wait is not a failure");

  // 3. Next pass successfully claims and delivers the work!
  const r2 = await h.engine.runOnce();
  assert.equal(r2.claimed, 2, "previously stranded work is claimed");
  assert.equal(r2.acknowledged, 2, "previously stranded work is acknowledged");

  delivery = await allDelivery(h.db);
  assert.ok(delivery.every((d) => d.status === "acknowledged"));
});

test("ATTACK N3: unblockAuthOnStart in SyncEngine unblocks and syncs in one pass", async () => {
  const h = await harness();
  await h.record();

  // Block on auth
  h.transport.always({ kind: "fail", failure: { kind: "auth", error: "401" } });
  await h.engine.runOnce();
  assert.equal((await getDelivery(h.db, "evt-0001"))?.status, "blocked_auth");

  // Now create engine with unblockAuthOnStart (e.g. after user re-authenticated)
  h.transport.always({ kind: "accept_all" });
  const engineWithAuth = new SyncEngine({
    db: h.db,
    transport: h.transport,
    owner: "device-1:tab-1",
    now: h.now,
    unblockAuthOnStart: true,
  });

  const r = await engineWithAuth.runOnce();
  assert.equal(r.claimed, 1, "unblockAuthOnStart enabled immediate claim");
  assert.equal(r.acknowledged, 1);
  assert.equal((await getDelivery(h.db, "evt-0001"))?.status, "acknowledged");
});

// ---------------------------------------------------------------- N4: Lease expiry mid-flight

test("ATTACK N4: late response from expired lease cannot overwrite acknowledged state from another tab", async () => {
  const h = await harness();
  await h.record(); // evt-0001

  // Tab A claims the event
  const events = await allEvents(h.db);
  const claimedByTabA = await claimBatch(h.db, events, {
    maxEvents: 10,
    owner: "device-1:tab-A",
    now: h.now(),
    leaseMs: 60_000,
  });
  assert.equal(claimedByTabA.length, 1);
  assert.equal(claimedByTabA[0]?.lease_owner, "device-1:tab-A");

  // Tab A fires its request... but network is slow or Tab A hangs.
  // Time advances past lease expiration:
  h.tick(65_000);

  // Tab B runs sync: recovers expired lease, claims it, sends it, and succeeds!
  const engineTabB = new SyncEngine({
    db: h.db,
    transport: h.transport,
    owner: "device-1:tab-B",
    now: h.now,
  });
  h.transport.always({ kind: "accept_all" });
  const rB = await engineTabB.runOnce();
  assert.equal(rB.recovered, 1, "Tab B recovered the expired lease");
  assert.equal(rB.acknowledged, 1, "Tab B successfully acknowledged the event");

  let record = await getDelivery(h.db, "evt-0001");
  assert.equal(record?.status, "acknowledged", "Event is now acknowledged by Tab B");

  // NOW Tab A's stalled request finally returns with a terminal REJECTION!
  // In the unfixed code, applyOne did not check lease owner and would overwrite acknowledged with rejected!
  const engineTabA = new SyncEngine({
    db: h.db,
    transport: h.transport,
    owner: "device-1:tab-A",
    now: h.now,
  });

  // Call private applyOne on Tab A via class instance to simulate the late response arriving
  await (engineTabA as unknown as {
    applyOne: (
      record: any,
      response: any,
      startedAt: number,
      out: any,
      error?: string,
    ) => Promise<void>;
  }).applyOne(
    claimedByTabA[0],
    "terminal",
    h.now() - 65_000,
    { acknowledged: 0, rejected: 0 },
    "late rejected from server",
  );

  // The record must REMAIN acknowledged! Tab A's late return was rejected by the lease guard.
  record = await getDelivery(h.db, "evt-0001");
  assert.equal(
    record?.status,
    "acknowledged",
    "Tab A's late rejection must NOT overwrite Tab B's acknowledged state!",
  );
});

// ---------------------------------------------------------------- N6: device_seq and duplicate concurrency

test("ATTACK N6: 15 concurrent saveAnswer calls produce strictly monotonic, collision-free device_seq", async () => {
  const factory = new FakeIDBFactory();
  let clock = 1_700_000_000_000;
  const now = () => clock;
  const transport = new FakeTransport(now);

  const gw = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-1",
    now,
  });
  await gw.init();
  const attempt = await gw.startAttempt({ learnerId: "learner-1", moduleId: "mod-1", kind: "full" });

  // Fire 15 saves simultaneously
  const promises = [];
  for (let i = 1; i <= 15; i++) {
    promises.push(
      gw.saveAnswer({
        learnerId: "learner-1",
        moduleId: "mod-1",
        attemptId: attempt.id,
        answer: { questionId: `q-${i}`, selectedChoiceId: `c-${i}`, isCorrect: true, answeredAt: "now" },
        xpAward: 10,
      }),
    );
  }
  await Promise.all(promises);

  const events = await allEvents(gw["require"]());
  // Events include session_started + attempt_started + 15 answer_submitted = 17 events
  const seqs = events.map((e) => e.device_seq);
  const uniqueSeqs = new Set(seqs);

  assert.equal(uniqueSeqs.size, seqs.length, "every event must have a distinct device_seq — zero duplicates");
  
  // Verify strictly contiguous sequence: 1, 2, 3...
  seqs.sort((a, b) => a - b);
  for (let i = 0; i < seqs.length; i++) {
    assert.equal(seqs[i], i + 1, `device_seq must be strictly sequential at index ${i}`);
  }
});

test("ATTACK N6: duplicate concurrent recordEvent calls do not abort or duplicate", async () => {
  const h = await harness();
  const ev = h.makeEvent({ event_id: "evt-duplicate-race" });

  // Call recordEvent 5 times simultaneously with identical event
  const results = await Promise.all([
    recordEvent(h.db, ev, h.now()),
    recordEvent(h.db, ev, h.now()),
    recordEvent(h.db, ev, h.now()),
    recordEvent(h.db, ev, h.now()),
    recordEvent(h.db, ev, h.now()),
  ]);

  assert.ok(results.every((r) => r.event_id === "evt-duplicate-race"));
  const records = await allDelivery(h.db);
  const matched = records.filter((r) => r.event_id === "evt-duplicate-race");
  assert.equal(matched.length, 1, "exactly one delivery record written despite race");
});

// ---------------------------------------------------------------- N1: retainLocal durability

test("ATTACK N1: retainLocal commits award metadata before saveAnswer resolves", async () => {
  const factory = new FakeIDBFactory();
  let clock = 1_700_000_000_000;
  const now = () => clock;
  const transport = new FakeTransport(now);

  const gw = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-1",
    now,
  });
  await gw.init();
  const attempt = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", kind: "full" });

  await gw.saveAnswer({
    learnerId: "l1",
    moduleId: "m1",
    attemptId: attempt.id,
    answer: { questionId: "q-durability", selectedChoiceId: "c1", isCorrect: true, answeredAt: "now" },
    xpAward: 50,
  });

  // Verify meta store holds the award info immediately upon resolve (no dangling void)
  const metaVal = await getMeta<{ xp_award: number }>(
    gw["require"](),
    `local:answer_ui:${attempt.id}`,
  );
  assert.ok(metaVal, "local answer_ui metadata must be durable on disk");
  assert.equal(metaVal.xp_award, 50);
});

// ---------------------------------------------------------------- Trace #4: Session Continuity

test("ATTACK Trace #4: gateway restart recovers active session without resetting monotonic elapsed", async () => {
  const factory = new FakeIDBFactory();
  let clock = 1_700_000_000_000;
  const now = () => clock;
  const transport = new FakeTransport(now);

  // Tab/Session 1 starts
  const gw1 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-1",
    now,
  });
  await gw1.init();
  const session1 = await gw1.startSession({ learnerId: "learner-alpha", deviceId: "device-1" });

  // Simulate app restart: re-opening the gateway with the same database
  const gw2 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-1",
    now,
  });
  await gw2.init();

  // Trigger heartbeat on the restarted gateway
  await gw2.heartbeat();

  const events = await allEvents(gw2["require"]());
  const heartbeats = events.filter((e) => e.event_type === "heartbeat");
  assert.equal(heartbeats.length, 1);
  assert.equal(
    heartbeats[0]?.session_id,
    session1.id,
    "Heartbeat on restarted gateway must continue the existing active session!",
  );
});
