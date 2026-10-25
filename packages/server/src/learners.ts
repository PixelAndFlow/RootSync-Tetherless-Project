/**
 * Learner record rules (spec v1.10 §9.2). Staff enter names and contact
 * details; the learner chooses only a username at setup. Contact fields stay
 * on the server and are never sent to a phone.
 */

import type { LearnerRecord } from "../../contract/src/staff-api.ts";
import type { ErrorDetail } from "./http.ts";
import type { Device, Learner, LearnerFields } from "./store.ts";

const LIMITS = { first_name: 80, last_name: 80, phone: 32, email: 254, training_level: 40, note_1: 1000, note_2: 1000 } as const;
export const LEARNER_FIELD_NAMES = Object.keys(LIMITS) as (keyof LearnerFields)[];

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PHONE = /^[0-9+().\-\s]{3,32}$/;

/**
 * Check staff-entered fields. With `partial`, only the fields present are
 * checked (for updates). Blank optional fields become null.
 */
export function checkLearnerFields(input: Record<string, unknown>, opts: { partial: boolean; row?: number }): { value: Partial<LearnerFields>; errors: ErrorDetail[] } {
  const errors: ErrorDetail[] = [];
  const value: Partial<LearnerFields> = {};
  const err = (field: string, code: string, message: string) => errors.push({ ...(opts.row !== undefined ? { row: opts.row } : {}), field, code, message });

  for (const field of LEARNER_FIELD_NAMES) {
    if (opts.partial && !(field in input)) continue;
    const raw = input[field];
    const s = raw === undefined || raw === null ? "" : typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : null;
    if (s === null) {
      err(field, "WRONG_TYPE", `${field} must be text.`);
      continue;
    }
    const required = field === "first_name" || field === "last_name";
    if (!s) {
      if (required) err(field, "REQUIRED", `${field === "first_name" ? "First" : "Last"} name is missing.`);
      else value[field] = null;
      continue;
    }
    if (s.length > LIMITS[field]) {
      err(field, "TOO_LONG", `${field} is longer than ${LIMITS[field]} characters.`);
      continue;
    }
    if (/[<>]/.test(s) && field !== "note_1" && field !== "note_2") {
      err(field, "INVALID", `${field} can't contain < or >.`);
      continue;
    }
    if (field === "email" && !EMAIL.test(s)) {
      err(field, "FORMAT", "This doesn't look like an email address.");
      continue;
    }
    if (field === "phone" && !PHONE.test(s)) {
      err(field, "FORMAT", "Phone numbers can contain digits, spaces and + ( ) . - only.");
      continue;
    }
    value[field] = s;
  }
  return { value, errors };
}

export type LearnerStatus = "awaiting_setup" | "active" | "phone_switched_off" | "archived";

export function learnerStatus(l: Learner, devices: Device[]): LearnerStatus {
  if (l.archived_at) return "archived";
  if (!devices.length) return "awaiting_setup";
  return devices.some((d) => !d.revoked_at) ? "active" : "phone_switched_off";
}

/** The staff view of a learner (spec v1.10 §9.2). */
export function staffLearnerView(l: Learner, devices: Device[], extra: { cohort_name?: string; last_synced_at?: string | null; includeDevices?: boolean } = {}) {
  return {
    learner_id: l.learner_id,
    learner_code: l.learner_code,
    cohort_id: l.cohort_id,
    ...(extra.cohort_name !== undefined ? { cohort_name: extra.cohort_name } : {}),
    first_name: l.first_name,
    last_name: l.last_name,
    username: l.username,
    phone: l.phone,
    email: l.email,
    training_level: l.training_level,
    note_1: l.note_1,
    note_2: l.note_2,
    status: learnerStatus(l, devices),
    created_at: l.created_at,
    archived_at: l.archived_at,
    ...(extra.last_synced_at !== undefined ? { last_synced_at: extra.last_synced_at } : {}),
    ...(extra.includeDevices ? { devices: devices.map((d) => ({ device_id: d.device_id, set_up_at: d.created_at, switched_off_at: d.revoked_at })) } : {}),
  } satisfies LearnerRecord;
}
