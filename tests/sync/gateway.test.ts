/**
 * The gateway contract, exercised.
 *
 * Two jobs here:
 *
 *  1. Prove DdilLearningGateway implements Chris's ten methods and behaves.
 *  2. Detect drift. If Chris's contract changes and this mirror is not
 *     updated, the method-list test fails rather than letting the two halves
 *     diverge silently.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import { FakeTransport } from "./fakes/fake-transport.ts";
import { DdilLearningGateway } from "../../src/sync/gateway/ddil-gateway.ts";
import { GATEWAY_METHODS } from "../../src/sync/gateway/contract.ts";
import { allDelivery } from "../../src/sync/stores/db.ts";
import {
  BLOCKED_AUTH_MESSAGES,
  blockedAuthReasonOf,
  summarize,
  toSyncStatus,
} from "../../src/sync/gateway/status-map.ts";
import type { DeliveryRecord } from "../../src/sync/types.ts";
import type { DeviceApi, TetherlessModule } from "../../src/sync/gateway/contract.ts";

let clock = 1_700_000_000_000;
const now = () => clock;

async function gateway(over: { online?: boolean; api?: DeviceApi } = {}) {
  const transport = new FakeTransport(now);
  const gw = new DdilLearningGateway({
    idb: new FakeIDBFactory(),
    transport,
    deviceId: "device-1",
    owner: "device-1:tab-1",
    now,
    isOnline: () => over.online ?? true,
    api: over.api,
  });
  await gw.init();
  return { gw, transport };
}

/** A module with a sector over q1/q2 and a mission badge over all three, for award tests. */
function progressModule(): TetherlessModule {
  return {
    schema_version: "tetherless.module.v1",
    module_id: "m1",
    content_version: 1,
    level: "foundation",
    title: { en: "Test Module" },
    settings: { question_count: 3, timer_seconds: null, show_immediate_feedback: true, allow_retry: true, spanish_assist_default: false },
    questions: [
      { id: "q1", topic: "t", type: "multiple_choice", presentation: "kahoot_cards", prompt: { en: "Q1" }, choices: [{ id: "a", en: "A" }, { id: "b", en: "B" }], correct_choice: "a", feedback: { en: "F1" } },
      { id: "q2", topic: "t", type: "multiple_choice", presentation: "kahoot_cards", prompt: { en: "Q2" }, choices: [{ id: "a", en: "A" }, { id: "b", en: "B" }], correct_choice: "a", feedback: { en: "F2" } },
      { id: "q3", topic: "t", type: "multiple_choice", presentation: "kahoot_cards", prompt: { en: "Q3" }, choices: [{ id: "a", en: "A" }, { id: "b", en: "B" }], correct_choice: "a", feedback: { en: "F3" } },
    ],
    gamification: {
      xp: { first_time_question_mastery_xp: 5, mission_mastery_bonus_xp: 20 },
      sectors: [{ id: "sector-1", order: 1, name: { en: "Sector 1" }, question_ids: ["q1", "q2"], mastery_bonus_xp: 10 }],
      mission_badge: { id: "badge-1", en: "Badge" },
    },
  };
}

function apiServing(module: TetherlessModule): DeviceApi {
  return {
    get: async (path: string) => {
      if (path === `/v1/content/modules/${module.module_id}/versions/${module.content_version}`) return module;
      throw new Error(`unexpected GET ${path}`);
    },
    post: async () => { throw new Error("not used in these tests"); },
  };
}

// ---------------------------------------------------------------- contract

test("the gateway implements all ten of Chris's methods", () => {
  const { DdilLearningGateway: Cls } = { DdilLearningGateway };
  const proto = Cls.prototype as unknown as Record<string, unknown>;
  for (const m of GATEWAY_METHODS) {
    assert.equal(typeof proto[m], "function", `missing gateway method: ${m}`);
  }
  assert.equal(GATEWAY_METHODS.length, 10, "the contract has ten methods, not nine");
});

