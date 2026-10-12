import type { SyncStatus } from "../../types/learning";

const copy: Record<SyncStatus, string> = {
  offline: "Offline - saved locally",
  pending: "Saved locally - waiting to sync",
  syncing: "Saved locally - syncing",
  synced: "Synced with RCO",
  retryable_error: "Saved locally - retry sync",
  rejected: "Saved locally - needs review",
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
  return <span aria-live="polite" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${tone[status]}`} role="status"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{copy[status]}</span>;
}
