/**
 * Comprehensive verification suite covering the 5 core field scenarios:
 *
 *  1. The Save-Then-Blackout Test (DDIL Durability & Zero Double-Counting)
 *  2. The 401 Authentication Trap (Lifecycle & Observable Recovery)
 *  3. The Four-Store Consistency Test (IndexedDB Invariants Across Restart)
 *  4. The Single-Flight Concurrency Test (Mutual Exclusion & Mid-Sync Ingestion)
 *  5. The 422 Terminal-Rejection Test (Evidence Preservation & Non-Retryable Invariants)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import { FakeTransport } from "./fakes/fake-transport.ts";
import { DdilLearningGateway } from "../../src/sync/gateway/ddil-gateway.ts";
import {
  allAttempts,
  allDelivery,
  allEvents,
  getDelivery,
  getEvent,
  getMeta,
  openDatabase,
  STORE_DELIVERY,
  STORE_EVENTS,
  STORE_LOG,
  STORE_META,
} from "../../src/sync/stores/db.ts";
import { SyncEngine } from "../../src/sync/engine/sync.ts";
import type { ActivityEvent, DeliveryRecord } from "../../src/sync/types.ts";
import type { SyncTransport, SendResponse } from "../../src/sync/transport/transport.ts";

// ============================================================================
// 1. THE SAVE-THEN-BLACKOUT TEST
// ============================================================================

test("SCENARIO 1: The Save-Then-Blackout Test", async () => {
  const factory = new FakeIDBFactory();
  let clock = 1_700_000_000_000;
  const now = () => clock;
  const transport = new FakeTransport(now);

  // Initialize Gateway in online state
  const gw1 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-athlete-01",
    now,
  });
  await gw1.init();

  const session = await gw1.startSession({ learnerId: "learner-field-01", deviceId: "device-athlete-01" });
  const attempt = await gw1.startAttempt({ learnerId: "learner-field-01", moduleId: "mod-cyber-vocab", kind: "full" });

  // 1. saveAnswer() does not resolve successfully before its IndexedDB transaction commits.
  let saveResolved = false;
  const savePromise = gw1.saveAnswer({
    learnerId: "learner-field-01",
    moduleId: "mod-cyber-vocab",
    attemptId: attempt.id,
    answer: { questionId: "q-c2-infrastructure", selectedChoiceId: "choice-1", isCorrect: true, answeredAt: new Date(now()).toISOString() },
    xpAward: 25,
  }).then(() => {
    saveResolved = true;
  });

  await savePromise;
  assert.equal(saveResolved, true, "saveAnswer resolved");

  // Verify immediately on disk upon resolution
  const db1 = await openDatabase(factory);
  const eventsAfterSave = await allEvents(db1);
  const answerEvent = eventsAfterSave.find((e) => e.event_type === "answer_submitted");
  assert.ok(answerEvent, "1. saveAnswer write must be committed to IndexedDB when promise resolves");
  assert.equal(answerEvent.payload.choice_id, "choice-1");

  // 2. The answer survives a page refresh (restarting gateway on the same database).
  const gw2 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-athlete-01",
    now,
  });
  await gw2.init();

  const eventsAfterRestart = await allEvents(db1);
  const reloadedAnswer = eventsAfterRestart.find((e) => e.event_type === "answer_submitted");
  assert.ok(reloadedAnswer, "2. Answer event must survive application/browser restart");
  assert.equal(reloadedAnswer.event_id, answerEvent.event_id);

  // 3. The event remains available for delivery.
  const deliveryBeforeSync = await getDelivery(db1, answerEvent.event_id);
  assert.ok(deliveryBeforeSync, "Delivery record exists");
  assert.equal(deliveryBeforeSync.status, "pending", "3. Event remains available in pending status for delivery");
  assert.equal(deliveryBeforeSync.attempts, 0);

  // 4. A failed synchronization (network blackout) does not erase the answer or spend attempts.
  transport.always({ kind: "fail", failure: { kind: "unreachable", error: "Blackout: radio silence" } });
  const syncSummaryFail = await gw2.requestSync();
  assert.equal(syncSummaryFail.pendingEventCount >= 1, true, "Still pending");

  const eventsAfterFailedSync = await allEvents(db1);
  const answerAfterFail = eventsAfterFailedSync.find((e) => e.event_id === answerEvent.event_id);
  assert.ok(answerAfterFail, "4a. Failed synchronization must NEVER erase the answer from events store");

  const deliveryAfterFail = await getDelivery(db1, answerEvent.event_id);
  assert.equal(deliveryAfterFail?.status, "pending", "4b. Delivery status remains pending");
  assert.equal(deliveryAfterFail?.attempts, 0, "4c. Unreachable network does NOT consume retry budget");

  // 5. Restoring the connection allows the event to be delivered.
  clock += 10_000; // Advance past backoff window
  transport.always({ kind: "accept_all" });
  const syncSummarySuccess = await gw2.requestSync();

  const deliveryAfterReconnect = await getDelivery(db1, answerEvent.event_id);
  assert.equal(deliveryAfterReconnect?.status, "acknowledged", "5. Restoring connection acknowledges the delivery");
  assert.ok(deliveryAfterReconnect?.settled_at !== null, "Delivery has settled timestamp");

  // 6. Replaying the same event does not create a duplicate server-side record.
  transport.always({ kind: "duplicate_all" });
  const duplicatePass = await gw2.requestSync();

  // Acknowledged work is settled and never re-sent:
  const deliveryFinal = await getDelivery(db1, answerEvent.event_id);
  assert.equal(deliveryFinal?.status, "acknowledged", "6. Replayed work stays acknowledged with zero double counting");

  const allRecords = await allEvents(db1);
  const duplicateEvents = allRecords.filter((e) => e.event_id === answerEvent.event_id);
  assert.equal(duplicateEvents.length, 1, "Exactly one event record exists on disk");
});

// ============================================================================
// 2. THE 401 AUTHENTICATION TRAP
// ============================================================================

test("SCENARIO 2: The 401 Authentication Trap Test", async () => {
  const factory = new FakeIDBFactory();
  let clock = 1_700_000_000_000;
  const now = () => clock;
  const transport = new FakeTransport(now);

  const gw = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-athlete-02",
    now,
  });
  await gw.init();
  await gw.startSession({ learnerId: "learner-field-02", deviceId: "device-athlete-02" });
  const attempt = await gw.startAttempt({ learnerId: "learner-field-02", moduleId: "mod-threat-intel", kind: "full" });
  await gw.saveAnswer({
    learnerId: "learner-field-02",
    moduleId: "mod-threat-intel",
    attemptId: attempt.id,
    answer: { questionId: "q-mitre-t1059", selectedChoiceId: "c1", isCorrect: true, answeredAt: new Date(now()).toISOString() },
    xpAward: 10,
  });

  const db = await openDatabase(factory);
  const pendingRecords = (await allDelivery(db)).filter((d) => d.status === "pending");
  assert.ok(pendingRecords.length > 0, "Events start in pending state");

  // Step 1: Server returns 401 Unauthorized (e.g. JWT session token expired during offline duration)
  transport.always({ kind: "fail", failure: { kind: "auth", error: "Session token expired (401)" } });
  const pass1 = await gw.requestSync();

  const deliveryAfter401 = await allDelivery(db);
  const blockedRecords = deliveryAfter401.filter((d) => d.status === "blocked_auth");
  assert.equal(blockedRecords.length, pendingRecords.length, "All pending items enter blocked_auth");

  // - A 401 does not trigger an infinite retry loop (next_attempt_at is null, attempts: 0)
  for (const b of blockedRecords) {
    assert.equal(b.next_attempt_at, null, "Retry clock is frozen (null) to prevent infinite retry loops");
    assert.equal(b.attempts, 0, "No retry budget consumed for authentication pause");
  }

  // - Events aren't silently discarded
  const eventsAfter401 = await allEvents(db);
  assert.equal(eventsAfter401.length >= 3, true, "Committed work is 100% preserved in events store");

  // - Blocked events remain visible in the inspector / summary
  const summaryWhileBlocked = await gw.getSyncSummary();
  assert.equal(summaryWhileBlocked.pendingEventCount, blockedRecords.length, "Blocked events are visible in pending count");
  assert.ok(summaryWhileBlocked.failureReason?.includes("authorization"), "Inspector shows clear human-readable authorization pause");

  // Calling sync again while 401 is active DOES NOT dispatch requests (no retry storm)
  const sendCountBefore = transport.sendCount;
  await gw.requestSync();
  assert.equal(transport.sendCount, sendCountBefore, "No outbound network calls made while work is in blocked_auth");

  // Step 2: Authentication Recovery
  // User re-authenticates or session is refreshed.
  transport.always({ kind: "accept_all" });

  // Explicit recovery path: startSession() re-establishes credentials and un-strands auth-blocked records
  const newSession = await gw.startSession({ learnerId: "learner-field-02", deviceId: "device-athlete-02" });
  assert.ok(newSession.id, "New session started with refreshed credentials");

  const deliveryAfterUnblock = await allDelivery(db);
  const readyPending = deliveryAfterUnblock.filter((d) => d.status === "pending");
  assert.ok(readyPending.length >= blockedRecords.length, "All blocked_auth records transitioned to pending");
  assert.ok(readyPending.every((r) => r.attempts === 0), "Retry budget intact upon unblock");

  // Step 3: Next sync pass cleanly claims and delivers work
  const pass2 = await gw.requestSync();
  const deliveryFinal = await allDelivery(db);
  const acknowledged = deliveryFinal.filter((d) => d.status === "acknowledged");
  assert.ok(acknowledged.length >= blockedRecords.length, "Events successfully acknowledged after auth recovery");

  // - Events already acknowledged by the server aren't accidentally resubmitted as new events
  const sendCountAfterAck = transport.sendCount;
  await gw.requestSync();
  assert.equal(transport.sendCount, sendCountAfterAck, "Acknowledged work is never resubmitted");
});

// ============================================================================
// 3. THE FOUR-STORE CONSISTENCY TEST
// ============================================================================

test("SCENARIO 3: The Four-Store Consistency Test", async () => {
  const factory = new FakeIDBFactory();
  let clock = 1_700_000_000_000;
  const now = () => clock;
  const transport = new FakeTransport(now);

  const gw1 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-consistent-03",
    now,
  });
  await gw1.init();

  // 1. Create events
  const session = await gw1.startSession({ learnerId: "learner-03", deviceId: "device-consistent-03" });
  const attempt = await gw1.startAttempt({ learnerId: "learner-03", moduleId: "mod-cve", kind: "full" });
  await gw1.saveAnswer({
    learnerId: "learner-03",
    moduleId: "mod-cve",
    attemptId: attempt.id,
    answer: { questionId: "q-log4shell", selectedChoiceId: "c-rce", isCorrect: true, answeredAt: "t1" },
    xpAward: 20,
  });

  // 2. Record multiple delivery attempts (Attempt 1: server_error)
  transport.always({ kind: "fail", failure: { kind: "server_error", error: "500 Internal Server Error" } });
  await gw1.requestSync();

  // 3. Simulate a terminal rejection (Attempt 2: rejected)
  transport.always({
    kind: "reject_all",
    code: "DEADLINE_PASSED",
    message: "Submission deadline for mod-cve has closed.",
  });
  clock += 10_000;
  await gw1.requestSync();

  // 4. Restart the application (open fresh gateway on the same database)
  const gw2 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-consistent-03",
    now,
  });
  await gw2.init();

  // 5. Inspect all four stores directly from the persistent IndexedDB
  const db = await openDatabase(factory);

  // Invariant 1: `events` store — committed records remain intact, immutable, never deleted
  const events = await allEvents(db);
  assert.ok(events.length >= 3, "All events present");
  const log4jEvent = events.find((e) => e.question_id === "q-log4shell");
  assert.ok(log4jEvent, "Target answer event exists in events store");
  assert.equal(log4jEvent.schema_version, 1);
  assert.equal(log4jEvent.payload.choice_id, "c-rce");

  // Invariant 2: `delivery` store — current state matches defined state machine
  const deliveries = await allDelivery(db);
  const targetDelivery = deliveries.find((d) => d.event_id === log4jEvent.event_id);
  assert.ok(targetDelivery, "Delivery row exists");
  assert.equal(targetDelivery.status, "rejected", "Terminal rejection status matches state machine");
  assert.equal(targetDelivery.rejected_code, "DEADLINE_PASSED");
  assert.equal(targetDelivery.next_attempt_at, null);

  // Invariant 3: `delivery_log` store — historical records are preserved rather than overwritten
  const logs = await allAttempts(db);
  assert.ok(logs.length >= 2, "Multiple attempts are preserved in delivery_log");
  const eventLogs = logs.filter((l) => l.event_id === log4jEvent.event_id);
  assert.ok(eventLogs.length >= 2, "All attempts for target event are logged separately");
  const outcomes = eventLogs.map((l) => l.outcome);
  assert.ok(outcomes.includes("retryable_error"), "Log records 500 error attempt");
  assert.ok(outcomes.includes("rejected"), "Log records rejection attempt");

  // Invariant 4: `meta` store — device and app metadata survive restart
  const persistedDeviceId = await getMeta<string>(db, "device_id");
  const persistedSeq = await getMeta<number>(db, "device_seq");
  const activeSessionId = await getMeta<string>(db, "active_session_id");

  assert.equal(persistedDeviceId, "device-consistent-03", "device_id survives restart");
  assert.ok(persistedSeq !== undefined && persistedSeq >= 3, "device_seq survives restart");
  assert.equal(activeSessionId, session.id, "active_session_id survives restart");

  // Invariant 5: Inspector reflects real IndexedDB, not out-of-sync UI state
  const summary = await gw2.getSyncSummary();
  assert.equal(summary.status, "rejected", "Inspector summary directly reflects persisted DB status");
  assert.ok(summary.failureReason?.includes("deadline") || summary.failureReason?.includes("DEADLINE_PASSED"));
});

// ============================================================================
// 4. THE SINGLE-FLIGHT CONCURRENCY TEST
// ============================================================================

test("SCENARIO 4: The Single-Flight Concurrency Test", async () => {
  const factory = new FakeIDBFactory();
  let clock = 1_700_000_000_000;
  const now = () => clock;

  // Custom Controllable Blocking Transport to hold requests in-flight
  let activeSendCount = 0;
  let totalDispatches = 0;
  let unblockPromise: ((res: SendResponse) => void) | null = null;

  const blockingTransport: SyncTransport = {
    async send(events: ActivityEvent[]): Promise<SendResponse> {
      activeSendCount++;
      totalDispatches++;
      return new Promise<SendResponse>((resolve) => {
        unblockPromise = resolve;
      });
    },
  };

  const gw = new DdilLearningGateway({
    idb: factory,
    transport: blockingTransport,
    deviceId: "device-flight-04",
    now,
  });
  await gw.init();
  await gw.startSession({ learnerId: "learner-04", deviceId: "device-flight-04" });
  await gw.startAttempt({ learnerId: "learner-04", moduleId: "mod-concurrency", kind: "full" });

  // 1. Start synchronization request (held open)
  const syncPromise1 = gw.requestSync();

  // Allow microtask to enter transport.send
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(activeSendCount, 1, "First sync is in-flight");

  // 2. Trigger several additional SYNC requests while first is still in flight
  const syncPromise2 = gw.requestSync();
  const syncPromise3 = gw.requestSync();
  const syncPromise4 = gw.requestSync();

  // 3. New event created while sync is in flight
  const midSyncAnswer = gw.saveAnswer({
    learnerId: "learner-04",
    moduleId: "mod-concurrency",
    attemptId: "att-mid",
    answer: { questionId: "q-mid-flight", selectedChoiceId: "c1", isCorrect: true, answeredAt: "t-mid" },
    xpAward: 15,
  });
  await midSyncAnswer;

  // Verify that only 1 transport call was dispatched under single-flight
  assert.equal(totalDispatches, 1, "Single-flight: Concurrent sync calls must NOT dispatch parallel transport requests");

  // 4. Release the first response
  assert.ok(unblockPromise !== null, "Unblock barrier ready");
  const at = new Date(now()).toISOString();
  unblockPromise!({
    ok: true,
    result: {
      outcomes: [
        { event_id: "evt-0001", status: "accepted" },
        { event_id: "evt-0002", status: "accepted" },
      ],
      received_at: at,
    },
  });

  await Promise.all([syncPromise1, syncPromise2, syncPromise3, syncPromise4]);
  assert.equal(totalDispatches, 1, "First batch completed with exactly 1 transport dispatch");

  // 5. Verify event created mid-flight was NOT permanently stranded
  const db = await openDatabase(factory);
  const midFlightEvent = (await allEvents(db)).find((e) => e.question_id === "q-mid-flight");
  assert.ok(midFlightEvent, "Mid-flight event was committed to DB");

  const midFlightDelivery = await getDelivery(db, midFlightEvent.event_id);
  assert.equal(midFlightDelivery?.status, "pending", "Mid-flight event remains pending and ready for next pass");

  // 6. Next pass picks up and syncs the mid-flight event
  const fastTransport = new FakeTransport(now);
  fastTransport.always({ kind: "accept_all" });
  gw["engine"]!["opts"].transport = fastTransport;

  await gw.requestSync();
  const midFlightDeliveryFinal = await getDelivery(db, midFlightEvent.event_id);
  assert.equal(midFlightDeliveryFinal?.status, "acknowledged", "Mid-flight event successfully synced on subsequent pass");

  // 7. Repeat Single-Flight under thrown transport error
  let throwUnblock: (() => void) | null = null;
  const throwTransport: SyncTransport = {
    async send(): Promise<SendResponse> {
      return new Promise<SendResponse>((_, reject) => {
        throwUnblock = () => reject(new Error("Simulated network drop"));
      });
    },
  };
  gw["engine"]!["opts"].transport = throwTransport;

  // Record fresh event
  await gw.saveAnswer({
    learnerId: "learner-04",
    moduleId: "mod-concurrency",
    attemptId: "att-err",
    answer: { questionId: "q-err-test", selectedChoiceId: "c2", isCorrect: false, answeredAt: "t-err" },
    xpAward: 0,
  });

  const throwSyncPromise1 = gw.requestSync();
  await new Promise((r) => setTimeout(r, 10));
  const throwSyncPromise2 = gw.requestSync(); // Concurrent call

  throwUnblock!(); // Throw error
  await Promise.allSettled([throwSyncPromise1, throwSyncPromise2]);

  // System remains recoverable: lock is freed, no deadlock
  gw["engine"]!["opts"].transport = fastTransport;
  const recoverPass = await gw.requestSync();
  assert.ok(recoverPass !== null, "System recovered seamlessly after thrown transport error");
});

// ============================================================================
// 5. THE 422 TERMINAL-REJECTION TEST
// ============================================================================

test("SCENARIO 5: The 422 Terminal-Rejection Test", async () => {
  const factory = new FakeIDBFactory();
  let clock = 1_700_000_000_000;
  const now = () => clock;
  const transport = new FakeTransport(now);

  const gw = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: "device-rejection-05",
    now,
  });
  await gw.init();
  await gw.startSession({ learnerId: "learner-05", deviceId: "device-rejection-05" });
  const attempt = await gw.startAttempt({ learnerId: "learner-05", moduleId: "mod-exam", kind: "full" });

  await gw.saveAnswer({
    learnerId: "learner-05",
    moduleId: "mod-exam",
    attemptId: attempt.id,
    answer: { questionId: "q-terminal-test", selectedChoiceId: "choice-3", isCorrect: true, answeredAt: "t-rejection" },
    xpAward: 30,
  });

  const db = await openDatabase(factory);
  const events = await allEvents(db);
  const targetEvent = events.find((e) => e.question_id === "q-terminal-test");
  assert.ok(targetEvent, "Answer recorded");

  // Server returns 422 Unprocessable Entity / DEADLINE_PASSED
  transport.always({
    kind: "reject_all",
    code: "DEADLINE_PASSED",
    message: "The assessment window for mod-exam closed on 2026-10-24T23:59:59Z.",
  });

  // Execute sync pass
  const summary = await gw.requestSync();

  // 1. Rejection is recorded in delivery store
  const delivery = await getDelivery(db, targetEvent.event_id);
  assert.equal(delivery?.status, "rejected", "Delivery status is terminal 'rejected'");
  assert.equal(delivery?.rejected_code, "DEADLINE_PASSED", "Machine-readable rejection code stored");
  assert.ok(delivery?.last_error?.includes("closed"), "Human-readable explanation stored");
  assert.ok(delivery?.settled_at !== null, "settled_at timestamp is stamped");

  // 2. The event remains available on disk for inspection and export (evidence preservation)
  const storedEvent = await getEvent(db, targetEvent.event_id);
  assert.ok(storedEvent, "Event row is NEVER deleted upon rejection");
  assert.equal(storedEvent.payload.choice_id, "choice-3", "Learner's submitted answer is intact");

  // 3. Client does NOT retry indefinitely
  assert.equal(delivery.next_attempt_at, null, "next_attempt_at must be null — never scheduled again");

  const sendCountPrior = transport.sendCount;
  // Trigger 3 subsequent sync passes:
  await gw.requestSync();
  await gw.requestSync();
  await gw.requestSync();
  assert.equal(transport.sendCount, sendCountPrior, "A rejected event is never re-dispatched to the server");

  // 4. The event cannot be mistaken for an accepted event
  assert.notEqual(delivery.status, "acknowledged");
  const latestSummary = await gw.getSyncSummary();
  assert.equal(latestSummary.status, "rejected", "Summary reflects terminal rejection");

  // 5. Any correction or resubmission follows explicit user policy (new mutation with distinct opId)
  // Learner starts a new practice attempt with new attempt_id
  const practiceAttempt = await gw.startRemediation({
    learnerId: "learner-05",
    moduleId: "mod-exam",
    questionIds: ["q-terminal-test"],
  });
  assert.ok(practiceAttempt.id !== attempt.id, "Resubmission generates new mutation with distinct ID");

  transport.always({ kind: "accept_all" });
  await gw.requestSync();

  const newAttemptDelivery = await getDelivery(db, practiceAttempt.id);
  // Original rejected record remains untouched as audit history
  const originalDeliveryCheck = await getDelivery(db, targetEvent.event_id);
  assert.equal(originalDeliveryCheck?.status, "rejected", "Original rejected row remains permanently preserved in audit record");
});
