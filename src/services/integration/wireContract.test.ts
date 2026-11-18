import { describe, expect, it } from "vitest";
import { isPlainUuid } from "./wireContract";

describe("pinned wire-contract reference", () => {
  it("accepts plain UUIDs and rejects the prefixed-ID integration failure", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(isPlainUuid(uuid)).toBe(true);
    expect(isPlainUuid(`evt-${uuid}`)).toBe(false);
    expect(isPlainUuid(null)).toBe(false);
  });
});
