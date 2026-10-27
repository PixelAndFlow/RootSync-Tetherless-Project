import { describe, expect, it } from "vitest";
import { MockOfflineLearningGateway } from "./MockOfflineLearningGateway";

describe("MockOfflineLearningGateway", () => {
  it("keeps the first attempt score after remediation and a full retry", async () => {
    const gateway = new MockOfflineLearningGateway();
    const attempt = await gateway.startAttempt({ learnerId: "learner-1", moduleId: "module-1", contentVersion: 1, kind: "full" });
    await gateway.completeAttempt({ learnerId: "learner-1", moduleId: "module-1", attemptId: attempt.id, questionsTotal: 3, correctQuestionIds: ["question-1", "question-2"] });
    const remediation = await gateway.startRemediation({ learnerId: "learner-1", moduleId: "module-1", contentVersion: 1, questionIds: ["question-3"] });
    await gateway.completeAttempt({ learnerId: "learner-1", moduleId: "module-1", attemptId: remediation.id, questionsTotal: 3, correctQuestionIds: ["question-3"] });
    const retry = await gateway.startAttempt({ learnerId: "learner-1", moduleId: "module-1", contentVersion: 1, kind: "full" });
    await gateway.completeAttempt({ learnerId: "learner-1", moduleId: "module-1", attemptId: retry.id, questionsTotal: 3, correctQuestionIds: ["question-1", "question-2", "question-3"] });
    const record = await gateway.getLearnerModuleRecord("learner-1", "module-1");
    expect(record?.initialScorePercent).toBe(66.7);
    expect(record?.attempts).toHaveLength(3);
    expect(record?.currentMasteryPercent).toBe(100);
  });

  it("awards one-time engagement XP and sector/mission rewards without changing score", async () => {
    const gateway = new MockOfflineLearningGateway();
    const attempt = await gateway.startAttempt({ learnerId: "learner-2", moduleId: "module-2", contentVersion: 1, kind: "full" });
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

  it("publishes pending, syncing, and synced states for a manual sync", async () => {
    const gateway = new MockOfflineLearningGateway();
    const statuses: string[] = [];
    const unsubscribe = gateway.subscribeToSyncStatus((summary) => statuses.push(summary.status));
    await gateway.startSession({ learnerId: "learner-1", deviceId: "device-1" });
    await gateway.requestSync();
    unsubscribe();
    expect(statuses).toEqual(["synced", "pending", "syncing", "synced"]);
  });

  it("keeps queued events available when a sync needs retrying", async () => {
    const gateway = new MockOfflineLearningGateway();
    await gateway.startSession({ learnerId: "learner-3", deviceId: "device-3" });
    gateway.simulateNextSyncFailure("No connection");
    const summary = await gateway.requestSync();
    expect(summary.status).toBe("retryable_error");
    expect(summary.pendingEventCount).toBe(1);
    expect(summary.failureReason).toBe("No connection");
  });

  it("fails one requested answer save without changing the learning record", async () => {
    const gateway = new MockOfflineLearningGateway();
    const attempt = await gateway.startAttempt({ learnerId: "learner-save-failure", moduleId: "module-save-failure", contentVersion: 1, kind: "full" });
    gateway.simulateNextSaveFailure("Storage is temporarily unavailable");

    await expect(gateway.saveAnswer({ learnerId: "learner-save-failure", moduleId: "module-save-failure", attemptId: attempt.id, xpAward: 10, answer: { questionId: "question-1", selectedChoiceId: "A", isCorrect: true, answeredAt: "2026-10-11T00:00:00.000Z" } })).rejects.toThrow("Storage is temporarily unavailable");

    const record = await gateway.getLearnerModuleRecord("learner-save-failure", "module-save-failure");
    expect(record?.attempts[0].answers).toEqual([]);
  });

  it("keeps queued events protected when a sync is rejected for review", async () => {
    const gateway = new MockOfflineLearningGateway();
    await gateway.startSession({ learnerId: "learner-rejected", deviceId: "device-rejected" });
    gateway.simulateNextSyncRejection("Content version needs review");
    const summary = await gateway.requestSync();
    expect(summary).toMatchObject({ status: "rejected", pendingEventCount: 1, failureReason: "Content version needs review" });
  });

  it("keeps learner/module records isolated and rejects unknown attempts", async () => {
    const gateway = new MockOfflineLearningGateway();
    const attempt = await gateway.startAttempt({ learnerId: "learner-a", moduleId: "module-a", contentVersion: 1, kind: "full" });
    await gateway.saveAnswer({ learnerId: "learner-a", moduleId: "module-a", attemptId: attempt.id, xpAward: 10, answer: { questionId: "question-1", selectedChoiceId: "A", isCorrect: true, answeredAt: "2026-10-09T00:00:00.000Z" } });

    expect(await gateway.getLearnerModuleRecord("learner-b", "module-a")).toBeNull();
    expect(await gateway.getLearnerModuleRecord("learner-a", "module-b")).toBeNull();
    await expect(gateway.saveAnswer({ learnerId: "learner-a", moduleId: "module-a", attemptId: "missing", xpAward: 10, answer: { questionId: "question-2", selectedChoiceId: "B", isCorrect: false, answeredAt: "2026-10-09T00:01:00.000Z" } })).rejects.toThrow("Unknown attempt");
  });

  it("returns defensive snapshots so callers cannot change stored learning data", async () => {
    const gateway = new MockOfflineLearningGateway();
    const questionIds = ["question-1"];
    const remediation = await gateway.startRemediation({ learnerId: "learner-4", moduleId: "module-4", contentVersion: 1, questionIds });
    questionIds.push("question-2");
    remediation.questionIds?.push("question-3");
    remediation.answers.push({ questionId: "question-4", selectedChoiceId: "A", isCorrect: true, answeredAt: "2026-10-09T00:00:00.000Z" });

    const record = await gateway.getLearnerModuleRecord("learner-4", "module-4");
    expect(record?.attempts[0].questionIds).toEqual(["question-1"]);
    expect(record?.attempts[0].answers).toEqual([]);
  });

  it("clears a stale retry message when new local work is queued and clears the queue after a later sync", async () => {
    const gateway = new MockOfflineLearningGateway();
    await gateway.startSession({ learnerId: "learner-5", deviceId: "device-5" });
    gateway.simulateNextSyncFailure("Temporary connection issue");
    await gateway.requestSync();
    await gateway.startSession({ learnerId: "learner-5", deviceId: "device-5" });
    const pending = await gateway.getSyncSummary();
    expect(pending).toMatchObject({ status: "pending", pendingEventCount: 2 });
    expect(pending.failureReason).toBeUndefined();

    const synced = await gateway.requestSync();
    expect(synced).toMatchObject({ status: "synced", pendingEventCount: 0 });
    expect(synced.failureReason).toBeUndefined();
  });
});
