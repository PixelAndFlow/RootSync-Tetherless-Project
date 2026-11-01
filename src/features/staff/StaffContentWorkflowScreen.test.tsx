import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/api/ApiError";
import { StaffContentWorkflowScreen } from "./StaffContentWorkflowScreen";

const state = vi.hoisted(() => ({
  permissions: ["content.create", "assignment.manage"] as string[],
  gateway: { checkModule: vi.fn(), createModule: vi.fn(), listModules: vi.fn(), listCohorts: vi.fn(), createAssignment: vi.fn() },
}));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: { permissions: state.permissions } }) }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.gateway }));

const draft = { module_id: "new-module", content_version: 1, title: { en: "New Module" }, questions: [{ id: "q1" }] };
const validCheck = { valid: true, willBe: "new_module" as const, summary: { moduleId: "new-module", moduleName: "New Module", contentVersion: 1, level: null, activityType: "multiple_choice", questionCount: 1 }, errors: [], warnings: [] };
const cohortOne = { cohortId: "cohort-1", name: "Cohort One", createdAt: "2026-01-01", createdBy: null, archived: false };

function uploadFile() {
  return new File([JSON.stringify(draft)], "new-module.json", { type: "application/json" });
}

/** Replaces the global FileReader with one the test drives by hand, so read order is controllable. */
function installManualFileReader() {
  const pending: Array<{ file: File; resolve: (text: string) => void }> = [];
  class ManualFileReader {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    result: string | null = null;
    readAsText(file: File) {
      pending.push({ file, resolve: (text: string) => { this.result = text; this.onload?.(); } });
    }
  }
  const original = globalThis.FileReader;
  // @ts-expect-error — test-only stand-in, not a spec-conformant FileReader
  globalThis.FileReader = ManualFileReader;
  return { pending, restore: () => { globalThis.FileReader = original; } };
}

