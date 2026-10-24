import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MetricCard } from "../../components/trainer/MetricCard";
import { PerformanceBar } from "../../components/trainer/PerformanceBar";
import { ErrorState, LoadingState } from "../../components/common/PageState";
import { moduleLibrary } from "../../content/modules";
import { useTrainerDataGateway } from "../../app/providers/GatewayProvider";
import type { TrainerModuleDetail } from "../../types/trainer";

export function TrainerLearnerDetailScreen() {
  const { learnerId } = useParams();
  const trainerDataGateway = useTrainerDataGateway();
  const module = moduleLibrary[0];
  const [detail, setDetail] = useState<TrainerModuleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (learnerId) void trainerDataGateway.getLearnerModuleDetail(learnerId, module.module_id).then(setDetail).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load fixture Student.")); }, [learnerId, module.module_id, trainerDataGateway]);
  if (error) return <ErrorState actionLabel="Return to Trainer overview" actionTo="/trainer" detail={error} title="Student detail unavailable" />;
  if (!detail) return <LoadingState label="Loading Student detail…" />;
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return <section><Link className="text-sm font-bold app-wordmark" to="/trainer">← Trainer overview</Link><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="ui-eyebrow">STUDENT MODULE DETAIL · FIXTURE DATA</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">{detail.displayName}</h1><p className="mt-2 text-slate-400">{detail.moduleTitle} · content v{detail.contentVersion}</p></div><span className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold">{detail.completionStatus === "completed" ? "Complete" : "In progress"}</span></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard detail="first completed full attempt" label="Initial score" value={detail.initialScorePercent === undefined ? "—" : `${detail.initialScorePercent}%`} /><MetricCard detail="including corrected concepts" label="Current mastery" value={`${detail.currentMasteryPercent}%`} /><MetricCard detail="engagement signal only" label="XP" value={detail.xp} /><MetricCard detail="correct-answer run" label="Best streak" value={detail.bestStreak} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><article className="ui-panel p-5"><h2 className="text-lg font-bold">Attempt and practice</h2><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-400">Questions answered</dt><dd className="mt-1 text-xl font-bold">{detail.questionsAnswered}/{detail.questionsTotal}</dd></div><div><dt className="text-slate-400">Missed → unmastered</dt><dd className="mt-1 text-xl font-bold">{detail.initialMissedCount} → {detail.stillUnmasteredCount}</dd></div><div><dt className="text-slate-400">Full attempts</dt><dd className="mt-1 text-xl font-bold">{detail.fullAttemptCount}</dd></div><div><dt className="text-slate-400">Practice corrections</dt><dd className="mt-1 text-xl font-bold">{detail.remediationCorrected}/{detail.remediationAttempted || 0}</dd></div></dl></article><article className="ui-panel p-5"><h2 className="text-lg font-bold">Engagement and sync</h2><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-400">Active time</dt><dd className="mt-1 text-xl font-bold">{formatTime(detail.activeEngagementSeconds)}</dd></div><div><dt className="text-slate-400">Sessions / returns</dt><dd className="mt-1 text-xl font-bold">{detail.sessionCount} / {detail.returnCount}</dd></div><div><dt className="text-slate-400">Sync state</dt><dd className="mt-1 text-xl font-bold capitalize">{detail.syncStatus.replaceAll("_", " ")}</dd></div><div><dt className="text-slate-400">Last activity</dt><dd className="mt-1 text-sm font-bold">{detail.lastActivityAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(detail.lastActivityAt)) : "—"}</dd></div></dl></article></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><article className="ui-panel p-5"><h2 className="text-lg font-bold">Topic performance</h2><div className="mt-5 grid gap-5">{detail.topicPerformance.map((topic) => <PerformanceBar key={topic.topic} label={topic.topic.replaceAll("_", " ")} total={topic.totalCount} value={topic.masteredCount} />)}</div></article><article className="ui-panel p-5"><h2 className="text-lg font-bold">Sector performance</h2><div className="mt-5 grid gap-5">{detail.sectorPerformance.map((sector) => <PerformanceBar key={sector.sectorId} label={sector.label} total={sector.totalCount} value={sector.masteredCount} />)}</div></article></div>
    <p className="mt-6 text-xs leading-5 text-slate-500">Trainer UI displays synchronized server data in production. This fixture screen does not read Student-device IndexedDB or expose raw event records.</p>
  </section>;
}
