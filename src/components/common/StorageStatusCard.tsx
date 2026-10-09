import { useEffect, useState } from "react";

type StorageState =
  | { kind: "loading" }
  | { kind: "available"; usage?: number; quota?: number }
  | { kind: "unavailable" };

function formatMegabytes(bytes: number | undefined): string {
  return bytes === undefined ? "Not reported" : `${Math.max(0, bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StorageStatusCard() {
  const [storage, setStorage] = useState<StorageState>({ kind: "loading" });

  useEffect(() => {
    if (!navigator.storage?.estimate) {
      setStorage({ kind: "unavailable" });
      return;
    }
    void navigator.storage.estimate()
      .then(({ usage, quota }) => setStorage({ kind: "available", usage, quota }))
      .catch(() => setStorage({ kind: "unavailable" }));
  }, []);

  const detail = storage.kind === "loading"
    ? "Checking browser-managed storage..."
    : storage.kind === "unavailable"
      ? "This browser does not report a storage estimate. Keep important work synced when a connection is available."
      : `Used by this site: ${formatMegabytes(storage.usage)}. Browser-reported quota: ${formatMegabytes(storage.quota)}.`;

  return <aside aria-live="polite" className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-5"><p className="text-xs font-bold uppercase tracking-wider text-cyan-100">Device storage check</p><p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p><p className="mt-3 text-xs leading-5 text-slate-400">Install metadata is ready. Offline caching and persistent learner storage will be enabled only with the agreed DDIL adapter.</p></aside>;
}
