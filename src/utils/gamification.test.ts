import { describe, expect, it } from "vitest";
import { operationCyberSquad } from "../content/modules";
import { gamificationAwards } from "./gamification";

describe("gamificationAwards", () => {
  it("derives engagement-only awards from the JSON fixture", () => {
    const awards = gamificationAwards(operationCyberSquad);
    expect(awards.questionXp).toBe(100);
    expect(awards.sectorAwards).toHaveLength(4);
    expect(awards.sectorAwards.map((award) => award.bonusXp)).toEqual([100, 100, 100, 150]);
    expect(awards.missionAward).toEqual({ badgeId: "cyber_recruit", bonusXp: 250 });
  });

  it("uses safe fallbacks and returns copied question ID arrays", () => {
    const withoutAwards = structuredClone(operationCyberSquad);
    withoutAwards.gamification = { sectors: [{ id: "sector", order: 1, name: { en: "Sector" }, question_ids: ["q01"] }] };
    expect(gamificationAwards(withoutAwards)).toEqual({ questionXp: 0, sectorAwards: [{ sectorId: "sector", questionIds: ["q01"], bonusXp: 0 }], missionAward: undefined });

    const awards = gamificationAwards(operationCyberSquad);
    awards.sectorAwards[0].questionIds.push("outside-change");
    expect(operationCyberSquad.gamification?.sectors?.[0].question_ids).not.toContain("outside-change");
  });
});
