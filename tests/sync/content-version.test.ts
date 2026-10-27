/**
 * Every attempt event carries the content version the attempt was started with
 * (API Spec v1.30 section 8.2 and N-3). The server scores an answer against the
 * answer key of the version named in the event, so a wrong version means a wrong
 * score or a permanent rejection. Before this, the gateway stamped one fixed
 * default of 1 on everything and ignored the version the caller passed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import { FakeTransport } from "./fakes/fake-transport.ts";
import { DdilLearningGateway } from "../../src/sync/gateway/ddil-gateway.ts";

let clock = 1_700_000_000_000;
const now = () => clock++;
const DEVICE_ID = "5b7e0c1a-2d3f-4a5b-8c6d-7e8f90a1b2c3";

function make(idb = new FakeIDBFactory()) {
  const gw = new DdilLearningGateway({ idb, transport: new FakeTransport(now), deviceId: DEVICE_ID, owner: `${DEVICE_ID}:tab-1`, now, isOnline: () => true });
  return { gw, idb };
}

async function eventsOf(gw: DdilLearningGateway, attemptId: string) {
  const records = await gw.deliveryRecords();
  const events = await Promise.all(records.map((r) => gw.getEventById(r.event_id)));
  return events.filter((e): e is NonNullable<typeof e> => !!e && "attempt_id" in e && e.attempt_id === attemptId);
}

const answer = (attemptId: string, questionId = "q1") => ({
  learnerId: "l1", moduleId: "m1", attemptId, xpAward: 0,
  answer: { questionId, selectedChoiceId: "A", isCorrect: true, answeredAt: "2026-10-27T12:00:00Z" },
});

test("an attempt's events all carry the version it was started with, not the default of 1", async () => {
  const { gw } = make();
  await gw.init();
  const attempt = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: 3, kind: "full" });
  await gw.saveAnswer(answer(attempt.id));
  await gw.completeAttempt({ learnerId: "l1", moduleId: "m1", attemptId: attempt.id, questionsTotal: 1, correctQuestionIds: ["q1"] });
  const events = await eventsOf(gw, attempt.id);
  assert.deepEqual(events.map((e) => e.event_type).sort(), ["answer_submitted", "attempt_completed", "attempt_started"]);
  assert.deepEqual(events.map((e) => (e as { content_version: number }).content_version), [3, 3, 3]);
});

test("remediation and abandoned attempts carry their own version too", async () => {
  const { gw } = make();
  await gw.init();
  const practice = await gw.startRemediation({ learnerId: "l1", moduleId: "m1", contentVersion: 5, questionIds: ["q1"] });
  const quit = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: 2, kind: "full" });
  await gw.abandonAttempt({ attemptId: quit.id, moduleId: "m1", reason: "quit" });
  assert.deepEqual((await eventsOf(gw, practice.id)).map((e) => (e as { content_version: number }).content_version), [5]);
  assert.deepEqual((await eventsOf(gw, quit.id)).map((e) => (e as { content_version: number }).content_version), [2, 2]);
});

test("two attempts on different versions do not affect each other", async () => {
  const { gw } = make();
  await gw.init();
  const oldVersion = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: 1, kind: "full" });
  const newVersion = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: 2, kind: "full" });
  await gw.saveAnswer(answer(oldVersion.id));
  await gw.saveAnswer(answer(newVersion.id));
  assert.deepEqual((await eventsOf(gw, oldVersion.id)).map((e) => (e as { content_version: number }).content_version), [1, 1]);
  assert.deepEqual((await eventsOf(gw, newVersion.id)).map((e) => (e as { content_version: number }).content_version), [2, 2]);
});

test("the version survives the app being closed and reopened mid-attempt", async () => {
  const first = make();
  await first.gw.init();
  const attempt = await first.gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: 4, kind: "full" });

  // A new gateway on the same database, as after a restart: nothing in memory.
  const second = make(first.idb);
  await second.gw.init();
  await second.gw.saveAnswer(answer(attempt.id));
  assert.deepEqual((await eventsOf(second.gw, attempt.id)).map((e) => (e as { content_version: number }).content_version), [4, 4]);
});

test("a contentVersion that is not a whole number of 1 or more is refused, and nothing is recorded", async () => {
  const { gw } = make();
  await gw.init();
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    await assert.rejects(() => gw.startAttempt({ learnerId: "l1", moduleId: "m1", contentVersion: bad, kind: "full" }), /contentVersion/);
    await assert.rejects(() => gw.startRemediation({ learnerId: "l1", moduleId: "m1", contentVersion: bad, questionIds: [] }), /contentVersion/);
  }
  assert.equal((await gw.deliveryRecords()).length, 0);
});
