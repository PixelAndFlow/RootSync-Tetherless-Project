import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useOfflineLearningGateway } from "./GatewayProvider";
import type { SyncSummary } from "../../types/learning";

interface SyncStatusContextValue {
  summary: SyncSummary;
  isBrowserOnline: boolean;
  requestSync: () => Promise<void>;
}

const SyncStatusContext = createContext<SyncStatusContextValue | null>(null);

const initialSummary: SyncSummary = { status: "synced", pendingEventCount: 0 };

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const offlineLearningGateway = useOfflineLearningGateway();
  const [gatewaySummary, setGatewaySummary] = useState<SyncSummary>(initialSummary);
  const [isBrowserOnline, setIsBrowserOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  const requestSync = async () => {
    if (!isBrowserOnline) return;
    await offlineLearningGateway.requestSync();
  };

  useEffect(() => {
    const unsubscribe = offlineLearningGateway.subscribeToSyncStatus(setGatewaySummary);
    void offlineLearningGateway.requestSync();
    return unsubscribe;
  }, []);
  useEffect(() => {
    const handleOffline = () => setIsBrowserOnline(false);
    const handleOnline = () => {
      setIsBrowserOnline(true);
      void offlineLearningGateway.requestSync();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void offlineLearningGateway.requestSync();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const summary = !isBrowserOnline
    ? { ...gatewaySummary, status: "offline" as const }
    : gatewaySummary;
  const value = useMemo(() => ({ summary, isBrowserOnline, requestSync }), [summary, isBrowserOnline]);
  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus(): SyncStatusContextValue {
  const value = useContext(SyncStatusContext);
  if (!value) throw new Error("useSyncStatus must be used inside SyncStatusProvider.");
  return value;
}
