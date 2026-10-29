/**
 * A controllable transport for tests.
 *
 * Scripts responses, records what was sent, and can fail on demand. It never
 * touches the network, so the sync engine's behaviour is testable without a
 * server, a token, or Marc's Postgres.
 */

import type { SyncTransport, SendResponse, SendFailure } from "../../../src/sync/transport/transport.ts";
import type { ActivityEvent, EventOutcome } from "../../../src/sync/types.ts";

export interface SentBatch {
  events: ActivityEvent[];
  at: number;
}

export type Script =
  /** Accept every event. */
  | { kind: "accept_all" }
  /** Report every event as already held — the replay case. */
  | { kind: "duplicate_all" }
  /** Reject every event with a code. */
  | { kind: "reject_all"; code: string; message: string }
  /** Accept some, reject others, by index. */
  | { kind: "mixed"; rejected: number[]; code: string; message: string }
  /** Fail the whole request. */
  | { kind: "fail"; failure: SendFailure }
  /** Return success with no results at all (a server bug). */
  | { kind: "empty_results" }
  /** Throw, as a transport bug would. */
  | { kind: "throw"; error: string };

export class FakeTransport implements SyncTransport {
  readonly sent: SentBatch[] = [];
  private scripts: Script[] = [];
  private fallback: Script = { kind: "accept_all" };

  private readonly clock: () => number;

  constructor(clock: () => number) {
    this.clock = clock;
  }

  /** Queue the next response(s), in order. */
  script(...scripts: Script[]): this {
    this.scripts.push(...scripts);
    return this;
  }

  /** What every un-scripted call returns. */
  always(s: Script): this {
    this.fallback = s;
    return this;
  }

  get sendCount(): number {
    return this.sent.length;
  }

  async send(events: ActivityEvent[]): Promise<SendResponse> {
    this.sent.push({ events: [...events], at: this.clock() });
    const s = this.scripts.shift() ?? this.fallback;
    const at = new Date(this.clock()).toISOString();

    switch (s.kind) {
      case "throw":
        throw new Error(s.error);

      case "fail":
        return { ok: false, failure: s.failure };

      case "empty_results":
        return { ok: true, result: { outcomes: [], received_at: at } };

      case "accept_all":
        return { ok: true, result: { outcomes: events.map(outcome("accepted")), received_at: at } };

      case "duplicate_all":
        return { ok: true, result: { outcomes: events.map(outcome("duplicate")), received_at: at } };

      case "reject_all":
        return {
          ok: true,
          result: {
            outcomes: events.map((e) => ({
              event_id: e.event_id,
              status: "rejected" as const,
              code: s.code,
              message: s.message,
            })),
            received_at: at,
          },
        };

      case "mixed": {
        const rejected = new Set(s.rejected);
        return {
          ok: true,
          result: {
            outcomes: events.map((e, i) =>
              rejected.has(i)
                ? {
                    event_id: e.event_id,
                    status: "rejected" as const,
                    code: s.code,
                    message: s.message,
                  }
                : outcome("accepted")(e),
            ),
            received_at: at,
          },
        };
      }
    }
  }
}

function outcome(status: EventOutcome["status"]) {
  return (e: ActivityEvent): EventOutcome => ({ event_id: e.event_id, status });
}
