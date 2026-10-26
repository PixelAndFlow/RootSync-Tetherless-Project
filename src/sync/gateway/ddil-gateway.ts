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
import { withDeviceSeqLock } from "../engine/lease.ts";
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
  backoff?: import("../engine/retry.ts").BackoffOptions;
  reopenFailedOnStart?: boolean;
}

export class DdilLearningGateway implements OfflineLearningGateway {
  private db: IDBDatabaseLike | null = null;
  private engine: SyncEngine | null = null;
  private deviceId = "";
  private sessionId: string | null = null;
  /**
   * performance.now() at session start. monotonic_ms is elapsed time since
   * then, never a wall clock: active time must not depend on the phone clock.
   */
  private sessionStartedAtMonotonic: number | null = null;
  private sessionStartedAtWall: number | null = null;
  private subscribers = new Set<(summary: SyncSummary) => void>();
  private syncing = false;

  private readonly opts: DdilGatewayOptions;
  private readonly now: () => number;
  /**
   * The content version the learner is answering against. Defaults to 1 —
   * the only version the demo modules publish — and is settable once the
   * content package carries its own version (RCO's schema, still open).
   */
  private contentVersion = 1;
  /** Set from setup; used to start an implicit session if one is missing. */
  private currentLearnerId: string | null = null;
  /** Last module touched, so attempt_abandoned can carry module_id. */
  private lastModuleId: string | null = null;

  constructor(opts: DdilGatewayOptions) {
    this.opts = opts;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Open the database and compose the engine. Call once at app start. */
  async init(): Promise<void> {
    const db = await openDatabase(this.opts.idb);
    this.db = db;

    this.deviceId = this.opts.deviceId ?? (await getMeta<string>(db, "device_id")) ?? newId();
    await setMeta(db, "device_id", this.deviceId);

    const savedSession = await getMeta<string>(db, "active_session_id");
    if (savedSession) {
      this.sessionId = savedSession;
    }
    const savedLearner = await getMeta<string>(db, "active_learner_id");
    if (savedLearner) {
      this.currentLearnerId = savedLearner;
    }
    const savedStartWall = await getMeta<number>(db, "session_start_wall_ms");
    if (savedStartWall) {
      this.sessionStartedAtWall = savedStartWall;
    }

    this.engine = new SyncEngine({
      db,
      transport: this.opts.transport,
      owner: this.opts.owner ?? `${this.deviceId}:main`,
      now: this.now,
      maxEventsPerBatch: this.opts.maxEventsPerBatch,
      maxAttempts: this.opts.maxAttempts,
      backoff: this.opts.backoff,
      reopenFailedOnStart: this.opts.reopenFailedOnStart,
    });
  }

  // ---------------------------------------------------------------- sessions

  async startSession(input: StartSessionInput): Promise<SessionRecord> {
    const db = this.require();
    const session: SessionRecord = {
      id: newId(),
      learnerId: input.learnerId,
      deviceId: input.deviceId || this.deviceId,
      startedAt: new Date(this.now()).toISOString(),
    };
    this.sessionId = session.id;
    this.currentLearnerId = input.learnerId;
    this.sessionStartedAtMonotonic = monotonicNow();
    this.sessionStartedAtWall = this.now();

    await setMeta(db, "active_session_id", session.id);
    await setMeta(db, "active_learner_id", input.learnerId);
    await setMeta(db, "session_start_wall_ms", this.sessionStartedAtWall);

    // Unblock any records waiting in blocked_auth
    await this.engine?.unblockAuth();

    await this.record({
      event_type: "session_started",
      payload: { visibility: "visible" },
    });

    await this.emit();
    return session;
  }

  // ---------------------------------------------------------------- attempts

  async startAttempt(input: StartAttemptInput): Promise<AttemptRecord> {
    this.lastModuleId = input.moduleId;
    const attempt: AttemptRecord = {
      id: newId(),
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
      content_version: this.contentVersion,
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
      content_version: this.contentVersion,
      attempt_id: input.attemptId,
      question_id: input.answer.questionId,
      // Only fields the strict schema allows. xp_award and answered_at are
      // local UI state; the server rejects unknown payload keys outright, so
      // they are retained locally (below) instead of sent.
      payload: {
        choice_id: input.answer.selectedChoiceId,
        // isCorrect is the frontend's local judgement, stored by the server
        // for comparison and never used for scoring (spec v1.10 D-9).
        local_is_correct: input.answer.isCorrect,
      },
    });

    await this.retainLocal({
      kind: "answer_ui",
      attempt_id: input.attemptId,
      question_id: input.answer.questionId,
      xp_award: input.xpAward,
      answered_at: input.answer.answeredAt,
    });

    await this.emit();
  }

