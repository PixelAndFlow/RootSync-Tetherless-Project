import type {
  AttemptRecord,
  CompleteAttemptInput,
  LearnerModuleRecord,
  ModuleProgress,
  SaveAnswerInput,
  SessionRecord,
  StartAttemptInput,
  StartRemediationInput,
  StartSessionInput,
  SyncSummary,
} from "../../types/learning";
import type { SetupProfile } from "../setup/LearnerSetupGateway";
import type { LocalizedText, TetherlessModule } from "../../types/content";

/** API Spec v1.30 §8.1. Field order matches SetupProfile exactly — same shape, Naquan's spec name. */
export type LearnerProfile = SetupProfile;

export interface ModuleSummary {
  moduleId: string;
  contentVersion: number;
  title: LocalizedText;
  level: string;
  activityType: string;
  downloadState: "not_downloaded" | "downloading" | "available_offline" | "download_problem";
}

/**
 * Agreed integration capabilities (API Spec v1.30 §8.1). They remain optional
 * until Naquan publishes the matching DdilLearningGateway surface; existing
 * mock mission behavior is unchanged.
 */
export interface StudentOfflineCapabilities {
  /** Verify restored device authorization before reopening paused deliveries. */
  recoverAuth?(): Promise<number>;
  setupDevice?(input: { setupCode: string; username: string }): Promise<LearnerProfile>;
  getLearnerProfile?(): Promise<LearnerProfile | null>;
  listAssignedModules?(): Promise<ModuleSummary[]>;
  prepareModuleForOffline?(moduleId: string, contentVersion: number): Promise<ModuleSummary>;
  getModule?(moduleId: string, contentVersion: number): Promise<TetherlessModule>;
  abandonAttempt?(input: { attemptId: string; moduleId: string; reason: "restart" | "quit" | "replaced" }): Promise<void>;
}

export interface OfflineLearningGateway extends StudentOfflineCapabilities {
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
