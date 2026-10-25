import { describe, expect, it } from "vitest";
import type { LearnerRecord } from "../../../packages/contract/src/staff-api.ts";

/**
 * Step 4 of the integration plan: prove the app can import
 * packages/contract directly — nothing more. Chris's staff types
 * (./StaffAdminGateway.ts, ../../types/staff.ts) are untouched; that
 * rename is a separate, later step with his go-ahead.
 */
describe("packages/contract import boundary", () => {
  it("the app can import and use a contract type from packages/contract/src", () => {
    const sample: LearnerRecord = {
      learner_id: "learner-1",
      learner_code: "RCYC-Fixture-0001",
      cohort_id: "cohort-1",
      first_name: "Ada",
      last_name: "Lovelace",
      username: null,
      phone: null,
      email: null,
      training_level: null,
      note_1: null,
      note_2: null,
      status: "awaiting_setup",
      created_at: "2026-10-25T00:00:00.000Z",
      archived_at: null,
    };
    expect(sample.status).toBe("awaiting_setup");
  });
});
