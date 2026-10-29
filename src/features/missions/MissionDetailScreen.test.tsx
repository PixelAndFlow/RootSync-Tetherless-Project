import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { MockOfflineLearningGateway } from "../../services/offline/MockOfflineLearningGateway";
import { MockTrainerDataGateway } from "../../services/trainer/MockTrainerDataGateway";
import { moduleLibrary } from "../../content/modules";
import { MissionDetailScreen } from "./MissionDetailScreen";

function renderDetail(moduleId: string, offlineLearning: MockOfflineLearningGateway) {
  return render(
    <GatewayProvider gateways={{ offlineLearning, trainerData: new MockTrainerDataGateway() }}>
      <LearnerProfileProvider>
        <MemoryRouter initialEntries={[`/learner/missions/${moduleId}`]}>
          <Routes><Route element={<MissionDetailScreen />} path="/learner/missions/:moduleId" /></Routes>
        </MemoryRouter>
      </LearnerProfileProvider>
    </GatewayProvider>,
  );
}

describe("MissionDetailScreen", () => {
  it("shows the built-in demo mission's details when the gateway has no server to ask (mock mode)", async () => {
    renderDetail(moduleLibrary[0]!.module_id, new MockOfflineLearningGateway());
    expect(await screen.findByText(moduleLibrary[0]!.title.en)).toBeInTheDocument();
  });

  it("downloads and renders the mission through the gateway's getModule (live/DDIL mode)", async () => {
    const serverModule = {
      module_id: "phishing-basics",
      content_version: 1,
      title: { en: "Phishing Basics" },
      level: "foundation",
      questions: [],
    };
    const gateway = new MockOfflineLearningGateway() as MockOfflineLearningGateway & {
      getModule: (moduleId: string, contentVersion: number) => Promise<unknown>;
    };
    gateway.getModule = vi.fn().mockResolvedValue(serverModule);

    renderDetail("phishing-basics", gateway);

    expect(await screen.findByText("Phishing Basics")).toBeInTheDocument();
    expect(gateway.getModule).toHaveBeenCalledWith("phishing-basics", 1);
  });

  it("shows an unavailable state when the module fails to download", async () => {
    const gateway = new MockOfflineLearningGateway() as MockOfflineLearningGateway & {
      getModule: (moduleId: string, contentVersion: number) => Promise<unknown>;
    };
    gateway.getModule = vi.fn().mockRejectedValue(new Error("network down"));

    renderDetail("phishing-basics", gateway);

    expect(await screen.findByText(/mission unavailable/i)).toBeInTheDocument();
  });
});
