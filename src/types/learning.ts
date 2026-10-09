export type SyncStatus =
  | "offline"
  | "pending"
  | "syncing"
  | "synced"
  | "retryable_error"
  | "rejected";

export type LearningEventType =
  | "session_started"
  | "session_ended"
  | "app_backgrounded"
  | "app_returned"
  | "module_opened"
  | "question_answered"
  | "question_checked"
  | "module_completed"
  | "remediation_started"
  | "remediation_answered"
  | "remediation_completed"
  | "full_retry_started"
  | "full_retry_completed";

export interface TetherlessEvent<TPayload = unknown> {
  event_id: string;
  schema_version: number;
  learner_id: string;
  device_id: string;
  module_id: string;
  content_version: string;
  attempt_id?: string;
  question_id?: string;
  event_type: LearningEventType;
  payload: TPayload;
  client_timestamp: string;
  status: Exclude<SyncStatus, "offline">;
}

export type AttemptKind = "full" | "remediation";
export type AttemptStatus = "in_progress" | "completed";

export interface AnswerRecord {
  questionId: string;
  selectedChoiceId: string;
  isCorrect: boolean;
  answeredAt: string;
}

export interface AttemptRecord {
  id: string;
  learnerId: string;
  moduleId: string;
  kind: AttemptKind;
  status: AttemptStatus;
  startedAt: string;
  completedAt?: string;
  answers: AnswerRecord[];
  initialCorrectCount?: number;
  initialScorePercent?: number;
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

export interface LearnerModuleRecord extends ModuleProgress {
  attempts: AttemptRecord[];
  firstStartedAt?: string;
  firstCompletedAt?: string;
}

export interface SyncSummary {
  status: SyncStatus;
  pendingEventCount: number;
  lastSyncedAt?: string;
  failureReason?: string;
}

export interface StartSessionInput {
  learnerId: string;
  deviceId: string;
}

export interface StartAttemptInput {
  learnerId: string;
  moduleId: string;
  kind: AttemptKind;
}

export interface SaveAnswerInput {
  learnerId: string;
  moduleId: string;
  attemptId: string;
  answer: AnswerRecord;
}

export interface CompleteAttemptInput {
  learnerId: string;
  moduleId: string;
  attemptId: string;
  initialCorrectCount: number;
  initialScorePercent: number;
}

export interface StartRemediationInput {
  learnerId: string;
  moduleId: string;
}
