import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusChip } from "./StatusChip";
import type { SyncStatus } from "../../types/learning";

const expectedCopy: Record<SyncStatus, string> = {
  offline: "Offline · saved locally",
  pending: "Waiting to sync",
  syncing: "Syncing",
  synced: "Saved locally",
  retryable_error: "Sync retry available",
  rejected: "Sync needs review",
};

describe("StatusChip", () => {
  it.each(Object.entries(expectedCopy) as [SyncStatus, string][])("announces the %s state clearly", (status, label) => {
    const { container } = render(<StatusChip status={status} />);
    const chip = within(container).getByRole("status");
    expect(chip).toHaveTextContent(label);
    expect(chip).toHaveAttribute("aria-live", "polite");
  });
});
