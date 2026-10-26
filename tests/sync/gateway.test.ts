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

let clock = 1_700_000_000_000;
const now = () => clock;

async function gateway(over: { online?: boolean } = {}) {
  const transport = new FakeTransport(now);
  const gw = new DdilLearningGateway({
    idb: new FakeIDBFactory(),
    transport,
    deviceId: "device-1",
    owner: "device-1:tab-1",
    now,
    isOnline: () => over.online ?? true,
  });
  await gw.init();
  return { gw, transport };
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

  assert.equal(summary.status, "retryable_error", "no dedicated frontend state yet");
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

test("blocked_auth and failed both fall back to retryable_error — the known gap", () => {
  assert.equal(toSyncStatus("blocked_auth"), "retryable_error");
  assert.equal(toSyncStatus("failed"), "retryable_error");
  // Documented so that adding a seventh SyncStatus is a deliberate change.
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
  assert.equal(summarize([rec("pending"), rec("blocked_auth")]).status, "retryable_error");
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
