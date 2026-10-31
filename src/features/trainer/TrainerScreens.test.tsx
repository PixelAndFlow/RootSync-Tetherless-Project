import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/api/ApiError";
import { MockTrainerDataGateway, MOCK_TRAINER_COHORT_ID } from "../../services/trainer/MockTrainerDataGateway";
import type { TrainerDataGateway } from "../../services/trainer/TrainerDataGateway";
import type { TrainerLearnerSummary, TrainerModuleDetail } from "../../types/trainer";
import { TrainerDashboardScreen } from "./TrainerDashboardScreen";
import { TrainerLearnerDetailScreen } from "./TrainerLearnerDetailScreen";

const state = vi.hoisted(() => ({
  mode: "integration" as "integration" | "mock",
  staff: { listCohorts: vi.fn() },
  trainerData: undefined as unknown as TrainerDataGateway,
  session: { session: { role: "trainer" } as { role: string } | null },
}));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => state.session }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.staff, useTrainerDataGateway: () => state.trainerData }));
vi.mock("../../services/integration/runtimeConfig", () => ({ readFrontendRuntimeConfig: () => ({ mode: state.mode }) }));

const learner: TrainerLearnerSummary = {
  learnerId: "learner-1", username: null, learnerCode: "TEST-1", firstName: "Test", lastName: "Student",
  moduleId: "module-1", moduleTitle: "Test module", completionStatus: "in_progress", currentMasteryPercent: 25,
  questionsAnswered: 1, questionsTotal: 4, initialMissedCount: 0, stillUnmasteredCount: 3, statusLabel: "not_started",
  strugglingReasons: [], attemptsAbandoned: 0, activeEngagementSeconds: 62, sessionCount: 1, lastSyncedAt: null,
  mayHaveUnsyncedWork: true, acceptedEventCount: 2, rejectedEventCount: 0, xp: 0, bestStreak: 0,
};
const detail: TrainerModuleDetail = {
  ...learner, contentVersion: 3, fullAttemptCount: 0, remediationRoundCount: 0, remediationAttempted: 0, remediationCorrected: 0,
  returnCount: 0, topicPerformance: [{ topic: "backups", masteredCount: 1, totalCount: 2 }], sectorPerformance: [], attempts: [],
  rejectedEventCount: 3, strugglingReasons: ["weak_topic:backups"], statusLabel: "struggling",
};
const cohorts = [{ cohortId: "cohort-1", name: "First cohort" }, { cohortId: "cohort-2", name: "Second cohort" }];

beforeEach(() => {
  state.mode = "integration";
  state.session = { session: { role: "trainer" } };
  state.staff.listCohorts.mockReset().mockResolvedValue(cohorts);
  state.trainerData = {
    listLearners: vi.fn().mockImplementation(async ({ cohortId }: { cohortId: string }) => cohortId === "cohort-1" ? [learner] : []),
    getLearnerModuleDetail: vi.fn().mockResolvedValue(detail),
    getModuleCohortSummary: vi.fn(),
  };
});
const dashboard = () => render(<MemoryRouter><Routes><Route path="/" element={<TrainerDashboardScreen />} /><Route path="/staff/sign-in" element={<p>sign-in page</p>} /></Routes></MemoryRouter>);
const detailPage = (path = "/trainer/learners/learner-1?module=module-1") => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/trainer/learners/:learnerId" element={<TrainerLearnerDetailScreen />} /><Route path="/staff/sign-in" element={<p>sign-in page</p>} /></Routes></MemoryRouter>);

it("does not request a demo module for a live detail link with no module selection", () => {
  detailPage("/trainer/learners/learner-1");
  expect(screen.getByRole("heading", { name: "Select a student module" })).toBeVisible();
  expect(state.trainerData.getLearnerModuleDetail).not.toHaveBeenCalled();
});

