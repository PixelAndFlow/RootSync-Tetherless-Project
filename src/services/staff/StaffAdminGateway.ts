import type { Assignment, Cohort, LearnerRecord, ModuleCheckResult, ModuleListing, ModulePublishResult, SetupCodeReveal, StaffAccountReveal, StaffAccountSummary, StaffRole, StaffSession } from "../../types/staff";

/** Frontend boundary for Marc's StaffAdminGateway. The mock is intentional until API wiring is approved. */
export interface StaffAdminGateway {
  signIn(input: { username: string; password: string }): Promise<StaffSession>;
  signOut(): void;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession>;
  listCohorts(): Promise<Cohort[]>;
  listLearnerRecords(input: { cohortId?: string }): Promise<LearnerRecord[]>;
  createLearner(input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal>;
  listModules(): Promise<ModuleListing[]>;
  /** Validates module JSON without publishing it. Does not require the module to already exist. */
  checkModule(json: unknown): Promise<ModuleCheckResult>;
  /** Publishes a new module or a new version of an existing one. Call checkModule first. */
  createModule(json: unknown): Promise<ModulePublishResult>;
  listAssignments(cohortId: string): Promise<Assignment[]>;
  /** Exactly one of cohortId/learnerId. Omit contentVersion to always track the latest published version. */
  createAssignment(input: { moduleId: string; contentVersion?: number | null; cohortId?: string; learnerId?: string }): Promise<Assignment>;
  removeAssignment(assignmentId: string): Promise<void>;
  listStaffAccounts(): Promise<StaffAccountSummary[]>;
  createStaffAccount(input: { role: StaffRole; username: string; displayName: string }): Promise<StaffAccountReveal>;
  resetStaffAccountPassword(staffId: string): Promise<StaffAccountReveal>;
  canManage(role: StaffRole, action: "staff" | "system"): boolean;
}
