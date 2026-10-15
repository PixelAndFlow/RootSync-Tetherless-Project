# Trial run, 2026-10-15

This branch (`trial/2026-10-15-trial-run`) is a trial of execution: build the
pieces that didn't depend on open decisions, using working assumptions, to see
what comes up. Nothing here is adopted. The team decides what, if anything, to
keep.

What was built:

- `packages/contract`: sync contract and API spec
- `packages/content`: content format, validator and importer
- `packages/analytics`: scoring, active time, trainer report
- `packages/server`: API server with PostgreSQL storage
- `content/modules`: two draft modules
- `prototypes/block-the-threat`: game prototype
- `docker-compose.yml`, `deploy/`, `scripts/`: self-hosting and backups

Every value and rule in this code (thresholds, event fields, scoring
definitions, game tuning) is a trial assumption, not a decision.
