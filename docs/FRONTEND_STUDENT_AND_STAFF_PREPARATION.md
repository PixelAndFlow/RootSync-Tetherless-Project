# Frontend Student and Staff Preparation

## Purpose

This document records frontend work that can proceed before the production DDIL and API adapters are installed. It does not change the team-owned API contract.

## Terminology

- **Student** is the required user-facing term in all frontend labels, messages, reports, and accessibility copy.
- Existing technical identifiers such as `learner_id`, `learnerCode`, `listLearners`, and existing `/learner` routes remain compatibility details until the shared contract is renamed, if ever.

## Mock-backed staff routes

| Route | Purpose | Current mode |
| --- | --- | --- |
| `/#/staff/sign-in` | SuperAdmin, Admin, and Trainer sign-in | Mock only |
| `/#/staff/change-password` | Required password-change flow | Mock only |
| `/#/staff` | Role-aware staff landing page | Mock only |
| `/#/staff/operations` | Cohorts, Students, one-time setup-code reveal, content and reserved controls | Mock only |

Demo credentials are intentionally present only for visual testing: `demo`, `admin`, or `trainer` with `demo-password-123`. They must never be used outside this local mock.

## Proposed Demo Day permissions

| Role | Frontend scope |
| --- | --- |
| SuperAdmin | Full operations, staff accounts, system controls, cohorts, Students, content, assignments, reports, devices, roles, thresholds, settings, archive/purge controls. |
| Admin | Daily operations and Trainer management; no SuperAdmin creation, global permissions, thresholds, or purge controls. |
| Trainer | Assigned cohorts and Students, setup codes, device support, archive action with confirmation, upload/edit permitted modules, assignments, results/export. |
| Student | One-time device setup, assigned modules, own work/settings, Spanish support, and sync status. |

These are frontend defaults based on the Thursday RCO discussion and await team confirmation. Server-side authorization remains authoritative.

## Integration readiness

- `OfflineLearningGateway` now documents optional future capabilities: device setup, Student profile, assigned modules, offline preparation/cache retrieval, and attempt abandonment.
- `StartAttemptInput` accepts an optional numeric `contentVersion` for the DDIL handoff.
- The existing `GatewayProvider` remains the only adapter swap point.
- `StaffAdminGateway` is a new mock boundary. A real adapter should be installed only after Marc confirms staff authentication, API endpoints, and token-storage rules.

## Still required before a real end-to-end run

1. Naquan publishes the expanded browser-safe `DdilLearningGateway` methods and `blocked_auth` behavior.
2. Marc confirms the v1.30/e2ceb7e server baseline, device-migration error behavior, and hosted/Postgres test endpoint.
3. The frontend replaces the mock gateway at `GatewayProvider` and runs the Student flow through the real React screens.
4. The team runs local Postgres, hosted HTTPS, Android, and iPhone installed-PWA verification.

## Current mock workflow coverage

- Staff sign-in, forced password change, SuperAdmin/Admin/Trainer role-aware navigation, direct-route access notices, and responsive staff screen layouts.
- Student roster, one-time setup-code copy layout, print/download handout placeholders, destructive archive confirmation, and safe post-confirmation feedback without a server mutation.
- Module upload/edit workflow preview: file selection, validation result, preview, publish, and cohort assignment stages. Use `/#/staff/content?scenario=upload-invalid` to view a validation-error state.
- Student no-assignment empty state at `/#/learner/missions?scenario=no-assigned-modules`.
- Named fixtures for setup-code-used, archived Student, switched-off device, blocked authentication, no assigned modules, permission denied, and invalid upload. These are UI/test fixtures, not server behavior.

## Runtime configuration preparation

`readFrontendRuntimeConfig()` supports a future `VITE_TETHERLESS_API_BASE_URL`. It defaults to mock mode and accepts only HTTPS outside localhost. It does not enable a real adapter or store credentials.

## Verification completed for this frontend preparation

- TypeScript production build.
- Focused mock staff-gateway tests.
- Existing setup/settings regression coverage.

