import { ApiClient } from "../api/ApiClient";
import { ApiError, isRecord } from "../api/ApiError";
import type { TetherlessModule } from "../../../packages/content/src/tetherless-module";
import type { Cohort as CohortWire, LearnerRecord as LearnerRecordWire, LearnerDevice as LearnerDeviceWire, ModuleListing as ModuleListingWire, ModuleCheck as ModuleCheckWire, ModulePublishResult as ModulePublishResultWire, Assignment as AssignmentWire, StaffErrorDetail as StaffErrorDetailWire } from "../../../packages/contract/src/staff-api";
import type { Assignment, Cohort, LearnerFieldChanges, LearnerRecord, ModuleCheckResult, ModuleListing, ModulePublishResult, SetupCodeReveal, StaffAccountReveal, StaffAccountSummary, StaffPermissionKey, StaffRole, StaffSession, Thresholds } from "../../types/staff";
import { STAFF_USERNAME_PATTERN } from "./username";
import { fromThresholds, toAssignment, toCohort, toLearnerRecord, toModuleCheck, toModuleListing, toModulePublishResult, toThresholds } from "./staffMappers";
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
function parseDevice(value: unknown): LearnerDeviceWire {
  const d = record(value);
  return { device_id: text(d.device_id), set_up_at: text(d.set_up_at), switched_off_at: nullable(d.switched_off_at) };
}
function parseLearner(value: unknown): LearnerRecordWire {
  const l = record(value);
  const status = text(l.status);
  if (!["awaiting_setup", "active", "phone_switched_off", "archived"].includes(status)) invalid();
  return { learner_id: text(l.learner_id), learner_code: text(l.learner_code), cohort_id: text(l.cohort_id), first_name: text(l.first_name), last_name: text(l.last_name), username: nullable(l.username), phone: nullable(l.phone), email: nullable(l.email), training_level: nullable(l.training_level), note_1: nullable(l.note_1), note_2: nullable(l.note_2), status: status as LearnerRecordWire["status"], created_at: text(l.created_at), archived_at: nullable(l.archived_at), ...(l.cohort_name === undefined ? {} : { cohort_name: text(l.cohort_name) }), ...(l.last_synced_at === undefined ? {} : { last_synced_at: nullable(l.last_synced_at) }), ...(l.devices === undefined ? {} : { devices: list(l.devices).map(parseDevice) }) };
}
function parseModule(value: unknown): ModuleListingWire {
  const m = record(value);
  const title = m.title === null ? null : record(m.title);
  return { module_id: text(m.module_id), module_name: text(m.module_name), title: title === null ? null : { en: text(title.en), ...(title.es === undefined ? {} : { es: text(title.es) }) }, level: nullable(m.level), note: nullable(m.note), activity_type: text(m.activity_type), latest_version: m.latest_version === null ? null : number(m.latest_version), versions: list(m.versions).map(number), question_count: number(m.question_count), used: bool(m.used), archived: bool(m.archived), created_by: nullable(m.created_by), created_at: text(m.created_at) };
}

