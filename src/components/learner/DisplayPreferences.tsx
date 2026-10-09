interface DisplayPreferencesProps {
  highContrast: boolean;
  reducedMotion: boolean;
  onHighContrastChange: (enabled: boolean) => void;
  onReducedMotionChange: (enabled: boolean) => void;
}

export function DisplayPreferences({ highContrast, reducedMotion, onHighContrastChange, onReducedMotionChange }: DisplayPreferencesProps) {
  return (
    <details className="mt-5 rounded-2xl border border-white/10 bg-panel p-4">
      <summary className="cursor-pointer font-bold text-slate-100">Display preferences</summary>
      <p className="mt-2 text-sm leading-6 text-slate-300">These choices stay on this device. They change presentation only, never mission scores or learning records.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button aria-pressed={highContrast} className={`min-h-11 rounded-xl border px-4 py-3 text-left font-bold ${highContrast ? "border-cyan-300 bg-cyan-300/15 text-cyan-50" : "border-white/15 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"}`} onClick={() => onHighContrastChange(!highContrast)} type="button">
          High contrast: {highContrast ? "On" : "Off"}
        </button>
        <button aria-pressed={reducedMotion} className={`min-h-11 rounded-xl border px-4 py-3 text-left font-bold ${reducedMotion ? "border-cyan-300 bg-cyan-300/15 text-cyan-50" : "border-white/15 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"}`} onClick={() => onReducedMotionChange(!reducedMotion)} type="button">
          Reduce motion: {reducedMotion ? "On" : "Off"}
        </button>
      </div>
    </details>
  );
}
