/**
 * The module format the learner app renders (Chris's `TetherlessModule`,
 * origin/chris src/types/content.ts), adopted as the one publishing format by
 * spec v1.10 §7, with four changes:
 *   1. content_version is a whole number (1, 2, 3...), as in events.
 *   2. Optional `note` (staff-facing) and `activity_type`
 *      ("multiple_choice", or "game:<name>" once the games' shapes exist).
 *   3. settings.passing_score_percent is ignored by the server; thresholds are
 *      server settings. It only produces a warning.
 *   4. One validator, used by the server's import check and by the app.
 *
 * Team fields: Module Name = title.en, Module version = content_version,
 * Difficulty Level = level, Note = note. Spanish Assist text goes in the `es`
 * field next to each `en`.
 *
 * Scoring still runs on the canonical ContentModule (schema.ts). toCanonical()
 * converts; fromCanonical() turns the older repo modules into this format so
 * the server can seed them.
 */

import { IssueList, type Issue } from "./issues.ts";
import { looksMisencoded } from "./text.ts";
import { MODULE_ID_PATTERN, QUESTION_ID_PATTERN, type ContentModule, type LocalizedText, type Question as CanonicalQuestion } from "./schema.ts";

export const TETHERLESS_SCHEMA = "tetherless.module.v1";

export interface TChoice {
  id: string;
  en: string;
  es?: string;
  icon?: string;
}

export interface TQuestion {
  id: string;
  topic: string;
  type: "multiple_choice" | "scenario_mc" | string;
  presentation: string;
  prompt: LocalizedText;
  scenario?: LocalizedText;
  choices: TChoice[];
  correct_choice: string;
  feedback: LocalizedText;
  /** Optional game-layer label (node on the progress tree). */
  term?: LocalizedText;
}

export interface TSettings {
  question_count: number;
  timer_seconds: number | null;
  show_immediate_feedback: boolean;
  allow_retry: boolean;
  spanish_assist_default: boolean;
  passing_score_percent?: number;
  [key: string]: unknown;
}

export interface TSector {
  id: string;
  order: number;
  name: LocalizedText;
  icon?: string;
  question_ids: string[];
  mastery_bonus_xp?: number;
}

export interface TBossMission {
  mission_id: string;
  topic: string;
  title: LocalizedText;
  scenario: LocalizedText;
  questions: TQuestion[];
}

export interface TetherlessModule {
  schema_version: string;
  module_id: string;
  content_version: number;
  activity_type?: string;
  note?: string;
  program?: string;
  level: string;
  level_label?: LocalizedText;
  title: LocalizedText;
  subtitle?: LocalizedText;
  mission_brief?: LocalizedText;
  settings: TSettings;
  questions: TQuestion[];
  topics?: { topic_id: string; name: LocalizedText }[];
  boss_missions?: TBossMission[];
  /** Question IDs removed in earlier versions. Never reused. */
  retired_question_ids?: string[];
  gamification?: { sectors?: TSector[]; [key: string]: unknown };
  brand?: Record<string, unknown>;
  tracking_policy?: Record<string, unknown>;
  trainer_reporting?: Record<string, unknown>;
}

