# Tetherless Frontend Mock Demo Walkthrough

This guide is for UI review only. The screens use synthetic fixtures and do not create server records, upload files, archive Students, or persist staff credentials.

## 1. Student journey

1. Open `/#/learner`.
2. Enter setup code `DEMO-2026` and any valid username.
3. Open Missions, profile/settings, and sync status.
4. To view an empty-assignment experience, open `/#/learner/missions?scenario=no-assigned-modules`.

## 2. Staff roles

Open `/#/staff/sign-in`. Password for all mock accounts: `demo-password-123`.

| Username | Role | Demonstrates |
| --- | --- | --- |
| `demo` | SuperAdmin | Staff-account and system-control routes, cohorts, Students, content workflow. |
| `admin` | Admin | Forced password-change route, daily operations, staff-account scope. |
| `trainer` | Trainer | Assigned-cohort Student work, setup-code layout, content workflow; protected staff/system routes show an access explanation. |

## 3. Student and setup-code operations

1. From Staff home, open **Cohorts and Students**.
2. Create a mock Student to reveal a synthetic one-time setup code.
3. Try the copy button. Print/download are deliberately presentation placeholders until server-backed handout rules are connected.
4. Select **Archive Student**. The confirmation explains unsynced-work risk; confirming only displays mock feedback and performs no archive operation.

## 4. Content workflow

1. From Program operations, select **Preview upload workflow**.
2. Review the intended select → validate → preview → publish → assign sequence.
3. Open `/#/staff/content?scenario=upload-invalid` to review how validation issues will appear.

## 5. Boundaries before integration

- Marc’s backend remains authoritative for authentication, roles, staff actions, content validation/publishing, assignments, and reporting.
- Naquan’s DDIL layer remains authoritative for Student setup, local durability, offline module storage, outbox/sync behavior, and recovery state.
- The frontend currently presents those contracts using mock data. Do not use mock credentials or codes outside local review.
