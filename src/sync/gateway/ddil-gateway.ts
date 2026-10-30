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

import { openDatabase, allDelivery, allEvents, getEvent, getMeta, recordEvent, reserveDeviceSeq, setMeta } from "../stores/db.ts";
import type { IDBDatabaseLike, IDBFactoryLike } from "../stores/idb.ts";
import { SyncEngine } from "../engine/sync.ts";
import { withDeviceSeqLock } from "../engine/lease.ts";
import type { SyncTransport } from "../transport/transport.ts";
import { summarize } from "./status-map.ts";
import { gamificationAwards } from "../../utils/gamification.ts";
import type {
  AnswerRecord,
  AttemptKind,
  AttemptRecord,
  CompleteAttemptInput,
  DeviceApi,
  EngagementSummary,
  LearnerModuleRecord,
  LearnerProfile,
  ModuleProgress,
  ModuleSummary,
  OfflineLearningGateway,
  SaveAnswerInput,
  SessionRecord,
  StartAttemptInput,
  StartRemediationInput,
  StartSessionInput,
  SyncSummary,
  TetherlessModule,
} from "./contract.ts";
import type { ActivityEvent, ActivityEventInput, AnswerSubmittedEvent, AttemptAbandonedEvent, AttemptCompletedEvent, AttemptStartedEvent, DeliveryRecord } from "../types.ts";

export interface DdilGatewayOptions {
  idb: IDBFactoryLike;
  /** The network seam. A FakeTransport until Marc's contract is frozen. */
  transport: SyncTransport;
  /**
   * The two device-scoped HTTP calls beyond POST /v1/sync/events: setup and
   * module catalog/download (API Spec v1.30 §6.1, §6.4). Omit in tests that
   * never call setupDevice/listAssignedModules/getModule.
   */
  api?: DeviceApi;
  /** Stable per install. Generated and persisted on first open if absent. */
  deviceId?: string;
  /** "device_id:tab_id" — the lease owner. */
  owner?: string;
  now?: () => number;
  /** Whether a connection is believed to be available, for summary purposes. */
  isOnline?: () => boolean;
  maxEventsPerBatch?: number;
  maxAttempts?: number;
  /**
   * Called whenever the persisted device token changes (loaded at init, or
   * set by setupDevice). Lets the composition root's HttpTransport/DeviceApi
   * read the current token without DdilLearningGateway owning their construction.
   */
  onTokenChange?: (token: string | null) => void;
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
  /** content_version each attempt was started with; every later event of that attempt reuses it. */
  private readonly attemptVersions = new Map<string, number>();
  /** Set from setup; used to start an implicit session if one is missing. */
  private currentLearnerId: string | null = null;
  /** The device token from /v1/setup, protected store only — never localStorage (API Spec v1.30 §6.1). */
  private deviceToken: string | null = null;

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

    this.deviceToken = (await getMeta<string>(db, "device_token")) ?? null;
    this.opts.onTokenChange?.(this.deviceToken);

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

    // SyncStatusProvider subscribes on mount, before the composition root's
    // init() promise can possibly have resolved. Its own first emit (below)
    // rejects quietly in that case, so push a real one now that the gateway
    // is actually ready, rather than leaving that subscriber with nothing
    // until the next unrelated event.
    void this.emit();
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
    const attempt: AttemptRecord = {
      id: newId(),
      learnerId: input.learnerId,
      moduleId: input.moduleId,
      kind: input.kind,
      status: "in_progress",
      startedAt: new Date(this.now()).toISOString(),
      answers: [],
    };

