import { describe, expect, it } from "vitest";
import { MockTrainerDataGateway } from "./MockTrainerDataGateway";

describe("MockTrainerDataGateway", () => {
  it("provides de-identified learner summaries and cohort metrics", async () => {
    const gateway = new MockTrainerDataGateway();
    const learners = await gateway.listLearners();
    const cohort = await gateway.getModuleCohortSummary("rcyc-recruit-cyber-squad-gamified-001");

    expect(learners).toHaveLength(3);
    expect(cohort.learnerCount).toBe(3);
    expect(cohort.completedCount).toBe(2);
    expect(cohort.averageMasteryPercent).toBeGreaterThan(0);
  });
});
