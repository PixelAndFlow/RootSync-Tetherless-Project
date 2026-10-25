// Read-only compatibility check. Uses the exact reviewed team commit, not a live
// moving branch or a copied validator. Does not add backend code to the app.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const ref = "e2ceb7e";
const root = "packages/content/src/";
const result = await build({
  entryPoints: [`${root}tetherless-module.ts`], bundle: true, write: false,
  platform: "browser", format: "esm", target: "es2022", minify: true,
  plugins: [{ name: "pinned-git-sources", setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      const resolved = args.importer ? path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), args.path)) : args.path;
      if (!resolved.startsWith(root) || !resolved.endsWith(".ts")) throw new Error(`Unexpected dependency: ${resolved}`);
      return { path: resolved, namespace: "git" };
    });
    builder.onLoad({ filter: /.*/, namespace: "git" }, (args) => ({
      contents: execFileSync("git", ["show", `${ref}:${args.path}`], { encoding: "utf8" }), loader: "ts",
    }));
  } }],
});
const bundled = result.outputFiles[0].text;
const { validateTetherlessModule } = await import(`data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`);
let errors = 0;
for (const file of ["src/content/fixtures/operation-cyber-squad.json", "src/content/fixtures/secure-workspace-basics.preview.json", "src/content/templates/tetherless-module.template.json"]) {
  const issues = validateTetherlessModule(JSON.parse(readFileSync(file, "utf8")));
  const failures = issues.filter((issue) => issue.severity === "error");
  errors += failures.length;
  console.log(`${file}: ${failures.length} errors, ${issues.filter((issue) => issue.severity === "warning").length} warnings`);
  for (const issue of failures) console.log(`  ${issue.code}: ${issue.location?.field ?? "module"}`);
}
console.log(`Shared validator ${ref}: browser bundle ${Buffer.byteLength(bundled)} bytes; no Node runtime dependencies.`);
if (errors) process.exitCode = 1;
