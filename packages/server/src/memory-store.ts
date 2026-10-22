import type { StoredEvent } from "../../contract/src/index.ts";
import type { Role } from "./permissions.ts";
import type {
  Assignment,
  AuditEntry,
  Cohort,
  Device,
  InsertResult,
  Learner,
  LearnerFields,
  ModuleRow,
  ModuleVersionRow,
  RejectedEvent,
  RosterImport,
  SetupCodeRow,
  Staff,
  Store,
  UseSetupCodeInput,
  UseSetupCodeResult,
} from "./store.ts";

const clone = <T>(v: T): T => structuredClone(v);
/** Same order as PgStore: oldest first, cohort-wide before individual, then module. */
const assignmentOrder = (a: Assignment, b: Assignment) =>
  a.created_at.localeCompare(b.created_at) || Number(a.cohort_id === null) - Number(b.cohort_id === null) || a.module_id.localeCompare(b.module_id);

/** In-memory store for tests and demos. Same rules as PgStore; data is lost on restart. */
export class MemoryStore implements Store {
  private staff = new Map<string, Staff>();
  private sessions = new Map<string, { staff_id: string; expires_at: string }>();
  private rolePerms: Partial<Record<Role, string[]>> = {};
  private settings = new Map<string, unknown>();
  private cohorts = new Map<string, Cohort>();
  private learners = new Map<string, Learner>();
  private codes = new Map<string, SetupCodeRow & { used_at: string | null; replaced_at: string | null }>();
  private devices = new Map<string, Device & { token_hash: string }>();
  private events = new Map<string, { e: StoredEvent; hash: string }>();
  private rejected = new Map<string, RejectedEvent>();
  private modules = new Map<string, ModuleRow>();
  private versions: ModuleVersionRow[] = [];
  private assignments = new Map<string, Assignment>();
  private imports = new Map<string, RosterImport>();
  readonly audit: AuditEntry[] = [];

  async close(): Promise<void> {}

  // ---- staff
  async createStaff(s: Staff) {
    if ([...this.staff.values()].some((x) => x.username === s.username)) return false;
    this.staff.set(s.staff_id, clone(s));
    return true;
  }
  async getStaff(id: string) {
    const s = this.staff.get(id);
    return s && clone(s);
  }
  async getStaffByUsername(username: string) {
    const s = [...this.staff.values()].find((x) => x.username === username);
    return s && clone(s);
  }
  async listStaff() {
    return [...this.staff.values()].map(clone).sort((a, b) => a.username.localeCompare(b.username));
  }
  async updateStaff(id: string, patch: Partial<Staff>) {
    const s = this.staff.get(id);
    if (!s) return false;
    Object.assign(s, patch);
    return true;
  }
  async createStaffSession(tokenHash: string, staffId: string, expiresAt: string) {
    this.sessions.set(tokenHash, { staff_id: staffId, expires_at: expiresAt });
  }
  async getStaffSession(tokenHash: string, now: string) {
    const s = this.sessions.get(tokenHash);
    if (!s || s.expires_at <= now) return undefined;
    const staff = this.staff.get(s.staff_id);
    return staff && !staff.disabled_at ? clone(staff) : undefined;
  }
  async deleteStaffSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async deleteStaffSessions(staffId: string) {
    for (const [k, v] of this.sessions) if (v.staff_id === staffId) this.sessions.delete(k);
  }
  async getRolePermissions() {
    return clone(this.rolePerms);
  }
  async setRolePermissions(role: Role, permissions: string[]) {
    this.rolePerms[role] = [...new Set(permissions)].sort();
  }

  // ---- settings
  async getSetting<T>(key: string) {
    return this.settings.has(key) ? (clone(this.settings.get(key)) as T) : undefined;
  }
  async setSetting(key: string, value: unknown) {
    this.settings.set(key, clone(value));
  }