describe("trainer dashboard (connected to the API)", () => {
  it("shows partial work and switches between cohorts without XP or a sync-state column", async () => {
    dashboard();
    const row = await screen.findByRole("row", { name: /Test Student/ });
    expect(within(row).getByText("In progress (1/4)")).toBeInTheDocument();
    expect(within(row).getByText("25%")).toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("XP")).not.toBeInTheDocument();
    expect(screen.queryByText("Sync state")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Student results" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Cohort"), "cohort-2");
    expect(await screen.findByText("No students in this cohort report.")).toBeInTheDocument();
    expect(state.trainerData.listLearners).toHaveBeenLastCalledWith({ cohortId: "cohort-2" });
  });

  it("reports failures instead of showing empty data, and retries", async () => {
    vi.mocked(state.trainerData.listLearners).mockRejectedValueOnce(new ApiError("FORBIDDEN", 403));
    dashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("permission");
    expect(screen.queryByText("No students in this cohort report.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Test Student")).toBeInTheDocument();
  });

  it("handles no cohorts", async () => {
    state.staff.listCohorts.mockResolvedValue([]);
    dashboard();
    expect(await screen.findByText("No cohorts available.")).toBeInTheDocument();
    expect(state.trainerData.listLearners).not.toHaveBeenCalled();
  });

  it("keeps a learner with no module results in the table, without a link, with their event counts", async () => {
    vi.mocked(state.trainerData.listLearners).mockResolvedValue([{ ...learner, moduleId: "", moduleTitle: "", noModuleResults: true, acceptedEventCount: 5, rejectedEventCount: 2 }]);
    dashboard();
    const row = await screen.findByRole("row", { name: /Test Student/ });
    expect(within(row).getByText("No module results reported.")).toBeInTheDocument();
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/have events the server rejected|has events the server rejected/)).toBeInTheDocument();
  });

  it("links each row to that module's detail", async () => {
    dashboard();
    expect(await screen.findByRole("link", { name: "Test Student" })).toHaveAttribute("href", "/trainer/learners/learner-1?module=module-1");
  });

  it("sends a signed-out visitor to staff sign-in", async () => {
    state.session = { session: null };
    dashboard();
    expect(await screen.findByText("sign-in page")).toBeInTheDocument();
    expect(state.staff.listCohorts).not.toHaveBeenCalled();
  });
});

describe("trainer dashboard (fixture mode)", () => {
  beforeEach(() => {
    state.mode = "mock";
    state.session = { session: null };
    state.staff.listCohorts.mockResolvedValue([{ cohortId: MOCK_TRAINER_COHORT_ID, name: "RCYC-PR-Bootcamp2026" }]);
    state.trainerData = new MockTrainerDataGateway();
  });

  it("needs no sign-in and shows the fixture learners with the fixture wording", async () => {
    dashboard();
    expect(await screen.findByRole("heading", { name: /See learning signals/ })).toBeInTheDocument();
    expect(await screen.findByRole("row", { name: /Alex Rivera/ })).toBeInTheDocument();
    expect(screen.getByText(/FIXTURE DATA/)).toBeInTheDocument();
  });

  it("sorts, searches and filters the fixture learners", async () => {
    dashboard();
    await screen.findByRole("row", { name: /Alex Rivera/ });
    await userEvent.selectOptions(screen.getByLabelText("Sort Students"), "mastery_desc");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Sam Ortiz");
    await userEvent.click(screen.getByRole("button", { name: "In progress" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("row", { name: /Jordan Lee/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await userEvent.type(screen.getByLabelText("Search Students"), "nobody");
    expect(screen.getByText("No fixture Students match this filter.")).toBeInTheDocument();
  });
});

describe("trainer learner detail", () => {
  it("asks the gateway for the module in the link and shows the server's counts and the sync caveat", async () => {
    detailPage();
    expect(await screen.findByRole("heading", { name: "Test Student" })).toBeInTheDocument();
    expect(state.trainerData.getLearnerModuleDetail).toHaveBeenCalledWith("learner-1", "module-1");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText(/Flagged for support: weak topic: backups/)).toBeInTheDocument();
    expect(screen.getByText(/cannot see work that has not been sent/)).toBeInTheDocument();
    expect(screen.queryByText("XP")).not.toBeInTheDocument();
  });

  it("reports a failure and retries", async () => {
    vi.mocked(state.trainerData.getLearnerModuleDetail).mockRejectedValueOnce(new ApiError("NOT_FOUND", 404));
    detailPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Test Student" })).toBeInTheDocument();
  });

  it("sends a signed-out visitor to staff sign-in", async () => {
    state.session = { session: null };
    detailPage();
    expect(await screen.findByText("sign-in page")).toBeInTheDocument();
    expect(state.trainerData.getLearnerModuleDetail).not.toHaveBeenCalled();
  });
});
