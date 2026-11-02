# Tetherless (RootSync-Tetherless-Project)

A resilient, offline-first Progressive Web Application (PWA) that
trains cyberathletes in critical thinking, rapid information
retrieval, and vocabulary affirmation — built to function entirely
in zero-connectivity (DDIL) environments, syncing performance data
and AI-driven analytics once reconnected.

Built for **RAICES Cyber Organization Inc. (RCO)** via
[Pursuit.org](https://www.pursuit.org)'s Builder program, as a
7-week MVP for Pursuit Demo Day (2026-11-06).

## Status

Live. The frontend and backend described below are both built and
deployed, not a prototype — see [Deployment](#deployment). For the
current punch list of open work, see the repo's GitHub issues.

## Tech stack

| Layer | What it is |
|---|---|
| Frontend | React 19 + TypeScript, built with Vite 7, styled with Tailwind CSS v4, routed with React Router v7 (hash routing, e.g. `/#/learner`) |
| Offline data | A real IndexedDB-backed sync engine (`src/sync/`) — device identity, a local event outbox, and retry/lease mechanics; never falls back to `localStorage` for identity or records |
| PWA | Installable Web App Manifest (`public/manifest.webmanifest`) + a built service worker |
| Backend | Node.js (`packages/server`) — a small custom HTTP server and router, no framework. `MemoryStore` for local dev/CI (data lost on restart); `PgStore` (PostgreSQL) in production, selected automatically by whether `DATABASE_URL` is set |
| Shared logic | Three framework-free packages consumed by both frontend and backend: `packages/contract` (sync event types and API shapes), `packages/content` (module schema, validator, and importer), `packages/analytics` (scoring, active time, trainer reports) |
| Testing | Vitest + Testing Library for unit/component tests; Playwright + `@axe-core/playwright` for mobile-viewport, accessibility, and visual-regression tests; Node's built-in test runner for the sync engine and the three shared packages |
| Hosting | Render — two auto-deployed services (frontend static site, backend API), redeploying on every push to `main`. Self-hostable via `docker-compose.yml` (API + PostgreSQL + optional Caddy for HTTPS) |

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how these pieces fit together and why.

## Project layout

```text
src/
  app/                 App shell, hash router, providers, gateway composition root
  components/          Shared learner, trainer, gamification, and UI components
  content/             Typed module fixture, template, and validation (frontend side)
  features/            Learner, trainer, staff, and system screens
  services/            Typed gateway interfaces + mock adapters + the real API/DDIL adapters
  sync/                The real offline-first engine: IndexedDB stores, sync protocol, transport
  types/               Content, learning, staff, and trainer contracts
  utils/               UI-safe gamification helpers
packages/
  contract/            Sync contract: event types, validation, API shapes (shared by phone and server)
  content/              Canonical module schema, validator, and CLI importer (JSON, CSV, Kahoot .xlsx)
  analytics/            Scoring engine, active-time calculator, trainer report
  server/               The API: enrollment, sync, staff administration, reporting, export
content/modules/        Seed modules loaded into an empty database on first server start
prototypes/              block-the-threat: a standalone, un-integrated playable game prototype
                         built from content/modules (see its own README) — real and still kept
                         buildable by scripts/test-all.sh, but explicitly "trial run, not adopted"
tests/                  DDIL/sync unit tests, browser-driven device tests, cross-service integration tests
e2e/                    Playwright mobile, accessibility, and visual tests
.github/workflows/      CI — see Build, test, and maintain
public/                 Brand assets, manifest, and PWA icon
docs/                   Historical frontend handoff/integration notes (see Documentation map below)
```

## Install and run locally

Requires Node 22.18+.

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. With no further setup, every
gateway runs in **mock mode**: a learner can sign up with the demo
setup code `DEMO-2026` at `/#/learner`, and staff can sign in at
`/#/staff/sign-in` with username `demo`, `admin`, or `trainer` and
password `demo-password-123` (role-matched fixture accounts). Nothing
here talks to a real server or persists past the browser session.

### Running against a real backend

Start the API locally (in-memory store, no database needed):

```bash
cd packages/server
npm run start
```

Then point the frontend at it:

```bash
cp .env.example .env.local   # gitignored
# set VITE_TETHERLESS_API_BASE_URL=http://localhost:8080
npm run dev
```

Leaving `VITE_TETHERLESS_API_BASE_URL` unset keeps every gateway in
mock mode — this is the only switch between the two.

### Self-hosting with PostgreSQL

```bash
cp .env.example .env    # fill in POSTGRES_PASSWORD at minimum
docker compose up -d --build
# add --profile https for a public domain with automatic HTTPS (needs API_DOMAIN)
docker compose exec -T api node packages/server/src/admin.ts create-staff \
  --role superadmin --username marc --name "Marc" <<< 'a-long-password'
```

The server applies its own PostgreSQL migrations on startup and seeds
`content/modules/` into an empty database — after that, modules are
published and versioned only through the staff API (see below).

## Use

- **Learner** — `/#/learner` to set up a device, then the mission
  library, mission play, results, remediation, and settings.
- **Staff** — `/#/staff/sign-in`. Role (superadmin / admin / trainer)
  determines what's visible: cohorts and learner records, content
  upload/versioning, assignments, staff accounts, role permissions,
  and score thresholds, each independently gated by permission, not
  role name (see [`ARCHITECTURE.md`](./ARCHITECTURE.md#permissions)).
- **Trainer reporting** — reached from the staff shell: per-cohort
  student results and a per-module learner detail view.

## Build, test, and maintain

| Command | Purpose |
| --- | --- |
| `npm run build` | Type-checks (`tsc -b`) and builds the production frontend bundle. |
| `npm test` | Frontend unit/component tests (Vitest). |
| `npm run test:ddil` | The DDIL/sync engine's own Node-test suite (outside Vitest's include paths). |
| `npm run validate:content` | Validates the frontend's JSON module fixture and content rules. |
| `npm run report:spanish-coverage` | Reports Spanish Assist translation coverage (does not block an English-first draft). |
| `npm run check:bundle` | Checks the built asset size against the temporary guardrail. Run after a build. |
| `npm run check:performance` | Builds, then checks gzip JavaScript/CSS budgets (`scripts/check-performance-budget.mjs`) for mobile performance regressions. |
| `npm run test:device` | Builds, checks bundle size, and runs the full Playwright mobile-browser suite. |
| `npm run test:student-api` / `test:ddil-browser` | Browser-driven device tests (`tests/browser/`) exercising the real learner API and DDIL paths. |
| `node scripts/live-check.ts` | Smoke-tests a real deployed environment end to end. |
| `(cd packages/server && npm test)` / `npm run typecheck` | Backend unit tests and type check. |
| `(cd packages/content && npm test)` | Module schema/validator/importer tests. |
| `(cd packages/analytics && npm test)` | Scoring/reporting tests. |
| `scripts/test-all.sh` | Everything above that doesn't need a browser or a real device, in one run. |
| `scripts/backup.sh` / `scripts/restore.sh` | PostgreSQL backup/restore for a self-hosted deployment. |
| `scripts/seed-demo-cohort.mjs` | Seeds a disposable demo cohort against a running API, for manual testing. |

CI runs two real workflows:

- **`.github/workflows/integration-ci.yml`** — on the `integration`
  branch: frontend build + unit tests + DDIL tests, and the backend's
  own test suite run against *both* `MemoryStore` and a real
  PostgreSQL service container.
- **`.github/workflows/frontend-quality.yml`** (job name `quality`) —
  on every pull request: content/translation checks, the full unit
  suite, build, bundle-size and performance-budget checks, and the
  full Playwright mobile/accessibility/visual-regression suite.

`.github/workflows/ci.yml` (job name `placeholder`) is a leftover stub
from before the stack was chosen — it still runs on every PR/push to
`main` but does nothing. It's harmless (kept for branch-protection
compatibility) but should eventually be retired or replaced.

## Importing or publishing a new module

A module is a single JSON file in the app's canonical
`TetherlessModule` shape (stable module/question/choice/sector IDs,
English-first copy with optional Spanish Assist, a positive integer
`content_version`). Two ways to get there:

1. **Author directly from the template** —
   [`src/content/templates/tetherless-module.template.json`](./src/content/templates/tetherless-module.template.json)
   is a valid one-question starting point. Follow
   [`docs/CONTENT_AUTHORING_GUIDE.md`](./docs/CONTENT_AUTHORING_GUIDE.md)
   for the schema rules (note: its "not decided yet" section predates
   the real publish flow below — content publishing, assignment, and
   authorization all exist now). Run `npm run validate:content` before
   relying on a changed fixture.
2. **Convert from CSV or a Kahoot export** — `packages/content`'s CLI
   importer handles both: `node packages/content/src/cli.ts <file> [options]`
   (run `--help` for the full flag list). It writes the canonical JSON
   only when there are zero validation errors, so a broken import can
   never be published by accident.

Either way, publishing to a real environment happens through the
**staff API**, not by editing `content/modules/` (that folder is only
read once, to seed an empty database on first start):

1. Sign in to `/#/staff/sign-in` with an account that has the
   `content.create` permission (every default role has it).
2. Go to `/#/staff/content`, select the module JSON file, and step
   through Check → Preview → Publish. The server validates it with
   the same canonical validator as `npm run validate:content`.
3. Assign the newly published module to a cohort or an individual
   learner from the panel that appears after publishing, or later from
   `/#/staff/operations`.

Publishing a new `content_version` of an existing module never
changes or removes the version a learner already has an attempt
against — the server pins each attempt to the version it was started
with.

## Deployment

Render hosts two services that auto-deploy on every push to `main`:
a static frontend build and the Node API (with `DATABASE_URL` set, so
it runs on `PgStore`). There's no `render.yaml` in this repo — both
services were configured directly in the Render dashboard.

For a quick live health check: `GET /healthz` on the API returns
`{ ok: true, modules: <published module-version count> }`.

## Team

Marc Delsoin, Chris Wozniak, Naquan Mckune.

## What this does

- Runs installed, offline, in a mobile browser — no server required
  for core gameplay
- Lets an athlete complete a training module and see their score
  update with zero connectivity
- Queues performance data locally and syncs it once the device
  reconnects
- Surfaces AI-driven analysis of synced performance to RCO program
  managers

## Documentation map

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the real, current
  architecture (this file used to say "undecided"; it no longer is).
- [`ROADMAP.md`](./ROADMAP.md) — roadmap.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — contributing.
- [`SECURITY.md`](./SECURITY.md) — security policy.
- `docs/` — frontend handoff and integration notes written during the
  mock-adapter build-out (roughly 2026-10-08 through 10-30). Several
  describe a mock-only state that the real API/DDIL work has since
  superseded; treat anything there about what's "not yet built" as a
  snapshot in time, not current status. [`README_FRONTEND.md`](./README_FRONTEND.md)
  is the last of those snapshots and is kept only for history — this
  file supersedes it.
- The canonical project-management documentation (PRDs, delivery
  plans, decisions, test evidence) lives in the separate
  [Tetherless docs repository](https://github.com/PixelAndFlow/RootSync-Tetherless-Project-Docs),
  not here. Do not copy raw RCO-provided source material into this
  public repository.

## License

See [`LICENSE`](./LICENSE).
