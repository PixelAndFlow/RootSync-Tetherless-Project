// Every published module in content/modules must validate, and each version
// must be a valid successor of the one before it (no reused or retired IDs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateModule, type ContentModule } from "../src/schema.ts";
import { checkAgainstPrevious } from "../src/versioning.ts";
import { formatIssue } from "../src/issues.ts";

const root = fileURLToPath(new URL("../../../content/modules/", import.meta.url));

for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const files = readdirSync(join(root, dir.name))
    .map((f) => ({ f, v: Number(/\.v(\d+)\.json$/.exec(f)?.[1]) }))
    .filter((x) => Number.isInteger(x.v))
    .sort((a, b) => a.v - b.v);

  test(`content/modules/${dir.name}: every version validates and follows the previous one`, () => {
    assert.ok(files.length > 0, "no versioned module files found");
    let previous: ContentModule | undefined;
    for (const { f, v } of files) {
      const m = JSON.parse(readFileSync(join(root, dir.name, f), "utf8")) as ContentModule;
      const errors = validateModule(m).filter((i) => i.severity === "error");
      assert.deepEqual(errors.map(formatIssue), [], f);
      assert.equal(m.module_id, dir.name, `${f}: module_id should match its folder`);
      assert.equal(m.content_version, v, `${f}: content_version should match the file name`);
      if (previous) {
        const checked = checkAgainstPrevious(previous, m);
        assert.deepEqual(checked.issues.filter((i) => i.severity === "error").map(formatIssue), [], f);
        assert.deepEqual([...m.retired_question_ids].sort(), checked.module.retired_question_ids, `${f}: retired_question_ids is out of date`);
      }
      previous = m;
    }
  });
}
