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
    await expect(gateway.createLearner({ cohortId: "cohort-demo-001", firstName: "Taylor", lastName: "King" })).resolves.toMatchObject({ shownOnce: true, setupCode: expect.stringMatching(/^DEMO-/) });
  });

  it("resets a demo account's password to a fresh one-time value, and rejects an unknown account", async () => {
    const gateway = new MockStaffAdminGateway();
    const accounts = await gateway.listStaffAccounts();
    const trainer = accounts.find((account) => account.role === "trainer")!;
    const reveal = await gateway.resetStaffAccountPassword(trainer.staffId);
    expect(reveal.account).toEqual(trainer);
    expect(reveal.temporaryPassword).toHaveLength(16);
    await expect(gateway.resetStaffAccountPassword("not-a-real-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("checks, publishes and assigns a new module, end to end", async () => {
    const gateway = new MockStaffAdminGateway();
    const invalid = await gateway.checkModule({ module_id: "x" });
    expect(invalid.valid).toBe(false);
    expect(invalid.willBe).toBe("blocked");

    const draft = { module_id: "new-module", title: { en: "New Module" }, activity_type: "multiple_choice", content_version: 1, questions: [{ id: "q1" }] };
    const check = await gateway.checkModule(draft);
    expect(check).toMatchObject({ valid: true, willBe: "new_module", summary: { moduleId: "new-module", moduleName: "New Module", questionCount: 1 } });

    const published = await gateway.createModule(draft);
    expect(published).toMatchObject({ moduleId: "new-module", contentVersion: 1 });
    expect((await gateway.listModules()).some((m) => m.moduleId === "new-module")).toBe(true);

    const cohortId = (await gateway.listCohorts())[0].cohortId;
    const assignment = await gateway.createAssignment({ moduleId: "new-module", cohortId });
    expect(assignment).toMatchObject({ moduleId: "new-module", cohortId, target: "cohort" });
    await expect(gateway.createAssignment({ moduleId: "new-module", cohortId })).rejects.toMatchObject({ code: "ALREADY_ASSIGNED" });
    await expect(gateway.createAssignment({ moduleId: "does-not-exist", cohortId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await gateway.listAssignments(cohortId)).toEqual([assignment]);
    await gateway.removeAssignment(assignment.assignmentId);
    expect(await gateway.listAssignments(cohortId)).toEqual([]);
    await expect(gateway.removeAssignment(assignment.assignmentId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects publishing a module that fails its own check", async () => {
    const gateway = new MockStaffAdminGateway();
    await expect(gateway.createModule({ module_id: "" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
