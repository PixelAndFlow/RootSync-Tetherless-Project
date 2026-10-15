/**
 * Kahoot quiz spreadsheet (.xlsx, or the same sheet saved as .csv).
 *
 * Kahoot's template columns:
 *   Question | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s)
 *
 * RCO's Puerto Rico bootcamp quizzes write both languages in one cell:
 *   "¿Qué hace un firewall (cortafuegos)? / What does a firewall do?"
 * We split on " / " into separate Spanish and English fields. Text with no
 * separator (e.g. "CrowdStrike y Microsoft Defender") is treated as the same
 * in both languages when the rest of the question is bilingual.
 *
 * Kahoot has no question IDs, topics or explanations. IDs are generated as
 * <module_id>-q01, -q02, ... When a previous version is supplied, a question
 * whose English prompt matches a previous question keeps that question's ID,
 * so re-importing an edited spreadsheet does not break learner history.
 */

import { IssueList } from "../issues.ts";
import { allQuestions, type Choice, type ContentModule, type Question } from "../schema.ts";
import { splitBilingual, type BilingualOrder } from "../text.ts";
import { buildModule, cellText, isBlankRow, type Grid, type ModuleOptions } from "./common.ts";
import type { ImportResult } from "../import.ts";

export interface KahootOptions extends ModuleOptions {
  /** Which language comes first in "A / B" cells. RCO's sample is Spanish first. */
  order?: BilingualOrder;
}

/** Find the header row. Kahoot's downloadable template has instruction rows above it. */
export function findKahootHeaderRow(grid: Grid): number {
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const first = String(grid[r]?.[0] ?? "").trim().toLowerCase();
    const joined = (grid[r] ?? []).map((c) => String(c ?? "").toLowerCase()).join("|");
    if (first.startsWith("question") && joined.includes("answer 1") && joined.includes("correct answer")) return r;
  }
  return -1;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

class IdAllocator {
  private readonly taken = new Set<string>();
  private readonly byPrompt = new Map<string, string>();
  private next = 1;
  private readonly prefix: string;

  constructor(prefix: string, previous?: ContentModule) {
    this.prefix = prefix;
    if (previous) {
      for (const id of previous.retired_question_ids) this.taken.add(id);
      for (const q of allQuestions(previous)) this.taken.add(q.question_id);
      for (const q of previous.questions) {
        this.byPrompt.set(normalizeForMatch(q.prompt.en), q.question_id);
      }
    }
  }

  /** Reuse the previous ID for an unchanged prompt; otherwise allocate a fresh one. */
  idFor(promptEn: string): { id: string; reused: boolean } {
    const prev = this.byPrompt.get(normalizeForMatch(promptEn));
    if (prev) {
      this.byPrompt.delete(normalizeForMatch(promptEn));
      return { id: prev, reused: true };
    }
    let id: string;
    do {
      id = `${this.prefix}-q${String(this.next++).padStart(2, "0")}`;
    } while (this.taken.has(id));
    this.taken.add(id);
    return { id, reused: false };
  }
}

