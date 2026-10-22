import { describe, expect, it } from "vitest";
import { operationCyberSquad } from "../../content/modules";
import { allocateAnswerCardColours } from "./answerCardPalette";

describe("allocateAnswerCardColours", () => {
  it("keeps the first Red Team and Blue Team answers semantic and gives duplicate team names unused colours", () => {
    const colours = allocateAnswerCardColours([
      { en: "Red Team / Grey Hat" },
      { en: "Blue Team / White Hat" },
      { en: "GRC / Black Hat" },
      { en: "Red Team / Black Hat" },
    ]);

    expect(colours).toEqual(["red", "blue", "orange", "teal"]);
  });

  it("reserves a semantic team colour even when it is not the first answer", () => {
    const colours = allocateAnswerCardColours([
      { en: "White Hat" },
      { en: "Authorized Red Team" },
      { en: "Unauthorized / Grey Hat" },
      { en: "Blue Team" },
    ]);

    expect(colours).toEqual(["orange", "red", "teal", "blue"]);
  });

  it("gives every current four-choice mission question four unique colours", () => {
    operationCyberSquad.questions.forEach((question) => {
      const colours = allocateAnswerCardColours(question.choices);
      expect(colours).toHaveLength(4);
      expect(new Set(colours)).toEqual(new Set(["red", "blue", "orange", "teal"]));
    });
  });
});
