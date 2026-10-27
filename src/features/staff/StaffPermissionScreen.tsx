import { Navigate, useLocation } from "react-router-dom";
import { AccessDenied } from "../../components/common/AccessDenied";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { ReturnLink } from "../../components/common/ReturnLink";

export function StaffPermissionScreen({ permission }: { permission: "staff" | "system" }) {
  const { session } = useStaffSession();
  const location = useLocation();
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  const allowed = permission === "staff" ? session.role !== "trainer" : session.role === "superadmin";
  if (!allowed) return <AccessDenied />;
  return <section className="mx-auto max-w-3xl ui-panel p-6 sm:p-10"><ReturnLink to="/staff">Staff dashboard</ReturnLink><p className="ui-eyebrow">{permission === "staff" ? "STAFF ACCOUNTS" : "SYSTEM CONTROLS"} · API PENDING</p><h1 className="mt-3 text-3xl font-bold">{permission === "staff" ? "Staff account management" : "System control center"}</h1><p className="mt-3 leading-7 text-slate-300">This protected route confirms the planned role boundary. Its server-backed actions will be connected only after staff authentication and authorization are finalized.</p><p className="mt-5 text-sm text-slate-400">Requested route: {location.pathname}</p></section>;
}
