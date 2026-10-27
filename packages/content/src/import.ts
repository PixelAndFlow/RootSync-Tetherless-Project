/**
 * Entry point: turn a content file of any supported format into a validated
 * canonical module.
 *
 *   .json          canonical JSON (validated as-is)
 *   .csv           Tetherless template CSV, or a Kahoot sheet saved as CSV
 *   .xlsx          Kahoot spreadsheet (first sheet)
 *
 * The result always contains every issue found. `module` is present whenever
 * the file could be read, even if it has errors, so tools can show a preview;
 * callers must check `ok` before publishing.
 */

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { IssueList, type Issue } from "./issues.ts";
import { validateModule, type ContentModule } from "./schema.ts";
import { parseCsv } from "./csv.ts";
import { readXlsxFirstSheet } from "./xlsx.ts";
import { cleanText } from "./text.ts";
import { attachRows, type Grid, type ModuleOptions } from "./formats/common.ts";
import { isTetherlessCsvHeader, parseTetherlessGrid } from "./formats/tetherless-csv.ts";
import { findKahootHeaderRow, parseKahootGrid, type KahootOptions } from "./formats/kahoot.ts";
import { checkAgainstPrevious } from "./versioning.ts";

/** What a format adapter returns before shared validation runs. */
export interface ImportResult {
  module?: ContentModule;
  issues: Issue[];
  /** Spreadsheet row for each question, so schema errors can name the row. */
  rowForQuestionIndex?: number[];
}

export interface ImportOutcome {
  ok: boolean;
  module?: ContentModule;
  issues: Issue[];
}

export type ImportOptions = Partial<KahootOptions>;

const FLAT_FILE_REQUIRES = ["module_id", "content_version", "title_en"] as const;

function requireModuleOptions(opts: ImportOptions, issues: IssueList): ModuleOptions | undefined {
  const missing = FLAT_FILE_REQUIRES.filter((k) => opts[k] === undefined || opts[k] === "");
  if (missing.length > 0) {
    issues.error(
      "MISSING_MODULE_INFO",
      `CSV and spreadsheet files need ${missing.map((m) => `--${m.replace("_", "-")}`).join(", ")} because the file itself has no place for them.`,
    );
    return undefined;
  }
  return opts as ModuleOptions;
}

function importGrid(grid: Grid, opts: ImportOptions, fileName: string, issues: IssueList): ImportResult | undefined {
  const firstNonBlank = grid.find((r) => r.some((c) => cleanText(c) !== ""));
  if (isTetherlessCsvHeader(firstNonBlank)) {
    const mo = requireModuleOptions(opts, issues);
    return mo ? parseTetherlessGrid(grid.slice(grid.indexOf(firstNonBlank!)), mo, fileName) : undefined;
  }
  if (findKahootHeaderRow(grid) >= 0) {
    const mo = requireModuleOptions(opts, issues);
    return mo ? parseKahootGrid(grid, { ...mo, order: opts.order }, fileName) : undefined;
  }
  issues.error(
    "UNKNOWN_FORMAT",
    "Could not recognise the header row. Use the Tetherless CSV template (question_id, prompt_en, choice_a_en, …) or a Kahoot quiz spreadsheet.",
    { row: 1 },
  );
  return undefined;
}

/** Import from bytes already in memory (used by the CLI and, later, an upload endpoint). */
export function importContent(data: Buffer, fileName: string, opts: ImportOptions = {}): ImportOutcome {
  const issues = new IssueList();
  const ext = extname(fileName).toLowerCase();
  let adapted: ImportResult | undefined;

  try {
    if (ext === ".json") {
      const text = cleanText(data.toString("utf8"));
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        issues.error("INVALID_JSON", `The file is not valid JSON: ${(e as Error).message}`);
        return { ok: false, issues: issues.items };
      }
      adapted = { module: normalizeJsonStrings(parsed) as ContentModule, issues: [] };
    } else if (ext === ".csv" || ext === ".tsv" || ext === ".txt") {
      const { rows, unterminatedQuoteAtRow } = parseCsv(data.toString("utf8"));
      if (unterminatedQuoteAtRow !== undefined) {
        issues.error("UNTERMINATED_QUOTE", "A quoted cell is never closed; check for a missing double quote (\").", { row: unterminatedQuoteAtRow });
      }
      adapted = importGrid(rows, opts, fileName, issues);
    } else if (ext === ".xlsx") {
      adapted = importGrid(readXlsxFirstSheet(data), opts, fileName, issues);
    } else {
      issues.error("UNSUPPORTED_FILE", `Unsupported file type "${ext || "(none)"}". Use .json, .csv or .xlsx.`);
    }
  } catch (e) {
    issues.error("UNREADABLE_FILE", `Could not read the file: ${(e as Error).message}`);
  }

  if (!adapted) return { ok: false, issues: issues.items };
  issues.addAll(adapted.issues);
  if (!adapted.module) return { ok: false, issues: issues.items };

  let module = adapted.module;
  const schemaIssues = validateModule(module);
  issues.addAll(adapted.rowForQuestionIndex ? attachRows(schemaIssues, adapted.rowForQuestionIndex) : schemaIssues);

  if (opts.previous && !schemaIssues.some((i) => i.severity === "error")) {
    const checked = checkAgainstPrevious(opts.previous, module);
    module = checked.module;
    issues.addAll(checked.issues);
  }

  return { ok: !issues.hasErrors, module, issues: issues.items };
}

export async function importFile(path: string, opts: ImportOptions = {}): Promise<ImportOutcome> {
  return importContent(await readFile(path), basename(path), opts);
}

/** Apply the same text clean-up to every string in a JSON document. */
function normalizeJsonStrings(value: unknown): unknown {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) return value.map(normalizeJsonStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeJsonStrings(v)]));
  }
  return value;
}
