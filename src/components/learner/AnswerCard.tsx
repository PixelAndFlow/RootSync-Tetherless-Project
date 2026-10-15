import type { Choice } from "../../types/content";

interface AnswerCardProps {
  choice: Choice;
  index: number;
  selected: boolean;
  revealed: boolean;
  isCorrect: boolean;
  isKahoot?: boolean;
  spanishAssist: boolean;
  disabled?: boolean;
  onChoose: () => void;
}

export function AnswerCard({ choice, index, selected, revealed, isCorrect, isKahoot = false, spanishAssist, disabled = false, onChoose }: AnswerCardProps) {
  const choiceName = choice.en.trim().toLowerCase();
  const teamColour = choiceName.startsWith("blue team") ? "blue" : choiceName.startsWith("red team") ? "red" : null;
  const kahootClass = `kahoot-answer kahoot-answer-${teamColour ?? index % 4}`;
  const outcomeClass = isKahoot
    ? `${kahootClass}${revealed && isCorrect ? " kahoot-answer-correct" : ""}${revealed && selected && !isCorrect ? " kahoot-answer-selected-incorrect" : ""}`
    : revealed
      ? isCorrect
        ? "border-emerald-300/70 bg-emerald-300/10"
        : selected
          ? "border-rose-300/70 bg-rose-300/10"
          : "border-white/10 bg-white/[0.03] opacity-75"
      : selected
        ? "border-violet-300 bg-violet-400/15"
        : "border-white/10 bg-white/[0.03] hover:border-white/25";
  const outcomeLabel = revealed ? (isCorrect ? ". Correct answer." : selected ? ". Incorrect answer." : ".") : selected ? ". Selected." : ".";

  return (
    <button aria-label={`${choice.en}${outcomeLabel}`} aria-pressed={revealed ? undefined : selected} className={`answer-card ${isKahoot ? "kahoot-answer-card" : "answer-card-neutral"} flex min-h-16 w-full items-start gap-3 rounded-xl border p-4 text-left text-white shadow-lg shadow-black/10 transition disabled:cursor-wait disabled:opacity-100 ${outcomeClass}`} disabled={revealed || disabled} onClick={onChoose} type="button">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold ${selected ? "bg-white text-ink" : "bg-black/20 text-white"}`}>{choice.icon ?? String.fromCharCode(65 + index)}</span>
      <span><span className="block font-semibold leading-6">{choice.en}</span>{spanishAssist && choice.es && <span className="answer-card-translation mt-1 block text-sm leading-5 text-white/85">{choice.es}</span>}</span>
    </button>
  );
}
