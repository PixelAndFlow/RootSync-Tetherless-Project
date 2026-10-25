import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "./PageState";

describe("PageState", () => {
  it("renders loading, empty, and error guidance with safe return actions", () => {
    render(<MemoryRouter><LoadingState label="Loading local record" /><EmptyState actionLabel="Return to mission" actionTo="/learner/missions/demo/play" detail="Finish the mission first." title="No result yet" /><ErrorState actionLabel="Return to missions" actionTo="/learner/missions" detail="The fixture could not load." title="Mission unavailable" /></MemoryRouter>);

    expect(screen.getByText("Loading local record")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("heading", { name: "No result yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to mission" })).toHaveAttribute("href", "/learner/missions/demo/play");
    expect(screen.getByRole("heading", { name: "Mission unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Mission unavailable").closest("section")).toHaveAttribute("aria-live", "assertive");
  });
});
