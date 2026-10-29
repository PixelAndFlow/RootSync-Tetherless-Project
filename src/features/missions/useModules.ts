import { useEffect, useState } from "react";
import { useOfflineLearningGateway, useOfflineLearningGatewayReady } from "../../app/providers/GatewayProvider";
import { loadModule, loadModuleCatalog } from "./moduleCatalog";
import type { ModuleSummary } from "../../services/offline/OfflineLearningGateway";
import type { TetherlessModule } from "../../types/content";

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
}

/** The learner's assigned missions (API Spec v1.30 §8.1 listAssignedModules), or the demo fixtures in mock mode. */
export function useModuleCatalog(): AsyncResource<ModuleSummary[]> {
  const gateway = useOfflineLearningGateway();
  const ready = useOfflineLearningGatewayReady();
  const [state, setState] = useState<AsyncResource<ModuleSummary[]>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      try {
        if (ready) await ready;
        const modules = await loadModuleCatalog(gateway);
        if (!cancelled && current === request) setState({ data: modules, loading: false, error: null });
      } catch (error) {
        if (!cancelled && current === request) setState({ data: null, loading: false, error });
      }
    };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    setState({ data: null, loading: true, error: null });
    void refresh();
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [gateway, ready]);

  return state;
}

/** One mission's full content (API Spec v1.30 §8.1 getModule), downloaded and cached through the gateway. */
export function useModule(moduleId: string | undefined): AsyncResource<TetherlessModule> {
  const gateway = useOfflineLearningGateway();
  const ready = useOfflineLearningGatewayReady();
  const [state, setState] = useState<AsyncResource<TetherlessModule>>({ data: null, loading: Boolean(moduleId), error: null });

  useEffect(() => {
    if (!moduleId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    void (async () => {
      try {
        if (ready) await ready;
        const module = await loadModule(gateway, moduleId);
        if (!cancelled) setState({ data: module, loading: false, error: null });
      } catch (error) {
        if (!cancelled) setState({ data: null, loading: false, error });
      }
    })();
    return () => { cancelled = true; };
  }, [gateway, ready, moduleId]);

  return state;
}
