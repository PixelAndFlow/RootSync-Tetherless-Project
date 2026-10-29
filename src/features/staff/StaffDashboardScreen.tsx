import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { readFrontendRuntimeConfig } from "../../services/integration/runtimeConfig";
import { STAFF_PERMISSION_SUMMARY, roleLabel, type Cohort, type LearnerRecord, type ModuleListing } from "../../types/staff";

export function StaffDashboardScreen() {
  const { session, signOut } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const integration = readFrontendRuntimeConfig().mode === "integration";
  const [data, setData] = useState<{ cohorts: Cohort[]; students: LearnerRecord[]; modules: ModuleListing[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!gateway || !session) return;
    let cancelled = false;
    setData(null); setError(null);
    void Promise.all([gateway.listCohorts(), gateway.listLearnerRecords({}), gateway.listModules()]).then(([cohorts, students, modules]) => {
      if (!cancelled) setData({ cohorts, students, modules });
    }).catch((err: unknown) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [gateway, session, attempt]);
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  return <section><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ui-eyebrow">{roleLabel(session.role)} · {integration ? "LIVE DATA" : "DEMO DATA"}</p><h1 className="mt-3 text-3xl font-bold">Welcome, {session.displayName}</h1><p className="mt-3 max-w-2xl text-slate-300">View your program's cohorts, students and modules.</p></div><button className="ui-action-secondary" onClick={signOut} type="button">Sign out</button></div>
    {error ? <div className="mt-8"><p className="mb-2">Dashboard counts could not be loaded.</p><ApiErrorNotice error={error} /><button className="ui-action-secondary mt-3" onClick={() => setAttempt((n) => n + 1)} type="button">Retry</button></div> : !data ? <p className="mt-8" role="status">Loading dashboard counts…</p> : <div className="mt-8 grid gap-4 sm:grid-cols-3"><article className="ui-panel p-5"><p className="text-sm text-slate-400">Cohorts</p><p className="mt-2 text-3xl font-bold">{data.cohorts.length}</p></article><article className="ui-panel p-5"><p className="text-sm text-slate-400">Students</p><p className="mt-2 text-3xl font-bold">{data.students.length}</p></article><article className="ui-panel p-5"><p className="text-sm text-slate-400">Published modules</p><p className="mt-2 text-3xl font-bold">{data.modules.filter((module) => !module.archived && module.latestVersion !== null).length}</p></article></div>}
    <div className="mt-6 grid gap-4 lg:grid-cols-3">{STAFF_PERMISSION_SUMMARY[session.role].map((permission) => <article className="ui-panel p-5" key={permission.label}><h2 className="font-bold">{permission.label}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{permission.description}</p></article>)}</div>
    {integration && <p className="mt-4 rounded-xl border border-amber-300/40 bg-amber-950/30 p-4 text-sm text-amber-100">Cohort, student and module lists and student creation use the staff API. Other operations may remain unavailable.</p>}
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Link className="ui-action" to="/staff/operations">Cohorts and Students</Link><Link className="ui-action-secondary" to="/trainer">Student results</Link><Link className="ui-action-secondary" to="/staff/operations">Content and assignments</Link>{session.role !== "trainer" && <Link className="ui-action-secondary" to="/staff/accounts">Staff accounts</Link>}{session.role === "superadmin" && <Link className="ui-action-secondary" to="/staff/system">System controls</Link>}</div>
  </section>;
}
