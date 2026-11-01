import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/api/ApiError";
import { MockStaffAdminGateway } from "../../services/staff/MockStaffAdminGateway";
import { StaffLearnerDetailScreen } from "./StaffLearnerDetailScreen";

const ALL_PERMISSIONS = ["learner.edit", "learner.archive", "learner.setup_code", "device.revoke", "data.purge"];
const state = vi.hoisted(() => ({ gateway: null as unknown, session: { role: "admin", displayName: "Tester", permissions: [] as string[] } }));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: state.session, signOut: vi.fn() }) }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.gateway }));

const show = (learnerId = "student-demo-001") => {
  const router = createMemoryRouter(
    [{ path: "/staff/operations/learners/:learnerId", element: <StaffLearnerDetailScreen /> }],
    { initialEntries: [`/staff/operations/learners/${learnerId}`] },
  );
  return render(<RouterProvider router={router} />);
};

describe("issue #39: StaffLearnerDetailScreen", () => {
  let gateway: MockStaffAdminGateway;
  beforeEach(() => { gateway = new MockStaffAdminGateway(); state.gateway = gateway; state.session.permissions = [...ALL_PERMISSIONS]; });
  afterEach(() => { state.session.permissions = []; });

  it("loads the learner and their devices, read-only without permissions", async () => {
    state.session.permissions = [];
    show();
    expect(await screen.findByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Archive student/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Issue a new setup code")).not.toBeInTheDocument();
  });

  it("shows a load error and can retry", async () => {
    vi.spyOn(gateway, "getLearnerRecord").mockRejectedValueOnce(new ApiError("NOT_FOUND", 404));
    show();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
  });

  it("edits and saves fields, surfacing a validation error", async () => {
    show();
    await screen.findByRole("heading", { name: "Alex Rivera" });
    const phone = screen.getByLabelText("Phone");
    await userEvent.clear(phone);
    await userEvent.type(phone, "555-0100");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();

    // "test@localhost" passes the native type="email" input's own (looser, no-TLD-required)
    // constraint validation, so the submit event still fires; it still fails the mock's
    // stricter EMAIL_PATTERN (requires a dot), which is what this test means to exercise.
    const email = screen.getByLabelText("Email");
    await userEvent.type(email, "test@localhost");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("issues a new setup code, optionally switching off existing phones, and reveals it once", async () => {
    show();
    await screen.findByRole("heading", { name: "Alex Rivera" });
    await userEvent.click(screen.getByLabelText("Switch off this student's existing phones first"));
    await userEvent.click(screen.getByRole("button", { name: "Issue setup code" }));
    expect(await screen.findByText("1 existing phone switched off.")).toBeInTheDocument();
    expect(screen.getByText(/^DEMO-/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText(/^DEMO-/)).not.toBeInTheDocument();
  });

  it("switches off an individual active device", async () => {
    show("student-demo-002");
    await screen.findByRole("heading", { name: "Jordan Lee" });
    const switchOff = await screen.findByRole("button", { name: "Switch off" });
    await userEvent.click(switchOff);
    expect(await screen.findByText(/Switched off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch off" })).not.toBeInTheDocument();
  });

  it("archives the student through a confirmation dialog", async () => {
    const archive = vi.spyOn(gateway, "archiveLearner");
    show();
    await screen.findByRole("heading", { name: "Alex Rivera" });
    await userEvent.click(screen.getByRole("button", { name: "Archive student" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Archive student" });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(archive).toHaveBeenCalledWith("student-demo-001");
    expect(await screen.findByText("Archived")).toBeInTheDocument();
  });

  it("requires typing the exact learner code before purge is enabled, then permanently deletes", async () => {
    show();
    await screen.findByRole("heading", { name: "Alex Rivera" });
    const purgeButton = screen.getByRole("button", { name: "Permanently delete" });
    expect(purgeButton).toBeDisabled();
    const input = screen.getByPlaceholderText("RCYC-PR-Bootcamp2026-0001");
    await userEvent.type(input, "wrong-code");
    expect(purgeButton).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "RCYC-PR-Bootcamp2026-0001");
    expect(purgeButton).toBeEnabled();
    await userEvent.click(purgeButton);
    expect(await screen.findByText("Student deleted")).toBeInTheDocument();
  });
});
