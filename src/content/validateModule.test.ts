import { describe, expect, it } from "vitest";
import { operationCyberSquad } from "./modules";
import { validateModule } from "./validateModule";

describe("validateModule", () => {
  it("accepts the supplied Operation Cyber Squad fixture", () => {
    expect(validateModule(operationCyberSquad)).toEqual([]);
  });

  it("reports duplicate IDs and missing correct choices", () => {
    const invalidModule = structuredClone(operationCyberSquad);
    invalidModule.questions[1].id = invalidModule.questions[0].id;
    invalidModule.questions[0].correct_choice = "missing-choice";
    const errors = validateModule(invalidModule);
    expect(errors).toContain(`Duplicate question ID: ${invalidModule.questions[0].id}`);
    expect(errors.some((error) => error.includes("missing correct choice"))).toBe(true);
  });

  it("guards against inconsistent settings, untranslated choices, and invalid sector references", () => {
    const invalidModule = structuredClone(operationCyberSquad);
    invalidModule.settings.question_count = 99;
    invalidModule.questions[0].prompt.en = "";
    invalidModule.questions[0].choices[0].en = "";
    const sectors = invalidModule.gamification?.sectors;
    if (!sectors) throw new Error("The supplied fixture must include sectors for this regression test.");
    sectors[1].id = sectors[0].id;
    sectors[0].question_ids = ["not-a-question"];

    const errors = validateModule(invalidModule);
    expect(errors).toEqual(expect.arrayContaining([
      "Settings question count (99) does not match the 15 supplied questions.",
      `Question ${invalidModule.questions[0].id} is missing an English prompt.`,
      `Question ${invalidModule.questions[0].id}, choice ${invalidModule.questions[0].choices[0].id} is missing English text.`,
      `Duplicate sector ID: ${sectors[0].id}`,
      `Sector ${sectors[0].id} references an unknown question: not-a-question`,
    ]));
  });
});
