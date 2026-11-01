import { describe, expect, it } from "vitest";
import { MockStaffAdminGateway } from "./MockStaffAdminGateway";

describe("MockStaffAdminGateway", () => {
  it("provides the proposed SuperAdmin, Admin and Trainer roles for frontend role testing", async () => {
    const gateway = new MockStaffAdminGateway();
    await expect(gateway.login({ username: "demo", password: "demo-password-123" })).resolves.toMatchObject({ role: "superadmin", passwordChangeRequired: false });
    await expect(gateway.login({ username: "admin", password: "demo-password-123" })).resolves.toMatchObject({ role: "admin", passwordChangeRequired: true });
    await expect(gateway.login({ username: "trainer", password: "demo-password-123" })).resolves.toMatchObject({ role: "trainer", passwordChangeRequired: false });
  });

  it("tracks the signed-in session for me(), and clears it on sign-out", async () => {
    const gateway = new MockStaffAdminGateway();
    await expect(gateway.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await gateway.login({ username: "trainer", password: "demo-password-123" });
    await expect(gateway.me()).resolves.toMatchObject({ role: "trainer", username: "trainer" });
    gateway.logout();
    await expect(gateway.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("reveals a demo setup code once", async () => {
    const gateway = new MockStaffAdminGateway();
    await expect(gateway.createLearner({ cohortId: "cohort-demo-001", firstName: "Taylor", lastName: "King" })).resolves.toMatchObject({ shownOnce: true, setupCode: expect.stringMatching(/^DEMO-/) });
  });

  it("resets a demo account's password to a fresh one-time value, and rejects an unknown account", async () => {
    const gateway = new MockStaffAdminGateway();
    const accounts = await gateway.listStaff();
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

    const published = await gateway.publishModule(draft);
    expect(published).toMatchObject({ moduleId: "new-module", contentVersion: 1 });
    expect((await gateway.listModules()).some((m) => m.moduleId === "new-module")).toBe(true);

    const cohortId = (await gateway.listCohorts())[0].cohortId;
    const assignment = await gateway.assign({ moduleId: "new-module", cohortId });
    expect(assignment).toMatchObject({ moduleId: "new-module", cohortId, target: "cohort" });
    await expect(gateway.assign({ moduleId: "new-module", cohortId })).rejects.toMatchObject({ code: "ALREADY_ASSIGNED" });
    await expect(gateway.assign({ moduleId: "does-not-exist", cohortId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await gateway.listAssignments(cohortId)).toEqual([assignment]);
    await gateway.unassign(assignment.assignmentId);
    expect(await gateway.listAssignments(cohortId)).toEqual([]);
    await expect(gateway.unassign(assignment.assignmentId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects publishing a module that fails its own check", async () => {
    const gateway = new MockStaffAdminGateway();
    await expect(gateway.publishModule({ module_id: "" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
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
    await expect(gateway.publishModule(badAnswerReference)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    // A genuinely valid module still passes and publishes (same path the end-to-end test above checks).
    const valid = genuinelyValidModule({ moduleId: "another-valid-module" });
    await expect(gateway.checkModule(valid)).resolves.toMatchObject({ valid: true });

    // Version transitions are now enforced too: a same-or-lower version on a republish is VERSION_EXISTS, not a silent overwrite.
    await gateway.publishModule(valid);
    await expect(gateway.publishModule(valid)).rejects.toMatchObject({ code: "VERSION_EXISTS" });
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
    await gateway.publishModule(draft);
    await expect(gateway.getModuleVersion("versioned-module", 1)).resolves.toMatchObject({ module_id: "versioned-module", content_version: 1 });
    await expect(gateway.getModuleVersion("versioned-module", 99)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(gateway.getModuleVersion("not-a-real-module", 1)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await gateway.archiveModule("versioned-module");
    expect((await gateway.listModules()).find((m) => m.moduleId === "versioned-module")?.archived).toBe(true);
    await expect(gateway.archiveModule("not-a-real-module")).rejects.toMatchObject({ code: "NOT_FOUND" });

    const cohortId = (await gateway.listCohorts())[0].cohortId;
    const unused = genuinelyValidModule({ moduleId: "unused-module" });
    await gateway.publishModule(unused);
    const assigned = genuinelyValidModule({ moduleId: "assigned-module" });
    await gateway.publishModule(assigned);
    await gateway.assign({ moduleId: "assigned-module", cohortId });

    await gateway.purgeModule("unused-module");
    expect((await gateway.listModules()).some((m) => m.moduleId === "unused-module")).toBe(false);
    await expect(gateway.purgeModule("assigned-module")).rejects.toMatchObject({ code: "IN_USE" });
    await expect(gateway.purgeModule("not-a-real-module")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("issue #41: disables and re-enables a staff account, preventing self-lockout and last-Superadmin lockout", async () => {
    const gateway = new MockStaffAdminGateway();
    await gateway.login({ username: "demo", password: "demo-password-123" });
    const accounts = await gateway.listStaff();
    const admin = accounts.find((a) => a.role === "admin")!;
    const superadmin = accounts.find((a) => a.role === "superadmin")!;

    await expect(gateway.setStaffDisabled("not-a-real-id", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(gateway.setStaffDisabled(superadmin.staffId, true)).rejects.toMatchObject({ code: "LOCKOUT_PREVENTED" }); // self
    await expect(gateway.setStaffDisabled(admin.staffId, true)).resolves.toBeUndefined();
    expect((await gateway.listStaff()).find((a) => a.staffId === admin.staffId)?.disabled).toBe(true);
    await gateway.setStaffDisabled(admin.staffId, false);
    expect((await gateway.listStaff()).find((a) => a.staffId === admin.staffId)?.disabled).toBe(false);
  });

  it("issue #41: last active Superadmin can't be disabled even by someone else", async () => {
    const gateway = new MockStaffAdminGateway();
    await gateway.login({ username: "admin", password: "demo-password-123" });
    const superadmin = (await gateway.listStaff()).find((a) => a.role === "superadmin")!;
    await expect(gateway.setStaffDisabled(superadmin.staffId, true)).rejects.toMatchObject({ code: "LOCKOUT_PREVENTED" });
  });

  it("issue #41: reads and edits role permissions, protecting Superadmin's permissions.manage and rejecting unknown permissions", async () => {
    const gateway = new MockStaffAdminGateway();
    const { roles, permissions } = await gateway.getRolePermissions();
    expect(permissions).toContain("permissions.manage");
    expect(roles.trainer).not.toContain("data.purge");

    await gateway.setRolePermissions("trainer", [...roles.trainer, "data.purge"]);
    expect((await gateway.getRolePermissions()).roles.trainer).toContain("data.purge");

    await expect(gateway.setRolePermissions("trainer", ["not-a-real-permission" as never])).rejects.toMatchObject({ code: "UNKNOWN_PERMISSION" });
    await expect(gateway.setRolePermissions("superadmin", roles.superadmin.filter((p) => p !== "permissions.manage"))).rejects.toMatchObject({ code: "LOCKOUT_PREVENTED" });
  });

  it("issue #41: reads and edits score thresholds, rejecting out-of-range values and struggling-above-passing", async () => {
    const gateway = new MockStaffAdminGateway();
    const current = await gateway.getThresholds();
    expect(current).toEqual({ passPct: 70, strugglingPct: 50, weakTopicPct: 60, weakTopicMinAnswers: 2 });

    const updated = await gateway.setThresholds({ passPct: 75, strugglingPct: 55, weakTopicPct: 65, weakTopicMinAnswers: 3 });
    expect(updated).toEqual({ passPct: 75, strugglingPct: 55, weakTopicPct: 65, weakTopicMinAnswers: 3 });
    expect(await gateway.getThresholds()).toEqual(updated);

    await expect(gateway.setThresholds({ passPct: 101, strugglingPct: 50, weakTopicPct: 60, weakTopicMinAnswers: 2 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(gateway.setThresholds({ passPct: 50, strugglingPct: 60, weakTopicPct: 60, weakTopicMinAnswers: 2 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("issue #41: exports a cohort as a downloadable JSON blob, rejecting an unknown cohort", async () => {
    const gateway = new MockStaffAdminGateway();
    const cohortId = (await gateway.listCohorts())[0].cohortId;
    const blob = await gateway.exportCohort(cohortId);
    expect(blob).toBeInstanceOf(Blob);
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    const body = JSON.parse(text);
    expect(body).toMatchObject({ export_version: 2, cohort: { cohortId } });
    expect(Array.isArray(body.learners)).toBe(true);
    await expect(gateway.exportCohort("not-a-real-cohort")).rejects.toMatchObject({ code: "NOT_FOUND" });
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