export const ACTIVITY_TYPE_PATTERN = /^(multiple_choice|game:[a-z0-9-]{1,40})$/;
export const T_CHOICE_ID_PATTERN = /^[A-Za-z0-9]{1,8}$/;
export const MAX_QUESTIONS = 200;
export const MAX_T_CHOICES = 6;
const QUESTION_TYPES = new Set(["multiple_choice", "scenario_mc"]);
const KNOWN_KEYS = new Set([
  "schema_version", "module_id", "content_version", "activity_type", "note", "program", "level", "level_label", "title", "subtitle",
  "mission_brief", "settings", "questions", "topics", "boss_missions", "retired_question_ids", "gamification", "brand", "tracking_policy",
  "trainer_reporting",
]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const HTML = /<\s*[a-z!/?]/i;

function checkText(v: unknown, path: string, issues: IssueList, opts: { required: boolean; max?: number }): void {
  if (v === undefined || v === null) {
    if (opts.required) issues.error("MISSING_FIELD", `${path} is required.`, { field: path });
    return;
  }
  if (typeof v !== "string") return issues.error("WRONG_TYPE", `${path} must be text.`, { field: path });
  if (opts.required && !v.trim()) return issues.error("MISSING_FIELD", `${path} is empty.`, { field: path });
  if (opts.max && v.length > opts.max) issues.error("TOO_LONG", `${path} is longer than ${opts.max} characters.`, { field: path });
  if (HTML.test(v)) issues.error("UNSAFE_TEXT", `${path} looks like it contains HTML or script. Use plain text only.`, { field: path });
  if (looksMisencoded(v)) issues.warning("MISENCODED_TEXT", `${path} has characters that look garbled (for example "Ã©" instead of "é"). Re-save the file as UTF-8.`, { field: path });
}

function checkLocalized(v: unknown, path: string, issues: IssueList, required: boolean): { hasEs: boolean } {
  if (v === undefined || v === null) {
    if (required) issues.error("MISSING_FIELD", `${path} is required, with an "en" value.`, { field: path });
    return { hasEs: false };
  }
  if (!isRecord(v)) {
    issues.error("WRONG_TYPE", `${path} must be an object like { "en": "...", "es": "..." }.`, { field: path });
    return { hasEs: false };
  }
  checkText(v.en, `${path}.en`, issues, { required, max: 2000 });
  if (v.es !== undefined) checkText(v.es, `${path}.es`, issues, { required: false, max: 2000 });
  return { hasEs: typeof v.es === "string" && v.es.trim() !== "" };
}

function checkQuestion(q: unknown, path: string, seen: Map<string, string>, retired: Set<string>, issues: IssueList, spanish: { missing: number }): void {
  if (!isRecord(q)) return issues.error("WRONG_TYPE", `${path} must be an object.`, { field: path });
  const id = q.id;
  if (typeof id !== "string" || !QUESTION_ID_PATTERN.test(id)) {
    issues.error("INVALID_QUESTION_ID", `${path}.id must be 1–64 letters, digits, ".", "-" or "_", starting with a letter or digit.`, { field: `${path}.id` });
  } else {
    if (seen.has(id)) issues.error("DUPLICATE_QUESTION_ID", `Question ID ${id} is used twice (${seen.get(id)} and ${path}).`, { field: `${path}.id`, question_id: id });
    seen.set(id, path);
    if (retired.has(id)) issues.error("RETIRED_QUESTION_ID", `Question ID ${id} was retired in an earlier version and can't be reused. Give this question a new ID.`, { field: `${path}.id`, question_id: id });
  }
  const loc = { question_id: typeof id === "string" ? id : undefined };
  if (typeof q.topic !== "string" || !q.topic.trim()) issues.error("MISSING_FIELD", `${path}.topic is required (it drives weak-topic reports).`, { field: `${path}.topic`, ...loc });
  if (typeof q.type !== "string" || !QUESTION_TYPES.has(q.type)) issues.error("UNSUPPORTED_TYPE", `${path}.type must be "multiple_choice" or "scenario_mc".`, { field: `${path}.type`, ...loc });
  if (q.presentation !== undefined && typeof q.presentation !== "string") issues.error("WRONG_TYPE", `${path}.presentation must be text.`, { field: `${path}.presentation`, ...loc });
  const prompt = checkLocalized(q.prompt, `${path}.prompt`, issues, true);
  if (q.scenario !== undefined) checkLocalized(q.scenario, `${path}.scenario`, issues, false);
  const feedback = checkLocalized(q.feedback, `${path}.feedback`, issues, true);
  if (q.term !== undefined) checkLocalized(q.term, `${path}.term`, issues, false);
  let allEs = prompt.hasEs && feedback.hasEs;

  if (!Array.isArray(q.choices)) {
    issues.error("MISSING_FIELD", `${path}.choices must be a list.`, { field: `${path}.choices`, ...loc });
    return;
  }
  if (q.choices.length < 2 || q.choices.length > MAX_T_CHOICES) {
    issues.error("CHOICE_COUNT", `${path} must have 2 to ${MAX_T_CHOICES} choices; it has ${q.choices.length}.`, { field: `${path}.choices`, ...loc });
  }
  const choiceIds = new Set<string>();
  q.choices.forEach((c, i) => {
    const cp = `${path}.choices[${i}]`;
    if (!isRecord(c)) return issues.error("WRONG_TYPE", `${cp} must be an object.`, { field: cp, ...loc });
    if (typeof c.id !== "string" || !T_CHOICE_ID_PATTERN.test(c.id)) {
      issues.error("INVALID_CHOICE_ID", `${cp}.id must be 1–8 letters or digits.`, { field: `${cp}.id`, ...loc });
    } else {
      const key = c.id.toLowerCase();
      if (choiceIds.has(key)) issues.error("DUPLICATE_CHOICE_ID", `${path} has choice ID ${c.id} twice (letter case doesn't count).`, { field: `${cp}.id`, ...loc });
      choiceIds.add(key);
    }
    checkText(c.en, `${cp}.en`, issues, { required: true, max: 500 });
    if (c.es !== undefined) checkText(c.es, `${cp}.es`, issues, { required: false, max: 500 });
    if (!(typeof c.es === "string" && c.es.trim())) allEs = false;
  });
  if (typeof q.correct_choice !== "string" || !choiceIds.has(q.correct_choice.toLowerCase())) {
    issues.error("CORRECT_CHOICE_MISSING", `${path}.correct_choice must be the ID of one of its choices.`, { field: `${path}.correct_choice`, ...loc });
  }
  if (!allEs) spanish.missing++;
}

/** Validate a module in the app's format. Errors block publishing; warnings don't. */
export function validateTetherlessModule(input: unknown): Issue[] {
  const issues = new IssueList();
  if (!isRecord(input)) {
    issues.error("WRONG_TYPE", "A module must be a JSON object.");
    return issues.items;
  }
  for (const k of Object.keys(input)) {
    if (!KNOWN_KEYS.has(k)) issues.warning("UNKNOWN_FIELD", `Field "${k}" isn't used by Tetherless and will be stored as is.`, { field: k });
  }
  if (typeof input.schema_version !== "string" || !input.schema_version.trim()) issues.error("MISSING_FIELD", `schema_version is required ("${TETHERLESS_SCHEMA}").`, { field: "schema_version" });
  if (typeof input.module_id !== "string" || !MODULE_ID_PATTERN.test(input.module_id)) {
    issues.error("INVALID_MODULE_ID", `module_id must be 2–64 lowercase letters, digits or hyphens (e.g. "pr-bootcamp-tools"); found ${JSON.stringify(input.module_id)}.`, { field: "module_id" });
  }
  if (typeof input.content_version !== "number" || !Number.isInteger(input.content_version) || input.content_version < 1) {
    issues.error(
      "INVALID_VERSION",
      `content_version must be a whole number of 1 or more${typeof input.content_version === "string" ? ` (use 1, 2, 3… not "${input.content_version}")` : ""}.`,
      { field: "content_version" },
    );
  }
  if (input.activity_type !== undefined && (typeof input.activity_type !== "string" || !ACTIVITY_TYPE_PATTERN.test(input.activity_type))) {
    issues.error("INVALID_ACTIVITY_TYPE", `activity_type must be "multiple_choice" or "game:<name>".`, { field: "activity_type" });
  }
  if (typeof input.activity_type === "string" && input.activity_type.startsWith("game:")) {
    issues.warning("GAME_FORMAT_PENDING", "Game modules are accepted, but their question format isn't final yet; they're checked as multiple choice.", { field: "activity_type" });
  }
  checkText(input.note, "note", issues, { required: false, max: 2000 });
  checkText(input.level, "level", issues, { required: true, max: 40 });
  checkLocalized(input.title, "title", issues, true);
  for (const k of ["subtitle", "mission_brief", "level_label"] as const) if (input[k] !== undefined) checkLocalized(input[k], k, issues, false);

  const retired = new Set<string>();
  if (input.retired_question_ids !== undefined) {
    if (!Array.isArray(input.retired_question_ids) || !input.retired_question_ids.every((x) => typeof x === "string")) {
      issues.error("WRONG_TYPE", "retired_question_ids must be a list of question IDs.", { field: "retired_question_ids" });
    } else input.retired_question_ids.forEach((x) => retired.add(x as string));
  }

  const seen = new Map<string, string>();
  const spanish = { missing: 0 };
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    issues.error("MISSING_FIELD", "questions must be a list with at least one question.", { field: "questions" });
  } else {
    if (input.questions.length > MAX_QUESTIONS) issues.error("TOO_MANY_QUESTIONS", `A module can have at most ${MAX_QUESTIONS} questions.`, { field: "questions" });
    input.questions.forEach((q, i) => checkQuestion(q, `questions[${i}]`, seen, retired, issues, spanish));
  }

  if (!isRecord(input.settings)) {
    issues.error("MISSING_FIELD", "settings is required (at least question_count).", { field: "settings" });
  } else {
    const n = Array.isArray(input.questions) ? input.questions.length : 0;
    if (input.settings.question_count !== n) issues.error("QUESTION_COUNT", `settings.question_count is ${JSON.stringify(input.settings.question_count)} but there are ${n} questions.`, { field: "settings.question_count" });
    if (input.settings.passing_score_percent !== undefined) {
      issues.warning("IGNORED_FIELD", "settings.passing_score_percent is ignored: pass and struggling thresholds are server settings.", { field: "settings.passing_score_percent" });
    }
  }

  if (input.boss_missions !== undefined) {
    if (!Array.isArray(input.boss_missions)) issues.error("WRONG_TYPE", "boss_missions must be a list.", { field: "boss_missions" });
    else
      input.boss_missions.forEach((b, i) => {
        const bp = `boss_missions[${i}]`;
        if (!isRecord(b)) return issues.error("WRONG_TYPE", `${bp} must be an object.`, { field: bp });
        if (typeof b.mission_id !== "string" || !QUESTION_ID_PATTERN.test(b.mission_id)) issues.error("INVALID_MISSION_ID", `${bp}.mission_id is missing or invalid.`, { field: `${bp}.mission_id` });
        if (typeof b.topic !== "string" || !b.topic.trim()) issues.error("MISSING_FIELD", `${bp}.topic is required.`, { field: `${bp}.topic` });
        checkLocalized(b.title, `${bp}.title`, issues, true);
        checkLocalized(b.scenario, `${bp}.scenario`, issues, true);
        if (!Array.isArray(b.questions) || !b.questions.length) issues.error("MISSING_FIELD", `${bp}.questions must have at least one question.`, { field: `${bp}.questions` });
        else b.questions.forEach((q, j) => checkQuestion(q, `${bp}.questions[${j}]`, seen, retired, issues, { missing: 0 }));
      });
  }

  const sectors = isRecord(input.gamification) && Array.isArray(input.gamification.sectors) ? input.gamification.sectors : [];
  const sectorIds = new Set<string>();
  sectors.forEach((s, i) => {
    const sp = `gamification.sectors[${i}]`;
    if (!isRecord(s)) return issues.error("WRONG_TYPE", `${sp} must be an object.`, { field: sp });
    if (typeof s.id !== "string" || !s.id) issues.error("MISSING_FIELD", `${sp}.id is required.`, { field: `${sp}.id` });
    else {
      if (sectorIds.has(s.id)) issues.error("DUPLICATE_SECTOR_ID", `Sector ID ${s.id} is used twice.`, { field: `${sp}.id` });
      sectorIds.add(s.id);
    }
    checkLocalized(s.name, `${sp}.name`, issues, true);
    const qs = Array.isArray(s.question_ids) ? s.question_ids : [];
    if (!qs.length) issues.error("MISSING_FIELD", `${sp}.question_ids must list at least one question.`, { field: `${sp}.question_ids` });
    const inSector = new Set<string>();
    for (const qid of qs) {
      if (typeof qid !== "string" || !seen.has(qid)) issues.error("UNKNOWN_QUESTION", `${sp} refers to unknown question ${JSON.stringify(qid)}.`, { field: `${sp}.question_ids` });
      else if (inSector.has(qid)) issues.error("DUPLICATE_QUESTION_ID", `${sp} lists ${qid} twice.`, { field: `${sp}.question_ids` });
      else inSector.add(qid);
    }
  });

  if (spanish.missing > 0) {
    issues.warning("SPANISH_MISSING", `${spanish.missing} question(s) have no Spanish text in the prompt, feedback or some choices; Spanish Assist won't show for those parts.`, { field: "questions" });
  }
  return issues.items;
}

