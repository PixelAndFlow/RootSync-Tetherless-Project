import type {
  Cohort as CohortWire,
  LearnerRecord as LearnerRecordWire,
  LearnerDevice as LearnerDeviceWire,
  ModuleListing as ModuleListingWire,
  ModuleCheck as ModuleCheckWire,
  ModulePublishResult as ModulePublishResultWire,
  Assignment as AssignmentWire,
  StaffErrorDetail as StaffErrorDetailWire,
  ReportThresholds as ThresholdsWire,
  RosterCheck as RosterCheckWire,
  RosterCommitResult as RosterCommitResultWire,
  RosterPreviewRow as RosterPreviewRowWire,
} from "../../../packages/contract/src/staff-api";
import type { Cohort, LearnerRecord, LearnerDevice, ModuleListing, ModuleCheckIssue, ModuleCheckResult, ModulePublishResult, Assignment, Thresholds, RosterCheckResult, RosterCommitResult, RosterPreviewRow } from "../../types/staff";

/**
 * Wire (snake_case, packages/contract) to app (camelCase) translation, in one place.
 * Each function takes the contract's own type, so renaming or removing a wire field
 * fails the build here and nowhere else. Optional wire fields stay absent when absent.
 */
export function toCohort(wire: CohortWire): Cohort {
  return {
    cohortId: wire.cohort_id,
    name: wire.name,
    createdAt: wire.created_at,
    createdBy: wire.created_by,
    archived: wire.archived,
    ...(wire.learner_count === undefined ? {} : { learnerCount: wire.learner_count }),
  };
}

function toLearnerDevice(wire: LearnerDeviceWire): LearnerDevice {
  return { deviceId: wire.device_id, setUpAt: wire.set_up_at, switchedOffAt: wire.switched_off_at };
}

export function toLearnerRecord(wire: LearnerRecordWire): LearnerRecord {
  return {
    learnerId: wire.learner_id,
    learnerCode: wire.learner_code,
    cohortId: wire.cohort_id,
    firstName: wire.first_name,
    lastName: wire.last_name,
    username: wire.username,
    phone: wire.phone,
    email: wire.email,
    trainingLevel: wire.training_level,
    note1: wire.note_1,
    note2: wire.note_2,
    status: wire.status,
    createdAt: wire.created_at,
    archivedAt: wire.archived_at,
    ...(wire.cohort_name === undefined ? {} : { cohortName: wire.cohort_name }),
    ...(wire.last_synced_at === undefined ? {} : { lastSyncedAt: wire.last_synced_at }),
    ...(wire.devices === undefined ? {} : { devices: wire.devices.map(toLearnerDevice) }),
  };
}

export function toModuleListing(wire: ModuleListingWire): ModuleListing {
  return {
    moduleId: wire.module_id,
    moduleName: wire.module_name,
    title: wire.title,
    level: wire.level,
    note: wire.note,
    activityType: wire.activity_type,
    latestVersion: wire.latest_version,
    versions: wire.versions,
    questionCount: wire.question_count,
    used: wire.used,
    archived: wire.archived,
    createdBy: wire.created_by,
    createdAt: wire.created_at,
  };
}

function toIssue(wire: StaffErrorDetailWire): ModuleCheckIssue {
  return { ...(wire.row === undefined ? {} : { row: wire.row }), ...(wire.field === undefined ? {} : { field: wire.field }), code: wire.code, message: wire.message };
}

export function toModuleCheck(wire: ModuleCheckWire): ModuleCheckResult {
  return {
    valid: wire.valid,
    willBe: wire.will_be,
    summary: {
      moduleId: wire.summary.module_id,
      moduleName: wire.summary.module_name,
      contentVersion: wire.summary.content_version,
      level: wire.summary.level,
      activityType: wire.summary.activity_type,
      questionCount: wire.summary.question_count,
    },
    errors: wire.errors.map(toIssue),
    warnings: wire.warnings.map(toIssue),
  };
}

export function toModulePublishResult(wire: ModulePublishResultWire): ModulePublishResult {
  return { moduleId: wire.module_id, contentVersion: wire.content_version, publishedAt: wire.published_at, warnings: wire.warnings.map(toIssue) };
}

function toRosterPreviewRow(wire: RosterPreviewRowWire): RosterPreviewRow {
  return { firstName: wire.first_name, lastName: wire.last_name, phone: wire.phone, email: wire.email, trainingLevel: wire.training_level, note1: wire.note_1, note2: wire.note_2 };
}

export function toRosterCheck(wire: RosterCheckWire): RosterCheckResult {
  return {
    importId: wire.import_id,
    cohortId: wire.cohort_id,
    valid: wire.valid,
    rowsTotal: wire.rows_total,
    rowsOk: wire.rows_ok,
    errors: wire.errors.map(toIssue),
    warnings: wire.warnings.map(toIssue),
    preview: wire.preview.map(toRosterPreviewRow),
  };
}

export function toRosterCommit(wire: RosterCommitResultWire): RosterCommitResult {
  return {
    created: wire.created,
    learners: wire.learners.map((l) => ({ learnerId: l.learner_id, learnerCode: l.learner_code, firstName: l.first_name, lastName: l.last_name, setupCode: l.setup_code })),
  };
}

export function toThresholds(wire: ThresholdsWire): Thresholds {
  return { passPct: wire.pass_pct, strugglingPct: wire.struggling_pct, weakTopicPct: wire.weak_topic_pct, weakTopicMinAnswers: wire.weak_topic_min_answers };
}

export function fromThresholds(t: Thresholds): ThresholdsWire {
  return { pass_pct: t.passPct, struggling_pct: t.strugglingPct, weak_topic_pct: t.weakTopicPct, weak_topic_min_answers: t.weakTopicMinAnswers };
}

export function toAssignment(wire: AssignmentWire): Assignment {
  return {
    assignmentId: wire.assignment_id,
    moduleId: wire.module_id,
    moduleName: wire.module_name,
    contentVersion: wire.content_version,
    target: wire.target,
    cohortId: wire.cohort_id,
    learnerId: wire.learner_id,
    createdAt: wire.created_at,
    createdBy: wire.created_by,
  };
}
