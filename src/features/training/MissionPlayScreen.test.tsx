import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { SyncStatusProvider } from "../../app/providers/SyncStatusProvider";
import { MockOfflineLearningGateway } from "../../services/offline/MockOfflineLearningGateway";
import { MockTrainerDataGateway } from "../../services/trainer/MockTrainerDataGateway";
import type { SaveAnswerInput } from "../../types/learning";
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
    expect(screen.getByRole("dialog")).toHaveTextContent("cannot be resumed");
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
