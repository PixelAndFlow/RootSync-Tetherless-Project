import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import { readFrontendRuntimeConfig } from "../../services/integration/runtimeConfig";
import { STAFF_PERMISSION_SUMMARY, roleLabel, type Cohort, type LearnerRecord, type ModuleListing } from "../../types/staff";

export function StaffDashboardScreen() {
  const { session, signOut } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const integration = readFrontendRuntimeConfig().mode === "integration";
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [students, setStudents] = useState<LearnerRecord[]>([]);
  const [modules, setModules] = useState<ModuleListing[]>([]);
  useEffect(() => { if (gateway && session) void Promise.all([gateway.listCohorts(), gateway.listLearnerRecords({}), gateway.listModules()]).then(([nextCohorts, nextStudents, nextModules]) => { setCohorts(nextCohorts); setStudents(nextStudents); setModules(nextModules); }).catch(() => {}); }, [gateway, session]);
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  const permissions = STAFF_PERMISSION_SUMMARY[session.role];
  const liveNotice = integration ? <p className="mt-4 rounded-xl border border-amber-300/40 bg-amber-950/30 p-4 text-sm text-amber-100" role="status">Live mode supports staff sign-in, password changes and staff account management. Other operational data and changes remain disabled pending API-contract review.</p> : null;
  return <section><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ui-eyebrow">{roleLabel(session.role)} · DEMO DATA</p><h1 className="mt-3 text-3xl font-bold">Welcome, {session.displayName}</h1><p className="mt-3 max-w-2xl text-slate-300">Role-aware staff screens are ready for Marc’s staff API. Current counts and actions use mock data only.</p></div><button className="ui-action-secondary" onClick={signOut} type="button">Sign out</button></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-3"><article className="ui-panel p-5"><p className="text-sm text-slate-400">Cohorts</p><p className="mt-2 text-3xl font-bold">{cohorts.length}</p></article><article className="ui-panel p-5"><p className="text-sm text-slate-400">Students</p><p className="mt-2 text-3xl font-bold">{students.length}</p></article><article className="ui-panel p-5"><p className="text-sm text-slate-400">Published modules</p><p className="mt-2 text-3xl font-bold">{modules.filter((module) => !module.archived).length}</p></article></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-3">{permissions.map((permission) => <article className="ui-panel p-5" key={permission.label}><h2 className="font-bold">{permission.label}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{permission.description}</p></article>)}</div>
    {liveNotice}<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Link className="ui-action" to="/staff/operations">Cohorts and Students</Link><Link className="ui-action-secondary" to="/trainer">Student results</Link><Link className="ui-action-secondary" to="/staff/operations">Content and assignments</Link>{session.role !== "trainer" && <Link className="ui-action-secondary" to="/staff/accounts">Staff accounts</Link>}{session.role === "superadmin" && <Link className="ui-action-secondary" to="/staff/system">System controls</Link>}</div>
    <p className="mt-8 text-xs text-slate-400">High-risk actions—archive, switch off device and purge—will require real API authorization and confirmation before production release.</p></section>;
}
