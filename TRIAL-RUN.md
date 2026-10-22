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

## Update, 2026-10-21: spec v1.10 (branch `trial/2026-10-21-spec-v1.10`)

The server, contract, content and analytics packages now follow the API and
Integration Spec v1.10 (draft for team review, kept in the docs repo). Still a
trial; nothing here is adopted until the team agrees.

- Setup: one-time setup code + learner-chosen username (`POST /v1/setup`)
  replaces enrollment codes. Usernames are display names and may repeat; each
  learner also gets a `learner_code` (cohort name + 4 characters).
- Staff: Superadmin, Admin and Trainer roles with permissions stored in the
  database and editable by the Superadmin. All dashboard routes are under
  `/v1/staff/`.
- Learners: staff-entered details (names, phone, email, training level, two
  notes), never sent to phones; roster import from .csv or .xlsx with a check
  step before anything is saved.
- Modules: the app's module format (`TetherlessModule`) is the upload format;
  published versions never change, a change publishes the next version.
  Assignments to a cohort or one learner; `GET /v1/me/modules` for phones.
- Sync accepts the phone's own scores and uppercase choice IDs and stores
  them; scores are still recalculated on the server.
- Nothing is deleted except by the Superadmin's audited purge; everything else
  archives.

## Note

2026-10-19: no other changes, this commit exists to test whether the
Slack `#rootsync-builds` push notification fires for an update to an
*existing* branch (as opposed to the branch's first, branch-creating push).

**Resolved (2026-10-20):** it does. The Slack GitHub app doesn't notify on
the push that creates a branch, only on later pushes to one that already
exists — not a broken or misconfigured subscription.
