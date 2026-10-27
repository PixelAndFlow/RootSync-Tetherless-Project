import type {
  ModuleCohortSummary,
  TrainerLearnerSummary,
  TrainerModuleDetail,
} from "../../types/trainer";
import type { TrainerDataGateway } from "./TrainerDataGateway";

export type MockTrainerScenario = "default" | "empty_cohort" | "load_failure";

/** The demo cohort in MockStaffAdminGateway. Any other cohort id has no fixture learners. */
export const MOCK_TRAINER_COHORT_ID = "cohort-demo-001";
const MODULE_ID = "rcyc-recruit-cyber-squad-gamified-001";
const MODULE_TITLE = "Operation Cyber Squad";

// Fixture data in the same shape the API gateway returns, so the screens cannot tell them apart.
// It does not invent XP or streaks (deferred past Demo Day, D-14): those are 0, as in live data.
const learners: TrainerModuleDetail[] = [{
  learnerId: "fixture-learner-001",
  username: "alex.r",
  learnerCode: "RCYC-PR-Bootcamp2026-0001",
  firstName: "Alex",
  lastName: "Rivera",
  moduleId: MODULE_ID,
  moduleTitle: MODULE_TITLE,
  contentVersion: 1,
  completionStatus: "completed",
  initialScorePercent: 66.7,
  bestScorePercent: 66.7,
  currentMasteryPercent: 93.3,
  questionsAnswered: 15,
  questionsTotal: 15,
  initialMissedCount: 5,
  stillUnmasteredCount: 1,
  statusLabel: "not_yet_passing",
  strugglingReasons: [],
  attemptsAbandoned: 0,
  activeEngagementSeconds: 664,
  sessionCount: 2,
  lastSyncedAt: "2026-10-08T18:05:00.000Z",
  mayHaveUnsyncedWork: true,
  acceptedEventCount: 47,
  rejectedEventCount: 0,
  lastActivityAt: "2026-10-08T18:04:00.000Z",
  xp: 0,
  bestStreak: 0,
  firstStartedAt: "2026-10-08T17:42:00.000Z",
  completedAt: "2026-10-08T17:55:00.000Z",
  remediationAttempted: 5,
  remediationCorrected: 4,
  fullAttemptCount: 1,
  remediationRoundCount: 1,
  returnCount: 1,
  topicPerformance: [
    { topic: "Authorization", masteredCount: 2, totalCount: 3 },
    { topic: "Ethics", masteredCount: 3, totalCount: 3 },
    { topic: "Version Control", masteredCount: 4, totalCount: 4 },
  ],
  sectorPerformance: [],
  attempts: [],
}, {
  learnerId: "fixture-learner-002",
  username: "jordan.l",
  learnerCode: "RCYC-PR-Bootcamp2026-0002",
  firstName: "Jordan",
  lastName: "Lee",
  moduleId: MODULE_ID,
  moduleTitle: MODULE_TITLE,
  contentVersion: 1,
  completionStatus: "in_progress",
  currentMasteryPercent: 46.7,
  questionsAnswered: 9,
  questionsTotal: 15,
  initialMissedCount: 0,
  stillUnmasteredCount: 8,
  statusLabel: "struggling",
  strugglingReasons: ["weak_topic:authorization"],
  attemptsAbandoned: 0,
  activeEngagementSeconds: 392,
  sessionCount: 3,
  lastSyncedAt: "2026-10-09T00:20:00.000Z",
  mayHaveUnsyncedWork: true,
  acceptedEventCount: 31,
  rejectedEventCount: 1,
  lastActivityAt: "2026-10-09T00:42:00.000Z",
  xp: 0,
  bestStreak: 0,
  firstStartedAt: "2026-10-09T00:30:00.000Z",
  remediationAttempted: 0,
  remediationCorrected: 0,
  fullAttemptCount: 0,
  remediationRoundCount: 0,
  returnCount: 2,
  topicPerformance: [
    { topic: "Authorization", masteredCount: 0, totalCount: 3 },
    { topic: "Ethics", masteredCount: 2, totalCount: 3 },
    { topic: "Version Control", masteredCount: 2, totalCount: 3 },
  ],
  sectorPerformance: [],
  attempts: [],
}, {
  learnerId: "fixture-learner-003",
  username: null,
  learnerCode: "RCYC-PR-Bootcamp2026-0003",
  firstName: "Sam",
  lastName: "Ortiz",
  moduleId: MODULE_ID,
  moduleTitle: MODULE_TITLE,
  contentVersion: 1,
  completionStatus: "completed",
  initialScorePercent: 86.7,
  bestScorePercent: 86.7,
  currentMasteryPercent: 100,
  questionsAnswered: 15,
  questionsTotal: 15,
  initialMissedCount: 2,
  stillUnmasteredCount: 0,
  statusLabel: "passing",
  strugglingReasons: [],
  attemptsAbandoned: 0,
  activeEngagementSeconds: 583,
  sessionCount: 1,
  lastSyncedAt: "2026-10-08T21:06:00.000Z",
  mayHaveUnsyncedWork: true,
  acceptedEventCount: 36,
  rejectedEventCount: 0,
  lastActivityAt: "2026-10-08T21:05:00.000Z",
  xp: 0,
  bestStreak: 0,
  firstStartedAt: "2026-10-08T20:54:00.000Z",
  completedAt: "2026-10-08T21:05:00.000Z",
  remediationAttempted: 2,
  remediationCorrected: 2,
  fullAttemptCount: 1,
  remediationRoundCount: 1,
  returnCount: 0,
  topicPerformance: [
    { topic: "Authorization", masteredCount: 3, totalCount: 3 },
    { topic: "Ethics", masteredCount: 3, totalCount: 3 },
    { topic: "Version Control", masteredCount: 4, totalCount: 4 },
  ],
  sectorPerformance: [],
  attempts: [],
}];

