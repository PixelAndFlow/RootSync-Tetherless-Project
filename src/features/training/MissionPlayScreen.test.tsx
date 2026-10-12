import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
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
  const router = createMemoryRouter([
    { path: "/learner/missions/:moduleId/play", element: <MissionPlayScreen /> },
  ], { initialEntries: ["/learner/missions/rcyc-recruit-cyber-squad-gamified-001/play"] });

  return render(
    <GatewayProvider gateways={{ offlineLearning, trainerData: new MockTrainerDataGateway() }}>
      <LearnerProfileProvider>
        <SyncStatusProvider>
          <RouterProvider router={router} />
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
    expect(screen.queryByText(/mission insight saved locally/i)).not.toBeInTheDocument();

    await act(async () => gateway.completePendingSave());
    await waitFor(() => expect(screen.getByText(/mission insight saved locally/i)).toBeInTheDocument());
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
