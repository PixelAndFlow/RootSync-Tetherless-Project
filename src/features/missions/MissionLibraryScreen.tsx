import { Link, useSearchParams } from "react-router-dom";
import { useModuleCatalog } from "./useModules";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { StorageStatusCard } from "../../components/common/StorageStatusCard";
import { DisplayPreferences } from "../../components/learner/DisplayPreferences";
import { learnerCopy } from "../../copy/ui";
import { EmptyState, LoadingState } from "../../components/common/PageState";
import { mockScenarioCopy } from "../../services/mockScenarios";

export function MissionLibraryScreen() {
  const { profile, setHighContrast, setReducedMotion, setColorTheme } = useLearnerProfile();
  const [params] = useSearchParams();
  const noAssignedModules = params.get("scenario") === "no-assigned-modules";
  const { data: modules, loading, error } = useModuleCatalog();
  return (
    <section>
      <p className="app-section-eyebrow text-xs font-bold tracking-[0.2em]">STUDENT MISSIONS</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{profile ? `Welcome back, ${profile.displayName.split(" ")[0]}.` : "Choose your next cyber mission."}</h1>
      <p className="mt-3 max-w-2xl text-slate-400">{learnerCopy.libraryDescription}</p>
      <StorageStatusCard />
      {profile && <DisplayPreferences colorTheme={profile.colorTheme} highContrast={profile.highContrast} reducedMotion={profile.reducedMotion} onColorThemeChange={setColorTheme} onHighContrastChange={setHighContrast} onReducedMotionChange={setReducedMotion} />}
      {noAssignedModules ? (
        <div className="mt-8"><EmptyState detail={mockScenarioCopy.no_assigned_modules.detail} title={mockScenarioCopy.no_assigned_modules.title} /></div>
      ) : loading ? (
        <div className="mt-8"><LoadingState label="Loading your assigned missions…" /></div>
      ) : error ? (
        <div className="mt-8"><EmptyState detail="Your missions could not be loaded. Check your connection and try again." title="Missions are unavailable." /></div>
      ) : !modules || modules.length === 0 ? (
        <div className="mt-8"><EmptyState detail={mockScenarioCopy.no_assigned_modules.detail} title={mockScenarioCopy.no_assigned_modules.title} /></div>
      ) : (
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-panel p-6" key={module.moduleId}>
            <div className="absolute -right-5 -top-7 h-28 w-28 rounded-full bg-violet-500/15 blur-2xl" />
            <p className="relative text-2xl font-bold text-violet-200">{module.level.charAt(0).toUpperCase() + module.level.slice(1)}</p>
            <h2 className="mt-2 text-2xl font-bold">{module.title.en}</h2>
            <p className="mt-3 text-slate-300">No timer</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="app-offline-badge inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold">{module.downloadState === "available_offline" ? learnerCopy.offlineReadinessLabel : "Downloads when opened"}</span>
              <Link className="ui-action min-h-11 px-4 text-sm" to={`/learner/missions/${module.moduleId}`}>Start mission →</Link>
            </div>
          </article>
        ))}
      </div>
      )}
    </section>
  );
}
