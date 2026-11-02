import { ApiError, isRecord } from "../api/ApiError";
import type { Issue } from "../../../packages/content/src/issues";
import { checkNewVersion, validateTetherlessModule, type TetherlessModule } from "../../../packages/content/src/tetherless-module";
import { DEFAULT_ROLE_PERMISSIONS, DEFAULT_THRESHOLDS, STAFF_PERMISSIONS, STAFF_ROLES, type Assignment, type Cohort, type LearnerDevice, type LearnerFieldChanges, type LearnerRecord, type ModuleCheckResult, type ModuleListing, type ModulePublishResult, type SetupCodeReveal, type StaffAccountReveal, type StaffAccountSummary, type StaffPermissionKey, type StaffRole, type StaffSession, type Thresholds } from "../../types/staff";
import { STAFF_USERNAME_PATTERN } from "./username";
import type { StaffAdminGateway } from "./StaffAdminGateway";

/** Same shape the server's issueDetails() produces, used by the real validator's Issue[]. */
function toIssues(issues: Issue[]): ModuleCheckResult["errors"] {
  return issues.map((i) => ({ ...(i.location?.row !== undefined ? { row: i.location.row } : {}), ...(i.location?.field ? { field: i.location.field } : {}), code: i.code, message: i.message }));
}

const cohorts: Cohort[] = [
  { cohortId: "cohort-demo-001", name: "RCYC-PR-Bootcamp2026", learnerCount: 3, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "superadmin-demo-001", archived: false },
  { cohortId: "cohort-demo-002", name: "Cyber Foundations", learnerCount: 2, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "superadmin-demo-001", archived: false },
];
const students: LearnerRecord[] = [
  { learnerId: "student-demo-001", learnerCode: "RCYC-PR-Bootcamp2026-0001", cohortId: "cohort-demo-001", firstName: "Alex", lastName: "Rivera", username: "alex.r", phone: null, email: null, trainingLevel: null, note1: null, note2: null, status: "active", createdAt: "2026-01-01T00:00:00.000Z", archivedAt: null },
  { learnerId: "student-demo-002", learnerCode: "RCYC-PR-Bootcamp2026-0002", cohortId: "cohort-demo-001", firstName: "Jordan", lastName: "Lee", username: "jordan.l", phone: null, email: null, trainingLevel: null, note1: null, note2: null, status: "active", createdAt: "2026-01-01T00:00:00.000Z", archivedAt: null },
  { learnerId: "student-demo-003", learnerCode: "RCYC-PR-Bootcamp2026-0003", cohortId: "cohort-demo-001", firstName: "Sam", lastName: "Ortiz", username: null, phone: null, email: null, trainingLevel: null, note1: null, note2: null, status: "awaiting_setup", createdAt: "2026-01-01T00:00:00.000Z", archivedAt: null },
];
const modules: ModuleListing[] = [
  { moduleId: "rcyc-recruit-cyber-squad-gamified-001", moduleName: "Operation Cyber Squad", title: { en: "Operation Cyber Squad" }, level: "beginner", note: null, activityType: "multiple_choice", latestVersion: 1, versions: [1], questionCount: 10, used: false, archived: false, createdBy: "superadmin-demo-001", createdAt: "2026-01-01T00:00:00.000Z" },
];
const assignments: Assignment[] = [];
/**
 * Full body of each module's latest published version, for checkNewVersion()
 * — ModuleListing only tracks summary fields. Unlike the real server (which
 * keeps every version's body via content.body(id, version)), this mock keeps
 * only the latest, so getModuleVersion() here can only serve the latest
 * version — an accepted demo-mode gap, not a bug to fix.
 */
const moduleBodies = new Map<string, TetherlessModule>();
/** Demo-only: a device per already-"active" demo student, so switchOffPhone has something to act on. */
const learnerDevices = new Map<string, LearnerDevice[]>([
  ["student-demo-001", [{ deviceId: "device-demo-001", setUpAt: "2026-01-02T00:00:00.000Z", switchedOffAt: null }]],
  ["student-demo-002", [{ deviceId: "device-demo-002", setUpAt: "2026-01-02T00:00:00.000Z", switchedOffAt: null }]],
]);

