import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { SyncStatusProvider } from "../../app/providers/SyncStatusProvider";
import { MockOfflineLearningGateway } from "../../services/offline/MockOfflineLearningGateway";
import { MockTrainerDataGateway } from "../../services/trainer/MockTrainerDataGateway";
import { moduleLibrary } from "../../content/modules";
import type { LearnerModuleRecord } from "../../types/learning";
import { MissionResultsScreen } from "./MissionResultsScreen";
import { MissionReviewScreen } from "../review/MissionReviewScreen";
import { RemediationScreen } from "../remediation/RemediationScreen";

const base = moduleLibrary[0]!;
const original = { ...base, content_version: 1, questions: base.questions.slice(0, 2).map((q, i) => ({ ...q, id: `old-${i}`, prompt: { en: `Original question ${i}` } })) };
const current = { ...base, content_version: 2, questions: [{ ...original.questions[0]!, id: "new-question", prompt: { en: "New version question" } }] };

function fixture() {
  const record: LearnerModuleRecord = {
    learnerId: "student-1", moduleId: base.module_id, questionsTotal: 1, questionsAnswered: 0,
    initialScorePercent: 0, currentMasteryPercent: 0, stillUnmasteredCount: 1, completionStatus: "completed",
    firstCompletedAt: "2026-10-28T12:00:00Z", initialMissedQuestionIds: original.questions.map(q => q.id), masteredQuestionIds: [],
    attempts: [{ id: "original-attempt", learnerId: "student-1", moduleId: base.module_id, contentVersion: 1, kind: "full", status: "completed", startedAt: "2026-10-28T11:00:00Z", initialCorrectCount: 0,
      answers: original.questions.map(q => ({ questionId: q.id, selectedChoiceId: q.choices.find(c => c.id !== q.correct_choice)!.id, isCorrect: false, answeredAt: "2026-10-28T11:01:00Z" })) }],
    engagement: { xp: 0, currentStreak: 0, bestStreak: 0, xpAwardedQuestionIds: [], completedSectorIds: [], earnedBadgeIds: [] },
  };
  const gateway = Object.assign(new MockOfflineLearningGateway(), {
    getLearnerModuleRecord: vi.fn(async () => record),
    listAssignedModules: vi.fn(async () => [{ moduleId: base.module_id, contentVersion: 2, title: current.title, level: current.level, activityType: "multiple_choice", downloadState: "available_offline" as const }]),
    getModule: vi.fn(async (_id: string, version: number) => version === 1 ? original : current),
  });
  return { record, gateway };
}

function ChangeFilter() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(`/learner/missions/${base.module_id}/review?scope=correct`)}>Only correct</button>;
}

function open(gateway: MockOfflineLearningGateway, route: string) {
  localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({ learnerId: "student-1", deviceId: "device-1", displayName: "Test", username: "test", spanishAssist: false, highContrast: false, reducedMotion: false }));
  return render(<GatewayProvider gateways={{ offlineLearning: gateway, trainerData: new MockTrainerDataGateway() }}><LearnerProfileProvider><SyncStatusProvider><MemoryRouter initialEntries={[`/learner/missions/${base.module_id}/${route}`]}><ChangeFilter/><Routes>
    <Route path="/learner/missions/:moduleId/results" element={<MissionResultsScreen/>}/>
    <Route path="/learner/missions/:moduleId/review" element={<MissionReviewScreen/>}/>
    <Route path="/learner/missions/:moduleId/practice" element={<RemediationScreen/>}/>
  </Routes></MemoryRouter></SyncStatusProvider></LearnerProfileProvider></GatewayProvider>);
}

afterEach(() => localStorage.clear());

