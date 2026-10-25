import { describe, expect, it, vi } from "vitest";
import { ApiStaffAdminGateway } from "./ApiStaffAdminGateway";

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

  it("rejects malformed staff responses and leaves mutations disabled", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "session-token", staff: { ...staff, role: "unknown" } })));
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", fetcher);
    await expect(gateway.signIn({ username: "test-admin", password: "temporary-password" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(gateway.createLearner({ cohortId: "cohort", firstName: "Test", lastName: "Student" })).rejects.toMatchObject({ code: "NOT_IMPLEMENTED", status: 501 });
  });

  it("leaves cohorts, learner records and modules unimplemented rather than returning an empty list", async () => {
    const gateway = new ApiStaffAdminGateway("http://localhost:8080", vi.fn());
    await expect(gateway.listCohorts()).rejects.toMatchObject({ code: "NOT_IMPLEMENTED", status: 501 });
    await expect(gateway.listLearnerRecords()).rejects.toMatchObject({ code: "NOT_IMPLEMENTED", status: 501 });
    await expect(gateway.listModules()).rejects.toMatchObject({ code: "NOT_IMPLEMENTED", status: 501 });
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