const average = (values: number[]): number | null => (values.length ? Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(1)) : null);

export class MockTrainerDataGateway implements TrainerDataGateway {
  constructor(private readonly scenario: MockTrainerScenario = "default") {}

  async listLearners(input: { cohortId: string; moduleId?: string }): Promise<TrainerLearnerSummary[]> {
    if (this.scenario === "load_failure") throw new Error("Trainer fixture load failed for scenario testing.");
    if (this.scenario === "empty_cohort" || input.cohortId !== MOCK_TRAINER_COHORT_ID) return [];
    return this.copy(learners.filter((learner) => !input.moduleId || learner.moduleId === input.moduleId));
  }

  async getLearnerModuleDetail(learnerId: string, moduleId: string): Promise<TrainerModuleDetail> {
    if (this.scenario === "load_failure") throw new Error("Trainer fixture load failed for scenario testing.");
    const learner = learners.find((candidate) => candidate.learnerId === learnerId && candidate.moduleId === moduleId);
    if (!learner) throw new Error("Fixture learner/module record not found.");
    return this.copy(learner);
  }

  async getModuleCohortSummary(input: { cohortId: string; moduleId: string }): Promise<ModuleCohortSummary> {
    if (this.scenario === "load_failure") throw new Error("Trainer fixture load failed for scenario testing.");
    const empty = (moduleTitle: string): ModuleCohortSummary => ({
      cohortId: input.cohortId, moduleId: input.moduleId, moduleTitle, learnerCount: 0, startedCount: 0, completedCount: 0,
      averageInitialScorePercent: null, averageBestScorePercent: null, averageMasteryPercent: null,
      passingCount: 0, strugglingCount: 0, notYetPassingCount: 0,
    });
    if (this.scenario === "empty_cohort" || input.cohortId !== MOCK_TRAINER_COHORT_ID) return empty("No fixture module");
    const cohort = learners.filter((learner) => learner.moduleId === input.moduleId);
    if (!cohort.length) throw new Error("Fixture module not found.");
    return this.copy({
      cohortId: input.cohortId,
      moduleId: input.moduleId,
      moduleTitle: cohort[0].moduleTitle,
      learnerCount: cohort.length,
      startedCount: cohort.filter((learner) => learner.completionStatus !== "not_started").length,
      completedCount: cohort.filter((learner) => learner.completionStatus === "completed").length,
      averageInitialScorePercent: average(cohort.flatMap((learner) => (learner.initialScorePercent === undefined ? [] : [learner.initialScorePercent]))),
      averageBestScorePercent: average(cohort.flatMap((learner) => (learner.bestScorePercent === undefined ? [] : [learner.bestScorePercent]))),
      averageMasteryPercent: average(cohort.map((learner) => learner.currentMasteryPercent)),
      passingCount: cohort.filter((learner) => learner.statusLabel === "passing").length,
      strugglingCount: cohort.filter((learner) => learner.statusLabel === "struggling").length,
      notYetPassingCount: cohort.filter((learner) => learner.statusLabel === "not_yet_passing").length,
    });
  }

  private copy<T>(value: T): T {
    return structuredClone(value);
  }
}
