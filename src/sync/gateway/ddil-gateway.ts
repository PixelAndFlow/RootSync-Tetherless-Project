/**
 * DdilLearningGateway — the DDIL implementation of Chris's frontend contract.
 *
 * Composition:
 *
 *   screens -> GatewayProvider -> DdilLearningGateway -> SyncEngine -> SyncTransport
 *                                                              ^
 *                                          FakeTransport today, Marc's API later
 *
 * The seam that is still mocked is the network. Everything above it is real:
 * durable local writes, the outbox, leases, retry accounting, crash recovery.
 *
 * Durability contract, as agreed with Chris: `saveAnswer()` resolves only
 * after the local transaction COMMITS. The UI gates answer feedback on this
 * resolving, so a resolve must mean "on disk", never "write queued".
 */

import { openDatabase, allDelivery, allEvents, getEvent, getMeta, recordEvent, setMeta } from "../stores/db.ts";
import type { IDBDatabaseLike, IDBFactoryLike } from "../stores/idb.ts";
import { SyncEngine } from "../engine/sync.ts";
import type { SyncTransport } from "../transport/transport.ts";
import { summarize } from "./status-map.ts";
import type {
  AnswerRecord,
  AttemptKind,
  AttemptRecord,
  CompleteAttemptInput,
  LearnerModuleRecord,
  ModuleProgress,
  OfflineLearningGateway,
  SaveAnswerInput,
  SessionRecord,
  StartAttemptInput,
  StartRemediationInput,
  StartSessionInput,
  SyncSummary,
} from "./contract.ts";
import type { ActivityEvent, DeliveryRecord, EventType } from "../types.ts";

export interface DdilGatewayOptions {
  idb: IDBFactoryLike;
  /** The network seam. A FakeTransport until Marc's contract is frozen. */
  transport: SyncTransport;
  /** Stable per install. Generated and persisted on first open if absent. */
  deviceId?: string;
  /** "device_id:tab_id" — the lease owner. */
  owner?: string;
  now?: () => number;
  /** Whether a connection is believed to be available, for summary purposes. */
  isOnline?: () => boolean;
  maxEventsPerBatch?: number;
  maxAttempts?: number;
}

export class DdilLearningGateway implements OfflineLearningGateway {
  private db: IDBDatabaseLike | null = null;
  private engine: SyncEngine | null = null;
  private deviceId = "";
  private sessionId: string | null = null;
  private subscribers = new Set<(summary: SyncSummary) => void>();
  private syncing = false;

  private readonly opts: DdilGatewayOptions;
  private readonly now: () => number;