/** Mirrors packages/server/src/learners.ts's checkLearnerFields rules, for updateLearner's VALIDATION_FAILED details. */
const LEARNER_FIELD_LIMITS = { firstName: 80, lastName: 80, phone: 32, email: 254, trainingLevel: 40, note1: 1000, note2: 1000 } as const;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PHONE_PATTERN = /^[0-9+().\-\s]{3,32}$/;
function validateLearnerChanges(changes: LearnerFieldChanges): { value: Partial<LearnerRecord>; details: { field: string; message: string }[] } {
  const details: { field: string; message: string }[] = [];
  const value: Partial<LearnerRecord> = {};
  for (const field of Object.keys(changes) as (keyof LearnerFieldChanges)[]) {
    const raw = changes[field];
    if (raw === undefined) continue;
    const required = field === "firstName" || field === "lastName";
    if (raw === null) {
      if (required) details.push({ field, message: `${field === "firstName" ? "First" : "Last"} name is missing.` });
      else (value as Record<string, unknown>)[field] = null;
      continue;
    }
    const s = raw.trim();
    if (!s) { if (required) details.push({ field, message: `${field === "firstName" ? "First" : "Last"} name is missing.` }); else (value as Record<string, unknown>)[field] = null; continue; }
    if (s.length > LEARNER_FIELD_LIMITS[field]) { details.push({ field, message: `${field} is longer than ${LEARNER_FIELD_LIMITS[field]} characters.` }); continue; }
    if (/[<>]/.test(s) && field !== "note1" && field !== "note2") { details.push({ field, message: `${field} can't contain < or >.` }); continue; }
    if (field === "email" && !EMAIL_PATTERN.test(s)) { details.push({ field, message: "This doesn't look like an email address." }); continue; }
    if (field === "phone" && !PHONE_PATTERN.test(s)) { details.push({ field, message: "Phone numbers can contain digits, spaces and + ( ) . - only." }); continue; }
    (value as Record<string, unknown>)[field] = s;
  }
  return { value, details };
}
const accounts: StaffAccountSummary[] = [
  { staffId: "superadmin-demo-001", username: "demo", displayName: "Demo SuperAdmin", role: "superadmin", disabled: false, createdAt: "2026-01-01T00:00:00.000Z" },
  { staffId: "admin-demo-001", username: "admin", displayName: "Demo Admin", role: "admin", disabled: false, createdAt: "2026-01-01T00:00:00.000Z" },
  { staffId: "trainer-demo-001", username: "trainer", displayName: "Demo Trainer", role: "trainer", disabled: false, createdAt: "2026-01-01T00:00:00.000Z" },
];
/** Issue #41: mutable so getRolePermissions/setRolePermissions have somewhere to read/write. */
const rolePermissions: Record<StaffRole, StaffPermissionKey[]> = structuredClone(DEFAULT_ROLE_PERMISSIONS);
let thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };

/**
 * Demo-only staff adapter. It never calls the API, issues real codes, or persists credentials.
 * Accounts: demo / demo-password-123 (SuperAdmin), admin / demo-password-123, trainer / demo-password-123.
 */
export class MockStaffAdminGateway implements StaffAdminGateway {
  /** No real token in demo mode — this is just enough state for me() to echo back whoever last signed in/changed their password. */
  private currentSession: StaffSession | null = null;

  logout(): void { this.currentSession = null; }
  async login(input: { username: string; password: string }): Promise<StaffSession> {
    if (input.password !== "demo-password-123") throw new ApiError("UNAUTHORIZED", 401);
    const roleByUsername: Record<string, StaffRole> = { demo: "superadmin", admin: "admin", trainer: "trainer" };
    const role = roleByUsername[input.username.trim().toLowerCase()];
    if (!role) throw new ApiError("UNAUTHORIZED", 401);
    const session: StaffSession = {
      staffId: `${role}-demo-001`, username: input.username.trim(),
      displayName: role === "superadmin" ? "Demo SuperAdmin" : role === "admin" ? "Demo Admin" : "Demo Trainer",
      role, permissions: DEFAULT_ROLE_PERMISSIONS[role], passwordChangeRequired: input.username.trim().toLowerCase() === "admin",
    };
    this.currentSession = session;
    return session;
  }