  async completeAttempt(input: CompleteAttemptInput): Promise<AttemptRecord> {
    // Wire shape, per spec v1.10 (contract AttemptCompleted): the phone may
    // report what it showed the learner, as COUNTS, never as a score the
    // server trusts. `local_correct` / `local_total` are the only fields the
    // strict schema accepts here — sending questions_total or
    // correct_question_ids would be an unknown field and hard-reject as
    // INVALID_EVENT.
    //
    // The richer award data (sector mastery, badges) has no home on the wire
    // yet. It stays local until the contract carries it; dropping it silently
    // would lose engagement state the UI already shows.
    await this.record({
      event_type: "attempt_completed",
      module_id: input.moduleId,
      content_version: this.contentVersion,
      attempt_id: input.attemptId,
      payload: {
        local_correct: input.correctQuestionIds.length,
        local_total: input.questionsTotal,
      },
    });

    this.retainLocal({
      kind: "attempt_awards",
      attempt_id: input.attemptId,
      module_id: input.moduleId,
      sector_mastery_awards: input.sectorMasteryAwards ?? [],
      mission_mastery_award: input.missionMasteryAward ?? null,
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
      initialScorePercent:
        input.questionsTotal > 0
          ? Math.round((input.correctQuestionIds.length / input.questionsTotal) * 100)
          : undefined,
    };
  }

  async startRemediation(input: StartRemediationInput): Promise<AttemptRecord> {
    const attempt: AttemptRecord = {
      id: newId(),
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
      content_version: this.contentVersion,
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
    content_version?: number;
    attempt_id?: string;
    question_id?: string;
  }): Promise<ActivityEvent> {
    const db = this.require();
    if (!this.sessionId) {
      // The server requires a UUID session_id on every event and rejects
      // "no-session". Start one implicitly rather than emit an invalid event.
      await this.startSession({ learnerId: this.currentLearnerId ?? "", deviceId: this.deviceId });
    }

    return withDeviceSeqLock(async () => {
      const seq = ((await getMeta<number>(db, "device_seq")) ?? 0) + 1;

      const event: ActivityEvent = {
        event_id: newId(),
        schema_version: 1,
        event_type: input.event_type,
        device_id: this.deviceId,
        device_seq: seq,
        session_id: this.sessionId!,
        occurred_at: new Date(this.now()).toISOString(),
        monotonic_ms: this.elapsedMonotonic(),
        payload: input.payload,
        ...(input.module_id ? { module_id: input.module_id } : {}),
        ...(input.content_version ? { content_version: input.content_version } : {}),
        ...(input.attempt_id ? { attempt_id: input.attempt_id } : {}),
        ...(input.question_id ? { question_id: input.question_id } : {}),
      };

      // Durability: this awaits the transaction commit, not the write queue.
      await recordEvent(db, event, this.now());
      await setMeta(db, "device_seq", seq);
      return event;
    });
  }

  private async emit(): Promise<void> {
    if (this.subscribers.size === 0) return;
    const summary = await this.getSyncSummary();
    for (const cb of this.subscribers) cb(summary);
  }

  /**
   * Keep data the wire contract has no field for.
   *
   * Award and badge data is real UI state, so it is not discarded just
   * because the event envelope cannot carry it yet. It lives in `meta` under
   * a keyed slot until the contract grows a home for it.
   */
  private async retainLocal(record: { kind: string; attempt_id: string; [k: string]: unknown }): Promise<void> {
    const db = this.db;
    if (!db) return;
    await setMeta(db, `local:${record.kind}:${record.attempt_id}`, record);
  }

  private require(): IDBDatabaseLike {
    if (!this.db) throw new Error("gateway not initialized — call init() first");
    return this.db;
  }

  /** Milliseconds since this session started, from a monotonic clock. */
  private elapsedMonotonic(): number {
    if (this.sessionStartedAtMonotonic !== null) {
      return Math.max(0, Math.round(monotonicNow() - this.sessionStartedAtMonotonic));
    }
    if (this.sessionStartedAtWall !== null) {
      return Math.max(0, Math.round(this.now() - this.sessionStartedAtWall));
    }
    return 0;
  }

  /** Pin the content version stamped onto attempt events. */
  setContentVersion(version: number): void {
    if (!Number.isInteger(version) || version < 1) {
      throw new Error("content_version must be a whole number of 1 or more");
    }
    this.contentVersion = version;
  }

  /**
   * Emit a visibility change. Active time on the server depends on these.
   */
  async noteVisibility(state: "visible" | "hidden"): Promise<void> {
    await this.record({ event_type: "visibility_changed", payload: { state } });
    await this.emit();
  }

  /**
   * Emit a heartbeat. The server expects one every 15-30s while visible;
   * active time is derived from them.
   */
  async heartbeat(): Promise<void> {
    await this.record({ event_type: "heartbeat", payload: {} });
    await this.emit();
  }

  /**
   * Abandon an attempt (N-8). Reason is required by the server.
   */
  async abandonAttempt(attemptId: string, reason: "restart" | "quit" | "replaced" = "quit"): Promise<void> {
    await this.record({
      event_type: "attempt_abandoned",
      module_id: this.lastModuleId ?? "",
      content_version: this.contentVersion,
      attempt_id: attemptId,
      payload: { reason },
    });
    await this.emit();
  }

  /** Read-only view for tests and diagnostics. */
  async deliveryRecords(): Promise<DeliveryRecord[]> {
    return allDelivery(this.require());
  }

  async getEventById(id: string): Promise<ActivityEvent | undefined> {
    return getEvent(this.require(), id);
  }
}

/**
 * A bare RFC 4122 UUID — no prefix.
 *
 * The server's strict schema validates event_id, session_id, attempt_id and
 * device_id against a UUID regex, so a prefixed id ("evt-...") is rejected as
 * INVALID_EVENT before anything else is checked. IDs that must survive the
 * wire are bare; purely local ids may be prefixed.
 */
/** performance.now() when available, else Date.now(). Never a wall clock for durations. */
function monotonicNow(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return perf?.now ? perf.now() : Date.now();
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 fallback for runtimes without crypto.randomUUID.
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