describe("historical module versions", () => {
  it("preserves 0/2 initial results after reassignment to one new question, without offering retired practice", async () => {
    const { gateway } = fixture();
    open(gateway, "results");
    expect(await screen.findByText("0/2")).toBeVisible();
    expect(screen.queryByText("-1/1")).not.toBeInTheDocument();
    const practice = screen.getByRole("link", { name: "Practice missed questions" });
    expect(practice).toHaveClass("cursor-not-allowed");
    await userEvent.click(practice);
    expect(screen.getByRole("heading", { name: "Recruit Mission Debrief" })).toBeVisible();
    expect(gateway.getModule).toHaveBeenCalledWith(base.module_id, 1);
    expect(gateway.getModule).toHaveBeenCalledWith(base.module_id, 2);
  });

  it.each(["correct", "missed", "all"])("uses original questions and answer keys for the %s filter", async (scope) => {
    const { gateway, record } = fixture();
    record.attempts[0]!.answers[0]!.isCorrect = true;
    record.attempts[0]!.answers[0]!.selectedChoiceId = original.questions[0]!.correct_choice;
    open(gateway, `review?scope=${scope}`);
    const firstIndex = scope === "missed" ? 1 : 0;
    expect(await screen.findByRole("heading", { name: `Original question ${firstIndex}` })).toBeVisible();
    const originalCorrect = original.questions[firstIndex]!.choices.find(choice => choice.id === original.questions[firstIndex]!.correct_choice)!;
    expect(screen.getByRole("button", { name: `${originalCorrect.en}. Correct answer.` })).toBeVisible();
    expect(screen.queryByText("New version question")).not.toBeInTheDocument();
    expect(gateway.getModule).toHaveBeenCalledWith(base.module_id, 1);
    expect(gateway.listAssignedModules).not.toHaveBeenCalled();
    if (scope === "all") {
      await userEvent.click(screen.getByRole("button", { name: /Next answer/ }));
      expect(screen.getByRole("heading", { name: "Original question 1" })).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Only correct" }));
      expect(await screen.findByRole("heading", { name: "Original question 0" })).toBeVisible();
      expect(screen.getByText(/Question 1 of 1/)).toBeVisible();
    }
  });

  it("never treats an unanswered original question as an initial miss", async () => {
    const { gateway, record } = fixture();
    record.attempts[0]!.answers = [];
    open(gateway, "review?scope=missed");
    expect(await screen.findByText("Nothing matches this review.")).toBeVisible();
  });

  it.each(["results", "review"])("shows unavailable historical content honestly on %s", async (route) => {
    const { gateway } = fixture();
    gateway.getModule.mockImplementation(async (_id, version) => {
      if (version === 1) throw new Error("Original package unavailable offline");
      return current;
    });
    open(gateway, route);
    expect(await screen.findByText(route === "results" ? "Saved mission debrief unavailable." : "Saved mission review unavailable.")).toBeVisible();
    expect(screen.queryByText("New version question")).not.toBeInTheDocument();
  });

  it("does not substitute the assigned version when live history has no version", async () => {
    const { gateway, record } = fixture();
    delete record.attempts[0]!.contentVersion;
    open(gateway, "review");
    expect(await screen.findByText("Saved mission review unavailable.")).toBeVisible();
    expect(gateway.getModule).not.toHaveBeenCalled();
  });

  it("rejects a mismatched version returned for a historical download", async () => {
    const { gateway } = fixture();
    gateway.getModule.mockResolvedValue(current);
    open(gateway, "review");
    expect(await screen.findByText("Saved mission review unavailable.")).toBeVisible();
    expect(screen.queryByText("New version question")).not.toBeInTheDocument();
  });

  it("handles saved-record failures without an unhandled rejection", async () => {
    const { gateway } = fixture();
    gateway.getLearnerModuleRecord.mockRejectedValue(new Error("storage unavailable"));
    open(gateway, "review");
    expect(await screen.findByText("Saved mission review unavailable.")).toBeVisible();
  });

  it("keeps legacy fixture review working when mock attempts have no version", async () => {
    const { record } = fixture();
    delete record.attempts[0]!.contentVersion;
    record.attempts[0]!.answers[0]!.questionId = base.questions[0]!.id;
    const gateway = new MockOfflineLearningGateway();
    vi.spyOn(gateway, "getLearnerModuleRecord").mockResolvedValue(record);
    open(gateway, "review?scope=all");
    expect(await screen.findByRole("heading", { name: base.questions[0]!.prompt.en })).toBeVisible();
  });

  it("omits retired question IDs when starting practice on the assigned version", async () => {
    const { gateway, record } = fixture();
    const assigned = { ...current, questions: [original.questions[0]!, ...current.questions] };
    gateway.getModule.mockResolvedValue(assigned);
    const start = vi.spyOn(gateway, "startRemediation").mockResolvedValue({ ...record.attempts[0]!, id: "practice", kind: "remediation", status: "in_progress" });
    open(gateway, "practice");
    await waitFor(() => expect(start).toHaveBeenCalledWith({ learnerId: "student-1", moduleId: base.module_id, contentVersion: 2, questionIds: [original.questions[0]!.id] }));
  });
});
