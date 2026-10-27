/**
 * Command-line content importer.
 *
 *   node src/cli.ts <input file> [options]
 *
 * Writes the canonical module JSON only when there are no errors, so a broken
 * file can never be published by accident. Exit codes: 0 success, 1 the file
 * has errors, 2 the command itself was used incorrectly.
 */

import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { formatIssue, type Issue } from "./issues.ts";
import { importFile, type ImportOptions } from "./import.ts";
import { validateModule, type ContentModule } from "./schema.ts";
import type { BilingualOrder } from "./text.ts";

const HELP = `Usage: node src/cli.ts <file.json|file.csv|file.xlsx> [options]

Options for CSV and Kahoot spreadsheets (JSON files already contain these):
  --module-id <id>          e.g. pr-bootcamp-tools
  --content-version <n>     whole number, higher than the previous version
  --title-en <text>         module title in English
  --title-es <text>         module title in Spanish (optional)
  --order es-en|en-es       language order in "A / B" cells (default es-en)

General options:
  --previous <file.json>    previously published version of this module;
                            keeps question IDs stable and checks for reuse
  --out <file.json>         where to write the result
                            (default <module_id>.v<content_version>.json)
  --report <file.json>      also write all issues as JSON
  --dry-run                 validate only; do not write the module
  -h, --help                show this help
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${HELP}`);
  process.exit(2);
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        "module-id": { type: "string" },
        "content-version": { type: "string" },
        "title-en": { type: "string" },
        "title-es": { type: "string" },
        order: { type: "string" },
        previous: { type: "string" },
        out: { type: "string" },
        report: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    fail((e as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (positionals.length !== 1) fail("Give exactly one input file.");
  const input = positionals[0] as string;

  const opts: ImportOptions = {};
  if (values["module-id"]) opts.module_id = values["module-id"];
  if (values["content-version"] !== undefined) {
    const n = Number(values["content-version"]);
    if (!Number.isInteger(n) || n < 1) fail("--content-version must be a whole number of 1 or more.");
    opts.content_version = n;
  }
  if (values["title-en"]) opts.title_en = values["title-en"];
  if (values["title-es"]) opts.title_es = values["title-es"];
  if (values.order) {
    if (values.order !== "es-en" && values.order !== "en-es") fail('--order must be "es-en" or "en-es".');
    opts.order = values.order as BilingualOrder;
  }

  if (values.previous) {
    let prev: unknown;
    try {
      prev = JSON.parse(await readFile(values.previous, "utf8"));
    } catch (e) {
      fail(`Could not read --previous file: ${(e as Error).message}`);
    }
    const prevErrors = validateModule(prev).filter((i) => i.severity === "error");
    if (prevErrors.length > 0) {
      process.stderr.write(`The --previous file is not a valid module:\n${prevErrors.map(formatIssue).join("\n")}\n`);
      return 2;
    }
    opts.previous = prev as ContentModule;
  }

  const outcome = await importFile(input, opts);
  printReport(input, outcome.issues, outcome.module);

  if (values.report) {
    await writeFile(values.report, `${JSON.stringify({ ok: outcome.ok, issues: outcome.issues }, null, 2)}\n`, "utf8");
  }

  if (!outcome.ok || !outcome.module) {
    process.stderr.write("\nNot written: fix the errors above and run again.\n");
    return 1;
  }
  if (values["dry-run"]) {
    process.stdout.write("\nDry run: file is valid; nothing written.\n");
    return 0;
  }
  const out = values.out ?? `${outcome.module.module_id}.v${outcome.module.content_version}.json`;
  await writeFile(out, `${JSON.stringify(outcome.module, null, 2)}\n`, "utf8");
  process.stdout.write(`\nWrote ${out}\n`);
  return 0;
}

function printReport(input: string, issues: Issue[], module: ContentModule | undefined): void {
  const count = (s: Issue["severity"]) => issues.filter((i) => i.severity === s).length;
  const lines = [
    `File: ${input}`,
    module ? `Module: ${module.module_id} v${module.content_version} — ${module.questions.length} questions` : "Module: (not readable)",
    `Errors: ${count("error")}  Warnings: ${count("warning")}  Notes: ${count("info")}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  const order = { error: 0, warning: 1, info: 2 } as const;
  for (const issue of [...issues].sort((a, b) => order[a.severity] - order[b.severity])) {
    process.stdout.write(`  ${formatIssue(issue)}\n`);
  }
}

process.exitCode = await main();
