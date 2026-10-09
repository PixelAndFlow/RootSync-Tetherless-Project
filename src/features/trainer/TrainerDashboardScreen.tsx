import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MetricCard } from "../../components/trainer/MetricCard";
import { trainerDataGateway } from "../../services/gateways";
import type { TrainerLearnerSummary } from "../../types/trainer";

export function TrainerDashboardScreen() {
  const [learners, setLearners] = useState<TrainerLearnerSummary[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "completed" | "in_progress">("all");

  useEffect(() => { void trainerDataGateway.listLearners().then(setLearners); }, []);
  const visibleLearners = useMemo(() => learners.filter((learner) => {
    const queryMatches = learner.displayName.toLowerCase().includes(query.trim().toLowerCase());
    const filterMatches = filter === "all" || learner.completionStatus === filter;
    return queryMatches && filterMatches;
  }), [filter, learners, query]);
  const completedCount = learners.filter((learner) => learner.completionStatus === "completed").length;
  const averageMastery = learners.length ? Math.round(learners.reduce((total, learner) => total + learner.currentMasteryPercent, 0) / learners.length) : 0;
  const waitingSync = learners.filter((learner) => learner.syncStatus !== "synced").length;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.2em] text-cyan-300">TRAINER VIEW · FIXTURE DATA</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">See learning signals, not raw device internals.</h1><p className="mt-3 max-w-2xl text-slate-400">This preview uses de-identified fixture data. Live trainer data will come from the backend after server authorization is in place.</p></div><span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-2 text-xs font-bold text-violet-100">Operation Cyber Squad</span></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3"><MetricCard detail="de-identified fixture learners" label="Learners" value={learners.length} /><MetricCard detail="have completed this mission" label="Completion" value={`${completedCount}/${learners.length}`} /><MetricCard detail="current cohort learning signal" label="Avg. mastery" value={`${averageMastery}%`} /></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100"><span><strong>{waitingSync}</strong> learner record{waitingSync === 1 ? " is" : "s are"} waiting to sync or resolve.</span><span>Sync state is separate from score and mastery.</span></div>
      <div className="mt-8 flex flex-wrap gap-3"><input aria-label="Search learners" className="min-w-52 rounded-xl border border-white/15 bg-ink px-4 py-2.5 text-sm outline-none ring-violet-400 focus:ring-2" onChange={(event) => setQuery(event.target.value)} placeholder="Search learner" value={query} /><div className="flex rounded-xl border border-white/10 p-1">{(["all", "completed", "in_progress"] as const).map((option) => <button className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === option ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`} key={option} onClick={() => setFilter(option)} type="button">{option === "in_progress" ? "In progress" : option[0].toUpperCase() + option.slice(1)}</button>)}</div></div>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-panel">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">Learner</th><th className="px-5 py-4">Complete</th><th className="px-5 py-4">Initial</th><th className="px-5 py-4">Mastery</th><th className="px-5 py-4">Missed → unmastered</th><th className="px-5 py-4">Active time</th><th className="px-5 py-4">XP</th><th className="px-5 py-4">Sync</th></tr></thead>
          <tbody>{visibleLearners.map((learner) => <tr className="border-b border-white/5 transition hover:bg-white/[0.03]" key={learner.learnerId}><td className="px-5 py-4"><Link className="font-semibold text-cyan-200 hover:text-cyan-100" to={`/trainer/learners/${learner.learnerId}`}>{learner.displayName}</Link><p className="mt-1 text-xs text-slate-500">{learner.moduleTitle}</p></td><td className="px-5 py-4"><span className={learner.completionStatus === "completed" ? "text-emerald-200" : "text-amber-200"}>{learner.completionStatus === "completed" ? "Complete" : "In progress"}</span></td><td className="px-5 py-4">{learner.initialScorePercent === undefined ? "—" : `${learner.initialScorePercent}%`}</td><td className="px-5 py-4 font-semibold">{learner.currentMasteryPercent}%</td><td className="px-5 py-4">{learner.initialMissedCount} → {learner.stillUnmasteredCount}</td><td className="px-5 py-4">{Math.floor(learner.activeEngagementSeconds / 60)}m {learner.activeEngagementSeconds % 60}s</td><td className="px-5 py-4 text-amber-100">{learner.xp}</td><td className="px-5 py-4"><span className={learner.syncStatus === "synced" ? "text-emerald-300" : "text-amber-200"}>{learner.syncStatus.replaceAll("_", " ")}</span></td></tr>)}{visibleLearners.length === 0 && <tr><td className="px-5 py-10 text-center text-slate-400" colSpan={8}>No fixture learners match this filter.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}
