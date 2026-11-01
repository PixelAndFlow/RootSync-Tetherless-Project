import { describe, expect, it } from "vitest";
import { operationCyberSquad } from "./modules";
import { validateTetherlessModule } from "../../packages/content/src/tetherless-module";
import starterModule from "./templates/tetherless-module.template.json";
import previewModule from "./fixtures/secure-workspace-basics.preview.json";
import type { TetherlessModule } from "../types/content";

const errorsOnly = (module: unknown) => validateTetherlessModule(module).filter((issue) => issue.severity === "error");

describe("Operation Cyber Squad fixture", () => {
  it("provides the complete bilingual 15-question learner mission", () => {
    expect(operationCyberSquad.questions).toHaveLength(15);
    expect(operationCyberSquad.gamification?.sectors).toHaveLength(4);

    operationCyberSquad.questions.forEach((question) => {
      expect(question.prompt.es).toBeTruthy();
      expect(question.feedback.es).toBeTruthy();
      expect(question.choices).toHaveLength(4);
      expect(question.choices.some((choice) => choice.id === question.correct_choice)).toBe(true);
    });
    expect(errorsOnly(operationCyberSquad)).toEqual([]);
  });
});

describe("starter module template", () => {
  it("stays structurally valid for future content authors", () => {
    expect(errorsOnly(starterModule as TetherlessModule)).toEqual([]);
  });
});

describe("unpublished frontend content preview", () => {
  it("is valid and intentionally stays outside the learner module library", () => {
    expect(errorsOnly(previewModule as TetherlessModule)).toEqual([]);
    expect(operationCyberSquad.module_id).not.toBe((previewModule as TetherlessModule).module_id);
  });
});
