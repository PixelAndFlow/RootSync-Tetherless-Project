import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { SyncStatusProvider } from "../../app/providers/SyncStatusProvider";
import { MockOfflineLearningGateway } from "../../services/offline/MockOfflineLearningGateway";
import { MockTrainerDataGateway } from "../../services/trainer/MockTrainerDataGateway";
import type { SaveAnswerInput } from "../../types/learning";
import { moduleLibrary } from "../../content/modules";
import { MissionPlayScreen } from "./MissionPlayScreen";

class DeferredSaveGateway extends MockOfflineLearningGateway {
  private pendingSave: { input: SaveAnswerInput; resolve: () => void; reject: (reason?: unknown) => void } | null = null;

  override saveAnswer(input: SaveAnswerInput): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingSave = { input, resolve, reject };
    });
  }

  async completePendingSave(): Promise<void> {
    if (!this.pendingSave) throw new Error("No answer save is waiting.");
    const { input, resolve, reject } = this.pendingSave;
    this.pendingSave = null;
    try {
      await super.saveAnswer(input);
      resolve();
    } catch (error) {
      reject(error);
    }
  }
}

function renderMission(offlineLearning: MockOfflineLearningGateway) {
  window.localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({
    learnerId: "learner-1",
    deviceId: "device-1",
    displayName: "Alex",
    username: "alex",
    spanishAssist: false,
    highContrast: false,
    reducedMotion: false,
  }));
  return render(
    <GatewayProvider gateways={{ offlineLearning, trainerData: new MockTrainerDataGateway() }}>
      <LearnerProfileProvider>
        <SyncStatusProvider>
          <MemoryRouter initialEntries={["/learner/missions/rcyc-recruit-cyber-squad-gamified-001/play"]}><Routes><Route path="/learner/missions/:moduleId/play" element={<MissionPlayScreen />} /><Route path="/learner/missions/:moduleId" element={<p>Mission details</p>} /></Routes></MemoryRouter>
        </SyncStatusProvider>
      </LearnerProfileProvider>
    </GatewayProvider>,
  );
}

afterEach(() => window.localStorage.clear());

