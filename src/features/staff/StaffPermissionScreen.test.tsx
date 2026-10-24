import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { StaffSessionProvider } from "../../app/providers/StaffSessionProvider";
import { StaffSignInScreen } from "./StaffSignInScreen";
import { StaffPermissionScreen } from "./StaffPermissionScreen";

function renderRoutes(initialEntry: string) {
  return render(<MemoryRouter initialEntries={[initialEntry]}><GatewayProvider><StaffSessionProvider><Routes><Route path="/staff/sign-in" element={<StaffSignInScreen />} /><Route path="/staff" element={<><Link to="/staff/accounts">Accounts</Link><Link to="/staff/system">System</Link></>} /><Route path="/staff/accounts" element={<StaffPermissionScreen permission="staff" />} /><Route path="/staff/system" element={<StaffPermissionScreen permission="system" />} /></Routes></StaffSessionProvider></GatewayProvider></MemoryRouter>);
}

describe("staff role routes", () => {
  it("redirects an unauthenticated direct route to staff sign-in", () => {
    renderRoutes("/staff/system");
    expect(screen.getByRole("heading", { name: "Sign in to Tetherless" })).toBeVisible();
  });

  it("shows a clear access explanation when a Trainer opens a protected direct route", async () => {
    renderRoutes("/staff/sign-in");
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "trainer" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "demo-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("link", { name: "System" })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "System" }));
    expect(await screen.findByRole("heading", { name: /does not have access/i })).toBeVisible();
  });
});
