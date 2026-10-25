/**
 * Retry policy.
 *
 * The rule that matters: retries count ONLY against a server that was
 * actually reached. A network error, a timeout, or an expired lease leaves
 * the attempt count untouched. Otherwise a phone offline for a week would
 * exhaust its budget and mark real learner work as permanently failed —
 * which is the single worst failure this layer can have.
 */

import type { DeliveryRecord, DeliveryStatus } from "../types.ts";

/** Attempts before a retryable error becomes `failed`. */
export const DEFAULT_MAX_ATTEMPTS = 8;

/** Backoff is capped: a device that was offline overnight should not wait days. */
export const DEFAULT_MAX_BACKOFF_MS = 15 * 60_000;

export const DEFAULT_BASE_BACKOFF_MS = 2_000;

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  /** Injected for deterministic tests. */
  random?: () => number;
}

/**
 * Exponential backoff with full jitter.
 *
 * Full jitter (uniform over [0, capped]) rather than a fixed curve, so a
 * fleet of phones that all reconnect at the same moment does not stampede
 * the server at the same offsets.
 */
export function backoffMs(attempts: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? DEFAULT_BASE_BACKOFF_MS;
  const max = opts.maxMs ?? DEFAULT_MAX_BACKOFF_MS;
  const random = opts.random ?? Math.random;
  const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempts - 1)));
  return Math.floor(random() * exp);
}

/**
 * What happened, as far as the retry budget is concerned.
 *
 * `unreachable` is the important one: the server was never reached, so this
 * is not a delivery failure at all.
 */
export type ResponseClass =
  /** Server accepted it, or already had it. */
  | "success"
  /** 401 / revoked token. A wait, not a failure. */
  | "auth"
  /** 429. Retryable, honours Retry-After. */
  | "rate_limited"
  /** 5xx or an explicit retryable_error. Retryable, consumes an attempt. */
  | "server_error"
  /** 403 / 422 / malformed. Will never succeed. */
  | "terminal"
  /** Network error, timeout, request died. The server was NOT reached. */
  | "unreachable";

export interface TransitionInput {
  record: DeliveryRecord;
  response: ResponseClass;
  now: number;
  /** Machine-readable code for a terminal rejection. */
  code?: string;
  /** Human-readable reason, shown to the learner on a terminal outcome. */
  error?: string;
  /** Seconds from a Retry-After header, for rate limiting. */
  retryAfterSec?: number;
  maxAttempts?: number;
  backoff?: BackoffOptions;
}

export interface TransitionResult {
  record: DeliveryRecord;
  /** False when the event is settled and no further attempt should be made. */
  shouldRetry: boolean;
}

/**
 * Apply one response to one delivery record.
 *
 * Pure: it takes a record and returns a new one. Persisting is the caller's
 * job, which keeps this testable without a database.
 */
export function transition(input: TransitionInput): TransitionResult {
  const { record, response, now } = input;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const settled = (status: DeliveryStatus, code?: string): TransitionResult => ({
    record: {
      ...record,
      status,
      next_attempt_at: null,
      lease_owner: null,
      lease_expires_at: null,
      inflight_started_at: null,
      rejected_code: code ?? null,
      last_error: input.error ?? null,
      settled_at: now,
    },
    shouldRetry: false,
  });

  switch (response) {
    case "success":
      return settled("acknowledged");

    case "terminal":
      return settled("rejected", input.code);

    case "auth":
      // A wait, not a failure. Attempts unchanged: re-authenticating is not
      // a retry, and the budget must be intact when the session comes back.
      return {
        record: {
          ...record,
          status: "blocked_auth",
          next_attempt_at: null,
          lease_owner: null,
          lease_expires_at: null,
          inflight_started_at: null,
          last_error: input.error ?? "waiting to sign in",
        },
        shouldRetry: false,
      };

    case "rate_limited": {
      // Consumes an attempt: the server was reached and said no. The wait is
      // the server's, not ours, so it overrides the backoff curve.
      const attempts = record.attempts + 1;
      const waitMs =
        input.retryAfterSec !== undefined
          ? input.retryAfterSec * 1000
          : backoffMs(attempts, input.backoff);
      return {
        record: {
          ...record,
          status: "pending",
          attempts,
          next_attempt_at: now + waitMs,
          lease_owner: null,
          lease_expires_at: null,
          inflight_started_at: null,
          last_error: input.error ?? "rate limited",
        },
        shouldRetry: true,
      };
    }

    case "server_error": {
      const attempts = record.attempts + 1;
      if (attempts >= maxAttempts) {
        return {
          record: {
            ...record,
            status: "failed",
            attempts,
            next_attempt_at: null,
            lease_owner: null,
            lease_expires_at: null,
            inflight_started_at: null,
            last_error: input.error ?? "server unavailable after several tries",
            settled_at: now,
          },
          shouldRetry: false,
        };
      }
      return {
        record: {
          ...record,
          status: "pending",
          attempts,
          next_attempt_at: now + backoffMs(attempts, input.backoff),
          lease_owner: null,
          lease_expires_at: null,
          inflight_started_at: null,
          last_error: input.error ?? "server error",
        },
        shouldRetry: true,
      };
    }

    case "unreachable":
      // THE critical case. The server was never reached, so nothing was
      // consumed. Attempts stay exactly as they were.
      return {
        record: {
          ...record,
          status: "pending",
          attempts: record.attempts,
          next_attempt_at: now + backoffMs(Math.max(1, record.attempts), input.backoff),
          lease_owner: null,
          lease_expires_at: null,
          inflight_started_at: null,
          last_error: input.error ?? "could not reach the server",
        },
        shouldRetry: true,
      };
  }
}

/**
 * Re-open a settled event for one more attempt.
 *
 * Used by the next app launch and by a manual Sync tap, so a `failed` event
 * is recoverable by the learner without support. `rejected` is deliberately
 * NOT re-opened: the server's refusal is final, and the exits are the local
 * export and the trainer review.
 */
export function reopenFailed(record: DeliveryRecord, now: number): DeliveryRecord {
  if (record.status !== "failed") return record;
  return {
    ...record,
    status: "pending",
    attempts: 0,
    next_attempt_at: now,
    last_error: null,
    settled_at: null,
  };
}

/** Classify a raw HTTP status, when the transport has nothing richer. */
export function classifyStatus(httpStatus: number): ResponseClass {
  if (httpStatus >= 200 && httpStatus < 300) return "success";
  if (httpStatus === 401) return "auth";
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus >= 500) return "server_error";
  if (httpStatus >= 400) return "terminal";
  return "server_error";
}