describe("MissionPlayScreen local-save feedback", () => {
  it("resumes its pinned cached package without fetching a newer assignment offline", async () => {
    const gateway = new MockOfflineLearningGateway();
    const module = moduleLibrary[0]!;
    await gateway.startAttempt({ learnerId: "learner-1", moduleId: module.module_id, contentVersion: 1, kind: "full" });
    const record = (await gateway.getLearnerModuleRecord("learner-1", module.module_id))!;
    record.attempts[0].contentVersion = 1;
    vi.spyOn(gateway, "getLearnerModuleRecord").mockResolvedValue(record);
    const getModule = vi.fn(async (_id: string, version: number) => { if (version !== 1) throw new Error("new version not downloaded"); return { ...module, content_version: 1 }; });
    const listAssignedModules = vi.fn().mockRejectedValue(new Error("offline"));
    Object.assign(gateway, { getModule, listAssignedModules });
    const start = vi.spyOn(gateway, "startAttempt");
    renderMission(gateway);
    expect(await screen.findByRole("heading", { name: module.questions[0].prompt.en })).toBeVisible();
    expect(getModule).toHaveBeenCalledWith(module.module_id, 1);
    expect(listAssignedModules).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
  it("resumes saved answers without allocating another attempt", async () => {
    const gateway = new MockOfflineLearningGateway();
    const module = moduleLibrary[0]!;
    const attempt = await gateway.startAttempt({ learnerId: "learner-1", moduleId: module.module_id, contentVersion: module.content_version, kind: "full" });
    await gateway.saveAnswer({ learnerId: "learner-1", moduleId: module.module_id, attemptId: attempt.id, xpAward: 0, answer: { questionId: module.questions[0].id, selectedChoiceId: module.questions[0].correct_choice, isCorrect: true, answeredAt: new Date().toISOString() } });
    const start = vi.spyOn(gateway, "startAttempt");
    renderMission(gateway);
    expect(await screen.findByRole("heading", { name: module.questions[1].prompt.en })).toBeVisible();
    expect(start).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Question 1" }));
    expect(screen.getByText(/mission insight saved locally/i)).toBeVisible();
  });

  it("keeps saved feedback when only the progress refresh fails", async () => {
    const gateway = new MockOfflineLearningGateway();
    renderMission(gateway);
    const answer = await screen.findByRole("button", { name: /Red Team/i });
    vi.spyOn(gateway, "getLearnerModuleRecord").mockRejectedValue(new Error("read unavailable"));
    await userEvent.click(answer);
    expect(await screen.findByText(/progress display could not refresh/)).toBeVisible();
    expect(screen.getByText(/mission insight saved locally/i)).toBeVisible();
    expect(screen.queryByText(/Your answer was not saved/)).not.toBeInTheDocument();
  });

  it("retains answers after completion fails and prevents overlapping completion requests", async () => {
    const gateway = new MockOfflineLearningGateway();
    const module = moduleLibrary[0]!;
    const attempt = await gateway.startAttempt({ learnerId: "learner-1", moduleId: module.module_id, contentVersion: module.content_version, kind: "full" });
    for (const question of module.questions) await gateway.saveAnswer({ learnerId: "learner-1", moduleId: module.module_id, attemptId: attempt.id, xpAward: 0, answer: { questionId: question.id, selectedChoiceId: question.correct_choice, isCorrect: true, answeredAt: new Date().toISOString() } });
    let reject!: (reason: Error) => void;
    const complete = vi.spyOn(gateway, "completeAttempt").mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    renderMission(gateway);
    const finish = await screen.findByRole("button", { name: "View mission debrief" });
    await userEvent.dblClick(finish);
    expect(complete).toHaveBeenCalledOnce();
    expect(finish).toBeDisabled();
    await act(async () => { reject(new Error("storage full")); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Your saved answers are still available");
    expect(finish).toBeEnabled();
    expect((await gateway.getLearnerModuleRecord("learner-1", module.module_id))?.attempts[0].answers).toHaveLength(module.questions.length);
  });
  it("waits for the session to be saved before starting an attempt", async () => {
    const gateway = new MockOfflineLearningGateway();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const startSession = gateway.startSession.bind(gateway);
    vi.spyOn(gateway, "startSession").mockImplementation(async (input) => { await pending; return startSession(input); });
    const startAttempt = vi.spyOn(gateway, "startAttempt");
    renderMission(gateway);
    expect(startAttempt).not.toHaveBeenCalled();
    await act(async () => { release(); });
    await screen.findByRole("button", { name: /Red Team/i });
    expect(startAttempt).toHaveBeenCalledOnce();
  });

  it("starts the attempt with the module's own content version", async () => {
    const gateway = new MockOfflineLearningGateway();
    const startAttempt = vi.spyOn(gateway, "startAttempt");
    renderMission(gateway);
    await screen.findByRole("button", { name: /Red Team/i });
    const input = startAttempt.mock.calls[0]![0];
    expect(input.moduleId).toBe("rcyc-recruit-cyber-squad-gamified-001");
    expect(Number.isInteger(input.contentVersion) && input.contentVersion >= 1).toBe(true);
  });

  it("offers a retry when preparing the local session fails", async () => {
    const gateway = new MockOfflineLearningGateway();
    const startSession = gateway.startSession.bind(gateway);
    vi.spyOn(gateway, "startSession").mockRejectedValueOnce(new Error("storage unavailable")).mockImplementation(startSession);
    renderMission(gateway);
    await screen.findByText(/Unable to prepare a local mission record/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /Red Team/i })).toBeVisible();
  });
  it("keeps choices disabled and withholds answer feedback until the gateway confirms a save", async () => {
    const user = userEvent.setup();
    const gateway = new DeferredSaveGateway();
    renderMission(gateway);

    const answer = await screen.findByRole("button", { name: /Red Team/i });
    await user.click(answer);

    expect(screen.getByText("Saving your answer locally...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Blue Team/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exit mission" })).toBeDisabled();
    expect(screen.queryByText(/mission insight saved locally/i)).not.toBeInTheDocument();

    await act(async () => gateway.completePendingSave());
    await waitFor(() => expect(screen.getByText(/mission insight saved locally/i)).toBeInTheDocument());
  });

  it("asks before leaving an unfinished mission and allows cancel or exit", async () => {
    const user = userEvent.setup();
    renderMission(new MockOfflineLearningGateway());
    await user.click(await screen.findByRole("button", { name: "Exit mission" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Return to the mission to continue");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Exit mission" }));
    await user.click(screen.getByRole("button", { name: "Exit to mission details" }));
    expect(await screen.findByText("Mission details")).toBeVisible();
  });

  it("keeps the question available and explains what to do when the gateway rejects a save", async () => {
    const user = userEvent.setup();
    const gateway = new MockOfflineLearningGateway();
    gateway.simulateNextSaveFailure("Storage is unavailable");
    renderMission(gateway);

    await user.click(await screen.findByRole("button", { name: /Red Team/i }));

    await waitFor(() => expect(screen.getByText("Your answer was not saved. Please choose an answer again.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Blue Team/i })).not.toBeDisabled();
    expect(screen.queryByText(/mission insight saved locally/i)).not.toBeInTheDocument();
  });
});
