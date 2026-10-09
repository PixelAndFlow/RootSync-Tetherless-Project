import type { SyncStatus } from "../../types/learning";

const copy: Record<SyncStatus, string> = {
  offline: "Offline · saved locally",
  pending: "Waiting to sync",
  syncing: "Syncing",
  synced: "Saved locally",
  retryable_error: "Sync retry available",
  rejected: "Sync needs review",
};

const tone: Record<SyncStatus, string> = {
  offline: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  pending: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  syncing: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  synced: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  retryable_error: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  rejected: "border-rose-300/30 bg-rose-300/10 text-rose-100",
};

export function StatusChip({ status }: { status: SyncStatus }) {
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${tone[status]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{copy[status]}</span>;
}
