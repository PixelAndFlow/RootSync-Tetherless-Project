/**
 * A session with no session_ended event is the normal case on a phone, not an error.
 *
 * The device cannot promise to deliver a final event: the learner can lose signal,
 * close the app or have the browser end it before a last sync. So the server must
 * work out a session from the events it actually received, using the last signal as
 * the end (sync-contract.md). These tests pin that behaviour, so a later change that
 * starts to depend on session_ended fails here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { StoredEvent, TetherlessEvent } from "../../contract/src/index.ts";
import { computeActiveTime } from "../src/index.ts";
import { LEARNERS, scenarioEvents } from "./fixtures/scenario.ts";

const all = scenarioEvents();
const stored = (events: TetherlessEvent[], learner: string): StoredEvent[] =>
  events.map((e) => ({ ...e, learner_id: learner, received_at: "2026-10-15T00:00:00.000Z" }) as StoredEvent);

// The phone sends a heartbeat every 15-30 s while visible, so the most a missing
// session_ended can cost is the time since the last heartbeat.
const MAX_TAIL_MS = 30_000;

for (const l of LEARNERS) {
  test(`${l.name}: dropping every session_ended keeps sessions and flags, and loses at most one heartbeat interval per session`, () => {
    const events = all[l.key]!;
    const withEnd = computeActiveTime(stored(events, l.key));
    const withoutEnd = computeActiveTime(stored(events.filter((e) => e.event_type !== "session_ended"), l.key));

    assert.equal(withoutEnd.sessions.length, withEnd.sessions.length, "the same sessions are found");
    assert.deepEqual(withoutEnd.flags, withEnd.flags, "no new or missing flags");

    const lostActive = withEnd.active_ms - withoutEnd.active_ms;
    assert.ok(lostActive >= 0, "a missing end never adds time");
    assert.ok(lostActive <= MAX_TAIL_MS * withEnd.sessions.length, `lost ${lostActive} ms of active time`);
  });
}

test("a session cut off mid-way (app killed) still produces a result with no error", () => {
  const learner = LEARNERS[0]!;
  const events = all[learner.key]!;
  // Keep only the first few events: the device was killed before it sent the rest.
  const cut = events.filter((e) => e.event_type !== "session_ended").slice(0, 5);
  const result = computeActiveTime(stored(cut, learner.key));
  assert.equal(result.sessions.length, 1);
  assert.ok(result.active_ms >= 0);
});
