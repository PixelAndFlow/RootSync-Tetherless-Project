# RootSync Tetherless

Frontend prototype for the Raices Cyber Organization (RCO) Tetherless capstone project. Tetherless is a mobile-first cybersecurity learning experience designed for disconnected, disrupted, intermittent, and limited-connectivity conditions.

## Current status

The learner and trainer frontend is working locally with typed mock adapters and de-identified fixture data. It is ready for visual review, content iteration, frontend testing, and later replacement of the mock adapters by the agreed DDIL and backend implementations.

This is **not yet a production offline app**. Service-worker caching, IndexedDB/Dexie persistence, outbox mechanics, authentication, real API calls, and server reporting are intentionally deferred until the team agrees the contracts.

## What is built

### Learner experience

- learner profile setup with local browser storage;
- JSON-driven `Operation Cyber Squad` beginner mission with 15 questions;
- mission library and mission briefing;
- immediate answer feedback, Spanish Assist, progress, flagged questions, question navigation, and mobile touch targets;
- mockup-aligned color-coded answer cards, with clear selected, correct, and incorrect states;
- first-attempt score preservation, remediation, current mastery, full retry, and review flows;
- engagement-only XP, streaks, sector checkpoints, Cyber Shield, and mission badge;
- clear offline, pending, syncing, synced, retryable-error, and rejected status UI;
- route fallback/error states for broken or unavailable links;
- keyboard focus moves to answer feedback after selection and to the next question after navigation;
- optional high-contrast and reduced-motion preferences that persist only on the current browser/device.
- answer selection and feedback state exposed to assistive technology through accessible labels and live feedback.
- a development-only “Reset local demo” control that clears the local learner profile without appearing in production builds.

### Trainer experience

- de-identified learner fixture dashboard;
- completion filter, learner search, sorting, result count, and narrow-screen table containment;
- learner detail view with score, mastery, attempt/remediation signals, sync state, topic performance, and sector performance;
- accessible performance bars for screen-reader users.

### Quality and mobile readiness

- reusable loading, empty, and error states;
- visible focus treatment, skip-to-content link, live status announcements, and automated WCAG checks;
- visual regression snapshots for five RCO representative mobile viewport profiles;
- Windows GitHub Actions quality checks for content, translation coverage, tests, bundle size, and mobile browser regressions;
- failure artifacts in GitHub Actions plus a manual workflow-dispatch option to capture candidate visual baselines for human approval;
- a production bundle-size guardrail; the current bundle is approximately 553 KB, below the temporary 1 MB guardrail;
- PWA metadata, app icon, theme metadata, and browser-storage messaging.

## Important architecture boundary

React screens do not access an API, IndexedDB, Dexie, service worker, or database directly.

```text
UI screens and providers
        |
typed gateway hooks
        |
GatewayProvider
        |
mock adapters today / agreed DDIL and API adapters later
```

The currently injected adapters are:

- `OfflineLearningGateway` for learning attempts, answers, mastery, and sync status;
- `TrainerDataGateway` for trainer summaries and learner detail.

When Naquan's DDIL adapter and Marc's backend adapter are ready, replace the adapters supplied at `GatewayProvider`. Do not scatter API route strings, storage calls, or database code through UI components. See [the integration boundary](docs/FRONTEND_INTEGRATION_BOUNDARY.md).

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The application uses hash routing, so learner setup is available at `/#/learner`.

## Validation commands

| Command | Purpose |
| --- | --- |
| `npm run test` | Unit and regression tests. |
| `npm run validate:content` | Validates the JSON learning fixture and content rules. |
| `npm run report:spanish-coverage` | Reports Spanish Assist translation coverage without blocking English-first drafts. |
| `npm run build` | Type-checks and creates a production build. |
| `npm run check:bundle` | Checks the built asset size against the 1 MB temporary guardrail. Run after a build. |
| `npm run check:performance` | Builds the app and checks gzip JavaScript/CSS budgets for mobile performance regressions. |
| `npm run test:device` | Builds the app, checks bundle size, and runs Playwright mobile-browser tests. |
| `npm run check:android-emulator` | Reports whether Android Studio's SDK, Emulator, and target AVDs are ready on this computer. |

At the current project state, the suite includes 37 unit/regression tests (including 9 content-focused checks) and 65 mobile-browser checks. The complete learner-record workflow runs on the minimum Android profile; its four duplicate profile runs are intentionally skipped while the core checks run on every profile. The published mission's Spanish Assist copy is currently 99/99 (100%) translated.

