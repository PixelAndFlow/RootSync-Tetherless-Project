import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ReturnLink } from "../../components/common/ReturnLink";
import { MetricCard } from "../../components/trainer/MetricCard";
import { ErrorState, LoadingState } from "../../components/common/PageState";
import { useTrainerDataGateway } from "../../app/providers/GatewayProvider";
import type { TrainerLearnerSummary } from "../../types/trainer";

type SortOption = "name" | "mastery_desc" | "initial_desc" | "sync";

export function TrainerDashboardScreen() {
  const trainerDataGateway = useTrainerDataGateway();
  const [learners, setLearners] = useState<TrainerLearnerSummary[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "in_progress">("all");
  const [sort, setSort] = useState<SortOption>("name");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void trainerDataGateway.listLearners().then(setLearners).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load trainer fixtures.")).finally(() => setIsLoading(false)); }, []);
  const visibleLearners = useMemo(() => {
    const filtered = learners.filter((learner) => {
      const queryMatches = learner.displayName.toLowerCase().includes(query.trim().toLowerCase());
      const filterMatches = filter === "all" || learner.completionStatus === filter;
      return queryMatches && filterMatches;
    });
    return [...filtered].sort((first, second) => {
      if (sort === "mastery_desc") return second.currentMasteryPercent - first.currentMasteryPercent;
      if (sort === "initial_desc") return (second.initialScorePercent ?? -1) - (first.initialScorePercent ?? -1);
      if (sort === "sync") return first.syncStatus.localeCompare(second.syncStatus);
      return first.displayName.localeCompare(second.displayName);
    });
  }, [filter, learners, query, sort]);
  const completedCount = learners.filter((learner) => learner.completionStatus === "completed").length;
  const averageMastery = learners.length ? Math.round(learners.reduce((total, learner) => total + learner.currentMasteryPercent, 0) / learners.length) : 0;
  const waitingSync = learners.filter((learner) => learner.syncStatus !== "synced").length;

  if (isLoading) return <LoadingState label="Loading trainer fixture data…" />;
  if (error) return <ErrorState actionLabel="Return to staff dashboard" actionTo="/staff" detail={error} title="Trainer overview unavailable" />;

  return (
    <section>
      <ReturnLink to="/staff">Staff dashboard</ReturnLink>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.2em] text-cyan-300">TRAINER VIEW · FIXTURE DATA</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">See learning signals, not raw device internals.</h1><p className="mt-3 max-w-2xl text-slate-400">This preview uses de-identified fixture data. Live trainer data will come from the backend after server authorization is in place.</p></div><span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-2 text-xs font-bold text-violet-100">Operation Cyber Squad</span></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3"><MetricCard detail="de-identified fixture Students" label="Students" value={learners.length} /><MetricCard detail="have completed this mission" label="Completion" value={`${completedCount}/${learners.length}`} /><MetricCard detail="current cohort learning signal" label="Avg. mastery" value={`${averageMastery}%`} /></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100"><span><strong>{waitingSync}</strong> Student record{waitingSync === 1 ? " is" : "s are"} waiting to sync or resolve.</span><span>Sync state is separate from score and mastery.</span></div>
      <div className="mt-8 flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-semibold text-slate-300">Search Students<input aria-label="Search Students" className="min-h-11 min-w-52 rounded-xl border border-white/15 bg-ink px-4 py-2.5 text-sm font-normal outline-none ring-violet-400 focus:ring-2" onChange={(event) => setQuery(event.target.value)} placeholder="Search Student" value={query} /></label><fieldset><legend className="mb-2 text-sm font-semibold text-slate-300">Completion</legend><div className="flex rounded-xl border border-white/10 p-1">{(["all", "completed", "in_progress"] as const).map((option) => <button aria-pressed={filter === option} className={`min-h-10 rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === option ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`} key={option} onClick={() => setFilter(option)} type="button">{option === "in_progress" ? "In progress" : option[0].toUpperCase() + option.slice(1)}</button>)}</div></fieldset><label className="grid gap-2 text-sm font-semibold text-slate-300">Sort Students<select aria-label="Sort Students" className="min-h-11 rounded-xl border border-white/15 bg-ink px-3 py-2 text-sm font-normal" onChange={(event) => setSort(event.target.value as SortOption)} value={sort}><option value="name">Name (A-Z)</option><option value="mastery_desc">Highest mastery</option><option value="initial_desc">Highest initial score</option><option value="sync">Sync state</option></select></label></div>
      <p aria-live="polite" className="mt-4 text-sm text-slate-400">Showing {visibleLearners.length} of {learners.length} fixture Student{learners.length === 1 ? "" : "s"}.</p>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-panel">
        <table className="min-w-full text-left text-sm"><caption className="sr-only">De-identified Student mission summaries</caption>
          <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">Student</th><th className="px-5 py-4">Complete</th><th className="px-5 py-4">Initial</th><th className="px-5 py-4">Mastery</th><th className="px-5 py-4">Missed → unmastered</th><th className="px-5 py-4">Active time</th><th className="px-5 py-4">XP</th><th className="px-5 py-4">Sync</th></tr></thead>
          <tbody>{visibleLearners.map((learner) => <tr className="border-b border-white/5 transition hover:bg-white/[0.03]" key={learner.learnerId}><td className="px-5 py-4"><Link className="font-semibold text-cyan-200 hover:text-cyan-100" to={`/trainer/learners/${learner.learnerId}`}>{learner.displayName}</Link><p className="mt-1 text-xs text-slate-500">{learner.moduleTitle}</p></td><td className="px-5 py-4"><span className={learner.completionStatus === "completed" ? "text-emerald-200" : "text-amber-200"}>{learner.completionStatus === "completed" ? "Complete" : "In progress"}</span></td><td className="px-5 py-4">{learner.initialScorePercent === undefined ? "—" : `${learner.initialScorePercent}%`}</td><td className="px-5 py-4 font-semibold">{learner.currentMasteryPercent}%</td><td className="px-5 py-4">{learner.initialMissedCount} → {learner.stillUnmasteredCount}</td><td className="px-5 py-4">{Math.floor(learner.activeEngagementSeconds / 60)}m {learner.activeEngagementSeconds % 60}s</td><td className="px-5 py-4 text-amber-100">{learner.xp}</td><td className="px-5 py-4"><span className={learner.syncStatus === "synced" ? "text-emerald-300" : "text-amber-200"}>{learner.syncStatus.replaceAll("_", " ")}</span></td></tr>)}{visibleLearners.length === 0 && <tr><td className="px-5 py-10 text-center text-slate-400" colSpan={8}>No fixture Students match this filter.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}
