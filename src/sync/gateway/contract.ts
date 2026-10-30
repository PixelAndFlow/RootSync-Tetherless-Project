/**
 * The gateway contract, mirrored.
 *
 * IMPORTANT: this is a LOCAL MIRROR of Chris's frontend contract, copied so
 * the DDIL layer can be built and tested on this branch without importing
 * from `origin/chris`. It is NOT the source of truth.
 *
 * Source of truth: origin/chris -> src/services/offline/OfflineLearningGateway.ts
 * and src/types/learning.ts.
 *
 * When Chris changes his contract, this file must follow, and the integration
 * test in tests/sync/gateway-contract.test.ts will fail if the method list
 * drifts. That test is the reason this mirror is safe to keep: it turns a
 * silent divergence into a red test.
 *
 * Ten methods, not nine — getModuleProgress() is the one that is easy to miss.
 */

export type SyncStatus =
  | "offline"
  | "pending"
  | "syncing"
  | "synced"
  | "blocked_auth"
  | "retryable_error"
  | "rejected";

export interface AnswerRecord {
  questionId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
  answeredAt: string;
}

export type AttemptKind = "full" | "remediation";
export type AttemptStatus = "in_progress" | "completed" | "abandoned";

export interface AttemptRecord {
  id: string;
  learnerId: string;
  moduleId: string;
  /** Published package used by this attempt; absent only in legacy/demo records. */
  contentVersion?: number;
  kind: AttemptKind;
  status: AttemptStatus;
  startedAt: string;
  completedAt?: string;
  answers: AnswerRecord[];
  initialCorrectCount?: number;
  initialScorePercent?: number;
  questionIds?: string[];
}

export interface SessionRecord {
  id: string;
  learnerId: string;
  deviceId: string;
  startedAt: string;
}

export interface ModuleProgress {
  learnerId: string;
  moduleId: string;
  questionsTotal: number;
  questionsAnswered: number;
  initialScorePercent?: number;
  currentMasteryPercent: number;
  stillUnmasteredCount: number;
  completionStatus: "not_started" | "in_progress" | "completed";
}

export interface EngagementSummary {
  xp: number;
  currentStreak: number;
  bestStreak: number;
  xpAwardedQuestionIds: string[];
  completedSectorIds: string[];
  earnedBadgeIds: string[];
}

export interface LearnerModuleRecord extends ModuleProgress {
  attempts: AttemptRecord[];
  firstStartedAt?: string;
  firstCompletedAt?: string;
  initialMissedQuestionIds: string[];
  masteredQuestionIds: string[];
  engagement: EngagementSummary;
}

export interface SyncSummary {
  status: SyncStatus;
  pendingEventCount: number;
  lastSyncedAt?: string;
  failureReason?: string;
  authorizationReason?: "invalid_credential" | "revoked_device" | "unknown";
}

export interface StartSessionInput {
  learnerId: string;
  deviceId: string;
}

export interface StartAttemptInput {
  learnerId: string;
  moduleId: string;
  /** The module's published content version (API Spec v1.30 §8.2). Every attempt event carries it. */
  contentVersion: number;
  kind: AttemptKind;
}

export interface SaveAnswerInput {
  learnerId: string;
  moduleId: string;
  attemptId: string;
  answer: AnswerRecord;
  xpAward: number;
}

export interface SectorMasteryAward {
  sectorId: string;
  questionIds: string[];
  bonusXp: number;
}

export interface MissionMasteryAward {
  badgeId?: string;
  bonusXp: number;
}

export interface CompleteAttemptInput {
  learnerId: string;
  moduleId: string;
  attemptId: string;
  questionsTotal: number;
  correctQuestionIds: string[];
  sectorMasteryAwards?: SectorMasteryAward[];
  missionMasteryAward?: MissionMasteryAward;
}

export interface StartRemediationInput {
  learnerId: string;
  moduleId: string;
  /** The module's published content version. Remediation is a practice attempt and carries it like any other. */
  contentVersion: number;
  questionIds: string[];
}

export interface OfflineLearningGateway {
  recoverAuth?(): Promise<number>;
  startSession(input: StartSessionInput): Promise<SessionRecord>;
  startAttempt(input: StartAttemptInput): Promise<AttemptRecord>;
  saveAnswer(input: SaveAnswerInput): Promise<void>;
  completeAttempt(input: CompleteAttemptInput): Promise<AttemptRecord>;
  startRemediation(input: StartRemediationInput): Promise<AttemptRecord>;
  getModuleProgress(learnerId: string, moduleId: string): Promise<ModuleProgress>;
  getLearnerModuleRecord(
    learnerId: string,
    moduleId: string,
  ): Promise<LearnerModuleRecord | null>;
  getSyncSummary(): Promise<SyncSummary>;
  requestSync(): Promise<SyncSummary>;
  subscribeToSyncStatus(callback: (summary: SyncSummary) => void): () => void;
}

/**
 * API Spec v1.30 §8.1 additions. Mirrored here the same way as the ten
 * methods above — see the file header. `TetherlessModule`/`LocalizedText`
 * are re-exported, not redefined: the module JSON schema is Chris's, large,
 * and DDIL only stores/returns it verbatim, so duplicating it here would be
 * drift risk for no benefit.
 */
export type { LocalizedText, TetherlessModule } from "../../types/content.ts";

export interface LearnerProfile {
  learnerId: string;
  deviceId: string;
  username: string;
  learnerCode: string;
  cohortName: string;
}

export interface ModuleSummary {
  moduleId: string;
  contentVersion: number;
  title: { en: string; es?: string };
  level: string;
  activityType: string;
  downloadState: "not_downloaded" | "downloading" | "available_offline" | "download_problem";
}

/** The two device-scoped HTTP calls setupDevice/listAssignedModules/getModule need, beyond POST /v1/sync/events. */
export interface DeviceApi {
  post(path: string, body: unknown, options?: { auth?: boolean }): Promise<unknown>;
  get(path: string): Promise<unknown>;
}

/** The exact method list, used by the contract test to detect drift. */
export const GATEWAY_METHODS = [
  "startSession",
  "startAttempt",
  "saveAnswer",
  "completeAttempt",
  "startRemediation",
  "getModuleProgress",
  "getLearnerModuleRecord",
  "getSyncSummary",
  "requestSync",
  "subscribeToSyncStatus",
] as const;
