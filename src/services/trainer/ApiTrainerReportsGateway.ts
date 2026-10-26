import { ApiClient } from "../api/ApiClient";
import { ApiError, isRecord } from "../api/ApiError";
import { isPlainUuid } from "../integration/wireContract";

export type PerformanceStatus = "passing" | "struggling" | "not_yet_passing" | "not_started";
/** Presentation label is centralized so stakeholder wording can change without changing codes. */
export const performanceLabels: Record<PerformanceStatus, string> = {
  passing: "Passing", struggling: "Needs support", not_yet_passing: "Not yet passing", not_started: "Not started",
};
export interface ReportModule {
  moduleId: string;
  moduleTitle: string;
  contentVersion: number;
  completionStatus: "not_started" | "in_progress" | "completed";
  performanceStatus: PerformanceStatus;
  initialScorePercent: number | null;
  bestScorePercent: number | null;
  latestScorePercent: number | null;
  currentMasteryPercent: number;
  questionsAnswered: number;
  questionsTotal: number;
}
export interface ReportLearner {
  learnerId: string;
  learnerCode: string;
  displayName: string;
  username: string | null;
  cohortId: string;
  modules: ReportModule[];
  activeEngagementSeconds: number;
  lastReceivedAt: string | null;
  acceptedEventCount: number;
  rejectedEventCount: number;
  /** A server cannot observe work that has not left the phone. Never infer "synced". */
  mayHaveUnsyncedWork: boolean;
}
export interface ReportCohortSummary {
  cohortId: string;
  moduleId: string;
  moduleTitle: string;
  learnerCount: number;
  completedCount: number;
  averageInitialScorePercent: number | null;
  averageBestScorePercent: number | null;
  averageMasteryPercent: number | null;
}
export interface TrainerReportsGateway {
  listLearners(input: { cohortId: string; moduleId?: string }): Promise<ReportLearner[]>;
  getModuleCohortSummary(input: { cohortId: string; moduleId: string }): Promise<ReportCohortSummary>;
  getLearnerReport(input: { learnerId: string; moduleId?: string }): Promise<ReportLearner>;
}

function invalid(): never { throw new ApiError("INVALID_RESPONSE"); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : invalid(); }
function text(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function numeric(value: unknown): number { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : invalid(); }
function percent(value: unknown): number { const n = numeric(value); return n <= 100 ? n : invalid(); }
function nullablePercent(value: unknown): number | null { return value === null ? null : percent(value); }
function score(value: unknown): number | null { return value === null ? null : percent(record(value).pct); }
function count(value: unknown): number { const n = numeric(value); return Number.isSafeInteger(n) ? n : invalid(); }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid(); }
function uuidInput(value: string) { if (!isPlainUuid(value)) throw new ApiError("INVALID_INPUT", 400); return encodeURIComponent(value); }
function moduleInput(value: string) { if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) throw new ApiError("INVALID_INPUT", 400); return encodeURIComponent(value); }

export function mapReportLearner(value: unknown): ReportLearner {
  const row = record(value), learner = record(row.learner), sync = record(row.sync), time = record(row.time);
  const modules = array(row.modules).map((value): ReportModule => {
    const m = record(value);
    const completion = text(m.completion);
    const status = text(m.status_label);
    if (!["not_started", "in_progress", "completed"].includes(completion) || !Object.hasOwn(performanceLabels, status)) invalid();
    const version = count(m.content_version_latest);
    if (version < 1) invalid();
    return {
      moduleId: text(m.module_id), moduleTitle: text(m.module_name), contentVersion: version,
      completionStatus: completion as ReportModule["completionStatus"], performanceStatus: status as PerformanceStatus,
      initialScorePercent: score(m.initial), bestScorePercent: score(m.best), latestScorePercent: score(m.latest),
      currentMasteryPercent: percent(record(m.mastery).pct), questionsAnswered: count(m.questions_answered), questionsTotal: count(m.questions_total),
    };
  });
  if (typeof sync.may_have_unsynced_work !== "boolean") invalid();
  return {
    learnerId: text(learner.learner_id), learnerCode: text(learner.learner_code),
    displayName: `${text(learner.first_name)} ${text(learner.last_name)}`.trim(),
    username: learner.username === null ? null : text(learner.username), cohortId: text(learner.cohort_id), modules,
    activeEngagementSeconds: numeric(time.active_ms) / 1000,
    lastReceivedAt: sync.last_received_at === null ? null : text(sync.last_received_at),
    acceptedEventCount: count(sync.accepted_events), rejectedEventCount: count(sync.rejected_events),
    mayHaveUnsyncedWork: sync.may_have_unsynced_work,
  };
}

/** Read-only staff reports adapter.
 * A separate report model avoids inventing XP, streaks, device sync status,
 * sector mastery or other fields that the server does not supply.
 */
export class ApiTrainerReportsGateway implements TrainerReportsGateway {
  constructor(private readonly api: ApiClient) {}
  async listLearners(input: { cohortId: string; moduleId?: string }): Promise<ReportLearner[]> {
    const path = `/v1/staff/cohorts/${uuidInput(input.cohortId)}/report${input.moduleId ? `?module_id=${moduleInput(input.moduleId)}` : ""}`;
    const body = record(await this.api.get(path));
    return array(body.learners).map(mapReportLearner);
  }
  async getLearnerReport(input: { learnerId: string; moduleId?: string }): Promise<ReportLearner> {
    return mapReportLearner(await this.api.get(`/v1/staff/learners/${uuidInput(input.learnerId)}/report${input.moduleId ? `?module_id=${moduleInput(input.moduleId)}` : ""}`));
  }
  async getModuleCohortSummary(input: { cohortId: string; moduleId: string }): Promise<ReportCohortSummary> {
    const body = record(await this.api.get(`/v1/staff/cohorts/${uuidInput(input.cohortId)}/modules/${moduleInput(input.moduleId)}/summary`));
    return {
      cohortId: text(body.cohort_id), moduleId: text(body.module_id), moduleTitle: text(body.module_name),
      learnerCount: count(body.learner_count), completedCount: count(body.completed_count),
      averageInitialScorePercent: nullablePercent(body.average_initial_score_percent),
      averageBestScorePercent: nullablePercent(body.average_best_score_percent),
      averageMasteryPercent: nullablePercent(body.average_mastery_percent),
    };
  }
}
