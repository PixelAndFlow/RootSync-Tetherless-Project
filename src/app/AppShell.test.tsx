import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "./AppShell";

const state = vi.hoisted(() => ({ mode: "integration" }));
vi.mock("../services/integration/runtimeConfig", () => ({ readFrontendRuntimeConfig: () => ({ mode: state.mode }) }));
vi.mock("./providers/LearnerProfileProvider", () => ({ useLearnerProfile: () => ({ profile: null, resetProfile: vi.fn() }) }));
vi.mock("./providers/SyncStatusProvider", () => ({ useSyncStatus: () => ({ summary: { status: "synced", pendingEventCount: 0 } }) }));
beforeEach(() => { state.mode = "integration"; });

it("describes live local saving and sync honestly without a demo reset control", () => {
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  expect(screen.getByText("Live API mode.")).toBeVisible();
  expect(screen.queryByText(/data and sync are simulated/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reset local demo" })).not.toBeInTheDocument();
});
it("preserves the Trainer navigation selection at shared sign-in", () => {
  render(<MemoryRouter initialEntries={["/staff/sign-in?next=/trainer"]}><AppShell /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "Trainer" })).toHaveClass("app-nav-link-active");
  expect(screen.getByRole("link", { name: "Trainer" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Staff" })).toHaveClass("app-nav-link-inactive");
  expect(screen.getByRole("link", { name: "Staff" })).not.toHaveAttribute("aria-current", "page");
});
it("keeps mock mode clearly labelled", () => {
  state.mode = "mock";
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  expect(screen.getByText("Demo preview.")).toBeVisible();
});
