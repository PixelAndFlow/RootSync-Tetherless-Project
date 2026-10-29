/**
 * Canonical Tetherless content model (schema_version 1).
 *
 * Every input format (our CSV template, Kahoot spreadsheets, JSON) is converted
 * into this one shape. The learner app, the sync server and the scoring engine
 * only ever read this shape, so adding a new input format never touches them.
 *
 * Design rules (Project Plan D16 and D17):
 *  - English is required; Spanish is optional and never machine-generated.
 *  - Every file carries a content_version that only goes up.
 *  - question_id values are permanent. A question that is removed is "retired"
 *    and its ID is never used again, because historical answers point at it.
 *    This applies to Boss Mission questions too: all IDs share one namespace.
 *  - Only multiple choice with exactly one correct answer is supported in P0.
 *
 * Game-layer fields (all optional, added for the "Block the threat" module):
 *  - topics: display names for each topic; each topic is a branch of the
 *    learner's progress tree.
 *  - term: a short label for what a question teaches; each term is a node on
 *    its branch.
 *  - boss_missions: short scenarios that apply a topic, unlocked when the
 *    learner completes that branch.
 */

import { IssueList, type Issue } from "./issues.ts";
import { looksMisencoded } from "./text.ts";

export const SCHEMA_VERSION = 1;

export interface LocalizedText {
  en: string;
  es?: string;
}

export interface Choice {
  choice_id: string;
  text: LocalizedText;
}

export interface MultipleChoiceQuestion {
  question_id: string;
  type: "multiple_choice";
  /** Topic ID. Used for weak-topic reporting and as the question's branch. */
  topic?: string;
  /** Short label for the concept this question teaches (a node on the progress tree). */
  term?: LocalizedText;
  prompt: LocalizedText;
  choices: Choice[];
  correct_choice_id: string;
  /** One sentence shown after a wrong answer. */
  explanation?: LocalizedText;
  /** Carried over from Kahoot; the app may ignore it. */
  time_limit_sec?: number;
}

export type Question = MultipleChoiceQuestion;

export interface Topic {
  topic_id: string;
  name: LocalizedText;
}

export interface BossMission {
  mission_id: string;
  /** The topic (branch) whose completion unlocks this mission. */
  topic: string;
  title: LocalizedText;
  /** The situation the learner is placed in, e.g. a suspicious email. */
  scenario: LocalizedText;
  questions: Question[];
}

export interface ContentSource {
  format: "tetherless-csv" | "kahoot" | "json";
  file_name: string;
}

export interface ContentModule {
  schema_version: number;
  module_id: string;
  content_version: number;
  title: LocalizedText;
  topics?: Topic[];
  questions: Question[];
  boss_missions?: BossMission[];
  /** IDs removed in earlier versions. They may never be reused. */
  retired_question_ids: string[];
  source?: ContentSource;
}

/** Every question in the module, including Boss Mission questions. */
export function allQuestions(m: ContentModule): Question[] {
  return [...m.questions, ...(m.boss_missions ?? []).flatMap((b) => b.questions)];
}

export const MODULE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const QUESTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const CHOICE_ID_PATTERN = /^[a-z0-9]{1,8}$/;
export const TOPIC_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;

