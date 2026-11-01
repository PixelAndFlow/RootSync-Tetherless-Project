import { describe, expect, it } from "vitest";
import { MockStaffAdminGateway } from "./MockStaffAdminGateway";

describe("MockStaffAdminGateway", () => {
  it("provides the proposed SuperAdmin, Admin and Trainer roles for frontend role testing", async () => {
    const gateway = new MockStaffAdminGateway();
    await expect(gateway.signIn({ username: "demo", password: "demo-password-123" })).resolves.toMatchObject({ role: "superadmin", passwordChangeRequired: false });
    await expect(gateway.signIn({ username: "admin", password: "demo-password-123" })).resolves.toMatchObject({ role: "admin", passwordChangeRequired: true });
    await expect(gateway.signIn({ username: "trainer", password: "demo-password-123" })).resolves.toMatchObject({ role: "trainer", passwordChangeRequired: false });
  });

  it("tracks the signed-in session for me(), and clears it on sign-out", async () => {
    const gateway = new MockStaffAdminGateway();
    await expect(gateway.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await gateway.signIn({ username: "trainer", password: "demo-password-123" });
    await expect(gateway.me()).resolves.toMatchObject({ role: "trainer", username: "trainer" });
    gateway.signOut();
    await expect(gateway.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
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

    const draft = genuinelyValidModule({ moduleId: "new-module" });
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

  it("Chris's PR #35 review, point 6: checkModule enforces the same shared validator the real server uses, not a simplified stand-in", async () => {
    const gateway = new MockStaffAdminGateway();

    // The old mock-only checks (module_id, title.en, questions.length) would have
    // waved this through; the real validator requires schema_version, a valid
    // answer reference, settings.question_count to match, and more.
    const missingRequiredFields = await gateway.checkModule({ module_id: "new-module", title: { en: "New Module" }, activity_type: "multiple_choice", content_version: 1, questions: [{ id: "q1" }] });
    expect(missingRequiredFields.valid).toBe(false);
    expect(missingRequiredFields.errors.length).toBeGreaterThan(0);

    const badAnswerReference = genuinelyValidModule({ moduleId: "bad-answer" });
    badAnswerReference.questions[0].correct_choice = "not-a-real-choice-id";
    await expect(gateway.createModule(badAnswerReference)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    // A genuinely valid module still passes and publishes (same path the end-to-end test above checks).
    const valid = genuinelyValidModule({ moduleId: "another-valid-module" });
    await expect(gateway.checkModule(valid)).resolves.toMatchObject({ valid: true });

    // Version transitions are now enforced too: a same-or-lower version on a republish is VERSION_EXISTS, not a silent overwrite.
    await gateway.createModule(valid);
    await expect(gateway.createModule(valid)).rejects.toMatchObject({ code: "VERSION_EXISTS" });
  });

  it("issue #38: creates, renames and archives cohorts, enforcing unique names", async () => {
    const gateway = new MockStaffAdminGateway();
    const created = await gateway.createCohort("New Cohort");
    expect(created).toMatchObject({ name: "New Cohort", archived: false, learnerCount: 0 });
    await expect(gateway.createCohort("New Cohort")).rejects.toMatchObject({ code: "COHORT_NAME_TAKEN" });
    await expect(gateway.createCohort("  ")).rejects.toMatchObject({ code: "NAME_INVALID" });

    const renamed = await gateway.renameCohort(created.cohortId, "Renamed Cohort");
    expect(renamed.name).toBe("Renamed Cohort");
    await expect(gateway.renameCohort("not-a-real-id", "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(gateway.renameCohort(created.cohortId, "RCYC-PR-Bootcamp2026")).rejects.toMatchObject({ code: "COHORT_NAME_TAKEN" });

    await gateway.archiveCohort(created.cohortId);
    expect((await gateway.listCohorts()).find((c) => c.cohortId === created.cohortId)?.archived).toBe(true);
    await expect(gateway.archiveCohort("not-a-real-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("issue #39: reads, edits, archives and reissues a setup code for a learner, rejecting bad fields and unknown IDs", async () => {
    const gateway = new MockStaffAdminGateway();
    const record = await gateway.getLearnerRecord("student-demo-001");
    expect(record).toMatchObject({ firstName: "Alex", lastName: "Rivera", cohortName: "RCYC-PR-Bootcamp2026" });
    expect(record.devices).toHaveLength(1);
    await expect(gateway.getLearnerRecord("not-a-real-id")).rejects.toMatchObject({ code: "NOT_FOUND" });

    const updated = await gateway.updateLearner("student-demo-001", { phone: "555-123-4567", note1: "VIP" });
    expect(updated).toMatchObject({ phone: "555-123-4567", note1: "VIP", firstName: "Alex" });
    await expect(gateway.updateLearner("student-demo-001", { email: "not-an-email" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(gateway.updateLearner("student-demo-001", { firstName: "   " })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(gateway.updateLearner("not-a-real-id", { phone: "555-0000" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const reveal = await gateway.issueSetupCode("student-demo-002", false);
    expect(reveal).toMatchObject({ phonesSwitchedOff: 0 });
    expect(reveal.setupCode).toMatch(/^DEMO-/);
    const revealWithSwitchOff = await gateway.issueSetupCode("student-demo-002", true);
    expect(revealWithSwitchOff.phonesSwitchedOff).toBe(1);

    await gateway.switchOffPhone("student-demo-001", "device-demo-001");
    await expect(gateway.switchOffPhone("student-demo-001", "device-demo-001")).rejects.toMatchObject({ code: "NOT_FOUND" }); // already off
    await expect(gateway.switchOffPhone("student-demo-001", "not-a-real-device")).rejects.toMatchObject({ code: "NOT_FOUND" });

    await gateway.archiveLearner("student-demo-003");
    expect((await gateway.getLearnerRecord("student-demo-003")).status).toBe("archived");
    await expect(gateway.issueSetupCode("student-demo-003", false)).rejects.toMatchObject({ code: "LEARNER_ARCHIVED" });
  });

  it("issue #39: purges a learner only with the matching confirmation code (Superadmin, destructive)", async () => {
    const gateway = new MockStaffAdminGateway();
    const learner = await gateway.getLearnerRecord("student-demo-003");
    await expect(gateway.purgeLearner("student-demo-003", "wrong-code")).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    await expect(gateway.purgeLearner("not-a-real-id", learner.learnerCode)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(gateway.purgeLearner("student-demo-003", learner.learnerCode)).resolves.toMatchObject({ eventsDeleted: 0 });
    await expect(gateway.getLearnerRecord("student-demo-003")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("issue #40: reads a published version, archives unconditionally, and blocks purging an in-use module", async () => {
    const gateway = new MockStaffAdminGateway();
    const draft = genuinelyValidModule({ moduleId: "versioned-module" });
    await gateway.createModule(draft);
    await expect(gateway.getModuleVersion("versioned-module", 1)).resolves.toMatchObject({ module_id: "versioned-module", content_version: 1 });
    await expect(gateway.getModuleVersion("versioned-module", 99)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(gateway.getModuleVersion("not-a-real-module", 1)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await gateway.archiveModule("versioned-module");
    expect((await gateway.listModules()).find((m) => m.moduleId === "versioned-module")?.archived).toBe(true);
    await expect(gateway.archiveModule("not-a-real-module")).rejects.toMatchObject({ code: "NOT_FOUND" });

    const cohortId = (await gateway.listCohorts())[0].cohortId;
    const unused = genuinelyValidModule({ moduleId: "unused-module" });
    await gateway.createModule(unused);
    const assigned = genuinelyValidModule({ moduleId: "assigned-module" });
    await gateway.createModule(assigned);
    await gateway.createAssignment({ moduleId: "assigned-module", cohortId });

    await gateway.purgeModule("unused-module");
    expect((await gateway.listModules()).some((m) => m.moduleId === "unused-module")).toBe(false);
    await expect(gateway.purgeModule("assigned-module")).rejects.toMatchObject({ code: "IN_USE" });
    await expect(gateway.purgeModule("not-a-real-module")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/** A module that satisfies every rule in packages/content/src/tetherless-module.ts's validateTetherlessModule(), not just the mock's old simplified checks. */
function genuinelyValidModule(opts: { moduleId: string }) {
  return {
    schema_version: "tetherless.module.v1",
    module_id: opts.moduleId,
    content_version: 1,
    level: "beginner",
    title: { en: "New Module" },
    settings: { question_count: 1, timer_seconds: null, show_immediate_feedback: true, allow_retry: true, spanish_assist_default: false },
    questions: [
      {
        id: "q1",
        topic: "intro",
        type: "multiple_choice",
        presentation: "standard",
        prompt: { en: "What is 2+2?" },
        choices: [{ id: "a", en: "3" }, { id: "b", en: "4" }],
        correct_choice: "b",
        feedback: { en: "Correct!" },
      },
    ],
  };
}
