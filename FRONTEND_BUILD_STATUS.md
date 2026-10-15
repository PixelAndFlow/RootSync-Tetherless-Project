# Frontend Build Status

**Checked:** October 15, 2026 (America/New_York)

## Overall status: Passing

| Check | Result |
| --- | --- |
| Production build (`npm run build`) | Passed |
| Bundle-size guardrail (`npm run check:bundle`) | Passed |
| Performance budget (`npm run check:performance`) | Passed |
| Content validation (`npm run validate:content`) | Passed |
| Spanish Assist coverage (`npm run report:spanish-coverage`) | Passed — 99/99 (100%) |
| Automated tests (`npm test`) | Passed |
| Mobile-browser suite (`npm run test:device`) | Passed — 66 checks passed, 4 intentional skips |
| Android emulator readiness (`npm run check:android-emulator`) | Not available on this computer; Android SDK is not installed |

## Build output

- JavaScript bundle: **404.39 kB** (123.40 kB gzip)
- CSS bundle: **46.32 kB** (8.47 kB gzip)
- Total production bundle: **553.7 KB**
- Bundle guardrail: **1,024 KB**

## Test results

- Test files: **13 passed**
- Tests: **41 passed**
- Browser checks: **66 passed**, with **4** full-record duplicates intentionally skipped

## Recent UI/UX baseline

- VS Code-style neutral black/gray surfaces use RCO purple (`#5A1EE4`) and magenta (`#C143C0`) for meaningful accents.
- Learners explicitly choose Dark mode or Light mode; both themes are persisted per browser/device and are covered by mobile accessibility checks.
- Mission-map and in-mission sector checkpoints share the same RCO-purple line icons.
- Only `kahoot_cards` questions use the four colourful answer cards. Their colours remain after feedback, with written feedback and non-colour correct/incorrect indicators.
- Trainer data and access remain local fixture/demo behaviour until backend authentication and authorization are integrated.

## Current baseline

- Latest commit: `4429d02` — Add gateway-aware save feedback and ownership contract
- Production output folder: `dist/`

## Run again

In PowerShell, from this project folder:

```powershell
npm.cmd run build
npm.cmd run check:bundle
npm.cmd run check:performance
npm.cmd test
npm.cmd run test:device
```

`npm.cmd` is used because this computer's PowerShell execution policy blocks `npm.ps1`.
