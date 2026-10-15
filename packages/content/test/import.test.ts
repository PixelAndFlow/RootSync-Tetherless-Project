import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importContent, importFile } from "../src/import.ts";
import { readXlsxFirstSheet } from "../src/xlsx.ts";
import { codes, fixture, META, template, validModule } from "./helpers.ts";

const csv = (text: string) => Buffer.from(text, "utf8");

test("xlsx reader returns the first sheet's cells", async () => {
  const rows = readXlsxFirstSheet(await readFile(fixture("kahoot_simple.xlsx")));
  assert.equal(rows.length, 4);
  assert.equal(rows[1]?.[0], "¿Qué es el phishing? / What is phishing?");
  assert.equal(rows[1]?.[5], 30);
  assert.equal(rows[2]?.[3], null); // empty Answer 3
});

test("Kahoot .xlsx: splits languages, numbers IDs, maps the correct answer", async () => {
  const out = await importFile(fixture("kahoot_simple.xlsx"), META);
  assert.equal(out.ok, true, JSON.stringify(out.issues));
  const m = out.module!;
  assert.equal(m.source?.format, "kahoot");
  assert.deepEqual(m.questions.map((q) => q.question_id), ["test-module-q01", "test-module-q02", "test-module-q03"]);
  const q1 = m.questions[0]!;
  assert.deepEqual(q1.prompt, { en: "What is phishing?", es: "¿Qué es el phishing?" });
  assert.equal(q1.correct_choice_id, "a");
  assert.equal(q1.time_limit_sec, 30);
  // Two-answer question keeps only the filled answers.
  assert.equal(m.questions[1]!.choices.length, 2);
  // Language-neutral answers ("Firefox y Chrome") are copied to both languages in a bilingual question.
  assert.deepEqual(m.questions[2]!.choices[0]!.text, { en: "Firefox y Chrome", es: "Firefox y Chrome" });
});

test("Kahoot: finds the header below instruction rows and reports row-level problems", async () => {
  const out = await importFile(fixture("kahoot_template_with_problems.xlsx"), META);
  assert.equal(out.ok, false);
  const multi = out.issues.find((i) => i.code === "MULTIPLE_CORRECT_NOT_SUPPORTED");
  assert.equal(multi?.location?.row, 6);
  const empty = out.issues.find((i) => i.code === "INVALID_CORRECT_ANSWER");
  assert.equal(empty?.location?.row, 7);
  // The decomposed accent in row 5 was normalized.
  assert.equal(out.module!.questions[0]!.prompt.es, "¿Qué es la autenticación?");
  // "TCP/IP" was not split as if it were two languages.
  assert.equal(out.module!.questions[2]!.prompt.en, "What is TCP/IP?");
});

test("flat files require module ID, version and title", () => {
  const out = importContent(csv("question_id,prompt_en,choice_a_en,choice_b_en,correct_choice\nq1,P,A,B,a\n"), "x.csv", {});
  assert.equal(out.ok, false);
  assert.deepEqual(codes(out.issues), ["MISSING_MODULE_INFO"]);
});

test("template CSV: the shipped template imports cleanly", async () => {
  const out = await importFile(template("tetherless-template.csv"), META);
  assert.equal(out.ok, true, JSON.stringify(out.issues));
  const q = out.module!.questions[0]!;
  assert.equal(q.topic, "phishing");
  assert.equal(q.explanation?.es?.startsWith("El phishing engaña"), true);
  assert.equal(out.module!.questions[1]!.choices.length, 3);
  assert.equal(out.module!.questions[1]!.time_limit_sec, undefined);
});

test("template CSV: errors name the spreadsheet row and column", () => {
  const body = [
    "question_id,prompt_en,choice_a_en,choice_b_en,choice_c_es,correct_choice,mystery",
    "q1,Good question,A,B,,a,",
    "q1,Duplicate id,A,B,,b,",
    "q3,Bad answer key,A,B,,d,",
    "q4,Spanish only choice,A,B,Solo español,a,",
    "q5,Two answers,A,B,,\"a,b\",",
  ].join("\n");
  const out = importContent(csv(body), "quiz.csv", META);
  assert.equal(out.ok, false);
  const at = (code: string) => out.issues.find((i) => i.code === code)?.location?.row;
  assert.equal(at("DUPLICATE_QUESTION_ID"), 3);
  assert.equal(at("INVALID_CORRECT_ANSWER"), 4);
  assert.equal(at("MISSING_ENGLISH"), 5);
  assert.equal(at("MULTIPLE_CORRECT_NOT_SUPPORTED"), 6);
  assert.ok(codes(out.issues, "warning").includes("UNKNOWN_COLUMN"));
});

test("template CSV: missing required columns stop the import", () => {
  const out = importContent(csv("question_id,prompt_en,choice_a_en\nq1,P,A\n"), "q.csv", META);
  assert.deepEqual(codes(out.issues, "error").sort(), ["MISSING_COLUMN", "MISSING_COLUMN"]);
  assert.equal(out.module, undefined);
});

test("semicolon CSV with BOM and accents imports correctly", () => {
  const body = "\uFEFFquestion_id;prompt_en;prompt_es;choice_a_en;choice_b_en;correct_choice\nq1;What is it?;¿Qué es?;Yes;No;a\n";
  const out = importContent(csv(body), "q.csv", META);
  assert.equal(out.ok, true, JSON.stringify(out.issues));
  assert.equal(out.module!.questions[0]!.prompt.es, "¿Qué es?");
});

test("garbled CSV (UTF-8 opened as Windows-1252) is rejected", () => {
  const body = "question_id,prompt_en,prompt_es,choice_a_en,choice_b_en,correct_choice\nq1,What?,Â¿QuÃ© es?,A,B,a\n";
  const out = importContent(csv(body), "q.csv", META);
  assert.ok(codes(out.issues, "error").includes("ENCODING"));
});

test("JSON: a canonical module validates and is normalized", () => {
  const m = validModule();
  m.questions[0]!.prompt.es = "¿Qué es el phishing?".normalize("NFD");
  const out = importContent(Buffer.from(JSON.stringify(m)), "m.json");
  assert.equal(out.ok, true, JSON.stringify(out.issues));
  assert.equal(out.module!.questions[0]!.prompt.es, "¿Qué es el phishing?");
});

test("JSON: syntax errors and unsupported file types are reported", () => {
  assert.deepEqual(codes(importContent(Buffer.from("{ nope"), "m.json").issues), ["INVALID_JSON"]);
  assert.deepEqual(codes(importContent(Buffer.from("x"), "m.docx").issues), ["UNSUPPORTED_FILE"]);
  assert.deepEqual(codes(importContent(Buffer.from("not a zip"), "m.xlsx").issues), ["UNREADABLE_FILE"]);
});

test("unrecognised CSV headers are reported", () => {
  const out = importContent(csv("foo,bar\n1,2\n"), "q.csv", META);
  assert.deepEqual(codes(out.issues), ["UNKNOWN_FORMAT"]);
});
