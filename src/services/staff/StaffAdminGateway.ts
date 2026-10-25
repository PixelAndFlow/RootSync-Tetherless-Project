import type { Cohort, LearnerRecord, ModuleListing, SetupCodeReveal, StaffAccountReveal, StaffAccountSummary, StaffRole, StaffSession } from "../../types/staff";

/** Frontend boundary for Marc's StaffAdminGateway. The mock is intentional until API wiring is approved. */
export interface StaffAdminGateway {
  signIn(input: { username: string; password: string }): Promise<StaffSession>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession>;
  listCohorts(): Promise<Cohort[]>;
  listLearnerRecords(input: { cohortId?: string }): Promise<LearnerRecord[]>;
  createLearner(input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal>;
  listModules(): Promise<ModuleListing[]>;
  listStaffAccounts(): Promise<StaffAccountSummary[]>;
  createStaffAccount(input: { role: StaffRole; username: string; displayName: string }): Promise<StaffAccountReveal>;
  canManage(role: StaffRole, action: "staff" | "system"): boolean;
}
