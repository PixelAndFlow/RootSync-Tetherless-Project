/**
 * The transport seam.
 *
 * Everything on the server side of the wire goes through this one interface.
 * The sync engine never sees HTTP, never sees a token, and never sees the
 * shared contract's shape — so when Marc and Chris land TR-12, only the
 * implementation below changes, not the engine.
 */

import type { ActivityEvent, EventOutcome } from "../types.ts";

export interface SendResult {
  /** One outcome per event, in the same order as the request. */
  outcomes: EventOutcome[];
  /** Server receipt timestamp, ISO 8601, when the server provided one. */
  received_at: string | null;
  /** Seconds from a Retry-After header, when the response carried one. */
  retryAfterSec?: number;
}

export type SendFailure =
  /** The server was never reached: DNS, offline, timeout, request died. */
  | { kind: "unreachable"; error: string }
  /** The server answered and refused. */
  | { kind: "auth"; error: string }
  | { kind: "rate_limited"; error: string; retryAfterSec?: number }
  | { kind: "server_error"; error: string }
  | { kind: "terminal"; error: string; code?: string };

export type SendResponse =
  | { ok: true; result: SendResult }
  | { ok: false; failure: SendFailure };

export interface SyncTransport {
  /**
   * Send one batch. Must never throw: a thrown error is indistinguishable
   * from a bug in the engine, and the engine has to classify every failure
   * to decide whether it consumed retry budget.
   */
  send(events: ActivityEvent[]): Promise<SendResponse>;
}
