import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffAccountsScreen } from "./StaffAccountsScreen";

const state = vi.hoisted(() => ({ permissions: [] as string[], staffId: "self-1", gateway: { listStaff: vi.fn(), createStaff: vi.fn(), resetStaffAccountPassword: vi.fn(), setStaffDisabled: vi.fn() } }));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: { permissions: state.permissions, staffId: state.staffId } }) }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.gateway }));
vi.mock("../../services/integration/runtimeConfig", () => ({ readFrontendRuntimeConfig: () => ({ mode: "mock" }) }));

describe("staff account screen", () => {
  beforeEach(() => { state.staffId = "self-1"; state.gateway.listStaff.mockReset().mockResolvedValue([]); state.gateway.createStaff.mockReset(); state.gateway.resetStaffAccountPassword.mockReset(); state.gateway.setStaffDisabled.mockReset(); });
  it("blocks a trainer with no staff-management permission, without requesting the account list", () => {
    state.permissions = [];
    render(<MemoryRouter><StaffAccountsScreen /></MemoryRouter>);
    expect(screen.getByText(/does not have access/)).toBeVisible();
    expect(state.gateway.listStaff).not.toHaveBeenCalled();
  });
  it("limits admin account creation to trainers and identifies mock mode", async () => {
    state.permissions = ["staff.create_trainer"];
    render(<MemoryRouter><StaffAccountsScreen /></MemoryRouter>);
    expect(screen.getByText(/Demo mode: account changes are mock-only/)).toBeVisible();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Trainer"]);
    await waitFor(() => expect(screen.getByText("No accounts yet.")).toBeVisible());
  });
  it("offers Reset password only for accounts the signed-in staff member can manage, and reveals a new one-time password", async () => {
    state.permissions = ["staff.create_trainer"];
    state.gateway.listStaff.mockResolvedValue([
      { staffId: "trainer-1", username: "t1", displayName: "Trainer One", role: "trainer", disabled: false, createdAt: "2026-01-01" },
      { staffId: "admin-1", username: "a1", displayName: "Admin One", role: "admin", disabled: false, createdAt: "2026-01-01" },
    ]);
    render(<MemoryRouter><StaffAccountsScreen /></MemoryRouter>);
    await screen.findByText("Trainer One");
    expect(screen.getAllByRole("button", { name: "Reset password" })).toHaveLength(1);

    state.gateway.resetStaffAccountPassword.mockResolvedValue({
      account: { staffId: "trainer-1", username: "t1", displayName: "Trainer One", role: "trainer", disabled: false, createdAt: "2026-01-01" },
      temporaryPassword: "ONE-TIME-RESET-16",
      shownOnce: true,
    });
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(state.gateway.resetStaffAccountPassword).toHaveBeenCalledWith("trainer-1");
    expect(await screen.findByText("ONE-TIME-RESET-16")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("ONE-TIME-RESET-16")).not.toBeInTheDocument();
  });

  it("issue #41: disables an account only after confirmation, and re-enables it with a direct click", async () => {
    state.permissions = ["staff.create_trainer"];
    state.gateway.listStaff.mockResolvedValue([{ staffId: "trainer-1", username: "t1", displayName: "Trainer One", role: "trainer", disabled: false, createdAt: "2026-01-01" }]);
    render(<MemoryRouter><StaffAccountsScreen /></MemoryRouter>);
    await screen.findByText("Trainer One");

    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(state.gateway.setStaffDisabled).not.toHaveBeenCalled(); // confirmation dialog first
    expect(screen.getByRole("heading", { name: "Disable Trainer One?" })).toBeVisible();

    state.gateway.listStaff.mockResolvedValue([{ staffId: "trainer-1", username: "t1", displayName: "Trainer One", role: "trainer", disabled: true, createdAt: "2026-01-01" }]);
    await userEvent.click(screen.getByRole("button", { name: "Disable account" }));
    expect(state.gateway.setStaffDisabled).toHaveBeenCalledWith("trainer-1", true);
    expect(await screen.findByRole("button", { name: "Enable" })).toBeVisible();

    state.gateway.listStaff.mockResolvedValue([{ staffId: "trainer-1", username: "t1", displayName: "Trainer One", role: "trainer", disabled: false, createdAt: "2026-01-01" }]);
    await userEvent.click(screen.getByRole("button", { name: "Enable" })); // no confirmation needed to restore access
    expect(state.gateway.setStaffDisabled).toHaveBeenCalledWith("trainer-1", false);
    expect(await screen.findByRole("button", { name: "Disable" })).toBeVisible();
  });

  it("issue #41: never offers to disable the signed-in staff member's own account", async () => {
    state.permissions = ["staff.create_trainer", "staff.create_admin"];
    state.staffId = "admin-1";
    state.gateway.listStaff.mockResolvedValue([{ staffId: "admin-1", username: "a1", displayName: "Current Admin", role: "admin", disabled: false, createdAt: "2026-01-01" }]);
    render(<MemoryRouter><StaffAccountsScreen /></MemoryRouter>);
    await screen.findByText("Current Admin");
    expect(screen.queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();
  });
});
