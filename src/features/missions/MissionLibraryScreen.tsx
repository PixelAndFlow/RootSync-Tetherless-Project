import { Link } from "react-router-dom";
import { moduleLibrary } from "../../content/modules";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { StorageStatusCard } from "../../components/common/StorageStatusCard";
import { DisplayPreferences } from "../../components/learner/DisplayPreferences";
import { learnerCopy } from "../../copy/ui";

export function MissionLibraryScreen() {
  const { profile, setHighContrast, setReducedMotion } = useLearnerProfile();
  return (
    <section>
      <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">LEARNER MISSIONS</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{profile ? `Welcome back, ${profile.displayName.split(" ")[0]}.` : "Choose your next cyber mission."}</h1>
      <p className="mt-3 max-w-2xl text-slate-400">{learnerCopy.libraryDescription}</p>
      <StorageStatusCard />
      {profile && <DisplayPreferences highContrast={profile.highContrast} reducedMotion={profile.reducedMotion} onHighContrastChange={setHighContrast} onReducedMotionChange={setReducedMotion} />}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {moduleLibrary.map((module) => (
          <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-panel p-6" key={module.module_id}>
            <div className="absolute -right-5 -top-7 h-28 w-28 rounded-full bg-violet-500/15 blur-2xl" />
            <p className="relative text-sm font-semibold text-violet-200">{module.level}</p>
            <h2 className="mt-2 text-2xl font-bold">{module.title.en}</h2>
            <p className="mt-3 text-slate-300">{module.questions.length} questions · No timer</p>
            <span className="mt-4 inline-flex rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">{learnerCopy.offlineReadinessLabel}</span>
            <Link className="mt-5 inline-flex font-bold text-cyan-300 hover:text-cyan-200" to={`/learner/missions/${module.module_id}`}>View mission →</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
