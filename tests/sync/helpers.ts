/**
 * Test harness: a fresh database, a fake transport and a clock we control.
 */

import { FakeIDBFactory } from "./fakes/fake-idb.ts";
import { FakeTransport } from "./fakes/fake-transport.ts";
import { openDatabase } from "../../src/sync/stores/db.ts";
import { SyncEngine } from "../../src/sync/engine/sync.ts";
import type { IDBDatabaseLike } from "../../src/sync/stores/idb.ts";
import type { ActivityEvent, EventType } from "../../src/sync/types.ts";

let dbCounter = 0;

export interface Harness {
  db: IDBDatabaseLike;
  transport: FakeTransport;
  engine: SyncEngine;
  /** Advance the fake clock. */
  tick(ms: number): void;
  now(): number;
  makeEvent(over?: Partial<ActivityEvent>): ActivityEvent;
  /** Record an event the way the app would, returning its event_id. */
  record(over?: Partial<ActivityEvent>): Promise<string>;
}

export async function harness(opts: { owner?: string; maxAttempts?: number } = {}): Promise<Harness> {
  dbCounter += 1;
  const factory = new FakeIDBFactory();
  const db = await openDatabase(factory);
  // Force a distinct database per harness by reopening under a fresh name is
  // unnecessary here: each FakeIDBFactory is its own universe.

  let clock = 1_700_000_000_000;
  const now = () => clock;

  const transport = new FakeTransport(now);
  const engine = new SyncEngine({
    db,
    transport,
    owner: opts.owner ?? "device-1:tab-1",
    now,
    maxAttempts: opts.maxAttempts,
    // Deterministic backoff for assertions.
    backoff: { random: () => 0.5 },
  });

  let seq = 0;
  const makeEvent = (over: Partial<ActivityEvent> = {}): ActivityEvent => {
    seq += 1;
    return {
      event_id: `evt-${String(seq).padStart(4, "0")}`,
      schema_version: 1,
      event_type: "answer_submitted" as EventType,
      device_id: "device-1",
      device_seq: seq,
      session_id: "session-1",
      occurred_at: new Date(clock).toISOString(),
      monotonic_ms: 1000 * seq,
      payload: { choice_id: "c1" },
      module_id: "mod-1",
      content_version: 1,
      attempt_id: "attempt-1",
      question_id: `q-${seq}`,
      ...over,
    };
  };

  const record = async (over: Partial<ActivityEvent> = {}): Promise<string> => {
    const { recordEvent } = await import("../../src/sync/stores/db.ts");
    const e = makeEvent(over);
    await recordEvent(db, e, now());
    return e.event_id;
  };

  return {
    db,
    transport,
    engine,
    now,
    tick: (ms: number) => {
      clock += ms;
    },
    makeEvent,
    record,
  };
}
