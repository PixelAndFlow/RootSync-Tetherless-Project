import type { Choice } from "../../types/content";

interface AnswerCardProps {
  choice: Choice;
  index: number;
  selected: boolean;
  revealed: boolean;
  isCorrect: boolean;
  spanishAssist: boolean;
  onChoose: () => void;
}

export function AnswerCard({ choice, index, selected, revealed, isCorrect, spanishAssist, onChoose }: AnswerCardProps) {
  const outcomeClass = revealed
    ? isCorrect
      ? "border-emerald-300/70 bg-emerald-300/10"
      : selected
        ? "border-rose-300/70 bg-rose-300/10"
        : "border-white/10 bg-white/[0.03] opacity-75"
    : selected
      ? "border-violet-300 bg-violet-400/15"
      : "border-white/10 bg-white/[0.03] hover:border-violet-300/50 hover:bg-white/[0.06]";

  return (
    <button className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${outcomeClass}`} disabled={revealed} onClick={onChoose} type="button">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold ${selected ? "bg-violet-500 text-white" : "bg-white/10 text-slate-300"}`}>{choice.icon ?? String.fromCharCode(65 + index)}</span>
      <span><span className="block font-semibold leading-6">{choice.en}</span>{spanishAssist && choice.es && <span className="mt-1 block text-sm leading-5 text-slate-400">{choice.es}</span>}</span>
    </button>
  );
}
