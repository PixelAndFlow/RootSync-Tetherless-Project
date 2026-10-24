import { ApiClient } from "../api/ApiClient";
import { ApiError, isRecord } from "../api/ApiError";
import type { SetupCodeReveal, StaffAccountReveal, StaffCohort, StaffModule, StaffRole, StaffSession, StaffStudent } from "../../types/staff";
import { STAFF_USERNAME_PATTERN } from "./username";
import type { StaffAdminGateway } from "./StaffAdminGateway";

function invalid(): never { throw new ApiError("INVALID_RESPONSE"); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : invalid(); }
function text(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
const ROLES: readonly string[] = ["superadmin", "admin", "trainer"];
function role(value: unknown): StaffRole { return typeof value === "string" && ROLES.includes(value) ? (value as StaffRole) : invalid(); }

function mapSession(staff: Record<string, unknown>): StaffSession {
  return {
    staffId: text(staff.staff_id),
    username: text(staff.username),
    displayName: text(staff.display_name),
    role: role(staff.role),
    passwordChangeRequired: bool(staff.must_change_password),
  };
}

/** Meets the server's MIN_PASSWORD_LENGTH (12); shown once, never retyped, so it's random, not memorable. */
function generateTemporaryPassword(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Real staff adapter for the v1.10 server (Render/Neon), written for
 * marc-frontend-integration-test. Sign-in, password change and staff-account
 * creation call the real API: /v1/staff/login, /v1/staff/me/password and
 * POST /v1/staff/accounts.
 *
 * Cohorts, Students and Modules are NOT wired here. StaffAdminGateway's
 * listCohorts/listStudents/createStudent/listModules assume a shape
 * (first/last name, mock StaffCohort/StaffStudent ids) that doesn't match the
 * server's real setup-code + roster-import flow yet; reconciling that is a
 * separate decision (see Marc's note on the account/backend review). Reads
 * return empty results so the staff dashboard still renders; the one mutation,
 * createStudent, throws clearly instead of pretending to issue a real code.
 */
export class ApiStaffAdminGateway implements StaffAdminGateway {
  private token: string | null = null;
  private readonly api: ApiClient;

  constructor(baseUrl: string) {
    this.api = new ApiClient(baseUrl, () => this.token);
  }

  async signIn(input: { username: string; password: string }): Promise<StaffSession> {
    const body = record(await this.api.post("/v1/staff/login", input, { auth: false }));
    this.token = text(body.token);
    return mapSession(record(body.staff));
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession> {
    await this.api.post("/v1/staff/me/password", { current_password: input.currentPassword, new_password: input.newPassword });
    return mapSession(record(await this.api.get("/v1/staff/me")));
  }

  async listCohorts(): Promise<StaffCohort[]> {
    console.warn("[ApiStaffAdminGateway] listCohorts is not wired to the real API yet.");
    return [];
  }

  async listStudents(): Promise<StaffStudent[]> {
    console.warn("[ApiStaffAdminGateway] listStudents is not wired to the real API yet.");
    return [];
  }

  async listModules(): Promise<StaffModule[]> {
    console.warn("[ApiStaffAdminGateway] listModules is not wired to the real API yet.");
    return [];
  }

  async createStudent(): Promise<SetupCodeReveal> {
    throw new ApiError("NOT_IMPLEMENTED", 501);
  }

  async createStaffAccount(input: { role: StaffRole; username: string; displayName: string }): Promise<StaffAccountReveal> {
    const username = input.username.trim().toLowerCase();
    if (!STAFF_USERNAME_PATTERN.test(username)) throw new ApiError("INVALID_INPUT", 422, false, undefined, [{ field: "username", message: "Check this value and try again." }]);
    const temporaryPassword = generateTemporaryPassword();
    const body = record(await this.api.post("/v1/staff/accounts", {
      role: input.role, username, display_name: input.displayName.trim(), temporary_password: temporaryPassword,
    }));
    const account = record(body.account);
    return {
      account: { staffId: text(account.staff_id), username: text(account.username), displayName: text(account.display_name), role: role(account.role) },
      temporaryPassword,
      shownOnce: true,
    };
  }

  canManage(role: StaffRole, action: "staff" | "system"): boolean {
    return action === "staff" ? role !== "trainer" : role === "superadmin";
  }
}
