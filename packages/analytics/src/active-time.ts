/**
 * Active-time calculator (Project Plan D14).
 *
 * Count time only while the app is the active window. Phones
 * freeze or kill hidden web apps without warning, so the phone records signals
 * and the server works the time out afterwards:
 *
 *  - Time counts only while the app is visible.
 *  - Durations come from monotonic_ms within a session, never the wall clock.
 *  - If no signal arrives for longer than maxSilenceMs while "visible" (the
 *    phone sends a heartbeat every 15–30 s), the app was frozen or killed:
 *    the interval is closed at the last signal and flagged.
 *  - If the learner doesn't interact for longer than idleLimitMs (default
 *    30 minutes, adjustable), counting stops until the next interaction, and
 *    the gap is flagged.
 *  - Elapsed time (first to last signal) is reported next to active time.
 *    Neither proves attention or learning.
 */

import type { StoredEvent } from "../../contract/src/index.ts";

export interface ActiveTimeOptions {
  idleLimitMs: number;
  maxSilenceMs: number;
}

export const DEFAULT_ACTIVE_TIME_OPTIONS: ActiveTimeOptions = {
  idleLimitMs: 30 * 60 * 1000,
  maxSilenceMs: 90 * 1000,
};

export interface TimeFlag {
  session_id: string;
  kind: "no_signal" | "idle";
  /** monotonic_ms within the session where the uncounted gap starts. */
  at_ms: number;
  gap_ms: number;
}

export interface SessionTime {
  session_id: string;
  started_at: string;
  active_ms: number;
  elapsed_ms: number;
}

export interface ActiveTimeResult {
  active_ms: number;
  elapsed_ms: number;
  sessions: SessionTime[];
  flags: TimeFlag[];
  options: ActiveTimeOptions;
}

const INTERACTION = new Set(["session_started", "attempt_started", "answer_submitted", "attempt_completed", "attempt_abandoned"]);

export function computeActiveTime(events: readonly StoredEvent[], options: ActiveTimeOptions = DEFAULT_ACTIVE_TIME_OPTIONS): ActiveTimeResult {
  const bySession = new Map<string, StoredEvent[]>();
  for (const e of events) {
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id)!.push(e);
  }

  const sessions: SessionTime[] = [];
  const flags: TimeFlag[] = [];
  for (const [session_id, list] of bySession) {
    list.sort((a, b) => a.device_seq - b.device_seq);
    const start = list.find((e) => e.event_type === "session_started");
    let visible = start ? start.event_type === "session_started" && start.payload.visibility === "visible" : true;
    let lastInteraction = list[0]!.monotonic_ms;
    let idleFlagged = false;
    let active = 0;

    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      const from = prev.monotonic_ms;
      const to = Math.max(from, cur.monotonic_ms);
      if (visible && to > from) {
        if (to - from > options.maxSilenceMs) {
          flags.push({ session_id, kind: "no_signal", at_ms: from, gap_ms: to - from });
        } else {
          const idleAt = lastInteraction + options.idleLimitMs;
          const counted = Math.max(0, Math.min(to, idleAt) - from);
          active += counted;
          if (to > idleAt && !idleFlagged) {
            flags.push({ session_id, kind: "idle", at_ms: Math.max(from, idleAt), gap_ms: to - Math.max(from, idleAt) });
            idleFlagged = true;
          } else if (to > idleAt && idleFlagged) {
            flags.at(-1)!.gap_ms += to - Math.max(from, idleAt);
          }
        }
      }
      if (cur.event_type === "visibility_changed") {
        visible = cur.payload.state === "visible";
        if (visible) {
          lastInteraction = cur.monotonic_ms;
          idleFlagged = false;
        }
      }
      if (INTERACTION.has(cur.event_type)) {
        lastInteraction = cur.monotonic_ms;
        idleFlagged = false;
      }
      if (cur.event_type === "session_ended") visible = false;
    }

    const first = list[0]!;
    const last = list.at(-1)!;
    sessions.push({ session_id, started_at: first.occurred_at, active_ms: Math.round(active), elapsed_ms: Math.round(last.monotonic_ms - first.monotonic_ms) });
  }

  sessions.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  return {
    active_ms: sessions.reduce((n, s) => n + s.active_ms, 0),
    elapsed_ms: sessions.reduce((n, s) => n + s.elapsed_ms, 0),
    sessions,
    flags,
    options,
  };
}
