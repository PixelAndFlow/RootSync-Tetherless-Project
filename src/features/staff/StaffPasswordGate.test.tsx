import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { StaffPasswordGate } from "./StaffPasswordGate";

const state = vi.hoisted(() => ({ required: true }));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: { passwordChangeRequired: state.required } }) }));

describe("staff password gate", () => {
  it("redirects protected staff pages when a password change is required", () => {
    state.required = true;
    render(<MemoryRouter initialEntries={["/staff/accounts"]}><Routes><Route path="/staff/accounts" element={<StaffPasswordGate><p>Account management</p></StaffPasswordGate>} /><Route path="/staff/change-password" element={<p>Change password required</p>} /></Routes></MemoryRouter>);
    expect(screen.getByText("Change password required")).toBeVisible();
    expect(screen.queryByText("Account management")).not.toBeInTheDocument();
  });
  it("allows access after the password change", () => {
    state.required = false;
    render(<MemoryRouter initialEntries={["/staff/accounts"]}><StaffPasswordGate><p>Account management</p></StaffPasswordGate></MemoryRouter>);
    expect(screen.getByText("Account management")).toBeVisible();
  });
});