  constructor(opts: DdilGatewayOptions) {
    this.opts = opts;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Open the database and compose the engine. Call once at app start. */
  async init(): Promise<void> {
    const db = await openDatabase(this.opts.idb);
    this.db = db;

    this.deviceId = this.opts.deviceId ?? (await getMeta<string>(db, "device_id")) ?? newId("dev");
    await setMeta(db, "device_id", this.deviceId);

    this.engine = new SyncEngine({
      db,
      transport: this.opts.transport,
      owner: this.opts.owner ?? `${this.deviceId}:main`,
      now: this.now,
      maxEventsPerBatch: this.opts.maxEventsPerBatch,
      maxAttempts: this.opts.maxAttempts,
    });
  }

  // ---------------------------------------------------------------- sessions

  async startSession(input: StartSessionInput): Promise<SessionRecord> {
    const db = this.require();
    const session: SessionRecord = {
      id: newId("ses"),
      learnerId: input.learnerId,
      deviceId: input.deviceId || this.deviceId,
      startedAt: new Date(this.now()).toISOString(),
    };
    this.sessionId = session.id;

    await this.record({
      event_type: "session_started",
      payload: { visibility: "visible" },
    });

    await this.emit();
    return session;
  }

  // ---------------------------------------------------------------- attempts

  async startAttempt(input: StartAttemptInput): Promise<AttemptRecord> {
    const attempt: AttemptRecord = {
      id: newId("att"),
      learnerId: input.learnerId,
      moduleId: input.moduleId,
      kind: input.kind,
      status: "in_progress",
      startedAt: new Date(this.now()).toISOString(),
      answers: [],
    };

    await this.record({
      event_type: "attempt_started",
      module_id: input.moduleId,
      attempt_id: attempt.id,
      payload: { attempt_kind: input.kind },
    });

    await this.emit();
    return attempt;
  }

  /**
   * Save one answer.
   *
   * Resolves only after the local transaction commits — the UI gates feedback
   * on this, so a throw means "nothing was saved, let the learner retry".
   */
  async saveAnswer(input: SaveAnswerInput): Promise<void> {
    if (!input.answer.questionId) throw new Error("saveAnswer requires a questionId");

    await this.record({
      event_type: "answer_submitted",
      module_id: input.moduleId,
      attempt_id: input.attemptId,
      question_id: input.answer.questionId,
      payload: {
        choice_id: input.answer.selectedChoiceId,
        // isCorrect is the frontend's local judgement. It is NOT sent as
        // authority — the server recomputes from the answer key. It travels
        // only so local progress can render before the server agrees.
        local_is_correct: input.answer.isCorrect,
        xp_award: input.xpAward,
        answered_at: input.answer.answeredAt,
      },
    });

    await this.emit();
  }

  async completeAttempt(input: CompleteAttemptInput): Promise<AttemptRecord> {
    await this.record({
      event_type: "attempt_completed",
      module_id: input.moduleId,
      attempt_id: input.attemptId,
      payload: {
        questions_total: input.questionsTotal,
        correct_question_ids: input.correctQuestionIds,
        sector_mastery_awards: input.sectorMasteryAwards ?? [],
        mission_mastery_award: input.missionMasteryAward ?? null,
      },
    });

    await this.emit();
    return {
      id: input.attemptId,
      learnerId: input.learnerId,
      moduleId: input.moduleId,
      kind: "full",
      status: "completed",
      startedAt: new Date(this.now()).toISOString(),
      completedAt: new Date(this.now()).toISOString(),
      answers: [],
      initialCorrectCount: input.correctQuestionIds.length,
    };
  }

  async startRemediation(input: StartRemediationInput): Promise<AttemptRecord> {
    const attempt: AttemptRecord = {
      id: newId("att"),
      learnerId: input.learnerId,
      moduleId: input.moduleId,
      kind: "remediation",
      status: "in_progress",
      startedAt: new Date(this.now()).toISOString(),
      answers: [],
      questionIds: input.questionIds,
    };

    await this.record({
      event_type: "attempt_started",
      module_id: input.moduleId,
      attempt_id: attempt.id,
      payload: { attempt_kind: "practice", question_ids: input.questionIds },
    });

    await this.emit();
    return attempt;
  }

  // --------------------------------------------------------------- progress

  /**
   * Derived from locally recorded events only.
   *
   * Deliberately conservative: until the server agrees on a score, the local
   * figure is a projection for the learner's benefit and never an authority.
   */
  async getModuleProgress(learnerId: string, moduleId: string): Promise<ModuleProgress> {
    const events = await allEvents(this.require());
    const mine = events.filter(
      (e) => e.module_id === moduleId && (e.event_type === "answer_submitted" || e.event_type === "attempt_completed"),
    );
    const answers = mine.filter((e) => e.event_type === "answer_submitted");
    const distinctQuestions = new Set(answers.map((e) => e.question_id).filter(Boolean));

    return {
      learnerId,
      moduleId,
      questionsTotal: 0,
      questionsAnswered: distinctQuestions.size,
      currentMasteryPercent: 0,
      stillUnmasteredCount: 0,
      completionStatus:
        mine.some((e) => e.event_type === "attempt_completed")
          ? "completed"
          : distinctQuestions.size > 0
            ? "in_progress"
            : "not_started",
    };
  }

  async getLearnerModuleRecord(
    learnerId: string,
    moduleId: string,
  ): Promise<LearnerModuleRecord | null> {
    const progress = await this.getModuleProgress(learnerId, moduleId);
    if (progress.completionStatus === "not_started") return null;

    return {
      ...progress,
      attempts: [],
      initialMissedQuestionIds: [],
      masteredQuestionIds: [],
      engagement: {
        xp: 0,
        currentStreak: 0,
        bestStreak: 0,
        xpAwardedQuestionIds: [],
        completedSectorIds: [],
        earnedBadgeIds: [],
      },
    };
  }

  // ------------------------------------------------------------------- sync

  async getSyncSummary(): Promise<SyncSummary> {
    const records = await allDelivery(this.require());
    return summarize(records, {
      online: this.opts.isOnline?.() ?? true,
      lastSyncedAt: await getMeta<string | null>(this.require(), "last_server_ack_at"),
      syncing: this.syncing,
    });
  }

  async requestSync(): Promise<SyncSummary> {
    if (!this.engine) throw new Error("gateway not initialized — call init() first");
    this.syncing = true;
    await this.emit();
    try {
      await this.engine.runOnce();
    } finally {
      this.syncing = false;
    }
    const summary = await this.getSyncSummary();
    await this.emit();
    return summary;
  }

  subscribeToSyncStatus(callback: (summary: SyncSummary) => void): () => void {
    this.subscribers.add(callback);
    // Emit immediately, matching Chris's mock: the UI gets current state on
    // subscribe rather than waiting for the next change.
    void this.getSyncSummary().then((s) => {
      if (this.subscribers.has(callback)) callback(s);
    });
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // -------------------------------------------------------------- internals

  /** Record one event durably, then advance the sequence. */
  private async record(input: {
    event_type: EventType;
    payload: Record<string, unknown>;
    module_id?: string;
    attempt_id?: string;
    question_id?: string;
  }): Promise<ActivityEvent> {
    const db = this.require();
    const seq = ((await getMeta<number>(db, "device_seq")) ?? 0) + 1;

    const event: ActivityEvent = {
      event_id: newId("evt"),
      schema_version: 1,
      event_type: input.event_type,
      device_id: this.deviceId,
      device_seq: seq,
      session_id: this.sessionId ?? "no-session",
      occurred_at: new Date(this.now()).toISOString(),
      monotonic_ms: this.now() % 1_000_000_000,
      payload: input.payload,
      ...(input.module_id ? { module_id: input.module_id } : {}),
      ...(input.attempt_id ? { attempt_id: input.attempt_id } : {}),
      ...(input.question_id ? { question_id: input.question_id } : {}),
    };

    // Durability: this awaits the transaction commit, not the write queue.
    await recordEvent(db, event, this.now());
    await setMeta(db, "device_seq", seq);
    return event;
  }

  private async emit(): Promise<void> {
    if (this.subscribers.size === 0) return;
    const summary = await this.getSyncSummary();
    for (const cb of this.subscribers) cb(summary);
  }

  private require(): IDBDatabaseLike {
    if (!this.db) throw new Error("gateway not initialized — call init() first");
    return this.db;
  }

  /** Read-only view for tests and diagnostics. */
  async deliveryRecords(): Promise<DeliveryRecord[]> {
    return allDelivery(this.require());
  }

  async getEventById(id: string): Promise<ActivityEvent | undefined> {
    return getEvent(this.require(), id);
  }
}

function newId(prefix: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `${prefix}-${c.randomUUID()}`;
  return `${prefix}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
