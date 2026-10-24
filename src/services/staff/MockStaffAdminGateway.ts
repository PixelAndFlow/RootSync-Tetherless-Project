import { ApiError } from "../api/ApiError";
import type { SetupCodeReveal, StaffCohort, StaffModule, StaffRole, StaffSession, StaffStudent } from "../../types/staff";
import type { StaffAdminGateway } from "./StaffAdminGateway";

const cohorts: StaffCohort[] = [
  { id: "cohort-demo-001", name: "RCYC-PR-Bootcamp2026", studentCount: 3 },
  { id: "cohort-demo-002", name: "Cyber Foundations", studentCount: 2 },
];
const students: StaffStudent[] = [
  { id: "student-demo-001", displayName: "Alex Rivera", username: "alex.r", cohortId: "cohort-demo-001", status: "active" },
  { id: "student-demo-002", displayName: "Jordan Lee", username: "jordan.l", cohortId: "cohort-demo-001", status: "active" },
  { id: "student-demo-003", displayName: "Sam Ortiz", username: "sam.o", cohortId: "cohort-demo-001", status: "active" },
];
const modules: StaffModule[] = [
  { id: "rcyc-recruit-cyber-squad-gamified-001", title: "Operation Cyber Squad", contentVersion: 1, status: "published" },
];

/**
 * Demo-only staff adapter. It never calls the API, issues real codes, or persists credentials.
 * Accounts: demo / demo-password-123 (SuperAdmin), admin / demo-password-123, trainer / demo-password-123.
 */
export class MockStaffAdminGateway implements StaffAdminGateway {
  async signIn(input: { username: string; password: string }): Promise<StaffSession> {
    if (input.password !== "demo-password-123") throw new ApiError("UNAUTHORIZED", 401);
    const roleByUsername: Record<string, StaffRole> = { demo: "superadmin", admin: "admin", trainer: "trainer" };
    const role = roleByUsername[input.username.trim().toLowerCase()];
    if (!role) throw new ApiError("UNAUTHORIZED", 401);
    return {
      staffId: `${role}-demo-001`, username: input.username.trim(),
      displayName: role === "superadmin" ? "Demo SuperAdmin" : role === "admin" ? "Demo Admin" : "Demo Trainer",
      role, passwordChangeRequired: input.username.trim().toLowerCase() === "admin",
    };
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession> {
    if (input.currentPassword !== "demo-password-123" || input.newPassword.length < 12) throw new ApiError("INVALID_INPUT", 422);
    return { staffId: "admin-demo-001", username: "admin", displayName: "Demo Admin", role: "admin", passwordChangeRequired: false };
  }
  async listCohorts(): Promise<StaffCohort[]> { return structuredClone(cohorts); }
  async listStudents(input: { cohortId?: string } = {}): Promise<StaffStudent[]> {
    return structuredClone(input.cohortId ? students.filter((student) => student.cohortId === input.cohortId) : students);
  }
  async createStudent(input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal> {
    if (!cohorts.some((cohort) => cohort.id === input.cohortId) || !input.firstName.trim() || !input.lastName.trim()) throw new ApiError("INVALID_INPUT", 422);
    return { studentId: crypto.randomUUID(), setupCode: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, shownOnce: true };
  }
  async listModules(): Promise<StaffModule[]> { return structuredClone(modules); }
  canManage(role: StaffRole, action: "staff" | "system"): boolean { return action === "staff" ? role !== "trainer" : role === "superadmin"; }
}
