import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { StaffSessionProvider } from "../../app/providers/StaffSessionProvider";
import { StaffSignInScreen } from "./StaffSignInScreen";
import { StaffPasswordChangeScreen } from "./StaffPasswordChangeScreen";
import { StaffPermissionScreen } from "./StaffPermissionScreen";

function renderRoutes(initialEntry: string) {
  return render(<MemoryRouter initialEntries={[initialEntry]}><GatewayProvider><StaffSessionProvider><Routes><Route path="/staff/sign-in" element={<StaffSignInScreen />} /><Route path="/staff/change-password" element={<StaffPasswordChangeScreen />} /><Route path="/staff" element={<><Link to="/staff/accounts">Accounts</Link><Link to="/staff/system">System</Link></>} /><Route path="/staff/accounts" element={<StaffPermissionScreen permission="staff" />} /><Route path="/staff/system" element={<StaffPermissionScreen permission="system" />} /></Routes></StaffSessionProvider></GatewayProvider></MemoryRouter>);
}

/** The "admin" demo account requires a one-time password change (MockStaffAdminGateway); handle it if it shows up. */
async function signIn(username: string) {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "demo-password-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(screen.queryByLabelText("Username")).not.toBeInTheDocument());
  if (screen.queryByLabelText("Temporary password")) {
    fireEvent.change(screen.getByLabelText("Temporary password"), { target: { value: "demo-password-123" } });
    fireEvent.change(screen.getByLabelText("New password", { exact: true }), { target: { value: "replacement-password-123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "replacement-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
  }
  await screen.findByRole("link", { name: "System" });
}

describe("staff role routes", () => {
  it("redirects an unauthenticated direct route to staff sign-in", () => {
    renderRoutes("/staff/system");
    expect(screen.getByRole("heading", { name: "Sign in to Tetherless" })).toBeVisible();
  });

  it("shows a clear access explanation when a Trainer opens a protected direct route", async () => {
    renderRoutes("/staff/sign-in");
    await signIn("trainer");
    fireEvent.click(screen.getByRole("link", { name: "System" }));
    expect(await screen.findByRole("heading", { name: /does not have access/i })).toBeVisible();
  });

  it("denies a Trainer staff-account access too — it isn't just the system route", async () => {
    renderRoutes("/staff/sign-in");
    await signIn("trainer");
    fireEvent.click(screen.getByRole("link", { name: "Accounts" }));
    expect(await screen.findByRole("heading", { name: /does not have access/i })).toBeVisible();
  });

  it("lets an Admin manage staff accounts but still denies system controls", async () => {
    renderRoutes("/staff/sign-in");
    await signIn("admin");
    fireEvent.click(screen.getByRole("link", { name: "Accounts" }));
    expect(await screen.findByRole("heading", { name: "Staff account management" })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: /Staff dashboard/ }));
    fireEvent.click(screen.getByRole("link", { name: "System" }));
    expect(await screen.findByRole("heading", { name: /does not have access/i })).toBeVisible();
  });

  it("gives a SuperAdmin both staff-account and system-control access", async () => {
    renderRoutes("/staff/sign-in");
    await signIn("demo");
    fireEvent.click(screen.getByRole("link", { name: "Accounts" }));
    expect(await screen.findByRole("heading", { name: "Staff account management" })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: /Staff dashboard/ }));
    fireEvent.click(screen.getByRole("link", { name: "System" }));
    expect(await screen.findByRole("heading", { name: "System control center" })).toBeVisible();
  });
});
