import { describe, expect, it } from "vitest";
import { MOCK_TRAINER_COHORT_ID, MockTrainerDataGateway } from "./MockTrainerDataGateway";

const cohortId = MOCK_TRAINER_COHORT_ID;
const moduleId = "rcyc-recruit-cyber-squad-gamified-001";

describe("MockTrainerDataGateway", () => {
  it("supplies controlled empty and failed-load scenarios for frontend states", async () => {
    const empty = new MockTrainerDataGateway("empty_cohort");
    expect(await empty.listLearners({ cohortId })).toEqual([]);
    expect(await empty.getModuleCohortSummary({ cohortId, moduleId: "module-empty" })).toMatchObject({ learnerCount: 0, completedCount: 0, averageMasteryPercent: null });

    const failure = new MockTrainerDataGateway("load_failure");
    await expect(failure.listLearners({ cohortId })).rejects.toThrow("scenario testing");
  });

  it("returns fixture learners for the demo cohort only", async () => {
    const gateway = new MockTrainerDataGateway();
    expect(await gateway.listLearners({ cohortId })).toHaveLength(3);
    expect(await gateway.listLearners({ cohortId: "some-other-cohort" })).toEqual([]);
    expect(await gateway.listLearners({ cohortId, moduleId: "another-module" })).toEqual([]);
  });

  it("has the same shape as live data: no invented XP, names split, event counts present", async () => {
    const [first] = await new MockTrainerDataGateway().listLearners({ cohortId });
    expect(first).toMatchObject({ firstName: "Alex", lastName: "Rivera", xp: 0, bestStreak: 0, mayHaveUnsyncedWork: true });
    expect(first).not.toHaveProperty("displayName");
    expect(first).not.toHaveProperty("syncStatus");
    expect(typeof first.acceptedEventCount).toBe("number");
    expect(typeof first.rejectedEventCount).toBe("number");
  });

  it("summarises the cohort with the spec's counts and nullable averages", async () => {
    const cohort = await new MockTrainerDataGateway().getModuleCohortSummary({ cohortId, moduleId });
    expect(cohort).toMatchObject({ cohortId, learnerCount: 3, startedCount: 3, completedCount: 2, passingCount: 1, strugglingCount: 1, notYetPassingCount: 1 });
    expect(cohort.averageMasteryPercent).toBeGreaterThan(0);
  });

  it("returns defensive fixture copies and rejects unknown learner/module combinations", async () => {
    const gateway = new MockTrainerDataGateway();
    const learners = await gateway.listLearners({ cohortId });
    learners[0].firstName = "Changed outside the gateway";
    const detail = await gateway.getLearnerModuleDetail("fixture-learner-001", moduleId);
    detail.topicPerformance[0].masteredCount = 0;

    const freshLearners = await gateway.listLearners({ cohortId });
    const freshDetail = await gateway.getLearnerModuleDetail("fixture-learner-001", moduleId);
    expect(freshLearners[0].firstName).toBe("Alex");
    expect(freshDetail.topicPerformance[0].masteredCount).toBe(2);
    await expect(gateway.getLearnerModuleDetail("unknown", moduleId)).rejects.toThrow("Fixture learner/module record not found.");
    await expect(gateway.getModuleCohortSummary({ cohortId, moduleId: "unknown-module" })).rejects.toThrow("Fixture module not found.");
  });
});