test("the gateway declares no methods outside the contract", () => {
  const proto = DdilLearningGateway.prototype as unknown as Record<string, unknown>;
  const declared = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof proto[n] === "function",
  );
  const allowed = new Set<string>([...GATEWAY_METHODS]);
  // Composition and diagnostics live outside the interface on purpose.
  const internal = new Set([
    "init",
    "deliveryRecords",
    "getEventById",
    // private helpers — `private` is compile-time only, so they appear here
    "record",
    "emit",
    "require",
    "retainLocal",
    "setContentVersion",
    "recoverAuth",
    "pinAttemptVersion",
    "versionOfAttempt",
    // §6.3 N-7/N-8: emitted outside the nine-method gateway for now.
    "noteVisibility",
    "heartbeat",
    "abandonAttempt",
    "elapsedMonotonic",
    // API Spec v1.30 §8.1: agreed optional additions beyond the ten.
    "setupDevice",
    "getLearnerProfile",
    "listAssignedModules",
    "prepareModuleForOffline",
    "getModule",
    "fetchAndCacheModule",
    "moduleKey",
    "deriveModuleState",
  ]);
  const extra = declared.filter((n) => !allowed.has(n) && !internal.has(n));
  assert.deepEqual(extra, [], "unexpected public method — update the contract mirror");
});

// ---------------------------------------------------------------- durability

test("saveAnswer resolves only after the write is committed", async () => {
  const { gw } = await gateway();
  const attempt = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", kind: "full" });

  await gw.saveAnswer({
    learnerId: "l1",
    moduleId: "m1",
    attemptId: attempt.id,
    answer: { questionId: "q1", selectedChoiceId: "c1", isCorrect: true, answeredAt: "x" },
    xpAward: 10,
  });

  // The moment saveAnswer resolved, the event is readable from the store.
  const delivery = await gw.deliveryRecords();
  const events = await Promise.all(delivery.map((d) => gw.getEventById(d.event_id)));
  const answer = events.find((e) => e?.event_type === "answer_submitted");
  assert.ok(answer, "the answer must be on disk when saveAnswer resolves");
});

test("a failed save rejects, so the UI can let the learner retry", async () => {
  const { gw } = await gateway();
  await assert.rejects(
    () =>
      gw.saveAnswer({
        learnerId: "l1",
        moduleId: "m1",
        attemptId: "a1",
        // A missing questionId is the realistic malformed case.
        answer: { questionId: "", selectedChoiceId: "c1", isCorrect: true, answeredAt: "x" },
        xpAward: 0,
      }),
    /questionId/,
  );
});

test("session and attempt events are recorded with increasing device_seq", async () => {
  const { gw } = await gateway();
  await gw.startSession({ learnerId: "l1", deviceId: "device-1" });
  const attempt = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", kind: "full" });

  const all = await gw.deliveryRecords();
  assert.ok(all.length >= 2);
  // device_seq is stored on the event, so read them back through the store.
  const events = await Promise.all(all.map((d) => gw.getEventById(d.event_id)));
  const seqs = events.filter((e) => e !== undefined).map((e) => e!.device_seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), "device_seq must be monotonic");
  assert.equal(new Set(seqs).size, seqs.length, "device_seq must not repeat");
  // IDs that cross the wire must be bare UUIDs, not prefixed.
  assert.match(attempt.id, /^[0-9a-f-]{36}$/i);
});

test("abandonAttempt records attempt_abandoned with the module that was in progress", async () => {
  const { gw } = await gateway();
  const attempt = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", kind: "full" });

  await gw.abandonAttempt({ attemptId: attempt.id, moduleId: "m1", reason: "quit" });

  const delivery = await gw.deliveryRecords();
  const events = await Promise.all(delivery.map((d) => gw.getEventById(d.event_id)));
  const abandoned = events.find((e) => e?.event_type === "attempt_abandoned");
  assert.ok(abandoned, "attempt_abandoned must be recorded when an attempt is in progress");
  assert.equal((abandoned as { module_id?: string }).module_id, "m1");
});

