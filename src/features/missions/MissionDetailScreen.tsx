import { Link, useParams } from "react-router-dom";
import { moduleLibrary } from "../../content/modules";

export function MissionDetailScreen() {
  const { moduleId } = useParams();
  const module = moduleLibrary.find((candidate) => candidate.module_id === moduleId) ?? moduleLibrary[0];

  return (
    <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-3xl border border-violet-300/20 bg-panel p-6 sm:p-10">
        <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">{module.level.toUpperCase()} MISSION</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{module.title.en}</h1>
        {module.subtitle && <p className="mt-3 text-lg text-violet-200">{module.subtitle.en}</p>}
        {module.mission_brief && <p className="mt-6 max-w-2xl leading-7 text-slate-300">{module.mission_brief.en}</p>}
        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 font-semibold text-emerald-200">Available offline</span>
          <span className="rounded-full border border-white/15 px-3 py-1.5 text-slate-300">{module.questions.length} questions</span>
          <span className="rounded-full border border-white/15 px-3 py-1.5 text-slate-300">No timer</span>
        </div>
        <Link className="mt-8 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-bold hover:bg-violet-500" to={`/learner/missions/${module.module_id}/play`}>Start mission</Link>
      </div>
      <aside className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-violet-700/40 to-cyan-500/10 p-6">
        <p className="text-xs font-bold tracking-[0.2em] text-cyan-200">FOUNDATION CHECK</p>
        <p className="mt-4 text-2xl font-bold">JSON fixture loaded</p>
        <p className="mt-3 leading-7 text-slate-200">Question content stays in the module fixture. The final UI will select the visual presentation from each question’s presentation token.</p>
      </aside>
    </section>
  );
}
