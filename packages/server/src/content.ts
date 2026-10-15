/**
 * Published content, loaded from content/modules/<module>/<module>.v<N>.json at
 * startup. Every file is validated; the server refuses to start with a broken
 * module so learners can never download one. Publishing a new version means
 * adding the file and restarting the API.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateModule, formatIssue, type ContentModule } from "../../content/src/index.ts";
import { ContentLibrary } from "../../analytics/src/index.ts";

export interface ContentRegistry {
  modules: ContentModule[];
  library: ContentLibrary;
}

export function loadContent(dir: string): ContentRegistry {
  const modules: ContentModule[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    for (const f of readdirSync(join(dir, d.name)).filter((x) => /\.v\d+\.json$/.test(x))) {
      const path = join(dir, d.name, f);
      const m = JSON.parse(readFileSync(path, "utf8")) as ContentModule;
      const errors = validateModule(m).filter((i) => i.severity === "error");
      if (errors.length) throw new Error(`${path} is not a valid module:\n${errors.map(formatIssue).join("\n")}`);
      modules.push(m);
    }
  }
  if (!modules.length) throw new Error(`No content modules found in ${dir}`);
  return { modules, library: new ContentLibrary(modules) };
}