test("abandonAttempt records nothing when called without a moduleId", async () => {
  const { gw } = await gateway();
  await gw.startSession({ learnerId: "l1", deviceId: "device-1" });
  const before = await gw.deliveryRecords();

  // Regression for the bug fixed in ddil-gateway.ts: this used to default
  // module_id to "" and silently emit an attempt_abandoned event the
  // contract requires module_id/content_version/attempt_id on, which the
  // server would reject as INVALID_EVENT and, being a rejection, lose for
  // good. moduleId now comes from the caller (API Spec v1.30 §8.1); an
  // empty one still must not produce an event.
  await gw.abandonAttempt({ attemptId: "attempt-that-never-started", moduleId: "", reason: "quit" });

  const after = await gw.deliveryRecords();
  assert.equal(after.length, before.length, "no event should be recorded with no module in progress");
});

// ---------------------------------------------------------------- sync status

test("sync summary reports pending work, then synced after a pass", async () => {
  const { gw } = await gateway();
  await gw.startSession({ learnerId: "l1", deviceId: "device-1" });

  let summary = await gw.getSyncSummary();
  assert.equal(summary.status, "pending");
  assert.ok(summary.pendingEventCount > 0);

  summary = await gw.requestSync();
  assert.equal(summary.status, "synced");
  assert.equal(summary.pendingEventCount, 0);
  assert.ok(summary.lastSyncedAt, "the server receipt time is exposed to the UI");
});

test("subscribeToSyncStatus emits immediately, like Chris's mock", async () => {
  const { gw } = await gateway();
  await gw.startSession({ learnerId: "l1", deviceId: "device-1" });

  const seen: string[] = [];
  const unsubscribe = gw.subscribeToSyncStatus((s) => seen.push(s.status));
  await new Promise((r) => setTimeout(r, 5));

  assert.ok(seen.length >= 1, "subscribing must emit current state, not wait for a change");
  unsubscribe();
});

test("an expired credential surfaces as a wait, not a lost-work message", async () => {
  const { gw, transport } = await gateway();
  await gw.startSession({ learnerId: "l1", deviceId: "device-1" });
  transport.always({ kind: "fail", failure: { kind: "auth", error: "token expired" } });

  const summary = await gw.requestSync();

  assert.equal(summary.status, "blocked_auth", "authorization pauses are distinct from normal retries");
  assert.equal(summary.failureReason, BLOCKED_AUTH_MESSAGES.expired_credential);
  assert.ok(summary.pendingEventCount > 0, "work is still counted as pending, not lost");
});

test("a revoked device gets different wording from an expired credential", async () => {
  const { gw, transport } = await gateway();
  await gw.startSession({ learnerId: "l1", deviceId: "device-1" });
  transport.always({ kind: "fail", failure: { kind: "auth", error: "device revoked" } });

  const summary = await gw.requestSync();

  assert.equal(summary.failureReason, BLOCKED_AUTH_MESSAGES.revoked_device);
  assert.notEqual(summary.failureReason, BLOCKED_AUTH_MESSAGES.expired_credential);
  assert.match(String(summary.failureReason), /trainer/);
});

test("a rejection is reported with its reason and is never retried", async () => {
  const { gw, transport } = await gateway();
  await gw.startSession({ learnerId: "l1", deviceId: "device-1" });
  transport.always({ kind: "reject_all", code: "UNKNOWN_QUESTION", message: "q1 not in module" });

  let summary = await gw.requestSync();
  assert.equal(summary.status, "rejected");
  assert.equal(summary.failureReason, "q1 not in module");

  const sends = transport.sendCount;
  await gw.requestSync();
  assert.equal(transport.sendCount, sends, "a rejection must not be retried");
});

test("offline with an empty queue still reads as offline, not synced", async () => {
  const { gw } = await gateway({ online: false });
  const summary = await gw.getSyncSummary();
  assert.equal(summary.status, "offline");
  assert.equal(summary.pendingEventCount, 0);
});

// ---------------------------------------------------------------- status map

test("every delivery status maps to a frontend status", () => {
  const statuses = [
    "pending",
    "inflight",
    "acknowledged",
    "blocked_auth",
    "rejected",
    "failed",
  ] as const;
  for (const s of statuses) {
    const mapped = toSyncStatus(s);
    assert.ok(mapped.length > 0, `no mapping for ${s}`);
  }
});

