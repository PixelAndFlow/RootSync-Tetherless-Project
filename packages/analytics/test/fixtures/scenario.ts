/**
 * Fixed demo cohort: three learners on pr-bootcamp-security-tools v2.
 * Expected results are worked out by hand in scenario.expected.ts; every
 * number there can be checked against the comments below.
 *
 * Ana: two full attempts (12/15, then 15/15). One hidden period.
 * Ben: restarts after 3 answers, completes 8/15, then practices his misses
 *      (4 of 7 fixed) and reviews one question (review never counts).
 *      The app is frozen for 300 s once (no heartbeat) — that time is not counted.
 * Cara: only plays a game wave (practice, 8 questions, 6 right) and answers one
 *      question twice in the same attempt (only the first counts). Two of her
 *      events never arrive (device_seq 7 and 8 missing).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ContentModule } from "../../../content/src/schema.ts";
import type { TetherlessEvent } from "../../../contract/src/index.ts";

const contentRoot = fileURLToPath(new URL("../../../../content/modules/", import.meta.url));
export const SECURITY_V1: ContentModule = JSON.parse(readFileSync(`${contentRoot}pr-bootcamp-security-tools/pr-bootcamp-security-tools.v1.json`, "utf8"));
export const SECURITY_V2: ContentModule = JSON.parse(readFileSync(`${contentRoot}pr-bootcamp-security-tools/pr-bootcamp-security-tools.v2.json`, "utf8"));
export const PHISHING_V1: ContentModule = JSON.parse(readFileSync(`${contentRoot}phishing-basics/phishing-basics.v1.json`, "utf8"));

const MODULE = SECURITY_V2.module_id;
const VERSION = SECURITY_V2.content_version;
const Q = (n: number) => `${MODULE}-q${String(n).padStart(2, "0")}`;
const key = new Map(SECURITY_V2.questions.map((q) => [q.question_id, q.correct_choice_id]));
const wrongChoice = (qid: string) => SECURITY_V2.questions.find((q) => q.question_id === qid)!.choices.find((c) => c.choice_id !== key.get(qid))!.choice_id;

/** Deterministic UUIDs so the fixture never changes between runs. */
const uuid = (tag: number, n: number) => `${tag.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const DEVICES = { ana: uuid(0xa, 0), ben: uuid(0xb, 0), cara: uuid(0xc, 0) } as const;

class DeviceLog {
  readonly events: TetherlessEvent[] = [];
  private seq = 0;
  private n = 0;
  private session = "";
  private sessionStart = 0;
  private readonly tag: number;
  readonly deviceId: string;
  constructor(tag: number, deviceId: string) {
    this.tag = tag;
    this.deviceId = deviceId;
  }

  private base(type: string, t: number) {
    this.seq += 1;
    this.n += 1;
    return {
      event_id: uuid(this.tag * 16 + 1, this.n),
      schema_version: 1,
      event_type: type,
      device_id: this.deviceId,
      device_seq: this.seq,
      occurred_at: new Date(this.sessionStart + t * 1000).toISOString(),
      session_id: this.session,
      monotonic_ms: t * 1000,
    };
  }
  skipSeq(count: number) {
    this.seq += count;
  }
  startSession(id: number, isoStart: string) {
    this.session = uuid(this.tag * 16 + 2, id);
    this.sessionStart = Date.parse(isoStart);
    this.events.push({ ...this.base("session_started", 0), payload: { visibility: "visible" } } as TetherlessEvent);
  }
  push(type: string, t: number, extra: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
    this.events.push({ ...this.base(type, t), ...extra, payload } as TetherlessEvent);
  }
  attemptId(n: number) {
    return uuid(this.tag * 16 + 3, n);
  }
  start(attempt: number, t: number, kind: string) {
    this.push("attempt_started", t, { module_id: MODULE, content_version: VERSION, attempt_id: this.attemptId(attempt) }, { attempt_kind: kind });
  }
  answer(attempt: number, t: number, qn: number, right: boolean) {
    const qid = Q(qn);
    this.push("answer_submitted", t, { module_id: MODULE, content_version: VERSION, attempt_id: this.attemptId(attempt), question_id: qid }, { choice_id: right ? key.get(qid) : wrongChoice(qid), response_ms: 4000 });
  }
  complete(attempt: number, t: number) {
    this.push("attempt_completed", t, { module_id: MODULE, content_version: VERSION, attempt_id: this.attemptId(attempt) });
  }
  abandon(attempt: number, t: number) {
    this.push("attempt_abandoned", t, { module_id: MODULE, content_version: VERSION, attempt_id: this.attemptId(attempt) }, { reason: "restart" });
  }
}

function ana(): DeviceLog {
  const d = new DeviceLog(0xa, DEVICES.ana);
  d.startSession(1, "2026-10-12T14:00:00.000Z");
  // Attempt 1 (full): q02, q09, q14 wrong -> 12/15. Answers every 20 s from t=10.
  d.start(1, 5, "full");
  for (let k = 0; k < 15; k++) d.answer(1, 10 + 20 * k, k + 1, ![2, 9, 14].includes(k + 1));
  d.complete(1, 295);
  d.push("visibility_changed", 300, {}, { state: "hidden" }); // 600 s away, not counted
  d.push("visibility_changed", 900, {}, { state: "visible" });
  // Attempt 2 (full): all right -> 15/15.
  d.start(2, 905, "full");
  for (let k = 0; k < 15; k++) d.answer(2, 910 + 20 * k, k + 1, true);
  d.complete(2, 1195);
  d.push("session_ended", 1200);
  return d;
}

function ben(): DeviceLog {
  const d = new DeviceLog(0xb, DEVICES.ben);
  d.startSession(1, "2026-10-13T15:00:00.000Z");
  // Attempt 1 (full): restarted after three answers.
  d.start(1, 5, "full");
  d.answer(1, 10, 1, true);
  d.answer(1, 30, 2, false);
  d.answer(1, 50, 3, true);
  d.abandon(1, 55);
  // Attempt 2 (full): right on 1,3,4,5,7,10,12,15 -> 8/15.
  d.start(2, 60, "full");
  const right2 = [1, 3, 4, 5, 7, 10, 12, 15];
  for (let k = 0; k < 15; k++) d.answer(2, 70 + 20 * k, k + 1, right2.includes(k + 1));
  d.complete(2, 355);
  d.push("heartbeat", 385);
  // Frozen: next signal 300 s later. Not counted, flagged.
  d.push("visibility_changed", 685, {}, { state: "hidden" });
  d.push("session_ended", 690);

  d.startSession(2, "2026-10-14T15:00:00.000Z");
  // Attempt 3 (practice on misses): fixes 2, 6, 8, 9; still wrong on 11, 13, 14.
  d.start(3, 5, "practice");
  [2, 6, 8, 9, 11, 13, 14].forEach((qn, k) => d.answer(3, 10 + 15 * k, qn, [2, 6, 8, 9].includes(qn)));
  d.complete(3, 105);
  // Attempt 4 (review): never counts.
  d.start(4, 106, "review");
  d.answer(4, 107, 11, true);
  d.push("session_ended", 110);
  return d;
}

function cara(): DeviceLog {
  const d = new DeviceLog(0xc, DEVICES.cara);
  d.startSession(1, "2026-10-14T18:00:00.000Z");
  // Attempt 1 (practice: a game wave of 8). Wrong on q05 and q14 -> 6/8.
  d.start(1, 2, "practice");
  const wave: [number, boolean][] = [[1, true], [3, true], [5, false], [7, true], [9, true], [12, true], [14, false], [2, true]];
  wave.forEach(([qn, right], k) => {
    if (k === 4) d.skipSeq(2); // device_seq 7 and 8 never arrive
    d.answer(1, 5 + 5 * k, qn, right);
  });
  d.answer(1, 42, 5, true); // second answer to q05 in the same attempt: ignored
  d.complete(1, 43);
  d.push("visibility_changed", 60, {}, { state: "hidden" });
  d.push("session_ended", 61);
  return d;
}

export const LEARNERS = [
  { key: "ana", name: "Ana Rivera", username: "ana.rivera", build: ana },
  { key: "ben", name: "Ben Ortiz", username: "ben.ortiz", build: ben },
  { key: "cara", name: "Cara Méndez", username: "cara.mendez", build: cara },
] as const;

/** All events for each learner, as the phone would send them. */
export function scenarioEvents(): Record<string, TetherlessEvent[]> {
  return Object.fromEntries(LEARNERS.map((l) => [l.key, l.build().events]));
}
