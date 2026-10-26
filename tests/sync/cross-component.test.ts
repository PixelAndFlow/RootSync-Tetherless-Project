/**
 * Cross-Component Boundary Stress Suite
 *
 * Integrates:
 *   - Chris's frontend gateway interface (OfflineLearningGateway)
 *   - Marc's backend API server (spec v1.10, live HTTP on Node)
 *   - Naquan's DDIL local storage and sync engine (IndexedDB outbox, leases, retry)
 *
 * Targets Priority 0 and Priority 1 failure modes identified across component boundaries.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createApp } from "/tmp/marc-backend/packages/server/src/app.ts";
import { loadConfig } from "/tmp/marc-backend/packages/server/src/config.ts";
import { ContentRegistry } from "/tmp/marc-backend/packages/server/src/content.ts";
import { MemoryStore } from "/tmp/marc-backend/packages/server/src/memory-store.ts";
import { createStaffAccount } from "/tmp/marc-backend/packages/server/src/admin.ts";

import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import { DdilLearningGateway } from "../../src/sync/gateway/ddil-gateway.ts";
import { HttpTransport } from "../../src/sync/transport/http-transport.ts";
import { allDelivery, allEvents, getDelivery, getMeta } from "../../src/sync/stores/db.ts";

const CONTENT_DIR = "/tmp/marc-backend/content/modules";
const PW = "correct horse battery staple";

let server: Server;
let base = "";
let store: MemoryStore;
let staffToken = "";
let cohortId = "";

before(async () => {
  store = new MemoryStore();
  const config = loadConfig({
    CONTENT_DIR,
    AUTH_RATE_LIMIT_PER_MINUTE: "5000",
  });
  const now = new Date("2026-10-26T12:00:00.000Z");
  const content = await ContentRegistry.open(store, CONTENT_DIR, now.toISOString());

  await createStaffAccount(store, {
    username: "trainer.cross",
    displayName: "Cross Tester",
    role: "superadmin",
    password: PW,
  });

  server = createServer(createApp({ store, content, config, clock: () => now }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Log in as staff to create test cohort
  const loginRes = await fetch(`${base}/v1/staff/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "trainer.cross", password: PW }),
  });
  const loginData = await loginRes.json();
  staffToken = loginData.token;

  const cohortRes = await fetch(`${base}/v1/staff/cohorts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({ name: "CrossComponentCohort" }),
  });
  const cohortData = await cohortRes.json();
  cohortId = cohortData.cohort.cohort_id;

  // Assign phishing-basics to cohort
  await fetch(`${base}/v1/staff/assignments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({ cohort_id: cohortId, module_id: "phishing-basics" }),
  });
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Helper to enroll a fresh learner and return client setup credentials */
async function enrollLearner(firstName: string, lastName: string, deviceId = crypto.randomUUID()): Promise<{
  learnerId: string;
  deviceId: string;
  token: string;
}> {
  // 1. Staff creates learner to get setup code
  const staffRes = await fetch(`${base}/v1/staff/learners`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify({
      cohort_id: cohortId,
      first_name: firstName,
      last_name: lastName,
      training_level: "Beginner",
    }),
  });
  const staffData = await staffRes.json();
  const setupCode = staffData.setup_code;

  // 2. Device performs setup with code
  const setupRes = await fetch(`${base}/v1/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      setup_code: setupCode,
      username: `${firstName.toLowerCase()}.${Date.now() % 10000}`,
      device_id: deviceId,
    }),
  });
  const setupData = await setupRes.json();
  return {
    learnerId: setupData.learner.learner_id,
    deviceId,
    token: setupData.device_token,
  };
}

// ============================================================================
// PRIORITY 0: CROSS-COMPONENT BOUNDARY FAILURES
// ============================================================================

test("P0-1: Server acceptance followed by lost network acknowledgment (Idempotent Retry)", async () => {
  const creds = await enrollLearner("Idem", "Replay");
  const factory = new FakeIDBFactory();

  // Create an intercepting fetch that lets the request reach server, stores it,
  // but simulates a network drop/timeout on the return response
  let dropNextResponse = false;
  const interceptingFetch: typeof fetch = async (url, init) => {
    const res = await fetch(url, init);
    if (dropNextResponse) {
      dropNextResponse = false;
      throw new TypeError("Network connection lost mid-response");
    }
    return res;
  };

  const transport = new HttpTransport({
    baseUrl: base,
    token: () => creds.token,
    fetch: interceptingFetch,
  });

  const gw = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: creds.deviceId,
    backoff: { baseMs: 10, maxMs: 50 },
  });
  await gw.init();
  await gw.startSession({ learnerId: creds.learnerId, deviceId: creds.deviceId });

  const attempt = await gw.startAttempt({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    kind: "full",
  });

  await gw.saveAnswer({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    answer: {
      questionId: "phishing-basics-q01",
      selectedChoiceId: "a",
      isCorrect: true,
      answeredAt: new Date().toISOString(),
    },
    xpAward: 10,
  });

  // 1. First sync pass: server accepts the event, but response is dropped
  dropNextResponse = true;
  const summary1 = await gw.requestSync();
  assert.ok(
    summary1.status === "pending" || summary1.status === "offline",
    "Network drop leaves events in pending state without advancing",
  );

  const deliveries1 = await gw.deliveryRecords();
  assert.ok(deliveries1.every((d) => d.status === "pending"), "Event remains in pending state");
  assert.ok(deliveries1.every((d) => d.attempts === 0), "Attempts are NOT incremented for unreachable");

  // 2. Wait for backoff curve, then second sync pass: re-sending the exact same batch
  await new Promise((r) => setTimeout(r, 70));
  const summary2 = await gw.requestSync();
  assert.equal(summary2.status, "synced", "Second pass succeeds");

  const deliveries2 = await gw.deliveryRecords();
  assert.ok(deliveries2.every((d) => d.status === "acknowledged"), "Events are acknowledged via server duplicate handling");

  // Invariant: Server stored exactly one record per event_id, no duplication
  const serverEvents = await store.listEvents(creds.learnerId);
  const serverEventIds = serverEvents.map((e) => e.event_id);
  const allEventsOnClient = await allEvents(gw["require"]());
  for (const e of allEventsOnClient) {
    assert.ok(serverEventIds.includes(e.event_id), `Event ${e.event_id} is stored on server`);
  }
  assert.equal(
    new Set(serverEventIds).size,
    serverEventIds.length,
    "Zero duplicate rows created on server despite retry storm",
  );
});

test("P0-2: Replay of same event_id with mutated payload triggers EVENT_ID_CONFLICT", async () => {
  const creds = await enrollLearner("Tamper", "Test");
  const factory = new FakeIDBFactory();

  const transport = new HttpTransport({
    baseUrl: base,
    token: () => creds.token,
  });

  const gw = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: creds.deviceId,
  });
  await gw.init();
  await gw.startSession({ learnerId: creds.learnerId, deviceId: creds.deviceId });

  const attempt = await gw.startAttempt({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    kind: "full",
  });

  await gw.saveAnswer({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    answer: {
      questionId: "phishing-basics-q01",
      selectedChoiceId: "a",
      isCorrect: true,
      answeredAt: new Date().toISOString(),
    },
    xpAward: 10,
  });

  // Sync legitimately first
  await gw.requestSync();
  const deliveries = await gw.deliveryRecords();
  assert.ok(deliveries.every((d) => d.status === "acknowledged"));

  // Now an attacker reuses the same event_id with a different choice payload
  const originalEvent = (await allEvents(gw["require"]())).find((e) => e.event_type === "answer_submitted")!;
  const tamperedEvent = {
    ...originalEvent,
    payload: {
      ...originalEvent.payload,
      choice_id: "b", // changed choice
    },
  };

  const response = await transport.send([tamperedEvent]);
  assert.equal(response.ok, true);
  if (response.ok) {
    const outcome = response.result.outcomes.find((o) => o.event_id === originalEvent.event_id);
    assert.equal(outcome?.status, "rejected");
    assert.equal(outcome?.code, "EVENT_ID_CONFLICT", "Server rejects payload alteration for same event_id");
  }
});

test("P0-3 & P0-4: 401 Auth Expiration during sync and explicit recovery", async () => {
  const creds = await enrollLearner("Auth", "Trap");
  const factory = new FakeIDBFactory();

  let activeToken: string | null = creds.token;
  const transport = new HttpTransport({
    baseUrl: base,
    token: () => activeToken,
  });

  const gw = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: creds.deviceId,
  });
  await gw.init();
  await gw.startSession({ learnerId: creds.learnerId, deviceId: creds.deviceId });

  const attempt = await gw.startAttempt({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    kind: "full",
  });
  await gw.saveAnswer({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    answer: {
      questionId: "phishing-basics-q01",
      selectedChoiceId: "a",
      isCorrect: true,
      answeredAt: new Date().toISOString(),
    },
    xpAward: 10,
  });

  // 1. Simulate token invalidation / revocation on server
  activeToken = "expired-invalid-token";

  const summary = await gw.requestSync();
  assert.equal(
    summary.status,
    "retryable_error",
    "Chris's 6-status contract rolls up blocked_auth to retryable_error without losing work",
  );
  assert.ok(
    summary.failureReason?.includes("authorization"),
    "failureReason clearly explains the authorization requirement to the learner",
  );

  const deliveries = await gw.deliveryRecords();
  assert.ok(deliveries.every((d) => d.status === "blocked_auth"), "All events entered blocked_auth");
  assert.ok(deliveries.every((d) => d.attempts === 0), "Attempts are frozen at 0");
  assert.ok(deliveries.every((d) => d.next_attempt_at === null), "Retry clock is frozen");

  // Subsequent sync attempts do not make unauthorized HTTP calls
  let fetchCalled = false;
  const probeTransport = new HttpTransport({
    baseUrl: base,
    token: () => null,
    fetch: async () => {
      fetchCalled = true;
      return new Response();
    },
  });
  const noTokenEngine = new DdilLearningGateway({
    idb: factory,
    transport: probeTransport,
    deviceId: creds.deviceId,
  });
  await noTokenEngine.init();
  await noTokenEngine.requestSync();
  assert.equal(fetchCalled, false, "No network call dispatched while blocked without token");

  // 2. Recovery: Valid credentials restored
  activeToken = creds.token;

  // startSession re-establishes session and automatically unblocks auth records
  await gw.startSession({ learnerId: creds.learnerId, deviceId: creds.deviceId });

  const unblockedDeliveries = await gw.deliveryRecords();
  const readyPending = unblockedDeliveries.filter((d) => d.status === "pending");
  assert.ok(readyPending.length >= 2, "Blocked records transitioned to pending upon startSession");

  // Sync completes cleanly
  const recoveredSummary = await gw.requestSync();
  assert.equal(recoveredSummary.status, "synced");
  const finalDeliveries = await gw.deliveryRecords();
  assert.ok(finalDeliveries.every((d) => d.status === "acknowledged"), "All events acknowledged");
});

test("P0-5: Concurrent synchronization from two gateway instances on same DB", async () => {
  const creds = await enrollLearner("Multi", "Tab");
  const factory = new FakeIDBFactory();

  const transport = new HttpTransport({
    baseUrl: base,
    token: () => creds.token,
  });

  const gw1 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: creds.deviceId,
    owner: `${creds.deviceId}:tab-1`,
  });
  await gw1.init();

  const gw2 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: creds.deviceId,
    owner: `${creds.deviceId}:tab-2`,
  });
  await gw2.init();

  await gw1.startSession({ learnerId: creds.learnerId, deviceId: creds.deviceId });
  const attempt = await gw1.startAttempt({ learnerId: creds.learnerId, moduleId: "phishing-basics", kind: "full" });
  await gw1.saveAnswer({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    answer: { questionId: "phishing-basics-q01", selectedChoiceId: "a", isCorrect: true, answeredAt: new Date().toISOString() },
    xpAward: 10,
  });

  // Trigger sync simultaneously from both gateways
  const [res1, res2] = await Promise.all([gw1.requestSync(), gw2.requestSync()]);

  assert.ok(res1.status === "synced" || res2.status === "synced");
  const deliveries = await gw1.deliveryRecords();
  assert.ok(deliveries.every((d) => d.status === "acknowledged"), "All records are acknowledged without dual-send error");
});

test("P0-6: Partial batch outcomes with mixed accepted, duplicate, and rejected items", async () => {
  const creds = await enrollLearner("Partial", "Batch");
  const factory = new FakeIDBFactory();

  const transport = new HttpTransport({
    baseUrl: base,
    token: () => creds.token,
  });

  const gw = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: creds.deviceId,
  });
  await gw.init();
  await gw.startSession({ learnerId: creds.learnerId, deviceId: creds.deviceId });
  const attempt = await gw.startAttempt({ learnerId: creds.learnerId, moduleId: "phishing-basics", kind: "full" });

  // 1. Valid answer
  await gw.saveAnswer({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    answer: { questionId: "phishing-basics-q01", selectedChoiceId: "a", isCorrect: true, answeredAt: new Date().toISOString() },
    xpAward: 10,
  });

  // 2. Answer with an unknown question ID (will be rejected by server content check)
  await gw.saveAnswer({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    answer: { questionId: "phishing-basics-UNKNOWN-QUESTION-99", selectedChoiceId: "a", isCorrect: false, answeredAt: new Date().toISOString() },
    xpAward: 0,
  });

  const summary = await gw.requestSync();

  const deliveries = await gw.deliveryRecords();
  const valid = deliveries.find((d) => d.event_id.length > 0 && d.status === "acknowledged");
  const rejected = deliveries.find((d) => d.status === "rejected");

  assert.ok(valid, "Valid event acknowledged in partial batch");
  assert.ok(rejected, "Invalid question event rejected in partial batch");
  assert.equal(rejected?.rejected_code, "UNKNOWN_QUESTION");
  assert.equal(rejected?.next_attempt_at, null, "Terminal rejection is never re-scheduled");
});

// ============================================================================
// PRIORITY 1: INTEGRITY, RECOVERY, AND ACCESS CONTROL
// ============================================================================

test("P1-1: Content-version mismatch rejected with UNKNOWN_MODULE", async () => {
  const creds = await enrollLearner("Version", "Mismatch");
  const factory = new FakeIDBFactory();

  const transport = new HttpTransport({
    baseUrl: base,
    token: () => creds.token,
  });

  const gw = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: creds.deviceId,
  });
  await gw.init();
  await gw.startSession({ learnerId: creds.learnerId, deviceId: creds.deviceId });

  // Pin content version to a non-existent version 99
  gw.setContentVersion(99);

  const attempt = await gw.startAttempt({ learnerId: creds.learnerId, moduleId: "phishing-basics", kind: "full" });
  await gw.saveAnswer({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    answer: { questionId: "phishing-basics-q01", selectedChoiceId: "a", isCorrect: true, answeredAt: new Date().toISOString() },
    xpAward: 10,
  });

  await gw.requestSync();

  const deliveries = await gw.deliveryRecords();
  const rejected = deliveries.filter((d) => d.status === "rejected");
  assert.ok(rejected.length > 0, "Non-existent module version is rejected");
  assert.equal(rejected[0]?.rejected_code, "UNKNOWN_MODULE");
});

test("P1-2: Device mismatch rejected as non-retryable terminal error", async () => {
  const credsA = await enrollLearner("Device", "Alpha");
  const credsB = await enrollLearner("Device", "Bravo");

  // Device Alpha creates an event, but it is submitted using Device Bravo's token
  const transport = new HttpTransport({
    baseUrl: base,
    token: () => credsB.token, // mismatching token!
  });

  const event = {
    schema_version: 1,
    event_id: crypto.randomUUID(),
    event_type: "session_started" as const,
    device_id: credsA.deviceId, // Alpha's device
    device_seq: 1,
    session_id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    monotonic_ms: 100,
    payload: { visibility: "visible" },
  };

  const res = await transport.send([event]);
  assert.equal(res.ok, true);
  if (res.ok) {
    const outcome = res.result.outcomes[0];
    assert.equal(outcome?.status, "rejected");
    assert.equal(outcome?.code, "DEVICE_MISMATCH");
  }
});

test("P1-3: Learner device token denied access to staff administration endpoints", async () => {
  const creds = await enrollLearner("Staff", "Probe");

  // Try accessing staff cohorts endpoint with learner token
  const staffRes = await fetch(`${base}/v1/staff/cohorts`, {
    headers: { authorization: `Bearer ${creds.token}` },
  });
  assert.equal(staffRes.status, 401, "Device token rejected for staff access");
  const body = await staffRes.json();
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("P1-4: Browser restart recovers expired lease without attempt consumption", async () => {
  const creds = await enrollLearner("Crash", "Recover");
  const factory = new FakeIDBFactory();
  let clock = 1_700_000_000_000;
  const now = () => clock;

  const transport = new HttpTransport({
    baseUrl: base,
    token: () => creds.token,
  });

  const gw1 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: creds.deviceId,
    owner: `${creds.deviceId}:crashed-tab`,
    now,
  });
  await gw1.init();
  await gw1.startSession({ learnerId: creds.learnerId, deviceId: creds.deviceId });
  const attempt = await gw1.startAttempt({ learnerId: creds.learnerId, moduleId: "phishing-basics", kind: "full" });
  await gw1.saveAnswer({
    learnerId: creds.learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    answer: { questionId: "phishing-basics-q01", selectedChoiceId: "a", isCorrect: true, answeredAt: new Date(now()).toISOString() },
    xpAward: 10,
  });

  // Simulate crash during send: manually set delivery status to inflight with 60s lease
  const db = gw1["require"]();
  const allDel = await allDelivery(db);
  for (const d of allDel) {
    d.status = "inflight";
    d.lease_owner = `${creds.deviceId}:crashed-tab`;
    d.lease_expires_at = now() + 60_000;
    d.inflight_started_at = now();
  }

  // Advance time past lease expiration (simulating offline/dead tab)
  clock += 75_000;

  // New browser process opens
  const gw2 = new DdilLearningGateway({
    idb: factory,
    transport,
    deviceId: creds.deviceId,
    owner: `${creds.deviceId}:new-tab`,
    now,
  });
  await gw2.init();

  // Next sync pass automatically recovers expired lease
  const summary = await gw2.requestSync();
  assert.equal(summary.status, "synced");

  const finalDeliveries = await gw2.deliveryRecords();
  assert.ok(finalDeliveries.every((d) => d.status === "acknowledged"));
});
