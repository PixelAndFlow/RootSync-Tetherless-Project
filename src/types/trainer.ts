import type { SyncStatus } from "./learning";

export interface TopicPerformance {
  topic: string;
  masteredCount: number;
  totalCount: number;
}

export interface SectorPerformance {
  sectorId: string;
  label: string;
  masteredCount: number;
  totalCount: number;
}

export interface TrainerLearnerSummary {
  learnerId: string;
  displayName: string;
  moduleId: string;
  moduleTitle: string;
  completionStatus: "not_started" | "in_progress" | "completed";
  initialScorePercent?: number;
  currentMasteryPercent: number;
  questionsAnswered: number;
  questionsTotal: number;
  initialMissedCount: number;
  stillUnmasteredCount: number;
  activeEngagementSeconds: number;
  sessionCount: number;
  xp: number;
  bestStreak: number;
  syncStatus: SyncStatus;
  lastActivityAt?: string;
}

export interface TrainerModuleDetail extends TrainerLearnerSummary {
  contentVersion: string;
  firstStartedAt?: string;
  completedAt?: string;
  remediationAttempted: number;
  remediationCorrected: number;
  fullAttemptCount: number;
  remediationRoundCount: number;
  returnCount: number;
  topicPerformance: TopicPerformance[];
  sectorPerformance: SectorPerformance[];
}

export interface ModuleCohortSummary {
  moduleId: string;
  moduleTitle: string;
  learnerCount: number;
  completedCount: number;
  averageInitialScorePercent: number;
  averageMasteryPercent: number;
}
