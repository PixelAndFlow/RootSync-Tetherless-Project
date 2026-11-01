import type { TetherlessModule } from "../../../packages/content/src/tetherless-module";
import type { Assignment, Cohort, LearnerFieldChanges, LearnerRecord, ModuleCheckResult, ModuleListing, ModulePublishResult, SetupCodeReveal, StaffAccountReveal, StaffAccountSummary, StaffPermissionKey, StaffRole, StaffSession, Thresholds } from "../../types/staff";

/** Frontend boundary for Marc's StaffAdminGateway. The mock is intentional until API wiring is approved. */
export interface StaffAdminGateway {
  login(input: { username: string; password: string }): Promise<StaffSession>;
  logout(): void;
  /** Re-reads the current session from the server (spec v1.30 §10's `me`). Useful after another tab or device changes something about this account. */
  me(): Promise<StaffSession>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession>;
  listCohorts(): Promise<Cohort[]>;
  /** Issue #38. Name must be unique among cohorts (COHORT_NAME_TAKEN otherwise). */
  createCohort(name: string): Promise<Cohort>;
  renameCohort(cohortId: string, name: string): Promise<Cohort>;
  archiveCohort(cohortId: string): Promise<void>;
  listLearnerRecords(input: { cohortId?: string }): Promise<LearnerRecord[]>;
  createLearner(input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal>;
  /** Issue #39. Includes `devices`, unlike listLearnerRecords. */
  getLearnerRecord(learnerId: string): Promise<LearnerRecord>;
  /** Only the fields present in `changes` are validated and updated. cohortId/learnerCode/username can't be changed here (read-only server-side). */
  updateLearner(learnerId: string, changes: LearnerFieldChanges): Promise<LearnerRecord>;
  archiveLearner(learnerId: string): Promise<void>;
  /** switchOffExistingPhones requires device.revoke in addition to learner.setup_code. */
  issueSetupCode(learnerId: string, switchOffExistingPhones: boolean): Promise<{ setupCode: string; phonesSwitchedOff: number }>;
  switchOffPhone(learnerId: string, deviceId: string): Promise<void>;
  /** Superadmin-only (data.purge). confirmLearnerCode must equal the learner's own learnerCode, checked server-side (CONFIRMATION_REQUIRED otherwise) — build a type-the-code-back UI, not a plain confirm dialog. */
  purgeLearner(learnerId: string, confirmLearnerCode: string): Promise<{ eventsDeleted: number }>;
  listModules(): Promise<ModuleListing[]>;
  /** Validates module JSON without publishing it. Does not require the module to already exist. */
  checkModule(json: unknown): Promise<ModuleCheckResult>;
  /** Publishes a new module or a new version of an existing one. Call checkModule first. */
  publishModule(json: unknown): Promise<ModulePublishResult>;
  /** Issue #40. Read-only: the full published JSON for one version, e.g. to review before archiving or republishing. */
  getModuleVersion(moduleId: string, contentVersion: number): Promise<TetherlessModule>;
  /** Archiving is unconditional, even for an in-use module (only purge checks usage). */
  archiveModule(moduleId: string): Promise<void>;
  /** Superadmin-only (data.purge). Blocked with IN_USE if the module has events or assignments — archive it instead. */
  purgeModule(moduleId: string): Promise<void>;
  listAssignments(cohortId: string): Promise<Assignment[]>;
  /** Exactly one of cohortId/learnerId. Omit contentVersion to always track the latest published version. */
  assign(input: { moduleId: string; contentVersion?: number | null; cohortId?: string; learnerId?: string }): Promise<Assignment>;
  unassign(assignmentId: string): Promise<void>;
  listStaff(): Promise<StaffAccountSummary[]>;
  createStaff(input: { role: StaffRole; username: string; displayName: string }): Promise<StaffAccountReveal>;
  resetStaffAccountPassword(staffId: string): Promise<StaffAccountReveal>;
  /** Issue #41. Gated server-side by permissionToManage(target.role). Blocked with LOCKOUT_PREVENTED when disabling your own account, or the last active Superadmin. */
  setStaffDisabled(staffId: string, disabled: boolean): Promise<void>;
  /** Issue #41. Superadmin-only (permissions.manage). */
  getRolePermissions(): Promise<{ roles: Record<StaffRole, StaffPermissionKey[]>; permissions: StaffPermissionKey[] }>;
  /** Superadmin-only (permissions.manage). Blocked with LOCKOUT_PREVENTED if it would drop permissions.manage from the superadmin role itself. */
  setRolePermissions(role: StaffRole, permissions: StaffPermissionKey[]): Promise<void>;
  getThresholds(): Promise<Thresholds>;
  /** Superadmin-only (settings.manage). Rejected with VALIDATION_FAILED if strugglingPct would exceed passPct. */
  setThresholds(t: Thresholds): Promise<Thresholds>;
  /** Issue #41 (results.export). Full cohort export as a downloadable file. */
  exportCohort(cohortId: string): Promise<Blob>;
}