test("blocked_auth remains distinct from retryable delivery failures", () => {
  assert.equal(toSyncStatus("blocked_auth"), "blocked_auth");
  assert.equal(toSyncStatus("failed"), "retryable_error");
});

test("summarize puts rejection ahead of auth ahead of failure ahead of pending", () => {
  const rec = (status: DeliveryRecord["status"], extra: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
    event_id: "e",
    status,
    attempts: 0,
    next_attempt_at: null,
    last_error: null,
    lease_owner: null,
    lease_expires_at: null,
    inflight_started_at: null,
    rejected_code: null,
    settled_at: null,
    ...extra,
  });

  assert.equal(summarize([rec("pending"), rec("rejected")]).status, "rejected");
  assert.equal(summarize([rec("rejected"), rec("blocked_auth")]).authorizationReason, "unknown", "auth recovery stays discoverable beside a rejection");
  assert.equal(summarize([rec("pending"), rec("blocked_auth")]).status, "blocked_auth");
  assert.equal(summarize([rec("pending"), rec("failed")]).status, "retryable_error");
  assert.equal(summarize([rec("pending")]).status, "pending");
  assert.equal(summarize([rec("acknowledged")]).status, "synced");
});

test("the two blocked_auth cases are distinguishable from the record", () => {
  const base: DeliveryRecord = {
    event_id: "e",
    status: "blocked_auth",
    attempts: 0,
    next_attempt_at: null,
    last_error: null,
    lease_owner: null,
    lease_expires_at: null,
    inflight_started_at: null,
    rejected_code: null,
    settled_at: null,
  };
  assert.equal(blockedAuthReasonOf({ ...base, last_error: "token expired" }), "expired_credential");
  assert.equal(blockedAuthReasonOf({ ...base, last_error: "device revoked" }), "revoked_device");
});

test("delivery records are readable for diagnostics", async () => {
  const { gw } = await gateway();
  await gw.startSession({ learnerId: "l1", deviceId: "device-1" });
  const records = await gw.deliveryRecords();
  assert.ok(Array.isArray(records));
  assert.ok(records.length > 0);
  // and the underlying store agrees
  assert.equal((await allDelivery((gw as unknown as { db: never }).db)).length, records.length);
});

// ------------------------------------------------------- wire shape (v1.10)

test("attempt_completed sends local_correct/local_total, never the rejected names", async () => {
  const { gw } = await gateway();
  const attempt = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", kind: "full" });

  await gw.completeAttempt({
    learnerId: "l1",
    moduleId: "m1",
    attemptId: attempt.id,
    questionsTotal: 5,
    correctQuestionIds: ["q1", "q2", "q3"],
  });

  const records = await gw.deliveryRecords();
  const completed = await Promise.all(records.map((r) => gw.getEventById(r.event_id)));
  const evt = completed.find((e) => e?.event_type === "attempt_completed");
  assert.ok(evt, "an attempt_completed event must be recorded");

  assert.deepEqual(evt!.payload, { local_correct: 3, local_total: 5 });

  // The strict schema rejects unknown fields, so these must not appear.
  for (const banned of ["questions_total", "correct_question_ids", "sector_mastery_awards", "mission_mastery_award"]) {
    assert.equal(banned in evt!.payload, false, `${banned} would hard-reject as INVALID_EVENT`);
  }
});

test("answer_submitted carries local_is_correct, which v1.10 accepts", async () => {
  const { gw } = await gateway();
  const attempt = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", kind: "full" });
  await gw.saveAnswer({
    learnerId: "l1",
    moduleId: "m1",
    attemptId: attempt.id,
    answer: { questionId: "q1", selectedChoiceId: "c1", isCorrect: true, answeredAt: "x" },
    xpAward: 5,
  });

  const records = await gw.deliveryRecords();
  const events = await Promise.all(records.map((r) => gw.getEventById(r.event_id)));
  const answer = events.find((e) => e?.event_type === "answer_submitted");
  assert.ok(answer);
  assert.equal(answer!.payload.local_is_correct, true);
  assert.equal(answer!.payload.choice_id, "c1");
});

