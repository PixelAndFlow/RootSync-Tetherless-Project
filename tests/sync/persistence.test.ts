/**
 * Local persistence and the durability rule.
 *
 * The rule: an action is on disk before anything else happens to it. If the
 * device dies one millisecond after the learner answers, the event is already
 * committed — and it is committed together with its delivery row, so the
 * event can never exist without a record of what to do with it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import {
  allDelivery,
  allEvents,
  countByStatus,
  getDelivery,
  getEvent,
  getMeta,
  openDatabase,
  recordEvent,
  setMeta,
  STORE_DELIVERY,
  STORE_EVENTS,
  STORE_LOG,
  STORE_META,
} from "../../src/sync/stores/db.ts";
import type { ActivityEvent } from "../../src/sync/types.ts";

const NOW = 1_700_000_000_000;

function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    event_id: "evt-1",
    schema_version: 1,
    event_type: "answer_submitted",
    device_id: "device-1",
    device_seq: 1,
    session_id: "session-1",
    occurred_at: new Date(NOW).toISOString(),
    monotonic_ms: 1000,
    payload: { choice_id: "c1" },
    module_id: "mod-1",
    content_version: 1,
    attempt_id: "attempt-1",
    question_id: "q-1",
    ...over,
  };
}

test("the database creates exactly the four stores", async () => {
  const db = await openDatabase(new FakeIDBFactory());
  for (const s of [STORE_EVENTS, STORE_DELIVERY, STORE_LOG, STORE_META]) {
    assert.ok(db.objectStoreNames.contains(s), `missing store: ${s}`);
  }
});

test("recording an event writes the event AND its delivery row", async () => {
  const db = await openDatabase(new FakeIDBFactory());
  await recordEvent(db, event(), NOW);

  const stored = await getEvent(db, "evt-1");
  const delivery = await getDelivery(db, "evt-1");

  assert.ok(stored, "the event must be on disk");
  assert.ok(delivery, "the delivery row must be committed with it");
  assert.equal(delivery.status, "pending");
  assert.equal(delivery.attempts, 0);
  assert.equal(delivery.next_attempt_at, NOW);
  assert.equal(delivery.lease_owner, null);
});

test("the event record is immutable — recording it twice does not reset delivery", async () => {
  const db = await openDatabase(new FakeIDBFactory());
  await recordEvent(db, event(), NOW);

  // A second record with the same id is a bug, not a retry: it must not
  // wipe attempts or reopen a settled event.
  const first = await getDelivery(db, "evt-1");
  await recordEvent(db, event({ payload: { choice_id: "c2" } }), NOW + 5_000);

  const second = await getDelivery(db, "evt-1");
  assert.deepEqual(second, first, "delivery state must be untouched");
  const events = await allEvents(db);
  assert.equal(events.length, 1, "no duplicate event row");
});

test("events survive a reopen of the database — the durability claim", async () => {
  const factory = new FakeIDBFactory();
  const db1 = await openDatabase(factory);
  await recordEvent(db1, event({ event_id: "evt-a" }), NOW);
  await recordEvent(db1, event({ event_id: "evt-b", device_seq: 2 }), NOW);
  db1.close();

  // Same factory, as a page reload would be.
  const db2 = await openDatabase(factory);
  const events = await allEvents(db2);
  assert.equal(events.length, 2, "closing and reopening must not lose activity");
  const delivery = await allDelivery(db2);
  assert.equal(delivery.length, 2);
});

test("a rolled-back transaction leaves nothing behind", async () => {
  const factory = new FakeIDBFactory();
  const db = await openDatabase(factory);
  await recordEvent(db, event({ event_id: "evt-keep" }), NOW);

  // Simulate the failure the atomicity rule exists for: the delivery row
  // cannot be written, so the event must not be written either.
  const t = db.transaction([STORE_EVENTS, STORE_DELIVERY], "readwrite");
  t.objectStore(STORE_EVENTS).add(event({ event_id: "evt-rollback" }));
  t.abort();
  await new Promise((r) => setTimeout(r, 5));

  const events = await allEvents(db);
  assert.equal(events.length, 1, "the aborted event must not be on disk");
  assert.equal(events[0]?.event_id, "evt-keep");
});

test("meta round-trips device identity and the last server ack", async () => {
  const db = await openDatabase(new FakeIDBFactory());
  await setMeta(db, "device_id", "device-1");
  await setMeta(db, "last_server_ack_at", "2026-10-17T12:00:00.000Z");

  assert.equal(await getMeta<string>(db, "device_id"), "device-1");
  assert.equal(
    await getMeta<string>(db, "last_server_ack_at"),
    "2026-10-17T12:00:00.000Z",
  );
  assert.equal(await getMeta(db, "nothing-here"), undefined);
});

test("countByStatus gives the UI its badge without a cursor walk", async () => {
  const db = await openDatabase(new FakeIDBFactory());
  await recordEvent(db, event({ event_id: "a" }), NOW);
  await recordEvent(db, event({ event_id: "b", device_seq: 2 }), NOW);

  const counts = countByStatus(await allDelivery(db));
  assert.equal(counts.pending, 2);
  assert.equal(counts.acknowledged, 0);
  assert.equal(counts.failed, 0);
});
