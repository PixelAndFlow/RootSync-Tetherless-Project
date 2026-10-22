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
    expect(await screen.findByText(/Contact your trainer/)).toBeVisible();
    expect(screen.queryByText(/resume on its own/)).not.toBeInTheDocument();
  });
});
