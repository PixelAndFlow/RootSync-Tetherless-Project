import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useStaffAdminGateway, useTrainerDataGateway } from "../../app/providers/GatewayProvider";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { MetricCard } from "../../components/trainer/MetricCard";
import { PerformanceBar } from "../../components/trainer/PerformanceBar";
import { moduleLibrary } from "../../content/modules";
import { readFrontendRuntimeConfig } from "../../services/integration/runtimeConfig";
import { performanceLabels, type TrainerModuleDetail } from "../../types/trainer";
import { ReportError } from "./ReportError";

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
const formatWhen = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—";
const percent = (value: number | undefined) => value === undefined ? "—" : `${value}%`;

/**
 * One student on one module, from the trainer data gateway (server reports when connected to the
 * API, fixtures otherwise). `?module=` disambiguates when a learner has more than one assigned
 * module; when it's missing, falls back to the learner's real assignments (#6/#15) instead of a
 * dead end that tells the trainer to click a link the dashboard may not offer.
 */
export function TrainerLearnerDetailScreen() {
  const live = readFrontendRuntimeConfig().mode === "integration";
  const { session } = useStaffSession();
  const trainerData = useTrainerDataGateway();
  const staffAdmin = useStaffAdminGateway();
  const { learnerId } = useParams();
  const [params] = useSearchParams();
  const paramModuleId = params.get("module")?.trim() || null;
  const [detail, setDetail] = useState<TrainerModuleDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  const [assignedModules, setAssignedModules] = useState<{ moduleId: string; moduleName: string }[] | null>(null);
  const signedIn = !live || Boolean(session);
  const needsAssignmentLookup = live && !paramModuleId;

  useEffect(() => {
    if (!signedIn || !learnerId || !needsAssignmentLookup) { setAssignedModules(null); return; }
    if (!staffAdmin) { setAssignedModules([]); return; }
    let cancelled = false;
    void staffAdmin.getLearnerRecord(learnerId)
      .then((learner) => staffAdmin.listAssignments(learner.cohortId))
      .then((assignments) => {
        if (cancelled) return;
        const forLearner = assignments.filter((a) => a.target === "cohort" || a.learnerId === learnerId);
        const byModule = new Map(forLearner.map((a) => [a.moduleId, a.moduleName] as const));
        setAssignedModules([...byModule].map(([moduleId, moduleName]) => ({ moduleId, moduleName })));
      })
      .catch(() => { if (!cancelled) setAssignedModules([]); });
    return () => { cancelled = true; };
  }, [staffAdmin, signedIn, learnerId, needsAssignmentLookup]);

  const moduleId = paramModuleId || (live ? (assignedModules?.length === 1 ? assignedModules[0].moduleId : null) : moduleLibrary[0].module_id);

  useEffect(() => {
    if (!signedIn || !learnerId || !moduleId) return;
    let cancelled = false;
    setDetail(null); setError(null);
    void trainerData.getLearnerModuleDetail(learnerId, moduleId).then((next) => { if (!cancelled) setDetail(next); }).catch((reason: unknown) => { if (!cancelled) setError(reason); });
    return () => { cancelled = true; };
  }, [trainerData, signedIn, learnerId, moduleId, retry]);

  if (!signedIn) return <Navigate replace to="/staff/sign-in?next=/trainer" />;
  const back = <Link className="text-sm font-bold app-wordmark" to="/trainer">← Student results</Link>;
  if (!moduleId) {
    if (needsAssignmentLookup && assignedModules === null) return <section>{back}<p className="mt-6" role="status">Loading…</p></section>;
    if (assignedModules && assignedModules.length > 1) return <section>{back}<h1 className="mt-6 text-2xl font-bold">Select a module</h1><p className="mt-2 text-slate-400">This student has more than one assigned module.</p><ul className="mt-4 grid gap-2">{assignedModules.map((module) => <li key={module.moduleId}><Link className="ui-action-secondary inline-flex min-h-9 items-center px-4 py-2 text-sm" to={`/trainer/learners/${encodeURIComponent(learnerId ?? "")}?module=${encodeURIComponent(module.moduleId)}`}>{module.moduleName}</Link></li>)}</ul></section>;
    return <section>{back}<h1 className="mt-6 text-2xl font-bold">Select a student module</h1><p>{needsAssignmentLookup && assignedModules?.length === 0 ? "This student has no assigned modules." : "Open a module result from the trainer dashboard. No module has been selected for this link."}</p></section>;
  }
  if (error) return <section>{back}<ReportError error={error} retry={() => setRetry((n) => n + 1)} /></section>;
  if (!detail) return <section>{back}<p className="mt-6" role="status">Loading Student detail…</p></section>;

  return <section>{back}
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="ui-eyebrow">{live ? "STUDENT MODULE DETAIL · SERVER REPORT" : "STUDENT MODULE DETAIL · FIXTURE DATA"}</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">{`${detail.firstName} ${detail.lastName}`.trim()}</h1><p className="mt-2 text-slate-400">Student code: {detail.learnerCode} · {detail.moduleTitle} · content v{detail.contentVersion}</p></div><span className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold">{detail.completionStatus === "completed" ? "Complete" : detail.completionStatus === "in_progress" ? "In progress" : "Not started"} · {performanceLabels[detail.statusLabel]}</span></div>
    {detail.strugglingReasons.length > 0 && <p className="mt-4 text-sm text-amber-100">Flagged for support: {detail.strugglingReasons.map((reason) => reason.replaceAll("_", " ").replace(":", ": ")).join(", ")}.</p>}
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard detail="first completed full attempt" label="Initial score" value={percent(detail.initialScorePercent)} /><MetricCard detail="highest completed full attempt" label="Best score" value={percent(detail.bestScorePercent)} /><MetricCard detail="including corrected concepts" label="Current mastery" value={`${detail.currentMasteryPercent}%`} /><MetricCard detail="attempts left unfinished" label="Abandoned" value={detail.attemptsAbandoned} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><article className="ui-panel p-5"><h2 className="text-lg font-bold">Attempt and practice</h2><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-400">Questions answered</dt><dd className="mt-1 text-xl font-bold">{detail.questionsAnswered}/{detail.questionsTotal}</dd></div><div><dt className="text-slate-400">Missed → unmastered</dt><dd className="mt-1 text-xl font-bold">{detail.initialMissedCount} → {detail.stillUnmasteredCount}</dd></div><div><dt className="text-slate-400">Full attempts</dt><dd className="mt-1 text-xl font-bold">{detail.fullAttemptCount}</dd></div><div><dt className="text-slate-400">Practice corrections</dt><dd className="mt-1 text-xl font-bold">{detail.remediationCorrected}/{detail.remediationAttempted || 0}</dd></div></dl></article><article className="ui-panel p-5"><h2 className="text-lg font-bold">Engagement and sync</h2><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-400">Active time (all modules)</dt><dd className="mt-1 text-xl font-bold">{formatTime(detail.activeEngagementSeconds)}</dd></div><div><dt className="text-slate-400">Sessions / returns</dt><dd className="mt-1 text-xl font-bold">{detail.sessionCount} / {detail.returnCount}</dd></div><div><dt className="text-slate-400">Events accepted / rejected</dt><dd className="mt-1 text-xl font-bold">{detail.acceptedEventCount} / {detail.rejectedEventCount}</dd></div><div><dt className="text-slate-400">Last synced</dt><dd className="mt-1 text-sm font-bold">{formatWhen(detail.lastSyncedAt)}</dd></div><div><dt className="text-slate-400">Last activity</dt><dd className="mt-1 text-sm font-bold">{formatWhen(detail.lastActivityAt)}</dd></div></dl></article></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><article className="ui-panel p-5"><h2 className="text-lg font-bold">Topic performance</h2><div className="mt-5 grid gap-5">{detail.topicPerformance.length === 0 ? <p className="text-sm text-slate-400">No answers yet.</p> : detail.topicPerformance.map((topic) => <PerformanceBar key={topic.topic} label={topic.topic.replaceAll("_", " ")} total={topic.totalCount} value={topic.masteredCount} />)}</div></article>{detail.sectorPerformance.length > 0 && <article className="ui-panel p-5"><h2 className="text-lg font-bold">Sector performance</h2><div className="mt-5 grid gap-5">{detail.sectorPerformance.map((sector) => <PerformanceBar key={sector.sectorId} label={sector.label} total={sector.totalCount} value={sector.masteredCount} />)}</div></article>}</div>
    <p className="mt-6 text-xs leading-5 text-slate-500">{live ? "The server cannot see work that has not been sent from the phone." : "This fixture screen does not read Student-device IndexedDB or expose raw event records."} Trainer screens show synchronized server data in production.</p>
  </section>;
}
