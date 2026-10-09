import type {
  ModuleCohortSummary,
  TrainerLearnerSummary,
  TrainerModuleDetail,
} from "../../types/trainer";
import type { TrainerDataGateway } from "./TrainerDataGateway";

const learner: TrainerModuleDetail = {
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
};

export class MockTrainerDataGateway implements TrainerDataGateway {
  async listLearners(): Promise<TrainerLearnerSummary[]> {
    return [learner];
  }

  async getLearnerModuleDetail(learnerId: string, moduleId: string): Promise<TrainerModuleDetail> {
    if (learnerId !== learner.learnerId || moduleId !== learner.moduleId) {
      throw new Error("Fixture learner/module record not found.");
    }
    return learner;
  }

  async getModuleCohortSummary(moduleId: string): Promise<ModuleCohortSummary> {
    if (moduleId !== learner.moduleId) throw new Error("Fixture module not found.");
    return {
      moduleId,
      moduleTitle: learner.moduleTitle,
      learnerCount: 1,
      completedCount: 1,
      averageInitialScorePercent: learner.initialScorePercent ?? 0,
      averageMasteryPercent: learner.currentMasteryPercent,
    };
  }
}
