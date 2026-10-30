/**
 * The DDIL layer's own types.
 *
 * Boundary note: these are LOCAL types. They deliberately do not redefine
 * the shared sync contract. The wire shapes (SyncRequest / SyncResponse /
 * per-event status codes) are owned by whoever lands TR-12. As of the
 * `integration` branch, packages/contract/src/index.ts is that contract and
 * the server already enforces it. There is currently no adapter —
 * ../transport/http-transport.ts sends ActivityEvent straight over the
 * wire, unconverted, which only works because its shape is kept matching
 * the contract's by hand below. If that stops being true, this is where it
 * breaks.
 */

/**
 * Fields every event carries, filled in by the gateway when it records the
 * event. A caller of record() never supplies these.
 */
interface ActivityEventEnvelope {
  /** UUID generated on the device. Never regenerated, including on retry. */
  event_id: string;
  /** Local schema version. Separate from the wire schema version. */
  schema_version: 1;
  /** Stable per install. A wiped device enrolls again and gets a new one. */
  device_id: string;
  /**
   * Per-device counter, +1 for every event this device creates.
   * The server uses it for ordering and gap detection.
   */
  device_seq: number;
  /** Present on every event. Lets the server close a session at its last signal. */
  session_id: string;
  /**
   * Phone wall clock, ISO 8601. ADVISORY ONLY — no server decision may
   * depend on it. Trusted time comes from the server's receipt timestamp.
   */
  occurred_at: string;
  /** Milliseconds since the session started, from a monotonic clock. */
  monotonic_ms: number;
}

/**
 * Shared by every event that belongs to one attempt. The contract requires
 * all three together: module_id alone, or any one of these omitted, is
 * rejected as INVALID_EVENT (see packages/contract/src/index.ts's
 * ALLOWED_KEYS / "module_id is required." check).
 */
interface AttemptFields {
  module_id: string;
  content_version: number;
  attempt_id: string;
}

export interface SessionStartedEvent extends ActivityEventEnvelope {
  event_type: "session_started";
  payload: Record<string, unknown>;
}
export interface VisibilityChangedEvent extends ActivityEventEnvelope {
  event_type: "visibility_changed";
  payload: Record<string, unknown>;
}
export interface HeartbeatEvent extends ActivityEventEnvelope {
  event_type: "heartbeat";
  payload: Record<string, unknown>;
}
export interface SessionEndedEvent extends ActivityEventEnvelope {
  event_type: "session_ended";
  payload: Record<string, unknown>;
}
export interface AttemptStartedEvent extends ActivityEventEnvelope, AttemptFields {
  event_type: "attempt_started";
  payload: Record<string, unknown>;
}
export interface AnswerSubmittedEvent extends ActivityEventEnvelope, AttemptFields {
  event_type: "answer_submitted";
  /** Required alongside module_id/content_version/attempt_id. */
  question_id: string;
  payload: Record<string, unknown>;
}
export interface AttemptCompletedEvent extends ActivityEventEnvelope, AttemptFields {
  event_type: "attempt_completed";
  payload: Record<string, unknown>;
}
export interface AttemptAbandonedEvent extends ActivityEventEnvelope, AttemptFields {
  event_type: "attempt_abandoned";
  payload: Record<string, unknown>;
}

/**
 * An immutable record of one learner action.
 *
 * Written once, at the moment the learner acts, and never updated. If this
 * record is wrong, the learner's work is wrong, so nothing in the sync loop
 * is permitted to mutate it.
 *
 * This is a discriminated union, not one flat shape with optional fields:
 * module_id, content_version and attempt_id are required TOGETHER on every
 * attempt-related event and absent on every other event — the same grouping
 * the contract enforces on the wire. A caller that forgets one of them is
 * now a compile error here, not a gap the server discovers later and
 * permanently rejects. (The flat-optional shape this replaced let exactly
 * that happen in DdilLearningGateway.abandonAttempt() — see the docs repo
 * for the write-up.)
 */
export type ActivityEvent =
  | SessionStartedEvent
  | VisibilityChangedEvent
  | HeartbeatEvent
  | SessionEndedEvent
  | AttemptStartedEvent
  | AnswerSubmittedEvent
  | AttemptCompletedEvent
  | AttemptAbandonedEvent;

/** Every event the learner produces is one of these. */
export type EventType = ActivityEvent["event_type"];

