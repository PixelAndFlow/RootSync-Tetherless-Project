/**
 * Roles and permissions (spec v1.10 §4). The server checks a permission on
 * every staff request, never a role name, so RCO can change who may do what
 * without a code change. Only the Superadmin changes role permissions.
 *
 * "Archive" is the only delete staff have. "data.purge" (Superadmin) is the one
 * permanent delete: unused content, and a learner's data on a privacy request.
 */

export const ROLES = ["superadmin", "admin", "trainer"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

export const PERMISSIONS = [
  "results.view",
  "results.export",
  "cohort.create",
  "cohort.edit",
  "cohort.archive",
  "learner.create",
  "learner.import",
  "learner.edit",
  "learner.archive",
  "learner.setup_code",
  "device.revoke",
  "content.create",
  "content.edit",
  "content.archive",
  "assignment.manage",
  "staff.create_trainer",
  "staff.create_admin",
  "permissions.manage",
  "settings.manage",
  "data.purge",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const isPermission = (v: unknown): v is Permission => typeof v === "string" && (PERMISSIONS as readonly string[]).includes(v);

const SHARED: Permission[] = [
  "results.view",
  "results.export",
  "cohort.create",
  "cohort.edit",
  "cohort.archive",
  "learner.create",
  "learner.import",
  "learner.edit",
  "learner.archive",
  "learner.setup_code",
  "device.revoke",
  "content.create",
  "content.edit",
  "content.archive",
  "assignment.manage",
];

/** Demo Day defaults (spec v1.10 §4). Stored in the database on first start; change them with PUT /v1/staff/roles/:role/permissions. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: [...PERMISSIONS],
  admin: [...SHARED, "staff.create_trainer"],
  trainer: [...SHARED],
};

/** Permission needed to create, disable or enable an account with this role. */
export const permissionToManage = (role: Role): Permission => (role === "trainer" ? "staff.create_trainer" : "staff.create_admin");