test("practice attempts carry question_ids, which v1.10 accepts", async () => {
  const { gw } = await gateway();
  await gw.startRemediation({ learnerId: "l1", moduleId: "m1", questionIds: ["q1", "q2"] });

  const records = await gw.deliveryRecords();
  const events = await Promise.all(records.map((r) => gw.getEventById(r.event_id)));
  const started = events.find((e) => e?.event_type === "attempt_started");
  assert.ok(started);
  assert.deepEqual(started!.payload.question_ids, ["q1", "q2"]);
  assert.equal(started!.payload.attempt_kind, "practice");
});

// --------------------------------------------------------------- progress

test("getModuleProgress reports not_started before any activity", async () => {
  const { gw } = await gateway();
  const progress = await gw.getModuleProgress("l1", "m1");
  assert.equal(progress.completionStatus, "not_started");
  assert.equal(progress.questionsAnswered, 0);
  assert.equal(progress.currentMasteryPercent, 0);
});

test("getLearnerModuleRecord returns null before any activity", async () => {
  const { gw } = await gateway();
  assert.equal(await gw.getLearnerModuleRecord("l1", "m1"), null);
});

test("getModuleProgress reflects answers against the real module size, not zero", async () => {
  const module = progressModule();
  const { gw } = await gateway({ api: apiServing(module) });
  const attempt = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", kind: "full", contentVersion: 1 });
  await gw.saveAnswer({ learnerId: "l1", moduleId: "m1", attemptId: attempt.id, answer: { questionId: "q1", selectedChoiceId: "a", isCorrect: true, answeredAt: "t1" }, xpAward: 5 });
  await gw.saveAnswer({ learnerId: "l1", moduleId: "m1", attemptId: attempt.id, answer: { questionId: "q2", selectedChoiceId: "b", isCorrect: false, answeredAt: "t2" }, xpAward: 5 });

  const progress = await gw.getModuleProgress("l1", "m1");
  assert.equal(progress.questionsTotal, 3, "pulled from the cached module, not hardcoded");
  assert.equal(progress.questionsAnswered, 2);
  assert.equal(progress.currentMasteryPercent, 33.3, "1 of 3 questions mastered, using server precision");
  assert.equal(progress.stillUnmasteredCount, 2);
  assert.equal(progress.completionStatus, "in_progress", "no attempt_completed yet");
});

