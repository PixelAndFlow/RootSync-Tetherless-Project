import type { Choice } from "../../types/content";

export const answerCardPalette = ["red", "blue", "orange", "teal"] as const;
export type AnswerCardColour = (typeof answerCardPalette)[number];

function hasTeamName(choice: Pick<Choice, "en">, colour: "red" | "blue") {
  return new RegExp(`\\b${colour} team\\b`, "i").test(choice.en);
}

/**
 * Give each four-choice question one card of each Kahoot colour.
 * The first explicitly named Red Team/Blue Team answer keeps its matching
 * colour; all remaining answers take an unused colour in reading order.
 */
export function allocateAnswerCardColours(choices: readonly Pick<Choice, "en">[]): AnswerCardColour[] {
  const colours: Array<AnswerCardColour | undefined> = Array(choices.length).fill(undefined);
  const remaining = new Set<AnswerCardColour>(answerCardPalette);

  (['red', 'blue'] as const).forEach((colour) => {
    const namedTeamIndex = choices.findIndex((choice) => hasTeamName(choice, colour));
    if (namedTeamIndex >= 0) {
      colours[namedTeamIndex] = colour;
      remaining.delete(colour);
    }
  });

  choices.forEach((_, index) => {
    if (colours[index]) return;
    const nextColour = answerCardPalette.find((colour) => remaining.has(colour));
    colours[index] = nextColour ?? answerCardPalette[index % answerCardPalette.length];
    remaining.delete(colours[index]);
  });

  return colours as AnswerCardColour[];
}
