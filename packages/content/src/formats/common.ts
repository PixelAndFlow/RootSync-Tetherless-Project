import type { Issue } from "../issues.ts";
import type { ContentModule, LocalizedText, Question } from "../schema.ts";
import { SCHEMA_VERSION } from "../schema.ts";
import type { CellValue } from "../xlsx.ts";
import { cleanText } from "../text.ts";

/** Module-level details that flat files (CSV, Kahoot) cannot carry themselves. */
export interface ModuleOptions {
  module_id: string;
  content_version: number;
  title_en: string;
  title_es?: string;
  /** The previously published version of this module, if any. */
  previous?: ContentModule;
}

export type Grid = CellValue[][];

export function cellText(row: readonly CellValue[] | undefined, col: number): string {
  if (!row || col < 0) return "";
  return cleanText(row[col]);
}

export function isBlankRow(row: readonly CellValue[] | undefined): boolean {
  return !row || row.every((c) => cleanText(c) === "");
}

export function localized(en: string, es?: string): LocalizedText {
  return es ? { en, es } : { en };
}

export function buildModule(opts: ModuleOptions, questions: Question[], format: "tetherless-csv" | "kahoot", fileName: string): ContentModule {
  return {
    schema_version: SCHEMA_VERSION,
    module_id: opts.module_id,
    content_version: opts.content_version,
    title: localized(cleanText(opts.title_en), opts.title_es ? cleanText(opts.title_es) : undefined),
    // Flat files can't hold topics or Boss Missions; carry them over from the previous version.
    ...(opts.previous?.topics ? { topics: opts.previous.topics } : {}),
    questions,
    ...(opts.previous?.boss_missions ? { boss_missions: opts.previous.boss_missions } : {}),
    retired_question_ids: [...(opts.previous?.retired_question_ids ?? [])],
    source: { format, file_name: fileName },
  };
}

/**
 * Schema issues point at JSON paths like questions[4].prompt.en. For flat files
 * the person fixing the file needs the spreadsheet row instead, so add it.
 */
export function attachRows(issues: Issue[], rowForQuestionIndex: readonly number[]): Issue[] {
  return issues.map((issue) => {
    const field = issue.location?.field;
    const m = field ? /^questions\[(\d+)\]/.exec(field) : null;
    if (!m) return issue;
    const row = rowForQuestionIndex[Number(m[1])];
    return row === undefined ? issue : { ...issue, location: { ...issue.location, row } };
  });
}
