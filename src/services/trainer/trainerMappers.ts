import type {
  CohortModuleSummary,
  LearnerReportRow,
  ReportActiveTime,
  ReportAnswerRecord,
  ReportAttemptSummary,
  ReportModuleResult,
  ReportSyncSummary,
  ReportTopicResult,
} from "../../../packages/contract/src/staff-api";
import type { ModuleCohortSummary, TrainerAttempt, TrainerLearnerSummary, TrainerModuleDetail } from "../../types/trainer";

/**
 * Wire (snake_case, packages/contract) to app (camelCase, src/types/trainer.ts), per
 * API Spec v1.30 sections 9.2 to 9.4. The wire shapes below are narrowed with Pick
 * from the contract's own types, so renaming or removing a field the dashboard reads
 * fails the build here and nowhere else.
 */

export type AnswerWire = Pick<ReportAnswerRecord, "question_id" | "choice_id" | "correct">;
export type AttemptWire = Pick<ReportAttemptSummary, "attempt_id" | "kind" | "content_version" | "status" | "started_at" | "ended_at" | "score" | "device_score"> & { answers: AnswerWire[] };
export type TopicWire = Pick<ReportTopicResult, "topic" | "answers" | "correct">;
export type ModuleWire = Pick<
  ReportModuleResult,
  "module_id" | "module_name" | "status_label" | "content_version_latest" | "questions_total" | "questions_answered" | "completion" | "completed_at" | "initial" | "best" | "mastery" | "abandoned_total" | "struggling_reasons"
> & { topics: TopicWire[]; attempts: AttemptWire[] };
export type LearnerWire = {
  learner: Pick<LearnerReportRow["learner"], "learner_id" | "learner_code" | "first_name" | "last_name" | "username">;
  modules: ModuleWire[];
  time: Pick<ReportActiveTime, "active_ms"> & { sessions: Pick<ReportActiveTime["sessions"][number], "session_id">[] };
  /** The contract types `may_have_unsynced_work` as always true; accept any boolean so a change there is not a crash. */
  sync: Pick<ReportSyncSummary, "last_received_at" | "accepted_events" | "rejected_events"> & { may_have_unsynced_work: boolean };
};
export type CohortSummaryWire = Pick<
  CohortModuleSummary,
  "cohort_id" | "module_id" | "module_name" | "learner_count" | "started_count" | "completed_count" | "average_initial_score_percent" | "average_best_score_percent" | "average_mastery_percent" | "passing_count" | "struggling_count" | "not_yet_passing_count"
>;

function latestActivity(attempts: AttemptWire[]): string | undefined {
  let latest: string | undefined;
  for (const attempt of attempts) {
    const at = attempt.ended_at ?? attempt.started_at;
    if (latest === undefined || Date.parse(at) > Date.parse(latest)) latest = at;
  }
  return latest;
}

/** The one row a learner with no module results gets, so they still appear in the cohort table. */
function placeholderFor(row: LearnerWire): TrainerLearnerSummary {
  return {
    learnerId: row.learner.learner_id,
    username: row.learner.username,
    learnerCode: row.learner.learner_code,
    firstName: row.learner.first_name,
    lastName: row.learner.last_name,
    moduleId: "",
    moduleTitle: "",
    completionStatus: "not_started",
    currentMasteryPercent: 0,
    questionsAnswered: 0,
    questionsTotal: 0,
    initialMissedCount: 0,
    stillUnmasteredCount: 0,
    statusLabel: "not_started",
    strugglingReasons: [],
    attemptsAbandoned: 0,
    activeEngagementSeconds: row.time.active_ms / 1000,
    sessionCount: row.time.sessions.length,
    lastSyncedAt: row.sync.last_received_at,
    mayHaveUnsyncedWork: row.sync.may_have_unsynced_work,
    acceptedEventCount: row.sync.accepted_events,
    rejectedEventCount: row.sync.rejected_events,
    noModuleResults: true,
    xp: 0,
    bestStreak: 0,
  };
}

