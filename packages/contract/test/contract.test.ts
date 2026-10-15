import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, eventIdOf, validateEvent, type TetherlessEvent } from "../src/index.ts";

const base = {
  event_id: "0b8a5d2e-1c3f-4a5b-9c7d-112233445566",
  schema_version: 1,
  device_id: "a1b2c3d4-0000-4000-8000-000000000001",
  device_seq: 7,
  occurred_at: "2026-10-15T14:00:00.000Z",
  session_id: "5e551011-0000-4000-8000-000000000001",
  monotonic_ms: 1234.5,
};
const attempt = { module_id: "phishing-basics", content_version: 1, attempt_id: "a7700000-0000-4000-8000-000000000001" };

const ok = (e: unknown) => {
  const r = validateEvent(e);
  assert.equal(r.ok, true, r.ok ? "" : r.error.message);
  return (r as { ok: true; event: TetherlessEvent }).event;
};
const bad = (e: unknown) => {
  const r = validateEvent(e);
  assert.equal(r.ok, false);
  return (r as { ok: false; error: { code: string; message: string } }).error;
};

test("valid events of every type pass", () => {
  ok({ ...base, event_type: "session_started", payload: { visibility: "visible", app_version: "0.1.0" } });
  ok({ ...base, event_type: "visibility_changed", payload: { state: "hidden" } });
  ok({ ...base, event_type: "heartbeat", payload: {} });
  ok({ ...base, event_type: "session_ended", payload: {} });
  ok({ ...base, ...attempt, event_type: "attempt_started", payload: { attempt_kind: "full" } });
  ok({ ...base, ...attempt, event_type: "attempt_started", payload: { attempt_kind: "boss", mission_id: "phishing-basics-boss-giveaway" } });
  ok({ ...base, ...attempt, event_type: "answer_submitted", question_id: "phishing-basics-q01", payload: { choice_id: "b", response_ms: 4200 } });
  ok({ ...base, ...attempt, event_type: "answer_submitted", question_id: "phishing-basics-q01", payload: { choice_id: null } });
  ok({ ...base, ...attempt, event_type: "attempt_completed", payload: {} });
  ok({ ...base, ...attempt, event_type: "attempt_abandoned", payload: { reason: "restart" } });
});

test("IDs are lower-cased so the same UUID always matches", () => {
  const e = ok({ ...base, event_id: base.event_id.toUpperCase(), event_type: "heartbeat", payload: {} });
  assert.equal(e.event_id, base.event_id);
});

test("learner identity, scores and correctness can't be sent", () => {
  assert.match(bad({ ...base, event_type: "heartbeat", learner_id: "x", payload: {} }).message, /learner_id/);
  assert.match(bad({ ...base, ...attempt, event_type: "answer_submitted", question_id: "q", payload: { choice_id: "a", correct: true } }).message, /correct/);
  assert.match(bad({ ...base, ...attempt, event_type: "attempt_completed", payload: { score: 100 } }).message, /score/);
});

test("required fields and formats are enforced", () => {
  assert.equal(bad({ ...base, event_type: "heartbeat", payload: {}, schema_version: 2 }).code, "UNSUPPORTED_SCHEMA_VERSION");
  assert.match(bad({ ...base, event_id: "123", event_type: "heartbeat", payload: {} }).message, /event_id/);
  assert.match(bad({ ...base, device_seq: 0, event_type: "heartbeat", payload: {} }).message, /device_seq/);
  assert.match(bad({ ...base, monotonic_ms: -1, event_type: "heartbeat", payload: {} }).message, /monotonic_ms/);
  assert.match(bad({ ...base, occurred_at: "yesterday", event_type: "heartbeat", payload: {} }).message, /occurred_at/);
  assert.match(bad({ ...base, event_type: "attempt_started", payload: { attempt_kind: "full" } }).message, /not allowed|module_id/);
  assert.match(bad({ ...base, ...attempt, event_type: "attempt_started", payload: { attempt_kind: "boss" } }).message, /mission_id/);
  assert.match(bad({ ...base, ...attempt, event_type: "answer_submitted", payload: { choice_id: "a" } }).message, /question_id/);
  assert.match(bad({ ...base, ...attempt, event_type: "attempt_abandoned", payload: { reason: "bored" } }).message, /reason/);
  assert.match(bad({ ...base, event_type: "teleported", payload: {} }).message, /event_type/);
});

test("eventIdOf reports usable IDs only", () => {
  assert.equal(eventIdOf({ event_id: base.event_id }), base.event_id);
  assert.equal(eventIdOf({ event_id: "nope" }), null);
  assert.equal(eventIdOf(null), null);
});

test("canonicalJson ignores key order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, 2], c: null } }), canonicalJson({ a: { c: null, d: [1, 2] }, b: 1 }));
});
