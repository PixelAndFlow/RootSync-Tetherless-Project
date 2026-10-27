interface ProgressBarProps {
  value: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const percentage = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label && <div className="mb-2 flex justify-between text-xs text-slate-400"><span>{label}</span><span>{Math.round(percentage)}%</span></div>}
      <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={percentage} className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-300 transition-all duration-300" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
