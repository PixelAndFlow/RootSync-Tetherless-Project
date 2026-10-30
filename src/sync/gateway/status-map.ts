/**
 * Delivery status → frontend sync status.
 *
 * The frontend and DDIL mirror share a dedicated blocked_auth state. It
 * remains visible offline and requires explicit verification before recovery;
 * no display text promises that a revoked or invalid token fixes itself.
 */

import type { DeliveryRecord, DeliveryStatus } from "../types.ts";
import type { SyncStatus, SyncSummary } from "./contract.ts";

export type BlockedAuthReason = "expired_credential" | "revoked_device";

export const BLOCKED_AUTH_MESSAGES: Record<BlockedAuthReason, string> = {
  // The legacy reason name does not imply that device tokens expire on a timer.
  expired_credential: "Sync paused — this device needs authorization. Ask your trainer for help; saved work remains on this device.",
  // Do not wait. Someone has to act.
  revoked_device: "Sync paused — this device needs authorization. Ask your trainer for help. Do not clear this device's data.",
};

/**
 * Per-status projection.
 *
 * `syncing` is not derivable from a single record — it is a property of the
 * sync loop, not of any one event. The gateway tracks it separately.
 */
export function toSyncStatus(status: DeliveryStatus): SyncStatus {
  switch (status) {
    case "pending":
      return "pending";
    case "inflight":
      // In flight means work is moving, which the learner reads as syncing.
      return "syncing";
    case "acknowledged":
      return "synced";
    case "blocked_auth":
      return "blocked_auth";
    case "rejected":
      return "rejected";
    case "failed":
      // Exhausted against a reached server. Recoverable on next launch, so it
      // is not terminal from the learner's point of view.
      return "retryable_error";
  }
}

/**
 * Roll a set of delivery records up into one summary.
 *
 * Precedence when several states are present at once, most-actionable first:
 *
 *   rejected      a specific submission was refused — needs telling
 *   blocked_auth  nothing can move until authorization
 *   failed        needs a relaunch or a manual tap
 *   pending       normal, work waiting
 *   acknowledged  everything settled
 *
 * `offline` is decided by the caller, which knows the connection state. A
 * queue that is empty but offline is still `offline`, not `synced`.
 */
export function summarize(
  records: DeliveryRecord[],
  opts: { online: boolean; lastSyncedAt?: string | null; syncing?: boolean } = {
    online: true,
  },
): SyncSummary {
  const counts = new Map<DeliveryStatus, number>();
  for (const r of records) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const n = (s: DeliveryStatus) => counts.get(s) ?? 0;

  const pendingEventCount =
    n("pending") + n("inflight") + n("blocked_auth") + n("rejected") + n("failed");

  const base = {
    pendingEventCount,
    lastSyncedAt: opts.lastSyncedAt ?? undefined,
    // Keep recovery discoverable even if a rejection takes display precedence.
    ...(n("blocked_auth") ? { authorizationReason: blockedAuthReasonOf(records.find((r) => r.status === "blocked_auth")) === "revoked_device" ? "revoked_device" as const : "unknown" as const } : {}),
  };

  if (n("rejected") > 0) {
    const first = records.find((r) => r.status === "rejected");
    return {
      ...base,
      status: "rejected",
      failureReason:
        first?.last_error ??
        `Not accepted${first?.rejected_code ? ` (${first.rejected_code})` : ""}.`,
    };
  }

  if (n("blocked_auth") > 0) {
    const first = records.find((r) => r.status === "blocked_auth");
    const reason = blockedAuthReasonOf(first);
    return {
      ...base,
      status: toSyncStatus("blocked_auth"),
      failureReason: BLOCKED_AUTH_MESSAGES[reason],
    };
  }

  if (n("failed") > 0) {
    const first = records.find((r) => r.status === "failed");
    return {
      ...base,
      status: "retryable_error",
      failureReason: first?.last_error ?? "Could not reach the server after several tries.",
    };
  }

  if (opts.syncing || n("inflight") > 0) {
    return { ...base, status: "syncing" };
  }

  if (n("pending") > 0) {
    return { ...base, status: "pending" };
  }

  if (!opts.online) {
    return { ...base, status: "offline" };
  }

  return { ...base, status: "synced" };
}

/**
 * Distinguish the two blocked_auth cases from the record itself.
 *
 * The DDIL layer records the reason in `last_error` when it transitions to
 * blocked_auth. Until the contract has a dedicated code, this reads it back.
 */
export function blockedAuthReasonOf(record: DeliveryRecord | undefined): BlockedAuthReason {
  const reason = record?.last_error ?? "";
  return /revok/i.test(reason) ? "revoked_device" : "expired_credential";
}
