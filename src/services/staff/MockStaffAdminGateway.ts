import { ApiError, isRecord } from "../api/ApiError";
import { DEFAULT_ROLE_PERMISSIONS, type Assignment, type Cohort, type LearnerRecord, type ModuleCheckResult, type ModuleListing, type ModulePublishResult, type SetupCodeReveal, type StaffAccountReveal, type StaffAccountSummary, type StaffRole, type StaffSession } from "../../types/staff";
import { STAFF_USERNAME_PATTERN } from "./username";
import type { StaffAdminGateway } from "./StaffAdminGateway";

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
const accounts: StaffAccountSummary[] = [
  { staffId: "superadmin-demo-001", username: "demo", displayName: "Demo SuperAdmin", role: "superadmin", disabled: false, createdAt: "2026-01-01T00:00:00.000Z" },
  { staffId: "admin-demo-001", username: "admin", displayName: "Demo Admin", role: "admin", disabled: false, createdAt: "2026-01-01T00:00:00.000Z" },
  { staffId: "trainer-demo-001", username: "trainer", displayName: "Demo Trainer", role: "trainer", disabled: false, createdAt: "2026-01-01T00:00:00.000Z" },
];

/**
 * Demo-only staff adapter. It never calls the API, issues real codes, or persists credentials.
 * Accounts: demo / demo-password-123 (SuperAdmin), admin / demo-password-123, trainer / demo-password-123.
 */
export class MockStaffAdminGateway implements StaffAdminGateway {
  signOut(): void { /* No session token in demo mode. */ }
  async signIn(input: { username: string; password: string }): Promise<StaffSession> {
    if (input.password !== "demo-password-123") throw new ApiError("UNAUTHORIZED", 401);
    const roleByUsername: Record<string, StaffRole> = { demo: "superadmin", admin: "admin", trainer: "trainer" };
    const role = roleByUsername[input.username.trim().toLowerCase()];
    if (!role) throw new ApiError("UNAUTHORIZED", 401);
    return {
      staffId: `${role}-demo-001`, username: input.username.trim(),
      displayName: role === "superadmin" ? "Demo SuperAdmin" : role === "admin" ? "Demo Admin" : "Demo Trainer",
      role, permissions: DEFAULT_ROLE_PERMISSIONS[role], passwordChangeRequired: input.username.trim().toLowerCase() === "admin",
    };
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession> {
    if (input.currentPassword !== "demo-password-123" || input.newPassword.length < 12) throw new ApiError("INVALID_INPUT", 422);
    return { staffId: "admin-demo-001", username: "admin", displayName: "Demo Admin", role: "admin", permissions: DEFAULT_ROLE_PERMISSIONS.admin, passwordChangeRequired: false };
  }
  async listCohorts(): Promise<Cohort[]> { return structuredClone(cohorts); }
  async listLearnerRecords(input: { cohortId?: string } = {}): Promise<LearnerRecord[]> {
    return structuredClone(input.cohortId ? students.filter((student) => student.cohortId === input.cohortId) : students);
  }
  async createLearner(input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal> {
    if (!cohorts.some((cohort) => cohort.cohortId === input.cohortId) || !input.firstName.trim() || !input.lastName.trim()) throw new ApiError("INVALID_INPUT", 422);
    return { learnerId: crypto.randomUUID(), setupCode: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, shownOnce: true };
  }
  async listModules(): Promise<ModuleListing[]> { return structuredClone(modules); }
  async checkModule(json: unknown): Promise<ModuleCheckResult> {
    const m = isRecord(json) ? json : {};
    const errors: ModuleCheckResult["errors"] = [];
    const moduleId = typeof m.module_id === "string" ? m.module_id : "";
    if (!moduleId) errors.push({ field: "module_id", code: "REQUIRED", message: "module_id is required." });
    const title = isRecord(m.title) ? m.title : undefined;
    const titleEn = title && typeof title.en === "string" ? title.en : "";
    if (!titleEn) errors.push({ field: "title", code: "REQUIRED", message: "title.en is required." });
    const questions = Array.isArray(m.questions) ? m.questions : [];
    if (questions.length === 0) errors.push({ field: "questions", code: "REQUIRED", message: "At least one question is required." });
    const existing = modules.find((mod) => mod.moduleId === moduleId);
    if (existing?.archived) errors.push({ field: "module_id", code: "MODULE_ARCHIVED", message: `Module ${moduleId} is archived.` });
    const willBe: ModuleCheckResult["willBe"] = errors.length ? "blocked" : existing ? "new_version" : "new_module";
    return {
      valid: errors.length === 0,
      willBe,
      summary: {
        moduleId: moduleId || null,
        moduleName: titleEn || null,
        contentVersion: typeof m.content_version === "number" ? m.content_version : null,
        level: typeof m.level === "string" ? m.level : null,
        activityType: typeof m.activity_type === "string" ? m.activity_type : "multiple_choice",
        questionCount: questions.length,
      },
      errors,
      warnings: [],
    };
  }
  async createModule(json: unknown): Promise<ModulePublishResult> {
    const check = await this.checkModule(json);
    if (!check.valid) throw new ApiError("VALIDATION_FAILED", 422);
    const m = json as Record<string, unknown>;
    const moduleId = String(m.module_id);
    const contentVersion = typeof m.content_version === "number" ? m.content_version : 1;
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
    return { moduleId, contentVersion, publishedAt: new Date().toISOString(), warnings: [] };
  }
  async listAssignments(cohortId: string): Promise<Assignment[]> { return structuredClone(assignments.filter((a) => a.cohortId === cohortId)); }
  async createAssignment(input: { moduleId: string; contentVersion?: number | null; cohortId?: string; learnerId?: string }): Promise<Assignment> {
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
  async removeAssignment(assignmentId: string): Promise<void> {
    const index = assignments.findIndex((a) => a.assignmentId === assignmentId);
    if (index === -1) throw new ApiError("NOT_FOUND", 404);
    assignments.splice(index, 1);
  }
  async listStaffAccounts(): Promise<StaffAccountSummary[]> { return structuredClone(accounts); }
  async createStaffAccount(input: { role: StaffRole; username: string; displayName: string }): Promise<StaffAccountReveal> {
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
  canManage(role: StaffRole, action: "staff" | "system"): boolean { return action === "staff" ? role !== "trainer" : role === "superadmin"; }
}
