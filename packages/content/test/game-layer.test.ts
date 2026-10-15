import { test } from "node:test";
import assert from "node:assert/strict";
import { validateModule, allQuestions, type ContentModule } from "../src/schema.ts";
import { checkAgainstPrevious } from "../src/versioning.ts";
import { importContent } from "../src/import.ts";
import { codes, META, validModule } from "./helpers.ts";

function gameModule(): ContentModule {
  const m = validModule();
  m.topics = [
    { topic_id: "phishing", name: { en: "Phishing", es: "Phishing" } },
    { topic_id: "updates", name: { en: "Updates", es: "Actualizaciones" } },
  ];
  m.questions[0]!.term = { en: "Phishing", es: "Phishing" };
  m.boss_missions = [
    {
      mission_id: "boss-phishing",
      topic: "phishing",
      title: { en: "Locked out?" },
      scenario: { en: "An email says your school account is locked." },
      questions: [
        {
          question_id: "boss-phishing-1",
          type: "multiple_choice",
          prompt: { en: "What do you check first?" },
          choices: [
            { choice_id: "a", text: { en: "The sender and the real link" } },
            { choice_id: "b", text: { en: "How urgent it sounds" } },
          ],
          correct_choice_id: "a",
        },
      ],
    },
  ];
  return m;
}

test("topics, terms and Boss Missions validate", () => {
  assert.deepEqual(validateModule(gameModule()), []);
  assert.equal(allQuestions(gameModule()).length, 3);
});

test("a question topic must be one of the declared topics", () => {
  const m = gameModule();
  m.questions[1]!.topic = "malware";
  const issue = validateModule(m).find((i) => i.code === "UNKNOWN_TOPIC");
  assert.equal(issue?.location?.field, "questions[1].topic");
});

test("Boss Mission question IDs share one namespace with regular questions", () => {
  const m = gameModule();
  m.boss_missions![0]!.questions[0]!.question_id = "q1";
  assert.ok(codes(validateModule(m), "error").includes("DUPLICATE_QUESTION_ID"));
});

test("Boss Missions need a declared topic and at least one valid question", () => {
  const m = gameModule() as any;
  m.boss_missions.push({ mission_id: "boss-x", topic: "nope", title: { en: "X" }, scenario: { en: "Y" }, questions: [] });
  m.boss_missions[0].questions[0].correct_choice_id = "z";
  const errs = codes(validateModule(m), "error");
  assert.ok(errs.includes("UNKNOWN_TOPIC"));
  assert.ok(errs.includes("NO_QUESTIONS"));
  assert.ok(errs.includes("INVALID_CORRECT_ANSWER"));
});

test("removing a Boss Mission retires its question IDs", () => {
  const prev = gameModule();
  const next = { ...gameModule(), content_version: 2, boss_missions: [] };
  const r = checkAgainstPrevious(prev, next);
  assert.deepEqual(r.module.retired_question_ids, ["boss-phishing-1"]);
});

test("re-importing a Kahoot sheet keeps topics, terms, explanations and Boss Missions", () => {
  const prev = gameModule();
  prev.module_id = "test-module";
  prev.questions[0]!.explanation = { en: "Phishing uses fake messages to steal information." };
  const body = [
    "Question,Answer 1,Answer 2,Answer 3,Answer 4,Time limit (sec),Correct answer(s)",
    "¿Qué es el phishing? / What is phishing?,Un mensaje fraudulento / A scam message,Un cable / A cable,,,30,1",
    "Why update software?,Fix weaknesses,Change colors,Delete files,,30,1",
  ].join("\n");
  const out = importContent(Buffer.from(body), "k.csv", { ...META, content_version: 2, previous: prev });
  assert.equal(out.ok, true, JSON.stringify(out.issues));
  const q1 = out.module!.questions[0]!;
  assert.equal(q1.question_id, "q1");
  assert.equal(q1.topic, "phishing");
  assert.deepEqual(q1.term, { en: "Phishing", es: "Phishing" });
  assert.equal(q1.explanation?.en, "Phishing uses fake messages to steal information.");
  assert.equal(out.module!.boss_missions?.length, 1);
  assert.equal(out.module!.topics?.length, 2);
});

test("template CSV reads term columns", () => {
  const body = "question_id,topic,term_en,term_es,prompt_en,choice_a_en,choice_b_en,correct_choice\nq1,vpn,VPN,VPN,What does a VPN do?,Encrypts,Deletes,a\n";
  const out = importContent(Buffer.from(body), "t.csv", META);
  assert.equal(out.ok, true, JSON.stringify(out.issues));
  assert.deepEqual(out.module!.questions[0]!.term, { en: "VPN", es: "VPN" });
});
