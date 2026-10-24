import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "./ConfirmationDialog";

describe("ConfirmationDialog", () => {
  it("exposes a labelled modal and requires an explicit destructive confirmation", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmationDialog confirmLabel="Archive Student" detail="This is a protected action." onCancel={onCancel} onConfirm={onConfirm} title="Archive Alex?" />);
    expect(screen.getByRole("dialog", { name: "Archive Alex?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Archive Student" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
