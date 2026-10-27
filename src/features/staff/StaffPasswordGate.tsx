import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";

/** UX guard only; the server must enforce authentication and authorization. */
export function StaffPasswordGate({ children }: { children: ReactNode }) {
  const { session } = useStaffSession();
  if (session?.passwordChangeRequired) return <Navigate replace to="/staff/change-password" />;
  return children;
}
