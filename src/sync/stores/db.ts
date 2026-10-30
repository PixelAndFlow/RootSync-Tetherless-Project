/**
 * The DDIL database.
 *
 * Four stores, and the split is the load-bearing decision:
 *
 *   events        immutable  — the learner's work
 *   delivery      mutable    — operational bookkeeping, rebuildable
 *   delivery_log  append-only— one row per attempt, the support trail
 *   meta          mutable    — device identity, sync cursors
 *
 * A bug in the sync loop can corrupt `delivery`. It must never be able to
 * corrupt or delete `events`.
 */

import {
  req,
  tx,
  type IDBDatabaseLike,
  type IDBFactoryLike,
  type IDBObjectStoreLike,
} from "./idb.ts";
import type {
  ActivityEvent,
  DeliveryAttempt,
  DeliveryRecord,
  DeliveryStatus,
  MetaRecord,
} from "../types.ts";

export const DB_NAME = "tetherless-ddil";
export const DB_VERSION = 1;

export const STORE_EVENTS = "events";
export const STORE_DELIVERY = "delivery";
export const STORE_LOG = "delivery_log";
export const STORE_META = "meta";

export const ALL_STORES = [STORE_EVENTS, STORE_DELIVERY, STORE_LOG, STORE_META];

/** Opens (and upgrades) the database. */
export function openDatabase(factory: IDBFactoryLike): Promise<IDBDatabaseLike> {
  return new Promise((resolve, reject) => {
    const r = factory.open(DB_NAME, DB_VERSION);

    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        db.createObjectStore(STORE_EVENTS, { keyPath: "event_id" });
      }
      if (!db.objectStoreNames.contains(STORE_DELIVERY)) {
        db.createObjectStore(STORE_DELIVERY, { keyPath: "event_id" });
      }
      if (!db.objectStoreNames.contains(STORE_LOG)) {
        // Auto-increment: the log is a sequence, not a lookup table.
        db.createObjectStore(STORE_LOG, { autoIncrement: true } as never);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("could not open the database"));
    r.onblocked = () =>
      reject(new Error("database upgrade blocked by another open tab"));
  });
}

function store(db: IDBDatabaseLike, name: string, mode: string): IDBObjectStoreLike {
  return db.transaction([name], mode).objectStore(name);
}

/**
 * Record one learner action.
 *
 * The event row and its delivery row are committed in ONE transaction. This
 * is the durability rule: after this resolves, the work is on disk and the
 * app may advance the UI or attempt a network call. Before it resolves, a
 * network call must not happen.
 *
 * Idempotent on event_id: re-recording the same event does not reset its
 * delivery state, because a re-record is always a bug, never a retry.
 */
export async function recordEvent(
  db: IDBDatabaseLike,
  event: ActivityEvent,
  now: number,
): Promise<DeliveryRecord> {
  const existing = await getDelivery(db, event.event_id);
  if (existing) return existing;

  const delivery: DeliveryRecord = {
    event_id: event.event_id,
    status: "pending",
    attempts: 0,
    next_attempt_at: now,
    last_error: null,
    lease_owner: null,
    lease_expires_at: null,
    inflight_started_at: null,
    rejected_code: null,
    settled_at: null,
  };

  const t = db.transaction([STORE_EVENTS, STORE_DELIVERY], "readwrite");
  t.objectStore(STORE_EVENTS).add(event);
  t.objectStore(STORE_DELIVERY).add(delivery);
  try {
    await tx(t);
    return delivery;
  } catch (err) {
    const fallback = await getDelivery(db, event.event_id);
    if (fallback) return fallback;
    throw err;
  }
}

/**
 * Reserve the next device sequence number.
 *
 * N6: allocating in one transaction, and re-reading inside it, is what makes
 * the sequence unique across tabs. A read in one transaction followed by a
 * write in another lets two writers observe the same value.
 */
