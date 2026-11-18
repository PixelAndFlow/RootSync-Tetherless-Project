import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffRosterImportScreen } from "./StaffRosterImportScreen";

const state = vi.hoisted(() => ({
  permissions: ["learner.import"] as string[],
  gateway: { listCohorts: vi.fn(), checkRoster: vi.fn(), commitRoster: vi.fn() },
}));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: { permissions: state.permissions } }) }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.gateway }));

const cohortOne = { cohortId: "cohort-1", name: "Cohort One", createdAt: "2026-01-01", createdBy: null, archived: false };
const validCheck = { importId: "import-1", cohortId: "cohort-1", valid: true, rowsTotal: 2, rowsOk: 2, errors: [], warnings: [], preview: [{ firstName: "Alex", lastName: "Rivera", phone: null, email: null, trainingLevel: null, note1: null, note2: null }, { firstName: "Jordan", lastName: "Lee", phone: null, email: null, trainingLevel: null, note1: null, note2: null }] };

function csvFile(content = "first_name,last_name\nAlex,Rivera\nJordan,Lee\n") {
  return new File([content], "roster.csv", { type: "text/csv" });
}

describe("staff roster import screen (issue #43)", () => {
  beforeEach(() => {
    state.permissions = ["learner.import"];
    state.gateway.listCohorts.mockReset().mockResolvedValue([cohortOne]);
    state.gateway.checkRoster.mockReset();
    state.gateway.commitRoster.mockReset();
  });

  it("blocks a staff member without learner.import", () => {
    state.permissions = [];
    render(<MemoryRouter><StaffRosterImportScreen /></MemoryRouter>);
    expect(screen.getByText(/does not have access/)).toBeVisible();
    expect(state.gateway.checkRoster).not.toHaveBeenCalled();
  });

  it("walks a roster from file selection through check and creation, with the setup codes shown once", async () => {
    state.gateway.checkRoster.mockResolvedValue(validCheck);
    state.gateway.commitRoster.mockResolvedValue({
      created: 2,
      learners: [
        { learnerId: "l1", learnerCode: "Cohort One-ABCD", firstName: "Alex", lastName: "Rivera", setupCode: "DEMO-AAAA1111" },
        { learnerId: "l2", learnerCode: "Cohort One-EFGH", firstName: "Jordan", lastName: "Lee", setupCode: "DEMO-BBBB2222" },
      ],
    });
    render(<MemoryRouter><StaffRosterImportScreen /></MemoryRouter>);

    await screen.findByLabelText("Cohort");
    await userEvent.upload(screen.getByLabelText("CSV file"), csvFile());
    expect(await screen.findByText(/Selected: roster.csv/)).toBeVisible();

    const checkButton = screen.getByRole("button", { name: "Check roster" });
    expect(checkButton).toBeEnabled();
    await userEvent.click(checkButton);
    expect(state.gateway.checkRoster).toHaveBeenCalledWith("cohort-1", expect.any(File));
    expect(await screen.findByText("2 students ready to create")).toBeVisible();
    expect(screen.getByText("Alex")).toBeVisible();
    expect(screen.getByText("Jordan")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Create students" }));
    expect(state.gateway.commitRoster).toHaveBeenCalledWith("import-1");
    expect(await screen.findByText("2 students created.")).toBeVisible();
    expect(screen.getByText("DEMO-AAAA1111")).toBeVisible();
    expect(screen.getByText("DEMO-BBBB2222")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create students" })).not.toBeInTheDocument();
  });

  it("shows row-level errors and keeps creation disabled when the file has problems", async () => {
    state.gateway.checkRoster.mockResolvedValue({ importId: "import-1", cohortId: "cohort-1", valid: false, rowsTotal: 1, rowsOk: 0, errors: [{ row: 2, field: "last_name", code: "REQUIRED", message: "Last name is missing." }], warnings: [], preview: [] });
    render(<MemoryRouter><StaffRosterImportScreen /></MemoryRouter>);
    await screen.findByLabelText("Cohort");
    await userEvent.upload(screen.getByLabelText("CSV file"), csvFile("first_name,last_name\nAlex,\n"));
    await userEvent.click(screen.getByRole("button", { name: "Check roster" }));
    expect(await screen.findByText(/Row 2: Last name is missing\./)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create students" })).not.toBeInTheDocument();
  });

  it("selecting a new file clears a previous check result", async () => {
    state.gateway.checkRoster.mockResolvedValue(validCheck);
    render(<MemoryRouter><StaffRosterImportScreen /></MemoryRouter>);
    await screen.findByLabelText("Cohort");
    await userEvent.upload(screen.getByLabelText("CSV file"), csvFile());
    await userEvent.click(screen.getByRole("button", { name: "Check roster" }));
    await screen.findByText("2 students ready to create");

    await userEvent.upload(screen.getByLabelText("CSV file"), csvFile("first_name,last_name\nSam,Ortiz\n"));
    expect(screen.queryByText("2 students ready to create")).not.toBeInTheDocument();
    expect(screen.getByText("Awaiting a check")).toBeVisible();
  });
});
