import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import { STAFF_PERMISSION_SUMMARY, roleLabel, type StaffCohort, type StaffModule, type StaffStudent } from "../../types/staff";

export function StaffDashboardScreen() {
  const { session, signOut } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const [cohorts, setCohorts] = useState<StaffCohort[]>([]);
  const [students, setStudents] = useState<StaffStudent[]>([]);
  const [modules, setModules] = useState<StaffModule[]>([]);
  useEffect(() => { if (gateway && session) void Promise.all([gateway.listCohorts(), gateway.listStudents({}), gateway.listModules()]).then(([nextCohorts, nextStudents, nextModules]) => { setCohorts(nextCohorts); setStudents(nextStudents); setModules(nextModules); }); }, [gateway, session]);
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  const permissions = STAFF_PERMISSION_SUMMARY[session.role];
  return <section><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ui-eyebrow">{roleLabel(session.role)} · DEMO DATA</p><h1 className="mt-3 text-3xl font-bold">Welcome, {session.displayName}</h1><p className="mt-3 max-w-2xl text-slate-300">Role-aware staff screens are ready for Marc’s staff API. Current counts and actions use mock data only.</p></div><button className="ui-action-secondary" onClick={signOut} type="button">Sign out</button></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-3"><article className="ui-panel p-5"><p className="text-sm text-slate-400">Cohorts</p><p className="mt-2 text-3xl font-bold">{cohorts.length}</p></article><article className="ui-panel p-5"><p className="text-sm text-slate-400">Students</p><p className="mt-2 text-3xl font-bold">{students.length}</p></article><article className="ui-panel p-5"><p className="text-sm text-slate-400">Published modules</p><p className="mt-2 text-3xl font-bold">{modules.filter((module) => module.status === "published").length}</p></article></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-3">{permissions.map((permission) => <article className="ui-panel p-5" key={permission.label}><h2 className="font-bold">{permission.label}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{permission.description}</p></article>)}</div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Link className="ui-action" to="/staff/operations">Cohorts and Students</Link><Link className="ui-action-secondary" to="/trainer">Student results</Link><Link className="ui-action-secondary" to="/staff/operations#content">Content and assignments</Link>{session.role !== "trainer" && <Link className="ui-action-secondary" to="/staff/accounts">Staff accounts</Link>}{session.role === "superadmin" && <Link className="ui-action-secondary" to="/staff/operations#system">System controls</Link>}</div>
    <p className="mt-8 text-xs text-slate-400">High-risk actions—archive, switch off device and purge—will require real API authorization and confirmation before production release.</p></section>;
}
