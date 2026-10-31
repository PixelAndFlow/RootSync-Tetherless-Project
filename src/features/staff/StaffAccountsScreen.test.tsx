import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffAccountsScreen } from "./StaffAccountsScreen";

const state = vi.hoisted(() => ({ permissions: [] as string[], gateway: { listStaffAccounts: vi.fn(), createStaffAccount: vi.fn(), resetStaffAccountPassword: vi.fn() } }));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: { permissions: state.permissions } }) }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.gateway }));
vi.mock("../../services/integration/runtimeConfig", () => ({ readFrontendRuntimeConfig: () => ({ mode: "mock" }) }));

describe("staff account screen", () => {
  beforeEach(() => { state.gateway.listStaffAccounts.mockReset().mockResolvedValue([]); state.gateway.createStaffAccount.mockReset(); state.gateway.resetStaffAccountPassword.mockReset(); });
  it("blocks a trainer with no staff-management permission, without requesting the account list", () => {
    state.permissions = [];
    render(<MemoryRouter><StaffAccountsScreen /></MemoryRouter>);
    expect(screen.getByText(/does not have access/)).toBeVisible();
    expect(state.gateway.listStaffAccounts).not.toHaveBeenCalled();
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
    state.gateway.listStaffAccounts.mockResolvedValue([
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
});
