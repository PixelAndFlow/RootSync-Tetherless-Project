/**
 * Regression for issue #11: migration 3 never recorded itself in
 * schema_migrations, so every server restart re-ran its ALTER TABLE ... ADD
 * CONSTRAINT and crashed with "constraint already exists" once it had
 * already succeeded once. Needs a real PostgreSQL (TEST_DATABASE_URL); the
 * MemoryStore has no migrations or constraints to re-run.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PgStore } from "../src/pg-store.ts";

const ADMIN = process.env.TEST_DATABASE_URL;

async function freshDb(): Promise<string> {
  const admin = new URL(ADMIN!);
  const db = `tetherless_test_${randomBytes(4).toString("hex")}`;
  execFileSync("psql", [admin.toString(), "-c", `CREATE DATABASE ${db}`], { stdio: "ignore" });
  admin.pathname = `/${db}`;
  return admin.toString();
}

/** Reads the ledger directly, without going through PgStore.connect() -- which would
 * run migrate() itself and mask the very "stuck" state the second test sets up. */
async function appliedVersions(url: string): Promise<number[]> {
  const pool = new pg.Pool({ connectionString: url });
  const rows = (await pool.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version")).rows;
  await pool.end();
  return rows.map((r) => Number(r.version));
}

test("surviving several restarts: migrate() is safe to run again once every migration already succeeded", async (t) => {
  if (!ADMIN) return t.skip("set TEST_DATABASE_URL to run this against a real PostgreSQL");
  const url = await freshDb();

  for (let restart = 1; restart <= 3; restart += 1) {
    const store = await PgStore.connect(url); // throws (crashes, in production) if migrate() is not idempotent
    await store.close();
  }
  assert.deepEqual(await appliedVersions(url), [1, 2, 3]);
});

test("recovering a database stuck in the pre-fix state: constraint already exists, but version 3 was never recorded", async (t) => {
  if (!ADMIN) return t.skip("set TEST_DATABASE_URL to run this against a real PostgreSQL");
  const url = await freshDb();

  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  execFileSync("psql", [url, "-f", `${repoRoot}/packages/server/db/schema.sql`], { stdio: "ignore" });
  execFileSync("psql", [url, "-f", `${repoRoot}/packages/server/db/002-spec-v1.10.sql`], { stdio: "ignore" });
  // The exact statement the old, unfixed migration 3 ran, applied directly and
  // without recording version 3 -- reproducing exactly what already happened
  // in production before this fix shipped.
  const oldAlter = `ALTER TABLE events ADD CONSTRAINT events_event_type_known CHECK (event_type IN (
    'session_started', 'visibility_changed', 'heartbeat', 'session_ended',
    'attempt_started', 'answer_submitted', 'attempt_completed', 'attempt_abandoned'
  ));`;
  execFileSync("psql", [url, "-c", oldAlter], { stdio: "ignore" });
  assert.deepEqual(await appliedVersions(url), [1, 2], "stuck state: constraint applied, but version 3 not yet recorded");

  const store = await PgStore.connect(url); // must self-heal, not crash
  await store.close();
  assert.deepEqual(await appliedVersions(url), [1, 2, 3]);
});
