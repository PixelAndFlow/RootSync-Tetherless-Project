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

/**
 * Agreed integration capabilities. They remain optional until Naquan publishes the
 * matching DdilLearningGateway surface; existing mock mission behavior is unchanged.
 */
export interface StudentOfflineCapabilities {
  setupDevice?(input: { setupCode: string; username: string; deviceId: string }): Promise<SetupProfile>;
  getStudentProfile?(): Promise<SetupProfile | null>;
  listAssignedModules?(): Promise<{ moduleId: string; title: string; contentVersion: number; note?: string; activityType?: string }[]>;
  prepareModuleForOffline?(input: { moduleId: string; contentVersion: number }): Promise<void>;
  getModule?(input: { moduleId: string; contentVersion: number }): Promise<unknown | null>;
  abandonAttempt?(input: { learnerId: string; moduleId: string; attemptId: string }): Promise<void>;
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
