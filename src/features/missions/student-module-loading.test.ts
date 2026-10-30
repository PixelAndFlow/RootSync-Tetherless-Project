import { expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { createMockGateways } from "../../services/gateways";
import { useModuleCatalog } from "./useModules";
import { loadModule, loadModuleCatalog } from "./moduleCatalog";
import { DdilLearningGateway } from "../../sync/gateway/ddil-gateway";
import { FakeIDBFactory } from "../../../tests/sync/fakes/fake-idb";
import { FakeTransport } from "../../../tests/sync/fakes/fake-transport";
import type { OfflineLearningGateway, ModuleSummary } from "../../services/offline/OfflineLearningGateway";
import type { TetherlessModule } from "../../types/content";

const summary: ModuleSummary = { moduleId: "review-module", contentVersion: 2, title: { en: "Review module" }, level: "beginner", activityType: "multiple_choice", downloadState: "available_offline" };
const module = { schema_version: "tetherless.module.v1", module_id: summary.moduleId, content_version: 2, title: summary.title } as TetherlessModule;

it("a downloaded assigned module opens after app restart while offline", async () => {
  let offline = false;
  const idb = new FakeIDBFactory();
  const options = { idb, transport: new FakeTransport(Date.now), api: {
    get: async (path: string) => {
      if (offline) throw new Error("network unavailable");
      if (path === "/v1/me/modules") return { modules: [{ module_id: summary.moduleId, content_version: 2, title: summary.title, level: summary.level, activity_type: summary.activityType }] };
      return module;
    }, post: async () => { throw new Error("unused"); },
  } };
  const onlineGateway = new DdilLearningGateway(options);
  await onlineGateway.init();
  await loadModuleCatalog(onlineGateway as unknown as OfflineLearningGateway);
  await loadModule(onlineGateway as unknown as OfflineLearningGateway, summary.moduleId);
  offline = true;
  const reopenedGateway = new DdilLearningGateway(options);
  await reopenedGateway.init();
  expect(await reopenedGateway.getModule(summary.moduleId, 2)).toEqual(module);
  await expect(loadModule(reopenedGateway as unknown as OfflineLearningGateway, summary.moduleId)).resolves.toEqual(module);
});

it("returning to the library sees a newly assigned module without restarting the app", async () => {
  let assignments: ModuleSummary[] = [];
  const gateway = { listAssignedModules: vi.fn(async () => assignments) } as unknown as OfflineLearningGateway;
  expect(await loadModuleCatalog(gateway)).toEqual([]);
  assignments = [summary];
  expect(await loadModuleCatalog(gateway)).toEqual([summary]);
});

it("reconnection refreshes a library that is already open", async () => {
  let assignments: ModuleSummary[] = [];
  const gateway = { listAssignedModules: vi.fn(async () => assignments) } as unknown as OfflineLearningGateway;
  const gateways = { ...createMockGateways(), offlineLearning: gateway };
  const wrapper = ({ children }: { children: ReactNode }) => createElement(GatewayProvider, { gateways, children });
  const { result } = renderHook(useModuleCatalog, { wrapper });
  await waitFor(() => expect(result.current.data).toEqual([]));
  assignments = [summary];
  act(() => { window.dispatchEvent(new Event("online")); });
  await waitFor(() => expect(result.current.data).toEqual([summary]));
});

it("never defaults an unassigned module to version 1", async () => {
  const getModule = vi.fn();
  const gateway = { listAssignedModules: vi.fn(async () => []), getModule } as unknown as OfflineLearningGateway;
  await expect(loadModule(gateway, "unassigned")).rejects.toThrow(/not assigned/);
  expect(getModule).not.toHaveBeenCalled();
});

it("refreshes downloaded state and preserves cached assignments without masking authentication failures", async () => {
  let failure: Error | undefined;
  const gateway = new DdilLearningGateway({ idb: new FakeIDBFactory(), transport: new FakeTransport(Date.now), api: {
    get: async (path: string) => {
      if (failure) throw failure;
      return path === "/v1/me/modules" ? { modules: [{ module_id: summary.moduleId, content_version: 2, title: summary.title, level: summary.level, activity_type: summary.activityType }] } : module;
    }, post: async () => { throw new Error("unused"); },
  } });
  await gateway.init();
  expect((await gateway.listAssignedModules())[0]?.downloadState).toBe("not_downloaded");
  await gateway.getModule(summary.moduleId, 2);
  failure = new Error("network unavailable");
  expect((await gateway.listAssignedModules())[0]?.downloadState).toBe("available_offline");
  for (const status of [401, 403, 404, 200]) {
    failure = Object.assign(new Error("request rejected"), { status });
    await expect(gateway.listAssignedModules()).rejects.toBe(failure);
  }
});

it("a valid empty catalog remains available offline, while a never-loaded catalog remains an error", async () => {
  let offline = false;
  const options = { idb: new FakeIDBFactory(), transport: new FakeTransport(Date.now), isOnline: () => !offline, api: {
    get: async () => ({ modules: [] }), post: async () => { throw new Error("unused"); },
  } };
  const gateway = new DdilLearningGateway(options);
  await gateway.init();
  expect(await gateway.listAssignedModules()).toEqual([]);
  offline = true;
  const reopened = new DdilLearningGateway(options);
  await reopened.init();
  expect(await reopened.listAssignedModules()).toEqual([]);
  const newDevice = new DdilLearningGateway({ ...options, idb: new FakeIDBFactory() });
  await newDevice.init();
  await expect(newDevice.listAssignedModules()).rejects.toThrow(/catalog.*offline/);
});

it("assignment fallback is scoped to the enrolled student", async () => {
  let learnerId = "student-one";
  let offline = false;
  const gateway = new DdilLearningGateway({ idb: new FakeIDBFactory(), transport: new FakeTransport(Date.now), isOnline: () => !offline, api: {
    get: async () => ({ modules: [{ module_id: summary.moduleId, content_version: 2, title: summary.title, level: summary.level, activity_type: summary.activityType }] }),
    post: async () => ({ device_token: "synthetic-token", learner: { learner_id: learnerId, learner_code: learnerId, username: learnerId, cohort_name: "Synthetic cohort" } }),
  } });
  await gateway.init();
  await gateway.setupDevice({ setupCode: "synthetic", username: learnerId });
  await gateway.listAssignedModules();
  learnerId = "student-two";
  await gateway.setupDevice({ setupCode: "synthetic-two", username: learnerId });
  offline = true;
  await expect(gateway.listAssignedModules()).rejects.toThrow(/catalog.*offline/);
});

it("malformed online responses cannot replace a valid saved catalog", async () => {
  let body: unknown = { modules: [] };
  let offline = false;
  const gateway = new DdilLearningGateway({ idb: new FakeIDBFactory(), transport: new FakeTransport(Date.now), isOnline: () => !offline, api: {
    get: async () => body, post: async () => { throw new Error("unused"); },
  } });
  await gateway.init();
  expect(await gateway.listAssignedModules()).toEqual([]);
  for (body of [null, {}, { modules: [{ module_id: "bad", content_version: 0 }] }]) {
    await expect(gateway.listAssignedModules()).rejects.toThrow(/invalid.*catalog/);
  }
  offline = true;
  expect(await gateway.listAssignedModules()).toEqual([]);
});
