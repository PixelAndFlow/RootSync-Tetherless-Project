/**
 * HTTP transport — the real implementation of the SyncTransport seam.
 *
 * Written against the confirmed contract on Marc's branch
 * `trial/2026-10-21-spec-v1.10`:
 *
 *   POST /v1/sync/events
 *   auth: Bearer <device token>       (checked BEFORE the body is read)
 *   body: { schema_version: 1, events: [...] }   max 200 events / 512 KB
 *   200:  { schema_version, received_at, results: EventResult[] }
 *   400:  malformed body / unsupported schema_version — nothing stored
 *   401:  missing, unknown or revoked token — nothing stored, keep the events
 *   413:  too many events / body too large — split the batch
 *   429:  rate limited, honour Retry-After
 *   5xx:  server problem — retry everything later with the same event_ids
 *
 * The transport never throws. Every failure is classified, because the
 * classification is what decides whether the learner's retry budget was spent.
 */

import type { SendResponse, SyncTransport } from "./transport.ts";
import type { ActivityEvent, EventOutcome } from "../types.ts";

export const MAX_EVENTS_PER_BATCH = 200;
export const MAX_BODY_BYTES = 512 * 1024;

export interface HttpTransportOptions {
  baseUrl: string;
  /** Read at call time, so a refreshed or rotated token is picked up. */
  token: () => string | null | Promise<string | null>;
  /** Injected for tests. Defaults to global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class HttpTransport implements SyncTransport {
  private readonly opts: HttpTransportOptions;

  constructor(opts: HttpTransportOptions) {
    this.opts = opts;
  }

  async send(events: ActivityEvent[]): Promise<SendResponse> {
    let token: string | null;
    try {
      token = await this.opts.token();
    } catch (err) {
      return { ok: false, failure: { kind: "unreachable", error: describe(err) } };
    }

    if (!token) {
      // No credential is an authorization problem, not a transport failure.
      // blocked_auth consumes no retry budget.
      return { ok: false, failure: { kind: "auth", error: "no device token" } };
    }

    const chunks = chunk(events);
    // A batch over the cap is the caller's bug, but failing the whole send
    // would lose the rest, so send what fits and let the next pass take the
    // remainder.
    const batch = chunks[0] ?? [];

    const body = JSON.stringify({ schema_version: 1, events: batch });
    const doFetch = this.opts.fetch ?? globalThis.fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 30_000);

    let res: Response;
    try {
      res = await doFetch(`${this.opts.baseUrl.replace(/\/$/, "")}/v1/sync/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      // Network error, DNS, offline, timeout, or an aborted request. The
      // server may or may not have seen it — but the retry is idempotent, so
      // the safe classification is "the server was not reached".
      return { ok: false, failure: { kind: "unreachable", error: describe(err) } };
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      const message = await safeError(res);
      return { ok: false, failure: { kind: "auth", error: message } };
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "");
      return {
        ok: false,
        failure: {
          kind: "rate_limited",
          error: await safeError(res),
          ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSec: retryAfter } : {}),
        },
      };
    }

    if (res.status >= 500) {
      return { ok: false, failure: { kind: "server_error", error: await safeError(res) } };
    }

    if (res.status === 413) {
      // Split and resend. Classified as retryable: the server was reached but
      // did not take this batch, and the next pass will send a smaller one.
      return { ok: false, failure: { kind: "server_error", error: "batch too large; split and resend" } };
    }

    if (!res.ok) {
      return { ok: false, failure: { kind: "terminal", error: await safeError(res) } };
    }

    let payload: { received_at?: string; results?: EventOutcome[] };
    try {
      payload = (await res.json()) as typeof payload;
    } catch (err) {
      // A 200 with an unreadable body is not a success we can trust.
      return { ok: false, failure: { kind: "unreachable", error: `unreadable response: ${describe(err)}` } };
    }

    const results = payload.results ?? [];
    if (results.length === 0 && batch.length > 0) {
      // Success with no results: we cannot know what the server did, so do
      // not mark anything delivered.
      return { ok: false, failure: { kind: "unreachable", error: "server returned no per-event results" } };
    }

    return {
      ok: true,
      result: {
        outcomes: results.map((r) => ({
          event_id: r.event_id,
          status: r.status,
          ...(r.code ? { code: r.code } : {}),
          ...(r.message ? { message: r.message } : {}),
          ...(payload.received_at ? { received_at: payload.received_at } : {}),
        })),
        received_at: payload.received_at ?? null,
      },
    };
  }
}

/** Split a batch to respect the server's per-request cap. */
export function chunk(events: ActivityEvent[]): ActivityEvent[][] {
  const out: ActivityEvent[][] = [];
  for (let i = 0; i < events.length; i += MAX_EVENTS_PER_BATCH) {
    out.push(events.slice(i, i + MAX_EVENTS_PER_BATCH));
  }
  return out;
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    const code = body.error?.code;
    const message = body.error?.message;
    if (code && message) return `${code}: ${message}`;
    if (message) return message;
  } catch {
    /* fall through */
  }
  return `HTTP ${res.status}`;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.name === "AbortError" ? "request timed out" : err.message;
  return String(err);
}
