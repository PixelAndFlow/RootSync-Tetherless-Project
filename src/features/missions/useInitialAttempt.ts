import { useEffect, useState } from "react";
import { useOfflineLearningGateway, useOfflineLearningGatewayReady } from "../../app/providers/GatewayProvider";
import type { AttemptRecord, LearnerModuleRecord } from "../../types/learning";
import type { TetherlessModule } from "../../types/content";
import { loadModule } from "./moduleCatalog";

interface InitialAttemptResource {
  record: LearnerModuleRecord | null;
  attempt: AttemptRecord | null;
  module: TetherlessModule | null;
  loading: boolean;
  error: unknown;
}

const empty: InitialAttemptResource = { record: null, attempt: null, module: null, loading: false, error: null };

/** Historical results must use the package the first completed full attempt used. */
export function useInitialAttempt(moduleId: string | undefined, learnerId: string | undefined): InitialAttemptResource {
  const gateway = useOfflineLearningGateway();
  const ready = useOfflineLearningGatewayReady();
  const key = JSON.stringify([moduleId, learnerId]);
  const [state, setState] = useState<InitialAttemptResource & { key: string }>({ ...empty, key: "" });

  useEffect(() => {
    let cancelled = false;
    setState({ ...empty, key, loading: Boolean(moduleId && learnerId) });
    if (!moduleId || !learnerId) return;
    void (async () => {
      try {
        if (ready) await ready;
        const record = await gateway.getLearnerModuleRecord(learnerId, moduleId);
        const attempt = record?.attempts.find((candidate) => candidate.kind === "full" && candidate.status === "completed") ?? null;
        let module: TetherlessModule | null = null;
        if (attempt) {
          // Only the legacy fixture gateway may omit version metadata. A live
          // record without a version must not silently use today's assignment.
          if (gateway.getModule && attempt.contentVersion === undefined) throw new Error("Original content version is unavailable");
          module = await loadModule(gateway, moduleId, attempt.contentVersion);
          if (module.module_id !== moduleId || (attempt.contentVersion !== undefined && module.content_version !== attempt.contentVersion)) {
            throw new Error("Original content version does not match the saved attempt");
          }
        }
        if (!cancelled) setState({ record, attempt, module, loading: false, error: null, key });
      } catch (error) {
        if (!cancelled) setState({ ...empty, key, error });
      }
    })();
    return () => { cancelled = true; };
  }, [gateway, ready, moduleId, learnerId, key]);

  return state.key === key ? state : { ...empty, loading: Boolean(moduleId && learnerId) };
}
