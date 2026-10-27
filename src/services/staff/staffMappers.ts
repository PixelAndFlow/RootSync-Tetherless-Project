import type {
  Cohort as CohortWire,
  LearnerRecord as LearnerRecordWire,
  ModuleListing as ModuleListingWire,
} from "../../../packages/contract/src/staff-api";
import type { Cohort, LearnerRecord, ModuleListing } from "../../types/staff";

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
