import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { SyncStatusProvider } from "../../app/providers/SyncStatusProvider";
import { createMockGateways } from "../../services/gateways";
import { MockOfflineLearningGateway } from "../../services/offline/MockOfflineLearningGateway";
import { SyncStatusScreen } from "./SyncStatusScreen";

describe("authorization-paused sync", () => {
  it("keeps pending work, blocks retry, and remains visible offline", async () => {
    const gateways = createMockGateways();
    const offline = gateways.offlineLearning as MockOfflineLearningGateway;
    await offline.startSession({ learnerId: "test-learner", deviceId: "test-device" });
    const before = await offline.getSyncSummary();
    offline.simulateBlockedAuthorization("revoked_device");
    const request = vi.spyOn(offline, "requestSync");
    render(<MemoryRouter><GatewayProvider gateways={gateways}><SyncStatusProvider><SyncStatusScreen /></SyncStatusProvider></GatewayProvider></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /Sync paused/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
    expect(screen.getByText(/Do not clear this device or create a new setup/)).toBeVisible();
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("heading", { name: /Sync paused/ })).toBeVisible();
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(request).not.toHaveBeenCalled());
    expect((await offline.getSyncSummary()).pendingEventCount).toBe(before.pendingEventCount);
    expect(await offline.requestSync()).toMatchObject({ status: "blocked_auth", pendingEventCount: before.pendingEventCount });
  });
  it("shows unknown authorization without promising automatic recovery", async () => {
    const gateways = createMockGateways();
    (gateways.offlineLearning as MockOfflineLearningGateway).simulateBlockedAuthorization();
    render(<MemoryRouter><GatewayProvider gateways={gateways}><SyncStatusProvider><SyncStatusScreen /></SyncStatusProvider></GatewayProvider></MemoryRouter>);
    expect(await screen.findByText(/Ask your Trainer for help/)).toBeVisible();
    expect(screen.queryByText(/resume on its own/)).not.toBeInTheDocument();
  });
});

describe("automatic retry while the tab stays open", () => {
  it("asks the gateway to sync again on a timer, with no state change needed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const gateways = createMockGateways();
      const offline = gateways.offlineLearning as MockOfflineLearningGateway;
      const request = vi.spyOn(offline, "requestSync");
      render(<MemoryRouter><GatewayProvider gateways={gateways}><SyncStatusProvider><SyncStatusScreen /></SyncStatusProvider></GatewayProvider></MemoryRouter>);
      await waitFor(() => expect(screen.getByRole("button", { name: /Sync now/ })).toBeInTheDocument());
      request.mockClear();

      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(request).toHaveBeenCalledTimes(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry on the timer while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const gateways = createMockGateways();
      const offline = gateways.offlineLearning as MockOfflineLearningGateway;
      const request = vi.spyOn(offline, "requestSync");
      render(<MemoryRouter><GatewayProvider gateways={gateways}><SyncStatusProvider><SyncStatusScreen /></SyncStatusProvider></GatewayProvider></MemoryRouter>);
      await waitFor(() => expect(screen.getByRole("button", { name: /Sync now/ })).toBeInTheDocument());
      request.mockClear();
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(request).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