export async function reserveDeviceSeq(db: IDBDatabaseLike): Promise<number> {
  // N6: read and write must be in ONE transaction, and the put must be issued
  // from the read's success handler. An `await` between get and put lets the
  // transaction auto-commit, and the put then throws.
  //
  // Uses the plain get/put helpers rather than store.put() directly: the
  // transaction-scoped facade in the test double buffers writes, while the
  // committed store does not.
  const t = db.transaction([STORE_META], "readwrite");
  const store = t.objectStore(STORE_META);
  const get = store.get(DEVICE_SEQ_KEY);
  const next = await new Promise<number>((resolve, reject) => {
    get.onsuccess = () => {
      const row = get.result as MetaRecord | undefined;
      const value = ((row?.value as number | undefined) ?? 0) + 1;
      resolve(value);
    };
    get.onerror = () => reject(get.error ?? new Error("device_seq read failed"));
  });
  store.put({ key: DEVICE_SEQ_KEY, value: next });
  await tx(t);
  return next;
}

export const DEVICE_SEQ_KEY = "device_seq";

export function getEvent(db: IDBDatabaseLike, eventId: string): Promise<ActivityEvent | undefined> {
  return req<ActivityEvent | undefined>(store(db, STORE_EVENTS, "readonly").get(eventId));
}

export function getDelivery(db: IDBDatabaseLike, eventId: string): Promise<DeliveryRecord | undefined> {
  return req<DeliveryRecord | undefined>(store(db, STORE_DELIVERY, "readonly").get(eventId));
}

export function allDelivery(db: IDBDatabaseLike): Promise<DeliveryRecord[]> {
  return req<DeliveryRecord[]>(store(db, STORE_DELIVERY, "readonly").getAll());
}

export function allEvents(db: IDBDatabaseLike): Promise<ActivityEvent[]> {
  return req<ActivityEvent[]>(store(db, STORE_EVENTS, "readonly").getAll());
}

/**
 * Update one delivery record inside a caller-supplied transaction, so a
 * claim can be atomic across several records.
 */
export function putDeliveryIn(
  t: { objectStore(name: string): IDBObjectStoreLike },
  record: DeliveryRecord,
): void {
  t.objectStore(STORE_DELIVERY).put(record);
}

export async function putDelivery(db: IDBDatabaseLike, record: DeliveryRecord): Promise<void> {
  const t = db.transaction([STORE_DELIVERY], "readwrite");
  t.objectStore(STORE_DELIVERY).put(record);
  await tx(t);
}

export async function appendAttempt(
  db: IDBDatabaseLike,
  attempt: DeliveryAttempt,
): Promise<void> {
  const t = db.transaction([STORE_LOG], "readwrite");
  t.objectStore(STORE_LOG).add(attempt);
  await tx(t);
}

export async function allAttempts(db: IDBDatabaseLike): Promise<DeliveryAttempt[]> {
  return req<DeliveryAttempt[]>(store(db, STORE_LOG, "readonly").getAll());
}

export async function getMeta<T>(db: IDBDatabaseLike, key: string): Promise<T | undefined> {
  const row = await req<MetaRecord | undefined>(store(db, STORE_META, "readonly").get(key));
  return row?.value as T | undefined;
}

export async function setMeta(db: IDBDatabaseLike, key: string, value: unknown): Promise<void> {
  const t = db.transaction([STORE_META], "readwrite");
  t.objectStore(STORE_META).put({ key, value });
  await tx(t);
}

/** Counts by status. Cheap enough for a UI badge; no cursor walk needed at this size. */
export function countByStatus(records: DeliveryRecord[]): Record<DeliveryStatus, number> {
  const out: Record<string, number> = {
    pending: 0,
    inflight: 0,
    acknowledged: 0,
    blocked_auth: 0,
    rejected: 0,
    failed: 0,
  };
  for (const r of records) out[r.status] = (out[r.status] ?? 0) + 1;
  return out as Record<DeliveryStatus, number>;
}
