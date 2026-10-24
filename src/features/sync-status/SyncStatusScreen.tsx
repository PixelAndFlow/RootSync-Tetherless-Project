import { Link } from "react-router-dom";
import { StatusChip } from "../../components/common/StatusChip";
import { useSyncStatus } from "../../app/providers/SyncStatusProvider";

const stateCopy = {
  offline: { title: "You are offline. Your Student work is saved locally.", detail: "Keep working normally. New activity will wait here until a connection returns." },
  pending: { title: "Your latest Student work is saved locally.", detail: "It is waiting for a safe connection before it uploads to RCO." },
  syncing: { title: "Your saved Student work is syncing.", detail: "Your activity remains saved locally while RCO receives the latest acknowledged activity." },
  synced: { title: "Your Student record is synced with RCO.", detail: "RCO has acknowledged the latest activity from this device." },
  blocked_auth: { title: "Sync paused — this device needs authorization.", detail: "Your saved work has not been deleted. Contact your trainer for help. Do not clear this device's data." },
  retryable_error: { title: "Sync could not finish yet.", detail: "Your work remains saved locally. Retry when a connection is stable." },
  rejected: { title: "A saved activity needs review.", detail: "Your work remains protected locally; the team can inspect the issue without deleting it." },
};

export function SyncStatusScreen() {
  const { summary, isBrowserOnline, requestSync } = useSyncStatus();
  const copy = stateCopy[summary.status];
  const canSync = isBrowserOnline && summary.status !== "syncing" && summary.status !== "blocked_auth";

  return <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-panel p-6 shadow-2xl shadow-black/25 sm:p-10"><p className="text-xs font-bold tracking-[0.18em] text-cyan-300">OFFLINE & SYNC STATUS</p><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">{copy.title}</h1><p className="mt-3 max-w-xl leading-7 text-slate-300">{copy.detail}</p></div><StatusChip status={summary.status} /></div><div className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-ink/45 p-5 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Saved activity waiting</p><p className="mt-2 text-3xl font-extrabold">{summary.pendingEventCount}</p><p className="mt-1 text-sm text-slate-400">event{summary.pendingEventCount === 1 ? "" : "s"} in the local sync queue</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Last acknowledged sync</p><p className="mt-2 text-base font-bold">{summary.lastSyncedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(summary.lastSyncedAt)) : "Not yet synced"}</p><p className="mt-2 text-sm text-slate-400">Browser connection: {isBrowserOnline ? "available" : "offline"}</p></div></div>{summary.failureReason && <p className="mt-4 rounded-xl border border-rose-300/25 bg-rose-300/10 p-4 text-sm text-rose-100">{summary.failureReason}</p>}<div className="mt-7 flex flex-wrap gap-3"><button className="rounded-xl bg-violet-600 px-5 py-3 font-bold hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40" disabled={!canSync} onClick={() => void requestSync()} type="button">{summary.status === "retryable_error" ? "Retry sync" : "Sync now"}</button><Link className="rounded-xl border border-white/15 px-5 py-3 font-bold hover:bg-white/5" to="/learner/missions">Return to missions</Link></div><p className="mt-7 text-xs leading-5 text-slate-500">Tetherless never deletes unsynced Student activity automatically. This screen shows Student-friendly status only, not technical queue IDs or backend details.</p></section>;
}
