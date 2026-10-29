# Tetherless (RootSync-Tetherless-Project)

A resilient, offline-first Progressive Web Application (PWA) that
trains cyberathletes in critical thinking, rapid information
retrieval, and vocabulary affirmation — built to function entirely
in zero-connectivity (DDIL) environments, syncing performance data
and AI-driven analytics once reconnected.

Built for **RAICES Cyber Organization Inc. (RCO)** via
[Pursuit.org](https://www.pursuit.org)'s Builder program, as a
7-week MVP for Pursuit Demo Day.

## Status

In development for Pursuit Demo Day.

**Trial run (2026-10-15):** the folders below were built on branch `trial/2026-10-15-trial-run` to test execution. They are not adopted; see `TRIAL-RUN.md`.

| Path | What it is |
|---|---|
| `packages/contract` | Sync contract: event types, validation, API spec (`openapi.yaml`) |
| `packages/content` | Content format, validator and importer (Kahoot, CSV, JSON) |
| `packages/analytics` | Scoring, active time and the trainer report |
| `packages/server` | API server: enrollment, sync, trainer report and export |
| `content/modules` | Published learning modules |
| `prototypes/block-the-threat` | Playable game prototype built from the modules |
| `docker-compose.yml` | API + PostgreSQL for self-hosting |

Run every test (Node 22.18+, no install needed):

```sh
scripts/test-all.sh
```

## Team

Marc Delsoin, Chris Wozniak, Naquan Mckune.

## What this will do

- Run installed, offline, in a mobile browser — no server required
  for core gameplay
- Let an athlete complete a training module and see their score
  update with zero connectivity
- Queue performance data locally and sync it once the device
  reconnects
- Surface AI-driven analysis of synced performance to RCO program
  managers

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

See [`LICENSE`](./LICENSE).
