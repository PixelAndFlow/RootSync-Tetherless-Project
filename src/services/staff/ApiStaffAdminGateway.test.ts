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
};

describe("ApiStaffAdminGateway", () => {
  it("signs in without a token, keeps the returned token private, and uses it for password change", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...staff, must_change_password: false })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);

    await expect(gateway.signIn({ username: "test-admin", password: "temporary-password" })).resolves.toEqual({
      staffId: staff.staff_id, username: "test-admin", displayName: "Test Admin", role: "admin", passwordChangeRequired: true,
    });
    await expect(gateway.changePassword({ currentPassword: "temporary-password", newPassword: "replacement-password" })).resolves.toMatchObject({ passwordChangeRequired: false });

    expect(fetcher.mock.calls[0][0]).toBe("http://localhost:8080/v1/staff/login");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { "content-type": "application/json", accept: "application/json" } });
    expect(fetcher.mock.calls[1][0]).toBe("http://localhost:8080/v1/staff/me/password");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ headers: { authorization: "Bearer session-token" } });
    expect(fetcher.mock.calls[2][0]).toBe("http://localhost:8080/v1/staff/me");
  });

  it("rejects malformed staff responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "session-token", staff: { ...staff, role: "unknown" } })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await expect(gateway.signIn({ username: "test-admin", password: "temporary-password" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("clears the shared staff and trainer data token on sign-out", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    const trainerData = gateway.trainerData();
    await gateway.signIn({ username: "test-admin", password: "temporary-password" });
    gateway.signOut();
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
    await gateway.signIn({ username: "test-admin", password: "temporary-password" });
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
    await gateway.signIn({ username: "test-admin", password: "temporary-password" });
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
    await gateway.signIn({ username: "test-admin", password: "temporary-password" });
    await expect(gateway.listStaffAccounts()).resolves.toMatchObject([{ username: "new-trainer", role: "trainer" }]);
    const reveal = await gateway.createStaffAccount({ role: "trainer", username: " New-Trainer ", displayName: " New Trainer " });
    expect(reveal.temporaryPassword).toHaveLength(16);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ username: "new-trainer", display_name: "New Trainer", temporary_password: reveal.temporaryPassword });
    await expect(gateway.createStaffAccount({ role: "trainer", username: "!", displayName: "Test" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed account lists", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "session-token", staff })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: "invalid" })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await gateway.signIn({ username: "test-admin", password: "temporary-password" });
    await expect(gateway.listStaffAccounts()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
