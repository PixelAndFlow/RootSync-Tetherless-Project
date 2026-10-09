import type { EngagementSummary } from "../../types/learning";

export function EngagementStrip({ engagement }: { engagement: EngagementSummary }) {
  return <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-2 py-2"><strong className="block text-sm text-amber-100">{engagement.xp} XP</strong><span className="text-[10px] text-amber-100/70">engagement</span></div><div className="rounded-xl border border-violet-300/20 bg-violet-300/10 px-2 py-2"><strong className="block text-sm text-violet-100">{engagement.currentStreak}</strong><span className="text-[10px] text-violet-100/70">streak</span></div><div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-2 py-2"><strong className="block text-sm text-cyan-100">{engagement.bestStreak}</strong><span className="text-[10px] text-cyan-100/70">best streak</span></div></div>;
}
