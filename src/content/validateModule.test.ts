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

  it("rejects invalid score policies and incomplete learning copy", () => {
    const invalidModule = structuredClone(operationCyberSquad);
    invalidModule.schema_version = "";
    invalidModule.title.en = "";
    invalidModule.settings.passing_score_percent = 101;
    invalidModule.questions[0].topic = "";
    invalidModule.questions[0].feedback.en = "";
    invalidModule.questions[0].choices = [invalidModule.questions[0].choices[0]];
    const sector = invalidModule.gamification?.sectors?.[0];
    if (!sector) throw new Error("The supplied fixture must include a sector for this regression test.");
    sector.name.en = "";
    sector.question_ids = ["q01", "q01"];

    expect(validateModule(invalidModule)).toEqual(expect.arrayContaining([
      "Schema version is required.",
      "Module title is missing an English value.",
      "Passing score percent must be between 0 and 100.",
      "Question q01 is missing a topic.",
      "Question q01 is missing English feedback.",
      "Question q01 must include at least two choices.",
      `Sector ${sector.id} is missing an English name.`,
      `Sector ${sector.id} repeats question: q01`,
    ]));
  });
});