const MODULE_KEYS = new Set([
  "schema_version",
  "module_id",
  "content_version",
  "title",
  "topics",
  "questions",
  "boss_missions",
  "retired_question_ids",
  "source",
]);
const QUESTION_KEYS = new Set([
  "question_id",
  "type",
  "topic",
  "term",
  "prompt",
  "choices",
  "correct_choice_id",
  "explanation",
  "time_limit_sec",
]);
const MISSION_KEYS = new Set(["mission_id", "topic", "title", "scenario", "questions"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkLocalized(
  value: unknown,
  path: string,
  issues: IssueList,
  opts: { required: boolean; question_id?: string },
): void {
  const loc = { field: path, question_id: opts.question_id };
  if (value === undefined) {
    if (opts.required) issues.error("MISSING_FIELD", `${path} is required.`, loc);
    return;
  }
  if (!isRecord(value)) {
    issues.error("INVALID_TYPE", `${path} must be an object with "en" and optional "es" text.`, loc);
    return;
  }
  if (typeof value.en !== "string" || value.en.trim() === "") {
    issues.error("MISSING_ENGLISH", `${path}.en (English text) is required and cannot be empty.`, {
      ...loc,
      field: `${path}.en`,
    });
  }
  if (value.es !== undefined && (typeof value.es !== "string" || value.es.trim() === "")) {
    issues.error("INVALID_SPANISH", `${path}.es must be non-empty text when present; leave it out if there is no Spanish.`, {
      ...loc,
      field: `${path}.es`,
    });
  }
  for (const lang of ["en", "es"] as const) {
    const t = value[lang];
    if (typeof t === "string" && looksMisencoded(t)) {
      issues.error(
        "ENCODING",
        `${path}.${lang} looks garbled ("${t.slice(0, 40)}"). Save the file as UTF-8 and import again.`,
        { ...loc, field: `${path}.${lang}` },
      );
    }
  }
}

interface QuestionContext {
  issues: IssueList;
  seenIds: Map<string, string>;
  retired: Set<string>;
  /** Topic IDs declared in `topics`, or undefined when the module declares none. */
  topicIds?: Set<string>;
}

function validateQuestion(q: unknown, base: string, ctx: QuestionContext): void {
  const { issues } = ctx;
  if (!isRecord(q)) {
    issues.error("INVALID_TYPE", `${base} must be an object.`, { field: base });
    return;
  }
  const qid = typeof q.question_id === "string" ? q.question_id : undefined;
  const loc = (field: string) => ({ field: `${base}.${field}`, question_id: qid });

  for (const key of Object.keys(q)) {
    if (!QUESTION_KEYS.has(key)) {
      issues.warning("UNKNOWN_FIELD", `Unknown question field "${key}" will be ignored.`, loc(key));
    }
  }

  if (qid === undefined || !QUESTION_ID_PATTERN.test(qid)) {
    issues.error(
      "INVALID_QUESTION_ID",
      `question_id is required: 1–64 letters, digits, ".", "_" or "-", starting with a letter or digit. Found ${JSON.stringify(q.question_id)}.`,
      loc("question_id"),
    );
  } else {
    const first = ctx.seenIds.get(qid);
    if (first !== undefined) {
      issues.error(
        "DUPLICATE_QUESTION_ID",
        `question_id "${qid}" is used more than once (also at ${first}). Every question needs its own ID, including Boss Mission questions.`,
        loc("question_id"),
      );
    } else {
      ctx.seenIds.set(qid, base);
    }
    if (ctx.retired.has(qid)) {
      issues.error(
        "REUSED_RETIRED_ID",
        `question_id "${qid}" was retired in an earlier version and cannot be reused. Give this question a new ID.`,
        loc("question_id"),
      );
    }
  }

  if (q.type !== "multiple_choice") {
    issues.error(
      "UNSUPPORTED_TYPE",
      `type must be "multiple_choice" (the only type supported in this version); found ${JSON.stringify(q.type)}.`,
      loc("type"),
    );
  }

  if (q.topic !== undefined) {
    if (typeof q.topic !== "string" || q.topic.trim() === "") {
      issues.error("INVALID_TOPIC", "topic must be non-empty text when present.", loc("topic"));
    } else if (ctx.topicIds && !ctx.topicIds.has(q.topic)) {
      issues.error("UNKNOWN_TOPIC", `topic "${q.topic}" is not listed in the module's topics.`, loc("topic"));
    }
  }

  checkLocalized(q.term, `${base}.term`, issues, { required: false, question_id: qid });
  checkLocalized(q.prompt, `${base}.prompt`, issues, { required: true, question_id: qid });
  checkLocalized(q.explanation, `${base}.explanation`, issues, { required: false, question_id: qid });

  if (q.time_limit_sec !== undefined) {
    if (typeof q.time_limit_sec !== "number" || !Number.isInteger(q.time_limit_sec) || q.time_limit_sec <= 0) {
      issues.error("INVALID_TIME_LIMIT", "time_limit_sec must be a positive whole number of seconds.", loc("time_limit_sec"));
    }
  }

  if (!Array.isArray(q.choices)) {
    issues.error("MISSING_FIELD", "choices is required.", loc("choices"));
    return;
  }
  if (q.choices.length < MIN_CHOICES || q.choices.length > MAX_CHOICES) {
    issues.error(
      "CHOICE_COUNT",
      `A multiple-choice question needs ${MIN_CHOICES}–${MAX_CHOICES} choices; found ${q.choices.length}.`,
      loc("choices"),
    );
  }

  const choiceIds = new Set<string>();
  const choiceTexts = new Set<string>();
  q.choices.forEach((c, ci) => {
    const cpath = `${base}.choices[${ci}]`;
    if (!isRecord(c)) {
      issues.error("INVALID_TYPE", `${cpath} must be an object.`, { field: cpath, question_id: qid });
      return;
    }
    if (typeof c.choice_id !== "string" || !CHOICE_ID_PATTERN.test(c.choice_id)) {
      issues.error("INVALID_CHOICE_ID", `choice_id must be short lowercase letters/digits (e.g. "a").`, {
        field: `${cpath}.choice_id`,
        question_id: qid,
      });
    } else if (choiceIds.has(c.choice_id)) {
      issues.error("DUPLICATE_CHOICE_ID", `choice_id "${c.choice_id}" appears twice in this question.`, {
        field: `${cpath}.choice_id`,
        question_id: qid,
      });
    } else {
      choiceIds.add(c.choice_id);
    }
    checkLocalized(c.text, `${cpath}.text`, issues, { required: true, question_id: qid });
    if (isRecord(c.text) && typeof c.text.en === "string" && c.text.en.trim() !== "") {
      const key = c.text.en.trim().toLowerCase();
      if (choiceTexts.has(key)) {
        issues.warning(
          "DUPLICATE_CHOICE_TEXT",
          `Two choices have the same English text ("${c.text.en}"). Learners will not be able to tell them apart.`,
          { field: `${cpath}.text.en`, question_id: qid },
        );
      } else {
        choiceTexts.add(key);
      }
    }
  });

  if (typeof q.correct_choice_id !== "string" || q.correct_choice_id === "") {
    issues.error("MISSING_CORRECT_ANSWER", "correct_choice_id is required.", loc("correct_choice_id"));
  } else if (!choiceIds.has(q.correct_choice_id)) {
    issues.error(
      "INVALID_CORRECT_ANSWER",
      `correct_choice_id "${q.correct_choice_id}" does not match any choice in this question (choices: ${[...choiceIds].join(", ") || "none"}).`,
      loc("correct_choice_id"),
    );
  }
}

function validateTopics(value: unknown, issues: IssueList): Set<string> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.error("INVALID_TYPE", "topics must be a list.", { field: "topics" });
    return undefined;
  }
  const ids = new Set<string>();
  value.forEach((t, i) => {
    const path = `topics[${i}]`;
    if (!isRecord(t)) {
      issues.error("INVALID_TYPE", `${path} must be an object.`, { field: path });
      return;
    }
    if (typeof t.topic_id !== "string" || !TOPIC_ID_PATTERN.test(t.topic_id)) {
      issues.error("INVALID_TOPIC", `${path}.topic_id must be lowercase letters, digits or hyphens.`, { field: `${path}.topic_id` });
    } else if (ids.has(t.topic_id)) {
      issues.error("DUPLICATE_TOPIC", `topic_id "${t.topic_id}" is listed twice.`, { field: `${path}.topic_id` });
    } else {
      ids.add(t.topic_id);
    }
    checkLocalized(t.name, `${path}.name`, issues, { required: true });
  });
  return ids;
}

