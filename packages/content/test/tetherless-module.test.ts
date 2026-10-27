import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkNewVersion, fromCanonical, toCanonical, validateModule, validateTetherlessModule, type ContentModule, type TetherlessModule } from "../src/index.ts";

const root = fileURLToPath(new URL("../../../content/modules/", import.meta.url));
const load = (f: string) => JSON.parse(readFileSync(root + f, "utf8")) as ContentModule;

/** A module shaped like Chris's template (src/content/templates/tetherless-module.template.json). */
function chrisModule(): TetherlessModule {
  return {
    schema_version: "tetherless.module.v1",
    module_id: "security-tools",
    content_version: 1,
    activity_type: "multiple_choice",
    note: "Week 1 review",
    program: "RCO Training Program",
    level: "beginner",
    title: { en: "Security Tools", es: "Herramientas de seguridad" },
    settings: { question_count: 2, timer_seconds: null, show_immediate_feedback: true, allow_retry: true, spanish_assist_default: false },
    questions: [
      {
        id: "tools-001",
        topic: "network_security",
        type: "multiple_choice",
        presentation: "kahoot_cards",
        prompt: { en: "What does a firewall do?", es: "¿Qué hace un firewall?" },
        choices: [
          { id: "A", en: "Filters network traffic with rules", es: "Filtra el tráfico de red" },
          { id: "B", en: "Generates passwords", es: "Genera contraseñas" },
        ],
        correct_choice: "A",
        feedback: { en: "A firewall allows or blocks traffic based on rules.", es: "Un firewall permite o bloquea tráfico." },
      },
      {
        id: "tools-002",
        topic: "identity",
        type: "multiple_choice",
        presentation: "kahoot_cards",
        prompt: { en: "What does MFA add?" },
        choices: [
          { id: "A", en: "An extra verification step" },
          { id: "B", en: "More disk space" },
        ],
        correct_choice: "a",
        feedback: { en: "MFA adds a second proof of identity." },
      },
    ],
    gamification: { sectors: [{ id: "s1", order: 1, name: { en: "Sector 1" }, question_ids: ["tools-001", "tools-002"] }] },
  };
}

const errors = (m: unknown) => validateTetherlessModule(m).filter((i) => i.severity === "error");
const codes = (m: unknown) => errors(m).map((i) => i.code);

test("a module in Chris's format passes, with a Spanish Assist warning only", () => {
  const issues = validateTetherlessModule(chrisModule());
  assert.deepEqual(issues.filter((i) => i.severity === "error"), []);
  assert.deepEqual(issues.map((i) => i.code), ["SPANISH_MISSING"]);
});

test("team fields map onto the format: name, version, difficulty, note", () => {
  const m = chrisModule();
  assert.equal(m.title.en, "Security Tools");
  assert.equal(m.content_version, 1);
  assert.equal(m.level, "beginner");
  assert.equal(m.note, "Week 1 review");
  assert.deepEqual(codes({ ...m, level: "" }), ["MISSING_FIELD"]);
});

test("content_version must be a whole number, not text like Chris's template had", () => {
  const e = errors({ ...chrisModule(), content_version: "0.1.0" });
  assert.equal(e[0]!.code, "INVALID_VERSION");
  assert.match(e[0]!.message, /not "0.1.0"/);
});

test("bad questions are reported with their path", () => {
  const m = chrisModule();
  m.questions[1]!.correct_choice = "Z";
  m.questions[1]!.choices.push({ id: "a", en: "dup" });
  m.questions[0]!.prompt.en = "<img src=x onerror=alert(1)>";
  m.questions[0]!.id = "tools-002";
  m.settings.question_count = 3;
  const c = codes(m);
  for (const expected of ["UNSAFE_TEXT", "DUPLICATE_QUESTION_ID", "DUPLICATE_CHOICE_ID", "CORRECT_CHOICE_MISSING", "QUESTION_COUNT"]) assert.ok(c.includes(expected), expected);
});

test("activity types: multiple choice now, games later", () => {
  assert.deepEqual(codes({ ...chrisModule(), activity_type: "game:block-the-threat" }), []);
  assert.deepEqual(codes({ ...chrisModule(), activity_type: "crossword" }), ["INVALID_ACTIVITY_TYPE"]);
});

test("passing_score_percent is accepted but ignored", () => {
  const m = chrisModule();
  m.settings.passing_score_percent = 80;
  assert.ok(validateTetherlessModule(m).some((i) => i.code === "IGNORED_FIELD" && i.severity === "warning"));
});

test("toCanonical lower-cases choice IDs so phone answers in any case match", () => {
  const c = toCanonical(chrisModule());
  assert.deepEqual(c.questions[0]!.choices.map((x) => x.choice_id), ["a", "b"]);
  assert.equal(c.questions[1]!.correct_choice_id, "a");
  assert.equal(c.questions[0]!.explanation!.en, "A firewall allows or blocks traffic based on rules.");
  assert.deepEqual(validateModule(c).filter((i) => i.severity === "error"), []);
});

test("every repo module converts to the app format and back without changing its answer key", () => {
  for (const f of ["phishing-basics/phishing-basics.v1.json", "pr-bootcamp-security-tools/pr-bootcamp-security-tools.v1.json", "pr-bootcamp-security-tools/pr-bootcamp-security-tools.v2.json"]) {
    const original = load(f);
    const t = fromCanonical(original);
    assert.deepEqual(errors(t), [], f);
    const back = toCanonical(t);
    assert.deepEqual(validateModule(back).filter((i) => i.severity === "error"), [], f);
    const key = (m: ContentModule) => m.questions.map((q) => [q.question_id, q.topic ?? "untagged", q.correct_choice_id, q.choices.map((c) => c.choice_id).join("")]);
    assert.deepEqual(key(back), key(original), f);
    assert.equal(back.boss_missions?.length ?? 0, original.boss_missions?.length ?? 0, f);
  }
});

test("new versions must be higher and must retire removed questions", () => {
  const v1 = chrisModule();
  const same = chrisModule();
  assert.deepEqual(checkNewVersion(same, v1).map((i) => i.code), ["VERSION_NOT_HIGHER"]);
  const v2 = { ...chrisModule(), content_version: 2, questions: [chrisModule().questions[0]!], settings: { ...chrisModule().settings, question_count: 1 } };
  assert.deepEqual(checkNewVersion(v2, v1).map((i) => i.code), ["REMOVED_WITHOUT_RETIRING"]);
  assert.deepEqual(checkNewVersion({ ...v2, retired_question_ids: ["tools-002"] }, v1), []);
  const reuse = { ...chrisModule(), content_version: 3, retired_question_ids: ["tools-002"] };
  assert.ok(codes(reuse).includes("RETIRED_QUESTION_ID"));
});
