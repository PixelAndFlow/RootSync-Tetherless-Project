export function PerformanceBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return <div><div className="mb-2 flex justify-between gap-3 text-sm"><span className="font-semibold">{label}</span><span className="text-slate-400">{value}/{total}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-300" style={{ width: `${percent}%` }} /></div></div>;
}