function validateMissions(value: unknown, ctx: QuestionContext): void {
  const { issues } = ctx;
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.error("INVALID_TYPE", "boss_missions must be a list.", { field: "boss_missions" });
    return;
  }
  const missionIds = new Set<string>();
  value.forEach((m, i) => {
    const path = `boss_missions[${i}]`;
    if (!isRecord(m)) {
      issues.error("INVALID_TYPE", `${path} must be an object.`, { field: path });
      return;
    }
    for (const key of Object.keys(m)) {
      if (!MISSION_KEYS.has(key)) issues.warning("UNKNOWN_FIELD", `Unknown Boss Mission field "${key}" will be ignored.`, { field: `${path}.${key}` });
    }
    if (typeof m.mission_id !== "string" || !QUESTION_ID_PATTERN.test(m.mission_id)) {
      issues.error("INVALID_MISSION_ID", `${path}.mission_id is required (letters, digits, ".", "_" or "-").`, { field: `${path}.mission_id` });
    } else if (missionIds.has(m.mission_id)) {
      issues.error("DUPLICATE_MISSION_ID", `mission_id "${m.mission_id}" is used more than once.`, { field: `${path}.mission_id` });
    } else {
      missionIds.add(m.mission_id);
    }
    if (typeof m.topic !== "string" || m.topic === "") {
      issues.error("MISSING_FIELD", `${path}.topic is required: the branch that unlocks this mission.`, { field: `${path}.topic` });
    } else if (!ctx.topicIds) {
      issues.error("UNKNOWN_TOPIC", "Boss Missions need the module to list its topics.", { field: `${path}.topic` });
    } else if (!ctx.topicIds.has(m.topic)) {
      issues.error("UNKNOWN_TOPIC", `topic "${m.topic}" is not listed in the module's topics.`, { field: `${path}.topic` });
    }
    checkLocalized(m.title, `${path}.title`, issues, { required: true });
    checkLocalized(m.scenario, `${path}.scenario`, issues, { required: true });
    if (!Array.isArray(m.questions) || m.questions.length === 0) {
      issues.error("NO_QUESTIONS", `${path} needs at least one question.`, { field: `${path}.questions` });
      return;
    }
    m.questions.forEach((q, qi) => validateQuestion(q, `${path}.questions[${qi}]`, ctx));
  });
}

