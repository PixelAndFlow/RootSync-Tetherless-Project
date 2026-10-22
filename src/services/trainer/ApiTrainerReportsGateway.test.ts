import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api/ApiClient";
import { ApiTrainerReportsGateway, mapReportLearner } from "./ApiTrainerReportsGateway";

const cohortId = "11111111-1111-4111-8111-111111111111";
const row = {
  learner: { learner_id: "22222222-2222-4222-8222-222222222222", learner_code: "TEST-001", first_name: "Test", last_name: "Learner", username: null, cohort_id: cohortId },
  modules: [{ module_id: "sample-module", module_name: "Synthetic module", content_version_latest: 1, completion: "not_started", status_label: "not_started", initial: null, best: null, latest: null, mastery: { pct: 0 }, questions_answered: 0, questions_total: 15 }],
  time: { active_ms: 1500 },
  sync: { accepted_events: 0, rejected_events: 0, last_received_at: null, may_have_unsynced_work: true },
};

describe("trial API Trainer reporting preparation", () => {
  it("maps names and units without inventing scores, XP or device sync status", () => {
    const mapped = mapReportLearner(row);
    expect(mapped).toMatchObject({ displayName: "Test Learner", cohortId, username: null, activeEngagementSeconds: 1.5, mayHaveUnsyncedWork: true, lastReceivedAt: null });
    expect(mapped.modules[0]).toMatchObject({ initialScorePercent: null, bestScorePercent: null, latestScorePercent: null, currentMasteryPercent: 0 });
    expect(mapped).not.toHaveProperty("xp");
    expect(mapped).not.toHaveProperty("syncStatus");
  });
  it("preserves a real zero score instead of treating it as missing", () => {
    const value = structuredClone(row) as unknown as Record<string, unknown>;
    value.modules = [{ ...row.modules[0], initial: { pct: 0 }, best: { pct: 80 }, latest: { pct: 60 }, status_label: "passing" }];
    expect(mapReportLearner(value).modules[0]).toMatchObject({ initialScorePercent: 0, bestScorePercent: 80, latestScorePercent: 60, performanceStatus: "passing" });
  });
  it("rejects malformed responses and unknown status codes", () => {
    expect(() => mapReportLearner({})).toThrow();
    expect(() => mapReportLearner({ ...row, modules: [{ ...row.modules[0], status_label: "new_status" }] })).toThrow();
    expect(() => mapReportLearner({ ...row, modules: [{ ...row.modules[0], mastery: { pct: 101 } }] })).toThrow();
  });
  it("requests the specified cohort/module and handles an empty cohort", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ learners: [] })));
    const gateway = new ApiTrainerReportsGateway(new ApiClient("http://localhost:8080", () => "test", fetcher));
    expect(await gateway.listLearners({ cohortId, moduleId: "sample-module" })).toEqual([]);
    expect(fetcher.mock.calls[0][0]).toBe(`http://localhost:8080/v1/staff/cohorts/${cohortId}/report?module_id=sample-module`);
    await expect(gateway.listLearners({ cohortId: "cohort-prefixed" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("maps cohort summary nullable averages and uses the summary route", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cohort_id: cohortId, module_id: "sample-module", module_name: "Synthetic module", learner_count: 0, completed_count: 0, average_initial_score_percent: null, average_best_score_percent: null, average_mastery_percent: null })));
    const gateway = new ApiTrainerReportsGateway(new ApiClient("http://localhost:8080", () => "test", fetcher));
    expect(await gateway.getModuleCohortSummary({ cohortId, moduleId: "sample-module" })).toMatchObject({ learnerCount: 0, averageInitialScorePercent: null, averageMasteryPercent: null });
    expect(fetcher.mock.calls[0][0]).toContain(`/cohorts/${cohortId}/modules/sample-module/summary`);
  });
  it("maps a learner detail response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(row)));
    const gateway = new ApiTrainerReportsGateway(new ApiClient("http://localhost:8080", () => "test", fetcher));
    expect(await gateway.getLearnerReport({ learnerId: row.learner.learner_id, moduleId: "sample-module" })).toEqual(mapReportLearner(row));
  });
});
