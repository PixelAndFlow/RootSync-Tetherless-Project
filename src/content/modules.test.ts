import { describe, expect, it } from "vitest";
import { operationCyberSquad } from "./modules";
import { validateModule } from "./validateModule";
import starterModule from "./templates/tetherless-module.template.json";
import type { TetherlessModule } from "../types/content";

describe("Operation Cyber Squad fixture", () => {
  it("provides the complete bilingual 15-question learner mission", () => {
    expect(operationCyberSquad.questions).toHaveLength(15);
    expect(operationCyberSquad.gamification?.sectors).toHaveLength(4);

    operationCyberSquad.questions.forEach((question) => {
      expect(question.prompt.es).toBeTruthy();
      expect(question.feedback.es).toBeTruthy();
      expect(question.choices.some((choice) => choice.id === question.correct_choice)).toBe(true);
    });
    expect(validateModule(operationCyberSquad)).toEqual([]);
  });
});

describe("starter module template", () => {
  it("stays structurally valid for future content authors", () => {
    expect(validateModule(starterModule as TetherlessModule)).toEqual([]);
  });
});
