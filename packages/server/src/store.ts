/**
 * Storage interface. Two implementations:
 *  - MemoryStore: tests and local demos (data is lost on restart)
 *  - PgStore: production on PostgreSQL
 * Both must give the same answers; the server tests run against MemoryStore,
 * and db/schema.sql encodes the same rules as constraints.
 */

import type { StoredEvent } from "../../contract/src/index.ts";

export interface Trainer {
  trainer_id: string;
  username: string;
  name: string;
  password_hash: string;
}

export interface Cohort {
  cohort_id: string;
  name: string;
  created_at: string;
}

export interface EnrollmentCode {
  code: string;
  kind: "cohort" | "relink";
  cohort_id: string;
  learner_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  max_uses: number | null;
  uses: number;
}

export interface Learner {
  learner_id: string;
  cohort_id: string;
  name: string;
  username: string;
  created_at: string;
}

export interface Device {
  device_id: string;
  learner_id: string;
  revoked_at: string | null;
}

export interface RejectedEvent {
  event_id: string | null;
  learner_id: string;
  device_id: string;
  code: string;
  message: string;
  raw: unknown;
  raw_hash: string;
  received_at: string;
}

export type InsertResult = "inserted" | "duplicate" | "conflict";

export interface EnrollInput {
  code: string;
  now: string;
  /** For a cohort code: the new learner. Ignored for a re-link code. */
  learner: { learner_id: string; name: string; username: string };
  device: { device_id: string; token_hash: string };
}

export type EnrollResult =
  | { ok: true; learner: Learner; cohort: Cohort }
  | { ok: false; reason: "INVALID_CODE" | "USERNAME_TAKEN" | "DEVICE_EXISTS" };

export interface Store {
  close(): Promise<void>;

  createTrainer(t: Trainer): Promise<void>;
  getTrainerByUsername(username: string): Promise<Trainer | undefined>;
  createTrainerSession(tokenHash: string, trainerId: string, expiresAt: string): Promise<void>;
  getTrainerSession(tokenHash: string, now: string): Promise<Trainer | undefined>;
  deleteTrainerSession(tokenHash: string): Promise<void>;

  createCohort(c: Cohort, createdBy: string | null): Promise<void>;
  getCohort(cohortId: string): Promise<Cohort | undefined>;
  listCohorts(): Promise<(Cohort & { learners: number })[]>;

  /** Fails with false when the code already exists. */
  createCode(c: EnrollmentCode): Promise<boolean>;
  listCodes(cohortId: string): Promise<EnrollmentCode[]>;
  revokeCode(code: string, now: string): Promise<boolean>;

  /**
   * Atomically: check the code (exists, not revoked, not expired, uses left),
   * create the learner (cohort code) or find it (re-link code), register the
   * device, and count the code use.
   */
  enroll(input: EnrollInput): Promise<EnrollResult>;

  getLearner(learnerId: string): Promise<Learner | undefined>;
  listLearners(cohortId: string): Promise<Learner[]>;
  getDeviceByTokenHash(tokenHash: string): Promise<Device | undefined>;
  listDevices(learnerId: string): Promise<Device[]>;
  revokeDevice(deviceId: string, now: string): Promise<boolean>;

  /** Insert once by event_id. Same event_id + same content → duplicate; different content → conflict. */
  insertEvent(e: StoredEvent, contentHash: string): Promise<InsertResult>;
  /** Ignores exact repeats of the same rejected payload. */
  insertRejected(r: RejectedEvent): Promise<void>;
  listEvents(learnerId: string): Promise<StoredEvent[]>;
  listRejected(learnerId: string): Promise<RejectedEvent[]>;
}
