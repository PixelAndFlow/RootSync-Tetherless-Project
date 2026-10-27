// Trainer dashboard types: API Spec v1.30 sections 9.2 to 9.4. camelCase app types,
// mapped from the contract's snake_case report shapes in
// src/services/trainer/trainerMappers.ts (field-name rule, spec section 2).

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

/** Same codes as the server's status labels. Wording lives in `performanceLabels`. */
export type PerformanceStatus = "passing" | "struggling" | "not_yet_passing" | "not_started";

/** Presentation label is centralised so stakeholder wording can change without changing codes. */
export const performanceLabels: Record<PerformanceStatus, string> = {
  passing: "Passing",
  struggling: "Needs support",
  not_yet_passing: "Not yet passing",
  not_started: "Not started",
};

/** One learner on one module (spec 9.2). A learner with several modules has one row per module. */
export interface TrainerLearnerSummary {
  learnerId: string;
  /** Chosen by the learner; never shown alone. Pair it with the name or `learnerCode`. */
  username: string | null;
  learnerCode: string;
  firstName: string;
  lastName: string;
  moduleId: string;
  moduleTitle: string;
  completionStatus: "not_started" | "in_progress" | "completed";
  initialScorePercent?: number;
  bestScorePercent?: number;
  currentMasteryPercent: number;
  questionsAnswered: number;
  questionsTotal: number;
  initialMissedCount: number;
  stillUnmasteredCount: number;
  statusLabel: PerformanceStatus;
  /** For example `weak_topic:backups`. */
  strugglingReasons: string[];
  attemptsAbandoned: number;
  /** Per learner across all modules (spec C-4); label it "active time (all modules)". */
  activeEngagementSeconds: number;
  /** Per learner. */
  sessionCount: number;
  /** When the server last received an event from this learner's phone. */
  lastSyncedAt: string | null;
  /** The server cannot see work still on the phone, so this is always true for live data. */
  mayHaveUnsyncedWork: boolean;
  /** Events the server accepted from this learner's phone (all modules). Spec addendum: 9.2 drops it, the live screens show it. */
  acceptedEventCount: number;
  /** Events the server rejected, kept and never retried. The "Sync Problem" signal. Spec addendum. */
  rejectedEventCount: number;
  /**
   * True on the one placeholder row a learner gets when the server reports no module results for
   * them, so they are not missing from the cohort table. `moduleId` and `moduleTitle` are empty on it.
   * Spec addendum.
   */
  noModuleResults?: true;
  /** Latest attempt time on the phone clock; approximate. */
  lastActivityAt?: string;
  /** Always 0 until after Demo Day (D-14). Kept so the shape matches the spec. */
  xp: number;
  /** Always 0 until after Demo Day (D-14). */
  bestStreak: number;
}

export interface TrainerAnswer {
  questionId: string;
  choiceId: string | null;
  correct: boolean;
}

export interface TrainerAttempt {
  attemptId: string;
  kind: "full" | "practice" | "boss" | "review";
  contentVersion: number;
  status: "completed" | "abandoned" | "in_progress";
  startedAt: string;
  endedAt?: string;
  /** The server's score for a completed full attempt. */
  scorePercent?: number;
  /** What the phone showed the learner, for comparison only. Never used for scoring. */
  deviceScore?: { correct: number; total: number };
  answers: TrainerAnswer[];
}

/** Spec 9.3: adds to the summary. */
export interface TrainerModuleDetail extends TrainerLearnerSummary {
  contentVersion: number;
  firstStartedAt?: string;
  completedAt?: string;
  fullAttemptCount: number;
  remediationRoundCount: number;
  remediationAttempted: number;
  remediationCorrected: number;
  /** Sessions after the first. */
  returnCount: number;
  topicPerformance: TopicPerformance[];
  /** Empty before Demo Day. */
  sectorPerformance: SectorPerformance[];
  attempts: TrainerAttempt[];
}

/** Spec 9.4. Averages are null when nobody has a score yet. */
export interface ModuleCohortSummary {
  cohortId: string;
  moduleId: string;
  moduleTitle: string;
  learnerCount: number;
  startedCount: number;
  completedCount: number;
  averageInitialScorePercent: number | null;
  averageBestScorePercent: number | null;
  averageMasteryPercent: number | null;
  passingCount: number;
  strugglingCount: number;
  notYetPassingCount: number;
}
