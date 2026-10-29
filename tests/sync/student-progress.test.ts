import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import { FakeTransport } from "./fakes/fake-transport.ts";
import { DdilLearningGateway } from "../../src/sync/gateway/ddil-gateway.ts";
import type { TetherlessModule } from "../../src/sync/gateway/contract.ts";

function module(version: number, ids: string[]): TetherlessModule {
  return {
    schema_version: "tetherless.module.v1", module_id: "review-module", content_version: version,
    level: "beginner", title: { en: "Review module" },
    settings: { question_count: ids.length, timer_seconds: null, show_immediate_feedback: true, allow_retry: true, spanish_assist_default: false },
    questions: ids.map(id => ({ id, topic: "review", type: "multiple_choice", presentation: "kahoot_cards", prompt: { en: id }, choices: [{ id: "a", en: "Correct" }, { id: "b", en: "Wrong" }], correct_choice: "a", feedback: { en: "Explanation" } })),
  };
}

async function createGateway() {
  let clock = Date.parse("2026-10-29T12:00:00Z");
  const now = () => clock++;
  const versions = new Map([[1, module(1, ["old-q1", "old-q2"])], [2, module(2, ["new-q1"])]]);
  const gw = new DdilLearningGateway({ idb: new FakeIDBFactory(), transport: new FakeTransport(now), now,
    api: { get: async path => versions.get(Number(path.split("/").at(-1))), post: async () => { throw new Error("unused"); } },
  });
  await gw.init();
  return gw;
}

async function finish(gw: DdilLearningGateway, version: number, ids: string[]) {
  const attempt = await gw.startAttempt({ learnerId: "student", moduleId: "review-module", contentVersion: version, kind: "full" });
  for (const questionId of ids) await gw.saveAnswer({ learnerId: "student", moduleId: "review-module", attemptId: attempt.id,
    answer: { questionId, selectedChoiceId: "a", isCorrect: true, answeredAt: new Date().toISOString() }, xpAward: 0 });
  await gw.completeAttempt({ learnerId: "student", moduleId: "review-module", attemptId: attempt.id, questionsTotal: ids.length, correctQuestionIds: ids });
}

test("restarting an incomplete first attempt still exposes the first completed score", async () => {
  const gw = await createGateway();
  const abandoned = await gw.startAttempt({ learnerId: "student", moduleId: "review-module", contentVersion: 1, kind: "full" });
  await gw.abandonAttempt({ attemptId: abandoned.id, moduleId: "review-module", reason: "restart" });
  await finish(gw, 1, ["old-q1", "old-q2"]);
  const record = await gw.getLearnerModuleRecord("student", "review-module");
  assert.equal(record?.initialScorePercent, 100, "initial score belongs to the first COMPLETED full attempt");
  assert.ok(record?.firstCompletedAt, "results screen needs completion time to show the completed result");
  assert.equal(record?.attempts[0]?.status, "abandoned");
  assert.equal(record?.attempts[1]?.contentVersion, 1);
});

test("retired questions cannot make mastery exceed 100 percent after a version change", async () => {
  const gw = await createGateway();
  await finish(gw, 1, ["old-q1", "old-q2"]);
  await finish(gw, 2, ["new-q1"]);
  const record = await gw.getLearnerModuleRecord("student", "review-module");
  assert.equal(record?.currentMasteryPercent, 100, "mastery must use the current module question set");
  assert.equal(record?.questionsAnswered, 1);
  assert.deepEqual(record?.masteredQuestionIds, ["new-q1"]);
  assert.equal(record?.attempts[0]?.answers.length, 2, "retired answers remain in attempt history");
  assert.equal(record?.attempts[0]?.contentVersion, 1);
  assert.equal(record?.attempts[1]?.contentVersion, 2);
});

test("an implicit restart preserves history and uses the completed attempt's misses", async () => {
  const gw = await createGateway();
  const first = await gw.startAttempt({ learnerId: "student", moduleId: "review-module", contentVersion: 1, kind: "full" });
  await gw.saveAnswer({ learnerId: "student", moduleId: "review-module", attemptId: first.id,
    answer: { questionId: "old-q1", selectedChoiceId: "a", isCorrect: true, answeredAt: new Date().toISOString() }, xpAward: 0 });
  const second = await gw.startAttempt({ learnerId: "student", moduleId: "review-module", contentVersion: 1, kind: "full" });
  for (const questionId of ["old-q1", "old-q2"]) await gw.saveAnswer({ learnerId: "student", moduleId: "review-module", attemptId: second.id,
    answer: { questionId, selectedChoiceId: questionId === "old-q1" ? "b" : "a", isCorrect: questionId !== "old-q1", answeredAt: new Date().toISOString() }, xpAward: 0 });
  await gw.completeAttempt({ learnerId: "student", moduleId: "review-module", attemptId: second.id, questionsTotal: 2, correctQuestionIds: ["old-q2"] });
  const record = await gw.getLearnerModuleRecord("student", "review-module");
  assert.equal(record?.initialScorePercent, 50);
  assert.deepEqual(record?.initialMissedQuestionIds, ["old-q1"]);
  assert.equal(record?.attempts[0]?.status, "abandoned");
  assert.equal(record?.attempts[0]?.answers.length, 1);
});

test("a completion with unanswered questions does not establish an initial score", async () => {
  const gw = await createGateway();
  const attempt = await gw.startAttempt({ learnerId: "student", moduleId: "review-module", contentVersion: 1, kind: "full" });
  await gw.completeAttempt({ learnerId: "student", moduleId: "review-module", attemptId: attempt.id, questionsTotal: 2, correctQuestionIds: ["old-q1", "old-q2"] });
  const record = await gw.getLearnerModuleRecord("student", "review-module");
  assert.equal(record?.initialScorePercent, undefined);
  assert.equal(record?.firstCompletedAt, undefined);
  assert.equal(record?.completionStatus, "in_progress");
});

test("the first answer per question counts even if a save is duplicated", async () => {
  const gw = await createGateway();
  const attempt = await gw.startAttempt({ learnerId: "student", moduleId: "review-module", contentVersion: 1, kind: "full" });
  for (const [questionId, isCorrect] of [["old-q1", false], ["old-q1", true], ["old-q2", true]] as const) {
    await gw.saveAnswer({ learnerId: "student", moduleId: "review-module", attemptId: attempt.id,
      answer: { questionId, selectedChoiceId: isCorrect ? "a" : "b", isCorrect, answeredAt: new Date().toISOString() }, xpAward: 0 });
  }
  await gw.completeAttempt({ learnerId: "student", moduleId: "review-module", attemptId: attempt.id, questionsTotal: 2, correctQuestionIds: ["old-q1", "old-q2"] });
  const record = await gw.getLearnerModuleRecord("student", "review-module");
  assert.equal(record?.attempts[0]?.answers.length, 2);
  assert.equal(record?.initialScorePercent, 50);
  assert.deepEqual(record?.initialMissedQuestionIds, ["old-q1"]);
});
