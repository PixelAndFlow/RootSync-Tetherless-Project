/**
 * The sync loop.
 *
 * One pass, in order:
 *
 *   1. take the cross-tab lock        — no second tab on this device
 *   2. recover expired leases         — a crash left work in flight
 *   3. claim a batch                  — atomically, ordered by device_seq
 *   4. send it                        — through the transport seam
 *   5. apply each outcome             — per event, never per batch
 *   6. log every attempt              — the support trail
 *
 * The pass never throws on a transport failure. Every failure is classified
 * and turned into a delivery transition, because "what happened" is exactly
 * what decides whether the learner's retry budget was spent.
 */

import {
  appendAttempt,
  allEvents,
  updateDelivery,
  updateDeliveryRecords,
  setMeta,
} from "../stores/db.ts";
import type { IDBDatabaseLike } from "../stores/idb.ts";
import { claimBatch, recoverExpiredLeases, withSyncLock } from "./lease.ts";
import {
  DEFAULT_MAX_ATTEMPTS,
  backoffMs,
  classifyStatus,
  reopenFailed,
  transition,
  type BackoffOptions,
  type ResponseClass,
} from "./retry.ts";
import type { SyncTransport } from "../transport/transport.ts";
import type { ActivityEvent, DeliveryAttempt, DeliveryRecord, EventOutcome } from "../types.ts";

export const SYNC_LOCK_NAME = "tetherless-outbox-sync";

export interface SyncOptions {
  db: IDBDatabaseLike;
  transport: SyncTransport;
  /** "device_id:tab_id". Identifies the lease holder. */
  owner: string;
  now: () => number;
  maxEventsPerBatch?: number;
  maxAttempts?: number;
  backoff?: BackoffOptions;
  /** Re-open `failed` events once, at the start of a pass. */
  reopenFailedOnStart?: boolean;
  /** Re-open `blocked_auth` events at the start of a pass. */
  unblockAuthOnStart?: boolean;
}

export interface SyncPassResult {
  /** True when another tab held the lock and this pass did nothing. */
  skipped: boolean;
  claimed: number;
  acknowledged: number;
  rejected: number;
  blockedAuth: number;
  retried: number;
  failed: number;
  recovered: number;
}

const EMPTY: SyncPassResult = {
  skipped: false,
  claimed: 0,
  acknowledged: 0,
  rejected: 0,
  blockedAuth: 0,
  retried: 0,
  failed: 0,
  recovered: 0,
};

export class SyncEngine {
  private readonly opts: SyncOptions;
  private running = false;

  constructor(opts: SyncOptions) {
    this.opts = opts;
  }

  private now(): number {
    return this.opts.now();
  }

  private get batchCap(): number {
    return this.opts.maxEventsPerBatch ?? 200;
  }

  /**
   * Transition any `blocked_auth` records back to `pending`.
   * Call after credentials/tokens are restored.
   */
  async unblockAuth(now = this.now()): Promise<number> {
    const changed = await updateDeliveryRecords(this.opts.db, (records) => records
      .filter((r) => r.status === "blocked_auth")
      .map((r): DeliveryRecord => ({
        ...r,
        status: "pending",
        next_attempt_at: now,
        last_error: null,
      })));
    return changed.length;
  }

  /**
   * Run one sync pass.
   *
   * Safe to call concurrently: the lock and the lease together make a
   * second concurrent call a no-op rather than a duplicate send.
   */
  async runOnce(): Promise<SyncPassResult> {
    // A concurrent call on this process is a re-entrancy guard, not a sync
    // decision. The loser still must run the recovery pass — F-1: an expired
    // lease is exactly what a second tab could rescue. Skipping before
    // recovery strands the work.
    if (this.running) return this.passRecoveryOnly();
    this.running = true;
    try {
      const result = await withSyncLock(SYNC_LOCK_NAME, () => this.pass());
      return result ?? this.passRecoveryOnly();
    } finally { this.running = false; }
  }

  /** Run only the recovery half of a pass (lease expiry + auth unblock). */
  private async passRecoveryOnly(): Promise<SyncPassResult> {
    const out: SyncPassResult = { ...EMPTY };
    if (this.opts.unblockAuthOnStart) {
      await this.unblockAuth(this.now());
    }
    const recovered = await recoverExpiredLeases(this.opts.db, this.now());
    out.recovered = recovered.length;
    for (const r of recovered) {
      await this.log(r, "lease_expired", this.now(), null, null, "lease expired");
    }
    return out;
  }

