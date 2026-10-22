# Frontend Build Status

**Checked:** October 22, 2026 (America/New_York)

## Overall status: Passing — integration preparation complete

| Check | Result |
| --- | --- |
| Production build (`npm run build`) | Passed |
| Bundle-size guardrail (`npm run check:bundle`) | Passed |
| Performance budget (`npm run check:performance`) | Passed |
| Local content validation (`npm run validate:content`) | Passed |
| Shared backend-validator check (`npm run check:shared-content`) | Passed — all local fixtures validate against the pinned server validator |
| Spanish Assist coverage (`npm run report:spanish-coverage`) | Passed — 99/99 (100%) |
| Automated tests (`npm test`) | Passed — 80 assertions across 19 files |
| Mobile-browser suite (`npm run test:device`) | Passed — 86 checks passed, 4 intentional skips |
| Android emulator readiness (`npm run check:android-emulator`) | Not available on this computer; Android SDK is not installed |

## Build output

- JavaScript bundle: **414.55 kB** (126.42 kB gzip)
- CSS bundle: **48.40 kB** (9.02 kB gzip)
- Total production bundle: **565.7 KB**
- Bundle guardrail: **1,024 KB**

## Test results

- Test files: **19 passed**
- Tests: **80 passed**
- Browser checks: **86 passed**, with **4** full-record duplicates intentionally skipped

## Recent UI/UX baseline

- VS Code-style neutral black/gray surfaces use RCO purple (`#5A1EE4`) and magenta (`#C143C0`) for meaningful accents.
- Learners explicitly choose Dark mode or Light mode; both themes are persisted per browser/device and are covered by mobile accessibility checks.
- Mission-map and in-mission sector checkpoints share the same RCO-purple line icons.
- Only `kahoot_cards` questions use the four colourful answer cards. Their colours remain after feedback, with written feedback and non-colour correct/incorrect indicators.
- Trainer data and access remain local fixture/demo behaviour until backend authentication and authorization are integrated.
- The learner setup code/username, learner settings, API error presentation, and sync-authorisation states are safe frontend/demo preparation. They do not store credentials or call a live API yet.
- The live API client and Trainer reports adapter are isolated and opt-in; `GatewayProvider` continues to use the mock gateway. See `docs/FRONTEND_INTEGRATION_BOUNDARY.md` and `docs/FRONTEND_INTEGRATION_STATUS.md`.

## Current baseline

- Current working branch: `chris-frontend-integration`
- Baseline commit before this integration-preparation change set: `25158c0`
- This change set is intentionally uncommitted while final validation completes.

- Git HEAD before this change set: `25158c0` — Merge project `chris` branch into frontend history
- Production output folder: `dist/`

## Run again

In PowerShell, from this project folder:

```powershell
npm.cmd run build
npm.cmd run check:bundle
npm.cmd run check:performance
npm.cmd run check:shared-content
npm.cmd test
npm.cmd run test:device
```

`npm.cmd` is used because this computer's PowerShell execution policy blocks `npm.ps1`.
