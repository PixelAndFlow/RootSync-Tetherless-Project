import type {
  ModuleCohortSummary,
  TrainerLearnerSummary,
  TrainerModuleDetail,
} from "../../types/trainer";
import type { TrainerDataGateway } from "./TrainerDataGateway";

export type MockTrainerScenario = "default" | "empty_cohort" | "load_failure";

const learners: TrainerModuleDetail[] = [{
  learnerId: "fixture-learner-001",
  displayName: "Alex Rivera",
  moduleId: "rcyc-recruit-cyber-squad-gamified-001",
  moduleTitle: "Operation Cyber Squad",
  contentVersion: "2.0.0",
  completionStatus: "completed",
  initialScorePercent: 66.7,
  currentMasteryPercent: 93.3,
  questionsAnswered: 15,
  questionsTotal: 15,
  initialMissedCount: 5,
  stillUnmasteredCount: 1,
  activeEngagementSeconds: 664,
  sessionCount: 2,
  xp: 740,
  bestStreak: 5,
  syncStatus: "synced",
  lastActivityAt: "2026-10-08T18:04:00.000Z",
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
  sectorPerformance: [
    { sectorId: "team", label: "Know Your Team", masteredCount: 4, totalCount: 5 },
    { sectorId: "rules", label: "Stay Inside the Rules", masteredCount: 5, totalCount: 5 },
    { sectorId: "evidence", label: "Protect the Evidence", masteredCount: 5, totalCount: 5 },
  ],
}, {
  learnerId: "fixture-learner-002",
  displayName: "Jordan Lee",
  moduleId: "rcyc-recruit-cyber-squad-gamified-001",
  moduleTitle: "Operation Cyber Squad",
  contentVersion: "2.0.0",
  completionStatus: "in_progress",
  currentMasteryPercent: 46.7,
  questionsAnswered: 9,
  questionsTotal: 15,
  initialMissedCount: 0,
  stillUnmasteredCount: 8,
  activeEngagementSeconds: 392,
  sessionCount: 3,
  xp: 320,
  bestStreak: 3,
  syncStatus: "pending",
  lastActivityAt: "2026-10-09T00:42:00.000Z",
  firstStartedAt: "2026-10-09T00:30:00.000Z",
  remediationAttempted: 0,
  remediationCorrected: 0,
  fullAttemptCount: 1,
  remediationRoundCount: 0,
  returnCount: 2,
  topicPerformance: [
    { topic: "Authorization", masteredCount: 1, totalCount: 3 },
    { topic: "Ethics", masteredCount: 2, totalCount: 3 },
    { topic: "Version Control", masteredCount: 4, totalCount: 4 },
  ],
  sectorPerformance: [
    { sectorId: "team", label: "Know Your Team", masteredCount: 3, totalCount: 5 },
    { sectorId: "rules", label: "Stay Inside the Rules", masteredCount: 2, totalCount: 5 },
    { sectorId: "evidence", label: "Protect the Evidence", masteredCount: 2, totalCount: 5 },
  ],
}, {
  learnerId: "fixture-learner-003",
  displayName: "Sam Ortiz",
  moduleId: "rcyc-recruit-cyber-squad-gamified-001",
  moduleTitle: "Operation Cyber Squad",
  contentVersion: "2.0.0",
  completionStatus: "completed",
  initialScorePercent: 86.7,
  currentMasteryPercent: 100,
  questionsAnswered: 15,
  questionsTotal: 15,
  initialMissedCount: 2,
  stillUnmasteredCount: 0,
  activeEngagementSeconds: 583,
  sessionCount: 1,
  xp: 1_550,
  bestStreak: 9,
  syncStatus: "synced",
  lastActivityAt: "2026-10-08T21:05:00.000Z",
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
  sectorPerformance: [
    { sectorId: "team", label: "Know Your Team", masteredCount: 5, totalCount: 5 },
    { sectorId: "rules", label: "Stay Inside the Rules", masteredCount: 5, totalCount: 5 },
    { sectorId: "evidence", label: "Protect the Evidence", masteredCount: 5, totalCount: 5 },
  ],
}];

export class MockTrainerDataGateway implements TrainerDataGateway {
  constructor(private readonly scenario: MockTrainerScenario = "default") {}

  async listLearners(): Promise<TrainerLearnerSummary[]> {
    if (this.scenario === "load_failure") throw new Error("Trainer fixture load failed for scenario testing.");
    if (this.scenario === "empty_cohort") return [];
    return this.copy(learners);
  }

  async getLearnerModuleDetail(learnerId: string, moduleId: string): Promise<TrainerModuleDetail> {
    if (this.scenario === "load_failure") throw new Error("Trainer fixture load failed for scenario testing.");
    const learner = learners.find((candidate) => candidate.learnerId === learnerId && candidate.moduleId === moduleId);
    if (!learner) {
      throw new Error("Fixture learner/module record not found.");
    }
    return this.copy(learner);
  }

  async getModuleCohortSummary(moduleId: string): Promise<ModuleCohortSummary> {
    if (this.scenario === "load_failure") throw new Error("Trainer fixture load failed for scenario testing.");
    if (this.scenario === "empty_cohort") return { moduleId, moduleTitle: "No fixture module", learnerCount: 0, completedCount: 0, averageInitialScorePercent: 0, averageMasteryPercent: 0 };
    const cohort = learners.filter((learner) => learner.moduleId === moduleId);
    if (!cohort.length) throw new Error("Fixture module not found.");
    return this.copy({
      moduleId,
      moduleTitle: cohort[0].moduleTitle,
      learnerCount: cohort.length,
      completedCount: cohort.filter((learner) => learner.completionStatus === "completed").length,
      averageInitialScorePercent: Number((cohort.reduce((total, learner) => total + (learner.initialScorePercent ?? 0), 0) / cohort.filter((learner) => learner.initialScorePercent !== undefined).length).toFixed(1)),
      averageMasteryPercent: Number((cohort.reduce((total, learner) => total + learner.currentMasteryPercent, 0) / cohort.length).toFixed(1)),
    });
  }

  private copy<T>(value: T): T {
    return structuredClone(value);
  }
}