function parseIssue(value: unknown): StaffErrorDetailWire {
  const i = record(value);
  return { ...(typeof i.row === "number" ? { row: i.row } : {}), ...(typeof i.field === "string" ? { field: i.field } : {}), code: text(i.code), message: text(i.message) };
}
function parseModuleCheck(value: unknown): ModuleCheckWire {
  const c = record(value);
  const willBe = text(c.will_be);
  if (!["new_module", "new_version", "blocked"].includes(willBe)) invalid();
  const s = record(c.summary);
  // The summary can echo a malformed value straight from the uploaded JSON
  // when the module is invalid (a negative/fractional/string content_version,
  // a numeric module_id, an object-valued level, …). errors[]/warnings[]
  // below (parsed strictly) is what actually tells staff what's wrong, so
  // the summary itself is read leniently instead of rejecting the whole
  // response over a value it is only echoing back.
  return {
    valid: bool(c.valid),
    will_be: willBe as ModuleCheckWire["will_be"],
    summary: {
      module_id: typeof s.module_id === "string" ? s.module_id : null,
      module_name: typeof s.module_name === "string" ? s.module_name : null,
      content_version: typeof s.content_version === "number" && Number.isInteger(s.content_version) && s.content_version >= 0 ? s.content_version : null,
      level: typeof s.level === "string" ? s.level : null,
      activity_type: typeof s.activity_type === "string" ? s.activity_type : "",
      question_count: typeof s.question_count === "number" && Number.isInteger(s.question_count) && s.question_count >= 0 ? s.question_count : 0,
    },
    errors: list(c.errors).map(parseIssue),
    warnings: list(c.warnings).map(parseIssue),
  };
}
function parseModulePublishResult(value: unknown): ModulePublishResultWire {
  const p = record(value);
  return { module_id: text(p.module_id), content_version: number(p.content_version), published_at: text(p.published_at), warnings: list(p.warnings).map(parseIssue) };
}
function parseAssignment(value: unknown): AssignmentWire {
  const a = record(value);
  const target = text(a.target);
  if (!["cohort", "learner"].includes(target)) invalid();
  return {
    assignment_id: text(a.assignment_id),
    module_id: text(a.module_id),
    module_name: text(a.module_name),
    content_version: a.content_version === null ? null : number(a.content_version),
    target: target as AssignmentWire["target"],
    cohort_id: a.cohort_id === null ? null : text(a.cohort_id),
    learner_id: a.learner_id === null ? null : text(a.learner_id),
    created_at: text(a.created_at),
    created_by: a.created_by === null ? null : text(a.created_by),
  };
}

const ROLES = ["superadmin", "admin", "trainer"] as const;

function parseThresholds(value: unknown): Thresholds {
  const t = record(value);
  return toThresholds({ pass_pct: number(t.pass_pct), struggling_pct: number(t.struggling_pct), weak_topic_pct: number(t.weak_topic_pct), weak_topic_min_answers: number(t.weak_topic_min_answers) });
}

