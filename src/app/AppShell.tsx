import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { StatusChip } from "../components/common/StatusChip";
import { useSyncStatus } from "./providers/SyncStatusProvider";
import { useLearnerProfile } from "./providers/LearnerProfileProvider";

export function AppShell() {
  const { summary } = useSyncStatus();
  const { profile, resetProfile } = useLearnerProfile();
  const navigate = useNavigate();

  return (
    <div className={`min-h-screen bg-ink text-slate-50 ${profile?.colorTheme === "light" ? "app-light-theme" : ""} ${profile?.highContrast ? "app-high-contrast" : ""} ${profile?.reducedMotion ? "app-reduced-motion" : ""}`}>
      <a className="app-skip-link sr-only absolute left-4 top-4 z-50 rounded-lg px-4 py-2 font-bold focus:not-sr-only" href="#main-content">Skip to main content</a>
      <header className="app-header sticky top-0 border-b px-4 py-3 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4" aria-label="Primary navigation">
          <Link aria-label="Tetherless Student mission library" className="flex shrink-0 items-center gap-2 sm:gap-3" to="/learner/missions">
            <img alt="Raíces Cyber Organization" className="h-9 w-auto rounded bg-white px-1.5 py-1" src="/brand/rc_color.svg" />
            <span className="app-wordmark hidden text-sm font-bold tracking-[0.16em] min-[390px]:inline">TETHERLESS</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link aria-label="View sync status" className="hidden rounded-full sm:block" to="/learner/sync"><StatusChip status={summary.status} /></Link>
            <NavLink className={({ isActive }) => `app-nav-link inline-flex min-h-11 items-center rounded-lg px-2.5 py-2 sm:px-3 ${isActive ? "app-nav-link-active" : "app-nav-link-inactive"}`} to="/learner/missions">Missions</NavLink>
            <NavLink className={({ isActive }) => `app-nav-link inline-flex min-h-11 items-center rounded-lg px-2.5 py-2 sm:px-3 ${isActive ? "app-nav-link-active" : "app-nav-link-inactive"}`} to="/trainer">Trainer</NavLink>
            <NavLink className={({ isActive }) => `app-nav-link inline-flex min-h-11 items-center rounded-lg px-2.5 py-2 sm:px-3 ${isActive ? "app-nav-link-active" : "app-nav-link-inactive"}`} to="/staff">Staff</NavLink>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8" id="main-content" tabIndex={-1}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm"><p>Frontend demo · sample data · sync is simulated</p>{profile && <Link className="ui-action-secondary" to="/learner/settings">Profile and settings</Link>}</div>
        <Outlet />
      </main>
      {import.meta.env.DEV && <aside className="mx-auto mb-6 max-w-6xl px-4" aria-label="Development controls"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-amber-300/25 bg-amber-300/5 px-4 py-3 text-xs text-amber-100"><span>Development-only controls never appear in a production build.</span><button className="rounded-lg border border-amber-300/35 px-3 py-2 font-bold hover:bg-amber-300/10" onClick={() => { resetProfile(); navigate("/learner"); }} type="button">Reset local demo</button></div></aside>}
    </div>
  );
}