    const contentVersion = await this.pinAttemptVersion(attempt.id, input.contentVersion);
    await this.record({
      event_type: "attempt_started",
      module_id: input.moduleId,
      content_version: contentVersion,
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
      content_version: await this.versionOfAttempt(input.attemptId),
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
      content_version: await this.versionOfAttempt(input.attemptId),
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

    const contentVersion = await this.pinAttemptVersion(attempt.id, input.contentVersion);
    await this.record({
      event_type: "attempt_started",
      module_id: input.moduleId,
      content_version: contentVersion,
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
    const state = await this.deriveModuleState(learnerId, moduleId);
    return {
      learnerId,
      moduleId,
      questionsTotal: state.questionsTotal,
      questionsAnswered: state.masteredOrAnsweredCount,
      initialScorePercent: state.initialScorePercent,
      currentMasteryPercent: state.currentMasteryPercent,
      stillUnmasteredCount: state.stillUnmasteredCount,
      completionStatus: state.completionStatus,
    };
  }

  async getLearnerModuleRecord(
    learnerId: string,
    moduleId: string,
  ): Promise<LearnerModuleRecord | null> {
    const state = await this.deriveModuleState(learnerId, moduleId);
    if (state.completionStatus === "not_started") return null;

    return {
      learnerId,
      moduleId,
      questionsTotal: state.questionsTotal,
      questionsAnswered: state.masteredOrAnsweredCount,
      initialScorePercent: state.initialScorePercent,
      currentMasteryPercent: state.currentMasteryPercent,
      stillUnmasteredCount: state.stillUnmasteredCount,
      completionStatus: state.completionStatus,
      attempts: state.attempts,
      firstStartedAt: state.firstStartedAt,
      firstCompletedAt: state.firstCompletedAt,
      initialMissedQuestionIds: state.initialMissedQuestionIds,
      masteredQuestionIds: [...state.masteredQuestionIds],
      engagement: state.engagement,
    };
  }

  /**
   * Replays this module's local event history — the only source either
   * progress method may read from (see the comment above getModuleProgress).
   * Nothing here is sent to, or trusted from, the server.
   */
  private async deriveModuleState(
    learnerId: string,
    moduleId: string,
  ): Promise<{
    questionsTotal: number;
    masteredOrAnsweredCount: number;
    masteredQuestionIds: Set<string>;
    initialMissedQuestionIds: string[];
    currentMasteryPercent: number;
    stillUnmasteredCount: number;
    completionStatus: "not_started" | "in_progress" | "completed";
    initialScorePercent?: number;
    firstStartedAt?: string;
    firstCompletedAt?: string;
    attempts: AttemptRecord[];
    engagement: EngagementSummary;
  }> {
    type AttemptEvent = AttemptStartedEvent | AnswerSubmittedEvent | AttemptCompletedEvent | AttemptAbandonedEvent;
    const events = (await allEvents(this.require()))
      .filter(
        (e): e is AttemptEvent =>
          (e.event_type === "attempt_started" || e.event_type === "answer_submitted" || e.event_type === "attempt_completed" || e.event_type === "attempt_abandoned") &&
          e.module_id === moduleId,
      )
      // This is one installation's history. Sequence survives clock changes.
      .sort((a, b) => a.device_seq - b.device_seq);

    const byAttempt = new Map<string, AttemptEvent[]>();
    for (const e of events) {
      const list = byAttempt.get(e.attempt_id);
      if (list) list.push(e);
      else byAttempt.set(e.attempt_id, [e]);
    }

    const attempts: AttemptRecord[] = [];
    let latestContentVersion: number | undefined;
    let firstFullStartedAt: string | undefined;

    for (const [attemptId, attemptEvents] of byAttempt) {
      const started = attemptEvents.find((e): e is AttemptStartedEvent => e.event_type === "attempt_started");
      const completed = attemptEvents.find((e): e is AttemptCompletedEvent => e.event_type === "attempt_completed");
      const abandoned = attemptEvents.find((e) => e.event_type === "attempt_abandoned");
      const seenQuestions = new Set<string>();
      const answers: AnswerRecord[] = attemptEvents
        .filter((e): e is AnswerSubmittedEvent => e.event_type === "answer_submitted")
        .filter((e) => {
          if (seenQuestions.has(e.question_id)) return false;
          seenQuestions.add(e.question_id);
          return true;
        })
        .map((e) => ({
          questionId: e.question_id,
          selectedChoiceId: String(e.payload.choice_id ?? ""),
          isCorrect: Boolean(e.payload.local_is_correct),
          answeredAt: e.occurred_at,
        }));
      // startRemediation writes "practice" (the wire's historical value);
      // startAttempt writes the AttemptKind directly. Both mean "remediation" here.
      const kindRaw = started?.payload.attempt_kind;
      const kind: AttemptKind = kindRaw === "practice" || kindRaw === "remediation" ? "remediation" : "full";
      const startedAt = started?.occurred_at ?? answers[0]?.answeredAt ?? completed?.occurred_at ?? new Date(this.now()).toISOString();
      const localTotal = typeof completed?.payload.local_total === "number" ? completed.payload.local_total : undefined;
      const version = started?.content_version ?? completed?.content_version;
      // Validate a completed full attempt against the package it was played on.
      // An interrupted attempt or a premature completion cannot establish a score.
      let attemptModule: TetherlessModule | undefined;
      if (version !== undefined) {
        try { attemptModule = await this.getModule(moduleId, version); } catch { /* Retain history when its package is unavailable. */ }
        latestContentVersion = Math.max(latestContentVersion ?? version, version);
      }
      const requiredIds = attemptModule?.questions.map((q) => q.id);
      const completeFull = requiredIds
        ? requiredIds.length > 0 && requiredIds.every((id) => seenQuestions.has(id))
        : localTotal !== undefined && localTotal > 0 && seenQuestions.size >= localTotal;
      const isCompleted = Boolean(completed && !abandoned && (kind !== "full" || completeFull));
      const correctCount = answers.filter((a) => a.isCorrect && (!requiredIds || requiredIds.includes(a.questionId))).length;
      const total = requiredIds?.length ?? localTotal;

      attempts.push({
        id: attemptId,
        learnerId,
        moduleId,
        contentVersion: version,
        kind,
        status: abandoned ? "abandoned" : isCompleted ? "completed" : "in_progress",
        startedAt,
        completedAt: isCompleted ? completed?.occurred_at : undefined,
        answers,
        initialCorrectCount: kind === "full" && isCompleted ? correctCount : undefined,
        initialScorePercent: kind === "full" && isCompleted && total ? Math.round((correctCount / total) * 100) : undefined,
        questionIds: kind === "remediation" ? (started?.payload.question_ids as string[] | undefined) : undefined,
      });

      if (kind === "full") firstFullStartedAt ??= startedAt;
    }

    const fullAttempts = attempts.filter((a) => a.kind === "full");
    // A later full start replaces an unfinished one, even if the old UI did
    // not explicitly record attempt_abandoned. Match the server's rule.
    for (const attempt of fullAttempts.slice(0, -1)) {
      if (attempt.status === "in_progress") attempt.status = "abandoned";
    }

    const masteredQuestionIds = new Set<string>();
    const answeredQuestionIds = new Set<string>();
    const chronologicalCorrectness: boolean[] = [];
    for (const attempt of attempts) {
      for (const answer of attempt.answers) {
        answeredQuestionIds.add(answer.questionId);
        if (answer.isCorrect) masteredQuestionIds.add(answer.questionId);
        chronologicalCorrectness.push(answer.isCorrect);
      }
    }

    let currentStreak = 0;
    let bestStreak = 0;
    for (const correct of chronologicalCorrectness) {
      currentStreak = correct ? currentStreak + 1 : 0;
      bestStreak = Math.max(bestStreak, currentStreak);
    }

    const firstCompleted = fullAttempts.find((a) => a.status === "completed");
    const initialMissedQuestionIds = firstCompleted?.answers.filter((a) => !a.isCorrect).map((a) => a.questionId) ?? [];

    const completionStatus: "not_started" | "in_progress" | "completed" = firstCompleted
      ? "completed"
      : attempts.length > 0
        ? "in_progress"
        : "not_started";

    let questionsTotal = 0;
    let questionXp = 0;
    let sectorAwards: { sectorId: string; questionIds: string[]; bonusXp: number }[] = [];
    let missionAward: { badgeId?: string; bonusXp: number } | undefined;
    let currentQuestionIds: Set<string> | undefined;
    try {
      const profile = await this.getLearnerProfile();
      const catalog = await getMeta<ModuleSummary[]>(this.require(), `assignment_catalog:${this.deviceId}:${profile?.learnerId ?? this.currentLearnerId ?? ""}`);
      const assignedVersion = catalog?.find((m) => m.moduleId === moduleId)?.contentVersion;
      const module = await this.getModule(moduleId, assignedVersion ?? latestContentVersion ?? this.contentVersion);
      questionsTotal = module.questions.length;
      currentQuestionIds = new Set(module.questions.map((q) => q.id));
      const awards = gamificationAwards(module);
      questionXp = awards.questionXp;
      sectorAwards = awards.sectorAwards;
      missionAward = awards.missionAward;
    } catch {
      // Not cached and offline: still report what the learner has done
      // locally, just without a denominator or award totals yet.
    }

    // Historic attempts remain intact. Only current questions contribute to
    // current mastery/progress and module awards; retired IDs cannot inflate it.
    if (currentQuestionIds) {
      for (const id of masteredQuestionIds) if (!currentQuestionIds.has(id)) masteredQuestionIds.delete(id);
      for (const id of answeredQuestionIds) if (!currentQuestionIds.has(id)) answeredQuestionIds.delete(id);
    }

    const completedSectorIds = sectorAwards
      .filter((s) => s.questionIds.length > 0 && s.questionIds.every((id) => masteredQuestionIds.has(id)))
      .map((s) => s.sectorId);
    const sectorBonusXp = sectorAwards.filter((s) => completedSectorIds.includes(s.sectorId)).reduce((sum, s) => sum + s.bonusXp, 0);
    const missionComplete = questionsTotal > 0 && masteredQuestionIds.size === questionsTotal;
    const earnedBadgeIds = missionComplete && missionAward?.badgeId ? [missionAward.badgeId] : [];
    const missionBonusXp = missionComplete ? missionAward?.bonusXp ?? 0 : 0;

    return {
      questionsTotal,
      masteredOrAnsweredCount: answeredQuestionIds.size,
      masteredQuestionIds,
      initialMissedQuestionIds,
      currentMasteryPercent: questionsTotal > 0 ? Math.round((masteredQuestionIds.size / questionsTotal) * 100) : 0,
      stillUnmasteredCount: Math.max(0, questionsTotal - masteredQuestionIds.size),
      completionStatus,
      initialScorePercent: firstCompleted?.initialScorePercent,
      firstStartedAt: firstFullStartedAt,
      firstCompletedAt: firstCompleted?.completedAt,
      attempts,
      engagement: {
        xp: masteredQuestionIds.size * questionXp + sectorBonusXp + missionBonusXp,
        currentStreak,
        bestStreak,
        xpAwardedQuestionIds: [...masteredQuestionIds],
        completedSectorIds,
        earnedBadgeIds,
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

  /**
   * Re-open work paused by an authentication failure (N3).
   *
   * blocked_auth is a pause, not a terminal state: nothing claims it, and
   * nothing ever moves it back. Without an explicit call here, a learner's
   * answers stay on the device forever after a 401, even once credentials are
   * valid again.
   *
   * Deliberately NOT called from requestSync(): a sync request while the
   * session is still invalid must not dispatch outbound calls, or a revoked
   * device retries in a storm. The caller that restores credentials calls this.
   */
  async recoverAuth(): Promise<number> {
    if (!this.engine) throw new Error("gateway not initialized — call init() first");
    const count = await this.engine.unblockAuth(this.now());
    await this.emit();
    return count;
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
    // subscribe rather than waiting for the next change. Swallowed here
    // because a subscriber mounted before init() resolves — SyncStatusProvider
    // does, on every page — would otherwise see this as an unhandled
    // rejection; init() pushes a real emit once it is actually ready.
    void this.getSyncSummary().then((s) => {
      if (this.subscribers.has(callback)) callback(s);
    }).catch(() => {});
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // -------------------------------------------------------------- internals

  /**
   * Record one event durably, then advance the sequence.
   *
   * `input` is typed as the full ActivityEventInput union, so module_id /
   * content_version / attempt_id (and question_id, for answer_submitted)
   * are required together at every call site below — the compiler rejects
   * a call that forgets one, instead of silently building an event the
   * server will reject later. The cast at the end is safe because `input`
   * is already checked against that union at the call site; the envelope
   * fields added here are valid on every member.
   */
  private async record(input: ActivityEventInput): Promise<ActivityEvent> {
    const db = this.require();
    if (!this.sessionId) {
      // The server requires a UUID session_id on every event and rejects
      // "no-session". Start one implicitly rather than emit an invalid event.
      await this.startSession({ learnerId: this.currentLearnerId ?? "", deviceId: this.deviceId });
    }

    return withDeviceSeqLock(async () => {
      // N6: the sequence is reserved atomically in the store, not read here
      // and written later, so two tabs cannot observe the same value.
      const seq = await reserveDeviceSeq(db);

      const event = {
        event_id: newId(),
        schema_version: 1,
        device_id: this.deviceId,
        device_seq: seq,
        session_id: this.sessionId!,
        occurred_at: new Date(this.now()).toISOString(),
        monotonic_ms: this.elapsedMonotonic(),
        ...input,
      } as ActivityEvent;

      // Durability: this awaits the transaction commit, not the write queue.
      await recordEvent(db, event, this.now());
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

  /**
   * Record which content version an attempt was started with, durably, and return it.
   * Every later event of the attempt (answers, completion, abandonment) carries this
   * same version, so a module upgraded mid-attempt, or two attempts on different
   * versions, are each scored against the answer key they were played with.
   * Callers outside TypeScript that omit it get the gateway default (see setContentVersion).
   */
  private async pinAttemptVersion(attemptId: string, requested: number | undefined): Promise<number> {
    const version = requested ?? this.contentVersion;
    if (!Number.isInteger(version) || version < 1) {
      throw new Error("contentVersion must be a whole number of 1 or more");
    }
    await setMeta(this.require(), `attempt_version:${attemptId}`, version);
    this.attemptVersions.set(attemptId, version);
    return version;
  }

  /**
   * The version an attempt was started with: from memory, else from the store (the app
   * was restarted mid-attempt), else the gateway default for attempts that began before
   * versions were recorded.
   */
  private async versionOfAttempt(attemptId: string): Promise<number> {
    const known = this.attemptVersions.get(attemptId);
    if (known !== undefined) return known;
    const stored = await getMeta<number>(this.require(), `attempt_version:${attemptId}`);
    if (stored !== undefined && stored !== null) {
      this.attemptVersions.set(attemptId, stored);
      return stored;
    }
    return this.contentVersion;
  }

  /** Default content version, used only for an attempt with no recorded version. */
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
   *
   * Takes moduleId from the caller (API Spec v1.30 §8.1) rather than
   * inferring it from `this.lastModuleId`, as this originally did.
   *
   * Bug fixed earlier here: the old version defaulted to
   * `this.lastModuleId ?? ""` when no module had been touched yet. "" is
   * falsy, so the old flat-optional record() silently omitted
   * module_id/content_version/attempt_id rather than send an empty one —
   * but the contract requires those three together on every
   * attempt_abandoned event, so the server would have rejected it as
   * INVALID_EVENT ("module_id is required."), and per the DDIL rule that a
   * rejection is final, that event would have been lost for good. The same
   * guard stays here: there is nothing meaningful to abandon without a
   * module, so recording nothing is the correct outcome.
   */
  async abandonAttempt(input: { attemptId: string; moduleId: string; reason: "restart" | "quit" | "replaced" }): Promise<void> {
    if (!input.moduleId) return;

    await this.record({
      event_type: "attempt_abandoned",
      module_id: input.moduleId,
      content_version: await this.versionOfAttempt(input.attemptId),
      attempt_id: input.attemptId,
      payload: { reason: input.reason },
    });
    await this.emit();
  }

  // ------------------------------------------------------- device setup (API Spec v1.30 §8.1)

  /**
   * One-time, online, per phone. The device token is stored only here — in
   * the protected IDB store — never in localStorage (§6.1).
   */
  async setupDevice(input: { setupCode: string; username: string }): Promise<LearnerProfile> {
    const db = this.require();
    if (!this.opts.api) throw new Error("setupDevice requires DdilGatewayOptions.api");
    const body = (await this.opts.api.post(
      "/v1/setup",
      { setup_code: input.setupCode, username: input.username, device_id: this.deviceId },
      { auth: false },
    )) as { device_token: string; learner: { learner_id: string; learner_code: string; username: string; cohort_name: string } };

    this.deviceToken = body.device_token;
    await setMeta(db, "device_token", this.deviceToken);
    this.opts.onTokenChange?.(this.deviceToken);
    this.currentLearnerId = body.learner.learner_id;

    const profile: LearnerProfile = {
      learnerId: body.learner.learner_id,
      deviceId: this.deviceId,
      username: body.learner.username,
      learnerCode: body.learner.learner_code,
      cohortName: body.learner.cohort_name,
    };
    await setMeta(db, "learner_profile", profile);
    return profile;
  }

  async getLearnerProfile(): Promise<LearnerProfile | null> {
    return (await getMeta<LearnerProfile>(this.require(), "learner_profile")) ?? null;
  }

  // --------------------------------------------------------------- modules (§6.4, §8.1)

  /** Refresh while reachable; retain a student/device-scoped catalog for offline restart. */
  async listAssignedModules(): Promise<ModuleSummary[]> {
    const db = this.require();
    if (!this.opts.api) throw new Error("listAssignedModules requires DdilGatewayOptions.api");
    const profile = await this.getLearnerProfile();
    const key = `assignment_catalog:${this.deviceId}:${profile?.learnerId ?? this.currentLearnerId ?? ""}`;
    const cached = await getMeta<ModuleSummary[]>(db, key);
    const online = this.opts.isOnline?.() ?? (typeof navigator === "undefined" || navigator.onLine !== false);
    let catalog: ModuleSummary[];
    if (!online) {
      if (!cached) throw new Error("No assigned-module catalog is available offline yet.");
      catalog = cached;
    } else {
      let body: { modules: { module_id: string; content_version: number; title: { en: string; es?: string }; level: string; activity_type: string }[] } | undefined;
      let received = false;
      try {
        body = await this.opts.api.get("/v1/me/modules") as typeof body;
        received = true;
      } catch (error) {
        const status = (error as { status?: number } | null)?.status;
        // Authentication/permission/client errors must remain visible, not be
        // disguised as a successful cached response. Network/server outages may
        // use the last known assignments without deleting any local work.
        if ((status !== undefined && status !== 0 && status < 500 && status !== 429) || !cached) throw error;
      }
      if (received) {
        if (!body || !Array.isArray(body.modules) || body.modules.some((m) => !m || typeof m.module_id !== "string" || !Number.isInteger(m.content_version) || m.content_version < 1 || typeof m.title?.en !== "string" || typeof m.level !== "string" || typeof m.activity_type !== "string")) {
          throw new Error("The service returned an invalid assigned-module catalog.");
        }
        catalog = body.modules.map((m) => ({ moduleId: m.module_id, contentVersion: m.content_version, title: m.title, level: m.level, activityType: m.activity_type, downloadState: "not_downloaded" }));
        await setMeta(db, key, catalog);
      } else {
        if (!cached) throw new Error("The assigned-module catalog could not be loaded.");
        catalog = cached;
      }
    }
    // Recompute even for a cached catalog: opening a module may have downloaded
    // its package since this assignment list was saved.
    return Promise.all(catalog.map(async (m): Promise<ModuleSummary> => ({
      ...m,
      downloadState: (await getMeta(db, this.moduleKey(m.moduleId, m.contentVersion))) ? "available_offline" : "not_downloaded",
    })));
  }

  /** Downloads one module version, verifies it parses, and caches it for offline use. */
  async prepareModuleForOffline(moduleId: string, contentVersion: number): Promise<ModuleSummary> {
    const module = await this.fetchAndCacheModule(moduleId, contentVersion);
    return {
      moduleId,
      contentVersion,
      title: module.title,
      level: module.level,
      activityType: module.activity_type ?? "",
      downloadState: "available_offline",
    };
  }

  /** From the local cache; fetches and caches it first if not already downloaded. */
  async getModule(moduleId: string, contentVersion: number): Promise<TetherlessModule> {
    const cached = await getMeta<TetherlessModule>(this.require(), this.moduleKey(moduleId, contentVersion));
    if (cached) return cached;
    return this.fetchAndCacheModule(moduleId, contentVersion);
  }

  private async fetchAndCacheModule(moduleId: string, contentVersion: number): Promise<TetherlessModule> {
    const db = this.require();
    if (!this.opts.api) throw new Error("getModule requires DdilGatewayOptions.api");
    const module = (await this.opts.api.get(`/v1/content/modules/${encodeURIComponent(moduleId)}/versions/${contentVersion}`)) as TetherlessModule;
    // Module packages live in a removable store, separate from learner records (§8.3) —
    // same meta table, distinctly namespaced keys, so eviction can tell them apart later.
    await setMeta(db, this.moduleKey(moduleId, contentVersion), module);
    return module;
  }

  private moduleKey(moduleId: string, contentVersion: number): string {
    return `module:${moduleId}:${contentVersion}`;
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
