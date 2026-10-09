import { Link, NavLink, Outlet } from "react-router-dom";
import { StatusChip } from "../components/common/StatusChip";
import { useSyncStatus } from "./providers/SyncStatusProvider";

export function AppShell() {
  const { summary } = useSyncStatus();

  return (
    <div className="min-h-screen bg-ink text-slate-50">
      <a className="sr-only absolute left-4 top-4 z-50 rounded-lg bg-cyan-300 px-4 py-2 font-bold text-ink focus:not-sr-only" href="#main-content">Skip to main content</a>
      <header className="sticky top-0 border-b border-white/10 bg-ink/95 px-4 py-3 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4" aria-label="Primary navigation">
          <Link aria-label="Tetherless mission library" className="flex shrink-0 items-center gap-2 sm:gap-3" to="/learner/missions">
            <img alt="Raíces Cyber Organization" className="h-9 w-auto rounded bg-white px-1.5 py-1" src="/brand/rc_color.svg" />
            <span className="hidden text-sm font-bold tracking-[0.16em] min-[390px]:inline">TETHERLESS</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link aria-label="View sync status" className="hidden rounded-full sm:block" to="/learner/sync"><StatusChip status={summary.status} /></Link>
            <NavLink className={({ isActive }) => `inline-flex min-h-11 items-center rounded-lg px-2.5 py-2 sm:px-3 ${isActive ? "bg-white/10 text-white" : "text-slate-200 hover:bg-white/10"}`} to="/learner/missions">Missions</NavLink>
            <NavLink className={({ isActive }) => `inline-flex min-h-11 items-center rounded-lg px-2.5 py-2 sm:px-3 ${isActive ? "bg-white/10 text-white" : "text-slate-200 hover:bg-white/10"}`} to="/trainer">Trainer</NavLink>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8" id="main-content"><Outlet /></main>
    </div>
  );
}
