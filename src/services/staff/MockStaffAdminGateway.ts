import { ApiError } from "../api/ApiError";
import { DEFAULT_ROLE_PERMISSIONS, type Cohort, type LearnerRecord, type ModuleListing, type SetupCodeReveal, type StaffAccountReveal, type StaffAccountSummary, type StaffRole, type StaffSession } from "../../types/staff";
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
