/**
 * Every event the DDIL gateway builds must pass the contract's own validator.
 *
 * DDIL keeps its own event types (src/sync/types.ts) so it stays free of
 * imports from the server packages, which means nothing at compile time ties
 * them to packages/contract. This test is that tie: it drives the gateway
 * through every kind of event it can produce, then runs each stored event
 * through validateEvent(), the same check the server applies on ingest.
 * A payload key, ID shape or required field that drifts fails here instead of
 * being rejected for good by the server.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import { FakeTransport } from "./fakes/fake-transport.ts";
import { DdilLearningGateway } from "../../src/sync/gateway/ddil-gateway.ts";
import { EVENT_TYPES, validateEvent } from "../../packages/contract/src/index.ts";

let clock = 1_700_000_000_000;
const now = () => clock++;

// The contract requires UUIDs for device_id and session_id, unlike the
// readable ids used in the other gateway tests.
const DEVICE_ID = "5b7e0c1a-2d3f-4a5b-8c6d-7e8f90a1b2c3";

async function recordedEvents(gw: DdilLearningGateway): Promise<unknown[]> {
  const records = await gw.deliveryRecords();
  const events = await Promise.all(records.map((r) => gw.getEventById(r.event_id)));
  return events.filter((e) => e !== undefined);
}

test("every event the gateway builds passes the contract's validateEvent", async () => {
  const gw = new DdilLearningGateway({
    idb: new FakeIDBFactory(),
    transport: new FakeTransport(now),
    deviceId: DEVICE_ID,
    owner: `${DEVICE_ID}:tab-1`,
    now,
    isOnline: () => true,
  });
  await gw.init();

  await gw.startSession({ learnerId: "l1", deviceId: DEVICE_ID });
  await gw.noteVisibility("hidden");
  await gw.noteVisibility("visible");
  await gw.heartbeat();

  const full = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: 1, kind: "full" });
  await gw.saveAnswer({
    learnerId: "l1",
    moduleId: "m1",
    attemptId: full.id,
    answer: { questionId: "q1", selectedChoiceId: "A", isCorrect: true, answeredAt: "2026-10-26T12:00:00Z" },
    xpAward: 10,
  });
  await gw.completeAttempt({
    learnerId: "l1",
    moduleId: "m1",
    attemptId: full.id,
    questionsTotal: 1,
    correctQuestionIds: ["q1"],
  });

  await gw.startRemediation({ learnerId: "l1", moduleId: "m1", questionIds: ["q1"] });

  const abandoned = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: 1, kind: "full" });
  await gw.abandonAttempt({ attemptId: abandoned.id, moduleId: "m1", reason: "restart" });

  const events = await recordedEvents(gw);
  assert.ok(events.length > 0, "the gateway recorded no events");

  const failures: string[] = [];
  for (const event of events) {
    const result = validateEvent(event);
    if (!result.ok) failures.push(`${(event as { event_type: string }).event_type}: ${result.error.message}`);
  }
  assert.deepEqual(failures, [], "events the contract's validator rejects");
});

test("the gateway covers the contract's event types, or names the ones it does not emit", async () => {
  const gw = new DdilLearningGateway({
    idb: new FakeIDBFactory(),
    transport: new FakeTransport(now),
    deviceId: DEVICE_ID,
    owner: `${DEVICE_ID}:tab-1`,
    now,
    isOnline: () => true,
  });
  await gw.init();
  await gw.startSession({ learnerId: "l1", deviceId: DEVICE_ID });
  await gw.noteVisibility("hidden");
  await gw.heartbeat();
  const attempt = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: 1, kind: "full" });
  await gw.saveAnswer({
    learnerId: "l1",
    moduleId: "m1",
    attemptId: attempt.id,
    answer: { questionId: "q1", selectedChoiceId: "A", isCorrect: true, answeredAt: "2026-10-26T12:00:00Z" },
    xpAward: 0,
  });
  await gw.completeAttempt({ learnerId: "l1", moduleId: "m1", attemptId: attempt.id, questionsTotal: 1, correctQuestionIds: ["q1"] });
  const second = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: 1, kind: "full" });
  await gw.abandonAttempt({ attemptId: second.id, moduleId: "m1", reason: "quit" });

  const emitted = new Set((await recordedEvents(gw)).map((e) => (e as { event_type: string }).event_type));
  const notEmitted = EVENT_TYPES.filter((type) => !emitted.has(type));
  // session_ended is in the contract but deliberately not emitted: the device cannot
  // promise to deliver a final event, so the server closes a session at its last signal
  // (see packages/analytics/test/session-without-end.test.ts). If DDIL starts emitting it
  // as a best-effort event, remove it here so the next new type is noticed.
  assert.deepEqual(notEmitted, ["session_ended"]);
});