  // ---- cohorts
  private nameTaken(name: string, except?: string) {
    return [...this.cohorts.values()].some((c) => c.cohort_id !== except && c.name.toLowerCase() === name.toLowerCase());
  }
  async createCohort(c: Cohort) {
    if (this.nameTaken(c.name)) return false;
    this.cohorts.set(c.cohort_id, clone(c));
    return true;
  }
  async getCohort(id: string) {
    const c = this.cohorts.get(id);
    return c && clone(c);
  }
  async listCohorts(includeArchived: boolean) {
    return [...this.cohorts.values()]
      .filter((c) => includeArchived || !c.archived_at)
      .map((c) => ({ ...clone(c), learners: [...this.learners.values()].filter((l) => l.cohort_id === c.cohort_id && !l.archived_at).length }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async updateCohort(id: string, patch: { name?: string; archived_at?: string }) {
    const c = this.cohorts.get(id);
    if (!c) return "not_found" as const;
    if (patch.name !== undefined && this.nameTaken(patch.name, id)) return "name_taken" as const;
    Object.assign(c, patch);
    return "ok" as const;
  }

  // ---- learners
  async createLearner(l: Learner) {
    if ([...this.learners.values()].some((x) => x.learner_code === l.learner_code)) return false;
    this.learners.set(l.learner_id, clone(l));
    return true;
  }
  async getLearner(id: string) {
    const l = this.learners.get(id);
    return l && clone(l);
  }
  async listLearners(cohortId: string, opts: { includeArchived?: boolean; search?: string } = {}) {
    const q = opts.search?.toLowerCase();
    return [...this.learners.values()]
      .filter((l) => l.cohort_id === cohortId && (opts.includeArchived || !l.archived_at))
      .filter((l) => !q || [l.first_name, l.last_name, l.username ?? "", l.learner_code].some((f) => f.toLowerCase().includes(q)))
      .map(clone)
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name) || a.learner_code.localeCompare(b.learner_code));
  }
  async updateLearner(id: string, patch: Partial<LearnerFields> & { archived_at?: string }) {
    const l = this.learners.get(id);
    if (!l) return false;
    Object.assign(l, patch);
    return true;
  }
  async lastSyncedByCohort(cohortId: string) {
    const ids = new Set([...this.learners.values()].filter((l) => l.cohort_id === cohortId).map((l) => l.learner_id));
    const out = new Map<string, string>();
    for (const { e } of this.events.values()) {
      if (!ids.has(e.learner_id)) continue;
      const prev = out.get(e.learner_id);
      if (!prev || e.received_at > prev) out.set(e.learner_id, e.received_at);
    }
    return out;
  }

  // ---- setup codes and devices
  async addSetupCode(c: SetupCodeRow) {
    for (const x of this.codes.values()) if (x.learner_id === c.learner_id && !x.used_at && !x.replaced_at) x.replaced_at = c.created_at;
    this.codes.set(c.code_hash, { ...clone(c), used_at: null, replaced_at: null });
  }
  async useSetupCode(input: UseSetupCodeInput): Promise<UseSetupCodeResult> {
    const code = this.codes.get(input.code_hash);
    if (!code || code.replaced_at) return { ok: false, reason: "INVALID_CODE" };
    if (code.used_at) return { ok: false, reason: "CODE_USED" };
    const learner = this.learners.get(code.learner_id);
    if (!learner || learner.archived_at) return { ok: false, reason: "INVALID_CODE" };
    if (this.devices.has(input.device.device_id)) return { ok: false, reason: "DEVICE_EXISTS" };
    learner.username = input.username;
    this.devices.set(input.device.device_id, { device_id: input.device.device_id, learner_id: learner.learner_id, created_at: input.now, revoked_at: null, token_hash: input.device.token_hash });
    code.used_at = input.now;
    return { ok: true, learner: clone(learner), cohort: clone(this.cohorts.get(learner.cohort_id)!) };
  }
  async getDeviceByTokenHash(tokenHash: string) {
    const d = [...this.devices.values()].find((x) => x.token_hash === tokenHash);
    return d && { device_id: d.device_id, learner_id: d.learner_id, created_at: d.created_at, revoked_at: d.revoked_at };
  }
  async listDevices(learnerId: string) {
    return [...this.devices.values()].filter((d) => d.learner_id === learnerId).map(({ token_hash: _t, ...d }) => clone(d));
  }
  async revokeDevice(learnerId: string, deviceId: string, now: string) {
    const d = this.devices.get(deviceId);
    if (!d || d.learner_id !== learnerId || d.revoked_at) return false;
    d.revoked_at = now;
    return true;
  }
  async revokeDevicesForLearner(learnerId: string, now: string) {
    let n = 0;
    for (const d of this.devices.values()) {
      if (d.learner_id === learnerId && !d.revoked_at) {
        d.revoked_at = now;
        n++;
      }
    }
    return n;
  }

  // ---- events
  async insertEvent(e: StoredEvent, contentHash: string): Promise<InsertResult> {
    const existing = this.events.get(e.event_id);
    if (existing) return existing.hash === contentHash ? "duplicate" : "conflict";
    this.events.set(e.event_id, { e: clone(e), hash: contentHash });
    return "inserted";
  }
  async insertRejected(r: RejectedEvent) {
    if (!this.rejected.has(r.raw_hash)) this.rejected.set(r.raw_hash, clone(r));
  }
  async listEvents(learnerId: string) {
    return [...this.events.values()].filter((x) => x.e.learner_id === learnerId).map((x) => clone(x.e));
  }
  async listRejected(learnerId: string) {
    return [...this.rejected.values()].filter((r) => r.learner_id === learnerId).map(clone);
  }
  async moduleHasEvents(moduleId: string) {
    return [...this.events.values()].some((x) => "module_id" in x.e && x.e.module_id === moduleId);
  }

  // ---- content
  async listModules(includeArchived: boolean) {
    return [...this.modules.values()].filter((m) => includeArchived || !m.archived_at).map(clone).sort((a, b) => a.module_id.localeCompare(b.module_id));
  }
  async getModule(id: string) {
    const m = this.modules.get(id);
    return m && clone(m);
  }
  async listModuleVersions() {
    return this.versions.map(clone);
  }
  async publishModuleVersion(module: ModuleRow, version: ModuleVersionRow) {
    if (this.versions.some((v) => v.module_id === version.module_id && v.content_version === version.content_version)) return "version_exists" as const;
    if (!this.modules.has(module.module_id)) this.modules.set(module.module_id, clone(module));
    this.versions.push(clone(version));
    return "ok" as const;
  }
  async archiveModule(id: string, now: string) {
    const m = this.modules.get(id);
    if (!m || m.archived_at) return false;
    m.archived_at = now;
    return true;
  }
  async deleteModule(id: string) {
    if (!this.modules.delete(id)) return false;
    this.versions = this.versions.filter((v) => v.module_id !== id);
    for (const [k, a] of this.assignments) if (a.module_id === id) this.assignments.delete(k);
    return true;
  }

  // ---- assignments
  async createAssignment(a: Assignment) {
    this.assignments.set(a.assignment_id, clone(a));
  }
  async getAssignment(id: string) {
    const a = this.assignments.get(id);
    return a && clone(a);
  }
  async listAssignmentsForCohort(cohortId: string) {
    return [...this.assignments.values()]
      .filter((a) => !a.removed_at && (a.cohort_id === cohortId || (a.learner_id && this.learners.get(a.learner_id)?.cohort_id === cohortId)))
      .map(clone)
      .sort(assignmentOrder);
  }
  async listAssignmentsForLearner(learnerId: string, cohortId: string) {
    return [...this.assignments.values()]
      .filter((a) => !a.removed_at && (a.learner_id === learnerId || a.cohort_id === cohortId))
      .map(clone)
      .sort(assignmentOrder);
  }
  async removeAssignment(id: string, now: string) {
    const a = this.assignments.get(id);
    if (!a || a.removed_at) return false;
    a.removed_at = now;
    return true;
  }
  async moduleHasAssignments(moduleId: string) {
    return [...this.assignments.values()].some((a) => a.module_id === moduleId);
  }

  // ---- roster imports
  async saveRosterImport(r: RosterImport) {
    this.imports.set(r.import_id, clone(r));
  }
  async getRosterImport(id: string, now: string) {
    const r = this.imports.get(id);
    return r && r.expires_at > now ? clone(r) : undefined;
  }
  async deleteRosterImport(id: string) {
    this.imports.delete(id);
  }

  // ---- privacy and audit
  async purgeLearner(learnerId: string) {
    if (!this.learners.delete(learnerId)) return false;
    for (const [k, x] of this.events) if (x.e.learner_id === learnerId) this.events.delete(k);
    for (const [k, r] of this.rejected) if (r.learner_id === learnerId) this.rejected.delete(k);
    for (const [k, d] of this.devices) if (d.learner_id === learnerId) this.devices.delete(k);
    for (const [k, c] of this.codes) if (c.learner_id === learnerId) this.codes.delete(k);
    for (const [k, a] of this.assignments) if (a.learner_id === learnerId) this.assignments.delete(k);
    return true;
  }
  async addAudit(e: AuditEntry) {
    this.audit.push(clone(e));
  }
}
