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
});
