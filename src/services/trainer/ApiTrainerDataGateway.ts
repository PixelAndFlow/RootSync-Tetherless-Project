import { ApiClient } from "../api/ApiClient";
import { ApiError, isRecord } from "../api/ApiError";
import { isPlainUuid } from "../integration/wireContract";
import type { ModuleCohortSummary, TrainerLearnerSummary, TrainerModuleDetail } from "../../types/trainer";
import type { TrainerDataGateway } from "./TrainerDataGateway";
import {
  toCohortSummary,
  toLearnerSummaries,
  toModuleDetail,
  type AttemptWire,
  type CohortSummaryWire,
  type LearnerWire,
  type ModuleWire,
} from "./trainerMappers";

const STATUS_LABELS = ["not_started", "passing", "struggling", "not_yet_passing"] as const;
const COMPLETION = ["not_started", "in_progress", "completed"] as const;
const ATTEMPT_KINDS = ["full", "practice", "boss", "review"] as const;
const ATTEMPT_STATUSES = ["completed", "abandoned", "in_progress"] as const;

function invalid(): never { throw new ApiError("INVALID_RESPONSE"); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : invalid(); }
function text(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function numeric(value: unknown): number { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : invalid(); }
function percent(value: unknown): number { const n = numeric(value); return n <= 100 ? n : invalid(); }
function nullablePercent(value: unknown): number | null { return value === null ? null : percent(value); }
function count(value: unknown): number { const n = numeric(value); return Number.isSafeInteger(n) ? n : invalid(); }
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid(); }
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T { const v = text(value); return (allowed as readonly string[]).includes(v) ? (v as T) : invalid(); }
function score(value: unknown) { const s = record(value); return { correct: count(s.correct), total: count(s.total), pct: percent(s.pct) }; }
function nullableScore(value: unknown) { return value === null ? null : score(value); }
function uuidInput(value: string) { if (!isPlainUuid(value)) throw new ApiError("INVALID_INPUT", 400); return encodeURIComponent(value); }
function moduleInput(value: string) { if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) throw new ApiError("INVALID_INPUT", 400); return encodeURIComponent(value); }

function parseAttempt(value: unknown): AttemptWire {
  const a = record(value);
  return {
    attempt_id: text(a.attempt_id),
    kind: oneOf(a.kind, ATTEMPT_KINDS),
    content_version: count(a.content_version),
    status: oneOf(a.status, ATTEMPT_STATUSES),
    started_at: text(a.started_at),
    ...(a.ended_at === undefined ? {} : { ended_at: text(a.ended_at) }),
    ...(a.score === undefined ? {} : { score: score(a.score) }),
    ...(a.device_score === undefined ? {} : { device_score: { correct: count(record(a.device_score).correct), total: count(record(a.device_score).total) } }),
    answers: array(a.answers).map((x) => { const r = record(x); return { question_id: text(r.question_id), choice_id: nullableText(r.choice_id), correct: bool(r.correct) }; }),
  };
}

function parseModule(value: unknown): ModuleWire {
  const m = record(value);
  const version = count(m.content_version_latest);
  if (version < 1) invalid();
  return {
    module_id: text(m.module_id),
    module_name: text(m.module_name),
    status_label: oneOf(m.status_label, STATUS_LABELS),
    content_version_latest: version,
    questions_total: count(m.questions_total),
    questions_answered: count(m.questions_answered),
    completion: oneOf(m.completion, COMPLETION),
    completed_at: nullableText(m.completed_at),
    initial: nullableScore(m.initial),
    best: nullableScore(m.best),
    mastery: score(m.mastery),
    abandoned_total: count(m.abandoned_total),
    struggling_reasons: array(m.struggling_reasons).map(text),
    topics: array(m.topics).map((x) => { const t = record(x); return { topic: text(t.topic), answers: count(t.answers), correct: count(t.correct) }; }),
    attempts: array(m.attempts).map(parseAttempt),
  };
}

/** Exported for tests: validates one learner's report row from the server. */
export function parseLearnerRow(value: unknown): LearnerWire {
  const row = record(value), learner = record(row.learner), sync = record(row.sync), time = record(row.time);
  return {
    learner: {
      learner_id: text(learner.learner_id), learner_code: text(learner.learner_code),
      first_name: text(learner.first_name), last_name: text(learner.last_name),
      username: nullableText(learner.username),
    },
    modules: array(row.modules).map(parseModule),
    time: { active_ms: numeric(time.active_ms), sessions: array(time.sessions).map((x) => ({ session_id: text(record(x).session_id) })) },
    sync: {
      last_received_at: nullableText(sync.last_received_at),
      accepted_events: count(sync.accepted_events),
      rejected_events: count(sync.rejected_events),
      may_have_unsynced_work: bool(sync.may_have_unsynced_work),
    },
  };
}

function parseCohortSummary(value: unknown): CohortSummaryWire {
  const b = record(value);
  return {
    cohort_id: text(b.cohort_id), module_id: text(b.module_id), module_name: text(b.module_name),
    learner_count: count(b.learner_count), started_count: count(b.started_count), completed_count: count(b.completed_count),
    average_initial_score_percent: nullablePercent(b.average_initial_score_percent),
    average_best_score_percent: nullablePercent(b.average_best_score_percent),
    average_mastery_percent: nullablePercent(b.average_mastery_percent),
    passing_count: count(b.passing_count), struggling_count: count(b.struggling_count), not_yet_passing_count: count(b.not_yet_passing_count),
  };
}

/** Read-only trainer dashboard adapter over the server's report routes (API Spec v1.30 section 9). */
export class ApiTrainerDataGateway implements TrainerDataGateway {
  constructor(private readonly api: ApiClient) {}

  async listLearners(input: { cohortId: string; moduleId?: string }): Promise<TrainerLearnerSummary[]> {
    const path = `/v1/staff/cohorts/${uuidInput(input.cohortId)}/report${input.moduleId ? `?module_id=${moduleInput(input.moduleId)}` : ""}`;
    const body = record(await this.api.get(path));
    return array(body.learners).map(parseLearnerRow).flatMap(toLearnerSummaries);
  }

  async getLearnerModuleDetail(learnerId: string, moduleId: string): Promise<TrainerModuleDetail> {
    const row = parseLearnerRow(await this.api.get(`/v1/staff/learners/${uuidInput(learnerId)}/report?module_id=${moduleInput(moduleId)}`));
    const detail = toModuleDetail(row, moduleId);
    if (!detail) throw new ApiError("NOT_FOUND", 404);
    return detail;
  }

  async getModuleCohortSummary(input: { cohortId: string; moduleId: string }): Promise<ModuleCohortSummary> {
    return toCohortSummary(parseCohortSummary(await this.api.get(`/v1/staff/cohorts/${uuidInput(input.cohortId)}/modules/${moduleInput(input.moduleId)}/summary`)));
  }
}
