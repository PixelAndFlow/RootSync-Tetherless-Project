/**
 * PostgreSQL store. Uses the `pg` package (the only runtime dependency of the
 * server), loaded only when DATABASE_URL is set so tests run without it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { StoredEvent } from "../../contract/src/index.ts";
import type { Cohort, Device, EnrollInput, EnrollResult, EnrollmentCode, InsertResult, Learner, RejectedEvent, Store, Trainer } from "./store.ts";

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

const MIGRATIONS = [{ version: 1, file: new URL("../db/schema.sql", import.meta.url) }];

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));
const UNIQUE_VIOLATION = "23505";

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
    const done = new Set((await this.pool.query<{ version: number }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
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

  async createTrainer(t: Trainer) {
    await this.pool.query("INSERT INTO trainers (trainer_id, username, name, password_hash) VALUES ($1, $2, $3, $4)", [t.trainer_id, t.username, t.name, t.password_hash]);
  }
  async getTrainerByUsername(username: string) {
    const r = await this.pool.query<Trainer>("SELECT trainer_id, username, name, password_hash FROM trainers WHERE username = $1 AND disabled_at IS NULL", [username]);
    return r.rows[0];
  }
  async createTrainerSession(tokenHash: string, trainerId: string, expiresAt: string) {
    await this.pool.query("INSERT INTO trainer_sessions (token_hash, trainer_id, expires_at) VALUES ($1, $2, $3)", [tokenHash, trainerId, expiresAt]);
  }
  async getTrainerSession(tokenHash: string, now: string) {
    const r = await this.pool.query<Trainer>(
      `SELECT t.trainer_id, t.username, t.name, t.password_hash FROM trainer_sessions s
         JOIN trainers t USING (trainer_id)
        WHERE s.token_hash = $1 AND s.expires_at > $2 AND t.disabled_at IS NULL`,
      [tokenHash, now],
    );
    return r.rows[0];
  }
  async deleteTrainerSession(tokenHash: string) {
    await this.pool.query("DELETE FROM trainer_sessions WHERE token_hash = $1", [tokenHash]);
  }

  async createCohort(c: Cohort, createdBy: string | null) {
    await this.pool.query("INSERT INTO cohorts (cohort_id, name, created_by, created_at) VALUES ($1, $2, $3, $4)", [c.cohort_id, c.name, createdBy, c.created_at]);
  }
  async getCohort(id: string) {
    const r = await this.pool.query<Cohort>("SELECT cohort_id, name, created_at FROM cohorts WHERE cohort_id = $1", [id]);
    return r.rows[0] && { ...r.rows[0], created_at: iso(r.rows[0].created_at) };
  }
  async listCohorts() {
    const r = await this.pool.query<Cohort & { learners: string }>(
      `SELECT c.cohort_id, c.name, c.created_at, count(l.learner_id) AS learners
         FROM cohorts c LEFT JOIN learners l USING (cohort_id)
        GROUP BY c.cohort_id ORDER BY c.created_at`,
    );
    return r.rows.map((x) => ({ ...x, created_at: iso(x.created_at), learners: Number(x.learners) }));
  }

  async createCode(c: EnrollmentCode) {
    const r = await this.pool.query(
      `INSERT INTO enrollment_codes (code, kind, cohort_id, learner_id, expires_at, revoked_at, max_uses, uses)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (code) DO NOTHING`,
      [c.code, c.kind, c.cohort_id, c.learner_id, c.expires_at, c.revoked_at, c.max_uses, c.uses],
    );
    return r.rowCount === 1;
  }
  private mapCode(r: Record<string, unknown>): EnrollmentCode {
    return {
      code: String(r.code),
      kind: r.kind as EnrollmentCode["kind"],
      cohort_id: String(r.cohort_id),
      learner_id: (r.learner_id as string | null) ?? null,
      expires_at: isoOrNull(r.expires_at),
      revoked_at: isoOrNull(r.revoked_at),
      max_uses: (r.max_uses as number | null) ?? null,
      uses: Number(r.uses),
    };
  }
  async listCodes(cohortId: string) {
    const r = await this.pool.query("SELECT * FROM enrollment_codes WHERE cohort_id = $1 ORDER BY created_at", [cohortId]);
    return r.rows.map((x) => this.mapCode(x));
  }
  async revokeCode(code: string, now: string) {
    const r = await this.pool.query("UPDATE enrollment_codes SET revoked_at = $2 WHERE code = $1 AND revoked_at IS NULL", [code, now]);
    return r.rowCount === 1;
  }

  async enroll(input: EnrollInput): Promise<EnrollResult> {
    return this.tx(async (c) => {
      const codeRow = (await c.query("SELECT * FROM enrollment_codes WHERE code = $1 FOR UPDATE", [input.code])).rows[0];
      const code = codeRow && this.mapCode(codeRow);
      if (!code || code.revoked_at || (code.expires_at && code.expires_at <= input.now) || (code.max_uses !== null && code.uses >= code.max_uses)) {
        return { ok: false, reason: "INVALID_CODE" } as const;
      }
      const cohortRow = (await c.query<Cohort>("SELECT cohort_id, name, created_at FROM cohorts WHERE cohort_id = $1", [code.cohort_id])).rows[0]!;
      const cohort = { ...cohortRow, created_at: iso(cohortRow.created_at) };
      if ((await c.query("SELECT 1 FROM devices WHERE device_id = $1", [input.device.device_id])).rows.length) {
        return { ok: false, reason: "DEVICE_EXISTS" } as const;
      }
      let learner: Learner;
      if (code.kind === "relink") {
        const row = (await c.query<Learner>("SELECT learner_id, cohort_id, name, username, created_at FROM learners WHERE learner_id = $1", [code.learner_id])).rows[0];
        if (!row || row.username !== input.learner.username) return { ok: false, reason: "INVALID_CODE" } as const;
        learner = { ...row, created_at: iso(row.created_at) };
      } else {
        await c.query("SAVEPOINT add_learner");
        try {
          await c.query("INSERT INTO learners (learner_id, cohort_id, name, username, created_at) VALUES ($1, $2, $3, $4, $5)", [
            input.learner.learner_id,
            cohort.cohort_id,
            input.learner.name,
            input.learner.username,
            input.now,
          ]);
        } catch (e) {
          if ((e as { code?: string }).code === UNIQUE_VIOLATION) {
            await c.query("ROLLBACK TO SAVEPOINT add_learner");
            return { ok: false, reason: "USERNAME_TAKEN" } as const;
          }
          throw e;
        }
        learner = { ...input.learner, cohort_id: cohort.cohort_id, created_at: input.now };
      }
      await c.query("INSERT INTO devices (device_id, learner_id, token_hash) VALUES ($1, $2, $3)", [input.device.device_id, learner.learner_id, input.device.token_hash]);
      await c.query("UPDATE enrollment_codes SET uses = uses + 1 WHERE code = $1", [code.code]);
      return { ok: true, learner, cohort } as const;
    });
  }

  async getLearner(id: string) {
    const r = await this.pool.query<Learner>("SELECT learner_id, cohort_id, name, username, created_at FROM learners WHERE learner_id = $1", [id]);
    return r.rows[0] && { ...r.rows[0], created_at: iso(r.rows[0].created_at) };
  }
  async listLearners(cohortId: string) {
    const r = await this.pool.query<Learner>("SELECT learner_id, cohort_id, name, username, created_at FROM learners WHERE cohort_id = $1 ORDER BY username", [cohortId]);
    return r.rows.map((x) => ({ ...x, created_at: iso(x.created_at) }));
  }
  async getDeviceByTokenHash(tokenHash: string) {
    const r = await this.pool.query<Device>("SELECT device_id, learner_id, revoked_at FROM devices WHERE token_hash = $1", [tokenHash]);
    return r.rows[0] && { ...r.rows[0], revoked_at: isoOrNull(r.rows[0].revoked_at) };
  }
  async listDevices(learnerId: string) {
    const r = await this.pool.query<Device>("SELECT device_id, learner_id, revoked_at FROM devices WHERE learner_id = $1 ORDER BY created_at", [learnerId]);
    return r.rows.map((x) => ({ ...x, revoked_at: isoOrNull(x.revoked_at) }));
  }
  async revokeDevice(deviceId: string, now: string) {
    const r = await this.pool.query("UPDATE devices SET revoked_at = $2 WHERE device_id = $1 AND revoked_at IS NULL", [deviceId, now]);
    return r.rowCount === 1;
  }

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
    const r = await this.pool.query<{ body: StoredEvent }>("SELECT body FROM events WHERE learner_id = $1 ORDER BY device_id, device_seq", [learnerId]);
    return r.rows.map((x) => x.body);
  }
  async listRejected(learnerId: string) {
    const r = await this.pool.query<Record<string, unknown>>("SELECT * FROM rejected_events WHERE learner_id = $1 ORDER BY id", [learnerId]);
    return r.rows.map((x) => ({
      event_id: (x.event_id as string | null) ?? null,
      learner_id: String(x.learner_id),
      device_id: String(x.device_id),
      code: String(x.code),
      message: String(x.message),
      raw: x.raw,
      raw_hash: String(x.raw_hash),
      received_at: iso(x.received_at),
    }));
  }
}
