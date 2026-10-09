import { Link, Outlet } from "react-router-dom";
import { StatusChip } from "../components/common/StatusChip";
import { useSyncStatus } from "./providers/SyncStatusProvider";

export function AppShell() {
  const { summary } = useSyncStatus();

  return (
    <div className="min-h-screen bg-ink text-slate-50">
      <header className="sticky top-0 border-b border-white/10 bg-ink/95 px-4 py-3 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4" aria-label="Primary navigation">
          <Link className="flex items-center gap-3" to="/learner/missions">
            <img alt="Raíces Cyber Organization" className="h-9 w-auto rounded bg-white px-1.5 py-1" src="/brand/rc_color.svg" />
            <span className="text-sm font-bold tracking-[0.16em]">TETHERLESS</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link aria-label="View sync status" className="hidden rounded-full sm:block" to="/learner/sync"><StatusChip status={summary.status} /></Link>
            <Link className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10" to="/learner/missions">Missions</Link>
            <Link className="rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10" to="/trainer">Trainer</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8"><Outlet /></main>
    </div>
  );
}
