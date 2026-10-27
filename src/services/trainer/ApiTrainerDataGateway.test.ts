import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api/ApiClient";
import cohortReport from "../../../packages/contract/fixtures/cohort-report.json";
import learnerReport from "../../../packages/contract/fixtures/learner-report.json";
import { ApiTrainerDataGateway, parseLearnerRow } from "./ApiTrainerDataGateway";
import { toLearnerSummaries, toModuleDetail } from "./trainerMappers";

const cohortId = "11111111-1111-4111-8111-111111111111";
const learnerId = "22222222-2222-4222-8222-222222222222";
const score = (correct: number, total: number) => ({ correct, total, pct: total ? Math.round((correct / total) * 1000) / 10 : 0 });
const module = (over: Record<string, unknown> = {}) => ({
  module_id: "sample-module", module_name: "Synthetic module", content_version_latest: 2, completion: "completed", completed_at: "2026-10-20T10:20:00Z",
  status_label: "not_yet_passing", initial: score(6, 10), best: score(6, 10), latest: score(6, 10), mastery: score(9, 10),
  questions_answered: 10, questions_total: 10, abandoned_total: 1, struggling_reasons: ["weak_topic:backups"],
  topics: [{ topic: "backups", answers: 4, correct: 1 }, { topic: "phishing", answers: 6, correct: 5 }],
  attempts: [
    { attempt_id: "a1", kind: "full", content_version: 2, status: "completed", started_at: "2026-10-20T10:00:00Z", ended_at: "2026-10-20T10:20:00Z", score: score(6, 10), device_score: { correct: 6, total: 10 }, answers: [{ question_id: "q1", choice_id: "a", correct: true }, { question_id: "q2", choice_id: null, correct: false }] },
    { attempt_id: "a2", kind: "practice", content_version: 2, status: "completed", started_at: "2026-10-20T11:00:00Z", ended_at: "2026-10-20T11:05:00Z", answers: [{ question_id: "q2", choice_id: "b", correct: true }, { question_id: "q3", choice_id: "c", correct: false }, { question_id: "q4", choice_id: "a", correct: true }] },
    { attempt_id: "a3", kind: "full", content_version: 2, status: "abandoned", started_at: "2026-10-19T09:00:00Z", answers: [] },
  ],
  ...over,
});
const row = (modules: unknown[] = [module()], over: Record<string, unknown> = {}) => ({
  learner: { learner_id: learnerId, learner_code: "TEST-001", first_name: "Test", last_name: "Learner", username: null, cohort_id: cohortId, archived: false },
  modules,
  time: { active_ms: 90_500, sessions: [{ session_id: "s1" }, { session_id: "s2" }, { session_id: "s3" }] },
  sync: { accepted_events: 12, rejected_events: 2, last_received_at: "2026-10-20T12:00:00Z", may_have_unsynced_work: true },
  ...over,
});

