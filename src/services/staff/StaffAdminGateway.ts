import type { SetupCodeReveal, StaffAccountReveal, StaffAccountSummary, StaffCohort, StaffModule, StaffRole, StaffSession, StaffStudent } from "../../types/staff";

/** Frontend boundary for Marc's StaffAdminGateway. The mock is intentional until API wiring is approved. */
export interface StaffAdminGateway {
  signIn(input: { username: string; password: string }): Promise<StaffSession>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession>;
  listCohorts(): Promise<StaffCohort[]>;
  listStudents(input: { cohortId?: string }): Promise<StaffStudent[]>;
  createStudent(input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal>;
  listModules(): Promise<StaffModule[]>;
  listStaffAccounts(): Promise<StaffAccountSummary[]>;
  createStaffAccount(input: { role: StaffRole; username: string; displayName: string }): Promise<StaffAccountReveal>;
  canManage(role: StaffRole, action: "staff" | "system"): boolean;
}
