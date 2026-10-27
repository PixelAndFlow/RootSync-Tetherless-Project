import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { GatewayProvider } from "./GatewayProvider";
import { StaffSessionProvider, useStaffSession } from "./StaffSessionProvider";
import { createMockGateways } from "../../services/gateways";

function SessionControls() {
  const { session, signIn, signOut } = useStaffSession();
  return <><p>{session ? "Signed in" : "Signed out"}</p><button onClick={() => void signIn({ username: "demo", password: "demo-password-123" })}>Sign in</button><button onClick={signOut}>Sign out</button></>;
}

it("clears the gateway session when signing out", async () => {
  const gateways = createMockGateways();
  const signOut = vi.spyOn(gateways.staffAdmin!, "signOut");
  render(<GatewayProvider gateways={gateways}><StaffSessionProvider><SessionControls /></StaffSessionProvider></GatewayProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Signed in")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(screen.getByText("Signed out")).toBeInTheDocument();
  expect(signOut).toHaveBeenCalledOnce();
});
