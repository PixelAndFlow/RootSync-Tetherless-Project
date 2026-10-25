import { describe, expect, it } from "vitest";
import { MockTrainerDataGateway } from "./MockTrainerDataGateway";

describe("MockTrainerDataGateway", () => {
  it("supplies controlled empty and failed-load scenarios for frontend states", async () => {
    const empty = new MockTrainerDataGateway("empty_cohort");
    expect(await empty.listLearners()).toEqual([]);
    expect(await empty.getModuleCohortSummary("module-empty")).toMatchObject({ learnerCount: 0, completedCount: 0 });

    const failure = new MockTrainerDataGateway("load_failure");
    await expect(failure.listLearners()).rejects.toThrow("scenario testing");
  });
  it("provides de-identified learner summaries and cohort metrics", async () => {
    const gateway = new MockTrainerDataGateway();
    const learners = await gateway.listLearners();
    const cohort = await gateway.getModuleCohortSummary("rcyc-recruit-cyber-squad-gamified-001");

    expect(learners).toHaveLength(3);
    expect(cohort.learnerCount).toBe(3);
    expect(cohort.completedCount).toBe(2);
    expect(cohort.averageMasteryPercent).toBeGreaterThan(0);
  });

  it("returns defensive fixture copies and rejects unknown learner/module combinations", async () => {
    const gateway = new MockTrainerDataGateway();
    const learners = await gateway.listLearners();
    learners[0].displayName = "Changed outside the gateway";
    const detail = await gateway.getLearnerModuleDetail("fixture-learner-001", "rcyc-recruit-cyber-squad-gamified-001");
    detail.topicPerformance[0].masteredCount = 0;

    const freshLearners = await gateway.listLearners();
    const freshDetail = await gateway.getLearnerModuleDetail("fixture-learner-001", "rcyc-recruit-cyber-squad-gamified-001");
    expect(freshLearners[0].displayName).toBe("Alex Rivera");
    expect(freshDetail.topicPerformance[0].masteredCount).toBe(2);
    await expect(gateway.getLearnerModuleDetail("unknown", "rcyc-recruit-cyber-squad-gamified-001")).rejects.toThrow("Fixture learner/module record not found.");
    await expect(gateway.getModuleCohortSummary("unknown-module")).rejects.toThrow("Fixture module not found.");
  });
});
