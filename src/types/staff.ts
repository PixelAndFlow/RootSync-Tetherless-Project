// Cohorts, learners and modules use the contract's own types directly —
// no second, frontend-only set of names for the same data (Tetherless_
// Contract_Drift_and_Naming_Proposal_v1.00_2026-10-25.md §2.2). Screens
// still say "Student"; that's display text, not a code name.
export type { Cohort, LearnerRecord, LearnerStatus, ModuleListing } from "../../packages/contract/src/staff-api";

export const STAFF_ROLES = ["superadmin", "admin", "trainer"] as const;
export type StaffRole = typeof STAFF_ROLES[number];

export interface StaffSession {
  staffId: string;
  username: string;
  displayName: string;
  role: StaffRole;
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

/** Demo Day defaults (spec v1.10 §4): which roles a signed-in role may create. Server-enforced; this is UX only. */
export function creatableRoles(signedInRole: StaffRole): StaffRole[] {
  if (signedInRole === "superadmin") return ["trainer", "admin", "superadmin"];
  if (signedInRole === "admin") return ["trainer"];
  return [];
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
