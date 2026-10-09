import type { TetherlessModule } from "../types/content";
import type { MissionMasteryAward, SectorMasteryAward } from "../types/learning";

function numericSetting(settings: Record<string, unknown> | undefined, key: string, fallback = 0): number {
  const value = settings?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function gamificationAwards(module: TetherlessModule): {
  questionXp: number;
  sectorAwards: SectorMasteryAward[];
  missionAward: MissionMasteryAward | undefined;
} {
  const config = module.gamification;
  const sectors = config?.sectors ?? [];
  const sectorAwards = sectors.map((sector) => ({
    sectorId: sector.id,
    questionIds: sector.question_ids,
    bonusXp: sector.mastery_bonus_xp ?? 0,
  }));
  const badge = config?.mission_badge;
  return {
    questionXp: numericSetting(config?.xp, "first_time_question_mastery_xp", 0),
    sectorAwards,
    missionAward: badge ? {
      badgeId: badge.id,
      bonusXp: numericSetting(config?.xp, "mission_mastery_bonus_xp", 0),
    } : undefined,
  };
}
