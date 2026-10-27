/** Read-only frontend contract reference, pinned to backend e2ceb7e.
 * DDIL owns event construction, runtime payload validation and transport.
 * This file is NOT an event factory and does not replace packages/contract.
 */
export const WIRE_EVENT_TYPES = ["session_started", "visibility_changed", "heartbeat", "session_ended", "attempt_started", "answer_submitted", "attempt_completed", "attempt_abandoned"] as const;
export type WireEventType = typeof WIRE_EVENT_TYPES[number];
export interface WireEventBase {
  event_id: string;
  schema_version: 1;
  event_type: WireEventType;
  device_id: string;
  device_seq: number;
  session_id: string;
  occurred_at: string;
  monotonic_ms: number;
}

/** UUID shape guard for frontend adapter inputs, not a replacement for server validation. */
export function isPlainUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Proposal only: not added to the active OfflineLearningGateway until coordinated. */
export interface VersionedAttemptInput {
  moduleId: string;
  contentVersion: number;
  kind: "full" | "remediation";
}
