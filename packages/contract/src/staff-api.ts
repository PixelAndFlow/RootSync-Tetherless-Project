/**
 * Shared types for the /v1/staff/* responses that staff screens read:
 * cohorts, learners, modules, assignments, staff accounts, and the report
 * rows those feed. One name per concept, taken as-is from
 * packages/server/src/staff-routes.ts and learners.ts as they stand today —
 * nothing here is aspirational or renamed for display. "Student" stays
 * display text in the app; the code name is `learner` everywhere, matching
 * the server, the database and the API.
 *
 * See Tetherless_Contract_Drift_and_Naming_Proposal_v1.00_2026-10-25.md for
 * why this file exists and the rule it follows.
 *
 * This package has no dependencies (packages/server, packages/analytics and
 * packages/content all import FROM here). Two of the types below —
 * ReportModuleResult and ReportActiveTime — mirror shapes that actually live
 * in packages/analytics/src/scoring.ts and active-time.ts. They're
 * redeclared here rather than imported, to keep that one-way dependency
 * direction intact; if either shape changes on the analytics side, this
 * file needs the matching edit by hand.
 */

// ---------------------------------------------------------------- roles

/**
 * Mirrors packages/server/src/permissions.ts ROLES. Duplicated rather than
 * imported, for the same dependency-direction reason as above.
 */
export type StaffRole = "superadmin" | "admin" | "trainer";

// ---------------------------------------------------------------- staff accounts

/** GET/POST /v1/staff/accounts, POST .../disable|enable, and (with `permissions`) POST /v1/staff/login and GET /v1/staff/me. */
export interface StaffAccount {
  staff_id: string;
  username: string;
  display_name: string;
  role: StaffRole;
  must_change_password: boolean;
  disabled: boolean;
  created_at: string;
  created_by: string | null;
  /** Only sent on /v1/staff/login and /v1/staff/me — the signed-in staff member's own permissions. */
  permissions?: string[];
}

// ---------------------------------------------------------------- cohorts

/** GET/POST /v1/staff/cohorts, PATCH .../:id, and the `cohort` field of the report/export responses. */
export interface Cohort {
  cohort_id: string;
  name: string;
  /** Sent on list, create and report responses; always 0 right after create. */
  learner_count?: number;
  created_at: string;
  created_by: string | null;
  archived: boolean;
}

// ---------------------------------------------------------------- learners

/** The four states a learner's device access can be in (learners.ts learnerStatus()). No "draft"/"published" — that's a module concept, not a learner one. */
export type LearnerStatus = "awaiting_setup" | "active" | "phone_switched_off" | "archived";

export interface LearnerDevice {
  device_id: string;
  set_up_at: string;
  switched_off_at: string | null;
}

/** GET/POST /v1/staff/learners, GET/PATCH .../:id, and the roster-import commit response. */
export interface LearnerRecord {
  learner_id: string;
  learner_code: string;
  cohort_id: string;
  /** Sent on GET .../learners/:id and the export; not on the list (the list is already scoped to one cohort). */
  cohort_name?: string;
  first_name: string;
  last_name: string;
  /** Chosen by the learner at setup; null until then. Not unique. */
  username: string | null;
  phone: string | null;
  email: string | null;
  training_level: string | null;
  note_1: string | null;
  note_2: string | null;
  status: LearnerStatus;
  created_at: string;
  archived_at: string | null;
  /** Sent on the list; omitted wherever full `devices` is sent instead. */
  last_synced_at?: string | null;
  /** Sent on GET/PATCH .../learners/:id and the export. */
  devices?: LearnerDevice[];
}

// ---------------------------------------------------------------- modules

/** GET /v1/staff/modules row. No draft/published distinction — "published" means a version exists; archived is separate and independent of version history. */
export interface ModuleListing {
  module_id: string;
  module_name: string;
  /** Localized, not a plain string. Null only if somehow no version has ever been published. */
  title: { en: string; es?: string } | null;
  level: string | null;
  note: string | null;
  activity_type: string;
  latest_version: number | null;
  versions: number[];
  question_count: number;
  used: boolean;
  archived: boolean;
  created_by: string | null;
  created_at: string;
}

/** POST /v1/staff/modules/check. */
export interface ModuleCheck {
  valid: boolean;
  will_be: "new_module" | "new_version" | "blocked";
  summary: {
    module_id: string | null;
    module_name: string | null;
    content_version: number | null;
    level: string | null;
    activity_type: string;
    question_count: number;
  };
  errors: StaffErrorDetail[];
  warnings: StaffErrorDetail[];
}

/** POST /v1/staff/modules success response. */
export interface ModulePublishResult {
  module_id: string;
  content_version: number;
  published_at: string;
  warnings: StaffErrorDetail[];
}

// ---------------------------------------------------------------- assignments

/** GET/POST /v1/staff/assignments and the export. */
export interface Assignment {
  assignment_id: string;
  module_id: string;
  module_name: string;
  /** null = always the latest published version. */
  content_version: number | null;
  target: "cohort" | "learner";
  cohort_id: string | null;
  learner_id: string | null;
  created_at: string;
  created_by: string | null;
}