test("getLearnerModuleRecord tracks initial misses, mastery, and awards across a full attempt then remediation", async () => {
  const module = progressModule();
  const { gw } = await gateway({ api: apiServing(module) });

  const full = await gw.startAttempt({ learnerId: "l1", moduleId: "m1", kind: "full", contentVersion: 1 });
  await gw.saveAnswer({ learnerId: "l1", moduleId: "m1", attemptId: full.id, answer: { questionId: "q1", selectedChoiceId: "a", isCorrect: true, answeredAt: "t1" }, xpAward: 5 });
  await gw.saveAnswer({ learnerId: "l1", moduleId: "m1", attemptId: full.id, answer: { questionId: "q2", selectedChoiceId: "b", isCorrect: false, answeredAt: "t2" }, xpAward: 5 });
  await gw.saveAnswer({ learnerId: "l1", moduleId: "m1", attemptId: full.id, answer: { questionId: "q3", selectedChoiceId: "b", isCorrect: false, answeredAt: "t3" }, xpAward: 5 });
  await gw.completeAttempt({ learnerId: "l1", moduleId: "m1", attemptId: full.id, questionsTotal: 3, correctQuestionIds: ["q1"] });

  let record = await gw.getLearnerModuleRecord("l1", "m1");
  assert.ok(record);
  assert.equal(record!.completionStatus, "completed");
  assert.deepEqual(new Set(record!.initialMissedQuestionIds), new Set(["q2", "q3"]));
  assert.deepEqual(record!.masteredQuestionIds, ["q1"]);
  assert.equal(record!.engagement.xp, 5, "one mastered question so far, no sector/mission bonus yet");
  assert.equal(record!.engagement.completedSectorIds.length, 0);
  assert.equal(record!.attempts.length, 1);
  assert.equal(record!.attempts[0]!.kind, "full");
  assert.equal(record!.attempts[0]!.initialScorePercent, 33.3);

  const remediation = await gw.startRemediation({ learnerId: "l1", moduleId: "m1", contentVersion: 1, questionIds: ["q2", "q3"] });
  await gw.saveAnswer({ learnerId: "l1", moduleId: "m1", attemptId: remediation.id, answer: { questionId: "q2", selectedChoiceId: "a", isCorrect: true, answeredAt: "t4" }, xpAward: 5 });
  await gw.saveAnswer({ learnerId: "l1", moduleId: "m1", attemptId: remediation.id, answer: { questionId: "q3", selectedChoiceId: "a", isCorrect: true, answeredAt: "t5" }, xpAward: 5 });
  await gw.completeAttempt({ learnerId: "l1", moduleId: "m1", attemptId: remediation.id, questionsTotal: 2, correctQuestionIds: ["q2", "q3"] });

  record = await gw.getLearnerModuleRecord("l1", "m1");
  assert.ok(record);
  assert.deepEqual(new Set(record!.masteredQuestionIds), new Set(["q1", "q2", "q3"]), "remediation mastery counts toward the module");
  assert.deepEqual(record!.initialMissedQuestionIds, ["q2", "q3"], "the initial attempt's miss list never changes retroactively");
  assert.equal(record!.currentMasteryPercent, 100);
  assert.equal(record!.stillUnmasteredCount, 0);
  assert.equal(record!.engagement.completedSectorIds[0], "sector-1", "q1+q2 now both mastered");
  assert.deepEqual(record!.engagement.earnedBadgeIds, ["badge-1"], "all three questions mastered");
  // 3 questions * 5xp + 10 sector bonus + 20 mission bonus
  assert.equal(record!.engagement.xp, 3 * 5 + 10 + 20);
  assert.equal(record!.attempts.length, 2);
  assert.equal(record!.attempts[1]!.kind, "remediation");
  assert.deepEqual(record!.attempts[1]!.questionIds, ["q2", "q3"]);
});

// ----------------------------------------------------------- device setup (§8.1)

function apiWithSetup(posts: { count: number }): DeviceApi {
  return {
    get: async (path: string) => { throw new Error(`unexpected GET ${path}`); },
    post: async (path: string) => {
      if (path !== "/v1/setup") throw new Error(`unexpected POST ${path}`);
      posts.count += 1;
      return {
        device_token: `token-${posts.count}`,
        learner: { learner_id: `learner-${posts.count}`, learner_code: `L-00${posts.count}`, username: "demo", cohort_name: "Cohort A" },
      };
    },
  };
}

test("getLearnerProfile is null before setup, then returns the claimed profile", async () => {
  const posts = { count: 0 };
  const { gw } = await gateway({ api: apiWithSetup(posts) });
  assert.equal(await gw.getLearnerProfile(), null);
  const profile = await gw.setupDevice({ setupCode: "CODE-1", username: "demo" });
  assert.deepEqual(await gw.getLearnerProfile(), profile);
});

test("setupDevice re-runs on an already-claimed device, e.g. handing a shared device to a new student", async () => {
  const posts = { count: 0 };
  const { gw } = await gateway({ api: apiWithSetup(posts) });
  const first = await gw.setupDevice({ setupCode: "CODE-1", username: "demo" });
  assert.equal(posts.count, 1);

  // The server, not this method, is the one place that knows whether a code
  // may still be consumed — a genuinely reused code is its job to reject.
  // This call must always reach it rather than short-circuit locally.
  const second = await gw.setupDevice({ setupCode: "CODE-2", username: "someone-else" });
  assert.equal(posts.count, 2, "always asks the server; it alone enforces one-time use");
  assert.notDeepEqual(second, first, "a new successful setup replaces the device's previous profile");
});
