import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { MockOfflineLearningGateway } from "../../services/offline/MockOfflineLearningGateway";
import { MockTrainerDataGateway } from "../../services/trainer/MockTrainerDataGateway";
import { moduleLibrary } from "../../content/modules";
import { MissionLibraryScreen } from "./MissionLibraryScreen";

function renderLibrary(offlineLearning: MockOfflineLearningGateway, offlineLearningReady?: Promise<void>) {
  return render(
    <GatewayProvider gateways={{ offlineLearning, offlineLearningReady, trainerData: new MockTrainerDataGateway() }}>
      <LearnerProfileProvider>
        <MemoryRouter initialEntries={["/learner/missions"]}><MissionLibraryScreen /></MemoryRouter>
      </LearnerProfileProvider>
    </GatewayProvider>,
  );
}

describe("MissionLibraryScreen", () => {
  it("shows the built-in demo mission when the gateway has no server to ask (mock mode)", async () => {
    renderLibrary(new MockOfflineLearningGateway());
    expect(await screen.findByText(moduleLibrary[0]!.title.en)).toBeInTheDocument();
  });

  it("renders missions from the gateway's listAssignedModules when it exists, not the demo fixtures (live/DDIL mode)", async () => {
    const gateway = new MockOfflineLearningGateway() as MockOfflineLearningGateway & {
      listAssignedModules: () => Promise<unknown[]>;
    };
    gateway.listAssignedModules = vi.fn().mockResolvedValue([
      { moduleId: "phishing-basics", contentVersion: 1, title: { en: "Phishing Basics" }, level: "foundation", activityType: "multiple_choice", downloadState: "not_downloaded" },
    ]);

    renderLibrary(gateway);

    expect(await screen.findByText("Phishing Basics")).toBeInTheDocument();
    expect(screen.queryByText(moduleLibrary[0]!.title.en)).not.toBeInTheDocument();
    expect(gateway.listAssignedModules).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state while the assigned-module list is in flight, then renders it", async () => {
    let resolveList!: (modules: unknown[]) => void;
    const gateway = new MockOfflineLearningGateway() as MockOfflineLearningGateway & {
      listAssignedModules: () => Promise<unknown[]>;
    };
    gateway.listAssignedModules = vi.fn(
      () => new Promise<unknown[]>((resolve) => { resolveList = resolve; }),
    );

    renderLibrary(gateway);

    expect(await screen.findByRole("status")).toBeInTheDocument();
    resolveList([
      { moduleId: "phishing-basics", contentVersion: 1, title: { en: "Phishing Basics" }, level: "foundation", activityType: "multiple_choice", downloadState: "available_offline" },
    ]);
    expect(await screen.findByText("Phishing Basics")).toBeInTheDocument();
  });

  it("shows an empty state when the learner has no assigned missions", async () => {
    const gateway = new MockOfflineLearningGateway() as MockOfflineLearningGateway & {
      listAssignedModules: () => Promise<unknown[]>;
    };
    gateway.listAssignedModules = vi.fn().mockResolvedValue([]);

    renderLibrary(gateway);

    await waitFor(() => expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument());
  });

  it("shows an error state when the assigned-module list fails to load", async () => {
    const gateway = new MockOfflineLearningGateway() as MockOfflineLearningGateway & {
      listAssignedModules: () => Promise<unknown[]>;
    };
    gateway.listAssignedModules = vi.fn().mockRejectedValue(new Error("network down"));

    renderLibrary(gateway);

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
  });
});
