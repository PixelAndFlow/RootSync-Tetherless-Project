/**
 * Storage interface. Two implementations:
 *  - MemoryStore: tests and local demos (data is lost on restart)
 *  - PgStore: production on PostgreSQL
 * Both must give the same answers; the server tests run against either, and
 * db/*.sql encodes the same rules as constraints.
 */

import type { StoredEvent } from "../../contract/src/index.ts";
import type { TetherlessModule } from "../../content/src/index.ts";
import type { Role } from "./permissions.ts";

export interface Staff {
  staff_id: string;
  username: string;
  display_name: string;
  role: Role;
  password_hash: string;
  must_change_password: boolean;
  created_at: string;
  created_by: string | null;
  disabled_at: string | null;
}

export interface Cohort {
  cohort_id: string;
  name: string;
  created_at: string;
  created_by: string | null;
  archived_at: string | null;
}

/** Fields staff enter (spec v1.10 §9.2). Contact fields never go to a phone. */
export interface LearnerFields {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  training_level: string | null;
  note_1: string | null;
  note_2: string | null;
}

export interface Learner extends LearnerFields {
  learner_id: string;
  cohort_id: string;
  learner_code: string;
  /** Chosen by the learner at setup; null until then. Not unique. */
  username: string | null;
  created_at: string;
  created_by: string | null;
  archived_at: string | null;
}

export interface Device {
  device_id: string;
  learner_id: string;
  created_at: string;
  revoked_at: string | null;
}

export interface SetupCodeRow {
  code_hash: string;
  learner_id: string;
  created_by: string | null;
  created_at: string;
}

export interface RejectedEvent {
  event_id: string | null;
  learner_id: string;
  device_id: string;
  code: string;
  message: string;
  raw: unknown;
  raw_hash: string;
  received_at: string;
}

export type InsertResult = "inserted" | "duplicate" | "conflict";

export interface UseSetupCodeInput {
  code_hash: string;
  now: string;
  username: string;
  device: { device_id: string; token_hash: string };
}

export type UseSetupCodeResult =
  | { ok: true; learner: Learner; cohort: Cohort }
  | { ok: false; reason: "INVALID_CODE" | "CODE_USED" | "DEVICE_EXISTS" };

export interface ModuleRow {
  module_id: string;
  activity_type: string;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface ModuleVersionRow {
  module_id: string;
  content_version: number;
  body: TetherlessModule;
  published_by: string | null;
  published_at: string;
}

export interface Assignment {
  assignment_id: string;
  module_id: string;
  /** null = always the latest published version. */
  content_version: number | null;
  cohort_id: string | null;
  learner_id: string | null;
  created_by: string | null;
  created_at: string;
  removed_at: string | null;
}

export interface RosterImport {
  import_id: string;
  cohort_id: string;
  valid: boolean;
  rows: LearnerFields[];
  created_by: string | null;
  expires_at: string;
}

export interface AuditEntry {
  staff_id: string | null;
  action: string;
  target: string;
  detail: unknown;
  at: string;
}

export interface Store {
  close(): Promise<void>;

  // ---- staff
  /** false when the username is taken. */
  createStaff(s: Staff): Promise<boolean>;
  getStaff(staffId: string): Promise<Staff | undefined>;
  getStaffByUsername(username: string): Promise<Staff | undefined>;
  listStaff(): Promise<Staff[]>;
  updateStaff(staffId: string, patch: Partial<Pick<Staff, "password_hash" | "must_change_password" | "disabled_at" | "display_name">>): Promise<boolean>;
  createStaffSession(tokenHash: string, staffId: string, expiresAt: string): Promise<void>;
  /** The signed-in staff member, unless the session expired or the account is disabled. */
  getStaffSession(tokenHash: string, now: string): Promise<Staff | undefined>;
  deleteStaffSession(tokenHash: string): Promise<void>;
  deleteStaffSessions(staffId: string): Promise<void>;
  /** Role → permissions. Empty object until seeded. */
  getRolePermissions(): Promise<Partial<Record<Role, string[]>>>;
  setRolePermissions(role: Role, permissions: string[]): Promise<void>;

