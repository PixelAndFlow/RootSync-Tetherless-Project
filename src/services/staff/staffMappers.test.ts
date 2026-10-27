import { describe, expect, it } from "vitest";
import cohorts from "../../../packages/contract/fixtures/cohorts.json";
import learners from "../../../packages/contract/fixtures/learners.json";
import modules from "../../../packages/contract/fixtures/modules.json";
import { toCohort, toLearnerRecord, toModuleListing } from "./staffMappers";

// Wire name -> app name. The words match; only the case changes (decided 2026-10-27).
const camel = (name: string) => name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function expectTranslated(wire: Record<string, unknown>, app: Record<string, unknown>) {
  for (const [key, value] of Object.entries(wire)) {
    expect(app, `wire field ${key} is missing from the app type`).toHaveProperty(camel(key), value);
  }
  expect(Object.keys(app).filter((key) => key.includes("_")), "snake_case names leaked into the app type").toEqual([]);
}

describe("wire to app translation, against the recorded server responses", () => {
  it("translates every cohort field", () => {
    for (const row of cohorts.cohorts) expectTranslated(row, toCohort(row as never) as never);
  });
  it("translates every learner field", () => {
    for (const row of learners.learners) expectTranslated(row, toLearnerRecord(row as never) as never);
  });
  it("translates every module field", () => {
    for (const row of modules.modules) expectTranslated(row, toModuleListing(row as never) as never);
  });
});
