import { describe, expect, it } from "vitest";
import { MockOfflineLearningGateway } from "./MockOfflineLearningGateway";

describe("MockOfflineLearningGateway", () => {
  it("keeps the first attempt score after remediation and a full retry", async () => {
    const gateway = new MockOfflineLearningGateway();
    const attempt = await gateway.startAttempt({ learnerId: "learner-1", moduleId: "module-1", kind: "full" });
    await gateway.completeAttempt({ learnerId: "learner-1", moduleId: "module-1", attemptId: attempt.id, questionsTotal: 3, correctQuestionIds: ["question-1", "question-2"] });
    const remediation = await gateway.startRemediation({ learnerId: "learner-1", moduleId: "module-1", questionIds: ["question-3"] });
    await gateway.completeAttempt({ learnerId: "learner-1", moduleId: "module-1", attemptId: remediation.id, questionsTotal: 3, correctQuestionIds: ["question-3"] });
    const retry = await gateway.startAttempt({ learnerId: "learner-1", moduleId: "module-1", kind: "full" });
    await gateway.completeAttempt({ learnerId: "learner-1", moduleId: "module-1", attemptId: retry.id, questionsTotal: 3, correctQuestionIds: ["question-1", "question-2", "question-3"] });
    const record = await gateway.getLearnerModuleRecord("learner-1", "module-1");
    expect(record?.initialScorePercent).toBe(66.7);
    expect(record?.attempts).toHaveLength(3);
    expect(record?.currentMasteryPercent).toBe(100);
  });

  it("awards one-time engagement XP and sector/mission rewards without changing score", async () => {
    const gateway = new MockOfflineLearningGateway();
    const attempt = await gateway.startAttempt({ learnerId: "learner-2", moduleId: "module-2", kind: "full" });
    await gateway.saveAnswer({ learnerId: "learner-2", moduleId: "module-2", attemptId: attempt.id, xpAward: 100, answer: { questionId: "question-1", selectedChoiceId: "A", isCorrect: true, answeredAt: "2026-10-09T00:00:00.000Z" } });
    await gateway.saveAnswer({ learnerId: "learner-2", moduleId: "module-2", attemptId: attempt.id, xpAward: 100, answer: { questionId: "question-1", selectedChoiceId: "A", isCorrect: true, answeredAt: "2026-10-09T00:00:01.000Z" } });
    await gateway.saveAnswer({ learnerId: "learner-2", moduleId: "module-2", attemptId: attempt.id, xpAward: 100, answer: { questionId: "question-2", selectedChoiceId: "B", isCorrect: true, answeredAt: "2026-10-09T00:00:02.000Z" } });
    await gateway.completeAttempt({ learnerId: "learner-2", moduleId: "module-2", attemptId: attempt.id, questionsTotal: 2, correctQuestionIds: ["question-1", "question-2"], sectorMasteryAwards: [{ sectorId: "sector-1", questionIds: ["question-1", "question-2"], bonusXp: 50 }], missionMasteryAward: { badgeId: "recruit", bonusXp: 250 } });
    const record = await gateway.getLearnerModuleRecord("learner-2", "module-2");
    expect(record?.initialScorePercent).toBe(100);
    expect(record?.engagement.xp).toBe(500);
    expect(record?.engagement.bestStreak).toBe(2);
    expect(record?.engagement.earnedBadgeIds).toEqual(["recruit"]);
  });

  it("publishes syncing and synced states for a manual sync", async () => {
    const gateway = new MockOfflineLearningGateway();
    const statuses: string[] = [];
    const unsubscribe = gateway.subscribeToSyncStatus((summary) => statuses.push(summary.status));
    await gateway.requestSync();
    unsubscribe();
    expect(statuses).toEqual(["synced", "syncing", "synced"]);
  });
});
