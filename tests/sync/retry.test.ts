/**
 * Retry accounting.
 *
 * The rule under test: only a server that was REACHED consumes retry budget.
 * A phone offline for a week must still have a full budget when it reconnects.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  backoffMs,
  classifyStatus,
  reopenFailed,
  transition,
} from "../../src/sync/engine/retry.ts";
import type { DeliveryRecord } from "../../src/sync/types.ts";

const NOW = 1_700_000_000_000;

function pending(over: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    event_id: "evt-1",
    status: "pending",
    attempts: 0,
    next_attempt_at: NOW,
    last_error: null,
    lease_owner: null,
    lease_expires_at: null,
    inflight_started_at: null,
    rejected_code: null,
    settled_at: null,
    ...over,
  };
}

function inflight(over: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return pending({
    status: "inflight",
    lease_owner: "device-1:tab-1",
    lease_expires_at: NOW + 60_000,
    inflight_started_at: NOW,
    ...over,
  });
}

test("unreachable does NOT consume an attempt — the phone was offline", () => {
  const { record, shouldRetry } = transition({
    record: inflight(),
    response: "unreachable",
    now: NOW,
    backoff: { random: () => 0.5 },
  });

  assert.equal(record.status, "pending");
  assert.equal(record.attempts, 0, "an unreached server must spend no retry budget");
  assert.equal(shouldRetry, true);
  assert.ok(record.next_attempt_at !== null && record.next_attempt_at > NOW);
  assert.equal(record.lease_owner, null, "the lease is released");
});

test("a week offline leaves the retry budget untouched", () => {
  let record = pending();
  // 200 sync passes, every one failing to reach the server.
  for (let i = 0; i < 200; i += 1) {
    const t = transition({ record: inflight({ attempts: record.attempts }), response: "unreachable", now: NOW + i });
    record = t.record;
    assert.equal(record.status, "pending");
    assert.equal(t.shouldRetry, true);
  }
  assert.equal(record.attempts, 0, "200 unreachable attempts must still be zero consumed");
  assert.notEqual(record.status, "failed", "offline work must never be marked failed");
});

test("server_error consumes an attempt and backs off", () => {
  const t = transition({
    record: inflight(),
    response: "server_error",
    now: NOW,
    backoff: { random: () => 1 },
  });
  assert.equal(t.record.status, "pending");
  assert.equal(t.record.attempts, 1);
  assert.equal(t.shouldRetry, true);
});

test("server_error becomes failed only after the budget is exhausted", () => {
  const t = transition({
    record: inflight({ attempts: 7 }),
    response: "server_error",
    now: NOW,
    maxAttempts: 8,
  });
  assert.equal(t.record.status, "failed");
  assert.equal(t.record.attempts, 8);
  assert.equal(t.shouldRetry, false);
  assert.equal(t.record.next_attempt_at, null, "a settled event is not scheduled");
});

test("auth is a wait, not a failure — no attempt consumed", () => {
  const t = transition({ record: inflight({ attempts: 3 }), response: "auth", now: NOW });
  assert.equal(t.record.status, "blocked_auth");
  assert.equal(t.record.attempts, 3, "re-authenticating is not a retry");
  assert.equal(t.record.next_attempt_at, null, "no retry clock while waiting on a human");
  assert.equal(t.shouldRetry, false);
});

test("success settles the event", () => {
  const t = transition({ record: inflight(), response: "success", now: NOW });
  assert.equal(t.record.status, "acknowledged");
  assert.equal(t.record.next_attempt_at, null);
  assert.equal(t.record.settled_at, NOW);
});

test("terminal rejection settles and keeps the code", () => {
  const t = transition({
    record: inflight(),
    response: "terminal",
    now: NOW,
    code: "DEADLINE_PASSED",
    error: "past the deadline",
  });
  assert.equal(t.record.status, "rejected");
  assert.equal(t.record.rejected_code, "DEADLINE_PASSED");
  assert.equal(t.shouldRetry, false);
});

test("rate limiting honours Retry-After over the backoff curve", () => {
  const t = transition({
    record: inflight(),
    response: "rate_limited",
    now: NOW,
    retryAfterSec: 30,
    backoff: { random: () => 0 },
  });
  assert.equal(t.record.status, "pending");
  assert.equal(t.record.attempts, 1, "the server was reached and said no");
  assert.equal(t.record.next_attempt_at, NOW + 30_000);
});

test("reopenFailed gives a failed event one more chance and leaves rejected alone", () => {
  const failed = pending({ status: "failed", attempts: 8, next_attempt_at: null });
  const reopened = reopenFailed(failed, NOW);
  assert.equal(reopened.status, "pending");
  assert.equal(reopened.attempts, 0);
  assert.equal(reopened.next_attempt_at, NOW);

  const rejected = pending({ status: "rejected", rejected_code: "X" });
  assert.equal(reopenFailed(rejected, NOW).status, "rejected", "a refusal is final");
});

test("backoff is capped so an overnight outage does not become a day-long wait", () => {
  const ms = backoffMs(50, { maxMs: 15 * 60_000, random: () => 1 });
  assert.equal(ms, 15 * 60_000);
});

test("backoff is jittered, not a fixed curve", () => {
  const low = backoffMs(5, { random: () => 0 });
  const high = backoffMs(5, { random: () => 0.999 });
  assert.ok(high > low, "jitter must spread retries across a fleet");
});

test("classifyStatus maps the statuses the engine acts on", () => {
  assert.equal(classifyStatus(200), "success");
  assert.equal(classifyStatus(401), "auth");
  assert.equal(classifyStatus(403), "terminal");
  assert.equal(classifyStatus(422), "terminal");
  assert.equal(classifyStatus(429), "rate_limited");
  assert.equal(classifyStatus(500), "server_error");
  assert.equal(classifyStatus(503), "server_error");
});
