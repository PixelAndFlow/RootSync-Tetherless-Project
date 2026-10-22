/**
 * Scoring engine. Every number is derived from raw accepted events and the
 * published answer keys; nothing the phone calculated is trusted.
 *
 * Definitions (Project Plan D11–D15; thresholds are configurable, see DEFAULT_THRESHOLDS below):
 *  - Full attempt: the whole module. Completed when an attempt_completed event
 *    arrives and every question of that version has an answer.
 *  - Initial score: the first completed full attempt. Never changes.
 *  - Best score: the highest completed full attempt. Latest: the most recent one.
 *    Both are reported; which one RCO shows is a display choice.
 *  - First-try accuracy: of the questions answered at least once, the share
 *    whose very first answer (any attempt kind except review) was correct.
 *    This covers learners who only play game waves.
 *  - Mastery: share of the module's current questions answered correctly at
 *    least once, including practice on missed questions.
 *  - Abandoned attempt: a full attempt with an attempt_abandoned event, or one
 *    left unfinished when a later full attempt started. Its answers are kept and
 *    shown to trainers (stops "restart after seeing the answers").
 *  - Within one attempt only the first answer to a question counts.
 *  - Review attempts change nothing.
 *  - Pass: best score ≥ 70%. Struggling: initial < 60%, or (no completed full
 *    attempt yet) first-try accuracy < 60% after answering at least half the
 *    questions, or any weak topic (< 60% with at least 2 answers).
 */

import type { StoredEvent, AttemptKind } from "../../contract/src/index.ts";
import type { ContentLibrary } from "./library.ts";
import { orderEvents } from "./order.ts";

export interface Thresholds {
  pass_pct: number;
  struggling_pct: number;
  weak_topic_pct: number;
  weak_topic_min_answers: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  pass_pct: 70,
  struggling_pct: 60,
  weak_topic_pct: 60,
  weak_topic_min_answers: 2,
};

export interface Score {
  correct: number;
  total: number;
  /** Percentage, rounded to one decimal place. */
  pct: number;
}

export interface AnswerRecord {
  question_id: string;
  choice_id: string | null;
  correct: boolean;
  event_id: string;
}

export interface AttemptSummary {
  attempt_id: string;
  kind: AttemptKind;
  content_version: number;
  mission_id?: string;
  status: "completed" | "abandoned" | "in_progress";
  started_at: string;
  ended_at?: string;
  answers: AnswerRecord[];
  /** Full attempts only, once completed. */
  score?: Score;
  /**
   * The phone's own score from attempt_completed (local_correct/local_total).
   * Shown next to the server's score for comparison; never used for scoring.
   */
  device_score?: { correct: number; total: number };
  /** Set when an attempt had answers but no attempt_started event. */
  missing_start?: true;
}

export interface TopicResult {
  topic: string;
  answers: number;
  correct: number;
  pct: number;
  weak: boolean;
}

export interface ModuleResult {
  module_id: string;
  content_version_latest: number;
  questions_total: number;
  questions_answered: number;
  completion: "not_started" | "in_progress" | "completed";
  completed_at: string | null;
  initial: Score | null;
  best: Score | null;
  latest: Score | null;
  first_try: Score | null;
  mastery: Score;
  abandoned_before_first_completion: number;
  abandoned_total: number;
  passed: boolean | null;
  struggling: boolean;
  struggling_reasons: string[];
  topics: TopicResult[];
  bosses_completed: string[];
  attempts: AttemptSummary[];
}

export const score = (correct: number, total: number): Score => ({
  correct,
  total,
  pct: total === 0 ? 0 : Math.round((correct / total) * 1000) / 10,
});

const ATTEMPT_EVENTS = new Set(["attempt_started", "answer_submitted", "attempt_completed", "attempt_abandoned"]);

