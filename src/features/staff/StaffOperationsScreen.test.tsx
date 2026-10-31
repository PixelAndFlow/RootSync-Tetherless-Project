import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/api/ApiError";
import { MockStaffAdminGateway } from "../../services/staff/MockStaffAdminGateway";
import { StaffOperationsScreen } from "./StaffOperationsScreen";
import { StaffDashboardScreen } from "./StaffDashboardScreen";

const state = vi.hoisted(() => ({ gateway: null as unknown, session: { role: "admin", displayName: "Tester", permissions: ["staff.create_trainer"] } }));
vi.mock("../../app/providers/StaffSessionProvider", () => ({ useStaffSession: () => ({ session: state.session, signOut: vi.fn() }) }));
vi.mock("../../app/providers/GatewayProvider", () => ({ useStaffAdminGateway: () => state.gateway }));
vi.mock("../../services/integration/runtimeConfig", () => ({ readFrontendRuntimeConfig: () => ({ mode: "integration" }) }));
const show = (component: React.ReactNode) => {
  const router = createMemoryRouter([{ path: "/", element: component }, { path: "/staff", element: <p>Staff dashboard destination</p> }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
};

describe("live staff operations", () => {
  let gateway: MockStaffAdminGateway;
  beforeEach(() => { gateway = new MockStaffAdminGateway(); state.gateway = gateway; });
  afterEach(() => vi.unstubAllGlobals());
  it("shows a dashboard error instead of zero counts and retries", async () => {
    vi.spyOn(gateway, "listModules").mockRejectedValueOnce(new ApiError("FORBIDDEN", 403));
    show(<StaffDashboardScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent("permission");
    expect(screen.queryByText("Cohorts")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Cohorts")).toBeInTheDocument();
  });
  it("shows an empty cohort without allowing creation", async () => {
    vi.spyOn(gateway, "listCohorts").mockResolvedValue([]);
    show(<StaffOperationsScreen />);
    expect(await screen.findByText("No cohorts available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Student/ })).toBeDisabled();
  });
  it("preserves the one-time code and refreshes the student list", async () => {
    const create = vi.spyOn(gateway, "createLearner").mockResolvedValue({ learnerId: "student", setupCode: "ONCE-123", shownOnce: true });
    show(<StaffOperationsScreen />);
    await screen.findByText("Alex Rivera");
    await userEvent.type(screen.getByLabelText("First name"), "Test");
    await userEvent.type(screen.getByLabelText("Last name"), "Student");
    await userEvent.click(screen.getByRole("button", { name: /Create Student/ }));
    expect(await screen.findByText("ONCE-123")).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Create Student/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("ONCE-123")).not.toBeInTheDocument();
  });
  it("warns when creation is interrupted and does not retry automatically", async () => {
    const create = vi.spyOn(gateway, "createLearner").mockRejectedValue(new ApiError("NETWORK_ERROR"));
    show(<StaffOperationsScreen />);
    await screen.findByText("Alex Rivera");
    await userEvent.type(screen.getByLabelText("First name"), "Test");
    await userEvent.type(screen.getByLabelText("Last name"), "Student");
    await userEvent.click(screen.getByRole("button", { name: /Create Student/ }));
    expect(await screen.findByText(/may have been created/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Student/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Check student list" }));
    await screen.findByText(/Review the student list above/);
    expect(screen.getByRole("button", { name: /Create Student/ })).toBeDisabled();
    expect(create).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "I checked; allow another attempt" }));
    expect(screen.getByRole("button", { name: /Create Student/ })).toBeEnabled();
  });
  it("requires a successful list refresh and offers a safe outcome when the student exists", async () => {
    const create = vi.spyOn(gateway, "createLearner").mockRejectedValue(new ApiError("NETWORK_ERROR"));
    show(<StaffOperationsScreen />);
    await screen.findByText("Alex Rivera");
    await userEvent.type(screen.getByLabelText("First name"), "Test");
    await userEvent.type(screen.getByLabelText("Last name"), "Student");
    await userEvent.click(screen.getByRole("button", { name: /Create Student/ }));
    await screen.findByText(/may have been created/);
    vi.spyOn(gateway, "listLearnerRecords").mockRejectedValueOnce(new ApiError("NETWORK_ERROR"));
    await userEvent.click(screen.getByRole("button", { name: "Check student list" }));
    expect(await screen.findByText("Students could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I checked; allow another attempt" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Student/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Check student list" }));
    await userEvent.click(await screen.findByRole("button", { name: "Student already exists" }));
    expect(screen.getByLabelText("First name")).toHaveValue("");
    expect(screen.getByRole("button", { name: /Create Student/ })).toBeDisabled();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("warns before leaving with an unsaved setup code and allows staying or leaving", async () => {
    // Node's Request rejects jsdom's AbortSignal; navigation doesn't need it in this test.
    const NativeRequest = Request;
    vi.stubGlobal("Request", class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        const { signal: _signal, ...rest } = init ?? {};
        super(input, rest);
      }
    });
    vi.spyOn(gateway, "createLearner").mockResolvedValue({ learnerId: "student", setupCode: "ONCE-123", shownOnce: true });
    show(<StaffOperationsScreen />);
    await screen.findByText("Alex Rivera");
    await userEvent.type(screen.getByLabelText("First name"), "Test");
    await userEvent.type(screen.getByLabelText("Last name"), "Student");
    await userEvent.click(screen.getByRole("button", { name: /Create Student/ }));
    await screen.findByText("ONCE-123");
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await userEvent.click(screen.getByRole("link", { name: /Staff dashboard/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("setup code");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("ONCE-123")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /Staff dashboard/ }));
    await userEvent.click(screen.getByRole("button", { name: "Leave screen" }));
    expect(await screen.findByText("Staff dashboard destination")).toBeInTheDocument();
  });
  it("keeps the user on the page while creation is in flight", async () => {
    let finish!: (value: { learnerId: string; setupCode: string; shownOnce: true }) => void;
    vi.spyOn(gateway, "createLearner").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    show(<StaffOperationsScreen />);
    await screen.findByText("Alex Rivera");
    await userEvent.type(screen.getByLabelText("First name"), "Test");
    await userEvent.type(screen.getByLabelText("Last name"), "Student");
    await userEvent.click(screen.getByRole("button", { name: /Create Student/ }));
    await userEvent.click(screen.getByRole("link", { name: /Staff dashboard/ }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Wait for the result");
    finish({ learnerId: "student", setupCode: "ONCE-123", shownOnce: true });
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("setup code"));
  });
});

describe("staff-account and system-control link visibility follows permissions, not role", () => {
  let gateway: MockStaffAdminGateway;
  beforeEach(() => { gateway = new MockStaffAdminGateway(); state.gateway = gateway; });
  afterEach(() => { state.session.permissions = ["staff.create_trainer"]; });

  it("hides both links on the dashboard with no staff/system permissions", async () => {
    state.session.permissions = [];
    show(<StaffDashboardScreen />);
    await screen.findByText("Cohorts");
    expect(screen.queryByRole("link", { name: "Staff accounts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "System controls" })).not.toBeInTheDocument();
  });

  it("shows Staff accounts but not System controls on the dashboard with staff.create_trainer only", async () => {
    state.session.permissions = ["staff.create_trainer"];
    show(<StaffDashboardScreen />);
    await screen.findByText("Cohorts");
    expect(screen.getByRole("link", { name: "Staff accounts" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "System controls" })).not.toBeInTheDocument();
  });

  it("shows System controls on the dashboard with settings.manage", async () => {
    state.session.permissions = ["settings.manage"];
    show(<StaffDashboardScreen />);
    await screen.findByText("Cohorts");
    expect(screen.getByRole("link", { name: "System controls" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Staff accounts" })).not.toBeInTheDocument();
  });

  it("hides the Staff accounts panel on the operations screen with no staff/system permissions", async () => {
    state.session.permissions = [];
    show(<StaffOperationsScreen />);
    await screen.findByText("Alex Rivera");
    expect(screen.queryByRole("heading", { name: "Staff accounts" })).not.toBeInTheDocument();
  });

  it("shows the Staff accounts panel, with the system-control scope link gated separately, on the operations screen", async () => {
    state.session.permissions = ["staff.create_trainer"];
    show(<StaffOperationsScreen />);
    await screen.findByText("Alex Rivera");
    expect(screen.getByRole("heading", { name: "Staff accounts" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "View system-control scope" })).not.toBeInTheDocument();
    state.session.permissions = ["staff.create_trainer", "settings.manage"];
    show(<StaffOperationsScreen />);
    await screen.findAllByText("Alex Rivera");
    expect(screen.getByRole("link", { name: "View system-control scope" })).toBeVisible();
  });
});
