import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { GatewayProvider } from "./GatewayProvider";
import { StaffSessionProvider, useStaffSession } from "./StaffSessionProvider";
import { createMockGateways } from "../../services/gateways";

afterEach(() => { vi.restoreAllMocks(); });

function SessionControls() {
  const { session, signIn, signOut } = useStaffSession();
  return <><p>{session ? "Signed in" : "Signed out"}</p><button onClick={() => void signIn({ username: "demo", password: "demo-password-123" })}>Sign in</button><button onClick={() => void signOut()}>Sign out</button></>;
}

it("clears the gateway session when signing out", async () => {
  const gateways = createMockGateways();
  const logout = vi.spyOn(gateways.staffAdmin!, "logout");
  render(<GatewayProvider gateways={gateways}><StaffSessionProvider><SessionControls /></StaffSessionProvider></GatewayProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Signed in")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(logout).toHaveBeenCalledOnce();
});

it("issue #58: refreshes the session with me() when the tab becomes visible again, picking up a permission change", async () => {
  const gateways = createMockGateways();
  const me = vi.spyOn(gateways.staffAdmin!, "me");
  render(<GatewayProvider gateways={gateways}><StaffSessionProvider><SessionControls /></StaffSessionProvider></GatewayProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Signed in")).toBeInTheDocument();
  me.mockClear();

  me.mockResolvedValueOnce({ staffId: "admin-demo-001", username: "admin", displayName: "Demo Admin", role: "admin", permissions: ["results.view"], passwordChangeRequired: false });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
  expect(me).toHaveBeenCalledOnce();
});

it("issue #58: does not refresh while the tab is hidden, or once signed out", async () => {
  const gateways = createMockGateways();
  const me = vi.spyOn(gateways.staffAdmin!, "me");
  render(<GatewayProvider gateways={gateways}><StaffSessionProvider><SessionControls /></StaffSessionProvider></GatewayProvider>);

  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(me).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Signed in");
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  me.mockClear();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(me).not.toHaveBeenCalled();
});
