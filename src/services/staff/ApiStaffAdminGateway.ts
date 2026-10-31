import { ApiClient } from "../api/ApiClient";
import { ApiError, isRecord } from "../api/ApiError";
import type { Cohort as CohortWire, LearnerRecord as LearnerRecordWire, ModuleListing as ModuleListingWire } from "../../../packages/contract/src/staff-api";
import type { Cohort, LearnerRecord, ModuleListing, SetupCodeReveal, StaffAccountReveal, StaffAccountSummary, StaffRole, StaffSession } from "../../types/staff";
import { STAFF_USERNAME_PATTERN } from "./username";
import { toCohort, toLearnerRecord, toModuleListing } from "./staffMappers";
import type { StaffAdminGateway } from "./StaffAdminGateway";
import { ApiTrainerDataGateway } from "../trainer/ApiTrainerDataGateway";

function invalid(): never { throw new ApiError("INVALID_RESPONSE"); }
function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : invalid(); }
function text(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
function nullable(value: unknown): string | null { return value === null ? null : text(value); }
function number(value: unknown): number { return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : invalid(); }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid(); }

function parseCohort(value: unknown): CohortWire {
  const c = record(value);
  return { cohort_id: text(c.cohort_id), name: text(c.name), created_at: text(c.created_at), created_by: nullable(c.created_by), archived: bool(c.archived), ...(c.learner_count === undefined ? {} : { learner_count: number(c.learner_count) }) };
}
function parseLearner(value: unknown): LearnerRecordWire {
  const l = record(value);
  const status = text(l.status);
  if (!["awaiting_setup", "active", "phone_switched_off", "archived"].includes(status)) invalid();
  return { learner_id: text(l.learner_id), learner_code: text(l.learner_code), cohort_id: text(l.cohort_id), first_name: text(l.first_name), last_name: text(l.last_name), username: nullable(l.username), phone: nullable(l.phone), email: nullable(l.email), training_level: nullable(l.training_level), note_1: nullable(l.note_1), note_2: nullable(l.note_2), status: status as LearnerRecordWire["status"], created_at: text(l.created_at), archived_at: nullable(l.archived_at), ...(l.cohort_name === undefined ? {} : { cohort_name: text(l.cohort_name) }), ...(l.last_synced_at === undefined ? {} : { last_synced_at: nullable(l.last_synced_at) }) };
}
function parseModule(value: unknown): ModuleListingWire {
  const m = record(value);
  const title = m.title === null ? null : record(m.title);
  return { module_id: text(m.module_id), module_name: text(m.module_name), title: title === null ? null : { en: text(title.en), ...(title.es === undefined ? {} : { es: text(title.es) }) }, level: nullable(m.level), note: nullable(m.note), activity_type: text(m.activity_type), latest_version: m.latest_version === null ? null : number(m.latest_version), versions: list(m.versions).map(number), question_count: number(m.question_count), used: bool(m.used), archived: bool(m.archived), created_by: nullable(m.created_by), created_at: text(m.created_at) };
}

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
  // Only sent on /v1/staff/login and /v1/staff/me; both are this gateway's only callers of mapSession.
  const permissions = list(staff.permissions).map(text);
  return {
    staffId: text(staff.staff_id),
    username: text(staff.username),
    displayName: text(staff.display_name),
    role: role as StaffRole,
    permissions: permissions as StaffSession["permissions"],
    passwordChangeRequired: bool(staff.must_change_password),
  };
}

/** Staff API adapter with an in-memory session token. */
export class ApiStaffAdminGateway implements StaffAdminGateway {
  private token: string | null = null;
  private readonly api: ApiClient;

  constructor(baseUrl: string, transport: typeof fetch = fetch.bind(globalThis)) {
    this.api = new ApiClient(baseUrl, () => this.token, transport);
  }

  /** The trainer dashboard reads, sharing this gateway's staff session token. */
  trainerData(): ApiTrainerDataGateway { return new ApiTrainerDataGateway(this.api); }

  signOut(): void { this.token = null; }

  async signIn(input: { username: string; password: string }): Promise<StaffSession> {
    const body = record(await this.api.post("/v1/staff/login", input, { auth: false }));
    const session = mapSession(body.staff);
    this.token = text(body.token);
    return session;
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession> {
    await this.api.post("/v1/staff/me/password", { current_password: input.currentPassword, new_password: input.newPassword });
    return mapSession(await this.api.get("/v1/staff/me"));
  }

  async listCohorts(): Promise<Cohort[]> { return list(record(await this.api.get("/v1/staff/cohorts")).cohorts).map(parseCohort).map(toCohort); }
  async listLearnerRecords(input: { cohortId?: string } = {}): Promise<LearnerRecord[]> {
    if (input.cohortId !== undefined) {
      if (!input.cohortId.trim()) throw new ApiError("INVALID_INPUT", 422);
      return list(record(await this.api.get(`/v1/staff/learners?cohort_id=${encodeURIComponent(input.cohortId)}`)).learners).map(parseLearner).map(toLearnerRecord);
    }
    const cohorts = await this.listCohorts();
    return (await Promise.all(cohorts.map((cohort) => this.listLearnerRecords({ cohortId: cohort.cohortId })))).flat();
  }
  async listModules(): Promise<ModuleListing[]> { return list(record(await this.api.get("/v1/staff/modules")).modules).map(parseModule).map(toModuleListing); }
  async createLearner(input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal> {
    const firstName = input.firstName.trim(), lastName = input.lastName.trim();
    if (!input.cohortId.trim() || !firstName || !lastName) throw new ApiError("INVALID_INPUT", 422);
    const body = record(await this.api.post("/v1/staff/learners", { cohort_id: input.cohortId, first_name: firstName, last_name: lastName }));
    const setupCode = text(body.setup_code);
    const learnerId = text(record(body.learner).learner_id);
    if (!setupCode || !learnerId) invalid();
    return { learnerId, setupCode, shownOnce: true };
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
  async resetStaffAccountPassword(staffId: string): Promise<StaffAccountReveal> {
    const temporaryPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const body = record(await this.api.post(`/v1/staff/accounts/${encodeURIComponent(staffId)}/reset-password`, { temporary_password: temporaryPassword }));
    return { account: mapAccount(body.account), temporaryPassword, shownOnce: true };
  }
  canManage(role: StaffRole, action: "staff" | "system"): boolean {
    return action === "staff" ? role !== "trainer" : role === "superadmin";
  }
}
