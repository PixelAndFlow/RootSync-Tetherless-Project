import { describe, expect, it } from "vitest";
import { ApiStaffAdminGateway } from "./staff/ApiStaffAdminGateway";
import { MockStaffAdminGateway } from "./staff/MockStaffAdminGateway";
import { createAppGateways, deferUntilReady } from "./gateways";
import { ApiTrainerReportsGateway } from "./trainer/ApiTrainerReportsGateway";

describe("app gateway composition", () => {
  it("keeps all gateways mock-backed when no API URL is configured", () => {
    const gateways = createAppGateways({});
    expect(gateways.staffAdmin).toBeInstanceOf(MockStaffAdminGateway);
    expect(gateways.trainerReports).toBeUndefined();
  });

  it("installs staff and trainer reports when an HTTPS API URL is configured", () => {
    const gateways = createAppGateways({ VITE_TETHERLESS_API_BASE_URL: "https://api.example.test/" });
    expect(gateways.staffAdmin).toBeInstanceOf(ApiStaffAdminGateway);
    expect(gateways.trainerReports).toBeInstanceOf(ApiTrainerReportsGateway);
    expect(gateways.offlineLearning).not.toBeInstanceOf(ApiStaffAdminGateway);
    expect(gateways.trainerData).not.toBeInstanceOf(ApiStaffAdminGateway);
  });
});

describe("deferUntilReady", () => {
  function makeGateway() {
    const calls: string[] = [];
    let ready = false;
    return {
      calls,
      markReady: () => { ready = true; },
      gateway: {
        async getLearnerModuleRecord(id: string) {
          if (!ready) throw new Error("gateway not initialized — call init() first");
          calls.push(id);
          return { id };
        },
        subscribeToSyncStatus(callback: () => void) { calls.push("subscribe"); callback(); return () => {}; },
      },
    };
  }

  it("holds async calls made before init resolves, then runs them", async () => {
    const { gateway, markReady, calls } = makeGateway();
    let resolve!: () => void;
    const ready = new Promise<void>((r) => { resolve = r; });
    const wrapped = deferUntilReady(gateway, ready);
    const pending = wrapped.getLearnerModuleRecord("a");
    await Promise.resolve();
    expect(calls).toEqual([]);
    markReady();
    resolve();
    await expect(pending).resolves.toEqual({ id: "a" });
  });

  it("leaves subscribeToSyncStatus synchronous", () => {
    const { gateway, calls } = makeGateway();
    const wrapped = deferUntilReady(gateway, new Promise<void>(() => {}));
    let called = false;
    const unsubscribe = wrapped.subscribeToSyncStatus(() => { called = true; });
    expect(called).toBe(true);
    expect(typeof unsubscribe).toBe("function");
    expect(calls).toEqual(["subscribe"]);
  });

  it("rejects held calls with the init error when init fails", async () => {
    const { gateway } = makeGateway();
    const wrapped = deferUntilReady(gateway, Promise.reject(new Error("IndexedDB blocked")));
    await expect(wrapped.getLearnerModuleRecord("a")).rejects.toThrow("IndexedDB blocked");
  });
});
