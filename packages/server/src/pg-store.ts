/**
 * PostgreSQL store. Uses the `pg` package (the only runtime dependency of the
 * server), loaded only when DATABASE_URL is set so tests run without it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { StoredEvent } from "../../contract/src/index.ts";
import type { TetherlessModule } from "../../content/src/index.ts";
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

interface QueryResult<R> {
  rows: R[];
  rowCount: number | null;
}
interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}
interface PoolClient extends Queryable {
  release(): void;
}
interface Pool extends Queryable {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}
type Row = Record<string, unknown>;

const MIGRATIONS = [
  { version: 1, file: new URL("../db/schema.sql", import.meta.url) },
  { version: 2, file: new URL("../db/002-spec-v1.10.sql", import.meta.url) },
  { version: 3, file: new URL("../db/003-event-type-check.sql", import.meta.url) },
];

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const json = (v: unknown): unknown => (typeof v === "string" ? JSON.parse(v) : v);

const STAFF_COLS = "staff_id, username, display_name, role, password_hash, must_change_password, created_at, created_by, disabled_at";
const LEARNER_COLS = "learner_id, cohort_id, learner_code, first_name, last_name, username, phone, email, training_level, note_1, note_2, created_at, created_by, archived_at";
const LEARNER_FIELDS = ["first_name", "last_name", "phone", "email", "training_level", "note_1", "note_2", "archived_at"] as const;

const mapStaff = (r: Row): Staff => ({
  staff_id: String(r.staff_id),
  username: String(r.username),
  display_name: String(r.display_name),
  role: r.role as Role,
  password_hash: String(r.password_hash),
  must_change_password: r.must_change_password === true || r.must_change_password === "t",
  created_at: iso(r.created_at),
  created_by: strOrNull(r.created_by),
  disabled_at: isoOrNull(r.disabled_at),
});
const mapCohort = (r: Row): Cohort => ({
  cohort_id: String(r.cohort_id),
  name: String(r.name),
  created_at: iso(r.created_at),
  created_by: strOrNull(r.created_by),
  archived_at: isoOrNull(r.archived_at),
});
const mapLearner = (r: Row): Learner => ({
  learner_id: String(r.learner_id),
  cohort_id: String(r.cohort_id),
  learner_code: String(r.learner_code),
  first_name: String(r.first_name),
  last_name: String(r.last_name),
  username: strOrNull(r.username),
  phone: strOrNull(r.phone),
  email: strOrNull(r.email),
  training_level: strOrNull(r.training_level),
  note_1: strOrNull(r.note_1),
  note_2: strOrNull(r.note_2),
  created_at: iso(r.created_at),
  created_by: strOrNull(r.created_by),
  archived_at: isoOrNull(r.archived_at),
});
const mapDevice = (r: Row): Device => ({ device_id: String(r.device_id), learner_id: String(r.learner_id), created_at: iso(r.created_at), revoked_at: isoOrNull(r.revoked_at) });
const mapModule = (r: Row): ModuleRow => ({
  module_id: String(r.module_id),
  activity_type: String(r.activity_type),
  created_by: strOrNull(r.created_by),
  created_at: iso(r.created_at),
  archived_at: isoOrNull(r.archived_at),
});
const mapAssignment = (r: Row): Assignment => ({
  assignment_id: String(r.assignment_id),
  module_id: String(r.module_id),
  content_version: r.content_version === null || r.content_version === undefined ? null : Number(r.content_version),
  cohort_id: strOrNull(r.cohort_id),
  learner_id: strOrNull(r.learner_id),
  created_by: strOrNull(r.created_by),
  created_at: iso(r.created_at),
  removed_at: isoOrNull(r.removed_at),
});

export class PgStore implements Store {
  private readonly pool: Pool;
  private constructor(pool: Pool) {
    this.pool = pool;
  }

  /** For tests: wrap any pg-compatible pool. Call migrate() before use. */
  static fromPool(pool: Pool): PgStore {
    return new PgStore(pool);
  }

  static async connect(databaseUrl: string): Promise<PgStore> {
    const driver = "pg"; // kept in a variable so TypeScript and tests don't need the package installed
    const pg = (await import(driver)) as unknown as { default: { Pool: new (cfg: { connectionString: string; max?: number }) => Pool } };
    const store = new PgStore(new pg.default.Pool({ connectionString: databaseUrl, max: 10 }));
    await store.migrate();
    return store;
  }

  /** Apply pending migrations, each in its own transaction. Safe to run on every start. */
  async migrate(): Promise<void> {
    await this.pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await this.pool.query<{ version: number }>("SELECT version FROM schema_migrations")).rows.map((r) => Number(r.version)));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await this.tx(async (c) => {
        await c.query(readFileSync(fileURLToPath(m.file), "utf8"));
      });
    }
  }

  private async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  // ---- staff
  async createStaff(s: Staff) {
    const r = await this.pool.query(
      `INSERT INTO staff (${STAFF_COLS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
      [s.staff_id, s.username, s.display_name, s.role, s.password_hash, s.must_change_password, s.created_at, s.created_by, s.disabled_at],
    );
    return r.rowCount === 1;
  }
  async getStaff(id: string) {
    const r = await this.pool.query<Row>(`SELECT ${STAFF_COLS} FROM staff WHERE staff_id = $1`, [id]);
    return r.rows[0] && mapStaff(r.rows[0]);
  }
  async getStaffByUsername(username: string) {
    const r = await this.pool.query<Row>(`SELECT ${STAFF_COLS} FROM staff WHERE username = $1`, [username]);
    return r.rows[0] && mapStaff(r.rows[0]);
  }
  async listStaff() {
    return (await this.pool.query<Row>(`SELECT ${STAFF_COLS} FROM staff ORDER BY username`)).rows.map(mapStaff);
  }
  async updateStaff(id: string, patch: Partial<Pick<Staff, "password_hash" | "must_change_password" | "disabled_at" | "display_name">>) {
    const keys = (["password_hash", "must_change_password", "disabled_at", "display_name"] as const).filter((k) => k in patch);
    if (!keys.length) return !!(await this.getStaff(id));
    const r = await this.pool.query(`UPDATE staff SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE staff_id = $1`, [id, ...keys.map((k) => patch[k] ?? null)]);
    return r.rowCount === 1;
  }
  async createStaffSession(tokenHash: string, staffId: string, expiresAt: string) {
    await this.pool.query("INSERT INTO staff_sessions (token_hash, staff_id, expires_at) VALUES ($1, $2, $3)", [tokenHash, staffId, expiresAt]);
  }
  async getStaffSession(tokenHash: string, now: string) {
    const r = await this.pool.query<Row>(
      `SELECT ${STAFF_COLS.split(", ").map((c) => `s.${c}`).join(", ")} FROM staff_sessions x JOIN staff s USING (staff_id)
        WHERE x.token_hash = $1 AND x.expires_at > $2 AND s.disabled_at IS NULL`,
      [tokenHash, now],
    );
    return r.rows[0] && mapStaff(r.rows[0]);
  }
  async deleteStaffSession(tokenHash: string) {
    await this.pool.query("DELETE FROM staff_sessions WHERE token_hash = $1", [tokenHash]);
  }
  async deleteStaffSessions(staffId: string) {
    await this.pool.query("DELETE FROM staff_sessions WHERE staff_id = $1", [staffId]);
  }
  async getRolePermissions() {
    const out: Partial<Record<Role, string[]>> = {};
    for (const r of (await this.pool.query<{ role: Role; permission: string }>("SELECT role, permission FROM role_permissions ORDER BY role, permission")).rows) {
      (out[r.role] ??= []).push(r.permission);
    }
    return out;
  }
  async setRolePermissions(role: Role, permissions: string[]) {
    await this.tx(async (c) => {
      await c.query("DELETE FROM role_permissions WHERE role = $1", [role]);
      for (const p of [...new Set(permissions)].sort()) await c.query("INSERT INTO role_permissions (role, permission) VALUES ($1, $2)", [role, p]);
    });
  }

  // ---- settings
  async getSetting<T>(key: string) {
    const r = await this.pool.query<{ value: unknown }>("SELECT value FROM settings WHERE key = $1", [key]);
    return r.rows[0] ? (json(r.rows[0].value) as T) : undefined;
  }
  async setSetting(key: string, value: unknown, staffId: string | null, now: string) {
    await this.pool.query(
      `INSERT INTO settings (key, value, updated_at, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
      [key, JSON.stringify(value), now, staffId],
    );
  }

  // ---- cohorts
  async createCohort(c: Cohort) {
    const r = await this.pool.query("INSERT INTO cohorts (cohort_id, name, created_by, created_at, archived_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", [
      c.cohort_id,
      c.name,
      c.created_by,
      c.created_at,
      c.archived_at,
    ]);
    return r.rowCount === 1;
  }
  async getCohort(id: string) {
    const r = await this.pool.query<Row>("SELECT cohort_id, name, created_at, created_by, archived_at FROM cohorts WHERE cohort_id = $1", [id]);
    return r.rows[0] && mapCohort(r.rows[0]);
  }
  async listCohorts(includeArchived: boolean) {
    const r = await this.pool.query<Row>(
      `SELECT c.cohort_id, c.name, c.created_at, c.created_by, c.archived_at, count(l.learner_id) AS learners
         FROM cohorts c LEFT JOIN learners l ON l.cohort_id = c.cohort_id AND l.archived_at IS NULL
        WHERE $1 OR c.archived_at IS NULL
        GROUP BY c.cohort_id ORDER BY c.created_at`,
      [includeArchived],
    );
    return r.rows.map((x) => ({ ...mapCohort(x), learners: Number(x.learners) }));
  }
  async updateCohort(id: string, patch: { name?: string; archived_at?: string }) {
    if (!(await this.getCohort(id))) return "not_found" as const;
    if (patch.name !== undefined) {
      const clash = await this.pool.query("SELECT 1 FROM cohorts WHERE lower(name) = lower($1) AND cohort_id <> $2", [patch.name, id]);
      if (clash.rows.length) return "name_taken" as const;
      await this.pool.query("UPDATE cohorts SET name = $2 WHERE cohort_id = $1", [id, patch.name]);
    }
    if (patch.archived_at !== undefined) await this.pool.query("UPDATE cohorts SET archived_at = $2 WHERE cohort_id = $1", [id, patch.archived_at]);
    return "ok" as const;
  }

  // ---- learners
  async createLearner(l: Learner) {
    const r = await this.pool.query(
      `INSERT INTO learners (${LEARNER_COLS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT DO NOTHING`,
      [l.learner_id, l.cohort_id, l.learner_code, l.first_name, l.last_name, l.username, l.phone, l.email, l.training_level, l.note_1, l.note_2, l.created_at, l.created_by, l.archived_at],
    );
    return r.rowCount === 1;
  }
  async getLearner(id: string) {
    const r = await this.pool.query<Row>(`SELECT ${LEARNER_COLS} FROM learners WHERE learner_id = $1`, [id]);
    return r.rows[0] && mapLearner(r.rows[0]);
  }
  async listLearners(cohortId: string, opts: { includeArchived?: boolean; search?: string } = {}) {
    const r = await this.pool.query<Row>(
      `SELECT ${LEARNER_COLS} FROM learners
        WHERE cohort_id = $1 AND ($2 OR archived_at IS NULL)
          AND ($3::text IS NULL OR strpos(lower(first_name || ' ' || last_name || ' ' || coalesce(username, '') || ' ' || learner_code), lower($3::text)) > 0)
        ORDER BY last_name, first_name, learner_code`,
      [cohortId, !!opts.includeArchived, opts.search ?? null],
    );
    return r.rows.map(mapLearner);
  }
  async updateLearner(id: string, patch: Partial<LearnerFields> & { archived_at?: string }) {
    const keys = LEARNER_FIELDS.filter((k) => k in patch);
    if (!keys.length) return !!(await this.getLearner(id));
    const r = await this.pool.query(`UPDATE learners SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE learner_id = $1`, [
      id,
      ...keys.map((k) => (patch as Record<string, unknown>)[k] ?? null),
    ]);
    return r.rowCount === 1;
  }
  async lastSyncedByCohort(cohortId: string) {
    const r = await this.pool.query<{ learner_id: string; last: unknown }>(
      "SELECT l.learner_id, max(e.received_at) AS last FROM learners l JOIN events e ON e.learner_id = l.learner_id WHERE l.cohort_id = $1 GROUP BY l.learner_id",
      [cohortId],
    );
    return new Map(r.rows.map((x) => [String(x.learner_id), iso(x.last)]));
  }

  // ---- setup codes and devices
  async addSetupCode(c: SetupCodeRow) {
    await this.tx(async (q) => {
      await q.query("UPDATE setup_codes SET replaced_at = $2 WHERE learner_id = $1 AND used_at IS NULL AND replaced_at IS NULL", [c.learner_id, c.created_at]);
      await q.query("INSERT INTO setup_codes (code_hash, learner_id, created_by, created_at) VALUES ($1, $2, $3, $4)", [c.code_hash, c.learner_id, c.created_by, c.created_at]);
    });
  }
  async useSetupCode(input: UseSetupCodeInput): Promise<UseSetupCodeResult> {
    return this.tx(async (c) => {
      const code = (await c.query<Row>("SELECT learner_id, used_at, replaced_at FROM setup_codes WHERE code_hash = $1 FOR UPDATE", [input.code_hash])).rows[0];
      if (!code || code.replaced_at) return { ok: false, reason: "INVALID_CODE" } as const;
      if (code.used_at) return { ok: false, reason: "CODE_USED" } as const;
      const lr = (await c.query<Row>(`SELECT ${LEARNER_COLS} FROM learners WHERE learner_id = $1 FOR UPDATE`, [code.learner_id])).rows[0];
      if (!lr || lr.archived_at) return { ok: false, reason: "INVALID_CODE" } as const;
      if ((await c.query("SELECT 1 FROM devices WHERE device_id = $1", [input.device.device_id])).rows.length) return { ok: false, reason: "DEVICE_EXISTS" } as const;
      await c.query("UPDATE learners SET username = $2 WHERE learner_id = $1", [lr.learner_id, input.username]);
      await c.query("INSERT INTO devices (device_id, learner_id, token_hash, created_at) VALUES ($1, $2, $3, $4)", [input.device.device_id, lr.learner_id, input.device.token_hash, input.now]);
      await c.query("UPDATE setup_codes SET used_at = $2 WHERE code_hash = $1", [input.code_hash, input.now]);
      const cohort = mapCohort((await c.query<Row>("SELECT cohort_id, name, created_at, created_by, archived_at FROM cohorts WHERE cohort_id = $1", [lr.cohort_id])).rows[0]!);
      return { ok: true, learner: { ...mapLearner(lr), username: input.username }, cohort } as const;
    });
  }
  async getDeviceByTokenHash(tokenHash: string) {
    const r = await this.pool.query<Row>("SELECT device_id, learner_id, created_at, revoked_at FROM devices WHERE token_hash = $1", [tokenHash]);
    return r.rows[0] && mapDevice(r.rows[0]);
  }
  async listDevices(learnerId: string) {
    return (await this.pool.query<Row>("SELECT device_id, learner_id, created_at, revoked_at FROM devices WHERE learner_id = $1 ORDER BY created_at", [learnerId])).rows.map(mapDevice);
  }
  async revokeDevice(learnerId: string, deviceId: string, now: string) {
    const r = await this.pool.query("UPDATE devices SET revoked_at = $3 WHERE device_id = $1 AND learner_id = $2 AND revoked_at IS NULL", [deviceId, learnerId, now]);
    return r.rowCount === 1;
  }
  async revokeDevicesForLearner(learnerId: string, now: string) {
    const r = await this.pool.query("UPDATE devices SET revoked_at = $2 WHERE learner_id = $1 AND revoked_at IS NULL", [learnerId, now]);
    return r.rowCount ?? 0;
  }

  // ---- events
  async insertEvent(e: StoredEvent, contentHash: string): Promise<InsertResult> {
    const r = await this.pool.query(
      `INSERT INTO events (event_id, learner_id, device_id, device_seq, event_type, occurred_at, received_at, content_hash, body)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (event_id) DO NOTHING`,
      [e.event_id, e.learner_id, e.device_id, e.device_seq, e.event_type, e.occurred_at, e.received_at, contentHash, JSON.stringify(e)],
    );
    if (r.rowCount === 1) return "inserted";
    const existing = await this.pool.query<{ content_hash: string }>("SELECT content_hash FROM events WHERE event_id = $1", [e.event_id]);
    return existing.rows[0]?.content_hash === contentHash ? "duplicate" : "conflict";
  }
  async insertRejected(r: RejectedEvent) {
    await this.pool.query(
      `INSERT INTO rejected_events (raw_hash, event_id, learner_id, device_id, code, message, raw, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (raw_hash) DO NOTHING`,
      [r.raw_hash, r.event_id, r.learner_id, r.device_id, r.code, r.message, JSON.stringify(r.raw ?? null), r.received_at],
    );
  }
  async listEvents(learnerId: string) {
    const r = await this.pool.query<{ body: unknown }>("SELECT body FROM events WHERE learner_id = $1 ORDER BY device_id, device_seq", [learnerId]);
    return r.rows.map((x) => json(x.body) as StoredEvent);
  }
  async listRejected(learnerId: string) {
    const r = await this.pool.query<Row>("SELECT * FROM rejected_events WHERE learner_id = $1 ORDER BY id", [learnerId]);
    return r.rows.map((x) => ({
      event_id: strOrNull(x.event_id),
      learner_id: String(x.learner_id),
      device_id: String(x.device_id),
      code: String(x.code),
      message: String(x.message),
      raw: json(x.raw),
      raw_hash: String(x.raw_hash),
      received_at: iso(x.received_at),
    }));
  }
  async moduleHasEvents(moduleId: string) {
    return (await this.pool.query("SELECT 1 FROM events WHERE body->>'module_id' = $1 LIMIT 1", [moduleId])).rows.length > 0;
  }

  // ---- content
  async listModules(includeArchived: boolean) {
    return (await this.pool.query<Row>("SELECT * FROM modules WHERE $1 OR archived_at IS NULL ORDER BY module_id", [includeArchived])).rows.map(mapModule);
  }
  async getModule(id: string) {
    const r = await this.pool.query<Row>("SELECT * FROM modules WHERE module_id = $1", [id]);
    return r.rows[0] && mapModule(r.rows[0]);
  }
  async listModuleVersions() {
    const r = await this.pool.query<Row>("SELECT module_id, content_version, body, published_by, published_at FROM module_versions ORDER BY module_id, content_version");
    return r.rows.map((x) => ({
      module_id: String(x.module_id),
      content_version: Number(x.content_version),
      body: json(x.body) as TetherlessModule,
      published_by: strOrNull(x.published_by),
      published_at: iso(x.published_at),
    }));
  }
  async publishModuleVersion(m: ModuleRow, v: ModuleVersionRow) {
    return this.tx(async (c) => {
      await c.query("INSERT INTO modules (module_id, activity_type, created_by, created_at, archived_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", [
        m.module_id,
        m.activity_type,
        m.created_by,
        m.created_at,
        m.archived_at,
      ]);
      const r = await c.query("INSERT INTO module_versions (module_id, content_version, body, published_by, published_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", [
        v.module_id,
        v.content_version,
        JSON.stringify(v.body),
        v.published_by,
        v.published_at,
      ]);
      return r.rowCount === 1 ? ("ok" as const) : ("version_exists" as const);
    });
  }
  async archiveModule(id: string, now: string) {
    return (await this.pool.query("UPDATE modules SET archived_at = $2 WHERE module_id = $1 AND archived_at IS NULL", [id, now])).rowCount === 1;
  }
  async deleteModule(id: string) {
    return this.tx(async (c) => {
      await c.query("DELETE FROM assignments WHERE module_id = $1", [id]);
      await c.query("DELETE FROM module_versions WHERE module_id = $1", [id]);
      return (await c.query("DELETE FROM modules WHERE module_id = $1", [id])).rowCount === 1;
    });
  }

  // ---- assignments
  async createAssignment(a: Assignment) {
    await this.pool.query(
      "INSERT INTO assignments (assignment_id, module_id, content_version, cohort_id, learner_id, created_by, created_at, removed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [a.assignment_id, a.module_id, a.content_version, a.cohort_id, a.learner_id, a.created_by, a.created_at, a.removed_at],
    );
  }
  async getAssignment(id: string) {
    const r = await this.pool.query<Row>("SELECT * FROM assignments WHERE assignment_id = $1", [id]);
    return r.rows[0] && mapAssignment(r.rows[0]);
  }
  async listAssignmentsForCohort(cohortId: string) {
    const r = await this.pool.query<Row>(
      `SELECT a.* FROM assignments a LEFT JOIN learners l ON l.learner_id = a.learner_id
        WHERE a.removed_at IS NULL AND (a.cohort_id = $1 OR l.cohort_id = $1) ORDER BY a.created_at, (a.cohort_id IS NULL), a.module_id`,
      [cohortId],
    );
    return r.rows.map(mapAssignment);
  }
  async listAssignmentsForLearner(learnerId: string, cohortId: string) {
    const r = await this.pool.query<Row>("SELECT * FROM assignments WHERE removed_at IS NULL AND (learner_id = $1 OR cohort_id = $2) ORDER BY created_at, (cohort_id IS NULL), module_id", [learnerId, cohortId]);
    return r.rows.map(mapAssignment);
  }
  async removeAssignment(id: string, now: string) {
    return (await this.pool.query("UPDATE assignments SET removed_at = $2 WHERE assignment_id = $1 AND removed_at IS NULL", [id, now])).rowCount === 1;
  }
  async moduleHasAssignments(moduleId: string) {
    return (await this.pool.query("SELECT 1 FROM assignments WHERE module_id = $1 LIMIT 1", [moduleId])).rows.length > 0;
  }

  // ---- roster imports
  async saveRosterImport(r: RosterImport) {
    await this.pool.query("INSERT INTO roster_imports (import_id, cohort_id, valid, rows, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6)", [
      r.import_id,
      r.cohort_id,
      r.valid,
      JSON.stringify(r.rows),
      r.created_by,
      r.expires_at,
    ]);
  }
  async getRosterImport(id: string, now: string) {
    const r = await this.pool.query<Row>("SELECT * FROM roster_imports WHERE import_id = $1 AND expires_at > $2", [id, now]);
    const x = r.rows[0];
    return (
      x && {
        import_id: String(x.import_id),
        cohort_id: String(x.cohort_id),
        valid: x.valid === true || x.valid === "t",
        rows: json(x.rows) as LearnerFields[],
        created_by: strOrNull(x.created_by),
        expires_at: iso(x.expires_at),
      }
    );
  }
  async deleteRosterImport(id: string) {
    await this.pool.query("DELETE FROM roster_imports WHERE import_id = $1", [id]);
  }

  // ---- privacy and audit
  async purgeLearner(learnerId: string) {
    return this.tx(async (c) => {
      if (!(await c.query("SELECT 1 FROM learners WHERE learner_id = $1", [learnerId])).rows.length) return false;
      await c.query("SET LOCAL tetherless.purge = 'on'");
      await c.query("DELETE FROM events WHERE learner_id = $1", [learnerId]);
      await c.query("DELETE FROM rejected_events WHERE learner_id = $1", [learnerId]);
      await c.query("DELETE FROM devices WHERE learner_id = $1", [learnerId]);
      await c.query("DELETE FROM setup_codes WHERE learner_id = $1", [learnerId]);
      await c.query("DELETE FROM assignments WHERE learner_id = $1", [learnerId]);
      await c.query("DELETE FROM learners WHERE learner_id = $1", [learnerId]);
      return true;
    });
  }
  async addAudit(e: AuditEntry) {
    await this.pool.query("INSERT INTO audit_log (staff_id, action, target, detail, at) VALUES ($1, $2, $3, $4, $5)", [e.staff_id, e.action, e.target, JSON.stringify(e.detail ?? null), e.at]);
  }
}
