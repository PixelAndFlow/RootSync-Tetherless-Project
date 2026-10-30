import { useState } from "react";
import { useOfflineLearningGateway } from "../../app/providers/GatewayProvider";
import { useSyncStatus } from "../../app/providers/SyncStatusProvider";

/** An explicit check after staff assistance; it cannot bypass server authorization. */
export function AuthorizationRecovery() {
  const gateway = useOfflineLearningGateway();
  const { summary, isBrowserOnline, requestSync } = useSyncStatus();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  if ((summary.status !== "blocked_auth" && !summary.authorizationReason) || !gateway.recoverAuth) return null;
  const check = async () => {
    setChecking(true);
    setError(false);
    try { await gateway.recoverAuth!(); await requestSync(); }
    catch { setError(true); }
    finally { setChecking(false); }
  };
  return <div className="mt-5">
    <p className="text-sm text-slate-300">After your trainer restores access, check authorization to resume your saved uploads.</p>
    <button className="mt-3 rounded-xl border border-white/15 px-5 py-3 font-bold disabled:opacity-40" disabled={!isBrowserOnline || checking} onClick={() => void check()} type="button">{checking ? "Checking authorization…" : "Check authorization"}</button>
    {error && <p className="mt-3 text-sm text-rose-100" role="alert">Authorization could not be confirmed. Your work remains saved. Ask your trainer for help or try again when connected.</p>}
  </div>;
}
