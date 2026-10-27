import { fileURLToPath } from "node:url";
import type { Issue } from "../src/issues.ts";
import type { ContentModule } from "../src/schema.ts";

export const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
export const template = (name: string) => fileURLToPath(new URL(`../templates/${name}`, import.meta.url));

export const codes = (issues: Issue[], severity?: Issue["severity"]) =>
  issues.filter((i) => !severity || i.severity === severity).map((i) => i.code);

export const META = { module_id: "test-module", content_version: 1, title_en: "Test Module" } as const;

/** A small valid module used as a starting point for schema and versioning tests. */
export function validModule(): ContentModule {
  return {
    schema_version: 1,
    module_id: "test-module",
    content_version: 1,
    title: { en: "Test Module", es: "Módulo de prueba" },
    retired_question_ids: [],
    questions: [
      {
        question_id: "q1",
        type: "multiple_choice",
        topic: "phishing",
        prompt: { en: "What is phishing?", es: "¿Qué es el phishing?" },
        choices: [
          { choice_id: "a", text: { en: "A scam message", es: "Un mensaje fraudulento" } },
          { choice_id: "b", text: { en: "A cable", es: "Un cable" } },
        ],
        correct_choice_id: "a",
      },
      {
        question_id: "q2",
        type: "multiple_choice",
        topic: "updates",
        prompt: { en: "Why update software?" },
        choices: [
          { choice_id: "a", text: { en: "Fix weaknesses" } },
          { choice_id: "b", text: { en: "Change colors" } },
          { choice_id: "c", text: { en: "Delete files" } },
        ],
        correct_choice_id: "a",
      },
    ],
  };
}
