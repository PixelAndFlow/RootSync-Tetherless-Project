export const MOCK_FRONTEND_SCENARIOS = [
  "setup_code_used",
  "student_archived",
  "device_switched_off",
  "blocked_auth",
  "no_assigned_modules",
  "permission_denied",
  "upload_invalid",
] as const;

export type MockFrontendScenario = typeof MOCK_FRONTEND_SCENARIOS[number];

export const mockScenarioCopy: Record<MockFrontendScenario, { title: string; detail: string }> = {
  setup_code_used: { title: "Setup code already used", detail: "The Student should receive a clear request to contact their Trainer for a new code." },
  student_archived: { title: "Student archived", detail: "Student access is removed. Existing local work needs the agreed archive/recovery policy." },
  device_switched_off: { title: "Device switched off", detail: "Keep local work and present blocked authentication guidance rather than silently retrying." },
  blocked_auth: { title: "Sync blocked", detail: "Saved work remains local and the Student is directed to contact a Trainer." },
  no_assigned_modules: { title: "No assigned missions", detail: "The Student sees an empty state instead of an empty mission list." },
  permission_denied: { title: "Access limited", detail: "A staff role sees an explanation and a safe route back, not a broken page." },
  upload_invalid: { title: "Module needs correction", detail: "The content flow displays validation issues before a module can be published." },
};
