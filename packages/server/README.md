# @tetherless/server

> **Trial run, updated 2026-10-21 to the API and Integration Spec v1.10 (draft for team review).** Not adopted: every choice here is pending team review and may be discarded.

The Tetherless API: one-time setup codes and device tokens, idempotent sync,
assigned modules, staff sign-in with role permissions (Superadmin, Admin,
Trainer), cohorts, learners and roster import (.csv/.xlsx), module publishing
with versions, assignments, reports, thresholds, archive and audited purge, and
the JSON export. Endpoints and status codes are in `../contract/openapi.yaml`.

Code map: `app.ts` (learner routes), `staff-routes.ts` (everything under
`/v1/staff/`), `permissions.ts` (roles and default permissions), `learners.ts`,
`roster.ts`, `content.ts` (published modules), `ingest.ts` (sync),
`store.ts` / `memory-store.ts` / `pg-store.ts` (storage), `db/` (migrations).

## Run locally (no database)

```sh
cd packages/server
DEMO_STAFF_PASSWORD='choose-a-long-password' node src/main.ts
```

Without `DATABASE_URL` the server keeps everything in memory (lost on restart) and
creates a Superadmin `demo` with that password. On first start the modules in
`content/modules` are published as version 1 if no modules exist yet.

## Run with PostgreSQL (Docker Compose)

From the repository root:

```sh
cp .env.example .env            # set POSTGRES_PASSWORD and CORS_ORIGINS
docker compose up -d --build
docker compose exec -T api node packages/server/src/admin.ts create-staff --role superadmin --username marc --name "Marc" <<< 'a-long-password'
```

The server applies database migrations on start (`db/schema.sql`, then
`db/002-spec-v1.10.sql`, which upgrades a trial database: trainers become staff
with the Trainer role, names split into first and last, learner codes added).
Further staff accounts are created in the dashboard (`POST /v1/staff/accounts`)
and must change their temporary password on first sign-in. For HTTPS on a public domain,
set `API_DOMAIN` and `TRUST_PROXY=true`, then `docker compose --profile https up -d --build`.

Backups: `scripts/backup.sh` (run daily from cron) and `scripts/restore.sh <file>`.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none (memory) | PostgreSQL connection string |
| `PORT` | 8080 | Listening port |
| `CONTENT_DIR` | `content/modules` | Seed modules, published only when the database has none. New versions go through `POST /v1/staff/modules` |
| `CORS_ORIGINS` | none | Browser origins allowed to call the API |
| `PASS_PCT` / `STRUGGLING_PCT` | 70 / 60 | Starting thresholds; staff with `settings.manage` can change them |
| `WEAK_TOPIC_PCT` | 60 | Topic accuracy below this is weak |
| `IDLE_LIMIT_MINUTES` | 30 | Active time stops after this long without interaction |
| `STAFF_SESSION_HOURS` | 12 | Staff sign-in lifetime (`TRAINER_SESSION_HOURS` still read) |
| `AUTH_RATE_LIMIT_PER_MINUTE` | 10 | Setup and sign-in attempts per address |
| `TRUST_PROXY` | false | Use `X-Forwarded-For` behind a reverse proxy |

## Tests

```sh
node --test "test/**/*.test.ts"                        # in-memory store
TEST_DATABASE_URL=postgres://... node --test "test/**/*.test.ts"   # real PostgreSQL (needs npm install)
TEST_PSQL_HOST=/path/to/socket node --test "test/**/*.test.ts"     # real PostgreSQL through psql, no npm install
```
