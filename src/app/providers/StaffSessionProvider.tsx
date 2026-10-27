import { createContext, useContext, useMemo, useState } from "react";
import type { StaffSession } from "../../types/staff";
import { useStaffAdminGateway } from "./GatewayProvider";

interface StaffSessionContextValue {
  session: StaffSession | null;
  signIn: (input: { username: string; password: string }) => Promise<StaffSession>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<StaffSession>;
  signOut: () => void;
}

const StaffSessionContext = createContext<StaffSessionContextValue | null>(null);

/** Session state only. Production staff-token storage stays in Marc's approved adapter, not this demo provider. */
export function StaffSessionProvider({ children }: { children: React.ReactNode }) {
  const gateway = useStaffAdminGateway();
  const [session, setSession] = useState<StaffSession | null>(null);
  const value = useMemo<StaffSessionContextValue>(() => ({
    session,
    signIn: async (input) => { const next = await gateway?.signIn(input); if (!next) throw new Error("Staff sign-in is not connected."); setSession(next); return next; },
    changePassword: async (input) => { const next = await gateway?.changePassword(input); if (!next) throw new Error("Staff password change is not connected."); setSession(next); return next; },
    signOut: () => { gateway?.signOut(); setSession(null); },
  }), [gateway, session]);
  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

export function useStaffSession(): StaffSessionContextValue {
  const value = useContext(StaffSessionContext);
  if (!value) throw new Error("useStaffSession must be used inside StaffSessionProvider.");
  return value;
}