  private async pass(): Promise<SyncPassResult> {
    const { db } = this.opts;
    const out: SyncPassResult = { ...EMPTY };

    // Recovery from blocked_auth on start if configured
    if (this.opts.unblockAuthOnStart) {
      await this.unblockAuth(this.now());
    }

    // Step 2 — recovery. A crash or force-quit left work inflight; return it
    // to pending without spending an attempt.
    const recovered = await recoverExpiredLeases(db, this.now());
    out.recovered = recovered.length;
    for (const r of recovered) {
      await this.log(r, "lease_expired", this.now(), null, null, "lease expired");
    }

    // Optional: give previously-failed work one more chance on a new pass.
    if (this.opts.reopenFailedOnStart) {
      await updateDeliveryRecords(db, (records) => records.filter((r) => r.status === "failed").map((r) => reopenFailed(r, this.now())));
    }

    // Step 3 — claim.
    const events = await allEvents(db);
    const claimed = await claimBatch(db, events, {
      maxEvents: this.batchCap,
      owner: this.opts.owner,
      now: this.now(),
    });
    out.claimed = claimed.length;
    if (claimed.length === 0) return out;

    const byId = new Map<string, ActivityEvent>(events.map((e) => [e.event_id, e]));
    const batch = claimed
      .map((c) => byId.get(c.event_id))
      .filter((e): e is ActivityEvent => e !== undefined)
      .sort((a, b) => a.device_seq - b.device_seq);

    // Step 4 — send.
    const startedAt = this.now();
    let response;
    try {
      response = await this.opts.transport.send(batch);
    } catch (err) {
      // A throwing transport is treated as unreachable: the server may or
      // may not have seen the request, but we cannot know, and the retry is
      // idempotent, so the safe classification is "spend nothing".
      response = {
        ok: false as const,
        failure: { kind: "unreachable" as const, error: describe(err) },
      };
    }

    // Step 5/6 — apply.
    if (!response.ok) {
      await this.applyBatchFailure(claimed, response.failure, startedAt, out);
      return out;
    }

    await setMeta(db, "last_server_ack_at", response.result.received_at ?? null);

    const outcomes = new Map<string, EventOutcome>(
      response.result.outcomes.map((o) => [o.event_id, o]),
    );

    for (const record of claimed) {
      const outcome = outcomes.get(record.event_id);
      if (!outcome) {
        // No result for this event. The server may have applied it and lost
        // the response, so this is unreachable, not a failure.
        await this.applyOne(
          record,
          "unreachable",
          startedAt,
          out,
          "no result returned for this event",
        );
        continue;
      }

      const cls = classifyOutcome(outcome);
      await this.applyOne(record, cls, startedAt, out, outcome.message, {
        code: outcome.code,
        receivedAt: outcome.received_at ?? response.result.received_at,
      });
    }

    return out;
  }

  private async applyBatchFailure(
    claimed: DeliveryRecord[],
    failure: { kind: string; error: string; retryAfterSec?: number; code?: string },
    startedAt: number,
    out: SyncPassResult,
  ): Promise<void> {
    const cls: ResponseClass =
      failure.kind === "auth"
        ? "auth"
        : failure.kind === "rate_limited"
          ? "rate_limited"
          : failure.kind === "terminal"
            ? "terminal"
            : failure.kind === "server_error"
              ? "server_error"
              : "unreachable";

    for (const record of claimed) {
      await this.applyOne(record, cls, startedAt, out, failure.error, {
        code: failure.code,
        retryAfterSec: failure.retryAfterSec,
      });
    }
  }

  private async applyOne(
    record: DeliveryRecord,
    response: ResponseClass,
    startedAt: number,
    out: SyncPassResult,
    error?: string,
    extra?: { code?: string; retryAfterSec?: number; receivedAt?: string | null },
  ): Promise<void> {
    let shouldRetry = false;
    const next = await updateDelivery(this.opts.db, record.event_id, (current) => {
      // Read and transition under the same lock as the write. A unique claim
      // token also fences a newer claim held by the very same tab/owner.
      if (!current || current.status !== "inflight" || current.lease_owner !== this.opts.owner ||
          !record.lease_id || current.lease_id !== record.lease_id ||
          current.lease_expires_at === null || current.lease_expires_at <= this.now()) return undefined;
      const result = transition({
        record: current,
        response,
        now: this.now(),
        code: extra?.code,
        error,
        retryAfterSec: extra?.retryAfterSec,
        maxAttempts: this.opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        backoff: this.opts.backoff,
      });
      shouldRetry = result.shouldRetry;
      return { ...result.record, lease_id: null };
    });
    if (!next) return;

    switch (next.status) {
      case "acknowledged":
        out.acknowledged += 1;
        break;
      case "rejected":
        out.rejected += 1;
        break;
      case "blocked_auth":
        out.blockedAuth += 1;
        break;
      case "failed":
        out.failed += 1;
        break;
      case "pending":
        out.retried += 1;
        break;
    }

    await this.log(
      next,
      outcomeFor(response),
      startedAt,
      extra?.receivedAt ?? null,
      extra?.code ?? null,
      shouldRetry ? null : (error ?? null),
    );
  }

  private async log(
    record: DeliveryRecord,
    outcome: DeliveryAttempt["outcome"],
    startedAt: number,
    serverReceivedAt: string | null,
    serverAckRef: string | null,
    error: string | null,
  ): Promise<void> {
    await appendAttempt(this.opts.db, {
      event_id: record.event_id,
      attempt: record.attempts,
      started_at: startedAt,
      finished_at: this.now(),
      outcome,
      server_ack_ref: serverAckRef,
      server_received_at: serverReceivedAt,
      error,
    });
  }
}

function classifyOutcome(o: EventOutcome): ResponseClass {
  switch (o.status) {
    case "accepted":
    case "duplicate":
      // Duplicate is SUCCESS. Treating it as an error is the bug that makes
      // a client retry forever on work the server already holds.
      return "success";
    case "retryable_error":
      return "server_error";
    case "rejected":
      return "terminal";
  }
}

function outcomeFor(c: ResponseClass): DeliveryAttempt["outcome"] {
  switch (c) {
    case "success":
      return "accepted";
    case "auth":
      return "blocked_auth";
    case "rate_limited":
      return "rate_limited";
    case "terminal":
      return "rejected";
    case "server_error":
      return "retryable_error";
    case "unreachable":
      return "unreachable";
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export { classifyStatus, backoffMs };