  // ---- settings
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting(key: string, value: unknown, staffId: string | null, now: string): Promise<void>;

  // ---- cohorts
  /** false when a cohort with the same name (ignoring letter case) exists. */
  createCohort(c: Cohort): Promise<boolean>;
  getCohort(cohortId: string): Promise<Cohort | undefined>;
  listCohorts(includeArchived: boolean): Promise<(Cohort & { learners: number })[]>;
  updateCohort(cohortId: string, patch: { name?: string; archived_at?: string }): Promise<"ok" | "name_taken" | "not_found">;

  // ---- learners
  /** false when the learner_code is taken (the caller generates another). */
  createLearner(l: Learner): Promise<boolean>;
  getLearner(learnerId: string): Promise<Learner | undefined>;
  listLearners(cohortId: string, opts?: { includeArchived?: boolean; search?: string }): Promise<Learner[]>;
  updateLearner(learnerId: string, patch: Partial<LearnerFields> & { archived_at?: string }): Promise<boolean>;
  /** Latest server receipt time per learner in a cohort. */
  lastSyncedByCohort(cohortId: string): Promise<Map<string, string>>;

  // ---- setup codes and devices
  /** Store a new code; any unused earlier code for this learner stops working. */
  addSetupCode(c: SetupCodeRow): Promise<void>;
  /** Atomically: check the code, set the username, register the device, mark the code used. */
  useSetupCode(input: UseSetupCodeInput): Promise<UseSetupCodeResult>;
  getDeviceByTokenHash(tokenHash: string): Promise<Device | undefined>;
  listDevices(learnerId: string): Promise<Device[]>;
  revokeDevice(learnerId: string, deviceId: string, now: string): Promise<boolean>;
  revokeDevicesForLearner(learnerId: string, now: string): Promise<number>;

  // ---- events
  /** Insert once by event_id. Same event_id + same content → duplicate; different content → conflict. */
  insertEvent(e: StoredEvent, contentHash: string): Promise<InsertResult>;
  /** Ignores exact repeats of the same rejected payload. */
  insertRejected(r: RejectedEvent): Promise<void>;
  listEvents(learnerId: string): Promise<StoredEvent[]>;
  listRejected(learnerId: string): Promise<RejectedEvent[]>;
  moduleHasEvents(moduleId: string): Promise<boolean>;

  // ---- content
  listModules(includeArchived: boolean): Promise<ModuleRow[]>;
  getModule(moduleId: string): Promise<ModuleRow | undefined>;
  listModuleVersions(): Promise<ModuleVersionRow[]>;
  /** Creates the module row when it doesn't exist. "version_exists" when that version is already published. */
  publishModuleVersion(module: ModuleRow, version: ModuleVersionRow): Promise<"ok" | "version_exists">;
  archiveModule(moduleId: string, now: string): Promise<boolean>;
  /** Permanent. Callers check the module was never used. */
  deleteModule(moduleId: string): Promise<boolean>;

  // ---- assignments
  createAssignment(a: Assignment): Promise<void>;
  getAssignment(assignmentId: string): Promise<Assignment | undefined>;
  /** Active cohort-level assignments plus active assignments to learners in the cohort. */
  listAssignmentsForCohort(cohortId: string): Promise<Assignment[]>;
  /** Active assignments that apply to this learner (theirs or their cohort's). */
  listAssignmentsForLearner(learnerId: string, cohortId: string): Promise<Assignment[]>;
  removeAssignment(assignmentId: string, now: string): Promise<boolean>;
  moduleHasAssignments(moduleId: string): Promise<boolean>;

  // ---- roster imports
  saveRosterImport(r: RosterImport): Promise<void>;
  getRosterImport(importId: string, now: string): Promise<RosterImport | undefined>;
  deleteRosterImport(importId: string): Promise<void>;

  // ---- privacy and audit
  /** Permanently delete one learner and everything tied to them. Bypasses the append-only rule for this one purpose. */
  purgeLearner(learnerId: string): Promise<boolean>;
  addAudit(e: AuditEntry): Promise<void>;
}
