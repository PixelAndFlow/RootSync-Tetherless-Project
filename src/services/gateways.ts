import { MockOfflineLearningGateway } from "./offline/MockOfflineLearningGateway";
import type { OfflineLearningGateway } from "./offline/OfflineLearningGateway";
import { MockTrainerDataGateway } from "./trainer/MockTrainerDataGateway";
import type { TrainerDataGateway } from "./trainer/TrainerDataGateway";
import type { TrainerReportsGateway } from "./trainer/ApiTrainerReportsGateway";
import { MockStaffAdminGateway } from "./staff/MockStaffAdminGateway";
import { ApiStaffAdminGateway } from "./staff/ApiStaffAdminGateway";
import type { StaffAdminGateway } from "./staff/StaffAdminGateway";
import { readFrontendRuntimeConfig } from "./integration/runtimeConfig";
import { ApiClient } from "./api/ApiClient";
import { DdilLearningGateway } from "../sync/gateway/ddil-gateway";
import type { IDBFactoryLike } from "../sync/stores/idb";
import { HttpTransport } from "../sync/transport/http-transport";

export interface AppGateways {
  offlineLearning: OfflineLearningGateway;
  /**
   * Resolves once offlineLearning has finished opening its IndexedDB store.
   * Only set in live mode (the mock adapter is ready synchronously). Calls on
   * `offlineLearning` already wait for it (see deferUntilReady), so screens
   * only need it to show an init failure up front, as LearnerSetupScreen does.
   */
  offlineLearningReady?: Promise<void>;
  trainerData: TrainerDataGateway;
  trainerReports?: TrainerReportsGateway;
  /** Optional until Marc's staff API adapter is installed at the app boundary. */
  staffAdmin?: StaffAdminGateway;
}

export function createMockGateways(): AppGateways {
  return {
    offlineLearning: new MockOfflineLearningGateway(),
    trainerData: new MockTrainerDataGateway(),
    staffAdmin: new MockStaffAdminGateway(),
  };
}

// This is deliberately the only default. A production DDIL/API adapter will be
// supplied at the application boundary once the team agrees the contracts.
export const mockGateways = createMockGateways();

/**
 * Live mode is explicitly enabled only by VITE_TETHERLESS_API_BASE_URL.
 *
 * Marc, standing in for Naquan (2026-10-26, flagged for his review): wires
 * the real DdilLearningGateway here per API Spec v1.30 §8.1/§11.2, in place
 * of the mock. The device token is owned by DdilLearningGateway (persisted
 * in IndexedDB, never localStorage — §6.1); HttpTransport and ApiClient are
 * constructed here at the composition root, so they read the token through
 * a small mutable box that `onTokenChange` keeps current.
 *
 * init() is async (it opens IndexedDB) but this function is not, so init()
 * is kicked off here rather than awaited, and its promise is exposed as
 * `offlineLearningReady` for the one call site that can reach the gateway
 * before init() would realistically have resolved.
 */
export function createAppGateways(environment: Record<string, string | boolean | undefined> = import.meta.env): AppGateways {
  const config = readFrontendRuntimeConfig(environment);
  if (config.mode === "integration" && config.apiBaseUrl) {
    const staffAdmin = new ApiStaffAdminGateway(config.apiBaseUrl);

    const tokenBox: { current: string | null } = { current: null };
    const api = new ApiClient(config.apiBaseUrl, () => tokenBox.current);
    const transport = new HttpTransport({ baseUrl: config.apiBaseUrl, token: () => tokenBox.current });
    const offlineLearning = new DdilLearningGateway({
      // The real browser IndexedDB is a safe superset of IDBFactoryLike; the
      // only thing TS flags is lib.dom's stricter Event typing on request
      // callbacks versus this interface's relaxed `unknown`, which DDIL's
      // own handlers never rely on. Read off globalThis, not the bare
      // identifier, since it is undeclared (not just unavailable) outside a
      // browser, e.g. this function's own unit tests under jsdom.
      idb: (globalThis as { indexedDB?: IDBFactory }).indexedDB as unknown as IDBFactoryLike,
      transport,
      api,
      onTokenChange: (token) => { tokenBox.current = token; },
    });
    const offlineLearningReady = offlineLearning.init();
    // A no-op observer so a real init() failure (e.g. IndexedDB blocked) does
    // not surface as an unhandled rejection before any screen has a chance to
    // await offlineLearningReady itself and show the learner an error.
    offlineLearningReady.catch(() => {});

    void navigator.storage?.persist?.();

    return { ...createMockGateways(), offlineLearning: deferUntilReady(offlineLearning, offlineLearningReady), offlineLearningReady, staffAdmin, trainerReports: staffAdmin.reports() };
  }
  return mockGateways;
}

/**
 * A persisted learner profile is read synchronously on app start, so on a reload
 * mid-session the mission screens call the gateway while init() is still opening
 * IndexedDB, and the gateway throws "not initialized". Wrapping every async method
 * to wait for `ready` closes that race for all current and future call sites.
 * subscribeToSyncStatus stays synchronous (it returns an unsubscribe function and
 * has its own not-yet-ready handling). If init() fails, the wrapped calls reject
 * with that error instead of a misleading "not initialized".
 */
export function deferUntilReady<T extends object>(gateway: T, ready: Promise<void>): T {
  const passthrough = new Set<PropertyKey>(["init", "subscribeToSyncStatus"]);
  return new Proxy(gateway, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (passthrough.has(property)) return value.bind(target);
      return (...args: unknown[]) => ready.then(() => value.apply(target, args));
    },
  });
}

/**
 * Naquan's §11.2 item: visibility/heartbeat emission has no natural home
 * inside a React component, since it must keep running across screens, so
 * the app boundary (main.tsx) wires it once here instead of inside
 * createAppGateways(), which gateways.test.ts also calls directly and which
 * must stay free of timers/listeners to behave as a pure composition step.
 * `offlineLearningReady` being set is how the caller knows live mode (and
 * therefore a real DdilLearningGateway) is in play; it also guards against
 * the first tick or a tab switch landing before init() resolves.
 */
export function startLiveHeartbeat(gateways: AppGateways): void {
  const ready = gateways.offlineLearningReady;
  if (!ready) return;
  const gateway = gateways.offlineLearning as OfflineLearningGateway & {
    noteVisibility(state: "visible" | "hidden"): Promise<void>;
    heartbeat(): Promise<void>;
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      void ready.then(() => gateway.noteVisibility(document.visibilityState === "visible" ? "visible" : "hidden")).catch(() => {});
    });
  }
  setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    void ready.then(() => gateway.heartbeat()).catch(() => {});
  }, 20_000);
}

export const appGateways = createAppGateways();
