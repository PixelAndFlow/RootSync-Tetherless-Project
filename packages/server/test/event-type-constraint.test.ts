/**
 * The database's list of event types must equal the contract's. Migration 3 adds a
 * CHECK on events.event_type; this reads its list and compares it with EVENT_TYPES,
 * so adding an event type to the contract without a migration fails here.
 * (That the database really refuses an unknown type is tested in server.test.ts,
 * which runs against Postgres when TEST_DATABASE_URL is set.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EVENT_TYPES } from "../../contract/src/index.ts";

const sql = readFileSync(fileURLToPath(new URL("../db/003-event-type-check.sql", import.meta.url)), "utf8");

test("migration 3's event type list equals the contract's EVENT_TYPES", () => {
  const body = sql.match(/CHECK \(event_type IN \(([\s\S]*?)\)\)/);
  assert.ok(body, "migration 3 has no CHECK (event_type IN (...))");
  const listed = [...body![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...listed].sort(), [...EVENT_TYPES].sort());
});
