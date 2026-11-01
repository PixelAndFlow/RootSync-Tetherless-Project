import { describe, expect, it } from "vitest";
import { MockStaffAdminGateway } from "./MockStaffAdminGateway";
import { SPEC_SECTION_10_METHODS } from "./spec-section-10-methods";

/**
 * Catches exactly the drift issue #10 found: a StaffAdminGateway method renamed
 * away from spec v1.30 §10 (or a new one added under a name the spec doesn't
 * use), either direction, going undetected. See spec-section-10-methods.ts for
 * where the spec list comes from and how to update it.
 */

/** Spec methods not yet built on the gateway — each needs a tracking issue, not a silent gap. */
const ALLOWED_MISSING: Record<string, string> = {
  checkRoster: "bulk CSV roster import, split out of #39 into #43 — not yet built",
  commitRoster: "bulk CSV roster import, split out of #39 into #43 — not yet built",
};

/** Real gateway methods with no spec §10 entry — each needs a reason, not a silent extra. */
const ALLOWED_EXTRA: Record<string, string> = {
  resetStaffAccountPassword: "app-specific staff-account action with a real server route (POST .../accounts/:id/reset-password); not listed in spec §10's TypeScript interface block",
};

function gatewayMethodNames(): string[] {
  const proto = MockStaffAdminGateway.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter((name) => name !== "constructor" && typeof proto[name] === "function");
}

describe("StaffAdminGateway spec v1.30 §10 conformance", () => {
  it("has a real gateway method for every spec method name, unless explicitly tracked as not-yet-built", () => {
    const methods = new Set(gatewayMethodNames());
    const missing = SPEC_SECTION_10_METHODS.filter((name) => !methods.has(name) && !(name in ALLOWED_MISSING));
    expect(missing).toEqual([]);
  });

  it("has no gateway method under a name spec §10 doesn't use, unless explicitly allowlisted with a reason", () => {
    const specNames = new Set<string>(SPEC_SECTION_10_METHODS);
    const extra = gatewayMethodNames().filter((name) => !specNames.has(name) && !(name in ALLOWED_EXTRA));
    expect(extra).toEqual([]);
  });

  it("lists every ALLOWED_MISSING/ALLOWED_EXTRA entry for a reason that still applies", () => {
    const methods = new Set(gatewayMethodNames());
    const specNames = new Set<string>(SPEC_SECTION_10_METHODS);
    for (const name of Object.keys(ALLOWED_MISSING)) expect(methods.has(name), `${name} is built now — remove it from ALLOWED_MISSING`).toBe(false);
    for (const name of Object.keys(ALLOWED_EXTRA)) expect(specNames.has(name), `${name} is in spec §10 now — remove it from ALLOWED_EXTRA`).toBe(false);
  });
});
