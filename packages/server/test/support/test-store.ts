/**
 * Which store the server tests use:
 *   TEST_DATABASE_URL=postgres://...   PgStore with the real `pg` driver (CI)
 *   TEST_PSQL_HOST=/path/to/socket     PgStore through psql (no npm access)
 *   neither                            MemoryStore
 * Each Postgres run gets a fresh database.
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { MemoryStore } from "../../src/memory-store.ts";
import { PgStore } from "../../src/pg-store.ts";
import type { Store } from "../../src/store.ts";
import { PsqlPool } from "./psql-pool.ts";

export const storeKind = process.env.TEST_DATABASE_URL ? "pg" : process.env.TEST_PSQL_HOST ? "psql" : "memory";

export async function testStore(): Promise<Store> {
  const db = `tetherless_test_${randomBytes(4).toString("hex")}`;
  if (process.env.TEST_DATABASE_URL) {
    const admin = new URL(process.env.TEST_DATABASE_URL);
    execFileSync("psql", [admin.toString(), "-c", `CREATE DATABASE ${db}`], { stdio: "ignore" });
    admin.pathname = `/${db}`;
    return PgStore.connect(admin.toString());
  }
  if (process.env.TEST_PSQL_HOST) {
    execFileSync("psql", ["-X", "-h", process.env.TEST_PSQL_HOST, "-U", "postgres", "-c", `CREATE DATABASE ${db}`], { stdio: "ignore" });
    const store = PgStore.fromPool(new PsqlPool(process.env.TEST_PSQL_HOST, db));
    await store.migrate();
    return store;
  }
  return new MemoryStore();
}