/**
 * Validate an object against the canonical schema.
 *
 * Accepts `unknown` because JSON files come straight from RCO staff and can
 * contain anything. Returns every problem found, not just the first.
 */
export function validateModule(input: unknown): Issue[] {
  const issues = new IssueList();

  if (!isRecord(input)) {
    issues.error("INVALID_TYPE", "The content file must be a JSON object describing one module.");
    return issues.items;
  }

  for (const key of Object.keys(input)) {
    if (!MODULE_KEYS.has(key)) {
      issues.warning("UNKNOWN_FIELD", `Unknown module field "${key}" will be ignored.`, { field: key });
    }
  }

  if (input.schema_version !== SCHEMA_VERSION) {
    issues.error(
      "SCHEMA_VERSION",
      `schema_version must be ${SCHEMA_VERSION}; found ${JSON.stringify(input.schema_version)}.`,
      { field: "schema_version" },
    );
  }

  if (typeof input.module_id !== "string" || !MODULE_ID_PATTERN.test(input.module_id)) {
    issues.error(
      "INVALID_MODULE_ID",
      `module_id must be 2–64 lowercase letters, digits or hyphens (e.g. "pr-bootcamp-tools"); found ${JSON.stringify(input.module_id)}.`,
      { field: "module_id" },
    );
  }

  if (
    typeof input.content_version !== "number" ||
    !Number.isInteger(input.content_version) ||
    input.content_version < 1
  ) {
    issues.error(
      "MISSING_CONTENT_VERSION",
      `content_version must be a whole number of 1 or more; found ${JSON.stringify(input.content_version)}.`,
      { field: "content_version" },
    );
  }

  checkLocalized(input.title, "title", issues, { required: true });

  const retired = new Set<string>();
  if (input.retired_question_ids !== undefined) {
    if (!Array.isArray(input.retired_question_ids) || !input.retired_question_ids.every((x) => typeof x === "string")) {
      issues.error("INVALID_TYPE", "retired_question_ids must be a list of question IDs.", {
        field: "retired_question_ids",
      });
    } else {
      for (const id of input.retired_question_ids) retired.add(id);
    }
  } else {
    issues.error("MISSING_FIELD", "retired_question_ids is required (use [] when nothing has been retired).", {
      field: "retired_question_ids",
    });
  }

  const ctx: QuestionContext = { issues, seenIds: new Map(), retired, topicIds: validateTopics(input.topics, issues) };

  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    issues.error("NO_QUESTIONS", "The module must contain at least one question.", { field: "questions" });
    return issues.items;
  }
  input.questions.forEach((q, index) => validateQuestion(q, `questions[${index}]`, ctx));
  validateMissions(input.boss_missions, ctx);

  const missingTopics = input.questions.filter((q) => isRecord(q) && q.topic === undefined).length;
  if (missingTopics > 0) {
    issues.warning(
      "NO_TOPIC",
      `${missingTopics} of ${input.questions.length} questions have no topic. Weak-topic reports will group them as "Untagged".`,
      { field: "topic" },
    );
  }

  return issues.items;
}