## Device and browser coverage

The automated browser suite checks these RCO representative profiles:

- Android 10 / Nokia 2.4 class / 360 x 800 viewport;
- Android 11 Go / Nokia C21 Plus class / 360 x 720 viewport;
- Android 12 / Moto e22 class / 360 x 800 viewport;
- iPhone 8-sized viewport / 375 x 667;
- iPhone SE 2-sized viewport / 375 x 667.

It verifies learner flow, touch targets, focus behavior, offline-state messaging, trainer layout, sorting/filtering, broken-route recovery, invalid-mission protection, visual snapshots, display preferences, PWA metadata, and selected WCAG rules. One protected full-flow regression test also verifies first-score preservation through remediation, review, and full retry.

These are Chromium viewport/touch simulations, not real Android or iOS certification. They do **not** prove Safari/WebKit behavior, actual 2 GB RAM performance, device storage eviction, installed-PWA restart behavior, or multi-day offline persistence. Those require Android Emulator/Xcode where available and final real-device or device-cloud testing after the DDIL layer exists.

Android Studio and the Android SDK are intentionally **not installed on this computer**. `npm run check:android-emulator` is a non-invasive readiness check for a future approved testing computer; it only reports whether the SDK, Emulator, Platform Tools, and named AVDs are available.

## Content workflow

The current module fixture is in:

```text
src/content/fixtures/operation-cyber-squad.json
```

Before changing or adding a module, run:

```bash
npm run validate:content
```

The validator checks stable IDs, question count, score range, English learner copy, choices, correct answers, and sector references. Start new modules from the validated template at `src/content/templates/tetherless-module.template.json`. See the [content authoring guide](docs/CONTENT_AUTHORING_GUIDE.md) for the full workflow.

`npm run report:spanish-coverage` reports translation completeness without blocking an English-first draft. `src/content/fixtures/secure-workspace-basics.preview.json` is a valid bilingual UI/content preview fixture, but is intentionally excluded from `moduleLibrary` and therefore cannot appear in the learner experience until content owners approve it.

## Project layout

```text
src/
  app/                 App shell, routes, providers, gateway injection
  components/          Shared learner, trainer, gamification, and UI components
  content/             Typed module fixture and validation
  features/            Learner, trainer, sync, and system screens
  services/            Typed gateway interfaces and temporary mock adapters
  types/               Content, learning, and trainer contracts
  utils/               UI-safe gamification helpers
e2e/                   Playwright mobile, accessibility, and visual tests
.github/workflows/     Windows quality and visual-baseline review automation
public/                Brand assets, manifest, and PWA icon
docs/                  Handoff, integration, content, and design references
```

## Privacy and source-material rules

- `docs/rco-source-private/` stays local and is ignored by Git.
- Do not add raw RCO documents, rosters, learner data, secrets, or `.env` files to browser assets or commits.
- Trainer fixture data is de-identified and only for frontend development.
- UI code should display learner-friendly sync information, never raw event IDs, backend internals, or device implementation details.

## Deferred until team integration

- service worker and offline app-shell caching;
- IndexedDB/Dexie schema and persistent event outbox;
- API routes, authentication, authorization, server-side reporting, and assignment rules;
- sync acknowledgement/rejection contracts and duplicate-event handling against the real backend;
- real-device DDIL, low-storage, and multi-day offline validation.

## Useful references

- [Frontend handoff](docs/CODEX_FRONTEND_HANDOFF.md)
- [Build reference](docs/App_Build_Complete_Reference.md)
- [Integration boundary](docs/FRONTEND_INTEGRATION_BOUNDARY.md)
- [Frontend integration checklist](docs/FRONTEND_INTEGRATION_CHECKLIST.md)
- [Content authoring guide](docs/CONTENT_AUTHORING_GUIDE.md)
- [Device emulator and real-device test plan](docs/DEVICE_EMULATOR_AND_REAL_DEVICE_TEST_PLAN.md)
- [Frontend component catalog](docs/FRONTEND_COMPONENT_CATALOG.md)
- [Frontend mock scenarios](docs/FRONTEND_MOCK_SCENARIOS.md)
- [UX mockup comparison](docs/UX_MOCKUP_COMPARISON.md)
