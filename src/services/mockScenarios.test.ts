import { describe, expect, it } from "vitest";
import { MOCK_FRONTEND_SCENARIOS, mockScenarioCopy } from "./mockScenarios";

describe("mock frontend scenarios", () => {
  it("keeps an explanatory fixture for every planned Student and staff edge state", () => {
    expect(MOCK_FRONTEND_SCENARIOS).toHaveLength(7);
    expect(Object.keys(mockScenarioCopy)).toEqual(expect.arrayContaining([...MOCK_FRONTEND_SCENARIOS]));
  });
});
