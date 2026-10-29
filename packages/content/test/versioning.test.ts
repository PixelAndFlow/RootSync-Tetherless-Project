import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAgainstPrevious } from "../src/versioning.ts";
import { importContent, importFile } from "../src/import.ts";
import { codes, fixture, META, validModule } from "./helpers.ts";

const v2 = () => ({ ...validModule(), content_version: 2 });

test("an unchanged module at a higher version passes cleanly", () => {
  const r = checkAgainstPrevious(validModule(), v2());
  assert.deepEqual(r.issues, []);
});

test("content_version must go up", () => {
  const r = checkAgainstPrevious(validModule(), validModule());
  assert.deepEqual(codes(r.issues), ["VERSION_NOT_INCREASED"]);
});

test("a removed question is retired automatically", () => {
  const next = v2();
  next.questions = next.questions.slice(0, 1);
  const r = checkAgainstPrevious(validModule(), next);
  assert.deepEqual(r.module.retired_question_ids, ["q2"]);
  assert.deepEqual(codes(r.issues), ["QUESTION_RETIRED"]);
});

test("a retired ID coming back is an error", () => {
  const prev = { ...validModule(), retired_question_ids: ["old-1"] };
  const next = v2();
  next.questions[1]!.question_id = "old-1";
  assert.ok(codes(checkAgainstPrevious(prev, next).issues, "error").includes("REUSED_RETIRED_ID"));
});

test("answer-key corrections and wording changes are flagged for a human", () => {
  const next = v2();
  next.questions[0]!.correct_choice_id = "b";
  next.questions[1]!.prompt.en = "Why should you update software?";
  next.questions[1]!.choices[2]!.text.en = "Remove files";
  const r = checkAgainstPrevious(validModule(), next);
  assert.deepEqual(codes(r.issues, "warning").sort(), ["ANSWER_KEY_CHANGED", "CHOICES_CHANGED", "QUESTION_TEXT_CHANGED"]);
  assert.deepEqual(codes(r.issues, "error"), []);
});

test("a different module is refused", () => {
  const next = { ...v2(), module_id: "other-module" };
  assert.deepEqual(codes(checkAgainstPrevious(validModule(), next).issues), ["MODULE_MISMATCH"]);
});

test("re-importing an edited Kahoot sheet keeps IDs stable and never reuses retired ones", async () => {
  const first = await importFile(fixture("kahoot_simple.xlsx"), META);
  assert.equal(first.ok, true);
  const v1 = first.module!;

  // Version 2: question 2 removed, question 3 kept, a new question added.
  const body = [
    "Question - max 120 characters,Answer 1,Answer 2,Answer 3,Answer 4,Time limit (sec),Correct answer(s)",
    "¿Qué es el phishing? / What is phishing?,Un correo engañoso / A deceptive email,Un tipo de cable / A type of cable,,,30,1",
    "¿Cuáles son navegadores? / Which are browsers?,Firefox y Chrome,Excel y Word,,,60,1",
    "¿Qué es un firewall? / What is a firewall?,Un filtro de red / A network filter,Un teclado / A keyboard,,,30,1",
  ].join("\n");
  const second = importContent(Buffer.from(body), "kahoot_v2.csv", { ...META, content_version: 2, previous: v1 });
  assert.equal(second.ok, true, JSON.stringify(second.issues));
  const ids = second.module!.questions.map((q) => q.question_id);
  assert.deepEqual(ids, ["test-module-q01", "test-module-q03", "test-module-q04"]);
  assert.deepEqual(second.module!.retired_question_ids, ["test-module-q02"]);
  assert.ok(codes(second.issues, "info").includes("NEW_QUESTION"));
  assert.ok(codes(second.issues, "info").includes("QUESTION_RETIRED"));
  // Choices changed for q01 (two answers dropped): flagged, not blocked.
  assert.ok(codes(second.issues, "warning").includes("CHOICES_CHANGED"));

  // Version 3 must not hand out the retired q02 again.
  const body3 = body + "\n¿Qué es un parche? / What is a patch?,Una actualización / An update,Un virus / A virus,,,20,1";
  const third = importContent(Buffer.from(body3), "kahoot_v3.csv", { ...META, content_version: 3, previous: second.module! });
  assert.equal(third.ok, true, JSON.stringify(third.issues));
  assert.equal(third.module!.questions.at(-1)!.question_id, "test-module-q05");
});