function parseRolePermissions(value: unknown): Record<StaffRole, StaffPermissionKey[]> {
  const r = record(value);
  const result = {} as Record<StaffRole, StaffPermissionKey[]>;
  for (const role of ROLES) result[role] = list(r[role]).map(text) as StaffPermissionKey[];
  return result;
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

  logout(): void { this.token = null; }

  async login(input: { username: string; password: string }): Promise<StaffSession> {
    const body = record(await this.api.post("/v1/staff/login", input, { auth: false }));
    const session = mapSession(body.staff);
    this.token = text(body.token);
    return session;
  }

  async me(): Promise<StaffSession> { return mapSession(await this.api.get("/v1/staff/me")); }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<StaffSession> {
    await this.api.post("/v1/staff/me/password", { current_password: input.currentPassword, new_password: input.newPassword });
    return this.me();
  }

  async listCohorts(): Promise<Cohort[]> { return list(record(await this.api.get("/v1/staff/cohorts")).cohorts).map(parseCohort).map(toCohort); }
  async createCohort(name: string): Promise<Cohort> {
    if (!name.trim()) throw new ApiError("INVALID_INPUT", 422);
    return toCohort(parseCohort(record(await this.api.post("/v1/staff/cohorts", { name: name.trim() })).cohort));
  }
  async renameCohort(cohortId: string, name: string): Promise<Cohort> {
    if (!cohortId.trim() || !name.trim()) throw new ApiError("INVALID_INPUT", 422);
    return toCohort(parseCohort(record(await this.api.patch(`/v1/staff/cohorts/${encodeURIComponent(cohortId)}`, { name: name.trim() })).cohort));
  }
  async archiveCohort(cohortId: string): Promise<void> {
    if (!cohortId.trim()) throw new ApiError("INVALID_INPUT", 422);
    await this.api.post(`/v1/staff/cohorts/${encodeURIComponent(cohortId)}/archive`, {});
  }
  async listLearnerRecords(input: { cohortId?: string } = {}): Promise<LearnerRecord[]> {
    if (input.cohortId !== undefined) {
      if (!input.cohortId.trim()) throw new ApiError("INVALID_INPUT", 422);
      return list(record(await this.api.get(`/v1/staff/learners?cohort_id=${encodeURIComponent(input.cohortId)}`)).learners).map(parseLearner).map(toLearnerRecord);
    }
    const cohorts = await this.listCohorts();
    return (await Promise.all(cohorts.map((cohort) => this.listLearnerRecords({ cohortId: cohort.cohortId })))).flat();
  }
  async listModules(): Promise<ModuleListing[]> { return list(record(await this.api.get("/v1/staff/modules")).modules).map(parseModule).map(toModuleListing); }
  async checkModule(json: unknown): Promise<ModuleCheckResult> {
    return toModuleCheck(parseModuleCheck(await this.api.post("/v1/staff/modules/check", json)));
  }
  async publishModule(json: unknown): Promise<ModulePublishResult> {
    return toModulePublishResult(parseModulePublishResult(await this.api.post("/v1/staff/modules", json)));
  }
  async getModuleVersion(moduleId: string, contentVersion: number): Promise<TetherlessModule> {
    if (!moduleId.trim()) throw new ApiError("INVALID_INPUT", 422);
    const body = await this.api.get(`/v1/staff/modules/${encodeURIComponent(moduleId)}/versions/${encodeURIComponent(String(contentVersion))}`);
    if (!isRecord(body)) invalid();
    return body as unknown as TetherlessModule;
  }
  async archiveModule(moduleId: string): Promise<void> {
    if (!moduleId.trim()) throw new ApiError("INVALID_INPUT", 422);
    await this.api.post(`/v1/staff/modules/${encodeURIComponent(moduleId)}/archive`, {});
  }
  async purgeModule(moduleId: string): Promise<void> {
    if (!moduleId.trim()) throw new ApiError("INVALID_INPUT", 422);
    await this.api.delete(`/v1/staff/modules/${encodeURIComponent(moduleId)}`);
  }
  async listAssignments(cohortId: string): Promise<Assignment[]> {
    if (!cohortId.trim()) throw new ApiError("INVALID_INPUT", 422);
    return list(record(await this.api.get(`/v1/staff/assignments?cohort_id=${encodeURIComponent(cohortId)}`)).assignments).map(parseAssignment).map(toAssignment);
  }
  async assign(input: { moduleId: string; contentVersion?: number | null; cohortId?: string; learnerId?: string }): Promise<Assignment> {
    const hasCohort = !!input.cohortId, hasLearner = !!input.learnerId;
    if (!input.moduleId.trim() || hasCohort === hasLearner) throw new ApiError("INVALID_INPUT", 422);
    const body: Record<string, unknown> = { module_id: input.moduleId };
    if (input.contentVersion !== undefined && input.contentVersion !== null) body.content_version = input.contentVersion;
    if (hasCohort) body.cohort_id = input.cohortId; else body.learner_id = input.learnerId;
    return toAssignment(parseAssignment(record(await this.api.post("/v1/staff/assignments", body)).assignment));
  }
  async unassign(assignmentId: string): Promise<void> {
    if (!assignmentId.trim()) throw new ApiError("INVALID_INPUT", 422);
    await this.api.post(`/v1/staff/assignments/${encodeURIComponent(assignmentId)}/remove`, {});
  }
  async createLearner(input: { cohortId: string; firstName: string; lastName: string }): Promise<SetupCodeReveal> {
    const firstName = input.firstName.trim(), lastName = input.lastName.trim();
    if (!input.cohortId.trim() || !firstName || !lastName) throw new ApiError("INVALID_INPUT", 422);
    const body = record(await this.api.post("/v1/staff/learners", { cohort_id: input.cohortId, first_name: firstName, last_name: lastName }));
    const setupCode = text(body.setup_code);
    const learnerId = text(record(body.learner).learner_id);
    if (!setupCode || !learnerId) invalid();
    return { learnerId, setupCode, shownOnce: true };
  }
  async getLearnerRecord(learnerId: string): Promise<LearnerRecord> {
    if (!learnerId.trim()) throw new ApiError("INVALID_INPUT", 422);
    return toLearnerRecord(parseLearner(await this.api.get(`/v1/staff/learners/${encodeURIComponent(learnerId)}`)));
  }
  async updateLearner(learnerId: string, changes: LearnerFieldChanges): Promise<LearnerRecord> {
    if (!learnerId.trim()) throw new ApiError("INVALID_INPUT", 422);
    const body: Record<string, unknown> = {};
    if (changes.firstName !== undefined) body.first_name = changes.firstName;
    if (changes.lastName !== undefined) body.last_name = changes.lastName;
    if (changes.phone !== undefined) body.phone = changes.phone;
    if (changes.email !== undefined) body.email = changes.email;
    if (changes.trainingLevel !== undefined) body.training_level = changes.trainingLevel;
    if (changes.note1 !== undefined) body.note_1 = changes.note1;
    if (changes.note2 !== undefined) body.note_2 = changes.note2;
    return toLearnerRecord(parseLearner(await this.api.patch(`/v1/staff/learners/${encodeURIComponent(learnerId)}`, body)));
  }
  async archiveLearner(learnerId: string): Promise<void> {
    if (!learnerId.trim()) throw new ApiError("INVALID_INPUT", 422);
    await this.api.post(`/v1/staff/learners/${encodeURIComponent(learnerId)}/archive`, {});
  }
  async issueSetupCode(learnerId: string, switchOffExistingPhones: boolean): Promise<{ setupCode: string; phonesSwitchedOff: number }> {
    if (!learnerId.trim()) throw new ApiError("INVALID_INPUT", 422);
    const body = record(await this.api.post(`/v1/staff/learners/${encodeURIComponent(learnerId)}/setup-code`, { switch_off_existing_phones: switchOffExistingPhones }));
    return { setupCode: text(body.setup_code), phonesSwitchedOff: number(body.phones_switched_off) };
  }
  async switchOffPhone(learnerId: string, deviceId: string): Promise<void> {
    if (!learnerId.trim() || !deviceId.trim()) throw new ApiError("INVALID_INPUT", 422);
    await this.api.post(`/v1/staff/learners/${encodeURIComponent(learnerId)}/devices/${encodeURIComponent(deviceId)}/switch-off`, {});
  }
  async purgeLearner(learnerId: string, confirmLearnerCode: string): Promise<{ eventsDeleted: number }> {
    if (!learnerId.trim() || !confirmLearnerCode.trim()) throw new ApiError("INVALID_INPUT", 422);
    const body = record(await this.api.post(`/v1/staff/learners/${encodeURIComponent(learnerId)}/purge`, { confirm: confirmLearnerCode }));
    return { eventsDeleted: number(body.events_deleted) };
  }
  async listStaff(): Promise<StaffAccountSummary[]> {
    const body = record(await this.api.get("/v1/staff/accounts"));
    if (!Array.isArray(body.accounts)) return invalid();
    return body.accounts.map(mapAccount);
  }
  async createStaff(input: { role: StaffRole; username: string; displayName: string }): Promise<StaffAccountReveal> {
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
  async setStaffDisabled(staffId: string, disabled: boolean): Promise<void> {
    if (!staffId.trim()) throw new ApiError("INVALID_INPUT", 422);
    await this.api.post(`/v1/staff/accounts/${encodeURIComponent(staffId)}/${disabled ? "disable" : "enable"}`, {});
  }
  async getRolePermissions(): Promise<{ roles: Record<StaffRole, StaffPermissionKey[]>; permissions: StaffPermissionKey[] }> {
    const body = record(await this.api.get("/v1/staff/roles"));
    return { roles: parseRolePermissions(body.roles), permissions: list(body.permissions).map(text) as StaffPermissionKey[] };
  }
  async setRolePermissions(role: StaffRole, permissions: StaffPermissionKey[]): Promise<void> {
    await this.api.put(`/v1/staff/roles/${encodeURIComponent(role)}/permissions`, { permissions });
  }
  async getThresholds(): Promise<Thresholds> { return parseThresholds(await this.api.get("/v1/staff/settings/thresholds")); }
  async setThresholds(t: Thresholds): Promise<Thresholds> { return parseThresholds(await this.api.put("/v1/staff/settings/thresholds", fromThresholds(t))); }
  async exportCohort(cohortId: string): Promise<Blob> {
    if (!cohortId.trim()) throw new ApiError("INVALID_INPUT", 422);
    return this.api.getBlob(`/v1/staff/cohorts/${encodeURIComponent(cohortId)}/export`);
  }
}
