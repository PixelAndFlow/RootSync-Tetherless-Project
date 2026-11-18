import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { StaffSession } from "../../types/staff";
import { useStaffAdminGateway } from "./GatewayProvider";

interface StaffSessionContextValue {
  session: StaffSession | null;
  signIn: (input: { username: string; password: string }) => Promise<StaffSession>;
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<StaffSession>;
  signOut: () => Promise<void>;
}

const StaffSessionContext = createContext<StaffSessionContextValue | null>(null);

/** Session state only. Production staff-token storage stays in Marc's approved adapter, not this demo provider. */
export function StaffSessionProvider({ children }: { children: React.ReactNode }) {
  const gateway = useStaffAdminGateway();
  const [session, setSession] = useState<StaffSession | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Issue #58: me() existed with no caller, so a permission change made
  // elsewhere (another admin, another tab) never reached an already-open
  // session here. Refresh on return to the tab — same "came back visible"
  // pattern useModuleCatalog/SyncStatusProvider already use — rather than
  // polling. Best-effort: a failed refresh (offline, expired token) leaves
  // the current session as-is; the next gated action's own 401/403 is what
  // actually surfaces an invalid session.
  useEffect(() => {
    if (!gateway) return;
    const refresh = () => {
      if (document.visibilityState !== "visible" || !sessionRef.current) return;
      void gateway.me().then(setSession).catch(() => {});
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [gateway]);

  const value = useMemo<StaffSessionContextValue>(() => ({
    session,
    signIn: async (input) => { const next = await gateway?.login(input); if (!next) throw new Error("Staff sign-in is not connected."); setSession(next); return next; },
    changePassword: async (input) => { const next = await gateway?.changePassword(input); if (!next) throw new Error("Staff password change is not connected."); setSession(next); return next; },
    signOut: async () => { try { await gateway?.logout(); } finally { setSession(null); } },
  }), [gateway, session]);
  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

export function useStaffSession(): StaffSessionContextValue {
  const value = useContext(StaffSessionContext);
  if (!value) throw new Error("useStaffSession must be used inside StaffSessionProvider.");
  return value;
}