// ---------------------------------------------------------------- reports

/** GET/PUT /v1/staff/settings/thresholds, and echoed on both report routes. */
export interface ReportThresholds {
  pass_pct: number;
  struggling_pct: number;
  weak_topic_pct: number;
  weak_topic_min_answers: number;
}

/** Echoed on both report routes as `active_time`. */
export interface ReportActiveTimeOptions {
  idleLimitMs: number;
  maxSilenceMs: number;
}

export interface ReportScore {
  correct: number;
  total: number;
  /** Rounded to one decimal place. */
  pct: number;
}

export interface ReportAnswerRecord {
  question_id: string;
  choice_id: string | null;
  correct: boolean;
  event_id: string;
}

export interface ReportAttemptSummary {
  attempt_id: string;
  kind: "full" | "practice" | "boss" | "review";
  content_version: number;
  mission_id?: string;
  status: "completed" | "abandoned" | "in_progress";
  started_at: string;
  ended_at?: string;
  answers: ReportAnswerRecord[];
  /** Full attempts only, once completed. */
  score?: ReportScore;
  /** What the phone showed, for comparison only — never used for scoring. */
  device_score?: { correct: number; total: number };
  missing_start?: true;
}

export interface ReportTopicResult {
  topic: string;
  answers: number;
  correct: number;
  pct: number;
  weak: boolean;
}

export type ReportStatusLabel = "not_started" | "passing" | "struggling" | "not_yet_passing";

/** One module's row inside a learner report. Mirrors analytics' ModuleResult plus the two fields staff-routes.ts adds (module_name, status_label). */
export interface ReportModuleResult {
  module_id: string;
  module_name: string;
  status_label: ReportStatusLabel;
  content_version_latest: number;
  questions_total: number;
  questions_answered: number;
  completion: "not_started" | "in_progress" | "completed";
  completed_at: string | null;
  initial: ReportScore | null;
  best: ReportScore | null;
  latest: ReportScore | null;
  first_try: ReportScore | null;
  mastery: ReportScore;
  abandoned_before_first_completion: number;
  abandoned_total: number;
  passed: boolean | null;
  struggling: boolean;
  struggling_reasons: string[];
  topics: ReportTopicResult[];
  bosses_completed: string[];
  attempts: ReportAttemptSummary[];
}

export interface ReportTimeFlag {
  session_id: string;
  kind: "no_signal" | "idle";
  at_ms: number;
  gap_ms: number;
}

export interface ReportSessionTime {
  session_id: string;
  started_at: string;
  active_ms: number;
  elapsed_ms: number;
}

/** Mirrors analytics' ActiveTimeResult. Sent as `time` on a learner report row. */
export interface ReportActiveTime {
  active_ms: number;
  elapsed_ms: number;
  sessions: ReportSessionTime[];
  flags: ReportTimeFlag[];
  options: ReportActiveTimeOptions;
}

export interface ReportSeqGap {
  device_id: string;
  after_seq: number;
  before_seq: number;
  missing: number;
}

export interface ReportSyncSummary {
  accepted_events: number;
  last_received_at: string | null;
  rejected_events: number;
  seq_gaps: ReportSeqGap[];
  /** The server can't see a phone's unsent work; always true here (staff-routes.ts learnerRow). */
  may_have_unsynced_work: true;
}

/** One learner's row, as it appears inside GET /v1/staff/cohorts/:id/report. */
export interface LearnerReportRow {
  learner: {
    learner_id: string;
    learner_code: string;
    first_name: string;
    last_name: string;
    username: string | null;
    cohort_id: string;
    archived: boolean;
  };
  modules: ReportModuleResult[];
  time: ReportActiveTime;
  sync: ReportSyncSummary;
}

/** GET /v1/staff/cohorts/:id/report. */
export interface CohortReport {
  cohort: Cohort;
  generated_at: string;
  thresholds: ReportThresholds;
  active_time: ReportActiveTimeOptions;
  module_ids: string[];
  learners: LearnerReportRow[];
}

/** GET /v1/staff/learners/:id/report. */
export interface LearnerReport extends LearnerReportRow {
  generated_at: string;
  thresholds: ReportThresholds;
  active_time: ReportActiveTimeOptions;
}

/** GET /v1/staff/cohorts/:id/modules/:moduleId/summary. */
export interface CohortModuleSummary {
  cohort_id: string;
  module_id: string;
  module_name: string;
  generated_at: string;
  learner_count: number;
  started_count: number;
  completed_count: number;
  average_initial_score_percent: number | null;
  average_best_score_percent: number | null;
  average_mastery_percent: number | null;
  passing_count: number;
  struggling_count: number;
  not_yet_passing_count: number;
}

// ---------------------------------------------------------------- errors

/** Every /v1/* error response, staff routes included (http.ts send()). */
export interface StaffErrorDetail {
  row?: number;
  field?: string;
  code: string;
  message: string;
}

export interface StaffErrorResponse {
  error: {
    code: string;
    message: string;
    request_id: string;
    retryable: boolean;
    details: StaffErrorDetail[];
  };
}
