import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { createMockGateways } from "../../services/gateways";
import type { OfflineLearningGateway } from "../../services/offline/OfflineLearningGateway";
import { ApiError } from "../../services/api/ApiError";
import { LearnerSetupScreen } from "./LearnerSetupScreen";

function setup(gateways = createMockGateways()) {
  render(<MemoryRouter><GatewayProvider gateways={gateways}><LearnerProfileProvider><Routes>
    <Route path="/" element={<LearnerSetupScreen />} />
    <Route path="/learner/missions" element={<h1>Mission library</h1>} />
  </Routes></LearnerProfileProvider></GatewayProvider></MemoryRouter>);
  return gateways;
}
function fill() {
  fireEvent.change(screen.getByLabelText("Setup code"), { target: { value: "DEMO-2026" } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "Test Learner" } });
}
describe("mock-backed device setup", () => {
  beforeEach(() => localStorage.clear());
  it("requires a setup code and validates usernames; no learner name field", async () => {
    setup();
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue to missions" }));
    expect(await screen.findByText("Enter the setup code supplied by your trainer.")).toBeVisible();
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
  });
  it("accepts only the synthetic demo code and persists no code/token", async () => {
    setup(); fill();
    fireEvent.click(screen.getByRole("button", { name: "Continue to missions" }));
    expect(await screen.findByRole("heading", { name: "Mission library" })).toBeVisible();
    const stored = localStorage.getItem("tetherless.learner-profile.v1")!;
    expect(JSON.parse(stored)).toMatchObject({ learnerCode: "DEMO-001", cohortName: "Frontend demo cohort", username: "Test Learner" });
    expect(stored).not.toContain("DEMO-2026");
    expect(stored).not.toContain("token");
  });
  it("handles used-code errors without leaking server details", async () => {
    const gateways = createMockGateways();
    vi.spyOn(gateways.offlineLearning as Required<OfflineLearningGateway>, "setupDevice").mockRejectedValue(new ApiError("SETUP_CODE_USED", 409, false, "request-test"));
    setup(gateways); fill();
    fireEvent.click(screen.getByRole("button", { name: "Continue to missions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already been used");
    expect(screen.getByRole("alert")).toHaveTextContent("request-test");
    expect(localStorage.length).toBe(0);
  });
  it("prevents duplicate submission while setup is pending", async () => {
    const gateways = createMockGateways();
    const spy = vi.spyOn(gateways.offlineLearning as Required<OfflineLearningGateway>, "setupDevice").mockImplementation(() => new Promise(() => {}));
    setup(gateways); fill();
    const button = screen.getByRole("button", { name: "Continue to missions" });
    fireEvent.click(button); fireEvent.click(button);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("Setup code")).toBeDisabled();
  });
  it("still proceeds to missions when local demo profile storage fails", async () => {
    // The gateway-side setup has already succeeded by the time localStorage
    // is written; a quota/permission failure here must not strand the
    // learner on a setup code the backend now considers consumed.
    setup(); fill();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota", "QuotaExceededError"); });
    fireEvent.click(screen.getByRole("button", { name: "Continue to missions" }));
    expect(await screen.findByRole("heading", { name: "Mission library" })).toBeVisible();
    spy.mockRestore();
  });
  it("does not silently substitute mocks if the setup adapter is absent", () => {
    const gateways = createMockGateways(); gateways.offlineLearning.setupDevice = undefined;
    setup(gateways);
    expect(screen.getByRole("alert")).toHaveTextContent("not connected");
    expect(screen.getByRole("button", { name: "Continue to missions" })).toBeDisabled();
  });
  it("does not advertise the demo-only DEMO-2026 code in live mode (issue #22)", async () => {
    const gateways = createMockGateways();
    gateways.offlineLearningReady = Promise.resolve();
    setup(gateways);
    expect(await screen.findByText(/Download assigned missions while connected/)).toBeVisible();
    expect(screen.queryByText(/DEMO-2026/)).not.toBeInTheDocument();
  });
});
