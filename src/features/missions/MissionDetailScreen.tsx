import { Link, useParams } from "react-router-dom";
import { ReturnLink } from "../../components/common/ReturnLink";
import { useModule } from "./useModules";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { learnerCopy } from "../../copy/ui";
import { SectorIcon } from "../../components/gamification/SectorIcon";
import { EmptyState, LoadingState } from "../../components/common/PageState";

export function MissionDetailScreen() {
  const { moduleId } = useParams();
  const { data: module, loading, error } = useModule(moduleId);
  const { profile } = useLearnerProfile();

  if (loading) return <LoadingState label="Loading mission details…" />;
  if (error || !module) return <EmptyState actionLabel="Mission library" actionTo="/learner/missions" detail="This mission could not be loaded. Check your connection and try again." title="Mission unavailable." />;

  const sectors = module.gamification?.sectors ?? [];
  const questionNumbers = new Map(module.questions.map((question, index) => [question.id, index + 1]));

  const formatQuestionRange = (questionIds: string[]) => {
    const positions = questionIds.map((id) => questionNumbers.get(id)).filter((position): position is number => position !== undefined);
    if (positions.length === 0) return "Questions unavailable";
    const first = Math.min(...positions);
    const last = Math.max(...positions);
    return first === last ? `Question ${first}` : `Questions ${first}–${last}`;
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-3xl border border-violet-300/20 bg-panel p-6 sm:p-10">
        <ReturnLink to="/learner/missions">Mission library</ReturnLink>
        <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">{module.level.toUpperCase()} MISSION</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{module.title.en}</h1>
        <p className="mt-5 max-w-2xl leading-7 text-slate-300">Your first training mission is ready. Learn how cybersecurity teams work and how to make safe, authorized decisions.</p>
        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <span className="app-offline-badge rounded-full border px-3 py-1.5 font-semibold">{learnerCopy.offlineReadinessLabel}</span>
          <span className="rounded-full border border-white/15 px-3 py-1.5 text-slate-300">{module.questions.length} questions</span>
          <span className="rounded-full border border-white/15 px-3 py-1.5 text-slate-300">No timer</span>
        </div>
        <Link className="mt-8 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-bold text-white hover:bg-violet-500" to={profile ? `/learner/missions/${module.module_id}/play` : "/learner"}>{profile ? "Start mission" : "Set up to start"}</Link>
      </div>
      <aside className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-violet-700/40 to-cyan-500/10 p-6">
        <p className="text-xs font-bold tracking-[0.2em] text-cyan-200">MISSION FOCUS</p>
        <h2 className="mt-4 text-2xl font-bold">What you’ll learn</h2>
        <ul className="mt-4 grid gap-3 text-sm leading-6 text-slate-200">
          <li>Understand cybersecurity team roles and responsibilities.</li>
          <li>Recognize authorization, safe scope, and ethical choices.</li>
          <li>Protect evidence and understand version-control basics.</li>
        </ul>
        <p className="mt-5 text-sm font-semibold text-slate-200">Learn at your own pace—mistakes are part of practice.</p>
      </aside>
      <div className="rounded-3xl border border-white/10 bg-panel p-6 lg:col-span-2">
        <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">MISSION MAP</p>
        <p className="mt-2 text-sm text-slate-400">Four checkpoints. Complete them in order.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{sectors.map((sector, index) => <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" key={sector.id}><div className="flex items-start justify-between gap-3"><SectorIcon className="h-7 w-7 text-[#5A1EE4]" sectorId={sector.id} /><span className="text-xs font-semibold text-slate-400">{index + 1} of {sectors.length}</span></div><p className="mt-3 font-bold">{sector.name.en}</p><p className="mt-1 text-sm text-slate-400">{formatQuestionRange(sector.question_ids)}</p></div>)}</div>
      </div>
    </section>
  );
}
