export const STAFF_ROLES = ["superadmin", "admin", "trainer"] as const;
export type StaffRole = typeof STAFF_ROLES[number];

export interface StaffSession {
  staffId: string;
  username: string;
  displayName: string;
  role: StaffRole;
  passwordChangeRequired: boolean;
}

export interface StaffCohort {
  id: string;
  name: string;
  studentCount: number;
}

export interface StaffStudent {
  id: string;
  displayName: string;
  username?: string;
  cohortId: string;
  status: "active" | "archived";
}

export interface SetupCodeReveal {
  studentId: string;
  setupCode: string;
  shownOnce: true;
}

export interface StaffModule {
  id: string;
  title: string;
  contentVersion: number;
  status: "draft" | "published";
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
