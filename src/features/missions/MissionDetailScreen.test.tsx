import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { MockOfflineLearningGateway } from "../../services/offline/MockOfflineLearningGateway";
import { MockTrainerDataGateway } from "../../services/trainer/MockTrainerDataGateway";
import { moduleLibrary } from "../../content/modules";
import { MissionDetailScreen } from "./MissionDetailScreen";
import type { ModuleSummary } from "../../services/offline/OfflineLearningGateway";
import type { TetherlessModule } from "../../types/content";

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
      mission_brief: { en: "Recognize unsafe messages and report phishing." },
      topics: [{ topic_id: "phishing", name: { en: "Spot suspicious links" } }],
      questions: [],
    };
    const gateway = new MockOfflineLearningGateway() as MockOfflineLearningGateway & {
      getModule: (moduleId: string, contentVersion: number) => Promise<unknown>;
      listAssignedModules: () => Promise<ModuleSummary[]>;
    };
    gateway.listAssignedModules = vi.fn().mockResolvedValue([{ moduleId: "phishing-basics", contentVersion: 1, title: serverModule.title, level: "foundation", activityType: "multiple_choice", downloadState: "not_downloaded" }]);
    gateway.getModule = vi.fn().mockResolvedValue(serverModule);

    renderDetail("phishing-basics", gateway);

    expect(await screen.findByText("Phishing Basics")).toBeInTheDocument();
    expect(gateway.getModule).toHaveBeenCalledWith("phishing-basics", 1);
    expect(screen.getByText(serverModule.mission_brief.en)).toBeVisible();
    expect(screen.getByText("Spot suspicious links")).toBeVisible();
    expect(screen.queryByText(/team roles and responsibilities/)).not.toBeInTheDocument();
    expect(screen.queryByText("MISSION MAP")).not.toBeInTheDocument();
  });

  function gatewayFor(module: TetherlessModule) {
    return Object.assign(new MockOfflineLearningGateway(), {
      getModule: vi.fn(async () => module),
      listAssignedModules: vi.fn(async () => [{ moduleId: module.module_id, contentVersion: module.content_version, title: module.title, level: module.level, activityType: "multiple_choice", downloadState: "available_offline" as const }]),
    });
  }

  it("renders only supplied checkpoints and derives their count", async () => {
    const module = structuredClone(moduleLibrary[0]!);
    module.gamification!.sectors = module.gamification!.sectors!.slice(0, 1);
    renderDetail(module.module_id, gatewayFor(module));
    expect(await screen.findByText("1 checkpoint in this mission.")).toBeVisible();
    expect(screen.getByText(module.gamification!.sectors[0].name.en)).toBeVisible();
    expect(screen.queryByText(/Four checkpoints/)).not.toBeInTheDocument();
  });

  it("uses neutral copy and actual question topics without an introduction or topic labels", async () => {
    const module = structuredClone(moduleLibrary[0]!);
    delete module.mission_brief;
    delete module.subtitle;
    delete module.topics;
    delete module.gamification;
    module.questions = [{ ...module.questions[0], topic: "email_safety" }];
    renderDetail(module.module_id, gatewayFor(module));
    expect(await screen.findByText(/Work through this mission's questions/)).toBeVisible();
    expect(screen.getByText("email safety")).toBeVisible();
    expect(screen.queryByText("MISSION MAP")).not.toBeInTheDocument();
  });

  it("shows an unavailable state when the module fails to download", async () => {
    const gateway = new MockOfflineLearningGateway() as MockOfflineLearningGateway & {
      getModule: (moduleId: string, contentVersion: number) => Promise<unknown>;
      listAssignedModules: () => Promise<ModuleSummary[]>;
    };
    gateway.listAssignedModules = vi.fn().mockResolvedValue([{ moduleId: "phishing-basics", contentVersion: 1, title: { en: "Phishing Basics" }, level: "foundation", activityType: "multiple_choice", downloadState: "not_downloaded" }]);
    gateway.getModule = vi.fn().mockRejectedValue(new Error("network down"));

    renderDetail("phishing-basics", gateway);

    expect(await screen.findByText(/mission unavailable/i)).toBeInTheDocument();
  });
});
