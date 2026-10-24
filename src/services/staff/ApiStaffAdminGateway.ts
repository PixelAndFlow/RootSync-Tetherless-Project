import { ApiClient } from "../api/ApiClient";
import { ApiError, isRecord } from "../api/ApiError";
import type { SetupCodeReveal, StaffCohort, StaffModule, StaffRole, StaffSession, StaffStudent } from "../../types/staff";
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

/**
 * Real staff adapter for the v1.10 server (Render/Neon), written for
 * marc-frontend-integration-test. Only sign-in and password change call the
 * real API: /v1/staff/login and /v1/staff/me/password, the two routes behind
 * every staff screen.
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

  canManage(role: StaffRole, action: "staff" | "system"): boolean {
    return action === "staff" ? role !== "trainer" : role === "superadmin";
  }
}
