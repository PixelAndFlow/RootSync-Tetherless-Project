import { describe, expect, it } from "vitest";
import { MockOfflineLearningGateway } from "./MockOfflineLearningGateway";

describe("MockOfflineLearningGateway", () => {
  it("keeps the first attempt score after remediation begins", async () => {
    const gateway = new MockOfflineLearningGateway();
    const attempt = await gateway.startAttempt({ learnerId: "learner-1", moduleId: "module-1", kind: "full" });
    await gateway.completeAttempt({ learnerId: "learner-1", moduleId: "module-1", attemptId: attempt.id, initialCorrectCount: 10, initialScorePercent: 66.7 });
    await gateway.startRemediation({ learnerId: "learner-1", moduleId: "module-1" });
    const record = await gateway.getLearnerModuleRecord("learner-1", "module-1");
    expect(record?.initialScorePercent).toBe(66.7);
    expect(record?.attempts).toHaveLength(2);
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
