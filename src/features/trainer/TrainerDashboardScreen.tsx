import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useStaffAdminGateway, useTrainerDataGateway } from "../../app/providers/GatewayProvider";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { ReturnLink } from "../../components/common/ReturnLink";
import { MetricCard } from "../../components/trainer/MetricCard";
import { readFrontendRuntimeConfig } from "../../services/integration/runtimeConfig";
import type { Cohort } from "../../types/staff";
import { performanceLabels, type TrainerLearnerSummary } from "../../types/trainer";
import { ReportError } from "./ReportError";

type SortOption = "name" | "mastery_desc" | "initial_desc" | "last_synced";

const completionLabel = (value: TrainerLearnerSummary["completionStatus"]) => value === "not_started" ? "Not started" : value === "in_progress" ? "In progress" : "Completed";
const fullName = (learner: TrainerLearnerSummary) => `${learner.firstName} ${learner.lastName}`.trim();
const activeTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
const formatWhen = (iso: string | null) => iso ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—";

/**
 * Student results for one cohort, from the trainer data gateway: the server's reports when the app is
 * connected to the API, fixtures when it is not. One screen for both; only the wording and the sign-in
 * requirement differ. XP and sync-state columns are deliberately absent: the server cannot supply them.
 */
export function TrainerDashboardScreen() {
  const live = readFrontendRuntimeConfig().mode === "integration";
  const { session } = useStaffSession();
  const staff = useStaffAdminGateway();
  const trainerData = useTrainerDataGateway();
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [cohortId, setCohortId] = useState("");
  const [rows, setRows] = useState<TrainerLearnerSummary[] | null>(null);
  const [cohortError, setCohortError] = useState<unknown>(null);
  const [reportError, setReportError] = useState<unknown>(null);
  const [cohortRetry, setCohortRetry] = useState(0);
  const [reportRetry, setReportRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "in_progress">("all");
  const [sort, setSort] = useState<SortOption>("name");
  const signedIn = !live || Boolean(session);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    setCohorts(null); setCohortError(null);
    const load = staff ? staff.listCohorts() : Promise.reject(new Error("Cohorts are unavailable in this build."));
    void load.then((next) => { if (!cancelled) { setCohorts(next); setCohortId((id) => next.some((c) => c.cohortId === id) ? id : next[0]?.cohortId ?? ""); } }).catch((error: unknown) => { if (!cancelled) setCohortError(error); });
    return () => { cancelled = true; };
  }, [staff, signedIn, cohortRetry]);

  useEffect(() => {
    if (!signedIn || !cohorts || !cohortId) { setRows(null); return; }
    let cancelled = false;
    setRows(null); setReportError(null);
    void trainerData.listLearners({ cohortId }).then((next) => { if (!cancelled) setRows(next); }).catch((error: unknown) => { if (!cancelled) setReportError(error); });
    return () => { cancelled = true; };
  }, [trainerData, signedIn, cohorts, cohortId, reportRetry]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = (rows ?? []).filter((learner) => {
      const queryMatches = !term || fullName(learner).toLowerCase().includes(term) || learner.learnerCode.toLowerCase().includes(term);
      const filterMatches = filter === "all" || learner.completionStatus === filter;
      return queryMatches && filterMatches;
    });
    return [...matches].sort((first, second) => {
      if (sort === "mastery_desc") return second.currentMasteryPercent - first.currentMasteryPercent;
      if (sort === "initial_desc") return (second.initialScorePercent ?? -1) - (first.initialScorePercent ?? -1);
      if (sort === "last_synced") return (second.lastSyncedAt ? Date.parse(second.lastSyncedAt) : 0) - (first.lastSyncedAt ? Date.parse(first.lastSyncedAt) : 0);
      return fullName(first).localeCompare(fullName(second));
    });
  }, [filter, rows, query, sort]);

  if (!signedIn) return <Navigate replace to="/staff/sign-in?next=/trainer" />;

  const withModule = (rows ?? []).filter((learner) => !learner.noModuleResults);
  const studentCount = new Set((rows ?? []).map((learner) => learner.learnerId)).size;
  const completedCount = withModule.filter((learner) => learner.completionStatus === "completed").length;
  const averageMastery = withModule.length ? Math.round(withModule.reduce((total, learner) => total + learner.currentMasteryPercent, 0) / withModule.length) : 0;
  const withProblems = new Set((rows ?? []).filter((learner) => learner.rejectedEventCount > 0).map((learner) => learner.learnerId)).size;
  const noun = live ? "" : "fixture ";

  return (
    <section>
      <ReturnLink to="/staff">Staff dashboard</ReturnLink>
      <div className="flex flex-wrap items-end justify-between gap-4"><div>
        <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">{live ? "TRAINER VIEW · SERVER REPORT" : "TRAINER VIEW · FIXTURE DATA"}</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{live ? "Student results" : "See learning signals, not raw device internals."}</h1>
        <p className="mt-3 max-w-2xl text-slate-400">{live ? "These results reflect events received by the server. A phone may have work that has not yet been sent." : "This preview uses de-identified fixture data. Live trainer data comes from the backend once the app is connected to it."}</p>
      </div></div>
      {cohortError ? <ReportError error={cohortError} retry={() => setCohortRetry((n) => n + 1)} /> : !cohorts ? <p className="mt-6" role="status">Loading cohorts…</p> : cohorts.length === 0 ? <p className="mt-6">No cohorts available.</p> : <>
        <label className="mt-6 grid max-w-sm gap-2 text-sm font-semibold">Cohort<select className="integration-input" value={cohortId} onChange={(event) => { setRows(null); setReportError(null); setCohortId(event.target.value); }}>{cohorts.map((cohort) => <option key={cohort.cohortId} value={cohort.cohortId}>{cohort.name}</option>)}</select></label>
        {reportError ? <ReportError error={reportError} retry={() => setReportRetry((n) => n + 1)} /> : !rows ? <p className="mt-6" role="status">Loading report…</p> : rows.length === 0 ? <p className="mt-6">No students in this cohort report.</p> : <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3"><MetricCard detail={live ? "in this cohort report" : "de-identified fixture Students"} label="Students" value={studentCount} /><MetricCard detail="module results completed" label="Completion" value={`${completedCount}/${withModule.length}`} /><MetricCard detail="current cohort learning signal" label="Avg. mastery" value={`${averageMastery}%`} /></div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100"><span><strong>{withProblems}</strong> Student{withProblems === 1 ? " has" : "s have"} events the server rejected.</span><span>The server cannot see work that has not been sent from a phone. Sync state is separate from score and mastery.</span></div>
          <div className="mt-8 flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-semibold text-slate-300">Search Students<input aria-label="Search Students" className="min-h-11 min-w-52 rounded-xl border border-white/15 bg-ink px-4 py-2.5 text-sm font-normal outline-none ring-violet-400 focus:ring-2" onChange={(event) => setQuery(event.target.value)} placeholder="Search Student" value={query} /></label><fieldset><legend className="mb-2 text-sm font-semibold text-slate-300">Completion</legend><div className="flex rounded-xl border border-white/10 p-1">{(["all", "completed", "in_progress"] as const).map((option) => <button aria-pressed={filter === option} className={`min-h-10 rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === option ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`} key={option} onClick={() => setFilter(option)} type="button">{option === "in_progress" ? "In progress" : option[0].toUpperCase() + option.slice(1)}</button>)}</div></fieldset><label className="grid gap-2 text-sm font-semibold text-slate-300">Sort Students<select aria-label="Sort Students" className="min-h-11 rounded-xl border border-white/15 bg-ink px-3 py-2 text-sm font-normal" onChange={(event) => setSort(event.target.value as SortOption)} value={sort}><option value="name">Name (A-Z)</option><option value="mastery_desc">Highest mastery</option><option value="initial_desc">Highest initial score</option><option value="last_synced">Last synced</option></select></label></div>
          <p aria-live="polite" className="mt-4 text-sm text-slate-400">Showing {visible.length} of {rows.length} {noun}result{rows.length === 1 ? "" : "s"}.</p>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-panel">
            <table className="min-w-full text-left text-sm"><caption className="sr-only">Student mission summaries</caption>
              <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">Student</th><th className="px-5 py-4">Progress</th><th className="px-5 py-4">Initial</th><th className="px-5 py-4">Mastery</th><th className="px-5 py-4">Missed → unmastered</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Active time (all modules)</th><th className="px-5 py-4">Events accepted / rejected</th><th className="px-5 py-4">Last synced</th></tr></thead>
              <tbody>{visible.map((learner) => <tr className="border-b border-white/5 transition hover:bg-white/[0.03]" key={`${learner.learnerId}-${learner.moduleId}`}>
                <td className="px-5 py-4">{learner.noModuleResults ? <span className="font-semibold">{fullName(learner)}</span> : <Link className="font-semibold text-cyan-200 hover:text-cyan-100" to={`/trainer/learners/${encodeURIComponent(learner.learnerId)}?module=${encodeURIComponent(learner.moduleId)}`}>{fullName(learner)}</Link>}<p className="mt-1 text-xs text-slate-500">{learner.learnerCode}{learner.noModuleResults ? "" : ` · ${learner.moduleTitle}`}</p></td>
                {learner.noModuleResults ? <td className="px-5 py-4 text-slate-400" colSpan={5}>No module results reported.</td> : <><td className="px-5 py-4"><span className={learner.completionStatus === "completed" ? "text-emerald-200" : "text-amber-200"}>{completionLabel(learner.completionStatus)} ({learner.questionsAnswered}/{learner.questionsTotal})</span></td><td className="px-5 py-4">{learner.initialScorePercent === undefined ? "—" : `${learner.initialScorePercent}%`}</td><td className="px-5 py-4 font-semibold">{learner.currentMasteryPercent}%</td><td className="px-5 py-4">{learner.initialMissedCount} → {learner.stillUnmasteredCount}</td><td className="px-5 py-4">{performanceLabels[learner.statusLabel]}</td></>}
                <td className="px-5 py-4">{activeTime(learner.activeEngagementSeconds)}</td><td className="px-5 py-4">{learner.acceptedEventCount} / <span className={learner.rejectedEventCount > 0 ? "font-semibold text-amber-200" : ""}>{learner.rejectedEventCount}</span></td><td className="px-5 py-4">{formatWhen(learner.lastSyncedAt)}</td></tr>)}{visible.length === 0 && <tr><td className="px-5 py-10 text-center text-slate-400" colSpan={9}>No {noun}Students match this filter.</td></tr>}</tbody>
            </table>
          </div>
        </>}
      </>}
    </section>
  );
}
