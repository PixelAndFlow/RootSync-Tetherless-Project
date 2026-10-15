interface SpanishAssistToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function SpanishAssistToggle({ enabled, onChange }: SpanishAssistToggleProps) {
  return (
    <button aria-pressed={enabled} className="mission-assist rounded-lg border px-3 py-2 text-xs font-bold transition" onClick={() => onChange(!enabled)} type="button">
      Spanish support: {enabled ? "On" : "Off"}
    </button>
  );
}
