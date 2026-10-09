interface SpanishAssistToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function SpanishAssistToggle({ enabled, onChange }: SpanishAssistToggleProps) {
  return (
    <button aria-pressed={enabled} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${enabled ? "border-violet-300/60 bg-violet-400/15 text-violet-100" : "border-white/15 bg-white/5 text-slate-300"}`} onClick={() => onChange(!enabled)} type="button">
      ES Assist {enabled ? "On" : "Off"}
    </button>
  );
}
