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

  it("cancels with Escape and restores focus to the triggering action", () => {
    const onCancel = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    const { unmount } = render(<ConfirmationDialog confirmLabel="Archive Student" detail="This is a protected action." onCancel={onCancel} onConfirm={vi.fn()} returnFocusTo={trigger} title="Archive Alex?" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
