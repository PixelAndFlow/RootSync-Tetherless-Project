export function CyberShield({ masteryPercent }: { masteryPercent: number }) {
  const percentage = Math.round(masteryPercent);
  return <div className="flex items-center gap-4 rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-cyan-300/15 to-violet-400/10 p-4"><div aria-label={`Cyber Shield ${percentage}%`} className="grid h-16 w-16 place-items-center rounded-[45%_45%_50%_50%] border-2 border-cyan-200/70 bg-cyan-300/10 text-center text-sm font-extrabold text-cyan-100" role="img">{percentage}%</div><div><p className="text-xs font-bold tracking-[0.16em] text-cyan-200">CYBER SHIELD</p><p className="mt-1 text-sm text-slate-200">Built from current mastery—not XP or score.</p></div></div>;
}