describe("ApiTrainerDataGateway mapping (API Spec v1.30 sections 9.2 and 9.3)", () => {
  it("maps one learner on one module to the spec's summary fields", () => {
    const [summary] = toLearnerSummaries(parseLearnerRow(row()));
    expect(summary).toMatchObject({
      learnerId, username: null, learnerCode: "TEST-001", firstName: "Test", lastName: "Learner",
      moduleId: "sample-module", moduleTitle: "Synthetic module", completionStatus: "completed",
      initialScorePercent: 60, bestScorePercent: 60, currentMasteryPercent: 90,
      questionsAnswered: 10, questionsTotal: 10, initialMissedCount: 4, stillUnmasteredCount: 1,
      statusLabel: "not_yet_passing", strugglingReasons: ["weak_topic:backups"], attemptsAbandoned: 1,
      activeEngagementSeconds: 90.5, sessionCount: 3, lastSyncedAt: "2026-10-20T12:00:00Z", mayHaveUnsyncedWork: true,
      acceptedEventCount: 12, rejectedEventCount: 2, lastActivityAt: "2026-10-20T11:05:00Z", xp: 0, bestStreak: 0,
    });
    expect(summary).not.toHaveProperty("displayName");
    expect(summary).not.toHaveProperty("syncStatus");
    expect(summary.noModuleResults).toBeUndefined();
  });

  it("gives one row per module, and a learner with no modules one placeholder row", () => {
    expect(toLearnerSummaries(parseLearnerRow(row([module(), module({ module_id: "second-module" })])))).toHaveLength(2);
    const [placeholder] = toLearnerSummaries(parseLearnerRow(row([])));
    expect(placeholder).toMatchObject({ learnerId, noModuleResults: true, moduleId: "", moduleTitle: "", statusLabel: "not_started", acceptedEventCount: 12, rejectedEventCount: 2, activeEngagementSeconds: 90.5 });
  });

  it("leaves scores undefined when the learner has none, and keeps a real zero", () => {
    const [none] = toLearnerSummaries(parseLearnerRow(row([module({ initial: null, best: null, completion: "not_started", status_label: "not_started", attempts: [] })])));
    expect(none.initialScorePercent).toBeUndefined();
    expect(none.bestScorePercent).toBeUndefined();
    expect(none.initialMissedCount).toBe(0);
    expect(none.lastActivityAt).toBeUndefined();
    const [zero] = toLearnerSummaries(parseLearnerRow(row([module({ initial: score(0, 10), best: score(0, 10) })])));
    expect(zero).toMatchObject({ initialScorePercent: 0, bestScorePercent: 0, initialMissedCount: 10 });
  });

  it("builds the module detail: attempts, practice corrections, returns and topics", () => {
    const detail = toModuleDetail(parseLearnerRow(row()), "sample-module")!;
    expect(detail).toMatchObject({
      contentVersion: 2, firstStartedAt: "2026-10-19T09:00:00Z", completedAt: "2026-10-20T10:20:00Z",
      fullAttemptCount: 1, remediationRoundCount: 1, remediationAttempted: 3, remediationCorrected: 2, returnCount: 2,
      sectorPerformance: [], topicPerformance: [{ topic: "backups", masteredCount: 1, totalCount: 4 }, { topic: "phishing", masteredCount: 5, totalCount: 6 }],
    });
    expect(detail.attempts).toHaveLength(3);
    expect(detail.attempts[0]).toMatchObject({ attemptId: "a1", kind: "full", status: "completed", scorePercent: 60, deviceScore: { correct: 6, total: 10 } });
    expect(detail.attempts[0].answers[1]).toEqual({ questionId: "q2", choiceId: null, correct: false });
    expect(toModuleDetail(parseLearnerRow(row()), "not-a-module")).toBeUndefined();
  });

  it("maps the server's recorded cohort and learner reports without error", () => {
    const rows = cohortReport.learners.flatMap((r) => toLearnerSummaries(parseLearnerRow(r)));
    expect(rows.length).toBeGreaterThan(0);
    for (const summary of rows) expect(Object.keys(summary).filter((key) => key.includes("_"))).toEqual([]);
    expect(toLearnerSummaries(parseLearnerRow(learnerReport))[0]).toMatchObject({ learnerId: learnerReport.learner.learner_id, mayHaveUnsyncedWork: true });
  });

  it("rejects malformed responses and unknown status codes", () => {
    expect(() => parseLearnerRow({})).toThrow();
    expect(() => parseLearnerRow(row([module({ status_label: "new_status" })]))).toThrow();
    expect(() => parseLearnerRow(row([module({ mastery: { correct: 1, total: 1, pct: 101 } })]))).toThrow();
    expect(() => parseLearnerRow(row([module({ attempts: [{ attempt_id: "x", kind: "other" }] })]))).toThrow();
    expect(() => parseLearnerRow(row([], { sync: { accepted_events: 0, rejected_events: 0, last_received_at: null } }))).toThrow();
  });
});

describe("ApiTrainerDataGateway requests", () => {
  const gatewayWith = (body: unknown) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    return { fetcher, gateway: new ApiTrainerDataGateway(new ApiClient("http://localhost:8080", () => "test", fetcher)) };
  };

  it("requests the cohort report (with the module when given) and flattens it to rows", async () => {
    const { gateway, fetcher } = gatewayWith({ learners: [row(), row([])] });
    const rows = await gateway.listLearners({ cohortId, moduleId: "sample-module" });
    expect(rows).toHaveLength(2);
    expect(fetcher.mock.calls[0][0]).toBe(`http://localhost:8080/v1/staff/cohorts/${cohortId}/report?module_id=sample-module`);
  });

  it("handles an empty cohort and refuses ids that are not plain UUIDs or module slugs", async () => {
    const { gateway, fetcher } = gatewayWith({ learners: [] });
    expect(await gateway.listLearners({ cohortId })).toEqual([]);
    await expect(gateway.listLearners({ cohortId: "cohort-prefixed" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(gateway.getLearnerModuleDetail(learnerId, "Not A Module")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns a module detail from the learner report, and NOT_FOUND when the server reports no such module", async () => {
    const { gateway, fetcher } = gatewayWith(row());
    expect(await gateway.getLearnerModuleDetail(learnerId, "sample-module")).toMatchObject({ moduleId: "sample-module", fullAttemptCount: 1 });
    expect(fetcher.mock.calls[0][0]).toBe(`http://localhost:8080/v1/staff/learners/${learnerId}/report?module_id=sample-module`);
    const { gateway: other } = gatewayWith(row([]));
    await expect(other.getLearnerModuleDetail(learnerId, "sample-module")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("maps the cohort summary, with nullable averages and the spec's counts", async () => {
    const { gateway, fetcher } = gatewayWith({ cohort_id: cohortId, module_id: "sample-module", module_name: "Synthetic module", generated_at: "x", learner_count: 3, started_count: 2, completed_count: 1, average_initial_score_percent: null, average_best_score_percent: 80, average_mastery_percent: 55.5, passing_count: 1, struggling_count: 1, not_yet_passing_count: 0 });
    expect(await gateway.getModuleCohortSummary({ cohortId, moduleId: "sample-module" })).toEqual({
      cohortId, moduleId: "sample-module", moduleTitle: "Synthetic module", learnerCount: 3, startedCount: 2, completedCount: 1,
      averageInitialScorePercent: null, averageBestScorePercent: 80, averageMasteryPercent: 55.5, passingCount: 1, strugglingCount: 1, notYetPassingCount: 0,
    });
    expect(fetcher.mock.calls[0][0]).toContain(`/cohorts/${cohortId}/modules/sample-module/summary`);
  });
});
