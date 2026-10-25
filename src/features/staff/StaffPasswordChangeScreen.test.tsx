import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffPasswordChangeScreen } from "./StaffPasswordChangeScreen";

const changePassword = vi.fn();
vi.mock("../../app/providers/StaffSessionProvider", () => ({
  useStaffSession: () => ({ session: { passwordChangeRequired: true }, changePassword }),
}));

describe("staff password confirmation", () => {
  beforeEach(() => { changePassword.mockReset(); });

  it("blocks mismatched passwords and submits only the matching new password", async () => {
    const user = userEvent.setup();
    changePassword.mockResolvedValue({});
    render(<MemoryRouter initialEntries={["/change"]}><Routes><Route path="/change" element={<StaffPasswordChangeScreen />} /><Route path="/staff" element={<p>Staff home</p>} /></Routes></MemoryRouter>);
    await user.type(screen.getByLabelText("Temporary password"), "temporary-password");
    await user.type(screen.getByLabelText("New password", { exact: true }), "new-password-123");
    await user.type(screen.getByLabelText("Confirm new password"), "different-password");
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(screen.getByRole("button", { name: "Save new password" })).toBeDisabled();
    expect(changePassword).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-123");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(changePassword).toHaveBeenCalledOnce();
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: "temporary-password", newPassword: "new-password-123" });
    expect(await screen.findByText("Staff home")).toBeVisible();
  });
});
