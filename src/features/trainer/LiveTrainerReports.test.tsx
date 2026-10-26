import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/api/ApiError";
import type { ReportLearner, TrainerReportsGateway } from "../../services/trainer/ApiTrainerReportsGateway";
import { LiveTrainerDashboard, LiveTrainerLearnerDetail } from "./LiveTrainerReports";

const state = vi.hoisted(() => ({ staff: { listCohorts: vi.fn() } }));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: { role: "trainer" } }) }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.staff }));
const learner: ReportLearner = { learnerId: "learner-1", learnerCode: "TEST-1", displayName: "Test Student", username: null, cohortId: "cohort-1", activeEngagementSeconds: 62, lastReceivedAt: null, acceptedEventCount: 2, rejectedEventCount: 0, mayHaveUnsyncedWork: true, modules: [{ moduleId: "module-1", moduleTitle: "Safety", contentVersion: 1, completionStatus: "in_progress", performanceStatus: "not_yet_passing", initialScorePercent: null, bestScorePercent: null, latestScorePercent: null, currentMasteryPercent: 25, questionsAnswered: 1, questionsTotal: 4 }] };
const cohorts = [{ cohort_id: "cohort-1", name: "First cohort" }, { cohort_id: "cohort-2", name: "Second cohort" }];
let reports: TrainerReportsGateway;
beforeEach(() => {
  state.staff.listCohorts.mockReset().mockResolvedValue(cohorts);
  reports = { listLearners: vi.fn().mockImplementation(async ({ cohortId }: { cohortId: string }) => cohortId === "cohort-1" ? [learner] : []), getLearnerReport: vi.fn().mockResolvedValue(learner), getModuleCohortSummary: vi.fn() };
});
const dashboard = () => render(<MemoryRouter><LiveTrainerDashboard reports={reports} /></MemoryRouter>);

describe("live trainer reports", () => {
  it("shows partial work and switches between cohorts without inventing XP or sync state", async () => {
    dashboard();
    const row = await screen.findByRole("row", { name: /Test Student/ });
    expect(within(row).getByText("In progress (1/4)")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("XP")).not.toBeInTheDocument();
    expect(screen.queryByText("Sync state")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Cohort"), "cohort-2");
    expect(await screen.findByText("No students in this cohort report.")).toBeInTheDocument();
    expect(reports.listLearners).toHaveBeenLastCalledWith({ cohortId: "cohort-2" });
  });
  it("reports failures instead of showing empty data, and retries", async () => {
    vi.mocked(reports.listLearners).mockRejectedValueOnce(new ApiError("FORBIDDEN", 403));
    dashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("permission");
    expect(screen.queryByText("No students in this cohort report.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Test Student")).toBeInTheDocument();
  });
  it("handles no cohorts and an empty learner module report", async () => {
    state.staff.listCohorts.mockResolvedValue([]);
    const view = dashboard();
    expect(await screen.findByText("No cohorts available.")).toBeInTheDocument();
    expect(reports.listLearners).not.toHaveBeenCalled();
    view.unmount();
    vi.mocked(reports.getLearnerReport).mockResolvedValue({ ...learner, modules: [] });
    render(<MemoryRouter initialEntries={["/trainer/learners/learner-1"]}><Routes><Route path="/trainer/learners/:learnerId" element={<LiveTrainerLearnerDetail reports={reports} />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("No module results reported.")).toBeInTheDocument();
    expect(screen.getByText(/cannot see work/)).toBeInTheDocument();
  });
});
