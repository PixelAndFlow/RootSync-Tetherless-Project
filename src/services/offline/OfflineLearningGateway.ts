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

export interface OfflineLearningGateway {
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
