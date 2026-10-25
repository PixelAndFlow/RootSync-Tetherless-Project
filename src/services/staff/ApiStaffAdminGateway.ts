import { ApiClient } from "../api/ApiClient";
import { ApiError, isRecord } from "../api/ApiError";
import type { SetupCodeReveal, StaffAccountReveal, StaffAccountSummary, StaffCohort, StaffModule, StaffRole, StaffSession, StaffStudent } from "../../types/staff";
import { STAFF_USERNAME_PATTERN } from "./username";
import type { StaffAdminGateway } from "./StaffAdminGateway";

function invalid(): never { throw new ApiError("INVALID_RESPONSE"); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : invalid(); }
function text(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }

function mapAccount(value: unknown): StaffAccountSummary {
  const account = record(value);
  const role = text(account.role);
  if (!( ["superadmin", "admin", "trainer"] as string[]).includes(role)) invalid();
  return { staffId: text(account.staff_id), username: text(account.username), displayName: text(account.display_name), role: role as StaffRole, disabled: bool(account.disabled), createdAt: text(account.created_at) };
}

function mapSession(value: unknown): StaffSession {
  const staff = record(value);
  const role = text(staff.role);
  if (!(["superadmin", "admin", "trainer"] as const).includes(role as StaffRole)) invalid();
  return {
    staffId: text(staff.staff_id),
    username: text(staff.username),
    displayName: text(staff.display_name),
    role: role as StaffRole,
    passwordChangeRequired: bool(staff.must_change_password),
  };
}

/**
 * In-memory staff-session adapter for Marc's v1 API. It intentionally enables
 * sign-in, password change and staff account list/create; all cohort, learner, content and
 * assignment mutations remain disabled until their UI contracts are reviewed.
 */
export class ApiStaffAdminGateway implements StaffAdminGateway {
  private token: string | null = null;
  private readonly api: ApiClient;

  constructor(baseUrl: string, transport: typeof fetch = fetch.bind(globalThis)) {
    this.api = new ApiClient(baseUrl, () => this.token, transport);
  }

  async signIn(input: { username: string; password: string }): Promise<StaffSession> {
    const body = record(await this.api.post("/v1/staff/login", input, { auth: false }));
    this.token = text(body.token);
    return mapSession(body.staff);
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession> {
    await this.api.post("/v1/staff/me/password", { current_password: input.currentPassword, new_password: input.newPassword });
    return mapSession(await this.api.get("/v1/staff/me"));
  }

  async listCohorts(): Promise<StaffCohort[]> { return []; }
  async listStudents(_input: { cohortId?: string } = {}): Promise<StaffStudent[]> { return []; }
  async listModules(): Promise<StaffModule[]> { return []; }
  async createStudent(_input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal> {
    throw new ApiError("NOT_IMPLEMENTED", 501);
  }
  async listStaffAccounts(): Promise<StaffAccountSummary[]> {
    const body = record(await this.api.get("/v1/staff/accounts"));
    if (!Array.isArray(body.accounts)) return invalid();
    return body.accounts.map(mapAccount);
  }
  async createStaffAccount(input: { role: StaffRole; username: string; displayName: string }): Promise<StaffAccountReveal> {
    const username = input.username.trim().toLowerCase();
    if (!STAFF_USERNAME_PATTERN.test(username) || !input.displayName.trim()) throw new ApiError("INVALID_INPUT", 422);
    const temporaryPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const body = record(await this.api.post("/v1/staff/accounts", { role: input.role, username, display_name: input.displayName.trim(), temporary_password: temporaryPassword }));
    return { account: mapAccount(body.account), temporaryPassword, shownOnce: true };
  }
  canManage(role: StaffRole, action: "staff" | "system"): boolean {
    return action === "staff" ? role !== "trainer" : role === "superadmin";
  }
}
