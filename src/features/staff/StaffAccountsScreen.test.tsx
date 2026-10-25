import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffAccountsScreen } from "./StaffAccountsScreen";

const state = vi.hoisted(() => ({ role: "trainer", gateway: { listStaffAccounts: vi.fn(), createStaffAccount: vi.fn() } }));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: { role: state.role } }) }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.gateway }));
vi.mock("../../services/integration/runtimeConfig", () => ({ readFrontendRuntimeConfig: () => ({ mode: "mock" }) }));

describe("staff account screen", () => {
  beforeEach(() => { state.gateway.listStaffAccounts.mockReset().mockResolvedValue([]); state.gateway.createStaffAccount.mockReset(); });
  it("blocks trainers without requesting the account list", () => {
    state.role = "trainer";
    render(<MemoryRouter><StaffAccountsScreen /></MemoryRouter>);
    expect(screen.getByText(/does not have access/)).toBeVisible();
    expect(state.gateway.listStaffAccounts).not.toHaveBeenCalled();
  });
  it("limits admin account creation to trainers and identifies mock mode", async () => {
    state.role = "admin";
    render(<MemoryRouter><StaffAccountsScreen /></MemoryRouter>);
    expect(screen.getByText(/Demo mode: account changes are mock-only/)).toBeVisible();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Trainer"]);
    await waitFor(() => expect(screen.getByText("No accounts yet.")).toBeVisible());
  });
});
