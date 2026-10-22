/**
 * Published content (spec v1.10 §7, §10.4). Modules are published into the
 * database through the staff API, in the app's format (TetherlessModule), and
 * never change once published. The scoring engine reads the canonical form.
 *
 * On first start, when the database has no modules, the repo's modules in
 * content/modules/<module>/<module>.v<N>.json are converted and published as
 * seed data, so a fresh server has something to assign.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatIssue, fromCanonical, toCanonical, validateModule, validateTetherlessModule, type ContentModule, type TetherlessModule } from "../../content/src/index.ts";
import { ContentLibrary } from "../../analytics/src/index.ts";
import type { ModuleVersionRow, Store } from "./store.ts";

export class ContentRegistry {
  library = new ContentLibrary([]);
  private bodies = new Map<string, TetherlessModule>();
  private readonly store: Store;

  private constructor(store: Store) {
    this.store = store;
  }

  /** Load published modules; seed from `seedDir` when the database has none. */
  static async open(store: Store, seedDir: string | null, now = new Date().toISOString()): Promise<ContentRegistry> {
    const reg = new ContentRegistry(store);
    if (seedDir && (await store.listModuleVersions()).length === 0) {
      for (const m of readSeedModules(seedDir).sort((a, b) => a.module_id.localeCompare(b.module_id) || a.content_version - b.content_version)) {
        const body = fromCanonical(m);
        await store.publishModuleVersion(
          { module_id: body.module_id, activity_type: body.activity_type ?? "multiple_choice", created_by: null, created_at: now, archived_at: null },
          { module_id: body.module_id, content_version: body.content_version, body, published_by: null, published_at: now },
        );
      }
    }
    await reg.reload();
    return reg;
  }

  /** Rebuild the scoring library from the database (after a publish or purge). */
  async reload(): Promise<void> {
    const rows: ModuleVersionRow[] = await this.store.listModuleVersions();
    this.bodies = new Map(rows.map((r) => [key(r.module_id, r.content_version), r.body]));
    this.library = new ContentLibrary(rows.map((r) => toCanonical(r.body)));
  }

  /** The module exactly as published (what phones download). */
  body(moduleId: string, version: number): TetherlessModule | undefined {
    return this.bodies.get(key(moduleId, version));
  }

  latestBody(moduleId: string): TetherlessModule | undefined {
    const m = this.library.latest(moduleId);
    return m && this.body(moduleId, m.content_version);
  }

  versions(moduleId: string): number[] {
    return [...this.bodies.values()].filter((b) => b.module_id === moduleId).map((b) => b.content_version).sort((a, b) => a - b);
  }

  get count(): number {
    return this.bodies.size;
  }
}

const key = (id: string, v: number) => `${id}@${v}`;

/** Read and check the repo's seed modules (older canonical format). */
export function readSeedModules(dir: string): ContentModule[] {
  const modules: ContentModule[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    for (const f of readdirSync(join(dir, d.name)).filter((x) => /\.v\d+\.json$/.test(x))) {
      const path = join(dir, d.name, f);
      const m = JSON.parse(readFileSync(path, "utf8")) as ContentModule;
      const errors = validateModule(m).filter((i) => i.severity === "error");
      if (errors.length) throw new Error(`${path} is not a valid module:\n${errors.map(formatIssue).join("\n")}`);
      const converted = validateTetherlessModule(fromCanonical(m)).filter((i) => i.severity === "error");
      if (converted.length) throw new Error(`${path} can't be converted to the app format:\n${converted.map(formatIssue).join("\n")}`);
      modules.push(m);
    }
  }
  return modules;
}
