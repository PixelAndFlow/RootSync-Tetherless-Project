import { describe, expect, it } from "vitest";
import { isPlainUuid, WIRE_EVENT_TYPES } from "./wireContract";

describe("pinned wire-contract reference", () => {
  it("lists the eight event types from e2ceb7e, not frontend UI actions", () => {
    expect(WIRE_EVENT_TYPES).toHaveLength(8);
    expect(WIRE_EVENT_TYPES).toContain("answer_submitted");
    expect(WIRE_EVENT_TYPES).not.toContain("question_checked");
  });
  it("accepts plain UUIDs and rejects the prefixed-ID integration failure", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(isPlainUuid(uuid)).toBe(true);
    expect(isPlainUuid(`evt-${uuid}`)).toBe(false);
    expect(isPlainUuid(null)).toBe(false);
  });
});
