import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusChip } from "../../components/common/StatusChip";
import { CyberShield } from "../../components/gamification/CyberShield";
import { EngagementStrip } from "../../components/gamification/EngagementStrip";
import { SectorMap } from "../../components/gamification/SectorMap";
import { moduleLibrary } from "../../content/modules";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { useOfflineLearningGateway } from "../../app/providers/GatewayProvider";
import type { LearnerModuleRecord } from "../../types/learning";
import { useSyncStatus } from "../../app/providers/SyncStatusProvider";
import { EmptyState, LoadingState } from "../../components/common/PageState";

export function MissionResultsScreen() {
  const { moduleId } = useParams();
  const { profile } = useLearnerProfile();
  const offlineLearningGateway = useOfflineLearningGateway();
  const module = moduleLibrary.find((candidate) => candidate.module_id === moduleId) ?? moduleLibrary[0];
  const [record, setRecord] = useState<LearnerModuleRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { summary: syncSummary } = useSyncStatus();

  useEffect(() => { if (!profile) return; void offlineLearningGateway.getLearnerModuleRecord(profile.learnerId, module.module_id).then(setRecord).finally(() => setIsLoading(false)); }, [module.module_id, profile]);

  if (!profile) return <section className="rounded-3xl border border-white/10 bg-panel p-8"><h1 className="text-2xl font-bold">Set up your learner profile first.</h1><Link className="mt-5 inline-flex text-cyan-300" to="/learner">Return to setup →</Link></section>;
  if (isLoading) return <LoadingState label="Loading your saved mission debrief…" />;
  if (!record?.firstCompletedAt) return <EmptyState actionLabel="Return to mission" actionTo={`/learner/missions/${module.module_id}/play`} detail="Finish every question to create an initial score and unlock your debrief." title="Your mission debrief is not ready yet." />;

  const initialMissed = record.initialMissedQuestionIds.length;
  const practiceAvailable = record.stillUnmasteredCount > 0;
  const summary = record.initialScorePercent && record.initialScorePercent >= 80
    ? "Strong start. Your first attempt shows solid mission readiness."
    : "Your first score is safely preserved. Practice missed concepts to improve mastery.";

  return (
    <section className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-panel p-6 shadow-2xl shadow-black/25 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.18em] text-cyan-300">MISSION COMPLETE</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">Recruit Mission Debrief</h1><p className="mt-3 max-w-xl leading-7 text-slate-300">{summary}</p></div><StatusChip status={syncSummary.status} /></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-violet-300/25 bg-violet-400/10 p-5"><p className="text-xs font-bold uppercase tracking-wider text-violet-200">Initial score</p><p className="mt-2 text-4xl font-extrabold">{record.initialScorePercent}%</p><p className="mt-2 text-sm text-slate-300">First completed full attempt</p></div><div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-5"><p className="text-xs font-bold uppercase tracking-wider text-cyan-100">Current mastery</p><p className="mt-2 text-4xl font-extrabold">{record.currentMasteryPercent}%</p><p className="mt-2 text-sm text-slate-300">Updates through practice</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Learning record</p><p className="mt-2 text-4xl font-extrabold">{record.attempts.length}</p><p className="mt-2 text-sm text-slate-300">Attempt{record.attempts.length === 1 ? "" : "s"} saved locally</p></div></div>
      <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-ink/40 p-5 sm:grid-cols-3"><p className="text-sm text-slate-300"><strong className="block text-lg text-white">{module.questions.length - initialMissed}/{module.questions.length}</strong>Correct on first attempt</p><p className="text-sm text-slate-300"><strong className="block text-lg text-white">{initialMissed} → {record.stillUnmasteredCount}</strong>Missed → still unmastered</p><p className="text-sm text-slate-300"><strong className="block text-lg text-white">{record.masteredQuestionIds.length}/{module.questions.length}</strong>Concepts mastered</p></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.25fr]"><CyberShield masteryPercent={record.currentMasteryPercent} /><div className="rounded-2xl border border-white/10 bg-ink/40 p-4"><p className="mb-3 text-xs font-bold tracking-[0.16em] text-amber-200">ENGAGEMENT REWARDS</p><EngagementStrip engagement={record.engagement} /></div></div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-ink/40 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.16em] text-slate-400">MISSION SECTORS</p><p className="mt-1 text-sm text-slate-300">Sector rewards and badges recognize engagement; they never alter academic results.</p></div>{record.engagement.earnedBadgeIds.length > 0 && <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100">{module.gamification?.mission_badge?.icon} {module.gamification?.mission_badge?.en}</span>}</div><div className="mt-4"><SectorMap completedSectorIds={record.engagement.completedSectorIds} sectors={module.gamification?.sectors ?? []} /></div></div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2"><Link className={`rounded-xl px-5 py-4 text-center font-bold ${practiceAvailable ? "bg-violet-600 hover:bg-violet-500" : "cursor-not-allowed bg-white/10 text-slate-500"}`} to={practiceAvailable ? `/learner/missions/${module.module_id}/practice` : "#"} onClick={(event) => { if (!practiceAvailable) event.preventDefault(); }}>Practice missed questions</Link><Link className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-center font-bold text-cyan-100 hover:bg-cyan-300/15" to={`/learner/missions/${module.module_id}/review?scope=correct`}>Review correct answers</Link><Link className="rounded-xl border border-white/15 px-5 py-4 text-center font-bold hover:bg-white/5" to={`/learner/missions/${module.module_id}/review?scope=missed`}>Review initially missed</Link><Link className="rounded-xl border border-white/15 px-5 py-4 text-center font-bold hover:bg-white/5" to={`/learner/missions/${module.module_id}/review?scope=all`}>Review all answers</Link></div>
      <Link className="mt-5 inline-flex rounded-xl border border-white/15 px-5 py-3 font-bold hover:bg-white/5" to={`/learner/missions/${module.module_id}/play`}>Try all questions again</Link>
    </section>
  );
}
