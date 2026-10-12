import type { Choice } from "../../types/content";

interface AnswerCardProps {
  choice: Choice;
  index: number;
  selected: boolean;
  revealed: boolean;
  isCorrect: boolean;
  spanishAssist: boolean;
  disabled?: boolean;
  onChoose: () => void;
}

export function AnswerCard({ choice, index, selected, revealed, isCorrect, spanishAssist, disabled = false, onChoose }: AnswerCardProps) {
  const answerColors = [
    "border-rose-300/50 bg-gradient-to-br from-rose-600/85 to-rose-800/85 hover:border-rose-100",
    "border-blue-300/50 bg-gradient-to-br from-blue-600/85 to-blue-800/85 hover:border-blue-100",
    "border-amber-200/55 bg-gradient-to-br from-amber-500/85 to-amber-700/85 hover:border-amber-100",
    "border-teal-200/50 bg-gradient-to-br from-teal-600/85 to-teal-800/85 hover:border-teal-100",
  ];
  const outcomeClass = revealed
    ? isCorrect
      ? "border-emerald-300/70 bg-emerald-300/10"
      : selected
        ? "border-rose-300/70 bg-rose-300/10"
        : "border-white/10 bg-white/[0.03] opacity-75"
    : selected
      ? "border-violet-300 bg-violet-400/15"
      : answerColors[index % answerColors.length];
  const outcomeLabel = revealed ? (isCorrect ? ". Correct answer." : selected ? ". Incorrect answer." : ".") : selected ? ". Selected." : ".";

  return (
    <button aria-label={`${choice.en}${outcomeLabel}`} aria-pressed={revealed ? undefined : selected} className={`flex min-h-16 w-full items-start gap-3 rounded-xl border p-4 text-left text-white shadow-lg shadow-black/10 transition disabled:cursor-wait disabled:opacity-60 ${outcomeClass}`} disabled={revealed || disabled} onClick={onChoose} type="button">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold ${selected ? "bg-white text-ink" : "bg-black/20 text-white"}`}>{choice.icon ?? String.fromCharCode(65 + index)}</span>
      <span><span className="block font-semibold leading-6">{choice.en}</span>{spanishAssist && choice.es && <span className="mt-1 block text-sm leading-5 text-white/85">{choice.es}</span>}</span>
    </button>
  );
}
