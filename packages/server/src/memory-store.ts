import type { StoredEvent } from "../../contract/src/index.ts";
import type { Cohort, Device, EnrollInput, EnrollResult, EnrollmentCode, InsertResult, Learner, RejectedEvent, Store, Trainer } from "./store.ts";

/** In-memory store for tests and demos. Same rules as PgStore; data is lost on restart. */
export class MemoryStore implements Store {
  private trainers = new Map<string, Trainer>();
  private sessions = new Map<string, { trainer_id: string; expires_at: string }>();
  private cohorts = new Map<string, Cohort>();
  private codes = new Map<string, EnrollmentCode>();
  private learners = new Map<string, Learner>();
  private devices = new Map<string, Device & { token_hash: string }>();
  private events = new Map<string, { e: StoredEvent; hash: string }>();
  private rejected = new Map<string, RejectedEvent>();

  async close(): Promise<void> {}

  async createTrainer(t: Trainer): Promise<void> {
    if ([...this.trainers.values()].some((x) => x.username === t.username)) throw new Error(`Trainer ${t.username} already exists`);
    this.trainers.set(t.trainer_id, { ...t });
  }
  async getTrainerByUsername(username: string) {
    return [...this.trainers.values()].find((t) => t.username === username);
  }
  async createTrainerSession(tokenHash: string, trainerId: string, expiresAt: string) {
    this.sessions.set(tokenHash, { trainer_id: trainerId, expires_at: expiresAt });
  }
  async getTrainerSession(tokenHash: string, now: string) {
    const s = this.sessions.get(tokenHash);
    if (!s || s.expires_at <= now) return undefined;
    return this.trainers.get(s.trainer_id);
  }
  async deleteTrainerSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async createCohort(c: Cohort) {
    this.cohorts.set(c.cohort_id, { ...c });
  }
  async getCohort(id: string) {
    return this.cohorts.get(id);
  }
  async listCohorts() {
    return [...this.cohorts.values()]
      .map((c) => ({ ...c, learners: [...this.learners.values()].filter((l) => l.cohort_id === c.cohort_id).length }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async createCode(c: EnrollmentCode) {
    if (this.codes.has(c.code)) return false;
    this.codes.set(c.code, { ...c });
    return true;
  }
  async listCodes(cohortId: string) {
    return [...this.codes.values()].filter((c) => c.cohort_id === cohortId);
  }
  async revokeCode(code: string, now: string) {
    const c = this.codes.get(code);
    if (!c || c.revoked_at) return false;
    c.revoked_at = now;
    return true;
  }

  async enroll(input: EnrollInput): Promise<EnrollResult> {
    const code = this.codes.get(input.code);
    if (!code || code.revoked_at || (code.expires_at && code.expires_at <= input.now) || (code.max_uses !== null && code.uses >= code.max_uses)) {
      return { ok: false, reason: "INVALID_CODE" };
    }
    const cohort = this.cohorts.get(code.cohort_id)!;
    if (this.devices.has(input.device.device_id)) return { ok: false, reason: "DEVICE_EXISTS" };
    let learner: Learner;
    if (code.kind === "relink") {
      const existing = code.learner_id ? this.learners.get(code.learner_id) : undefined;
      if (!existing || existing.username !== input.learner.username) return { ok: false, reason: "INVALID_CODE" };
      learner = existing;
    } else {
      if ([...this.learners.values()].some((l) => l.cohort_id === cohort.cohort_id && l.username === input.learner.username)) {
        return { ok: false, reason: "USERNAME_TAKEN" };
      }
      learner = { ...input.learner, cohort_id: cohort.cohort_id, created_at: input.now };
      this.learners.set(learner.learner_id, learner);
    }
    this.devices.set(input.device.device_id, { device_id: input.device.device_id, learner_id: learner.learner_id, revoked_at: null, token_hash: input.device.token_hash });
    code.uses += 1;
    return { ok: true, learner, cohort };
  }

  async getLearner(id: string) {
    return this.learners.get(id);
  }
  async listLearners(cohortId: string) {
    return [...this.learners.values()].filter((l) => l.cohort_id === cohortId).sort((a, b) => a.username.localeCompare(b.username));
  }
  async getDeviceByTokenHash(tokenHash: string) {
    const d = [...this.devices.values()].find((x) => x.token_hash === tokenHash);
    return d && { device_id: d.device_id, learner_id: d.learner_id, revoked_at: d.revoked_at };
  }
  async listDevices(learnerId: string) {
    return [...this.devices.values()].filter((d) => d.learner_id === learnerId).map(({ token_hash: _t, ...d }) => d);
  }
  async revokeDevice(deviceId: string, now: string) {
    const d = this.devices.get(deviceId);
    if (!d || d.revoked_at) return false;
    d.revoked_at = now;
    return true;
  }

  async insertEvent(e: StoredEvent, contentHash: string): Promise<InsertResult> {
    const existing = this.events.get(e.event_id);
    if (existing) return existing.hash === contentHash ? "duplicate" : "conflict";
    this.events.set(e.event_id, { e: structuredClone(e), hash: contentHash });
    return "inserted";
  }
  async insertRejected(r: RejectedEvent) {
    if (!this.rejected.has(r.raw_hash)) this.rejected.set(r.raw_hash, structuredClone(r));
  }
  async listEvents(learnerId: string) {
    return [...this.events.values()].filter((x) => x.e.learner_id === learnerId).map((x) => structuredClone(x.e));
  }
  async listRejected(learnerId: string) {
    return [...this.rejected.values()].filter((r) => r.learner_id === learnerId).map((r) => structuredClone(r));
  }
}
