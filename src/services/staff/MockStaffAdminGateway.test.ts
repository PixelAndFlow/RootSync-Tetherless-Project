import { describe, expect, it } from "vitest";
import { MockStaffAdminGateway } from "./MockStaffAdminGateway";

describe("MockStaffAdminGateway", () => {
  it("provides the proposed SuperAdmin, Admin and Trainer roles for frontend role testing", async () => {
    const gateway = new MockStaffAdminGateway();
    await expect(gateway.signIn({ username: "demo", password: "demo-password-123" })).resolves.toMatchObject({ role: "superadmin", passwordChangeRequired: false });
    await expect(gateway.signIn({ username: "admin", password: "demo-password-123" })).resolves.toMatchObject({ role: "admin", passwordChangeRequired: true });
    await expect(gateway.signIn({ username: "trainer", password: "demo-password-123" })).resolves.toMatchObject({ role: "trainer", passwordChangeRequired: false });
  });

  it("keeps system controls restricted to SuperAdmin and reveals a demo setup code once", async () => {
    const gateway = new MockStaffAdminGateway();
    expect(gateway.canManage("superadmin", "system")).toBe(true);
    expect(gateway.canManage("admin", "system")).toBe(false);
    expect(gateway.canManage("trainer", "staff")).toBe(false);
    await expect(gateway.createStudent({ cohortId: "cohort-demo-001", firstName: "Taylor", lastName: "King" })).resolves.toMatchObject({ shownOnce: true, setupCode: expect.stringMatching(/^DEMO-/) });
  });
});
