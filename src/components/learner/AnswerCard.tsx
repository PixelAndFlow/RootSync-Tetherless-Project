import type { Choice } from "../../types/content";
import { answerCardPalette, type AnswerCardColour } from "./answerCardPalette";

interface AnswerCardProps {
  choice: Choice;
  index: number;
  colour?: AnswerCardColour;
  selected: boolean;
  revealed: boolean;
  isCorrect: boolean;
  spanishAssist: boolean;
  disabled?: boolean;
  onChoose: () => void;
}

export function AnswerCard({ choice, index, colour = answerCardPalette[index % answerCardPalette.length], selected, revealed, isCorrect, spanishAssist, disabled = false, onChoose }: AnswerCardProps) {
  const kahootClass = `kahoot-answer kahoot-answer-${colour}`;
  // The screen allocates colours across all four answers. Presentation labels
  // describe learning context, never a card's answer colour.
  const outcomeClass = `${kahootClass}${revealed && isCorrect ? " kahoot-answer-correct" : ""}${revealed && selected && !isCorrect ? " kahoot-answer-selected-incorrect" : ""}`;
  const outcomeLabel = revealed ? (isCorrect ? ". Correct answer." : selected ? ". Incorrect answer." : ".") : selected ? ". Selected." : ".";

  return (
    <button aria-label={`${choice.en}${outcomeLabel}`} aria-pressed={revealed ? undefined : selected} className={`answer-card kahoot-answer-card flex min-h-16 w-full items-start gap-3 rounded-xl border p-4 text-left text-white shadow-lg shadow-black/10 transition disabled:cursor-wait disabled:opacity-100 ${outcomeClass}`} disabled={revealed || disabled} onClick={onChoose} type="button">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold ${selected ? "bg-white text-ink" : "bg-black/20 text-white"}`}>{choice.icon ?? String.fromCharCode(65 + index)}</span>
      <span><span className="block font-semibold leading-6">{choice.en}</span>{spanishAssist && choice.es && <span className="answer-card-translation mt-1 block text-sm leading-5 text-white/85">{choice.es}</span>}</span>
    </button>
  );
}
