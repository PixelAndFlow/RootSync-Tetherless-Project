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
  private nextSyncFailureReason: string | null = null;

  async startSession(input: StartSessionInput): Promise<SessionRecord> {
    const session = {
      id: crypto.randomUUID(),
      learnerId: input.learnerId,
      deviceId: input.deviceId,
      startedAt: new Date().toISOString(),
    };
    this.queueLocalEvent();
    return session;
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
    this.queueLocalEvent();
    return attempt;
  }

  async saveAnswer(input: SaveAnswerInput): Promise<void> {
    const record = this.ensureRecord(input.learnerId, input.moduleId);
    const attempt = this.findAttempt(record, input.attemptId);
    const previousIndex = attempt.answers.findIndex(
      (answer) => answer.questionId === input.answer.questionId,
    );
    if (previousIndex >= 0) {
      attempt.answers[previousIndex] = input.answer;
      return;
    }
    attempt.answers.push(input.answer);
    record.questionsAnswered = Math.max(record.questionsAnswered, attempt.answers.length);
    if (input.answer.isCorrect) {
      record.engagement.currentStreak += 1;
      record.engagement.bestStreak = Math.max(record.engagement.bestStreak, record.engagement.currentStreak);
      if (!record.engagement.xpAwardedQuestionIds.includes(input.answer.questionId)) {
        record.engagement.xpAwardedQuestionIds.push(input.answer.questionId);
        record.engagement.xp += input.xpAward;
      }
    } else {
      record.engagement.currentStreak = 0;
    }
    this.queueLocalEvent();
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
    for (const award of input.sectorMasteryAwards ?? []) {
      const sectorIsMastered = award.questionIds.every((questionId) => record.masteredQuestionIds.includes(questionId));
      if (sectorIsMastered && !record.engagement.completedSectorIds.includes(award.sectorId)) {
        record.engagement.completedSectorIds.push(award.sectorId);
        record.engagement.xp += award.bonusXp;
      }
    }
    const allQuestionsMastered = record.masteredQuestionIds.length === input.questionsTotal;
    const missionAward = input.missionMasteryAward;
    if (allQuestionsMastered && missionAward?.badgeId && !record.engagement.earnedBadgeIds.includes(missionAward.badgeId)) {
      record.engagement.earnedBadgeIds.push(missionAward.badgeId);
      record.engagement.xp += missionAward.bonusXp;
    }
    record.firstCompletedAt ??= attempt.completedAt;
    record.completionStatus = "completed";
    this.queueLocalEvent();
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
    if (this.nextSyncFailureReason) {
      this.syncSummary = {
        ...this.syncSummary,
        status: "retryable_error",
        failureReason: this.nextSyncFailureReason,
      };
      this.nextSyncFailureReason = null;
      this.notify();
      return this.syncSummary;
    }
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

  /** Development/test-only control. It is not part of the production gateway contract. */
  simulateNextSyncFailure(reason = "Connection interrupted. Try again when service returns."): void {
    this.nextSyncFailureReason = reason;
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
      engagement: {
        xp: 0,
        currentStreak: 0,
        bestStreak: 0,
        xpAwardedQuestionIds: [],
        completedSectorIds: [],
        earnedBadgeIds: [],
      },
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

  private queueLocalEvent(): void {
    this.syncSummary = {
      ...this.syncSummary,
      status: "pending",
      pendingEventCount: this.syncSummary.pendingEventCount + 1,
    };
    this.notify();
  }
}
