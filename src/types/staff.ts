// Cohorts, learners and modules: camelCase app types, mapped from the contract's
// snake_case wire types (packages/contract/src/staff-api.ts) by the API adapter
// (src/services/staff/staffMappers.ts). Screens never see wire names. The words are
// the same in both forms (learner_count is learnerCount), so one search finds either.
// Screens still say "Student"; that's display text, not a code name.
//
// NOTE: this rule (translate at the boundary; each part uses its language's standard)
// was decided by Marc on 2026-10-27, before the team meeting, and is being relayed to
// Chris there. It reverses the "use the contract types directly in the app" step that
// PR #4 took for these three types (Contract Drift and Naming Proposal, question 3).
// The decision is recorded in the docs repo (decisions log, 2026-10-27) and in API
// Spec v1.30 section 2. Chris and Naquan can revisit it at the meeting.
import type { LearnerStatus } from "../../packages/contract/src/staff-api";

export type { LearnerStatus };

export interface Cohort {
  cohortId: string;
  name: string;
  /** Sent on list, create and report responses; always 0 right after create. */
  learnerCount?: number;
  createdAt: string;
  createdBy: string | null;
  archived: boolean;
}

export interface LearnerRecord {
  learnerId: string;
  learnerCode: string;
  cohortId: string;
  /** Sent on GET .../learners/:id and the export; not on the list. */
  cohortName?: string;
  firstName: string;
  lastName: string;
  /** Chosen by the learner at setup; null until then. Not unique. */
  username: string | null;
  phone: string | null;
  email: string | null;
  trainingLevel: string | null;
  note1: string | null;
  note2: string | null;
  status: LearnerStatus;
  createdAt: string;
  archivedAt: string | null;
  /** Sent on the list. */
  lastSyncedAt?: string | null;
}

/** No draft/published distinction: "published" means a version exists; archived is separate. */
export interface ModuleListing {
  moduleId: string;
  moduleName: string;
  /** Localized, not a plain string. Null only if no version has ever been published. */
  title: { en: string; es?: string } | null;
  level: string | null;
  note: string | null;
  activityType: string;
  latestVersion: number | null;
  versions: number[];
  questionCount: number;
  used: boolean;
  archived: boolean;
  createdBy: string | null;
  createdAt: string;
}

export const STAFF_ROLES = ["superadmin", "admin", "trainer"] as const;
export type StaffRole = typeof STAFF_ROLES[number];

/**
 * Mirrors packages/server/src/permissions.ts PERMISSIONS/DEFAULT_ROLE_PERMISSIONS.
 * Duplicated rather than imported (server code is not in the frontend's build),
 * same pattern as STAFF_ROLES above and the contract wire types. The server
 * checks one of these on every request; the UI should decide what to show the
 * same way, from the signed-in staff member's own `permissions` (sign-in and
 * GET /v1/staff/me both send it), not from `role` (issue #10).
 */
export const STAFF_PERMISSIONS = [
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
export type StaffPermissionKey = typeof STAFF_PERMISSIONS[number];

const SHARED_PERMISSIONS: StaffPermissionKey[] = [
  "results.view", "results.export", "cohort.create", "cohort.edit", "cohort.archive",
  "learner.create", "learner.import", "learner.edit", "learner.archive", "learner.setup_code",
  "device.revoke", "content.create", "content.edit", "content.archive", "assignment.manage",
];

/** Mock-mode-only: the server computes this for real sessions. Mirrors the server's Demo Day defaults. */
export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, StaffPermissionKey[]> = {
  superadmin: [...STAFF_PERMISSIONS],
  admin: [...SHARED_PERMISSIONS, "staff.create_trainer"],
  trainer: [...SHARED_PERMISSIONS],
};

/** Permission needed to create, disable or enable an account with this role. Mirrors permissionToManage on the server. */
export function permissionToManage(role: StaffRole): StaffPermissionKey {
  return role === "trainer" ? "staff.create_trainer" : "staff.create_admin";
}

export interface StaffSession {
  staffId: string;
  username: string;
  displayName: string;
  role: StaffRole;
  /** From the server (sign-in and GET /v1/staff/me); decide access by this, not by `role`. */
  permissions: StaffPermissionKey[];
  passwordChangeRequired: boolean;
}

export interface SetupCodeReveal {
  learnerId: string;
  setupCode: string;
  shownOnce: true;
}

export interface StaffAccountSummary {
  staffId: string;
  username: string;
  displayName: string;
  role: StaffRole;
  disabled: boolean;
  createdAt: string;
}

export interface StaffAccountReveal {
  account: StaffAccountSummary;
  temporaryPassword: string;
  shownOnce: true;
}

/** Which roles the signed-in staff member may create, from their own permissions (server-enforced; this is UX only). Least-privileged first, matching the form's previous default. */
export function creatableRoles(permissions: StaffPermissionKey[]): StaffRole[] {
  return (["trainer", "admin", "superadmin"] as const).filter((role) => permissions.includes(permissionToManage(role)));
}

export interface StaffPermission {
  label: string;
  description: string;
}

export const STAFF_PERMISSION_SUMMARY: Record<StaffRole, StaffPermission[]> = {
  superadmin: [
    { label: "Staff accounts", description: "Create and manage Admin and Trainer accounts." },
    { label: "System control", description: "Manage roles, thresholds, settings, archive and purge actions." },
    { label: "Program operations", description: "Manage all cohorts, Students, content, assignments, reports and devices." },
  ],
  admin: [
    { label: "Program operations", description: "Manage Trainers, cohorts, Students, setup codes, devices, content and assignments." },
    { label: "Reporting", description: "View and export program reports." },
    { label: "Restricted controls", description: "Cannot create SuperAdmins or change global permissions, thresholds or purge settings." },
  ],
  trainer: [
    { label: "Assigned cohorts", description: "Manage assigned Students, setup codes, device support, and archive actions with confirmation." },
    { label: "Learning delivery", description: "Upload and edit permitted modules, then manage assignments." },
    { label: "Reporting", description: "View and export assigned Students’ results." },
  ],
};

export function roleLabel(role: StaffRole): string {
  return role === "superadmin" ? "SuperAdmin" : role[0].toUpperCase() + role.slice(1);
}