export function scoreModule(
  moduleId: string,
  events: readonly StoredEvent[],
  library: ContentLibrary,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): ModuleResult {
  const latestModule = library.latest(moduleId);
  if (!latestModule) throw new Error(`Unknown module ${moduleId}`);
  const currentQuestions = latestModule.questions.map((q) => q.question_id);
  const topicOf = new Map(latestModule.questions.map((q) => [q.question_id, q.topic ?? "untagged"]));

  const ordered = orderEvents(events.filter((e) => ATTEMPT_EVENTS.has(e.event_type) && "module_id" in e && e.module_id === moduleId));

  // ---- Build attempts in the order they started.
  const attempts = new Map<string, AttemptSummary>();
  const completedSeen = new Set<string>();
  for (const e of ordered) {
    if (!("attempt_id" in e)) continue;
    let a = attempts.get(e.attempt_id);
    if (!a) {
      a = { attempt_id: e.attempt_id, kind: "practice", content_version: e.content_version, status: "in_progress", started_at: e.occurred_at, answers: [] };
      if (e.event_type !== "attempt_started") a.missing_start = true;
      attempts.set(e.attempt_id, a);
    }
    switch (e.event_type) {
      case "attempt_started":
        a.kind = e.payload.attempt_kind;
        if (e.payload.mission_id) a.mission_id = e.payload.mission_id;
        a.content_version = e.content_version;
        a.started_at = e.occurred_at;
        delete a.missing_start;
        break;
      case "answer_submitted": {
        if (a.answers.some((x) => x.question_id === e.question_id)) break; // first answer per question counts
        const q = library.authoritativeQuestion(moduleId, e.question_id);
        const correct = !!q && e.payload.choice_id !== null && e.payload.choice_id === q.correct_choice_id;
        a.answers.push({ question_id: e.question_id, choice_id: e.payload.choice_id, correct, event_id: e.event_id });
        break;
      }
      case "attempt_completed": {
        completedSeen.add(a.attempt_id);
        a.ended_at = e.occurred_at;
        const p = e.payload as { local_correct?: number; local_total?: number };
        if (typeof p.local_correct === "number" && typeof p.local_total === "number") a.device_score = { correct: p.local_correct, total: p.local_total };
        break;
      }
      case "attempt_abandoned":
        if (a.status !== "completed") {
          a.status = "abandoned";
          a.ended_at = e.occurred_at;
        }
        break;
    }
  }

  // ---- Resolve statuses and full-attempt scores.
  const list = [...attempts.values()];
  for (const a of list) {
    if (a.status === "abandoned" || !completedSeen.has(a.attempt_id)) continue;
    if (a.kind === "full") {
      const required = library.get(moduleId, a.content_version)?.questions.map((q) => q.question_id) ?? [];
      const answered = new Set(a.answers.map((x) => x.question_id));
      if (required.length > 0 && required.every((id) => answered.has(id))) {
        a.status = "completed";
        a.score = score(a.answers.filter((x) => required.includes(x.question_id) && x.correct).length, required.length);
      }
    } else {
      a.status = "completed";
    }
  }
  // An unfinished full attempt followed by a new full attempt was abandoned (a restart).
  const fulls = list.filter((a) => a.kind === "full");
  fulls.forEach((a, i) => {
    if (a.status === "in_progress" && i < fulls.length - 1) {
      a.status = "abandoned";
      a.ended_at = fulls[i + 1]!.started_at;
    }
  });

  // ---- Full-attempt scores in completion order.
  const completedFulls = fulls.filter((a) => a.status === "completed");
  const initialAttempt = completedFulls[0];
  const initial = initialAttempt?.score ?? null;
  const latest = completedFulls.at(-1)?.score ?? null;
  const best = completedFulls.reduce<Score | null>((b, a) => (a.score && (!b || a.score.pct > b.pct) ? a.score : b), null);
  const firstCompletionIndex = initialAttempt ? fulls.indexOf(initialAttempt) : fulls.length;
  const abandonedBefore = fulls.slice(0, firstCompletionIndex).filter((a) => a.status === "abandoned").length;
  const abandonedTotal = fulls.filter((a) => a.status === "abandoned").length;

  // ---- First-try, mastery and topics use every non-review answer to a current question.
  const counted = list.filter((a) => a.kind !== "review");
  const firstAnswer = new Map<string, boolean>();
  const everCorrect = new Set<string>();
  const topicTally = new Map<string, { answers: number; correct: number }>();
  for (const a of counted) {
    for (const ans of a.answers) {
      if (!topicOf.has(ans.question_id)) continue; // Boss Mission or retired question
      if (!firstAnswer.has(ans.question_id)) firstAnswer.set(ans.question_id, ans.correct);
      if (ans.correct) everCorrect.add(ans.question_id);
      const t = topicOf.get(ans.question_id)!;
      const tally = topicTally.get(t) ?? { answers: 0, correct: 0 };
      tally.answers++;
      if (ans.correct) tally.correct++;
      topicTally.set(t, tally);
    }
  }
  const answeredCount = firstAnswer.size;
  const firstTry = answeredCount ? score([...firstAnswer.values()].filter(Boolean).length, answeredCount) : null;
  const mastery = score(currentQuestions.filter((id) => everCorrect.has(id)).length, currentQuestions.length);
  const topics: TopicResult[] = (latestModule.topics?.map((t) => t.topic_id) ?? [...new Set(topicOf.values())]).map((topic) => {
    const t = topicTally.get(topic) ?? { answers: 0, correct: 0 };
    const pct = score(t.correct, t.answers).pct;
    return { topic, answers: t.answers, correct: t.correct, pct, weak: t.answers >= thresholds.weak_topic_min_answers && pct < thresholds.weak_topic_pct };
  });

  // ---- Flags.
  const reasons: string[] = [];
  if (initial && initial.pct < thresholds.struggling_pct) reasons.push("initial_below_threshold");
  if (!initial && firstTry && answeredCount >= currentQuestions.length / 2 && firstTry.pct < thresholds.struggling_pct) reasons.push("first_try_below_threshold");
  for (const t of topics) if (t.weak) reasons.push(`weak_topic:${t.topic}`);

  const bosses = [...new Set(list.filter((a) => a.kind === "boss" && a.status === "completed" && a.mission_id).map((a) => a.mission_id!))];

  return {
    module_id: moduleId,
    content_version_latest: latestModule.content_version,
    questions_total: currentQuestions.length,
    questions_answered: answeredCount,
    completion: initial ? "completed" : list.length ? "in_progress" : "not_started",
    completed_at: initialAttempt?.ended_at ?? null,
    initial,
    best,
    latest,
    first_try: firstTry,
    mastery,
    abandoned_before_first_completion: abandonedBefore,
    abandoned_total: abandonedTotal,
    passed: best ? best.pct >= thresholds.pass_pct : null,
    struggling: reasons.length > 0,
    struggling_reasons: reasons,
    topics,
    bosses_completed: bosses,
    attempts: list,
  };
}

export type StatusLabel = "not_started" | "passing" | "struggling" | "not_yet_passing";

/**
 * One label per learner and module for the staff dashboard (spec v1.10 §8.3).
 * Passing wins over struggling: a learner whose best score reached the pass
 * threshold is passing even if their first attempt was low. Learners never see
 * these labels, only their own percentages.
 */
export function statusLabel(m: Pick<ModuleResult, "completion" | "passed" | "struggling">): StatusLabel {
  if (m.completion === "not_started") return "not_started";
  if (m.passed) return "passing";
  if (m.struggling) return "struggling";
  return "not_yet_passing";
}
