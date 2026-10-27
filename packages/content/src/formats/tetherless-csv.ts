/**
 * Tetherless CSV template: one multiple-choice question per row.
 *
 * Columns (header names are case-insensitive, order does not matter):
 *   question_id        required  permanent ID, never reused
 *   topic              optional  used for weak-topic reports and the progress tree
 *   term_en, term_es   optional  short label for the concept (a node on the tree)
 *   prompt_en          required
 *   prompt_es          optional
 *   choice_a_en ... choice_f_en   at least two required (a and b)
 *   choice_a_es ... choice_f_es   optional
 *   correct_choice     required  letter of the correct choice: a–f
 *   explanation_en     optional  shown after answering
 *   explanation_es     optional
 *   time_limit_sec     optional
 *
 * Module ID, version and title come from the command line because a flat
 * table has nowhere sensible to hold them.
 */

import { IssueList } from "../issues.ts";
import type { Choice, Question } from "../schema.ts";
import { buildModule, cellText, isBlankRow, localized, type Grid, type ModuleOptions } from "./common.ts";
import type { ImportResult } from "../import.ts";

const CHOICE_LETTERS = ["a", "b", "c", "d", "e", "f"] as const;

const KNOWN_COLUMNS = new Set<string>([
  "question_id",
  "topic",
  "term_en",
  "term_es",
  "prompt_en",
  "prompt_es",
  "correct_choice",
  "explanation_en",
  "explanation_es",
  "time_limit_sec",
  ...CHOICE_LETTERS.flatMap((l) => [`choice_${l}_en`, `choice_${l}_es`]),
]);
const REQUIRED_COLUMNS = ["question_id", "prompt_en", "choice_a_en", "choice_b_en", "correct_choice"];

export function isTetherlessCsvHeader(row: Grid[number] | undefined): boolean {
  if (!row) return false;
  const names = row.map((c) => String(c ?? "").trim().toLowerCase());
  return names.includes("question_id") && names.includes("prompt_en");
}

export function parseTetherlessGrid(grid: Grid, opts: ModuleOptions, fileName: string): ImportResult {
  const issues = new IssueList();
  const header = (grid[0] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
  const col = new Map<string, number>();
  header.forEach((name, i) => {
    if (name === "") return;
    if (col.has(name)) {
      issues.error("DUPLICATE_COLUMN", `Column "${name}" appears more than once in the header.`, { row: 1, field: name });
    } else {
      col.set(name, i);
    }
    if (!KNOWN_COLUMNS.has(name)) {
      issues.warning("UNKNOWN_COLUMN", `Column "${name}" is not part of the template and will be ignored.`, { row: 1, field: name });
    }
  });
  for (const req of REQUIRED_COLUMNS) {
    if (!col.has(req)) issues.error("MISSING_COLUMN", `Required column "${req}" is missing from the header row.`, { row: 1, field: req });
  }
  if (issues.hasErrors) return { issues: issues.items };

  const get = (row: Grid[number] | undefined, name: string) => cellText(row, col.get(name) ?? -1);

  const questions: Question[] = [];
  const rowForIndex: number[] = [];
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (isBlankRow(row)) continue;
    const rowNum = r + 1;

    const choices: Choice[] = [];
    for (const letter of CHOICE_LETTERS) {
      const en = get(row, `choice_${letter}_en`);
      const es = get(row, `choice_${letter}_es`);
      if (en === "" && es === "") continue;
      if (en === "") {
        issues.error("MISSING_ENGLISH", `choice_${letter}_es has text but choice_${letter}_en is empty.`, {
          row: rowNum,
          field: `choice_${letter}_en`,
        });
        continue;
      }
      choices.push({ choice_id: letter, text: localized(en, es || undefined) });
    }

    const correctRaw = get(row, "correct_choice").toLowerCase();
    if (/[,;\s]/.test(correctRaw)) {
      issues.error(
        "MULTIPLE_CORRECT_NOT_SUPPORTED",
        `correct_choice "${correctRaw}" lists more than one answer. Only one correct answer per question is supported.`,
        { row: rowNum, field: "correct_choice" },
      );
    }

    const question: Question = {
      question_id: get(row, "question_id"),
      type: "multiple_choice",
      prompt: localized(get(row, "prompt_en"), get(row, "prompt_es") || undefined),
      choices,
      correct_choice_id: correctRaw,
    };
    const topic = get(row, "topic");
    if (topic) question.topic = topic;
    const termEn = get(row, "term_en");
    const termEs = get(row, "term_es");
    if (termEn || termEs) question.term = { en: termEn, ...(termEs ? { es: termEs } : {}) };
    const exEn = get(row, "explanation_en");
    const exEs = get(row, "explanation_es");
    if (exEn || exEs) question.explanation = { en: exEn, ...(exEs ? { es: exEs } : {}) };
    const tl = get(row, "time_limit_sec");
    if (tl !== "") {
      const n = Number(tl);
      if (Number.isInteger(n) && n > 0) question.time_limit_sec = n;
      else issues.error("INVALID_TIME_LIMIT", `time_limit_sec "${tl}" must be a whole number of seconds.`, { row: rowNum, field: "time_limit_sec" });
    }

    questions.push(question);
    rowForIndex.push(rowNum);
  }

  const module = buildModule(opts, questions, "tetherless-csv", fileName);
  return { module, issues: issues.items, rowForQuestionIndex: rowForIndex };
}
