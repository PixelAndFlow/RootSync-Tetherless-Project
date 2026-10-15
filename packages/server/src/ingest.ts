/**
 * Sync ingest: turn one batch from a phone into per-event results.
 *
 * Called only after the device token has been verified, so an unauthenticated
 * request can never store an event or use up an event_id.
 */

import { canonicalJson, eventIdOf, validateEvent, type EventResult, type RejectCode, type StoredEvent, type TetherlessEvent } from "../../contract/src/index.ts";
import type { ContentLibrary } from "../../analytics/src/index.ts";
import { sha256Hex } from "./security.ts";
import type { Store } from "./store.ts";

export interface DeviceIdentity {
  device_id: string;
  learner_id: string;
}

function contentCheck(e: TetherlessEvent, library: ContentLibrary): { code: RejectCode; message: string } | null {
  if (!("module_id" in e)) return null;
  const m = library.get(e.module_id, e.content_version);
  if (!m) return { code: "UNKNOWN_MODULE", message: `Module ${e.module_id} version ${e.content_version} is not published on this server.` };
  if (e.event_type === "attempt_started" && e.payload.attempt_kind === "boss") {
    if (!(m.boss_missions ?? []).some((b) => b.mission_id === e.payload.mission_id)) {
      return { code: "UNKNOWN_QUESTION", message: `Boss Mission ${e.payload.mission_id} is not in ${e.module_id} version ${e.content_version}.` };
    }
  }
  if (e.event_type === "answer_submitted") {
    const q = library.questionInVersion(e.module_id, e.content_version, e.question_id);
    if (!q) return { code: "UNKNOWN_QUESTION", message: `Question ${e.question_id} is not in ${e.module_id} version ${e.content_version}.` };
    if (e.payload.choice_id !== null && !q.choices.some((c) => c.choice_id === e.payload.choice_id)) {
      return { code: "UNKNOWN_CHOICE", message: `Choice ${e.payload.choice_id} is not an option for ${e.question_id}.` };
    }
  }
  return null;
}

export async function ingestBatch(raw: unknown[], who: DeviceIdentity, store: Store, library: ContentLibrary, receivedAt: string): Promise<EventResult[]> {
  const results: EventResult[] = [];
  for (const item of raw) {
    const id = eventIdOf(item);
    const reject = async (code: RejectCode, message: string) => {
      await store.insertRejected({
        event_id: id,
        learner_id: who.learner_id,
        device_id: who.device_id,
        code,
        message,
        raw: item,
        raw_hash: sha256Hex(`${who.device_id}|${code}|${canonicalJson(item)}`),
        received_at: receivedAt,
      });
      results.push({ event_id: id, status: "rejected", code, message });
    };
    try {
      const v = validateEvent(item);
      if (!v.ok) {
        await reject(v.error.code, v.error.message);
        continue;
      }
      const e = v.event;
      if (e.device_id !== who.device_id) {
        await reject("DEVICE_MISMATCH", "This event was created on a different device than the one signed in.");
        continue;
      }
      const bad = contentCheck(e, library);
      if (bad) {
        await reject(bad.code, bad.message);
        continue;
      }
      const stored = { ...e, learner_id: who.learner_id, received_at: receivedAt } as StoredEvent;
      const outcome = await store.insertEvent(stored, sha256Hex(canonicalJson(e)));
      if (outcome === "inserted") results.push({ event_id: e.event_id, status: "accepted" });
      else if (outcome === "duplicate") results.push({ event_id: e.event_id, status: "duplicate" });
      else await reject("EVENT_ID_CONFLICT", "An event with this event_id was already received with different content.");
    } catch {
      results.push({ event_id: id, status: "retryable_error", code: "SERVER_BUSY", message: "The server couldn't store this event. Try again later." });
    }
  }
  return results;
}
