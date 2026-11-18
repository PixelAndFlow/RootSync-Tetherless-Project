/** Read-only frontend contract reference, pinned to backend e2ceb7e.
 * DDIL owns event construction, runtime payload validation and transport.
 * This file is NOT an event factory and does not replace packages/contract.
 *
 * The pinned event-type list and event-envelope shape that used to live here
 * (WIRE_EVENT_TYPES/WireEventType/WireEventBase) were removed (issue #12): a
 * third, hand-maintained copy of the same union that src/sync/types.ts
 * (EventType/ActivityEvent) already owns as the real, actively-typed source,
 * with nothing in the app actually importing this copy. Reach for EventType
 * from src/sync/types.ts instead.
 */

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
