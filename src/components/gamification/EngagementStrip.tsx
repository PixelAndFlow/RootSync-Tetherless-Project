import type { EngagementSummary } from "../../types/learning";

export function EngagementStrip({ engagement }: { engagement: EngagementSummary }) {
  return <div className="grid grid-cols-3 gap-2 text-center"><div className="mission-metric rounded-xl border px-2 py-2"><strong className="block text-sm">{engagement.xp} XP</strong><span className="text-[10px]">engagement</span></div><div className="mission-metric rounded-xl border px-2 py-2"><strong className="block text-sm">{engagement.currentStreak}</strong><span className="text-[10px]">streak</span></div><div className="mission-metric rounded-xl border px-2 py-2"><strong className="block text-sm">{engagement.bestStreak}</strong><span className="text-[10px]">best streak</span></div></div>;
}