/**
 * What a caller passes to record one event: the same shape as ActivityEvent,
 * minus the envelope fields the gateway generates itself. Written out
 * explicitly rather than derived with Omit<ActivityEvent, ...>, because Omit
 * does not distribute over a union the way a reader would expect — each
 * variant below must keep its own required fields, not the fields common to
 * all eight.
 */
export type ActivityEventInput =
  | { event_type: "session_started"; payload: Record<string, unknown> }
  | { event_type: "visibility_changed"; payload: Record<string, unknown> }
  | { event_type: "heartbeat"; payload: Record<string, unknown> }
  | { event_type: "session_ended"; payload: Record<string, unknown> }
  | ({ event_type: "attempt_started"; payload: Record<string, unknown> } & AttemptFields)
  | ({ event_type: "answer_submitted"; question_id: string; payload: Record<string, unknown> } & AttemptFields)
  | ({ event_type: "attempt_completed"; payload: Record<string, unknown> } & AttemptFields)
  | ({ event_type: "attempt_abandoned"; payload: Record<string, unknown> } & AttemptFields);

/**
 * Delivery state. Mutable, and separable from the event on purpose: a bug in
 * the sync loop can corrupt this and the learner's work is still intact.
 */
export type DeliveryStatus =
  /** Recorded locally, eligible to send. */
  | "pending"
  /** Claimed under a lease; a request is in flight. */
  | "inflight"
  /** Server confirmed acceptance, or confirmed it already had it. Terminal. */
  | "acknowledged"
  /** Waiting on a valid session. Not a failure. Consumes no attempt. */
  | "blocked_auth"
  /** Server refused. Will never succeed on retry. Terminal. */
  | "rejected"
  /** Retry budget exhausted against a server that WAS reached. Terminal until re-opened. */
  | "failed";

export interface DeliveryRecord {
  event_id: string;
  status: DeliveryStatus;
  /**
   * Attempts that consumed budget. Counts ONLY definitive server responses
   * (5xx, retryable_error, 429). A network error, a timeout, or an expired
   * lease does NOT increment this — otherwise a phone offline for a week
   * would strand real work.
   */
  attempts: number;
  /** Epoch ms. Null means "do not schedule" (terminal, or blocked on auth). */
  next_attempt_at: number | null;
  /** Human-readable reason for the last non-success outcome. */
  last_error: string | null;
  /** Owner of the current lease, e.g. "<device_id>:<tab_id>". */
  lease_owner: string | null;
  /** Unique claim token. Optional only for rows written by an older app. */
  lease_id?: string | null;
  /** Epoch ms. The lease expires on its own so a crash cannot strand work. */
  lease_expires_at: number | null;
  /** Epoch ms, for observability only. The lease is what enforces correctness. */
  inflight_started_at: number | null;
  /** Machine-readable code for a terminal rejection. */
  rejected_code: string | null;
  /** Epoch ms when the record reached a terminal state. */
  settled_at: number | null;
}

export type AttemptOutcome =
  | "accepted"
  | "duplicate"
  | "retryable_error"
  | "rejected"
  | "blocked_auth"
  | "rate_limited"
  | "unreachable"
  | "lease_expired";

/** One row per delivery attempt. Append-only. This is the support trail. */
export interface DeliveryAttempt {
  /** Auto-increment sequence assigned by the store. */
  seq?: number;
  event_id: string;
  attempt: number;
  started_at: number;
  finished_at: number;
  outcome: AttemptOutcome;
  /** Server's acknowledgement reference, when there was one. */
  server_ack_ref: string | null;
  /** Server's own receipt timestamp, ISO 8601. Trusted time for the next window. */
  server_received_at: string | null;
  error: string | null;
}

/** Small key/value store for device and sync state. */
export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface MetaKeys {
  device_id: string;
  tab_id: string;
  last_server_ack_at: string;
  schema_version: string;
}

/**
 * Outcome of one event as reported by the transport.
 *
 * `duplicate` is a SUCCESS. Treating it as an error is the bug that makes a
 * client retry forever on work the server already has.
 */
export interface EventOutcome {
  event_id: string;
  status: "accepted" | "duplicate" | "retryable_error" | "rejected";
  code?: string;
  message?: string;
  /** Server receipt timestamp, ISO 8601, when the server provided one. */
  received_at?: string;
}