export function parseKahootGrid(grid: Grid, opts: KahootOptions, fileName: string): ImportResult {
  const issues = new IssueList();
  const order = opts.order ?? "es-en";
  const headerIdx = findKahootHeaderRow(grid);
  if (headerIdx < 0) {
    issues.error("MISSING_COLUMN", 'Could not find the Kahoot header row (expected "Question", "Answer 1" … "Correct answer(s)").', { row: 1 });
    return { issues: issues.items };
  }

  const header = (grid[headerIdx] ?? []).map((c) => String(c ?? "").toLowerCase());
  const find = (pred: (h: string) => boolean) => header.findIndex(pred);
  const qCol = find((h) => h.trim().startsWith("question"));
  const answerCols = [1, 2, 3, 4, 5, 6].map((n) => find((h) => h.trim().startsWith(`answer ${n}`))).filter((i) => i >= 0);
  const timeCol = find((h) => h.includes("time limit"));
  const correctCol = find((h) => h.includes("correct answer"));

  const ids = new IdAllocator(opts.module_id, opts.previous);
  const questions: Question[] = [];
  const rowForIndex: number[] = [];

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (isBlankRow(row)) continue;
    const rowNum = r + 1;

    const promptRaw = cellText(row, qCol);
    if (promptRaw === "") {
      issues.error("MISSING_FIELD", "Question text is empty.", { row: rowNum, field: "Question" });
      continue;
    }
    const prompt = splitBilingual(promptRaw, order);
    if (prompt.ambiguous) {
      issues.warning("AMBIGUOUS_SPLIT", 'Question has more than one " / " separator, so it was kept as English-only text. Check it by hand.', {
        row: rowNum,
        field: "Question",
      });
    }

    const choices: Choice[] = [];
    let answerNumber = 0;
    const choiceIdForAnswerNumber = new Map<number, string>();
    for (const c of answerCols) {
      answerNumber++;
      const raw = cellText(row, c);
      if (raw === "") continue;
      const split = splitBilingual(raw, order);
      if (split.ambiguous) {
        issues.warning("AMBIGUOUS_SPLIT", `Answer ${answerNumber} has more than one " / " separator; kept as English-only text.`, {
          row: rowNum,
          field: `Answer ${answerNumber}`,
        });
      }
      const es = split.es ?? (prompt.bilingual && !split.ambiguous ? split.en : undefined);
      const choice_id = String.fromCharCode(96 + answerNumber); // 1 -> a
      choiceIdForAnswerNumber.set(answerNumber, choice_id);
      choices.push({ choice_id, text: es ? { en: split.en, es } : { en: split.en } });
    }

    const correctRaw = cellText(row, correctCol);
    const correctNums = correctRaw.split(/[,;\s]+/).filter(Boolean).map(Number);
    let correct_choice_id = "";
    if (correctNums.length === 0 || correctNums.some((n) => !Number.isInteger(n))) {
      issues.error("MISSING_CORRECT_ANSWER", `Correct answer "${correctRaw}" must be the number of the right answer (1–4).`, {
        row: rowNum,
        field: "Correct answer(s)",
      });
    } else if (correctNums.length > 1) {
      issues.error(
        "MULTIPLE_CORRECT_NOT_SUPPORTED",
        `Correct answer "${correctRaw}" marks more than one answer. Only one correct answer per question is supported.`,
        { row: rowNum, field: "Correct answer(s)" },
      );
    } else {
      const n = correctNums[0] as number;
      correct_choice_id = choiceIdForAnswerNumber.get(n) ?? `answer-${n}`;
      if (!choiceIdForAnswerNumber.has(n)) {
        issues.error("INVALID_CORRECT_ANSWER", `Correct answer is ${n}, but Answer ${n} is empty.`, {
          row: rowNum,
          field: "Correct answer(s)",
        });
        correct_choice_id = "";
      }
    }

    const { id, reused } = ids.idFor(prompt.en);
    if (opts.previous && !reused) {
      issues.info("NEW_QUESTION", `New question; assigned ID ${id}.`, { row: rowNum, question_id: id });
    }

    const question: Question = {
      question_id: id,
      type: "multiple_choice",
      prompt: prompt.es ? { en: prompt.en, es: prompt.es } : { en: prompt.en },
      choices,
      correct_choice_id,
    };
    // Kahoot has no columns for topic, term or explanation. Keep what the
    // previous version had for the same question instead of dropping it.
    const prior = reused ? opts.previous?.questions.find((q) => q.question_id === id) : undefined;
    if (prior?.topic) question.topic = prior.topic;
    if (prior?.term) question.term = prior.term;
    if (prior?.explanation) question.explanation = prior.explanation;
    const tl = cellText(row, timeCol);
    if (tl !== "") {
      const n = Number(tl);
      if (Number.isInteger(n) && n > 0) question.time_limit_sec = n;
      else issues.warning("INVALID_TIME_LIMIT", `Time limit "${tl}" is not a whole number of seconds; ignored.`, { row: rowNum, field: "Time limit" });
    }
    questions.push(question);
    rowForIndex.push(rowNum);
  }

  const module = buildModule(opts, questions, "kahoot", fileName);
  return { module, issues: issues.items, rowForQuestionIndex: rowForIndex };
}