  async me(): Promise<StaffSession> {
    if (!this.currentSession) throw new ApiError("UNAUTHORIZED", 401);
    return this.currentSession;
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession> {
    if (input.currentPassword !== "demo-password-123" || input.newPassword.length < 12) throw new ApiError("INVALID_INPUT", 422);
    const session: StaffSession = { staffId: "admin-demo-001", username: "admin", displayName: "Demo Admin", role: "admin", permissions: DEFAULT_ROLE_PERMISSIONS.admin, passwordChangeRequired: false };
    this.currentSession = session;
    return session;
  }
  async listCohorts(): Promise<Cohort[]> { return structuredClone(cohorts); }
  async createCohort(name: string): Promise<Cohort> {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120) throw new ApiError("NAME_INVALID", 422);
    if (cohorts.some((cohort) => cohort.name === trimmed)) throw new ApiError("COHORT_NAME_TAKEN", 409);
    const cohort: Cohort = { cohortId: crypto.randomUUID(), name: trimmed, learnerCount: 0, createdAt: new Date().toISOString(), createdBy: "superadmin-demo-001", archived: false };
    cohorts.push(cohort);
    return structuredClone(cohort);
  }
  async renameCohort(cohortId: string, name: string): Promise<Cohort> {
    const cohort = cohorts.find((candidate) => candidate.cohortId === cohortId);
    if (!cohort) throw new ApiError("NOT_FOUND", 404);
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120) throw new ApiError("NAME_INVALID", 422);
    if (cohorts.some((candidate) => candidate.name === trimmed && candidate.cohortId !== cohortId)) throw new ApiError("COHORT_NAME_TAKEN", 409);
    cohort.name = trimmed;
    return structuredClone(cohort);
  }
  async archiveCohort(cohortId: string): Promise<void> {
    const cohort = cohorts.find((candidate) => candidate.cohortId === cohortId);
    if (!cohort) throw new ApiError("NOT_FOUND", 404);
    cohort.archived = true;
  }
  async listLearnerRecords(input: { cohortId?: string } = {}): Promise<LearnerRecord[]> {
    return structuredClone(input.cohortId ? students.filter((student) => student.cohortId === input.cohortId) : students);
  }
  async createLearner(input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal> {
    if (!cohorts.some((cohort) => cohort.cohortId === input.cohortId) || !input.firstName.trim() || !input.lastName.trim()) throw new ApiError("INVALID_INPUT", 422);
    return { learnerId: crypto.randomUUID(), setupCode: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, shownOnce: true };
  }
  async getLearnerRecord(learnerId: string): Promise<LearnerRecord> {
    const student = students.find((candidate) => candidate.learnerId === learnerId);
    if (!student) throw new ApiError("NOT_FOUND", 404);
    const cohort = cohorts.find((candidate) => candidate.cohortId === student.cohortId);
    return structuredClone({ ...student, cohortName: cohort?.name, devices: learnerDevices.get(learnerId) ?? [] });
  }
  async updateLearner(learnerId: string, changes: LearnerFieldChanges): Promise<LearnerRecord> {
    const student = students.find((candidate) => candidate.learnerId === learnerId);
    if (!student) throw new ApiError("NOT_FOUND", 404);
    const { value, details } = validateLearnerChanges(changes);
    if (details.length) throw new ApiError("VALIDATION_FAILED", 422, false, undefined, details);
    Object.assign(student, value);
    return structuredClone({ ...student, devices: learnerDevices.get(learnerId) ?? [] });
  }
  async archiveLearner(learnerId: string): Promise<void> {
    const student = students.find((candidate) => candidate.learnerId === learnerId);
    if (!student) throw new ApiError("NOT_FOUND", 404);
    if (student.status !== "archived") {
      student.status = "archived";
      student.archivedAt = new Date().toISOString();
      const devices = learnerDevices.get(learnerId) ?? [];
      devices.forEach((device) => { if (!device.switchedOffAt) device.switchedOffAt = new Date().toISOString(); });
    }
  }
  async issueSetupCode(learnerId: string, switchOffExistingPhones: boolean): Promise<{ setupCode: string; phonesSwitchedOff: number }> {
    const student = students.find((candidate) => candidate.learnerId === learnerId);
    if (!student) throw new ApiError("NOT_FOUND", 404);
    if (student.status === "archived") throw new ApiError("LEARNER_ARCHIVED", 409);
    let switchedOff = 0;
    if (switchOffExistingPhones) {
      const devices = learnerDevices.get(learnerId) ?? [];
      for (const device of devices) { if (!device.switchedOffAt) { device.switchedOffAt = new Date().toISOString(); switchedOff++; } }
    }
    return { setupCode: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, phonesSwitchedOff: switchedOff };
  }
  async switchOffPhone(learnerId: string, deviceId: string): Promise<void> {
    const student = students.find((candidate) => candidate.learnerId === learnerId);
    if (!student) throw new ApiError("NOT_FOUND", 404);
    const device = (learnerDevices.get(learnerId) ?? []).find((candidate) => candidate.deviceId === deviceId && !candidate.switchedOffAt);
    if (!device) throw new ApiError("NOT_FOUND", 404);
    device.switchedOffAt = new Date().toISOString();
  }
  async purgeLearner(learnerId: string, confirmLearnerCode: string): Promise<{ eventsDeleted: number }> {
    const index = students.findIndex((candidate) => candidate.learnerId === learnerId);
    if (index === -1) throw new ApiError("NOT_FOUND", 404);
    if (confirmLearnerCode !== students[index].learnerCode) throw new ApiError("CONFIRMATION_REQUIRED", 422);
    students.splice(index, 1);
    learnerDevices.delete(learnerId);
    return { eventsDeleted: 0 };
  }
  async listModules(): Promise<ModuleListing[]> { return structuredClone(modules); }
  /** Mirrors the server's own /v1/staff/modules/check handler (staff-routes.ts), reusing the same shared validator, so a module that passes here passes there too. */
  async checkModule(json: unknown): Promise<ModuleCheckResult> {
    const issues = validateTetherlessModule(json);
    let willBe: ModuleCheckResult["willBe"] = "new_module";
    const m = isRecord(json) ? json : {};
    const moduleId = typeof m.module_id === "string" ? m.module_id : "";
    if (!issues.some((i) => i.severity === "error")) {
      const existing = modules.find((mod) => mod.moduleId === moduleId);
      if (existing) {
        willBe = "new_version";
        if (existing.archived) issues.push({ severity: "error", code: "MODULE_ARCHIVED", message: `Module ${moduleId} is archived.`, location: { field: "module_id" } });
        const activityType = typeof m.activity_type === "string" ? m.activity_type : "multiple_choice";
        if (activityType !== existing.activityType) {
          issues.push({ severity: "error", code: "ACTIVITY_TYPE_CHANGED", message: `Module ${moduleId} is ${existing.activityType}; a new version can't change that.`, location: { field: "activity_type" } });
        }
        issues.push(...checkNewVersion(json as TetherlessModule, moduleBodies.get(moduleId)));
      }
    }
    const errors = issues.filter((i) => i.severity === "error");
    if (errors.length) willBe = "blocked";
    const title = isRecord(m.title) ? m.title : undefined;
    return {
      valid: errors.length === 0,
      willBe,
      summary: {
        moduleId: moduleId || null,
        moduleName: title && typeof title.en === "string" ? title.en : null,
        contentVersion: typeof m.content_version === "number" ? m.content_version : null,
        level: typeof m.level === "string" ? m.level : null,
        activityType: typeof m.activity_type === "string" ? m.activity_type : "multiple_choice",
        questionCount: Array.isArray(m.questions) ? m.questions.length : 0,
      },
      errors: toIssues(errors),
      warnings: toIssues(issues.filter((i) => i.severity !== "error")),
    };
  }
  async publishModule(json: unknown): Promise<ModulePublishResult> {
    const check = await this.checkModule(json);
    if (!check.valid) {
      if (check.errors.some((e) => e.code === "VERSION_NOT_HIGHER")) throw new ApiError("VERSION_EXISTS", 409);
      throw new ApiError("VALIDATION_FAILED", 422);
    }
    const m = json as Record<string, unknown>;
    const moduleId = String(m.module_id);
    const contentVersion = check.summary.contentVersion ?? 1;
    moduleBodies.set(moduleId, json as TetherlessModule);
    const existing = modules.find((mod) => mod.moduleId === moduleId);
    if (existing) {
      existing.latestVersion = contentVersion;
      existing.versions = [...existing.versions, contentVersion];
      existing.questionCount = check.summary.questionCount;
    } else {
      modules.push({
        moduleId, moduleName: check.summary.moduleName ?? moduleId, title: { en: check.summary.moduleName ?? moduleId },
        level: check.summary.level, note: null, activityType: check.summary.activityType,
        latestVersion: contentVersion, versions: [contentVersion], questionCount: check.summary.questionCount,
        used: false, archived: false, createdBy: "superadmin-demo-001", createdAt: new Date().toISOString(),
      });
    }
    return { moduleId, contentVersion, publishedAt: new Date().toISOString(), warnings: check.warnings };
  }
  async getModuleVersion(moduleId: string, contentVersion: number): Promise<TetherlessModule> {
    const body = moduleBodies.get(moduleId);
    if (!body || body.content_version !== contentVersion) throw new ApiError("NOT_FOUND", 404);
    return structuredClone(body);
  }
  async archiveModule(moduleId: string): Promise<void> {
    const mod = modules.find((candidate) => candidate.moduleId === moduleId);
    if (!mod) throw new ApiError("NOT_FOUND", 404);
    mod.archived = true;
  }
  async purgeModule(moduleId: string): Promise<void> {
    const index = modules.findIndex((candidate) => candidate.moduleId === moduleId);
    if (index === -1) throw new ApiError("NOT_FOUND", 404);
    if (modules[index].used || assignments.some((assignment) => assignment.moduleId === moduleId)) throw new ApiError("IN_USE", 409);
    modules.splice(index, 1);
    moduleBodies.delete(moduleId);
  }
  /** Mirrors the real backend's join (memory-store.ts/pg-store.ts): a learner-targeted assignment has
   * cohortId: null, so it only surfaces here through the learner's own current cohort. */
  async listAssignments(cohortId: string): Promise<Assignment[]> {
    return structuredClone(assignments.filter((a) => a.cohortId === cohortId || (a.target === "learner" && students.find((student) => student.learnerId === a.learnerId)?.cohortId === cohortId)));
  }
  async assign(input: { moduleId: string; contentVersion?: number | null; cohortId?: string; learnerId?: string }): Promise<Assignment> {
    const hasCohort = !!input.cohortId, hasLearner = !!input.learnerId;
    if (hasCohort === hasLearner) throw new ApiError("INVALID_INPUT", 422);
    const mod = modules.find((candidate) => candidate.moduleId === input.moduleId);
    if (!mod) throw new ApiError("NOT_FOUND", 404);
    if (mod.archived) throw new ApiError("MODULE_ARCHIVED", 409);
    let cohortId: string;
    let learnerId: string | null = null;
    if (hasCohort) {
      if (!cohorts.some((cohort) => cohort.cohortId === input.cohortId)) throw new ApiError("NOT_FOUND", 404);
      cohortId = input.cohortId!;
    } else {
      const learner = students.find((student) => student.learnerId === input.learnerId);
      if (!learner) throw new ApiError("NOT_FOUND", 404);
      learnerId = learner.learnerId; cohortId = learner.cohortId;
    }
    const version = input.contentVersion ?? null;
    if (assignments.some((a) => a.moduleId === mod.moduleId && a.contentVersion === version && (hasCohort ? a.cohortId === cohortId : a.learnerId === learnerId))) {
      throw new ApiError("ALREADY_ASSIGNED", 409);
    }
    const assignment: Assignment = { assignmentId: crypto.randomUUID(), moduleId: mod.moduleId, moduleName: mod.moduleName, contentVersion: version, target: hasCohort ? "cohort" : "learner", cohortId: hasCohort ? cohortId : null, learnerId, createdAt: new Date().toISOString(), createdBy: "superadmin-demo-001" };
    assignments.push(assignment);
    return structuredClone(assignment);
  }
  async unassign(assignmentId: string): Promise<void> {
    const index = assignments.findIndex((a) => a.assignmentId === assignmentId);
    if (index === -1) throw new ApiError("NOT_FOUND", 404);
    assignments.splice(index, 1);
  }
  async listStaff(): Promise<StaffAccountSummary[]> { return structuredClone(accounts); }
  async createStaff(input: { role: StaffRole; username: string; displayName: string }): Promise<StaffAccountReveal> {
    const username = input.username.trim().toLowerCase();
    if (!STAFF_USERNAME_PATTERN.test(username) || !input.displayName.trim()) throw new ApiError("INVALID_INPUT", 422);
    if (accounts.some((account) => account.username === username)) throw new ApiError("USERNAME_TAKEN", 409);
    const account: StaffAccountSummary = { staffId: crypto.randomUUID(), username, displayName: input.displayName.trim(), role: input.role, disabled: false, createdAt: new Date().toISOString() };
    accounts.push(account);
    return { account, temporaryPassword: crypto.randomUUID().replace(/-/g, "").slice(0, 16), shownOnce: true };
  }
  async resetStaffAccountPassword(staffId: string): Promise<StaffAccountReveal> {
    const account = accounts.find((candidate) => candidate.staffId === staffId);
    if (!account) throw new ApiError("NOT_FOUND", 404);
    return { account, temporaryPassword: crypto.randomUUID().replace(/-/g, "").slice(0, 16), shownOnce: true };
  }
  /** Mirrors staff-routes.ts's disable/enable handler: no self-lockout, no disabling the last active Superadmin. */
  async setStaffDisabled(staffId: string, disabled: boolean): Promise<void> {
    const account = accounts.find((candidate) => candidate.staffId === staffId);
    if (!account) throw new ApiError("NOT_FOUND", 404);
    if (disabled) {
      if (account.staffId === this.currentSession?.staffId) throw new ApiError("LOCKOUT_PREVENTED", 409);
      if (account.role === "superadmin" && accounts.filter((candidate) => candidate.role === "superadmin" && !candidate.disabled).length <= 1) {
        throw new ApiError("LOCKOUT_PREVENTED", 409);
      }
    }
    account.disabled = disabled;
  }
  async getRolePermissions(): Promise<{ roles: Record<StaffRole, StaffPermissionKey[]>; permissions: StaffPermissionKey[] }> {
    return structuredClone({ roles: rolePermissions, permissions: STAFF_PERMISSIONS as unknown as StaffPermissionKey[] });
  }
  /** Mirrors staff-routes.ts's PUT .../roles/:role/permissions handler. */
  async setRolePermissions(role: StaffRole, permissions: StaffPermissionKey[]): Promise<void> {
    if (!STAFF_ROLES.includes(role)) throw new ApiError("NOT_FOUND", 404);
    const unknown = permissions.filter((p) => !(STAFF_PERMISSIONS as readonly string[]).includes(p));
    if (unknown.length) throw new ApiError("UNKNOWN_PERMISSION", 422);
    if (role === "superadmin" && !permissions.includes("permissions.manage")) throw new ApiError("LOCKOUT_PREVENTED", 409);
    rolePermissions[role] = [...permissions];
  }
  async getThresholds(): Promise<Thresholds> { return { ...thresholds }; }
  /** Mirrors staff-routes.ts's PUT .../settings/thresholds handler: whole numbers 0-100, struggling can't exceed passing. */
  async setThresholds(t: Thresholds): Promise<Thresholds> {
    const details: { field: string; message: string }[] = [];
    for (const [field, value] of Object.entries({ passPct: t.passPct, strugglingPct: t.strugglingPct, weakTopicPct: t.weakTopicPct }) as [string, number][]) {
      if (!Number.isInteger(value) || value < 0 || value > 100) details.push({ field, message: `${field} must be a whole number from 0 to 100.` });
    }
    if (!Number.isInteger(t.weakTopicMinAnswers) || t.weakTopicMinAnswers < 1) details.push({ field: "weakTopicMinAnswers", message: "weakTopicMinAnswers must be a whole number of 1 or more." });
    if (!details.length && t.strugglingPct > t.passPct) details.push({ field: "strugglingPct", message: "The struggling threshold can't be above the passing threshold." });
    if (details.length) throw new ApiError("VALIDATION_FAILED", 422, false, undefined, details);
    thresholds = { ...t };
    return { ...thresholds };
  }
  /** Demo-only: a plausible export shape, not the server's full export_version 2 body. */
  async exportCohort(cohortId: string): Promise<Blob> {
    const cohort = cohorts.find((candidate) => candidate.cohortId === cohortId);
    if (!cohort) throw new ApiError("NOT_FOUND", 404);
    const learners = students.filter((student) => student.cohortId === cohortId);
    const body = { export_version: 2, cohort, generated_at: new Date().toISOString(), thresholds, learners };
    return new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
  }
}
