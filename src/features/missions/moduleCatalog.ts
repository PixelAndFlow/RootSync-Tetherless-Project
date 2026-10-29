import type { ModuleSummary, OfflineLearningGateway } from "../../services/offline/OfflineLearningGateway";
import type { TetherlessModule } from "../../types/content";
import { moduleLibrary } from "../../content/modules";

/**
 * Loads mission content through the gateway (API Spec v1.30 §8.1:
 * listAssignedModules / getModule), the piece DDIL already implements
 * (src/sync/gateway/ddil-gateway.ts) but that no screen called yet — every
 * learner screen read the one built-in fixture module directly instead.
 *
 * MockOfflineLearningGateway does not implement these two methods (they are
 * optional on StudentOfflineCapabilities), so demo mode falls back to the
 * built-in fixtures here, unchanged from before this file existed. Live mode
 * (DdilLearningGateway) always has them, so it always takes the real path.
 */

function fixtureSummaries(): ModuleSummary[] {
  return moduleLibrary.map((module) => ({
    moduleId: module.module_id,
    contentVersion: module.content_version,
    title: module.title,
    level: module.level,
    activityType: module.activity_type ?? "multiple_choice",
    downloadState: "available_offline",
  }));
}

const catalogCache = new WeakMap<OfflineLearningGateway, Promise<ModuleSummary[]>>();
const moduleCache = new WeakMap<OfflineLearningGateway, Map<string, Promise<TetherlessModule>>>();

/** The learner's assigned missions, or the demo fixtures when the gateway has no server to ask. */
export function loadModuleCatalog(gateway: OfflineLearningGateway): Promise<ModuleSummary[]> {
  if (!gateway.listAssignedModules) return Promise.resolve(fixtureSummaries());
  const cached = catalogCache.get(gateway);
  if (cached) return cached;
  const pending = gateway.listAssignedModules();
  catalogCache.set(gateway, pending);
  void pending.catch(() => catalogCache.delete(gateway));
  return pending;
}

/** Forces the next loadModuleCatalog call to ask the gateway again. */
export function invalidateModuleCatalog(gateway: OfflineLearningGateway): void {
  catalogCache.delete(gateway);
}

/**
 * One module's full content, by ID. When the content version isn't already
 * known, it's read from the assigned-module list first — the server scores
 * every attempt against the version it was started with (handoff
 * 2026-10-27, item 2 in "decisions made"), so playing whatever version is
 * actually assigned matters, not just "the latest".
 */
export async function loadModule(
  gateway: OfflineLearningGateway,
  moduleId: string,
  contentVersion?: number,
): Promise<TetherlessModule> {
  if (!gateway.getModule) {
    const found = moduleLibrary.find((module) => module.module_id === moduleId);
    if (!found) throw new Error(`Unknown module: ${moduleId}`);
    return found;
  }
  const version = contentVersion ?? (await versionFromCatalog(gateway, moduleId));
  let perGateway = moduleCache.get(gateway);
  if (!perGateway) {
    perGateway = new Map();
    moduleCache.set(gateway, perGateway);
  }
  const key = `${moduleId}:${version}`;
  const cached = perGateway.get(key);
  if (cached) return cached;
  const pending = gateway.getModule(moduleId, version);
  perGateway.set(key, pending);
  void pending.catch(() => perGateway!.delete(key));
  return pending;
}

async function versionFromCatalog(gateway: OfflineLearningGateway, moduleId: string): Promise<number> {
  const catalog = await loadModuleCatalog(gateway);
  return catalog.find((module) => module.moduleId === moduleId)?.contentVersion ?? 1;
}
