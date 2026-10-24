import { ApiClient } from "../api/ApiClient";
import { ApiError, isRecord } from "../api/ApiError";
import type { SetupCodeReveal, StaffCohort, StaffModule, StaffRole, StaffSession, StaffStudent } from "../../types/staff";
import type { StaffAdminGateway } from "./StaffAdminGateway";

function invalid(): never { throw new ApiError("INVALID_RESPONSE"); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : invalid(); }
function text(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }

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
 * only sign-in and password change; all cohort, learner, content and
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
  canManage(role: StaffRole, action: "staff" | "system"): boolean {
    return action === "staff" ? role !== "trainer" : role === "superadmin";
  }
}
