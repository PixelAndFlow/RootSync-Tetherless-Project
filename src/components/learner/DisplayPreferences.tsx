interface DisplayPreferencesProps {
  highContrast: boolean;
  reducedMotion: boolean;
  colorTheme: "dark" | "light";
  onHighContrastChange: (enabled: boolean) => void;
  onReducedMotionChange: (enabled: boolean) => void;
  onColorThemeChange: (theme: "dark" | "light") => void;
}

export function DisplayPreferences({ highContrast, reducedMotion, colorTheme, onHighContrastChange, onReducedMotionChange, onColorThemeChange }: DisplayPreferencesProps) {
  return (
    <details className="mt-5 rounded-2xl border border-white/10 bg-panel p-4">
      <summary className="cursor-pointer font-bold text-slate-100">Display preferences</summary>
      <p className="mt-2 text-sm leading-6 text-slate-300" id="display-preferences-help">These choices stay on this device. They change presentation only, never mission scores or learning records. Theme choices do not follow your phone setting.</p>
      <div aria-describedby="display-preferences-help" aria-label="Display settings" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group">
        <button aria-pressed={highContrast} className={`min-h-11 rounded-xl border px-4 py-3 text-left font-bold ${highContrast ? "app-preference-active" : "app-preference-inactive"}`} onClick={() => onHighContrastChange(!highContrast)} type="button">
          High contrast: {highContrast ? "On" : "Off"}
        </button>
        <button aria-pressed={reducedMotion} className={`min-h-11 rounded-xl border px-4 py-3 text-left font-bold ${reducedMotion ? "app-preference-active" : "app-preference-inactive"}`} onClick={() => onReducedMotionChange(!reducedMotion)} type="button">
          Reduce motion: {reducedMotion ? "On" : "Off"}
        </button>
        <button aria-pressed={colorTheme === "dark"} className={`min-h-11 rounded-xl border px-4 py-3 text-left font-bold ${colorTheme === "dark" ? "app-preference-active" : "app-preference-inactive"}`} onClick={() => onColorThemeChange("dark")} type="button">Dark mode</button>
        <button aria-pressed={colorTheme === "light"} className={`min-h-11 rounded-xl border px-4 py-3 text-left font-bold ${colorTheme === "light" ? "app-preference-active" : "app-preference-inactive"}`} onClick={() => onColorThemeChange("light")} type="button">Light mode</button>
      </div>
    </details>
  );
}
