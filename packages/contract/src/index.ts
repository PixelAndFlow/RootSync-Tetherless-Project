/**
 * Tetherless sync contract, schema_version 1.
 *
 * Shared by the phone (offline layer), the API server and the analytics code.
 * The phone records immutable events; the server stores them exactly once and
 * derives every score and time figure from them.
 *
 * Rules that every party relies on:
 *  - event_id is generated on the phone (UUID) and never reused. Sending the
 *    same event twice is safe: the server answers "duplicate".
 *  - The learner's identity comes from the device token, never from the event.
 *  - Correctness and scores are never sent; the server recalculates them from
 *    the answer key of the module version.
 *  - occurred_at is the phone's wall clock and only advisory. Durations use
 *    monotonic_ms (performance.now() since the session started). The server
 *    adds its own received_at.
 *  - device_seq increases by 1 for every event a device creates. The server
 *    uses it to order events and to detect missing ones.
 */

export const SCHEMA_VERSION = 1;
export const MAX_EVENTS_PER_BATCH = 200;
export const MAX_BODY_BYTES = 512 * 1024;

export const EVENT_TYPES = [
  "session_started",
  "visibility_changed",
  "heartbeat",
  "session_ended",
  "attempt_started",
  "answer_submitted",
  "attempt_completed",
  "attempt_abandoned",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Kinds of attempt:
 *  - full:     the whole module, in order; counts for initial/best/latest score
 *  - practice: any partial practice (game waves, missed-question remediation); counts for mastery
 *  - boss:     a Boss Mission
 *  - review:   read-only review; changes nothing
 */
export const ATTEMPT_KINDS = ["full", "practice", "boss", "review"] as const;
export type AttemptKind = (typeof ATTEMPT_KINDS)[number];

export const ABANDON_REASONS = ["restart", "quit", "replaced"] as const;
export type AbandonReason = (typeof ABANDON_REASONS)[number];

export interface EventBase {
  event_id: string;
  schema_version: number;
  event_type: EventType;
  device_id: string;
  device_seq: number;
  occurred_at: string;
  session_id: string;
  /** Milliseconds since session_started, from a monotonic clock. */
  monotonic_ms: number;
}

export interface SessionStarted extends EventBase {
  event_type: "session_started";
  payload: { visibility: "visible" | "hidden"; app_version?: string };
}
export interface VisibilityChanged extends EventBase {
  event_type: "visibility_changed";
  payload: { state: "visible" | "hidden" };
}
export interface Heartbeat extends EventBase {
  event_type: "heartbeat";
  payload: Record<string, never>;
}
export interface SessionEnded extends EventBase {
  event_type: "session_ended";
  payload: { reason?: string };
}
interface AttemptRef {
  module_id: string;
  content_version: number;
  attempt_id: string;
}
export interface AttemptStarted extends EventBase, AttemptRef {
  event_type: "attempt_started";
  payload: { attempt_kind: AttemptKind; mission_id?: string };
}
export interface AnswerSubmitted extends EventBase, AttemptRef {
  event_type: "answer_submitted";
  question_id: string;
  /** null when time ran out without an answer. */
  payload: { choice_id: string | null; response_ms?: number };
}
export interface AttemptCompleted extends EventBase, AttemptRef {
  event_type: "attempt_completed";
  payload: Record<string, never>;
}
export interface AttemptAbandoned extends EventBase, AttemptRef {
  event_type: "attempt_abandoned";
  payload: { reason: AbandonReason };
}

export type TetherlessEvent =
  | SessionStarted
  | VisibilityChanged
  | Heartbeat
  | SessionEnded
  | AttemptStarted
  | AnswerSubmitted
  | AttemptCompleted
  | AttemptAbandoned;

/** Event as stored by the server: the phone's event plus server facts. */
export type StoredEvent = TetherlessEvent & { learner_id: string; received_at: string };

// ---------------------------------------------------------------- sync API

export interface SyncRequest {
  schema_version: number;
  events: unknown[];
}

/**
 * Per-event outcome. The phone acts on each one:
 *  - accepted / duplicate: mark the event Synced.
 *  - retryable_error: keep it and retry later with the same event_id.
 *  - rejected: keep it, stop retrying, show it as a Sync Problem; it appears in exports.
 */
export type EventStatus = "accepted" | "duplicate" | "retryable_error" | "rejected";

export const REJECT_CODES = [
  "INVALID_EVENT", // fails this contract (missing or wrong fields)
  "UNSUPPORTED_SCHEMA_VERSION",
  "DEVICE_MISMATCH", // event's device_id is not the device the token belongs to
  "UNKNOWN_MODULE", // module_id/content_version not published on the server
  "UNKNOWN_QUESTION", // question_id not in that module version
  "UNKNOWN_CHOICE", // choice_id not in that question
  "EVENT_ID_CONFLICT", // event_id already stored with different content
] as const;
export type RejectCode = (typeof REJECT_CODES)[number];

export interface EventResult {
  event_id: string | null;
  status: EventStatus;
  code?: RejectCode | "SERVER_BUSY";
  message?: string;
}

export interface SyncResponse {
  schema_version: number;
  received_at: string;
  results: EventResult[];
}

/**
 * HTTP mapping for POST /v1/sync/events:
 *  200 - per-event results in the body (some may be rejected)
 *  400 - body is not JSON or has no events array; nothing stored
 *  401 - missing, unknown or revoked device token; nothing stored. Phone moves
 *        events to blocked_auth and keeps them.
 *  413 - body over MAX_BODY_BYTES or more than MAX_EVENTS_PER_BATCH events; split and resend
 *  429 - too many requests; retry after the Retry-After header
 *  5xx - server problem; retry everything later with the same event_ids
 */

// ---------------------------------------------------------------- validation

export interface ValidationFailure {
  code: RejectCode;
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const BASE_KEYS = ["event_id", "schema_version", "event_type", "device_id", "device_seq", "occurred_at", "session_id", "monotonic_ms", "payload"];
const ATTEMPT_KEYS = ["module_id", "content_version", "attempt_id"];
const ALLOWED_KEYS: Record<EventType, Set<string>> = {
  session_started: new Set(BASE_KEYS),
  visibility_changed: new Set(BASE_KEYS),
  heartbeat: new Set(BASE_KEYS),
  session_ended: new Set(BASE_KEYS),
  attempt_started: new Set([...BASE_KEYS, ...ATTEMPT_KEYS]),
  answer_submitted: new Set([...BASE_KEYS, ...ATTEMPT_KEYS, "question_id"]),
  attempt_completed: new Set([...BASE_KEYS, ...ATTEMPT_KEYS]),
  attempt_abandoned: new Set([...BASE_KEYS, ...ATTEMPT_KEYS]),
};
const PAYLOAD_KEYS: Record<EventType, Set<string>> = {
  session_started: new Set(["visibility", "app_version"]),
  visibility_changed: new Set(["state"]),
  heartbeat: new Set(),
  session_ended: new Set(["reason"]),
  attempt_started: new Set(["attempt_kind", "mission_id"]),
  answer_submitted: new Set(["choice_id", "response_ms"]),
  attempt_completed: new Set(),
  attempt_abandoned: new Set(["reason"]),
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const fail = (message: string, code: RejectCode = "INVALID_EVENT"): ValidationFailure => ({ code, message });

/** event_id of an incoming item, if it has a usable one (for reporting results). */
export function eventIdOf(raw: unknown): string | null {
  return isRecord(raw) && typeof raw.event_id === "string" && UUID.test(raw.event_id) ? raw.event_id.toLowerCase() : null;
}

/**
 * Check one event against the contract. Content checks (does the question
 * exist?) are the server's job because they need the published modules.
 */
export function validateEvent(raw: unknown): { ok: true; event: TetherlessEvent } | { ok: false; error: ValidationFailure } {
  if (!isRecord(raw)) return { ok: false, error: fail("Event must be a JSON object.") };
  if (raw.schema_version !== SCHEMA_VERSION) {
    return { ok: false, error: fail(`schema_version must be ${SCHEMA_VERSION}.`, "UNSUPPORTED_SCHEMA_VERSION") };
  }
  if (typeof raw.event_id !== "string" || !UUID.test(raw.event_id)) return { ok: false, error: fail("event_id must be a UUID.") };
  if (typeof raw.event_type !== "string" || !(EVENT_TYPES as readonly string[]).includes(raw.event_type)) {
    return { ok: false, error: fail(`event_type must be one of: ${EVENT_TYPES.join(", ")}.`) };
  }
  const type = raw.event_type as EventType;
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS[type].has(key)) return { ok: false, error: fail(`Field "${key}" is not allowed on ${type}.`) };
  }
  if (typeof raw.device_id !== "string" || !UUID.test(raw.device_id)) return { ok: false, error: fail("device_id must be a UUID.") };
  if (!Number.isSafeInteger(raw.device_seq) || (raw.device_seq as number) < 1) return { ok: false, error: fail("device_seq must be a whole number of 1 or more.") };
  if (typeof raw.occurred_at !== "string" || Number.isNaN(Date.parse(raw.occurred_at))) return { ok: false, error: fail("occurred_at must be an ISO 8601 timestamp.") };
  if (typeof raw.session_id !== "string" || !UUID.test(raw.session_id)) return { ok: false, error: fail("session_id must be a UUID.") };
  if (typeof raw.monotonic_ms !== "number" || !Number.isFinite(raw.monotonic_ms) || raw.monotonic_ms < 0) {
    return { ok: false, error: fail("monotonic_ms must be a number of 0 or more.") };
  }
  if (!isRecord(raw.payload)) return { ok: false, error: fail("payload must be an object.") };
  const p = raw.payload;
  for (const key of Object.keys(p)) {
    if (!PAYLOAD_KEYS[type].has(key)) return { ok: false, error: fail(`payload.${key} is not allowed on ${type}.`) };
  }

  if (ALLOWED_KEYS[type].has("attempt_id")) {
    if (typeof raw.module_id !== "string" || !ID.test(raw.module_id)) return { ok: false, error: fail("module_id is required.") };
    if (!Number.isInteger(raw.content_version) || (raw.content_version as number) < 1) return { ok: false, error: fail("content_version must be a whole number of 1 or more.") };
    if (typeof raw.attempt_id !== "string" || !UUID.test(raw.attempt_id)) return { ok: false, error: fail("attempt_id must be a UUID.") };
  }

  switch (type) {
    case "session_started":
      if (p.visibility !== "visible" && p.visibility !== "hidden") return { ok: false, error: fail('payload.visibility must be "visible" or "hidden".') };
      if (p.app_version !== undefined && typeof p.app_version !== "string") return { ok: false, error: fail("payload.app_version must be text.") };
      break;
    case "visibility_changed":
      if (p.state !== "visible" && p.state !== "hidden") return { ok: false, error: fail('payload.state must be "visible" or "hidden".') };
      break;
    case "session_ended":
      if (p.reason !== undefined && typeof p.reason !== "string") return { ok: false, error: fail("payload.reason must be text.") };
      break;
    case "attempt_started":
      if (!(ATTEMPT_KINDS as readonly unknown[]).includes(p.attempt_kind)) return { ok: false, error: fail(`payload.attempt_kind must be one of: ${ATTEMPT_KINDS.join(", ")}.`) };
      if (p.attempt_kind === "boss" && (typeof p.mission_id !== "string" || !ID.test(p.mission_id))) return { ok: false, error: fail("payload.mission_id is required for boss attempts.") };
      if (p.attempt_kind !== "boss" && p.mission_id !== undefined) return { ok: false, error: fail("payload.mission_id is only allowed on boss attempts.") };
      break;
    case "answer_submitted":
      if (typeof raw.question_id !== "string" || !ID.test(raw.question_id)) return { ok: false, error: fail("question_id is required.") };
      if (p.choice_id !== null && (typeof p.choice_id !== "string" || !/^[a-z0-9]{1,8}$/.test(p.choice_id))) return { ok: false, error: fail("payload.choice_id must be a choice ID or null.") };
      if (p.response_ms !== undefined && (typeof p.response_ms !== "number" || p.response_ms < 0)) return { ok: false, error: fail("payload.response_ms must be 0 or more.") };
      break;
    case "attempt_abandoned":
      if (!(ABANDON_REASONS as readonly unknown[]).includes(p.reason)) return { ok: false, error: fail(`payload.reason must be one of: ${ABANDON_REASONS.join(", ")}.`) };
      break;
    default:
      break;
  }

  const event = { ...raw, event_id: (raw.event_id as string).toLowerCase(), device_id: (raw.device_id as string).toLowerCase() } as unknown as TetherlessEvent;
  return { ok: true, event };
}

/** Stable JSON (sorted keys) so two copies of the same event hash the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------- enrollment

export interface EnrollRequest {
  name: string;
  username: string;
  device_id: string;
  /** Trainer-issued cohort code, or a one-time re-link code for a replacement phone. */
  enrollment_code?: string;
  relink_code?: string;
}

export interface EnrollResponse {
  learner_id: string;
  device_id: string;
  /** Shown once. The phone stores it and sends it as "Authorization: Bearer <token>". */
  device_token: string;
  cohort: { cohort_id: string; name: string };
}

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