const lower = (s: string) => s.toLowerCase();

function toCanonicalQuestion(q: TQuestion): CanonicalQuestion {
  return {
    question_id: q.id,
    type: "multiple_choice",
    topic: q.topic,
    ...(q.term ? { term: q.term } : {}),
    prompt: q.prompt,
    choices: q.choices.map((c) => ({ choice_id: lower(c.id), text: c.es ? { en: c.en, es: c.es } : { en: c.en } })),
    correct_choice_id: lower(q.correct_choice),
    explanation: q.feedback,
  };
}

/** The scoring engine's view of a valid module. Call only after validateTetherlessModule() has no errors. */
export function toCanonical(m: TetherlessModule): ContentModule {
  return {
    schema_version: 1,
    module_id: m.module_id,
    content_version: m.content_version,
    title: m.title,
    ...(m.topics ? { topics: m.topics } : {}),
    questions: m.questions.map(toCanonicalQuestion),
    ...(m.boss_missions?.length
      ? { boss_missions: m.boss_missions.map((b) => ({ mission_id: b.mission_id, topic: b.topic, title: b.title, scenario: b.scenario, questions: b.questions.map(toCanonicalQuestion) })) }
      : {}),
    retired_question_ids: m.retired_question_ids ?? [],
  };
}

function fromCanonicalQuestion(q: CanonicalQuestion): TQuestion {
  const correct = q.choices.find((c) => c.choice_id === q.correct_choice_id);
  return {
    id: q.question_id,
    topic: q.topic ?? "untagged", // same label the scoring engine uses for untagged questions
    type: "multiple_choice",
    presentation: "kahoot_cards",
    prompt: q.prompt,
    choices: q.choices.map((c) => ({ id: c.choice_id, en: c.text.en, ...(c.text.es ? { es: c.text.es } : {}) })),
    correct_choice: q.correct_choice_id,
    feedback: q.explanation ?? { en: `The correct answer is: ${correct?.text.en ?? q.correct_choice_id}.`, ...(correct?.text.es ? { es: `La respuesta correcta es: ${correct.text.es}.` } : {}) },
    ...(q.term ? { term: q.term } : {}),
  };
}

