export function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-3xl font-extrabold">{value}</p><p className="mt-1 text-sm text-slate-400">{detail}</p></div>;
}
