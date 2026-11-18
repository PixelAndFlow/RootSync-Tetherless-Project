import { expect, it } from "vitest";
import { DdilLearningGateway } from "./ddil-gateway";
import { FakeIDBFactory } from "../../../tests/sync/fakes/fake-idb";
import { FakeTransport } from "../../../tests/sync/fakes/fake-transport";

const moduleId = "results-module";
const contentVersion = 1;
const module = {
  module_id: moduleId,
  content_version: contentVersion,
  title: { en: "Results module" },
  level: "beginner",
  activity_type: "multiple_choice",
  questions: [
    { id: "q1", topic: "basics", prompt: { en: "Q1" }, choices: [{ id: "a", text: { en: "A" } }, { id: "b", text: { en: "B" } }], correct_choice: "a" },
    { id: "q2", topic: "basics", prompt: { en: "Q2" }, choices: [{ id: "a", text: { en: "A" } }, { id: "b", text: { en: "B" } }], correct_choice: "b" },
  ],
};

function makeGateway() {
  return new DdilLearningGateway({
    idb: new FakeIDBFactory(),
    transport: new FakeTransport(Date.now),
    api: {
      get: async (path: string) => {
        if (path === "/v1/me/modules") return { modules: [{ module_id: moduleId, content_version: contentVersion, title: module.title, level: module.level, activity_type: module.activity_type }] };
        return module;
      },
      post: async () => { throw new Error("unused"); },
    },
  });
}

async function completeFullAttempt(gateway: DdilLearningGateway, learnerId: string) {
  const attempt = await gateway.startAttempt({ learnerId, moduleId, contentVersion, kind: "full" });
  for (const [index, question] of module.questions.entries()) {
    await gateway.saveAnswer({
      learnerId, moduleId, attemptId: attempt.id,
      answer: { questionId: question.id, selectedChoiceId: question.correct_choice, isCorrect: true, answeredAt: new Date().toISOString() },
      xpAward: 0,
    });
    void index;
  }
  await gateway.completeAttempt({ learnerId, moduleId, attemptId: attempt.id, questionsTotal: module.questions.length, correctQuestionIds: module.questions.map((q) => q.id) });
  return attempt.id;
}

it("a finished mission immediately produces a debrief-ready record, in the same session", async () => {
  const gateway = makeGateway();
  await gateway.init();
  await completeFullAttempt(gateway, "learner-1");

  const record = await gateway.getLearnerModuleRecord("learner-1", moduleId);
  expect(record?.firstCompletedAt).toBeTruthy();
  const full = record?.attempts.find((a) => a.kind === "full");
  expect(full?.status).toBe("completed");
});

it("a finished mission still produces a debrief-ready record after the app is reopened", async () => {
  const idb = new FakeIDBFactory();
  const api = {
    get: async (path: string) => (path === "/v1/me/modules" ? { modules: [{ module_id: moduleId, content_version: contentVersion, title: module.title, level: module.level, activity_type: module.activity_type }] } : module),
    post: async () => { throw new Error("unused"); },
  };
  const first = new DdilLearningGateway({ idb, transport: new FakeTransport(Date.now), api });
  await first.init();
  await completeFullAttempt(first, "learner-1");

  const reopened = new DdilLearningGateway({ idb, transport: new FakeTransport(Date.now), api });
  await reopened.init();
  const record = await reopened.getLearnerModuleRecord("learner-1", moduleId);
  expect(record?.firstCompletedAt).toBeTruthy();
  const full = record?.attempts.find((a) => a.kind === "full");
  expect(full?.status).toBe("completed");
});

it("a finished mission still produces a debrief-ready record even when the module's own re-fetch fails", async () => {
  // Simulates the historical-version re-fetch inside deriveModuleState throwing
  // (e.g. a transient network error) after the module was already played —
  // the local record should still resolve as completed from local_total, not
  // get stuck looking like an unfinished attempt.
  let blockModuleFetch = false;
  const idb = new FakeIDBFactory();
  const api = {
    get: async (path: string) => {
      if (path === "/v1/me/modules") return { modules: [{ module_id: moduleId, content_version: contentVersion, title: module.title, level: module.level, activity_type: module.activity_type }] };
      if (blockModuleFetch) throw new Error("network unavailable");
      return module;
    },
    post: async () => { throw new Error("unused"); },
  };
  const gateway = new DdilLearningGateway({ idb, transport: new FakeTransport(Date.now), api });
  await gateway.init();
  await completeFullAttempt(gateway, "learner-1");

  // Force deriveModuleState's own re-fetch of the attempt's module version to
  // fail by reopening with a fresh IDB (so the module cache is gone) while the
  // event history (shared idb) is retained.
  blockModuleFetch = true;
  const reopened = new DdilLearningGateway({ idb, transport: new FakeTransport(Date.now), api });
  await reopened.init();
  const record = await reopened.getLearnerModuleRecord("learner-1", moduleId);
  expect(record?.firstCompletedAt).toBeTruthy();
  const full = record?.attempts.find((a) => a.kind === "full");
  expect(full?.status).toBe("completed");
});
