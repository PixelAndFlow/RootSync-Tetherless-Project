/**
 * Claiming work: leases, single-flight, and recovery.
 *
 * Two separate mechanisms, because they solve two different problems:
 *
 *   Web Locks  — stops two TABS on the same device from syncing at once.
 *                In memory only: a crash releases it for free, and it
 *                provides no protection once the process is gone.
 *
 *   The lease  — written into the delivery record, so it survives a crash,
 *                a force-quit, or a device that died mid-request. It expires
 *                on its own and returns the event to `pending`.
 *
 * Neither replaces the other. Web Locks alone leaves work stuck forever after
 * a crash; the lease alone lets two tabs fight over the same batch.
 */

import { tx, type IDBDatabaseLike } from "../stores/idb.ts";
import { putDeliveryIn, allDelivery } from "../stores/db.ts";
import type { DeliveryRecord } from "../types.ts";

/** A lease longer than this is a bug; shorter than this and slow networks thrash. */
export const LEASE_MS = 60_000;

export interface ClaimOptions {
  /** Batch cap. The wire contract caps at 200; keep the local claim at or below it. */
  maxEvents: number;
  /** "device_id:tab_id" — identifies who holds the lease. */
  owner: string;
  now: number;
  leaseMs?: number;
}

/**
 * Return events whose lease has expired to `pending`.
 *
 * This is the recovery path for a crash, a force-quit, or a device that died
 * mid-request. Attempts are NOT incremented: the server was never reached, so
 * no retry budget was spent. A phone that was off for a week burns nothing.
 *
 * Returns the events that were recovered, for logging.
 */
export async function recoverExpiredLeases(
  db: IDBDatabaseLike,
  now: number,
): Promise<DeliveryRecord[]> {
  const records = await allDelivery(db);
  const stale = records.filter(
    (r) =>
      r.status === "inflight" &&
      (r.lease_expires_at === null || r.lease_expires_at <= now),
  );
  if (stale.length === 0) return [];

  const t = db.transaction(["delivery"], "readwrite");
  const recovered: DeliveryRecord[] = [];
  for (const r of stale) {
    const next: DeliveryRecord = {
      ...r,
      status: "pending",
      // Attempts deliberately unchanged — see the note above.
      next_attempt_at: now,
      lease_owner: null,
      lease_expires_at: null,
      inflight_started_at: null,
    };
    putDeliveryIn(t, next);
    recovered.push(next);
  }
  await tx(t);
  return recovered;
}

/**
 * Claim up to `maxEvents` eligible events for sending.
 *
 * Atomic across the whole batch: either the claim commits for every selected
 * event or for none. If it committed for only some, the rest would look
 * in-flight to another tab while never being sent.
 *
 * Selection is ordered by device_seq, not by insertion order, because the
 * server orders by device_seq and a batch that arrives out of order is
 * harder to reason about when something goes wrong.
 */
export async function claimBatch(
  db: IDBDatabaseLike,
  events: { event_id: string; device_seq: number }[],
  opts: ClaimOptions,
): Promise<DeliveryRecord[]> {
  const records = await allDelivery(db);
  const byId = new Map(records.map((r) => [r.event_id, r]));

  const eligible: DeliveryRecord[] = [];
  for (const e of events) {
    const r = byId.get(e.event_id);
    if (!r) continue;
    if (r.status !== "pending") continue;
    if (r.next_attempt_at !== null && r.next_attempt_at > opts.now) continue;
    eligible.push(r);
  }

  // Order by device_seq so a batch is contiguous and gap-detectable.
  const seqOf = new Map(events.map((e) => [e.event_id, e.device_seq]));
  eligible.sort((a, b) => (seqOf.get(a.event_id) ?? 0) - (seqOf.get(b.event_id) ?? 0));

  const claimed = eligible.slice(0, opts.maxEvents);
  if (claimed.length === 0) return [];

  const leaseMs = opts.leaseMs ?? LEASE_MS;
  const t = db.transaction(["delivery"], "readwrite");
  const out: DeliveryRecord[] = [];
  for (const r of claimed) {
    const next: DeliveryRecord = {
      ...r,
      status: "inflight",
      lease_owner: opts.owner,
      lease_expires_at: opts.now + leaseMs,
      inflight_started_at: opts.now,
    };
    putDeliveryIn(t, next);
    out.push(next);
  }
  await tx(t);
  return out;
}

/**
 * Extend a live lease. Called while a request is in flight so a slow but
 * healthy request is not stolen by the recovery pass.
 */
export async function renewLease(
  db: IDBDatabaseLike,
  eventIds: string[],
  owner: string,
  now: number,
  leaseMs = LEASE_MS,
): Promise<void> {
  const records = await allDelivery(db);
  const mine = new Set(eventIds);
  const t = db.transaction(["delivery"], "readwrite");
  for (const r of records) {
    if (!mine.has(r.event_id)) continue;
    if (r.status !== "inflight" || r.lease_owner !== owner) continue;
    putDeliveryIn(t, { ...r, lease_expires_at: now + leaseMs });
  }
  await tx(t);
}

/**
 * A cross-tab exclusive lock, over the Web Locks API when it exists.
 *
 * Returns the callback's result, or `null` if another tab already holds the
 * lock (`ifAvailable`). On a runtime without Web Locks the callback still
 * runs — the lease is the real correctness mechanism, and this is an
 * optimisation that stops two tabs from duplicating work.
 */
export async function withSyncLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const locks = (globalThis as { navigator?: { locks?: unknown } }).navigator?.locks as
    | {
        request<R>(
          name: string,
          opts: { mode: string; ifAvailable: boolean },
          cb: (lock: unknown) => Promise<R>,
        ): Promise<R | null>;
      }
    | undefined;

  if (!locks) return fn();

  return locks.request(name, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) return null;
    return fn();
  });
}
