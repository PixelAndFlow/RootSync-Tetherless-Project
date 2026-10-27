/**
 * Every route the server registers must be in openapi.yaml, and every operation in
 * openapi.yaml must be a route the server registers. Compared as "METHOD path" with
 * path parameters normalised (`{learner_id}` and `:id` both become `:P`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
const yaml = readFileSync(fileURLToPath(new URL("../../contract/openapi.yaml", import.meta.url)), "utf8");

const normalise = (path: string) => path.replace(/\{[^}]+\}/g, ":P").replace(/:[A-Za-z_]+/g, ":P");

function serverRoutes(): string[] {
  const routes: string[] = [];
  for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(srcDir + file, "utf8");
    for (const m of text.matchAll(/router\.add\("([A-Z]+)", ["`]([^"`]+)["`]/g)) {
      const [, method, path] = m;
      if (path!.includes("${action}")) {
        // The one registered in a loop: staff accounts are disabled and enabled by the same code.
        for (const action of ["disable", "enable"]) routes.push(`${method} ${normalise(path!.replace("${action}", action))}`);
      } else {
        assert.ok(!path!.includes("${"), `route ${path} in ${file} is built dynamically; teach this test about it`);
        routes.push(`${method} ${normalise(path!)}`);
      }
    }
  }
  return routes;
}

function openapiRoutes(): string[] {
  const routes: string[] = [];
  let path: string | null = null;
  for (const line of yaml.slice(yaml.indexOf("\npaths:")).split("\n")) {
    const p = line.match(/^ {2}(\/\S*):\s*$/);
    if (p) { path = p[1]!; continue; }
    const op = line.match(/^ {4}(get|post|put|patch|delete):/);
    if (op && path) routes.push(`${op[1]!.toUpperCase()} ${normalise(path)}`);
  }
  return routes;
}

test("the routes the server registers and the operations in openapi.yaml are the same set", () => {
  const server = new Set(serverRoutes());
  const documented = new Set(openapiRoutes());
  assert.ok(server.size > 30, "found too few server routes; the extraction is broken");
  assert.deepEqual([...server].filter((r) => !documented.has(r)).sort(), [], "routes the server registers but openapi.yaml does not document");
  assert.deepEqual([...documented].filter((r) => !server.has(r)).sort(), [], "operations documented in openapi.yaml that the server does not register");
});
