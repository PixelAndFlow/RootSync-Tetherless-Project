/**
 * The 35 method names `StaffAdminGateway` lists under spec v1.30 §10
 * (`Tetherless_API_Spec_v1.30_2026-10-21.md`, in the sibling
 * RootSync-Tetherless-Project-Docs repo — not checked out in this repo's CI,
 * so the list is vendored here rather than read from that file at test time).
 *
 * Update this list BY HAND whenever a new spec version changes §10's method
 * names (never by editing the locked v1.30 file itself). StaffAdminGateway.conformance.test.ts
 * checks every name here is a real method, and flags any gateway method not on this
 * list (unless allowlisted there) — exactly the check that would have caught
 * issue #10's naming drift before it shipped.
 */
export const SPEC_SECTION_10_METHODS = [
  // session
  "login", "logout", "me", "changePassword",
  // cohorts
  "listCohorts", "createCohort", "renameCohort", "archiveCohort",
  // learners
  "listLearnerRecords", "getLearnerRecord", "createLearner", "updateLearner", "archiveLearner",
  "issueSetupCode", "switchOffPhone", "purgeLearner", "checkRoster", "commitRoster",
  // content
  "checkModule", "publishModule", "listModules", "getModuleVersion", "archiveModule", "purgeModule",
  // assignments
  "listAssignments", "assign", "unassign",
  // export, staff, permissions, settings
  "exportCohort", "listStaff", "createStaff", "setStaffDisabled",
  "getRolePermissions", "setRolePermissions", "getThresholds", "setThresholds",
] as const;
