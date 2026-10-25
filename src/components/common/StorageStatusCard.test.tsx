import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageStatusCard } from "./StorageStatusCard";

const originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");

function setStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, "storage", { configurable: true, value: storage });
}

afterEach(() => {
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
  else Reflect.deleteProperty(navigator, "storage");
});

describe("StorageStatusCard", () => {
  it("shows a browser-reported usage estimate without promising persistence", async () => {
    setStorage({ estimate: vi.fn().mockResolvedValue({ usage: 1_048_576, quota: 10_485_760 }) });
    render(<StorageStatusCard />);
    await waitFor(() => expect(screen.getByText(/Used by this site: 1.0 MB/)).toBeInTheDocument());
    expect(screen.getByText(/will be enabled only with the agreed DDIL adapter/)).toBeInTheDocument();
  });

  it("explains the fallback when the browser does not expose a storage estimate", async () => {
    setStorage(undefined);
    render(<StorageStatusCard />);
    await waitFor(() => expect(screen.getByText(/does not report a storage estimate/)).toBeInTheDocument());
  });
});
