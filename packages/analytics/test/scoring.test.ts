import { test } from "node:test";
import assert from "node:assert/strict";
import type { StoredEvent, TetherlessEvent } from "../../contract/src/index.ts";
import { ContentLibrary, buildLearnerReport, scoreModule, computeActiveTime } from "../src/index.ts";
import { LEARNERS, scenarioEvents, SECURITY_V1, SECURITY_V2, PHISHING_V1 } from "./fixtures/scenario.ts";
import { EXPECTED } from "./fixtures/scenario.expected.ts";

const library = new ContentLibrary([SECURITY_V1, SECURITY_V2, PHISHING_V1]);
const stored = (events: TetherlessEvent[], learner: string): StoredEvent[] =>
  events.map((e) => ({ ...e, learner_id: learner, received_at: "2026-10-15T00:00:00.000Z" }) as StoredEvent);
const all = scenarioEvents();

for (const l of LEARNERS) {
  test(`fixed dataset: ${l.name} matches the hand-worked results`, () => {
    const exp = EXPECTED[l.key];
    const r = buildLearnerReport({ learner_id: l.key, name: l.name, username: l.username, cohort_id: "demo" }, stored(all[l.key]!, l.key), [], library);
    const m = r.modules.find((x) => x.module_id === "pr-bootcamp-security-tools")!;
    assert.deepEqual(m.initial, exp.initial);
    assert.deepEqual(m.best, exp.best);
    assert.deepEqual(m.latest, exp.latest);
    assert.deepEqual(m.first_try, exp.first_try);
    assert.deepEqual(m.mastery, exp.mastery);
    assert.equal(m.passed, exp.passed);
    assert.deepEqual(m.struggling_reasons, exp.struggling_reasons);
    assert.equal(m.struggling, exp.struggling_reasons.length > 0);
    assert.equal(m.abandoned_before_first_completion, exp.abandoned_before_first_completion);
    assert.equal(m.completion, exp.completion);
    assert.deepEqual(Object.fromEntries(m.topics.map((t) => [t.topic, [t.answers, t.correct]])), exp.topics);
    assert.equal(r.time.active_ms, exp.active_ms);
    assert.equal(r.time.elapsed_ms, exp.elapsed_ms);
    assert.deepEqual(r.time.flags.map((f) => f.kind), exp.flags);
    assert.equal(r.sync.seq_gaps.length, exp.seq_gaps);
    // A module the learner never touched.
    const p = r.modules.find((x) => x.module_id === "phishing-basics")!;
    assert.equal(p.completion, "not_started");
    assert.equal(p.mastery.correct, 0);
  });
}

test("Cara's missing events are reported as one gap of two", () => {
  const r = buildLearnerReport({ learner_id: "c", name: "", username: "", cohort_id: "" }, stored(all.cara!, "c"), [], library);
  assert.deepEqual(r.sync.seq_gaps.map((g) => [g.after_seq, g.before_seq, g.missing]), [[6, 9, 2]]);
});

test("event order comes from device_seq, not the phone clock", () => {
  const events = stored(all.ana!, "a");
  const skewed = events.map((e, i) => ({ ...e, occurred_at: new Date(Date.parse("2030-01-01") - i * 1000).toISOString() }));
  const m = scoreModule("pr-bootcamp-security-tools", [...skewed].reverse(), library);
  assert.deepEqual(m.initial, EXPECTED.ana.initial);
  assert.deepEqual(m.latest, EXPECTED.ana.latest);
});

test("an answer-key correction in a later version re-scores old answers", () => {
  // v3 changes q02's correct answer to the choice Ana picked wrongly in attempt 1.
  const v3 = structuredClone(SECURITY_V2);
  v3.content_version = 3;
  const q02 = v3.questions.find((q) => q.question_id.endsWith("q02"))!;
  const anaPick = (all.ana!.find((e) => e.event_type === "answer_submitted" && e.question_id === q02.question_id) as { payload: { choice_id: string } }).payload.choice_id;
  q02.correct_choice_id = anaPick;
  const lib3 = new ContentLibrary([SECURITY_V1, SECURITY_V2, v3]);
  const m = scoreModule("pr-bootcamp-security-tools", stored(all.ana!, "a"), lib3);
  assert.deepEqual(m.initial, { correct: 13, total: 15, pct: 86.7 }); // q02 now right in attempt 1
  assert.deepEqual(m.latest, { correct: 14, total: 15, pct: 93.3 }); // ...and now wrong in attempt 2
  // Raw answers are untouched.
  assert.equal(m.attempts[0]!.answers[1]!.choice_id, anaPick);
});

test("an unfinished full attempt followed by a new one counts as abandoned", () => {
  const events = stored(all.ben!, "b").filter((e) => e.event_type !== "attempt_abandoned");
  const m = scoreModule("pr-bootcamp-security-tools", events, library);
  assert.equal(m.abandoned_before_first_completion, 1);
  assert.equal(m.attempts[0]!.status, "abandoned");
  assert.equal(m.attempts[0]!.answers.length, 3, "answers from the abandoned attempt are kept for trainers");
});

test("a full attempt marked complete with unanswered questions doesn't count", () => {
  const events = stored(all.ana!, "a").filter((e) => !(e.event_type === "answer_submitted" && e.question_id.endsWith("q15") && e.monotonic_ms < 900_000));
  const m = scoreModule("pr-bootcamp-security-tools", events, library);
  assert.deepEqual(m.initial, EXPECTED.ana.latest, "attempt 2 becomes the first completed attempt");
});

test("pass and struggling thresholds are settings", () => {
  const strict = { pass_pct: 85, struggling_pct: 90, weak_topic_pct: 60, weak_topic_min_answers: 2 };
  const m = scoreModule("pr-bootcamp-security-tools", stored(all.ana!, "a"), library, strict);
  assert.equal(m.passed, true); // best is 100
  assert.deepEqual(m.struggling_reasons, ["initial_below_threshold"]); // 80 < 90
});

test("idle time beyond the limit is not counted and is flagged", () => {
  const sid = "5e551011-0000-4000-8000-0000000000aa";
  const dev = "de71ce00-0000-4000-8000-0000000000aa";
  let seq = 0;
  const ev = (type: string, t: number, payload: Record<string, unknown> = {}) =>
    ({ event_id: `e0000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, schema_version: 1, event_type: type, device_id: dev, device_seq: seq, occurred_at: "2026-10-15T00:00:00Z", session_id: sid, monotonic_ms: t * 1000, payload, learner_id: "x", received_at: "" }) as unknown as StoredEvent;
  // Interaction at 0, then heartbeats every 30 s for 10 minutes with no interaction.
  const events = [ev("session_started", 0, { visibility: "visible" })];
  for (let t = 30; t <= 600; t += 30) events.push(ev("heartbeat", t));
  const r = computeActiveTime(events, { idleLimitMs: 120_000, maxSilenceMs: 90_000 });
  assert.equal(r.active_ms, 120_000);
  assert.equal(r.elapsed_ms, 600_000);
  assert.deepEqual(r.flags.map((f) => [f.kind, f.at_ms, f.gap_ms]), [["idle", 120_000, 480_000]]);
});
