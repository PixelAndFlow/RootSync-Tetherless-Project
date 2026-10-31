import { useEffect, useState } from "react";
import { useOfflineLearningGateway, useOfflineLearningGatewayReady } from "../../app/providers/GatewayProvider";
import type { AttemptKind, AttemptRecord, LearnerModuleRecord } from "../../types/learning";
import type { TetherlessModule } from "../../types/content";
import { loadModule } from "./moduleCatalog";

interface ResumableModule {
  data: TetherlessModule | null;
  record: LearnerModuleRecord | null;
  activeAttempt: AttemptRecord | null;
  loading: boolean;
  error: unknown;
}
const empty: ResumableModule = { data: null, record: null, activeAttempt: null, loading: false, error: null };

/** Read the unfinished attempt BEFORE resolving today's assignment. Its cached
 * pinned package must remain usable offline even if a newer assignment exists. */
export function useResumableModule(moduleId: string | undefined, learnerId: string | undefined, kind: AttemptKind, retry: number): ResumableModule {
  const gateway = useOfflineLearningGateway();
  const ready = useOfflineLearningGatewayReady();
  const key = JSON.stringify([moduleId, learnerId, kind, retry]);
  const [state, setState] = useState<ResumableModule & { key: string }>({ ...empty, key: "" });
  useEffect(() => {
    let cancelled = false;
    if (!moduleId || !learnerId) return;
    setState({ ...empty, loading: true, key });
    void (async () => {
      if (ready) await ready;
      const record = await gateway.getLearnerModuleRecord(learnerId, moduleId);
      const activeAttempt = record?.attempts.filter((candidate) => candidate.kind === kind && candidate.status === "in_progress").at(-1) ?? null;
      if (activeAttempt && gateway.getModule && activeAttempt.contentVersion === undefined) throw new Error("Saved attempt content version is unavailable");
      const data = await loadModule(gateway, moduleId, activeAttempt?.contentVersion);
      if (data.module_id !== moduleId || (activeAttempt?.contentVersion !== undefined && data.content_version !== activeAttempt.contentVersion)) throw new Error("Saved attempt content does not match its version");
      if (!cancelled) setState({ data, record, activeAttempt, loading: false, error: null, key });
    })().catch((error) => { if (!cancelled) setState({ ...empty, error, key }); });
    return () => { cancelled = true; };
  }, [gateway, ready, moduleId, learnerId, kind, key]);
  return state.key === key ? state : { ...empty, loading: Boolean(moduleId && learnerId) };
}
