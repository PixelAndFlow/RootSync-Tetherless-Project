import { describe, expect, it, vi } from "vitest";
import { ApiStaffAdminGateway } from "./ApiStaffAdminGateway";
import cohorts from "../../../packages/contract/fixtures/cohorts.json";
import learners from "../../../packages/contract/fixtures/learners.json";
import modules from "../../../packages/contract/fixtures/modules.json";

const staff = {
  staff_id: "5a747438-afcd-4e14-80a2-36fb4d467f6e",
  username: "test-admin",
  display_name: "Test Admin",
  role: "admin",
  must_change_password: true,
  permissions: ["results.view", "staff.create_trainer"],
};

describe("ApiStaffAdminGateway", () => {
  it("signs in without a token, keeps the returned token private, and uses it for password change", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...staff, must_change_password: false })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);

    await expect(gateway.login({ username: "test-admin", password: "temporary-password" })).resolves.toEqual({
      staffId: staff.staff_id, username: "test-admin", displayName: "Test Admin", role: "admin", permissions: staff.permissions, passwordChangeRequired: true,
    });
    await expect(gateway.changePassword({ currentPassword: "temporary-password", newPassword: "replacement-password" })).resolves.toMatchObject({ passwordChangeRequired: false });

    expect(fetcher.mock.calls[0][0]).toBe("http://localhost:8080/v1/staff/login");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { "content-type": "application/json", accept: "application/json" } });
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/me/password");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ headers: { authorization: "Bearer session-token" } });
    expect(fetcher.mock.calls[2][0]).toBe("http://localhost:8080/v1/staff/me");
  });

  it("re-reads the current session with me()", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...staff, must_change_password: false })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });
    await expect(gateway.me()).resolves.toMatchObject({ username: "test-admin", passwordChangeRequired: false });
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/me");
  });

  it("rejects malformed staff responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "session-token", staff: { ...staff, role: "unknown" } })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await expect(gateway.login({ username: "test-admin", password: "temporary-password" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("clears the shared staff and trainer data token on sign-out", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    const trainerData = gateway.trainerData();
    await gateway.login({ username: "test-admin", password: "temporary-password" });
    gateway.logout();
    await expect(gateway.listCohorts()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(trainerData.listLearners({ cohortId: "11111111-1111-4111-8111-111111111111" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reads contract data, creates a student and reveals the returned code", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify(cohorts))).mockResolvedValueOnce(new Response(JSON.stringify(learners)))
      .mockResolvedValueOnce(new Response(JSON.stringify(modules)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ learner: learners.learners[0], setup_code: "ONE-TIME" })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });
    expect(await gateway.listLearnerRecords()).toHaveLength(4);
    expect(fetcher.mock.calls[2][0]).toContain("cohort_id=" + cohorts.cohorts[0].cohort_id);
    expect(await gateway.listModules()).toHaveLength(3);
    expect(await gateway.createLearner({ cohortId: "c", firstName: " First ", lastName: " Last " })).toEqual({ learnerId: learners.learners[0].learner_id, setupCode: "ONE-TIME", shownOnce: true });
    expect(JSON.parse(fetcher.mock.calls[4][1].body)).toEqual({ cohort_id: "c", first_name: "First", last_name: "Last" });
    await expect(gateway.createLearner({ cohortId: "c", firstName: " ", lastName: "Last" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("distinguishes empty cohorts, forbidden requests, malformed data and network failures", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cohorts: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ modules: [{}] })))
      .mockRejectedValueOnce(new TypeError("offline"));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });
    expect(await gateway.listLearnerRecords()).toEqual([]);
    await expect(gateway.listCohorts()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(gateway.listModules()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(gateway.listLearnerRecords({ cohortId: "c" })).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("maps account lists and sends validated account creation to the staff API", async () => {
    const account = { staff_id: "staff-1", username: "new-trainer", display_name: "New Trainer", role: "trainer", disabled: false, created_at: "2026-01-01" };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [account] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ account })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });
    await expect(gateway.listStaff()).resolves.toMatchObject([{ username: "new-trainer", role: "trainer" }]);
    const reveal = await gateway.createStaff({ role: "trainer", username: " New-Trainer ", displayName: " New Trainer " });
    expect(reveal.temporaryPassword).toHaveLength(16);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ username: "new-trainer", display_name: "New Trainer", temporary_password: reveal.temporaryPassword });
    await expect(gateway.createStaff({ role: "trainer", username: "!", displayName: "Test" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("resets a staff account's password with a fresh one-time password, calling the right route", async () => {
    const account = { staff_id: "staff-1", username: "trainer.maria", display_name: "Maria", role: "trainer", disabled: false, created_at: "2026-01-01" };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ account })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });
    const reveal = await gateway.resetStaffAccountPassword("staff-1");
    expect(reveal.temporaryPassword).toHaveLength(16);
    expect(reveal.account).toMatchObject({ username: "trainer.maria", role: "trainer" });
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/accounts/staff-1/reset-password");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ temporary_password: reveal.temporaryPassword });
  });

  it("checks and publishes a module, calling the right routes with the raw module JSON", async () => {
    const draft = { module_id: "new-module", content_version: 1, title: { en: "New Module" }, questions: [] };
    const checkResponse = { valid: true, will_be: "new_module", summary: { module_id: "new-module", module_name: "New Module", content_version: 1, level: null, activity_type: "multiple_choice", question_count: 0 }, errors: [], warnings: [] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify(checkResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ module_id: "new-module", content_version: 1, published_at: "2026-01-01T00:00:00.000Z", warnings: [] })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    const check = await gateway.checkModule(draft);
    expect(check).toMatchObject({ valid: true, willBe: "new_module", summary: { moduleId: "new-module", moduleName: "New Module" } });
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/modules/check");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(draft);

    const published = await gateway.publishModule(draft);
    expect(published).toEqual({ moduleId: "new-module", contentVersion: 1, publishedAt: "2026-01-01T00:00:00.000Z", warnings: [] });
    expect(fetcher.mock.calls[2][0]).toBe("http://localhost:8080/v1/staff/modules");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual(draft);
  });

  it("Chris's PR #35 review, point 4: reads a malformed check summary leniently instead of rejecting a real field-error response", async () => {
    const draft = { module_id: "new-module", content_version: "oops", title: { en: "New Module" }, questions: [] };
    const malformedChecks = [
      { content_version: -1 }, { content_version: 1.5 }, { content_version: "oops" },
      { module_id: 42 }, { level: { en: "beginner" } },
    ].map((bad) => ({
      valid: false, will_be: "blocked",
      summary: { module_id: "new-module", module_name: "New Module", content_version: 1, level: null, activity_type: "multiple_choice", question_count: 0, ...bad },
      errors: [{ field: "content_version", code: "INVALID", message: "content_version must be a whole number of 1 or more." }],
      warnings: [],
    }));
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })));
    for (const body of malformedChecks) fetcher.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    for (let i = 0; i < malformedChecks.length; i++) {
      const check = await gateway.checkModule(draft);
      expect(check.valid).toBe(false);
      expect(check.errors).toEqual([{ field: "content_version", code: "INVALID", message: "content_version must be a whole number of 1 or more." }]);
    }
  });

  it("lists, creates and removes assignments, calling the right routes", async () => {
    const assignment = { assignment_id: "assignment-1", module_id: "security-tools", module_name: "Security Tools", content_version: null, target: "cohort", cohort_id: "cohort-1", learner_id: null, created_at: "2026-01-01T00:00:00.000Z", created_by: "staff-1" };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assignments: [assignment] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assignment }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    const list = await gateway.listAssignments("cohort-1");
    expect(list).toEqual([{ assignmentId: "assignment-1", moduleId: "security-tools", moduleName: "Security Tools", contentVersion: null, target: "cohort", cohortId: "cohort-1", learnerId: null, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "staff-1" }]);
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/assignments?cohort_id=cohort-1");

    const created = await gateway.assign({ moduleId: "security-tools", cohortId: "cohort-1" });
    expect(created.assignmentId).toBe("assignment-1");
    expect(fetcher.mock.calls[2][0]).toBe("http://localhost:8080/v1/staff/assignments");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ module_id: "security-tools", cohort_id: "cohort-1" });
    await expect(gateway.assign({ moduleId: "security-tools" })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await gateway.unassign("assignment-1");
    expect(fetcher.mock.calls[3][0]).toBe("http://localhost:8080/v1/staff/assignments/assignment-1/remove");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("issue #38: creates, renames and archives a cohort with the right verbs and routes", async () => {
    const cohort = { cohort_id: "cohort-1", name: "New Cohort", created_at: "2026-01-01T00:00:00.000Z", created_by: "staff-1", archived: false, learner_count: 0 };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cohort })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cohort: { ...cohort, name: "Renamed" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    expect(await gateway.createCohort("New Cohort")).toMatchObject({ cohortId: "cohort-1", name: "New Cohort" });
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/cohorts");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "POST" });

    expect(await gateway.renameCohort("cohort-1", "Renamed")).toMatchObject({ name: "Renamed" });
    expect(fetcher.mock.calls[2][0]).toBe("http://localhost:8080/v1/staff/cohorts/cohort-1");
    expect(fetcher.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ name: "Renamed" });

    await gateway.archiveCohort("cohort-1");
    expect(fetcher.mock.calls[3][0]).toBe("http://localhost:8080/v1/staff/cohorts/cohort-1/archive");
    await expect(gateway.createCohort(" ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("issue #39: reads, edits, archives, reissues a setup code, switches off a phone and purges a learner", async () => {
    const learner = { learner_id: "learner-1", learner_code: "COHORT-0001", cohort_id: "cohort-1", first_name: "Alex", last_name: "Rivera", username: null, phone: null, email: null, training_level: null, note_1: null, note_2: null, status: "active", created_at: "2026-01-01T00:00:00.000Z", archived_at: null, devices: [{ device_id: "device-1", set_up_at: "2026-01-02T00:00:00.000Z", switched_off_at: null }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify(learner)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...learner, phone: "555-0100" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ setup_code: "NEW-CODE", phones_switched_off: 1 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, events_deleted: 3 })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    const got = await gateway.getLearnerRecord("learner-1");
    expect(got.devices).toEqual([{ deviceId: "device-1", setUpAt: "2026-01-02T00:00:00.000Z", switchedOffAt: null }]);
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/learners/learner-1");

    const updated = await gateway.updateLearner("learner-1", { phone: "555-0100" });
    expect(updated.phone).toBe("555-0100");
    expect(fetcher.mock.calls[2][1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ phone: "555-0100" });

    await gateway.archiveLearner("learner-1");
    expect(fetcher.mock.calls[3][0]).toBe("http://localhost:8080/v1/staff/learners/learner-1/archive");

    const reveal = await gateway.issueSetupCode("learner-1", true);
    expect(reveal).toEqual({ setupCode: "NEW-CODE", phonesSwitchedOff: 1 });
    expect(JSON.parse(fetcher.mock.calls[4][1].body)).toEqual({ switch_off_existing_phones: true });

    await gateway.switchOffPhone("learner-1", "device-1");
    expect(fetcher.mock.calls[5][0]).toBe("http://localhost:8080/v1/staff/learners/learner-1/devices/device-1/switch-off");

    const purged = await gateway.purgeLearner("learner-1", "COHORT-0001");
    expect(purged).toEqual({ eventsDeleted: 3 });
    expect(JSON.parse(fetcher.mock.calls[6][1].body)).toEqual({ confirm: "COHORT-0001" });
    expect(fetcher.mock.calls[6][0]).toBe("http://localhost:8080/v1/staff/learners/learner-1/purge");

    await expect(gateway.getLearnerRecord(" ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(gateway.purgeLearner("learner-1", " ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("issue #40: reads a module version, archives, and purges with DELETE", async () => {
    const moduleBody = { schema_version: "tetherless.module.v1", module_id: "m1", content_version: 1, title: { en: "M1" }, questions: [] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify(moduleBody)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    expect(await gateway.getModuleVersion("m1", 1)).toEqual(moduleBody);
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/modules/m1/versions/1");

    await gateway.archiveModule("m1");
    expect(fetcher.mock.calls[2][0]).toBe("http://localhost:8080/v1/staff/modules/m1/archive");

    await gateway.purgeModule("m1");
    expect(fetcher.mock.calls[3][0]).toBe("http://localhost:8080/v1/staff/modules/m1");
    expect(fetcher.mock.calls[3][1]).toMatchObject({ method: "DELETE" });
    await expect(gateway.getModuleVersion(" ", 1)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("issue #41: disables and re-enables a staff account with the right routes", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    await gateway.setStaffDisabled("staff-1", true);
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/accounts/staff-1/disable");
    await gateway.setStaffDisabled("staff-1", false);
    expect(fetcher.mock.calls[2][0]).toBe("http://localhost:8080/v1/staff/accounts/staff-1/enable");
    await expect(gateway.setStaffDisabled(" ", true)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("issue #41: reads and writes role permissions with the right verbs and routes", async () => {
    const rolesResponse = { roles: { superadmin: ["permissions.manage", "settings.manage"], admin: ["results.view"], trainer: ["results.view"] }, permissions: ["results.view", "permissions.manage", "settings.manage"] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify(rolesResponse)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    const got = await gateway.getRolePermissions();
    expect(got).toEqual(rolesResponse);
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/roles");

    await gateway.setRolePermissions("trainer", ["results.view", "results.export"]);
    expect(fetcher.mock.calls[2][0]).toBe("http://localhost:8080/v1/staff/roles/trainer/permissions");
    expect(fetcher.mock.calls[2][1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ permissions: ["results.view", "results.export"] });
  });

  it("issue #41: reads and writes score thresholds with the right verb and route", async () => {
    const thresholds = { pass_pct: 70, struggling_pct: 50, weak_topic_pct: 60, weak_topic_min_answers: 2 };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify(thresholds)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...thresholds, pass_pct: 75 })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    expect(await gateway.getThresholds()).toEqual({ passPct: 70, strugglingPct: 50, weakTopicPct: 60, weakTopicMinAnswers: 2 });
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/settings/thresholds");

    const updated = await gateway.setThresholds({ passPct: 75, strugglingPct: 50, weakTopicPct: 60, weakTopicMinAnswers: 2 });
    expect(updated.passPct).toBe(75);
    expect(fetcher.mock.calls[2][1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ ...thresholds, pass_pct: 75 });
  });

  it("issue #41: exports a cohort as a Blob with a GET, rejecting an empty cohort ID", async () => {
    const exportBody = { export_version: 2, cohort: { cohort_id: "cohort-1" }, learners: [] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify(exportBody), { headers: { "content-disposition": 'attachment; filename="export.json"' } }));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });

    const blob = await gateway.exportCohort("cohort-1");
    expect(blob).toBeInstanceOf(Blob);
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    expect(JSON.parse(text)).toEqual(exportBody);
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/cohorts/cohort-1/export");
    await expect(gateway.exportCohort(" ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects malformed account lists", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: "invalid" })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.login({ username: "test-admin", password: "temporary-password" });
    await expect(gateway.listStaff()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
