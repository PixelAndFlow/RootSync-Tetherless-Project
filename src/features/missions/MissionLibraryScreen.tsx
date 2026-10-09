import { Link } from "react-router-dom";
import { moduleLibrary } from "../../content/modules";

export function MissionLibraryScreen() {
  return (
    <section>
      <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">LEARNER MISSIONS</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Choose your next cyber mission.</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {moduleLibrary.map((module) => (
          <article className="rounded-2xl border border-white/10 bg-panel p-6" key={module.module_id}>
            <p className="text-sm font-semibold text-violet-200">{module.level}</p>
            <h2 className="mt-2 text-2xl font-bold">{module.title.en}</h2>
            <p className="mt-3 text-slate-300">{module.questions.length} questions · Available offline</p>
            <Link className="mt-5 inline-flex font-bold text-cyan-300 hover:text-cyan-200" to={`/learner/missions/${module.module_id}`}>View mission →</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