function summaryFor(row: LearnerWire, m: ModuleWire): TrainerLearnerSummary {
  const lastActivityAt = latestActivity(m.attempts);
  return {
    learnerId: row.learner.learner_id,
    username: row.learner.username,
    learnerCode: row.learner.learner_code,
    firstName: row.learner.first_name,
    lastName: row.learner.last_name,
    moduleId: m.module_id,
    moduleTitle: m.module_name,
    completionStatus: m.completion,
    ...(m.initial === null ? {} : { initialScorePercent: m.initial.pct }),
    ...(m.best === null ? {} : { bestScorePercent: m.best.pct }),
    currentMasteryPercent: m.mastery.pct,
    questionsAnswered: m.questions_answered,
    questionsTotal: m.questions_total,
    initialMissedCount: m.initial === null ? 0 : m.initial.total - m.initial.correct,
    stillUnmasteredCount: m.mastery.total - m.mastery.correct,
    statusLabel: m.status_label,
    strugglingReasons: m.struggling_reasons,
    attemptsAbandoned: m.abandoned_total,
    activeEngagementSeconds: row.time.active_ms / 1000,
    sessionCount: row.time.sessions.length,
    lastSyncedAt: row.sync.last_received_at,
    mayHaveUnsyncedWork: row.sync.may_have_unsynced_work,
    acceptedEventCount: row.sync.accepted_events,
    rejectedEventCount: row.sync.rejected_events,
    ...(lastActivityAt === undefined ? {} : { lastActivityAt }),
    xp: 0,
    bestStreak: 0,
  };
}

/** One row per module the server reports for this learner, or one placeholder row when it reports none. */
export function toLearnerSummaries(row: LearnerWire): TrainerLearnerSummary[] {
  return row.modules.length === 0 ? [placeholderFor(row)] : row.modules.map((m) => summaryFor(row, m));
}

function toAttempt(a: AttemptWire): TrainerAttempt {
  return {
    attemptId: a.attempt_id,
    kind: a.kind,
    contentVersion: a.content_version,
    status: a.status,
    startedAt: a.started_at,
    ...(a.ended_at === undefined ? {} : { endedAt: a.ended_at }),
    ...(a.score === undefined ? {} : { scorePercent: a.score.pct }),
    ...(a.device_score === undefined ? {} : { deviceScore: { correct: a.device_score.correct, total: a.device_score.total } }),
    answers: a.answers.map((x) => ({ questionId: x.question_id, choiceId: x.choice_id, correct: x.correct })),
  };
}

/** The learner's detail on one module, or undefined when the server reports no such module for them. */
export function toModuleDetail(row: LearnerWire, moduleId: string): TrainerModuleDetail | undefined {
  const m = row.modules.find((candidate) => candidate.module_id === moduleId);
  if (!m) return undefined;
  const practice = m.attempts.filter((a) => a.kind === "practice");
  const firstStartedAt = m.attempts.reduce<string | undefined>((first, a) => (first === undefined || Date.parse(a.started_at) < Date.parse(first) ? a.started_at : first), undefined);
  return {
    ...summaryFor(row, m),
    contentVersion: m.content_version_latest,
    ...(firstStartedAt === undefined ? {} : { firstStartedAt }),
    ...(m.completed_at === null ? {} : { completedAt: m.completed_at }),
    fullAttemptCount: m.attempts.filter((a) => a.kind === "full" && a.status === "completed").length,
    remediationRoundCount: practice.length,
    remediationAttempted: practice.reduce((n, a) => n + a.answers.length, 0),
    remediationCorrected: practice.reduce((n, a) => n + a.answers.filter((x) => x.correct).length, 0),
    returnCount: Math.max(0, row.time.sessions.length - 1),
    topicPerformance: m.topics.map((t) => ({ topic: t.topic, masteredCount: t.correct, totalCount: t.answers })),
    sectorPerformance: [],
    attempts: m.attempts.map(toAttempt),
  };
}

export function toCohortSummary(w: CohortSummaryWire): ModuleCohortSummary {
  return {
    cohortId: w.cohort_id,
    moduleId: w.module_id,
    moduleTitle: w.module_name,
    learnerCount: w.learner_count,
    startedCount: w.started_count,
    completedCount: w.completed_count,
    averageInitialScorePercent: w.average_initial_score_percent,
    averageBestScorePercent: w.average_best_score_percent,
    averageMasteryPercent: w.average_mastery_percent,
    passingCount: w.passing_count,
    strugglingCount: w.struggling_count,
    notYetPassingCount: w.not_yet_passing_count,
  };
}
