/**
 * Checks a new content version against the previously published one (D17).
 *
 * Learner answers are stored forever with the question_id and content_version
 * they answered. So between versions:
 *  - content_version must go up, or the server cannot tell versions apart;
 *  - a question that disappears is retired, and its ID can never come back;
 *  - a question that keeps its ID but changes its correct answer is an
 *    answer-key correction: the server re-scores old attempts (raw answers are
 *    never edited). We flag it so a person confirms it was intended;
 *  - a question that keeps its ID but changes its wording may now be a
 *    different question. We flag it: if the meaning changed, give it a new ID.
 * Boss Mission questions follow the same rules as regular questions.
 */

import { IssueList, type Issue } from "./issues.ts";
import { allQuestions, type ContentModule, type Question } from "./schema.ts";

export interface VersionCheckResult {
  /** The new module with retired_question_ids brought up to date. */
  module: ContentModule;
  issues: Issue[];
}

function sameText(a: { en: string; es?: string } | undefined, b: { en: string; es?: string } | undefined): boolean {
  return (a?.en ?? "") === (b?.en ?? "") && (a?.es ?? "") === (b?.es ?? "");
}

function choicesSignature(q: Question): string {
  return JSON.stringify(q.choices.map((c) => [c.choice_id, c.text.en, c.text.es ?? ""]));
}

export function checkAgainstPrevious(previous: ContentModule, next: ContentModule): VersionCheckResult {
  const issues = new IssueList();

  if (previous.module_id !== next.module_id) {
    issues.error(
      "MODULE_MISMATCH",
      `The previous file is for module "${previous.module_id}", but this file is "${next.module_id}".`,
      { field: "module_id" },
    );
    return { module: next, issues: issues.items };
  }

  if (next.content_version <= previous.content_version) {
    issues.error(
      "VERSION_NOT_INCREASED",
      `content_version must be greater than the previous version (${previous.content_version}); found ${next.content_version}.`,
      { field: "content_version" },
    );
  }

  const retired = new Set([...previous.retired_question_ids, ...next.retired_question_ids]);
  const prevQuestions = allQuestions(previous);
  const nextQuestions = allQuestions(next);
  const prevById = new Map(prevQuestions.map((q) => [q.question_id, q]));
  const nextIds = new Set(nextQuestions.map((q) => q.question_id));

  for (const q of nextQuestions) {
    if (previous.retired_question_ids.includes(q.question_id)) {
      issues.error(
        "REUSED_RETIRED_ID",
        `question_id "${q.question_id}" was retired in an earlier version and cannot be reused. Give this question a new ID.`,
        { question_id: q.question_id, field: "question_id" },
      );
      continue;
    }
    const old = prevById.get(q.question_id);
    if (!old) continue;
    if (old.correct_choice_id !== q.correct_choice_id) {
      issues.warning(
        "ANSWER_KEY_CHANGED",
        `Correct answer changed from "${old.correct_choice_id}" to "${q.correct_choice_id}". Earlier attempts will be re-scored on the server. Confirm this is a correction.`,
        { question_id: q.question_id, field: "correct_choice_id" },
      );
    }
    if (!sameText(old.prompt, q.prompt)) {
      issues.warning(
        "QUESTION_TEXT_CHANGED",
        "Question wording changed but the ID stayed the same. Fine for typo fixes; if the meaning changed, give it a new ID instead.",
        { question_id: q.question_id, field: "prompt" },
      );
    }
    if (choicesSignature(old) !== choicesSignature(q)) {
      issues.warning(
        "CHOICES_CHANGED",
        "Answer choices changed but the ID stayed the same. Fine for typo fixes; if the meaning changed, give it a new ID instead.",
        { question_id: q.question_id, field: "choices" },
      );
    }
  }

  for (const old of prevQuestions) {
    if (!nextIds.has(old.question_id) && !retired.has(old.question_id)) {
      retired.add(old.question_id);
      issues.info("QUESTION_RETIRED", `Question "${old.question_id}" is no longer in the file and has been retired. Its ID will not be reused.`, {
        question_id: old.question_id,
      });
    }
  }

  return {
    module: { ...next, retired_question_ids: [...retired].sort() },
    issues: issues.items,
  };
}
