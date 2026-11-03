# Security Policy

## Reporting a vulnerability

Please report security issues privately to the team (Marc Delsoin,
Chris Wozniak, Naquan Mckune) rather than opening a public issue.
Use GitHub's private vulnerability reporting feature on this repo
once enabled, or contact a team member directly.

## Scope

This is a live, deployed application handling real cyberathlete
training data (RAICES Cyber Organization, via Pursuit.org) — not a
prototype. Relevant to anyone reviewing its security posture:

- Staff authorization is permission-based, not role-based — every
  server route checks a specific permission
  (`packages/server/src/permissions.ts`), not a role name.
- A learner device's identity and sync token live in IndexedDB, never
  `localStorage` (see `ARCHITECTURE.md`'s Offline-first section).
- Production runs on PostgreSQL (`PgStore`) behind HTTPS (Render);
  local/CI uses an in-memory store with no persisted data.
- No real or plausible-fake secrets are committed anywhere in this
  repo's history — `.env.example` lists variable names only.

## Known gap

The private docs repo's `security/` folder (threat model, incident
response plan, dependency-vulnerability policy, secrets-rotation
runbook, pre-launch pen-test checklist) was rewritten 2026-11-03 to
reflect the real, deployed system instead of pre-kickoff placeholders.
One real gap it surfaced: GitHub Dependabot vulnerability alerts are
disabled on this repo — enable them (or run `npm audit` manually
across each package) before treating the dependency side of a
security review as covered.
