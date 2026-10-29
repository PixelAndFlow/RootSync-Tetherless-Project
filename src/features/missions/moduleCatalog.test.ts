import { describe, expect, it, vi } from "vitest";
import { loadModule, loadModuleCatalog } from "./moduleCatalog";
import { moduleLibrary } from "../../content/modules";
import type { OfflineLearningGateway, ModuleSummary } from "../../services/offline/OfflineLearningGateway";
import type { TetherlessModule } from "../../types/content";

/** A minimal stand-in for DdilLearningGateway: only the two §8.1 methods this file calls. */
function fakeLiveGateway(overrides: Partial<OfflineLearningGateway> = {}): OfflineLearningGateway {
  return {
    startSession: vi.fn(),
    startAttempt: vi.fn(),
    saveAnswer: vi.fn(),
    completeAttempt: vi.fn(),
    startRemediation: vi.fn(),
    getModuleProgress: vi.fn(),
    getLearnerModuleRecord: vi.fn(),
    getSyncSummary: vi.fn(),
    requestSync: vi.fn(),
    subscribeToSyncStatus: vi.fn(),
    ...overrides,
  } as unknown as OfflineLearningGateway;
}

const serverSummary: ModuleSummary = {
  moduleId: "phishing-basics",
  contentVersion: 2,
  title: { en: "Phishing Basics" },
  level: "foundation",
  activityType: "multiple_choice",
  downloadState: "not_downloaded",
};

const serverModule = { module_id: "phishing-basics", content_version: 2, title: { en: "Phishing Basics" } } as unknown as TetherlessModule;

describe("loadModuleCatalog", () => {
  it("falls back to the built-in fixtures when the gateway has no listAssignedModules (mock mode)", async () => {
    const gateway = fakeLiveGateway();
    const modules = await loadModuleCatalog(gateway);
    expect(modules.map((m) => m.moduleId)).toEqual(moduleLibrary.map((m) => m.module_id));
  });

  it("calls the gateway's listAssignedModules when it exists (live/DDIL mode), not the fixtures", async () => {
    const listAssignedModules = vi.fn().mockResolvedValue([serverSummary]);
    const gateway = fakeLiveGateway({ listAssignedModules });
    const modules = await loadModuleCatalog(gateway);
    expect(listAssignedModules).toHaveBeenCalledTimes(1);
    expect(modules).toEqual([serverSummary]);
  });

  it("deduplicates simultaneous catalog requests and refreshes on a later visit", async () => {
    const listAssignedModules = vi.fn().mockResolvedValue([serverSummary]);
    const gateway = fakeLiveGateway({ listAssignedModules });
    await Promise.all([loadModuleCatalog(gateway), loadModuleCatalog(gateway)]);
    expect(listAssignedModules).toHaveBeenCalledTimes(1);
    await loadModuleCatalog(gateway);
    expect(listAssignedModules).toHaveBeenCalledTimes(2);
  });
});

describe("loadModule", () => {
  it("falls back to the built-in fixture module when the gateway has no getModule (mock mode)", async () => {
    const gateway = fakeLiveGateway();
    const module = await loadModule(gateway, moduleLibrary[0]!.module_id);
    expect(module).toBe(moduleLibrary[0]);
  });

  it("throws for an unknown module id in mock mode rather than silently returning the wrong module", async () => {
    const gateway = fakeLiveGateway();
    await expect(loadModule(gateway, "not-a-real-module")).rejects.toThrow(/Unknown module/);
  });

  it("downloads through the gateway's getModule when it exists, resolving the version from the catalog", async () => {
    const listAssignedModules = vi.fn().mockResolvedValue([serverSummary]);
    const getModule = vi.fn().mockResolvedValue(serverModule);
    const gateway = fakeLiveGateway({ listAssignedModules, getModule });
    const module = await loadModule(gateway, "phishing-basics");
    expect(getModule).toHaveBeenCalledWith("phishing-basics", 2);
    expect(module).toBe(serverModule);
  });

  it("caches a downloaded module per id+version, not re-fetching on a second call", async () => {
    const getModule = vi.fn().mockResolvedValue(serverModule);
    const gateway = fakeLiveGateway({ getModule });
    await loadModule(gateway, "phishing-basics", 2);
    await loadModule(gateway, "phishing-basics", 2);
    expect(getModule).toHaveBeenCalledTimes(1);
  });
});
