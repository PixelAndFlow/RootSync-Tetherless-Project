import type { SyncStatus } from "../../types/learning";

const copy: Record<SyncStatus, string> = {
  offline: "Offline - saved locally",
  pending: "Saved locally - waiting to sync",
  syncing: "Saved locally - syncing",
  synced: "Synced with RCO",
  blocked_auth: "Saved locally - authorization needed",
  retryable_error: "Saved locally - retry sync",
  rejected: "Saved locally - needs review",
};

export function StatusChip({ status }: { status: SyncStatus }) {
  return <span aria-label={`Sync status: ${copy[status]}`} aria-live="polite" className="app-status-chip inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold" role="status"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{copy[status]}</span>;
}
