import { describe, expect, it } from "vitest";
import { operationCyberSquad } from "./modules";
import { getSpanishCoverage } from "./spanishCoverage";

describe("Spanish Assist content coverage", () => {
  it("keeps the published learner mission fully translated", () => {
    expect(getSpanishCoverage(operationCyberSquad)).toEqual(expect.objectContaining({ percent: 100, missing: [] }));
  });

  it("identifies learner-facing copy that still needs translation without rejecting an English-first draft", () => {
    const draft = structuredClone(operationCyberSquad);
    delete draft.questions[0].feedback.es;
    const report = getSpanishCoverage(draft);
    expect(report.percent).toBeLessThan(100);
    expect(report.missing).toContain("question q01 feedback");
  });
});
