/**
 * Live round-trip against Marc's real API server (spec v1.10).
 *
 * This is the test the fake transport cannot give us: a real HTTP request to
 * a real server, with the real strict schema, proving that:
 *
 *   1. our adapter's wire shape is accepted (no INVALID_EVENT)
 *   2. a duplicate delivery comes back as success, not an error
 *   3. the server's own receipt timestamp comes back
 *
 * Not part of the unit suite — it needs a running server. Run it with:
 *
 *   BASE=http://127.0.0.1:8099 \
 *   SETUP_CODE=XXXX-XXXX-XXXX \
 *   node --test tests/integration/live-sync.test.ts
 *
 * Skips cleanly when BASE is unset, so `node --test "tests/sync/*.test.ts"`
 * stays hermetic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { FakeIDBFactory } from "../sync/fakes/fake-idb.ts";
import { DdilLearningGateway } from "../../src/sync/gateway/ddil-gateway.ts";
import { HttpTransport } from "../../src/sync/transport/http-transport.ts";

const BASE = process.env.BASE;
/** Setup codes are single-use, so pass a comma-separated pool: SETUP_CODE=a,b,c */
const SETUP_CODES = (process.env.SETUP_CODE ?? "").split(",").map((c) => c.trim()).filter(Boolean);
let nextCode = 0;
const skip = !BASE || SETUP_CODES.length === 0 ? "set BASE and SETUP_CODE to run the live round-trip" : false;

async function setup(): Promise<{ token: string; learnerId: string; deviceId: string }> {
  const deviceId = crypto.randomUUID();
  const res = await fetch(`${BASE}/v1/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup_code: SETUP_CODES[nextCode++ % SETUP_CODES.length], username: `live${Date.now() % 100000}`, device_id: deviceId }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, `setup failed: ${JSON.stringify(body)}`);
  return { token: body.device_token, learnerId: body.learner.learner_id, deviceId };
}

test("live: the adapter's events are accepted by the real strict schema", { skip }, async () => {
  const { token, learnerId, deviceId } = await setup();

  const transport = new HttpTransport({ baseUrl: BASE!, token: () => token });
  const gw = new DdilLearningGateway({
    idb: new FakeIDBFactory(),
    transport,
    deviceId,
    owner: `${deviceId}:test`,
  });
  await gw.init();

  await gw.startSession({ learnerId, deviceId });
  const attempt = await gw.startAttempt({ learnerId, moduleId: "phishing-basics", kind: "full" });
  await gw.saveAnswer({
    learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    answer: { questionId: "phishing-basics-q01", selectedChoiceId: "a", isCorrect: true, answeredAt: new Date().toISOString() },
    xpAward: 10,
  });
  await gw.completeAttempt({
    learnerId,
    moduleId: "phishing-basics",
    attemptId: attempt.id,
    questionsTotal: 15,
    correctQuestionIds: ["phishing-basics-q01", "phishing-basics-q02", "phishing-basics-q03"],
  });

  const summary = await gw.requestSync();

  // The whole point: nothing was rejected as INVALID_EVENT.
  const records = await gw.deliveryRecords();
  const rejected = records.filter((r) => r.status === "rejected");
  // Report which event type and code was refused, so a failure names the field.
  const rejectedDetail = await Promise.all(
    rejected.map(async (r) => {
      const e = await gw.getEventById(r.event_id);
      return `${e?.event_type}: ${r.last_error ?? r.rejected_code}`;
    }),
  );
  assert.deepEqual(rejectedDetail, [], "no event may be rejected");
  assert.equal(summary.status, "synced", `expected synced, got ${summary.status}: ${summary.failureReason ?? ""}`);
  assert.ok(summary.lastSyncedAt, "the server receipt timestamp must come back");
});

test("live: duplicate delivery returns success and creates one record", { skip }, async () => {
  const { token, learnerId, deviceId } = await setup();

  const transport = new HttpTransport({ baseUrl: BASE!, token: () => token });
  const gw = new DdilLearningGateway({
    idb: new FakeIDBFactory(),
    transport,
    deviceId,
    owner: `${deviceId}:test`,
  });
  await gw.init();
  await gw.startSession({ learnerId, deviceId });

  // Send once.
  await gw.requestSync();
  const afterFirst = await gw.deliveryRecords();
  assert.ok(afterFirst.every((r) => r.status === "acknowledged"));

  // Now replay the exact same events by hand, as a retry storm would.
  const events = await Promise.all(afterFirst.map((r) => gw.getEventById(r.event_id)));
  const res = await fetch(`${BASE}/v1/sync/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ schema_version: 1, events }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  for (const r of body.results) {
    assert.equal(
      r.status,
      "duplicate",
      `a replay must return duplicate (success), got ${r.status} ${r.code ?? ""}`,
    );
  }
});

test("live: an unknown payload field is rejected, proving the schema is strict", { skip }, async () => {
  const { token, deviceId } = await setup();

  // The exact bug the field rename fixed: questions_total instead of local_total.
  const res = await fetch(`${BASE}/v1/sync/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      schema_version: 1,
      events: [
        {
          event_id: crypto.randomUUID(),
          schema_version: 1,
          event_type: "attempt_completed",
          device_id: deviceId,
          device_seq: 1,
          session_id: crypto.randomUUID(),
          occurred_at: new Date().toISOString(),
          monotonic_ms: 1000,
          module_id: "phishing-basics",
          content_version: 1,
          attempt_id: crypto.randomUUID(),
          payload: { questions_total: 15, correct_question_ids: ["phishing-basics-q01"] },
        },
      ],
    }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.results[0].status, "rejected");
  assert.equal(body.results[0].code, "INVALID_EVENT", "unknown fields must be rejected, not ignored");
});
