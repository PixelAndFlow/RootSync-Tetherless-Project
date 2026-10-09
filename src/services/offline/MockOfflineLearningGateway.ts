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
import type { OfflineLearningGateway } from "./OfflineLearningGateway";

const defaultProgress = (learnerId: string, moduleId: string): ModuleProgress => ({
  learnerId,
  moduleId,
  questionsTotal: 0,
  questionsAnswered: 0,
  currentMasteryPercent: 0,
  stillUnmasteredCount: 0,
  completionStatus: "not_started",
});

export class MockOfflineLearningGateway implements OfflineLearningGateway {
  private readonly records = new Map<string, LearnerModuleRecord>();
  private readonly subscribers = new Set<(summary: SyncSummary) => void>();
  private syncSummary: SyncSummary = { status: "synced", pendingEventCount: 0 };

  async startSession(input: StartSessionInput): Promise<SessionRecord> {
    return {
      id: crypto.randomUUID(),
      learnerId: input.learnerId,
      deviceId: input.deviceId,
      startedAt: new Date().toISOString(),
    };
  }

  async startAttempt(input: StartAttemptInput): Promise<AttemptRecord> {
    const record = this.ensureRecord(input.learnerId, input.moduleId);
    const attempt: AttemptRecord = {
      id: crypto.randomUUID(),
      learnerId: input.learnerId,
      moduleId: input.moduleId,
      kind: input.kind,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      answers: [],
    };
    record.attempts.push(attempt);
    record.firstStartedAt ??= attempt.startedAt;
    record.completionStatus = "in_progress";
    return attempt;
  }

  async saveAnswer(input: SaveAnswerInput): Promise<void> {
    const record = this.ensureRecord(input.learnerId, input.moduleId);
    const attempt = this.findAttempt(record, input.attemptId);
    const previousIndex = attempt.answers.findIndex(
      (answer) => answer.questionId === input.answer.questionId,
    );
    if (previousIndex >= 0) attempt.answers[previousIndex] = input.answer;
    else attempt.answers.push(input.answer);
    record.questionsAnswered = Math.max(record.questionsAnswered, attempt.answers.length);
  }

  async completeAttempt(input: CompleteAttemptInput): Promise<AttemptRecord> {
    const record = this.ensureRecord(input.learnerId, input.moduleId);
    const attempt = this.findAttempt(record, input.attemptId);
    attempt.status = "completed";
    attempt.completedAt = new Date().toISOString();
    const scorePercent = Number(((input.correctQuestionIds.length / input.questionsTotal) * 100).toFixed(1));
    attempt.initialCorrectCount = input.correctQuestionIds.length;
    attempt.initialScorePercent = scorePercent;
    record.questionsTotal = input.questionsTotal;
    record.questionsAnswered = Math.max(record.questionsAnswered, attempt.answers.length);
    const mastered = new Set([...record.masteredQuestionIds, ...input.correctQuestionIds]);
    record.masteredQuestionIds = [...mastered];
    record.currentMasteryPercent = Number(((record.masteredQuestionIds.length / input.questionsTotal) * 100).toFixed(1));
    record.stillUnmasteredCount = Math.max(0, input.questionsTotal - record.masteredQuestionIds.length);
    if (attempt.kind === "full" && record.initialScorePercent === undefined) {
      record.initialScorePercent = scorePercent;
      record.initialMissedQuestionIds = attempt.answers
        .filter((answer) => !answer.isCorrect)
        .map((answer) => answer.questionId);
    }
    record.firstCompletedAt ??= attempt.completedAt;
    record.completionStatus = "completed";
    return attempt;
  }

  async startRemediation(input: StartRemediationInput): Promise<AttemptRecord> {
    const attempt = await this.startAttempt({ ...input, kind: "remediation" });
    attempt.questionIds = input.questionIds;
    return attempt;
  }

  async getModuleProgress(learnerId: string, moduleId: string): Promise<ModuleProgress> {
    return this.records.get(this.key(learnerId, moduleId)) ?? defaultProgress(learnerId, moduleId);
  }

  async getLearnerModuleRecord(
    learnerId: string,
    moduleId: string,
  ): Promise<LearnerModuleRecord | null> {
    return this.records.get(this.key(learnerId, moduleId)) ?? null;
  }

  async getSyncSummary(): Promise<SyncSummary> {
    return this.syncSummary;
  }

  async requestSync(): Promise<SyncSummary> {
    this.syncSummary = { ...this.syncSummary, status: "syncing" };
    this.notify();
    this.syncSummary = {
      status: "synced",
      pendingEventCount: 0,
      lastSyncedAt: new Date().toISOString(),
    };
    this.notify();
    return this.syncSummary;
  }

  subscribeToSyncStatus(callback: (summary: SyncSummary) => void): () => void {
    this.subscribers.add(callback);
    callback(this.syncSummary);
    return () => this.subscribers.delete(callback);
  }

  private ensureRecord(learnerId: string, moduleId: string): LearnerModuleRecord {
    const key = this.key(learnerId, moduleId);
    const existing = this.records.get(key);
    if (existing) return existing;
    const record: LearnerModuleRecord = {
      ...defaultProgress(learnerId, moduleId),
      attempts: [],
      initialMissedQuestionIds: [],
      masteredQuestionIds: [],
    };
    this.records.set(key, record);
    return record;
  }

  private findAttempt(record: LearnerModuleRecord, attemptId: string): AttemptRecord {
    const attempt = record.attempts.find((candidate) => candidate.id === attemptId);
    if (!attempt) throw new Error(`Unknown attempt: ${attemptId}`);
    return attempt;
  }

  private key(learnerId: string, moduleId: string): string {
    return `${learnerId}:${moduleId}`;
  }

  private notify(): void {
    this.subscribers.forEach((callback) => callback(this.syncSummary));
  }
}