/** Convert an older repo module (canonical format) into the app's format, for seeding. */
export function fromCanonical(c: ContentModule, extras: { level?: string; note?: string } = {}): TetherlessModule {
  return {
    schema_version: TETHERLESS_SCHEMA,
    module_id: c.module_id,
    content_version: c.content_version,
    activity_type: "multiple_choice",
    ...(extras.note ? { note: extras.note } : {}),
    level: extras.level ?? "beginner",
    title: c.title,
    settings: { question_count: c.questions.length, timer_seconds: null, show_immediate_feedback: true, allow_retry: true, spanish_assist_default: false },
    questions: c.questions.map(fromCanonicalQuestion),
    ...(c.topics ? { topics: c.topics } : {}),
    ...(c.boss_missions?.length
      ? {
          boss_missions: c.boss_missions.map((b) => ({
            mission_id: b.mission_id,
            topic: b.topic,
            title: b.title,
            scenario: b.scenario,
            questions: b.questions.map((q) => fromCanonicalQuestion({ ...q, topic: q.topic ?? b.topic })),
          })),
        }
      : {}),
    ...(c.retired_question_ids.length ? { retired_question_ids: c.retired_question_ids } : {}),
  };
}

/** Rules a new version must follow against the previous one (spec D-7, plan D17). */
export function checkNewVersion(next: TetherlessModule, previous: TetherlessModule | undefined): Issue[] {
  const issues = new IssueList();
  if (!previous) return issues.items;
  if (next.content_version <= previous.content_version) {
    issues.error("VERSION_NOT_HIGHER", `Version ${next.content_version} is not higher than the published version ${previous.content_version}. Publish this as version ${previous.content_version + 1}.`, { field: "content_version" });
  }
  const nowIds = new Set([...next.questions, ...(next.boss_missions ?? []).flatMap((b) => b.questions)].map((q) => q.id));
  const prevIds = [...previous.questions, ...(previous.boss_missions ?? []).flatMap((b) => b.questions)].map((q) => q.id);
  const retiredNow = new Set(next.retired_question_ids ?? []);
  for (const id of [...(previous.retired_question_ids ?? [])]) {
    if (!retiredNow.has(id)) issues.error("RETIRED_ID_DROPPED", `Question ID ${id} was retired before; keep it in retired_question_ids.`, { field: "retired_question_ids", question_id: id });
  }
  for (const id of prevIds) {
    if (!nowIds.has(id) && !retiredNow.has(id)) {
      issues.error("REMOVED_WITHOUT_RETIRING", `Question ${id} was removed. Add it to retired_question_ids so its ID is never reused.`, { field: "retired_question_ids", question_id: id });
    }
  }
  return issues.items;
}