describe("staff content workflow screen", () => {
  beforeEach(() => {
    state.permissions = ["content.create", "assignment.manage"];
    state.gateway.checkModule.mockReset();
    state.gateway.createModule.mockReset();
    state.gateway.listModules.mockReset();
    state.gateway.listCohorts.mockReset().mockResolvedValue([cohortOne]);
    state.gateway.createAssignment.mockReset();
  });

  it("blocks a staff member with neither content permission", () => {
    state.permissions = [];
    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);
    expect(screen.getByText(/does not have access/)).toBeVisible();
    expect(state.gateway.checkModule).not.toHaveBeenCalled();
  });

  it("Chris's PR #35 review, point 5: content.edit alone can't reach this screen (the check route always requires content.create)", () => {
    state.permissions = ["content.edit", "assignment.manage"];
    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);
    expect(screen.getByText(/does not have access/)).toBeVisible();
    expect(state.gateway.checkModule).not.toHaveBeenCalled();
  });

  it("Chris's PR #35 review, point 7: a module the student app can't play yet can be checked but not previewed, published or assigned", async () => {
    state.gateway.checkModule.mockResolvedValue({ ...validCheck, summary: { ...validCheck.summary, activityType: "game:cyber-defense" } });
    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);
    await userEvent.upload(screen.getByLabelText("JSON file"), uploadFile());
    await userEvent.click(await screen.findByRole("button", { name: "Validate module" }));

    expect(await screen.findByText(/can only play "multiple_choice" modules today/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview module" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Preview" })).not.toBeInTheDocument(); // the Preview panel (and Publish within it) never opens
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

  it("Chris's PR #35 review, point 1: a stale file read can't overwrite a newer selection", async () => {
    const { pending, restore } = installManualFileReader();
    try {
      render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);
      const input = screen.getByLabelText("JSON file");
      await userEvent.upload(input, new File(["a"], "a.json", { type: "application/json" }));
      await userEvent.upload(input, new File(["b"], "b.json", { type: "application/json" }));
      expect(pending).toHaveLength(2);

      // Still reading B: must not fall back to A's already-parsed content.
      expect(screen.getByRole("button", { name: "Validate module" })).toBeDisabled();

      const draftA = { module_id: "module-a", content_version: 1, title: { en: "A" }, questions: [{ id: "q1" }] };
      const draftB = { module_id: "module-b", content_version: 1, title: { en: "B" }, questions: [{ id: "q1" }] };
      pending[1].resolve(JSON.stringify(draftB)); // B resolves first
      const validateButton = await screen.findByRole("button", { name: "Validate module" });
      expect(validateButton).toBeEnabled();

      pending[0].resolve(JSON.stringify(draftA)); // the stale, earlier read resolves after — must be ignored
      await userEvent.click(validateButton);

      expect(screen.getByText(/Selected: b.json/)).toBeVisible();
      expect(state.gateway.checkModule).toHaveBeenCalledTimes(1);
      expect(state.gateway.checkModule).toHaveBeenCalledWith(draftB);
    } finally { restore(); }
  });

  it("Chris's PR #35 review, point 2: a stale assignment response can't mark a later module as assigned", async () => {
    state.gateway.checkModule.mockImplementation(async (json: typeof draft) => ({ ...validCheck, summary: { ...validCheck.summary, moduleId: json.module_id, moduleName: json.module_id } }));
    state.gateway.createModule.mockImplementation(async (json: typeof draft) => ({ moduleId: json.module_id, contentVersion: 1, publishedAt: "2026-01-01T00:00:00.000Z", warnings: [] }));
    let resolveAssignA: ((value: unknown) => void) | undefined;
    state.gateway.createAssignment.mockImplementationOnce(() => new Promise((resolve) => { resolveAssignA = resolve; }));

    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);

    // Module A: publish, start an assignment, and leave its response unresolved.
    await userEvent.upload(screen.getByLabelText("JSON file"), new File([JSON.stringify(draft)], "a.json", { type: "application/json" }));
    await userEvent.click(await screen.findByRole("button", { name: "Validate module" }));
    await userEvent.click(await screen.findByRole("button", { name: "Preview module" }));
    await userEvent.click(await screen.findByRole("button", { name: "Publish module" }));
    await screen.findByText("Assign to a cohort");
    await userEvent.selectOptions(await screen.findByLabelText("Cohort"), "cohort-1");
    await userEvent.click(screen.getByRole("button", { name: "Assign to cohort" }));
    expect(state.gateway.createAssignment).toHaveBeenCalledTimes(1);

    // Move on to module B before A's assignment resolves.
    const draftB = { ...draft, module_id: "other-module" };
    await userEvent.upload(screen.getByLabelText("JSON file"), new File([JSON.stringify(draftB)], "b.json", { type: "application/json" }));
    await userEvent.click(await screen.findByRole("button", { name: "Validate module" }));
    await userEvent.click(await screen.findByRole("button", { name: "Preview module" }));
    await userEvent.click(await screen.findByRole("button", { name: "Publish module" }));
    await screen.findByText(/Published other-module version 1/);
    await screen.findByLabelText("Cohort"); // B's own assign form is up, not yet submitted

    // Now release A's held response.
    resolveAssignA?.({ assignmentId: "a1", moduleId: "new-module", moduleName: "new-module", contentVersion: 1, target: "cohort", cohortId: "cohort-1", learnerId: null, createdAt: "2026-01-01", createdBy: null });
    await Promise.resolve(); await Promise.resolve();

    expect(screen.queryByText("Assigned to the selected cohort.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign to cohort" })).toBeEnabled();

    // B can still be assigned normally afterward.
    await userEvent.selectOptions(screen.getByLabelText("Cohort"), "cohort-1");
    await userEvent.click(screen.getByRole("button", { name: "Assign to cohort" }));
    expect(await screen.findByText("Assigned to the selected cohort.")).toBeVisible();
    expect(state.gateway.createAssignment).toHaveBeenCalledTimes(2);
  });

  it("Chris's PR #35 review, point 3: cohort loading can fail and retry without republishing", async () => {
    state.gateway.checkModule.mockResolvedValue(validCheck);
    state.gateway.createModule.mockResolvedValue({ moduleId: "new-module", contentVersion: 1, publishedAt: "2026-01-01T00:00:00.000Z", warnings: [] });
    state.gateway.listCohorts.mockReset().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce([cohortOne]);

    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);
    await userEvent.upload(screen.getByLabelText("JSON file"), uploadFile());
    await userEvent.click(await screen.findByRole("button", { name: "Validate module" }));
    await userEvent.click(await screen.findByRole("button", { name: "Preview module" }));
    await userEvent.click(await screen.findByRole("button", { name: "Publish module" }));

    // Publication succeeded even though cohort loading is about to fail.
    expect(await screen.findByText(/Published new-module version 1/)).toBeVisible();
    const retryButton = await screen.findByRole("button", { name: "Retry loading cohorts" });
    expect(state.gateway.createModule).toHaveBeenCalledTimes(1);

    await userEvent.click(retryButton);
    await screen.findByLabelText("Cohort");
    expect(state.gateway.createModule).toHaveBeenCalledTimes(1); // retry did not republish
  });

  it("Chris's PR #35 review, point 3: a lost publish response is recovered via VERSION_EXISTS instead of stranding the user", async () => {
    state.gateway.checkModule.mockResolvedValue(validCheck);
    state.gateway.createModule.mockRejectedValue(new ApiError("VERSION_EXISTS", 409));
    state.gateway.listModules.mockResolvedValue([{ moduleId: "new-module", moduleName: "New Module", title: { en: "New Module" }, level: null, note: null, activityType: "multiple_choice", latestVersion: 1, versions: [1], questionCount: 1, used: false, archived: false, createdBy: null, createdAt: "2026-01-01T00:00:00.000Z" }]);

    render(<MemoryRouter><StaffContentWorkflowScreen /></MemoryRouter>);
    await userEvent.upload(screen.getByLabelText("JSON file"), uploadFile());
    await userEvent.click(await screen.findByRole("button", { name: "Validate module" }));
    await userEvent.click(await screen.findByRole("button", { name: "Preview module" }));
    await userEvent.click(await screen.findByRole("button", { name: "Publish module" }));

    expect(await screen.findByText(/Published new-module version 1/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(state.gateway.listModules).toHaveBeenCalled();
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
