import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useOfflineLearningGateway } from "./GatewayProvider";
import type { SyncSummary } from "../../types/learning";

interface SyncStatusContextValue {
  summary: SyncSummary;
  isBrowserOnline: boolean;
  requestSync: () => Promise<void>;
}
const SyncStatusContext = createContext<SyncStatusContextValue | null>(null);

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const gateway = useOfflineLearningGateway();
  const [gatewaySummary, setGatewaySummary] = useState<SyncSummary>({ status: "pending", pendingEventCount: 0 });
  const latest = useRef(gatewaySummary);
  const inFlight = useRef(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState(() => navigator.onLine);
  const requestSync = useCallback(async () => {
    if (!navigator.onLine || inFlight.current || latest.current.status === "blocked_auth") return;
    inFlight.current = true;
    try { await gateway.requestSync(); }
    catch {
      setGatewaySummary((previous) => ({ ...previous, status: "retryable_error", failureReason: "Sync could not finish. Saved work has not been deleted." }));
    } finally { inFlight.current = false; }
  }, [gateway]);

  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    const unsubscribe = gateway.subscribeToSyncStatus((summary) => {
      receivedUpdate = true;
      latest.current = summary;
      setGatewaySummary(summary);
    });
    void gateway.getSyncSummary().then((summary) => {
      if (active && !receivedUpdate) { latest.current = summary; setGatewaySummary(summary); }
    }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [gateway]);
  useEffect(() => {
    const offline = () => setIsBrowserOnline(false);
    const online = () => { setIsBrowserOnline(true); void requestSync(); };
    const visible = () => { if (document.visibilityState === "visible") void requestSync(); };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [requestSync]);
  // Authorization/rejections remain visible even when connectivity is also absent.
  const summary = !isBrowserOnline && !["blocked_auth", "rejected"].includes(gatewaySummary.status)
    ? { ...gatewaySummary, status: "offline" as const } : gatewaySummary;
  const value = useMemo(() => ({ summary, isBrowserOnline, requestSync }), [summary, isBrowserOnline, requestSync]);
  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus(): SyncStatusContextValue {
  const value = useContext(SyncStatusContext);
  if (!value) throw new Error("useSyncStatus must be used inside SyncStatusProvider.");
  return value;
}
