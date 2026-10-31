import { describe, expect, it } from "vitest";
import { creatableRoles, DEFAULT_ROLE_PERMISSIONS, permissionToManage, STAFF_PERMISSIONS } from "./staff";

describe("staff permission model", () => {
  it("gives a superadmin every permission", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.superadmin).toEqual(STAFF_PERMISSIONS);
  });

  it("withholds staff and system management from a trainer", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.trainer).not.toContain("staff.create_trainer");
    expect(DEFAULT_ROLE_PERMISSIONS.trainer).not.toContain("staff.create_admin");
    expect(DEFAULT_ROLE_PERMISSIONS.trainer).not.toContain("settings.manage");
  });

  it("lets an admin create trainers but not admins, superadmins or system settings", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain("staff.create_trainer");
    expect(DEFAULT_ROLE_PERMISSIONS.admin).not.toContain("staff.create_admin");
    expect(DEFAULT_ROLE_PERMISSIONS.admin).not.toContain("settings.manage");
  });

  it("requires staff.create_trainer to manage a trainer account and staff.create_admin otherwise", () => {
    expect(permissionToManage("trainer")).toBe("staff.create_trainer");
    expect(permissionToManage("admin")).toBe("staff.create_admin");
    expect(permissionToManage("superadmin")).toBe("staff.create_admin");
  });

  it("creatableRoles reflects exactly the roles a permission set can manage, least-privileged first", () => {
    expect(creatableRoles([])).toEqual([]);
    expect(creatableRoles(["staff.create_trainer"])).toEqual(["trainer"]);
    expect(creatableRoles(["staff.create_admin"])).toEqual(["admin", "superadmin"]);
    expect(creatableRoles(DEFAULT_ROLE_PERMISSIONS.superadmin)).toEqual(["trainer", "admin", "superadmin"]);
  });
});
