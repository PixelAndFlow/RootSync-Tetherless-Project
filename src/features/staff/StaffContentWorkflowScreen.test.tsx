import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffContentWorkflowScreen } from "./StaffContentWorkflowScreen";

const state = vi.hoisted(() => ({
  permissions: ["content.create", "assignment.manage"] as string[],
  gateway: { checkModule: vi.fn(), createModule: vi.fn(), listCohorts: vi.fn(), createAssignment: vi.fn() },
}));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: { permissions: state.permissions } }) }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.gateway }));

const draft = { module_id: "new-module", content_version: 1, title: { en: "New Module" }, questions: [{ id: "q1" }] };
const validCheck = { valid: true, willBe: "new_module" as const, summary: { moduleId: "new-module", moduleName: "New Module", contentVersion: 1, level: null, activityType: "multiple_choice", questionCount: 1 }, errors: [], warnings: [] };

function uploadFile() {
  return new File([JSON.stringify(draft)], "new-module.json", { type: "application/json" });
}

describe("staff content workflow screen", () => {
  beforeEach(() => {
    state.permissions = ["content.create", "assignment.manage"];
    state.gateway.checkModule.mockReset();
    state.gateway.createModule.mockReset();
    state.gateway.listCohorts.mockReset().mockResolvedValue([{ cohortId: "cohort-1", name: "Cohort One", createdAt: "2026-01-01", createdBy: null, archived: false }]);
    state.gateway.createAssignment.mockReset();
  });

  it("blocks a staff member with neither content permission", () => {
    state.permissions = [];
    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);
    expect(screen.getByText(/does not have access/)).toBeVisible();
    expect(state.gateway.checkModule).not.toHaveBeenCalled();
  });

  it("walks a module from file selection through validation, preview, publish and assignment", async () => {
    state.gateway.checkModule.mockResolvedValue(validCheck);
    state.gateway.createModule.mockResolvedValue({ moduleId: "new-module", contentVersion: 1, publishedAt: "2026-01-01T00:00:00.000Z", warnings: [] });
    state.gateway.createAssignment.mockResolvedValue({ assignmentId: "a1", moduleId: "new-module", moduleName: "New Module", contentVersion: 1, target: "cohort", cohortId: "cohort-1", learnerId: null, createdAt: "2026-01-01", createdBy: null });
    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);

    const input = screen.getByLabelText("JSON file");
    await userEvent.upload(input, uploadFile());
    expect(await screen.findByText(/Selected: new-module.json/)).toBeVisible();

    const validateButton = screen.getByRole("button", { name: "Validate module" });
    expect(validateButton).toBeEnabled();
    await userEvent.click(validateButton);
    expect(state.gateway.checkModule).toHaveBeenCalledWith(draft);
    expect(await screen.findByText(/this will be a new module/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Preview module" }));
    expect(await screen.findByText(/New Module — 1 questions/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Publish module" }));
    expect(state.gateway.createModule).toHaveBeenCalledWith(draft);
    expect(await screen.findByText(/Published new-module version 1/)).toBeVisible();

    await screen.findByText("Assign to a cohort");
    await userEvent.selectOptions(await screen.findByLabelText("Cohort"), "cohort-1");
    await userEvent.click(screen.getByRole("button", { name: "Assign to cohort" }));
    expect(state.gateway.createAssignment).toHaveBeenCalledWith({ moduleId: "new-module", contentVersion: 1, cohortId: "cohort-1" });
    expect(await screen.findByText("Assigned to the selected cohort.")).toBeVisible();
  });

  it("shows validation errors and keeps preview/publish disabled when the module is invalid", async () => {
    state.gateway.checkModule.mockResolvedValue({ valid: false, willBe: "blocked" as const, summary: { moduleId: null, moduleName: null, contentVersion: null, level: null, activityType: "multiple_choice", questionCount: 0 }, errors: [{ code: "REQUIRED", field: "questions", message: "At least one question is required." }], warnings: [] });
    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);
    await userEvent.upload(screen.getByLabelText("JSON file"), uploadFile());
    await userEvent.click(screen.getByRole("button", { name: "Validate module" }));
    expect(await screen.findByText("At least one question is required.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview module" })).toBeDisabled();
  });

  it("explains it can't read a file that isn't valid JSON", async () => {
    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);
    const badFile = new File(["not json"], "broken.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText("JSON file"), badFile);
    expect(await screen.findByText("Could not read this file as module JSON.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Validate module" })).toBeDisabled();
  });
});
