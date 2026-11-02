# Architecture

**Status: decided and built.** This describes the real, current
architecture, not a plan. (This file used to say "undecided" with a
list of candidate stacks — that was true in early October; it no
longer is. See `README.md`'s Documentation map for where the
still-current private planning docs live.)

## How the constraints from the client brief were met

| Constraint | How |
|---|---|
| Installable PWA | Web App Manifest (`public/manifest.webmanifest`) + a built service worker |
| Fully functions offline | The DDIL sync engine (below) — no network dependency for core gameplay |
| Local data layer | Real browser IndexedDB via a hand-written store/sync layer (`src/sync/`), not a wrapper library |
| Opportunistic sync to a backend on reconnect | Built — see Sync below |
| Backend performs analysis of synced performance data | `packages/analytics` computes scoring, active time, and the trainer report from accepted events. This is rule-based today, not an LLM/ML pipeline — "AI-driven" in the product brief is a target for the analysis layer, not a claim about what's running now |
| Local push notifications | Not yet built |
| Optional webhook to Systeme.io/Zapier | Not yet built |

## The gateway boundary

React screens never call an API, IndexedDB, or a database directly.
Every screen goes through a typed gateway interface, and exactly one
place decides which implementation backs it:

```text
UI screens and providers
        |
typed gateway hooks (useOfflineLearningGateway, useTrainerDataGateway, useStaffAdminGateway)
        |
GatewayProvider
        |
mock adapters (default) — or — real adapters (DdilLearningGateway, ApiTrainerDataGateway, ApiStaffAdminGateway)
```

`src/services/gateways.ts` is that one place (`createAppGateways`).
It reads `VITE_TETHERLESS_API_BASE_URL` at startup: unset, every
gateway is a mock adapter backed by in-memory fixtures (no network,
no persistence); set, it wires up the real `ApiStaffAdminGateway` and
`DdilLearningGateway` instead. Nothing else in the app branches on
mock-vs-live — a screen that works against the mock works against the
real backend unchanged.

## Offline-first (DDIL) sync

`src/sync/` is the real implementation (not Dexie or any other
wrapper):

- `stores/idb.ts`, `stores/db.ts` — the IndexedDB schema: device
  identity/token (never `localStorage`), a local outbox of events
  queued while offline, and cached content.
- `engine/sync.ts`, `engine/lease.ts` — the sync protocol: batches
  queued events, sends them when a connection exists, and handles the
  server's per-event accept/reject response. `engine/lease.ts` prevents
  two overlapping sync attempts (e.g. a reload mid-sync) from double-
  sending the same batch.
- `gateway/ddil-gateway.ts` (`DdilLearningGateway`) — the concrete
  `OfflineLearningGateway` implementation screens actually use in live
  mode, composed in `src/services/gateways.ts`.
- `transport/http-transport.ts` — the one place that calls the server
  from the sync engine, reading the current device token from a
  mutable box `GatewayProvider` keeps current (`onTokenChange`).

A phone can complete an entire mission with the network off; the
server only ever sees it once a sync batch goes out, and the server's
own idempotency keeps a resent batch from double-counting.

## Backend

`packages/server` is a small Node.js HTTP server (`node:http` + a
custom router in `app.ts`) — no Express, no framework. `main.ts`
chooses the storage backend at startup:

- **`MemoryStore`** — in-process, data lost on restart. Used for local
  dev, demos, and most of CI.
- **`PgStore`** (PostgreSQL) — used whenever `DATABASE_URL` is set,
  including production. Applies its own migrations on connect.

`content.ts` (`ContentRegistry`) loads whatever's published in the
store into an in-memory scoring library on boot, and reloads it after
every publish/purge. On a genuinely empty database it seeds
`content/modules/` once; after that, every change to published content
goes through the staff API, never the filesystem.

## Permissions

Staff authorization is **permission-based, not role-based** — every
server route checks a specific permission (`results.view`,
`content.create`, `data.purge`, …), never a role name
(`packages/server/src/permissions.ts`). `superadmin` / `admin` /
`trainer` are just named default permission bundles, and a superadmin
can change what a role grants at runtime
(`PUT /v1/staff/roles/:role/permissions`) without a code change. The
one irreversible action, `data.purge`, is intentionally the most
restricted by default.

## Shared packages

`packages/contract`, `packages/content`, and `packages/analytics` are
plain TypeScript with no framework dependency, each independently
tested and type-checked. That's deliberate: the sync contract and
content schema are shared verbatim between the frontend bundle and the
backend process, and the scoring/reporting logic in `analytics` only
ever consumes server-accepted events, so it can't be fooled by
anything a device hasn't actually synced.

## Deployment topology

Two Render services, both auto-deploying from `main`: a static
frontend build, and the API with `DATABASE_URL` set (so it runs on
`PgStore`). No infrastructure-as-code file for this — both were set up
directly in the Render dashboard. `docker-compose.yml` is the
self-hosting path (API + PostgreSQL + an optional Caddy profile for
HTTPS on a public domain) and is real, maintained configuration, not
a discarded trial.

## Testing strategy

- **Vitest** — frontend unit/component tests, run against the mock
  gateways by default.
- **Node's built-in test runner** — `packages/contract`, `packages/content`,
  `packages/analytics`, `packages/server`, and the DDIL sync engine
  each have their own suite, independent of the frontend's test
  runner.
- **Playwright + `@axe-core/playwright`** — real mobile-viewport
  rendering, accessibility rule checks, and visual-regression
  snapshots across RCO's representative device profiles. These are
  Chromium viewport/touch simulations, not real Android/iOS
  certification.
- CI wiring for all of this is described in `README.md`'s
  "Build, test, and maintain" section.

## Privacy and source-material rules

- `docs/rco-source-private/` stays local and is ignored by Git.
- Do not add raw RCO documents, rosters, learner data, secrets, or
  `.env` files to browser assets or commits.
- UI code shows learner-friendly sync information, never raw event
  IDs, backend internals, or device implementation details.
