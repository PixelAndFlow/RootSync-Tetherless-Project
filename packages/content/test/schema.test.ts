import { test } from "node:test";
import assert from "node:assert/strict";
import { validateModule } from "../src/schema.ts";
import { codes, validModule } from "./helpers.ts";

test("a valid module has no errors or warnings", () => {
  assert.deepEqual(validateModule(validModule()), []);
});

test("reports every problem at once, not just the first", () => {
  const m = validModule() as any;
  m.content_version = 0;
  m.module_id = "Bad ID!";
  m.questions[0].correct_choice_id = "z";
  m.questions[1].prompt.en = "";
  const errs = codes(validateModule(m), "error");
  assert.deepEqual(errs.sort(), ["INVALID_CORRECT_ANSWER", "INVALID_MODULE_ID", "MISSING_CONTENT_VERSION", "MISSING_ENGLISH"].sort());
});

test("duplicate question IDs are rejected", () => {
  const m = validModule();
  m.questions[1]!.question_id = "q1";
  const issues = validateModule(m);
  assert.ok(codes(issues, "error").includes("DUPLICATE_QUESTION_ID"));
  assert.equal(issues.find((i) => i.code === "DUPLICATE_QUESTION_ID")?.location?.field, "questions[1].question_id");
});

test("a retired question ID cannot be reused", () => {
  const m = validModule();
  m.retired_question_ids = ["q2"];
  assert.ok(codes(validateModule(m), "error").includes("REUSED_RETIRED_ID"));
});

test("missing content_version and retired list are errors", () => {
  const m = validModule() as any;
  delete m.content_version;
  delete m.retired_question_ids;
  const errs = codes(validateModule(m), "error");
  assert.ok(errs.includes("MISSING_CONTENT_VERSION"));
  assert.ok(errs.includes("MISSING_FIELD"));
});

test("choice count, duplicate choice IDs and unsupported types are caught", () => {
  const m = validModule() as any;
  m.questions[0].choices = [{ choice_id: "a", text: { en: "Only one" } }];
  m.questions[1].choices[1].choice_id = "a";
  m.questions[1].type = "matching";
  const errs = codes(validateModule(m), "error");
  assert.ok(errs.includes("CHOICE_COUNT"));
  assert.ok(errs.includes("DUPLICATE_CHOICE_ID"));
  assert.ok(errs.includes("UNSUPPORTED_TYPE"));
});

test("Spanish is optional, but an empty Spanish string is an error", () => {
  const m = validModule();
  assert.deepEqual(codes(validateModule(m), "error"), []); // q2 has no Spanish at all
  (m.questions[0]!.prompt as any).es = "  ";
  assert.ok(codes(validateModule(m), "error").includes("INVALID_SPANISH"));
});

test("garbled text from a wrong encoding is an error", () => {
  const m = validModule();
  m.questions[0]!.prompt.es = "Â¿QuÃ© es el phishing?";
  const issue = validateModule(m).find((i) => i.code === "ENCODING");
  assert.equal(issue?.location?.field, "questions[0].prompt.es");
});

test("missing topics and duplicate choice text are warnings, not errors", () => {
  const m = validModule();
  delete m.questions[0]!.topic;
  m.questions[1]!.choices[1]!.text.en = "fix weaknesses";
  const issues = validateModule(m);
  assert.deepEqual(codes(issues, "error"), []);
  assert.deepEqual(codes(issues, "warning").sort(), ["DUPLICATE_CHOICE_TEXT", "NO_TOPIC"]);
});

test("unknown fields are warned about", () => {
  const m = validModule() as any;
  m.author = "Trainer 2";
  m.questions[0].points = 10;
  assert.deepEqual(codes(validateModule(m), "warning"), ["UNKNOWN_FIELD", "UNKNOWN_FIELD"]);
});

test("non-object input is rejected cleanly", () => {
  assert.deepEqual(codes(validateModule([1, 2])), ["INVALID_TYPE"]);
  assert.deepEqual(codes(validateModule(null)), ["INVALID_TYPE"]);
});
