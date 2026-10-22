import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { LearnerSettingsScreen } from "./LearnerSettingsScreen";

function setup(withCode = true) {
  localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({ learnerId: "demo", deviceId: "device", displayName: "Test Learner", username: "test", ...(withCode ? { learnerCode: "DEMO-001", cohortName: "Demo cohort" } : {}) }));
  render(<MemoryRouter><LearnerProfileProvider><LearnerSettingsScreen /></LearnerProfileProvider></MemoryRouter>);
}
describe("learner profile and settings", () => {
  beforeEach(() => localStorage.clear());
  it("shows profile fields and copies only the learner code", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    setup();
    expect(screen.getByText("Demo cohort")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy learner code" }));
    expect(await screen.findByText("Learner code copied.")).toBeVisible();
    expect(copy).toHaveBeenCalledWith("DEMO-001");
  });
  it("provides manual copy guidance when clipboard access is denied", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) } });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Copy learner code" }));
    expect(await screen.findByText(/copy it manually/)).toBeVisible();
    expect(screen.getByText("DEMO-001")).toBeVisible();
  });
  it("handles older demo profiles without inventing an assigned cohort", () => {
    setup(false);
    expect(screen.getByText("Not assigned in this demo")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copy learner code" })).not.toBeInTheDocument();
  });
});
