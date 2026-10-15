# @tetherless/server

> **Trial run, 2026-10-15.** Built to test how execution would go. Not adopted: every choice here is pending team review and may be discarded.

The Tetherless API: learner enrollment, device tokens, idempotent sync, trainer
sign-in, the trainer report and the JSON export. Endpoints and status codes are
in `../contract/openapi.yaml`.

## Run locally (no database)

```sh
cd packages/server
DEMO_TRAINER_PASSWORD='choose-a-password' node src/main.ts
```

Without `DATABASE_URL` the server keeps everything in memory (lost on restart) and
creates a trainer `demo` with that password.

## Run with PostgreSQL (Docker Compose)

From the repository root:

```sh
cp .env.example .env            # set POSTGRES_PASSWORD and CORS_ORIGINS
docker compose up -d --build
docker compose exec -T api node packages/server/src/admin.ts create-trainer --username trainer2 --name "Trainer 2" <<< 'a-long-password'
```

The server applies database migrations on start. For HTTPS on a public domain,
set `API_DOMAIN` and `TRUST_PROXY=true`, then `docker compose --profile https up -d --build`.

Backups: `scripts/backup.sh` (run daily from cron) and `scripts/restore.sh <file>`.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none (memory) | PostgreSQL connection string |
| `PORT` | 8080 | Listening port |
| `CONTENT_DIR` | `content/modules` | Published modules; restart after adding a version |
| `CORS_ORIGINS` | none | Browser origins allowed to call the API |
| `PASS_PCT` / `STRUGGLING_PCT` | 70 / 60 | Score thresholds |
| `WEAK_TOPIC_PCT` | 60 | Topic accuracy below this is weak |
| `IDLE_LIMIT_MINUTES` | 30 | Active time stops after this long without interaction |
| `TRAINER_SESSION_HOURS` | 12 | Trainer sign-in lifetime |
| `AUTH_RATE_LIMIT_PER_MINUTE` | 10 | Enrollment and login attempts per address |
| `TRUST_PROXY` | false | Use `X-Forwarded-For` behind a reverse proxy |

## Tests

```sh
node --test "test/**/*.test.ts"                        # in-memory store
TEST_DATABASE_URL=postgres://... node --test "test/**/*.test.ts"   # real PostgreSQL (needs npm install)
```
