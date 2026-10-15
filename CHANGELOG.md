# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added
- **Trial run (2026-10-15), branch `trial/2026-10-15-trial-run`, not adopted:**
- `packages/content`: canonical content schema, validator and importer
  (Kahoot .xlsx/.csv, CSV template, JSON) with versioning checks. No dependencies.
- `content/modules`: Security tools module (from RCO's bootcamp Kahoot) and a
  Phishing module, both with topics, explanations and Boss Missions (drafts
  pending RCO review).
- `prototypes/block-the-threat`: playable game prototype built from the modules.
- `packages/contract`: sync contract (event types, per-event results) and OpenAPI spec.
- `packages/analytics`: scoring engine (pass 70%, struggling below 60%), active-time
  calculator and trainer report, with a fixed test dataset.
- `packages/server`: API server with PostgreSQL storage, Docker Compose, HTTPS
  proxy profile, and backup/restore scripts.
- Initial repo scaffold: README, ROADMAP, ARCHITECTURE (undecided
  placeholder), CLAUDE.md, LICENSE, CONTRIBUTING, SECURITY, CODEOWNERS,
  issue/PR templates, CI stub, `.env.example`, `.gitignore`.
