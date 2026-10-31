import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { createMockGateways } from "../../services/gateways";
import { LearnerProfileGate } from "./LearnerProfileGate";

function renderGated(gateways: ReturnType<typeof createMockGateways>, initialEntry = "/learner/missions") {
  return render(
    <GatewayProvider gateways={gateways}>
      <LearnerProfileProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route element={<div>Setup screen</div>} path="/learner" />
            <Route element={<LearnerProfileGate><div>Protected content</div></LearnerProfileGate>} path="/learner/missions" />
          </Routes>
        </MemoryRouter>
      </LearnerProfileProvider>
    </GatewayProvider>,
  );
}

describe("LearnerProfileGate", () => {
  beforeEach(() => window.localStorage.clear());

  it("redirects a Student who has never completed setup back to the setup screen", async () => {
    renderGated(createMockGateways());
    await waitFor(() => expect(screen.getByText("Setup screen")).toBeInTheDocument());
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders the page once a profile already exists in localStorage", () => {
    window.localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({
      learnerId: "learner-1", deviceId: "device-1", displayName: "Jordan", username: "jordan",
    }));
    renderGated(createMockGateways());
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("waits for gateway recovery before deciding, instead of bouncing a returning device", async () => {
    const gateways = createMockGateways();
    await act(async () => { await gateways.offlineLearning.setupDevice!({ setupCode: "DEMO-2026", username: "Jordan" }); });
    renderGated(gateways);
    // Must not redirect while recovery is still in flight.
    expect(screen.queryByText("Setup screen")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Protected content")).toBeInTheDocument());
  });

  it("does not redirect a staff/QA ?scenario= preview, even with no profile (e2e/staff-mock.spec.ts)", () => {
    renderGated(createMockGateways(), "/learner/missions?scenario=no-assigned-modules");
    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText("Setup screen")).not.toBeInTheDocument();
  });
});
