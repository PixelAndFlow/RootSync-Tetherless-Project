// Builds block-the-threat.html: the game template plus the latest version of
// every module in content/modules, validated with the content package first.
//
//   node prototypes/block-the-threat/build.mjs
//
// Needs Node 22.18+ (it imports the content package's TypeScript directly).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateModule, formatIssue } from "../../packages/content/src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const modulesDir = join(here, "../../content/modules");

// Module order on the switcher. Modules not listed here are added after these.
const ORDER = ["pr-bootcamp-security-tools", "phishing-basics"];

const modules = [];
for (const dir of readdirSync(modulesDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const versions = readdirSync(join(modulesDir, dir.name))
    .map((f) => ({ f, v: Number(/\.v(\d+)\.json$/.exec(f)?.[1]) }))
    .filter((x) => Number.isInteger(x.v))
    .sort((a, b) => b.v - a.v);
  if (!versions.length) continue;
  const file = join(modulesDir, dir.name, versions[0].f);
  const module = JSON.parse(readFileSync(file, "utf8"));
  const errors = validateModule(module).filter((i) => i.severity === "error");
  if (errors.length) {
    console.error(`${file} has errors:\n${errors.map(formatIssue).join("\n")}`);
    process.exit(1);
  }
  if (!module.topics?.length || !module.boss_missions?.length) {
    console.error(`${file}: the game needs topics and boss_missions; skipping.`);
    continue;
  }
  modules.push(module);
  console.log(`Included ${module.module_id} v${module.content_version} (${module.questions.length} questions)`);
}
modules.sort((a, b) => {
  const ia = ORDER.indexOf(a.module_id), ib = ORDER.indexOf(b.module_id);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});

const template = readFileSync(join(here, "template.html"), "utf8");
const json = JSON.stringify(modules).replace(/<\//g, "<\\/");
const out = join(here, "block-the-threat.html");
writeFileSync(out, template.replace("/*MODULE_JSON*/", json));
console.log(`Wrote ${out}`);
