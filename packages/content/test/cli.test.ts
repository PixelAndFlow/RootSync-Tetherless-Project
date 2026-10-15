import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "./helpers.ts";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
const meta = ["--module-id", "test-module", "--content-version", "1", "--title-en", "Test"];

test("CLI writes the module and exits 0 for a valid file", () => {
  const dir = mkdtempSync(join(tmpdir(), "content-cli-"));
  const out = join(dir, "m.json");
  const r = run(fixture("kahoot_simple.xlsx"), ...meta, "--out", out);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const m = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(m.questions.length, 3);
});

test("CLI exits 1 and writes nothing when the file has errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "content-cli-"));
  const out = join(dir, "m.json");
  const report = join(dir, "report.json");
  const r = run(fixture("kahoot_template_with_problems.xlsx"), ...meta, "--out", out, "--report", report);
  assert.equal(r.status, 1);
  assert.equal(existsSync(out), false);
  assert.match(r.stdout, /MULTIPLE_CORRECT_NOT_SUPPORTED.*row 6/);
  assert.equal(JSON.parse(readFileSync(report, "utf8")).ok, false);
});

test("CLI exits 2 on bad usage or an invalid --previous file", () => {
  assert.equal(run().status, 2);
  assert.equal(run(fixture("kahoot_simple.xlsx"), "--content-version", "zero").status, 2);
  const dir = mkdtempSync(join(tmpdir(), "content-cli-"));
  const prev = join(dir, "prev.json");
  writeFileSync(prev, "{}");
  assert.equal(run(fixture("kahoot_simple.xlsx"), ...meta, "--previous", prev).status, 2);
});

test("CLI --dry-run validates without writing", () => {
  const r = run(fixture("kahoot_simple.xlsx"), ...meta, "--dry-run");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Dry run/);
});
